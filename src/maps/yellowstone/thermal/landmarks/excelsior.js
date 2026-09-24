/*
 * excelsior.js: Excelsior Geyser Crater, on the Firehole in the Midway
 * Geyser Basin.
 *
 * The crater a geyser blew out in the 1880s, about 90 by 60 m, its walls a
 * few metres of grey white sinter stained orange and rust where the water
 * has run, round a boiling turquoise pool that pours four thousand gallons
 * a minute out through channels in the rim and down the bank into the
 * river, under a steam cloud thick enough to hide the far side.
 *
 * The walls are built to stand in front of whatever the elevation data
 * makes of the crater. Where the ground already drops inside the rim (the
 * 10 m hero tiles hold a hole that size), each bearing is marched inward to
 * where the ground reaches the floor, a shelf is laid at rim height over
 * the smoothed slope and a steep face dropped from it to the water there;
 * where it does not, the crater is built up as a raised rim round water
 * lifted a little over the ground. Either way every vertex is at or above
 * the ground.
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
import { paintMaterial, LAYER } from '../paint.js';
import { SteamBuilder } from '../steam.js';
import { hash01 } from '../schedule.js';
import { patch, ellipseCells, runoffDir, rockMaterial } from './kit.js';

const A = 45;
const B = 30;
const SEGS = 64;

/* Boiling water: turquoise over a deep blue throat, churned white where the
 * vents break the surface, moving on the wall clock. Shared with the
 * crater pools of other landmarks. */
export const BOIL_GLSL = /* glsl */ `
  vec3 boil(vec2 w, float u, float t) {
    vec3 c = mix(ysRgb(0.10, 0.36, 0.58), ysRgb(0.33, 0.66, 0.72), smoothstep(0.15, 0.7, u));
    float churn = ysNoise(w * 0.35 + vec2(t * 0.6, -t * 0.45)) * ysNoise(w * 0.9 - vec2(t * 0.9, t * 0.3));
    c = mix(c, ysRgb(0.86, 0.94, 0.95), smoothstep(0.32, 0.5, churn) * (1.0 - smoothstep(0.6, 0.95, u)));
    return c;
  }
`;

