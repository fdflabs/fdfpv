/*
 * combat-respawn-pages.js: the owner's report, as a check. "After a
 * while, even after restarts, everyone starts back up without a tail."
 *
 * Three headless pages in one private room on the Swiss valley: A the
 * five inch in red cuts, B the Cub in blue is cut, C a five inch in green
 * watches, tears and crashes. The lead's rule (2026-09-29): a restart
 * gives the tail back, to at least FULL_LINKS in the pilot's own colour,
 * captured paper past that kept; a cut still shortens the victim's tail
 * for the rest of that life. Every screen must agree, because the room
 * holds the list and the next cut splits it.
 *
 *  1. A cuts B. B keeps what was above the cut, A tows the rest.
 *  2. B restarts (R): fifty metres again, B's colour, on all three screens.
 *  3. A, towing its captured paper past fifty, restarts: it keeps it all.
 *  4. C flies past 120 km/h and tears, then crashes and restarts: fifty.
 *  5. The round ends, the next counts down fresh, B is cut and restarts
 *     again, and the round after that lays fifty for everyone too.
 *
 * Every step's paper, as each page holds it, is logged to outdir/log.jsonl.
 * By hand, against a local rooms server (never the live one):
 *
 *   ROOMS_DB=<scratch>/rooms.db PORT=8797 node edge/rooms/node.js
 *   SIM_GPU=1 node scripts/combat-respawn-pages.js http://127.0.0.1:8797 [outdir]
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
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { FULL_LINKS as FULL } from '../edge/rooms/combat.js';
import { hullFor } from '../src/game/midair.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const outDir = process.argv[3] || join(root, 'build', 'combat-respawn');
const logPath = join(outDir, 'log.jsonl');

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

function seedFor(airframe, colour, crashDamage) {
  const s = seatAirframe({ airframe, rates: airframeById(airframe).rates }, airframe);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = crashDamage;
  s.livery = { [airframe]: { regions: { wing: colour, fuselage: colour, tail: colour, frame: colour } } };
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

/* What a page holds of every seat's paper: its own towed length, the
 * room's list and owed for each seat, and each peer's drawn streamer. */
const SNAP = `(() => {
  const c = window.__combat();
  const s = window.__craftState();
  return {
    seat: c.seat, state: c.round.state, round: c.round.round, mode: s.mode, wrecked: window.__crash().wrecked,
    own: c.paper ? c.paper.links : null,
    owed: Object.fromEntries(c.round.scores.map((x) => [x.seat, x.owed])),
    runs: c.runs,
    drawn: Object.fromEntries(c.peers.map((p) => [p.seat, ((p.chains.find((x) => x.id === 0) || { n: 1 }).n) - 1])),
  };
})()`;

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`combat respawn, three pages, rooms at ${rooms}`);
await mkdir(outDir, { recursive: true });
await writeFile(logPath, '');
const pages = {
  A: await openPage({ root, url, width: 960, height: 540, seed: seedFor('interceptor', '#e8352e', false) }),
  B: await openPage({ root, url, width: 960, height: 540, seed: seedFor('cub1400', '#2f6fe0', false) }),
  C: await openPage({ root, url, width: 960, height: 540, seed: seedFor('interceptor', '#2fc05a', true) }),
};
const { A: a, B: b, C: c } = pages;
const all = [a, b, c];
const seat = {};

async function snap(label) {
  const got = {};
  for (const [name, p] of Object.entries(pages)) {
    got[name] = await p.evaluate(SNAP);
  }
  await appendFile(logPath, `${JSON.stringify({ t: Date.now(), label, ...got })}\n`);
  const line = Object.entries(got).map(([n, s]) => `${n}:own ${s.own} owed ${JSON.stringify(s.owed)} drawn ${JSON.stringify(s.drawn)}`).join(' | ');
  console.log(`  [${label}] ${got.A.state} r${got.A.round}  ${line}`);
  return got;
}

/* Whether every page says seat s tows `want` links: its owner towing
 * them, the room's list on every page that long, every other page
 * drawing them; and the lists the same everywhere. */
function agree(got, s, want) {
  const pageOf = Object.values(got).find((x) => x.seat === s);
  const lists = Object.values(got).map((x) => JSON.stringify(x.runs[s]));
  const listLen = (x) => (x.runs[s] || []).reduce((n, r) => n + r[1], 0);
  return pageOf.own === want
    && Object.values(got).every((x) => x.owed[s] === want && listLen(x) === want)
    && Object.values(got).filter((x) => x.seat !== s).every((x) => x.drawn[s] === want)
    && lists.every((l) => l === lists[0]);
}
const said = (got, s) => `${Object.entries(got).map(([n, x]) => `${n} ${x.seat === s ? `own ${x.own}` : `draws ${x.drawn[s]}`} owed ${x.owed[s]}`).join(', ')}; list ${JSON.stringify(got.A.runs[s])}`;

