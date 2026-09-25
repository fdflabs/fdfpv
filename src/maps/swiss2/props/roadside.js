/*
 * roadside.js: the valley road's own furniture, and its end at the lake
 * made the lakeside road the lake-shore view stands beside.
 *
 *   roadside(m, heightAt, rng) -> { pads, trees }
 *
 * Round 8's road was a clean ribbon of asphalt with a painted middle.
 * A Swiss country road is worn: its white edge lines are broken and gone
 * grey where the tyres and the plough run, its gutter has a grate every
 * so often, and where it has been dug up it is patched darker. Where it
 * comes down to the lake it is a lakeside road: on the water's side the
 * PostAuto's stop (a yellow sign on its pole, the timetable in its case,
 * a bench, a bin, the yellow zigzag on the lane), a crash barrier, a
 * gravel lay-by, and a row of trees between the road and the shore. All
 * of it is vertex coloured, in the props' one static mesh, so none of it
 * costs a draw. (A car parked in the lay-by was the vehicles' own bake,
 * five draws more in lake-shore with its shadow, past the round's share
 * with the trees' model newly in view; the passing traffic is the
 * road's car.)
 *
 * Returned: `pads`, the lay-by's and the stop's footprints, for the
 * map's (so the grass keeps off the gravel and the paving), and
 * `trees`, for the forest to plant. The marks lie flat on the road,
 * and what stands is nineteen hundred metres from the strip, so as with
 * the props' huts out there, none of it has a collider.
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
import { noise2 } from '../../alps/noise.js';
import { valleyAxis } from '../../alps/terrain.js';
import { ROAD_DX, ROAD_END, STREET_Z } from '../vegetation/zones.js';
import { UP, box, shade } from './mesh.js';

/* The asphalt is 6.5 m wide and lies 6 cm over the ground
 * (alps/village.js's ribbon); a mark lies a hair over it. */
const HALF = 3.25;
const LIFT = 0.06;
const LINE_WHITE = [0.5, 0.5, 0.48];
const PATCH = [0.03, 0.03, 0.032];
const GRATE = [0.03, 0.03, 0.03];
const GALVANISED = [0.22, 0.235, 0.245];
const CONCRETE = [0.075, 0.074, 0.072];
const GRAVEL = [0.3, 0.28, 0.25];
const POST_GREY = [0.2, 0.2, 0.2];
const POSTAUTO = [0.85, 0.58, 0.0];
const BLACK = [0.015, 0.015, 0.015];
const WHITE = [0.6, 0.6, 0.58];
const BENCH = [0.12, 0.07, 0.035];

/* Where the lay-by, the stop and the barrier stand, by z along the road
 * and their side (+1 the east verge, -1 the west, the lake's side where
 * the road comes down to it). */
const LAYBY = { z0: 1919, z1: 1931, side: -1, depth: 3.1 };
const STOP = { z0: 1893, z1: 1905, side: -1, depth: 1.9 };
const BARRIER = [[1909, 1916], [1934, 1947]];

