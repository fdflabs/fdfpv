/*
 * trickdetect.js: names freestyle tricks from how the craft rotated and from
 * the laps it flew round rails and poles.
 *
 * Each body axis integrates its own rate into a count of quarter turns, and
 * each obstacle line the craft comes near integrates the craft's winding
 * about it into laps. Both kinds of piece go into one buffer in flight
 * order, and the pattern table names the longest run of pieces it can; a
 * lone rotation nothing claims gets a plain name from a short list. The
 * payloads are compared bit for bit with recorded flights, so the
 * arithmetic keeps an exact operation order, and there is no trigonometry
 * because Math.sin and friends are not bit exact across engines.
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

import { OB_BAR, OB_KIND_NAME, sameAxis } from './obstacles.js';
import { GRAZE_SPEED_MAX } from './collide.js';
import { trickPoints } from './tricks.js';

/* One turn in radians, as a literal so every engine divides by the same
 * double. Radians become turns by dividing, never by a reciprocal. */
const TURN = 6.283185307179586;

export const AXIS_ROLL = 0;
export const AXIS_PITCH = 1;
export const AXIS_YAW = 2;
export const AXIS_NAME = ['roll', 'pitch', 'yaw'];

/*
 * The trick table. Row order is behaviour: the last tie break when two rows
 * describe the same pieces equally well is the earlier row. Prices live in
 * tricks.js and are asked for at match time.
 */
export const PATTERNS = [
  { name: "Rubik's Cube", steps: [
    { axis: 'roll', turns: 0.5 },
    { axis: 'pitch', turns: 1 },
    { axis: 'roll', turns: 0.5, sameAs: 0 },
  ] },
  { name: "Cubik's Rube", steps: [
    { axis: 'pitch', turns: 0.5 },
    { axis: 'roll', turns: 1 },
    { axis: 'pitch', turns: 0.5, sameAs: 0 },
  ] },
  { name: 'Vanny Roll', steps: [
    { axis: 'yaw', turns: 0.5 },
    { axis: 'roll', turns: 1 },
    { axis: 'yaw', turns: 0.5, sameAs: 0 },
  ] },
  { name: 'Segmented Flips/Rolls', steps: [
    { axisIn: ['roll', 'pitch'], turns: 0.5 },
    { axisAs: 0, turns: 0.5, sameAs: 0, stallMs: 500 },
  ] },
  { name: 'Invert Rewind', steps: [
    { axisIn: ['roll', 'pitch'], turns: 0.5 },
    { axisAs: 0, turns: 0.5, oppTo: 0 },
  ] },
  { name: 'Juicy Flick', steps: [
    { axis: 'pitch', turns: 0.5, dir: 1 },
    { axis: 'roll', turns: 0.5 },
  ] },
  { name: 'Snapback', steps: [
    { axis: 'pitch', turns: 0.5, dir: -1 },
    { axis: 'roll', turns: 0.5 },
  ] },
  { name: 'Immelmann Turn', steps: [
    { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0.5 } },
    { axis: 'roll', turns: 0.5 },
  ] },
  { name: 'Powerloop', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1 } },
  ] },
  { name: 'Maverick Loop', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, roll: 1 } },
  ] },
  { name: 'Split-S', steps: [
    { path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0.5, pitch: 0.5 } },
  ] },
  { name: 'Split-S', steps: [
    { axis: 'roll', turns: 0.5 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0, pitch: 0.5 } },
  ] },
  { name: 'Matty Flip', steps: [
    { path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0, pitch: 0.5 } },
  ] },
  { name: 'Beginner Matty', steps: [
    { path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0, pitch: 0 } },
  ] },
  { name: 'Orbit x2', steps: [
    { path: 'pole', turnsAtLeast: 2, track: true, inverted: false },
  ] },
  { name: 'Trippy Spin x2', steps: [
    { path: 'pole', turnsAtLeast: 2, inverted: true },
  ] },
  { name: '1 Trippy Spin', steps: [
    { path: 'pole', turnsAtLeast: 1, inverted: true },
  ] },
  { name: 'Yaw Spin', steps: [
    { path: 'pole', turnsAtLeast: 1, track: true, inverted: false },
  ] },
  { name: 'Power Flip', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 2 } },
  ] },
  { name: 'Power Roll', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, roll: 1 } },
  ] },
  { name: 'Inverted 360 Powerloop', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, roll: 0, yaw: 1 } },
  ] },
  { name: 'Blindflip', steps: [
    { axis: 'yaw', turns: 0.5 },
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1 } },
  ] },
  { name: 'Power Split', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1 } },
    { path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0.5, pitch: 0.5 } },
  ] },
  { name: 'Barani', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, yaw: 0.5 } },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Rollani', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, yaw: 0.5 } },
    { axis: 'roll', turns: 1 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Flipani', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1, yaw: 0.5 } },
    { axis: 'pitch', turns: 1 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Mavvy Roll', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, roll: 2 } },
  ] },
  { name: 'Donkey Loop', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0.5, roll: 1, yaw: 1 } },
  ] },
  { name: 'Mavani', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0.5, yaw: 0.5 } },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Mavvelmann', steps: [
    { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0, roll: 0.5 } },
    { axis: 'pitch', turns: 0.5 },
    { axis: 'roll', turns: 0.5 },
  ] },
  { name: 'Immelloop', steps: [
    { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0.5 } },
    { axis: 'roll', turns: 0.5 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0 } },
  ] },
  { name: 'Immelmatt', steps: [
    { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0.5 } },
    { axis: 'roll', turns: 0.5 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Anti Matty', steps: [
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 1 } },
  ] },
  { name: 'Power Matty', steps: [
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 1.5 } },
  ] },
  { name: 'Matty Roll', steps: [
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.75, roll: 1 } },
  ] },
  { name: 'Matty 360', steps: [
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5, yaw: 1 } },
  ] },
  { name: 'Matty Twister', steps: [
    { axis: 'roll', turns: 1 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Half Matty', steps: [
    { axis: 'roll', turns: 0.5 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 }, stallMs: 400 },
  ] },
  { name: '540 Half Matty', steps: [
    { axis: 'roll', turns: 1.5 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Split Yaw', steps: [
    { path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0.5, pitch: 0.5, yaw: 0.5 } },
  ] },
  { name: 'Split-Back', steps: [
    { path: 'bar', turns: 0.5, from: 'over', rot: { roll: 0.5, pitch: 1 } },
  ] },
  { name: 'Inverted Yaw Tracking', steps: [
    { axis: 'roll', turns: 0.5 },
    { axis: 'yaw', turns: 1, oppTo: 0, inverted: true },
    { axis: 'roll', turns: 0.5 },
  ] },
  { name: 'Eject Roll', steps: [
    { axis: 'pitch', turns: 0.5 },
    { axis: 'roll', turns: 1 },
  ] },
  { name: 'Stellar Eject Roll', steps: [
    { axis: 'pitch', turns: 0.5 },
    { axis: 'roll', turns: 1 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'True Barani', steps: [
    { axis: 'pitch', turns: 0.5, dir: 1 },
    { axis: 'roll', turns: 0.5 },
    { axis: 'yaw', turns: 0.5, inverted: true },
    { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0.5 } },
  ] },
  { name: 'Jump Rope', steps: [
    { axis: 'yaw', turns: 0.25 },
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, roll: 0 } },
  ] },
  { name: 'Cinnamon Roll', steps: [
    { axis: 'yaw', turns: 0.25 },
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, yaw: 1 } },
  ] },
  { name: 'Side Loop', steps: [
    { axis: 'yaw', turns: 0.25 },
    { path: 'bar', turns: 1, from: 'under', rot: { roll: 1, pitch: 0 } },
  ] },
  { name: 'Half Mavvy', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 0, roll: 1 } },
    { axis: 'roll', turns: 0.5 },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Flip Stall Rewind', steps: [
    { axis: 'pitch', turns: 1, stallMs: 400 },
  ] },
  { name: '360 Stall Rewind', steps: [
    { axis: 'roll', turns: 1, stallMs: 400 },
  ] },
  { name: 'Wall Tap', steps: [
    { axis: 'pitch', turns: 0.25 },
    { axis: 'pitch', turns: 0.25, oppTo: 0, tap: true },
  ] },
  { name: 'Roll Tap', steps: [
    { axis: 'roll', turns: 0.75, tap: true },
  ] },
  { name: 'Loop Tap', steps: [
    { axis: 'pitch', turns: 0.25 },
    { axis: 'pitch', turns: 0.5, sameAs: 0, tap: true },
  ] },
  { name: 'Downtown Tap', steps: [
    { axis: 'pitch', turns: 0.25 },
    { axis: 'pitch', turns: 1, sameAs: 0, tap: true },
  ] },
  { name: 'Wall Ride', steps: [
    { axis: 'roll', turns: 0.25, nearMax: 1 },
    { axis: 'roll', turns: 0.25, oppTo: 0, nearMax: 1, gapMs: 1600 },
  ] },
  { name: 'Reverse Wall Ride', steps: [
    { axis: 'yaw', turns: 0.5, nearMax: 1 },
    { axis: 'roll', turns: 0.25, nearMax: 1, gapMs: 1600 },
  ] },
  { name: 'Ceiling Tap', steps: [
    { axis: 'pitch', turns: 0.5, dir: -1, tap: true },
  ] },
  { name: 'Maverick Tap Rewind', steps: [
    { path: 'bar', turns: 0.5, from: 'under', rot: { pitch: 0, roll: 0.5 }, tap: true },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Power Switch Tap', steps: [
    { path: 'bar', turns: 1, from: 'under', rot: { pitch: 1 }, tap: true },
    { path: 'bar', turns: 0.5, from: 'over', rot: { pitch: 0.5 } },
  ] },
  { name: 'Double Flip', steps: [
    { axis: 'pitch', turns: 2 },
  ] },
  { name: 'Double Roll', steps: [
    { axis: 'roll', turns: 2 },
  ] },
  { name: 'Flip', steps: [
    { axis: 'pitch', turns: 1 },
  ] },
  { name: 'Roll', steps: [
    { axis: 'roll', turns: 1 },
  ] },
  { name: 'Yaw Spin', steps: [
    { axis: 'yaw', turns: 1 },
  ] },
  { name: 'Inverted Yaw Spin', steps: [
    { axis: 'yaw', turns: 1, inverted: true },
  ] },
];

