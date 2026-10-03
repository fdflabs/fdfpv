/*
 * base-path-check.js: the shell loads at a domain's root and under /fdfpv/.
 *
 *     node scripts/base-path-check.js      (npm run base:check)
 *
 * The game moved from https://fdflabs.github.io/fdfpv/ to the root of its
 * own domain, and the old address keeps working while guests are carried
 * across (DEPLOY.md, The move to the game's own domain). Every URL the
 * shell asks for has to resolve against the page, never against a fixed
 * prefix, or one of the two breaks. This serves the checkout twice, once
 * at / and once under /fdfpv/ (a directory holding a link to it), opens
 * each in headless Chromium until the loading screen is gone, and holds
 * that every request the page made to its own server stayed under its
 * mount and was answered, and that nothing threw.
 *
 * Local, not in CI: it drives Chromium for a minute or two.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const LOAD_MS = 180000;

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

/* The board is not running here, at either mount, so its refused
 * connection is the one network error both runs share. */
const BOARD_DOWN = /127\.0\.0\.1:3180|ERR_CONNECTION_REFUSED/;

async function run(mount, serveDir) {
  console.log(`the shell at ${mount}`);
  /* Chromium keeps 250 resource entries by default and the shell makes
   * more than that before its loading screen goes. */
  const page = await openPage({ root: serveDir, url: `${mount}index.html`, seed: ['performance.setResourceTimingBufferSize(10000);'] });
  try {
    let shown = true;
    try {
      await page.loaded(LOAD_MS);
    } catch (e) {
      shown = false;
    }
    check(`${mount}: the loading screen finishes`, shown);
    const own = await page.evaluate(`JSON.stringify(performance.getEntriesByType('resource')
      .filter((r) => r.name.startsWith(location.origin))
      .map((r) => ({ path: new URL(r.name).pathname, status: r.responseStatus })))`);
    const requests = JSON.parse(own);
    const outside = requests.filter((r) => !r.path.startsWith(mount));
    const refused = requests.filter((r) => r.status >= 400);
    check(`${mount}: ${requests.length} requests to its own server, every one under ${mount}`,
      requests.length > 20 && outside.length === 0, outside.slice(0, 5).map((r) => r.path).join(' '));
    check(`${mount}: every one answered`, refused.length === 0,
      refused.slice(0, 5).map((r) => `${r.status} ${r.path}`).join(' '));
    const wasm = requests.some((r) => r.path === `${mount}dist/sim.wasm`);
    check(`${mount}: the flight model came from ${mount}dist/sim.wasm`, wasm);
    const errors = page.errors.filter((e) => !BOARD_DOWN.test(String(e)));
    check(`${mount}: nothing thrown or logged as an error`, errors.length === 0, errors.slice(0, 5).join(' | '));
  } finally {
    await page.close();
  }
}

const nest = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'base-path-'));
try {
  symlinkSync(root, join(nest, 'fdfpv'), 'dir');
  /* One browser at a time: the host runs other checks beside this one. */
  await run('/', root);
  await run('/fdfpv/', nest);
} finally {
  rmSync(nest, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
