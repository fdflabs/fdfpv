/*
 * yellowstone-thermal-selftest.js: the parts of Yellowstone's thermal
 * features and water that need no browser, checked under Node.
 *
 *   node scripts/yellowstone-thermal-selftest.js [dataDir]
 *
 * 1. thermal.json and hydro.json read in the contract's format: the
 *    fixtures in tests/fixtures/yellowstone always, and the real files in
 *    dataDir (default ~/Desktop/fdfpv-yellowstone-data) when they exist,
 *    every entry placed or refused with a reason, with counts.
 * 2. The drape grid lies exactly on the ground: every triangle of a 10, 5
 *    and 2 m grid, sampled inside, against ground drawn at 10 m (a hero
 *    tile) and at 30 m (level 0), is on it to a millimetre.
 * 3. A river's corridor holds all of its water: points across the channel
 *    at random fall in a cell of the corridor, and the signed distance the
 *    shader cuts the banks from is right at the centre and the edges.
 * 4. The geyser schedules: deterministic, in order, Old Faithful's column
 *    in 32 to 56 m and its mean interval about 92 minutes, the demo
 *    interval compressing the wait.
 *
 * Exit code 1 on any failure.
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
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readThermal, basinPlumes } from '../src/maps/yellowstone/thermal/catalog.js';
import { CellSet, buildCells, triangleHeight, ORIGIN } from '../src/maps/yellowstone/thermal/grid.js';
import { makeSchedule, STYLES, DEMO_INTERVALS } from '../src/maps/yellowstone/thermal/schedule.js';
import { readHydro, riverCorridor, inLake } from '../src/maps/yellowstone/water/hydro.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = process.argv[2] ?? join(homedir(), 'Desktop', 'fdfpv-yellowstone-data');
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) {
    failed += 1;
  }
};

/* 1. The data. */
async function readPair(dir, label) {
  const tj = JSON.parse(await readFile(join(dir, label === 'fixtures' ? 'thermal-sample.json' : 'thermal.json'), 'utf8'));
  const hj = JSON.parse(await readFile(join(dir, label === 'fixtures' ? 'hydro-sample.json' : 'hydro.json'), 'utf8'));
  const t0 = performance.now();
  const cat = readThermal(tj);
  const hydro = readHydro(hj);
  const ms = performance.now() - t0;
  const c = cat.counts;
  console.log(`${label}: thermal read ${c.read}, placed ${c.placed}, heroes named ${c.heroes} (+${c.heroesFromTable} from the table), kinds ${JSON.stringify(c.kinds)}, refused ${JSON.stringify(c.refused)}`);
  console.log(`${label}: ${cat.regions.size} regions hold features, ${basinPlumes(cat.features).length} basin plumes`);
  console.log(`${label}: hydro ${JSON.stringify(hydro.counts)}; read in ${ms.toFixed(0)} ms`);
  const refusedT = Object.values(c.refused).reduce((a, b) => a + b, 0);
  check(c.placed + refusedT + c.heroes === c.read, `${label}: every thermal entry is placed, a hero, or refused with a reason (${c.placed} + ${c.heroes} + ${refusedT} = ${c.read})`);
  check(c.placed > 0 && hydro.counts.rivers > 0 && hydro.counts.lakes > 0, `${label}: features, rivers and lakes all present`);
  let inRegion = 0;
  for (const list of cat.regions.values()) {
    inRegion += list.length;
  }
  check(inRegion === c.placed, `${label}: every placed feature is in exactly one region (${inRegion})`);
  return { cat, hydro };
}

const fixtures = await readPair(join(root, 'tests', 'fixtures', 'yellowstone'), 'fixtures');
check(JSON.stringify(fixtures.cat.counts.refused) === JSON.stringify({ 'no x or z': 1, 'unknown kind volcano': 1, 'outside the extent': 1 }), 'fixtures: the three bad rows are refused for the right reasons');
check(fixtures.hydro.counts.refused['river of one point'] === 1 && fixtures.hydro.counts.refused['lake without a surface y'] === 1, 'fixtures: the bad river and lake are refused');
const lake = fixtures.hydro.lakes.find((l) => l.name === 'Yellowstone Lake');
check(inLake(lake, 11718, 18939), 'Yellowstone Lake holds the contract\'s lake centre (11718, 18939)');
check(!inLake(lake, 12100, 25050), 'an island (a hole) is not lake');
if (existsSync(join(dataDir, 'thermal.json')) && existsSync(join(dataDir, 'hydro.json'))) {
  await readPair(dataDir, 'real data');
} else {
  console.log(`real data: not in ${dataDir} yet; only the fixtures were read`);
}

