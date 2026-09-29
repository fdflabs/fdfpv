/*
 * itaipu-views.js: the fixed views the Itaipu photorealism loop judges
 * (docs/ITAIPU-LOOP.md, docs/ITAIPU-PLAN.md section 12).
 *
 * WHY A FIXED SET. As scripts/swiss2-views.js for the Swiss valley: a
 * round that claims the dam looks more like a photograph is worth
 * something only if every round is photographed from the same places at
 * the same preset and scored against the same photographs, so the views
 * live here and a round that wants another angle adds one rather than
 * moving one.
 *
 *     SIM_GPU=1 node scripts/itaipu-views.js OUT_DIR [--views=aerial-dam,chute]
 *
 * Writes OUT_DIR/<view>.png and OUT_DIR/stats.json: per view its camera,
 * its reference photograph (a name in ~/Desktop/fdfpv-photoref/itaipu,
 * never in this repository), the frame's draw calls and triangles, the
 * median time between animation frames, the GPU's time for the whole
 * frame and the camera's clearance, each budget of section 13 beside what
 * the view spends. OUT_DIR is a round's folder outside the repository,
 * ~/Desktop/fdfpv-loop/itaipu/round-N.
 *
 * What it checks, and fails the run on:
 *
 *   ground    every camera at least a metre above __heightAt, the ground,
 *             the water and every roof record under it (swiss2's round 0
 *             scored two cameras inside a hill as broken reflections);
 *   solids    every camera at least NEAR_SOLID from every solid, static
 *             and streamed, once the streamed set has refilled round it
 *             (the parked camera is what the map streams round);
 *   budget    section 13 at High: at most 300 draw calls and 2.5 M
 *             triangles, and the GPU's least whole frame time under
 *             12 ms. A view over budget is still shot and written, and
 *             the run fails naming it;
 *   console   no page error but refused network fetches (no board runs
 *             here, see scripts/posters.js).
 *
 * THE GPU TIME. The whole frame the shell draws, timed with WebGL's timer
 * queries (EXT_disjoint_timer_query_webgl2) round every animation frame
 * callback, over FRAMES frames: the median and the least. The least is
 * the frame with the least of the desktop's own drawing in it, and is an
 * upper bound on scripts/swiss2-perf.js's floor measure (the sum of each
 * pass's least), so a view under 12 ms here is under it there. The
 * median is what the shared card gave while the view was shot.
 *
 * Needs the real GPU: a software rasteriser cannot judge a photoreal look
 * and its timings mean nothing. One headless browser, through
 * tests/lib/page.js, which mutes the page's audio.
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

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Every view through the title camera's 44 degree vertical lens, as
 * swiss2's (see FOV in scripts/swiss2-views.js for why it is pinned). */
const FOV = 44;

/*
 * Camera x, y, z, look at x, y, z (world metres, Y up: section 2, x east,
 * z south, y above EGM2008 with no offset), and the reference photograph
 * each is judged against. Y is absolute. Where the plan's table gives a
 * height over the ground, the ground under the camera was read with
 * __heightAt on data v2 and the sum written here; a later data build that
 * raises the ground there fails the ground check rather than moving the
 * view. The poses start from section 12's table and were matched to each
 * photograph in round 0 by rendering and comparing; what was moved and
 * why is in docs/ITAIPU-LOOP.md.
 */
