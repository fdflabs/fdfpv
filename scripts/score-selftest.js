/*
 * score-selftest.js: the freestyle scoring chain, end to end, in Node.
 *
 * Proves four things with no browser: the trick catalogue (src/game/tricks.js)
 * is the owner's workbook transcribed exactly; the recogniser
 * (src/game/trickdetect.js) names the right tricks from synthetic rate traces,
 * from constructed paths around obstacles and from flights of the real
 * compiled plant; the scorer (src/game/score.js) reaches hand computed totals;
 * and the obstacle field (src/game/obstacles.js) finds, merges and derives what
 * the recogniser needs.
 *
 * Every stimulus is fixed down to the operation order, and the plant flights
 * keep their accumulated clocks and seeded generator, because a nearby flight
 * is not the same evidence: thresholds sit close to these numbers, and other
 * tools digest the detector calls this script makes.
 *
 * One line per check. The exit code is the number of failed checks.
 *
 * Run with npm run score:selftest.
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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TRICKS, BUILDING_BLOCKS, EXECUTION, OBSTACLE_BONUS, REPEAT_TRICK, REPEAT_OBSTACLE,
  backToBackFactor, obstacleBonusMultiplier, repeatTrickFactor, trickNames, trickPoints,
} from '../src/game/tricks.js';
import {
  PATTERNS, TrickDetector, snapTurns, snapPathTurns, AXIS_ROLL, AXIS_PITCH, AXIS_YAW,
} from '../src/game/trickdetect.js';
import { ObstacleField, OB_BAR, OB_POLE, deriveObstacles, sameAxis } from '../src/game/obstacles.js';
import { FreestyleScore, formatScore, RUN_MS } from '../src/game/score.js';
import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { simPosToThree } from '../src/render/frame.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TURN = 6.283185307179586;

let failures = 0;
let sections = 0;

function section(title) {
  console.log(sections === 0 ? title : `\n${title}`);
  sections += 1;
}

function check(label, ok) {
  if (!ok) {
    failures += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}`);
}

function note(text) {
  console.log(`        ${text}`);
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const names = (list) => list.map((t) => t.name).join(' + ');
const graded = (list) => list.map((t) => `${t.name}:${t.execution}`).join(' + ');

/* ------------------------------------------------------------------ */

section('the catalogue is the workbook');
{
  const book = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/freestyle-scoring/twp-calculator.json'), 'utf8'));
  const trickByName = new Map(TRICKS.map((t) => [t.name, t]));

  check('as many outdoor tricks as the workbook lists', TRICKS.length === book.outdoorTricks.length);
  const wrongTricks = book.outdoorTricks.filter((row) => {
    const t = trickByName.get(row.trick);
    return !t || t.points !== row.points || t.category !== row.category || t.difficulty !== row.difficulty;
  });
  for (const row of wrongTricks) {
    note(`differs from the workbook: ${row.trick}`);
  }
  check('every outdoor trick has the workbook points, category and difficulty', wrongTricks.length === 0);

  const blockByName = new Map(BUILDING_BLOCKS.map((t) => [t.name, t]));
  check('as many building blocks as the workbook lists', BUILDING_BLOCKS.length === book.buildingBlocks.length);
  const wrongBlocks = book.buildingBlocks.filter((row) => blockByName.get(row.trick)?.points !== row.points);
  check('every building block has the workbook points', wrongBlocks.length === 0);

  // The workbook repeats some grades; the first row that states a value is the one that counts.
  const adj = new Map();
  for (const row of book.trickExecution) {
    if (row.pointAdj != null && !adj.has(row.execution)) {
      adj.set(row.execution, row.pointAdj);
    }
  }
  let wrongGrades = 0;
  for (const [grade, value] of adj) {
    if (!(grade in EXECUTION)) {
      continue;
    }
    if (!near(EXECUTION[grade].points, value)) {
      wrongGrades += 1;
      note(`grade ${grade}: catalogue ${EXECUTION[grade].points}, workbook ${value}`);
    }
  }
  check('every execution grade the catalogue knows has the workbook adjustment', wrongGrades === 0);

  check('the repeat trick factor matches every workbook row',
    book.repeatTrickPenalty.every(([priors, factor]) => near(repeatTrickFactor(priors), factor)));
  // Rows where the workbook bottomed out at zero are its floor, not the halving rule.
  check('the back to back factor matches every nonzero workbook row',
    book.backToBackPenalty.every(([n, factor]) => factor === 0 || near(backToBackFactor(n), factor, 1e-12)));
  let wrongBonus = 0;
  for (const row of book.obstacleBonus) {
    if (!near(obstacleBonusMultiplier(row.switches), row.multiplier)) {
      wrongBonus += 1;
      note(`obstacle bonus off at ${row.switches} switches`);
    }
  }
  check('the obstacle bonus multiplier matches every workbook row', wrongBonus === 0);
  check('the repeat obstacle ladder is 1,1,1,1,0.66,0.33,0', REPEAT_OBSTACLE.join() === '1,1,1,1,0.66,0.33,0');
  check('the repeat trick ladder is 1,0.75,0.5,0', REPEAT_TRICK.join() === '1,0.75,0.5,0');
  check('the obstacle bonus table starts at zero switches', OBSTACLE_BONUS[0][0] === 0);
}

/* ------------------------------------------------------------------ */

section('every pattern names a real trick');
{
  const known = new Set(trickNames());
  const unknown = PATTERNS.filter((p) => !known.has(p.name));
  for (const p of unknown) {
    note(`pattern names an unknown trick: ${p.name}`);
  }
  check('each pattern name is in the catalogue', unknown.length === 0);
  let threw = false;
  try {
    trickPoints('Backflip McTwist');
  } catch {
    threw = true;
  }
  check('asking the points of an unknown trick throws', threw);
}

/* ------------------------------------------------------------------ */

section('attitude snaps to the quarter');
{
  const AXIS = { roll: AXIS_ROLL, pitch: AXIS_PITCH, yaw: AXIS_YAW };
  const cases = [
    [1.033, 'roll', 1, 1, 1, 'a slightly long roll is one'],
    [0.944, 'roll', 1, 1, 1, 'a slightly short roll is one'],
    [0.544, 'roll', 1, -1, 0.5, 'a long half roll that ends inverted is a half'],
    [0.444, 'roll', 1, -1, 0.5, 'a short half roll that ends inverted is a half'],
    [1.98, 'pitch', 1, 1, 2, 'a near double flip is two'],
    [0.51, 'yaw', 1, 1, 0.5, 'yaw takes the nearest quarter'],
    [0.08, 'roll', 1, 1, 0, 'a twitch is nothing'],
    [-1.02, 'roll', 1, 1, 1, 'direction does not matter'],
    [0.998, 'pitch', -1, -1, 1, 'an inverted whole flip is one, not a half'],
    [1.15, 'pitch', -1, -1, 1, 'an overshot inverted flip is still one'],
    [0.53, 'pitch', -1, 1, 0.5, 'inverted to upright is a half'],
    [0.27, 'roll', 1, 0, 0.25, 'upright to the side is a quarter'],
    [0.72, 'roll', 1, 0, 0.75, 'upright to the side the long way is three quarters'],
    [0.51, 'roll', 0, 1, 0.5, 'a start on the side takes the nearest quarter'],
  ];
  for (const [raw, axis, start, end, want, label] of cases) {
    check(`${label} (${raw} ${axis} gives ${want})`, snapTurns(raw, AXIS[axis], start, end) === want);
  }
}

