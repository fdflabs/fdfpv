/*
 * collide-audit-swiss2.js: what a pilot sees against what a pilot can hit,
 * on the Swiss valley and the Alps, swept rather than looked at.
 *
 *   SIM_GPU=1 node scripts/collide-audit-swiss2.js [--maps=swiss2,alps]
 *        [--only=static,fly,roofs] [--write-baseline] [--json=FILE]
 *
 * The owner asked for "a complete audit on collision physics ... areas
 * where things collide or fly through, the whole nine yards". A picture
 * answers that for one spot; this answers it for every triangle, and says
 * the same thing tomorrow, so a new prop without a collider or a collider
 * left behind by a moved prop shows up as a number that went up.
 *
 * Each map is opened twice through tests/lib/page.js, one browser at a
 * time: once seated with the F-16 (the static sweeps and the fast plane),
 * once with the five inch (the quad's throws and the roof let-downs).
 *
 * STATIC (--only=static), all in the page, off window.__crashSolids,
 * window.__surface, window.__roofs and the scene graph:
 *
 *   drawn    Every drawn static mesh (LOD level 0, and the instances the
 *            fences and boulders refill round the camera, gathered by
 *            flying the camera over the map first) sampled at one point
 *            per 0.5 m voxel. A point is solid if the ground or a roof
 *            under it (the map's height(), from just over the point) is
 *            within 0.5 m of it, or a collider is. The rest are clustered
 *            and each cluster is given a class (CLASSES below).
 *   ghost    Every collider but the trees (collider-audit.js owns those)
 *            sampled over its exposed surface at 0.5 m: a collider whose
 *            exposed surface is mostly more than 1 m from anything drawn
 *            is an invisible wall.
 *   pokers   Colliders that stand up through a roof a craft lands on and
 *            are not the roof's own (its cover lets those through): the
 *            crest lamp kind of fault. Listed if what pokes up is not
 *            drawn.
 *   terrain  The ground's meshes, the carved cliffs and the headwall
 *            against height(), as an offset along the ground's normal:
 *            a drawn face in front of the collision ground is flown
 *            through, one behind it is an invisible wall.
 *   water    The drawn lake, stream and pool surfaces against the
 *            plant's water (window.__waterSample), both ways.
 *
 * FLY (--only=fly): a sample of every collider class (walls, thin walls,
 * poles, thin posts, rails, rocks, trunks) thrown at level through its
 * middle along a clear line, the F-16 at 60 m/s and the five inch at
 * 40 m/s, through the shell's own obstacle pass. A throw that crosses to
 * the far side still at 70 percent of its speed with nothing met, its
 * centre's path having passed through the solid, is a tunnel; one whose
 * path went over it (a plane thrown level climbs on its lift) is a miss.
 * The query is swept (collide.js hit(): a segment against each capsule
 * and box, every OBSTACLE_STEP of sim time), so no tunnel is expected.
 * Each throw is its own call under THROW_MS: a craft state that went NaN
 * and a throw that froze the page are counted too, since both happen.
 *
 * ROOFS (--only=roofs): the five inch let down at 0.8 m/s, motors idle,
 * onto the flattest landable point of every roof record. It must stay on
 * the roof; on a roof under 15 degrees there it must break nothing.
 *
 * THE BASELINE. scripts/collide-audit-baseline.json holds the counts this
 * run measured when it was written (--write-baseline). A later run fails
 * (exit 1) if any count got worse by more than SLACK, a throw tunnels
 * that did not, or the page logged an error. A count that got better is
 * printed, so the baseline can be rewritten with the fix that did it.
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

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const BASELINE = join(root, 'scripts', 'collide-audit-baseline.json');
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const MAPS = arg('maps', 'swiss2,alps').split(',');
const ONLY = arg('only', 'static,fly,roofs').split(',');
const WRITE = process.argv.includes('--write-baseline');
const JSON_OUT = arg('json', '');

/* A count may drift by this much before it is a regression: the world is
 * seeded, but the refilled instances are gathered from camera stops on
 * the frame clock. */
const SLACK = (base) => Math.max(3, Math.ceil(base * 0.03));

/* What each map names that the generic rules cannot know. `terrain` are
 * the meshes compared against height() along the normal instead of swept
 * as props (steep drawn ground reads as "above the ground" to a vertical
 * test); the ground's own tiles are found by their vertices lying on
 * height(). `stops` is the camera grid [x0, x1, z0, z1, step] the
 * refilled instances are gathered over. */
const MAP_OPTS = {
  swiss2: { terrain: ['ground', 'swiss2-cliffs', 'swiss2-wet', 'swiss2-apron'], stops: [-1400, 1400, -3000, 3000, 300] },
  alps: { terrain: ['headwall'], stops: [-1400, 1400, -3000, 3000, 300] },
};

/* Scene objects that are not static world: the craft, the traffic and
 * the herd (moving colliders, other checks), the trees (collider-audit.js
 * and tree-check.js), soft plants, water surfaces (the water pass), sky
 * and the far range. Matched against the object's path of names. */
const SKIP = String.raw`(^|/)(sky|far-range|craft|wreck|debris|smoke|villagers|hiker[0-9]*|paraglider[0-9]*|herd-[A-Za-z]+|cabins|car[0-9]+|postbus|tractor|trailer|reeds|reeds-deep|reed-heads|drifts|flowers-[0-9]+|foam|spray|fall|mist|burst|cascade|lake|lake-bed|stream|pool|swiss2-(lake|lake-bed|stream|pool|fall|cascade|mist|spray|burst)|swiss2-grass|swiss2-meadow|swiss2-impostors|(beech|larch|spruceTall|spruceSquat)-[0-9]+|(spruce|fir|larch|beech|maple)-[a-z]+-(near|mid|bark)|(maple)-(near|mid|bark))$`;

function seeds(map, airframe) {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe),
    airframeAsked: true,
    map,
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

/* ---------- In the page. Each function is sent as its source, so it
 * closes over nothing here; what they share is window.__collideAudit. */

/* The colliders as plain records in a 4 m grid, and the queries the
 * passes share: the gap from a point to the nearest collider, a
 * collider's surface points, and whether anything drawn is near. */
