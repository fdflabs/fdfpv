/*
 * finish.js: a region's finish (configs/paint.js) on the cel materials its
 * builder made: gloss, matte, metallic, chrome, or a film region made an
 * opaque paint.
 *
 * A LAYER ON TOP, NOT A NEW MATERIAL. The builders' materials are
 * celMaterial (src/render/celmat.js), and the Kadet's films filmMaterial
 * (src/render/filmmat.js) over it. A finish wraps that material's own
 * onBeforeCompile with one more chunk, landed before the cel rim and
 * highlight, and takes over the two uniforms that decide the painted look,
 * the rim's strength and the hard highlight's, with objects of its own.
 * Every number a finish sets is one of those uniforms, so going from gloss
 * to chrome and back is a uniform write: nothing recompiles after the
 * first finish a material wears.
 *
 * STOCK IS EXACT. A material whose region has never worn a finish is not
 * touched at all, so the default look is the builder's own program. One
 * that has worn a finish and goes back to the kit's keeps the wrapper at
 * the identity, the diffuse times 1, the reflection times 0, the rim and
 * the highlight at the builder's own values: the same pixels.
 *
 * THE REFLECTION is a cel one, not an environment map: a studio sky over
 * a bright horizon line and a dark ground, looked up by the reflected
 * view direction in world space, in bands so it reads as drawn chrome. It
 * is scaled by the directional light the map has, so a chrome wing is not
 * a lamp at dusk. Metallic is the same reflection, weaker and tinted by
 * the paint, over a darkened base; gloss a tight white highlight and a
 * brighter rim; matte no highlight and half the rim.
 *
 * CARBON AND BARE ALUMINIUM are not a colour over the region's but a
 * material of their own: the lit colour divided by the paint's gives the
 * light the surface had, and that light falls on carbon's twill (a 2x2
 * weave of 3 mm tows on the face the part's normal is nearest to, the
 * same weave src/maps/swiss2/craftlook.js draws) or on aluminium brushed
 * along the span.
 *
 * WEAR (configs/paint.js) is the whole aircraft's, on every region's
 * material whatever its finish: scratches through the paint showing the
 * bare skin, aluminium tape over the worst of them from a third of the
 * way to battle worn, and the paint dulled in patches. Every mark is a
 * hash of the model's own coordinates, so a pilot, a peer in a room and
 * a replay all see the same scratch in the same place.
 *
 * A film region (the Kadet) painted in any finish stops letting the sun
 * through: its film glow (filmmat.js) goes to 0 and comes back with the
 * kit's finish.
 *
 * swiss2 draws the craft physically based (src/maps/swiss2/craftlook.js)
 * and reads the finish from mat.userData.paintFinish for its twin.
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
 * The finishes as uniform values. diffuse scales the lit colour; env the
 * reflection, tint how much of it takes the paint's colour; spec and width
 * a highlight of the finish's own (tinted the same way), rim a multiple of
 * the builder's rim, cel the builder's own highlight kept (1) or dropped.
 */
