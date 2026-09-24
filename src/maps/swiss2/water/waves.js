/*
 * waves.js: the one texture all of swiss2's water is roughened with.
 *
 * A tiling height field of ripples, a few octaves of periodic value
 * noise, stored as its surface normal in RGB and its height in A. Made
 * here at load rather than shipped: it is two hundred and fifty
 * thousand texels of arithmetic, a few milliseconds, and deterministic.
 * The lake reads its normals at three scales drifting downwind, the
 * stream scrolls them along its flow, the fall and the foam read the
 * height as their streaks and bubbles.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';

function hash(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Value noise on a lattice `period` cells across that wraps. */
function periodic(x, y, period, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const x0 = ((ix % period) + period) % period;
  const y0 = ((iy % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function waveTexture(size = 512) {
  const h = new Float32Array(size * size);
  const octaves = [[8, 0.5], [16, 0.28], [32, 0.14], [64, 0.08]];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let v = 0;
      octaves.forEach(([p, a], k) => {
        /* Ridged a little: wind ripples have sharp crests and broad
         * troughs. */
        const n = periodic((x / size) * p, (y / size) * p, p, 11 + k);
        v += a * (1 - Math.abs(n * 2 - 1)) ** 1.5;
      });
      h[y * size + x] = v;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of h) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  /* The slope is in height units a texel; scaled so the steepest ripple
   * leans the normal about forty five degrees. */
  const k = (size / 16) / (hi - lo);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k;
      const dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      data[o + 3] = Math.round(((at(x, y) - lo) / (hi - lo)) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
