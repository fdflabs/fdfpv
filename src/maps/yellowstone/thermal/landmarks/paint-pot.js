/*
 * paint-pot.js: Fountain Paint Pot, in the Lower Geyser Basin.
 *
 * A basin of hot mud about a dozen metres across, cream and pink and grey
 * with clay and iron, inside a rim of mud it has thrown up and baked. Gas
 * comes up through it all the time: blobs swell and pop, throwing mud a
 * little way, and the level and the thickness change through the year. A
 * crust of cracked grey clay spreads round it, and the boardwalk loops
 * round the far side.
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
import { JetBuilder } from '../jets.js';
import { patch, ellipseCells, boardwalk, lathe, rockMaterial, poolLevel } from './kit.js';

const A = 7;
const B = 5.2;
const TURN = 0.6;

export function buildPaintPot(env, f) {
  const { heightAt } = env;
  const { x, z } = f;
  const group = new THREE.Group();
  group.name = 'paint-pot';
  const level = poolLevel(heightAt, x, z, A) + 0.1;

  /* The mud, flat at its level, and the cracked clay round it. */
  const mat = paintMaterial({
    key: 'paint-pot',
    bias: LAYER.patch,
    cel: { rim: 0.08 },
    uniforms: { uCentre: { value: new THREE.Vector2(x, z) }, uAB: { value: new THREE.Vector2(A, B) }, uTurn: { value: TURN } },
    body: /* glsl */ `
      vec2 d = vCelWorld.xz - uCentre;
      vec2 l = vec2(d.x * cos(uTurn) + d.y * sin(uTurn), -d.x * sin(uTurn) + d.y * cos(uTurn)) / uAB;
      float u = length(l);
      vec2 w = vCelWorld.xz;
      if (u < 1.0) {
        /* Mud: cream and pink swirled with grey, wetter and darker toward
         * the middle, with the rings of the last pops. */
        float swirl = ysFbm(w * 0.45 + vec2(ysNoise(w * 0.2) * 2.0, 0.0));
        paint = mix(ysRgb(0.84, 0.76, 0.70), ysRgb(0.78, 0.64, 0.60), smoothstep(0.35, 0.65, swirl));
        paint = mix(paint, ysRgb(0.64, 0.62, 0.60), smoothstep(0.55, 0.8, ysNoise(w * 0.9 + 5.0)) * 0.6);
        paint *= mix(0.86, 1.0, smoothstep(0.1, 0.8, u));
        float ring = fract(length(d - vec2(ysNoise(w * 0.1) * 2.0)) * 1.4 - uCelTime * 0.6);
        paint *= 1.0 - 0.08 * smoothstep(0.85, 1.0, ring);
      } else {
        if (u > 3.4 + ysNoise(w * 0.3) * 0.8) {
          discard;
        }
        /* Cracked clay: pale grey plates with dark cracks between. */
        vec2 cell = w * 0.9;
        float crack = abs(ysNoise(cell) - ysNoise(cell + 0.37));
        paint = mix(ysRgb(0.80, 0.78, 0.74), ysRgb(0.70, 0.66, 0.60), ysNoise(w * 0.15));
        paint *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.04, crack));
      }
    `,
  });
  const cells = ellipseCells(1, x, z, A * 3.5, B * 3.5, TURN);
  const inside = (px, pz) => {
    const dx = px - x;
    const dz = pz - z;
    const u = (dx * Math.cos(TURN) + dz * Math.sin(TURN)) / A;
    const v = (-dx * Math.sin(TURN) + dz * Math.cos(TURN)) / B;
    return Math.hypot(u, v);
  };
  group.add(patch(cells, heightAt, mat, {
    name: 'paint-pot-mud',
    lift: (px, pz) => (inside(px, pz) < 1.05 ? Math.max(0, level - heightAt(px, pz)) : 0),
  }));

  /* The rim: a low bank of baked mud round the pot. */
  const c = Math.cos(TURN);
  const s = Math.sin(TURN);
  /* The ellipse's radius at polar angle a, as a fraction of A. */
  const ringShape = (a) => B / Math.hypot(B * Math.cos(a), A * Math.sin(a));
  const rimGeo = lathe([
    [A * 1.28, -0.25, 0xa89f93],
    [A * 1.12, 0.45, 0xbdb3a6],
    [A * 1.04, 0.6, 0xa2968a],
    [A * 0.99, 0.1, 0x9a8d80],
  ], { x, z, foot: level - 0.2, segs: 40, shape: (a) => ringShape(a) * (1 + 0.05 * Math.sin(a * 7)) });
  const rim = new THREE.Mesh(rimGeo, rockMaterial());
  rim.name = 'paint-pot-rim';
  group.add(rim);
  /* The lathe laid its ring on the pot's long axis unturned; turn the
   * vertices about the pot's centre by TURN. */
  const p = rimGeo.getAttribute('position');
  for (let k = 0; k < p.count; k += 1) {
    const dx = p.getX(k) - x;
    const dz = p.getZ(k) - z;
    p.setX(k, x + dx * c - dz * s);
    p.setZ(k, z + dx * s + dz * c);
    p.setY(k, Math.max(p.getY(k), heightAt(p.getX(k), p.getZ(k)) + 0.02));
  }
  rimGeo.computeVertexNormals();

  const mud = new JetBuilder('mud');
  for (let k = 0; k < 9; k += 1) {
    const a = (k / 9) * Math.PI * 2;
    const r = k === 0 ? 0 : 0.55;
    const lx = Math.cos(a) * A * r;
    const lz = Math.sin(a) * B * r;
    mud.mud({ x: x + lx * c - lz * s, y: level, z: z + lx * s + lz * c, r: 2.2, blobs: 7, size: 0.55, life: 1.9, tint: 0xc9b3a8, rng: env.rng });
  }
  group.add(mud.build(env, 'paint-pot-bubbles'));
  /* Into the region's ambient steam when there is one: one draw for the
   * basin. */
  const steam = env.ambient ?? new SteamBuilder();
  const steamBefore = steam.count;
  steam.vent({ x, y: level, z, spread: A * 0.6, count: 6, size: 2.2, rise: 8, life: 8, alpha: 0.3, rng: env.rng });
  if (!env.ambient) {
    group.add(steam.build(env, { name: 'paint-pot-steam' }));
  }

  const pts = [];
  for (let k = 0; k <= 24; k += 1) {
    const a = 0.9 + (k / 24) * Math.PI * 1.4;
    pts.push({ x: x + Math.cos(a) * 15, z: z + Math.sin(a) * 13 });
  }
  group.add(boardwalk(heightAt, pts, { width: 2.4, clear: 0.45, name: 'paint-pot-boardwalk' }));
  return { id: 'paint-pot', group, update() {}, particles: mud.count + steam.count - steamBefore, focus: { x, y: level, z, r: 20, height: 2 } };
}
