/*
 * tree-check.js: a plane meets a tree where the tree is drawn.
 *
 *   node scripts/tree-check.js [--air=sky1800,timber1500] [--only=crown|under] [--shots=DIR]
 *   SIM_GPU=1 for the machine's GPU (and the High trees) instead of SwiftShader
 *   --shots=DIR a picture of each crown throw at rest, from beside it, into
 *               DIR (outside the repository: pictures are not committed)
 *
 * The owner flew a Skyhunter into a swiss2 beech and it hung in open air
 * beside the tree, 9.6 m up at 0 km/h, outside every leaf; and a Turbo
 * Timber flown at 79 km/h 4.6 m over the grass beside a village
 * broadleaf's trunk, under its leaves, broke up having touched nothing
 * drawn. The plant's crown was an upright cylinder round the whole tree,
 * and the drawn crown is clumps of leaves with air between them and under
 * them. This flies each airframe at the drawn broadleaves near the
 * valley's start (the nearest three with no other tree within 16 m and
 * room under the crown) from two sides.
 *
 * INTO THE CROWN (--only=crown): into its middle, glancing its side, low
 * through its rim, glancing the far side, over its top and under its
 * lower rim, 12 to 22 m/s. Each throw is left to come to rest, and a
 * craft at rest more than a metre off the ground that the plant says is
 * in a crown (the inTree flag) is one a crown holds. (One at rest up on
 * something else, a roof, is reported and not judged: that is not the
 * crown's doing.)
 *
 * UNDER THE CROWN (--only=under): level, 1 and 2 m under the lowest drawn
 * leaf over the path, beside the trunk with the wing tip 0.5 m clear of
 * the drawn bark and half way out under the crown, at 15 and 25 m/s, on
 * the heading within 60 degrees of each side's with the most room under
 * the leaves. Watched until it is past the crown: it must meet nothing of
 * the tree (no event on foliage or wood, no entry into a crown, no
 * contact with a trunk or a crown). Judged only while the whole drawn
 * craft stays under that leaf up to its first touch, and when it got past
 * or touched the tree: a pass that climbs into the leaves has met them,
 * and one that ends on a wall or the ground first says nothing.
 *
 * What is drawn is read from the page, not from the colliders: every
 * broadleaf the forest has drawn round the craft (its instance's matrix
 * and its variant's clumps, src/maps/swiss2/vegetation/species.js
 * crownClumps, CLUMP_REACH), its drawn bark, and the drawn craft's own
 * vertices.
 *
 * Passes when:
 *   every craft a broadleaf's crown holds has a hull point inside a drawn
 *     clump (one held in a conifer is reported and not judged: a
 *     conifer's crown is its whole post, which this does not check);
 *   at least one glancing throw is not held (it goes through a gap or
 *     falls out of the crown), because a crown with air in it lets some go;
 *   at least one throw is held, because a crown still catches a plane;
 *   no judged pass under a crown touches the tree, and at least 12 are
 *     judged.
 * Prints each throw: where it came to rest, how far off the ground, the
 * nearest drawn clump (its distance over its reach, under 1 inside it)
 * and the nearest leaf card, in metres; and each pass under a crown.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const AIRFRAMES = arg('air', 'sky1800,timber1500').split(',');
const shotsDir = arg('shots', '');
const only = arg('only', '');

/* The throws: across the crown's width (off, of its radius, + to the
 * approach's left), up its height (h, 0 its lowest leaf, 1 its highest)
 * and how fast. `glance` marks the ones that meet the crown's edge. */
