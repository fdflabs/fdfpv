/*
 * harrier-probe.js: can a person fly the aircraft's harrier, and what does
 * it look like? The 3D video study (analysis/3D-VIDEO-LESSONS.md, a Night
 * Timber X 1.2 m) flies it nose up 40 to 45 deg to its path at a crawl,
 * about 2 to 4 m/s (judged, not measured), on full up elevator with the
 * elevator flaps mixed in, and shows a wing rock of about 1.5 s period come
 * in with the mix off. This probe flies it the way a pilot does, not the
 * way harrier-flap-probe.js's level entry did: from level at 1.3 Vs the
 * throttle comes back and the elevator gently holds the height while the
 * speed bleeds to 1.1 Vs, then the power comes on, then the elevator is eased to full up over 3 s
 * and the throttle holds the height; the wings are held on the ailerons
 * and the heading on the rudder, as the video's pilot does. The pilot has a
 * person's limits (hover-probe.js's: sees 0.2 s late, moves the sticks ten
 * times a second in fiftieths). A grid of pilots; the steadiest that keeps
 * its height is reported, for each mix step, in Manual and in AS3X: the
 * angle of attack of the zero lift line and the body's to its path, the
 * pitch, the speed, the bank's spread and worst and the rock's period, over
 * the last 10 s of 25. It measures; it judges nothing.
 *
 *   node scripts/harrier-probe.js [--plane nighttimber1200] [--lag 0.2]
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

import { AIRFRAMES } from '../configs/airframes.js';
import { ELEV_FLAPS, setupFor, tuneBlock } from '../configs/tuning.js';
import { loadSim } from '../tests/lib/simmod.js';
import { must, wingDebug } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const MS = 4;
const EVERY_MS = 100;
const STEPS = 50;
const SECONDS = 25;
/* The video's harrier, nose 40 to 45 deg to its path: its middle. */
const HARRIER_DEG = 42.5;
const SLOW_S = 8;
const GRID = { kb: [0.6, 1.5, 3], kp: [0.1, 0.3], ky: [0.5, 1.5], kr: [0.1, 0.3] };

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const af = AIRFRAMES.find((a) => a.id === arg('--plane', 'nighttimber1200'));
const LAG_S = Number(arg('--lag', '0.2'));
/* --full-back: the video's pilot, "full back on the elevator" (05:00), the
 * angle what full up and the mix make of it, instead of a held angle. */
const FULL_BACK = process.argv.includes('--full-back');
const clamp = (x, m = 1) => Math.max(-m, Math.min(m, x));
const quant = (x) => clamp(Math.round(x * STEPS) / STEPS);

const sim = await loadSim(wasmBytes);
must(sim.init(configText), 'sim_init');
must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
const set = setupFor(af.id, null);

/* Bank, pitch and heading from the quaternion, atan2 so they read past 90. */
function euler(s) {
  const [w, x, y, z] = [s[7], s[8], s[9], s[10]];
  return {
    bank: Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y)),
    pitch: Math.asin(clamp(2 * (x * z - w * y))),
    hdg: Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
  };
}

