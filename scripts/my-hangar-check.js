/*
 * my-hangar-check.js: My Hangar, the pilot's saved builds
 * (src/ui/builds.js), in the real shell, headless, driven the way a pilot
 * drives it.
 *
 * The profile starts on the Timber the pilot has already customised, the
 * way it was before My Hangar existed: the Super Timber scheme and the
 * lights. Then:
 *
 *   1. My Hangar is a fourth tab, reached with the arrows, and empty it
 *      says how to fill it and offers nothing to choose.
 *   2. Customise on the stock Timber (C), the Timber X scheme, Save to My
 *      Hangar: the name offered, typed over and Enter. The picker comes
 *      back on My Hangar with the build centred, it is stored under its
 *      own key, and the stock Timber's own customisation has not moved.
 *   3. A second Timber, by mouse: the Twin scheme and the camera pod.
 *   4. Both listed, each drawn in its own paint and parts.
 *   5. Choosing each seats its own configuration (Enter on one, a pad's A
 *      on the other) and choosing the stock Timber puts the pilot's own
 *      back; the build flown, the flown craft wears it, and in the air
 *      Tab's picker puts the other build on, a refit in place.
 *   6. Customise on a build (its name the title), the stock scheme, Save:
 *      the build overwritten, and the Timber wearing it with it. Save as
 *      new: a third build.
 *   7. Rename with R, a refused name and then a good one.
 *   8. Delete: the Delete key asks with Keep under the cursor and Enter
 *      keeps it; asked again, Right and Enter delete it; a pad's Y asks
 *      and B keeps.
 *   9. Reloaded: the builds, the one worn and the stock Timber's own
 *      customisation all kept, the stock card still drawn in it.
 *  10. A drone: the 7 inch's loadout (src/ui/hangar-combat.js) saved as
 *      a build, chosen and carried, and the stock 7 inch its own again.
 * And no console error or uncaught exception anywhere.
 *
 *   node scripts/my-hangar-check.js [outdir]
 *
 * With an outdir, pictures of the picker and of My Hangar at 1280x720 and
 * 390x844 go there, never into the repository.
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
import { coloursFor } from '../configs/liveries.js';

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (o) => Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b)));

const T = 'timber1500';
/* The pilot's customisation from before My Hangar. */
const OWN = { livery: { scheme: 'super' }, parts: { prop: 'stock', addons: ['lights'], damage: null } };

const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, T);
s.map = 'alps';
s.graphics = 'low';
s.flightMode = 'angle';
s.fpsCap = 0;
s.airframeAsked = true;
s.livery = { [T]: OWN.livery };
s.parts = { [T]: OWN.parts };
/* Once per page, not per document: the reload must find what the page
 * left. A key of its own, since loadSettings drops one it does not know. */
const seed = [`try {
  if (!localStorage.getItem('myHangarCheckSeeded')) {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.removeItem(${JSON.stringify(BUILDS_KEY)});
    localStorage.setItem('myHangarCheckSeeded', '1');
  }
} catch (e) { /* storage refused */ }`];

const faults = (page) => page.errors.filter((e) => !e.startsWith('network:'));

async function ready(page) {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
}

