/*
 * progress-check.js: progression and the hangar's small touches, in the
 * real shell, headless, the way a new pilot meets them.
 *
 *   1. A new pilot on the gentle curve: level 1, the Skyhunter locked in
 *      the picker (its Choose says the level and does not choose), the
 *      Timber's 3S power option locked in the hangar.
 *   2. The hangar: the Power tab pulls the power system apart (the prop
 *      off its shaft, a motor and a pack out of the model), a pack card
 *      flies the camera to the pack and an option card to the motor, in a
 *      lifted arc; the Colours tab puts it all back. The Challenges tab
 *      lists the level, the switch and the challenges.
 *   6. Firsts: a v1 profile with a war win and an hour on the Cub is paid
 *      once at load, and the hangar lights the milestones.
 * No console error or uncaught exception anywhere.
 *
 * Parts 3 to 5 (a track built on the Alps with the builder's own controls
 * and flown by the Timber for its XP, the casual sky track, the item that
 * XP unlocked in the hangar and Unlock everything after it) left with the
 * track builder and the race (the combat-only cut, 2026-10-20): nothing in
 * the shell earns that XP now.
 *
 *   node scripts/progress-check.js [OUT_DIR]
 *
 * Pictures land in OUT_DIR (tmp/progress-check by default). They are
 * evidence for one look, not for the repository: delete them after.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'progress-check'));
await mkdir(outDir, { recursive: true });
const only = process.env.PROGRESS_ONLY || '';

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


/* A new pilot: the Timber seated in angle mode so a stick is an attitude,
 * and progress stored fresh on the curve. Once, marked under a key of its
 * own because the settings store keeps only the keys it knows: a reload
 * keeps what the page wrote. */
const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'timber1500');
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!localStorage.getItem('progress-check-seeded')) {
    Object.assign(s, ${JSON.stringify(seated)}, {
      airframeAsked: true, fpsCap: 0, graphics: 'low', flightMode: 'angle',
      progress: { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: false },
    });
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('progress-check-seeded', '1');
  }
} catch (e) { /* storage refused; the checks below will say so */ }
navigator.getGamepads = () => [];`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

function faults(page) {
  return page.errors.filter((e) => !e.startsWith('network:'));
}

async function shellUp(page) {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
}

const progress = (page) => page.evaluate('JSON.parse(JSON.stringify(window.__ui.settings.progress))');
const stored = (page) => page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).progress`);
const click = (keyName) => `(() => { const b = document.querySelector('.hangar [data-key="${keyName}"]'); if (!b) throw new Error('no ${keyName}'); b.click(); return true; })()`;
const card = (keyName) => `(() => { const b = document.querySelector('.hangar [data-key="${keyName}"]'); return b ? { disabled: b.disabled, locked: b.classList.contains('pg-locked'), text: b.textContent, isNew: Boolean(b.querySelector('.pg-new')) } : null; })()`;
const cam = (page) => page.evaluate('window.__carouselStats().camera');
const exploded = (page) => page.evaluate('window.__carouselStats().exploded');
/* Let the set's springs land. A headless page draws few frames a second
 * and the set steps at most 50 ms a frame, so this waits on the set's own
 * numbers rather than on a clock. */
const settle = (page, ms = 1400) => page.sleep(ms);
const EXPLODED = (cond) => `(() => { const e = window.__carouselStats().exploded; return Boolean(e) && (${cond}); })()`;
/* The camera on the view it was flying to (the rig's own target). */
const LANDED = (focus) => `(() => { const c = window.__carouselStats().camera; return Boolean(c) && c.focus === '${focus}' && ['zoom', 'up', 'along', 'elev'].every((k) => Math.abs(c[k] - c.target[k]) < 0.01); })()`;

async function openPicker(page, id) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
}

async function openHangar(page, id) {
  await openPicker(page, id);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
}

async function closeHangar(page) {
  await page.evaluate('window.__ui.hangar.cancel(); true');
  await page.until('!window.__ui.hangar.isOpen', 5000);
  await page.evaluate('window.__ui.carousel.close(); true');
}

