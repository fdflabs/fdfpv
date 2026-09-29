/*
 * mesh.js: the town's faces gathered into as few draw calls as the budget
 * wants (docs/ITAIPU-PLAN.md section 13: 300 draw calls and 2.5 M
 * triangles a view, shadow maps and mirror included).
 *
 * Every face names a building key of swiss2's photographic kit
 * (swiss2/look.js buildingFinish: a photographed surface and its finish)
 * and a tint of its own. The tint rides in the vertex colour and the
 * finish in s2Finish, so a white wall and a brick one are one material,
 * as swiss2's village bakes by group (swiss2/buildings/bake.js).
 *
 * Faces of one surface group are one BatchedMesh, one draw call a pass,
 * cut into chunks CHUNK metres on a side that each pass culls to its own
 * frustum. Drawn whole, as the quarters of the hero square they were
 * first (5 120 m on a side), the town was 0.73 M triangles in every pass
 * that saw a corner of it, both shadow maps included, and 1.3 to 2.2 M
 * of every costly view (docs/ITAIPU-LOOP.md, round 0). Chunked, the near
 * shadow map draws the few chunks round the craft and the far one those
 * in its 1.4 km square; nothing past that casts at all.
 *
 * The chunks' vertices are in the world, with the batch at the origin
 * and every instance matrix the identity: the lit and weather shaders
 * (itaipu/look/light.js, swiss2/look.js) take the world position from
 * modelMatrix alone, not the batch's per chunk matrix. A float holds a
 * point 5 120 m out to half a millimetre.
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

/* The chunks' side, metres: small enough that the near shadow map's
 * 144 m square draws a handful, large enough that a batch holds a few
 * hundred and culls them in well under a millisecond a pass. */
const CHUNK = 320;

/* The chunk a point is in. The ring's one structure names its own
 * bucket (opts.where). */
function chunkOf(x, z) {
  return `${Math.floor(x / CHUNK)}_${Math.floor(z / CHUNK)}`;
}

/*
 * Where a chunk's near detail gives way to its far detail: its bounding
 * sphere this far from the camera, metres. The detail is a tower's
 * bracing, 83 % of a tower's triangles: near, square bars of 0.2 m; far,
 * each a flat strip in its face of the tower, a quarter of the triangles.
 * At 600 m a pixel of the views' 44 degree lens is 0.54 m, so a brace is
 * a thin dotted line either way; dropping the far bracing outright left
 * bare legs where the lattice still read at a kilometre (river-below).
 */
