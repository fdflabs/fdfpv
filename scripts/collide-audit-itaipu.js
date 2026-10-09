/*
 * collide-audit-itaipu.js: what a craft can hit on the Itaipu map against
 * what is drawn there, swept, and held to a recorded baseline.
 *
 *   [SIM_GPU=1] [FDFPV_ITAIPU_DATA=DIR] node scripts/collide-audit-itaipu.js
 *       [--only=footprints,roofslabs,drawn,phantom,trees,refill,bridge,water,seats,fly,dam,damfly,town]
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
 *   roofslabs   every roof and deck record the town makes (town/model.js
 *               planTown): the crash physics' slabs under it (roofs.js
 *               slabs, the records' own or roofSlabs) against the top they
 *               stand under, on a grid of points over each slab's upper
 *               face: how many records have a slab reaching more than
 *               RAY_TOL past the drawn plan (a wall in the air off its
 *               edge) or standing more than RAY_TOL over the drawn top (a
 *               wall through the roof), either of which fails the run, and
 *               how much of the plan the slabs cover, by record kind.
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
 *               streamed collider is left over from an earlier fill (a
 *               near tree's post or crown counted one for one against
 *               the trees the last fill's centre makes, the town's by
 *               its reach), and none of the near trees is missing.
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
 *               wall box, a courtyard and its building's roof edge, and
 *               the Friendship Bridge's deck, an arch rib and a column. Each is
 *               `stopped` (met there and did not go on), `through` (met,
 *               then on past it at over half its speed) or `passed` (went
 *               past with nothing); a dive onto open ground is
 *               `invisible` when the craft meets something more than
 *               1.5 m over the ground, else `clear`.
 *   dam         rays through the dam (DAM_RAYS): straight down over the
 *               spillway's gates, piers, hoists, bridge and chute, every
 *               concrete crest and its faces, and the embankments'
 *               crests, and level, both ways, along and across each, at
 *               every half metre of height. Along each ray the first thing
 *               physics meets (a static collider, one of the dam's roof
 *               slabs the crash physics declares, the ground a craft is
 *               offered) against the first thing drawn. Physics more than
 *               RAY_TOL in front of anything drawn is an invisible wall,
 *               and one the dam's own colliders or slabs make fails the
 *               run; drawn more than RAY_TOL in front of physics is drawn
 *               but not solid, held to the baseline.
 *   town        the dam's rays, straight down only, over a TOWN_SIDE square
 *               of each of the town's densest quarters (TOWN): every
 *               static and streamed collider, every town record's slab, and
 *               the roof or ground a craft is offered, against what is
 *               drawn. An invisible wall a slab makes fails the run.
 *   damfly      the owner's crash (2026-10-01): a Timber flown over the
 *               spillway's open bays at the bridge deck's level and out
 *               from under the bridge, which must pass, and into a pier
 *               and the deck's edge, which must stop it.
 *
 * THE BASELINE (tests/collide-audit-itaipu-baseline.json) is today's
 * numbers, not a target: several of them are defects this audit found
 * (docs are in the pull request that added it). The run fails when a
 * number gets worse than the baseline by more than its slack, or a flight
 * that stopped no longer does. --record rewrites it from this run.
 *
 * Exits 1 on a regression or a page error, 0 otherwise.
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
import { FINE_R, MOVE, planTown } from '../src/maps/itaipu/town/model.js';
import { roofSlabs, roofTop } from '../src/render/library/roofs.js';
import { CREST_SPAWN, AIR_SPAWN } from '../src/maps/itaipu/spawns.js';
import { slotSpawn, SLOT_RIGHT_M } from '../src/game/slots.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const BASELINE = join(root, 'tests', 'collide-audit-itaipu-baseline.json');
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const ALL = ['footprints', 'roofslabs', 'drawn', 'phantom', 'trees', 'refill', 'bridge', 'water', 'seats', 'fly', 'dam', 'damfly', 'town'];
const NODE = new Set(['footprints', 'roofslabs']);
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
/* The dam's rays: how far physics may stand in front of what is drawn,
 * or behind it, before it is a wall or a hole. The dam's own stairs are
 * STAIR, 0.25 m, out of a turned face, and its tops SKIN under a record;
 * dam-check's faces hold drawn walls within 0.5 m of a solid. */
const RAY_TOL = 0.5;
/* The town's rays: the middle of the densest 400 m squares of Foz do
 * Iguacu and of Hernandarias (osm/buildings.json), and the side of the
 * square round each, metres. */
const TOWN = [
  ['foz', 3000, 2600],
  ['hernandarias', -4600, -2600],
];
const TOWN_SIDE = 300;

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};
const f1 = (v) => (v == null ? 'n/a' : Number(v).toFixed(1));

function seed(airframe) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe),
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
    const { boxes, eaves } = wallBoxes(drawn, 0, 10, null, []);
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

/* Every town record's slabs against its drawn top: on an 8 x 8 grid over
 * each slab's upper face, how far the point is outside the record's plan
 * and how far over its top, and on a COVER_STEP grid over the plan, how
 * much of it some slab is under. The plan is the town's own (planTown),
 * on level ground: a slab's reach past its roof does not depend on how
 * high the roof stands. */
