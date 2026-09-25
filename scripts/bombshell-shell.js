/*
 * bombshell-shell.js: the Buzzard Bombshell in the real shell, headless,
 * from the gate: the Free Flight card (the fixed wings') pressed, the Bombshell picked on the
 * machine screen, and flown from where the shell seats it, on the airfield
 * and then on swiss2. Seated with Acro and its own module, parked on its
 * wheels and skid at the plant's rest, it takes off on full throttle with
 * the sticks centred, climbs, answers full roll stick on its rudder, and
 * the C key puts the chase camera on it.
 *
 * The plant's own checks are scripts/bombshell-gates.js; this is the other
 * half, the shell's. The pilot flies on __craftState and __stick; phases
 * are timed on the page's clock, which headless is slow, so each waits on
 * what the aircraft did and not on a stopwatch.
 *
 *   node scripts/bombshell-shell.js
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const AF = process.argv[2] ?? 'bombshell1118';
const MAPS = (process.argv[3] ?? 'airfield,swiss2').split(',');
const af = airframeById(AF);

/*
 * The pilot, in the page, once a frame. 'roll': full throttle, sticks
 * centred, until it has been 0.3 m clear of the ground under it for a
 * second, which on swiss2's slope is not its start's height; 'climb': more
 * of it until 3 m clear; 'bank': full right roll stick until it banks 20
 * deg right. Each phase ends on what the aircraft did, since swiss2
 * headless draws a frame in seconds and the sim's clock runs slower than
 * the page's; the page's clock only times a phase out. Everything it saw
 * goes to window.__bsLog.
 */
const PILOT = `
window.__bsLog = { phase: 'roll', events: [], done: false };
(() => {
  const L = window.__bsLog;
  let phase = 'roll';
  let tPhase = performance.now();
  const rest = window.__craftState().groundClearance;
  let airMs = 0;
  let last = performance.now();
  const mark = (what, c, extra = {}) => {
    const right = { y: c.fwd.z * c.up.x - c.fwd.x * c.up.z };
    L.events.push({ what, x: c.worldX, y: c.worldY, z: c.worldZ, height: c.groundClearance - rest, speed: c.speed,
      pitch: Math.asin(Math.max(-1, Math.min(1, c.fwd.y))) * 180 / Math.PI,
      bank: Math.asin(Math.max(-1, Math.min(1, -right.y))) * 180 / Math.PI, crashed: c.crashed, ...extra });
  };
  const next = (p, c) => { mark(p, c); phase = p; tPhase = performance.now(); };
  const tick = () => {
    const c = window.__craftState();
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (!c || c.mode !== 'flight' || !c.fwd) { requestAnimationFrame(tick); return; }
    const inPhase = (now - tPhase) / 1000;
    let sticks = [0, 0, 0, 1];
    if (phase === 'roll') {
      airMs = c.groundClearance - rest < 0.3 ? 0 : airMs + dt;
      if (airMs > 1000) next('climb', c);
      if (inPhase > 180) next('failed-roll', c);
    } else if (phase === 'climb') {
      if (c.groundClearance - rest > 3) next('bank', c);
      if (inPhase > 300) next('failed-climb', c);
    } else if (phase === 'bank') {
      sticks = [1, 0, 0, 1];
      const right = { y: c.fwd.z * c.up.x - c.fwd.x * c.up.z };
      if (Math.asin(Math.max(-1, Math.min(1, -right.y))) > 20 * Math.PI / 180) { next('done', c); L.done = true; }
      if (inPhase > 300) { next('failed-bank', c); L.done = true; }
    } else {
      L.done = true;
    }
    L.phase = phase;
    if (c.crashed && !L.events.some((e) => e.what === 'crashed')) mark('crashed', c);
    window.__stick(...(L.done ? [0, 0, 0, 0.75] : sticks));
    if (!L.done) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
`;

let failed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failed += 1;
};

