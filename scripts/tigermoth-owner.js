/*
 * tigermoth-owner.js: the owner's Tiger Moth flight test, flown headless
 * in the real shell and held to tests/tigermoth-thresholds.json, on the
 * pattern of scripts/uglystik-owner.js. On swiss2 (the Free Flight card's
 * home) with the tigermoth-manual tune:
 *
 *   yaw    the manual's take off: the throttle opened over two seconds,
 *          the tail held down, then up, the heading held on the rudder
 *          and the tail wheel, rotated at 1.2 Vs: it lifts off inside
 *          T12's band; a climb to 60 m; level at three quarter throttle;
 *          full right aileron with the rudder centred to 30 deg of bank:
 *          the nose swings left first, against the roll, inside T7a's
 *          band; level again; the same entry with three quarters of the
 *          aileron's rudder with it: the nose does not swing the wrong
 *          way past T7b's 3 deg;
 *   stall  off the strip, a climb to 60 m, level at three quarter
 *          throttle, then the throttle closed and the elevator run
 *          linearly to full over 8 s and held, the wings held on the
 *          ailerons, the rudder centred: the nose drops and no wing, the
 *          bank under T8a's 15 deg and the roll rate under its 20 deg/s.
 *
 * Timed on the plant's own clock (__craftState().simS), since headless the
 * page's runs faster than the sim's. Needs no board. SIM_GPU=1 renders on
 * this machine's GPU, which makes it several times quicker.
 *
 *   node scripts/tigermoth-owner.js [modes] [map]   (npm run tigermoth:owner)
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/tigermoth-thresholds.json'), 'utf8'));
const AF = 'tigermoth1803';
const MODES = (process.argv[2] ?? 'yaw,stall').split(',');
const MAP = process.argv[3] ?? 'swiss2';

/*
 * The pilot, in the page, once a frame. Bank + right wing down, pitch +
 * nose up, from the aircraft's forward and up axes in the world; the
 * heading left positive about the world's up, from the forward axis
 * (src/render/frame.js puts the plant's +x at three's -z and its +y, left,
 * at three's -x).
 */