const VIEWS = [
  { id: 'aerial-dam', cam: [900, 800, -1150, -400, 150, -2300], ref: 'aerial-dam' },
  { id: 'aerial-dam-wide', cam: [300, 800, 200, -700, 180, -1300], ref: 'aerial-dam-2' },
  { id: 'aerial-spill', cam: [-1300, 704, 900, -982, 210, -1028], ref: 'aerial-spill' },
  { id: 'spill-gates-high', cam: [-800, 290, -900, -982, 215, -1028], ref: 'aerial-spill-2' },
  { id: 'leftbank-high', cam: [900, 700, 300, -300, 180, -1500], ref: 'aerial-leftbank' },
  { id: 'rockfill-high', cam: [500, 650, -2000, 1800, 200, -700], ref: 'aerial-rockfill' },
  { id: 'dam-downstream', cam: [225, 184.2, -1059, 58, 165, -1640], ref: 'dam-downstream' },
  { id: 'dam-downstream-2', cam: [520, 165.5, -1285, -200, 150, -1650], ref: 'dam-downstream-2' },
  { id: 'powerhouse', cam: [500, 215, -1300, -200, 140, -1660], ref: 'powerhouse' },
  { id: 'canyon', cam: [225, 215, -1059, -700, 110, 0], ref: 'canyon' },
  { id: 'river-below', cam: [-1400, 190, 1000, -1800, 104, 4000], ref: 'river-below' },
  { id: 'chute', cam: [-974, 231, -1005, -800, 150, -500], ref: 'chute-running' },
  { id: 'spill-gates', cam: [-931.6, 205, -886.7, -982, 212, -1028], ref: 'spill-gates' },
  { id: 'spill-plume', cam: [-700, 106.5, -200, -820, 150, -560], ref: 'spill-plume' },
  { id: 'penstocks', cam: [500, 149.7, -1560, -300, 150, -1680], ref: 'penstocks' },
  { id: 'crest-road', cam: [-100, 226.7, -1784, 600, 224, -1625], ref: 'crest-road' },
  { id: 'rockfill-road', cam: [1370, 176.5, -1150, 928, 185, -1556], ref: 'rockfill-road' },
  { id: 'reservoir-dam', cam: [100, 221, -3000, 59, 222, -1746], ref: 'reservoir-dam' },
  { id: 'reservoir-shore', cam: [-4160, 222.7, -3000, -3400, 219.5, -3700], ref: 'reservoir-shore' },
  { id: 'powerlines', cam: [-599, 207.5, -1231, -796, 195, -1457], ref: 'powerlines' },
  { id: 'reservoir-forest', cam: [-2400, 560, -2900, -3600, 225, -4100], ref: 'reservoir-forest-aerial' },
  { id: 'craft-chase', cam: [2142.0, 226.1, -181.8, 2144.35, 225.2, -179.84], ref: 'craft' },
  /* Not a photograph's: the view west of the right bank switchyard that
   * PR #199 measured over the 300 call budget at 303 before the yard,
   * 310 with it (tools/itaipu/war-check.js yard-west: 560 m west, 120 m
   * north and 60 m over the yard's middle, its 60 degree lens). Judged on
   * its budget only, not scored: no photograph was taken there, and the
   * sheet pairs it with powerlines because tools/swiss2-loop/sheet.py
   * wants one. */
  { id: 'yard-west', cam: [-2705.6, 286.4, -551.9, -2145.6, 226.4, -431.9], fov: 60, ref: 'powerlines' },
];

/* Section 13, at High. */
const BUDGET = { calls: 300, triangles: 2.5e6, gpuMs: 12 };
/* A camera nearer a solid than this sees its inside through the near
 * plane or stands in it. */
const NEAR_SOLID = 0.5;
const FRAMES = 60;

const opts = { views: '' };
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
  throw new Error('itaipu-views: run with SIM_GPU=1; a software rasteriser can neither judge the look nor time the GPU');
}
if (!positional[0]) {
  throw new Error('itaipu-views: name the round\'s folder, ~/Desktop/fdfpv-loop/itaipu/round-N; renders never go into the repository');
}
const outDir = resolve(positional[0]);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`itaipu-views: ${outDir} is inside the repository; renders go outside it`);
}
const wanted = opts.views ? opts.views.split(',') : VIEWS.map((v) => v.id);
const unknown = wanted.filter((id) => !VIEWS.some((v) => v.id === id));
if (unknown.length) {
  throw new Error(`itaipu-views: no view ${unknown.join(', ')}`);
}
await mkdir(outDir, { recursive: true });

