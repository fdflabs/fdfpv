/*
 * hangar-check.js: the hangar, its paint and its power, in the real shell,
 * headless.
 *
 *   1. Every paintable aircraft's regions, the planes' and the combat
 *      aircraft's: what each builder draws a region in is the
 *      stock colour configs/liveries.js says, and painting a model and
 *      putting it back on stock returns every material to the very colour
 *      it was built in, the stock look exact.
 *   2. The Timber, the whole way: the picker, Customise (C), the Power tab
 *      (a power option and pack when configs/power.js offers them), a
 *      preset scheme and a colour of the pilot's own on one region, Save;
 *      then flown, the flown craft's materials in those colours (and the
 *      plant on the chosen power); swapped away and back, still in them;
 *      the page reloaded, still in them.
 *   3. The Kadet from the pause menu, seated and flying: a scheme of
 *      transparent film and a film colour of the pilot's own, saved into
 *      the air where it is, in place.
 *   4. Reset to stock from the hangar puts the Timber back in its kit's
 *      colours and leaves nothing stored.
 *   5. The side panel's layout at 1280x720, 1600x900, 1920x1080 and a phone
 *      on its side, on the Kadet (4 engines, 2 tanks) and the Skyhunter (5
 *      motors, 5 packs), every tab and every page of Colours: no readout wraps onto a second line or
 *      overflows its tile, and the panel's last line (the source line on
 *      Power) is fully in view, without scrolling where it fits, otherwise
 *      once Down from the panel's last control has scrolled it to its end.
 *      The Kadet's Power tab fits with no scroll at 1600x900 and above.
 *   6. The Timber's Tuning tab (src/ui/hangar-tuning.js): the battery slid
 *      forward and lead in the nose move the CG on the tab and on the
 *      model's mark; low rates, more elevator expo, a click of up trim,
 *      takeoff flaps and the flap mix off; the test stand runs the motor
 *      (the plant's thrust, rpm and current live, the prop turning on the
 *      model, the motor's voice on the audio) and runs the pack down;
 *      Save stores exactly that setup, flying seats configs/tuning.js's
 *      block for it in the plant with the flaps at takeoff, a reload keeps
 *      it and flies it again; and a plane nobody tuned (the Kadet) flies
 *      its table's own throws with nothing seated.
 *   7. The Parts tab on the Cub: tundra tyres, the camera pod, the lights,
 *      the smoke system and a three blade prop on the model before Save,
 *      stored by it; flown, the model and the plant (sim_addons_state)
 *      both carry them and O turns the smoke on and off; a wing broken in
 *      the air is shown broken in the hangar, taped, saved into the air,
 *      and the plant flies the tape's mass, after a reset too.
 *   8. The paint shop on the Timber: a race number and racing stripes
 *      placed by aiming at the model, chrome on the wing, the livery saved
 *      by name, copied as a code, the plane reset and the code imported
 *      back whole (and a bad code refused whole); delete asks and starts
 *      on Keep; saved and flown, the flying model wears the chrome and the
 *      decals, at a counted cost in draw calls; reloaded, all of it kept.
 *      And the Kadet: a number printed on its film, and a painted film
 *      that stops the sun until its kit finish comes back. And the Cub the
 *      Parts step fitted, tundra tyres and a taped wing: a number and a
 *      stripe land on its skin whichever of parts and paint goes on first,
 *      and never on a tyre, the pod or the tape.
 *   9. The Floats switch on the picker: beside the Timber's span and
 *      weight, a role switch, and on no plane without a float version. F
 *      flips it, the model and the weight follow, Choose seats
 *      timber1500f, the hangar reads the same toggle; a click flips it
 *      back and Choose seats timber1500; a flip put away with Escape on
 *      the seated plane follows the seat again; a pad's Y flips the Cub's.
 *  10. The Engine switch on the picker: beside the Striker's span and
 *      weight, its engine, on one card, and on no aircraft with one. E
 *      switches it to the turbojet, the weight and the model follow and it
 *      is saved where the Loadout tab saves it; Customise opens on the
 *      turbojet; Enter seats it; a reload keeps it; a click and a pad's Y
 *      switch it; a switch of the seated Striker put away with Escape is
 *      undone; and E and Enter in the air refit the flying Striker on the
 *      turbojet's plant.
 *  11. The combat aircraft's paint: the Striker from the picker, its
 *      Customise on the Loadout tab, then Colours: the test scheme and a
 *      colour of the pilot's own on the engine and a number aimed onto its
 *      side, worn by the hangar's model before Save; the livery saved by
 *      name and its code imported back whole; stored, worn by the
 *      picker's; flown on one engine and refitted in the air on the
 *      other, the flying
 *      model in it, decal and all, on both. And the 7 inch the same way, a
 *      two tone with its own colour on the frame and a stripe aimed onto
 *      its top, worn when it is swapped in in the air.
 * And no console error or uncaught exception anywhere.
 *
 *   node scripts/hangar-check.js [map]     alps by default
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { sizeText, weightText } from '../src/ui/carousel.js';
import { str } from '../src/strings/index.js';
import { AIRFRAMES, airframeById } from '../configs/airframes.js';
import { LIVERIES, coloursFor, liveryKey, paintable, regionsFor, schemesFor } from '../configs/liveries.js';
import { POWER, SIM_POWER, powerBlock, powerChoice } from '../configs/power.js';
import { ESTIMATES } from '../configs/power-estimates.js';
import { normalizeEntry, setupFor, tuneBlock } from '../configs/tuning.js';
import { SIM_ADDON, addonParams } from '../configs/hangar-parts.js';
import { PROP_ESTIMATES } from '../configs/prop-estimates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const map = process.argv[2] || 'alps';

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* The same, whatever order the keys were written in. */
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const alike = (a, b) => same(canon(a), canon(b));
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'timber1500');
s.map = map;
s.graphics = 'low';
s.flightMode = 'angle';
s.fpsCap = 0;
s.airframeAsked = true;
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.hangarCheckSeeded) {
    Object.assign(s, ${JSON.stringify(s)}, { hangarCheckSeeded: true });
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* storage refused */ }`];

function faults(page) {
  return page.errors.filter((e) => !e.startsWith('network:'));
}

async function ready(page) {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
}

/* Every plane built on its own in the page, from the builders the shell
 * uses: its regions' stock colours, and a paint and back. */
async function regionsCheck(page) {
  console.log('1. every paintable aircraft\'s regions');
  const ids = AIRFRAMES.filter((a) => paintable(a.id)).map((a) => a.id);
  const got = await page.evaluate(`(async () => {
    const { craftBuilderFor } = await import('/src/render/craft.js');
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    const out = {};
    for (const id of ${JSON.stringify(ids)}) {
      const craft = craftBuilderFor(id)({ name: 'hangar-check', fog: false });
      const mats = [];
      craft.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.color && !mats.includes(o.material)) mats.push(o.material);
      });
      const maps = mats.map((m) => m.map);
      const before = mats.map((m) => m.color.getHex());
      const stock = Object.fromEntries(Object.entries(craft.livery.stock()).map(([k, v]) => [k, hex(v)]));
      const odd = Object.fromEntries(Object.keys(craft.livery.stock()).map((k, i) => [k, 0x102030 + i * 0x111111]));
      craft.livery.set(odd);
      const painted = Object.fromEntries(Object.entries(craft.livery.read()).map(([k, v]) => [k, hex(v)]));
      const moved = mats.filter((m, i) => m.color.getHex() !== before[i] || m.map !== maps[i]).length;
      craft.livery.set({});
      const back = mats.every((m, i) => m.color.getHex() === before[i] && m.map === maps[i]);
      out[id] = { stock, painted, odd: Object.fromEntries(Object.entries(odd).map(([k, v]) => [k, hex(v)])), moved, back };
    }
    return out;
  })()`);
  for (const id of ids) {
    const g = got[id];
    const want = Object.fromEntries(regionsFor(id).map((r) => [r.id, r.stock]));
    say(same(sorted(g.stock), sorted(want)), `${id}: the model's regions and their stock colours are the config's: ${JSON.stringify(g.stock)}`);
    say(same(sorted(g.painted), sorted(g.odd)) && g.moved > 0 && g.back,
      `${id}: painted, ${g.moved} material(s) change, every region reads its new colour, and stock puts every material back as built`);
  }
}

async function openHangarFromPicker(page, id) {
  await page.evaluate("window.__ui.openCraftRow(false); true");
  await page.until('window.__ui.carousel.isOpen', 10000);
  const at = await page.evaluate(`window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})`);
  await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
}

/* An expression true once the picker's model of `id` wears `want`. */
const wears = (id, want) => `(() => { const p = window.__pickPaint(${JSON.stringify(id)}); const w = ${JSON.stringify(want)}; return Boolean(p) && Object.keys(w).every((k) => p[k] === w[k]); })()`;

const click = (key) => `(() => { const b = document.querySelector('.hangar [data-key="${key}"]'); if (!b) throw new Error('no ${key}'); b.click(); return true; })()`;

/* The power tab: a non stock option and pack when there are any. Returns
 * what was chosen, or null when the stock setup is the only one. */
async function choosePower(page) {
  const opts = await page.evaluate("window.__ui.hangar.power.options.map((o) => ({ id: o.id, packs: (o.packs || []).map((p) => p.id) }))");
  if (opts.length < 2 && !(opts[0] && opts[0].packs.length > 1)) {
    say(true, `the Power tab offers the stock setup only (${opts.map((o) => o.id).join(', ')}): no power options in this build`);
    return null;
  }
  const o = opts.length > 1 ? opts[1] : opts[0];
  await page.evaluate(click(`option-${o.id}`));
  let pack = null;
  if (o.packs.length) {
    pack = o.packs[o.packs.length - 1];
    await page.evaluate(click(`pack-${pack}`));
  }
  const choice = await page.evaluate('window.__ui.hangar.choice');
  say(choice.option === o.id && choice.pack === pack, `the Power tab takes option ${o.id} and pack ${pack}`);
  /* Every option and pack configs/power.js has, and the readouts counting
   * up to this plane's numbers for the choice: its weight from the power
   * block, its top speed and flight time from configs/power-estimates.js. */
  const want = POWER.timber1500.map((x) => ({ id: x.id, packs: x.packs.map((p) => p.id) }));
  say(same(opts, want), `the Power tab lists every option and pack: ${JSON.stringify(opts)}`);
  const e = ESTIMATES.timber1500[o.id][pack];
  const grams = Math.round(powerBlock('timber1500', o.id, pack)[1] * 1000);
  await page.until(`(() => { const c = window.__ui.hangar.counts; return c.minutes && c.minutes.shown === c.minutes.to && c.grams.shown === c.grams.to; })()`, 10000).catch(() => {});
  const counts = await page.evaluate('(() => { const c = window.__ui.hangar.counts; return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { to: v.to, shown: v.shown }])); })()');
  const shown = await page.evaluate("[...document.querySelectorAll('.hangar-stat')].map((b) => b.textContent)");
  say(counts.minutes && counts.minutes.shown === e.minutes && counts.topSpeed.shown === e.topSpeed && counts.grams.shown === grams,
    `the readouts count up to ${grams} g, ${e.topSpeed} m/s and ${e.minutes} min at cruise: ${JSON.stringify(shown)}`);
  return choice;
}

/* The side panel as laid out: each readout's lines and overflow, the tab's
 * last line against the panel's box, and how far the panel scrolls. */
const LAYOUT = `(() => {
  const side = document.querySelector('.hangar-side');
  const s = side.getBoundingClientRect();
  const last = side.querySelector('.hangar-tab').lastElementChild;
  const l = last.getBoundingClientRect();
  return {
    values: [...side.querySelectorAll('.hangar-stat-value')].map((v) => ({
      text: v.textContent,
      lines: v.getBoundingClientRect().height / parseFloat(getComputedStyle(v).lineHeight),
      overflow: v.scrollWidth - v.clientWidth,
    })),
    last: { cls: last.className, text: last.textContent, above: l.top - s.top, below: s.bottom - l.bottom },
    over: side.scrollHeight - side.clientHeight,
    scrollTop: side.scrollTop,
  };
})()`;
const SETTLED = "document.querySelector('.hangar-side').getAnimations({ subtree: true }).every((a) => a.playState === 'finished') && !document.querySelector('.hangar').classList.contains('entering')";
const SIZES = [[1280, 720], [1600, 900], [1920, 1080], [844, 390]];

async function layoutCheck(page) {
  console.log('5. the side panel\'s layout on the Kadet and the Skyhunter, every tab and page');
  for (const [w, h] of SIZES) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, page.sessionId);
    for (const id of ['kadet1981', 'sky1800']) {
      await openHangarFromPicker(page, id);
      /* Every tab, and the Colours tab's three pages (src/ui/hangar-paint.js). */
      for (const [tab, page2] of [['power'], ['colours', 'paint'], ['colours', 'decals'], ['colours', 'saved'], ['tuning'], ['parts']]) {
        if (tab !== 'power' && !(tab === 'colours' && page2 !== 'paint')) {
          await page.tap('KeyE');
          await page.until(`window.__ui.hangar.tab === '${tab}'`, 5000);
        }
        if (page2 && page2 !== 'paint') {
          await page.evaluate(click(`page-${page2}`));
          await page.until(`window.__ui.hangar.shop.page === '${page2}'`, 5000);
        }
        await page.until(SETTLED, 10000);
        const at = `${w}x${h} ${id} ${tab}${page2 ? ` ${page2}` : ''}`;
        let m = await page.evaluate(LAYOUT);
        if (tab === 'power') {
          const wrapped = m.values.filter((v) => Math.abs(v.lines - 1) > 0.05 || v.overflow > 0);
          say(m.values.length === 4 && wrapped.length === 0,
            `${at}: the four readouts sit on one line each and fit their tiles: ${m.values.map((v) => `"${v.text}"`).join(', ')}${wrapped.length ? `; wrapped or overflowing: ${JSON.stringify(wrapped)}` : ''}`);
          say(m.last.cls === 'hangar-source', `${at}: the panel ends with the source line: "${m.last.text}"`);
        }
        if (m.over <= 0) {
          say(m.last.below >= 0 && m.last.above >= 0, `${at}: fits with no scroll, the last line ${m.last.below.toFixed(0)} px above the panel's edge`);
        } else {
          /* Down from the panel's last control scrolls it to its end. */
          const was = m.over;
          await page.evaluate("(() => { const b = [...document.querySelectorAll('.hangar-side button')].pop(); b.focus(); return true; })()");
          await page.tap('ArrowDown');
          await page.until("(() => { const s = document.querySelector('.hangar-side'); return s.scrollTop + s.clientHeight >= s.scrollHeight - 1; })()", 5000).catch(() => {});
          m = await page.evaluate(LAYOUT);
          say(m.scrollTop >= was - 1 && m.last.below >= 0 && m.last.above >= 0,
            `${at}: ${was} px over, Down from the last control scrolls the panel ${m.scrollTop.toFixed(0)} px to its end and the last line is ${m.last.below.toFixed(0)} px above the panel's edge`);
        }
        if (id === 'kadet1981' && tab === 'power' && h >= 900) {
          say(m.over <= 0, `${at}: the Kadet's Power tab fits with no scroll (${m.over} px over)`);
        }
      }
      await page.evaluate('window.__ui.hangar.cancel(); true');
      await page.until('!window.__ui.hangar.isOpen', 5000);
      await page.evaluate('window.__ui.carousel.close(); true');
    }
  }
}

