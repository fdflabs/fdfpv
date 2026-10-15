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
 * and a second sequence, Lights Out's reroute (MISSIONS.md M3, TECH-NEEDS
 * T1.10): the yard hit, then the view's restore of four right bank towns
 * (as itaipu-3.js's reroute names them, far first), then five west
 * units lost one by one:
 *
 *   restore  the four come back after the restore and the yard's other
 *            districts stay dark; each comes back CASCADE_MS after the
 *            one before it, in the order named, flickering (both on and
 *            off) for FLICKER_MS before it is lit; A and B agree bit for
 *            bit; the restore changes no earlier moment; a screen that
 *            joins after it has the same lit; a unit lost later sheds a
 *            fed town by its keep (Ciudad del Este at half the side)
 *   control  the same sequence without the restore (a failed reroute,
 *            which the room records nothing for) brings nothing back
 *   before   a restore before the yard is hit keeps the four lit through
 *            the hit, the yard's other districts going out as before
 *
 * and a third, The Corridor's (MISSIONS.md M6): a tower on the east
 * corridor hit, the yard, the west corridor's towns islanded, every west
 * unit lost, then a tower of that corridor hit:
 *
 *   towers   a tower hit puts out the town nearest it as a struck line
 *            does, flickering; islanded towns come back with the yard
 *            down and stay lit through every west unit lost; a tower of
 *            theirs hit still cuts its own; A and B agree bit for bit; a
 *            late joiner agrees; not islanded, they stay dark. The crash
 *            cam's replay is not held to it: its clip keeps a restore as
 *            { at, districts } (src/replay/file.js version 20), so an
 *            islanding replays as a restore, and a tower's hit only on a
 *            mission that names towers
 *
 *   replay   A's frames recorded as the crash cam records them (src/
 *            replay/warrec.js, fed the view and the deaths as src/replay/
 *            crashcam.js tapWar feeds it) and replayed (worldAt, src/
 *            share/war/world.js matchAt): at every row the replay's
 *            levels are the live frame's, bit for bit, so the four come
 *            back in the order named; the failed reroute's replay too
 *
 *   node scripts/war-grid-check.js
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

import { createRoomWar } from '../src/share/roomwar.js';
import { checkWar, createWarRing, worldAt } from '../src/replay/warrec.js';
import {
  createGrid, DISTRICTS, CASCADE_MS, FLICKER_MS, districtIndex,
} from '../src/share/war/grid.js';
import { STATION_DARK_DISTRICTS, stationOrder } from '../src/share/war/stationdark.js';

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

/* `ring`, a warrec.js ring of a row a frame, records each frame as the
 * crash cam does: the view and the room ms when the shell takes the
 * events, then each death. */
