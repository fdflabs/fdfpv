/*
 * assets.js: the photographs swiss2 is textured with, fetched and handed
 * to the GPU.
 *
 * Every file is under assets/swiss2/ and every one is CC0, from Poly Haven
 * or ambientCG; docs/SWISS2-ASSETS.md names each with its source and
 * licence, and says how the files were packed from the originals.
 *
 *   terrain layers   <name>_col.jpg albedo, <name>_nrh.jpg with the
 *                    OpenGL normal in red and green and the height in blue.
 *                    All eight go into two texture arrays, one draw's
 *                    worth of samplers however many layers are blended.
 *   surfaces         <name>_col.jpg, <name>_nrm.jpg and <name>_arm.jpg
 *                    (ambient occlusion, roughness, metalness), as plain
 *                    textures for the village's standard materials.
 *   sky              sky_back.jpg, the photographed sky above the horizon
 *                    for the backdrop, and sky_env.hdr, the same sky with
 *                    the sun's disc painted out, for image based lighting.
 *
 * Nothing here is fetched until swiss2 is chosen: the registry's loader is
 * a dynamic import, and these fetches run inside the build.
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
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const BASE = new URL('../../../assets/swiss2/', import.meta.url);

/* The terrain's layers, in texture array order. ground.js's shader names
 * them by these indices. */
export const LAYERS = ['meadow', 'pasture', 'forest', 'scree', 'rock', 'snow', 'shore', 'path', 'alpine'];

/* The surfaces the village and the props are finished with. */
export const SURFACES = ['boards', 'render', 'stone', 'shingle', 'slate', 'asphalt', 'gravel', 'cobble', 'concrete', 'metal'];

/* The sky backdrop's encoding, written by the script that packed it: the
 * file is sRGB of radiance times SKY_K, from the zenith down to
 * SKY_BELOW degrees under the horizon. The sun's direction is where the
 * photograph has it: 37.8 degrees up, at u 0.600 round the equirect. */
export const SKY_K = 0.18588;
export const SKY_SPAN_DEG = 98;
export const SUN_U = 0.6001;
export const SUN_ELEVATION_DEG = 37.79;

async function fetchBitmap(name) {
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
 * and ground.js reads the normal's green with that in mind). The albedo
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

export async function loadSky() {
  const loader = new THREE.TextureLoader();
  const [back, env] = await Promise.all([
    loader.loadAsync(new URL('sky_back.jpg', BASE).href),
    new RGBELoader().loadAsync(new URL('sky_env.hdr', BASE).href),
  ]);
  back.colorSpace = THREE.SRGBColorSpace;
  back.wrapS = THREE.RepeatWrapping;
  back.wrapT = THREE.ClampToEdgeWrapping;
  back.generateMipmaps = false;
  back.minFilter = THREE.LinearFilter;
  env.mapping = THREE.EquirectangularReflectionMapping;
  return { back, env };
}
