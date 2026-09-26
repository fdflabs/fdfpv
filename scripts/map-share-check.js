/*
 * map-share-check.js: a track built inside a world, from the builder to the
 * board and back, through the real page.
 *
 *     BOARD_ORIGIN=http://127.0.0.1:3180 node scripts/map-share-check.js [OUT_DIR] [--map=swiss2]
 *
 * Needs a board to talk to: a throwaway one from a checkout of
 * fdfpv-leaderboard that accepts schemaVersion 4, started with
 * BOARD_FILE=<scratch>/board.json PORT=3180 node src/server.js. Without one
 * it fails rather than passes. Never point it at the live board: it
 * publishes a track and posts a time.
 *
 * In the order a pilot would do it:
 *
 *   1. Fly the map, press B, and hang three gates in a ring in the air with
 *      the builder's own keys (3 for the air snap, Enter to place), each
 *      flown along the ring, with no geometry warning on the track.
 *   2. P publishes it through the shell's publish dialog: the name and the
 *      pilot's board name typed in, and the board holds a schemaVersion 4
 *      document naming the map, with three gates.
 *   3. Reload. The Track room lists it among the board's tracks; choosing
 *      it seats the course on the world already built, as a race of three
 *      gates with a record of its own.
 *   4. Fly it: from the air start a pilot in the page flies a lap through
 *      the three gates on the sticks, and the lap closes with a ghost
 *      recorded.
 *   5. Upload the time, as the results screen's row does: the board checks
 *      the lap against the track with the simulator's own detector and
 *      keeps it with its ghost.
 *   6. Reload on the board's chase link (?share=&ghost=): the same course
 *      is seated, the board's ghost is fetched and armed, and flying the
 *      lap again chases it, with the ghost in the scene and a gap read at
 *      the gates.
 *
 * Pictures land in OUT_DIR (tmp/map-share-check by default). They are
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
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { checkLap } from '../src/game/verify.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const opts = { map: 'swiss2' };
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)(?:=(.*))?$/);
  if (m) {
    opts[m[1]] = m[2] === undefined ? true : m[2];
  } else {
    positional.push(a);
  }
}
const outDir = resolve(positional[0] || join(root, 'tmp', 'map-share-check'));
await mkdir(outDir, { recursive: true });
const BOARD = String(process.env.BOARD_ORIGIN || 'http://127.0.0.1:3180').replace(/\/+$/, '');
/* A fresh name each run: the board files a name under the first pilot key
 * that posts it, and every run of this is a new browser with a new key. */
const PILOT = `Map ${Date.now().toString(36)}`;

let failed = 0;
function say(ok, what) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) {
    failed += 1;
  }
}
const f1 = (x) => Number(x).toFixed(1);

/* The five inch in angle mode, so a stick is an attitude and the pilot in
 * the page can fly a line; no gamepads, so a radio left plugged into the
 * host does not drive the free camera. */
function seed() {
  const seated = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '5inch');
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

async function boardJson(path) {
  const res = await fetch(`${BOARD}${path}`);
  if (!res.ok) {
    throw new Error(`${path}: ${res.status}`);
  }
  return res.json();
}

const B = (expr) => `window.__build.state()${expr}`;

async function settleCrosshair(page) {
  await page.until(`(() => {
    const s = window.__build.state();
    if (!s.hitRay.exact) { return false; }
    const o = s.hitRay.origin;
    const c = s.camera.pos;
    const d = s.hitRay.dir;
    const f = s.camera.forward;
    return Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 1e-6 && Math.hypot(d[0] - f[0], d[1] - f[1], d[2] - f[2]) < 1e-6;
  })()`, 20000);
  await page.sleep(150);
}

async function shellUp(page) {
  await page.until('!!window.__shellReady', 240000);
  await page.until('window.__map && window.__map().ready', 300000);
}

/*
 * THE PILOT IN THE PAGE. Angle mode, heading held: the craft is flown by
 * translation alone, tilted toward the velocity it wants on the pitch and
 * roll sticks, the height held on the throttle. It steers for a point 7 m
 * before each gate on its line of travel, then the gate's centre until the
 * craft is through its plane, then a point 5 m past it, round the ring and
 * back through the start gate, and then holds a hover past the line.
 * `gates` are the builder's own, in flying order, from the start gate.
 */
