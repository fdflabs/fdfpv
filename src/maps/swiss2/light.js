/*
 * light.js: how the photographic valley is lit.
 *
 * The sun is where the photographed sky has it, 37.8 degrees up in the
 * south east, and it is the only direct light: the sky's own disc is
 * painted out of the environment map (see docs/SWISS2-ASSETS.md) so the
 * valley is not lit by the sun twice. Everything else is the sky, as
 * image based light from the same photograph.
 *
 * Three kinds of shadow, each doing what the others cannot:
 *
 *   The mountains. A shadow map that held the valley walls would be
 *   kilometres across and useless for a fence post, and the sun does not
 *   move, so the terrain's shadow is baked once on the GPU at build: for
 *   every point of the field, the height above which the sun clears every
 *   ridge between it and the sun, and how far away that ridge is. Any
 *   fragment compares its own height with that, so a chalet in a ridge's
 *   shadow is in it too, and the penumbra widens with the ridge's
 *   distance as the sun's half degree disc makes it.
 *
 *   Near things. A shadow map fitted round the craft, as the Alps have.
 *
 *   The village from the air. On High a second, coarser map covers the
 *   next kilometre ahead of the camera, so a chalet at three hundred
 *   metres still stands on its shadow. The two lights split the sun
 *   between them per fragment, which is a cascade without three's CSM
 *   addon: CSM rewrites three's shared light chunk for every material in
 *   the session, and the cel maps would then be compiled from a copy.
 *
 * All of it reaches a material through lit(), which rewrites that
 * material's own copy of the light loop and leaves three's chunks alone.
 * Everything swiss2 draws is passed through it after the build, whoever
 * built it.
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
import { FIELD, HALF, CELLS } from '../alps/terrain.js';
import { SUN_U, SUN_ELEVATION_DEG } from './assets.js';
import { LOW_COVER_GLSL, LOW_SHADOW_Y, LOW_SHADOW_DEPTH } from './clouds.js';

/* Toward the sun, from the photograph's own sun: three's equirect maps u
 * to atan(z, x) / 2 pi + 0.5. */
export function sunDirection() {
  const e = (SUN_ELEVATION_DEG * Math.PI) / 180;
  const a = (SUN_U - 0.5) * 2 * Math.PI;
  return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).normalize();
}

/*
 * The sun's strength against the sky's. Measured off the photograph when
 * the disc was painted out, the sun's irradiance is 2.7 in the HDR's own
 * units, which next to that sky makes a soft, hazy day. The valley in the
 * reference photographs (Lauterbrunnen, Engelberg, in sun) has harder
 * shadows than that, so the sun is lifted by the factor here rather than
 * the sky dimmed, which keeps the sky exactly the photograph.
 */
export const SUN_COLOR = new THREE.Color(1.0, 0.96, 0.9);
export const SUN_IRRADIANCE = 2.7 * 1.3;
/*
 * And the same argument from the other side: the photographed sky's
 * cloud round the sun makes the sky nearly as strong a light as the sun
 * (irradiance 1.41 on the level against the sun's 1.65, measured off
 * sky_env.hdr), which is a hazy day's flat light. The sky's diffuse light
 * is taken down to this fraction; its reflections, in glass and water,
 * are left at full strength so they still match the sky behind them.
 */
const SKY_DIFFUSE = 0.62;

/*
 * The clouds. The photographed sky is a broken summer cumulus, and under
 * a sky like that the valley is never lit evenly: the reference
 * photographs all have a wall in shade next to one in sun and dark
 * patches drifting over the floor. Their shadow is the one light here
 * that changes (at the wind's speed, CLOUD_WIND m/s), and it takes the
 * sun only: the sky still lights the ground under a cloud, which is why
 * a cloud's shadow is blue and not black.
 *
 * CLOUD_COVER is the share of the ground in shadow; the size is the
 * noise's scale in metres, a cloud a few hundred metres across; the depth
 * is how much of the sun a cumulus stops. CLOUD_START is where the deck
 * stands when the valley is first drawn, chosen (with the loop's views'
 * cameras and times) so that no fixed view opens with its own foreground
 * under a cloud: a view is judged once, and a picture that happens to
 * start in shade says nothing about the valley it was meant to show.
 */
