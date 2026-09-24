/*
 * morning-glory.js: Morning Glory Pool, at the far end of the Upper Geyser
 * Basin's boardwalk.
 *
 * Named for the flower it looked like: a funnel of water seven metres deep
 * under a scalloped sinter rim. It was a clear deep blue until visitors had
 * thrown enough into it to choke its vent; the water cooled, and the
 * bacteria that live in cooler water ringed it in green, yellow and a broad
 * band of orange, which is how it looks now and how it is built here: a
 * narrow blue green throat, then green, yellow and orange to the rim.
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
import { patch, ellipseCells, boardwalk, poolLevel, levelLift, runoffDir } from './kit.js';

export function buildMorningGlory(env, f) {
  const { heightAt } = env;
  const { x, z } = f;
  const R = Math.max(3, Math.min(6, f.r ?? 4.5));
  const group = new THREE.Group();
  group.name = 'morning-glory';
  const petals = (a) => 1 + 0.045 * Math.cos(a * 5 + 0.3) + 0.02 * Math.sin(a * 11);
  const unit = (px, pz) => Math.hypot(px - x, pz - z) / (R * petals(Math.atan2(pz - z, px - x)));
  const level = poolLevel(heightAt, x, z, R) + 0.04;
  const dir = runoffDir(env.rivers, x, z, 0);
  const mat = paintMaterial({
    key: 'morning-glory',
    bias: LAYER.patch,
    cel: { rim: 0.14, rimColor: 0xdfeeff },
    uniforms: { uCentre: { value: new THREE.Vector2(x, z) }, uR: { value: R }, uDir: { value: new THREE.Vector2(dir.x, dir.z) } },
    body: /* glsl */ `
      vec2 d = vCelWorld.xz - uCentre;
      float ang = atan(d.y, d.x);
      float u = length(d) / (uR * (1.0 + 0.045 * cos(ang * 5.0 + 0.3) + 0.02 * sin(ang * 11.0)));
      float e = u + (ysNoise(vec2(ang * 7.0, u * 4.0)) - 0.5) * 0.04;
      /* The funnel's throat and the rings the cooled water grows. */
      vec3 c = ysRgb(0.03, 0.22, 0.34);
      c = mix(c, ysRgb(0.10, 0.45, 0.50), smoothstep(0.14, 0.2, e));
      c = mix(c, ysRgb(0.36, 0.60, 0.40), smoothstep(0.34, 0.4, e));
      c = mix(c, ysRgb(0.80, 0.74, 0.28), smoothstep(0.52, 0.57, e));
      c = mix(c, ysRgb(0.90, 0.53, 0.16), smoothstep(0.66, 0.71, e));
      c = mix(c, ysRgb(0.78, 0.36, 0.14), smoothstep(0.86, 0.9, e));
      /* The scalloped lip, then sinter, stained where the overflow runs. */
      vec3 lip = ysRgb(0.91, 0.89, 0.83);
      vec3 sinter = ysRgb(0.80, 0.78, 0.72);
      float run = smoothstep(0.4, 0.9, dot(d / max(length(d), 0.01), uDir)) * smoothstep(0.6, 0.8, ysNoise(vec2(ang * 14.0, u)));
      vec3 outside = mix(sinter, ysRgb(0.78, 0.50, 0.26), run * (1.0 - smoothstep(1.3, 2.4, u)));
      paint = u < 1.0 ? c : mix(lip, outside, smoothstep(1.03, 1.1, u));
      if (u > 2.4 + ysNoise(vCelWorld.xz * 0.4) * 0.5) {
        discard;
      }
    `,
  });
  group.add(patch(ellipseCells(1, x, z, R * 2.9), heightAt, mat, { name: 'morning-glory-pool', lift: levelLift(heightAt, level, unit, 0.5) }));

  /* Into the region's ambient steam when there is one: one draw for the
   * basin. */
  const steam = env.ambient ?? new SteamBuilder();
  const steamBefore = steam.count;
  steam.vent({ x, y: level, z, spread: R * 0.5, count: 5, size: R * 0.6, rise: 6, life: 9, tint: 0xe6f0f0, alpha: 0.3, rng: env.rng });
  if (!env.ambient) {
    group.add(steam.build(env, { name: 'morning-glory-steam' }));
  }

  /* The boardwalk passes along one side, a few metres off the rim, away
   * from the runoff. */
  const turn = Math.atan2(-dir.z, -dir.x);
  const pts = [];
  for (let k = 0; k <= 10; k += 1) {
    const a = turn - 0.9 + (k / 10) * 1.8;
    pts.push({ x: x + Math.cos(a) * (R + 5), z: z + Math.sin(a) * (R + 5) });
  }
  group.add(boardwalk(heightAt, pts, { width: 2.4, clear: 0.4, name: 'morning-glory-boardwalk' }));
  return { id: 'morning-glory', group, update() {}, particles: steam.count - steamBefore, focus: { x, y: level, z, r: R * 3, height: 3 } };
}