/*
 * 7. The Parts tab on the Cub, the whole way: the tab, tundra tyres, the
 * camera pod, the lights, the smoke system and the three blade prop on
 * the model before Save; saved; flown, the model and the plant both
 * carrying them and the smoke on and off with O; a wing broken in the
 * air, shown broken in the hangar, taped, and flown taped.
 */
async function partsCheck(page) {
  console.log('7. the Parts tab: fit the Cub, fly it, break a wing, tape it, fly it');
  const id = 'cub1400';
  const fit = ['tundra', 'pod', 'lights', 'smoke'];
  const prop = '11x7e-3';
  await openHangarFromPicker(page, id);
  await page.evaluate(click('tab-parts'));
  await page.until("window.__ui.hangar.tab === 'parts'", 5000);
  const cards = await page.evaluate("[...document.querySelectorAll('.hangar-side [data-key]')].map((b) => b.dataset.key)");
  say(['prop-stock', `prop-${prop}`, 'prop-11x55e', ...fit.map((a) => `addon-${a}`)].every((k) => cards.includes(k)) && !cards.includes('addon-floats'),
    `the Parts tab offers the Cub's props and its add-ons, and the floats are not a part: ${cards.join(', ')}`);
  const toggle = await page.evaluate(`(() => {
    const b = document.querySelector('.hangar-facts [data-key="floats"]');
    /* The milestone pips share the facts' pill (hangar.js) but are not a
     * fact: the toggle sits beside the span and the weight. */
    return b ? { on: b.getAttribute('aria-checked'), beside: [...b.parentNode.children].filter((c) => c.classList.contains('carousel-fact') && !c.classList.contains('hangar-milestones')).map((c) => c.textContent) } : null;
  })()`);
  say(Boolean(toggle) && toggle.on === 'false' && same(toggle.beside, [sizeText(id), weightText(id)]),
    `the Cub on its wheels has the Floats toggle, off, beside its span and weight: ${JSON.stringify(toggle)}`);
  for (const a of fit) {
    await page.evaluate(click(`addon-${a}`));
  }
  await page.evaluate(click(`prop-${prop}`));
  const wantEntry = { prop, addons: fit, damage: null };
  const onModel = `(() => { const f = window.__pickParts(${JSON.stringify(id)}); return Boolean(f) && f.blades && f.blades.count === 3 && ${JSON.stringify(fit)}.every((a) => f.addons.includes(a)); })()`;
  await page.until(onModel, 30000).catch(() => {});
  const shown = await page.evaluate(`window.__pickParts(${JSON.stringify(id)})`);
  say(shown && shown.blades && shown.blades.count === 3 && same(shown.addons, fit),
    `the model in the hangar wears them before Save: ${JSON.stringify(shown)}`);
  const stats = await page.evaluate("[...document.querySelectorAll('.parts-stats .hangar-stat-value')].map((v) => v.textContent)");
  const b = addonParams(id, wantEntry, POWER[id][0], powerBlock(id, 'stock', POWER[id][0].pack)[SIM_POWER.MASS]);
  say(stats[0] === `+${Math.round(b[SIM_ADDON.MASS] * 1000).toLocaleString('en')} g`, `the tab reads what they add: ${stats.join(', ')}`);
  await page.evaluate('window.__ui.hangar.saveBtn.click(); true');
  await page.until('!window.__ui.hangar.isOpen', 5000);
  const stored = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).parts`);
  say(same(stored && stored[id], wantEntry), `Save stores them: ${JSON.stringify(stored)}`);
  await page.evaluate('window.__ui.carousel.close(); true');

  /* Fly it: a hot swap to the Cub from the flight the shell is in. */
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await page.evaluate(`window.__ui.swapTo(${JSON.stringify(id)}).then(() => true)`);
  await page.until(`window.__craft().run === ${JSON.stringify(id)}`, 30000);
  await page.sleep(500);
  const est = PROP_ESTIMATES[id].stock[prop];
  const base = powerBlock(id, 'stock', POWER[id][0].pack)[SIM_POWER.MASS];
  let c = await page.evaluate('window.__craft()');
  say(c.addons && c.addons.on && Math.abs(c.addons.massKg - (base + b[SIM_ADDON.MASS])) < 1e-9 && c.addons.cda === b[SIM_ADDON.CDA]
    && c.addons.wheelR === 0.054 && c.addons.thrustN === est.thrustN,
  `flown, the plant carries them: ${(c.addons.massKg * 1000).toFixed(1)} g, ${(c.addons.cda * 1e4).toFixed(2)} cm^2, tyres ${c.addons.wheelR} m, ${c.addons.thrustN} N static`);
  say(c.parts && c.parts.blades && c.parts.blades.count === 3 && same(c.parts.addons, fit), `and the flown model shows them: ${JSON.stringify(c.parts)}`);
  say(c.bladeScale === 1.5, `and the motor's blade pass is three blades' over the kit's two: x${c.bladeScale}`);

  /* The smoke, O, in the air: launch it off the strip first. */
  await page.tap('KeyO');
  await page.sleep(1500);
  c = await page.evaluate('window.__craft()');
  const smokeOn = c.smoke;
  await page.tap('KeyO');
  await page.sleep(300);
  const smokeOff = (await page.evaluate('window.__craft()')).smoke;
  say(smokeOn.on && !smokeOff.on, `O turns the smoke on and off: ${JSON.stringify(smokeOn)} then ${JSON.stringify(smokeOff)}`);

  /* A wing broken off in the air (crash damage is on by default). */
  const table = await page.evaluate('window.__crashTable ? window.__crashTable() : null');
  const wing = table ? table.findIndex((p) => p.kindName === 'wing' && p.cg[1] > 0) : -1;
  say(wing > 0, `the Cub's left wing is part ${wing}`);
  await page.evaluate(`window.__crashBreak(${wing})`);
  await page.until(`(() => { const p = window.__ui.settings.parts[${JSON.stringify(id)}]; return Boolean(p && p.damage && p.damage.parts.some((q) => q.i === ${wing})); })()`, 20000).catch(() => {});
  const rec = await page.evaluate(`window.__ui.settings.parts[${JSON.stringify(id)}]`);
  say(rec && rec.damage && rec.damage.parts.some((q) => q.i === wing && q.state === 'broken'), `the break is recorded for the hangar: ${JSON.stringify(rec && rec.damage && rec.damage.parts)}`);
  await page.tap('KeyR');
  await page.sleep(500);

  /* The hangar from the pause menu: the wing broken on the model. */
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000);
  const row = await page.evaluate("window.__ui.items().findIndex((it) => it.action === 'customise')");
  await page.evaluate(`window.__ui.setCursor(${row}); true`);
  await page.tap('Enter');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await page.evaluate(click('tab-parts'));
  await page.until("window.__ui.hangar.tab === 'parts'", 5000);
  await page.until(`(() => { const f = window.__pickParts(${JSON.stringify(id)}); return Boolean(f) && f.glowTris > 0; })()`, 30000).catch(() => {});
  const broken = await page.evaluate(`window.__pickParts(${JSON.stringify(id)})`);
  const rowText = await page.evaluate("[...document.querySelectorAll('.parts-damage-row')].map((r) => r.textContent)");
  say(broken && broken.glowTris > 0 && rowText.some((t) => t.includes('Wing, left') && t.includes('Broken')),
    `the hangar shows the wing broken: ${broken ? broken.glowTris : 0} triangles glowing, rows ${JSON.stringify(rowText)}`);
  await page.evaluate(click(`tape-${wing}`));
  await page.until(`(() => { const f = window.__pickParts(${JSON.stringify(id)}); return Boolean(f) && f.tapeTris > 0 && f.glowTris === 0; })()`, 30000).catch(() => {});
  const taped = await page.evaluate(`window.__pickParts(${JSON.stringify(id)})`);
  say(taped && taped.tapeTris > 0 && taped.glowTris === 0 && taped.taped.includes(wing), `taped, the model shows the tape and no break: ${JSON.stringify(taped)}`);
  const before = (await page.evaluate('window.__craft()')).addons.massKg;
  await page.evaluate('window.__ui.hangar.saveBtn.click(); true');
  await page.until('!window.__ui.hangar.isOpen', 5000);
  await page.sleep(500);
  c = await page.evaluate('window.__craft()');
  say(c.addons.massKg > before && c.parts && c.parts.taped.includes(wing) && c.parts.tapeTris > 0,
    `saved into the air, the Cub flies with the tape: ${(before * 1000).toFixed(1)} g to ${(c.addons.massKg * 1000).toFixed(1)} g, the flown model taped`);
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'flight'", 10000).catch(() => {});
  await page.tap('KeyR');
  await page.sleep(500);
  const after = await page.evaluate('window.__craft()');
  say(after.addons.massKg === c.addons.massKg, `and after a reset it still does: ${(after.addons.massKg * 1000).toFixed(1)} g`);
}

