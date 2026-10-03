/*
 * map-plane-check.js: fixed wings on a track built inside a world, from the
 * builder to the board and back, through the real page.
 *
 *     BOARD_ORIGIN=http://127.0.0.1:3180 node scripts/map-plane-check.js [OUT_DIR] [--skip-sky] [--skip-floats]
 *
 * The plane half of scripts/map-share-check.js, and it needs the same
 * throwaway board: one from a checkout of fdfpv-leaderboard that keeps a
 * plane board beside the quads' on a map track, started with
 * BOARD_FILE=<scratch>/board.json PORT=3180 node src/server.js. Never point
 * it at the live board: it publishes tracks and posts times.
 *
 * In the order a pilot would do it:
 *
 *   1. The Skyhunter on swiss2: build a ring of plane sized gates in the air
 *      with the builder's own controls (the piece from the hotbar, Alt and a
 *      left click to hang it), a 5 m wide gate, the air race pylon pair and
 *      another wide gate, with no geometry warning for the Skyhunter, and
 *      publish it with P through the shell's dialog.
 *   2. Reload. My tracks, with the Skyhunter seated, lists it and not
 *      a map track of five inch gates it does not fit; choosing it seats
 *      the course in the Skyhunter's own seat, as a race.
 *   3. Fly it: from the air start a plane pilot in the page flies a lap on
 *      the sticks, a bank and a height hold steering round the ring, and
 *      the lap closes with a ghost recorded.
 *   4. Upload the time: the board checks it with the plane named, keeps it
 *      on the plane board, and serves its ghost.
 *   5. Reload on the board's chase link, which names the plane: the same
 *      course is seated for the Skyhunter, the board's plane ghost is armed
 *      and chased round the lap with a gap read at the gates.
 *   6. A quad still works: the five inch, seated from My tracks, flies
 *      the same track and its time goes on the quads' board, first there,
 *      whatever the plane flew.
 *   7. The Timber on floats on the Alps: a start gate standing on the lake
 *      and two hung over it, published and seated; the run starts afloat
 *      behind the start gate, takes off off the water through it, flies
 *      the lap, and the time goes on the plane board.
 *
 * Pictures land in OUT_DIR (tmp/map-plane-check by default). They are
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
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import {
  B, hold, key, leave, lookAlong, placeHere, takeMouse,
} from '../tests/lib/buildkeys.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { checkLap } from '../src/game/verify.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const opts = {};
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
  if (m) {
    opts[m[1]] = m[2] === undefined ? true : m[2];
  } else {
    positional.push(a);
  }
}
const outDir = resolve(positional[0] || join(root, 'tmp', 'map-plane-check'));
await mkdir(outDir, { recursive: true });
const BOARD = String(process.env.BOARD_ORIGIN || 'http://127.0.0.1:3180').replace(/\/+$/, '');
/* A fresh name each run: the board files a name under the first pilot key
 * that posts it, and every run of this is a new browser with a new key. */
const PILOT = `Wing ${Date.now().toString(36)}`;
const WIDE = ['wideGate5', 'pylonPair', 'wideGate5'];

let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
}
const f1 = (x) => Number(x).toFixed(1);

/* The aircraft seated before the first line of the app runs, on its own
 * default tune; no gamepads, so a radio left plugged into the host does
 * not drive the free camera. */
