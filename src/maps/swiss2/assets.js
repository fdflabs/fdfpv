/*
 * assets.js: the photographs swiss2 is textured with, fetched and handed
 * to the GPU. The terrain layers and the surfaces are the asset
 * library's (src/render/library/surfaces.js), which Itaipu and the
 * Interior finish their buildings with too; the sky and the marks are
 * the valley's own.
 *
 * Every file is under assets/swiss2/ and every one but the marks is CC0,
 * from Poly Haven or ambientCG; docs/SWISS2-ASSETS.md names each with its
 * source and licence, and says how the files were packed from the
 * originals. The marks (marks/) are other people's logos, used by
 * permission and not under any free licence: NOTICE says whose.
 *
 *   sky              sky_back.jpg, the photographed sky above the horizon
 *                    for the backdrop, and sky_env.hdr, the same sky with
 *                    the sun's disc painted out, for image based lighting.
 *
 * Nothing here is fetched until swiss2 is chosen: the registry's loader is
 * a dynamic import, and these fetches run inside the build.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { fetchBitmap } from '../../render/library/surfaces.js';

const BASE = new URL('../../../assets/swiss2/', import.meta.url);

/* The sky backdrop's encoding, written by the script that packed it: the
 * file is sRGB of radiance times SKY_K, from the zenith down to
 * SKY_BELOW degrees under the horizon. The sun's direction is where the
 * photograph has it: 37.8 degrees up, at u 0.600 round the equirect. */
export const SKY_K = 0.18588;
export const SKY_SPAN_DEG = 98;
export const SUN_U = 0.6001;
export const SUN_ELEVATION_DEG = 37.79;

/*
 * A mark painted on a building (marks/<name>_col.webp, see NOTICE: these
 * are not CC0). sRGB, straight alpha, every transparent texel already the
 * colour of the art nearest it so no mip level darkens the edge. It is
 * decoded unpremultiplied, as fetchBitmap does, because a browser that
 * premultiplies on decode zeroes that colour. An ImageBitmap cannot be
 * flipped on upload, so its rows stay top first: v runs down the image.
 */
export async function loadMark(name, anisotropy) {
  const bitmap = await fetchBitmap(`marks/${name}_col.webp`);
  const t = new THREE.Texture(bitmap);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  t.addEventListener('dispose', () => bitmap.close());
  return t;
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
