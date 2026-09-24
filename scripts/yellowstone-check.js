/*
 * yellowstone-check.js: the terrain engine's promises, measured.
 *
 * Loads the Yellowstone map in headless Chromium on the data the harness
 * serves at yellowstone-data/ (FDFPV_YELLOWSTONE_DATA, see
 * tests/lib/server.js) and asserts, at three camera heights and along two
 * flown lines:
 *
 *   cracks    every border between two drawn chunks, sampled along its
 *             length from both sides: where the two edges disagree, the
 *             higher chunk's skirt reaches below the lower edge; and along
 *             the extent's edge the apron sits between each chunk's edge
 *             and its skirt's foot.
 *   ground    map.height(x, z) equals a ray cast straight down onto the
 *             meshes actually drawn, at random points near the camera and
 *             across the whole extent.
 *   budget    terrain draw calls and triangles inside the camera's frustum
 *             at ground level and at 3 km, against BUDGET below.
 *   hitches   the terrain's and the anchors' main thread time in every
 *             frame of the flown lines, against HITCH_MS.
 *   memory    after a 30 km line: tile bytes, chunk GPU bytes, built mesh
 *             count and JS heap, against MEMORY.
 *   streaming along the 30 m/s line the ground under the craft is the
 *             finest level the data has there, every frame.
 *
 * WHAT IT CANNOT SEE. By default the harness renders with SwiftShader, on
 * the CPU, so a frame's wall time is the rasteriser's and says nothing
 * about a GPU; SIM_GPU=1 runs it on this machine's GPU (tests/lib/page.js)
 * and the frame times mean something. Either way the hitch assertion is on
 * the main thread work this engine does per frame, which is the part a
 * GPU does not change, and a control (fixed arithmetic timed the same way
 * every frame) is printed beside it, because on a host busy with other
 * work the main thread is descheduled at random and a spike the control
 * shows too is the host's. The 30 km lines are flown at 300 m/s so they
 * fit in minutes of wall clock; the 30 m/s line is the real speed over a
 * shorter distance that crosses a tile boundary.
 *
 *   [SIM_GPU=1] [FDFPV_YELLOWSTONE_DATA=DIR] node scripts/yellowstone-check.js [--lines]
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Set from the design in src/maps/yellowstone.js before the first
 * measurement, at High, the preset with the most terrain. Terrain only:
 * chunks and the apron inside the camera's frustum, one draw each. */
const BUDGET = {
  calls: 120,
  triangles: 400000,
};
/* Main thread milliseconds of terrain and anchor work in any one frame:
 * the 3 ms build ration plus the selection and the commit. */
const HITCH_MS = 5;
const MEMORY = {
  /* Bytes of chunk vertex buffers resident. meshCap 360 at about 120 kB. */
  gpuBytes: 48e6,
  /* JS heap growth from the settled spawn to the end of the 30 km line. */
  heapGrowth: 64e6,
};
/* Metres. The ground and the drawn triangles are the same numbers in
 * float64 and float32, so anything past a centimetre is a real mismatch. */
const GROUND_TOL = 0.01;
/* Metres the title camera keeps over the ground everywhere on its loop. */
const ATTRACT_CLEAR = 20;

