/*
 * collide-audit-itaipu.js: what a craft can hit on the Itaipu map against
 * what is drawn there, swept, and held to a recorded baseline.
 *
 *   [SIM_GPU=1] [FDFPV_ITAIPU_DATA=DIR] node scripts/collide-audit-itaipu.js
 *       [--only=footprints,drawn,phantom,trees,refill,bridge,water,seats,fly]
 *       [--record]
 *
 * The owner asked for "a complete audit on collision physics ... areas
 * where things collide or fly through". This is the world half of it, as
 * a sweep rather than a list of hand-picked places, so it can run again.
 *
 * In Node, on the data folder's own buildings (town/plan.js, pure):
 *
 *   footprints  every building's wall boxes (plan.js wallBoxes) against the
 *               outline it is drawn on: the ground the boxes stand on that
 *               is outside the drawn walls, by how deep, split into the
 *               two ways it happens. `concave`: a run's box spans the
 *               outline's extent between two corners, so an L, a U or a
 *               courtyard is filled. `slant`: a building within 10 degrees
 *               of the axes is one box per run, so a wall a few degrees
 *               off the axis has a wedge of invisible wall along it.
 *
 * In headless Chromium (tests/lib/page.js), the map built by the shell
 * with crash damage on, a five inch seated, then again with the F-16:
 *
 *   drawn       drawn but not solid: at each CENTRE the camera is parked
 *               over (so the streamed set is filled round it and the
 *               terrain drawn at its finest there), points on every drawn
 *               triangle within R, a point per AREA m2, each held by a
 *               collider within 0.3 m, the ground, a roof or the water
 *               within 0.3 m under it, or the forest volume. A point
 *               further than 1 m from all of them is a miss, counted per
 *               mesh and binned 10 m, the worst bins printed.
 *   phantom     solid but not drawn: points on every collider's outside
 *               (static and streamed, not a tree's) within R, 5 cm out,
 *               not inside another solid, not under a roof or the ground,
 *               further than 1 m from every drawn triangle and line. A
 *               collider none of whose points is near anything drawn is
 *               an invisible solid.
 *   trees       every near tree the page draws as a model round each
 *               centre has its trunk post.
 *   refill      the camera driven along a line across the town at 100,
 *               200 and 400 m/s: the frames each refill of the streamed
 *               set takes, and the least clearance there ever was between
 *               the pilot and the edge of the set in force (the town's
 *               FINE_R columns and wires, the near trees' reach). From
 *               that, the fastest a craft can go at 60 and 20 frames a
 *               second without reaching what has not streamed in. And no
 *               streamed collider is left further from the set's centre
 *               than its part fills to.
 *   bridge      the Friendship Bridge: how many colliders and roof records
 *               stand under its drawn deck.
 *   water       the drawn reservoir and river against the map's ground
 *               (height() is the water where a body is), with the camera
 *               over each sample so both are at their finest.
 *   seats       every start and room seat (spawns.js, slots.js): the gap
 *               across the ground from the seat to the nearest solid that
 *               stands up within two metres over its ground.
 *   fly         flights with the five inch and then the F-16, released
 *               from a throw (window.__crashThrow) at thin things and at
 *               things drawn but not solid: a conductor, a lattice tower's
 *               leg, a crest lamp, the powerhouse roof's gantry leg and its
 *               insulator string, a tree's trunk, a switchyard transformer
 *               and its bushing, open ground under the deepest invisible
 *               wall box, and the Friendship Bridge's deck. Each is
 *               `stopped` (met there and did not go on), `through` (met,
 *               then on past it at over half its speed) or `passed` (went
 *               past with nothing); the dive onto open ground under an
 *               invisible wall box is `invisible` when the craft meets
 *               something more than 1.5 m over the ground, else `clear`.
 *
 * THE BASELINE (tests/collide-audit-itaipu-baseline.json) is today's
 * numbers, not a target: several of them are defects this audit found
 * (docs are in the pull request that added it). The run fails when a
 * number gets worse than the baseline by more than its slack, or a flight
 * that stopped no longer does. --record rewrites it from this run.
 *
 * Exits 1 on a regression or a page error, 0 otherwise.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import {
  cleanRing, rectOf, styleOf, rectRing, wallBoxes, landuseAreas,
} from '../src/maps/itaipu/town/plan.js';
import { FINE_R, MOVE } from '../src/maps/itaipu/town/model.js';
import { CREST_SPAWN, AIR_SPAWN } from '../src/maps/itaipu/spawns.js';
import { slotSpawn, SLOT_RIGHT_M } from '../src/game/slots.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const BASELINE = join(root, 'tests', 'collide-audit-itaipu-baseline.json');
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const ALL = ['footprints', 'drawn', 'phantom', 'trees', 'refill', 'bridge', 'water', 'seats', 'fly'];
const ONLY = new Set(arg('only', ALL.join(',')).split(','));
const RECORD = process.argv.includes('--record');

/* Where the camera is parked for the drawn, phantom and trees sweeps:
 * the spawn on the crest, the powerhouse, the spillway, the right bank
 * switchyard, the town's densest squares on each bank (town-check's
 * budget), and the western lines' hub. World metres. */
const CENTRES = [
  ['crest', CREST_SPAWN.x, CREST_SPAWN.z],
  ['powerhouse', 200, -1560],
  ['spillway', -950, -1000],
  ['yard', -2145, -432],
  ['foz', 3000, 2500],
  ['west', -4500, -2500],
  ['lines', -3500, 4000],
];
/* Metres round a centre. Inside FINE_R, so every streamed collider the
 * sweep can see is the fine one the pilot would meet. */
const R = 400;
const AREA = 4;
/* The refill's line across the town, and its speeds, m/s. */
const RUN = [[800, 4200], [2800, 2800]];
const RUN_SPEEDS = [100, 200, 400];
/* The widest half span of any aircraft a room seats (the Bramor's 2.3 m),
 * plus a metre: a seat nearer a solid than this can start in it. */
const SEAT_CLEAR = 1.15;
/* Slack a count may grow by before it is a regression: the sweeps sample
 * with a seeded generator, but what the terrain draws at its finest and
 * which trees are in view move a little with the frame. */
const SLACK = (n) => Math.ceil(n * 0.1) + 20;

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};
const f1 = (v) => (v == null ? 'n/a' : Number(v).toFixed(1));

function seed(airframe) {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe),
    airframeAsked: true, map: 'itaipu', graphics: 'low', graphicsAuto: false, crashDamage: true, sound: false,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

/* ------------------------------------------------------------ Node */

function pointIn(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) {
      c = !c;
    }
  }
  return c;
}

function edgeDist(ring, x, z) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [ax, az] = ring[j];
    const vx = ring[i][0] - ax;
    const vz = ring[i][1] - az;
    const l2 = vx * vx + vz * vz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

function hullOf(pts) {
  const p = [...pts].sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const cross = (o, a, c) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) {
        out.pop();
      }
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return half(p).concat(half(p.slice().reverse()));
}

/* Every building's wall boxes against the outline drawn: ground under a
 * box more than 0.3 m outside the drawn walls, sampled every half metre.
 * Inside the outline's hull it is a filled concavity, outside it a
 * slanted wall's wedge. */
