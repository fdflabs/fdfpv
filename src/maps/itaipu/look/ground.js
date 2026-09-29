/*
 * ground.js: the terrain's material. The satellite's colour, swiss2's
 * photographed detail under it.
 *
 * WHAT THE GROUND IS MADE OF. Colour is Sentinel-2's (imagery/hero.jpg at
 * 10 m over the hero, imagery/ring.jpg at 40 m over the ring), already
 * display sRGB by the pipeline's fixed curve, so the map never guesses an
 * exposure. Close to, a 10 m pixel is a blur, so the detail comes from
 * swiss2's CC0 terrain photographs (src/maps/swiss2/assets.js LAYERS),
 * chosen per texel by package A's splat masks (masks/*.png: forest,
 * field, red soil, urban, summing to 255): the forest floor, the meadow,
 * the worn earth (tinted red by the colour above it: the region's terra
 * roxa), and the fine gravel for what is paved. Rock on anything too
 * steep for the photograph from above to mean much.
 *
 * THE COLOUR IS A REFLECTANCE. The pipeline wrote each pixel as the sRGB
 * transfer of min(1, reflectance / white) (manifest imagery.colour: white
 * 0.28), a print stretched so the land fills the range. Decoded to
 * linear and multiplied back by white, a texel is the ground's own
 * reflectance again, which is the albedo a lit material wants: the sun
 * and the post chain's metered exposure then make it look as bright as
 * it is, and the satellite's stretch is not applied twice.
 *
 * THE DETAIL TAKES ITS COLOUR FROM THE SATELLITE. A photograph's colour
 * divided by its own mean (its last mip) is a pattern round 1; the
 * satellite's colour times that pattern is the satellite's colour with the
 * photograph's grain, so a field is the field's colour at every distance
 * and the mipmaps fade the grain into it with no seam. A little of the
 * photograph's own hue is kept (DETAIL_HUE), so a meadow's blades are
 * greener than its bare patches.
 *
 * The masks are decoded unpremultiplied (package A's note): a texel whose
 * urban weight is 0 has alpha 0, and a premultiplied decode zeroes the
 * other three weights with it.
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
import { LAYERS } from '../../swiss2/assets.js';

/* Each mask channel's layer, by name, and the rock for the faces. */
const LAYER = {
  forest: LAYERS.indexOf('forest'),
  field: LAYERS.indexOf('meadow'),
  soil: LAYERS.indexOf('path'),
  urban: LAYERS.indexOf('shore'),
  rock: LAYERS.indexOf('rock'),
};
/* Metres a tile of each covers: swiss2/ground.js's TILE for the same
 * photographs. */
const TILE = { forest: 2.4, field: 1.9, soil: 2.6, urban: 3.0, rock: 30 };
const DETAIL_HUE = 0.3;
/* Where the grain has faded into its mean and is not worth reading. */
const DETAIL_FAR = 1800;

/* An image from the data folder as a texture, decoded as the pipeline
 * wrote it: no colour management and no premultiplication (fetchBitmap in
 * swiss2/assets.js says why). Rows stay top first: v runs north to south,
 * which is the imagery's own order (pixel (0, 0) is the north west
 * corner). */
export async function loadImage(url, srgb, anisotropy) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`itaipu: ${url}: HTTP ${res.status}`);
  }
  const bitmap = await createImageBitmap(await res.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const t = new THREE.Texture(bitmap);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.flipY = false;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  t.addEventListener('dispose', () => bitmap.close());
  return t;
}

const PARS = /* glsl */ `
  uniform sampler2D uHeroCol;
  uniform sampler2D uRingCol;
  uniform sampler2D uHeroMask;
  uniform sampler2D uRingMask;
  uniform highp sampler2DArray uLayerCol;
  uniform highp sampler2DArray uLayerNrh;
  uniform vec2 uHalf;
  uniform float uWhite;
  varying vec3 vItWorld;
  varying vec3 vItNormal;
  vec3 itNrm = vec3(0.0, 1.0, 0.0);
  float itRough = 0.92;

  /* A layer's grain round 1, and its normal's tangent part. */
  vec3 itGrain(float k, vec2 uv, out vec3 tn) {
    vec3 col = texture(uLayerCol, vec3(uv, k)).rgb;
    vec3 mean = textureLod(uLayerCol, vec3(0.5, 0.5, k), 12.0).rgb;
    vec3 ratio = col / max(mean, vec3(0.02));
    float l = dot(ratio, vec3(0.3, 0.59, 0.11));
    vec4 nh = texture(uLayerNrh, vec3(uv, k));
    vec2 xy = nh.rg * 2.0 - 1.0;
    xy.y = -xy.y;
    tn = vec3(xy, sqrt(max(0.0, 1.0 - dot(xy, xy))));
    return mix(vec3(l), ratio, ${DETAIL_HUE.toFixed(2)});
  }
`;

