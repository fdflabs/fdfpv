/*
 * interior-views.js: the Interior's fixed views and their budget
 * (TECH-NEEDS N1 `interior:views`): survey altitude over each sector, the
 * orbit round the camp at Claro Viejo at the standoff, and the low views a
 * pilot sees close to the ground, each shot from the same place every run.
 *
 *     SIM_GPU=1 node scripts/interior-views.js OUT_DIR [--views=a,b] [--hour=17.5]
 *
 * Poses are written in MISSIONS.md's design grid (km east and north) with
 * the camera's height over the ground there, and turned into world metres
 * here through src/share/interior/frame.js and world.js, the ground the
 * page draws, so a pose never lands inside a hill.
 *
 * What it checks, and fails the run on, as scripts/itaipu-views.js does
 * for Itaipu (the same budget, its section 13):
 *
 *   ground    every camera at least a metre over the ground and every roof;
 *   solids    every camera at least NEAR_SOLID from every solid;
 *   budget    at High, at most 300 draw calls and 2.5 M triangles, and the
 *             GPU's least whole frame time under 12 ms; a view over is
 *             still shot and written, and the run fails naming it;
 *   trees     the forest drawn where the camera stands (the near and mid
 *             tiers' chunks all made), so a view is never judged on a
 *             forest still filling in;
 *   console   no page error but refused network fetches.
 *
 * Writes OUT_DIR/<view>.png and OUT_DIR/stats.json. OUT_DIR is outside the
 * repository, ~/Desktop/fdfpv-loop/interior/world/.
 *
 * Needs the real GPU, and one headless browser (tests/lib/page.js).
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

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { gridToWorld } from '../src/share/interior/frame.js';
import { makeWorld } from '../src/share/interior/world.js';
import { landEdit, PLACES } from '../src/share/interior/places.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FOV = 44;
const BUDGET = { calls: 300, triangles: 2.5e6, gpuMs: 12 };
const NEAR_SOLID = 0.5;
const FRAMES = 60;

const world = makeWorld({
  height: await readFile(join(root, 'src/share/interior/height.bin')),
  land: await readFile(join(root, 'src/share/interior/land.bin')),
  edits: landEdit,
});

/* A pose from the design grid: the camera at (e, n) h metres over the
 * ground, looking at (le, ln) lh metres over the ground there. */
function pose(e, n, h, le, ln, lh = 0) {
  const [x, z] = gridToWorld(e, n);
  const [lx, lz] = gridToWorld(le, ln);
  return [x, world.groundAt(x, z) + h, z, lx, world.groundAt(lx, lz) + lh, lz];
}

/* The camp orbit: eight poses round Claro Viejo at the standoff MISSIONS
 * M1 stage 5 sets (aircraft over 300 m and outside 400 m keep the camp
 * calm), 700 m out and 450 m up, every 45 degrees. */
const [campX, campZ] = PLACES.claroViejo.at;
const CAMP = (() => {
  const out = [];
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    const x = campX + 700 * Math.sin(a);
    const z = campZ - 700 * Math.cos(a);
    out.push({
      id: `camp-orbit-${k * 45}`,
      cam: [x, world.groundAt(campX, campZ) + 450, z, campX, world.groundAt(campX, campZ), campZ],
    });
  }
  return out;
})();

