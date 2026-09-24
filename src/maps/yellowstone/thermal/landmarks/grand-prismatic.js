/*
 * grand-prismatic.js: Grand Prismatic Spring, the largest hot spring in the
 * United States, about 110 m across and 50 m deep, in the Midway Geyser
 * Basin.
 *
 * From the air it is a deep blue eye, the water in its middle too hot and
 * too deep for anything to live in, ringed outward by turquoise, a pale
 * blue green, a band of yellow green and yellow where the water has cooled
 * enough for cyanobacteria, and a thin pale lip of sinter. Past the lip the
 * overflow spreads in a fan of orange and rust bacterial mats combed into
 * fingers by the runoff channels, longest on the side the water drains, to
 * the Firehole River. Steam lies over the pool and takes its colour. The
 * boardwalk runs round the drained side between the spring and the river.
 *
 * All of it is one painted patch on the drape grid: the rings and fingers
 * are worked out per pixel in the shader, so they stay sharp from the
 * boardwalk and from three hundred metres up.
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
import { patch, ellipseCells, boardwalk, runoffDir, poolLevel, levelLift } from './kit.js';

/* A radius, not the inventory's: the spring is the one thing in the park
 * whose size everyone knows. */
const R = 55;

/* The rings, as fractions of the radius, and their colours. Shared with
 * the shader below by string, so the two cannot drift. */
export const GPS_GLSL = /* glsl */ `
  vec3 gpsPool(float u, float n) {
    float e = u + (n - 0.5) * 0.025;
    vec3 c = ysRgb(0.03, 0.19, 0.46);
    c = mix(c, ysRgb(0.06, 0.33, 0.62), smoothstep(0.48, 0.5, e));
    c = mix(c, ysRgb(0.17, 0.55, 0.66), smoothstep(0.62, 0.64, e));
    c = mix(c, ysRgb(0.50, 0.76, 0.68), smoothstep(0.74, 0.76, e));
    c = mix(c, ysRgb(0.74, 0.78, 0.42), smoothstep(0.84, 0.86, e));
    c = mix(c, ysRgb(0.91, 0.77, 0.31), smoothstep(0.915, 0.93, e));
    c = mix(c, ysRgb(0.93, 0.62, 0.22), smoothstep(0.965, 0.98, e));
    return c;
  }
`;