/* 2. The drape. A rolling analytic ground sampled on the contract's grid. */
const analytic = (x, z) => 40 + 6 * Math.sin(x / 37) * Math.cos(z / 53) + 3 * Math.sin((x + z) / 19) + 0.02 * x;
for (const cell of [10, 30]) {
  const sample = (i, j) => analytic(ORIGIN + i * cell, ORIGIN + j * cell);
  const ground = (x, z) => triangleHeight(sample, cell, x, z);
  for (const step of [10, 5, 2]) {
    if (step > cell) {
      continue;
    }
    const set = new CellSet(step);
    set.addBox(-27300, 17100, -27100, 17300);
    const built = buildCells(set, (x, z) => ground(x, z));
    let worst = 0;
    const p = built.position;
    const idx = built.index;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      for (const [u, v] of [[1 / 3, 1 / 3], [0.1, 0.8], [0.8, 0.1], [0.45, 0.45], [0.05, 0.05]]) {
        const w = 1 - u - v;
        const x = p[a * 3] * w + p[b * 3] * u + p[c * 3] * v;
        const y = p[a * 3 + 1] * w + p[b * 3 + 1] * u + p[c * 3 + 1] * v;
        const z = p[a * 3 + 2] * w + p[b * 3 + 2] * u + p[c * 3 + 2] * v;
        worst = Math.max(worst, Math.abs(y - ground(x, z)));
      }
    }
    check(worst < 0.001, `drape of ${step} m on ${cell} m ground: ${built.triangles} triangles, worst gap ${(worst * 1000).toFixed(3)} mm`);
  }
}
{
  /* And the reason the grid is needed: a 7 m grid does not refine a 30 m
   * one. The step is refused. */
  let refused = false;
  try {
    new CellSet(7);
  } catch (e) {
    refused = true;
  }
  check(refused, 'a drape step that does not divide 10 m is refused');
}

/* 3. The rivers. */
{
  const rivers = fixtures.hydro.rivers;
  const box = { x0: -34640, z0: 15760, x1: -26960, z1: 23440 };
  const corridor = riverCorridor(rivers, box, 10);
  let rng = 12345;
  const rand = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  let tried = 0;
  let missing = 0;
  let worstCentre = 0;
  for (const r of rivers) {
    for (let i = 1; i < r.points.length; i += 1) {
      const a = r.points[i - 1];
      const b = r.points[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      for (let k = 0; k < 200; k += 1) {
        const t = rand();
        const w = a.w + (b.w - a.w) * t;
        const off = (rand() * 2 - 1) * w / 2;
        const x = a.x + (b.x - a.x) * t + nx * off;
        const z = a.z + (b.z - a.z) * t + nz * off;
        if (x < box.x0 || x >= box.x1 || z < box.z0 || z >= box.z1) {
          continue;
        }
        tried += 1;
        const key = corridor.set.index(x) * 1048576 + corridor.set.index(z);
        if (!corridor.set.cells.has(key)) {
          missing += 1;
        }
        /* Its own channel's signed distance: where a creek joins, the
         * creek's water is nearer and rightly wins. */
        const across = corridor.across(x, z);
        if (across.river === r) {
          worstCentre = Math.max(worstCentre, Math.abs(Math.abs(across.v) - Math.abs(off) / (w / 2)));
        }
      }
    }
  }
  check(tried > 500 && missing === 0, `river corridor holds every sampled point of water: ${tried} points, ${missing} outside`);
  check(worstCentre < 0.02, `the signed distance across the channel is the true one (worst error ${worstCentre.toFixed(4)} of the half width)`);
  console.log(`rivers in the Old Faithful region: ${corridor.set.size} cells, ${corridor.segments} segments`);
}

/* 4. The schedules. */
{
  const of = makeSchedule('old-faithful', { seed: 1870 });
  const a = of.at(12345.6);
  const b = of.at(12345.6);
  check(JSON.stringify(a) === JSON.stringify(b), 'a schedule is a pure function of the clock');
  let starts = [];
  let t = 0;
  for (let k = 0; k < 200; k += 1) {
    t = of.nextStart(t) + 1;
    starts.push(t - 1);
  }
  const gaps = starts.slice(1).map((s, k) => s - starts[k]);
  const mean = gaps.reduce((p, q) => p + q, 0) / gaps.length;
  check(gaps.every((g) => g > 0), 'eruption starts are in order');
  check(Math.abs(mean / 60 - 92) < 3, `Old Faithful's mean interval ${(mean / 60).toFixed(1)} min (published 92)`);
  let peakLo = Infinity;
  let peakHi = 0;
  for (const s of starts.slice(0, 60)) {
    let top = 0;
    for (let dt = 0; dt < 60; dt += 0.5) {
      top = Math.max(top, of.at(s + dt).height);
    }
    peakLo = Math.min(peakLo, top);
    peakHi = Math.max(peakHi, top);
  }
  check(peakLo >= 32 * 0.9 && peakHi <= 56, `Old Faithful's columns ${peakLo.toFixed(1)} to ${peakHi.toFixed(1)} m (published 32 to 56)`);
  const s0 = starts[5];
  const phases = [-100, -20, 10, 40].map((dt) => of.at(s0 + dt).phase);
  check(phases[0] === 'splash' && phases[1] === 'splash' && phases[2] === 'erupt', `phases before and after a start: ${phases.join(', ')}`);
  of.setInterval(DEMO_INTERVALS['old-faithful']);
  starts = [];
  t = 0;
  for (let k = 0; k < 20; k += 1) {
    t = of.nextStart(t) + 1;
    starts.push(t - 1);
  }
  const demoMean = (starts[19] - starts[0]) / 19;
  check(Math.abs(demoMean - DEMO_INTERVALS['old-faithful']) < 30, `demo interval ${demoMean.toFixed(0)} s (asked ${DEMO_INTERVALS['old-faithful']})`);
  for (const name of Object.keys(STYLES)) {
    const s = makeSchedule(name, { seed: 3 });
    const n = s.nextStart(0);
    let top = 0;
    for (let dt = -1; dt < 1500; dt += 1) {
      top = Math.max(top, s.at(n + dt).height);
    }
    check(top > 0 && top <= STYLES[name].height[1], `${name}: erupts, top ${top.toFixed(1)} m (style up to ${STYLES[name].height[1]})`);
  }
}

console.log(failed ? `${failed} FAILED` : 'all passed');
process.exitCode = failed ? 1 : 0;
