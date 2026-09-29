/*
 * mesh.js: the town's faces gathered into as few meshes as the budget
 * wants (docs/ITAIPU-PLAN.md section 13: 300 draw calls a view, the
 * terrain's 120 of them).
 *
 * Every face names a building key of swiss2's photographic kit
 * (swiss2/look.js buildingFinish: a photographed surface and its finish)
 * and a tint of its own. Faces of one surface group in one quarter of the
 * hero square are one mesh, as swiss2's village bakes by group
 * (swiss2/buildings/bake.js): the tint rides in the vertex colour and the
 * finish in s2Finish, so a white wall and a brick one are one draw. A
 * quarter is 5 120 m on a side: the whole town is at most eight meshes a
 * quarter, and a view over it draws a few dozen however many buildings
 * it holds. Their vertices are about the quarter's middle, so a float
 * keeps them to a millimetre.
 *
 * Texture coordinates are metres along the face, as swiss2/look.js
 * worldUv gives them: across a wall and up it, and on a face near level
 * (or on a road, whatever its slope) in plan, so a road's asphalt runs on
 * across a change of grade without a seam.
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

/* The quarters' side, metres, and the key of one outside the hero. */
const QUARTER = 5120;

/* The quarter a point is in; a road's edge a few metres past the hero's
 * goes with the quarter it runs along. The ring's one structure names
 * its own bucket (opts.where). */
function quarterOf(x, z) {
  return `${x < 0 ? 'w' : 'e'}${z < 0 ? 'n' : 's'}`;
}

/* A growable Float32Array. */
class Floats {
  constructor() {
    this.a = new Float32Array(1 << 12);
    this.n = 0;
  }

  push3(x, y, z) {
    if (this.n + 3 > this.a.length) {
      const b = new Float32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n] = x;
    this.a[this.n + 1] = y;
    this.a[this.n + 2] = z;
    this.n += 3;
  }

  push2(u, v) {
    if (this.n + 2 > this.a.length) {
      const b = new Float32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n] = u;
    this.a[this.n + 1] = v;
    this.n += 2;
  }

  done() {
    return this.a.slice(0, this.n);
  }
}

/*
 * The sink. `look` is ctx.mats.look (buildingFinish, buildingGroups).
 * `roadMaterials` is a second set of the groups, drawn a little toward
 * the camera (polygon offset), which the roads use: coplanar with the
 * ground at a few centimetres, they would flicker through it at a
 * distance where the depth buffer cannot tell a few centimetres apart.
 */
