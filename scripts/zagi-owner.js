/*
 * zagi-owner.js: the owner's Zagi flight test, flown headless in the real
 * shell and timed on the plant's clock, scripts/edge-owner.js's pattern.
 * On swiss2 (the Free Flight card's home, or the map named) with the
 * zagi-manual tune, one flight:
 *
 *   throw     L, the shell's own hand throw, the motor off for a second as
 *             Zagi's manual says, then full throttle: it never touches the
 *             ground again and is 5 m up within 5 s (zagi:gates Z11).
 *   climb     full throttle to 80 m over where it was thrown.
 *   roll      level at 60 percent, then full right stick until it has
 *             gone once round: the helix angle that time gives, less the
 *             roll's lag, inside Z6's band.
 *   stall     the throttle closed, level for 3 s, then full up held 7 s
 *             with the roll stick left alone: the wings within Z9's 5 deg,
 *             the nose through the horizon within 3 s, and a mush sinking
 *             2 to 6 m/s over the last 3 s.
 *   spin      back up to 80 m, a 30 deg bank held, the throttle closed
 *             and the elevons pulled to full up over 3 s with full roll
 *             held into the turn: once round within 4 s (Z10).
 *   landing   home at 30 m under power, over the trees, and within 50 m
 *             of the grass it was thrown from the throttle closed, spiralled
 *             down to 10 m, then a shallow glide, wings level for
 *             the last 3 m, flared at 0.6 m: it slides to rest on its belly, the CG
 *             the hull's 12 mm over the ground, uncrashed.
 *
 * The roll turned is the plant's body roll rate (__craftState().rates.p)
 * integrated on __craftState().simS. Needs no board. SIM_GPU=1 renders on
 * this machine's GPU, which makes it several times quicker.
 *
 *   node scripts/zagi-owner.js [map]   (npm run zagi:owner)
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
const th = JSON.parse(await readFile(join(root, 'tests/zagi-thresholds.json'), 'utf8'));
const AF = 'zagi1219';
const MAP = process.argv[2] ?? 'swiss2';
const SPAN = 1.2192;

/*
 * The pilot, in the page, once a frame, on the plant's clock. Angles in
 * degrees: bank + right wing down. A phase machine whose results land in
 * window.__T.out.
 */
