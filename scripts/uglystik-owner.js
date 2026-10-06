/*
 * uglystik-owner.js: the owner's Ugly Stik flight test, flown headless in
 * the real shell and held to tests/uglystik-thresholds.json, on the pattern
 * of scripts/p51-owner.js. On swiss2 (the Free Flight card's home) with
 * the uglystik-manual tune:
 *
 *   aero   full throttle from standing, the wings held level, the nose
 *          raised to 8 deg at 1.2 Vs: it lifts off inside U15's band; a
 *          climb to 60 m; level at three quarter throttle; full right
 *          aileron held once round: the roll's peak pb/2V inside U6; level
 *          again at full throttle, then half up stick held once round the
 *          loop: its height and the height it comes out at inside U9;
 *   stall  off the strip, a climb to 60 m, level at three quarter
 *          throttle, then the throttle closed and the elevator run
 *          linearly to full over 8 s and held, ailerons and rudder
 *          centred: it drops its nose and no wing, the bank under U11a's
 *          15 deg and the roll rate under 20 deg/s, a wing drop's.
 *
 * Timed on the plant's own clock (__craftState().simS), since headless the
 * page's runs faster than the sim's. Needs no board. SIM_GPU=1 renders on
 * this machine's GPU, which makes it several times quicker.
 *
 *   node scripts/uglystik-owner.js [modes] [map]   (npm run uglystik:owner)
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
const th = JSON.parse(await readFile(join(root, 'tests/uglystik-thresholds.json'), 'utf8'));
const AF = 'uglystik1567';
const SPAN = 1.5682;
const MODES = (process.argv[2] ?? 'aero,stall').split(',');
const MAP = process.argv[3] ?? 'swiss2';

/*
 * The pilot, in the page, once a frame. Bank + right wing down, pitch +
 * nose up, from the aircraft's forward and up axes in the world. The roll
 * is counted from the body roll rate on the plant's clock; the loop from
 * the flight path's angle in the vertical plane it started in, the
 * velocity's, as uglystik-gates.js U9 counts it.
 */
