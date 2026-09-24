/*
 * species.js: the valley's trees as geometry, built from seeded rules
 * and dressed in the atlas's photographed twigs and leaves.
 *
 * Norway spruce is the valley's forest: a narrow spire thirty metres
 * high, whorls of branches that leave the trunk level and droop, and
 * curtains of twigs hanging under each branch. Silver fir mixes in on
 * the middle slopes: flatter, darker sprays held level, a crown that
 * stays wider and blunter. Larch takes over toward the tree line: light
 * green tufts on thin rising branches, the trunk seen through them.
 * Beech and sycamore maple stand on the lower slopes and along the
 * stream: a grey trunk into a few limbs and a round crown of leaf
 * clusters.
 *
 * A conifer's branch is two crossed cards of the species' spray along a
 * drooping curve, with a hanging curtain under it for the spruce; a
 * broadleaf's crown is leaf clusters scattered through an ellipsoid shell
 * round its limbs. Every card's normal is bent outward from the crown's
 * axis (or centre), so the crown shades as one soft mass the way a real
 * one does from any distance, and every vertex carries an occlusion
 * colour, dark at the trunk and low in the crown, and a flutter weight
 * for the wind (aFlex).
 *
 * Each variant is built twice: 'near', the whole tree with its bark as a
 * second geometry for the tiled bark material; and 'mid', a third of the
 * cards, twice the size, with the trunk drawn from the atlas's bark
 * strip so the whole tree is one draw.
 *
 * Model units are metres, the tree standing on the origin, growing up +y.
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
import { makeRng } from '../../alps/noise.js';
import { REGIONS } from './atlas.js';

/*
 * The variants, each a species at one habit. `forest` variants are drawn
 * from a closed stand, the lower trunk bare where the neighbours shade
 * it; `open` ones grew alone, branches to the ground. h is the model's
 * height in metres (instances scale it by 0.7 to 1.25). At most ten: the
 * impostor atlas holds ten variants of twenty four views.
 */
export const VARIANTS = [
  { name: 'spruce-forest', kind: 'spruce', seed: 101, h: 30, crownBase: 0.34, reach: 4.0, step: 0.62, per: 6 },
  { name: 'spruce-young', kind: 'spruce', seed: 102, h: 20, crownBase: 0.22, reach: 3.7, step: 0.55, per: 5 },
  { name: 'spruce-open', kind: 'spruce', seed: 103, h: 22, crownBase: 0.05, reach: 5.2, step: 0.55, per: 6 },
  { name: 'fir-forest', kind: 'fir', seed: 201, h: 28, crownBase: 0.3, reach: 4.4, step: 0.7, per: 5 },
  { name: 'fir-open', kind: 'fir', seed: 202, h: 18, crownBase: 0.06, reach: 5.0, step: 0.6, per: 5 },
  { name: 'larch-tall', kind: 'larch', seed: 301, h: 26, crownBase: 0.28, reach: 3.9, step: 0.95, per: 4 },
  { name: 'larch-open', kind: 'larch', seed: 302, h: 17, crownBase: 0.1, reach: 4.2, step: 0.8, per: 4 },
  { name: 'beech-tall', kind: 'beech', seed: 401, h: 24, trunk: 0.34, rx: 0.3, ry: 0.36 },
  { name: 'beech-open', kind: 'beech', seed: 402, h: 17, trunk: 0.22, rx: 0.42, ry: 0.4 },
  { name: 'maple', kind: 'maple', seed: 501, h: 18, trunk: 0.28, rx: 0.4, ry: 0.38 },
];

/* The shapes of the conifer species, over what VARIANTS sets. pitch is
 * the angle a branch leaves the trunk at, low in the crown and at the
 * top (radians, up positive); droop how far its curve falls per unit of
 * length; roll the tilt of its two cards either side of level. */