/* ------------------------------------------------------------------ */

/*
 * The synthetic rate rig. Each move ramps up over 60 ms, holds, ramps down and
 * settles, one detector step per millisecond. The attitude carries across
 * moves on purpose: resetting it per move once hid a real snap defect.
 */
const RAMP = 60;

function upZAfter(axis, turns, up) {
  if (axis === AXIS_YAW) {
    return up;
  }
  const frac = Math.abs(turns) % 1;
  if (frac > 0.375 && frac < 0.625) {
    return -up;
  }
  if (frac < 0.125 || frac > 0.875) {
    return up;
  }
  return 0;
}

function fly(moves) {
  const got = [];
  const det = new TrickDetector((t) => got.push(t));
  let up = 1;
  // qx is 0 and qy is sqrt((1 - upZ) / 2): that quaternion has exactly the wanted up component.
  const tick = (axis, rate, upZ, speed) => det.step(
    0.001,
    axis === AXIS_ROLL ? rate : 0,
    axis === AXIS_PITCH ? rate : 0,
    axis === AXIS_YAW ? rate : 0,
    0, Math.sqrt(Math.max(0, (1 - upZ) / 2)), speed,
  );
  for (const m of moves) {
    if (m.wait !== undefined) {
      const upZ = m.upZ !== undefined ? m.upZ : up;
      const speed = m.speed !== undefined ? m.speed : 12;
      for (let i = 0; i < m.wait; i += 1) {
        tick(null, 0, upZ, speed);
      }
      continue;
    }
    const peak = m.rate ?? 14;
    const speed = m.speed ?? 12;
    const gap = m.gap ?? 120;
    const sign = m.turns < 0 ? -1 : 1;
    const total = Math.abs(m.turns) * TURN;
    const rampArea = peak * (RAMP / 1000);
    const holdMs = Math.max(1, Math.round(((total - rampArea) / peak) * 1000));
    const endUp = upZAfter(m.axis, m.turns, up);
    for (let i = 0; i < RAMP; i += 1) {
      tick(m.axis, sign * peak * (i / RAMP), up, speed);
    }
    const midUp = m.axis === AXIS_YAW ? up : 0;
    for (let i = 0; i < holdMs; i += 1) {
      tick(m.axis, sign * peak, midUp, speed);
    }
    for (let i = RAMP; i >= 1; i -= 1) {
      tick(m.axis, sign * peak * (i / RAMP), endUp, speed);
    }
    for (let i = 0; i < gap; i += 1) {
      tick(m.axis, 0, endUp, speed);
    }
    up = endUp;
  }
  det.flush(up);
  return got;
}

const R = (turns, more) => ({ axis: AXIS_ROLL, turns, ...more });
const P = (turns, more) => ({ axis: AXIS_PITCH, turns, ...more });
const Y = (turns, more) => ({ axis: AXIS_YAW, turns, ...more });

section('the recogniser on flown rate traces');
{
  const named = [
    ['one roll is a Roll', [R(1)], 'Roll'],
    ['one flip is a Flip', [P(1)], 'Flip'],
    ['one yaw turn is a Yaw Spin', [Y(1)], 'Yaw Spin'],
    ['two rolls are a Double Roll', [R(2)], 'Double Roll'],
    ['two flips are a Double Flip', [P(2)], 'Double Flip'],
    ['half a roll is the 1/2 Roll block', [R(0.5)], '1/2 Roll'],
  ];
  for (const [label, moves, want] of named) {
    check(label, names(fly(moves)) === want);
  }
  check('a quarter roll is no trick', fly([R(0.25)]).length === 0);
  check('a quarter flip is no trick', fly([P(0.25)]).length === 0);
  check('half a yaw is no trick', fly([Y(0.5)]).length === 0);
  check('three quarters of a yaw is no trick', fly([Y(0.75)]).length === 0);
  check('a half roll flown again is still the 1/2 Roll', names(fly([R(0.5)])) === '1/2 Roll');
  check('a yaw turn flown again is still a Yaw Spin', names(fly([Y(1)])) === 'Yaw Spin');
  check('a roll and a half is a Roll then a 1/2 Roll', names(fly([R(1.5)])) === 'Roll + 1/2 Roll');
  check('half roll, flip, half roll is a Rubik\'s Cube', names(fly([R(0.5), P(1), R(0.5)])) === 'Rubik\'s Cube');
  check('half flip, roll, half flip is a Cubik\'s Rube', names(fly([P(0.5), R(1), P(0.5)])) === 'Cubik\'s Rube');
  check('a yaw turn flown inverted between half rolls is an Inverted Yaw Spin',
    names(fly([R(0.5), Y(1), R(0.5)])) === '1/2 Roll + Inverted Yaw Spin + 1/2 Roll');
  check('the same with the second half roll rewound',
    names(fly([R(0.5), Y(1), R(-0.5)])) === '1/2 Roll + Inverted Yaw Spin + 1/2 Roll');
  check('an inverted yaw turn reached by half flips',
    names(fly([P(0.5), Y(1), P(0.5)])) === '1/2 Flip + Inverted Yaw Spin + 1/2 Flip');
  check('two inverted yaw turns are two Inverted Yaw Spins',
    names(fly([R(0.5), Y(2), R(0.5)])) === '1/2 Roll + Inverted Yaw Spin + Inverted Yaw Spin + 1/2 Roll');
  check('half a yaw inverted is no trick between the half rolls',
    names(fly([R(0.5), Y(0.5), R(0.5)])) === '1/2 Roll + 1/2 Roll');
  check('an upright yaw turn is still a plain Yaw Spin', names(fly([Y(1)])) === 'Yaw Spin');
  check('half yaw, roll, half yaw is a Vanny Roll', names(fly([Y(0.5), R(1), Y(0.5)])) === 'Vanny Roll');
  check('half roll and back is an Invert Rewind', names(fly([R(0.5), R(-0.5)])) === 'Invert Rewind');
  check('half flip then half roll is a Juicy Flick', names(fly([P(0.5), R(0.5)])) === 'Juicy Flick');
  check('half back flip then half roll is a Snapback', names(fly([P(-0.5), R(0.5)])) === 'Snapback');
  check('a clean roll grades CLEAN', graded(fly([R(1)])) === 'Roll:CLEAN');
  check('an overshot roll grades SLOPPY', graded(fly([R(1.25)])) === 'Roll:SLOPPY');
  check('an undershot roll is the 3/4 Roll block', names(fly([R(0.75)])) === '3/4 Roll');
  check('three quarters of a yaw stays no trick', fly([Y(0.75)]).length === 0);
  check('a cube with an overshot flip grades SLOPPY',
    graded(fly([R(0.5), P(1.25), R(0.5)])) === 'Rubik\'s Cube:SLOPPY');
  check('half roll and back again is an Invert Rewind', names(fly([R(0.5), R(-0.5)])) === 'Invert Rewind');
  check('an overshot roll is still named Roll', names(fly([R(1.25)])) === 'Roll');
  check('a stall between two half rolls makes them Segmented',
    names(fly([R(0.5), { wait: 700, upZ: -1, speed: 1.0 }, R(0.5, { speed: 1.0 })])) === 'Segmented Flips/Rolls');
  check('two half rolls without a stall are not Segmented',
    names(fly([R(0.5), R(0.5)])) !== 'Segmented Flips/Rolls');
  check('a cube is one trick, not its parts', fly([R(0.5), P(1), R(0.5)]).length === 1);
  check('long pauses break the cube into three tricks',
    fly([R(0.5, { gap: 900 }), P(1, { gap: 900 }), R(0.5, { gap: 900 })]).length === 3);
  check('a whole roll names itself before the settle window ends', fly([R(1, { gap: 30 })]).length === 1);
  check('a gentle correction is no trick', fly([R(0.05, { rate: 2.0 })]).length === 0);

  // Hand built traces: a contact during a rotation, and one long before it.
  const peak = 14;
  function traced(build) {
    const got = [];
    const det = new TrickDetector((t) => got.push(t));
    const at = (rate, up) => det.step(0.001, rate, 0, 0, 0, Math.sqrt(Math.max(0, (1 - up) / 2)), 12);
    build(det, at);
    det.flush(1);
    return got;
  }
  function roll(at) {
    for (let i = 0; i < 60; i += 1) {
      at(peak * (i / 60), 1);
    }
  }
  function rollRest(at) {
    for (let i = 0; i < 388; i += 1) {
      at(peak, 0);
    }
    for (let i = 60; i >= 1; i -= 1) {
      at(peak * (i / 60), 1);
    }
  }
  const bumped = traced((det, at) => {
    roll(at);
    det.bump();
    rollRest(at);
    for (let i = 0; i < 700; i += 1) {
      at(0, 1);
    }
  });
  check('a roll with a contact in the middle is still a Roll', names(bumped) === 'Roll');
  // An earlier detector cleared the contact before the trick's primitive existed and graded it CLEAN.
  check('that roll grades BUMP', bumped.length === 1 && bumped[0].execution === 'BUMP');
  const early = traced((det, at) => {
    det.bump();
    for (let i = 0; i < 400; i += 1) {
      det.step(0.001, 0, 0, 0, 0, 0, 12);
    }
    roll(at);
    rollRest(at);
    for (let i = 0; i < 300; i += 1) {
      at(0, 1);
    }
  });
  check('a contact long before a roll does not carry over', early.length === 1 && early[0].execution === 'CLEAN');
}