const page = await openPage({ root, width: 480, height: 300, url: '/index.html' });
try {
  await page.until('!!window.__shellReady', 240000);
  /* The gate's Free Flight card, pressed; it seats the card's first plane
   * and its home, the airfield. */
  await page.evaluate("window.__ui.craftGate = true; window.__ui.show('title'); window.__ui.act('way-freestyle-wing1000'); true");
  await page.until("window.__ui.settings.map === 'airfield' && window.__map && window.__map().ready", 240000);
  /* The Bombshell, picked on the machine screen's Aircraft row. */
  const picked = await page.evaluate(`(() => {
    const ui = window.__ui;
    ui.show('quad');
    const i = ui.items().findIndex((it) => it.options && it.options.some((o) => o.value === '${AF}'));
    ui.cursor = i;
    ui.pick('${AF}');
    const planes = ui.items()[i].options.map((o) => o.label);
    ui.show('title');
    return { setting: ui.settings.airframe, tune: ui.settings.tune, planes, card: ui.items().filter((it) => it.card).map((it) => it.label) };
  })()`);
  say(picked.setting === AF && picked.tune === af.defaultTune, `picked on the Aircraft row: ${picked.setting}, tune ${picked.tune}, ${picked.planes.length} aircraft listed`);
  /* It is one of the card's planes: pressing the card again keeps it,
   * where a plane that is not would be swapped for the card's first. */
  const again = await page.evaluate("(() => { const ui = window.__ui; ui.craftGate = true; ui.show('title'); ui.act('way-freestyle-wing1000'); return { airframe: ui.settings.airframe, mode: ui.mode }; })()");
  say(again.airframe === AF && again.mode === 'freestyle', `one of the Free Flight card's planes: pressing the card again keeps ${again.airframe}, mode ${again.mode}`);

  for (const map of MAPS) {
    console.log(`${map}:`);
    if (map !== 'airfield') {
      await page.evaluate(`window.__ui.seatMap('${map}'); true`);
      await page.until(`window.__ui.settings.map === '${map}' && window.__map && window.__map().ready`, 400000);
    }
    await page.evaluate("window.__ui.settings.wingView = 'fpv'; window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 180000);
    await page.sleep(1500);
    const craft = await page.evaluate('window.__craft()');
    const st = await page.evaluate('window.__craftState()');
    const g = await page.evaluate('window.__ground ? window.__ground() : null');
    const drawn = await page.evaluate("(() => { let n = null; window.__mapScene().traverse((o) => { if (o.name === 'craft') { o.traverse((c) => { if (!n && /-fuselage$/.test(c.name)) n = c.name; }); } }); return n; })()");
    say(craft.setting === AF && craft.run === AF && craft.module === af.simId && drawn === `${AF.replace(/[0-9]+$/, '')}-fuselage`,
      `the setting, the run, the module and the drawn model: ${craft.setting}, ${craft.run}, module ${craft.module}, ${drawn}`);
    say(st.tune === af.defaultTune && st.wingStab === 2, `on ${st.tune} with the stabiliser in mode ${st.wingStab}`);
    if (g) {
      say(g.landed && Math.abs(g.above - af.gear.restHeight) < 0.02,
        `parked on its wheels and skid: CG ${g.above.toFixed(4)} m over the ground against the plant's ${af.gear.restHeight}`);
    }
    await page.evaluate(PILOT);
    const t0 = Date.now();
    while (Date.now() - t0 < 600000) {
      const s = await page.evaluate('({ done: window.__bsLog.done, phase: window.__bsLog.phase })');
      if (s.done) break;
      await page.sleep(1000);
    }
    const log = await page.evaluate('window.__bsLog');
    for (const e of log.events) {
      console.log(`    ${e.what.padEnd(12)} speed ${e.speed.toFixed(2)} m/s, height ${e.height.toFixed(2)} m, pitch ${e.pitch.toFixed(1)}, bank ${e.bank.toFixed(1)}${e.crashed ? ', CRASHED' : ''}`);
    }
    const ev = (w) => log.events.find((e) => e.what === w);
    say(Boolean(ev('climb')), `full throttle, sticks centred: off the ground${ev('climb') ? ` at ${ev('climb').speed.toFixed(2)} m/s` : ''}`);
    say(Boolean(ev('bank')) && ev('bank').speed > af.stall, `climbs 3 m clear of the ground, above its stall: ${ev('bank') ? `at ${ev('bank').speed.toFixed(2)} m/s` : 'never'}`);
    say(Boolean(ev('done')) && ev('done').bank > 15, `full right roll stick banks it right on the rudder: ${ev('done') ? `${ev('done').bank.toFixed(1)} deg` : 'never'}`);
    say(!log.events.some((e) => e.what === 'crashed' || e.what.startsWith('failed')), 'not crashed');
    /* C, the fixed wings' view key: FPV to chase. */
    await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', key: 'c' })); true");
    await page.sleep(1500);
    const view = await page.evaluate('({ view: window.__ui.settings.wingView, state: window.__craftState() })');
    say(view.view === 'chase' && !view.state.crashed, `C puts the chase camera on it: ${view.view}, flying at ${view.state.speed.toFixed(2)} m/s`);
    /* Back to the title, the run over, before the next world is seated. */
    await page.evaluate("window.__stick(0, 0, 0, 0); window.__ui.settings.wingView = 'fpv'; window.__ui.persistSettings(); window.__ui.onAction('title', window.__ui.settings); true");
    await page.until("window.__craftState().mode !== 'flight'", 60000);
  }
} finally {
  await page.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
