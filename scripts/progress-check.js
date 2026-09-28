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
 *   3. A track built on the Alps with the builder's own controls, and the
 *      Timber flown round it on the sticks: the lap earns XP, a toast says
 *      so, the level goes up and a toast says what it opened, and the
 *      clean lap completes the Timber's challenge with its own toast. With
 *      the hoops' casual track merged the same run counts as it; before,
 *      a built track is the course.
 *   4. The unlocked item is in the hangar: the Timber's 3S option, New,
 *      picked; the rev plays on its voice and gives the seated one back;
 *      the readouts keep the old value as a ghost bar.
 *   5. Unlock everything from Settings opens the Bramor; a reload keeps
 *      the XP, the challenge and the switch.
 * No console error or uncaught exception anywhere.
 *
 *   node scripts/progress-check.js [OUT_DIR]
 *
 * Pictures land in OUT_DIR (tmp/progress-check by default). They are
 * evidence for one look, not for the repository: delete them after.
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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import {
  B, hold, key, leave, lookAlong, placeHere, takeMouse,
} from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { CHALLENGES, LAP_XP, FIRST_LAP_XP, PLANE_LEVELS } from '../src/game/progress.js';
import { revRpm } from '../src/ui/hangar-polish.js';
import { VOICES } from '../src/render/audio.js';

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

const WIDE = ['wideGate5', 'pylonPair', 'wideGate5'];

/* A new pilot: the Timber seated in angle mode so a stick is an attitude,
 * and progress stored fresh on the curve. Once, marked under a key of its
 * own because the settings store keeps only the keys it knows: a reload
 * keeps what the page wrote. */
const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'timber1500');
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

const actions = (page) => page.evaluate('window.__ui.items().filter((it) => !it.section).map((it) => it.action)');
async function choose(page, action) {
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.action === ${JSON.stringify(action)})`);
  if (at < 0) {
    throw new Error(`no row ${action}: ${JSON.stringify(await actions(page))}`);
  }
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
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
    level: (document.querySelector('.pg-ring-in') || {}).textContent,
    sw: (document.querySelector('.pg-switch') || {}).getAttribute ? document.querySelector('.pg-switch').getAttribute('aria-checked') : null,
  })`);
  say(tab.rows.length === 7 && tab.level === '1' && tab.sw === 'false' && tab.rows[0] === 'timber_clean',
    `the Challenges tab: level ${tab.level}, the switch off, ${tab.rows.length} challenges, the Timber's first: ${tab.rows.join(', ')}`);
  await shot(page, '2-challenges');
  await closeHangar(page);
}

/* The ground's highest point under a ring of radius R round (cx, cz). */
function highestUnder(page, cx, cz, R) {
  return page.evaluate(`(() => {
    let m = -Infinity;
    for (let a = 0; a < 96; a += 1) {
      for (let r = 0; r <= ${R} + 30; r += 10) {
        m = Math.max(m, window.__heightAt(${cx} + r * Math.cos(a / 96 * 2 * Math.PI), ${cz} + r * Math.sin(a / 96 * 2 * Math.PI)));
      }
    }
    return m;
  })()`);
}

/* The builder: plane gates hung round a ring, flown along it, saved. */
async function buildRing(page, R, offset) {
  await page.until('window.__ui.onGate()', 60000);
  await choose(page, 'way-race-5inch');
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.tap('Enter');
  await page.until("window.__ui.screen === 'courses'", 20000);
  await choose(page, 'newtrack');
  await choose(page, 'newtrack:alps');
  await page.until(`window.__build && ${B('.state')} === 'building' && ${B('.map')} === 'alps'`, 600000);
  await page.until('window.__loading.root.hidden', 120000);
  await takeMouse(page);
  const camPos = await page.evaluate(B('.camera.pos'));
  const cx = camPos[0];
  const cz = camPos[2] - offset;
  const cy = (await highestUnder(page, cx, cz, R)) + 45;
  for (let i = 0; i < WIDE.length; i += 1) {
    const a = (i / WIDE.length) * Math.PI * 2;
    const P = [cx + R * Math.cos(a), cy, cz + R * Math.sin(a)];
    const T = [-Math.sin(a), 0, Math.cos(a)];
    await hold(page, WIDE[i]);
    await lookAlong(page, P.map((v, j) => v - T[j] * 20), Math.atan2(-T[0], -T[2]), 0);
    await placeHere(page, { air: true });
  }
  await key(page, 'KeyS', { ctrl: true });
  await page.until(`/Saved/.test(${B('.message')})`, 10000).catch(() => {});
  const id = await page.evaluate(B('.doc.id'));
  await leave(page);
  await page.until(`${B('.state')} === 'off' && window.__ui.screen === 'courses'`, 60000);
  return { id, centre: [cx, cy, cz], R };
}

