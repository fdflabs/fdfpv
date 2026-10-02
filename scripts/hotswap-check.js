/*
 * hotswap-check.js: changing aircraft in flight, in the real shell, headless.
 *
 * On every map it flies, it swaps through every aircraft twice with the
 * ] key, once parked on the ground and once in the air, and holds every
 * swap to the rules src/main.js hotSwap states, reading what the swap did
 * off window.__lastSwap, which is written inside the swap and so is the
 * state it left, not a frame later:
 *
 *   - the compiled module flies the new airframe (sim_airframe), and the
 *     model drawn is the new aircraft's, a new model;
 *   - same place and same heading: on the ground parked on its own gear at
 *     that spot, in the air where the old one was;
 *   - the speed rule: a plane in the air at least 1.3 times its stall along
 *     its nose, a quad in the air with the velocity it had;
 *   - the ground rule: floats on land, or wheels on water, start 3 m over
 *     the spot instead;
 *   - a fresh aircraft: a part broken off the old one before the first swap
 *     is not broken on the new one, and nothing is crashed or wrecked;
 *   - its own tune, and no console error or uncaught exception anywhere.
 *
 * And on the maps where they apply: on the Alps a float plane swapped on the
 * lake (afloat, and a wheeled plane and a quad over the water), on swiss2 a
 * built track whose lap a mid lap swap voids, which every quad keeps, whose
 * gates a plane that does not fit loses and one that fits gets back, and on
 * a page of its own on the Alps the picker itself: the front page card, and
 * in flight Tab, the wheel, the arrows and a drag, choosing with Enter, and
 * what it costs a frame. The picker's part ran on the race field, then the
 * airfield, until each was retired.
 *
 *   node scripts/hotswap-check.js [alps|swiss2|itaipu ...]
 *
 * Every map by default. Slow on a software rasteriser: a map build and two
 * dozen swaps each.
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
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { cycleCraft } from '../src/ui/carousel.js';
import { AIRFRAMES, airframeById, airStartSpeed } from '../configs/airframes.js';
import { tunesFor } from '../configs/registry.js';
import { powerCells, powerChoice, powerParams } from '../configs/power.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ALL_MAPS = ['alps', 'swiss2', 'itaipu'];
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ALL_MAPS;
/* How far the new aircraft may stand from the old one's spot, metres, and
 * turn from its heading, radians: numerical, the swap copies both. */
const POS_TOL = 0.02;
const YAW_TOL = 1e-3;
const SPEED_TOL = 1e-3;
/* src/main.js SWAP_AIR_ABOVE and the 0.3 m a flying swap keeps off the floor. */
const AIR_ABOVE = 3;
const FLOOR_CLEAR = 0.3;
const SHARE_KEY = 'webfpv.share.import.v1';

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
const f2 = (v) => Number(v).toFixed(2);

