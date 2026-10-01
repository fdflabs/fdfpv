/*
 * meet.js: where Itaipu's water meets the dam's concrete (docs/ITAIPU-PLAN.md
 * section 5, package E). Pure, no three.js, so a check in Node reads it.
 *
 * WATER MEETS THE CONCRETE. water.json's outlines are traced on the
 * terrain's 10 m grid and then cut down to the plant's 256 corners a
 * body, so along a concrete face they are a stair of 10 m steps, or a
 * chord across a curved face tens of metres short of it (the right
 * lateral dam); and the ground under and round a part's footprint is
 * flattened below the water (dam.json groundY). Every place the outline
 * stopped short of a face was a wedge with no water in it, open down onto
 * that ground: the void the owner saw between the dam and the reservoir
 * (2026-10-01), and the same along the powerhouse's tailrace face.
 *
 * So, near the dam, the outline is cut into pieces of at most STEP; every
 * vertex within FACE_BAND of a footprint's edge, with that body's water
 * WET_PROBE off it, and not already under the part by more than
 * FACE_INSET, is moved onto the edge FACE_INSET under the concrete;
 * between two vertices moved onto one part the outline runs round that
 * part's corners; and a run of vertices on one face keeps only its ends.
 * The water's edge is then the footprint's, a metre inside the drawn face
 * (which stands on the footprint's edge, dam/index.js), where the face
 * hides it. Applied to the data as it is read (src/maps/itaipu.js), so the
 * drawn sheet, the depth field and the plant's lake are one outline.
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

import { insideWater } from '../../../game/water.js';

/* Metres: how far under the concrete the water's edge goes; how far off
 * a face a vertex is taken from (two cells: the tailrace's stair stands
 * 18 m off the powerhouse in front of the rock at x 180 to 280); how far
 * off the face the body must have water for the face to be its; the
 * longest piece of outline near the dam. */
const FACE_INSET = 1;
const FACE_BAND = 20;
const WET_PROBE = 25;
const STEP = 5;

/* Every footprint of `dam` as { ring (a lake, for insideWater), box,
 * edges: [{ a, u (along), n (out), len, part (its index), i (its index
 * round the ring) }] }. */
function footprints(dam) {
  const out = [];
  for (const part of dam) {
    /* Corners closer than two insets are one: OpenStreetMap's footprints
     * carry 0.1 m edges (the left lateral dam's east end), whose inset
     * corners cross each other. */
    const f = [];
    for (const p of part.footprint || []) {
      if (!f.length || Math.hypot(p[0] - f.at(-1)[0], p[1] - f.at(-1)[1]) > 2 * FACE_INSET) {
        f.push(p);
      }
    }
    if (f.length > 1 && Math.hypot(f[0][0] - f.at(-1)[0], f[0][1] - f.at(-1)[1]) <= 2 * FACE_INSET) {
      f.pop();
    }
    if (f.length < 3) {
      continue;
    }
    let twice = 0;
    for (let i = 0, k = f.length - 1; i < f.length; k = i, i += 1) {
      twice += f[k][0] * f[i][1] - f[i][0] * f[k][1];
    }
    /* Out is to the right of the edge's way round a ring winding with
     * positive area in (x, z), to its left otherwise. */
    const s = twice > 0 ? 1 : -1;
    const edges = [];
    for (let i = 0, k = f.length - 1; i < f.length; k = i, i += 1) {
      const ex = f[i][0] - f[k][0];
      const ez = f[i][1] - f[k][1];
      const len = Math.hypot(ex, ez);
      if (len > 0) {
        edges.push({
          a: f[k], u: [ex / len, ez / len], n: [(s * ez) / len, (-s * ex) / len], len, part: out.length, i: edges.length,
        });
      }
    }
    const xs = f.map((p) => p[0]);
    const zs = f.map((p) => p[1]);
    out.push({
      ring: { kind: 'lake', outline: f.map(([x, z]) => ({ x, z })) },
      box: [Math.min(...xs) - FACE_BAND, Math.max(...xs) + FACE_BAND, Math.min(...zs) - FACE_BAND, Math.max(...zs) + FACE_BAND],
      edges,
    });
  }
  return out;
}

/* (x, z) against edge e: t along it, d out from it (negative inside),
 * and how far it is from the edge as a segment. */
function across(e, x, z) {
  const dx = x - e.a[0];
  const dz = z - e.a[1];
  const t = dx * e.u[0] + dz * e.u[1];
  const c = Math.max(0, Math.min(e.len, t));
  return { t, d: dx * e.n[0] + dz * e.n[1], off: Math.hypot(dx - e.u[0] * c, dz - e.u[1] * c) };
}

/* Whether (x, z) is under a part by more than FACE_INSET: the water
 * there is already hidden, and is left where it is. */
function deepUnder(parts, x, z) {
  return parts.some((f) => insideWater(f.ring, x, z) && f.edges.every((e) => across(e, x, z).off > FACE_INSET));
}

/* `outline` with every edge that comes within a footprint's box cut into
 * pieces of at most STEP, as [x, z, own]: own for the outline's own vertex,
 * which stays whether or not it is moved; the rest as it was. */
