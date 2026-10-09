/*
 * bots-selftest.js: npm run bots:selftest, the room's AI pilots
 * (edge/rooms/bots.js, docs/AI-PILOTS-CONTRACT.md) in plain Node: the same
 * calls give the same poses bit for bit, a save and restore mid flight
 * flies on bit for bit, every pose stays in the corridor, the valley's
 * axis is alps/heights.js's, a hunter catches a pilot flying straight,
 * an Ace on Hard runs longer than one on Easy, and what it costs.
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

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  BOT_CAP_MEASURE, BOT_MAPS, Bots, CONTACT_M, CORRIDOR, DOWN_MS, LEVELS, SPAWN_M, SPAWN_MS, valleyAxis,
} from '../edge/rooms/bots.js';
import { groundOf } from '../edge/rooms/grounds.js';
import { buildSwissField } from '../src/maps/swiss2/field.js';
import { buildHeightfield } from '../src/maps/alps/heights.js';
import { FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING } from '../src/share/roomwire.js';
import { BUBBLE_M } from '../src/share/roomtag.js';
import { encodePose, decodePose } from '../src/share/roomwire.js';

const TICK = 1000 / 30;

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) {
    failed += 1;
  }
}

/* The room's tick times, with a jitter drawn from a fixed sequence, so a
 * run is the room's uneven clock and still repeats. */
function ticks(ms, jitter) {
  const out = [];
  let k = 1;
  for (let t = 0; t <= ms; t += TICK) {
    k = (k * 48271) % 2147483647;
    out.push(Math.round(t + (jitter ? (k % 9) - 4 : 0)));
  }
  return out;
}

/* Every bot hunting seat 1's bot, the Ace, which flees them. */
function tagOrders(bots) {
  return (seat) => {
    const all = [...bots.list.values()];
    if (seat === 1) {
      return { flee: all.filter((b) => b.seat !== 1).map((b) => b.p) };
    }
    const ace = bots.list.get(1);
    return { chase: { p: ace.p, v: ace.f.map((x) => x * LEVELS[ace.level].speed) } };
  };
}

function run(seed, n, times, splitAt = -1) {
  let bots = new Bots(seed);
  for (let s = 1; s <= n; s += 1) {
    bots.add(s, ['easy', 'normal', 'hard'][s % 3], 0);
  }
  const trace = [];
  times.forEach((t, i) => {
    if (i === splitAt) {
      const saved = JSON.parse(JSON.stringify(bots.save()));
      bots = new Bots(999);
      bots.restore(saved);
    }
    for (const { seat, pose } of bots.step(t, tagOrders(bots))) {
      trace.push(seat, pose.px, pose.py, pose.pz, pose.qx, pose.qy, pose.qz, pose.qw);
    }
  });
  return { trace, bots };
}

function same(a, b) {
  return a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
}

function determinismRows() {
  const times = ticks(60000, true);
  const a = run(11, 6, times);
  const b = run(11, 6, times);
  check('the same seed and ticks give the same poses, bit for bit', same(a.trace, b.trace), `${a.trace.length / 8} poses`);
  const c = run(11, 6, times, Math.floor(times.length / 2));
  check('a save and restore mid flight flies on bit for bit', same(a.trace, c.trace));
  const d = run(12, 6, times);
  check('another seed flies another way', !same(a.trace, d.trace));
}

