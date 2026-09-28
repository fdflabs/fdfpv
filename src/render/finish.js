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
 * A film region (the Kadet) painted in any finish stops letting the sun
 * through: its film glow (filmmat.js) goes to 0 and comes back with the
 * kit's finish.
 *
 * swiss2 draws the craft physically based (src/maps/swiss2/craftlook.js)
 * and reads the finish from mat.userData.paintFinish for its twin.
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
};

const FINISH_CHUNK = /* glsl */ `
  {
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
    vec3 finTint = mix(vec3(1.0), pow(diffuse, vec3(0.4545)), uFinTint);
    float finSpec = max(dot(finR, normalize(uFinSpecDir)), 0.0);
    finSpec = step(0.985 - uFinWidth, finSpec) * uFinSpec;
    gl_FragColor.rgb = gl_FragColor.rgb * uFinDiffuse + (finEnv * uFinEnv * finLight + finSpec) * finTint;
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
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
         uniform float uFinDiffuse;
         uniform float uFinEnv;
         uniform float uFinTint;
         uniform float uFinSpec;
         uniform float uFinWidth;
         uniform vec3 uFinSpecDir;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${FINISH_CHUNK}`);
    if (!shader.fragmentShader.includes('finEnv')) {
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
}

/*
 * Dress a craft's regions in their finishes: `finishes` region id to a
 * finish id, a region left out (or on `film`) in the kit's. The regions'
 * materials are the livery's own (craft.livery.materials()); a craft
 * without them has no finishes to wear.
 */
export function dressFinish(craft, finishes = {}) {
  if (!craft.livery || !craft.livery.materials) {
    return;
  }
  for (const [id, mats] of Object.entries(craft.livery.materials())) {
    const want = finishes[id] && finishes[id] !== 'film' ? finishes[id] : 'kit';
    for (const mat of mats) {
      let state = mat.userData.finishState;
      if (!state) {
        if (want === 'kit') {
          continue;
        }
        state = wrap(mat);
        mat.userData.finishState = state;
      }
      apply(state, want);
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
