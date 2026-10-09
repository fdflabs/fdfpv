/*
 * wash-derive.js: every slipstream's terms, FixedWingParams slip_*
 * in src/native/plant_wing.c (docs/FLIGHTMODEL.md), from its drawn
 * geometry through scripts/lib/wash.js. Each row's numbers are its own
 * derivation's (scripts/<name>-derive.js and docs/<NAME>-STAGE1.md); the
 * fin's heights over and under the thrust line are read off the render
 * models where no derivation gives them, marked so. Aircraft left out, and
 * why: the 1000 mm wing, the Bramor, the Zagi and the Striker push from
 * behind everything (the Skyhunter's is behind its wing but ahead of its
 * tail, and blows the middle of its stabiliser, slip_pusher); the F-16's
 * fan exhausts past its tail;
 * the NRJ has no motor. With --check it fails when a table differs from
 * what it derives past the printed rounding. Run with npm run wash:derive.
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

import { shares } from './lib/wash.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = Math.PI / 180;

/*
 * propR, S, b, Sh, bh, Sv, hv, ya, at, av, eta, deda, VH, VV, lv, zv; a0
 * from the table's zero lift angle and the cruise trim's CL over the
 * table's CL alpha. ya, the ailerons' stations; where there are none,
 * cl_da is zero and the wing's tip stands in, which only keeps the share
 * finite.
 */
const GEO = {
  /* The Skyhunter's pusher sits behind the wing and blows the middle of
   * its stabiliser, 0.456 m of span between the booms, and past both boom
   * fins, 0.232 m out (docs/SKYHUNTER-STAGE1.md, the 3D model): no fin in
   * the wash, no root behind the prop. */
  FW_SKY1800: { propR: 0.1397, S: 0.36, b: 1.80, Sh: 0.0593, bh: 0.456, Sv: 0.040, hv: [0, 0], ya: [0.45, 0.85], at: 4.00, av: 3.61, eta: 0.9, deda: 0.364, VH: 0.57, VV: 0.043, lv: 0.69, zv: 0.10, azl: -4.0, cl: 0.415, cla: 5.52, pusher: true },
  FW_CUB1400: { propR: 0.1397, S: 0.28, b: 1.40, Sh: 0.047, bh: 0.38, Sv: 0.020, hv: [0.158, 0.01], ya: [0.28, 0.66], at: 3.806, av: 2.693, eta: 0.9, deda: 0.444, VH: 0.434, VV: 0.0289, lv: 0.567, zv: 0.104, azl: -5.0, cl: 0.524, cla: 5.21 },
  FW_CUB1400F: { same: 'FW_CUB1400' },
  FW_RADIAN2000: { propR: 0.1238, S: 0.355, b: 2.0, Sh: 0.0476, bh: 0.477, Sv: 0.038, hv: [0.276, 0.01], ya: [0.9, 1.0], at: 4.43, av: 3.04, eta: 0.9, deda: 0.301, VH: 0.496, VV: 0.0343, lv: 0.64, zv: 0.13, azl: -5.0, cl: 0.75, cla: 5.709 },
  FW_SLOWSTICK1180: { propR: 0.1397, S: 0.3264, b: 1.176, Sh: 0.056, bh: 0.44, Sv: 0.030, hv: [0.200, 0.01], ya: [0.53, 0.588], at: 3.980, av: 2.976, eta: 0.9, deda: 0.494, VH: 0.317, VV: 0.0414, lv: 0.530, zv: 0.078, azl: -6.06, cl: 0.681, cla: 4.58 },
  FW_TIMBER1500: { propR: 0.1397, S: 0.361, b: 1.555, Sh: 0.071, bh: 0.56, Sv: 0.0314, hv: [0.195, 0.036], ya: [0.34, 0.70], at: 4.325, av: 2.976, eta: 0.9, deda: 0.460, VH: 0.464, VV: 0.035, lv: 0.625, zv: 0.09, azl: -5.0, cl: 0.446, cla: 5.25 },
  FW_TIMBER1500F: { same: 'FW_TIMBER1500' },
  FW_BOMBSHELL1118: { propR: 0.0889, S: 0.2129, b: 1.1176, Sh: 0.0481, bh: 0.412, Sv: 0.0155, hv: [0.129, 0.01], ya: [0.5, 0.5588], at: 4.013, av: 2.675, eta: 0.9, deda: 0.341, VH: 0.680, VV: 0.0348, lv: 0.534, zv: 0.052, azl: -5.02, cl: 0.658, cla: 4.991 },
  FW_KADET1981: { propR: 0.1524, S: 0.7419, b: 1.9812, Sh: 0.1589, bh: 0.787, Sv: 0.0705, hv: [0.259, 0.114], ya: [0.89, 0.9906], at: 4.154, av: 2.793, eta: 0.9, deda: 0.380, VH: 0.549, VV: 0.0465, lv: 0.968, zv: 0.076, azl: -4.62, cl: 0.276, cla: 5.029 },
  FW_P51D1450: { propR: 0.1778, S: 0.354, b: 1.450, Sh: 0.0427, bh: 0.516, Sv: 0.0293, hv: [0.18, 0.01], ya: [0.45, 0.68], at: 4.757, av: 2.851, eta: 0.9, deda: 0.429, VH: 0.342, VV: 0.0404, lv: 0.709, zv: 0.129, azl: -1.28, cl: 0.469, cla: 4.960 },
  FW_UGLYSTIK1567: { propR: 0.1524, S: 0.5106, b: 1.5682, Sh: 0.0993, bh: 0.566, Sv: 0.0492, hv: [0.178, 0.087], ya: [0.145, 0.784], at: 3.881, av: 2.600, eta: 0.9, deda: 0.416, VH: 0.435, VV: 0.0453, lv: 0.737, zv: 0.066, azl: -0.43, cl: 0.284, cla: 4.824 },
  FW_TIGERMOTH1803: { propR: 0.1524, S: 0.8774, b: 1.8034, Sh: 0.0977, bh: 0.605, Sv: 0.0456, hv: [0.246, 0.081], ya: [0.35, 0.89], at: 4.098, av: 4.005, eta: 0.9, deda: 0.442, VH: 0.348, VV: 0.0269, lv: 0.935, zv: 0.101, azl: -5.47, cl: 0.409, cla: 4.6328 },
};

