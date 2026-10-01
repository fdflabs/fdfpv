/*
 * sensor-check.js: the SensorManager's picture, measured
 * (docs/AVIONICS-SENSORS.md section 6).
 *
 *     SIM_GPU=1 node scripts/sensor-check.js OUT_DIR [--time=day,night]
 *
 * Itaipu at High, the camera parked over the dam as scripts/itaipu-views.js
 * parks it, a Striker (render/attackers.js, the war's own model) forty
 * metres in front of it, broadside, so its engine is a few pixels of the
 * picture with the ground behind it. The frame is routed through the
 * SensorManager the way the shell routes it while the Avionics HUD is up
 * (sensors.render(post) in place of post.render()), and each mode is
 * drawn and read back from the real canvas in the frame that drew it.
 *
 * What it checks, by day and by night, and fails the run on:
 *
 *   thermal   white hot: the engine's pixel brighter than the ground
 *             beside the drone by at least HOT_MARGIN of the display's
 *             range; black hot: darker by as much. The temperatures come
 *             from the materials (src/render/thermal.js), so this fails
 *             if the engine's heat or the ground's land cover stops
 *             reaching the picture;
 *   noise     low light is noisy: the mean change of a patch between two
 *             frames of a still camera is at least NOISE_RATIO times EO's
 *             and at least NOISE_MIN;
 *   zoom      4x is a crop, not a sharper lens: the share of the picture's
 *             detail at one pixel (mean |p(x+1) - p(x)| over mean
 *             |p(x+16) - p(x)|, which falls as a picture is interpolated
 *             up from fewer pixels) falls by at least ZOOM_DROP from 1x,
 *             in EO and in white hot. Over 16 and not 4: the thermal core
 *             is already interpolated 2.3 times at 1x, and a ratio over 4
 *             pixels cannot tell 2.3 from 9;
 *   coverage  every ShaderMaterial the scene draws says what it is in the
 *             thermal picture (thermalShader); one that does not would
 *             draw its visible colour as a temperature;
 *   fire      an explosion (render/explosion.js) 12 m to the drone's side
 *             is white in white hot, its brightest pixel over the ground by
 *             HOT_MARGIN; a smoke trail (render/smoke.js) is drawn beside
 *             it, so both thermal shaders are compiled and run;
 *   inset     the picture in the picture is drawn, is not flat, and a
 *             track handed to setTracks is boxed in red where the drone is;
 *   cost      each mode's frame, inset included, within section 13's
 *             budget (docs/ITAIPU-PLAN.md): its GPU time under 12 ms, the
 *             least of FRAMES frames as scripts/itaipu-views.js measures
 *             it, and at most 300 draw calls in any of them. The plain EO
 *             frame's (the composer alone, as before the sensor existed)
 *             is printed first to read the others against.
 *
 * Writes OUT_DIR/<time>-<mode>[-z4].png (the main view) and
 * <time>-<mode>-pip.png (the inset) to be looked at, and OUT_DIR/
 * sensor.json with every number. OUT_DIR must be outside the repository.
 * One headless browser at a time; needs the real GPU.
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

/* aerial-dam's camera (scripts/itaipu-views.js): 650 m over the river,
 * looking down the dam, so everything behind the drone is ground. */
const CAM = [900, 800, -1150, -400, 150, -2300];
const FOV = 44;
const DRONE_M = 40;
const W = 1600;
const H = 900;

const HOT_MARGIN = 0.2;
const NOISE_RATIO = 3;
const NOISE_MIN = 0.01;
const ZOOM_DROP = 0.7;
const GPU_BUDGET_MS = 12;
const CALL_BUDGET = 300;
const FRAMES = 40;

const MODES = ['eo', 'ir_wh', 'ir_bh', 'lowlight', 'fusion', 'contrast'];