function client(ring = null) {
  const war = createRoomWar(() => {});
  const grid = createGrid();
  war.onWelcome({ seat: 1, war: { state: 'lobby' } });
  let row = 0;
  const take = (t) => {
    const evs = war.takeEvents();
    if (ring) {
      const v = war.view();
      ring.begin(row);
      row += 1;
      ring.world(war.match(), v.mission, v.down, war.on(), t, v.restores, v.stationDark);
      for (const ev of evs) {
        if (ev.type === 'dead') {
          ring.dead(ev);
        } else if (ev.type === 'damage') {
          ring.damage(ev);
        }
      }
    }
    return evs;
  };
  return {
    war,
    grid,
    deliver(msgs) {
      for (const m of msgs) {
        war.onMessage(m);
      }
    },
    /* One frame of the shell at room ms t: its events heard, then the
     * levels read (src/main.js roomWarFrame), under the view's order to
     * put the station's lights out (warLiveWorld). */
    frame(t) {
      grid.hear(take(t), war.view());
      return stationOrder(grid.levels(war.view(), t).slice(), war.view().stationDark, t);
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

/* Lights Out's reroute (MISSIONS.md M3). */
const RESTORED = ['ciudad-del-este', 'hernandarias-far', 'acaray', 'hernandarias-s'];
const UNFED = PY_TOWNS.filter((id) => !RESTORED.includes(id));
const R_MATCH = 'm-dusk-1';
const rview = (down, restores) => ({
  type: 'war',
  war: {
    state: 'live', id: R_MATCH, mission: 'itaipu-3', goAt: 0, output: 14000, floor: 9700, down, restores,
  },
});
const BACK_AT = 60000;
const R_END = 150000;
/* The ticks of a match whose yard falls at `yardAt` and whose reroute
 * holds at `holdAt` (null: it fails, and the room records no restore). */
function reroute(yardAt, holdAt) {
  const restores = (t) => (holdAt != null && t >= holdAt ? [{ at: holdAt, districts: RESTORED }] : []);
  const ticks = [];
  let down = [];
  const events = [{ t: yardAt, target: 'yard-right' }, ...[0, 1, 2, 3, 4].map((u) => ({ t: 90000 + 10000 * u, target: `intake-${u}` }))];
  for (const t of [0, yardAt, ...(holdAt != null ? [holdAt] : []), ...events.slice(1).map((e) => e.t)].sort((a, b) => a - b)) {
    const hit = events.find((e) => e.t === t);
    if (hit) {
      down = [...down, hit.target];
    }
    ticks.push({ t, msgs: [rview(down, restores(t)), ...(hit ? [dead(t, hit.target, true)] : [])] });
  }
  return ticks;
}
function runTicks(ticks, lag, step, swap, end, ring = null) {
  const c = client(ring);
  const inbox = ticks.map((k) => ({ t: k.t + lag, msgs: swap ? [...k.msgs].reverse() : k.msgs }));
  const frames = [];
  let t = 0;
  let k = 0;
  while (t < end) {
    while (inbox.length && inbox[0].t <= t) {
      c.deliver(inbox.shift().msgs);
    }
    frames.push({ t, levels: c.frame(t) });
    t += step(k);
    k += 1;
  }
  return { frames, c };
}
const darkAt = (c, t) => {
  const s = c.state(t);
  return Object.keys(s).filter((id) => s[id] === 'dark').sort();
};
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

console.log('restore: the yard hit, the reroute holds, four towns come back');
{
  const ticks = reroute(10000, BACK_AT);
  const RA = runTicks(ticks, 0, () => 16, false, R_END);
  const RB = runTicks(ticks, 230, (k) => jitter[k % jitter.length], true, R_END);
  const settled = BACK_AT + RESTORED.length * CASCADE_MS + FLICKER_MS;
  const before = darkAt(RA.c, BACK_AT - 1);
  check('before the restore the yard and every right bank town are dark', same(before, ['yard', ...PY_TOWNS]), `dark ${before.join(', ')}`);
  const after = darkAt(RA.c, settled);
  check(`after it the four are lit (${RESTORED.join(', ')}), the yard and the other four dark`, same(after, ['yard', ...UNFED]), `dark ${after.join(', ')}`);
  const changes = RA.c.grid.changes(RA.c.war.view());
  const starts = RESTORED.map((id) => changes[districtIndex(id)].find((x) => x.on)?.at);
  check('each comes back CASCADE_MS after the one before, in the order named, from the restore',
    starts.every((at, k) => at === BACK_AT + k * CASCADE_MS), `starts ${starts.join(', ')}`);
  for (const id of RESTORED) {
    const i = districtIndex(id);
    const f = changes[i].find((x) => x.on).at;
    const seen = RA.frames.filter((fr) => fr.t >= f && fr.t < f + FLICKER_MS).map((fr) => fr.levels[i]);
    const on = seen.filter((v) => v > 0).length;
    const off = seen.filter((v) => v === 0).length;
    const dim = RA.frames.filter((fr) => fr.t < f && fr.t > f - 1000).every((fr) => fr.levels[i] === 0);
    const lit = RA.frames.filter((fr) => fr.t >= f + FLICKER_MS && fr.t < 100000).every((fr) => fr.levels[i] === 1);
    /* The hit's flicker played backwards: rarer near the start, as the
     * hit's is near its end. */
    const half = (lo, hi) => seen.slice(Math.floor(lo * seen.length), Math.floor(hi * seen.length)).filter((v) => v > 0).length;
    check(`${id} dark, flickers back, then lit`, dim && on > 0 && off > 0 && lit && half(0, 0.5) < half(0.5, 1),
      `${on} frames on and ${off} off over its ${FLICKER_MS} ms, ${half(0, 0.5)} on in the first half and ${half(0.5, 1)} in the second`);
  }
  const heardBy = (t) => ticks.every((k) => k.t > t || k.t + 230 <= t);
  let compared = 0;
  let differ = 0;
  for (const fb of RB.frames) {
    if (!heardBy(fb.t)) {
      continue;
    }
    compared += 1;
    const la = RA.c.grid.levels(RA.c.war.view(), fb.t);
    differ += la.some((v, i) => v !== fb.levels[i]) ? 1 : 0;
  }
  check('A and B the same levels, bit for bit, through the restore', compared > 2000 && differ === 0, `${compared} of B's frames compared, ${differ} differ`);
  let back = 0;
  for (const fa of RA.frames) {
    const now = RA.c.grid.levels(RA.c.war.view(), fa.t);
    back += now.some((v, i) => v !== fa.levels[i]) ? 1 : 0;
  }
  check('the restore and the later losses never change what an earlier moment showed', back === 0, `${back} of ${RA.frames.length} frames changed`);
  const C = client();
  C.war.onWelcome({ seat: 3, war: ticks.find((k) => k.t === BACK_AT).msgs[0].war });
  C.frame(settled);
  check('a screen that joins after the restore has the same districts dark', same(darkAt(C, settled), darkAt(RA.c, settled)),
    `C ${darkAt(C, settled).join(', ')}`);
  /* Five west units lost (90 to 130 s): the side at 0.5, under Ciudad del
   * Este's keep of 0.55, over the other three's; the first quarter of the
   * dam's own lights with them (its units 0 to 4). */
  const shed = darkAt(RA.c, R_END - 1);
  check('a unit lost after the restore sheds a fed town by its keep: Ciudad del Este at half the side, the other three lit',
    same(shed, ['yard', ...UNFED, 'ciudad-del-este', 'dam-0']), `dark ${shed.join(', ')}`);
}

console.log('control: the reroute fails, nothing comes back');
{
  const ticks = reroute(10000, null);
  const RA = runTicks(ticks, 0, () => 16, false, R_END);
  const at = [BACK_AT + RESTORED.length * CASCADE_MS + FLICKER_MS, R_END - 1].map((t) => darkAt(RA.c, t));
  check('the yard and every right bank town stay dark to the end (the dam\'s first quarter too, once its units go)',
    same(at[0], ['yard', ...PY_TOWNS]) && same(at[1], ['yard', ...PY_TOWNS, 'dam-0']), at.map((d) => d.join(' ')).join(' | '));
  check('and no district ever comes back on', RA.c.grid.changes(RA.c.war.view()).every((c) => c.every((x) => !x.on)));
}

console.log('before: a reroute that held before the yard was hit');
{
  const ticks = reroute(70000, 20000);
  const RA = runTicks(ticks, 0, () => 16, false, 90000);
  const d = darkAt(RA.c, 70000 + 10 * CASCADE_MS + FLICKER_MS);
  check('the four stay lit through the hit, the yard and the other four go out', same(d, ['yard', ...UNFED]), `dark ${d.join(', ')}`);
  const flick = RESTORED.filter((id) => RA.frames.some((fr) => fr.levels[districtIndex(id)] !== 1));
  check('and never so much as flicker', flick.length === 0, flick.join(', '));
}

/* The Corridor's towers and its islanding (MISSIONS.md M6): a tower on
 * the east corridor hit, the yard hit, the last corridor's towns islanded,
 * every west unit lost, then a tower of the islanded corridor hit. The
 * view names a mission this build has; the grid reads only the hits and
 * the restores. */
const ISLAND = ['hernandarias-s', 'hernandarias-w'];
const ISLAND_AT = 40000;
const I_END = 140000;
function corridor(islandAt) {
  const restores = (t) => (islandAt != null && t >= islandAt ? [{ at: islandAt, districts: ISLAND, island: true }] : []);
  const events = [{ t: 10000, target: 'tower-e-12' }, { t: 20000, target: 'yard-right' },
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((u) => ({ t: 60000 + 4000 * u, target: `intake-${u}` })), { t: 120000, target: 'tower-w-0' }];
  const ticks = [];
  let down = [];
  for (const t of [0, ...events.map((e) => e.t), ...(islandAt != null ? [islandAt] : [])].sort((a, b) => a - b)) {
    const hit = events.find((e) => e.t === t);
    if (hit) {
      down = [...down, hit.target];
    }
    ticks.push({ t, msgs: [rview(down, restores(t)), ...(hit ? [dead(t, hit.target, true)] : [])] });
  }
  return ticks;
}

console.log('towers: a corridor tower hit is a struck line there; an islanded corridor\'s towns stay lit');
{
  const ticks = corridor(ISLAND_AT);
  const IA = runTicks(ticks, 0, () => 16, false, I_END);
  const IB = runTicks(ticks, 230, (k) => jitter[k % jitter.length], true, I_END);
  const one = darkAt(IA.c, 10000 + FLICKER_MS + 100);
  check('tower-e-12 hit: the town nearest it, Vila C, goes dark, and nothing else', same(one, ['vila-c']), `dark ${one.join(', ')}`);
  const i = districtIndex('vila-c');
  const seen = IA.frames.filter((fr) => fr.t >= 10000 && fr.t < 10000 + FLICKER_MS).map((fr) => fr.levels[i]);
  check('it flickers out as a struck line does', seen.some((v) => v > 0) && seen.some((v) => v === 0), `${seen.filter((v) => v > 0).length} on, ${seen.filter((v) => v === 0).length} off`);
  const yard = darkAt(IA.c, ISLAND_AT - 1);
  check('the yard hit puts out the right bank towns as ever', same(yard, ['vila-c', 'yard', ...PY_TOWNS]), `dark ${yard.join(', ')}`);
  const isl = darkAt(IA.c, ISLAND_AT + ISLAND.length * CASCADE_MS + FLICKER_MS);
  check(`islanded, ${ISLAND.join(' and ')} come back with the yard down`, same(isl, ['vila-c', 'yard', ...PY_TOWNS.filter((id) => !ISLAND.includes(id))]), `dark ${isl.join(', ')}`);
  const shed = darkAt(IA.c, 119999);
  check('every west unit lost, both stay lit (a restore\'s town would be shed by its keep)', ISLAND.every((id) => !shed.includes(id)), `dark ${shed.join(', ')}`);
  const cutIn = darkAt(IA.c, I_END - 1);
  check('a tower of the islanded corridor hit still cuts the town nearest it, Hernandarias south, and only it',
    cutIn.includes('hernandarias-s') && !cutIn.includes('hernandarias-w'), `dark ${cutIn.join(', ')}`);
  const heardBy = (t) => ticks.every((k) => k.t > t || k.t + 230 <= t);
  let compared = 0;
  let differ = 0;
  for (const fb of IB.frames) {
    if (!heardBy(fb.t)) {
      continue;
    }
    compared += 1;
    const la = IA.c.grid.levels(IA.c.war.view(), fb.t);
    differ += la.some((v, j) => v !== fb.levels[j]) ? 1 : 0;
  }
  check('A and B the same levels, bit for bit, through the towers and the islanding', compared > 2000 && differ === 0, `${compared} of B's frames compared, ${differ} differ`);
  const C = client();
  C.war.onWelcome({ seat: 3, war: ticks.at(-1).msgs[0].war });
  C.frame(I_END - 1);
  check('a screen that joins at the end has the same districts dark', same(darkAt(C, I_END - 1), cutIn), `C ${darkAt(C, I_END - 1).join(', ')}`);
  const plain = runTicks(corridor(null), 0, () => 16, false, I_END);
  const no = darkAt(plain.c, 119999);
  check('control: not islanded, both stay dark from the yard\'s hit', ISLAND.every((id) => no.includes(id)), `dark ${no.join(', ')}`);
}

console.log('replay: the crash cam\'s replay of the match, against its live frames');
/* A's frames recorded and replayed; the rows, their room ms and levels. */
function replayed(ticks, end) {
  const rows = Math.ceil(end / 16);
  const ring = createWarRing(rows);
  const live = runTicks(ticks, 0, () => 16, false, end, ring);
  const war = ring.clip(0, live.frames.length);
  checkWar(war, live.frames.length);
  const caches = new Map();
  const frames = live.frames.map((f, k) => ({ t: war.clock[k], levels: worldAt(war, live.frames.length, k, 0, caches).levels.slice() }));
  return { live: live.frames, war, frames };
}
const differs = (r) => {
  let n = 0;
  let first = '';
  r.frames.forEach((f, k) => {
    const l = r.live[k];
    const i = f.t === l.t ? f.levels.findIndex((v, j) => v !== l.levels[j]) : 0;
    if (f.t !== l.t || i >= 0) {
      n += 1;
      first ||= `row ${k} at ${l.t}: ${DISTRICTS[i].id} replay ${f.levels[i]}, live ${l.levels[i]}`;
    }
  });
  return { n, first };
};
{
  const r = replayed(reroute(10000, BACK_AT), R_END);
  const kept = r.war.world[0].restores;
  check('the clip keeps the view\'s restore, once', JSON.stringify(kept) === JSON.stringify([{ at: BACK_AT, districts: RESTORED }]), JSON.stringify(kept));
  const d = differs(r);
  check('at every row the replay\'s levels are the live frame\'s, bit for bit, through the restore and the later losses', d.n === 0,
    `${r.frames.length} rows, ${d.n} differ${d.first ? ` (first: ${d.first})` : ''}`);
  /* The room ms each comes back at in the replay: its first row lit to
   * stay after the restore. */
  const lit = RESTORED.map((id) => {
    const i = districtIndex(id);
    const k = r.frames.findIndex((f, j) => f.t >= BACK_AT && r.frames.slice(j).every((g) => g.t >= 100000 || g.levels[i] > 0));
    return k < 0 ? null : r.frames[k].t;
  });
  const dark = RESTORED.every((id) => r.frames.filter((f) => f.t > 10000 + 10 * CASCADE_MS + FLICKER_MS && f.t < BACK_AT).every((f) => f.levels[districtIndex(id)] === 0));
  check('in the replay the four are dark until the restore and come back in the order named', dark && lit.every((t, k) => t !== null && (k === 0 || t > lit[k - 1])),
    lit.map((t, k) => `${RESTORED[k]} ${t}`).join(', '));
}
{
  const r = replayed(reroute(10000, null), R_END);
  const d = differs(r);
  check('the failed reroute\'s replay keeps none and is its live frames, bit for bit', !('restores' in r.war.world[0]) && d.n === 0,
    `${r.frames.length} rows, ${d.n} differ${d.first ? ` (first: ${d.first})` : ''}`);
}

/* The Long Night's twist A (src/share/war/missions/itaipu-4.js
 * STATION_DARK, not in the draw yet): the view names the room ms the
 * station's lights went out by order from the stage's entry on, and the
 * recorder keeps it with the match as tapWar does (warrec.js THE
 * ORDER). */
const SD_AT = 30000;
const SD_END = 60000;
function stationDarkTicks() {
  const sview = (down, stationDark) => ({
    type: 'war',
    war: {
      state: 'live', id: 'm-night-sd', mission: 'itaipu-4', goAt: 0, output: 14000, floor: 7700, down, stationDark,
    },
  });
  return [
    { t: 0, msgs: [sview([], null)] },
    { t: 10000, msgs: [sview(['intake-14'], null), dead(10000, 'intake-14', true)] },
    { t: SD_AT, msgs: [sview(['intake-14'], SD_AT)] },
  ];
}
{
  const r = replayed(stationDarkTicks(), SD_END);
  const settled = r.live.filter((f) => f.t >= SD_AT + FLICKER_MS);
  check('live, the station\'s own districts are dark once the order\'s flicker is over',
    settled.length > 0 && settled.every((f) => STATION_DARK_DISTRICTS.every((i) => f.levels[i] === 0)),
    STATION_DARK_DISTRICTS.map((i) => DISTRICTS[i].id).join(', '));
  check('the clip keeps the view\'s order with its match', r.war.world[0].stationDark === SD_AT, String(r.war.world[0].stationDark));
  const d = differs(r);
  check('at every row the recorded clip\'s replay is the live frame\'s, bit for bit, through the order', d.n === 0,
    `${r.frames.length} rows, ${d.n} differ${d.first ? ` (first: ${d.first})` : ''}`);
  const blind = { ...r.war, world: r.war.world.map(({ stationDark, ...m }) => m) };
  const caches = new Map();
  const bare = differs({ ...r, frames: r.live.map((f, k) => ({ t: blind.clock[k], levels: worldAt(blind, r.live.length, k, 0, caches).levels.slice() })) });
  check('the same clip without the order differs from the live frames (the control)', bare.n > 0, `${bare.n} rows differ`);
}

/* A target lost to what a warhead broke, on an arrival that missed it
 * (edge/rooms/war.js strike: its `down` is the blast's, not the aim's):
 * the room's damage event as it sends it, `by` the attacker's kind. */
const LOST_AT = 10000;
const LOST_END = 30000;
function lostTicks() {
  const lview = (down) => ({
    type: 'war',
    war: {
      state: 'live', id: 'm-night-lost', mission: 'itaipu-4', goAt: 0, output: 14000, floor: 7700, down,
    },
  });
  return [
    { t: 0, msgs: [lview([])] },
    {
      t: LOST_AT,
      msgs: [lview(['intake-14']), dead(LOST_AT, 'intake-14', false), {
        type: 'war', op: 'damage', seq: 0, at: LOST_AT, target: 'intake-14', chunks: [0, 1], fell: [1], openings: [], down: true, health: 0, p: [0, 200, 0], by: 'strike', cut: [],
      }],
    },
  ];
}
{
  const ring = createWarRing(Math.ceil(LOST_END / 16));
  const n = runTicks(lostTicks(), 0, () => 16, false, LOST_END, ring).frames.length;
  const kept = ring.clip(0, n).world[0].damage;
  check('the clip keeps the room\'s damage event as the room sends it (by the attacker\'s kind)', ring.stats.damageDropped === 0 && kept.length === 1 && kept[0].by === 'strike',
    `${kept.length} kept, ${ring.stats.damageDropped} dropped`);
  const r = replayed(lostTicks(), LOST_END);
  const out = DISTRICTS.filter((x, i) => r.live.at(-1).levels[i] === 0).map((x) => x.id);
  check('live, the lost intake\'s districts go out from the damage event alone', out.length > 0, `dark ${out.join(', ')}`);
  const d = differs(r);
  check('at every row the replay\'s levels are the live frame\'s, bit for bit, the loss read from the damage event', d.n === 0,
    `${r.frames.length} rows, ${d.n} differ${d.first ? ` (first: ${d.first})` : ''}`);
}

if (failed) {
  console.error(`FAIL, ${failed} problem(s)`);
  process.exit(1);
}
console.log('PASS, every screen has the same districts dark at the same room ms');
