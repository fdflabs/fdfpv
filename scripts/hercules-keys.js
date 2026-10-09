/*
 * hercules-keys.js: O and P in the real shell, headless
 * (docs/HERCULES-CONTRACT.md). On swiss2 in a gusty sky, the Hercules in
 * Manual takes off and climbs to 60 m over the field, then:
 *
 *   K1 P with the ramp shut drops nothing, and the HUD says to open it;
 *   K2 O opens the ramp: the plant's door reaches open in its 4 s;
 *   K3 two presses of P drop two loads off the lip, each falling the path
 *      src/game/paradrop.js gives its record (fallen again in the page
 *      from the record alone, the same rest to the bit), in the gusty air;
 *   K4 O again shuts it;
 *   K5 on the Bramor, P is still its recovery chute, and O opens no door.
 *
 * With an output folder it leaves a still every 0.25 s of the plant's
 * clock from the first drop until both lie, for the lane's pictures and
 * film. Run with npm run hercules:keys [-- <outdir>].
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] ?? null;
if (out) mkdirSync(out, { recursive: true });

let failed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failed += 1;
};

/* The pilot: full throttle off the strip, wings level, a climb to 60 m,
 * then level at 70 percent. Once a frame. */
const PILOT = `
window.__H = { phase: 'roll', done: false };
(() => {
  const H = window.__H;
  const c0 = window.__craftState();
  const rest = c0.groundClearance;
  const tick = () => {
    const c = window.__craftState();
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    const h = c.groundClearance - rest;
    const bank = Math.asin(Math.max(-1, Math.min(1, -(c.fwd.z * c.up.x - c.fwd.x * c.up.z)))) * 180 / Math.PI;
    const vy = c.vel ? c.vel.y : 0;
    H.h = h; H.speed = c.speed; H.crashed = c.crashed;
    let s;
    if (H.phase === 'roll') {
      s = [-bank * 0.03, c.speed > 11 ? 0.35 : 0, 0, 1];
      if (h > 3) H.phase = 'climb';
    } else if (H.phase === 'climb') {
      s = [-bank * 0.03, Math.max(-0.3, Math.min(0.4, 0.06 * (3 - vy))), 0, 1];
      if (h > 60) H.phase = 'level';
    } else {
      s = [-bank * 0.03, Math.max(-0.4, Math.min(0.4, -0.1 * vy - 0.01 * (h - 60))), 0, 0.75];
    }
    window.__stick(...s);
    if (!H.done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

const page = await openPage({ root, width: 1280, height: 720, url: '/index.html' });
const shot = async (name) => {
  if (!out) return;
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  writeFileSync(join(out, name), Buffer.from(data, 'base64'));
};
const simS = () => page.evaluate('window.__craftState().simS');
async function waitSim(seconds) {
  const t0 = await simS();
  const w0 = Date.now();
  while ((await simS()) - t0 < seconds && Date.now() - w0 < 600000) await page.sleep(100);
}
async function seat(af, tune) {
  return page.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${af}')); ui.cursor = i; ui.pick('${af}'); ui.settings.tune = '${tune}'; ui.persistSettings(); ui.show('title'); return ui.settings.airframe + ' ' + ui.settings.tune; })()`);
}
try {
  await page.until('!!window.__shellReady', 240000);
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  await page.evaluate("window.__weather('gusty', 20261008); true");
  console.log(`hercules keys on swiss2, gusty: ${await seat('hercules3077', 'hercules-manual')}`);
  await page.evaluate("window.__ui.settings.wingView = 'chase'; window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
  await page.sleep(1500);
  await page.evaluate(PILOT);
  await page.until("window.__H.phase === 'level' || window.__H.crashed", 600000);
  await waitSim(3);
  await shot('hercules-flying-ramp-shut.png');

  await page.tap('KeyP');
  await page.sleep(300);
  const k1 = await page.evaluate("({ n: window.__paradrops().length })");
  say(k1.n === 0, `K1 P with the ramp shut drops nothing (${k1.n} drops)`);

  await page.tap('KeyO');
  const s0 = await simS();
  await page.until('window.__wingDoor().door >= 1', 120000).catch(() => {});
  const openS = (await simS()) - s0;
  say(openS > 3.5 && openS < 4.6, `K2 O opens the ramp in its 4 s: open after ${openS.toFixed(2)} s of the plant's clock`);
  await shot('hercules-ramp-open.png');

  await page.tap('KeyP');
  const tDrop = await simS();
  await waitSim(1.0);
  await page.tap('KeyP');
  let frame = 0;
  while ((await simS()) - tDrop < 40) {
    if (out && frame < 400) await shot(`drop-${String(frame).padStart(4, '0')}.png`);
    frame += 1;
    await waitSim(0.25);
  }
  const k3 = await page.evaluate(`(() => {
    const recs = window.__paradrops();
    const again = window.__paradropRefall();
    return recs.map((r, i) => ({ same: again[i].every((v, k) => Object.is(v, r.rest[k])), rest: r.rest.map((v) => +v.toFixed(2)), wet: r.wet, p: r.p.map((v) => +v.toFixed(2)), air: r.air }));
  })()`).catch((e) => ({ error: String(e) }));
  const ok3 = Array.isArray(k3) && k3.length === 2 && k3.every((d) => d.same) && k3.every((d) => d.air && d.air.preset === 'gusty');
  say(ok3, `K3 two presses drop two loads that lie where their records say: ${JSON.stringify(k3).slice(0, 400)}`);
  await shot('hercules-drops-down.png');

  await page.tap('KeyO');
  await waitSim(4.5);
  const k4 = await page.evaluate('window.__wingDoor().door');
  say(k4 === 0, `K4 O again shuts it: door ${k4}`);
  await page.evaluate('window.__H.done = true; window.__stick(0, 0, 0, 0); true');

  const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
  if (errs.length) console.log(`page errors: ${errs.slice(0, 3).join(' | ')}`);
  say(errs.length === 0, `no page errors past the absent board (${errs.length})`);
} finally {
  await page.close();
}

/* K5 in a page of its own, so the Bramor is seated from the title. */
const bram = await openPage({ root, width: 960, height: 540, url: '/index.html' });
try {
  await bram.until('!!window.__shellReady', 240000);
  await bram.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await bram.until("window.__ui.settings.map === 'swiss2' && window.__map && window.__map().ready", 400000);
  const seated = await bram.evaluate(`(() => { const ui = window.__ui; ui.show('quad'); const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === 'bramor2300')); ui.cursor = i; ui.pick('bramor2300'); ui.persistSettings(); ui.show('title'); return ui.settings.airframe; })()`);
  await bram.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await bram.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
  await bram.sleep(1500);
  await bram.evaluate('window.__stick(0, 0, 0, 1); true');
  const t0 = await bram.evaluate('window.__craftState().simS');
  while ((await bram.evaluate('window.__craftState().simS')) - t0 < 5) await bram.sleep(200);
  await bram.tap('KeyO');
  await bram.tap('KeyP');
  await bram.sleep(1500);
  const k5 = await bram.evaluate('({ ...window.__wingDoor(), drops: window.__paradrops().length })');
  say(seated === 'bramor2300' && k5.chute > 0 && k5.door === 0 && k5.drops === 0,
    `K5 on the ${seated} P pulls the chute (${k5.chute}) and O opens no door (${k5.door}), no drop (${k5.drops})`);
} finally {
  await bram.close();
}
console.log(`\n${failed ? `${failed} FAILED` : 'every key holds'}`);
process.exit(failed ? 1 : 0);
