/*
 * midair-two-page.js: two headless pages of the real shell in one room on
 * the Swiss valley, flown into each other on purpose (docs/MULTIPLAYER-PLAN.md
 * Phase 3). By hand, against a running rooms Worker:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8797
 *   SIM_GPU=1 node scripts/midair-two-page.js http://127.0.0.1:8797 [outdir]
 *
 * Both pages fly a Cub, A in red and B in blue, so the two throws are
 * mirror images and meet whatever the throttle does. A makes a room, B
 * joins, both fly, both wait out their spawn protection. Then each is
 * thrown (window.__crashThrow, held) 12 m either side of a point 60 m over
 * the field, nose to nose at 15 m/s, and both are let go together. The
 * checks: the room sends one hit and both pages get the same one; each
 * page applies its own side to its own plant (the module answers OK) and
 * its aircraft breaks. Pictures of each page's view of the contact, and
 * of its own aircraft after, go in outdir, which is not in the
 * repository.
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

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const outDir = process.argv[3] || join(root, 'build', 'midair-two-page');

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
const AIRFRAME = 'cub1400';
const HALF_GAP = 12;
const SPEED = 15;
const UP = 60;

function seedFor(colour) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, AIRFRAME);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.livery = { [AIRFRAME]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
  s.parts = {};
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

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`two pages flown into each other, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor(RED) });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor(BLUE) });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  check('page A makes a room', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  for (const p of [a, b]) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of [a, b]) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  for (const p of [a, b]) {
    await p.until('window.__rooms().peers[0].drawn', 30000);
  }
  const spawned = await a.evaluate('window.__rooms().spawning');
  check('a pilot just spawned is untouchable', spawned === true);

  /* The meeting point: 60 m over A's start, 80 m out in front. */
  const self = await a.evaluate('window.__craftState()');
  const m = { x: self.worldX, y: self.worldY + UP, z: self.worldZ - 80 };
  const throwAt = (side) => `window.__crashThrow({
    x: ${m.x + side * HALF_GAP}, y: ${m.y}, z: ${m.z},
    yaw: ${side < 0 ? -90 : 90}, pitch: 0, roll: 0,
    vx: ${-side * SPEED}, vy: 0, vz: 0, hold: true, showCraft: true,
  })`;
  const ta = await a.evaluate(throwAt(-1));
  const tb = await b.evaluate(throwAt(1));
  check('both thrown and held nose to nose', ta && ta.ok && tb && tb.ok, `${JSON.stringify(ta && ta.ok)} ${JSON.stringify(tb && tb.ok)}`);
  /* Wait out the five seconds of spawn protection, held. */
  for (const p of [a, b]) {
    await p.until('window.__rooms().spawning === false', 15000);
  }
  check('and no longer spawning, 60 m up and 80 m out', true);
  /* A look at the two before, from A's side of the field. */
  await a.evaluate(`window.__setCam(${m.x}, ${m.y + 3}, ${m.z + 22}, ${m.x}, ${m.y}, ${m.z}, 50); true`);
  await a.sleep(800);
  await shot(a, 'a-before-the-pass');

  await Promise.all([a.evaluate('window.__releasePose()'), b.evaluate('window.__releasePose()')]);
  for (const p of [a, b]) {
    await p.until('window.__rooms().hits.length > 0 && window.__rooms().hits[0].applied != null', 20000).catch(() => {});
  }
  const ra = await a.evaluate('window.__rooms()');
  const rb = await b.evaluate('window.__rooms()');
  const ha = ra.hits[0];
  const hb = rb.hits[0];
  check('the room sent one hit and both pages got it', ra.hits.length === 1 && rb.hits.length === 1, `${ra.hits.length} and ${rb.hits.length}`);
  if (ha && hb) {
    check('the same hit on both screens: its id, its moment, its point', ha.id === hb.id && ha.tc === hb.tc && JSON.stringify(ha.p) === JSON.stringify(hb.p),
      `id ${ha.id}/${hb.id}, tc ${ha.tc}/${hb.tc}`);
    check('each page applied its own side to its own plant', ha.mine && hb.mine && ha.applied && hb.applied && ha.applied.rc === 0 && hb.applied.rc === 0,
      JSON.stringify([ha.applied, hb.applied]));
    console.log(`  info  hit latency, contact to screen: A ${(ha.at - ha.tc).toFixed(0)} ms, B ${(hb.at - hb.tc).toFixed(0)} ms (both on this machine's loopback)`);
    const d = Math.hypot(ha.p[0] - m.x, ha.p[1] - m.y, ha.p[2] - m.z);
    console.log(`  info  the contact was ${d.toFixed(2)} m from the point the two were thrown at`);
  }
  /* Each page's view of the contact, from 9 m off its side, at once;
   * then its own aircraft, from 5 m, once the pieces have fallen. */
  const atContact = (p) => p.evaluate(`(() => {
    document.querySelector('.osd-air-hint-btn')?.click();
    const h = window.__rooms().hits[0];
    const c = h ? h.p : [${m.x}, ${m.y}, ${m.z}];
    window.__setCam(c[0] + 2, c[1] + 2.5, c[2] + 9, c[0], c[1] - 0.5, c[2], 55);
    return true;
  })()`);
  const atOwn = (p) => p.evaluate(`(() => {
    document.querySelector('.osd-air-hint-btn')?.click();
    const me = window.__craftState();
    window.__setCam(me.worldX + 2, me.worldY + 3, me.worldZ + 5, me.worldX, me.worldY, me.worldZ, 55);
    return true;
  })()`);
  await Promise.all([atContact(a), atContact(b)]);
  await a.sleep(150);
  await shot(a, 'a-sees-the-midair-at-the-hit');
  await shot(b, 'b-sees-the-midair-at-the-hit');
  await a.sleep(1500);
  await Promise.all([atOwn(a), atOwn(b)]);
  await a.sleep(150);
  await shot(a, 'a-own-aircraft-after-1500ms');
  await shot(b, 'b-own-aircraft-after-1500ms');
  for (const [p, who] of [[a, 'A'], [b, 'B']]) {
    const c = await p.evaluate('window.__crash()');
    const log = await p.evaluate('window.__crashLog()');
    const breaks = log.filter((e) => e.type === 'break').map((e) => e.part);
    check(`${who}'s aircraft broke`, breaks.length > 0, `${breaks.join(', ')}; ${c.flagNames.join(' ')}${c.wrecked ? ', a wreck' : ''}`);
  }
  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