/* Names for a lone rotation no pattern claims, biggest first per axis. No
 * quarter turns and no yaw short of a whole turn: those are steering. */
const PLAIN_NAMES = [
  { axis: AXIS_PITCH, turns: 2, name: 'Double Flip' },
  { axis: AXIS_PITCH, turns: 1, name: 'Flip' },
  { axis: AXIS_PITCH, turns: 0.75, name: '3/4 Flip' },
  { axis: AXIS_PITCH, turns: 0.5, name: '1/2 Flip' },
  { axis: AXIS_ROLL, turns: 2, name: 'Double Roll' },
  { axis: AXIS_ROLL, turns: 1, name: 'Roll' },
  { axis: AXIS_ROLL, turns: 0.75, name: '3/4 Roll' },
  { axis: AXIS_ROLL, turns: 0.5, name: '1/2 Roll' },
  { axis: AXIS_YAW, turns: 1, name: 'Yaw Spin', belly: 'Inverted Yaw Spin' },
];

/* Rotation runs, rad/s and ms. A run opens at a real flick, and ends after
 * a short settle or when the rate swings the other way with intent. */
const SPIN_OPEN = 3.0;
const SPIN_SLOW = 1.2;
const SPIN_SETTLE_MS = 90;

/* Below this speed (m/s) the craft is hanging, which some tricks ask for. */
const STALL_SPEED = 2.5;
/* How far either side of a piece a gentle contact still counts as its tap. */
const TAP_WINDOW_MS = 200;

/* Laps. Radii in metres, winding rates in turns/s, times in ms. */
const LAP_MIN_R2 = 0.45 * 0.45;
const LAP_FILTER = 0.02;
const LAP_TANGENT_MIN = 2.5;
const LAP_ON = 0.08;
const LAP_OFF = 0.04;
const LAP_HOLD_MS = 220;
const LAP_REVERSE = 0.08;
const LAP_MAX_MS = 20000;
const LAP_MIN_SWEEP = 0.375;
const MAX_LAPS = 32;
const TRACK_COS = 0.55;
/* The history a lap is backdated from holds this many samples, plus the one
 * just written, because the oldest sample is read after the newest lands. */
const LAP_HISTORY = 800;
const LAP_RING = LAP_HISTORY + 1;

/* A named lap keeps swallowing rotations that overlap it for this long. */
const NAMED_LAP_MS = 4000;

/* Buffer: how long to wait for a longer pattern, the largest unasked gap
 * between two pieces of one trick, and the dead time that makes it sloppy. */
const SETTLE_MS = 450;
const GAP_MAX_MS = 800;
const SLOPPY_DEAD_MS = 600;
const TURN_SLACK = 0.25;
const SLACK_MAX = 2;
const BELLY_UP = 0.55;

/* Path-turning diagnostic: the same lap idea measured on the flight path
 * itself, with no obstacle list. Reported only, never scored. */
const PATH_ON = 0.10;
const PATH_OFF = 0.04;
const PATH_HOLD_MS = 220;
const PATH_SPEED_MIN = 1.5;
const PATH_R_MAX = 16;
const PATH_REVERSE = 0.12;
const PATH_INSIDE = 0.6;
const PATH_NEAR = 3.0;
const PATH_PRE_MS = 1000;

const abs = (x) => (x < 0 ? -x : x);
const sign = (x) => (x < 0 ? -1 : 1);

function turnClass(t) {
  const f = t - Math.floor(t);
  if (f < 0.125 || f > 0.875) return 'whole';
  if (f > 0.375 && f < 0.625) return 'half';
  return 'edge';
}

/* +1 upright, -1 belly up, 0 on edge. */
function attitude(upZ) {
  if (upZ > 0.5) return 1;
  return upZ < -0.5 ? -1 : 0;
}

/*
 * Nearest quarter, nudged to agree with how the craft came out: a roll that
 * starts and ends upright is a whole number of turns, upright to belly up a
 * half, and so on. Yaw does not change which way up the craft is.
 */
