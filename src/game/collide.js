/*
 * collide.js: where the craft meets the world, and what that meeting means.
 *
 * Three things live here. The airframe's dimensions, as live bindings the
 * renderer and the shell read. The rules that turn a contact into an
 * outcome: landing, perching, the turtle, gate scoring, the clip watch.
 * And Colliders, every solid of a map as capsules and boxes in a coarse
 * grid, swept by the craft's prop discs (or a fixed wing's parts) once
 * per sim step.
 *
 * Its numbers reach the plant through sim_set_pose and sim_contact, so a
 * recorded flight replays only while every one of them is the same double
 * in every engine: square roots and the four arithmetic operations only,
 * in a fixed order, colliders frozen to single precision once, and every
 * tie decided by a fixed visiting order.
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

import { simLenToWorld } from '../render/frame.js';
import { bodyAxes, hullContact, partCentre, sweepPartBox, sweepPartCapsule } from './airframehull.js';

/* ------------------------------------------------------------- the airframe */

/* The five inch until setCraftAirframe seats another. Live bindings:
 * importers read whatever is seated now. */
export let CRAFT_ARM = 0.110;
export let CRAFT_PROP_R = 0.0635;
export let CRAFT_HULL_R = 0.0635;
export let CRAFT_R = CRAFT_ARM + CRAFT_HULL_R;
export let CRAFT_WORLD_R = simLenToWorld(CRAFT_R);

/* The clearances below were tuned on the five inch, as fractions of its
 * radius, so they scale with whatever airframe is seated. */
const FIVE_INCH_R = CRAFT_WORLD_R;
const DIRT_SPAN = 0.22 / FIVE_INCH_R;
const TURTLE_CLEAR_SPAN = 0.15 / FIVE_INCH_R;
const TURTLE_LIFT_SPAN = 0.18 / FIVE_INCH_R;

/* Math.SQRT1_2, not 1 / Math.sqrt(2): the two differ in the last bit. */
export let CRAFT_WORLD_ARM_AXIS = simLenToWorld(CRAFT_ARM * Math.SQRT1_2);
export let CRAFT_WORLD_HULL = simLenToWorld(CRAFT_HULL_R);
export let CRAFT_V_DOWN = 0.045;
export let CRAFT_V_UP = 0.038;
export let CRAFT_V_HALF = (CRAFT_V_DOWN + CRAFT_V_UP) * 0.5;
export let CRAFT_V_OFF = (CRAFT_V_UP - CRAFT_V_DOWN) * 0.5;
export let CRAFT_WORLD_V_HALF = simLenToWorld(CRAFT_V_HALF);
export let CRAFT_WORLD_V_OFF = simLenToWorld(CRAFT_V_OFF);

/* Assignments land in this order and the two throws leave the earlier
 * ones in place; callers have seen that, so it stays. */
export function setCraftAirframe(dims) {
  if (!dims) {
    return undefined;
  }
  CRAFT_ARM = dims.arm;
  CRAFT_PROP_R = dims.propR;
  CRAFT_HULL_R = dims.hullR ?? dims.propR;
  if (CRAFT_HULL_R < CRAFT_PROP_R) {
    throw new Error(`collide: hullR ${CRAFT_HULL_R} is inside propR ${CRAFT_PROP_R}`);
  }
  CRAFT_R = CRAFT_ARM + CRAFT_HULL_R;
  CRAFT_V_DOWN = dims.vHalfDown ?? dims.vHalf;
  CRAFT_V_UP = dims.vHalfUp ?? dims.vHalf;
  if (!(CRAFT_V_DOWN > 0) || !(CRAFT_V_UP > 0)) {
    throw new Error(`collide: airframe has no vertical extents (${CRAFT_V_DOWN}, ${CRAFT_V_UP})`);
  }
  CRAFT_V_HALF = (CRAFT_V_DOWN + CRAFT_V_UP) * 0.5;
  CRAFT_V_OFF = (CRAFT_V_UP - CRAFT_V_DOWN) * 0.5;
  CRAFT_WORLD_R = simLenToWorld(CRAFT_R);
  CRAFT_WORLD_ARM_AXIS = simLenToWorld(CRAFT_ARM * Math.SQRT1_2);
  CRAFT_WORLD_HULL = simLenToWorld(CRAFT_HULL_R);
  CRAFT_WORLD_V_HALF = simLenToWorld(CRAFT_V_HALF);
  CRAFT_WORLD_V_OFF = simLenToWorld(CRAFT_V_OFF);
  return undefined;
}

/* A fixed wing's part hull; while one is seated, hit sweeps its parts
 * instead of the prop discs. Quads leave it null. */
let seatedParts = null;

export function setCraftParts(hull) {
  seatedParts = hull;
}

export function craftParts() {
  return seatedParts;
}

/* The vertical semi-axis at a tilt: the disc's half thickness level,
 * its full radius on edge. */
export function craftVerticalHalf(sinTilt) {
  let s = sinTilt;
  if (s < 0) {
    s = 0;
  }
  if (s > 1) {
    s = 1;
  }
  return CRAFT_WORLD_V_HALF + (CRAFT_WORLD_R - CRAFT_WORLD_V_HALF) * s;
}

export function craftVerticalOffset() {
  return CRAFT_WORLD_V_OFF;
}

export function dirtClearance() {
  return CRAFT_WORLD_R * DIRT_SPAN;
}

export function turtleClearance() {
  return CRAFT_WORLD_R * TURTLE_CLEAR_SPAN;
}

export function turtleLift() {
  return CRAFT_WORLD_R * TURTLE_LIFT_SPAN;
}

export const snapClearance = turtleClearance;

/* ---------------------------------------------------------------- constants */

/* A collider's kind is its index here; other modules index it too. */
export const KINDS = ['gate', 'obstacle', 'tree', 'canopy', 'rock', 'cliff', 'pole', 'wall', 'boom', 'train', 'banner',
  'pylon', 'hoop', 'wire'];
export const TURNED = 2;
export const SUNK_Y = -100000;
export const STREAM_SLICE = 20000;
export const CONTACT_PATCH_BAND = 0.015;

export const LAND_DESCENT_MAX = 4.0;
export const LAND_HORIZONTAL_MAX = 10.0;
export const LAND_TILT_MAX_DEG = 25;
export const LAND_TILT_HARD_DEG = 50;
export const LAND_TIP_SPEED_MAX = 3.0;
export const GROUND_TUMBLE = 0;
export const GROUND_LAND = 1;
export const GROUND_SLIDE = 2;
export const GROUND_CRASH = 0;
export const GROUND_BOUNCE = 2;
export const GRAZE_SPEED_MAX = 4.0;
export const PROP_PLANE_MAX_UP_DOT = 0.5;
export const BOUNCE_SPEED_MAX = 18.0;
export const BOUNCE_COOLDOWN_MS = 180;
export const BOUNCE_SEPARATION = 0.008;
export const PRESS_UP_DOT = 0.5;
export const PRESS_CONFIRM_MS = 150;
export const PRESS_RELEASE_MS = 60;
export const PRESS_BLEED = 0.15;
export const SURFACE_SPEED_MAX = 60.0;
export const PERCH_SPEED = 2.0;
export const PERCH_RATE = 2.5;
export const GROUND_MU = 1.40;
export const GROUND_E = 0.0;
export const DIRT_UPZ = 0.50;
export const BURIED_MARGIN = 0.10;

export const TURTLE_SPEED = 1.0;
export const TURTLE_RATE = 8.0;
export const TURTLE_EXIT_UPZ = 0.5;
export const TURTLE_INVERT_UPZ = -0.35;
export const TURTLE_STICK_MIN = 0.08;
export const TURTLE_WAIT_RATE = 1.0;
export const TURTLE_FLIP_MS = 380;
export const SNAP_SPEED = TURTLE_SPEED;
export const SNAP_RATE = TURTLE_RATE;

export const CLIP_CENTER_EPS = 0.010;
export const CLIP_DEEP = 0.08;
export const CLIP_CONFIRM_MS = 180;
export const STUCK_UNRESOLVED_MS = 350;
export const STUCK_TRAVEL_MAX = 0.40;
export const BURIED_DEPTH = 0.22;
export const BURIED_CONFIRM_MS = 180;
export const CLIP_CRASH_HOLD_MS = 800;
export const CLIP_SPAWN_GRACE_MS = 500;
export const THRASH_RATE = 12.0;
export const THRASH_THROTTLE = 0.55;
export const THRASH_MS = 700;
export const THRASH_TRAVEL = 0.60;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* Scratch for the attitude of the free functions below. */
const AXES = new Float64Array(9);

/* ------------------------------------------------------------- contact rules */

/*
 * Where an impulse against a face lands: the centroid of the motors within
 * a band of the deepest along the face's inward normal, pushed out to the
 * hull's rim in the face's direction and along the body up axis by the
 * disc's half thickness.
 */
export function contactPatch(nx, ny, nz, qx, qy, qz, qw, out) {
  const res = out || { x: 0, y: 0, z: 0 };
  const dx = -nx;
  const dy = -ny;
  const dz = -nz;
  const e = bodyAxes(qx, qy, qz, qw, AXES);
  const A = CRAFT_WORLD_ARM_AXIS;
  let deepest = -Infinity;
  for (let i = 0; i < 4; i += 1) {
    const sx = (i & 1) ? A : -A;
    const sz = (i & 2) ? A : -A;
    const depth = (e[0] * sx + e[6] * sz) * dx + (e[1] * sx + e[7] * sz) * dy + (e[2] * sx + e[8] * sz) * dz;
    if (depth > deepest) {
      deepest = depth;
    }
  }
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (let i = 0; i < 4; i += 1) {
    const sx = (i & 1) ? A : -A;
    const sz = (i & 2) ? A : -A;
    const mx = e[0] * sx + e[6] * sz;
    const my = e[1] * sx + e[7] * sz;
    const mz = e[2] * sx + e[8] * sz;
    if (mx * dx + my * dy + mz * dz >= deepest - CONTACT_PATCH_BAND) {
      x += mx;
      y += my;
      z += mz;
      n += 1;
    }
  }
  if (n > 0) {
    x /= n;
    y /= n;
    z /= n;
  }
  const du = dx * e[3] + dy * e[4] + dz * e[5];
  const px = dx - du * e[3];
  const py = dy - du * e[4];
  const pz = dz - du * e[5];
  const p2 = px * px + py * py + pz * pz;
  if (p2 > 1e-12) {
    const inv = CRAFT_WORLD_HULL / Math.sqrt(p2);
    x += px * inv;
    y += py * inv;
    z += pz * inv;
  }
  x += CRAFT_WORLD_V_HALF * du * e[3];
  y += CRAFT_WORLD_V_HALF * du * e[4];
  z += CRAFT_WORLD_V_HALF * du * e[5];
  res.x = x;
  res.y = y;
  res.z = z;
  return res;
}

