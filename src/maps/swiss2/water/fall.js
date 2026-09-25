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
 * band in every three, and dark and glossy in a band down from the lip
 * where the water runs.
 *
 * THE APRON is what the Staubbach lands on: two thirds of the way down
 * the free fall ends on a cone of stepped rock at the cliff's foot, and
 * the water runs down its ledges in white cascades into the pool. The
 * heightfield's cells cannot hold ledges a few metres high any more than
 * they can hold the face, so the apron is drawn with the headwall, in its
 * mesh and its material, and like it has no collider (it is as far from
 * the strip as the headwall is). Where the spray reaches, the ledges and
 * the crags that face up are moss green.
 *
 * THE FALL is the Staubbach's kind: a thin veil the wind blows about. A
 * sheet from the lip to the apron, standing clear of the face and bellying
 * out as it drops, narrow at the lip and fanning out, in two layers a
 * metre apart, leaning downwind and swaying. Its streaks are the wave
 * texture's height pulled long and scrolled down, accelerating as water
 * does, so the sheet is glassy ropes near the top, torn streaks with the
 * rock showing between them lower down, and gone to drizzle well above
 * the pool. A third sheet, far wider, is the plume the veil tears into:
 * most of the fall's light, as in the photographs, bright and billowing
 * and fuller the further down.
 *
 * THE CASCADE is a skin of white water over the apron's middle, braided
 * into channels that wander down it, sheeting white off the risers and
 * churning on the treads.
 *
 * THE MIST is a few hundred soft sprites boiling off where the veil
 * lands and rising most of the way back up the face beside the fall,
 * drifting along the wall, each on its own cycle in the shader, larger
 * and fainter as it rises, and a low drift of spray over the cascade and
 * the pool.
 *
 * No rainbow: the fixed view looks east at the fall with the sun in the
 * east, 74 degrees from the line of sight, and a bow stands 42 degrees
 * from the point opposite the sun, behind the viewer.
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
import { makeRng, noise2, smoothstep } from '../../alps/noise.js';
import { valleyAxis } from '../../alps/terrain.js';

/*
 * The apron's surface: s across it from -1 to 1, t up it from the toe in
 * the pool (0) to the crest against the face (1). A buttress of ledges,
 * CREST metres over the pool at the face and standing TOE metres out at
 * its foot, lower and shallower toward its sides, where it sinks into the
 * face's foot under the ground. Each column is a line of constant z, as
 * the headwall's are. Each step is a riser (the height is climbed while
 * the face stays put) and then a tread (the face steps back while the
 * height stays), the steps uneven in height and their phase wandering
 * across the apron, so the ledges slant, break and overlap and are never
 * a staircase.
 */
const APRON = { crest: 46, toe: 22, halfW: 52, steps: 9 };

export function apronShape(layout) {
  const { fallZ, faceDx, pool } = layout;
  const toeY = pool.y - 2;
  return (s, t) => {
    const lat = Math.max(0, 1 - Math.pow(Math.abs(s), 1.6));
    const z = fallZ + s * APRON.halfW;
    const face = valleyAxis(z) + faceDx(z) + 1;
    /* Uneven steps: t is warped before it is cut into steps, and the cut
     * is shifted along the apron by as much as two steps. */
    const warp = t + 0.05 * Math.sin(t * 23 + s * 3) + 0.04 * (noise2(t * 6 + 1.3, s * 2 + 7.7) - 0.5);
    const u = Math.max(0, warp * APRON.steps + 2.2 * (noise2(s * 1.7 + 4.1, 1.7) - 0.5) + 1.2 * (noise2(s * 6.3, 5.1) - 0.5) + 1.6 * (noise2(s * 15 + 3.3, 9.7) - 0.5));
    const k = Math.floor(u);
    const f = u - k;
    const rise = Math.min(1, Math.max(0, (k + smoothstep(0, 0.55, f)) / APRON.steps));
    const back = Math.min(1, Math.max(0, (k + smoothstep(0.55, 1, f)) / APRON.steps));
    const crag = 2.2 * (noise2(s * 9.1 + 2.2, t * 7.3 + 0.4) - 0.5) + 0.9 * (noise2(s * 23 + 5.5, t * 19 + 3.1) - 0.5);
    /* Buttresses and bays tens of metres across, so a ledge's edge is
     * never one line round the apron. */
    const bulge = 5 * (noise2(s * 3.1 + 8.3, t * 2.4 + 1.9) - 0.5);
    const y = toeY + APRON.crest * Math.pow(lat, 0.85) * Math.min(1, rise + 0.02 * t) + 0.7 * crag + 2 * bulge * lat * t;
    const x = face - (APRON.toe * (1 - back) + bulge * (1 - t)) * Math.pow(lat, 0.6) - crag * Math.sqrt(lat);
    return [x, y, z];
  };
}

