/*
 * paradrop-selftest.js: src/game/paradrop.js against a hand calculation
 * and against itself. Plain Node. Run with npm run paradrop:selftest.
 *
 *   P1 a full canopy settles at sqrt(2 m g / (rho C_D S)), the hand's 5.40
 *      m/s with the box's drag, in still air.
 *   P2 the fall time from 120 m: the opening's few metres, then the rest
 *      at that rate, the hand's T = t_open + (H - h_open) / v.
 *   P3 a steady 6 m/s wind: the air relative fall is the calm one, so
 *      thrown with the wind's speed added the load lands W T downwind of
 *      the calm landing, exactly (Galileo), and with the aircraft's own
 *      speed it lands where the hand says within its first seconds' drift.
 *   P4 the same record in gusts, thermals and a front, twice: bit for bit.
 *   P5 a load over water stops at the surface and is wet; over ground dry.
 *   P6 dcos against Math.cos over four thousand points: within 1e-14 and
 *      the fold's 1e-15 of the argument.
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

import { LOAD, DESCENT_RATE, dcos, fall } from '../src/game/paradrop.js';
import { makeWeather, PRESET_IDS, MAPS } from '../src/game/weather.js';

let failed = 0;
function check(name, ok, measured) {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${measured})`);
  if (!ok) failed += 1;
}

const flat = () => ({ y: 0, wet: false });
const steady = (wx, wz) => ({ at(x, y, z, t, out) { out.x = wx; out.z = wz; out.up = 0; out.gust = 0; return out; } });

/* The hand: rho 1.225, g 9.81, 0.25 kg, the 0.4572 m canopy at C_D 0.78
 * (0.1281 m^2 of drag area) and the box's 1.05 x 0.093^2 (0.0091 m^2). */
const hand = Math.sqrt(2 * 0.25 * 9.81 / (1.225 * (0.78 * Math.PI * 0.4572 * 0.4572 / 4 + 1.05 * 0.093 * 0.093)));
const calm = fall({ t: 0, tp: 0, p: [0, 120, 0], v: [15, 0, 0] }, { weather: null, surface: flat });
const p = calm.path;
const n = p.length / 5;
const vEnd = (p[(n - 3) * 5 + 2] - p[(n - 2) * 5 + 2]) / (p[(n - 2) * 5] - p[(n - 3) * 5]);
console.log('paradrop selftest: src/game/paradrop.js against the hand');
check('P1 a full canopy comes down at the hand\'s rate', Math.abs(vEnd - hand) / hand < 0.005 && Math.abs(DESCENT_RATE - hand) < 1e-12,
  `${vEnd.toFixed(3)} m/s against ${hand.toFixed(3)}, in the 5 to 7 band the brief asked`);

/* P2: where it had opened fully, the remaining height at the rate. */
let iFull = 0;
while (p[iFull * 5 + 4] < 1) iFull += 1;
const tFull = p[iFull * 5];
const hFull = p[iFull * 5 + 2];
const tHand = tFull + hFull / hand;
check('P2 the fall from 120 m takes the hand\'s time', Math.abs(calm.landS - tHand) / tHand < 0.02,
  `${calm.landS.toFixed(2)} s against ${tHand.toFixed(2)} (open at ${calm.openS.toFixed(2)} s, full at ${tFull.toFixed(2)} s and ${hFull.toFixed(1)} m)`);

/* P3: the wind. */
const W = 6;
const calmAir = fall({ t: 0, tp: 0, p: [0, 120, 0], v: [15, 0, 0] }, { weather: null, surface: flat });
const windy = fall({ t: 0, tp: 0, p: [0, 120, 0], v: [15 + W, 0, 0] }, { weather: steady(W, 0), surface: flat });
const galileo = calmAir.rest[0] + W * calmAir.landS;
check('P3a with the wind\'s speed added, W T downwind of calm', Math.abs(windy.rest[0] - galileo) < 0.05 && Math.abs(windy.landS - calmAir.landS) < 0.011,
  `${windy.rest[0].toFixed(3)} m against ${galileo.toFixed(3)}, ${windy.landS.toFixed(2)} s against ${calmAir.landS.toFixed(2)}`);