export function snapTurns(rawTurns, axis, startUpZ, endUpZ) {
  const mag = abs(rawTurns);
  if (mag < 0.125) return 0;
  const nearest = Math.round(mag * 4) / 4;
  const from = attitude(startUpZ);
  if (axis === AXIS_YAW || from === 0) return nearest;
  const to = attitude(endUpZ);
  const want = to === 0 ? 'edge' : (from === to ? 'whole' : 'half');
  if (turnClass(nearest) === want) return nearest;
  let best = nearest;
  let bestErr = Infinity;
  for (const nudge of [-0.25, 0.25, -0.5, 0.5]) {
    const cand = nearest + nudge;
    if (cand < 0.125 || turnClass(cand) !== want) continue;
    const err = cand > mag ? cand - mag : mag - cand;
    if (err <= 0.2 && err < bestErr) {
      best = cand;
      bestErr = err;
    }
  }
  return best;
}

/*
 * Laps round a rail must agree with the sides: under to under is whole
 * laps, under to over a half more. A pole has no sides, so quarters.
 */
export function snapPathTurns(rawTurns, kind, startSide, endSide) {
  const mag = abs(rawTurns);
  if (kind !== OB_BAR || startSide === 0 || endSide === 0) {
    return mag < 0.55 ? 0 : Math.round(mag * 4) / 4;
  }
  if (startSide !== endSide) {
    if (mag < 0.55) return 0;
    const h = Math.round(mag - 0.5) + 0.5;
    return h < 0.5 ? 0.5 : h;
  }
  if (mag < 0.65) return 0;
  const w = Math.round(mag);
  return w < 1 ? 0 : w;
}

/* How much of [start, end] lies inside [from, until], against half of it. */
function mostlyInside(prim, from, until) {
  const lo = prim.startMs > from ? prim.startMs : from;
  const hi = prim.endMs < until ? prim.endMs : until;
  return hi - lo > (prim.endMs - prim.startMs) * 0.5;
}

function turnCost(got, want) {
  const over = got - want;
  if (over <= 1e-9 && over >= -1e-9) return 0;
  return over > 0 && over <= TURN_SLACK + 1e-9 ? 1 : -1;
}

function bellyCost(frac, wantBelly) {
  const held = wantBelly ? frac : 1 - frac;
  if (held >= BELLY_UP) return 0;
  return held >= BELLY_UP - 0.2 ? 1 : -1;
}

function stallCost(have, asked) {
  if (have >= asked) return 0;
  return have >= asked * 0.6 ? 1 : -1;
}

function askedMs(step) {
  return Math.max(step.stallMs ?? 0, step.gapMs ?? 0);
}

const ROT_INDEX = { roll: 0, pitch: 1, yaw: 2 };

/* The cost of one step against one piece, or -1. */
function stepCost(s, p, prims, anyTap) {
  let cost = 0;
  const add = (c) => {
    if (c < 0 || cost < 0) cost = -1;
    else cost += c;
  };
  const need = (ok) => {
    if (!ok) cost = -1;
  };
  if (s.tap !== undefined) need(s.tap ? anyTap : Boolean(p.tapped) === s.tap);
  if (s.stallMs !== undefined) add(stallCost(p.stallBeforeMs, s.stallMs));
  if (s.turns !== undefined) add(turnCost(p.turns, s.turns));
  if (s.path) {
    need(p.kind === 'path' && p.obstacle === s.path);
    if (cost < 0) return -1;
    if (s.turnsAtLeast !== undefined) need(p.turns >= s.turnsAtLeast - 0.25);
    if (s.from !== undefined) need(p.startSide === (s.from === 'under' ? -1 : 1));
    if (s.inverted !== undefined) add(bellyCost(p.invertedFrac, s.inverted));
    if (s.track !== undefined) need((p.trackFrac >= 0.7) === s.track);
    if (s.rot) {
      for (const key of Object.keys(s.rot)) {
        const m = abs(p.rot[ROT_INDEX[key]]);
        const want = s.rot[key];
        const err = m > want ? m - want : want - m;
        if (err > TURN_SLACK * 0.5) add(err <= TURN_SLACK ? 1 : -1);
      }
    }
    return cost;
  }
  need(p.kind === 'rot');
  if (cost < 0) return -1;
  const axis = AXIS_NAME[p.axis];
  if (s.axis !== undefined) need(axis === s.axis);
  if (s.axisIn !== undefined) need(s.axisIn.includes(axis));
  if (s.axisAs !== undefined) need(p.axis === prims[s.axisAs].axis);
  if (s.inverted !== undefined) add(bellyCost(p.invertedFrac ?? 0, s.inverted));
  if (s.dir !== undefined) need(p.dir === s.dir);
  if (s.sameAs !== undefined) need(p.dir === prims[s.sameAs].dir);
  if (s.oppTo !== undefined) need(p.dir !== prims[s.oppTo].dir);
  if (s.nearMax !== undefined) need((p.nearest ?? Infinity) <= s.nearMax);
  return cost;
}

/* Slack spent describing the first n pieces with the first n steps, or -1. */
function matchSlack(steps, prims, n) {
  let anyTap = false;
  for (let i = 0; i < n; i += 1) anyTap = anyTap || Boolean(prims[i].tapped);
  let slack = 0;
  for (let i = 0; i < n; i += 1) {
    const s = steps[i];
    const p = prims[i];
    if (i > 0) {
      const gap = p.startMs - prims[i - 1].endMs - Math.max(p.stallBeforeMs ?? 0, askedMs(s));
      if (gap > GAP_MAX_MS) return -1;
    }
    const cost = stepCost(s, p, prims, anyTap);
    if (cost < 0) return -1;
    slack += cost;
    if (slack > SLACK_MAX) return -1;
  }
  return slack;
}

/* One body axis: an open run integrates its rate until it settles. */
class Spin {
  constructor(axis) {
    this.axis = axis;
    this.fromMs = 0;
    this.fromUpZ = 1;
    this.stall = 0;
    this.clear();
  }

  clear() {
    this.open = false;
    this.angle = 0;
    this.slowRun = 0;
    this.slowTotal = 0;
    this.samples = 0;
    this.belly = 0;
  }

  begin(nowMs, upZ, stall) {
    this.clear();
    this.open = true;
    this.fromMs = nowMs;
    this.fromUpZ = upZ;
    this.stall = stall;
  }
}

/*
 * The winding of the craft about one obstacle line. The field names read by
 * the trace patches in scripts are kept: open, obstacle, rate, windTotal,
 * startWind, lastWind, startSide, lastSide, startMs, lastMs, tailMs,
 * openMs, backWind, minR, maxR.
 *
 * Two things outlive reset on purpose. axisTurns is a running sum for the
 * life of the object, and lap spins are differences of it, which in floating
 * point depend on its size, so restarting it per lap would move last bits.
 * resid is the last successful de-banking residual, a diagnostic.
 */
class LapTracker {
  constructor() {
    this.axisTurns = 0;
    this.resid = null;
    this.ringWind = new Float64Array(LAP_RING);
    this.ringSide = new Int8Array(LAP_RING);
    this.ringMs = new Float64Array(LAP_RING);
    this.stamp = -1;
    this.reset();
  }