/* ------------------------------------------------------------------ */

const land = (s, name, endMs, more) => s.land({ name, execution: 'CLEAN', endMs, ...more });

section('the arithmetic');
let varied;
{
  const one = new FreestyleScore();
  one.tick(0);
  land(one, 'Roll', 0);
  one.tick(4000);
  check('one Roll banks 50', one.total() === 50);

  const four = new FreestyleScore();
  for (let i = 0; i < 4; i += 1) {
    four.tick(i * 500);
    land(four, 'Roll', i * 500);
  }
  check('repeats take 1, 0.75, 0.5, 0', four.tricks.map((t) => t.repeat).join() === '1,0.75,0.5,0');
  check('back to back halves each time', four.tricks.map((t) => t.b2b).join() === '1,0.5,0.25,0.125');
  check('the fourth Roll is worth nothing', four.tricks[3].raw === 0);
  check('the streak grows by points over 10000', near(four.tricks[1].streak, 1 + 50 / 10000));
  four.tick(9000);
  // Four rolls net 50 + 18.84375 + 6.28609375 + 0 at chain multiplier 3. A worthless trick buys no multiplier.
  check('four Rolls bank 225', four.total() === 225);

  varied = new FreestyleScore();
  ['Roll', 'Flip', 'Yaw Spin', 'Double Roll'].forEach((name, i) => {
    varied.tick(i * 500);
    land(varied, name, i * 500);
  });
  varied.tick(9000);
  // 50 + 50.25 + 50.5 + 152.25 = 303, times a chain of 4.
  check('four different tricks bank 1212', varied.total() === 1212);
  check('variety is worth more than four times repetition', varied.total() > four.total() * 4);

  for (const [grade, factor] of [['CLEAN', 1], ['SLOPPY', 0.65], ['BUMP', 0.5], ['MISSED', 0], ['CRASH', 0]]) {
    const s = new FreestyleScore();
    s.tick(0);
    s.land({ name: 'Barani', execution: grade, endMs: 0 });
    s.tick(4000);
    check(`a ${grade} Barani banks ${Math.round(700 * factor)}`, s.total() === Math.round(700 * factor));
  }

  {
    const s = new FreestyleScore();
    s.tick(0);
    land(s, 'Barani', 0);
    s.tick(500);
    land(s, 'Flip', 500);
    const g = s.streak;
    s.tick(1000);
    s.land({ name: 'Roll', execution: 'BUMP', endMs: 1000 });
    check('a bumped trick halves the streak back toward one', near(s.streak, g + (1 - g) / 2));
  }

  {
    const s = new FreestyleScore();
    s.tick(0);
    land(s, 'Barani', 0);
    s.tick(500);
    land(s, 'Rollani', 500);
    const open = s.view().combo.value;
    s.crash();
    check('the open chain was worth over 2000', open > 2000);
    check('a crash loses the open chain', s.total() === 0);
    check('a crash closes the chain', s.view().combo === null);
    s.tick(1000);
    land(s, 'Flip', 1000);
    check('the streak restarts after a crash', s.streak === 1);
  }

  {
    const s = new FreestyleScore();
    const banks = [];
    for (let i = 0; i < 20; i += 1) {
      s.tick(i * 100);
      land(s, TRICKS[i].name, i * 100);
      banks.push(...(s.drainEvents() ?? []).filter((e) => e.kind === 'bank'));
    }
    check('twenty quick tricks bank once at the multiplier cap of 12', banks.length === 1 && banks[0].mult === 12);
    check('the bank took twelve tricks and eight stay open',
      banks[0].names.length === 12 && s.view().combo.names.length === 8);
  }

  {
    const s = new FreestyleScore();
    for (let i = 0; i < 20; i += 1) {
      s.tick(i * 100);
      land(s, 'Flip', i * 100);
    }
    check('twenty Flips only reach a multiplier of 3', s.view().combo.mult === 3);
  }

  function bankOf(list) {
    const s = new FreestyleScore();
    list.forEach((name, i) => {
      s.tick(i * 500);
      land(s, name, i * 500);
    });
    s.tick(list.length * 500 + 9000);
    return s.total();
  }
  const masters = ['Rollani', 'Flipani', 'Barani'];
  const halves = (n) => Array(n).fill('1/2 Roll');
  check('three masters bank 7601', bankOf(masters) === 7601);
  check('nine filler half rolls add no more than three',
    bankOf([...masters, ...halves(9)]) === bankOf([...masters, ...halves(3)]));
  check('six real tricks beat masters padded with half rolls',
    bankOf(['Rollani', 'Flipani', 'Barani', 'Inverted 360 Powerloop', 'Donkey Loop', 'Double Rolling Trippy Spin'])
      > bankOf([...masters, ...halves(3)]));
  check('twelve half rolls bank under 300', bankOf(halves(12)) < 300);

  {
    const s = new FreestyleScore({ comboEnabled: false });
    s.tick(0);
    land(s, 'Roll', 0);
    s.tick(500);
    land(s, 'Flip', 500);
    check('with combos off each trick counts at once, streak included', near(s.total(), 50 + 50 * (1 + 50 / 10000)));
  }

  function chainOf(list, gap) {
    const s = new FreestyleScore();
    let t = 0;
    for (const name of list) {
      t += gap;
      s.tick(t);
      land(s, name, t);
    }
    s.tick(t + 5000);
    return s.total();
  }
  const SIX = ['Roll', 'Flip', 'Yaw Spin', 'Double Roll', 'Powerloop', 'Matty Flip'];
  const linked = chainOf(SIX, 1500);
  const apart = chainOf(SIX, 4000);
  check('six tricks linked beat the same six apart', linked > apart);
  check('linking is worth at least four times as much', linked >= apart * 4);
  note(`six linked ${formatScore(linked)}, apart ${formatScore(apart)}, ratio ${(linked / apart).toFixed(1)}`);

  const POOL = ['Roll', 'Flip', 'Yaw Spin', 'Double Roll', 'Powerloop', 'Matty Flip', 'Split-S', 'Wall Ride',
    'Knife Edge', 'Dive', 'Cradle', 'Jump Rope', 'Barani', 'Immelmann Turn'];
  let prev = 0;
  let growing = true;
  for (let n = 1; n <= POOL.length; n += 1) {
    const v = chainOf(POOL.slice(0, n), 1500);
    growing = growing && v > prev;
    prev = v;
  }
  check('every extra linked trick raises the bank, up to fourteen', growing);
  note(`fourteen linked bank ${formatScore(prev)}`);

  const eight = chainOf(POOL.slice(0, 8), 1500);
  const loops = chainOf(Array(8).fill('Powerloop'), 1500);
  check('eight varied tricks bank over 2.5 times eight Powerloops', eight > loops * 2.5);
  note(`eight varied ${formatScore(eight)}, eight Powerloops ${formatScore(loops)}`);

  {
    const s = new FreestyleScore();
    let t = 0;
    for (const name of POOL.slice(0, 8)) {
      t += 1500;
      s.tick(t);
      land(s, name, t);
    }
    const open = s.view().combo.value;
    s.crash();
    check('the open chain shows what a crash would cost, and the crash costs it', open === eight && s.total() === 0);
    note(`crashing there loses ${formatScore(open)}`);
  }

  const sum = varied.summary();
  check('the summary counts four tricks', sum.tricks === 4);
  check('the summary counts four different tricks', sum.unique === 4);
  check('the best trick leads the rows', sum.rows[0].name === 'Double Roll');
  check('the signature is the best trick', sum.signature === 'Double Roll');
}

