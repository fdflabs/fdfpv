/*
 * figures-knife-check.js: a knife edge pass the real plant flies is named
 * a knife edge however much sideslip holds it up.
 *
 * A judge calls a knife edge by the wing, in the vertical plane along the
 * line (FAI F3P-AA 23: "During the knife edge the wing must be in the
 * vertical plane"), not by the fuselage, which yaws nose up by the
 * sideslip that holds the height. The flight is the aircraft's own knife
 * edge gate's (extra-gates.js E12, cap580-gates.js C12): level at the gate's speed, rolled to
 * 90 deg on the ailerons, the height held on the rudder through the
 * sideslip, the heading on the elevator, the speed on the throttle; then
 * rolled back level. The detector is fed every plant step, as main.js
 * feeds it. The pass must hold more than 26 deg of sideslip (or it would
 * not test what the judge used to refuse), be named a knife edge pass
 * graded 4 to 10, and nothing else may be named.
 *
 *   node scripts/figures-knife-check.js [extra|cap]
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
import { must, fly, wingDebug, EXTRA_AIRFRAME, CAP_AIRFRAME, RC_STEP_MS } from '../tests/lib/wingpilot.js';
import { FigureDetector } from '../src/game/figuredetect.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const json = async (f) => JSON.parse(await readFile(join(root, f), 'utf8'));

/* Each aircraft at its knife edge gate's speed. */
const PLANES = {
  extra: { sim: EXTRA_AIRFRAME, name: 'Extra', speed: (await json('tests/extra-thresholds.json')).e12_knife_edge.speed },
  cap: { sim: CAP_AIRFRAME, name: 'CAP', speed: (await json('tests/cap580-thresholds.json')).c12_knife_edge.speed },
};
const plane = PLANES[process.argv[2] || 'extra'];
if (!plane) {
  console.log(`figures knife check: no plane ${process.argv[2]}; one of ${Object.keys(PLANES).join(', ')}`);
  process.exit(2);
}

const DEG = 180 / Math.PI;
const KNIFE_MS = 8000;
const BACK_MS = 3000;
const fullBank = (s) => Math.atan2(2 * (s[9] * s[10] + s[7] * s[8]), 1 - 2 * (s[8] * s[8] + s[9] * s[9]));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const clamp = (v) => Math.max(-1, Math.min(1, v));
const heading = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

async function knifePass(V) {
  const sim = await loadSim(wasmBytes);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(plane.sim), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  const r = fly(sim, { duty: 0.6, vTarget: V, seconds: 10, speed0: V, guard: false, start: [0, 600, 60, 1, 0, 0, 0] });
  let clockMs = r.endMs;
  let s = sim.readState().state;
  const figures = [];
  const det = new FigureDetector((f) => figures.push(f));
  let iA = 0, iH = 0, iB = 0, iT = 0.6;
  const psi0 = heading(s);
  let sb = 0, n = 0;
  for (let ms = 0; ms < KNIFE_MS + BACK_MS; ms += RC_STEP_MS) {
    const dt = RC_STEP_MS / 1000;
    const back = ms >= KNIFE_MS;
    const bank = fullBank(s);
    const bankT = back ? Math.max(0, Math.PI / 2 - (ms - KNIFE_MS) / 1000 * 3) : Math.min(Math.PI / 2, ms / 1000 * 3);
    iA = Math.max(-0.5, Math.min(0.5, iA - 1.0 * (bank - bankT) * dt));
    const roll = clamp(-0.8 * (bank - bankT) - 0.05 * s[11] + iA);
    iH = Math.max(-0.3, Math.min(0.9, iH + 0.2 * (0 - s[6]) * dt));
    const betaT = back ? 0 : 0.3 + 0.2 * (0 - s[6]) + iH;
    const beta = wingDebug(sim)[1];
    iB = back ? 0 : Math.max(-1, Math.min(1, iB + 3 * (betaT - beta) * dt));
    const yaw = ms < 300 ? 0 : clamp(-3 * (betaT - beta) - iB + 0.3 * s[13]);
    let dpsi = heading(s) - psi0;
    while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
    while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
    /* Rolled level, the elevator holds the height again, not the heading. */
    const pitchStick = back && bank < 0.5 ? clamp(-0.3 * s[6] + 0.15 * s[12]) : clamp(0.8 * dpsi + 0.15 * s[12]);
    iT = Math.max(0, Math.min(1, iT + 0.0005 * (V - speed(s))));
    const t = clamp(iT + 0.1 * (V - speed(s)));
    must(sim.input(clockMs / 1000, roll, pitchStick, yaw, t), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    clockMs += RC_STEP_MS;
    s = sim.readState().state;
    det.step(RC_STEP_MS / 1000, s);
    if (ms >= 3000 && ms < KNIFE_MS) {
      sb += Math.abs(wingDebug(sim)[1]);
      n += 1;
    }
  }
  det.flush();
  return { figures, beta: sb / n * DEG };
}

const { figures, beta } = await knifePass(plane.speed);
const names = figures.map((f) => `${f.figure} ${f.grade}`).join(', ') || 'nothing';
console.log(`${plane.name} at ${plane.speed} m/s: sideslip ${beta.toFixed(1)} deg; named ${names}`);
check(`the ${plane.name}'s knife edge holds more than 26 deg of sideslip`, beta > 26, `${beta.toFixed(1)} deg`);
const k = figures.find((f) => f.figure === 'knife_edge_pass');
check(`the ${plane.name}'s knife edge pass is named and graded 4 to 10`, k && k.grade >= 4 && k.grade <= 10, k ? `grade ${k.grade}` : 'not named');
check('nothing else is named', figures.length === 1 && Boolean(k), names);
console.log(`\nfigures knife check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
