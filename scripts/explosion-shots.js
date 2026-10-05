/*
 * explosion-shots.js: the war's explosions photographed at Itaipu, for a
 * before and after of src/render/explosion.js.
 *
 *     SIM_GPU=1 node scripts/explosion-shots.js OUT_DIR [--procedural] [--views=air,intake]
 *
 * Each view parks the camera, throws one explosion through the war's own
 * layer at each age in AGES and steps it once, so the frame photographed
 * is that instant (scripts/loading-art.js places its booms the same way).
 * --procedural keeps the flipbook from loading, so the layer draws the
 * puffs it draws while the sheet is on its way: the look before the
 * flipbook, and the proof that a sheet that never arrives still leaves an
 * explosion in the sky.
 *
 * The views:
 *   air      a warhead (size 1.6) 45 m over the dam's crest at intake 9,
 *            from 220 m downstream, the dam's face below it
 *   intake   an attacker reaching intake 9 (size 2.6, main.js
 *            WAR_IMPACT_SIZE), from 150 m out over the reservoir
 *   far      the air one from about a kilometre downstream
 *   mine     the pilot's own warhead, 6 m in front of the lens as main.js
 *            draws it (WAR_MINE_AHEAD_M)
 *   horizon  an intake sized one a kilometre up the reservoir, seen from
 *            low over the water, so the far horizon crosses the fireball
 *            (the air pass veiled what lies under the horizon and not the
 *            sky over it, which drew a pale band across the fire)
 *
 * And the cost, in the air view: the frame's draw calls and triangles and
 * the GPU's time for it (as scripts/itaipu-views.js times a view) with no
 * explosion, one, and ten at once, each held at COST_AGE. Written to
 * OUT_DIR/stats.json. OUT_DIR is outside the repository: the pictures
 * are for looking at, not for committing.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { targets } from '../src/share/war/missions/itaipu-1.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || '');
if (!process.argv[2] || process.argv[2].startsWith('--') || outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error('explosion-shots: name an output folder outside the repository');
}
if (process.env.SIM_GPU !== '1') {
  throw new Error('explosion-shots: run with SIM_GPU=1; the software rasteriser is not the look');
}
const PROCEDURAL = process.argv.includes('--procedural');
const viewsArg = process.argv.find((a) => a.startsWith('--views='));
const only = viewsArg ? viewsArg.slice(8).split(',') : null;

/* Seconds after the detonation. */
const AGES = [0.08, 0.3, 0.7, 1.3, 2.2, 3.4];
const COST_AGE = 0.7;
const COST_FRAMES = 60;

/* The dam at intake 9: its axis along the crest and its normal, pointing
 * downstream, from the intakes' row (missions/itaipu-1.js). */
const I = targets['intake-9'].at;
const I0 = targets['intake-0'].at;
const al = Math.hypot(I[0] - I0[0], I[2] - I0[2]);
const A = [(I[0] - I0[0]) / al, 0, (I[2] - I0[2]) / al];
const N = [-A[2], 0, A[0]];
const at = (along, up, out) => [0, 1, 2].map((k) => I[k] + A[k] * along + N[k] * out + (k === 1 ? up : 0));

const AIR = at(20, 45, 0);
const VIEWS = [
  { id: 'air', camera: [...at(-60, 40, 220), ...AIR], boom: AIR, size: 1.6 },
  { id: 'intake', camera: [...at(40, 25, -150), ...I], boom: I, size: 2.6 },
  { id: 'far', camera: [...at(-250, 110, 980), ...AIR], boom: AIR, size: 1.6 },
  { id: 'mine', camera: [...at(-30, 40, 120), ...AIR], ahead: 6, size: 1.6 },
  { id: 'horizon', camera: [...at(0, 12, -300), ...at(0, 14, -1300)], boom: at(0, 14, -1300), size: 2.6 },
];