const CLOUD_BASE = 2600;
const CLOUD_SIZE = 1100;
const CLOUD_COVER = 0.36;
const CLOUD_DEPTH = 0.82;
const CLOUD_WIND = new THREE.Vector2(-7, 4);
const CLOUD_START = new THREE.Vector2(1055, 3940);

/* The terrain shadow is baked at this many texels a side over the field,
 * 5.9 m a texel, and the ground it walks over is read at the same
 * spacing from the field's own height(x, z), not from its 30 m grid: a
 * wall shaped finer than the grid casts the shadow it is drawn with, and
 * whatever ground swiss2 hands the bake, the bake follows. */
const SHADOW_PX = 1024;

/*
 * The sky's share of a point's light, at the landscape's scale. The
 * occlusion pass (post.js) sees two metres round a pixel; it cannot see
 * that the floor of a valley a kilometre and a half deep, or a gully in
 * a wall, is under far less sky than an open shoulder, which is most of
 * why a shaded wall in the photographs is deep blue and not a dimmer copy
 * of the lit one. Baked with the shadow: per texel, the horizon's rise in
 * SKY_DIRS directions out to SKY_REACH metres, and the share of a cosine
 * weighted sky above it, the mean of cos^2 of the horizon's elevation.
 * SKY_OCC is how much of that is taken, because the image based light
 * already dims a steep face by its own normal and would otherwise count
 * the wall above it twice. SKY_LIFT is the height above the ground over
 * which it fades out: a roof or a crown sees over the near rise, and a
 * craft in the air sees nearly all the sky.
 */
const SKY_DIRS = 16;
const SKY_REACH = 2400;
const SKY_OCC = 0.75;
const SKY_LIFT = 120;

/*
 * Bake the terrain's shadow. `field` is the valley's heightfield, read
 * only through its height(x, z), and `far` the range beyond with its own;
 * both go up as half float textures and a fragment per texel walks toward
 * the sun, and round itself for the sky. Returns `shadow`, a render
 * target whose texture holds, per texel, the height the sun clears (r),
 * the distance to the ridge that decides it (g), the sky's share (b) and
 * the ground's height (a); and `height`, the field's heights on its grid
 * (a texel on each of the CELLS + 1 vertices a side), which the village's
 * walls and the low cloud read to know how far above the ground they
 * stand. The caller owns and frees both.
 */
