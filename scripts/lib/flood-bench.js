/*
 * flood-bench.js: the Itaipu flood's cost, the same in Node and in a page
 * (scripts/water-bench.js runs both): the shipped bed and warmed state
 * loaded as live.js loads them, gate 3 torn open, and then steps timed in
 * slices: ms per step, and how many steps of the room's clock a second
 * the main thread could take at the frame budget live.js gives it.
 *
 * `read(name)` gives a shipped file's bytes by its name
 * (flood.wasm, itaipu-flood.json, itaipu-flood.bin, itaipu-flood-warm-war.bin);
 * `now()` the clock.
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

import { unpackBed } from '../../src/maps/itaipu/water/bed.js';
import {
  DT_MS, loadState, makeFlood,
} from '../../src/maps/itaipu/water/flood.js';
import { FRAME_BUDGET_MS } from '../../src/maps/itaipu/water/live.js';

export async function benchFlood(read, now, { warmSteps = 200, slices = 20, perSlice = 50 } = {}) {
  const [wasm, json, bin, warm] = await Promise.all(['flood.wasm', 'itaipu-flood.json', 'itaipu-flood.bin', 'itaipu-flood-warm-war.bin'].map(read));
  const bed = unpackBed(JSON.parse(new TextDecoder().decode(json)), bin);
  const flood = await makeFlood(wasm, bed, {});
  loadState(flood.f, warm);
  const gate = bed.gates[3];
  flood.openGate(3, { sill: gate.sill, width: gate.width, height: gate.height });
  flood.f.step(warmSteps);
  const per = [];
  for (let s = 0; s < slices; s += 1) {
    const t0 = now();
    flood.f.step(perSlice);
    per.push((now() - t0) / perSlice);
  }
  per.sort((a, b) => a - b);
  const median = per[Math.floor(per.length / 2)];
  let wet = 0;
  const h = flood.f.h();
  for (let k = 0; k < h.length; k += 1) if (h[k] > 1e-4) wet += 1;
  return {
    msPerStep: median,
    worst: per[per.length - 1],
    wet,
    cells: h.length,
    /* What the room needs, and what a FRAME_BUDGET_MS slice of each of
     * 60 frames a second takes. */
    needPerSecond: 1000 / DT_MS,
    canPerSecond: (60 * FRAME_BUDGET_MS) / median,
    hash: flood.f.hash(),
  };
}