const FINISH = {
  kit: { diffuse: 1, env: 0, tint: 0, spec: 0, width: 0.01, rim: 1, cel: 1 },
  gloss: { diffuse: 1, env: 0.1, tint: 0.5, spec: 0.7, width: 0.012, rim: 1.35, cel: 0 },
  matte: { diffuse: 0.94, env: 0, tint: 0, spec: 0, width: 0.01, rim: 0.45, cel: 0 },
  metallic: { diffuse: 0.62, env: 0.55, tint: 0.85, spec: 0.9, width: 0.05, rim: 1.2, cel: 0 },
  chrome: { diffuse: 0.1, env: 1.05, tint: 0.12, spec: 1.3, width: 0.008, rim: 0.5, cel: 0 },
  carbon: { diffuse: 1, env: 0.05, tint: 0, spec: 0.55, width: 0.008, rim: 0.5, cel: 0, carbon: 1 },
  aluminium: { diffuse: 1, env: 0.14, tint: 0.1, spec: 0.8, width: 0.03, rim: 0.8, cel: 0, alu: 1 },
  /* The shop's (configs/paint.js SHOP_FINISHES). Satin: a soft wide sheen,
   * between matte and gloss. Pearl: a white reflection over the paint
   * and a bright rim, so the colour shifts to pale at the edges. Candy: a
   * darkened coat under a reflection wholly the paint's colour, a deep
   * tinted lacquer. Gold, earned: the region gold whatever its paint,
   * metallic over it, like aluminium a material of its own. */
  satin: { diffuse: 0.97, env: 0.04, tint: 0.3, spec: 0.35, width: 0.05, rim: 0.85, cel: 0 },
  pearl: { diffuse: 0.86, env: 0.3, tint: 0.15, spec: 0.8, width: 0.03, rim: 1.8, cel: 0 },
  candy: { diffuse: 0.55, env: 0.7, tint: 1, spec: 1.1, width: 0.01, rim: 1.3, cel: 0 },
  gold: { diffuse: 0.5, env: 0.85, tint: 0, spec: 1.2, width: 0.02, rim: 0.8, cel: 0, gold: 1 },
  /* Flake: gloss over a metallic base with flakes in the coat that each
   * catch the light at their own angle (finFlake). Brushed: metal in the
   * paint's colour, brushed along the span, whose highlight is a streak
   * across the brushing (finAniso) instead of the round one. Cost, a P-51
   * filling the screen on the 3060 Ti (npm run materials:perf, GPU 0 not
   * quite idle, 2026-10-07): at most 0.08 ms a frame over gloss, any preset. */
  flake: { diffuse: 0.78, env: 0.22, tint: 0.6, spec: 0.75, width: 0.01, rim: 1.25, cel: 0, flake: 1 },
  brushed: { diffuse: 0.6, env: 0.4, tint: 0.9, spec: 0, width: 0.01, rim: 0.9, cel: 0, brush: 1 },
};

/* The model's own coordinates and normal, for the weave and the wear. */
const FINISH_VARYINGS = /* glsl */ `
  varying vec3 vFinP;
  varying vec3 vFinN;
  varying vec3 vFinCN;
  varying vec3 vFinT;
  varying vec3 vFinCP;
`;

const FINISH_VERTEX = /* glsl */ `
  vFinP = vec3(transformed);
  vFinN = vec3(objectNormal);
  vFinCN = mat3(uFinCraft) * (mat3(modelMatrix) * objectNormal);
  vFinCP = (uFinCraft * modelMatrix * vec4(transformed, 1.0)).xyz;
  vFinT = mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0);
`;