function seed(airframe) {
  const seated = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, airframe);
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(seated)});
    s.airframeAsked = true;
    s.fpsCap = 0;
    s.flightMode = 'angle';
    localStorage.setItem(k, JSON.stringify(s));
  } catch (e) { /* storage refused; the checks below will say so */ }
  navigator.getGamepads = () => [];`];
}

async function shot(page, name) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, page.sessionId);
  const path = join(outDir, `${name}.jpg`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

async function boardJson(path, init) {
  const res = await fetch(`${BOARD}${path}`, init);
  if (!res.ok) {
    throw new Error(`${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function shellUp(page) {
  await page.until('!!window.__shellReady', 240000);
  await page.until('window.__map && window.__map().ready', 300000);
}

/* Place one piece of `type` from the hotbar, its opening at P flown along
 * T, from a camera `back` metres behind it (and `up` above it, looking
 * down at `pitch`): hung in the air with Alt held, or with `air` false on
 * whatever the crosshair meets. */
async function place(page, type, P, T, {
  back = 20, up = 0, pitch = 0, air = true,
} = {}) {
  await hold(page, type);
  const from = [P[0] - T[0] * back, P[1] + up, P[2] - T[2] * back];
  await lookAlong(page, from, Math.atan2(-T[0], -T[2]), pitch);
  await placeHere(page, { air });
}

/* P in build mode, the name and the pilot typed into the shell's dialog.
 * The pilot's name is the one this page's times go up under. */
async function publish(page, name, pilot = PILOT) {
  await key(page, 'KeyP');
  await page.until("(() => { const d = document.querySelector('.name-dialog-box'); return d && d.offsetParent !== null; })()", 10000);
  await page.evaluate(`(() => {
    const f = [...document.querySelectorAll('.name-dialog-input')];
    f[0].value = ${JSON.stringify(name)};
    f[1].value = ${JSON.stringify(pilot)};
    f[1].focus();
    return true;
  })()`);
  await page.tap('Enter');
  await page.until(`/Published|Could not publish/.test(${B('.message')})`, 60000).catch(() => {});
  return page.evaluate(B('.message'));
}

/*
 * THE PLANE PILOT IN THE PAGE, once a frame on the plant's clock. A bank
 * hold on the roll stick and a pitch hold on the elevator, on the aircraft's
 * own attitude out of __craftState, the loops scripts/floats-shell.js flies
 * the Timber off the lake with; the throttle holds `speed`.
 *
 * Steering is L1 guidance (Park, Deyst and How, "A New Nonlinear Guidance
 * Logic for Trajectory Tracking", 2004): a point L1 metres ahead along the
 * path, and a sideways acceleration 2 V^2 sin(eta) / L1 toward it, flown as
 * the bank that makes it. The path is `path`, a dense list of points in
 * flying order from the start round the lap and back through the start
 * gate (ringPath, stadiumPath), each gate on it along its own axis. Height
 * is the path's own at the nearest point.
 *
 * `takeoff` is the floatplane's first phase: full throttle and the stick
 * back until it is on the step, then a four degree hold, rotating once it
 * is at `rotate` m/s, until the floats are dry.
 */
function planePilot({ path, speed, takeoff = null, lookahead = 28 }) {
  return `(() => {
    const P = ${JSON.stringify(path)};
    const N = P.length;
    const TO = ${JSON.stringify(takeoff)};
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    let k = 0;
    let phase = TO ? 'settle' : 'fly';
    let onStep = false;
    let dryMs = 0;
    let settle = 0;
    let lastT = performance.now();
    let traceAt = 0;
    window.__pilot = true;
    window.__pilotLog = [];
    window.__pilotTrace = [];
    const step = () => {
      if (!window.__pilot) { window.__stick(); return; }
      const c = window.__craftState();
      const now = performance.now();
      const dt = now - lastT;
      lastT = now;
      if (!c || c.mode !== 'flight' || !c.fwd || !c.up) { requestAnimationFrame(step); return; }
      const pitch = Math.asin(cl(c.fwd.y, -1, 1));
      const right = { x: c.fwd.y * c.up.z - c.fwd.z * c.up.y, y: c.fwd.z * c.up.x - c.fwd.x * c.up.z, z: c.fwd.x * c.up.y - c.fwd.y * c.up.x };
      const bank = Math.asin(cl(-right.y, -1, 1));
      const p = c.rates ? c.rates.p : 0;
      const q = c.rates ? c.rates.q : 0;
      const hold = (rad) => cl(3 * (rad - pitch) + 0.3 * q, -1, 1);
      const bankTo = (rad) => cl(2.5 * (rad - bank) - 0.15 * p, -1, 1);
      /* The nearest path point at or after the last one, searched a
       * little way ahead only, so the lap is flown in order. */
      const pos = [c.worldX, c.worldY, c.worldZ];
      let best = k;
      let bestD = Infinity;
      for (let j = k; j < Math.min(N, k + 60); j += 1) {
        const d = Math.hypot(P[j][0] - pos[0], P[j][2] - pos[2]);
        if (d < bestD) { bestD = d; best = j; }
      }
      k = best;
      let a = k;
      while (a < N - 1 && Math.hypot(P[a][0] - pos[0], P[a][2] - pos[2]) < ${lookahead}) { a += 1; }
      const aim = P[a];
      const v = c.vel || { x: 0, y: 0, z: 0 };
      const vh = Math.hypot(v.x, v.z) || 1;
      const dx = aim[0] - pos[0];
      const dz = aim[2] - pos[2];
      const dl = Math.hypot(dx, dz) || 1;
      /* eta: from the velocity to the aim point, positive to the right. */
      const sinEta = (v.x * dz - v.z * dx) / (vh * dl);
      const cosEta = (v.x * dx + v.z * dz) / (vh * dl);
      const eta = Math.atan2(sinEta, cosEta);
      const acc = 2 * vh * vh * Math.sin(cl(eta, -Math.PI / 2, Math.PI / 2)) / Math.max(dl, 5);
      const bankT = cl(Math.atan(acc / 9.81), -0.9, 0.9);
      /* Height on the pitch hold: a nose a little up for level flight, a
       * pitch per metre of height error, less per metre a second of climb,
       * and more in a bank for the lift the bank takes. */
      const hT = P[k][1];
      const pitchT = cl(0.03 + 0.05 * (hT - pos[1]) - 0.08 * v.y + 0.12 * Math.abs(bank), -0.3, 0.35);
      const thr = cl(0.55 + 0.12 * (${speed} - c.speed) + 0.06 * (hT - pos[1]) + 0.25 * Math.abs(bank), 0.1, 1);
      let s = [bankTo(bankT), hold(pitchT), 0, thr];
      const simT = window.__crash().simT;
      if (simT - traceAt > 0.5) {
        traceAt = simT;
        window.__pilotTrace.push([+simT.toFixed(1), +pos[0].toFixed(1), +pos[1].toFixed(1), +pos[2].toFixed(1), +c.speed.toFixed(1), k, phase, window.__race().next,
          +(bank * 57.3).toFixed(0), +(bankT * 57.3).toFixed(0), +(pitch * 57.3).toFixed(0), +(window.__heightAt(pos[0], pos[2])).toFixed(1)]);
      }
      if (phase === 'settle') {
        s = [0, 0, 0, 0];
        settle += 1;
        if (settle > 30) { phase = 'takeoff'; }
      } else if (phase === 'takeoff') {
        const f = c.floats ? c.floats.state : null;
        const wet = f ? f[4] + f[5] > 0 : false;
        if (!onStep && f && f[0] < 0.25 * TO.weight && c.speed > 2) { onStep = true; }
        const rotate = c.speed > TO.rotate;
        /* On the water the water rudders steer, on the yaw stick. */
        s = [bankTo(0), !onStep || rotate ? 1 : hold(4 * Math.PI / 180), cl(2 * eta, -1, 1), 1];
        if (!wet) { dryMs += dt; } else { dryMs = 0; }
        if (dryMs > 300) { phase = 'fly'; window.__pilotLog.push({ airborne: true, speed: c.speed, at: k }); }
      }
      window.__pilotAt = k;
      window.__pilotPhase = phase;
      window.__stick(s[0], s[1], s[2], s[3]);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`;
}

/*
 * The ring the Skyhunter's gates hang on, as the path round it: each gate
 * stands on the circle flown along it, so the circle is the racing line,
 * from `before` metres before the start gate round the whole lap and
 * `after` past it. Sampled at a metre.
 */
function ringPath([cx, cy, cz], R, { before = 8, after = 30 } = {}) {
  const pts = [];
  const a0 = -before / R;
  const a1 = 2 * Math.PI + after / R;
  for (let a = a0; a <= a1; a += 1 / R) {
    pts.push([cx + R * Math.cos(a), cy, cz + R * Math.sin(a)]);
  }
  return pts;
}

/*
 * The floatplane's lap as a stadium on the lake, in its along and across
 * metres (`at(along, across, y)`): the first straight up the lake through
 * the start gate at `d0` on the water and the second gate at `d1`, a half
 * circle over to `side` across, the second straight back down through the
 * pylon pair at `pylon`, and a half circle back onto the first straight
 * `runIn` metres before the start gate, then through it and `out` past.
 * Low (`lo`) through the start gate, climbing to `hi` for the gates hung
 * over the lake, halfway back down (`mid`) once past the pylons, and down
 * to `lo` on the run in, `flat` metres of it level. Sampled at about a
 * metre.
 */
function stadiumPath(at, {
  d0, d1, side, pylon, lo, hi, before = 8, runIn = 140, out = 20, flat = 30,
}) {
  const mid = (lo + hi) / 2;
  const r = Math.abs(side) / 2;
  const sgn = Math.sign(side);
  const aEnd = d1 + out;
  const bEnd = d0 - runIn;
  const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));
  const pts = [];
  for (let f = d0 - before; f < aEnd; f += 1) {
    pts.push(at(f, 0, f < d0 + flat ? lo : lerp(lo, hi, (f - d0 - flat) / (d1 - 60 - d0 - flat))));
  }
  for (let a = 0; a < Math.PI; a += 1 / r) {
    pts.push(at(aEnd + r * Math.sin(a), side / 2 - sgn * r * Math.cos(a), hi));
  }
  for (let f = aEnd; f > bEnd; f -= 1) {
    pts.push(at(f, side, f > pylon - out ? hi : lerp(hi, mid, (pylon - out - f) / (pylon - out - bEnd))));
  }
  for (let a = 0; a < Math.PI; a += 1 / r) {
    pts.push(at(bEnd - r * Math.sin(a), side / 2 + sgn * r * Math.cos(a), mid));
  }
  for (let f = bEnd; f <= d0 + out; f += 1) {
    pts.push(at(f, 0, lerp(mid, lo, (f - bEnd) / (runIn - flat))));
  }
  return pts;
}

