/*
 * swiss2-views.js: the fixed views the swiss2 photorealism loop judges.
 *
 * WHY A FIXED SET. docs/SWISS2-LOOP.md runs rounds that each claim the
 * valley looks more like a photograph. A claim like that is only worth
 * something if every round is photographed from the same places at the
 * same preset, and scored against the same real photographs, so the
 * views live here and a round that wants a different one adds it rather
 * than moving one: moving a camera would make the before and after
 * pictures of different things.
 *
 *     SIM_GPU=1 node scripts/swiss2-views.js OUT_DIR
 *
 * Writes OUT_DIR/<view>.png and OUT_DIR/stats.json (draw calls,
 * triangles and the median frame time in each view, and which reference
 * photograph each is judged against). Needs the real GPU: the default
 * CPU rasteriser cannot judge a photoreal look, and its frame times mean
 * nothing. The page's board client calls a local board; run one or the
 * console errors fail the run (see scripts/posters.js).
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

import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * Camera, look at, and the reference photograph (a name in the local
 * reference folder, see docs/SWISS2-LOOP.md). World metres, Y up. The
 * lake is centred on x 173, z 2150 with its north shore at z 1860; the
 * fall's pool is at x 827, z -1295, 190 m up, its lip 70 m above that
 * (src/maps/alps/terrain.js POOL, LIP_RISE).
 *
 * Y is absolute, not above the ground, and the floor is not at zero: it
 * rises to 5 m at the meadow and 3.4 m at the lake's north shore. Round 0
 * put meadow-eye at 1.6 and lake-shore at 3, both under the ground, and
 * scored the terrain's underside as a broken reflection. Round 1 raised
 * those two to 1.6 m above the ground under them, and every view now
 * fails the run if its camera is less than a metre above the ground.
 * Raised, lake-shore stands behind the shore's rise and sees a strip of
 * water, so round 1 also added lake-edge, at the water's edge.
 */
/*
 * Every view is taken through the title camera's 44 degree vertical lens.
 * Rounds 0 and 1 did not pin it: the parked camera kept whatever lens the
 * shell had last set, which was the title's 44 until the shell applied the
 * pilot's settings and their 100 after, part way through the run at a
 * moment that moved with the machine's load. Round 1's thirteen pictures
 * were all taken before that moment, at 44, so pinning 44 keeps them
 * comparable; a loaded run had started shooting the later views at 100.
 */
const FOV = 44;

const VIEWS = [
  { id: 'strip', cam: [0, 2, 40, 0, 3, -100], ref: 'valley-vista' },
  { id: 'vista-high', cam: [300, 260, 900, -120, 60, -400], ref: 'valley-high' },
  { id: 'cruise', cam: [0, 300, -200, 0, 80, -1500], ref: 'valley-vista-2' },
  { id: 'village-20m', cam: [-120, 22, 150, -185, 4, 112], ref: 'village' },
  { id: 'square-eye', cam: [-160, 2.2, 112, -205, 5, 118], ref: 'village' },
  { id: 'meadow-eye', cam: [60, 6.4, 300, -60, 4, 500], ref: 'barn' },
  { id: 'east-wall', cam: [100, 30, -300, 700, 150, -350], ref: 'peaks' },
  { id: 'lake-shore', cam: [193, 5, 1880, 173, 4, 2400], ref: 'lake' },
  { id: 'lake-high', cam: [420, 200, 1650, 173, 0, 2250], ref: 'lake' },
  { id: 'waterfall', cam: [650, 200, -1150, 827, 230, -1295], ref: 'waterfall' },
  { id: 'into-sun', cam: [0, 40, 0, 450, 200, 640], ref: 'valley-vista' },
  { id: 'farm-low', cam: [-40, 8, 420, -120, 4, 470], ref: 'barn' },
  { id: 'lake-edge', cam: [193, 2.2, 1985, 173, 1, 2400], ref: 'lake' },
  /* Round 6: the aircraft you fly, close. With the camera parked the shell
   * rests the craft at the spawn on the strip (x 0, z 40), nose to -z, so
   * this looks over its right shoulder from three metres behind. */
  { id: 'craft-chase', cam: [1.0, 1.1, 42.6, 0, 0.2, 39.7], ref: 'craft' },
];

/* Median of a frame's duration over sixty frames, in the page. */
const FRAME_MS = '(() => new Promise((done) => { const t = []; let last = performance.now();'
  + ' const tick = (now) => { t.push(now - last); last = now; if (t.length < 61) { requestAnimationFrame(tick); }'
  + ' else { t.shift(); t.sort((a, b) => a - b); window.__frameMs = t[30]; done(); } };'
  + ' requestAnimationFrame(tick); }))()';

const outDir = resolve(process.argv[2] || join(root, 'tmp', 'swiss2-views'));
await mkdir(outDir, { recursive: true });

const steps = [
  'until:window.__map && window.__map().id === "swiss2" && window.__map().ready',
  'eval:(document.getElementById("ui").style.display = "none", "")',
  'wait:2500',
];
for (const v of VIEWS) {
  steps.push(
    `expect:window.__heightAt(${v.cam[0]}, ${v.cam[2]}) < ${v.cam[1] - 1}`,
    `eval:(window.__setCam(${v.cam.join(',')}, ${FOV}), "")`,
    'wait:2500',
    `shot:${v.id}`,
    `eval:(${FRAME_MS}, "")`,
    'until:window.__frameMs !== undefined',
    `eval:JSON.stringify({ id: ${JSON.stringify(v.id)}, stats: window.__renderStats(), frameMs: window.__frameMs })`,
    'eval:(window.__frameMs = undefined, "")',
  );
}

const run = spawnSync('node', [
  join(root, 'scripts/shots.js'),
  `--out=${outDir}`,
  '--w=1600',
  '--h=900',
  '--graphics=high',
  '--airframe=sky1800',
  '--url=/index.html?map=swiss2',
  ...steps,
], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

process.stdout.write(run.stdout.split('\n').filter((l) => /console errors|FAIL|shot /.test(l)).join('\n') + '\n');
if (run.status !== 0) {
  process.stderr.write(run.stderr);
  throw new Error(`shots.js exited ${run.status}`);
}

/* shots.js prints each eval's value as a JSON string literal. */
const stats = [];
for (const line of run.stdout.split('\n')) {
  const m = line.match(/^eval JSON\.stringify\(\{ id: .*\) = (".*")$/);
  if (m) {
    stats.push(JSON.parse(JSON.parse(m[1])));
  }
}
const byId = Object.fromEntries(stats.map((s) => [s.id, s]));
const report = VIEWS.map((v) => ({ ...v, ...(byId[v.id] || { missing: true }) }));
await writeFile(join(outDir, 'stats.json'), JSON.stringify(report, null, 2));
console.log(`${report.filter((r) => !r.missing).length} of ${VIEWS.length} views -> ${outDir}`);
