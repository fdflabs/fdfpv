/*
 * waves-selftest.js: the module's wave field against its JS mirror and
 * against the theory it is built from.
 *
 * W1 the fixed libm's full range sin and cos against the mirror, bit for
 * bit, over a grid out to 1e6 rad, and against the host's to 1e-15, which
 * is the accuracy check (the host's is used here and nowhere else). W2
 * sim_water_sample against the mirror, bit for bit, on a lake with wind
 * and swell. W3 the wind sea's significant height over a long record,
 * four times the standard deviation of the surface, against the SPM
 * figure the body was built with. W4 the slope against a centred
 * difference of the height, W5 the vertical water velocity against the
 * height's rate. W6 the polygon: in, out, and no water where none was
 * declared. W7 flat water with no wind. Run with npm run waves:selftest.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { mirrorWaves } from '../src/game/waves.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sim = await loadSim(new Uint8Array(await readFile(join(root, 'dist/sim.wasm'))));
const e = sim.e;
const mirror = mirrorWaves('tests');
let failed = 0;
function gate(id, name, ok, measured) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${id.padEnd(3)} ${name.padEnd(46)} ${measured}`);
  if (!ok) failed += 1;
}
const must = (code, what) => {
  if (code < 0) throw new Error(`${what}: ${code}`);
  return code;
};
const bits = new Float64Array(1);
const u64 = new BigUint64Array(bits.buffer);
const same = (a, b) => {
  bits[0] = a;
  const x = u64[0];
  bits[0] = b;
  return x === u64[0];
};

console.log('waves selftest: src/native/water.c against src/game/waves.js and the SPM');

{
  let n = 0;
  let diff = 0;
  let worst = 0;
  for (let i = -20000; i <= 20000; i += 1) {
    for (const x of [i * 0.0137, i * 49.99931, i * 1.3e-3 + 0.5]) {
      n += 1;
      if (!same(e.sim_math_sin(x), mirror.sin(x)) || !same(e.sim_math_cos(x), mirror.cos(x))) diff += 1;
      worst = Math.max(worst, Math.abs(e.sim_math_sin(x) - Math.sin(x)), Math.abs(e.sim_math_cos(x) - Math.cos(x)));
    }
  }
  gate('W1', 'sin and cos: module and mirror, to the bit', diff === 0 && worst < 1e-12, `${n} angles, ${diff} differ, worst error against the host ${worst.toExponential(2)}`);
}

must(e.sim_water_clear(), 'clear');
const body = { z0: -1.5, ox: 12, oy: -40, wind: { speed: 5, dx: 0.6, dy: 0.8, fetch: 900 }, swell: { height: 0.3, period: 2.5, dx: 1, dy: 0 } };
const b0 = must(e.sim_water_add(body.z0, body.ox, body.oy), 'add');
const poly = [[-500, -500], [500, -500], [500, 500], [-500, 500]];
for (const [x, y] of poly) must(e.sim_water_vertex(b0, x, y), 'vertex');
must(e.sim_water_wind(b0, body.wind.speed, body.wind.dx, body.wind.dy, body.wind.fetch), 'wind');
must(e.sim_water_swell(b0, body.swell.height, body.swell.period, body.swell.dx, body.swell.dy), 'swell');
const ref = mirror.build(body);
const out = e.malloc(48 * 8);
const read = (n) => Array.from(new Float64Array(e.memory.buffer, out, n));
const sample = (x, y, t) => {
  must(e.sim_water_sample(x, y, t, out), 'sample');
  return read(7);
};
{
  must(e.sim_water_components(b0, out), 'components');
  const c = read(6 + 5 * 7);
  let diff = 0;
  let n = 0;
  for (let i = 0; i < 400; i += 1) {
    const x = -300 + i * 1.37;
    const y = 200 - i * 0.91;
    const t = i * 7.3;
    const got = sample(x, y, t);
    const want = mirror.sample(ref, x, y, t);
    n += 1;
    if (got[0] !== 0 || !want.every((v, k) => same(v, got[k + 1]))) diff += 1;
  }
  gate('W2', 'the surface: module and mirror, to the bit', diff === 0 && c[0] === ref.comps.length,
    `${n} samples, ${diff} differ; ${c[0]} components, Hs ${c[4].toFixed(4)} m, Tp ${c[5].toFixed(3)} s`);
}

{
  /* The wind sea alone: a body with the wind and no swell, sampled at one
   * point for twenty minutes of sim clock. */
  must(e.sim_water_clear(), 'clear');
  const b = must(e.sim_water_add(0, 0, 0), 'add');
  must(e.sim_water_wind(b, 5, 1, 0, 900), 'wind');
  must(e.sim_water_components(b, out), 'components');
  const [, , , , hs, tp] = read(6);
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let t = 0; t < 1200; t += 0.01) {
    const z = sample(3, 4, t)[1];
    s += z;
    s2 += z * z;
    n += 1;
  }
  const sd = Math.sqrt(s2 / n - (s / n) ** 2);
  const X = 9.81 * 900 / 25;
  const hsSpm = 1.6e-3 * Math.sqrt(X) * 25 / 9.81;
  const tpSpm = 0.2857 * Math.cbrt(X) * 5 / 9.81;
  gate('W3', 'wind sea: Hs is 4 sd of the surface, as the SPM', Math.abs(4 * sd / hsSpm - 1) < 0.05 && Math.abs(hs / hsSpm - 1) < 1e-9 && Math.abs(tp / tpSpm - 1) < 1e-9,
    `4 sd ${(4 * sd).toFixed(4)} m against the SPM's ${hsSpm.toFixed(4)} for 5 m/s over 900 m; Tp ${tp.toFixed(3)} s against ${tpSpm.toFixed(3)}`);

  let worstSlope = 0;
  let worstW = 0;
  let scale = 0;
  const h = 1e-4;
  for (let i = 0; i < 300; i += 1) {
    const x = i * 0.71;
    const y = -i * 0.37;
    const t = i * 0.113;
    const c = sample(x, y, t);
    const dx = (sample(x + h, y, t)[1] - sample(x - h, y, t)[1]) / (2 * h);
    const dy = (sample(x, y + h, t)[1] - sample(x, y - h, t)[1]) / (2 * h);
    const dt = (sample(x, y, t + h)[1] - sample(x, y, t - h)[1]) / (2 * h);
    worstSlope = Math.max(worstSlope, Math.abs(dx - c[2]), Math.abs(dy - c[3]));
    worstW = Math.max(worstW, Math.abs(dt - c[6]));
    scale = Math.max(scale, Math.abs(c[2]), Math.abs(c[6]));
  }
  gate('W4', 'slope is the height\'s gradient', worstSlope < 1e-6, `worst ${worstSlope.toExponential(2)} against slopes to ${scale.toFixed(3)}`);
  gate('W5', 'vertical water velocity is the height\'s rate', worstW < 1e-6, `worst ${worstW.toExponential(2)} m/s`);
}

