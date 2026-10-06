/*
 * interior-films-check.js: The Interior's films played in the real shell
 * over the Interior's map (src/render/interiorfilms.js, docs/campaign/
 * interior/FILMS.md), headless on the machine's GPU. A local browser
 * check like film:world and warintro:check, not in checks.yml; its data
 * half (timing, the world under every camera, the BOARD's names) is
 * films:lint, which is.
 *
 *   SIM_GPU=1 npm run film:world:interior [-- OUT_DIR]
 *   SIM_GPU=1 npm run board:render [-- OUT_DIR]
 *
 * film:world:interior (--world) plays every film whole, on the page's own
 * clock, and holds, on every frame the film draws:
 *   - the standing world is the Interior's (window.__map().id), built: a
 *     film plays only over its own map (#412), and the player refuses one
 *     handed another map's id
 *   - every shot drawn; every world shot's camera over the ground
 *     (__heightAt) by CLEAR_M; a room shot's set shown and nothing of the
 *     film's scenery named as a person (no face can be on screen)
 *   - the subtitle of every line, in its shot
 *   - skipping: a first viewing does not skip on a held key, a seen one
 *     does on a 2 s hold
 * board:render (--board) steps the clock through every BOARD shot of
 * every film, BOARD_STEPS frames a shot, and holds:
 *   - every still drawn from a picture: authored, a reconstruction, or the
 *     squad's capture when the screen hands one over (the outro is played
 *     with a capture for the bridge and none for the rest), never missing
 *   - the land's picture painted for the map's raster layer
 *   - the board's frame drawn in under BOARD_MS of the page's time
 * Without a flag it runs both. OUT_DIR (default ~/Desktop/fdfpv-loop/
 * interior/films) gets a few frames of each shot for a person to look at,
 * never inside the repository. No page error.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { linesOf, timing } from '../src/share/war/film.js';
import { FILMS, INTERIOR_FILM_IDS } from '../src/share/interior/films/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const doWorld = args.includes('--world') || !args.includes('--board');
const doBoard = args.includes('--board') || !args.includes('--world');
const outDir = resolve(args.find((a) => !a.startsWith('--')) || join(homedir(), 'Desktop/fdfpv-loop/interior/films'));
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`interior-films-check: ${outDir} is inside the repository; frames go outside it`);
}
if (process.env.SIM_GPU !== '1') {
  throw new Error('interior-films-check: run with SIM_GPU=1');
}
await mkdir(outDir, { recursive: true });

/* The camera's least height over the ground on a world shot. */
const CLEAR_M = 0.5;
/* Frames a BOARD shot is stepped through, and the most a BOARD frame may
 * take to draw, ms of the page's own time. */
const BOARD_STEPS = 6;
/* Measured 2026-10-05 on an RTX 3060 Ti: worst 6.0 ms, median 0.3. */
const BOARD_MS = 12;
const HOLD_MS = 2300;
/* A name in the film's scenery that would be a person. */
const PERSON = /figure|person|people|human|body|face|hand/i;

const lines = Object.fromEntries(JSON.parse(await readFile(join(root, 'assets/audio/war/lines.json'), 'utf8')).lines.map((l) => [l.id, l]));
const failures = [];
const row = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) {
    failures.push(name);
  }
};