/* ------------------------------------------------------------------ */

section('the run clock and the obstacle tables');
{
  const s = new FreestyleScore();
  s.tick(5000);
  check('before the first trick the run is ready with the whole clock',
    s.view().state === 'ready' && s.view().remainMs === RUN_MS);
  land(s, 'Flip', 5000);
  s.tick(6000);
  check('the first trick starts the clock', s.view().state === 'flying' && s.view().remainMs === RUN_MS - 1000);
  s.tick(5000 + RUN_MS - 1);
  check('one millisecond before the horn the run is still on', !s.over());
  s.tick(5000 + RUN_MS);
  check('at the horn the run is over with nothing left', s.over() && s.view().remainMs === 0);
  check('the run lasted exactly RUN_MS', s.summary().durationMs === RUN_MS);
  const before = s.total();
  land(s, 'Rollani', 5000 + RUN_MS + 10);
  check('a trick after the horn scores nothing', s.total() === before);

  const horn = new FreestyleScore();
  horn.tick(0);
  land(horn, 'Flip', 0);
  land(horn, 'Roll', 400);
  check('the horn banks the open chain', horn.total() === 0 && horn.tick(RUN_MS) === undefined && horn.total() > 0);

  const rail = new FreestyleScore();
  for (let i = 0; i < 8; i += 1) {
    rail.tick(i * 400);
    land(rail, 'Powerloop', i * 400, { obstacle: 7 });
  }
  check('the same obstacle again takes 1,1,1,1,0.66,0.33,0,0',
    rail.tricks.map((t) => t.obstacle).join() === '1,1,1,1,0.66,0.33,0,0');

  const air = new FreestyleScore();
  [7, null, 7, null, 7, null, 7, null, 7].forEach((obstacle, i) => {
    air.tick(i * 400);
    land(air, TRICKS[i].name, i * 400, { obstacle });
  });
  check('open air between tricks does not move the pilot off the obstacle',
    air.tricks[8].obstacle === 0.66 && air.obstacleSwitches === 0);

  const twelve = (obstacleOf) => {
    const sc = new FreestyleScore();
    for (let i = 0; i < 12; i += 1) {
      sc.tick(i * 400);
      land(sc, TRICKS[i].name, i * 400, { obstacle: obstacleOf(i) });
    }
    return sc;
  };
  const moved = twelve((i) => i);
  const banked = moved.total();
  moved.finish();
  check('twelve obstacles in turn are eleven switches', moved.obstacleSwitches === 11);
  check('the switch bonus is added at the horn, not multiplied',
    banked === 22968 && moved.bonus === 383 && moved.total() === 23351);
  const still = twelve(() => 3);
  still.finish();
  check('one obstacle throughout earns no bonus and less score', still.bonus === 0 && still.total() < moved.total());

  const idle = new FreestyleScore();
  idle.tick(0);
  idle.tick(RUN_MS * 3);
  check('a run nobody started never ends', !idle.over() && idle.summary().durationMs === 0);

  const twice = twelve((i) => i);
  const f = twice.finish();
  check('finishing twice returns the same total', twice.finish() === f && twice.bonus > 0);
  twice.tick(RUN_MS * 3);
  check('time after the finish changes nothing', twice.total() === f);

  const quick = new FreestyleScore();
  let bankCount = 0;
  for (let i = 0; i < 14; i += 1) {
    quick.tick(i * 200);
    land(quick, TRICKS[i].name, i * 200);
    bankCount += (quick.drainEvents() ?? []).filter((e) => e.kind === 'bank').length;
  }
  check('fourteen quick tricks bank once and leave two open',
    bankCount === 1 && quick.view().combo.names.length === 2);

  const helped = new FreestyleScore();
  helped.tick(0);
  land(helped, 'Flip', 0, { assisted: true });
  check('an assisted trick marks the run assisted', helped.summary().assisted === true);
  check('a run without one is not assisted', still.summary().assisted === false);
}

/* ------------------------------------------------------------------ */

