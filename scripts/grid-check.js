/*
 * grid-check.js: the collider grid reaches Itaipu's hero square, refuses
 * what it cannot hold, and carries a streamed set beside the static one.
 * In Node, against src/game/collide.js alone.
 *
 *   node scripts/grid-check.js
 *
 * docs/ITAIPU-PLAN.md section 14, package C:
 *
 *   the grid: a wall at x = 6 000 is hit, and one at the Friendship
 *     Bridge, (-1 500, 9 535); one at x = 17 000 throws at
 *     build() instead of being registered under an aliased cell, where
 *     the sweep never looked for it (and so does a coordinate that is not
 *     a number);
 *   the streamed set: a streamed wall is hit by every query the static set
 *     answers (hit, the fixed wing's parts, gapAt, axisAt, crossedStatic,
 *     the crash world's nearestSolids), and after a refill that drops it,
 *     is not; until a refill's last step the set before it is the one in
 *     force; the built gates keep working across a refill; a refill clears
 *     the crash world's pass flags it moved; a stale or late refill throws;
 *   the slices: a refill of 25 000 walls within 1 000 m (the plan's
 *     streamed budget) over a static set of swiss2's size, stepped at
 *     STREAM_SLICE, and how long each step takes against the plan's 2 ms.
 *
 * Exits 1 on any failure. The slice timing is printed with the load
 * average, since this box is shared: the check fails when the median step
 * is over 2 ms, and prints the worst.
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

import { loadavg } from 'node:os';

import { Colliders, KINDS, STREAM_SLICE, setCraftParts } from '../src/game/collide.js';
import { airframeHull, THREE_BODY } from '../src/game/airframehull.js';
import { nearestSolids } from '../src/game/crashworld.js';

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};
const throws = (fn) => {
  try {
    fn();
    return '';
  } catch (e) {
    return e.message;
  }
};
const WALL = KINDS.indexOf('wall');

/* A wall 10 m tall and 10 m long across x at x = x0, and a flight through
 * it along x at 5 m. */
const wall = (c, x0, z0 = 0) => c.addBox('wall', x0, 0, z0 - 5, x0 + 0.5, 10, z0 + 5);
const through = (c, x0, z0 = 0) => c.hit(x0 - 5, 5, z0, x0 + 5, 5, z0);

/* The grid's reach. */
{
  const c = new Colliders();
  wall(c, 6000);
  wall(c, -6000, -6000);
  c.addBox('wall', -1500, 0, 9530, -1490, 10, 9540);
  c.build();
  const k = through(c, 6000);
  const far = through(c, -6000, -6000);
  const bridge = c.hit(-1500, 5, 9535, -1490, 5, 9535);
  check('a wall at x = 6 000 is hit, one at (-6 000, -6 000), and one at the Friendship Bridge (-1 500, 9 535)',
    k === WALL && far === WALL && bridge === WALL,
    `${c.kindName(k)} at t ${c.hitT.toFixed(3)}; ${c.kindName(far)}; ${c.kindName(bridge)}; the grid reaches ${c.stats().gridHalfExtent} m`);
  const out = new Colliders();
  wall(out, 17000);
  const why = throws(() => out.build());
  check('a wall at x = 17 000 throws at build() rather than aliasing', /outside the grid/.test(why), why || 'built');
  const nan = new Colliders();
  nan.addPost('tree', NaN, 0, 0, 10, 0.3);
  const whyNan = throws(() => nan.build());
  check('and so does a post at x = NaN, which no cell holds', /outside the grid/.test(whyNan), whyNan || 'built');
}

