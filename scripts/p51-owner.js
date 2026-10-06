/*
 * p51-owner.js: the owner's P-51 flight test, flown headless in the real
 * shell, the lead's probe made a check. On swiss2 (the Free Flight card's
 * home) with the p51-manual tune:
 *
 *   hands   full throttle from standing, the rudder left alone: it swings
 *           left, at least p51:gates P15's 3 deg by liftoff;
 *   rudder  the same with the heading held on the rudder, a pilot's feet
 *           on the heading and its rate after a calibration of which way
 *           the yaw stick turns it: within P14's 5 deg all the way;
 *   stall   off the strip, a climb to 100 m, the gear up (G), level at
 *           0.8 throttle, then the throttle closed and the elevator run
 *           linearly to full over 8 s, ailerons and rudder centred: the
 *           wing drops as p51:gates P19 holds it, the first roll's peak
 *           pb/2V and the bank it takes in the second after the roll's
 *           onset (pb/2V past 0.02) inside tests/p51-thresholds.json
 *           p19_slow_pull.
 *
 * Timed on the plant's own clock (__craftState().simS), since headless
 * the page's runs faster than the sim's. The roll rate is the plant's
 * (__craftState().rates.p). Needs no board. SIM_GPU=1 renders on this
 * machine's GPU, which makes it several times quicker.
 *
 *   node scripts/p51-owner.js [modes] [map]   (npm run p51:owner)
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/p51-thresholds.json'), 'utf8'));
const AF = 'p51d1450';
const MODES = (process.argv[2] ?? 'hands,rudder,stall').split(',');
const MAP = process.argv[3] ?? 'swiss2';

/*
 * The pilot, in the page, once a frame. Yaw is + right of the heading it
 * started on, bank + right wing down. `cal` finds which way the yaw stick
 * turns it, a taxi at a quarter throttle with it at +0.6, since the check
 * holds the heading on it; then the take off roll, and for the stall the
 * climb, the gear and the pull.
 */