async function flyLap(page, gates) {
  await page.evaluate(`(() => {
    const G = ${JSON.stringify(gates)};
    const pts = [];
    /* A 'through' point is aimed 3 m past the opening along its travel, so
     * the craft crosses the plane at speed on the gate's own line, and is
     * passed when the craft is through the plane. */
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
    window.__pilotAt = 0;
    window.__pilotLog = [];
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
        if (past) {
          if (w.kind === 'through') {
            const d = pos.map((v, j) => v - w.g.centre[j]);
            const up = w.g.up;
            const ac = [w.g.travel[2] * up[1] - w.g.travel[1] * up[2], w.g.travel[0] * up[2] - w.g.travel[2] * up[0], w.g.travel[1] * up[0] - w.g.travel[0] * up[1]];
            const r = window.__race();
            window.__pilotLog.push({ at: i, across: +(d[0] * ac[0] + d[1] * ac[1] + d[2] * ac[2]).toFixed(2), up: +(d[0] * up[0] + d[1] * up[1] + d[2] * up[2]).toFixed(2), next: r.next, lap: r.lapStartMs, speed: +c.speed.toFixed(1), mode: c.mode });
          }
          i += 1;
          window.__pilotAt = i;
        }
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
      /* Height to the gate's centre, not the aim point's: an integral
       * takes out the hover the fixed term does not know. */
      const dy = w.g.centre[1] - pos[1];
      lift = cl(lift + 0.002 * dy, -0.2, 0.2);
      window.__stick(cl(0.09 * right, -0.45, 0.45), cl(-0.09 * along, -0.45, 0.45), 0, cl(0.37 + lift + 0.12 * dy - 0.1 * v.y, 0.1, 0.9));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  })()`);
  /* On the plant's clock: drawing is off while it flies, so a frame is the
   * plant's step and not the software rasteriser's second, and the lap
   * takes about as long on the wall as in the air. */
  await page.evaluate('window.__drawOff(true)');
  const t0 = (await page.evaluate('window.__crash()')).simT;
  await page.until(`window.__race().laps.length >= 1 || window.__crash().simT - ${t0} > 120`, 900000).catch(() => {});
  await page.evaluate('window.__drawOff(false)');
  const r = await page.evaluate('({ laps: window.__race().laps.slice(), best: window.__race().bestLapMs(), splits: window.__race().lastSplits.slice(), c: window.__craftState(), at: window.__pilotAt, log: window.__pilotLog })');
  return r;
}

async function stopPilot(page) {
  await page.evaluate('window.__pilot = false');
  await page.sleep(200);
}