const FINISH_HELPERS = /* glsl */ `
  float finHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float finNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(finHash(i), finHash(i + vec3(1, 0, 0)), f.x), mix(finHash(i + vec3(0, 1, 0)), finHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(finHash(i + vec3(0, 0, 1)), finHash(i + vec3(1, 0, 1)), f.x), mix(finHash(i + vec3(0, 1, 1)), finHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  /* 1 where a pattern takes its second colour: 1 checks, 2 stripes,
   * 3 camouflage blobs, 4 splinter. p in the aircraft's frame, metres. */
  float finPattern(vec3 p, float kind) {
    if (kind < 1.5) {
      return mod(floor(p.x / 0.08) + floor(p.z / 0.08), 2.0);
    }
    if (kind < 2.5) {
      return step(0.5, fract((p.x + p.z) / 0.12));
    }
    if (kind < 3.5) {
      return step(0.52, finNoise(p * 7.0) * 0.65 + finNoise(p * 17.0) * 0.35);
    }
    vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p.xz;
    return step(0.5, finHash(vec3(floor(q.x / 0.11), floor(q.y / 0.07 + floor(q.x / 0.11) * 0.37), 2.0)));
  }
  /* The two coordinates of the face the normal is nearest to, metres. */
  vec2 finFace() {
    vec3 an = abs(vFinN);
    return an.x > an.y && an.x > an.z ? vFinP.yz : (an.y > an.z ? vFinP.xz : vFinP.xy);
  }
  /* Carbon's twill: 1 on the crown of a tow, 0 in the gap, 0.5 once the
   * tows would be finer than a pixel. */
  float finTwill() {
    vec2 q = finFace() / 0.003;
    vec2 c = floor(q);
    vec2 f = fract(q);
    float warp = step(2.0, mod(c.x + c.y, 4.0));
    float tow = mix(sin(f.x * PI), sin(f.y * PI), warp);
    float fade = 1.0 - smoothstep(0.35, 0.9, max(fwidth(q.x), fwidth(q.y)));
    return mix(0.5, tow, fade);
  }
  /* Metal flakes, 1 mm cells of the model's own space (coarser than a
   * full size car's, so they read on a model a metre and a half across),
   * each tilted by a hash so only some face the highlight from a given
   * eye: 1 on a flake that catches the light. Fades to the even share of
   * flakes that would catch it once cells are well under a pixel, so far
   * off it is a sheen, not crawling noise. */
  float finFlake(vec3 n, vec3 v, vec3 l) {
    vec3 q = vFinP / 0.001;
    vec3 c = floor(q);
    vec3 tilt = vec3(finHash(c), finHash(c + 17.0), finHash(c + 31.0)) - 0.5;
    vec3 fn = normalize(n + 1.1 * tilt);
    float hit = step(0.95, max(dot(reflect(-v, fn), l), 0.0));
    float fade = 1.0 - smoothstep(1.5, 4.0, max(fwidth(q.x), max(fwidth(q.y), fwidth(q.z))));
    return mix(0.08, hit, fade);
  }
  /* A brushed highlight: bright where the half vector is square to the
   * brushing, so it spreads across the grooves into a streak. */
  float finAniso(vec3 n, vec3 v, vec3 l) {
    vec3 t = normalize(vFinT - n * dot(vFinT, n));
    vec3 h = normalize(l + v);
    float th = dot(t, h);
    return pow(max(1.0 - th * th, 0.0), 120.0) * smoothstep(0.0, 0.25, dot(n, h)) * smoothstep(0.0, 0.2, dot(n, l));
  }
  /* Scratches: three sets of long thin streaks at their own angles, where
   * a coarse field says this patch took knocks. More wear, more of both. */
  float finScratch(vec2 q, float w) {
    float m = 0.0;
    for (int i = 0; i < 3; i++) {
      float a = float(i) * 2.1 + 0.4;
      vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
      float line = finNoise(vec3(r.x * 5.0, r.y * 140.0, float(i) * 7.0));
      float knocks = finNoise(vec3(q * 4.0, float(i) * 3.0 + 11.0));
      m = max(m, smoothstep(0.93 - 0.05 * w, 0.965 - 0.04 * w, line) * smoothstep(1.0 - 0.7 * w, 1.06 - 0.7 * w, knocks));
    }
    return m;
  }
  /* Aluminium tape: one strip in some of the 14 cm cells, never below a
   * third of the way to battle worn. */
  float finTape(vec2 q, float w) {
    vec2 cell = floor(q / 0.14);
    vec2 f = fract(q / 0.14) - 0.5;
    float h = finHash(vec3(cell, 3.7));
    if (h > (w - 0.33) * 0.5) {
      return 0.0;
    }
    vec2 halfSize = vec2(0.18 + 0.2 * finHash(vec3(cell, 5.1)), 0.08 + 0.1 * finHash(vec3(cell, 8.3)));
    vec2 off = (vec2(finHash(vec3(cell, 1.3)), finHash(vec3(cell, 2.9))) - 0.5) * 0.4;
    vec2 d = abs(f - off) - halfSize;
    return 1.0 - smoothstep(0.0, 0.01, max(d.x, d.y));
  }
`;

