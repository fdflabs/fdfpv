/*
 * warhunt-check.js: the war room's hunters (edge/rooms/warhunt.js) and
 * their floor (src/share/war/itaipu-height.bin) against
 * docs/WARFARE-PLAN.md section 4.4. Plain Node, no browser, seconds.
 * npm run warhunt:check.
 *
 *   floor       the heightfield at 600 points (400 seeded over the hero
 *               square, 200 across the gorge) against the client's own
 *               terrain engine finestAt on the hero tiles, with the water
 *               outlines: never under either, and how far over; and at
 *               every cell centre inside a dam.json footprint, at least
 *               that part's crestY, so a floor built from an older
 *               dam.json fails
 *   straight    a hunter catches a defender flying straight away from it
 *   crossing    ... one crossing its nose
 *   turning     ... one circling as tight as a quad cruises
 *   gorge       chasing a defender that follows the ground 15 m up across
 *               the Parana's gorge, never under the floor, never under
 *               finestAt, and at least CLEAR_M over the floor outside
 *               TERMINAL_M of its target
 *   dam         from the reservoir to a defender circling low in the
 *               tailrace: over the dam's crest, not through it
 *   determinism two runs, one trace; save() and restore() mid run into a
 *               new Hunters (through JSON) continue the same trace
 *   cost        20 hunters and 8 defenders at 30 Hz: CPU milliseconds a
 *               room second
 *
 * The floor rows need the Itaipu data folder (FDFPV_ITAIPU_DATA, by
 * default ~/Desktop/fdfpv-itaipu-data, as scripts/serve.js reads it);
 * without it, or with a folder missing a file its manifest lists, they
 * FAIL with the folder named, so a run without the data cannot pass. The
 * rest reads only the repository.
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

import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLEAR_M, HEIGHT_CELLS, HEIGHT_CELL_M, HEIGHT_HALF, HOME_M, HUNTER_SPEED, Hunters, TARGET_RANGE_M, TERMINAL_M, TURN_RATE, loadHeight,
} from '../edge/rooms/warhunt.js';
import { insideWater } from '../src/game/water.js';
import { ITAIPU_FRAME } from '../src/maps/itaipu/terrain/frame.js';
import { HERO } from '../src/maps/yellowstone/terrain/frame.js';

/* The engine imports three.js for drawing; finestAt uses none of it, so a
 * stand in with the one constructor its modules call at load (chunks.js's
 * palette, THREE.Color) is enough for the page's own code to read the
 * tiles. */
const THREE_STUB = 'export class Color { constructor() { this.r = 0; this.g = 0; this.b = 0; } }';
register(`data:text/javascript,${encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(THREE_STUB)}`)}, shortCircuit: true } : n(s, c); }`,
)}`);
const { Terrain } = await import('../src/maps/yellowstone/terrain/engine.js');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));
const HZ = 30;
/* The warhead's reach (docs/WARFARE-PLAN.md section 4.3), centre to centre
 * here: the referee's part boxes only make it easier. */
const BLAST_M = 6;
/* The plan's CPU ceiling for a whole war room, ms a second (section 4.4). */
const ROOM_CPU_MS = 60;

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) {
    failed += 1;
  }
}

const height = loadHeight(readFileSync(join(ROOT, 'src/share/war/itaipu-height.bin')));
const floorAt = (x, z) => height.floorAt(x, z);

/* A seeded uniform in [0, 1), so the points are the same every run. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function stats(a) {
  const s = [...a].sort((p, q) => p - q);
  const mean = s.reduce((p, q) => p + q, 0) / s.length;
  return { min: s[0], mean, p95: s[Math.floor(0.95 * (s.length - 1))], max: s[s.length - 1] };
}
const fmt = (s) => `min ${s.min.toFixed(2)}, mean ${s.mean.toFixed(2)}, p95 ${s.p95.toFixed(2)}, max ${s.max.toFixed(2)} m`;

/* ------------------------------------------------------------ floor */

/* The ground and water from the data folder, or { missing } naming what
 * the folder lacks: a folder mid rebuild is a FAIL row, not a stack. */