async function main() {
  const health = await fetch(`${BOARD}/api/health`).then((r) => r.ok).catch(() => false);
  say(health, `a board answers at ${BOARD}`);
  if (!health) {
    return;
  }
  const url = (q) => `/index.html?${q}&board=${encodeURIComponent(BOARD)}`;
  const page = await openPage({ root, width: 1280, height: 720, url: url(`map=${opts.map}`), seed: seed() });
  try {
    /* 1. Build. */
    console.log(`build a ring of three gates on ${opts.map}`);
    await shellUp(page);
    await page.until(`window.__map().id === ${JSON.stringify(opts.map)}`, 300000);
    await page.until('!!window.__build', 60000);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 120000);
    await page.sleep(600);
    await page.tap('KeyB');
    await page.until(`${B('.state')} === 'building'`, 20000);
    const here = await page.evaluate('window.__craftState()');
    const R = 30;
    const cx = here.worldX;
    const cz = here.worldZ - 60;
    const ground = await page.evaluate(`(() => {
      let m = -Infinity;
      for (let a = 0; a < 64; a += 1) {
        for (const r of [0, 10, 20, 30, 40]) {
          m = Math.max(m, window.__heightAt(${cx} + r * Math.cos(a / 64 * 2 * Math.PI), ${cz} + r * Math.sin(a / 64 * 2 * Math.PI)));
        }
      }
      return m;
    })()`);
    const cy = ground + 45;
    await page.tap('Digit3');
    say((await page.evaluate(B('.snap'))) === 'air' && (await page.evaluate(B('.airDistance'))) === 20, 'the air snap, 20 m in front of the camera');
    const want = [];
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const P = [cx + R * Math.cos(a), cy, cz + R * Math.sin(a)];
      const T = [-Math.sin(a), 0, Math.cos(a)];
      want.push({ P, T });
      const from = P.map((v, j) => v - T[j] * 20);
      await page.evaluate(`window.__build.look(${from.join(',')}, ${Math.atan2(-T[0], -T[2])}, 0)`);
      await settleCrosshair(page);
      const n0 = await page.evaluate(B('.gates.length'));
      await page.tap('Enter');
      await page.until(`${B('.gates.length')} === ${n0 + 1}`, 10000);
    }
    const built = await page.evaluate(B('.gates'));
    const placedRight = built.length === 3 && built.every((g, i) => Math.hypot(...g.centre.map((v, j) => v - want[i].P[j])) < 0.05
      && Math.hypot(...g.travel.map((v, j) => v - want[i].T[j])) < 1e-3);
    say(placedRight, `three gates hung ${f1(cy - ground)} m over the highest ground under the ring, each flown along it`);
    const warnings = await page.evaluate(B('.warnings'));
    say(warnings.length === 0, `no geometry warnings on the track${warnings.length ? `: ${JSON.stringify(warnings)}` : ''}`);
    await shot(page, '1-ring-built');

    /* 2. Publish. */
    console.log('publish it from build mode');
    const name = `Ring check ${Date.now().toString(36)}`;
    await page.tap('KeyP');
    await page.until("(() => { const d = document.querySelector('.name-dialog-box'); return d && d.offsetParent !== null; })()", 10000);
    const fields = await page.evaluate("[...document.querySelectorAll('.name-dialog-input')].map((f) => f.dataset.key)");
    say(fields.join() === 'course,author', `P opens the shell's publish dialog, asking for ${fields.join(' and ')}`);
    const prefilled = await page.evaluate("document.querySelector('.name-dialog-input').value");
    say(prefilled === (await page.evaluate(B('.doc.name'))), `the name field holds the track's own name, and nothing the P key typed: ${JSON.stringify(prefilled)}`);
    await shot(page, '2-publish-dialog');
    await page.evaluate(`(() => {
      const f = [...document.querySelectorAll('.name-dialog-input')];
      f[0].value = ${JSON.stringify(name)};
      f[1].value = ${JSON.stringify(PILOT)};
      f[1].focus();
      window.__hudSeen = [];
      window.__hudWatch = setInterval(() => {
        const h = window.__build.state().hud;
        if (!window.__hudSeen.includes(h)) { window.__hudSeen.push(h); }
      }, 50);
      return true;
    })()`);
    await page.tap('Enter');
    await page.until(`/Published|Could not publish/.test(${B('.message')})`, 60000).catch(() => {});
    await page.evaluate('clearInterval(window.__hudWatch), true');
    const hud = await page.evaluate(B('.message'));
    const shown = (await page.evaluate('window.__hudSeen')).some((h) => h.includes(hud));
    say(/Published "/.test(hud), `the builder says so: ${JSON.stringify(hud)}${shown ? ', on its panel' : ' (said; this rasteriser drew no frame while it was up)'}`);
    const typed = await page.evaluate(B('.doc.name'));
    say(typed === name, `the builder carries on under the published name: ${JSON.stringify(typed)}`);
    if (!/Published "/.test(hud)) {
      const dlg = await page.evaluate("(() => { const d = document.querySelector('.name-dialog-box'); return d ? { shown: d.offsetParent !== null, err: (d.querySelector('.name-dialog-err') || {}).textContent, values: [...d.querySelectorAll('input')].map((f) => f.value) } : null; })()");
      console.log(`  the dialog: ${JSON.stringify(dlg)}; page errors: ${JSON.stringify(page.errors.slice(-5))}; mode ${await page.evaluate('window.__craftState().mode')}`);
      return;
    }
    const id = await page.evaluate(B('.doc.id'));
    const list = await boardJson('/api/tracks');
    const row = list.tracks.find((t) => t.id === id);
    say(Boolean(row) && row.name === name && row.author === PILOT && row.map === opts.map && row.gates === 3 && row.trackClass === 'full',
      `the board lists ${id}: ${row ? JSON.stringify({ name: row.name, author: row.author, map: row.map, gates: row.gates }) : 'nothing'}`);
    const served = await boardJson(`/api/tracks/${id}/document`);
    const doc = served.document || served;
    say(doc.schemaVersion === 4 && doc.map === opts.map && doc.elements.length === 3 && doc.elements.every((e) => e.orientation),
      `and serves a schemaVersion ${doc.schemaVersion} document on ${doc.map} with every gate's orientation`);
    await page.tap('Escape');
    await page.until(`${B('.state')} === 'off'`, 10000);

    /* 3. Reload, find it, load it. */
    console.log('reload, and find it in the Track room');
    /* Publishing seats the track, as a publish from the Track room does, and
     * the room shows the seated track as its own card rather than twice.
     * The seat is emptied here, as if the pilot had flown something else
     * since, so the track has to be found among the board's. */
    const seatWas = await page.evaluate(`(JSON.parse(localStorage.getItem('webfpv.share.import.v1') || 'null') || {}).id || null`);
    say(seatWas === id, `publishing seated it, as a Track room publish does: ${seatWas}`);
    await page.evaluate("localStorage.removeItem('webfpv.share.import.v1'), true");
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.sleep(1000);
    await shellUp(page);
    await page.evaluate("window.__ui.act('courses'); true");
    await page.until(`(window.__ui.boardCourses || []).some((t) => t.id === ${JSON.stringify(id)})`, 60000).catch(() => {});
    const card = await page.evaluate(`(window.__ui.boardCourses || []).find((t) => t.id === ${JSON.stringify(id)}) || null`);
    say(Boolean(card) && card.map === opts.map, `the Track room lists it among the board's tracks, on ${card ? card.map : '?'}`);
    await shot(page, '3-track-room');
    await page.evaluate(`window.__ui.openBoardCourse(${JSON.stringify(id)}); true`);
    await page.until(`window.__map().ready && window.__map().id === ${JSON.stringify(opts.map)} && window.__map().mode === 'race' && window.__race().gates.length === 3`, 300000).catch(() => {});
    const seated = await page.evaluate('({ map: window.__map(), key: window.__race().key, freestyle: window.__race().freestyle, build: window.__build.state().state })');
    say(seated.map.id === opts.map && seated.map.mode === 'race' && seated.map.gates === 3 && !seated.freestyle,
      `choosing it seats the course on ${seated.map.id}: a race over ${seated.map.gates} gates`);
    say(seated.key.endsWith(`.map.${id}`) && seated.build === 'racing', `with a record of its own (${seated.key.split('.').slice(-2).join('.')}), the builder holding it for the race`);
    const gates = await page.evaluate(B('.gates'));

    /* 4. Fly a lap. */
    console.log('fly a lap of it');
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 60000);
    /* Fly plays the pad shot first; the craft is at its start once it is
     * over, held through the countdown. */
    await page.until(`(() => { const c = window.__craftState(); const g = ${JSON.stringify(gates[0].centre)}; return Math.hypot(c.worldX - g[0], c.worldY - g[1], c.worldZ - g[2]) < 10; })()`, 60000).catch(() => {});
    const c0 = await page.evaluate('window.__craftState()');
    const over = c0.worldY - (await page.evaluate(`window.__heightAt(${c0.worldX}, ${c0.worldZ})`));
    const before = Math.hypot(c0.worldX - gates[0].centre[0], c0.worldY - gates[0].centre[1], c0.worldZ - gates[0].centre[2]);
    say(over > 20 && Math.abs(before - 7.5) < 1, `the run starts in the air, ${f1(before)} m before the start gate and ${f1(over)} m over the ground under it`);
    const lap = await flyLap(page, gates);
    await stopPilot(page);
    say(lap.laps.length >= 1 && lap.best != null, `a lap flown on the sticks through all three gates: ${lap.best != null ? (lap.best / 1000).toFixed(2) : 'none'} s, splits ${lap.splits.map((s) => (s / 1000).toFixed(2)).join(', ')}`);
    if (!lap.laps.length) {
      console.log(`  the pilot reached waypoint ${lap.at}, craft at ${f1(lap.c.worldX)}, ${f1(lap.c.worldY)}, ${f1(lap.c.worldZ)}, crashed ${lap.c.crashed}`);
      console.log(`  at each gate: ${JSON.stringify(lap.log)}`);
    }
    const g1 = await page.evaluate('window.__ghost()');
    say(g1.bestMs != null && Math.round(g1.bestMs) === Math.round(lap.best), `its ghost is recorded: ${g1.bestMs != null ? Math.round(g1.bestMs) : 'none'} ms`);
    await shot(page, '4-lap-flown');

    /* 5. Upload. */
    console.log('upload the time with its ghost');
    await page.evaluate(`(() => {
      window.__banners = [];
      window.__bannerWatch = setInterval(() => {
        const b = window.__craftState().banner;
        if (b && !window.__banners.includes(b)) { window.__banners.push(b); }
      }, 50);
      window.__ui.onAction('posttime');
      return true;
    })()`);
    let times = null;
    for (let k = 0; k < 60; k += 1) {
      times = await boardJson(`/api/tracks/${id}`);
      if (times.times && times.times.length) {
        break;
      }
      await page.sleep(500);
    }
    const posted = times && times.times ? times.times[0] : null;
    say(Boolean(posted) && posted.name === PILOT && posted.lapMs === Math.round(lap.best) && posted.hasGhost === true,
      `the board checked it and keeps it: ${posted ? JSON.stringify({ name: posted.name, lapMs: posted.lapMs, hasGhost: posted.hasGhost }) : 'nothing'}`);
    await page.evaluate('clearInterval(window.__bannerWatch), true');
    if (!posted) {
      console.log(`  what the pilot was told: ${JSON.stringify(await page.evaluate('window.__banners'))}`);
      const b64 = await page.evaluate("window.__ghostExport('best')");
      const local = b64 ? checkLap(doc, new Uint8Array(Buffer.from(b64, 'base64')), Math.round(lap.best)) : null;
      console.log(`  the lap check run here on the same ghost: ${JSON.stringify(local)}`);
      return;
    }
    const ghostBody = await boardJson(`/api/tracks/${id}/times/${posted.id}/ghost`);
    say(typeof ghostBody.ghost === 'string' && ghostBody.ghost.length > 100, `and serves its ghost: ${ghostBody.ghost ? ghostBody.ghost.length : 0} characters of base64`);

    /* 6. Reload on the chase link and chase it. */
    console.log('reload on the chase link, and chase the ghost');
    await page.cdp.send('Page.navigate', { url: `${page.origin}${url(`share=${id}&ghost=${posted.id}`)}` }, page.sessionId);
    await page.sleep(1000);
    await shellUp(page);
    await page.until(`window.__map().ready && window.__map().mode === 'race' && window.__race().gates.length === 3 && window.__ghost().choice === ${JSON.stringify(`board:${posted.id}`)}`, 300000).catch(() => {});
    const chase0 = await page.evaluate('({ map: window.__map(), g: window.__ghost(), key: window.__race().key })');
    say(chase0.map.id === opts.map && chase0.map.gates === 3 && chase0.key.endsWith(`.map.${id}`), `the link seats the same course on ${chase0.map.id}`);
    say(chase0.g.choice === `board:${posted.id}` && chase0.g.boardTimes >= 1, `and picks the board's ghost to chase: ${chase0.g.choice}`);
    await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await page.until("window.__craftState().mode === 'flight'", 60000);
    await page.sleep(1600);
    const chaseGates = await page.evaluate(B('.gates'));
    /* Watch the chase while it is flown: the rig in the scene with the lap
     * clock running, and a gap read at a gate. */
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
    const lap2 = await flyLap(page, chaseGates);
    await stopPilot(page);
    await page.evaluate('window.__watch = false');
    const seen = await page.evaluate('window.__chaseSeen');
    say(seen.armed && Math.round(seen.armedMs) === posted.lapMs, `the board's lap is armed at the start line: ${seen.armedMs != null ? Math.round(seen.armedMs) : 'none'} ms`);
    say(seen.visible, 'the ghost flies in the scene while the lap runs');
    say(seen.gap != null, `and the gap to it is read at the gates: ${seen.gap != null ? (seen.gap / 1000).toFixed(2) : 'none'} s`);
    say(lap2.laps.length >= 1, `the chase lap closes too: ${lap2.best != null ? (lap2.best / 1000).toFixed(2) : 'none'} s`);
    await shot(page, '6-chased');
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
    say(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await page.close();
  }
}

await main();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
