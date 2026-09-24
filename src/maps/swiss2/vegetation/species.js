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
 * stream: a grey trunk into a few limbs, branches, and a crown of
 * separate clumps of leaves.
 *
 * A conifer's branch is two crossed cards of the species' spray along a
 * drooping curve, with a hanging curtain under it for the spruce; a
 * broadleaf's crown is clumps of leaf sprays on the ends of its branches,
 * apart, with the sky and the crown's dark inside between them. A
 * conifer card's normal is bent outward from the crown's axis, so the
 * crown shades as one soft mass the way a real one does from any
 * distance; a broadleaf card's leans out from its clump, so each clump
 * is its own lit dome. Every vertex carries an occlusion colour, dark at
 * the trunk, inside and low in the crown, and a flutter weight for the
 * wind (aFlex).
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
 * height in metres (instances scale it by 0.7 to 1.25). At most twelve:
 * the impostor atlas holds twelve variants of twenty four views.
 *
 * The snag is a spruce that died standing: a grey trunk broken off
 * short of its height, and the stubs of its lower branches. It is drawn
 * only as an impostor, at every distance (impostorOnly): a pole seen
 * from the side is the same picture from any side, and as models it
 * would have been two more draws for the view and each shadow map.
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
  { name: 'snag', kind: 'snag', seed: 601, h: 21, reach: 1.1, impostorOnly: true },
];

/* The shapes of the conifer species, over what VARIANTS sets. pitch is
 * the angle a branch leaves the trunk at, low in the crown and at the
 * top (radians, up positive); droop how far its curve falls per unit of
 * length; roll the tilt of its two cards either side of level. */