async function flyPlane(page, pilot, limitS = 240) {
  await page.evaluate(pilot);
  await page.evaluate('window.__drawOff(true)');
  const t0 = (await page.evaluate('window.__crash()')).simT;
  /* Until the lap closes, the aircraft is down (wrecked, or stopped once
   * it had flown), or the plant's clock runs out. */
  await page.until(`window.__race().laps.length >= 1 || window.__craftState().crashed
    || (window.__pilotPhase === 'fly' && window.__craftState().speed < 0.5 && window.__crash().simT - ${t0} > 10)
    || window.__crash().simT - ${t0} > ${limitS}`, 1800000).catch(() => {});
  await page.evaluate('window.__drawOff(false)');
  const r = await page.evaluate('({ laps: window.__race().laps.slice(), best: window.__race().bestLapMs(), splits: window.__race().lastSplits.slice(), c: window.__craftState(), at: window.__pilotAt, phase: window.__pilotPhase, log: window.__pilotLog, next: window.__race().next, trace: window.__pilotTrace })');
  if (!r.laps.length) {
    await writeFile(join(outDir, `trace-${Date.now().toString(36)}.json`), JSON.stringify(r.trace));
    console.log('  the flight, every half second: [simT, x, y, z, speed, path point, phase, next gate, bank, bank wanted, pitch, ground]');
    for (const row of r.trace.filter((_, i) => i % 4 === 0)) {
      console.log(`    ${JSON.stringify(row)}`);
    }
  }
  return r;
}

