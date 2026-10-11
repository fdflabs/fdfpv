/*
 * crash-rules-selftest.js: what a craft touching something is ruled to mean.
 *
 *     node scripts/crash-rules-selftest.js      (npm run crash:rules)
 *
 * The contact rules are a handful of small verdict functions and a collider
 * query or two, and a wrong comparison in any of them turns a bounce into a
 * wreck or lets a craft sit inside a wall. Most probes therefore sit exactly
 * on a threshold, with the threshold read from the module, so flipping a
 * `<` to `<=` or moving a constant shows up here. It also walks every
 * airframe's hull against a floor and a ceiling to prove the vertical reach
 * the airframe declares is the one the collider uses, level and inverted.
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

import { Race } from '../src/game/race.js';
import * as C from '../src/game/collide.js';
import { FPV_FLOOR_CLEAR, FPV_NEAR_CLEAR, fpvLensClear } from '../src/render/lens.js';
import { AIRFRAMES } from '../configs/airframes.js';

/* Taken before anything is seated: group one depends on the default
 * airframe, and the reach walk puts it back afterwards. The CRAFT_* exports
 * are live bindings, so this must be read off the module, not typed. */
const homeDims = {
  arm: C.CRAFT_ARM,
  propR: C.CRAFT_PROP_R,
  hullR: C.CRAFT_HULL_R,
  vHalfDown: C.CRAFT_V_DOWN,
  vHalfUp: C.CRAFT_V_UP,
};

const tally = { pass: 0, fail: 0 };

function check(label, ok, detail) {
  if (ok) {
    tally.pass += 1;
    console.log(`  PASS  ${label}`);
    return;
  }
  tally.fail += 1;
  console.log(`  FAIL  ${label}${detail === undefined ? '' : `: ${detail}`}`);
}

function section(name) {
  console.log(`\n${name}`);
}

const near = (a, b, tol) => Math.abs(a - b) < tol;
const v3 = (x, y, z) => ({ x, y, z });
const flat = () => 0;

console.log('crash rules self-test');

section('contact verdicts');

for (const speed of [1, 10, 25, 60]) {
  const r = C.hitOutcome('gate', speed, 1.0);
  check(`belly into a gate at ${speed} m/s is survivable`, r === 'bounce' || r === 'hard', r);
}
{
  const r = C.hitOutcome('gate', 40, C.PROP_PLANE_MAX_UP_DOT);
  check('prop plane at the up-dot limit, 40 m/s, is survivable', r === 'hard' || r === 'bounce', r);
}
check('just under the bounce speed bounces',
  C.hitOutcome('gate', C.BOUNCE_SPEED_MAX - 0.1, 0) === 'bounce');
check('exactly the bounce speed is a hard hit',
  C.hitOutcome('gate', C.BOUNCE_SPEED_MAX, 0) === 'hard');
check('any train contact is hard', C.hitOutcome('train', 1, 1.0) === 'hard');
check('up-dot defaults when left out', C.hitOutcome('gate', C.BOUNCE_SPEED_MAX + 5) === 'hard');
check('no obstacle verdict is ever a wreck',
  C.hitOutcome('gate', 80, 0) !== 'crash' && C.hitOutcome('train', 40, 0) !== 'crash');
{
  let bounces = 0;
  for (let i = 0; i < 50; i += 1) {
    if (C.hitOutcome('gate', 12, 0) === 'bounce') bounces += 1;
  }
  check('fifty repeat contacts never escalate', bounces === 50, bounces);
}

check('gentle touchdown lands', C.groundOutcome(1.0, 1.0, 0) === C.GROUND_LAND);
check('perch speed splits land from slide',
  C.groundOutcome(C.PERCH_SPEED - 0.01, 0, 0) === C.GROUND_LAND
  && C.groundOutcome(C.PERCH_SPEED + 0.01, 0, 0) === C.GROUND_SLIDE);
