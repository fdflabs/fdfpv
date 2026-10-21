/*
 * surfaces.js: the asset library's photographed materials, first the
 * Swiss valley's (assets/swiss2/, docs/SWISS2-ASSETS.md names each file
 * with its source and its CC0 licence): <name>_col.jpg, <name>_nrm.jpg and
 * <name>_arm.jpg (ambient occlusion, roughness, metalness), as plain
 * textures for buildings' and props' standard materials, Itaipu's and the
 * Interior's. The valley's nine terrain layers and the texture arrays they
 * were loaded into left with the valleys (2026-10-20); Itaipu loads the
 * two of them it blends (shore, rock) itself (src/maps/itaipu/look/
 * ground.js).
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
