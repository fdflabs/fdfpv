/*
 * dam-check.js: package D's promises for the Itaipu dam, measured
 * (docs/ITAIPU-PLAN.md section 14, row D).
 *
 * In headless Chromium, the Itaipu map built by the shell with a Timber
 * seated and the run's crash damage on:
 *
 *   count      the dam's solids, at most 15 000 (section 6's budget);
 *   figures    every row of section 6's table dam.json carries a figure
 *              for, against the geometry as built, within 1 %; a part's
 *              height is its concrete's, from its published foundation,
 *              and the basalt drawn under it down to A's flattened
 *              footprint is printed beside;
 *   faces      400 points on every drawn face the part names: a wall's
 *              within 0.5 m of one of the dam's solids, a top's within
 *              0.5 m of the ground height() gives there;
 *   land       a Timber set down on the main crest road, the rockfill
 *              dam's crest road and the powerhouse roof comes to rest
 *              on it with no damage;
 *   face       a Timber flown level into the upstream face at 20 m/s is
 *              a wreck;
 *   gap        a Timber flown out between two penstocks meets nothing,
 *              and one let down onto a penstock meets it;
 *   chute      a Timber put down on the spillway chute skids down it on
 *              its floor record and never through it;
 *   targets    the war mode's targets (docs/WARFARE-PLAN.md section 8):
 *              intake-0..19, gate-0..13, penstock-0..19 and yard-right
 *              all present, each at a point of the drawn dam within
 *              TARGET_ON of it (the yard on the ground), its colliders
 *              the dam's own and within its radius, and every state
 *              drawn, the charred colour put on and taken off, with no
 *              page error.
 *
 *   [SIM_GPU=1] [FDFPV_ITAIPU_DATA=DIR] node scripts/dam-check.js [--only=count,figures,...]
 *
 * Exit 0 when every check passes and the page logged no error.
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

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',') : ['count', 'figures', 'faces', 'targets', 'land', 'face', 'gap', 'chute'];

/* Section 6 and section 14, row D. */
const SOLIDS_MAX = 15000;
const FIGURE_TOL = 0.01;
const FACE_POINTS = 400;
const FACE_TOL = 0.5;
const TARGET_ON = 0.1;
const TARGET_IDS = [
  ...Array.from({ length: 20 }, (_, k) => `intake-${k}`),
  ...Array.from({ length: 14 }, (_, k) => `gate-${k}`),
  ...Array.from({ length: 20 }, (_, k) => `penstock-${k}`),
  'yard-right',
];
const AIRFRAME = 'timber1500';
/* A little over the Timber's 7.2 m/s clean stall (configs/airframes.js). */
const LAND_SPEED = 8.5;

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

function seed() {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, AIRFRAME),
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

/* ------------------------------------------------------------ figures */

/* What the built geometry says for each published figure: [row, what,
 * published, built, kind], every one within 1 %. */
