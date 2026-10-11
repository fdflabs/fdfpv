/*
 * weather-check.js: the shell hands the plant the air of
 * docs/WEATHER-CONTRACT.md, in the real page.
 *
 *     node scripts/weather-check.js      (npm run check:weather)
 *
 * The page's module is wrapped so every sim_set_wind is counted.
 * 1. A calm run makes no sim_set_wind call at all: a calm flight's call
 *    stream is the one from before weather existed.
 * 2. window.__weather('gusty', 42) and a fresh run: the shell sets the wind
 *    before steps, the plant reports wind (sim_wind), the page logs nothing.
 * 3. Gusty again: the new run's first call is still air, so the launch
 *    stand never steps in the last run's wind.
 * 4. Calm again and a fresh run: exactly one still call, and still air.
 * Exit 0 on a pass, 1 otherwise.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { graphics: 'low', graphicsAuto: false, sound: false, airframeAsked: true });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`, `(() => {
  const T = { calls: [], wrapped: false, wind: null };
  window.__windTest = T;
  const real = WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate = async (...args) => {
    const res = await real(...args);
    /* From a Module the answer is the Instance; from bytes, { module, instance }. */
    const inst = res instanceof WebAssembly.Instance ? res : res && res.instance;
    const ex = inst ? inst.exports : null;
    if (!ex || typeof ex.sim_step !== 'function' || T.wrapped) return res;
    T.wrapped = true;
    const out = {};
    for (const key of Object.keys(ex)) out[key] = ex[key];
    /* A reset starts a run: the calls are read per run, because the last
     * run goes on stepping between this check's evaluates. */
    out.sim_reset = (...a) => {
      T.calls.push('reset');
      return ex.sim_reset(...a);
    };
    out.sim_set_wind = (...a) => {
      T.calls.push(a);
      return ex.sim_set_wind(...a);
    };
    T.wind = () => {
      const p = ex.malloc(16);
      ex.sim_wind(p);
      const w = Array.from(new Float64Array(ex.memory.buffer, p, 2));
      ex.free(p);
      return w;
    };
    const wrapped = { exports: out };
    return res instanceof WebAssembly.Instance ? wrapped : { module: res.module, instance: wrapped };
  };
})();`];

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const fly = `(async () => {
  window.__crashThrow({ fresh: true, x: 0, y: 300, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
  for (let i = 0; i < 40; i += 1) await new Promise((r) => requestAnimationFrame(r));
})()`;
/* The sim_set_wind calls of the run now flying, the ones after the last reset. */
const run = async () => JSON.parse(await page.evaluate(`JSON.stringify(window.__windTest.calls.slice(window.__windTest.calls.lastIndexOf('reset') + 1))`));

const page = await openPage({ root, width: 960, height: 540, url: '/index.html', seed });
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  check('the shell flies the wrapped module', await page.evaluate('window.__windTest.wrapped'));
  const map = await page.evaluate('window.__map().id');
  const errors0 = page.errors.length;
  await page.evaluate(fly);
  const calm = await page.evaluate("window.__windTest.calls.filter((c) => c !== 'reset').length");
  check('a calm run makes no sim_set_wind call', calm === 0, `${calm} calls on ${map}`);

  await page.evaluate("window.__weather('gusty', 42)");
  await page.evaluate(fly);
  const windy = (await run()).length;
  const w = JSON.parse(await page.evaluate('JSON.stringify(window.__windTest.wind())'));
  const speed = Math.hypot(w[0], w[1]);
  check('gusty: the wind is set before the steps', windy > 100, `${windy} calls`);
  check('and the plant flies in it', speed > 1, `sim_wind ${speed.toFixed(2)} m/s`);

  await page.evaluate(fly);
  const first = (await run())[0];
  check('a windy run after a windy one starts in still air, for the stand', Boolean(first) && first.every((v) => v === 0), `${first}`);

  await page.evaluate("window.__weather('calm', 0)");
  await page.evaluate(fly);
  const calmRun = await run();
  const w2 = JSON.parse(await page.evaluate('JSON.stringify(window.__windTest.wind())'));
  check('calm after wind: one still call, then none', calmRun.length === 1 && calmRun[0].every((v) => v === 0), JSON.stringify(calmRun.slice(0, 3)));
  check('and still air', w2[0] === 0 && w2[1] === 0, `${w2}`);
  /* The local server has no rooms or accounts behind it: their refused
   * connections are the harness's, not the weather's. */
  const other = page.errors.slice(errors0).filter((e) => !/^network: .*ERR_CONNECTION_REFUSED/.test(e));
  check('the page logged nothing', other.length === 0, other.slice(0, 3).join(' | ').slice(0, 600));
} finally {
  await page.close();
}

console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