const seed = [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    s.airframeAsked = true;
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
    localStorage.setItem('webfpv.lang', 'en');
  } catch (e) { /* Storage refused: the run says which preset it got. */ }`];

/*
 * The in page driver: one film through playInteriorFilm on a clock this
 * check sets (window.__ifilm.t, film ms) or the page's own, a proxy
 * camera handed to the shell each frame, and per frame what the checks
 * read.
 */
const DRIVE = /* js */ `(async (o) => {
  const THREE = window.__three;
  const { playInteriorFilm, landRaster } = await import('/src/render/interiorfilms.js');
  await landRaster();
  const cam = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 60000);
  const t0 = performance.now();
  const F = { t: o.stepped ? 0 : null, R: { samples: [], shots: {}, seen: 0, boardMs: [] } };
  window.__ifilm = F;
  /* A screen's capture is a picture it already holds: made once here. */
  let held = null;
  const capture = (item) => {
    if (!o.capture || item !== 'bridge') { return null; }
    if (held) { return held; }
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    const g = c.getContext('2d');
    g.fillStyle = '#3a4a3a'; g.fillRect(0, 0, 320, 200);
    g.fillStyle = '#c8c8c0'; g.fillRect(20, 90, 280, 20);
    held = { image: c, seat: 0 };
    return held;
  };
  const h = playInteriorFilm(window.__mapScene(), cam, o.id, {
    map: window.__map().id,
    audio: null,
    ground: (x, z) => window.__heightAt(x, z),
    clock: () => (F.t != null ? F.t : performance.now() - t0),
    seen: Boolean(o.seen),
    capture,
    onSeen: () => { F.R.seen += 1; },
  });
  F.h = h;
  const fwd = new THREE.Vector3();
  const tick = (now) => {
    if (window.__ifilm !== F || !F.h) { return; }
    const b0 = performance.now();
    h.frame(now);
    const spent = performance.now() - b0;
    const s = h.state();
    if (!s.done && !s.orbit) {
      cam.getWorldDirection(fwd);
      window.__setCam(cam.position.x, cam.position.y, cam.position.z,
        cam.position.x + fwd.x * 100, cam.position.y + fwd.y * 100, cam.position.z + fwd.z * 100, cam.fov);
      if (s.shot >= 0) {
        const x = (F.R.shots[s.shot] ||= { frames: 0, subs: [], sources: {}, sets: 0, low: Infinity, maps: {} });
        x.frames += 1;
        const m = window.__map();
        x.maps[m.id + (m.ready ? '' : ' (not ready)')] = (x.maps[m.id] || 0) + 1;
        if (s.set) { x.sets += 1; } else {
          x.low = Math.min(x.low, cam.position.y - window.__heightAt(cam.position.x, cam.position.z));
        }
        if (s.subtitle && !x.subs.includes(s.subtitle)) { x.subs.push(s.subtitle); }
        for (const b of s.board) { x.sources[b.id] = b.source; }
        if (s.board.length) { F.R.boardMs.push(spent); }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const names = [];
  window.__mapScene().getObjectByName('war-intro').traverse((n) => { if (n.name) { names.push(n.name); } });
  return names;
})`;

async function grab(page, file) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, page.sessionId);
  await writeFile(file, Buffer.from(data, 'base64'));
}

async function stop(page) {
  await page.evaluate('(window.__ifilm && window.__ifilm.h && (window.__ifilm.h.dispose(), window.__ifilm.h = null), window.__setCam(null), "")');
}

async function holdKey(page, ms) {
  const info = {
    key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32,
  };
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, page.sessionId);
  await page.sleep(ms);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, page.sessionId);
}

const page = await openPage({
  root, width: 1600, height: 900, url: '/index.html?map=interior', seed,
});
const quit = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', quit);
process.once('SIGINT', quit);

try {
  await page.until('window.__map && window.__map().id === "interior" && window.__map().ready', 300000);
  console.log(`map ${await page.evaluate('window.__map().id')} ready at ${await page.evaluate('window.__map().graphics')}`);
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');

  /* The player refuses a film over another map's world. */
  const refused = await page.evaluate(`(async () => {
    const { playInteriorFilm } = await import('/src/render/interiorfilms.js');
    try { playInteriorFilm(window.__mapScene(), new window.__three.PerspectiveCamera(), 'int1-intro', { map: 'itaipu' }); return false; }
    catch (e) { return /itaipu/.test(e.message); }
  })()`);
  row('a film handed another map\'s world is refused', refused);

  for (const id of INTERIOR_FILM_IDS) {
    const film = FILMS[id];
    const timed = timing(film);
    const dir = join(outDir, id);
    await mkdir(dir, { recursive: true });
    if (doWorld) {
      console.log(`\n${id} v${film.version}, ${(timed.ms / 1000).toFixed(2)} s, played whole`);
      const names = await page.evaluate(`${DRIVE}(${JSON.stringify({ id, capture: false })})`);
      const people = names.filter((n) => PERSON.test(n));
      row(`${id}: nothing in its scenery named as a person`, people.length === 0, people.slice(0, 5).join(', '));
      for (const [i, s] of timed.shots.entries()) {
        for (const f of [0.3, 0.75]) {
          await page.until(`window.__ifilm.h.state().t >= ${s.start + s.ms * f}`, 120000);
          await grab(page, join(dir, `${String(i + 1).padStart(2, '0')}-${s.id}-${Math.round(f * 100)}.jpg`));
        }
      }
      await page.until('window.__ifilm.h.state().done', 120000);
      const R = await page.evaluate('window.__ifilm.R');
      await stop(page);
      for (const [i, s] of timed.shots.entries()) {
        const x = R.shots[i] || { frames: 0, subs: [], maps: {}, sets: 0, low: Infinity };
        const def = film.shots[i];
        const maps = Object.keys(x.maps);
        const want = linesOf({ shots: [s] }).map((l) => lines[l.line].en);
        const subs = want.every((w) => x.subs.includes(w));
        const ok = x.frames > 0 && maps.length === 1 && maps[0] === 'interior' && (def.set ? x.sets === x.frames : x.low >= CLEAR_M) && subs;
        row(`${id} ${s.id}: drawn over the Interior${def.set ? ' in its set' : ''}, its lines subtitled`, ok,
          `${x.frames} frames, maps ${maps.join(' ') || 'none'}${def.set ? '' : `, least clearance ${x.low.toFixed(2)} m`}${subs ? '' : `, subtitles seen ${JSON.stringify(x.subs)}`}`);
      }
      row(`${id}: a viewing from its start is seen`, R.seen === 1, `onSeen ${R.seen}`);
    }
    if (doBoard) {
      const boardShots = timed.shots.map((s, i) => ({ s, i, def: film.shots[i] })).filter((x) => x.def.board);
      if (!boardShots.length) {
        continue;
      }
      const withCapture = id === 'int1-outro';
      console.log(`\n${id}: ${boardShots.length} BOARD shots stepped${withCapture ? ', a capture handed over for the bridge only' : ''}`);
      await page.evaluate(`${DRIVE}(${JSON.stringify({ id, stepped: true, capture: withCapture })})`);
      /* The preload's black first, where the stills are painted. */
      await page.sleep(1500);
      for (const { s, i } of boardShots) {
        const sources = {};
        for (let k = 0; k < BOARD_STEPS; k += 1) {
          const at = Math.round(s.start + (s.ms * (k + 0.5)) / BOARD_STEPS);
          await page.evaluate(`(window.__ifilm.t = ${at}, "")`);
          await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
          const st = await page.evaluate('window.__ifilm.h.state().board');
          for (const b of st) {
            sources[b.id] = b.source;
          }
          if (k === 2 || k === BOARD_STEPS - 1) {
            await grab(page, join(dir, `board-${String(i + 1).padStart(2, '0')}-${s.id}-${k}.jpg`));
          }
        }
        const missing = Object.entries(sources).filter(([, v]) => v === 'missing');
        const wantCapture = withCapture && Object.keys(sources).includes('cap:bridge');
        const capOk = !wantCapture || sources['cap:bridge'] === 'capture';
        const recOk = Object.entries(sources).filter(([k2]) => k2.startsWith('cap:') && k2 !== 'cap:bridge').every(([, v]) => !withCapture || v === 'reconstruction');
        row(`${id} ${s.id}: every still drawn from a picture`, !missing.length && capOk && recOk,
          Object.entries(sources).map(([k2, v]) => `${k2} ${v}`).join(', ') || 'no stills');
      }
      const R = await page.evaluate('window.__ifilm.R');
      const raster = await page.evaluate("(async () => { const c = await (await import('/src/render/interiorfilms.js')).landRaster(); return c ? c.width : 0; })()");
      await stop(page);
      const sorted = R.boardMs.slice().sort((a, b) => a - b);
      const pct = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
      row(`${id}: the land's picture painted for the BOARD`, raster > 0, `${raster} px`);
      row(`${id}: a BOARD frame drawn in under ${BOARD_MS} ms`, pct(1) < BOARD_MS,
        `median ${pct(0.5).toFixed(1)}, p95 ${pct(0.95).toFixed(1)}, worst ${pct(1).toFixed(1)} ms over ${sorted.length} frames`);
    }
  }

  if (doWorld) {
    console.log('\nskipping (the prologue)');
    await page.evaluate(`${DRIVE}(${JSON.stringify({ id: 'interior-prologue' })})`);
    await page.sleep(1500);
    await holdKey(page, HOLD_MS);
    const first = await page.evaluate('window.__ifilm.h.state()');
    row('a first viewing does not skip on a held key', !first.skipped && !first.done && !first.skippable);
    await stop(page);
    await page.evaluate(`${DRIVE}(${JSON.stringify({ id: 'interior-prologue', seen: true })})`);
    await page.sleep(1500);
    await holdKey(page, HOLD_MS);
    await page.sleep(200);
    const seen = await page.evaluate('window.__ifilm.h ? window.__ifilm.h.state() : null');
    row('a seen film skips on a 2 s hold', Boolean(seen && seen.skipped), seen ? `skipped ${seen.skipped}, done ${seen.done}` : 'no film');
    await stop(page);
  }

  const errors = page.errors;
  row('no page error', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await page.close();
}

console.log(`\nframes in ${outDir}`);
if (failures.length) {
  console.log(`\ninterior-films-check FAIL\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\ninterior-films-check PASS');
