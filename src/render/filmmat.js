/*
 * filmmat.js: translucent iron on covering film over a built up frame, as
 * a cel material that lets the sun through.
 *
 * Transparent MonoKote is a coloured polyester film a few hundredths of a
 * millimetre thick over a balsa wing that is mostly air: ribs, spars,
 * sheeting and cap strips with open bays between them. Lit from the
 * viewer's side the bays read a shade darker than the wood, since what is
 * behind the film there is the dark inside of the wing, while over a rib
 * the pale balsa throws the light back through the colour. Lit from
 * behind, against the sun, it is the other way round and far stronger:
 * the bays glow the film's colour, twice through it, top and bottom skin,
 * and every rib, spar and sheeted panel stands in them as a dark shadow.
 * That second look is the one a translucent covered model is built for.
 *
 * Done without any transparency or sorting: the aircraft stays an opaque,
 * depth written mesh. The frame is baked into the map the caller draws, a
 * texture whose colour is the film as the viewer's side lights it (bays
 * darker, wood lighter) and whose alpha is how much wood is behind the
 * film there, 0 an open bay and 1 a rib or sheet. The shader adds, per
 * directional light, the light that comes through the film from the far
 * side: the light's colour times the film's colour squared (two skins) and
 * the open share, weighted by how squarely the light strikes the far side,
 * max(-N.L, 0), and more when the viewer looks toward the light (forward
 * scattering through a thin film). Every directional light a map has is
 * summed, so no light has to be named the sun. The film's transmitted
 * colour is its own hue at full strength, the square root of the colour
 * over its brightest channel: what a dyed film passes of white light is
 * its dye's colour, brighter than the colour it reflects over a dark bay.
 * Where wood is behind the film and the light is behind it, the wood is
 * a silhouette, darker than the bays around it.
 *
 * Built on celMaterial, so the shading, the rim and the outline are the
 * other aircraft's. The transmission lands before tone mapping and fog.
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

import * as THREE from 'three';
import { celMaterial } from './celmat.js';

const FILM_CHUNK = /* glsl */ `
  #if NUM_DIR_LIGHTS > 0
  {
    vec4 filmTex = texture2D(map, vMapUv);
    vec3 filmV = normalize(vViewPosition);
    vec3 filmIn = vec3(0.0);
    float filmBehind = 0.0;
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      vec3 filmL = directionalLights[i].direction;
      float filmBack = max(-dot(normal, filmL), 0.0);
      float filmFwd = max(dot(-filmV, filmL), 0.0);
      float filmW = filmBack * (0.3 + 0.7 * filmFwd * filmFwd);
      filmIn += directionalLights[i].color * filmW;
      filmBehind += filmW;
    }
    vec3 filmC = diffuse * filmTex.rgb;
    float filmPeak = max(max(filmC.r, filmC.g), max(filmC.b, 1e-3));
    vec3 filmTint = sqrt(filmC / filmPeak);
    outgoingLight *= 1.0 - 0.55 * filmTex.a * clamp(filmBehind, 0.0, 1.0);
    outgoingLight += filmIn * filmTint * (1.0 - filmTex.a) * uFilmGlow;
  }
  #endif
`;

/*
 * opts: map (the film and the frame, see above; required), glow, and any
 * celMaterial option. `glow` scales the light let through: 1 is a film
 * that passes its colour whole.
 */
export function filmMaterial(opts) {
  if (!opts.map || !opts.key) {
    throw new Error('filmmat: a film needs its map and a key naming it');
  }
  return withFilm(celMaterial(opts), { value: opts.glow ?? 1 });
}

/*
 * The film's light through the frame on any lit material of three's that
 * samples the film map as `map`: the cel one above, and the physically
 * based twin swiss2 dresses a craft in (src/maps/swiss2/craftlook.js),
 * which hands this the cel material's own glow so the two stay one.
 */
export function withFilm(mat, glow) {
  const base = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    shader.uniforms.uFilmGlow = glow;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n uniform float uFilmGlow;')
      .replace('#include <opaque_fragment>', `${FILM_CHUNK}\n#include <opaque_fragment>`);
    if (!shader.fragmentShader.includes('filmBehind')) {
      throw new Error('filmmat: the lit shader changed and the film chunk did not land');
    }
  };
  mat.customProgramCacheKey = () => `${baseKey()}|film`;
  mat.userData.film = glow;
  return mat;
}

/*
 * A film map from a painter: width by height texels, and paint(u, v)
 * returning [r, g, b, wood] in 0..1 for the texel's centre. Linear
 * filtered and mipmapped, so ribs a few texels wide fade into the film's
 * average colour with distance instead of shimmering. A DataTexture, not a
 * canvas, so it builds wherever the model does, a test in Node included.
 */
export function filmMap(width, height, paint) {
  const data = new Uint8Array(width * height * 4);
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const [r, g, b, a] = paint((i + 0.5) / width, (j + 0.5) / height);
      const k = (j * width + i) * 4;
      data[k] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      data[k + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
      data[k + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
      data[k + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    }
  }
  return filmMapOf(data, width, height);
}

/* A film map from texels already drawn, RGBA bytes a row at a time. */
export function filmMapOf(data, width, height) {
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
