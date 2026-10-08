/*
 * extra-owner.js: the owner's Extra 300 flight test, flown headless in the
 * real shell, the plant gates' 3D flying made a check on the page. On
 * swiss2 (the Free Flight card's home) with the extra-manual tune, each
 * from standing on the strip, a take off and a climb of 80 m first:
 *
 *   hang     pulled to the vertical and held there on the elevator and the
 *            rudder, the throttle holding the height, the roll rate held at
 *            nothing on the ailerons: the mean throttle over 4 s inside
 *            tests/extra-thresholds.json e6_hover, the height within its
 *            drift; then the ailerons let go, the torque roll: the mean roll
 *            rate over the last 3 of 6 s to the left inside e8_torque_roll;
 *   harrier  from level at 12 m/s the nose raised over 5 s to 40 deg of
 *            angle of attack and held there, the throttle holding the
 *            height: the mean of the last 5 of 20 s inside e11_harrier;
 *   knife    from level at 15 m/s rolled right to 90 deg, the height held
 *            on the rudder through the sideslip, the speed on the throttle:
 *            the mean of the last 5 of 15 s inside e12_knife_edge.
 *
 * The pilots are extra-gates.js E6, E8, E11 and E12's, closed once a
 * frame on __craftState() rather than once a plant step, so their gains
 * are per second. Timed on the plant's own clock (__craftState().simS),
 * since headless the page's runs at its own rate. The angle of attack and
 * the sideslip are the plant's, taken from the world velocity and the body
 * axes the page publishes. Needs no board. SIM_GPU=1 renders on this
 * machine's GPU, which makes it several times quicker.
 *
 *   node scripts/extra-owner.js [modes] [map]   (npm run extra:owner)
 *
 * EXTRA_OWNER_LOG=1 prints the pilot's samples, one each half second of
 * the plant's time: phase, time in it, frame step, height, climb, speed,
 * nose, roll rate and the four sticks.
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
const th = JSON.parse(await readFile(join(root, 'tests/extra-thresholds.json'), 'utf8'));
const AF = 'extra1308';
const MODES = (process.argv[2] ?? 'hang,harrier,knife').split(',');
const MAP = process.argv[3] ?? 'swiss2';

/*
 * The pilot, in the page, once a frame. Three.js space: y is up. The body
 * axes are fwd (plant x), up (plant z) and left = up x fwd (plant y); the
 * rates are the plant's body rates, p right wing down, q nose down and r
 * nose left positive. Nose up stick is a negative q, right rudder a
 * negative r, right aileron a positive p.
 */