const VIEWS = [
  /* Survey altitude (TECH-NEEDS N1, M1 stage 1's 500 m and the brief's
   * 600 to 1800 m), looking ahead and down over each sector. */
  { id: 'survey-alpha-600', cam: pose(3.2, 2.6, 600, 5.4, 5.0) },
  { id: 'survey-bridge-800', cam: pose(4.4, 5.6, 800, 5.6, 7.7) },
  { id: 'survey-bravo-1000', cam: pose(7.4, 4.4, 1000, 9.3, 6.2) },
  { id: 'survey-charlie-1200', cam: pose(9.6, 6.2, 1200, 8.8, 9.2) },
  { id: 'survey-wide-1800', cam: pose(3.0, 2.0, 1800, 8.5, 8.0) },
  { id: 'survey-nadir-1800', cam: pose(8.8, 8.6, 1800, 8.8, 8.62) },
  ...CAMP,
  /* Low: the bridge from the bank, the colonia from a drone's 120 m, the
   * strip at Pista Cero from a man's height, the forest's edge on the
   * cañada, the camp's clearing from 60 m over its edge. */
  { id: 'low-bridge', cam: pose(5.9, 7.82, 14, 5.6, 7.735, 4) },
  { id: 'low-colonia', cam: pose(9.0, 5.9, 120, 9.35, 6.2) },
  { id: 'low-pista', cam: pose(2.82, 1.93, 1.8, 3.2, 2.05, 1.5) },
  { id: 'low-canada', cam: pose(9.25, 8.5, 40, 9.05, 8.9, 10) },
  { id: 'low-camp', cam: pose(8.6, 9.38, 60, 8.58, 9.455) },
  /* The camera ball's 8x (TECH-NEEDS N14), 5.5 degrees: the camp's people
   * from 600 m out at the standoff, the pair under the trees from 400 m,
   * the colonia's street from 500 m. ?people=demo has every route's
   * people out (src/maps/interior/life.js demo). */
  { id: 'zoom-camp-600', cam: [campX + 420, world.groundAt(campX, campZ) + 430, campZ + 40, campX, world.groundAt(campX, campZ) + 1, campZ], fov: 5.5 },
  { id: 'zoom-colonia-500', cam: pose(9.2, 5.75, 300, 9.35, 6.16), fov: 5.5 },
  { id: 'zoom-motorcycle-400', cam: pose(8.4, 5.7, 260, 8.6, 6.1), fov: 8 },
];

const opts = { views: '', hour: '' };
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
  throw new Error('interior-views: run with SIM_GPU=1; a software rasteriser can neither judge the look nor time the GPU');
}
if (!positional[0]) {
  throw new Error('interior-views: name the output folder, outside the repository');
}
const outDir = resolve(positional[0]);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`interior-views: ${outDir} is inside the repository; renders go outside it`);
}
const wanted = opts.views ? opts.views.split(',') : VIEWS.map((v) => v.id);
const unknown = wanted.filter((id) => !VIEWS.some((v) => v.id === id));
if (unknown.length) {
  throw new Error(`interior-views: no view ${unknown.join(', ')}`);
}
await mkdir(outDir, { recursive: true });

const INSTALL = /* js */ `(() => {
  const gl = document.getElementById('view').getContext('webgl2');
  const ext = gl && gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) { throw new Error('no EXT_disjoint_timer_query_webgl2'); }
  const T = { on: false, open: false, pending: [], frames: new Map(), stamps: [] };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (!T.on || T.open) { return cb(t); }
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    T.open = true;
    try { return cb(t); } finally {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      T.open = false;
      T.pending.push([t, q]);
      if (T.stamps[T.stamps.length - 1] !== t) { T.stamps.push(t); }
    }
  });
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  window.__interiorGpu = async (n) => {
    T.frames = new Map();
    T.stamps = [];
    T.on = true;
    await new Promise((done) => { const tick = () => (T.stamps.length > n ? done() : raf(tick)); raf(tick); });
    T.on = false;
    for (let tries = 0; T.pending.some(([, q]) => !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)); tries += 1) {
      if (tries > 500) { throw new Error('timer queries never became available'); }
      await new Promise((done) => setTimeout(done, 20));
    }
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    for (const [t, q] of T.pending) {
      T.frames.set(t, (T.frames.get(t) || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    T.pending = [];
    const gpu = [...T.frames.values()];
    const gaps = T.stamps.slice(1).map((t, k) => t - T.stamps[k]);
    return { disjoint, frames: gpu.length, gpuMs: median(gpu), gpuLeastMs: Math.min(...gpu), frameMs: median(gaps) };
  };
  return true;
})()`;

/* Until the terrain has built what the camera asks for and the trees'
 * chunks are all made. */