function pageSetup() {
  const KINDS = ['gate', 'obstacle', 'tree', 'canopy', 'rock', 'cliff', 'pole', 'wall', 'boom', 'train', 'banner', 'pylon', 'hoop'];
  const solids = [];
  for (const k of KINDS) {
    for (const s of window.__crashSolids(0, 0, 1e9, k)) {
      s.kind = k;
      const r = s.box ? 0 : s.r;
      s.lo = [0, 1, 2].map((a) => Math.min(s.a[a], s.b[a]) - r);
      s.hi = [0, 1, 2].map((a) => Math.max(s.a[a], s.b[a]) + r);
      solids.push(s);
    }
  }
  const G = 4;
  const grid = new Map();
  const gk = (i, j) => i * 100000 + j;
  solids.forEach((s, n) => {
    for (let i = Math.floor(s.lo[0] / G); i <= Math.floor(s.hi[0] / G); i += 1) {
      for (let j = Math.floor(s.lo[2] / G); j <= Math.floor(s.hi[2] / G); j += 1) {
        const key = gk(i, j);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(n);
      }
    }
  });
  const solidDist = (s, x, y, z) => {
    if (s.box) {
      return Math.hypot(Math.max(s.lo[0] - x, 0, x - s.hi[0]), Math.max(s.lo[1] - y, 0, y - s.hi[1]), Math.max(s.lo[2] - z, 0, z - s.hi[2]));
    }
    const [ax, ay, az] = s.a;
    const dx = s.b[0] - ax, dy = s.b[1] - ay, dz = s.b[2] - az;
    const L = dx * dx + dy * dy + dz * dz;
    let t = L > 0 ? ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.max(0, Math.hypot(x - ax - t * dx, y - ay - t * dy, z - az - t * dz) - s.r);
  };
  const solidGap = (x, y, z, R) => {
    let best = Infinity;
    let who = -1;
    for (let i = Math.floor((x - R) / G); i <= Math.floor((x + R) / G); i += 1) {
      for (let j = Math.floor((z - R) / G); j <= Math.floor((z + R) / G); j += 1) {
        for (const n of grid.get(gk(i, j)) || []) {
          const d = solidDist(solids[n], x, y, z);
          if (d < best) {
            best = d;
            who = n;
          }
        }
      }
    }
    return [best, who];
  };
  /* Points on a collider's surface about 0.5 m apart. */
  const surfacePoints = (s) => {
    const out = [];
    if (s.box) {
      const [x0, y0, z0] = s.lo;
      const [x1, y1, z1] = s.hi;
      const n = (a, b) => Math.max(1, Math.ceil((b - a) / 0.5));
      const nx = n(x0, x1), ny = n(y0, y1), nz = n(z0, z1);
      const X = (i) => x0 + ((x1 - x0) * i) / nx;
      const Z = (k) => z0 + ((z1 - z0) * k) / nz;
      for (let i = 0; i <= nx; i += 1) for (let k = 0; k <= nz; k += 1) out.push([X(i), y1, Z(k)]);
      for (let j = 0; j <= ny; j += 1) {
        const y = y0 + ((y1 - y0) * j) / ny;
        for (let i = 0; i <= nx; i += 1) out.push([X(i), y, z0], [X(i), y, z1]);
        for (let k = 0; k <= nz; k += 1) out.push([x0, y, Z(k)], [x1, y, Z(k)]);
      }
      return out;
    }
    const [ax, ay, az] = s.a;
    const dx = s.b[0] - ax, dy = s.b[1] - ay, dz = s.b[2] - az;
    const L = Math.hypot(dx, dy, dz);
    const u = L > 1e-6 ? [dx / L, dy / L, dz / L] : [0, 1, 0];
    const t0 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let p = [u[1] * t0[2] - u[2] * t0[1], u[2] * t0[0] - u[0] * t0[2], u[0] * t0[1] - u[1] * t0[0]];
    const pl = Math.hypot(...p);
    p = p.map((v) => v / pl);
    const q = [u[1] * p[2] - u[2] * p[1], u[2] * p[0] - u[0] * p[2], u[0] * p[1] - u[1] * p[0]];
    const nL = Math.max(1, Math.ceil(L / 0.5));
    const nA = Math.max(4, Math.min(24, Math.ceil((2 * Math.PI * s.r) / 0.5)));
    for (let i = 0; i <= nL; i += 1) {
      for (let k = 0; k < nA; k += 1) {
        const a = (2 * Math.PI * k) / nA;
        const c = Math.cos(a) * s.r, sn = Math.sin(a) * s.r;
        out.push([ax + (dx * i) / nL + p[0] * c + q[0] * sn, ay + (dy * i) / nL + p[1] * c + q[1] * sn, az + (dz * i) / nL + p[2] * c + q[2] * sn]);
      }
    }
    if (L <= 1e-6) out.push([ax, ay + s.r, az], [ax, ay - s.r, az]);
    return out;
  };
  window.__collideAudit = { solids, solidGap, solidDist, surfacePoints, extra: new Map() };
  return JSON.stringify({ solids: solids.length });
}

/* The instanced meshes the map refills round the camera (the fences, the
 * boulders' near and far levels, the stones): the camera is flown over a
 * grid and every instance any stop drew is kept, by its position. */
async function pageStops(opts) {
  const A = window.__collideAudit;
  const WANT = /(fences|rock[0-9]-(near|far)|stones)$/;
  const acc = new Map();
  window.__mapScene().traverse((o) => {
    if (o.isInstancedMesh && WANT.test(o.name)) acc.set(o, new Map());
  });
  if (!acc.size) return JSON.stringify({ stops: 0, meshes: [] });
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const [x0, x1, z0, z1, step] = opts.stops;
  let stops = 0;
  for (let x = x0; x <= x1; x += step) {
    for (let z = z0; z <= z1; z += step) {
      const g = window.__heightAt(x, z);
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        window.__setCam(x, g + 30, z, x + dx * 100, g - 10, z + dz * 100, 120);
        await frame();
        await frame();
        await frame();
        for (const [o, m] of acc) {
          const a = o.instanceMatrix.array;
          for (let k = 0; k < o.count; k += 1) {
            const key = `${a[k * 16 + 12].toFixed(2)},${a[k * 16 + 13].toFixed(2)},${a[k * 16 + 14].toFixed(2)}`;
            if (!m.has(key)) m.set(key, Array.from(a.subarray(k * 16, k * 16 + 16)));
          }
        }
      }
      stops += 1;
    }
  }
  window.__setCam(null);
  A.extra = new Map([...acc].map(([o, m]) => [o, [...m.values()]]));
  return JSON.stringify({ stops, meshes: [...acc].map(([o, m]) => ({ name: o.name, cap: o.instanceMatrix.count, got: m.size })) });
}

