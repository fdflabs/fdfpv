/*
 * thermal-physics-check.js: the thermal picture's temperatures, ordered
 * as physics orders them (docs/AVIONICS-SENSORS.md section 3).
 *
 *     SIM_GPU=1 node scripts/thermal-physics-check.js OUT_DIR
 *         [--scenes=itaipu-day,itaipu-night,swiss2-day,interior-day,interior-night]
 *         [--views=reservoir-dam,lake-high] [--shots=0]
 *
 * Each scene is a map at a time of day, each view a parked camera in it.
 * At every view the thermal source is drawn as the sensor view draws it
 * (src/render/sensorview.js: renderThermal at the core's width, the
 * scene's onBeforeRender skipped) into a 32 bit float target and read
 * back. Its red is the temperature and its blue says what drew the pixel
 * (src/render/thermal.js LABEL: a material's kind, a ShaderMaterial's
 * label, or the clear sky), so the temperatures are grouped by what they
 * belong to without a ray cast: sky, water, vegetation, ground, built,
 * body, hot, motor, fire. Then it fails unless, over each scene's views:
 *
 *   day       sunlit built surfaces (asphalt, concrete, roofs) are warmer
 *             than vegetation, and vegetation warmer than water;
 *   night     water is warmer than the land: vegetation and the ground;
 *   people    a person (the body kind) reads as skin and clothes do,
 *             between BODY_C, and over the ground round them at night;
 *   hot       the war's engine well over the ground (HOT_OVER_AIR), the
 *             camp's fire and an explosion over FIRE_C (the explosion's
 *             pool is additive and has no label: the frame's hottest
 *             pixel with it);
 *   sky       the coldest of the sky (its fifth percentile in the view
 *             that holds most of it) SKY_MARGIN under the coldest of
 *             anything else: near the horizon the sky is near the air's
 *             temperature, as it is in a real camera;
 *   lake bed  the lake's temperature does not depend on its bed: with the
 *             bed's meshes hidden the water's pixels are bit for bit the
 *             same, and its spread across a view from above stays under
 *             WATER_SPREAD (water is opaque in the long wave band, so what
 *             shows is its skin, not what lies under it);
 *   coverage  every drawn ShaderMaterial says what it is in the thermal
 *             picture, on every map, not Itaipu's alone (sensor:check's
 *             own test);
 *   display   printed, not judged: the white hot picture on screen,
 *             through the gain, its standard deviation and how much of it
 *             is clipped black or white.
 *
 * With --shots (the default) it writes OUT_DIR/<scene>-<view>-eo.png (the
 * map's own picture) and -ir_wh.png (the sensor full screen), and always
 * OUT_DIR/thermal-physics.json with every number. OUT_DIR must be outside
 * the repository. One headless browser at a time; needs the real GPU.
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
const W = 1600;
const H = 900;
const FOV = 44;

/* Degrees C. A class needs MIN_PX pixels in a scene to be compared. */
const SKY_MARGIN = 5;
const BODY_C = [28, 38];
const BODY_OVER_GROUND_NIGHT = 2;
const HOT_OVER_AIR = 40;
const FIRE_C = 200;
const WATER_SPREAD = 4;
const MIN_PX = 200;

const opts = { scenes: 'itaipu-day,itaipu-night,swiss2-day,interior-day,interior-night', views: '', shots: '1' };
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.*)$/);
  if (!m) {
    positional.push(a);
    continue;
  }
  if (!(m[1] in opts)) {
    throw new Error(`thermal-physics-check: unknown option --${m[1]}`);
  }
  opts[m[1]] = m[2];
}
if (process.env.SIM_GPU !== '1') {
  throw new Error('thermal-physics-check: run with SIM_GPU=1; a software rasteriser cannot draw the thermal pass in floats');
}
if (!positional[0]) {
  throw new Error('thermal-physics-check: name a folder for the pictures, outside the repository');
}
const outDir = resolve(positional[0]);
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`thermal-physics-check: ${outDir} is inside the repository; pictures go outside it`);
}
await mkdir(outDir, { recursive: true });
const shots = opts.shots !== '0';

/* The Interior's poses, as scripts/interior-views.js makes them. */
const world = makeWorld({
  height: await readFile(join(root, 'src/share/interior/height.bin')),
  land: await readFile(join(root, 'src/share/interior/land.bin')),
  edits: landEdit,
});
function pose(e, n, h, le, ln, lh = 0) {
  const [x, z] = gridToWorld(e, n);
  const [lx, lz] = gridToWorld(le, ln);
  return [x, world.groundAt(x, z) + h, z, lx, world.groundAt(lx, lz) + lh, lz];
}
const [campX, campZ] = PLACES.claroViejo.at;
const campY = world.groundAt(campX, campZ);