const real = fall({ t: 0, tp: 0, p: [0, 120, 0], v: [15, 0, 0] }, { weather: steady(W, 0), surface: flat });
/* The hand: the load's run through the air under quadratic drag,
 * u = u0 / (1 + k u0 t), covers ln(1 + k u0 T) / k, k = rho CdA / 2m,
 * 0.336 per m with the canopy and the box; so the run with 15 - 6 = 9 m/s
 * through the air is the calm run in that ratio, and the air carries it
 * W T on top. */
const kk = 1.225 * (0.78 * Math.PI * 0.4572 * 0.4572 / 4 + 1.05 * 0.093 * 0.093) / (2 * 0.25);
const run = (u0) => Math.log(1 + kk * u0 * real.landS) / kk;
const handX = W * real.landS + calmAir.rest[0] * run(15 - W) / run(15);
check('P3b dropped at 15 m/s into a 6 m/s wind, it lands where the hand says', Math.abs(real.rest[0] - handX) < 3 && Math.abs(real.rest[2]) < 1e-9,
  `${real.rest[0].toFixed(2)} m downwind against the hand's ${handX.toFixed(2)}, drifted ${(W * real.landS).toFixed(1)} m in ${real.landS.toFixed(1)} s`);

/* P4: the real weather, twice. */
const mapId = Object.keys(MAPS)[0];
const preset = PRESET_IDS.includes('gusty') ? 'gusty' : PRESET_IDS[PRESET_IDS.length - 1];
const rec = { t: 1234.5, tp: 87.25, p: [40, 150, -30], v: [14, -1, 3] };
const a = fall(rec, { weather: makeWeather(mapId, preset, 4242), surface: flat });
const b = fall(rec, { weather: makeWeather(mapId, preset, 4242), surface: flat });
const same = a.path.length === b.path.length && a.path.every((v, i) => Object.is(v, b.path[i]));
const c = fall(rec, { weather: makeWeather(mapId, preset, 4243), surface: flat });
check('P4 the same record and seed fall bit for bit; another seed elsewhere', same && (c.rest[0] !== a.rest[0] || c.rest[2] !== a.rest[2]),
  `${preset} on ${mapId}: ${a.path.length / 5} samples, rest ${a.rest.map((v) => v.toFixed(3)).join(' ')}; seed 4243 rests at ${c.rest.map((v) => v.toFixed(3)).join(' ')}`);

/* P5: water. */
const pond = (x) => (x > 20 ? { y: 2, wet: true } : { y: 0, wet: false });
const wet = fall({ t: 0, tp: 0, p: [30, 60, 0], v: [5, 0, 0] }, { weather: null, surface: pond });
const dry = fall({ t: 0, tp: 0, p: [0, 60, 0], v: [5, 0, 0] }, { weather: null, surface: pond });
check('P5 it floats on water (311 kg/m^3) and lies on the ground', wet.wet && Math.abs(wet.rest[1] - 2) < 1e-12 && !dry.wet && dry.rest[1] === 0 && LOAD.density < 1000,
  `density ${LOAD.density.toFixed(0)} kg/m^3, wet at y ${wet.rest[1]}, dry at y ${dry.rest[1]}`);

let worst = 0;
for (let i = 0; i <= 4000; i += 1) {
  const x = -200 + i * 0.1;
  worst = Math.max(worst, Math.abs(dcos(x) - Math.cos(x)) / (1e-14 + 1e-15 * Math.abs(x)));
}
check('P6 dcos is the cosine, within 1e-14 and the fold\'s 1e-15 of the argument', worst < 1, `worst ${worst.toFixed(3)} of the allowance over -200 to 200`);

console.log(`\n${failed ? `${failed} FAILED` : 'all paradrop checks hold'}`);
process.exit(failed ? 1 : 0);
