/*
 * wot4-owner.js: the owner's Wot 4 flight test, flown headless in the real
 * shell and timed on the plant's clock, scripts/edge-owner.js's pattern.
 * On swiss2 (the Free Flight card's home, or the map named) with the
 * wot4-manual tune, one flight, everything past the take off 150 m or more
 * over the ground (swiss2's valley floor rises under a long run):
 *
 *   takeoff   the throttle opened over a second and a half, the tail up
 *             on the elevator, the wings on the ailerons and the heading
 *             on the rudder: within wot4:gates W14b's 5 deg until it is 3 m
 *             up. Then the same with the pilot's hands off, recorded, not
 *             banded.
 *   loop      at 120 m, level at full throttle, half up stick held: a
 *             whole loop, W9's 30 m of height or more and over the top at
 *             1.3 Vs or more.
 *   inverted  level at full throttle upright, rolled on its back and held
 *             level: W8's push over the upright stick, "a breath of down
 *             elevator".
 *   stall     W10's entry, slowed to 14 m/s at 0.4 throttle, then the
 *             throttle closed and the stick eased to full back over 4 s
 *             and held 6: W10, the wings
 *             within 10 deg of level and no turn.
 *   spin R, L full up and full rudder, power off, held 4 s; then hands off,
 *             every stick centred: W11, it turns the rudder's way a quarter
 *             turn at least, and the rotation stops within 0.5 s and a
 *             quarter turn of letting go.
 *
 * Rates are the plant's body rates (__craftState().rates), integrated on
 * __craftState().simS. Needs no board. SIM_GPU=1 renders on this
 * machine's GPU, which makes it several times quicker.
 *
 *   node scripts/wot4-owner.js [map]   (npm run wot4:owner)
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
const th = JSON.parse(await readFile(join(root, 'tests/wot4-thresholds.json'), 'utf8'));
const AF = 'wot41334';
const MAP = process.argv[2] ?? 'swiss2';

/*
 * The pilot, in the page, once a frame, on the plant's clock. Angles in
 * degrees: yaw + right of the heading it started on, bank + right wing
 * down and 180 on its back, yaw rate + nose right. `hands` is the take off
 * with the sticks let alone but the throttle and a touch of up elevator;
 * the rest is one flight, a phase machine whose results land in
 * window.__T.out.
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
  let phase = 'roll', tP = c0.simS, prev = c0.simS, trim = 0, trimS = 0, acc = {}, hold = 180;
  const go = (p, c) => { phase = p; tP = c.simS; acc = {}; trim = 0; trimS = 0; };
  /* Level on the elevator, upright or on its back: a pitch over the horizon
   * that holds the height h against hold, with an integral on the stick
   * itself, the gates' levelHand (scripts/wot4-gates.js). The upright and
   * inverted runs hold the height above the sea (worldY), which the
   * valley's rising floor does not move. */
  const level = (c, inv, dt, h) => {
    const pitch = Math.asin(cl(c.fwd.y, -1, 1));
    const vy = c.vel ? c.vel.y : 0;
    const qAero = c.rates ? -c.rates.q : 0;
    trim = cl(trim - 0.025 * vy * dt + 0.0005 * (hold - h) * dt, -0.2, 0.2);
    trimS = cl(trimS + (inv ? -1 : 1) * 0.1 * (-vy + 0.02 * (hold - h)) * dt, -0.6, 0.6);
    const pitchT = cl(trim - 0.05 * vy + 0.01 * (hold - h), -0.2, 0.2);
    return cl((inv ? -1 : 1) * 2.5 * (pitchT - pitch) - 0.25 * qAero + trimS, -1, 1);
  };
  const wings = (c, b) => cl(-0.8 * wrap(bankOf(c) - b) / D - 0.05 * (c.rates ? c.rates.p : 0), -1, 1);
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-4, now - prev); prev = now;
    const el = now - tP, h = c.groundClearance - rest;
    const p = c.rates ? c.rates.p : 0, yr = c.rates ? -c.rates.r : 0;
    const yaw = yawOf(c.fwd), bank = bankOf(c);
    let s = [0, 0, 0, 1];
    if (phase === 'roll') {
      if (${hands}) {
        s = [0, 0.15, 0, 1];
      } else {
        const pitch = Math.asin(cl(c.fwd.y, -1, 1)) * D;
        const qAero = c.rates ? -c.rates.q : 0;
        const want = c.speed < ${th.w14_takeoff.vRotate} ? 2 : 8;
        /* The throttle opened over a second and a half from the shell's
         * take off throttle, 0.25, under which it stays parked and the
         * plant's clock stands still. */
        s = [wings(c, 0), cl(2.5 * (want - pitch) / D - 0.25 * qAero, -1, 1), cl(-2.0 * yaw / D - 0.3 * yr, -1, 1), cl(0.3 + 0.47 * el, 0, 1)];
      }
      acc.maxYaw = Math.max(acc.maxYaw || 0, Math.abs(yaw));
      if (h > 0.02 && O.lift === undefined) O.lift = { t: +el.toFixed(2), yaw: +yaw.toFixed(2), speed: +c.speed.toFixed(1) };
      if (h > 3) {
        O.takeoff = { maxYaw: +acc.maxYaw.toFixed(2), yawAt3m: +yaw.toFixed(2), bankAt3m: +bank.toFixed(1), speed: +c.speed.toFixed(1), t: +el.toFixed(2) };
        if (${hands}) { phase = 'end'; } else { T.queue = ['loop', 'turn', 'up', 'toInv', 'turn', 'stall', 'turn', 'spinR', 'turn', 'spinL']; T.next = 'settle'; go('climb', c); }
      }
      if (el > 20 || c.crashed) { O.takeoff = O.takeoff || 'failed'; phase = 'end'; }
    } else if (phase === 'climb') {
      const vy = c.vel ? c.vel.y : 0;
      s = [wings(c, 0), cl(0.05 * (6 - vy), -0.4, 0.4), 0, 1];
      if (h > hold) go(T.next || 'settle', c);
      if (el > 60) { O.climbStuck = { h: +h.toFixed(1), speed: +c.speed.toFixed(1) }; phase = 'end'; }
    } else if (phase === 'settle') {
      s = [wings(c, 0), level(c, false, dt, h), 0, T.queue[0] === 'loop' || T.queue[0] === 'up' ? 1 : 0.75];
      if (el > 4 && Math.abs(bank) < 3) {
        if (h < 150) { T.next = 'settle'; hold = 180; go('climb', c); }
        else { const nx = T.queue.shift(); go(nx || 'end', c); }
      }
    } else if (phase === 'loop') {
      s = [0, ${th.w9_loop.stick}, 0, 1];
      if (acc.h0 === undefined) { acc.h0 = h; acc.top = h; acc.v = c.speed; acc.turn = 0; }
      acc.turn += (c.rates ? -c.rates.q : 0) * dt * D;
      if (h > acc.top) { acc.top = h; acc.v = c.speed; }
      if (acc.turn >= 360 || el > 15) {
        O.loop = { height: +(acc.top - acc.h0).toFixed(1), topSpeed: +acc.v.toFixed(1), turned: +acc.turn.toFixed(0), t: +el.toFixed(2) };
        hold = Math.max(180, h); go('settle', c);
      }
    } else if (phase === 'turn') {
      /* A level turn about, 45 deg of bank, so no run is long enough to
       * leave the valley. */
      if (acc.y0 === undefined) acc.y0 = yaw;
      s = [wings(c, 45), level(c, false, dt, h) + 0.1, 0, 0.75];
      if (Math.abs(wrap(yaw - acc.y0)) > 170) { go('settle', c); }
      if (el > 30) go('settle', c);
    } else if (phase === 'up') {
      if (acc.held === undefined) { acc.held = true; hold = c.worldY; }
      s = [wings(c, 0), level(c, false, dt, c.worldY), 0, 1];
      if (el > 6) { acc.n = (acc.n || 0) + 1; acc.v = (acc.v || 0) + c.speed; acc.st = (acc.st || 0) + s[1]; }
      if (el > 10) { O.upright = { speed: +(acc.v / acc.n).toFixed(2), stick: +(acc.st / acc.n).toFixed(3) }; go(T.queue.shift(), c); }
    } else if (phase === 'toInv') {
      s = [1, 0, 0, 1];
      if (Math.abs(wrap(bank)) > 165) go('inv', c);
    } else if (phase === 'inv') {
      if (acc.held === undefined) { acc.held = true; hold = c.worldY; }
      s = [wings(c, 180), level(c, true, dt, c.worldY), 0, 1];
      if (el > 7) { acc.n = (acc.n || 0) + 1; acc.v = (acc.v || 0) + c.speed; acc.st = (acc.st || 0) + s[1]; acc.vy = (acc.vy || 0) + (c.vel ? c.vel.y : 0); }
      if (el > 11) { O.inverted = { speed: +(acc.v / acc.n).toFixed(2), stick: +(acc.st / acc.n).toFixed(3), climb: +(acc.vy / acc.n).toFixed(2) }; go('toUp', c); }
    } else if (phase === 'toUp') {
      s = [1, 0, 0, 0.75];
      if (Math.abs(wrap(bank)) < 15) { hold = 180; go('settle', c); }
    } else if (phase === 'stall') {
      /* W10's entry: slowed to 14 m/s at 0.4 throttle, wings level. */
      if (acc.t0 === undefined) {
        s = [wings(c, 0), level(c, false, dt, h), 0, 0.4];
        if (c.speed < 14.2 && Math.abs(bank) < 2) acc.t0 = el;
        if (el > 30) acc.t0 = el;
        T.phase = 'slow';
        window.__stick(...s);
        requestAnimationFrame(tick);
        return;
      }
      const es = el - acc.t0;
      s = [0, Math.min(1, es / 4), 0, 0];
      if (es > 3) acc.bank = Math.max(acc.bank || 0, Math.abs(wrap(bank)));
      if (Math.floor(es) !== acc.sec) { acc.sec = Math.floor(es); (O.stallTrace = O.stallTrace || []).push([+c.speed.toFixed(1), +bank.toFixed(1), +(yr * D).toFixed(0), +h.toFixed(0)]); }
      if (es > 6) { acc.n = (acc.n || 0) + 1; acc.yr = (acc.yr || 0) + Math.abs(yr) * D; }
      if (es > 10) { O.stall = { maxBank: +acc.bank.toFixed(1), yawRate: +(acc.yr / acc.n).toFixed(1) }; hold = 180; go('settle', c); }
    } else if (phase === 'spinR' || phase === 'spinL') {
      const sg = phase === 'spinR' ? 1 : -1;
      const held = ${th.w11_spin.holdS};
      if (el < held) {
        s = [0, 1, sg, 0];
        acc.yawed = (acc.yawed || 0) + yr * dt * D;
      } else {
        s = [0, 0, 0, 0];
        const rate = Math.hypot(p, yr) * D;
        if (acc.stop === undefined) {
          acc.after = (acc.after || 0) + rate * dt;
          if (rate < 30) acc.stop = el - held;
        }
      }
      if (el > held + 3) {
        O[phase] = { yawed: +acc.yawed.toFixed(0), stoppedAfter: acc.stop === undefined ? null : +acc.stop.toFixed(3), turnedAfter: +(acc.after || 0).toFixed(1) };
        hold = 180; go('settle', c);
      }
    }
    if (c.crashed && !O.crashedIn) O.crashedIn = phase;
    T.phase = phase;
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
  while (Date.now() - t0 < 1800000 && !(await page.evaluate('window.__T.done'))) {
    const ph = await page.evaluate('window.__T.phase');
    if (ph !== last) { console.log(`    ${ph}`); last = ph; }
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
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = 'wot4-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`wot4 owner test on ${MAP}: ${seated}`);

  console.log('hands off take off, recorded');
  const handsOut = await fly(page, true);
  console.log(`  ${JSON.stringify(handsOut)}`);
  console.log('the flight');
  const O = await fly(page, false);
  console.log(`  ${JSON.stringify(O)}`);

  const tk = O.takeoff;
  say(tk && tk !== 'failed' && tk.maxYaw <= th.w14_straight.maxHeadingDeg,
    `take off on the rudder: heading within ${tk && tk.maxYaw} deg to 3 m, off at ${O.lift ? O.lift.speed : '?'} m/s (within ${th.w14_straight.maxHeadingDeg})`);
  const lp = O.loop;
  say(lp && lp.turned >= 360 && lp.height >= th.w9_loop.diaMin && lp.topSpeed >= th.w9_loop.topOverVs * th.w2_stall.derived,
    `a loop on half stick at full throttle: ${lp && lp.height} m high, ${lp && lp.topSpeed} m/s over the top (${th.w9_loop.diaMin} m, ${(th.w9_loop.topOverVs * th.w2_stall.derived).toFixed(1)} m/s)`);
  const up = O.upright;
  const inv = O.inverted;
  const push = up && inv ? up.stick - inv.stick : null;
  say(up && inv && push >= th.w8_inverted.min && push <= th.w8_inverted.max && Math.abs(inv.climb) < 0.5,
    `on its back at full throttle: a push of ${push === null ? '?' : push.toFixed(3)} over upright (${inv && inv.stick} against ${up && up.stick}), climb ${inv && inv.climb} m/s (${th.w8_inverted.min} to ${th.w8_inverted.max})`);
  const st = O.stall;
  say(st && st.maxBank <= th.w10_stall.maxBankDeg && st.yawRate < th.w10_stall.maxYawDegS,
    `the stall held full back: bank at most ${st && st.maxBank} deg, yaw ${st && st.yawRate} deg/s (under ${th.w10_stall.maxBankDeg}, ${th.w10_stall.maxYawDegS})`);
  for (const [k, sg] of [['spinR', 1], ['spinL', -1]]) {
    const r = O[k];
    say(r && sg * r.yawed >= th.w11_spin.minYawDeg && r.stoppedAfter !== null && r.stoppedAfter <= th.w11_spin.recoverS && r.turnedAfter <= th.w11_spin.recoverDeg,
      `${k}: ${r && r.yawed} deg the rudder's way in ${th.w11_spin.holdS} s; hands off, stopped ${r && r.stoppedAfter} s after, ${r && r.turnedAfter} deg on (${th.w11_spin.minYawDeg} deg, ${th.w11_spin.recoverS} s, ${th.w11_spin.recoverDeg} deg)`);
  }
  say(!O.crashedIn, `not crashed${O.crashedIn ? `: in ${O.crashedIn}` : ''}`);
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