export function bakeTerrainShadow(renderer, field, far, sun) {
  const n = CELLS + 1;
  const fieldHalf = new Uint16Array(n * n);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      fieldHalf[j * n + i] = THREE.DataUtils.toHalfFloat(field.height(-HALF + (i * FIELD) / CELLS, -HALF + (j * FIELD) / CELLS));
    }
  }
  const GN = SHADOW_PX + 1;
  const groundHalf = new Uint16Array(GN * GN);
  for (let j = 0; j < GN; j += 1) {
    for (let i = 0; i < GN; i += 1) {
      groundHalf[j * GN + i] = THREE.DataUtils.toHalfFloat(field.height(-HALF + (i * FIELD) / SHADOW_PX, -HALF + (j * FIELD) / SHADOW_PX));
    }
  }
  const FAR_SIZE = 24000;
  const FN = 161;
  const farHalf = new Uint16Array(FN * FN);
  for (let j = 0; j < FN; j += 1) {
    for (let i = 0; i < FN; i += 1) {
      const x = -FAR_SIZE / 2 + (i * FAR_SIZE) / (FN - 1);
      const z = -FAR_SIZE / 2 + (j * FAR_SIZE) / (FN - 1);
      farHalf[j * FN + i] = THREE.DataUtils.toHalfFloat(far.height(x, z));
    }
  }
  const tex = (data, size) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.HalfFloatType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  const fieldTex = tex(fieldHalf, n);
  const groundTex = tex(groundHalf, GN);
  const farTex = tex(farHalf, FN);
  const target = new THREE.WebGLRenderTarget(SHADOW_PX, SHADOW_PX, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const flat = Math.hypot(sun.x, sun.z);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uField: { value: groundTex },
      uFar: { value: farTex },
      uHalf: { value: HALF },
      uCell: { value: FIELD / SHADOW_PX },
      uN: { value: GN },
      uFarSize: { value: FAR_SIZE },
      uFarN: { value: FN },
      uDir: { value: new THREE.Vector2(sun.x / flat, sun.z / flat) },
      uTanE: { value: sun.y / flat },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform highp sampler2D uField;
      uniform highp sampler2D uFar;
      uniform float uHalf;
      uniform float uCell;
      uniform float uN;
      uniform float uFarSize;
      uniform float uFarN;
      uniform vec2 uDir;
      uniform float uTanE;
      varying vec2 vUv;
      /* Texel centres sit on the grid's vertices, so a vertex's height is
       * read at (i + 0.5) / n. */
      float heightAt(vec2 p) {
        vec2 f = (p + uHalf) / uCell;
        float farH = texture2D(uFar, ((p + uFarSize * 0.5) / uFarSize * (uFarN - 1.0) + 0.5) / uFarN).r;
        if (f.x < 0.0 || f.y < 0.0 || f.x > uN - 1.0 || f.y > uN - 1.0) {
          return farH;
        }
        return max(texture2D(uField, (f + 0.5) / uN).r, farH);
      }
      void main() {
        vec2 p = -vec2(uHalf) + vUv * (2.0 * uHalf);
        float best = -1e4;
        float at = 0.0;
        float t = 3.0;
        for (int i = 0; i < 260; i++) {
          float h = heightAt(p + uDir * t) - t * uTanE;
          if (h > best) {
            best = h;
            at = t;
          }
          t += 2.5 + t * 0.018;
          if (t > 12000.0) {
            break;
          }
        }
        /* The sky: the steepest rise in each direction, as a tangent. The
         * eye stands a metre up, so the facets under it are no horizon. */
        float h0 = heightAt(p) + 1.0;
        float sky = 0.0;
        for (int k = 0; k < ${SKY_DIRS}; k++) {
          float a = (float(k) + 0.5) * ${((2 * Math.PI) / SKY_DIRS).toFixed(6)};
          vec2 d = vec2(cos(a), sin(a));
          float rise = 0.0;
          float s = 6.0;
          for (int i = 0; i < 48; i++) {
            rise = max(rise, (heightAt(p + d * s) - h0) / s);
            s += 4.0 + s * 0.09;
            if (s > ${SKY_REACH.toFixed(1)}) {
              break;
            }
          }
          sky += 1.0 / (1.0 + rise * rise);
        }
        gl_FragColor = vec4(best, at, sky / ${SKY_DIRS.toFixed(1)}, h0 - 1.0);
      }
    `,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  quad.geometry.dispose();
  mat.dispose();
  farTex.dispose();
  return { shadow: target, height: fieldTex };
}

/*
 * How much of the sun reaches a point: the terrain's shadow and the
 * clouds'. Every lit material reads it for its own fragment, and the
 * post chain (post.js) for the camera, where it is how much of the sun
 * the lens sees.
 */
const CLOUD_GLSL = /* glsl */ `
  uniform vec2 uS2CloudAt;
  uniform vec3 uS2SunDir;
  ${LOW_COVER_GLSL}
  float s2cHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float s2cNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(s2cHash(i), s2cHash(i + vec2(1.0, 0.0)), u.x),
               mix(s2cHash(i + vec2(0.0, 1.0)), s2cHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  /* The clouds' shadow: a deck ${CLOUD_BASE} m up, its gaps and its
   * clouds a fractal noise drifting with the wind, projected down the
   * sun's direction so a wall and the floor under it agree. 1 in a gap,
   * 1 - CLOUD_DEPTH under a cloud, with the soft edge a cloud's shadow has
   * at that height. s2Deck takes the point where the sun's ray through p
   * meets the deck, s2Low where it meets the low bank's middle (clouds.js),
   * which stands between p and the sun only below it. */
  float s2Deck(vec2 at) {
    vec2 q = (at + uS2CloudAt) / ${CLOUD_SIZE.toFixed(1)};
    float n = s2cNoise(q) * 0.55 + s2cNoise(q * 2.03 + 5.2) * 0.28 + s2cNoise(q * 4.11 + 1.7) * 0.17;
    return 1.0 - ${CLOUD_DEPTH.toFixed(3)} * smoothstep(${(1 - CLOUD_COVER - 0.07).toFixed(3)}, ${(1 - CLOUD_COVER + 0.07).toFixed(3)}, n);
  }
  float s2Low(vec2 lat) {
    return 1.0 - ${LOW_SHADOW_DEPTH.toFixed(3)} * smoothstep(0.1, 0.6, s2LowCover(lat).x);
  }
  vec2 s2DeckRay(vec3 p) {
    return p.xz + uS2SunDir.xz * ((${CLOUD_BASE.toFixed(1)} - p.y) / max(uS2SunDir.y, 0.1));
  }
  vec2 s2LowRay(vec3 p) {
    return p.xz + uS2SunDir.xz * ((${LOW_SHADOW_Y.toFixed(1)} - p.y) / max(uS2SunDir.y, 0.1));
  }
  float s2Cloud(vec3 p) {
    return s2Deck(s2DeckRay(p)) * (p.y < ${LOW_SHADOW_Y.toFixed(1)} ? s2Low(s2LowRay(p)) : 1.0);
  }
`;

const SUN_GLSL = /* glsl */ `
  uniform highp sampler2D uS2Shadow;
  uniform vec2 uS2Field;
  ${CLOUD_GLSL}
  /* The sun past every ridge: 1 in the sun, 0 in a mountain's shadow,
   * with a penumbra as wide as the sun's disc makes it at the ridge's
   * distance (0.0093 rad across, so half of it either side), and wider
   * again the further the ridge: the haze a kilometre of valley air holds
   * scatters the sun round the rim, and a rim that is a broken crest of
   * trees and rock, not the heightfield's clean line, frays its edge. A
   * shadow thrown across the lake from the west wall a kilometre off was
   * a slab with a ruled edge. (Widened in round 8 by the walls agent, the
   * lead having handed it this file for it.) */
  float s2TerrainSun(vec3 p) {
    vec2 uv = (p.xz + uS2Field.x) / uS2Field.y;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
      return 1.0;
    }
    vec2 s = texture2D(uS2Shadow, uv).rg;
    float w = 2.5 + s.y * 0.0047 + s.y * s.y * 0.000025;
    return smoothstep(s.x - w, s.x + w, p.y);
  }
`;

const LIT_PARS = /* glsl */ `
  varying vec3 vS2World;
  ${SUN_GLSL}
  /* The same, read from the map the frame baked (makeLit's update): the
   * noise is the same for every fragment on a ray toward the sun, and
   * worked out per fragment it was 0.4 ms of a High frame, on the ground
   * and the grass alone (scripts/swiss2-perf.js). Off the baked domain, or
   * before the first bake, it is worked out in full. The lit materials'
   * only, for s2Sky's reason below. */
  uniform sampler2D uS2CloudMap;
  uniform vec4 uS2DeckBox;
  uniform vec4 uS2LowBox;
  float s2CloudMapped(vec3 p) {
    vec2 ua = (s2DeckRay(p) - uS2DeckBox.xy) * uS2DeckBox.zw;
    vec2 ul = (s2LowRay(p) - uS2LowBox.xy) * uS2LowBox.zw;
    bool low = p.y < ${LOW_SHADOW_Y.toFixed(1)};
    if (uS2DeckBox.z == 0.0 || ua.x < 0.0 || ua.y < 0.0 || ua.x > 1.0 || ua.y > 1.0
      || (low && (ul.x < 0.0 || ul.y < 0.0 || ul.x > 1.0 || ul.y > 1.0))) {
      return s2Cloud(p);
    }
    return texture2D(uS2CloudMap, ua).r * (low ? texture2D(uS2CloudMap, ul).g : 1.0);
  }
  /* The sky's share at p (SKY_OCC above): the landscape's horizon, faded
   * out with the height over the ground. The lit materials' only: the
   * meter (post.js) shares SUN_GLSL, and this in its reduce shader cost
   * the page dozens of GL_INVALID_VALUE glGetProgramiv warnings from
   * Chrome though the shader compiled clean (checked with three's shader
   * errors on) and never called it. */
  float s2Sky(vec3 p) {
    vec2 uv = (p.xz + uS2Field.x) / uS2Field.y;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
      return 1.0;
    }
    vec2 s = texture2D(uS2Shadow, uv).ba;
    float v = mix(1.0, s.x, ${SKY_OCC.toFixed(3)});
    return mix(v, 1.0, smoothstep(0.0, ${SKY_LIFT.toFixed(1)}, p.y - s.y));
  }