/* The apron's triangles, in the headwall's layout: position, uv and the
 * colour multiplier, a shade darker than the face. */
function apronTriangles(layout, tri) {
  const at = apronShape(layout);
  const COLS = 56;
  const ROWS = APRON.steps * 7;
  const grid = [];
  for (let c = 0; c <= COLS; c += 1) {
    const row = [];
    for (let r = 0; r <= ROWS; r += 1) {
      row.push(at((c / COLS) * 2 - 1, r / ROWS));
    }
    grid.push(row);
  }
  const rock = [1.2, 1.18, 1.14];
  /* Metres over twelve on the face, and the treads mapped from above. */
  const uvOf = (p) => [p[2] / 41, (p[1] + p[0] * 0.8) / 29];
  for (let c = 0; c < COLS; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const a = grid[c][r];
      const b = grid[c][r + 1];
      const d = grid[c + 1][r];
      const e = grid[c + 1][r + 1];
      tri(a, d, b, rock, uvOf);
      tri(d, e, b, rock, uvOf);
    }
  }
}

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
  apronTriangles(layout, tri);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* How far out from the face the veil stands, `fallen` metres under the
 * lip: it leaves the lip at a walk and bellies out as it drops. */
const sheetOut = (ahead, fallen) => 2.5 + ahead + 8 * Math.pow(Math.max(0, fallen) / 100, 1.5);

/* The fall's sheet: rows down from the lip to `bottom`, columns across,
 * uv (across, down). `ahead` moves the whole sheet out from the face; it
 * is `topW` metres wide at the lip and `footW` where it lands. */
