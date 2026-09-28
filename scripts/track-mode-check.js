/*
 * track-mode-check.js: Track mode, which is My tracks and the in-sim
 * builder, walked through the real page the way a pilot walks it.
 *
 *     node scripts/track-mode-check.js [OUT_DIR] [--only=quad|plane|old|fresh]
 *
 * quad, the five inch on the Swiss valley:
 *
 *   1. The title's Track mode card opens the aircraft picker on every
 *      aircraft, and choosing opens My tracks, which is empty: New track,
 *      the board's page and Back.
 *   2. New track asks which world, the Alps or the Swiss valley, and the
 *      Swiss valley opens the builder there on an empty track.
 *   3. Three gates hung in a ring with the builder's own controls, Ctrl+S
 *      saves them, Escape comes back to My tracks, which lists the track
 *      with its world and its three gates.
 *   4. Play seats it on the valley as a race of three gates and opens the
 *      launch card; Fly, and a pilot in the page flies a lap on the sticks:
 *      the lap closes, the time is the record and the ghost is recorded.
 *      The results screen goes back to My tracks.
 *   5. Edit opens the builder on the same track, in the same world, and
 *      Escape comes back. Duplicate makes a copy under its own id and a
 *      name that says so. With two cards listed, the cursor on Delete
 *      shows the whole row, clear of the bars drawn over the screen. Delete
 *      asks first, with focus on keeping it, so Enter there keeps; a move
 *      onto Delete and Enter takes the copy out.
 *
 * plane, the Skyhunter on the Alps, in a browser of its own:
 *
 *   6. The same card, the Skyhunter chosen from the picker's every aircraft,
 *      is Track mode, not Free Flight. My tracks leaves out a track of five
 *      inch gates the Skyhunter does not fit.
 *   7. New track on the Alps, a ring of plane sized gates, saved, listed,
 *      played, and a lap flown on the sticks with the time recorded.
 *
 * old, a browser that flew the race field before this:
 *
 *   8. Settings on the old field map (map 'custom', and 'field', a whoop
 *      seated in its room), a field track in the library, a field track in
 *      the whoop's old share seat, and a track built in a world before the
 *      creative builder: boots with no error, the seat is Track mode on the
 *      Swiss valley, My tracks lists only the built track, and Play seats
 *      it in its world as a race. ?map=custom boots too.
 *
 * fresh, a browser with no aircraft chosen:
 *
 *   9. The Timber is seated, on its own tune and camera; the Free Flight
 *      and Track mode cards' pickers both open on it; and a new track built
 *      with it opens on a plane's hotbar (course.js DEFAULT_WING_HOTBAR),
 *      the sky hoops first.
 *
 * No console error and no uncaught exception anywhere, in any of them; a
 * resource the page could not fetch is not one, because the board is not
 * running here and the shell is written to fly without it.
 *
 * Pictures land in OUT_DIR (tmp/track-mode-check by default). They are
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

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import {
  B, hold, key, leave, lookAlong, placeHere, takeMouse,
} from '../tests/lib/buildkeys.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { DEFAULT_WING_HOTBAR } from '../src/builder/course.js';
import { str } from '../src/strings/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const opts = {};
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (m) {
    opts[m[1]] = m[2] === undefined ? true : m[2];
  } else {
    positional.push(a);
  }
}
const outDir = resolve(positional[0] || join(root, 'tmp', 'track-mode-check'));
await mkdir(outDir, { recursive: true });

const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';
const WIDE = ['wideGate5', 'pylonPair', 'wideGate5'];

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
const f1 = (x) => Number(x).toFixed(1);

/* The aircraft seated before the first line of the app runs, in angle mode
 * so a stick is an attitude and a pilot in the page can fly a line, and
 * `extra` run after it; no gamepads, so a radio left plugged into the host
 * does not drive the builder's camera. */
