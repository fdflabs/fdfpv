/*
 * valleys-views.js: the fixed views a look change to the two Flight Club
 * valleys is judged from, the Swiss valley (swiss2) and the Alps.
 *
 * WHY A FIXED SET. As scripts/swiss2-views.js: a change that claims a
 * valley looks better is worth something only if the before and the after
 * are taken from the same places at the same preset, so the views live
 * here, and a change that wants another angle adds one rather than moving
 * one. Both valleys are the same heightfield, so the views are shared,
 * except the fall: the Swiss valley's falls into the bay cut in the east
 * wall (src/maps/swiss2/terrain.js), the Alps' into the side valley's
 * pool (src/maps/alps/heights.js POOL).
 *
 *     SIM_GPU=1 node scripts/valleys-views.js OUT_DIR [--map=swiss2|alps] [--graphics=high]
 *
 * Writes OUT_DIR/<map>-<view>.png and OUT_DIR/<map>-stats.json (draw
 * calls, triangles and the median frame time in each view). Every camera
 * must stand a metre or more over the ground, or the run fails.
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

import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The title camera's lens, as swiss2-views.js pins it. */
const FOV = 44;

/* Camera then look at, world metres, Y up. The spawn is on the strip at
 * x 0, z 40 facing -z (src/maps/alps.js SPAWN); a casual course is laid
 * round it (src/builder/course.js casualCourse), so the race start is the
 * pilot's eye a metre and a half over the spawn, looking down the valley. */
const SHARED = [
  { id: 'spawn', cam: [6, 4, 52, 0, 1, 30] },
  { id: 'race-start', cam: [0, 1.5, 44, 0, 4, -200] },
  { id: 'overview', cam: [300, 260, 900, -120, 60, -400] },
  { id: 'cruise', cam: [0, 300, -200, 0, 80, -1500] },
  { id: 'village', cam: [-120, 22, 150, -185, 4, 112] },
  { id: 'meadow', cam: [60, 6.4, 300, -60, 4, 500] },
  { id: 'lake', cam: [420, 200, 1650, 173, 0, 2250] },
  { id: 'east-wall', cam: [100, 30, -300, 700, 150, -350] },
];
const FALLS = {
  swiss2: [
    { id: 'falls', cam: [420, 30, -1210, 846, 165, -1296] },
    /* The fall's foot from 120 m: the apron's ledges and the cascade on
     * them, which the whole-fall view sees a few pixels of. */
    { id: 'falls-foot', cam: [700, 40, -1235, 812, 40, -1295] },
  ],
  alps: [{ id: 'falls', cam: [700, 260, -1150, 1010, 230, -1295] }],
};

const FRAME_MS = '(() => new Promise((done) => { const t = []; let last = performance.now();'
  + ' const tick = (now) => { t.push(now - last); last = now; if (t.length < 61) { requestAnimationFrame(tick); }'
  + ' else { t.shift(); t.sort((a, b) => a - b); window.__frameMs = t[30]; done(); } };'
  + ' requestAnimationFrame(tick); }))()';

const arg = (name, dflt) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || `=${dflt}`).split('=')[1];
const map = arg('map', 'swiss2');
const graphics = arg('graphics', 'high');
if (!FALLS[map]) {
  throw new Error(`valleys-views: --map must be swiss2 or alps, not ${map}`);
}
const VIEWS = [...SHARED, ...FALLS[map]];
const outDir = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'tmp', 'valleys-views'));
await mkdir(outDir, { recursive: true });

const steps = [
  `until:window.__map && window.__map().id === "${map}" && window.__map().ready`,
  'eval:(document.getElementById("ui").style.display = "none", "")',
  'wait:2500',
];
for (const v of VIEWS) {
  steps.push(
    `expect:window.__heightAt(${v.cam[0]}, ${v.cam[2]}) < ${v.cam[1] - 1}`,
    `eval:(window.__setCam(${v.cam.join(',')}, ${FOV}), "")`,
    'wait:2500',
    `shot:${map}-${v.id}`,
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
  `--graphics=${graphics}`,
  '--airframe=sky1800',
  `--url=/index.html?map=${map}`,
  ...steps,
], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

process.stdout.write(run.stdout.split('\n').filter((l) => /console errors|FAIL|shot /.test(l)).join('\n') + '\n');
if (run.status !== 0) {
  process.stderr.write(run.stderr);
  throw new Error(`shots.js exited ${run.status}`);
}

const stats = [];
for (const line of run.stdout.split('\n')) {
  const m = line.match(/^eval JSON\.stringify\(\{ id: .*\) = (".*")$/);
  if (m) {
    stats.push(JSON.parse(JSON.parse(m[1])));
  }
}
const byId = Object.fromEntries(stats.map((s) => [s.id, s]));
const report = VIEWS.map((v) => ({ ...v, ...(byId[v.id] || { missing: true }) }));
await writeFile(join(outDir, `${map}-stats.json`), JSON.stringify(report, null, 2));
console.log(`${report.filter((r) => !r.missing).length} of ${VIEWS.length} ${map} views -> ${outDir}`);