function sheetGeometry(layout, bottom, ahead, topW, footW) {
  const { fallX, fallZ, lipY } = layout;
  const ROWS = 28;
  const COLS = 12;
  const top = lipY + 0.4;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let r = 0; r <= ROWS; r += 1) {
    const t = r / ROWS;
    const y = top + (bottom - top) * t;
    /* Narrow off the lip, fanning out fast once the water has torn. */
    const w = topW + (footW - topW) * Math.pow(t, 0.9) + ahead * 0.6;
    for (let c = 0; c <= COLS; c += 1) {
      const s = c / COLS;
      /* A little bow across: the sheet is fuller in the middle. */
      const bow = Math.sin(s * Math.PI) * (0.6 + 1.2 * t);
      pos.push(fallX - sheetOut(ahead, top - y) - bow, y, fallZ + (s - 0.5) * w);
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
  return { geometry: g, height: top - bottom };
}

/*
 * Where the veil lands on the apron: the highest point down its middle
 * that stands as far out from the face as the veil has bellied. Returns
 * the height and the apron's t there.
 */
function landing(layout, apron) {
  const top = layout.lipY + 0.4;
  const profile = [];
  for (let k = 0; k <= 400; k += 1) {
    const t = 1 - k / 400;
    profile.push({ t, p: apron(0, t) });
  }
  for (let y = top - 20; y > layout.pool.y; y -= 0.5) {
    const at = profile.find((q) => q.p[1] <= y);
    if (at && layout.fallX - at.p[0] >= sheetOut(0, top - y)) {
      return { y, t: at.t };
    }
  }
  return { y: layout.pool.y, t: 0 };
}

/*
 * The cascade: a skin over the apron's middle from where the veil lands
 * to the pool, a few tens of centimetres proud of the rock, narrow under
 * the impact and spreading as the water finds its way down. uv is
 * (across, down) and `length` the metres down its middle.
 */
function cascadeGeometry(apron, tTop) {
  const ROWS = 60;
  const COLS = 16;
  const pos = [];
  const uv = [];
  const idx = [];
  let length = 0;
  let last = null;
  for (let r = 0; r <= ROWS; r += 1) {
    const d = r / ROWS;
    const t = tTop * (1 - d);
    const half = 0.08 + 0.34 * Math.pow(d, 0.7);
    const mid = apron(0, t);
    if (last) {
      length += Math.hypot(mid[0] - last[0], mid[1] - last[1]);
    }
    last = mid;
    for (let c = 0; c <= COLS; c += 1) {
      const p = apron((c / COLS * 2 - 1) * half, t);
      pos.push(p[0] - 0.35, p[1] + 0.3, p[2]);
      uv.push(c / COLS, length);
    }
  }
  for (let k = 1; k < uv.length; k += 2) {
    uv[k] /= length;
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
  return { geometry: g, length };
}

/* The lip's speed and gravity, for where a parcel of the sheet is. */
const V0 = 3;
const G = 9.8;

/*
 * The fall's material, in one of three modes. A VEIL is the water
 * itself: glassy ropes off the lip that tear into streaks and thin to
 * blown drizzle by the time they land, so the dark wet rock shows
 * through the lower half. The HAZE is the plume the veil tears into, a
 * wide sheet of spray that starts where the veil tears, hides its edges
 * and thickens toward the foot. Both lean downwind and sway with the gusts: the Staubbach never
 * falls plumb. The CASCADE is the white water down the apron, braided
 * into channels, sheeting off the risers and churning on the treads; it
 * lies on the rock and does not sway.
 */
const FALL_MODE = { veil: 0, haze: 1, cascade: 2 };

function fallMaterial(waves, time, wind, height, seed, envMap, mode) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.86, 0.9, 0.93),
    roughness: 0.3,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMap,
  });
  const uniforms = {
    uWaves: { value: waves }, uTime: time, uFallH: { value: height }, uSeed: { value: seed }, uWind: { value: wind }, uMode: { value: mode },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform vec2 uWind;
        uniform float uSeed;
        uniform float uMode;
        varying vec2 vFall;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFall = uv;
        if (uMode < 1.5) {
          /* Drift downwind, more the further the water has fallen and
           * the slower the drizzle is, and a sway on two slow gusts. The
           * push into the face is held small so the veil stays off it. */
          float t2 = uv.y * uv.y;
          float gust = 0.6 * sin(uTime * 0.37 + uSeed) + 0.4 * sin(uTime * 0.13 + 1.7 + uSeed * 0.5);
          float lean = t2 * (7.0 + 4.0 * gust);
          transformed.z += uWind.y * lean + 1.5 * t2 * sin(uTime * 0.6 + uv.x * 3.0 + uSeed);
          transformed.x += clamp(uWind.x, -1.0, 1.0) * 3.0 * t2;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uWaves;
        uniform float uTime;
        uniform float uFallH;
        uniform float uSeed;
        uniform float uMode;
        varying vec2 vFall;
        float fallHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float fallNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(fallHash(i), fallHash(i + vec2(1.0, 0.0)), u.x), mix(fallHash(i + vec2(0.0, 1.0)), fallHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }`)
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
        /* Where the veil has torn, how far toward drizzle, and where it
         * has all gone to spray. */
        float torn = smoothstep(0.08, 0.35, vFall.y);
        float drizzle = smoothstep(0.3, 0.75, vFall.y);
        float gone = smoothstep(0.9, 1.08, vFall.y);
        float a;
        /* One program for all three, so neither the spray nor the
         * cascade costs a compile of its own. */
        if (uMode > 1.5) {
          /* Down the apron at a steady run, the channels wandering
           * slowly across it and fixed to the rock. */
          vec3 wn = inverseTransformDirection(normalize(vNormal), viewMatrix);
          float riser = 1.0 - smoothstep(0.35, 0.8, wn.y);
          vec2 c = vec2(vFall.x * 24.0 + uSeed, fallen - mod(uTime, 45.0) * 6.0);
          /* Channels a few metres wide that part and join on the way
           * down, fixed to the rock, with dark wet rock between. */
          float across = vFall.x * 26.0;
          float braid = fallNoise(vec2(across / 4.5 + uSeed, fallen / 9.0)) * 0.65 + fallNoise(vec2(across / 1.7, fallen / 4.0 + 3.1)) * 0.35;
          float centre = 1.0 - abs(vFall.x - 0.5) * 2.0;
          float chan = smoothstep(0.52, 0.64, braid + 0.07 * centre - 0.05 * vFall.y);
          float streak = texture2D(uWaves, vec2(c.x / 1.3, c.y / mix(3.5, 11.0, riser))).a;
          float churn = texture2D(uWaves, vec2(c.x / 0.7, c.y / 1.6)).a;
          float edge = smoothstep(0.0, 0.25, vFall.x) * smoothstep(1.0, 0.75, vFall.x);
          float foam = mix(0.3 + 0.7 * smoothstep(0.4, 0.75, churn), smoothstep(0.42, 0.7, streak * 0.7 + churn * 0.3), riser);
          a = chan * edge * (0.12 + 0.8 * foam) * smoothstep(0.0, 0.04, vFall.y);
        } else if (uMode > 0.5) {
          /* The plume: what the veil tears into is most of the fall's
           * light, a broad bright body of spray fuller the further down,
           * its edges billowing. */
          float cloud = texture2D(uWaves, vec2(q.x / 9.0, q.y / 60.0) + 0.37).a;
          float billow = texture2D(uWaves, vec2(q.x / 14.0 + 0.61, q.y / 25.0)).a;
          float body = smoothstep(0.15, 0.7, cloud * 0.55 + fine * 0.2 + billow * 0.25);
          float side = abs(vFall.x - 0.5) * 2.0 + 0.35 * (billow - 0.5);
          float edge = 1.0 - smoothstep(0.25, 0.95, side);
          a = body * edge * mix(0.1, 0.62, smoothstep(0.12, 0.75, vFall.y)) * smoothstep(0.08, 0.3, vFall.y) * (1.0 - smoothstep(0.62 + 0.2 * billow, 0.98, vFall.y));
        } else {
          /* Glassy ropes at the lip; below, streaks with gaps between them
           * that widen as the water spreads, so the rock shows through. */
          float strand = ropes * 0.55 + fine * 0.45;
          float body = smoothstep(0.42 + 0.12 * torn, 0.62 + 0.1 * torn, strand);
          float ragged = 0.12 + 0.3 * torn + 0.15 * (fine - 0.5);
          float edge = smoothstep(0.0, ragged, vFall.x) * smoothstep(1.0, 1.0 - ragged, vFall.x);
          a = body * edge * mix(0.95, 0.6, torn) * mix(1.0, 0.55, drizzle) * (1.0 - gone) * (0.5 + 0.5 * spray);
        }
        a *= smoothstep(0.0, 0.02, vFall.y);
        diffuseColor.a = a;
        diffuseColor.rgb *= 0.9 + 0.18 * fine;`)
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
  mat.userData.fall = uniforms;
  return mat;
}

