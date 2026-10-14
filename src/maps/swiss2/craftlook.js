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
import { withFilm } from '../../render/filmmat.js';

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
  /* Iron on covering film, polyester, glossy over its wood. */
  film: { roughness: 0.28, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.1 },
  /* The paint shop's finishes (src/render/finish.js), a region's own. */
  gloss: { roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 },
  matte: { roughness: 0.92, metalness: 0, grain: 0.03 },
  metallic: { roughness: 0.34, metalness: 0.85, clearcoat: 1, clearcoatRoughness: 0.08 },
  chrome: { roughness: 0.04, metalness: 1 },
  aluminium: { roughness: 0.32, metalness: 1, grain: 0.04 },
  satin: { roughness: 0.45, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.35 },
  pearl: { roughness: 0.3, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 },
  candy: { roughness: 0.2, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.03 },
  flake: { roughness: 0.38, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.02 },
  brushed: { roughness: 0.3, metalness: 1, grain: 0.04 },
  /* Gold whatever the region's paint (finish.js). */
  gold: { roughness: 0.22, metalness: 1, color: 0xd9a441 },
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
  if (mat.userData.paintFinish) {
    return mat.userData.paintFinish;
  }
  if (mat.userData.film) {
    return 'film';
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

/*
 * A palette cel material's twin (combatcraft.js paletteFixed): one
 * physical material whose colour, roughness, metalness, clearcoat, grain
 * and weave are each entry's own, the entry's finish read from the
 * material it stands in for, picked per vertex by aCelKey and passed by
 * flat varyings, as celmat.js does, so each surface draws with the bits
 * its own twin's uniforms held. Clearcoat is on for the whole mesh when
 * any entry has it, at 0 for the rest: their light times 1 plus the
 * coat's times 0.
 */
function paletteTwin(cel) {
  const finishes = cel.userData.paletteOf.map((m) => FINISHES[finishOf(m, false)]);
  const n = finishes.length;
  const paint = new Float32Array(n * 4);
  const pbr = new Float32Array(n * 4);
  finishes.forEach((f, i) => {
    const m = cel.userData.paletteOf[i];
    (f.color === undefined ? m.color : new THREE.Color().setHex(f.color, THREE.SRGBColorSpace)).toArray(paint, i * 4);
    paint[i * 4 + 3] = f.grain ?? 0;
    pbr.set([f.roughness, f.metalness, f.clearcoat ?? 0, f.clearcoatRoughness ?? 0], i * 4);
  });
  const weave = new Float32Array(finishes.map((f) => f.weave ?? 0));
  const chunk = THREE.ShaderChunk.lights_physical_fragment;
  const coat = ['material.clearcoat = clearcoat;', 'material.clearcoatRoughness = clearcoatRoughness;'];
  if (!coat.every((line) => chunk.includes(line))) {
    throw new Error('swiss2 craftlook: three changed lights_physical_fragment; a palette twin would draw every clearcoat alike');
  }
  return {
    clearcoat: finishes.some((f) => f.clearcoat) ? 1 : 0,
    uniforms: { uCkPaint: { value: paint }, uCkPbr: { value: pbr }, uCkWeaves: { value: weave } },
    vertexPars: `
      attribute float aCelKey;
      uniform vec4 uCkPaint[${n}];
      uniform vec4 uCkPbr[${n}];
      uniform float uCkWeaves[${n}];
      flat varying vec4 vCkPaint;
      flat varying vec4 vCkPbr;
      flat varying float vCkWeave;`,
    vertex: `
      vCkPaint = uCkPaint[int(aCelKey)];
      vCkPbr = uCkPbr[int(aCelKey)];
      vCkWeave = uCkWeaves[int(aCelKey)];`,
    fragmentPars: `
      flat varying vec4 vCkPaint;
      flat varying vec4 vCkPbr;
      flat varying float vCkWeave;
      #define uCkGrain vCkPaint.a
      #define uCkWeave vCkWeave`,
    colour: '\n        diffuseColor.rgb *= vCkPaint.rgb;',
    roughness: '\n        roughnessFactor = vCkPbr.x;',
    metalness: '\n        metalnessFactor = vCkPbr.y;',
    lights: chunk.replace(coat[0], 'material.clearcoat = vCkPbr.z;').replace(coat[1], 'material.clearcoatRoughness = vCkPbr.w;'),
    key: `swiss2-craft-palette${n}`,
  };
}

function craftMaterial(cel, finish) {
  const palette = cel.userData.paletteOf ? paletteTwin(cel) : null;
  /* A palette twin's own values are each overridden per entry. */
  const f = palette ? FINISHES.plastic : FINISHES[finish];
  const mat = new THREE.MeshPhysicalMaterial({
    color: palette ? 0xffffff : (f.color === undefined ? cel.color.clone() : new THREE.Color().setHex(f.color, THREE.SRGBColorSpace)),
    map: cel.map,
    roughness: f.roughness,
    metalness: f.metalness,
    clearcoat: palette ? palette.clearcoat : f.clearcoat ?? 0,
    clearcoatRoughness: f.clearcoatRoughness ?? 0,
    transparent: cel.transparent,
    opacity: cel.opacity,
    alphaTest: cel.alphaTest,
    side: cel.side,
    depthWrite: cel.depthWrite,
    polygonOffset: cel.polygonOffset,
    polygonOffsetFactor: cel.polygonOffsetFactor,
    polygonOffsetUnits: cel.polygonOffsetUnits,
  });
  mat.name = `craft-${finish}`;
  /* What the part is in a thermal picture (src/render/thermal.js): the
   * cel material's kind, a motor's say, carried to its photographed twin. */
  if (cel.userData.thermal) {
    mat.defines = { ...mat.defines, THERMAL_KIND: cel.defines.THERMAL_KIND };
    mat.userData.thermal = cel.userData.thermal;
  }
  const grain = f.grain ?? 0;
  const weave = f.weave ?? 0;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCkGrain = { value: grain };
    shader.uniforms.uCkWeave = { value: weave };
    if (palette) {
      Object.assign(shader.uniforms, palette.uniforms);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCkP;\nvarying vec3 vCkN;${palette ? palette.vertexPars : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvCkP = position;\nvCkN = normal;${palette ? palette.vertex : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}${palette ? palette.fragmentPars : ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>${palette ? palette.metalness : ''}`)
      .replace('#include <lights_physical_fragment>', palette ? palette.lights : '#include <lights_physical_fragment>')
      .replace('#include <color_fragment>', `#include <color_fragment>${palette ? palette.colour : ''}
        float ckM = ckMottle();
        float ckT = ckTwill();
        diffuseColor.rgb *= 1.0 + uCkGrain * ckM * 2.0;
        diffuseColor.rgb *= mix(1.0, 0.55 + 0.9 * ckT, uCkWeave);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>${palette ? palette.roughness : ''}
        roughnessFactor = clamp(roughnessFactor * (1.0 + uCkGrain * ckM * 3.0) + uCkWeave * (0.5 - ckT) * 0.3, 0.02, 1.0);`);
  };
  /* The injected source is the same for every finish; what differs are
   * uniforms, and the physical features three keys on itself. */
  mat.customProgramCacheKey = () => (palette ? palette.key : 'swiss2-craft');
  return mat;
}

/*
 * A palette geometry with its entries' runs of vertices put in the order
 * `first` gives (each entry's material first met), or null when they are
 * in it already. Every run is whole (combatcraft.js paletteFixed
 * concatenates the parts), so the vertices are only moved, never changed.
 */
function inFirstOrder(geo, first) {
  const ks = first.map((_, k) => k).sort((a, b) => first[a] - first[b] || a - b);
  if (ks.every((k, i) => k === i)) {
    return null;
  }
  const keys = geo.attributes.aCelKey.array;
  const runs = ks.map((k) => [keys.indexOf(k), keys.lastIndexOf(k) + 1]);
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(geo.attributes)) {
    const arr = new a.array.constructor(a.array.length);
    let at = 0;
    for (const [from, to] of runs) {
      arr.set(a.array.subarray(from * a.itemSize, to * a.itemSize), at);
      at += (to - from) * a.itemSize;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  out.boundingSphere = geo.boundingSphere;
  out.boundingBox = geo.boundingBox;
  return out;
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
    const cels = [];
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
      if (o.material.userData.cel) {
        cels.push(o);
      }
    });
    /* Three draws the twins in the order they are made, which is the
     * order their materials are first met here. A peer whose parts were
     * joined (combatcraft.js paletteFixed) has its twins made, and each
     * palette's entries drawn, in the order the parts' materials were met
     * before the join, so where two parts meet at a depth tie the one that
     * won still does. */
    const joined = cels.some((o) => o.userData.firstSeq !== undefined);
    if (joined) {
      const at = (o) => (o.userData.paletteFirst ? Math.min(...o.userData.paletteFirst) : o.userData.firstSeq ?? Infinity);
      cels.sort((a, b) => at(a) - at(b));
    }
    const regeometry = [];
    for (const o of cels) {
      if (o.userData.paletteFirst) {
        const g = inFirstOrder(o.geometry, o.userData.paletteFirst);
        if (g) {
          regeometry.push({ mesh: o, geometry: o.geometry });
          o.geometry = g;
        }
      }
      const cel = o.material;
      const finish = cel.userData.paletteOf ? 'palette' : finishOf(cel, rotorMeshes.has(o));
      const key = `${finish}|${cel.uuid}`;
      if (!twins.has(key)) {
        /* A film keeps its light through the frame, its cel material's own. */
        const twin = craftMaterial(cel, finish);
        twins.set(key, lit(cel.userData.film ? withFilm(twin, cel.userData.film) : twin));
      }
      swapped.push({ mesh: o, material: cel, receive: o.receiveShadow });
      o.material = twins.get(key);
      o.receiveShadow = true;
    }
    return function undo() {
      for (const s of swapped) {
        s.mesh.material = s.material;
        s.mesh.receiveShadow = s.receive;
      }
      for (const r of regeometry) {
        r.mesh.geometry.dispose();
        r.mesh.geometry = r.geometry;
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
