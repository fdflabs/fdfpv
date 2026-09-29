/*
 * pitts-owner.js: the owner's Pitts S-1S flight test, flown headless in
 * the real shell and timed on the plant's clock, scripts/edge-owner.js's
 * pattern. On swiss2 (the Free Flight card's home, or the map named) with
 * the pitts-manual tune, one flight:
 *
 *   takeoff   full throttle opened over a second, the tail up on the
 *             elevator, the wings on the ailerons and the heading on the
 *             rudder: within pitts:gates P13's 5 deg until it is 3 m up.
 *             Then the same with the pilot's feet off the rudder, recorded,
 *             not banded: the swing a short taildragger makes (P13b).
 *   roll      at 120 m, level at three quarter throttle, then full right
 *             aileron through a whole roll: P5's helix angle pb/2V and
 *             the full size S-1S's 220 deg/s at least. (On its back, P8,
 *             is pitts:gates'; the page's hands hold it less well.)
 *   yank      full up at once from level, 1.2 s, ailerons and rudder
 *             centred: P9a's comfortable stall, under a quarter turn of
 *             roll, and let go it stops within 0.5 s.
 *   snap R, L full up and full rudder, 2 s: P9b, still turning the
 *             rudder's way at half its peak rate at the end, a quarter
 *             turn at least; then AOPA's recovery, the stick released and
 *             the rudder the other way: the roll stops within 0.5 s, and a
 *             wings level hold brings it within 10 deg of level in 3 s.
 *
 * The roll turned is the plant's body roll rate (__craftState().rates.p)
 * integrated on __craftState().simS. Needs no board. SIM_GPU=1 renders on
 * this machine's GPU, which makes it several times quicker.
 *
 *   node scripts/pitts-owner.js [map]   (npm run pitts:owner)
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
const th = JSON.parse(await readFile(join(root, 'tests/pitts-thresholds.json'), 'utf8'));
const AF = 'pitts850';
const MAP = process.argv[2] ?? 'swiss2';

/*
 * The pilot, in the page, once a frame, on the plant's clock. Angles in
 * degrees: yaw + right of the heading it started on, bank + right wing
 * down and 180 on its back. `hands` is the take off with the sticks let
 * alone but the throttle and a touch of up elevator, the lead's; the rest
 * is one flight, a phase machine whose results land in window.__T.out.
 */