const opts = { time: 'day,night' };
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
  throw new Error('sensor-check: run with SIM_GPU=1; a software rasteriser can neither draw the thermal pass nor time it');
}
if (!positional[0]) {
  throw new Error('sensor-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(positional[0]);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`sensor-check: ${outDir} is inside the repository; pictures go outside it`);
}
await mkdir(outDir, { recursive: true });

/*
 * The in page half. install() routes the map's post chain through the
 * SensorManager and puts the drone in front of the camera; probe() draws
 * one frame in the current mode and reads it back in the same task, so
 * the drawing buffer is still the frame's; gpu() is itaipu-views.js's
 * timer query loop.
 */
const INSTALL = /* js */ `(async () => {
  const THREE = window.__three;
  const s = window.__sensors;
  const scene = window.__mapScene();
  const post = scene.userData.post;
  if (!s || !post) { throw new Error('no __sensors or scene.userData.post'); }
  const real = post.render;
  const chain = { render: real, composer: post.composer };
  const routed = () => s.render(chain);
  post.render = routed;
  const { createAttackers } = await import('/src/render/attackers.js');
  const { createExplosions } = await import('/src/render/explosion.js');
  const { createSmoke } = await import('/src/render/smoke.js');
  const att = createAttackers();
  const booms = createExplosions();
  const smoke = createSmoke();
  scene.add(att.group, booms.group, smoke.group);
  const cam = [${CAM.join(', ')}];
  const eye = new THREE.Vector3(cam[0], cam[1], cam[2]);
  const fwd = new THREE.Vector3(cam[3], cam[4], cam[5]).sub(eye).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const at = eye.clone().addScaledVector(fwd, ${DRONE_M});
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), right);
  att.update([{ id: 1, kind: 'strike', p: at.toArray(), q: q.toArray() }], 0, eye);
  /* The engine (attackers.js strike: the tube at body z 1.2, y 0.1) and
   * the drone's centre, as directions from the camera. */
  const engine = new THREE.Vector3(0, 0.1, 1.2).applyQuaternion(q).add(at);
  const dirOf = (p) => p.clone().sub(eye).normalize().toArray();
  /* The fire and the smoke trail, stepped on the frame's clock. */
  const boomAt = at.clone().addScaledVector(right, 12);
  const trail = at.clone().addScaledVector(right, -12);
  let last = performance.now();
  let simT = 0;
  const step = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    simT += dt;
    booms.update(dt);
    smoke.update(simT, trail.clone().addScaledVector(fwd, Math.sin(simT) * 5), new THREE.Vector3(0, 0, 0), ${H}, ${FOV});
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  window.__sc = {
    s, post, att, booms, real, routed, gl: document.getElementById('view').getContext('webgl2'),
    engineDir: dirOf(engine), centreDir: dirOf(at), boomDir: dirOf(boomAt), boomAt: boomAt.toArray(), sizeRad: 2.6 / ${DRONE_M},
  };
  return true;
})()`;

const PROBE = /* js */ `(() => {
  const { s, post, gl, engineDir, centreDir, boomDir } = window.__sc;
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  const lum = (i) => (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  const draw = () => { post.render(); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  /* Canvas pixels, y down, from a projected direction. */
  const toPx = (d) => {
    const p = s.project(d);
    return p ? [Math.round((p.x * 0.5 + 0.5) * w), Math.round((0.5 - p.y * 0.5) * h)] : null;
  };
  const at = (x, y) => ((h - 1 - y) * w + x) * 4;
  draw();
  const e = toPx(engineDir);
  const c = toPx(centreDir);
  /* The engine: the hottest (or for black hot the darkest, both read
   * here) pixel within 3 of where it projects. */
  let eMax = 0;
  let eMin = 1;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const v = lum(at(e[0] + dx, e[1] + dy));
      eMax = Math.max(eMax, v);
      eMin = Math.min(eMin, v);
    }
  }
  /* The ground beside the drone: a 24 px patch 90 px below its centre. */
  let g = 0;
  for (let dy = 0; dy < 24; dy++) {
    for (let dx = 0; dx < 24; dx++) {
      g += lum(at(c[0] - 12 + dx, c[1] + 90 + dy));
    }
  }
  g /= 576;
  /* The brightest pixel in 80 px round the explosion. */
  const b = toPx(boomDir);
  let boom = 0;
  if (b) {
    for (let dy = -40; dy <= 40; dy += 2) {
      for (let dx = -40; dx <= 40; dx += 2) {
        const x = Math.min(w - 1, Math.max(0, b[0] + dx));
        const y = Math.min(h - 1, Math.max(0, b[1] + dy));
        boom = Math.max(boom, lum(at(x, y)));
      }
    }
  }
  /* Detail at one pixel over detail at sixteen, in a 480 x 270 window
   * round the middle. */
  let d1 = 0;
  let d16 = 0;
  const x0 = (w >> 1) - 240;
  const y0 = (h >> 1) - 135;
  for (let y = y0; y < y0 + 270; y += 2) {
    for (let x = x0; x < x0 + 480; x += 1) {
      const v = lum(at(x, y));
      d1 += Math.abs(lum(at(x + 1, y)) - v);
      d16 += Math.abs(lum(at(x + 16, y)) - v);
    }
  }
  /* Noise: a second frame of the still camera, the mean change of a
   * 200 px patch at the lower left. */
  const before = new Float32Array(200 * 200);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      before[y * 200 + x] = lum(at(60 + x, h - 260 + y));
    }
  }
  draw();
  let n = 0;
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 200; x++) {
      n += Math.abs(lum(at(60 + x, h - 260 + y)) - before[y * 200 + x]);
    }
  }
  return {
    engine: e, centre: c, eMax, eMin, ground: g, boom, detail: d1 / Math.max(d16, 1e-6), noise: n / 40000, stats: s.stats(),
  };
})()`;

/* The inset's canvas as a PNG, and whether a red box stands near the
 * drone in it. */
const PIP = /* js */ `(() => {
  const { s } = window.__sc;
  const c = s.pip;
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lo = 255;
  let hi = 0;
  let red = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
    if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] < 90) { red += 1; }
  }
  return { png: c.toDataURL('image/png'), lo, hi, red, drawn: s.stats().insetsDrawn };
})()`;

const GPU = /* js */ `(() => {
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
  window.__scGpu = async (n) => {
    T.frames = new Map();
    T.stamps = [];
    const calls = [];
    const inset0 = window.__sensors.stats().insetsDrawn;
    T.on = true;
    await new Promise((done) => { const tick = () => { calls.push(window.__renderStats().calls); return T.stamps.length > n ? done() : raf(tick); }; raf(tick); });
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
    const insets = window.__sensors.stats().insetsDrawn - inset0;
    return {
      disjoint, gpuMs: median(gpu), gpuLeastMs: Math.min(...gpu), calls: median(calls), callsMax: Math.max(...calls), insetRate: insets / gpu.length,
    };
  };
  return true;
})()`;

async function settle(page) {
  for (let k = 0; k < 2; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    await page.until('(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()', 120000);
  }
}

const failures = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
  if (!ok) {
    failures.push(`${name}: ${detail}`);
  }
};

