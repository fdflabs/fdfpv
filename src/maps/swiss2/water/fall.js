/*
 * fall.js: the waterfall off the hanging valley's lip, the cliff it
 * falls down, and the mist at its foot.
 *
 * THE HEADWALL is nature.js's: a band of rock along the lip from its foot
 * to its top, broken into crags by the noise, with a turf ledge back to
 * where the ground comes up to meet it; the heightfield's thirty metre
 * cells cannot hold a face steep enough for water to fall from. Here it
 * is dressed in a photographed CC0 rock (greyed toward the valley's
 * limestone), mapped along the face, with nature.js's strata as a darker
 * band in every three.
 *
 * THE FALL is a sheet from the lip to the pool, standing clear of the face
 * and bellying out as it drops, widening as it spreads, in two layers a
 * metre apart. Its streaks are the wave texture's height pulled long and
 * scrolled down, accelerating as water does, so the sheet is torn into
 * ropes near the top and a white veil lower down, thinning at its edges.
 *
 * THE MIST is a few hundred soft sprites boiling up from the foot and
 * drifting downwind, each on its own cycle in the shader, larger and
 * fainter as it rises, and a tighter cloud of spray over the impact.
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
import { makeRng, noise2 } from '../../alps/noise.js';
import { valleyAxis } from '../../alps/terrain.js';

/* The headwall's geometry, nature.js's rows and columns, with uv along
 * the face in metres over twelve and a colour for the strata and the
 * turf. */
export function headwallGeometry(heightAt, layout) {
  const { fallZ, BAND, faceDx, bandTop, BACK_DX } = layout;
  const COLS = Math.round((2 * BAND) / 6);
  const ROWS = 16;
  const pos = [];
  const uv = [];
  const col = [];
  const face = [];
  const ledge = [];
  for (let k = 0; k <= COLS; k += 1) {
    const z = fallZ - BAND + (2 * BAND * k) / COLS;
    const ax = valleyAxis(z);
    const fx = ax + faceDx(z);
    const foot = heightAt(fx, z);
    const top = bandTop(z, foot);
    const base = foot - 3;
    const rows = [];
    for (let r = 0; r <= ROWS; r += 1) {
      const y = base + ((top - base) * r) / ROWS;
      const crag = r === 0 || r === ROWS ? 0 : 3.2 * (noise2(k * 0.83 + 4.1, r * 0.91 + 2.3) - 0.5);
      rows.push([fx - crag, y, z]);
    }
    face.push(rows);
    ledge.push([[fx, top, z], [ax + BACK_DX, top, z]]);
  }
  const rockLight = [1.45, 1.45, 1.45];
  const rockDark = [1.05, 1.02, 1.0];
  const turf = [0.55, 0.66, 0.38];
  /* Weathering over the face at the scale of tens of metres, so the
   * texture's repeat does not read. */
  const tri = (a, b, c, colour, uvOf) => {
    for (const p of [a, b, c]) {
      /* and the dark streaks water leaves running down limestone. */
      const streak = 0.72 + 0.4 * noise2(p[2] / 8 + 3.1, p[1] / 90 + 0.7);
      const w = (0.72 + 0.5 * noise2(p[2] / 37 + 1.3, p[1] / 23 + 7.1) - 0.12 * noise2(p[2] / 9, p[1] / 9)) * streak;
      pos.push(...p);
      uv.push(...uvOf(p));
      col.push(colour[0] * w, colour[1] * w, colour[2] * w);
    }
  };
  const faceUv = (p) => [p[2] / 41, p[1] / 29];
  const ledgeUv = (p) => [p[2] / 41, p[0] / 41];
  for (let k = 0; k < COLS; k += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const a = face[k][r];
      const b = face[k][r + 1];
      const c = face[k + 1][r];
      const d = face[k + 1][r + 1];
      const band = r % 3 === 1;
      tri(a, c, b, band ? rockDark : rockLight, faceUv);
      tri(c, d, b, band ? rockDark : rockLight, faceUv);
    }
    const a = ledge[k][0];
    const b = ledge[k][1];
    const c = ledge[k + 1][0];
    const d = ledge[k + 1][1];
    tri(a, c, b, turf, ledgeUv);
    tri(c, d, b, turf, ledgeUv);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* The fall's sheet: rows down from the lip, columns across, uv (across,
 * down). `ahead` moves the whole sheet out from the face. */
