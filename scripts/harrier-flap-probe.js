/*
 * harrier-flap-probe.js: does the radio's elevator to flap mix steady a
 * harrier? The 3D video study (a Night Timber X, 05:00 to 05:20) flies the
 * harrier on full up elevator with "elevator flaps" mixed in and shows the
 * wing rock grow to 30 deg at about 1.5 s with the mix switched off. Here
 * the Turbo Timber, the class's aircraft in the sim, is flown into a
 * harrier by a pilot with a person's limits (hover-probe.js's: sees 0.2 s
 * late, moves the sticks ten times a second in fiftieths): from level at
 * 1.3 times the stall, the elevator is eased to full up over 3 s and held,
 * the wings held level on the ailerons, the height on the throttle. Over
 * the last 10 s of 20 the row is the bank's spread and worst, the rock's
 * period from its zero crossings, the pitch and the speed, for each mix
 * step, in Manual and in AS3X. A grid of aileron pilots; the best one is
 * reported, as the hover probe does. It measures, it does not judge.
 *
 *   node scripts/harrier-flap-probe.js [--plane timber1500]
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
import { TABLE } from '../configs/power.js';
import { ELEV_FLAPS, setupFor, tuneBlock } from '../configs/tuning.js';
import { loadSim } from '../tests/lib/simmod.js';
import { attitude, must } from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const DEG = 180 / Math.PI;
const MS = 4;
const LAG_S = 0.2;
const EVERY_MS = 100;
const STEPS = 50;
const SECONDS = 20;
const GRID = { kb: [0.3, 0.6, 1, 1.5, 2.5], kp: [0, 0.05, 0.1, 0.2, 0.4] };

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const af = AIRFRAMES.find((a) => a.id === arg('--plane', 'timber1500'));
const clamp = (x, m = 1) => Math.max(-m, Math.min(m, x));
const quant = (x) => clamp(Math.round(x * STEPS) / STEPS);

const sim = await loadSim(wasmBytes);
must(sim.init(configText), 'sim_init');
must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
const set = setupFor(af.id, null);

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
  let st = [0, 0, 0, 0.7], base = 0.7;
  for (let ms = 0; ms < SECONDS * 1000; ms += MS) {
    const s = sim.readState().state;
    const bank = Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
    seen.push({ bank, p: s[11], z: s[3], vz: s[6] });
    if (ms >= 10000) out.push({ bank, pitch: attitude(s).pitch, v: Math.hypot(s[4], s[5], s[6]), z: s[3] });
    if (ms % EVERY_MS === 0 && seen.length > lag) {
      const d = seen[seen.length - 1 - lag];
      const h = EVERY_MS / 1000;
      base = clamp(base - h * (0.05 * (d.z - 100) + 0.3 * d.vz), 1);
      st = [
        quant(-g.kb * d.bank - g.kp * d.p),
        quant(Math.min(1, ms / 3000)),
        0,
        Math.max(0, quant(base - 0.1 * d.vz)),
      ];
    }
    must(sim.input(ms / 1000, ...st), 'sim_input');
    must(sim.step(MS), 'sim_step');
  }
  const banks = out.map((o) => o.bank * DEG);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const m = mean(banks);
  const sd = Math.sqrt(mean(banks.map((b) => (b - m) ** 2)));
  let cross = 0;
  for (let i = 1; i < banks.length; i += 1) if ((banks[i - 1] - m) * (banks[i] - m) < 0) cross += 1;
  const lost = out.some((o) => Math.abs(o.z - 100) > 30);
  return {
    sd, worst: Math.max(...banks.map(Math.abs)), period: cross > 1 ? (2 * 10) / cross : null,
    pitch: mean(out.map((o) => o.pitch)) * DEG, v: mean(out.map((o) => o.v)), lost,
  };
}

const f = (x, d = 1) => (x == null ? 'n/a' : x.toFixed(d));
console.log(`${af.id}, harrier on full up elevator, person-paced pilot, last 10 s of 20`);
for (const [mode, name] of [[0, 'Manual'], [3, 'AS3X']]) {
  for (const mix of ELEV_FLAPS) {
    let best = null;
    for (const kb of GRID.kb) for (const kp of GRID.kp) {
      const r = fly(mode, mix, { kb, kp });
      if (!r.lost && (!best || r.sd < best.sd)) best = { ...r, kb, kp };
    }
    console.log(`  ${name.padEnd(7)} mix ${String(mix).padStart(3)}%  ${best
      ? `bank sd ${f(best.sd)} deg, worst ${f(best.worst)}, period ${f(best.period, 2)} s, pitch ${f(best.pitch)} deg, ${f(best.v)} m/s`
      : 'every pilot lost the height'}`);
  }
}
must(sim.clearTune(), 'tune');