function seed(airframe, map, extra = '') {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe);
  s.map = map;
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(k, JSON.stringify(s));
    ${extra}
  } catch (e) { /* storage refused */ }`];
}

/* A key the way a keyboard sends it, with the virtual key Chromium wants
 * for the brackets, which tests/lib/page.js does not know. */
const VK = { BracketLeft: [219, '['], BracketRight: [221, ']'] };
async function press(page, code) {
  if (!VK[code]) {
    await page.tap(code);
    return;
  }
  const [vk, key] = VK[code];
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk, text: key }, page.sessionId);
  await page.sleep(30);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk }, page.sessionId);
}

/* The power systems the swaps must seat (configs/power.js). */
const POWER_CHOICE = {
  timber1500: { option: '3s', pack: '3s2200' },
  sky1800: { option: 'stock', pack: '4s6000' },
  kadet1981: { option: 'electric', pack: '5s5000' },
  zagi1219: { option: 'stock', pack: '3s1500' },
  bombshell1118: { option: 'stock', pack: '5.1cc' },
};

/* Console errors and uncaught exceptions. A resource the page could not
 * fetch is listed apart: the board and the live server are not running
 * here, and the shell is written to fly without them. */
function faults(page) {
  return page.errors.filter((e) => !e.startsWith('network:'));
}

async function flyNow(page) {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
  /* A power choice per kind before the first run: another option, another
   * pack on the stock system, another tank, and the rest stock. */
  await page.evaluate(`(window.__ui.settings.power = ${JSON.stringify(POWER_CHOICE)}, window.__ui.persistSettings(), true)`);
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 400000);
  await page.sleep(500);
  /* The picker's own path to a swap, refusing loudly: a swap that did not
   * happen is a failure here, not a no-op. */
  await page.evaluate(`window.__swapNow = (id) => window.__ui.swapTo(id).then((done) => {
    if (!done) { throw new Error('the swap to ' + id + ' was refused'); }
    return done;
  }); true`);
}

/* Hold one swap's record to the rules. `was` is the old aircraft's state
 * read just before the key. */
function judgeSwap(tag, sw, id, was) {
  const af = airframeById(id);
  const b = sw.before;
  const a = sw.after;
  const moved = Math.hypot(a.x - b.x, a.z - b.z);
  const turned = Math.abs(Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw)));
  /* Down is parked, rolling on its wheels or riding the water: within a
   * hand's width of the surface, which no flying swap in this check is. */
  const down = was.landed || was.groundClearance < 0.35;
  const wantRule = !down ? 'air' : Boolean(af.floats) !== sw.onWater ? 'air-forced' : 'ground';
  const floor = a.ground + a.rest;
  let height = false;
  if (sw.rule === 'ground') {
    height = a.landed && Math.abs(a.y - floor) < POS_TOL;
  } else if (sw.rule === 'air') {
    height = !a.landed && Math.abs(a.y - Math.max(b.y, floor + FLOOR_CLEAR)) < POS_TOL;
  } else {
    height = !a.landed && Math.abs(a.y - (floor + AIR_ABOVE)) < POS_TOL;
  }
  const speed = Math.hypot(a.vx, a.vy, a.vz);
  const oldSpeed = Math.hypot(b.vx, b.vy, b.vz);
  const nose = { x: -Math.sin(a.yaw), z: -Math.cos(a.yaw) };
  const along = a.vx * nose.x + a.vz * nose.z;
  let speedOk = true;
  let speedSays = `${f2(speed)} m/s`;
  if (sw.rule !== 'ground' && af.fixedWing) {
    const want = Math.min(60, Math.max(sw.rule === 'air' ? oldSpeed : 0, airStartSpeed(af)));
    speedOk = Math.abs(speed - want) < SPEED_TOL && Math.abs(along - speed) < SPEED_TOL && Math.abs(a.vy) < SPEED_TOL;
    speedSays = `${f2(speed)} m/s along its nose, wanted ${f2(want)} (1.3 x stall ${f2(airStartSpeed(af))}, was ${f2(oldSpeed)})`;
  } else if (sw.rule === 'air') {
    speedOk = Math.hypot(a.vx - b.vx, a.vy - b.vy, a.vz - b.vz) < SPEED_TOL;
    speedSays = `${f2(speed)} m/s kept from ${f2(oldSpeed)}`;
  } else {
    speedOk = speed < SPEED_TOL;
    speedSays = `${f2(speed)} m/s, at rest`;
  }
  const tuneOk = tunesFor(id).some((t) => t.id === sw.tune) || sw.tune === 'custom';
  const fresh = !a.crashed && !a.wrecked && !a.crashflip && a.damage === 0;
  /* The power system the pilot chose for this plane (POWER_CHOICE), seated
   * with it: an option over the table or the table itself, the pack's
   * cells, and a full pack or tank of the chosen size. */
  let powerOk = true;
  let powerSays = '';
  if (af.fixedWing) {
    const { option, pack } = powerChoice(id, POWER_CHOICE);
    const block = powerParams(id, option, pack);
    const p = sw.power;
    const cells = powerCells(id, option, pack);
    powerOk = Boolean(p) && p.custom === (block != null) && sw.cells === cells && p.chargeC === 0 && p.fuelFrac === 1
      && (block == null || (p.capacityC === block[5] && p.tankM3 === block[11]));
    powerSays = `, power ${option}/${pack} ${p && p.custom ? 'seated' : 'the table'}, ${sw.cells}S, capacity ${p ? f2(p.capacityC / 3.6) : '?'} mAh, tank ${p ? f2(p.tankM3 * 1e6) : '?'} cc`;
  }
  const ok = sw.to === id && sw.module === af.simId && sw.shown === id && sw.modelSwapped
    && sw.rule === wantRule && moved < POS_TOL && turned < YAW_TOL && height && speedOk && tuneOk && fresh && powerOk;
  say(ok, `${tag} ${sw.from} -> ${id}: module ${sw.module}, drawn ${sw.shown}${sw.modelSwapped ? ' (new model)' : ' (OLD MODEL)'}, `
    + `${sw.rule}${sw.onWater ? ' over water' : ''} (wanted ${wantRule}), moved ${f2(moved)} m, turned ${turned.toExponential(1)} rad, `
    + `y ${f2(a.y)} over floor ${f2(floor)}, ${speedSays}, tune ${sw.tune}${fresh ? ', intact' : `, NOT FRESH ${JSON.stringify({ c: a.crashed, w: a.wrecked, d: a.damage })}`}${powerSays}`);
  return ok;
}

/*
 * ] through every aircraft and back to the first, judging each. Parked
 * (`park`), an aircraft the ground rule put in the air is put back on the
 * ground with R before the next, so every one after it is swapped in on
 * the ground too. Returns each swap's rule, by aircraft.
 */
async function cycle(page, tag, park) {
  const rules = {};
  let id = await page.evaluate('window.__craft().run');
  for (let k = 0; k < AIRFRAMES.length; k += 1) {
    const next = cycleCraft(id, 1);
    const was = await page.evaluate('window.__craftState()');
    await page.evaluate(`(() => {
      const old = window.__lastSwap();
      window.__swapSeen = null;
      window.__swapWatch = setInterval(() => {
        const s = window.__lastSwap();
        if (s && s !== old) { window.__swapSeen = s; clearInterval(window.__swapWatch); }
      }, 5);
      return true;
    })()`);
    await press(page, 'BracketRight');
    await page.until('!!window.__swapSeen', 30000).catch(() => {});
    const sw = await page.evaluate('window.__swapSeen');
    if (!sw) {
      say(false, `${tag} ] from ${id} to ${next}: no swap happened`);
      return rules;
    }
    judgeSwap(tag, sw, next, was);
    rules[next] = sw.rule;
    id = next;
    if (park && !sw.after.landed) {
      await press(page, 'KeyR');
      await page.until('window.__craftState().landed', 30000).catch(() => {});
    }
    await page.sleep(150);
  }
  return rules;
}

/* Climb the five inch to `clear` metres over whatever is under it. */
async function climb(page, clear) {
  await page.evaluate('window.__stick(0, 0, 0, 0.85); true');
  await page.until(`window.__craftState().groundClearance > ${clear}`, 120000).catch(() => {});
  await page.evaluate('window.__stick(0, 0, 0, 0.55); true');
  return page.evaluate('window.__craftState().groundClearance');
}

async function breakPart(page) {
  const r = await page.evaluate("(() => { const c = window.__crash(); if (!c.runDamage) return { skipped: true }; return { code: window.__crashBreak(1) }; })()");
  await page.sleep(400);
  const c = await page.evaluate('window.__crash()');
  return { r, flags: c.flags };
}

/* The picker, in the page: its stage's centre in CSS pixels. */
const STAGE = "(() => { const r = document.querySelector('.carousel-stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()";

/* The mean frame interval over two seconds of the page's own frames. */
async function frameMs(page) {
  return page.evaluate(`new Promise((done) => {
    const t0 = performance.now();
    let n = 0;
    const tick = () => {
      n += 1;
      if (performance.now() - t0 < 2000) { requestAnimationFrame(tick); } else { done((performance.now() - t0) / n); }
    };
    requestAnimationFrame(tick);
  })`);
}

/* The list at rest on a place: a drag grabs it where it is, so a drag
 * started while it is still moving starts from somewhere else. */
async function settled(page) {
  await page.until('Math.abs(window.__ui.carousel.pos - window.__ui.carousel.index) < 0.01', 20000).catch(() => {});
}

async function mouse(page, type, x, y, extra = {}) {
  await page.cdp.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra,
  }, page.sessionId);
}

async function pickerOnTheGate(page) {
  console.log('the front page: Track mode opens the picker on every aircraft');
  const gate = await page.evaluate('window.__ui.onGate()');
  await page.evaluate("window.__ui.setCursor(window.__ui.items().findIndex((it) => it.action === 'way-race-5inch')); true");
  await press(page, 'Enter');
  await page.until('window.__ui.carousel.isOpen', 10000).catch(() => {});
  const open = await page.evaluate('({ open: window.__ui.carousel.isOpen, ids: window.__ui.carousel.ids, current: window.__ui.carousel.current() })');
  /* Every aircraft races a track it fits (#93), so the card's picker is
   * every aircraft; it was the quads' until the field went. */
  say(gate && open.open && open.ids.join() === AIRFRAMES.map((a) => a.id).join(), `Enter on the Track mode card opens the picker on ${open.ids.join(', ')}, centred on ${open.current}`);
  await press(page, 'ArrowRight');
  const right = await page.evaluate('window.__ui.carousel.current()');
  await press(page, 'Enter');
  await page.sleep(300);
  const after = await page.evaluate('({ open: window.__ui.carousel.isOpen, airframe: window.__ui.settings.airframe, mode: window.__ui.mode, gate: window.__ui.onGate() })');
  say(right === 'whoop65' && !after.open && after.airframe === 'whoop65' && after.mode === 'race' && !after.gate,
    `the arrow moves to the ${right} and Enter seats it and answers the gate: ${JSON.stringify(after)}`);
  /* Back to the five inch for the flight, through the Aircraft row's picker. */
  await page.evaluate("window.__ui.show('quad'); true");
  const row = await page.evaluate("window.__ui.items().findIndex((it) => it.open)");
  await page.evaluate(`window.__ui.setCursor(${row}); true`);
  await press(page, 'Enter');
  await page.until('window.__ui.carousel.isOpen', 10000).catch(() => {});
  await press(page, 'ArrowLeft');
  await press(page, 'Enter');
  await page.sleep(300);
  const back = await page.evaluate('({ airframe: window.__ui.settings.airframe, open: window.__ui.carousel.isOpen })');
  say(row >= 0 && back.airframe === '5inch' && !back.open, `the Aircraft row opens the same picker, and seats the ${back.airframe} from it`);
  await page.evaluate("window.__ui.show('title'); true");
}

async function pickerInFlight(page) {
  console.log('in flight: Tab, the wheel, the arrows, a drag, Enter');
  const before = await page.evaluate('({ run: window.__craft().run })');
  await press(page, 'Tab');
  await page.until('window.__ui.carousel.isOpen', 10000).catch(() => {});
  const st = await page.evaluate("({ open: window.__ui.carousel.isOpen, mode: window.__craftState().mode, compact: document.querySelector('.carousel').classList.contains('compact'), current: window.__ui.carousel.current(), ids: window.__ui.carousel.ids })");
  say(st.open && st.mode === 'paused' && st.compact && st.current === before.run,
    `Tab opens the compact picker over the paused flight on the ${st.current}, tab ${st.ids.length} aircraft`);
  /* All, so the drag has room either way. */
  await press(page, 'ArrowDown');
  await press(page, 'ArrowDown');
  const all = await page.evaluate('window.__ui.carousel.ids.length');
  const s = await page.evaluate(STAGE);
  await settled(page);
  const i0 = await page.evaluate('window.__ui.carousel.index');
  await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: s.x, y: s.y, deltaX: 0, deltaY: 120 }, page.sessionId);
  await page.sleep(200);
  const i1 = await page.evaluate('window.__ui.carousel.index');
  say(all === AIRFRAMES.length && i1 === i0 + 1, `the list widens to all ${all}, and a wheel notch turns it one place: ${i0} to ${i1}`);
  await press(page, 'ArrowRight');
  await press(page, 'ArrowRight');
  const i2 = await page.evaluate('window.__ui.carousel.index');
  await press(page, 'ArrowLeft');
  const i3 = await page.evaluate('window.__ui.carousel.index');
  say(i2 === i1 + 2 && i3 === i2 - 1, `the arrows: right twice to ${i2}, left once to ${i3}`);
  /* A drag to the left by a third of the stage brings the next one in. */
  await settled(page);
  await mouse(page, 'mousePressed', s.x, s.y);
  for (let k = 1; k <= 8; k += 1) {
    await mouse(page, 'mouseMoved', s.x - (k / 8) * s.w * 0.35, s.y);
    await page.sleep(16);
  }
  await mouse(page, 'mouseReleased', s.x - s.w * 0.35, s.y);
  await page.sleep(300);
  const i4 = await page.evaluate('window.__ui.carousel.index');
  say(i4 > i3, `a drag across the stage moves it on: ${i3} to ${i4}`);

  /* What it costs, while it is up and turning: its own draw, and the
   * frame against the same paused flight with the pause menu over it. */
  const samples = [];
  for (let k = 0; k < 20; k += 1) {
    await page.sleep(100);
    samples.push(await page.evaluate('window.__carouselStats()'));
  }
  const withPicker = await frameMs(page);
  const ms = samples.map((x) => x.ms).sort((p, q) => p - q);
  const last = samples[samples.length - 1];
  console.log(`  the picker's own draw: median ${f2(ms[ms.length >> 1])} ms, max ${f2(ms[ms.length - 1])} ms of CPU a frame, `
    + `${last.calls} draw calls, a ${last.width}x${last.height} target, ${last.models} models built so far`);
  say(last.calls > 0 && last.models <= AIRFRAMES.length, 'it draws in the shell\'s own renderer and builds each model once');

  const pick = await page.evaluate('window.__ui.carousel.current()');
  await press(page, 'Enter');
  await page.until(`window.__craft().run === ${JSON.stringify(pick)} && window.__craftState().mode === 'flight'`, 30000).catch(() => {});
  const after = await page.evaluate('({ run: window.__craft().run, module: window.__craft().module, mode: window.__craftState().mode, open: window.__ui.carousel.isOpen })');
  say(after.run === pick && after.module === airframeById(pick).simId && after.mode === 'flight' && !after.open,
    `Enter chooses the ${pick}, swaps it in and flies on: ${JSON.stringify(after)}`);
  /* Escape leaves it without a swap and flies on. */
  await press(page, 'Tab');
  await page.until('window.__ui.carousel.isOpen', 10000).catch(() => {});
  await press(page, 'ArrowRight');
  await press(page, 'Escape');
  await page.until("window.__craftState().mode === 'flight'", 10000).catch(() => {});
  const esc = await page.evaluate('({ run: window.__craft().run, mode: window.__craftState().mode, open: window.__ui.carousel.isOpen })');
  say(esc.run === pick && esc.mode === 'flight' && !esc.open, `Escape backs out with no swap and resumes: ${JSON.stringify(esc)}`);
  await press(page, 'Escape');
  await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
  const paused = await frameMs(page);
  console.log(`  a frame with the picker up ${f2(withPicker)} ms, with the pause menu up ${f2(paused)} ms (software rasteriser)`);
  await press(page, 'Escape');
}

