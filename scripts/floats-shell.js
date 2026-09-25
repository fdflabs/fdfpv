/*
 * floats-shell.js: the Timber on floats in the real shell, headless, on the
 * Alps' lake: seated there, afloat and rocking at the start, a take off off
 * the water with half flaps, a circuit, and a landing back on the water.
 *
 * The pilot's phase limits are wall clock and generous, since a heavy map
 * headless draws a frame a second; the physics is on the sim clock.
 *
 * The plant's own checks are scripts/floats-gates.js; this is the other
 * half, that the shell seats the aircraft ON the water (src/game/water.js
 * declared to the plant at the spawn's frame), that it is let go onto it
 * rather than parked, that the ground under it is the lake's bed and not
 * its surface, and that a pilot on the sticks, the harness's __stick, gets
 * it on the step, off, and back. The pilot flies on __craftState's
 * attitude and speed and on sim_float_state as the shell publishes it.
 *
 *   node scripts/floats-shell.js [timber1500f|cub1400f] [alps|swiss2]
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
const airframe = process.argv[2] ?? 'timber1500f';
const af = airframeById(airframe);
const LAKE_Y = -1.5;

const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe);
seated.map = process.argv[3] ?? 'alps';
seated.graphics = 'low';

/*
 * The pilot, in the page, once a frame: the phases of the manual's water
 * flying. Roll holds the wings level on the craft's right vector; pitch
 * holds an attitude on the nose's; the rudder stays centred. Everything it
 * saw goes to window.__floatLog.
 */
const PILOT = `
window.__floatLog = { phase: 'wait', events: [], samples: [], done: false };
(() => {
  const L = window.__floatLog;
  let phase = 'settle';
  let t0 = performance.now();
  let tPhase = t0;
  let dryMs = 0;
  let lastT = t0;
  let onStep = false;
  let settleFrames = 0;
  const mark = (what, c) => {
    L.events.push({ what, t: (performance.now() - t0) / 1000, x: c.worldX, y: c.worldY, z: c.worldZ,
      speed: c.speed, pitch: Math.asin(c.fwd.y) * 180 / Math.PI, floats: c.floats && c.floats.state.slice() });
  };
  const next = (p, c) => { phase = p; tPhase = performance.now(); mark(p, c); };
  const tick = () => {
    const c = window.__craftState();
    const now = performance.now();
    const dt = now - lastT;
    lastT = now;
    if (!c || c.mode !== 'flight' || !c.fwd || !c.floats) {
      requestAnimationFrame(tick);
      return;
    }
    const pitch = Math.asin(Math.max(-1, Math.min(1, c.fwd.y)));
    const right = { x: c.fwd.y * c.up.z - c.fwd.z * c.up.y, y: c.fwd.z * c.up.x - c.fwd.x * c.up.z, z: c.fwd.x * c.up.y - c.fwd.y * c.up.x };
    const roll = Math.max(-1, Math.min(1, 3 * right.y - 0.15 * (c.rates ? c.rates.p : 0)));
    const hold = (deg) => Math.max(-1, Math.min(1, 3 * (deg * Math.PI / 180 - pitch) + 0.3 * (c.rates ? c.rates.q : 0)));
    const f = c.floats.state;
    const wet = f[4] + f[5] > 0;
    const height = c.worldY - ${LAKE_Y};
    const inPhase = (now - tPhase) / 1000;
    let sticks = [0, 0, 0, 0];
    if (phase === 'settle') {
      sticks = [0, 0, 0, 0];
      settleFrames += 1;
      if (inPhase > 3 && settleFrames >= 8) next('takeoff', c);
    } else if (phase === 'takeoff') {
      if (!onStep && f[0] < 0.25 * ${(airframe === 'cub1400f' ? 1.532 : 1.934) * 9.81} && inPhase > 0.3) {
        onStep = true;
        mark('onstep', c);
      }
      const rotate = c.speed > ${airframe === 'cub1400f' ? 9.2 : 7.5};
      sticks = [roll, !onStep || rotate ? 1 : hold(4), 0, 1];
      if (!wet) { dryMs += dt; } else { dryMs = 0; }
      if (dryMs > 300) next('climb', c);
      if (inPhase > 120) next('failed-takeoff', c);
    } else if (phase === 'climb') {
      sticks = [roll, hold(8), 0, 0.8];
      if (height > 10) next('cruise', c);
    } else if (phase === 'cruise') {
      sticks = [roll, hold(1), 0, 0.6];
      if (inPhase > 6) next('descend', c);
    } else if (phase === 'descend') {
      sticks = [roll, hold(-5), 0, 0.15];
      if (height < 1.2) next('flare', c);
    } else if (phase === 'flare') {
      sticks = [roll, hold(7), 0, 0];
      if (wet) next('touchdown', c);
      if (inPhase > 120) next('failed-landing', c);
    } else if (phase === 'touchdown') {
      sticks = [roll, 1, 0, 0];
      if (c.speed < 1.0) next('slowed', c);
      if (inPhase > 180) next('failed-slowing', c);
    } else if (phase === 'slowed') {
      sticks = [0, 0.5, 0, 0];
      if (inPhase > 3) { next('done', c); L.done = true; }
    } else {
      L.done = true;
    }
    L.phase = phase;
    if (L.samples.length < 20000) {
      L.samples.push([Math.round((now - t0)), +c.worldX.toFixed(2), +c.worldY.toFixed(3), +c.worldZ.toFixed(2), +c.speed.toFixed(2),
        +(pitch * 180 / Math.PI).toFixed(2), +(Math.asin(Math.max(-1, Math.min(1, -right.y))) * 180 / Math.PI).toFixed(2), +f[0].toFixed(2), wet ? 1 : 0]);
    }
    if (!L.done) {
      window.__stick(sticks[0], sticks[1], sticks[2], sticks[3]);
      requestAnimationFrame(tick);
    } else {
      window.__stick(0, 0, 0, 0);
    }
  };
  requestAnimationFrame(tick);
})();
`;