`;

const LIT_VERTEX = /* glsl */ `
  {
    vec4 s2w = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      s2w = instanceMatrix * s2w;
    #endif
    vS2World = (modelMatrix * s2w).xyz;
  }
`;

const LIT_PRELUDE = /* glsl */ `
  float s2Sun = s2TerrainSun(vS2World) * s2CloudMapped(vS2World);
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
    vec3 s2c = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
    vec2 s2e = min(s2c.xy, 1.0 - s2c.xy);
    float s2Near = smoothstep(0.0, 0.07, min(s2e.x, s2e.y)) * step(s2c.z, 1.0);
  #endif
`;

const LIT_LIGHT = /* glsl */ `getDirectionalLightInfo( directionalLight, directLight );
    directLight.color *= s2Sun;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
      #if UNROLLED_LOOP_INDEX == 0
        directLight.color *= s2Near;
      #else
        directLight.color *= 1.0 - s2Near;
      #endif
    #endif`;

/*
 * The clouds' shadow baked over the ground, CLOUD_PX a side, once a frame.
 * Its red is the deck's shadow over the plane where the sun's rays
 * through the field meet the deck, its green the low bank's over the
 * plane where they meet the bank's middle: every point of the field from
 * under the ground to CLOUD_TOP metres up reads its own ray's texel.
 * The boxes are where the rays land, as (origin, one over the size), and
 * a point whose ray lands off them is worked out in full (s2CloudMapped).
 */
