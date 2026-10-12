/*
 * figures-plant-check.js: figures flown by a person paced pilot on the
 * real compiled plant are named and graded sensibly.
 *
 * The pilot is hover-probe.js's person (the 3D lane's): it sees the
 * aircraft 0.2 s late (McRuer and Jex 1967), moves the sticks twenty times
 * a second in fiftieths of their travel, and flies by what is visible: bank,
 * pitch and how far the aircraft has turned. It flies the Extra 330 in
 * Manual, the way IMAC pilots fly: a level pass, a round loop (a pull
 * that sets its size, then the pitch rate that holds that radius as the
 * speed changes), a level pass, an aileron roll
 * (full stick until the wings come round, let go a little early as a
 * person anticipates), a level pass, a 4-point roll, a level pass, then a
 * tailslide (a pull to the vertical, the line held until the speed is
 * gone, the throttle cut with the nose held up until it slides back, the
 * sticks let go until it falls through, a diving line and the pull out;
 * figures-plant-sweep.js's program and line gains), on the aircraft it
 * is proven on (PLANES' tailslide). The loop, the roll and the tailslide
 * must be named and graded between 4 and 10 (a person
 * is not perfect, nor useless); the 4-point roll, whose holds this person
 * lets sag, named and graded under the roll; nothing else may be named,
 * so the level passes name nothing. The same flight run twice must give the same figures.
 * --plane slick flies the same program on the Slick 580 (docs/SLICK-STAGE1.md),
 * thrown at its own sport pace.
 *
 *   node scripts/figures-plant-check.js [extra|cap|slick]
 *   node scripts/figures-plant-check.js --plane extra|cap|slick
 *
 * The same person flies the Extra 300 3D by default, the Extreme Flight 67
 * in CAP 580 with `cap` (docs/CAP580-STAGE1.md), heavier and faster, at the
 * same launch speed and sticks but for the loop's pull (PLANES below), or
 * the Slick with `slick`: the judge must name the same three figures on each.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim } from '../tests/lib/simmod.js';
import { must, hangSticks, EXTRA_AIRFRAME, CAP_AIRFRAME, SLICK_AIRFRAME } from '../tests/lib/wingpilot.js';
import { clamp, quant, eyes } from '../tests/lib/personpilot.js';
import { FigureDetector } from '../src/game/figuredetect.js';
import { SEATED } from '../tests/lib/figureprograms.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

/* Each aircraft, the speed it is thrown at and the loop's pull, the
 * person's for the aircraft: a round IMAC loop is flown short of the
 * wing's stall. loopEntry is the pull that sets the round loop's size:
 * the Extra's 0.3 holds it at 5 to 8 deg of alpha all the way round
 * (8.5 at most on the gates' 4.1 V seat, entered from the level pass at
 * the throttle that holds 22 m/s, figureprograms.js SEATED), against its
 * stall's 12.4; its 0.55, flown as a fixed stick, took the
 * wing to 13 and 14 deg, past the stall, in a 16 m loop whose grade then
 * turned on the stall's last details (3 or 4). loopPull is the quarter
 * loops' of the tailslide. The Extra at 22 m/s and 0.55; the CAP, whose elevator has
 * 50 deg of throw over a tail volume half again the Extra's, at 0.35, since
 * 0.55 takes its wing to 15 deg of alpha, past its 11.7 (CL max over the
 * wing's slope, npm run cap580:derive; 0.35 reaches 10.4 on the seated
 * pack, 0.4 11.8); the Slick launched at its trimmed sport pace, 22 m/s
 * too (npm run slick:derive), but flown level at its 0.75 (SEATED: its
 * engine has no pack to seat), which holds 41.7 m/s. Its loop at the
 * Extra's 0.55 took the wing to 13.8 deg, past its 10.9 (CL max over the
 * wing's slope, slick:derive); 0.4 reaches 9.8 and 0.45 11.1, so 0.4
 * (2026-10-12), loop 7 where 0.55 named it 6. */
/* The tailslide is proven on the Extra (named 9 to 10 on four of its
 * flight models, figures-plant-sweep.js); on the CAP this program's up
 * line at 0.4 throttle hangs at 4.5 m/s and falls off sideways, and on
 * the Slick the pull out is named a parachute too: their own lanes' to
 * fly, so not yet asked of them here. */