function figureRows(dam, f) {
  const by = Object.fromEntries(dam.map((e) => [e.part, e]));
  const g = (p) => by[p].figures;
  return [
    ['main dam', 'crest length', g('main dam and connecting blocks').crestLength, f.mainCrestLength, 'length'],
    ['main dam', 'max height', g('main dam and connecting blocks').maxHeight, f.mainMaxHeight, 'height'],
    ['main dam', 'blocks', g('main dam and connecting blocks').blocks, f.mainBlocks, 'count'],
    ['diversion', 'crest length', g('diversion structure').crestLength, f.diversionLength, 'length'],
    ['diversion', 'max height', g('diversion structure').maxHeight, f.diversionMaxHeight, 'height'],
    ['right lateral', 'crest length', g('right lateral dam').crestLength, f.rightLateralLength, 'length'],
    ['right lateral', 'max height', g('right lateral dam').maxHeight, f.rightLateralMaxHeight, 'height'],
    ['spillway', 'width', g('spillway').width, f.spillwayWidth, 'length'],
    ['spillway', 'length', g('spillway').length, f.spillwayLength, 'length'],
    ['spillway', 'max height', g('spillway').maxHeight, f.spillwayMaxHeight, 'height'],
    ['spillway', 'gates', g('spillway').gates, f.spillwayGates, 'count'],
    ['spillway', 'gate width', g('spillway').gateWidth, f.spillwayGateWidth, 'length'],
    ['spillway', 'gate height', g('spillway').gateHeight, f.spillwayGateHeight, 'length'],
    ['spillway', 'sill', g('spillway').sillY, f.spillwaySill, 'length'],
    ['spillway', 'blocks (piers)', g('spillway').blocks, f.spillwayPiers, 'count'],
    ['powerhouse', 'length', g('powerhouse').length, f.powerhouseLength, 'length'],
    ['powerhouse', 'width', g('powerhouse').width, f.powerhouseWidth, 'length'],
    ['powerhouse', 'max height', g('powerhouse').maxHeight, f.powerhouseMaxHeight, 'height'],
    ['powerhouse', 'roof', g('powerhouse').roofY, f.powerhouseRoofY, 'length'],
    ['powerhouse', 'units', g('powerhouse').units, f.units, 'count'],
    ['powerhouse', 'unit spacing', g('powerhouse').unitSpacing, f.unitSpacing, 'length'],
    ['penstocks', 'count', g('penstocks').count, f.penstocks, 'count'],
    ['penstocks', 'inside diameter', g('penstocks').innerDiameter, f.penstockDiameter, 'length'],
    ['penstocks', 'clear gap (unit spacing less the diameter)', g('powerhouse').unitSpacing - g('penstocks').innerDiameter, f.penstockGap, 'length'],
    ['rockfill dam', 'crest length', g('rockfill dam').crestLength, f['rockfill dam crest'], 'length'],
    ['left bank earth dam', 'crest length', g('left bank earth dam').crestLength, f['left bank earth dam crest'], 'length'],
    ['right bank earth dam', 'crest length', g('right bank earth dam').crestLength, f['right bank earth dam crest'], 'length'],
  ];
}

/* ------------------------------------------------------------ page side */

/* Every drawn face's points against the dam's solids (walls) or the map's
 * ground (tops): per face name, the worst of FACE_POINTS points spread
 * over its faces by area. */
