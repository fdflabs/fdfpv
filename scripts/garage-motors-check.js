/*
 * garage-motors-check.js: a quad's motors, props and packs in the hangar
 * (src/ui/hangar.js Power tab, configs/motors.js), in the real shell,
 * headless.
 *
 *   1. The interceptor's Customise opens the hangar, and its Power tab
 *      shows its motors, props and packs: the stock one and every other of
 *      each. The five inch's did, until it was removed (2026-10-03); the
 *      interceptor is the racer now, and a combat quad opens on its Loadout.
 *   2. Choosing a motor, a prop and a pack previews them: the thrust to
 *      weight, the weight, the top speed and the two flight times read the
 *      choice's own, motorStats and configs/motor-estimates.js, and the
 *      stock choice's ghost stays beside each for the before and after.
 *   3. Saved, it is the slot settings.power holds, and flown, the plant
 *      flies it: its loaded torque constant, resistance, rotor inertia
 *      and mass are the sim_set_motors block's, its prop's thrust
 *      constant and a cell's resistance the sim_set_prop_pack block's.
 *   4. Saved to My Hangar as a build, the build keeps all three.
 *   5. Reloaded, the choice is kept and flown again.
 *   6. From the pause menu, refitted in the air: the prop and pack back to
 *      stock leave the motor and take their block off, and the motor back
 *      to stock leaves the table.
 * And no console error or uncaught exception anywhere.
 *
 *   node scripts/garage-motors-check.js [outdir]
 *
 * With an outdir, pictures of the Power tab at 1280x720 and 390x844 go
 * there, never into the repository.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { BUILDS_KEY } from '../src/ui/builds.js';
import { airframeById } from '../configs/airframes.js';
import { MOTORS, SIM_MOTORS, SIM_PROP_PACK, choiceKey, motorStats, motorsBlock, propPackBlock } from '../configs/motors.js';
import { MOTOR_ESTIMATES } from '../configs/motor-estimates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outdir = process.argv[2] || null;

let failed = 0;
let passed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const Q = 'interceptor';
const { options, props, packs } = MOTORS[Q];
const UP = options[options.length - 1];
const CHOICE = { option: UP.id, prop: props[props.length - 1].id, pack: packs[2].id };
const block = motorsBlock(Q, CHOICE);
const propPack = propPackBlock(Q, CHOICE);
const MOTOR_ONLY = { option: UP.id, prop: props[0].id, pack: packs[0].id };
const motorOnly = motorsBlock(Q, MOTOR_ONLY);
/* A row with one card is not drawn (src/ui/hangar.js): the interceptor's
 * one prop is its stock one, so its Props row is absent and never clicked. */
const PROP_ROW = props.length > 1;
const same = (c) => Boolean(c) && c.option === CHOICE.option && c.prop === CHOICE.prop && c.pack === CHOICE.pack;
const s = seatAirframe({ airframe: Q, rates: airframeById(Q).rates }, Q);
s.map = 'alps';
s.graphics = 'low';
s.fpsCap = 0;
s.airframeAsked = true;
const seed = [`try {
  if (!localStorage.getItem('motorsCheckSeeded')) {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.removeItem(${JSON.stringify(BUILDS_KEY)});
    localStorage.setItem('motorsCheckSeeded', '1');
  }
} catch (e) { /* storage refused */ }`];

const faults = (page) => page.errors.filter((e) => !e.startsWith('network:'));

async function ready(page) {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
}

const click = (key) => `(() => { const b = document.querySelector('.hangar [data-key="${key}"]'); if (!b) throw new Error('no ${key}'); b.click(); return true; })()`;

async function shoot(page, name, w, h) {
  if (!outdir) {
    return;
  }
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }, page.sessionId);
  await page.sleep(1200);
  const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outdir, `${name}-${w}x${h}.png`), Buffer.from(shot.data, 'base64'));
  const scroll = await page.evaluate('document.documentElement.scrollWidth > window.innerWidth');
  say(!scroll, `${name} at ${w}x${h}: no sideways scroll`);
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, page.sessionId);
  await page.sleep(300);
}

async function openOn(page, id) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  const at = await page.evaluate(`window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})`);
  await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await toPower(page);
}

/* A combat quad's hangar opens on what it carries (src/ui/ui.js
 * openHangar); its motors are the Power tab. */
async function toPower(page) {
  await page.evaluate(click('tab-power'));
  await page.until("window.__ui.hangar.tab === 'power'", 10000);
}

async function fly(page) {
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 400000);
  return page.evaluate('window.__craft()');
}

/* From a run to the title, by the pause menu, as a pilot goes. A run's
 * first moments can let an Escape pass (the launch), so it is pressed
 * again until the menu is up, five times at most. */
