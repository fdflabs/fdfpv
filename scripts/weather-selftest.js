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

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import {
  makeWeather, groundClass, PRESET_IDS, MAPS, WIND_MAX, GUST_MAX, UP_MAX,
} from '../src/game/weather.js';
import { CLASS } from '../src/game/weather-surface-classes.js';

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
  const o = { x: 0, z: 0, gust: 0, up: 0 };
  const f = new Float64Array(pts.length * 4);
  pts.forEach(([x, y, z, t], i) => {
    w.at(x, y, z, t, o);
    f[4 * i] = o.x;
    f[4 * i + 1] = o.z;
    f[4 * i + 2] = o.gust;
    f[4 * i + 3] = o.up;
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
      if (!(v2 <= 30 * 30) || !(o.gust > 0) || !(o.gust <= GUST_MAX) || !Number.isFinite(v2) || !(Math.abs(o.up) <= UP_MAX)) {
        bad += 1;
      }
    }
  }
}
check('every sample within 30 m/s, 0 < gust <= 10 and |up| <= 10', bad === 0, `${bad} out, fastest ${Math.sqrt(worst).toFixed(2)} m/s, cap ${WIND_MAX}`);

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
const crestHigh = speed(br, 142, 220 + 400, -1718, 0);
const openHigh = speed(br, 3000, 220 + 400, 3000, 0);
check('400 m over the dam the air is the open air\'s', crestHigh[0] === openHigh[0] && crestHigh[1] === openHigh[1]);
for (const m of ['swiss2', 'alps']) {
  const v = makeWeather(m, 'breeze', 3);
  const floor = speed(v, 0, 20, 0, 0);
  const rim = speed(v, -1700, 1300, 0, 0);
  const mid = speed(v, -900, 20, 0, 0);
  check(`${m}: the valley floor is sheltered, the rim is rough`, floor[0] < mid[0] && rim[1] > floor[1] + 1.5,
    `floor ${floor[0].toFixed(2)} m/s gust ${floor[1].toFixed(2)}, rim gust ${rim[1].toFixed(2)}`);
  v.at(0, 500, 0, 0, o);
  check(`${m}: the wind runs along the valley`, Math.abs(o.z) > 2 * Math.abs(o.x), `${o.x.toFixed(2)}, ${o.z.toFixed(2)}`);
}
const inr = makeWeather('interior', 'breeze', 3);
const river = speed(inr, 1098, 250, 210, 0);
const plain = speed(inr, -4000, 300, 4000, 0);
check('the Interior: Rio Sereno\'s lowland is calmer and rougher than the plain', river[0] < plain[0] && river[1] > plain[1],
  `river ${river[0].toFixed(2)} gust ${river[1].toFixed(2)}, plain ${plain[0].toFixed(2)} gust ${plain[1].toFixed(2)}`);
console.log('3b. vertical air');
const THERMAL_LIFE_S = 900;
{
  const v = { x: 0, z: 0, gust: 0, up: 0 };
  let rise = 0;
  let sink = 0;
  let riseAt = null;
  const th = makeWeather('interior', 'breeze', 11);
  /* Over a thermal's whole life: at any one moment the strongest core
   * may be over the forest (0.8 of open ground's) or far from the top of
   * its life. */
  for (let t = 100; t < 100 + THERMAL_LIFE_S; t += 100) {
    for (let i = 0; i < 40000; i += 1) {
      const x = ((i * 7919) % 8000) - 4000;
      const z = ((i * 104729) % 8000) - 4000;
      th.at(x, 240 + 300, z, t, v);
      if (v.up > rise) {
        rise = v.up;
        riseAt = [x, z, t];
      }
      sink = Math.min(sink, v.up);
    }
  }
  check('breeze over the Interior has thermals 1.5 to 3 m/s and sink beside them', rise > 1.5 && rise <= 3 && sink < 0 && sink > -1,
    `rise ${rise.toFixed(2)} at ${riseAt}, sink ${sink.toFixed(2)}`);
  const t0 = riseAt[2];
  th.at(riseAt[0], 240 + 3, riseAt[1], t0, v);
  const low = v.up;
  th.at(riseAt[0], 240 + 1500, riseAt[1], t0, v);
  check('a thermal forms off the ground and is gone above the cloud base', Math.abs(low) < 0.3 * rise && v.up === 0,
    `${low.toFixed(2)} at 3 m, ${v.up} at 1500 m`);
  const later = [];
  for (let t = t0; t < t0 + 900; t += 60) {
    th.at(riseAt[0], 540, riseAt[1], t, v);
    later.push(v.up);
  }
  check('it drifts away or dies within its life', Math.min(...later) < 0.5 * rise, later.map((u) => u.toFixed(1)).join(' '));
  const fr0 = makeWeather('interior', 'front', 11);
  let most = 0;
  for (let i = 0; i < 20000; i += 1) {
    fr0.at(((i * 7919) % 8000) - 4000, 540, ((i * 104729) % 8000) - 4000, 100, v);
    most = Math.max(most, Math.abs(v.up));
  }
  check('an overcast front has no thermals (and the Interior no ridge)', most === 0, `${most}`);
  const dam = makeWeather('itaipu', 'breeze', 0);
  dam.at(142, 240, -1760, 0, v);
  const windward = v.up;
  dam.at(142, 240, -1680, 0, v);
  const lee = v.up;
  /* The windward side is over the reservoir, which sinks on a thermal
   * day; the dam's own lift is what it adds to that. */
  dam.at(142, 240, -3500, 0, v);
  const lake = v.up;
  check('the dam lifts the air on its windward side and lets it down in its lee', windward - lake > 0.5 && lee < 0,
    `windward ${windward.toFixed(2)} over the lake's ${lake.toFixed(2)}, lee ${lee.toFixed(2)} m/s`);
}
const fr = makeWeather('itaipu', 'front', 9);
let lo = Infinity;
let hi = 0;
for (let t = 0; t < 400; t += 0.5) {
  const s = speed(fr, 3000, 240, 3000, t)[0];
  lo = Math.min(lo, s);
  hi = Math.max(hi, s);
}
check('a front passes a fixed point within 400 s', hi > 1.8 * lo, `${lo.toFixed(2)} to ${hi.toFixed(2)} m/s`);