/* A ring of radius R round the centre, a point a metre, flown counter
 * clockwise from just before its first gate and on past it. */
async function flyRing(page, [cx, cy, cz], R, speed) {
  const path = [];
  for (let a = -8 / R; a <= 2 * Math.PI + 30 / R; a += 1 / R) {
    path.push([cx + R * Math.cos(a), cy, cz + R * Math.sin(a)]);
  }
  return flyPath(page, path, speed, 240);
}

/* scripts/track-mode-check.js's plane pilot: L1 guidance along a path of
 * points a metre apart, a pitch hold for the path's height and the
 * throttle for the speed, until a lap closes, a crash, or `limitS` of sim
 * time. */
async function flyPath(page, path, speed, limitS) {
  await page.evaluate(`(() => {
    const P = ${JSON.stringify(path)};
    const N = P.length;
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let k = 0;
    window.__pilot = true;
    const step = () => {
      if (!window.__pilot) { window.__stick(); return; }
      const c = window.__craftState();
      if (!c || c.mode !== 'flight' || !c.fwd || !c.up) { requestAnimationFrame(step); return; }
      const pitch = Math.asin(cl(c.fwd.y, -1, 1));
      const right = { x: c.fwd.y * c.up.z - c.fwd.z * c.up.y, y: c.fwd.z * c.up.x - c.fwd.x * c.up.z, z: c.fwd.x * c.up.y - c.fwd.y * c.up.x };
      const bank = Math.asin(cl(-right.y, -1, 1));
      const p = c.rates ? c.rates.p : 0;
      const q = c.rates ? c.rates.q : 0;
      const hold = (rad) => cl(3 * (rad - pitch) + 0.3 * q, -1, 1);
      const bankTo = (rad) => cl(2.5 * (rad - bank) - 0.15 * p, -1, 1);
      const pos = [c.worldX, c.worldY, c.worldZ];
      let best = k;
      let bestD = Infinity;
      for (let j = k; j < Math.min(N, k + 60); j += 1) {
        const d = Math.hypot(P[j][0] - pos[0], P[j][2] - pos[2]);
        if (d < bestD) { bestD = d; best = j; }
      }
      k = best;
      let a = k;
      while (a < N - 1 && Math.hypot(P[a][0] - pos[0], P[a][2] - pos[2]) < 28) { a += 1; }
      const aim = P[a];
      const v = c.vel || { x: 0, y: 0, z: 0 };
      const vh = Math.hypot(v.x, v.z) || 1;
      const dx = aim[0] - pos[0];
      const dz = aim[2] - pos[2];
      const dl = Math.hypot(dx, dz) || 1;
      const sinEta = (v.x * dz - v.z * dx) / (vh * dl);
      const cosEta = (v.x * dx + v.z * dz) / (vh * dl);
      const eta = Math.atan2(sinEta, cosEta);
      const acc = 2 * vh * vh * Math.sin(cl(eta, -Math.PI / 2, Math.PI / 2)) / Math.max(dl, 5);
      const bankT = cl(Math.atan(acc / 9.81), -0.9, 0.9);
      const hT = P[k][1];
      const pitchT = cl(0.03 + 0.05 * (hT - pos[1]) - 0.08 * v.y + 0.12 * Math.abs(bank), -0.3, 0.35);
      const thr = cl(0.55 + 0.12 * (${speed} - c.speed) + 0.06 * (hT - pos[1]) + 0.25 * Math.abs(bank), 0.1, 1);
      window.__stick(bankTo(bankT), hold(pitchT), 0, thr);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`);
  await page.evaluate('window.__drawOff(true)');
  const t0 = (await page.evaluate('window.__crash()')).simT;
  await page.until(`window.__race().laps.length >= 1 || window.__craftState().crashed || window.__crash().simT - ${t0} > ${limitS}`, 1800000).catch(() => {});
  await page.evaluate('window.__drawOff(false)');
  await page.evaluate('window.__pilot = false');
  await page.sleep(300);
  return page.evaluate('({ laps: window.__race().laps.slice(), c: window.__craftState(), screen: window.__ui.screen })');
}