const PASSES = [
  { id: 'middle', off: 0, h: 0.5, v: 13, glance: false },
  { id: 'side', off: 0.8, h: 0.5, v: 18, glance: true },
  { id: 'low', off: 0.3, h: 0.12, v: 15, glance: false },
  { id: 'far side', off: -0.9, h: 0.35, v: 22, glance: true },
  { id: 'top', off: 0.2, h: 0.92, v: 20, glance: true },
  { id: 'under rim', off: 0.7, h: 0.08, v: 12, glance: true },
];
/* The passes under the crown: level, `below` metres under its lowest
 * drawn leaf, either beside the trunk (`bark`: the wing tip that much
 * clear of the drawn wood) or half way out under the crown (`off`, of
 * its radius). Only those that clear the ground by UNDER_CLEAR are
 * flown. */
const UNDER = [
  { id: 'under by the trunk', below: 1, bark: 0.5 },
  { id: 'under the crown', below: 1, off: 0.5 },
  { id: 'low by the trunk', below: 2, bark: 0.5 },
  { id: 'low under the crown', below: 2, off: 0.5 },
];
const UNDER_CLEAR = 1.5;
/* A pass is over once the craft is this far past the crown's edge, m,
 * or after UNDER_S of the plant's clock. */
const UNDER_PAST = 3;
const UNDER_S = 4;
/* The two sides each tree is flown at, degrees about up. */
const SIDES = [0, 200];
/* The speeds of the passes under a crown, one a side, m/s. */
const UNDER_V = [15, 25];
const TREES = 3;
/* A tree flown at has room under its crown: its lowest drawn leaf this
 * high over the ground it stands on, m. */
const TREE_UNDER = 3;
/* Held: at rest this far over the ground, m. */
const HELD_CLEAR = 1.0;
/* At rest: under this speed, m/s, for this many polls 100 ms apart. */
const REST_V = 0.2;
const REST_POLLS = 5;
const REST_LIMIT_MS = 9000;

function seeds(airframe) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe),
    airframeAsked: true,
    map: 'swiss2',
    graphics: process.env.SIM_GPU === '1' ? 'high' : 'low',
    graphicsAuto: false,
    crashDamage: true,
    sound: false,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

/* Installed once in the page: the drawn broadleaves round a point and the
 * drawn craft's vertices, world frame. */
