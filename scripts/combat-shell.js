/*
 * combat-shell.js: a combat quad's payload in the real shell, headless
 * (docs/COMBAT-DRONES.md). The plant's half is scripts/combat-gates.js;
 * this is that the shell seats what the pilot chose and nothing else:
 *
 *   1. a 7 inch stored with the wide payload and its second pack flies at
 *      the bare mass plus both, with the payload's drag and more roll
 *      inertia than the bare machine;
 *   2. the pause menu's Customise opens the hangar on the Loadout tab, and
 *      choosing no payload and no accessories there and saving refits the
 *      quad in the air at its bare mass;
 *   3. a reset keeps it;
 *   4. the picker's Customise on the 10 inch opens the same tab;
 *   5. the Striker (the doc's section 7), stored on its turbojet with the
 *      standard warhead, is seated on the jet's plant at its mass, the
 *      bay's trim lead included, and
 *      speaks with the turbine's voice; its Loadout tab offers both
 *      engines, the warheads and the whip, and choosing the piston engine
 *      there and saving refits it on the piston's plant, drawn with it.
 *
 *   node scripts/combat-shell.js
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
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { trimBallastKg } from '../configs/combat.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const striker = airframeById('striker2500');
const seven = airframeById('7inch');
const wide = seven.combat.payloads.find((p) => p.id === 'wide');
const pack2 = seven.combat.accessories.find((a) => a.id === 'pack2');

const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '7inch');
seated.graphics = 'low';
seated.combat = { '7inch': { payload: 'wide', accessories: ['pack2'] } };

const page = await openPage({
  root,
  width: 960,
  height: 600,
  url: '/index.html',
  seed: [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused */ }`],
});
let failed = 0;
const say = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
};
const near = (a, b) => Math.abs(a - b) < 1e-9;
const click = (key) => `(() => { const b = document.querySelector('.hangar [data-key="${key}"]'); if (!b) throw new Error('no ${key}'); b.click(); return true; })()`;

try {
  await page.until('!!window.__shellReady', 240000);
  await page.until('window.__map && window.__map().ready', 240000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 120000);
  await page.sleep(500);

  /* 1. Seated as stored. */
  let c = await page.evaluate('window.__craft()');
  const loaded = seven.grams / 1000 + wide.massKg + pack2.massKg;
  say(c.run === '7inch' && c.module === seven.simId, `the 7 inch is seated on plant ${c.module}`);
  say(c.combat && c.combat.payload === 'wide' && c.combat.accessories.join() === 'pack2', `it carries ${JSON.stringify(c.combat)}`);
  say(c.addons && c.addons.on && near(c.massKg, loaded) && near(c.addons.cda, wide.dragArea_m2),
    `the plant flies ${c.massKg.toFixed(3)} kg (bare ${seven.grams / 1000} plus ${wide.massKg} and ${pack2.massKg}) with ${c.addons ? c.addons.cda : '?'} m^2 of payload drag`);
  const loadedIxx = c.ixx;

  /* 2. The pause menu's Customise, on the Loadout tab. */
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000);
  const row = await page.evaluate("window.__ui.items().findIndex((it) => it.action === 'customise')");
  say(row >= 0, 'the pause menu offers Customise on a combat quad');
  await page.evaluate(`window.__ui.setCursor(${row}); true`);
  await page.tap('Enter');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await page.until("window.__ui.hangar.tab === 'loadout'", 5000).catch(() => {});
  const tab = await page.evaluate('window.__ui.hangar.tab');
  const keys = await page.evaluate("[...document.querySelectorAll('.hangar .combat-tab [data-key]')].map((b) => b.dataset.key)");
  say(tab === 'loadout', `the hangar opens on ${tab}`);
  say(['payload-none', 'payload-standard', 'payload-wide', 'payload-penetrator', 'payload-emp', 'accessory-pack2', 'accessory-cage', 'accessory-lrantenna', 'accessory-gps'].every((k) => keys.includes(k)),
    `it offers every payload and accessory: ${keys.join(', ')}`);
  await page.evaluate(click('payload-none'));
  await page.evaluate(click('accessory-pack2'));
  await page.evaluate('window.__ui.hangar.saveBtn.click(); true');
  await page.until('!window.__ui.hangar.isOpen', 5000);
  await page.sleep(800);
  c = await page.evaluate('window.__craft()');
  const stored = await page.evaluate("window.__ui.settings.combat['7inch']");
  say(stored && stored.payload === 'none' && stored.accessories.length === 0, `saved: ${JSON.stringify(stored)}`);
  say(c.combat && c.combat.payload === 'none' && near(c.massKg, seven.grams / 1000) && c.addons && !c.addons.on && c.ixx < loadedIxx,
    `refitted in the air at ${c.massKg.toFixed(3)} kg, no add-ons, roll inertia ${c.ixx.toFixed(5)} from ${loadedIxx.toFixed(5)}`);

  /* 3. A reset keeps it. */
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'flight'", 10000).catch(() => {});
  await page.tap('KeyR');
  await page.sleep(800);
  const after = await page.evaluate('window.__craft()');
  say(near(after.massKg, c.massKg) && after.combat && after.combat.payload === 'none', `after a reset: ${after.massKg.toFixed(3)} kg, ${JSON.stringify(after.combat)}`);

  /* 4. The picker's Customise on the 10 inch. */
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  const at = await page.evaluate("window.__ui.carousel.ids.indexOf('10inch')");
  say(at >= 0, 'the picker offers the 10 inch');
  await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000).catch(() => {});
  const ten = await page.evaluate('({ open: window.__ui.hangar.isOpen, id: window.__ui.hangar.id, tab: window.__ui.hangar.tab })');
  say(ten.open && ten.id === '10inch' && ten.tab === 'loadout', `the picker's Customise opens ${JSON.stringify(ten)}`);
  const quadIds = await page.evaluate("window.__ui.carousel.ids");
  say(quadIds.includes('7inch') && quadIds.includes('10inch') && quadIds.includes('interceptor'), `the picker lists ${quadIds.slice(0, 6).join(', ')}, ...`);

  /* 5. The interceptor's Loadout tab offers its own set and nothing else. */
  await page.evaluate('window.__ui.hangar.cancel(); true');
  await page.until('!window.__ui.hangar.isOpen', 5000);
  await page.evaluate('if (!window.__ui.carousel.isOpen) window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  const fastAt = await page.evaluate("window.__ui.carousel.ids.indexOf('interceptor')");
  await page.evaluate(`window.__ui.carousel.goTo(${fastAt}); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000).catch(() => {});
  const fast = await page.evaluate("({ open: window.__ui.hangar.isOpen, id: window.__ui.hangar.id, tab: window.__ui.hangar.tab, keys: [...document.querySelectorAll('.hangar .combat-tab [data-key]')].map((b) => b.dataset.key), on: [...document.querySelectorAll('.hangar .combat-tab [aria-pressed=\"true\"]')].map((b) => b.dataset.key) })");
  say(fast.open && fast.id === 'interceptor' && fast.tab === 'loadout', `the picker's Customise opens ${JSON.stringify({ open: fast.open, id: fast.id, tab: fast.tab })}`);
  say(fast.keys.join() === 'payload-none,payload-proximity,accessory-lrantenna,accessory-gps', `the interceptor offers ${fast.keys.join(', ')}`);
  say(fast.on.join() === 'payload-proximity', `a pilot who never chose carries the proximity payload: ${fast.on.join(', ') || 'nothing on'}`);
  say(page.errors.length === 0, `no page errors${page.errors.length ? `: ${JSON.stringify(page.errors.slice(0, 5))}` : ''}`);
} finally {
  await page.close();
}

/* 5. The Striker, on its turbojet, then on its piston engine. */
{
  const s5 = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'striker2500');
  s5.graphics = 'low';
  s5.combat = { striker2500: { payload: 'standard', accessories: [], propulsion: 'jet' } };
  const jet = striker.combat.propulsion.find((x) => x.id === 'jet');
  const prop = striker.combat.propulsion.find((x) => x.id === 'prop');
  const standard = striker.combat.payloads.find((x) => x.id === 'standard');
  /* The bay's trim lead that goes in with the standard warhead, on each engine. */
  const lead = (pr) => trimBallastKg(pr.grams / 1000, striker.combat.payloads, standard, striker.combat.ballast.at_m[0]);
  const sp = await openPage({
    root,
    width: 960,
    height: 600,
    url: '/index.html',
    seed: [`try {
      const k = ${JSON.stringify(SETTINGS_KEY)};
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      Object.assign(s, ${JSON.stringify(s5)});
      s.airframeAsked = true;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) { /* storage refused */ }`],
  });
  try {
    await sp.until('!!window.__shellReady', 240000);
    await sp.until('window.__map && window.__map().ready', 240000);
    await sp.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await sp.until("window.__craftState && window.__craftState().mode === 'flight'", 120000);
    await sp.sleep(500);
    let c = await sp.evaluate('window.__craft()');
    const near3 = (a, b) => Math.abs(a - b) < 1e-6;
    say(c.run === 'striker2500' && c.module === jet.simId && c.combat && c.combat.propulsion === 'jet',
      `the Striker is seated on plant ${c.module}, ${JSON.stringify(c.combat)}`);
    say(c.addons && near3(c.addons.massKg, jet.grams / 1000 + standard.massKg + lead(jet)),
      `it flies ${c.addons ? c.addons.massKg.toFixed(3) : '?'} kg, the jet's ${jet.grams / 1000}, the ${standard.massKg} kg warhead and ${lead(jet).toFixed(3)} kg of trim lead`);
    const voice = await sp.evaluate('window.__hangarRev().voice');
    say(voice === jet.voice, `it speaks on the ${voice} voice`);
    await sp.tap('Escape');
    await sp.until("window.__ui.screen === 'paused'", 10000);
    const row = await sp.evaluate("window.__ui.items().findIndex((it) => it.action === 'customise')");
    say(row >= 0, 'the pause menu offers Customise on the Striker');
    await sp.evaluate(`window.__ui.setCursor(${row}); true`);
    await sp.tap('Enter');
    await sp.until('window.__ui.hangar.isOpen', 10000);
    await sp.until("window.__ui.hangar.tab === 'loadout'", 5000).catch(() => {});
    const keys = await sp.evaluate("[...document.querySelectorAll('.hangar .combat-tab [data-key]')].map((b) => b.dataset.key)");
    say(['propulsion-prop', 'propulsion-jet', 'payload-none', 'payload-standard', 'payload-wide', 'payload-penetrator', 'payload-emp', 'accessory-whip'].every((k) => keys.includes(k)),
      `its Loadout tab offers both engines, every warhead and the whip: ${keys.join(', ')}`);
    await sp.evaluate(`(() => { const b = document.querySelector('.hangar [data-key="propulsion-prop"]'); b.click(); return true; })()`);
    await sp.evaluate('window.__ui.hangar.saveBtn.click(); true');
    await sp.until('!window.__ui.hangar.isOpen', 5000);
    await sp.sleep(800);
    c = await sp.evaluate('window.__craft()');
    const stored = await sp.evaluate("window.__ui.settings.combat.striker2500");
    say(stored && stored.propulsion === 'prop' && stored.payload === 'standard', `saved: ${JSON.stringify(stored)}`);
    say(c.module === prop.simId && c.addons && near3(c.addons.massKg, prop.grams / 1000 + standard.massKg + lead(prop)) && c.shown === 'striker2500',
      `refitted on plant ${c.module} at ${c.addons ? c.addons.massKg.toFixed(3) : '?'} kg, drawn as ${c.shown}`);
    const v2 = await sp.evaluate('window.__hangarRev().voice');
    say(v2 === prop.voice, `and speaks on the ${v2} voice`);
    say(sp.errors.length === 0, `no page errors${sp.errors.length ? `: ${JSON.stringify(sp.errors.slice(0, 5))}` : ''}`);
  } finally {
    await sp.close();
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nall hold');
process.exit(failed ? 1 : 0);