const PLANES = {
  extra: { sim: EXTRA_AIRFRAME, name: 'the Extra', launch: 22, loopPull: 0.55, loopEntry: 0.3, tailslide: true, sagPair: true },
  cap: { sim: CAP_AIRFRAME, name: 'the CAP', launch: 22, loopPull: 0.35, loopEntry: 0.35 },
  slick: { sim: SLICK_AIRFRAME, name: 'the Slick', launch: 22, loopPull: 0.55, loopEntry: 0.4 },
};
const at = process.argv.indexOf('--plane');
const asked = at > 0 ? process.argv[at + 1] : (process.argv[2] || 'extra');
const plane = PLANES[asked];
if (!plane) {
  console.log(`figures plant check: no plane ${asked}; one of ${Object.keys(PLANES).join(', ')}`);
  process.exit(2);
}

const MS = 2;
/* The hand moves every 50 ms, twice PERSON's ten a second: the figures'
 * gains and let go leads below were measured at this pace. */
const EVERY = 50;
/* The vertical lines' gains: the nose's error to a rate (kp, 1/s) and the
 * rate's error to the stick (kr, s). With this person's 0.2 s lag 0.5
 * rang on every plant, and on the prop curves (91061d8cb, the elevator in
 * a stronger slipstream) 0.3 rings too: the Extra's up line weaved 0.22
 * rms in its up component with the elevator stop to stop. Measured over kp
 * 1 to 4 and kr 0.1 to 0.3 there, 2026-10-12: kr 0.2 is the calmest at
 * every kp (0.11 at kp 4). figures-plant-sweep.js keeps its own. */
const LINE_GAINS = { kp: 4, kr: 0.2 };
const UP = [0, 0, 1];
const DOWN = [0, 0, -1];
/* A person holding a line also settles their hand on what holds it: the
 * proportional hold alone left the Extra's nose 8 deg past the vertical as
 * it slowed on the prop curves (91061d8cb), and at 5 m/s that much bends
 * the path off the line before the slide. ki per second, on the stick the
 * hold asks for; each line starts its own. */
const LINE_KI = 1;
/* The round loop: "as the speed changes during execution of a loop or
 * part-loop, the angular velocity ... has to change in order to keep the
 * radius constant" (British Aerobatic Association, judging, "Loops and
 * Part Loops", https://www.aerobatics.org.uk/judging/topics/loops-radii;
 * IMAC's Basic guide: a point off for each change of radius). The person
 * takes the radius their entry pull makes once the nose has come 30 deg
 * round, then flies the pitch rate it asks at the speed they see, V / R,
 * on the stick: kp per rad/s of the rate's error and ki on its integral,
 * the smallest that held the Extra's rate to its radius without ringing
 * through the person's 0.2 s (0.25 rang; measured 2026-10-12). */
const LOOP_GAINS = { kp: 0.1, ki: 0.2 };
const holdLine = (d, target, thr, trim) => {
  const [r, p, y] = hangSticks(d.s, { target, rollStick: 0, ...LINE_GAINS });
  trim.pitch = clamp(trim.pitch + LINE_KI * p * EVERY / 1000, 0.5);
  trim.yaw = clamp(trim.yaw + LINE_KI * y * EVERY / 1000, 0.5);
  return [quant(r), quant(clamp(p + trim.pitch)), quant(clamp(y + trim.yaw)), thr];
};

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

/* What a person on the ground reads off the aircraft. */
function see(s) {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  const nz = 2 * (x * z - w * y);
  const lz = 2 * (y * z + w * x);
  const uz = 1 - 2 * (x * x + y * y);
  /* The body's up axis, world: what a pitch of the nose moves it toward. */
  const up = [2 * (x * z + w * y), 2 * (y * z - w * x), uz];
  /* The speed along the nose: below zero, sliding back. */
  const along = s[4] * (1 - 2 * (y * y + z * z)) + s[5] * 2 * (x * y + w * z) + s[6] * nz;
  return { s, nz, lz, uz, up, along, p: s[11], q: s[12], v: Math.hypot(s[4], s[5], s[6]) };
}

