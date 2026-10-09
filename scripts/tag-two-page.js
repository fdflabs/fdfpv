/*
 * tag-two-page.js: Catch the Ace! in three headless pages of the real
 * shell, one room on the Swiss valley (docs/TAG-PLAN.md, checks). By hand,
 * against a running rooms Worker:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8797
 *   SIM_GPU=1 node scripts/tag-two-page.js http://127.0.0.1:8797 [outdir]
 *
 * A (a red Cub) makes the room, B (a blue Cub) and C (a five inch) join,
 * all three fly, and A starts a match to GOAL points. Every page is put on
 * its slot and held through the countdown. Then each is thrown up into
 * the air and held there (window.__crashThrow), and the crown is passed
 * down one chain whatever the draw: C (the quad) enters the Ace's bubble
 * unless it is the Ace already, B enters C's, and A is thrown into B's,
 * 0.5 m off its wing. So every run has a Cub take the crown from a quad and a Cub from a
 * Cub, and a quad take it from a Cub unless the draw began with the quad.
 * The crown moves on all three screens at the same room time, the peer
 * marks crown it, nobody breaks and no mid air hit is sent, the points
 * tick on every scoreboard, and the match ends at GOAL with the same
 * results on all three. Pictures of what each saw, in outdir, which is
 * not in the repository.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { PROTECT_MS } from '../src/share/roomtag.js';
import { hullFor } from '../src/game/midair.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const outDir = process.argv[3] || join(root, 'build', 'tag-two-page');

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

/* High enough that nobody reaches it while the chain is passed down:
 * the first Ace can hold the crown for about 12 s of it. */
const GOAL = 25;
const UP = 60;
const AIR = ['cub1400', 'cub1400', 'interceptor'];

/* How far an airframe reaches along the Three.js body's x, from its
 * centre: a Cub's wingtip, a quad's arm (configs/hulls.js). Held with
 * yaw 90, that is along the world's z. */
function halfSpan(airframe) {
  const h = hullFor(airframe).hull;
  let hi = 0;
  for (let i = 0; i < h.n; i += 1) {
    hi = Math.max(hi, Math.abs(h.cx[i]) + h.hx[i]);
  }
  return hi;
}

function seedFor(airframe, colour) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.livery = colour ? { [airframe]: { regions: { wing: colour, fuselage: colour, tail: colour } } } : {};
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

const tagOf = (p) => p.evaluate('window.__roomTag()');
/* The peer marks' Ace (src/ui/peermarks.js): its seat, and how it is
 * drawn this frame, over the aircraft or at the frame's edge. */