export function buildGrandPrismatic(env, f) {
  const { heightAt } = env;
  const { x, z } = f;
  const dir = runoffDir(env.rivers, x, z, Math.PI * 0.25);
  const turn = Math.atan2(dir.z, dir.x);
  const group = new THREE.Group();
  group.name = 'grand-prismatic';

  const wobble = (a) => 1 + 0.035 * Math.sin(3 * a + 1.3) + 0.025 * Math.sin(7 * a + 0.2);
  const unit = (px, pz) => {
    const dx = px - x;
    const dz = pz - z;
    return Math.hypot(dx, dz) / (R * wobble(Math.atan2(dz, dx)));
  };
  const level = poolLevel(heightAt, x, z, R) + 0.05;

  const mat = paintMaterial({
    key: 'grand-prismatic',
    bias: LAYER.patch,
    cel: { rim: 0.12, rimColor: 0xdfeeff },
    uniforms: {
      uCentre: { value: new THREE.Vector2(x, z) },
      uDir: { value: new THREE.Vector2(dir.x, dir.z) },
      uR: { value: R },
      uRiver: { value: dir.river ? dir.river.d - dir.river.w / 2 - 3 : 1e5 },
    },
    glsl: GPS_GLSL,
    body: /* glsl */ `
      vec2 d = vCelWorld.xz - uCentre;
      float r = length(d);
      float ang = atan(d.y, d.x);
      float wob = 1.0 + 0.035 * sin(3.0 * ang + 1.3) + 0.025 * sin(7.0 * ang + 0.2);
      float u = r / (uR * wob);
      float toward = dot(d / max(r, 0.001), uDir);
      float n = ysNoise(vec2(ang * 9.0, u * 3.0));
      if (u < 1.0) {
        paint = gpsPool(u, n);
      } else {
        /* How far the mats reach at this bearing, in radii past the lip:
         * a long fan down the drainage, a short fringe elsewhere. */
        float down = pow(max(0.0, toward), 1.4);
        float reach = 0.22 + 1.3 * down * (0.65 + 0.35 * ysNoise(vec2(ang * 4.0, 2.0)));
        /* The mats end at the river's bank: the water that reaches it
         * goes into it. */
        reach = min(reach, uRiver / max(toward, 0.05) / uR - 1.0);
        float past = u - 1.0;
        /* Fingers: the channels the runoff has combed the mat into. */
        float comb = ysNoise(vec2(ang * (26.0 + 10.0 * down), past * 1.6 + ysNoise(vec2(ang * 3.0, past)) * 1.2));
        float edge = reach * (0.75 + 0.5 * comb);
        vec3 lip = ysRgb(0.90, 0.88, 0.82);
        vec3 orange = ysRgb(0.90, 0.47, 0.13);
        vec3 rust = ysRgb(0.71, 0.29, 0.12);
        vec3 brown = ysRgb(0.50, 0.33, 0.20);
        vec3 sinter = ysRgb(0.82, 0.80, 0.74);
        float along = past / max(edge, 0.05);
        vec3 matc = mix(orange, rust, smoothstep(0.15, 0.6, along));
        matc = mix(matc, brown, smoothstep(0.65, 1.0, along));
        /* The wet channels themselves run paler, a sheet of water over
         * yellow mat. */
        float channel = smoothstep(0.7, 0.82, comb) * (1.0 - smoothstep(0.8, 1.0, along));
        matc = mix(matc, ysRgb(0.93, 0.72, 0.36), channel * 0.7);
        paint = mix(matc, sinter, smoothstep(0.92, 1.05, along));
        paint = mix(lip, paint, smoothstep(0.012, 0.035, past));
        /* The patch ends raggedly in the basin's own sinter. */
        float outer = past - edge - 0.35 - 0.3 * ysNoise(vCelWorld.xz * 0.05);
        if (outer > 0.0) {
          discard;
        }
      }
    `,
  });
  /* The patch: a circle round the pool and a lobe down the drainage. */
  const cells = ellipseCells(5, x + dir.x * R * 0.9, z + dir.z * R * 0.9, R * 2.9, R * 2.2, turn);
  for (const k of ellipseCells(5, x, z, R * 1.9).cells) {
    cells.cells.add(k);
  }
  group.add(patch(cells, heightAt, mat, { name: 'grand-prismatic-spring', lift: levelLift(heightAt, level, unit, 0.6) }));

  /* Steam: a low sheet over the whole pool, lit blue green from below, and
   * thicker on the downwind side. */
  const steam = new SteamBuilder();
  for (let k = 0; k < 9; k += 1) {
    const a = (k / 9) * Math.PI * 2;
    const rr = k === 0 ? 0 : R * 0.55;
    steam.vent({
      x: x + Math.cos(a) * rr, y: level - 2, z: z + Math.sin(a) * rr, spread: R * 0.4, count: 5, size: 15, rise: 18, life: 18,
      tint: 0xd4e8ef, alpha: 0.32, rng: env.rng,
    });
  }
  group.add(steam.build(env, { detail: 1, name: 'grand-prismatic-steam', squash: 0.55 }));

  /* The boardwalk: round the drained side of the spring, between it and
   * the river. */
  const walkR = R * 1.32;
  const pts = [];
  for (let k = 0; k <= 24; k += 1) {
    const a = turn - 1.3 + (k / 24) * 2.6;
    pts.push({ x: x + Math.cos(a) * walkR, z: z + Math.sin(a) * walkR });
  }
  /* No spur to the river: on the real ground the straight line to the
   * bank crosses Excelsior's crater, and a boardwalk that follows the
   * ground went down into it. roads.json has the real route. */
  group.add(boardwalk(heightAt, pts, { width: 2.6, clear: 0.45, name: 'grand-prismatic-boardwalk' }));
  return {
    id: 'grand-prismatic',
    group,
    update() {},
    particles: steam.count,
    focus: { x, y: level, z, r: R * 2, height: 20 },
  };
}
