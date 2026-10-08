/*
 * weather-selftest.js: src/game/weather.js holds docs/WEATHER-CONTRACT.md.
 *
 *     node scripts/weather-selftest.js      (npm run weather:selftest)
 *
 * 1. Same map, preset and seed give the same air to the bit; another seed
 *    gives other air.
 * 2. Every preset on every map stays inside sim_set_wind's limits, and a
 *    non calm air never reaches zero.
 * 3. The air has layers, the dam's zone and a front that passes.
 * 4. A flight driven by the field, against dist/sim.wasm, twice from fresh,
 *    is bit identical, and the wind it met was not still.
 * 5. A calm run after a windy one (the wind outlives sim_reset) is bit
 *    identical to a run that never had wind, given calm's one still call.
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
import { makeWeather, PRESET_IDS, MAPS, WIND_MAX, GUST_MAX } from '../src/game/weather.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failed += 1;
  }
}
function must(code, what) {
  if (code !== SIM_OK) {
    throw new Error(`${what}: ${code}`);
  }
}

/* A fixed walk over a map: positions and times that cover the zones. */
function samples(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push([((i * 7919) % 4000) - 2000, 200 + ((i * 31) % 400), ((i * 104729) % 4000) - 2000, i * 1.37]);
  }
  return out;
}
function trace(w, pts) {
  const o = { x: 0, z: 0, gust: 0 };
  const f = new Float64Array(pts.length * 3);
  pts.forEach(([x, y, z, t], i) => {
    w.at(x, y, z, t, o);
    f[3 * i] = o.x;
    f[3 * i + 1] = o.z;
    f[3 * i + 2] = o.gust;
  });
  return Buffer.from(f.buffer).toString('hex');
}

console.log('1. same seed, same air');
const pts = samples(5000);
for (const preset of PRESET_IDS.filter((p) => p !== 'calm')) {
  const a = trace(makeWeather('itaipu', preset, 12345), pts);
  const b = trace(makeWeather('itaipu', preset, 12345), pts);
  const c = trace(makeWeather('itaipu', preset, 54321), pts);
  check(`${preset}: seed 12345 twice is the same to the bit, 54321 differs`, a === b && a !== c);
}
check('calm is null on every map', Object.keys(MAPS).every((m) => makeWeather(m, 'calm', 1) === null));
let threw = 0;
for (const [m, p] of [['nowhere', 'breeze'], ['itaipu', 'hurricane'], ['itaipu', 'toString']]) {
  try {
    makeWeather(m, p, 1);
  } catch {
    threw += 1;
  }
}
check('an unknown map or preset throws', threw === 3);

console.log('2. inside the ABI, never zero');
let worst = 0;
let bad = 0;
const o = { x: 0, z: 0, gust: 0 };
for (const m of Object.keys(MAPS)) {
  for (const p of PRESET_IDS.filter((q) => q !== 'calm')) {
    const w = makeWeather(m, p, 7);
    for (let i = 0; i < 20000; i += 1) {
      w.at(((i * 7919) % 20000) - 10000, ((i * 13) % 3000) - 200, ((i * 104729) % 20000) - 10000, (i % 3600) + 0.001 * i, o);
      const v2 = o.x * o.x + o.z * o.z;
      worst = Math.max(worst, v2);
      if (!(v2 <= 30 * 30) || !(o.gust > 0) || !(o.gust <= GUST_MAX) || !Number.isFinite(v2)) {
        bad += 1;
      }
    }
  }
}
check('every sample within 30 m/s and 0 < gust <= 10', bad === 0, `${bad} out, fastest ${Math.sqrt(worst).toFixed(2)} m/s, cap ${WIND_MAX}`);

console.log('3. layers, zones, fronts');
const speed = (w, x, y, z, t) => {
  w.at(x, y, z, t, o);
  return [Math.sqrt(o.x * o.x + o.z * o.z), o.gust];
};
const br = makeWeather('itaipu', 'breeze', 3);
const low = speed(br, 3000, 225, 3000, 0)[0];
const high = speed(br, 3000, 420, 3000, 0)[0];
check('the wind is stronger 200 m up than at the base', high > 1.5 * low, `${low.toFixed(2)} -> ${high.toFixed(2)} m/s`);
const open = speed(br, 3000, 240, 3000, 0);
const crest = speed(br, 142, 240, -1718, 0);
check('over the dam crest: less mean, more gust', crest[0] < open[0] && crest[1] > open[1] + 2,
  `mean ${open[0].toFixed(2)} -> ${crest[0].toFixed(2)}, gust ${open[1].toFixed(2)} -> ${crest[1].toFixed(2)}`);
const fr = makeWeather('itaipu', 'front', 9);
let lo = Infinity;
let hi = 0;
for (let t = 0; t < 400; t += 0.5) {
  const s = speed(fr, 3000, 240, 3000, t)[0];
  lo = Math.min(lo, s);
  hi = Math.max(hi, s);
}
check('a front passes a fixed point within 400 s', hi > 1.8 * lo, `${lo.toFixed(2)} to ${hi.toFixed(2)} m/s`);

console.log('4. a flight in the field, twice');
/* The plant's frame as the map's with no spawn offset or yaw, the path
 * simPosToThree takes: map x = -plant y, map y = plant z, map z = -plant x. */
async function fly(weather, steps, reuse = null) {
  const sim = reuse || await loadSim(wasmBytes);
  if (!reuse) {
    must(sim.init(configText), 'init');
    must(sim.e.sim_set_airframe(0), 'airframe');
  }
  must(sim.reset(), 'reset');
  /* Calm's one call: what makes the next check hold. */
  must(sim.e.sim_set_wind(0, 0, 0), 'still');
  must(sim.e.sim_set_pose(0, 0, 30 + MAPS.itaipu.base, 1, 0, 0, 0), 'pose');
  const a = { x: 0, z: 0, gust: 0 };
  let met = 0;
  for (let ms = 0; ms < steps; ms += 1) {
    if (ms % 4 === 0) {
      must(sim.input(ms / 1000, 0, 0, 0, 0.45), 'input');
    }
    if (weather) {
      const s = sim.readState().state;
      weather.at(-s[2], s[3], -s[1], s[0], a);
      must(sim.e.sim_set_wind(-a.z, -a.x, a.gust), 'wind');
      met = Math.max(met, a.x * a.x + a.z * a.z);
    }
    must(sim.step(1), 'step');
  }
  return { hex: Buffer.from(sim.readStateBytes().bytes).toString('hex'), met: Math.sqrt(met), sim };
}
const f1 = await fly(makeWeather('itaipu', 'gusty', 42), 3000);
const f2 = await fly(makeWeather('itaipu', 'gusty', 42), 3000);
const still = await fly(null, 3000);
check('the same seed flown twice ends in the same state to the bit', f1.hex === f2.hex);
check('and it met wind, and ended elsewhere than still air', f1.met > 1 && f1.hex !== still.hex, `${f1.met.toFixed(2)} m/s`);

console.log('5. calm after wind');
const windy = await fly(makeWeather('itaipu', 'front', 1), 500);
const calmAfter = await fly(null, 3000, windy.sim);
check('a calm run on the plant a windy one used ends where a never windy one does, to the bit', calmAfter.hex === still.hex);
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