/*
 * The in page half: every animation frame callback inside a timer query,
 * while `on`, and the queries read back as they become available. WebGL
 * has one TIME_ELAPSED query open at a time and a frame runs several
 * callbacks, so a callback that starts while one is open is not wrapped;
 * the callbacks of one frame share its timestamp and their times add.
 */
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
  window.__itaipuGpu = async (n) => {
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

/* Until the terrain has built what the camera asks for and the streamed
 * colliders have refilled round it: the terrain as scripts/itaipu-check.js
 * settles it, then the streamer idle (it logs a slice each frame of a
 * refill) for ten frames running. */
async function settle(page) {
  for (let k = 0; k < 2; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    await page.until('(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()', 120000);
  }
  await page.until(`(() => {
    const s = window.__mapScene().userData.itaipu.stream;
    const now = s.refills + ':' + s.lastSlicesMs.length;
    const f = window.__boot().frames;
    if (window.__sk !== now) { window.__sk = now; window.__sf = f; }
    return f > window.__sf + 10;
  })()`, 120000);
}

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

/* The plane on the rockfill crest's spawn for craft-chase, as swiss2 seats
 * one on its strip. */
const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'sky1800');
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
  root, width: 1600, height: 900, url: '/index.html?map=itaipu', seed,
});
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
const report = [];
try {
  await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
  const graphics = await page.evaluate('window.__map().graphics');
  if (graphics !== 'high') {
    throw new Error(`itaipu-views: the map was built at ${graphics}, not high`);
  }
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  await page.evaluate(INSTALL);
  const renderer = await page.evaluate(`(() => { const g = document.getElementById('view').getContext('webgl2');
    return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); })()`);
  console.log(`renderer: ${renderer}`);
  /* The aircraft at the plane's spawn on the rockfill crest, at rest, so
   * every view sees it where craft-chase frames it rather than wherever
   * the title's flight left it when the camera was parked. */
  const spawn = await page.evaluate('window.__map().spawn');
  await page.evaluate(`window.__crashThrow({ x: ${spawn.x}, y: ${spawn.y + 0.5}, z: ${spawn.z}, yaw: ${(spawn.yaw * 180) / Math.PI}, fresh: true })`);
  await page.until('window.__ground().landed', 30000);
  await page.sleep(2500);

  for (const v of VIEWS.filter((w) => wanted.includes(w.id))) {
    const [x, y, z] = v.cam;
    const ground = await page.evaluate(`window.__heightAt(${x}, ${z})`);
    if (!(ground < y - 1)) {
      fail(`${v.id}: the camera at y ${y} is within a metre of the ground, ${ground} under it`);
      continue;
    }
    await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${v.fov || FOV}), "")`);
    await settle(page);
    /* The meter and the shadows settle on the new picture. */
    await page.sleep(2500);
    const gap = await page.evaluate(`window.__nearSolid(${x}, ${y}, ${z}, 20)`);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(outDir, `${v.id}.png`), Buffer.from(data, 'base64'));
    const stats = await page.evaluate('window.__renderStats()');
    const gpu = await page.evaluate(`window.__itaipuGpu(${FRAMES})`);
    const row = {
      ...v,
      stats,
      frameMs: gpu.frameMs,
      gpuMs: gpu.gpuMs,
      gpuLeastMs: gpu.gpuLeastMs,
      gpuFrames: gpu.frames,
      gpuDisjoint: gpu.disjoint,
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
    console.log(`shot ${v.id.padEnd(18)} ${String(stats.calls).padStart(4)} calls ${(stats.triangles / 1e6).toFixed(2)} M tris `
      + `gpu ${gpu.gpuMs.toFixed(1)} (least ${gpu.gpuLeastMs.toFixed(1)}) ms frame ${gpu.frameMs.toFixed(1)} ms `
      + `clear ${(y - ground).toFixed(1)} m ground, ${Number.isFinite(gap) ? `${gap.toFixed(1)} m` : 'no solid within 20 m'}`);
    if (Number.isFinite(gap) && gap < NEAR_SOLID) {
      fail(`${v.id}: the camera is ${gap.toFixed(2)} m from a solid, under ${NEAR_SOLID}`);
    }
    if (over.length) {
      fail(`${v.id}: over section 13's budget: ${over.join(', ')}`);
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
  console.log('PASS, every camera clear of the ground and every solid, every view within section 13');
}