function near(outline, parts) {
  const out = [];
  for (let i = 0; i < outline.length; i += 1) {
    const [ax, az] = outline[i];
    const [bx, bz] = outline[(i + 1) % outline.length];
    const hit = parts.some(({ box: [x0, x1, z0, z1] }) => Math.max(ax, bx) >= x0 && Math.min(ax, bx) <= x1
      && Math.max(az, bz) >= z0 && Math.min(az, bz) <= z1);
    const n = hit ? Math.ceil(Math.hypot(bx - ax, bz - az) / STEP) : 1;
    for (let k = 0; k < n; k += 1) {
      out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, k === 0]);
    }
  }
  return out;
}

/* (x, z) on the nearest wet face within the band, FACE_INSET under the
 * concrete, as { e, p }; or null to stay where it is. */
function onFace(parts, edges, lake, x, z) {
  if (deepUnder(parts, x, z)) {
    return null;
  }
  let best = null;
  for (const e of edges) {
    const { t, d } = across(e, x, z);
    if (t < -STEP || t > e.len + STEP || d > FACE_BAND || d <= -FACE_INSET || (best && Math.abs(d) >= Math.abs(best.d))) {
      continue;
    }
    const c = Math.max(0, Math.min(e.len, t));
    const fx = e.a[0] + e.u[0] * c;
    const fz = e.a[1] + e.u[1] * c;
    if (insideWater(lake, fx + e.n[0] * WET_PROBE, fz + e.n[1] * WET_PROBE)) {
      best = { d, e, p: [fx - e.n[0] * FACE_INSET, fz - e.n[1] * FACE_INSET] };
    }
  }
  return best;
}

/* Where edge e meets the next one round its ring, FACE_INSET under the
 * concrete along both their normals. */
function corner(e, next) {
  const nx = e.n[0] + next.n[0];
  const nz = e.n[1] + next.n[1];
  const l = Math.hypot(nx, nz) || 1;
  return [e.a[0] + e.u[0] * e.len - (nx / l) * FACE_INSET, e.a[1] + e.u[1] * e.len - (nz / l) * FACE_INSET];
}

/* The corners between edges v and w of one ring, the way round with
 * fewer, in order from v. */
function cornersBetween(ring, v, w) {
  const n = ring.length;
  const ahead = (w.i - v.i + n) % n;
  const out = [];
  if (ahead <= n - ahead) {
    for (let j = 0; j < ahead; j += 1) {
      const e = ring[(v.i + j) % n];
      out.push(corner(e, ring[(e.i + 1) % n]));
    }
  } else {
    for (let j = 1; j <= n - ahead; j += 1) {
      const e = ring[(v.i - j + n) % n];
      out.push(corner(e, ring[(e.i + 1) % n]));
    }
  }
  return out;
}

/* water.json's bodies with their outlines brought to dam.json's wet
 * faces, as new bodies. */
export function meetDam(bodies, dam) {
  const parts = footprints(dam);
  const edges = parts.flatMap((f) => f.edges);
  return bodies.map((body) => {
    const lake = { kind: 'lake', outline: body.outline.map(([x, z]) => ({ x, z })) };
    const placed = near(body.outline, parts).map(([x, z, own]) => onFace(parts, edges, lake, x, z) || { e: null, p: [x, z], own });
    const round = [];
    placed.forEach((v, k) => {
      const prev = placed[(k - 1 + placed.length) % placed.length];
      const next = placed[(k + 1) % placed.length];
      /* A vertex between two others on its own part adds nothing: the
       * part's corners carry the outline from one to the other. */
      if (!(v.e && prev.e?.part === v.e.part && next.e?.part === v.e.part) && (v.e || v.own)) {
        round.push(v.p);
      }
      if (v.e && next.e && v.e !== next.e && v.e.part === next.e.part) {
        round.push(...cornersBetween(parts[v.e.part].edges, v.e, next.e));
      }
    });
    const outline = [];
    for (const p of round) {
      const last = outline[outline.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) {
        outline.push(p);
      }
    }
    if (outline.length > 1 && Math.hypot(outline[0][0] - outline.at(-1)[0], outline[0][1] - outline.at(-1)[1]) <= 0.01) {
      outline.pop();
    }
    return { ...body, outline };
  });
}

/*
 * For a check (scripts/dam-check.js waterline): points `off` metres out
 * from every footprint edge, every `step` metres along it and clear of
 * its ends by `step`, where `bodies` (water.json's own) has water
 * WET_PROBE off it and within FACE_BAND straight out from it, as { body
 * (its name), y (its level), x, z }: each a place meetDam takes that
 * body's water to the face, so where water must meet it. Past where a
 * body's own water ends along a face (the tailrace's east end), the face
 * is the bank's business, not the water's.
 */
export function wetFaces(bodies, dam, step, off) {
  const out = [];
  for (const e of footprints(dam).flatMap((f) => f.edges)) {
    for (const body of bodies) {
      const lake = { kind: 'lake', outline: body.outline.map(([x, z]) => ({ x, z })) };
      for (let t = step; t <= e.len - step; t += step) {
        const fx = e.a[0] + e.u[0] * t;
        const fz = e.a[1] + e.u[1] * t;
        let near = false;
        for (let r = off; r <= FACE_BAND && !near; r += 1) {
          near = insideWater(lake, fx + e.n[0] * r, fz + e.n[1] * r);
        }
        if (near && insideWater(lake, fx + e.n[0] * WET_PROBE, fz + e.n[1] * WET_PROBE)) {
          out.push({
            body: body.name, y: body.y, x: fx + e.n[0] * off, z: fz + e.n[1] * off,
          });
        }
      }
    }
  }
  return out;
}