const HELPERS = `(async () => {
  const sp = await import('/src/maps/swiss2/vegetation/species.js');
  const THREE = window.__three;
  const broad = new Map(sp.VARIANTS.filter((v) => v.kind === 'beech' || v.kind === 'maple').map((v) => [v.name, v]));
  const clumpsOf = new Map([...broad].map(([n, v]) => [n, sp.crownClumps(v).clumps]));
  /* Every drawn broadleaf within reach of (x, z): near model first, the
   * far one where the near is not drawn. */
  const drawn = (x, z, reach) => {
    const seen = new Map();
    for (const lod of ['near', 'mid']) {
      window.__mapScene().traverse((o) => {
        if (!o.isInstancedMesh || !o.name.endsWith('-' + lod)) {
          return;
        }
        const name = o.name.slice(0, -lod.length - 1);
        if (!broad.has(name)) {
          return;
        }
        const a = o.instanceMatrix.array;
        for (let k = 0; k < o.count; k += 1) {
          const e = a.subarray(k * 16, k * 16 + 16);
          if (Math.hypot(e[12] - x, e[14] - z) > reach) {
            continue;
          }
          const key = e[12].toFixed(3) + ',' + e[14].toFixed(3);
          if (seen.has(key)) {
            continue;
          }
          const m = new THREE.Matrix4().fromArray(e);
          const s = Math.hypot(e[0], e[1], e[2]);
          const clumps = clumpsOf.get(name).map((q) => {
            const c = q.c.clone().applyMatrix4(m);
            return { x: c.x, y: c.y, z: c.z, r: q.rc * s * sp.CLUMP_REACH };
          });
          seen.set(key, { name, lod, x: e[12], y: e[13], z: e[14], s, m, geo: o.geometry, clumps });
        }
      });
    }
    return [...seen.values()];
  };
  const craftPoints = () => {
    const obj = window.__mapScene().getObjectByName(window.__craft().drawn);
    const out = [];
    if (!obj) {
      const s = window.__craftState();
      return [[s.worldX, s.worldY, s.worldZ]];
    }
    obj.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    obj.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry.attributes.position) {
        return;
      }
      const p = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(p.count / 60));
      for (let i = 0; i < p.count; i += step) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        out.push([v.x, v.y, v.z]);
      }
    });
    return out;
  };
  /* The craft against the drawn trees round it: the nearest clump (its
   * distance over its reach) and the nearest leaf card, m. */
  const judge = (reach) => {
    const s = window.__craftState();
    const pts = craftPoints();
    const trees = drawn(s.worldX, s.worldZ, reach);
    let clump = Infinity;
    let leaf = Infinity;
    const tri = new THREE.Triangle();
    const q = new THREE.Vector3();
    const P = new THREE.Vector3();
    for (const t of trees) {
      for (const c of t.clumps) {
        for (const p of pts) {
          clump = Math.min(clump, Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) / c.r);
        }
      }
      if (t.lod !== 'near') {
        continue;
      }
      const pos = t.geo.attributes.position;
      const idx = t.geo.index.array;
      const A = new THREE.Vector3();
      const B = new THREE.Vector3();
      const C = new THREE.Vector3();
      for (let i = 0; i < idx.length; i += 3) {
        A.fromBufferAttribute(pos, idx[i]).applyMatrix4(t.m);
        B.fromBufferAttribute(pos, idx[i + 1]).applyMatrix4(t.m);
        C.fromBufferAttribute(pos, idx[i + 2]).applyMatrix4(t.m);
        tri.set(A, B, C);
        for (const p of pts) {
          P.set(p[0], p[1], p[2]);
          tri.closestPointToPoint(P, q);
          leaf = Math.min(leaf, q.distanceTo(P));
        }
      }
    }
    /* In a conifer: its post is its crown (crashworld.js collectTrees),
     * as wide as its branches, and it is drawn so. */
    const conifer = window.__crashSolids(s.worldX, s.worldZ, 12, 'tree').some((c) => !c.box && c.r > 0.6
      && Math.hypot(c.a[0] - s.worldX, c.a[2] - s.worldZ) < c.r + 1 && s.worldY < Math.max(c.a[1], c.b[1]) + c.r);
    return { x: s.worldX, y: s.worldY, z: s.worldZ, clear: s.groundClearance, speed: s.speed, trees: trees.length, clump, leaf, conifer, points: pts.length };
  };
  /* The drawn wood round a trunk at height y, m: the trunk is a tube of
   * straight segments between rings of vertices, so no wider there than
   * the wider of the rings either side (the furthest bark vertex on
   * each, within 2 m of the trunk's line). */
  const bark = (x, z, y) => {
    const pts = [];
    const v = new THREE.Vector3();
    window.__mapScene().traverse((o) => {
      if (!o.isInstancedMesh || !o.name.endsWith('-bark') || !broad.has(o.name.slice(0, -5))) {
        return;
      }
      const a = o.instanceMatrix.array;
      for (let k = 0; k < o.count; k += 1) {
        if (Math.hypot(a[k * 16 + 12] - x, a[k * 16 + 14] - z) > 0.05) {
          continue;
        }
        const m = new THREE.Matrix4().fromArray(a, k * 16);
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 1) {
          v.fromBufferAttribute(p, i).applyMatrix4(m);
          const d = Math.hypot(v.x - x, v.z - z);
          if (d < 2) {
            pts.push([v.y, d]);
          }
        }
      }
    });
    const below = Math.max(...pts.filter((q) => q[0] <= y).map((q) => q[0]));
    const above = Math.min(...pts.filter((q) => q[0] >= y).map((q) => q[0]));
    const ring = pts.filter((q) => Math.abs(q[0] - below) < 1e-3 || Math.abs(q[0] - above) < 1e-3);
    return ring.length ? Math.max(...ring.map((q) => q[1])) : null;
  };
  /* Half the drawn craft's width across (lx, lz), m. */
  const halfSpan = (lx, lz) => {
    const s = window.__craftState();
    let w = 0;
    for (const p of craftPoints()) {
      w = Math.max(w, Math.abs((p[0] - s.worldX) * lx + (p[2] - s.worldZ) * lz));
    }
    return w;
  };
  window.__treeCheck = { drawn, judge, bark, halfSpan, craftPoints };
  return 'ok';
})()`;