const COVER_STEP = 0.5;
async function roofSlabSweep() {
  const data = {};
  for (const name of ['osm/buildings.json', 'osm/roads.json', 'osm/power.json', 'osm/landuse.json']) {
    data[name] = JSON.parse(await readFile(join(DATA, name), 'utf8'));
  }
  const town = await planTown({ data, ground: () => 0, sink: { face() {}, bar() {} } });
  const byKind = {};
  for (const rec of town.records) {
    const world = (lx, lz) => [rec.c * lx + rec.s * lz + rec.tx, -rec.s * lx + rec.c * lz + rec.tz];
    const plans = rec.faces.map((f) => f.pts.map(([x, z]) => world(x, z)));
    const outside = (x, z) => (plans.some((p) => pointIn(p, x, z)) ? 0 : Math.min(...plans.map((p) => edgeDist(p, x, z))));
    const slabs = rec.slabs ?? roofSlabs(rec);
    let out = 0;
    let up = 0;
    let at = null;
    for (const sl of slabs) {
      for (let a = -1; a <= 1 + 1e-9; a += 2 / 7) {
        for (let b = -1; b <= 1 + 1e-9; b += 2 / 7) {
          const p = [0, 1, 2].map((k) => sl.c[k] + sl.u[k] * sl.hu * a + sl.v[k] * sl.hv * b + sl.n[k] * sl.hn);
          const o = outside(p[0], p[2]);
          const t = roofTop(rec, p[0], p[2]);
          const u = Number.isNaN(t) ? 0 : p[1] - t;
          if (o > out || u > up) {
            at = p.map((q) => +q.toFixed(1));
          }
          out = Math.max(out, o);
          up = Math.max(up, u);
        }
      }
    }
    /* Under a slab: inside its upper face's rectangle in plan. */
    const under = (x, z) => slabs.some((sl) => {
      const dx = x - sl.c[0];
      const dz = z - sl.c[2];
      const lu = (dx * sl.u[0] + dz * sl.u[2]) / (sl.u[0] * sl.u[0] + sl.u[2] * sl.u[2] || 1);
      const lv = (dx * sl.v[0] + dz * sl.v[2]) / (sl.v[0] * sl.v[0] + sl.v[2] * sl.v[2] || 1);
      return Math.abs(lu) <= sl.hu && Math.abs(lv) <= sl.hv;
    });
    let pts = 0;
    let held = 0;
    for (const p of plans) {
      const xs = p.map((q) => q[0]);
      const zs = p.map((q) => q[1]);
      for (let x = Math.min(...xs) + COVER_STEP / 2; x < Math.max(...xs); x += COVER_STEP) {
        for (let z = Math.min(...zs) + COVER_STEP / 2; z < Math.max(...zs); z += COVER_STEP) {
          if (!pointIn(p, x, z)) {
            continue;
          }
          pts += 1;
          held += under(x, z) ? 1 : 0;
        }
      }
    }
    const o = byKind[rec.kind] ?? (byKind[rec.kind] = {
      records: 0, slabs: 0, out: 0, up: 0, outWorst: 0, upWorst: 0, pts: 0, held: 0, worst: [],
    });
    o.records += 1;
    o.slabs += slabs.length;
    o.pts += pts;
    o.held += held;
    o.out += out > RAY_TOL ? 1 : 0;
    o.up += up > RAY_TOL ? 1 : 0;
    o.outWorst = Math.max(o.outWorst, +out.toFixed(2));
    o.upWorst = Math.max(o.upWorst, +up.toFixed(2));
    if (out > RAY_TOL || up > RAY_TOL) {
      o.worst.push({ osm: rec.osm ?? null, out: +out.toFixed(2), up: +up.toFixed(2), at });
    }
  }
  for (const [k, o] of Object.entries(byKind)) {
    o.cover = +(o.pts ? o.held / o.pts : 1).toFixed(3);
    o.worst = o.worst.sort((p, c) => Math.max(c.out, c.up) - Math.max(p.out, p.up)).slice(0, 8);
    delete o.pts;
    delete o.held;
    console.log(`roofslabs, ${k}: ${o.records} records, ${o.slabs} slabs; past ${RAY_TOL} m outside the drawn plan on ${o.out} (${f1(o.outWorst)} m at worst), `
      + `over the drawn top on ${o.up} (${f1(o.upWorst)} m at worst); the slabs are under ${(100 * o.cover).toFixed(1)} % of the plan`);
    for (const w of o.worst.slice(0, 3)) {
      console.log(`    OSM ${w.osm}: ${f1(w.out)} m outside, ${f1(w.up)} m over, at (${w.at.join(', ')})`);
    }
    if (o.out || o.up) {
      fail(`roofslabs, ${k}: ${o.out} records with a slab past their plan and ${o.up} with one over their top`);
    }
  }
  return byKind;
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
      /* By where the instance's geometry is, not its matrix's origin: the
       * spillway gates' gear is drawn at gate 0 and moved by an offset. */
      const m = new THREE.Matrix4();
      if (!g.boundingSphere) g.computeBoundingSphere();
      const bs = g.boundingSphere;
      const c = new THREE.Vector3();
      for (let k = 0; k < mesh.count; k += 1) {
        mesh.getMatrixAt(k, m);
        const w = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, m);
        c.copy(bs.center).applyMatrix4(w);
        if (Math.hypot(c.x - cx, c.z - cz) <= r + 60 + bs.radius) mats.push(w);
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
  /* A box's extents in its own frame and the way back to the world's:
   * the world's own for an axis aligned box, its (u, y, w) for a turned
   * one (collide.js addTurnedBox). */
  const TURNED = 2;
  const boxFrame = (i) => {
    if (col.fbox[i] !== TURNED) {
      return { lo: [col.fax[i], col.fay[i], col.faz[i]], hi: [col.fbx[i], col.fby[i], col.fbz[i]], toWorld: (p) => p, toBox: (p) => p, dir: (d) => d };
    }
    const tx = col.fux[i], tz = col.fuz[i], n2 = tx * tx + tz * tz;
    return {
      lo: [col.fu0[i], col.fay[i], col.fw0[i]],
      hi: [col.fu1[i], col.fby[i], col.fw1[i]],
      toWorld: (p) => [(p[0] * tx - p[2] * tz) / n2, p[1], (p[0] * tz + p[2] * tx) / n2],
      toBox: (p) => [p[0] * tx + p[2] * tz, p[1], p[2] * tx - p[0] * tz],
      dir: (d) => [d[0] * tx + d[2] * tz, d[1], d[2] * tx - d[0] * tz],
    };
  };
  /* Points on collider i's outside, 5 cm out, that nothing else holds:
   * not inside another solid, not under a roof or the ground. */
  const outside = (i, spacing) => {
    const pts = [];
    const off = 0.05;
    if (col.fbox[i]) {
      const { lo, hi, toWorld } = boxFrame(i);
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
            pts.push(toWorld(p));
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
        const f = col.fbox[i] ? boxFrame(i) : { lo: [col.fax[i], col.fay[i], col.faz[i]], hi: [col.fbx[i], col.fby[i], col.fbz[i]] };
        invisible.push({ key, at: [mx, (col.fay[i] + col.fby[i]) / 2, mz].map((q) => +q.toFixed(1)),
          size: [0, 1, 2].map((k) => +Math.abs(f.hi[k] - f.lo[k]).toFixed(1)), r: +col.fr[i].toFixed(2) });
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
  window.__ca = { it, col, T, holds, drawn, phantom, trees, triGrid, nearestTri, triDist, eachTri, meshesOf, boxFrame };
  return true;
})()`;

/*
 * THE DAM'S RAYS (window.__dr), after HELPERS. Each region is a frame on
 * the plan, { name, o, a, t: [t0, t1], s: [s0, s1], y: [y0, y1], step,
 * top, ystep, across, along }: a point is o + a t + n s with n =
 * (-a.z, a.x), the dam's own frameOf. Rays are shot straight down from
 * `top` over a grid of (t, s) `step` apart, and level, both ways, along t
 * every `along` of s and along s every `across` of t, at every ystep of
 * y (none when it is 0). Along each ray two distances:
 *
 *   physics  the first static collider (not a tree or a canopy), the
 *            first of the dam's roof slabs (the crash physics' obstacle
 *            boxes, roofs.js roofSlabs) and, for a ray down, the ground
 *            a craft there is offered (height() from the ray's top, which
 *            is the roofs as well as the ground and the water);
 *   drawn    the first triangle of every part's drawn meshes (as the
 *            phantom sweep reads them), and the drawn ground and water.
 *
 * Physics met more than TOL before anything drawn, at a point further
 * than TOL from every drawn triangle, the ground and the water, is an
 * INVISIBLE WALL, as deep as that distance (up to 5 m); drawn met more
 * than TOL before physics, at a point no collider or offered ground holds
 * within TOL, is drawn but NOT SOLID, as deep as physics is behind it.
 * Both are binned 5 m on the plan, with what was met.
 */
const DAM_RAYS = `(() => {
  const THREE = window.__three;
  const {
    it, col, eachTri, meshesOf, triDist, boxFrame,
  } = window.__ca;
  const dam = it.parts.dam.survey();
  const damSlabs = dam.records.flatMap((r) => r.slabs.map((sl) => ({ sl, kind: r.kind })));
  /* A town region's (R.town) are the town's records' slabs, as the crash
   * physics is handed them (roofs.js slabs: the record's own, or
   * roofSlabs' made once and kept on it), and its colliders the streamed
   * set's as well as the static. */
  const townSlabs = (x0, z0, x1, z1) => it.parts.town.town.records
    .filter((r) => r.maxX >= x0 && r.minX <= x1 && r.maxZ >= z0 && r.minZ <= z1)
    .flatMap((r) => (r.slabs ?? (r.slabs = window.__roofSlabsOf(r))).map((sl) => ({ sl, kind: r.kind })));
  const own = new Uint8Array(col.count);
  for (const i of dam.solidIndices) own[i] = 1;
  const CELL = 4;
  const ck = (i, j) => (i + 32768) * 65536 + (j + 32768);
  const put = (g, x0, z0, x1, z1, box, v) => {
    const i0 = Math.max(Math.floor(x0 / CELL), box[0]), i1 = Math.min(Math.floor(x1 / CELL), box[2]);
    const j0 = Math.max(Math.floor(z0 / CELL), box[1]), j1 = Math.min(Math.floor(z1 / CELL), box[3]);
    for (let i = i0; i <= i1; i += 1) for (let j = j0; j <= j1; j += 1) {
      const k = ck(i, j);
      let l = g.get(k);
      if (!l) { l = []; g.set(k, l); }
      l.push(v);
    }
  };
  const ground = (x, z) => window.__surface(x, z, -1e9);

  /* Ray against an axis aligned box, a capsule (Quilez), an oriented box
   * and a triangle (Moller and Trumbore, either side): the distance along
   * the unit ray to its first meeting, Infinity for none. */
  const rayBox = (o, d, lo, hi) => {
    let t0 = 0, t1 = Infinity;
    for (let k = 0; k < 3; k += 1) {
      if (Math.abs(d[k]) < 1e-12) {
        if (o[k] < lo[k] || o[k] > hi[k]) return Infinity;
        continue;
      }
      let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
      if (a > b) { const q = a; a = b; b = q; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return Infinity;
    }
    return t0;
  };
  const sphere = (o, d, c, r) => {
    const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
    const b = ox * d[0] + oy * d[1] + oz * d[2];
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    const h = b * b - cc;
    if (h < 0) return Infinity;
    const t = -b - Math.sqrt(h);
    return t >= 0 ? t : (cc <= 0 ? 0 : Infinity);
  };
  const rayCapsule = (o, d, pa, pb, r) => {
    const ba = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const oa = [o[0] - pa[0], o[1] - pa[1], o[2] - pa[2]];
    const baba = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
    if (baba < 1e-12) return sphere(o, d, pa, r);
    const bard = ba[0] * d[0] + ba[1] * d[1] + ba[2] * d[2];
    const baoa = ba[0] * oa[0] + ba[1] * oa[1] + ba[2] * oa[2];
    const rdoa = d[0] * oa[0] + d[1] * oa[1] + d[2] * oa[2];
    const oaoa = oa[0] * oa[0] + oa[1] * oa[1] + oa[2] * oa[2];
    const a = baba - bard * bard;
    let best = Math.min(sphere(o, d, pa, r), sphere(o, d, pb, r));
    if (a > 1e-9 * baba) {
      const b = baba * rdoa - baoa * bard;
      const c = baba * oaoa - baoa * baoa - r * r * baba;
      const h = b * b - a * c;
      if (h >= 0) {
        const t = (-b - Math.sqrt(h)) / a;
        const y = baoa + t * bard;
        if (t >= 0 && y > 0 && y < baba) best = Math.min(best, t);
      }
    }
    return best;
  };
  const rayObb = (o, d, sl) => {
    const rel = [o[0] - sl.c[0], o[1] - sl.c[1], o[2] - sl.c[2]];
    const ax = [sl.u, sl.n, sl.v];
    const h = [sl.hu, sl.hn, sl.hv];
    const lo = [], hi = [], oo = [], dd = [];
    for (let k = 0; k < 3; k += 1) {
      oo.push(rel[0] * ax[k][0] + rel[1] * ax[k][1] + rel[2] * ax[k][2]);
      dd.push(d[0] * ax[k][0] + d[1] * ax[k][1] + d[2] * ax[k][2]);
      lo.push(-h[k]); hi.push(h[k]);
    }
    return rayBox(oo, dd, lo, hi);
  };
  const rayTri = (o, d, T9, k) => {
    const ax = T9[k], ay = T9[k + 1], az = T9[k + 2];
    const e1x = T9[k + 3] - ax, e1y = T9[k + 4] - ay, e1z = T9[k + 5] - az;
    const e2x = T9[k + 6] - ax, e2y = T9[k + 7] - ay, e2z = T9[k + 8] - az;
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return Infinity;
    const inv = 1 / det;
    const sx = o[0] - ax, sy = o[1] - ay, sz = o[2] - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return Infinity;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) return Infinity;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t >= 0 ? t : Infinity;
  };

  const run = (R, TOL) => {
    const n = [-R.a[1], R.a[0]];
    const P = (t, s) => [R.o[0] + R.a[0] * t + n[0] * s, R.o[1] + R.a[1] * t + n[1] * s];
    const corners = [P(R.t[0], R.s[0]), P(R.t[1], R.s[0]), P(R.t[1], R.s[1]), P(R.t[0], R.s[1])];
    const M = 8;
    const bx0 = Math.min(...corners.map((c) => c[0])) - M, bx1 = Math.max(...corners.map((c) => c[0])) + M;
    const bz0 = Math.min(...corners.map((c) => c[1])) - M, bz1 = Math.max(...corners.map((c) => c[1])) + M;
    const box = [Math.floor(bx0 / CELL), Math.floor(bz0 / CELL), Math.floor(bx1 / CELL), Math.floor(bz1 / CELL)];
    const slabs = R.town ? townSlabs(bx0, bz0, bx1, bz1) : damSlabs;
    /* What each 4 m cell holds. */
    const G = new Map();
    for (let i = 0; i < (R.town ? col.baseCount : col.staticCount); i += 1) {
      const kn = col.kindName(col.fkind[i]);
      if (kn === 'tree' || kn === 'canopy') continue;
      const r = col.fbox[i] ? 0 : col.fr[i];
      const x0 = Math.min(col.fax[i], col.fbx[i]) - r, x1 = Math.max(col.fax[i], col.fbx[i]) + r;
      const z0 = Math.min(col.faz[i], col.fbz[i]) - r, z1 = Math.max(col.faz[i], col.fbz[i]) + r;
      if (x1 < bx0 || x0 > bx1 || z1 < bz0 || z0 > bz1) continue;
      put(G, x0, z0, x1, z1, box, i);
    }
    slabs.forEach((e, k) => {
      const { sl } = e;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
        const x = sl.c[0] + sl.u[0] * sl.hu * a + sl.n[0] * sl.hn * b + sl.v[0] * sl.hv * c;
        const z = sl.c[2] + sl.u[2] * sl.hu * a + sl.n[2] * sl.hn * b + sl.v[2] * sl.hv * c;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      if (x1 < bx0 || x0 > bx1 || z1 < bz0 || z0 > bz1) return;
      put(G, x0, z0, x1, z1, box, -1 - k);
    });
    const tris = [];
    const triMesh = [];
    const names = [];
    /* eachTri keeps a triangle by its middle, and the spillway bridge's
     * deck is one quad 362 m long: reach that far past the region. */
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, rr = Math.hypot(bx1 - bx0, bz1 - bz0) / 2 + 400;
    for (const [pn, m] of meshesOf()) {
      if (!m.isMesh) continue;
      const id = names.length;
      names.push(pn + '/' + m.name);
      eachTri(m, cx, cz, rr, (a, b, c) => {
        const k = tris.length / 9;
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        triMesh.push(id);
        put(G, Math.min(a.x, b.x, c.x), Math.min(a.z, b.z, c.z), Math.max(a.x, b.x, c.x), Math.max(a.z, b.z, c.z), box, 1e9 + k);
      });
    }
    const T9 = new Float64Array(tris);
    const stampC = new Int32Array(col.count), stampS = new Int32Array(slabs.length + 1), stampT = new Int32Array(triMesh.length + 1);
    let stamp = 0;
    /* One ray: physics and drawn, each { t, what }, met within L of its
     * start: the grid holds only the region, so a solid that reaches out
     * of it would be met where nothing drawn has been gathered. */
    const cast = (o, d, L, tGround, tPhysGround) => {
      stamp += 1;
      let tP = tPhysGround, wP = 'ground';
      let tD = tGround, wD = 'ground';
      const test = (v) => {
        if (v >= 1e9) {
          const k = v - 1e9;
          if (stampT[k] === stamp) return;
          stampT[k] = stamp;
          const t = rayTri(o, d, T9, k * 9);
          if (t < tD && t <= L) { tD = t; wD = names[triMesh[k]]; }
        } else if (v < 0) {
          const k = -1 - v;
          if (stampS[k] === stamp) return;
          stampS[k] = stamp;
          const t = rayObb(o, d, slabs[k].sl);
          if (t < tP && t <= L) { tP = t; wP = 'slab of ' + slabs[k].kind; }
        } else {
          if (stampC[v] === stamp) return;
          stampC[v] = stamp;
          let t;
          if (col.fbox[v]) {
            const f = boxFrame(v);
            t = rayBox(f.toBox(o), f.dir(d), f.lo, f.hi);
          } else {
            t = rayCapsule(o, d, [col.fax[v], col.fay[v], col.faz[v]], [col.fbx[v], col.fby[v], col.fbz[v]], col.fr[v]);
          }
          if (t < tP && t <= L) { tP = t; wP = (own[v] ? 'dam ' : 'other ') + col.kindName(col.fkind[v]) + (col.fbox[v] ? ' box' : ' capsule') + ' #' + v; }
        }
      };
      /* Amanatides and Woo across the cells, in order. */
      let i = Math.floor(o[0] / CELL), j = Math.floor(o[2] / CELL);
      const sx = d[0] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
      const nx = Math.abs(d[0]) > 1e-12 ? (((sx > 0 ? i + 1 : i) * CELL) - o[0]) / d[0] : Infinity;
      const nz = Math.abs(d[2]) > 1e-12 ? (((sz > 0 ? j + 1 : j) * CELL) - o[2]) / d[2] : Infinity;
      const dx = Math.abs(d[0]) > 1e-12 ? CELL / Math.abs(d[0]) : Infinity;
      const dz = Math.abs(d[2]) > 1e-12 ? CELL / Math.abs(d[2]) : Infinity;
      let tx = nx, tz = nz;
      for (;;) {
        const l = G.get(ck(i, j));
        if (l) for (const v of l) test(v);
        const exit = Math.min(tx, tz);
        if (exit > Math.min(tP, tD) + TOL || exit > L) break;
        if (tx < tz) { tx += dx; i += sx; } else { tz += dz; j += sz; }
      }
      return { tP, wP, tD, wD };
    };
    const out = {
      rays: 0, invisible: 0, notSolid: 0, inv: {}, ns: {},
    };
    const note = (bins, at, gap, what, other) => {
      const k = Math.floor(at[0] / 5) * 5 + ',' + Math.floor(at[2] / 5) * 5;
      const b = bins[k] || (bins[k] = { n: 0, gap: 0, at: null, what: '', other: '' });
      b.n += 1;
      if (gap > b.gap) { b.gap = gap; b.at = at.map((q) => +q.toFixed(1)); b.what = what; b.other = other; }
    };
    /* How far a point is from everything drawn, the ground and the
     * water too, up to FAR. */
    const FAR = 5;
    const drawnGap = (p) => {
      let best = Math.min(FAR, Math.abs(p[1] - ground(p[0], p[2])));
      for (let i = Math.floor((p[0] - FAR) / CELL); i <= Math.floor((p[0] + FAR) / CELL); i += 1) {
        for (let j = Math.floor((p[2] - FAR) / CELL); j <= Math.floor((p[2] + FAR) / CELL); j += 1) {
          const l = G.get(ck(i, j));
          if (!l) continue;
          for (const v of l) {
            if (v < 1e9) continue;
            const dd = triDist(T9, (v - 1e9) * 9, p[0], p[1], p[2]);
            if (dd < best) best = dd;
          }
        }
      }
      return best;
    };
    /* Whether physics holds a point: a collider within TOL, or the ground
     * a craft there is offered within TOL under it. */
    const solidAt = (p) => col.gapAt(p[0], p[1], p[2], TOL) <= TOL || window.__surface(p[0], p[2], p[1] + TOL) >= p[1] - TOL;
    /* Physics met first and further than TOL from anything drawn: an
     * invisible wall, as deep as it is from the nearest drawn surface.
     * Drawn met first and nothing solid within TOL of it: not solid, as
     * deep as physics is behind it along the ray. */
    const judge = (o, d, r) => {
      out.rays += 1;
      const at = (t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
      if (r.tP < r.tD - TOL) {
        const p = at(r.tP);
        const g = drawnGap(p);
        if (g > TOL) {
          out.invisible += 1;
          note(out.inv, p, g, r.wP, r.wD);
        }
      } else if (r.tD < r.tP - TOL) {
        const p = at(r.tD);
        if (!solidAt(p)) {
          out.notSolid += 1;
          note(out.ns, p, Math.min(r.tP, 999) - r.tD, r.wD, r.wP);
        }
      }
    };
    /* Down. */
    const downS = R.downS ?? R.s;
    for (let t = R.t[0]; R.step && t <= R.t[1] + 1e-9; t += R.step) {
      for (let s = downS[0]; s <= downS[1] + 1e-9; s += R.step) {
        const [x, z] = P(t, s);
        const o = [x, R.top, z];
        const g = ground(x, z);
        if (g >= R.top) continue;
        const gp = window.__surface(x, z, R.top);
        judge(o, [0, -1, 0], cast(o, [0, -1, 0], R.top - g + 1, R.top - g, R.top - gp));
      }
    }
    /* Level, both ways along a line from one edge of the region to the
     * other, from outside it; a ray that starts inside a solid or under
     * the ground is not shot. */
    const level = (A, B, y) => {
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const d = [(B[0] - A[0]) / L, 0, (B[1] - A[1]) / L];
      const o = [A[0], y, A[1]];
      /* Under a roof the start can be inside a drawn body held by its
       * roof alone (a gravity part's face over the wedge under it). */
      if (ground(o[0], o[2]) >= y || col.gapAt(o[0], o[1], o[2], 0.01) <= 0.01 || window.__surface(o[0], o[2], 1e9) > y) return;
      let tg = Infinity;
      for (let t = 0.5; t <= L; t += 0.5) {
        if (ground(o[0] + d[0] * t, o[2] + d[2] * t) >= y) { tg = t; break; }
      }
      judge(o, d, cast(o, d, Math.min(L, tg) + 1, tg, tg));
    };
    for (let y = R.y[0]; R.ystep && y <= R.y[1] + 1e-9; y += R.ystep) {
      if (R.along) {
        for (let s = R.s[0]; s <= R.s[1] + 1e-9; s += R.along) {
          level(P(R.t[0] - 4, s), P(R.t[1] + 4, s), y);
          level(P(R.t[1] + 4, s), P(R.t[0] - 4, s), y);
        }
      }
      if (R.across) {
        for (let t = R.t[0]; t <= R.t[1] + 1e-9; t += R.across) {
          level(P(t, R.s[0] - 4), P(t, R.s[1] + 4), y);
          level(P(t, R.s[1] + 4), P(t, R.s[0] - 4), y);
        }
      }
    }
    const top = (bins) => Object.values(bins).sort((p, q) => q.gap - p.gap);
    const inv = top(out.inv), ns = top(out.ns);
    const tally = (list) => {
      const by = {};
      for (const b of list) by[b.what] = (by[b.what] || 0) + 1;
      return by;
    };
    return {
      rays: out.rays, invisible: out.invisible, notSolid: out.notSolid,
      invBins: inv.length, nsBins: ns.length, invBy: tally(inv), nsBy: tally(ns),
      invWorst: inv.slice(0, 12), nsWorst: ns.slice(0, 12),
    };
  };
  window.__dr = { run };
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

/* Every streamed collider its part's last fill did not put there: the
 * town's walls further than WALLS_R round a building's middle (a building
 * is at most 300 m across here), its poles further than WIRES_R round a
 * chord's middle (chords are 25 m); and a tree's post or crown sphere
 * that is not one of those the near trees round the fill's centre make
 * (plant.js nearTrees and addTree, run again here). The trees are counted
 * one for one rather than by a distance, because a set the budget cut
 * short holds whole cells of trees up to a cell's diagonal past its
 * reach, which by distance read as left behind. */
const LEFTOVERS = `(async () => {
  const it = window.__mapScene().userData.itaipu;
  const col = it.parts.dam.survey().colliders;
  const t = it.parts.town.town.stream.near;
  const veg = it.parts.vegetation;
  const v = veg.near;
  const P = await import('/src/maps/itaipu/vegetation/plant.js');
  const key = (kind, x, z) => kind + ':' + Math.fround(x) + ',' + Math.fround(z);
  const want = new Map();
  const put = (k) => want.set(k, (want.get(k) || 0) + 1);
  const rec = {
    addPost(kind, x, z) { put(key(kind, x, z)); },
    addSphere(kind, x, y, z) { put(key(kind, x, z)); },
  };
  for (const tree of P.nearTrees(veg.forest, v.x, v.z).trees) P.addTree(rec, veg.forest, tree, veg.crowns);
  let left = 0;
  const kinds = {};
  for (let i = col.staticCount; i < col.staticCount + col.streamCount; i += 1) {
    const kn = col.kindName(col.fkind[i]);
    let stale;
    if (kn === 'tree' || kn === 'canopy') {
      const k = key(kn, col.fax[i], col.faz[i]);
      stale = !(want.get(k) > 0);
      if (!stale) want.set(k, want.get(k) - 1);
    } else {
      const mx = (col.fax[i] + col.fbx[i]) / 2, mz = (col.faz[i] + col.fbz[i]) / 2;
      stale = Math.hypot(mx - t.x, mz - t.z) > (kn === 'wall' ? 1000 + 300 : 450 + 25);
    }
    if (stale) { left += 1; kinds[kn] = (kinds[kn] || 0) + 1; }
  }
  let missing = 0;
  for (const n of want.values()) missing += n;
  return JSON.stringify({ streamed: col.streamCount, left, kinds, missing });
})()`;

/* The flights' targets, found in the map's own parts round where they
 * are flown. Each { name, at, dir, expect, land?, only? }: dir a unit vector the
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
   * string drawn under its beam (y 158 to 160.8, a pole inside it). */
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
        T.push({ name: 'powerhouse gantry insulator string', at: [(col.fax[j] + col.fbx[j]) / 2, 159.4, (col.faz[j] + col.fbz[j]) / 2],
          dir: perp([col.fbx[j] - col.fax[j], 0, col.fbz[j] - col.faz[j]]), expect: 'stopped' });
        break;
      }
    }
  }
  /* The switchyard's first transformer: its tank, and its middle
   * bushing (war/plan.js KIT: u 1.8 on the tank's axis, from the tank's
   * top to KIT.bushings.height over it), crossed at its middle. The
   * tank's first collider runs along its axis, from -u to +u. */
  {
    const W = await import('/src/maps/itaipu/war/plan.js');
    const i = it.parts.war.yard.solids[0];
    const a = [col.fax[i], col.fay[i], col.faz[i]], b = [col.fbx[i], col.fby[i], col.fbz[i]];
    const c = [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2];
    const ax = flat([b[0] - a[0], 0, b[2] - a[2]]);
    const g = window.__surface(c[0], c[2], -1e9);
    const u = W.KIT.bushings.u[1];
    const y = g + W.TANK.plinth + W.TANK.height + W.KIT.bushings.height / 2;
    T.push({ name: 'switchyard transformer tank', at: c, dir: perp(ax), expect: 'stopped' });
    T.push({ name: 'switchyard transformer middle bushing', at: [c[0] + ax[0] * u, y, c[2] + ax[2] * u], dir: perp(ax), expect: 'stopped' });
  }
  /* The deepest invisible wall the footprints section finds: open
   * ground 26 m from building w608156691's drawn walls, under its wall
   * box. Dived onto from 20 m up, a craft should reach the ground. */
  {
    const P = [553.9, 3915.8];
    T.push({ name: 'open ground under an invisible wall box (w608156691)', at: [P[0], window.__surface(P[0], P[1], -1e9) + 0.5, P[1]], dir: [0, -1, 0], expect: 'clear', invisible: true });
  }
  /* A courtyard building (w608142837, its hole drawn through a slit in
   * the one outline): its courtyard dived onto, and its flat roof landed
   * on by the five inch 0.6 m from the courtyard's edge, moving along
   * that edge. Not the F-16: 15 m of it over a roof strip 10 m wide
   * tips into the courtyard or not by how it lands, which says nothing
   * about the roof. */
  {
    const C = [1271.9, 3049.4];
    T.push({ name: 'courtyard of w608142837, dived onto', at: [C[0], window.__surface(C[0], C[1], -1e9) + 0.5, C[1]], dir: [0, -1, 0], expect: 'clear', invisible: true });
    const E = [1267.1, 3057.5];
    T.push({ name: 'courtyard building roof edge (w608142837), landed on', at: [E[0], window.__surface(E[0], E[1], 1e9), E[1]], dir: flat([15.2, 0, 9]), expect: 'stopped', land: true, only: 'five inch' });
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
    /* Across it, at its near side: a flight is judged by where it is
     * first met, and the deck is 14 m wide. */
    const across = perp(along);
    T.push({ name: 'Friendship Bridge deck, flown through', at: [cx - across[0] * f.width / 2, f.deckY - 0.8, cz - across[2] * f.width / 2], dir: across, expect: 'stopped' });
    T.push({ name: 'Friendship Bridge deck, landed on', at: [cx, f.deckY, cz], dir: along, expect: 'passed', land: true });
    /* Its arch: the rib capsule and the column nearest the deck's middle,
     * crossed level at their middles, across the bridge. */
    const nearest = (r) => {
      let best = -1, bd = Infinity;
      for (let i = 0; i < col.staticCount; i += 1) {
        if (col.fbox[i] || Math.abs(col.fr[i] - r) > 1e-6) continue;
        const d = Math.hypot((col.fax[i] + col.fbx[i]) / 2 - cx, (col.faz[i] + col.fbz[i]) / 2 - cz);
        if (d < bd) { bd = d; best = i; }
      }
      return [(col.fax[best] + col.fbx[best]) / 2, (col.fay[best] + col.fby[best]) / 2, (col.faz[best] + col.fbz[best]) / 2];
    };
    T.push({ name: 'Friendship Bridge arch rib', at: nearest(1.1), dir: perp(along), expect: 'stopped' });
    T.push({ name: 'Friendship Bridge column', at: nearest(0.7), dir: perp(along), expect: 'stopped' });
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

/*
 * The same for a dive: thrown UP over its line and flown down to UP over
 * the target in clear air, and where the CG is across the ground when it
 * gets there, against where it was aimed. A jet dived with its stick
 * centred pulls off the line on its trim: the F-16 thrown 9 m over a
 * conductor at 45 m/s crossed its height 0.23 m to the side and met it
 * with a wing, and at 70 m/s from 14 m, 0.47 m to the side, beside it.
 */
async function pullOver(page, t, v, D, yaw, pitch) {
  const up = 40;
  await page.evaluate(`window.__crashThrow(${JSON.stringify({
    x: t.at[0] - t.dir[0] * D, y: t.at[1] - t.dir[1] * D + up, z: t.at[2] - t.dir[2] * D, yaw, pitch, vx: t.dir[0] * v, vy: t.dir[1] * v, vz: t.dir[2] * v, hold: true, fresh: true,
  })})`);
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  await page.sleep(300);
  await page.evaluate('window.__releasePose()');
  let prev = null;
  const T0 = Date.now();
  while (Date.now() - T0 < 3000) {
    const r = JSON.parse(await page.evaluate('JSON.stringify((() => { const s = window.__craftState(); return [s.worldX, s.worldY, s.worldZ]; })())'));
    if (r[1] <= t.at[1] + up) {
      const f = prev && prev[1] > r[1] ? (prev[1] - (t.at[1] + up)) / (prev[1] - r[1]) : 1;
      const at = prev ? [prev[0] + (r[0] - prev[0]) * f, prev[2] + (r[2] - prev[2]) * f] : [r[0], r[2]];
      return [at[0] - t.at[0], at[1] - t.at[2]];
    }
    prev = r;
    await page.sleep(5);
  }
  return [0, 0];
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
  /* A dive at a solid starts aside by what it pulls, so the CG crosses the
   * target's height on the target (pullOver). */
  const pull = dy !== 0 && !t.land && !t.invisible ? await pullOver(page, t, v, D, yaw, pitch) : [0, 0];
  const plan = t.land
    ? { x: t.at[0], y: t.at[1] + 4, z: t.at[2], yaw, pitch: 0, vx: t.dir[0] * 3, vy: -4, vz: t.dir[2] * 3 }
    : {
      x: t.at[0] - t.dir[0] * D - pull[0], y: t.at[1] - dy * D + drop, z: t.at[2] - t.dir[2] * D - pull[1], yaw, pitch, vx: t.dir[0] * v, vy: dy * v, vz: t.dir[2] * v,
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
  /* How far across the line from the target the CG went by it. */
  const k = log.findIndex((r) => along(r) >= 0);
  const by = k > 0 ? (() => {
    const a = log[k - 1];
    const b = log[k];
    const f = -along(a) / (along(b) - along(a));
    const p = [0, 1, 2].map((q) => a[q] + (b[q] - a[q]) * f - t.at[q]);
    const d = p[0] * t.dir[0] + p[1] * dy + p[2] * t.dir[2];
    return +Math.hypot(p[0] - d * t.dir[0], p[1] - d * dy, p[2] - d * t.dir[2]).toFixed(2);
  })() : null;
  return {
    result, firstAt: firstAt == null ? null : +firstAt.toFixed(1), firstHit: first ? first[6] : null,
    endSpeed: +last[3].toFixed(1), end: last.slice(0, 3).map((q) => +q.toFixed(1)), by,
  };
}

/* ------------------------------------------------------------ the run */

async function pageSweeps(out) {
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=itaipu', seed: seed('interceptor') });
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
      out.refill.missing = left.missing;
      console.log(`refill: at most ${frames} frames a refill, so ${margin} m of margin holds to ${out.refill.safe60} m/s at 60 frames a second and ${out.refill.safe20} m/s at 20; `
        + `${left.left} of ${left.streamed} streamed colliders left over from an earlier fill${left.left ? ` (${JSON.stringify(left.kinds)})` : ''}, `
        + `${left.missing} of the near trees' colliders missing`);
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
              d = col.boxGap(i, X, (col.fay[i] + col.fby[i]) / 2, Z);
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

    if (ONLY.has('dam')) {
      out.dam = await damRays(page);
    }

    if (ONLY.has('town')) {
      out.town = await townRays(page);
    }

    const errors = page.errors.filter((e) => !/net::ERR_|Failed to load resource|favicon/.test(e));
    if (errors.length) {
      fail(`page errors with the five inch: ${errors.slice(0, 3).join(' | ')}`);
    }
  } finally {
    await page.close();
  }
  if (ONLY.has('damfly')) {
    const timber = await openPage({ root, width: 960, height: 540, url: '/index.html?map=itaipu', seed: seed(DAM_FLY_CRAFT) });
    try {
      await timber.until('window.__shellReady && window.__map && window.__map().ready && window.__map().id === "itaipu"', 300000);
      out.damfly = await damFlights(timber);
      const errors = timber.errors.filter((e) => !/net::ERR_|Failed to load resource|favicon/.test(e));
      if (errors.length) {
        fail(`page errors with the Timber: ${errors.slice(0, 3).join(' | ')}`);
      }
    } finally {
      await timber.close();
    }
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

/* The dam's regions for its rays (DAM_RAYS), from dam.json: the
 * spillway's gates, piers, hoists and bridge, and its chute, in the
 * chute's frame (dam/index.js: u across, d down the chute from the
 * gates); every segment of the concrete crests' axes, 30 m upstream and
 * 50 m down, the crest from 3 m under it up past the intake gantries'
 * houses (255 m) and down onto it to 12 m downstream (`downS`, where the
 * rays go down), and their faces under and past that; and the embankments'
 * crests, rays down only. */
async function damRegions() {
  const dam = JSON.parse(await readFile(join(DATA, 'dam.json'), 'utf8'));
  const by = Object.fromEntries(dam.map((e) => [e.part, e]));
  const unit = (p, q) => {
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return [(q[0] - p[0]) / l, (q[1] - p[1]) / l, l];
  };
  const [c0, c1] = by.spillway.sections.find((x) => x.at === 'chute').axis;
  const [nx, nz] = unit(c0, c1);
  const a = [nz, -nx];
  const out = [
    {
      name: 'spillway gates, piers, hoists and bridge', o: c0, a, t: [-186, 186], s: [-16, 46], y: [196, 240], top: 250, step: 1, ystep: 0.5, along: 1, across: 1,
    },
    {
      name: 'spillway chute', o: c0, a, t: [-186, 186], s: [46, 490], y: [100, 230], top: 240, step: 2, ystep: 2, along: 10, across: 0,
    },
  ];
  for (const part of ['right lateral dam', 'main dam and connecting blocks', 'diversion structure', 'left lateral dam']) {
    const axis = by[part].axis;
    for (let k = 0; k + 1 < axis.length; k += 1) {
      const [ux, uz, l] = unit(axis[k], axis[k + 1]);
      if (l < 2) {
        continue;
      }
      out.push({
        name: `${part} crest ${k}`, group: `${part} crest`, o: axis[k], a: [ux, uz], t: [0, l], s: [-30, 50], downS: [-30, 12], y: [222, 240], top: 260, step: 1, ystep: 0.5, along: 2, across: 2,
      });
      out.push({
        name: `${part} faces ${k}`, group: `${part} faces`, o: axis[k], a: [ux, uz], t: [0, l], s: [-30, 50], downS: [13, 50], y: [205, 221.5], top: 260, step: 1, ystep: 0.5, along: 2, across: 2,
      });
    }
  }
  for (const part of ['rockfill dam', 'left bank earth dam', 'right bank earth dam']) {
    const axis = by[part].axis;
    for (let k = 0; k + 1 < axis.length; k += 1) {
      const [ux, uz, l] = unit(axis[k], axis[k + 1]);
      if (l < 2) {
        continue;
      }
      out.push({
        name: `${part} crest ${k}`, group: `${part} crest`, o: axis[k], a: [ux, uz], t: [0, l], s: [-24, 24], y: [225, 240], top: 240, step: 2, ystep: 0, along: 0, across: 0,
      });
    }
  }
  return out;
}

/* Every region's rays, the camera parked over its middle first so the
 * terrain is at its finest under it. Invisible walls a dam collider or
 * slab makes fail the run; ones another part's collider makes are
 * printed (the power lines are not this audit's), and drawn but not
 * solid is held to the baseline. */
async function damRays(page) {
  await page.evaluate(DAM_RAYS);
  const regions = await damRegions();
  const out = {};
  let lastAt = null;
  for (const R of regions) {
    const n = [-R.a[1], R.a[0]];
    const tm = (R.t[0] + R.t[1]) / 2;
    const sm = (R.s[0] + R.s[1]) / 2;
    const mx = R.o[0] + R.a[0] * tm + n[0] * sm;
    const mz = R.o[1] + R.a[1] * tm + n[1] * sm;
    if (!lastAt || Math.hypot(mx - lastAt[0], mz - lastAt[1]) > 300) {
      await settle(page, mx, mz);
      lastAt = [mx, mz];
    }
    const r = JSON.parse(await page.evaluate(`JSON.stringify(window.__dr.run(${JSON.stringify(R)}, ${RAY_TOL}))`));
    const g = R.group ?? R.name;
    const o = out[g] ?? (out[g] = {
      rays: 0, invisible: 0, notSolid: 0, invBy: {}, nsBy: {}, invWorst: [], nsWorst: [],
    });
    o.rays += r.rays;
    o.invisible += r.invisible;
    o.notSolid += r.notSolid;
    for (const [k, v] of Object.entries(r.invBy)) {
      o.invBy[k] = (o.invBy[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(r.nsBy)) {
      o.nsBy[k] = (o.nsBy[k] ?? 0) + v;
    }
    o.invWorst = [...o.invWorst, ...r.invWorst].sort((p, c) => c.gap - p.gap).slice(0, 12);
    o.nsWorst = [...o.nsWorst, ...r.nsWorst].sort((p, c) => c.gap - p.gap).slice(0, 12);
  }
  for (const [g, o] of Object.entries(out)) {
    const own = Object.entries(o.invBy).filter(([k]) => !k.startsWith('other '));
    const other = Object.entries(o.invBy).filter(([k]) => k.startsWith('other '));
    o.damInvisibleBins = own.reduce((s, [, v]) => s + v, 0);
    o.otherInvisibleBins = other.reduce((s, [, v]) => s + v, 0);
    console.log(`dam rays, ${g}: ${o.rays} rays; invisible wall past ${RAY_TOL} m on ${o.invisible} (${o.damInvisibleBins} 5 m bins the dam's, ${o.otherInvisibleBins} another part's); `
      + `drawn but not solid on ${o.notSolid} (${Object.values(o.nsBy).reduce((s, v) => s + v, 0)} bins)`);
    for (const [k, v] of Object.entries(o.invBy).sort((p, c) => c[1] - p[1]).slice(0, 6)) {
      console.log(`    invisible: ${v} bins of ${k}`);
    }
    for (const w of o.invWorst.slice(0, 5)) {
      console.log(`      ${w.gap >= 5 ? '5 m or more' : `${f1(w.gap)} m`} from anything drawn at (${w.at.join(', ')}): ${w.what}`);
    }
    for (const [k, v] of Object.entries(o.nsBy).sort((p, c) => c[1] - p[1]).slice(0, 4)) {
      console.log(`    not solid: ${v} bins of ${k}`);
    }
    for (const w of o.nsWorst.slice(0, 3)) {
      console.log(`      ${f1(w.gap)} m of ${w.what} at (${w.at.join(', ')}) before ${w.other}`);
    }
    if (o.damInvisibleBins) {
      fail(`dam rays, ${g}: ${o.damInvisibleBins} bins of invisible wall the dam's colliders or slabs make, ${f1(o.invWorst.find((w) => !w.what.startsWith('other '))?.gap)} m from anything drawn at worst`);
    }
  }
  return out;
}

/* The town's rays (TOWN): down over a TOWN_SIDE square round each
 * centre, with the streamed set filled round it. What a slab makes is
 * counted apart from what a collider does (a wall column past its
 * drawn wall is the footprints sweep's). */
async function townRays(page) {
  await page.evaluate("import('/src/render/library/roofs.js').then((m) => { window.__roofSlabsOf = m.roofSlabs; return 1; })");
  await page.evaluate(DAM_RAYS);
  const out = {};
  for (const [name, x, z] of TOWN) {
    if (!(await settle(page, x, z))) {
      fail(`the streamed set and the terrain did not settle round ${name} (${x}, ${z}) in 30 s`);
    }
    const top = Math.ceil(await page.evaluate(`window.__surface(${x}, ${z}, 1e9)`)) + 120;
    const h = TOWN_SIDE / 2;
    const R = {
      name, town: true, o: [x - h, z - h], a: [1, 0], t: [0, TOWN_SIDE], s: [0, TOWN_SIDE], y: [0, 0], top, step: 1, ystep: 0, along: 0, across: 0,
    };
    const r = JSON.parse(await page.evaluate(`JSON.stringify(window.__dr.run(${JSON.stringify(R)}, ${RAY_TOL}))`));
    const slab = Object.entries(r.invBy).filter(([k]) => k.startsWith('slab of '));
    const o = {
      rays: r.rays,
      invisible: r.invisible,
      slabInvisibleBins: slab.reduce((n, [, v]) => n + v, 0),
      otherInvisibleBins: Object.entries(r.invBy).filter(([k]) => !k.startsWith('slab of ')).reduce((n, [, v]) => n + v, 0),
      notSolidBins: r.nsBins,
      slabBy: Object.fromEntries(slab),
      invWorst: r.invWorst.slice(0, 8),
    };
    out[name] = o;
    console.log(`town rays, ${name}: ${o.rays} rays down; invisible wall past ${RAY_TOL} m on ${o.invisible}, ${o.slabInvisibleBins} 5 m bins a roof slab's `
      + `(${slab.map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}), ${o.otherInvisibleBins} a collider's; drawn but not solid in ${o.notSolidBins} bins`);
    for (const w of o.invWorst.slice(0, 5)) {
      console.log(`      ${w.gap >= 5 ? '5 m or more' : `${f1(w.gap)} m`} from anything drawn at (${w.at.join(', ')}): ${w.what}`);
    }
    if (o.slabInvisibleBins) {
      fail(`town rays, ${name}: ${o.slabInvisibleBins} bins of invisible wall a roof slab makes`);
    }
  }
  return out;
}

/* The owner's flight (2026-10-01, "when i fly over this area of the dam
 * or the spillway, at some points the aircraft crash like theyre hitting
 * an invisible wall"): a Timber over the spillway's open bays, between
 * the piers' tops and the bridge's level, which met the bridge's roof
 * slab 114 m outside the deck; and, so the fix is not a hole, a pier and
 * the bridge deck flown into. In the chute's frame: u across, d down. */
const DAM_FLY_CRAFT = 'timber1500';
/* Each flight is FLY_RUN metres before its point and as far past it,
 * level, at a little throttle so the Timber holds its height, timed on
 * the plant's clock so a loaded machine flies the same flight. */
const FLY_RUN = 15;
const FLY_THROTTLE = 0.5;
async function flySim(page, t, v) {
  const D = FLY_RUN;
  const yaw = (Math.atan2(-t.dir[0], -t.dir[2]) * 180) / Math.PI;
  const plan = {
    x: t.at[0] - t.dir[0] * D, y: t.at[1], z: t.at[2] - t.dir[2] * D, yaw, pitch: 0, vx: t.dir[0] * v, vy: 0, vz: t.dir[2] * v,
  };
  await page.evaluate(`window.__crashThrow(${JSON.stringify({ ...plan, hold: true, fresh: true })})`);
  await page.evaluate(`window.__stick(0, 0, 0, ${FLY_THROTTLE})`);
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
  const s0 = await page.evaluate('window.__crash().simT');
  await page.evaluate('window.__releasePose()');
  const log = [];
  const simS = (2 * D) / v + 0.5;
  /* A wreck's plant stops its clock: the flight is over when the clock
   * has run the flight's time, or the craft is a wreck and the clock has
   * stood still for 3 s (a loaded page's clock stands still too, so not
   * on that alone), or after two minutes. */
  let ticked = Date.now();
  let lastT = s0;
  const T0 = Date.now();
  for (;;) {
    const r = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const s = window.__craftState(); const k = window.__contacts(); const c = window.__crash();
      return [s.worldX, s.worldY, s.worldZ, s.speed, k.obstacle.length, c.events, s.lastHitKind, c.wrecked, c.simT];
    })())`));
    log.push(r);
    if (r[8] !== lastT) {
      lastT = r[8];
      ticked = Date.now();
    }
    if (r[8] - s0 > simS || (r[7] && Date.now() - ticked > 3000) || Date.now() - T0 > 120000) {
      break;
    }
    await page.sleep(10);
  }
  const along = (r) => (r[0] - t.at[0]) * t.dir[0] + (r[2] - t.at[2]) * t.dir[2];
  const touched = (r) => r[4] > 0 || r[5] > e0 || r[7] || (r[6] && r[6] !== 'none');
  const first = log.find(touched);
  const firstAt = first ? along(first) : null;
  const last = log[log.length - 1];
  const beyond = log.find((r) => along(r) > D - 1);
  let result;
  if (!first) {
    result = beyond ? 'passed' : 'short';
  } else if (firstAt > -3 && firstAt < 3) {
    result = log.some((r) => along(r) > 3 && r[3] > v * 0.5) ? 'through' : 'stopped';
  } else {
    result = 'met elsewhere';
  }
  return {
    result,
    firstAt: firstAt == null ? null : +firstAt.toFixed(1),
    firstY: first ? +first[1].toFixed(2) : null,
    firstHit: first ? first[6] : null,
    wrecked: last[7],
    endSpeed: +last[3].toFixed(1),
    end: last.slice(0, 3).map((q) => +q.toFixed(1)),
  };
}

async function damFlights(page) {
  const regions = await damRegions();
  const S = regions[0];
  const n = [-S.a[1], S.a[0]];
  const at = (u, d, y) => [S.o[0] + S.a[0] * u + n[0] * d, y, S.o[1] + S.a[1] * u + n[1] * d];
  /* Gate 6's bay is u -25.5 to -5.5 (dam/index.js pierU), pier 6 from
   * u -5.5 to 0; the piers' slopes fall from 225 at d 7 to 213 at d 29,
   * so at d 18 their tops are at 219, and the bridge deck is d -10.5 to
   * -3.5 (dam/index.js SPILL.deck, upstream of the leaves' swing), 222.8
   * to 225. */
  const across = [S.a[0], 0, S.a[1]];
  const down = [n[0], 0, n[1]];
  const flights = [
    { name: 'across the bays at 224.8 m, 18 m down from the gates', at: at(-15.5, 18, 224.8), dir: across, expect: 'passed' },
    { name: 'across the bays at 224.8 m, 35 m down from the gates', at: at(-15.5, 35, 224.8), dir: across, expect: 'passed' },
    { name: 'across the bays at 222 m, 18 m down from the gates', at: at(-15.5, 18, 222), dir: across, expect: 'passed' },
    { name: 'down gate 6\'s bay at 223.5 m from the bridge\'s downstream edge', at: at(-15.5, 23, 223.5), dir: down, expect: 'passed' },
    { name: 'into pier 6\'s side at 215 m, 18 m down from the gates', at: at(-5.5, 18, 215), dir: across, expect: 'stopped' },
    { name: 'into the bridge deck\'s downstream edge at 224 m', at: at(-15.5, -3.5, 224), dir: down.map((q) => -q), expect: 'stopped' },
  ];
  const out = {};
  const mid = at(-15.5, 18, 0);
  await settle(page, mid[0], mid[2]);
  for (const t of flights) {
    for (const v of [20, 30]) {
      const r = await flySim(page, t, v);
      out[`${t.name} @${v}`] = r.result;
      const ok = r.result === t.expect;
      console.log(`damfly: Timber at ${v} m/s ${t.name}: ${r.result}${r.firstAt == null ? '' : `, first contact ${f1(r.firstAt)} m along from it at y ${r.firstY} (${r.firstHit})`}`
        + `${r.wrecked ? ', wrecked' : ''}, ${f1(r.endSpeed)} m/s at the end at (${r.end.join(', ')})${ok ? '' : `, wanted ${t.expect}`}`);
      if (!ok) {
        fail(`damfly ${t.name} @${v}: ${r.result}, wanted ${t.expect}`);
      }
    }
  }
  return out;
}

async function flights(page, craft, speeds) {
  const out = {};
  /* The targets are found with the set filled round the town's lines. */
  await settle(page, -1400, 3000);
  const targets = JSON.parse(await page.evaluate(TARGETS));
  for (const t of targets.filter((q) => !q.only || q.only === craft)) {
    for (const v of speeds) {
      const r = await flyAt(page, t, v);
      out[`${t.name} @${v}`] = r.result;
      console.log(`fly: ${craft} at ${v} m/s into ${t.name}: ${r.result}${r.firstAt == null ? '' : `, first contact ${f1(r.firstAt)} m along from it`}`
        + `${r.by == null || r.result === 'stopped' ? '' : `, the CG ${r.by} m across from it`}, ${f1(r.endSpeed)} m/s at the end at (${r.end.join(', ')})`);
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
    m['refill.missing'] = [out.refill.missing, 'up'];
    for (const [v, s] of Object.entries(out.refill.speeds)) {
      m[`refill.${v}.town`] = [s.town, 'down'];
    }
  }
  /* Node's, so exact: no slack (compare). */
  for (const [k, o] of Object.entries(out.roofslabs ?? {})) {
    m[`roofslabs.${k}.out`] = [o.out, 'up'];
    m[`roofslabs.${k}.up`] = [o.up, 'up'];
    m[`roofslabs.${k}.cover`] = [o.cover, 'down'];
  }
  for (const [c, o] of Object.entries(out.town ?? {})) {
    m[`town.${c}.slabInvisibleBins`] = [o.slabInvisibleBins, 'up'];
    m[`town.${c}.otherInvisibleBins`] = [o.otherInvisibleBins, 'up'];
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
  /* Drawn but not solid, the dam's own meshes' 5 m bins: other parts'
   * (the town's, the chute's water) are their owners' and move with what
   * is streamed in. */
  for (const [g, o] of Object.entries(out.dam ?? {})) {
    m[`dam.${g}.notSolidBins`] = [Object.entries(o.nsBy).filter(([k]) => k.startsWith('dam/')).reduce((n, [, v]) => n + v, 0), 'up'];
    m[`dam.${g}.otherInvisibleBins`] = [o.otherInvisibleBins, 'up'];
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
    const exact = k.startsWith('roofslabs.');
    const bad = dir === 'up' ? v > b + (k.startsWith('seats.') || exact ? 0 : SLACK(b)) : v < b - (exact ? 0 : k.startsWith('seats.') ? 0.1 : k.startsWith('refill.') ? 30 : SLACK(b));
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
  if (ONLY.has('roofslabs')) {
    out.roofslabs = await roofSlabSweep();
  }
  if ([...ONLY].some((k) => !NODE.has(k))) {
    await pageSweeps(out);
  }
  if (RECORD) {
    const prev = existsSync(BASELINE) ? JSON.parse(await readFile(BASELINE, 'utf8')) : {};
    /* damfly's flights are held to what they must do, not to a record. */
    const { damfly, ...kept } = out;
    const next = {
      note: 'Today\'s numbers, not a target: several are defects scripts/collide-audit-itaipu.js found. The run fails when one gets worse than this.',
      ...prev,
      ...kept,
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