function groundFromData() {
  if (!existsSync(join(DATA, 'manifest.json'))) {
    return { missing: 'manifest.json' };
  }
  const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'));
  const need = ['water.json', 'dam.json', ...manifest.hero.tiles.map(([i, j]) => join('hero', `${i}_${j}.bin`))];
  const missing = need.filter((f) => !existsSync(join(DATA, f)));
  if (missing.length) {
    return { missing: `${missing[0]} (${missing.length} of the files its manifest lists are missing)` };
  }
  const tiles = new Map();
  for (const [i, j] of manifest.hero.tiles) {
    const b = readFileSync(join(DATA, 'hero', `${i}_${j}.bin`));
    tiles.set(`${i}_${j}`, new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2).slice());
  }
  /* Only the hero is loaded, and every point asked lies inside it, so
   * finestAt answers from the hero and never reaches the apron. */
  const self = {
    f: ITAIPU_FRAME,
    store: { get: (level, i, j) => (level === HERO ? tiles.get(`${i}_${j}`) ?? null : null) },
    apron: { height: () => NaN },
  };
  const water = JSON.parse(readFileSync(join(DATA, 'water.json'), 'utf8'))
    .map((b) => ({ y: b.y, outline: b.outline.map(([x, z]) => ({ x, z })) }));
  /* The footprints the builder folds at crestY: every dam.json part with
   * one (tools/itaipu/build_war_height.py fold_dam). */
  const dam = JSON.parse(readFileSync(join(DATA, 'dam.json'), 'utf8'))
    .filter((p) => p.footprint)
    .map((p) => ({ part: p.part, crestY: p.crestY, outline: p.footprint.map(([x, z]) => ({ x, z })) }));
  return {
    ground: (x, z) => Terrain.prototype.finestAt.call(self, x, z),
    wet: (x, z) => Math.max(-Infinity, ...water.filter((b) => insideWater(b, x, z)).map((b) => b.y)),
    dam,
  };
}

const data = groundFromData();
const truth = data.missing ? null : data;

function floorRows() {
  if (!truth) {
    check('floor: the Itaipu data folder', false,
      `${DATA} has no ${data.missing}; point FDFPV_ITAIPU_DATA at a complete copy of fdfpv-itaipu-data`);
    return;
  }
  const r = rng(4404);
  const pts = [];
  for (let k = 0; k < 400; k += 1) {
    pts.push([-5100 + 10200 * r(), -5100 + 10200 * r()]);
  }
  for (let k = 0; k < 200; k += 1) {
    pts.push([-2500 + 3000 * r(), -1500 + 3000 * (k / 199)]);
  }
  const overGround = [];
  const overTop = [];
  for (const [x, z] of pts) {
    const g = truth.ground(x, z);
    const f = floorAt(x, z);
    overGround.push(f - g);
    overTop.push(f - Math.max(g, truth.wet(x, z)));
  }
  const sg = stats(overGround);
  const st = stats(overTop);
  check('floor: never under finestAt', sg.min >= -1e-6, `floorAt - finestAt at ${pts.length} points: ${fmt(sg)}`);
  check('floor: never under ground or water', st.min >= -1e-6, `floorAt - max(finestAt, water): ${fmt(st)}`);
  /* The 100 m window's price on this terrain, measured at 2.9 m mean when
   * the file was built; ten means the window or the file's layout broke. */
  check('floor: not far over it', st.mean < 10, `mean ${st.mean.toFixed(2)} m under 10`);

  /* The concrete is not ground, so the rows above cannot see a floor built
   * from an older dam.json. Every cell centre is one of the builder's 10 m
   * samples and floorAt reads it exactly there, so a centre inside a
   * footprint must read at least that part's crestY. */
  const short = [];
  let centres = 0;
  for (let j = 0; j < HEIGHT_CELLS; j += 1) {
    for (let i = 0; i < HEIGHT_CELLS; i += 1) {
      const x = -HEIGHT_HALF + HEIGHT_CELL_M * (i + 0.5);
      const z = -HEIGHT_HALF + HEIGHT_CELL_M * (j + 0.5);
      for (const p of truth.dam) {
        if (!insideWater(p, x, z)) {
          continue;
        }
        centres += 1;
        const under = p.crestY - floorAt(x, z);
        if (under > 1e-6) {
          short.push({ part: p.part, x, z, under });
        }
      }
    }
  }
  const worst = short.reduce((a, b) => (b.under > a.under ? b : a), short[0]);
  check(`floor: at the crest over every dam.json footprint (${truth.dam.map((p) => p.part).join(', ')})`,
    centres > 0 && short.length === 0,
    short.length
      ? `${short.length} of ${centres} cell centres under their crest, worst ${worst.under.toFixed(1)} m under ${worst.part} at (${worst.x}, ${worst.z}); rebuild with tools/itaipu/build_war_height.py`
      : `${centres} cell centres, none under its crestY`);
}

/* ------------------------------------------------------------- chase */

const msAt = (k) => Math.round((k * 1000) / HZ);

/*
 * One hunter from `from` after one defender whose position at room
 * seconds t is path(t). Returns the closest approach, the time of the
 * catch (or -1) and the floor's worst margins over the run.
 */
