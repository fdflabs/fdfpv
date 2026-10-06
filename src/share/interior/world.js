/*
 * world.js: the Interior's ground and land cover, from the bytes
 * tools/interior/build.py writes beside this file, read the same way by
 * the room and every screen (docs/campaign/interior/WORLD.md).
 *
 *   height.bin  the ground on frame.js's 30 m grid: H_N by H_N
 *               little endian Uint16, x fastest, y = v / 10 - 1000. The
 *               terrain engine draws exactly these samples as its level 0
 *               (src/maps/interior/terrain.js), so the ground the room
 *               stands a person on is the ground a screen draws.
 *   land.bin    the land cover on the 10 m grid, one LAND class a cell,
 *               run length coded (build.py write_rle).
 *
 * makeWorld(bytes) takes the two files' bytes (ArrayBuffer, typed array or
 * Node Buffer) and is pure: no fetch, no file system, so the same module
 * runs in a browser, the Node room and a check. loadWorld() (browser,
 * fetch) and node.js loadWorldNode() (the room, files) only find the
 * bytes.
 *
 * Arithmetic only (+ - * /, Math.floor): the same answer to the bit on
 * every engine, which the room's line of sight and every screen's
 * drawing of a person need.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { HALF, H_CELL, H_N, L_CELL, L_N } from './frame.js';

/* The land classes land.bin holds (build.py, from ESA WorldCover's), and
 * the two places.js paints over it. */
export const LAND = {
  water: 0,
  forest: 1,
  pasture: 2,
  crop: 3,
  shrub: 4,
  wetland: 5,
  bare: 6,
  built: 7,
  burned: 8,
};

export const HEIGHT_BYTES = H_N * H_N * 2;

function bytesOf(buffer) {
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer);
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/* height.bin's samples as a Uint16Array of H_N * H_N, copied so the view
 * is aligned whatever the source buffer's offset. */
export function decodeHeight(buffer) {
  const b = bytesOf(buffer);
  if (b.byteLength !== HEIGHT_BYTES) {
    throw new Error(`interior: height.bin is ${b.byteLength} bytes, not ${HEIGHT_BYTES}`);
  }
  const out = new Uint16Array(H_N * H_N);
  for (let k = 0; k < out.length; k += 1) {
    out[k] = b[2 * k] | (b[2 * k + 1] << 8);
  }
  return out;
}

/* land.bin's classes as a Uint8Array of L_N * L_N, rows north to south
 * (z increasing), x fastest. */
export function decodeLand(buffer) {
  const b = bytesOf(buffer);
  if (b[0] !== 0x49 || b[1] !== 0x4c || b[2] !== 0x4e || b[3] !== 0x44) {
    throw new Error('interior: land.bin does not start with ILND');
  }
  const w = b[4] | (b[5] << 8);
  const h = b[6] | (b[7] << 8);
  if (w !== L_N || h !== L_N) {
    throw new Error(`interior: land.bin is ${w} by ${h}, not ${L_N} square`);
  }
  const out = new Uint8Array(w * h);
  let at = 0;
  let k = 8;
  while (k < b.length) {
    const v = b[k];
    k += 1;
    let run = 0;
    let shift = 1;
    for (;;) {
      const c = b[k];
      k += 1;
      run += (c & 0x7f) * shift;
      shift *= 128;
      if (c < 0x80) {
        break;
      }
    }
    if (at + run > out.length) {
      throw new Error('interior: land.bin runs past its square');
    }
    out.fill(v, at, at + run);
    at += run;
  }
  if (at !== out.length) {
    throw new Error(`interior: land.bin covers ${at} cells of ${out.length}`);
  }
  return out;
}

/*
 * The world from the two files' bytes: { heights, land, groundAt(x, z),
 * landAt(x, z) }. groundAt is the ground in world metres (frame Y up) on
 * the drawn level 0 triangles, clamped to the data's square at its edge; landAt the LAND class
 * of the 10 m cell (x, z) falls in, the nearest edge cell outside it.
 * `edits(x, z, cls)`, optional, is places.js's painting over the land
 * (landEdit): it is handed the data's class and returns the one to use.
 */
export function makeWorld({ height, land, edits = null }) {
  const heights = decodeHeight(height);
  const cells = decodeLand(land);
  const lastH = H_N - 1;
  const groundAt = (x, z) => {
    let fx = (x + HALF) / H_CELL;
    let fz = (z + HALF) / H_CELL;
    fx = fx < 0 ? 0 : fx > lastH ? lastH : fx;
    fz = fz < 0 ? 0 : fz > lastH ? lastH : fz;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    i = i >= lastH ? lastH - 1 : i;
    j = j >= lastH ? lastH - 1 : j;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * H_N + i;
    const h00 = heights[k] * 0.1 - 1000;
    const h10 = heights[k + 1] * 0.1 - 1000;
    const h01 = heights[k + H_N] * 0.1 - 1000;
    const h11 = heights[k + H_N + 1] * 0.1 - 1000;
    /* The terrain engine's two triangles of the cell, split on the
     * diagonal from (i, j + 1) to (i + 1, j) (src/maps/terrain/engine.js
     * tri), so this is the drawn level 0 ground exactly, not a bilinear
     * surface a few centimetres off it. */
    if (tx + tz <= 1) {
      return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    }
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  };
  const rawLand = (x, z) => {
    let i = Math.floor((x + HALF) / L_CELL);
    let j = Math.floor((z + HALF) / L_CELL);
    i = i < 0 ? 0 : i >= L_N ? L_N - 1 : i;
    j = j < 0 ? 0 : j >= L_N ? L_N - 1 : j;
    return cells[j * L_N + i];
  };
  const landAt = edits ? (x, z) => edits(x, z, rawLand(x, z)) : rawLand;
  return {
    heights, land: cells, groundAt, landAt, rawLand,
  };
}

/* The two files beside this module, fetched (a browser). */
export async function fetchWorldBytes() {
  const get = async (name) => {
    const url = new URL(`./${name}`, import.meta.url);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`interior: ${url}: HTTP ${res.status}`);
    }
    return res.arrayBuffer();
  };
  const [height, land] = await Promise.all([get('height.bin'), get('land.bin')]);
  return { height, land };
}
