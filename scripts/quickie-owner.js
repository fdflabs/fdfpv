/*
 * quickie-owner.js: the owner's Quickie 500 flight test, flown headless in
 * the real shell and held to tests/quickie-thresholds.json, on the pattern
 * of scripts/uglystik-owner.js. On swiss2 (the Free Flight card's home)
 * with the quickie-manual tune, one flight:
 *
 *   off     full throttle from standing, the wings held level, the rest
 *           attitude held on the elevator: it lifts off from the ground
 *           inside Q13's band, as the class takes off;
 *   top     a climb to 40 m, then level flat out for 12 s: its speed inside
 *           Q1's band, the class's pace;
 *   roll    full right aileron held once round: the roll's peak pb/2V
 *           inside Q5's band;
 *   pylon   level flat out again, then rolled to 80 deg of bank and pulled
 *           round 180 deg of heading holding the height, ailerons and
 *           elevator only: the speed it loses and the radius inside Q6's
 *           bands, the sideslip under its 5 deg.
 *
 * Timed on the plant's own clock (__craftState().simS), since headless the
 * page's runs faster than the sim's. Needs no board. SIM_GPU=1 renders on
 * this machine's GPU, which makes it several times quicker.
 *
 *   node scripts/quickie-owner.js [map]   (npm run quickie:owner)
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
const th = JSON.parse(await readFile(join(root, 'tests/quickie-thresholds.json'), 'utf8'));
const AF = 'quickie1293';
const SPAN = 1.2934;
const MAP = process.argv[2] ?? 'swiss2';
/* Q6's turn: the bank that holds the height at 6 g. */
const BANK = Math.acos(1 / th.q6_pylon.n);

/*
 * The pilot, in the page, once a frame. Bank + right wing down, pitch +
 * nose up, from the aircraft's forward and up axes in the world. The roll
 * is counted from the body roll rate on the plant's clock, the turn from
 * the velocity's heading, its radius the path flown over the heading
 * turned.
 */
