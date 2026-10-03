/*
 * wires.js: the overhead lines' conductors drawn, every one in sight in
 * one draw call: a ribbon a chord, turned to the camera in the vertex
 * shader, as wide as the conductor is and never narrower on screen than
 * MIN_PX, the way a streamer's paper is (src/render/streamers.js). A
 * conductor is 36 mm across: at 300 m that is a tenth of a pixel, and
 * drawn true it flickered in and out of the picture or went altogether,
 * so a pilot could not see the span they were about to fly into, nor a
 * replay show what was hit. Drawn at the least width, a far wire is a
 * fine line and a near one its true thickness, lit as a round wire is
 * (the normal turns across the ribbon), so it takes the scene's light by
 * day and goes dark by night.
 *
 * Past the distance it would be thinner than MIN_PX, the ribbon fades by
 * how much of its width is wire, to no less than FAR_ALPHA: a dozen
 * parallel conductors drawn solid at a pixel each made a black band
 * across every view from the air (the line set this replaces drew them at
 * 0.45 for that reason).
 *
 * THE BUDGET (docs/ITAIPU-PLAN.md section 13). Every conductor of the
 * hero square is 61 000 ribbons, 122 000 triangles, where the line set
 * cost none. So the chords are kept in TILE_M tiles and the instances
 * drawn are rewritten whenever the camera has moved a CELL_M cell: a
 * tile within NEAR_M draws each conductor of a bundle, one within FAR_M
 * a bundle as the one line it looks from there (its conductors are under
 * a pixel apart), and one past FAR_M nothing. One draw call whatever is
 * in view.
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

import { bundleHalf, conductorsOf } from './power.js';

/* The least width a conductor is drawn at, pixels of the drawing buffer. */
export const MIN_PX = 1.25;
/* The least opacity of a conductor drawn wider than it is. */
export const FAR_ALPHA = 0.45;
/* The tiles, and how far from one its conductors and its lines are drawn,
 * metres: a bundle's 457 mm is under MIN_PX at 60 degrees of view across
 * 900 lines from about 240 m, where its four conductors drawn at MIN_PX
 * each ran together into a dark bar; at FAR_M a line at MIN_PX and
 * FAR_ALPHA is a faint thread. */
export const TILE_M = 128;
export const NEAR_M = 150;
export const FAR_M = 4000;
/* The camera moved this far, the instances are chosen again. */
const CELL_M = 32;
/* Weathered aluminium: a dull light grey, its oxide diffuse rather than a
 * mirror (with no sky to reflect, a metal reads black). */
const ALUMINIUM = 0x9da3a8;
const FLOATS = 7;

/*
 * The mesh for layOut's `chords`, and view(camera) to call once a frame
 * before the draw.
 */