async function newPilot(page) {
  console.log('1. a new pilot on the gentle curve');
  const p = await progress(page);
  say(p.xp === 0 && p.unlockAll === false, `level 1, 0 XP, Unlock everything off: ${JSON.stringify(p)}`);
  await openPicker(page, 'sky1800');
  const sky = await page.evaluate(`({
    id: window.__ui.carousel.current(),
    choose: window.__ui.carousel.chooseBtn.textContent,
    lock: (document.querySelector('.carousel-info .pg-lock') || {}).textContent || null,
    why: (document.querySelector('.carousel-info .pg-why') || {}).textContent || null,
  })`);
  say(sky.id === 'sky1800' && /3/.test(sky.lock || '') && /Level 3 opens the Skyhunter, 180 XP/.test(sky.why || '') && sky.choose === 'Unlock everything',
    `the Skyhunter is on show, locked, with what opens it and a way past it: "${sky.lock}", "${sky.why}", its button "${sky.choose}"`);
  await shot(page, '1-picker-locked');
  await page.evaluate('window.__ui.carousel.close(); true');
  const rows = await page.evaluate("(window.__ui.show('pilot'), window.__ui.items().filter((it) => /Unlock/.test(it.label || '')).length)");
  say(rows === 0, `Settings carries no progression row (${rows}): the switch lives where a lock is met`);
  await page.evaluate("window.__ui.show('title'); true");
}

