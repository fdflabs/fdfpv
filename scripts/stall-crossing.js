/*
 * stall-crossing.js: the proof that the post stall model of
 * docs/STALL-STAGE1.md leaves flight short of the stall alone, and the
 * account of what it changes in each recorded flight the gates hash.
 *
 * Every recording is replayed a millisecond at a time on two modules side
 * by side, the one at --base (a git ref, default origin/main) and this
 * tree's dist/sim.wasm, and the state blocks are compared step by step.
 * A recording that never diverges is untouched. For one that does:
 *
 *   first  the step it first diverges at, with what the base module's
 *          aircraft was doing on it: its angle of attack, what the roll and
 *          yaw rates add at the outermost strip, the chord's Reynolds
 *          number, and the stall angle from its table (less half the
 *          asymmetry, where the first strip stalls). The model takes
 *          nothing short of that angle or below a Reynolds number of 3e4,
 *          so a divergence there is the model reaching below the stall,
 *          and is reported as such, with a non zero exit.
 *   stalls every stretch of the base flight that reaches that angle, when
 *          and how deep, and what each module's aircraft did over it: the
 *          lowest pitch and the largest bank.
 *   end    where the two flights end apart: the distance between them and
 *          the difference in heading.
 *
 * One table change is not the aero model's and differs from the first
 * step on its own: the Bramor's risers, which moved with it from 64 to 48
 * mm ahead of the CG (scripts/bramor-derive.js), act from the pull, which
 * is the chute recording's first step. That recording is reported as
 * moved for that reason.
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
const NU = 1.789e-5 / 1.225;

/* From each table in src/native/plant_wing.c: span, mean chord, cl_alpha,
 * the clean CLmax (slats in where fitted), the asymmetry, and the flaps'
 * lift and CLmax per radian where there are flaps. */
const T = {
  wing: { b: 1.0, c: 0.22, cla: 4.36, clmax: 0.90, asym: 0.00455 },
  sky: { b: 1.80, c: 0.20, cla: 5.52, clmax: 1.10, asym: 0.005 },
  cub: { b: 1.40, c: 0.20, cla: 5.21, clmax: 1.15, asym: 0.005 },
  glider: { b: 2.00, c: 0.1866, cla: 5.709, clmax: 1.05, asym: 0.00536 },
  bramor: { b: 2.30, c: 0.257, cla: 4.77, clmax: 0.722, asym: 0.00389 },
  slowstick: { b: 1.176, c: 0.2776, cla: 4.58, clmax: 1.05, asym: 0.0036 },
  timber: { b: 1.555, c: 0.2322, cla: 5.25, clmax: 1.15 + 0.305, asym: 0.00431, cldf: 1.2391, cldf2: -0.6681, clmaxdf: 0.7689 },
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

const attitude = (s) => ({
  pitch: Math.asin(Math.max(-1, Math.min(1, 2 * (s[8] * s[10] - s[7] * s[9])))),
  bank: Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9])),
  heading: Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10])),
});

/* How far past its stall a step is: the angle the outermost strip can
 * reach less the first strip's stall angle, radians, and whether the
 * chord's Reynolds number lets the model act at all. */
function stallReach(t, st, d, flap) {
  const V = Math.hypot(d[15], d[16], d[17]);
  const Vr = Math.max(1, V);
  const y = 0.875 * t.b / 2;
  const dcl = t.cldf ? t.cldf * flap + t.cldf2 * flap * flap : 0;
  const clmax = t.clmax + (t.clmaxdf ? t.clmaxdf * flap : 0);
  const onset = clmax / t.cla - t.asym / 2;
  const rates = (Math.abs(st[11]) + Math.abs((V > 1e-9 ? -d[17] / V : 0) * st[13])) * y / Vr;
  const aa = Math.abs(d[0] + dcl / t.cla);
  return { V, alpha: d[0], aa, rates, onset, reach: aa + rates - onset, re: V * t.c / NU, dcl };
}