async function footprints() {
  const buildings = JSON.parse(await readFile(join(DATA, 'osm', 'buildings.json'), 'utf8'));
  const landuse = JSON.parse(await readFile(join(DATA, 'osm', 'landuse.json'), 'utf8'));
  const industrial = landuseAreas(landuse.features, 'industrial');
  const STEP = 0.5;
  const cls = { concave: { buildings: 0, areaM2: 0 }, slant: { buildings: 0, areaM2: 0 } };
  const worst = [];
  let deepOver2 = 0;
  let deepOver5 = 0;
  for (const f of buildings.features) {
    const ring = cleanRing(f.outer, f.id);
    const rect = rectOf(ring);
    const style = styleOf(f, ring, rect, industrial);
    const drawn = style.onRect ? rectRing(rect) : ring;
    const { boxes, eaves } = wallBoxes(drawn, rect, 0, 10, null, []);
    const hull = hullOf(drawn);
    const deep = { concave: 0, slant: 0 };
    let at = null;
    for (const b of boxes.slice(0, eaves)) {
      for (let x = b[0] + STEP / 2; x < b[3]; x += STEP) {
        for (let z = b[2] + STEP / 2; z < b[5]; z += STEP) {
          if (pointIn(drawn, x, z)) {
            continue;
          }
          const d = edgeDist(drawn, x, z);
          const k = pointIn(hull, x, z) ? 'concave' : 'slant';
          if (d > 0.3) {
            cls[k].areaM2 += STEP * STEP;
          }
          if (d > deep[k]) {
            deep[k] = d;
            if (d >= Math.max(deep.concave, deep.slant)) {
              at = [x, z];
            }
          }
        }
      }
    }
    const d = Math.max(deep.concave, deep.slant);
    for (const k of ['concave', 'slant']) {
      if (deep[k] > 2) {
        cls[k].buildings += 1;
      }
    }
    if (d > 2) {
      deepOver2 += 1;
    }
    if (d > 5) {
      deepOver5 += 1;
      worst.push({ id: f.id, depth: +d.toFixed(1), at: at.map((v) => +v.toFixed(1)), kind: deep.concave >= deep.slant ? 'concave' : 'slant' });
    }
  }
  worst.sort((a, b) => b.depth - a.depth);
  for (const k of ['concave', 'slant']) {
    cls[k].areaM2 = Math.round(cls[k].areaM2);
  }
  console.log(`footprints: ${buildings.features.length} buildings; invisible wall past 2 m outside the drawn walls on ${deepOver2}, past 5 m on ${deepOver5}`);
  console.log(`  concave (L, U, courtyard filled): ${cls.concave.buildings} buildings, ${cls.concave.areaM2} m2 of ground under invisible wall`);
  console.log(`  slant (a run's box round a wall up to 10 degrees off the axis): ${cls.slant.buildings} buildings, ${cls.slant.areaM2} m2`);
  for (const w of worst.slice(0, 8)) {
    console.log(`    ${w.id} ${w.kind} ${f1(w.depth)} m deep at (${w.at.join(', ')})`);
  }
  return {
    buildings: buildings.features.length, over2: deepOver2, over5: deepOver5, concave: cls.concave, slant: cls.slant, worst: worst.slice(0, 20),
  };
}

/* ------------------------------------------------------------ page side */

/* window.__ca: the sweeps, in the page, on the map's own colliders,
 * ground and drawn meshes. */
