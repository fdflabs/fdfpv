/*
 * itaipu-check.js: package B's promises for the Itaipu map, measured
 * (docs/ITAIPU-PLAN.md section 14, row B).
 *
 * In Node, on the data folder's own files (FDFPV_ITAIPU_DATA, by default
 * ~/Desktop/fdfpv-itaipu-data):
 *
 *   tent        every published level 1 to 3 sample is the tent filter
 *               of the finer level's nine round it, exactly: the
 *               pipeline's pyramid, built from the edited hero (data v2);
 *   hero        level 0 equals the hero at every sample they share, and
 *               the hero tiles cover whole level 0 nodes, so the engine
 *               draws the same ground at every level and splits every
 *               node over the hero to 10 m. The page draws the tiles as
 *               published; data that broke either would pop the dam in
 *               and out with distance, so it fails here.
 *
 * In headless Chromium, the map built by the shell as a pilot's choice
 * builds it:
 *
 *   builds      with no console error, and the world stage's time is
 *               printed for src/maps/build-cost.js;
 *   fetches     only its own data (itaipu-data/, never the public host
 *               from a local page, never Yellowstone's data) and only the
 *               modules it is built from: its own, Yellowstone's terrain
 *               engine and swiss2's look, never Yellowstone's features;
 *   ground      map.height() under every roof at 200 random hero points,
 *               each with the camera over it, equals the tiles within
 *               0.05 m (the water's surface where the point is on a
 *               body), and the ground under the camera there is drawn at
 *               10 m;
 *   water       the reservoir and the river are drawn at 219.0 and
 *               103.5 m, and height() on each body's spawn is its level;
 *   budget      chunk buffers under 24 MB and tiles under 12 MB
 *               (section 13), and the frame's draw calls and triangles
 *               at the spawn and from the air, printed;
 *   edges       where the ground meets the dam's concrete and the water
 *               (the owner, 1 October, over the chute's west wall: the
 *               ground's 10 m triangles poking over the training wall in
 *               a sawtooth, grey wall showing between them). On the hero
 *               ground (terrain.finestAt, the 10 m data the engine draws
 *               within a kilometre of the camera, so no camera is moved):
 *                 poke     every drawn face the dam lists (survey()
 *                          faces): along a wall's top edge every
 *                          EDGE_STEP, where a side of the wall is open
 *                          (the ground EDGE_OPEN off it under its top),
 *                          on it and EDGE_OFF toward each open side, and
 *                          over a top's (a floor's, a crest's, a roof's,
 *                          not a sloping face's) plan every EDGE_STEP,
 *                          the ground is at most EDGE_TOL over the
 *                          concrete;
 *                 gap      every EDGE_STEP along each body's outline as
 *                          the map draws it (read from the page) over the
 *                          hero,
 *                          EDGE_OFF outside it and not under a dam
 *                          footprint or top (its roof records), the
 *                          ground is at least the water's level less
 *                          EDGE_TOL: no sheet's edge hanging over lower
 *                          ground with the void under it;
 *                 ragged   along every wall's top edge every metre where
 *                          it has an open side, the ground at the face is
 *                          either over the top (hiding it) or under it
 *                          (showing it); each change from one to the
 *                          other is a corner of a bare wall triangle
 *                          between two spikes of ground. A finished
 *                          junction shows the wall's top as one line, so
 *                          there are none.
 *
 *   [SIM_GPU=1] [FDFPV_ITAIPU_DATA=DIR] node scripts/itaipu-check.js [--only=edges]
 *
 * --only=edges builds the map and runs the edges alone (and the builds
 * and water rows, which come with the build), for the loop round a
 * junction change wants; without it every row runs.
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
import { SETTINGS_KEY } from '../src/ui/ui.js';
import {
  HERO, TILE_CELLS, TILE_SAMPLES, decode,
} from '../src/maps/yellowstone/terrain/frame.js';
import { ITAIPU_FRAME, RESERVOIR_Y, RIVER_Y } from '../src/maps/itaipu/terrain/frame.js';
import { insideWater } from '../src/game/water.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY_EDGES = onlyArg === '--only=edges';
if (onlyArg && !ONLY_EDGES) {
  throw new Error(`itaipu-check: --only takes edges, got ${onlyArg}`);
}

/* The edges' samples: their spacing, how far off a face or an outline
 * the ground beside it is read, and how far over the concrete (or under
 * the water) the ground may be, m: the tiles' encoding step. */