export function makeSink(THREE, look) {
  const buckets = new Map();
  const finishes = new Map();
  const finishOf = (key) => {
    let f = finishes.get(key);
    if (!f) {
      f = look.buildingFinish(key);
      finishes.set(key, f);
    }
    return f;
  };
  let triangles = 0;

  const bucketFor = (group, x, z, opts) => {
    const q = opts.where ?? quarterOf(x, z);
    const key = `${q}|${group}|${opts.cast ? 'c' : 'n'}|${opts.road ? 'r' : 'b'}`;
    let b = buckets.get(key);
    if (!b) {
      const cx = q === 'ring' ? Math.round(x) : (q[0] === 'w' ? -1 : 1) * QUARTER / 2;
      const cz = q === 'ring' ? Math.round(z) : (q[1] === 'n' ? -1 : 1) * QUARTER / 2;
      b = {
        key, group, cast: Boolean(opts.cast), road: Boolean(opts.road), cx, cz,
        pos: new Floats(), nrm: new Floats(), uv: new Floats(), col: new Floats(), fin: new Floats(),
      };
      buckets.set(key, b);
    }
    return b;
  };

  /*
   * One convex face, [[x, y, z]...] in the world, facing `n` (its winding
   * is made to agree), in surface `key` tinted `tint`. opts: cast (casts
   * a shadow), road (the offset materials, uvs in plan), where (a bucket
   * of its own: the ring's bridge).
   */
  function face(key, tint, pts, n, opts = {}) {
    const f = finishOf(key);
    const p0 = pts[0];
    /* The face's normal from its first corner that is not in line. */
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let k = 1; k + 1 < pts.length && nx * nx + ny * ny + nz * nz < 1e-12; k += 1) {
      const a = pts[k];
      const b = pts[k + 1];
      const ux = a[0] - p0[0];
      const uy = a[1] - p0[1];
      const uz = a[2] - p0[2];
      const vx = b[0] - p0[0];
      const vy = b[1] - p0[1];
      const vz = b[2] - p0[2];
      nx = uy * vz - uz * vy;
      ny = uz * vx - ux * vz;
      nz = ux * vy - uy * vx;
    }
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(len > 1e-12)) {
      return;
    }
    let order = pts;
    if (nx * n[0] + ny * n[1] + nz * n[2] < 0) {
      order = pts.slice().reverse();
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    nx /= len;
    ny /= len;
    nz /= len;
    /* Tangent and bitangent for the metre uvs, as worldUv's. */
    let tx = 1;
    let tz = 0;
    let sx = 0;
    let sy = 0;
    let sz = -1;
    if (!opts.road && Math.abs(ny) <= 0.985) {
      const tl = Math.hypot(nz, nx);
      tx = nz / tl;
      tz = -nx / tl;
      sx = ny * tz;
      sy = nz * tx - nx * tz;
      sz = -ny * tx;
    }
    const b = bucketFor(f.group, p0[0], p0[2], opts);
    const vert = (p) => {
      b.pos.push3(p[0] - b.cx, p[1], p[2] - b.cz);
      b.nrm.push3(nx, ny, nz);
      b.uv.push2(p[0] * tx + p[2] * tz, p[0] * sx + p[1] * sy + p[2] * sz);
      b.col.push3(tint[0], tint[1], tint[2]);
      b.fin.push3(f.finish[0], f.finish[1], f.finish[2]);
    };
    for (let k = 1; k + 1 < order.length; k += 1) {
      vert(order[0]);
      vert(order[k]);
      vert(order[k + 1]);
      triangles += 1;
    }
  }

  /*
   * A square bar from p to q, `r` from its axis to each face, its sides
   * square to the world's up where it can be: a tower's leg, a brace, a
   * gantry's beam, an arch's rib (with `h` for a rib deeper than wide).
   * opts.caps false leaves its ends open: a brace's ends are inside the
   * legs it joins.
   */
  function bar(key, tint, p, q, r, opts = {}, h = r) {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const dz = q[2] - p[2];
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(l > 1e-6)) {
      return;
    }
    const d = [dx / l, dy / l, dz / l];
    /* Side: across the bar and level; up: across it and the side. */
    let s = [d[2], 0, -d[0]];
    let sl = Math.hypot(s[0], s[2]);
    if (sl < 1e-6) {
      s = [1, 0, 0];
      sl = 1;
    }
    s = [s[0] / sl, 0, s[2] / sl];
    const u = [d[1] * s[2] - d[2] * s[1], d[2] * s[0] - d[0] * s[2], d[0] * s[1] - d[1] * s[0]];
    const at = (c, a, bb) => [c[0] + s[0] * a + u[0] * bb, c[1] + s[1] * a + u[1] * bb, c[2] + s[2] * a + u[2] * bb];
    const corners = [[r, h], [-r, h], [-r, -h], [r, -h]];
    for (let k = 0; k < 4; k += 1) {
      const [a0, b0] = corners[k];
      const [a1, b1] = corners[(k + 1) % 4];
      const mid = [(a0 + a1) / 2, (b0 + b1) / 2];
      const n = [s[0] * mid[0] + u[0] * mid[1], s[1] * mid[0] + u[1] * mid[1], s[2] * mid[0] + u[2] * mid[1]];
      face(key, tint, [at(p, a0, b0), at(p, a1, b1), at(q, a1, b1), at(q, a0, b0)], n, opts);
    }
    if (opts.caps === false) {
      return;
    }
    face(key, tint, corners.map(([a, bb]) => at(q, a, bb)), d, opts);
    face(key, tint, corners.map(([a, bb]) => at(p, a, bb)), d.map((v) => -v), opts);
  }

  /*
   * The meshes, one per bucket, into `group`. `lines` are the wires,
   * chords [ax, ay, az, bx, by, bz], one LineSegments per quarter.
   */
  function build(group, lines) {
    const materials = look.buildingGroups({ glass: null, water: null });
    const roadMaterials = look.buildingGroups({ glass: null, water: null });
    for (const m of Object.values(roadMaterials)) {
      if (m) {
        m.polygonOffset = true;
        m.polygonOffsetFactor = -2;
        m.polygonOffsetUnits = -8;
      }
    }
    const meshes = [];
    for (const b of buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.pos.done(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.nrm.done(), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(b.uv.done(), 2));
      g.setAttribute('color', new THREE.BufferAttribute(b.col.done(), 3));
      g.setAttribute('s2Finish', new THREE.BufferAttribute(b.fin.done(), 3));
      g.computeBoundingSphere();
      const mat = (b.road ? roadMaterials : materials)[b.group];
      if (!mat) {
        throw new Error(`town: no material for the ${b.group} group`);
      }
      const m = new THREE.Mesh(g, mat);
      m.name = `itaipu-town-${b.key.replaceAll('|', '-')}`;
      m.position.set(b.cx, 0, b.cz);
      m.castShadow = b.cast;
      m.receiveShadow = true;
      group.add(m);
      meshes.push(m);
    }
    const byQuarter = new Map();
    for (const c of lines) {
      const q = quarterOf((c[0] + c[3]) / 2, (c[2] + c[5]) / 2);
      if (!byQuarter.has(q)) {
        byQuarter.set(q, []);
      }
      byQuarter.get(q).push(c);
    }
    /* A conductor is a few centimetres of weathered aluminium: a pixel
     * wide line of it is far wider than it looks, and a dozen parallel
     * ones drawn solid made a black band across every view from the air.
     * Half seen, in the grey it has against the sky. */
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x4a4d50, transparent: true, opacity: 0.45, depthWrite: false,
    });
    let segments = 0;
    for (const [q, list] of byQuarter) {
      const cx = (q[0] === 'w' ? -1 : 1) * QUARTER / 2;
      const cz = (q[1] === 'n' ? -1 : 1) * QUARTER / 2;
      const a = new Float32Array(list.length * 6);
      list.forEach((c, i) => {
        a.set([c[0] - cx, c[1], c[2] - cz, c[3] - cx, c[4], c[5] - cz], i * 6);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      g.computeBoundingSphere();
      const l = new THREE.LineSegments(g, lineMat);
      l.name = `itaipu-town-wires-${q}`;
      l.position.set(cx, 0, cz);
      group.add(l);
      segments += list.length;
    }
    return { meshes: meshes.length, lines: byQuarter.size, segments, triangles };
  }

  return {
    face, bar, build, triangles: () => triangles,
  };
}