const FINISH_CHUNK = /* glsl */ `
  {
    /* The light the surface had: the lit colour over the paint's. */
    vec3 finShade = gl_FragColor.rgb / max(diffuse, vec3(0.04));
    vec3 finBase = gl_FragColor.rgb;
    vec3 finPaint = diffuse;
    /* The underside: a face looking down in the aircraft's own frame
     * takes the region's under colour, a hard line as a painter's mask
     * leaves, a little under the side so a fuselage's flank stays top. */
    if (uFinUnder > 0.5 && normalize(vFinCN).y < -0.1) {
      finPaint = uFinUnderCol;
      finBase = finShade * finPaint;
    }
    /* A PATTERN in the region's second colour, laid out in the aircraft's
     * own metres (PATTERNS in configs/paint.js), so it runs on across the
     * region's parts and every machine draws it alike. */
    if (uFinPat > 0.5 && finPattern(vFinCP, uFinPat) > 0.5) {
      finPaint = uFinPatCol;
      finBase = finShade * finPaint;
    }
    if (uFinCarbon > 0.5) {
      finBase = finShade * vec3(0.05, 0.052, 0.058) * (0.55 + 0.9 * finTwill());
    } else if (uFinGold > 0.5) {
      finBase = finShade * vec3(0.62, 0.45, 0.14);
    } else if (uFinBrush > 0.5) {
      float brushed = finNoise(vec3(vFinP.x * 3.0, vFinP.y * 400.0, vFinP.z * 400.0));
      finBase = finShade * finPaint * (0.86 + 0.24 * brushed);
    } else if (uFinAlu > 0.5) {
      float brush = finNoise(vec3(vFinP.x * 3.0, vFinP.y * 400.0, vFinP.z * 400.0));
      finBase = finShade * vec3(0.44, 0.46, 0.49) * (0.88 + 0.2 * brush);
    }
    if (uFinWear > 0.001) {
      vec2 finQ = finFace();
      float dull = finNoise(vFinP * 9.0);
      finBase *= 1.0 - 0.22 * uFinWear * smoothstep(0.35, 0.8, dull);
      finBase = mix(finBase, finShade * vec3(0.72, 0.73, 0.74), 0.85 * finScratch(finQ, uFinWear));
      float crinkle = finNoise(vFinP * 260.0);
      finBase = mix(finBase, finShade * vec3(0.62, 0.64, 0.66) * (0.85 + 0.3 * crinkle), finTape(finQ, uFinWear));
    }
    vec3 finV = normalize(vViewPosition);
    vec3 finR = reflect(-finV, normal);
    vec3 finW = normalize((vec4(finR, 0.0) * viewMatrix).xyz);
    float finY = finW.y;
    /* A studio as much as a sky, so chrome reads in the dark hangar and
     * under any map's sky, and reads as chrome and not grey paint: the
     * contrast is the point. A glowing horizon, a pale lower sky, a hard
     * step to a dark dome with four soft boxes in it, and under the
     * horizon a black line over a warm floor, stepped like the cel ramp
     * with edges a little soft so they do not crawl. */
    float finAz = atan(finW.z, finW.x);
    vec3 finSky = mix(vec3(1.2, 1.16, 1.06), vec3(0.8, 0.86, 0.95), smoothstep(0.06, 0.14, finY));
    finSky = mix(finSky, vec3(0.24, 0.29, 0.39), smoothstep(0.4, 0.44, finY));
    finSky = mix(finSky, vec3(0.14, 0.17, 0.24), smoothstep(0.82, 0.86, finY));
    float finBox = smoothstep(0.5, 0.53, finY) * (1.0 - smoothstep(0.68, 0.71, finY))
      * smoothstep(0.3, 0.4, abs(sin(finAz * 2.0 + 0.6)));
    finSky = mix(finSky, vec3(1.4, 1.38, 1.3), finBox);
    vec3 finGround = mix(vec3(0.04, 0.04, 0.045), vec3(0.26, 0.21, 0.16), smoothstep(-0.1, -0.16, finY));
    vec3 finEnv = mix(finGround, finSky, smoothstep(-0.01, 0.01, finY));
    float finLight = 0.0;
    #if NUM_DIR_LIGHTS > 0
    for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
      finLight += dot(directionalLights[i].color, vec3(0.2126, 0.7152, 0.0722));
    }
    #endif
    finLight = clamp(finLight * 0.6, 0.35, 1.2);
    vec3 finTint = mix(vec3(1.0), pow(finPaint, vec3(0.4545)), uFinTint) * mix(vec3(1.0), vec3(1.0, 0.8, 0.42), uFinGold);
    float finSpec = max(dot(finR, normalize(uFinSpecDir)), 0.0);
    finSpec = step(0.985 - uFinWidth, finSpec) * uFinSpec;
    vec3 finL = normalize(uFinSpecDir);
    if (uFinFlake > 0.5) {
      finSpec += 1.6 * finFlake(normal, finV, finL) * finLight;
    }
    if (uFinBrush > 0.5) {
      finSpec += 0.8 * finAniso(normal, finV, finL) * finLight;
    }
    gl_FragColor.rgb = finBase * uFinDiffuse + (finEnv * uFinEnv * finLight + finSpec) * finTint;
  }
`;

/* A material's finish uniforms, made once and kept: the wrapper puts these
 * very objects into every compile of it, so a later write reaches the
 * program without a recompile. */