function seed(airframe, extra = '') {
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe);
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    s.fpsCap = 0;
    s.graphics = 'low';
    s.flightMode = 'angle';
    localStorage.setItem(k, JSON.stringify(s));
    ${extra}
  } catch (e) { /* storage refused; the checks below will say so */ }
  navigator.getGamepads = () => [];`];
}

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, page.sessionId);
  const path = join(outDir, `${name}.jpg`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

async function shellUp(page) {
  await page.until('!!window.__shellReady', 300000);
  await page.until('window.__map && window.__map().ready', 400000);
}

/* Console errors and uncaught exceptions. A resource the page could not
 * fetch is listed apart: no board runs here. */
function faults(page) {
  return page.errors.filter((e) => !e.startsWith('network:'));
}

const screen = (page) => page.evaluate('window.__ui.screen');
const actions = (page) => page.evaluate('window.__ui.items().filter((it) => !it.section).map((it) => it.action)');

/* Choose the row whose action is `action`, the way Enter on it does. */
async function choose(page, action) {
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.action === ${JSON.stringify(action)})`);
  if (at < 0) {
    throw new Error(`no row ${action} on ${await screen(page)}: ${JSON.stringify(await actions(page))}`);
  }
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
}

/* Choose the My tracks card of track `id`, which opens its rows. */
async function chooseCard(page, id) {
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.course && it.course.track.id === ${JSON.stringify(id)})`);
  if (at < 0) {
    throw new Error(`no card for ${id}`);
  }
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); window.__ui.select(); return true; })()`);
  await page.until(`window.__ui.cardSubject && window.__ui.cardSubject.endsWith(${JSON.stringify(`:${id}`)})`, 5000);
}

/*
 * Put the cursor on the row whose action is `action`, the way the arrows
 * do, and measure it: its box against the window's top and bottom bars,
 * which are drawn over the screen. `clear` is the whole row visible.
 */
async function rowInView(page, action) {
  const at = await page.evaluate(`window.__ui.items().findIndex((it) => it.action === ${JSON.stringify(action)})`);
  await page.evaluate(`(() => { window.__ui.setCursor(${at}); return true; })()`);
  await page.sleep(400);
  return page.evaluate(`(() => {
    const box = (n) => n.getBoundingClientRect();
    const row = document.querySelector('.screen-courses .menu .on');
    const top = box(document.querySelector('.frame-top')).bottom;
    const bottom = box(document.querySelector('.frame-bot')).top;
    const r = box(row);
    return { text: row.textContent.trim(), row: [Math.round(r.top), Math.round(r.bottom)], bars: [Math.round(top), Math.round(bottom)], clear: r.top >= top && r.bottom <= bottom };
  })()`);
}

const mine = (page) => page.evaluate('(window.__ui.localCourses || []).map((t) => ({ id: t.id, name: t.name, map: t.map, gates: t.gates }))');

/* The title's Track mode card, through the aircraft picker it opens, to My
 * tracks. The picker opens on the seated aircraft, so Enter chooses it. */
async function trackModeCard(page) {
  await page.until('window.__ui.onGate()', 60000);
  await choose(page, 'way-race-5inch');
  await page.until('window.__ui.carousel.isOpen', 10000);
  const picker = await page.evaluate('({ filter: window.__ui.carousel.filter, ids: window.__ui.carousel.ids.slice(), current: window.__ui.carousel.ids[window.__ui.carousel.index] })');
  await page.tap('Enter');
  await page.until("window.__ui.screen === 'courses'", 20000);
  return picker;
}