const CONIFER = {
  spruce: { region: 'spruce', pitch0: -0.22, pitch1: 0.4, droop: 0.3, tipUp: 0.32, roll: 0.72, curtain: 0.55, trunkR: 0.3, profile: (s) => Math.pow(1 - s, 1.0), bark: [0.95, 0.9, 0.86] },
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
      const upMix = 0.42 + 0.3 * s;
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

/* A tapered tube from `from` to `to`, sagging `sag` metres at its middle,
 * radius r0 at the start and r1 at the end, for a limb or a branch. */
function limb(b, { from, to, r0, r1, sag, segs, sides, uvOf, colour, flex }) {
  const dir = to.clone().sub(from).normalize();
  let s1 = new THREE.Vector3().crossVectors(dir, UP);
  s1 = s1.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : s1.normalize();
  const s2 = new THREE.Vector3().crossVectors(s1, dir);
  const rings = [];
  for (let j = 0; j <= segs; j += 1) {
    const t = j / segs;
    const c = from.clone().lerp(to, t).addScaledVector(UP, -Math.sin(t * Math.PI) * sag);
    const r = r0 + (r1 - r0) * t;
    const ring = [];
    for (let i = 0; i <= sides; i += 1) {
      const ang = (i / sides) * Math.PI * 2;
      const n = s1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(s2, Math.sin(ang));
      const [u, v] = uvOf(i / sides, t, c.y, r);
      ring.push(b.vert(c.clone().addScaledVector(n, r), n, u, v, colour(t), flex * t));
    }
    rings.push(ring);
  }
  for (let j = 0; j < segs; j += 1) {
    b.strip(rings[j], rings[j + 1]);
  }
}

/*
 * A beech or a sycamore. A broadleaf crown is not a ball of leaves: it
 * is a few ascending limbs that fork into branches, each branch ending in
 * a clump of leafy twigs, and the clumps stand apart with the sky and the
 * crown's dark inside showing between them. Each clump shades as its own
 * dome (its cards' normals lean out from the clump, a little from the
 * crown), which is what makes a lit crown read as many bright caps over
 * dark hollows; the cards on a clump's inner side and on the crown's
 * inner clumps are darkened (the occlusion the leaves round them do),
 * the undersides most. The clumps, their branches and the limbs come
 * from one generator for both levels, so the far model is the near one
 * with fewer, larger cards and the fade between them does not move the
 * crown.
 */
function broadleaf(variant, lod) {
  const rng = makeRng(variant.seed * 7);
  const cardRng = makeRng(variant.seed * 7 + (lod === 'near' ? 1 : 4));
  const H = variant.h;
  const near = lod === 'near';
  const foliage = new Builder();
  const barkB = near ? new Builder() : foliage;
  const region = REGIONS[variant.kind];
  const strip = REGIONS.bark;
  const grey = variant.kind === 'beech' ? [0.78, 0.8, 0.84] : [0.85, 0.8, 0.74];
  const trunkTop = variant.trunk * H * 1.25;
  const trunkR = 0.3 * (H / 22);
  const centre = new THREE.Vector3(0, H * 0.6, 0);
  const rx = variant.rx * H;
  const ry = variant.ry * H;
  const uvNear = (a, y, r) => [a * Math.max(1, Math.round((2 * Math.PI * r) / 0.9)), y / 1.1];
  const uvMid = (a, y) => [strip.u0 + a * strip.du, strip.v0 + Math.min(1, y / H) * strip.dv];
  trunk(barkB, {
    r0: trunkR,
    top: trunkTop,
    sides: near ? 9 : 4,
    rows: near ? 4 : 1,
    bend: { x: 0, z: 0 },
    uvOf: near ? uvNear : uvMid,
    colour: () => grey,
  });
  /* The clumps: on the crown's shell, apart from each other, fewer
   * underneath, and a few inside it that fill the middle. */
  const clumps = [];
  const rc0 = rx * 0.27;
  const want = 22 + Math.floor(rng() * 6);
  for (let tries = 0; clumps.length < want && tries < 4000; tries += 1) {
    const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    if (d.lengthSq() > 1 || d.lengthSq() < 0.05 || (d.y < -0.4 && rng() < 0.7)) {
      continue;
    }
    d.normalize();
    const f = 0.66 + 0.28 * rng();
    const c = new THREE.Vector3(d.x * rx * f, centre.y + d.y * ry * f, d.z * rx * f);
    const rc = rc0 * (0.8 + 0.45 * rng());
    if (clumps.some((q) => q.c.distanceTo(c) < (q.rc + rc) * 0.78)) {
      continue;
    }
    clumps.push({ c, rc, depth: f });
  }
  for (let k = 0; k < 4; k += 1) {
    const a = rng() * Math.PI * 2;
    const f = 0.25 + 0.2 * rng();
    clumps.push({
      c: new THREE.Vector3(Math.cos(a) * rx * f, centre.y + ry * (rng() * 0.5 - 0.1), Math.sin(a) * rx * f),
      rc: rc0 * 1.1,
      depth: f,
    });
  }
  /* The limbs: four to six ascending from the top of the trunk, each
   * ending half way out to the shell; every clump's branch starts at the
   * limb end nearest it. */
  const limbs = [];
  const nLimbs = 4 + Math.floor(rng() * 3);
  for (let k = 0; k < nLimbs; k += 1) {
    const a = (k / nLimbs) * Math.PI * 2 + rng() * 0.7;
    const from = new THREE.Vector3(0, trunkTop * (0.85 + rng() * 0.2), 0);
    const to = new THREE.Vector3(Math.cos(a) * rx * 0.42, centre.y + ry * (rng() * 0.35 - 0.05), Math.sin(a) * rx * 0.42);
    limbs.push(to);
    limb(barkB, {
      from, to, r0: trunkR * 0.62, r1: trunkR * 0.3, sag: -H * 0.02, segs: near ? 4 : 1, sides: near ? 7 : 3,
      uvOf: near ? (a0, t, y, r) => uvNear(a0, t * 5, r) : (a0, t, y) => uvMid(a0, y),
      colour: (t) => grey.map((g) => g * (0.8 - 0.2 * t)),
      flex: 0.15,
    });
  }
  const barkDark = grey.map((g) => g * 0.55);
  for (const q of clumps) {
    let from = limbs[0];
    for (const l of limbs) {
      if (l.distanceToSquared(q.c) < from.distanceToSquared(q.c)) {
        from = l;
      }
    }
    /* The far model carries only the limbs: a branch there is under a
     * pixel wide. */
    if (!near) {
      continue;
    }
    const to = q.c.clone().lerp(from, 0.25);
    limb(barkB, {
      from, to, r0: trunkR * 0.26, r1: 0.025, sag: from.distanceTo(to) * 0.06, segs: 2, sides: 4,
      uvOf: (a0, t, y, r) => uvNear(a0, t * 3, r),
      colour: () => barkDark,
      flex: 0.35,
    });
  }
  /* The leaf cards, clump by clump. */
  const perClump = near ? 17 : 6;
  const size = near ? 1.0 : 1.45;
  const d = new THREE.Vector3();
  for (const q of clumps) {
    const out = q.c.clone().sub(centre).multiply(new THREE.Vector3(1 / rx, 1 / ry, 1 / rx));
    const outLen = out.length();
    const outDir = outLen > 1e-3 ? out.clone().normalize() : UP.clone();
    const n = Math.max(3, Math.round(perClump * (q.rc / rc0) ** 2));
    for (let k = 0; k < n; k += 1) {
      do {
        d.set(cardRng() * 2 - 1, cardRng() * 2 - 1, cardRng() * 2 - 1);
      } while (d.lengthSq() > 1 || d.lengthSq() < 0.02 || (d.dot(outDir) < -0.2 && cardRng() < 0.6) || (d.y < -0.5 && cardRng() < 0.5));
      d.normalize();
      const f = 0.45 + 0.55 * Math.sqrt(cardRng());
      const p = q.c.clone().add(new THREE.Vector3(d.x * q.rc * f, d.y * q.rc * 0.78 * f, d.z * q.rc * f));
      const nrm = d.clone().multiplyScalar(0.62).addScaledVector(outDir, 0.38).addScaledVector(UP, 0.12).normalize();
      const nC = nrm.clone().addScaledVector(new THREE.Vector3(cardRng() - 0.5, cardRng() - 0.5, cardRng() - 0.5), 1.3).normalize();
      let upC = d.clone().addScaledVector(outDir, 0.6).addScaledVector(UP, 0.5);
      upC.addScaledVector(nC, -upC.dot(nC));
      if (upC.lengthSq() < 1e-4) {
        upC = new THREE.Vector3(1, 0, 0);
      }
      upC.normalize();
      const side = new THREE.Vector3().crossVectors(upC, nC).normalize();
      const s = size * q.rc * (0.8 + cardRng() * 0.45);
      const base = p.clone().addScaledVector(upC, -s * 0.45);
      /* Occlusion: the clump's inner side, the crown's inside, and the
       * underside, each darker. */
      const inner = d.dot(outDir) * 0.5 + 0.5;
      const depth = Math.min(1, q.depth * f + 0.12);
      const ao = (0.5 + 0.5 * inner) * (0.45 + 0.55 * depth) * (0.66 + 0.34 * (d.y * 0.5 + 0.5)) * (0.9 + cardRng() * 0.2);
      const hue = (cardRng() - 0.5) * 0.12;
      card(foliage, {
        path: (u) => base.clone().addScaledVector(upC, u * s),
        side: () => side,
        w: () => s * 0.5,
        segs: 1,
        region,
        colour: () => [ao * (1 + hue), ao, ao * (1 - hue)],
        normalAt: () => nrm,
        flexAt: (u) => 0.35 + 0.65 * u * Math.min(1, outLen),
      });
    }
  }
  return { foliage: foliage.geometry(), bark: near ? barkB.geometry() : null };
}

/* The snag: the trunk silvered, its top broken off, and the stubs of
 * dead branches hanging down from it, fewer and shorter going up. The
 * stubs are cards of the atlas's bark strip, so they bake with the
 * crown's cut. */
function snag(variant) {
  const rng = makeRng(variant.seed * 7);
  const H = variant.h;
  const foliage = new Builder();
  const barkB = new Builder();
  const top = H * (0.72 + 0.12 * rng());
  const trunkR = 0.3 * (H / 26);
  const bend = { x: (rng() - 0.5) * 0.6, z: (rng() - 0.5) * 0.6 };
  const silver = (t) => {
    const k = 1.5 + 0.25 * t;
    return [k, k * 1.03, k * 1.1];
  };
  trunk(barkB, {
    r0: trunkR,
    top,
    sides: 8,
    rows: 8,
    bend,
    uvOf: (a, y, r) => [a * Math.max(1, Math.round((2 * Math.PI * r) / 0.9)), y / 1.1],
    colour: silver,
  });
  const strip = REGIONS.bark;
  for (let y = H * 0.18; y < top - 0.5; y += 0.9 + 0.8 * rng()) {
    const t = y / H;
    const s = y / top;
    const ax = bend.x * t * t;
    const az = bend.z * t * t;
    for (let k = 0; k < 3; k += 1) {
      if (rng() < 0.35) {
        continue;
      }
      const a = rng() * Math.PI * 2;
      const L = (1.9 - 1.3 * s) * (0.5 + 0.7 * rng());
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const base = new THREE.Vector3(ax, y, az);
      const fall = -0.25 - 0.35 * rng();
      const path = (u) => base.clone().addScaledVector(dir, L * u).addScaledVector(UP, L * fall * u * u);
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      for (const sd of [side, UP]) {
        card(foliage, {
          path,
          side: () => sd,
          w: (u) => 0.07 * (1 - 0.7 * u),
          segs: 2,
          region: strip,
          colour: () => silver(t),
          normalAt: () => dir.clone().addScaledVector(UP, 0.4).normalize(),
          flexAt: (u) => 0.3 * u,
        });
      }
    }
  }
  return { foliage: foliage.geometry(), bark: barkB.geometry() };
}

/*
 * Build one variant at one level of detail. Returns { foliage, bark },
 * bark null at 'mid', and the numbers the placer and the impostors need:
 * the model's height, its crown's radius and the radius of the sphere
 * round its middle that holds all of it.
 */
export function buildVariant(variant, lod) {
  const out = variant.kind === 'snag' ? snag(variant)
    : variant.kind === 'beech' || variant.kind === 'maple' ? broadleaf(variant, lod) : conifer(variant, lod);
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
