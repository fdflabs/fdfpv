/*
 * camplight.js: the light in the camp's clearing at Claro Viejo that the
 * sun and the sky alone do not give it, round 4 of docs/INTERIOR-LOOP.md:
 * the fill the shaded floor gets from the sunlit canopy round it, the
 * cooking fires' glow and the camp's few lamps (lanterns under the tarps,
 * a string of bulbs), which matter more as the sun goes down.
 *
 * THE FILL. Under a sun at 22 degrees the trees round a thirty metre
 * clearing shade most of its floor, which then sees only the sky (the
 * environment, blue) and the map's weak bounce: round 3 printed it at
 * sRGB (30, 19, 21) against the golden hour mock's (56, 46, 38). In the
 * mock the floor is lit by the far wall of sunlit crowns and trunks and
 * by the sunlit earth itself. That light is the clearing's own, so it is
 * added here as an irradiance masked to a disc round the camp's middle,
 * fading out a dozen metres under the canopy's edge, warm, in proportion
 * to the sun's irradiance (the crowns stay sunlit after the floor is
 * shaded, and the bounce dies with the sun).
 *
 * THE LAMPS AND FIRES are fake point lights: a fixed list of positions
 * and colours in uniforms, lit by distance and angle in the same chunk.
 * A real PointLight is not used on purpose, as src/render/explosion.js
 * says: one changes the light count of every lit material in the map,
 * recompiling them all, and adds a light to every fragment. They cast no
 * shadows; they sit under the tarps and by the fires, where the light
 * they throw is what a shadow would leave.
 *
 * BOTH GO TO THE INDIRECT DIFFUSE, never the direct: the thermal picture
 * reads reflectedLight.directDiffuse as the sun on a surface (thermal.js
 * thE), and a lamp or the canopy's bounce heats nothing it can see.
 *
 * WHICH MATERIALS. patch(material) chains a chunk onto a built in lit
 * material's onBeforeCompile (its own runs first) and its program key:
 * the terrain's ground (the clearing's floor and the forest floor at its
 * edge), and the camp's props, cloth, people and machines. The uniforms
 * are shared objects, so one write a frame reaches every program; past
 * the clearing the chunk is a distance test and nothing else.
 *
 * THE SOURCES THEMSELVES are one mesh of camera facing quads: a soft
 * halo round each lamp and fire, additive, with a hot core the thermal
 * picture sees (a lamp's glass or a flame fifty degrees over what is
 * behind it, the five over a fire's embers keeping it under 900 C),
 * the halo itself thin air to it. One draw call however many.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { thermalShader } from '../thermal.js';

/* The most lamps the chunk loops over; the list is padded with dark ones. */
export const LAMPS_MAX = 8;
/* The fill's colour: the sun's light off sunlit leaves, bark and
 * laterite, near neutral and a little green (the laterite it falls on is
 * red enough; a warm fill printed it redder than the mock's). Linear. */
const FILL_TINT = [0.9, 0.95, 0.78];
/* The fill's irradiance as a share of the sun's (tuned against the mock's
 * shaded floor at 16:40, PR body), and how much of it a face turned to
 * the ground still gets (the sunlit earth's own bounce). */
const FILL_SHARE = 0.08;
const FILL_DOWN = 0.55;

const VERT_PARS = /* glsl */ `
varying vec3 vCampW;
`;
const VERT = /* glsl */ `
{
  vec4 campW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    campW = instanceMatrix * campW;
  #endif
  vCampW = (modelMatrix * campW).xyz;
}
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vCampW;
uniform vec4 uCampAt;
uniform vec3 uCampFill;
uniform vec4 uLampAt[${LAMPS_MAX}];
uniform vec3 uLampCol[${LAMPS_MAX}];
`;
/* uCampAt: the clearing's middle (x, z), where the fill starts to fade
 * and where it is gone, m. A lamp: its place and its reach (m), its
 * colour times its strength (irradiance at a metre). */
const FRAG = /* glsl */ `
{
  float campD = length(vCampW.xz - uCampAt.xy);
  if (campD < uCampAt.w) {
    vec3 campN = inverseTransformDirection(normal, viewMatrix);
    float campMask = 1.0 - smoothstep(uCampAt.z, uCampAt.w, campD);
    vec3 campIrr = uCampFill * campMask * mix(${FILL_DOWN.toFixed(2)}, 1.0, campN.y * 0.5 + 0.5);
    for (int i = 0; i < ${LAMPS_MAX}; i++) {
      vec3 toLamp = uLampAt[i].xyz - vCampW;
      float d2 = dot(toLamp, toLamp);
      float reach2 = uLampAt[i].w * uLampAt[i].w;
      if (d2 < reach2) {
        float win = 1.0 - d2 / reach2;
        float facing = max(dot(campN, toLamp * inversesqrt(d2)), 0.0);
        campIrr += uLampCol[i] * facing * win * win / (d2 + 0.3);
      }
    }
    reflectedLight.indirectDiffuse += campIrr * BRDF_Lambert(material.diffuseColor);
  }
}
`;