function wrap(mat) {
  const u = {
    uFinDiffuse: { value: 1 },
    uFinEnv: { value: 0 },
    uFinTint: { value: 0 },
    uFinSpec: { value: 0 },
    uFinWidth: { value: 0.01 },
    uFinSpecDir: { value: null },
    uSpecStrength: { value: 0 },
    uRimStrength: { value: 0 },
    uFinCarbon: { value: 0 },
    uFinAlu: { value: 0 },
    uFinGold: { value: 0 },
    uFinFlake: { value: 0 },
    uFinBrush: { value: 0 },
    uFinWear: { value: 0 },
    uFinUnder: { value: 0 },
    uFinUnderCol: { value: new THREE.Color() },
    uFinCraft: { value: new THREE.Matrix4() },
    uFinPat: { value: 0 },
    uFinPatCol: { value: new THREE.Color() },
  };
  const state = { u, rim: null, spec: null, finish: 'kit' };
  const base = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    base.call(mat, shader, renderer);
    if (!shader.uniforms.uRimStrength || !shader.uniforms.uSpecStrength) {
      throw new Error('finish: the material is not a cel one, it has no rim or highlight to take over');
    }
    if (state.rim === null) {
      state.rim = shader.uniforms.uRimStrength.value;
      state.spec = shader.uniforms.uSpecStrength.value;
      u.uFinSpecDir.value = shader.uniforms.uSpecDir.value;
      apply(state, state.finish);
    }
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FINISH_VARYINGS}\nuniform mat4 uFinCraft;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FINISH_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
         ${FINISH_VARYINGS}
         uniform float uFinDiffuse;
         uniform float uFinEnv;
         uniform float uFinTint;
         uniform float uFinSpec;
         uniform float uFinWidth;
         uniform vec3 uFinSpecDir;
         uniform float uFinCarbon;
         uniform float uFinAlu;
         uniform float uFinGold;
         uniform float uFinFlake;
         uniform float uFinBrush;
         uniform float uFinWear;
         uniform float uFinUnder;
         uniform vec3 uFinUnderCol;
         uniform float uFinPat;
         uniform vec3 uFinPatCol;
         ${FINISH_HELPERS}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        /* Paint, so not in a thermal frame, whose temperature the output
         * above has already written (src/render/thermal.js). */
        #ifdef TH_PARS
        if (thEnv.x < 0.5)
        #endif
        ${FINISH_CHUNK}`);
    if (!shader.fragmentShader.includes('finEnv') || !shader.vertexShader.includes(FINISH_VERTEX)) {
      throw new Error('finish: the lit shader changed and the finish chunk did not land');
    }
  };
  mat.customProgramCacheKey = () => `${baseKey()}|finish`;
  mat.needsUpdate = true;
  return state;
}

/* The uniform values for a finish; before the first compile the builder's
 * rim and highlight are not known yet, and wrap() applies them then. */
function apply(state, finish) {
  state.finish = finish;
  if (state.rim === null) {
    return;
  }
  const f = FINISH[finish] ?? FINISH.kit;
  const u = state.u;
  u.uFinDiffuse.value = f.diffuse;
  u.uFinEnv.value = f.env;
  u.uFinTint.value = f.tint;
  u.uFinSpec.value = f.spec;
  u.uFinWidth.value = f.width;
  u.uRimStrength.value = state.rim * f.rim;
  u.uSpecStrength.value = state.spec * f.cel;
  u.uFinCarbon.value = f.carbon ?? 0;
  u.uFinAlu.value = f.alu ?? 0;
  u.uFinGold.value = f.gold ?? 0;
  u.uFinFlake.value = f.flake ?? 0;
  u.uFinBrush.value = f.brush ?? 0;
}

/*
 * Dress a craft's regions in their finishes: `finishes` region id to a
 * finish id, a region left out (or on `film`) in the kit's, and every
 * region in `wear`, 0 to 1. `paint` is the paint over the colours:
 * `under`, region id to the 0xRRGGBB its underside wears, and
 * `patterns`, region id to { p, c }, a pattern number (1 up, PATTERNS in
 * configs/paint.js) and its second colour; a region left out of either
 * has none. Null leaves both as they are, for the combat aircraft's
 * loadout paint (src/render/combatpaint.js), which redresses finishes
 * and does not own them. The regions' materials are the livery's own (craft.livery.materials()); a craft
 * without them has no finishes to wear.
 */
export function dressFinish(craft, finishes = {}, wear = 0, paint = null) {
  if (!craft.livery || !craft.livery.materials) {
    return;
  }
  const shades = craft.livery.shades ? craft.livery.shades() : {};
  let hooked = false;
  for (const [id, mats] of Object.entries(craft.livery.materials())) {
    const want = finishes[id] && finishes[id] !== 'film' ? finishes[id] : 'kit';
    const below = paint ? paint.under[id] : undefined;
    const pattern = paint ? paint.patterns[id] : undefined;
    for (const mat of mats) {
      let state = mat.userData.finishState;
      if (!state) {
        if (want === 'kit' && !wear && below === undefined && pattern === undefined) {
          continue;
        }
        state = wrap(mat);
        mat.userData.finishState = state;
      }
      apply(state, want);
      state.u.uFinWear.value = wear;
      const k = ((shades[id] || []).find((p) => p.mat === mat) || { k: 1 }).k;
      if (paint) {
        state.u.uFinUnder.value = below === undefined ? 0 : 1;
        state.u.uFinPat.value = pattern === undefined ? 0 : pattern.p;
      }
      if (below !== undefined) {
        state.u.uFinUnderCol.value.setHex(below).multiplyScalar(k);
        hooked = true;
      }
      if (pattern !== undefined) {
        state.u.uFinPatCol.value.setHex(pattern.c).multiplyScalar(k);
        hooked = true;
      }
      mat.userData.paintFinish = want === 'kit' ? null : want;
      /* A film painted over is opaque paint: no sun through it. */
      if (mat.userData.film) {
        if (state.glow === undefined) {
          state.glow = mat.userData.film.value;
        }
        mat.userData.film.value = want === 'kit' ? state.glow : 0;
      }
    }
  }
  if (hooked) {
    hookCraftFrame(craft);
  }
}

/*
 * The aircraft's own frame: its meshes hand their material the craft's
 * world matrix, inverted, just before each draws, so a normal turned into
 * it says which faces look down and a point in it lays a pattern out,
 * whatever the aircraft's attitude and place (FINISH_VERTEX). Once a
 * craft, on every mesh, and only written while an underside or a pattern
 * is on.
 */
function hookCraftFrame(craft) {
  if (craft.group.userData.finishHooked) {
    return;
  }
  craft.group.userData.finishHooked = true;
  craft.group.traverse((o) => {
    if (!o.isMesh) {
      return;
    }
    const before = o.onBeforeRender;
    o.onBeforeRender = function onBeforeRender(renderer, scene, camera, geometry, material, group) {
      before.call(this, renderer, scene, camera, geometry, material, group);
      const state = material && material.userData.finishState;
      if (state && (state.u.uFinUnder.value > 0.5 || state.u.uFinPat.value > 0.5)) {
        state.u.uFinCraft.value.copy(craft.group.matrixWorld).invert();
      }
    };
  });
}

/* The wear a craft's paint shows now, 0 to 1, for a check. */
export function readWear(craft) {
  if (!craft.livery || !craft.livery.materials) {
    return 0;
  }
  for (const mats of Object.values(craft.livery.materials())) {
    const s = mats[0] && mats[0].userData.finishState;
    if (s) {
      return s.u.uFinWear.value;
    }
  }
  return 0;
}

/* The finish uniforms each region's first material holds now, for a
 * check: whether its program has the finish in it yet (`compiled`), and
 * the carbon, aluminium, gold, wear, underside colour and pattern it draws. */
export function readFinishUniforms(craft) {
  if (!craft.livery || !craft.livery.materials) {
    return {};
  }
  const out = {};
  for (const [id, mats] of Object.entries(craft.livery.materials())) {
    const s = mats[0] && mats[0].userData.finishState;
    out[id] = s ? {
      compiled: s.rim !== null, carbon: s.u.uFinCarbon.value, alu: s.u.uFinAlu.value, gold: s.u.uFinGold.value, flake: s.u.uFinFlake.value, brush: s.u.uFinBrush.value, wear: s.u.uFinWear.value,
      under: s.u.uFinUnder.value > 0.5 ? `#${s.u.uFinUnderCol.value.getHex().toString(16).padStart(6, '0')}` : null,
      pattern: s.u.uFinPat.value > 0.5 ? { p: s.u.uFinPat.value, c: `#${s.u.uFinPatCol.value.getHex().toString(16).padStart(6, '0')}` } : null,
    } : null;
  }
  return out;
}

/* What finish each region's materials wear now, for a check. */
export function readFinish(craft) {
  if (!craft.livery || !craft.livery.materials) {
    return {};
  }
  const out = {};
  for (const [id, mats] of Object.entries(craft.livery.materials())) {
    out[id] = mats[0] && mats[0].userData.paintFinish ? mats[0].userData.paintFinish : 'kit';
  }
  return out;
}