section('end to end on a synthetic trace');
{
  const flown = fly([R(0.5), P(1), R(0.5), R(2), Y(1)]);
  check('the trace names a cube, a double roll and a yaw spin',
    names(flown) === 'Rubik\'s Cube + Double Roll + Yaw Spin');
  const s = new FreestyleScore();
  for (const t of flown) {
    s.tick(t.endMs);
    s.land(t);
  }
  check('the detector\'s own tricks build a chain of 3', Boolean(s.view().combo) && s.view().combo.mult === 3);
  s.tick(s.nowMs + 4000);
  check('the chain banks once it lapses', s.total() > 0 && s.view().combo === null);
  // 325 + 154.875 + 52.375 = 532.25, times 3.
  check('the run scores 1597', s.total() === 1597);
  note(`${formatScore(s.total())} from ${flown.length} tricks`);
}

/* ------------------------------------------------------------------ */

section('the obstacle field');
{
  const f = new ObstacleField();
  f.add(OB_BAR, 0, 6, 0, 1, 0, 0, 8);
  f.add(OB_POLE, 40, 5, 0, 0, 1, 0, 5);
  f.build();
  check('two obstacles added, two counted', f.count === 2);
  check('one bar and one pole', f.countOf(OB_BAR) === 1 && f.countOf(OB_POLE) === 1);
  check('a point under the bar finds the bar itself', f.near(0, 2, 0) === f.items[0]);
  check('a point beside the pole finds the pole itself', f.near(44, 5, 0) === f.items[1]);
  check('a point far away finds nothing', f.near(0, 5, 300) === null);
  check('a point past the end of the bar finds nothing', f.near(60, 6, 0) === null);

  const ob = (cx, cy, cz, dx, dy, dz) => ({ kind: OB_BAR, cx, cy, cz, dx, dy, dz, half: 4 });
  const a = ob(0, 6, 0, 1, 0, 0);
  check('two rails on one line share an axis', Boolean(sameAxis(a, ob(9, 6, 0, 1, 0, 0))));
  check('parallel rails apart do not', !sameAxis(a, ob(0, 6, 6, 1, 0, 0)));
  check('crossing rails do not', !sameAxis(a, ob(0, 6, 0, 0, 0, 1)));

  const boxes = (list) => ({
    fbox: list.map(() => 1),
    fax: list.map((b) => b[0]), fay: list.map((b) => b[1]), faz: list.map((b) => b[2]),
    fbx: list.map((b) => b[3]), fby: list.map((b) => b[4]), fbz: list.map((b) => b[5]),
  });
  const ground = () => 0;
  const town = deriveObstacles(boxes([
    [0, 0, 0, 0.16, 4.2, 0.16], // lamp post
    [10, 1.5, 0, 28.4, 1.6, 0.1], // fence rail with daylight under it
    [30, 0, 0, 38, 9, 0.4], // building wall
    [50, 0, 0, 90, 0.14, 6], // kerb
    [70, -60, 0, 70.7, 0.2, 0.7], // wall box reaching 60 m underground
    [90, 0.4, 0, 92, 0.5, 3], // low slab
  ]), ground);
  check('the lamp post is the one pole', town.countOf(OB_POLE) === 1);
  check('the fence rail is the one bar', town.countOf(OB_BAR) === 1);
  check('nothing else is an obstacle', town.count === 2);
  check('a box reaching underground is no pole', deriveObstacles(boxes([[70, -60, 0, 70.7, 0.2, 0.7]]), ground).count === 0);
  check('a rail too low to fly under is no bar', deriveObstacles(boxes([[0, 0.4, 0, 8, 0.5, 0.1]]), ground).count === 0);
}

/* ------------------------------------------------------------------ */

section('laps snap by side');
{
  const KIND = { bar: OB_BAR, pole: OB_POLE };
  const cases = [
    [1.06, 'bar', -1, -1, 1, 'under to under a little over one lap is one'],
    [1.3, 'bar', -1, -1, 1, 'under to under well over one lap is still one'],
    [0.845, 'bar', 1, -1, 0.5, 'over to under is a half lap'],
    [0.610, 'bar', -1, 1, 0.5, 'under to over is a half lap'],
    [0.463, 'bar', 1, -1, 0, 'a ballistic fall past the rail is no lap'],
    [0.5, 'bar', 1, -1, 0, 'exactly half a turn is what a straight line can reach'],
    [0.377, 'bar', -1, 1, 0, 'a straight climb past the rail is no lap'],
    [0.45, 'bar', -1, 1, 0, 'a straight pass under to over is no lap'],
    [0.5, 'bar', -1, -1, 0, 'same side in and out is never a half lap'],
    [0.33, 'bar', 1, 1, 0, 'a short arc over the rail is nothing'],
    [0.933, 'bar', 1, -1, 0.5, 'a tight Split-S still reads half'],
    [1.45, 'bar', 1, -1, 1.5, 'a lap and a half from over to under'],
    [1.98, 'pole', 0, 0, 2, 'a pole takes the nearest quarter'],
    [0.5, 'pole', 0, 0, 0, 'half way round a pole is no orbit'],
  ];
  for (const [raw, kind, start, end, want, label] of cases) {
    check(`${label} (${raw} gives ${want})`, snapPathTurns(raw, KIND[kind], start, end) === want);
  }
}

/* ------------------------------------------------------------------ */

/*
 * The path rig: geometry, not physics. Position and nose are set each
 * millisecond in world coordinates (y up) and the commanded rates fed with them.
 */
class Path {
  constructor(field) {
    this.got = [];
    this.det = new TrickDetector((t) => this.got.push(t), field);
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.upZ = 1;
    this.nose = [0, 0, -1];
  }

  feed(p, q, r) {
    const [fx, fy, fz] = this.nose;
    this.det.step(0.001, p, q, r, 0, Math.sqrt(Math.max(0, (1 - this.upZ) / 2)), 12, this.x, this.y, this.z, fx, fy, fz);
  }

  cruise(ms, vz) {
    for (let i = 0; i < ms; i += 1) {
      this.z += vz * 0.001;
      this.feed(0, 0, 0);
    }
  }

  // Start back along +z by the distance the cruise covers, so it arrives at angle a0 of the arc.
  approach(ob, radius, a0, ms, speed, vertical) {
    if (vertical) {
      this.x = ob.cx + radius * Math.cos(a0);
      this.y = ob.cy;
    } else {
      this.x = ob.cx;
      this.y = ob.cy - radius * Math.cos(a0);
    }
    this.z = ob.cz + radius * Math.sin(a0) + speed * (ms / 1000);
    this.cruise(ms, -speed);
  }

  feedTurns(rot, ms) {
    const rate = (k) => ((rot[k] ?? 0) * TURN) / (ms / 1000);
    this.feed(rate(0), rate(1), rate(2));
  }

  arcBar(ob, radius, a0, turns, ms, rot, flip) {
    for (let i = 0; i < ms; i += 1) {
      const a = a0 + (turns * TURN * i) / ms;
      this.x = ob.cx;
      this.y = ob.cy - radius * Math.cos(a);
      this.z = ob.cz + radius * Math.sin(a);
      if (flip) {
        this.upZ = Math.cos(flip * (i / ms) * TURN);
      }
      this.feedTurns(rot, ms);
    }
  }

