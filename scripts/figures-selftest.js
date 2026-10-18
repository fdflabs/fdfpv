/*
 * figures-selftest.js: the aerobatic figure detector and judge, in Node
 * (docs/TRICKS-CATALOG.md).
 *
 * For every figure in the catalogue, a synthetic path flown cleanly must be
 * named that figure and graded high, and a sloppy one (a wandering line, a
 * lumpy loop, a roll stopped short) must be named the same and graded
 * lower. Then: the same state stream twice gives the same figures
 * (determinism); every catalogue row has a detector row and a K.
 *
 *   node scripts/figures-selftest.js
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

import { FigureDetector, FIGURE_IDS, bandDeduction } from '../src/game/figuredetect.js';
import { FIGURES, ARESTI_K, figureById } from '../src/game/figures.js';
import { flyPath, pull, push, straight, roll, attitudeQuat, DEG } from '../tests/lib/figurepath.js';

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

const V = 20;
/* Flies segments and returns the figures named. */
function detect(segments, start) {
  const got = [];
  const det = new FigureDetector((f) => got.push(f));
  flyPath(segments, (st) => det.step(0.001, st), start);
  det.flush();
  return got;
}
const lead = straight(1000, V);
const tail = straight(1500, V);
const UP = attitudeQuat(Math.PI / 2, 0);
const UP45 = attitudeQuat(Math.PI / 4, 0);