/* New track in `map`: the world rows, then the builder open in it. */
async function newTrack(page, map) {
  await choose(page, 'newtrack');
  const rows = await actions(page);
  await choose(page, `newtrack:${map}`);
  await page.until(`window.__build && ${B('.state')} === 'building' && ${B('.map')} === ${JSON.stringify(map)}`, 600000);
  /* A world built for it has its loading screen over the canvas until the
   * first frame is drawn, and a click there is not a click on the world. */
  await page.until('window.__loading.root.hidden', 120000);
  return rows;
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

/* Hang one piece of each of `types` round a ring 45 m over the highest
 * ground under it, each flown along the ring: the piece from the hotbar,
 * the camera 20 m behind where it goes, Alt and a left click. */
async function hangRing(page, types, R, offset) {
  await takeMouse(page);
  const cam = await page.evaluate(B('.camera.pos'));
  const cx = cam[0];
  const cz = cam[2] - offset;
  const cy = (await highestUnder(page, cx, cz, R)) + 45;
  for (let i = 0; i < types.length; i += 1) {
    const a = (i / types.length) * Math.PI * 2;
    const P = [cx + R * Math.cos(a), cy, cz + R * Math.sin(a)];
    const T = [-Math.sin(a), 0, Math.cos(a)];
    await hold(page, types[i]);
    await lookAlong(page, P.map((v, j) => v - T[j] * 20), Math.atan2(-T[0], -T[2]), 0);
    await placeHere(page, { air: true });
  }
  return { centre: [cx, cy, cz], R };
}

/* Ctrl+S, and the builder's own word that it saved. */
async function save(page) {
  await key(page, 'KeyS', { ctrl: true });
  await page.until(`/Saved/.test(${B('.message')})`, 10000).catch(() => {});
  return page.evaluate(B('.message'));
}

/* Out of the builder with Escape, back onto My tracks. */
async function backToTracks(page) {
  await leave(page);
  await page.until(`${B('.state')} === 'off' && window.__ui.screen === 'courses'`, 60000);
}

/* Play the card of track `id`: seated on its world as a race of `n` gates,
 * and the launch card up. */
async function play(page, id, map, n) {
  await chooseCard(page, id);
  await choose(page, 'card-fly');
  await page.until(`window.__ui.screen === 'launch' && window.__map().ready && window.__map().id === ${JSON.stringify(map)} && window.__race().gates.length === ${n}`, 600000).catch(() => {});
  return page.evaluate(`({ screen: window.__ui.screen, map: window.__map(), gates: window.__race().gates.length, key: window.__race().key, build: window.__build.state().state, seat: window.__ui.settings.map })`);
}

/* Fly from the launch card, and wait for the run to be in the air. */
async function launch(page) {
  await choose(page, 'launch-go');
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000);
}

/*
 * THE QUAD PILOT, scripts/map-share-check.js's: angle mode, heading held,
 * tilted toward the velocity it wants and the height held on the throttle,
 * steering for a point 7 m before each gate, its centre, and a point 5 m
 * past it, round the ring and back through the start gate.
 */