/* The trees to fly at: drawn broadleaves near the start with no other
 * tree's trunk within 16 m, nearest first (and room under the crown,
 * TREE_UNDER). */
const PICK = `(() => {
  const m = window.__map();
  const posts = window.__crashSolids(m.spawn.x, m.spawn.z, 900, 'tree').filter((c) => !c.box);
  return JSON.stringify(posts.map((p) => ({ x: p.a[0], z: p.a[2], y: Math.min(p.a[1], p.b[1]), top: Math.max(p.a[1], p.b[1]), r: p.r }))
    .filter((p, i, all) => p.r < 0.5 && all.every((q) => q === p || Math.hypot(q.x - p.x, q.z - p.z) > 16)));
})()`;

/* The touches of a tree in what the page logged since the throw: the
 * plant's events on foliage or wood or into a crown, and the shell's and
 * the plant's contacts with a trunk or a crown. */
const TOUCHES = `(() => {
  const woody = (k) => k === 'tree' || k === 'canopy';
  const c = window.__contacts();
  return JSON.stringify({
    tree: window.__crashLog().filter((e) => e.type === 'tree' || e.surface === 'foliage' || e.surface === 'wood').map((e) => ({ t: e.t, what: e.type + ' ' + e.part + ' on ' + e.surface }))
      .concat(c.log.filter((e) => woody(e.kind)).map((e) => ({ t: e.t, what: 'shell contact ' + e.kind })))
      .concat(c.obstacle.filter((e) => woody(e.kind)).map((e) => ({ t: e.t, what: 'plant contact ' + e.kind }))),
    other: [...new Set(window.__crashLog().map((e) => e.type + ' on ' + e.surface).concat(c.log.map((e) => 'shell ' + e.kind), c.obstacle.map((e) => 'plant ' + e.kind)))].join(', '),
  });
})()`;

/*
 * Under the crown: a level pass below the lowest drawn leaf over it, clear of
 * its drawn trunk, must meet nothing of the tree (the owner's Turbo
 * Timber at 79 km/h 4.6 m over the grass beside a village broadleaf's
 * trunk, under its leaves, broke up in the air).
 */