const EDGE_STEP = 2;
const EDGE_OFF = 0.5;
const EDGE_TOL = 0.1;
/* How far either side of a wall its open side is looked for, m: past the
 * thickest training wall's 5.5 m. And the least upward part of a top's
 * normal: the steepest chute floor is 23 degrees (0.92), the steepest
 * pier top 29 (0.88), the dam's downstream faces 42 and more (0.74). */
const EDGE_OPEN = 6;
const EDGE_FLAT = 0.8;

/* Section 14's tolerance: the encoding's own half decimetre. */
const GROUND_TOL = 0.05;
const GROUND_POINTS = 200;
/* Points per camera placement: each within CLUSTER_R of it, well inside
 * the 1.28 km at which the engine hands 10 m over to 30 m. */
const CLUSTER = 10;
const CLUSTER_R = 400;
/* Section 13. */
const BUDGET = { chunkBytes: 24e6, tileBytes: 12e6 };

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

/* ---------------------------------------------------------------- Node */

/* Until the terrain has built everything the camera just placed asks
 * for: a frame for the selection to see the new camera, then no build
 * queued or in hand, then a few frames for the selection that follows
 * the last build. Twice, because a split can queue the next level. */
async function settle(page) {
  for (let k = 0; k < 2; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 30000);
    await page.until(`(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()`, 60000);
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 3', 30000);
  }
}

async function readTiles(manifest) {
  const tiles = new Map();
  const load = async (level, i, j) => {
    const path = level === HERO ? `hero/${i}_${j}.bin` : `${level}/${i}_${j}.bin`;
    const buf = await readFile(join(DATA, path));
    tiles.set(`${level}:${i}:${j}`, new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2).slice());
  };
  const jobs = [];
  for (const l of manifest.levels) {
    for (let j = 0; j < l.grid; j += 1) {
      for (let i = 0; i < l.grid; i += 1) {
        jobs.push(load(l.level, i, j));
      }
    }
  }
  for (const [i, j] of manifest.hero.tiles) {
    jobs.push(load(HERO, i, j));
  }
  await Promise.all(jobs);
  return tiles;
}

/* Global sample (gx, gz) of a level, from whichever loaded tile holds
 * it (a sample on a tile edge is in two, or four), or -1. */
function sampleAt(get, level, gx, gz) {
  for (const i of new Set([Math.floor(gx / TILE_CELLS), Math.max(0, Math.ceil(gx / TILE_CELLS) - 1)])) {
    for (const j of new Set([Math.floor(gz / TILE_CELLS), Math.max(0, Math.ceil(gz / TILE_CELLS) - 1)])) {
      const t = get(level, i, j);
      if (t) {
        return t[(gz - j * TILE_CELLS) * TILE_SAMPLES + (gx - i * TILE_CELLS)];
      }
    }
  }
  return -1;
}

/* One coarser sample from the finer level's nine round it, in the
 * pipeline's integers: Yellowstone's (1 2 1) x (1 2 1) / 16 rounded half
 * up (tools/itaipu/build_terrain.py tent_down). */
function tentAt(get, level, kx, kz) {
  const w = [1, 2, 1];
  let sum = 0;
  for (let b = -1; b <= 1; b += 1) {
    for (let a = -1; a <= 1; a += 1) {
      sum += w[a + 1] * w[b + 1] * sampleAt(get, level - 1, 2 * kx + a, 2 * kz + b);
    }
  }
  return Math.floor((sum + 8) / 16);
}

