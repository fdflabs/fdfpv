/*
 * crash-rules-selftest.js: the contact rules a crash is decided by, and the
 * catch that pulls a craft out of a solid it has clipped into, runnable in
 * Node in a second.
 *
 *   node scripts/crash-rules-selftest.js
 *
 * These lived in the 2D track builder's selftest because that was the one
 * Node suite CI ran, and they test src/game/collide.js, src/game/race.js
 * and src/render/lens.js, which every flight uses. The builder page went,
 * so they moved here, checks and wording as they were.
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

import { Race } from '../src/game/race.js';
import {
  Colliders, hitOutcome, groundOutcome, GROUND_LAND, GROUND_BOUNCE, GROUND_CRASH,
  GROUND_TUMBLE, GROUND_SLIDE, canPerch, shouldScorePass, shouldEnterTurtle,
  shouldExitTurtle, shouldParkTurtle, uprightPlantQuat, contactMaterial,
  PROP_PLANE_MAX_UP_DOT, BOUNCE_SPEED_MAX, GRAZE_SPEED_MAX,
  LAND_DESCENT_MAX, LAND_HORIZONTAL_MAX, LAND_TILT_MAX_DEG, LAND_TILT_HARD_DEG,
  LAND_TIP_SPEED_MAX, PERCH_SPEED, PERCH_RATE, TURTLE_SPEED, TURTLE_RATE,
  TURTLE_STICK_MIN, TURTLE_WAIT_RATE, TURTLE_FLIP_MS, turtleLift,
  TURTLE_INVERT_UPZ, turtleClearance, turtleFlipEase, turtleFlipLift, turtleSlerpQuat,
  makeClipWatch, clipWatchTick, CLIP_CENTER_EPS, CLIP_CONFIRM_MS, CLIP_DEEP,
  STUCK_UNRESOLVED_MS, STUCK_TRAVEL_MAX, BURIED_DEPTH, BURIED_CONFIRM_MS,
  CLIP_CRASH_HOLD_MS, BOUNCE_SEPARATION, CLIP_SPAWN_GRACE_MS,
  setCraftAirframe, dirtClearance, craftVerticalOffset, craftVerticalHalf,
} from '../src/game/collide.js';
import { AIRFRAMES, airframeById } from '../configs/airframes.js';
import { FPV_FLOOR_CLEAR, FPV_NEAR_CLEAR, fpvLensClear } from '../src/render/lens.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `: ${detail}` : ''}`);
  }
}

/*
 * WHAT ENDS A RUN. The rule is a prop strike and nothing else, so these
 * checks are written as the owner's sentences rather than as coverage of
 * the branches: bounce off stuff as much as you like, crash only on the
 * props, hit with the base and bounce or perch.
 *
 * This lives in the builder's selftest because it is the only Node runnable
 * suite in the repository and collide.js imports cleanly here. The flight
 * harness is the plant's and this is not plant.
 */
