/*
 * weather-haze-check.js: rain thickens each map's air, and dry is today's
 * look to the pixel (docs/WEATHER-CONTRACT.md, "Rain haze").
 *
 *     node scripts/weather-haze-check.js [outdir] [--maps=itaipu,interior,swiss2,alps]
 *                                        [--graphics=low|high] [--perf]
 *
 * Per map, the craft 150 m over its spawn, frames drawn in one task each
 * (window.__wetFrame: the look's setWet, its post chain, the canvas read
 * back), so nothing moves between frames but the rain:
 * dry, dry, dry, wet 0.3, dry, wet 1, dry: every even frame is compared
 * with the first, since a chain may swap two buffers frame by frame (the
 * alps' does).
 * 1. Dry twice: the same frame, so the comparisons below mean something.
 *    On Low (the default): High's lens has grain on a frame counter and
 *    a meter that adapts from frame to frame, so two of its frames are
 *    never one; the rain's code is the same on every preset.
 * 2. Wet 0.3 and wet 1: other frames, wet 1 further from dry than wet
 *    0.3 (mean luma difference on a thumbnail).
 * 3. Dry again after wet: the first dry frame, to the pixel.
 * With an outdir, pictures at wet 0, 0.3 and 1 held in the live loop.
 * --perf: the chain's draw, 200 pairs of a dry and a wet frame (the order
 * swapped every pair), each ended with a readback so the GPU's time is in
 * it; the median of the pairs' differences must be under 0.3 ms. Check
 * the GPU is quiet first (nvidia-smi pmon -c 1).
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const outdir = args.find((a) => !a.startsWith('--')) || null;
const maps = (args.find((a) => a.startsWith('--maps=')) || '--maps=itaipu,interior,swiss2,alps').slice(7).split(',');
const perf = args.includes('--perf');
const graphics = (args.find((a) => a.startsWith('--graphics=')) || '--graphics=low').slice(11);

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { graphics: ${JSON.stringify(graphics)}, graphicsAuto: false, sound: false, airframeAsked: true });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const fmt = (f) => `${f.hash.toString(16)} luma ${f.luma.toFixed(1)} contrast ${f.contrast.toFixed(2)}`;

for (const id of maps) {
  console.log(id);
  const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${id}`, seed });
  try {
    await page.until(`window.__map && window.__map().id === "${id}" && window.__map().ready`, 400000);
    await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
    const spawn = await page.evaluate('window.__map().spawn');
    await page.evaluate(`window.__crashThrow({ x: ${spawn.x}, y: ${spawn.y + 150}, z: ${spawn.z}, yaw: ${(spawn.yaw * 180) / Math.PI}, fresh: true })`);
    await page.sleep(1500);
    const r = JSON.parse(await page.evaluate(`(() => {
      const f = [0, 0, 0, 0.3, 0, 1, 0].map((w) => window.__wetFrame(w));
      return JSON.stringify({ a: f[0], a2: f[2], mid: f[3], b: f[5], c: f[6] });
    })()`));
    console.log(`  (${r.a.w} x ${r.a.h}, ${graphics})`);
    if (graphics === 'low') {
      check('dry twice is one frame', r.a.hash === r.a2.hash, `${fmt(r.a)} / ${fmt(r.a2)}`);
    }
    check('wet 0.3 and wet 1 are other frames', r.mid.hash !== r.a.hash && r.b.hash !== r.mid.hash, `${fmt(r.mid)} / ${fmt(r.b)}`);
    const off = (f) => f.thumb.reduce((m, v, i) => m + Math.abs(v - r.a.thumb[i]), 0) / f.thumb.length;
    check('wet 1 is further from dry than wet 0.3', off(r.b) > off(r.mid) && off(r.mid) > 0,
      `${off(r.mid).toFixed(1)} then ${off(r.b).toFixed(1)} grey levels`);
    if (graphics === 'low') {
      check('dry after wet is the dry frame to the pixel', r.c.hash === r.a.hash, fmt(r.c));
    }
    if (outdir) {
      await mkdir(outdir, { recursive: true });
      for (const w of [0, 0.3, 1]) {
        await page.evaluate(`(window.__wetHold(${w}), "")`);
        await page.sleep(300);
        const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
        await writeFile(join(outdir, `haze-${id}-${graphics}-wet${w}.png`), Buffer.from(data, 'base64'));
      }
      await page.evaluate('(window.__wetHold(null), "")');
    }
    if (perf) {
      const t = JSON.parse(await page.evaluate(`(() => {
        const gl = document.getElementById('view').getContext('webgl2');
        const px = new Uint8Array(4);
        const time = (w) => {
          const t0 = performance.now();
          window.__wetFrame(w);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return performance.now() - t0;
        };
        const dryT = [];
        const wetT = [];
        const diff = [];
        for (let i = 0; i < 200; i += 1) {
          const first = i % 2 ? 1 : 0;
          const t1 = time(first);
          const t2 = time(1 - first);
          const [d, w] = first ? [t2, t1] : [t1, t2];
          dryT.push(d);
          wetT.push(w);
          diff.push(w - d);
        }
        const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
        return JSON.stringify({ dry: med(dryT), wet: med(wetT), diff: med(diff) });
      })()`));
      check('perf: wet within 0.3 ms of dry (median of 200 paired frames, readback included)', t.diff < 0.3,
        `dry ${t.dry.toFixed(2)} ms, wet ${t.wet.toFixed(2)} ms, paired difference ${t.diff.toFixed(2)} ms`);
    }
    await page.evaluate('window.__wetFrame(0), ""');
    /* The rooms server is not started: its refusals are not the page's. */
    const other = page.errors.filter((e) => !/^network: .*ERR_CONNECTION_REFUSED/.test(e));
    check('the page logged nothing', other.length === 0, other.slice(0, 3).join(' | ').slice(0, 600));
  } finally {
    await page.close();
  }
}

console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
