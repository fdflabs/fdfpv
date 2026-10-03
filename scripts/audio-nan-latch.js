/*
 * audio-nan-latch.js: one non-finite number into a worklet must not
 * silence the page (src/render/worklet-guard.js). On the real shell:
 *
 *   SIM_GPU=1 npm run audio:latch
 *
 * One headless page, the default map, the audio woken as a pilot's first
 * key wakes it. The master's level is sampled (an AnalyserNode on it) for
 * 4 s; then one frame with a NaN listener and one source with a NaN
 * position go straight to the world's worklet, past WorldAudio, as a bug
 * upstream would send them; then the level is sampled for 6 s more.
 *
 * What must hold:
 *   - the master is sounding before (the menu's music bed)
 *   - after, every sample is finite and it is sounding again within 1 s
 *   - the context still says running, and no worklet died
 *
 * Before the guard, the same injection left the master NaN, so silent, for
 * good: the worklet's filters held the NaN, and the master limiter's
 * envelope latched it, taking the music down with everything else. That is
 * the owner's "the sound keeps stopping" (2 October), until a reload.
 *
 * Local, not in CI: it boots the shell.
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
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  failed += ok ? 0 : 1;
}

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { graphics: 'low', graphicsAuto: false, sound: true, music: 5 });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) {}`];

console.log('one NaN into the world\'s worklet, and the page keeps its sound');
const page = await openPage({ root, width: 960, height: 540, seed });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready', 240000);
  await page.tap('Space');
  await page.until('window.__audio && window.__audio.ctx && window.__audio.worldNode', 60000);
  await page.evaluate(`(() => {
    const a = window.__audio;
    const an = a.ctx.createAnalyser();
    an.fftSize = 2048;
    a.master.connect(an);
    const buf = new Float32Array(2048);
    window.__latch = [];
    setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      let bad = 0;
      for (const v of buf) {
        if (Number.isFinite(v)) { s += v * v; } else { bad += 1; }
      }
      window.__latch.push({ t: a.ctx.currentTime, bad, db: 10 * Math.log10(s / buf.length + 1e-30) });
    }, 250);
    return true;
  })()`);
  await sleep(4000);
  const injectAt = await page.evaluate(`(() => {
    const a = window.__audio;
    const t = a.ctx.currentTime;
    a.worldNode.port.postMessage({ frame: { t, lis: [NaN, 2, 0, 0, 0, -1, 1, 0, 0, 0], src: new Float64Array(0) } });
    const src = new Float64Array(16);
    src.set([999, 0, NaN, 30, 0, 0, 0, 0]);
    a.worldNode.port.postMessage({ frame: { t: t + 0.02, lis: [0, 2, 0, 0, 0, -1, 1, 0, 0, 0], src } });
    return t;
  })()`);
  await sleep(6000);
  const r = await page.evaluate('({ s: window.__latch, state: window.__audio.ctx.state, faults: window.__audio.faults || [] })');
  const before = r.s.filter((x) => x.t < injectAt);
  const after = r.s.filter((x) => x.t > injectAt + 1);
  const fmt = (xs) => xs.map((x) => (x.bad ? 'NaN' : x.db.toFixed(0))).join(' ');
  console.log(`  before: ${fmt(before)}`);
  console.log(`  after:  ${fmt(after)}`);
  check('the master is sounding before', before.length > 4 && before.every((x) => !x.bad && x.db > -70), `${before.length} samples`);
  check('after the NaN, every sample is finite', after.length > 10 && after.every((x) => !x.bad), `${after.filter((x) => x.bad).length} of ${after.length} non-finite`);
  check('and the master is sounding again within 1 s', after.length > 10 && after.every((x) => x.db > -70), `quietest ${Math.min(...after.map((x) => (x.bad ? -999 : x.db))).toFixed(1)} dB`);
  check('the context still runs', r.state === 'running', r.state);
  check('no worklet died', !r.faults.some((f) => f.kind === 'died'), JSON.stringify(r.faults.slice(0, 2)));
} finally {
  if (page.errors.length) {
    console.log(`  page errors (the guard reports a refusal loudly, which is expected here): ${page.errors.length}`);
  }
  await page.close();
}
console.log(failed ? `audio:latch: ${failed} FAILED` : 'audio:latch: all passed');
process.exit(failed ? 1 : 0);