/* DRAWN BUT NOT SOLID. */
function pageDrawn(opts) {
  const A = window.__collideAudit;
  const T = window.__three;
  const sc = window.__mapScene();
  sc.updateMatrixWorld(true);
  const V = 0.5;
  const TOL = 0.5;
  const SKIP = new RegExp(opts.skip);
  const TERRAIN = new Set(opts.terrain);
  const vkey = (ix, iy, iz) => ((ix + 16384) * 32768 + (iz + 16384)) * 8192 + (iy + 2048);
  const drawn = new Map();
  const px = [], py = [], pz = [], pc = [];
  const classes = [];
  const classId = new Map();
  const cls = (label) => {
    if (!classId.has(label)) {
      classId.set(label, classes.length);
      classes.push({ label, samples: 0, open: 0 });
    }
    return classId.get(label);
  };
  const add = (x, y, z, id) => {
    const key = vkey(Math.floor(x / V), Math.floor(y / V), Math.floor(z / V));
    if (drawn.has(key)) return;
    drawn.set(key, px.length);
    px.push(x); py.push(y); pz.push(z); pc.push(id);
  };
  /* The ground's own tiles: big meshes whose vertices lie on height(). */
  const isGround = (o) => {
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    if (Math.max(b.max.x - b.min.x, b.max.z - b.min.z) < 200 || o.isInstancedMesh) return false;
    const pos = g.attributes.position;
    const v = new T.Vector3();
    let on = 0, n = 0;
    for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 300))) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (Math.abs(v.x) > 2990 || Math.abs(v.z) > 2990) continue;
      n += 1;
      if (Math.abs(v.y - window.__surface(v.x, v.z, -1e9)) < 0.1) on += 1;
    }
    return n > 20 && on / n > 0.8;
  };
  const meshes = [];
  A.ground = [];
  const walk = (o, path, force) => {
    if (!o.visible && !force && !A.extra.has(o)) return;
    const p = path ? `${path}/${o.name || o.type}` : (o.name || o.type);
    if (SKIP.test(p)) return;
    if (o.isLOD) {
      if (o.levels[0]) walk(o.levels[0].object, p, true);
      return;
    }
    const geo = o.geometry;
    if (geo && geo.attributes.position && !geo.isInstancedBufferGeometry) {
      if (o.isLine) meshes.push({ o, p: `${p} (cable)` });
      else if (o.isMesh && !o.isPoints) {
        const sky = o.material && (o.material.side === T.BackSide || o.material.isShaderMaterial);
        if (TERRAIN.has(o.name)) A.ground.push(o);
        else if (isGround(o)) A.ground.push(o);
        else if (!sky) meshes.push({ o, p });
      }
    }
    for (const c of o.children) walk(c, p, force);
  };
  for (const c of sc.children) walk(c, '', false);
  const tkey = (e) => `${Math.round(e[12])},${Math.round(e[14])}`;
  const nearAt = new Set();
  for (const [o, l] of A.extra) if (/rock[0-9]-near$/.test(o.name)) for (const e of l) nearAt.add(tkey(e));
  const pA = new T.Vector3(), pB = new T.Vector3(), pC = new T.Vector3();
  const m = new T.Matrix4(), mi = new T.Matrix4();
  let tris = 0;
  for (const { o, p } of meshes) {
    const label = p.replace(/-?[0-9]+,-?[0-9]+/g, '#').replace(/[0-9]+$/g, '');
    const g = o.geometry;
    const pos = g.attributes.position;
    const col = g.attributes.color;
    const idx = g.index;
    let list = null;
    if (o.isInstancedMesh) {
      list = A.extra.get(o);
      if (!list) {
        list = [];
        for (let k = 0; k < o.count; k += 1) list.push(Array.from(o.instanceMatrix.array.subarray(k * 16, k * 16 + 16)));
      }
      /* A far boulder is drawn only where no near one stands. */
      if (/rock[0-9]-far$/.test(o.name)) list = list.filter((e) => !nearAt.has(tkey(e)));
    }
    const insts = list ? list.length : 1;
    for (let k = 0; k < insts; k += 1) {
      if (list) {
        mi.fromArray(list[k]);
        m.multiplyMatrices(o.matrixWorld, mi);
      } else m.copy(o.matrixWorld);
      if (o.isLine) {
        const id = cls(label);
        const n = idx ? idx.count : pos.count;
        const segs = o.isLineSegments ? 2 : 1;
        for (let i = 0; i + 1 < n; i += segs) {
          pA.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
          pB.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m);
          const steps = Math.max(1, Math.ceil(pA.distanceTo(pB) / (V * 0.7)));
          for (let s = 0; s <= steps; s += 1) {
            const t = s / steps;
            add(pA.x + (pB.x - pA.x) * t, pA.y + (pB.y - pA.y) * t, pA.z + (pB.z - pA.z) * t, id);
          }
        }
        continue;
      }
      const nt = (idx ? idx.count : pos.count) / 3;
      for (let t = 0; t < nt; t += 1) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        pA.fromBufferAttribute(pos, i0).applyMatrix4(m);
        pB.fromBufferAttribute(pos, i1).applyMatrix4(m);
        pC.fromBufferAttribute(pos, i2).applyMatrix4(m);
        tris += 1;
        /* A merged mesh's pieces told apart by their vertex colour. */
        const id = cls(col ? `${label} rgb${[col.getX(i0), col.getY(i0), col.getZ(i0)].map((v) => Math.min(9, Math.round(v * 10))).join('')}` : label);
        const e = Math.max(pA.distanceTo(pB), pB.distanceTo(pC), pC.distanceTo(pA));
        const n = Math.min(80, Math.max(1, Math.ceil(e / (V * 0.7))));
        for (let u = 0; u <= n; u += 1) {
          for (let v = 0; u + v <= n; v += 1) {
            const a = u / n, b = v / n, c = 1 - a - b;
            add(pA.x * c + pB.x * a + pC.x * b, pA.y * c + pB.y * a + pC.y * b, pA.z * c + pB.z * a + pC.z * b, id);
          }
        }
      }
    }
  }
  const open = [];
  let solid = 0, ground = 0;
  for (let i = 0; i < px.length; i += 1) {
    const x = px[i], y = py[i], z = pz[i], id = pc[i];
    classes[id].samples += 1;
    const surf = window.__surface(x, z, y + TOL);
    if (y - surf <= TOL) {
      ground += 1;
      continue;
    }
    const [d, who] = A.solidGap(x, y, z, 3);
    if (d <= TOL) {
      solid += 1;
      continue;
    }
    classes[id].open += 1;
    open.push([Math.floor(x / V), Math.floor(y / V), Math.floor(z / V), id, y - surf, d === Infinity ? 99 : d, who >= 0 ? A.solids[who].kind : null]);
  }
  Object.assign(A, { V, vkey, drawn, px, py, pz, pc, classes });
  /* Open samples in 26-connected clusters of one class. */
  const openAt = new Map(open.map((o, i) => [vkey(o[0], o[1], o[2]), i]));
  const seen = new Uint8Array(open.length);
  const clusters = [];
  for (let i = 0; i < open.length; i += 1) {
    if (seen[i]) continue;
    const st = [i];
    seen[i] = 1;
    const c = { id: open[i][3], n: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9], agl: 0, gap: 99, gapMax: 0, near: null };
    while (st.length) {
      const j = st.pop();
      const [x, y, z, , agl, gap, kind] = open[j];
      c.n += 1;
      c.agl = Math.max(c.agl, agl);
      c.gapMax = Math.max(c.gapMax, gap);
      if (gap < c.gap) {
        c.gap = gap;
        c.near = kind;
      }
      c.lo = [Math.min(c.lo[0], x), Math.min(c.lo[1], y), Math.min(c.lo[2], z)];
      c.hi = [Math.max(c.hi[0], x), Math.max(c.hi[1], y), Math.max(c.hi[2], z)];
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const q = openAt.get(vkey(x + dx, y + dy, z + dz));
            if (q != null && !seen[q] && open[q][3] === c.id) {
              seen[q] = 1;
              st.push(q);
            }
          }
        }
      }
    }
    const at = [0, 1, 2].map((a) => +(((c.lo[a] + c.hi[a] + 1) / 2) * V).toFixed(1));
    clusters.push({
      label: classes[c.id].label, n: c.n, at, size: [0, 1, 2].map((a) => (c.hi[a] - c.lo[a] + 1) * V),
      agl: +c.agl.toFixed(1), gap: +c.gap.toFixed(2), gapMax: +c.gapMax.toFixed(2), near: c.near,
      wet: window.__waterSample(at[0], at[2]).body >= 0,
    });
  }
  clusters.sort((a, b) => b.n - a.n);
  return JSON.stringify({
    tris, samples: px.length, solid, ground, open: open.length, ground_meshes: A.ground.map((o) => o.name || '(unnamed tile)'), clusters,
  });
}