async function flyQuad(page, gates) {
  await page.evaluate(`(() => {
    const G = ${JSON.stringify(gates)};
    const pts = [];
    const add = (g, d, kind) => pts.push({ p: g.centre.map((v, i) => v + g.travel[i] * (kind === 'through' ? 3 : d)), g, kind });
    add(G[0], -3, 'point');
    add(G[0], 0, 'through');
    add(G[0], 5, 'point');
    for (let k = 1; k <= G.length; k += 1) {
      const g = G[k % G.length];
      add(g, -7, 'point');
      add(g, 0, 'through');
      add(g, 5, 'point');
    }
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let i = 0;
    let lift = 0;
    window.__pilot = true;
    const step = () => {
      if (!window.__pilot) { window.__stick(); return; }
      const c = window.__craftState();
      const w = pts[Math.min(i, pts.length - 1)];
      const pos = [c.worldX, c.worldY, c.worldZ];
      const rel = w.p.map((v, j) => v - pos[j]);
      const flat = Math.hypot(rel[0], rel[2]);
      if (i < pts.length - 1) {
        const past = w.kind === 'through'
          ? (pos[0] - w.g.centre[0]) * w.g.travel[0] + (pos[1] - w.g.centre[1]) * w.g.travel[1] + (pos[2] - w.g.centre[2]) * w.g.travel[2] > 0.3
          : Math.hypot(rel[0], rel[1], rel[2]) < 1.5;
        if (past) { i += 1; }
      }
      const v = c.vel || { x: 0, y: 0, z: 0 };
      const last = i >= pts.length - 1;
      const vmax = last ? 0 : 6;
      const want = flat > 1e-6 ? [rel[0] / flat * Math.min(vmax, 0.8 * flat), rel[2] / flat * Math.min(vmax, 0.8 * flat)] : [0, 0];
      const dv = [want[0] - v.x, want[1] - v.z];
      const f = c.fwd ? [c.fwd.x, c.fwd.z] : [0, -1];
      const fn = Math.hypot(f[0], f[1]) || 1;
      const fx = f[0] / fn;
      const fz = f[1] / fn;
      const along = dv[0] * fx + dv[1] * fz;
      const right = dv[0] * -fz + dv[1] * fx;
      const dy = w.g.centre[1] - pos[1];
      lift = cl(lift + 0.002 * dy, -0.2, 0.2);
      window.__stick(cl(0.09 * right, -0.45, 0.45), cl(-0.09 * along, -0.45, 0.45), 0, cl(0.37 + lift + 0.12 * dy - 0.1 * v.y, 0.1, 0.9));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`);
  return waitLap(page, 240);
}

/*
 * THE PLANE PILOT, scripts/map-plane-check.js's, round a ring: L1 guidance
 * for the bank (Park, Deyst and How, 2004), a pitch hold for the height and
 * the throttle holding `speed`, on the aircraft's own attitude.
 */
async function flyPlaneRing(page, [cx, cy, cz], R, speed) {
  const path = [];
  for (let a = -8 / R; a <= 2 * Math.PI + 30 / R; a += 1 / R) {
    path.push([cx + R * Math.cos(a), cy, cz + R * Math.sin(a)]);
  }
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
  return waitLap(page, 240);
}

/* On the plant's clock: drawing is off while the pilot flies, so a frame is
 * the plant's step and not the software rasteriser's second. */
async function waitLap(page, limitS) {
  await page.evaluate('window.__drawOff(true)');
  const t0 = (await page.evaluate('window.__crash()')).simT;
  await page.until(`window.__race().laps.length >= 1 || window.__craftState().crashed || window.__crash().simT - ${t0} > ${limitS}`, 1800000).catch(() => {});
  await page.evaluate('window.__drawOff(false)');
  await page.evaluate('window.__pilot = false');
  await page.sleep(200);
  return page.evaluate('({ laps: window.__race().laps.slice(), best: window.__race().bestLapMs(), c: window.__craftState(), ghost: window.__ghost(), screen: window.__ui.screen })');
}

/* A lap, its time the record and its ghost recorded, and the way back to
 * My tracks from wherever the run left the pilot. */
async function judgeLap(page, lap, what) {
  say(lap.laps.length >= 1 && lap.best != null, `${what}: a lap flown on the sticks, ${lap.best != null ? (lap.best / 1000).toFixed(2) : 'none'} s${lap.laps.length ? '' : `, the craft at ${f1(lap.c.worldX)}, ${f1(lap.c.worldY)}, ${f1(lap.c.worldZ)}, crashed ${lap.c.crashed}`}`);
  say(lap.ghost.bestMs != null && lap.best != null && Math.round(lap.ghost.bestMs) === Math.round(lap.best), `its ghost is recorded: ${lap.ghost.bestMs != null ? Math.round(lap.ghost.bestMs) : 'none'} ms`);
  const record = await page.evaluate('window.__race().bestMs');
  say(record != null && lap.best != null && Math.round(record) === Math.round(lap.best), `and it is the track's record: ${record != null ? Math.round(record) : 'none'} ms`);
  if (lap.screen !== 'results') {
    await page.evaluate("window.__ui.act('pause'); window.__ui.show('paused'); true");
    await page.until("window.__ui.screen === 'paused'", 10000);
  }
  const rows = await actions(page);
  say(rows.includes('mytracks'), `the ${await screen(page)} screen offers My tracks: ${rows.join(', ')}`);
  await choose(page, 'mytracks');
  await page.until("window.__ui.screen === 'courses'", 20000);
}

