/*
 * dlg-owner.js: the owner's NRJ flight test, flown headless in the real
 * shell, the plant gates' discus launch and thermal made a check on the
 * page. On swiss2 (the Free Flight card's home), each from lying on the
 * grass at the spawn:
 *
 *   launch   on nrj-acro, the default: the throttle stick up throws it (the
 *            pad's binding for L), the sticks centred through the turn and
 *            the zoom. The HUD's cue says the spin, the release and the top,
 *            and the height it names is the height it reached, inside
 *            tests/dlg-thresholds.json d5_launch. Then pushed over into a
 *            glide, the wings and the nose level: its glide ratio over the
 *            last 8 s of 20 inside d1_glide; then
 *            steered to thermal A and circled in it at 35 deg for 40 s: the
 *            mean climb over the last 20 inside d9_thermal.
 *   catch    on nrj-stab: the same throw, then down in a spiral round the
 *            launch point, out to 45 m and back round onto a straight final
 *            to it, slow and at hand height: the HUD says it is caught and
 *            the craft is held there, landed.
 *
 * The pilots close once a frame on __craftState() rather than once a plant
 * step, so their gains are per second, and are timed on the plant's own
 * clock (__craftState().simS), since headless the page's runs at its own
 * rate. Positions are the plant's (__craftState().plantPos), whose frame
 * the thermals are placed in. Needs no board. SIM_GPU=1 renders on this
 * machine's GPU, which makes it several times quicker.
 *
 *   node scripts/dlg-owner.js [modes] [map]   (npm run dlg:owner)
 *
 * DLG_OWNER_LOG=1 prints the pilot's samples, one each half second of the
 * plant's time: phase, time in it, height, climb, speed, pitch, bank, the
 * rising air and the four sticks.
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
const th = JSON.parse(await readFile(join(root, 'tests/dlg-thresholds.json'), 'utf8'));
const AF = 'nrj1490';
const MODES = (process.argv[2] ?? 'launch,catch').split(',');
const MAP = process.argv[3] ?? 'swiss2';
const TUNE = { launch: 'nrj-acro', catch: 'nrj-stab' };

/*
 * The pilot, in the page, once a frame. Three.js space for the attitude
 * (y up); the plant's frame for where it is (z up). Nose up stick lifts
 * the nose in every mode: in Acro it asks for a pitch rate, in Stabilised
 * for a pitch, so the laws below close on the attitude either way.
 */