export function contactMaterial(kindName) {
  switch (kindName) {
    case 'train':
      return { e: 0.06, mu: 0.40 };
    case 'gate':
    case 'pole':
    case 'banner':
      return { e: 0.22, mu: 0.30 };
    case 'pylon':
    case 'hoop':
      return { e: 0.0, mu: 1.00 };
    case 'tree':
    case 'canopy':
      return { e: 0.12, mu: 0.50 };
    case 'wire':
      return { e: 0.0, mu: 0.80 };
    case 'wall':
    case 'boom':
    case 'cliff':
    case 'rock':
      return { e: 0.15, mu: 0.42 };
    default:
      return { e: 0.15, mu: 0.40 };
  }
}

export function hitOutcome(kindName, closing, _upDot = 0) {
  return kindName === 'train' || !(closing < BOUNCE_SPEED_MAX) ? 'hard' : 'bounce';
}

export function thrustIntoFace(nx, ny, nz, ux, uy, uz) {
  return nx * ux + ny * uy + nz * uz <= -PRESS_UP_DOT;
}

export function canPerch(tiltDeg, speed, rateMag) {
  return !(tiltDeg > LAND_TILT_MAX_DEG) && !(speed > PERCH_SPEED) && !(rateMag > PERCH_RATE);
}

export function groundOutcome(descentRate, horizontal, tiltDeg) {
  if (tiltDeg > LAND_TILT_HARD_DEG) {
    return GROUND_TUMBLE;
  }
  const up = descentRate > 0 ? descentRate : 0;
  const speed = Math.sqrt(up * up + horizontal * horizontal);
  if (tiltDeg > LAND_TILT_MAX_DEG) {
    return speed > LAND_TIP_SPEED_MAX ? GROUND_TUMBLE : GROUND_LAND;
  }
  if (descentRate > LAND_DESCENT_MAX || horizontal > LAND_HORIZONTAL_MAX || speed > PERCH_SPEED) {
    return GROUND_SLIDE;
  }
  return GROUND_LAND;
}

/* ------------------------------------------------------------- gate passes */

export function upsetOnDirt(upz, clearance, _inContact) {
  if (clearance >= dirtClearance()) {
    return false;
  }
  return upz < DIRT_UPZ;
}

/* A pass counts unless the leg ran through the ground or ended upset on
 * it: six samples along the leg against the terrain. */
export function shouldScorePass(prev, curr, opts) {
  const heightAt = opts.heightAt;
  let minClear = opts.clearance;
  if (typeof heightAt === 'function') {
    for (let i = 0; i <= 5; i += 1) {
      const t = i / 5;
      const x = prev.x + (curr.x - prev.x) * t;
      const y = prev.y + (curr.y - prev.y) * t;
      const z = prev.z + (curr.z - prev.z) * t;
      const hy = heightAt(x, z, y);
      const c = y - hy;
      if (c < minClear) {
        minClear = c;
      }
      if (y < hy - BURIED_MARGIN) {
        return false;
      }
    }
  }
  return !upsetOnDirt(opts.upz, minClear, opts.hits > 0);
}

/* ----------------------------------------------------------------- turtle */

/* Returns the || expression itself: a contact count comes back as given. */
export function shouldEnterTurtle(upz, speed, rateMag, inContact, clearance, skip) {
  if (skip || !(upz < TURTLE_INVERT_UPZ) || speed >= TURTLE_SPEED || rateMag >= TURTLE_RATE) {
    return false;
  }
  return inContact || clearance < turtleClearance();
}

export function shouldSnapUpright(upz, speed, rateMag, inContact, clearance, skip) {
  return shouldEnterTurtle(upz, speed, rateMag, inContact, clearance, skip);
}

export function shouldExitTurtle(upz) {
  return upz > TURTLE_EXIT_UPZ;
}

export function shouldParkTurtle(waiting, stickMag, rateMag, inContact) {
  return Boolean(waiting) && Boolean(inContact) && !(stickMag >= TURTLE_STICK_MIN) && !(rateMag >= TURTLE_WAIT_RATE);
}

export function turtleFlipEase(u) {
  if (u <= 0) {
    return 0;
  }
  if (u >= 1) {
    return 1;
  }
  return u * u * (3 - 2 * u);
}

export function turtleFlipLift(u) {
  if (u <= 0 || u >= 1) {
    return 0;
  }
  return 4 * u * (1 - u) * turtleLift();
}

function writeQuat(o, w, x, y, z) {
  o[0] = w;
  o[1] = x;
  o[2] = y;
  o[3] = z;
  return o;
}

/*
 * Slerp without trigonometry: t is quantised to tenths of a thousandth
 * (k / 1024), the relative rotation is halved ten times by normalised
 * half angle steps, and the halvings whose bit is set in k are composed.
 * Square roots only, so it replays bit for bit.
 */
export function turtleSlerpQuat(aw, ax, ay, az, bw, bx, by, bz, t, out) {
  const o = out || [0, 0, 0, 0];
  let dot = aw * bw + ax * bx + ay * by + az * bz;
  if (dot < 0) {
    bw = -bw;
    bx = -bx;
    by = -by;
    bz = -bz;
    dot = -dot;
  }
  if (!(t > 0)) {
    return writeQuat(o, aw, ax, ay, az);
  }
  if (t >= 1) {
    return writeQuat(o, bw, bx, by, bz);
  }
  const k = Math.round(t * 1024);
  if (k <= 0) {
    return writeQuat(o, aw, ax, ay, az);
  }
  if (k >= 1024) {
    return writeQuat(o, bw, bx, by, bz);
  }
  let dw = aw * bw + ax * bx + ay * by + az * bz;
  let dx = aw * bx - ax * bw - ay * bz + az * by;
  let dy = aw * by - ay * bw - az * bx + ax * bz;
  let dz = aw * bz - az * bw - ax * by + ay * bx;
  let rw = 1;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  for (let bit = 9; bit >= 0; bit -= 1) {
    const hw = dw + 1;
    const h2 = hw * hw + dx * dx + dy * dy + dz * dz;
    if (h2 > 1e-18) {
      const inv = 1 / Math.sqrt(h2);
      dw = hw * inv;
      dx *= inv;
      dy *= inv;
      dz *= inv;
    } else {
      dw = 1;
      dx = 0;
      dy = 0;
      dz = 0;
    }
    if ((k >> bit) & 1) {
      const nw = rw * dw - rx * dx - ry * dy - rz * dz;
      const nx = rw * dx + rx * dw + ry * dz - rz * dy;
      const ny = rw * dy + ry * dw + rz * dx - rx * dz;
      const nz = rw * dz + rz * dw + rx * dy - ry * dx;
      rw = nw;
      rx = nx;
      ry = ny;
      rz = nz;
    }
  }
  const ow = aw * rw - ax * rx - ay * ry - az * rz;
  const ox = aw * rx + ax * rw + ay * rz - az * ry;
  const oy = aw * ry + ay * rw + az * rx - ax * rz;
  const oz = aw * rz + az * rw + ax * ry - ay * rx;
  const n2 = ow * ow + ox * ox + oy * oy + oz * oz;
  const inv = n2 > 0 ? 1 / Math.sqrt(n2) : 1;
  return writeQuat(o, ow * inv, ox * inv, oy * inv, oz * inv);
}

/* The attitude with roll and pitch taken out: a turn about y to the same
 * heading, by the half angle identities. */
export function uprightPlantQuat(qw, qx, qy, qz) {
  const fx = 1 - 2 * (qy * qy + qz * qz);
  const fy = 2 * (qx * qy + qw * qz);
  const m2 = fx * fx + fy * fy;
  if (!(m2 > 1e-12)) {
    return [1, 0, 0, 0];
  }
  const inv = 1 / Math.sqrt(m2);
  const c = fx * inv;
  const sn = fy * inv;
  let half = 0.5 * (1 + c);
  if (half < 0) {
    half = 0;
  }
  const ch = Math.sqrt(half);
  if (ch < 1e-9) {
    return [0, 0, 0, 1];
  }
  return [ch, 0, 0, sn / (2 * ch)];
}

/* ------------------------------------------------------------- clip watch */

/* The watch is the caller's object and its fields are its state. */
export function resetClipWatch(watch) {
  watch.insideMs = 0;
  watch.stuckMs = 0;
  watch.buriedMs = 0;
  watch.ax = 0;
  watch.ay = 0;
  watch.az = 0;
  watch.haveAnchor = false;
  watch.thrashMs = 0;
  watch.tx = 0;
  watch.ty = 0;
  watch.tz = 0;
  watch.haveThrash = false;
  return watch;
}

export function makeClipWatch() {
  return resetClipWatch({});
}