function sheetGeometry(layout, heightAt, pool, ahead) {
  const { fallX, fallZ, lipY } = layout;
  const ROWS = 28;
  const COLS = 12;
  const top = lipY + 0.4;
  const out = (t) => 2.5 + ahead + 8 * Math.pow(t, 1.5);
  const footX = fallX - out(1);
  const bottom = Math.min(heightAt(footX, fallZ), pool.y) - 0.6;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let r = 0; r <= ROWS; r += 1) {
    const t = r / ROWS;
    const w = 7 + 15 * Math.pow(t, 1.4) + ahead * 0.6;
    for (let c = 0; c <= COLS; c += 1) {
      const s = c / COLS;
      /* A little bow across: the sheet is fuller in the middle. */
      const bow = Math.sin(s * Math.PI) * (0.6 + 1.2 * t);
      pos.push(fallX - out(t) - bow, top + (bottom - top) * t, fallZ + (s - 0.5) * w);
      uv.push(s, t);
    }
  }
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const a = r * (COLS + 1) + c;
      idx.push(a, a + COLS + 1, a + 1, a + 1, a + COLS + 1, a + COLS + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, footX, bottom, height: top - bottom };
}

/* The lip's speed and gravity, for where a parcel of the sheet is. */
const V0 = 3;
const G = 9.8;

function fallMaterial(waves, time, height, seed, envMap) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.86, 0.9, 0.93),
    roughness: 0.3,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMap,
  });
  const uniforms = { uWaves: { value: waves }, uTime: time, uFallH: { value: height }, uSeed: { value: seed } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFall;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFall = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uWaves;
        uniform float uTime;
        uniform float uFallH;
        uniform float uSeed;
        varying vec2 vFall;`)
      .replace('#include <map_fragment>', `
        /* The streaks ride the water. A parcel fallen f metres has been
         * falling tau(f) seconds (free fall from the lip's speed), so the
         * pattern is read at tau minus the time: it moves with the water
         * and stretches as the water speeds up. Reading it at the height
         * minus time times a speed that grows down the sheet, as this did,
         * squeezes the pattern harder every second the map runs, and a
         * minute in the sheet was a lattice of chips. The time is wrapped
         * at a period every sample repeats over. */
        float fallen = vFall.y * uFallH;
        float tau = (sqrt(${(V0 * V0).toFixed(2)} + ${(2 * G).toFixed(2)} * max(fallen, 0.0)) - ${V0.toFixed(2)}) / ${G.toFixed(2)};
        float run = (tau - mod(uTime, 45.0)) * 8.0;
        float across = vFall.x * 15.0 + uSeed;
        vec2 q = vec2(across, run);
        float ropes = texture2D(uWaves, vec2(q.x / 5.0, q.y / 40.0)).a;
        float fine = texture2D(uWaves, vec2(q.x / 1.1, q.y / 9.0)).a;
        float spray = texture2D(uWaves, vec2(q.x / 0.6, q.y / 2.5)).a;
        /* Staubbach's way down: glassy ropes off the lip, torn into a
         * white veil by a third of the way, thinning to blown spray
         * with ragged edges at the foot. */
        float spread = smoothstep(0.0, 0.45, vFall.y);
        float blown = smoothstep(0.45, 1.0, vFall.y);
        float body = smoothstep(0.46 - 0.3 * spread, 0.7 - 0.22 * spread, ropes * 0.6 + fine * 0.4);
        float ragged = 0.1 + 0.18 * spread + 0.12 * (fine - 0.5);
        float edge = smoothstep(0.0, ragged, vFall.x) * smoothstep(1.0, 1.0 - ragged, vFall.x);
        float a = body * edge * mix(0.95, 0.42, spread) * mix(1.0, 0.4, blown) * (0.45 + 0.55 * spray);
        a *= smoothstep(0.0, 0.02, vFall.y) * (1.0 - smoothstep(0.9, 1.0, vFall.y));
        diffuseColor.a = a;
        diffuseColor.rgb *= 0.88 + 0.2 * fine;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          vec3 wn = texture2D(uWaves, vec2(q.x / 1.1, q.y / 9.0)).xyz * 2.0 - 1.0;
          normal = normalize(normal + (viewMatrix * vec4(wn.x, wn.y, 0.0, 0.0)).xyz * 0.6);
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        /* Aerated water scatters light right through the sheet. */
        #if NUM_DIR_LIGHTS > 0
          reflectedLight.directDiffuse += directionalLights[0].color * material.diffuseColor * 0.22;
        #endif`);
  };
  mat.customProgramCacheKey = () => 'swiss2-fall';
  return mat;
}

/*
 * Soft sprites that rise, spread and fade on their own cycles: `count`
 * of them round `centre`, `spread` metres out, climbing `rise` metres
 * over a `life` second cycle, from size s0 to s1, at `opacity`. Lit flat
 * by `light` (linear), which the map sets from its sky and sun.
 */