const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the graphics check below says so. */ }`];
if (PROCEDURAL) {
  seed.push(`(() => {
    const f = window.fetch.bind(window);
    window.fetch = (u, o) => (String(u).includes('/assets/explosions/') ? Promise.reject(new Error('held back for the procedural pictures')) : f(u, o));
  })()`);
}

/* The GPU's time per frame, from scripts/itaipu-views.js INSTALL: each
 * animation frame callback wrapped in a TIME_ELAPSED query. */
const GPU_TIMER = /* js */ `(() => {
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
  window.__boomGpu = async (n) => {
    T.frames = new Map();
    T.stamps = [];
    let calls = 0;
    let triangles = 0;
    T.on = true;
    await new Promise((done) => { const tick = () => {
      const r = window.__renderStats();
      calls = Math.max(calls, r.calls);
      triangles = Math.max(triangles, r.triangles);
      return T.stamps.length > n ? done() : raf(tick);
    }; raf(tick); });
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
    return { calls, triangles, disjoint, gpuMs: median(gpu), gpuLeastMs: Math.min(...gpu), frameMs: median(gaps) };
  };
  return true;
})()`;

/* The layer, made once and put in the map's scene; then `booms` thrown
 * (each [x, y, z, size, age]) and stepped once, so they hold still. */
const place = (booms) => `(async () => {
  if (!window.__shotBooms) {
    const { createExplosions } = await import('/src/render/explosion.js');
    window.__shotBooms = createExplosions();
    window.__mapScene().add(window.__shotBooms.group);
  }
  const b = window.__shotBooms;
  b.clear();
  for (const [x, y, z, size, age] of ${JSON.stringify(booms)}) {
    b.play([x, y, z], size, age);
  }
  b.update(1 / 600);
  return b.stats();
})()`;

const settle = async (page) => {
  for (let k = 0; k < 2; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    await page.until('(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()', 180000);
  }
  await page.sleep(2000);
};
const frames = async (page, n) => {
  await page.evaluate('window.__cf = window.__boot().frames');
  await page.until(`window.__boot().frames > window.__cf + ${n}`, 60000);
};

await mkdir(outDir, { recursive: true });
const page = await openPage({
  root, width: 1280, height: 720, url: '/index.html?map=itaipu', seed,
});
const stats = { procedural: PROCEDURAL, views: {}, cost: null };
try {
  await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
  const graphics = await page.evaluate('window.__map().graphics');
  if (graphics !== 'high') {
    throw new Error(`explosion-shots: the map was built at ${graphics}, not high`);
  }
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  await page.evaluate(place([]));
  /* The sheet, or for --procedural its refusal, before anything is shot. */
  if (!PROCEDURAL) {
    await page.until('window.__shotBooms.stats().flipbook === true', 60000);
  } else {
    await page.sleep(1500);
    const fb = await page.evaluate('window.__shotBooms.stats().flipbook');
    if (fb) {
      throw new Error('explosion-shots: --procedural, but the flipbook loaded');
    }
  }
  await page.evaluate(GPU_TIMER);
  for (const v of VIEWS.filter((x) => !only || only.includes(x.id))) {
    await page.evaluate(`(window.__setCam(${v.camera.join(',')}, 60), "")`);
    await settle(page);
    let p = v.boom;
    if (v.ahead) {
      const [cx, cy, cz, lx, ly, lz] = v.camera;
      const d = Math.hypot(lx - cx, ly - cy, lz - cz);
      p = [cx + (lx - cx) / d * v.ahead, cy + (ly - cy) / d * v.ahead, cz + (lz - cz) / d * v.ahead];
    }
    const shots = [];
    for (const age of AGES) {
      const s = await page.evaluate(place([[...p, v.size, age]]));
      await frames(page, 2);
      const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
      const name = `${v.id}-${age.toFixed(2)}s.png`;
      await writeFile(join(outDir, name), Buffer.from(data, 'base64'));
      shots.push({ age, name, hot: s.hotLive, smoke: s.smokeLive, flipbook: s.flipbook });
    }
    await page.evaluate(place([]));
    stats.views[v.id] = { camera: v.camera, boom: p, size: v.size, shots };
    console.log(`  ${v.id}: ${shots.length} shots, ${shots[0].flipbook ? 'flipbook' : 'procedural'}`);
  }

  /* The cost, in the air view. */
  const air = VIEWS[0];
  await page.evaluate(`(window.__setCam(${air.camera.join(',')}, 60), "")`);
  await settle(page);
  const ten = Array.from({ length: 10 }, (_, k) => [air.boom[0] + (k - 4.5) * 14 * A[0], air.boom[1] + (k % 3) * 8, air.boom[2] + (k - 4.5) * 14 * A[2], air.size, COST_AGE]);
  const cost = {};
  for (const [name, booms] of [['none', []], ['one', [[...air.boom, air.size, COST_AGE]]], ['ten', ten], ['none-after', []]]) {
    await page.evaluate(place(booms));
    await frames(page, 5);
    cost[name] = await page.evaluate(`window.__boomGpu(${COST_FRAMES})`);
    console.log(`  cost ${name.padEnd(10)} ${cost[name].calls} calls ${(cost[name].triangles / 1e6).toFixed(2)} M tris, `
      + `gpu ${cost[name].gpuMs.toFixed(2)} ms (least ${cost[name].gpuLeastMs.toFixed(2)}), frame ${cost[name].frameMs.toFixed(2)} ms${cost[name].disjoint ? ' DISJOINT' : ''}`);
  }
  stats.cost = cost;
  const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
  stats.errors = real;
  if (real.length) {
    console.log(`  page errors:\n${real.join('\n')}`);
  }
} finally {
  await writeFile(join(outDir, 'stats.json'), JSON.stringify(stats, null, 1));
  await page.close();
}
console.log(`explosion-shots: ${outDir}`);
