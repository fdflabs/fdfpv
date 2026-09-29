/*
 * edge-owner.js: the owner's Edge 540 flight test, flown headless in the
 * real shell and timed on the plant's clock, scripts/p51-owner.js's
 * pattern. On swiss2 (the Free Flight card's home, or the map named) with
 * the edge-manual tune, one flight:
 *
 *   takeoff   full throttle opened over a second, the tail up on the
 *             elevator, the wings on the ailerons and the heading on the
 *             rudder: within edge:gates E14's 5 deg until it is 3 m up.
 *             Then the same with the pilot's hands off, recorded, not
 *             banded: the heading at liftoff, and the torque roll that
 *             follows (docs/EDGE-STAGE1.md, "The owner's test").
 *   inverted  at 120 m, level at three quarter throttle upright, then
 *             rolled on its back and held level: E8a's speed within 5
 *             percent of upright, and E8b's push, down elevator under
 *             half stick.
 *   yank      full up at once from level, 1.2 s, ailerons and rudder
 *             centred: E9a's departure, a quarter turn of roll or more,
 *             and let go it stops within 0.3 s.
 *   half      half up stick, the same: E9c, under 20 deg of roll.
 *   snap R, L full up and full rudder, 2 s: E9d, still turning the
 *             rudder's way at half its peak rate at the end, 270 deg at
 *             least; then AOPA's recovery, the stick released and the
 *             rudder the other way: the roll stops within 0.5 s and within
 *             a quarter turn (e9_snap.recoverDeg), and a wings level hold
 *             brings it within 10 deg of level in 3 s.
 *
 * The roll turned is the plant's body roll rate (__craftState().rates.p)
 * integrated on __craftState().simS. Needs no board. SIM_GPU=1 renders on
 * this machine's GPU, which makes it several times quicker.
 *
 *   node scripts/edge-owner.js [map]   (npm run edge:owner)
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
const th = JSON.parse(await readFile(join(root, 'tests/edge-thresholds.json'), 'utf8'));
const AF = 'edge1524';
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
  const go = (p, c) => { phase = p; tP = c.simS; acc = {}; turned = 0; };
  /* Level on the elevator, upright or on its back: a pitch over the horizon
   * that holds the height, edgeLevel's loop (tests/lib/wingpilot.js). */
  const level = (c, inv, dt, h) => {
    const pitch = Math.asin(cl(c.fwd.y, -1, 1));
    const vy = c.vel ? c.vel.y : 0;
    const qAero = c.rates ? -c.rates.q : 0;
    trim = cl(trim - 0.025 * vy * dt + 0.0005 * (hold - h) * dt, -0.2, 0.2);
    const pitchT = cl(trim - 0.05 * vy + 0.01 * (hold - h), -0.2, 0.2);
    return cl((inv ? -1 : 1) * 2.5 * (pitchT - pitch) - 0.25 * qAero, -1, 1);
  };
  const wings = (c, b) => cl(-0.8 * wrap(bankOf(c) - b) / D - 0.05 * (c.rates ? c.rates.p : 0), -1, 1);
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-4, now - prev); prev = now;
    const el = now - tP, h = c.groundClearance - rest, p = c.rates ? c.rates.p : 0;
    turned += p * dt * D;
    const yaw = yawOf(c.fwd), bank = bankOf(c);
    let s = [0, 0, 0, 1];
    if (phase === 'roll') {
      if (${hands}) {
        s = [0, 0.15, 0, 1];
      } else {
        const pitch = Math.asin(cl(c.fwd.y, -1, 1)) * D;
        const qAero = c.rates ? -c.rates.q : 0;
        const yr = c.rates ? -c.rates.r * D : 0;
        const want = c.speed < ${th.e13_takeoff.vRotate} ? 3 : 10;
        /* The throttle opened over a second from the shell's take off
         * throttle, 0.25, under which it stays parked and the plant's clock
         * stands still. */
        s = [wings(c, 0), cl(2.5 * (want - pitch) / D - 0.25 * qAero, -1, 1), cl(-2.0 * yaw / D - 0.3 * yr / D, -1, 1), cl(0.3 + 0.7 * el, 0, 1)];
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
      if (el > 60) phase = 'end';
    } else if (phase === 'cruise') {
      s = [wings(c, 0), level(c, false, dt, h), 0, 0.75];
      if (el > 6) { acc.n = (acc.n || 0) + 1; acc.v = (acc.v || 0) + c.speed; acc.st = (acc.st || 0) + s[1]; }
      if (el > 10) { O.upright = { speed: +(acc.v / acc.n).toFixed(2), stick: +(acc.st / acc.n).toFixed(3) }; go('toInv', c); }
    } else if (phase === 'toInv') {
      s = [1, 0, 0, 0.75];
      if (Math.abs(wrap(bank)) > 165) go('inv', c);
    } else if (phase === 'inv') {
      s = [wings(c, 180), level(c, true, dt, h), 0, 0.75];
      if (el > 6) { acc.n = (acc.n || 0) + 1; acc.v = (acc.v || 0) + c.speed; acc.st = (acc.st || 0) + s[1]; acc.vy = (acc.vy || 0) + (c.vel ? c.vel.y : 0); }
      if (el > 12) { O.inverted = { speed: +(acc.v / acc.n).toFixed(2), stick: +(acc.st / acc.n).toFixed(3), climb: +(acc.vy / acc.n).toFixed(2) }; go('toUp', c); }
    } else if (phase === 'toUp') {
      s = [1, 0, 0, 0.75];
      if (Math.abs(wrap(bank)) < 15) { T.queue = ['yank', 'half', 'snapR', 'snapL']; go('settle', c); }
    } else if (phase === 'settle') {
      s = [wings(c, 0), level(c, false, dt, h), 0, 0.75];
      if (el > 4 && Math.abs(bank) < 3) {
        if (h < 80) { T.next = 'settle'; hold = 120; go('climb', c); }
        else { const nx = T.queue.shift(); go(nx || 'end', c); }
      }
    } else if (phase === 'yank' || phase === 'half') {
      const held = ${th.e9_snap.holdS};
      const full = phase === 'yank';
      if (el < held) {
        s = [0, full ? 1 : ${th.e9_snap.calmStick}, 0, 0.75];
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
      const held = ${th.e9_snap.snapHoldS};
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
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = 'edge-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`edge owner test on ${MAP}: ${seated}`);

  console.log('hands off take off, recorded');
  const handsOut = await fly(page, true);
  console.log(`  ${JSON.stringify(handsOut)}`);
  console.log('the flight');
  const O = await fly(page, false);
  console.log(`  ${JSON.stringify(O)}`);

  const e8 = th.e8_inverted;
  const e9 = th.e9_snap;
  const tk = O.takeoff;
  say(tk && tk !== 'failed' && tk.maxYaw <= th.e14_straight.maxHeadingDeg,
    `take off on the rudder: heading within ${tk && tk.maxYaw} deg to 3 m, off at ${O.lift ? O.lift.speed : '?'} m/s (within ${th.e14_straight.maxHeadingDeg})`);
  const up = O.upright;
  const inv = O.inverted;
  say(up && inv && Math.abs(inv.speed - up.speed) / up.speed * 100 <= e8.levelPct && Math.abs(inv.climb) < 0.5,
    `on its back at 3/4 throttle: ${inv && inv.speed} m/s against ${up && up.speed} upright, climb ${inv && inv.climb} m/s (within ${e8.levelPct} percent)`);
  say(inv && inv.stick < 0 && -inv.stick <= e8.maxPush, `and held level with a push: stick ${inv && inv.stick} (upright ${up && up.stick}; under ${e8.maxPush})`);
  const y = O.yank;
  say(y && Math.abs(y.rolled) >= e9.departDeg && y.stoppedAfter !== null && y.stoppedAfter <= e9.stopS,
    `a yank departs: ${y && y.rolled} deg in ${e9.holdS} s, stopped ${y && y.stoppedAfter} s after letting go (${e9.departDeg} deg, ${e9.stopS} s)`);
  const hf = O.half;
  say(hf && Math.abs(hf.rolled) < e9.calmRollDeg, `half stick does not: ${hf && hf.rolled} deg (under ${e9.calmRollDeg})`);
  for (const [k, sg] of [['snapR', 1], ['snapL', -1]]) {
    const r = O[k];
    say(r && sg * r.rolled >= e9.snapDeg && r.last >= e9.keepShare * r.peak,
      `${k}: ${r && r.rolled} deg the rudder's way in ${e9.snapHoldS} s, ${r && r.last} deg/s over its last half second of a ${r && r.peak} peak (${e9.snapDeg} deg, ${e9.keepShare} of the peak)`);
    say(r && r.stoppedAfter !== null && r.stoppedAfter <= e9.recoverS && Math.abs(r.rolledAfter) <= e9.recoverDeg && r.levelAfter !== null && r.levelAfter <= e9.levelS,
      `${k} recovery: stopped ${r && r.stoppedAfter} s after the rudder reversed, ${r && r.rolledAfter} deg on; wings level in ${r && r.levelAfter} s (${e9.recoverS} s, ${e9.recoverDeg} deg, level within ${e9.levelS} s)`);
  }
  say(!O.crashedIn, `not crashed${O.crashedIn ? `: in ${O.crashedIn}` : ''}`);
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