const TUNE_STATE = '(async () => (await import("/src/ui/hangar-tuning.js")).tuningState())()';
const TUNING_TAB = '(window.__ui.hangar.frame() || { hangar: { tabs: {} } }).hangar.tabs.tuning';
const WANT_TUNE = { packMm: 10, ballastG: 20, rate: 'low', expo: { e: 35 }, trimDeg: 1, flapStart: 1, flapMix: false };

/* The block the plant should hold for the Timber's stored setup, on its
 * stored power. */
function wantBlock(settings) {
  const set = setupFor('timber1500', powerChoice('timber1500', settings.power));
  return Array.from(tuneBlock('timber1500', normalizeEntry('timber1500', settings.tuning.timber1500, set.limits), set.massKg, set.packKg));
}

async function tuningCheck(page) {
  console.log('6. the Timber\'s Tuning tab, its test stand, Save, fly, reload');
  await openHangarFromPicker(page, 'timber1500');
  await page.evaluate(click('tab-tuning'));
  await page.until("window.__ui.hangar.tab === 'tuning'", 5000);
  const cg0 = await page.evaluate(`${TUNING_TAB}.cg.shift`);
  const text0 = await page.evaluate("document.querySelector('.tn-cg-value').textContent");
  for (const k of ['pack-inc', 'pack-inc', 'lead-inc', 'lead-inc', 'lead-inc', 'lead-inc']) {
    await page.evaluate(click(k));
  }
  const cg1 = await page.evaluate(`${TUNING_TAB}.cg.shift`);
  const text1 = await page.evaluate("document.querySelector('.tn-cg-value').textContent");
  say(cg0 === 0 && cg1 > 0 && text1 !== text0,
    `the battery 10 mm forward and 20 g of nose lead move the CG ${(cg1 * 1000).toFixed(2)} mm forward: "${text0}" to "${text1}", and the model's mark with it`);
  await page.evaluate(click('tuning-rates'));
  for (const k of ['rate-low', 'expo-e-inc', 'trim-inc', 'trim-inc', 'trim-inc', 'trim-inc', 'flap-1', 'mix-off']) {
    await page.evaluate(click(k));
  }
  const surf = await page.evaluate(`${TUNING_TAB}.surfaces`);
  say(Array.isArray(surf) && surf.length === 4, `the Rates page sweeps the model's surfaces: ${JSON.stringify(surf && surf.map((x) => +x.toFixed(3)))}`);
  const st = await page.evaluate(TUNE_STATE);
  say(same(st.entry, { packMm: 10, ballastG: 20, rate: 'low', expo: { a: 30, e: 35, r: 30 }, trimDeg: 1, flapStart: 1, flapMix: false }),
    `the tab holds the setup: ${JSON.stringify(st.entry)}`);

  await page.evaluate(click('tuning-stand'));
  await page.evaluate(click('throttle-inc'));
  await page.evaluate(click('stand-run'));
  await page.until(`(async () => { const s = await ${TUNE_STATE}; return Boolean(s.reading && s.reading.thrustN > 0); })()`, 60000);
  await page.sleep(500);
  const run = await page.evaluate(TUNE_STATE);
  const rpmOnModel = await page.evaluate(`${TUNING_TAB}.rpm`);
  const audio = await page.evaluate('window.__craft().standAudio');
  const r = run.reading;
  say(r.thrustN > 1 && r.currentA > 1 && r.rpm > 1000 && r.volts > 14,
    `the stand runs the motor at ${Math.round(run.throttle * 100)} percent: ${r.thrustN.toFixed(2)} N, ${r.currentA.toFixed(1)} A, ${Math.round(r.rpm)} rpm, ${r.volts.toFixed(2)} V`);
  say(rpmOnModel === r.rpm || rpmOnModel > 1000, `the prop turns on the model at the stand's ${Math.round(rpmOnModel)} rpm`);
  say(audio.voice === 'wing' && audio.rpm > 1000, `the motor's voice plays it: ${JSON.stringify(audio)}`);
  await page.evaluate(click('stand-run'));
  await page.evaluate(click('stand-measure'));
  await page.until(`(async () => (await ${TUNE_STATE}).endurance != null)()`, 180000).catch(() => {});
  const run2 = await page.evaluate(TUNE_STATE);
  say(run2.endurance && run2.endurance.seconds > 60, `run down at ${Math.round(run.throttle * 100)} percent the pack lasts ${run2.endurance ? (run2.endurance.seconds / 60).toFixed(1) : '?'} min (${run2.endurance && run2.endurance.why})`);
  const quiet = await page.evaluate('window.__craft().standAudio');
  say(quiet.voice === null, `stopped, the flown craft's voice is back: ${JSON.stringify(quiet)}`);

  await page.evaluate("window.__ui.hangar.saveBtn.click(); true");
  await page.until('!window.__ui.hangar.isOpen', 5000);
  const stored = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).tuning`);
  say(same(stored, { timber1500: WANT_TUNE }), `Save stores it: ${JSON.stringify(stored)}`);
  await page.tap('Escape');
  const settings = await page.evaluate('window.__ui.settings');
  const want = wantBlock(settings);
  await page.evaluate("window.__ui.settings.airframe = 'timber1500'; window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__craft().run === 'timber1500'", 400000);
  const flown = await page.evaluate('window.__craft()');
  say(same(flown.tune, want) && flown.flapNotch === 1,
    `flown, the plant holds its block: CG ${(flown.tune[0] * 1000).toFixed(2)} mm forward, throws ${flown.tune.slice(3, 6).map((x) => (x * 180 / Math.PI).toFixed(1)).join(', ')} deg, elevator expo ${flown.tune[7]}, trim ${(flown.tune[9] * 180 / Math.PI).toFixed(2)} deg, mix ${flown.tune[10]}; flaps at notch ${flown.flapNotch}`);
  await page.evaluate("window.__ui.swapTo('kadet1981').then(() => true)");
  await page.until("window.__craft().run === 'kadet1981'", 30000);
  const kadet = await page.evaluate('window.__craft()');
  say(kadet.tune && kadet.tune[0] === 0 && kadet.tune[1] === 0 && kadet.tune[9] === 0 && Math.abs(kadet.tune[4] * 180 / Math.PI - 14.4775) < 1e-9,
    `the Kadet, which nobody tuned, flies its table: ${JSON.stringify(kadet.tune.map((x) => +x.toFixed(4)))}`);

  console.log('   reload');
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await ready(page);
  const kept = await page.evaluate('window.__ui.settings.tuning');
  say(same(kept, { timber1500: WANT_TUNE }), `after a reload the setup is kept: ${JSON.stringify(kept)}`);
  await page.evaluate("window.__ui.settings.airframe = 'timber1500'; window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__craft().run === 'timber1500'", 400000);
  const again = await page.evaluate('window.__craft()');
  say(same(again.tune, want), 'and flown again the plant holds the same block');
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000);
  await page.evaluate("window.__ui.show('title'); true");
}

/* Fly, and be in the Timber: the Parts step leaves the Cub seated, and
 * the seat is changed by a swap, not by writing the setting. */
async function flyTimber(page) {
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  if (await page.evaluate("window.__craft().run !== 'timber1500'")) {
    await page.evaluate("window.__ui.swapTo('timber1500').then(() => true)");
    await page.until("window.__craft().run === 'timber1500'", 30000);
  }
}

/* Put a decal of `kind` where the stage's middle lands on the model in
 * `view`: the aim moved there and Enter pressed, the keyboard's way.
 * `facing` is a test of the hit's normal that is true once the camera has
 * swung round to the view: a frame on this rasteriser is slow, and the
 * camera's springs step on the frame's clock. */
async function placeDecal(page, kind, view, facing) {
  await page.evaluate(click(`view-${view}`));
  const before = await page.evaluate('(window.__ui.hangar.entry.decals || []).length');
  await page.evaluate(click('decal-add'));
  await page.evaluate(click(`kind-${kind}`));
  await page.until('Boolean(window.__ui.hangar.shop.placing)', 5000);
  await page.until(`(() => { const p = window.__ui.hangar.shop.placing; const n = p && p.hit && p.hit.n; return Boolean(n) && (${facing}); })()`, 60000);
  await page.tap('Enter');
  await page.until(`(window.__ui.hangar.entry.decals || []).length === ${before + 1}`, 20000);
  return page.evaluate(`window.__ui.hangar.entry.decals[${before}]`);
}

/*
 * 8. THE PAINT SHOP on the Timber: a race number on the fuselage's side
 * and racing stripes over the wing, placed by aiming at the model; chrome
 * on the wing; the livery saved by name, its code copied, the plane reset
 * to stock and the code imported back, the same livery; saved and flown,
 * the flying model's wing in chrome and the decals drawn on it, at a cost
 * in draw calls; the page reloaded, all of it still there. And the Kadet
 * with a number on its film.
 */
async function paintShopCheck(page) {
  console.log('8. the paint shop: decals, a finish, a saved livery, its code, flown and reloaded');
  /* From the title, whatever the step before left flying. */
  if (await page.evaluate("window.__ui.screen === 'flight'")) {
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
  }
  await page.evaluate("window.__ui.show('title'); true");
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId);
  await openHangarFromPicker(page, 'timber1500');
  await page.tap('KeyE');
  await page.until("window.__ui.hangar.tab === 'colours'", 5000);
  await page.evaluate(click('page-decals'));
  const num = await placeDecal(page, 'num', 'side_left', 'n[0] < -0.8');
  say(num && num.k === 'num' && num.t === '7' && num.n[0] < -0.5 && num.m,
    `aimed at the left side, Enter puts a race number 7 on the fuselage, facing out (normal ${JSON.stringify(num && num.n)}), on both sides`);
  const stripe = await placeDecal(page, 'stripe', 'top', 'n[1] > 0.8');
  say(stripe && stripe.k === 'stripe' && stripe.n[1] > 0.7, `aimed from the top, racing stripes on the wing's top skin (normal ${JSON.stringify(stripe && stripe.n)})`);
  /* Turned to run nose to tail, and stretched out. */
  await page.evaluate(click('turn-up'));
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate(click('turn-up'));
  }
  await page.evaluate(click('stretch-up'));
  const turned = await page.evaluate('window.__ui.hangar.entry.decals[1]');
  say(turned.r === 90 || turned.r === 105, `the turn steps the stripe round to ${turned.r} degrees`);

  await page.evaluate(click('page-paint'));
  await page.evaluate(click('region-wing'));
  await page.evaluate(click('finish-chrome'));
  const shown = await page.evaluate("(async () => { for (let i = 0; i < 100; i += 1) { const l = window.__pickLook('timber1500'); if (l && l.finishes.wing === 'chrome' && l.decals.decals === 2) return l; await new Promise((r) => setTimeout(r, 100)); } return window.__pickLook('timber1500'); })()");
  say(shown.finishes.wing === 'chrome' && shown.finishes.fuselage === 'kit' && shown.decals.decals === 2 && shown.decals.meshes > 0,
    `the hangar's model wears it before it is saved: wing ${shown.finishes.wing}, 2 decals as ${shown.decals.meshes} mesh(es), ${shown.decals.triangles} triangles`);
  const wanted = await page.evaluate('JSON.parse(JSON.stringify(window.__ui.hangar.entry))');

  await page.evaluate(click('page-saved'));
  await page.evaluate(click('saved-new'));
  await page.evaluate("(() => { const f = document.querySelector('.hangar [data-key=\"name-field\"]'); f.value = 'Race 7'; f.dispatchEvent(new Event('input')); return true; })()");
  await page.evaluate(click('name-save'));
  const lib = await page.evaluate('window.__ui.settings.liverySaves.timber1500');
  say(lib && lib.length === 1 && lib[0].name === 'Race 7' && alike(lib[0].entry, wanted), `Save this livery keeps it by name at once: ${lib && lib.map((x) => x.name)}`);
  await page.evaluate(click('code-copy'));
  const code = await page.evaluate("document.querySelector('.hangar [data-key=\"code-out\"]').value");
  say(/^FPV1-[A-Za-z0-9_-]+$/.test(code), `Copy code gives the livery as a code of ${code.length} characters`);

  await page.evaluate(click('reset'));
  const bare = await page.evaluate('JSON.stringify(window.__ui.hangar.entry)');
  say(bare === '{}', 'Reset to stock takes the decals and the finish off too');
  await page.evaluate(click('code-paste'));
  await page.evaluate("(() => { const f = document.querySelector('.hangar [data-key=\"code-field\"]'); f.value = 'FPV1-bm90IGEgbGl2ZXJ5'; f.dispatchEvent(new Event('input')); return true; })()");
  await page.evaluate(click('code-import'));
  const refused = await page.evaluate("(() => { const e = document.querySelector('.hangar .paint-error'); return { text: e ? e.textContent : '', entry: JSON.stringify(window.__ui.hangar.entry) }; })()");
  say(refused.text.length > 0 && refused.entry === '{}', `a code that is not a livery is refused and nothing of it is used: "${refused.text}"`);
  await page.evaluate(`(() => { const f = document.querySelector('.hangar [data-key="code-field"]'); f.value = ${JSON.stringify(code)}; f.dispatchEvent(new Event('input')); return true; })()`);
  await page.evaluate(click('code-import'));
  const imported = await page.evaluate('JSON.parse(JSON.stringify(window.__ui.hangar.entry))');
  const lib2 = await page.evaluate('window.__ui.settings.liverySaves.timber1500.map((x) => x.name)');
  say(alike(imported, wanted) && lib2.length === 2, `the code imported back is the same livery, on the plane and saved as ${JSON.stringify(lib2)}`);
  /* Delete asks first, and the answer the cursor starts on is Keep. */
  await page.evaluate(click('delete-1'));
  const asked = await page.evaluate("document.activeElement && document.activeElement.dataset.key");
  await page.tap('Enter');
  const kept = await page.evaluate('window.__ui.settings.liverySaves.timber1500.length');
  say(asked === 'keep-1' && kept === 2, `Delete asks, the cursor starts on ${asked}, and Enter there keeps it (${kept} saved)`);
  await page.evaluate(click('delete-1'));
  await page.evaluate(click('really-1'));
  const left = await page.evaluate('window.__ui.settings.liverySaves.timber1500.map((x) => x.name)');
  say(same(left, ['Race 7']), `confirmed, it is deleted: ${JSON.stringify(left)}`);

  await page.evaluate('window.__ui.hangar.saveBtn.click(); true');
  await page.until('!window.__ui.hangar.isOpen', 5000);
  const stored = await page.evaluate('window.__ui.settings.livery.timber1500');
  say(alike(stored, wanted), 'Save stores the livery with its finish and decals');
  /* The picker comes back on the plane once the save has repainted it;
   * it is shut after that, or it would come up over the flight. */
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate('window.__ui.carousel.close(); true');

  /* Flown: the decals on the flying model, and what they cost a frame. */
  await flyTimber(page);
  await page.until("window.__craftPaint().id === 'timber1500' && window.__craftPaint().decals.decals === 2", 60000).catch(() => {});
  const flown = await page.evaluate('window.__craftPaint()');
  say(flown.id === 'timber1500' && flown.finishes.wing === 'chrome' && flown.decals.decals === 2 && flown.decals.meshes > 0,
    `flown, the Timber's wing is chrome and its 2 decals are drawn as ${flown.decals.meshes} mesh(es), ${flown.decals.triangles} triangles`);
  /* The chase camera, which draws the plane: the intro played out, then C
   * until the plane is on screen (the FPV view hides it). */
  await page.until('!window.__intro().holding && !window.__intro().zooming', 60000).catch(() => {});
  for (let i = 0; i < 4 && !(await page.evaluate('window.__intro().quadVisible')); i += 1) {
    await page.tap('KeyC');
    await page.sleep(1200);
  }
  /* Every draw of a decal mesh counted as it happens, over some frames,
   * with the camera parked 4 m off the plane looking at it, so the count
   * does not hang on which camera the pilot left on (in the FPV view the
   * plane is not drawn at all). The colour pass and the outline prepass
   * both draw a decal mesh.
   *
   * THE CAMERA FOLLOWS THE PLANE, every frame. It was parked once, at
   * where the plane stood when the count began, and on the airfield the
   * plane stood still. In the valleys the Timber is as often moving (seen
   * at 28 km/h 7 m up, and at 34 km/h on its wheels), and over forty
   * frames of a loaded software
   * rasteriser it flew out of the parked frame: 0.6 draw calls a frame on
   * the Alps, 0.0 on the Swiss valley, for decals that draw every frame
   * when looked at. So the camera is put back 4 m off it before every
   * frame. */
  const cost = await page.evaluate(`(async () => {
    let aim = null;
    const frames = (n) => new Promise((done) => { let k = 0; const t0 = performance.now(); const step = () => { k += 1; if (aim) aim(); if (k < n) requestAnimationFrame(step); else done((performance.now() - t0) / n); }; requestAnimationFrame(step); });
    const { dressDecals } = await import('/src/render/decals.js');
    const { craftBuilderFor } = await import('/src/render/craft.js');
    const decals = window.__ui.settings.livery.timber1500.decals;
    const fresh = craftBuilderFor('timber1500')({ name: 'cost', fog: false });
    const t0 = performance.now();
    dressDecals(fresh, decals);
    const buildMs = performance.now() - t0;
    const meshes = [];
    window.__mapScene().traverse((o) => { if (o.name === 'paint-decals') meshes.push(o); });
    let draws = 0;
    let tris = 0;
    for (const m of meshes) {
      m.onBeforeRender = () => { draws += 1; tris += m.geometry.attributes.position.count / 3; };
    }
    if (!meshes.length) {
      return { buildMs, meshes: 0, calls: 0, tris: 0, frameCalls: window.__renderStats().calls, why: 'no decal mesh in the scene' };
    }
    const THREE = await import('three');
    const at = new THREE.Vector3();
    aim = () => {
      meshes[0].getWorldPosition(at);
      window.__setCam(at.x + 2.6, at.y + 1.4, at.z + 2.6, at.x, at.y, at.z, 50);
    };
    aim();
    await frames(10);
    draws = 0;
    tris = 0;
    const n = 30;
    await frames(n);
    aim = null;
    window.__setCam(null);
    for (const m of meshes) {
      m.onBeforeRender = () => {};
    }
    const shown = (o) => { for (let p = o; p; p = p.parent) { if (!p.visible) return p.name || p.type; } return 'yes'; };
    return { buildMs, meshes: meshes.length, calls: draws / n, tris: tris / n, frameCalls: window.__renderStats().calls,
      why: { screen: window.__ui.screen, mode: window.__craftState().mode, hangar: window.__ui.hangar.isOpen, carousel: window.__ui.carousel.isOpen, shown: meshes.map(shown), intro: window.__intro() } };
  })()`);
  say(cost.meshes === flown.decals.meshes && cost.calls >= cost.meshes && cost.calls <= 2 * cost.meshes,
    `the decals cost ${cost.calls.toFixed(1)} draw call(s) and ${cost.tris.toFixed(0)} triangles a frame of the ${cost.frameCalls} drawn (${cost.meshes} mesh(es), each drawn at least once and at most in colour and outline), no script a frame, and ${cost.buildMs.toFixed(1)} ms once to project${cost.calls < cost.meshes ? ` ${JSON.stringify(cost.why)}` : ''}`);

  console.log('   reload');
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await ready(page);
  const kept2 = await page.evaluate('({ livery: window.__ui.settings.livery.timber1500, saves: window.__ui.settings.liverySaves })');
  say(alike(kept2.livery, wanted) && kept2.saves.timber1500 && kept2.saves.timber1500[0].name === 'Race 7',
    'after a reload the livery and the saved list are kept');
  await flyTimber(page);
  await page.until('window.__craftPaint().id === window.__craft().run', 60000).catch(() => {});
  await page.until('window.__craftPaint().decals.decals === 2', 30000).catch(() => {});
  const again = await page.evaluate('window.__craftPaint()');
  say(again.id === 'timber1500' && again.finishes.wing === 'chrome' && again.decals.decals === 2,
    `and the ${again.id} flies in it: wing ${again.finishes && again.finishes.wing}, ${again.decals.decals} decals`);

  /* The Kadet: a number on its film, and a painted wing stops the sun. */
  console.log('   the Kadet');
  const kadet = await page.evaluate(`(async () => {
    const { craftBuilderFor } = await import('/src/render/craft.js');
    const { dressLivery } = await import('/src/render/livery.js');
    const { readDecals } = await import('/src/render/decals.js');
    const { readFinish } = await import('/src/render/finish.js');
    const { newDecal } = await import('/configs/paint.js');
    const craft = craftBuilderFor('kadet1981')({ name: 'kadet-check', fog: false });
    const THREE = await import('three');
    const { paintTargets } = await import('/src/render/decals.js');
    const films = craft.livery.materials();
    const glow = films.wing[0].userData.film.value;
    /* The fuselage's left side: the first ray from off the left along +x
     * that meets a face looking left within 12 cm of the middle. */
    craft.group.updateMatrixWorld(true);
    let hit = null;
    let n = null;
    for (let y = -0.12; y <= 0.12 && !hit; y += 0.02) {
      for (const z of [-0.2, 0, 0.2]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(-3, y, z), new THREE.Vector3(1, 0, 0));
        const h = ray.intersectObjects(paintTargets(craft), false)[0];
        const hn = h && h.face.normal.clone().transformDirection(h.object.matrixWorld);
        if (h && h.point.x > -0.12 && hn.x < -0.8) {
          hit = h;
          n = hn;
          break;
        }
      }
    }
    dressLivery(craft, 'kadet1981', { colours: {}, finishes: { wing: 'gloss' }, decals: [newDecal('num', hit.point.toArray(), n.toArray())] });
    const painted = { glow: films.wing[0].userData.film.value, finish: readFinish(craft), decals: readDecals(craft) };
    dressLivery(craft, 'kadet1981', { colours: {}, finishes: {}, decals: [] });
    return { glow, painted, back: films.wing[0].userData.film.value, after: readDecals(craft) };
  })()`);
  say(kadet.painted.decals.meshes > 0 && kadet.painted.decals.triangles > 0,
    `a number on the Kadet's fuselage film is printed on it: ${kadet.painted.decals.triangles} triangles`);
  say(kadet.glow > 0 && kadet.painted.glow === 0 && kadet.back === kadet.glow && kadet.painted.finish.wing === 'gloss' && kadet.painted.finish.fuselage === 'kit',
    `gloss paint over the Kadet's wing film stops the sun through it (glow ${kadet.glow} to ${kadet.painted.glow}), and the kit's film brings it back`);
  say(kadet.after.meshes === 0, 'and taking the decals off leaves no decal mesh behind');

  /* The Cub as the Parts step left it: tundra tyres, the pod, the lights,
   * the smoke and a taped wing. A number on the fuselage's side and a
   * stripe over the taped wing, dressed with the parts put on first (a
   * repaint of a fitted plane) and last (a fresh build): the same decals,
   * on the skin both ways, and not one decal mesh under the parts. */
  console.log('   the fitted Cub');
  const cub = await page.evaluate(`(async () => {
    const THREE = await import('three');
    const { craftBuilderFor } = await import('/src/render/craft.js');
    const { dressLivery } = await import('/src/render/livery.js');
    const { dressParts, partsFor } = await import('/src/render/partsfit.js');
    const { paintTargets, readDecals } = await import('/src/render/decals.js');
    const { newDecal } = await import('/configs/paint.js');
    const probe = craftBuilderFor('cub1400')({ name: 'cub-probe', fog: false });
    probe.group.updateMatrixWorld(true);
    const spot = (from, dir, ok) => {
      const h = new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...dir)).intersectObjects(paintTargets(probe), false)[0];
      const n = h && h.face.normal.clone().transformDirection(h.object.matrixWorld);
      return h && ok(n) ? [h.point.toArray(), n.toArray()] : null;
    };
    const fit = partsFor('cub1400');
    const taped = fit && fit.entry && fit.entry.damage ? fit.entry.damage.parts.filter((q) => q.state === 'taped').length : 0;
    const side = spot([-3, 0.02, -0.1], [1, 0, 0], (n) => n.x < -0.7);
    const wing = spot([-0.3, 3, 0.05], [0, -1, 0], (n) => n.y > 0.7);
    const decals = [newDecal('num', ...side), { ...newDecal('stripe', ...wing), r: 90, a: 4 }];
    const look = { colours: {}, finishes: {}, decals };
    const under = (craft) => {
      let n = 0;
      craft.group.traverse((o) => {
        if (o.name !== 'paint-decals') return;
        for (let p = o.parent; p && p !== craft.group; p = p.parent) {
          if (p.name === 'parts') n += 1;
        }
      });
      return n;
    };
    const first = craftBuilderFor('cub1400')({ name: 'cub-a', fog: false });
    dressParts(first, 'cub1400', fit);
    dressLivery(first, 'cub1400', look);
    const last = craftBuilderFor('cub1400')({ name: 'cub-b', fog: false });
    dressLivery(last, 'cub1400', look);
    dressParts(last, 'cub1400', fit);
    return {
      addons: fit && fit.entry ? fit.entry.addons : [], taped, spots: Boolean(side && wing),
      partsFirst: readDecals(first), partsLast: readDecals(last), under: under(first) + under(last),
      tape: last.partsDress ? last.partsDress.tapeTris : 0,
    };
  })()`);
  say(cub.spots && cub.addons.includes('tundra') && cub.taped > 0 && cub.tape > 0,
    `the Cub is fitted as the Parts step left it: ${JSON.stringify(cub.addons)}, ${cub.taped} part(s) taped, ${cub.tape} tape triangles`);
  say(cub.partsFirst.decals === 2 && cub.partsFirst.triangles > 0 && cub.partsFirst.triangles === cub.partsLast.triangles && cub.under === 0,
    `a number and a stripe over the taped wing land on the Cub's skin alike with the parts on first or last (${cub.partsFirst.triangles} and ${cub.partsLast.triangles} triangles), none on a tyre, the pod or the tape`);
}