const stored = (page) => page.evaluate(`({
  builds: (JSON.parse(localStorage.getItem(${JSON.stringify(BUILDS_KEY)}) || '{}').builds) || [],
  settings: JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}'),
})`);
const card = (page) => page.evaluate(`(() => {
  const c = window.__ui.carousel;
  const shown = (n) => Boolean(n) && !n.hidden && n.getClientRects().length > 0;
  const q = (sel) => c.root.querySelector(sel);
  return {
    open: c.isOpen, filter: c.filter, key: c.current() ?? null, ids: c.ids.slice(),
    name: shown(c.nameEl) ? c.nameEl.textContent : null,
    base: shown(c.baseEl) ? c.baseEl.textContent : null,
    note: c.noteEl.textContent,
    choose: shown(c.chooseBtn), custom: shown(c.customBtn),
    tools: shown(c.toolsEl), form: shown(c.formEl),
    focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key ?? null : null,
    hint: q('.carousel-hint').textContent,
  };
})()`);
const click = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) throw new Error('no ' + ${JSON.stringify(sel)}); b.click(); return true; })()`;
const hangarKey = (key) => click(`.hangar [data-key="${key}"]`);
/* An expression true once a picker model wears these colours. */
const wears = (key, want) => `(() => { const p = window.__pickPaint(${JSON.stringify(key)}); const w = ${JSON.stringify(want)}; return Boolean(p) && Object.keys(w).every((k) => p[k] === w[k]); })()`;

async function openPicker(page) {
  if (!(await page.evaluate('window.__ui.carousel.isOpen'))) {
    await page.evaluate('window.__ui.openCraftRow(false); true');
    await page.until('window.__ui.carousel.isOpen', 10000);
  }
}

/* The tab with the arrows, as a pilot reaches it. */
async function toTab(page, want) {
  for (let i = 0; i < 4 && await page.evaluate('window.__ui.carousel.filter') !== want; i += 1) {
    await page.tap('ArrowDown');
  }
}

async function centre(page, key) {
  const at = await page.evaluate(`window.__ui.carousel.ids.indexOf(${JSON.stringify(key)})`);
  if (at < 0) {
    throw new Error(`no card ${key}`);
  }
  await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
}

async function shoot(page, name, w, h) {
  if (!outdir) {
    return;
  }
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }, page.sessionId);
  await page.sleep(900);
  const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outdir, `${name}-${w}x${h}.png`), Buffer.from(shot.data, 'base64'));
  const scroll = await page.evaluate('document.documentElement.scrollWidth > window.innerWidth');
  say(!scroll, `${name} at ${w}x${h}: no sideways scroll`);
}

/* Both sizes, then back to the one the check runs at. */
async function shots(page, name) {
  await shoot(page, name, 1280, 720);
  await shoot(page, name, 390, 844);
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, page.sessionId);
}

async function main() {
  if (outdir) {
    await mkdir(outdir, { recursive: true });
  }
  const page = await openPage({ root, width: 1280, height: 720, seed });
  try {
    await ready(page);

    console.log('1. My Hangar, empty');
    await openPicker(page);
    await toTab(page, 'mine');
    const empty = await card(page);
    say(empty.filter === 'mine' && empty.ids.length === 0 && !empty.choose && !empty.custom && /Customise/.test(empty.note) && /Save to My Hangar/.test(empty.note),
      `ArrowDown reaches My Hangar; empty, it says how to add one and offers no Choose: ${empty.name} / ${empty.note}`);
    await shots(page, 'my-hangar-empty');

    console.log('2. the first Timber build, by keyboard');
    await toTab(page, 'plane');
    await centre(page, T);
    await page.tap('KeyC');
    await page.until('window.__ui.hangar.isOpen', 10000);
    const offer = await page.evaluate("(() => { const b = document.querySelector('.hangar [data-key=\"mine-new\"]'); return b && !b.hidden ? b.textContent : null; })()");
    say(offer === 'Save to My Hangar', `the stock Timber's hangar offers ${offer}`);
    await shots(page, 'hangar-stock');
    const opened = await page.evaluate('window.__ui.hangar.entry');
    say(same(opened, OWN.livery), `and opens on the pilot's own paint: ${JSON.stringify(opened)}`);
    await page.evaluate("window.__ui.hangar.setTab('colours'); true");
    await page.evaluate(hangarKey('scheme-timber_x'));
    await page.evaluate("window.__ui.hangar.focusKey('mine-new'); true");
    await page.tap('Enter');
    await page.until("document.activeElement && document.activeElement.dataset.key === 'mine-name'", 5000);
    const offered = await page.evaluate('document.activeElement.value');
    say(offered === `${airframeById(T).name} 1`, `Enter on it asks for a name, offering ${offered}`);
    await shots(page, 'hangar-name');
    await page.evaluate("document.querySelector('.hangar [data-key=\"mine-name\"]').focus(); true");
    await page.evaluate("(() => { const f = document.activeElement; f.value = 'Bush'; f.dispatchEvent(new Event('input')); return true; })()");
    await page.tap('Enter');
    await page.until('!window.__ui.hangar.isOpen && window.__ui.carousel.isOpen', 10000);
    let st = await stored(page);
    const bush = st.builds.find((b) => b.name === 'Bush');
    say(Boolean(bush) && bush.airframe === T && same(bush.fit.livery, { scheme: 'timber_x' }) && same(bush.fit.parts, { prop: 'stock', addons: ['lights'] }),
      `Enter saves it under ${BUILDS_KEY}: ${JSON.stringify(bush)}`);
    say(same(st.settings.livery[T], OWN.livery) && same(st.settings.parts[T].addons, OWN.parts.addons) && same(st.settings.buildFits, {}),
      `the stock Timber's own customisation has not moved: ${JSON.stringify(st.settings.livery[T])}, ${JSON.stringify(st.settings.parts[T])}`);
    let c = await card(page);
    say(c.filter === 'mine' && c.key === `build:${bush.id}` && c.name === 'Bush' && c.base === airframeById(T).name && c.tools && c.choose && c.custom,
      `the picker comes back on My Hangar, the build centred with its plane named and Rename and Delete: ${JSON.stringify({ name: c.name, base: c.base })}`);

    console.log('3. a second Timber, by mouse');
    await page.evaluate(click('.carousel-tab:not(.carousel-tab-mine):nth-child(2)'));
    c = await card(page);
    say(c.filter === 'plane', `a click on Planes: ${c.filter}`);
    await centre(page, T);
    await page.evaluate(click('.carousel-custom'));
    await page.until('window.__ui.hangar.isOpen', 10000);
    await page.evaluate(click('.hangar [data-key="tab-colours"]'));
    await page.evaluate(hangarKey('scheme-twin'));
    await page.evaluate(click('.hangar [data-key="tab-parts"]'));
    await page.evaluate(hangarKey('addon-pod'));
    await page.evaluate(hangarKey('mine-new'));
    await page.evaluate("(() => { const f = document.querySelector('.hangar [data-key=\"mine-name\"]'); f.value = 'Survey'; return true; })()");
    await page.evaluate(hangarKey('mine-name-save'));
    await page.until('!window.__ui.hangar.isOpen && window.__ui.carousel.isOpen', 10000);
    st = await stored(page);
    const survey = st.builds.find((b) => b.name === 'Survey');
    say(Boolean(survey) && same(survey.fit.livery, { scheme: 'twin' }) && same(survey.fit.parts, { prop: 'stock', addons: ['pod', 'lights'] }),
      `the second saved: ${JSON.stringify(survey && survey.fit)}`);

    console.log('4. both listed, each drawn in its own');
    c = await card(page);
    const names = await page.evaluate("[...document.querySelectorAll('.carousel-dot')].map((d) => d.getAttribute('aria-label'))");
    say(c.ids.length === 2 && same(names, ['Bush', 'Survey']), `My Hangar lists both: ${names.join(', ')}`);
    const bushKey = `build:${bush.id}`;
    const surveyKey = `build:${survey.id}`;
    await centre(page, bushKey);
    await page.until(wears(bushKey, coloursFor(T, { scheme: 'timber_x' })), 60000).catch(() => {});
    await page.until(wears(surveyKey, coloursFor(T, { scheme: 'twin' })), 60000).catch(() => {});
    const paints = await page.evaluate(`[window.__pickPaint(${JSON.stringify(bushKey)}), window.__pickPaint(${JSON.stringify(surveyKey)})]`);
    const fits = await page.evaluate(`[window.__pickParts(${JSON.stringify(bushKey)}), window.__pickParts(${JSON.stringify(surveyKey)})]`);
    say(same(sorted(paints[0]), sorted(coloursFor(T, { scheme: 'timber_x' }))) && same(sorted(paints[1]), sorted(coloursFor(T, { scheme: 'twin' }))),
      'each build\'s model wears its own scheme');
    say(fits[0] && fits[1] && same(fits[0].addons, ['lights']) && same([...fits[1].addons].sort(), ['lights', 'pod']),
      `and its own parts: ${JSON.stringify(fits.map((f) => f && f.addons))}`);
    await shots(page, 'my-hangar');

    console.log('5. choosing each seats its own');
    await centre(page, bushKey);
    await page.tap('Enter');
    await page.until('!window.__ui.carousel.isOpen', 10000);
    let ss = await page.evaluate('window.__ui.settings');
    say(ss.airframe === T && same(ss.livery[T], { scheme: 'timber_x' }) && same(ss.parts[T].addons, ['lights']) && ss.buildFits[T].build === bush.id,
      `Enter on Bush seats it: ${JSON.stringify(ss.livery[T])}, ${JSON.stringify(ss.parts[T])}, wearing ${ss.buildFits[T] && ss.buildFits[T].build}`);
    await openPicker(page);
    await toTab(page, 'mine');
    await centre(page, surveyKey);
    await page.evaluate('window.__ui.carousel.pollPad({}); window.__ui.carousel.pollPad({ select: true }); true');
    await page.until('!window.__ui.carousel.isOpen', 10000);
    ss = await page.evaluate('window.__ui.settings');
    say(same(ss.livery[T], { scheme: 'twin' }) && same([...ss.parts[T].addons].sort(), ['lights', 'pod']) && ss.buildFits[T].build === survey.id
      && same(ss.buildFits[T].stock[T].livery, OWN.livery),
      `a pad's A on Survey seats it, the pilot's own kept aside: ${JSON.stringify(ss.livery[T])}, ${JSON.stringify(ss.parts[T].addons)}`);
    await openPicker(page);
    await toTab(page, 'plane');
    await centre(page, T);
    await page.until(wears(T, coloursFor(T, OWN.livery)), 60000).catch(() => {});
    const stockCard = await page.evaluate(`[window.__pickPaint(${JSON.stringify(T)}), window.__pickParts(${JSON.stringify(T)})]`);
    say(same(sorted(stockCard[0]), sorted(coloursFor(T, OWN.livery))) && stockCard[1] && same(stockCard[1].addons, ['lights']),
      `while Survey is worn, the stock Timber's card is still drawn in the pilot's own: ${JSON.stringify(stockCard[1] && stockCard[1].addons)}`);
    await page.tap('Enter');
    await page.until('!window.__ui.carousel.isOpen', 10000);
    ss = await page.evaluate('window.__ui.settings');
    say(same(ss.livery[T], OWN.livery) && same(ss.parts[T].addons, ['lights']) && same(ss.buildFits, {}),
      `choosing the stock Timber puts the pilot's own back: ${JSON.stringify(ss.livery[T])}`);
    /* Flown: Survey in the air, painted and fitted as built. */
    await openPicker(page);
    await toTab(page, 'mine');
    await centre(page, surveyKey);
    await page.tap('Enter');
    await page.until('!window.__ui.carousel.isOpen', 10000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
    await page.until('window.__craftPaint().id === window.__craft().run', 60000).catch(() => {});
    const flown = await page.evaluate('({ paint: window.__craftPaint(), craft: window.__craft() })');
    say(flown.craft.run === T && same(sorted(flown.paint.regions), sorted(coloursFor(T, { scheme: 'twin' }))) && same([...flown.craft.parts.addons].sort(), ['lights', 'pod']),
      `flown, Survey wears the Twin scheme and carries ${JSON.stringify(flown.craft.parts && flown.craft.parts.addons)}`);
    const wire = await page.evaluate('window.__ui.settings.livery[' + JSON.stringify(T) + ']');
    say(same(wire, { scheme: 'twin' }), `the paint a room is sent (settings.livery, src/main.js roomProfile) is the build's: ${JSON.stringify(wire)}`);
    /* In the air, Tab's swap picker: Bush is the same Timber in other
     * clothes, so choosing it refits the craft where it is. */
    await page.tap('Tab');
    await page.until('window.__ui.carousel.isOpen', 10000);
    await toTab(page, 'mine');
    await centre(page, bushKey);
    await page.tap('Enter');
    await page.until("window.__ui.screen === 'flight' && !window.__ui.carousel.isOpen", 30000);
    const bushLook = coloursFor(T, { scheme: 'timber_x' });
    await page.until(`(() => { const p = window.__craftPaint(); const w = ${JSON.stringify(bushLook)}; return Object.keys(w).every((k) => p.regions[k] === w[k]); })()`, 60000).catch(() => {});
    const refit = await page.evaluate('({ paint: window.__craftPaint(), craft: window.__craft() })');
    say(refit.craft.run === T && same(sorted(refit.paint.regions), sorted(bushLook)) && same(refit.craft.parts.addons, ['lights']),
      `in the air, Tab, My Hangar, Enter on Bush refits the Timber in place: ${JSON.stringify(refit.craft.parts && refit.craft.parts.addons)}`);
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
    await page.evaluate("window.__ui.show('title'); true");

    console.log('6. edit and overwrite, and save as new');
    await openPicker(page);
    await toTab(page, 'mine');
    await centre(page, bushKey);
    await page.tap('KeyC');
    await page.until('window.__ui.hangar.isOpen', 10000);
    const head = await page.evaluate("({ title: document.querySelector('.hangar-title').textContent, mine: document.querySelector('.hangar [data-key=\"mine-new\"]').textContent, entry: window.__ui.hangar.entry })");
    say(head.title === 'Bush' && head.mine === 'Save as new' && same(head.entry, { scheme: 'timber_x' }),
      `C on Bush opens the hangar on it: ${JSON.stringify(head)}`);
    await shots(page, 'hangar-build');
    await page.evaluate("window.__ui.hangar.setTab('colours'); true");
    await page.evaluate(hangarKey('scheme-stock'));
    await page.evaluate("window.__ui.hangar.saveBtn.click(); true");
    await page.until('!window.__ui.hangar.isOpen && window.__ui.carousel.isOpen', 10000);
    st = await stored(page);
    const bush2 = st.builds.find((b) => b.id === bush.id);
    say(Boolean(bush2) && bush2.fit.livery === null && st.builds.length === 2 && st.settings.livery[T] === undefined
      && st.settings.buildFits[T].build === bush.id && same(st.settings.buildFits[T].stock[T].livery, OWN.livery),
      `Save overwrites Bush, stock paint now, and the Timber wearing it wears the change: ${JSON.stringify(bush2 && bush2.fit)}`);
    c = await card(page);
    say(c.key === bushKey, `the picker comes back on Bush: ${c.key}`);
    await page.tap('KeyC');
    await page.until('window.__ui.hangar.isOpen', 10000);
    await page.evaluate("window.__ui.hangar.setTab('colours'); true");
    await page.evaluate(hangarKey('scheme-timber'));
    await page.evaluate(hangarKey('mine-new'));
    await page.evaluate("(() => { const f = document.querySelector('.hangar [data-key=\"mine-name\"]'); f.value = 'Spare'; return true; })()");
    await page.evaluate(hangarKey('mine-name-save'));
    await page.until('!window.__ui.hangar.isOpen && window.__ui.carousel.isOpen', 10000);
    st = await stored(page);
    const spare = st.builds.find((b) => b.name === 'Spare');
    const bush3 = st.builds.find((b) => b.id === bush.id);
    say(Boolean(spare) && same(spare.fit.livery, { scheme: 'timber' }) && bush3.fit.livery === null && st.builds.length === 3,
      `Save as new makes a third, Spare, and Bush is as it was: ${st.builds.map((b) => b.name).join(', ')}`);

    console.log('7. rename');
    await centre(page, bushKey);
    await page.tap('KeyR');
    await page.until("document.activeElement && document.activeElement.dataset.key === 'mine-name'", 5000);
    await page.evaluate("(() => { const f = document.activeElement; f.value = '   '; return true; })()");
    await page.tap('Enter');
    const refused = await page.evaluate("(() => { const e = document.querySelector('.carousel-mine-error'); return e && !e.hidden ? e.textContent : null; })()");
    say(Boolean(refused), `an empty name is refused: ${refused}`);
    await page.evaluate("(() => { const f = document.querySelector('.carousel-name-field'); f.value = 'Bush Strip'; f.focus(); return true; })()");
    await page.tap('Enter');
    await page.until('!window.__ui.carousel.form', 5000);
    st = await stored(page);
    c = await card(page);
    say(st.builds.find((b) => b.id === bush.id).name === 'Bush Strip' && c.name === 'Bush Strip' && c.key === bushKey,
      `R, a new name and Enter rename it: ${c.name}`);
    await page.tap('KeyR');
    await page.until('window.__ui.carousel.form', 5000);
    await page.tap('Escape');
    c = await card(page);
    say(c.open && !c.form && c.name === 'Bush Strip', 'Escape leaves a rename as it was, the picker still open');

    console.log('8. delete');
    const spareKey = `build:${spare.id}`;
    await centre(page, spareKey);
    await page.tap('Delete');
    c = await card(page);
    say(c.form && c.focus === 'mine-keep', `Delete asks first, Keep under the cursor: ${c.focus}`);
    await page.tap('Enter');
    c = await card(page);
    say(!c.form && c.ids.includes(spareKey), 'Enter on Keep keeps it');
    await page.evaluate('window.__ui.carousel.pollPad({}); window.__ui.carousel.pollPad({ floats: true }); true');
    c = await card(page);
    say(c.form && c.focus === 'mine-keep' && c.open, 'a pad\'s Y on a build asks to delete it');
    await page.evaluate('window.__ui.carousel.pollPad({}); window.__ui.carousel.pollPad({ back: true }); true');
    c = await card(page);
    say(!c.form && c.open && c.ids.includes(spareKey), 'and B keeps it, the picker still open');
    await page.evaluate(click('.carousel [data-key="mine-delete"]'));
    await page.tap('ArrowRight');
    c = await card(page);
    say(c.focus === 'mine-delete-yes', `a click on Delete asks, Right moves to Delete: ${c.focus}`);
    await page.tap('Enter');
    st = await stored(page);
    c = await card(page);
    say(!st.builds.some((b) => b.id === spare.id) && c.ids.length === 2 && !c.ids.includes(spareKey), `Enter deletes Spare: ${st.builds.map((b) => b.name).join(', ')}`);
    await page.tap('Escape');
    await page.until('!window.__ui.carousel.isOpen', 10000);

    console.log('9. reloaded');
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await ready(page);
    const after = await page.evaluate('({ builds: window.__ui.myBuilds.map((b) => [b.name, b.airframe, b.fit.livery]), s: window.__ui.settings })');
    say(same(after.builds, [['Bush Strip', T, null], ['Survey', T, { scheme: 'twin' }]]), `both builds are kept: ${JSON.stringify(after.builds)}`);
    say(after.s.buildFits[T] && after.s.buildFits[T].build === bush.id && after.s.livery[T] === undefined && same(after.s.buildFits[T].stock[T].livery, OWN.livery),
      'Bush Strip is still worn, the pilot\'s own still kept aside');
    await openPicker(page);
    await toTab(page, 'plane');
    await centre(page, T);
    await page.until(wears(T, coloursFor(T, OWN.livery)), 60000).catch(() => {});
    const stockAgain = await page.evaluate(`window.__pickPaint(${JSON.stringify(T)})`);
    say(same(sorted(stockAgain), sorted(coloursFor(T, OWN.livery))), 'the stock Timber\'s card still shows the pilot\'s old customisation');
    await page.tap('KeyC');
    await page.until('window.__ui.hangar.isOpen', 10000);
    const stockHangar = await page.evaluate("({ entry: window.__ui.hangar.entry, title: document.querySelector('.hangar-title').textContent })");
    say(same(stockHangar.entry, OWN.livery) && stockHangar.title === 'Hangar', `and its Customise opens on it: ${JSON.stringify(stockHangar)}`);
    await page.tap('Escape');
    await page.until('!window.__ui.hangar.isOpen && window.__ui.carousel.isOpen', 10000);
    await shots(page, 'picker');
    await page.tap('Escape');

    console.log('10. a drone: the 7 inch\'s loadout as a build');
    await openPicker(page);
    await toTab(page, 'quad');
    await centre(page, '7inch');
    await page.tap('KeyC');
    await page.until('window.__ui.hangar.isOpen', 10000);
    const loadout = await page.evaluate("({ tab: window.__ui.hangar.tab, mine: (document.querySelector('.hangar [data-key=\"mine-new\"]') || {}).textContent })");
    say(loadout.tab === 'loadout' && loadout.mine === 'Save to My Hangar', `Customise on the 7 inch opens its loadout with Save to My Hangar: ${JSON.stringify(loadout)}`);
    await page.evaluate(hangarKey('payload-wide'));
    await page.evaluate(hangarKey('accessory-pack2'));
    await page.evaluate(hangarKey('mine-new'));
    await page.evaluate("(() => { const f = document.querySelector('.hangar [data-key=\"mine-name\"]'); f.value = 'Long range'; return true; })()");
    await page.evaluate(hangarKey('mine-name-save'));
    await page.until('!window.__ui.hangar.isOpen && window.__ui.carousel.isOpen', 10000);
    st = await stored(page);
    const quad = st.builds.find((b) => b.name === 'Long range');
    say(Boolean(quad) && quad.airframe === '7inch' && same(quad.fit.combat, { payload: 'wide', accessories: ['pack2'] }) && !(st.settings.combat && st.settings.combat['7inch']),
      `saved as a build, the stock 7 inch untouched: ${JSON.stringify(quad && quad.fit.combat)}`);
    await page.tap('Enter');
    await page.until('!window.__ui.carousel.isOpen', 10000);
    ss = await page.evaluate('window.__ui.settings');
    say(ss.airframe === '7inch' && same(ss.combat['7inch'], { payload: 'wide', accessories: ['pack2'] }) && ss.buildFits['7inch'].build === quad.id,
      `chosen, the 7 inch is seated carrying it: ${JSON.stringify(ss.combat['7inch'])}`);
    await openPicker(page);
    await toTab(page, 'quad');
    await centre(page, '7inch');
    await page.tap('Enter');
    await page.until('!window.__ui.carousel.isOpen', 10000);
    ss = await page.evaluate('window.__ui.settings');
    say(!(ss.combat && ss.combat['7inch']) && !ss.buildFits['7inch'], `the stock 7 inch chosen again carries its own: ${JSON.stringify(ss.combat)}`);

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