const PILOT = (mode, vRot, rudder) => `
window.__T = { log: [], done: false };
(() => {
  const T = window.__T;
  const c0 = window.__craftState();
  const rest = c0.groundClearance;
  const bankOf = (c) => Math.atan2(-(c.fwd.z * c.up.x - c.fwd.x * c.up.z), c.up.y) * 180 / Math.PI;
  const pitchOf = (c) => Math.asin(Math.max(-1, Math.min(1, c.fwd.y))) * 180 / Math.PI;
  const headOf = (c) => Math.atan2(-c.fwd.x, -c.fwd.z) * 180 / Math.PI;
  const wrap = (d) => ((d + 540) % 360) - 180;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  let contactSteps = window.__ground().contactSteps;
  let phase = 'roll', tPhase = c0.simS, prevS = c0.simS, airS = 0, x0 = null, trim = 0, h0 = headOf(c0), hPrev = h0, entry = null;
  const level = (c, thr) => {
    const vy = c.vel ? c.vel.y : 0;
    trim = Math.max(-0.3, Math.min(0.5, trim + 0.004 * (0 - vy)));
    return [clamp(-bankOf(c) * 0.03 - (c.rates ? c.rates.p : 0) * 0.1), clamp(trim - 0.08 * vy - 0.02 * pitchOf(c)), 0, thr];
  };
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-3, now - prevS); prevS = now;
    const h = c.groundClearance - rest, bank = bankOf(c), pitch = pitchOf(c), head = headOf(c);
    const q = c.rates ? c.rates.q : 0;
    const rHead = wrap(head - hPrev) / dt; hPrev = head;
    let s = [0, 0, 0, 1];
    if (phase === 'roll') {
      if (x0 === null) x0 = c.worldX !== undefined ? { x: c.worldX, z: c.worldZ } : null;
      const tt = now - tPhase;
      /* The shell holds the aircraft until the throttle passes its 0.25
       * takeoff threshold (src/main.js): open it from 0.3 over two seconds. */
      const thr = Math.min(1, 0.3 + 0.35 * tt);
      let pst = 0.3;
      if (c.speed >= ${vRot} / 3) pst = clamp(0.0873 * 2.5 * ((c.speed < ${vRot} ? 1 : 6) - pitch) + q * 0.25);
      /* Right rudder turns the nose right, the heading down: a nose gone
       * left is held with right rudder. */
      const yaw = clamp(0.035 * wrap(head - h0) + 0.005 * rHead);
      s = [clamp(-bank * 0.03), pst, yaw, thr];
      T.worstHead = Math.max(T.worstHead ?? 0, Math.abs(wrap(head - h0)));
      const steps = window.__ground().contactSteps;
      const onWheels = steps !== contactSteps;
      contactSteps = steps;
      if (onWheels) {
        T.lastGround = { speed: +c.speed.toFixed(2), dist: x0 ? +Math.hypot(c.worldX - x0.x, c.worldZ - x0.z).toFixed(1) : null, s: +(now - tPhase).toFixed(2), head: +T.worstHead.toFixed(1) };
      }
      airS = h < 0.3 ? 0 : airS + dt;
      if (airS > 0.8) {
        T.lift = T.lastGround;
        phase = 'climb'; tPhase = now;
      }
      if (now - tPhase > 30 || c.crashed) phase = 'end';
    } else if (phase === 'climb') {
      s = [clamp(-bank * 0.03), clamp(0.087 * (12 - pitch) * 0.6 + q * 0.25), 0, 1];
      if (h > 60) { phase = 'level'; tPhase = now; }
      if (now - tPhase > 60 || c.crashed) phase = 'end';
    } else if (phase === 'level' || phase === 'relevel') {
      s = level(c, 0.75);
      T.from = { v: +c.speed.toFixed(1), h: +h.toFixed(1), bank: +bank.toFixed(1) };
      if (now - tPhase > 10) {
        if ('${mode}' === 'stall') { phase = 'stall'; tPhase = now; }
        else { entry = { h0: head, wrong: 0, e: s[1], rud: phase === 'level' ? 0 : ${rudder} }; phase = phase === 'level' ? 'entryA' : 'entryB'; tPhase = now; }
      }
    } else if (phase === 'entryA' || phase === 'entryB') {
      s = [1, entry.e, entry.rud, 0.75];
      entry.wrong = Math.max(entry.wrong, wrap(head - entry.h0));
      if (bank >= 30 || now - tPhase > 3 || c.crashed) {
        const r = { wrong: +entry.wrong.toFixed(2), bank: +bank.toFixed(1), s: +(now - tPhase).toFixed(2), v: +c.speed.toFixed(1), rudder: entry.rud };
        if (phase === 'entryA') { T.alone = r; phase = 'relevel'; } else { T.withRudder = r; phase = 'end'; }
        tPhase = now;
      }
    } else if (phase === 'stall') {
      const e = Math.min(1, (now - tPhase) / 8);
      s = [clamp(-bank * 0.03 - (c.rates ? c.rates.p : 0) * 0.05), e, 0, 0];
      T.log.push({ t: now - tPhase, v: c.speed, bank, pitch, p: c.rates ? c.rates.p : 0 });
      if (now - tPhase > 14 || c.crashed) phase = 'end';
    }
    T.phase = phase;
    T.dbg = { t: +now.toFixed(2), v: +c.speed.toFixed(2), h: +h.toFixed(2), pitch: +pitch.toFixed(1), bank: +bank.toFixed(1), head: +wrap(head - h0).toFixed(1), s: s.map((x) => +x.toFixed(2)) };
    if (phase === 'end') {
      T.done = true;
      T.res = { lift: T.lift, alone: T.alone, withRudder: T.withRudder, crashed: c.crashed, from: T.from };
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
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = 'tigermoth-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`tiger moth owner test on ${MAP}: ${seated}`);
  for (const mode of MODES) {
    await page.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
    await page.sleep(2000);
    const st = await page.evaluate('({ tune: window.__craftState().tune, stab: window.__craftState().wingStab })');
    await page.evaluate(PILOT(mode, th.t12_takeoff.vRotate, th.t7_adverse.rudder));
    const t0 = Date.now();
    let said = '';
    while (Date.now() - t0 < 900000 && !(await page.evaluate('window.__T.done'))) {
      await page.sleep(1000);
      const ph = await page.evaluate('window.__T.phase');
      if (ph !== said || process.env.OWNER_DEBUG) {
        console.log(`  ${mode}: ${ph} at ${((Date.now() - t0) / 1000).toFixed(0)} s ${process.env.OWNER_DEBUG ? JSON.stringify(await page.evaluate('window.__T.dbg')) : ''}`);
        said = ph;
      }
    }
    const T = await page.evaluate('window.__T');
    const r = T.res || {};
    console.log(`${mode}: ${st.tune}, mode ${st.stab}, ${JSON.stringify(r)}`);
    const t12 = th.t12_takeoff;
    say(Boolean(r.lift) && !r.crashed && within(r.lift.speed, t12.vMin, t12.vMax) && r.lift.head <= th.t13_straight.maxHeadingDeg,
      `off the strip on the rudder, rotated at ${t12.vRotate} m/s: ${r.lift ? `${r.lift.speed} m/s after ${r.lift.dist} m in ${r.lift.s} s, heading within ${r.lift.head} deg` : 'never left the ground'} (${t12.vMin} to ${t12.vMax} m/s, ${th.t13_straight.maxHeadingDeg} deg)`);
    if (mode === 'yaw') {
      const t7 = th.t7_adverse;
      say(Boolean(r.alone) && within(r.alone.wrong, t7.wrong.min, t7.wrong.max),
        `full right aileron, the rudder centred: ${r.alone ? `the nose ${r.alone.wrong} deg left, ${r.alone.bank} deg of bank in ${r.alone.s} s at ${r.alone.v} m/s` : 'never rolled'} (${t7.wrong.min} to ${t7.wrong.max} deg the wrong way)`);
      say(Boolean(r.withRudder) && r.withRudder.wrong <= t7.coordWrongMax && r.withRudder.bank >= 30,
        `the same with ${t7.rudder} of it in right rudder: ${r.withRudder ? `the nose ${r.withRudder.wrong} deg the wrong way, ${r.withRudder.bank} deg of bank in ${r.withRudder.s} s` : 'never rolled'} (under ${t7.coordWrongMax} deg)`);
    } else if (mode === 'stall') {
      const t8 = th.t8_stall_power_off;
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
      say(L.length > 0 && !r.crashed && worstBank <= t8.maxBankDeg && worstP <= t8.maxRollRateDegS && minPitch >= t8.minPitchDeg,
        `the slow pull to full up, power off, wings held: bank moved at most ${worstBank.toFixed(1)} deg, roll rate at most ${worstP.toFixed(1)} deg/s, pitch down to ${minPitch.toFixed(1)} (bank ${t8.maxBankDeg}, roll ${t8.maxRollRateDegS} deg/s, pitch over ${t8.minPitchDeg})`);
    }
    await page.evaluate("window.__stick(0,0,0,0); window.__ui.onAction('title', window.__ui.settings); true");
    await page.until("window.__craftState().mode !== 'flight'", 60000);
  }
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
