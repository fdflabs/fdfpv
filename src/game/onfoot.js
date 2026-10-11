/*
 * onfoot.js: the pilot on foot, walking the field in first person
 * (docs/ON-FOOT.md). Arithmetic only, no three.js and no DOM, so the walk
 * is checked in Node (scripts/foot-node-check.js) against real Colliders.
 *
 * THE BODY is an upright capsule BODY_RADIUS wide and STATURE tall
 * (src/game/human.js) standing on its feet. Every solid of the map
 * blocks it (Colliders.bodyPush, read only); its tops are not walked on.
 * The ground is the map's own height(x, z, fromY), roofs included, asked
 * from STEP_UP over the feet so a roof is never stepped onto from below.
 *
 * A MOVE is refused, not half taken, when it would rise more than STEP_UP,
 * climb ground steeper than MAX_SLOPE, step into water, or end inside a
 * solid after the pushes out. A refused move tries its two level axes
 * alone, so the walker slides along what stopped it. Every position the
 * walker ever holds was checked clear, which is the invariant
 * foot:node holds it to: the body never ends a step inside a solid.
 *
 * HEADING is clockwise from -z seen from above, as the hub hangar's walk
 * (src/game/hangarroom.js): heading h faces (sin h, -cos h). PITCH is up
 * positive. Units SI.
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

import {
  ACCEL_S, BODY_RADIUS, GRAVITY, MAX_SLOPE, RUN_SPEED, STATURE, STEP_UP, WALK_SPEED,
} from './human.js';
import { KINDS } from './collide.js';

/* Solids walked through: a gate's scoring plane, a tree's crown, a
 * banner's cloth. A trunk is a `tree` post and blocks. */
export const SKIP_KINDS = ['gate', 'canopy', 'banner'].reduce((m, k) => m | (1 << KINDS.indexOf(k)), 0);

/* rad: the head turns no further up or down. */
export const PITCH_MAX = (85 * Math.PI) / 180;

/* m: the longest single move tested; a frame's travel is cut into moves
 * no longer, so a body never jumps a solid thinner than this. */
const MOVE_MAX = 0.05;
/* m: how far ahead a rise is looked past to tell a step from a slope. */
const SLOPE_PROBE = 0.15;
/* m: a body this far into a solid after the pushes counts as inside. */
export const INSIDE_TOL = 1e-4;
/* m: the pushes out go this much further, so the next query starts clear. */
const SKIN = 2e-4;
const PUSHES = 4;
const TAN_SLOPE = Math.tan(MAX_SLOPE);
/* s: the longest frame stepped; a longer one is cut. */
const DT_MAX = 0.1;

/* The walk's state. inHangar is the seam for the field hangar's door
 * (the plan's slice 4): false until a door is walked through. odo, t and
 * refused are the checks' own counters: metres walked, seconds stepped,
 * moves refused. */