function corridorRows() {
  const { trace, bots } = run(5, 8, ticks(120000, true));
  let out = 0;
  let worst = 0;
  for (let i = 0; i < trace.length; i += 8) {
    const x = trace[i + 1];
    const y = trace[i + 2];
    const z = trace[i + 3];
    const off = Math.abs(x - valleyAxis(z));
    if (off > CORRIDOR.half + 1e-9 || y < CORRIDOR.yMin - 1e-9 || y > CORRIDOR.yMax + 1e-9 || z < CORRIDOR.zMin - 1e-9 || z > CORRIDOR.zMax + 1e-9) {
      out += 1;
    }
    worst = Math.max(worst, off);
  }
  check('every pose in two minutes of 8 bots is inside the corridor, none crashed on its own', out === 0 && bots.crashes.ground === 0,
    `widest ${worst.toFixed(1)} m of ${CORRIDOR.half}, ${bots.crashes.ground} ground crashes`);
  /* Held at the edge is flying along it; what would show is a jump. A
   * substep at the fastest level moves 1.27 m, so a hold under a tenth of
   * that is a turn finishing at the edge, never a pop. */
  const substeps = 8 * 120000 / 50;
  check('the turn keeps them inside, the edge seldom has to', bots.clamps < substeps * 0.05, `${bots.clamps} held at the edge in ${substeps} substeps`);
  check('held at an edge, never jumped: every hold under 0.127 m', bots.clampMax < 0.127,
    `${bots.clamps} held at the edge in ${substeps} substeps, the largest ${bots.clampMax.toFixed(3)} m`);
}