/*
 * Soft sprites that rise, spread and fade on their own cycles: `count`
 * of them round `centre`, `spread` metres out, climbing `rise` metres
 * over a `life` second cycle, from size s0 to s1, at `opacity`. Lit by
 * the sky, `light` (linear), and by the sun where it reaches them (`sun`,
 * the map's sun at any point, light.js's lit.sun, and its direction and
 * colour), scattered forward as fine spray scatters it: bright looking
 * toward the sun, faint across it. A drift thins as it spreads: each
 * sprite is at its most opaque young and small, and fades as it grows,
 * so the cloud has no core to pile up into a ball.
 */
function mist({ waves, time, wind, centre, count, spread, rise, life, s0, s1, opacity, light, seed, sun }) {
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
      uSunColor: { value: sun ? sun.color : new THREE.Color(0, 0, 0) },
      ...(sun ? sun.at.uniforms : {}),
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 1 },
      fogFar: { value: 1000 },
      fogDensity: { value: 0.00025 },
    },
    vertexShader: /* glsl */ `
      ${sun ? '#define MIST_SUN' : ''}
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec2 uWind;
      uniform vec3 uCentre;
      uniform vec4 uShape;
      uniform vec2 uSize;
      uniform vec3 uLight;
      uniform vec3 uSunColor;
      varying vec2 vUv;
      varying float vFade;
      varying vec2 vSeed;
      varying float vLift;
      varying vec3 vLit;
      ${sun ? sun.at.glsl : ''}
      void main() {
        float age = fract(uTime / uShape.z + aSeed.x);
        float ang = aSeed.y * 6.2831853;
        float r = uShape.x * (0.25 + 0.75 * sqrt(aSeed.z)) * (0.6 + 0.8 * age);
        vec3 p = uCentre + vec3(cos(ang) * r, uShape.y * age * (0.4 + 0.6 * aSeed.w), sin(ang) * r);
        p.xz += uWind * age * uShape.y * 0.6;
        float size = mix(uSize.x, uSize.y, age) * (0.7 + 0.6 * aSeed.w);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        mvPosition.xy += position.xy * size;
        /* How far this corner stands over the foot, near enough for a
         * camera that is not rolled: sprites are flat, and one that
         * reaches down into the pool or the rocks cut a hard line there. */
        vLift = p.y + position.y * size - uCentre.y;
        gl_Position = projectionMatrix * mvPosition;
        vUv = position.xy * 0.5 + 0.5;
        vFade = smoothstep(0.0, 0.12, age) * pow(1.0 - age, 1.6) * (0.6 + 0.4 * aSeed.z);
        vSeed = aSeed.zw;
        vLit = uLight;
        #ifdef MIST_SUN
        {
          /* Henyey and Greenstein's phase, g 0.6, for the sun's light
           * turned toward the eye; the sun past every ridge and cloud. */
          vec3 toEye = normalize(cameraPosition - p);
          float c = dot(-toEye, uS2SunDir);
          float g = 0.6;
          float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) / (4.0 * PI);
          vLit += uSunColor * phase * s2TerrainSun(p) * s2Cloud(p);
        }
        #endif
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uWaves;
      uniform vec4 uShape;
      varying vec2 vUv;
      varying float vFade;
      varying vec2 vSeed;
      varying float vLift;
      varying vec3 vLit;
      void main() {
        vec2 c = vUv * 2.0 - 1.0;
        float d = dot(c, c);
        float puff = texture2D(uWaves, vUv * 0.35 + vSeed).a;
        float a = (1.0 - smoothstep(0.1, 1.0, d)) * smoothstep(0.15, 0.75, puff) * vFade * uShape.w;
        a *= smoothstep(-1.0, 5.0, vLift);
        if (a < 0.003) discard;
        gl_FragColor = vec4(vLit, a);
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
 * The headwall's rock, dark and glossy where the fall runs down it: a
 * band under the lip as wide as the veil, leaning downwind with it,
 * streaked where the water finds the cracks, and wider round the foot
 * where the spray soaks everything. What faces up within the spray's
 * reach (the apron's treads, the crags' tops) grows moss, thickest just
 * off the water and never in it: the green in the photographs that
 * says the rock is never dry. `impact` is where the veil lands.
 */
function wetRock(rock, envMap, layout, pool, impact) {
  const mat = new THREE.MeshStandardMaterial({
    map: rock.map, normalMap: rock.normalMap, vertexColors: true, roughness: 0.92, metalness: 0, envMap,
  });
  const uniforms = {
    uFall: { value: new THREE.Vector4(layout.fallZ, layout.lipY, pool.y, 0) },
    uImpact: { value: impact },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetW;\nvarying vec3 vWetN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWetW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWetN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec4 uFall;
        uniform vec3 uImpact;
        varying vec3 vWetW;
        varying vec3 vWetN;
        float wetHash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float wetNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(wetHash(i), wetHash(i + vec2(1.0, 0.0)), u.x), mix(wetHash(i + vec2(0.0, 1.0)), wetHash(i + vec2(1.0, 1.0)), u.x), u.y);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wetDown = clamp((uFall.y - vWetW.y) / max(uFall.y - uFall.z, 1.0), 0.0, 1.0);
        float wetHalf = 5.0 + 26.0 * wetDown;
        float wetAcross = abs(vWetW.z - uFall.x + 4.0 * wetDown * wetDown);
        float wetStreak = wetNoise(vec2(vWetW.z / 1.7, vWetW.y / 24.0)) * 0.6 + wetNoise(vec2(vWetW.z / 0.6, vWetW.y / 7.0)) * 0.4;
        float wet = 1.0 - smoothstep(wetHalf * 0.5, wetHalf, wetAcross + 6.0 * (wetStreak - 0.5));
        wet *= 0.55 + 0.45 * smoothstep(0.35, 0.6, wetStreak);
        float soaked = (1.0 - smoothstep(4.0, 22.0, vWetW.y - uFall.z)) * (1.0 - smoothstep(20.0, 50.0, wetAcross)) * 0.8;
        wet = max(wet, soaked) * step(vWetW.y, uFall.y + 0.5);
        float reach = 1.0 - smoothstep(30.0, 70.0, distance(vWetW, uImpact) + 14.0 * (wetNoise(vWetW.zy / 9.0) - 0.5));
        float moss = smoothstep(0.3, 0.75, normalize(vWetN).y) * reach * (1.0 - smoothstep(0.55, 0.9, wet)) * smoothstep(0.3, 0.6, wetNoise(vWetW.xz / 2.3 + vWetW.y / 5.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.16, 0.035), moss);
        diffuseColor.rgb *= 1.0 - 0.7 * wet;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(roughnessFactor, 0.42, wet), 0.85, moss);`);
  };
  mat.customProgramCacheKey = () => 'swiss2-wet-rock';
  return mat;
}