  reset() {
    this.open = false;
    this.obstacle = null;
    this.slowHold = 0;
    this.hasPrev = false;
    this.rate = 0;
    this.dir = 0;
    this.forget();
  }

  forget() {
    this.windTotal = 0;
    this.written = 0;
  }

  /* Writes a sample and returns the slot of the oldest one kept, which is
   * the one written LAP_HISTORY samples ago once the ring has filled. */
  record(side, ms) {
    const seq = this.written;
    const slot = seq % LAP_RING;
    this.ringWind[slot] = this.windTotal;
    this.ringSide[slot] = side;
    this.ringMs[slot] = ms;
    this.written = seq + 1;
    return seq >= LAP_HISTORY ? (seq - LAP_HISTORY) % LAP_RING : 0;
  }
}

/* State of the path-turning diagnostic. */
class PathTurn {
  constructor() {
    this.preGap = Infinity;
    this.prePos = [0, 0, 0];
    this.preMs = -1e9;
    this.ringMs = new Float64Array(LAP_HISTORY);
    this.reset();
  }

  reset() {
    this.open = false;
    this.pos = null;
    this.tangent = null;
    this.frame = null;
    this.rate = 0;
    this.slowHold = 0;
    this.back = 0;
    this.written = 0;
  }

  remember(ms) {
    this.ringMs[this.written % LAP_HISTORY] = ms;
    this.written += 1;
  }

  oldestMs(nowMs) {
    if (this.written >= LAP_HISTORY) return this.ringMs[this.written % LAP_HISTORY];
    return this.written > 0 ? this.ringMs[0] : nowMs;
  }
}

export class TrickDetector {
  constructor(onTrick, obstacles = null) {
    this.onTrick = onTrick;
    this.obstacles = obstacles;
    this.solids = null;
    this.enabled = true;
    this.lastTurn = null;
    this.nowMs = 0;

    /* Lifetime body rotation per axis, turns. Never reset: laps take
     * differences of it. */
    this.totals = [0, 0, 0];
    this.rates = [0, 0, 0];
    this.nose = [0, 0, 0];
    this.up = [0, 0, 0];
    this.right = [0, 0, 0];
    this.hasNose = false;
    this.hasUp = false;

    this.spins = [new Spin(AXIS_ROLL), new Spin(AXIS_PITCH), new Spin(AXIS_YAW)];
    this.laps = [];
    this.lapPool = [];
    this.engaged = [];
    this.stepSeq = 0;
    this.turn = new PathTurn();
    this.clearState();
  }

  /* Everything reset() forgets, apart from the runs and trackers. */
  clearState() {
    this.pending = [];
    this.held = [];
    this.namedLaps = [];
    this.groups = [];
    this.lastCloseMs = -1e9;
    this.stallMs = 0;
    this.touched = false;
    this.tapAt = -1e9;
    this.nearest = Infinity;
  }

  step(dt, p, q, r, qx, qy, speed, wx, wy, wz, fx, fy, fz, ux, uy, uz) {
    if (!this.enabled) return;
    this.hasNose = fx !== undefined;
    if (this.hasNose) {
      this.nose[0] = fx;
      this.nose[1] = fy;
      this.nose[2] = fz;
    }
    this.hasUp = ux !== undefined && this.hasNose;
    if (this.hasUp) {
      this.up[0] = ux;
      this.up[1] = uy;
      this.up[2] = uz;
      this.right[0] = fy * uz - fz * uy;
      this.right[1] = fz * ux - fx * uz;
      this.right[2] = fx * uy - fy * ux;
    }
    const dtMs = dt * 1000;
    this.nowMs += dtMs;
    this.stallMs = speed < STALL_SPEED ? this.stallMs + dtMs : 0;
    const upZ = 1 - 2 * (qx * qx + qy * qy);
    const rates = this.rates;
    rates[0] = p;
    rates[1] = q;
    rates[2] = r;
    for (let k = 0; k < 3; k += 1) this.totals[k] = this.totals[k] + ((rates[k] * dt) / TURN);

    this.stepPathTurn(dt, dtMs, wx, wy, wz, upZ);
    if (this.obstacles) this.stepLaps(dt, dtMs, wx, wy, wz, upZ);
    for (const spin of this.spins) this.stepSpin(spin, rates[spin.axis], upZ, dtMs);
    this.drain(false);
  }

  idle(dtMs) {
    if (!this.enabled) return;
    this.nowMs += dtMs;
    this.stallMs += dtMs;
    this.drain(false);
  }

  bump(impulse, tappable = true) {
    this.touched = true;
    if (tappable && (impulse === undefined || impulse <= GRAZE_SPEED_MAX)) this.tapAt = this.nowMs;
  }

  near(metres) {
    if (metres < this.nearest) this.nearest = metres;
  }

  reset() {
    for (const spin of this.spins) spin.clear();
    for (const lap of this.laps) {
      lap.reset();
      this.lapPool.push(lap);
    }
    this.laps = [];
    this.turn.reset();
    this.clearState();
  }

  restart() {
    this.reset();
    this.nowMs = 0;
  }

  flush(upZ) {
    const up = upZ === undefined ? 1 : upZ;
    this.closeTrack();
    for (const lap of this.laps) {
      if (lap.open) this.closePath(lap, up);
    }
    for (const spin of this.spins) {
      if (spin.open) this.closeSpin(spin, up);
    }
    this.releaseHeld();
    this.drain(true);
  }

  tappedIn(startMs, endMs) {
    return this.tapAt >= startMs - TAP_WINDOW_MS && this.tapAt <= endMs + TAP_WINDOW_MS;
  }

  stepSpin(spin, rate, upZ, dtMs) {
    const mag = abs(rate);
    if (!spin.open) {
      if (mag < SPIN_OPEN) return;
      spin.begin(this.nowMs, upZ, this.stallMs);
    }
    if (spin.angle !== 0 && (spin.angle > 0) !== (rate > 0) && mag >= SPIN_SLOW) {
      this.closeSpin(spin, upZ);
      if (mag >= SPIN_OPEN) {
        spin.begin(this.nowMs, upZ, this.stallMs);
        spin.angle = rate * (dtMs / 1000);
        spin.samples = 1;
        spin.belly = upZ < 0 ? 1 : 0;
      }
      return;
    }
    spin.samples += 1;
    if (upZ < 0) spin.belly += 1;
    spin.angle = spin.angle + rate * (dtMs / 1000);
    if (mag >= SPIN_SLOW) {
      spin.slowRun = 0;
      return;
    }
    spin.slowRun += dtMs;
    spin.slowTotal += dtMs;
    if (spin.slowRun >= SPIN_SETTLE_MS) this.closeSpin(spin, upZ);
  }