const PILOT = `
window.__T = { done: false };
(() => {
  const T = window.__T;
  const c0 = window.__craftState();
  const rest = c0.groundClearance;
  const bankOf = (c) => Math.atan2(-(c.fwd.z * c.up.x - c.fwd.x * c.up.z), c.up.y);
  const pitchOf = (c) => Math.asin(Math.max(-1, Math.min(1, c.fwd.y)));
  const headOf = (c) => Math.atan2(c.vel.x, -c.vel.z);
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const soft = (c) => (c.speed > 12 ? (12 / c.speed) ** 2 : 1);
  let contactSteps = window.__ground().contactSteps;
  let phase = 'off', tPhase = c0.simS, prevS = c0.simS, airS = 0, x0 = null, turned = 0, hold = 0.4, trim = 0;
  let head = 0, h0 = 0, yawSum = 0, yawN = 0, betaMax = 0, qi = 0, vSum = 0;
  const REST = ${(6.47 * Math.PI) / 180};
  const level = (c) => {
    const vy = c.vel ? c.vel.y : 0;
    trim = Math.max(-0.3, Math.min(0.3, trim + 0.3 * (0 - vy) * 0.004));
    return [clamp(-bankOf(c) * 1.5 - (c.rates ? c.rates.p : 0) * 0.05), clamp(trim + soft(c) * (-0.4 * vy - 2 * (pitchOf(c) - 0.01))), 0, 1];
  };
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-3, now - prevS); prevS = now;
    const h = c.groundClearance - rest, bank = bankOf(c), pitch = pitchOf(c);
    const q = c.rates ? c.rates.q : 0;
    let s = [0, 0, 0, 1];
    if (phase === 'off') {
      if (x0 === null) x0 = { x: c.worldX, z: c.worldZ };
      hold = Math.max(-0.8, Math.min(0.8, hold + 3 * dt * (REST - pitch)));
      s = [clamp(-0.8 * bank), clamp(soft(c) * 4 * (REST - pitch) + hold), 0, 1];
      /* Liftoff is the last frame a wheel was loaded in, as Q13 reads it,
       * once the aircraft has been 0.3 m up for 0.5 s. */
      const steps = window.__ground().contactSteps;
      const onWheels = steps !== contactSteps;
      contactSteps = steps;
      if (onWheels) {
        T.lastGround = { speed: +c.speed.toFixed(2), dist: +Math.hypot(c.worldX - x0.x, c.worldZ - x0.z).toFixed(2), s: +(now - tPhase).toFixed(2) };
      }
      airS = h < 0.3 ? 0 : airS + dt;
      if (airS > 0.5) { T.lift = T.lastGround; phase = 'climb'; tPhase = now; }
      if (now - tPhase > 20 || c.crashed) phase = 'end';
    } else if (phase === 'climb') {
      s = [clamp(-0.8 * bank), clamp(soft(c) * 3 * (0.25 - pitch) + 0.1 * q), 0, 1];
      if (h > 40) { phase = 'top'; tPhase = now; vSum = 0; }
      if (now - tPhase > 30 || c.crashed) phase = 'end';
    } else if (phase === 'top') {
      s = level(c);
      if (now - tPhase > 12) {
        T.top = { v: +c.speed.toFixed(2), vy: +c.vel.y.toFixed(2), h: +h.toFixed(1) };
        phase = 'roll'; tPhase = now; turned = 0; T.peakPb = 0;
      }
    } else if (phase === 'roll') {
      s = [1, 0, 0, 1];
      const p = c.rates ? c.rates.p : 0;
      turned += p * dt;
      T.peakPb = Math.max(T.peakPb, Math.abs(p) * ${SPAN} / (2 * Math.max(1, c.speed)));
      if (Math.abs(turned) >= 2 * Math.PI) { T.roll = { s: +(now - tPhase).toFixed(2), peakPb: +T.peakPb.toFixed(4), v: +c.speed.toFixed(1) }; phase = 'relevel'; tPhase = now; }
      if (now - tPhase > 5 || c.crashed) phase = 'end';
    } else if (phase === 'relevel') {
      s = level(c);
      if (now - tPhase > 8) { phase = 'rollin'; tPhase = now; h0 = c.worldY; qi = 0; }
    } else if (phase === 'rollin' || phase === 'pylon') {
      /* Rolled to the turn's bank on the ailerons with the elevator held
       * where level flight had it, then pulled: the stick a 6 g level turn
       * holds (0.45, quickie-gates.js Q6's hand at steady state), trimmed
       * by the climb rate, as a pilot pulls to hold the height. */
      const bankT = ${BANK} + Math.max(-0.1, Math.min(0.1, 0.02 * c.vel.y));
      const roll = clamp(-1.5 * (bankOf(c) + bankT) - 0.05 * (c.rates ? c.rates.p : 0));
      if (phase === 'rollin') {
        s = [roll, level(c)[1], 0, 1];
      } else {
        qi = Math.max(-0.3, Math.min(0.3, qi + 0.3 * dt * (0 - c.vel.y)));
        s = [roll, clamp(0.45 + qi - 0.05 * c.vel.y), 0, 1];
      }
      if (phase === 'rollin' && Math.abs(bank) >= ${BANK} - 5 * Math.PI / 180) {
        phase = 'pylon'; tPhase = now; head = headOf(c); turned = 0; T.turnFrom = { v: c.speed };
        yawSum = 0; yawN = 0; betaMax = 0; qi = 0;
      } else if (phase === 'pylon') {
        const hNow = headOf(c);
        const d = Math.atan2(Math.sin(hNow - head), Math.cos(hNow - head));
        head = hNow;
        turned += d;
        yawSum += c.speed * dt;
        yawN += Math.abs(d);
        const vb = c.vel;
        const r = { x: c.fwd.y * c.up.z - c.fwd.z * c.up.y, y: c.fwd.z * c.up.x - c.fwd.x * c.up.z, z: c.fwd.x * c.up.y - c.fwd.y * c.up.x };
        betaMax = Math.max(betaMax, Math.abs(Math.asin(Math.max(-1, Math.min(1, (vb.x * r.x + vb.y * r.y + vb.z * r.z) / Math.max(1, c.speed))))));
        if (Math.abs(turned) >= Math.PI) {
          T.pylon = { v0: +T.turnFrom.v.toFixed(2), v1: +c.speed.toFixed(2), lostPct: +(100 * (T.turnFrom.v - c.speed) / T.turnFrom.v).toFixed(2), r: +(yawSum / yawN).toFixed(1), betaDeg: +(betaMax * 180 / Math.PI).toFixed(1), s: +(now - tPhase).toFixed(2), dy: +(c.worldY - h0).toFixed(1) };
          phase = 'end';
        }
      }
      if (now - tPhase > 10 || c.crashed) phase = 'end';
    }
    if (phase === 'end') {
      T.done = true;
      T.res = { lift: T.lift, top: T.top, roll: T.roll, pylon: T.pylon, crashed: c.crashed };
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
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = 'quickie-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`quickie owner test on ${MAP}: ${seated}`);
  await page.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
  await page.sleep(2000);
  const st = await page.evaluate('({ tune: window.__craftState().tune, stab: window.__craftState().wingStab })');
  await page.evaluate(PILOT);
  const t0 = Date.now();
  while (Date.now() - t0 < 900000 && !(await page.evaluate('window.__T.done'))) {
    await page.sleep(1000);
  }
  const T = await page.evaluate('window.__T');
  const r = T.res || {};
  console.log(`${st.tune}, mode ${st.stab}, ${JSON.stringify(r)}`);
  const t13 = th.q13_takeoff;
  say(Boolean(r.lift) && !r.crashed && within(r.lift.speed, t13.vMin, t13.vMax) && within(r.lift.dist, t13.distMin, t13.distMax),
    `off the ground, held three point: ${r.lift ? `${r.lift.speed} m/s after ${r.lift.dist} m in ${r.lift.s} s` : 'never left the ground'} (${t13.vMin} to ${t13.vMax} m/s, ${t13.distMin} to ${t13.distMax} m)`);
  const t1 = th.q1_top;
  say(Boolean(r.top) && within(r.top.v, t1.min, t1.max) && Math.abs(r.top.vy) < 1,
    `level flat out: ${r.top ? `${r.top.v} m/s (${(r.top.v / 0.44704).toFixed(1)} mph), climbing ${r.top.vy} m/s at ${r.top.h} m` : 'never got there'} (${t1.min} to ${t1.max} m/s)`);
  const t5 = th.q5_roll;
  say(Boolean(r.roll) && within(r.roll.peakPb, t5.min, t5.max),
    `full right aileron once round: ${r.roll ? `${r.roll.s} s, peak pb/2V ${r.roll.peakPb} at ${r.roll.v} m/s` : 'never went round'} (${t5.min} to ${t5.max})`);
  const t6 = th.q6_pylon;
  say(Boolean(r.pylon) && !r.crashed && within(r.pylon.lostPct, t6.lostPctMin, t6.lostPctMax) && within(r.pylon.r, t6.rMin, t6.rMax) && r.pylon.betaDeg <= t6.maxBetaDeg,
    `a pylon turn at ${(BANK * 180 / Math.PI).toFixed(1)} deg of bank, 180 deg round: ${r.pylon ? `${r.pylon.v0} to ${r.pylon.v1} m/s, lost ${r.pylon.lostPct} percent, radius ${r.pylon.r} m, sideslip under ${r.pylon.betaDeg} deg, ${r.pylon.s} s, height ${r.pylon.dy} m` : 'never came round'} (lost ${t6.lostPctMin} to ${t6.lostPctMax} percent, ${t6.rMin} to ${t6.rMax} m, sideslip under ${t6.maxBetaDeg} deg)`);
  await page.evaluate("window.__stick(0,0,0,0); window.__ui.onAction('title', window.__ui.settings); true");
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