/* The figures' clean paths. */
const PATHS = {
  loop: [lead, pull(V, 25), tail],
  outside_loop: [lead, push(V, 25), tail],
  ke_loop: [lead, { p: 6, ms: Math.round((Math.PI / 2 / 6) * 1000), speed: V }, straight(300, V),
    { r: V / 25, ms: Math.round(2 * Math.PI * 25 / V * 1000), speed: V }, tail],
  immelmann: [lead, pull(V, 20, 0.5), roll(4, 0.5, V), tail],
  split_s: [lead, roll(4, 0.5, V), pull(V, 20, 0.5), tail],
  half_cuban: [lead, pull(V, 20, 0.625), straight(500, V), roll(4, 0.5, V), straight(500, V), pull(V, 20, 0.125), tail],
  cuban_8: [lead, pull(V, 20, 0.625), straight(500, V), roll(4, 0.5, V), straight(500, V), pull(V, 20, 0.75), straight(500, V),
    roll(4, 0.5, V), straight(500, V), pull(V, 20, 0.125), tail],
  reverse_half_cuban: [lead, pull(V, 20, 0.125), straight(500, V), roll(4, 0.5, V), straight(500, V), pull(V, 20, 0.625), tail],
  reverse_cuban_8: [lead, pull(V, 20, 0.125), straight(500, V), roll(4, 0.5, V), straight(500, V), pull(V, 20, 0.75),
    straight(500, V), roll(4, 0.5, V), straight(500, V), pull(V, 20, 0.625), tail],
  humpty_bump: [lead, pull(V, 20, 0.25), straight(1500, V), pull(V, 8, 0.5), straight(1500, V), pull(V, 20, 0.25), tail],
  hammerhead: [lead, pull(V, 20, 0.25), { ms: 2000, speed: V, dSpeed: -9 }, { r: 3, ms: Math.round(Math.PI / 3 * 1000), speed: 2 },
    { ms: 1500, speed: 4, dSpeed: 9 }, pull(V, 20, 0.25), tail],
  tailslide: [{ ...lead, ms: 300 }, straight(1000, V), { ms: 1500, speed: 4 }, { ms: 800, world: [0, 0, -2] }],
  aileron_roll: [lead, roll(4, 1, V), tail],
  half_roll: [lead, roll(4, 0.5, V), tail],
  double_roll: [lead, roll(5, 2, V), tail],
  slow_roll: [lead, roll(1.6, 1, V), tail],
  two_point_roll: [lead, roll(4, 0.5, V), straight(300, V), roll(4, 0.5, V), tail],
  four_point_roll: [lead, ...[0, 1, 2].flatMap(() => [roll(4, 0.25, V), straight(300, V)]), roll(4, 0.25, V), tail],
  eight_point_roll: [lead, ...[0, 1, 2, 3, 4, 5, 6].flatMap(() => [roll(5, 0.125, V), straight(250, V)]), roll(5, 0.125, V), tail],
  barrel_roll: [lead, { p: 3, q: -1.2, ms: Math.round(2 * Math.PI / 3 * 1000), speed: V }, tail],
  rolling_circle: [lead, { p: 1.6, worldRate: [0, 0, 1.6], ms: 3927, speed: V }, tail],
  snap_roll: [lead, ...snap(1), tail],
  negative_snap_roll: [lead, ...snap(-1), tail],
  avalanche: [lead, pull(V, 20, 0.5), ...snap(1), pull(V, 20, 0.5), tail],
  hover: [{ ms: 3500, speed: 0, world: [0, 0, 0] }],
  torque_roll: [{ ms: 3500, p: 1.9, speed: 0, world: [0, 0, 0] }],
  harrier: [{ ms: 3500, speed: 5, alpha: 45 * DEG }],
  inverted_harrier: [{ ms: 3500, speed: 5, alpha: -45 * DEG }],
  rolling_harrier: [{ ms: 3200, world: [5, 0, 0] }, { ms: 3000, keepVel: true, aboutVel: 2.2 }],
  knife_edge_pass: [lead, { p: 6, ms: Math.round((Math.PI / 2 / 6) * 1000), speed: V }, straight(2500, 15), { p: -6, ms: Math.round((Math.PI / 2 / 6) * 1000), speed: V }, tail],
  elevator: [{ ms: 2500, world: [3, 0, -5] }],
  waterfall: [{ ms: Math.round(2 * Math.PI / 3.5 * 1000), q: 3.5, speed: 4 }],
  /* A tumble is a pitch rotation coupled into yaw, as the prop's
   * gyroscopic precession couples it (Wikipedia, "Lomcovak"): 3 rad/s of
   * yaw with 8 of pitch, 0.375 of a turn of yaw in the turn of pitch. */
  tumble: [{ ms: Math.round(2 * Math.PI / 8 * 1000), q: 8, r: 3, speed: 4 }],
  lomcevak: [{ ms: Math.round(2 * Math.PI / 5 * 1000), q: 5, p: 3, speed: 4 }],
  wall: [lead, { q: -2 * Math.PI / 4 / 0.5, ms: 500, speed: 3 }, { ms: 2000, speed: 0, world: [0, 0, 0] }],
  pop_top: [{ ms: 1500, speed: V }, ...snap(1, 9)],
  parachute: [{ ms: 1500, speed: V }, { ms: 500, q: -Math.PI, world: [2, 0, -12] }, { ms: 2500, world: [2, 0, -5] }],
  spin: [{ ms: 3000, r: 0, world: [0, 0, -12], p: 0, spinYaw: true }],
  inverted_spin: [],
  flat_spin: [],
  inverted_flat_spin: [],
  ke_spin: [],
  blender: [],
};
/* A snap: the nose kicked 20 deg above the path, a whole turn of
 * autorotation about the path, the nose put back. sign -1 pushes. */
function snap(sign, speed = V) {
  const kick = 20 * DEG / 0.1;
  return [
    { ms: 100, q: -sign * kick, keepVel: true, speed },
    { ms: Math.round(2 * Math.PI / 9 * 1000), keepVel: true, aboutVel: 9 * sign },
    { ms: 100, q: sign * kick, keepVel: true },
  ];
}

/* Starting attitudes the paths need. */
const START = {
  hover: { q: UP, speed: 0 },
  torque_roll: { q: UP, speed: 0 },
  harrier: { q: attitudeQuat(45 * DEG, 0), speed: 5 },
  inverted_harrier: { q: attitudeQuat(-45 * DEG + Math.PI, 0), speed: 5 },
  rolling_harrier: { q: attitudeQuat(45 * DEG, 0), speed: 5 },
  parachute: { q: attitudeQuat(-Math.PI / 2, 0), speed: V },
  waterfall: { speed: 4 },
  tumble: { speed: 4 },
  lomcevak: { speed: 4 },
  pop_top: { q: UP, speed: V },
  parachute: { q: attitudeQuat(-Math.PI / 2, 0), speed: V },
  tailslide: { q: UP, speed: V },
  elevator: { q: attitudeQuat(-10 * DEG, 0) },
};
void UP45;