const travelFrom = (s, x, y, z) => {
  const dx = s.x - x;
  const dy = s.y - y;
  const dz = s.z - z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/*
 * One frame of the watch for a craft that has got where it should not be:
 * its centre inside a solid, stuck unresolved in one place, buried, or
 * thrashing against a contact without getting anywhere.
 */
export function clipWatchTick(watch, sample, dtMs) {
  if (sample.launchStaging || sample.hold || sample.poseLock || sample.spawnGrace) {
    resetClipWatch(watch);
    return null;
  }
  const dt = dtMs > 0 ? dtMs : 0;
  const depth = sample.interiorDepth;
  if (depth >= CLIP_DEEP) {
    return 'inside';
  }
  watch.insideMs = depth > CLIP_CENTER_EPS ? watch.insideMs + dt : 0;
  const soft = Boolean(sample.landed || sample.turtle);
  if (!soft && sample.unresolved && !sample.roofContact && depth > CLIP_CENTER_EPS) {
    if (!watch.haveAnchor) {
      watch.ax = sample.x;
      watch.ay = sample.y;
      watch.az = sample.z;
      watch.haveAnchor = true;
      watch.stuckMs = 0;
    }
    watch.stuckMs += dt;
  } else {
    watch.haveAnchor = false;
    watch.stuckMs = 0;
  }
  watch.buriedMs = !soft && sample.buriedDepth >= BURIED_DEPTH ? watch.buriedMs + dt : 0;
  if (watch.insideMs >= CLIP_CONFIRM_MS) {
    return 'inside';
  }
  if (watch.haveAnchor && watch.stuckMs >= STUCK_UNRESOLVED_MS) {
    if (travelFrom(sample, watch.ax, watch.ay, watch.az) < STUCK_TRAVEL_MAX) {
      return 'stuck';
    }
    watch.ax = sample.x;
    watch.ay = sample.y;
    watch.az = sample.z;
    watch.stuckMs = 0;
  }
  if (watch.buriedMs >= BURIED_CONFIRM_MS) {
    return 'buried';
  }
  const pushing = sample.rateMag >= THRASH_RATE || sample.throttle >= THRASH_THROTTLE;
  if (!soft && !sample.takingOff && Boolean(sample.contact) && pushing) {
    if (!watch.haveThrash) {
      watch.tx = sample.x;
      watch.ty = sample.y;
      watch.tz = sample.z;
      watch.haveThrash = true;
      watch.thrashMs = 0;
    }
    watch.thrashMs += dt;
    if (watch.thrashMs >= THRASH_MS) {
      if (travelFrom(sample, watch.tx, watch.ty, watch.tz) < THRASH_TRAVEL) {
        return 'thrash';
      }
      watch.tx = sample.x;
      watch.ty = sample.y;
      watch.tz = sample.z;
      watch.thrashMs = 0;
    }
  } else {
    watch.haveThrash = false;
    watch.thrashMs = 0;
  }
  return null;
}

/* ---------------------------------------------------------------- Colliders */

const CELL = 8;
const CELLS_HALF = 2048;
const REPORT_CAP = 8;

/* Per collider columns, named as the views callers read. */
const FLOATS = ['fax', 'fay', 'faz', 'fbx', 'fby', 'fbz', 'fr', 'fux', 'fuz', 'fu0', 'fu1', 'fw0', 'fw1'];
const VIEWS = [...FLOATS, 'fkind', 'fbox', 'pass'];

const cellKey = (cx, cz) => (cx + CELLS_HALF) * 4096 + (cz + CELLS_HALF);

/* NaN passes through and then walks no cells. */
function cellOf(v) {
  const c = Math.floor(v / CELL);
  return c < -CELLS_HALF ? -CELLS_HALF : c > CELLS_HALF - 1 ? CELLS_HALF - 1 : c;
}

function kindIndex(kindName) {
  const k = KINDS.indexOf(kindName);
  if (k < 0) {
    throw new Error(`collide: unknown kind ${kindName}`);
  }
  return k;
}

const clampRadius = (v) => (v < CRAFT_WORLD_HULL ? CRAFT_WORLD_HULL : v > CRAFT_WORLD_R ? CRAFT_WORLD_R : v);

/* A set being written down: doubles as given, one column per field. */
function newDraft() {
  const d = { kind: [], box: [], maxR: 0, sweeps: new Map() };
  for (const f of FLOATS) {
    d[f] = [];
  }
  return d;
}

function pushRow(d, kind, box, a, b, r, frame) {
  d.kind.push(kind);
  d.box.push(box);
  d.fax.push(a[0]);
  d.fay.push(a[1]);
  d.faz.push(a[2]);
  d.fbx.push(b[0]);
  d.fby.push(b[1]);
  d.fbz.push(b[2]);
  d.fr.push(r);
  d.fux.push(frame[0]);
  d.fuz.push(frame[1]);
  d.fu0.push(frame[2]);
  d.fu1.push(frame[3]);
  d.fw0.push(frame[4]);
  d.fw1.push(frame[5]);
}

const NO_FRAME = [0, 0, 0, 0, 0, 0];

function draftCapsule(d, kindName, ax, ay, az, bx, by, bz, r) {
  pushRow(d, kindIndex(kindName), 0, [ax, ay, az], [bx, by, bz], r, NO_FRAME);
  if (r > d.maxR) {
    d.maxR = r;
  }
}

/* A draft frozen to single precision: every coordinate a query reads. */
function freeze(d) {
  const set = { n: d.kind.length, maxR: d.maxR, fkind: Int32Array.from(d.kind), fbox: Uint8Array.from(d.box) };
  for (const f of FLOATS) {
    set[f] = Float32Array.from(d[f]);
  }
  return set;
}

const EMPTY = freeze(newDraft());

/*
 * Files a frozen set into its grid: a counting pass that sizes every cell
 * and validates the reach, then a filing pass. Either can be cut into
 * slices of a budget of cell entries, which is how a streamed refill
 * spreads its cost over frames; the slice boundaries decide the frame on
 * which a refill turns solid, so the accounting is exact.
 */
class Registrar {
  constructor(set, sweeps) {
    this.set = set;
    this.sweeps = sweeps;
    this.grid = new Map();
    this.fill = new Map();
    this.foot = new Int32Array(set.n * 4);
    this.filing = false;
    this.next = 0;
  }

  get done() {
    return this.filing && this.next >= this.set.n;
  }

  step(budget) {
    let left = budget;
    if (!this.filing) {
      let written = 0;
      while (this.next < this.set.n && written < budget) {
        written += this.count(this.next);
        this.next += 1;
      }
      if (this.next >= this.set.n) {
        this.startFiling();
      }
      left = budget - written;
    }
    if (this.filing && left > 0) {
      let written = 0;
      while (this.next < this.set.n && written < left) {
        written += this.file(this.next);
        this.next += 1;
      }
    }
    return this.done;
  }

  /* Validates collider j's footprint, keeps it, counts its cells. */
  count(j) {
    const s = this.set;
    const rect = this.sweeps ? this.sweeps.get(j) : undefined;
    const r = s.fr[j];
    const cx0 = Math.floor((rect ? rect[0] : Math.min(s.fax[j], s.fbx[j]) - r) / CELL);
    const cz0 = Math.floor((rect ? rect[1] : Math.min(s.faz[j], s.fbz[j]) - r) / CELL);
    const cx1 = Math.floor((rect ? rect[2] : Math.max(s.fax[j], s.fbx[j]) + r) / CELL);
    const cz1 = Math.floor((rect ? rect[3] : Math.max(s.faz[j], s.fbz[j]) + r) / CELL);
    if (!(cx0 >= -CELLS_HALF && cx1 < CELLS_HALF && cz0 >= -CELLS_HALF && cz1 < CELLS_HALF)) {
      throw new Error(`collide: a ${KINDS[s.fkind[j]]} from (${s.fax[j]}, ${s.faz[j]}) to (${s.fbx[j]}, ${s.fbz[j]}) is outside `
        + 'the grid, which reaches 16384 m from the origin');
    }
    this.foot.set([cx0, cx1, cz0, cz1], j * 4);
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cz = cz0; cz <= cz1; cz += 1) {
        const key = cellKey(cx, cz);
        this.fill.set(key, (this.fill.get(key) || 0) + 1);
      }
    }
    return (cx1 - cx0 + 1) * (cz1 - cz0 + 1);
  }

  startFiling() {
    for (const [key, n] of this.fill) {
      this.grid.set(key, new Int32Array(n));
      this.fill.set(key, 0);
    }
    this.filing = true;
    this.next = 0;
  }

  file(j) {
    const f = this.foot;
    const [cx0, cx1, cz0, cz1] = [f[j * 4], f[j * 4 + 1], f[j * 4 + 2], f[j * 4 + 3]];
    for (let cx = cx0; cx <= cx1; cx += 1) {
      for (let cz = cz0; cz <= cz1; cz += 1) {
        const key = cellKey(cx, cz);
        const at = this.fill.get(key);
        this.grid.get(key)[at] = j;
        this.fill.set(key, at + 1);
      }
    }
    return (cx1 - cx0 + 1) * (cz1 - cz0 + 1);
  }
}

function registerWhole(set, sweeps) {
  const reg = new Registrar(set, sweeps);
  reg.step(Infinity);
  return reg.grid;
}

/* The add methods shared by a Colliders before build and a refill before
 * its first step. */
class Writer {
  constructor(closedMessage) {
    this.draft = newDraft();
    this.closedMessage = closedMessage;
  }

  /* Callers take ax.length as the index the next add gets. */
  get ax() {
    return this.draft ? this.draft.fax : null;
  }

  open() {
    if (!this.draft) {
      throw new Error(this.closedMessage);
    }
    return this.draft;
  }

  add(kindName, ax, ay, az, bx, by, bz, r) {
    draftCapsule(this.open(), kindName, ax, ay, az, bx, by, bz, r);
    return this;
  }

  addPost(kindName, x, z, y0, y1, r) {
    return this.add(kindName, x, y0, z, x, y1, z, r);
  }

  addSphere(kindName, x, y, z, r) {
    return this.add(kindName, x, y, z, x, y, z, r);
  }

  addBox(kindName, x0, y0, z0, x1, y1, z1) {
    const d = this.open();
    const k = kindIndex(kindName);
    const i = d.kind.length;
    pushRow(d, k, 1, [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], 0, NO_FRAME);
    return i;
  }

  /*
   * A box turned about the vertical. Its axis is rounded to single
   * precision first so the padded world bounds are taken from the frame
   * the queries will use.
   */
  addTurnedBox(kindName, ux, uz, u0, u1, y0, y1, w0, w1) {
    const d = this.open();
    const k = kindIndex(kindName);
    const l = Math.sqrt(ux * ux + uz * uz);
    if (!(l > 0) || !(u0 <= u1) || !(y0 <= y1) || !(w0 <= w1)) {
      throw new Error(`collide: a turned box needs a direction and ordered extents, got (${ux}, ${uz}) ${u0}..${u1} ${y0}..${y1} `
        + `${w0}..${w1}`);
    }
    const cx = Math.fround(ux / l);
    const cz = Math.fround(uz / l);
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [u, w] of [[u0, w0], [u0, w1], [u1, w0], [u1, w1]]) {
      const x = u * cx - w * cz;
      const z = u * cz + w * cx;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    /* The frame rounds differently from the bounds; a hair of slack keeps
     * every point of the box inside them. */
    const pad = 1e-6 * (Math.abs(x0) + Math.abs(x1) + Math.abs(z0) + Math.abs(z1)) + 1e-6;
    const i = d.kind.length;
    pushRow(d, k, TURNED, [x0 - pad, y0, z0 - pad], [x1 + pad, y1, z1 + pad], 0, [cx, cz, u0, u1, w0, w1]);
    return i;
  }

  sweep(i, x0, z0, x1, z1) {
    const d = this.open();
    if (d.box[i] !== 0) {
      throw new Error(`collide: only a capsule sweeps, not collider ${i}`);
    }
    const r = d.fr[i];
    const holds = x0 <= Math.min(d.fax[i], d.fbx[i]) - r && x1 >= Math.max(d.fax[i], d.fbx[i]) + r
      && z0 <= Math.min(d.faz[i], d.fbz[i]) - r && z1 >= Math.max(d.faz[i], d.fbz[i]) + r;
    if (!holds) {
      throw new Error(`collide: collider ${i}'s sweep does not hold where it stands`);
    }
    d.sweeps.set(i, [x0, z0, x1, z1]);
    return this;
  }
}

/*
 * A streamed set written down while the old one stays in force, filed a
 * slice per step, and swapped in whole on the step that finishes it. A
 * refill's grid ignores sweeps.
 */
class StreamFill extends Writer {
  constructor(owner) {
    super('collide: add to a streamed set after its first step');
    this.owner = owner;
    this.set = null;
    this.reg = null;
  }

  step(budget = STREAM_SLICE) {
    if (this.owner.refill !== this) {
      throw new Error('collide: step on a streamed set that was replaced or already swapped in');
    }
    if (!this.reg) {
      this.set = freeze(this.draft);
      this.draft = null;
      this.reg = new Registrar(this.set, null);
    }
    if (!this.reg.step(budget)) {
      return false;
    }
    this.owner.swapIn(this.set, this.reg.grid);
    return true;
  }
}

/* The slab walk's inputs and breakpoints, all doubles. */
function slabScratch() {
  return {
    lo: new Float64Array(3), hi: new Float64Array(3), p: new Float64Array(3), d: new Float64Array(3),
    r: new Float64Array(3), bp: new Float64Array(8),
  };
}

const set3 = (v, x, y, z) => {
  v[0] = x;
  v[1] = y;
  v[2] = z;
};