function chase(from, path, seconds) {
  const hs = new Hunters(height);
  hs.spawn(1, from, 0);
  let best = Infinity;
  let caught = -1;
  let underFloor = Infinity;
  let underClear = Infinity;
  let underGround = Infinity;
  let targets = 0;
  for (let k = 0; k <= seconds * HZ; k += 1) {
    const t = msAt(k) / 1000;
    const p = path(t);
    const q = path(t + 0.01);
    const v = [(q[0] - p[0]) / 0.01, (q[1] - p[1]) / 0.01, (q[2] - p[2]) / 0.01];
    const [h] = hs.step(msAt(k), [{ seat: 0, p, v, live: true }]);
    if (!(Math.abs(h.p[0]) < 5100 && Math.abs(h.p[2]) < 5100)) {
      throw new Error(`warhunt-check: a scenario left the hero square at ${h.p.map((c) => c.toFixed(0))}; move it`);
    }
    targets += h.target >= 0 ? 1 : 0;
    const d = Math.hypot(h.p[0] - p[0], h.p[1] - p[1], h.p[2] - p[2]);
    best = Math.min(best, d);
    const margin = h.p[1] - floorAt(h.p[0], h.p[2]);
    underFloor = Math.min(underFloor, margin);
    if (d > TERMINAL_M) {
      underClear = Math.min(underClear, margin - CLEAR_M);
    }
    if (truth) {
      underGround = Math.min(underGround, h.p[1] - truth.ground(h.p[0], h.p[2]));
    }
    if (d <= BLAST_M) {
      caught = t;
      break;
    }
  }
  return {
    best, caught, underFloor, underClear, underGround, targets, lifts: hs.lifts, liftMax: hs.liftMax,
  };
}

function caughtRow(name, r, within) {
  check(name, r.caught >= 0 && r.caught <= within,
    r.caught >= 0 ? `inside ${BLAST_M} m at ${r.caught.toFixed(2)} s, allowed ${within} s` : `closest ${r.best.toFixed(1)} m in ${within} s`);
}

function floorRow(name, r) {
  check(`${name}: never under the floor`, r.underFloor >= -1e-9, `least margin ${r.underFloor.toFixed(2)} m`);
  check(`${name}: ${CLEAR_M} m over it outside ${TERMINAL_M} m of the target`, r.underClear >= -1e-9,
    `least ${(r.underClear + CLEAR_M).toFixed(2)} m, the hard floor lifted it ${r.lifts} times, at most ${r.liftMax.toFixed(2)} m`);
  if (truth) {
    check(`${name}: never under finestAt`, r.underGround >= 0, `least ${r.underGround.toFixed(2)} m over the client's ground`);
  }
}

function chaseRows() {
  /* Over the reservoir, 280 m up (61 over the water). */
  const straight = chase([0, 280, -2600], (t) => [-400 - 25 * t, 280, -3200], 90);
  caughtRow('straight: 25 m/s away from a hunter 721 m behind', straight, 70);
  floorRow('straight', straight);

  const crossing = chase([-1200, 300, -3000], (t) => [-400, 260, -2000 - 30 * t], 90);
  caughtRow('crossing: 30 m/s across its nose from 1.3 km', crossing, 70);
  const far = chase([-1500, 300, -3500], (t) => [-400, 260, -2000 - 30 * t], 10);
  check(`out of range: no target past ${TARGET_RANGE_M} m`, far.caught < 0 && far.targets === 0, `started 1.9 km away, ${far.targets} ticks with a target`);
  /* With nobody in range it goes home and stays near it, instead of
   * flying on out of every pilot's reach for good. */
  {
    const hs = new Hunters(height);
    const home = [0, 300, -2400];
    hs.spawn(1, [-2500, 300, -3500], 0, home);
    let far2 = 0;
    let h = null;
    for (let k = 0; k <= 240 * HZ; k += 1) {
      [h] = hs.step(msAt(k), []);
      if (k >= 150 * HZ) {
        far2 = Math.max(far2, Math.hypot(h.p[0] - home[0], h.p[2] - home[2]));
      }
    }
    check(`home: with no target it flies home and circles within ${HOME_M} m and a turn of it`, far2 <= HOME_M + 2 * HUNTER_SPEED / TURN_RATE + 1,
      `2.7 km out; from 150 s to 240 s at most ${far2.toFixed(0)} m from home`);
  }

  /* A quad cruising a 60 m circle at 20 m/s turns at 0.33 rad/s. */
  const circle = (cx, cy, cz, r, s) => (t) => [cx + r * Math.cos((s * t) / r), cy, cz + r * Math.sin((s * t) / r)];
  const turning = chase([-800, 300, -3500], circle(0, 270, -3000, 60, 20), 90);
  caughtRow('turning: 20 m/s on a 60 m circle', turning, 60);
  const tight = chase([-800, 300, -3500], circle(0, 270, -3000, 25, 15), 90);
  caughtRow('turning: 15 m/s on a 25 m circle', tight, 60);

  /* East across the gorge at z = 0: the plateau at 226, the Parana at
   * 104, the far rim at 170 to 225, the defender 15 m over the floor. */
  const gorge = chase([-3000, 300, -600], (t) => {
    const x = -2600 + 20 * t;
    return [x, floorAt(x, 0) + 15, 0];
  }, 200);
  caughtRow('gorge: caught following the ground 15 m up', gorge, 200);
  floorRow('gorge', gorge);

  /* From the reservoir to the tailrace below the main dam (crest 225,
   * tailrace 104 to 120), the defender circling 20 m over it. */
  const dam = chase([0, 260, -2700], circle(0, 140, -1300, 60, 15), 120);
  caughtRow('dam: caught in the tailrace', dam, 120);
  floorRow('dam', dam);
}