const FACES = `(() => {
  const d = window.__mapScene().userData.itaipu.parts.dam.survey();
  const col = d.colliders;
  const ids = d.solidIndices;
  const CELL = 16;
  const grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const i of ids) {
    const r = col.fbox[i] ? 0 : col.fr[i];
    const x0 = Math.min(col.fax[i], col.fbx[i]) - r - 1, x1 = Math.max(col.fax[i], col.fbx[i]) + r + 1;
    const z0 = Math.min(col.faz[i], col.fbz[i]) - r - 1, z1 = Math.max(col.faz[i], col.fbz[i]) + r + 1;
    for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a += 1) {
      for (let b = Math.floor(z0 / CELL); b <= Math.floor(z1 / CELL); b += 1) {
        const k = key(a, b);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  }
  const near = (x, y, z) => {
    let best = Infinity;
    for (const i of grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []) {
      let dd;
      if (col.fbox[i]) {
        const dx = Math.max(col.fax[i] - x, 0, x - col.fbx[i]);
        const dy = Math.max(col.fay[i] - y, 0, y - col.fby[i]);
        const dz = Math.max(col.faz[i] - z, 0, z - col.fbz[i]);
        dd = Math.hypot(dx, dy, dz);
      } else {
        const ax = col.fax[i], ay = col.fay[i], az = col.faz[i];
        const vx = col.fbx[i] - ax, vy = col.fby[i] - ay, vz = col.fbz[i] - az;
        const l2 = vx * vx + vy * vy + vz * vz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / l2)) : 0;
        dd = Math.max(0, Math.hypot(x - ax - vx * t, y - ay - vy * t, z - az - vz * t) - col.fr[i]);
      }
      if (dd < best) best = dd;
    }
    return best;
  };
  let s = 20260929;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const groups = {};
  for (const f of d.faces) {
    (groups[f.name + '|' + f.kind] ||= []).push(f);
  }
  const tris = (P) => { const out = []; for (let i = 1; i + 1 < P.length; i += 1) out.push([P[0], P[i], P[i + 1]]); return out; };
  const area = ([A, B, C]) => {
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  };
  const out = [];
  for (const [name, list] of Object.entries(groups)) {
    const [label, kind] = name.split('|');
    const all = list.flatMap((f) => tris(f.pts));
    const w = all.map(area);
    const total = w.reduce((a, b) => a + b, 0);
    let worst = 0, worstAt = null, over = 0, buried = 0;
    for (let n = 0; n < ${FACE_POINTS}; n += 1) {
      let r = rnd() * total, k = 0;
      while (k < all.length - 1 && r > w[k]) { r -= w[k]; k += 1; }
      let a = rnd(), b = rnd();
      if (a + b > 1) { a = 1 - a; b = 1 - b; }
      const [A, B, C] = all[k];
      const p = [0, 1, 2].map((q) => A[q] + (B[q] - A[q]) * a + (C[q] - A[q]) * b);
      /* A point the terrain covers is not drawn: the part stands down to
       * its foundation, under ground where the ground is higher. */
      if (p[1] < window.__surface(p[0], p[2], -1e9) - 0.05) { buried += 1; n -= 1; if (buried > 20000) break; continue; }
      const dd = kind === 'wall' ? near(p[0], p[1], p[2]) : Math.abs(window.__surface(p[0], p[2], p[1]) - p[1]);
      if (dd > ${FACE_TOL}) over += 1;
      if (dd > worst) { worst = dd; worstAt = p.map((v) => +v.toFixed(2)); }
    }
    out.push({ label, kind, faces: list.length, worst, worstAt, over, buried });
  }
  return out;
})()`;

/* Each target's distance to the dam's drawn triangles (the yard's to the
 * ground), and its colliders' distance to it. */
const TARGETS = `(() => {
  const part = window.__mapScene().userData.itaipu.parts.dam;
  const d = part.survey();
  const col = d.colliders;
  const solids = new Set(d.solidIndices);
  const tris = [];
  part.group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const p = o.geometry.getAttribute('position').array;
    for (let i = 0; i + 8 < p.length; i += 9) tris.push(i, p);
  });
  const near = (x, y, z) => {
    let best = Infinity;
    for (let k = 0; k < tris.length; k += 2) {
      const i = tris[k], p = tris[k + 1];
      const ax = p[i], ay = p[i + 1], az = p[i + 2];
      const minx = Math.min(ax, p[i + 3], p[i + 6]), maxx = Math.max(ax, p[i + 3], p[i + 6]);
      const miny = Math.min(ay, p[i + 4], p[i + 7]), maxy = Math.max(ay, p[i + 4], p[i + 7]);
      const minz = Math.min(az, p[i + 5], p[i + 8]), maxz = Math.max(az, p[i + 5], p[i + 8]);
      if (x < minx - best || x > maxx + best || y < miny - best || y > maxy + best || z < minz - best || z > maxz + best) continue;
      const ux = p[i + 3] - ax, uy = p[i + 4] - ay, uz = p[i + 5] - az;
      const vx = p[i + 6] - ax, vy = p[i + 7] - ay, vz = p[i + 8] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-9) continue;
      nx /= nl; ny /= nl; nz /= nl;
      const dist = (x - ax) * nx + (y - ay) * ny + (z - az) * nz;
      const qx = x - nx * dist - ax, qy = y - ny * dist - ay, qz = z - nz * dist - az;
      const uu = ux * ux + uy * uy + uz * uz, uv = ux * vx + uy * vy + uz * vz, vv = vx * vx + vy * vy + vz * vz;
      const qu = qx * ux + qy * uy + qz * uz, qv = qx * vx + qy * vy + qz * vz;
      const den = uu * vv - uv * uv;
      const a = (vv * qu - uv * qv) / den, b = (uu * qv - uv * qu) / den;
      if (a >= -1e-6 && b >= -1e-6 && a + b <= 1 + 1e-6) best = Math.min(best, Math.abs(dist));
    }
    return best;
  };
  const out = {};
  for (const [id, t] of Object.entries(part.targets)) {
    const [x, y, z] = t.at;
    const on = t.part === 'yard' ? Math.abs(window.__surface(x, z, -1e9) - y) : near(x, y, z);
    let far = 0, foreign = 0;
    for (const i of t.colliders) {
      if (!solids.has(i)) foreign += 1;
      const r = col.fbox[i] ? 0 : col.fr[i];
      const dx = Math.max(Math.min(col.fax[i], col.fbx[i]) - r - x, 0, x - Math.max(col.fax[i], col.fbx[i]) - r);
      const dy = Math.max(Math.min(col.fay[i], col.fby[i]) - r - y, 0, y - Math.max(col.fay[i], col.fby[i]) - r);
      const dz = Math.max(Math.min(col.faz[i], col.fbz[i]) - r - z, 0, z - Math.max(col.faz[i], col.fbz[i]) - r);
      far = Math.max(far, Math.hypot(dx, dy, dz));
    }
    out[id] = { part: t.part, r: t.r, on, colliders: t.colliders.length, far, foreign, frozen: Object.isFrozen(t) };
  }
  return out;
})()`;