/* SOLID BUT NOT DRAWN, and the colliders through landable roofs. */
function pageGhost() {
  const A = window.__collideAudit;
  const { V, vkey, drawn, px, py, pz } = A;
  const drawnNear = (x, y, z) => {
    const ix = Math.floor(x / V), iy = Math.floor(y / V), iz = Math.floor(z / V);
    for (let a = -2; a <= 2; a += 1) {
      for (let b = -2; b <= 2; b += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const i = drawn.get(vkey(ix + a, iy + b, iz + c));
          if (i != null && Math.hypot(px[i] - x, py[i] - y, pz[i] - z) <= 1) return true;
        }
      }
    }
    return false;
  };
  const byKind = {};
  const flagged = [];
  for (const s of A.solids) {
    if (s.kind === 'tree' || s.kind === 'canopy') continue;
    const k = (byKind[s.kind] ??= { solids: 0, flagged: 0 });
    k.solids += 1;
    let exposed = 0, bare = 0;
    for (const [x, y, z] of A.surfacePoints(s)) {
      /* Buried in the ground or a roof, which are drawn. */
      if (y < window.__surface(x, z, y + 0.5) + 0.3) continue;
      exposed += 1;
      if (!drawnNear(x, y, z)) bare += 1;
    }
    if (exposed >= 4 && bare / exposed > 0.5) {
      k.flagged += 1;
      flagged.push({ kind: s.kind, box: s.box, lo: s.lo.map((v) => +v.toFixed(1)), hi: s.hi.map((v) => +v.toFixed(1)), r: s.box ? null : +s.r.toFixed(2), bare: +(bare / exposed).toFixed(2), exposed });
    }
  }
  const roofs = window.__roofs();
  const roofBare = [];
  const pokers = [];
  roofs.forEach((r, i) => {
    let n = 0, bare = 0;
    const own = new Set([...r.solids, ...r.eaves]);
    const ownBoxes = new Set(window.__colliderBoxes((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 60)
      .filter((b) => own.has(b[6])).map((b) => b.slice(0, 6).map((v) => v.toFixed(3)).join(',')));
    const met = new Map();
    for (let x = r.minX + 0.25; x < r.maxX; x += 0.5) {
      for (let z = r.minZ + 0.25; z < r.maxZ; z += 0.5) {
        const y = window.__roofTop(i, x, z);
        if (!Number.isFinite(y)) continue;
        n += 1;
        if (!drawnNear(x, y, z)) bare += 1;
        /* Only where this roof is what a craft lands on. */
        if (Math.abs(window.__surface(x, z, y + 0.3) - y) > 0.02) continue;
        const [d, who] = A.solidGap(x, y + 0.3, z, 0.3);
        if (d > 0.3 || who < 0) continue;
        const s = A.solids[who];
        if (s.kind === 'tree' || s.kind === 'canopy') continue;
        const key = [s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2]].map((v) => v.toFixed(3)).join(',');
        if (s.box && ownBoxes.has(key)) continue;
        if (!met.has(who)) met.set(who, { x, y, z });
      }
    }
    if (n >= 4 && bare / n > 0.25) roofBare.push({ roof: i, kind: r.kind, x: +r.x.toFixed(1), z: +r.z.toFixed(1), bare: +(bare / n).toFixed(2) });
    for (const [who, m] of met) {
      const s = A.solids[who];
      const up = A.surfacePoints(s).filter((p) => p[1] > m.y + 0.1);
      const undrawn = up.length ? up.filter((p) => !drawnNear(p[0], p[1], p[2])).length / up.length : 0;
      pokers.push({ roof: i, kind: r.kind, at: [m.x, m.y, m.z].map((v) => +v.toFixed(1)), solid: s.kind, pokes: +(s.hi[1] - m.y).toFixed(2), undrawn: +undrawn.toFixed(2) });
    }
  });
  return JSON.stringify({ byKind, flagged, roofs: roofs.length, roofBare, pokers: pokers.length, pokersUndrawn: pokers.filter((p) => p.undrawn > 0.5) });
}

/* THE GROUND, along its normal. */
function pageTerrain() {
  const A = window.__collideAudit;
  const T = window.__three;
  const res = {};
  const worst = [];
  const pA = new T.Vector3(), pB = new T.Vector3(), pC = new T.Vector3();
  const H = (x, z) => window.__surface(x, z, -1e9);
  for (const o of A.ground) {
    const name = o.name || 'ground tile';
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const nt = (idx ? idx.count : pos.count) / 3;
    const r = (res[name] ??= { n: 0, proud03: 0, proud1: 0, sunk03: 0, sunk1: 0, sunk3: 0, seam: 0, maxProud: 0, maxSunk: 0 });
    const step = Math.max(1, Math.floor(nt / 400000));
    for (let t = 0; t < nt; t += step) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      pA.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      pB.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      pC.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      for (const [a, b, c] of [[1, 0, 0], [0.5, 0.5, 0], [1 / 3, 1 / 3, 1 / 3]]) {
        const x = pA.x * a + pB.x * b + pC.x * c, y = pA.y * a + pB.y * b + pC.y * c, z = pA.z * a + pB.z * b + pC.z * c;
        /* The map's rim, where the ground meets the far range. */
        if (Math.abs(x) > 2950 || Math.abs(z) > 2950) continue;
        const h = H(x, z);
        /* A lake's or a stream's bed is under the water a craft meets. */
        if (y < h - 0.3 && window.__waterSample(x, z).body >= 0) continue;
        const gx = H(x + 0.5, z) - H(x - 0.5, z), gz = H(x, z + 0.5) - H(x, z - 0.5);
        const d = (y - h) / Math.sqrt(1 + gx * gx + gz * gz);
        /* The carved rock's 120 m tiles hang a skirt at their edges, below
         * the ground: not a face anyone flies at. */
        if (d < -1 && name === 'swiss2-cliffs' && (Math.abs(((x % 120) + 120) % 120 - 60) > 58.5 || Math.abs(((z % 120) + 120) % 120 - 60) > 58.5)) {
          r.seam += 1;
          continue;
        }
        r.n += 1;
        if (d > 0.3) r.proud03 += 1;
        if (d > 1) r.proud1 += 1;
        if (d < -0.3) r.sunk03 += 1;
        if (d < -1) r.sunk1 += 1;
        if (d < -3) r.sunk3 += 1;
        r.maxProud = Math.max(r.maxProud, +d.toFixed(2));
        r.maxSunk = Math.min(r.maxSunk, +d.toFixed(2));
        if (Math.abs(d) > 1) worst.push([name, +x.toFixed(1), +y.toFixed(1), +z.toFixed(1), +d.toFixed(2)]);
      }
    }
  }
  worst.sort((a, b) => Math.abs(b[4]) - Math.abs(a[4]));
  const ex = {};
  for (const w of worst) {
    const l = (ex[w[0]] ??= []);
    if (l.length < 6 && l.every((p) => Math.hypot(p[1] - w[1], p[3] - w[3]) > 60)) l.push(w);
  }
  return JSON.stringify({ res, ex });
}