function nodeChecks(manifest, tiles) {
  const get = (level, i, j) => tiles.get(`${level}:${i}:${j}`) || null;

  /* The tent at every sample of levels 1 to 3 whose finer samples are
   * all in the files. */
  let tentN = 0;
  let tentBad = 0;
  let tentFirst = null;
  for (let level = 1; level <= ITAIPU_FRAME.coarsest; level += 1) {
    const n = manifest.levels.find((l) => l.level === level).grid * TILE_CELLS;
    const fine = manifest.levels.find((l) => l.level === level - 1).grid * TILE_CELLS;
    for (let z = 1; z < n; z += 1) {
      for (let x = 1; x < n; x += 1) {
        if (2 * x + 1 > fine || 2 * z + 1 > fine) {
          continue;
        }
        const want = sampleAt(get, level, x, z);
        const got = tentAt(get, level, x, z);
        tentN += 1;
        if (got !== want) {
          tentBad += 1;
          tentFirst = tentFirst || { level, x, z, want, got };
        }
      }
    }
  }
  console.log(`tent: ${tentN} published samples of levels 1 to 3, ${tentBad} differ from the filter`);
  if (tentBad) {
    fail(`the tent filter disagrees with ${tentBad} published samples, first ${JSON.stringify(tentFirst)}`);
  }

  /* Level 0 is the hero at every shared sample: a 30 m sample is every
   * third 10 m one. */
  let shared = 0;
  let off = 0;
  const hs = manifest.hero.tiles;
  const hx0 = Math.min(...hs.map(([i]) => i)) * TILE_CELLS;
  const hx1 = (Math.max(...hs.map(([i]) => i)) + 1) * TILE_CELLS;
  const hz0 = Math.min(...hs.map(([, j]) => j)) * TILE_CELLS;
  const hz1 = (Math.max(...hs.map(([, j]) => j)) + 1) * TILE_CELLS;
  for (let z = Math.ceil(hz0 / 3); z <= Math.floor(hz1 / 3); z += 1) {
    for (let x = Math.ceil(hx0 / 3); x <= Math.floor(hx1 / 3); x += 1) {
      shared += 1;
      if (sampleAt(get, 0, x, z) !== sampleAt(get, HERO, 3 * x, 3 * z)) {
        off += 1;
      }
    }
  }
  /* A level 0 node is 64 cells of 30 m and splits into nine hero nodes
   * only when all nine have data, so the hero must be a whole number of
   * level 0 nodes on each axis, every tile inside it listed. */
  const node = 64 * 3;
  const whole = [hx0, hx1, hz0, hz1].every((v) => v % node === 0)
    && hs.length === ((hx1 - hx0) / TILE_CELLS) * ((hz1 - hz0) / TILE_CELLS);
  console.log(`hero: level 0 against the hero, ${shared} shared samples, ${off} differ; ${hs.length} hero tiles, `
    + `${whole ? 'whole' : 'NOT whole'} level 0 nodes`);
  if (off || !shared) {
    fail(`level 0 differs from the hero at ${off} of ${shared} shared samples`);
  }
  if (!whole) {
    fail(`the hero tiles (samples x ${hx0} to ${hx1}, z ${hz0} to ${hz1}) are not whole level 0 nodes of ${node} hero samples`);
  }
  return get;
}

/* The two triangles the chunk index draws, as engine.js tri(). */
function tri(data, ci, cj, fu, fv) {
  const k = cj * TILE_SAMPLES + ci;
  const h00 = decode(data[k]);
  const h10 = decode(data[k + 1]);
  const h01 = decode(data[k + TILE_SAMPLES]);
  const h11 = decode(data[k + TILE_SAMPLES + 1]);
  if (fu + fv <= 1) {
    return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
  }
  return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
}

/* The hero level's ground at (x, z) from the tiles. */
function heroGround(get, x, z) {
  const half = ITAIPU_FRAME.half;
  const gx = (x + half) / 10;
  const gz = (z + half) / 10;
  const ci = Math.floor(gx);
  const cj = Math.floor(gz);
  const ti = Math.floor(ci / TILE_CELLS);
  const tj = Math.floor(cj / TILE_CELLS);
  const data = get(HERO, ti, tj);
  return tri(data, ci - ti * TILE_CELLS, cj - tj * TILE_CELLS, gx - ci, gz - cj);
}

/* ------------------------------------------------------------- Browser */

/* The poke and ragged rows, in the page: per face name, the samples the
 * ground stands over the concrete at, the worst and where, and the
 * changes along walls' top edges. */