export function roadside(m, heightAt, rng) {
  /* The road's middle, its heading, and a point `off` metres across it
   * (+ to the east) at z. */
  const mid = (z) => valleyAxis(z) + ROAD_DX;
  const slope = (z) => (valleyAxis(z + 1) - valleyAxis(z - 1)) / 2;
  const across = (z) => {
    const s = slope(z);
    const l = Math.hypot(1, s);
    return new THREE.Vector3(1 / l, 0, -s / l);
  };
  const alongAt = (z) => {
    const n = across(z);
    return new THREE.Vector3(-n.z, 0, n.x);
  };
  /* An upright box at c, hx along the level direction ex, hy up and hz
   * across it (box wants its third axis ex x up). */
  const put = (c, ex, hx, hy, hz, colour, tones) => box(m, c, ex, UP, new THREE.Vector3().crossVectors(ex, UP), hx, hy, hz, colour, tones);
  const at = (z, off, lift = 0) => {
    const n = across(z);
    const x = mid(z) + n.x * off;
    const zz = z + n.z * off;
    return new THREE.Vector3(x, heightAt(x, zz) + lift, zz);
  };
  /* A flat strip on the road from z0 to z1 between offsets a and b. */
  const strip = (z0, z1, a, b, lift, colour) => {
    const [w, e] = a < b ? [a, b] : [b, a];
    m.quad(at(z0, w, lift), at(z1, w, lift), at(z1, e, lift), at(z0, e, lift), colour);
  };

  /*
   * THE EDGE LINES, a hand in from each edge, the length of the road:
   * in three metre pieces, each its own shade of worn white, some worn
   * to the asphalt's grey and some gone, and none across a junction.
   */
  for (let z = -2690; z < ROAD_END - 4; z += 3) {
    for (const side of [-1, 1]) {
      if ((side < 0 && Math.abs(z - STREET_Z) < 12) || (side === STOP.side && z > STOP.z0 - 3 && z < STOP.z1)) {
        continue;
      }
      const wear = noise2(z / 23 + side * 7.1, 3.3) * 0.7 + 0.3 * rng();
      if (wear > 0.8) {
        continue;
      }
      const off = side * (HALF - 0.3);
      strip(z, z + 3, off - 0.06, off + 0.06, LIFT + 0.012, shade(LINE_WHITE, 1.05 - 0.75 * wear * wear));
    }
  }

  /* A grate in the west gutter every eighty metres, over the ditch. */
  const grate = (z, side) => {
    const off = side * (HALF - 0.28);
    strip(z - 0.25, z + 0.25, off - 0.18, off + 0.18, LIFT + 0.006, GRATE);
    for (let k = -2; k <= 2; k += 1) {
      strip(z + k * 0.09 - 0.02, z + k * 0.09 + 0.02, off - 0.16, off + 0.16, LIFT + 0.009, [0.09, 0.085, 0.08]);
    }
  };
  for (let z = -2660; z < ROAD_END - 10; z += 80) {
    grate(z, -1);
  }
  grate(1889, -1);
  grate(1941, 1);

  /* Where the road has been dug up and laid again: a trench across one
   * lane, a patch at the edge, their joints sealed. */
  strip(1903.2, 1904.4, -HALF + 0.05, 0.1, LIFT + 0.004, PATCH);
  strip(1936, 1940.5, 1.2, HALF - 0.05, LIFT + 0.004, shade(PATCH, 1.3));
  strip(1888, 1889.6, -HALF + 0.05, -1.6, LIFT + 0.004, shade(PATCH, 1.15));

  /* THE BARRIER on the lake's side: a galvanised W-beam on posts every
   * two metres, its ends turned down into the verge. */
  for (const [z0, z1] of BARRIER) {
    const off = -(HALF + 0.8);
    for (let z = z0; z <= z1 + 1e-6; z += 2) {
      const p = at(z, off);
      put(p.clone().setY(p.y + 0.38), across(z), 0.05, 0.4, 0.07, shade(GALVANISED, 0.7));
    }
    const beam = (za, zb, ya, yb) => {
      const a = at(za, off + 0.1);
      const b = at(zb, off + 0.1);
      a.y += ya;
      b.y += yb;
      const along = b.clone().sub(a);
      const len = along.length();
      along.normalize();
      const n = new THREE.Vector3(-along.z, 0, along.x).normalize();
      const up = new THREE.Vector3().crossVectors(n, along).normalize();
      const c = a.clone().add(b).multiplyScalar(0.5);
      box(m, c, along, up, n, len / 2, 0.16, 0.025, GALVANISED, [0.9, 0.9, 1.3, 0.5, 1.0, 0.8]);
      box(m, c.clone().addScaledVector(n, -0.025), along, up, n, len / 2, 0.04, 0.02, shade(GALVANISED, 0.55));
    };
    beam(z0, z1, 0.6, 0.6);
    beam(z0 - 3, z0, 0.1, 0.6);
    beam(z1, z1 + 3, 0.6, 0.1);
  }

  /* A pad's footprint for the map, drawn in by the two metres the grass
   * keeps off a footprint (vegetation/zones.js coverOff), so the verge
   * grows to the pad's edge and not two metres short of it. */
  const padOf = (a, b) => {
    const ix = Math.min(1.8, Math.abs(a.x - b.x) / 2);
    const iz = Math.min(1.8, Math.abs(a.z - b.z) / 2);
    return {
      minX: Math.min(a.x, b.x) + ix, minZ: Math.min(a.z, b.z) + iz, maxX: Math.max(a.x, b.x) - ix, maxZ: Math.max(a.z, b.z) - iz,
    };
  };

  /* THE LAY-BY: gravel to the verge, rutted where the cars pull in,
   * paler at its edges where it is little driven. */
  const pads = [];
  {
    const { z0, z1, side, depth } = LAYBY;
    for (let z = z0 - 3; z < z1 + 3; z += 0.5) {
      const taper = Math.min(1, (z - (z0 - 3)) / 3, ((z1 + 3) - z) / 3);
      const reach = HALF + 0.05 + depth * Math.max(0, taper);
      for (let o = HALF - 0.05; o < reach; o += 0.5) {
        const o1 = Math.min(reach, o + 0.5);
        const rut = Math.abs(o - (HALF + 0.9)) < 0.3 || Math.abs(o - (HALF + 2.4)) < 0.3 ? 0.75 : 1;
        const k = (0.8 + 0.4 * noise2(z * 1.7, o * 1.9)) * rut * (1 + 0.25 * (o - HALF) / depth);
        strip(z, z + 0.5, side * o, side * o1, 0.035, shade(GRAVEL, k));
      }
    }
    const a = at(z0 - 3, side * HALF);
    const b = at(z1 + 3, side * (HALF + depth));
    pads.push(padOf(a, b));
  }

  /*
   * THE POSTAUTO'S STOP on the lake's verge: a pad of asphalt behind a
   * kerb, the yellow sign on its pole facing the traffic with the stop's
   * name on a black band, the timetable in its white case, a bench with
   * its back to the water and a bin.
   */
  {
    const { z0, z1, side, depth } = STOP;
    for (let z = z0; z < z1; z += 1) {
      strip(z, z + 1, side * (HALF - 0.02), side * (HALF + depth), 0.1, shade(CONCRETE, 0.92 + 0.16 * noise2(z * 0.7, 5.5)));
    }
    /* The yellow zigzag on the lane that keeps the stop clear. */
    const lo = side * (HALF - 0.25);
    const hi = side * (HALF - 1.1);
    for (let z = z0 - 2; z < z1; z += 1) {
      const k = Math.round(z - z0) % 2;
      const [oa, ob] = k ? [lo, hi] : [hi, lo];
      const a = at(z, oa, LIFT + 0.012);
      const b = at(z + 1, ob, LIFT + 0.012);
      const d = b.clone().sub(a).setY(0).normalize();
      const w = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.06);
      const q = [a.clone().sub(w), b.clone().sub(w), b.clone().add(w), a.clone().add(w)];
      const up = new THREE.Vector3().subVectors(q[1], q[0]).cross(new THREE.Vector3().subVectors(q[2], q[0])).y > 0;
      m.quad(...(up ? q : q.reverse()), [0.55, 0.36, 0.02]);
    }
    /* The kerb along its front. */
    for (let z = z0; z < z1; z += 1) {
      const p = at(z + 0.5, side * (HALF + 0.08), 0.06);
      put(p, alongAt(z), 0.5, 0.07, 0.1, shade(CONCRETE, 1.2));
    }
    const a = at(z0, side * HALF);
    const b = at(z1, side * (HALF + depth));
    pads.push(padOf(a, b));
    const n = across(z1 - 2);
    const along = new THREE.Vector3(-n.z, 0, n.x);
    const facing = new THREE.Vector3(n.x, 0, n.z).multiplyScalar(-side);
    const pole = at(z1 - 2, side * (HALF + 0.9), 0.1);
    put(pole.clone().setY(pole.y + 1.35), along, 0.035, 1.35, 0.035, POST_GREY);
    /* The sign, both faces toward the traffic: yellow, the black band
     * with the name, the white square with its H. */
    const sign = pole.clone().setY(pole.y + 2.35).addScaledVector(facing, 0.3);
    put(sign, n, 0.36, 0.28, 0.02, POSTAUTO, [1, 1, 1, 0.8, 1, 1]);
    for (const s of [-1, 1]) {
      const face = sign.clone().addScaledVector(along, s * 0.022);
      put(face.clone().setY(sign.y - 0.16), n, 0.32, 0.06, 0.004, BLACK);
      put(face.clone().setY(sign.y + 0.07), n, 0.11, 0.11, 0.004, WHITE);
      put(face.clone().setY(sign.y + 0.07).addScaledVector(along, s * 0.003), n, 0.015, 0.08, 0.004, [0.02, 0.18, 0.08]);
    }
    /* The timetable case, on the pole under the sign. */
    put(pole.clone().setY(pole.y + 1.45).addScaledVector(facing, 0.06), along, 0.22, 0.3, 0.03, WHITE);
    put(pole.clone().setY(pole.y + 1.45).addScaledVector(facing, 0.092), along, 0.18, 0.26, 0.002, [0.4, 0.4, 0.38]);
    /* The bench and the bin. */
    const bench = at(z0 + 4, side * (HALF + depth - 0.5), 0.1);
    const back = facing.clone().multiplyScalar(-1);
    put(bench.clone().setY(bench.y + 0.44), along, 0.8, 0.03, 0.2, BENCH);
    put(bench.clone().setY(bench.y + 0.72).addScaledVector(back, 0.2), along, 0.8, 0.14, 0.02, BENCH);
    for (const s of [-1, 1]) {
      put(bench.clone().setY(bench.y + 0.22).addScaledVector(along, s * 0.7), along, 0.03, 0.22, 0.2, POST_GREY);
    }
    const bin = at(z0 + 1.5, side * (HALF + depth - 0.4), 0.1);
    put(bin.clone().setY(bin.y + 0.33), along, 0.14, 0.33, 0.14, [0.03, 0.12, 0.06]);
  }
  /* A row of trees along the lake's side of the road where it comes
   * down to the water, as every lakeside road in the Oberland has, for
   * the forest to plant with its own (vegetation/forest.js `planted`). */
  const trees = [];
  for (let z = 1906; z < ROAD_END + 28; z += 7.5) {
    if ((z > LAYBY.z0 - 1 && z < LAYBY.z1 + 1) || (z > STOP.z0 - 1 && z < STOP.z1 + 1)) {
      continue;
    }
    const p = at(z + 2 * (noise2(z * 0.31, 7.7) - 0.5), -(HALF + 3.6 + 0.8 * noise2(z * 0.23, 2.2)));
    trees.push({ x: p.x, z: p.z, kind: 'walnut', s: noise2(z * 0.17, 4.4) });
  }
  return { pads, trees };
}
