/*
 * hercules-room.js: the room keeps the Hercules' drops and everybody sees
 * the same ones in the same places (docs/HERCULES-CONTRACT.md), on a local
 * room server with real pages. A hosts a room in gusty air and flies the
 * Hercules; B is in the room when the loads drop; C joins after they lie.
 *
 *   R1 A's three presses of P are three drops the room numbers 1 to 3, and
 *      A and B hold the same three records, to the bit;
 *   R2 B, falling each record itself, lands it where A's rest says, to
 *      the bit (the same map, the same fall);
 *   R3 C, who joined after they landed, is sent all three and lays each
 *      exactly at the rest A and B have;
 *   R4 every page draws all three, at those rests.
 *
 * Run with npm run hercules:room [-- <outdir>] (stills of B's view).
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { startRooms } from '../edge/rooms/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] ?? null;
if (out) mkdirSync(out, { recursive: true });
const scratch = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'hercules-room-'));
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { graphics: 'low', graphicsAuto: false, sound: false, airframeAsked: true });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

/* Level flight on the sticks, once a frame, until told to stop. */
const HOLD = `
window.__H = { done: false };
(() => {
  const tick = () => {
    const c = window.__craftState();
    if (c && c.fwd && c.mode === 'flight') {
      const bank = Math.asin(Math.max(-1, Math.min(1, -(c.fwd.z * c.up.x - c.fwd.x * c.up.z)))) * 180 / Math.PI;
      const vy = c.vel ? c.vel.y : 0;
      window.__stick(-bank * 0.03, Math.max(-0.4, Math.min(0.4, -0.1 * vy)), 0, 0.75);
    }
    if (!window.__H.done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
const a = await openPage({ root, url, width: 960, height: 540, seed });
const b = await openPage({ root, url, width: 960, height: 540, seed });
let c = null;
const pages = [a, b];
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  await a.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === 'hercules3077')); ui.cursor = i; ui.pick('hercules3077'); ui.settings.tune = 'hercules-manual'; ui.persistSettings(); ui.show('title'); return true; })()`);
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  await a.evaluate("window.__roomWeather('gusty')");
  await a.sleep(800);
  for (const p of [a, b]) {
    await p.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  const g = await a.evaluate('window.__ground().surf');
  await a.evaluate(`window.__crashThrow({ fresh: true, x: 0, y: ${g + 70}, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -16 }); true`);
  await a.evaluate(HOLD);
  const simS = () => a.evaluate('window.__craftState().simS');
  const waitSim = async (s) => { const t0 = await simS(); const w = Date.now(); while ((await simS()) - t0 < s && Date.now() - w < 300000) await a.sleep(100); };
  await a.tap('KeyO');
  await waitSim(4.5);
  for (let i = 0; i < 3; i += 1) {
    await a.tap('KeyP');
    await waitSim(0.8);
  }
  await a.until('window.__paradrops().length === 3', 20000).catch(() => {});
  await b.until('window.__paradrops().length === 3', 20000).catch(() => {});
  const ra = await a.evaluate('window.__paradrops()');
  const rb = await b.evaluate('window.__paradrops()');
  check('R1 three presses, three drops numbered by the room, the same records on A and B',
    ra.length === 3 && same(ra.map((r) => r.id), [1, 2, 3]) && same(ra, rb) && ra.every((r) => r.air && r.air.preset === 'gusty'),
    `${ra.length} and ${rb.length}: ${JSON.stringify(ra.map((r) => ({ id: r.id, rest: r.rest.map((v) => +v.toFixed(2)), wet: r.wet })))}`);
  const fb = await b.evaluate('window.__paradropRefall()');
  check('R2 B falls each record itself and lands it at A\'s rest, to the bit',
    fb.length === 3 && fb.every((rest, i) => rest.every((v, k) => Object.is(v, ra[i].rest[k]))), JSON.stringify(fb).slice(0, 200));

  /* Until they lie (70 m at 5.4 m/s is 13 s), stills of B's view, then C. */
  for (let i = 0; i < 25; i += 1) {
    if (out) {
      const { data } = await b.cdp.send('Page.captureScreenshot', { format: 'png' }, b.sessionId);
      writeFileSync(join(out, `room-b-${String(i).padStart(3, '0')}.png`), Buffer.from(data, 'base64'));
    }
    await waitSim(1);
  }
  c = await openPage({ root, url, width: 960, height: 540, seed });
  pages.push(c);
  await c.until('window.__shellReady === true', 300000);
  await c.until('window.__map && window.__map().ready', 400000);
  await c.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await c.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 2", 30000);
  await c.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await c.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await c.until('window.__paradrops().length === 3', 20000).catch(() => {});
  const rc = await c.evaluate('window.__paradrops()');
  const drawnC = await c.evaluate('window.__paradropDrawn()');
  check('R3 C, joining after, is sent all three and lays each at the same rest',
    rc.length === 3 && same(rc.map((r) => [r.id, r.rest]), ra.map((r) => [r.id, r.rest]))
    && drawnC.length === 3 && drawnC.every((d, i) => d.room && same(d.rest, ra[i].rest)), JSON.stringify(drawnC).slice(0, 300));
  const drawn = await Promise.all([a, b].map((p) => p.evaluate('window.__paradropDrawn()')));
  check('R4 every page draws the three at those rests',
    drawn.every((dd) => dd.length === 3 && dd.every((d, i) => same(d.rest, ra[i].rest))));
  await a.evaluate('window.__H.done = true; true');
  if (out) {
    const { data } = await c.cdp.send('Page.captureScreenshot', { format: 'png' }, c.sessionId);
    writeFileSync(join(out, 'room-c-late-joiner.png'), Buffer.from(data, 'base64'));
  }
  const refused = /ERR_CONNECTION_REFUSED|Failed to load resource/;
  const other = pages.flatMap((p) => p.errors).filter((e) => !refused.test(e));
  check('the pages logged nothing', other.length === 0, other.slice(0, 3).join(' | ').slice(0, 600));
} finally {
  for (const p of pages) await p.close();
  await server.stop();
  await rm(scratch, { recursive: true, force: true });
}
console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) process.exitCode = 1;
