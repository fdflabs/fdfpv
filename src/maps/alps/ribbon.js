/*
 * ribbon.js: a strip of surface laid along a polyline over the terrain: the
 * road, the street, the stream.
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

/*
 * A ribbon of surface along a polyline, hugging the ground: the road and
 * the stream. Each segment is a quad between offset edge points, lifted a
 * little off the terrain so it does not fight it. Returns the mesh and
 * the cumulative distances so something can drive along it.
 */
export function ribbon(points, width, lift, heightAt, material) {
  const pos = [];
  const uv = [];
  const idx = [];
  const dist = [0];
  for (let i = 1; i < points.length; i += 1) {
    dist.push(dist[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  for (let i = 0; i < points.length; i += 1) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const nx = -tz;
    const nz = tx;
    for (const side of [-1, 1]) {
      const px = points[i].x + side * nx * width / 2;
      const pz = points[i].z + side * nz * width / 2;
      pos.push(px, heightAt(px, pz) + lift, pz);
      uv.push(side > 0 ? 1 : 0, dist[i] / width);
    }
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  /* A ribbon on a slope can face either way from a given side, so both
   * faces draw. */
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return { mesh, dist, points };
}

/* Where a distance along a polyline lands, and which way it faces. */
export function alongRibbon(rib, s) {
  const total = rib.dist[rib.dist.length - 1];
  let d = s % total;
  if (d < 0) {
    d += total;
  }
  let i = 1;
  while (i < rib.dist.length - 1 && rib.dist[i] < d) {
    i += 1;
  }
  const a = rib.points[i - 1];
  const b = rib.points[i];
  const span = rib.dist[i] - rib.dist[i - 1];
  const u = span > 0 ? (d - rib.dist[i - 1]) / span : 0;
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
    yaw: Math.atan2(-(b.z - a.z), b.x - a.x),
  };
}