/*
 * The scenes. `cam` as __setCam takes it (eye, then the point looked at);
 * `drone` puts the war's Striker that many metres in front of the camera
 * and an explosion 12 m to its side (sensor-check.js's arrangement);
 * `bed` names the meshes the lake-bed test hides. `expect` is what the
 * scene's views, together, must show.
 */
const ITAIPU_VIEWS = [
  { id: 'reservoir-dam', cam: [100, 221, -3000, 59, 222, -1746] },
  { id: 'reservoir-forest', cam: [-2400, 560, -2900, -3600, 225, -4100] },
  { id: 'crest-road', cam: [-313.8, 226.7, -1818.0, 233.9, 224, -1701.5] },
  { id: 'ground-crops-aerial', cam: [-600, 250, 3300, -1500, 0, 4400] },
  { id: 'aerial-dam', cam: [900, 800, -1150, -400, 150, -2300], drone: 40 },
  /* Pitched up, so the sky above thirty degrees is in the frame. */
  { id: 'sky-up', cam: [100, 240, -3000, 59, 900, -1746] },
];
const SCENES = [
  {
    id: 'itaipu-day', url: '/index.html?map=itaipu', map: 'itaipu', views: ITAIPU_VIEWS, expect: ['day', 'sky', 'hot', 'coverage'],
  },
  {
    id: 'itaipu-night', url: '/index.html?map=itaipu&time=night', map: 'itaipu', views: ITAIPU_VIEWS, expect: ['night', 'sky', 'hot', 'coverage'],
  },
  {
    id: 'swiss2-day',
    url: '/index.html?map=swiss2',
    map: 'swiss2',
    views: [
      { id: 'lake-high', cam: [420, 200, 1650, 173, 0, 2250], bed: true },
      { id: 'lake-shore', cam: [193, 5, 1880, 173, 4, 2400], bed: true },
      { id: 'village-20m', cam: [-120, 22, 150, -185, 4, 112] },
      { id: 'meadow-eye', cam: [60, 6.4, 300, -60, 4, 500] },
      { id: 'vista-high', cam: [300, 260, 900, -120, 60, -400] },
      { id: 'sky-up', cam: [0, 40, 900, 0, 700, 0] },
    ],
    expect: ['day', 'sky', 'lakebed', 'coverage'],
  },
  {
    id: 'interior-day',
    url: '/index.html?map=interior&people=demo&hour=11',
    map: 'interior',
    views: [
      { id: 'low-camp', cam: pose(8.6, 9.38, 60, 8.58, 9.455) },
      { id: 'zoom-camp-600', cam: [campX + 420, campY + 430, campZ + 40, campX, campY + 1, campZ], fov: 5.5 },
      { id: 'low-colonia', cam: pose(9.0, 5.9, 120, 9.35, 6.2) },
      { id: 'sky-up', cam: pose(9.0, 5.9, 120, 9.35, 6.2, 900) },
    ],
    expect: ['day', 'sky', 'people', 'campfire', 'coverage'],
  },
  {
    id: 'interior-night',
    url: '/index.html?map=interior&people=demo&hour=22',
    map: 'interior',
    views: [
      { id: 'low-camp', cam: pose(8.6, 9.38, 60, 8.58, 9.455) },
      { id: 'zoom-camp-600', cam: [campX + 420, campY + 430, campZ + 40, campX, campY + 1, campZ], fov: 5.5 },
      { id: 'low-colonia', cam: pose(9.0, 5.9, 120, 9.35, 6.2) },
      { id: 'sky-up', cam: pose(9.0, 5.9, 120, 9.35, 6.2, 900) },
    ],
    expect: ['night', 'sky', 'people', 'campfire', 'coverage'],
  },
];
const wantScenes = opts.scenes.split(',');
const wantViews = opts.views ? opts.views.split(',') : null;
for (const s of wantScenes) {
  if (!SCENES.some((x) => x.id === s)) {
    throw new Error(`thermal-physics-check: no scene ${s}`);
  }
}

/* sensorview.js's thermal core width. */
const sensorSrc = await readFile(join(root, 'src/render/sensorview.js'), 'utf8');
const THERMAL_W = Number((sensorSrc.match(/const THERMAL_W = (\d+);/) || [])[1]);
if (!THERMAL_W) {
  throw new Error('thermal-physics-check: no THERMAL_W in src/render/sensorview.js');
}