const r4 = (x) => Number(x.toPrecision(4));

export function derive(name) {
  const g0 = GEO[name];
  const g = g0.same ? GEO[g0.same] : g0;
  const ClbFin = -g.av * (g.Sv / g.S) * (g.zv / g.b);
  const a0 = g.azl * DEG + g.cl / g.cla;
  const s = shares({ ...g, ClbFin, a0 });
  const out = {};
  for (const [k, v] of Object.entries(s)) out[k] = Array.isArray(v) ? v.map(r4) : r4(v);
  if (g.pusher) out.slip_pusher = 1;
  return out;
}

export function cLine(d) {
  const a = (v) => `{ ${v[0]}, ${v[1]} }`;
  return `  .slip_r = ${d.slip_r}, .slip_yh = ${d.slip_yh}, .slip_hv = ${a(d.slip_hv)}, .slip_ya = ${a(d.slip_ya)},\n` +
    `  .slip_a0 = ${d.slip_a0}, .slip_cl_a = ${d.slip_cl_a}, .slip_cm_a = ${d.slip_cm_a}, .slip_cn_b = ${d.slip_cn_b},\n` +
    `  .slip_cn_r = ${d.slip_cn_r}, .slip_cy_b = ${d.slip_cy_b}, .slip_cl_b = ${d.slip_cl_b},${d.slip_pusher ? ' .slip_pusher = 1,' : ''}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = await readFile(join(root, 'src/native/plant_wing.c'), 'utf8');
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const name of Object.keys(GEO)) {
    const line = cLine(derive(name));
    const body = src.slice(src.indexOf(`const FixedWingParams ${name} = {`)).split('\n};')[0];
    const ok = body.includes(line);
    console.log(`${name}${check && !ok ? '  DIFFERS' : ''}\n${line}`);
    if (!ok) bad += 1;
  }
  if (check && bad) {
    console.log(`${bad} table(s) differ from their derivation`);
    process.exit(1);
  }
}
