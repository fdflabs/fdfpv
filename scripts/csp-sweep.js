/*
 * csp-sweep.js: the browser checks that reach every kind of request the
 * pages make, run under the deployed Content-Security-Policy (scripts/csp.js)
 * sent as a header by the checks' server, and every violation they meet.
 *
 *   npm run csp:report    the policy Report-Only: what it WOULD block
 *   npm run csp:enforce   the policy enforced: nothing blocked, every check green
 *
 * The checks, each a real flow with a real pointer, on loopback servers:
 *   gallery-check.js        the game page, the hangar, the tracks API's
 *                           liveries and their pictures, publishing
 *   gallery-admin-check.js  admin.html against the tracks server
 *   rooms-two-page.js       two pilots in a room over WebSocket, flying
 *   voicechat-two-page.js   WebRTC voice between them, the rooms server's
 *                           signalling and TURN credentials
 *   and the static pages: landing, privacy, terms, the films page, each
 *   loaded and held for a few seconds.
 * Google sign in and the Yellowstone tiles are not reached from loopback;
 * their sources follow Google's and our own documented hosts.
 *
 * A violation fails the sweep in either mode, and so does a check that
 * fails, so the enforce run is the proof the pages still work.
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

import { spawn } from 'node:child_process';
import { cpSync, symlinkSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { applyPolicies } from './csp.js';
import { stampSite } from './stamp-version.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MODE = process.env.SIM_CSP;
if (!['report', 'enforce'].includes(MODE)) {
  console.error('run as npm run csp:report or npm run csp:enforce (SIM_CSP=report|enforce)');
  process.exit(2);
}

const violations = new Map();
function note(source, text) {
  for (const line of text.split('\n')) {
    const m = /csp-violation: (.*)$/.exec(line);
    if (m) {
      violations.set(m[1], [...(violations.get(m[1]) || []), source]);
    }
  }
}

/* One check as its own process, its output passed through. */
function runCheck(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, 'scripts', script), ...args], { env: process.env });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('exit', (code) => {
      note(script, out);
      resolve(code);
    });
  });
}

const scratch = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'fdfpv-csp-'));
const rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const roomsOrigin = `http://127.0.0.1:${rooms.port}`;
const outcomes = [];
try {
  /* The control: a script the policy does not allow, put into the game's
   * page by hand. If this is not reported, the sweep cannot see anything
   * and its zero would mean nothing. */
  console.log('\n== the control: an inline script the policy does not name');
  const control = await openPage({ root, url: '/index.html' });
  try {
    await control.until("document.readyState === 'complete'", 120000);
    await control.evaluate("document.head.append(Object.assign(document.createElement('script'), { textContent: 'window.__cspControl = 1' })); true");
    await control.sleep(1000);
  } finally {
    const seen = control.errors.filter((e) => e.includes('CSP violation: ') && e.includes('script-src'));
    await control.close();
    console.log(`  ${seen.length ? 'pass' : 'FAIL'}  the injected script is reported  (${seen.length})`);
    outcomes.push(['the control', seen.length ? 0 : 1]);
  }
  for (const [script, args] of [
    ['gallery-check.js', [join(scratch, 'gallery')]],
    ['gallery-admin-check.js', []],
    ['rooms-two-page.js', [roomsOrigin, join(scratch, 'rooms')]],
    ['voicechat-two-page.js', [roomsOrigin]],
  ]) {
    console.log(`\n== ${script} (SIM_CSP=${MODE})`);
    outcomes.push([script, await runCheck(script, args)]);
  }
  /* The policy as deployed: a meta tag in a stamped copy (stamp-version.js,
   * then csp.js, as pages.yml runs them). The header above says what the
   * policy allows; this says the meta carries it, the import map's hash
   * included, from boot to flight. */
  console.log('\n== the deployed meta: a stamped copy boots and flies');
  const staged = join(scratch, 'site');
  const SKIP = new Set(['.git', 'node_modules', 'vendor', 'build', 'assets', 'tmp', 'tracks', '.claude']);
  cpSync(root, staged, { recursive: true, filter: (src) => !SKIP.has(src.slice(root.length + 1).split('/')[0]) });
  symlinkSync(join(root, 'assets'), join(staged, 'assets'));
  stampSite(staged, '0123456789ab');
  applyPolicies(staged);
  const meta = await openPage({ root: staged, url: '/index.html' });
  let flew = false;
  try {
    await meta.until('window.__shellReady === true', 300000);
    flew = await meta.evaluate("!!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')");
    await meta.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await meta.until("window.__craftState && window.__craftState().mode === 'flight'", 300000);
    await meta.sleep(2000);
  } catch (e) {
    flew = false;
    console.log(`  ${e.message}`);
  }
  /* The deployed meta names the API's origin, not the checks' loopback
   * servers, so a page served from loopback that reaches for a local board
   * or tracks server is refused by design here; anything else is a
   * finding. */
  const local = /blocked https?:\/\/127\.0\.0\.1:/;
  const metaHits = meta.errors.filter((e) => e.includes('CSP violation: '));
  console.log(`  ${metaHits.filter((e) => local.test(e)).length} loopback requests refused by the deployed meta, as expected`);
  note('stamped index.html', metaHits.filter((e) => !local.test(e)).map((e) => `csp-violation: ${e.slice(e.indexOf('CSP violation: ') + 15)}`).join('\n'));
  await meta.close();
  console.log(`  ${flew ? 'pass' : 'FAIL'}  the stamped page carries the meta and reaches a flight`);
  outcomes.push(['the deployed meta', flew ? 0 : 1]);

  for (const url of ['/landing.html', '/privacy.html', '/terms.html', '/vids/index.html']) {
    console.log(`\n== ${url}`);
    const page = await openPage({ root, url });
    let loaded = true;
    try {
      await page.until("document.readyState === 'complete'", 60000);
      await page.sleep(3000);
    } catch (e) {
      loaded = false;
    }
    const errors = page.errors.join('\n');
    await page.close();
    note(url, errors.split('\n').map((e) => (e.includes('CSP violation: ') ? `csp-violation: ${e.slice(e.indexOf('CSP violation: ') + 15)}` : '')).join('\n'));
    outcomes.push([url, loaded ? 0 : 1]);
  }
} finally {
  await rooms.stop();
  await rm(scratch, { recursive: true, force: true });
}

console.log(`\nsummary (SIM_CSP=${MODE})`);
for (const [name, code] of outcomes) {
  console.log(`  ${code === 0 ? 'pass' : 'FAIL'}  ${name}${code ? `  (exit ${code})` : ''}`);
}
console.log(`  ${violations.size} distinct violations${violations.size ? ':' : ''}`);
for (const [v, where] of violations) {
  console.log(`    ${v}  [${[...new Set(where)].join(', ')}]`);
}
const failed = outcomes.filter(([, code]) => code !== 0).length + violations.size;
process.exit(failed ? 1 : 0);
