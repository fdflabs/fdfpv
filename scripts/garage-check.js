/*
 * garage-check.js: the hangar as a garage (src/ui/hangar.js), in the real
 * shell, headless, every category of it on the Timber and the build it
 * makes carried everywhere a livery goes.
 *
 *   1. Paint: carbon on the wing, bare aluminium on the fuselage, and the
 *      wear stepped from factory new by the keyboard and by a click on its
 *      bar, all on the model before Save.
 *   2. Livery and decals: a skull, a shark mouth and the flag of Paraguay
 *      placed by aiming, and a text decal: the pilot's words typed and
 *      worn in stencil lettering, a word the filter refuses turned away
 *      with the decal keeping its last good words.
 *   3. Parts: the camera pod, and the spec sheet over the stage carrying
 *      its weight.
 *   4. Tune: lead in the nose on the Tuning tab.
 *   5. The view: the wheel zooms, a drag up and down tilts, J L I K U O
 *      and a pad's right stick turn, tilt and zoom, all reaching the
 *      camera.
 *   6. Save to My Hangar, and the build chosen: the slots wear it, and
 *      flown the craft does; the categories laid out as a rail beside the
 *      panel.
 *   7. Where else a livery goes: the profile a room is sent, through the
 *      room's own check and drawn by the code a peer draws with, wears the
 *      finishes, the decals and the wear; a refused word sent by hand is
 *      dropped there. (A replay file keeping the wear is
 *      scripts/crashcam-selftest.js's.)
 *   8. Reloaded: the build, its wear and its words kept.
 * And no console error or uncaught exception anywhere.
 *
 *   node scripts/garage-check.js [outdir]
 *
 * With an outdir, pictures of every category at 1280x720 and 390x844 go
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

const T = 'timber1500';
const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, T);
s.map = 'alps';
s.graphics = 'low';
s.flightMode = 'angle';
s.fpsCap = 0;
s.airframeAsked = true;
const seed = [`try {
  if (!localStorage.getItem('garageCheckSeeded')) {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.removeItem(${JSON.stringify(BUILDS_KEY)});
    localStorage.setItem('garageCheckSeeded', '1');
  }
} catch (e) { /* storage refused */ }`];

const faults = (page) => page.errors.filter((e) => !e.startsWith('network:'));

async function ready(page) {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
}

const click = (key) => `(() => { const b = document.querySelector('.hangar [data-key="${key}"]'); if (!b) throw new Error('no ${key}'); b.click(); return true; })()`;
/* The hangar's model as drawn, once it wears what `test` asks. */
const lookWhen = (test) => `(async () => {
  for (let i = 0; i < 120; i += 1) {
    const l = window.__pickLook(${JSON.stringify(T)});
    if (l && (${test})) return l;
    await new Promise((r) => setTimeout(r, 100));
  }
  return window.__pickLook(${JSON.stringify(T)});
})()`;

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
}

async function shots(page, name) {
  await shoot(page, name, 1280, 720);
  await shoot(page, name, 390, 844);
  await page.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, page.sessionId);
  await page.sleep(300);
}

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

async function main() {
  if (outdir) {
    await mkdir(outdir, { recursive: true });
  }
  const page = await openPage({ root, width: 1280, height: 720, seed });
  try {
    await ready(page);
    await page.evaluate('window.__ui.openCraftRow(false); true');
    await page.until('window.__ui.carousel.isOpen', 10000);
    const at = await page.evaluate(`window.__ui.carousel.ids.indexOf(${JSON.stringify(T)})`);
    await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
    await page.tap('KeyC');
    await page.until('window.__ui.hangar.isOpen', 10000);

    console.log('1. paint: carbon, bare aluminium, wear');
    await page.tap('KeyE');
    await page.until("window.__ui.hangar.tab === 'colours'", 5000);
    await page.evaluate(click('region-wing'));
    await page.evaluate(click('finish-carbon'));
    await page.evaluate(click('region-fuselage'));
    await page.evaluate(click('finish-aluminium'));
    /* The keyboard's way to the wear: the cursor on More worn, Enter. */
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate("window.__ui.hangar.focusKey('wear-up'); true");
      await page.tap('Enter');
    }
    let entry = await page.evaluate('window.__ui.hangar.entry');
    say(entry.finishes.wing === 'carbon' && entry.finishes.fuselage === 'aluminium' && entry.wear === 30,
      `carbon on the wing, aluminium on the fuselage, Enter three times on More worn: wear ${entry.wear}`);
    /* The panel scrolls smoothly: where the bar is is read once it has. */
    await page.evaluate("document.querySelector('.hangar-wear-bar').scrollIntoView({ block: 'center' }); true");
    await page.sleep(900);
    const bar = await page.evaluate("(() => { const r = document.querySelector('.hangar-wear-bar').getBoundingClientRect(); return { x: r.left + r.width * 0.8, y: r.top + r.height / 2 }; })()");
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bar.x, y: bar.y, button: 'left', clickCount: 1 }, page.sessionId);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bar.x, y: bar.y, button: 'left', clickCount: 1 }, page.sessionId);
    entry = await page.evaluate('window.__ui.hangar.entry');
    say(entry.wear === 80, `a click four fifths along the bar sets wear ${entry.wear}`);
    const painted = await page.evaluate(lookWhen("l.finishes.wing === 'carbon' && l.finishes.fuselage === 'aluminium' && Math.abs(l.wear - 0.8) < 1e-6"));
    say(painted.finishes.wing === 'carbon' && painted.finishes.fuselage === 'aluminium' && Math.abs(painted.wear - 0.8) < 1e-6,
      `the model wears them before Save: ${JSON.stringify(painted.finishes)}, wear ${painted.wear}`);
    const u = painted.uniforms;
    say(u.wing && u.wing.compiled && u.wing.carbon === 1 && u.fuselage && u.fuselage.alu === 1 && u.tail && u.tail.carbon === 0 && u.tail.wear === 0.8,
      `and its programs draw carbon on the wing, aluminium on the fuselage and the wear everywhere: ${JSON.stringify(u)}`);
    await shots(page, 'garage-paint');

    console.log('2. livery and decals');
    await page.evaluate(click('page-decals'));
    const skull = await placeDecal(page, 'skull', 'side_left', 'n[0] < -0.8');
    const shark = await placeDecal(page, 'shark', 'side_right', 'n[0] > 0.8');
    const flag = await placeDecal(page, 'flag_py', 'top', 'n[1] > 0.8');
    const words = await placeDecal(page, 'text', 'top', 'n[1] > 0.8');
    say(skull.k === 'skull' && shark.k === 'shark' && flag.k === 'flag_py' && words.k === 'text',
      `a skull, a shark mouth, the flag of Paraguay and words placed by aiming: ${[skull, shark, flag, words].map((d) => d.k).join(', ')}`);
    await page.until("Boolean(document.querySelector('.hangar [data-key=\"text-field\"]'))", 5000);
    const type = async (text) => page.evaluate(`(() => { const f = document.querySelector('.hangar [data-key="text-field"]'); f.focus(); f.value = ${JSON.stringify(text)}; f.dispatchEvent(new Event('input')); const e = document.querySelector('.paint-text .paint-error'); return { kept: window.__ui.hangar.entry.decals[3].t, refused: e && !e.hidden ? e.textContent : null }; })()`);
    const typed = await type('mi dron 313');
    say(typed.kept === 'MI DRON 313' && !typed.refused, `the pilot's words, typed, kept upper case: ${typed.kept}`);
    const rude = await type('mierda');
    say(rude.kept === 'MI DRON 313' && Boolean(rude.refused), `a word the filter refuses is turned away (${rude.refused}) and the decal keeps ${rude.kept}`);
    /* Typed by keys, a space and all: the field takes its own typing. */
    await page.evaluate(`(() => { const f = document.querySelector('.hangar [data-key="text-field"]'); f.focus(); f.value = ''; f.dispatchEvent(new Event('input')); return true; })()`);
    for (const k of ['KeyM', 'KeyI', 'Space', 'KeyD', 'KeyR', 'KeyO', 'KeyN', 'Space', 'Digit3', 'Digit1', 'Digit3']) {
      await page.tap(k);
    }
    const keyed = await page.evaluate('window.__ui.hangar.entry.decals[3].t');
    say(keyed === 'MI DRON 313', `typed on the keys, spaces and all: ${keyed}`);
    await page.tap('Escape');
    await page.evaluate(click('font-stencil'));
    const lettering = await page.evaluate('window.__ui.hangar.entry.decals[3]');
    say(lettering.f === 'stencil' && lettering.t === 'MI DRON 313', `in stencil lettering: ${lettering.f}`);
    const decalled = await page.evaluate(lookWhen('l.decals.decals === 4'));
    say(decalled.decals.decals === 4 && decalled.decals.meshes > 0, `the model wears all four: ${JSON.stringify(decalled.decals)}`);
    await shots(page, 'garage-decals');

    console.log('3. parts, and the spec sheet');
    const specWeight = () => page.evaluate("(() => { const v = document.querySelector('.hangar-spec .hangar-stat-value'); return v ? v.textContent : null; })()");
    const before = await specWeight();
    await page.evaluate(click('tab-parts'));
    await page.evaluate(click('addon-pod'));
    await page.sleep(700);
    const after = await specWeight();
    const grams = (t) => Number(String(t).replace(/[^0-9]/g, ''));
    say(Boolean(before) && Boolean(after) && grams(after) > grams(before), `the spec sheet over the stage carries the pod's weight: ${before} to ${after}`);
    await shots(page, 'garage-parts');

    console.log('4. tune');
    await page.evaluate(click('tab-tuning'));
    await page.evaluate(click('lead-inc'));
    await page.evaluate(click('lead-inc'));
    const tuned = await page.evaluate('window.__ui.hangar.dirty()');
    say(tuned, 'lead in the nose on the Tuning tab is a change to save');
    await shots(page, 'garage-tune');

    console.log('5. the view');
    const cam = () => page.evaluate('window.__carouselStats().camera');
    await page.sleep(1500);
    const c0 = await cam();
    const stage = await page.evaluate("(() => { const r = document.querySelector('.hangar-stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: stage.x, y: stage.y, deltaX: 0, deltaY: -300 }, page.sessionId);
    await page.sleep(400);
    const o1 = await page.evaluate('({ ...window.__ui.hangar.orbit })');
    say(o1.zoom < 1, `the wheel brings the camera in: zoom ${o1.zoom.toFixed(2)}`);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: stage.x, y: stage.y, button: 'left', clickCount: 1 }, page.sessionId);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: stage.x + 5, y: stage.y + 60, button: 'left', buttons: 1 }, page.sessionId);
    await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: stage.x + 5, y: stage.y + 60, button: 'left', clickCount: 1 }, page.sessionId);
    const o2 = await page.evaluate('({ ...window.__ui.hangar.orbit })');
    say(o2.elev > o1.elev, `a drag down raises the camera: ${o1.elev.toFixed(2)} to ${o2.elev.toFixed(2)}`);
    await page.tap('KeyO');
    await page.tap('KeyK');
    const o3 = await page.evaluate('({ ...window.__ui.hangar.orbit })');
    say(o3.zoom > o2.zoom && o3.elev < o2.elev, `O zooms out and K tilts down: ${JSON.stringify(o3)}`);
    await page.evaluate('window.__ui.hangar.pollPad({}); for (let i = 0; i < 10; i += 1) window.__ui.hangar.pollPad({ look: { x: 1, y: -1 } }); true');
    const o4 = await page.evaluate('({ ...window.__ui.hangar.orbit })');
    say(o4.elev > o3.elev, `a pad's right stick tilts the view: ${o3.elev.toFixed(2)} to ${o4.elev.toFixed(2)}`);
    await page.sleep(1500);
    const c1 = await cam();
    say(Math.abs(c1.zoom - c0.zoom) > 0.01 || Math.abs(c1.elev - c0.elev) > 0.01,
      `the camera follows: zoom ${c0.zoom.toFixed(2)} to ${c1.zoom.toFixed(2)}, height ${c0.elev.toFixed(2)} to ${c1.elev.toFixed(2)}`);
    /* A close look at the paint, the wear and the words. */
    for (let i = 0; i < 4; i += 1) {
      await page.tap('KeyU');
    }
    await page.tap('KeyI');
    await page.tap('KeyI');
    await page.sleep(1500);
    await shots(page, 'garage-view');

    console.log('6. Save to My Hangar, chosen, flown');
    const rail = await page.evaluate("(() => { const t = document.querySelector('.hangar-tabs'); const b = [...t.querySelectorAll('.hangar-tab-btn')].map((x) => x.getBoundingClientRect()); const side = document.querySelector('.hangar-side').getBoundingClientRect(); return { stacked: b.every((r, i) => i === 0 || r.top > b[i - 1].top), beside: t.getBoundingClientRect().right <= side.left + 1 }; })()");
    say(rail.stacked && rail.beside, `the categories stand in a rail beside the panel: ${JSON.stringify(rail)}`);
    await page.evaluate(click('mine-new'));
    await page.evaluate("(() => { const f = document.querySelector('.hangar [data-key=\"mine-name\"]'); f.value = 'Strike 313'; return true; })()");
    await page.evaluate(click('mine-name-save'));
    await page.until('!window.__ui.hangar.isOpen && window.__ui.carousel.isOpen', 10000);
    const built = await page.evaluate(`(JSON.parse(localStorage.getItem(${JSON.stringify(BUILDS_KEY)}) || '{}').builds || []).find((b) => b.name === 'Strike 313')`);
    const fit = built && built.fit;
    say(Boolean(fit) && fit.livery.wear === 80 && fit.livery.finishes.wing === 'carbon' && fit.livery.decals.length === 4
      && fit.livery.decals[3].t === 'MI DRON 313' && fit.parts.addons.includes('pod') && Boolean(fit.tuning),
      `stored as a build: wear ${fit && fit.livery.wear}, ${fit && fit.livery.decals.length} decals, ${JSON.stringify(fit && fit.parts)}`);
    await page.tap('Enter');
    await page.until('!window.__ui.carousel.isOpen', 10000);
    const worn = await page.evaluate(`window.__ui.settings.livery[${JSON.stringify(T)}]`);
    say(worn && worn.wear === 80 && worn.decals.length === 4, 'chosen, the Timber wears it');
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
    await page.until('window.__craftPaint().id === window.__craft().run', 60000).catch(() => {});
    const flown = await page.evaluate('window.__craftPaint()');
    say(Math.abs(flown.wear - 0.8) < 1e-6 && flown.finishes.wing === 'carbon' && flown.decals.decals === 4,
      `flown, the craft wears the wear, the carbon and the decals: ${flown.wear}, ${flown.finishes.wing}, ${flown.decals.decals}`);

    console.log('7. a room');
    const room = await page.evaluate(`(async () => {
      const { checkProfile } = await import('/src/share/roomwire.js');
      const { buildPeerCraft } = await import('/src/render/peers.js');
      const { readDecals } = await import('/src/render/decals.js');
      const { liveryKey } = await import('/configs/liveries.js');
      const id = ${JSON.stringify(T)};
      const s = window.__ui.settings;
      const sent = { airframe: id, map: 'alps', figure: 1, livery: s.livery[liveryKey(id)], parts: { prop: s.parts[id].prop, addons: s.parts[id].addons } };
      const relayed = checkProfile(JSON.parse(JSON.stringify(sent)));
      const bytes = new TextEncoder().encode(JSON.stringify(relayed)).length;
      const peer = buildPeerCraft(relayed);
      /* A peer's craft is its group: its paint read off the materials. */
      const paintOf = (group) => {
        const finishes = new Set();
        let wear = 0;
        group.traverse((o) => {
          const m = o.isMesh && o.material && !Array.isArray(o.material) ? o.material : null;
          if (m && m.userData.finishState) {
            wear = Math.max(wear, m.userData.finishState.u.uFinWear.value);
            if (m.userData.paintFinish) finishes.add(m.userData.paintFinish);
          }
        });
        return { finishes: [...finishes].sort(), wear };
      };
      const seen = { ...paintOf(peer.group), decals: readDecals(peer) };
      const rude = JSON.parse(JSON.stringify(relayed));
      rude.livery.decals[3].t = 'MIERDA';
      const rudePeer = buildPeerCraft(checkProfile(rude));
      const rudeSeen = readDecals(rudePeer);
      peer.dispose && peer.dispose();
      rudePeer.dispose && rudePeer.dispose();
      return { relayed: Boolean(relayed), bytes, seen, rudeSeen };
    })()`);
    say(room.relayed && room.bytes < 4096, `the profile a room is sent passes the room's check, ${room.bytes} bytes of 4096`);
    say(Math.abs(room.seen.wear - 0.8) < 1e-6 && same(room.seen.finishes, ['aluminium', 'carbon']) && room.seen.decals.decals === 4,
      `drawn as a peer draws it: wear ${room.seen.wear}, finishes ${room.seen.finishes.join(', ')}, ${room.seen.decals.decals} decals`);
    say(room.rudeSeen.decals === 3, `a refused word sent by hand is dropped by the peer, the rest drawn: ${room.rudeSeen.decals} decals`);
    await page.tap('Escape');
    await page.until("window.__ui.screen === 'paused'", 10000);
    await page.evaluate("window.__ui.show('title'); true");

    console.log('8. reloaded');
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await ready(page);
    const kept = await page.evaluate("window.__ui.myBuilds.find((b) => b.name === 'Strike 313')");
    say(Boolean(kept) && kept.fit.livery.wear === 80 && kept.fit.livery.decals[3].t === 'MI DRON 313' && kept.fit.livery.decals[3].f === 'stencil',
      'the build, its wear and its words are kept');
    await page.evaluate('window.__ui.openCraftRow(false); true');
    await page.until('window.__ui.carousel.isOpen', 10000);
    for (let i = 0; i < 4 && await page.evaluate('window.__ui.carousel.filter') !== 'mine'; i += 1) {
      await page.tap('ArrowDown');
    }
    await shots(page, 'garage-my-hangar');
    await page.tap('KeyC');
    await page.until('window.__ui.hangar.isOpen', 10000);
    await shots(page, 'garage-build');
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
