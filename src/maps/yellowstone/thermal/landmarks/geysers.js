/*
 * geysers.js: Castle, Grand, Riverside and Beehive, the Upper Geyser
 * Basin's big predictable geysers besides Old Faithful, each with its own
 * cone and its own way of erupting.
 *
 * Castle: the largest cone in the basin, a battered turret of geyserite
 * about four metres high on a broad old sinter mound, its rim broken into
 * crenellations. Twenty minutes of water to 27 m, then half an hour and
 * more of roaring steam.
 *
 * Grand: no cone at all, a pool in a sinter platform that empties when it
 * goes. The tallest predictable geyser, one to four bursts to 61 m, broad
 * and fanned, over nine to twelve minutes.
 *
 * Riverside: a small cone on the bank of the Firehole whose column leans
 * out and arches over the river, 23 m high, twenty minutes long.
 *
 * Beehive: a narrow cone a little over a metre high shaped like a straw
 * beehive; the column is a thin jet to 61 m. Its Indicator, a few metres
 * away, splashes for a quarter of an hour before.
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
import { heroJet } from '../jets.js';
import { hash01 } from '../schedule.js';
import { patch, ellipseCells, lathe, rockMaterial, heroGeyser, sinterMound, runoffDir, lowestAround, poolLevel } from './kit.js';

function coneMesh(geo, name) {
  const m = new THREE.Mesh(geo, rockMaterial());
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.bake = true;
  return m;
}

function wrap(id, group, geyser, focus, extra = {}) {
  return {
    id,
    group,
    geyser,
    update: (t) => geyser.update(t),
    setDemo: (on) => geyser.setDemo(on),
    particles: geyser.particles,
    focus,
    ...extra,
  };
}

export function buildCastle(env, f) {
  const { x, z } = f;
  const group = new THREE.Group();
  group.name = 'castle';
  const mound = sinterMound(env, { x, z, a: 26, b: 21, h: 2.6, turn: 1.1, key: 'castle', wet: 9 });
  group.add(mound.mesh);
  const foot = mound.top - 0.4;
  /* The turret: a thick battered cone, its top broken into six uneven
   * merlons, grey tan geyserite stained orange low down where the water
   * runs off. */
  const merlon = (a) => 0.55 * Math.max(0, Math.sin(a * 6 + 0.4)) ** 0.4 + 0.3 * hash01(Math.floor((a / (Math.PI * 2)) * 18), 3);
  const geo = lathe([
    [5.6, 0, 0xc9b18c],
    [5.0, 1.4, 0xdcd2bf],
    [4.3, 2.9, 0xe8e1d3],
    [3.8, 4.2, 0xefe9de],
    [3.5, (a) => 5.0 + merlon(a), 0xf3eee5],
    [2.7, (a) => 5.3 + merlon(a) * 0.8, 0xe6dfd1],
    [1.8, 4.6, 0xa89f90],
    [1.0, 3.6, 0x4a443e],
    [0.6, 2.0, 0x2e2a27],
  ], {
    x, z, foot, segs: 28,
    shape: (a, row) => 1 + 0.08 * Math.sin(a * 3 + 1.2) + 0.05 * Math.sin(a * 11 + row) * (row > 0 && row < 6 ? 1 : 0),
  });
  group.add(coneMesh(geo, 'castle-cone'));
  const geyser = heroGeyser(env, {
    id: 'castle', style: 'castle', vent: { x, y: foot + 4.7, z }, peakMax: 27,
    jet: { drops: 560, size: 1.2, spread: 0.13, width: 1.1 },
    plume: { size: 7.5, count: 64, rise: 55, life: 16, spread: 3.5, sheathCount: 50 },
    seed: 1870 + 1, rng: env.rng, feature: f,
  });
  group.add(geyser.group);
  return wrap('castle', group, geyser, { x, y: foot + 5, z, r: 30, height: 30 });
}