function mist({ waves, time, wind, centre, count, spread, rise, life, s0, s1, opacity, light, seed }) {
  const rng = makeRng(seed);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let k = 0; k < count * 4; k += 1) {
    seeds[k] = rng();
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uWaves: { value: waves },
      uTime: time,
      uWind: { value: wind },
      uCentre: { value: centre },
      uShape: { value: new THREE.Vector4(spread, rise, life, opacity) },
      uSize: { value: new THREE.Vector2(s0, s1) },
      uLight: { value: light },
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 1 },
      fogFar: { value: 1000 },
      fogDensity: { value: 0.00025 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec2 uWind;
      uniform vec3 uCentre;
      uniform vec4 uShape;
      uniform vec2 uSize;
      varying vec2 vUv;
      varying float vFade;
      varying vec2 vSeed;
      void main() {
        float age = fract(uTime / uShape.z + aSeed.x);
        float ang = aSeed.y * 6.2831853;
        float r = uShape.x * (0.25 + 0.75 * sqrt(aSeed.z)) * (0.6 + 0.8 * age);
        vec3 p = uCentre + vec3(cos(ang) * r, uShape.y * age * (0.4 + 0.6 * aSeed.w), sin(ang) * r);
        p.xz += uWind * age * uShape.y * 0.6;
        float size = mix(uSize.x, uSize.y, age) * (0.7 + 0.6 * aSeed.w);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        mvPosition.xy += position.xy * size;
        gl_Position = projectionMatrix * mvPosition;
        vUv = position.xy * 0.5 + 0.5;
        vFade = sin(age * 3.14159) * (0.6 + 0.4 * aSeed.z);
        vSeed = aSeed.zw;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uWaves;
      uniform vec4 uShape;
      uniform vec3 uLight;
      varying vec2 vUv;
      varying float vFade;
      varying vec2 vSeed;
      void main() {
        vec2 c = vUv * 2.0 - 1.0;
        float d = dot(c, c);
        float puff = texture2D(uWaves, vUv * 0.35 + vSeed).a;
        float a = (1.0 - smoothstep(0.1, 1.0, d)) * smoothstep(0.15, 0.75, puff) * vFade * uShape.w;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uLight, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

/*
 * The whole fall into `group`: returns the pieces' disposers and the
 * sheet's foot, where the pool churns.
 */
export async function buildFall({ heightAt, layout, waves, time, wind, envMap, group, rock, light }) {
  const pool = layout.pool;
  const wall = new THREE.Mesh(headwallGeometry(heightAt, layout), new THREE.MeshStandardMaterial({
    map: rock.map, normalMap: rock.normalMap, vertexColors: true, roughness: 0.92, metalness: 0, envMap,
  }));
  wall.name = 'swiss2-headwall';
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);
  const sheets = [];
  for (const [ahead, seed] of [[0, 0.0], [1.1, 3.7]]) {
    const s = sheetGeometry(layout, heightAt, pool, ahead);
    const m = new THREE.Mesh(s.geometry, fallMaterial(waves, time, s.height, seed, envMap));
    m.name = 'swiss2-fall';
    m.renderOrder = 1;
    group.add(m);
    sheets.push(s);
  }
  const foot = new THREE.Vector3(sheets[0].footX - 1, sheets[0].bottom + 0.5, layout.fallZ);
  /* The mist boils up a few metres out from the face: its sprites are
   * flat, and centred on the sheet they cut into the rock behind in a
   * hard line. */
  const mistAt = foot.clone().setX(foot.x - 4);
  /* A thin cloud, not a ball: spray at the foot is lit through and the
   * cliff shows behind it, and the wind carries it off the fall. */
  const cloud = mist({
    waves, time, wind, centre: mistAt, count: 260, spread: 22, rise: 48, life: 10, s0: 4, s1: 22, opacity: 0.04, light, seed: 71,
  });
  const spray = mist({
    waves, time, wind, centre: mistAt, count: 140, spread: 7, rise: 9, life: 2.2, s0: 1.2, s1: 4.5, opacity: 0.1, light, seed: 73,
  });
  cloud.name = 'swiss2-mist';
  spray.name = 'swiss2-spray';
  group.add(cloud, spray);
  return {
    foot,
    height: sheets[0].height,
    dispose() {
      wall.geometry.dispose();
      wall.material.dispose();
      for (const m of group.children) {
        if (m.name === 'swiss2-fall' || m.name === 'swiss2-mist' || m.name === 'swiss2-spray') {
          m.geometry.dispose();
          m.material.dispose();
        }
      }
    },
  };
}