/*
 * The quad pilot of scripts/map-share-check.js, in angle mode with the
 * heading held: tilted toward the velocity it wants, the height held on
 * the throttle, steering for a point 7 m before each gate, its centre, and
 * a point 5 m past it.
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
      const vmax = last ? 0 : 8;
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
  await page.evaluate('window.__drawOff(true)');
  const t0 = (await page.evaluate('window.__crash()')).simT;
  await page.until(`window.__race().laps.length >= 1 || window.__crash().simT - ${t0} > 240`, 1800000).catch(() => {});
  await page.evaluate('window.__drawOff(false)');
  return page.evaluate('({ laps: window.__race().laps.slice(), best: window.__race().bestLapMs(), c: window.__craftState() })');
}

async function stopPilot(page) {
  await page.evaluate('window.__pilot = false');
  await page.sleep(200);
}

/* Upload the lap as the results row does, and wait for the board to hold
 * a time on `board` ('plane' or 'quad') that it did not hold before. */
async function upload(page, id, board, before) {
  await page.evaluate(`(() => {
    window.__banners = [];
    window.__bannerWatch = setInterval(() => {
      const b = window.__craftState().banner;
      if (b && !window.__banners.includes(b)) { window.__banners.push(b); }
    }, 50);
    window.__ui.onAction('posttime');
    return true;
  })()`);
  let row = null;
  for (let k = 0; k < 90 && !row; k += 1) {
    const sheet = await boardJson(`/api/tracks/${id}`);
    row = (sheet.times || []).find((t) => !before.includes(t.id) && (board === 'plane' ? Boolean(t.craft) : !t.craft)) || null;
    if (!row) {
      await page.sleep(500);
    }
  }
  await page.evaluate('clearInterval(window.__bannerWatch), true');
  if (!row) {
    console.log(`  what the pilot was told: ${JSON.stringify(await page.evaluate('window.__banners'))}`);
  }
  return row;
}

/* Choose track `id` from My tracks with the seated aircraft, and wait
 * for its course on `map`. Returns the board's tracks My tracks listed. */
async function seatFromMyTracks(page, id, map, gateCount) {
  await page.evaluate("window.__ui.act('courses'); true");
  await page.until(`(window.__ui.boardCourses || []).some((t) => t.id === ${JSON.stringify(id)})`, 60000).catch(() => {});
  const listed = await page.evaluate('(window.__ui.boardCourses || []).map((t) => ({ id: t.id, map: t.map, planes: t.planes }))');
  await page.evaluate(`window.__ui.openBoardCourse(${JSON.stringify(id)}, () => window.__ui.play()); true`);
  await page.until(`window.__map().ready && window.__map().id === ${JSON.stringify(map)} && window.__map().mode === 'race' && window.__race().gates.length === ${gateCount}`, 400000).catch(() => {});
  return listed;
}

async function reloadOn(page, url) {
  await page.cdp.send('Page.navigate', { url: `${page.origin}${url}` }, page.sessionId);
  await page.sleep(1000);
  await shellUp(page);
}

const url = (q) => `/index.html?${q}&board=${encodeURIComponent(BOARD)}`;

