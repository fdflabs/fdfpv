/*
 * figures-plant-sweep.js: every catalogue figure not yet proven on the
 * plant, flown by the person paced pilot on the Extra 330 in Manual, and
 * what the detector and the judge make of it. It measures, it does not
 * gate: docs/TRICKS-CATALOG.md ("Plant sweep") records the answers and
 * what each one says needs tuning, in the detector, the judge, the pilot
 * program or the physics.
 *
 *   node scripts/figures-plant-sweep.js [--only id,id] [--trace]
 *
 * The pilot is figures-plant-check.js's: it sees the aircraft 0.2 s late
 * (McRuer and Jex 1967), moves the sticks ten times a second in
 * fiftieths, and lets a rotation go early by what it has not seen yet. A
 * figure is a program of phases a pilot would call out to themselves
 * ("pull to the vertical, hold the line, kick the rudder...").
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
import { must, EXTRA_AIRFRAME, hangSticks } from '../tests/lib/wingpilot.js';
import { FigureDetector } from '../src/game/figuredetect.js';
import { FIGURES } from '../src/game/figures.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

const MS = 2;
const LAG = 100;
const EVERY = 50;
const H = EVERY / 1000;
const PI = Math.PI;
const clamp = (x, m = 1) => Math.max(-m, Math.min(m, x));
const quant = (x) => clamp(Math.round(x * 50) / 50);
const trace = process.argv.includes('--trace');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice(7).split(',') : null;

function see(s) {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  return {
    s, nz: 2 * (x * z - w * y), lz: 2 * (y * z + w * x), uz: 1 - 2 * (x * x + y * y),
    p: s[11], q: s[12], r: s[13], v: Math.hypot(s[4], s[5], s[6]), vz: s[6], z: s[3],
    along: (s[4] * (1 - 2 * (y * y + z * z)) + s[5] * 2 * (x * y + w * z) + s[6] * 2 * (x * z - w * y)),
  };
}

/* ---- The pilot's phases. Each gets the seen state and its own memory,
 * and returns [roll, pitch, yaw, throttle] and whether it is done. ---- */

/* Wings level and the nose on the horizon, upright or inverted. */
const levelSticks = (d, thr = 0.75) => [
  quant(clamp(-0.4 * d.lz * Math.sign(d.uz || 1) - 0.04 * d.p, 0.4)),
  quant(clamp(Math.sign(d.uz || 1) * (-1.2 * d.nz) + 0.12 * d.q + (d.uz > 0 ? 0.04 : -0.08), 0.4)),
  0, thr,
];
const level = (ms, thr) => ({ name: `level ${ms}`, step: (d, m) => [levelSticks(d, thr), m.t >= ms] });
/* Elevator held until the nose has turned `rad` (seen), let go early. */
const pull = (stick, rad, thr = 1) => ({
  name: `pull ${stick} ${(rad / PI).toFixed(2)}pi`,
  step: (d, m) => {
    m.turned = (m.turned ?? 0) + Math.abs(d.q) * H;
    return [[0, stick, 0, thr], m.turned > rad - Math.abs(d.q) * 0.25];
  },
});
/* Ailerons held until the wings have turned `rad`. */
const roll = (stick, rad, thr = 0.75, pitch = 0, push = true) => ({
  name: `roll ${stick} ${(rad / PI).toFixed(2)}pi`,
  step: (d, m) => {
    m.turned = (m.turned ?? 0) + Math.abs(d.p) * H;
    return [[stick, pitch + (push && d.uz < -0.3 ? -0.12 : 0), Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, thr], m.turned > rad - Math.abs(d.p) * 0.35];
  },
});
/* The nose held on a world direction (a vertical or a 45 line). */
const line = (target, ms, thr = 1, until = null) => ({
  name: `line ${target.map((x) => x.toFixed(2))}`,
  step: (d, m) => {
    const [r, pi, y] = hangSticks(d.s, { target, rollStick: 0, kp: 4, kr: 0.5 });
    return [[quant(r), quant(pi), quant(y), thr], m.t >= ms || (until && until(d))];
  },
});
const UP = [0, 0, 1];
const DOWN = [0, 0, -1];
/* Point rolls: n stops in a full roll, each held a beat. */
const points = (n, stick = 0.5) => ({
  name: `${n} points`,
  step: (d, m) => {
    m.q = m.q ?? 0;
    m.hold = m.hold ?? 0;
    if (m.hold > 0) {
      m.hold -= EVERY;
      return [[0, d.uz < -0.5 ? -0.15 : d.uz > 0.5 ? 0.05 : 0, Math.abs(d.lz) > 0.5 ? quant(-0.6 * d.lz) : 0, 0.75], false];
    }
    m.turned = (m.turned ?? 0) + Math.abs(d.p) * H;
    if (m.turned > (m.q + 1) * 2 * PI / n - Math.abs(d.p) * 0.6) {
      m.q += 1;
      m.hold = 400;
    }
    return [[stick, 0.05, 0, 0.75], m.q >= n];
  },
});
/* Hang on the prop: the nose up, the height on the throttle. */
const hang = (ms, { rollStick = 0 } = {}) => ({
  name: `hang ${ms}`,
  step: (d, m) => {
    m.thr = clamp((m.thr ?? 0.6) - H * (0.4 * d.vz), 1) ;
    const [r, pi, y] = hangSticks(d.s, { target: UP, rollStick, kp: 4, kr: 0.5 });
    return [[quant(r), quant(pi), quant(y), Math.max(0, quant(m.thr))], m.t >= ms];
  },
});
/* A harrier: slow, the nose high, held on the elevator, wings level. */
const harrier = (ms, { inverted = false, rollStick = null } = {}) => ({
  name: `harrier ${ms}`,
  step: (d, m) => {
    const sign = inverted ? -1 : 1;
    m.thr = clamp((m.thr ?? 0.55) - H * 0.3 * d.vz, 1);
    const ail = rollStick ?? quant(clamp(-0.5 * d.lz * Math.sign(d.uz || 1) - 0.04 * d.p, 0.5));
    return [[ail, quant(sign * 0.75), 0, Math.max(0, quant(m.thr))], m.t >= ms];
  },
});
/* Slowing down level to a speed. */
const slow = (to) => ({ name: `slow to ${to}`, step: (d) => [[...levelSticks(d, 0).slice(0, 3), 0], d.v < to] });
/* Full rudder until the nose points down (a stall turn's pivot). */
const kick = () => ({ name: 'kick', step: (d) => [[0, 0, -1, 0.5], d.nz < -0.6] });
/* Throttle off, sticks held, until the aircraft slides back and then
 * falls through (a tailslide). */
