/*
 * mesh.js: how the props are drawn: triangles in world space with flat
 * normals and vertex colours, into one mesh per group, all with one
 * material program. The static props and the lakeside share it.
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
import { roofTop } from '../../alps/roofs.js';

export const UP = new THREE.Vector3(0, 1, 0);

/*
 * Triangles in world space with flat normals and vertex colours, for the
 * one static mesh.
 */
export class Mesher {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
  }

  /* One vertex with its own normal and colour. */
  vert(p, n, colour) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(colour[0], colour[1], colour[2]);
  }

  tri(a, b, c, colour) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c]) {
      this.vert(p, n, colour);
    }
  }

  /* A quad a, b, c, d counter clockwise seen from its front. */
  quad(a, b, c, d, colour) {
    this.tri(a, b, c, colour);
    this.tri(a, c, d, colour);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/*
 * The props' material: vertex colour and nothing else, the same program
 * as the cattle's (look.js's 'fauna' parts). A textured material of its
 * own was a new shader program, and every program swiss2 adds past the
 * ones it has costs twelve console warnings at load (GL_INVALID_VALUE,
 * glGetProgramiv: three's bake materials are disposed while the new
 * programs link), which the views' gate holds at fourteen. The boards'
 * grain is laid as geometry instead: a hut's walls are strips of board
 * each its own shade, which is what the photograph showed from thirty
 * metres anyway.
 */
export function propMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
}

/* A colour a little lighter or darker, for one board or one row of
 * shingles. */
export const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/* A box with its centre at c, its axes ex, ey, ez (unit) and half sizes
 * hx, hy, hz, wound to face out. `tones` shades its six faces from one
 * colour, the top lightest. */
export function box(m, c, ex, ey, ez, hx, hy, hz, colour, tones = [0.92, 0.92, 1.05, 0.7, 0.86, 0.86]) {
  const at = (a, b, d) => c.clone().addScaledVector(ex, a * hx).addScaledVector(ey, b * hy).addScaledVector(ez, d * hz);
  const faces = [
    [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
    [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]],
    [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]],
    [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
  ];
  faces.forEach((f, k) => {
    m.quad(...f.map((q) => at(...q)), shade(colour, tones[k]));
  });
}

/* The frame (ex along the ground, ez across, ey up) of a thing standing
 * at yaw. */
export const frame = (yaw) => [new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), UP.clone(), new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw))];

/*
 * The albedo, linear, a finish of the village's kit has from afar, where
 * its photograph is a single colour: the finish's tint (look.js) times
 * the mean of its surface's photograph (assets/swiss2/*_col.jpg: boards
 * 0.074 0.049 0.033, render 0.681 0.652 0.630, shingle 0.129 0.104
 * 0.078, slate 0.037 0.040 0.037, the ribbed sheet 0.402 0.450 0.428).
 */
const ALBEDO = {
  larchDark: [0.053, 0.030, 0.018],
  larch: [0.089, 0.049, 0.027],
  weathered: [0.111, 0.071, 0.048],
  render: [0.409, 0.381, 0.347],
  renderCream: [0.422, 0.346, 0.233],
  shingle: [0.080, 0.060, 0.043],
  shingleDark: [0.065, 0.049, 0.034],
  shingleMossy: [0.067, 0.052, 0.035],
  shingleNew: [0.123, 0.075, 0.041],
  tile: [0.168, 0.057, 0.030],
  slate: [0.043, 0.046, 0.044],
  slateNew: [0.022, 0.025, 0.024],
  tinSheet: [0.121, 0.135, 0.128],
  tinRustSheet: [0.189, 0.086, 0.040],
};
export function albedoOf(key) {
  const a = ALBEDO[key];
  if (!a) {
    throw new Error(`props: no far albedo for ${key}; add it to mesh.js ALBEDO`);
  }
  return a;
}

/*
 * The far stand-in for a building of the village's kit (buildings/): its
 * walls and its roof in the props' colours, a few dozen triangles, drawn
 * in the props' one static mesh at every distance, so a building whose
 * kit geometry is drawn only near (bake.js) is still there from afar and
 * casts its shadow, for no draw of its own. It is made from the
 * building's roof record (alps/roofs.js), whose walls are the roof's own
 * rectangle: the walls `inset` inside it, from `low` to a hand under the
 * roof's underside, and the roof's upper faces lowered into the drawn
 * roof's thickness (and by its sag) and drawn upward only. So wherever
 * the kit's building is drawn the stand-in is inside it and unseen.
 * `wall(y)` is the walls' colour at height y, `roof` the roof's.
 */
export function roofProxy(m, rec, {
  low, inset, wall, roof,
}) {
  const toWorld = (lx, y, lz) => new THREE.Vector3(rec.c * lx + rec.s * lz + rec.tx, y, -rec.s * lx + rec.c * lz + rec.tz);
  const base = rec.lift + rec.ty;
  const drop = rec.dy / 2 + (rec.sag ? rec.sag.v : 0);
  for (const f of rec.faces) {
    const n = f.pts.length;
    const cx = f.pts.reduce((s, p) => s + p[0], 0) / n;
    const cz = f.pts.reduce((s, p) => s + p[1], 0) / n;
    const pts = f.pts.map(([x, z]) => {
      const l = Math.hypot(x - cx, z - cz) || 1;
      const k = Math.max(0, 1 - 0.06 / l);
      const px = cx + (x - cx) * k;
      const pz = cz + (z - cz) * k;
      return toWorld(px, base + f.a * px + f.b * pz + f.d - drop, pz);
    });
    /* Wound to face up, whichever way the record lists it. */
    const e1 = new THREE.Vector3().subVectors(pts[1], pts[0]);
    const e2 = new THREE.Vector3().subVectors(pts[2], pts[0]);
    const ring = e1.cross(e2).y > 0 ? pts : [...pts].reverse();
    for (let i = 1; i + 1 < ring.length; i += 1) {
      m.tri(ring[0], ring[i], ring[i + 1], roof);
    }
  }
  if (rec.open) {
    return;
  }
  /* The walls, each side in four pieces whose tops follow the roof's
   * underside: a chord under a ridge line stays under it. */
  const hw = rec.hw - inset;
  const hd = rec.hd - inset;
  const corners = [[hw, hd], [hw, -hd], [-hw, -hd], [-hw, hd]];
  const topAt = (lx, lz) => {
    const p = toWorld(lx, 0, lz);
    return roofTop(rec, p.x, p.z) - rec.dy - 0.05;
  };
  for (let k = 0; k < 4; k += 1) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    for (let q = 0; q < 4; q += 1) {
      const u0 = [a[0] + ((b[0] - a[0]) * q) / 4, a[1] + ((b[1] - a[1]) * q) / 4];
      const u1 = [a[0] + ((b[0] - a[0]) * (q + 1)) / 4, a[1] + ((b[1] - a[1]) * (q + 1)) / 4];
      const t0 = topAt(...u0);
      const t1 = topAt(...u1);
      if (!Number.isFinite(t0) || !Number.isFinite(t1)) {
        continue;
      }
      const p = [toWorld(u0[0], low, u0[1]), toWorld(u1[0], low, u1[1]), toWorld(u1[0], t1, u1[1]), toWorld(u0[0], t0, u0[1])];
      /* Wound to face away from the building's middle. */
      const out = toWorld((u0[0] + u1[0]) / 2, 0, (u0[1] + u1[1]) / 2).sub(toWorld(0, 0, 0));
      const nrm = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[3], p[0]));
      m.quad(...(nrm.dot(out) > 0 ? p : [p[1], p[0], p[3], p[2]]), wall((t0 + t1) / 2));
    }
  }
}