function suiteCrashRule() {
  console.log('\ncrash rule');

  /* Belly on, at any speed at all. The frame takes it. */
  for (const closing of [1, 10, 25, 60]) {
    check(`belly on at ${closing} m/s bounces`,
      hitOutcome('gate', closing, 1.0) === 'bounce' || hitOutcome('gate', closing, 1.0) === 'hard');
  }
  check('and so does a contact just off the belly',
    hitOutcome('gate', 40, PROP_PLANE_MAX_UP_DOT) === 'hard'
    || hitOutcome('gate', 40, PROP_PLANE_MAX_UP_DOT) === 'bounce');

  /* Edge on, in the disc plane. Every hit is a bounce. 'hard' is OSD. */
  check('edge on at a racing clip still bounces',
    hitOutcome('gate', BOUNCE_SPEED_MAX - 0.1, 0) === 'bounce');
  check('edge on at the strike speed is a hard bounce, not a wreck',
    hitOutcome('gate', BOUNCE_SPEED_MAX, 0) === 'hard');
  check('a train is a hard bounce however you meet it',
    hitOutcome('train', 1, 1.0) === 'hard');
  check('and an untaught caller gets the hard reading past the threshold',
    hitOutcome('gate', BOUNCE_SPEED_MAX + 5) === 'hard');
  check('nothing returns crash any more',
    hitOutcome('gate', 80, 0) !== 'crash' && hitOutcome('train', 40, 0) !== 'crash');

  /* THE HIT COUNT IS GONE. Fifty firm contacts in a row, none of them a
   * wreck, and every one of them still flies on: "as much as i like". */
  let bounced = 0;
  for (let i = 0; i < 50; i += 1) {
    if (hitOutcome('gate', 12, 0) === 'bounce') {
      bounced += 1;
    }
  }
  check('fifty firm contacts, fifty bounces', bounced === 50, `${bounced}`);

  /* The ground. Perch, skip, tumble. None of them is a lockout. */
  check('a gentle arrival perches',
    groundOutcome(1.0, 1.0, 0) === GROUND_LAND);
  check('the perch envelope is the slow, upright one',
    groundOutcome(PERCH_SPEED - 0.01, 0, 0) === GROUND_LAND
    && groundOutcome(PERCH_SPEED + 0.01, 0, 0) === GROUND_SLIDE);
  check('arriving flat and hard SLIDES rather than wrecking',
    groundOutcome(LAND_DESCENT_MAX + 2, 0, 0) === GROUND_BOUNCE
    && GROUND_BOUNCE === GROUND_SLIDE);
  check('and so does arriving flat and fast across the ground',
    groundOutcome(0, LAND_HORIZONTAL_MAX + 5, 0) === GROUND_BOUNCE);
  check('a blade down with speed behind it is a tumble you fly out of',
    groundOutcome(0, LAND_TIP_SPEED_MAX + 1, LAND_TILT_MAX_DEG + 1) === GROUND_CRASH
    && GROUND_CRASH === GROUND_TUMBLE);
  check('a blade down while crawling is still a perch',
    groundOutcome(0.2, 0.2, LAND_TILT_MAX_DEG + 1) === GROUND_LAND);
  check('arriving on its side is a tumble at any speed',
    groundOutcome(0, 0, LAND_TILT_HARD_DEG + 1) === GROUND_CRASH);
  check('a very hard flat arrival is STILL not a wreck',
    groundOutcome(30, 30, 0) === GROUND_BOUNCE);

  check('the graze threshold is below the strike threshold',
    GRAZE_SPEED_MAX < BOUNCE_SPEED_MAX);

  check('canPerch is upright, slow, and quiet',
    canPerch(0, 0.5, 0.5) === true);
  check('canPerch refuses a bank past the blade-touch tilt',
    canPerch(LAND_TILT_MAX_DEG + 0.1, 0, 0) === false);
  check('canPerch refuses leftover bounce speed',
    canPerch(0, PERCH_SPEED + 0.01, 0) === false);
  check('canPerch refuses leftover rate',
    canPerch(0, 0, PERCH_RATE + 0.01) === false);

  check('turtle latches when inverted, slow, and on the grass',
    shouldEnterTurtle(-0.9, 0.4, 0.4, true, 0.05, false) === true);
  check('turtle does not latch while still sliding fast',
    shouldEnterTurtle(-1, TURTLE_SPEED, 0, true, 0.05, false) === false);
  check('turtle does not latch while tumbling at rate',
    shouldEnterTurtle(-1, 0, TURTLE_RATE, true, 0.05, false) === false);
  check('turtle does not latch in the air with clearance',
    shouldEnterTurtle(-0.8, 0.2, 0.2, false, 1.2, false) === false);
  check('turtle latches from the seated halo: an inverted rest reports no contact',
    shouldEnterTurtle(-0.8, 0.2, 0.2, false, 0.10, false) === true);
  check('turtle does not latch at the halo edge without contact',
    shouldEnterTurtle(-0.8, 0.2, 0.2, false, turtleClearance(), false) === false);
  check('turtle does not latch on its side: that is still a tumble',
    shouldEnterTurtle(0.2, 0, 0, true, 0.05, false) === false);
  check('turtle does not latch at a 60 degree bank',
    shouldEnterTurtle(0.49, 0, 0, true, 0.05, false) === false);
  check('just past vertical is still a tumble, not turtle',
    shouldEnterTurtle(-0.2, 0, 0, true, 0.05, false) === false);
  check('a belly-up hull past the invert gate does latch',
    shouldEnterTurtle(TURTLE_INVERT_UPZ - 0.01, 0, 0, true, 0.05, false) === true);
  check('a hull shy of the invert gate does not latch',
    shouldEnterTurtle(TURTLE_INVERT_UPZ, 0, 0, true, 0.05, false) === false);
  check('the invert gate is past vertical, about 110 degrees',
    TURTLE_INVERT_UPZ < -0.3 && TURTLE_INVERT_UPZ > -0.5);
  check('turtle parks while waiting, sticks centered, and in contact',
    shouldParkTurtle(true, 0, 0.2, true) === true);
  check('turtle does not park without contact',
    shouldParkTurtle(true, 0, 0, false) === false);
  check('turtle does not park while the stick is past the poke gate',
    shouldParkTurtle(true, TURTLE_STICK_MIN, 0, true) === false);
  check('turtle does not latch during launch staging',
    shouldEnterTurtle(-1, 0, 0, true, 0.05, true) === false);
  check('turtle does not latch once the hull is upright',
    shouldEnterTurtle(0.9, 0, 0, true, 0.05, false) === false);
  check('turtle stays waiting while still inverted',
    shouldExitTurtle(-0.9) === false);
  check('a poke past the gate is enough, it does not have to match the mixer',
    TURTLE_STICK_MIN <= 0.08);
  check('turtle wait-rate is below the enter-rate so leftover tumble is not seated',
    TURTLE_WAIT_RATE < TURTLE_RATE);
  check('the scripted flip has a duration',
    TURTLE_FLIP_MS > 200 && TURTLE_FLIP_MS < 800);
  check('turtle flip ease is 0 at the start and 1 at the end',
    turtleFlipEase(0) === 0 && turtleFlipEase(1) === 1);
  check('turtle flip ease is a midpoint at half',
    Math.abs(turtleFlipEase(0.5) - 0.5) < 1e-12);
  check('turtle lift is zero at the ends so the hull sits on the grass',
    turtleFlipLift(0) === 0 && turtleFlipLift(1) === 0);
  check('turtle lift peaks at mid-flip above the arm radius',
    turtleFlipLift(0.5) === turtleLift() && turtleLift() > 0.15);
  const qS0 = turtleSlerpQuat(0, 1, 0, 0, 1, 0, 0, 0, 0);
  check('turtle slerp starts at the inverted pose',
    Math.abs(qS0[0]) < 1e-12 && Math.abs(qS0[1] - 1) < 1e-12);
  const qS1 = turtleSlerpQuat(0, 1, 0, 0, 1, 0, 0, 0, 1);
  check('turtle slerp ends upright',
    Math.abs(qS1[0] - 1) < 1e-12 && Math.abs(qS1[1]) < 1e-12);
  const qSMid = turtleSlerpQuat(0, 1, 0, 0, 1, 0, 0, 0, 0.5);
  check('turtle slerp midpoint is 90 degrees about x',
    Math.abs(Math.abs(qSMid[0]) - Math.SQRT1_2) < 1e-9
      && Math.abs(Math.abs(qSMid[1]) - Math.SQRT1_2) < 1e-9
      && Math.abs(qSMid[2]) < 1e-12 && Math.abs(qSMid[3]) < 1e-12);

  const qId = uprightPlantQuat(1, 0, 0, 0);
  check('an already upright pose stays identity',
    Math.abs(qId[0] - 1) < 1e-12 && qId[1] === 0 && qId[2] === 0 && qId[3] === 0);
  const qInv = uprightPlantQuat(0, 1, 0, 0);
  check('180 about x flattens to identity, not a degenerate heading',
    Math.abs(qInv[0] - 1) < 1e-9 && Math.abs(qInv[1]) < 1e-12
      && Math.abs(qInv[2]) < 1e-12 && Math.abs(qInv[3]) < 1e-12);
  const qYaw = uprightPlantQuat(Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  check('a pure yaw is kept',
    Math.abs(qYaw[0] - Math.SQRT1_2) < 1e-9 && Math.abs(qYaw[3] - Math.SQRT1_2) < 1e-9
      && qYaw[1] === 0 && qYaw[2] === 0);
  const qFlip = uprightPlantQuat(0, 0, 1, 0);
  check('180 about y keeps the flipped heading',
    Math.abs(qFlip[0]) < 1e-9 && Math.abs(Math.abs(qFlip[3]) - 1) < 1e-9
      && qFlip[1] === 0 && qFlip[2] === 0);

  check('level flight keeps the small lens floor',
    fpvLensClear(0, 1) === FPV_FLOOR_CLEAR);
  check('camera down uses the near-plane band',
    fpvLensClear(-0.5, 0.8) === FPV_NEAR_CLEAR);
  check('inverted uses the near-plane band',
    fpvLensClear(0, -1) === FPV_NEAR_CLEAR);
  check('a high inverted look at the sky still names the near-plane band',
    fpvLensClear(0.4, -0.9) === FPV_NEAR_CLEAR);

  const grass = contactMaterial('none');
  const pvc = contactMaterial('gate');
  const bark = contactMaterial('tree');
  const train = contactMaterial('train');
  check('PVC is bouncier and slicker than bark',
    pvc.e > bark.e && pvc.mu < bark.mu);
  check('a train is the least bouncy solid',
    train.e < pvc.e && train.e < grass.e);

  const flat = () => 0;
  const airPass = {
    prev: { x: 0, y: 0.9, z: 2 },
    curr: { x: 0, y: 0.9, z: -2 },
  };
  check('a flown opening in the air still scores',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 1, clearance: 0.9, hits: 0, heightAt: flat,
    }) === true);
  check('an inverted punch in the air still scores',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: -0.8, clearance: 5, hits: 0, heightAt: flat,
    }) === true);
  check('inverted on the grass in a gate opening does not score',
    shouldScorePass({ x: 0, y: 0.08, z: 1.2 }, { x: 0, y: 0.04, z: -1.2 }, {
      upz: -1, clearance: 0.05, hits: 1, heightAt: flat,
    }) === false);
  check('inverted on the grass with no hit flag still does not score',
    shouldScorePass({ x: 0, y: 0.08, z: 1.2 }, { x: 0, y: 0.04, z: -1.2 }, {
      upz: -1, clearance: 0.08, hits: 0, heightAt: flat,
    }) === false);
  check('a side tumble on the dirt does not score',
    shouldScorePass({ x: 0, y: 0.10, z: 1.2 }, { x: 0, y: 0.06, z: -1.2 }, {
      upz: 0.35, clearance: 0.06, hits: 1, heightAt: flat,
    }) === false);
  /*
   * THESE TWO USED TO ASSERT THE OPPOSITE, and the second used to be called
   * "an upright bounce frame with no hit flag still does not score", which is
   * the owner's case by name: "its ok to bounce of the floor through a gate".
   * Props up on the deck is flight, with or without the hit flag, which a
   * bounce drops for a frame anyway.
   */
  check('an upright touch on the floor through the hole scores',
    shouldScorePass({ x: 0, y: 0.05, z: 1.2 }, { x: 0, y: 0.045, z: -1.2 }, {
      upz: 1, clearance: 0.045, hits: 1, heightAt: flat,
    }) === true);
  check('an upright bounce frame with no hit flag scores too',
    shouldScorePass({ x: 0, y: 0.05, z: 1.2 }, { x: 0, y: 0.045, z: -1.2 }, {
      upz: 1, clearance: 0.045, hits: 0, heightAt: flat,
    }) === true);
  /* The band is still pinned to the millimetre, on the side of it where it
   * is still the decision: a craft ON ITS SIDE, in and just out of the dirt. */
  check('on its side just inside the dirt band does not score',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 0.2, clearance: 0.219, hits: 0, heightAt: flat,
    }) === false);
  check('on its side just clear of the dirt band scores',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 0.2, clearance: 0.221, hits: 0, heightAt: flat,
    }) === true);
  check('upright just inside the dirt band scores, because it is a bounce',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 1, clearance: 0.219, hits: 0, heightAt: flat,
    }) === true);
  check('exactly at the tilt limit on the deck is still flight',
    shouldScorePass(airPass.prev, airPass.curr, {
      upz: 0.5, clearance: 0.10, hits: 1, heightAt: flat,
    }) === true);
  check('falling through the opening into the dirt does not score',
    shouldScorePass({ x: 0, y: 0.9, z: 1.2 }, { x: 0, y: -2, z: -1.2 }, {
      upz: -0.4, clearance: -2, hits: 0, heightAt: flat,
    }) === false);
  check('a dip onto the dirt mid segment does not score',
    shouldScorePass({ x: 0, y: 0.9, z: 1.2 }, { x: 0, y: 0.04, z: -1.2 }, {
      upz: -0.8, clearance: 0.9, hits: 0, heightAt: flat,
    }) === false);
  check('under a bridge the street is the floor and a flown pass still scores',
    shouldScorePass({ x: 0, y: 1.0, z: 1.2 }, { x: 0, y: 1.0, z: -1.2 }, {
      upz: 1, clearance: 1.0, hits: 0, heightAt: () => 0,
    }) === true);

  /*
   * THE DIRT BAND ON A WHOOP, which is the aircraft the band was never
   * measured for.
   *
   * Every check above runs with the five inch seated, and the first one here
   * pins that the five inch did not move when the band stopped being a flat
   * 0.22 m. The rest are the whoop's, which flies the five inch's plant.
   *
   * The airframe is seated and put back, because setCraftAirframe is module
   * state and every check after this one expects the five inch.
   */
  check('the five inch band is still exactly the 0.22 m it always was',
    Math.abs(dirtClearance() - 0.22) < 1e-12, dirtClearance());
  const fiveDims = airframeById('5inch').dims;
  setCraftAirframe(airframeById('whoop65').dims);
  const whoopBand = dirtClearance();
  /*
   * IT IS THE FIVE INCH'S BAND. This asked for a band a quarter of the five
   * inch's, because the whoop was a quarter of the aircraft. It is not any
   * more: it flies the five inch's plant, its dims ARE the five inch's, and
   * so is its band.
   */
  check('a whoop flies the five inch band, because it is a five inch',
    Math.abs(whoopBand - 0.22) < 1e-12, whoopBand);
  /* The low line through a ground gate, which is the line a whoop is for. */
  check('a whoop flying the low line through a ground gate scores',
    shouldScorePass({ x: 0, y: 0.10, z: 0.6 }, { x: 0, y: 0.10, z: -0.6 }, {
      upz: 1, clearance: 0.10, hits: 0, heightAt: flat,
    }) === true);
  check('a whoop at the height a five inch band called dirt scores',
    shouldScorePass({ x: 0, y: 0.15, z: 0.6 }, { x: 0, y: 0.15, z: -0.6 }, {
      upz: 1, clearance: 0.15, hits: 0, heightAt: flat,
    }) === true);
  /* And the accidents the band exists to refuse are still refused. */
  /* The owner's case, on the aircraft it was reported on: a whoop skipping off
   * the floor and out through a ground gate is a pass. */
  check('a whoop bouncing off the floor through a gate scores',
    shouldScorePass({ x: 0, y: 0.03, z: 0.6 }, { x: 0, y: 0.018, z: -0.6 }, {
      upz: 1, clearance: 0.018, hits: 1, heightAt: flat,
    }) === true);
  /* And the accidents the predicate exists for are still refused, on a band
   * a whoop's own size rather than a five inch's. */
  check('a whoop on its side on the floor still does not score',
    shouldScorePass({ x: 0, y: 0.03, z: 0.6 }, { x: 0, y: 0.02, z: -0.6 }, {
      upz: 0.1, clearance: 0.02, hits: 1, heightAt: flat,
    }) === false);
  check('a whoop inverted on the floor still does not score',
    shouldScorePass({ x: 0, y: 0.05, z: 0.6 }, { x: 0, y: 0.04, z: -0.6 }, {
      upz: -1, clearance: 0.04, hits: 1, heightAt: flat,
    }) === false);
  /* Just clear of the band, which is 0.22 m. */
  check('a whoop on its side just clear of its own band still scores',
    shouldScorePass({ x: 0, y: 0.25, z: 0.6 }, { x: 0, y: 0.25, z: -0.6 }, {
      upz: 0.1, clearance: 0.25, hits: 0, heightAt: flat,
    }) === true);
  /* The turtle halo and the flip hop, on the same aircraft and for the same
   * reason: both are the five inch's. */
  const whoopHalo = turtleClearance();
  check('a whoop flies the five inch halo, because it is a five inch',
    Math.abs(whoopHalo - 0.15) < 1e-12, whoopHalo);
  check('a whoop inverted on the floor still latches turtle',
    shouldEnterTurtle(-0.9, 0.2, 0.2, false, 0.02, false) === true);
  const whoopHop = turtleLift();
  check('a whoop flies the five inch hop, because it is a five inch',
    Math.abs(whoopHop - 0.18) < 1e-12, whoopHop);

  setCraftAirframe(fiveDims);
  check('the five inch is seated again for everything below',
    Math.abs(dirtClearance() - 0.22) < 1e-12, dirtClearance());
  check('and its turtle halo and hop are the flat numbers they always were',
    Math.abs(turtleClearance() - 0.15) < 1e-12 && Math.abs(turtleLift() - 0.18) < 1e-12,
    `${turtleClearance()} ${turtleLift()}`);

  const timing = new Race([{
    position: { x: 0, y: 0, z: 0 },
    heading: 0,
    pitch: 0,
    flyOrder: 0,
    apertures: [{ centreY: 2.5, clearW: 3.5, clearH: 5.0 }],
    aperture: { centreY: 2.5, clearW: 3.5, clearH: 5.0 },
  }]);
  const airSeg = { prev: { x: 0, y: 0.9, z: 2 }, curr: { x: 0, y: 0.9, z: -2 } };
  const dirtSeg = { prev: { x: 0, y: 0.08, z: 2 }, curr: { x: 0, y: 0.04, z: -2 } };
  timing.update(airSeg.prev, airSeg.curr, 10, 10);
  check('the first flown pass starts the clock, it does not finish a lap',
    timing.lap === 0 && timing.lapStartMs != null);
  const dirtAllow = shouldScorePass(dirtSeg.prev, dirtSeg.curr, {
    upz: -1, clearance: 0.05, hits: 1, heightAt: flat,
  });
  const dirtRes = timing.update(dirtSeg.prev, dirtSeg.curr, 20, 20, dirtAllow);
  check('inverted dirt through the timing hole is not a pass',
    dirtAllow === false && dirtRes.passed == null && timing.lap === 0);
  const later = timing.update(airSeg.prev, airSeg.curr, 30, 30, true);
  check('a later flown pass still completes the lap',
    later.passed != null && timing.lap === 1);
  check('one completed lap is what a 1-lap run would finish on, and only after a flown pass',
    timing.lap === 1 && timing.log.length === 1 && timing.log[0].ms != null);

  const three = new Race([{
    position: { x: 0, y: 0, z: 0 },
    heading: 0,
    pitch: 0,
    flyOrder: 0,
    apertures: [{ centreY: 2.5, clearW: 3.5, clearH: 5.0 }],
    aperture: { centreY: 2.5, clearW: 3.5, clearH: 5.0 },
  }]);
  const runLaps = 3;
  three.update(airSeg.prev, airSeg.curr, 10, 10);
  three.update(airSeg.prev, airSeg.curr, 20, 20);
  check('lap 1 of 3 is not the finished-track screen',
    three.lap === 1 && !(three.lap >= runLaps));
  const midDirt = shouldScorePass(dirtSeg.prev, dirtSeg.curr, {
    upz: -1, clearance: 0.05, hits: 0, heightAt: flat,
  });
  three.update(dirtSeg.prev, dirtSeg.curr, 30, 30, midDirt);
  check('inverted dirt mid run does not steal a lap on a 3-lap race',
    midDirt === false && three.lap === 1 && !(three.lap >= runLaps));
  three.update(airSeg.prev, airSeg.curr, 40, 40);
  check('lap 2 of 3 is still not the results screen',
    three.lap === 2 && !(three.lap >= runLaps));
  three.update(airSeg.prev, airSeg.curr, 50, 50);
  check('only the third flown lap would finish a 3-lap run',
    three.lap === 3 && three.lap >= runLaps);

  const free = new Race([]);
  const freeRes = free.update(airSeg.prev, airSeg.curr, 10, 10);
  check('a freestyle map never scores a gate',
    free.freestyle === true && freeRes.passed == null && free.lap === 0);

  const diveDirt = shouldScorePass(
    { x: 0, y: 0.08, z: 1.2 }, { x: 0, y: 0.04, z: -1.2 },
    { upz: -0.6, clearance: 0.04, hits: 0, heightAt: flat },
  );
  check('dirt through a dive-height opening still does not score',
    diveDirt === false);
}