/* THE WATER: drawn surfaces against the plant's, both ways. */
function pageWater() {
  const T = window.__three;
  const sc = window.__mapScene();
  const WATER = /(^|-)(lake|stream|pool|river)$/;
  const cell = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const drawn = new Map();
  const bounds = [];
  const names = [];
  const pA = new T.Vector3(), pB = new T.Vector3(), pC = new T.Vector3();
  sc.traverse((o) => {
    if (!o.isMesh || !WATER.test(o.name)) return;
    names.push(o.name);
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const nt = (idx ? idx.count : pos.count) / 3;
    if (!g.boundingBox) g.computeBoundingBox();
    bounds.push(g.boundingBox.clone().applyMatrix4(o.matrixWorld));
    for (let t = 0; t < nt; t += 1) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      pA.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      pB.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      pC.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      const e = Math.max(pA.distanceTo(pB), pB.distanceTo(pC), pC.distanceTo(pA));
      const n = Math.min(200, Math.max(1, Math.ceil(e / 0.8)));
      for (let u = 0; u <= n; u += 1) {
        for (let v = 0; u + v <= n; v += 1) {
          const a = u / n, b = v / n, c = 1 - a - b;
          const x = pA.x * c + pB.x * a + pC.x * b, y = pA.y * c + pB.y * a + pC.y * b, z = pA.z * c + pB.z * a + pC.z * b;
          const k = cell(x, z);
          const prev = drawn.get(k);
          if (!prev || y > prev[1]) drawn.set(k, [x, y, z, o.name]);
        }
      }
    }
  });
  const stat = { drawn: 0, ok: 0, dry: 0, level03: 0, phantom: 0 };
  const dry = [], level = [], phantom = [];
  for (const [x, y, z, name] of drawn.values()) {
    /* Water drawn under the ground is hidden by it. */
    if (y < window.__heightAt(x, z) - 0.05) continue;
    stat.drawn += 1;
    const w = window.__waterSample(x, z);
    if (w.body < 0) {
      stat.dry += 1;
      dry.push([name, +x.toFixed(1), +y.toFixed(2), +z.toFixed(1)]);
      continue;
    }
    if (Math.abs(w.plant - y) > 0.3) {
      stat.level03 += 1;
      level.push([name, +x.toFixed(1), +y.toFixed(2), +z.toFixed(1), +(w.plant - y).toFixed(2)]);
    } else stat.ok += 1;
  }
  /* The plant's water over dry drawn ground, where nothing wet is drawn. */
  for (const b of bounds) {
    for (let x = Math.floor(b.min.x) - 10; x <= b.max.x + 10; x += 2) {
      for (let z = Math.floor(b.min.z) - 10; z <= b.max.z + 10; z += 2) {
        let wet = false;
        for (let i = -1; i <= 1 && !wet; i += 1) for (let j = -1; j <= 1 && !wet; j += 1) wet = drawn.has(cell(x + i, z + j));
        if (wet) continue;
        const w = window.__waterSample(x, z);
        if (w.body < 0 || window.__heightAt(x, z) > w.plant + 0.05) continue;
        stat.phantom += 1;
        phantom.push([x, z, +w.plant.toFixed(2), w.body]);
      }
    }
  }
  /* How far the dry drawn water is from the plant's, m. */
  const reach = {};
  for (const [, x, , z] of dry.filter((p, i) => i % 5 === 0)) {
    let r = '>8';
    for (const s of [1, 2, 4, 8]) {
      let found = false;
      for (let a = 0; a < 16 && !found; a += 1) found = window.__waterSample(x + s * Math.cos((a * Math.PI) / 8), z + s * Math.sin((a * Math.PI) / 8)).body >= 0;
      if (found) {
        r = `<=${s}`;
        break;
      }
    }
    reach[r] = (reach[r] || 0) + 1;
  }
  const spread = (l, n) => {
    const out = [];
    for (const p of l) {
      if (out.every((q) => Math.hypot(q[1] - p[1], q[3] - p[3]) > 40)) out.push(p);
      if (out.length >= n) break;
    }
    return out;
  };
  return JSON.stringify({ names, stat, reach, dryEx: spread(dry, 6), levelEx: spread(level, 6), phantomEx: phantom.slice(0, 6) });
}

