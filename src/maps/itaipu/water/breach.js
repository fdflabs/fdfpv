/*
 * breach.js: the water through a hole a war tears in a spillway gate's
 * leaf, drawn (docs/FLOOD.md): a nappe falling from the hole to the sill,
 * as wide as the hole, on the path the flood's own discharge through that
 * gate gives it, and the spray where it lands.
 *
 *   A HOLE OPEN TO THE SKY (a notch through the leaf's top) passes its
 *   water over its crest at critical depth, yc = (q^2 / g)^(1/3) for q
 *   the discharge per metre of its width, and speed q / yc; a HOLE UNDER
 *   THE WATER is an orifice, its jet leaving at sqrt(2 g H) for H the
 *   reservoir's head over the hole's middle. Either falls from the gate's
 *   downstream face, z = z0 - g t^2 / 2 and d = d0 + v t, to the floor
 *   under it. Nothing here moves the water: the flood does (flood.c, the
 *   cut cells and the link); this draws where it goes.
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

import { sprayMesh } from './spill.js';

const G = 9.80665;
/* Points down the fall, and how fast the nappe's streaks run, m/s. */
const ALONG = 14;
/* The discharge per metre over which a nappe is drawn whole, m2/s: a
 * thinner sheet breaks up into strands and is drawn fainter. */
const WHOLE_Q = 2;
/* The spray where a nappe lands. */
const FOOT = {
  count: 18, life: 4, rise: 14, drift: 6, s0: 3, s1: 11, opacity: 0.32,
};

/*
 * One nappe's geometry: `hole` { u (m across the chute from its axis, the
 * hole's middle), width, crest (its lowest point's height), top, q
 * (m3/s), sky }, the gate's downstream face at d0 metres down the chute,
 * `floor(d)` the concrete under it, `head` the reservoir's level, and
 * `at(u, d)` the world's (x, z). Null where nothing falls.
 */
