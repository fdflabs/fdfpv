/*
 * surfaces.js: the asset library's photographed materials, first the
 * Swiss valley's (assets/swiss2/, docs/SWISS2-ASSETS.md names each file
 * with its source and its CC0 licence):
 *
 *   terrain layers   <name>_col.jpg albedo, <name>_nrh.jpg with the
 *                    OpenGL normal in red and green and the height in blue.
 *                    All of them go into two texture arrays, one draw's
 *                    worth of samplers however many layers are blended.
 *   surfaces         <name>_col.jpg, <name>_nrm.jpg and <name>_arm.jpg
 *                    (ambient occlusion, roughness, metalness), as plain
 *                    textures for buildings' and props' standard
 *                    materials: the Swiss valley's, Itaipu's and the
 *                    Interior's.
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

import * as THREE from 'three';

const BASE = new URL('../../../assets/swiss2/', import.meta.url);

/* The terrain's layers, in texture array order. The Swiss valley's
 * ground.js shader names them by these indices. */
export const LAYERS = ['meadow', 'pasture', 'forest', 'scree', 'rock', 'snow', 'shore', 'path', 'alpine'];

/* The surfaces buildings and props are finished with. */
export const SURFACES = ['boards', 'render', 'stone', 'shingle', 'slate', 'asphalt', 'gravel', 'cobble', 'concrete', 'metal'];

/* A file under assets/swiss2/ as an ImageBitmap, decoded as data. */
export async function fetchBitmap(name) {
  const res = await fetch(new URL(name, BASE));
  if (!res.ok) {
    throw new Error(`swiss2: ${name}: HTTP ${res.status}`);
  }
  /* No colour space conversion and no premultiplication: a normal map
   * and a height are data, and a browser that colour manages them moves
   * every normal. */
  return createImageBitmap(await res.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
}

/*
 * Two texture arrays from the terrain layers, `size` square per layer,
 * rows top first (no flip: a texture array cannot be flipped on upload,
 * and the ground's shader reads the normal's green with that in mind). The albedo
 * array is sRGB, the normal and height array is data.
 */
export async function loadTerrainArrays(size, anisotropy) {
  const bitmaps = await Promise.all(LAYERS.flatMap((n) => [fetchBitmap(`${n}_col.jpg`), fetchBitmap(`${n}_nrh.jpg`)]));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const layer = size * size * 4;
  const col = new Uint8Array(layer * LAYERS.length);
  const nrh = new Uint8Array(layer * LAYERS.length);
  LAYERS.forEach((n, k) => {
    for (const [bmp, out] of [[bitmaps[k * 2], col], [bitmaps[k * 2 + 1], nrh]]) {
      g.clearRect(0, 0, size, size);
      g.drawImage(bmp, 0, 0, size, size);
      out.set(g.getImageData(0, 0, size, size).data, k * layer);
      bmp.close();
    }
  });
  const make = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, size, size, LAYERS.length);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
    return t;
  };
  return { col: make(col, true), nrh: make(nrh, false) };
}

/* One surface's three maps. `repeat` is metres per tile: the look's
 * geometry carries world metres in its uv, so a texture's repeat is one
 * over its physical size. */
export async function loadSurface(name, anisotropy) {
  const loader = new THREE.TextureLoader();
  const [col, nrm, arm] = await Promise.all(['col', 'nrm', 'arm'].map((m) => loader.loadAsync(new URL(`${name}_${m}.jpg`, BASE).href)));
  col.colorSpace = THREE.SRGBColorSpace;
  for (const t of [col, nrm, arm]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
  }
  return { col, nrm, arm };
}