/* Wait until every page agrees on seat s at `want`, or ms pass. */
async function settle(s, want, label, ms = 6000) {
  const end = Date.now() + ms;
  let got = await snap(label);
  while (!agree(got, s, want) && Date.now() < end) {
    await a.sleep(500);
    got = await snap(label);
  }
  return got;
}

/* Hold a pilot still high over the ground, its paper hanging. */
async function hang(p, dx, dz, fresh) {
  return p.evaluate(`(() => {
    const s = window.__craftState();
    const x = s.worldX + ${dx}, z = s.worldZ + ${dz};
    const y = window.__heightAt(x, z) + 62;
    return window.__crashThrow({ x, y, z, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: ${fresh} });
  })()`);
}

/* R, as the pilot presses it, then back in the air: a restart. */
async function restart(p) {
  /* Let go of a held throw first: R does nothing to a craft the check holds. */
  await p.evaluate('window.__releasePose(); true');
  await p.tap('KeyR');
  await p.until("window.__craftState().mode === 'flight' && !window.__crash().wrecked", 10000).catch(() => {});
}

/* A flies past `victim`'s hanging paper, 2.7 m off at `depth` metres
 * down, at 10 m/s, as combat-two-page.js does. */
const h5 = hullFor('interceptor').hull;
let side = 0;
for (let i = 0; i < h5.n; i += 1) {
  side = Math.max(side, Math.abs(h5.cx[i]) + h5.hx[i]);
}
async function cutPast(victim, depth) {
  const before = (await a.evaluate('window.__combat()')).cuts.length;
  const thrown = await a.evaluate(`(() => {
    const c = window.__combat();
    const peer = c.peers.find((p) => p.seat === ${victim});
    const n = peer.chains.find((x) => x.id === 0).nodes[${depth}];
    return window.__crashThrow({ x: n[0] + 8, y: n[1], z: n[2] + ${2.7 + side}, yaw: 90, pitch: 0, roll: 0, vx: -10, vy: 0, vz: 0, hold: true, fresh: false });
  })()`);
  await a.sleep(6500);
  await a.evaluate('window.__releasePose(); true');
  await a.until(`window.__combat().cuts.length > ${before}`, 8000).catch(() => {});
  await a.sleep(1500);
  const cuts = (await a.evaluate('window.__combat()')).cuts;
  return { thrown, cut: cuts.length > before ? cuts[cuts.length - 1] : null };
}