/* One flight: throw, release, sample until `ms` of the page's clock. */
async function fly(page, plan, ms, stick = [0, 0, 0, 0]) {
  await page.evaluate(`window.__crashThrow(${JSON.stringify({ ...plan, hold: true, fresh: true })})`);
  await page.evaluate(`window.__stick(${stick.join(',')})`);
  await page.sleep(300);
  const before = JSON.parse(await page.evaluate('JSON.stringify({ c: window.__crash(), g: window.__ground() })'));
  await page.evaluate('window.__releasePose()');
  const log = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    log.push(JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const s = window.__craftState();
      const c = window.__crash();
      const k = window.__contacts();
      return {
        x: s.worldX, y: s.worldY, z: s.worldZ, speed: s.speed, hit: s.lastHitKind, hitIndex: s.lastHitIndex,
        wrecked: c.wrecked, events: c.events, flags: c.flagNames.join('|'), contacts: window.__ground().contactSteps,
        ground: window.__surface(s.worldX, s.worldZ, s.worldY - 0.4), obstacle: k.obstacle.length, landed: s.landed,
      };
    })())`)));
    await page.sleep(40);
  }
  const events = JSON.parse(await page.evaluate('JSON.stringify(window.__crashLog())'));
  return { before, log, events };
}

const yawOf = (d) => (Math.atan2(-d[0], -d[1]) * 180) / Math.PI;

async function main() {
  const dam = JSON.parse(await readFile(join(DATA, 'dam.json'), 'utf8'));
  const page = await openPage({ root, width: 960, height: 540, url: '/index.html?map=itaipu', seed: seed() });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__map().id === "itaipu"', 300000);
    await page.evaluate('window.__drawOff(true)');
    const survey = JSON.parse(await page.evaluate('JSON.stringify((() => { const d = window.__mapScene().userData.itaipu.parts.dam.survey(); return { solids: d.solids, boxes: d.boxes, capsules: d.capsules, roofs: d.roofs, meshes: d.meshes, triangles: d.triangles, figures: d.figures, sites: d.sites }; })())'));
    console.log(`dam: ${survey.solids} solids (${survey.boxes} boxes, ${survey.capsules} capsules), ${survey.roofs} roof records, `
      + `${survey.meshes} meshes, ${survey.triangles} triangles`);

    if (ONLY.includes('count')) {
      console.log(`count: ${survey.solids} solids, budget ${SOLIDS_MAX}`);
      if (survey.solids > SOLIDS_MAX) {
        fail(`the dam has ${survey.solids} solids, section 6 allows ${SOLIDS_MAX}`);
      }
    }

    if (ONLY.includes('figures')) {
      console.log('figures (published, built):');
      for (const [part, what, want, got, kind] of figureRows(dam, survey.figures)) {
        const off = (got - want) / want;
        const ok = Math.abs(off) <= FIGURE_TOL;
        console.log(`  ${ok ? 'ok  ' : 'BAD '} ${part} ${what}: ${want}, ${Number.isFinite(got) ? +got.toFixed(2) : got} (${(off * 100).toFixed(2)} %)`);
        if (!ok) {
          fail(`${part} ${what}: published ${want}, built ${got}`);
        }
      }
      /* Where A's flattened footprint lies under a part's published
       * foundation, the part stands on basalt drawn down to it. */
      console.log(`  basalt under the foundation: spillway ${survey.figures.spillwayBasalt.toFixed(1)} m, right lateral ${survey.figures.rightLateralBasalt.toFixed(1)} m`);
    }

    if (ONLY.includes('faces')) {
      const rows = JSON.parse(await page.evaluate(`JSON.stringify(${FACES})`));
      console.log(`faces: ${FACE_POINTS} points on each, tolerance ${FACE_TOL} m:`);
      for (const r of rows) {
        const ok = r.worst <= FACE_TOL;
        console.log(`  ${ok ? 'ok  ' : 'BAD '} ${r.kind} ${r.label} (${r.faces} faces): worst ${r.worst.toFixed(3)} m${ok ? '' : ` at ${JSON.stringify(r.worstAt)}, ${r.over} points over`}${r.buried ? `, ${r.buried} buried points redrawn` : ''}`);
        if (!ok) {
          fail(`${r.label}: ${r.over} of ${FACE_POINTS} points more than ${FACE_TOL} m from its ${r.kind === 'wall' ? 'solids' : 'ground'}, worst ${r.worst.toFixed(2)} m`);
        }
      }
    }

    if (ONLY.includes('targets')) {
      const got = JSON.parse(await page.evaluate(`JSON.stringify(${TARGETS})`));
      const missing = TARGET_IDS.filter((id) => !(id in got));
      const extra = Object.keys(got).filter((id) => !TARGET_IDS.includes(id));
      let worstOn = 0;
      let worstId = null;
      for (const id of TARGET_IDS.filter((i) => i in got)) {
        const t = got[id];
        if (t.on > worstOn) {
          worstOn = t.on;
          worstId = id;
        }
        if (t.on > TARGET_ON) {
          fail(`target ${id} is ${t.on.toFixed(2)} m off the drawn ${t.part === 'yard' ? 'ground' : 'dam'}`);
        }
        if (t.part !== 'yard' && !t.colliders) {
          fail(`target ${id} lists no colliders`);
        }
        if (t.foreign || t.far > t.r) {
          fail(`target ${id}: ${t.foreign} collider(s) not the dam's, the farthest ${t.far.toFixed(1)} m from it (radius ${t.r})`);
        }
        if (!t.frozen) {
          fail(`target ${id} is not frozen`);
        }
      }
      console.log(`targets: ${Object.keys(got).length} (${TARGET_IDS.length} wanted), missing ${missing.join(', ') || 'none'}, extra ${extra.join(', ') || 'none'}; `
        + `worst distance to the drawn geometry ${worstOn.toFixed(3)} m (${worstId}), tolerance ${TARGET_ON}`);
      for (const id of missing) {
        fail(`target ${id} missing`);
      }
      /* Every state drawn: the draw on, each target through smoke, fire,
       * destroyed and back, frames between, the clock moving. */
      await page.evaluate('window.__drawOff(false)');
      await page.evaluate('window.__setCam(-500, 330, -1100, 0, 170, -1650, 60)');
      await page.sleep(1500);
      const quiet = JSON.parse(await page.evaluate('JSON.stringify(window.__renderStats())'));
      const errs0 = page.errors.length;
      const report = [];
      for (const state of ['smoke', 'fire', 'destroyed', 'ok']) {
        const r = JSON.parse(await page.evaluate(`JSON.stringify((() => {
          const part = window.__mapScene().userData.itaipu.parts.dam;
          const t0 = performance.now();
          for (const id of ${JSON.stringify(TARGET_IDS)}) part.setTargetState(id, ${JSON.stringify(state)});
          const ms = performance.now() - t0;
          const pen = part.group.getObjectByName('itaipu-dam-penstocks').geometry.getAttribute('color').array[0];
          const col = Math.min(...part.group.getObjectByName('itaipu-dam-intake-columns').instanceColor.array);
          const look = part.group.getObjectByName('itaipu-dam-damage').geometry.getAttribute('aLook').array;
          let puffs = 0;
          for (let i = 2; i < look.length; i += 4) puffs += look[i] > 0 ? 1 : 0;
          return { ms, pen, col, puffs, stats: part.stats() };
        })())`));
        for (let k = 1; k <= 3; k += 1) {
          await page.evaluate(`window.__animTo(${k * 700})`);
          await page.sleep(500);
        }
        const rs = JSON.parse(await page.evaluate('JSON.stringify(window.__renderStats())'));
        if ((r.puffs > 0) !== (state !== 'ok') || (state !== 'ok' && r.puffs % TARGET_IDS.length !== 0)) {
          fail(`state ${state}: ${r.puffs} puffs drawn for ${r.stats.burning} targets`);
        }
        report.push(`${state}: set all ${TARGET_IDS.length} in ${r.ms.toFixed(2)} ms, ${r.stats.burning} burning, ${r.puffs} puffs, penstock colour ${r.pen.toFixed(3)}, darkest intake column ${r.col.toFixed(3)}, frame ${rs.calls} calls (${rs.calls - quiet.calls} over none burning)`);
        const charred = r.pen < 0.3 && r.col < 0.3;
        if ((state === 'destroyed') !== charred) {
          fail(`state ${state}: the parts are ${charred ? '' : 'not '}charred`);
        }
        if (r.stats.burning !== (state === 'ok' ? 0 : TARGET_IDS.length)) {
          fail(`state ${state}: ${r.stats.burning} targets not ok`);
        }
      }
      for (const line of report) {
        console.log(`  ${line}`);
      }
      const bad = await page.evaluate(`(() => { try { window.__mapScene().userData.itaipu.parts.dam.setTargetState('intake-99', 'fire'); return 'accepted'; } catch (e) { return 'refused'; } })()`);
      console.log(`  an unknown target is ${bad}`);
      if (bad !== 'refused') {
        fail('setTargetState accepted an unknown target');
      }
      const newErrs = page.errors.slice(errs0).filter((e) => !/net::ERR_|Failed to load resource/.test(e));
      if (newErrs.length) {
        fail(`drawing the target states logged ${newErrs.length} error(s), first ${newErrs[0]}`);
      }
      await page.evaluate('window.__setCam()');
      await page.evaluate('window.__drawOff(true)');
    }

    /* The first throw of a page pays for the crash world; take it in the air. */
    await fly(page, { x: 1500, y: 600, z: -4200, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -15 }, 1500);

    if (ONLY.includes('land')) {
      for (const [label, site] of [['main crest road', survey.sites.mainCrest], ['rockfill crest road', survey.sites.rockfillCrest], ['powerhouse roof', survey.sites.powerhouseRoof]]) {
        /* A three point landing: its resting attitude, a little over
         * its stall, sinking half a metre a second from 0.4 m up. */
        const gear = airframeById(AIRFRAME).gear;
        const v = LAND_SPEED;
        const plan = {
          x: site.x, y: site.y + gear.restHeight + 0.4, z: site.z, yaw: yawOf(site.dir), pitch: (gear.restPitch * 180) / Math.PI, vx: site.dir[0] * v, vy: -0.5, vz: site.dir[1] * v,
        };
        const { before, log, events } = await fly(page, plan, 14000);
        if (process.argv.includes('--verbose')) {
          console.log(JSON.stringify(events));
        }
        const last = log[log.length - 1];
        const damage = last.events - before.c.events;
        const first = log.find((r) => r.events > before.c.events);
        const side = (r) => (r.x - site.x) * -site.dir[1] + (r.z - site.z) * site.dir[0];
        if (process.argv.includes('--verbose')) {
          for (const r of log.filter((_, i) => i % 5 === 0)) {
            console.log(`    along ${((r.x - site.x) * site.dir[0] + (r.z - site.z) * site.dir[1]).toFixed(1)} side ${side(r).toFixed(2)} y ${(r.y - site.y).toFixed(2)} v ${r.speed.toFixed(1)} ev ${r.events - before.c.events} ${r.flags} ground ${r.ground.toFixed(2)}`);
          }
        }
        const touched = last.contacts - before.g.contactSteps;
        const rest = Math.abs(last.y - site.y);
        const ok = !last.wrecked && damage === 0 && touched > 0 && last.speed < 0.5 && rest < 1.0 && Math.abs(last.ground - site.y) < 0.05;
        console.log(`land ${label}: ${ok ? 'ok' : 'BAD'}; touched ${touched} steps, end speed ${last.speed.toFixed(2)} m/s, `
          + `${(last.y - site.y).toFixed(2)} m over the record, ground there ${last.ground.toFixed(2)}, damage events ${damage}${first ? ` (${first.flags} at ${Math.hypot(first.x - site.x, first.z - site.z).toFixed(1)} m, ${(first.y - site.y).toFixed(2)} m up)` : ''}, `
          + `rolled ${Math.hypot(last.x - site.x, last.z - site.z).toFixed(1)} m`);
        if (!ok) {
          fail(`a Timber set down on the ${label} did not come to rest on it unharmed`);
        }
      }
    }

    if (ONLY.includes('face')) {
      const s = survey.sites.upstreamFace;
      const back = 14;
      const plan = {
        x: s.x - s.dir[0] * back, y: s.y + 1.5, z: s.z - s.dir[1] * back, yaw: yawOf(s.dir), pitch: 2, vx: s.dir[0] * 20, vy: 0, vz: s.dir[1] * 20,
      };
      const { before, log } = await fly(page, plan, 3000, [0, 0, 0, 0.6]);
      const last = log[log.length - 1];
      const hitWall = log.some((r) => r.hit === 'wall') || last.obstacle > 0;
      const ok = last.wrecked && hitWall;
      console.log(`face: ${ok ? 'ok' : 'BAD'}; into the upstream face at 20 m/s: wrecked ${last.wrecked}, `
        + `hit ${log.map((r) => r.hit).filter((h) => h !== 'none')[0] ?? 'none'}, plant contacts ${last.obstacle}, damage events ${last.events - before.c.events} (${last.flags})`);
      if (!ok) {
        fail('a Timber flown into the upstream face at 20 m/s was not a wreck on it');
      }
    }

    if (ONLY.includes('gap')) {
      const P = survey.sites.penstocks;
      const f = survey.sites.face;
      const k = 9;
      const a = P[k];
      const b = P[k + 1];
      /* Between penstocks k and k + 1, over the face, flying out from the
       * dam along their lines, level, with power on. */
      const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
      const along = (p, q, y) => {
        const t = (y - p[1]) / (q[1] - p[1]);
        return [p[0] + (q[0] - p[0]) * t, y, p[2] + (q[2] - p[2]) * t];
      };
      const y = 172;
      const start = mid(along(a.a, a.b, y), along(b.a, b.b, y));
      const plan = {
        x: start[0], y: start[1], z: start[2], yaw: yawOf(f.n), pitch: 3, vx: f.n[0] * 14, vy: 0, vz: f.n[1] * 14,
      };
      const r1 = await fly(page, plan, 1800, [0, 0, 0, 0.7]);
      const last = r1.log[r1.log.length - 1];
      const hits = r1.log.filter((r) => r.hit !== 'none').length + last.obstacle;
      const touched = last.contacts - r1.before.g.contactSteps;
      const outS = ((last.x - start[0]) * f.n[0] + (last.z - start[2]) * f.n[1]);
      const ok1 = hits === 0 && touched === 0 && !last.wrecked && outS > 15;
      console.log(`gap: ${ok1 ? 'ok' : 'BAD'}; between penstocks ${k + 1} and ${k + 2}, ${outS.toFixed(1)} m out from the dam: `
        + `${hits} obstacle hits, ${touched} ground steps, wrecked ${last.wrecked}`);
      if (!ok1) {
        fail('a Timber flown out between two penstocks met something');
      }
      /* Let down onto penstock k from over it. */
      const on = along(a.a, a.b, 168);
      const drop = {
        x: on[0], y: on[1] + a.r + 6, z: on[2], yaw: yawOf(f.n), pitch: 0, vx: f.n[0] * 4, vy: -8, vz: f.n[1] * 4,
      };
      const r2 = await fly(page, drop, 1800, [0, 0, 0, 0]);
      const l2 = r2.log[r2.log.length - 1];
      const met = r2.log.find((r) => r.hit !== 'none');
      const metIt = (met && met.hitIndex === a.index) || l2.obstacle > 0;
      console.log(`gap: ${metIt ? 'ok' : 'BAD'}; onto penstock ${k + 1} (collider ${a.index}): shell hit ${met ? `${met.hit} ${met.hitIndex}` : 'none'}, `
        + `plant contacts ${l2.obstacle}, damage events ${l2.events - r2.before.c.events}`);
      if (!metIt) {
        fail('a Timber let down onto a penstock did not meet it');
      }
    }

    if (ONLY.includes('chute')) {
      const s = survey.sites.chute;
      /* On its wheels on the floor, sitting as it rests, going down it
       * at 6 m/s, under its stall so it stays down: a Timber sat still
       * on a 12 degree concrete slope stays put, its wheels' friction
       * holding it in the plant. */
      const gear = airframeById(AIRFRAME).gear;
      const fall = Math.atan(s.slope);
      const v = 6;
      const plan = {
        x: s.x, y: s.y + gear.restHeight / Math.cos(fall) + 0.05, z: s.z, yaw: yawOf(s.dir), pitch: (gear.restPitch - fall) * 180 / Math.PI,
        vx: s.dir[0] * v * Math.cos(fall), vy: -v * Math.sin(fall), vz: s.dir[1] * v * Math.cos(fall),
      };
      const { before, log } = await fly(page, plan, 4000);
      const last = log[log.length - 1];
      const touched = last.contacts - before.g.contactSteps;
      const down = (last.x - s.x) * s.dir[0] + (last.z - s.z) * s.dir[1];
      const under = Math.min(...log.map((r) => r.y - r.ground));
      const ok = touched > 0 && down > 10 && under > -0.2;
      console.log(`chute: ${ok ? 'ok' : 'BAD'}; ${touched} ground steps, ${down.toFixed(1)} m down the chute, `
        + `lowest ${under.toFixed(2)} m over its floor, end ${last.y.toFixed(2)} over ground ${last.ground.toFixed(2)}, wrecked ${last.wrecked}`);
      if (!ok) {
        fail('a Timber on the chute did not skid down its floor');
      }
    }

    const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      fail(`console: ${e}`);
    }
  } finally {
    await page.close();
  }
  console.log('');
  if (failures.length) {
    console.error(`FAIL, ${failures.length} problem(s)`);
    process.exitCode = 1;
    return;
  }
  console.log('PASS, the dam stands where its figures say and flies as solid concrete');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
