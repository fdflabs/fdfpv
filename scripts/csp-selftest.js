/*
 * csp-selftest.js: the deployed Content-Security-Policy (scripts/csp.js),
 * in plain Node. npm run csp:selftest, in CI.
 *
 * On a copy of the policy pages stamped as the Pages workflow stamps them
 * (scripts/stamp-version.js, then scripts/csp.js): every page carries
 * exactly one policy meta, first in its head after the charset; every
 * inline script of the page, the stamped import map included, is allowed
 * by its hash and nothing else inline is; no loopback source leaks into
 * the deployed policy; and the directives a meta tag cannot carry are not
 * in it (a browser would ignore them and warn).
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

import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { POLICY_PAGES, applyPolicies, inlineHashes } from './csp.js';
import { stampSite } from './stamp-version.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

console.log('the hashes');
const fixture = '<script type="importmap">{"imports":{}}</script><script src="x.js"></script><script type="module">go()</script>';
const hashes = inlineHashes(fixture);
check('one per inline script, none for a src script', hashes.length === 2, hashes.join(' '));
/* printf '%s' '{"imports":{}}' | openssl dgst -sha256 -binary | base64 */
check('sha256 of the body, base64', hashes[0] === "'sha256-URrTy+Il/Nz0lHojVUx275hWqAWhkSF0VsHbUM4/6Hw='", hashes[0]);

console.log('the stamped site');
const site = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'fdfpv-csp-'));
try {
  /* The tree without what neither the stamp nor the policy reads. */
  const SKIP = new Set(['.git', 'node_modules', 'vendor', 'build', 'assets', 'tmp', 'tracks', '.claude']);
  cpSync(root, site, { recursive: true, filter: (src) => !SKIP.has(src.slice(root.length + 1).split('/')[0]) });
  stampSite(site, '0123456789ab');
  applyPolicies(site);
  for (const page of POLICY_PAGES) {
    const html = readFileSync(join(site, page), 'utf8');
    const metas = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)" \/>/g) || [];
    const policy = metas.length ? /content="([^"]*)"/.exec(metas[0])[1].replace(/&quot;/g, '"') : '';
    const before = html.slice(0, html.indexOf('<meta http-equiv="Content-Security-Policy"'));
    check(`${page}: one policy, right after the charset`, metas.length === 1 && /<meta charset="utf-8"\s*\/?>\s*$/i.test(before));
    const scriptSrc = (/script-src ([^;]*)/.exec(policy) || [])[1] || '';
    const allowed = scriptSrc.split(' ').filter((s) => s.startsWith("'sha256-"));
    const wanted = inlineHashes(html);
    check(`${page}: its ${wanted.length} inline scripts and no others are allowed`,
      wanted.length === allowed.length && wanted.every((h) => allowed.includes(h)), `${allowed.length} allowed`);
    check(`${page}: no loopback source, no 'unsafe-eval', no unsafe-inline script`,
      !/127\.0\.0\.1|localhost/.test(policy) && !/'unsafe-eval'/.test(policy) && !scriptSrc.includes("'unsafe-inline'"));
    check(`${page}: nothing a meta cannot carry`, !/frame-ancestors|report-uri|report-to|sandbox/.test(policy));
  }
} finally {
  rmSync(site, { recursive: true, force: true });
}

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
