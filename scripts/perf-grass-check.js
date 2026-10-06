/*
 * perf-grass-check.js: the swiss2 meadow streamed ahead of the camera
 * must draw what it drew when every tile was worked out in the frame it
 * came into range.
 *
 * src/maps/swiss2/vegetation/grass.js works tiles out in the background,
 * a few rows a frame, and leaves a tile that cannot show yet (every
 * clump of it further from the camera than the layer's radius, where the
 * shader folds a clump to its root) to that background. A tile that can
 * show is still worked out in the frame that needs it. So in every frame
 * the clumps that can put a pixel on the screen must be the ones the
 * old code drew, record for record.
 *
 * That is checked on the instance buffers, not on pictures: the light,
 * the clouds and the wind follow the session's clock, which two page
 * loads cannot share, and the buffers are what the picture is drawn
 * from with an unchanged shader. Two page loads fly one replayed path,
 * the first with --base's grass.js and zones.js served in place of this tree's
 * (tests/lib/page.js override), the second with this tree's. The path is
 * stepped synchronously inside the page, a frame per step at 90 fps, so
 * the shell's own frames cannot move the camera between steps, while
 * the background's time budget still runs on the wall clock: low over
 * the valley at 30 m/s and then 60 m/s, a full turn on the spot, a climb
 * over the near layer's ceiling and a dive back under it, and a jump of
 * 400 m. This tree is flown twice, the second time with the background
 * slowed to SLOW_MS a frame. Per step, per layer, the records nearer the
 * camera than the layer's radius are hashed by the 32 m square they
 * stand in.
 *
 *   near layer (swiss2-grass)   equal in every step;
 *   middle layer (swiss2-meadow)  the old code worked out four tiles a
 *       frame and left the rest out of the draw until their turn, the
 *       new one the same four plus whatever the background had ready, so
 *       in every step every square the old code drew must be drawn the
 *       same, and after the closing hold of 200 steps the two are equal.
 *
 * It fails if a layer's buffer is ever full (which clumps a full buffer
 * cuts depends on their order, which this does not compare).
 *
 *     SIM_GPU=1 node scripts/perf-grass-check.js [--base=origin/main]
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
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.env.SIM_GPU !== '1') {
  throw new Error('perf-grass-check: run with SIM_GPU=1; the meadow is drawn at High, which wants the GPU');
}
const base = (process.argv.find((a) => a.startsWith('--base=')) || '--base=origin/main').slice(7);
/* The meadow's clumps come from grass.js and the field model it reads in
 * zones.js; the base flies both of its own. */