const EDGE_FACES = `(() => {
  const faces = window.__mapScene().userData.itaipu.parts.dam.survey().faces;
  const t = window.__mapScene().userData.itaipu.terrain;
  const g = (x, z) => t.finestAt(x, z);
  const STEP = ${EDGE_STEP}, OFF = ${EDGE_OFF}, TOL = ${EDGE_TOL}, OPEN = ${EDGE_OPEN}, FLAT = ${EDGE_FLAT};
  const rows = {};
  const row = (name, kind) => (rows[name + '|' + kind] ||= { name, kind, faces: 0, samples: 0, poke: 0, worst: 0, worstAt: null, ragged: 0, where: {} });
  const over = (r, x, y, z) => {
    r.samples += 1;
    const d = g(x, z) - y;
    if (d > TOL) {
      r.poke += 1;
      const c = Math.round(x / 50) * 50 + ',' + Math.round(z / 50) * 50;
      r.where[c] = (r.where[c] || 0) + 1;
    }
    if (d > r.worst) { r.worst = d; r.worstAt = [+x.toFixed(1), +y.toFixed(1), +z.toFixed(1)]; }
  };
  for (const f of faces) {
    const P = f.pts;
    if (P.length < 3) continue;
    const r = row(f.name, f.kind);
    r.faces += 1;
    /* The face's normal, from its first three corners. */
    const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
    const v = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nl = Math.hypot(n[0], n[1], n[2]);
    if (!(nl > 1e-9)) continue;
    const flat = Math.hypot(n[0], n[2]) / nl;
    if (f.kind === 'wall' && flat > 0.5) {
      /* A wall: its highest edge, sampled on it and either side. */
      let top = 0, best = -Infinity;
      for (let i = 0; i < P.length; i += 1) {
        const m = (P[i][1] + P[(i + 1) % P.length][1]) / 2;
        if (m > best) { best = m; top = i; }
      }
      const A = P[top], B = P[(top + 1) % P.length];
      const h = [n[0], n[2]];
      const hl = Math.hypot(h[0], h[1]);
      const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
      const k = Math.max(1, Math.round(len / STEP));
      for (let i = 0; i <= k; i += 1) {
        const a = i / k;
        const x = A[0] + (B[0] - A[0]) * a, y = A[1] + (B[1] - A[1]) * a, z = A[2] + (B[2] - A[2]) * a;
        /* Only where the wall has an open side, the ground under its top
         * OPEN off it: ground over a wall's top on both sides of it is the
         * wall buried (a buttress's foot in its abutment), nothing drawn.
         * On the face, and OFF toward each open side; on a closed side
         * the ground may rise from the top (the bank behind a training
         * wall). */
        const ux = h[0] / hl, uz = h[1] / hl;
        const plus = g(x + ux * OPEN, z + uz * OPEN) < y - TOL;
        const minus = g(x - ux * OPEN, z - uz * OPEN) < y - TOL;
        if (!plus && !minus) continue;
        over(r, x, y, z);
        if (plus) over(r, x + ux * OFF, y, z + uz * OFF);
        if (minus) over(r, x - ux * OFF, y, z - uz * OFF);
      }
      /* The ragged line: every metre along the top, over or under it. */
      const m = Math.max(1, Math.round(len));
      let was = null;
      for (let i = 0; i <= m; i += 1) {
        const a = i / m;
        const x = A[0] + (B[0] - A[0]) * a, y = A[1] + (B[1] - A[1]) * a, z = A[2] + (B[2] - A[2]) * a;
        const ux = h[0] / hl, uz = h[1] / hl;
        const open = Math.min(g(x + ux * OPEN, z + uz * OPEN), g(x - ux * OPEN, z - uz * OPEN)) < y - TOL;
        const hid = open && g(x, z) > y + TOL;
        if (was !== null && hid !== was) {
          r.ragged += 1;
          const c = Math.round(x / 50) * 50 + ',' + Math.round(z / 50) * 50;
          r.where[c] = (r.where[c] || 0) + 1;
        }
        was = hid;
      }
      continue;
    }
    /* A top: a crest, a floor, a roof, not a face falling to its foot
     * (the main dam's downstream face, 42 to 62 degrees, runs into its
     * abutments under the ground, as a dam's ends do). Its plan, fanned
     * from its first corner, every STEP. */
    if (Math.abs(n[1]) / nl < FLAT) continue;
    for (let i = 1; i + 1 < P.length; i += 1) {
      const A = P[0], B = P[i], C = P[i + 1];
      const lb = Math.hypot(B[0] - A[0], B[2] - A[2]), lc = Math.hypot(C[0] - A[0], C[2] - A[2]);
      const k = Math.max(1, Math.ceil(Math.max(lb, lc) / STEP));
      for (let p = 0; p <= k; p += 1) {
        for (let q = 0; p + q <= k; q += 1) {
          const a = p / k, b = q / k;
          over(r, A[0] + (B[0] - A[0]) * a + (C[0] - A[0]) * b, A[1] + (B[1] - A[1]) * a + (C[1] - A[1]) * b, A[2] + (B[2] - A[2]) * a + (C[2] - A[2]) * b);
        }
      }
    }
  }
  return Object.values(rows);
})()`;

/* The gap row's points, in Node: every EDGE_STEP along each body's
 * outline as drawn, EDGE_OFF outside it, over the hero, less those under
 * a dam footprint (the concrete stands over the water's edge there,
 * meet.js) or in the other body. The outlines were traced on the hero's
 * 10 m ground; past it the ring is drawn at 30 m and coarser, a
 * kilometre and more from anywhere the craft can stand. */