const PILOT = (mode, vRot) => `
window.__T = { log: [], done: false };
(() => {
  const T = window.__T;
  const c0 = window.__craftState();
  const rest = c0.groundClearance;
  const bankOf = (c) => Math.atan2(-(c.fwd.z * c.up.x - c.fwd.x * c.up.z), c.up.y) * 180 / Math.PI;
  const pitchOf = (c) => Math.asin(Math.max(-1, Math.min(1, c.fwd.y))) * 180 / Math.PI;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  let contactSteps = window.__ground().contactSteps;
  let phase = 'roll', tPhase = c0.simS, prevS = c0.simS, airS = 0, x0 = null, turned = 0, path = 0, dir = null, y0 = 0, yMax = 0, hMin = 0, hMax = 0, trim = 0;
  const level = (c, thr) => {
    const vy = c.vel ? c.vel.y : 0;
    trim = Math.max(-0.3, Math.min(0.5, trim + 0.004 * (0 - vy)));
    return [clamp(-bankOf(c) * 0.03 - (c.rates ? c.rates.p : 0) * 0.1), clamp(trim - 0.08 * vy - 0.02 * (pitchOf(c) - 2)), 0, thr];
  };
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-3, now - prevS); prevS = now;
    const h = c.groundClearance - rest, bank = bankOf(c), pitch = pitchOf(c);
    const q = c.rates ? c.rates.q : 0;
    let s = [0, 0, 0, 1];
    if (phase === 'roll') {
      if (x0 === null) x0 = c.worldX !== undefined ? { x: c.worldX, z: c.worldZ } : null;
      s = [clamp(-bank * 0.03), c.speed < ${vRot} ? 0 : clamp(0.0873 * (8 - pitch) + q * 0.25), 0, 1];
      /* Liftoff is the last frame a wheel was loaded in (the shell's
       * count of steps with a wheel or the hull on the ground), as U15
       * reads it, once the aircraft has been 0.3 m up for 0.8 s. */
      const steps = window.__ground().contactSteps;
      const onWheels = steps !== contactSteps;
      contactSteps = steps;
      if (onWheels) {
        T.lastGround = { speed: +c.speed.toFixed(2), dist: x0 ? +Math.hypot(c.worldX - x0.x, c.worldZ - x0.z).toFixed(1) : null, s: +(now - tPhase).toFixed(2) };
      }
      airS = h < 0.3 ? 0 : airS + dt;
      if (airS > 0.8) {
        T.lift = T.lastGround;
        phase = 'climb'; tPhase = now;
      }
      if (now - tPhase > 30 || c.crashed) phase = 'end';
    } else if (phase === 'climb') {
      s = [clamp(-bank * 0.03), clamp(0.087 * (15 - pitch) * 0.6 + q * 0.25), 0, 1];
      if (h > 60) { phase = 'level'; tPhase = now; }
      if (now - tPhase > 60 || c.crashed) phase = 'end';
    } else if (phase === 'level') {
      s = level(c, 0.75);
      T.from = { v: +c.speed.toFixed(1), h: +h.toFixed(1), bank: +bank.toFixed(1) };
      if (now - tPhase > 8) { phase = '${mode}' === 'stall' ? 'stall' : 'aroll'; tPhase = now; turned = 0; T.peakPb = 0; }
    } else if (phase === 'aroll') {
      s = [1, 0, 0, 0.75];
      const p = c.rates ? c.rates.p : 0;
      turned += p * dt;
      T.peakPb = Math.max(T.peakPb, Math.abs(p) * ${SPAN} / (2 * Math.max(1, c.speed)));
      if (Math.abs(turned) >= 2 * Math.PI) { T.roll = { s: +(now - tPhase).toFixed(2), peakPb: +T.peakPb.toFixed(4), v: +c.speed.toFixed(1) }; phase = 'relevel'; tPhase = now; }
      if (now - tPhase > 10 || c.crashed) phase = 'end';
    } else if (phase === 'relevel') {
      s = level(c, 1);
      if (now - tPhase > 12) {
        phase = 'loop'; tPhase = now; turned = 0;
        const hz = Math.hypot(c.vel.x, c.vel.z);
        dir = { x: c.vel.x / hz, z: c.vel.z / hz };
        path = Math.atan2(c.vel.y, hz); y0 = c.worldY; yMax = c.worldY; T.loopFrom = { v: +c.speed.toFixed(1), h: +h.toFixed(1) };
        hMin = 0; hMax = 0;
      }
    } else if (phase === 'loop') {
      s = [0, 0.5, 0, 1];
      const along = c.vel.x * dir.x + c.vel.z * dir.z;
      const a = Math.atan2(c.vel.y, along);
      turned += Math.atan2(Math.sin(a - path), Math.cos(a - path));
      path = a;
      yMax = Math.max(yMax, c.worldY);
      const d = (c.worldX - 0) * dir.x + (c.worldZ - 0) * dir.z;
      if (T.d0 === undefined) T.d0 = d;
      hMin = Math.min(hMin, d - T.d0); hMax = Math.max(hMax, d - T.d0);
      if (turned >= Math.PI && !T.top) T.top = { v: +c.speed.toFixed(1) };
      if (turned >= 2 * Math.PI) { T.loop = { height: +(yMax - y0).toFixed(1), length: +(hMax - hMin).toFixed(1), out: +(c.worldY - y0).toFixed(1), top: T.top, s: +(now - tPhase).toFixed(2) }; phase = 'end'; }
      if (now - tPhase > 20 || c.crashed) phase = 'end';
    } else if (phase === 'stall') {
      const e = Math.min(1, (now - tPhase) / 8);
      s = [0, e, 0, 0];
      T.log.push({ t: now - tPhase, v: c.speed, bank, pitch, p: c.rates ? c.rates.p : 0 });
      if (now - tPhase > 14 || c.crashed) phase = 'end';
    }
    if (phase === 'end') {
      T.done = true;
      T.res = { lift: T.lift, roll: T.roll, loop: T.loop, loopFrom: T.loopFrom, crashed: c.crashed, from: T.from };
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
const within = (v, lo, hi) => v >= lo && v <= hi;

const page = await openPage({ root, width: 960, height: 540, url: '/index.html' });
try {
  await page.until('!!window.__shellReady', 240000);
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  if (MAP !== 'swiss2') {
    await page.evaluate(`window.__ui.seatMap('${MAP}'); true`);
    await page.until(`window.__ui.settings.map === '${MAP}' && window.__map && window.__map().ready`, 400000);
  }
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = 'uglystik-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`ugly stik owner test on ${MAP}: ${seated}`);
  for (const mode of MODES) {
    await page.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
    await page.sleep(2000);
    const st = await page.evaluate('({ tune: window.__craftState().tune, stab: window.__craftState().wingStab })');
    await page.evaluate(PILOT(mode, th.u15_takeoff.vRotate));
    const t0 = Date.now();
    while (Date.now() - t0 < 900000 && !(await page.evaluate('window.__T.done'))) {
      await page.sleep(1000);
    }
    const T = await page.evaluate('window.__T');
    const r = T.res || {};
    console.log(`${mode}: ${st.tune}, mode ${st.stab}, ${JSON.stringify(r)}`);
    const t15 = th.u15_takeoff;
    say(Boolean(r.lift) && !r.crashed && within(r.lift.speed, t15.vMin, t15.vMax),
      `off the strip, rotated at ${t15.vRotate} m/s: ${r.lift ? `${r.lift.speed} m/s after ${r.lift.dist} m in ${r.lift.s} s` : 'never left the ground'} (${t15.vMin} to ${t15.vMax} m/s)`);
    if (mode === 'aero') {
      const t6 = th.u6_roll;
      say(Boolean(r.roll) && within(r.roll.peakPb, t6.min, t6.max),
        `full right aileron once round: ${r.roll ? `${r.roll.s} s, peak pb/2V ${r.roll.peakPb} at ${r.roll.v} m/s` : 'never went round'} (${t6.min} to ${t6.max})`);
      const t9 = th.u9_loop;
      say(Boolean(r.loop) && !r.crashed && within(r.loop.height, t9.heightMin, t9.heightMax) && within(r.loop.out, t9.exitMin, t9.exitMax),
        `half up stick at full throttle once round: ${r.loop ? `${r.loop.height} m up, ${r.loop.length} m along, out ${r.loop.out} m, ${r.loop.top ? `${r.loop.top.v} m/s over the top` : ''}, from ${r.loopFrom.v} m/s` : 'never went round'} (${t9.heightMin} to ${t9.heightMax} m up, out ${t9.exitMin} to ${t9.exitMax} m)`);
    } else if (mode === 'stall') {
      const t11 = th.u11_stall_power_off;
      const L = T.log;
      const b0 = L.length ? L[0].bank : 0;
      let worstBank = 0;
      let worstP = 0;
      let minPitch = 90;
      for (const x of L) {
        worstBank = Math.max(worstBank, Math.abs(x.bank - b0));
        worstP = Math.max(worstP, Math.abs(x.p) * 180 / Math.PI);
        minPitch = Math.min(minPitch, x.pitch);
      }
      for (const x of L.filter((_, i) => i % Math.max(1, Math.floor(L.length / 14)) === 0)) {
        console.log(`    t ${x.t.toFixed(2)} s  v ${x.v.toFixed(2)}  pitch ${x.pitch.toFixed(1)}  bank ${x.bank.toFixed(1)}  p ${(x.p * 180 / Math.PI).toFixed(1)} deg/s`);
      }
      say(L.length > 0 && !r.crashed && worstBank <= t11.maxBankDeg && worstP <= 20 && minPitch >= t11.minPitchDeg,
        `the slow pull to full up, power off: bank moved at most ${worstBank.toFixed(1)} deg, roll rate at most ${worstP.toFixed(1)} deg/s, pitch down to ${minPitch.toFixed(1)} (bank ${t11.maxBankDeg}, roll 20 deg/s, pitch over ${t11.minPitchDeg})`);
    }
    await page.evaluate("window.__stick(0,0,0,0); window.__ui.onAction('title', window.__ui.settings); true");
    await page.until("window.__craftState().mode !== 'flight'", 60000);
  }
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