async function pause(page) {
  for (let i = 0; i < 5 && await page.evaluate('window.__ui.screen') !== 'paused'; i += 1) {
    await page.tap('Escape');
    await page.sleep(600);
  }
  const screen = await page.evaluate('window.__ui.screen');
  if (screen !== 'paused') {
    throw new Error(`no pause menu after five Escapes: screen ${screen}, mode ${await page.evaluate('window.__craftState && window.__craftState().mode')}`);
  }
}

async function toTitle(page) {
  await pause(page);
  await page.evaluate("window.__ui.show('title'); true");
}

const flies = (c, b) => Boolean(c.motors) && c.motors.ke === b[SIM_MOTORS.KE] && c.motors.r === b[SIM_MOTORS.R]
  && c.motors.j === b[SIM_MOTORS.J_ROTOR] && c.massKg === b[SIM_MOTORS.MASS];
const propFlies = (c, b) => Boolean(c.motors) && c.motors.kt === b[SIM_PROP_PACK.KT] && c.motors.rCell === b[SIM_PROP_PACK.R_CELL];

async function main() {
  if (outdir) {
    await mkdir(outdir, { recursive: true });
  }
  const page = await openPage({ root, width: 1280, height: 720, seed });
  try {
    await ready(page);
    const table = await page.evaluate('window.__craft()');

    console.log('1. the interceptor\'s motors');
    await openOn(page, Q);
    const cards = (prefix) => `[...document.querySelectorAll('.hangar [data-key^="${prefix}-"]')].map((b) => b.dataset.key.slice(${prefix.length + 1}))`;
    const shown = await page.evaluate(`({ tab: window.__ui.hangar.tab, motors: ${cards('option')}, props: ${cards('prop')}, packs: ${cards('pack')} })`);
    const ids = (list) => JSON.stringify(list.map((o) => o.id));
    say(shown.tab === 'power' && JSON.stringify(shown.motors) === ids(options) && JSON.stringify(shown.props) === (PROP_ROW ? ids(props) : '[]') && JSON.stringify(shown.packs) === ids(packs),
      `on the Power tab, every motor, prop and pack offered: ${shown.motors.join(', ')}; ${shown.props.join(', ')}; ${shown.packs.join(', ')}`);

    /* Every other tab must open on it too. */
    const tabs = await page.evaluate('[...document.querySelectorAll(\'.hangar [data-key^="tab-"]\')].map((b) => b.dataset.key)');
    for (const key of tabs) {
      await page.evaluate(click(key));
    }
    await page.evaluate(click('tab-power'));
    const back = await page.evaluate('window.__ui.hangar.tab');
    say(back === 'power' && faults(page).length === 0, `every tab opens on it: ${tabs.map((k) => k.slice(4)).join(', ')}`);

    console.log('2. a motor, a prop and a pack previewed');
    const stats = () => page.evaluate("Object.fromEntries([...document.querySelectorAll('.hangar-side .hangar-stat')].map((b) => [b.querySelector('.hangar-stat-label').textContent, b.querySelector('.hangar-stat-value').textContent]))");
    const before = await stats();
    await page.evaluate(click(`option-${CHOICE.option}`));
    if (PROP_ROW) {
      await page.evaluate(click(`prop-${CHOICE.prop}`));
    }
    await page.evaluate(click(`pack-${CHOICE.pack}`));
    await page.sleep(800);
    const chosen = await page.evaluate('({ ...window.__ui.hangar.choice })');
    const est = await page.evaluate(`window.__ui.hangar.power.estimate(${JSON.stringify(CHOICE)})`);
    const want = motorStats(Q, CHOICE);
    say(same(chosen), `the three cards make the choice: ${JSON.stringify(chosen)}`);
    say(Math.abs(est.thrustToWeight - want.tw) < 1e-9 && est.grams === Math.round(want.massKg * 1000)
      && est.topSpeed === MOTOR_ESTIMATES[Q][choiceKey(CHOICE)] && Math.abs(est.fullMinutes - want.fullMin) < 1e-9 && Math.abs(est.hoverMinutes - want.hoverMin) < 1e-9,
      `the readouts are the choice's: T/W ${est.thrustToWeight.toFixed(2)}, ${est.grams} g, ${est.topSpeed} m/s, ${est.hoverMinutes.toFixed(1)} and ${est.fullMinutes.toFixed(2)} min`);
    const after = await stats();
    say(JSON.stringify(before) !== JSON.stringify(after), `the panel shows it: ${JSON.stringify(after)}`);
    const ghosts = await page.evaluate("document.querySelectorAll('.hangar-side .hangar-stat-ghost.on').length");
    say(ghosts >= 3, `the stock motor's figures stand beside the new ones: ${ghosts} ghosts`);
    if (outdir) {
      await shoot(page, 'motors-power', 1280, 720);
      await shoot(page, 'motors-power', 390, 844);
    }

    console.log('3. saved and flown');
    await page.evaluate(click('save'));
    await page.until('!window.__ui.hangar.isOpen', 10000);
    const slot = await page.evaluate(`window.__ui.settings.power[${JSON.stringify(Q)}]`);
    say(same(slot), `settings.power holds it: ${JSON.stringify(slot)}`);
    if (await page.evaluate('window.__ui.carousel.isOpen')) {
      await page.tap('Enter');
      await page.until('!window.__ui.carousel.isOpen', 10000);
    }
    const flown = await fly(page);
    say(flies(flown, block) && propFlies(flown, propPack), `the plant flies it: ke ${flown.motors.ke}, R ${flown.motors.r}, J ${flown.motors.j}, ${flown.massKg} kg, kt ${flown.motors.kt}, ${flown.motors.rCell} ohm a cell`);
    say(!flies(table, block) && table.motors && table.motors.ke !== block[SIM_MOTORS.KE], `and not the table it flew before: ke ${table.motors && table.motors.ke}`);

    console.log('4. My Hangar');
    await toTitle(page);
    await openOn(page, Q);
    await page.evaluate(click('mine-new'));
    await page.evaluate("(() => { const f = document.querySelector('.hangar [data-key=\"mine-name\"]'); f.value = 'Hot Interceptor'; return true; })()");
    await page.evaluate(click('mine-name-save'));
    await page.until('!window.__ui.hangar.isOpen', 10000);
    const built = await page.evaluate(`(JSON.parse(localStorage.getItem(${JSON.stringify(BUILDS_KEY)}) || '{}').builds || []).find((b) => b.name === 'Hot Interceptor')`);
    say(Boolean(built) && built.airframe === Q && same(built.fit.power), `the build keeps all three: ${JSON.stringify(built && built.fit.power)}`);
    await page.tap('Escape');

    console.log('5. reloaded');
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await ready(page);
    const kept = await page.evaluate(`window.__ui.settings.power[${JSON.stringify(Q)}]`);
    say(same(kept), `kept: ${JSON.stringify(kept)}`);
    const again = await fly(page);
    say(flies(again, block) && propFlies(again, propPack), `and flown again: ke ${again.motors.ke}, kt ${again.motors.kt}`);

    console.log('6. back to stock, from the pause menu, refitted in the air');
    await pause(page);
    await page.evaluate("window.__ui.act('customise'); true");
    await page.until('window.__ui.hangar.isOpen', 10000);
    await toPower(page);
    if (PROP_ROW) {
      await page.evaluate(click(`prop-${props[0].id}`));
    }
    await page.evaluate(click(`pack-${packs[0].id}`));
    await page.evaluate(click('save'));
    await page.until('!window.__ui.hangar.isOpen', 10000);
    /* Both halves of the block: on a quad with one prop the kt never moves,
     * so a wait on it alone is met before the refit lands and reads the old
     * pack (2 runs in 3 on the interceptor). The cell's resistance is the
     * pack's half. */
    await page.until(`window.__craft().motors && window.__craft().motors.kt === ${table.motors.kt} && window.__craft().motors.rCell === ${table.motors.rCell}`, 60000).catch(() => {});
    const half = await page.evaluate('window.__craft()');
    say(flies(half, motorOnly) && half.motors.kt === table.motors.kt && half.motors.rCell === table.motors.rCell,
      `the stock prop and pack take their block off and leave the motor: kt ${half.motors.kt}, ${half.motors.rCell} ohm a cell, ke ${half.motors.ke}`);
    if (await page.evaluate("window.__ui.screen !== 'paused'")) {
      await pause(page);
    }
    await page.evaluate("window.__ui.act('customise'); true");
    await page.until('window.__ui.hangar.isOpen', 10000);
    await toPower(page);
    await page.evaluate(click(`option-${options[0].id}`));
    await page.evaluate(click('save'));
    await page.until('!window.__ui.hangar.isOpen', 10000);
    await page.until(`window.__craft().motors && window.__craft().motors.ke === ${table.motors.ke}`, 60000).catch(() => {});
    const stock = await page.evaluate('window.__craft()');
    say(stock.motors.ke === table.motors.ke && stock.motors.r === table.motors.r && stock.massKg === table.massKg && stock.motors.kt === table.motors.kt,
      `the stock motor is the table again, at once: ke ${stock.motors.ke}`);


    const f = faults(page);
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    const f = faults(page);
    say(false, `the check stopped: ${e.message}${f.length ? `; the page said: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

await main();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