const PAGE_LIB = `(() => {
  const T = window.__three;
  const Y = () => window.__mapScene().userData.yellowstone;
  const lib = {};
  lib.stats = () => window.__map().terrain;
  lib.settled = () => {
    const s = lib.stats();
    return s.queuedBuilds === 0 && s.tiles.inflight === 0 && s.tiles.queued === 0;
  };
  lib.hideUi = () => {
    const n = document.getElementById('ui');
    if (n) { n.style.display = 'none'; }
  };
  /* Frustum of the shell camera. */
  lib.inFrustum = () => {
    const t = Y().terrain;
    const camera = Y().camera;
    camera.updateMatrixWorld();
    const f = new T.Frustum().setFromProjectionMatrix(
      new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let calls = 0;
    let tris = 0;
    const sphere = new T.Sphere();
    for (const nd of t.leaves) {
      sphere.copy(nd.mesh.geometry.boundingSphere).applyMatrix4(nd.mesh.matrixWorld);
      if (f.intersectsSphere(sphere)) {
        calls += 1;
        tris += 2 * nd.nx * nd.nz + 4 * (nd.nx + nd.nz);
      }
    }
    const apron = t.apron.mesh;
    apron.geometry.computeBoundingSphere();
    if (f.intersectsSphere(apron.geometry.boundingSphere)) {
      calls += 1;
      tris += t.apron.triangles;
    }
    return { calls, tris };
  };
  /* Every drawn border, from both sides. */
  lib.cracks = () => {
    const t = Y().terrain;
    const HALF = 50000;
    let samples = 0;
    let borders = 0;
    let apronSamples = 0;
    const bad = [];
    for (const a of t.leaves) {
      const x1 = a.x0 + a.nx * a.cell;
      const z1 = a.z0 + a.nz * a.cell;
      const sides = [
        { len: x1 - a.x0, at: (s) => [a.x0 + s, a.z0], out: [0, -1] },
        { len: x1 - a.x0, at: (s) => [a.x0 + s, z1], out: [0, 1] },
        { len: z1 - a.z0, at: (s) => [a.x0, a.z0 + s], out: [-1, 0] },
        { len: z1 - a.z0, at: (s) => [x1, a.z0 + s], out: [1, 0] },
      ];
      const step = a.cell / 4;
      for (const side of sides) {
        for (let s = 0; s <= side.len + 1e-6; s += step) {
          const [x, z] = side.at(Math.min(s, side.len));
          const ox = x + side.out[0] * 0.01;
          const oz = z + side.out[1] * 0.01;
          const ha = t.readNode(a, x, z);
          const b = t.leafAt(ox, oz);
          if (b && b !== a) {
            const hb = t.readNode(b, x, z);
            samples += 1;
            if (s === 0) { borders += 1; }
            if (ha > hb + 0.005 && a.bottom > hb) {
              bad.push({ kind: 'skirt', a: a.key, b: b.key, x, z, ha, hb, bottom: a.bottom });
            }
          } else if (!b && (Math.abs(ox) > HALF - 200 || Math.abs(oz) > HALF - 200)) {
            const hp = t.apron.height(ox, oz);
            apronSamples += 1;
            if (hp > ha + 0.005 || hp < a.bottom) {
              bad.push({ kind: 'apron', a: a.key, x, z, ha, apron: hp, bottom: a.bottom });
            }
          }
        }
      }
    }
    return { leaves: t.leaves.length, samples, apronSamples, failures: bad.length, worst: bad.slice(0, 8) };
  };
  /* Ray straight down onto what is drawn, against map.height. */
  lib.ground = (cx, cz, radius, n, seed) => {
    const t = Y().terrain;
    const meshes = t.leaves.map((nd) => nd.mesh).concat([t.apron.mesh]);
    const ray = new T.Raycaster();
    /* The far chunks are on layer 1 only (out of the ink pass). */
    ray.layers.enableAll();
    const down = new T.Vector3(0, -1, 0);
    let s = seed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    let worst = 0;
    let worstAt = null;
    let missed = 0;
    const levels = {};
    for (let k = 0; k < n; k += 1) {
      const x = Math.max(-49990, Math.min(49990, cx + (rnd() * 2 - 1) * radius));
      const z = Math.max(-49990, Math.min(49990, cz + (rnd() * 2 - 1) * radius));
      ray.set(new T.Vector3(x, 20000, z), down);
      ray.far = 40000;
      const hit = ray.intersectObjects(meshes, false)[0];
      /* The terrain's own ground: the map's height() also takes the lakes'
       * surfaces and the falls' step, which are not terrain triangles. */
      const h = t.height(x, z);
      const leaf = t.leafAt(x, z);
      const lv = leaf ? leaf.level : 'apron';
      levels[lv] = (levels[lv] || 0) + 1;
      if (!hit) { missed += 1; worstAt = { x, z, h, miss: true }; continue; }
      const d = Math.abs(hit.point.y - h);
      if (d > worst) { worst = d; worstAt = { x, z, h, drawn: hit.point.y, level: lv }; }
    }
    return { n, worst, worstAt, missed, levels };
  };
  /* Fly the camera along a line in wall time, logging every frame. */
  lib.fly = (from, to, speed, agl, maxMs) => new Promise((done) => {
    const t = Y().terrain;
    const anchors = Y().anchors;
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const frames = [];
    let coarse = 0;
    let coarseAt = null;
    let dist = 0;
    let last = performance.now();
    const start = last;
    const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const step = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      dist = Math.min(len, dist + speed * dt / 1000);
      const x = from[0] + ux * dist;
      const z = from[1] + uz * dist;
      const y = window.__heightAt(x, z) + agl;
      window.__setCam(x, y, z, x + ux * 500, y - agl * 0.3, z + uz * 500);
      const s = t.stats();
      /* A control: the same fixed arithmetic every frame, timed the same
       * way. On a host with other work the main thread is descheduled at
       * random, and a spike the control shows too is the host's, not the
       * terrain's. */
      const c0 = performance.now();
      let acc = 0;
      for (let k = 0; k < 200000; k += 1) { acc += Math.sqrt(k + acc * 1e-9); }
      const control = performance.now() - c0 + (acc < 0 ? 1 : 0);
      const regionMs = Y().regions ? Y().regions.lastLoadMs : 0;
      frames.push({ dt, work: t.lastWorkMs + anchors.lastMs, sel: t.lastSelectMs, phases: t.lastPhases.slice(), control, regionMs });
      /* Is the ground under the camera the finest level the data has?
       * Only asked low down: three kilometres up, the node under the
       * craft is three kilometres from it and is drawn at the level that
       * distance calls for, refining as it comes down. */
      const leaf = agl < 500 ? t.leafAt(x, z) : null;
      const heroListed = t.store.exists(-1, Math.floor((x + 50000) / 2560), Math.floor((z + 50000) / 2560));
      const want = heroListed ? -1 : 0;
      if (leaf && leaf.level !== want && frames.length > 3) {
        coarse += 1;
        coarseAt = coarseAt || { x, z, level: leaf.level, want };
      }
      if (dist >= len || now - start > maxMs) {
        const works = frames.slice(2).map((f) => f.work).sort((a, b) => a - b);
        const dts = frames.slice(2).map((f) => f.dt).sort((a, b) => a - b);
        const pick = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
        done({
          metres: Math.round(dist),
          frames: frames.length,
          workMax: works[works.length - 1],
          workP99: pick(works, 0.99),
          workMedian: pick(works, 0.5),
          selectMax: Math.max(...frames.slice(2).map((f) => f.sel)),
          controlMedian: pick(frames.slice(2).map((f) => f.control).sort((a, b) => a - b), 0.5),
          controlMax: Math.max(...frames.slice(2).map((f) => f.control)),
          controlLate: (() => {
            const cs = frames.slice(2).map((f) => f.control).sort((a, b) => a - b);
            const med = cs[Math.floor(cs.length / 2)];
            return cs.filter((v) => v > med + 2).length;
          })(),
          spikes: frames.slice(2).filter((f) => f.work > ${HITCH_MS}).slice(0, 6)
            .map((f) => f.phases.map((v) => Math.round(v * 100) / 100)),
          buildAvg: s.buildAvgMs,
          buildMax: s.buildMaxMs,
          overHitch: works.filter((w) => w > ${HITCH_MS}).length,
          regionLoads: frames.filter((f) => f.regionMs > 0).length,
          regionMax: Math.max(0, ...frames.map((f) => f.regionMs)),
          dtMedian: pick(dts, 0.5),
          dtMax: dts[dts.length - 1],
          coarse,
          coarseAt,
          heapGrowth: performance.memory ? performance.memory.usedJSHeapSize - heap0 : null,
          stats: s,
        });
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  /* The whole frame as the shell counts it, with the features and the
   * water shown and hidden, for the combined budget. */
  lib.parts = (on) => {
    const y = Y();
    for (const p of [y.thermal, y.water]) {
      if (p && p.root) { p.root.visible = on; }
    }
    return Boolean(y.thermal);
  };
  window.__ysCheck = lib;
  return 'ok';
})()`;