export function createWalker(x, z, feet, heading) {
  return {
    x, z, feet, heading, pitch: 0, vx: 0, vz: 0, vy: 0, inHangar: false, odo: 0, t: 0, refused: 0,
  };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/*
 * How deep the body at (x, z) on `feet` sinks into the world's solids
 * after up to PUSHES level pushes out; the pushed position in out.x/out.z.
 */
function settle(world, x, z, feet, out) {
  out.x = x;
  out.z = z;
  const solids = world.solids;
  if (!solids) {
    return 0;
  }
  const y0 = feet + BODY_RADIUS;
  const y1 = feet + STATURE - BODY_RADIUS;
  for (let k = 0; k < PUSHES; k += 1) {
    solids.bodyPush(out.x, out.z, y0, y1, BODY_RADIUS, SKIP_KINDS);
    if (solids.bodyDepth <= INSIDE_TOL) {
      return 0;
    }
    out.x += solids.bodyNx * (solids.bodyDepth + SKIN);
    out.z += solids.bodyNz * (solids.bodyDepth + SKIN);
  }
  solids.bodyPush(out.x, out.z, y0, y1, BODY_RADIUS, SKIP_KINDS);
  return solids.bodyDepth;
}

/* The ground a body standing at `feet` meets at (x, z), or NaN when the
 * stride there is refused: too high a rise, too steep a slope, water. */
function groundFor(world, fromX, fromZ, x, z, feet) {
  if (world.wet && world.wet(x, z)) {
    return NaN;
  }
  const g = world.height(x, z, feet + STEP_UP);
  const rise = g - feet;
  if (!(rise <= STEP_UP)) {
    return NaN;
  }
  const run = Math.hypot(x - fromX, z - fromZ);
  if (rise > TAN_SLOPE * run + 1e-6 && run > 0) {
    /* Steeper than a person walks for this stride: a step if the ground
     * past it is walkable, a slope if it keeps climbing. */
    const ax = x + ((x - fromX) / run) * SLOPE_PROBE;
    const az = z + ((z - fromZ) / run) * SLOPE_PROBE;
    if (world.height(ax, az, g + STEP_UP) - g > TAN_SLOPE * SLOPE_PROBE) {
      return NaN;
    }
  }
  return g;
}

const pushed = { x: 0, z: 0 };

/* One move of (dx, dz) from where w stands; true when taken. */
function tryMove(w, world, dx, dz) {
  const x = w.x + dx;
  const z = w.z + dz;
  const g = groundFor(world, w.x, w.z, x, z, w.feet);
  if (Number.isNaN(g)) {
    return false;
  }
  /* Off a ledge higher than a stride down, the body falls (fall()). */
  const airborne = w.vy !== 0 || g < w.feet - STEP_UP;
  const feet = airborne ? Math.max(w.feet, g) : g;
  if (settle(world, x, z, feet, pushed) > INSIDE_TOL) {
    return false;
  }
  if (pushed.x !== x || pushed.z !== z) {
    /* A push out moved the body: the ground there must take it too. */
    const g2 = groundFor(world, w.x, w.z, pushed.x, pushed.z, w.feet);
    if (Number.isNaN(g2)) {
      return false;
    }
    const feet2 = airborne ? Math.max(w.feet, g2) : g2;
    if (settle(world, pushed.x, pushed.z, feet2, pushed) > INSIDE_TOL) {
      return false;
    }
    take(w, pushed.x, pushed.z, feet2, airborne);
    return true;
  }
  take(w, x, z, feet, airborne);
  return true;
}

function take(w, x, z, feet, airborne) {
  w.odo += Math.hypot(x - w.x, z - w.z);
  w.x = x;
  w.z = z;
  w.feet = feet;
  if (airborne && w.vy === 0) {
    /* Stepped off: falling starts from rest. */
    w.vy = -1e-9;
  }
}

/*
 * One frame of the walk. `input`: { move: [right, forward] each -1..1,
 * look: [turn right, look up] in rad this frame, run: bool }. `world`:
 * { height(x, z, fromY), solids: a Colliders or null, wet(x, z) or none }.
 */
export function step(w, input, dt, world) {
  const t = Math.min(Math.max(dt, 0), DT_MAX);
  w.t += t;
  w.heading = wrapAngle(w.heading + input.look[0]);
  w.pitch = Math.min(PITCH_MAX, Math.max(-PITCH_MAX, w.pitch + input.look[1]));
  let mr = input.move[0];
  let mf = input.move[1];
  const m = Math.hypot(mr, mf);
  if (m > 1) {
    mr /= m;
    mf /= m;
  }
  const pace = input.run ? RUN_SPEED : WALK_SPEED;
  const s = Math.sin(w.heading);
  const c = Math.cos(w.heading);
  /* Forward (sin h, -cos h), right (cos h, sin h). */
  const tx = (s * mf + c * mr) * pace;
  const tz = (-c * mf + s * mr) * pace;
  /* To pace, or to a stop, in ACCEL_S. */
  const ex = tx - w.vx;
  const ez = tz - w.vz;
  const e = Math.hypot(ex, ez);
  const most = (Math.max(Math.hypot(tx, tz), Math.hypot(w.vx, w.vz), WALK_SPEED) / ACCEL_S) * t;
  if (e <= most) {
    w.vx = tx;
    w.vz = tz;
  } else {
    w.vx += (ex / e) * most;
    w.vz += (ez / e) * most;
  }
  const travel = Math.hypot(w.vx, w.vz) * t;
  const n = Math.max(1, Math.ceil(travel / MOVE_MAX));
  const dx = (w.vx * t) / n;
  const dz = (w.vz * t) / n;
  let blockedX = false;
  let blockedZ = false;
  for (let k = 0; k < n; k += 1) {
    if (tryMove(w, world, dx, dz)) {
      continue;
    }
    w.refused += 1;
    /* Slide: the level axes alone, the longer first. */
    const xFirst = Math.abs(dx) >= Math.abs(dz);
    const a = xFirst ? tryMove(w, world, dx, 0) : tryMove(w, world, 0, dz);
    const b = !a && (xFirst ? tryMove(w, world, 0, dz) : tryMove(w, world, dx, 0));
    blockedX = blockedX || (xFirst ? !a : !b);
    blockedZ = blockedZ || (xFirst ? !b : !a);
  }
  /* What stopped the body takes its speed that way. */
  if (blockedX) {
    w.vx = 0;
  }
  if (blockedZ) {
    w.vz = 0;
  }
  fall(w, world, t);
  return w;
}

/* Down onto the ground under the feet: a drop of up to STEP_UP is a
 * stride down, more is a fall at GRAVITY. No fall hurts. */
function fall(w, world, t) {
  const g = world.height(w.x, w.z, w.feet + STEP_UP);
  if (w.vy === 0 && w.feet - g <= STEP_UP) {
    w.feet = g;
    return;
  }
  w.vy -= GRAVITY * t;
  w.feet += w.vy * t;
  if (w.feet <= g) {
    w.feet = g;
    w.vy = 0;
  }
}

/*
 * The clear spot nearest (x, z): the spot itself when the body fits
 * there on dry ground, else rings outward every 0.5 m up to `reach`. The
 * place a body steps out onto, which a map may have put a tree on.
 * Null when nothing within reach is clear.
 */
export function findClear(world, x, z, reach = 20) {
  for (let r = 0; r <= reach; r += 0.5) {
    const ring = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 0.5);
    for (let k = 0; k < ring; k += 1) {
      const a = (2 * Math.PI * k) / ring;
      const px = x + r * Math.sin(a);
      const pz = z - r * Math.cos(a);
      if (world.wet && world.wet(px, pz)) {
        continue;
      }
      const feet = world.height(px, pz, Infinity);
      if (settle(world, px, pz, feet, pushed) <= INSIDE_TOL && pushed.x === px && pushed.z === pz) {
        return { x: px, z: pz, feet };
      }
    }
  }
  return null;
}

/* How deep the body as it stands is in any solid: 0 when clear. */
export function depthInside(w, world) {
  if (!world.solids) {
    return 0;
  }
  world.solids.bodyPush(w.x, w.z, w.feet + BODY_RADIUS, w.feet + STATURE - BODY_RADIUS, BODY_RADIUS, SKIP_KINDS);
  return world.solids.bodyDepth;
}