const PILOT = `
window.__T = { out: {}, done: false, phase: '' };
(() => {
  const T = window.__T, O = T.out;
  const D = 180 / Math.PI;
  const c0 = window.__craftState();
  const rest = c0.groundClearance;
  const n0 = Math.hypot(c0.fwd.x, c0.fwd.z), fx0 = c0.fwd.x / n0, fz0 = c0.fwd.z / n0, rx0 = -fz0, rz0 = fx0;
  const bankOf = (c) => { const ry = c.fwd.z * c.up.x - c.fwd.x * c.up.z; return Math.atan2(-ry, c.up.y) * D; };
  const pitchOf = (c) => Math.asin(Math.max(-1, Math.min(1, c.fwd.y))) * D;
  const wrap = (a) => ((a % 360) + 540) % 360 - 180;
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  let phase = 'throw', tP = null, prev = null, turned = 0, acc = {}, thrown = false, hold = 80, base = null;
  const go = (p, c) => { phase = p; tP = c.simS; acc = {}; turned = 0; };
  /* The Zagi's hand, tests/lib/wingpilot.js zagiHold: gentle in pitch. */
  const wings = (c, b) => cl(-1.0 * wrap(bankOf(c) - b) / D - 0.08 * (c.rates ? c.rates.p : 0), -1, 1);
  const nose = (c, want) => cl(1.2 * (want - pitchOf(c)) / D - 0.10 * (c.rates ? -c.rates.q : 0), -1, 1);
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    if (!thrown) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL', key: 'l' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyL', key: 'l' }));
      thrown = true; tP = c.simS; prev = c.simS; base = c.groundClearance;
      requestAnimationFrame(tick);
      return;
    }
    const now = c.simS, dt = Math.max(1e-4, now - prev); prev = now;
    const el = now - tP, h = c.groundClearance - rest, p = c.rates ? c.rates.p : 0;
    turned += p * dt * D;
    const bank = bankOf(c), pitch = pitchOf(c), vy = c.vel ? c.vel.y : 0;
    let s = [0, 0, 0, 0];
    if (phase === 'throw') {
      const motor = el >= 1;
      s = [wings(c, 0), nose(c, motor ? 20 : 2), 0, motor ? 1 : 0];
      acc.low = Math.min(acc.low === undefined ? 99 : acc.low, h);
      if (el > 0.3 && h < 0.02) acc.touched = true;
      if (el >= 5) { O.throw = { low: +acc.low.toFixed(2), at5: +h.toFixed(1), touched: !!acc.touched }; go('climb', c); }
    } else if (phase === 'climb') {
      s = [wings(c, 0), nose(c, 25), 0, 1];
      if (h > hold) go(T.next || 'cruise', c);
      if (el > 60) { O.stuck = 'climb'; phase = 'end'; }
    } else if (phase === 'cruise') {
      s = [wings(c, 0), cl(0.02 * (0 - vy) + nose(c, 2) * 0.5, -1, 1), 0, 0.6];
      if (el > 5 && Math.abs(bank) < 3) { acc.v = c.speed; go('roll', c); acc.v = c.speed; }
    } else if (phase === 'roll') {
      s = [1, 0, 0, 0.6];
      if (turned >= 360) { O.roll = { t: +el.toFixed(3), v: +acc.v.toFixed(2) }; T.next = 'glide'; go('climb', c); }
      if (el > 4) { O.roll = { t: null, v: acc.v, turned: +turned.toFixed(0) }; T.next = 'glide'; go('climb', c); }
    } else if (phase === 'glide') {
      s = [wings(c, 0), nose(c, 0), 0, 0];
      if (el > 3) go('stall', c);
    } else if (phase === 'stall') {
      if (acc.p0 === undefined) acc.p0 = pitch;
      s = [0, 1, 0, 0];
      acc.bank = Math.max(acc.bank || 0, Math.abs(bank));
      acc.maxPitch = Math.max(acc.maxPitch || 0, Math.abs(pitch));
      if (pitch > acc.p0 + 5) acc.rose = true;
      if (acc.rose && acc.broke === undefined && pitch < 0) acc.broke = el;
      if (el > 4) { acc.n = (acc.n || 0) + 1; acc.sink = (acc.sink || 0) - vy; }
      if (el > 7) {
        O.stall = { bank: +acc.bank.toFixed(1), broke: acc.broke === undefined ? null : +acc.broke.toFixed(2), sink: +(acc.sink / acc.n).toFixed(2), maxPitch: +acc.maxPitch.toFixed(0) };
        T.next = 'bank'; go('climb', c);
      }
    } else if (phase === 'bank') {
      s = [wings(c, ${th.z10_turn_stall.bankDeg}), cl(0.02 * (0 - vy), -1, 1), 0, 0.3];
      if (el > 4 && Math.abs(bank - ${th.z10_turn_stall.bankDeg}) < 5) go('spin', c);
      if (el > 20) go('spin', c);
    } else if (phase === 'spin') {
      s = [1, Math.min(1, el / ${th.z10_turn_stall.pullS}), 0, 0];
      acc.most = Math.max(acc.most || 0, Math.abs(turned));
      if (el > ${th.z10_turn_stall.withinS}) { O.spin = { turned: +acc.most.toFixed(0) }; hold = 30; T.next = 'approach'; go('recover', c); }
    } else if (phase === 'recover') {
      s = [wings(c, 0), nose(c, 5), 0, 1];
      if (el > 3 && Math.abs(bank) < 5) go('climb', c);
    } else if (phase === 'approach') {
      /* Home to the grass it was thrown from, where nothing stands: a bank
       * toward the throw point, wings level for the last 3 m. */
      const hx = c0.worldX - c.worldX, hz = c0.worldZ - c.worldZ;
      const err = wrap((Math.atan2(hx * rx0 + hz * rz0, hx * fx0 + hz * fz0) - Math.atan2(c.fwd.x * rx0 + c.fwd.z * rz0, c.fwd.x * fx0 + c.fwd.z * fz0)) * D);
      const want = h > 3 && Math.hypot(hx, hz) > 15 ? cl(0.6 * err, -25, 25) : 0;
      const flare = h < 0.6;
      /* Home at 30 m under power, over the valley's trees (their crowns
       * stop a wing that meets them), and only within 50 m of the throw
       * point the throttle closed: down to 10 m in a steeper spiral over
       * the grass, then the shallow glide. */
      if (Math.hypot(hx, hz) < 50) acc.near = true;
      s = acc.near ? [wings(c, want), nose(c, flare ? 6 : h > 10 ? -12 : -3), 0, 0]
        : [wings(c, want), cl(0.02 * (0 - vy) + nose(c, 2) * 0.5, -1, 1), 0, 0.6];
      if (h < 0.05) acc.down = true;
      if (!acc.tr || now - acc.tr > 2) { acc.tr = now; (T.trace = T.trace || []).push([el, h, Math.hypot(hx, hz), c.speed, bank, pitch, c.worldX, c.worldZ].map((v) => +v.toFixed(1)).join(' ')); }
      if (acc.down) {
        s = [0, 0, 0, 0];
        if (c.speed < 0.05) { acc.rest = (acc.rest || 0) + dt; }
        if ((acc.rest || 0) > 1) { O.landing = { bank: +bank.toFixed(1), pitch: +pitch.toFixed(1), clearance: +c.groundClearance.toFixed(4) }; phase = 'end'; }
      }
      if (el > 150) { O.stuck = 'approach'; O.at = { h: +h.toFixed(3), speed: +c.speed.toFixed(2), down: !!acc.down, home: +Math.hypot(hx, hz).toFixed(1), x: +c.worldX.toFixed(1), z: +c.worldZ.toFixed(1), y: +c.worldY.toFixed(1) }; phase = 'end'; }
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

const WALL_S = 1500;
const page = await openPage({ root, width: 960, height: 540, url: '/index.html' });
try {
  await page.until('!!window.__shellReady', 240000);
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  if (MAP !== 'swiss2') {
    await page.evaluate(`window.__ui.seatMap('${MAP}'); true`);
    await page.until(`window.__ui.settings.map === '${MAP}' && window.__map && window.__map().ready`, 400000);
  }
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = 'zagi-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`zagi owner test on ${MAP}: ${seated}`);
  await page.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
  await page.sleep(2000);
  await page.evaluate(PILOT);
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < WALL_S * 1000 && !(await page.evaluate('window.__T.done'))) {
    const ph = await page.evaluate('window.__T.phase');
    if (ph !== last) {
      const simS = await page.evaluate('window.__craftState().simS');
      console.log(`    ${ph.padEnd(9)} sim ${simS.toFixed(1)} s, wall ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      last = ph;
    }
    await page.sleep(1000);
  }
  const O = await page.evaluate('window.__T.out');
  /* The flight runs on the sim clock, which a loaded machine slows; a run
   * the wall clock cut short says so rather than failing a phase it never
   * reached. */
  if (!(await page.evaluate('window.__T.done'))) {
    O.stuck = `the wall clock's ${WALL_S} s, in ${last} at sim ${(await page.evaluate('window.__craftState().simS')).toFixed(1)} s`;
  }
  if (O.stuck === 'approach' || !O.landing) {
    console.log('  the approach, every 2 s: s in it, m up, m from home, m/s, bank, pitch, world x, z');
    console.log((await page.evaluate('window.__T.trace || []')).map((l) => `    ${l}`).join('\n'));
  }
  console.log(`  ${JSON.stringify(O)}`);

  const t = O.throw;
  say(t && !t.touched && t.at5 > th.z11_throw.minHeight, `the throw, motor off a second: lowest ${t && t.low} m, ${t && t.at5} m up after 5 s${t && t.touched ? ', TOUCHED' : ''} (above ${th.z11_throw.minHeight} m)`);
  const r = O.roll;
  const pb2v = r && r.t ? (2 * Math.PI / (r.t - th.z6_roll.tau)) * SPAN / (2 * r.v) : 0;
  say(r && r.t && pb2v >= th.z6_roll.min && pb2v <= th.z6_roll.max, `full right stick goes round in ${r && r.t} s from ${r && r.v} m/s: helix ${pb2v.toFixed(4)} (${th.z6_roll.min} to ${th.z6_roll.max})`);
  const st = O.stall;
  const z9 = th.z9_stall;
  say(st && st.bank <= z9.maxBankDeg && st.broke !== null && st.broke <= z9.breakWithinS && st.sink >= z9.sinkMin && st.sink <= z9.sinkMax && st.maxPitch < z9.maxPitchDeg,
    `full up held, wings left alone: bank within ${st && st.bank} deg, the nose through the horizon at ${st && st.broke} s, mushing at ${st && st.sink} m/s (${z9.maxBankDeg} deg, ${z9.breakWithinS} s, ${z9.sinkMin} to ${z9.sinkMax})`);
  const sp = O.spin;
  say(sp && sp.turned >= th.z10_turn_stall.spinDeg, `stalled in a turn with full roll held: ${sp && sp.turned} deg round in ${th.z10_turn_stall.withinS} s (${th.z10_turn_stall.spinDeg})`);
  const l = O.landing;
  /* At rest on the valley's slope its world attitude is the slope's, so
   * what is held is that it lies on its belly: the CG the hull's 12 mm
   * over the ground under it (Z12). */
  const z12 = th.z12_belly;
  say(l && Math.abs(l.clearance - z12.restZ) <= z12.restTol, `the belly landing: at rest ${l && l.clearance} m over the ground, lying on the slope at bank ${l && l.bank}, pitch ${l && l.pitch} deg (${z12.restZ} +- ${z12.restTol} m)`);
  say(!O.crashedIn && !O.stuck, `not crashed${O.crashedIn ? `: in ${O.crashedIn}` : ''}${O.stuck ? `, stuck in ${O.stuck}` : ''}`);
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
