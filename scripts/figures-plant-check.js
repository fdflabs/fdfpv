/*
 * figures-plant-check.js: figures flown by a person paced pilot on the
 * real compiled plant are named and graded sensibly.
 *
 * The pilot is hover-probe.js's person (the 3D lane's): it sees the
 * aircraft 0.2 s late (McRuer and Jex 1967), moves the sticks ten times a
 * second in fiftieths of their travel, and flies by what is visible: bank,
 * pitch and how far the aircraft has turned. It flies the Extra 330 in
 * Manual, the way IMAC pilots fly: a level pass, a loop (a steady pull
 * until the nose is back on the horizon), a level pass, an aileron roll
 * (full stick until the wings come round, let go a little early as a
 * person anticipates), a level pass, then a 4-point roll. The loop and
 * the roll must be named and graded between 4 and 10 (a person is not
 * perfect, nor useless); the 4-point roll, whose holds this person lets
 * sag, named and graded under the roll; nothing else may be named, so the
 * level passes name nothing. The same flight run twice must give the same figures.
 *
 *   node scripts/figures-plant-check.js
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
import { must, EXTRA_AIRFRAME } from '../tests/lib/wingpilot.js';
import { FigureDetector } from '../src/game/figuredetect.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

const MS = 2;
const LAG = 100;
const EVERY = 50;
const clamp = (x, m = 1) => Math.max(-m, Math.min(m, x));
const quant = (x) => clamp(Math.round(x * 50) / 50);

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
  return { s, nz, lz, uz, p: s[11], q: s[12], v: Math.hypot(s[4], s[5], s[6]) };
}

async function flight() {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(EXTRA_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 120, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(22), 'sim_wing_launch');
  const figures = [];
  const marks = [];
  const det = new FigureDetector((f) => figures.push({ ...f, atMs: f.endMs }));
  const seen = [];
  /* The program: [phase, ms or a done test]. */
  const program = ['level', 'loop', 'level', 'roll', 'level', 'points', 'level'];
  let phase = 0;
  let phaseMs = 0;
  let turned = 0;
  let quarter = 0;
  let holdMs = 0;
  let st = [0, 0, 0, 0.75];
  for (let ms = 0; ms < 60000 && phase < program.length; ms += MS) {
    const o = see(sim.readState().state);
    seen.push(o);
    det.step(MS / 1000, o.s);
    phaseMs += MS;
    const name = program[phase];
    if (seen.length > LAG && ms % EVERY === 0) {
      const d = seen[seen.length - 1 - LAG];
      /* Level: wings level on the ailerons, the nose on the horizon. */
      const levelRoll = quant(clamp(-0.4 * d.lz * Math.sign(d.uz || 1) - 0.04 * d.p, 0.4));
      const levelPitch = quant(clamp(-1.2 * d.nz + 0.12 * d.q + 0.04, 0.3));
      const h = EVERY / 1000;
      if (name === 'level') {
        st = [levelRoll, levelPitch, 0, 0.75];
        if (phaseMs >= 4000) { phase += 1; phaseMs = 0; turned = 0; marks.push(ms); }
      } else if (name === 'loop') {
        turned += -d.q * h;
        st = [0, 0.55, 0, 1];
        if (turned > 2 * Math.PI - 0.6) { phase += 1; phaseMs = 0; marks.push(ms); }
      } else if (name === 'roll') {
        turned += d.p * h;
        st = [0.5, 0.05, 0, 0.75];
        /* A person lets go early by what the roll will still carry: what
         * they have not seen yet (0.2 s) and the roll's own run on. */
        if (turned > 2 * Math.PI - d.p * 0.35) { phase += 1; phaseMs = 0; marks.push(ms); }
      } else if (name === 'points') {
        /* Four quarters, each held a beat. */
        if (holdMs > 0) {
          holdMs -= EVERY;
          /* Top rudder on the knife edge holds the nose up (a yaw about
           * the body's up turns the nose along the raised wing). */
          st = [0, d.uz < -0.5 ? -0.15 : d.uz > 0.5 ? 0.05 : 0, Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, 0.75];
        } else {
          turned += d.p * h;
          st = [0.5, 0.05, 0, 0.75];
          if (turned > (quarter + 1) * Math.PI / 2 - d.p * 0.6) {
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
const want = ['loop', 'aileron_roll', 'four_point_roll'];
for (const id of want.slice(0, 2)) {
  const f = a.figures.find((g) => g.figure === id);
  check(`a person's ${id} on the Extra is named and graded 4 to 10`, f && f.grade >= 4 && f.grade <= 10, f ? `grade ${f.grade}` : 'not named');
}
/* This person's points sag: the nose falls about a third of a turn over
 * the four holds, which a judge marks hard (a point per 15 deg off the
 * line). Named, and graded under the roll, is the sensible answer. */
{
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
