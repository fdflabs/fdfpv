/*
 * war-grid-check.js: the night raid's power outages are the room's, the
 * same on every screen (src/share/war/grid.js).
 *
 * A recorded room sequence of a night raid, in the messages
 * edge/rooms/war.js sends (the view, then the dead records of the same
 * tick, as its tick orders them): a hit on intake 3, a second hit on the
 * same unit's penstock, a miss, a gate, an east intake, then the
 * switchyard, and a struck line through the hook grid.js keeps for it. It
 * is fed to clients of src/share/roomwar.js, each with its own grid
 * tracker, as the shell feeds them (src/main.js roomWarFrame):
 *
 *   A   hears each tick as it is sent, framed at 60 fps
 *   B   hears each tick 230 ms later, its records in the other order (the
 *       dead records before the view), framed at an uneven 13 to 41 ms
 *   C   joins after the last hit, from a welcome alone
 *
 * and asserts:
 *
 *   steps    after each hit's flicker, exactly the districts the grid's
 *            rules put out are dark (listed below), and none comes back
 *   agree    at every room ms both A and B have heard everything before,
 *            their levels are bit for bit the same, flicker included
 *   cascade  the yard's districts go out one after another, CASCADE_MS
 *            apart, and each flickers (both on and off) before it is dark
 *   late     C, which heard no hit's time, has the same districts dark as
 *            A once A's cascade is over
 *   reset    a new match (another view id) lights everything again
 *
 *   node scripts/war-grid-check.js
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

import { createRoomWar } from '../src/share/roomwar.js';
import {
  createGrid, DISTRICTS, CASCADE_MS, FLICKER_MS, districtIndex,
} from '../src/share/war/grid.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failed += 1;
  }
};

/* The recorded sequence: per room tick, the messages in the order the
 * room sends them. */
const MATCH = 'm-night-1';
const view = (down, extra = {}) => ({
  type: 'war',
  war: {
    state: 'live', id: MATCH, mission: 'itaipu-4', goAt: 0, output: 14000 - down.length * 700, floor: 7700, down, ...extra,
  },
});
let nextId = 100;
const dead = (at, target, hit) => ({
  type: 'war', op: 'dead', ids: [nextId += 1], at, by: 0, why: 'arrive', p: [0, 200, 0], target, hit,
});
const TICKS = [
  { t: 0, msgs: [view([])] },
  { t: 10000, msgs: [view(['intake-3']), dead(10000, 'intake-3', true)] },
  { t: 20000, msgs: [view(['intake-3', 'penstock-3']), dead(20000, 'penstock-3', true)] },
  { t: 25000, msgs: [dead(25000, 'intake-7', false)] },
  { t: 30000, msgs: [view(['intake-3', 'penstock-3', 'gate-5']), dead(30000, 'gate-5', true)] },
  { t: 40000, msgs: [view(['intake-3', 'penstock-3', 'gate-5', 'intake-14']), dead(40000, 'intake-14', true)] },
  { t: 50000, msgs: [view(['intake-3', 'penstock-3', 'gate-5', 'intake-14', 'yard-right']), dead(50000, 'yard-right', true)] },
];
/* The struck line (grid.js's hook): a strike 300 m from Foz do Iguacu's
 * northern district's seed, which its nearest town district is. */
const WIRE = {
  type: 'war', op: 'dead', ids: [], at: 70000, by: 0, why: 'wire', p: [1200, 230, 4400],
};
const END = 80000;

/* What is dark once each step's cascade is over, by the grid's rules. */
const PY_TOWNS = DISTRICTS.filter((d) => d.bus === 'py').map((d) => d.id);
const EXPECT = [
  { at: 9000, dark: [] },
  { at: 10000 + 3 * CASCADE_MS + FLICKER_MS, dark: ['dam-0', 'hernandarias-w'] },
  { at: 20000 + FLICKER_MS + 100, dark: ['dam-0', 'hernandarias-w'] },
  { at: 25000 + FLICKER_MS + 100, dark: ['dam-0', 'hernandarias-w'] },
  { at: 30000 + FLICKER_MS + 100, dark: ['dam-0', 'hernandarias-w', 'spillway'] },
  { at: 40000 + CASCADE_MS + FLICKER_MS + 100, dark: ['dam-0', 'hernandarias-w', 'spillway', 'dam-2', 'vila-c'] },
  { at: 50000 + 10 * CASCADE_MS + FLICKER_MS, dark: ['dam-0', 'spillway', 'dam-2', 'vila-c', 'yard', ...PY_TOWNS] },
  { at: END - 1, dark: ['dam-0', 'spillway', 'dam-2', 'vila-c', 'yard', ...PY_TOWNS, 'foz-north'] },
];

function client() {
  const war = createRoomWar(() => {});
  const grid = createGrid();
  war.onWelcome({ seat: 1, war: { state: 'lobby' } });
  return {
    war,
    grid,
    deliver(msgs) {
      for (const m of msgs) {
        war.onMessage(m);
      }
    },
    /* One frame of the shell at room ms t: its events heard, then the
     * levels read (src/main.js roomWarFrame). */
    frame(t) {
      grid.hear(war.takeEvents(), war.view());
      return grid.levels(war.view(), t).slice();
    },
    state(t) {
      return grid.state(war.view(), t);
    },
  };
}

/* A client fed the ticks with `lag` ms of delay, frames every `step(k)`
 * ms; `swap` delivers each tick's records in the other order. Returns its
 * frames, [{ t, levels }], and the client. */