async function hangarTouches(page) {
  console.log('2. the hangar: exploded power, the camera to the part, the Challenges tab');
  await openHangar(page, 'timber1500');
  const three = await page.evaluate(card('option-3s'));
  say(three && three.disabled && three.locked && /2/.test(three.text), `the Timber's 3S option is shown locked: ${JSON.stringify(three)}`);
  await page.evaluate(click('tab-parts'));
  await page.until("window.__ui.hangar.tab === 'parts'", 5000);
  const parts = await page.evaluate(`({ stock: ${card('prop-stock')}, apc: ${card('prop-11x7e')}, pod: ${card('addon-pod')}, smoke: ${card('addon-smoke')} })`);
  say(parts.stock && !parts.stock.locked && parts.apc.locked && /Level 2/.test(parts.apc.text) && parts.pod.locked && /Level 3/.test(parts.pod.text) && /Level 5/.test(parts.smoke.text),
    `the Parts tab: the stock prop open, the APC prop locked to level 2, the camera pod to 3, the smoke to 5: ${JSON.stringify(parts)}`);
  await shot(page, '2-parts-locked');
  await page.evaluate(click('tab-power'));
  await page.until("window.__ui.hangar.tab === 'power'", 5000);
  await page.until(EXPLODED('e.amount > 0.98'), 120000).catch(() => {});
  const ex = await exploded(page);
  say(ex && ex.amount > 0.95 && ex.propOut > 0.05 && ex.parts.includes('motor') && ex.parts.includes('pack'),
    `the Power tab pulls the power system apart: ${JSON.stringify(ex)}`);
  await shot(page, '2-power-exploded');
  const before = await cam(page);
  await page.evaluate(click('pack-4s5000'));
  await page.until(`window.__carouselStats().camera.moves > ${before.moves}`, 30000).catch(() => {});
  const mid = await cam(page);
  await page.until(LANDED('pack'), 120000).catch(() => {});
  await page.until(EXPLODED("e.key.endsWith(':4s5000') && e.amount > 0.98"), 60000).catch(() => {});
  const pack = await cam(page);
  say(pack.focus === 'pack' && pack.moves > before.moves && mid.lift > 0,
    `a pack card flies the camera to the pack: focus ${pack.focus}, moves ${before.moves} to ${pack.moves}, lift ${mid.lift.toFixed(2)}`);
  say(['zoom', 'up', 'along', 'elev'].every((k) => Math.abs(pack[k] - pack.target[k]) < 0.01) && pack.target.up < 0 && pack.target.zoom < 0.5,
    `and it lands on the pack's view, close and low: zoom ${pack.zoom.toFixed(3)}, up ${pack.up.toFixed(3)}, target ${JSON.stringify(pack.target)}`);
  const exPack = await exploded(page);
  say(exPack.key.endsWith(':4s5000') && exPack.parts.includes('pack'), `the pack drawn is the one chosen: ${exPack.key}`);
  await shot(page, '2-power-pack');
  await page.evaluate(click('option-stock'));
  await page.until(LANDED('motor'), 120000).catch(() => {});
  const motor = await cam(page);
  say(motor.focus === 'motor' && motor.moves > pack.moves && motor.target.along < -1 && Math.abs(motor.along - motor.target.along) < 0.01,
    `a motor card flies it to the motor, just ahead of the Timber's prop: focus ${motor.focus}, moves ${motor.moves}, along ${motor.along.toFixed(3)}`);
  await shot(page, '2-power-motor');
  await page.evaluate(click('pack-4s3200'));
  await page.tap('KeyE');
  await page.until("window.__ui.hangar.tab === 'colours'", 5000);
  await page.until(EXPLODED('e.amount === 0'), 120000).catch(() => {});
  const back = await exploded(page);
  say(back.amount === 0 && back.parts.length === 0 && back.propOut < 1e-9, `the Colours tab puts it back together: ${JSON.stringify(back)}`);
  /* The paint shop's locks: a scheme, a finish and the decals. */
  const paint = await page.evaluate(`({ stock: ${card('scheme-stock')}, super: ${card('scheme-super')}, gloss: ${card('finish-gloss')}, chrome: ${card('finish-chrome')},
    swatches: [...document.querySelectorAll('.hangar .hangar-swatch')].filter((b) => b.disabled).length })`);
  say(paint.stock && !paint.stock.locked && paint.super.locked && /Level 3/.test(paint.super.text) && !paint.gloss.locked && paint.chrome.locked && /Level 4/.test(paint.chrome.text) && paint.swatches === 0,
    `the Colours tab: the stock scheme and gloss open, Super Timber locked to 3, chrome to 4, no swatch of the palette locked: ${JSON.stringify(paint)}`);
  await page.evaluate(click('page-decals'));
  await page.evaluate(click('decal-add'));
  const decals = await page.evaluate(`({ num: ${card('kind-num')}, stripe: ${card('kind-stripe')}, chevron: ${card('kind-chevron')}, wings: ${card('kind-wings')} })`);
  say(!decals.num.locked && !decals.stripe.locked && decals.chevron.locked && /Level 2/.test(decals.chevron.text) && /Level 5/.test(decals.wings.text),
    `the decals: a number and a stripe free, chevrons locked to 2, wings to 5: ${JSON.stringify(decals)}`);
  await shot(page, '2-decals-locked');
  await page.evaluate(click('page-paint'));
  await page.evaluate(click('tab-challenges'));
  await page.until("window.__ui.hangar.tab === 'challenges'", 5000);
  await settle(page, 900);
  const tab = await page.evaluate(`({
    rows: [...document.querySelectorAll('.pg-ch')].map((r) => r.dataset.challenge),
    words: [...document.querySelectorAll('.pg-ch')].slice(0, 3).map((r) => [r.querySelector('.pg-ch-title').textContent, r.querySelector('.pg-ch-xp').textContent]),
    head: (document.querySelector('.pg-tab .hangar-h + .pg-level ~ .hangar-h') || {}).textContent,
    level: (document.querySelector('.pg-ring-in') || {}).textContent,
    sw: (document.querySelector('.pg-switch') || {}).getAttribute ? document.querySelector('.pg-switch').getAttribute('aria-checked') : null,
  })`);
  say(tab.rows.length === 10 && tab.level === '1' && tab.sw === 'false' && tab.rows[3] === 'timber_clean',
    `the Challenges tab: level ${tab.level}, the switch off, ${tab.rows.length} challenges, the Timber's own three and then its first: ${tab.rows.join(', ')}`);
  /* The aircraft's own three (PROGRESSION.md section 5), first, beside
   * the aircraft, with the amounts its class gives: three landings, a
   * casual lap under 3 200 m at the middle of its stall and top speed
   * (7.2 and 27.2 m/s, so 187 s), five minutes up; 60 XP each. */
  say(tab.head === 'With the Turbo Timber' && JSON.stringify(tab.rows.slice(0, 3)) === JSON.stringify(['timber1500:landings', 'timber1500:lap', 'timber1500:endurance'])
    && JSON.stringify(tab.words) === JSON.stringify([['3 landings in one flight', '+60 XP'], ['Casual lap under 3:07.00', '+60 XP'], ['5 minutes up', '+60 XP']]),
    `the Timber's own challenges head the tab: ${tab.head}, ${JSON.stringify(tab.words)}`);
  await shot(page, '2-challenges');
  await closeHangar(page);
}