/* The streamed set. */
{
  const c = new Colliders();
  c.addPost('tree', 0, 0, 0, 12, 0.4);
  wall(c, -50);
  c.build();
  const statics = c.count;
  let fill = c.streamFill();
  wall(fill, 100);
  const done = fill.step();
  const k = through(c, 100);
  const index = c.hitIndex;
  const gap = c.gapAt(99, 5, 0, 2);
  const axis = c.axisAt(99, 5, 0, 2);
  const crossed = c.crossedStatic(index, 95, 5, 0, 105, 5, 0);
  const solids = nearestSolids(c, 99, 5, 0, 5, 8, []);
  /* A wing's parts: one part, 1.2 m span, as the shell seats a fixed
   * wing's hull (setCraftParts). */
  setCraftParts(airframeHull([{ cg: [0, 0, 0], boxMin: [-0.3, -0.6, -0.05], boxMax: [0.3, 0.6, 0.05] }], THREE_BODY, 1));
  const kParts = through(c, 100);
  const armed = c.hitArm;
  setCraftParts(null);
  check('a streamed wall is hit by the sweep, the wing\'s parts, gapAt, axisAt, crossedStatic and nearestSolids',
    done && k === WALL && index >= statics && gap < 1.01 && axis && crossed && solids.some((o) => o.i === index) && kParts === WALL && armed,
    `one step ${done}; hit ${c.kindName(k)} index ${index} (static ${statics}); gap ${gap.toFixed(3)}; axis ${axis}; crossed ${crossed}; nearestSolids ${solids.map((o) => o.i).join(',')}; parts ${c.kindName(kParts)} arm ${armed}`);
  check('and the static set still answers as it did',
    c.kindName(c.hit(-5, 5, 0, 5, 5, 0)) === 'tree' && through(c, -50) === WALL && c.stats().streamed === 1,
    `stats ${JSON.stringify({ count: c.stats().count, static: c.stats().static, streamed: c.stats().streamed })}`);

  /* The builder's gates, laid after the streamed set. */
  c.setBuilt([{ kind: 'gate', ax: 300, ay: 0, az: -2, bx: 300, by: 3, bz: -2, r: 0.05 }]);
  const gateHit = () => c.kindName(c.hit(295, 1.5, -2, 305, 1.5, -2));
  const gateBefore = gateHit();
  const gateIndex = c.hitIndex;
  const frozenGap = c.gapAt(99, 5, 0, 2, true);

  /* A refill that drops the wall and has one at x = 200, big enough to
   * take many steps: between them the old set is the one in force. */
  /* The crash world has taken the gate over (main.js declareCrashSolids):
   * the refill moves it, so its flag must not stay on its old index. */
  c.pass[gateIndex] = 1;
  const gen = c.streamGen;
  fill = c.streamFill();
  wall(fill, 200);
  for (let j = 0; j < 30000; j += 1) {
    fill.addPost('tree', 400 + (j % 200) * 2, -400 + Math.floor(j / 200) * 2, 0, 8, 0.3);
  }
  let steps = 0;
  let oldHeld = true;
  let newEarly = false;
  let finished = false;
  while (!finished) {
    finished = fill.step();
    steps += 1;
    if (!finished) {
      oldHeld = oldHeld && through(c, 100) === WALL;
      newEarly = newEarly || through(c, 200) === WALL;
    }
  }
  const lateAdd = throws(() => wall(fill, 500));
  const lateStep = throws(() => fill.step());
  check('until the refill\'s last step the set before it is whole, and after it the new one is',
    steps > 2 && oldHeld && !newEarly && through(c, 100) === -1 && through(c, 200) === WALL,
    `${steps} steps; old wall held between them ${oldHeld}, new one early ${newEarly}; after: x 100 ${c.kindName(through(c, 100))}, x 200 ${c.kindName(through(c, 200))}`);
  check('the refill dropped the wall from every query',
    c.gapAt(99, 5, 0, 2) === Infinity && !c.axisAt(99, 5, 0, 0.5) && !nearestSolids(c, 99, 5, 0, 5, 8, []).some((o) => c.fkind[o.i] === WALL && c.fax[o.i] === 100),
    `gap ${c.gapAt(99, 5, 0, 2)}, stream ${c.stats().streamed}, generation ${gen} to ${c.streamGen}`);
  check('the built gate is met before and after the refill, after the streamed set, and frozenOnly leaves only it out',
    gateBefore === 'gate' && gateHit() === 'gate' && c.hitIndex === c.baseCount && gateIndex === statics + 1 && frozenGap < 1.01,
    `before ${gateBefore} at ${gateIndex}, after ${gateHit()} at ${c.hitIndex} (baseCount ${c.baseCount}); frozenOnly gap to the streamed wall ${frozenGap.toFixed(3)}`);
  check('a refill clears the pass flags it moved, and a used or late fill throws',
    c.streamGen === gen + 1 && c.pass.subarray(statics).every((v) => v === 0) && /after its first step/.test(lateAdd) && /replaced or already swapped/.test(lateStep),
    `generation ${c.streamGen}; ${lateAdd}; ${lateStep}`);
  const a = c.streamFill();
  wall(a, 700);
  const b = c.streamFill();
  wall(b, 800);
  const stale = throws(() => a.step());
  b.step();
  check('a newer refill replaces one in progress, which then throws',
    /replaced/.test(stale) && through(c, 800) === WALL && through(c, 700) === -1 && through(c, 200) === -1,
    stale);
  const same = c.streamFill();
  wall(same, 800);
  c.pass[statics] = 1;
  const heldBefore = through(c, 800);
  same.step();
  check('a refill of the same wall clears the flag the crash world set on it',
    heldBefore === -1 && through(c, 800) === WALL && c.pass[statics] === 0,
    `passed while flagged ${heldBefore === -1}, met after the refill ${c.kindName(through(c, 800))}`);
  const empty = c.streamFill();
  check('an empty refill empties the streamed set', empty.step() && c.stats().streamed === 0 && through(c, 800) === -1 && gateHit() === 'gate' && c.hitIndex === statics,
    `streamed ${c.stats().streamed}, the gate at ${c.hitIndex}`);
}