export function buildExcelsior(env, f) {
  const { heightAt } = env;
  const { x, z } = f;
  const dir = runoffDir(env.rivers, x, z, 0);
  /* The long axis runs along the river's bank. */
  const turn = dir.river ? Math.atan2(dir.river.dir.z, dir.river.dir.x) : 0.3;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const at = (a, k) => {
    const lx = Math.cos(a) * A * k * (1 + 0.05 * Math.sin(3 * a + 1.1) + 0.03 * Math.sin(7 * a));
    const lz = Math.sin(a) * B * k * (1 + 0.05 * Math.sin(3 * a + 1.1) + 0.03 * Math.sin(7 * a));
    return { x: x + lx * c - lz * s, z: z + lx * s + lz * c };
  };
  const group = new THREE.Group();
  group.name = 'excelsior';

  const rimYs = [];
  let floor = heightAt(x, z);
  for (let k = 0; k < SEGS; k += 1) {
    const p = at((k / SEGS) * Math.PI * 2, 1.04);
    rimYs.push(heightAt(p.x, p.z));
    const q = at((k / SEGS) * Math.PI * 2, 0.45);
    floor = Math.min(floor, heightAt(q.x, q.z));
  }
  const sorted = [...rimYs].sort((p, q) => p - q);
  const rim = sorted[Math.floor(sorted.length / 2)];
  const sunk = rim - floor > 1.5;
  const waterY = sunk ? floor + 0.4 : Math.max(floor, ...rimYs) + 0.3;
  const top = sunk ? rim + 0.3 : waterY + 2.6;

  /* The wall: per bearing, the scale at which it drops to the water, then
   * rows from the outside of the lip over the top and down the face. */
  const pos = [];
  const col = [];
  const idx = [];
  const colour = new THREE.Color();
  const ROWS = 7;
  const rows = [];
  for (let k = 0; k < SEGS; k += 1) {
    const a = (k / SEGS) * Math.PI * 2;
    let face = 0.97;
    if (sunk) {
      for (let kk = 1.0; kk > 0.5; kk -= 0.01) {
        const p = at(a, kk);
        if (heightAt(p.x, p.z) < waterY + 0.5) {
          face = kk + 0.012;
          break;
        }
      }
    }
    const outerK = sunk ? 1.06 : 1.1;
    const ring = [];
    for (let r = 0; r <= ROWS; r += 1) {
      /* r 0: outside foot on the ground; 1 to 2: the lip; 3 to 7: the face
       * down to below the water. */
      let kk;
      let y;
      const crag = (hash01(k * 31 + r, 5) - 0.5) * 0.35;
      if (r === 0) {
        kk = outerK;
        const p = at(a, kk);
        y = heightAt(p.x, p.z);
      } else if (r <= 2) {
        kk = face + (outerK - face) * (r === 1 ? 0.6 : 0.08);
        y = top + (r === 1 ? 0.15 : 0.35) + crag * 0.4;
      } else {
        const t = (r - 2) / (ROWS - 2);
        kk = face - 0.012 * t + crag * 0.006;
        y = top + 0.3 + (waterY - 0.6 - top - 0.3) * t ** 0.9;
      }
      const p = at(a, kk);
      y = Math.max(y, heightAt(p.x, p.z));
      ring.push(pos.length / 3);
      pos.push(p.x, y, p.z);
      /* Grey white sinter; the face stained rust and orange toward the
       * water, streaked where overflow has run. */
      const streak = hash01(k, 11) > 0.72;
      if (r <= 2) {
        colour.set(r === 0 ? 0xbdb6a6 : 0xe6e1d6);
      } else {
        colour.set(0xd8d2c4).lerp(new THREE.Color(streak ? 0xb8612c : 0x9a6a48), Math.min(1, (r - 2) / 4) * (streak ? 0.9 : 0.55));
      }
      col.push(colour.r, colour.g, colour.b);
    }
    rows.push(ring);
  }
  for (let k = 0; k < SEGS; k += 1) {
    const n = (k + 1) % SEGS;
    for (let r = 0; r < ROWS; r += 1) {
      /* Wound so the lip and the inner face look up and in. */
      idx.push(rows[k][r], rows[k][r + 1], rows[n][r], rows[n][r], rows[k][r + 1], rows[n][r + 1]);
    }
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  wallGeo.setIndex(idx);
  wallGeo.computeVertexNormals();
  const wall = new THREE.Mesh(wallGeo, rockMaterial());
  wall.material.side = THREE.DoubleSide;
  wall.name = 'excelsior-walls';
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  /* The pool: a flat fan at the water, boiling. */
  const waterMat = paintMaterial({
    key: 'excelsior-water',
    cel: { rim: 0.25, rimColor: 0xdfeeff },
    uniforms: { uCentre: { value: new THREE.Vector2(x, z) }, uR: { value: B } },
    glsl: BOIL_GLSL,
    body: /* glsl */ `
      float u = length(vCelWorld.xz - uCentre) / (uR * 1.3);
      paint = boil(vCelWorld.xz, u, uCelTime);
    `,
  });
  const wpos = [x, waterY, z];
  const widx = [];
  for (let k = 0; k < SEGS; k += 1) {
    const p = at((k / SEGS) * Math.PI * 2, 1.0);
    wpos.push(p.x, waterY, p.z);
    widx.push(0, 1 + ((k + 1) % SEGS), 1 + k);
  }
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wgeo.setIndex(widx);
  wgeo.computeVertexNormals();
  const water = new THREE.Mesh(wgeo, waterMat);
  water.name = 'excelsior-pool';
  group.add(water);

  /* The outflow: mats and channels from the rim down to the river. */
  if (dir.river) {
    const lip = at(Math.atan2(-s * dir.x + c * dir.z, c * dir.x + s * dir.z), 1.02);
    const bank = { x: dir.river.x, z: dir.river.z };
    const len = Math.hypot(bank.x - lip.x, bank.z - lip.z);
    const mx = (lip.x + bank.x) / 2;
    const mz = (lip.z + bank.z) / 2;
    const cells = ellipseCells(5, mx, mz, len / 2 + 8, 34, Math.atan2(bank.z - lip.z, bank.x - lip.x));
    const mat = paintMaterial({
      key: 'excelsior-runoff',
      bias: LAYER.patch,
      cel: { rim: 0.1 },
      uniforms: {
        uLip: { value: new THREE.Vector2(lip.x, lip.z) },
        uBank: { value: new THREE.Vector2(bank.x, bank.z) },
        uCentre: { value: new THREE.Vector2(x, z) },
        uAB: { value: new THREE.Vector2(A, B) },
        uTurn: { value: new THREE.Vector2(c, s) },
      },
      body: /* glsl */ `
        vec2 w = vCelWorld.xz;
        vec2 d = uBank - uLip;
        float len = length(d);
        vec2 dd = d / len;
        float along = dot(w - uLip, dd) / len;
        float across = dot(w - uLip, vec2(-dd.y, dd.x));
        /* Inside the crater nothing: the walls and the pool are there. */
        vec2 l = w - uCentre;
        vec2 le = vec2(dot(l, uTurn), dot(l, vec2(-uTurn.y, uTurn.x))) / uAB;
        if (dot(le, le) < 1.0) {
          discard;
        }
        float width = 9.0 + 16.0 * smoothstep(0.0, 1.0, along) + 5.0 * ysNoise(vec2(along * 6.0, 1.0));
        float sheet = 1.0 - smoothstep(width * 0.6, width, abs(across));
        if (sheet <= 0.0 || along < -0.1 || along > 1.05) {
          discard;
        }
        float fingers = ysNoise(vec2(across * 0.35, along * 3.0 + ysNoise(vec2(across * 0.1, along)) * 2.0));
        vec3 orange = ysRgb(0.88, 0.46, 0.14);
        vec3 rust = ysRgb(0.64, 0.28, 0.13);
        vec3 wet = ysRgb(0.80, 0.84, 0.80);
        paint = mix(orange, rust, smoothstep(0.35, 0.75, fingers));
        float channel = smoothstep(0.62, 0.72, ysNoise(vec2(across * 0.22 + 3.0, along * 2.0)));
        paint = mix(paint, wet, channel * 0.75);
        paint = mix(ysRgb(0.84, 0.82, 0.76), paint, smoothstep(0.0, 0.3, sheet));
      `,
    });
    group.add(patch(cells, heightAt, mat, { name: 'excelsior-runoff' }));
  }

  const steam = new SteamBuilder();
  for (let k = 0; k < 7; k += 1) {
    const p = k === 0 ? { x, z } : at((k / 6) * Math.PI * 2, 0.5);
    steam.vent({ x: p.x, y: waterY, z: p.z, spread: 14, count: 7, size: 11, rise: 42, life: 16, tint: 0xe4eff2, alpha: 0.48, rng: env.rng });
  }
  group.add(steam.build(env, { detail: 1, name: 'excelsior-steam' }));

  return {
    id: 'excelsior',
    group,
    update() {},
    particles: steam.count,
    focus: { x, y: waterY, z, r: A, height: 10 },
    sunk,
  };
}

