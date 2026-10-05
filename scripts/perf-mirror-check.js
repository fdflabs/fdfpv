/*
 * perf-mirror-check.js: the swiss2 lake's mirror, drawn only where the
 * water can read it, must give the picture the whole mirror gives.
 *
 * src/maps/swiss2/water/lake.js scissors the mirror's draw to the texels
 * the lake's surfaces can sample. This parks the camera at the swiss2
 * views the lake is in, holds the clocks, and draws the scene four times
 * in turn: scissored, whole, scissored, whole. Whole is the scissor
 * forced off on the mirror's target, the draw as it was before. Before
 * each scissored draw the whole target is cleared to magenta, so a water
 * pixel that reads a texel the scissor left out reads magenta and the
 * picture changes.
 *
 * What is compared is the scene pass, the light before any post pass, in
 * a half float target read back as floats: the post chain's grain and the
 * meter's adaptation move between two draws of one frame, the scene does
 * not. The two scissored draws and the two whole ones are each compared
 * with each other (what one draw drawn twice differs by), and the
 * scissored with the whole (the change). It fails if the change is larger
 * at any pixel than the repeat, and prints how much of the mirror the
 * scissor kept.
 *
 *     SIM_GPU=1 node scripts/perf-mirror-check.js [OUT_DIR] [--waves]
 *
 * --waves hands the plant's waves to the lake first (window.__wavesOn),
 * as swiss2-views.js does, so the sheet is displaced and the ripples'
 * slope carries the waves' own: the case the scissor's margins are for.
 *
 * OUT_DIR gets each view's finished picture, scissored, for the eye; it
 * stays out of the repository.
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
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (process.env.SIM_GPU !== '1') {
  throw new Error('perf-mirror-check: run with SIM_GPU=1; the mirror is High only and needs the GPU');
}
const waves = process.argv.includes('--waves');
const outDir = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || join(tmpdir(), 'fdfpv-mirror-check'));
await mkdir(outDir, { recursive: true });

/* scripts/swiss2-views.js's views with the lake in them, the same
 * cameras, and two low over the valley as perf-play's swiss-low flies
 * it, the lake a strip toward the horizon. */
const FOV = 44;
const VIEWS = [
  { id: 'lake-shore', cam: [193, 5, 1880, 173, 4, 2400] },
  { id: 'lake-high', cam: [420, 200, 1650, 173, 0, 2250] },
  { id: 'lake-edge', cam: [193, 2.2, 1985, 173, 1, 2400] },
  { id: 'meadow-eye', cam: [60, 6.4, 300, -60, 4, 500] },
  { id: 'into-sun', cam: [0, 40, 0, 450, 200, 640] },
  { id: 'lake-village-20m', cam: [120, 22, 2655, 70, 8, 2735] },
  { id: 'low-south', cam: [0, 14, 900, 120, 8, 1600] },
  { id: 'low-southwest', cam: [300, 14, 1100, -100, 8, 1900] },
];