/*
 * Between two breakpoints the set of axes the ellipsoid's centre is
 * outside of is fixed, so the scaled squared distance to the box is one
 * quadratic in t there: its first root at or under 1 is first touch.
 */
function slabSpan(w, t0, t1) {
  if (t1 <= t0) {
    return -1;
  }
  const tm = (t0 + t1) * 0.5;
  let qa = 0;
  let qb = 0;
  let qc = 0;
  for (let k = 0; k < 3; k += 1) {
    const mid = w.p[k] + w.d[k] * tm;
    let A;
    let B;
    if (mid < w.lo[k]) {
      A = (w.lo[k] - w.p[k]) / w.r[k];
      B = -w.d[k] / w.r[k];
    } else if (mid > w.hi[k]) {
      A = (w.p[k] - w.hi[k]) / w.r[k];
      B = w.d[k] / w.r[k];
    } else {
      continue;
    }
    qa += B * B;
    qb += 2 * A * B;
    qc += A * A;
  }
  if (qa * t0 * t0 + qb * t0 + qc <= 1) {
    return t0;
  }
  let root = -1;
  if (qa > 0) {
    const disc = qb * qb - 4 * qa * (qc - 1);
    if (disc < 0) {
      return -1;
    }
    root = (-qb - Math.sqrt(disc)) / (2 * qa);
  } else if (qb < 0) {
    root = (1 - qc) / qb;
  } else {
    return -1;
  }
  return root >= t0 && root <= t1 ? root : -1;
}

/* Earliest t in [0, 1] at which the ellipsoid (semi-axes r) centred at
 * p + t d touches the box [lo, hi], or -1. */
function slabWalk(w) {
  const bp = w.bp;
  bp[0] = 0;
  bp[1] = 1;
  let n = 2;
  for (let k = 0; k < 3; k += 1) {
    if (w.d[k] === 0) {
      continue;
    }
    const ta = (w.lo[k] - w.p[k]) / w.d[k];
    if (ta > 0 && ta < 1) {
      bp[n] = ta;
      n += 1;
    }
    const tb = (w.hi[k] - w.p[k]) / w.d[k];
    if (tb > 0 && tb < 1) {
      bp[n] = tb;
      n += 1;
    }
  }
  for (let j = 1; j < n; j += 1) {
    const v = bp[j];
    let k = j - 1;
    while (k >= 0 && bp[k] > v) {
      bp[k + 1] = bp[k];
      k -= 1;
    }
    bp[k + 1] = v;
  }
  for (let j = 1; j < n; j += 1) {
    const t = slabSpan(w, bp[j - 1], bp[j]);
    if (t >= 0) {
      return t;
    }
  }
  return -1;
}

/* Signed depth of p into [lo, hi]: the least way out inside, minus the
 * distance outside. */
function boxDepth(lo, hi, p) {
  const out = (k) => (p[k] < lo[k] ? lo[k] - p[k] : p[k] > hi[k] ? p[k] - hi[k] : 0);
  const ox = out(0);
  const oy = out(1);
  const oz = out(2);
  if (ox !== 0 || oy !== 0 || oz !== 0) {
    return -Math.sqrt(ox * ox + oy * oy + oz * oz);
  }
  const way = (k) => (p[k] - lo[k] < hi[k] - p[k] ? p[k] - lo[k] : hi[k] - p[k]);
  const ix = way(0);
  const iy = way(1);
  const iz = way(2);
  const m = ix < iy ? ix : iy;
  return iz < m ? iz : m;
}

/* Did a to b enter one face of [lo, hi] and leave by the opposite one? */
function crossesBox(lo, hi, a, b) {
  let opposite = false;
  for (let k = 0; k < 3; k += 1) {
    if ((a[k] < lo[k] && b[k] > hi[k]) || (a[k] > hi[k] && b[k] < lo[k])) {
      opposite = true;
    }
  }
  if (!opposite) {
    return false;
  }
  let tmin = 0;
  let tmax = 1;
  for (let k = 0; k < 3; k += 1) {
    const d = b[k] - a[k];
    if (d > -1e-18 && d < 1e-18) {
      if (a[k] < lo[k] || a[k] > hi[k]) {
        return false;
      }
      continue;
    }
    let u0 = (lo[k] - a[k]) / d;
    let u1 = (hi[k] - a[k]) / d;
    if (u0 > u1) {
      [u0, u1] = [u1, u0];
    }
    if (u0 > tmin) {
      tmin = u0;
    }
    if (u1 < tmax) {
      tmax = u1;
    }
    if (tmin > tmax) {
      return false;
    }
  }
  return true;
}

/* The ellipsoid's overlap along the overhang o: how far its surface
 * reaches past the box face in that direction. */
function ellipsoidOverlap(ox, oy, oz, rx, ry, rz) {
  const d2 = ox * ox + oy * oy + oz * oz;
  if (!(d2 > 1e-18)) {
    return 0;
  }
  const dist = Math.sqrt(d2);
  const sx = rx > 1e-9 ? ox / dist / rx : 0;
  const sy = ry > 1e-9 ? oy / dist / ry : 0;
  const sz = rz > 1e-9 ? oz / dist / rz : 0;
  const q = sx * sx + sy * sy + sz * sz;
  if (!(q > 1e-18)) {
    return 0;
  }
  const along = 1 / Math.sqrt(q);
  return along > dist ? along - dist : 0;
}

const better = (x, b) => b.t < 0 || x.t < b.t || (x.t === b.t && x.depth > b.depth);

function copyContact(src, dst) {
  dst.t = src.t;
  dst.nx = src.nx;
  dst.ny = src.ny;
  dst.nz = src.nz;
  dst.depth = src.depth;
  dst.px = src.px;
  dst.py = src.py;
  dst.pz = src.pz;
  dst.part = src.part;
}

/*
 * Every solid of a map in one index space: the static set frozen by
 * build(), then a streamed set replaced whole by a refill, then the
 * builder's gates replaced whole on each edit. Moving boxes stand apart.
 */
export class Colliders extends Writer {
  constructor() {
    super('collide: add after build');
    this.built = false;
    this.count = undefined;
    this.baseCount = undefined;
    this.staticCount = 0;
    this.streamCount = 0;
    this.streamGen = 0;
    this.staticGen = 0;
    this.softKinds = 0;
    this.grid = null;
    this.movingCount = 0;
    this.movingCx = [];
    this.movingCy = [];
    this.movingCz = [];
    this.movingPx = [];
    this.movingPy = [];
    this.movingPz = [];
    this.movers = [];
    this.nx = 0;
    this.ny = 0;
    this.nz = 0;
    this.hitIndex = -1;
    this.hitKind = -1;
    this.hitT = -1;
    this.hitOverlap = 0;
    this.hitNormalDot = 0;
    this.hitNx = 0;
    this.hitNy = 0;
    this.hitNz = 0;
    this.hitMoving = -1;
    this.hitArm = false;
    this.hitArmX = 0;
    this.hitArmY = 0;
    this.hitArmZ = 0;
    this.hitPart = -1;
    this.axisFound = false;
    this.axisGap = Infinity;
    this.axisDx = 0;
    this.axisDy = 0;
    this.axisDz = 0;
    this.axisCx = 0;
    this.axisCy = 0;
    this.axisCz = 0;

    this.store = null;
    this.stream = { set: EMPTY, grid: null };
    this.gates = { set: EMPTY, grid: null };
    this.refill = null;
    this.sweeps = null;
    this.sunk = new Map();
    this.walk = [];
    this.pad = 0;
    this.seen = new Float64Array(0);
    this.cands = new Int32Array(0);
    this.mark = 0;
    this.tally = { queries: 0, total: 0, last: 0 };
    this.att = new Float64Array(9);
    this.slab = slabScratch();
    this.lax = new Float64Array(9);
    this.c3 = new Float64Array(3);
    this.lo3 = new Float64Array(3);
    this.hi3 = new Float64Array(3);
    this.pa = new Float64Array(3);
    this.pb = new Float64Array(3);
    this.got = hullContact();
    this.best = hullContact();
    this.nrm = new Float64Array(3);
  }

  build() {
    const set = freeze(this.draft);
    const grid = registerWhole(set, this.draft.sweeps);
    this.sweeps = this.draft.sweeps;
    this.staticMaxR = set.maxR;
    this.grid = grid;
    this.store = { pass: new Uint8Array(set.n) };
    for (const v of VIEWS) {
      if (v !== 'pass') {
        this.store[v] = set[v];
      }
    }
    this.staticCount = set.n;
    this.draft = null;
    this.built = true;
    this.relayout();
    return this;
  }

  /* The query pad: no collider reaches farther than this from its axis. */
  padRadius() {
    return this.built ? this.pad : this.draft.maxR;
  }

  relayout() {
    const s = this.staticCount;
    this.streamCount = this.stream.set.n;
    this.baseCount = s + this.streamCount;
    this.count = this.baseCount + this.gates.set.n;
    for (const v of VIEWS) {
      this[v] = this.store[v].subarray(0, this.count);
    }
    this.pad = Math.max(this.staticMaxR, this.stream.set.maxR, this.gates.set.maxR);
    this.walk = [{ grid: this.grid, offset: 0 }];
    if (this.stream.set.n > 0) {
      this.walk.push({ grid: this.stream.grid, offset: s });
    }
    if (this.gates.set.n > 0) {
      this.walk.push({ grid: this.gates.grid, offset: this.baseCount });
    }
    if (this.seen.length < this.count) {
      this.seen = new Float64Array(this.store.pass.length);
      this.cands = new Int32Array(this.store.pass.length);
      this.mark = 0;
    }
  }

  /* Room for `end` colliders, with as much again as the sets past the
   * static one take, so refills of a similar size write in place. */
  makeRoom(end) {
    const old = this.store;
    if (end <= old.pass.length) {
      return;
    }
    const cap = end + (end - this.staticCount);
    const store = {};
    for (const v of VIEWS) {
      store[v] = new old[v].constructor(cap);
      store[v].set(old[v]);
    }
    this.store = store;
  }

  place(set, at) {
    for (const v of VIEWS) {
      if (v !== 'pass') {
        this.store[v].set(set[v], at);
      }
    }
    this.store.pass.fill(0, at, at + set.n);
  }

  setBuilt(caps) {
    if (!this.built) {
      throw new Error('collide: setBuilt before build');
    }
    const d = newDraft();
    for (const c of caps) {
      draftCapsule(d, c.kind, c.ax, c.ay, c.az, c.bx, c.by, c.bz, c.r);
    }
    const set = freeze(d);
    const grid = registerWhole(set, null);
    this.gates = { set, grid };
    this.makeRoom(this.baseCount + set.n);
    this.place(set, this.baseCount);
    this.relayout();
    return this;
  }

  streamFill() {
    if (!this.built) {
      throw new Error('collide: streamFill before build');
    }
    this.refill = new StreamFill(this);
    return this.refill;
  }

  swapIn(set, grid) {
    this.refill = null;
    this.stream = { set, grid: set.n > 0 ? grid : null };
    const at = this.staticCount;
    this.makeRoom(at + set.n + this.gates.set.n);
    this.place(set, at);
    this.place(this.gates.set, at + set.n);
    this.streamGen += 1;
    this.relayout();
  }

