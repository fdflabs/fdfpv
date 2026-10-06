/*
 * sink.js: the merged meshes the Interior's buildings and their yards are
 * drawn into, and the solids that stand for them. A sink grows
 * triangles with a flat normal, a colour and a texture coordinate; a
 * mesh is made of it once, so a material's whole site is one draw.
 *
 * TEXTURE COORDINATES are the face's own, in metres: u level along the
 * face, v up its slope (straight up a wall, up the fall line of a roof),
 * so a skin (skins.js) lies the same way on every face whatever the
 * building's turn, a tin rib runs down every roof and a course of tiles
 * lies level on it. `swap` turns them a quarter, for a silo's ribs that
 * ring its drum. A sink's period divides them into repeats of its skin.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* A growing merged mesh; period [pu, pv] metres a repeat of its skin. */
export function makeSink(period = [1, 1]) {
  const pos = [];
  const nrm = [];
  const col = [];
  const uv = [];
  const [pu, pv] = period;
  return {
    pos,
    nrm,
    col,
    uv,
    get triangles() {
      return pos.length / 9;
    },
    tri(a, b, c, colour, swap = false) {
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      /* The face's level direction t and its up slope direction s. */
      let tx = 1;
      let tz = 0;
      let sx = 0;
      let sy = 0;
      let sz = 1;
      const h = Math.sqrt(nx * nx + nz * nz);
      if (h > 1e-3) {
        tx = nz / h;
        tz = -nx / h;
        sx = ny * tz;
        sy = nz * tx - nx * tz;
        sz = -ny * tx;
      }
      for (const p of [a, b, c]) {
        pos.push(p[0], p[1], p[2]);
        nrm.push(nx, ny, nz);
        col.push(colour[0], colour[1], colour[2]);
        const u = p[0] * tx + p[2] * tz;
        const v = p[0] * sx + p[1] * sy + p[2] * sz;
        if (swap) {
          uv.push(v / pu, u / pv);
        } else {
          uv.push(u / pu, v / pv);
        }
      }
    },
    quad(a, b, c, d, colour, swap = false) {
      this.tri(a, b, c, colour, swap);
      this.tri(a, c, d, colour, swap);
    },
    /* A triangle with its own vertex normals and colours (a crown's
     * round shading); no skin. */
    triN(a, b, c, na, nb, nc, ca, cb, cc) {
      for (const [p, n, k] of [[a, na, ca], [b, nb, cb], [c, nc, cc]]) {
        pos.push(p[0], p[1], p[2]);
        nrm.push(n[0], n[1], n[2]);
        col.push(k[0], k[1], k[2]);
        uv.push(0, 0);
      }
    },
  };
}

export function meshOf(THREE, sink, mat, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sink.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(sink.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(sink.col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(sink.uv, 2));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* A building's frame: centre (cx, cz), long axis (dx, dz). at(u, v, y)
 * is the world point u along the axis, v across it (toward (-dz, dx)). */
export function frameOf(cx, cz, dx, dz) {
  return {
    cx,
    cz,
    dx,
    dz,
    at: (u, v, y) => [cx + dx * u - dz * v, y, cz + dz * u + dx * v],
  };
}

/* A box in a building's frame: centre (cx, cz), long axis (dx, dz), w
 * along it, d across, at height y. Its corners, world. */
export function corners(cx, cz, dx, dz, w, d, y) {
  const ax = dx * (w / 2);
  const az = dz * (w / 2);
  const bx = -dz * (d / 2);
  const bz = dx * (d / 2);
  return [
    [cx - ax - bx, y, cz - az - bz],
    [cx + ax - bx, y, cz + az - bz],
    [cx + ax + bx, y, cz + az + bz],
    [cx - ax + bx, y, cz - az + bz],
  ];
}

export function boxInto(sink, cx, cz, dx, dz, w, d, y0, y1, colour, top = true, swap = false) {
  const lo = corners(cx, cz, dx, dz, w, d, y0);
  const hi = corners(cx, cz, dx, dz, w, d, y1);
  for (let k = 0; k < 4; k += 1) {
    const k2 = (k + 1) % 4;
    sink.quad(lo[k], lo[k2], hi[k2], hi[k], colour, swap);
  }
  if (top) {
    sink.quad(hi[3], hi[2], hi[1], hi[0], colour, swap);
  }
}

/* An upright n sided drum about (cx, cz), radius r to its corners. */
export function drumInto(sink, cx, cz, r, y0, y1, n, colour, { top = true, swap = false, cap = null } = {}) {
  for (let k = 0; k < n; k += 1) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const p0 = [cx + r * Math.cos(a0), y0, cz + r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), y0, cz + r * Math.sin(a1)];
    sink.quad(p0, p1, [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], colour, swap);
    if (top) {
      sink.tri([p1[0], y1, p1[2]], [p0[0], y1, p0[2]], [cx, y1, cz], cap || colour);
    }
  }
}

/* A flat quad standing on a wall face: centre (x, z) on the face, outward
 * normal (nx, nz), half width hw, from y0 to y1, wound to face out. */
export function faceQuad(sink, x, z, nx, nz, hw, y0, y1, colour) {
  const rx = nz * hw;
  const rz = -nx * hw;
  sink.quad([x - rx, y0, z - rz], [x + rx, y0, z + rz], [x + rx, y1, z + rz], [x - rx, y1, z - rz], colour);
}

/* A turned box collider for the same box; returns its index. */
export function solidBox(colliders, kind, cx, cz, dx, dz, w, d, y0, y1) {
  const u = cx * dx + cz * dz;
  const v = -cx * dz + cz * dx;
  return colliders.addTurnedBox(kind, dx, dz, u - w / 2, u + w / 2, y0, y1, v - d / 2, v + d / 2);
}

/* The shortest distance from (x, z) to a polyline [[x, z]...]. */
export function lineDistance(points, x, z) {
  if (points.length === 1) {
    return Math.hypot(x - points[0][0], z - points[0][1]);
  }
  let best = Infinity;
  for (let k = 0; k + 1 < points.length; k += 1) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const l = vx * vx + vz * vz;
    const t = l > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l)) : 0;
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

/* A number in [0, 1) from a string and a salt, for choices that must be
 * the same on every load. */
export function seeded(id, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