const HELPERS = `(() => {
  const THREE = window.__three;
  const it = window.__mapScene().userData.itaipu;
  const col = it.parts.dam.survey().colliders;
  const T = it.terrain;
  const canopyAt = it.parts.vegetation.canopyAt;
  let seed = 1;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const ground = (x, z) => window.__surface(x, z, -1e9);
  /* What holds a point: a collider within tol, the ground, a roof or the
   * water within tol under it, or the forest volume; '' for nothing. */
  const holds = (x, y, z, tol) => {
    if (col.gapAt(x, y, z, tol) <= tol) return 'col';
    if (window.__surface(x, z, y + tol) >= y - tol) return 'ground';
    if (canopyAt && canopyAt(x, z) >= y) return 'canopy';
    return '';
  };
  /* Every triangle of a mesh (instances too) with its middle within r of
   * (cx, cz), in the world. */
  const eachTri = (mesh, cx, cz, r, fn) => {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    const idx = g.index;
    const nt = (idx ? idx.count : pos.count) / 3;
    const mats = [];
    if (mesh.isInstancedMesh) {
      const m = new THREE.Matrix4();
      for (let k = 0; k < mesh.count; k += 1) {
        mesh.getMatrixAt(k, m);
        const w = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, m);
        if (Math.hypot(w.elements[12] - cx, w.elements[14] - cz) <= r + 60) mats.push(w);
      }
    } else {
      mats.push(mesh.matrixWorld);
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const w of mats) {
      for (let t = 0; t < nt; t += 1) {
        a.fromBufferAttribute(pos, idx ? idx.getX(t * 3) : t * 3).applyMatrix4(w);
        b.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 1) : t * 3 + 1).applyMatrix4(w);
        c.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + 2) : t * 3 + 2).applyMatrix4(w);
        const mx = (a.x + b.x + c.x) / 3, mz = (a.z + b.z + c.z) / 3;
        if ((mx - cx) ** 2 + (mz - cz) ** 2 <= r * r) fn(a, b, c);
      }
    }
  };
  /* The meshes a sweep reads. Not the canopy shell (the forest volume's
   * picture past the trees' mid distance; the volume is canopyAt), the
   * spray, the far trees' impostors (a quad the shader turns), the tree
   * models (the trees section) or the Friendship Bridge (its own). */
  const SKIP = /^(itaipu-canopy|itaipu-spill-plume|itaipu-far-trees|it-.*-mid|itaipu-town-ring)/;
  const meshesOf = () => {
    const out = [];
    for (const [pn, p] of Object.entries(it.parts)) {
      p.group.traverse((o) => { if ((o.isMesh || o.isLineSegments) && o.visible !== false && !SKIP.test(o.name)) out.push([pn, o]); });
    }
    return out;
  };
  /* DRAWN BUT NOT SOLID. */
  const drawn = ({ cx, cz, r, area }) => {
    seed = 7;
    const out = {};
    for (const [pn, m] of meshesOf()) {
      if (!m.isMesh) continue;
      const key = pn + '/' + m.name;
      const o = out[key] || (out[key] = { pts: 0, miss: 0, loose: 0, cells: {} });
      eachTri(m, cx, cz, r, (a, b, c) => {
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const ar = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
        const n = Math.max(1, Math.min(64, Math.round(ar / area)));
        for (let s = 0; s < n; s += 1) {
          let p = rnd(), q = rnd();
          if (p + q > 1) { p = 1 - p; q = 1 - q; }
          const x = a.x + ux * p + vx * q, y = a.y + uy * p + vy * q, z = a.z + uz * p + vz * q;
          /* Only where the ground is drawn at its finest, and over it. */
          if (Math.abs(T.height(x, z) - T.finestAt(x, z)) > 0.1 || y < ground(x, z) + 0.2) continue;
          o.pts += 1;
          if (holds(x, y, z, 0.3)) continue;
          if (holds(x, y, z, 1)) { o.loose += 1; continue; }
          o.miss += 1;
          const ck = Math.floor(x / 10) * 10 + ',' + Math.floor(z / 10) * 10;
          const cc = o.cells[ck] || (o.cells[ck] = { n: 0, at: [x, y, z], y0: y, y1: y });
          cc.n += 1; cc.y0 = Math.min(cc.y0, y); cc.y1 = Math.max(cc.y1, y);
        }
      });
    }
    for (const o of Object.values(out)) {
      const list = Object.values(o.cells).sort((p, q) => q.n - p.n);
      o.bins = list.length;
      o.worst = list.slice(0, 6).map((v) => ({ at: v.at.map((q) => +q.toFixed(1)), n: v.n, y: [+v.y0.toFixed(1), +v.y1.toFixed(1)] }));
      delete o.cells;
    }
    return out;
  };
  /* The drawn triangles and lines round (cx, cz) on a 4 m grid. */
  const CELL = 4;
  const triGrid = (cx, cz, r) => {
    const tris = [];
    const grid = new Map();
    const add = (a, b, c) => {
      const k = tris.length / 9;
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x, c.x) / CELL);
      const z0 = Math.floor(Math.min(a.z, b.z, c.z) / CELL), z1 = Math.floor(Math.max(a.z, b.z, c.z) / CELL);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4000) return;
      for (let i = x0; i <= x1; i += 1) for (let j = z0; j <= z1; j += 1) {
        const key = i * 65536 + j;
        let l = grid.get(key);
        if (!l) { l = []; grid.set(key, l); }
        l.push(k);
      }
    };
    for (const [, o] of meshesOf()) {
      if (o.isLineSegments) {
        const P = o.geometry.getAttribute('position');
        for (let v = 0; v + 1 < P.count; v += 2) {
          const a = { x: P.getX(v), y: P.getY(v), z: P.getZ(v) }, b = { x: P.getX(v + 1), y: P.getY(v + 1), z: P.getZ(v + 1) };
          if (((a.x + b.x) / 2 - cx) ** 2 + ((a.z + b.z) / 2 - cz) ** 2 <= r * r) add(a, b, b);
        }
      } else {
        eachTri(o, cx, cz, r, add);
      }
    }
    return { tris, grid };
  };
  /* Distance from p to triangle k (Ericson, Real-Time Collision Detection 5.1.5). */
  const triDist = (T9, k, px, py, pz) => {
    const ax = T9[k], ay = T9[k + 1], az = T9[k + 2];
    const abx = T9[k + 3] - ax, aby = T9[k + 4] - ay, abz = T9[k + 5] - az;
    const acx = T9[k + 6] - ax, acy = T9[k + 7] - ay, acz = T9[k + 8] - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    let u = 0, v = 0;
    if (!(d1 <= 0 && d2 <= 0)) {
      const bpx = px - T9[k + 3], bpy = py - T9[k + 4], bpz = pz - T9[k + 5];
      const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
      const cpx = px - T9[k + 6], cpy = py - T9[k + 7], cpz = pz - T9[k + 8];
      const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
      const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
      if (d3 >= 0 && d4 <= d3) { u = 1; }
      else if (d6 >= 0 && d5 <= d6) { v = 1; }
      else if (vc <= 0 && d1 >= 0 && d3 <= 0) { u = d1 / (d1 - d3); }
      else if (vb <= 0 && d2 >= 0 && d6 <= 0) { v = d2 / (d2 - d6); }
      else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); u = 1 - w; v = w; }
      else { const den = 1 / (va + vb + vc); u = vb * den; v = vc * den; }
    }
    return Math.hypot(px - (ax + abx * u + acx * v), py - (ay + aby * u + acy * v), pz - (az + abz * u + acz * v));
  };
  const nearestTri = (G, px, py, pz, maxD) => {
    let best = Infinity;
    for (let i = Math.floor((px - maxD) / CELL); i <= Math.floor((px + maxD) / CELL); i += 1) {
      for (let j = Math.floor((pz - maxD) / CELL); j <= Math.floor((pz + maxD) / CELL); j += 1) {
        const l = G.grid.get(i * 65536 + j);
        if (!l) continue;
        for (const k of l) { const d = triDist(G.tris, k * 9, px, py, pz); if (d < best) best = d; }
      }
    }
    return best;
  };
  /* Points on collider i's outside, 5 cm out, that nothing else holds:
   * not inside another solid, not under a roof or the ground. */
  const outside = (i, spacing) => {
    const pts = [];
    const off = 0.05;
    if (col.fbox[i]) {
      const lo = [col.fax[i], col.fay[i], col.faz[i]], hi = [col.fbx[i], col.fby[i], col.fbz[i]];
      for (let ax = 0; ax < 3; ax += 1) {
        const u = (ax + 1) % 3, v = (ax + 2) % 3;
        const nu = Math.max(1, Math.min(12, Math.round((hi[u] - lo[u]) / spacing)));
        const nv = Math.max(1, Math.min(12, Math.round((hi[v] - lo[v]) / spacing)));
        for (const side of [-1, 1]) {
          for (let a = 0; a < nu; a += 1) for (let b = 0; b < nv; b += 1) {
            const p = [0, 0, 0];
            p[ax] = side < 0 ? lo[ax] - off : hi[ax] + off;
            p[u] = lo[u] + (hi[u] - lo[u]) * (a + 0.5) / nu;
            p[v] = lo[v] + (hi[v] - lo[v]) * (b + 0.5) / nv;
            pts.push(p);
          }
        }
      }
    } else {
      const a = [col.fax[i], col.fay[i], col.faz[i]];
      const d = [col.fbx[i] - a[0], col.fby[i] - a[1], col.fbz[i] - a[2]];
      const L = Math.hypot(d[0], d[1], d[2]);
      const r = col.fr[i] + off;
      const dn = L > 1e-6 ? d.map((q) => q / L) : [0, 1, 0];
      const e = Math.abs(dn[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const c1 = [dn[1] * e[2] - dn[2] * e[1], dn[2] * e[0] - dn[0] * e[2], dn[0] * e[1] - dn[1] * e[0]];
      const n1 = Math.hypot(c1[0], c1[1], c1[2]);
      const u = c1.map((q) => q / n1);
      const w = [dn[1] * u[2] - dn[2] * u[1], dn[2] * u[0] - dn[0] * u[2], dn[0] * u[1] - dn[1] * u[0]];
      const nl = Math.max(1, Math.min(12, Math.round(L / spacing)));
      for (let s = 0; s <= nl; s += 1) {
        for (let q = 0; q < 6; q += 1) {
          const ang = (q / 6) * Math.PI * 2;
          const cs = Math.cos(ang) * r, sn = Math.sin(ang) * r;
          pts.push([0, 1, 2].map((k) => a[k] + d[k] * s / nl + u[k] * cs + w[k] * sn));
        }
      }
    }
    return pts.filter((p) => !(col.gapAt(p[0], p[1], p[2], 0.01) <= 0.01) && p[1] > ground(p[0], p[2]) + 0.2
      && !(window.__surface(p[0], p[2], 1e9) >= p[1] - 0.3));
  };
  /* SOLID BUT NOT DRAWN. */
  const phantom = ({ cx, cz, r, tol = 1, spacing = 2 }) => {
    const G = triGrid(cx, cz, r + 60);
    const byKind = {};
    const invisible = [];
    for (let i = 0; i < col.count; i += 1) {
      const kn = col.kindName(col.fkind[i]);
      if (kn === 'tree' || kn === 'canopy') continue;
      const mx = (col.fax[i] + col.fbx[i]) / 2, mz = (col.faz[i] + col.fbz[i]) / 2;
      if ((mx - cx) ** 2 + (mz - cz) ** 2 > r * r) continue;
      const key = (i < col.staticCount ? 'static' : 'streamed') + '/' + kn + '/' + (col.fbox[i] ? 'box' : 'capsule');
      const o = byKind[key] || (byKind[key] = { n: 0, pts: 0, far: 0, invisible: 0 });
      o.n += 1;
      const pts = outside(i, spacing);
      let far = 0;
      for (const p of pts) if (nearestTri(G, p[0], p[1], p[2], tol) > tol) far += 1;
      o.pts += pts.length;
      o.far += far;
      if (pts.length && far === pts.length) {
        o.invisible += 1;
        invisible.push({ key, at: [mx, (col.fay[i] + col.fby[i]) / 2, mz].map((q) => +q.toFixed(1)),
          size: [col.fbx[i] - col.fax[i], col.fby[i] - col.fay[i], col.fbz[i] - col.faz[i]].map((q) => +Math.abs(q).toFixed(1)), r: +col.fr[i].toFixed(2) });
      }
    }
    return { tris: G.tris.length / 9, byKind, invisible: invisible.slice(0, 40) };
  };
  /* Every tree the page draws as a model near (cx, cz) has its post. */
  const trees = ({ cx, cz, r }) => {
    const m = new THREE.Matrix4();
    const out = { drawn: 0, noPost: 0, list: [] };
    it.parts.vegetation.group.traverse((o) => {
      if (!o.isInstancedMesh) return;
      for (let k = 0; k < o.count; k += 1) {
        o.getMatrixAt(k, m);
        const e = m.clone().premultiply(o.matrixWorld).elements;
        if (Math.hypot(e[12] - cx, e[14] - cz) > r) continue;
        out.drawn += 1;
        if (!(col.gapAt(e[12], e[13] + 1, e[14], 1.5) <= 1.5)) {
          out.noPost += 1;
          if (out.list.length < 10) out.list.push([e[12], e[13], e[14]].map((q) => +q.toFixed(1)));
        }
      }
    });
    return out;
  };
  window.__ca = { it, col, T, holds, drawn, phantom, trees, triGrid, nearestTri };
  return true;
})()`;