const CLOUD_PX = 1024;
const CLOUD_TOP = 3200;
const CLOUD_FLOOR = -50;
function cloudBake(shared) {
  const dir = shared.uS2SunDir.value;
  const lean = new THREE.Vector2(dir.x, dir.z).divideScalar(Math.max(dir.y, 0.1));
  const box = (yLow, yHigh, plane) => {
    const a = lean.clone().multiplyScalar(plane - yHigh);
    const b = lean.clone().multiplyScalar(plane - yLow);
    const x0 = -HALF + Math.min(a.x, b.x);
    const y0 = -HALF + Math.min(a.y, b.y);
    const x1 = HALF + Math.max(a.x, b.x);
    const y1 = HALF + Math.max(a.y, b.y);
    return new THREE.Vector4(x0, y0, 1 / (x1 - x0), 1 / (y1 - y0));
  };
  const deckBox = box(CLOUD_FLOOR, CLOUD_TOP, CLOUD_BASE);
  const lowBox = box(CLOUD_FLOOR, LOW_SHADOW_Y, LOW_SHADOW_Y);
  const target = new THREE.WebGLRenderTarget(CLOUD_PX, CLOUD_PX, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  target.texture.generateMipmaps = false;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uS2CloudAt: shared.uS2CloudAt,
      uS2SunDir: shared.uS2SunDir,
      uS2LowAt: shared.uS2LowAt,
      uDeck: { value: deckBox },
      uLow: { value: lowBox },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${CLOUD_GLSL}
      uniform vec4 uDeck;
      uniform vec4 uLow;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(s2Deck(uDeck.xy + vUv / uDeck.zw), s2Low(uLow.xy + vUv / uLow.zw), 0.0, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    render(renderer) {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(quad, cam);
      renderer.setRenderTarget(prev);
      shared.uS2CloudMap.value = target.texture;
      shared.uS2DeckBox.value.copy(deckBox);
      shared.uS2LowBox.value.copy(lowBox);
    },
    dispose() {
      target.dispose();
      quad.geometry.dispose();
      mat.dispose();
    },
  };
}

/*
 * Make the injector. Its uniforms are shared by every material it
 * touches, so the terrain shadow is one texture however many materials
 * read it; the low cloud's drift is the clouds' own uniform, so a bank's
 * shadow moves with it. The shadow is baked after the materials exist
 * (it needs the range beyond, which is built after the ground), so it is
 * handed over with lit.setShadow before anything compiles.
 */
export function makeLit(clouds) {
  const shared = {
    uS2LowAt: clouds.uniforms.uS2LowAt,
    uS2Shadow: { value: null },
    uS2Field: { value: new THREE.Vector2(HALF, FIELD) },
    uS2CloudAt: { value: new THREE.Vector2() },
    uS2SunDir: { value: sunDirection() },
    uS2CloudMap: { value: null },
    uS2DeckBox: { value: new THREE.Vector4() },
    uS2LowBox: { value: new THREE.Vector4() },
  };
  const loop = THREE.ShaderChunk.lights_fragment_begin;
  const find = 'getDirectionalLightInfo( directionalLight, directLight );';
  if (!loop.includes(find)) {
    throw new Error('swiss2 light: three renamed getDirectionalLightInfo; the terrain shadow and the cascade would silently vanish');
  }
  const litLoop = loop.replace(find, LIT_LIGHT);
  const inject = (shader) => {
    if (!shader.fragmentShader.includes('#include <lights_fragment_begin>')) {
      throw new Error('swiss2 light: a lit material has no #include <lights_fragment_begin>');
    }
    shader.uniforms.uS2Shadow = shared.uS2Shadow;
    shader.uniforms.uS2Field = shared.uS2Field;
    shader.uniforms.uS2CloudAt = shared.uS2CloudAt;
    shader.uniforms.uS2SunDir = shared.uS2SunDir;
    shader.uniforms.uS2LowAt = shared.uS2LowAt;
    shader.uniforms.uS2CloudMap = shared.uS2CloudMap;
    shader.uniforms.uS2DeckBox = shared.uS2DeckBox;
    shader.uniforms.uS2LowBox = shared.uS2LowBox;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vS2World;');
    if (shader.vertexShader.includes('#include <project_vertex>')) {
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${LIT_VERTEX}`);
    } else if (shader.vertexShader.includes('#include <fog_vertex>')) {
      /* A material that places its own vertices (the meadow's blades are
       * written straight into world space) still leaves mvPosition, and
       * the view's inverse takes it back to the world. */
      shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\nvS2World = (inverse(viewMatrix) * mvPosition).xyz;');
    } else {
      throw new Error('swiss2 light: a lit material leaves no place to find its world position');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${LIT_PARS}`)
      .replace('#include <lights_fragment_begin>', `${LIT_PRELUDE}\n${litLoop}`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        #if defined( RE_IndirectDiffuse )
          iblIrradiance *= ${SKY_DIFFUSE.toFixed(3)} * s2Sky(vS2World);
        #endif`);
  };
  /* Materials that take no light (unlit, or three's line and point
   * materials) have no light loop to put the sun in, and are left as
   * they are. */
  const LIT_TYPES = new Set(['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial', 'MeshToonMaterial']);
  /* The sun at any point, for a shader that is not a lit material: its
   * GLSL and the uniforms it reads, the same objects every material
   * shares. */
  lit.sun = {
    glsl: SUN_GLSL,
    uniforms: {
      uS2Shadow: shared.uS2Shadow,
      uS2Field: shared.uS2Field,
      uS2CloudAt: shared.uS2CloudAt,
      uS2SunDir: shared.uS2SunDir,
      uS2LowAt: shared.uS2LowAt,
    },
  };
  lit.setShadow = (texture) => {
    shared.uS2Shadow.value = texture;
  };
  /* Where the clouds have drifted to, `seconds` after the valley was
   * first drawn. */
  lit.setClock = (seconds) => {
    shared.uS2CloudAt.value.copy(CLOUD_START).addScaledVector(CLOUD_WIND, -seconds);
  };
  const bake = cloudBake(shared);
  /* The clouds' shadow for this frame's clock, into the map every lit
   * material reads: once a frame, before the frame is drawn. */
  lit.update = (renderer) => bake.render(renderer);
  lit.dispose = () => bake.dispose();
  return lit;
  function lit(mat) {
    if (!mat || mat.userData.s2Lit || !LIT_TYPES.has(mat.type)) {
      return mat;
    }
    const prev = mat.onBeforeCompile;
    /* The key the material had before, taken now: three's default key is
     * the source of onBeforeCompile, which is about to be this wrapper
     * for every material, so read later it would name them all alike. */
    const prevKey = mat.customProgramCacheKey();
    mat.onBeforeCompile = function onBeforeCompile(shader, renderer) {
      prev.call(this, shader, renderer);
      inject(shader);
    };
    mat.customProgramCacheKey = () => `s2lit|${prevKey}`;
    mat.userData.s2Lit = true;
    mat.needsUpdate = true;
    return mat;
  }
}

/*
 * The sun: one light, or on High two that split it, each with its shadow
 * map. update(focus, camera) keeps the near map round the focus and the
 * far one on the ground ahead of the camera, both snapped to their texel
 * in the light's own frame so a moving camera does not make the edges
 * crawl.
 */
export function makeSun(scene, q, dir) {
  const intensity = SUN_IRRADIANCE;
  const lights = [];
  const add = (half, size, depth, bias, normalBias) => {
    const light = new THREE.DirectionalLight(SUN_COLOR, intensity);
    light.castShadow = q.shadows;
    light.shadow.mapSize.set(size, size);
    light.shadow.camera.near = 1;
    light.shadow.camera.far = depth;
    light.shadow.camera.left = -half;
    light.shadow.camera.right = half;
    light.shadow.camera.top = half;
    light.shadow.camera.bottom = -half;
    light.shadow.bias = bias;
    light.shadow.normalBias = normalBias;
    light.userData.half = half;
    light.userData.texel = (2 * half) / size;
    light.userData.depth = depth;
    scene.add(light);
    scene.add(light.target);
    lights.push(light);
    return light;
  };
  const nearSize = q.field.shadowMap || 2048;
  add(q.field.shadowHalf || 72, nearSize, 900, -0.0006, 0.04);
  if (q.shadows && q.id === 'high') {
    add(700, 2048, 4000, -0.0004, 0.6);
  }
  /* The light's own frame, for snapping. */
  const zAxis = dir.clone().normalize();
  const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
  const yAxis = zAxis.clone().cross(xAxis);
  const centre = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const snap = (v, texel, out) => {
    const a = Math.round(v.dot(xAxis) / texel) * texel;
    const b = Math.round(v.dot(yAxis) / texel) * texel;
    const c = v.dot(zAxis);
    return out.copy(xAxis).multiplyScalar(a).addScaledVector(yAxis, b).addScaledVector(zAxis, c);
  };
  function update(focus, camera) {
    lights.forEach((light, k) => {
      centre.copy(focus);
      if (k === 1 && camera) {
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        if (fwd.lengthSq() > 1e-6) {
          fwd.normalize();
          centre.addScaledVector(fwd, light.userData.half * 0.75);
        }
      }
      snap(centre, light.userData.texel, centre);
      light.target.position.copy(centre);
      light.position.copy(centre).addScaledVector(zAxis, light.userData.depth * 0.5);
      light.target.updateMatrixWorld();
      light.updateMatrixWorld();
    });
  }
  return { lights, update };
}