const PILOT = (mode) => `
window.__T = { log: [], notices: [], done: false };
(() => {
  const T = window.__T;
  const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
  const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const pitchOf = (c) => Math.asin(clamp(c.fwd.y));
  const bankOf = (c) => { const left = cross(c.up, c.fwd); return Math.atan2(left.y, c.up.y); };
  const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
  const c0 = window.__craftState();
  const ground = c0.plantPos.z - c0.groundClearance;
  const home = { x: c0.plantPos.x, y: c0.plantPos.y };
  let phase = 'throw', tPhase = c0.simS, prevS = c0.simS, prevP = c0.plantPos, track = 0, trim = 0;
  let sum = {};
  const acc = (k, v) => { sum[k] = (sum[k] || 0) + v; };
  const enter = (p, now) => { phase = p; tPhase = now; sum = {}; trim = 0; };
  const stab = c0.wingStab === 1;
  /* The attitude onto a bank and a pitch. */
  const fly = (c, bankT, pitchT) => {
    /* Stabilised asks for up to 50 deg of bank and 30 of pitch at full
     * stick; Acro for rates, closed here on the attitude. */
    const roll = stab ? clamp(bankT / 0.8727) : clamp(1.5 * (bankT - bankOf(c)) - 0.1 * c.rates.p);
    const pitch = stab ? clamp(pitchT / 0.5236) : clamp(2.0 * (pitchT - pitchOf(c)) + 0.15 * c.rates.q);
    return [roll, pitch];
  };
  /* The airspeed on the pitch, a glider's hold, with a slow trim. */
  const speedPitch = (c, vT, dt) => {
    trim = clamp(trim + 0.02 * (c.speed - vT) * dt, -0.15, 0.15);
    return clamp(0.04 * (c.speed - vT) + trim, -0.35, 0.15);
  };
  const steer = (tx, ty, most = 0.5) => clamp(-1.2 * wrap(Math.atan2(ty - prevP.y, tx - prevP.x) - track), -most, most);
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd || !c.vel || !c.rates || !c.plantPos) { requestAnimationFrame(tick); return; }
    const now = c.simS, dt = Math.max(1e-3, now - prevS);
    const p = c.plantPos;
    if (Math.hypot(p.x - prevP.x, p.y - prevP.y) > 0.05) track = Math.atan2(p.y - prevP.y, p.x - prevP.x);
    prevS = now;
    prevP = p;
    const t = now - tPhase;
    const h = p.z - ground;
    if (c.notice && T.notices[T.notices.length - 1] !== c.notice) T.notices.push(c.notice);
    let s = [0, 0, 0, 0];
    if (phase === 'throw') {
      s = [0, 0, 0, c.landed ? 1 : 0];
      if (c.discusPhase === 1) T.spun = true;
      if (c.discusPhase === 2) { T.released = { speed: +c.speed.toFixed(2) }; enter('zoom', now); }
      if (t > 20) phase = 'end';
    } else if (phase === 'zoom') {
      T.top = Math.max(T.top ?? 0, h);
      if (c.discusPhase === 0) { T.topAt = +h.toFixed(1); enter('over', now); }
      if (t > 15) phase = 'end';
    } else if (phase === 'over') {
      T.top = Math.max(T.top ?? 0, h);
      s = [...fly(c, 0, -0.35), 0, 0];
      if (t > 1.5 && pitchOf(c) < -0.2) enter('${mode}' === 'catch' ? 'spiral' : 'glide', now);
      if (t > 10) phase = 'end';
    } else if (phase === 'glide') {
      /* Level on the attitude, which a glider trims its own speed at:
       * the best glide flies half a degree nose up (stab-glide-derive.js),
       * and a speed loop closed once a frame only hunts round it. */
      s = [...fly(c, 0, 0), 0, 0];
      if (t > 12) { acc('vz', c.vel.y); acc('v', c.speed); acc('n', 1); }
      if (t > 20) { T.glide = { v: sum.v / sum.n, sink: -sum.vz / sum.n }; enter('seek', now); }
    } else if (phase === 'seek') {
      s = [...fly(c, steer(${th.d9_thermal.core[0]}, ${th.d9_thermal.core[1]}), speedPitch(c, 6.5, dt)), 0, 0];
      if (Math.hypot(p.x - ${th.d9_thermal.core[0]}, p.y - ${th.d9_thermal.core[1]}) < 10) enter('circle', now);
      if (t > 60) phase = 'end';
    } else if (phase === 'circle') {
      s = [...fly(c, ${th.d9_thermal.bankDeg} * Math.PI / 180, speedPitch(c, ${th.d9_thermal.speed}, dt)), 0, 0];
      if (t > 20) { acc('vz', c.vel.y); acc('lift', c.airLift); acc('n', 1); }
      if (t > 40) { T.circle = { climb: sum.vz / sum.n, lift: sum.lift / sum.n }; phase = 'end'; }
    } else if (phase === 'spiral') {
      /* Down round the launch point, clockwise 25 m out, the nose low:
       * the track a right angle round from the bearing to the pilot,
       * turned in toward them as far as it is outside the circle. */
      const d = Math.hypot(p.x - home.x, p.y - home.y);
      const bearing = Math.atan2(home.y - p.y, home.x - p.x);
      const trackT = bearing + Math.PI / 2 - clamp(0.05 * (d - 25), -0.8, 0.8);
      s = [...fly(c, clamp(-1.2 * wrap(trackT - track), -0.6, 0.6), -0.25), 0, 0];
      if (h < 7 && t > 3) enter('out', now);
      if (t > 90) phase = 'end';
    } else if (phase === 'out') {
      /* Away from the pilot to 45 m, gliding, and back round to face them:
       * a straight final, as a pilot sets one up to catch. */
      const d = Math.hypot(p.x - home.x, p.y - home.y);
      const away = Math.atan2(p.y - home.y, p.x - home.x);
      s = [...fly(c, d < 45 ? clamp(-1.2 * wrap(away - track), -0.6, 0.6) : steer(home.x, home.y, 0.6), speedPitch(c, 6.5, dt)), 0, 0];
      if (d >= 45) T.outAt = true;
      if (T.outAt && Math.abs(wrap(Math.atan2(home.y - p.y, home.x - p.x) - track)) < 0.15) enter('final', now);
      if (t > 60) phase = 'end';
    } else if (phase === 'final') {
      /* Straight at the pilot, on the glide path to hand height. */
      const d = Math.hypot(p.x - home.x, p.y - home.y);
      const vzT = -(h - 1.4) * Math.max(3, c.speed) / Math.max(2, d);
      const pitchT = clamp(speedPitch(c, 6.5, dt) + 0.1 * (vzT - c.vel.y), -0.3, 0.15);
      s = [...fly(c, steer(home.x, home.y, 0.6), pitchT), 0, 0];
      T.closest = Math.min(T.closest ?? 1e9, d);
      if (c.landed) { T.caught = { h: +h.toFixed(2), d: +d.toFixed(2), speed: +c.speed.toFixed(2) }; phase = 'end'; }
      if (t > 40 || c.groundClearance < 0.1) phase = 'end';
    }
    if (c.crashed) phase = 'end';
    if (phase === 'end') {
      T.done = true;
      T.res = { spun: T.spun, released: T.released, top: T.top, topAt: T.topAt, glide: T.glide, circle: T.circle, caught: T.caught, closest: T.closest, crashed: c.crashed, at: T.at, notices: T.notices, landed: c.landed };
      window.__stick(0, 0, 0, 0);
      return;
    }
    T.at = phase;
    if (now - (T.lastLog ?? -1) > 0.5) { T.lastLog = now; T.log.push([phase, +t.toFixed(2), +h.toFixed(1), +c.vel.y.toFixed(2), +c.speed.toFixed(1), +(pitchOf(c) * 57.3).toFixed(0), +(bankOf(c) * 57.3).toFixed(0), +c.airLift.toFixed(2), ...s.map((x) => +x.toFixed(2))]); }
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
const within = (v, b) => v != null && v >= b.min && v <= b.max;

const page = await openPage({ root, width: 960, height: 540, url: '/index.html' });
try {
  await page.until('!!window.__shellReady', 240000);
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  if (MAP !== 'swiss2') {
    await page.evaluate(`window.__ui.seatMap('${MAP}'); true`);
    await page.until(`window.__ui.settings.map === '${MAP}' && window.__map && window.__map().ready`, 400000);
  }
  for (const mode of MODES) {
    const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); ui.settings.tune = '${TUNE[mode]}'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
    console.log(`dlg owner test on ${MAP}: ${seated}`);
    await page.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
    await page.sleep(2000);
    const st = await page.evaluate('({ tune: window.__craftState().tune, stab: window.__craftState().wingStab, landed: window.__craftState().landed })');
    await page.evaluate(PILOT(mode));
    const t0 = Date.now();
    while (Date.now() - t0 < 900000 && !(await page.evaluate('window.__T.done'))) {
      await page.sleep(1000);
    }
    const r = (await page.evaluate('window.__T')).res || {};
    console.log(`${mode}: ${st.tune}, mode ${st.stab}, parked ${st.landed}, ${JSON.stringify(r)}`);
    if (process.env.DLG_OWNER_LOG) for (const x of (await page.evaluate('window.__T.log'))) console.log('    ' + JSON.stringify(x));
    const topSaid = (r.notices || []).map((n) => /(\d+)\s*m/.exec(n)).find((m) => m && /launch|lanzamiento/i.test(m.input));
    /* Read on the first frame that shows the release, up to a frame of
     * the zoom's deceleration (about 14 m/s^2) after it: dlg-gates.js D6
     * holds the release itself to the table's speed exactly. */
    say(Boolean(r.spun && r.released) && Math.abs(r.released.speed - th.d6_release.speed) < 2,
      `the throttle stick throws it: the turn, then let go at ${r.released ? f(r.released.speed) : '-'} m/s on the first frame after (the table's ${th.d6_release.speed}, within 2)`);
    say(within(r.top, th.d5_launch) && Boolean(topSaid) && Math.abs(Number(topSaid[1]) - r.top) <= 1.5,
      `the zoom tops out ${f(r.top, 1)} m over the grass, the HUD says ${topSaid ? `"${topSaid.input}"` : 'nothing'} (${band(th.d5_launch)} m)`);
    if (mode === 'launch') {
      const g = r.glide;
      const ratio = g ? Math.sqrt(Math.max(0, g.v * g.v - g.sink * g.sink)) / g.sink : null;
      say(Boolean(g) && within(ratio, th.d1_glide), `glides at ${g ? f(g.v) : '-'} m/s sinking ${g ? f(g.sink, 3) : '-'}: ${f(ratio)} to 1 (${band(th.d1_glide)})`);
      const k = r.circle;
      say(Boolean(k) && !r.crashed && within(k.climb, th.d9_thermal), `circling in thermal A climbs ${k ? f(k.climb) : '-'} m/s in ${k ? f(k.lift) : '-'} m/s of rising air (${band(th.d9_thermal)})`);
    } else {
      const k = r.caught;
      say(Boolean(k) && r.landed && !r.crashed && (r.notices || []).some((n) => /Caught|Atrapado/.test(n)),
        k ? `caught ${f(k.d)} m from the launch point, ${f(k.h)} m up, the HUD saying so` : `not caught: closest ${f(r.closest)} m, stopped in ${r.at}`);
    }
    await page.evaluate("window.__stick(0,0,0,0); window.__ui.onAction('title', window.__ui.settings); true");
    await page.until("window.__craftState().mode !== 'flight'", 60000);
  }
} finally {
  await page.close();
}
function band(b) {
  return `${b.min} to ${b.max}`;
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