  closeSpin(spin, upZ) {
    const turns = snapTurns(spin.angle / TURN, spin.axis, spin.fromUpZ, upZ);
    const { open, angle, slowTotal } = spin;
    const invertedFrac = spin.samples > 0 ? spin.belly / spin.samples : 0;
    spin.clear();
    const nearest = this.nearest;
    this.nearest = Infinity;
    if (!open || turns <= 0) return;
    const now = this.nowMs;
    const prim = {
      kind: 'rot',
      axis: spin.axis,
      turns,
      dir: angle >= 0 ? 1 : -1,
      startMs: spin.fromMs,
      endMs: now,
      stallBeforeMs: spin.stall,
      slowMs: slowTotal,
      touched: this.touched,
      invertedFrac,
      tapped: this.tappedIn(spin.fromMs, now),
      nearest,
      orderMs: now,
    };
    this.stallMs = 0;
    if (this.lapCovers(prim, true)) {
      this.held.push(prim);
      return;
    }
    if (this.absorbed(prim)) return;
    this.insertPending(prim);
    this.lastCloseMs = now;
    this.drain(false);
  }

  stepLaps(dt, dtMs, wx, wy, wz, upZ) {
    const engaged = this.engaged;
    const n = this.obstacles.nearAll(wx, wy, wz, engaged, MAX_LAPS);
    const isEngaged = (ob) => {
      for (let j = 0; j < n; j += 1) {
        if (sameAxis(ob, engaged[j].ob)) return true;
      }
      return false;
    };
    for (let i = this.laps.length - 1; i >= 0; i -= 1) {
      const lap = this.laps[i];
      if (lap.open || isEngaged(lap.obstacle)) continue;
      lap.reset();
      this.lapPool.push(lap);
      this.laps.splice(i, 1);
    }
    const seq = ++this.stepSeq;
    for (const lap of this.laps) {
      if (!lap.open) continue;
      lap.stamp = seq;
      this.stepOneLap(lap, lap.obstacle, dt, dtMs, wx, wy, wz, upZ);
    }
    /* A closed tracker winds against whichever collinear segment matched
     * this step, not the one it was made for. */
    for (let j = 0; j < n; j += 1) {
      const ob = engaged[j].ob;
      let lap = this.laps.find((t) => sameAxis(t.obstacle, ob));
      if (lap && lap.stamp === seq) continue;
      if (!lap) {
        if (this.laps.length >= MAX_LAPS) continue;
        lap = this.lapPool.pop() || new LapTracker();
        lap.reset();
        lap.obstacle = ob;
        this.laps.push(lap);
      }
      lap.stamp = seq;
      this.stepOneLap(lap, ob, dt, dtMs, wx, wy, wz, upZ);
    }
  }

  stepOneLap(run, ob, dt, dtMs, wx, wy, wz, upZ) {
    const rx = wx - ob.cx;
    const ry = wy - ob.cy;
    const rz = wz - ob.cz;
    const along = rx * ob.dx + ry * ob.dy + rz * ob.dz;
    const cx = rx - ob.dx * along;
    const cy = ry - ob.dy * along;
    const cz = rz - ob.dz * along;
    const len2 = cx * cx + cy * cy + cz * cz;
    if (len2 < LAP_MIN_R2) {
      run.hasPrev = false;
      return;
    }
    if (!run.hasPrev) {
      run.hasPrev = true;
      run.px = cx;
      run.py = cy;
      run.pz = cz;
      return;
    }
    const { px, py, pz } = run;
    const crx = py * cz - pz * cy;
    const cry = pz * cx - px * cz;
    const crz = px * cy - py * cx;
    const signed = crx * ob.dx + cry * ob.dy + crz * ob.dz;
    const prevLen = Math.sqrt(px * px + py * py + pz * pz);
    const nowLen = Math.sqrt(len2);
    const dTurns = signed / (prevLen * nowLen * TURN);
    run.px = cx;
    run.py = cy;
    run.pz = cz;

    run.rate = run.rate + (dTurns / dt - run.rate) * LAP_FILTER;
    const mag = abs(run.rate);
    const tangent = mag * TURN * nowLen;
    const radial = (nowLen - prevLen) / dt;
    const circling = tangent >= LAP_TANGENT_MIN && tangent >= abs(radial) * 1.0;
    const going = mag >= LAP_ON && circling;
    let side = 0;
    if (ob.kind === OB_BAR) side = cy > 0 ? 1 : -1;
    run.windTotal += dTurns;

    if (this.hasUp) {
      const { nose, right, up, rates } = this;
      const ar = ob.dx * nose[0] + ob.dy * nose[1] + ob.dz * nose[2];
      const ap = ob.dx * right[0] + ob.dy * right[1] + ob.dz * right[2];
      const ay = ob.dx * up[0] + ob.dy * up[1] + ob.dz * up[2];
      run.axisTurns = run.axisTurns + (((rates[0] * ar + rates[1] * ap + rates[2] * ay) * dt) / TURN);
      if (run.open) {
        run.proj[0] += dTurns * ar;
        run.proj[1] += dTurns * ap;
        run.proj[2] += dTurns * ay;
        if (circling) {
          run.alignSum[0] += ar;
          run.alignSum[1] += ap;
          run.alignSum[2] += ay;
          run.magRoll += abs(ar);
          run.magPerp += Math.sqrt(ap * ap + ay * ay);
          run.alignN += 1;
        }
      }
    }

    if (!run.open) {
      const oldest = run.record(side, this.nowMs);
      if (going) this.openLap(run, oldest, side, nowLen);
      return;
    }

    const now = this.nowMs;
    if (going) {
      run.tailMs = now;
      if ((run.windTotal - run.startWind) * run.dir > (run.lastWind - run.startWind) * run.dir) {
        run.lastWind = run.windTotal;
        run.lastSide = side;
        run.lastMs = now;
        run.lastTotals = this.totals.slice();
        run.lastAxis = run.axisTurns;
      }
      run.counted += 1;
      if (nowLen < run.minR) run.minR = nowLen;
      if (nowLen > run.maxR) run.maxR = nowLen;
      if (upZ < 0) run.belly += 1;
      if (this.hasNose) {
        run.noseSeen = true;
        const inv = -1 / nowLen;
        const { nose } = this;
        if (cx * inv * nose[0] + cy * inv * nose[1] + cz * inv * nose[2] >= TRACK_COS) run.tracked += 1;
      }
    }

    const back = dTurns * run.dir;
    if (back < 0) {
      run.backWind = run.backWind - back;
    } else if (run.backWind > 0) {
      run.backWind = run.backWind - back;
      if (run.backWind < 0) run.backWind = 0;
    }
    if (run.backWind >= LAP_REVERSE || now - run.startMs >= LAP_MAX_MS) {
      this.closePath(run, upZ);
      return;
    }
    if (mag >= LAP_OFF) {
      run.slowHold = 0;
      return;
    }
    run.slowHold += dtMs;
    if (run.slowHold >= LAP_HOLD_MS) this.closePath(run, upZ);
  }

  /* The lap began where the history's oldest sample was, which is earlier
   * than the moment the winding rate crossed the gate. */
  openLap(run, oldest, side, nowLen) {
    const now = this.nowMs;
    run.open = true;
    run.startWind = run.ringWind[oldest];
    run.startMs = run.ringMs[oldest];
    run.startSide = run.ringSide[oldest];
    run.slowHold = 0;
    run.base = this.totals.slice();
    run.proj = [0, 0, 0];
    run.lastWind = run.windTotal;
    run.lastSide = side;
    run.lastMs = now;
    run.lastTotals = this.totals.slice();
    run.lastAxis = run.axisTurns;
    run.openAxis = run.axisTurns;
    run.dir = run.rate > 0 ? 1 : -1;
    run.backWind = 0;
    run.tailMs = now;
    run.openMs = now;
    run.stallBeforeMs = this.stallMs;
    run.alignSum = [0, 0, 0];
    run.magRoll = 0;
    run.magPerp = 0;
    run.alignN = 0;
    run.counted = 0;
    run.belly = 0;
    run.tracked = 0;
    run.noseSeen = false;
    run.minR = nowLen;
    run.maxR = nowLen;
  }

