/*
 * fall.js: the waterfall off the hanging valley's lip, the cliff it
 * falls down, and the mist at its foot.
 *
 * THE HEADWALL is the ground's own: swiss2's terrain (../terrain.js,
 * the fall's bay) stands a sheer face three hundred metres tall where
 * the alps' lip was, drawn and collided as the ground, and the fall
 * leaves its rim. What is drawn here over it is the water's mark on it:
 * a film that lies on the face down the fall's line, dark and glossy
 * where the rock is wet, threaded white where water runs on it, leaning
 * downwind with the veil and spreading wide round the foot where the
 * spray soaks everything.
 *
 * THE APRON is what the Staubbach's lower part runs down: at the face's
 * foot a cone of stepped rock, and the water runs down its ledges in
 * white cascades into the pool. The heightfield's cells cannot hold
 * ledges a few metres high, so the apron is drawn here, in the valley's
 * photographed rock, and has no collider: it stands at most a few tens
 * of metres out from the face, on the ground, and a craft flying into
 * it meets the ground's talus and the face within them. Where the spray
 * reaches, the ledges and the crags that face up are moss green.
 *
 * THE FALL is the Staubbach's kind: a thin veil the wind blows about,
 * most of it gone to drifting spray long before the foot. A sheet from
 * the rim to the apron, standing clear of the face and bellying
 * out as it drops, narrow at the lip and fanning out, in two layers a
 * metre apart, leaning downwind and swaying. Its streaks are the wave
 * texture's height pulled long and scrolled down, accelerating as water
 * does, so the sheet is glassy ropes near the top, torn streaks with the
 * rock showing between them lower down, and gone to drizzle well above
 * the foot. A third sheet, far wider, is the plume the veil tears into:
 * most of the fall's light, as in the photographs, bright and billowing
 * and fuller the further down, and blown further downwind than the
 * water, so the fall leans off its own line as the Staubbach does.
 *
 * THE CASCADE is a skin of white water over the apron's middle, braided
 * into channels that wander down it, sheeting white off the risers and
 * churning on the treads.
 *
 * THE MIST is a few hundred soft sprites boiling off where the veil
 * lands and rising a good way back up the face beside the fall,
 * drifting along the wall, each on its own cycle in the shader, larger
 * and fainter as it rises, a close burst where the veil lands, and a low
 * drift of spray over the cascade and the pool.
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
import { BAY } from '../terrain.js';

/*
 * The apron's surface: s across it from -1 to 1, t up it from the toe in
 * the pool (0) to the crest against the face (1). A buttress of ledges,
 * CREST metres over the pool at the face and standing TOE metres out at
 * its foot, lower and shallower toward its sides, where it sinks into the
 * face's foot under the ground. Each column is a line of constant z, as
 * the film's are. Each step is a riser (the height is climbed while
 * the face stays put) and then a tread (the face steps back while the
 * height stays), the steps uneven in height and their phase wandering
 * across the apron, so the ledges slant, break and overlap and are never
 * a staircase.
 */
const APRON = { crest: 58, toe: 28, halfW: 56, steps: 11 };

