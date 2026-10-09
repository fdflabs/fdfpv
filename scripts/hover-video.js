/*
 * hover-video.js: a person's hover of the Extra, filmed in the page with
 * the sticks on screen, for the owner to watch and for the pull request to
 * show. The person is extrapilot.js's: 0.2 s late, ten moves a second in
 * fiftieths of the stick, flying the hover the way the 3D video's pilot
 * does (docs/FLIGHTMODEL.md: let the torque roll turn slowly, about 75
 * deg/s, rather than stop it). Writes, under the output directory:
 *
 *   <name>.mp4      the run, chase view, the stick gimbals on screen
 *   <name>.json     the sticks every move, and the summary below
 *   <name>.png      the four sticks against time (tools/plot-sticks.py)
 *
 * and prints what a person's thumbs would have done: peak and mean
 * absolute deflection per axis, the stick rate (travel per second over
 * 100 ms, peak and 95th percentile), and the reversals per second.
 *
 *   node scripts/hover-video.js [tune] [outdir]   (tune: extra-as3x)
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

import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { PILOT } from './lib/extrapilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/extra-thresholds.json'), 'utf8'));
const TUNE = process.argv[2] ?? 'extra-as3x';
const OUT = process.argv[3] ?? join(process.env.HOME, '.cache/fdfpv-w34-flightmodel/hover-videos');
const NAME = `${TUNE}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const FRAMES = join(OUT, `${NAME}-frames`);
await mkdir(FRAMES, { recursive: true });

const page = await openPage({ root, width: 960, height: 540, url: '/index.html' });
let frame = 0;
try {
  await page.until('!!window.__shellReady', 240000);
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === 'extra3d1308')); ui.cursor = i; ui.pick('extra3d1308'); ui.settings.tune = '${TUNE}'; ui.settings.wingView = 'chase'; ui.persistSettings(); ui.show('title'); return true; })()`);
  await page.evaluate("window.__showSticks = true; window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
  await page.sleep(2000);
  await page.evaluate(PILOT('video', th));
  /* The four sticks' values over the gimbals, for the film only. */
  await page.evaluate(`(() => {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);font:600 14px monospace;color:#fff;background:rgba(0,0,0,.55);padding:4px 10px;border-radius:4px;z-index:99999;white-space:pre';
    document.body.appendChild(box);
    const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);
    const tick = () => {
      const s = window.__T && window.__T.sticks && window.__T.sticks.length ? window.__T.sticks[window.__T.sticks.length - 1] : null;
      box.textContent = s ? 'roll ' + f(s[1]) + '  pitch ' + f(s[2]) + '  yaw ' + f(s[3]) + '  throttle ' + s[4].toFixed(2) + '\\n' + 'roll rate ' + s[5].toFixed(0) + ' deg/s   nose off vertical ' + s[6].toFixed(0) + ' deg' : 'the person takes over at the vertical';
      requestAnimationFrame(tick);
    };
    tick();
  })()`);
  const t0 = Date.now();
  /* Film once the person has it: from the hand over to the end. */
  while (Date.now() - t0 < 900000 && !(await page.evaluate('window.__T.done'))) {
    if (await page.evaluate("window.__T.at === 'human' || window.__T.at === 'pull'")) {
      const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, page.sessionId);
      frame += 1;
      await writeFile(join(FRAMES, `f${String(frame).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
    } else {
      await page.sleep(200);
    }
  }
  const T = await page.evaluate('window.__T');
  const r = T.res || {};
  const sticks = T.sticks || [];
  /* What the thumbs did over the judged 10 s (after the 3 s to catch it). */
  /* Resampled every 100 ms, the pilot's own move interval: a stick rate
   * is a change over 100 ms, as a thumb makes it, not one display frame's
   * jump. */
  const judged = [];
  for (const x of sticks.filter((y) => y[0] >= 3)) {
    if (!judged.length || x[0] - judged[judged.length - 1][0] >= 0.1) judged.push(x);
  }
  const names = ['roll', 'pitch', 'yaw', 'throttle'];
  const human = {};
  for (let k = 0; k < 4; k += 1) {
    const v = judged.map((x) => x[k + 1]);
    const centre = k === 3 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    const rate = [];
    let rev = 0, lastSign = 0;
    for (let i = 1; i < judged.length; i += 1) {
      const dv = v[i] - v[i - 1];
      rate.push(Math.abs(dv) / (judged[i][0] - judged[i - 1][0]));
      const sg = Math.sign(dv);
      if (sg !== 0) {
        if (lastSign !== 0 && sg !== lastSign) rev += 1;
        lastSign = sg;
      }
    }
    rate.sort((a, b) => a - b);
    const span = judged[judged.length - 1][0] - judged[0][0];
    human[names[k]] = {
      peak: Math.max(...v.map((x) => Math.abs(x - centre))),
      meanAbs: v.reduce((a, x) => a + Math.abs(x - centre), 0) / v.length,
      ratePeak: rate[rate.length - 1],
      rate95: rate[Math.floor(0.95 * (rate.length - 1))],
      reversalsPerS: rev / 2 / span,
    };
  }
  await writeFile(join(OUT, `${NAME}.json`), JSON.stringify({ tune: TUNE, result: r, human, sticks }, null, 1));
  const fps = Math.max(1, Math.round(frame / Math.max(1, (sticks.length ? sticks[sticks.length - 1][0] : 1) + 4)));
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(FRAMES, 'f%05d.jpg'), '-pix_fmt', 'yuv420p', join(OUT, `${NAME}.mp4`)], { stdio: 'inherit' });
  spawnSync('python3', ['-I', join(root, 'tools/plot-sticks.py'), join(OUT, `${NAME}.json`), join(OUT, `${NAME}.png`)], { stdio: 'inherit' });
  await rm(FRAMES, { recursive: true, force: true });
  console.log(JSON.stringify({ video: join(OUT, `${NAME}.mp4`), plot: join(OUT, `${NAME}.png`), frames: frame, held: r.human, crashed: r.crashed }));
  for (const [k, h] of Object.entries(human)) {
    console.log(`${k.padEnd(9)} peak ${h.peak.toFixed(2)}, mean abs ${h.meanAbs.toFixed(3)}, stick rate peak ${h.ratePeak.toFixed(2)}/s, 95th ${h.rate95.toFixed(2)}/s, reversals ${h.reversalsPerS.toFixed(2)}/s`);
  }
} finally {
  await page.close();
}