export function buildGrand(env, f) {
  const { heightAt } = env;
  const { x, z } = f;
  const group = new THREE.Group();
  group.name = 'grand';
  const mound = sinterMound(env, { x, z, a: 30, b: 24, h: 1.3, turn: -0.4, key: 'grand', wet: 14 });
  group.add(mound.mesh);
  /* The pool: pale blue grey in a scalloped sinter rim, lying in the top
   * of the platform. */
  const R = 5.5;
  /* Level water in the top of the platform: a hair over the dome, which
   * is within a few centimetres of flat this near its crown. */
  const level = Math.max(mound.top, poolLevel(heightAt, x, z, R * 1.3)) + 0.05;
  const mat = paintMaterial({
    key: 'grand-pool',
    bias: LAYER.pools,
    cel: { rim: 0.15, rimColor: 0xdfeeff },
    uniforms: { uCentre: { value: new THREE.Vector2(x, z) }, uR: { value: R } },
    body: /* glsl */ `
      vec2 d = vCelWorld.xz - uCentre;
      float u = length(d) / (uR * (1.0 + 0.1 * sin(atan(d.y, d.x) * 4.0 + 0.5)));
      if (u > 1.25) {
        discard;
      }
      paint = mix(ysRgb(0.24, 0.52, 0.66), ysRgb(0.52, 0.74, 0.76), smoothstep(0.2, 0.9, u));
      paint = mix(paint, ysRgb(0.90, 0.88, 0.82), smoothstep(0.98, 1.02, u));
    `,
  });
  const cells = ellipseCells(1, x, z, R * 1.3);
  group.add(patch(cells, heightAt, mat, { name: 'grand-pool', lift: (px, pz) => level - heightAt(px, pz) }));
  const geyser = heroGeyser(env, {
    id: 'grand', style: 'grand', vent: { x, y: level, z }, peakMax: 61,
    jet: { drops: 900, size: 1.35, spread: 0.2, width: 3.2 },
    plume: { size: 8, count: 70, rise: 85, life: 18, spread: 5, sheathCount: 70 },
    seed: 1871, rng: env.rng, feature: f,
  });
  group.add(geyser.group);
  return wrap('grand', group, geyser, { x, y: level, z, r: 35, height: 60 });
}

export function buildRiverside(env, f) {
  const { heightAt } = env;
  const { x, z } = f;
  const group = new THREE.Group();
  group.name = 'riverside';
  const dir = runoffDir(env.rivers, x, z, Math.PI);
  const foot = lowestAround(heightAt, x, z, 2.2) - 0.2;
  const geo = lathe([
    [2.2, 0, 0x9e7650],
    [1.8, 0.6, 0xb9a488],
    [1.3, 1.15, 0xcfc4ae],
    [0.8, 1.35, 0x7a7065],
    [0.45, 0.8, 0x2f2b28],
  ], {
    x, z, foot, segs: 16,
    shape: (a) => 1 + 0.18 * Math.cos(a - Math.atan2(dir.z, dir.x)) + 0.06 * Math.sin(a * 5),
  });
  group.add(coneMesh(geo, 'riverside-cone'));
  /* The bank below the cone, stained where the overflow runs to the
   * water. */
  const bank = paintMaterial({
    key: 'riverside-bank',
    bias: LAYER.patch,
    cel: { rim: 0.08 },
    uniforms: { uCentre: { value: new THREE.Vector2(x, z) }, uDir: { value: new THREE.Vector2(dir.x, dir.z) } },
    body: /* glsl */ `
      vec2 d = vCelWorld.xz - uCentre;
      float r = length(d);
      float along = dot(d, uDir);
      float across = abs(dot(d, vec2(-uDir.y, uDir.x)));
      float reach = 7.0 + max(0.0, along) * 0.9;
      if (r > 14.0 || across > 3.0 + max(0.0, along) * 0.6 + ysNoise(vCelWorld.xz * 0.6) * 2.0) {
        discard;
      }
      float stain = smoothstep(-2.0, 3.0, along) * (1.0 - smoothstep(reach * 0.6, reach, r));
      paint = mix(ysRgb(0.84, 0.82, 0.76), mix(ysRgb(0.80, 0.45, 0.18), ysRgb(0.52, 0.30, 0.18), ysNoise(vCelWorld.xz * 0.8)), stain);
    `,
  });
  group.add(patch(ellipseCells(1, x + dir.x * 5, z + dir.z * 5, 12), heightAt, bank, { name: 'riverside-bank' }));
  /* The column leans 35 degrees out over the river; the height it is
   * known for, 23 m, is the top of the arch (heroGeyser launches for it). */
  const lean = (35 * Math.PI) / 180;
  const tilt = [dir.x * Math.sin(lean), Math.cos(lean), dir.z * Math.sin(lean)];
  const peak = 23;
  const geyser = heroGeyser(env, {
    id: 'riverside', style: 'riverside', vent: { x, y: foot + 1.3, z }, peakMax: peak,
    jet: { drops: 620, size: 1.0, spread: 0.07, width: 0.5, dir: tilt },
    plume: { size: 5, count: 44, rise: 40, life: 14, spread: 2.5, sheathCount: 40 },
    seed: 1872, rng: env.rng, feature: f,
  });
  group.add(geyser.group);
  return wrap('riverside', group, geyser, { x, y: foot + 1, z, r: 25, height: 23 }, { lean: tilt });
}