function gapPoints(bodies, dam, hero) {
  const lakes = bodies.map((b) => ({ kind: 'lake', outline: b.outline.map(([x, z]) => ({ x, z })) }));
  const feet = dam.filter((p) => (p.footprint || []).length > 2)
    .map((p) => ({ kind: 'lake', outline: p.footprint.map(([x, z]) => ({ x, z })) }));
  const out = [];
  bodies.forEach((b, k) => {
    const o = b.outline;
    for (let i = 0; i < o.length; i += 1) {
      const [ax, az] = o[i];
      const [bx, bz] = o[(i + 1) % o.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (!(len > 0)) {
        continue;
      }
      const nx = (bz - az) / len;
      const nz = -(bx - ax) / len;
      for (let t = EDGE_STEP / 2; t < len; t += EDGE_STEP) {
        const px = ax + ((bx - ax) * t) / len;
        const pz = az + ((bz - az) * t) / len;
        /* Out is the side the body is not on. */
        const s = insideWater(lakes[k], px + nx * EDGE_OFF, pz + nz * EDGE_OFF) ? -1 : 1;
        const x = px + s * nx * EDGE_OFF;
        const z = pz + s * nz * EDGE_OFF;
        if (Math.abs(x) > hero || Math.abs(z) > hero || insideWater(lakes[k], x, z) || lakes.some((l, j) => j !== k && insideWater(l, x, z))
          || feet.some((f) => insideWater(f, x, z))) {
          continue;
        }
        out.push([b.name, b.y, +x.toFixed(2), +z.toFixed(2)]);
      }
    }
  });
  return out;
}

/* The edges rows, printed and failed. */
async function edgesCheck(page, dam, hero) {
  const faces = JSON.parse(await page.evaluate(`JSON.stringify(${EDGE_FACES})`));
  let poke = 0;
  let ragged = 0;
  let samples = 0;
  console.log(`edges: ground against the dam's ${faces.reduce((n, r) => n + r.faces, 0)} drawn faces, `
    + `every ${EDGE_STEP} m, tolerance ${EDGE_TOL} m:`);
  for (const r of faces.sort((a, b) => b.poke + b.ragged - a.poke - a.ragged)) {
    poke += r.poke;
    ragged += r.ragged;
    samples += r.samples;
    if (r.poke || r.ragged) {
      console.log(`  BAD  ${r.kind} ${r.name} (${r.faces} faces): ${r.poke} of ${r.samples} samples under the ground, `
        + `worst ${r.worst.toFixed(2)} m at ${JSON.stringify(r.worstAt)}${r.kind === 'wall' ? `, ${r.ragged} ragged` : ''}`);
      const where = Object.entries(r.where).sort((a, b) => b[1] - a[1]);
      console.log(`         where (x,z to 50 m: samples): ${where.slice(0, 6).map(([c, k]) => `${c}: ${k}`).join('; ')}${where.length > 6 ? `; ${where.length - 6} more` : ''}`);
    }
  }
  console.log(`  poke: ${poke} of ${samples} samples; ragged: ${ragged} changes along the walls' tops`);
  if (poke) {
    fail(`edges: the ground stands more than ${EDGE_TOL} m over the dam's concrete at ${poke} samples`);
  }
  if (ragged) {
    fail(`edges: the ground's line along the walls' tops changes side ${ragged} times`);
  }
  const drawn = JSON.parse(await page.evaluate('JSON.stringify(window.__mapScene().userData.itaipu.water)'));
  const pts = gapPoints(drawn, dam, hero);
  /* Per point the ground, and the highest of the dam's tops over it (its
   * roof records, as alps/roofs.js roofTop reads them), or null: water
   * whose edge runs under a crest or a floor is hidden by it. */
  const got = JSON.parse(await page.evaluate(`JSON.stringify((() => {
    const t = window.__mapScene().userData.itaipu.terrain;
    const recs = window.__mapScene().userData.itaipu.parts.dam.survey().records;
    const CELL = 50;
    const grid = new Map();
    const inside = (P, x, z) => {
      let sign = 0;
      for (let i = 0; i < P.length; i += 1) {
        const a = P[i], b = P[(i + 1) % P.length];
        const c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
        if (c !== 0) {
          if (sign && Math.sign(c) !== sign) return false;
          sign = Math.sign(c);
        }
      }
      return true;
    };
    for (const r of recs) {
      for (const f of r.faces) {
        const w = f.pts.map(([lx, lz]) => [r.tx + r.c * lx + r.s * lz, r.tz - r.s * lx + r.c * lz]);
        const xs = w.map((p) => p[0]), zs = w.map((p) => p[1]);
        for (let a = Math.floor(Math.min(...xs) / CELL); a <= Math.floor(Math.max(...xs) / CELL); a += 1) {
          for (let b = Math.floor(Math.min(...zs) / CELL); b <= Math.floor(Math.max(...zs) / CELL); b += 1) {
            const k = a + ',' + b;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push([r, f]);
          }
        }
      }
    }
    const top = (x, z) => {
      let best = null;
      for (const [r, f] of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
        const dx = x - r.tx, dz = z - r.tz;
        const lx = r.c * dx - r.s * dz, lz = r.s * dx + r.c * dz;
        if (!inside(f.pts, lx, lz)) continue;
        const y = r.lift + r.ty + f.a * lx + f.b * lz + f.d;
        if (best === null || y > best) best = y;
      }
      return best;
    };
    return ${JSON.stringify(pts.map(([, , x, z]) => [x, z]))}.map(([x, z]) => [t.finestAt(x, z), top(x, z)]);
  })())`));
  const byBody = {};
  let covered = 0;
  pts.forEach(([name, y, x, z], k) => {
    const [ground, roof] = got[k];
    if (roof !== null && roof >= y - EDGE_TOL) {
      covered += 1;
      return;
    }
    const b = (byBody[name] ||= { n: 0, gap: 0, worst: 0, worstAt: null });
    b.n += 1;
    const d = y - ground;
    if (d > EDGE_TOL) {
      b.gap += 1;
    }
    if (d > b.worst) {
      b.worst = d;
      b.worstAt = [x, z];
    }
  });
  let gaps = 0;
  console.log(`  gap: ${covered} points under the dam's tops, left out`);
  for (const [name, b] of Object.entries(byBody)) {
    gaps += b.gap;
    console.log(`  ${b.gap ? 'BAD ' : 'ok  '} gap ${name}: ${b.gap} of ${b.n} points outside its edge under its level, `
      + `worst ${b.worst.toFixed(2)} m${b.worstAt ? ` at ${JSON.stringify(b.worstAt)}` : ''}`);
  }
  if (gaps) {
    fail(`edges: ${gaps} points just outside the water's edge lie more than ${EDGE_TOL} m under its level`);
  }
}

/* A module URL's place in the tree, or null for anything not a module. */
function moduleOf(url) {
  const m = /\/src\/(.*\.js)$/.exec(new URL(url).pathname);
  return m ? m[1] : null;
}

/* What choosing Itaipu may fetch from src/maps: its own, the terrain
 * engine it runs on, swiss2's look and the Alps' modules swiss2's look
 * and the roofs are made from. Yellowstone's features and its map module
 * are Yellowstone's alone. */
const MAY_FETCH = [/^maps\/itaipu(\.js|\/)/, /^maps\/yellowstone\/terrain\//, /^maps\/swiss2\//, /^maps\/alps(\.js|\/)/];

async function main() {
  const manifest = JSON.parse(await readFile(join(DATA, 'manifest.json'), 'utf8'));
  const water = JSON.parse(await readFile(join(DATA, 'water.json'), 'utf8'));
  const dam = JSON.parse(await readFile(join(DATA, 'dam.json'), 'utf8'));
  const tiles = await readTiles(manifest);
  const get = nodeChecks(manifest, tiles);

  const page = await openPage({
    root,
    width: 1280,
    height: 720,
    url: '/index.html?map=alps',
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.graphics = 'high';
      s.graphicsAuto = false;
      localStorage.setItem(k, JSON.stringify(s));
      localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
    } catch (e) { /* Storage refused. The run still boots. */ }`,
    'performance.setResourceTimingBufferSize(100000);'],
  });
  try {
    await page.until('!!window.__boot && window.__boot().frames > 2', 120000);
    const gl = await page.evaluate(`(() => {
      const g = document.createElement('canvas').getContext('webgl2');
      const e = g && g.getExtension('WEBGL_debug_renderer_info');
      return g ? g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER) : 'none';
    })()`);
    console.log(`renderer: ${gl}`);
    const mark = await page.evaluate('performance.getEntriesByType("resource").length');
    const heap0 = await page.evaluate('performance.memory ? performance.memory.usedJSHeapSize : 0');
    const t0 = Date.now();
    await page.evaluate('window.__setMap("itaipu")');
    await page.until('window.__map().id === "itaipu" && window.__map().ready', 300000);
    const loadS = (Date.now() - t0) / 1000;
    await page.evaluate("(() => { const n = document.getElementById('ui'); if (n) { n.style.display = 'none'; } return 1; })()");
    const m = JSON.parse(await page.evaluate('JSON.stringify(window.__map())'));
    console.log(`itaipu loaded in ${loadS.toFixed(1)} s; loading ledger ${JSON.stringify(m.loading)}; `
      + `spawn ${m.spawn.x.toFixed(0)}, ${m.spawn.y.toFixed(1)}, ${m.spawn.z.toFixed(0)}`);
    console.log(`  WORLD STAGE ${Math.round(m.loading.world)} ms (src/maps/build-cost.js MAP_BUILD_MS.itaipu)`);

    /* What the choice fetched. */
    const urls = JSON.parse(await page.evaluate(`JSON.stringify(performance.getEntriesByType('resource').slice(${mark}).map((e) => e.name))`));
    const data = urls.filter((u) => new URL(u).pathname.includes('/itaipu-data/'));
    const wrongData = urls.filter((u) => /yellowstone-data\/|fdfpv-itaipu-data|fdfpv-yellowstone-data/.test(u));
    const mods = urls.map(moduleOf).filter(Boolean);
    const mapMods = mods.filter((p) => p.startsWith('maps/'));
    const stray = mapMods.filter((p) => !MAY_FETCH.some((re) => re.test(p)));
    const own = mapMods.filter((p) => /^maps\/itaipu(\.js|\/)/.test(p));
    console.log(`fetches: ${urls.length} requests, ${data.length} from itaipu-data/, ${mapMods.length} map modules `
      + `(${own.length} Itaipu's own, expected ${m.expectedModules}), ${stray.length} from another world, ${wrongData.length} of other data`);
    if (!data.length) {
      fail('choosing Itaipu fetched nothing from itaipu-data/');
    }
    if (stray.length) {
      fail(`choosing Itaipu fetched ${stray.length} module(s) of another world, first ${stray[0]}`);
    }
    if (wrongData.length) {
      fail(`choosing Itaipu fetched other data, first ${wrongData[0]}`);
    }
    if (own.length !== m.expectedModules) {
      fail(`MAP_MODULE_COUNT says ${m.expectedModules} Itaipu modules, the browser fetched ${own.length}`);
    }

    /* The water, where it is drawn and what height() says on it. */
    const drawn = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const out = {};
      window.__mapScene().traverse((o) => {
        if (o.isMesh && /^itaipu-water-/.test(o.name)) {
          o.geometry.computeBoundingBox();
          const b = o.geometry.boundingBox;
          const k = o.name.slice(13);
          out[k] = out[k] || [];
          out[k].push([b.min.y, b.max.y]);
        }
      });
      return out;
    })())`));
    for (const [name, y] of [['reservoir', RESERVOIR_Y], ['river', RIVER_Y]]) {
      const body = water.find((b) => b.name === name);
      const planes = drawn[name] || [];
      const flat = planes.length && planes.every(([a, b]) => Math.abs(a - y) < 1e-3 && Math.abs(b - y) < 1e-3);
      const at = JSON.parse(await page.evaluate(`JSON.stringify(window.__heightAt(${body.spawn.x}, ${body.spawn.z}))`));
      console.log(`water ${name}: ${planes.length} plane(s) at ${planes.map(([a]) => a.toFixed(2)).join(', ')} m, `
        + `water.json ${body.y}, height() at its spawn ${at.toFixed(3)}`);
      if (!flat || body.y !== y) {
        fail(`water ${name}: drawn at ${JSON.stringify(planes)}, want ${y}`);
      }
      if (Math.abs(at - y) > 1e-6) {
        fail(`water ${name}: height() at its spawn is ${at}, want ${y}`);
      }
    }

    await edgesCheck(page, dam, manifest.frame.hero[1]);

    if (!ONLY_EDGES) {
      /* The ground: clusters of points round camera placements over the
       * whole hero, each settled before it is read. */
      let s = 20260929;
      const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      const lakes = water.map((b) => ({ kind: 'lake', surfaceY: b.y, outline: b.outline.map(([x, z]) => ({ x, z })) }));
      const hero = manifest.frame.hero;
      let worst = 0;
      let worstAt = null;
      let notHero = 0;
      let onWater = 0;
      let n = 0;
      for (let c = 0; c < GROUND_POINTS / CLUSTER; c += 1) {
        const cx = hero[0] + CLUSTER_R + rnd() * (hero[1] - hero[0] - 2 * CLUSTER_R);
        const cz = hero[0] + CLUSTER_R + rnd() * (hero[1] - hero[0] - 2 * CLUSTER_R);
        const pts = [];
        for (let k = 0; k < CLUSTER; k += 1) {
          pts.push([cx + (rnd() * 2 - 1) * CLUSTER_R, cz + (rnd() * 2 - 1) * CLUSTER_R]);
        }
        const gy = heroGround(get, cx, cz);
        await page.evaluate(`window.__setCam(${cx}, ${gy + 120}, ${cz}, ${cx + 1}, ${gy}, ${cz + 1})`);
        await settle(page);
        /* The bare ground: height() asked from far below every roof record
         * (src/maps/alps/roofs.js offers a roof only within a step of the
         * height it is asked from), so a point under a building's roof, the
         * dam's crest or a bridge deck reads the terrain and the water the
         * tiles hold, not the roof over it. */
        const got = JSON.parse(await page.evaluate(`JSON.stringify(${JSON.stringify(pts)}.map(([x, z]) => {
          const t = window.__mapScene().userData.itaipu.terrain;
          const leaf = t.leafAt(x, z);
          return [window.__surface(x, z, -1e9), leaf ? leaf.level : null];
        }))`));
        pts.forEach(([x, z], k) => {
          let want = heroGround(get, x, z);
          const lake = lakes.find((l) => l.surfaceY > want && insideWater(l, x, z));
          if (lake) {
            want = lake.surfaceY;
            onWater += 1;
          }
          const d = Math.abs(got[k][0] - want);
          n += 1;
          if (d > worst) {
            worst = d;
            worstAt = { x, z, want, got: got[k][0], level: got[k][1] };
          }
          if (got[k][1] !== HERO) {
            notHero += 1;
          }
        });
      }
      console.log(`ground: ${n} hero points in ${GROUND_POINTS / CLUSTER} camera placements, ${onWater} on the water, `
        + `worst |height() - tiles| ${worst.toFixed(4)} m (tolerance ${GROUND_TOL}), ${notHero} not drawn at 10 m`);
      if (worst > GROUND_TOL) {
        fail(`height() off the tiles by ${worst} m at ${JSON.stringify(worstAt)}`);
      }
      if (notHero) {
        fail(`${notHero} of ${n} hero points under the camera not drawn at 10 m`);
      }

      /* Budgets, and the frame at two places. */
      for (const [label, cam] of [
        ['spawn, eye height, toward the crest', [m.spawn.x, m.spawn.y + 1.7, m.spawn.z, 59, 200, -1672]],
        ['air, 400 m over the reservoir', [1500, 619, -4200, 59, 225, -1672]],
      ]) {
        await page.evaluate(`window.__setCam(${cam.join(',')})`);
        await settle(page);
        const st = JSON.parse(await page.evaluate('JSON.stringify(window.__map().terrain)'));
        const rs = JSON.parse(await page.evaluate('JSON.stringify(window.__renderStats())'));
        console.log(`${label}: whole frame ${rs.calls} calls ${rs.triangles} tris; terrain ${st.leaves} leaves `
          + `${JSON.stringify(st.perLevel)} ${st.leafTriangles} tris; chunks ${st.meshes} built `
          + `${(st.gpuBytes / 1e6).toFixed(1)} MB; tiles ${st.tiles.tiles} ${(st.tiles.bytes / 1e6).toFixed(2)} MB, `
          + `${st.tiles.fetched} fetched, ${st.tiles.evicted} evicted, ${st.tiles.failed} failed`);
        if (st.gpuBytes > BUDGET.chunkBytes) {
          fail(`${label}: chunk buffers ${st.gpuBytes} bytes, budget ${BUDGET.chunkBytes}`);
        }
        if (st.tiles.bytes > BUDGET.tileBytes) {
          fail(`${label}: tiles ${st.tiles.bytes} bytes, budget ${BUDGET.tileBytes}`);
        }
        if (st.tiles.evicted || st.tiles.failed) {
          fail(`${label}: ${st.tiles.evicted} tiles evicted and ${st.tiles.failed} failed; the whole pyramid is meant to stay`);
        }
      }
    }
    const heap = await page.evaluate('performance.memory ? performance.memory.usedJSHeapSize : 0');
    const gpu = JSON.parse(await page.evaluate('JSON.stringify(window.__gpuMemory())'));
    console.log(`memory: JS heap ${(heap / 1e6).toFixed(1)} MB, ${((heap - heap0) / 1e6).toFixed(1)} MB over the Alps before the switch; renderer ${gpu.geometries} geometries, ${gpu.textures} textures, ${gpu.programs} programs`);

    const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      fail(`console: ${e}`);
    }
    const offline = page.errors.length - real.length;
    if (offline) {
      console.log(`note: ${offline} network fetch(es) refused (the board is not running here)`);
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
  console.log('PASS, Itaipu builds on its own data, its ground is its tiles and its water is at its levels');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