async function pickerFloatsCheck(page) {
  console.log('9. the Floats switch on the picker');
  /* From the title, whatever the step before left flying. */
  if (await page.evaluate("window.__ui.screen === 'flight'")) {
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
  }
  await page.evaluate("window.__ui.show('title'); true");
  const SWITCH = `(() => {
    const b = document.querySelector('.carousel-facts [data-key="floats"]');
    if (!b || b.hidden || !b.getClientRects().length) return null;
    const facts = [...b.parentNode.querySelectorAll('.carousel-fact')].map((f) => f.textContent);
    return { on: b.getAttribute('aria-checked'), lit: b.classList.contains('on'), role: b.getAttribute('role'), label: b.textContent, facts };
  })()`;
  const drawn = 'window.__ui.carousel.frame(0).items.map((it) => it.id)';
  const pick = async (id) => {
    if (!(await page.evaluate('window.__ui.carousel.isOpen'))) {
      await page.evaluate('window.__ui.openCraftRow(false); true');
      await page.until('window.__ui.carousel.isOpen', 10000);
    }
    const at = await page.evaluate(`window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})`);
    await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
  };
  const seated = () => page.evaluate('window.__ui.settings.airframe');

  await pick('kadet1981');
  say(await page.evaluate(SWITCH) === null, 'the Kadet, with no float version, shows no Floats switch');
  await pick('timber1500');
  const off = await page.evaluate(SWITCH);
  say(Boolean(off) && off.on === 'false' && !off.lit && off.role === 'switch' && same(off.facts, [sizeText('timber1500'), weightText('timber1500')]),
    `the Timber shows the Floats switch, off, a role switch beside its span and weight: ${JSON.stringify(off)}`);
  const hint = await page.evaluate("document.querySelector('.carousel-hint').textContent");
  say(/\bF\b/.test(hint), `the hint line names F: ${hint}`);

  await page.tap('KeyF');
  const on = await page.evaluate(SWITCH);
  say(Boolean(on) && on.on === 'true' && on.lit && same(on.facts, [sizeText('timber1500f'), weightText('timber1500f')]),
    `F turns it on, the span and weight now the float version's: ${JSON.stringify(on)}`);
  const ids = await page.evaluate(drawn);
  say(ids.includes('timber1500f') && !ids.includes('timber1500'), `the picker draws the Timber on floats: ${ids.join(', ')}`);
  say(await page.evaluate('window.__ui.carousel.current()') === 'timber1500', 'and the card is still the Timber');

  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
  const inHangar = await page.evaluate(`({ id: window.__ui.hangar.id, on: (document.querySelector('.hangar-facts [data-key="floats"]') || { getAttribute: () => null }).getAttribute('aria-checked') })`);
  say(inHangar.id === 'timber1500f' && inHangar.on === 'true', `C opens the hangar on the float version, its toggle on: ${JSON.stringify(inHangar)}`);
  await page.evaluate('window.__ui.hangar.cancel(); true');
  await page.until('!window.__ui.hangar.isOpen && window.__ui.carousel.isOpen', 10000);
  const back = await page.evaluate(SWITCH);
  say(Boolean(back) && back.on === 'true', `back on the picker the switch is still on: ${JSON.stringify(back)}`);

  await page.tap('Enter');
  await page.until('!window.__ui.carousel.isOpen', 10000);
  say(await seated() === 'timber1500f', `Enter seats ${await seated()}`);

  await pick('timber1500');
  const again = await page.evaluate(SWITCH);
  say(Boolean(again) && again.on === 'true', `opened again on the seated float version, the switch reads on: ${JSON.stringify(again)}`);
  await page.evaluate(`document.querySelector('.carousel-facts [data-key="floats"]').click(); true`);
  const clicked = await page.evaluate(SWITCH);
  say(Boolean(clicked) && clicked.on === 'false' && same(clicked.facts, [sizeText('timber1500'), weightText('timber1500')]),
    `a click turns it off: ${JSON.stringify(clicked)}`);
  await page.evaluate('window.__ui.carousel.chooseBtn.click(); true');
  await page.until('!window.__ui.carousel.isOpen', 10000);
  say(await seated() === 'timber1500', `Choose seats ${await seated()}`);

  await pick('timber1500');
  await page.tap('KeyF');
  await page.tap('Escape');
  await page.until('!window.__ui.carousel.isOpen', 10000);
  const kept = await page.evaluate('({ seat: window.__ui.settings.airframe, floats: window.__ui.settings.floats.timber1500 })');
  say(kept.seat === 'timber1500' && kept.floats === false, `a flip put away with Escape leaves the seated Timber on its wheels and its toggle off: ${JSON.stringify(kept)}`);
  await pick('cub1400');
  const cub = await page.evaluate(SWITCH);
  say(Boolean(cub) && cub.on === 'false', `the Cub has its own switch: ${JSON.stringify(cub)}`);
  /* A pad's Y, edge triggered, and the same press chooses nothing though a
   * menu takes Y as select too. */
  await page.evaluate('window.__ui.carousel.pollPad({}); window.__ui.carousel.pollPad({ floats: true, select: true }); true');
  const padded = await page.evaluate(SWITCH);
  const stillOpen = await page.evaluate('window.__ui.carousel.isOpen');
  say(Boolean(padded) && padded.on === 'true' && stillOpen, `a pad's Y turns the Cub's on and chooses nothing: ${JSON.stringify(padded)}, picker open ${stillOpen}`);
  await page.evaluate('window.__ui.carousel.pollPad({}); window.__ui.carousel.pollPad({ floats: true }); true');
  say((await page.evaluate(SWITCH)).on === 'false', 'and Y again turns it off');
  await page.tap('Escape');
  await page.until('!window.__ui.carousel.isOpen', 10000);
}

