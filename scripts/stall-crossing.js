/*
 * stall-crossing.js: the proof that the post stall model of
 * docs/STALL-STAGE1.md leaves flight below the stall alone. Every
 * recorded flight the gates hash is replayed a millisecond at a time on
 * two modules side by side, the one at --base (a git ref, default
 * origin/main) and this tree's dist/sim.wasm, and the state blocks are
 * compared step by step. A recording that never diverges is untouched. For
 * one that does, the step it first diverges at is printed with what the
 * base module's aircraft was doing on it: its angle of attack, the roll
 * and yaw rates' share at each panel, and the angle at which the first
 * panel's stall blend begins, from its table. A divergence with the wing
 * short of that angle would be the model reaching below the stall, and is
 * reported as such, with a non zero exit.
 *
 * One table change is not the aero model's and differs from the first
 * step on its own: the Bramor's risers, which moved with it from 64 to 48
 * mm ahead of the CG (scripts/bramor-derive.js), act from the pull, which
 * is the chute recording's first step. That recording is reported as
 * moved for that reason; against the model alone, without the move, its
 * first difference is at 185 ms with the wing at 5.57 deg, in the stall.
 *
 *   node scripts/stall-crossing.js [--base=<ref>]
 *
 * Harness arithmetic in JS maths, which is allowed: nothing it prints is
 * hashed.
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

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim } from '../tests/lib/simmod.js';
import { decodeRec } from '../tests/lib/recfile.js';
import {
  must, wingDebug, wingPrelude, skyPrelude, cubGroundPrelude, gliderRecPrelude, bramorPrelude,
  bramorChutePrelude, slowstickGroundPrelude, timberRecPrelude, timberFloatRecPrelude,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const baseArg = process.argv.find((a) => a.startsWith('--base='));
const baseRef = baseArg ? baseArg.slice(7) : 'origin/main';
const show = spawnSync('git', ['show', `${baseRef}:dist/sim.wasm`], { cwd: root, maxBuffer: 1 << 28 });
if (show.status !== 0) {
  throw new Error(`git show ${baseRef}:dist/sim.wasm failed: ${show.stderr}`);
}
const baseBytes = new Uint8Array(show.stdout);
const headBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;

/* From each table in src/native/plant_wing.c: span, cl_alpha, cl_p, the
 * clean CLmax (slats in where fitted), the blend, the asymmetry, and the
 * flaps' lift and CLmax per radian where there are flaps. */
const T = {
  wing: { b: 1.0, cla: 4.36, clp: -0.40, clmax: 0.90, blend: 3, asym: 0.00455 },
  sky: { b: 1.80, cla: 5.52, clp: -0.78, clmax: 1.10, blend: 3, asym: 0.005 },
  cub: { b: 1.40, cla: 5.21, clp: -0.81, clmax: 1.15, blend: 3, asym: 0.005 },
  glider: { b: 2.00, cla: 5.709, clp: -0.786, clmax: 1.05, blend: 3, asym: 0.00536 },
  bramor: { b: 2.30, cla: 4.77, clp: -0.522, clmax: 0.722, blend: 3, asym: 0.00389 },
  slowstick: { b: 1.176, cla: 4.58, clp: -0.711, clmax: 1.05, blend: 4, asym: 0.0036 },
  timber: { b: 1.555, cla: 5.25, clp: -0.806, clmax: 1.15 + 0.305, blend: 3, asym: 0.00431, cldf: 1.2391, cldf2: -0.6681, clmaxdf: 0.7689 },
};
T.bramorChute = T.bramor;
T.timberf = T.timber;

/* Recordings that differ for a stated reason other than the stall model. */
const MOVED = { bramorChute: 'the risers moved from 64 to 48 mm ahead of the CG' };