/*
 * The in page half. install() routes the post chain through the shell's
 * SensorManager (sensor full screen), makes a float target the thermal
 * core's size, and keeps the war's drawing at hand for a drone view.
 * measure() draws the thermal source and reads it back, grouped by class.
 */
const INSTALL = /* js */ `(async (thermalW) => {
  const THREE = window.__three;
  const s = window.__sensors;
  const scene = window.__mapScene();
  const post = scene.userData.post;
  if (!s || !post) { throw new Error('no __sensors or scene.userData.post'); }
  const renderer = post.composer.renderer;
  const gl = renderer.getContext();
  if (!gl.getExtension('EXT_color_buffer_float')) { throw new Error('no EXT_color_buffer_float'); }
  const thermal = await import(new URL('/src/render/thermal.js', location.origin).href);
  const real = post.render;
  const chain = { render: real, composer: post.composer };
  const routed = () => s.render(chain);
  s.setMainView('sensor');
  s.setMode('ir_wh');
  s.setZoom(1);
  /* The camera the shell draws with: the post chain's own. */
  const camera = post.composer.passes.find((p) => p.camera && p.camera.isPerspectiveCamera).camera;
  const { createAttackers } = await import('/src/render/attackers.js');
  const { createExplosions } = await import('/src/render/explosion.js');
  const att = createAttackers();
  const booms = createExplosions();
  scene.add(att.group, booms.group);
  let last = performance.now();
  const step = () => {
    const now = performance.now();
    booms.update(Math.min(0.05, (now - last) / 1000));
    last = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  let rt = null;
  const labels = () => thermal.thermalLabels();
  /* A label's class: what the checks compare. */
  const classOf = (lab, L) => {
    if (lab === L.sky) { return 'sky'; }
    for (const [k, v] of Object.entries(L.kinds)) {
      if (v === lab) {
        return ({ built: 'built', glass: 'built', warm: 'built', vegetation: 'vegetation', water: 'water', ground: 'ground', rock: 'ground', hot: 'hot', motor: 'motor', body: 'body', fire: 'fire', spray: 'veil' })[k] || k;
      }
    }
    for (const [name, v] of Object.entries(L.shaders)) {
      if (v === lab) {
        if (/sky/.test(name)) { return 'sky'; }
        if (/explosion/.test(name)) { return 'fire'; }
        if (/spray|smoke|mist/.test(name)) { return 'veil'; }
        if (/canopy|impostor|tree|grass|forest/.test(name)) { return 'vegetation'; }
        if (/water|fall/.test(name)) { return 'water'; }
        if (/glow|lamp|light/.test(name)) { return 'built'; }
        return 'shader:' + name;
      }
    }
    return 'label:' + lab;
  };
  /* The label is blue over green: a premultiplied layer scales both. A
   * pixel two layers blended into each other has no whole label, and is
   * left out of every class. */
  const labelAt = (px, k, L) => {
    const g = px[k + 1];
    const lab = px[k + 2] / g;
    if (!(g > 0.05) || Math.abs(lab - Math.round(lab)) > 0.05) { return 'mixed'; }
    return classOf(Math.round(lab), L);
  };
  const draw = (hide) => {
    const w = thermalW;
    const h = Math.max(1, Math.round(w / camera.aspect));
    if (!rt || rt.width !== w || rt.height !== h) {
      if (rt) { rt.dispose(); }
      rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: true });
    }
    const was = hide.map((m) => m.visible);
    hide.forEach((m) => { m.visible = false; });
    const hook = scene.onBeforeRender;
    scene.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try {
      thermal.renderThermal(renderer, scene, camera, rt);
    } finally {
      renderer.shadowMap.autoUpdate = auto;
      scene.onBeforeRender = hook;
      hide.forEach((m, k) => { m.visible = was[k]; });
    }
    const px = new Float32Array(w * h * 4);
    renderer.setRenderTarget(rt);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, px);
    renderer.setRenderTarget(null);
    return px;
  };
  const stats = (vals) => {
    vals.sort((a, b) => a - b);
    const n = vals.length;
    const at = (q) => vals[Math.min(n - 1, Math.floor(q * n))];
    let sum = 0;
    for (const v of vals) { sum += v; }
    return { n, mean: sum / n, p5: at(0.05), p25: at(0.25), p50: at(0.5), p75: at(0.75), p95: at(0.95), min: vals[0], max: vals[n - 1] };
  };
  window.__tp = {
    s, post, real, routed, att, booms, camera, gl, scene,
    labels,
    /* Temperatures by class, C, of one thermal draw; the raw sums too, so
     * a scene can pool its views. */
    measure(hideNames = []) {
      const hide = [];
      scene.traverse((o) => { if (hideNames.includes(o.name)) { hide.push(o); } });
      const L = labels();
      const px = draw([]);
      const by = {};
      const T = ${100};
      let hottest = -Infinity;
      for (let k = 0; k < px.length; k += 4) {
        const c = labelAt(px, k, L);
        hottest = Math.max(hottest, px[k] * T);
        (by[c] || (by[c] = [])).push(px[k] * T);
      }
      const out = { classes: {}, sums: {}, hottest };
      for (const [c, v] of Object.entries(by)) {
        let sum = 0;
        for (const x of v) { sum += x; }
        out.sums[c] = { n: v.length, sum };
        out.classes[c] = stats(v);
      }
      if (hide.length) {
        /* The same draw with the named meshes hidden: the water's pixels
         * must not move. */
        const px2 = draw(hide);
        let moved = 0;
        let maxD = 0;
        for (let k = 0; k < px.length; k += 4) {
          if (labelAt(px, k, L) !== 'water') { continue; }
          const d = Math.abs(px[k] - px2[k]) * T;
          if (d > 0) { moved += 1; maxD = Math.max(maxD, d); }
        }
        out.bed = { hidden: hide.map((o) => o.name), moved, maxD };
      }
      return out;
    },
    /* The screen's picture as it is now: luminance spread and clipping. */
    display() {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      post.render();
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s1 = 0;
      let s2 = 0;
      let lo = 0;
      let hi = 0;
      const n = w * h;
      for (let k = 0; k < px.length; k += 4) {
        const l = (0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255;
        s1 += l;
        s2 += l * l;
        if (l <= 2 / 255) { lo += 1; }
        if (l >= 253 / 255) { hi += 1; }
      }
      const mean = s1 / n;
      return { mean, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), clipLo: lo / n, clipHi: hi / n };
    },
    /* Every drawn ShaderMaterial without a thermal output. */
    bare() {
      const out = new Set();
      scene.traverseVisible((o) => {
        const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of ms) {
          if (m.isShaderMaterial && !m.userData.thermal) { out.add(m.name || o.name || o.type); }
        }
      });
      return [...out];
    },
    /* The war's Striker d metres ahead of the camera, broadside. */
    drone(d) {
      const e = camera.position.clone();
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
      const at = e.clone().addScaledVector(f, d);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), right);
      att.update([{ id: 1, kind: 'strike', p: at.toArray(), q: q.toArray() }], 0, e);
      return at.clone().addScaledVector(right, 12).toArray();
    },
    clearDrone() {
      att.update([], 0, camera.position);
      booms.clear();
    },
  };
  return true;
})`;

