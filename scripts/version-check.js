/*
 * version-check.js: every module the shell pages import goes through the
 * version stamp. Plain Node, no browser. Run with npm run version:check.
 *
 * Stamps index.html and the orbit page in memory with the same code the
 * Pages workflow runs (scripts/stamp-version.js), then resolves every import
 * of every module in each page's graph the way a browser does, as a URL
 * against the importing module's own versioned URL, and requires the import
 * map to name the result. An import that misses the map loads at a URL no
 * deploy owns, which is the mixing this exists to stop. The parser's own
 * edges are pinned by a few fixtures, because a walk that silently drops an
 * import form would pass everything else here.
 *
 * The stamp is walked over the checkout, not the staged site, so a module
 * the workflow's rsync leaves out is caught at deploy time instead, where
 * stamp-version.js refuses a module that is not in the site.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHELL_PAGES, specifiers, stampPage } from './stamp-version.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const VERSION = '0123456789ab';
const SITE = 'https://example.test/fdfpv/';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

console.log('the parser');
const fixture = [
  "import { a,\n  b as c } from './multi.js';",
  "import './side.js';",
  "export * from '../up.js';",
  "import d, { e } from \"./double.js\";",
  "const f = await import('./lazy.js');",
  'const g = await import(`./locale/${id}.js`);',
  "/* import('./commented.js') */",
  "// import x from './line-comment.js';",
  "import * as THREE from 'three';",
].join('\n');
const got = specifiers(fixture, 'fixture.js');
check('reads static, side effect, re-export, dynamic and template imports',
  JSON.stringify(got) === JSON.stringify(['./multi.js', './side.js', '../up.js', './double.js', 'three', './lazy.js', '`./locale/${id}.js`']),
  JSON.stringify(got));
let threw = '';
try {
  specifiers('const m = await import(name);', 'fixture.js');
} catch (e) {
  threw = e.message;
}
check('refuses an import it cannot name', /names no module/.test(threw), threw);

for (const page of SHELL_PAGES) {
  console.log(page);
  const before = readFileSync(join(root, page), 'utf8');
  check('the checkout is not stamped', !before.includes('fdfpv-version') && !/\?v=/.test(before));
  const { html, modules } = stampPage(root, page, VERSION);
  const pageUrl = new URL(page, SITE);
  check('the page carries its version', html.includes(`<meta name="fdfpv-version" content="${VERSION}" />`));
  const entry = /<script type="module" src="([^"]+)"><\/script>/.exec(html);
  check('the entry script is versioned', Boolean(entry) && entry[1].endsWith(`?v=${VERSION}`), entry && entry[1]);
  const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
  const mapped = new Map(Object.entries(map).map(([k, v]) => [new URL(k, pageUrl).href, new URL(v, pageUrl).href]));
  check(`the map names ${modules.length} modules`, modules.length > 1 && modules.every((m) => mapped.get(new URL(m, SITE).href) === `${new URL(m, SITE).href}?v=${VERSION}`));

  const misses = [];
  let edges = 0;
  for (const m of modules) {
    const self = mapped.get(new URL(m, SITE).href);
    for (const spec of specifiers(readFileSync(join(root, m), 'utf8'), m)) {
      if (!spec.startsWith('.')) {
        continue;
      }
      edges += 1;
      if (!mapped.has(new URL(spec, self).href)) {
        misses.push(`${m} -> ${spec}`);
      }
    }
  }
  check(`every one of ${edges} relative imports resolves to a mapped URL`, misses.length === 0, misses.slice(0, 3).join(', '));
  const entryUrl = new URL(entry[1], pageUrl).href;
  check('the entry module is in the graph', [...mapped.values()].includes(entryUrl), entryUrl);
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