async function lake(page) {
  console.log('the Alps\' lake: a float plane afloat, and what cannot float on it');
  const st = await page.evaluate('({ c: window.__craftState(), craft: window.__craft().run })');
  say(st.craft === 'timber1500f' && st.c.floats && st.c.floats.onWater, `the ${st.craft} starts afloat`);
  const steps = [['cub1400f', 'ground'], ['5inch', 'air-forced']];
  for (const [id, rule] of steps) {
    const was = await page.evaluate('window.__craftState()');
    const r = await page.evaluate(`window.__swapNow(${JSON.stringify(id)}).then(() => window.__lastSwap())`);
    say(r.onWater && r.rule === rule, `on the water to the ${id}: ${r.rule}`);
    judgeSwap('lake', r, id, was);
  }
  /* The quad is hovering over the water now: take it down to the surface is
   * not something a quad does, so a wheeled plane is judged from a restart
   * afloat instead. */
  await page.evaluate("window.__swapNow('timber1500f'); true");
  await page.sleep(500);
  await page.evaluate("window.__ui.onAction('restart', window.__ui.settings); true");
  await page.until("window.__craftState().mode === 'flight' && window.__craftState().landed", 60000).catch(() => {});
  await page.sleep(500);
  const was = await page.evaluate('window.__craftState()');
  const r = await page.evaluate("window.__swapNow('cub1400').then(() => window.__lastSwap())");
  say(r.onWater && r.rule === 'air-forced', `a wheeled plane on the water starts ${AIR_ABOVE} m over it: ${r.rule}`);
  judgeSwap('lake', r, 'cub1400', was);
}