/* Firsts (docs/ECONOMY.md): a profile that already holds a war win and an
 * hour on the Cub, written as a build before progress v2 would have left
 * it, is paid once at load; a second load pays nothing; the hangar lights
 * the Cub's milestones. */
async function firstsAtLoad(page) {
  console.log('6. firsts: a v1 profile with a war win and an hour on the Cub');
  await page.evaluate(`(() => {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k));
    s.progress = { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, casual: {}, unlockAll: false };
    s.campaign = { v: 1, missions: { 'itaipu-1': { stars: 2, won: true, credits: 300 } }, earned: 300, owned: {}, equipped: { warhead: 'standard', speed: false }, films: {}, flags: {} };
    s.flightTime = { checkdevice1: { first: '2026-10-01', by: { cub1400: { free: 3700 } } } };
    localStorage.setItem(k, JSON.stringify(s));
    return true;
  })()`);
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await shellUp(page);
  const p = await progress(page);
  const want = ['mission:itaipu-1:win', 'mission:itaipu-1:star1', 'mission:itaipu-1:star2', 'aircraft:cub1400:flight', 'aircraft:cub1400:ten', 'aircraft:cub1400:hour'];
  say(p.v === 2 && want.every((k) => p.firsts[k]) && p.xp === 100 + 40 * 2 + 40 + 60 + 150, `migrated to v2 and paid each first once: ${p.xp} XP, ${Object.keys(p.firsts).join(', ')}`);
  const toast = await page.evaluate("window.__ui.progress.log.filter((t) => /first/.test(t.cls)).map((t) => [t.kicker, t.title, t.sub])");
  say(toast.length === 1 && /First Light: won/.test(toast[0][1]) && /5 more firsts/.test(toast[0][2]), `one toast says so: ${JSON.stringify(toast)}`);
  const onDisk = await stored(page);
  say(onDisk.v === 2 && onDisk.xp === p.xp, `stored as v2 with the XP (${onDisk.xp})`);
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await shellUp(page);
  const again = await progress(page);
  say(again.xp === p.xp, `a second load pays nothing (${again.xp} XP)`);
  await openHangar(page, 'cub1400');
  const pips = await page.evaluate("[...document.querySelectorAll('.hangar [data-key=\"milestones\"] .hangar-milestone')].map((e) => [e.dataset.milestone, e.classList.contains('on'), e.textContent])");
  say(pips.length === 3 && pips.every((x) => x[1]), `the Cub's three milestones are lit in the hangar: ${JSON.stringify(pips)}`);
  await shot(page, '6-hangar-milestones');
  await closeHangar(page);
  await openHangar(page, 'timber1500');
  const none = await page.evaluate("[...document.querySelectorAll('.hangar [data-key=\"milestones\"] .hangar-milestone.on')].length");
  say(none === 0, `the Timber, never flown, has none lit (${none})`);
  await closeHangar(page);
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await shellUp(page);
    if (!only || only === 'hangar') {
      await newPilot(page);
      await hangarTouches(page);
    }
    if (!only || only === 'firsts') {
      await firstsAtLoad(page);
    }
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