/* The camera parked over (x, z), and back when the streamed set is filled
 * round it, nothing is filling, and the terrain is at its finest there. */
async function settle(page, x, z, up = 60) {
  const g = await page.evaluate(`window.__surface(${x}, ${z}, 1e9)`);
  await page.evaluate(`window.__setCam(${x}, ${g + up}, ${z}, ${x + 40}, ${g}, ${z + 40}, 60)`);
  const t0 = Date.now();
  for (;;) {
    await page.sleep(150);
    const ok = await page.evaluate(`(() => {
      const it = window.__mapScene().userData.itaipu;
      const n = it.parts.town.town.stream.near;
      return Math.hypot(n.x - ${x}, n.z - ${z}) < 1 && !n.pending && !it.parts.dam.survey().colliders.fill
        && Math.abs(it.terrain.height(${x}, ${z}) - it.terrain.finestAt(${x}, ${z})) < 0.05;
    })()`);
    if (ok) {
      /* A second for the terrain round the point to finish its builds. */
      await page.sleep(1000);
      return true;
    }
    if (Date.now() - t0 > 30000) {
      return false;
    }
  }
}

/* The refill at `speed`: the camera driven along RUN a frame at a time
 * from a set filled round its start. */
const REFILL = (speed, fine) => `new Promise((done) => {
  const it = window.__mapScene().userData.itaipu;
  const col = it.parts.dam.survey().colliders;
  const town = it.parts.town.town.stream.near;
  const veg = it.parts.vegetation.near;
  const A = ${JSON.stringify(RUN[0])}, B = ${JSON.stringify(RUN[1])};
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
  let s = 0, last = performance.now(), gen = col.streamGen;
  let tIn = { x: town.x, z: town.z }, vIn = { x: veg.x, z: veg.z, reach: veg.reach };
  let begun = -1;
  const out = { frames: 0, refills: 0, refillFrames: [], refillMs: [], town: Infinity, veg: Infinity, frameMs: 0 };
  let begunAt = 0;
  const step = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    out.frameMs += now - last;
    last = now;
    s += ${speed} * dt;
    const x = A[0] + ux * s, z = A[1] + uz * s;
    const g = window.__surface(x, z, 1e9);
    window.__setCam(x, g + 60, z, x + ux * 100, g + 30, z + uz * 100, 60);
    out.frames += 1;
    if (col.fill && begun < 0) { begun = out.frames; begunAt = now; }
    if (col.streamGen !== gen) {
      gen = col.streamGen;
      tIn = { x: town.x, z: town.z };
      vIn = { x: veg.x, z: veg.z, reach: veg.reach };
      out.refills += 1;
      if (begun >= 0) { out.refillFrames.push(out.frames - begun); out.refillMs.push(Math.round(now - begunAt)); }
      begun = -1;
    }
    out.town = Math.min(out.town, ${fine} - Math.hypot(x - tIn.x, z - tIn.z));
    out.veg = Math.min(out.veg, vIn.reach - Math.hypot(x - vIn.x, z - vIn.z));
    if (s < L) { requestAnimationFrame(step); return; }
    out.frameMs /= out.frames;
    done(JSON.stringify(out));
  };
  requestAnimationFrame(step);
})`;

/* Every streamed collider further from the set's centre than its part
 * fills to: the town's walls to WALLS_R round a building's middle (a
 * building is at most 300 m across here), its poles to WIRES_R round a
 * chord's middle (chords are 25 m), a tree's pieces to the reach round
 * its trunk (a crown is at most 15 m across). */
const LEFTOVERS = `(() => {
  const it = window.__mapScene().userData.itaipu;
  const col = it.parts.dam.survey().colliders;
  const t = it.parts.town.town.stream.near;
  const v = it.parts.vegetation.near;
  let left = 0;
  const kinds = {};
  for (let i = col.staticCount; i < col.staticCount + col.streamCount; i += 1) {
    const kn = col.kindName(col.fkind[i]);
    const mx = (col.fax[i] + col.fbx[i]) / 2, mz = (col.faz[i] + col.fbz[i]) / 2;
    const reach = kn === 'wall' ? 1000 + 300 : kn === 'pole' ? 450 + 25 : v.reach + 60;
    const c = kn === 'tree' || kn === 'canopy' ? v : t;
    if (Math.hypot(mx - c.x, mz - c.z) > reach) { left += 1; kinds[kn] = (kinds[kn] || 0) + 1; }
  }
  return JSON.stringify({ streamed: col.streamCount, left, kinds });
})()`;

/* The flights' targets, found in the map's own parts round where they
 * are flown. Each { name, at, dir, expect, land? }: dir a unit vector the
 * craft travels along through `at`. */