  closePath(run, upZ) {
    const wasOpen = run.open;
    run.open = false;
    run.slowHold = 0;
    const sweep = run.lastWind - run.startWind;
    const ob = run.obstacle;
    const mag = abs(sweep);
    const turns = wasOpen && ob && mag >= LAP_MIN_SWEEP
      ? snapPathTurns(mag, ob.kind, run.startSide, run.lastSide) : 0;
    if (turns <= 0) {
      this.releaseHeld();
      return;
    }
    const startMs = run.startMs;
    const endMs = run.tailMs > run.lastMs ? run.tailMs : run.lastMs;

    const twin = this.pending.findIndex((b) => {
      if (b.kind !== 'path') return false;
      const lo = startMs > b.startMs ? startMs : b.startMs;
      const hi = endMs < b.endMs ? endMs : b.endMs;
      const shorter = Math.min(endMs - startMs, b.endMs - b.startMs);
      return !(hi - lo <= shorter * 0.5);
    });
    if (twin >= 0) {
      if (mag > this.pending[twin].rawTurns) {
        this.pending.splice(twin, 1);
      } else {
        this.held = [];
        this.stallMs = 0;
        run.forget();
        return;
      }
    }

    const counted = run.counted;
    const n = run.alignN;
    const raw = [0, 1, 2].map((k) => run.lastTotals[k] - run.base[k]);
    const rot = this.lapRotation(run, raw, sweep, turns);
    const prim = {
      kind: 'path',
      obstacle: OB_KIND_NAME[ob.kind],
      obstacleId: ob.id,
      obstacleGroup: this.groupOf(ob),
      turns,
      dir: sweep >= 0 ? 1 : -1,
      startMs,
      orderMs: run.openMs,
      endMs,
      startSide: run.startSide,
      endSide: run.lastSide,
      rot,
      spin: n > 0 ? run.lastAxis - run.openAxis : 0,
      bodyRot: raw.slice(),
      resid: run.resid ? run.resid.slice() : null,
      align: n > 0 ? run.alignSum.map((a) => a / n) : null,
      own: n > 0 ? [run.magRoll / n, run.magPerp / n] : null,
      upZ,
      invertedFrac: counted > 0 ? run.belly / counted : 0,
      radiusRatio: run.minR > 1e-6 ? run.maxR / run.minR : 1,
      rawTurns: mag,
      tapped: this.tappedIn(startMs, run.lastMs),
      trackFrac: run.noseSeen && counted > 0 ? run.tracked / counted : -1,
      stallBeforeMs: run.stallBeforeMs ?? 0,
      slowMs: 0,
      touched: this.touched,
      held: this.held.slice(),
    };
    this.insertPending(prim);
    this.held = [];
    this.stallMs = 0;
    this.lastCloseMs = this.nowMs;
    run.forget();
    this.drain(false);
  }

  /*
   * Body rotation during a lap, with the part that is only the lap itself
   * taken out. Flying round a rail turns the body once per lap about the
   * rail's axis whatever the pilot does, so when the rail lies clearly along
   * one body axis that share of the winding is removed and the measured spin
   * about the rail, snapped to the lap count, put back on the owning axis.
   */
  lapRotation(run, raw, sweep, snapped) {
    const n = run.alignN;
    if (!this.hasUp || n === 0) return raw;
    const align = run.alignSum.map((a) => a / n);
    const measured = run.lastAxis - run.openAxis;
    const conv = measured === 0 || sweep === 0 ? 0 : sign(measured) * sign(sweep);
    const spinV = measured === 0 ? 0 : snapped * sign(measured);
    const roll = run.magRoll / n;
    const perp = run.magPerp / n;
    let best = AXIS_ROLL;
    let owned = roll;
    let other = perp;
    if (roll < perp) {
      best = abs(align[1]) >= abs(align[2]) ? AXIS_PITCH : AXIS_YAW;
      owned = perp;
      other = roll;
    }
    if (owned < 0.5 || owned < other * 1.5) return raw;
    const out = raw.map((v, k) => v - conv * run.proj[k]);
    run.resid = out.slice();
    out[best] = out[best] + spinV * (align[best] < 0 ? -1 : 1);
    return out;
  }

  groupOf(ob) {
    const at = this.groups.findIndex((g) => sameAxis(g, ob));
    if (at >= 0) return at;
    this.groups.push(ob);
    return this.groups.length - 1;
  }

  /* Does an open lap cover most of this piece? Bounded by the lap's last
   * circling moment when it is closing a rotation, by now when asking
   * whether a lap could still claim it. */
  lapCovers(prim, toTail) {
    const now = this.nowMs;
    for (const lap of this.laps) {
      if (!lap.open) continue;
      const from = lap.openMs || lap.startMs;
      const until = toTail && lap.tailMs > from ? lap.tailMs : now;
      if (mostlyInside(prim, from, until)) return true;
    }
    return false;
  }

  /* Was this piece part of a lap already named? Asking forgets the windows
   * that are too old, along with every window recorded before them. */
  absorbed(prim) {
    const windows = this.namedLaps;
    for (let i = windows.length - 1; i >= 0; i -= 1) {
      const w = windows[i];
      if (this.nowMs - w.end > NAMED_LAP_MS) {
        windows.splice(0, i + 1);
        return false;
      }
      if (mostlyInside(prim, w.start, w.end)) return true;
    }
    return false;
  }

  releaseHeld() {
    if (this.held.length === 0) return;
    const kept = [];
    let released = false;
    for (const prim of this.held) {
      if (this.lapCovers(prim, false)) {
        kept.push(prim);
      } else if (!this.absorbed(prim)) {
        this.pending.push(prim);
        released = true;
      }
    }
    this.held = kept;
    if (released) this.lastCloseMs = this.nowMs;
  }

  insertPending(prim) {
    const key = (x) => x.orderMs ?? x.startMs;
    const k = key(prim);
    let at = this.pending.length;
    while (at > 0 && key(this.pending[at - 1]) > k) at -= 1;
    this.pending.splice(at, 0, prim);
  }

  shouldWait() {
    if (this.spins.some((s) => s.open)) return true;
    const buf = this.pending;
    if (buf.length > 0 && this.lapCovers(buf[buf.length - 1], false)) return true;
    let wait = -1;
    for (const pat of PATTERNS) {
      if (pat.steps.length <= buf.length || matchSlack(pat.steps, buf, buf.length) < 0) continue;
      wait = Math.max(wait, SETTLE_MS + askedMs(pat.steps[buf.length]));
    }
    return wait >= 0 && this.nowMs - this.lastCloseMs < wait;
  }