console.log('3c. the ground under the air');
{
  const v = { x: 0, z: 0, gust: 0, up: 0 };
  /* Fronts have no thermals, so the surface changes nothing in them: the
   * air on every map is what it was before the surface existed (hashes
   * recorded on main at 10fc77de, 20000 samples over 16 km and 600 m). */
  const FRONT = {
    itaipu: '62de2697fd1d88bb', swiss2: '1ef6c18e8a90d883', alps: '1ef6c18e8a90d883', interior: 'c2aa6ceba8e24836',
  };
  for (const [m, want] of Object.entries(FRONT)) {
    const w = makeWeather(m, 'front', 12345);
    const f = new Float64Array(20000 * 4);
    for (let i = 0; i < 20000; i += 1) {
      w.at(((i * 7919) % 16000) - 8000, 200 + ((i * 31) % 600), ((i * 104729) % 16000) - 8000, i * 0.37, v);
      f.set([v.x, v.z, v.gust, v.up], 4 * i);
    }
    const got = createHash('sha256').update(Buffer.from(f.buffer)).digest('hex').slice(0, 16);
    check(`${m}: a front's air is the bits it was before the surface`, got === want, got);
  }
  /* Itaipu's reservoir a kilometre above the dam, a kilometre from any
   * shore: over a whole thermal life, at every height, no rise, and weak
   * sink on a thermal day. */
  check('the reservoir above the dam is water on the grid', groundClass('itaipu', 720, -2800) === CLASS.water);
  for (const preset of ['breeze', 'gusty']) {
    const w = makeWeather('itaipu', preset, 5);
    let most = -Infinity;
    let least = Infinity;
    for (let t = 0; t < 900; t += 7) {
      for (let y = 230; y < 1200; y += 50) {
        w.at(720, y, -2800, t, v);
        most = Math.max(most, v.up);
        least = Math.min(least, v.up);
      }
    }
    check(`itaipu ${preset}: over the reservoir no thermal, weak sink (0 to -0.5 m/s)`, most <= 0 && least < 0 && least > -0.5,
      `${least.toFixed(2)} to ${most.toFixed(2)} m/s`);
  }
  check('the Interior\'s river and the Swiss lake are water on their grids',
    [[0, 2400, 'swiss2'], [0, 2400, 'alps']].every(([x, z, m]) => groundClass(m, x, z) === CLASS.water)
    && MAPS.interior.zones[0].line.some(([x, z]) => groundClass('interior', x, z) === CLASS.water));
  /* The same air over ground of one class everywhere (a map made here,
   * the Interior's with a uniform grid): every thermal's rise and sink is
   * open ground's times the class's share, and water's is sink only. */
  const uniform = (c) => {
    MAPS.uniform = { ...MAPS.interior, surface: { x0: -8000, cell: 1000, n: 16, cls: new Uint8Array(256).fill(c) } };
    const w = makeWeather('uniform', 'breeze', 11);
    const out = new Float64Array(20000);
    for (let i = 0; i < 20000; i += 1) {
      w.at(((i * 7919) % 8000) - 4000, 540, ((i * 104729) % 8000) - 4000, 100 + (i % 9) * 100, v);
      out[i] = v.up;
    }
    delete MAPS.uniform;
    return out;
  };
  const open = uniform(CLASS.open);
  const ratio = (c) => {
    const u = uniform(c);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < u.length; i += 1) {
      if (Math.abs(open[i]) > 0.05) {
        lo = Math.min(lo, u[i] / open[i]);
        hi = Math.max(hi, u[i] / open[i]);
      }
    }
    return [lo, hi, u];
  };
  const near = (r, want) => Math.abs(r[0] - want) < 1e-9 && Math.abs(r[1] - want) < 1e-9;
  const fo = ratio(CLASS.forest);
  const ba = ratio(CLASS.bare);
  const sn = ratio(CLASS.snow);
  check('over forest every thermal is 0.8 of open ground\'s, over bare ground 1.15, over snow none', near(fo, 0.8) && near(ba, 1.15) && sn[2].every((u) => u === 0),
    `forest ${fo[0].toFixed(4)} to ${fo[1].toFixed(4)}, bare ${ba[0].toFixed(4)} to ${ba[1].toFixed(4)}`);
  const wa = ratio(CLASS.water)[2];
  check('over water it only sinks, 0.15 of a strong core', wa.every((u) => Math.abs(u + 0.15 * 2.2) < 1e-12), `${Math.min(...wa)} to ${Math.max(...wa)}`);
}

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
  must(sim.e.sim_set_air_vertical(0), 'still up');
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
      must(sim.e.sim_set_air_vertical(a.up), 'up');
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