const seated = seatAirframe({ airframe: '7inch', rates: airframeById('7inch').rates }, '7inch');
const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the graphics check below says so. */ }`];

const report = {};
for (const time of opts.time.split(',')) {
  console.log(`${time}:`);
  const page = await openPage({
    root, width: W, height: H, url: `/index.html?map=itaipu${time === 'night' ? '&time=night' : ''}`, seed,
  });
  const rows = {};
  try {
    await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
    const graphics = await page.evaluate('window.__map().graphics');
    if (graphics !== 'high') {
      throw new Error(`sensor-check: the map was built at ${graphics}, not high`);
    }
    await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
    await page.evaluate(GPU);
    await page.evaluate(`(window.__setCam(${CAM.join(',')}, ${FOV}), "")`);
    await settle(page);
    await page.evaluate(INSTALL);
    await page.sleep(2500);

    /* Every drawn ShaderMaterial says what it is in the thermal picture. */
    const bare = await page.evaluate(`(() => {
      const out = new Set();
      window.__mapScene().traverseVisible((o) => {
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of ms) {
          if (m.isShaderMaterial && !m.userData.thermal) { out.add(m.name || o.name || o.type); }
        }
      });
      return [...out];
    })()`);
    check('coverage', bare.length === 0, bare.length ? `no thermal output: ${bare.join(', ')}` : 'every drawn ShaderMaterial has one');

    /* The plain frame first: the composer alone, as before the sensor. */
    const plainGpu = await page.evaluate(`(async () => {
      const sc = window.__sc;
      sc.post.render = sc.real;
      try {
        return await window.__scGpu(${FRAMES});
      } finally {
        sc.post.render = sc.routed;
      }
    })()`);

    for (const mode of MODES) {
      for (const zoom of (mode === 'eo' || mode === 'ir_wh') ? [1, 4] : [1]) {
        const tag = `${time}-${mode}${zoom > 1 ? `-z${zoom}` : ''}`;
        await page.evaluate(`(window.__sc.s.setMode('${mode}'), window.__sc.s.setZoom(${zoom}), '')`);
        /* The gain settles on the new picture. */
        await page.sleep(1500);
        const p = await page.evaluate(PROBE);
        const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        await writeFile(join(outDir, `${tag}.png`), Buffer.from(data, 'base64'));
        const gpu = zoom === 1 ? await page.evaluate(`window.__scGpu(${FRAMES})`) : null;
        rows[tag] = { ...p, gpu };
        console.log(`  ${tag.padEnd(22)} engine ${p.eMax.toFixed(3)}/${p.eMin.toFixed(3)} ground ${p.ground.toFixed(3)} detail ${p.detail.toFixed(3)} noise ${p.noise.toFixed(4)}`
          + `${gpu ? ` gpu ${gpu.gpuMs.toFixed(2)} (least ${gpu.gpuLeastMs.toFixed(2)}) ms, ${gpu.calls} calls (most ${gpu.callsMax}), inset in ${(100 * gpu.insetRate).toFixed(0)}% of frames` : ''}`);
      }
      await page.evaluate("window.__sc.s.setZoom(1), ''");
      if (mode === 'ir_wh') {
        /* An explosion beside the drone, half a second old. */
        await page.evaluate('(window.__sc.booms.play(window.__sc.boomAt, 1.4), "")');
        await page.sleep(500);
        const f = await page.evaluate(PROBE);
        rows[`${time}-fire`] = { boom: f.boom, ground: f.ground };
        check(`${time} fire`, f.boom - f.ground > HOT_MARGIN && f.boom > 0.95, `brightest ${f.boom.toFixed(3)} against ground ${f.ground.toFixed(3)}`);
        const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        await writeFile(join(outDir, `${time}-ir_wh-fire.png`), Buffer.from(data, 'base64'));
        /* A fire takes the gain with it, as it does in a real camera:
         * gone, and the gain given time to come back, before the next
         * mode is measured. */
        await page.evaluate('(window.__sc.booms.clear(), "")');
        await page.sleep(2500);
        /* A track on the drone, for the inset's box. */
        await page.evaluate(`(() => {
          const sc = window.__sc;
          sc.s.setTracks({ tracks: [{ id: 7, losW: sc.centreDir, sizeRad: sc.sizeRad, confidence: 0.9, stale: false }], primaryId: 7, lost: [] });
          return true;
        })()`);
      }
    }
    /* The inset, in its two usual modes: white hot under EO (the
     * reference's) and EO under white hot. */
    for (const mode of ['eo', 'ir_wh']) {
      await page.evaluate(`(window.__sc.s.setMode('${mode}'), '')`);
      await page.sleep(800);
      const pip = await page.evaluate(PIP);
      const pipMode = await page.evaluate('window.__sc.s.state.pipMode');
      await writeFile(join(outDir, `${time}-${pipMode}-pip.png`), Buffer.from(pip.png.split(',')[1], 'base64'));
      rows[`pip-${pipMode}`] = { lo: pip.lo, hi: pip.hi, red: pip.red, drawn: pip.drawn };
      check(`${time} inset ${pipMode}`, pip.drawn > 0 && pip.hi - pip.lo > 40 && pip.red >= 12, `${pip.drawn} drawn, range ${pip.lo.toFixed(0)}..${pip.hi.toFixed(0)}, ${pip.red} red box pixels`);
    }

    const wh = rows[`${time}-ir_wh`];
    const bh = rows[`${time}-ir_bh`];
    check(`${time} white hot`, wh.eMax - wh.ground > HOT_MARGIN, `engine ${wh.eMax.toFixed(3)} against ground ${wh.ground.toFixed(3)}`);
    check(`${time} black hot`, bh.ground - bh.eMin > HOT_MARGIN, `engine ${bh.eMin.toFixed(3)} against ground ${bh.ground.toFixed(3)}`);
    const ll = rows[`${time}-lowlight`];
    const eo = rows[`${time}-eo`];
    check(`${time} low light noise`, ll.noise > NOISE_MIN && ll.noise > NOISE_RATIO * eo.noise, `${ll.noise.toFixed(4)} against EO's ${eo.noise.toFixed(4)}`);
    for (const m of ['eo', 'ir_wh']) {
      const a = rows[`${time}-${m}`];
      const b = rows[`${time}-${m}-z4`];
      check(`${time} ${m} zoom`, b.detail < ZOOM_DROP * a.detail, `detail ${a.detail.toFixed(3)} at 1x, ${b.detail.toFixed(3)} at 4x`);
    }
    console.log(`  plain EO (composer alone, no inset)  gpu ${plainGpu.gpuMs.toFixed(2)} (least ${plainGpu.gpuLeastMs.toFixed(2)}) ms, ${plainGpu.calls} calls`);
    for (const mode of MODES) {
      const g = rows[`${time}-${mode}`].gpu;
      check(`${time} ${mode} cost`, !g.disjoint && g.gpuLeastMs < GPU_BUDGET_MS && g.callsMax <= CALL_BUDGET, `${g.gpuLeastMs.toFixed(2)} ms least, at most ${g.callsMax} calls`);
    }
    rows.plain = plainGpu;
    const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      check('console', false, e);
    }
  } finally {
    await page.close();
  }
  report[time] = rows;
}

for (const rows of Object.values(report)) {
  for (const r of Object.values(rows)) {
    delete r.png;
  }
}
await writeFile(join(outDir, 'sensor.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error(`FAIL, ${failures.length} problem(s)`);
  process.exitCode = 1;
} else {
  console.log(`PASS, pictures in ${outDir}`);
}