const TARGETS = `(async () => {
  const it = window.__mapScene().userData.itaipu;
  const col = it.parts.dam.survey().colliders;
  const town = it.parts.town.town;
  const THREE = window.__three;
  const T = [];
  const flat = (d) => { const l = Math.hypot(d[0], d[2]); return [d[0] / l, 0, d[2] / l]; };
  const perp = (d) => { const f = flat(d); return [-f[2], 0, f[0]]; };
  /* A conductor: the chord nearest (-1400, 3000), 80 m from any tower
   * and 12 m over the ground, dived onto and crossed level. */
  {
    let best = null;
    for (const w of town.wires) {
      const mx = (w[0] + w[3]) / 2, mz = (w[2] + w[5]) / 2, my = (w[1] + w[4]) / 2;
      const d = Math.hypot(mx + 1400, mz - 3000);
      if (best && d > best.d) continue;
      let dT = Infinity;
      for (const s of town.structures) dT = Math.min(dT, Math.hypot(s.x - mx, s.z - mz));
      if (dT < 80 || my - window.__surface(mx, mz, -1e9) < 12) continue;
      best = { d, w, at: [mx, my, mz] };
    }
    const w = best.w;
    T.push({ name: 'power conductor, dived onto', at: best.at, dir: [0, -1, 0], expect: 'stopped' });
    T.push({ name: 'power conductor, crossed level', at: best.at, dir: perp([w[3] - w[0], 0, w[5] - w[2]]), expect: 'stopped' });
  }
  /* A lattice tower's leg, from outside the tower. */
  {
    const P = await import('/src/maps/itaipu/town/power.js');
    const s = town.structures.find((q) => q.kind === 'tower' && Math.hypot(q.x + 3700, q.z - 3860) < 100)
      || town.structures.find((q) => q.kind === 'tower');
    const leg = P.piecesOf(s).find((p) => Math.abs(p[4] - p[1]) > 3 && Math.min(p[1], p[4]) < s.y + 1);
    const y = Math.min(leg[1], leg[4]) + 2;
    const f = (y - leg[1]) / (leg[4] - leg[1]);
    const at = [leg[0] + (leg[3] - leg[0]) * f, y, leg[2] + (leg[5] - leg[2]) * f];
    T.push({ name: 'lattice tower leg', at, dir: flat([s.x - at[0], 0, s.z - at[2]]), expect: 'stopped' });
  }
  /* The crest's street lamp nearest the spawn, three metres up its pole. */
  {
    let lamps = null;
    it.parts.dam.group.traverse((o) => { if (o.name === 'itaipu-dam-lamps') lamps = o; });
    const m = new THREE.Matrix4();
    let best = null;
    for (let k = 0; k < lamps.count; k += 1) {
      lamps.getMatrixAt(k, m);
      const e = m.elements;
      const d = Math.hypot(e[12] - ${CREST_SPAWN.x}, e[14] - (${CREST_SPAWN.z}));
      if (!best || d < best.d) best = { d, p: [e[12], e[13] + 3, e[14]] };
    }
    T.push({ name: 'crest street lamp pole', at: best.p, dir: [0.975, 0, 0.215], expect: 'stopped' });
  }
  /* The powerhouse roof: a transmission gantry's leg, and the insulator
   * string drawn under its beam (y 158 to 160.8, no collider). */
  {
    const legs = [];
    for (let i = 0; i < col.staticCount; i += 1) {
      if (!col.fbox[i] && Math.abs(col.fay[i] - 148) < 0.1 && Math.abs(col.fby[i] - 162) < 0.1 && Math.abs(col.fr[i] - 0.6) < 0.01) legs.push(i);
    }
    const i = legs[Math.floor(legs.length / 2)];
    T.push({ name: 'powerhouse roof gantry leg', at: [col.fax[i], 155, col.faz[i]], dir: [0.975, 0, 0.215], expect: 'stopped' });
    for (let j = 0; j < col.staticCount; j += 1) {
      if (col.fbox[j] || Math.abs(col.fay[j] - 161.4) > 0.05 || Math.abs(col.fby[j] - 161.4) > 0.05) continue;
      if (Math.hypot(col.fax[j] - col.fax[i], col.faz[j] - col.faz[i]) < 1 || Math.hypot(col.fbx[j] - col.fax[i], col.fbz[j] - col.faz[i]) < 1) {
        T.push({ name: 'powerhouse gantry insulator string (drawn only)', at: [(col.fax[j] + col.fbx[j]) / 2, 159.4, (col.faz[j] + col.fbz[j]) / 2],
          dir: perp([col.fbx[j] - col.fax[j], 0, col.fbz[j] - col.faz[j]]), expect: 'passed' });
        break;
      }
    }
  }
  /* The switchyard's first transformer: its tank, and the bushing drawn
   * over it (war/index.js: three porcelain bars 3 m tall, no collider). */
  {
    const i = it.parts.war.yard.solids[0];
    const a = [col.fax[i], col.fay[i], col.faz[i]], b = [col.fbx[i], col.fby[i], col.fbz[i]];
    const c = [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2];
    const ax = flat([b[0] - a[0], 0, b[2] - a[2]]);
    const top = a[1] - col.fr[i] + 4.2;
    T.push({ name: 'switchyard transformer tank', at: c, dir: perp(ax), expect: 'stopped' });
    T.push({ name: 'switchyard transformer bushing (drawn only)', at: [c[0] + ax[0] * 0.8, top + 1.5, c[2] + ax[2] * 0.8], dir: perp(ax), expect: 'passed' });
  }
  /* The deepest invisible wall the footprints section finds: open
   * ground 26 m from building w608156691's drawn walls, under its wall
   * box. Dived onto from 20 m up, a craft should reach the ground. */
  {
    const P = [553.9, 3915.8];
    T.push({ name: 'open ground under an invisible wall box (w608156691)', at: [P[0], window.__surface(P[0], P[1], -1e9) + 0.5, P[1]], dir: [0, -1, 0], expect: 'clear', invisible: true });
  }
  /* The Friendship Bridge's deck, the drawn mesh's own vertices within a
   * metre of its top: flown through across the river, and landed on. */
  {
    const f = town.friendship;
    let mesh = null;
    it.parts.town.group.traverse((o) => { if (o.name && o.name.startsWith('itaipu-town-ring')) mesh = o; });
    mesh.updateMatrixWorld(true);
    const P = mesh.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    const pts = [];
    for (let k = 0; k < P.count; k += 1) {
      v.fromBufferAttribute(P, k).applyMatrix4(mesh.matrixWorld);
      if (Math.abs(v.y - f.deckY) < 1) pts.push([v.x, v.z]);
    }
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let far = pts[0];
    for (const p of pts) if (Math.hypot(p[0] - cx, p[1] - cz) > Math.hypot(far[0] - cx, far[1] - cz)) far = p;
    const along = flat([far[0] - cx, 0, far[1] - cz]);
    T.push({ name: 'Friendship Bridge deck, flown through', at: [cx, f.deckY - 0.8, cz], dir: perp(along), expect: 'passed' });
    T.push({ name: 'Friendship Bridge deck, landed on', at: [cx, f.deckY, cz], dir: along, expect: 'passed', land: true });
  }
  return JSON.stringify(T);
})()`;

async function riseOver(page, t, v, D, yaw) {
  const up = 40;
  const x0 = t.at[0] - t.dir[0] * D;
  const z0 = t.at[2] - t.dir[2] * D;
  await page.evaluate(`window.__crashThrow(${JSON.stringify({
    x: x0, y: t.at[1] + up, z: z0, yaw, pitch: 0, vx: t.dir[0] * v, vy: 0, vz: t.dir[2] * v, hold: true, fresh: true,
  })})`);
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  await page.sleep(300);
  await page.evaluate('window.__releasePose()');
  let prev = null;
  const T0 = Date.now();
  while (Date.now() - T0 < 3000) {
    const r = JSON.parse(await page.evaluate('JSON.stringify((() => { const s = window.__craftState(); return [s.worldX, s.worldY, s.worldZ]; })())'));
    const a = (r[0] - t.at[0]) * t.dir[0] + (r[2] - t.at[2]) * t.dir[2];
    if (a >= 0) {
      const y = prev && a > prev[3] ? prev[1] + ((r[1] - prev[1]) * (0 - prev[3])) / (a - prev[3]) : r[1];
      return t.at[1] + up - y;
    }
    prev = [...r, a];
    await page.sleep(5);
  }
  return 0;
}

/* One flight: thrown at `t` from far enough to be flying straight, held
 * until the streamed set is filled round the throw, then released and
 * watched. */