const failures = [];
const fail = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};

async function settle(page, label) {
  const t0 = Date.now();
  await page.until('window.__ysCheck.settled()', 180000);
  /* Two more frames so the selection that follows the last build is the
   * one measured. */
  await page.evaluate('window.__ysF = window.__boot().frames');
  await page.until('window.__boot().frames > window.__ysF + 2', 30000);
  console.log(`${label}: settled in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

async function view(page, label, cam, opts) {
  await page.evaluate(`window.__setCam(${cam.join(',')})`);
  await settle(page, label);
  const st = JSON.parse(await page.evaluate('JSON.stringify(window.__ysCheck.stats())'));
  const fr = JSON.parse(await page.evaluate('JSON.stringify(window.__ysCheck.inFrustum())'));
  const rs = JSON.parse(await page.evaluate('JSON.stringify(window.__renderStats())'));
  console.log(`  leaves ${st.leaves} ${JSON.stringify(st.perLevel)}, all leaves ${st.leafTriangles} tris, `
    + `in frustum ${fr.calls} calls ${fr.tris} tris; whole frame ${rs.calls} calls ${rs.triangles} tris`);
  if (opts.budget) {
    if (fr.calls > BUDGET.calls) {
      fail(`${label}: ${fr.calls} terrain draw calls in frustum, budget ${BUDGET.calls}`);
    }
    if (fr.tris > BUDGET.triangles) {
      fail(`${label}: ${fr.tris} terrain triangles in frustum, budget ${BUDGET.triangles}`);
    }
  }
  const cr = JSON.parse(await page.evaluate('JSON.stringify(window.__ysCheck.cracks())'));
  console.log(`  cracks: ${cr.samples} border samples and ${cr.apronSamples} edge samples over ${cr.leaves} leaves, ${cr.failures} open`);
  if (cr.failures) {
    fail(`${label}: ${cr.failures} open border samples, first ${JSON.stringify(cr.worst[0])}`);
  }
  for (const [name, radius, n] of [['near', 2500, 300], ['extent', 50000, 300]]) {
    const g = JSON.parse(await page.evaluate(
      `JSON.stringify(window.__ysCheck.ground(${cam[0]}, ${cam[2]}, ${radius}, ${n}, 7))`,
    ));
    console.log(`  ground ${name}: ${g.n} points, worst |drawn - height| ${g.worst.toExponential(2)} m, `
      + `${g.missed} missed, levels ${JSON.stringify(g.levels)}`);
    if (g.worst > GROUND_TOL || g.missed) {
      fail(`${label}: ground ${name} off by ${g.worst} m or missed ${g.missed}, at ${JSON.stringify(g.worstAt)}`);
    }
  }
  return st;
}

async function main() {
  const page = await openPage({
    root,
    width: 1280,
    height: 720,
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.graphics = 'high';
      s.graphicsAuto = false;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* Storage refused. The run still boots. */ }`],
  });
  try {
    await page.until('!!window.__boot && window.__boot().frames > 2', 120000);
    const t0 = Date.now();
    await page.evaluate('window.__setMap("yellowstone")');
    await page.until('window.__map().id === "yellowstone" && window.__map().ready', 300000);
    const loadS = (Date.now() - t0) / 1000;
    await page.evaluate(PAGE_LIB);
    await page.evaluate('window.__ysCheck.hideUi()');
    const gl = await page.evaluate(`(() => {
      const g = document.createElement('canvas').getContext('webgl2');
      const e = g && g.getExtension('WEBGL_debug_renderer_info');
      return g ? g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER) : 'none';
    })()`);
    console.log(`renderer: ${gl}`);
    const m = JSON.parse(await page.evaluate('JSON.stringify(window.__map())'));
    console.log(`yellowstone loaded in ${loadS.toFixed(1)} s, world stage ${m.loading && m.loading.world}, `
      + `${m.synthetic ? 'SYNTHETIC' : 'real'} data, spawn ${Math.round(m.spawn.x)}, ${m.spawn.y.toFixed(1)}, ${Math.round(m.spawn.z)}`);
    const sx = m.spawn.x;
    const sz = m.spawn.z;
    const gy = m.spawn.y;
    const views = [
      ['ground, spawn looking north', [sx, gy + 2, sz, sx, gy + 1, sz - 1000], { budget: true }],
      ['300 m over the basin', [sx, gy + 300, sz + 400, sx, gy, sz - 3000], { budget: false }],
      ['3 km looking north east', [sx, gy + 3000, sz, sx + 20000, gy, sz - 30000], { budget: true }],
    ];
    /* --lines skips the three views, for iterating on the streaming. */
    for (const [label, cam, opts] of process.argv.includes('--lines') ? [] : views) {
      await view(page, label, cam, opts);
    }

    /* The title camera's loop against the ground under it: attract-check
     * sees only colliders, and the terrain is not one. */
    const at = JSON.parse(await page.evaluate(`JSON.stringify((() => {
      const p = window.__attract(640);
      let worst = Infinity;
      let where = null;
      for (const q of p.samples) {
        const c = q.y - window.__heightAt(q.x, q.z);
        if (c < worst) { worst = c; where = [Math.round(q.x), Math.round(q.z)]; }
      }
      return { worst, where, n: p.samples.length };
    })())`));
    console.log(`attract loop: ${at.n} samples, lowest ${at.worst.toFixed(1)} m over the ground at ${at.where}`);
    if (at.worst < ATTRACT_CLEAR) {
      fail(`attract loop comes within ${at.worst.toFixed(1)} m of the ground at ${at.where}, want ${ATTRACT_CLEAR}`);
    }

    /* Terrain with the thermal features and the water, whole frame (ink
     * prepass, colour pass, post) as __renderStats counts it, over the
     * Upper Geyser Basin where the features are densest: the views the
     * features part set its own budget at. Reported, not asserted: the
     * parts' budgets are asserted separately, this is their sum. */
    if (!process.argv.includes('--lines')) {
      const of = { x: -26325, z: 17964 };
      for (const [label, agl, back] of [['basin at 100 m', 100, 500], ['basin at 1 km', 1000, 1500]]) {
        const y0 = JSON.parse(await page.evaluate(`JSON.stringify(window.__heightAt(${of.x}, ${of.z}))`));
        const cam = [of.x + back * 0.7, y0 + agl, of.z + back * 0.7, of.x, y0, of.z];
        await page.evaluate(`window.__setCam(${cam.join(',')})`);
        await settle(page, label);
        const has = await page.evaluate('window.__ysCheck.parts(true)');
        await page.evaluate('window.__ysF = window.__boot().frames');
        await page.until('window.__boot().frames > window.__ysF + 3', 30000);
        const all = JSON.parse(await page.evaluate('JSON.stringify(window.__renderStats())'));
        await page.evaluate('window.__ysCheck.parts(false)');
        await page.evaluate('window.__ysF = window.__boot().frames');
        await page.until('window.__boot().frames > window.__ysF + 3', 30000);
        const bare = JSON.parse(await page.evaluate('JSON.stringify(window.__renderStats())'));
        await page.evaluate('window.__ysCheck.parts(true)');
        const fr = JSON.parse(await page.evaluate('JSON.stringify(window.__ysCheck.inFrustum())'));
        console.log(`  whole frame: ${all.calls} calls ${all.triangles} tris; terrain and the rest without the features `
          + `${bare.calls} calls ${bare.triangles} tris; features and water ${all.calls - bare.calls} calls `
          + `${all.triangles - bare.triangles} tris${has ? '' : ' (no features in this data)'}; terrain in frustum `
          + `${fr.calls} calls ${fr.tris} tris`);
      }
    }

    /* The real speed across a tile boundary: 30 m/s at 40 m over the
     * ground for 70 s, north from the spawn over the level 0 tile edge at
     * z = 16 080 and the hero tile edges on the way. */
    await page.evaluate(`window.__setCam(${sx}, ${gy + 40}, ${sz}, ${sx}, ${gy + 30}, ${sz - 500})`);
    await settle(page, 'fly 30 m/s start');
    const slow = JSON.parse(await page.evaluate(
      `window.__ysCheck.fly([${sx}, ${sz}], [${sx}, ${sz - 2100}], 30, 40, 90000).then(JSON.stringify)`,
    ));
    reportFly('30 m/s at 40 m AGL', slow);
    if (slow.overHitch) {
      fail(`30 m/s line: ${slow.overHitch} frames over ${HITCH_MS} ms of terrain work, worst ${slow.workMax.toFixed(2)} ms`);
    }
    if (slow.coarse) {
      fail(`30 m/s line: ${slow.coarse} frames with the ground under the craft coarser than the data, first ${JSON.stringify(slow.coarseAt)}`);
    }

    /* 30 km at 3 km, then 30 km at 60 m, both at 300 m/s: ten times the
     * speed so the distance fits in the run. Memory is read at the end. */
    await page.evaluate('window.__ysCheck.hideUi()');
    const heap0 = await page.evaluate('performance.memory ? performance.memory.usedJSHeapSize : 0');
    const high = JSON.parse(await page.evaluate(
      `window.__ysCheck.fly([${sx}, ${sz}], [${sx + 21000}, ${sz - 21000}], 300, 3000, 200000).then(JSON.stringify)`,
    ));
    reportFly('300 m/s at 3 km AGL, 30 km', high);
    const low = JSON.parse(await page.evaluate(
      `window.__ysCheck.fly([${sx + 21000}, ${sz - 21000}], [${sx + 21000 - 30000}, ${sz - 21000}], 300, 60, 200000).then(JSON.stringify)`,
    ));
    reportFly('300 m/s at 60 m AGL, 30 km', low);
    for (const [name, r] of [['3 km line', high], ['60 m line', low]]) {
      if (r.overHitch) {
        fail(`${name}: ${r.overHitch} frames over ${HITCH_MS} ms of terrain work, worst ${r.workMax.toFixed(2)} ms`);
      }
    }
    const heap1 = await page.evaluate('performance.memory ? performance.memory.usedJSHeapSize : 0');
    const st = low.stats;
    console.log(`memory after 60 km flown: tiles ${(st.tiles.bytes / 1e6).toFixed(1)} MB in ${st.tiles.tiles} `
      + `(ceiling ${(st.tiles.ceiling / 1e6).toFixed(0)} MB, pinned ${(st.tiles.pinnedBytes / 1e6).toFixed(1)} MB, `
      + `evicted ${st.tiles.evicted}), chunks ${st.meshes} built, ${(st.gpuBytes / 1e6).toFixed(1)} MB GPU, `
      + `heap ${((heap1 - heap0) / 1e6).toFixed(1)} MB growth`);
    if (st.tiles.bytes > Math.max(st.tiles.ceiling, st.tiles.pinnedBytes) + 132098 * 8) {
      fail(`tiles: ${st.tiles.bytes} bytes resident, ceiling ${st.tiles.ceiling} plus pinned ${st.tiles.pinnedBytes}`);
    }
    if (st.gpuBytes > MEMORY.gpuBytes) {
      fail(`chunks: ${st.gpuBytes} bytes of GPU buffers, budget ${MEMORY.gpuBytes}`);
    }
    if (heap1 - heap0 > MEMORY.heapGrowth) {
      fail(`heap grew ${heap1 - heap0} bytes over the lines, budget ${MEMORY.heapGrowth}`);
    }
    const gpu = JSON.parse(await page.evaluate('JSON.stringify(window.__gpuMemory())'));
    console.log(`renderer: ${gpu.geometries} geometries, ${gpu.textures} textures`);
    const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      fail(`console: ${e}`);
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
  console.log('PASS, the terrain is crack free, its ground is what it draws, and it keeps to its budgets');
}