try {
  for (const p of all) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
    await p.tap('KeyZ');
  }
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  for (const p of [b, c]) {
    await p.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
    await p.until("window.__rooms().phase === 'open'", 30000);
  }
  for (const p of all) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 2 && window.__rooms().roomNow != null", 30000);
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of all) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  for (const [name, p] of Object.entries(pages)) {
    seat[name] = await p.evaluate("window.__rooms().welcome ? window.__rooms().welcome.seat : window.__combat().seat");
  }
  check('three in one room, flying', seat.A > 0 && seat.B > 0 && seat.C > 0, JSON.stringify(seat));

  await hang(b, 40, 40, true);
  await hang(c, -60, 60, true);
  await a.evaluate("window.__ui.act('friends-combat-3'); true");
  for (const p of all) {
    await p.until("window.__combat().round.state === 'on'", 45000);
  }
  for (const p of all) {
    await p.until('window.__combat().seat > 0', 5000);
  }
  seat.A = await a.evaluate('window.__combat().seat');
  seat.B = await b.evaluate('window.__combat().seat');
  seat.C = await c.evaluate('window.__combat().seat');
  await a.sleep(1500);
  let got = await snap('round 1 on');
  check('everyone tows fifty metres, on every screen', agree(got, seat.A, FULL) && agree(got, seat.B, FULL) && agree(got, seat.C, FULL), said(got, seat.B));

  console.log('1. A cuts B');
  const one = await cutPast(seat.B, 25);
  check('A cuts B\'s paper', Boolean(one.cut) && one.cut.victim === seat.B, JSON.stringify(one.cut || one.thrown).slice(0, 120));
  const keep = one.cut ? one.cut.keep : 0;
  const took = FULL - keep;
  got = await settle(seat.B, keep, 'B cut');
  check(`B keeps its first ${keep} m, on every screen`, agree(got, seat.B, keep), said(got, seat.B));
  got = await settle(seat.A, FULL + took, 'A captured');
  check(`A tows ${FULL + took} m, on every screen`, agree(got, seat.A, FULL + took), said(got, seat.A));

  console.log('2. B restarts');
  await restart(b);
  await b.sleep(1500);
  got = await settle(seat.B, FULL, 'B restarted');
  check(`B, cut to ${keep} m, restarts with ${FULL} m, and every screen agrees`, agree(got, seat.B, FULL), said(got, seat.B));
  check('in B\'s own colour', JSON.stringify(got.A.runs[seat.B]) === JSON.stringify([[seat.B, FULL]]), JSON.stringify(got.A.runs[seat.B]));

  console.log('3. A restarts with its captured paper');
  await restart(a);
  await a.sleep(1500);
  got = await settle(seat.A, FULL + took, 'A restarted');
  check(`A, towing ${FULL + took} m, restarts with all ${FULL + took} m, and every screen agrees`, agree(got, seat.A, FULL + took), said(got, seat.A));
  check('its colours as they were', JSON.stringify(got.A.runs[seat.A]) === JSON.stringify([[seat.A, FULL], [seat.B, took]]), JSON.stringify(got.A.runs[seat.A]));

  console.log('4. C tears, crashes, restarts');
  await c.evaluate(`(() => {
    const s = window.__craftState();
    const x = s.worldX, z = s.worldZ;
    const y = window.__heightAt(x, z) + 90;
    window.__crashThrow({ x, y, z, yaw: 90, pitch: 0, roll: 0, vx: -45, vy: 0, vz: 0, hold: true, fresh: false });
    return true;
  })()`);
  await c.sleep(2500);
  await c.evaluate('window.__releasePose(); true');
  await c.sleep(2500);
  got = await snap('C at 160 km/h');
  const torn = got.C.owed[seat.C];
  check('C, over 120 km/h, tears its paper and the room takes it off C\'s list', torn < FULL && got.C.own === torn, `own ${got.C.own} owed ${torn}`);
  await c.evaluate(`(() => {
    const s = window.__craftState();
    const x = s.worldX + 20, z = s.worldZ;
    const y = window.__heightAt(x, z) + 8;
    window.__crashThrow({ x, y, z, yaw: 0, pitch: -80, roll: 0, vx: 0, vy: -30, vz: 0, hold: false, fresh: false });
    return true;
  })()`);
  await c.until('window.__crash().wrecked', 5000).catch(() => {});
  await c.sleep(1500);
  got = await snap('C crashed');
  check('C crashes: a wreck', got.C.wrecked === true, `mode ${got.C.mode} wrecked ${got.C.wrecked}`);
  await restart(c);
  await c.sleep(1500);
  got = await settle(seat.C, FULL, 'C restarted');
  check(`C, torn to ${torn} m and crashed, restarts with ${FULL} m, and every screen agrees`, agree(got, seat.C, FULL), said(got, seat.C));

  console.log('5. round after round');
  const r1 = got.A.round;
  for (let k = 1; k <= 2; k += 1) {
    await a.until(`window.__combat().round.round === ${r1 + k} && window.__combat().round.state === 'countdown'`, 240000).catch(() => {});
    await hang(b, 30 * k, -30, false);
    await a.sleep(3000);
    got = await snap(`round ${r1 + k} countdown`);
    check(`round ${r1 + k} counts down with fifty metres for everyone, on every screen`, [seat.A, seat.B, seat.C].every((s) => agree(got, s, FULL)),
      [seat.A, seat.B, seat.C].map((s) => said(got, s)).join(' || '));
    if (k === 2) {
      break;
    }
    for (const p of all) {
      await p.until("window.__combat().round.state === 'on'", 30000).catch(() => {});
    }
    const next = await cutPast(seat.B, 20);
    const keep2 = next.cut ? next.cut.keep : null;
    got = await settle(seat.B, keep2, `round ${r1 + k} B cut`);
    check(`round ${r1 + k}: A cuts B again, to ${keep2} m on every screen`, keep2 != null && agree(got, seat.B, keep2), said(got, seat.B));
    await restart(b);
    await b.sleep(1500);
    got = await settle(seat.B, FULL, `round ${r1 + k} B restarted`);
    check(`round ${r1 + k}: B restarts with ${FULL} m again, on every screen`, agree(got, seat.B, FULL), said(got, seat.B));
    /* The round runs out while the clock is sampled. */
    while ((await a.evaluate('window.__combat().round.state')) === 'on') {
      await a.sleep(10000);
      await snap(`round ${r1 + k} on`);
    }
  }

  const errs = all.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on any page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  for (const p of all) {
    await p.close();
  }
}
console.log(`\nlog: ${logPath}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