async function flyAt(page, t, v) {
  const dy = t.dir[1];
  const D = t.invisible ? 20 : Math.max(6, v * 0.2);
  const yaw = Math.hypot(t.dir[0], t.dir[2]) < 1e-6 ? 0 : (Math.atan2(-t.dir[0], -t.dir[2]) * 180) / Math.PI;
  const pitch = (Math.asin(dy) * 180) / Math.PI;
  /* A level throw is first flown in clear air 40 m over its line, and
   * the real one starts lower or higher by what that one fell or rose
   * reaching the target, so it crosses at the target's height whatever
   * the craft's lift. */
  const drop = dy === 0 && !t.land ? await riseOver(page, t, v, D, yaw) : 0;
  const plan = t.land
    ? { x: t.at[0], y: t.at[1] + 4, z: t.at[2], yaw, pitch: 0, vx: t.dir[0] * 3, vy: -4, vz: t.dir[2] * 3 }
    : {
      x: t.at[0] - t.dir[0] * D, y: t.at[1] - dy * D + drop, z: t.at[2] - t.dir[2] * D, yaw, pitch, vx: t.dir[0] * v, vy: dy * v, vz: t.dir[2] * v,
    };
  await page.evaluate(`window.__crashThrow(${JSON.stringify({ ...plan, hold: true, fresh: true })})`);
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    await page.sleep(100);
    const ok = await page.evaluate(`(() => { const it = window.__mapScene().userData.itaipu; const n = it.parts.town.town.stream.near;
      return Math.hypot(n.x - ${plan.x}, n.z - ${plan.z}) < 2 && !n.pending && !it.parts.dam.survey().colliders.fill; })()`);
    if (ok) {
      break;
    }
  }
  await page.sleep(300);
  const e0 = await page.evaluate('window.__crash().events');
  await page.evaluate('window.__releasePose()');
  const log = [];
  const T0 = Date.now();
  const ms = t.land ? 2000 : Math.max(900, ((2 * D) / v) * 1000 + 500);
  while (Date.now() - T0 < ms) {
    log.push(JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const s = window.__craftState(); const k = window.__contacts();
      return [s.worldX, s.worldY, s.worldZ, s.speed, k.obstacle.length, window.__crash().events, s.lastHitKind];
    })())`)));
    await page.sleep(15);
  }
  const along = (r) => (r[0] - t.at[0]) * t.dir[0] + (r[1] - t.at[1]) * dy + (r[2] - t.at[2]) * t.dir[2];
  const touched = (r) => r[4] > 0 || r[5] > e0 || (r[6] && r[6] !== 'none');
  const first = log.find(touched);
  const firstAt = first ? along(first) : null;
  const last = log[log.length - 1];
  let result;
  if (t.invisible) {
    result = first && firstAt < -1.5 ? 'invisible' : 'clear';
  } else if (t.land) {
    result = last[1] > t.at[1] - 1 ? 'stopped' : 'passed';
  } else {
    const beyond = log.find((r) => along(r) > 3);
    const metThere = first && firstAt > -D + 0.5 && firstAt < 3;
    if (!beyond) {
      result = metThere || first ? 'stopped' : 'short';
    } else if (metThere) {
      result = beyond[3] > v * 0.5 ? 'through' : 'stopped';
    } else {
      result = 'passed';
    }
  }
  return {
    result, firstAt: firstAt == null ? null : +firstAt.toFixed(1), firstHit: first ? first[6] : null,
    endSpeed: +last[3].toFixed(1), end: last.slice(0, 3).map((q) => +q.toFixed(1)),
  };
}

/* ------------------------------------------------------------ the run */

async function pageSweeps(out) {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=itaipu', seed: seed('5inch') });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__map().id === "itaipu"', 300000);
    await page.evaluate(HELPERS);
    await page.evaluate("(() => { const n = document.getElementById('ui'); if (n) { n.style.display = 'none'; } return 1; })()");

    if (ONLY.has('drawn') || ONLY.has('phantom') || ONLY.has('trees')) {
      out.drawn = {};
      out.phantom = {};
      out.trees = {};
      for (const [name, x, z] of CENTRES) {
        const ok = await settle(page, x, z);
        if (!ok) {
          fail(`the streamed set and the terrain did not settle round ${name} (${x}, ${z}) in 30 s`);
        }
        const q = JSON.stringify({ cx: x, cz: z, r: R, area: AREA });
        if (ONLY.has('drawn')) {
          const d = JSON.parse(await page.evaluate(`JSON.stringify(window.__ca.drawn(${q}))`));
          out.drawn[name] = d;
          const misses = Object.entries(d).filter(([, o]) => o.miss > 0).sort((p, c) => c[1].miss - p[1].miss);
          console.log(`drawn, ${name}: ${Object.values(d).reduce((s, o) => s + o.pts, 0)} points on drawn triangles within ${R} m; `
            + `not solid past 1 m: ${misses.map(([k, o]) => `${k} ${o.miss} in ${o.bins} bins`).join(', ') || 'none'}`);
          for (const [k, o] of misses.slice(0, 4)) {
            for (const w of o.worst.slice(0, 3)) {
              console.log(`    ${k}: ${w.n} at (${w.at.join(', ')}) y ${w.y.join(' to ')}`);
            }
          }
        }
        if (ONLY.has('phantom')) {
          const p = JSON.parse(await page.evaluate(`JSON.stringify(window.__ca.phantom(${q}))`));
          out.phantom[name] = p;
          const line = Object.entries(p.byKind).map(([k, o]) => `${k} ${o.n} (${o.invisible} invisible, ${o.pts ? Math.round((100 * o.far) / o.pts) : 0} % of their outside past 1 m)`).join('; ');
          console.log(`phantom, ${name}: ${line}`);
          for (const w of p.invisible.slice(0, 4)) {
            console.log(`    invisible ${w.key} at (${w.at.join(', ')}) ${w.size.join(' x ')} r ${w.r}`);
          }
        }
        if (ONLY.has('trees')) {
          const tr = JSON.parse(await page.evaluate(`JSON.stringify(window.__ca.trees(${q}))`));
          out.trees[name] = tr;
          console.log(`trees, ${name}: ${tr.drawn} drawn as models, ${tr.noPost} with no trunk post${tr.list.length ? ` (${tr.list.map((p) => p.join(',')).join('; ')})` : ''}`);
        }
      }
    }

    if (ONLY.has('refill')) {
      out.refill = { speeds: {} };
      for (const v of RUN_SPEEDS) {
        await settle(page, ...RUN[0]);
        const r = JSON.parse(await page.evaluate(REFILL(v, FINE_R)));
        out.refill.speeds[v] = {
          refills: r.refills, maxFrames: Math.max(0, ...r.refillFrames), maxMs: Math.max(0, ...r.refillMs), town: Math.round(r.town), veg: Math.round(r.veg), frameMs: +r.frameMs.toFixed(1),
        };
        console.log(`refill at ${v} m/s: ${r.refills} refills of ${r.refillFrames.join('/')} frames (${Math.max(0, ...r.refillMs)} ms at most, frames ${r.frameMs.toFixed(1)} ms); `
          + `least clearance to the edge of the set in force: town ${r.town.toFixed(0)} m of ${FINE_R}, near trees ${r.veg.toFixed(0)} m`);
      }
      const frames = Math.max(...Object.values(out.refill.speeds).map((s) => s.maxFrames));
      /* The pilot is MOVE from the centre when a refill starts and FINE_R
       * is what the set holds: what is left is the run the refill has. */
      const margin = FINE_R - MOVE;
      out.refill.maxFrames = frames;
      out.refill.safe60 = Math.round((margin * 60) / frames);
      out.refill.safe20 = Math.round((margin * 20) / frames);
      await settle(page, ...RUN[1]);
      const left = JSON.parse(await page.evaluate(LEFTOVERS));
      out.refill.left = left.left;
      console.log(`refill: at most ${frames} frames a refill, so ${margin} m of margin holds to ${out.refill.safe60} m/s at 60 frames a second and ${out.refill.safe20} m/s at 20; `
        + `${left.left} of ${left.streamed} streamed colliders left outside their part's reach${left.left ? ` (${JSON.stringify(left.kinds)})` : ''}`);
    }

    if (ONLY.has('bridge')) {
      const b = JSON.parse(await page.evaluate(`JSON.stringify((() => {
        const it = window.__mapScene().userData.itaipu;
        const col = it.parts.dam.survey().colliders;
        const f = it.parts.town.town.friendship;
        let mesh = null;
        it.parts.town.group.traverse((o) => { if (o.name && o.name.startsWith('itaipu-town-ring')) mesh = o; });
        mesh.updateMatrixWorld(true);
        const box = new window.__three.Box3().setFromObject(mesh);
        let solids = 0;
        for (let i = 0; i < col.count; i += 1) {
          const x = (col.fax[i] + col.fbx[i]) / 2, z = (col.faz[i] + col.fbz[i]) / 2;
          if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) solids += 1;
        }
        /* Deck points: the drawn deck's vertices at its top, and the ground there. */
        const P = mesh.geometry.getAttribute('position');
        const v = new window.__three.Vector3();
        let on = 0, deck = 0;
        for (let k = 0; k < P.count; k += 7) {
          v.fromBufferAttribute(P, k).applyMatrix4(mesh.matrixWorld);
          if (Math.abs(v.y - f.deckY) > 0.2) continue;
          deck += 1;
          if (Math.abs(window.__surface(v.x, v.z, v.y + 0.5) - v.y) < 0.3) on += 1;
        }
        return { length: f.length, deckY: f.deckY, water: f.water, box: [box.min.x, box.min.z, box.max.x, box.max.z].map(Math.round), solids, deck, on };
      })())`));
      out.bridge = b;
      console.log(`bridge: the Friendship Bridge, ${b.length} m, deck at ${f1(b.deckY)} over the river at ${f1(b.water)}: ${b.solids} colliders under its drawn extent, `
        + `ground at the deck under ${b.on} of ${b.deck} deck points`);
    }

    if (ONLY.has('water')) {
      out.water = {};
      for (const [name, x, z] of [['reservoir at the dam', 200, -2000], ['reservoir east', 2600, 1000], ['river below the dam', 0, -1300], ['river downstream', -900, 1500], ['spillway', -950, -1000]]) {
        await settle(page, x, z);
        const w = JSON.parse(await page.evaluate(`JSON.stringify((() => {
          const it = window.__mapScene().userData.itaipu;
          const T = it.terrain;
          const bodies = it.parts.water.group.children.filter((o) => o.isMesh);
          const out = {};
          /* Drawn water over the finest ground within 400 m: sinks = the
           * map's ground more than 0.5 m under the drawn surface there
           * (the chutes' sheet is drawn 0.4 m over its floor on purpose,
           * scripts/itaipu-water-check.js). */
          for (const m of bodies) {
            let pts = 0, sinks = 0, over = 0;
            const worst = [];
            m.updateMatrixWorld(true);
            const P = m.geometry.getAttribute('position');
            const I = m.geometry.index;
            const nt = (I ? I.count : P.count) / 3;
            const a = new window.__three.Vector3(), b = new window.__three.Vector3(), c = new window.__three.Vector3();
            let s = 11;
            const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
            for (let t = 0; t < nt; t += 1) {
              a.fromBufferAttribute(P, I ? I.getX(3 * t) : 3 * t).applyMatrix4(m.matrixWorld);
              b.fromBufferAttribute(P, I ? I.getX(3 * t + 1) : 3 * t + 1).applyMatrix4(m.matrixWorld);
              c.fromBufferAttribute(P, I ? I.getX(3 * t + 2) : 3 * t + 2).applyMatrix4(m.matrixWorld);
              const area = new window.__three.Triangle(a, b, c).getArea();
              const n = Math.min(20000, Math.max(1, Math.round(area / 25)));
              for (let k = 0; k < n; k += 1) {
                let p = rnd(), q = rnd();
                if (p + q > 1) { p = 1 - p; q = 1 - q; }
                const x = a.x + (b.x - a.x) * p + (c.x - a.x) * q, y = a.y + (b.y - a.y) * p + (c.y - a.y) * q, z = a.z + (b.z - a.z) * p + (c.z - a.z) * q;
                if (Math.hypot(x - ${x}, z - (${z})) > 400 || Math.abs(T.height(x, z) - T.finestAt(x, z)) > 0.05 || T.height(x, z) > y + 0.05) continue;
                pts += 1;
                const h = window.__surface(x, z, y + 0.5);
                if (h < y - 0.5) { sinks += 1; if (worst.length < 5) worst.push([x, y, z, h].map((v) => +v.toFixed(1))); }
                else if (h > y + 0.3) over += 1;
              }
            }
            out[m.name] = { pts, sinks, over, worst };
          }
          return out;
        })())`));
        out.water[name] = w;
        const line = Object.entries(w).filter(([, o]) => o.pts).map(([k, o]) => `${k.replace('itaipu-', '')} ${o.pts} points, ${o.sinks} where the ground is under the drawn surface, ${o.over} under something over it`).join('; ');
        console.log(`water, ${name}: ${line || 'no drawn water within 400 m'}`);
      }
    }

    if (ONLY.has('seats')) {
      out.seats = [];
      await settle(page, CREST_SPAWN.x, CREST_SPAWN.z);
      const seats = [];
      for (let k = 0; k < SLOT_RIGHT_M.length; k += 1) {
        const s = slotSpawn(CREST_SPAWN, k);
        seats.push([`crest seat ${k}`, s.x, s.z, 'ground']);
      }
      const water = JSON.parse(await readFile(join(DATA, 'water.json'), 'utf8'));
      for (const b of water) {
        seats.push([`${b.name} spawn`, b.spawn.x, b.spawn.z, 'water']);
      }
      seats.push(['air spawn', AIR_SPAWN.x, AIR_SPAWN.z, 'air']);
      for (const [name, x, z, kind] of seats) {
        if (kind !== 'ground') {
          await settle(page, x, z);
        }
        const r = JSON.parse(await page.evaluate(`JSON.stringify((() => {
          const col = window.__mapScene().userData.itaipu.parts.dam.survey().colliders;
          const g = ${kind === 'air' ? AIR_SPAWN.air.y : `window.__surface(${x}, ${z}, ${kind === 'ground' ? CREST_SPAWN.y + 1 : 1e9})`};
          /* Across the ground from the seat to every solid that stands
           * over it within two metres: the solids under the seat's own
           * ground (the crest's columns, held under its record) are not
           * in a wing's way. */
          const X = ${x}, Z = ${z};
          let gap = 20;
          for (let i = 0; i < col.count; i += 1) {
            const r = col.fbox[i] ? 0 : col.fr[i];
            const top = Math.max(col.fay[i], col.fby[i]) + r;
            const bot = Math.min(col.fay[i], col.fby[i]) - r;
            if (top <= g + 0.05 || bot >= g + 2) continue;
            let d;
            if (col.fbox[i]) {
              d = Math.hypot(Math.max(col.fax[i] - X, 0, X - col.fbx[i]), Math.max(col.faz[i] - Z, 0, Z - col.fbz[i]));
            } else {
              const ax = col.fax[i], az = col.faz[i], vx = col.fbx[i] - ax, vz = col.fbz[i] - az;
              const l2 = vx * vx + vz * vz;
              const f = l2 > 0 ? Math.max(0, Math.min(1, ((X - ax) * vx + (Z - az) * vz) / l2)) : 0;
              d = Math.max(0, Math.hypot(X - ax - vx * f, Z - az - vz * f) - r);
            }
            gap = Math.min(gap, d);
          }
          return { g, gap };
        })())`));
        out.seats.push({ name, gap: +r.gap.toFixed(2), y: +r.g.toFixed(2) });
        console.log(`seats: ${name} at (${f1(x)}, ${f1(r.g)}, ${f1(z)}): nearest solid standing over it ${r.gap >= 20 ? '20 m or more' : `${f1(r.gap)} m`} across the ground`
          + `${r.gap < SEAT_CLEAR ? `, under the ${SEAT_CLEAR} m a room's widest wing needs` : ''}`);
      }
    }

    if (ONLY.has('fly')) {
      out.fly = { quad: await flights(page, 'five inch', [30, 45]) };
    }

    const errors = page.errors.filter((e) => !/net::ERR_|Failed to load resource|favicon/.test(e));
    if (errors.length) {
      fail(`page errors with the five inch: ${errors.slice(0, 3).join(' | ')}`);
    }
  } finally {
    await page.close();
  }
  if (ONLY.has('fly')) {
    const plane = await openPage({ root, width: 960, height: 540, url: '/index.html?map=itaipu', seed: seed('f16878') });
    try {
      await plane.until('window.__shellReady && window.__map && window.__map().ready && window.__map().id === "itaipu"', 300000);
      out.fly.f16 = await flights(plane, 'F-16', [45, 70]);
      const errors = plane.errors.filter((e) => !/net::ERR_|Failed to load resource|favicon/.test(e));
      if (errors.length) {
        fail(`page errors with the F-16: ${errors.slice(0, 3).join(' | ')}`);
      }
    } finally {
      await plane.close();
    }
  }
}