function axisRow() {
  const src = readFileSync(new URL('../src/maps/alps/heights.js', import.meta.url), 'utf8');
  const m = src.match(/export function valleyAxis\(z\) \{\s*return ([^;]+);/);
  const theirs = m ? new Function('z', `return ${m[1]};`) : null;
  let worst = Infinity;
  if (theirs) {
    worst = 0;
    for (let z = -3000; z <= 3000; z += 7) {
      worst = Math.max(worst, Math.abs(theirs(z) - valleyAxis(z)));
    }
  }
  check("the corridor's axis is alps/heights.js valleyAxis", worst < 1e-6, m ? `${m[1]}, worst ${worst.toExponential(1)} m` : 'valleyAxis not found');
}

/* A pilot flying down the valley's axis at 14 m/s (slower than every
 * level, or Easy, at 16, could never close) and 50 m; how long a bot on
 * `level` takes to get within the bubble of it. */
function catchMs(level, seed) {
  const bots = new Bots(seed);
  bots.add(2, level, 0);
  const target = (t) => {
    const z = -600 + 14 * t / 1000;
    return { p: [valleyAxis(z), 50, z], v: [0, 0, 14] };
  };
  for (let t = 0; t <= 90000; t += TICK) {
    const tg = target(t);
    const [{ pose }] = bots.step(Math.round(t), () => ({ chase: tg }));
    if ((pose.px - tg.p[0]) ** 2 + (pose.py - tg.p[1]) ** 2 + (pose.pz - tg.p[2]) ** 2 <= BUBBLE_M * BUBBLE_M) {
      return t;
    }
  }
  return Infinity;
}

/* A bot Ace on `level` chased by a scripted pursuer at 22 m/s turning at
 * 1.2 rad/s; how long it keeps the crown. */
function runMs(level, seed) {
  const bots = new Bots(seed);
  bots.add(1, level, 0);
  const hunter = new Bots(seed + 100);
  hunter.add(9, 'hard', 0);
  const h = hunter.list.get(9);
  h.p = [valleyAxis(-500), 60, -500];
  for (let t = 0; t <= 180000; t += TICK) {
    const tt = Math.round(t);
    const ace = bots.list.get(1);
    const [{ pose: a }] = bots.step(tt, () => ({ flee: [h.p] }));
    const [{ pose: q }] = hunter.step(tt, () => ({ chase: { p: ace.p, v: ace.f.map((x) => x * LEVELS[level].speed) } }));
    if ((a.px - q.px) ** 2 + (a.py - q.py) ** 2 + (a.pz - q.pz) ** 2 <= BUBBLE_M * BUBBLE_M) {
      return t;
    }
  }
  return Infinity;
}

/* A pilot sat on the strip at the origin, 1 m up: how long a bot on
 * `level` takes to get within the bubble of it. */
function groundMs(level, seed) {
  const bots = new Bots(seed);
  bots.add(2, level, 0);
  const tg = { p: [0, 1, 0], v: [0, 0, 0] };
  for (let t = 0; t <= 90000; t += TICK) {
    const [{ pose }] = bots.step(Math.round(t), () => ({ chase: tg }));
    if ((pose.px - tg.p[0]) ** 2 + (pose.py - tg.p[1]) ** 2 + (pose.pz - tg.p[2]) ** 2 <= BUBBLE_M * BUBBLE_M) {
      return t;
    }
  }
  return Infinity;
}

function behaviourRows() {
  for (const level of Object.keys(LEVELS)) {
    const ms = [1, 2, 3].map((s) => groundMs(level, s));
    check(`a ${level} hunter catches a pilot sat on the strip, under the height band`, Math.max(...ms) < 90000, ms.map((x) => `${(x / 1000).toFixed(1)} s`).join(', '));
  }
  for (const level of Object.keys(LEVELS)) {
    const ms = [1, 2, 3].map((s) => catchMs(level, s));
    const worst = Math.max(...ms);
    check(`a ${level} hunter catches a pilot flying straight at 14 m/s`, worst < 90000, ms.map((x) => `${(x / 1000).toFixed(1)} s`).join(', '));
  }
  const easy = [1, 2, 3].map((s) => runMs('easy', s));
  const hard = [1, 2, 3].map((s) => runMs('hard', s));
  const sum = (xs) => xs.reduce((a, b) => a + Math.min(b, 180000), 0);
  check('an Ace on Hard keeps the crown longer than one on Easy', sum(hard) > sum(easy),
    `easy ${easy.map((x) => (x / 1000).toFixed(1)).join(', ')} s; hard ${hard.map((x) => (x / 1000).toFixed(1)).join(', ')} s`);
}

function wireRow() {
  const bots = new Bots(3);
  bots.add(4, 'normal', 0);
  let ok = true;
  for (let t = 0; t <= 5000; t += TICK) {
    const [{ pose }] = bots.step(Math.round(t), () => null);
    const back = decodePose(encodePose(pose));
    ok &&= back && Math.abs(back.px - pose.px) < 1e-3 && Math.abs(Math.hypot(back.qx, back.qy, back.qz, back.qw) - 1) < 1e-3;
  }
  check('every pose survives the POSE wire', ok);
}

/* CPU per AI pilot per room second, flying and choosing, on this machine.
 * The VM's core is slower: the contract has the VM's number once it runs
 * there (npm run bots:selftest on the VM). */
function costRow() {
  const n = BOT_CAP_MEASURE;
  const times = ticks(60000, false);
  const t0 = process.cpuUsage();
  const w0 = performance.now();
  run(21, n, times);
  const cpu = process.cpuUsage(t0);
  const wall = performance.now() - w0;
  const perBotSecond = (cpu.user + cpu.system) / 1000 / 60 / n;
  check(`cost: ${n} bots, 60 room seconds at 30 Hz`, perBotSecond < 1,
    `${perBotSecond.toFixed(3)} ms CPU per bot per room second (${(wall / 60).toFixed(2)} ms wall a second for all ${n})`);
}

/* One bot, out of its spawn, flown to roomMs `to` in room ticks from
 * `from`; returns the last pose. */
function flyTo(bots, from, to, orders = () => null) {
  let last = null;
  for (let t = from; t <= to; t += TICK) {
    for (const { pose } of bots.step(Math.round(t), orders)) {
      last = pose;
    }
  }
  return last;
}

function crashRows() {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const ms = Number((main.match(/const ROOM_SPAWN_MS = (\d+);/) || [])[1]);
  const m = Number((main.match(/const ROOM_SPAWN_M = (\d+);/) || [])[1]);
  check("an AI pilot's spawn is a person's: src/main.js ROOM_SPAWN_MS and ROOM_SPAWN_M", ms === SPAWN_MS && m === SPAWN_M, `${ms} ms, ${m} m`);

  const field = buildSwissField().height;
  const ground = groundOf('swiss2');
  let worst = 0;
  for (let z = CORRIDOR.zMin; z <= CORRIDOR.zMax; z += 37) {
    for (let dx = -CORRIDOR.half; dx <= CORRIDOR.half; dx += 23) {
      const x = valleyAxis(z) + dx;
      const h = field(x, z);
      worst = Math.max(worst, Math.abs(ground(x, z) - Math.max(h, -1.5)));
    }
  }
  check("the room's ground is the Swiss field (swiss2/field.js) over the lake's surface, across the corridor (the strip's 2 cm of grass apart; bots:twopage holds it to the page's own ground)", worst <= 0.02 + 1e-9, `worst ${worst} m`);

  /* Born untouchable: SPAWN_MS and SPAWN_M. */
  const bots = new Bots(3);
  bots.add(1, 'normal', 0);
  const born = bots.step(0, () => null)[0].pose;
  const later = flyTo(bots, TICK, SPAWN_MS + 200);
  check('born in the air, untouchable for SPAWN_MS, then not', (born.flags & FLAG_SPAWNING) !== 0 && (born.flags & FLAG_AIRBORNE) !== 0
    && (later.flags & FLAG_SPAWNING) === 0, `flags ${born.flags} then ${later.flags}`);
  check('untouchable, the referee cannot crash it', !new Bots(3).crash(1, 0) && (() => {
    const b = new Bots(3);
    b.add(1, 'normal', 0);
    return !b.crash(1, 100);
  })());

  /* A hit: it falls from where it was and lies on the ground. */
  const t0 = SPAWN_MS + 200;
  const at = bots.list.get(1).p.slice();
  check('a hit crashes it', bots.crash(1, t0) && bots.crashes.hit === 1);
  const mid = flyTo(bots, t0 + TICK, t0 + 1000);
  let tr = t0 + 1000;
  while (bots.list.get(1).down.restAt == null && tr < t0 + 20000) {
    tr += TICK;
    flyTo(bots, tr, tr);
  }
  const restAt = bots.list.get(1).down.restAt;
  const rest = flyTo(bots, tr + TICK, restAt + DOWN_MS - 100);
  const g = ground(rest.px, rest.pz) + CONTACT_M;
  check('it falls, crashed, motor stopped, then lies on the ground', (mid.flags & FLAG_CRASHED) !== 0 && (mid.flags & FLAG_AIRBORNE) === 0
    && mid.py < at[1] && mid.motor === 0 && Math.abs(rest.py - g) < 1e-9 && rest.vx === 0 && rest.vy === 0,
    `from ${at[1].toFixed(1)} m, ${mid.py.toFixed(1)} m a second on, at rest after ${((restAt - t0) / 1000).toFixed(1)} s at ${rest.py.toFixed(2)} on ground ${g.toFixed(2)}, still there ${(DOWN_MS - 100) / 1000} s on`);
  const again = flyTo(bots, restAt + DOWN_MS - 100 + TICK, restAt + DOWN_MS + 100);
  check('DOWN_MS after it came to rest it is born again in the air, untouchable', (again.flags & FLAG_AIRBORNE) !== 0 && (again.flags & FLAG_SPAWNING) !== 0
    && again.py >= CORRIDOR.yMin, `flags ${again.flags}, ${again.py.toFixed(1)} m`);

  /* The ground: a bot flown into it crashes there. */
  const low = new Bots(4);
  low.add(1, 'hard', 0);
  flyTo(low, TICK, SPAWN_MS + 2000);
  const b = low.list.get(1);
  /* Its aim keeps it over what it hunts, and a pull up is in its turn,
   * so in play it meets the pasture seldom (none in ten terminal runs at
   * targets sat on the floor, Hard); put it there to see the rule. */
  b.p = [valleyAxis(-600), ground(valleyAxis(-600), -600) + CONTACT_M / 2, -600];
  b.f = [0, -0.5, Math.sqrt(0.75)];
  const before = b.p[1];
  const hit = flyTo(low, SPAWN_MS + 2000 + TICK, SPAWN_MS + 2300);
  check('its belly on the pasture, it crashes there', low.crashes.ground === 1 && (hit.flags & FLAG_CRASHED) !== 0,
    `${low.crashes.ground} ground crashes from ${before.toFixed(1)} m over ${ground(b.p[0], b.p[2]).toFixed(1)} m ground`);

  /* A restore mid fall falls on exactly as it would have. */
  const run1 = new Bots(9);
  run1.add(1, 'easy', 0);
  run1.add(2, 'hard', 0);
  flyTo(run1, TICK, SPAWN_MS + 500);
  run1.crash(2, SPAWN_MS + 500);
  flyTo(run1, SPAWN_MS + 500 + TICK, SPAWN_MS + 900);
  const run2 = new Bots(1);
  run2.restore(JSON.parse(JSON.stringify(run1.save())));
  const trace = (bs) => {
    const out = [];
    for (let t = SPAWN_MS + 900 + TICK; t <= SPAWN_MS + 900 + DOWN_MS + 6000; t += TICK) {
      for (const { pose } of bs.step(Math.round(t), () => null)) {
        out.push(pose.flags, pose.px, pose.py, pose.pz);
      }
    }
    return out;
  };
  check('a save and restore mid fall falls, lies and is born again bit for bit', same(trace(run1), trace(run2)));
}

/* The alps: the same valley drawn cel shaded, on the alps' own field. */
function alpsRows() {
  const field = buildHeightfield().height;
  const ground = groundOf('alps');
  let worst = 0;
  for (let z = CORRIDOR.zMin; z <= CORRIDOR.zMax; z += 37) {
    for (let dx = -CORRIDOR.half; dx <= CORRIDOR.half; dx += 23) {
      const x = valleyAxis(z) + dx;
      worst = Math.max(worst, Math.abs(ground(x, z) - Math.max(field(x, z), -1.5)));
    }
  }
  check("the alps' ground is the alps' field (alps/heights.js) over the lake's surface, across the corridor (the strip's grass apart)", worst <= 0.02 + 1e-9, `worst ${worst} m`);
  const bots = new Bots(5, 'alps');
  for (let s = 1; s <= 8; s += 1) {
    bots.add(s, ['easy', 'normal', 'hard'][s % 3], 0);
  }
  let out = 0;
  let lowest = Infinity;
  for (const t of ticks(120000, true)) {
    for (const { pose } of bots.step(t, tagOrders(bots))) {
      if (Math.abs(pose.px - valleyAxis(pose.pz)) > CORRIDOR.half + 1e-9 || pose.py < CORRIDOR.yMin - 1e-9 || pose.py > CORRIDOR.yMax + 1e-9) {
        out += 1;
      }
      lowest = Math.min(lowest, pose.py - ground(pose.px, pose.pz));
    }
  }
  check('two minutes of 8 bots over the alps: inside the corridor, none crashed', out === 0 && bots.crashes.ground === 0,
    `${out} outside, ${bots.crashes.ground} ground crashes, the lowest ${lowest.toFixed(1)} m over the ground`);
  const saved = JSON.parse(JSON.stringify(bots.save()));
  const back = new Bots(1);
  back.restore(saved);
  check('restored, they fly over the ground they were saved over', back.map === 'alps' && BOT_MAPS.includes('swiss2'), back.map);
  let threw = false;
  try {
    new Bots(1, 'itaipu');
  } catch (e) {
    threw = true;
  }
  check('a world the room has no ground for gets no bots', threw);
}

console.log('bots-selftest: edge/rooms/bots.js');
determinismRows();
corridorRows();
axisRow();
behaviourRows();
crashRows();
alpsRows();
wireRow();
costRow();
console.log(failed ? `bots-selftest: ${failed} FAILED` : 'bots-selftest: all pass');
process.exit(failed ? 1 : 0);
