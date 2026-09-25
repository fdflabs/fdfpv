/*
 * craftlook.js: the aircraft you fly, drawn physically based in swiss2.
 *
 * Every craft builder draws in cel: MeshToonMaterial through celmat.js,
 * with an inverted hull of ink round its big parts. In a valley lit by a
 * photographed sky that reads as a cartoon pasted on a photograph. This
 * restyles a BUILT craft instead of asking the builders to know about
 * swiss2: it walks the meshes, gives every cel material a physically
 * based twin of the same colour, hides the ink hulls, and hands back a
 * function that puts every original back. The shell calls it on each
 * craft it builds while swiss2 is seated (shell.js setCraftLook), so a
 * craft written after this file is restyled the same way.
 *
 * A cel material says what it is only through its colour and the options
 * it was made with (celmat.js keeps those as userData.celKey), so the
 * finish is read from them: a tight bright highlight is metal, a strong
 * rim with a strong highlight is glass, a dark part with a broad sheen is
 * carbon, anything pale is foam, the rest plastic, and whatever spins in
 * a rotor is a prop. The prop discs, the lamps and the ghost are not cel
 * and are left as they are.
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

/*
 * The finishes. grain is the mottle of a moulded or foam surface, in
 * albedo and roughness; weave is carbon's twill. Both are drawn in the
 * part's own coordinates, so they need no uvs, and fade out before they
 * are finer than a pixel rather than shimmer.
 */
const FINISHES = {
  foam: { roughness: 0.78, metalness: 0, grain: 0.07 },
  plastic: { roughness: 0.5, metalness: 0, grain: 0.04 },
  prop: { roughness: 0.62, metalness: 0, grain: 0.03 },
  carbon: { roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, weave: 1 },
  metal: { roughness: 0.3, metalness: 1, grain: 0.03 },
  glass: { roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 },
};

/* Relative luminance of an sRGB hex, as the cel palette was authored. */
function luminance(hex) {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/* The options a cel material was made with; empty for a keyed (textured)
 * one, whose key is a name rather than the options. */
function celOptions(mat) {
  try {
    return JSON.parse(mat.userData.celKey) ?? {};
  } catch {
    return {};
  }
}

function finishOf(mat, inRotor) {
  if (inRotor) {
    return 'prop';
  }
  const o = celOptions(mat);
  const spec = o.spec ?? 0;
  const rim = o.rim ?? 0.32;
  const lum = luminance(mat.color.getHex(THREE.SRGBColorSpace));
  if (rim >= 0.4 && spec >= 0.55) {
    return 'glass';
  }
  if (spec >= 0.5 && lum >= 0.25) {
    return 'metal';
  }
  if (spec >= 0.55) {
    return 'carbon';
  }
  return lum >= 0.35 ? 'foam' : 'plastic';
}

const NOISE = /* glsl */ `
  varying vec3 vCkP;
  varying vec3 vCkN;
  uniform float uCkGrain;
  uniform float uCkWeave;
  float ckHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float ckNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(ckHash(i), ckHash(i + vec3(1, 0, 0)), f.x), mix(ckHash(i + vec3(0, 1, 0)), ckHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(ckHash(i + vec3(0, 0, 1)), ckHash(i + vec3(1, 0, 1)), f.x), mix(ckHash(i + vec3(0, 1, 1)), ckHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  /* Signed mottle at a scale of centimetres, the finer octave fading as
   * it nears a pixel. */
  float ckMottle() {
    vec3 p = vCkP * 40.0;
    float fine = 1.0 - smoothstep(0.3, 0.9, length(fwidth(p)) * 4.0);
    return (ckNoise(p) - 0.5) + (ckNoise(p * 4.0) - 0.5) * 0.5 * fine;
  }
  /* A 2x2 twill of 3 mm tows on the face the part's normal is nearest
   * to: 1 across the crown of a tow, 0 in the gap, and 0.5 once the tows
   * would be finer than a pixel. */
  float ckTwill() {
    vec3 an = abs(vCkN);
    vec2 q = an.x > an.y && an.x > an.z ? vCkP.yz : (an.y > an.z ? vCkP.xz : vCkP.xy);
    q /= 0.003;
    vec2 c = floor(q);
    vec2 f = fract(q);
    float warp = step(2.0, mod(c.x + c.y, 4.0));
    float tow = mix(sin(f.x * PI), sin(f.y * PI), warp);
    float fade = 1.0 - smoothstep(0.35, 0.9, max(fwidth(q.x), fwidth(q.y)));
    return mix(0.5, tow, fade);
  }
`;

function craftMaterial(cel, finish) {
  const f = FINISHES[finish];
  const mat = new THREE.MeshPhysicalMaterial({
    color: cel.color.clone(),
    map: cel.map,
    roughness: f.roughness,
    metalness: f.metalness,
    clearcoat: f.clearcoat ?? 0,
    clearcoatRoughness: f.clearcoatRoughness ?? 0,
    transparent: cel.transparent,
    opacity: cel.opacity,
    alphaTest: cel.alphaTest,
    side: cel.side,
    depthWrite: cel.depthWrite,
  });
  mat.name = `craft-${finish}`;
  const grain = f.grain ?? 0;
  const weave = f.weave ?? 0;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCkGrain = { value: grain };
    shader.uniforms.uCkWeave = { value: weave };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCkP;\nvarying vec3 vCkN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCkP = position;\nvCkN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ckM = ckMottle();
        float ckT = ckTwill();
        diffuseColor.rgb *= 1.0 + uCkGrain * ckM * 2.0;
        diffuseColor.rgb *= mix(1.0, 0.55 + 0.9 * ckT, uCkWeave);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (1.0 + uCkGrain * ckM * 3.0) + uCkWeave * (0.5 - ckT) * 0.3, 0.02, 1.0);`);
  };
  /* The injected source is the same for every finish; what differs are
   * uniforms, and the physical features three keys on itself. */
  mat.customProgramCacheKey = () => 'swiss2-craft';
  return mat;
}

/*
 * The look swiss2 hands the shell. `lit` is the valley's light injection
 * (light.js makeLit), so the craft is in the mountains' shadow and under
 * the clouds' as the valley is. Returns look(craft) -> undo.
 */
export function photoCraftLook(lit) {
  return function look(craft) {
    const rotorMeshes = new Set();
    for (const rotor of craft.blades ?? []) {
      rotor.traverse((o) => rotorMeshes.add(o));
    }
    const twins = new Map();
    const swapped = [];
    const hulls = [];
    craft.group.traverse((o) => {
      /* A multi material mesh is not one any builder makes; left as built. */
      if (!o.isMesh || Array.isArray(o.material)) {
        return;
      }
      if (o.material.userData.hullColor !== undefined) {
        hulls.push({ mesh: o, visible: o.visible });
        o.visible = false;
        return;
      }
      if (!o.material.userData.cel) {
        return;
      }
      const cel = o.material;
      const finish = finishOf(cel, rotorMeshes.has(o));
      const key = `${finish}|${cel.uuid}`;
      if (!twins.has(key)) {
        twins.set(key, lit(craftMaterial(cel, finish)));
      }
      swapped.push({ mesh: o, material: cel, receive: o.receiveShadow });
      o.material = twins.get(key);
      o.receiveShadow = true;
    });
    return function undo() {
      for (const s of swapped) {
        s.mesh.material = s.material;
        s.mesh.receiveShadow = s.receive;
      }
      for (const h of hulls) {
        h.mesh.visible = h.visible;
      }
      for (const m of twins.values()) {
        m.dispose();
      }
    };
  };
}