export function apronShape(layout) {
  const { fallZ, faceDx, pool } = layout;
  const toeY = pool.y - 2;
  return (s, t) => {
    const lat = Math.max(0, 1 - Math.pow(Math.abs(s), 1.6));
    const z = fallZ + s * APRON.halfW;
    /* Against the face's toe: the rim stands at nature.js's face line
     * and the face reaches the ground BAY.face metres out from it. */
    const face = valleyAxis(z) + faceDx(z) + 1 - BAY.face;
    /* Uneven steps: t is warped before it is cut into steps, and the cut
     * is shifted along the apron by as much as two steps. */
    const warp = t + 0.05 * Math.sin(t * 23 + s * 3) + 0.04 * (noise2(t * 6 + 1.3, s * 2 + 7.7) - 0.5);
    const u = Math.max(0, warp * APRON.steps + 2.2 * (noise2(s * 1.7 + 4.1, 1.7) - 0.5) + 0.9 * (noise2(s * 6.3, 5.1) - 0.5) + 0.45 * (noise2(s * 15 + 3.3, 9.7) - 0.5));
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

/* The apron's triangles: position, uv and the
 * colour multiplier. */
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

/* The apron's geometry, with uv in metres over the photographed rock
 * and a colour multiplier for its weathering. */
function apronGeometry(layout) {
  const pos = [];
  const uv = [];
  const col = [];
  /* Weathering at the scale of tens of metres, so the texture's repeat
   * does not read, and the dark streaks water leaves down limestone. */
  const tri = (a, b, c, colour, uvOf) => {
    for (const p of [a, b, c]) {
      const streak = 0.72 + 0.4 * noise2(p[2] / 8 + 3.1, p[1] / 90 + 0.7);
      const w = (0.72 + 0.5 * noise2(p[2] / 37 + 1.3, p[1] / 23 + 7.1) - 0.12 * noise2(p[2] / 9, p[1] / 9)) * streak;
      pos.push(...p);
      uv.push(...uvOf(p));
      col.push(colour[0] * w, colour[1] * w, colour[2] * w);
    }
  };
  apronTriangles(layout, tri);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/*
 * The water's film on the face: columns along z either side of the fall,
 * each a run of points up the face from its foot to the rim, found on
 * the ground a craft meets (heightAt) and stood FILM metres proud of it,
 * so the film is the face's own shape and never stands off it. uv is
 * (z, height) in metres.
 */
const FILM = 0.3;
function filmGeometry(heightAt, layout, halfW, footY) {
  const { fallZ, faceDx, lipY } = layout;
  const COLS = Math.round((2 * halfW) / 3);
  const ROWS = 48;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let c = 0; c <= COLS; c += 1) {
    const z = fallZ - halfW + (2 * halfW * c) / COLS;
    const rim = valleyAxis(z) + faceDx(z) + 1;
    /* Up the ground at z from well out on the floor to the rim, as a
     * table of (x, height), rising: the film's points are read off it. */
    const run = [];
    for (let x = rim - BAY.face - 40; x <= rim + 2; x += 0.5) {
      run.push([x, heightAt(x, z)]);
    }
    const bottom = Math.max(footY, run[0][1]);
    const top = Math.min(lipY, run[run.length - 1][1]) - 0.3;
    let q = 0;
    for (let r = 0; r <= ROWS; r += 1) {
      const y = bottom + ((top - bottom) * r) / ROWS;
      while (q < run.length - 2 && run[q + 1][1] < y) {
        q += 1;
      }
      const [x0, y0] = run[q];
      const [x1, y1] = run[q + 1];
      const x = x0 + (x1 - x0) * Math.max(0, Math.min(1, (y - y0) / Math.max(1e-3, y1 - y0)));
      /* Proud of the ground along its normal: the face leans back, so
       * out along -x and a little up. */
      const slope = (y1 - y0) / (x1 - x0);
      const n = 1 / Math.hypot(1, slope);
      pos.push(x - FILM * slope * n, y + FILM * n, z);
      uv.push(z, y);
    }
  }
  for (let c = 0; c < COLS; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const a = c * (ROWS + 1) + r;
      /* Wound to face out of the rock, toward the valley. */
      idx.push(a, a + ROWS + 1, a + 1, a + 1, a + ROWS + 1, a + ROWS + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/*
 * How far out from the rim (layout.fallX) the veil stands, `fallen`
 * metres under it, as sheetOut(ahead, fallen): it leaves the rim at a
 * walk and bellies out as it drops, and comes to the apron's ledges
 * three quarters of the way down; and it is never nearer the face than
 * CLEAR metres, the face as the ground a craft meets draws it across
 * the veil's width. The terrain's ten metre cells draw the face's
 * fourteen metre slope as a few facets that stand out of it by metres,
 * and the veil hung by the curve alone went into the rock half way down
 * and was cut off along it. CLEAR holds the plume, three metres further
 * out, and the vertex shader's lean of up to three metres into the face.
 */
const CLEAR = 4;
function sheetOutFor(heightAt, layout, halfW) {
  const { fallX, fallZ, lipY } = layout;
  const STEP = 2;
  const face = [];
  for (let f = 0; f <= lipY - layout.pool.y + 2; f += STEP) {
    const y = lipY - f;
    let out = 0;
    for (let dz = -halfW; dz <= halfW; dz += 4) {
      /* In from well out on the floor until the ground stands at y. */
      let x = fallX - 60;
      while (x < fallX + 20 && heightAt(x, fallZ + dz) < y) {
        x += 0.5;
      }
      out = Math.max(out, fallX - x);
    }
    face.push(out);
  }
  return (ahead, fallen) => {
    const k = Math.max(0, Math.min(face.length - 1, Math.round(fallen / STEP)));
    return ahead + Math.max(2.5 + 5 * Math.pow(Math.max(0, fallen) / 100, 1.5), face[k] + CLEAR);
  };
}

/* The fall's sheet: rows down from the lip to `bottom`, columns across,
 * uv (across, down). `ahead` moves the whole sheet out from the face; it
 * is `topW` metres wide at the lip and `footW` where it lands, widening
 * as the fall's height to the power `flare`. */
function sheetGeometry(layout, bottom, ahead, topW, footW, flare) {
  const { fallX, fallZ, lipY, sheetOut } = layout;
  const ROWS = 28;
  const COLS = 12;
  const top = lipY + 0.4;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let r = 0; r <= ROWS; r += 1) {
    const t = r / ROWS;
    const y = top + (bottom - top) * t;
    /* Narrow off the lip and holding together for the first part of
     * the drop, then spreading as it tears (flare over 1 holds it longer):
     * spread evenly from the lip it was a white cone. */
    const w = topW + (footW - topW) * Math.pow(t, flare) + ahead * 0.6;
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
 * Where the veil lands on the apron: the highest height at which the
 * apron's middle, under the veil as far out from the rim as it has
 * bellied, has come up to meet it. Returns the height and the apron's t
 * there. The apron's middle climbs as it goes in toward the face, so the
 * ground under the veil is the highest of its points no further in.
 */
function landing(layout, apron) {
  const top = layout.lipY + 0.4;
  const profile = [];
  for (let k = 0; k <= 400; k += 1) {
    const t = k / 400;
    profile.push({ t, p: apron(0, t) });
  }
  for (let y = top - 20; y > layout.pool.y; y -= 0.5) {
    const xv = layout.fallX - layout.sheetOut(0, top - y);
    let under = null;
    for (const q of profile) {
      if (q.p[0] <= xv && (!under || q.p[1] > under.p[1])) {
        under = q;
      }
    }
    if (under && under.p[1] >= y) {
      return { y, t: under.t };
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
        uniform float uFallH;
        varying vec2 vFall;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFall = uv;
        if (uMode < 1.5) {
          /* Drift downwind, more the further the water has fallen and
           * the slower the drizzle is, and a sway on two slow gusts. The
           * push into the face is held small so the veil stays off it. */
          float t2 = uv.y * uv.y;
          float gust = 0.6 * sin(uTime * 0.37 + uSeed) + 0.4 * sin(uTime * 0.13 + 1.7 + uSeed * 0.5);
          /* The plume is spray, slower and lighter than the water, and the
           * wind carries it further. */
          float lean = t2 * (7.0 + 4.0 * gust) * (uMode > 0.5 ? 2.4 : 1.0) * clamp(uFallH / 110.0, 1.0, 3.0);
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
        float torn = smoothstep(0.06, 0.3, vFall.y);
        float drizzle = smoothstep(0.22, 0.6, vFall.y);
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
          float chan = smoothstep(0.56, 0.68, braid + 0.07 * centre - 0.05 * vFall.y) * (0.35 + 0.65 * centre);
          float streak = texture2D(uWaves, vec2(c.x / 1.3, c.y / mix(3.5, 11.0, riser))).a;
          float churn = texture2D(uWaves, vec2(c.x / 0.7, c.y / 1.6)).a;
          float edge = smoothstep(0.0, 0.25, vFall.x) * smoothstep(1.0, 0.75, vFall.x);
          /* Threads of white off the risers with the dark wet rock between
           * them, not a sheet: sheeted white on every riser, the apron read
           * as a stack of white bands. */
          float foam = mix(0.25 + 0.6 * smoothstep(0.45, 0.8, churn), smoothstep(0.52, 0.78, streak * 0.7 + churn * 0.3), riser);
          a = chan * edge * (0.06 + 0.6 * foam) * smoothstep(0.0, 0.04, vFall.y);
        } else if (uMode > 0.5) {
          /* The plume: what the veil tears into is most of the fall's
           * light, a broad bright body of spray fuller the further down,
           * its edges billowing. */
          float cloud = texture2D(uWaves, vec2(q.x / 9.0, q.y / 60.0) + 0.37).a;
          float billow = texture2D(uWaves, vec2(q.x / 14.0 + 0.61, q.y / 25.0)).a;
          float body = smoothstep(0.1, 0.65, cloud * 0.55 + fine * 0.2 + billow * 0.25);
          float side = abs(vFall.x - 0.5) * 2.0 + 0.35 * (billow - 0.5);
          float edge = 1.0 - smoothstep(0.15, 0.95, side);
          /* Combed down the fall line: spray falls in long feathers, not
           * as a cloud, until the foot. */
          float comb = texture2D(uWaves, vec2(q.x / 2.2 + 0.19, q.y / 34.0)).a;
          body *= mix(0.35 + 0.9 * smoothstep(0.3, 0.75, comb), 1.0, smoothstep(0.7, 0.95, vFall.y));
          a = body * edge * mix(0.04, 0.34, smoothstep(0.12, 0.8, vFall.y)) * smoothstep(0.06, 0.3, vFall.y) * (1.0 - smoothstep(0.85 + 0.1 * billow, 1.0, vFall.y));
        } else {
          /* Glassy ropes at the lip; below, streaks with gaps between them
           * that widen as the water spreads, so the rock shows through. */
          float strand = ropes * 0.55 + fine * 0.45;
          float body = smoothstep(0.42 + 0.12 * torn, 0.62 + 0.1 * torn, strand);
          float ragged = 0.12 + 0.3 * torn + 0.15 * (fine - 0.5);
          float edge = smoothstep(0.0, ragged, vFall.x) * smoothstep(1.0, 1.0 - ragged, vFall.x);
          /* A white core and thinner, streakier sides: the veil lit
           * evenly across was a solid white fan. */
          float core = mix(0.5, 1.0, 1.0 - smoothstep(0.12, 0.45, abs(vFall.x - 0.5) + 0.1 * (fine - 0.5)));
          /* It ends in the spray, column by column, not on the sheet's
           * last row: that ended every veil on a ruled line. */
          float end = 1.0 - smoothstep(0.5, 0.9, vFall.y + 0.18 * (ropes - 0.5));
          a = body * edge * core * mix(0.9, 0.45, torn) * mix(1.0, 0.25, drizzle) * end * (0.5 + 0.5 * spray);
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
         * reaches down into the pool or the rocks cut a hard line there.
         * Faded over sixteen metres, not six: over six the burst where the
         * veil lands ended in a level white line across the apron. */
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
        a *= smoothstep(-10.0, 6.0, vLift);
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
 * Where the fall has wetted the rock, in world metres, for the apron's
 * rock and the film on the face: a band under the rim as wide as the
 * veil, leaning downwind with it, streaked where the water finds the
 * cracks, and wider round the foot where the spray soaks everything
 * (`wet`); down the fall's own line, water running on the rock in thin
 * white threads (`film` times `thread`), which with the dark wet rock
 * between them is the bright streak down the face under every
 * photograph of the Staubbach; and what faces up within the spray's
 * reach grows moss, thickest just off the water and never in it
 * (`moss`), the green in the photographs that says the rock is never
 * dry. uFall is (the fall's z, the rim's height, the pool's height, how
 * far the veil leans downwind at its foot) and uImpact where it lands.
 */
const WET_PARS = `
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
  }`;
const WET = `
  float wetDown = clamp((uFall.y - vWetW.y) / max(uFall.y - uFall.z, 1.0), 0.0, 1.0);
  float wetHalf = 12.0 + 34.0 * wetDown;
  float wetAcross = abs(vWetW.z - uFall.x - uFall.w * wetDown * wetDown);
  float wetStreak = wetNoise(vec2(vWetW.z / 1.7, vWetW.y / 24.0)) * 0.6 + wetNoise(vec2(vWetW.z / 0.6, vWetW.y / 7.0)) * 0.4;
  float wet = 1.0 - smoothstep(wetHalf * 0.5, wetHalf, wetAcross + 6.0 * (wetStreak - 0.5));
  wet *= 0.55 + 0.45 * smoothstep(0.35, 0.6, wetStreak);
  float soaked = (1.0 - smoothstep(4.0, 22.0, vWetW.y - uFall.z)) * (1.0 - smoothstep(20.0, 50.0, wetAcross)) * 0.8;
  /* and damp well out to either side, where the spray drifts onto it. */
  float damp = (1.0 - smoothstep(wetHalf, wetHalf * 2.4, wetAcross + 10.0 * (wetStreak - 0.5))) * 0.45 * smoothstep(0.08, 0.5, wetDown);
  wet = max(max(wet, soaked), damp) * step(vWetW.y, uFall.y + 0.5);
  float reach = 1.0 - smoothstep(30.0, 70.0, distance(vWetW, uImpact) + 14.0 * (wetNoise(vWetW.zy / 9.0) - 0.5));
  float moss = smoothstep(0.3, 0.75, normalize(vWetN).y) * reach * (1.0 - smoothstep(0.55, 0.9, wet)) * smoothstep(0.3, 0.6, wetNoise(vWetW.xz / 2.3 + vWetW.y / 5.0));
  float film = (1.0 - smoothstep(wetHalf * 0.3, wetHalf * 0.8, wetAcross + 4.0 * (wetStreak - 0.5))) * step(vWetW.y, uFall.y - 0.5);
  float thread = smoothstep(0.5, 0.8, wetNoise(vec2(vWetW.z / 0.8, vWetW.y / 16.0)) * 0.7 + wetNoise(vec2(vWetW.z / 0.3, vWetW.y / 5.0)) * 0.3);`;

function wetUniforms(layout, pool, impact, lean) {
  return {
    uFall: { value: new THREE.Vector4(layout.fallZ, layout.lipY, pool.y, lean) },
    uImpact: { value: impact },
  };
}

function wetVertex(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWetW;\nvarying vec3 vWetN;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWetW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWetN = normalize(mat3(modelMatrix) * objectNormal);');
}

/* The apron's rock: the photographed rock, darkened where wet and
 * mossed where the spray reaches. */
function wetRock(rock, envMap, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    map: rock.map, normalMap: rock.normalMap, vertexColors: true, roughness: 0.92, metalness: 0, envMap,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    wetVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${WET_PARS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>${WET}
        /* No threads here: on the apron the cascade is the water, and
         * threads and a glassy film down every ledge's edge drew the
         * apron as a wire model in white. */
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.16, 0.035), moss);
        diffuseColor.rgb *= 1.0 - 0.7 * wet;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        /* Wet treads are dull under the spray's churn: glossy, they
         * caught the sky as rows of white ribs across the apron. */
        float tread = smoothstep(0.4, 0.8, normalize(vWetN).y);
        roughnessFactor = mix(mix(roughnessFactor, mix(0.42, 0.8, tread), wet), 0.85, moss);`);
  };
  mat.customProgramCacheKey = () => 'swiss2-wet-rock';
  return mat;
}

/* The film on the face: nothing but what the water does to the ground's
 * own rock under it, laid over it: dark and glossy where it is wet, the
 * threads white, and a little green on what faces up in the spray. */
function wetFilm(envMap, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.3, metalness: 0, envMap, transparent: true, depthWrite: false,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    wetVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${WET_PARS}`)
      .replace('#include <map_fragment>', `#include <map_fragment>${WET}
        float runs = film * thread;
        diffuseColor.rgb = mix(mix(vec3(0.015, 0.018, 0.017), vec3(0.08, 0.13, 0.04), moss), vec3(0.6, 0.64, 0.66), runs);
        /* Only on the face: where the film lies on the talus and the
         * floor, the ground's own paint is the wet ground, and a glossy
         * film there caught the sky as a pale sheet. */
        float steep = 1.0 - smoothstep(0.45, 0.75, normalize(vWetN).y);
        diffuseColor.a = max(max(wet * 0.82, moss * 0.5), runs * 0.85) * steep;
        if (diffuseColor.a < 0.004) discard;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.6, 0.2, runs);`);
  };
  mat.customProgramCacheKey = () => 'swiss2-wet-film';
  return mat;
}

/*
 * The whole fall into `group`: returns the pieces' disposers and the
 * sheet's foot, where the pool churns.
 */
export async function buildFall({
  heightAt, layout: laid, waves, time, wind, envMap, group, rock, light, sun = null, lit = (m) => m,
}) {
  /* The veil leaves the rim where the ground a craft meets (and sees)
   * comes up to the lip's height, not nature.js's face line: the
   * terrain's ten metre cells round the rim of the face over a few
   * metres behind the line, and hung from the line the veil's top stood
   * in the air in front of the rock. */
  let rim = laid.fallX - 15;
  while (rim < laid.fallX + 30 && heightAt(rim, laid.fallZ) < laid.lipY - 1) {
    rim += 0.25;
  }
  const layout = { ...laid, fallX: rim };
  layout.sheetOut = sheetOutFor(heightAt, layout, 40);
  const pool = layout.pool;
  const apron = apronShape(layout);
  const land = landing(layout, apron);
  const impact = new THREE.Vector3(layout.fallX - layout.sheetOut(0, layout.lipY + 0.4 - land.y), land.y, layout.fallZ);
  const drop = layout.lipY + 0.4 - land.y;
  /* How far the veil leans downwind at its foot (the vertex shader's
   * lean, at its mean gust), which the wet streak follows. */
  const lean = wind.y * 7 * Math.min(3, Math.max(1, drop / 110));
  const wetting = wetUniforms(layout, pool, impact, lean);
  const wall = new THREE.Mesh(apronGeometry(layout), lit(wetRock(rock, envMap, wetting)));
  wall.name = 'swiss2-apron';
  wall.castShadow = true;
  wall.receiveShadow = true;
  const film = new THREE.Mesh(filmGeometry(heightAt, layout, BAY.half - 2, pool.y - 1), lit(wetFilm(envMap, wetting)));
  film.name = 'swiss2-wet';
  film.receiveShadow = true;
  /* Both into the scene on the first frame drawn (show(), below), after
   * the build's renderer.compile: each of the two wet rock programs
   * compiled there cost the page twelve GL_INVALID_VALUE warnings from
   * Chrome (glGetProgramiv), as the carved rock's BatchedMesh did
   * (swiss2.js; measured by leaving each out), and compiled on their
   * first frame they cost none. finishScene will not see them, so they
   * are lit here (`lit`, light.js). Nothing reads them before: the carved
   * rock keeps off the fall by the layout (vegetation/zones.js keepOff),
   * not by what stands there. */
  /* Two veils a metre apart, and the spray the wind strips off them,
   * wider and further out, all ending on the apron. */
  const parts = [];
  for (const [ahead, seed, mode, topW, footW, flare] of [[0, 0.0, FALL_MODE.veil, 3.5, 8, 2.2], [1.1, 3.7, FALL_MODE.veil, 4.5, 12, 1.8], [3, 7.1, FALL_MODE.haze, 6, 64, 1.2]]) {
    const s = sheetGeometry(layout, land.y - 1.5, ahead, topW, footW, flare);
    const m = new THREE.Mesh(s.geometry, fallMaterial(waves, time, wind, s.height, seed, envMap, mode));
    m.name = 'swiss2-fall';
    m.renderOrder = 1;
    /* The vertex shader leans the sheet downwind by up to eleven metres
     * times the fall's scale (at most three), the plume by twenty six
     * times it, and sways it by one and a half: bounds that reach that
     * far. */
    s.geometry.computeBoundingSphere();
    s.geometry.boundingSphere.radius += (mode === FALL_MODE.haze ? 27 : 11) * Math.min(3, Math.max(1, s.height / 110)) + 2;
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
  /* The Staubbach's cloud: the spray rises half way back up the
   * face and the wind carries it along the wall (z) and a little out
   * from it (-x), never into it, a thin drift beside the fall that
   * spreads and fades as it goes. Round 7's was a white ball: two
   * hundred and forty small sprites lit flat and brightest at the middle
   * of their lives, piled up round the foot. */
  const along = new THREE.Vector2(-0.35, Math.sign(wind.y) || 1).multiplyScalar(0.95);
  const cloud = mist({
    waves, time, wind: along, centre: mistAt, count: 170, spread: 16, rise: 150, life: 34, s0: 6, s1: 56, opacity: 0.026, light: light.clone().multiplyScalar(0.72), seed: 71, sun,
  });
  /* and a low drift of spray down the cascade to the pool. */
  const sprayAt = new THREE.Vector3((impact.x + foot.x) / 2 - 3, (impact.y + foot.y) / 2 - 8, layout.fallZ);
  const spray = mist({
    waves, time, wind, centre: sprayAt, count: 130, spread: 30, rise: 34, life: 7, s0: 5, s1: 32, opacity: 0.026, light: light.clone().multiplyScalar(0.72), seed: 73, sun,
  });
  /* and where the veil lands on the apron, the burst it makes: a close,
   * bright puff standing out from the rock, which hides the line where
   * the sheets meet the ledges as the spray hides it at the real one. */
  const burst = mist({
    waves, time, wind, centre: impact.clone().setX(impact.x - 6), count: 70, spread: 9, rise: 18, life: 5, s0: 7, s1: 22, opacity: 0.035, light: light.clone().multiplyScalar(0.85), seed: 79, sun,
  });
  cloud.name = 'swiss2-mist';
  spray.name = 'swiss2-spray';
  burst.name = 'swiss2-burst';
  group.add(cloud, spray, burst);
  parts.push(cloud, spray, burst);
  return {
    foot,
    height: layout.lipY + 0.4 - land.y,
    show() {
      if (!film.parent) {
        group.add(wall, film);
      }
    },
    dispose() {
      for (const m of [wall, film]) {
        m.geometry.dispose();
        m.material.dispose();
      }
      for (const m of parts) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