export function buildBeehive(env, f) {
  const { x, z } = f;
  const group = new THREE.Group();
  group.name = 'beehive';
  const mound = sinterMound(env, { x, z, a: 16, b: 13, h: 0.9, turn: 0.2, key: 'beehive', wet: 6 });
  group.add(mound.mesh);
  const foot = mound.top - 0.15;
  /* The straw beehive: a rounded cone, corrugated in rings and ribs. */
  const geo = lathe([
    [1.35, 0, 0xcfc5b2],
    [1.3, 0.35, 0xe0d8c8],
    [1.15, 0.7, 0xeae4d8],
    [0.9, 1.0, 0xe3dccd],
    [0.55, 1.22, 0xd2c9b7],
    [0.32, 1.25, 0x6f665c],
    [0.2, 0.7, 0x2e2a27],
  ], {
    x, z, foot, segs: 20,
    shape: (a, row) => 1 + 0.05 * Math.sin(a * 14) + (row % 2 ? 0.04 : 0),
  });
  group.add(coneMesh(geo, 'beehive-cone'));
  const geyser = heroGeyser(env, {
    id: 'beehive', style: 'beehive', vent: { x, y: foot + 1.2, z }, peakMax: 61,
    jet: { drops: 700, size: 0.95, spread: 0.035, width: 0.25 },
    plume: { size: 5.5, count: 50, rise: 80, life: 15, spread: 2, sheathCount: 60 },
    seed: 1873, rng: env.rng, feature: f,
  });
  group.add(geyser.group);
  /* Beehive's Indicator: three metres off, a small splashing fountain
   * that plays through the main geyser's preplay window. */
  const ix = x + 3.1;
  const iz = z + 1.2;
  const indicator = heroJet(env, { x: ix, y: env.heightAt(ix, iz) + 0.2, z: iz, peak: 4.5, drops: 90, size: 0.35, spread: 0.12, width: 0.2, name: 'beehive-indicator', rng: env.rng });
  group.add(indicator.mesh);
  const played = {
    at(t) {
      const s = geyser.schedule.at(t);
      if (s.phase !== 'splash') {
        return { power: 0 };
      }
      return { power: 0.55 + 0.45 * Math.abs(Math.sin(t * 1.3) * Math.sin(t * 0.37 + 1)) };
    },
  };
  return wrap('beehive', group, geyser, { x, y: foot + 1, z, r: 20, height: 60 }, {
    update: (t) => {
      geyser.update(t);
      indicator.update(played, t);
      indicator.mesh.visible = indicator.live();
    },
    particles: geyser.particles + 90,
  });
}