async function flights(page, craft, speeds) {
  const out = {};
  /* The targets are found with the set filled round the town's lines. */
  await settle(page, -1400, 3000);
  const targets = JSON.parse(await page.evaluate(TARGETS));
  for (const t of targets) {
    for (const v of speeds) {
      const r = await flyAt(page, t, v);
      out[`${t.name} @${v}`] = r.result;
      console.log(`fly: ${craft} at ${v} m/s into ${t.name}: ${r.result}${r.firstAt == null ? '' : `, first contact ${f1(r.firstAt)} m along from it`}`
        + `, ${f1(r.endSpeed)} m/s at the end at (${r.end.join(', ')})`);
    }
  }
  return out;
}

/* ------------------------------------------------------------ baseline */

/* The numbers the baseline holds, flat: name -> [value, worse], worse
 * 'up' when a larger number is a regression. */
function metrics(out) {
  const m = {};
  if (out.footprints) {
    m['footprints.over2'] = [out.footprints.over2, 'up'];
    m['footprints.concave.buildings'] = [out.footprints.concave.buildings, 'up'];
    m['footprints.slant.buildings'] = [out.footprints.slant.buildings, 'up'];
    m['footprints.areaM2'] = [out.footprints.concave.areaM2 + out.footprints.slant.areaM2, 'up'];
  }
  for (const [c, d] of Object.entries(out.drawn ?? {})) {
    for (const [k, o] of Object.entries(d)) {
      m[`drawn.${c}.${k}`] = [o.miss, 'up'];
    }
  }
  for (const [c, p] of Object.entries(out.phantom ?? {})) {
    for (const [k, o] of Object.entries(p.byKind)) {
      m[`phantom.${c}.${k}.invisible`] = [o.invisible, 'up'];
      m[`phantom.${c}.${k}.far`] = [o.far, 'up'];
    }
  }
  for (const [c, t] of Object.entries(out.trees ?? {})) {
    m[`trees.${c}.noPost`] = [t.noPost, 'up'];
  }
  if (out.refill) {
    m['refill.maxFrames'] = [out.refill.maxFrames, 'up'];
    m['refill.left'] = [out.refill.left, 'up'];
    for (const [v, s] of Object.entries(out.refill.speeds)) {
      m[`refill.${v}.town`] = [s.town, 'down'];
    }
  }
  if (out.bridge) {
    m['bridge.solids'] = [out.bridge.solids, 'down'];
    m['bridge.on'] = [out.bridge.on, 'down'];
  }
  for (const [c, w] of Object.entries(out.water ?? {})) {
    for (const [k, o] of Object.entries(w)) {
      m[`water.${c}.${k}.sinks`] = [o.sinks, 'up'];
    }
  }
  for (const s of out.seats ?? []) {
    m[`seats.${s.name}`] = [s.gap, 'down'];
  }
  return m;
}