const PILOT = (mode, t19) => `
window.__T = { log: [], done: false };
(() => {
  const T = window.__T;
  const c0 = window.__craftState();
  const f0 = c0.fwd; const rest = c0.groundClearance;
  const yawOf = (f) => { const cy = f0.z * f.x - f0.x * f.z; const d = f0.x * f.x + f0.z * f.z; return Math.atan2(-cy, d) * 180 / Math.PI; };
  const bankOf = (c) => Math.asin(Math.max(-1, Math.min(1, -(c.fwd.z * c.up.x - c.fwd.x * c.up.z)))) * 180 / Math.PI;
  let phase = '${mode}' === 'rudder' ? 'cal' : 'roll';
  let wallStop = 0, tPhase = c0.simS, calYaw = 0, sgn = 1, prevYaw = 0, prevS = c0.simS, airS = 0, maxYaw = 0, lift = null;
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-3, now - prevS); prevS = now;
    const yaw = yawOf(c.fwd), h = c.groundClearance - rest, bank = bankOf(c);
    let s = [0, 0, 0, 1];
    if (phase === 'cal') {
      /* Over the shell's take off throttle, 0.25, or it stays parked and
       * the plant's clock stands still. */
      s = [0, 0, 0.6, 0.3];
      if (now - tPhase > 2.5) { calYaw = yaw; sgn = yaw > 0 ? 1 : -1; T.cal = { yaw: +yaw.toFixed(2) }; phase = 'stop'; tPhase = now; wallStop = performance.now(); }
    } else if (phase === 'stop') {
      /* Parked again the plant's clock stops, so this waits on the page's. */
      s = [0, 0, 0, 0];
      if (performance.now() - wallStop > 3000) { phase = 'roll'; tPhase = now; calYaw = yaw; prevYaw = yaw; }
    } else if (phase === 'roll') {
      if ('${mode}' === 'rudder') {
        const rate = (yaw - prevYaw) / dt;
        s[2] = Math.max(-1, Math.min(1, -sgn * ((yaw - calYaw) * 0.06 + rate * 0.03)));
      }
      prevYaw = yaw;
      const dev = yaw - calYaw;
      if (Math.abs(dev) > Math.abs(maxYaw)) maxYaw = dev;
      airS = h < 0.3 ? 0 : airS + dt;
      if (airS > 0.8) { lift = { speed: +c.speed.toFixed(2), yaw: +dev.toFixed(1) }; phase = '${mode}' === 'stall' ? 'climb' : 'end'; tPhase = now; }
      if (now - tPhase > 60 || c.crashed) phase = 'end';
    } else if (phase === 'climb') {
      const vy = c.vel ? c.vel.y : 0;
      s = [-bank * 0.02, Math.max(-0.3, Math.min(0.3, 0.05 * (6 - vy) + (c.speed < 16 ? -0.15 : 0))), 0, 1];
      if (h > 100) { phase = 'gear'; tPhase = now; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', key: 'g' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG', key: 'g' })); }
      if (now - tPhase > 90 || c.crashed) phase = 'end';
    } else if (phase === 'gear') {
      const vy = c.vel ? c.vel.y : 0;
      s = [-bank * 0.02, Math.max(-0.4, Math.min(0.4, -0.08 * vy - 0.01 * (h - 100))), 0, 0.8];
      T.from = { v: +c.speed.toFixed(1), h: +h.toFixed(1), bank: +bank.toFixed(1) };
      if (now - tPhase > 10) { phase = 'stall'; tPhase = now; }
    } else if (phase === 'stall') {
      const e = Math.min(1, (now - tPhase) / ${t19.rampS});
      s = [0, e, 0, 0];
      T.log.push({ t: now - tPhase, v: c.speed, bank, p: c.rates ? c.rates.p : 0 });
      if (now - tPhase > 11 || c.crashed) phase = 'end';
    }
    if (phase === 'end') {
      T.done = true;
      T.res = { cal: T.cal, maxYaw: +maxYaw.toFixed(1), lift, crashed: c.crashed, from: T.from };
      window.__stick(0, 0, 0, 0);
      return;
    }
    window.__stick(...s);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

let failed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failed += 1;
};

const page = await openPage({ root, width: 960, height: 540, url: '/index.html' });
try {
  await page.until('!!window.__shellReady', 240000);
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  if (MAP !== 'swiss2') {
    await page.evaluate(`window.__ui.seatMap('${MAP}'); true`);
    await page.until(`window.__ui.settings.map === '${MAP}' && window.__map && window.__map().ready`, 400000);
  }
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = 'p51-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`p51 owner test on ${MAP}: ${seated}`);
  for (const mode of MODES) {
    await page.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
    await page.sleep(2000);
    const st = await page.evaluate('({ tune: window.__craftState().tune, stab: window.__craftState().wingStab })');
    await page.evaluate(PILOT(mode, th.p19_slow_pull));
    const t0 = Date.now();
    while (Date.now() - t0 < 900000 && !(await page.evaluate('window.__T.done'))) {
      await page.sleep(1000);
    }
    const T = await page.evaluate('window.__T');
    const r = T.res || {};
    console.log(`${mode}: ${st.tune}, mode ${st.stab}, ${JSON.stringify(r)}`);
    if (mode === 'hands') {
      say(Boolean(r.lift) && !r.crashed && r.lift.yaw <= -th.p15_swing.minLeftDeg,
        `rudder left alone, it swings left: ${r.lift ? `${-r.lift.yaw} deg left at liftoff, ${r.lift.speed} m/s` : 'never left the ground'} (at least ${th.p15_swing.minLeftDeg})`);
    } else if (mode === 'rudder') {
      say(Boolean(r.lift) && !r.crashed && Math.abs(r.maxYaw) <= th.p14_takeoff.maxHeadingDeg,
        `the heading held on the rudder: within ${Math.abs(r.maxYaw)} deg, liftoff ${r.lift ? `${r.lift.speed} m/s` : 'never'} (within ${th.p14_takeoff.maxHeadingDeg})`);
    } else if (mode === 'stall') {
      const t19 = th.p19_slow_pull;
      const L = T.log;
      const helix = (x) => x.p * 1.450 / (2 * Math.max(1, x.v));
      const on = L.find((x) => Math.abs(helix(x)) > t19.onsetPb2v);
      let peak = 0;
      let bank = 0;
      if (on) {
        const sg = Math.sign(on.p);
        for (const x of L.filter((y) => y.t >= on.t && y.t <= on.t + 1)) {
          peak = Math.max(peak, sg * helix(x));
          bank = Math.max(bank, Math.abs(x.bank - on.bank));
        }
      }
      for (const x of L.filter((_, i) => i % Math.max(1, Math.floor(L.length / 16)) === 0)) {
        console.log(`    t ${x.t.toFixed(2)} s  v ${x.v.toFixed(2)}  bank ${x.bank.toFixed(1)}  p ${(x.p * 180 / Math.PI).toFixed(0)} deg/s`);
      }
      say(Boolean(on) && !r.crashed && peak >= t19.min && peak <= t19.max && bank >= t19.bankMin && bank <= t19.bankMax,
        on ? `the slow pull: onset ${on.t.toFixed(2)} s at ${on.v.toFixed(2)} m/s, ${on.p < 0 ? 'left' : 'right'} wing; first second: peak pb/2V ${peak.toFixed(4)}, bank ${bank.toFixed(1)} deg (pb/2V ${t19.min} to ${t19.max}, bank ${t19.bankMin} to ${t19.bankMax})`
          : 'the slow pull: no roll off');
    }
    await page.evaluate("window.__stick(0,0,0,0); window.__ui.onAction('title', window.__ui.settings); true");
    await page.until("window.__craftState().mode !== 'flight'", 60000);
  }
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
