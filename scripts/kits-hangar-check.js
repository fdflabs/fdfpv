/*
 * kits-hangar-check.js: the hangar's Kit tab with a real pointer
 * (docs/KITS.md section 8, PR 4). On each quad: the Kit tab pressed,
 * an option pointed at (the model tries it on, nothing saved), pressed
 * (fitted), saved, and read back from the settings; then the hangar
 * opened again shows it fitted. Pictures of the model before and after.
 *
 * usage: node scripts/kits-hangar-check.js [outdir]
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
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, 'tmp', 'kits-hangar-check'));
await mkdir(outDir, { recursive: true });

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

/* Per quad: the option pointed at, and the two pressed. */
const PLAN = {
  '7inch': { hover: ['arms', 'blade'], press: [['arms', 'tapered'], ['antenna', 'pagoda']] },
  '10inch': { hover: ['top', 'armoured'], press: [['arms', 'cutout'], ['mount', 'cage']] },
  interceptor: { hover: ['antenna', 'dualt'], press: [['top', 'armoured'], ['arms', 'blade']] },
};

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, {
    airframeAsked: true, fpsCap: 0, graphics: 'low',
    progress: { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true },
  });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused; the checks below will say so */ }`];

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  await writeFile(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}

/* A card that has stopped moving (the cards slide in one after another),
 * as scripts/paint-workshop-check.js waits for one. */
async function steady(page, selector) {
  await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (b) b.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`);
  let last = '';
  let same = 0;
  for (let i = 0; i < 100; i++) {
    const r = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return 'none'; const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, getComputedStyle(b).opacity].join(); })()`);
    same = r === last && r !== 'none' ? same + 1 : 0;
    if (same >= 2) {
      return;
    }
    last = r;
    await page.sleep(120);
  }
  throw new Error(`${selector} never stood still`);
}

async function press(page, selector) {
  await steady(page, selector);
  return page.click(selector);
}

async function pointAt(page, selector) {
  const c = await page.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...c }, page.sessionId);
}

async function openHangar(page, id) {
  await page.evaluate('window.__ui.openCraftRow(false); true');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate(`window.__ui.carousel.setFilter('all'); window.__ui.carousel.goTo(window.__ui.carousel.ids.indexOf(${JSON.stringify(id)})); true`);
  await page.tap('KeyC');
  await page.until(`window.__ui.hangar.isOpen && window.__ui.hangar.id === ${JSON.stringify(id)}`, 10000);
  await page.until('Boolean(window.__carouselStats().camera)', 120000);
}

async function closeAll(page) {
  await page.until('!window.__ui.hangar.isOpen', 10000).catch(() => {});
  await page.evaluate('window.__ui.carousel.close(); true');
}

const savedKit = (id) => `JSON.stringify(((window.__ui.settings.livery || {})[${JSON.stringify(id)}] || {}).kit || null)`;

async function quad(page, id) {
  const plan = PLAN[id];
  await openHangar(page, id);
  say(await page.click('.hangar [data-key="tab-kit"]'), `${id}: the Kit tab is there and pressed`);
  await page.until("window.__ui.hangar.tab === 'kit'", 5000);
  await page.click('.hangar [data-key="view-top"]');
  await page.sleep(2500);
  await shot(page, `${id}-1-stock`);

  const [hs, ho] = plan.hover;
  await pointAt(page, `.hangar [data-key="kit-${hs}-${ho}"]`);
  await page.sleep(1500);
  const tried = await page.evaluate(`JSON.stringify(window.__ui.hangar.shownEntry().kit || null)`);
  const entry = await page.evaluate(`JSON.stringify(window.__ui.hangar.entry.kit || null)`);
  say(tried === JSON.stringify({ v: 1, parts: { [hs]: ho } }) && entry === 'null', `${id}: pointing at ${hs} ${ho} tries it on (${tried}), nothing fitted (${entry})`);
  await shot(page, `${id}-2-tried-${hs}-${ho}`);

  /* Every option of every slot pointed at in turn: the cache keeps one
   * kitted model per aircraft, so the count stays put. */
  const before = await page.evaluate('window.__carouselStats().models');
  const all = await page.evaluate("[...document.querySelectorAll('.hangar .kit-tab [data-key^=\"kit-\"]')].map((b) => b.dataset.key)");
  for (const k of all) {
    await pointAt(page, `.hangar [data-key="${k}"]`);
    await page.sleep(250);
  }
  await page.sleep(500);
  const after = await page.evaluate('window.__carouselStats().models');
  say(after <= before + 1, `${id}: ${all.length} options pointed at, models cached ${before} -> ${after}`);

  for (const [s, o] of plan.press) {
    await page.click(`.hangar [data-key="kit-${s}-${o}"]`);
    await page.sleep(300);
  }
  /* In slot order, as configs/kits.js kitParts keeps it. */
  const order = ['arms', 'top', 'mount', 'antenna'];
  const want = JSON.stringify({ v: 1, parts: Object.fromEntries([...plan.press].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))) });
  const fitted = await page.evaluate(`JSON.stringify(window.__ui.hangar.entry.kit || null)`);
  say(fitted === want, `${id}: pressing fits ${fitted}`);
  await page.sleep(2000);
  await shot(page, `${id}-3-fitted`);
  await page.click('.hangar [data-key="save"]');
  await page.until(`${savedKit(id)} === ${JSON.stringify(want)}`, 10000).catch(() => {});
  say(await page.evaluate(savedKit(id)) === want, `${id}: Save keeps it in settings.livery`);
  await closeAll(page);

  await openHangar(page, id);
  await page.click('.hangar [data-key="tab-kit"]');
  await page.until("window.__ui.hangar.tab === 'kit'", 5000);
  const pressed = await page.evaluate(`[...document.querySelectorAll('.hangar .kit-tab [aria-pressed="true"]')].map((b) => b.dataset.key).sort().join(',')`);
  const wantPressed = [...plan.press.map(([s, o]) => `kit-${s}-${o}`)];
  say(wantPressed.every((k) => pressed.includes(k)), `${id}: opened again, the fitted options show pressed: ${pressed}`);
  await page.tap('Escape');
  await closeAll(page);
}

/* The arm LEDs on the 7 inch: a colour and a pattern pressed, saved,
 * and the built model's LEDs running the pattern on the flight clock. */
async function leds(page) {
  const id = '7inch';
  await openHangar(page, id);
  await page.click('.hangar [data-key="tab-kit"]');
  await page.until("window.__ui.hangar.tab === 'kit'", 5000);
  say(await press(page, '.hangar [data-key="led-00b7ff"]'), `${id}: the blue LED swatch is there and pressed`);
  await page.sleep(300);
  say(await press(page, '.hangar [data-key="pattern-chase"]'), `${id}: the Chase pattern is offered once a colour is on`);
  await page.sleep(300);
  const lights = await page.evaluate('JSON.stringify(window.__ui.hangar.entry.lights || null)');
  say(lights === JSON.stringify({ v: 1, led: '#00b7ff', pattern: 'chase' }), `${id}: fitted lights ${lights}`);
  await page.click('.hangar [data-key="view-left"]');
  await page.sleep(2500);
  await shot(page, `${id}-4-leds`);
  await page.sleep(170);
  await shot(page, `${id}-4-leds-later`);
  await page.click('.hangar [data-key="save"]');
  await page.until(`JSON.stringify(((window.__ui.settings.livery || {})['${id}'] || {}).lights || null) === ${JSON.stringify(lights)}`, 10000).catch(() => {});
  say(await page.evaluate(`JSON.stringify(((window.__ui.settings.livery || {})['${id}'] || {}).lights || null)`) === lights, `${id}: Save keeps the lights`);
  await closeAll(page);
  const run = await page.evaluate(`(async () => {
    const { craftBuilderFor } = await import('./src/render/craft.js');
    const c = craftBuilderFor('${id}')({ fog: false, lights: ${lights} });
    const leds = [0, 1, 2, 3].map((m) => c.group.getObjectByName('led-' + m));
    const lit = (t) => { c.setLights(t, 0.5, 1); return leds.map((l) => l.material.color.getHex() === 0x00b7ff ? 1 : 0).join(''); };
    const stock = craftBuilderFor('${id}')({ fog: false });
    const t0 = performance.now();
    for (let i = 0; i < 20000; i += 1) {
      c.setLights(i * 16.7, 0.5, 1);
    }
    const usPerFrame = ((performance.now() - t0) * 1000) / 20000;
    let meshes = 0;
    c.group.traverse((o) => { meshes += o.isMesh && o.name.startsWith('led-') ? 1 : 0; });
    return { found: leds.every(Boolean), steps: [0, 110, 220, 330].map(lit), again: lit(110), stock: Boolean(stock.setLights) || Boolean(stock.group.getObjectByName('led-0')), usPerFrame, meshes };
  })()`);
  say(run.found && run.steps.join() === '1000,0100,0010,0001' && run.again === '0100', `${id}: the LEDs chase round the arms on the flight clock: ${run.steps.join(' ')}`);
  say(!run.stock, `${id}: a quad without lights builds no LEDs`);
  /* The budget (docs/KITS.md section 4): 4 draws and well under 0.05 ms of
   * script a frame for the own craft's LEDs. */
  say(run.meshes === 4 && run.usPerFrame < 50, `${id}: LED cost: ${run.meshes} extra draws, setLights ${run.usPerFrame.toFixed(2)} us a frame`);
}

/* A plane's Kit tab: its slot options, Nav lights and Strobes pressed,
 * saved, and pictured from the front left. */
async function navLights(page, id) {
  await openHangar(page, id);
  await press(page, '.hangar [data-key="tab-kit"]');
  await page.until("window.__ui.hangar.tab === 'kit'", 5000);
  const slots = await page.evaluate("document.querySelectorAll('.hangar .kit-tab [data-key^=\"kit-\"]').length");
  say(slots > 0, `${id}: its kit slot options are offered (${slots})`);
  await press(page, '.hangar [data-key="light-nav"]');
  await page.sleep(300);
  await press(page, '.hangar [data-key="light-strobe"]');
  await page.sleep(300);
  const lights = await page.evaluate('JSON.stringify(window.__ui.hangar.entry.lights || null)');
  say(lights === JSON.stringify({ v: 1, nav: true, strobe: true }), `${id}: nav lights and strobes fitted ${lights}`);
  await press(page, '.hangar [data-key="view-front"]');
  await page.sleep(2500);
  await shot(page, `${id}-nav`);
  await press(page, '.hangar [data-key="save"]');
  await page.until(`JSON.stringify(((window.__ui.settings.livery || {})['${id}'] || {}).lights || null) === ${JSON.stringify(lights)}`, 10000).catch(() => {});
  say(await page.evaluate(`JSON.stringify(((window.__ui.settings.livery || {})['${id}'] || {}).lights || null)`) === lights, `${id}: Save keeps the lights`);
  await closeAll(page);
}

/* Every plane family: red left, green right, white aft, the strobes on
 * the flight clock, and nothing added without lights. */
async function navEveryPlane(page) {
  const got = await page.evaluate(`(async () => {
    const { craftBuilderFor } = await import('./src/render/craft.js');
    const { addNavLights } = await import('./src/render/navlights.js');
    const { KITS, lightsFor } = await import('./configs/kits.js');
    const out = [];
    for (const id of Object.keys(KITS).filter((f) => lightsFor(f).nav)) {
      const c = addNavLights(craftBuilderFor(id)({ fog: false }), { v: 1, nav: true, strobe: true });
      const g = (n) => c.group.getObjectByName(n);
      c.setLights(30);
      const on = g('strobe-left').visible;
      c.setLights(600);
      const off = !g('strobe-left').visible;
      const plain = addNavLights(craftBuilderFor(id)({ fog: false }), null);
      out.push({ id, ok: g('nav-left').position.x < 0 && g('nav-right').position.x > 0 && g('nav-tail').position.z > 0 && on && off && !plain.group.getObjectByName('nav-left') });
    }
    return out;
  })()`);
  for (const r of got) {
    say(r.ok, `${r.id}: red left, green right, white aft, strobes flash on the flight clock, none without lights`);
  }
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await page.until('!!window.__shellReady', 300000);
    await page.until('window.__map && window.__map().ready', 400000);
    for (const id of process.env.KITS_LEDS_ONLY ? [] : Object.keys(PLAN)) {
      await quad(page, id);
    }
    await leds(page);
    for (const id of ['sky1800', 'p51d1450', 'f16878']) {
      await navLights(page, id);
    }
    await navEveryPlane(page);
    const f = page.errors.filter((e) => !e.startsWith('network:'));
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    say(false, `the check stopped: ${e.message}; the page said: ${page.errors.slice(0, 3).join(' | ')}`);
  } finally {
    await page.close();
  }
  console.log(`\n${passed} passed, ${failed} failed; pictures in ${outDir}`);
  process.exit(failed ? 1 : 0);
}

await main();