/* ------------------------------------------------------- determinism */

function scene(hs, fromK, toK, trace, snap) {
  const r = rng(77);
  const centres = Array.from({ length: 8 }, () => [-3000 + 6000 * r(), 250 + 60 * r(), -4000 + 3000 * r()]);
  for (let k = fromK; k < toK; k += 1) {
    const t = msAt(k) / 1000;
    const defenders = centres.map((c, seat) => {
      const w = 0.1 + 0.03 * seat;
      const rad = 150 + 20 * seat;
      return {
        seat,
        p: [c[0] + rad * Math.cos(w * t), c[1], c[2] + rad * Math.sin(w * t)],
        v: [-rad * w * Math.sin(w * t), 0, rad * w * Math.cos(w * t)],
        live: (k + 90 * seat) % 900 > 60,
      };
    });
    const out = hs.step(msAt(k), defenders);
    if (trace) {
      trace.push(out);
    }
    if (snap && k === snap.at) {
      snap.value = JSON.stringify(hs.save());
    }
  }
}

function fresh(n) {
  const hs = new Hunters(height);
  const r = rng(12);
  for (let id = 0; id < n; id += 1) {
    hs.spawn(id, [-4000 + 8000 * r(), 300 + 100 * r(), -4500 + 4000 * r()], 0);
  }
  return hs;
}

function determinismRows() {
  const a = [];
  const b = [];
  const snap = { at: 899, value: null };
  scene(fresh(20), 0, 1800, a, snap);
  scene(fresh(20), 0, 1800, b, null);
  const ja = JSON.stringify(a);
  check('determinism: two runs, one trace', ja === JSON.stringify(b), `${a.length} ticks of 20 hunters, ${ja.length} bytes`);
  const resumed = new Hunters(height);
  resumed.restore(JSON.parse(snap.value));
  const c = [];
  scene(resumed, 900, 1800, c, null);
  check('determinism: save and restore continue it', JSON.stringify(c) === JSON.stringify(a.slice(900)), `restored at tick 900 through ${snap.value.length} bytes of JSON`);
  const moved = a[1799].filter((h, i) => h.target >= 0 && h.p.some((v, j) => v !== a[0][i].p[j])).length;
  check('determinism: the scene is not idle', moved > 0, `${moved} of 20 hunters targeting and moving at the end`);
}

/* -------------------------------------------------------------- cost */

function costRow() {
  scene(fresh(20), 0, 300, null, null);
  const seconds = 120;
  const hs = fresh(20);
  const t0 = process.cpuUsage();
  const w0 = performance.now();
  scene(hs, 0, seconds * HZ, null, null);
  const cpu = process.cpuUsage(t0);
  const wall = performance.now() - w0;
  const perSecond = (cpu.user + cpu.system) / 1000 / seconds;
  check('cost: 20 hunters x 8 defenders at 30 Hz', perSecond < ROOM_CPU_MS / 10,
    `${perSecond.toFixed(2)} ms CPU a room second (${(wall / seconds).toFixed(2)} wall), under a tenth of the room's ${ROOM_CPU_MS}`);
}

console.log(`warhunt-check: hunters at ${HUNTER_SPEED} m/s, floor from src/share/war/itaipu-height.bin`);
floorRows();
chaseRows();
determinismRows();
costRow();
console.log(failed ? `warhunt-check: ${failed} FAILED` : 'warhunt-check: all pass');
process.exit(failed ? 1 : 0);