/* The quad pilot of scripts/map-plane-check.js, cut down to one gate: level
 * at the gate's height, through its centre along its travel. */
async function flyThroughStart(page) {
  const g = await page.evaluate(`(() => {
    const g = window.__race().gates[0];
    const ap = g.apertures[0];
    return { c: [g.x, g.y + ap.centreY, g.z], t: [g.az.x, g.az.y, g.az.z] };
  })()`);
  await page.evaluate(`(() => {
    const g = ${JSON.stringify(g)};
    const pts = [[-3, 'point'], [3, 'through'], [6, 'point']].map(([d, kind]) => ({ p: g.c.map((v, i) => v + g.t[i] * d), kind }));
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let i = 0;
    window.__pilot = true;
    const step = () => {
      if (!window.__pilot) { window.__stick(0, 0, 0, 0.45); return; }
      const c = window.__craftState();
      const w = pts[Math.min(i, pts.length - 1)];
      const pos = [c.worldX, c.worldY, c.worldZ];
      const rel = w.p.map((v, j) => v - pos[j]);
      const flat = Math.hypot(rel[0], rel[2]);
      if (i < pts.length - 1 && (w.kind === 'through'
        ? (pos[0] - g.c[0]) * g.t[0] + (pos[1] - g.c[1]) * g.t[1] + (pos[2] - g.c[2]) * g.t[2] > 0.3
        : Math.hypot(rel[0], rel[1], rel[2]) < 1.5)) { i += 1; }
      const v = c.vel || { x: 0, y: 0, z: 0 };
      const want = flat > 1e-6 ? [rel[0] / flat * Math.min(5, 0.8 * flat), rel[2] / flat * Math.min(5, 0.8 * flat)] : [0, 0];
      const dv = [want[0] - v.x, want[1] - v.z];
      const f = c.fwd ? [c.fwd.x, c.fwd.z] : [0, -1];
      const fn = Math.hypot(f[0], f[1]) || 1;
      const along = dv[0] * f[0] / fn + dv[1] * f[1] / fn;
      const right = dv[0] * -f[1] / fn + dv[1] * f[0] / fn;
      const dy = g.c[1] - pos[1];
      window.__stick(cl(0.09 * right, -0.45, 0.45), cl(-0.09 * along, -0.45, 0.45), 0, cl(0.37 + 0.12 * dy - 0.1 * v.y, 0.1, 0.9));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`);
  await page.until('window.__race().lapStartMs != null', 120000).catch(() => {});
  await page.evaluate('window.__pilot = false; true');
  return page.evaluate('window.__race().lapStartMs != null');
}

