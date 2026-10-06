/*
 * midair-ace-two-page.js: every mid air counts, in free flight and in a
 * Catch the Ace match (the owner, 2026-09-29: "ok keep collisions for ace,
 * kill anti ramming rule"). Two headless pages of the real shell, one room
 * on the Swiss valley. By hand, against a running rooms server:
 *
 *   PORT=8893 ROOMS_DB=/some/scratch/rooms.db node edge/rooms/node.js
 *   SIM_GPU=1 node scripts/midair-ace-two-page.js http://127.0.0.1:8893
 *
 * SIM_GPU=1, as for scripts/midair-two-page.js: on the software
 * rasteriser two pages fly well under real time, and a pass that should
 * meet in under a second of wall clock does not meet at all.
 *
 * A (a red Cub) makes the room and B (a blue Cub) joins. Free flight
 * first: six times over, each is thrown (window.__crashThrow, fresh, so a
 * wreck is whole again) 12 m either side of a point 60 m up, nose to nose
 * at 15 m/s, held through the room's spawn protection and let go together.
 * Every one of the six must be a hit on both pages that each applies and
 * breaks on, so a fourth mid air in five minutes is no different from the
 * first (the ramming bench would have made it nothing). Then A starts a
 * match and the two are flown into each other the same way: the hunter
 * must take the crown on its way through the Ace's bubble, and then the
 * two must collide, one hit on both pages, both broken.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { PROTECT_MS } from '../src/share/roomtag.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8893';

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

const AIR = 'cub1400';
const HALF_GAP = 12;
const SPEED = 15;
const UP = 60;
const FREE_PASSES = 6;

function seedFor(colour) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, AIR);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.livery = { [AIR]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
  s.parts = {};
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`every mid air counts, free flight and Catch the Ace, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 960, height: 540, seed: seedFor('#d8432f') });
const b = await openPage({ root, url, width: 960, height: 540, seed: seedFor('#2f6fd6') });
const pages = [a, b];

/* Both thrown nose to nose either side of m, held, the room's spawn
 * protection waited out, then let go together. `first` is the page
 * thrown from the -x side. Resolves the new hit on each page.
 *
 * A fresh throw puts the plant back to its first step, which mends the
 * last pass's wreck and is a new flight: the page's own spawn protection
 * then lasts until the aircraft is 30 m from where it started, which a
 * pass never flies. So each is first thrown fresh 40 m above its mark,
 * and then onto it. */
async function pass(m, first, second, n) {
  const throwAt = (side, up, fresh) => `window.__crashThrow({
    x: ${m.x + side * HALF_GAP}, y: ${m.y + up}, z: ${m.z},
    yaw: ${side < 0 ? -90 : 90}, pitch: 0, roll: 0,
    vx: ${-side * SPEED}, vy: 0, vz: 0, hold: true, showCraft: true, fresh: ${fresh},
  })`;
  await first.evaluate(throwAt(-1, 40, true));
  await second.evaluate(throwAt(1, 40, true));
  await a.sleep(600);
  const t1 = await first.evaluate(throwAt(-1, 0, false));
  const t2 = await second.evaluate(throwAt(1, 0, false));
  if (!t1 || !t1.ok || !t2 || !t2.ok) {
    throw new Error(`a throw failed: ${JSON.stringify(t1)} ${JSON.stringify(t2)}`);
  }
  for (const p of pages) {
    await p.until('window.__rooms().spawning === false', 15000);
  }
  await a.sleep(SPAWN_MS + 1000);
  await Promise.all([first.evaluate('window.__releasePose()'), second.evaluate('window.__releasePose()')]);
  for (const p of pages) {
    await p.until(`window.__rooms().hits.length >= ${n} && window.__rooms().hits[${n - 1}].applied != null`, 20000).catch(() => {});
  }
  await a.sleep(300);
  const out = [];
  for (const p of pages) {
    const r = await p.evaluate('window.__rooms()');
    const log = await p.evaluate('window.__crashLog()');
    out.push({ hits: r.hits, hit: r.hits[n - 1], breaks: log.filter((e) => e.type === 'break').map((e) => e.part) });
  }
  return out;
}

try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  check('page A makes a room', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of pages) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  const seats = [await a.evaluate('window.__rooms().seat'), await b.evaluate('window.__rooms().seat')];
  for (const p of pages) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of pages) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  for (const p of pages) {
    await p.until('window.__rooms().peers[0].drawn', 30000);
  }
  const self = await a.evaluate('window.__craftState()');
  const m = { x: self.worldX, y: self.worldY + UP, z: self.worldZ - 80 };

  console.log('free flight');
  const first = await a.evaluate('window.__rooms().roomNow');
  for (let n = 1; n <= FREE_PASSES; n += 1) {
    const [ra, rb] = await pass(m, a, b, n);
    const ha = ra.hit;
    const hb = rb.hit;
    check(`mid air ${n}: one new hit, the same on both pages, each applied to its own plant and broke`,
      ra.hits.length === n && rb.hits.length === n && ha && hb && ha.id === hb.id && ha.tc === hb.tc
      && ha.mine && hb.mine && ha.applied && hb.applied && ha.applied.rc === 0 && hb.applied.rc === 0
      && ra.breaks.length > 0 && rb.breaks.length > 0,
      `${ra.hits.length} and ${rb.hits.length} hits; A broke ${ra.breaks.join(' ') || 'nothing'}, B ${rb.breaks.join(' ') || 'nothing'}`);
  }
  const last = await a.evaluate('window.__rooms().roomNow');
  check(`all ${FREE_PASSES} inside five minutes`, last - first < 5 * 60 * 1000, `${((last - first) / 1000).toFixed(0)} s`);

  console.log('Catch the Ace');
  await a.evaluate("window.__roomTagDo('tag-start', 60)");
  for (const p of pages) {
    await p.until("['ace', 'hunter'].includes(window.__roomTag().role)", 30000);
  }
  const go = await a.evaluate('window.__roomTag()');
  const aceIdx = seats.indexOf(go.view.ace);
  const hunterSeat = seats[1 - aceIdx];
  console.log(`  info  seats A ${seats[0]}, B ${seats[1]}; the draw made ${aceIdx ? 'B' : 'A'} the Ace`);
  /* The go's own protection is long over by the time a pass flies. */
  await a.sleep(PROTECT_MS);
  const [ta, tb] = await pass(m, a, b, FREE_PASSES + 1);
  const views = await Promise.all(pages.map((p) => p.evaluate('window.__roomTag()')));
  const crown = views[0].view.crowns.at(-1);
  const hit = ta.hit;
  check('the hunter takes the crown flying into the Ace\'s bubble, on both pages',
    crown && crown.why === 'tag' && crown.seat === hunterSeat && views.every((v) => v.view.ace === hunterSeat),
    crown ? JSON.stringify(crown) : 'no crown');
  check('and the two collide: one hit on both pages, each applied and broke',
    ta.hits.length === FREE_PASSES + 1 && tb.hits.length === FREE_PASSES + 1 && hit && tb.hit && hit.id === tb.hit.id
    && hit.applied && tb.hit.applied && hit.applied.rc === 0 && tb.hit.applied.rc === 0 && ta.breaks.length > 0 && tb.breaks.length > 0,
    `${ta.hits.length} and ${tb.hits.length} hits; A broke ${ta.breaks.join(' ') || 'nothing'}, B ${tb.breaks.join(' ') || 'nothing'}`);
  check('the tag first, the crash after it', crown && hit && crown.t < hit.tc, crown && hit ? `${Math.round(hit.tc - crown.t)} ms apart` : '');
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  for (const p of pages) {
    await p.close();
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