const slide = () => ({ name: 'slide', step: (d, m) => [[0, 0, 0, 0], m.t > 600 && d.nz < -0.3] });
/* Sticks held as given for a time. */
const hold = (st, ms) => ({ name: `hold ${st}`, step: (d, m) => [st, m.t >= ms] });

const L = (ms = 3000) => level(ms);
const D45 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
const U45 = [Math.SQRT1_2, 0, Math.SQRT1_2];
const B45 = [-Math.SQRT1_2, 0, -Math.SQRT1_2];

/* The programs. The aircraft starts level at 22 m/s heading +x, 150 m up. */
const PROGRAMS = {
  half_roll: [L(), roll(0.5, PI), level(3000)],
  double_roll: [L(), roll(0.6, 4 * PI), L()],
  slow_roll: [L(), roll(0.15, 2 * PI, 0.9), L()],
  two_point_roll: [L(), points(2), L()],
  eight_point_roll: [L(), points(8, 0.6), L()],
  barrel_roll: [L(), roll(0.35, 2 * PI, 1, 0.3, false), L()],
  outside_loop: [L(), pull(-0.55, 2 * PI), L()],
  immelmann: [L(), pull(0.55, PI), roll(0.5, PI), L()],
  split_s: [L(), roll(0.5, PI), pull(0.55, PI, 0.5), L()],
  half_cuban: [L(), pull(0.55, 1.25 * PI), line(B45, 800, 0.6), roll(0.5, PI, 0.6), line(B45, 800, 0.6), pull(0.55, 0.25 * PI), L()],
  cuban_8: [L(), pull(0.55, 1.25 * PI), line(B45, 800, 0.6), roll(0.5, PI, 0.6), line(B45, 800, 0.6),
    pull(0.55, 1.5 * PI), line(D45, 800, 0.6), roll(0.5, PI, 0.6), line(D45, 800, 0.6), pull(0.55, 0.25 * PI), L()],
  reverse_half_cuban: [L(), pull(0.55, 0.25 * PI), line(U45, 800), roll(0.5, PI), line([-Math.SQRT1_2, 0, Math.SQRT1_2], 600), pull(0.55, 1.25 * PI, 0.6), L()],
  reverse_cuban_8: [L(), pull(0.55, 0.25 * PI), line(U45, 800), roll(0.5, PI), line([-Math.SQRT1_2, 0, Math.SQRT1_2], 600), pull(0.55, 1.5 * PI, 0.6),
    line([-Math.SQRT1_2, 0, Math.SQRT1_2], 800), roll(0.5, PI), line(U45, 600), pull(0.55, 1.25 * PI, 0.6), L()],
  humpty_bump: [L(), pull(0.55, 0.5 * PI), line(UP, 1500), pull(1, PI, 0.4), line(DOWN, 1500, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  hammerhead: [L(), pull(0.55, 0.5 * PI), line(UP, 4000, 0.6, (d) => d.v < 7), kick(), line(DOWN, 1500, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  tailslide: [L(), pull(0.55, 0.5 * PI), line(UP, 4000, 0.4, (d) => d.v < 4), slide(), line(DOWN, 1500, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  knife_edge_pass: [L(), roll(0.5, 0.5 * PI, 1), hold([0, 0, -0.6, 1], 3000), roll(-0.5, 0.5 * PI), L()],
  ke_loop: [L(), roll(0.5, 0.5 * PI, 1), hold([0, 0, -1, 1], 7000), L()],
  rolling_circle: [L(), { name: 'rolling circle', step: (d, m) => [[0.3, quant(0.35 * d.uz), quant(-0.5 * d.lz), 1], m.t > 9000] }, L()],
  hover: [slow(14), pull(0.6, 0.5 * PI, 0.8), hang(5000), line(DOWN, 800, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  torque_roll: [slow(14), pull(0.6, 0.5 * PI, 0.8), hang(5000, { rollStick: 0.15 }), line(DOWN, 800, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
  harrier: [slow(10), harrier(5000), L()],
  inverted_harrier: [L(), roll(0.5, PI), slow(10), harrier(5000, { inverted: true }), roll(0.5, PI), L()],
  rolling_harrier: [slow(10), harrier(1500), harrier(4000, { rollStick: 0.35 }), L()],
  waterfall: [L(), pull(0.55, 0.5 * PI), line(UP, 4000, 0.6, (d) => d.v < 8), hold([0, -1, 0, 1], 1500), L()],
  wall: [slow(13), pull(1, 0.5 * PI, 1), hang(2500), line(DOWN, 800, 0.3), pull(0.55, 0.5 * PI, 0.6), L()],
};

async function fly(program) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(EXTRA_AIRFRAME), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_wing_set_stab(0), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 150, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(22), 'sim_wing_launch');
  const got = [];
  const det = new FigureDetector((f) => got.push(f));
  const seen = [];
  let i = 0;
  let mem = { t: 0 };
  let st = [0, 0, 0, 0.75];
  let ms = 0;
  let minZ = Infinity;
  for (; ms < 90000 && i < program.length; ms += MS) {
    const o = see(sim.readState().state);
    seen.push(o);
    if (o.z < minZ) minZ = o.z;
    det.step(MS / 1000, o.s);
    mem.t += MS;
    if (seen.length > LAG && ms % EVERY === 0) {
      const d = seen[seen.length - 1 - LAG];
      const [sticks, done] = program[i].step(d, mem);
      st = sticks;
      if (trace) console.log(`  ${ms} ${program[i].name} v ${o.v.toFixed(1)} z ${o.z.toFixed(0)} nz ${o.nz.toFixed(2)} uz ${o.uz.toFixed(2)} [${st.join(',')}]`);
      if (done) {
        i += 1;
        mem = { t: 0 };
      }
    }
    must(sim.input(ms / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
  }
  det.flush();
  return { got, finished: i >= program.length, ms, minZ };
}

const rows = [];
for (const f of FIGURES.filter((x) => x.physics === 'unproven' && PROGRAMS[x.id] && (!only || only.includes(x.id)))) {
  const r = await fly(PROGRAMS[f.id]);
  const hit = r.got.find((g) => g.figure === f.id);
  const named = r.got.map((g) => `${g.figure} ${g.grade}`).join(', ') || 'nothing';
  rows.push({ id: f.id, hit: Boolean(hit), grade: hit ? hit.grade : null, named, finished: r.finished, minZ: r.minZ });
  console.log(`${hit ? 'NAMED ' : 'MISSED'} ${f.id.padEnd(20)} ${hit ? `grade ${hit.grade}` : ''}  flew: ${named}${r.finished ? '' : ' (program unfinished)'}  lowest ${r.minZ.toFixed(0)} m`);
}
const n = rows.filter((r) => r.hit).length;
console.log(`\nfigures plant sweep: ${n} of ${rows.length} named as flown`);