  /* ----------------------------------------------------------- moving boxes */

  addMoving(kindName, hx, hy, hz) {
    const kind = kindIndex(kindName);
    const i = this.movingCount;
    this.movers.push({ kind, hx, hy, hz });
    for (const c of [this.movingCx, this.movingCy, this.movingCz, this.movingPx, this.movingPy, this.movingPz]) {
      c.push(0);
    }
    this.movingCount += 1;
    return i;
  }

  setMovingCentre(i, x, y, z) {
    this.movingPx[i] = this.movingCx[i];
    this.movingPy[i] = this.movingCy[i];
    this.movingPz[i] = this.movingCz[i];
    this.movingCx[i] = x;
    this.movingCy[i] = y;
    this.movingCz[i] = z;
    return this;
  }

  seatMoving(i, x, y, z) {
    this.movingCx[i] = x;
    this.movingCy[i] = y;
    this.movingCz[i] = z;
    this.movingPx[i] = x;
    this.movingPy[i] = y;
    this.movingPz[i] = z;
    return this;
  }

  /* ----------------------------------------------- edits to static colliders */

  editableBox(index, what) {
    if (!this.built) {
      throw new Error(`collide: ${what} before build`);
    }
    if (!this.fbox[index]) {
      throw new Error(`collide: collider ${index} is not a box`);
    }
  }

  setBoxExtentY(index, y0, y1) {
    this.editableBox(index, 'setBoxExtentY');
    if (!(y0 <= y1)) {
      throw new Error(`collide: inverted box extent ${y0} > ${y1} on collider ${index}`);
    }
    this.fay[index] = y0;
    this.fby[index] = y1;
    return this;
  }

  setBoxTop(index, top) {
    this.editableBox(index, 'setBoxTop');
    if (!(this.fay[index] <= top)) {
      throw new Error(`collide: setBoxTop ${top} below bottom ${this.fay[index]} on collider ${index}`);
    }
    this.fby[index] = top;
    return this;
  }

  /* A retired collider is sunk far under the map rather than removed, so
   * no index, grid cell or count moves. */
  retire(index) {
    if (!this.built) {
      throw new Error('collide: retire before build');
    }
    if (!(index >= 0 && index < this.staticCount)) {
      throw new Error(`collide: retire ${index} is not a static collider`);
    }
    if (this.sunk.has(index)) {
      return this;
    }
    this.sunk.set(index, [this.fay[index], this.fby[index]]);
    this.fay[index] = SUNK_Y;
    this.fby[index] = SUNK_Y;
    this.staticGen += 1;
    return this;
  }

  restore(index) {
    const ys = this.sunk.get(index);
    if (!ys) {
      return this;
    }
    this.fay[index] = ys[0];
    this.fby[index] = ys[1];
    this.sunk.delete(index);
    this.staticGen += 1;
    return this;
  }

  retired() {
    return this.sunk.size;
  }

  moveCapsule(index, a, b) {
    const rect = this.built ? this.sweeps.get(index) : undefined;
    if (!rect) {
      throw new Error(`collide: collider ${index} was not registered to move`);
    }
    const r = this.fr[index];
    const inside = Math.min(a[0], b[0]) - r >= rect[0] - 1e-3 && Math.max(a[0], b[0]) + r <= rect[2] + 1e-3
      && Math.min(a[2], b[2]) - r >= rect[1] - 1e-3 && Math.max(a[2], b[2]) + r <= rect[3] + 1e-3;
    if (!inside) {
      throw new Error(`collide: collider ${index} moved out of its sweep`);
    }
    this.fax[index] = a[0];
    this.faz[index] = a[2];
    this.fbx[index] = b[0];
    this.fbz[index] = b[2];
    const ys = this.sunk.get(index);
    if (ys) {
      ys[0] = a[1];
      ys[1] = b[1];
    } else {
      this.fay[index] = a[1];
      this.fby[index] = b[1];
    }
    this.staticGen += 1;
    return this;
  }

  /* ------------------------------------------------------------- broadphase */

  /* Candidates in the world rectangle, each once, in visiting order:
   * static cells x then z, then streamed, then built. Into this.cands. */
  gather(x0, x1, z0, z1) {
    const cx0 = cellOf(x0);
    const cx1 = cellOf(x1);
    const cz0 = cellOf(z0);
    const cz1 = cellOf(z1);
    this.mark += 1;
    let n = 0;
    for (let w = 0; w < this.walk.length; w += 1) {
      const { grid, offset } = this.walk[w];
      for (let cx = cx0; cx <= cx1; cx += 1) {
        for (let cz = cz0; cz <= cz1; cz += 1) {
          n = this.gatherCell(grid.get(cellKey(cx, cz)), offset, n);
        }
      }
    }
    return n;
  }

  gatherCell(list, offset, n) {
    if (!list) {
      return n;
    }
    for (let k = 0; k < list.length; k += 1) {
      const i = offset + list[k];
      if (this.seen[i] !== this.mark) {
        this.seen[i] = this.mark;
        this.cands[n] = i;
        n += 1;
      }
    }
    return n;
  }

  /* ------------------------------------------------------- primitive pieces */

  /* The vector from capsule i's nearest axis point to (cx, cy, cz), into
   * nx, ny, nz. */
  axisToPoint(i, cx, cy, cz) {
    const ex = this.fbx[i] - this.fax[i];
    const ey = this.fby[i] - this.fay[i];
    const ez = this.fbz[i] - this.faz[i];
    const mx = cx - this.fax[i];
    const my = cy - this.fay[i];
    const mz = cz - this.faz[i];
    const ee = ex * ex + ey * ey + ez * ez;
    const u = ee > 1e-12 ? clamp01((ex * mx + ey * my + ez * mz) / ee) : 0;
    this.nx = mx - ex * u;
    this.ny = my - ey * u;
    this.nz = mz - ez * u;
  }

  boxGap(i, px, py, pz) {
    const turned = this.fbox[i] === TURNED;
    const x = turned ? px * this.fux[i] + pz * this.fuz[i] : px;
    const z = turned ? pz * this.fux[i] - px * this.fuz[i] : pz;
    const ox = turned ? Math.max(this.fu0[i] - x, 0, x - this.fu1[i]) : Math.max(this.fax[i] - x, 0, x - this.fbx[i]);
    const oy = Math.max(this.fay[i] - py, 0, py - this.fby[i]);
    const oz = turned ? Math.max(this.fw0[i] - z, 0, z - this.fw1[i]) : Math.max(this.faz[i] - z, 0, z - this.fbz[i]);
    return Math.sqrt(ox * ox + oy * oy + oz * oz);
  }

  /* Box i into lo3/hi3 and point p into pa, in the box's own frame. */
  boxFrame(i, px, py, pz) {
    if (this.fbox[i] === TURNED) {
      const tx = this.fux[i];
      const tz = this.fuz[i];
      set3(this.lo3, this.fu0[i], this.fay[i], this.fw0[i]);
      set3(this.hi3, this.fu1[i], this.fby[i], this.fw1[i]);
      set3(this.pa, px * tx + pz * tz, py, pz * tx - px * tz);
      return;
    }
    set3(this.lo3, this.fax[i], this.fay[i], this.faz[i]);
    set3(this.hi3, this.fbx[i], this.fby[i], this.fbz[i]);
    set3(this.pa, px, py, pz);
  }

  /* Disc radius along a world direction, from the attitude in att. */
  support(nx, ny, nz) {
    const nl2 = nx * nx + ny * ny + nz * nz;
    if (nl2 < 1e-18) {
      return CRAFT_WORLD_R;
    }
    const inv = 1 / Math.sqrt(nl2);
    const x = nx * inv;
    const y = ny * inv;
    const z = nz * inv;
    const e = this.att;
    const motor = CRAFT_WORLD_ARM_AXIS * (Math.abs(x * e[0] + y * e[1] + z * e[2]) + Math.abs(x * e[6] + y * e[7] + z * e[8]));
    const ndu = x * e[3] + y * e[4] + z * e[5];
    let s2 = 1 - ndu * ndu;
    if (s2 < 0) {
      s2 = 0;
    }
    return motor + CRAFT_WORLD_HULL * Math.sqrt(s2);
  }

  /* Earliest t in [0, 1] at which p + t d comes within reach of capsule
   * i's axis (reachSq = reach squared, a = d . d), or -1. */
  capsuleT(i, px, py, pz, dx, dy, dz, a, reachSq) {
    const ex = this.fbx[i] - this.fax[i];
    const ey = this.fby[i] - this.fay[i];
    const ez = this.fbz[i] - this.faz[i];
    const mx = px - this.fax[i];
    const my = py - this.fay[i];
    const mz = pz - this.faz[i];
    const ee = ex * ex + ey * ey + ez * ez;
    const u = ee > 1e-12 ? clamp01((ex * mx + ey * my + ez * mz) / ee) : 0;
    const gx = mx - ex * u;
    const gy = my - ey * u;
    const gz = mz - ez * u;
    if (gx * gx + gy * gy + gz * gz <= reachSq) {
      return 0;
    }
    if (a <= 1e-12) {
      return -1;
    }
    let best = sphereEnter(-1, dx, dy, dz, a, reachSq, mx, my, mz);
    best = sphereEnter(best, dx, dy, dz, a, reachSq, px - this.fbx[i], py - this.fby[i], pz - this.fbz[i]);
    if (!(ee > 1e-12)) {
      return best;
    }
    const t = cylinderEnter(ex, ey, ez, ee, mx, my, mz, dx, dy, dz, reachSq);
    return t >= 0 && (best < 0 || t < best) ? t : best;
  }

  /* Travel parameter in [0, 1] where p + s d comes nearest capsule i's
   * axis segment. */
  closestS(i, px, py, pz, dx, dy, dz, a) {
    const ex = this.fbx[i] - this.fax[i];
    const ey = this.fby[i] - this.fay[i];
    const ez = this.fbz[i] - this.faz[i];
    const rx = px - this.fax[i];
    const ry = py - this.fay[i];
    const rz = pz - this.faz[i];
    const e = ex * ex + ey * ey + ez * ez;
    const f = ex * rx + ey * ry + ez * rz;
    const c = dx * rx + dy * ry + dz * rz;
    if (a <= 1e-12) {
      return 0;
    }
    if (e <= 1e-12) {
      return clamp01(-c / a);
    }
    const b = dx * ex + dy * ey + dz * ez;
    const denom = a * e - b * b;
    const s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
    const t = (b * s + f) / e;
    if (t < 0) {
      return clamp01(-c / a);
    }
    if (t > 1) {
      return clamp01((b - c) / a);
    }
    return s;
  }

  /* The travel p to q misses box i grown by g on every side. */
  passesBy(i, g, px, py, pz, qx, qy, qz) {
    const x0 = this.fax[i] - g;
    const x1 = this.fbx[i] + g;
    const y0 = this.fay[i] - g;
    const y1 = this.fby[i] + g;
    const z0 = this.faz[i] - g;
    const z1 = this.fbz[i] + g;
    return (px < x0 && qx < x0) || (px > x1 && qx > x1) || (py < y0 && qy < y0) || (py > y1 && qy > y1)
      || (pz < z0 && qz < z0) || (pz > z1 && qz > z1);
  }