/*
 * Clip-through catch. The adversarial cases are the point: a bounce, a
 * perch, a turtle, a wall scrape and a roof sit must never reset the
 * craft. Only a centre inside a solid, a leftover overlap that is not
 * travelling, or a fall through the terrain.
 */
function clipSample(over) {
  return {
    landed: false,
    turtle: false,
    launchStaging: false,
    hold: false,
    poseLock: false,
    spawnGrace: false,
    takingOff: false,
    unresolved: false,
    roofContact: false,
    interiorDepth: 0,
    buriedDepth: 0,
    x: 0,
    y: 1,
    z: 0,
    ...over,
  };
}

function tickClip(watch, sample, ms, dt = 16) {
  let last = null;
  let t = 0;
  while (t < ms) {
    last = clipWatchTick(watch, sample, dt);
    t += dt;
    if (last) {
      return last;
    }
  }
  return last;
}

function suiteClipCatch() {
  console.log('\nclip catch');

  check('confirm is longer than one hitch plus a leftover frame',
    CLIP_CONFIRM_MS > 100 + 32);
  check('deep inside is thicker than bounce slop and thinner than a wall',
    CLIP_DEEP > CLIP_CENTER_EPS && CLIP_DEEP < 0.20);
  check('spawn grace is shorter than a hang, longer than one bounce',
    CLIP_SPAWN_GRACE_MS > 100 && CLIP_SPAWN_GRACE_MS < CLIP_CRASH_HOLD_MS);
  check('stuck wait is longer than a violent bounce',
    STUCK_UNRESOLVED_MS > CLIP_CONFIRM_MS);
  check('centre epsilon sits past the bounce gap',
    CLIP_CENTER_EPS > BOUNCE_SEPARATION);
  check('the hold is a beat, not the old 1.4 s lockout',
    CLIP_CRASH_HOLD_MS >= 400 && CLIP_CRASH_HOLD_MS < 1400);

  const box = new Colliders();
  box.addBox('wall', 0, 0, 0, 2, 2, 2);
  box.build();
  box.hit(1, 1, 1, 1, 1, 1, 0.04);
  check('the centre of a wall box is inside',
    box.interiorOfHit(1, 1, 1) > 0.99);
  check('a point on the face is not inside',
    Math.abs(box.interiorOfHit(2, 1, 1)) < 1e-9);
  check('a point outside is negative',
    box.interiorOfHit(3, 1, 1) < -0.99 && box.interiorOfHit(3, 1, 1) > -1.01);
  check('a hull-overlap centre 5 cm outside is still outside',
    box.interiorOfHit(2.05, 1, 1) < -0.04);

  /*
   * THE HULL IS A SPAN, NOT A RADIUS, and each airframe's is its own.
   *
   * The swept ellipsoid used to be centred on the CG with one semi-axis used
   * both ways, chosen to cover whichever extent was larger. On the five inch
   * that is nearly true, 45 mm of hull below and 38 mm of prop plane above.
   * On the whoop it is not: 10 mm of duct below and 18 mm of canopy above, so
   * mirroring the canopy hung 8 mm of collider under a machine with nothing
   * there, which is what the pilot reported as a large hit box below the
   * whoop.
   *
   * These walk a level craft onto a slab and read off where it first touches,
   * which is the reach itself, and they pin it against the SPAN THE AIRFRAME
   * DECLARES rather than against a number typed here, so an airframe added
   * later is measured against its own figures. The declared spans in turn are
   * plant.c's hull_hz_down and hull_hz_up, which is what makes the collider
   * and the plant the same machine.
   */
  function reachRig() {
    const c = new Colliders();
    c.addBox('wall', -5, -1, -5, 5, 0, 5);   /* a floor slab, top at y = 0 */
    c.addBox('wall', -5, 1, -5, 5, 3, 5);    /* a ceiling slab, bottom at y = 1 */
    c.build();
    return c;
  }
  /* qw = 1 is level, qx = 1 is a half turn about x, which is inverted. */
  function firstTouch(c, from, to, inverted) {
    const vh = craftVerticalHalf(0);
    const vo = craftVerticalOffset();
    const qx = inverted ? 1 : 0;
    const qw = inverted ? 0 : 1;
    const n = 20000;
    for (let i = 0; i <= n; i += 1) {
      const y = from + (to - from) * (i / n);
      if (c.hit(0, y, 0, 0, y, 0, vh, qx, 0, 0, qw, vo) >= 0) {
        return y;
      }
    }
    return null;
  }
  const fiveBefore = airframeById('5inch').dims;
  for (const frame of AIRFRAMES) {
    setCraftAirframe(frame.dims);
    const rig = reachRig();
    /* Each walk starts clear of its slab for any reach up to 0.45 m, the
     * Kadet Senior's 0.307 below its CG included, and clear of the other
     * slab for any reach the other way up to 0.45 as well. */
    const down = firstTouch(rig, 0.45, 0.0, false);
    const up = 1 - firstTouch(rig, 0.55, 1.0, false);
    const invDown = firstTouch(rig, 0.45, 0.0, true);
    const invUp = 1 - firstTouch(rig, 0.55, 1.0, true);
    const d = frame.dims.vHalfDown;
    const u = frame.dims.vHalfUp;
    check(`${frame.id}: the hull reaches exactly its declared ${d} m below`,
      Math.abs(down - d) < 1e-3, down);
    check(`${frame.id}: the hull reaches exactly its declared ${u} m above`,
      Math.abs(up - u) < 1e-3, up);
    check(`${frame.id}: inverted, the span turns over with the craft`,
      Math.abs(invDown - u) < 1e-3 && Math.abs(invUp - d) < 1e-3,
      `${invDown} below, ${invUp} above`);
  }
  /*
   * The whoop's is the one the report was about, named rather than left to
   * the loop, because the defect was specifically that its floor reach was
   * its CANOPY height.
   *
   * IT IS THE FIVE INCH'S REACH NOW, and the asymmetry the original defect
   * was about is still the thing being asserted. The whoop flies the five
   * inch's plant, so its down extent is that plant's 45 mm, the height it
   * actually rests at; its UP extent is the drawn canopy through the room's
   * factor, 61.7 mm, because nothing rests a craft on its canopy and what
   * reads that number is a collider deciding whether the top of the aircraft
   * met a bar. So the two are still different, still in the right order, and
   * still each owned by the thing that has a claim on them.
   */
  setCraftAirframe(airframeById('whoop65').dims);
  const whoopRig = reachRig();
  const whoopDown = firstTouch(whoopRig, 0.30, 0.0, false);
  const whoopUp = 1 - firstTouch(whoopRig, 0.70, 1.0, false);
  check('a whoop rests on the plant\'s 45 mm, which is what it settles at',
    Math.abs(whoopDown - 0.045) < 1e-3, whoopDown);
  check('and it still does not carry its canopy height under it',
    whoopUp > whoopDown, `${whoopUp} above, ${whoopDown} below`);
  setCraftAirframe(fiveBefore);

  const post = new Colliders();
  post.addPost('pole', 0, 0, 0, 2, 0.05);
  post.build();
  post.hit(0, 1, 0, 0, 1, 0, 0.04);
  check('the axis of a thin post is inside',
    post.interiorOfHit(0, 1, 0) > 0.049);
  check('a centimetre off a 5 cm post is still inside',
    post.interiorOfHit(0.01, 1, 0) > 0.03);
  check('past the bark is outside',
    post.interiorOfHit(0.08, 1, 0) < 0);

  const train = new Colliders();
  train.build();
  const car = train.addMoving('train', 1, 0.5, 2);
  train.seatMoving(car, 10, 1, 0);
  train.hit(10, 1, 0, 10, 1, 0, 0.04);
  check('the centre of a train car is inside',
    train.interiorOfHit(10, 1, 0) > 0.49);

  const wall = new Colliders();
  wall.addBox('wall', -0.1, 0, 0, 0.1, 2, 4);
  wall.build();
  wall.hit(-1, 1, 2, 1, 1, 2, 0.04);
  check('a chord through a wall is a far-face cross',
    wall.crossedHit(-1, 1, 2, 1, 1, 2) === true);
  check('a bounce that stays on the entry side is not a cross',
    wall.crossedHit(-1, 1, 2, -0.12, 1, 2) === false);
  check('a far-side eject after that chord is still a cross',
    wall.crossedHit(-1, 1, 2, 0.12, 1, 2) === true);
  check('a fly-by along the wall is not a cross',
    wall.crossedHit(-1, 1, -1, -1, 1, 5) === false);
  check('flying over a wall is not a cross',
    wall.crossedHit(-1, 3, 2, 1, 3, 2) === false);
  check('going around a wall corner is not a cross',
    wall.crossedHit(-1, 1, -0.5, 0.5, 1, -1) === false);

  const deck = new Colliders();
  deck.addBox('wall', -2, 0.50, -2, 2, 0.64, 2);
  deck.build();
  deck.hit(0, 3, 0, 0, -1, 0, 0.04);
  check('a long drop through a 14 cm deck is a far-face cross',
    deck.crossedHit(0, 3, 0, 0, -1, 0) === true);
  check('and the midpoint of that drop is not inside the slab',
    deck.interiorOfHit(0, 1, 0) < 0);
  check('landing on that deck is not a cross',
    deck.crossedHit(0, 3, 0, 0, 0.72, 0) === false);
  check('flying over that deck is not a cross',
    deck.crossedHit(-3, 2, 0, 3, 2, 0) === false);
  check('flying under that deck is not a cross',
    deck.crossedHit(-3, 0.3, 0, 3, 0.3, 0) === false);

  post.hit(-1, 1, 0, 1, 1, 0, 0.04);
  check('a chord through a post is a cross',
    post.crossedHit(-1, 1, 0, 1, 1, 0) === true);
  check('a bounce that stays on the entry side of a post is not a cross',
    post.crossedHit(-1, 1, 0, -0.08, 1, 0) === false);
  check('a far-side eject off a post after a long approach is a cross',
    post.crossedHit(-10, 1, 0, 0.08, 1, 0) === true);
  check('a fly-by 20 cm off a post is not a cross',
    post.crossedHit(-1, 1, 0.20, 1, 1, 0.20) === false);

  train.hit(8, 1, 0, 12, 1, 0, 0.04);
  check('a chord through a train car is a far-face cross',
    train.crossedHit(8, 1, 0, 12, 1, 0) === true);
  check('a scrape along the outside of a train car is not a cross',
    train.crossedHit(12.2, 1, -4, 12.2, 1, 4) === false);

  const air = makeClipWatch();
  check('open air never fires',
    tickClip(air, clipSample({}), 1000) === null);

  const bounce = makeClipWatch();
  check('one leftover frame does not fire',
    clipWatchTick(bounce, clipSample({ unresolved: true, x: 0, y: 1, z: 0 }), 16) === null);
  check('and a bounce that then clears stays quiet',
    tickClip(bounce, clipSample({ unresolved: false }), 1000) === null);

  const graze = makeClipWatch();
  check('a 50 ms graze leftover does not fire',
    tickClip(graze, clipSample({ unresolved: true }), 50) === null);

  const hull = makeClipWatch();
  check('props overlapping with the centre outside is not a clip',
    tickClip(hull, clipSample({
      unresolved: false,
      interiorDepth: -0.05,
    }), CLIP_CONFIRM_MS + 80) === null);

  const perch = makeClipWatch();
  check('a perch leftover on the grass is not stuck',
    tickClip(perch, clipSample({
      landed: true,
      unresolved: true,
      interiorDepth: 0,
    }), STUCK_UNRESOLVED_MS + 200) === null);
  check('and a perch 40 cm in the dirt is not buried',
    tickClip(perch, clipSample({
      landed: true,
      buriedDepth: 0.4,
    }), BURIED_CONFIRM_MS + 80) === null);
  check('but a perch whose centre is inside a wall still crashes',
    tickClip(makeClipWatch(), clipSample({
      landed: true,
      interiorDepth: 0.2,
    }), CLIP_CONFIRM_MS) === 'inside');

  const turtle = makeClipWatch();
  check('turtle leftover on the grass is not stuck',
    tickClip(turtle, clipSample({
      turtle: true,
      unresolved: true,
      interiorDepth: 0,
    }), STUCK_UNRESOLVED_MS + 200) === null);
  check('but turtle whose centre is inside a solid still crashes',
    tickClip(makeClipWatch(), clipSample({
      turtle: true,
      interiorDepth: 0.2,
    }), CLIP_CONFIRM_MS) === 'inside');

  const launch = makeClipWatch();
  check('launch staging skip never fires',
    tickClip(launch, clipSample({
      launchStaging: true,
      interiorDepth: 0.3,
      unresolved: true,
    }), 2000) === null);

  const lock = makeClipWatch();
  check('a harness pose lock skip never fires',
    tickClip(lock, clipSample({
      poseLock: true,
      interiorDepth: 0.5,
    }), 2000) === null);

  const hold = makeClipWatch();
  check('already holding a crash skip never fires again',
    tickClip(hold, clipSample({
      hold: true,
      interiorDepth: 0.5,
      unresolved: true,
    }), 2000) === null);

  const roof = makeClipWatch();
  check('sitting on a roof leftover is not stuck',
    tickClip(roof, clipSample({
      unresolved: true,
      roofContact: true,
      interiorDepth: 0,
    }), STUCK_UNRESOLVED_MS + 200) === null);
  check('falling through a roof, centre inside, is still a clip',
    tickClip(makeClipWatch(), clipSample({
      unresolved: true,
      roofContact: false,
      interiorDepth: 0.12,
    }), CLIP_CONFIRM_MS) === 'inside');
  check('a roof flag does not mute a centre already through the slab',
    clipWatchTick(makeClipWatch(), clipSample({
      roofContact: true,
      unresolved: true,
      interiorDepth: CLIP_DEEP,
    }), 16) === 'inside');

  const scrape = makeClipWatch();
  let scrapeHit = null;
  const scrapeDt = 16;
  const scrapeMs = STUCK_UNRESOLVED_MS + 80;
  let sx = 0;
  for (let t = 0; t < scrapeMs; t += scrapeDt) {
    sx += 10 * (scrapeDt / 1000);
    scrapeHit = clipWatchTick(scrape, clipSample({
      unresolved: true,
      x: sx,
      y: 1,
      z: 0,
    }), scrapeDt);
    if (scrapeHit) {
      break;
    }
  }
  check('a 10 m/s wall scrape does not fire',
    scrapeHit === null, scrapeHit);

  const slowSlide = makeClipWatch();
  let slowHit = null;
  let slx = 0;
  const slowDt = 16;
  for (let t = 0; t < STUCK_UNRESOLVED_MS + 80; t += slowDt) {
    slx += 5 * (slowDt / 1000);
    slowHit = clipWatchTick(slowSlide, clipSample({
      unresolved: true,
      x: slx,
      y: 1,
      z: 0,
    }), slowDt);
    if (slowHit) {
      break;
    }
  }
  check('a 5 m/s leftover slide still travels past the stuck gate',
    slowHit === null, slowHit);

  const takeoff = makeClipWatch();
  check('a takeoff 5 cm in the grass is not buried',
    tickClip(takeoff, clipSample({
      takingOff: true,
      buriedDepth: 0.05,
    }), BURIED_CONFIRM_MS + 80) === null);

  const shallow = makeClipWatch();
  check('10 cm below the terrain is not buried',
    tickClip(shallow, clipSample({ buriedDepth: 0.10 }), BURIED_CONFIRM_MS + 80) === null);

  const oneFrame = makeClipWatch();
  check('a single 16 ms shallow clip-through frame does not fire',
    clipWatchTick(oneFrame, clipSample({ interiorDepth: 0.04 }), 16) === null);

  const hitch = makeClipWatch();
  check('one 100 ms hitch shallow-inside still needs more time',
    clipWatchTick(hitch, clipSample({ interiorDepth: 0.04 }), 100) === null);
  check('a leftover 32 ms plus a hitch still sits under confirm',
    clipWatchTick(hitch, clipSample({ interiorDepth: 0.04 }), 32) === null);

  const deep = makeClipWatch();
  check('a centre 10 cm inside fires on the first frame',
    clipWatchTick(deep, clipSample({ interiorDepth: 0.10 }), 16) === 'inside');

  const inside = makeClipWatch();
  check('a centre 4 cm inside for the confirm window is a crash',
    tickClip(inside, clipSample({ interiorDepth: 0.04 }), CLIP_CONFIRM_MS) === 'inside');

  const thin = makeClipWatch();
  check('a centimetre inside a post past epsilon is a crash',
    tickClip(thin, clipSample({ interiorDepth: CLIP_CENTER_EPS + 0.002 }), CLIP_CONFIRM_MS + 16) === 'inside');

  /*
   * THE STUCK GATE ASKS ABOUT THE CENTRE, and these two cases are how that
   * is stated. They used to assert the opposite and had been failing since
   * the rule changed under them.
   *
   * The old rule was "still overlapping for 350 ms without moving 40 cm",
   * with no test on how deep. That is the definition of a WALL RIDE, and it
   * fired on one: flown head on at the town's training wall through
   * Betaflight and the plant, six approaches from 4.0 to 11.3 m/s produced
   * six crashes, every one of them clipCrashKind 'stuck' and not one of them
   * a Wall Tap. So the gate gained the depth test its own comment had always
   * described, and these two cases were left behind asserting the version
   * that caused it.
   *
   * Restated: leftover overlap alone is a bounce that has not finished, and
   * the craft flies out of it. A CENTRE through the face that is going
   * nowhere is the crash.
   */
  const jammed = makeClipWatch();
  check('leftover overlap alone is not stuck, however long it lasts',
    tickClip(jammed, clipSample({
      unresolved: true,
      x: 0,
      y: 1,
      z: 0,
    }), STUCK_UNRESOLVED_MS * 3) === null);

  /*
   * AND THE CENTRE INSIDE IS A CRASH, NAMED 'inside' RATHER THAN 'stuck'.
   *
   * Worth writing down, because it means the 'stuck' branch is now
   * unreachable. Both gates want the same thing, `unresolved` with the
   * centre past CLIP_CENTER_EPS, and both reset together the moment the
   * craft is no longer inside; but inside confirms after CLIP_CONFIRM_MS
   * and stuck after STUCK_UNRESOLVED_MS, and 180 is less than 350, so any
   * run long enough to be stuck was called inside a fifth of a second
   * earlier. That is the right answer either way, since 'inside' names the
   * cause more precisely, and the branch is left where it is rather than
   * deleted on a test's say so. See PROGRESS.md.
   */
  const jammedIn = makeClipWatch();
  check('but a centre through the face that is going nowhere is a crash',
    tickClip(jammedIn, clipSample({
      unresolved: true,
      interiorDepth: CLIP_CENTER_EPS + 0.004,
      x: 0,
      y: 1,
      z: 0,
    }), STUCK_UNRESOLVED_MS) === 'inside');

  const jitter = makeClipWatch();
  let jitterHit = null;
  for (let t = 0, n = 0; t < STUCK_UNRESOLVED_MS + 16; t += 16, n += 1) {
    jitterHit = clipWatchTick(jitter, clipSample({
      unresolved: true,
      interiorDepth: CLIP_CENTER_EPS + 0.004,
      x: (n % 2) * 0.04,
      y: 1,
      z: 0,
    }), 16);
    if (jitterHit) {
      break;
    }
  }
  check('centimetre jitter with the centre inside is a crash',
    jitterHit === 'inside', jitterHit);

  const jitterOut = makeClipWatch();
  let jitterOutHit = null;
  for (let t = 0, n = 0; t < STUCK_UNRESOLVED_MS * 2; t += 16, n += 1) {
    jitterOutHit = clipWatchTick(jitterOut, clipSample({
      unresolved: true,
      x: (n % 2) * 0.04,
      y: 1,
      z: 0,
    }), 16);
    if (jitterOutHit) {
      break;
    }
  }
  check('and the same jitter with the centre outside is a pilot on a wall',
    jitterOutHit === null, jitterOutHit);

  const buried = makeClipWatch();
  check('22 cm under the terrain for the bury window is a crash',
    tickClip(buried, clipSample({ buriedDepth: BURIED_DEPTH }), BURIED_CONFIRM_MS) === 'buried');

  const both = makeClipWatch();
  check('inside wins when both inside and stuck apply',
    tickClip(both, clipSample({
      interiorDepth: 0.2,
      unresolved: true,
    }), CLIP_CONFIRM_MS) === 'inside');

  const recover = makeClipWatch();
  tickClip(recover, clipSample({ interiorDepth: 0.04 }), CLIP_CONFIRM_MS - 32);
  check('leaving the solid mid-window forgets the count',
    clipWatchTick(recover, clipSample({ interiorDepth: 0 }), 16) === null);
  check('and the next clip has to confirm again',
    tickClip(recover, clipSample({ interiorDepth: 0.04 }), CLIP_CONFIRM_MS - 16) === null);

  const hullStuck = makeClipWatch();
  check('leftover hull overlap with the centre 5 cm outside is not stuck',
    tickClip(hullStuck, clipSample({
      unresolved: true,
      interiorDepth: -0.05,
      x: 0,
      y: 1,
      z: 0,
    }), STUCK_UNRESOLVED_MS + 80) === null);

  const crawl = makeClipWatch();
  let crawlHit = null;
  let cx = 0;
  for (let t = 0; t < STUCK_UNRESOLVED_MS + 80; t += 16) {
    cx += 1.0 * (16 / 1000);
    crawlHit = clipWatchTick(crawl, clipSample({
      unresolved: true,
      interiorDepth: -0.05,
      x: cx,
      y: 1,
      z: 0,
    }), 16);
    if (crawlHit) {
      break;
    }
  }
  check('a 1 m/s leftover crawl with the centre outside is not stuck',
    crawlHit === null, crawlHit);

  const fall = makeClipWatch();
  check('falling through the world still buries even if takingOff is latched',
    tickClip(fall, clipSample({
      takingOff: true,
      buriedDepth: 2.0,
    }), BURIED_CONFIRM_MS) === 'buried');

  const grace = makeClipWatch();
  check('spawn grace ignores a centre inside a pad leftover',
    tickClip(grace, clipSample({
      spawnGrace: true,
      landed: true,
      interiorDepth: 0.2,
      unresolved: true,
      buriedDepth: 0.4,
    }), 2000) === null);
  check('spawn grace does not mute a deep clip once airborne',
    clipWatchTick(makeClipWatch(), clipSample({
      spawnGrace: false,
      landed: false,
      interiorDepth: 0.10,
    }), 16) === 'inside');

  const fifty = makeClipWatch();
  let bounceFires = 0;
  for (let i = 0; i < 50; i += 1) {
    if (clipWatchTick(fifty, clipSample({ unresolved: true }), 16)) {
      bounceFires += 1;
    }
    clipWatchTick(fifty, clipSample({ unresolved: false }), 16);
  }
  check('fifty firm contacts that each clear, fifty not-crashes',
    bounceFires === 0, `${bounceFires}`);

  check('stuck travel max is under a slow crawl along a wall',
    STUCK_TRAVEL_MAX < 5 * (STUCK_UNRESOLVED_MS / 1000));
}

console.log('crash rules self test');
suiteCrashRule();
suiteClipCatch();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