function fly(mode, elevFlap, g) {
  const block = tuneBlock(af.id, elevFlap ? { elevFlap } : null, set.massKg, set.packKg);
  must(block ? sim.setTune(block) : sim.clearTune(), 'tune');
  must(sim.reset(), 'sim_reset');
  must(sim.e.sim_wing_set_stab(mode), 'sim_wing_set_stab');
  must(sim.e.sim_set_pose(0, 0, 100, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(1.3 * af.stall), 'sim_wing_launch');
  const lag = Math.round(LAG_S * 1000 / MS);
  const seen = [];
  const out = [];
  let st = [0, 0, 0, 0.5];
  let thr = 0.5, pitchI = 0, elevI = 0, phase = 'slow', t0 = 0;
  for (let ms = 0; ms < SECONDS * 1000; ms += MS) {
    const s = sim.readState().state;
    const e = euler(s);
    seen.push({ ...e, p: s[11], q: s[12], r: s[13], z: s[3], vz: s[6], v: Math.hypot(s[4], s[5], s[6]), alpha: wingDebug(sim)[0] });
    if (ms >= (SECONDS - 10) * 1000) {
      const v = Math.hypot(s[4], s[5], s[6]);
      const path = Math.asin(clamp(s[6] / Math.max(v, 1e-6)));
      out.push({ bank: e.bank, pitch: e.pitch, path, v, z: s[3], alpha: wingDebug(sim)[0] });
    }
    if (ms % EVERY_MS === 0 && seen.length > lag) {
      const d = seen[seen.length - 1 - lag];
      const h = EVERY_MS / 1000;
      const dz = d.z - 100;
      let elev;
      if (phase === 'slow') {
        /* Slowing: the throttle back, the height held on the elevator, gently
         * (a pilot eases the nose up as the speed goes, short of the
         * stall), until the airspeed is down to 1.1 Vs, which the pilot
         * reads off the model's attitude and the sound. */
        thr = 0.3;
        pitchI = clamp(pitchI - h * 0.02 * dz, 0.4);
        elev = clamp(pitchI - 0.04 * dz - 0.1 * d.vz, 0.6);
        if (d.v < 1.1 * af.stall || ms > SLOW_S * 1000) { phase = 'into'; t0 = ms; thr = 0.6; elevI = elev; }
      } else {
        /* Into the harrier: the nose brought up to the video's 40 to 45 deg
         * to the path over 5 s and held there on the elevator, the trim's
         * integral a pilot's hand, the throttle on the height. The pilot
         * judges the nose against the path, the angle of attack. */
        const aT = Math.min(HARRIER_DEG / DEG, d.alpha < 0 ? 0 : (0.2 + (HARRIER_DEG / DEG - 0.2) * Math.min(1, (ms - t0) / 5000)));
        elevI = clamp(elevI + h * 1.5 * (aT - d.alpha));
        elev = FULL_BACK ? Math.min(1, Math.max(elevI, (ms - t0) / 3000)) : clamp(1.5 * (aT - d.alpha) + 0.15 * d.q + elevI);
        /* Never below 0.45 on the way in: the prop's wash holds the tail and
         * the ailerons, and a pilot does not chop it with the nose coming up. */
        thr = Math.max(0.45, clamp(thr - h * (0.05 * dz + 0.3 * d.vz), 1));
      }
      st = [
        quant(-g.kb * d.bank - g.kp * d.p),
        quant(elev),
        quant(g.ky * d.hdg + g.kr * d.r),
        Math.max(0, quant(thr - 0.1 * d.vz)),
      ];
    }
    must(sim.input(ms / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const banks = out.map((o) => o.bank * DEG);
  const m = mean(banks);
  const sd = Math.sqrt(mean(banks.map((b) => (b - m) ** 2)));
  let cross = 0;
  for (let i = 1; i < banks.length; i += 1) if ((banks[i - 1] - m) * (banks[i] - m) < 0) cross += 1;
  return {
    sd, worst: Math.max(...banks.map(Math.abs)), period: cross > 1 ? (2 * 10) / cross : null,
    alpha: mean(out.map((o) => o.alpha)) * DEG, body: mean(out.map((o) => o.pitch - o.path)) * DEG,
    pitch: mean(out.map((o) => o.pitch)) * DEG, v: mean(out.map((o) => o.v)),
    lost: out.some((o) => Math.abs(o.z - 100) > 30),
  };
}

const f = (x, d = 1) => (x == null ? 'n/a' : x.toFixed(d));
console.log(`${af.id}, harrier from a slow entry, aileron and rudder, ${LAG_S} s late, last 10 s of ${SECONDS}`);
console.log('  the video (Night Timber X): body 40 to 45 deg to its path, about 2 to 4 m/s, rock period about 1.5 s with the mix off');
for (const [mode, name] of [[0, 'Manual'], [3, 'AS3X']]) {
  for (const mix of ELEV_FLAPS) {
    let best = null;
    for (const kb of GRID.kb) for (const kp of GRID.kp) for (const ky of GRID.ky) for (const kr of GRID.kr) {
      const r = fly(mode, mix, { kb, kp, ky, kr });
      if (!r.lost && (!best || r.sd < best.sd)) best = { ...r, kb, kp, ky, kr };
    }
    console.log(`  ${name.padEnd(7)} mix ${String(mix).padStart(3)}%  ${best
      ? `body ${f(best.body)} deg to the path (zero lift ${f(best.alpha)}), pitch ${f(best.pitch)}, ${f(best.v)} m/s, bank sd ${f(best.sd)} worst ${f(best.worst)}, period ${f(best.period, 2)} s`
      : 'every pilot lost the height'}`);
  }
}
must(sim.clearTune(), 'tune');