  bestPattern() {
    let best = null;
    for (const pat of PATTERNS) {
      const n = pat.steps.length;
      if (n > this.pending.length) continue;
      const slack = matchSlack(pat.steps, this.pending, n);
      if (slack < 0) continue;
      const points = trickPoints(pat.name);
      if (!best || n > best.n || (n === best.n && (slack < best.slack
        || (slack === best.slack && points > best.points)))) {
        best = { pat, n, slack, points };
      }
    }
    return best;
  }

  drain(forced) {
    while (this.pending.length > 0) {
      if (!forced && this.shouldWait()) return;
      const best = this.bestPattern();
      if (best) {
        const { pat } = best;
        const wantTap = pat.steps.some((s) => s.tap === true);
        if (this.emit(pat.name, best.n, best.slack, wantTap, pat.steps)) {
          this.pending = this.pending.filter((p) => p.kind !== 'rot' || !this.absorbed(p));
        }
      } else if (this.pending[0].kind === 'path') {
        /* A lap that names nothing hands its rotations back. */
        const lap = this.pending.shift();
        if (lap.held.length > 0) this.pending.unshift(...lap.held.filter((p) => !this.absorbed(p)));
      } else {
        this.namePlain();
      }
    }
    if (!this.spins.some((s) => s.open) && !this.laps.some((l) => l.open)) this.touched = false;
  }

  namePlain() {
    const prim = this.pending[0];
    let entry = null;
    for (const e of PLAIN_NAMES) {
      if (e.axis === prim.axis && e.turns <= prim.turns + 1e-9 && (!entry || e.turns > entry.turns)) entry = e;
    }
    if (!entry) {
      this.pending.shift();
      return;
    }
    const name = entry.belly && (prim.invertedFrac ?? 0) >= BELLY_UP ? entry.belly : entry.name;
    const rest = prim.turns - entry.turns;
    this.emit(name, 1, 0, false, null);
    if (rest >= 0.25 - 1e-9) {
      this.pending.unshift({
        kind: 'rot',
        axis: prim.axis,
        turns: rest,
        dir: prim.dir,
        startMs: prim.startMs,
        endMs: prim.endMs,
        stallBeforeMs: 0,
        slowMs: 0,
        touched: prim.touched,
        invertedFrac: prim.invertedFrac,
      });
    }
  }

  /* Pays the first count pieces as one trick. True if a lap was among them. */
  emit(name, count, slack, wantTap, steps) {
    const used = this.pending.splice(0, count);
    let usedLap = null;
    let dead = 0;
    let touched = false;
    let turns = 0;
    for (let i = 0; i < used.length; i += 1) {
      const u = used[i];
      if (u.kind === 'path') {
        this.namedLaps.push({ start: u.startMs, end: u.endMs });
        usedLap = usedLap || u;
      }
      touched = touched || u.touched;
      turns += u.turns;
      dead = dead + u.slowMs;
      if (i > 0) {
        const asked = steps && steps[i] ? askedMs(steps[i]) : 0;
        dead = dead + (u.startMs - used[i - 1].endMs - Math.max(u.stallBeforeMs, asked));
      }
    }
    let execution = 'CLEAN';
    if (touched && !wantTap) execution = 'BUMP';
    else if (dead >= SLOPPY_DEAD_MS || slack > 0) execution = 'SLOPPY';
    const first = used[0];
    this.onTrick({
      name,
      axis: first.kind === 'path' ? first.obstacle : AXIS_NAME[first.axis],
      turns,
      startMs: first.startMs,
      endMs: used[used.length - 1].endMs,
      execution,
      primitives: count,
      obstacle: usedLap ? usedLap.obstacleGroup : null,
    });
    return usedLap !== null;
  }

  stepPathTurn(dt, dtMs, wx, wy, wz, upZ) {
    const t = this.turn;
    const now = this.nowMs;
    if (!this.hasUp) {
      t.pos = null;
      t.tangent = null;
      t.frame = null;
      return;
    }
    if (!t.pos) {
      t.pos = [wx, wy, wz];
      t.remember(now);
      return;
    }
    const vx = (wx - t.pos[0]) / dt;
    const vy = (wy - t.pos[1]) / dt;
    const vz = (wz - t.pos[2]) / dt;
    t.pos = [wx, wy, wz];
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);

    const [fx, fy, fz] = this.nose;
    const [ux, uy, uz] = this.up;
    const [rx, ry, rz] = this.right;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (t.frame && dt > 0) {
      const [pfx, pfy, pfz, pux, puy, puz, prx, pry, prz] = t.frame;
      const k = 0.5 / dt;
      ox = k * ((pfy * fz - pfz * fy) + (puy * uz - puz * uy) + (pry * rz - prz * ry));
      oy = k * ((pfz * fx - pfx * fz) + (puz * ux - pux * uz) + (prz * rx - prx * rz));
      oz = k * ((pfx * fy - pfy * fx) + (pux * uy - puy * ux) + (prx * ry - pry * rx));
    }
    t.frame = [fx, fy, fz, ux, uy, uz, rx, ry, rz];

    if (sp < PATH_SPEED_MIN) {
      t.tangent = null;
      if (!t.open) t.remember(now);
      return;
    }
    const tx = vx / sp;
    const ty = vy / sp;
    const tz = vz / sp;
    if (!t.tangent) {
      t.tangent = [tx, ty, tz];
      if (!t.open) t.remember(now);
      return;
    }
    const [ptx, pty, ptz] = t.tangent;
    const dx = pty * tz - ptz * ty;
    const dy = ptz * tx - ptx * tz;
    const dz = ptx * ty - pty * tx;
    t.tangent = [tx, ty, tz];
    const dmag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    t.rate = t.rate + (dmag / dt / TURN - t.rate) * LAP_FILTER;
    const radius = t.rate > 1e-9 ? sp / (t.rate * TURN) : Infinity;
    const opening = t.rate >= PATH_ON && radius <= PATH_R_MAX;
    const solids = this.solids;
    const canGap = solids && typeof solids.gapAt === 'function';

    if (!t.open) {
      t.remember(now);
      if (canGap && (now & 15) === 0) {
        if (now - t.preMs > PATH_PRE_MS) t.preGap = Infinity;
        const g = solids.gapAt(wx, wy, wz, PATH_R_MAX);
        if (g < t.preGap) {
          t.preGap = g;
          t.prePos = [wx, wy, wz];
          t.preMs = now;
        }
      }
      if (opening) this.openPathTurn(wx, wy, wz);
      return;
    }

    if (!(t.rate >= PATH_OFF && radius <= PATH_R_MAX)) {
      if (t.rate < PATH_OFF) t.slowHold += dtMs;
      if (t.back / TURN >= PATH_REVERSE || t.slowHold >= PATH_HOLD_MS || now - t.startMs >= LAP_MAX_MS) {
        this.closeTrack();
      }
      return;
    }