const RECS = [
  ['wing', 'tests/inputs/wing-baseline.rec', wingPrelude],
  ['sky', 'tests/inputs/sky-baseline.rec', skyPrelude],
  ['cub', 'tests/inputs/cub-baseline.rec', (s) => cubGroundPrelude(s)],
  ['glider', 'tests/inputs/glider-baseline.rec', gliderRecPrelude],
  ['bramor', 'tests/inputs/bramor-baseline.rec', bramorPrelude],
  ['bramorChute', 'tests/inputs/bramor-chute.rec', bramorChutePrelude],
  ['slowstick', 'tests/inputs/slowstick-baseline.rec', (s) => slowstickGroundPrelude(s)],
  ['timber', 'tests/inputs/timber-baseline.rec', timberRecPrelude],
  ['timberf', 'tests/inputs/timberf-baseline.rec', timberFloatRecPrelude],
];

async function rig(bytes, prelude) {
  const sim = await loadSim(bytes);
  must(sim.init(configText), 'sim_init');
  prelude(sim);
  return sim;
}

let bad = 0;
for (const [key, file, prelude] of RECS) {
  const rec = decodeRec(new Uint8Array(await readFile(join(root, file))));
  const a = await rig(baseBytes, prelude);
  const b = await rig(headBytes, prelude);
  const durationMs = Math.round((rec.count * 1000) / rec.rateHz);
  let next = 0;
  let first = null;
  for (let ms = 0; ms < durationMs && first === null; ms += 1) {
    while (next < rec.count && Math.floor(rec.samples[next].tUs / 1000) <= ms) {
      const s = rec.samples[next];
      must(a.input(s.tUs / 1e6, s.roll, s.pitch, s.yaw, s.throttle), 'sim_input');
      must(b.input(s.tUs / 1e6, s.roll, s.pitch, s.yaw, s.throttle), 'sim_input');
      next += 1;
    }
    /* What the base aircraft was doing on the step: the rates it began
     * with, and the plant's own angle of attack and body air speed. */
    const st = a.readState().state;
    must(a.step(1), 'sim_step');
    const d = wingDebug(a);
    must(b.step(1), 'sim_step');
    const ba = a.readStateBytes().bytes;
    const bb = b.readStateBytes().bytes;
    let same = ba.length === bb.length;
    for (let i = 0; same && i < ba.length; i += 1) {
      same = ba[i] === bb[i];
    }
    if (!same) {
      first = { ms, st, d, flap: a.e.sim_wing_flaps ? a.e.sim_wing_flaps() : 0 };
    }
  }
  if (!first) {
    console.log(`${key.padEnd(12)} identical for all ${durationMs} ms`);
    continue;
  }
  const t = T[key];
  const { st, d, flap } = first;
  const Vtrue = Math.hypot(d[15], d[16], d[17]);
  const V = Math.max(1, Vtrue);
  const yc = t.b * Math.sqrt(-t.clp / (2 * t.cla));
  const df = flap || 0;
  const dcl = t.cldf ? t.cldf * df + t.cldf2 * df * df : 0;
  const clmax = t.clmax + (t.clmaxdf ? t.clmaxdf * df : 0);
  const onset = clmax / t.cla - t.blend / DEG - t.asym / 2;
  const alpha = d[0];
  const roll = Math.abs(st[11]) * yc / V;
  const yaw = Math.abs(-d[17] / V * st[13]) * yc / V;
  const reach = Math.abs(alpha + dcl / t.cla) + roll + yaw;
  const inStall = reach >= onset - 1e-12;
  if (!inStall && !MOVED[key]) bad += 1;
  console.log(`${key.padEnd(12)} first differs at ${first.ms} ms: alpha ${(alpha * DEG).toFixed(2)} deg`
    + `${dcl ? ` (flaps ${(dcl / t.cla * DEG).toFixed(2)})` : ''}, roll rate ${(roll * DEG).toFixed(2)} and yaw rate ${(yaw * DEG).toFixed(2)} at the panel, `
    + `${Vtrue.toExponential(2)} m/s, ${st[3].toFixed(2)} m up: reaches ${(reach * DEG).toFixed(2)} deg against the first panel's blend from `
    + `${(onset * DEG).toFixed(2)}: ${inStall ? 'in the stall' : (MOVED[key] ? `moved: ${MOVED[key]}` : 'BELOW THE STALL')}`);
}
if (bad > 0) {
  process.exitCode = 1;
}
