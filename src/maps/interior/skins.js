/*
 * skins.js: the Interior's built surfaces' fine detail, drawn into small
 * textures at load from a seeded hash: the clay tile's courses, the
 * corrugated tin's ribs and sheets, the rust that eats them, the plaster's
 * mottle. No image file: what a 6 cm pixel through the camera ball's 8x
 * shows of a roof (scripts/interior-views.js zoom-colonia-500) is a few
 * hundred bytes of arithmetic here, the same on every machine.
 *
 * Every skin tiles. Its texels are laid out in metres (PERIOD, u and v of
 * the faces built.js's sink projects, u level along the face, v up its
 * slope), so a rib or a course is its real size on every roof. The grey
 * ones are a detail the material's vertex colour multiplies, mean near
 * MEAN so the colour a building is given is about the colour it reads;
 * rust is a colour of its own, zinc and its rust, since a grey cannot
 * turn a grey roof orange.
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

import { hash01 } from '../../share/interior/canopy.js';

const SIZE = 256;
/* Metres one repeat covers, [u, v]. Tin: 32 ribs of a 76 mm sheet, two
 * sheets of 16 ribs across, a 3.6 m sheet's length. Tile: 16 barrel
 * tiles of 0.2 m across, 8 courses of 0.4 m up. */
export const PERIOD = {
  tile: [3.2, 3.2],
  tin: [32 * 0.0762, 3.6],
  rust: [32 * 0.0762, 3.6],
  plaster: [4, 4],
};
/* The grey skins' mean, which built.js divides a vertex colour by. */
export const MEAN = 0.86;

/* Value noise that tiles over n lattice cells across the texture. */
function tiled(x, y, n, salt) {
  const fx = x * n;
  const fy = y * n;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const s = (t) => t * t * (3 - 2 * t);
  const tx = s(fx - i);
  const ty = s(fy - j);
  const h = (a, b) => hash01(((a % n) + n) % n, ((b % n) + n) % n, salt);
  const a = h(i, j) + (h(i + 1, j) - h(i, j)) * tx;
  const b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * tx;
  return a + (b - a) * ty;
}

function fill(fn) {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const [r, g, b] = fn((x + 0.5) / SIZE, (y + 0.5) / SIZE, x, y);
      const k = (y * SIZE + x) * 4;
      data[k] = Math.max(0, Math.min(255, Math.round(r * 255)));
      data[k + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      data[k + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
      data[k + 3] = 255;
    }
  }
  return data;
}

const grey = (v) => [v, v, v];

/* Barrel tiles: a channel and a cover course in turn across, each
 * course's lower lip throwing a line of shadow on the one below, a tone
 * for every tile so the roof is a field of fired clay, not a print. */
function tile(u, v) {
  const across = u * 16;
  const col = Math.floor(across);
  const t = across - col;
  const up = v * 8;
  const row = Math.floor(up);
  const r = up - row;
  const curve = Math.sin(Math.PI * t);
  const shape = col % 2 ? 0.74 + 0.26 * curve ** 0.6 : 0.6 + 0.2 * (1 - curve);
  const lip = r < 0.07 ? 0.62 + 0.38 * (r / 0.07) : 1;
  const tone = 0.86 + 0.16 * hash01(col, row, 11) - (hash01(col, row, 12) < 0.06 ? 0.2 : 0);
  const grime = 0.9 + 0.1 * tiled(u, v, 4, 13);
  return grey(Math.min(1, shape * lip * tone * grime * 1.08));
}

/* Corrugated sheet: the ribs across, an overlap where two sheets meet
 * every 16 ribs, the lap between one sheet's length and the next, the
 * rows of screws, and the run off's streaks down the slope. */
function tin(u, v) {
  const rib = 0.5 + 0.5 * Math.cos(u * 32 * Math.PI * 2);
  const sheet = Math.floor(u * 2);
  const lapU = (u * 2) % 1;
  const seam = lapU < 0.012 ? 0.7 : 1;
  const lapV = v % 1;
  const lap = lapV < 0.008 ? 0.72 : 1;
  const screws = (lapV < 0.03 || Math.abs(lapV - 0.5) < 0.006) && rib > 0.92 ? 0.75 : 1;
  const streak = 0.92 + 0.08 * tiled(u * 8, v * 0.5, 8, 21);
  const tone = 0.9 + 0.1 * hash01(sheet, 0, 22);
  return grey(Math.min(1, (0.78 + 0.22 * rib) * seam * lap * screws * streak * tone * 1.06));
}

/* Rusted sheet, a colour: zinc where the coat holds, rust in blotches
 * that spread from the laps and the screws and run down the slope. */
function rust(u, v) {
  const [g] = tin(u, v);
  const blot = 0.55 * tiled(u, v, 6, 31) + 0.3 * tiled(u, v, 16, 32) + 0.15 * tiled(u, v, 40, 33);
  const lapV = v % 1;
  const edge = Math.max(0, 1 - lapV / 0.15) * 0.25;
  const k = Math.max(0, Math.min(1, (blot + edge - 0.38) * 3));
  const zinc = [0.62, 0.62, 0.6];
  const deep = hash01(Math.floor(u * 40), Math.floor(v * 40), 34) < 0.5 ? [0.44, 0.2, 0.09] : [0.36, 0.17, 0.08];
  return zinc.map((z, i) => (z + (deep[i] - z) * k) * g);
}

/* Lime plaster or cast concrete: a mottle at a metre and at a hand's
 * width, a grain under it. */
function plaster(u, v, x, y) {
  const m = 0.6 * tiled(u, v, 4, 41) + 0.4 * tiled(u, v, 16, 42);
  const grain = hash01(x, y, 43);
  return grey(0.8 + 0.14 * m + 0.06 * grain);
}

/* The skins as four textures, { tile, tin, rust, plaster }, each a
 * repeating, mipmapped DataTexture. The caller disposes them. */
export function makeSkins(THREE) {
  const out = {};
  for (const [name, fn, srgb] of [['tile', tile, false], ['tin', tin, false], ['rust', rust, true], ['plaster', plaster, false]]) {
    const tex = new THREE.DataTexture(fill(fn), SIZE, SIZE, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.name = `interior-skin-${name}`;
    tex.needsUpdate = true;
    out[name] = tex;
  }
  return out;
}