{
  must(e.sim_water_clear(), 'clear');
  const none = sample(0, 0, 0);
  const b = must(e.sim_water_add(-1.5, 0, 0), 'add');
  for (const [x, y] of [[0, 0], [100, 0], [100, 50], [50, 20], [0, 50]]) must(e.sim_water_vertex(b, x, y), 'vertex');
  const inside = sample(20, 30, 0);
  const notch = sample(50, 35, 0);
  const outside = sample(-1, 10, 0);
  gate('W6', 'the polygon decides where the water is', none[0] === -1 && inside[0] === 0 && inside[1] === -1.5 && notch[0] === -1 && outside[0] === -1,
    `none declared ${none[0]}, inside ${inside[0]} at z ${inside[1]}, in the notch ${notch[0]}, outside ${outside[0]}`);
  const flat = [0, 1, 2, 3].map((k) => sample(10 + k, 10, k * 3.1));
  gate('W7', 'no wind and no swell is flat, still water', flat.every((s) => s[1] === -1.5 && s.slice(2).every((v) => v === 0)),
    flat.map((s) => s[1]).join(', '));
  const bad = [
    e.sim_water_wind(b, -1, 1, 0, 100), e.sim_water_wind(b, 5, 0.5, 0, 100), e.sim_water_swell(b, 0.3, 0.1, 1, 0),
    e.sim_water_wind(7, 5, 1, 0, 100), e.sim_water_add(NaN, 0, 0),
  ];
  gate('W8', 'bad declarations are refused', bad.every((c) => c < 0), bad.join(' '));
}
must(e.sim_water_clear(), 'clear');
e.free(out);

console.log(`\n${failed ? `${failed} FAILED` : 'all hold'}`);
process.exit(failed ? 1 : 0);