async function underPasses(page, airframe, ti, t, { reach }, out) {
  const ground = t.y + 0.2;
  const name = `${t.name}@${t.x.toFixed(1)},${t.z.toFixed(1)}`;
  /* The tree looked at, so its near model (and its bark) is drawn, and
   * the craft's half width, level, measured once. */
  const look = async (y) => {
    await page.evaluate(`window.__setCam(${t.x + 25}, ${y + 6}, ${t.z + 25}, ${t.x}, ${y}, ${t.z}, 55)`);
    await page.sleep(500);
  };
  await page.evaluate(`window.__crashThrow(${JSON.stringify({ fresh: true, hold: true, x: t.x - reach - 8, y: ground + 5, z: t.z, yaw: 90 })})`);
  await look(ground + 3);
  const half = await page.evaluate('window.__treeCheck.halfSpan(0, 1)');
  const barkAt = async (y) => {
    await look(y);
    const r = await page.evaluate(`window.__treeCheck.bark(${t.x}, ${t.z}, ${y})`);
    if (r == null) {
      throw new Error(`no drawn bark found round ${name}`);
    }
    return r;
  };
  for (const [si, side] of SIDES.entries()) {
    for (const pass of UNDER) {
      /* The heading, within 60 degrees of this side's, whose path (the
       * craft's width either side of it) has the most room under the
       * drawn leaves over it: a gap under the crown, flown at its
       * lowest leaf less `below`. */
      const off0 = pass.bark != null ? (await barkAt(ground + 2)) + half + pass.bark : pass.off * reach;
      let best = null;
      for (let dh = -60; dh <= 60; dh += 10) {
        const a = ((side + ti * 70 + dh) * Math.PI) / 180;
        const ux = Math.cos(a);
        const uz = Math.sin(a);
        const lx = uz;
        const lz = -ux;
        let leaf = Infinity;
        for (const c of t.clumps) {
          const across = Math.abs((c.x - t.x) * lx + (c.z - t.z) * lz - off0);
          if (across < c.r + half) {
            const d = Math.max(0, across - half);
            leaf = Math.min(leaf, c.y - Math.sqrt(c.r * c.r - d * d));
          }
        }
        if (!best || leaf > best.leaf) {
          best = { ux, uz, lx, lz, leaf };
        }
      }
      const { ux, uz, lx, lz, leaf } = best;
      const y = leaf - pass.below;
      const row = { airframe, tree: name, side, pass: pass.id, v: UNDER_V[si], y, over: y - ground, leaf: leaf - ground };
      if (!(y - ground >= UNDER_CLEAR)) {
        console.log(`${airframe} ${name} side ${side} ${pass.id}: not flown, ${(y - ground).toFixed(2)} m over the ground`);
        continue;
      }
      const yaw = (Math.atan2(-ux, -uz) * 180) / Math.PI;
      const run = reach + 8;
      await look(y);
      const barkR = pass.bark == null ? null : await barkAt(y);
      const off = pass.bark != null ? barkR + half + pass.bark : pass.off * reach;
      row.off = off;
      row.barkR = barkR;
      const throwAt = {
        fresh: true, x: t.x + lx * off - ux * run, y, z: t.z + lz * off - uz * run, yaw, pitch: 0, vx: ux * row.v, vy: 0, vz: uz * row.v,
      };
      await page.evaluate(`JSON.stringify(window.__crashThrow(${JSON.stringify(throwAt)}))`);
      const t0 = Date.now();
      const sim0 = await page.evaluate('window.__crash().simT');
      let simT = sim0;
      let inTree = false;
      let past = false;
      let low = Infinity;
      const polls = [];
      /* Until it is past the crown, on the plant's clock (the page steps
       * slower than the wall under load). */
      while (simT - sim0 < UNDER_S && Date.now() - t0 < 60000 && !past) {
        await page.sleep(40);
        const st = JSON.parse(await page.evaluate('JSON.stringify({ s: window.__craftState(), f: window.__crash().flagNames, t: window.__crash().simT, top: Math.max(...window.__treeCheck.craftPoints().map((p) => p[1])) })'));
        simT = st.t;
        if (!inTree && st.f.includes('inTree')) {
          inTree = st.t;
        }
        low = Math.min(low, st.s.worldY - ground);
        polls.push({ t: st.t, top: st.top });
        past = (st.s.worldX - t.x) * ux + (st.s.worldZ - t.z) * uz > reach + UNDER_PAST;
      }
      const touch = JSON.parse(await page.evaluate(TOUCHES));
      if (inTree) {
        touch.tree.push({ t: inTree, what: 'inTree flag' });
      }
      /* Judged while the whole drawn craft stayed under that leaf, up to
       * the first touch of the tree: a craft that climbs into the leaves
       * has met them, and one that was caught first never got the chance.
       * Judged when it got past, or touched the tree; a pass that ended on
       * a wall or the ground first says nothing. */
      const first = Math.min(...touch.tree.map((e) => e.t));
      const top = Math.max(...polls.filter((q) => q.t <= first).map((q) => q.top));
      const under = top < leaf;
      const clean = touch.tree.length === 0;
      const judged = under && (past || !clean);
      Object.assign(row, { past, under, judged, low, top, touches: touch.tree.map((e) => e.what), other: touch.other, clean });
      out.push(row);
      console.log(`${airframe} ${row.tree} side ${side} ${pass.id} ${row.v} m/s: ${(y - ground).toFixed(2)} m over the ground under the lowest leaf over it at ${(leaf - ground).toFixed(2)},`
        + ` ${off.toFixed(2)} m off the trunk${barkR != null ? ` (bark ${barkR.toFixed(2)}, half span ${half.toFixed(2)})` : ''}:`
        + ` ${past ? 'past' : 'not past'}, ${low.toFixed(2)} m over the ground at its lowest, its top ${(top - leaf).toFixed(2)} m from that leaf${under ? '' : ' (climbed into the leaves)'},`
        + ` ${clean ? 'touched nothing of the tree' : `TOUCHED ${row.touches.join('; ')}`}${judged ? '' : ', NOT JUDGED'}${touch.other ? ` [${touch.other}]` : ''}`);
    }
  }
}