async function skyhunter() {
  const sky = airframeById('sky1800');
  const page = await openPage({ root, width: 1280, height: 720, url: url('map=swiss2'), seed: seed(sky.id) });
  try {
    /* 1. Build and publish. */
    console.log(`the ${sky.name}: build a ring of plane sized gates on swiss2`);
    await shellUp(page);
    await page.until('window.__map().id === "swiss2"', 300000);
    await page.until('!!window.__build', 60000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 120000);
    await page.sleep(600);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 20000);
    await takeMouse(page);
    say((await page.evaluate(B('.line.craft'))) === sky.id, `the builder works the line out for the seated ${sky.short}`);
    const here = await page.evaluate('window.__craftState()');
    const R = 90;
    const cx = here.worldX;
    const cz = here.worldZ - 120;
    const ground = await page.evaluate(`(() => {
      let m = -Infinity;
      for (let a = 0; a < 96; a += 1) {
        for (const r of [0, 20, 40, 60, 80, 100, 120]) {
          m = Math.max(m, window.__heightAt(${cx} + r * Math.cos(a / 96 * 2 * Math.PI), ${cz} + r * Math.sin(a / 96 * 2 * Math.PI)));
        }
      }
      return m;
    })()`);
    const cy = ground + 45;
    for (let i = 0; i < WIDE.length; i += 1) {
      const a = (i / WIDE.length) * Math.PI * 2;
      await place(page, WIDE[i], [cx + R * Math.cos(a), cy, cz + R * Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)]);
    }
    const doc0 = await page.evaluate(B('.doc'));
    say(doc0.elements.map((e) => e.type).join() === WIDE.join(), `three gates hung ${f1(cy - ground)} m over the ground: ${doc0.elements.map((e) => e.type).join(', ')}`);
    const warnings = await page.evaluate(B('.warnings'));
    say(warnings.length === 0, `no geometry warning for the ${sky.short}${warnings.length ? `: ${JSON.stringify(warnings)}` : ''}`);
    await shot(page, '1-plane-ring-built');
    const name = `Wide ring ${Date.now().toString(36)}`;
    const hud = await publish(page, name);
    say(/Published "/.test(hud), `P publishes it: ${JSON.stringify(hud)}`);
    const id = await page.evaluate(B('.doc.id'));
    const row = (await boardJson('/api/tracks')).tracks.find((t) => t.id === id);
    say(Boolean(row) && row.map === 'swiss2' && row.planes.includes(sky.id) && row.planes.includes('bramor2300'),
      `the board lists it on swiss2 for ${row ? row.planes.length : 0} planes: ${row ? row.planes.join(', ') : 'nothing'}`);
    const seatKey = 'webfpv.share.import.wing.v1';
    const seatWas = await page.evaluate(`(JSON.parse(localStorage.getItem(${JSON.stringify(seatKey)}) || 'null') || {}).id || null`);
    say(seatWas === id, `publishing seated it in the plane's seat, ${seatKey}`);
    await leave(page);
    await page.until(`${B('.state')} === 'off'`, 10000);

    /* A map track of five inch gates on the same world, straight onto the
     * board: the Skyhunter does not fit it, so its list leaves it out. */
    const narrow = mapTrackDocument({ map: 'swiss2', centre: [cx, cy, cz], radius: 40, name: `Five inch ring ${Date.now().toString(36)}` });
    const narrowPub = await boardJson('/api/tracks', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author: PILOT, document: narrow }),
    });

    /* 2. Reload, find it, load it. */
    console.log('reload, and find it in My tracks');
    await page.evaluate(`localStorage.removeItem(${JSON.stringify(seatKey)}), true`);
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await shellUp(page);
    const listed = await seatFromMyTracks(page, id, 'swiss2', 3);
    const card = listed.find((t) => t.id === id);
    say(Boolean(card), `My tracks lists it for the ${sky.short}`);
    say(!listed.some((t) => t.id === narrowPub.id), `and not ${narrowPub.id}, a map track of five inch gates it does not fit`);
    await shot(page, '2-plane-my-tracks');
    const seated = await page.evaluate('({ map: window.__map(), key: window.__race().key, build: window.__build.state().state, seat: (JSON.parse(localStorage.getItem("webfpv.share.import.wing.v1") || "null") || {}).id })');
    say(seated.map.id === 'swiss2' && seated.map.mode === 'race' && seated.map.gates === 3 && seated.build === 'racing',
      `choosing it seats the course on ${seated.map.id}: a race over ${seated.map.gates} gates`);
    say(seated.seat === id && seated.key.includes(`.${sky.id}`) && seated.key.endsWith(`.map.${id}`), `in the plane's seat, with the ${sky.short}'s record of its own`);
    const gates = await page.evaluate(B('.gates'));

    /* 3. Fly a lap. */
    console.log('fly a lap of it on the sticks');
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 60000);
    await page.until(`(() => { const c = window.__craftState(); const g = ${JSON.stringify(gates[0].centre)}; return Math.hypot(c.worldX - g[0], c.worldY - g[1], c.worldZ - g[2]) < 10; })()`, 60000).catch(() => {});
    const c0 = await page.evaluate('window.__craftState()');
    const before = Math.hypot(c0.worldX - gates[0].centre[0], c0.worldY - gates[0].centre[1], c0.worldZ - gates[0].centre[2]);
    say(Math.abs(before - 7.5) < 1.5, `the run starts in the air, ${f1(before)} m before the start gate, ${f1(c0.speed)} m/s along its nose`);
    const ring = [cx, cy, cz];
    const pilot = planePilot({ path: ringPath(ring, R), speed: 16 });
    const lap = await flyPlane(page, pilot);
    await stopPilot(page);
    say(lap.laps.length >= 1 && lap.best != null, `a lap flown on the sticks through all three: ${lap.best != null ? (lap.best / 1000).toFixed(2) : 'none'} s, splits ${lap.splits.map((s) => (s / 1000).toFixed(2)).join(', ')}`);
    if (!lap.laps.length) {
      console.log(`  the pilot reached path point ${lap.at} in ${lap.phase}, next gate ${lap.next}, craft at ${f1(lap.c.worldX)}, ${f1(lap.c.worldY)}, ${f1(lap.c.worldZ)}, ${f1(lap.c.speed)} m/s, crashed ${lap.c.crashed}`);
      await shot(page, '3-plane-lap-failed');
      return null;
    }
    const g1 = await page.evaluate('window.__ghost()');
    say(g1.bestMs != null && Math.round(g1.bestMs) === Math.round(lap.best), `its ghost is recorded: ${g1.bestMs != null ? Math.round(g1.bestMs) : 'none'} ms`);
    await shot(page, '3-plane-lap-flown');

    /* 4. Upload. */
    console.log('upload the time with its ghost');
    const posted = await upload(page, id, 'plane', []);
    say(Boolean(posted) && posted.name === PILOT && posted.lapMs === Math.round(lap.best) && posted.hasGhost && posted.craft === sky.id,
      `the board checked it and keeps it on the plane board: ${posted ? JSON.stringify({ name: posted.name, lapMs: posted.lapMs, craft: posted.craft }) : 'nothing'}`);
    if (!posted) {
      const served = await boardJson(`/api/tracks/${id}/document`);
      const b64 = await page.evaluate("window.__ghostExport('best')");
      const local = b64 ? checkLap(served.document || served, new Uint8Array(Buffer.from(b64, 'base64')), Math.round(lap.best), sky.id) : null;
      console.log(`  the lap check run here on the same ghost: ${JSON.stringify(local)}`);
      return null;
    }
    const listedNow = (await boardJson('/api/tracks')).tracks.find((t) => t.id === id);
    say(listedNow.times === 0 && listedNow.wing.times === 1 && listedNow.wing.best.lapMs === posted.lapMs,
      `the listing counts it on the plane board and not the quads': ${JSON.stringify({ times: listedNow.times, wing: listedNow.wing })}`);

    /* 5. The chase link. */
    console.log('reload on the chase link, and chase the plane\'s ghost');
    await page.evaluate("localStorage.removeItem('webfpv.share.import.wing.v1'), true");
    await reloadOn(page, url(`map=custom&share=${id}&ghost=${posted.id}&craft=${sky.id}`));
    await page.until(`window.__map().ready && window.__map().mode === 'race' && window.__race().gates.length === 3 && window.__ghost().choice === ${JSON.stringify(`board:${posted.id}`)}`, 400000).catch(() => {});
    const chase0 = await page.evaluate('({ map: window.__map(), g: window.__ghost(), key: window.__race().key, af: window.__ui.settings.airframe })');
    say(chase0.af === sky.id && chase0.map.id === 'swiss2' && chase0.map.gates === 3 && chase0.key.endsWith(`.map.${id}`),
      `the link seats the ${chase0.af} on the same course on ${chase0.map.id}`);
    say(chase0.g.choice === `board:${posted.id}` && chase0.g.boardTimes === 1, `and arms the board's plane lap to chase, the only one on its board: ${chase0.g.choice}`);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 60000);
    await page.sleep(1600);
    await page.evaluate(`(() => {
      window.__chaseSeen = { armed: false, visible: false, gap: null, armedMs: null };
      window.__watch = true;
      const look = () => {
        const g = window.__ghost();
        if (g.armed) { window.__chaseSeen.armed = true; window.__chaseSeen.armedMs = g.armedMs; }
        if (g.visible && window.__race().lapStartMs != null) { window.__chaseSeen.visible = true; }
        if (g.gapMs != null) { window.__chaseSeen.gap = g.gapMs; }
        if (window.__watch) { requestAnimationFrame(look); }
      };
      requestAnimationFrame(look);
      return true;
    })()`);
    const lap2 = await flyPlane(page, planePilot({ path: ringPath(ring, R), speed: 16 }));
    await stopPilot(page);
    await page.evaluate('window.__watch = false');
    const seen = await page.evaluate('window.__chaseSeen');
    say(seen.armed && Math.round(seen.armedMs) === posted.lapMs, `the plane's lap is armed at the start line: ${seen.armedMs != null ? Math.round(seen.armedMs) : 'none'} ms`);
    say(seen.visible, 'the ghost flies in the scene while the lap runs');
    say(seen.gap != null, `and the gap to it is read at the gates: ${seen.gap != null ? (seen.gap / 1000).toFixed(2) : 'none'} s`);
    say(lap2.laps.length >= 1, `the chase lap closes too: ${lap2.best != null ? (lap2.best / 1000).toFixed(2) : 'none'} s`);
    await shot(page, '5-plane-chased');

    /* 6. The racer, the interceptor, on the same track. */
    console.log('the interceptor on the same track');
    /* The page's seed seats the Skyhunter on every new document, so the
     * interceptor is seeded after it, and the quads' seat emptied as if the
     * pilot had flown something else since. */
    await page.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: seed('interceptor')[0] }, page.sessionId);
    await page.evaluate("localStorage.removeItem('webfpv.share.import.v1'), true");
    await reloadOn(page, url('map=swiss2'));
    const quadListed = await seatFromMyTracks(page, id, 'swiss2', 3);
    say(quadListed.some((t) => t.id === id) && quadListed.some((t) => t.id === narrowPub.id), 'My tracks, the interceptor seated, lists it, and the quad gate ring beside it');
    const quadSeat = await page.evaluate('({ af: window.__ui.settings.airframe, key: window.__race().key, seat: (JSON.parse(localStorage.getItem("webfpv.share.import.v1") || "null") || {}).id, g: window.__ghost() })');
    say(quadSeat.af === 'interceptor' && quadSeat.seat === id && quadSeat.key.endsWith(`.map.${id}`), 'seated in the quads\' seat');
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 60000);
    await page.until(`(() => { const c = window.__craftState(); const g = ${JSON.stringify(gates[0].centre)}; return Math.hypot(c.worldX - g[0], c.worldY - g[1], c.worldZ - g[2]) < 10; })()`, 60000).catch(() => {});
    const qg = await page.evaluate('window.__ghost()');
    say(qg.boardTimes === 0, `its ghost picker offers no plane lap: ${qg.boardTimes} board laps on the quads' board`);
    const qlap = await flyQuad(page, gates);
    await stopPilot(page);
    say(qlap.laps.length >= 1, `a quad lap: ${qlap.best != null ? (qlap.best / 1000).toFixed(2) : 'none'} s`);
    if (qlap.laps.length) {
      const qposted = await upload(page, id, 'quad', [posted.id]);
      say(Boolean(qposted) && !qposted.craft && qposted.lapMs === Math.round(qlap.best), `and it goes on the quads' board: ${qposted ? JSON.stringify({ lapMs: qposted.lapMs, craft: qposted.craft }) : 'nothing'}`);
      const both = (await boardJson('/api/tracks')).tracks.find((t) => t.id === id);
      say(both.times === 1 && both.best.lapMs === Math.round(qlap.best) && both.wing.times === 1 && both.wing.best.lapMs === posted.lapMs,
        `each board holds its own record: quads ${both.best ? both.best.lapMs : '-'} ms, planes ${both.wing.best ? both.wing.best.lapMs : '-'} ms`);
    }
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
    return id;
  } finally {
    await page.close();
  }
}

