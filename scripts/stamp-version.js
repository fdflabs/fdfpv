/*
 * stamp-version.js: give one deploy's modules URLs no other deploy shares.
 *
 * GitHub Pages serves every file with `cache-control: max-age=600` and
 * ignores the query string. A tab left open across deploys, or a reload
 * inside those ten minutes, used to run a mix: modules already in the HTTP
 * cache from the old deploy beside modules fetched fresh from the new one.
 * That is how a picker showed a removed aircraft's name over another one's
 * description, and how the bug form posted to an address that had moved.
 *
 * So the Pages workflow runs this over the staged site. For each shell page
 * it walks the module graph from the page's entry script and adds one import
 * map entry per local module, mapping `./src/x.js` to `./src/x.js?v=<version>`.
 * Import maps match URL-like specifiers after resolution, so every relative
 * import in every module lands on the versioned URL, and a module's own
 * imports resolve against that URL and are mapped again. The entry script's
 * src gets the same query, the page gets a <meta name="fdfpv-version">, and
 * the site root gets version.json, which src/ui/update.js polls, and sw.js
 * gets the version and a content hash of every other file (see sw.js).
 *
 * The walk is also the check. A local import the walk cannot follow, a bare
 * specifier the page's import map does not name, or a module missing from
 * the staged site stops the deploy, because each is a module that would load
 * outside the version. npm run version:check runs the same walk in CI.
 *
 * Usage: node scripts/stamp-version.js <site dir> <version>
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

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The pages the shell shows. The orbit preview is its own document in an
 * iframe on the map cards, with its own module graph. */
export const SHELL_PAGES = ['index.html', 'src/share/orbit.html'];

const IMPORT_MAP = /<script type="importmap">([\s\S]*?)<\/script>/g;
const ENTRY = /<script type="module" src="([^"]+)"><\/script>/g;

/* Source with comments blanked and strings kept, so an import named in a
 * comment is not an edge. Same scanner as the noun lint: quotes and
 * comments only, which is enough for this tree's import statements. */
function code(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        j += src[j] === '\\' ? 2 : 1;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
      out += ' ';
    } else if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/*
 * Every specifier a module imports, static or dynamic. A dynamic import of
 * a template is kept as the template; any other expression is refused,
 * because nothing can say which module it names.
 */
export function specifiers(src, file) {
  const body = code(src);
  const out = [];
  for (const m of body.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?(['"])([^'"]+)\1/g)) {
    out.push(m[2]);
  }
  for (const m of body.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)) {
    const arg = m[1].trim();
    const lit = /^(['"])([^'"]+)\1$/.exec(arg);
    if (lit) {
      out.push(lit[2]);
    } else if (/^`[^`]*`$/.test(arg)) {
      out.push(arg);
    } else {
      throw new Error(`${file}: import(${arg}) names no module the stamp can follow`);
    }
  }
  return out;
}

function bareMapped(imports, spec) {
  return Object.hasOwn(imports, spec)
    || Object.keys(imports).some((k) => k.endsWith('/') && spec.startsWith(k));
}

/*
 * The local modules reachable from `entry` (a site relative path), as site
 * relative posix paths. `imports` is the page's own import map, which is
 * where bare specifiers must be answered.
 */
export function moduleGraph(siteDir, entry, imports) {
  const seen = new Set();
  const todo = [entry];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) {
      continue;
    }
    const path = join(siteDir, file);
    if (!existsSync(path)) {
      throw new Error(`${file} is imported but is not in the site`);
    }
    seen.add(file);
    const dir = posix.dirname(file);
    for (const spec of specifiers(readFileSync(path, 'utf8'), file)) {
      if (spec.startsWith('`')) {
        /* `./dir/${x}.js`: every file in that folder with that ending. */
        const t = /^`(\.\.?\/(?:[^`$]*\/)?)?\$\{[^}]*\}([^`/$]*)`$/.exec(spec);
        if (!t || !t[1]) {
          throw new Error(`${file}: import(${spec}) is not a folder and a name the stamp can list`);
        }
        const folder = posix.join(dir, t[1]);
        for (const name of readdirSync(join(siteDir, folder))) {
          if (name.endsWith(t[2]) && name.endsWith('.js')) {
            todo.push(posix.join(folder, name));
          }
        }
      } else if (spec.startsWith('./') || spec.startsWith('../')) {
        todo.push(posix.normalize(posix.join(dir, spec)));
      } else if (!bareMapped(imports, spec)) {
        throw new Error(`${file}: '${spec}' is neither relative nor in the page's import map`);
      }
    }
  }
  return [...seen].sort();
}