async function flight({ sag = false } = {}) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(plane.sim), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 120, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(plane.launch), 'sim_wing_launch');
  const figures = [];
  const marks = [];
  const det = new FigureDetector((f) => figures.push({ ...f, atMs: f.endMs }));
  const eye = eyes({ stepMs: MS, everyMs: EVERY });
  /* The program: [phase, ms or a done test]. */
  const program = ['level', 'loop', 'level', 'roll', 'level', 'points', 'level',
    ...(plane.tailslide ? ['pullup', 'up', 'slide', 'down', 'pullout', 'level'] : [])];
  let phase = 0;
  let phaseMs = 0;
  let turned = 0;
  let loopR = null;
  let loopI = 0;
  let quarter = 0;
  let holdMs = 0;
  let line0 = null;
  let back = false;
  const upTrim = { pitch: 0, yaw: 0 };
  const downTrim = { pitch: 0, yaw: 0 };
  /* The level passes, the rolls and the points at the throttle that holds
   * the launch's 22 m/s level (figureprograms.js LEVEL_THROTTLE). */
  const levelThr = SEATED[plane.sim].level;
  let st = [0, 0, 0, levelThr];
  for (let ms = 0; ms < 90000 && phase < program.length; ms += MS) {
    const o = see(sim.readState().state);
    eye.push(o);
    det.step(MS / 1000, o.s);
    phaseMs += MS;
    const name = program[phase];
    if (eye.looks(ms)) {
      const d = eye.ago();
      /* Level: wings level on the ailerons, the nose on the horizon. */
      const levelRoll = quant(clamp(-0.4 * d.lz * Math.sign(d.uz || 1) - 0.04 * d.p, 0.4));
      const levelPitch = quant(clamp(-1.2 * d.nz + 0.12 * d.q + 0.04, 0.3));
      const h = EVERY / 1000;
      if (name === 'level') {
        st = [levelRoll, levelPitch, 0, levelThr];
        if (phaseMs >= 4000) { phase += 1; phaseMs = 0; turned = 0; marks.push(ms); }
      } else if (name === 'loop') {
        turned += -d.q * h;
        if (loopR === null && turned > 0.5) loopR = d.v / Math.max(0.5, -d.q);
        if (loopR === null) {
          st = [0, plane.loopEntry, 0, 1];
        } else {
          const err = d.v / loopR + d.q;
          loopI = clamp(loopI + LOOP_GAINS.ki * err * h, 0.5);
          st = [0, quant(clamp(plane.loopEntry + LOOP_GAINS.kp * err + loopI)), 0, 1];
        }
        if (turned > 2 * Math.PI - 0.6) { phase += 1; phaseMs = 0; marks.push(ms); }
      } else if (name === 'roll') {
        turned += d.p * h;
        st = [0.5, 0.05, 0, levelThr];
        /* A person lets go early by what the roll will still carry: what
         * they have not seen yet (0.2 s) and the roll's own run on. */
        if (turned > 2 * Math.PI - d.p * 0.35) { phase += 1; phaseMs = 0; marks.push(ms); }
      } else if (name === 'pullup' || name === 'pullout') {
        /* A quarter loop, let go early by what the pitch still carries. */
        turned += Math.abs(d.q) * h;
        st = [0, plane.loopPull, 0, name === 'pullup' ? 1 : 0.6];
        if (turned > Math.PI / 2 - Math.abs(d.q) * 0.25) { phase += 1; phaseMs = 0; turned = 0; marks.push(ms); }
      } else if (name === 'up') {
        st = holdLine(d, UP, 0.4, upTrim);
        if (phaseMs >= 4000 || d.v < 4) { phase += 1; phaseMs = 0; marks.push(ms); }
      } else if (name === 'slide') {
        back = back || d.along < -1;
        st = back ? [0, 0, 0, 0] : holdLine(d, UP, 0, upTrim);
        if (phaseMs > 600 && d.nz < -0.3) { phase += 1; phaseMs = 0; marks.push(ms); }
      } else if (name === 'down') {
        st = holdLine(d, DOWN, 0.3, downTrim);
        if (phaseMs >= 1500) { phase += 1; phaseMs = 0; turned = 0; marks.push(ms); }
      } else if (name === 'points') {
        if (line0 === null) {
          const hv = Math.hypot(d.s[4], d.s[5]);
          line0 = [d.s[4] / hv, d.s[5] / hv];
        }
        /* Four quarters, each held a beat. The person counts the roll they
         * see all the way, the run on past each let go included: counting
         * only while the stick is in lost what each hold carried on, and
         * once the roll ran faster (the prop curves) a quarter came out
         * an eighth long and the last point was rolled through. */
        turned += d.p * h;
        if (holdMs > 0) {
          holdMs -= EVERY;
          /* Top rudder on the knife edge holds the nose up (a yaw about
           * the body's up turns the nose along the raised wing). */
          /* And the line on the elevator, as a person flies a point: on
           * the knife edge the elevator moves the nose across the ground,
           * so it puts it back toward the heading the roll began on (the
           * prop's gyroscope pitches it off the line as the rudder yaws
           * the nose up, docs/FLIGHTMODEL.md). */
          const line = !sag && Math.abs(d.lz) > 0.5 ? quant(1.2 * (line0[0] * d.up[0] + line0[1] * d.up[1])) : 0;
          st = [0, clamp((d.uz < -0.5 ? -0.15 : d.uz > 0.5 ? 0.05 : 0) + line), Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, levelThr];
        } else {
          st = [0.5, 0.05, 0, levelThr];
          /* Let go by what the roll still carries, the aileron roll's
           * 0.35 s above: the judge now marks each point off its quarter
           * (figuredetect.js pointsDeduction), and the 0.6 s this let go
           * at put the CAP's points at 66, 136 and 210 deg and the
           * Slick's at 54, 124 and 206. */
          if (turned > (quarter + 1) * Math.PI / 2 - d.p * 0.35) {
            quarter += 1;
            holdMs = 400;
            if (quarter === 4) { phase += 1; phaseMs = 0; marks.push(ms); }
          }
        }
      }
    }
    must(sim.input(ms / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
  }
  det.flush();
  return { figures, marks };
}

const a = await flight();
const b = await flight();
const names = a.figures.map((f) => `${f.figure} ${f.grade}`).join(', ');
console.log(`flown: ${names || 'nothing'}`);
const want = ['loop', 'aileron_roll', 'four_point_roll', ...(plane.tailslide ? ['tailslide'] : [])];
for (const id of want.filter((id) => id !== 'four_point_roll')) {
  const f = a.figures.find((g) => g.figure === id);
  check(`a person's ${id} on ${plane.name} is named and graded 4 to 10`, f && f.grade >= 4 && f.grade <= 10, f ? `grade ${f.grade}` : 'not named');
}
/* The judge's sag deduction, apart from how well this person flies: on
 * the Extra the same 4-point roll is flown twice, clean (the line held on
 * the elevator through each point, as a person does, eb3ba037f) and as the
 * person flew it before, the elevator left alone so the nose falls off the
 * line over the four holds. Both must be named, the clean one graded 4 to
 * 10 and the sagging one under it (a point per 15 deg off the line). On the
 * other aircraft the clean program's points still sag, and are graded
 * under the aileron roll. */
if (plane.sagPair) {
  const sagging = await flight({ sag: true });
  const pts = a.figures.find((g) => g.figure === 'four_point_roll');
  const low = sagging.figures.find((g) => g.figure === 'four_point_roll');
  check(`a person's 4-point roll on ${plane.name} is named and graded 4 to 10`, pts && pts.grade >= 4 && pts.grade <= 10, pts ? `grade ${pts.grade}` : 'not named');
  check('the same 4-point roll left to sag is named and graded under it', pts && low && low.grade > 0 && low.grade < pts.grade,
    low ? `grade ${low.grade} against ${pts ? pts.grade : '-'}; flown ${sagging.figures.map((f) => `${f.figure} ${f.grade}`).join(', ')}` : 'not named');
} else {
  const pts = a.figures.find((g) => g.figure === 'four_point_roll');
  const ail = a.figures.find((g) => g.figure === 'aileron_roll');
  check('a person\'s sagging 4-point roll is named and graded under their aileron roll', pts && ail && pts.grade > 0 && pts.grade < ail.grade,
    pts ? `grade ${pts.grade}` : 'not named');
}
check('nothing else is named (the level passes name nothing)', a.figures.length === want.length
  && a.figures.every((f, i) => f.figure === want[i]), names);
check('the same flight twice gives the same figures', JSON.stringify(a.figures) === JSON.stringify(b.figures));
console.log(`\nfigures plant check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
