/*
 * sky-smooth-check.js: do the clouds move smoothly while the camera does?
 *
 * The owner, 7 October: the clouds over Itaipu "move in visible jumps".
 * They did: the cumulus is marched into a cube round the camera one band
 * a frame (src/maps/itaipu/look/sky.js, THE SKY IS A CUBE), each band
 * from where the camera stood that frame, so a moving camera saw each
 * patch of sky hold still for the 24 frames a refresh takes and then
 * snap, band by band. This check flies the camera along a straight line
 * at a fixed step a drawn frame, past a sky full of cloud, and reads the
 * top of every frame back as it is drawn:
 *
 *     SIM_GPU=1 node scripts/sky-smooth-check.js [--map=itaipu|interior] [OUT_DIR]
 *
 * For each frame, the mean absolute difference from the frame before
 * over the sky crop's 16 pixel blocks (0 to 255 a channel; a block's
 * mean, because the post chain's grain changes every pixel every frame
 * and would bury the cloud's motion). Smooth motion changes every frame
 * by about the same amount; stepped motion leaves most frames at the
 * grain's floor and puts the change in a few. It fails when the largest
 * change is more than JUMP_MAX times the median (main before the fix:
 * 13.3 on Itaipu and 27.6 on the Interior, a spike every 24 frames;
 * after: 1.4 and 1.0), or when the sky
 * did not change at all (no cloud in the crop, or the camera never
 * moved).
 *
 * Writes OUT_DIR/sky-smooth-<map>.json (every frame's change) and a
 * picture of the first frame, when OUT_DIR is given; renders go outside
 * the repository. Needs the real GPU, as the views scripts do.
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

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Where each map's run starts, metres: a point over open ground, the
 * height over it, the heading flown and the look (the camera faces
 * across its track, tilted up so the top of the frame is cloud). The
 * step is 1.5 m a drawn frame, 135 m/s at 90 fps: a dive's speed, which
 * puts the near cloud a pixel or so over a frame. */
const RUNS = {
  itaipu: { at: [-1400, -200, 1000], over: 250 },
  interior: { at: null, over: 250 },
};
const STEP = 1.5;
const FRAMES = 150;
const JUMP_MAX = 2;
const FOV = 60;

const opts = { map: 'itaipu' };
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
  throw new Error('sky-smooth-check: run with SIM_GPU=1; a software rasteriser draws too few frames to judge motion');
}
const run = RUNS[opts.map];
if (!run) {
  throw new Error(`sky-smooth-check: --map is one of ${Object.keys(RUNS).join(', ')}, got ${opts.map}`);
}
const outDir = positional[0] ? resolve(positional[0]) : null;
if (outDir && (outDir === root || outDir.startsWith(`${root}/`))) {
  throw new Error(`sky-smooth-check: ${outDir} is inside the repository; renders go outside it`);
}

const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* Storage refused; the preset check below says so. */ }`];

/* In the page: each animation frame, park the camera one step further
 * along the line before the shell draws, and read the sky crop back
 * after it has, while the drawing buffer still holds the frame. */
const FLY = (from, dir, look) => /* js */ `(async () => {
  const gl = document.getElementById('view').getContext('webgl2');
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const ch = Math.floor(h / 4);
  const a = new Uint8Array(w * ch * 4);
  const B = 16;
  const bw = Math.floor(w / B);
  const bh = Math.floor(ch / B);
  let prev = null;
  let k = 0;
  const diffs = [];
  const raf = window.requestAnimationFrame.bind(window);
  const pose = (i) => {
    const p = ${JSON.stringify(from)}.map((v, j) => v + ${JSON.stringify(dir)}[j] * ${STEP} * i);
    return [...p, p[0] + ${look[0]}, p[1] + ${look[1]}, p[2] + ${look[2]}];
  };
  window.__setCam(...pose(0), ${FOV});
  await new Promise((done) => setTimeout(done, 3000));
  await new Promise((done) => {
    window.requestAnimationFrame = (cb) => raf((t) => {
      if (k > ${FRAMES}) { return cb(t); }
      window.__setCam(...pose(k), ${FOV});
      const r = cb(t);
      const cur = a;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.readPixels(0, h - ch, w, ch, gl.RGBA, gl.UNSIGNED_BYTE, cur);
      const m = new Float32Array(bw * bh);
      for (let y = 0; y < bh * B; y += 1) {
        for (let x = 0; x < bw * B; x += 1) {
          const i = (y * w + x) * 4;
          m[Math.floor(y / B) * bw + Math.floor(x / B)] += cur[i] + cur[i + 1] + cur[i + 2];
        }
      }
      if (prev) {
        let s = 0;
        for (let i = 0; i < m.length; i += 1) {
          s += Math.abs(m[i] - prev[i]);
        }
        diffs.push(s / (m.length * B * B * 3));
      }
      prev = m;
      k += 1;
      if (k > ${FRAMES}) { window.requestAnimationFrame = raf; done(); }
      return r;
    });
  });
  return diffs;
})()`;

const page = await openPage({
  root, width: 1600, height: 900, url: `/index.html?map=${opts.map}`, seed,
});
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
let failed = false;
try {
  await page.until(`window.__map && window.__map().id === ${JSON.stringify(opts.map)} && window.__map().ready`, 300000);
  const graphics = await page.evaluate('window.__map().graphics');
  if (graphics !== 'high') {
    throw new Error(`sky-smooth-check: the map was built at ${graphics}, not high`);
  }
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  let [x, , z] = run.at || [];
  if (!run.at) {
    const s = await page.evaluate('window.__map().spawn');
    x = s.x;
    z = s.z;
  }
  const ground = await page.evaluate(`window.__heightAt(${x}, ${z})`);
  const from = [x, ground + run.over, z];
  /* Flown east, looking north and 25 degrees up. */
  const diffs = await page.evaluate(FLY(from, [1, 0, 0], [0, Math.tan((25 * Math.PI) / 180), -1]));
  const sorted = diffs.slice().sort((p, q) => p - q);
  const median = sorted[sorted.length >> 1];
  const mean = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  const max = sorted[sorted.length - 1];
  const jump = max / Math.max(median, 1e-6);
  console.log(`${opts.map}: ${diffs.length} frames, change a frame mean ${mean.toFixed(3)} median ${median.toFixed(3)} max ${max.toFixed(3)}`);
  console.log(`  largest/median ${jump.toFixed(1)} (max ${JUMP_MAX})`);
  if (!(mean > 0.01)) {
    console.log('  FAIL the sky did not change at all: is there cloud in the crop?');
    failed = true;
  }
  if (jump > JUMP_MAX) {
    console.log('  FAIL jumps: the sky moved in steps');
    failed = true;
  }
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, `sky-smooth-${opts.map}.json`), JSON.stringify({ from, mean, median, max, jump, diffs }, null, 1));
    await page.evaluate(`(window.__setCam(${from.join(',')}, ${from[0]}, ${from[1] + Math.tan((25 * Math.PI) / 180)}, ${from[2] - 1}, ${FOV}), "")`);
    await page.sleep(1500);
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(outDir, `sky-smooth-${opts.map}.png`), Buffer.from(data, 'base64'));
  }
} finally {
  await page.close();
}
console.log(failed ? 'sky-smooth-check: FAIL' : 'sky-smooth-check: PASS');
process.exit(failed ? 1 : 0);
