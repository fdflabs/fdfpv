#!/usr/bin/env node
/*
 * foot-node-check.js: `npm run foot:node`, the pilot on foot's walk
 * (src/game/onfoot.js) on a made up world with real Colliders
 * (src/game/collide.js). Plain Node, no browser.
 *
 *   1. NEVER INSIDE. 20,000 frames of random walking, running and turning
 *      among walls, turned walls, posts and lying capsules on rolling
 *      ground: after every frame no point of the body's centre line is
 *      closer to a solid than the body's radius, by Colliders.nearest (a
 *      different query from the one the walker resolves with).
 *   2. STEPS. A 0.35 m rise is walked up, a 0.40 m rise stops the body.
 *   3. SLOPES. 30 deg ground is climbed, 40 deg ground is refused.
 *   4. PASSING. A gate's plane, a tree's crown and a banner are walked
 *      through; a trunk is not.
 *   5. PACE. Held forward on flat ground the body walks 1.4 m/s and runs
 *      2.5 m/s (src/game/human.js, Bohannon 1997).
 *   6. WATER and LEDGES. Water is not entered; a drop higher than a step
 *      is a fall under gravity that lands on the ground.
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

import { Colliders, KINDS } from '../src/game/collide.js';
import {
  createWalker, depthInside, findClear, step, INSIDE_TOL, SKIP_KINDS,
} from '../src/game/onfoot.js';
import {
  BODY_RADIUS, EYE_HEIGHT, GRAVITY, RUN_SPEED, STATURE, STEP_UP, WALK_SPEED,
} from '../src/game/human.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

let seed = 0x9E3779B9;
function rnd() {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
}

/*
 * The ground, by strips of z:
 *   z < 60        the yard: rolling ground, every kind of solid on it
 *   100..110      a 0.35 m rise at x = 0
 *   120..130      a 0.40 m rise at x = 0
 *   140..150      30 deg up from x = 0
 *   160..170      40 deg up from x = 0
 *   180..190      a 2 m drop at x = 0
 *   200..210      water from x = 0 (flat ground under it)
 *   220..230      the passing lane
 */
const deg = Math.PI / 180;
function ground(x, z) {
  if (z < 60) {
    return 0.4 * Math.sin(x / 7) * Math.cos(z / 5);
  }
  if (z >= 100 && z < 110) {
    return x >= 0 ? 0.35 : 0;
  }
  if (z >= 120 && z < 130) {
    return x >= 0 ? 0.40 : 0;
  }
  if (z >= 140 && z < 150) {
    return Math.max(0, x) * Math.tan(30 * deg);
  }
  if (z >= 160 && z < 170) {
    return Math.max(0, x) * Math.tan(40 * deg);
  }
  if (z >= 180 && z < 190) {
    return x >= 0 ? -2 : 0;
  }
  return 0;
}

const solids = new Colliders();
/* The yard's fence, so a random walk stays among the solids. */
solids.addBox('wall', -31, -2, -61, 31, 3, -60);
solids.addBox('wall', -31, -2, 0, 31, 3, 1);
solids.addBox('wall', -31, -2, -60, -30, 3, 0);
solids.addBox('wall', 30, -2, -60, 31, 3, 0);
for (let k = 0; k < 40; k += 1) {
  const x = -27 + rnd() * 54;
  const z = -57 + rnd() * 54;
  const kind = k % 5;
  if (kind === 0) {
    solids.addBox('wall', x, -1, z, x + 0.3 + rnd() * 3, 0.3 + rnd() * 3, z + 0.3 + rnd() * 3);
  } else if (kind === 1) {
    const a = rnd() * Math.PI;
    solids.addTurnedBox('wall', Math.cos(a), Math.sin(a), x - 2, x + 2, -1, 2.5, z - 0.2 - rnd(), z + 0.2);
  } else if (kind === 2) {
    solids.addPost('tree', x, z, -1, 8, 0.1 + rnd() * 0.4);
  } else if (kind === 3) {
    const a = rnd() * Math.PI;
    solids.add('rock', x, 0.3 + rnd() * 1.5, z, x + 3 * Math.cos(a), 0.3 + rnd() * 1.5, z + 3 * Math.sin(a), 0.2 + rnd() * 0.5);
  } else {
    /* Low: a box under the knee and one over a head, the body's ends. */
    solids.addBox('obstacle', x, -1, z, x + 1 + rnd(), rnd() < 0.5 ? 0.2 : -0.5, z + 1 + rnd());
    solids.addBox('obstacle', x + 3, 1.6 + rnd() * 0.6, z, x + 5, 3, z + 2);
  }
}
/* The passing lane: a gate's plane across it, a crown over it, a banner,
 * then a trunk. */