check('fast descent bounces, and bounce is slide',
  C.groundOutcome(C.LAND_DESCENT_MAX + 2, 0, 0) === C.GROUND_BOUNCE && C.GROUND_BOUNCE === C.GROUND_SLIDE);
check('fast skid bounces', C.groundOutcome(0, C.LAND_HORIZONTAL_MAX + 5, 0) === C.GROUND_BOUNCE);
check('tipped and moving tumbles, and tumble is crash',
  C.groundOutcome(0, C.LAND_TIP_SPEED_MAX + 1, C.LAND_TILT_MAX_DEG + 1) === C.GROUND_CRASH
  && C.GROUND_CRASH === C.GROUND_TUMBLE);
check('blade down while crawling perches', C.groundOutcome(0.2, 0.2, C.LAND_TILT_MAX_DEG + 1) === C.GROUND_LAND);
check('on its side is a crash', C.groundOutcome(0, 0, C.LAND_TILT_HARD_DEG + 1) === C.GROUND_CRASH);
check('flat but very fast still only bounces', C.groundOutcome(30, 30, 0) === C.GROUND_BOUNCE);
check('graze speed sits below bounce speed', C.GRAZE_SPEED_MAX < C.BOUNCE_SPEED_MAX);

check('slow and level can perch', C.canPerch(0, 0.5, 0.5) === true);
check('past the blade tilt cannot perch', C.canPerch(C.LAND_TILT_MAX_DEG + 0.1, 0, 0) === false);
check('past perch speed cannot perch', C.canPerch(0, C.PERCH_SPEED + 0.01, 0) === false);
check('past perch rate cannot perch', C.canPerch(0, 0, C.PERCH_RATE + 0.01) === false);

/* enter(upz, speed, rate, inContact, clearance, skip) */
const enter = C.shouldEnterTurtle;
check('inverted and settled enters turtle', enter(-0.9, 0.4, 0.4, true, 0.05, false) === true);
check('turtle speed itself refuses', enter(-1, C.TURTLE_SPEED, 0, true, 0.05, false) === false);
check('turtle rate itself refuses', enter(-1, 0, C.TURTLE_RATE, true, 0.05, false) === false);
check('inverted high in the air does not turtle', enter(-0.8, 0.2, 0.2, false, 1.2, false) === false);
check('no contact but inside the halo turtles', enter(-0.8, 0.2, 0.2, false, 0.10, false) === true);
check('exactly at the halo edge without contact does not turtle',
  enter(-0.8, 0.2, 0.2, false, C.turtleClearance(), false) === false);
check('on its side does not turtle', enter(0.2, 0, 0, true, 0.05, false) === false);
check('sixty degree bank does not turtle', enter(0.49, 0, 0, true, 0.05, false) === false);
check('just past vertical does not turtle', enter(-0.2, 0, 0, true, 0.05, false) === false);
check('a hair past the invert line turtles', enter(C.TURTLE_INVERT_UPZ - 0.01, 0, 0, true, 0.05, false) === true);
check('on the invert line does not turtle', enter(C.TURTLE_INVERT_UPZ, 0, 0, true, 0.05, false) === false);
check('invert line is about 110 degrees', C.TURTLE_INVERT_UPZ < -0.3 && C.TURTLE_INVERT_UPZ > -0.5);
check('waiting, sticks still, on the ground parks', C.shouldParkTurtle(true, 0, 0.2, true) === true);
check('waiting off the ground does not park', C.shouldParkTurtle(true, 0, 0, false) === false);
check('stick at the poke gate does not park', C.shouldParkTurtle(true, C.TURTLE_STICK_MIN, 0, true) === false);
check('launch staging never turtles', enter(-1, 0, 0, true, 0.05, true) === false);
check('upright never turtles', enter(0.9, 0, 0, true, 0.05, false) === false);
check('still inverted does not leave turtle', C.shouldExitTurtle(-0.9) === false);
check('poke gate is small', C.TURTLE_STICK_MIN <= 0.08);
check('wait rate is below turtle rate', C.TURTLE_WAIT_RATE < C.TURTLE_RATE);
check('flip lasts a beat', C.TURTLE_FLIP_MS > 200 && C.TURTLE_FLIP_MS < 800);
check('flip ease pins its ends', C.turtleFlipEase(0) === 0 && C.turtleFlipEase(1) === 1);
check('flip ease is half way at half time', near(C.turtleFlipEase(0.5), 0.5, 1e-12));
check('flip lift is zero at both ends', C.turtleFlipLift(0) === 0 && C.turtleFlipLift(1) === 0);
check('flip lift peaks at the turtle lift',
  C.turtleFlipLift(0.5) === C.turtleLift() && C.turtleLift() > 0.15);