async function quad() {
  console.log('the five inch: My tracks on the Swiss valley');
  const page = await openPage({ root, width: 1280, height: 720, seed: seed('5inch') });
  try {
    await shellUp(page);
    /* 1. The card, the picker, My tracks. */
    const picker = await trackModeCard(page);
    say(picker.filter === 'all' && picker.ids.length === 12 && picker.current === '5inch',
      `the Track mode card opens the picker on every aircraft (${picker.ids.length}), centred on the ${picker.current}`);
    const empty = await actions(page);
    say(empty.join() === 'newtrack,leaderboard,back' && (await mine(page)).length === 0, `My tracks opens, empty: ${empty.join(', ')}`);
    await shot(page, '1-my-tracks-empty');

    /* 2. New track on swiss2. */
    const worlds = await newTrack(page, 'swiss2');
    say(worlds.includes('newtrack:alps') && worlds.includes('newtrack:swiss2') && worlds.filter((a) => a.startsWith('newtrack:')).length === 2,
      `New track asks which world: ${worlds.filter((a) => a.startsWith('newtrack:')).join(', ')}`);
    const fresh = await page.evaluate(B('.doc'));
    say(fresh.map === 'swiss2' && fresh.elements.length === 0 && fresh.schemaVersion === 4, `the builder opens on the Swiss valley on an empty track (schemaVersion ${fresh.schemaVersion})`);

    /* 3. Build, save, back. */
    const ring = await hangRing(page, ['gate', 'gate', 'gate'], 30, 60);
    const gates = await page.evaluate(B('.gates'));
    say(gates.length === 3, `three gates hung in a ring ${f1(ring.centre[1] - (await highestUnder(page, ring.centre[0], ring.centre[2], ring.R)))} m over the ground`);
    const saved = await save(page);
    say(/Saved/.test(saved), `Ctrl+S saves it: ${JSON.stringify(saved)}`);
    const id = await page.evaluate(B('.doc.id'));
    const name = await page.evaluate(B('.doc.name'));
    await backToTracks(page);
    const listed = await mine(page);
    say(listed.length === 1 && listed[0].id === id && listed[0].map === 'swiss2' && listed[0].gates === 3,
      `Escape comes back to My tracks, which lists it: ${JSON.stringify(listed)}`);
    const cards = await page.evaluate("document.querySelectorAll('.course-card').length");
    say(cards === 1, `as one card, wearing its world's picture: ${cards} card`);
    await shot(page, '2-my-tracks-listed');

    /* 4. Play it. */
    const seat = await play(page, id, 'swiss2', 3);
    say(seat.screen === 'launch' && seat.map.mode === 'race' && seat.gates === 3 && seat.build === 'racing' && seat.seat === 'track' && seat.key.endsWith(`.map.${id}`),
      `Play seats it on ${seat.map.id} as a race of ${seat.gates} gates with a record of its own, and opens the launch card`);
    await launch(page);
    const lap = await flyQuad(page, gates);
    await judgeLap(page, lap, 'the five inch');

    /* 5. Edit, duplicate, delete. */
    await chooseCard(page, id);
    const cardRows = await actions(page);
    say(['card-fly', 'card-edit', 'card-rename', 'card-duplicate', 'card-delete', 'card-back'].every((a) => cardRows.includes(a)),
      `its card offers ${cardRows.join(', ')}`);
    await choose(page, 'card-edit');
    await page.until(`${B('.state')} === 'building' && ${B('.doc.id')} === ${JSON.stringify(id)}`, 600000).catch(() => {});
    const edit = await page.evaluate(B(''));
    say(edit.state === 'building' && edit.map === 'swiss2' && edit.doc.id === id && edit.gates.length === 3, `Edit opens the builder on it, in the Swiss valley, ${edit.gates.length} gates`);
    await backToTracks(page);
    await chooseCard(page, id);
    await choose(page, 'card-duplicate');
    await page.until('(window.__ui.localCourses || []).length === 2', 10000).catch(() => {});
    const two = await mine(page);
    const copy = two.find((t) => t.id !== id);
    say(two.length === 2 && copy && copy.name === `${name} copy` && copy.gates === 3 && copy.map === 'swiss2',
      `Duplicate makes a copy under its own id: ${copy ? `${copy.id}, ${JSON.stringify(copy.name)}` : 'none'}`);
    await chooseCard(page, copy.id);
    const row = await rowInView(page, 'card-delete');
    say(row.clear, `with two cards listed, the cursor on Delete shows the whole row, clear of both bars: ${JSON.stringify(row)}`);
    await shot(page, '3-delete-row');
    await choose(page, 'card-delete');
    await page.until("(() => { const d = document.querySelector('.name-dialog-box'); return d && d.offsetParent !== null; })()", 10000).catch(() => {});
    const asked = await page.evaluate("(() => { const d = document.querySelector('.name-dialog-box'); return d && d.offsetParent !== null ? d.textContent : null; })()");
    say(Boolean(asked) && asked.includes(copy.name), `Delete asks first: ${JSON.stringify(asked && asked.slice(0, 80))}`);
    await shot(page, '3-delete-asks');
    const focusNow = "(() => { const d = document.querySelector('.name-dialog'); return d && !d.hidden ? document.activeElement.textContent : null; })()";
    const focused = await page.evaluate(focusNow);
    /* Past the dialog's deaf 300 ms, so the key is heard. */
    await page.sleep(400);
    await page.tap('Enter');
    await page.sleep(300);
    const kept = { open: await page.evaluate(focusNow), n: (await mine(page)).length };
    say(focused === str('ui.keep_it') && kept.open === null && kept.n === 2,
      `it opens with focus on ${JSON.stringify(focused)}, and Enter there keeps the track: ${JSON.stringify(kept)}`);
    await chooseCard(page, copy.id);
    await choose(page, 'card-delete');
    await page.until(`${focusNow} !== null`, 10000).catch(() => {});
    await page.sleep(400);
    await page.tap('ArrowRight');
    const onDelete = await page.evaluate(focusNow);
    await page.tap('Enter');
    say(onDelete === str('ui.delete_label'), `deleting is a move onto ${JSON.stringify(onDelete)} and then Enter`);
    await page.until('(window.__ui.localCourses || []).length === 1', 10000).catch(() => {});
    const left = await mine(page);
    const stored = await page.evaluate(`Object.keys(JSON.parse(localStorage.getItem(${JSON.stringify(LIBRARY_KEY)}) || '{}'))`);
    say(left.length === 1 && left[0].id === id && !stored.includes(copy.id), `and yes takes the copy out of the list and the library: ${left.map((t) => t.id).join(', ')}`);
    const f = faults(page);
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

async function plane() {
  const sky = airframeById('sky1800');
  console.log(`the ${sky.name}: My tracks on the Alps`);
  /* A track of five inch gates already in the library, which the Skyhunter
   * does not fit. */
  const narrow = mapTrackDocument({ map: 'alps', centre: [0, 600, 0], radius: 40, name: 'Five inch ring' });
  const lib = JSON.stringify({ [narrow.id]: narrow });
  const page = await openPage({ root, width: 1280, height: 720, seed: seed(sky.id, `localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(lib)});`) });
  try {
    await shellUp(page);
    /* 6. The card, the picker, My tracks. */
    const picker = await trackModeCard(page);
    say(picker.filter === 'all' && picker.current === sky.id && (await page.evaluate('window.__ui.mode')) === 'race',
      `the Track mode card's picker, on every aircraft, chooses the ${sky.short} into Track mode, not Free Flight`);
    const listed0 = await mine(page);
    say(listed0.length === 0, `My tracks leaves out ${narrow.id}, a track of five inch gates the ${sky.short} does not fit`);

    /* 7. New track on the Alps, plane sized gates, flown. */
    await newTrack(page, 'alps');
    const ring = await hangRing(page, WIDE, 90, 120);
    const types = (await page.evaluate(B('.doc'))).elements.map((e) => e.type);
    say(types.join() === WIDE.join(), `a ring of plane sized gates on the Alps: ${types.join(', ')}`);
    const warnings = await page.evaluate(B('.warnings'));
    say(warnings.length === 0, `no geometry warning for the ${sky.short}${warnings.length ? `: ${JSON.stringify(warnings)}` : ''}`);
    say(/Saved/.test(await save(page)), 'Ctrl+S saves it');
    const id = await page.evaluate(B('.doc.id'));
    await backToTracks(page);
    const listed = await mine(page);
    say(listed.length === 1 && listed[0].id === id && listed[0].map === 'alps', `My tracks lists it for the ${sky.short}: ${JSON.stringify(listed)}`);
    const seat = await play(page, id, 'alps', 3);
    say(seat.screen === 'launch' && seat.map.mode === 'race' && seat.gates === 3 && seat.key.includes(`.${sky.id}`) && seat.key.endsWith(`.map.${id}`),
      `Play seats it on the Alps for the ${sky.short}, with its record of its own`);
    await launch(page);
    const lap = await flyPlaneRing(page, ring.centre, ring.R, 16);
    await judgeLap(page, lap, `the ${sky.short}`);
    const f = faults(page);
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

/*
 * What an older build left in a browser: the race field seated (map
 * 'custom'), a whoop in its room, a field track in the library and in the
 * autosave, a RaceGOW room in the whoop's share seat, and a track built in a
 * world before the creative builder.
 */
async function old() {
  console.log('a browser from before: the field, the room, and a track built in a world');
  const built = JSON.parse(await readFile(join(root, 'tests/fixtures/map-track-v4.json'), 'utf8'));
  const field = {
    schemaVersion: 3, id: 'trk-0ld0f1e1', name: 'Old field track', trackClass: 'full', field: { width: 60, depth: 40 },
    elements: [{ id: 'el-1', type: 'gate', x: 10, y: 10, z: 0, yaw: 0 }], sequence: [{ id: 'sq-1', elementId: 'el-1', apertureIndex: 0, entry: 1 }],
  };
  const room = { ...field, id: 'trk-0ld0r00m', name: 'Old room', trackClass: 'micro' };
  const leftovers = `
    localStorage.setItem(${JSON.stringify(LIBRARY_KEY)}, ${JSON.stringify(JSON.stringify({ [field.id]: field, [built.id]: built }))});
    localStorage.setItem('webfpv.trackbuilder.autosave.v1', ${JSON.stringify(JSON.stringify(field))});
    localStorage.setItem('webfpv.share.import.micro.v1', ${JSON.stringify(JSON.stringify({ id: room.id, name: room.name, document: room }))});
    const s2 = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}));
    s2.map = window.__oldMap || 'custom';
    localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(s2));`;
  for (const [was, url] of [['custom', '/index.html'], ['field', '/index.html'], ['custom', '/index.html?map=custom']]) {
    const page = await openPage({
      root, width: 1280, height: 720, url, seed: [`window.__oldMap = ${JSON.stringify(was)};`, ...seed('whoop65', leftovers)],
    });
    try {
      await shellUp(page);
      const s = await page.evaluate('({ map: window.__ui.settings.map, world: window.__map().id, craft: window.__ui.settings.airframe })');
      say(s.map === 'track' && s.world === 'swiss2' && s.craft === 'whoop65',
        `settings on ${was} (${url}) boot into the Track seat, the whoop seated, the Swiss valley standing: ${JSON.stringify(s)}`);
      if (url === '/index.html' && was === 'custom') {
        await trackModeCard(page);
        const listed = await mine(page);
        say(listed.length === 1 && listed[0].id === built.id && listed[0].gates === built.sequence.length,
          `My tracks lists only the track built in a world, not the field track: ${JSON.stringify(listed)}`);
        await shot(page, '4-old-browser-my-tracks');
        const seat = await play(page, built.id, built.map, built.sequence.length);
        say(seat.screen === 'launch' && seat.map.id === built.map && seat.map.mode === 'race' && seat.gates === built.sequence.length,
          `Play seats it on ${seat.map.id} as a race of ${seat.gates} gates, for the whoop`);
      }
      const f = faults(page);
      say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
    } finally {
      await page.close();
    }
  }
}

/*
 * A fresh visitor, who has chosen no aircraft: the Timber is seated with
 * its own tune and camera, both cards' pickers open on it, and a new track
 * built with it opens on a hotbar of pieces a plane fits.
 */
async function fresh() {
  console.log('a fresh visitor: the Timber');
  const timber = airframeById('timber1500');
  const page = await openPage({
    root,
    width: 1280,
    height: 720,
    url: '/index.html',
    seed: [`try {
      localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({ fpsCap: 0, graphics: 'low' }));
    } catch (e) { /* storage refused; the checks below will say so */ }
    navigator.getGamepads = () => [];`],
  });
  try {
    await shellUp(page);
    const s = await page.evaluate('(({ airframe, airframeAsked, tune, cameraFov }) => ({ airframe, airframeAsked, tune, cameraFov }))(window.__ui.settings)');
    say(s.airframe === timber.id && !s.airframeAsked && s.tune === timber.defaultTune && s.cameraFov === timber.cameraFov,
      `nothing chosen seats the ${timber.short}, on its own tune and camera: ${JSON.stringify(s)}`);
    await page.until('window.__ui.onGate()', 60000);
    await choose(page, 'way-freestyle-wing1000');
    await page.until('window.__ui.carousel.isOpen', 10000);
    const flight = await page.evaluate('window.__ui.carousel.current()');
    say(flight === timber.id, `the Free Flight card's picker opens on the ${timber.short}: ${flight}`);
    await page.tap('Escape');
    await page.until('!window.__ui.carousel.isOpen', 10000);
    const picker = await trackModeCard(page);
    say(picker.current === timber.id, `the Track mode card's picker opens on the ${timber.short}: ${picker.current}`);
    const chosen = await page.evaluate('({ airframe: window.__ui.settings.airframe, asked: window.__ui.settings.airframeAsked })');
    say(chosen.airframe === timber.id && chosen.asked, `choosing it keeps the ${timber.short} and records the choice`);
    await newTrack(page, 'swiss2');
    const bar = await page.evaluate(B('.hotbar'));
    say(bar.join() === DEFAULT_WING_HOTBAR.join() && !bar.includes('start'), `a new track with the ${timber.short} opens on a plane's hotbar, the sky hoops first: ${bar.join(' ')}`);
    const f = faults(page);
    say(f.length === 0, `no console error or uncaught exception${f.length ? `: ${f.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

const parts = {
  quad, plane, old, fresh,
};
for (const [name, run] of Object.entries(parts)) {
  if (opts.only && opts.only !== name) {
    continue;
  }
  try {
    await run();
  } catch (e) {
    say(false, `${name}: ${e.message}`);
  }
}
console.log(`\n${failed ? `${failed} FAILED, ` : 'all passed, '}${passed} ok`);
process.exitCode = failed ? 1 : 0;