async function settle(page, map) {
  for (let k = 0; k < 2; k += 1) {
    await page.evaluate('window.__cf = window.__boot().frames');
    await page.until('window.__boot().frames > window.__cf + 2', 60000);
    if (map === 'itaipu') {
      await page.until('(() => { const t = window.__mapScene().userData.itaipu.terrain; return t.stats().queuedBuilds === 0 && !t.job; })()', 120000);
    } else if (map === 'interior') {
      await page.until(`(() => { const u = window.__mapScene().userData.interior;
        const t = u.terrain.stats(); const tr = u.trees.stats();
        return t.queuedBuilds === 0 && !u.terrain.job && tr.pending === 0; })()`, 120000);
    }
  }
}

const failures = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok === null ? 'skip' : ok ? 'pass' : 'FAIL'}  ${name}  (${detail})`);
  if (ok === false) {
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

const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
const report = {};
for (const sc of SCENES.filter((x) => wantScenes.includes(x.id))) {
  console.log(`${sc.id}:`);
  const page = await openPage({
    root, width: W, height: H, url: sc.url, seed,
  });
  const views = {};
  const pool = {};
  const extra = { coverage: new Set(), display: [], bed: [], fire: [], engine: [] };
  try {
    await page.until(`window.__map && window.__map().id === "${sc.map}" && window.__map().ready`, 300000);
    const graphics = await page.evaluate('window.__map().graphics');
    if (graphics !== 'high') {
      throw new Error(`thermal-physics-check: ${sc.map} was built at ${graphics}, not high`);
    }
    await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
    await page.evaluate(`${INSTALL}(${THERMAL_W})`);
    for (const v of sc.views.filter((x) => !wantViews || wantViews.includes(x.id))) {
      await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${v.fov || FOV}), "")`);
      await settle(page, sc.map);
      await page.sleep(2000);
      const tag = `${sc.id}-${v.id}`;
      if (shots) {
        await page.evaluate('(window.__tp.post.render = window.__tp.real, "")');
        await page.sleep(600);
        const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        await writeFile(join(outDir, `${tag}-eo.png`), Buffer.from(data, 'base64'));
      }
      await page.evaluate('(window.__tp.post.render = window.__tp.routed, "")');
      /* The gain settles on the picture. */
      await page.sleep(1500);
      if (shots) {
        const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        await writeFile(join(outDir, `${tag}-ir_wh.png`), Buffer.from(data, 'base64'));
      }
      const disp = await page.evaluate('window.__tp.display()');
      extra.display.push({ view: v.id, ...disp });
      for (const b of await page.evaluate('window.__tp.bare()')) {
        extra.coverage.add(b);
      }
      const bedNames = v.bed ? ['swiss2-lake-bed', 'swiss2-lake-near-bed'] : [];
      const m = await page.evaluate(`window.__tp.measure(${JSON.stringify(bedNames)})`);
      if (m.bed) {
        extra.bed.push({ view: v.id, ...m.bed, water: m.classes.water || null });
      }
      for (const [c, x] of Object.entries(m.sums)) {
        const p = pool[c] || (pool[c] = { n: 0, sum: 0 });
        p.n += x.n;
        p.sum += x.sum;
      }
      views[v.id] = { classes: m.classes, display: disp };
      const line = Object.entries(m.classes).sort((a, b) => b[1].n - a[1].n)
        .map(([c, x]) => `${c} ${f1(x.mean)} [${f1(x.p5)}..${f1(x.p95)}] n${x.n}`).join('  ');
      console.log(`  ${v.id.padEnd(20)} ${line}`);
      console.log(`  ${''.padEnd(20)} display sd ${disp.sd.toFixed(3)} clip ${(100 * disp.clipLo).toFixed(1)}%/${(100 * disp.clipHi).toFixed(1)}%`);
      if (v.drone) {
        const boomAt = await page.evaluate(`JSON.stringify(window.__tp.drone(${v.drone}))`);
        await page.sleep(800);
        const e = await page.evaluate('window.__tp.measure()');
        extra.engine.push({ view: v.id, hot: e.classes.hot || null });
        await page.evaluate(`(window.__tp.booms.play(${boomAt}, 1.4), "")`);
        await page.sleep(500);
        const f = await page.evaluate('window.__tp.measure()');
        extra.fire.push({ view: v.id, before: e.hottest, after: f.hottest });
        if (shots) {
          const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
          await writeFile(join(outDir, `${tag}-fire-ir_wh.png`), Buffer.from(data, 'base64'));
          await page.evaluate('(window.__tp.post.render = window.__tp.real, "")');
          await page.sleep(300);
          const eo = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
          await writeFile(join(outDir, `${tag}-fire-eo.png`), Buffer.from(eo.data, 'base64'));
          await page.evaluate('(window.__tp.post.render = window.__tp.routed, "")');
        }
        console.log(`  ${''.padEnd(20)} engine max ${f1(e.classes.hot && e.classes.hot.max)} C, hottest pixel ${f1(e.hottest)} C before the explosion, ${f1(f.hottest)} C after`);
        await page.evaluate('(window.__tp.clearDrone(), "")');
        await page.sleep(2500);
      }
    }
    const real = page.errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
    for (const e of real) {
      check(`${sc.id} console`, false, e);
    }
  } finally {
    await page.close();
  }

  /* The scene's verdicts, over its views pooled. */
  const mean = (c) => (pool[c] && pool[c].n >= MIN_PX ? pool[c].sum / pool[c].n : null);
  const has = (...cs) => cs.every((c) => mean(c) !== null);
  const means = Object.fromEntries(Object.keys(pool).map((c) => [c, mean(c)]));
  console.log(`  pooled means: ${Object.entries(means).filter(([, x]) => x !== null).map(([c, x]) => `${c} ${f1(x)}`).join(', ')}`);
  for (const e of sc.expect) {
    if (e === 'day') {
      check(`${sc.id} day: built > vegetation > water`, has('built', 'vegetation', 'water') ? mean('built') > mean('vegetation') && mean('vegetation') > mean('water') : (has('built', 'vegetation') ? mean('built') > mean('vegetation') : false),
        `built ${f1(mean('built'))}, vegetation ${f1(mean('vegetation'))}, water ${f1(mean('water'))}`);
    } else if (e === 'night') {
      const land = ['vegetation', 'ground'].filter((c) => mean(c) !== null);
      check(`${sc.id} night: water > land`, has('water') && land.length > 0 && land.every((c) => mean('water') > mean(c)),
        `water ${f1(mean('water'))}, ${land.map((c) => `${c} ${f1(mean(c))}`).join(', ') || 'no land'}`);
    } else if (e === 'sky') {
      /* The coldest of the sky against the coldest of everything else:
       * the sky near the horizon is near the air's temperature, as it is
       * in a real camera, so a mean would fail a correct sky. */
      const low = {};
      for (const v of Object.values(views)) {
        for (const [c, x] of Object.entries(v.classes)) {
          if (x.n >= MIN_PX && c !== 'veil' && c !== 'mixed') { low[c] = Math.min(low[c] ?? Infinity, x.p5); }
        }
      }
      const others = Object.keys(low).filter((c) => c !== 'sky');
      const coldest = Math.min(...others.map((c) => low[c]));
      check(`${sc.id} sky coldest`, low.sky !== undefined && low.sky < coldest - SKY_MARGIN,
        `sky p5 ${f1(low.sky)}, coldest other p5 ${f1(coldest)} (${others.find((c) => low[c] === coldest)})`);
    } else if (e === 'people') {
      const b = mean('body');
      const g = mean('ground') ?? mean('vegetation');
      const night = sc.expect.includes('night');
      check(`${sc.id} people`, b !== null && b >= BODY_C[0] && b <= BODY_C[1] && (!night || b > g + BODY_OVER_GROUND_NIGHT),
        `body ${f1(b)} C (${pool.body ? pool.body.n : 0} px), ground ${f1(g)}`);
    } else if (e === 'campfire') {
      const fire = Object.values(views).map((v) => v.classes.fire).filter(Boolean);
      const mx = Math.max(-Infinity, ...fire.map((x) => x.max));
      check(`${sc.id} campfire`, mx > FIRE_C, `hottest fire pixel ${f1(mx)} C`);
    } else if (e === 'hot') {
      const eng = extra.engine.map((x) => (x.hot ? x.hot.max : -Infinity));
      /* The explosion's pool is additive, so it has no label of its own:
       * the frame's hottest pixel with it, which the engine's was under. */
      const fire = extra.fire.map((x) => x.after);
      const ground = mean('ground') ?? mean('built');
      check(`${sc.id} engine hot`, eng.length > 0 && Math.max(...eng) > ground + HOT_OVER_AIR, `engine max ${f1(Math.max(...eng))} C, ground mean ${f1(ground)}`);
      check(`${sc.id} explosion hot`, fire.length > 0 && Math.max(...fire) > FIRE_C, `explosion max ${f1(Math.max(...fire))} C`);
    } else if (e === 'lakebed') {
      for (const b of extra.bed) {
        const spread = b.water ? b.water.p95 - b.water.p5 : NaN;
        check(`${sc.id} ${b.view} lake bed hidden changes nothing`, b.hidden.length > 0 && b.water !== null && b.water.n >= MIN_PX && b.moved === 0,
          `${b.water ? b.water.n : 0} water pixels, ${b.moved} moved (max ${f1(b.maxD)} C) hiding ${b.hidden.join(', ') || 'nothing found'}`);
        if (b.view === 'lake-high') {
          check(`${sc.id} ${b.view} water is one skin`, spread < WATER_SPREAD, `water p5..p95 ${f1(b.water && b.water.p5)}..${f1(b.water && b.water.p95)} C, spread ${f1(spread)}`);
        }
      }
    } else if (e === 'coverage') {
      const bare = [...extra.coverage];
      check(`${sc.id} coverage`, bare.length === 0, bare.length ? `no thermal output: ${bare.join(', ')}` : 'every drawn ShaderMaterial has one');
    }
  }
  report[sc.id] = {
    views, pooled: means, bed: extra.bed, engine: extra.engine, fire: extra.fire, coverage: [...extra.coverage],
  };
}

await writeFile(join(outDir, 'thermal-physics.json'), `${JSON.stringify(report, null, 1)}\n`);
if (failures.length) {
  console.error(`FAIL, ${failures.length} problem(s):\n  ${failures.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`PASS, numbers and pictures in ${outDir}`);
}