/*
 * Spins: the nose held down at an attitude while the aircraft turns about
 * the vertical at a rate and sinks. Built from world yaw, so the body
 * rates are the world rate turned into the body.
 */
function spinPath(pitch, rollAng, yawRate, ms, sink) {
  const q0 = attitudeQuat(pitch, rollAng);
  const [w, x, y, z] = q0;
  /* world z in body axes = third row of R^T: */
  const bz = [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
  return { segs: [{ ms, p: yawRate * bz[0], q: yawRate * bz[1], r: yawRate * bz[2], world: [0, 0, -sink] }], start: { q: q0 } };
}
const SPINS = {
  spin: spinPath(-60 * DEG, 0, 2 * Math.PI, 2000, 12),
  inverted_spin: spinPath(-60 * DEG, Math.PI, 2 * Math.PI, 2000, 12),
  flat_spin: spinPath(-10 * DEG, 0, 2 * Math.PI, 2000, 6),
  inverted_flat_spin: spinPath(10 * DEG, Math.PI, 2 * Math.PI, 2000, 6),
  ke_spin: spinPath(-10 * DEG, Math.PI / 2, 2 * Math.PI, 2000, 6),
};

function run(id) {
  if (SPINS[id]) return detect(SPINS[id].segs, SPINS[id].start);
  if (id === 'blender') {
    const down = attitudeQuat(-Math.PI / 2, 0);
    const got = [];
    const det = new FigureDetector((f) => got.push(f));
    flyPath([{ ms: 600, speed: 25 }, roll(10, 3, 25)], (st) => det.step(0.001, st), { q: down, speed: 25 });
    const sp = SPINS.inverted_flat_spin;
    flyPath(sp.segs, (st) => det.step(0.001, st), { q: sp.start.q });
    det.flush();
    return got;
  }
  return detect(PATHS[id], START[id]);
}

if (process.argv[2] === '--prims') {
  const orig = FigureDetector.prototype.closeOpen;
  FigureDetector.prototype.closeOpen = function (s) {
    const o = this.open;
    orig.call(this, s);
    o.close(s.tot);
    const pl = o.plane();
    console.log(`  ${o.kind} ${o.t0.toFixed(0)}-${o.t1.toFixed(0)} roll ${o.roll.toFixed(2)} pitch ${o.pitch.toFixed(2)} yaw ${o.yaw.toFixed(2)} wyaw ${o.worldYaw.toFixed(2)} swept ${o.swept.toFixed(2)} head ${o.heading.toFixed(2)} dir ${o.dir.map((x) => x.toFixed(2))} plane ${pl[2].toFixed(2)} pauses ${o.pauses} liftU ${o.liftU.toFixed(2)} liftL ${o.liftL.toFixed(2)} uz ${o.frac(o.uzSum).toFixed(2)} nz ${o.frac(o.nzSum).toFixed(2)}`);
  };
  for (const id of process.argv.slice(3)) {
    console.log(id);
    console.log('  =>', run(id).map((g) => `${g.figure} ${g.grade}`).join(', '));
  }
  process.exit(0);
}

/* 1. Every catalogue row has a detector. */
for (const f of FIGURES) {
  check(`catalogue ${f.id}: detector row, K`,
    FIGURE_IDS.includes(f.id) && f.k > 0
      && ['flown', 'waits', 'unproven'].includes(f.physics)
      && (f.aresti === null || f.aresti.reduce((a, n) => a + ARESTI_K[n], 0) === f.k),
    `K ${f.k}${f.aresti ? ` = Aresti ${f.aresti.join(' + ')}` : ', game scale'}, ${f.physics}`);
}
check('every detector row is catalogued', FIGURE_IDS.every((id) => figureById(id)));

/* 2. Each figure, flown clean, is named and graded high. */
for (const f of FIGURES) {
  const got = run(f.id);
  const hit = got.find((g) => g.figure === f.id);
  const names = got.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing';
  check(`${f.id}: flown clean, named and graded 8 or better`, hit && hit.grade >= 8 && got.length === 1, names);
}

/* 3. Sloppy versions grade lower and still name. */
const SLOPPY = {
  loop: [lead, pull(V, 18, 0.5), pull(V, 30, 0.5), tail],
  aileron_roll: [lead, roll(4, 0.85, V), tail],
  hover: [{ ms: 3500, speed: 0, world: [0, 0, 0], q: 0.1 }],
  immelmann: [lead, pull(V, 20, 0.5), roll(4, 0.42, V), tail],
};
for (const [id, path] of Object.entries(SLOPPY)) {
  const clean = run(id).find((g) => g.figure === id);
  const sloppy = detect(path, START[id]).find((g) => g.figure === id);
  check(`${id}: a sloppy one is named and graded below the clean one`, clean && sloppy && sloppy.grade < clean.grade,
    `${clean ? clean.grade : '-'} vs ${sloppy ? sloppy.grade : 'not named'}`);
}

/* 3b. Ordinary flying names nothing: a level pass, a gentle 180 turn,
 * a climb and a descent. */
{
  const plain = detect([straight(10000, V), { ms: 6000, worldRate: [0, 0, Math.PI / 6], p: 0, speed: V }, straight(2000, V),
    pull(V, 60, 0.05), straight(3000, V), push(V, 60, 0.1), straight(3000, V), pull(V, 60, 0.05), straight(3000, V)]);
  check('ordinary flying (level, a gentle turn, a climb, a descent) names nothing', plain.length === 0,
    plain.map((g) => g.figure).join(', ') || 'nothing');
}
/* A humpty with lines 20 deg off vertical loses points for them. */
{
  const off = 20 * DEG;
  const lean = [lead, pull(V, 20, 0.25 - off / (2 * Math.PI)), straight(1500, V), pull(V, 8, 0.5), straight(1500, V), pull(V, 20, 0.25), tail];
  const got = detect(lean).find((g) => g.figure === 'humpty_bump');
  const clean = run('humpty_bump').find((g) => g.figure === 'humpty_bump');
  check('a humpty with its lines 20 deg off vertical is graded lower', got && clean && got.grade <= clean.grade - 1,
    `${clean ? clean.grade : '-'} vs ${got ? got.grade : 'not named'}`);
}
/* A rolling circle out with bank left on (BAeA judging, "Rolling
 * Circles": "Stop on heading and without any remaining bank angle"):
 * one roll and a quarter over the circle loses points on one roll. */
{
  const over = detect([lead, { p: 2, worldRate: [0, 0, 1.6], ms: 3927, speed: V }, tail]).find((g) => g.figure === 'rolling_circle');
  const clean = run('rolling_circle').find((g) => g.figure === 'rolling_circle');
  check('a rolling circle that rolls a quarter past its last roll is graded under one that stops wings level', over && clean && over.grade <= clean.grade - 1,
    `${clean ? clean.grade : '-'} vs ${over ? over.grade : 'not named'}`);
}
/* Four rolls round the circle is Aresti 2.4.7.1, not the catalogue's
 * one-roll 2.4.2.1: "If the number of rolls is wrong ... Hard Zero" (BAeA
 * judging, "Rolling Circles"). */
{
  const four = detect([lead, { p: 6.4, worldRate: [0, 0, 1.6], ms: 3927, speed: V }, tail]);
  check('a circle rolled four times is no rolling circle', !four.some((g) => g.figure === 'rolling_circle'),
    four.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing');
}
/* A stall turn's lines as a judge watches them (BAeA judging, "Stall
 * Turns"): a rudder correction on the up line, the nose yawed 18 deg and
 * back below 8 m/s, is yaw on the line, marked off the line, not a turn
 * round; the hammerhead is still named, and graded under the clean one. */
{
  const corrected = [lead, pull(V, 20, 0.25), { ms: 1400, speed: V, dSpeed: -9 }, { r: 3, ms: 105, keepVel: true },
    { r: -3, ms: 105, keepVel: true }, { ms: 390, dSpeed: -9 }, { r: 3, ms: Math.round(Math.PI / 3 * 1000), speed: 2 },
    { ms: 1500, speed: 4, dSpeed: 9 }, pull(V, 20, 0.25), tail];
  const got = detect(corrected);
  const h = got.find((g) => g.figure === 'hammerhead');
  const clean = run('hammerhead').find((g) => g.figure === 'hammerhead');
  check('a hammerhead with an 18 deg yaw correction on its up line is named and graded under the clean one',
    h && clean && h.grade < clean.grade && got.length === 1, `${clean ? clean.grade : '-'} vs ${got.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing'}`);
}
/* A knife edge is the wing in the vertical plane along the line (FAI
 * F3P-AA 23: "During the knife edge the wing must be in the vertical
 * plane"), however much sideslip holds it up: the CAP 580 holds 30 deg at
 * 20 m/s (docs/CAP580-STAGE1.md C12). The nose yaws up to the sideslip as
 * the line stays level, as a real one does. */
{
  const quarter = Math.round((Math.PI / 2 / 6) * 1000);
  const slip = (deg) => {
    const k = deg * DEG;
    return [lead, { p: 6, ms: quarter, speed: V }, { r: k, dBeta: k, ms: 1000 }, straight(2500, V),
      { r: -k, dBeta: -k, ms: 1000 }, { p: -6, ms: quarter, speed: V }, tail];
  };
  const got = detect(slip(30));
  const k = got.find((g) => g.figure === 'knife_edge_pass');
  check('a knife edge held on 30 deg of sideslip is named and graded 8 or better', k && k.grade >= 8,
    got.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing');
  /* Banked 55 deg, the wing 35 deg out of the vertical plane: no knife edge. */
  const bank = Math.round((55 * DEG / 6) * 1000);
  const lean = detect([lead, { p: 6, ms: bank, speed: V }, straight(3500, V), { p: -6, ms: bank, speed: V }, tail]);
  check('a pass banked 55 deg is no knife edge', !lean.some((g) => g.figure === 'knife_edge_pass'),
    lean.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing');
}
/* A point the wings rock back from (0.5 rad/s against the roll, as the
 * Extra's knife edge does on the lateral model) is still a point, and a
 * rock back after the last starts no fifth. */
{
  const q = roll(4, 0.25, V);
  const back = { p: -0.5, ms: 300, speed: V };
  const got = detect([lead, q, straight(300, V), q, straight(300, V), q, back, q, back, tail]);
  check('a 4-point roll whose wings rock back on its points is named a 4-point roll', got.some((g) => g.figure === 'four_point_roll'),
    got.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing');
}
/* Each point at its mark (BAeA judging, "Slow Rolls"): a 2-point roll
 * paused at 105 deg, 75 deg short of its back, loses 5 points on the
 * same roll paused at 180, as the plant's 2-point roll did before its
 * program let go on the prop curves' roll rate. */
{
  const at = (deg) => detect([lead, roll(4, deg / 360, V), straight(300, V), roll(4, 1 - deg / 360, V), tail])
    .find((g) => g.figure === 'two_point_roll');
  const off = at(105);
  const on = at(180);
  check('a 2-point roll paused at 105 deg is graded 5 under one paused on its back', off && on && on.grade - off.grade === 5,
    `${on ? on.grade : 'not named'} vs ${off ? off.grade : 'not named'}`);
}
/* The pitch rotations by axis, not rate (figuredetect.js, the waterfall
 * rows): a pure pitch pivot as fast as the Extra's peak is a waterfall,
 * and the same pivot coupled into roll or yaw past a quarter turn is
 * still a tumble, whatever its rate. */
{
  const one = (seg, start = { speed: 4 }) => detect([{ ms: Math.round(2 * Math.PI / Math.abs(seg.q) * 1000), speed: 4, ...seg }], start);
  const fast = one({ q: 10 });
  check('a pure pitch pivot at 10 rad/s is a waterfall, graded 8 or better', fast.length === 1 && fast[0].figure === 'waterfall' && fast[0].grade >= 8,
    fast.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing');
  const slowYaw = one({ q: 3.5, r: 1.4 });
  check('negative control: a 3.5 rad/s pitch rotation with 0.4 of a turn of yaw in it is a tumble, not a waterfall',
    slowYaw.length === 1 && slowYaw[0].figure === 'tumble', slowYaw.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing');
  const rolled = one({ q: 8, p: 2.5 });
  check('negative control: a pitch rotation with 0.31 of a turn of roll in it is a tumble, not a waterfall',
    rolled.length === 1 && rolled[0].figure === 'tumble', rolled.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing');
  /* Falling through its back side with the wings 15 deg off level, the
   * pivot puts 2 rad/s about the vertical: still a pitch pivot, no spin. */
  const falling = one({ q: 8, world: [0, 0, -5] }, { q: attitudeQuat(0, 15 * DEG) });
  check('a waterfall sinking 5 m/s with the wings 15 deg off level is a waterfall, not a spin',
    falling.length === 1 && falling[0].figure === 'waterfall', falling.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing');
  /* Banked 60 deg the span it pivots on is nearer the vertical than the
   * horizontal: the wings are not level and it is no waterfall. */
  const banked = one({ q: 8 }, { q: attitudeQuat(0, 60 * DEG), speed: 4 });
  check('negative control: a pitch pivot with the wings banked 60 deg is no waterfall', !banked.some((g) => g.figure === 'waterfall'),
    banked.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing');
  /* "Little altitude gain or forward motion" (Wikipedia, "3D Aerobatics"):
   * the same pivot drifting 4 m/s forward, 3 m over the turn, loses a point. */
  const clean = run('waterfall').find((g) => g.figure === 'waterfall');
  const drift = one({ q: 3.5, world: [4, 0, 0] }).find((g) => g.figure === 'waterfall');
  check('a waterfall that drifts 4 m/s forward through its turn is graded under one that pivots in place',
    clean && drift && drift.grade < clean.grade, `${clean ? clean.grade : '-'} vs ${drift ? drift.grade : 'not named'}`);
}
/* A crash in the middle forgets the figure. */
{
  const got = [];
  const det = new FigureDetector((f) => got.push(f));
  flyPath([lead, pull(V, 20, 0.5)], (st) => det.step(0.001, st));
  det.reset();
  flyPath([roll(4, 0.5, V), tail], (st) => det.step(0.001, st), { q: attitudeQuat(0, Math.PI) });
  det.flush();
  check('a reset (crash) between the half loop and the half roll is no Immelmann', !got.some((g) => g.figure === 'immelmann'),
    got.map((g) => g.figure).join(', ') || 'nothing');
}

/* 4. Determinism: the same stream twice, the same figures bit for bit. */
{
  const chain = [lead, pull(V, 25), straight(800, V), roll(4, 1, V), straight(800, V), pull(V, 20, 0.5), roll(4, 0.5, V), tail];
  const a = JSON.stringify(detect(chain));
  const b = JSON.stringify(detect(chain));
  const names = detect(chain).map((g) => g.figure).join(' > ');
  check('determinism: the same recording gives the same figures', a === b && a.length > 2, names);
  check('a chain names each figure in order', names === 'loop > aileron_roll > immelmann', names);
}

/* 5. The judge's arithmetic: half a point per 7.5 deg. */
check('bands: 0 deg takes nothing, 15 deg one point, 45 deg three',
  bandDeduction(1) === 0 && bandDeduction(Math.cos(15.5 * DEG)) === 1 && bandDeduction(Math.cos(46 * DEG)) === 3);

console.log(`\nfigures selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
