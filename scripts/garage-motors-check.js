/*
 * garage-motors-check.js: a quad's motors in the hangar (src/ui/hangar.js
 * Power tab, configs/motors.js), in the real shell, headless.
 *
 *   1. The five inch's Customise opens the hangar on its motors: the
 *      stock motor and every upgrade, each with its maker's name.
 *   2. Choosing an upgrade previews it: the thrust to weight, the weight,
 *      the top speed and the two flight times read the upgrade's own,
 *      motorStats and configs/motor-estimates.js, and the stock motor's
 *      ghost stays beside each for the before and after.
 *   3. Saved, it is the slot settings.power holds, and flown, the plant
 *      flies it: its loaded torque constant, resistance, rotor inertia
 *      and mass are the sim_set_motors block's.
 *   4. Saved to My Hangar as a build, the build keeps the motor.
 *   5. Reloaded, the choice is kept and flown again.
 *   6. Back to stock clears it: the plant is the table again.
 *   7. The whoop's Customise opens on its one stock motor and says why.
 * And no console error or uncaught exception anywhere.
 *
 *   node scripts/garage-motors-check.js [outdir]
 *
 * With an outdir, pictures of the Power tab at 1280x720 and 390x844 go
 * there, never into the repository.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { BUILDS_KEY } from '../src/ui/builds.js';
import { airframeById } from '../configs/airframes.js';
import { MOTORS, SIM_MOTORS, motorStats, motorsBlock } from '../configs/motors.js';
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

const Q = '5inch';
const options = MOTORS[Q].options;
const UP = options[options.length - 1];
const block = motorsBlock(Q, UP.id);
const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, Q);
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

async function main() {
  if (outdir) {
    await mkdir(outdir, { recursive: true });
  }
  const page = await openPage({ root, width: 1280, height: 720, seed });
  try {
    await ready(page);
    const table = await page.evaluate('window.__craft()');

    console.log('1. the five inch opens on its motors');
    await openOn(page, Q);
    const shown = await page.evaluate("({ tab: window.__ui.hangar.tab, cards: [...document.querySelectorAll('.hangar [data-key^=\"option-\"]')].map((b) => b.dataset.key.slice(7)) })");
    say(shown.tab === 'power' && JSON.stringify(shown.cards) === JSON.stringify(options.map((o) => o.id)),
      `on the Power tab, every motor offered: ${shown.cards.join(', ')}`);

    /* The five inch is the first quad without a loadout in the hangar:
     * every other tab must open on it and say it has nothing there. */
    const tabs = await page.evaluate('[...document.querySelectorAll(\'.hangar [data-key^="tab-"]\')].map((b) => b.dataset.key)');
    for (const key of tabs) {
      await page.evaluate(click(key));
    }
    await page.evaluate(click('tab-power'));
    const back = await page.evaluate('window.__ui.hangar.tab');
    say(back === 'power' && faults(page).length === 0, `every tab opens on it: ${tabs.map((k) => k.slice(4)).join(', ')}`);

    console.log('2. an upgrade previewed');
    const stats = () => page.evaluate("Object.fromEntries([...document.querySelectorAll('.hangar-side .hangar-stat')].map((b) => [b.querySelector('.hangar-stat-label').textContent, b.querySelector('.hangar-stat-value').textContent]))");
    const before = await stats();
    await page.evaluate(click(`option-${UP.id}`));
    await page.sleep(800);
    const est = await page.evaluate(`window.__ui.hangar.power.estimate({ option: ${JSON.stringify(UP.id)} })`);
    const want = motorStats(Q, UP.id);
    say(Math.abs(est.thrustToWeight - want.tw) < 1e-9 && est.grams === Math.round(want.massKg * 1000)
      && est.topSpeed === MOTOR_ESTIMATES[Q][UP.id] && Math.abs(est.fullMinutes - want.fullMin) < 1e-9,
      `the readouts are the upgrade's: T/W ${est.thrustToWeight.toFixed(2)}, ${est.grams} g, ${est.topSpeed} m/s, ${est.hoverMinutes.toFixed(1)} and ${est.fullMinutes.toFixed(2)} min`);
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
    say(slot && slot.option === UP.id, `settings.power holds it: ${JSON.stringify(slot)}`);
    if (await page.evaluate('window.__ui.carousel.isOpen')) {
      await page.tap('Enter');
      await page.until('!window.__ui.carousel.isOpen', 10000);
    }
    const flown = await fly(page);
    say(flies(flown, block), `the plant flies it: ke ${flown.motors.ke}, R ${flown.motors.r}, J ${flown.motors.j}, ${flown.massKg} kg`);
    say(!flies(table, block) && table.motors && table.motors.ke !== block[SIM_MOTORS.KE], `and not the table it flew before: ke ${table.motors && table.motors.ke}`);

    console.log('4. My Hangar');
    await toTitle(page);
    await openOn(page, Q);
    await page.evaluate(click('mine-new'));
    await page.evaluate("(() => { const f = document.querySelector('.hangar [data-key=\"mine-name\"]'); f.value = 'Hot Five'; return true; })()");
    await page.evaluate(click('mine-name-save'));
    await page.until('!window.__ui.hangar.isOpen', 10000);
    const built = await page.evaluate(`(JSON.parse(localStorage.getItem(${JSON.stringify(BUILDS_KEY)}) || '{}').builds || []).find((b) => b.name === 'Hot Five')`);
    say(Boolean(built) && built.airframe === Q && built.fit.power && built.fit.power.option === UP.id, `the build keeps the motor: ${JSON.stringify(built && built.fit.power)}`);
    await page.tap('Escape');

    console.log('5. reloaded');
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await ready(page);
    const kept = await page.evaluate(`window.__ui.settings.power[${JSON.stringify(Q)}]`);
    say(kept && kept.option === UP.id, `kept: ${JSON.stringify(kept)}`);
    const again = await fly(page);
    say(flies(again, block), `and flown again: ke ${again.motors.ke}`);

    console.log('6. back to stock, from the pause menu, refitted in the air');
    await pause(page);
    await page.evaluate("window.__ui.act('customise'); true");
    await page.until("window.__ui.hangar.isOpen && window.__ui.hangar.tab === 'power'", 10000);
    await page.evaluate(click(`option-${options[0].id}`));
    await page.evaluate(click('save'));
    await page.until('!window.__ui.hangar.isOpen', 10000);
    await page.until(`window.__craft().motors && window.__craft().motors.ke === ${table.motors.ke}`, 60000).catch(() => {});
    const stock = await page.evaluate('window.__craft()');
    say(stock.motors.ke === table.motors.ke && stock.motors.r === table.motors.r && stock.massKg === table.massKg,
      `the stock motor is the table again, at once: ke ${stock.motors.ke}`);

    console.log('7. the whoop flies stock');
    await toTitle(page);
    await openOn(page, 'whoop65');
    const whoop = await page.evaluate("({ tab: window.__ui.hangar.tab, cards: document.querySelectorAll('.hangar [data-key^=\"option-\"]').length, notes: [...document.querySelectorAll('.hangar-side .hangar-note')].map((n) => n.textContent) })");
    say(whoop.tab === 'power' && whoop.cards === 1 && whoop.notes.some((n) => n.startsWith('Whoops fly stock')),
      `one stock motor and why: ${whoop.notes.find((n) => n.startsWith('Whoops')) ?? JSON.stringify(whoop)}`);
    await page.tap('Escape');

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