const CONIFER = {
  spruce: { region: 'spruce', pitch0: -0.42, pitch1: 0.35, droop: 0.34, tipUp: 0.22, roll: 0.72, curtain: 0.55, trunkR: 0.3, profile: (s) => Math.pow(1 - s, 0.92), bark: [0.95, 0.9, 0.86] },
  fir: { region: 'fir', pitch0: -0.12, pitch1: 0.25, droop: 0.12, tipUp: 0.08, roll: 0.6, curtain: 0, trunkR: 0.32, profile: (s) => Math.min(1, 1.25 * Math.pow(1 - s, 0.62)) * (s > 0.9 ? 0.75 : 1), bark: [0.82, 0.84, 0.86] },
  larch: { region: 'larch', pitch0: -0.08, pitch1: 0.55, droop: 0.22, tipUp: 0.1, roll: 0.75, curtain: 0, trunkR: 0.28, profile: (s) => Math.pow(1 - s, 0.85), bark: [1.05, 0.86, 0.74] },
};

class Builder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.flex = [];
    this.idx = [];
  }

  vert(p, n, u, v, c, f) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.flex.push(f);
    return this.pos.length / 3 - 1;
  }

  /* Two rows of vertices along a strip become its quads. */
  strip(a, b) {
    for (let k = 0; k + 1 < a.length; k += 1) {
      this.idx.push(a[k], b[k], a[k + 1], a[k + 1], b[k], b[k + 1]);
    }
  }

  geometry() {
    if (!this.idx.length) {
      return null;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flex, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/*
 * A trunk: a tapered tube from the ground to `top`, `sides` round and
 * `rows` high, with a root flare. `uvOf(around, y)` maps to the texture:
 * tiled bark near, the atlas's bark strip mid. `bend` leans the trunk a
 * little with height so no two stand like masts.
 */
function trunk(b, { r0, top, sides, rows, uvOf, colour, bend }) {
  const ringsA = [];
  for (let j = 0; j <= rows; j += 1) {
    const y = (top * j) / rows;
    const t = y / top;
    const r = r0 * Math.pow(1 - t, 0.85) + r0 * 0.55 * Math.exp(-y / 0.7) + 0.015;
    const cx = bend.x * t * t;
    const cz = bend.z * t * t;
    const ring = [];
    for (let i = 0; i <= sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      const n = new THREE.Vector3(Math.cos(a), 0.12, Math.sin(a)).normalize();
      const p = new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
      const [u, v] = uvOf(i / sides, y, r);
      ring.push(b.vert(p, n, u, v, colour(t), 0));
    }
    ringsA.push(ring);
  }
  for (let j = 0; j < rows; j += 1) {
    b.strip(ringsA[j], ringsA[j + 1]);
  }
}

/* A card along a branch path: `path(t)` gives the centre line, `side`
 * the card's width axis at t, `w` its half width. uv runs across the
 * region in u and along it in v, from vBase to vTip. */
function card(b, { path, side, w, segs, region, colour, normalAt, flexAt, vBase = 0, vTip = 1 }) {
  const left = [];
  const right = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const c = path(t);
    const s = side(t);
    const n = normalAt(t, c);
    const v = region.v0 + (vBase + (vTip - vBase) * t) * region.dv;
    const col = colour(t);
    const f = flexAt(t);
    left.push(b.vert(c.clone().addScaledVector(s, -w(t)), n, region.u0, v, col, f));
    right.push(b.vert(c.clone().addScaledVector(s, w(t)), n, region.u0 + region.du, v, col, f));
  }
  b.strip(left, right);
}

function conifer(variant, lod) {
  const sp = CONIFER[variant.kind];
  const rng = makeRng(variant.seed * 7 + (lod === 'near' ? 0 : 3));
  const H = variant.h;
  const near = lod === 'near';
  const foliage = new Builder();
  const barkB = near ? new Builder() : foliage;
  const region = REGIONS[sp.region];
  const bend = { x: (rng() - 0.5) * 0.5, z: (rng() - 0.5) * 0.5 };
  const trunkR = sp.trunkR * (H / 26);
  const barkTint = sp.bark;
  const strip = REGIONS.bark;
  trunk(barkB, {
    r0: trunkR,
    top: H,
    sides: near ? 9 : 4,
    rows: near ? 10 : 2,
    bend,
    uvOf: near
      ? (a, y, r) => [a * Math.max(1, Math.round((2 * Math.PI * r) / 0.9)), y / 1.1]
      : (a, y) => [strip.u0 + a * strip.du, strip.v0 + (y / H) * strip.dv],
    colour: (t) => {
      const shade = t * H < variant.crownBase * H ? 0.9 : 0.62;
      return [barkTint[0] * shade, barkTint[1] * shade, barkTint[2] * shade];
    },
  });
  const yb = variant.crownBase * H;
  const step = variant.step * (near ? 1 : 2.1);
  let whorl = 0;
  for (let y = yb; y < H * 0.985; y += step * (0.8 + rng() * 0.4)) {
    whorl += 1;
    const s = (y - yb) / (H - yb);
    const reach = variant.reach * (H / 26) * Math.max(0.12, sp.profile(s));
    const per = Math.max(3, variant.per + (rng() < 0.3 ? -1 : 0) - (near ? 0 : 1));
    const t = y / H;
    const ax = bend.x * t * t;
    const az = bend.z * t * t;
    const rT = trunkR * Math.pow(1 - t, 0.85);
    for (let k = 0; k < per; k += 1) {
      const a = whorl * 2.39996 + (k / per) * Math.PI * 2 + (rng() - 0.5) * 0.7;
      const L = reach * (0.8 + rng() * 0.35);
      const pitch = sp.pitch0 + (sp.pitch1 - sp.pitch0) * s + (rng() - 0.5) * 0.18;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const base = new THREE.Vector3(ax + dir.x * rT, y, az + dir.z * rT);
      const droop = sp.droop * (1.15 - s * 0.6);
      const path = (u) => base.clone()
        .addScaledVector(dir, L * u * Math.cos(pitch))
        .addScaledVector(UP, L * (u * Math.sin(pitch) - droop * u * u + sp.tipUp * u * u * u));
      const tangent = (u) => path(Math.min(1, u + 0.02)).sub(path(Math.max(0, u - 0.02))).normalize();
      /* Outward and a little up from the trunk, more up toward the top:
       * the normal the whole crown shades with. */
      const upMix = 0.35 + 0.35 * s;
      const bent = (u, c) => new THREE.Vector3(c.x - ax, 0, c.z - az).normalize().multiplyScalar(1 - upMix).addScaledVector(UP, upMix).normalize();
      const tint = 0.88 + rng() * 0.24;
      const hue = (rng() - 0.5) * 0.08;
      const colourAt = (dark) => (u) => {
        const ao = (0.58 + 0.42 * Math.min(1, u * 1.3)) * (0.72 + 0.28 * s) * tint * dark;
        return [ao * (1 - hue), ao, ao * (1 + hue)];
      };
      const flexAt = (u) => u * Math.min(1, L / 3);
      const rolls = near ? [sp.roll, -sp.roll] : [whorl % 2 ? 0.8 : -0.8];
      const width = (near ? 0.8 : 1.0) * L * (variant.kind === 'larch' ? 1.1 : 1);
      for (const roll of rolls) {
        const r = roll + (rng() - 0.5) * 0.3;
        card(foliage, {
          path,
          side: (u) => {
            const tg = tangent(u);
            const sd = new THREE.Vector3().crossVectors(UP, tg).normalize();
            const bi = new THREE.Vector3().crossVectors(tg, sd);
            return sd.multiplyScalar(Math.cos(r)).addScaledVector(bi, Math.sin(r));
          },
          w: (u) => width * 0.5 * (0.55 + 0.45 * Math.min(1, u * 2.2)),
          segs: near ? 3 : 2,
          region,
          colour: colourAt(1),
          normalAt: bent,
          flexAt,
        });
      }
      if (near && sp.curtain && L > 0.9) {
        /* The hanging curtain, from a sixth of the way out to the tip. */
        const u0 = 0.18;
        const depth = sp.curtain * L;
        const cur = REGIONS.curtain;
        const top = [];
        const bottom = [];
        const segs = 3;
        for (let i = 0; i <= segs; i += 1) {
          const u = u0 + ((0.97 - u0) * i) / segs;
          const c = path(u);
          const n = bent(u, c);
          const col = colourAt(0.85)(u);
          const d = depth * (1 - 0.45 * u);
          const uu = cur.u0 + (i / segs) * cur.du;
          top.push(foliage.vert(c.clone().addScaledVector(UP, -0.05), n, uu, cur.v0 + cur.dv, col, flexAt(u)));
          bottom.push(foliage.vert(c.clone().addScaledVector(UP, -d).addScaledVector(dir, 0.1 * d), n, uu, cur.v0, col, flexAt(u) + 0.3));
        }
        foliage.strip(bottom, top);
      }
    }
  }
  /* The leader: a small spray standing up at the top. */
  const tip = new THREE.Vector3(bend.x, H * 0.97, bend.z);
  for (const r of near ? [0, Math.PI / 2] : [0]) {
    card(foliage, {
      path: (u) => tip.clone().addScaledVector(UP, u * H * 0.06),
      side: () => new THREE.Vector3(Math.cos(r), 0, Math.sin(r)),
      w: () => H * 0.012,
      segs: 1,
      region,
      colour: () => [0.95, 1, 0.95],
      normalAt: () => UP.clone(),
      flexAt: (u) => u,
    });
  }
  return { foliage: foliage.geometry(), bark: near ? barkB.geometry() : null };
}

function broadleaf(variant, lod) {
  const rng = makeRng(variant.seed * 7 + (lod === 'near' ? 0 : 3));
  const H = variant.h;
  const near = lod === 'near';
  const foliage = new Builder();
  const barkB = near ? new Builder() : foliage;
  const region = REGIONS[variant.kind];
  const strip = REGIONS.bark;
  const grey = variant.kind === 'beech' ? [0.78, 0.8, 0.84] : [0.85, 0.8, 0.74];
  const trunkTop = variant.trunk * H;
  const trunkR = 0.3 * (H / 22);
  const centre = new THREE.Vector3(0, H * 0.6, 0);
  const rx = variant.rx * H;
  const ry = variant.ry * H;
  const uvNear = (a, y, r) => [a * Math.max(1, Math.round((2 * Math.PI * r) / 0.9)), y / 1.1];
  const uvMid = (a, y) => [strip.u0 + a * strip.du, strip.v0 + Math.min(1, y / H) * strip.dv];
  trunk(barkB, {
    r0: trunkR,
    top: trunkTop * 1.25,
    sides: near ? 9 : 4,
    rows: near ? 4 : 1,
    bend: { x: 0, z: 0 },
    uvOf: near ? uvNear : uvMid,
    colour: () => grey,
  });
  /* Limbs: from the top of the trunk out and up toward the crown's
   * shell, each a tapered tube bent by gravity. Each carries a lobe of
   * the crown at its end. */
  const limbs = 4 + Math.floor(rng() * 2);
  const lobes = [{ c: centre.clone(), rx: rx * 0.72, ry: ry * 0.72 }];
  for (let k = 0; k < limbs; k += 1) {
    const a = (k / limbs) * Math.PI * 2 + rng() * 0.8;
    const from = new THREE.Vector3(0, trunkTop * (0.9 + rng() * 0.3), 0);
    const to = new THREE.Vector3(Math.cos(a) * rx * 0.62, centre.y + ry * (rng() * 0.45 - 0.05), Math.sin(a) * rx * 0.62);
    const lr = 0.42 + rng() * 0.2;
    lobes.push({ c: to.clone().addScaledVector(UP, ry * 0.12), rx: rx * lr, ry: ry * lr * 0.85 });
    const segs = near ? 4 : 1;
    const sides = near ? 6 : 3;
    const r0 = trunkR * 0.55;
    const rings = [];
    for (let j = 0; j <= segs; j += 1) {
      const t = j / segs;
      const c = from.clone().lerp(to, t).addScaledVector(UP, Math.sin(t * Math.PI) * H * 0.04);
      const dir = to.clone().sub(from).normalize();
      const s1 = new THREE.Vector3().crossVectors(dir, UP).normalize();
      const s2 = new THREE.Vector3().crossVectors(s1, dir);
      const r = r0 * (1 - 0.8 * t) + 0.02;
      const ring = [];
      for (let i = 0; i <= sides; i += 1) {
        const ang = (i / sides) * Math.PI * 2;
        const n = s1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(s2, Math.sin(ang));
        const p = c.clone().addScaledVector(n, r);
        const [u, v] = near ? uvNear(i / sides, t * 4, r) : uvMid(i / sides, c.y);
        ring.push(barkB.vert(p, n, u, v, grey.map((g) => g * (0.75 - 0.2 * t)), t * 0.3));
      }
      rings.push(ring);
    }
    for (let j = 0; j < segs; j += 1) {
      barkB.strip(rings[j], rings[j + 1]);
    }
  }
  /* Leaf clusters through the lobes' shells, fewer on their undersides:
   * a crown of a few overlapping domes rather than one ball, with light
   * between them. A card's normal leans out from its own lobe and from
   * the crown as a whole. */
  const count = near ? 320 : 96;
  const size = (near ? 1.6 : 2.9) * (H / 20);
  const weights = lobes.map((l) => l.rx * l.rx);
  const total = weights.reduce((a, b) => a + b, 0);
  const d = new THREE.Vector3();
  for (let k = 0; k < count; k += 1) {
    let pick = rng() * total;
    let lobe = lobes[0];
    for (let q = 0; q < lobes.length; q += 1) {
      pick -= weights[q];
      if (pick <= 0) {
        lobe = lobes[q];
        break;
      }
    }
    do {
      d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    } while (d.lengthSq() > 1 || d.lengthSq() < 0.01 || (d.y < -0.4 && rng() < 0.75));
    d.normalize();
    const f = 0.7 + 0.3 * Math.sqrt(rng());
    const p = new THREE.Vector3(lobe.c.x + d.x * lobe.rx * f, lobe.c.y + d.y * lobe.ry * f, lobe.c.z + d.z * lobe.rx * f);
    const out = p.clone().sub(centre).multiply(new THREE.Vector3(1 / rx, 1 / ry, 1 / rx));
    const reachOut = Math.min(1, out.length());
    const nOut = d.clone().multiplyScalar(0.5).addScaledVector(out.normalize(), 0.5).normalize();
    const nC = nOut.clone().addScaledVector(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5), 1.1).normalize();
    let upC = nOut.clone().addScaledVector(UP, 0.6);
    upC.addScaledVector(nC, -upC.dot(nC));
    if (upC.lengthSq() < 1e-4) {
      upC = new THREE.Vector3(1, 0, 0);
    }
    upC.normalize();
    const side = new THREE.Vector3().crossVectors(upC, nC).normalize();
    const s = size * (0.75 + rng() * 0.5);
    const base = p.clone().addScaledVector(upC, -s * 0.5);
    const nrm = nOut.clone().multiplyScalar(0.8).addScaledVector(nC, 0.2).normalize();
    const ao = (0.5 + 0.5 * reachOut) * (0.78 + 0.22 * (nOut.y * 0.5 + 0.5)) * (0.9 + rng() * 0.2);
    const hue = (rng() - 0.5) * 0.1;
    card(foliage, {
      path: (u) => base.clone().addScaledVector(upC, u * s),
      side: () => side,
      w: () => s * 0.5,
      segs: 1,
      region,
      colour: () => [ao * (1 + hue), ao, ao * (1 - hue)],
      normalAt: () => nrm,
      flexAt: (u) => 0.4 + 0.6 * u * reachOut,
    });
  }
  return { foliage: foliage.geometry(), bark: near ? barkB.geometry() : null };
}

/*
 * Build one variant at one level of detail. Returns { foliage, bark },
 * bark null at 'mid', and the numbers the placer and the impostors need:
 * the model's height, its crown's radius and the radius of the sphere
 * round its middle that holds all of it.
 */
export function buildVariant(variant, lod) {
  const out = variant.kind === 'beech' || variant.kind === 'maple' ? broadleaf(variant, lod) : conifer(variant, lod);
  const box = new THREE.Box3();
  for (const g of [out.foliage, out.bark]) {
    if (g) {
      box.union(g.boundingBox);
    }
  }
  const crown = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
  const cy = (box.min.y + box.max.y) / 2;
  const radius = Math.hypot(box.max.y - cy, crown) * 1.02;
  return { ...out, height: box.max.y, crown, cy, radius };
}

export function triangles(geo) {
  return geo ? geo.index.count / 3 : 0;
}