/* The in page half: P is swiss2.js's __SWISS2_PERF. */
const INSTALL = /* js */ `(() => {
  const P = globalThis.__SWISS2_PERF;
  const THREE = window.__three;
  const r = P.renderer;
  const gl = r.getContext();
  /* The mirror's target is the one target drawn with a scissor. In
   * whole mode its scissor is forced off, as before the change. */
  let whole = false;
  let mirrorRT = null;
  const setRT = r.setRenderTarget.bind(r);
  r.setRenderTarget = (rt, ...a) => {
    if (rt && rt.scissorTest) {
      mirrorRT = rt;
      if (whole) { rt.scissorTest = false; }
    }
    return setRT(rt, ...a);
  };
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
  const MAGENTA = new THREE.Color(1, 0, 1);
  const keep = new THREE.Color();
  const poison = () => {
    if (!mirrorRT) { return; }
    const was = mirrorRT.scissorTest;
    mirrorRT.scissorTest = false;
    const alpha = r.getClearAlpha();
    r.getClearColor(keep);
    setRT(mirrorRT);
    r.setClearColor(MAGENTA, 1);
    r.clear();
    r.setClearColor(keep, alpha);
    setRT(null);
    mirrorRT.scissorTest = was;
  };
  const frame = (asWhole, t) => {
    whole = asWhole;
    try {
      if (!asWhole) { poison(); }
      P.updateWind(t);
      P.stage.water.update(0, P.camera);
      const stats = { ...P.stage.water.group.userData.stats };
      setRT(sceneRT);
      r.render(P.scene, P.camera);
      const px = new Float32Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, px);
      setRT(null);
      return { px, stats };
    } finally {
      whole = false;
    }
  };
  const diff = (a, b) => {
    let max = 0;
    let n = 0;
    for (let k = 0; k < a.length; k += 1) {
      if ((k & 3) === 3) { continue; }
      const d = Math.abs(a[k] - b[k]);
      if (d > 0) { n += 1; max = Math.max(max, d); }
    }
    return { max, channels: n };
  };
  window.__mirrorCompare = (t) => {
    /* One scissored draw first, so the mirror's target is known before
     * the first poison. */
    frame(false, t);
    const f = [frame(false, t), frame(true, t), frame(false, t), frame(true, t)];
    P.post.render();
    return JSON.stringify({
      repeatScissor: diff(f[0].px, f[2].px), repeatWhole: diff(f[1].px, f[3].px), change: diff(f[0].px, f[1].px),
      stats: f[0].stats, poisoned: Boolean(mirrorRT), png: r.domElement.toDataURL('image/png'),
    });
  };
  return JSON.stringify({ w, h, quality: P.quality });
})()`;

const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'sky1800');
const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)}, { graphics: 'high', graphicsAuto: false, perfMode: 'quality', airframeAsked: true });
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* Storage refused: the quality check below fails the run. */ }
  globalThis.__SWISS2_PERF = {};`];

const page = await openPage({ root, width: 1600, height: 900, url: '/index.html?map=swiss2', seed });
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
let failed = 0;
try {
  await page.until('window.__map && window.__map().id === "swiss2" && window.__map().ready', 300000);
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  if (waves && !(await page.evaluate('window.__wavesOn()'))) {
    throw new Error('perf-mirror-check: --waves, and the map took no waves');
  }
  const info = JSON.parse(await page.evaluate(INSTALL));
  if (info.quality !== 'high') {
    throw new Error(`perf-mirror-check: the map was built at ${info.quality}, the mirror is High's`);
  }
  console.log(`swiss2 High, ${info.w}x${info.h}${waves ? ', waves on' : ', still water'}`);
  await page.sleep(2500);
  for (const v of VIEWS) {
    if (!(await page.evaluate(`window.__heightAt(${v.cam[0]}, ${v.cam[2]}) < ${v.cam[1] - 1}`))) {
      throw new Error(`perf-mirror-check: ${v.id}'s camera is within a metre of the ground`);
    }
    await page.evaluate(`(window.__setCam(${v.cam.join(',')}, ${FOV}), "")`);
    await page.sleep(2500);
    await page.evaluate('window.__drawOff(true)');
    const t = await page.evaluate('performance.now() / 1000');
    const r = JSON.parse(await page.evaluate(`window.__mirrorCompare(${t})`));
    await page.evaluate('window.__drawOff(false)');
    await writeFile(join(outDir, `${v.id}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    const noise = Math.max(r.repeatScissor.max, r.repeatWhole.max);
    const drawn = r.stats.mirrorDrawn;
    const ok = r.change.max <= noise && (!drawn || r.poisoned);
    failed += ok ? 0 : 1;
    const share = drawn ? `${(r.stats.mirrorShare * 100).toFixed(1)} % of the mirror drawn` : 'mirror not drawn';
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${v.id.padEnd(18)} ${share.padEnd(28)} scissored vs whole: ${r.change.channels} channels differ, max ${r.change.max}; repeat: max ${noise}`);
  }
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await page.close();
}
console.log(`-> ${outDir}`);
if (failed) {
  console.error(`perf-mirror-check: ${failed} view(s) changed with the scissor`);
  process.exit(1);
}