async function earn(page) {
  console.log('3. a track built and flown with the Timber: XP, a level, a challenge');
  const ring = await buildRing(page, 90, 120);
  say(Boolean(ring.id), `a ring of plane gates on the Alps, saved as ${ring.id}`);
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.course && it.course.track.id === ${JSON.stringify(ring.id)})`);
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
  await choose(page, 'card-fly');
  await page.until("window.__ui.screen === 'launch' && window.__map().ready && window.__race().gates.length === 3", 600000);
  await choose(page, 'launch-go');
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
  const before = await progress(page);
  const lap = await flyRing(page, ring.centre, ring.R, 14);
  say(lap.laps.length >= 1, `the Timber flies a lap on the sticks: ${lap.laps.length ? (lap.laps[0] / 1000).toFixed(2) : 'none'} s${lap.laps.length ? '' : `, crashed ${lap.c.crashed}`}`);
  const p = await progress(page);
  const want = LAP_XP.built + FIRST_LAP_XP;
  const challengeXp = 40 + 120;
  say(p.xp === before.xp + want + challengeXp, `XP: ${before.xp} to ${p.xp}, a first lap on a built track (${want}) and two challenges (${challengeXp})`);
  say(p.challenges.first_course && p.challenges.timber_clean, `the clean Timber lap completes its challenge, and the first lap: ${JSON.stringify(p.challenges)}`);
  const log = await page.evaluate('window.__ui.progress.log');
  const kinds = log.map((t) => t.cls);
  say(kinds.includes('lap level') && kinds.includes('unlock') && kinds.filter((k) => k.startsWith('challenge')).length === 2,
    `toasts: ${log.map((t) => `${t.cls} "${t.kicker}: ${t.title}${t.sub ? ` (${t.sub})` : ''}"`).join(' | ')}`);
  const unlock = log.find((t) => t.cls === 'unlock');
  say(unlock && /Kadet/.test(unlock.title), `the unlock toast names the Kadet Senior first: "${unlock ? unlock.title : ''}"`);
  const vis = await page.evaluate("[...document.querySelectorAll('.pg-toast')].map((t) => { const r = t.getBoundingClientRect(); return { cls: t.className, top: r.top, w: r.width, visible: getComputedStyle(t).visibility }; })");
  say(vis.length >= 1 && vis.length <= 2 && vis.every((v) => v.visible === 'visible'), `at most two toasts over the flight, all visible: ${JSON.stringify(vis)}`);
  await shot(page, '3-toasts');
  await page.sleep(1500);
  await shot(page, '3-toasts-later');
  const s = await stored(page);
  say(s.xp === p.xp && s.challenges.timber_clean, `and it is stored: ${s.xp} XP`);
  return p;
}

/*
 * Click `keyName` and sample, every drawn frame while the rev plays, the
 * voice it speaks on, the one it gives back, and what each of the mix's
 * four motor voices was fed at how far into the rev. A headless page draws
 * a frame or two a second in the hangar, so the samples are checked
 * against the rev's own shape at their times (fed), not for its peak.
 */
async function revOf(page, keyName, rpmFull) {
  await page.evaluate(`(() => {
    window.__revSeen = { samples: [], voice: null, was: null, done: false };
    const f = () => {
      const r = window.__hangarRev();
      if (r.rev && r.rev.ms != null) {
        window.__revSeen.voice = r.voice;
        window.__revSeen.was = r.rev.was;
        window.__revSeen.samples.push({ ms: r.rev.ms, rpm: r.rpm.slice() });
      }
      if (window.__revSeen.voice && !r.rev) { window.__revSeen.done = true; return; }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    return true;
  })()`);
  await page.evaluate(click(keyName));
  await page.until('window.__revSeen.done', 20000).catch(() => {});
  const seen = await page.evaluate('window.__revSeen');
  const fed = seen.samples.filter((x) => revRpm(x.ms, rpmFull) != null);
  seen.fed = fed.length > 0 && fed.every((x) => x.rpm.every((r) => Math.abs(r - revRpm(x.ms, rpmFull)) < 1));
  seen.samples = seen.samples.map((x) => `${Math.round(x.ms)} ms ${Math.round(x.rpm[0])}`);
  return seen;
}

/*
 * The path through the casual sky track's hoops, in order and back to the
 * first: a Hermite curve from each hoop's centre to the next along their
 * travel, a point a metre, with a run in and a run out.
 */
function hoopPath(G) {
  const out = [];
  const add = (p) => out.push(p.map((v) => Number(v.toFixed(2))));
  const g0 = G[0];
  for (let d = 120; d > 0; d -= 1) {
    add(g0.centre.map((v, i) => v - g0.travel[i] * d));
  }
  for (let k = 0; k < G.length; k += 1) {
    const a = G[k];
    const b = G[(k + 1) % G.length];
    const L = Math.hypot(...b.centre.map((v, i) => v - a.centre[i]));
    const n = Math.ceil(L);
    for (let j = 0; j < n; j += 1) {
      const t = j / n;
      const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
      const h10 = t ** 3 - 2 * t ** 2 + t;
      const h01 = -2 * t ** 3 + 3 * t ** 2;
      const h11 = t ** 3 - t ** 2;
      add(a.centre.map((v, i) => h00 * v + h10 * L * a.travel[i] + h01 * b.centre[i] + h11 * L * b.travel[i]));
    }
  }
  for (let d = 0; d <= 80; d += 1) {
    add(g0.centre.map((v, i) => v + g0.travel[i] * d));
  }
  return out;
}

async function casual(page, before) {
  console.log('3b. the casual sky track, made in one click and flown');
  if ((await page.evaluate('window.__ui.screen')) === 'flight') {
    await page.evaluate("window.__ui.act('pause'); window.__ui.show('paused'); true");
  }
  await page.evaluate("window.__ui.show('title'); true");
  await page.evaluate("window.__ui.act('mytracks'), window.__ui.act('newtrack'), true");
  const offered = await page.evaluate("window.__ui.items().some((r) => r.action === 'casualtrack:alps')");
  say(offered, 'My tracks offers the Timber the casual sky track on the Alps');
  await page.evaluate("window.__ui.act('casualtrack:alps'), true");
  await page.until(`${B('.state')} === 'testing' && window.__craftState().mode === 'flight'`, 300000);
  await page.evaluate("(document.querySelector('.osd-air-hint-btn') || { click() {} }).click(), true");
  const st = await page.evaluate(B(''));
  const p0 = await progress(page);
  say(st.gates.length === 8 && p0.casual[st.doc.id] === true, `one click lays ${st.gates.length} hoops and progression records ${st.doc.id} as a casual track`);
  const lap = await flyPath(page, hoopPath(st.gates), 15, 600);
  say(lap.laps.length >= 1, `the Timber flies the whole casual track on the sticks: ${lap.laps.length ? (lap.laps[0] / 1000).toFixed(1) : 'no lap'} s${lap.laps.length ? '' : `, crashed ${lap.c.crashed} at ${lap.c.worldX.toFixed(0)}, ${lap.c.worldY.toFixed(0)}, ${lap.c.worldZ.toFixed(0)}`}`);
  const p = await progress(page);
  const lapXp = p.xp - before.xp - Object.keys(p.challenges).filter((c) => !before.challenges[c]).reduce((n, c) => n + CHALLENGES.find((x) => x.id === c).xp, 0);
  say(lapXp === LAP_XP.casual + FIRST_LAP_XP && p.courses[`track:${st.doc.id}`], `its lap earns the casual track's ${LAP_XP.casual} XP and the first lap bonus: ${lapXp} XP, ${before.xp} to ${p.xp} in all`);
  const log = await page.evaluate('window.__ui.progress.log');
  const last = [...log].reverse().find((t) => t.cls.startsWith('lap'));
  say(Boolean(last) && /First lap/.test(last.kicker) && last.xp === LAP_XP.casual + FIRST_LAP_XP, `and its toast says so: ${JSON.stringify(last)}`);
  /* B takes the test flight back to the builder, and the builder's own
   * way out goes to My tracks. */
  const after = await page.evaluate(`({ state: ${B('.state')}, screen: window.__ui.screen })`);
  await key(page, 'KeyB');
  await page.until(`${B('.state')} === 'building'`, 60000).catch(() => {});
  await leave(page);
  await page.until(`${B('.state')} === 'off'`, 60000).catch(() => {});
  const out = await page.evaluate(`({ state: ${B('.state')}, screen: window.__ui.screen })`);
  say(out.state === 'off', `B and then Escape leave the builder: after the lap ${JSON.stringify(after)}, then ${JSON.stringify(out)}`);
  const kept = await page.evaluate('(window.__ui.localCourses || []).map((t) => t.id)');
  say(kept.includes(st.doc.id), `leaving, the casual track is kept in My tracks under the same id: ${JSON.stringify(kept)}`);
}