  arcPole(ob, radius, a0, turns, ms, rot, upZ, noseIn = true) {
    const s = turns < 0 ? -1 : 1;
    for (let i = 0; i < ms; i += 1) {
      const a = a0 + (turns * TURN * i) / ms;
      this.x = ob.cx + radius * Math.cos(a);
      this.y = ob.cy;
      this.z = ob.cz + radius * Math.sin(a);
      this.nose = noseIn ? [-Math.cos(a), 0, -Math.sin(a)] : [-Math.sin(a) * s, 0, Math.cos(a) * s];
      if (upZ !== undefined) {
        this.upZ = upZ;
      }
      this.feedTurns(rot, ms);
    }
  }

  spin(axis, turns, ms, endUp) {
    const rate = (turns * TURN) / (ms / 1000);
    for (let i = 0; i < ms; i += 1) {
      this.feed(axis === 0 ? rate : 0, axis === 1 ? rate : 0, axis === 2 ? rate : 0);
    }
    if (endUp !== undefined) {
      this.upZ = endUp;
    }
    for (let i = 0; i < 200; i += 1) {
      this.feed(0, 0, 0);
    }
  }

  finish() {
    this.det.flush(this.upZ);
    return this.got.length ? names(this.got) : 'NOTHING';
  }
}

const BAR = { cx: 0, cy: 6, cz: 0 };
const POLE = BAR;

function fieldOf(build) {
  const f = new ObstacleField();
  build(f);
  return f.build();
}
const addBar = (f) => f.add(OB_BAR, BAR.cx, BAR.cy, BAR.cz, 1, 0, 0, 8);
const barField = () => fieldOf(addBar);
const poleField = () => fieldOf((f) => f.add(OB_POLE, POLE.cx, POLE.cy, POLE.cz, 0, 1, 0, 5));

function powerloop(field) {
  const p = new Path(field);
  p.approach(BAR, 4, 0, 500, 8, false);
  p.arcBar(BAR, 4, 0, -1, 1400, [0, 1, 0], 1);
  p.cruise(900, -8);
  return p.finish();
}

function overBar(rot, flip) {
  const p = new Path(barField());
  p.approach(BAR, 4, Math.PI, 500, 8, false);
  p.arcBar(BAR, 4, Math.PI, 0.5, 800, rot, flip);
  p.cruise(900, -8);
  return p.finish();
}

function orbit(turns, radius, up) {
  const p = new Path(poleField());
  p.approach(POLE, radius, 0, 400, 8, true);
  if (up < 0) {
    p.upZ = -1;
  }
  p.arcPole(POLE, radius, 0, turns, Math.round(1500 * turns), [0, 0, turns], up);
  p.cruise(700, -8);
  return p.finish();
}

section('obstacle tricks on constructed paths');
{
  check('a looping flip around a bar is a Powerloop', powerloop(barField()) === 'Powerloop');
  {
    const p = new Path(barField());
    p.approach(BAR, 4, 0, 500, 8, false);
    p.arcBar(BAR, 4, 0, -1, 1400, [0, 0, 0], 0);
    p.cruise(900, -8);
    const got = p.finish();
    check('the same lap without the flip is a Maverick Loop', got === 'Maverick Loop');
    note(`named "${got}"`);
  }
  check('a half flip over the bar into a half lap is a Matty Flip', overBar([0, 0.5, 0], 0.5) === 'Matty Flip');
  check('the half lap over the bar without the flip is a Beginner Matty', overBar([0, 0, 0], 0) === 'Beginner Matty');
  check('the half lap with a half roll and half flip is a Split-S', overBar([0.5, 0.5, 0], 0.5) === 'Split-S');
  {
    const p = new Path(barField());
    p.approach(BAR, 4, 0, 500, 8, false);
    p.arcBar(BAR, 4, 0, -0.5, 800, [0, 0.5, 0], 0.5);
    p.upZ = -1;
    p.spin(0, 0.5, 250, 1);
    p.cruise(900, -8);
    check('a half lap up from under the bar and a half roll out is an Immelmann Turn', p.finish() === 'Immelmann Turn');
  }
  const poleOrbit = (noseIn, wrap) => {
    const p = new Path(poleField());
    if (wrap) {
      // The detector sees no nose at all: only the first ten arguments reach it.
      const step = p.det.step.bind(p.det);
      p.det.step = (dt, pr, qr, rr, qx, qy, speed, x, y, z) => step(dt, pr, qr, rr, qx, qy, speed, x, y, z);
    }
    p.approach(POLE, 5, 0, 500, 8, true);
    p.arcPole(POLE, 5, 0, 2, 3000, [0, 0, 2], 1, noseIn);
    p.cruise(900, -8);
    return p.finish();
  };
  check('two laps of a pole nose in are an Orbit x2', poleOrbit(true, false) === 'Orbit x2');
  check('the same laps nose along the path are no Orbit', !poleOrbit(false, false).includes('Orbit'));
  check('the same laps with no nose given are no Orbit', !poleOrbit(true, true).includes('Orbit'));
  {
    const p = new Path(poleField());
    p.approach(POLE, 5, 0, 500, 8, true);
    p.upZ = -1;
    p.arcPole(POLE, 5, 0, 2, 3000, [0, 0, 2], -1);
    p.cruise(900, -8);
    check('two inverted laps of a pole are a Trippy Spin x2', p.finish() === 'Trippy Spin x2');
  }

  const counts = [1.75, 2, 2.25, 2.5, 3, 4, 5];
  const radii = [1, 1.5, 2, 2.5, 3.5, 5, 8];
  check('the orbit lap count is a floor, from 1.75 to 5 laps', counts.every((t) => orbit(t, 5, 1) === 'Orbit x2'));
  check('two laps are an Orbit x2 at every radius from 1 m to 8 m', radii.every((r) => orbit(2, r, 1) === 'Orbit x2'));
  check('an orbit is one trick, never an Orbit plus its own yaw', radii.every((r) => !orbit(2, r, 1).includes('+')));
  check('inverted orbits are a Trippy Spin x2 across counts and radii from 1.5 m',
    counts.every((t) => orbit(t, 5, -1) === 'Trippy Spin x2')
      && radii.slice(1).every((r) => orbit(2, r, -1) === 'Trippy Spin x2'));
  check('one inverted lap is a 1 Trippy Spin, from 0.75 to 1.5 laps',
    [0.75, 1, 1.25, 1.5].every((t) => orbit(t, 5, -1) === '1 Trippy Spin'));
  check('half an inverted lap is nothing', orbit(0.5, 5, -1) === 'NOTHING');
  check('one upright lap is a Yaw Spin', orbit(1, 5, 1) === 'Yaw Spin');
  check('laps nose along the path are neither Orbit nor Trippy Spin', [1, 2, 3, 4].every((t) => {
    const p = new Path(poleField());
    p.approach(POLE, 5, 0, 400, 8, true);
    p.arcPole(POLE, 5, 0, t, Math.round(1500 * t), [0, 0, t], 1, false);
    p.cruise(700, -8);
    // Flushing twice on purpose: a second flush must not invent anything.
    return !p.finish().includes('Orbit') && !p.finish().includes('Trippy');
  }));

  const wallTap = (impulse) => {
    const p = new Path(fieldOf(() => {}));
    p.spin(1, 0.25, 260);
    if (impulse !== undefined) {
      p.det.bump(impulse);
    }
    p.cruise(120, -8);
    p.spin(1, -0.25, 260);
    p.cruise(700, -8);
    return p.finish();
  };
  check('a gentle touch between a quarter flip and back is a Wall Tap', wallTap(1.0) === 'Wall Tap');
  check('the same flips with no touch are nothing', wallTap() === 'NOTHING');
  check('a hard hit is not a Wall Tap', wallTap(30.0) === 'NOTHING');
  const ride = (gap) => {
    const p = new Path(fieldOf(() => {}));
    p.det.near(gap);
    p.spin(0, 0.25, 260);
    for (let i = 0; i < 900; i += 1) {
      p.det.near(gap);
      p.feed(0, 0, 0);
    }
    p.det.near(gap);
    p.spin(0, -0.25, 260);
    p.cruise(700, -8);
    return p.finish();
  };
  check('knife edge along a wall 0.4 m away is a Wall Ride', ride(0.4) === 'Wall Ride');
  check('knife edge 6 m from the wall is nothing', ride(6.0) === 'NOTHING');

  check('a Powerloop among twelve short posts is still a Powerloop', powerloop(fieldOf((f) => {
    addBar(f);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TURN;
      f.add(OB_POLE, 0 + Math.cos(a) * 2.2, 6 - 4, 0 + Math.sin(a) * 2.2, 0, 1, 0, 3);
    }
  })) === 'Powerloop');
  check('three stacked rails make one Powerloop, not three', powerloop(fieldOf((f) => {
    f.add(OB_BAR, 0, 6, 0, 1, 0, 0, 8);
    f.add(OB_BAR, 0, 6 - 1.1, 0, 1, 0, 0, 8);
    f.add(OB_BAR, 0, 6 + 1.1, 0, 1, 0, 0, 8);
  })) === 'Powerloop');
  check('a pole inside the loop leaves it a Powerloop', powerloop(fieldOf((f) => {
    addBar(f);
    f.add(OB_POLE, 3, 6, 3, 0, 1, 0, 5);
  })) === 'Powerloop');
  check('three poles around the loop leave it a Powerloop', powerloop(fieldOf((f) => {
    addBar(f);
    f.add(OB_POLE, 3, 6, 3, 0, 1, 0, 5);
    f.add(OB_POLE, -3, 6, -3, 0, 1, 0, 5);
    f.add(OB_POLE, 5, 6, -2, 0, 1, 0, 5);
  })) === 'Powerloop');
  {
    const p = new Path(fieldOf((f) => f.add(OB_POLE, 0, 1.3, 0, 0, 1, 0, 1.3)));
    const above = { cx: 0, cy: 5.4, cz: 0 };
    p.approach(above, 5, 0, 500, 8, true);
    p.arcPole(above, 5, 0, 2, 3000, [0, 0, 2], 1, true);
    p.cruise(900, -8);
    check('circling high above a short post is no Orbit', !p.finish().includes('Orbit'));
  }

  {
    const p = new Path(barField());
    p.x = 0;
    p.y = 6 - 5;
    p.z = 0 + 9;
    p.cruise(300, 0);
    p.spin(1, 1, 500, 1);
    p.cruise(900, 0);
    check('a flip near a bar but not around it is a plain Flip', p.finish() === 'Flip');
  }
  const pass = (field, x, y) => {
    const p = new Path(field);
    p.x = x;
    p.y = y;
    p.z = 0 + 40;
    p.cruise(4000, -20);
    return p.finish();
  };
  check('flying straight under a bar is nothing', pass(barField(), 0, 6 - 3) === 'NOTHING');
  check('flying straight past a pole is nothing', pass(poleField(), 0 + 4, 6) === 'NOTHING');
}