const ALBEDO = /* glsl */ `
  {
    vec2 w = vItWorld.xz;
    vec2 hu = (w + uHalf.x) / (2.0 * uHalf.x);
    vec2 ru = (w + uHalf.y) / (2.0 * uHalf.y);
    float edge = max(abs(w.x), abs(w.y));
    float inHero = 1.0 - smoothstep(uHalf.x - 320.0, uHalf.x - 20.0, edge);
    float outRing = smoothstep(uHalf.y, uHalf.y + 4000.0, edge);
    vec3 macro = texture2D(uRingCol, ru).rgb;
    vec4 mask = texture2D(uRingMask, ru);
    if (inHero > 0.0) {
      macro = mix(macro, texture2D(uHeroCol, hu).rgb, inHero);
      mask = mix(mask, texture2D(uHeroMask, hu), inHero);
    }
    /* Past the ring, the ring's own mean colour and a field's grain. */
    macro = mix(macro, textureLod(uRingCol, vec2(0.5), 12.0).rgb, outRing);
    mask = mix(mask, vec4(0.2, 0.6, 0.2, 0.0), outRing);
    mask /= max(dot(mask, vec4(1.0)), 1e-3);

    vec3 n = normalize(vItNormal);
    float steep = smoothstep(0.62, 0.82, 1.0 - n.y);
    float dist = distance(vItWorld, cameraPosition);
    float near = 1.0 - smoothstep(${(DETAIL_FAR / 3).toFixed(1)}, ${DETAIL_FAR.toFixed(1)}, dist);
    vec3 grain = vec3(1.0);
    vec3 tsum = vec3(0.0, 0.0, 1.0);
    if (near > 0.0) {
      vec3 tn;
      vec3 g = vec3(0.0);
      tsum = vec3(0.0);
      g += itGrain(${LAYER.forest.toFixed(1)}, w / ${TILE.forest.toFixed(2)}, tn) * mask.r; tsum += tn * mask.r;
      g += itGrain(${LAYER.field.toFixed(1)}, w / ${TILE.field.toFixed(2)}, tn) * mask.g; tsum += tn * mask.g;
      g += itGrain(${LAYER.soil.toFixed(1)}, w / ${TILE.soil.toFixed(2)}, tn) * mask.b; tsum += tn * mask.b;
      g += itGrain(${LAYER.urban.toFixed(1)}, w / ${TILE.urban.toFixed(2)}, tn) * mask.a; tsum += tn * mask.a;
      /* A second read five times the size under the first, so a field is
       * not a thousand copies of one tile. */
      vec3 tb;
      vec3 big = itGrain(${LAYER.field.toFixed(1)}, w / ${(TILE.field * 5.3).toFixed(2)} + vec2(0.37, 0.71), tb);
      g *= mix(vec3(1.0), big, 0.35 * (mask.g + mask.r));
      grain = mix(vec3(1.0), g, near);
      tsum = mix(vec3(0.0, 0.0, 1.0), tsum, near);
    }
    macro *= uWhite;
    vec3 albedo = macro * grain;
    /* Faces too steep for a photograph from above: rock, read from the
     * side the face looks toward (read from above, a cliff is the
     * photograph drawn out into vertical streaks), and pulled toward the
     * satellite's colour there. */
    if (steep > 0.0) {
      vec2 side = abs(n.x) > abs(n.z) ? vItWorld.zy : vItWorld.xy;
      vec3 rock = texture(uLayerCol, vec3(side / ${TILE.rock.toFixed(1)}, ${LAYER.rock.toFixed(1)})).rgb;
      rock = mix(rock, macro, 0.4);
      albedo = mix(albedo, rock, steep);
    }
    diffuseColor.rgb *= albedo;
    /* The whiteout blend on the ground plane (swiss2/ground.js
     * s2Whiteout, plan axis), in the world, then into view space. */
    vec3 wn = normalize(vec3(tsum.x * 0.8 + n.x, abs(tsum.z) * n.y, tsum.y * 0.8 + n.z));
    itNrm = wn;
    itRough = mix(0.93, 0.82, mask.a);
  }
`;

/*
 * The material. `tex` is { heroCol, ringCol, heroMask, ringMask } from
 * loadImage and `arrays` swiss2's loadTerrainArrays; the caller owns them.
 * `white` is the reflectance the imagery's full scale stands for.
 */
export function groundMaterial({
  tex, arrays, heroHalf, ringHalf, white,
}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHeroCol = { value: tex.heroCol };
    shader.uniforms.uRingCol = { value: tex.ringCol };
    shader.uniforms.uHeroMask = { value: tex.heroMask };
    shader.uniforms.uRingMask = { value: tex.ringMask };
    shader.uniforms.uLayerCol = { value: arrays.col };
    shader.uniforms.uLayerNrh = { value: arrays.nrh };
    shader.uniforms.uHalf = { value: new THREE.Vector2(heroHalf, ringHalf) };
    shader.uniforms.uWhite = { value: white };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vItWorld;\nvarying vec3 vItNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vItWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vItNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${ALBEDO}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = itRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(itNrm, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'itaipu-ground';
  m.name = 'itaipu-ground';
  return m;
}
