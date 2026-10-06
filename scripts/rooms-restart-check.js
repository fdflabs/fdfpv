/*
 * rooms-restart-check.js: what two pilots see when their room's Durable
 * Object is restarted under them. Cloudflare restarts every object of a
 * Worker, dropping each socket with 1006, when the Worker is deployed and
 * when a `wrangler tail` session attaches to it or leaves; that was the
 * "both sockets dropped a few seconds in" seen on the deployed Worker on
 * 2026-09-28. The pages must find their way back on their own.
 *
 *   SIM_GPU=1 node scripts/rooms-restart-check.js <rooms origin> "<command that restarts the room>"
 *
 * Two headless pages join one room and fly; the command runs (a deploy or
 * a timed `wrangler tail`, given by the caller, who holds the token); then
 * each page must be back in the room, in a seat, drawing the other again.
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
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2];
const restart = process.argv[3];
if (!rooms || !restart) {
  console.log('usage: node scripts/rooms-restart-check.js <rooms origin> "<restart command>"');
  process.exit(2);
}

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { map: 'swiss2', freestyleMap: 'swiss2', graphics: 'low', fpsCap: 0, airframeAsked: true });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused */ }`];
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
const a = await openPage({ root, url, width: 960, height: 540, seed });
const b = await openPage({ root, url, width: 960, height: 540, seed });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1", 30000);
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of [a, b]) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight' && window.__rooms().peers[0].drawn", 400000);
  }
  check('both in the room and drawing each other', true, code);
  const phases = [];
  const watch = setInterval(async () => {
    try {
      phases.push(await a.evaluate('window.__rooms().phase'));
    } catch (e) {
      /* the page is busy */
    }
  }, 250);
  const t0 = Date.now();
  /* Not spawnSync: the watch above must keep sampling while it runs. */
  const status = await new Promise((done) => spawn('bash', ['-c', restart], { stdio: 'inherit' }).on('exit', done));
  console.log(`  restart command exit ${status} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  /* A deploy's restart reaches the object some seconds after the command
   * returns: wait for the drop before waiting for the way back. */
  const until = Date.now() + 60000;
  while (!phases.includes('connecting') && Date.now() < until) {
    await a.sleep(250);
  }
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().peers[0].drawn", 60000).catch(() => {});
  }
  clearInterval(watch);
  const ra = await a.evaluate('window.__rooms()');
  const rb = await b.evaluate('window.__rooms()');
  check('the room dropped A at least once while it restarted', phases.includes('connecting'), [...new Set(phases)].join(','));
  check('A is back in the room, drawing B', ra.phase === 'open' && ra.peers.length === 1 && ra.peers[0].drawn, `${ra.phase}, seat ${ra.seat}`);
  check('B is back in the room, drawing A', rb.phase === 'open' && rb.peers.length === 1 && rb.peers[0].drawn, `${rb.phase}, seat ${rb.seat}`);
  check('each in the seat it had, so in the same place on the field', ra.seat === 1 && rb.seat === 2, `${ra.seat} ${rb.seat}`);
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