async function pickerEngineCheck(page) {
  console.log('10. the Engine switch on the picker');
  if (await page.evaluate("window.__ui.screen === 'flight'")) {
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
  }
  await page.evaluate("window.__ui.show('title'); true");
  const striker = airframeById('striker2500');
  const [prop, jet] = striker.combat.propulsion;
  const chip = (p) => str('carousel.engine', { engine: str(`loadout.propulsion.${p.id}`) });
  const facts = (p) => [sizeText('striker2500'), weightText('striker2500', { propulsion: p.id }), chip(p)];
  const ENGINE = `(() => {
    const b = document.querySelector('.carousel-facts [data-key="engine"]');
    if (!b || b.hidden || !b.getClientRects().length) return null;
    const facts = [...b.parentNode.querySelectorAll('.carousel-fact')].filter((f) => !f.hidden).map((f) => f.textContent);
    return { label: b.textContent, facts, title: b.title };
  })()`;
  const stored = () => page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}));
    return { stored: s.combat && s.combat.striker2500 ? s.combat.striker2500.propulsion : null, live: window.__ui.settings.combat && window.__ui.settings.combat.striker2500 ? window.__ui.settings.combat.striker2500.propulsion : null };
  })()`);
  /* The model the picker or the hangar last drew, once a frame has drawn it. */
  const drawn = async (p) => {
    await page.until(`(window.__pickCombat('striker2500') || {}).propulsion === ${JSON.stringify(p.id)}`, 30000).catch(() => {});
    return (await page.evaluate("window.__pickCombat('striker2500')") || {}).propulsion ?? null;
  };
  const pick = async (id) => {
    if (!(await page.evaluate('window.__ui.carousel.isOpen'))) {
      await page.evaluate('window.__ui.openCraftRow(false); true');
      await page.until('window.__ui.carousel.isOpen', 10000);
    }
    await page.evaluate("window.__ui.carousel.setFilter('all'); true");
    const at = await page.evaluate(`window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})`);
    await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
  };

  await pick('kadet1981');
  say(await page.evaluate(ENGINE) === null, 'the Kadet, with one engine, shows no Engine switch');
  await pick('7inch');
  say(await page.evaluate(ENGINE) === null, 'the 7 inch, a combat quad with one way to be pushed, shows none either');
  await pick('striker2500');
  const cards = await page.evaluate('window.__ui.carousel.ids');
  say(cards.filter((k) => k === 'striker2500').length === 1, `the Striker is one card: ${cards.join(', ')}`);
  const first = await page.evaluate(ENGINE);
  say(Boolean(first) && same(first.facts, facts(prop)), `the Striker shows its engine beside its span and weight: ${JSON.stringify(first)}`);
  say(await drawn(prop) === prop.id, `and the picker draws it on its ${await drawn(prop)}`);
  const hint = await page.evaluate("document.querySelector('.carousel-hint').textContent");
  say(/\bE its engine\b/.test(hint), `the hint line names E: ${hint}`);

  await page.tap('KeyE');
  const onJet = await page.evaluate(ENGINE);
  say(Boolean(onJet) && same(onJet.facts, facts(jet)), `E switches it to the turbojet, the weight the jet's: ${JSON.stringify(onJet)}`);
  say(await drawn(jet) === jet.id, `the picker now draws the ${await drawn(jet)} Striker`);
  const saved = await stored();
  say(saved.stored === jet.id && saved.live === jet.id, `saved where the Loadout tab saves it: ${JSON.stringify(saved)}`);
  say(await page.evaluate('window.__ui.carousel.current()') === 'striker2500', 'and the card is still the Striker');

  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await page.until("window.__ui.hangar.tab === 'loadout'", 5000).catch(() => {});
  const loadout = await page.evaluate(`({ id: window.__ui.hangar.id, tab: window.__ui.hangar.tab, on: [...document.querySelectorAll('.hangar .combat-tab [aria-pressed="true"]')].map((b) => b.dataset.key) })`);
  say(loadout.id === 'striker2500' && loadout.tab === 'loadout' && loadout.on.includes('propulsion-jet') && !loadout.on.includes('propulsion-prop'),
    `C opens Customise on its Loadout tab with the turbojet chosen: ${JSON.stringify(loadout)}`);
  say(await drawn(jet) === jet.id, `and the hangar draws the ${await drawn(jet)} Striker`);
  await page.evaluate('window.__ui.hangar.cancel(); true');
  await page.until('!window.__ui.hangar.isOpen && window.__ui.carousel.isOpen', 10000);
  const back = await page.evaluate(ENGINE);
  say(Boolean(back) && back.label === chip(jet), `back on the picker it still reads ${back ? back.label : null}`);

  await page.tap('Enter');
  await page.until('!window.__ui.carousel.isOpen', 10000);
  say(await page.evaluate('window.__ui.settings.airframe') === 'striker2500', 'Enter seats the Striker');

  console.log('   reload');
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await ready(page);
  const kept = await stored();
  say(kept.stored === jet.id && kept.live === jet.id, `after a reload the turbojet is kept: ${JSON.stringify(kept)}`);
  await pick('striker2500');
  const reloaded = await page.evaluate(ENGINE);
  say(Boolean(reloaded) && same(reloaded.facts, facts(jet)), `the picker reads it: ${JSON.stringify(reloaded)}`);
  say(await drawn(jet) === jet.id, `and draws the ${await drawn(jet)} Striker`);

  await page.evaluate(`document.querySelector('.carousel-facts [data-key="engine"]').click(); true`);
  const clicked = await page.evaluate(ENGINE);
  say(Boolean(clicked) && same(clicked.facts, facts(prop)) && (await stored()).stored === prop.id,
    `a click switches it back to the piston engine and saves that: ${JSON.stringify(clicked)}`);
  say(await drawn(prop) === prop.id, `the picker draws the ${await drawn(prop)} Striker`);
  /* A pad's Y, edge triggered, and the same press chooses nothing though a
   * menu takes Y as select too. */
  await page.evaluate('window.__ui.carousel.pollPad({}); window.__ui.carousel.pollPad({ floats: true, select: true }); true');
  const padded = await page.evaluate(ENGINE);
  const stillOpen = await page.evaluate('window.__ui.carousel.isOpen');
  say(Boolean(padded) && padded.label === chip(jet) && stillOpen, `a pad's Y switches it to the turbojet and chooses nothing: ${JSON.stringify(padded)}, picker open ${stillOpen}`);
  await page.evaluate('window.__ui.carousel.pollPad({}); window.__ui.carousel.pollPad({ floats: true }); true');
  say((await page.evaluate(ENGINE)).label === chip(prop), 'and Y again back to the piston engine');
  await page.tap('Enter');
  await page.until('!window.__ui.carousel.isOpen', 10000);
  say(await page.evaluate('window.__ui.settings.airframe') === 'striker2500' && (await stored()).stored === prop.id, 'Enter seats the Striker on the piston engine');
  await pick('striker2500');
  await page.tap('KeyE');
  await page.tap('Escape');
  await page.until('!window.__ui.carousel.isOpen', 10000);
  const settled = await stored();
  say(settled.stored === prop.id && settled.live === prop.id, `a switch of the seated Striker put away with Escape is undone: ${JSON.stringify(settled)}`);

  console.log('   in the air');
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await page.sleep(500);
  const before = await page.evaluate('window.__craft()');
  say(before.run === 'striker2500' && before.module === prop.simId, `the Striker flies on plant ${before.module}, the piston engine's: ${JSON.stringify({ run: before.run, combat: before.combat })}`);
  await page.evaluate("window.__ui.openSwap('flight'); true");
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.tap('KeyE');
  await page.tap('Enter');
  await page.until(`window.__craft().module === ${jet.simId}`, 30000).catch(() => {});
  const after = await page.evaluate('window.__craft()');
  say(after.run === 'striker2500' && after.module === jet.simId && after.combat && after.combat.propulsion === jet.id && (await stored()).stored === jet.id,
    `E and Enter in the air refit it on plant ${after.module}, the turbojet's: ${JSON.stringify(after.combat)}`);
  await page.until("window.__ui.screen === 'flight'", 10000).catch(() => {});
  say(await page.evaluate("window.__ui.screen") === 'flight', 'and the flight resumes');
}

