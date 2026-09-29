/*
 * tag-bubble-two-page.js: Catch the Ace's bubble in two headless pages of
 * the real shell, one room on the Swiss valley. By hand, against a
 * running rooms server:
 *
 *   PORT=8871 ROOMS_DB=/some/scratch/rooms.db node edge/rooms/node.js
 *   node scripts/tag-bubble-two-page.js http://127.0.0.1:8871 [outdir]
 *
 * A (a red Cub) makes the room, B (a blue Cub) joins, both fly, and A
 * starts a match. Both are held in the air 40 m apart. The hunter is held
 * with its nearest part 6.5 m from the Ace's centre, outside the bubble,
 * long enough that no protection is left: the crown must stay. Then it
 * flies in at 1 m/s, a held step every 100 ms, to 5.5 m, never within
 * 4 m of the Ace's own hull: the room must crown it once any part of it
 * is inside 6 m, and both screens must say so. Then A's crash cam opens
 * the replay: the bubble must be round A, its own craft, before the tag
 * and round B after, where each was held. Pictures of the bubble from the
 * hunter, from the Ace and in the replay go in outdir, which is not in
 * the repository.
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
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { BUBBLE_M, PROTECT_MS } from '../src/share/roomtag.js';
import { hullDistance, hullFor } from '../src/game/midair.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8871';
const outDir = process.argv[3] || join(root, 'build', 'tag-bubble-two-page');

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

const GOAL = 60;
const UP = 60;
const AIR = 'cub1400';
/* A hold's attitude, yaw 90: nose toward -x, span along z. */
const HOLD_Q = { qx: 0, qy: Math.SQRT1_2, qz: 0, qw: Math.SQRT1_2 };
const hull = hullFor(AIR);
/* How far a held Cub dz beside a point, on z, is from it: the referee's
 * own measure, its nearest part box. */
