/*
 * bots-selftest.js: npm run bots:selftest, the room's AI pilots
 * (edge/rooms/bots.js, docs/AI-PILOTS-CONTRACT.md) in plain Node: the same
 * calls give the same poses bit for bit, a save and restore mid flight
 * flies on bit for bit, every pose stays in the corridor, the valley's
 * axis is alps/terrain.js's, a hunter catches a pilot flying straight,
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
  BOT_CAP_MEASURE, Bots, CORRIDOR, LEVELS, valleyAxis,
} from '../edge/rooms/bots.js';
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
  check('every pose in two minutes of 8 bots is inside the corridor', out === 0, `widest ${worst.toFixed(1)} m of ${CORRIDOR.half}`);
  const substeps = 8 * 120000 / 50;
  check('the turn keeps them inside, the edge seldom has to', bots.clamps < substeps * 0.05, `${bots.clamps} held at the edge in ${substeps} substeps`);
}

function axisRow() {
  const src = readFileSync(new URL('../src/maps/alps/terrain.js', import.meta.url), 'utf8');
  const m = src.match(/export function valleyAxis\(z\) \{\s*return ([^;]+);/);
  const theirs = m ? new Function('z', `return ${m[1]};`) : null;
  let worst = Infinity;
  if (theirs) {
    worst = 0;
    for (let z = -3000; z <= 3000; z += 7) {
      worst = Math.max(worst, Math.abs(theirs(z) - valleyAxis(z)));
    }
  }
  check("the corridor's axis is alps/terrain.js valleyAxis", worst < 1e-6, m ? `${m[1]}, worst ${worst.toExponential(1)} m` : 'valleyAxis not found');
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

function behaviourRows() {
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

console.log('bots-selftest: edge/rooms/bots.js');
determinismRows();
corridorRows();
axisRow();
behaviourRows();
wireRow();
costRow();
console.log(failed ? `bots-selftest: ${failed} FAILED` : 'bots-selftest: all pass');
process.exit(failed ? 1 : 0);