/* From a half turn about x to identity. */
const slerp = (t) => C.turtleSlerpQuat(0, 1, 0, 0, 1, 0, 0, 0, t);
{
  const q = slerp(0);
  check('flip slerp starts inverted', near(q[0], 0, 1e-12) && near(q[1], 1, 1e-12));
}
{
  const q = slerp(1);
  check('flip slerp ends upright', near(q[0], 1, 1e-12) && near(q[1], 0, 1e-12));
}
{
  const q = slerp(0.5);
  check('flip slerp is a quarter turn half way',
    near(Math.abs(q[0]), Math.SQRT1_2, 1e-9) && near(Math.abs(q[1]), Math.SQRT1_2, 1e-9)
    && near(q[2], 0, 1e-12) && near(q[3], 0, 1e-12));
}

/* Plant frame, z up: heading kept, roll and pitch dropped. */
{
  const q = C.uprightPlantQuat(1, 0, 0, 0);
  check('upright plant of identity is identity',
    near(q[0], 1, 1e-12) && q[1] === 0 && q[2] === 0 && q[3] === 0);
}
{
  const q = C.uprightPlantQuat(0, 1, 0, 0);
  check('upright plant of a roll over is identity',
    near(q[0], 1, 1e-9) && near(q[1], 0, 1e-12) && near(q[2], 0, 1e-12) && near(q[3], 0, 1e-12));
}
{
  const q = C.uprightPlantQuat(Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  check('upright plant keeps a pure yaw',
    near(q[0], Math.SQRT1_2, 1e-9) && near(q[3], Math.SQRT1_2, 1e-9) && q[1] === 0 && q[2] === 0);
}
{
  const q = C.uprightPlantQuat(0, 0, 1, 0);
  check('upright plant of a pitch over reverses the heading',
    near(q[0], 0, 1e-9) && near(Math.abs(q[3]), 1, 1e-9) && q[1] === 0 && q[2] === 0);
}

check('level lens uses the floor clearance', fpvLensClear(0, 1) === FPV_FLOOR_CLEAR);
check('lens pitched down uses the near clearance', fpvLensClear(-0.5, 0.8) === FPV_NEAR_CLEAR);
check('lens upside down uses the near clearance', fpvLensClear(0, -1) === FPV_NEAR_CLEAR);
check('lens inverted looking up uses the near clearance', fpvLensClear(0.4, -0.9) === FPV_NEAR_CLEAR);

{
  const gate = C.contactMaterial('gate');
  const tree = C.contactMaterial('tree');
  const train = C.contactMaterial('train');
  const none = C.contactMaterial('none');
  check('gate is bouncier and slicker than tree', gate.e > tree.e && gate.mu < tree.mu);
  check('train is the deadest material', train.e < gate.e && train.e < none.e);
}

/* Gate-pass scoring. score(prev, curr, upz, clearance, hits, heightAt) */
const score = (prev, curr, upz, clearance, hits, heightAt = flat) =>
  C.shouldScorePass(prev, curr, { upz, clearance, hits, heightAt });
const air = { prev: v3(0, 0.9, 2), curr: v3(0, 0.9, -2) };
const lowIn = v3(0, 0.08, 1.2);
const lowOut = v3(0, 0.04, -1.2);

check('flown opening in the air scores', score(air.prev, air.curr, 1, 0.9, 0) === true);
check('inverted punch in the air scores', score(air.prev, air.curr, -0.8, 5, 0) === true);
check('inverted on the grass with a hit does not score', score(lowIn, lowOut, -1, 0.05, 1) === false);
check('inverted on the grass without a hit does not score', score(lowIn, lowOut, -1, 0.08, 0) === false);
check('side tumble on the dirt does not score',
  score(v3(0, 0.10, 1.2), v3(0, 0.06, -1.2), 0.35, 0.06, 1) === false);
{
  const a = v3(0, 0.05, 1.2);
  const b = v3(0, 0.045, -1.2);
  check('upright touch on the floor scores', score(a, b, 1, 0.045, 1) === true);
  check('upright bounce frame scores without a hit', score(a, b, 1, 0.045, 0) === true);
}
check('on its side just inside the dirt band does not score', score(air.prev, air.curr, 0.2, 0.219, 0) === false);
check('on its side just clear of the dirt band scores', score(air.prev, air.curr, 0.2, 0.221, 0) === true);
check('upright inside the dirt band scores', score(air.prev, air.curr, 1, 0.219, 0) === true);
check('at the tilt limit counts as flight', score(air.prev, air.curr, 0.5, 0.10, 1) === true);
check('falling under the terrain does not score',
  score(v3(0, 0.9, 1.2), v3(0, -2, -1.2), -0.4, -2, 0) === false);
check('a segment that dips onto the dirt does not score',
  score(v3(0, 0.9, 1.2), lowOut, -0.8, 0.9, 0) === false);
check('flown pass under a bridge scores',
  score(v3(0, 1.0, 1.2), v3(0, 1.0, -1.2), 1, 1.0, 0, () => 0) === true);

{
  const dirt = C.dirtClearance();
  check('default airframe dirt band is 22 cm', near(dirt, 0.22, 1e-12), dirt);
  const halo = C.turtleClearance();
  const lift = C.turtleLift();
  check('default airframe turtle halo 15 cm and lift 18 cm',
    near(halo, 0.15, 1e-12) && near(lift, 0.18, 1e-12), `${halo} ${lift}`);
}

/* Lap counting through one gate. */
const oneGate = () => {
  const aperture = { centreY: 2.5, clearW: 3.5, clearH: 5.0 };
  return {
    position: v3(0, 0, 0), heading: 0, pitch: 0, flyOrder: 0,
    apertures: [{ ...aperture }], aperture: { ...aperture },
  };
};
const dirt = { prev: v3(0, 0.08, 2), curr: v3(0, 0.04, -2) };
const fly = (race, seg, ms, allow) => race.update(seg.prev, seg.curr, ms, ms, allow);

{
  const race = new Race([oneGate()]);
  fly(race, air, 10);
  check('first pass starts the clock without a lap', race.lap === 0 && race.lapStartMs != null);
  const dirtAllow = score(dirt.prev, dirt.curr, -1, 0.05, 1);
  const res = fly(race, dirt, 20, dirtAllow);
  check('inverted dirt pass is refused by the race',
    dirtAllow === false && res.passed == null && race.lap === 0);
  const later = fly(race, air, 30, true);
  check('the next clean pass counts the lap', later.passed != null && race.lap === 1);
  check('one lap logged with its time', race.lap === 1 && race.log.length === 1 && race.log[0].ms != null);
}
{
  const runLaps = 3;
  const race = new Race([oneGate()]);
  fly(race, air, 10);
  fly(race, air, 20);
  check('three lap run: one lap after two passes', race.lap === 1 && !(race.lap >= runLaps));
  const midDirt = score(dirt.prev, dirt.curr, -1, 0.05, 0);
  fly(race, dirt, 30, midDirt);
  check('three lap run: dirt pass mid run is not a lap',
    midDirt === false && race.lap === 1 && !(race.lap >= runLaps));
  fly(race, air, 40);
  check('three lap run: second lap', race.lap === 2 && !(race.lap >= runLaps));
  fly(race, air, 50);
  check('three lap run: third lap finishes', race.lap === 3 && race.lap >= runLaps);
}
{
  const free = new Race([]);
  const r = fly(free, air, 10);
  check('a map with no gates is freestyle and never laps',
    free.freestyle === true && r.passed == null && free.lap === 0);
}
check('a part inverted low pass does not score', score(lowIn, lowOut, -0.6, 0.04, 0) === false);

section('clip catch');

check('clip confirm outlasts a hitch plus a frame', C.CLIP_CONFIRM_MS > 100 + 32);
check('deep clip is past bounce slop and thinner than a wall',
  C.CLIP_DEEP > C.CLIP_CENTER_EPS && C.CLIP_DEEP < 0.20);
check('spawn grace outlasts a bounce and ends before the crash hold',
  C.CLIP_SPAWN_GRACE_MS > 100 && C.CLIP_SPAWN_GRACE_MS < C.CLIP_CRASH_HOLD_MS);
check('stuck wait outlasts the clip confirm', C.STUCK_UNRESOLVED_MS > C.CLIP_CONFIRM_MS);
check('centre epsilon sits past the bounce gap', C.CLIP_CENTER_EPS > C.BOUNCE_SEPARATION);
check('crash hold is a beat, not a lockout', C.CLIP_CRASH_HOLD_MS >= 400 && C.CLIP_CRASH_HOLD_MS < 1400);

/* interiorOfHit and crossedHit answer about whatever the last hit() found,
 * so each scene is primed with a hit() first. */
const box = new C.Colliders();
box.addBox('wall', 0, 0, 0, 2, 2, 2);
box.build();
box.hit(1, 1, 1, 1, 1, 1, 0.04);
check('box centre is inside', box.interiorOfHit(1, 1, 1) > 0.99);
check('a point on the box face is not inside', near(box.interiorOfHit(2, 1, 1), 0, 1e-9));
{
  const d = box.interiorOfHit(3, 1, 1);
  check('a metre outside the box reads minus one', d < -0.99 && d > -1.01);
}
check('a centre 5 cm outside the box is outside', box.interiorOfHit(2.05, 1, 1) < -0.04);

/* Reach walk: slide the seated hull from the gap's middle towards a floor
 * (top at y 0) and a ceiling (bottom at y GAP), and take the first touch. */
const STEPS = 20000;
const LEVEL = [0, 1];
const INVERTED = [1, 0];

function firstTouch(rig, from, to, [aqX, aqW]) {
  const vh = C.craftVerticalHalf(0);
  const vo = C.craftVerticalOffset();
  for (let i = 0; i <= STEPS; i += 1) {
    const y = from + (to - from) * (i / STEPS);
    if (rig.hit(0, y, 0, 0, y, 0, vh, aqX, 0, 0, aqW, vo) >= 0) return y;
  }
  return null;
}

const reachOk = (got, want) => got !== null && Math.abs(got - want) < 1e-3;
/* The gap is 2 m: the Hercules' fin stands 0.62 m over its CG and its
 * wheels 0.26 under, which a 1 m gap's middle already touched. */
const GAP = 2;
const fromCeiling = (y) => (y === null ? null : GAP - y);

for (const frame of AIRFRAMES) {
  C.setCraftAirframe(frame.dims);
  const rig = new C.Colliders();
  rig.addBox('wall', -5, -1, -5, 5, 0, 5);
  rig.addBox('wall', -5, GAP, -5, 5, GAP + 2, 5);
  rig.build();
  const down = firstTouch(rig, 0.95, 0.0, LEVEL);
  const up = fromCeiling(firstTouch(rig, 1.05, GAP, LEVEL));
  const invDown = firstTouch(rig, 0.95, 0.0, INVERTED);
  const invUp = fromCeiling(firstTouch(rig, 1.05, GAP, INVERTED));
  const { vHalfDown, vHalfUp } = frame.dims;
  check(`${frame.id} reaches its declared depth below`, reachOk(down, vHalfDown), down);
  check(`${frame.id} reaches its declared height above`, reachOk(up, vHalfUp), up);
  check(`${frame.id} reach turns over when inverted`,
    reachOk(invDown, vHalfUp) && reachOk(invUp, vHalfDown), `${invDown} ${invUp}`);
}
C.setCraftAirframe(homeDims);

const post = new C.Colliders();
post.addPost('pole', 0, 0, 0, 2, 0.05);
post.build();
post.hit(0, 1, 0, 0, 1, 0, 0.04);
/* Post radii are stored as float32, so the centre reads a hair over 0.05. */
check('post axis is inside by its radius', post.interiorOfHit(0, 1, 0) > 0.049);
check('a centimetre off the post axis is inside', post.interiorOfHit(0.01, 1, 0) > 0.03);
check('past the post skin is outside', post.interiorOfHit(0.08, 1, 0) < 0);

const yard = new C.Colliders();
yard.build();
const car = yard.addMoving('train', 1, 0.5, 2);
yard.seatMoving(car, 10, 1, 0);
yard.hit(10, 1, 0, 10, 1, 0, 0.04);
check('centre of a moving train car is inside', yard.interiorOfHit(10, 1, 0) > 0.49);

const wall = new C.Colliders();
wall.addBox('wall', -0.1, 0, 0, 0.1, 2, 4);
wall.build();
wall.hit(-1, 1, 2, 1, 1, 2, 0.04);
check('chord through a wall crosses', wall.crossedHit(-1, 1, 2, 1, 1, 2) === true);
check('a bounce that stays on the entry side does not cross', wall.crossedHit(-1, 1, 2, -0.12, 1, 2) === false);
check('an eject on the far side crosses', wall.crossedHit(-1, 1, 2, 0.12, 1, 2) === true);
check('flying along the wall does not cross', wall.crossedHit(-1, 1, -1, -1, 1, 5) === false);
check('over the top does not cross', wall.crossedHit(-1, 3, 2, 1, 3, 2) === false);
check('round the corner does not cross', wall.crossedHit(-1, 1, -0.5, 0.5, 1, -1) === false);

const deck = new C.Colliders();
deck.addBox('wall', -2, 0.50, -2, 2, 0.64, 2);
deck.build();
deck.hit(0, 3, 0, 0, -1, 0, 0.04);
check('a long drop through a thin deck crosses', deck.crossedHit(0, 3, 0, 0, -1, 0) === true);
check('the drop midpoint below the deck is outside', deck.interiorOfHit(0, 1, 0) < 0);
check('landing on the deck does not cross', deck.crossedHit(0, 3, 0, 0, 0.72, 0) === false);
check('over the deck does not cross', deck.crossedHit(-3, 2, 0, 3, 2, 0) === false);
check('under the deck does not cross', deck.crossedHit(-3, 0.3, 0, 3, 0.3, 0) === false);

post.hit(-1, 1, 0, 1, 1, 0, 0.04);
check('chord through a post crosses', post.crossedHit(-1, 1, 0, 1, 1, 0) === true);
check('a post bounce on the entry side does not cross', post.crossedHit(-1, 1, 0, -0.08, 1, 0) === false);
check('a far side eject after a long run at a post crosses', post.crossedHit(-10, 1, 0, 0.08, 1, 0) === true);
check('a 20 cm fly-by of a post does not cross', post.crossedHit(-1, 1, 0.20, 1, 1, 0.20) === false);

yard.hit(8, 1, 0, 12, 1, 0, 0.04);
check('chord through a train car crosses', yard.crossedHit(8, 1, 0, 12, 1, 0) === true);
check('a scrape along a train car does not cross', yard.crossedHit(12.2, 1, -4, 12.2, 1, 4) === false);

/* Clip watch. */
const FRAME_MS = 16;
const quiet = {
  landed: false, turtle: false, launchStaging: false, hold: false, poseLock: false, spawnGrace: false,
  takingOff: false, unresolved: false, roofContact: false, interiorDepth: 0, buriedDepth: 0, x: 0, y: 1, z: 0,
};
const sample = (over = {}) => ({ ...quiet, ...over });
const once = (watch, over, dt = FRAME_MS) => C.clipWatchTick(watch, sample(over), dt);

/* Feeds the same sample for a budget of ms in fixed frames. The strict `<`
 * matters: a budget of CLIP_CONFIRM_MS is 12 frames (192 ms) and one frame
 * less is 11 (176 ms), which is what the confirm window probes rely on. */
function feed(watch, over, ms, dt = FRAME_MS) {
  let verdict = null;
  for (let t = 0; t < ms; t += dt) {
    verdict = once(watch, over, dt);
    if (verdict) return verdict;
  }
  return verdict;
}

/* Feeds a sample built per frame from the frame index until a verdict. */
function drive(watch, ms, overAt) {
  for (let t = 0, n = 0; t < ms; t += FRAME_MS, n += 1) {
    const verdict = once(watch, overAt(n));
    if (verdict) return verdict;
  }
  return null;
}

const fresh = C.makeClipWatch;
const { CLIP_CONFIRM_MS: CONFIRM, STUCK_UNRESOLVED_MS: STUCK, BURIED_CONFIRM_MS: BURY, CLIP_CENTER_EPS: EPS } = C;

check('open air stays quiet', feed(fresh(), {}, 1000) === null);
{
  const w = fresh();
  check('one leftover overlap frame is quiet', once(w, { unresolved: true }) === null);
  check('a bounce that clears stays quiet', feed(w, { unresolved: false }, 1000) === null);
}
check('a graze leftover is quiet', feed(fresh(), { unresolved: true }, 50) === null);
check('props overlap with the centre outside is not a clip',
  feed(fresh(), { interiorDepth: -0.05 }, CONFIRM + 80) === null);
{
  const w = fresh();
  check('a perch leftover is not stuck',
    feed(w, { landed: true, unresolved: true, interiorDepth: 0 }, STUCK + 200) === null);
  check('a perch is not buried', feed(w, { landed: true, buriedDepth: 0.4 }, BURY + 80) === null);
}
check('landed does not hide a centre inside a wall',
  feed(fresh(), { landed: true, interiorDepth: 0.2 }, CONFIRM) === 'inside');
check('a turtle leftover on the grass is not stuck',
  feed(fresh(), { turtle: true, unresolved: true, interiorDepth: 0 }, STUCK + 200) === null);
check('turtle does not hide a centre inside a solid',
  feed(fresh(), { turtle: true, interiorDepth: 0.2 }, CONFIRM) === 'inside');
check('launch staging never fires',
  feed(fresh(), { launchStaging: true, interiorDepth: 0.3, unresolved: true }, 2000) === null);
check('harness pose lock never fires', feed(fresh(), { poseLock: true, interiorDepth: 0.5 }, 2000) === null);
check('a held crash never fires again',
  feed(fresh(), { hold: true, interiorDepth: 0.5, unresolved: true }, 2000) === null);
check('sitting on a roof is not stuck',
  feed(fresh(), { unresolved: true, roofContact: true, interiorDepth: 0 }, STUCK + 200) === null);
check('falling through a roof with the centre inside is a clip',
  feed(fresh(), { unresolved: true, roofContact: false, interiorDepth: 0.12 }, CONFIRM) === 'inside');
check('exactly deep fires at once even on a roof',
  once(fresh(), { roofContact: true, unresolved: true, interiorDepth: C.CLIP_DEEP }) === 'inside');

const slide = (speed, interiorDepth = 0) => {
  let x = 0;
  return drive(fresh(), STUCK + 80, () => {
    x += speed * (FRAME_MS / 1000);
    return { unresolved: true, interiorDepth, x, y: 1, z: 0 };
  });
};
{
  const v = slide(10);
  check('a 10 m/s wall scrape is not stuck', v === null, v);
}
{
  const v = slide(5);
  check('a 5 m/s wall scrape is not stuck', v === null, v);
}
check('a takeoff 5 cm in the grass is not buried',
  feed(fresh(), { takingOff: true, buriedDepth: 0.05 }, BURY + 80) === null);
check('10 cm under the terrain is not buried', feed(fresh(), { buriedDepth: 0.10 }, BURY + 80) === null);
check('one shallow tunnelled frame is quiet', once(fresh(), { interiorDepth: 0.04 }) === null);
{
  const w = fresh();
  check('100 ms shallow inside is quiet', once(w, { interiorDepth: 0.04 }, 100) === null);
  check('132 ms shallow inside is still quiet', once(w, { interiorDepth: 0.04 }, 32) === null);
}
check('a deep centre fires on the first frame', once(fresh(), { interiorDepth: 0.10 }) === 'inside');
check('shallow inside for the confirm window fires',
  feed(fresh(), { interiorDepth: 0.04 }, CONFIRM) === 'inside');
check('just past the centre epsilon still confirms',
  feed(fresh(), { interiorDepth: EPS + 0.002 }, CONFIRM + 16) === 'inside');
check('leftover overlap with the centre outside is never stuck',
  feed(fresh(), { unresolved: true }, STUCK * 3) === null);
check('stuck with the centre inside confirms as inside first',
  feed(fresh(), { unresolved: true, interiorDepth: EPS + 0.004 }, STUCK) === 'inside');
{
  const v = drive(fresh(), STUCK + 16,
    (n) => ({ unresolved: true, interiorDepth: EPS + 0.004, x: (n % 2) * 0.04, y: 1, z: 0 }));
  check('jitter with the centre inside confirms', v === 'inside', v);
}
{
  const v = drive(fresh(), STUCK * 2, (n) => ({ unresolved: true, x: (n % 2) * 0.04, y: 1, z: 0 }));
  check('jitter with the centre outside is quiet', v === null, v);
}
check('exactly the buried depth for the confirm window buries',
  feed(fresh(), { buriedDepth: C.BURIED_DEPTH }, BURY) === 'buried');
check('inside wins over stuck', feed(fresh(), { interiorDepth: 0.2, unresolved: true }, CONFIRM) === 'inside');
{
  const w = fresh();
  feed(w, { interiorDepth: 0.04 }, CONFIRM - 32);
  check('a clear frame after 160 ms inside is quiet', once(w, { interiorDepth: 0 }) === null);
  check('the clear frame resets the confirm count', feed(w, { interiorDepth: 0.04 }, CONFIRM - 16) === null);
}
check('hull overlap with the centre 5 cm outside is not stuck',
  feed(fresh(), { unresolved: true, interiorDepth: -0.05 }, STUCK + 80) === null);
{
  const v = slide(1.0, -0.05);
  check('a 1 m/s crawl with the centre outside is not stuck', v === null, v);
}
check('a fall through the world buries even while taking off',
  feed(fresh(), { takingOff: true, buriedDepth: 2.0 }, BURY) === 'buried');
check('spawn grace ignores pad leftovers',
  feed(fresh(), { spawnGrace: true, landed: true, interiorDepth: 0.2, unresolved: true, buriedDepth: 0.4 }, 2000)
  === null);
check('grace off and airborne, a deep clip fires',
  once(fresh(), { spawnGrace: false, landed: false, interiorDepth: 0.10 }) === 'inside');
{
  const w = fresh();
  let verdicts = 0;
  for (let i = 0; i < 50; i += 1) {
    if (once(w, { unresolved: true })) verdicts += 1;
    once(w, { unresolved: false });
  }
  check('fifty contacts that each clear never crash', verdicts === 0, verdicts);
}
check('a 5 m/s crawl outruns the stuck gate within the stuck wait',
  C.STUCK_TRAVEL_MAX < 5 * (STUCK / 1000));

console.log(`\n${tally.pass} passed, ${tally.fail} failed`);
process.exitCode = tally.fail ? 1 : 0;
