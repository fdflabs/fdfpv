/*
 * knife-throttle-derive.js: the knife edge pilot's throttle on the sink
 * rate (tests/lib/wingpilot.js KNIFE_SINK), designed as every other person
 * loop is: the airframe's own response from throttle to climb rate,
 * measured in the held knife edge each gate flies (extra-gates.js E12,
 * cap580-gates.js C12, slick-gates.js S12, figures-knife-check.js), and
 * the crossover the person keeps there by the bandwidth criterion, 45 deg
 * of phase and 6 dB of gain with the person's 0.2 s delay and hold
 * (wingpilot.js crossoverFor, MIL-STD-1797A in Peahl, Kolkailah and
 * Sandlin, NASA NCC2-338). The gain is personLoop's, wc over the plant's
 * gain at the crossover.
 *
 * The knife edge is the gates' own hands (rolled to 90 deg on the
 * ailerons, the rudder put on to the derivation's share of its throw and
 * left there, the height on the throttle, the heading on the elevator;
 * the sources at wingpilot.js knifeThrottle), flown 12 s to settle
 * (SETTLE_SINK below) and captured there with the hands' integrals; the
 * sweep then flies from that state with the throttle held at the captured
 * stick and stepped, the bank and heading hands closed (successive loop
 * closure, McRuer, Ashkenas and Graham 1973) and the rudder where it is.
 *
 *   node scripts/knife-throttle-derive.js           print each design
 *   node scripts/knife-throttle-derive.js --check   fail where KNIFE_SINK
 *                                                   is not the design
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

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import {
  must, fly, fullBank, leadDesign, stickForThrow, RC_STEP_MS, KNIFE_SINK, EXTRA_AIRFRAME, CAP_AIRFRAME, SLICK_AIRFRAME,
} from '../tests/lib/wingpilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const json = async (f) => JSON.parse(await readFile(join(root, f), 'utf8'));
const clamp = (v) => Math.max(-1, Math.min(1, v));
const speed = (s) => Math.hypot(s[4], s[5], s[6]);
const yawOf = (s) => Math.atan2(2 * (s[7] * s[10] + s[8] * s[9]), 1 - 2 * (s[9] * s[9] + s[10] * s[10]));
const AIR = [0, 600, 60, 1, 0, 0, 0];
const STEP_S = 0.5;
/* The settling flight only finds the held knife edge: there the sink is
 * zero and this gain drops out of the throttle, so the point the design is
 * taken at is the knife edge's, whatever gain reached it; its trim's
 * integral is cornered as the designed hand's, at 2 rad/s over 4. */
const SETTLE_SINK = 0.3;

const PLANES = [
  { name: 'extra', airframe: EXTRA_AIRFRAME, knife: (await json('tests/extra-thresholds.json')).e12_knife_edge },
  { name: 'cap', airframe: CAP_AIRFRAME, knife: (await json('tests/cap580-thresholds.json')).c12_knife_edge },
  { name: 'slick', airframe: SLICK_AIRFRAME, knife: (await json('tests/slick-thresholds.json')).s12_knife_edge },
];

/* The gates' hands but the throttle, one step: h holds the ailerons'
 * integral, psi0 and the rudder, put on over half a second and left. */
function hands(sim, s, h, ms, dt) {
  const bank = fullBank(s);
  const bankT = Math.min(Math.PI / 2, ms / 1000 * 3);
  h.iA = Math.max(-0.5, Math.min(0.5, h.iA - 1.0 * (bank - bankT) * dt));
  const roll = clamp(-0.8 * (bank - bankT) - 0.05 * s[11] + h.iA);
  const yaw = ms < 300 ? 0 : h.rudder * Math.min(1, (ms - 300) / 500);
  let dpsi = yawOf(s) - h.psi0;
  while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
  while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
  const pitch = clamp(0.8 * dpsi + 0.15 * s[12]);
  return [roll, pitch, yaw];
}