function nappeGeometry(THREE, hole, d0, floor, head, at) {
  const w = hole.width;
  const qw = hole.q / w;
  let y0;
  let v;
  if (hole.sky) {
    const yc = Math.cbrt((qw * qw) / G);
    y0 = hole.crest + yc / 2;
    v = qw / Math.max(yc, 0.05);
  } else {
    y0 = (hole.crest + hole.top) / 2;
    v = Math.sqrt(2 * G * Math.max(0, head - y0));
  }
  const drop = y0 - floor(d0);
  if (!(drop > 0.5) || !(qw > 0.05)) {
    return null;
  }
  /* Until it meets the floor, which falls away as it goes. */
  let T = Math.sqrt((2 * drop) / G);
  for (let k = 0; k < 4; k += 1) {
    T = Math.sqrt((2 * Math.max(0.1, y0 - floor(d0 + v * T))) / G);
  }
  const pos = [];
  const fall = [];
  const idx = [];
  for (let i = 0; i <= ALONG; i += 1) {
    const t = (T * i) / ALONG;
    const d = d0 + v * t;
    const y = y0 - 0.5 * G * t * t;
    /* It spreads a little as it falls. */
    const half = (w / 2) * (1 + 0.15 * (i / ALONG));
    for (const s of [-1, 1]) {
      const [x, z] = at(hole.u + s * half, d);
      pos.push(x, y, z);
      fall.push(i / ALONG, s, v * t + 0.5 * G * t * t);
    }
    if (i > 0) {
      const k = 2 * i;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFall', new THREE.Float32BufferAttribute(fall, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const [fx, fz] = at(hole.u, d0 + v * T);
  return { geometry: g, foot: { x: fx, y: floor(d0 + v * T), z: fz, half: w / 2 } };
}

/* The nappe's material: white water streaming down its fall, faint at
 * its edges and as thin as its discharge. */
function nappeMaterial(THREE, { waves, time, envMap }) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.65, metalness: 0, envMap, transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  mat.name = 'itaipu-water-breach';
  const uFlow = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uWaves: { value: waves }, uTime: time, uFlow });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aFall;
        varying vec3 vFall;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFall = aFall;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uWaves;
        uniform float uTime;
        uniform float uFlow;
        varying vec3 vFall;`)
      .replace('#include <map_fragment>', `
        {
          /* Streaks down the fall, running at the water's own pace. */
          float s1 = texture2D(uWaves, vec2(vFall.y * 0.9 + 0.3, (vFall.z - uTime * 9.0) / 9.0)).a;
          float s2 = texture2D(uWaves, vec2(vFall.y * 2.7 + 0.7, (vFall.z - uTime * 11.0) / 3.5)).a;
          float streak = s1 * 0.6 + s2 * 0.4;
          float edge = 1.0 - smoothstep(0.55, 1.0, abs(vFall.y));
          /* Glassy where it leaves the hole, white as it falls and takes air. */
          float air = smoothstep(0.0, 0.35, vFall.x);
          diffuseColor.rgb = mix(vec3(0.12, 0.15, 0.13), vec3(0.78, 0.8, 0.76), mix(0.35, 1.0, air) * smoothstep(0.25, 0.65, streak));
          diffuseColor.a = uFlow * edge * mix(0.55, 0.95, streak) * mix(0.7, 1.0, air);
          if (diffuseColor.a < 0.01) discard;
        }`);
  };
  mat.customProgramCacheKey = () => 'itaipu-breach-water';
  return { mat, uFlow };
}

/*
 * The breaches' drawing, in `group`: update(list) with the flood's holes
 * each read, [{ key, u, width, crest, top, q, sky }], their nappes made
 * once a hole's shape is known (again when it grows) and their opacity
 * from their discharge every read. It answers the falls drawn, [{ key,
 * q, flow }], flow their opacity's share.
 */
export function breachWater(THREE, {
  group, waves, time, envMap, sun, state, d0, floor, head, at, wrap = (m) => m,
}) {
  const made = new Map();
  const dispose = (m) => {
    group.remove(m.mesh);
    m.mesh.geometry.dispose();
    m.mat.dispose();
    if (m.spray) {
      group.remove(m.spray);
      m.spray.geometry.dispose();
      m.spray.material.dispose();
    }
  };
  return {
    update(list) {
      const seen = new Set();
      for (const h of list) {
        seen.add(h.key);
        const shape = `${h.u.toFixed(2)}:${h.width}:${h.crest}:${h.top}:${h.sky}`;
        let m = made.get(h.key);
        /* A new shape (a bigger hole) or a discharge a tenth away from the
         * one its fall was drawn for is a new fall. */
        if (m && (m.shape !== shape || Math.abs(m.q - h.q) > 0.1 * Math.max(m.q, 1))) {
          dispose(m);
          made.delete(h.key);
          m = null;
        }
        if (!m) {
          const n = nappeGeometry(THREE, h, d0, floor, head, at);
          if (!n) continue;
          const { mat, uFlow } = nappeMaterial(THREE, { waves, time, envMap });
          const mesh = new THREE.Mesh(n.geometry, wrap(mat));
          mesh.name = `itaipu-breach-${h.key}`;
          mesh.renderOrder = 2;
          group.add(mesh);
          const spray = sprayMesh(THREE, {
            sets: [{
              ...FOOT,
              bases: [{
                x: n.foot.x, y: n.foot.y, z: n.foot.z, half: n.foot.half, ax: 0, az: 0, cx: 1, cz: 0,
              }],
              seed: 101 + h.key,
              drift: { x: 0, y: FOOT.drift },
            }],
            waves,
            time,
            sun,
            riverY: n.foot.y - 20,
            state,
          });
          spray.name = `itaipu-breach-spray-${h.key}`;
          group.add(spray);
          m = {
            mesh, mat, uFlow, spray, shape, q: h.q,
          };
          made.set(h.key, m);
        }
        m.uFlow.value = Math.min(1, Math.max(0, h.q / h.width / WHOLE_Q));
        m.spray.visible = h.q > 10;
      }
      for (const [key, m] of made) {
        if (!seen.has(key)) {
          dispose(m);
          made.delete(key);
        }
      }
      return [...made].map(([key, m]) => ({ key, q: m.q, flow: m.uFlow.value }));
    },
    dispose() {
      for (const m of made.values()) dispose(m);
      made.clear();
    },
  };
}