const BASE_FILES = ['src/maps/swiss2/vegetation/grass.js', 'src/maps/swiss2/vegetation/zones.js'];
const baseOverride = {};
for (const file of BASE_FILES) {
  const shown = spawnSync('git', ['-C', root, 'show', `${base}:${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (shown.status !== 0) {
    throw new Error(`perf-grass-check: git show ${base}:${file} failed: ${shown.stderr}`);
  }
  baseOverride[`/${file}`] = shown.stdout;
}

/* The layers by mesh name, and the squares their records are hashed by. */
const LAYERS = ['swiss2-grass', 'swiss2-meadow'];
const SQUARE = 32;
const HOLD = 200;
/* The third flight's background budget, ms a frame. Slower than the
 * steps, so tiles in the drawn ring are still being worked out when the
 * camera moves on and finish mid tile: the refills that follow must
 * draw the ring the crossing chose. At the default 1 ms that case came
 * up only when the timing fell so (the lead's run of 2026-10-05 caught
 * a refill drawing the ring a crossing early; this tree's had not). */
const SLOW_MS = 0.3;

/*
 * The path, as poses [x, z, height over the ground, yaw toward +z
 * clockwise from above, radians], one per step. Starts where perf-play's
 * swiss-low and the views' low-south look over the valley floor.
 */
function path() {
  const out = [];
  let x = 0;
  let z = 900;
  const dir = Math.atan2(120, 700);
  const run = (steps, metres, h0, h1 = h0, turn = 0) => {
    for (let k = 0; k < steps; k += 1) {
      const yaw = dir + (turn * (k + 1)) / steps;
      x += Math.sin(dir) * metres;
      z += Math.cos(dir) * metres;
      out.push([x, z, h0 + ((h1 - h0) * (k + 1)) / steps, yaw]);
    }
  };
  run(400, 30 / 90, 8);
  run(120, 60 / 90, 8);
  run(90, 0, 8, 8, Math.PI * 2);
  run(60, 30 / 90, 8, 70);
  run(60, 30 / 90, 70);
  run(30, 30 / 90, 70, 8);
  x += 400 * Math.cos(dir);
  z -= 400 * Math.sin(dir);
  run(60, 30 / 90, 8);
  run(HOLD, 0, 8);
  return out;
}

const FLY = (poses, budgetMs) => /* js */ `(() => {
  const P = globalThis.__SWISS2_PERF;
  const r = P.renderer;
  const cam = P.camera;
  const layers = ${JSON.stringify(LAYERS)}.map((name) => {
    const mesh = P.scene.getObjectByName(name);
    if (!mesh) { throw new Error('no mesh ' + name); }
    if (${budgetMs === null ? 'false' : 'true'}) {
      if (!mesh.userData.grassBudget) { throw new Error(name + ': no grassBudget to slow the background with'); }
      mesh.userData.grassBudget.ms = ${budgetMs};
    }
    const u = r.properties.get(mesh.material).uniforms;
    if (!u || !u.uRadius) { throw new Error(name + ': its program is not built, so its radius is not known'); }
    return { name, mesh, radius: u.uRadius.value };
  });
  const words = new Uint32Array(8);
  const floats = new Float32Array(words.buffer);
  const steps = [];
  let t = performance.now() / 1000;
  for (const [x, z, h, yaw] of ${JSON.stringify(poses)}) {
    const y = window.__heightAt(x, z) + h;
    cam.position.set(x, y, z);
    cam.lookAt(x + Math.sin(yaw) * 100, window.__heightAt(x + Math.sin(yaw) * 100, z + Math.cos(yaw) * 100) + 4, z + Math.cos(yaw) * 100);
    cam.updateMatrixWorld(true);
    t += 1 / 90;
    P.updateWind(t);
    const step = {};
    for (const l of layers) {
      const geo = l.mesh.geometry;
      const data = geo.getAttribute('aClump').data.array;
      const n = geo.instanceCount;
      const squares = {};
      for (let k = 0; k < n; k += 1) {
        const o = k * 8;
        const cx = data[o];
        const cz = data[o + 2];
        if (Math.hypot(cx - x, cz - z) >= l.radius) { continue; }
        for (let q = 0; q < 8; q += 1) { floats[q] = data[o + q]; }
        let hash = 2166136261;
        for (let q = 0; q < 8; q += 1) { hash = Math.imul(hash ^ words[q], 16777619) >>> 0; }
        const key = Math.floor(cx / ${SQUARE}) + ',' + Math.floor(cz / ${SQUARE});
        const s = squares[key] || (squares[key] = [0, 0]);
        s[0] += 1;
        s[1] = (s[1] + hash) >>> 0;
      }
      step[l.name] = { squares, full: n * 8 >= data.length, n };
    }
    steps.push(step);
  }
  const stats = {};
  for (const l of layers) {
    stats[l.name] = l.mesh.userData.grassStats ? { ...l.mesh.userData.grassStats } : null;
  }
  return JSON.stringify({ steps, stats, radius: Object.fromEntries(layers.map((l) => [l.name, l.radius])) });
})()`;

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch');
const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)}, { graphics: 'high', graphicsAuto: false, perfMode: 'quality', airframeAsked: true });
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* Storage refused: the quality check below fails the run. */ }
  globalThis.__SWISS2_PERF = {};`];

async function fly(label, override, budgetMs = null) {
  const page = await openPage({
    root, width: 1600, height: 900, url: '/index.html?map=swiss2', seed, override,
  });
  const stop = () => page.close().finally(() => process.exit(1));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await page.until('window.__map && window.__map().id === "swiss2" && window.__map().ready', 300000);
    const quality = await page.evaluate('globalThis.__SWISS2_PERF.quality');
    if (quality !== 'high') {
      throw new Error(`perf-grass-check: the map was built at ${quality}; the meadow's layers are High's`);
    }
    const poses = path();
    const [x0, z0, h0, yaw0] = poses[0];
    await page.evaluate(`(window.__setCam(${x0}, window.__heightAt(${x0}, ${z0}) + ${h0}, ${z0}, ${x0 + Math.sin(yaw0) * 100}, window.__heightAt(${x0}, ${z0}) + 4, ${z0 + Math.cos(yaw0) * 100}, 44), "")`);
    await page.sleep(2500);
    const t0 = Date.now();
    const out = JSON.parse(await page.evaluate(FLY(poses, budgetMs)));
    console.log(`${label}: ${out.steps.length} steps in ${((Date.now() - t0) / 1000).toFixed(1)} s, radius ${JSON.stringify(out.radius)}${out.stats[LAYERS[0]] ? `, stats ${JSON.stringify(out.stats)}` : ''}`);
    const errors = page.errors.filter((e) => !String(e).startsWith('network:'));
    if (errors.length) {
      throw new Error(`perf-grass-check: ${label}: console errors: ${errors.slice(0, 3).join(' | ')}`);
    }
    return out;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await page.close();
  }
}

const was = await fly(`base ${base}`, baseOverride);
const runs = [
  ['this tree', await fly('this tree', {})],
  [`this tree, background at ${SLOW_MS} ms a frame`, await fly(`this tree, background at ${SLOW_MS} ms a frame`, {}, SLOW_MS)],
];

let failed = 0;
const fail = (msg) => {
  failed += 1;
  if (failed <= 12) {
    console.log(`FAIL ${msg}`);
  }
};
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const visible = (out, name) => out.steps.reduce((m, s) => m + Object.values(s[name].squares).reduce((n, q) => n + q[0], 0), 0);
for (const [label, now] of runs) {
  let ahead = 0;
  for (let k = 0; k < was.steps.length; k += 1) {
    for (const name of LAYERS) {
      const a = was.steps[k][name];
      const b = now.steps[k][name];
      if (a.full || b.full) {
        fail(`${label}: step ${k} ${name}: the buffer is full (${a.n} before, ${b.n} now), so which clumps it holds depends on their order`);
      }
      const keys = new Set([...Object.keys(a.squares), ...Object.keys(b.squares)]);
      let extra = false;
      for (const key of keys) {
        const sa = a.squares[key];
        const sb = b.squares[key];
        if (same(sa, sb)) {
          continue;
        }
        if (name === 'swiss2-meadow' && !sa && k < was.steps.length - 1) {
          extra = true;
          continue;
        }
        fail(`${label}: step ${k} ${name} square ${key}: before ${JSON.stringify(sa || null)}, now ${JSON.stringify(sb || null)}`);
      }
      ahead += extra ? 1 : 0;
    }
  }
  console.log(`${label}: clumps that could show, summed over the steps: near ${visible(was, LAYERS[0])} before, ${visible(now, LAYERS[0])} now; `
    + `middle ${visible(was, LAYERS[1])} before, ${visible(now, LAYERS[1])} now (${ahead} steps where the middle layer drew squares the old code had not reached yet)`);
}
if (failed) {
  console.error(`perf-grass-check: ${failed} difference(s)`);
  process.exit(1);
}
console.log('ok: every clump that can show is the one the old code drew, in every step');