async function design(p) {
  const sim = await loadSim(wasmBytes);
  if (sim.init(configText) !== SIM_OK) throw new Error('sim_init failed');
  must(sim.e.sim_set_airframe(p.airframe), 'sim_set_airframe');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  const V = p.knife.speed;
  let clock = fly(sim, { duty: 0.6, vTarget: V, seconds: 10, speed0: V, guard: false, start: AIR }).endMs;
  let s = sim.readState().state;
  const h = { iA: 0, psi0: yawOf(s), rudder: -stickForThrow(p.knife.rudderDerived) };
  const dt = RC_STEP_MS / 1000;
  let yawStick = 0, thrStick = 0, iT = p.knife.dutyDerived;
  for (let ms = 0; ms < 12000; ms += RC_STEP_MS) {
    const st = hands(sim, s, h, ms, dt);
    yawStick = st[2];
    iT = Math.max(0, Math.min(1, iT + SETTLE_SINK * (0 - s[6]) * dt / 2));
    thrStick = Math.max(0, Math.min(1, iT + SETTLE_SINK * (0 - s[6])));
    must(sim.input(clock / 1000, ...st, thrStick), 'sim_input');
    must(sim.step(RC_STEP_MS), 'sim_step');
    clock += RC_STEP_MS;
    s = sim.readState().state;
  }
  const cap = { s: s.slice(), h: { ...h }, yaw: yawStick, thr: thrStick };
  let live = null, t = 0;
  const start = () => {
    must(sim.reset(), 'sim_reset');
    must(sim.e.sim_set_pose(cap.s[1], cap.s[2], cap.s[3], cap.s[7], cap.s[8], cap.s[9], cap.s[10]), 'sim_set_pose');
    must(sim.e.sim_wing_launch(speed(cap.s)), 'sim_wing_launch');
    must(sim.e.sim_set_velocity(cap.s[4], cap.s[5], cap.s[6], cap.s[11], cap.s[12], cap.s[13]), 'sim_set_velocity');
    live = { ...cap.h };
    t = 12000;
  };
  /* The climb a throttle step buys: from the captured state, the rudder
   * held where it was, the ailerons and elevator flying on, the throttle
   * a twentieth either side of its trim for STEP_S; the climb rate's
   * difference over the step's is the climb acceleration per stick, the
   * thrust's share along the yawed axis lifting the aircraft. */
  const climbAfter = (dThr) => {
    start();
    let st = sim.readState().state;
    for (let ms = 0; ms < STEP_S * 1000; ms += RC_STEP_MS) {
      const out = hands(sim, st, live, t, dt);
      t += RC_STEP_MS;
      out[2] = cap.yaw;
      must(sim.input(ms / 1000, ...out, clamp(cap.thr + dThr)), 'sim_input');
      must(sim.step(RC_STEP_MS), 'sim_step');
      st = sim.readState().state;
    }
    return st[6];
  };
  const K = (climbAfter(0.05) - climbAfter(-0.05)) / (0.1 * STEP_S);
  /* The element is K/s, the climb rate integrating that acceleration, and
   * the person's loop on it is designed on its response as every other
   * (wingpilot.js leadDesign with no lead: the bandwidth criterion, the
   * person's 0.25 s of delay and hold, the trim's integral a quarter
   * below crossover). */
  const g = [];
  for (let i = 2; i <= 60; i += 1) g.push({ w: i / 5, mag: K / (i / 5), phase: -Math.PI / 2 });
  return { ...leadDesign(g, [0]), K, trim: cap.thr, sink: -cap.s[6], V: speed(cap.s), rudder: cap.yaw };
}

/* The step a person's throttle makes itself felt over: long enough for
 * the prop to spool (the plant's j_prop), short of the speed loop's own
 * response. ESTIMATED. */
const check = process.argv.includes('--check');
let bad = 0;
for (const p of PLANES) {
  const V = p.knife.speed;
  const d = await design(p);
  const k = Number((d.wc / d.gain).toFixed(3));
  const pin = KNIFE_SINK[p.airframe];
  const pinned = Number((pin.wc / pin.gain).toFixed(3));
  const ok = pin.wc === d.wc && Math.abs(pin.gain - d.gain) < 0.05 && !d.short;
  if (!ok) bad += 1;
  console.log(`${p.name.padEnd(6)} knife edge entered at ${V} m/s, held at ${d.V.toFixed(1)} m/s with rudder ${d.rudder.toFixed(2)}, sink ${d.sink.toFixed(3)} m/s, throttle trim ${d.trim.toFixed(3)}: climb acceleration ${d.K.toFixed(2)} m/s2 per stick; crossover ${d.wc} rad/s, PM ${d.pmDeg} deg, GM ${d.gmDb === null ? 'none' : `${d.gmDb} dB`}${d.short ? ' SHORT' : ''}; the person's gain ${k} throttle per m/s of sink (wc ${d.wc} over gain ${d.gain}), pinned ${pinned} (${pin.wc} over ${pin.gain})${check && !ok ? '  DIFFERS' : ''}`);
}
if (check && bad) {
  console.error(`knife-throttle: ${bad} gain(s) differ from the design; pin KNIFE_SINK in tests/lib/wingpilot.js`);
  process.exit(1);
}
if (check) console.log('knife-throttle --check: every KNIFE_SINK is the design');