const reachAt = (dz) => hullDistance(hull, { px: 0, py: 0, pz: dz, ...HOLD_Q }, 0, 0, 0);
/* The side offset that puts that at d, by bisection: it only grows. */
function offsetFor(d) {
  let lo = 0;
  let hi = 20;
  while (hi - lo > 1e-6) {
    const mid = (lo + hi) / 2;
    if (reachAt(mid) < d) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

function seedFor(colour) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, AIR);
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

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const tagOf = (p) => p.evaluate('window.__roomTag()');
const bubbles = (p) => p.evaluate('window.__aceBubbles()');
const hold = (p, at) => p.evaluate(`window.__crashThrow({ x: ${at.x}, y: ${at.y}, z: ${at.z}, yaw: 90, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, showCraft: true })`);
const dist = (p, q) => Math.hypot(p[0] - q.x, p[1] - q.y, p[2] - q.z);
const H = 'window.__crashCam.h()';

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`Catch the Ace's bubble in two pages, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#d8432f') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#2f6fd6') });
const pages = [a, b];
const names = ['A', 'B'];
try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready && window.__crashCam', 400000);
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
  check('no bubble before a match', (await bubbles(a)).length === 0 && (await bubbles(b)).length === 0);

  await a.evaluate(`window.__roomTagDo('tag-start', ${GOAL})`);
  for (const p of pages) {
    await p.until("['ace', 'hunter'].includes(window.__roomTag().role)", 30000);
  }
  const go = await tagOf(a);
  check('the room judges by the bubble, and says how big', go.view.bubble === BUBBLE_M, String(go.view.bubble));
  const aceIdx = seats.indexOf(go.view.ace);
  const ace = pages[aceIdx];
  const hunter = pages[1 - aceIdx];
  const aceName = names[aceIdx];
  const huntName = names[1 - aceIdx];
  console.log(`  info  seats A ${seats[0]}, B ${seats[1]}; the draw made ${aceName} the Ace`);

  /* Up, held, 40 m apart; the throws are teleports, so both wait out the
   * room's spawn protection, and the Ace its own. */
  const self = await a.evaluate('window.__craftState()');
  const m = { x: self.worldX, y: self.worldY + UP, z: self.worldZ - 80 };
  await hold(ace, m);
  await hold(hunter, { ...m, z: m.z + 40 });
  for (const p of pages) {
    await p.until('window.__rooms().spawning === false', 15000);
  }
  await a.sleep(SPAWN_MS + 500);
  const [liveA, liveH] = [await bubbles(ace), await bubbles(hunter)];
  check(`the Ace's own screen draws one bubble, ${BUBBLE_M} m, round its own craft`, liveA.length === 1 && liveA[0].r === BUBBLE_M && dist(liveA[0].at, m) < 0.05,
    liveA.map((x) => `${x.r} m at ${dist(x.at, m).toFixed(3)} m`).join());
  check('and the hunter\'s round the Ace as it draws it', liveH.length === 1 && liveH[0].r === BUBBLE_M && dist(liveH[0].at, m) < 0.5,
    liveH.map((x) => `${x.r} m at ${dist(x.at, m).toFixed(3)} m, level ${x.level.toFixed(2)}`).join());

  /* 6.5 m: held there past the room's teleport protection and more. */
  const out = { ...m, z: m.z + offsetFor(6.5) };
  await hold(hunter, out);
  const outAt = await hunter.evaluate('window.__rooms().roomNow');
  await hunter.sleep(SPAWN_MS + 3000);
  const still = await tagOf(a);
  check('a hunter held 6.5 m from the Ace\'s centre, 3 s past its own protection, takes nothing', still.view.ace === go.view.ace && still.view.crowns.length === 1,
    `${still.view.crowns.length} crowns, held ${Math.round((await a.evaluate('window.__rooms().roomNow')) - outAt)} ms`);
  const near = await bubbles(hunter);
  check('the bubble is brighter with the hunter at its edge than 40 m off', near.length === 1 && near[0].level > liveH[0].level * 1.3,
    `${liveH[0].level.toFixed(2)} to ${near[0] && near[0].level.toFixed(2)}`);

  /* The pictures before the tag. From the hunter: behind it and a little
   * up, looking at the Ace through its bubble's edge. */
  await hunter.evaluate(`window.__setCam(${out.x + 9}, ${out.y + 3}, ${out.z + 9}, ${m.x}, ${m.y}, ${m.z}, 60); true`);
  await ace.evaluate(`window.__setCam(${m.x + 16}, ${m.y + 5}, ${m.z - 12}, ${m.x}, ${m.y}, ${m.z + 2}, 60); true`);
  await hunter.sleep(800);
  await shot(hunter, `1-hunter-${huntName}-sees-the-ace-bubble`);
  await shot(ace, `2-ace-${aceName}-sees-its-own-bubble`);
  await ace.evaluate('window.__setCam(null); true');
  await ace.sleep(500);
  await shot(ace, `3-ace-${aceName}-own-flight-view`);
  await hunter.evaluate('window.__setCam(null); true');

  /* In at 1 m/s, a held step every 100 ms, 6.5 m to 5.5 m. */
  const steps = [];
  for (let dm = 64; dm >= 55; dm -= 1) {
    const d = dm / 10;
    const at = { ...m, z: m.z + offsetFor(d) };
    await hold(hunter, at);
    steps.push({ d, t: await hunter.evaluate('window.__rooms().roomNow'), at });
    await hunter.sleep(100);
  }
  const hunterSeat = seats[1 - aceIdx];
  for (const p of pages) {
    await p.until(`window.__roomTag().view.ace === ${hunterSeat}`, 20000);
  }
  const after = await Promise.all(pages.map(tagOf));
  const crown = after[0].view.crowns.at(-1);
  const inside = steps.find((s) => s.d <= BUBBLE_M);
  const lastOut = steps.filter((s) => s.d > BUBBLE_M).at(-1);
  check('flying in, the hunter takes the crown once its nearest part is inside 6 m, not before',
    crown.why === 'tag' && crown.seat === hunterSeat && crown.t > lastOut.t && crown.t <= inside.t + 250,
    `tag ${Math.round(crown.t - inside.t)} ms after the step to ${inside.d.toFixed(1)} m, ${Math.round(crown.t - lastOut.t)} ms after the step to ${lastOut.d.toFixed(1)} m`);
  check('without touching: it never came nearer the Ace\'s own hull than 4 m, and no page got a mid air hit',
    reachAt(offsetFor(5.5)) - hull.hull.reach > 4 && (await a.evaluate('window.__rooms().hits.length')) === 0 && (await b.evaluate('window.__rooms().hits.length')) === 0,
    `nearest ${steps.at(-1).d.toFixed(1)} m from the centre`);
  check('both screens have the same crown at the same room time', JSON.stringify(after[0].view.crowns) === JSON.stringify(after[1].view.crowns));
  await a.sleep(400);
  const banners = await Promise.all(pages.map(tagOf));
  check('and each shows the tag, its own way', banners.every((t) => t.banner && t.banner.seat === hunterSeat),
    banners.map((t) => t.banner && t.banner.text).join(' | '));
  const moved = await bubbles(ace);
  const newAceAt = steps.at(-1).at;
  check('the bubble moves to the new Ace on the old Ace\'s screen', moved.length === 1 && dist(moved[0].at, newAceAt) < 0.5,
    moved.map((x) => `${dist(x.at, newAceAt).toFixed(3)} m off`).join());
  await ace.evaluate(`window.__setCam(${m.x + 16}, ${m.y + 5}, ${m.z - 12}, ${newAceAt.x}, ${newAceAt.y}, ${newAceAt.z}, 60); true`);
  await ace.sleep(300);
  await shot(ace, `4-old-ace-${aceName}-sees-the-crown-move`);
  /* The old Ace is inside the new one's bubble: away before its
   * protection is out, or it takes the crown straight back. */
  const bench = { ...m, x: m.x + 40 };
  await hold(ace, bench);
  await ace.evaluate('window.__setCam(null); true');
  await ace.sleep(PROTECT_MS + 1000);
  const kept = await tagOf(a);
  check('the old Ace, benched 40 m off, does not take it back', kept.view.ace === hunterSeat, `${kept.view.crowns.length} crowns`);

  /* The replay on the old Ace's page: before the tag the bubble is round
   * its own craft, after it round the hunter, each where it was held. */
  await ace.tap('KeyV');
  await ace.until('window.__crashCam.live()', 10000);
  const dur = (await ace.evaluate(`${H}.view()`)).dur;
  const seen = [];
  for (let t = 0; t <= dur; t += 0.5) {
    await ace.evaluate(`${H}.api.jumpTo(${t})`);
    await ace.until(`${H}.view().drawn === ${t}`, 30000);
    const bs = await bubbles(ace);
    seen.push({ t, b: bs[0] || null, n: bs.length });
  }
  const round = (s, at) => s.b && s.n === 1 && s.b.r === BUBBLE_M && dist(s.b.at, at) < 0.05;
  const onAce = seen.filter((s) => round(s, m));
  const onHunter = seen.filter((s) => s.b && s.n === 1 && s.b.r === BUBBLE_M && dist(s.b.at, newAceAt) < 0.25);
  const lastOnAce = onAce.at(-1);
  const firstOnHunter = onHunter[0];
  check('the replay draws the bubble round the old Ace, its own craft, then round the hunter, as the screen did',
    onAce.length >= 4 && onHunter.length >= 2 && lastOnAce.t < firstOnHunter.t && seen.every((s) => s.n <= 1),
    `round ${aceName}'s own craft ${onAce.length} times to ${lastOnAce && lastOnAce.t} s, round the hunter ${onHunter.length} times from ${firstOnHunter && firstOnHunter.t} s of ${dur.toFixed(1)} s`);
  const tBefore = lastOnAce ? Math.max(0, lastOnAce.t - 0.5) : dur / 2;
  /* The tripod stands where the flight camera was when the replay
   * opened, 40 m off on the bench: outside the bubble, looking in. */
  await ace.evaluate(`${H}.setRig('tripod', -1)`);
  await ace.evaluate(`${H}.api.jumpTo(${tBefore})`);
  await ace.until(`${H}.view().drawn === ${tBefore}`, 30000);
  await ace.sleep(800);
  await shot(ace, `5-replay-${aceName}-tripod-before-the-tag`);
  await ace.evaluate(`${H}.setRig('chase', -1)`);
  await ace.sleep(800);
  await shot(ace, `6-replay-${aceName}-chase-before-the-tag`);
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  for (const [i, p] of pages.entries()) {
    const st = await p.evaluate('JSON.stringify({ tag: window.__roomTag(), bubbles: window.__aceBubbles(), mode: window.__craftState && window.__craftState().mode })').catch((x) => String(x));
    console.log(`  page ${names[i]}: ${st}`);
  }
  throw e;
} finally {
  for (const p of pages) {
    await p.close();
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
