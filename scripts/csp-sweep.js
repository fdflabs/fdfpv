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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';

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
  for (const [script, args] of [
    ['gallery-check.js', [join(scratch, 'gallery')]],
    ['gallery-admin-check.js', []],
    ['rooms-two-page.js', [roomsOrigin, join(scratch, 'rooms')]],
    ['voicechat-two-page.js', [roomsOrigin]],
  ]) {
    console.log(`\n== ${script} (SIM_CSP=${MODE})`);
    outcomes.push([script, await runCheck(script, args)]);
  }
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
