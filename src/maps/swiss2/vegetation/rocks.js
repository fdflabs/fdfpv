/*
 * rocks.js: the boulders under the cliffs, on the scree and along the
 * torrent, and the stones the map lays on the stream's banks, the lake's
 * shore and the field walls, as photogrammetry scans rather than
 * icosahedra.
 *
 * The scans, their material, the colliders that fit them and the levels
 * they are drawn in are the asset library's (src/render/library/rocks.js);
 * where they lie is this map's. Placed by nature.js's rules: thickest on
 * steep ground and in clumps, a scatter along the torrent in the side
 * valley, never where keepOff says. Each is turned about its axis, tilted
 * part way to the slope and sunk by the slope so its downhill edge does
 * not float.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { makeRng, noise2, smoothstep } from '../../../render/library/noise.js';
import { SHAPES, loadRocks, rockColliders, rockLevels } from '../../../render/library/rocks.js';
import { FIELD, SNOW_LINE, LAKE_Y, valleyAxis } from '../../alps/terrain.js';
import { ROAD_DX, ROAD_END } from './zones.js';

/* Where the boulders lie, nature.js's two passes, and then the stones
 * the map asks for. A stone asked for with `sink` is set that share of
 * its height into the ground (or the stream's bed) rather than by the
 * slope. `scans` is each shape's vertices, near and far, for the
 * colliders (the library's rockColliders). */
function placeRocks({ heightAt, layout, rng, count, colliders, extra, scans }) {
  const { keepOff, slopeAt, upper } = layout;
  const rocks = [];
  const up = new THREE.Vector3(0, 1, 0);
  const drop = (x, z, size, sink = null) => {
    const sl = slopeAt(x, z);
    const n = new THREE.Vector3(-sl.sx, 1, -sl.sz).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, up.clone().lerp(n, 0.6).normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, rng() * Math.PI * 2));
    const s = size * (0.8 + rng() * 0.4);
    const sy = 0.75 + rng() * 0.5;
    const y = heightAt(x, z) - s * (sink === null ? 0.08 + 0.35 * Math.min(1, sl.s) : sink * sy);
    const shape = Math.floor(rng() * SHAPES.length);
    /* Not on carved rock (swiss2/rock/), turned away after its draws so
     * the stones after it lie where they lay. */
    if (layout.carved && layout.carved(x, z)) {
      return;
    }
    const rock = { x, y, z, q, s, sy, shape };
    rocks.push(rock);
    if (!colliders) {
      return;
    }
    const h = heightAt(x, z);
    for (const [kind, ...c] of rockColliders(rock, scans, (px, pz) => h + sl.sx * (px - x) + sl.sz * (pz - z))) {
      if (kind === 'sphere') {
        colliders.addSphere('rock', ...c);
      } else {
        colliders.add('rock', ...c);
      }
    }
  };
  for (let tries = 0; tries < count * 120 && rocks.length < count; tries += 1) {
    const x = (rng() - 0.5) * FIELD * 0.94;
    const z = (rng() - 0.5) * FIELD * 0.94;
    const y = heightAt(x, z);
    if (y < 70 || y > SNOW_LINE + 250) {
      continue;
    }
    const sl = slopeAt(x, z);
    const clump = smoothstep(0.5, 0.75, noise2(x / 90 + 1.1, z / 90 + 6.3));
    const p = smoothstep(0.5, 1.15, sl.s) * (0.25 + 0.75 * clump);
    if (rng() > p || keepOff(x, z)) {
      continue;
    }
    const pick = rng();
    const size = pick < 0.55 ? 1.6 : pick < 0.87 ? 3.2 : 5.8;
    drop(x, z, size);
    /* A few smaller stones round a boulder, as there are. */
    const more = Math.floor(rng() * 3);
    for (let k = 0; k < more; k += 1) {
      const a = rng() * Math.PI * 2;
      const r = size * (0.8 + rng() * 1.5);
      const ex = x + Math.cos(a) * r;
      const ez = z + Math.sin(a) * r;
      if (!keepOff(ex, ez)) {
        drop(ex, ez, 0.6 + rng() * 0.8);
      }
    }
  }
  for (let k = 0; k < 110; k += 1) {
    const at = upper[Math.floor(rng() * upper.length)];
    const side = rng() < 0.5 ? -1 : 1;
    const x = at.x + (rng() - 0.5) * 4;
    const z = at.z + side * (2.5 + rng() * 7);
    if (!keepOff(x, z)) {
      drop(x, z, rng() < 0.7 ? 1.3 : 2.6);
    }
  }
  for (const e of extra) {
    drop(e.x, e.z, e.size, e.sink ?? null);
  }
  return rocks;
}

/*
 * The stones the water has laid: along the floor's stream, where round
 * 2's banks were grass to the water's edge, reaches of stones down both
 * banks and a boulder in the bed now and then, broken by grassy reaches;
 * and round the lake, stones along the waterline, fewer where the jetty
 * and the village's beach are. Returns { x, z, size, sink } for
 * buildRocks's `extra`.
 */
