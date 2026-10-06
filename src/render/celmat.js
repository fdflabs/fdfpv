/*
 * celmat.js: the cel shaded material the worlds and aircraft are drawn in.
 *
 * What makes cel shading look painted rather than flat is that light and
 * shadow differ in hue, not only in value: lit faces go warm and shadowed
 * ones lean to the blue of the sky lighting them. three's
 * MeshToonMaterial looks its light up in a gradient map by N dot L and
 * multiplies it into the colour, so a ramp running from cool to warm gives
 * that split while keeping three's shadows, fog and lights. The compile
 * hook below adds what the toon material lacks: a rim of sky coloured
 * light that lifts silhouettes off the background, a hard painted
 * highlight, drifting cloud shadows and waving cloth.
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

/*
 * three samples a toon gradient map's red channel only and spreads it to
 * grey, which would throw the ramp's hues away and leave every shadow a
 * grey copy of the lit colour. The chunk is patched once, here, to sample
 * the ramp in colour. If a three upgrade rewords that line the patch would
 * silently miss, so a miss stops the module loading.
 */
const GREY_SAMPLE = 'vec3( texture2D( gradientMap, coord ).r )';
const COLOUR_SAMPLE = 'texture2D( gradientMap, coord ).rgb';
if (!THREE.ShaderChunk.gradientmap_pars_fragment.includes(GREY_SAMPLE)) {
  throw new Error(
    'celmat: could not patch gradientmap_pars_fragment for RGB toon ramps. ' +
      'Three.js changed the chunk; the cel shading would silently render grey.',
  );
}
THREE.ShaderChunk.gradientmap_pars_fragment = THREE.ShaderChunk.gradientmap_pars_fragment.replace(GREY_SAMPLE, COLOUR_SAMPLE);

/*
 * The ramp: four bands over N dot L, unevenly spaced so most of a curved
 * surface reads as one flat lit shape with a crisp edge (a wide lit band,
 * a narrow warm terminator where light wraps, two cool shadow bands), each
 * band edge softened by the linear filter over one texel.
 */
const RAMP_WIDTH = 64;
const RAMP_BANDS = [
  { from: 0, rgb: [0.30, 0.38, 0.62] },
  { from: 0.36, rgb: [0.42, 0.51, 0.72] },
  { from: 0.46, rgb: [0.94, 0.80, 0.62] },
  { from: 0.53, rgb: [1.00, 0.97, 0.88] },
];