export function wireMesh(THREE, chords) {
  /* Each tile's conductors and its bundles' lines, flat [ax, ay, az, bx,
   * by, bz, r], and its box. */
  const tiles = new Map();
  for (const w of chords) {
    const key = `${Math.floor((w[0] + w[3]) / 2 / TILE_M)},${Math.floor((w[2] + w[5]) / 2 / TILE_M)}`;
    let t = tiles.get(key);
    if (!t) {
      t = {
        near: [], far: [], nearSpan: [], farSpan: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity],
      };
      tiles.set(key, t);
    }
    const c = new Array(w[7] * FLOATS);
    conductorsOf(w, c, 0);
    t.near.push(...c);
    t.far.push(w[0], w[1], w[2], w[3], w[4], w[5], bundleHalf(w));
    for (let k = 0; k < w[7]; k += 1) {
      t.nearSpan.push(w[10]);
    }
    t.farSpan.push(w[10]);
    for (let a = 0; a < 3; a += 1) {
      t.lo[a] = Math.min(t.lo[a], w[a], w[a + 3]);
      t.hi[a] = Math.max(t.hi[a], w[a], w[a + 3]);
    }
  }
  const list = [...tiles.values()].map((t) => ({
    ...t, near: Float32Array.from(t.near), far: Float32Array.from(t.far), nearBase: Float32Array.from(t.near), farBase: Float32Array.from(t.far),
  }));
  const conductors = list.reduce((n, t) => n + t.near.length / FLOATS, 0);
  const capacity = list.reduce((n, t) => n + Math.max(t.near.length, t.far.length) / FLOATS, 0);

  const g = new THREE.InstancedBufferGeometry();
  /* corner: along the chord (0 at a, 1 at b), and across it (-1, 1). */
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  g.setAttribute('corner', new THREE.Float32BufferAttribute([0, -1, 0, 1, 1, -1, 1, 1], 2));
  /* Wound so the ribbon the shader turns to the eye faces it: its side is
   * dir x eye, so corner -1 is to the left of the chord on screen. */
  g.setIndex([0, 1, 2, 1, 3, 2]);
  const inst = new THREE.InstancedInterleavedBuffer(new Float32Array(capacity * FLOATS), FLOATS);
  inst.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aA', new THREE.InterleavedBufferAttribute(inst, 3, 0));
  g.setAttribute('aB', new THREE.InterleavedBufferAttribute(inst, 3, 3));
  g.setAttribute('aR', new THREE.InterleavedBufferAttribute(inst, 1, 6));
  g.instanceCount = 0;

  const uniforms = {
    uViewH: { value: 720 },
    uMinPx: { value: MIN_PX },
    uFarAlpha: { value: FAR_ALPHA },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: ALUMINIUM, roughness: 0.6, metalness: 0.15, transparent: true, depthWrite: false,
  });
  mat.name = 'itaipu-town-wires';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uViewH;
        uniform float uMinPx;
        attribute vec2 corner;
        attribute vec3 aA;
        attribute vec3 aB;
        attribute float aR;
        varying float vWireCover;`)
      .replace('#include <beginnormal_vertex>', `
        vec3 wA = (modelViewMatrix * vec4(aA, 1.0)).xyz;
        vec3 wB = (modelViewMatrix * vec4(aB, 1.0)).xyz;
        vec3 wP = mix(wA, wB, corner.x);
        vec3 wEye = normalize(-wP);
        vec3 wSide = cross(normalize(wB - wA), wEye);
        float wSideL = length(wSide);
        wSide = wSideL > 1e-6 ? wSide / wSideL : vec3(0.0, 1.0, 0.0);
        /* Metres a pixel at the conductor, for a perspective camera. */
        float wPerPx = length(wP) * 2.0 / (projectionMatrix[1][1] * uViewH);
        float wHalf = max(aR, wPerPx * uMinPx * 0.5);
        vWireCover = aR / wHalf;
        vec3 objectNormal = vec3(0.0, 1.0, 0.0);`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        /* A round wire's normal, across the ribbon from one flank to the
         * other through the face toward the eye. */
        transformedNormal = normalize(wEye + wSide * corner.y);`)
      .replace('#include <begin_vertex>', 'vec3 transformed = mix(aA, aB, corner.x);')
      /* The chunk stays, so the injections after it (look/light.js,
       * look/night.js) find their anchor; the ribbon's corner replaces
       * the axis point it projected. */
      .replace('#include <project_vertex>', `#include <project_vertex>
        mvPosition = vec4(wP + wSide * wHalf * corner.y, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uFarAlpha;
        varying float vWireCover;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.a *= clamp(vWireCover, uFarAlpha, 1.0);`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'itaipu-town-wires';
  /* The instances are chosen by distance below; the quad's own box is
   * nothing. */
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  /* Drawn for the camera view() chose them for, and no other: the water's
   * planar mirror sees the same instances again, 47 000 triangles over the
   * yard (yard-west), for a reflection of lines under a pixel wide. */
  let eye = null;
  let count = 0;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    uniforms.uViewH.value = renderer.getContext().drawingBufferHeight;
    g.instanceCount = camera === eye ? count : 0;
  };

  /* The distance from p to tile t's box. */
  const away = (t, p) => {
    let d2 = 0;
    for (let a = 0; a < 3; a += 1) {
      const e = p[a] < t.lo[a] ? t.lo[a] - p[a] : p[a] > t.hi[a] ? p[a] - t.hi[a] : 0;
      d2 += e * e;
    }
    return Math.sqrt(d2);
  };
  let cell = null;
  const at = [0, 0, 0];
  const shown = { near: 0, far: 0 };
  function view(camera) {
    eye = camera;
    const p = camera.position;
    const key = `${Math.floor(p.x / CELL_M)},${Math.floor(p.y / CELL_M)},${Math.floor(p.z / CELL_M)}`;
    if (key === cell) {
      return;
    }
    cell = key;
    at[0] = p.x;
    at[1] = p.y;
    at[2] = p.z;
    const out = inst.array;
    let o = 0;
    shown.near = 0;
    shown.far = 0;
    for (const t of list) {
      const d = away(t, at);
      const src = d < NEAR_M ? t.near : d < FAR_M ? t.far : null;
      if (!src) {
        continue;
      }
      out.set(src, o);
      o += src.length;
      shown[src === t.near ? 'near' : 'far'] += src.length / FLOATS;
    }
    count = o / FLOATS;
    g.instanceCount = count;
    inst.needsUpdate = true;
  }
  /*
   * The spans whose wires are down (a support gone, the war's damage):
   * each of their conductors lies on the ground under where it hung,
   * ground(x, z) a few centimetres under it; every other span hangs as
   * built. Takes effect on the next view().
   */
  function setDown(spans, ground) {
    const down = spans instanceof Set ? spans : new Set(spans);
    for (const t of list) {
      for (const [arr, base, ids] of [[t.near, t.nearBase, t.nearSpan], [t.far, t.farBase, t.farSpan]]) {
        for (let e = 0; e < ids.length; e += 1) {
          const o = e * FLOATS;
          arr.set(base.subarray(o, o + FLOATS), o);
          if (down.has(ids[e])) {
            arr[o + 1] = ground(arr[o], arr[o + 2]) + 0.05;
            arr[o + 4] = ground(arr[o + 3], arr[o + 5]) + 0.05;
          }
        }
      }
    }
    cell = null;
  }
  return {
    mesh, view, setDown, conductors, tiles: list.length, shown: () => ({ ...shown, triangles: 2 * (shown.near + shown.far) }),
  };
}
