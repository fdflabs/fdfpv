/*
 * look-views.js: three fixed views of each of the four worlds, for judging
 * a change to the shared renderer (sky, air, water, light, the grade)
 * before and after, every world from the same places at the same preset.
 *
 *     SIM_GPU=1 node scripts/look-views.js OUT_DIR [--worlds=alps,itaipu] [--graphics=high]
 *
 * The worlds' own loops (scripts/swiss2-views.js, itaipu-views.js,
 * interior-views.js) judge one world against its photographs from many
 * views; a change to the shared chain moves all four at once, and this is
 * the one set that shows all four side by side. Each view is a far one
 * (the air and the horizon), a water one and one toward the sun's side or
 * at eye level, chosen from the worlds' own fixed views where they have
 * them so a picture here can be laid beside theirs.
 *
 * Writes OUT_DIR/<world>-<view>.png and OUT_DIR/stats.json (each view's
 * camera, draw calls and triangles). OUT_DIR is outside the repository.
 * Fails the run on a camera within a metre of the ground and on any page
 * error but a refused fetch.
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

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { gridToWorld } from '../src/share/interior/frame.js';
import { makeWorld } from '../src/share/interior/world.js';
import { landEdit } from '../src/share/interior/places.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FOV = 44;

const interior = makeWorld({
  height: await readFile(join(root, 'src/share/interior/height.bin')),
  land: await readFile(join(root, 'src/share/interior/land.bin')),
  edits: landEdit,
});
/* scripts/interior-views.js's pose: the design grid's km, heights over
 * the ground. */
function pose(e, n, h, le, ln, lh = 0) {
  const [x, z] = gridToWorld(e, n);
  const [lx, lz] = gridToWorld(le, ln);
  return [x, interior.groundAt(x, z) + h, z, lx, interior.groundAt(lx, lz) + lh, lz];
}

/* Camera then look at, world metres, Y up. The alps share the Swiss
 * valley's floor plan (the strip at x 0, z 40), so their views are the
 * valley's strip, vista and lake, which the alps' cel look draws too. */
const WORLDS = {
  alps: [
    { id: 'strip', cam: [0, 2, 40, 0, 3, -100] },
    { id: 'vista-high', cam: [300, 260, 900, -120, 60, -400] },
    { id: 'into-sun', cam: [0, 40, 0, 450, 200, 640] },
  ],
  swiss2: [
    { id: 'vista-high', cam: [300, 260, 900, -120, 60, -400] },
    { id: 'lake-high', cam: [420, 200, 1650, 173, 0, 2250] },
    { id: 'into-sun', cam: [0, 40, 0, 450, 200, 640] },
  ],
  itaipu: [
    { id: 'aerial-dam', cam: [900, 800, -1150, -400, 150, -2300] },
    { id: 'river-below', cam: [-1400, 190, 1000, -1800, 104, 4000] },
    { id: 'reservoir-forest', cam: [-2400, 560, -2900, -3600, 225, -4100] },
  ],
  interior: [
    { id: 'survey-wide-1800', cam: pose(3.0, 2.0, 1800, 8.5, 8.0) },
    { id: 'low-canada', cam: pose(9.25, 8.5, 40, 9.05, 8.9, 10) },
    { id: 'low-colonia', cam: pose(9.0, 5.9, 120, 9.35, 6.2) },
  ],
};

const opts = { worlds: Object.keys(WORLDS).join(','), graphics: 'high' };
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.*)$/);
  if (m) {
    opts[m[1]] = m[2];
  } else {
    positional.push(a);
  }
}
if (process.env.SIM_GPU !== '1') {
  throw new Error('look-views: run with SIM_GPU=1; a software rasteriser cannot judge the look');
}
if (!positional[0]) {
  throw new Error('look-views: name the output folder, outside the repository');
}
const outDir = resolve(positional[0]);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`look-views: ${outDir} is inside the repository; renders go outside it`);
}
const worlds = opts.worlds.split(',');
const unknown = worlds.filter((w) => !WORLDS[w]);
if (unknown.length) {
  throw new Error(`look-views: no world ${unknown.join(', ')}`);
}
await mkdir(outDir, { recursive: true });

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'bramor2300');
const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = ${JSON.stringify(opts.graphics)};
    s.graphicsAuto = false;
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the preset check below says so. */ }`];

/* Until the world's streamed terrain (Itaipu's, the Interior's) has built
 * what the camera asks for; the valleys build theirs whole. */
const STREAMED = `(() => { const u = window.__mapScene().userData; const w = u.itaipu || u.interior;
  if (!w || !w.terrain) { return true; }
  const t = w.terrain.stats(); return t.queuedBuilds === 0 && !w.terrain.job; })()`;

async function settle(page) {
  for (let k = 0; k < 2; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    await page.until(STREAMED, 120000);
  }
}

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};
const report = [];

for (const world of worlds) {
  const page = await openPage({ root, width: 1600, height: 900, url: `/index.html?map=${world}`, seed });
  try {
    await page.until(`window.__map && window.__map().id === "${world}" && window.__map().ready`, 300000);
    const graphics = await page.evaluate('window.__map().graphics');
    if (graphics !== opts.graphics) {
      throw new Error(`look-views: ${world} was built at ${graphics}, not ${opts.graphics}`);
    }
    await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
    for (const v of WORLDS[world]) {
      const [x, y, z] = v.cam;
      const ground = await page.evaluate(`window.__heightAt(${x}, ${z})`);
      if (!(ground < y - 1)) {
        fail(`${world}-${v.id}: the camera at y ${y.toFixed(1)} is within a metre of the ground, ${ground} under it`);
        continue;
      }
      await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${FOV}), "")`);
      await settle(page);
      await page.sleep(2500);
      const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
      await writeFile(join(outDir, `${world}-${v.id}.png`), Buffer.from(data, 'base64'));
      const stats = await page.evaluate('window.__renderStats()');
      report.push({ world, ...v, graphics, stats });
      console.log(`shot ${world}-${v.id} ${stats.calls} calls ${(stats.triangles / 1e6).toFixed(2)} M tris`);
    }
    const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      fail(`${world} console: ${e}`);
    }
  } finally {
    await page.close();
  }
}

await writeFile(join(outDir, 'stats.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.length} views -> ${outDir}`);
if (failures.length) {
  console.error(`FAIL, ${failures.length} problem(s)`);
  process.exitCode = 1;
}