/* The slices, over a static set of swiss2 High's size: 234 730 colliders,
 * mostly trees, across its 6 km. */
{
  let s = 1;
  const rnd = () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s / 4294967296;
  };
  const c = new Colliders();
  for (let j = 0; j < 234730; j += 1) {
    const x = (rnd() - 0.5) * 5800;
    const z = (rnd() - 0.5) * 5800;
    if (j % 3) {
      c.addPost('tree', x, z, 0, 8, 0.3);
    } else {
      c.addSphere('canopy', x, 8, z, 2);
    }
  }
  const t0 = performance.now();
  c.build();
  const buildMs = performance.now() - t0;
  /* 25 000 walls within 1 000 m of (2 000, 1 000): houses' sides, 3 to 12
   * m long, a third of them in 1 m columns. */
  const refill = (cx, cz) => {
    const f = c.streamFill();
    for (let j = 0; j < 25000; j += 1) {
      const r = Math.sqrt(rnd()) * 1000;
      const a = rnd() * Math.PI * 2;
      const x = cx + r * Math.cos(a);
      const z = cz + r * Math.sin(a);
      const len = j % 3 ? 3 + rnd() * 9 : 1;
      f.addBox('wall', x, 0, z, x + len, 6, z + 0.3);
    }
    const ms = [];
    let finished = false;
    while (!finished) {
      const t = performance.now();
      finished = f.step();
      ms.push(performance.now() - t);
    }
    return ms;
  };
  const first = refill(2000, 1000);
  const again = refill(1600, 1000);
  const sorted = [...again].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  const worst = sorted[sorted.length - 1];
  const load = loadavg().map((v) => v.toFixed(1)).join(' ');
  console.log(`  static set ${c.staticCount} colliders built in ${buildMs.toFixed(1)} ms; a first refill of 25 000 walls in ${first.length} steps, ${first.reduce((x, y) => x + y, 0).toFixed(1)} ms in all, its worst step ${Math.max(...first).toFixed(2)} ms (it grows the store); load average ${load}`);
  check(`a second refill of 25 000 walls steps at STREAM_SLICE (${STREAM_SLICE} cell entries) in slices whose median is under 2 ms`,
    median < 2,
    `${again.length} steps, median ${median.toFixed(2)} ms, worst ${worst.toFixed(2)} ms, ${again.reduce((x, y) => x + y, 0).toFixed(1)} ms in all; load average ${load}`);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(`${checks.length - failed} of ${checks.length} passed`);
process.exit(failed ? 1 : 0);