/* ------------------------------------------------------------------ */

section('end to end on the real aircraft');
const wasmPath = join(ROOT, 'dist/sim.wasm');
if (!existsSync(wasmPath)) {
  console.log('  SKIP  dist/sim.wasm is not built, so the real aircraft cannot fly');
} else {
  const wasmBytes = readFileSync(wasmPath);
  const diffText = readFileSync(join(ROOT, 'configs/betaflight-default.diff'), 'utf8');

  async function rig(field = null) {
    const sim = await loadSim(wasmBytes);
    if (sim.init(diffText) !== SIM_OK) {
      throw new Error('sim_init failed');
    }
    sim.reset();
    const got = [];
    const det = new TrickDetector((t) => got.push(t), field);
    const track = [];
    const w = { set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    let steps = 0;
    // Accumulated by repeated addition, as the shell's radio clock is: 500 Hz.
    let nextRadio = 0;
    const state = () => sim.readState().state;
    const ms = (roll, pitch, yaw, thr) => {
      const t = steps / 1000;
      if (t >= nextRadio) {
        sim.input(t, roll, pitch, yaw, thr);
        nextRadio += 0.002;
      }
      sim.step(1);
      steps += 1;
      const st = state();
      simPosToThree(st[1], st[2], st[3], w);
      track.push([w.x, w.y, w.z]);
      det.step(0.001, st[11], st[12], st[13], st[8], st[9],
        Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]), w.x, w.y, w.z);
      return st;
    };
    const upZ = () => {
      const st = state();
      return 1 - 2 * (st[8] * st[8] + st[9] * st[9]);
    };
    const hold = (n, thr = 0.5, roll = 0, pitch = 0, yaw = 0) => {
      for (let i = 0; i < n; i += 1) {
        ms(roll, pitch, yaw, thr);
      }
    };
    // Full stick until the integrated body rate covers the target; the next call releases it.
    const rotate = (axis, turns, sign, thr = 0.5, busy = {}) => {
      const stick = (a, key) => (a === axis ? sign : busy[key] ?? 0);
      let acc = 0;
      for (let n = 0; Math.abs(acc) < Math.abs(turns) * TURN && n < 6000; n += 1) {
        const st = ms(stick(AXIS_ROLL, 'roll'), stick(AXIS_PITCH, 'pitch'), stick(AXIS_YAW, 'yaw'), thr);
        acc += st[11 + axis] * 0.001;
      }
      return acc / TURN;
    };
    const done = () => {
      hold(700);
      det.flush(upZ());
      return got;
    };
    return { ms, hold, rotate, upZ, done, state, track };
  }

  async function single(axis, turns, sign, thr, busy) {
    const f = await rig();
    f.hold(250);
    f.rotate(axis, turns, sign, thr, busy);
    return names(f.done());
  }

  check('a flown roll is a Roll', await single(AXIS_ROLL, 1, 1) === 'Roll');
  check('a flown flip is a Flip', await single(AXIS_PITCH, 1, 1) === 'Flip');
  check('a flown back flip is a Flip', await single(AXIS_PITCH, 1, -1) === 'Flip');
  check('a flown yaw turn is a Yaw Spin', await single(AXIS_YAW, 1, 1) === 'Yaw Spin');
  check('a flown double roll is a Double Roll', await single(AXIS_ROLL, 2, 1) === 'Double Roll');
  check('a flown half roll is the 1/2 Roll', await single(AXIS_ROLL, 0.5, 1) === '1/2 Roll');
  {
    const f = await rig();
    f.hold(250);
    f.rotate(AXIS_ROLL, 0.5, 1);
    f.hold(80);
    f.rotate(AXIS_ROLL, 0.5, -1);
    check('a flown half roll and back is an Invert Rewind', names(f.done()) === 'Invert Rewind');
  }
  {
    const f = await rig();
    f.hold(250);
    f.rotate(AXIS_ROLL, 0.5, 1);
    const u1 = f.upZ();
    f.hold(60);
    f.rotate(AXIS_PITCH, 1, 1);
    const u2 = f.upZ();
    f.hold(60);
    f.rotate(AXIS_ROLL, 0.5, 1);
    const u3 = f.upZ();
    const got = f.done();
    check('the plant really is inverted through the middle flip of a cube', u1 < -0.8 && u2 < -0.8 && u3 > 0.8);
    check('a flown cube is a Rubik\'s Cube', names(got) === 'Rubik\'s Cube');
    check('a flown cube is one trick', got.length === 1);
  }
  {
    const f = await rig();
    // A fixed LCG: the product passes 2^53 and its exact double rounding is part of the stimulus.
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed / 4294967296) * 2 - 1;
    };
    for (let i = 0; i < 10000; i += 1) {
      f.ms(rnd() * 0.18, rnd() * 0.18, rnd() * 0.15, 0.55);
    }
    check('ten seconds of stick noise are no trick', f.done().length === 0);
  }
  {
    const f = await rig();
    for (let i = 0; i < 6; i += 1) {
      f.hold(420, 0.6, 0.55, 0, 0.75);
      f.hold(300, 0.5);
    }
    check('six hard corners are no trick', f.done().length === 0);
  }
  {
    const f = await rig();
    f.hold(200);
    let peak = 0;
    let total = 0;
    for (let i = 0; i < 6000; i += 1) {
      const st = f.ms(0.14, 0.12, 0.35, 0.55);
      const r = st[13] < 0 ? -st[13] : st[13];
      peak = Math.max(peak, r);
      total += r * 0.001;
    }
    const got = f.done();
    check('a coordinated circling turn yaws more than 1.2 turns', total / TURN > 1.2);
    check('its yaw rate peaks between 90 and 130 degrees a second', peak * 57.2958 > 90 && peak * 57.2958 < 130);
    check('a coordinated circling turn is no trick', got.length === 0);
  }
  {
    const f = await rig();
    f.hold(200);
    f.hold(1500, 1.0);
    f.hold(800, 0.3);
    check('a punch out is no trick', f.done().length === 0);
  }
  check('a roll with yaw stick held is still a Roll', await single(AXIS_ROLL, 1, 1, 0.5, { yaw: -0.45 }) === 'Roll');
  check('a yaw turn with roll stick held is still a Yaw Spin',
    await single(AXIS_YAW, 1, 1, 0.5, { roll: 0.12 }) === 'Yaw Spin');
  {
    const f = await rig();
    f.hold(250);
    f.rotate(AXIS_ROLL, 0.5, 1);
    f.hold(60);
    f.rotate(AXIS_PITCH, 1, 1);
    f.hold(60);
    f.rotate(AXIS_ROLL, 0.5, 1);
    f.hold(200);
    f.rotate(AXIS_ROLL, 2, 1);
    f.hold(200);
    f.rotate(AXIS_YAW, 1, 1);
    const got = f.done();
    const s = new FreestyleScore();
    for (const t of got) {
      s.tick(t.endMs);
      s.land(t);
    }
    s.tick(s.nowMs + 4000);
    check('a flown run names a cube, a double roll and a yaw spin',
      names(got) === 'Rubik\'s Cube + Double Roll + Yaw Spin');
    check('the flown run scores the same 1597 as the synthetic one', s.total() === 1597);
    note(`flown ${formatScore(s.total())} from ${got.length} tricks, all CLEAN ${got.every((t) => t.execution === 'CLEAN')}`);
  }

  // Dive to speed, pull a full pitch loop under power, and (with a rail) keep pulling until below it.
  async function flyLoop(field, barY) {
    const f = await rig(field);
    f.hold(250, 0.5);
    for (let i = 0; i < 4000; i += 1) {
      const st = f.state();
      if (Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]) >= 12) {
        break;
      }
      f.ms(0, -0.30, 0, 0.80);
    }
    f.hold(160, 0.55, 0, 0.20, 0);
    const mark = f.track.length;
    let acc = 0;
    for (let i = 0; i < 6000; i += 1) {
      const st = f.ms(0, 0.60, 0, 1.0);
      acc += st[12] * 0.001;
      if (Math.abs(acc) >= TURN && (barY === null || f.track[f.track.length - 1][1] < barY)) {
        break;
      }
    }
    f.hold(900, 0.5);
    return { f, mark, pitchTurns: acc / TURN };
  }

  // Winding in the y-z plane, in turns, summed as sines of the step angles.
  function windAbout(pts, cy, cz) {
    let a = 0;
    for (let i = 1; i < pts.length; i += 1) {
      const ay = pts[i - 1][1] - cy;
      const az = pts[i - 1][2] - cz;
      const by = pts[i][1] - cy;
      const bz = pts[i][2] - cz;
      const la = Math.sqrt(ay * ay + az * az);
      const lb = Math.sqrt(by * by + bz * bz);
      if (la < 0.5 || lb < 0.5) {
        return NaN;
      }
      a += (ay * bz - az * by) / (la * lb);
    }
    return a / TURN;
  }

  const first = await flyLoop(null, null);
  const pts = first.f.track.slice(first.mark);
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumX = 0;
  for (const [x, y, z] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    sumX += x;
  }
  check('the flown loop is over 6 m tall and 6 m long', maxY - minY > 6 && maxZ - minZ > 6);

  // Both steps accumulate by addition, so the grid's end points carry float drift; that is part of the stimulus.
  let best = null;
  for (let fy = 0.05; fy <= 0.35; fy += 0.02) {
    for (let fz = 0.1; fz <= 0.9; fz += 0.02) {
      const cy = minY + (maxY - minY) * fy;
      const cz = minZ + (maxZ - minZ) * fz;
      const w = windAbout(pts, cy, cz);
      if (Number.isNaN(w)) {
        continue;
      }
      const err = Math.abs(Math.abs(w) - 1);
      if (best === null || err < best.err) {
        best = { w, cy, cz, err };
      }
    }
  }
  check('some point inside the loop is wound about once', best !== null && Math.abs(Math.abs(best.w) - 1) < 0.15);

  // With no candidate, best.cy throws here: a missing rail is a fault, not a skip.
  const railField = fieldOf((f) => f.add(OB_BAR, sumX / pts.length, best.cy, best.cz, 1, 0, 0, 8));
  const second = await flyLoop(railField, best.cy);
  const loopNames = names(second.f.done());
  check('a flown powerloop around a real rail is a Powerloop', loopNames === 'Powerloop');
  note(`rail at y ${best.cy.toFixed(1)} z ${best.cz.toFixed(1)}, wound ${best.w.toFixed(2)} turns, `
    + `pitch ${first.pitchTurns.toFixed(2)}, named "${loopNames || 'nothing'}"`);
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} FAILED`);
process.exit(failures);