async function mapTrack(page) {
  console.log('swiss2, a map track of plane gates: a lap voided by a swap, and the class limits');
  const at = await page.evaluate('({ x: window.__craftState().worldX, z: window.__craftState().worldZ, g: window.__heightAt(window.__craftState().worldX, window.__craftState().worldZ) })');
  const cx = at.x;
  const cz = at.z - 60;
  const radius = 40;
  let top = -Infinity;
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    top = Math.max(top, await page.evaluate(`window.__heightAt(${cx + radius * Math.cos(a)}, ${cz + radius * Math.sin(a)})`));
  }
  /* Two plane gates and a five inch gate: the Cub fits all three, the
   * Skyhunter not the five inch one (1.2 of its 1.8 m span is 2.16 m, the
   * gate 1.75 m), and every quad races every track. */
  const doc = mapTrackDocument({
    map: 'swiss2', centre: [cx, Math.max(top, at.g) + 14, cz], radius, types: ['wideGate5', 'wideGate5', 'gate'],
    name: 'Hot swap ring', id: 'hotswap-ring',
  });
  await page.evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(SHARE_KEY)}, JSON.stringify({ id: 'hotswap-ring', name: 'Hot swap ring', author: '', document: ${JSON.stringify(doc)} }));
    window.__ui.onAction('title', window.__ui.settings);
    window.__ui.settings.map = 'track';
    window.__ui.persistSettings();
    window.__ui.onSettings(window.__ui.settings);
    return true;
  })()`);
  await page.until("window.__map().ready && window.__map().id === 'swiss2' && window.__race().gates.length === 3", 400000).catch(() => {});
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState().mode === 'flight' && window.__race().gates.length === 3", 120000).catch(() => {});
  /* The air start's countdown, then the pilot takes it through the start gate. */
  await page.sleep(3500);
  await page.evaluate('window.__drawOff(true); true');
  const started = await flyThroughStart(page);
  say(started, 'through the start gate: the lap clock is running');
  const was = await page.evaluate('window.__craftState()');
  const r = await page.evaluate("window.__swapNow('cub1400').then(() => ({ s: window.__lastSwap(), log: window.__race().log.slice(), gates: window.__race().gates.length, lap: window.__race().lapStartMs }))");
  const last = r.log[r.log.length - 1];
  say(r.s.voided && last && last.ms === null && /lap void/i.test(last.reason) && r.lap == null && r.gates === 3,
    `a swap to the Cub mid lap voids it ("${last ? last.reason : 'nothing logged'}") and it keeps the track, whose gates it fits`);
  judgeSwap('track', r.s, 'cub1400', was);
  const w2 = await page.evaluate('window.__craftState()');
  const off = await page.evaluate("window.__swapNow('sky1800').then(() => ({ s: window.__lastSwap(), gates: window.__race().gates.length }))");
  /* The notice is painted on the next drawn frame. */
  await page.evaluate('window.__drawOff(false); true');
  await page.until("/does not fit/.test(window.__craftState().banner)", 20000).catch(() => {});
  off.banner = await page.evaluate('window.__craftState().banner');
  await page.evaluate('window.__drawOff(true); true');
  say(off.gates === 0 && /does not fit/.test(off.banner), `the Skyhunter does not fit the five inch gate: the world without the track, and told so ("${off.banner}")`);
  judgeSwap('track', off.s, 'sky1800', w2);
  const w4 = await page.evaluate('window.__craftState()');
  const whoop = await page.evaluate("window.__swapNow('whoop65').then(() => ({ s: window.__lastSwap(), gates: window.__race().gates.length }))");
  say(whoop.gates === 3, `the whoop is a quad, and every quad races every track: ${whoop.gates} gates`);
  judgeSwap('track', whoop.s, 'whoop65', w4);
  const w3 = await page.evaluate('window.__craftState()');
  const back = await page.evaluate("window.__swapNow('5inch').then(() => ({ s: window.__lastSwap(), gates: window.__race().gates.length }))");
  say(back.gates === 3, `back on the five inch the track is back: ${back.gates} gates`);
  judgeSwap('track', back.s, '5inch', w3);
  await page.evaluate('window.__drawOff(false); true');
}

async function runMap(map) {
  console.log(`\n${map}`);
  const craft = map === 'alps' ? 'timber1500f' : '5inch';
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: seed(craft, map) });
  try {
    await page.until('!!window.__shellReady', 300000);
    await flyNow(page);
    const m = await page.evaluate('window.__map()');
    say(m.id === map, `flying ${m.id}`);
    if (map === 'alps') {
      await lake(page);
      /* Then the land: the lake's run restarted on the five inch. */
      await page.evaluate("window.__swapNow('5inch'); true");
      await page.sleep(500);
      await page.evaluate("window.__ui.onAction('title', window.__ui.settings); true");
      await page.sleep(500);
      await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
      await page.until("window.__craftState().mode === 'flight' && window.__map().ready && window.__craft().run === '5inch'", 400000).catch(() => {});
      await page.sleep(500);
    }
    console.log('  parked, every aircraft by ]');
    const broke = await breakPart(page);
    console.log(`  broke part 1 off the ${await page.evaluate('window.__craft().run')} first: ${JSON.stringify(broke)}`);
    await page.evaluate('window.__drawOff(true); true');
    const parked = await cycle(page, 'ground', true);
    console.log('  in the air, every aircraft by ]');
    const clear = await climb(page, 40);
    console.log(`  climbed to ${f2(clear)} m over the ground`);
    const flying = await cycle(page, 'air', false);
    /* Parked is 'ground', or 'air-forced' where the ground rule applied;
     * which of the two each swap had to be, judgeSwap already held it to. */
    const missing = AIRFRAMES.map((a) => a.id).filter((id) => flying[id] !== 'air' || !(parked[id] === 'ground' || parked[id] === 'air-forced'));
    say(missing.length === 0, `every aircraft swapped in parked and in the air${missing.length ? `: not ${missing.join(', ')} ${JSON.stringify({ parked, flying })}` : ''}`);
    await page.evaluate('window.__stick(); window.__drawOff(false); true');
    if (map === 'swiss2') {
      await mapTrack(page);
    }
    const bad = faults(page);
    say(bad.length === 0, `no console error or uncaught exception${bad.length ? `: ${bad.slice(0, 4).join(' | ')}` : ''}`);
    const net = page.errors.length - bad.length;
    if (net) {
      console.log(`  (${net} resource fetches refused: the board and live servers are not running here)`);
    }
  } catch (e) {
    say(false, `${map}: ${e.message}`);
  } finally {
    await page.close();
  }
}

/*
 * The picker, on a page of its own: the front page card, a flight, and the
 * picker over it. It ran inside the airfield's pass until the airfield was
 * retired; it has a page of its own now because the Swiss valley's pass
 * ends on a map track whose seat the front page's answer would change, and
 * the Alps' pass starts afloat. The Alps, the light world, on the five
 * inch, as the airfield's pass was.
 */
async function runPicker(map) {
  console.log(`\nthe picker, on ${map}`);
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html', seed: seed('5inch', map) });
  try {
    await page.until('!!window.__shellReady', 300000);
    await pickerOnTheGate(page);
    await flyNow(page);
    await pickerInFlight(page);
    const bad = faults(page);
    say(bad.length === 0, `no console error or uncaught exception${bad.length ? `: ${bad.slice(0, 4).join(' | ')}` : ''}`);
  } catch (e) {
    say(false, `the picker on ${map}: ${e.message}`);
  } finally {
    await page.close();
  }
}

for (const map of maps) {
  await runMap(map);
}
if (maps.includes('alps')) {
  await runPicker('alps');
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