const NEAR = 600;

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
  /* The chunks with a lod, { mesh, id, sphere, near, shown }, once built. */
  const detail = [];

  const bucketFor = (group, x, z, opts) => {
    const q = opts.where ?? chunkOf(x, z);
    const batch = `${group}-${opts.cast ? 'c' : 'n'}-${opts.road ? 'r' : 'b'}`;
    const key = `${q}|${batch}|${opts.lod ?? 'all'}`;
    let b = buckets.get(key);
    if (!b) {
      /* The ring's structure is a mesh of its own about its own middle;
       * a chunk is in the world, as its batch. */
      const ring = q === 'ring';
      b = {
        key,
        q,
        batch,
        ring,
        group,
        cast: Boolean(opts.cast),
        road: Boolean(opts.road),
        lod: opts.lod ?? null,
        cx: ring ? Math.round(x) : 0,
        cz: ring ? Math.round(z) : 0,
        pos: new Floats(),
        nrm: new Floats(),
        uv: new Floats(),
        col: new Floats(),
        fin: new Floats(),
      };
      buckets.set(key, b);
    }
    return b;
  };

  /*
   * One convex face, [[x, y, z]...] in the world, facing `n` (its winding
   * is made to agree), in surface `key` tinted `tint`. opts: cast (casts
   * a shadow), road (the offset materials, uvs in plan), lod ('near',
   * drawn only while its chunk is within NEAR of the camera, or 'far',
   * only while it is not), where (a bucket of its own: the ring's
   * bridge, which has no lod).
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
   * The meshes into `group`: a BatchedMesh a batch (surface group,
   * casting or not, road or not) holding its chunks, and the ring's
   * structure as plain meshes. `lines` are the wires, chords
   * [ax, ay, az, bx, by, bz], one LineSegments.
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
    const materialOf = (b) => {
      const mat = (b.road ? roadMaterials : materials)[b.group];
      if (!mat) {
        throw new Error(`town: no material for the ${b.group} group`);
      }
      return mat;
    };
    const geometryOf = (b) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.pos.done(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.nrm.done(), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(b.uv.done(), 2));
      g.setAttribute('color', new THREE.BufferAttribute(b.col.done(), 3));
      g.setAttribute('s2Finish', new THREE.BufferAttribute(b.fin.done(), 3));
      return g;
    };
    const batches = new Map();
    let rings = 0;
    for (const b of buckets.values()) {
      if (b.ring) {
        const g = geometryOf(b);
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, materialOf(b));
        m.name = `itaipu-town-${b.key.replaceAll('|', '-')}`;
        m.position.set(b.cx, 0, b.cz);
        m.castShadow = b.cast;
        m.receiveShadow = true;
        group.add(m);
        rings += 1;
      } else if (batches.has(b.batch)) {
        batches.get(b.batch).push(b);
      } else {
        batches.set(b.batch, [b]);
      }
    }
    let chunks = 0;
    const spheres = new Map();
    for (const [name, list] of batches) {
      const geoms = list.map(geometryOf);
      const verts = geoms.reduce((n, g) => n + g.getAttribute('position').count, 0);
      const m = new THREE.BatchedMesh(geoms.length, verts, 0, materialOf(list[0]));
      /* A road batch's name ends in -r: scripts/town-check.js drapes
       * those. */
      m.name = `itaipu-town-${name}`;
      m.castShadow = list[0].cast;
      m.receiveShadow = true;
      /* The batch's sphere is the whole town's: the chunks cull
       * themselves, in every pass. */
      m.frustumCulled = false;
      geoms.forEach((g, k) => {
        const id = m.addGeometry(g);
        const b = list[k];
        if (b.lod) {
          /* One sphere a chunk, whichever of its lods is built first, so
           * its near and far detail swap at one distance. */
          if (!spheres.has(b.q)) {
            g.computeBoundingSphere();
            spheres.set(b.q, g.boundingSphere);
          }
          detail.push({
            mesh: m, id, sphere: spheres.get(b.q), near: b.lod === 'near', shown: true,
          });
        }
        g.dispose();
      });
      group.add(m);
      chunks += geoms.length;
    }
    /* A conductor is a few centimetres of weathered aluminium: a pixel
     * wide line of it is far wider than it looks, and a dozen parallel
     * ones drawn solid made a black band across every view from the air.
     * Half seen, in the grey it has against the sky. */
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x4a4d50, transparent: true, opacity: 0.45, depthWrite: false,
    });
    const a = new Float32Array(lines.length * 6);
    lines.forEach((c, i) => {
      a.set(c, i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    g.computeBoundingSphere();
    const l = new THREE.LineSegments(g, lineMat);
    l.name = 'itaipu-town-wires';
    group.add(l);
    return {
      meshes: batches.size + rings, chunks, detail: detail.length, lines: 1, segments: lines.length, triangles,
    };
  }

  /* Once a frame, before the draw: each chunk's near detail shown while
   * the chunk is within NEAR of the camera, its far detail otherwise. */
  function view(camera) {
    const eye = camera.position;
    for (const d of detail) {
      const show = (d.sphere.distanceToPoint(eye) < NEAR) === d.near;
      if (show !== d.shown) {
        d.mesh.setVisibleAt(d.id, show);
        d.shown = show;
      }
    }
  }

  return {
    face, bar, build, view, triangles: () => triangles,
  };
}