async function unlocked(page) {
  console.log('4. the unlocked item in the hangar, the rev and the ghost bars');
  if ((await page.evaluate('window.__ui.screen')) === 'flight') {
    await page.evaluate("window.__ui.act('pause'); window.__ui.show('paused'); true");
  }
  await page.evaluate("window.__ui.show('title'); true");
  await openPicker(page, 'kadet1981');
  const kadet = await page.evaluate("({ lock: Boolean(document.querySelector('.carousel-info .pg-lock')), isNew: Boolean(document.querySelector('.carousel-info .pg-new')), choose: window.__ui.carousel.chooseBtn.textContent })");
  say(!kadet.lock && kadet.isNew, `the Kadet is open in the picker and says New: ${JSON.stringify(kadet)}`);
  await shot(page, '4-picker-new');
  await page.evaluate('window.__ui.carousel.close(); true');
  await openHangar(page, 'timber1500');
  const three = await page.evaluate(card('option-3s'));
  say(three && !three.disabled && !three.locked && three.isNew, `the Timber's 3S option is open, and New: ${JSON.stringify(three)}`);
  await page.evaluate(click('tab-parts'));
  await page.until("window.__ui.hangar.tab === 'parts'", 5000);
  const parts = await page.evaluate(`({ apc: ${card('prop-11x7e')}, pod: ${card('addon-pod')}, smoke: ${card('addon-smoke')} })`);
  say(!parts.apc.locked && parts.apc.isNew && !parts.pod.locked && parts.smoke.locked,
    `and on the Parts tab at level 3 the APC prop and the camera pod are open and New, the smoke still locked: ${JSON.stringify(parts)}`);
  await page.evaluate(click('tab-power'));
  await page.until("window.__ui.hangar.tab === 'power'", 5000);
  await settle(page, 1200);
  const counts = await page.evaluate('Object.fromEntries(Object.entries(window.__ui.hangar.counts).map(([k, v]) => [k, v.to]))');
  const rev = await revOf(page, 'option-3s', VOICES.wing.rpmFull);
  say(rev.voice === 'wing' && rev.fed && rev.done, `picking it plays a rev on its voice, each of the mix's motors fed the rev's shape at every drawn frame: ${JSON.stringify(rev)}`);
  const ghosts = await page.evaluate(`[...document.querySelectorAll('.hangar-stat')].map((b) => {
    const g = b.querySelector('.hangar-stat-ghost');
    const bar = b.querySelector('.hangar-stat-bar').getBoundingClientRect().width;
    return { label: b.querySelector('.hangar-stat-label').textContent, on: g.classList.contains('on'), share: g.getBoundingClientRect().width / bar, opacity: getComputedStyle(g).opacity };
  })`);
  const top = await page.evaluate('Object.fromEntries(Object.entries(window.__ui.hangar.statEls).map(([k, e]) => [k, e.top]))');
  const keys = Object.keys(counts).filter((k) => top[k]);
  const want = keys.map((k) => Math.min(1, counts[k] / top[k]));
  say(ghosts.filter((g) => g.on).length >= 2 && ghosts.filter((g) => g.on).every((g) => Number(g.opacity) > 0.5),
    `the readouts keep the old values as ghost bars: ${JSON.stringify(ghosts.map((g) => [g.label, g.on, g.share.toFixed(2)]))}, the old values' shares ${JSON.stringify(want.map((w) => w.toFixed(2)))}`);
  await settle(page, 700);
  await shot(page, '4-ghost-bars');
  const after = await page.evaluate('window.__hangarRev()');
  say(after.rev === null && after.voice === rev.was && after.rpm.every((r) => r === 0), `the rev ends, the mix is fed nothing, and the seated voice is back: ${after.voice}`);
  await page.evaluate("window.__ui.hangar.saveBtn.click(); true");
  await page.until('!window.__ui.hangar.isOpen', 5000);
  /* Save hands back to the picker once the shell has taken it, a moment
   * later; shut it only then, or it opens again over the next step. */
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate('window.__ui.carousel.close(); true');
  const power = await page.evaluate('window.__ui.settings.power.timber1500');
  say(power && power.option === '3s', `saved: ${JSON.stringify(power)}`);
  /* A four stroke on the Kadet, opened by the level, speaks as one over
   * the seated Timber's electric voice and gives it back. */
  await openHangar(page, 'kadet1981');
  const glow = await revOf(page, 'option-fsa56', VOICES.glow4.rpmFull);
  const back = await page.evaluate('window.__hangarRev()');
  say(glow.voice === 'glow4' && glow.was === 'wing' && glow.fed && glow.done && back.voice === 'wing',
    `the Kadet's FSa-56 revs on the four stroke's voice, and the Timber's electric voice comes back: ${JSON.stringify(glow)}, then ${back.voice}`);
  await closeHangar(page);
}