const aceMark = (p) => p.evaluate(`(() => {
  const m = window.__peerMarks().marks.find((x) => x.role === 'ace');
  return m ? { seat: m.seat, kind: m.kind, alpha: m.alpha } : null;
})()`);
/* Held in the air at (x, y, z), nose toward -x, so a Cub's span is along z. */
const hold = (p, at) => p.evaluate(`window.__crashThrow({ x: ${at.x}, y: ${at.y}, z: ${at.z}, yaw: 90, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, showCraft: true })`);

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`Catch the Ace in three pages, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor(AIR[0], '#d8432f') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor(AIR[1], '#2f6fd6') });
const c = await openPage({ root, url, width: 1280, height: 720, seed: seedFor(AIR[2], null) });
const pages = [a, b, c];
const names = ['A', 'B', 'C'];
try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  check('page A makes a room', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until("window.__rooms().phase === 'open'", 30000);
  for (const p of [b, c]) {
    await p.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  }
  for (const p of pages) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 2 && window.__rooms().roomNow != null", 30000);
  }
  const seats = [];
  for (const p of pages) {
    seats.push(await p.evaluate('window.__rooms().seat'));
  }
  console.log(`  info  seats: A ${seats[0]}, B ${seats[1]}, C ${seats[2]}`);
  const seatName = (seat) => names[seats.indexOf(seat)];

  /* Everybody flying free before the match, as friends in a room are. */
  for (const p of pages) {
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of pages) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }

  await a.evaluate(`window.__roomTagDo('tag-start', ${GOAL})`);
  for (const p of pages) {
    await p.until("window.__roomTag().role === 'countdown' && window.__roomTag().hold > 0", 20000);
  }
  const cd = await Promise.all(pages.map(tagOf));
  check('the host starts a match: every page is counting down to one go', cd.every((t) => t.view.goAt === cd[0].view.goAt && t.view.goal === GOAL),
    cd.map((t) => t.view.goAt).join(' '));
  check('and every page was put back on its slot and held there', cd.every((t) => t.run === t.view.id && t.hold > 0), cd.map((t) => Math.round(t.hold)).join(' '));
  for (const p of pages) {
    await p.until("['ace', 'hunter'].includes(window.__roomTag().role)", 20000);
  }
  const go = await Promise.all(pages.map(tagOf));
  const firstAce = go[0].view.ace;
  check('at the go one pilot is the Ace, the same on every page', go.every((t) => t.view.ace === firstAce), `${seatName(firstAce)}`);
  check('and each page knows its part', go.every((t, i) => t.role === (seats[i] === firstAce ? 'ace' : 'hunter')), go.map((t) => t.role).join(' '));

  /* Up into the air, held: 60 m over A's slot and 80 m out, 30 m apart. */
  const self = await a.evaluate('window.__craftState()');
  const m = { x: self.worldX, y: self.worldY + UP, z: self.worldZ - 80 };
  const spot = { A: { ...m, z: m.z + 30 }, B: m, C: { ...m, z: m.z - 30 } };
  await Promise.all(pages.map((p, i) => hold(p, spot[names[i]])));
  /* The room takes a throw for a teleport and keeps the seat untouchable
   * for SPAWN_MS (edge/rooms/safety.js); the page its own five seconds and
   * until 30 m from where it started. */
  for (const p of pages) {
    await p.until('window.__rooms().spawning === false', 15000);
  }
  await a.sleep(SPAWN_MS + 500);

  const idx = (seat) => seats.indexOf(seat);
  const home = [spot.A, spot.B, spot.C];
  /* Where an old Ace goes after a tag: 40 m out from its start, and so
   * away from the hunter just thrown in beside where it was. */
  const bench = home.map((h) => ({ ...h, x: h.x + 40 }));
  const pos = home.slice();
  /*
   * Page i takes the crown from whoever holds it: thrown beside the Ace, its
   * nearest part `gap` metres from the Ace's on the span axis (negative is
   * an overlap), held there until every page has the crown on it, and the
   * old Ace sent to its bench, 40 m off, so it cannot take the crown back.
   * Resolves the crown change as the room decided it.
   */
  const touch = async (i, gap) => {
    const ace = (await tagOf(a)).view.ace;
    const j = idx(ace);
    const at = { ...pos[j], z: pos[j].z + halfSpan(AIR[j]) + halfSpan(AIR[i]) + gap };
    await hold(pages[i], at);
    pos[i] = at;
    const thrownAt = await pages[i].evaluate('window.__rooms().roomNow');
    for (const p of pages) {
      await p.until(`window.__roomTag().view.ace === ${seats[i]}`, 20000);
    }
    await hold(pages[j], bench[j]);
    pos[j] = bench[j];
    const crown = (await tagOf(a)).view.crowns.at(-1);
    return { crown, thrownAt, from: j };
  };
  let now = await tagOf(a);
  if (now.view.ace !== seats[2]) {
    const first = seatName(now.view.ace);
    const got = await touch(2, 0.5);
    check(`C, the quad, takes the crown from ${first}, a Cub, 0.5 m off its wingtip`, got.crown.seat === seats[2] && got.crown.why === 'tag', JSON.stringify(got.crown));
  } else {
    console.log('  info  C, the quad, was drawn the Ace');
  }
  const fromQuad = await touch(1, 0.5);
  check('B, a Cub, takes the crown from C, the quad, 0.5 m off its arm', fromQuad.crown.seat === seats[1] && fromQuad.crown.from === seats[2] && fromQuad.crown.why === 'tag',
    JSON.stringify(fromQuad.crown));
  /* B moved beside where C was: the cameras and A's throw follow it. */
  const bAt = pos[1];
  await a.sleep(SPAWN_MS + 500);
  now = await tagOf(a);
  check('B is the Ace', now.view.ace === seats[1], seatName(now.view.ace));
  const before = await Promise.all(pages.map(tagOf));
  const bPointsBefore = before[0].standings.find((r) => r.seat === seats[1]).points;
  /* A look from C at the Ace, crowned, with A about to arrive. */
  await c.evaluate(`window.__setCam(${bAt.x + 6}, ${bAt.y + 2}, ${bAt.z + 12}, ${bAt.x}, ${bAt.y}, ${bAt.z + 4}, 55); true`);
  await c.sleep(800);
  const cBefore = await aceMark(c);
  check('C\'s peer marks crown B, over its aircraft', cBefore && cBefore.seat === seats[1] && cBefore.kind === 'over' && cBefore.alpha > 0.9, JSON.stringify(cBefore));
  await shot(c, 'c-sees-b-crowned');
  /* And from A, the hunter, 12 m behind and above B. */
  await a.evaluate(`window.__setCam(${bAt.x + 12}, ${bAt.y + 3}, ${bAt.z + 3}, ${bAt.x}, ${bAt.y}, ${bAt.z}, 55); true`);
  await a.sleep(600);
  await shot(a, 'a-hunts-b-crowned');

  /* A into B's bubble, 0.5 m off its wing: a tag without a touch. A
   * collision in a match is a mid air crash (docs/TAG-PLAN.md decision 1),
   * which scripts/midair-ace-two-page.js flies. */
  const aThrow = { ...bAt, z: bAt.z + halfSpan(AIR[1]) + halfSpan(AIR[0]) + 0.5 };
  await hold(a, aThrow);
  const thrownAt = await a.evaluate('window.__rooms().roomNow');
  for (const p of pages) {
    await p.until(`window.__roomTag().view.ace === ${seats[0]}`, 20000);
  }
  const after = await Promise.all(pages.map(tagOf));
  const tagged = after[0].view.crowns.at(-1);
  check('A enters B\'s bubble and takes the crown: every page has the same crown, at the same room time',
    after.every((t) => JSON.stringify(t.view.crowns) === JSON.stringify(after[0].view.crowns)) && tagged.seat === seats[0] && tagged.from === seats[1] && tagged.why === 'tag',
    JSON.stringify(tagged));
  check('not before A\'s own spawn protection was over, nor inside B\'s', tagged.t >= thrownAt + SPAWN_MS - 100
    && tagged.t > (after[0].view.crowns.at(-2) || { t: 0 }).t + PROTECT_MS, `${Math.round(tagged.t - thrownAt)} ms after the throw`);
  check('each page says so: A is the Ace, B and C hunt', after[0].role === 'ace' && after[1].role === 'hunter' && after[2].role === 'hunter');
  await a.sleep(400);
  const banners = await Promise.all(pages.map(tagOf));
  check('and each page\'s banner said it its own way', banners.every((t) => t.banner && t.banner.seat === seats[0]),
    banners.map((t) => t.banner && t.banner.text).join(' | '));
  const hits = await Promise.all(pages.map((p) => p.evaluate('window.__rooms().hits.length')));
  check('a tag is not a crash: nothing touched, and no page got a mid air hit', hits.every((n) => n === 0), hits.join(' '));
  for (const [p, who] of [[a, 'A'], [b, 'B']]) {
    const cr = await p.evaluate('window.__crash()');
    check(`${who}'s Cub is whole`, !cr.wrecked && cr.flagNames.length === 0, `${cr.flagNames.join(' ')}${cr.wrecked ? ' wrecked' : ''}`);
  }
  /* B away before the three seconds are out, or it takes the crown back. */
  await hold(b, bench[1]);
  await c.evaluate(`window.__setCam(${bAt.x + 6}, ${bAt.y + 2}, ${bAt.z + 12}, ${bAt.x}, ${bAt.y}, ${bAt.z + 4}, 55); true`);
  await c.sleep(600);
  const cAfter = await aceMark(c);
  const bMarks = await b.evaluate("window.__peerMarks().marks.filter((x) => x.role === 'ace').map((x) => x.seat)");
  check('and now A, on C\'s screen and on B\'s, and nobody else', cAfter && cAfter.seat === seats[0] && cAfter.alpha > 0.9 && bMarks.join() === String(seats[0]),
    `${JSON.stringify(cAfter)} ${bMarks}`);
  await shot(c, 'c-sees-a-crowned');
  await shot(a, 'a-is-the-ace-hud');
  await shot(b, 'b-hunts-hud');

  const t0 = await tagOf(b);
  await b.sleep(2500);
  const t1 = await tagOf(b);
  const pts = (t, seat) => t.standings.find((r) => r.seat === seat).points;
  check('the points tick: A\'s go up on B\'s scoreboard, B\'s held', pts(t1, seats[0]) > pts(t0, seats[0]) && pts(t1, seats[1]) >= bPointsBefore,
    `A ${pts(t0, seats[0])} to ${pts(t1, seats[0])}, B ${pts(t1, seats[1])}`);
  check('and B\'s flight screen shows them, as a hunter, the Ace crowned', t1.hud && t1.hud.rows.length === 3 && t1.role === 'hunter'
    && t1.hud.rows.find((r) => r.name.startsWith('♛')).place === t1.standings.find((r) => r.seat === seats[0]).place, t1.hud ? t1.hud.title : 'no board');

  for (const p of pages) {
    await p.until('window.__roomTag().results === true', (GOAL + 30) * 1000);
  }
  const end = await Promise.all(pages.map(tagOf));
  const v = end[0].view;
  const win = v.scores.find((r) => r.seat === v.winner);
  check(`the match ends by itself at ${GOAL} points, A first`, v.state === 'results' && v.winner === seats[0] && win.ms === GOAL * 1000,
    `winner ${seatName(v.winner)} with ${win && win.ms} ms`);
  check('and every page shows the same results', end.every((t) => JSON.stringify(t.view) === JSON.stringify(v)), v.scores.map((r) => `${seatName(r.seat)} ${r.ms}`).join(', '));
  /* Each pilot's own record of the match (src/share/pilotcounts.js),
   * from the room's standings: one played, the win on A only, the best
   * its own points. */
  const kept = await Promise.all(pages.map((p) => p.evaluate(`(() => {
    const t = window.__roomTag();
    const mine = t.standings.find((r) => r.seat === window.__rooms().seat);
    return { seat: window.__rooms().seat, points: mine ? mine.points : null, slots: Object.values(window.__ui.settings.pilotCounts || {}).map((x) => x.tag || {}) };
  })()`)));
  check('each page kept the match: played once, won on A only, its best its own points', kept.every((k) => k.slots.length === 1
    && k.slots[0].played === 1 && (k.slots[0].won || 0) === (k.seat === v.winner ? 1 : 0) && (k.slots[0].best || 0) === k.points), JSON.stringify(kept));
  await shot(a, 'a-results');
  await shot(b, 'b-results');
  await shot(c, 'c-results');
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on any page', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  /* What each page had when a wait ran out. */
  for (const [i, p] of pages.entries()) {
    const st = await p.evaluate('JSON.stringify({ tag: window.__roomTag(), mode: window.__craftState && window.__craftState().mode, screen: window.__ui.screen, settings: { mode: window.__ui.mode, map: window.__ui.settings.map } })').catch((x) => String(x));
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