solids.add('gate', 5, 0, 220, 5, 0, 230, 0.3);
solids.addSphere('canopy', 10, 1.5, 225, 2);
solids.addBox('banner', 14, 0, 220, 14.1, 3, 230);
solids.addPost('tree', 20, 225, -1, 10, 0.3);
solids.build();

const world = {
  height: (x, z) => ground(x, z),
  solids,
  wet: (x, z) => z >= 200 && z < 210 && x >= 0,
};

/* Independent of bodyPush: points along the body's centre line, each
 * nearer a solid than the radius is inside. */
function insideByNearest(w) {
  const y0 = w.feet + BODY_RADIUS;
  const y1 = w.feet + STATURE - BODY_RADIUS;
  let worst = -Infinity;
  for (let k = 0; k <= 16; k += 1) {
    const y = y0 + ((y1 - y0) * k) / 16;
    const i = solids.nearest(w.x, y, w.z, BODY_RADIUS + 0.01, false, SKIP_KINDS);
    if (i >= 0) {
      worst = Math.max(worst, BODY_RADIUS - solids.nearGap);
    }
  }
  return worst;
}

const still = { move: [0, 0], look: [0, 0], run: false };
function hold(w, input, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    step(w, input, dt, world);
  }
  return w;
}
/* A walker standing at (x, z) facing +x (heading 90 deg). */
const facingEast = (x, z) => createWalker(x, z, ground(x, z), Math.PI / 2);
const forward = (run = false) => ({ move: [0, 1], look: [0, 0], run });