  skipped(i) {
    return this.pass[i] !== 0 || (this.softKinds & (1 << this.fkind[i])) !== 0;
  }

  countQuery(n) {
    this.tally.last = n;
    this.tally.queries += 1;
    this.tally.total += n;
  }

  /*
   * The report's normal: n made unit (or the reverse travel when n has no
   * length), turned to face the travel when the craft only grazed.
   */
  finishNormal(nx, ny, nz, dx, dy, dz) {
    let nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const tl = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (nl <= 1e-9) {
      if (tl <= 1e-9) {
        this.hitNx = 0;
        this.hitNy = 1;
        this.hitNz = 0;
        this.hitNormalDot = 1;
        return;
      }
      nx = -dx;
      ny = -dy;
      nz = -dz;
      nl = tl;
    }
    const inv = 1 / nl;
    nx *= inv;
    ny *= inv;
    nz *= inv;
    if (tl > 1e-9) {
      const along = dx * nx + dy * ny + dz * nz;
      this.hitNormalDot = along < 0 ? -along / tl : along / tl;
      if (along > 0 && this.hitPen <= 0 && this.hitOverlap <= 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    } else {
      this.hitNormalDot = 1;
    }
    this.hitNx = nx;
    this.hitNy = ny;
    this.hitNz = nz;
  }

  /*
   * Pen or overlap of an ellipsoid (semi-axes rx, ry, rz) centred at l
   * against [lo3, hi3], and the raw normal out of the box into nrm.
   */
  boxReport(lx, ly, lz, rx, ry, rz) {
    const lo = this.lo3;
    const hi = this.hi3;
    const n = this.nrm;
    const l = [lx, ly, lz];
    for (let k = 0; k < 3; k += 1) {
      n[k] = l[k] < lo[k] ? l[k] - lo[k] : l[k] > hi[k] ? l[k] - hi[k] : 0;
    }
    if (n[0] !== 0 || n[1] !== 0 || n[2] !== 0) {
      const o = ellipsoidOverlap(n[0], n[1], n[2], rx, ry, rz);
      this.hitOverlap = o > REPORT_CAP ? REPORT_CAP : o;
      return;
    }
    const semi = [rx, ry, rz];
    let best = lx - lo[0];
    let face = 0;
    for (let f = 1; f < 6; f += 1) {
      const k = f >> 1;
      const dist = f & 1 ? hi[k] - l[k] : l[k] - lo[k];
      if (dist < best) {
        best = dist;
        face = f;
      }
    }
    set3(n, 0, 0, 0);
    n[face >> 1] = face & 1 ? 1 : -1;
    const pen = best + semi[face >> 1];
    this.hitPen = pen > REPORT_CAP ? REPORT_CAP : pen;
  }

  /* -------------------------------------------------------------- the sweep */

  /*
   * Did the craft, travelling p to q this step, touch anything? The craft
   * is four prop discs in an X at the attitude aq, vh their vertical
   * semi-axis, vOff the hull centre's offset along body up. Returns the
   * kind of the earliest contact or -1, and fills the hit report.
   */
  hit(px, py, pz, qx, qy, qz, vh = CRAFT_WORLD_R, aqX = 0, aqY = 0, aqZ = 0, aqW = 1, vOff = 0) {
    this.hitIndex = -1;
    this.hitKind = -1;
    this.hitNormalDot = 0;
    this.hitT = -1;
    this.hitNx = 0;
    this.hitNy = 0;
    this.hitNz = 0;
    this.hitPen = 0;
    this.hitOverlap = 0;
    this.hitMoving = -1;
    this.hitArm = false;
    this.hitPart = -1;
    if (!this.built) {
      return -1;
    }
    if (!(Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz) && Number.isFinite(qx) && Number.isFinite(qy)
      && Number.isFinite(qz))) {
      return -1;
    }
    if (seatedParts) {
      return this.partsHit(seatedParts, px, py, pz, qx, qy, qz, aqX, aqY, aqZ, aqW);
    }
    const e = bodyAxes(aqX, aqY, aqZ, aqW, this.att);
    const crx = clampRadius(this.support(1, 0, 0));
    const crz = clampRadius(this.support(0, 0, 1));
    if (vOff !== 0) {
      px += e[3] * vOff;
      py += e[4] * vOff;
      pz += e[5] * vOff;
      qx += e[3] * vOff;
      qy += e[4] * vOff;
      qz += e[5] * vOff;
    }
    const trip = { px, py, pz, qx, qy, qz, dx: qx - px, dy: qy - py, dz: qz - pz, a: 0, vh, crx, crz };
    trip.a = trip.dx * trip.dx + trip.dy * trip.dy + trip.dz * trip.dz;
    const pad = CRAFT_WORLD_R + this.pad;
    const n = this.gather(Math.min(px, qx) - pad, Math.max(px, qx) + pad, Math.min(pz, qz) - pad, Math.max(pz, qz) + pad);
    let bestT = Infinity;
    let best = -1;
    let bestMoving = -1;
    let counted = 0;
    for (let k = 0; k < n; k += 1) {
      const i = this.cands[k];
      if (this.skipped(i)) {
        continue;
      }
      counted += 1;
      const t = this.fbox[i] ? this.discsIntoBox(i, trip) : this.discsIntoCapsule(i, trip);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = i;
      }
    }
    for (let m = 0; m < this.movingCount; m += 1) {
      const t = this.discsIntoMoving(m, trip);
      if (t >= 0 && t < bestT) {
        bestT = t;
        bestMoving = m;
        best = -1;
      }
    }
    this.countQuery(counted);
    if (bestMoving >= 0) {
      return this.reportMoving(bestMoving, bestT, trip);
    }
    if (best < 0) {
      return -1;
    }
    return this.reportStatic(best, bestT, trip);
  }

  discsIntoBox(i, trip) {
    if (this.passesBy(i, CRAFT_WORLD_R, trip.px, trip.py, trip.pz, trip.qx, trip.qy, trip.qz)) {
      return -1;
    }
    const w = this.slab;
    if (this.fbox[i] !== TURNED) {
      set3(w.lo, this.fax[i], this.fay[i], this.faz[i]);
      set3(w.hi, this.fbx[i], this.fby[i], this.fbz[i]);
      set3(w.p, trip.px, trip.py, trip.pz);
      set3(w.d, trip.dx, trip.dy, trip.dz);
      set3(w.r, trip.crx, trip.vh, trip.crz);
      return slabWalk(w);
    }
    const tx = this.fux[i];
    const tz = this.fuz[i];
    set3(w.lo, this.fu0[i], this.fay[i], this.fw0[i]);
    set3(w.hi, this.fu1[i], this.fby[i], this.fw1[i]);
    set3(w.p, trip.px * tx + trip.pz * tz, trip.py, trip.pz * tx - trip.px * tz);
    set3(w.d, trip.dx * tx + trip.dz * tz, trip.dy, trip.dz * tx - trip.dx * tz);
    set3(w.r, clampRadius(this.support(tx, 0, tz)), trip.vh, clampRadius(this.support(0 - tz, 0, tx)));
    return slabWalk(w);
  }

  /* Against the full radius first; then, if the discs' support toward
   * the capsule at the nearest approach is shorter, again with that. */
  discsIntoCapsule(i, trip) {
    const fr = this.fr[i];
    const reach = fr + CRAFT_WORLD_R;
    const { px, py, pz, dx, dy, dz, a } = trip;
    const t = this.capsuleT(i, px, py, pz, dx, dy, dz, a, reach * reach);
    if (t < 0) {
      return t;
    }
    const s = this.closestS(i, px, py, pz, dx, dy, dz, a);
    this.axisToPoint(i, px + dx * s, py + dy * s, pz + dz * s);
    const nl2 = this.nx * this.nx + this.ny * this.ny + this.nz * this.nz;
    if (!(nl2 > 1e-18)) {
      return t;
    }
    let cr = this.support(this.nx, this.ny, this.nz);
    const nyAbs = Math.abs(this.ny) / Math.sqrt(nl2);
    if (trip.vh * nyAbs > cr) {
      cr = trip.vh * nyAbs;
    }
    if (cr > CRAFT_WORLD_R) {
      cr = CRAFT_WORLD_R;
    }
    const reach2 = fr + cr;
    return reach2 < reach - 1e-9 ? this.capsuleT(i, px, py, pz, dx, dy, dz, a, reach2 * reach2) : t;
  }

  /* A moving box swept in its own frame, from where it was to where it is. */
  discsIntoMoving(m, trip) {
    const { hx, hy, hz } = this.movers[m];
    const w = this.slab;
    const rpx = trip.px - this.movingPx[m];
    const rpy = trip.py - this.movingPy[m];
    const rpz = trip.pz - this.movingPz[m];
    set3(w.lo, -hx, -hy, -hz);
    set3(w.hi, hx, hy, hz);
    set3(w.p, rpx, rpy, rpz);
    set3(w.d, (trip.qx - this.movingCx[m]) - rpx, (trip.qy - this.movingCy[m]) - rpy, (trip.qz - this.movingCz[m]) - rpz);
    set3(w.r, trip.crx, trip.vh, trip.crz);
    return slabWalk(w);
  }

  reportMoving(m, t, trip) {
    const { kind, hx, hy, hz } = this.movers[m];
    const rpx = trip.px - this.movingPx[m];
    const rpy = trip.py - this.movingPy[m];
    const rpz = trip.pz - this.movingPz[m];
    const rdx = (trip.qx - this.movingCx[m]) - rpx;
    const rdy = (trip.qy - this.movingCy[m]) - rpy;
    const rdz = (trip.qz - this.movingCz[m]) - rpz;
    this.hitIndex = -1;
    this.hitKind = kind;
    this.hitT = t;
    this.hitMoving = m;
    set3(this.lo3, -hx, -hy, -hz);
    set3(this.hi3, hx, hy, hz);
    this.boxReport(rpx + rdx * t, rpy + rdy * t, rpz + rdz * t, trip.crx, trip.vh, trip.crz);
    this.finishNormal(this.nrm[0], this.nrm[1], this.nrm[2], rdx, rdy, rdz);
    return kind;
  }

  reportStatic(i, t, trip) {
    this.hitIndex = i;
    this.hitKind = this.fkind[i];
    this.hitT = t;
    this.hitMoving = -1;
    const cx = trip.px + trip.dx * t;
    const cy = trip.py + trip.dy * t;
    const cz = trip.pz + trip.dz * t;
    if (this.fbox[i]) {
      this.reportBox(i, cx, cy, cz, trip);
      this.finishNormal(this.nrm[0], this.nrm[1], this.nrm[2], trip.dx, trip.dy, trip.dz);
      return this.hitKind;
    }
    this.axisToPoint(i, cx, cy, cz);
    const { nx, ny, nz } = this;
    const dist = Math.sqrt(nx * nx + ny * ny + nz * nz);
    let cr = this.support(nx, ny, nz);
    const nyAbs = dist > 1e-18 ? Math.abs(ny) / dist : 1;
    if (trip.vh * nyAbs > cr) {
      cr = trip.vh * nyAbs;
    }
    if (cr > CRAFT_WORLD_R) {
      cr = CRAFT_WORLD_R;
    }
    const reach = this.fr[i] + cr;
    if (dist < reach) {
      const pen = reach - dist;
      this.hitPen = pen > REPORT_CAP ? REPORT_CAP : pen;
      this.hitOverlap = this.hitPen;
    }
    this.finishNormal(nx, ny, nz, trip.dx, trip.dy, trip.dz);
    return this.hitKind;
  }

  reportBox(i, cx, cy, cz, trip) {
    this.boxFrame(i, cx, cy, cz);
    if (this.fbox[i] !== TURNED) {
      this.boxReport(cx, cy, cz, trip.crx, trip.vh, trip.crz);
      return;
    }
    const tx = this.fux[i];
    const tz = this.fuz[i];
    this.boxReport(this.pa[0], this.pa[1], this.pa[2], clampRadius(this.support(tx, 0, tz)), trip.vh,
      clampRadius(this.support(0 - tz, 0, tx)));
    const n = this.nrm;
    const wx = n[0] * tx - n[2] * tz;
    n[2] = n[0] * tz + n[2] * tx;
    n[0] = wx;
  }

  /* ---------------------------------------------------- the fixed wing sweep */

  /* The same question for a fixed wing: each live part's box swept
   * against each solid, the earliest (then deepest) contact winning. */
  partsHit(hull, px, py, pz, qx, qy, qz, aqX, aqY, aqZ, aqW) {
    const ax9 = bodyAxes(aqX, aqY, aqZ, aqW, this.att);
    const reach = hull.reach;
    const pad = (reach > CRAFT_WORLD_R ? reach : CRAFT_WORLD_R) + this.pad;
    const dx = qx - px;
    const dy = qy - py;
    const dz = qz - pz;
    const a = dx * dx + dy * dy + dz * dz;
    const best = this.best;
    best.t = -1;
    best.depth = 0;
    let bestStatic = -1;
    let bestMoving = -1;
    let counted = 0;
    const n = this.gather(Math.min(px, qx) - pad, Math.max(px, qx) + pad, Math.min(pz, qz) - pad, Math.max(pz, qz) + pad);
    for (let k = 0; k < n; k += 1) {
      const i = this.cands[k];
      if (this.skipped(i)) {
        continue;
      }
      counted += 1;
      let won;
      if (!this.fbox[i]) {
        won = this.partsIntoCapsule(hull, i, ax9, px, py, pz, dx, dy, dz, a);
      } else if (this.passesBy(i, reach, px, py, pz, qx, qy, qz)) {
        won = false;
      } else if (this.fbox[i] === TURNED) {
        won = this.partsIntoTurned(hull, i, ax9, px, py, pz, dx, dy, dz);
      } else {
        set3(this.lo3, this.fax[i], this.fay[i], this.faz[i]);
        set3(this.hi3, this.fbx[i], this.fby[i], this.fbz[i]);
        won = this.partsIntoBox(hull, ax9, px, py, pz, dx, dy, dz);
      }
      if (won) {
        bestStatic = i;
      }
    }
    for (let m = 0; m < this.movingCount; m += 1) {
      if (this.partsIntoMoving(hull, m, ax9, px, py, pz, qx, qy, qz, reach)) {
        bestMoving = m;
        bestStatic = -1;
      }
    }
    this.countQuery(counted);
    if (bestStatic < 0 && bestMoving < 0) {
      return -1;
    }
    const t = best.t;
    const cx = px + dx * t;
    const cy = py + dy * t;
    const cz = pz + dz * t;
    this.hitIndex = bestStatic;
    this.hitMoving = bestMoving;
    this.hitKind = bestMoving >= 0 ? this.movers[bestMoving].kind : this.fkind[bestStatic];
    this.hitT = t;
    this.hitArm = true;
    this.hitArmX = best.px - cx;
    this.hitArmY = best.py - cy;
    this.hitArmZ = best.pz - cz;
    this.hitPart = best.part;
    const depth = best.depth > REPORT_CAP ? REPORT_CAP : best.depth;
    this.hitOverlap = depth;
    this.hitPen = this.partsPen(bestStatic, bestMoving, cx, cy, cz, t) ? depth : 0;
    this.finishNormal(best.nx, best.ny, best.nz, dx, dy, dz);
    return this.hitKind;
  }

  /* Whether the craft's centre at the contact is in the solid itself. */
  partsPen(i, m, cx, cy, cz, t) {
    if (m >= 0) {
      const { hx, hy, hz } = this.movers[m];
      const ox = cx - (this.movingPx[m] + (this.movingCx[m] - this.movingPx[m]) * t);
      const oy = cy - (this.movingPy[m] + (this.movingCy[m] - this.movingPy[m]) * t);
      const oz = cz - (this.movingPz[m] + (this.movingCz[m] - this.movingPz[m]) * t);
      return Math.abs(ox) < hx && Math.abs(oy) < hy && Math.abs(oz) < hz;
    }
    return !this.fbox[i] || this.interiorAt(i, cx, cy, cz) > 0;
  }

  /* Every live part against [lo3, hi3], in that box's frame (axes, p, d
   * already turned into it). True if any part improved the best. */
  partsIntoBox(hull, axes, px, py, pz, dx, dy, dz) {
    const lo = this.lo3;
    const hi = this.hi3;
    const d = [dx, dy, dz];
    let won = false;
    for (let k = 0; k < hull.n; k += 1) {
      if (!hull.live[k]) {
        continue;
      }
      const c = partCentre(hull, k, axes, px, py, pz, this.c3);
      const g = hull.rho[k];
      let misses = false;
      for (let j = 0; j < 3; j += 1) {
        const lg = lo[j] - g;
        const hg = hi[j] + g;
        if ((c[j] < lg && c[j] + d[j] < lg) || (c[j] > hg && c[j] + d[j] > hg)) {
          misses = true;
        }
      }
      if (misses) {
        continue;
      }
      const t = sweepPartBox(hull, k, axes, px, py, pz, dx, dy, dz, lo, hi, this.got);
      if (t >= 0 && better(this.got, this.best)) {
        copyContact(this.got, this.best);
        won = true;
      }
    }
    return won;
  }

  partsIntoTurned(hull, i, ax9, px, py, pz, dx, dy, dz) {
    const tx = this.fux[i];
    const tz = this.fuz[i];
    const lax = this.lax;
    for (let k = 0; k < 9; k += 3) {
      lax[k] = ax9[k] * tx + ax9[k + 2] * tz;
      lax[k + 1] = ax9[k + 1];
      lax[k + 2] = ax9[k + 2] * tx - ax9[k] * tz;
    }
    set3(this.lo3, this.fu0[i], this.fay[i], this.fw0[i]);
    set3(this.hi3, this.fu1[i], this.fby[i], this.fw1[i]);
    if (!this.partsIntoBox(hull, lax, px * tx + pz * tz, py, pz * tx - px * tz, dx * tx + dz * tz, dy, dz * tx - dx * tz)) {
      return false;
    }
    const b = this.best;
    const n2 = tx * tx + tz * tz;
    const bx = (b.px * tx - b.pz * tz) / n2;
    b.pz = (b.px * tz + b.pz * tx) / n2;
    b.px = bx;
    const nx = b.nx * tx - b.nz * tz;
    b.nz = b.nx * tz + b.nz * tx;
    b.nx = nx;
    return true;
  }

  partsIntoCapsule(hull, i, ax9, px, py, pz, dx, dy, dz, a) {
    const r = this.fr[i];
    const reachR = hull.reach + r;
    if (this.capsuleT(i, px, py, pz, dx, dy, dz, a, reachR * reachR) < 0) {
      return false;
    }
    let won = false;
    for (let k = 0; k < hull.n; k += 1) {
      if (!hull.live[k]) {
        continue;
      }
      const c = partCentre(hull, k, ax9, px, py, pz, this.c3);
      const rr = hull.rho[k] + r;
      if (this.capsuleT(i, c[0], c[1], c[2], dx, dy, dz, a, rr * rr) < 0) {
        continue;
      }
      const t = sweepPartCapsule(hull, k, ax9, px, py, pz, dx, dy, dz, this.fax[i], this.fay[i], this.faz[i], this.fbx[i],
        this.fby[i], this.fbz[i], r, this.got);
      if (t >= 0 && better(this.got, this.best)) {
        copyContact(this.got, this.best);
        won = true;
      }
    }
    return won;
  }

  partsIntoMoving(hull, m, ax9, px, py, pz, qx, qy, qz, reach) {
    const { hx, hy, hz } = this.movers[m];
    const rp = [px - this.movingPx[m], py - this.movingPy[m], pz - this.movingPz[m]];
    const rd = [(qx - this.movingCx[m]) - rp[0], (qy - this.movingCy[m]) - rp[1], (qz - this.movingCz[m]) - rp[2]];
    const h = [hx, hy, hz];
    for (let j = 0; j < 3; j += 1) {
      const g = h[j] + reach;
      if ((rp[j] < -g && rp[j] + rd[j] < -g) || (rp[j] > g && rp[j] + rd[j] > g)) {
        return false;
      }
    }
    set3(this.lo3, -hx, -hy, -hz);
    set3(this.hi3, hx, hy, hz);
    if (!this.partsIntoBox(hull, ax9, rp[0], rp[1], rp[2], rd[0], rd[1], rd[2])) {
      return false;
    }
    const b = this.best;
    b.px += (px + (qx - px) * b.t) - (rp[0] + rd[0] * b.t);
    b.py += (py + (qy - py) * b.t) - (rp[1] + rd[1] * b.t);
    b.pz += (pz + (qz - pz) * b.t) - (rp[2] + rd[2] * b.t);
    return true;
  }

  /* ------------------------------------------------------ nearest solid */

  /* The nearest collider to p within maxR plus the pad; its gap into
   * nearGap. Inside several capsules the last one visited is kept. */
  nearest(px, py, pz, maxR, frozenOnly, skipKinds) {
    const pad = maxR + this.pad;
    const n = this.gather(px - pad, px + pad, pz - pad, pz + pad);
    let best = Infinity;
    let pick = -1;
    for (let k = 0; k < n; k += 1) {
      const i = this.cands[k];
      if ((frozenOnly && i >= this.baseCount) || (skipKinds & (1 << this.fkind[i]))) {
        continue;
      }
      let gap;
      if (this.fbox[i]) {
        gap = this.boxGap(i, px, py, pz);
      } else {
        this.axisToPoint(i, px, py, pz);
        gap = Math.sqrt(this.nx * this.nx + this.ny * this.ny + this.nz * this.nz) - this.fr[i];
      }
      if (gap < best) {
        best = gap < 0 ? 0 : gap;
        pick = i;
      }
    }
    this.nearGap = best;
    return pick;
  }

  gapAt(px, py, pz, maxR, frozenOnly = false, skipKinds = 0) {
    if (!this.built) {
      return Infinity;
    }
    this.nearest(px, py, pz, maxR, frozenOnly, skipKinds);
    return this.nearGap <= maxR ? this.nearGap : Infinity;
  }

  /* The nearest solid's own direction and the point of its centre line
   * nearest p: a box's longest side, a capsule's axis. */
  axisAt(px, py, pz, maxR) {
    this.axisFound = false;
    this.axisGap = Infinity;
    if (!this.built) {
      return false;
    }
    const i = this.nearest(px, py, pz, maxR, false, 0);
    if (i < 0 || this.nearGap > maxR) {
      return false;
    }
    this.axisFound = true;
    this.axisGap = this.nearGap;
    if (this.fbox[i] === TURNED) {
      this.turnedAxis(i, px, py, pz);
    } else if (this.fbox[i]) {
      this.boxAxis(i, px, py, pz);
    } else {
      this.capsuleAxis(i, px, py, pz);
    }
    return this.axisFound;
  }

  setAxis(dx, dy, dz, cx, cy, cz) {
    this.axisDx = dx;
    this.axisDy = dy;
    this.axisDz = dz;
    this.axisCx = cx;
    this.axisCy = cy;
    this.axisCz = cz;
  }

  turnedAxis(i, px, py, pz) {
    const ux = this.fux[i];
    const uz = this.fuz[i];
    const u0 = this.fu0[i];
    const u1 = this.fu1[i];
    const w0 = this.fw0[i];
    const w1 = this.fw1[i];
    const y0 = this.fay[i];
    const y1 = this.fby[i];
    const qu = px * ux + pz * uz;
    const qw = pz * ux - px * uz;
    let cu = (u0 + u1) * 0.5;
    let cw = (w0 + w1) * 0.5;
    let cy = (y0 + y1) * 0.5;
    const lu = u1 - u0;
    const ly = y1 - y0;
    const lw = w1 - w0;
    let dx;
    let dy;
    let dz;
    if (lu >= ly && lu >= lw) {
      [dx, dy, dz] = [ux, 0, uz];
      cu = qu < u0 ? u0 : (qu > u1 ? u1 : qu);
    } else if (ly >= lu && ly >= lw) {
      [dx, dy, dz] = [0, 1, 0];
      cy = py < y0 ? y0 : (py > y1 ? y1 : py);
    } else {
      [dx, dy, dz] = [-uz, 0, ux];
      cw = qw < w0 ? w0 : (qw > w1 ? w1 : qw);
    }
    const n2 = ux * ux + uz * uz;
    this.setAxis(dx, dy, dz, (cu * ux - cw * uz) / n2, cy, (cu * uz + cw * ux) / n2);
  }

  boxAxis(i, px, py, pz) {
    const lo = [this.fax[i], this.fay[i], this.faz[i]];
    const hi = [this.fbx[i], this.fby[i], this.fbz[i]];
    const p = [px, py, pz];
    const len = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    let k = 2;
    if (len[0] >= len[1] && len[0] >= len[2]) {
      k = 0;
    } else if (len[1] >= len[0] && len[1] >= len[2]) {
      k = 1;
    }
    const c = [(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5];
    c[k] = p[k] < lo[k] ? lo[k] : (p[k] > hi[k] ? hi[k] : p[k]);
    this.setAxis(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0, c[0], c[1], c[2]);
  }

  /* A sphere has no axis: found stays false, the gap just written stays. */
  capsuleAxis(i, px, py, pz) {
    const ex = this.fbx[i] - this.fax[i];
    const ey = this.fby[i] - this.fay[i];
    const ez = this.fbz[i] - this.faz[i];
    const el = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (!(el > 1e-9)) {
      this.axisFound = false;
      return;
    }
    const u = clamp01(((px - this.fax[i]) * ex + (py - this.fay[i]) * ey + (pz - this.faz[i]) * ez) / (el * el));
    this.setAxis(ex / el, ey / el, ez / el, this.fax[i] + ex * u, this.fay[i] + ey * u, this.faz[i] + ez * u);
  }

  /* ------------------------------------------------------ inside, through */

  /* Signed depth of a point into collider i, positive inside. */
  interiorAt(i, x, y, z) {
    if (!this.built || i < 0 || i >= this.count) {
      return 0;
    }
    if (this.fbox[i]) {
      this.boxFrame(i, x, y, z);
      return boxDepth(this.lo3, this.hi3, this.pa);
    }
    this.axisToPoint(i, x, y, z);
    return this.fr[i] - Math.sqrt(this.nx * this.nx + this.ny * this.ny + this.nz * this.nz);
  }

  /* Moving box m's current extent into lo3/hi3. */
  movingFrame(m) {
    const { hx, hy, hz } = this.movers[m];
    set3(this.lo3, this.movingCx[m] - hx, this.movingCy[m] - hy, this.movingCz[m] - hz);
    set3(this.hi3, this.movingCx[m] + hx, this.movingCy[m] + hy, this.movingCz[m] + hz);
  }

  interiorOfHit(x, y, z) {
    if (this.hitMoving >= 0) {
      this.movingFrame(this.hitMoving);
      set3(this.pa, x, y, z);
      return boxDepth(this.lo3, this.hi3, this.pa);
    }
    if (this.hitIndex < 0) {
      return 0;
    }
    return this.interiorAt(this.hitIndex, x, y, z);
  }

  /* Did a to b go in one side of collider i and out the other? A capsule
   * counts when both ends are outside and the segment passed its axis. */
  crossedStatic(i, ax, ay, az, bx, by, bz) {
    if (!this.built || i < 0 || i >= this.count) {
      return false;
    }
    if (this.fbox[i]) {
      this.boxFrame(i, bx, by, bz);
      this.pb.set(this.pa);
      this.boxFrame(i, ax, ay, az);
      return crossesBox(this.lo3, this.hi3, this.pa, this.pb);
    }
    if (this.interiorAt(i, ax, ay, az) >= 0 || this.interiorAt(i, bx, by, bz) >= 0) {
      return false;
    }
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const aa = dx * dx + dy * dy + dz * dz;
    if (aa <= 1e-18) {
      return false;
    }
    const s = this.closestS(i, ax, ay, az, dx, dy, dz, aa);
    this.axisToPoint(i, ax + dx * s, ay + dy * s, az + dz * s);
    return this.fr[i] - Math.sqrt(this.nx * this.nx + this.ny * this.ny + this.nz * this.nz) > CLIP_CENTER_EPS;
  }

  crossedMoving(i, ax, ay, az, bx, by, bz) {
    if (i < 0 || i >= this.movingCount) {
      return false;
    }
    this.movingFrame(i);
    set3(this.pa, ax, ay, az);
    set3(this.pb, bx, by, bz);
    return crossesBox(this.lo3, this.hi3, this.pa, this.pb);
  }

  crossedHit(ax, ay, az, bx, by, bz) {
    if (this.hitMoving >= 0) {
      return this.crossedMoving(this.hitMoving, ax, ay, az, bx, by, bz);
    }
    return this.crossedStatic(this.hitIndex, ax, ay, az, bx, by, bz);
  }

  /* ---------------------------------------------------------------- reading */

  kindName(k) {
    return KINDS[k] ?? 'none';
  }

  stats() {
    const count = this.count ?? 0;
    const byKind = {};
    for (const k of KINDS) {
      byKind[k] = 0;
    }
    let boxes = 0;
    let turned = 0;
    for (let i = 0; i < count; i += 1) {
      byKind[KINDS[this.fkind[i]]] += 1;
      if (this.fbox[i]) {
        boxes += 1;
      }
      if (this.fbox[i] === TURNED) {
        turned += 1;
      }
    }
    const { queries, total, last } = this.tally;
    return {
      count,
      byKind,
      boxes,
      turned,
      capsules: count - boxes,
      static: this.staticCount,
      streamed: this.streamCount,
      builtGates: this.gates.set.n,
      streamGen: this.streamGen,
      cellSize: CELL,
      gridHalfExtent: CELL * CELLS_HALF,
      cells: this.grid ? this.grid.size : 0,
      streamCells: this.stream.grid ? this.stream.grid.size : 0,
      maxRadius: this.padRadius(),
      craftRadius: CRAFT_WORLD_R,
      moving: this.movingCount,
      queries,
      meanCandidatesPerQuery: queries ? total / queries : 0,
      lastCandidates: last,
    };
  }
}

