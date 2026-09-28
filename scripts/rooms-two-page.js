/*
 * rooms-two-page.js: two headless pages of the real shell in one room, on
 * the Swiss valley, each seeing the other's aircraft in its own airframe
 * and paint. The check for Phase 1 (docs/MULTIPLAYER-PLAN.md section 10,
 * "two page shots"), by hand, against a running rooms Worker:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8797
 *   SIM_GPU=1 node scripts/rooms-two-page.js http://127.0.0.1:8797 [outdir]
 *
 * Page A flies a Cub painted red with the lights and the smoke fitted,
 * page B a P-51 painted blue. A makes a room, B joins it with the code.
 * Both fly. Then, on each page: the other pilot is in the room, drawn, on
 * the other seat's spawn slot, as its own airframe, in its own colours,
 * with its pilot standing at its station. Then B is put 40 m up ahead of
 * A and A must see it there, moving. Pictures of each in outdir, which is
 * not in the repository: a picture is evidence for one round.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { slotSpawn } from '../src/game/slots.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const outDir = process.argv[3] || join(root, 'build', 'rooms-two-page');

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

const RED = '#d8432f';
const BLUE = '#2f6fd6';
function seedFor(id, colour, addons) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.livery = { [id]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
  s.parts = addons.length ? { [id]: { prop: 'stock', addons } } : {};
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

/* Look at a peer from a few metres off its side and above. */
async function lookAtPeer(page, dx, dy, dz) {
  await page.evaluate(`(() => {
    const p = window.__rooms().peers[0].at;
    window.__setCam(p[0] + ${dx}, p[1] + ${dy}, p[2] + ${dz}, p[0], p[1] + 0.3, p[2], 50);
    return true;
  })()`);
  await page.sleep(1500);
}

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`two pages in one room, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('cub1400', RED, ['lights', 'smoke']) });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('p51d1450', BLUE, []) });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  check('page A makes a room', /^[A-Z0-9]{6}$/.test(code), code);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  const ra = await a.evaluate('window.__rooms()');
  const rb = await b.evaluate('window.__rooms()');
  check('A has seat 1 and B seat 2, each its own slot', ra.seat === 1 && rb.seat === 2 && ra.slot === 0 && rb.slot === 1, `${ra.seat}/${ra.slot} ${rb.seat}/${rb.slot}`);
  check('each knows the other\'s airframe from its profile', ra.peers[0].airframe === 'p51d1450' && rb.peers[0].airframe === 'cub1400');

  for (const p of [a, b]) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of [a, b]) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  for (const p of [a, b]) {
    await p.until('window.__rooms().peers[0].drawn', 30000);
  }
  const pa = (await a.evaluate('window.__rooms()')).peers[0];
  const pb = (await b.evaluate('window.__rooms()')).peers[0];
  check('A draws B as a P-51', pa.drawnAirframe === 'p51d1450', pa.drawnAirframe);
  check('B draws A as a Cub', pb.drawnAirframe === 'cub1400', pb.drawnAirframe);
  check('in B\'s blue', pa.paint && pa.paint.fuselage === BLUE && pa.paint.wing === BLUE, JSON.stringify(pa.paint));
  check('in A\'s red', pb.paint && pb.paint.fuselage === RED && pb.paint.wing === RED, JSON.stringify(pb.paint));
  const spawn = await a.evaluate('window.__craftState().spawn || null');
  const mapSpawn = await a.evaluate('(() => { const m = window.__map(); return m.spawn || null; })()');
  const sp = mapSpawn || spawn;
  if (sp) {
    const want = slotSpawn(sp, 1);
    const d = Math.hypot(pa.at[0] - want.x, pa.at[2] - want.z);
    check('B is parked on seat 2\'s slot, 8 m across from A', d < 3, `${d.toFixed(2)} m from the slot`);
  }
  const aSelf = await a.evaluate('window.__craftState()');
  check('and A on the map\'s own spawn', aSelf && Math.hypot(aSelf.worldX - pb.at[0], aSelf.worldZ - pb.at[2]) < 1,
    aSelf ? `${Math.hypot(aSelf.worldX - pb.at[0], aSelf.worldZ - pb.at[2]).toFixed(2)} m between A's own and B's drawing of it` : '');
  check('each pilot stands at a station', Array.isArray(pa.figure) && Array.isArray(pb.figure));
  await lookAtPeer(a, -6, 2.5, 5);
  await shot(a, 'a-sees-b-p51-blue');
  await lookAtPeer(b, 5, 2.5, 5);
  await shot(b, 'b-sees-a-cub-red');
  /* B's pilot on the flight line behind the row, seen from A's side,
   * with B's P-51 beyond: the head turned to its aircraft. */
  await a.evaluate(`(() => {
    const p = window.__rooms().peers[0];
    const f = p.figure;
    const dx = p.at[0] - f[0];
    const dz = p.at[2] - f[2];
    const n = Math.hypot(dx, dz) || 1;
    window.__setCam(f[0] - dx / n * 4 + dz / n * 2.5, f[1] + 2.2, f[2] - dz / n * 4 - dx / n * 2.5, f[0] + dx / n * 3, f[1] + 1, f[2] + dz / n * 3, 55);
    return true;
  })()`);
  await a.sleep(1500);
  await shot(a, 'a-sees-b-pilot-figure');

  /* B in the air ahead of A: A must see it there, and see it move. */
  const self = await a.evaluate('window.__craftState()');
  await b.evaluate(`window.__placeCraft(${self.worldX}, ${self.worldY + 40}, ${self.worldZ - 60}); true`);
  await a.until(`(() => { const p = window.__rooms().peers[0]; return p.drawn && p.at[1] > ${self.worldY + 20}; })()`, 15000).catch(() => {});
  const up1 = (await a.evaluate('window.__rooms()')).peers[0].at;
  check('A sees B 40 m up', up1[1] > self.worldY + 20, `${(up1[1] - self.worldY).toFixed(1)} m over A`);
  await a.evaluate(`window.__setCam(${self.worldX + 8}, ${self.worldY + 6}, ${self.worldZ + 12}, ${up1[0]}, ${up1[1]}, ${up1[2]}, 45); true`);
  await a.sleep(700);
  const up2 = (await a.evaluate('window.__rooms()')).peers[0].at;
  check('and moving', Math.hypot(up2[0] - up1[0], up2[1] - up1[1], up2[2] - up1[2]) > 0.5,
    `${Math.hypot(up2[0] - up1[0], up2[1] - up1[1], up2[2] - up1[2]).toFixed(2)} m in 0.7 s`);
  await a.evaluate(`window.__setCam(${self.worldX + 8}, ${self.worldY + 6}, ${self.worldZ + 12}, ${up2[0]}, ${up2[1]}, ${up2[2]}, 10); true`);
  await a.sleep(300);
  await shot(a, 'a-sees-b-in-the-air');

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