const PILOT = (mode) => `
window.__T = { log: [], done: false };
(() => {
  const T = window.__T;
  const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const axes = (c) => ({ fwd: c.fwd, up: c.up, left: cross(c.up, c.fwd) });
  const pitchOf = (c) => Math.asin(clamp(c.fwd.y));
  const bankOf = (c) => { const a = axes(c); return Math.atan2(a.left.y, a.up.y); };
  const psiOf = (c) => Math.atan2(-c.fwd.z, c.fwd.x);
  const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
  const alphaOf = (c) => { const a = axes(c); return Math.atan2(-dot(c.vel, a.up), dot(c.vel, a.fwd)); };
  const betaOf = (c) => { const a = axes(c); const v = Math.max(0.1, Math.hypot(c.vel.x, c.vel.y, c.vel.z)); return -dot(c.vel, a.left) / v; };
  const c0 = window.__craftState();
  const psi0 = psiOf(c0), y0 = c0.worldY;
  let phase = 'roll', tPhase = c0.simS, prevS = c0.simS, airS = 0;
  let iT = 0.6, iP = 0, iB = 0, iA = 0, iH = 0, hT = 0, psiT = 0;
  let sum = {};
  const acc = (k, v) => { sum[k] = (sum[k] || 0) + v; };
  const enter = (p, now) => { phase = p; tPhase = now; sum = {}; };
  /* Level at a height and a speed: the pitch from the height, the
   * throttle from the speed, the wings level, the heading held. */
  const level = (c, dt, vT) => {
    const pitchT = clamp(0.03 * (hT - c.worldY) - 0.05 * c.vel.y, -0.3, 0.3);
    const pitch = clamp(1.5 * (pitchT - pitchOf(c)) + 0.15 * c.rates.q);
    const roll = clamp(-0.6 * bankOf(c) - 0.06 * c.rates.p);
    const yaw = clamp(1.0 * wrap(psiOf(c) - psiT) + 0.2 * c.rates.r);
    iT = clamp(iT + 0.05 * (vT - c.speed) * dt, 0, 1);
    return [roll, pitch, yaw, clamp(iT + 0.1 * (vT - c.speed), 0, 1)];
  };
  /* The throttle that holds the height, extra-gates.js heightHold per second. */
  const hold = (c, dt) => {
    const vz = clamp(0.5 * (hT - c.worldY), -2, 2) - c.vel.y;
    iT = clamp(iT + 0.2 * vz * dt, 0, 1);
    return clamp(iT + 0.08 * vz, 0, 1);
  };
  /* extra-gates.js hangSticks: the nose onto world up on the elevator and
   * the rudder, the error taken into the body's axes. Its gains, 10 and
   * 0.8, close at the plant's 250 Hz; once a frame, 17 to 50 ms of the
   * plant's time, they ring, so the page's are lower, with an integral
   * as a pilot's hands find the stick that holds it. The integral is kept
   * in the world's axes and read into the body's each frame, so it turns
   * with the airframe through a torque roll rather than trimming the
   * elevator for where the rudder was a quarter turn ago. */
  const KP = 5, KR = 0.3, KI = 1.5;
  const iW = { x: 0, y: 0, z: 0 };
  const hang = (c, rollStick, rollRate, dt) => {
    const a = axes(c);
    const cw = cross(c.fwd, { x: 0, y: 1, z: 0 });
    const e1 = dot(cw, a.left), e2 = dot(cw, a.up);
    for (const k of ['x', 'y', 'z']) iW[k] = clamp(iW[k] - KI * cw[k] * dt, -0.8, 0.8);
    const pitch = clamp(-KR * (KP * e1 - c.rates.q) + dot(iW, a.left));
    const yaw = clamp(-KR * (KP * e2 - c.rates.r) + dot(iW, a.up));
    const roll = rollRate == null ? rollStick : clamp(0.5 * (rollRate - c.rates.p));
    return [roll, pitch, yaw];
  };
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd || !c.vel || !c.rates) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-3, now - prevS); prevS = now;
    const t = now - tPhase;
    let s = [0, 0, 0, 1];
    if (phase === 'roll') {
      /* extra-gates.js extraTakeoffSticks: the tail up and off at 10 m/s. */
      const pitchT = (c.speed < 5 ? 6 : (c.speed < 10 ? 2 : 8)) * Math.PI / 180;
      s = [clamp(-0.6 * bankOf(c) - 0.06 * c.rates.p), clamp(1.5 * (pitchT - pitchOf(c)) + 0.12 * c.rates.q), clamp(1.5 * wrap(psiOf(c) - psi0) + 0.2 * c.rates.r), 1];
      airS = c.groundClearance < 0.5 ? 0 : airS + dt;
      if (airS > 1) { T.lift = { speed: +c.speed.toFixed(2) }; hT = y0 + 80; psiT = psi0; iT = 0.8; enter('climb', now); }
      if (t > 30) phase = 'end';
    } else if (phase === 'climb') {
      s = level(c, dt, 16);
      if (Math.abs(c.worldY - hT) < 3 && t > 8) enter('${mode}' === 'hang' ? 'pull' : 'settle', now);
      if (t > 60) phase = 'end';
    } else if (phase === 'settle') {
      const vT = '${mode}' === 'harrier' ? 12 : ${th.e12_knife_edge.speed};
      s = level(c, dt, vT);
      if (t > 8) { iT = '${mode}' === 'harrier' ? 0.55 : iT; iP = 0; iB = 0; iA = 0; iH = 0; hT = c.worldY; psiT = psiOf(c); enter('${mode}', now); }
    } else if (phase === 'pull') {
      /* Up to the vertical at full throttle, then hanging. */
      s = [...hang(c, 0, 0, dt), 1];
      if (pitchOf(c) > 1.3) { hT = c.worldY; iT = 0.62; enter('hover', now); }
      if (t > 10) phase = 'end';
    } else if (phase === 'hover') {
      const thr = hold(c, dt);
      s = [...hang(c, 0, 0, dt), thr];
      if (t > 8) { acc('thr', thr); acc('n', 1); T.yMin = Math.min(T.yMin ?? 1e9, c.worldY); T.yMax = Math.max(T.yMax ?? -1e9, c.worldY); }
      if (t > 12) { T.hover = { thr: sum.thr / sum.n, drift: T.yMax - T.yMin, nose: pitchOf(c) * 180 / Math.PI }; enter('torque', now); }
    } else if (phase === 'torque') {
      s = [...hang(c, 0, null, dt), hold(c, dt)];
      if (t > 3) { acc('p', c.rates.p); acc('n', 1); }
      if (t > 6) { T.torque = { p: sum.p / sum.n * 180 / Math.PI, nose: pitchOf(c) * 180 / Math.PI }; phase = 'end'; }
    } else if (phase === 'harrier') {
      const target = ${th.e11_harrier.alphaDeg} * Math.PI / 180;
      const alpha = alphaOf(c), bank = bankOf(c);
      const at = Math.min(target, 0.1 + target * t / 5);
      iP = clamp(iP + 1.5 * (at - alpha) * dt);
      iB = clamp(iB - 1.0 * bank * dt, -0.5, 0.5);
      const pitch = clamp(1.5 * (at - alpha) + 0.15 * c.rates.q + iP);
      const thr = hold(c, dt);
      s = [clamp(-0.6 * bank - 0.06 * c.rates.p + iB), pitch, clamp(1.0 * wrap(psiOf(c) - psiT) + 0.2 * c.rates.r), thr];
      if (t > 15) {
        acc('v', c.speed); acc('thr', thr); acc('e', pitch); acc('a', alpha); acc('n', 1);
        T.bank = Math.max(T.bank ?? 0, Math.abs(bank) * 180 / Math.PI);
        T.yMin = Math.min(T.yMin ?? 1e9, c.worldY); T.yMax = Math.max(T.yMax ?? -1e9, c.worldY);
      }
      if (t > 20) { T.harrier = { v: sum.v / sum.n, thr: sum.thr / sum.n, e: sum.e / sum.n, alpha: sum.a / sum.n * 180 / Math.PI, bank: T.bank, drift: T.yMax - T.yMin }; phase = 'end'; }
    } else if (phase === 'knife') {
      const vT = ${th.e12_knife_edge.speed};
      const bank = bankOf(c), bankT = Math.min(Math.PI / 2, t * 3);
      iA = clamp(iA - 1.0 * (bank - bankT) * dt, -0.5, 0.5);
      const roll = clamp(-0.8 * (bank - bankT) - 0.05 * c.rates.p + iA);
      const vz = clamp(0.3 * (hT - c.worldY), -2, 2) - c.vel.y;
      iH = clamp(iH + 0.2 * vz * dt, -0.3, 0.9);
      const betaT = 0.3 + 0.2 * vz + iH;
      const beta = betaOf(c);
      iB = clamp(iB + 3 * (betaT - beta) * dt);
      const yaw = t < 0.3 ? 0 : clamp(-3 * (betaT - beta) - iB + 0.3 * c.rates.r);
      const pitch = clamp(0.8 * wrap(psiOf(c) - psiT) + 0.15 * c.rates.q);
      iT = clamp(iT + 0.125 * (vT - c.speed) * dt, 0, 1);
      const thr = clamp(iT + 0.1 * (vT - c.speed), 0, 1);
      s = [roll, pitch, yaw, thr];
      if (t > 10) {
        acc('b', beta); acc('thr', thr); acc('r', yaw); acc('n', 1);
        T.yMin = Math.min(T.yMin ?? 1e9, c.worldY); T.yMax = Math.max(T.yMax ?? -1e9, c.worldY);
        T.bankOff = Math.max(T.bankOff ?? 0, Math.abs(bank * 180 / Math.PI - 90));
      }
      if (t > 15) { T.knife = { beta: sum.b / sum.n * 180 / Math.PI, thr: sum.thr / sum.n, r: sum.r / sum.n, bankOff: T.bankOff, drift: T.yMax - T.yMin }; phase = 'end'; }
    }
    if (c.crashed) phase = 'end';
    if (phase === 'end') {
      T.done = true;
      T.res = { lift: T.lift, crashed: c.crashed, hover: T.hover, torque: T.torque, harrier: T.harrier, knife: T.knife, at: T.at };
      window.__stick(0, 0, 0, 0);
      return;
    }
    T.at = phase;
    if (now - (T.lastLog ?? -1) > 0.5) { T.lastLog = now; T.log.push([phase, +t.toFixed(2), +dt.toFixed(4), +(c.worldY - y0).toFixed(1), +c.vel.y.toFixed(2), +c.speed.toFixed(1), +(pitchOf(c) * 57.3).toFixed(0), +(c.rates.p * 57.3).toFixed(0), ...s.map((x) => +x.toFixed(2))]); }
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
const f = (x, d = 2) => (x == null ? 'none' : x.toFixed(d));

const page = await openPage({ root, width: 960, height: 540, url: '/index.html' });
try {
  await page.until('!!window.__shellReady', 240000);
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  if (MAP !== 'swiss2') {
    await page.evaluate(`window.__ui.seatMap('${MAP}'); true`);
    await page.until(`window.__ui.settings.map === '${MAP}' && window.__map && window.__map().ready`, 400000);
  }
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = 'extra-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`extra owner test on ${MAP}: ${seated}`);
  for (const mode of MODES) {
    await page.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
    await page.sleep(2000);
    const st = await page.evaluate('({ tune: window.__craftState().tune, stab: window.__craftState().wingStab })');
    await page.evaluate(PILOT(mode));
    const t0 = Date.now();
    while (Date.now() - t0 < 900000 && !(await page.evaluate('window.__T.done'))) {
      await page.sleep(1000);
    }
    const r = (await page.evaluate('window.__T')).res || {};
    console.log(`${mode}: ${st.tune}, mode ${st.stab}, ${JSON.stringify(r)}`);
    if (process.env.EXTRA_OWNER_LOG) for (const x of (await page.evaluate('window.__T.log'))) console.log('    ' + JSON.stringify(x));
    if (mode === 'hang') {
      const t6 = th.e6_hover;
      const t8 = th.e8_torque_roll;
      const h = r.hover;
      say(Boolean(h) && !r.crashed && h.thr >= t6.min && h.thr <= t6.max && h.drift <= t6.maxHeightDrift,
        `hangs on the prop: throttle ${h ? f(h.thr, 4) : 'never hung'}, height within ${h ? f(h.drift) : '-'} m, nose ${h ? f(h.nose, 1) : '-'} deg (${t6.min} to ${t6.max}, within ${t6.maxHeightDrift} m)`);
      const q = r.torque;
      say(Boolean(q) && !r.crashed && q.p < 0 && -q.p >= t8.min && -q.p <= t8.max,
        `torque roll, the ailerons let go: ${q ? `${f(-q.p, 0)} deg/s ${q.p < 0 ? 'left' : 'RIGHT'}, nose ${f(q.nose, 1)} deg` : 'never reached'} (${t8.min} to ${t8.max} left)`);
    } else if (mode === 'harrier') {
      const t11 = th.e11_harrier;
      const h = r.harrier;
      say(Boolean(h) && !r.crashed && h.v >= t11.vMin && h.v <= t11.vMax && h.thr >= t11.dutyMin && h.thr <= t11.dutyMax && h.e < 1 && h.bank <= t11.maxBankDeg && h.drift <= t11.maxHeightDrift,
        h ? `harrier at ${f(h.alpha, 1)} deg alpha: ${f(h.v)} m/s at throttle ${f(h.thr, 3)}, elevator ${f(h.e)}, bank under ${f(h.bank, 1)}, height within ${f(h.drift)} m (${t11.vMin} to ${t11.vMax} m/s, ${t11.dutyMin} to ${t11.dutyMax}, within ${t11.maxHeightDrift} m)`
          : `harrier: never reached, stopped in ${r.at}`);
    } else if (mode === 'knife') {
      const t12 = th.e12_knife_edge;
      const k = r.knife;
      say(Boolean(k) && !r.crashed && k.beta >= t12.betaMin && k.beta <= t12.betaMax && k.thr >= t12.dutyMin && k.thr <= t12.dutyMax && Math.abs(k.r) < 1 && k.drift <= t12.maxHeightDrift,
        k ? `knife edge: sideslip ${f(k.beta, 1)} deg at throttle ${f(k.thr, 3)}, rudder ${f(k.r)}, bank off 90 by under ${f(k.bankOff, 1)}, height within ${f(k.drift)} m (${t12.betaMin} to ${t12.betaMax} deg, ${t12.dutyMin} to ${t12.dutyMax}, within ${t12.maxHeightDrift} m)`
          : `knife edge: never reached, stopped in ${r.at}`);
    }
    await page.evaluate("window.__stick(0,0,0,0); window.__ui.onAction('title', window.__ui.settings); true");
    await page.until("window.__craftState().mode !== 'flight'", 60000);
  }
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