let bad = 0;
for (const [key, file, prelude] of RECS) {
  const rec = decodeRec(new Uint8Array(await readFile(join(root, file))));
  const a = await rig(baseBytes, prelude);
  const b = await rig(headBytes, prelude);
  const t = T[key];
  const durationMs = Math.round((rec.count * 1000) / rec.rateHz);
  let next = 0;
  let first = null;
  const stalls = [];
  let cur = null;
  let sa = a.readState().state;
  let sb = b.readState().state;
  for (let ms = 0; ms < durationMs; ms += 1) {
    while (next < rec.count && Math.floor(rec.samples[next].tUs / 1000) <= ms) {
      const s = rec.samples[next];
      must(a.input(s.tUs / 1e6, s.roll, s.pitch, s.yaw, s.throttle), 'sim_input');
      must(b.input(s.tUs / 1e6, s.roll, s.pitch, s.yaw, s.throttle), 'sim_input');
      next += 1;
    }
    /* What the base aircraft was doing on the step: the rates it began
     * with, and the plant's own angle of attack and body air speed. */
    const st = sa;
    must(a.step(1), 'sim_step');
    must(b.step(1), 'sim_step');
    const d = wingDebug(a);
    const flap = a.e.sim_wing_flaps();
    const r = stallReach(t, st, d, flap);
    sa = a.readState().state;
    sb = b.readState().state;
    if (first === null) {
      const ba = a.readStateBytes().bytes;
      const bb = b.readStateBytes().bytes;
      let same = ba.length === bb.length;
      for (let i = 0; same && i < ba.length; i += 1) {
        same = ba[i] === bb[i];
      }
      if (!same) {
        first = { ms, st, r };
      }
    }
    const inStall = r.reach >= -1e-12 && r.re >= 3.0e4;
    const pa = attitude(sa);
    const pb = attitude(sb);
    if (inStall && !cur) {
      cur = { t0: ms, t1: ms, maxA: 0, minV: Infinity, pitchA: Infinity, pitchB: Infinity, bankA: 0, bankB: 0 };
      stalls.push(cur);
    }
    if (cur) {
      if (inStall) {
        cur.t1 = ms;
      }
      cur.maxA = Math.max(cur.maxA, r.aa);
      cur.minV = Math.min(cur.minV, r.V);
      cur.pitchA = Math.min(cur.pitchA, pa.pitch);
      cur.pitchB = Math.min(cur.pitchB, pb.pitch);
      cur.bankA = Math.max(cur.bankA, Math.abs(pa.bank));
      cur.bankB = Math.max(cur.bankB, Math.abs(pb.bank));
      /* A stretch ends half a second after the base flight leaves the
       * stall, so the break that follows it is in it. */
      if (!inStall && ms - cur.t1 > 500) {
        cur = null;
      }
    }
  }
  if (!first) {
    console.log(`${key.padEnd(12)} identical for all ${durationMs} ms`);
    continue;
  }
  const { st, r } = first;
  const inStall = r.reach >= -1e-12 && r.re >= 3.0e4;
  if (!inStall && !MOVED[key]) bad += 1;
  console.log(`${key.padEnd(12)} first differs at ${first.ms} ms: alpha ${(r.alpha * DEG).toFixed(2)} deg`
    + `${r.dcl ? ` (flaps add ${(r.dcl / t.cla * DEG).toFixed(2)})` : ''}, the rates add ${(r.rates * DEG).toFixed(2)} at the tip strip, `
    + `${r.V.toFixed(2)} m/s, Re ${(r.re / 1000).toFixed(0)}k, ${st[3].toFixed(2)} m up; the first strip stalls at ${(r.onset * DEG).toFixed(2)}: `
    + `${inStall ? 'in the stall' : (MOVED[key] ? `moved: ${MOVED[key]}` : 'BELOW THE STALL')}`);
  for (const s of stalls.slice(0, 6)) {
    console.log(`             stall ${(s.t0 / 1000).toFixed(2)} to ${(s.t1 / 1000).toFixed(2)} s, up to ${(s.maxA * DEG).toFixed(1)} deg `
      + `at ${s.minV.toFixed(1)} m/s and more: lowest pitch ${(s.pitchA * DEG).toFixed(1)} before, ${(s.pitchB * DEG).toFixed(1)} after; `
      + `largest bank ${(s.bankA * DEG).toFixed(1)} before, ${(s.bankB * DEG).toFixed(1)} after`);
  }
  if (stalls.length > 6) {
    console.log(`             and ${stalls.length - 6} more stretches`);
  }
  let dh = attitude(sb).heading - attitude(sa).heading;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  console.log(`             end: ${Math.hypot(sb[1] - sa[1], sb[2] - sa[2], sb[3] - sa[3]).toFixed(2)} m apart, heading ${(dh * DEG).toFixed(1)} deg apart`);
}
if (bad > 0) {
  process.exitCode = 1;
}