function run(lag, step, swap) {
  const c = client();
  const inbox = [...TICKS.map((k) => ({ t: k.t + lag, msgs: swap ? [...k.msgs].reverse() : k.msgs })), { t: WIRE.at + lag, msgs: [WIRE] }];
  const frames = [];
  let t = 0;
  let k = 0;
  while (t < END) {
    while (inbox.length && inbox[0].t <= t) {
      c.deliver(inbox.shift().msgs);
    }
    frames.push({ t, levels: c.frame(t) });
    t += step(k);
    k += 1;
  }
  return { frames, c };
}

const A = run(0, () => 16, false);
const jitter = [13, 41, 22, 17, 35, 29];
const B = run(230, (k) => jitter[k % jitter.length], true);

console.log('steps: the districts dark once each hit\'s cascade is over (A)');
for (const e of EXPECT) {
  const s = A.c.state(e.at);
  const dark = Object.keys(s).filter((id) => s[id] === 'dark').sort();
  const want = [...e.dark].sort();
  check(`at ${e.at} ms`, JSON.stringify(dark) === JSON.stringify(want), `dark ${dark.join(', ') || 'none'}${JSON.stringify(dark) === JSON.stringify(want) ? '' : `; want ${want.join(', ')}`}`);
}

console.log('agree: A and B, at every room ms both have heard everything before it');
{
  /* The last moment each client had not yet heard: a tick's time plus
   * B's lag. A sample at t is comparable once both heard every tick at or
   * before t, so B's frames inside [tick, tick + lag) are left out. */
  const heardBy = (t) => TICKS.concat([{ t: WIRE.at }]).every((k) => k.t > t || k.t + 230 <= t);
  let compared = 0;
  let differ = 0;
  let firstDiff = '';
  for (const fb of B.frames) {
    if (!heardBy(fb.t)) {
      continue;
    }
    const levelsA = A.c.grid.levels(A.c.war.view(), fb.t);
    compared += 1;
    for (let i = 0; i < levelsA.length; i += 1) {
      if (levelsA[i] !== fb.levels[i]) {
        differ += 1;
        firstDiff ||= `${DISTRICTS[i].id} at ${fb.t}: A ${levelsA[i]}, B ${fb.levels[i]}`;
        break;
      }
    }
  }
  check('the same levels, bit for bit', compared > 2000 && differ === 0, `${compared} of B's frames compared, ${differ} differ${firstDiff ? ` (first: ${firstDiff})` : ''}`);
  /* Replayed: A's view now holds everything, so each of A's own frames
   * from before a later hit must still read the same levels at its t
   * (a hit never reaches back before its own at). */
  let back = 0;
  for (const fa of A.frames) {
    const now = A.c.grid.levels(A.c.war.view(), fa.t);
    if (now.some((v, i) => v !== fa.levels[i])) {
      back += 1;
    }
  }
  check('a later hit never changes what an earlier moment showed', back === 0, `${back} of ${A.frames.length} frames changed`);
}

console.log('cascade: the yard\'s districts, one after another, each flickering');
{
  const out = PY_TOWNS.filter((id) => id !== 'hernandarias-w').concat(['yard']);
  const from = A.c.grid.from(A.c.war.view());
  const starts = out.map((id) => from[districtIndex(id)]).sort((a, b) => a - b);
  const gaps = starts.slice(1).map((s, k) => s - starts[k]);
  check('staggered CASCADE_MS apart from the hit', starts[0] === 50000 && gaps.every((g) => g === CASCADE_MS), `starts ${starts.join(', ')}`);
  for (const id of out) {
    const i = districtIndex(id);
    const f = from[i];
    const seen = A.frames.filter((fr) => fr.t >= f && fr.t < f + FLICKER_MS).map((fr) => fr.levels[i]);
    const on = seen.filter((v) => v > 0).length;
    const off = seen.filter((v) => v === 0).length;
    const before = A.frames.filter((fr) => fr.t < f && fr.t > f - 1000).every((fr) => fr.levels[i] === 1);
    const after = A.frames.filter((fr) => fr.t >= f + FLICKER_MS).every((fr) => fr.levels[i] === 0);
    check(`${id} lit, flickers, then dark`, before && on > 0 && off > 0 && after, `${on} frames on and ${off} off in its flicker`);
  }
}

console.log('late: a screen that joins after the hits');
{
  const C = client();
  const last = TICKS[TICKS.length - 1].msgs[0].war;
  C.war.onWelcome({ seat: 3, war: last });
  C.frame(60000);
  const a = A.c.state(60000);
  const c = C.state(60000);
  /* A heard the struck line at 70 s, C's welcome is from before it. */
  const same = Object.keys(a).every((id) => a[id] === c[id]);
  check('the same districts dark as A once A\'s cascade is over', same, Object.keys(a).filter((id) => a[id] !== c[id]).map((id) => `${id} A ${a[id]} C ${c[id]}`).join(', '));
}

console.log('reset: the next match');
{
  A.c.deliver([{ type: 'war', war: { state: 'live', id: 'm-night-2', mission: 'itaipu-4', down: [] } }]);
  const lv = A.c.frame(END + 1000);
  check('every district lit again', lv.every((v) => v === 1), `${lv.filter((v) => v !== 1).length} not lit`);
}

if (failed) {
  console.error(`FAIL, ${failed} problem(s)`);
  process.exit(1);
}
console.log('PASS, every screen has the same districts dark at the same room ms');
