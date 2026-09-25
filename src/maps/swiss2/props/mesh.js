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