async function unlockAll(page) {
  console.log('5. Unlock everything from a locked plane in the picker, and a reload');
  await page.evaluate("window.__ui.show('title'); true");
  await openPicker(page, 'bramor2300');
  const locked = await page.evaluate("({ lock: Boolean(document.querySelector('.carousel-info .pg-lock')), choose: window.__ui.carousel.chooseBtn.textContent })");
  say(locked.lock && locked.choose === 'Unlock everything', `the Bramor, level ${PLANE_LEVELS.bramor2300} on the curve, is locked and offers ${JSON.stringify(locked.choose)}`);
  await page.tap('Enter');
  await page.until('window.__ui.settings.progress.unlockAll === true', 5000).catch(() => {});
  const p = await progress(page);
  const bramor = await page.evaluate("({ open: window.__ui.carousel.isOpen, lock: Boolean(document.querySelector('.carousel-info .pg-lock')), choose: window.__ui.carousel.chooseBtn.textContent, seated: window.__ui.settings.airframe })");
  say(p.unlockAll === true && bramor.open && !bramor.lock && bramor.choose === 'Choose' && bramor.seated === 'timber1500',
    `Enter on it unlocks everything and stays on the Bramor, now open with Choose: ${JSON.stringify(bramor)}`);
  await shot(page, '5-picker-unlocked');
  await page.evaluate('window.__ui.carousel.close(); true');
  await openHangar(page, 'timber1500');
  await page.evaluate("window.__ui.hangar.setTab('challenges'); true");
  await page.until("window.__ui.hangar.tab === 'challenges'", 5000);
  const sw = await page.evaluate("document.querySelector('.pg-switch').getAttribute('aria-checked')");
  say(sw === 'true', `the Challenges tab's switch reads on (${sw}), where it can be turned back off`);
  await closeHangar(page);
  console.log('   reload');
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await shellUp(page);
  const kept = await progress(page);
  say(kept.unlockAll === true && kept.xp === p.xp && kept.challenges.timber_clean && kept.seen['plane:kadet1981'],
    `after a reload: ${kept.xp} XP, the challenges, the switch and what was seen are kept: ${JSON.stringify(kept)}`);
}

async function main() {
  const page = await openPage({ root, width: 1600, height: 900, seed });
  try {
    await shellUp(page);
    if (!only || only === 'hangar') {
      await newPilot(page);
      await hangarTouches(page);
    }
    if (only === 'casual') {
      await casual(page, await progress(page));
    }
    if (!only) {
      const earned = await earn(page);
      await casual(page, earned);
      await unlocked(page);
      await unlockAll(page);
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