const page = await openPage({
  root,
  width: 480,
  height: 300,
  url: '/index.html',
  seed: [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused */ }`],
});
let failed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failed += 1;
};
try {
  await page.until('!!window.__shellReady', 240000);
  await page.until("window.__map && window.__map().ready", 240000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 120000);
  await page.sleep(500);
  const first = await page.evaluate('window.__craftState()');
  const crafted = await page.evaluate('window.__craft()');
  console.log(`seated: ${JSON.stringify(crafted).slice(0, 160)}`);
  say(first.floats && first.floats.onWater, `the ${af.name} starts afloat on the lake: body ${first.floats ? first.floats.state[9] : '?'}, at (${first.worldX.toFixed(1)}, ${first.worldY.toFixed(3)}, ${first.worldZ.toFixed(1)})`);
  if (airframe === 'timber1500f') {
    /* Half flaps, the manual's take off setting: F once. */
    await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f' })); true");
  }
  await page.evaluate(PILOT);
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < 600000) {
    const st = await page.evaluate('({ phase: window.__floatLog.phase, done: window.__floatLog.done, n: window.__floatLog.samples.length })');
    if (st.phase !== last) {
      console.log(`  phase ${st.phase} after ${((Date.now() - t0) / 1000).toFixed(0)} s, ${st.n} frames`);
      last = st.phase;
    }
    if (st.done) break;
    await page.sleep(1000);
  }
  const log = await page.evaluate('window.__floatLog');
  for (const e of log.events) {
    console.log(`  ${e.what.padEnd(14)} t ${e.t.toFixed(1)} s, speed ${e.speed.toFixed(2)} m/s, height ${(e.y - LAKE_Y).toFixed(3)} m, pitch ${e.pitch.toFixed(1)} deg, buoyancy ${e.floats ? e.floats[0].toFixed(1) : '?'} N`);
  }
  const ev = (w) => log.events.find((e) => e.what === w);
  const settle = log.samples.filter((s) => s[0] < (ev('takeoff') ? ev('takeoff').t * 1000 : 0));
  if (settle.length > 4) {
    const ps = settle.map((s) => s[5]);
    const hs = settle.map((s) => s[2]);
    console.log(`  afloat before the throttle: pitch ${Math.min(...ps).toFixed(2)} to ${Math.max(...ps).toFixed(2)} deg, CG ${Math.min(...hs).toFixed(3)} to ${Math.max(...hs).toFixed(3)} m, ${settle.length} frames`);
    say(Math.max(...ps) - Math.min(...ps) > 0.05 && settle.every((s) => s[8] === 1), 'it rocks on the chop, floats wet, before the throttle');
  }
  say(Boolean(ev('onstep')), `on the step${ev('onstep') ? ` at ${ev('onstep').speed.toFixed(2)} m/s` : ''}`);
  say(Boolean(ev('climb')), `off the water${ev('climb') ? ` at ${ev('climb').speed.toFixed(2)} m/s` : ''}`);
  say(Boolean(ev('touchdown')), `back on the water${ev('touchdown') ? ` at ${ev('touchdown').speed.toFixed(2)} m/s` : ''}`);
  say(Boolean(ev('done')) && !log.events.some((e) => e.what.startsWith('failed')), 'slowed to a walk on the water and floating');
  const fin = await page.evaluate('window.__craftState()');
  say(!fin.crashed, `not crashed; ${fin.banner ? `banner "${fin.banner}"` : 'no banner'}`);
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
