/*
 * render-golden/water.js: the Swiss valley's water as a material and a
 * stream (surface.js, waves.js and stream.js, under
 * src/maps/swiss2/water/ when this was recorded), pinned before they move
 * into the shared asset library (docs/ASSET-LIBRARY.md), so the move is
 * proved to change nothing: the wave texture, the water and bed
 * materials in every combination the map asks for, with their shader
 * text and program keys, a stream's ribbon, surface and gravel bars, and
 * the planar mirror (lake.js) Itaipu's water holds up too.
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
import * as surface from '../../../src/render/library/water/surface.js';
import * as waves from '../../../src/render/library/water/waves.js';
import * as stream from '../../../src/render/library/water/stream.js';
import { planarMirror } from '../../../src/render/library/water/mirror.js';
import { makeWaves } from '../../../src/render/lakewaves.js';
import { makeRng } from '../../../src/render/library/noise.js';
import {
  describeGeometry, describeMaterial, describeTexture, makeTable, hashText, describeValue,
} from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => sig(v)));
const exportsOf = (m) => Object.keys(m).sort().map((k) => [k, typeof m[k]]);

function patched(m) {
  const lib = THREE.ShaderLib.standard;
  const shader = {
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
    defines: { ...(m.defines || {}) },
  };
  const before = new Set(Object.keys(shader.uniforms));
  m.onBeforeCompile(shader, null);
  const table = makeTable();
  return {
    vertex: hashText(shader.vertexShader),
    fragment: hashText(shader.fragmentShader),
    added: Object.keys(shader.uniforms).filter((k) => !before.has(k)).sort()
      .map((k) => [k, describeValue(shader.uniforms[k].value, table)]),
    defines: shader.defines,
    key: m.customProgramCacheKey(),
  };
}

function texture(w, h) {
  const t = new THREE.DataTexture(new Uint8Array(w * h * 4).fill(90), w, h);
  t.needsUpdate = true;
  return t;
}

/* The map's option sets: the lake (with a mirror, its waves and a depth
 * patch), the stream, the pool. */
function options() {
  const base = {
    waves: texture(8, 8),
    time: { value: 0 },
    wind: { value: new THREE.Vector2(0.8, -0.6).normalize() },
    envMap: null,
  };
  const lake = {
    ...base,
    colour: new THREE.Color(0.02, 0.09, 0.1),
    shallow: new THREE.Color(0.05, 0.2, 0.18),
    deep: new THREE.Color(0.01, 0.04, 0.06),
    clarity: 0.6,
    ripple: 0.3,
    roughness: 0.03,
    planar: { texture: texture(4, 4), matrix: new THREE.Matrix4().makeScale(0.5, 0.5, 1) },
    shoreFoam: 0.08,
    boat: { value: new THREE.Vector4(1, 2, 3, 4) },
    inflow: new THREE.Vector4(10, 20, 30, 0.5),
  };
  return {
    plain: { ...base, colour: new THREE.Color(0.1, 0.2, 0.3) },
    lake,
    lakeWaves: { ...lake, field: makeWaves() },
    lakePatch: { ...lake, field: makeWaves(), patch: { texture: texture(4, 4), grid: new THREE.Vector4(-10, -20, 0.2, 0) } },
    stream: { ...base, flow: true, colour: new THREE.Color(0.05, 0.1, 0.08), clarity: 3, ripple: 0.6, roughness: 0.06, width: 4 },
    pool: { ...base, colour: new THREE.Color(0.02, 0.09, 0.1), clarity: 0.5, ripple: 0.8, roughness: 0.05, foamAt: [5, 6, 14, 1] },
  };
}

/* A stream that bends both ways and drops down a slope. */
function line() {
  const pts = [];
  for (let k = 0; k < 60; k += 1) {
    pts.push({ x: 8 * k, z: 30 * Math.sin(k / 6) + 4 * Math.sin(k * 1.7) });
  }
  return pts;
}
const groundAt = (x, z) => 100 - 0.05 * x + 0.8 * Math.sin(z / 3) + 0.3 * Math.cos(x / 5);

export function cases() {
  return {
    exports: () => ({ surface: exportsOf(surface), waves: exportsOf(waves), stream: exportsOf(stream), lift: stream.STREAM_LIFT }),
    waveTexture: () => {
      const table = makeTable();
      return { full: describeTexture(waves.waveTexture(), table), small: describeTexture(waves.waveTexture(64), table) };
    },
    materials: () => {
      const out = {};
      const absorb = new THREE.Vector3(0.45, 0.09, 0.05);
      for (const [name, o] of Object.entries(options())) {
        const m = surface.waterMaterial(o);
        const b = surface.bedMaterial(o, absorb);
        out[name] = {
          water: describeMaterial(m, makeTable()),
          waterShaders: patched(m),
          waterUniforms: Object.keys(m.userData.water).sort(),
          bed: describeMaterial(b, makeTable()),
          bedShaders: patched(b),
          bedBlend: [b.blending, b.blendEquation, b.blendSrc, b.blendDst, b.blendSrcAlpha, b.blendDstAlpha, b.userData.water.uBedPass.value, b.userData.water.uAbsorb.value.toArray()],
        };
      }
      return round(out);
    },
    stream: () => {
      const table = makeTable();
      const pts = line();
      return {
        ribbon: describeGeometry(stream.streamGeometry(pts, 5.2, groundAt), table),
        lifted: describeGeometry(stream.streamGeometry(pts.slice(0, 20), 3.6, groundAt, 0.3), table),
        surface: round(stream.streamSurface(pts, groundAt)),
        surfaceLifted: round(stream.streamSurface(pts.slice(5, 15), groundAt, 0.3)),
        bars: describeGeometry(stream.gravelBarGeometry(pts, 5.2, groundAt, makeRng(7)), table),
      };
    },
    /* The mirror drawn for one camera over a scene with a box in it:
     * where it reads the target (matrix), how much of the target the
     * bounds asked for, and the target's size, with and without bounds,
     * and with the eye under the water (no draw). */
    mirror: () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const renderer = new THREE.WebGLRenderer({ canvas });
      const scene = new THREE.Scene();
      const box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial());
      box.position.set(0, 12, -40);
      scene.add(box);
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 5000);
      camera.position.set(3, 20, 30);
      camera.lookAt(0, 2, -60);
      const out = {};
      const m = planarMirror(2, 0.5);
      out.keys = Object.keys(m).sort();
      out.whole = [m.render(renderer, scene, camera, [box]), m.matrix.toArray(), m.share(), [m.texture.image.width, m.texture.image.height], box.visible];
      const bounds = new THREE.Box3(new THREE.Vector3(-50, 1, -200), new THREE.Vector3(50, 3, -20));
      out.bounded = [m.render(renderer, scene, camera, [], bounds), m.matrix.toArray(), m.share()];
      m.setLevel(25);
      out.under = [m.render(renderer, scene, camera, []), m.share()];
      const n = planarMirror(-3);
      out.defaultScale = [n.render(renderer, scene, camera, []), [n.texture.image.width, n.texture.image.height], n.texture.type, n.texture.generateMipmaps];
      m.dispose();
      n.dispose();
      renderer.dispose();
      return round(out);
    },
  };
}