async function flyAirframe(airframe, rows, underRows) {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=swiss2', seed: seeds(airframe) });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready', 180000);
    await page.sleep(1500);
    await page.evaluate(HELPERS, 60000);
    const posts = JSON.parse(await page.evaluate(PICK, 60000));
    const trees = [];
    for (const p of posts) {
      if (trees.length === TREES) {
        break;
      }
      /* Look at it, so the forest draws it, then read what is drawn. */
      await page.evaluate(`window.__setCam(${p.x + 30}, ${p.top + 12}, ${p.z + 30}, ${p.x}, ${p.top + 4}, ${p.z}, 55)`);
      await page.sleep(500);
      const t = JSON.parse(await page.evaluate(`JSON.stringify(window.__treeCheck.drawn(${p.x}, ${p.z}, 0.05).map((t) => ({ name: t.name, x: t.x, y: t.y, z: t.z, clumps: t.clumps })))`));
      if (t.length === 1 && Math.min(...t[0].clumps.map((c) => c.y - c.r)) - (t[0].y + 0.2) >= TREE_UNDER) {
        trees.push(t[0]);
      }
    }
    if (trees.length < TREES) {
      throw new Error(`found ${trees.length} lone drawn broadleaves near the start, want ${TREES}`);
    }
    for (const [ti, t] of trees.entries()) {
      let reach = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of t.clumps) {
        reach = Math.max(reach, Math.hypot(c.x - t.x, c.z - t.z) + c.r);
        lo = Math.min(lo, c.y - c.r);
        hi = Math.max(hi, c.y + c.r);
      }
      if (only !== 'crown') {
        await underPasses(page, airframe, ti, t, { reach }, underRows);
      }
      if (only === 'under') {
        continue;
      }
      for (const side of SIDES) {
        for (const pass of PASSES) {
          const a = ((side + ti * 70) * Math.PI) / 180;
          /* u: the way the throw goes; l: its left. */
          const ux = Math.cos(a);
          const uz = Math.sin(a);
          const lx = uz;
          const lz = -ux;
          const ty = lo + pass.h * (hi - lo);
          const tx = t.x + lx * pass.off * reach;
          const tz = t.z + lz * pass.off * reach;
          const run = reach + 8;
          const throwAt = {
            fresh: true,
            x: tx - ux * run,
            y: ty,
            z: tz - uz * run,
            yaw: (Math.atan2(-ux, -uz) * 180) / Math.PI,
            pitch: -3,
            vx: ux * pass.v,
            vy: -0.5,
            vz: uz * pass.v,
          };
          const thrown = JSON.parse(await page.evaluate(`JSON.stringify(window.__crashThrow(${JSON.stringify(throwAt)}))`));
          if (!thrown || thrown.ok === false) {
            throw new Error(`throw refused: ${JSON.stringify(thrown)}`);
          }
          await page.evaluate(`window.__setCam(${t.x - ux * 3 + lx * (reach + 14)}, ${hi + 3}, ${t.z - uz * 3 + lz * (reach + 14)}, ${t.x}, ${(lo + hi) / 2}, ${t.z}, 60)`);
          const t0 = Date.now();
          let still = 0;
          while (Date.now() - t0 < REST_LIMIT_MS && still < REST_POLLS) {
            await page.sleep(100);
            const v = await page.evaluate('window.__craftState().speed');
            still = v < REST_V ? still + 1 : 0;
          }
          const j = JSON.parse(await page.evaluate('JSON.stringify(window.__treeCheck.judge(30))', 60000));
          /* No drawn tree round it: JSON has no Infinity. */
          j.clump ??= Infinity;
          j.leaf ??= Infinity;
          const flags = await page.evaluate('window.__crash().flagNames.join(",")');
          const row = {
            airframe, tree: `${t.name}@${t.x.toFixed(1)},${t.z.toFixed(1)}`, side, pass: pass.id, v: pass.v, glance: pass.glance,
            rest: still >= REST_POLLS, held: still >= REST_POLLS && j.clear > HELD_CLEAR && flags.split(',').includes('inTree'), ...j, flags,
          };
          rows.push(row);
          console.log(`${airframe} ${row.tree} side ${side} ${pass.id} ${pass.v} m/s: ${row.rest ? 'rest' : 'moving'} at ${j.x.toFixed(1)},${j.y.toFixed(1)},${j.z.toFixed(1)}`
            + ` ${j.clear.toFixed(2)} m up, clump ${j.clump === Infinity ? '-' : j.clump.toFixed(2)}, leaf ${j.leaf === Infinity ? '-' : j.leaf.toFixed(2)} m,`
            + ` ${row.held ? 'HELD' : 'not held'}${row.held && j.conifer ? ' in a conifer' : ''}${row.held && !j.conifer && !(j.clump < 1) ? ' IN OPEN AIR' : ''} [${flags}]`);
          if (shotsDir && row.rest) {
            await page.evaluate(`window.__setCam(${j.x + lx * 9 - ux * 4}, ${j.y + 2.5}, ${j.z + lz * 9 - uz * 4}, ${j.x}, ${j.y}, ${j.z}, 55)`);
            await page.sleep(700);
            const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
            const name = `${airframe}-t${ti}-s${side}-${pass.id.replace(/ /g, '')}.png`;
            await writeFile(join(shotsDir, name), Buffer.from(data, 'base64'));
          }
        }
      }
    }
  } finally {
    await page.close();
  }
}