/* How bad a flight's result is: a solid that stopped the craft becoming
 * one it goes through or past is a regression, and so is open ground
 * becoming an invisible solid. */
const RANK = {
  stopped: 0, through: 1, passed: 2, short: 1, clear: 0, invisible: 1,
};

function compare(out, base) {
  const now = metrics(out);
  const then = metrics(base);
  let worse = 0;
  for (const [k, [v, dir]] of Object.entries(now)) {
    if (!(k in then)) {
      continue;
    }
    const b = then[k][0];
    const bad = dir === 'up' ? v > b + (k.startsWith('seats.') ? 0 : SLACK(b)) : v < b - (k.startsWith('seats.') ? 0.1 : k.startsWith('refill.') ? 30 : SLACK(b));
    if (bad) {
      worse += 1;
      fail(`${k}: ${v}, the baseline ${b}`);
    }
  }
  for (const craft of ['quad', 'f16']) {
    for (const [k, r] of Object.entries(out.fly?.[craft] ?? {})) {
      const b = base.fly?.[craft]?.[k];
      if (b && RANK[r] > RANK[b]) {
        worse += 1;
        fail(`fly ${craft} ${k}: ${r}, the baseline ${b}`);
      }
    }
  }
  for (const s of out.seats ?? []) {
    if (s.gap < SEAT_CLEAR) {
      fail(`${s.name}: a solid ${s.gap} m from the seat`);
    }
  }
  return worse;
}

async function main() {
  const out = {};
  if (ONLY.has('footprints')) {
    out.footprints = await footprints();
  }
  if ([...ONLY].some((k) => k !== 'footprints')) {
    await pageSweeps(out);
  }
  if (RECORD) {
    const prev = existsSync(BASELINE) ? JSON.parse(await readFile(BASELINE, 'utf8')) : {};
    const next = {
      note: 'Today\'s numbers, not a target: several are defects scripts/collide-audit-itaipu.js found. The run fails when one gets worse than this.',
      ...prev,
      ...out,
    };
    await writeFile(BASELINE, `${JSON.stringify(next, null, 1)}\n`);
    console.log(`recorded the baseline: ${BASELINE}`);
  } else if (existsSync(BASELINE)) {
    const worse = compare(out, JSON.parse(await readFile(BASELINE, 'utf8')));
    console.log(worse ? `${worse} worse than the baseline` : 'nothing worse than the baseline');
  } else {
    fail(`no baseline at ${BASELINE}: run with --record`);
  }
  console.log(failures.length ? `${failures.length} failed` : 'passed');
  process.exit(failures.length ? 1 : 0);
}

await main();