function reportFly(label, r) {
  console.log(`${label}: ${r.metres} m in ${r.frames} frames; terrain work median ${r.workMedian.toFixed(2)} ms, `
    + `p99 ${r.workP99.toFixed(2)}, max ${r.workMax.toFixed(2)} (budget ${HITCH_MS}); frame wall time median `
    + `${r.dtMedian.toFixed(0)} ms, max ${r.dtMax.toFixed(0)}; coarse ground frames ${r.coarse}; `
    + `selection max ${r.selectMax.toFixed(2)} ms, chunk build mean ${r.buildAvg.toFixed(2)} max ${r.buildMax.toFixed(2)} ms; `
    + `control median ${r.controlMedian.toFixed(2)} max ${r.controlMax.toFixed(2)} ms, `
    + `${r.controlLate} control frames more than 2 ms over its median`);
  console.log(`  region loads (the features' and the water's own builds, one a frame): ${r.regionLoads}, `
    + `worst ${r.regionMax.toFixed(0)} ms`);
  for (const p of r.spikes) {
    console.log(`  over ${HITCH_MS} ms: commit ${p[0]}, select ${p[1]}, build ${p[2]} `
      + `(start ${p[4]}, rows ${p[5]}, install ${p[6]}), trim ${p[3]}`);
  }
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
