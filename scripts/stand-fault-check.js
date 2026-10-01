/*
 * stand-fault-check.js: a plant state that is not a state, read while the
 * launch stand holds the craft, is caught as one read in flight is.
 *
 *   node scripts/stand-fault-check.js
 *
 * PR #256 judged the plant's state at the shell's boundary after every
 * flight step (main.js, plantStateSound and plantFault): a value that is
 * not finite, or a spin past SIM_RATE_MAX, is counted in
 * window.__crash().plantFaults and the craft is wrecked where it last was
 * sound. The launch stand's steps (launchStaging, launch control held on
 * the pad) went round that judgement: their state went straight to the
 * render and everything after it.
 *
 * The page's module is wrapped before the shell loads it, so the check can
 * say when the shell is staging and hand it one bad state: launch control
 * is reported held (sim_launch_control_state), the stand is seen taken
 * (sim_set_launch_stand), and then the first state read after a step comes
 * back with its position NaN. The plant itself is not touched; what is
 * judged is what the shell does with what it reads. Passes when that read
 * is counted as one plant fault, the craft's state is finite after it, and
 * the page logged nothing else. Exit 0 on a pass, 1 otherwise.
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
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const settings = {
  ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '5inch'),
  airframeAsked: true,
  graphics: 'low',
  graphicsAuto: false,
  crashDamage: true,
  sound: false,
};

/* Before the shell's first line: its settings, and its module wrapped. Only
 * the first module with a plant step is wrapped, the one the shell flies. */
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, ${JSON.stringify(settings)});
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`, `(() => {
  const T = { lc: null, nan: 0, stand: 0, stepped: false, wrapped: false };
  window.__standTest = T;
  const real = WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate = async (...args) => {
    const res = await real(...args);
    const ex = res && res.instance ? res.instance.exports : null;
    if (!ex || typeof ex.sim_step !== 'function' || T.wrapped) return res;
    T.wrapped = true;
    const out = {};
    for (const key of Object.keys(ex)) out[key] = ex[key];
    out.sim_launch_control_state = () => (T.lc === null ? ex.sim_launch_control_state() : T.lc);
    out.sim_set_launch_stand = (...a) => {
      if (a[0]) T.stand += 1;
      return ex.sim_set_launch_stand(...a);
    };
    out.sim_step = (...a) => {
      T.stepped = true;
      return ex.sim_step(...a);
    };
    out.sim_state = (p) => {
      const code = ex.sim_state(p);
      if (code === 0 && T.stepped && T.nan > 0) {
        T.nan -= 1;
        new Float64Array(ex.memory.buffer, p, 2)[1] = NaN;
      }
      T.stepped = false;
      return code;
    };
    return { module: res.module, instance: { exports: out } };
  };
})();`];

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const page = await openPage({ root, width: 960, height: 540, url: '/index.html', seed });
try {
  await page.until('window.__shellReady && window.__map && window.__map().ready', 300000);
  check('the shell flies the wrapped module', await page.evaluate('window.__standTest.wrapped'));
  /* Into flight, then parked on the spawn, landed, as a pilot is before a launch. */
  await page.evaluate(`(async () => {
    window.__crashThrow({ fresh: true, x: 0, y: 300, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
    for (let i = 0; i < 10; i += 1) await new Promise((r) => requestAnimationFrame(r));
    const sp = window.__map().spawn;
    window.__respawn(sp.x, sp.z, 0);
    for (let i = 0; i < 30; i += 1) await new Promise((r) => requestAnimationFrame(r));
  })()`);
  const stand0 = await page.evaluate('window.__standTest.stand');
  await page.evaluate('window.__standTest.lc = 1');
  let staged = false;
  try {
    await page.until(`window.__standTest.stand > ${stand0}`, 10000);
    staged = true;
  } catch (e) {
    staged = false;
  }
  check('launch control held on the pad takes the stand', staged);
  const errors0 = page.errors.length;
  const faults0 = await page.evaluate('window.__crash().plantFaults');
  await page.evaluate(`(async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((r) => requestAnimationFrame(r));
    window.__standTest.nan = 1;
    for (let i = 0; i < 60; i += 1) await new Promise((r) => requestAnimationFrame(r));
  })()`);
  const left = await page.evaluate('window.__standTest.nan');
  const faults = (await page.evaluate('window.__crash().plantFaults')) - faults0;
  const st = JSON.parse(await page.evaluate('JSON.stringify(window.__craftState())'));
  const finite = st && Object.values(st).every((v) => typeof v !== 'number' || Number.isFinite(v));
  check('the bad state was read on the stand', left === 0, `${left} left to hand over`);
  check('it is counted as one plant fault', faults === 1, `${faults}`);
  check('and the craft is sound after it', finite, JSON.stringify(st).slice(0, 200));
  const other = page.errors.slice(errors0).filter((e) => !/plant fault 1 after/.test(e));
  check('the page logged nothing else', other.length === 0, other.slice(0, 3).join(' | ').slice(0, 600));
} finally {
  await page.close();
}

console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
