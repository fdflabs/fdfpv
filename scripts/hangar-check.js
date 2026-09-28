/*
 * hangar-check.js: the hangar, its paint and its power, in the real shell,
 * headless.
 *
 *   1. Every plane's regions: what each builder draws a region in is the
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
 *      motors, 5 packs), both tabs: no readout wraps onto a second line or
 *      overflows its tile, and the panel's last line (the source line on
 *      Power) is fully in view, without scrolling where it fits, otherwise
 *      once Down from the panel's last control has scrolled it to its end.
 *      The Kadet's Power tab fits with no scroll at 1600x900 and above.
 *   6. The Parts tab on the Cub: tundra tyres, the camera pod, the lights,
 *      the smoke system and a three blade prop on the model before Save,
 *      stored by it; flown, the model and the plant (sim_addons_state)
 *      both carry them and O turns the smoke on and off; a wing broken in
 *      the air is shown broken in the hangar, taped, saved into the air,
 *      and the plant flies the tape's mass, after a reset too.
 * And no console error or uncaught exception anywhere.
 *
 *   node scripts/hangar-check.js [map]     airfield by default
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
import { AIRFRAMES, airframeById } from '../configs/airframes.js';
import { LIVERIES, coloursFor, liveryKey, paintable, regionsFor } from '../configs/liveries.js';
import { POWER, SIM_POWER, powerBlock } from '../configs/power.js';
import { ESTIMATES } from '../configs/power-estimates.js';
import { SIM_ADDON, addonParams } from '../configs/hangar-parts.js';
import { PROP_ESTIMATES } from '../configs/prop-estimates.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const map = process.argv[2] || 'airfield';

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
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'timber1500');
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
  console.log('1. every plane\'s regions');
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
  console.log('5. the side panel\'s layout on the Kadet and the Skyhunter');
  for (const [w, h] of SIZES) {
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, page.sessionId);
    for (const id of ['kadet1981', 'sky1800']) {
      await openHangarFromPicker(page, id);
      for (const tab of ['power', 'colours']) {
        if (tab === 'colours') {
          await page.tap('KeyE');
          await page.until("window.__ui.hangar.tab === 'colours'", 5000);
        }
        await page.until(SETTLED, 10000);
        const at = `${w}x${h} ${id} ${tab}`;
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
 * 6. The Parts tab on the Cub, the whole way: the tab, tundra tyres, the
 * camera pod, the lights, the smoke system and the three blade prop on
 * the model before Save; saved; flown, the model and the plant both
 * carrying them and the smoke on and off with O; a wing broken in the
 * air, shown broken in the hangar, taped, and flown taped.
 */
async function partsCheck(page) {
  console.log('6. the Parts tab: fit the Cub, fly it, break a wing, tape it, fly it');
  const id = 'cub1400';
  const fit = ['tundra', 'pod', 'lights', 'smoke'];
  const prop = '11x7e-3';
  await openHangarFromPicker(page, id);
  await page.evaluate(click('tab-parts'));
  await page.until("window.__ui.hangar.tab === 'parts'", 5000);
  const cards = await page.evaluate("[...document.querySelectorAll('.hangar-side [data-key]')].map((b) => b.dataset.key)");
  say(['prop-stock', `prop-${prop}`, 'prop-11x55e', ...fit.map((a) => `addon-${a}`), 'addon-floats'].every((k) => cards.includes(k)),
    `the Parts tab offers the Cub's props, its add-ons and its floats: ${cards.join(', ')}`);
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
    say(Object.keys(LIVERIES).length === 8, `${Object.keys(LIVERIES).length} planes have paint`);
    await page.evaluate('window.__ui.carousel.close(); true');
    await layoutCheck(page);
    await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false }, page.sessionId);
    await partsCheck(page);
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