if (shotsDir) {
  await mkdir(resolve(shotsDir), { recursive: true });
}
const rows = [];
const underRows = [];
for (const air of AIRFRAMES) {
  await flyAirframe(air, rows, underRows);
}
const held = rows.filter((r) => r.held);
const openAir = held.filter((r) => !r.conifer && !(r.clump < 1));
const letGo = rows.filter((r) => r.glance && !r.held);
const judged = underRows.filter((r) => r.judged);
const touched = judged.filter((r) => !r.clean);
const checks = [];
if (only !== 'under') {
  checks.push(
    { name: 'every craft a crown holds is inside a drawn clump', ok: openAir.length === 0, detail: `${openAir.length} of ${held.length} held in open air` },
    { name: 'some glancing throws are not held', ok: letGo.length > 0, detail: `${letGo.length} of ${rows.filter((r) => r.glance).length} glancing throws let go` },
    { name: 'some throws are held', ok: held.length > 0, detail: `${held.length} of ${rows.length} held` },
  );
}
if (only !== 'crown') {
  checks.push(
    { name: 'a pass under a crown and clear of its trunk touches nothing of the tree', ok: touched.length === 0, detail: `${touched.length} of ${judged.length} touched` },
    { name: 'the passes under the crowns were flown', ok: judged.length >= 12, detail: `${judged.length} of ${underRows.length} stayed under the leaves and got past the tree or touched it` },
  );
}
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail}`);
}
process.exit(checks.every((c) => c.ok) ? 0 : 1);