/* FLY: throws through a sample of each collider class. */
async function pageFlyPlan(opts) {
  const A = window.__collideAudit;
  const SPEED = opts.speed;
  const RUN = 18;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const ext = (s) => [0, 1, 2].map((a) => s.hi[a] - s.lo[a]);
  const classOf = (s) => {
    const [ex, , ez] = ext(s);
    if (s.kind === 'pole') {
      const vertical = Math.abs(s.b[1] - s.a[1]) > Math.hypot(s.b[0] - s.a[0], s.b[2] - s.a[2]);
      if (!vertical) return 'rail';
      return s.r < 0.1 ? 'thin post' : 'pole';
    }
    if (s.kind === 'wall') return Math.min(ex, ez) < 0.35 ? 'thin wall' : 'wall';
    if (s.kind === 'tree') return s.box ? null : 'trunk';
    return s.kind === 'canopy' ? null : s.kind;
  };
  const ground = (x, z) => window.__surface(x, z, 1e9);
  /* A clear level line through the middle, from a side it is thin on. */
  const plan = (s) => {
    const [ex, , ez] = ext(s);
    const cx = (s.lo[0] + s.hi[0]) / 2, cz = (s.lo[2] + s.hi[2]) / 2;
    const y = Math.max((s.lo[1] + s.hi[1]) / 2, ground(cx, cz) + 0.9);
    if (y > s.hi[1] - 0.05) return null;
    let ux = 1, uz = 0;
    if (s.box) {
      if (ex > ez) {
        ux = 0;
        uz = 1;
      }
    } else {
      const hx = s.b[0] - s.a[0], hz = s.b[2] - s.a[2], h = Math.hypot(hx, hz);
      if (h > 0.5) {
        ux = -hz / h;
        uz = hx / h;
      }
    }
    for (let t = -RUN; t <= 6; t += 0.5) {
      const x = cx + ux * t, z = cz + uz * t;
      if (ground(x, z) > y - 0.6) return null;
      if (Math.abs(t) < 2) continue;
      const [d, who] = A.solidGap(x, y, z, 1.5);
      if (d < 1.5 && A.solids[who] !== s) return null;
    }
    return { cx, cz, y, ux, uz };
  };
  const byClass = {};
  const tries = {};
  const selectT0 = performance.now();
  const n = A.solids.length;
  /* A spread over the whole set, the same every run. */
  for (let j = 0; j < n; j += 1) {
    const s = A.solids[(j * 7919) % n];
    const k = classOf(s);
    if (!k) continue;
    const l = (byClass[k] ??= []);
    /* A forest's trunks are mostly in each other's way: stop looking for
     * a clear line after this many tries a class. */
    tries[k] = (tries[k] || 0) + 1;
    if (l.length >= opts.per || tries[k] > (k === 'trunk' ? 400 : 4000)) continue;
    const p = plan(s);
    if (p) l.push({ s, p });
  }
  const selectMs = Math.round(performance.now() - selectT0);
  A.fly = [];
  for (const [k, list] of Object.entries(byClass)) for (const { s, p } of list) A.fly.push({ k, s, p });
  /* The first throw collects the crash world's trees. */
  window.__crashThrow({ fresh: true, x: 0, y: 300, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
  for (let i = 0; i < 30; i += 1) await frame();
  return JSON.stringify({ speed: SPEED, selectMs, throws: A.fly.length, list: A.fly.map((f) => ({ k: f.k, at: [f.p.cx, f.p.y, f.p.cz].map((v) => +v.toFixed(1)) })) });
}

/* One of pageFlyPlan's throws, by its index: one call a throw, so a throw
 * that freezes the page is named rather than hanging the whole run. */
async function pageFlyOne(opts) {
  const A = window.__collideAudit;
  const SPEED = opts.speed;
  const RUN = 18;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const { k, s, p } = A.fly[opts.i];
  const yaw = (Math.atan2(-p.ux, -p.uz) * 180) / Math.PI;
  window.__stick(0, 0, 0, 0);
  const r = window.__crashThrow({ fresh: true, x: p.cx - p.ux * RUN, y: p.y, z: p.cz - p.uz * RUN, yaw, pitch: 0, vx: p.ux * SPEED, vy: 0, vz: p.uz * SPEED });
  if (!r || r.ok === false) return JSON.stringify({ k, error: JSON.stringify(r) });
  const t0 = window.__crash().simT;
  let crossed = false;
  let minV = SPEED;
  /* How close the craft's centre came to the solid, along the path
   * between frames: a plane thrown level climbs on its lift, and one
   * that went over the top missed rather than tunnelled. */
  let closest = Infinity;
  let prev = null;
  const wall = performance.now();
  for (let f = 0; f < 900 && performance.now() - wall < 8000; f += 1) {
    await frame();
    const st = window.__craftState();
    const at = [st.worldX, st.worldY, st.worldZ];
    for (let q = prev ? 0 : 20; q <= 20; q += 1) {
      const w = prev ? prev.map((v, a) => v + ((at[a] - v) * q) / 20) : at;
      closest = Math.min(closest, A.solidDist(s, w[0], w[1], w[2]));
    }
    prev = at;
    const along = (st.worldX - p.cx) * p.ux + (st.worldZ - p.cz) * p.uz;
    minV = Math.min(minV, st.speed);
    if (along > 3 && st.speed > SPEED * 0.7) {
      crossed = true;
      break;
    }
    if (window.__crash().simT - t0 > (RUN + 8) / SPEED + 0.5) break;
  }
  window.__stick();
  const log = [...new Set(window.__crashLog().map((e) => e.type))];
  const met = log.length > 0;
  return JSON.stringify({
    k, at: [p.cx, p.y, p.cz].map((v) => +v.toFixed(1)), r: s.box ? null : +s.r.toFixed(2), crossed, closest: +closest.toFixed(2),
    nan: !Number.isFinite(closest) || !Number.isFinite(minV),
    contact: met || minV < SPEED * 0.7, tunnel: crossed && !met && closest === 0, missed: crossed && !met && closest > 0, minV: +minV.toFixed(1), log,
  });
}

/* ROOFS: the five inch let down onto every roof. */
async function pageRoofDrop() {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const roofs = window.__roofs();
  const rows = [];
  window.__crashThrow({ fresh: true, x: 0, y: 300, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
  for (let i = 0; i < 30; i += 1) await frame();
  for (let i = 0; i < roofs.length; i += 1) {
    const r = roofs[i];
    /* The flattest point of this roof where it is the top, a metre in from its edges. */
    let best = null;
    for (let x = r.minX + 1; x <= r.maxX - 1; x += 0.5) {
      for (let z = r.minZ + 1; z <= r.maxZ - 1; z += 0.5) {
        const y = window.__roofTop(i, x, z);
        if (!Number.isFinite(y) || Math.abs(window.__surface(x, z, y + 0.3) - y) > 0.02) continue;
        const gx = (window.__roofTop(i, x + 0.3, z) - window.__roofTop(i, x - 0.3, z)) / 0.6;
        const gz = (window.__roofTop(i, x, z + 0.3) - window.__roofTop(i, x, z - 0.3)) / 0.6;
        if (!Number.isFinite(gx) || !Number.isFinite(gz)) continue;
        const slope = Math.atan(Math.hypot(gx, gz)) * 57.2958;
        if (!best || slope < best.slope) best = { x, z, y, slope };
      }
    }
    if (!best) {
      rows.push({ roof: i, kind: r.kind, skipped: 'no landable point a metre in' });
      continue;
    }
    window.__stick(0, 0, 0, 0);
    window.__crashThrow({ fresh: true, x: best.x, y: best.y + 0.6, z: best.z, yaw: 0, pitch: 0, vx: 0, vy: -0.8, vz: 0 });
    const t0 = window.__crash().simT;
    /* Through: under this roof's own top while still over it, which is
     * inside the building. Sliding off the eave is not through. */
    let through = false;
    let st = null;
    /* A quad that has come to rest stops the sim clock, so the drop ends
     * when the clock has not moved for a second of wall time. */
    let lastT = t0;
    let still = performance.now();
    while (window.__crash().simT - t0 < 2.5 && performance.now() - still < 1000) {
      await frame();
      if (window.__crash().simT !== lastT) {
        lastT = window.__crash().simT;
        still = performance.now();
      }
      st = window.__craftState();
      const top = window.__roofTop(i, st.worldX, st.worldZ);
      if (Number.isFinite(top) && st.worldY < top - 0.3) through = true;
    }
    const log = [...new Set(window.__crashLog().map((e) => e.type))];
    const broke = log.some((t) => t === 'break' || t === 'crush');
    const parts = [...new Set(window.__crashLog().filter((e) => e.type === 'break' || e.type === 'crush').map((e) => `${e.part}:${e.surface ?? ''}`))];
    rows.push({ roof: i, kind: r.kind, key: r.key, at: [best.x, best.y, best.z].map((v) => +v.toFixed(1)), slope: +best.slope.toFixed(1), endY: st ? +st.worldY.toFixed(2) : null, through, broke, parts, log });
  }
  window.__stick();
  return JSON.stringify({ rows });
}

/* ---------- In node. */

/* What a cluster of drawn-but-not-solid samples is, from its mesh and
 * its shape. The order matters: the first rule that holds names it. */
const CLASSES = [
  ['cable (gondola rope, wires)', (c) => /\(cable\)/.test(c.label)],
  ['boulders (sphere collider smaller than the rock)', (c) => /rock[0-9]-(near|far)|stones|rocks-[0-9]/.test(c.label)],
  ['moored boats and the sailing boat', (c) => /lakeside|sailing-boat/.test(c.label) && c.wet],
  ['reeds, hedges and green plants (soft)', (c) => / rgb010$/.test(c.label) || /geranium/.test(c.label)],
  ['jetty, piers and decks over water', (c) => c.wet && c.agl <= 4 && c.gap >= 1.5],
  ['props floating over the ground (gravel bars on the headwall ledge)', (c) => /swiss2-props/.test(c.label) && c.agl > 3 && c.gap >= 3],
  ['tops of towers and pylons past their pole collider', (c) => c.agl > 8 && c.near === 'pole' && c.gap < 3],
  /* Nothing of it over 1.6 m off the ground and 2 m or more long: a
   * fence line, however far it runs. */
  ['fences, fence posts and rails', (c) => (c.agl <= 2.2 && /fence|village-post/.test(c.label)) || (c.agl <= 1.6 && Math.max(c.size[0], c.size[2]) >= 2)],
  ['small props (under 1.2 m across)', (c) => c.agl <= 2.5 && Math.max(c.size[0], c.size[2]) <= 1.2],
  ['building parts more than 1.5 m past any collider', (c) => c.gap < 3 && c.gapMax > 1.5],
  ['building detail 0.5 to 1.5 m past its walls (eaves, sills, balconies)', (c) => c.gap < 3],
  ['structures with no collider', () => true],
];

function classify(c) {
  return CLASSES.find(([, f]) => f(c))[0];
}

/* How often a pilot meets it: square metres of it, weighted by where a
 * pilot flies. Low (under 15 m over the ground) counts in full, higher
 * a third; within 1.5 km of the spawn in full, further a half. A proxy,
 * stated so it can be argued with. */
function exposure(c, spawn) {
  const area = c.n * 0.25;
  const low = c.agl <= 15 ? 1 : 0.33;
  const near = Math.hypot(c.at[0] - spawn.x, c.at[2] - spawn.z) <= 1500 ? 1 : 0.5;
  return area * low * near;
}

async function openMap(map, airframe) {
  const page = await openPage({ root, width: 960, height: 540, url: `/index.html?map=${map}`, seed: seeds(map, airframe) });
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  await page.sleep(1500);
  const id = await page.evaluate('window.__map().id');
  if (id !== map) {
    await page.close();
    throw new Error(`the page seated map ${id}, not ${map}`);
  }
  return page;
}

const call = async (page, fn, opts) => {
  const t0 = Date.now();
  const out = JSON.parse(await page.evaluate(`(${fn.toString()})(${JSON.stringify(opts ?? {})})`));
  console.error(`  ${fn.name} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return out;
};

/* Every planned throw, one call each under a wall clock limit. A throw
 * that does not come back froze the page (the plant stuck in one step or
 * the frame loop stopped): it is reported and the rest of this page's
 * throws are not flown, since the page is gone. */
const THROW_MS = 60000;
async function flyAll(page, speed) {
  const plan = await call(page, pageFlyPlan, { speed, per: 4 });
  const rows = [];
  for (let i = 0; i < plan.throws; i += 1) {
    let timer;
    const limit = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), THROW_MS);
    });
    const row = await Promise.race([
      page.evaluate(`(${pageFlyOne.toString()})(${JSON.stringify({ speed, i })})`).then(JSON.parse),
      limit,
    ]);
    clearTimeout(timer);
    if (!row) {
      /* Whether the page's script still answers: a busy main thread (the
       * plant or the shell stuck in a loop) does not. */
      const alive = await Promise.race([page.evaluate('JSON.stringify(window.__crash().simT)').then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))]);
      rows.push({ ...plan.list[i], frozen: true, scriptAnswers: alive });
      console.error(`  throw ${i} at ${speed} m/s froze the page`);
      break;
    }
    rows.push(row);
  }
  return { speed, selectMs: plan.selectMs, rows };
}

async function auditMap(map) {
  const opts = MAP_OPTS[map] ?? { terrain: [], stops: [-1400, 1400, -3000, 3000, 300] };
  const out = { map, metrics: {}, report: {} };
  const errors = [];
  if (ONLY.includes('static') || ONLY.includes('fly')) {
    const page = await openMap(map, 'f16878');
    try {
      const spawn = (await page.evaluate('JSON.stringify(window.__map().spawn)').then(JSON.parse));
      await call(page, pageSetup);
      if (ONLY.includes('static')) {
        const stops = await call(page, pageStops, opts);
        const drawn = await call(page, pageDrawn, { skip: SKIP, terrain: opts.terrain });
        const ghost = await call(page, pageGhost);
        const terrain = await call(page, pageTerrain);
        const water = await call(page, pageWater);
        const cls = {};
        for (const c of drawn.clusters) {
          if (Math.max(...c.size) < 0.5 || c.n < 2) continue;
          const k = classify(c);
          const e = (cls[k] ??= { clusters: 0, samples: 0, exposure: 0, noColliderWithin3m: 0, worstGap: 0, ex: [] });
          e.clusters += 1;
          e.samples += c.n;
          e.exposure += exposure(c, spawn);
          e.worstGap = Math.max(e.worstGap, Math.min(c.gapMax, 3));
          if (c.gap >= 3) e.noColliderWithin3m += 1;
          if (e.ex.length < 5) e.ex.push({ at: c.at, size: c.size, over: c.agl, gap: c.gap >= 3 ? 'none within 3 m' : `${c.gap} to ${Math.min(c.gapMax, 3)}`, mesh: c.label });
        }
        out.report.stops = stops;
        out.report.drawn = { samples: drawn.samples, solid: drawn.solid, ground: drawn.ground, open: drawn.open, groundMeshes: [...new Set(drawn.ground_meshes)], classes: cls };
        out.report.ghost = ghost;
        out.report.terrain = terrain;
        out.report.water = water;
        for (const [k, e] of Object.entries(cls)) out.metrics[`drawn not solid: ${k} (samples)`] = e.samples;
        for (const [k, e] of Object.entries(ghost.byKind)) out.metrics[`invisible ${k} colliders`] = e.flagged;
        out.metrics['roof tops off their drawing'] = ghost.roofBare.length;
        out.metrics['undrawn colliders through landable roofs'] = ghost.pokersUndrawn.length;
        for (const [k, r] of Object.entries(terrain.res)) {
          out.metrics[`terrain ${k}: drawn > 1 m in front of the ground (flown through)`] = r.proud1;
          out.metrics[`terrain ${k}: drawn > 1 m behind the ground (invisible ground)`] = r.sunk1;
        }
        out.metrics['water drawn with no plant water (m2)'] = water.stat.dry;
        out.metrics['water drawn off the plant level by > 0.3 m (m2)'] = water.stat.level03;
        out.metrics['plant water where none is drawn (cells)'] = water.stat.phantom;
      }
      if (ONLY.includes('fly')) {
        const f16 = await flyAll(page, 60);
        out.report.flyF16 = f16;
        out.metrics['F-16 60 m/s tunnels'] = f16.rows.filter((r) => r.tunnel).length;
        out.metrics['F-16 60 m/s throws that froze the page'] = f16.rows.filter((r) => r.frozen).length;
        out.metrics['F-16 60 m/s throws whose state went NaN'] = f16.rows.filter((r) => r.nan).length;
      }
      errors.push(...page.errors);
    } finally {
      await page.close();
    }
  }
  if (ONLY.includes('fly') || ONLY.includes('roofs')) {
    const page = await openMap(map, '5inch');
    try {
      await call(page, pageSetup);
      /* The roofs before the throws: a throw that freezes the page ends it. */
      if (ONLY.includes('roofs')) {
        const drop = await call(page, pageRoofDrop);
        out.report.roofDrop = drop;
        out.metrics['roofs a quad let down falls through'] = drop.rows.filter((r) => r.through).length;
        out.metrics['roofs under 15 deg a quad let down breaks on'] = drop.rows.filter((r) => r.broke && r.slope < 15).length;
      }
      if (ONLY.includes('fly')) {
        const quad = await flyAll(page, 40);
        out.report.flyQuad = quad;
        out.metrics['5 inch 40 m/s tunnels'] = quad.rows.filter((r) => r.tunnel).length;
        out.metrics['5 inch 40 m/s throws that froze the page'] = quad.rows.filter((r) => r.frozen).length;
        out.metrics['5 inch 40 m/s throws whose state went NaN'] = quad.rows.filter((r) => r.nan).length;
      }
      errors.push(...page.errors);
    } finally {
      await page.close();
    }
  }
  out.errors = errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  /* Counted against the baseline like the rest: today a plane that goes
   * NaN in a tree logs a NaN bounding sphere every frame after, so the
   * distinct messages, not the frames that repeat them. */
  out.metrics['distinct page errors'] = new Set(out.errors).size;
  return out;
}

function printMap(r) {
  console.log(`\n=== ${r.map}`);
  const d = r.report.drawn;
  if (d) {
    console.log(`drawn samples ${d.samples}: on the ground or a roof ${d.ground}, at a collider ${d.solid}, open ${d.open}; ground meshes ${d.groundMeshes.join(', ')}`);
    console.log('drawn but not solid, by how often a pilot meets it (exposure, m2 weighted):');
    for (const [k, e] of Object.entries(d.classes).sort((a, b) => b[1].exposure - a[1].exposure)) {
      console.log(`  ${k}: ${e.clusters} clusters, ${(e.samples * 0.25).toFixed(0)} m2, exposure ${e.exposure.toFixed(0)}, ${e.noColliderWithin3m} with nothing solid within 3 m, worst gap ${e.worstGap.toFixed(1)} m`);
      for (const x of e.ex) console.log(`      at ${x.at.join(', ')} size ${x.size.join(' x ')} m, ${x.over} m up, gap ${x.gap}, ${x.mesh}`);
    }
  }
  const g = r.report.ghost;
  if (g) {
    console.log(`solid but not drawn: ${Object.entries(g.byKind).map(([k, e]) => `${k} ${e.flagged}/${e.solids}`).join(', ')}; roof tops off their drawing ${g.roofBare.length} of ${g.roofs}; colliders through landable roofs ${g.pokers} (undrawn ${g.pokersUndrawn.length})`);
    for (const f of g.flagged.sort((a, b) => b.exposed - a.exposed).slice(0, 6)) console.log(`      ${f.kind} ${f.lo.join(',')} -> ${f.hi.join(',')} ${Math.round(f.bare * 100)}% bare`);
  }
  const t = r.report.terrain;
  if (t) {
    for (const [k, v] of Object.entries(t.res)) {
      console.log(`terrain ${k}: ${v.n} samples, in front > 0.3 m ${v.proud03} (> 1 m ${v.proud1}, max ${v.maxProud}), behind > 0.3 m ${v.sunk03} (> 1 m ${v.sunk1}, > 3 m ${v.sunk3}, max ${v.maxSunk}), tile skirts left out ${v.seam}`);
      for (const w of (t.ex[k] || []).slice(0, 3)) console.log(`      at ${w[1]}, ${w[2]}, ${w[3]}: ${w[4]} m`);
    }
  }
  const w = r.report.water;
  if (w) console.log(`water ${w.names.join(', ')}: ${JSON.stringify(w.stat)}, dry drawn water to the plant's: ${JSON.stringify(w.reach)}, e.g. ${JSON.stringify(w.dryEx.slice(0, 3))}`);
  for (const [name, f] of [['F-16', r.report.flyF16], ['5 inch', r.report.flyQuad]]) {
    if (!f) continue;
    const by = {};
    for (const row of f.rows) {
      const b = (by[row.k] ??= { n: 0, contact: 0, tunnel: 0 });
      b.n += 1;
      b.contact += row.contact ? 1 : 0;
      b.tunnel += row.tunnel ? 1 : 0;
    }
    console.log(`${name} at ${f.speed} m/s: ${Object.entries(by).map(([k, b]) => `${k} ${b.contact}/${b.n} met${b.tunnel ? `, ${b.tunnel} TUNNELLED` : ''}`).join('; ')}`);
    for (const row of f.rows.filter((x) => x.tunnel || x.error || x.frozen || x.nan)) console.log(`      ${row.k} at ${row.at}: ${row.frozen ? `FROZE THE PAGE (script answers: ${row.scriptAnswers})` : row.nan ? 'the craft state went NaN' : row.error ?? `crossed at ${row.minV} m/s, nothing met`}`);
  }
  const rd = r.report.roofDrop;
  if (rd) {
    const bad = rd.rows.filter((x) => x.through || (x.broke && x.slope < 15));
    console.log(`roofs: a quad let down on ${rd.rows.filter((x) => !x.skipped).length} of ${rd.rows.length}, through ${rd.rows.filter((x) => x.through).length}, broke on a roof under 15 deg ${rd.rows.filter((x) => x.broke && x.slope < 15).length}`);
    for (const x of bad.slice(0, 8)) console.log(`      roof ${x.roof} ${x.kind ?? 'house'} at ${x.at} (${x.slope} deg): ${x.through ? `through to ${x.endY}` : `broke ${x.parts.join(', ')}`}`);
  }
  if (r.errors.length) console.log(`page errors: ${r.errors.slice(0, 5).join(' | ')}`);
}

const results = [];
for (const map of MAPS) {
  const r = await auditMap(map);
  printMap(r);
  results.push(r);
}
if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify(results, null, 1));

const baseline = existsSync(BASELINE) ? JSON.parse(await readFile(BASELINE, 'utf8')) : {};
if (WRITE) {
  for (const r of results) baseline[r.map] = { ...(baseline[r.map] ?? {}), ...r.metrics };
  await writeFile(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`\nwrote ${BASELINE}`);
}
let fail = false;
console.log('\nagainst the baseline:');
for (const r of results) {
  const base = baseline[r.map] ?? {};
  for (const [k, v] of Object.entries(r.metrics)) {
    if (!(k in base)) {
      console.log(`  NEW ${r.map} ${k}: ${v} (not in the baseline)`);
      if (v > 0) fail = true;
      continue;
    }
    if (v > base[k] + SLACK(base[k])) {
      console.log(`  WORSE ${r.map} ${k}: ${v}, baseline ${base[k]}`);
      fail = true;
    } else if (v < base[k]) {
      console.log(`  better ${r.map} ${k}: ${v}, baseline ${base[k]} (rewrite the baseline with the fix)`);
    }
  }
}
console.log(fail ? 'FAIL' : 'PASS');
process.exit(fail ? 1 : 0);
