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
 *   human-as3x, human-manual
 *            pulled to the vertical as hang is, then hovered 10 s by a
 *            pilot with a person's limits, scripts/hover-probe.js's (one of
 *            its grid that holds in both modes): what it sees is 0.2 s of
 *            the plant's time old, it moves the sticks every 0.1 s in
 *            fiftieths of their travel, and it flies by the nose off
 *            vertical, the roll rate, the drift and the climb. In the
 *            Extra's default tune (AS3X) and in Manual, given 3 s to catch
 *            the hand over: the nose within 20 deg of vertical and the
 *            height within 10 m for the 10 s after, judged in AS3X and
 *            printed for Manual; and how far the chase camera turns round
 *            the hovering plane in all, which must not wander (under 120
 *            deg) while it hangs.
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
import { PILOT } from './lib/extrapilot.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const th = JSON.parse(await readFile(join(root, 'tests/extra-thresholds.json'), 'utf8'));
const AF = 'extra3d1308';
const MODES = (process.argv[2] ?? 'hang,harrier,knife,human-as3x,human-manual').split(',');
const MAP = process.argv[3] ?? 'swiss2';


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
  const seated = await page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}')); ui.cursor = i; ui.pick('${AF}'); window.__pickedTune = ui.settings.tune; ui.settings.tune = 'extra-manual'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
  console.log(`extra owner test on ${MAP}: ${seated}`);
  const picked = await page.evaluate('window.__pickedTune');
  say(picked === 'extra-as3x', `picking the Extra seats the tune it ships in, AS3X: ${picked}`);
  for (const mode of MODES) {
    const tune = mode === 'human-as3x' ? 'extra-as3x' : 'extra-manual';
    await page.evaluate(`window.__ui.settings.tune = '${tune}'; window.__ui.persistSettings(); window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true`);
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
    await page.sleep(2000);
    const st = await page.evaluate('({ tune: window.__craftState().tune, stab: window.__craftState().wingStab })');
    await page.evaluate(PILOT(mode, th));
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
    } else if (mode.startsWith('human')) {
      /* Gated in the tune the Extra ships in. Manual is harder for a
       * person (hover-probe.js: 11 of its 648 pilots hold Manual, 82
       * AS3X) and this pilot is one of the 11 only from rest, so Manual's
       * row is printed, not judged. */
      const h = r.human;
      const what = h ? `${st.tune}: a person's hover held ${f(h.held, 1)} s of 10, nose within ${f(h.worst, 0)} deg of vertical, throttle ${f(h.thr)}` : `${st.tune}: never hovered, stopped in ${r.at}`;
      if (mode === 'human-as3x') {
        say(Boolean(h) && !r.crashed && h.held >= 10, what);
        /* The travel led camera this replaced turned 342 deg round the
         * same hover, back and forth after the drift. */
        say(Boolean(h) && h.path < 120, h ? `the chase camera turned ${f(h.path, 0)} deg in all round the hovering plane (under 120)` : 'no camera reading');
      } else {
        console.log(`  info  ${what}`);
      }
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