async function settle(page) {
  for (let k = 0; k < 2; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    await page.until(`(() => { const u = window.__mapScene().userData.interior;
      const t = u.terrain.stats(); const tr = u.trees.stats();
      return t.queuedBuilds === 0 && !u.terrain.job && tr.pending === 0; })()`, 120000);
  }
}

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'bramor2300');
const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the run would shoot the wrong preset, and the check below says so. */ }`];

const page = await openPage({
  root, width: 1600, height: 900, url: `/index.html?map=interior&people=demo${opts.hour ? `&hour=${opts.hour}` : ''}`, seed,
});
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
const report = [];
try {
  try {
    await page.until('window.__map && window.__map().id === "interior" && window.__map().ready', 180000);
  } catch (e) {
    console.error(page.errors.slice(-12).join('\n'));
    throw e;
  }
  const graphics = await page.evaluate('window.__map().graphics');
  if (graphics !== 'high') {
    throw new Error(`interior-views: the map was built at ${graphics}, not high`);
  }
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  await page.evaluate(INSTALL);
  const renderer = await page.evaluate(`(() => { const g = document.getElementById('view').getContext('webgl2');
    return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); })()`);
  console.log(`renderer: ${renderer}`);
  for (const v of VIEWS.filter((w) => wanted.includes(w.id))) {
    const [x, y, z] = v.cam;
    const ground = await page.evaluate(`window.__heightAt(${x}, ${z})`);
    if (!(ground < y - 1)) {
      fail(`${v.id}: the camera at y ${y.toFixed(1)} is within a metre of the ground, ${ground} under it`);
      continue;
    }
    await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${v.fov || FOV}), "")`);
    await settle(page);
    await page.sleep(2500);
    const gap = await page.evaluate(`window.__nearSolid(${x}, ${y}, ${z}, 20)`);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(outDir, `${v.id}.png`), Buffer.from(data, 'base64'));
    const stats = await page.evaluate('window.__renderStats()');
    const trees = await page.evaluate('window.__mapScene().userData.interior.trees.stats()');
    const gpu = await page.evaluate(`window.__interiorGpu(${FRAMES})`);
    const row = {
      ...v, stats, trees, frameMs: gpu.frameMs, gpuMs: gpu.gpuMs, gpuLeastMs: gpu.gpuLeastMs, gpuDisjoint: gpu.disjoint,
      clearance: { ground: y - ground, solid: gap },
    };
    const over = [];
    if (stats.calls > BUDGET.calls) {
      over.push(`${stats.calls} calls`);
    }
    if (stats.triangles > BUDGET.triangles) {
      over.push(`${(stats.triangles / 1e6).toFixed(2)} M triangles`);
    }
    if (gpu.disjoint || !(gpu.gpuLeastMs < BUDGET.gpuMs)) {
      over.push(gpu.disjoint ? 'GPU time disjoint' : `${gpu.gpuLeastMs.toFixed(1)} ms GPU`);
    }
    row.over = over;
    report.push(row);
    console.log(`shot ${v.id.padEnd(20)} ${String(stats.calls).padStart(4)} calls ${(stats.triangles / 1e6).toFixed(2)} M tris `
      + `gpu ${gpu.gpuMs.toFixed(1)} (least ${gpu.gpuLeastMs.toFixed(1)}) ms  crowns ${trees.near}+${trees.mid} points ${trees.far} `
      + `clear ${(y - ground).toFixed(1)} m${Number.isFinite(gap) ? `, solid ${gap.toFixed(1)} m` : ''}`);
    if (Number.isFinite(gap) && gap < NEAR_SOLID) {
      fail(`${v.id}: the camera is ${gap.toFixed(2)} m from a solid, under ${NEAR_SOLID}`);
    }
    if (over.length) {
      fail(`${v.id}: over the budget: ${over.join(', ')}`);
    }
  }
  const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
  for (const e of real) {
    fail(`console: ${e}`);
  }
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await page.close();
}

await writeFile(join(outDir, 'stats.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.length} of ${wanted.length} views -> ${outDir}`);
if (failures.length) {
  console.error(`FAIL, ${failures.length} problem(s)`);
  process.exitCode = 1;
} else {
  console.log('PASS, every camera clear of the ground and every solid, every view within the budget');
}