async function combatPaintCheck(page) {
  console.log('11. the combat aircraft\'s paint');
  const toPicker = async (id) => {
    if (await page.evaluate("window.__ui.screen === 'flight'")) {
      await page.tap('Escape');
      await page.until("window.__ui.screen === 'paused'", 10000);
    }
    await page.evaluate("window.__ui.show('title'); true");
    await page.evaluate('window.__ui.openCraftRow(false); true');
    await page.until('window.__ui.carousel.isOpen', 10000);
    await page.evaluate("window.__ui.carousel.setFilter('all'); true");
    const at = await page.evaluate(`window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})`);
    await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
  };
  /* Paint `id` in the hangar from the picker: a scheme, one region in a
   * colour of the pilot's own, a decal placed by aiming (`decal`, the
   * arguments of placeDecal), the livery saved by name, its code copied,
   * the aircraft reset and the code imported back; Save. Returns the
   * colours it should wear. */
  const paint = async (id, scheme, region, hex, decal) => {
    await toPicker(id);
    await page.tap('KeyC');
    await page.until('window.__ui.hangar.isOpen', 10000);
    const tab = await page.evaluate('window.__ui.hangar.tab');
    say(tab === 'loadout', `C on the ${id} opens Customise on its Loadout tab: ${tab}`);
    await page.evaluate("window.__ui.hangar.setTab('colours'); true");
    await page.until("window.__ui.hangar.tab === 'colours'", 5000);
    const offered = await page.evaluate("[...document.querySelectorAll('.hangar [data-key^=\"scheme-\"]')].map((b) => b.dataset.key.slice(7))");
    const regions = await page.evaluate("[...document.querySelectorAll('.hangar [data-key^=\"region-\"]')].map((b) => b.dataset.key.slice(7))");
    say(same(offered, schemesFor(id).map((x) => x.id)) && same(regions, regionsFor(id).map((x) => x.id)),
      `its Colours tab offers its schemes ${JSON.stringify(offered)} and regions ${JSON.stringify(regions)}`);
    await page.evaluate(click(`scheme-${scheme}`));
    await page.evaluate(click(`region-${region}`));
    await page.evaluate(`(() => { const i = document.querySelector('.hangar-custom-input'); i.value = ${JSON.stringify(hex)}; i.dispatchEvent(new Event('input')); return true; })()`);
    const want = coloursFor(id, { scheme, regions: { [region]: hex } });
    await page.until(wears(id, want), 60000).catch(() => {});
    const preview = await page.evaluate(`window.__pickPaint(${JSON.stringify(id)})`) ?? {};
    say(same(sorted(preview), sorted(want)), `the ${id} in the hangar wears ${scheme} with its own ${region} before Save: ${JSON.stringify(preview)}`);
    await page.evaluate(click('page-decals'));
    const placed = await placeDecal(page, ...decal);
    say(Boolean(placed) && placed.k === decal[0], `aimed from ${decal[1]}, Enter puts a ${decal[0]} on the ${id} (normal ${JSON.stringify(placed && placed.n)})`);
    const looked = await page.evaluate(`(async () => { for (let i = 0; i < 100; i += 1) { const l = window.__pickLook(${JSON.stringify(id)}); if (l && l.decals.decals === 1) return l; await new Promise((r) => setTimeout(r, 100)); } return window.__pickLook(${JSON.stringify(id)}); })()`);
    say(Boolean(looked) && looked.decals.decals === 1 && looked.decals.triangles > 0, `the hangar's ${id} wears it: ${looked ? looked.decals.triangles : 0} triangles`);
    const wanted = await page.evaluate('JSON.parse(JSON.stringify(window.__ui.hangar.entry))');
    await page.evaluate(click('page-saved'));
    await page.evaluate(click('saved-new'));
    await page.evaluate("(() => { const f = document.querySelector('.hangar [data-key=\"name-field\"]'); f.value = 'Mine'; f.dispatchEvent(new Event('input')); return true; })()");
    await page.evaluate(click('name-save'));
    await page.evaluate(click('code-copy'));
    const code = await page.evaluate("document.querySelector('.hangar [data-key=\"code-out\"]').value");
    await page.evaluate(click('reset'));
    await page.evaluate(click('code-paste'));
    await page.evaluate(`(() => { const f = document.querySelector('.hangar [data-key="code-field"]'); f.value = ${JSON.stringify(code)}; f.dispatchEvent(new Event('input')); return true; })()`);
    await page.evaluate(click('code-import'));
    const imported = await page.evaluate('JSON.parse(JSON.stringify(window.__ui.hangar.entry))');
    const lib = await page.evaluate(`window.__ui.settings.liverySaves[${JSON.stringify(id)}].map((x) => x.name)`);
    say(/^FPV1-/.test(code) && alike(imported, wanted) && lib.length === 2,
      `saved by name, its code copied, reset and the code imported back, the same livery: ${JSON.stringify(lib)}`);
    await page.evaluate('window.__ui.hangar.saveBtn.click(); true');
    await page.until('!window.__ui.hangar.isOpen', 5000);
    const stored = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).livery[${JSON.stringify(id)}]`);
    say(alike(stored, wanted) && stored.scheme === scheme && stored.regions[region] === hex, `Save stores it: ${JSON.stringify({ ...stored, decals: stored && stored.decals && stored.decals.length })}`);
    await page.until(`window.__ui.carousel.isOpen && ${wears(id, want)}`, 60000).catch(() => {});
    const picked = await page.evaluate(`window.__pickPaint(${JSON.stringify(id)})`) ?? {};
    say(same(sorted(picked), sorted(want)), `and the picker's ${id} wears it: ${JSON.stringify(picked)}`);
    return want;
  };
  /* A region a part not fitted carries (the 7 inch's cage) is in its
   * colour and drawn nowhere, so it is the pilot's own colour that must be
   * on a drawn mesh. */
  const flownIn = async (id, want, own, what) => {
    await page.until(`window.__craftPaint().id === ${JSON.stringify(id)} && window.__craft().run === ${JSON.stringify(id)}`, 60000).catch(() => {});
    await page.until('window.__craftPaint().decals.decals === 1', 60000).catch(() => {});
    const flown = await page.evaluate('window.__craftPaint()');
    const combat = (await page.evaluate('window.__craft()')).combat;
    say(flown.id === id && same(sorted(flown.regions), sorted(want)) && flown.drawn.includes(own) && flown.decals.decals === 1 && flown.decals.triangles > 0,
      `flown ${what}, the ${id} is in it: ${JSON.stringify(flown.regions)}, its own ${own} on a drawn mesh, its decal drawn as ${flown.decals.triangles} triangles (${JSON.stringify(combat)})`);
    return combat;
  };

  const striker = airframeById('striker2500');
  const [prop, jet] = striker.combat.propulsion;
  const want = await paint('striker2500', 'test', 'engine', '#3355aa', ['num', 'side_left', 'n[0] < -0.8']);
  await page.tap('Enter');
  await page.until('!window.__ui.carousel.isOpen', 10000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  /* Reset to stock in the paint shop put the loadout back on its stock
   * engine too; whichever it flies on, the refit is the other. */
  const first = await flownIn('striker2500', want, '#3355aa', 'on its engine');
  await page.evaluate("window.__ui.openSwap('flight'); true");
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.tap('KeyE');
  await page.tap('Enter');
  const other = first && first.propulsion === jet.id ? prop : jet;
  await page.until(`window.__craft().module === ${other.simId}`, 30000).catch(() => {});
  await page.sleep(300);
  const second = await flownIn('striker2500', want, '#3355aa', 'refitted in the air on the other engine');
  say(Boolean(first && second) && same([first.propulsion, second.propulsion].sort(), [jet.id, prop.id].sort()),
    `and the two flights were on both engines: ${first && first.propulsion} then ${second && second.propulsion}`);
  await page.until("window.__ui.screen === 'flight'", 10000).catch(() => {});

  const want7 = await paint('7inch', 'two_tone', 'frame', '#e73f0e', ['stripe', 'top', 'n[1] > 0.8']);
  await page.tap('Escape');
  await page.until('!window.__ui.carousel.isOpen', 10000);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await page.evaluate("window.__ui.swapTo('7inch').then(() => true)");
  await page.until("window.__craft().run === '7inch'", 30000);
  await flownIn('7inch', want7, '#e73f0e', 'swapped in in the air');
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await ready(page);
    await regionsCheck(page);

    console.log('2. the Timber: picker, Customise, scheme, own colour, Save, fly, swap, reload');
    await openHangarFromPicker(page, 'timber1500');
    const h = await page.evaluate("({ id: window.__ui.hangar.id, tab: window.__ui.hangar.tab, open: !document.querySelector('.hangar').hidden })");
    say(h.open && h.id === 'timber1500' && h.tab === 'power', `C on the centred Timber opens the hangar on it, on ${h.tab}`);
    const power = await choosePower(page);
    await page.tap('KeyE');
    await page.until("window.__ui.hangar.tab === 'colours'", 5000);
    await page.evaluate(click('scheme-super'));
    await page.evaluate(click('region-stripe'));
    await page.evaluate("(() => { const i = document.querySelector('.hangar-custom-input'); i.value = '#3355aa'; i.dispatchEvent(new Event('input')); return true; })()");
    const want = coloursFor('timber1500', { scheme: 'super', regions: { stripe: '#3355aa' } });
    /* The preview is painted on the next drawn frame. */
    await page.until(wears('timber1500', want), 60000).catch(() => {});
    const preview = await page.evaluate("window.__pickPaint('timber1500')") ?? {};
    say(same(sorted(preview), sorted(want)), `the model in the hangar wears the Super Timber scheme with a blue stripe before it is saved: ${JSON.stringify(preview)}`);
    await page.evaluate("window.__ui.hangar.saveBtn.click(); true");
    await page.until('!window.__ui.hangar.isOpen', 5000);
    const stored = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).livery`);
    say(same(stored, { timber1500: { scheme: 'super', regions: { stripe: '#3355aa' } } }), `Save stores it: ${JSON.stringify(stored)}`);
    if (power) {
      const sp = await page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).power`);
      say(sp && same(sp.timber1500, power), `Save stores the power: ${JSON.stringify(sp)}`);
    }
    const back = await page.evaluate('window.__ui.carousel.isOpen');
    say(back, 'the picker comes back on the plane after Save');
    await page.tap('Escape');
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
    /* The model is swapped from the title's on a drawn frame after that. */
    await page.until('window.__craftPaint().id === window.__craft().run', 60000).catch(() => {});
    if (power) {
      /* The plant flies the saved option on the saved pack. */
      const p = await page.evaluate('window.__craft()');
      const want = powerBlock('timber1500', power.option, power.pack);
      say(p.power && p.power.custom && p.power.capacityC === want[5] && p.cells === want[3],
        `flown on it: the plant has option ${power.option}, a ${p.power ? p.power.capacityC / 3.6 : '?'} mAh pack, ${p.cells}S`);
    }
    const flown = await page.evaluate('window.__craftPaint()');
    const drawnHas = Object.values(want).every((hx) => flown.drawn.includes(hx));
    say(flown.id === 'timber1500' && same(sorted(flown.regions), sorted(want)) && drawnHas,
      `flown, the Timber's materials are in it: ${JSON.stringify(flown.regions)}, every colour on a drawn mesh`);
    await page.evaluate("window.__ui.swapTo('kadet1981').then(() => true)");
    await page.until("window.__craft().run === 'kadet1981'", 30000);
    await page.evaluate("window.__ui.swapTo('timber1500').then(() => true)");
    await page.until("window.__craft().run === 'timber1500'", 30000);
    await page.sleep(300);
    const swapped = await page.evaluate('window.__craftPaint()');
    say(swapped.id === 'timber1500' && same(sorted(swapped.regions), sorted(want)), `swapped to the Kadet and back, still in it: ${JSON.stringify(swapped.regions)}`);

    console.log('3. the Kadet from the pause menu, in the air');
    await page.evaluate("window.__ui.swapTo('kadet1981').then(() => true)");
    await page.until("window.__craft().run === 'kadet1981'", 30000);
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
    const row = await page.evaluate("window.__ui.items().findIndex((it) => it.action === 'customise')");
    say(row >= 0, `the pause menu has Customise for the seated Kadet, row ${row}`);
    await page.evaluate(`window.__ui.setCursor(${row}); true`);
    await page.tap('Enter');
    await page.until('window.__ui.hangar.isOpen', 10000);
    await page.tap('KeyE');
    await page.until("window.__ui.hangar.tab === 'colours'", 5000);
    await page.evaluate(click('scheme-sport_blue'));
    await page.evaluate(click('region-wing'));
    await page.evaluate(click('colour-#f8c300'));
    const kwant = coloursFor('kadet1981', { scheme: 'sport_blue', regions: { wing: '#f8c300' } });
    await page.evaluate("window.__ui.hangar.saveBtn.click(); true");
    await page.until('!window.__ui.hangar.isOpen', 5000);
    await page.sleep(300);
    const kflown = await page.evaluate('window.__craftPaint()');
    say(kflown.id === 'kadet1981' && same(sorted(kflown.regions), sorted(kwant)),
      `saved from the pause menu, the Kadet in the air wears it in place: ${JSON.stringify(kflown.regions)}`);

    console.log('   reload');
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await ready(page);
    const kept = await page.evaluate('window.__ui.settings.livery');
    say(same(kept, { timber1500: { scheme: 'super', regions: { stripe: '#3355aa' } }, kadet1981: { scheme: 'sport_blue', regions: { wing: '#f8c300' } } }),
      `after a reload both are kept: ${JSON.stringify(kept)}`);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
    /* The model is swapped from the title's on a drawn frame after that. */
    await page.until('window.__craftPaint().id === window.__craft().run', 60000).catch(() => {});
    const again = await page.evaluate('window.__craftPaint()');
    const wantAgain = coloursFor(again.id, kept[liveryKey(again.id)]);
    say(same(sorted(again.regions), sorted(wantAgain)), `and the ${again.id} flies in its paint: ${JSON.stringify(again.regions)}`);

    console.log('4. Reset to stock');
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
    await page.evaluate("window.__ui.show('title'); true");
    await openHangarFromPicker(page, 'timber1500');
    await page.evaluate(click('reset'));
    await page.evaluate("window.__ui.hangar.saveBtn.click(); true");
    await page.until('!window.__ui.hangar.isOpen', 5000);
    const after = await page.evaluate('window.__ui.settings.livery');
    const stock = coloursFor('timber1500', null);
    await page.until(wears('timber1500', stock), 60000).catch(() => {});
    const stockPaint = await page.evaluate("window.__pickPaint('timber1500')") ?? {};
    say(!after.timber1500 && same(sorted(stockPaint), sorted(stock)), `Reset to stock leaves nothing stored for it and the model in its kit's colours: ${JSON.stringify(stockPaint)}`);
    /* Every fixed wing has paint, a float plane its land plane's, and so
     * does every combat aircraft, and nothing else has: read off the
     * airframe table, so an aircraft added there without paint fails here
     * and one added with it passes without this line changing. */
    const families = new Set(AIRFRAMES.filter((a) => a.fixedWing || a.combat).map((a) => liveryKey(a.id)));
    const bare = [...families].filter((k) => !LIVERIES[k]);
    const stray = Object.keys(LIVERIES).filter((k) => !families.has(k));
    say(bare.length === 0 && stray.length === 0,
      `every fixed wing's and combat aircraft's family has paint, ${families.size} of them, and nothing else: ${JSON.stringify({ bare, stray })}`);
    await page.evaluate('window.__ui.carousel.close(); true');
    await tuningCheck(page);
    await layoutCheck(page);
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId);
    await partsCheck(page);
    await paintShopCheck(page);
    await pickerFloatsCheck(page);
    await pickerEngineCheck(page);
    await combatPaintCheck(page);
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