/*
 * The whole fall into `group`: returns the pieces' disposers and the
 * sheet's foot, where the pool churns.
 */
export async function buildFall({ heightAt, layout, waves, time, wind, envMap, group, rock, light, sun = null }) {
  const pool = layout.pool;
  const apron = apronShape(layout);
  const land = landing(layout, apron);
  const impact = new THREE.Vector3(layout.fallX - sheetOut(0, layout.lipY + 0.4 - land.y), land.y, layout.fallZ);
  const wall = new THREE.Mesh(headwallGeometry(heightAt, layout), wetRock(rock, envMap, layout, pool, impact));
  wall.name = 'swiss2-headwall';
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);
  /* Two veils a metre apart, and the spray the wind strips off them,
   * wider and further out, all ending on the apron. */
  const parts = [];
  for (const [ahead, seed, mode, topW, footW] of [[0, 0.0, FALL_MODE.veil, 4, 26], [1.1, 3.7, FALL_MODE.veil, 5, 32], [3, 7.1, FALL_MODE.haze, 7, 72]]) {
    const s = sheetGeometry(layout, land.y - 1.5, ahead, topW, footW);
    const m = new THREE.Mesh(s.geometry, fallMaterial(waves, time, wind, s.height, seed, envMap, mode));
    m.name = 'swiss2-fall';
    m.renderOrder = 1;
    /* The vertex shader leans the sheet downwind by up to eleven metres
     * and sways it by one and a half: bounds that reach that far. */
    s.geometry.computeBoundingSphere();
    s.geometry.boundingSphere.radius += 13;
    group.add(m);
    parts.push(m);
  }
  const run = cascadeGeometry(apron, land.t);
  const cascade = new THREE.Mesh(run.geometry, fallMaterial(waves, time, wind, run.length, 1.3, envMap, FALL_MODE.cascade));
  cascade.name = 'swiss2-cascade';
  cascade.renderOrder = 1;
  group.add(cascade);
  parts.push(cascade);
  const toe = apron(0, 0);
  const foot = new THREE.Vector3(toe[0] - 2, pool.y + 0.5, layout.fallZ);
  /* The mist boils off where the veil lands, a few metres out from the
   * rock: its sprites are flat, and centred on the rock they cut into it
   * in a hard line. A thin cloud, not a ball: spray is lit through and
   * the cliff shows behind it, and the wind carries it off the fall. */
  const mistAt = impact.clone().setX(impact.x - 7);
  mistAt.z += wind.y * 4;
  /* The Staubbach's cloud: the spray rises most of the way back up the
   * face and the wind carries it along the wall (z) and a little out
   * from it (-x), never into it, a thin drift beside the fall that
   * spreads and fades as it goes. Round 7's was a white ball: two
   * hundred and forty small sprites lit flat and brightest at the middle
   * of their lives, piled up round the foot. */
  const along = new THREE.Vector2(-0.35, Math.sign(wind.y) || 1).multiplyScalar(0.95);
  const cloud = mist({
    waves, time, wind: along, centre: mistAt, count: 150, spread: 12, rise: 70, life: 26, s0: 5, s1: 38, opacity: 0.022, light: light.clone().multiplyScalar(0.72), seed: 71, sun,
  });
  /* and a low drift of spray down the cascade to the pool. */
  const sprayAt = new THREE.Vector3((impact.x + foot.x) / 2 - 3, (impact.y + foot.y) / 2 - 8, layout.fallZ);
  const spray = mist({
    waves, time, wind, centre: sprayAt, count: 120, spread: 22, rise: 20, life: 6, s0: 4, s1: 20, opacity: 0.016, light: light.clone().multiplyScalar(0.72), seed: 73, sun,
  });
  cloud.name = 'swiss2-mist';
  spray.name = 'swiss2-spray';
  group.add(cloud, spray);
  parts.push(cloud, spray);
  return {
    foot,
    height: layout.lipY + 0.4 - land.y,
    dispose() {
      wall.geometry.dispose();
      wall.material.dispose();
      for (const m of parts) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