export function waterStones({ heightAt, layout, rng, shore, keepClear }) {
  const out = [];
  const { lower } = layout;
  for (let k = 0; k + 1 < lower.length; k += 1) {
    const a = lower[k];
    const b = lower[k + 1];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    for (const side of [-1, 1]) {
      const rocky = smoothstep(0.35, 0.6, noise2(a.z / 45 + side * 7.3, 5.1 + side));
      const n = Math.round(rocky * (2 + 5 * rng()));
      for (let q = 0; q < n; q += 1) {
        const along = rng();
        const off = 2.1 + rng() * 2.6;
        const x = a.x + tx * along + side * (-tz / tl) * off;
        const z = a.z + tz * along + side * (tx / tl) * off;
        out.push({ x, z, size: 0.35 + 0.7 * rng() * rng(), sink: 0.3 });
      }
    }
    if (rng() < 0.12) {
      const along = rng();
      const off = (rng() - 0.5) * 3;
      out.push({ x: a.x + tx * along - (tz / tl) * off, z: a.z + tz * along + (tx / tl) * off, size: 0.8 + 0.8 * rng(), sink: 0.45 });
    }
  }
  for (const s of shore) {
    if (rng() > 0.45 || keepClear(s.x, s.z)) {
      continue;
    }
    const n = 1 + Math.floor(rng() * 3);
    for (let q = 0; q < n; q += 1) {
      const r = (rng() - 0.35) * 5;
      const x = s.x + Math.cos(s.a) * r + (rng() - 0.5) * 6;
      const z = s.z + Math.sin(s.a) * r + (rng() - 0.5) * 6;
      if (heightAt(x, z) > LAKE_Y - 1.2) {
        out.push({ x, z, size: 0.4 + 0.9 * rng() * rng(), sink: 0.3 });
      }
    }
  }
  /* Boulders the glacier left along the shore, in twos and threes, some
   * on the beach and some standing in the shallows: a lake's edge is
   * never only gravel. Their own generator, so the stones above stand
   * where they stood. */
  const brng = makeRng(20261001);
  for (const s of shore) {
    if (brng() > 0.5 || keepClear(s.x, s.z)) {
      continue;
    }
    const n = 1 + Math.floor(brng() * 2.6);
    for (let q = 0; q < n; q += 1) {
      const r = (brng() - 0.55) * 9;
      const x = s.x + Math.cos(s.a) * r + (brng() - 0.5) * 5;
      const z = s.z + Math.sin(s.a) * r + (brng() - 0.5) * 5;
      if (!keepClear(x, z) && heightAt(x, z) > LAKE_Y - 1.5) {
        out.push({ x, z, size: 1.2 + 1.6 * brng() * brng(), sink: 0.35 });
      }
    }
  }
  /* Cobbles the waves have sorted along the waterline, from the wash
   * down into the shallows, where the water shows them: the shingle the
   * ground paints stands up in them. Thickest on the north shore either
   * side of the jetty, where the views stand; a lake's worth of them at
   * that density would be a quarter of a million triangles from the air.
   * Their own generator again. */
  const crng = makeRng(20261002);
  const jx = valleyAxis(ROAD_END) + ROAD_DX;
  for (const s of shore) {
    const north = Math.sin(s.a) < -0.3;
    const n = Math.floor(crng() * (north ? 8 + 44 * (1 - smoothstep(60, 160, Math.abs(s.x - jx))) : 5));
    for (let q = 0; q < n; q += 1) {
      const along = (crng() - 0.5) * 22;
      const r = (crng() - 0.6) * 7;
      const x = s.x + Math.cos(s.a) * r - Math.sin(s.a) * along;
      const z = s.z + Math.sin(s.a) * r + Math.cos(s.a) * along;
      const y = heightAt(x, z);
      if (!keepClear(x, z) && y > LAKE_Y - 0.8 && y < LAKE_Y + 0.6) {
        out.push({ x, z, size: 0.16 + 0.3 * crng() * crng(), sink: 0.35 });
      }
    }
  }
  return out;
}

/*
 * Load the scans, place the rocks and build their levels into `group`.
 * `extra` is the stones the map lays by its own rules, as
 * { x, z, size, sink }. Returns update(camera), the counts, and
 * dispose().
 */
export async function buildRocks({ heightAt, layout, rng, count, nearR, fade, colliders, group, envMap, extra = [] }) {
  const loaded = await loadRocks();
  const rocks = placeRocks({ heightAt, layout, rng, count, colliders, extra, scans: loaded.scans });
  const levels = rockLevels({ loaded, rocks, nearR, fade, envMap, name: 'swiss2' });
  group.add(...levels.meshes);
  return {
    update: levels.update,
    count: rocks.length,
    stones: levels.stones,
    dispose: levels.dispose,
  };
}