async function floats() {
  const tf = airframeById('timber1500f');
  const page = await openPage({ root, width: 1280, height: 720, url: url('map=alps'), seed: seed(tf.id) });
  try {
    console.log(`\nthe ${tf.name} on the Alps' lake`);
    await shellUp(page);
    await page.until('window.__map().id === "alps"', 300000);
    await page.until('!!window.__build', 60000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 120000);
    await page.sleep(600);
    const water = (await page.evaluate('window.__crashWater()'))[0];
    say(Boolean(water), `the Alps have a lake, its surface at ${water ? f1(water.surfaceY) : '?'} m`);
    await key(page, 'KeyB');
    await page.until(`${B('.state')} === 'building'`, 20000);
    await takeMouse(page);
    /*
     * The lake measured along its own spawn's heading, which is up the lake:
     * how far the water runs ahead and behind, and how wide it is either
     * side. The map answers the water's surface for its height over the
     * lake, so water is wherever the height is the surface.
     */
    const yaw = water.spawn.yaw;
    const F = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const Rt = [-F[2], 0, F[0]];
    const S = water.surfaceY;
    const at = (fwd, side, y) => [water.spawn.x + F[0] * fwd + Rt[0] * side, y, water.spawn.z + F[2] * fwd + Rt[2] * side];
    const reach = async (fwd, side, dir) => page.evaluate(`(() => {
      const wet = (x, z) => window.__heightAt(x, z) <= ${S} + 0.01;
      let d = 0;
      while (d < 2000) {
        const x = ${water.spawn.x} + ${F[0]} * (${fwd} + ${dir[0]} * d) + ${Rt[0]} * (${side} + ${dir[1]} * d);
        const z = ${water.spawn.z} + ${F[2]} * (${fwd} + ${dir[0]} * d) + ${Rt[2]} * (${side} + ${dir[1]} * d);
        if (!wet(x, z)) { return d; }
        d += 2;
      }
      return d;
    })()`);
    const ahead = await reach(0, 0, [1, 0]);
    const astern = await reach(0, 0, [-1, 0]);
    const mid = (ahead - astern) / 2;
    const left = await reach(mid, 0, [0, -1]);
    const rightW = await reach(mid, 0, [0, 1]);
    console.log(`  the lake along its spawn's heading: ${ahead} m ahead, ${astern} m behind; ${left} m to the left and ${rightW} m to the right at its middle`);
    /*
     * A stadium inside it. The start gate stands on the water two fifths
     * of the way up, so the start behind it is on the lake with room to
     * take off ahead; the second gate hangs 15 m up near the far end, the
     * pylon pair 15 m up on the way back down the side with more water,
     * and the lap comes round behind the start gate and back through it
     * low.
     */
    const d0 = -astern + (ahead + astern) * 0.4;
    const d1 = ahead - 100;
    const side = (rightW >= left ? 1 : -1) * Math.min(90, Math.max(rightW, left) - 45);
    console.log(`  gates at ${f1(d0)} m (on the water), ${f1(d1)} m (hung), and ${f1((d0 + d1) / 2)} m ${f1(side)} m across (hung)`);
    await place(page, 'wideGate5', at(d0, 0, S), F, {
      back: 18, up: 12, pitch: -Math.atan2(12, 18), air: false,
    });
    const afterStart = await page.evaluate(B('.gates'));
    const onWater = afterStart[0] && Math.abs(afterStart[0].centre[1] - (S + 2.5)) < 0.3;
    say(onWater, `the start gate stands on the lake: its opening's centre ${afterStart[0] ? f1(afterStart[0].centre[1] - S) : '?'} m over the water`);
    await place(page, 'wideGate5', at(d1, 0, S + 15), F);
    await place(page, 'pylonPair', at((d0 + d1) / 2, side, S + 15), [-F[0], 0, -F[2]]);
    const doc0 = await page.evaluate(B('.doc'));
    const warnings = await page.evaluate(B('.warnings'));
    say(doc0.elements.length === 3, `three gates: ${doc0.elements.map((e) => e.type).join(', ')}`);
    say(!warnings.some((w) => w.code === 'small' || w.code === 'blocked'), `none too small for the ${tf.short} or buried${warnings.length ? `; the rest: ${warnings.map((w) => w.code).join(', ')}` : ''}`);
    /* A page of its own is a browser of its own, with a pilot key of its
     * own, and the board files a name under the first key that posts it. */
    const name = `Lake loop ${Date.now().toString(36)}`;
    const hud = await publish(page, name, `${PILOT} lake`);
    say(/Published "/.test(hud), `P publishes it: ${JSON.stringify(hud)}`);
    const id = await page.evaluate(B('.doc.id'));
    const row = (await boardJson('/api/tracks')).tracks.find((t) => t.id === id);
    say(Boolean(row) && row.map === 'alps' && row.planes.includes(tf.id), `the board lists it on the Alps for the ${tf.short} among ${row ? row.planes.length : 0} planes`);
    await leave(page);
    await page.until(`${B('.state')} === 'off'`, 10000);
    await page.evaluate("localStorage.removeItem('webfpv.share.import.wing.v1'), true");
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await shellUp(page);
    await seatFromMyTracks(page, id, 'alps', 3);
    const gates = await page.evaluate(B('.gates'));
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 60000);
    await page.sleep(2500);
    const c0 = await page.evaluate('window.__craftState()');
    const behind = Math.hypot(c0.worldX - gates[0].centre[0], c0.worldZ - gates[0].centre[2]);
    say(c0.floats && c0.floats.state[9] >= 0 && Math.abs(c0.worldY - S) < 0.6 && Math.abs(behind - 7.5) < 1.5,
      `the run starts afloat on the lake ${f1(behind)} m behind the start gate, not at the lake's own spawn: CG ${f1(c0.worldY - S)} m over the water`);
    await shot(page, '7-floats-start');
    /* Half flaps, the manual's take off setting: F once. */
    await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', key: 'f' })); true");
    const path = stadiumPath(at, {
      d0, d1, side, pylon: (d0 + d1) / 2, lo: S + 2.5, hi: S + 15, runIn: 170, flat: 70,
    });
    const pilot = planePilot({
      path, speed: 15, takeoff: { weight: 1.934 * 9.81, rotate: 7.5 },
    });
    const lap = await flyPlane(page, pilot, 300);
    await stopPilot(page);
    say(Boolean(lap.log && lap.log.some((e) => e.airborne)), `off the water${lap.log && lap.log.find((e) => e.airborne) ? ` at ${f1(lap.log.find((e) => e.airborne).speed)} m/s` : ''}`);
    say(lap.laps.length >= 1, `a lap from the water through all three and back low over the lake: ${lap.best != null ? (lap.best / 1000).toFixed(2) : 'none'} s`);
    if (!lap.laps.length) {
      console.log(`  the pilot reached path point ${lap.at} of ${path.length} in ${lap.phase}, next gate ${lap.next}, craft at ${f1(lap.c.worldX)}, ${f1(lap.c.worldY - S)} over the water, ${f1(lap.c.worldZ)}, ${f1(lap.c.speed)} m/s, crashed ${lap.c.crashed}`);
      await shot(page, '7-floats-lap-failed');
      return;
    }
    await shot(page, '7-floats-lap-flown');
    const posted = await upload(page, id, 'plane', []);
    say(Boolean(posted) && posted.craft === tf.id && posted.lapMs === Math.round(lap.best), `and it goes on the plane board: ${posted ? JSON.stringify({ lapMs: posted.lapMs, craft: posted.craft }) : 'nothing'}`);
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const health = await fetch(`${BOARD}/api/health`).then((r) => r.ok).catch(() => false);
  say(health, `a board answers at ${BOARD}`);
  if (!health) {
    return;
  }
  if (!opts['skip-sky']) {
    await skyhunter();
  }
  if (!opts['skip-floats']) {
    await floats();
  }
}

await main();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