function relativeTo(pageDir, file) {
  const rel = posix.relative(pageDir, file);
  return rel.startsWith('../') ? rel : `./${rel}`;
}

/*
 * The page's HTML with its import map carrying every module of its graph at
 * `?v=<version>`, its entry script the same, and the version in a meta tag.
 * Returns { html, modules }.
 */
export function stampPage(siteDir, page, version) {
  if (!/^[A-Za-z0-9._-]+$/.test(version)) {
    throw new Error(`version '${version}' is not safe in a URL`);
  }
  const html = readFileSync(join(siteDir, page), 'utf8');
  if (html.includes('name="fdfpv-version"')) {
    throw new Error(`${page} is already stamped`);
  }
  const maps = [...html.matchAll(IMPORT_MAP)];
  const entries = [...html.matchAll(ENTRY)];
  if (maps.length !== 1 || entries.length !== 1) {
    throw new Error(`${page}: wants one import map and one module script, has ${maps.length} and ${entries.length}`);
  }
  const map = JSON.parse(maps[0][1]);
  const pageDir = posix.dirname(page);
  const entrySrc = entries[0][1];
  const modules = moduleGraph(siteDir, posix.normalize(posix.join(pageDir, entrySrc)), map.imports);
  for (const file of modules) {
    const key = relativeTo(pageDir, file);
    if (Object.hasOwn(map.imports, key)) {
      throw new Error(`${page}: the import map already names ${key}`);
    }
    map.imports[key] = `${key}?v=${version}`;
  }
  const stamped = html
    .replace(maps[0][0], `<meta name="fdfpv-version" content="${version}" />\n    <script type="importmap">\n${JSON.stringify(map, null, 2)}\n    </script>`)
    .replace(entries[0][0], `<script type="module" src="${entrySrc}?v=${version}"></script>`);
  return { html: stamped, modules };
}

/* Every file a page fetches at a bare path, by its content: the shell
 * pages are left out because sw.js asks the network for them first, and
 * version.json and sw.js because the worker never answers for them. */
function assetHashes(siteDir, dir = '', out = {}) {
  for (const ent of readdirSync(join(siteDir, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      assetHashes(siteDir, rel, out);
    } else if (ent.isFile() && !rel.endsWith('.html') && rel !== 'version.json' && rel !== 'sw.js') {
      out[rel] = createHash('sha256').update(readFileSync(join(siteDir, rel))).digest('hex').slice(0, 16);
    }
  }
  return out;
}

/* sw.js with VERSION and ASSETS filled in. Returns { js, assets }. */
export function stampWorker(siteDir, version) {
  const src = readFileSync(join(siteDir, 'sw.js'), 'utf8');
  const assets = assetHashes(siteDir);
  const sorted = Object.fromEntries(Object.entries(assets).sort(([a], [b]) => (a < b ? -1 : 1)));
  let js = src;
  for (const [line, value] of [["const VERSION = 'dev';", `const VERSION = ${JSON.stringify(version)};`],
    ['const ASSETS = {};', `const ASSETS = ${JSON.stringify(sorted)};`]]) {
    if (js.split(line).length !== 2) {
      throw new Error(`sw.js: wants exactly one "${line}" to stamp`);
    }
    js = js.replace(line, () => value);
  }
  return { js, assets: Object.keys(sorted).length };
}

export function stampSite(siteDir, version) {
  const out = {};
  for (const page of SHELL_PAGES) {
    const { html, modules } = stampPage(siteDir, page, version);
    writeFileSync(join(siteDir, page), html);
    out[page] = modules.length;
  }
  const worker = stampWorker(siteDir, version);
  writeFileSync(join(siteDir, 'sw.js'), worker.js);
  out['sw.js'] = worker.assets;
  writeFileSync(join(siteDir, 'version.json'), `${JSON.stringify({ version })}\n`);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [siteDir, version] = process.argv.slice(2);
  if (!siteDir || !version) {
    console.error('usage: node scripts/stamp-version.js <site dir> <version>');
    process.exit(2);
  }
  const counts = stampSite(siteDir, version);
  for (const [page, n] of Object.entries(counts)) {
    console.log(page === 'sw.js' ? `sw.js: ${n} assets by content hash` : `${page}: ${n} modules at ?v=${version}`);
  }
}