function makeRamp() {
  const texels = new Uint8Array(RAMP_WIDTH * 4);
  for (let i = 0; i < RAMP_WIDTH; i += 1) {
    const t = i / (RAMP_WIDTH - 1);
    const band = RAMP_BANDS.reduce((found, b, n) => (n > 0 && t > b.from ? b : found), RAMP_BANDS[0]);
    texels.set([...band.rgb.map((c) => Math.round(c * 255)), 255], i * 4);
  }
  const texture = new THREE.DataTexture(texels, RAMP_WIDTH, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/* The one ramp every cel material shares, the session's craft included,
 * which is why a map's dispose keeps it (session-textures.js). */
let ramp = null;
export function celRampTexture() {
  ramp ??= makeRamp();
  return ramp;
}

/*
 * Rim and highlight, appended to the lit colour.
 *
 * The rim falls off with the cube of a smoothstep rather than stepping:
 * a stepped rim is only a few pixels wide and lands as a flat slab hugging
 * the ink line (measured once as a five pixel plateau), where a falloff
 * reads as light wrapping round the form. Its strength follows the
 * surface's own luminance, between 0.3 and 1, so it stays subordinate on a
 * dark craft instead of being the brightest thing in frame. The highlight
 * is a hard step of the reflected view against a fixed light direction.
 */
const RIM_AND_SPECULAR = /* glsl */ `
  vec3 inkNormal = normalize(vNormal);
  vec3 inkView = normalize(vViewPosition);
  float inkEdge = smoothstep(uRimStart, 1.0, 1.0 - max(dot(inkNormal, inkView), 0.0));
  inkEdge = inkEdge * inkEdge * inkEdge;
  float inkLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float inkScale = mix(0.30, 1.0, clamp(inkLuma * 1.7, 0.0, 1.0));
  gl_FragColor.rgb += uRimColor * (inkEdge * uRimStrength * inkScale);
  float inkGlint = max(dot(reflect(-inkView, inkNormal), normalize(uSpecDir)), 0.0);
  gl_FragColor.rgb += uSpecColor * step(0.985 - uSpecWidth, inkGlint) * uSpecStrength;
`;

/*
 * Cloud shadows: soft shapes drifting over the ground, the strongest
 * single sign that a stylised world has a sky over it. Value noise of a
 * world position, three octaves, through a wide smoothstep (hard edged
 * cloud shadows read as texture). No texture to load; a few instructions.
 * celCloudShadow(world xz, seconds) is 0 in sun and 1 under cloud.
 */
export const CLOUD_SHADOW_GLSL = /* glsl */ `
  float celHash(vec2 cell) {
    vec2 q = fract(cell * vec2(233.34, 851.73));
    q += dot(q, q + 23.45);
    return fract(q.x * q.y);
  }
  float celNoise(vec2 at) {
    vec2 cell = floor(at);
    vec2 s = fract(at);
    s = s * s * (3.0 - 2.0 * s);
    float below = mix(celHash(cell), celHash(cell + vec2(1.0, 0.0)), s.x);
    float above = mix(celHash(cell + vec2(0.0, 1.0)), celHash(cell + vec2(1.0, 1.0)), s.x);
    return mix(below, above, s.y);
  }
  float celCloudShadow(vec2 world, float t) {
    vec2 drift = world * 0.0032 + vec2(t * 0.010, t * 0.006);
    float cover = celNoise(drift) * 0.6 + celNoise(drift * 2.3) * 0.3 + celNoise(drift * 4.7) * 0.1;
    return smoothstep(0.46, 0.66, cover);
  }
`;

/*
 * Cloth, in the vertex shader. Flags must move or they read as painted
 * boards, and moving dozens from script would keep them out of the
 * scenery merge; in the shader the geometry stays static, so every sail on
 * a field merges into one draw and still waves.
 *
 * aCloth (an attribute, since three only declares uv when a map needs it)
 * is x, distance from the pole (0 at the seam, 1 at the free edge), and y,
 * height up the sail. Travel grows with x squared, so the seam never
 * leaves its pole. The phase comes from the vertex's world position, so
 * neighbouring flags are out of step without a per flag uniform, and the
 * free edge lifts a little as it snaps, like light fabric.
 */
export const CLOTH_CHUNK = /* glsl */ `
  {
    vec3 windAt = (modelMatrix * vec4(transformed, 1.0)).xyz;
    float windPhase = uCelTime * 2.9 + windAt.x * 0.55 + windAt.z * 0.41;
    float windReach = aCloth.x * aCloth.x;
    float windWave = sin(windPhase + aCloth.y * 3.4) * 0.62 + sin(windPhase * 1.73 + aCloth.x * 5.1) * 0.38;
    transformed += normalize(normal) * (windWave * windReach * uCloth);
    transformed.y += windWave * windReach * uCloth * 0.22;
  }
`;

/* The sails' cloth amplitude; the next flag glow must wave by the same or
 * it hangs stiff in front of the cloth. */
export const FLAG_SAIL_CLOTH = 0.085;

/*
 * Every compiled cel material's clock uniform, keyed by material so a
 * recompile replaces its entry, and dropped when the material is
 * disposed: a growing list walked every frame across map changes was the
 * defect this replaced.
 */
const clocks = new Map();

/* The scene's clock into every cel material, once a frame. */
export function updateCelTime(t) {
  for (const clock of clocks.values()) {
    clock.value = t;
  }
}

/* How many materials updateCelTime walks; check 16 asserts a map round
 * trip does not grow it. */
export function celTimeCount() {
  return clocks.size;
}

/* An include in a shader, with lines after it. */
const after = (include, lines) => `#include <${include}>\n${lines}`;

/*
 * A cel material. opts: color, map (with key), alphaTest, transparent,
 * opacity, side, fog (off for the mountain rings, whose baked colours are
 * already the aerial perspective), rim (strength), rimStart, rimColor,
 * spec, specWidth, specColor, cloudShadow (0..1), cloth (amplitude), key.
 *
 * userData.celKey is the material's identity for the scenery merger:
 * equal options are interchangeable, so the options as JSON; a texture is
 * not JSON, so a material with a map must name itself with `key`, or two
 * logos would merge into one bucket and one would vanish.
 */
export function celMaterial(opts = {}) {
  if (opts.map && !opts.key) {
    throw new Error('celmat: a material with a map needs an explicit key');
  }
  const mat = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    gradientMap: celRampTexture(),
    map: opts.map ?? null,
    alphaTest: opts.alphaTest ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    fog: opts.fog ?? true,
  });
  const rimColor = new THREE.Color(opts.rimColor ?? 0x9ec8ff);
  const specColor = new THREE.Color(opts.specColor ?? 0xffffff);
  const cloth = opts.cloth ?? 0;
  /* What cloth adds to the vertex shader. Also the program cache key,
   * below, so the key cannot disagree with the source. */
  const clothAttribute = cloth > 0 ? 'attribute vec2 aCloth;' : '';
  const clothMotion = cloth > 0 ? CLOTH_CHUNK : '';

  /* Values the shader reads. uRimStrength, uSpecStrength and uSpecDir are
   * also taken over by finish.js, which wraps this hook. */
  const values = () => ({
    uCloth: cloth,
    uRimColor: rimColor,
    uRimStrength: opts.rim ?? 0.32,
    uRimStart: opts.rimStart ?? 0.55,
    uSpecColor: specColor,
    uSpecStrength: opts.spec ?? 0.0,
    uSpecWidth: opts.specWidth ?? 0.01,
    uSpecDir: new THREE.Vector3(0.45, 0.8, 0.4),
    uCloudShadow: opts.cloudShadow ?? 0,
    uCelTime: 0,
    uCloudTint: new THREE.Color(0x8397be),
  });

  mat.onBeforeCompile = (shader) => {
    for (const [name, value] of Object.entries(values())) {
      shader.uniforms[name] = { value };
    }
    if (!clocks.has(mat)) {
      mat.addEventListener('dispose', () => clocks.delete(mat));
    }
    clocks.set(mat, shader.uniforms.uCelTime);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', after('common', `
         varying vec3 vCelWorld;
         uniform float uCelTime;
         uniform float uCloth;
         ${clothAttribute}`))
      .replace('#include <begin_vertex>', after('begin_vertex', `
         ${clothMotion}
         vCelWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`));

    /* The additions go straight after the dithering include, as the last
     * word on the colour. Not in a thermal frame, whose temperature output
     * has already been written (src/render/thermal.js). */
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', after('common', `
         varying vec3 vCelWorld;
         uniform vec3 uRimColor;
         uniform float uRimStrength;
         uniform float uRimStart;
         uniform vec3 uSpecColor;
         uniform float uSpecStrength;
         uniform float uSpecWidth;
         uniform vec3 uSpecDir;
         uniform float uCloudShadow;
         uniform float uCelTime;
         uniform vec3 uCloudTint;
         ${CLOUD_SHADOW_GLSL}`))
      .replace('#include <dithering_fragment>', after('dithering_fragment', `
         #ifdef TH_PARS
         if (thEnv.x < 0.5)
         #endif
         {
${RIM_AND_SPECULAR}
           if (uCloudShadow > 0.0) {
             /* Darker and toward the sky's blue, so shade keeps the warm
              * and cool logic of the rest of the picture. */
             float shade = celCloudShadow(vCelWorld.xz, uCelTime) * uCloudShadow;
             gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * uCloudTint * 1.35, shade);
           }
         }`));
  };

  /*
   * three r160 keys a program by onBeforeCompile's source text, which is
   * the same for every cel material whatever the closure captured, so two
   * materials differing only in what the hook bakes into the shader would
   * share one linked program. Cloth is the only such difference (all else
   * is uniforms), and a field's flags once waved or not depending on build
   * order. The key is the injected cloth source itself, so it follows the
   * shader by construction; it does not split programs by colour.
   *
   * Known: the cloth moves in the colour pass only. The outline prepass
   * (post.js) and three's depth material have no cloth code, so ink and
   * shadow are drawn at rest, out by at most FLAG_SAIL_CLOTH.
   */
  mat.customProgramCacheKey = () => `cel${clothAttribute}${clothMotion}`;
  mat.userData.cel = true;
  mat.userData.celKey = opts.key ?? JSON.stringify(opts);
  return mat;
}

/*
 * A heavier ink line round a hero object, whatever is behind it: the same
 * geometry drawn back faces only, slightly larger, in the line colour,
 * added as a child. The post chain's screen space edges are the world's
 * line; this is the art directed one.
 */
export function outlineHull(mesh, thickness = 1.05, color = 0x141a24) {
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  material.userData.hullColor = color;
  const hull = new THREE.Mesh(mesh.geometry, material);
  hull.scale.multiplyScalar(thickness);
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
  return mesh;
}