const GLOW_VERT = /* glsl */ `
attribute vec4 gAt;
attribute vec4 gCol;
varying vec2 vUv;
varying vec4 vCol;
varying float vFlick;
uniform float uTime;
void main() {
  vUv = position.xy * 2.0;
  /* gCol.a: the flicker's phase; 0 a steady lamp. */
  float ph = gCol.a;
  vFlick = ph > 0.0 ? 0.8 + 0.12 * sin(uTime * 9.0 + ph * 7.0) + 0.08 * sin(uTime * 23.0 + ph * 3.0) : 1.0;
  vCol = gCol;
  vec4 mv = modelViewMatrix * vec4(gAt.xyz, 1.0);
  /* Drawn half its size nearer the camera than its middle, so the ground
   * beside a fire does not cut its halo in half; no more, or a lantern's
   * would show through the tarp it hangs under. */
  float size = gAt.w * mix(1.0, vFlick, 0.6);
  mv.xyz += normalize(-mv.xyz) * min(size * 0.5, -mv.z * 0.5);
  mv.xy += position.xy * size * 2.0;
  gl_Position = projectionMatrix * mv;
}
`;
const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vFlick;
void main() {
  float r = length(vUv);
  if (r >= 1.0) discard;
  float halo = pow(1.0 - r, 2.6);
  float core = 1.0 - smoothstep(0.03, 0.12, r);
  vec3 rgb = vCol.rgb * vFlick * (halo * 0.35 + core * 4.0);
  gl_FragColor = vec4(rgb, 1.0);
}
`;

/*
 * The clearing's light: `at` its middle [x, z], `inner` and `outer` the
 * fill's radii (m); `lamps` what lights the camp, each { at: [x, y, z],
 * reach (m), colour [r, g, b] linear, strength, flicker (a phase, 0
 * steady) }; `glows` what draws the lamps and flames, each { at, size
 * (the halo's radius, m), colour, flicker }. Returns { patch(material),
 * setSun(irradiance), mesh, update(seconds), dispose() }.
 */
export function makeCampLight(THREE, {
  at, inner, outer, lamps, glows,
}) {
  if (lamps.length > LAMPS_MAX) {
    throw new Error(`camplight: ${lamps.length} lamps, the chunk holds ${LAMPS_MAX}`);
  }
  const uCampAt = { value: new THREE.Vector4(at[0], at[1], inner, outer) };
  const uCampFill = { value: new THREE.Vector3() };
  const uLampAt = { value: [] };
  const uLampCol = { value: [] };
  for (let k = 0; k < LAMPS_MAX; k += 1) {
    const l = lamps[k];
    uLampAt.value.push(l ? new THREE.Vector4(l.at[0], l.at[1], l.at[2], l.reach) : new THREE.Vector4(0, -1e6, 0, 0));
    uLampCol.value.push(new THREE.Vector3());
  }
  const steady = (k, seconds) => {
    const l = lamps[k];
    if (!l.flicker) {
      return 1;
    }
    const ph = l.flicker;
    return 0.8 + 0.12 * Math.sin(seconds * 9 + ph * 7) + 0.08 * Math.sin(seconds * 23 + ph * 3);
  };

  function patch(material) {
    const before = material.onBeforeCompile;
    const key = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      before.call(material, shader, renderer);
      shader.uniforms.uCampAt = uCampAt;
      shader.uniforms.uCampFill = uCampFill;
      shader.uniforms.uLampAt = uLampAt;
      shader.uniforms.uLampCol = uLampCol;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <aomap_fragment>', `${FRAG}\n#include <aomap_fragment>`);
    };
    material.customProgramCacheKey = () => `${key()}|camplight`;
    material.needsUpdate = true;
    return material;
  }

  function setSun(irradiance) {
    const s = Math.max(0, irradiance) * FILL_SHARE;
    uCampFill.value.set(FILL_TINT[0] * s, FILL_TINT[1] * s, FILL_TINT[2] * s);
  }

  /* The halos: four corners a glow, its place and size, colour and phase. */
  const n = glows.length;
  const pos = new Float32Array(n * 4 * 3);
  const gAt = new Float32Array(n * 4 * 4);
  const gCol = new Float32Array(n * 4 * 4);
  const index = [];
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  glows.forEach((l, k) => {
    corners.forEach(([u, v], c) => {
      const i = k * 4 + c;
      pos.set([u, v, 0], i * 3);
      gAt.set([l.at[0], l.at[1], l.at[2], l.size], i * 4);
      gCol.set([l.colour[0], l.colour[1], l.colour[2], l.flicker], i * 4);
    });
    index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('gAt', new THREE.Float32BufferAttribute(gAt, 4));
  geo.setAttribute('gCol', new THREE.Float32BufferAttribute(gCol, 4));
  geo.setIndex(index);
  /* The corners are offsets the vertex shader spreads round gAt, so the
   * bounds are the clearing's own, for the frustum test: the halos are
   * drawn only where the camp is in view. */
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(at[0], lamps.length ? lamps[0].at[1] : 0, at[1]), outer);
  const uTime = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { uTime },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    /* Light added and alpha left alone, as explosion.js's hot pool. */
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    side: THREE.DoubleSide,
  });
  /* A lamp's glass and a flame add fifty degrees each to what is behind
   * them (a fire's five flames over its 600 C embers stay under 900 C);
   * the halo round them is light in the air and adds nothing. */
  thermalShader(mat, 'float thT = (1.0 - smoothstep(0.03, 0.12, length(vUv))) * 0.5;', 'camp-lamp');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'interior-camp-glow';
  mesh.renderOrder = 3;

  /* Lit, or out: a camp its people have left (Mission 2's Claro Viejo). */
  let lit = 1;
  let last = 0;
  function update(seconds) {
    last = seconds;
    uTime.value = seconds;
    lamps.forEach((l, k) => {
      const s = l.strength * steady(k, seconds) * lit;
      uLampCol.value[k].set(l.colour[0] * s, l.colour[1] * s, l.colour[2] * s);
    });
  }
  update(0);
  setSun(0);

  function setLit(on) {
    lit = on ? 1 : 0;
    mesh.visible = on;
    update(last);
  }

  return {
    patch,
    setSun,
    setLit,
    mesh,
    update,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