/* Cap entry for capsule caps: the first t at which p + t d is within
 * reach of the cap's centre, c = p - centre, folded into best. */
function sphereEnter(best, dx, dy, dz, a, reachSq, cx, cy, cz) {
  const qb = 2 * (dx * cx + dy * cy + dz * cz);
  const qc = cx * cx + cy * cy + cz * cz - reachSq;
  const disc = qb * qb - 4 * a * qc;
  if (!(disc >= 0)) {
    return best;
  }
  const sq = Math.sqrt(disc);
  let tEnter = (-qb - sq) / (2 * a);
  const tExit = (-qb + sq) / (2 * a);
  if (tEnter < 0) {
    tEnter = 0;
  }
  return tEnter <= 1 && tEnter <= tExit && (best < 0 || tEnter < best) ? tEnter : best;
}

/* Entry into the infinite cylinder about the axis e, clipped to the
 * segment's slab: the radial and axial intervals intersected. */
function cylinderEnter(ex, ey, ez, ee, mx, my, mz, dx, dy, dz, reachSq) {
  const c0x = my * ez - mz * ey;
  const c0y = mz * ex - mx * ez;
  const c0z = mx * ey - my * ex;
  const c1x = dy * ez - dz * ey;
  const c1y = dz * ex - dx * ez;
  const c1z = dx * ey - dy * ex;
  const qa = c1x * c1x + c1y * c1y + c1z * c1z;
  const qb = 2 * (c0x * c1x + c0y * c1y + c0z * c1z);
  const qc = c0x * c0x + c0y * c0y + c0z * c0z - reachSq * ee;
  const em = ex * mx + ey * my + ez * mz;
  const ed = ex * dx + ey * dy + ez * dz;
  let r0 = -Infinity;
  let r1 = Infinity;
  if (qa > 1e-12) {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) {
      return -1;
    }
    const sq = Math.sqrt(disc);
    r0 = (-qb - sq) / (2 * qa);
    r1 = (-qb + sq) / (2 * qa);
  } else if (qc > 0) {
    return -1;
  }
  let u0 = -Infinity;
  let u1 = Infinity;
  if (ed > 1e-12 || ed < -1e-12) {
    const ta = (0 - em) / ed;
    const tb = (ee - em) / ed;
    u0 = ta < tb ? ta : tb;
    u1 = ta < tb ? tb : ta;
  } else if (em < 0 || em > ee) {
    return -1;
  }
  let tEnter = r0 > u0 ? r0 : u0;
  const mn = r1 < u1 ? r1 : u1;
  const tExit = mn < 1 ? mn : 1;
  if (tEnter < 0) {
    tEnter = 0;
  }
  return tEnter <= tExit && tEnter <= 1 ? tEnter : -1;
}