const PILOT = (hands) => `
window.__T = { out: {}, done: false, phase: '' };
(() => {
  const T = window.__T, O = T.out;
  const D = 180 / Math.PI;
  const c0 = window.__craftState();
  const f0 = c0.fwd, rest = c0.groundClearance;
  const n0 = Math.hypot(f0.x, f0.z);
  const fx = f0.x / n0, fz = f0.z / n0, rx = -fz, rz = fx;
  const yawOf = (f) => Math.atan2(f.x * rx + f.z * rz, f.x * fx + f.z * fz) * D;
  const bankOf = (c) => { const ry = c.fwd.z * c.up.x - c.fwd.x * c.up.z; return Math.atan2(-ry, c.up.y) * D; };
  const wrap = (a) => ((a % 360) + 540) % 360 - 180;
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  let phase = 'roll', tP = c0.simS, prev = c0.simS, air = 0, turned = 0, trim = 0, acc = {}, hold = 120;
  const go = (p, c) => { phase = p; tP = c.simS; acc = {}; turned = 0; wI = 0; };
  /* Level on the elevator: a pitch over the horizon that holds the
   * height, pittsLevel's loop (tests/lib/wingpilot.js) with the elevator's
   * own integral. A pilot flies it short of the stall: a quarter stick of
   * up at the trim is already past it (pitts:derive), so the hand stops at
   * 0.2 of pull. */
  let eTrim = 0;
  const level = (c, dt, h) => {
    const pitch = Math.asin(cl(c.fwd.y, -1, 1));
    const vy = c.vel ? c.vel.y : 0;
    const qAero = c.rates ? -c.rates.q : 0;
    trim = cl(trim - 0.025 * vy * dt + 0.0005 * (hold - h) * dt, -0.2, 0.2);
    const pitchT = cl(trim - 0.05 * vy + 0.01 * (hold - h), -0.2, 0.2);
    eTrim = cl(eTrim + (pitchT - pitch) * dt, -1, 0.2);
    return cl(2.5 * (pitchT - pitch) - 0.25 * qAero + eTrim, -1, 0.2);
  };

  /* The wings held on the ailerons, with the hand's slow part: the prop's
   * torque at three quarter throttle wants 4 percent of aileron, which a
   * proportional hand alone leaves 3 deg of bank short of level. */
  let wI = 0, dtNow = 0;
  const wings = (c, b) => {
    const e = wrap(bankOf(c) - b) / D;
    wI = cl(wI - 0.5 * e * dtNow, -0.3, 0.3);
    return cl(-0.8 * e - 0.05 * (c.rates ? c.rates.p : 0) + wI, -1, 1);
  };
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-4, now - prev); prev = now;
    dtNow = dt;
    const el = now - tP, h = c.groundClearance - rest, p = c.rates ? c.rates.p : 0;
    turned += p * dt * D;
    const yaw = yawOf(c.fwd), bank = bankOf(c);
    let s = [0, 0, 0, 1];
    if (phase === 'roll') {
      {
        const pitch = Math.asin(cl(c.fwd.y, -1, 1)) * D;
        const qAero = c.rates ? -c.rates.q : 0;
        const yr = c.rates ? -c.rates.r * D : 0;
        const want = c.speed < ${th.p12_takeoff.vRotate} ? 3 : 10;
        /* The throttle opened over a second from the shell's take off
         * throttle, 0.25, under which it stays parked and the plant's clock
         * stands still. */
        /* With the feet off (${hands}) the rudder stays centred and the
         * swing is the aircraft's. */
        const feet = ${hands} ? 0 : 1;
        s = [wings(c, 0), cl(2.5 * (want - pitch) / D - 0.25 * qAero, -1, 1), cl(feet * (-2.0 * yaw / D - 0.3 * yr / D), -1, 1), cl(0.3 + 0.7 * el, 0, 1)];
      }
      acc.maxYaw = Math.max(acc.maxYaw || 0, Math.abs(yaw));
      if (h > 0.02 && O.lift === undefined) O.lift = { t: +el.toFixed(2), yaw: +yaw.toFixed(2), speed: +c.speed.toFixed(1) };
      if (h > 3) {
        O.takeoff = { maxYaw: +acc.maxYaw.toFixed(2), yawAt3m: +yaw.toFixed(2), bankAt3m: +bank.toFixed(1), speed: +c.speed.toFixed(1), t: +el.toFixed(2) };
        if (${hands}) { phase = 'end'; } else { go('climb', c); }
      }
      if (el > 20 || c.crashed) { O.takeoff = O.takeoff || 'failed'; phase = 'end'; }
    } else if (phase === 'climb') {
      const vy = c.vel ? c.vel.y : 0;
      s = [wings(c, 0), cl(0.05 * (8 - vy), -0.4, 0.4), 0, 1];
      if (h > hold) go(T.next || 'cruise', c);
      if (el > 180) phase = 'end';
    } else if (phase === 'cruise') {
      s = [wings(c, 0), level(c, dt, h), 0, 0.75];
      if (el > 6) { acc.n = (acc.n || 0) + 1; acc.v = (acc.v || 0) + c.speed; acc.st = (acc.st || 0) + s[1]; }
      if (el > 10) { O.upright = { speed: +(acc.v / acc.n).toFixed(2), stick: +(acc.st / acc.n).toFixed(3) }; go('aileron', c); }
    } else if (phase === 'aileron') {
      /* Full right aileron from level: the peak roll rate and the speed
       * then, until it is on its back. */
      s = [1, 0, 0, 0.75];
      if (Math.abs(p) > (acc.peak || 0)) { acc.peak = Math.abs(p); acc.v = c.speed; }
      if (Math.abs(wrap(bank)) > 165) { O.rollRate = { degS: +(acc.peak * D).toFixed(0), speed: +acc.v.toFixed(2) }; go('toUp', c); }
    } else if (phase === 'toUp') {
      s = [1, 0, 0, 0.75];
      if (Math.abs(wrap(bank)) < 15) { eTrim = 0; T.queue = ['yank', 'snapR', 'snapL']; go('settle', c); }
    } else if (phase === 'settle') {
      s = [wings(c, 0), level(c, dt, h), 0, 0.75];
      if (el > 4 && Math.abs(bank) < 5) {
        if (h < 80) { T.next = 'settle'; hold = 120; go('climb', c); }
        else { const nx = T.queue.shift(); go(nx || 'end', c); }
      }
    } else if (phase === 'yank' || phase === 'half') {
      const held = ${th.p9_snap.holdS};
      if (el < held) {
        s = [0, 1, 0, 0.75];
        acc.at = turned;
      } else {
        s = [0, 0, 0, 0.75];
        if (acc.stop === undefined && Math.abs(p) * D < 30) acc.stop = +(el - held).toFixed(3);
      }
      if (el > held + 1) {
        O[phase] = { rolled: +acc.at.toFixed(0), stoppedAfter: acc.stop === undefined ? null : acc.stop };
        hold = Math.max(80, h); go('settle', c);
      }
    } else if (phase === 'snapR' || phase === 'snapL') {
      const sg = phase === 'snapR' ? 1 : -1;
      const held = ${th.p9_snap.snapHoldS};
      if (el < held) {
        s = [0, 1, sg, 0.75];
        acc.peak = Math.max(acc.peak || 0, Math.abs(p) * D);
        if (el > held - 0.5) { acc.ln = (acc.ln || 0) + 1; acc.last = (acc.last || 0) + sg * p * D; }
        acc.at = turned;
      } else if (acc.stop === undefined) {
        s = [0, 0, -sg, 0.5];
        if (Math.abs(p) * D < 30) { acc.stop = el - held; acc.after = turned - acc.at; }
        if (el - held > 2) { acc.stop = null; acc.after = turned - acc.at; }
      } else {
        s = [wings(c, 0), 0, 0, 1];
        const b = Math.abs(wrap(bank));
        if (acc.lvl === undefined && b < 10) acc.lvl = el - held - acc.stop;
        if (el - held > (acc.stop || 0) + 3) {
          O[phase] = { rolled: +acc.at.toFixed(0), peak: +acc.peak.toFixed(0), last: +(acc.last / acc.ln).toFixed(0), stoppedAfter: acc.stop === null ? null : +acc.stop.toFixed(3), rolledAfter: +acc.after.toFixed(1), levelAfter: acc.lvl === undefined ? null : +acc.lvl.toFixed(2) };
          hold = 120; go('settle', c);
        }
      }
    }
    if (c.crashed && !O.crashedIn) O.crashedIn = phase;
    T.phase = phase;
    T.dbg = { bank: +bank.toFixed(1), h: +h.toFixed(1), v: +c.speed.toFixed(1), el: +el.toFixed(1), pitch: +(Math.asin(cl(c.fwd.y, -1, 1)) * D).toFixed(1) };
    if (phase === 'end' || c.crashed) { T.done = true; window.__stick(0, 0, 0, 0); return; }
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

async function fly(page, hands) {
  await page.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
  await page.sleep(2000);
  await page.evaluate(PILOT(hands));
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < 1500000 && !(await page.evaluate('window.__T.done'))) {
    const ph = await page.evaluate('window.__T.phase');
    if (ph !== last) { console.log(`    ${ph}`); last = ph; } else if (process.env.PITTS_OWNER_DEBUG) { console.log(`      ${JSON.stringify(await page.evaluate('window.__T.dbg'))}`); }
    await page.sleep(1000);
  }
  const out = await page.evaluate('window.__T.out');
  await page.evaluate("window.__stick(0,0,0,0); window.__ui.onAction('title', window.__ui.settings); true");
  await page.until("window.__craftState().mode !== 'flight'", 60000);
  return out;
}

const page = await openPage({ root, width: 960, height: 540, url: '/index.html' });
try {
  await page.until('!!window.__shellReady', 240000);
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  if (MAP !== 'swiss2') {
    await page.evaluate(`window.__ui.seatMap('${MAP}'); true`);
    await page.until(`window.__ui.settings.map === '${MAP}' && window.__map && window.__map().ready`, 400000);
  }
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = 'pitts-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`pitts owner test on ${MAP}: ${seated}`);

  console.log('feet off the rudder take off, recorded');
  const handsOut = await fly(page, true);
  console.log(`  ${JSON.stringify(handsOut)}`);
  console.log('the flight');
  const O = await fly(page, false);
  console.log(`  ${JSON.stringify(O)}`);

  const e8 = th.p8_inverted;
  const e9 = th.p9_snap;
  const tk = O.takeoff;
  say(tk && tk !== 'failed' && tk.maxYaw <= th.p13_straight.maxHeadingDeg,
    `take off on the rudder: heading within ${tk && tk.maxYaw} deg to 3 m, off at ${O.lift ? O.lift.speed : '?'} m/s (within ${th.p13_straight.maxHeadingDeg})`);
  const rr = O.rollRate;
  const pb = rr ? (rr.degS / (180 / Math.PI)) * 0.850 / (2 * rr.speed) : null;
  say(rr && pb >= th.p5_roll.min && pb <= th.p5_roll.max && rr.degS >= th.p5_roll.minDegS,
    `full aileron: ${rr && rr.degS} deg/s at ${rr && rr.speed} m/s, pb/2V ${pb === null ? '?' : pb.toFixed(3)} (${th.p5_roll.min} to ${th.p5_roll.max}, at least ${th.p5_roll.minDegS} deg/s)`);
  const y = O.yank;
  say(y && Math.abs(y.rolled) < e9.comfortDeg && y.stoppedAfter !== null && y.stoppedAfter <= e9.stopS,
    `a yank is a comfortable stall: ${y && y.rolled} deg in ${e9.holdS} s, stopped ${y && y.stoppedAfter} s after letting go (under ${e9.comfortDeg} deg, ${e9.stopS} s)`);
  for (const [k, sg] of [['snapR', 1], ['snapL', -1]]) {
    const r = O[k];
    say(r && sg * r.rolled >= e9.turnDeg && r.last >= e9.keepShare * r.peak,
      `${k}: ${r && r.rolled} deg the rudder's way in ${e9.snapHoldS} s, ${r && r.last} deg/s over its last half second of a ${r && r.peak} peak (${e9.turnDeg} deg, ${e9.keepShare} of the peak)`);
    say(r && r.stoppedAfter !== null && r.stoppedAfter <= e9.recoverS && r.levelAfter !== null && r.levelAfter <= 3,
      `${k} recovery: stopped ${r && r.stoppedAfter} s after the rudder reversed, ${r && r.rolledAfter} deg on; wings level in ${r && r.levelAfter} s (${e9.recoverS} s, level within 3 s)`);
  }
  say(!O.crashedIn, `not crashed${O.crashedIn ? `: in ${O.crashedIn}` : ''}`);
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