/* 1. NEVER INSIDE. */
{
  let worstPush = 0;
  let worstNear = 0;
  let frames = 0;
  let moved = 0;
  let touching = 0;
  let input = still;
  let left = 0;
  const start = findClear(world, 0, -30);
  check('a clear spot is found in the yard', Boolean(start));
  const w = createWalker(start.x, start.z, start.feet, 0);
  check('the spot found is clear', depthInside(w, world) <= INSIDE_TOL && insideByNearest(w) <= 1e-3);
  worstNear = 0;
  for (; frames < 20000; frames += 1) {
    if (left <= 0) {
      left = 0.2 + rnd() * 2;
      input = {
        move: [rnd() < 0.3 ? 0 : rnd() * 2 - 1, rnd() < 0.2 ? -1 : 1],
        look: [(rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.02],
        run: rnd() < 0.4,
      };
    }
    const dt = [1 / 30, 1 / 60, 1 / 144][frames % 3] * (0.5 + rnd());
    left -= dt;
    const was = w.odo;
    step(w, input, dt, world);
    moved += w.odo - was;
    worstPush = Math.max(worstPush, depthInside(w, world));
    const near = insideByNearest(w);
    worstNear = Math.max(worstNear, near);
    touching += Number(near > -0.01);
  }
  check('20,000 random frames: never inside a solid by bodyPush', worstPush <= INSIDE_TOL, `worst ${worstPush.toExponential(2)} m`);
  check('20,000 random frames: never inside a solid by nearest', worstNear <= 1e-3, `worst ${worstNear.toExponential(2)} m`);
  check('the random walk went somewhere and met the solids', moved > 500 && touching > 1000, `${moved.toFixed(0)} m walked, ${touching} frames against a solid`);
}

/* 2. STEPS. */
{
  const up = hold(facingEast(-3, 105), forward(), 5);
  check(`a ${STEP_UP} m rise is walked up`, up.x > 2 && Math.abs(up.feet - 0.35) < 1e-9, `x ${up.x.toFixed(2)}, feet ${up.feet.toFixed(3)}`);
  const no = hold(facingEast(-3, 125), forward(), 5);
  check('a 0.40 m rise stops the body', no.x < 0 && no.feet === 0 && no.vx === 0, `x ${no.x.toFixed(2)}`);
}

/* 3. SLOPES. */
{
  const gentle = hold(facingEast(-3, 145), forward(), 8);
  check('30 deg ground is climbed', gentle.x > 5 && Math.abs(gentle.feet - ground(gentle.x, 145)) < 1e-9, `x ${gentle.x.toFixed(2)}`);
  const steep = hold(facingEast(-3, 165), forward(true), 8);
  check('40 deg ground is refused', steep.x < 0.3 && steep.feet < 0.25, `x ${steep.x.toFixed(2)}, feet ${steep.feet.toFixed(3)}`);
}

/* 4. PASSING. */
{
  const w = hold(facingEast(0, 225), forward(), 20);
  check('a gate plane, a crown and a banner are walked through', w.x > 15, `x ${w.x.toFixed(2)}`);
  check('a trunk stops the body short of its bark', w.x < 20 - 0.3 - BODY_RADIUS + 1e-3 && w.x > 19, `x ${w.x.toFixed(3)}`);
  check('the kinds walked through are gate, canopy and banner', SKIP_KINDS === ((1 << KINDS.indexOf('gate')) | (1 << KINDS.indexOf('canopy')) | (1 << KINDS.indexOf('banner'))));
}

/* 5. PACE: after the ramp, over four seconds. */
for (const [run, pace] of [[false, WALK_SPEED], [true, RUN_SPEED]]) {
  const w = facingEast(-40, 225);
  hold(w, forward(run), 1);
  const x0 = w.x;
  hold(w, forward(run), 4);
  const v = (w.x - x0) / 4;
  check(`held forward, ${run ? 'running' : 'walking'} at ${pace} m/s`, Math.abs(v - pace) < 1e-6, `${v.toFixed(4)} m/s`);
}
{
  const w = facingEast(-40, 225);
  hold(w, forward(), 0.5);
  const v = Math.hypot(w.vx, w.vz);
  check('walking pace is reached in about half a second', v > WALK_SPEED * 0.95, `${v.toFixed(3)} m/s at 0.5 s`);
  hold(w, still, 0.5);
  check('and a stop takes about as long', Math.hypot(w.vx, w.vz) < 1e-9);
  check('the eye stands at 1.64 m (0.936 of 1.75 m, Drillis and Contini 1966)', EYE_HEIGHT === 1.64 && Math.abs(0.936 * STATURE - EYE_HEIGHT) < 0.005);
}

/* 6. WATER and LEDGES. */
{
  const w = hold(facingEast(-3, 205), forward(), 5);
  check('water is not walked into', w.x < 0 && w.x > -0.1, `x ${w.x.toFixed(3)}`);
  const l = facingEast(-0.5, 185);
  let fellFor = 0;
  for (let t = 0; t < 3; t += 1 / 120) {
    step(l, forward(), 1 / 120, world);
    if (l.vy !== 0) {
      fellFor += 1 / 120;
    }
  }
  /* 2 m at g is 0.64 s. */
  const ideal = Math.sqrt((2 * 2) / GRAVITY);
  check('a 2 m drop is a fall under gravity', Math.abs(fellFor - ideal) < 0.05, `${fellFor.toFixed(3)} s, free fall ${ideal.toFixed(3)} s`);
  check('and it lands on the ground', l.feet === -2 && l.vy === 0);
}

/* The turns: heading and the pitch limit. */
{
  const w = facingEast(0, 225);
  step(w, { move: [0, 0], look: [Math.PI, 3], run: false }, 1 / 60, world);
  check('looking up stops at 85 deg', Math.abs(w.pitch - 85 * deg) < 1e-12);
  check('the heading wraps', Math.abs(Math.abs(w.heading) - Math.PI / 2) < 1e-12);
}

console.log(`foot-node-check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