    t.slowHold = 0;
    t.T[0] += dx;
    t.T[1] += dy;
    t.T[2] += dz;
    t.W[0] = t.W[0] + ox * dt;
    t.W[1] = t.W[1] + oy * dt;
    t.W[2] = t.W[2] + oz * dt;
    t.rollT = t.rollT + ((ox * tx + oy * ty + oz * tz) * dt) / TURN;
    t.counted += 1;
    t.fwdSum += fx * tx + fy * ty + fz * tz;
    if (upZ < 0) t.belly += 1;
    if (dmag > 1e-12) {
      const inv = 1 / dmag;
      const nx = dx * inv;
      const ny = dy * inv;
      const nz = dz * inv;
      const an = abs(nx * fx + ny * fy + nz * fz);
      let across = 1 - an * an;
      across = across > 0 ? Math.sqrt(across) : 0;
      t.alongNose += an * dmag;
      t.acrossNose += across * dmag;
      t.alignW += dmag;
      const ix = ny * tz - nz * ty;
      const iy = nz * tx - nx * tz;
      const iz = nx * ty - ny * tx;
      const csx = wx + ix * radius;
      const csy = wy + iy * radius;
      const csz = wz + iz * radius;
      t.C[0] += csx * dmag;
      t.C[1] += csy * dmag;
      t.C[2] += csz * dmag;
      t.rSum += radius * dmag;
      if (radius < t.minR) t.minR = radius;
      if (radius > t.maxR) t.maxR = radius;
      if (this.hasNose) {
        const tox = csx - wx;
        const toy = csy - wy;
        const toz = csz - wz;
        const tl = Math.sqrt(tox * tox + toy * toy + toz * toz);
        if (tl > 1e-9 && (tox * fx + toy * fy + toz * fz) / tl >= TRACK_COS) t.tracked += 1;
      }
      const [Tx, Ty, Tz] = t.T;
      const tl2 = Math.sqrt(Tx * Tx + Ty * Ty + Tz * Tz);
      if (tl2 > 1e-9) {
        const along = (dx * Tx + dy * Ty + dz * Tz) / tl2;
        if (along < 0) {
          t.back -= along;
        } else if (t.back > 0) {
          t.back -= along;
          if (t.back < 0) t.back = 0;
        }
      }
    }
    if (canGap && (t.counted & 15) === 0) {
      const g = solids.gapAt(wx, wy, wz, PATH_R_MAX);
      if (g < t.nearGap) {
        t.nearGap = g;
        t.nearPos = [wx, wy, wz];
      }
    }
    t.tailMs = now;
    t.endPos = [wx, wy, wz];
    if (t.back / TURN >= PATH_REVERSE || now - t.startMs >= LAP_MAX_MS) this.closeTrack();
  }

  openPathTurn(wx, wy, wz) {
    const t = this.turn;
    t.open = true;
    t.startMs = t.oldestMs(this.nowMs);
    t.startPos = [wx, wy, wz];
    t.openMs = this.nowMs;
    t.tailMs = this.nowMs;
    t.stallBeforeMs = this.stallMs;
    t.T = [0, 0, 0];
    t.W = [0, 0, 0];
    t.C = [0, 0, 0];
    t.rollT = 0;
    t.alongNose = 0;
    t.acrossNose = 0;
    t.alignW = 0;
    t.fwdSum = 0;
    t.counted = 0;
    t.belly = 0;
    t.tracked = 0;
    t.rSum = 0;
    t.minR = Infinity;
    t.maxR = 0;
    t.nearGap = t.preGap;
    t.nearPos = t.prePos;
    t.back = 0;
  }

  closeTrack() {
    const t = this.turn;
    if (!t.open) return null;
    t.open = false;
    t.slowHold = 0;
    t.rate = 0;
    const [Tx, Ty, Tz] = t.T;
    const mag = Math.sqrt(Tx * Tx + Ty * Ty + Tz * Tz);
    if (!(mag > 1e-9) || t.alignW <= 0 || t.counted <= 0) return null;
    const im = 1 / mag;
    const a = [Tx * im, Ty * im, Tz * im];
    const iw = 1 / t.alignW;
    const centre = t.C.map((c) => c * iw);
    const W = t.W;
    const along = t.alongNose * iw;
    const across = t.acrossNose * iw;
    const meanR = t.rSum * iw;
    const start = t.startPos;
    const end = t.endPos;
    const mid = [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5, (start[2] + end[2]) * 0.5];

    const solids = this.solids;
    let solidGap = Infinity;
    let probe = centre;
    let nearestUsed = false;
    if (solids && typeof solids.gapAt === 'function' && meanR > 1e-6) {
      solidGap = solids.gapAt(centre[0], centre[1], centre[2], meanR);
      if (!(solidGap < meanR * PATH_INSIDE)) {
        const chord = solids.gapAt(mid[0], mid[1], mid[2], meanR);
        if (chord < solidGap) {
          solidGap = chord;
          probe = mid;
        }
      }
      if (!(solidGap < meanR * PATH_INSIDE) && Number.isFinite(t.nearGap)) {
        solidGap = t.nearGap;
        probe = t.nearPos;
        nearestUsed = true;
      }
    }
    const enclosed = !nearestUsed && solidGap < meanR * PATH_INSIDE;
    const engaged = enclosed || solidGap <= PATH_NEAR;

    let startBelow = start[1] < centre[1];
    let endBelow = end[1] < centre[1];
    let turnsAbout = null;
    let loopAbout = null;
    let objectAxis = null;
    if (engaged && solids && typeof solids.axisAt === 'function') {
      const A = solids.axisAt(probe[0], probe[1], probe[2], meanR);
      if (A) {
        turnsAbout = (Tx * A.dx + Ty * A.dy + Tz * A.dz) / TURN;
        loopAbout = (W[0] * A.dx + W[1] * A.dy + W[2] * A.dz) / TURN;
        objectAxis = abs(A.dy) >= 0.7 ? 'vertical' : 'horizontal';
        if (objectAxis === 'horizontal') {
          const below = (pt) => {
            const qx = pt[0] - A.cx;
            const qy = pt[1] - A.cy;
            const qz = pt[2] - A.cz;
            const al = qx * A.dx + qy * A.dy + qz * A.dz;
            return qy - A.dy * al < 0;
          };
          startBelow = below(start);
          endBelow = below(end);
        }
      }
    }

    const minR = t.minR;
    const result = {
      turns: mag / TURN,
      axis: abs(a[1]) >= 0.7 ? 'vertical' : 'horizontal',
      axisY: a[1],
      loop: (W[0] * a[0] + W[1] * a[1] + W[2] * a[2]) / TURN,
      rollT: t.rollT,
      spin: W[1] / TURN,
      loopOn: along >= across ? 'roll' : 'pitch',
      loopOwn: along >= across ? along : across,
      forward: t.fwdSum / t.counted,
      invertedFrac: t.belly / t.counted,
      trackFrac: this.hasNose ? t.tracked / t.counted : -1,
      startBelow,
      endBelow,
      turnsAbout,
      loopAbout,
      objectAxis,
      centre,
      minR: minR === Infinity ? 0 : minR,
      maxR: t.maxR,
      radius: meanR,
      object: enclosed ? 'inside' : (engaged ? 'engaged' : 'none'),
      solidGap,
      radiusRatio: minR > 1e-6 && minR !== Infinity ? t.maxR / minR : 1,
      startMs: t.startMs,
      openMs: t.openMs,
      endMs: t.tailMs,
      stallBeforeMs: t.stallBeforeMs,
    };
    this.lastTurn = result;
    return result;
  }
}
