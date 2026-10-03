/*
 * warintro-check.js: the war's intro film (src/render/warintro.js playing
 * src/share/war/films, docs/campaign/INTROS.md), played in the real game
 * on the Itaipu map. npm run warintro:check.
 *
 *     SIM_GPU=1 node scripts/warintro-check.js [--film=ID] [OUT_DIR]
 *
 * It loads the shell headless on the machine's GPU (tests/lib/page.js,
 * which mutes the page), imports the player into the page and drives it
 * the way a shell does: frame() once an animation frame, the film's
 * camera handed to the shell through its harness camera (__setCam). Then
 * it holds the film to:
 *
 *   shots     every shot drawn, and what each is for there: the title
 *             "2030"; the lone Striker in the long lens and then over the
 *             lens; the ten; the counter reaching 14 000 MW; the line of
 *             eight war aircraft; a quad's props, the Striker off its
 *             rail, the interceptor; the wave (Strikers, FPVs,
 *             Loiterers), six defenders and the mission's own card
 *   the voice every line decoded in the browser as long as the manifest
 *             measured it (so the film's shot lengths, which are built on
 *             the manifest, are the files' real lengths, INTROS section
 *             2), scheduled on the audio clock at its start from its
 *             first word, and subtitled in its shot
 *   camera    never under the ground (__heightAt) at any frame
 *   budget    the film's own draw calls at most FILM_CALLS on the map's
 *             view, none over ITAIPU-PLAN section 13's 300 that the map
 *             keeps under it, and its share of frames over 20 ms no more
 *             than DROP_SLACK over the bare map's on the same camera path
 *   skipping  a first viewing does not skip on any key, a tap or a held
 *             one; a seen one skips on a 2 s hold and not on a tap; in a
 *             briefing a skip waits on the dam's orbit; a late start
 *             plays the line under way from its offset and is not seen
 *   the hand-off  the letterbox open by the film's last frame
 *   the game  then through src/main.js on a rooms server this check runs
 *             itself (edge/rooms/node.js), two pages: the host's start
 *             with the intro plays the film on both, from the room's
 *             clock, within MAX_SKEW_MS of each other at the same wall
 *             time; the host who has seen it holding to skip while the
 *             guest has not leaves the host on the orbit and the room in
 *             its briefing; the guest watches to the end, which makes it
 *             seen; the next briefing, both seen, ends for the room on
 *             the host's hold; a guest who joins mid briefing starts the
 *             film where the room is
 *
 * OUT_DIR (default the system temp dir's warintro-frames) gets three frames
 * of each shot, for a person to look at. Never inside the repository.
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

import { writeFile, mkdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import EN from '../src/strings/en.js';
import { PRELOAD_MS, timing, linesOf } from '../src/share/war/film.js';
import { FILMS, filmFor } from '../src/share/war/films/index.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { startRooms } from '../edge/rooms/node.js';
import { WORLD_LEAD_MS } from '../edge/rooms/war.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The film to hold, --film=<id>, the default's without (the in game part
 * plays mission 1's own, whatever this says). */
const filmArg = process.argv.find((a) => a.startsWith('--film='));
const FILM = filmArg ? FILMS[filmArg.slice('--film='.length)] : filmFor(null);
if (!FILM) {
  throw new Error(`warintro-check: no film ${filmArg}`);
}
/* What the room plays for the in game part: mission 1's own film. */
const GAME_FILM = filmFor(MISSIONS['itaipu-1']);
const GAME_MS = timing(GAME_FILM).ms;
const TIMED = timing(FILM);
const SHOTS = TIMED.shots;
const LINES = linesOf(TIMED);
const shotOf = (id) => SHOTS.findIndex((s) => s.id === id);

/* How much more of the film's frames than the bare map's may miss a 60 Hz
 * vsync, on the same camera path. */
const DROP_SLACK = 0.03;
const DROP_MS = 20;
const SETTLE_MS = 600;
/* ITAIPU-PLAN section 13; and what the film's scenery may add to a
 * view: eight baked aircraft on the crest and four turning rotors. */
const CALLS = 300;
const FILM_CALLS = 16;
/* The camera's least height over the ground: the props shot sits a
 * quarter metre over the crest by an aircraft on it. */
const CLEAR_M = 0.15;
/* A decoded line against the manifest's measure: the encoder's padding. */
const DECODE_TOL_S = 0.03;
/* Two screens' films at the same wall time: one 60 Hz frame. */
const MAX_SKEW_MS = 17;
/* Holding past the 2 s skip. */
const HOLD_MS = 2300;

if (process.env.SIM_GPU !== '1') {
  throw new Error('warintro-check: run with SIM_GPU=1; a software rasteriser cannot time the frames');
}
const outDir = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || join(tmpdir(), 'warintro-frames'));
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`warintro-check: ${outDir} is inside the repository; frames go outside it`);
}
await mkdir(outDir, { recursive: true });
const manifest = JSON.parse(await readFile(join(root, 'assets/audio/war/manifest.json'), 'utf8'));
const linesJson = Object.fromEntries(JSON.parse(await readFile(join(root, 'assets/audio/war/lines.json'), 'utf8')).lines.map((l) => [l.id, l]));

const failures = [];
const row = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) {
    failures.push(name);
  }
};

/* A page's settings: high graphics, English, and whether this pilot has
 * seen the film (the campaign section's films, src/game/campaign.js). */
const seedFor = (seen) => [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.graphics = 'high';
    s.graphicsAuto = false;
    s.airframeAsked = true;
    s.campaign = { films: ${seen ? JSON.stringify({ [GAME_FILM.id]: GAME_FILM.version }) : '{}'} };
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
    localStorage.setItem('webfpv.lang', 'en');
  } catch (e) { /* Storage refused: the run says which preset it got. */ }`];

/* Space held for ms on a page, as a pilot holds a key. */
async function holdKey(page, ms) {
  const info = {
    key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32,
  };
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...info }, page.sessionId);
  await page.sleep(ms);
  await page.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...info }, page.sessionId);
}

/*
 * The in page driver: the player on this screen's own clock from startMs,
 * a proxy camera, and one animation frame callback that runs the film and
 * hands the camera to the shell. Per frame it keeps the time since the
 * last, the camera's height over the ground, and per shot the most of
 * each thing the film is meant to show.
 */
const DRIVE = /* js */ `(async (opts) => {
  const THREE = window.__three;
  const { play } = await import('/src/render/warintro.js');
  const cam = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 60000);
  const bare = Boolean(opts.bare);
  const t0 = performance.now() - (opts.startMs || 0);
  const R = { frames: [], cpu: [], clear: [], shots: {}, seen: 0 };
  const h = play(bare ? new THREE.Scene() : window.__mapScene(), cam, {
    audio: bare ? null : window.__audio,
    ground: (x, z) => window.__heightAt(x, z),
    title: { key: 'war.mission.itaipu_1', n: 1 },
    film: (await import('/src/share/war/films/index.js')).FILMS[${JSON.stringify(FILM.id)}],
    clock: () => performance.now() - t0,
    seen: Boolean(opts.seen),
    hold: Boolean(opts.hold),
    onSeen: () => { R.seen += 1; },
    onSkip: () => { R.skip = true; },
    ...(bare ? { canvas: document.createElement('canvas') } : {}),
  });
  if (bare) {
    for (const e of document.querySelectorAll('[data-war-intro]')) { e.style.display = 'none'; }
  }
  window.__film = { h, R, capturing: false };
  const fwd = new THREE.Vector3();
  let last = null;
  const tick = (now) => {
    if (window.__film.h !== h) { return; }
    const c0 = performance.now();
    h.frame(now);
    R.cpu.push(performance.now() - c0);
    const s = h.state();
    if (last != null) { R.frames.push([now - last, window.__film.capturing ? 1 : 0, s.shot, s.t]); }
    last = now;
    if (!s.done) {
      cam.getWorldDirection(fwd);
      window.__setCam(cam.position.x, cam.position.y, cam.position.z,
        cam.position.x + fwd.x * 100, cam.position.y + fwd.y * 100, cam.position.z + fwd.z * 100, cam.fov);
      if (!s.orbit && s.shot >= 0) {
        const g = window.__heightAt(cam.position.x, cam.position.z);
        R.clear.push([s.shot, cam.position.y - g, Math.round(cam.position.x), Math.round(cam.position.z)]);
        const x = (R.shots[s.shot] ||= { frames: 0, drawn: {}, cast: [], titles: [], subs: [], counter: null, calls: 0, opened: 0 });
        x.frames += 1;
        x.opened = Math.max(x.opened, s.opened);
        for (const [kind, n] of Object.entries(s.drawn)) { x.drawn[kind] = Math.max(x.drawn[kind] || 0, n); }
        for (const c of s.cast) { if (!x.cast.includes(c)) { x.cast.push(c); } }
        if (s.title && !x.titles.includes(s.title)) { x.titles.push(s.title); }
        if (s.subtitle && !x.subs.includes(s.subtitle)) { x.subs.push(s.subtitle); }
        if (s.counter) { x.counter = s.counter; }
        if (s.sound && s.sound.musicPlaying) { x.music = s.sound.track; }
        /* The stats are the last draw's: a shot's first frames count the
         * shot before. */
        const calls = window.__renderStats().calls;
        if (x.frames > 3 && calls > x.calls) {
          x.calls = calls;
          x.callsAt = [Math.round(s.t), Math.round(cam.position.x), Math.round(cam.position.y), Math.round(cam.position.z)];
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})`;

const scratch = await mkdtemp(join(tmpdir(), 'fdfpv-warintro-'));
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const url = `/index.html?map=itaipu&rooms=${encodeURIComponent(`http://127.0.0.1:${server.port}`)}`;
/* The host has seen this cut (the driver below says so for itself, per
 * run); the guest page has not. */
const page = await openPage({
  root, width: 1600, height: 900, url, seed: seedFor(true),
});
let guest = null;
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);

/* A click is the gesture a browser wants before sound, as a pilot's own
 * clicks into a room are; then the shell's audio is started. */
async function soundOn(p) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await p.cdp.send('Input.dispatchMouseEvent', {
      type, x: 5, y: 5, button: 'left', clickCount: 1,
    }, p.sessionId);
  }
  await p.evaluate('(window.__audio.start(), window.__audio.setEnabled(true), "")');
  await p.sleep(500);
}

try {
  await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
  console.log(`map ready at ${await page.evaluate('window.__map().graphics')}; renderer ${await page.evaluate(`(() => { const g = document.getElementById('view').getContext('webgl2');
    return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); })()`)}`);
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  await soundOn(page);
  console.log(`audio context: ${await page.evaluate('window.__audio.ctx ? window.__audio.ctx.state : "none"')}`);

  console.log(`\nthe whole film, ${(TIMED.ms / 1000).toFixed(2)} s, a first viewing`);
  await page.evaluate(`${DRIVE}({})`);
  const grabs = [];
  for (const [i, s] of SHOTS.entries()) {
    for (const f of [0.2, 0.5, 0.8]) {
      grabs.push({ i, at: s.start + s.ms * f, name: `${String(i + 1).padStart(2, '0')}-${s.id}-${Math.round(f * 100)}` });
    }
  }
  /* A held key and a tap in the first shot: a first viewing skips on
   * neither. */
  await page.until(`window.__film.h.state().t >= ${SHOTS[0].start + 500}`, 30000);
  await page.tap('Space');
  await holdKey(page, HOLD_MS);
  const unskipped = await page.evaluate('window.__film.h.state()');
  row('a first viewing: no hint, and neither a tap nor a held key skips it', !unskipped.skipped && !unskipped.skippable && !unskipped.done);
  for (const g of grabs) {
    await page.until(`window.__film.h.state().t >= ${g.at}`, 120000);
    await page.evaluate('window.__film.capturing = true');
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, page.sessionId);
    await page.evaluate('requestAnimationFrame(() => requestAnimationFrame(() => { window.__film.capturing = false; }))');
    await writeFile(join(outDir, `${g.name}.jpg`), Buffer.from(data, 'base64'));
  }
  await page.until('window.__film.h.state().done', 120000);
  const { R, s } = await page.evaluate('({ R: window.__film.R, s: window.__film.h.state() })');
  await page.evaluate('(window.__film.h.dispose(), window.__film.h = null, window.__setCam(null), "")');
  const bedAfter = await page.evaluate('window.__audio.warRadio ? window.__audio.warRadio.track : null');

  const shot = (id) => R.shots[shotOf(id)] || {
    frames: 0, drawn: {}, cast: [], titles: [], subs: [], calls: 0, opened: 0,
  };
  console.log('\nper shot: frames, most attackers drawn, the cast, most draw calls');
  for (const x of SHOTS) {
    const y = shot(x.id);
    console.log(`  ${x.id.padEnd(7)} ${String(y.frames).padStart(4)} frames, ${JSON.stringify(y.drawn)}, [${y.cast.join(' ')}], ${y.calls} calls`);
  }
  console.log('');
  row('every shot is drawn', SHOTS.every((x) => shot(x.id).frames >= 30), SHOTS.map((x) => shot(x.id).frames).join(' '));
  row('dawn: the title "2030"', shot('dawn').titles.includes('2030'), shot('dawn').titles.join(' | '));
  row('haze and pass: the lone Striker, and no other attacker', shot('haze').drawn.strike === 1 && shot('pass').drawn.strike === 1,
    `${shot('haze').drawn.strike} ${shot('pass').drawn.strike}`);
  row('ten: the ten Strikers', shot('ten').drawn.strike === 10, `${shot('ten').drawn.strike}`);
  row('face: the counter reaches 14 000 MW', /14\s?000 MW/.test(shot('face').counter || ''), shot('face').counter || 'none');
  const LINE = ['ten', 'q1', 'q2', 'q3', 'strk', 'int', 'ten2', 'int2'];
  row('line: the eight aircraft on the crest', LINE.every((n) => shot('line').cast.includes(n)), shot('line').cast.join(' '));
  row('props, thrown, fan: the quad spinning up, the Striker off its rail, the interceptor', shot('props').cast.includes('q2s') && shot('thrown').cast.includes('strks')
    && shot('fan').cast.includes('ints'), `${shot('props').cast.join(' ')} / ${shot('thrown').cast.join(' ')} / ${shot('fan').cast.join(' ')}`);
  row('wave: Strikers, FPVs and Loiterers, and six defenders rising', shot('wave').drawn.strike >= 10 && shot('wave').drawn.fpv >= 8 && shot('wave').drawn.loiter >= 3
    && ['q4', 'q5', 'q6', 'q7', 'strks', 'int3'].every((n) => shot('wave').cast.includes(n)), `${JSON.stringify(shot('wave').drawn)} [${shot('wave').cast.join(' ')}]`);
  row('wave: the mission\'s own card, its title over "Mission 1"', shot('wave').titles.includes(EN['war.mission.itaipu_1']), shot('wave').titles.join(' | '));
  row('the hand-off: the letterbox open by the last frame', shot('wave').opened > 0.95, shot('wave').opened.toFixed(3));

  /* The voice: decoded here, as long as the manifest says. */
  const decoded = s.sound ? s.sound.decoded : {};
  const lens = LINES.map((l) => [l.line, decoded[l.line], manifest.voice[`${l.line}.en`].seconds * 1000]);
  row('every line decoded in the browser is as long as the manifest measured it, so each shot is as long as its line',
    lens.every(([, d, m]) => Number.isFinite(d) && Math.abs(d - m) <= DECODE_TOL_S * 1000), lens.map(([id, d, m]) => `${id} ${d}/${Math.round(m)}`).join(', '));
  const cued = s.sound ? s.sound.cued : [];
  row(`every line (${LINES.length}) scheduled on the audio clock at its start, from its first word`,
    LINES.every((l) => cued.some((c) => c.line === l.line && c.at === l.start && c.offset === 0)),
    cued.map((c) => `${c.line}@${(c.at / 1000).toFixed(2)}+${c.offset}`).join(' '));
  const subs = LINES.map((l) => {
    const i = SHOTS.findIndex((x) => x.lines.some((y) => y.line === l.line));
    return (R.shots[i]?.subs ?? []).includes(linesJson[l.line].en);
  });
  row('every line subtitled in its shot, in English as lines.json has it', subs.every(Boolean), subs.map((x, i) => `${LINES[i].line}:${x ? 'y' : 'n'}`).join(' '));
  row('the music: the war bed\'s intro track from the first shot, and the bed put back after', SHOTS.every((x) => shot(x.id).music === 'intro') && bedAfter === '',
    `${SHOTS.map((x) => shot(x.id).music || '-').join(' ')}; after, '${bedAfter}'`);
  row('a viewing from its start is seen, once', R.seen === 1, `${R.seen}`);
  const low = R.clear.reduce((m, c) => (c[1] < m[1] ? c : m), [0, Infinity]);
  row(`the camera never goes under the ground (least clearance over ${CLEAR_M} m)`, low[1] >= CLEAR_M, `least ${low[1].toFixed(2)} m in ${SHOTS[low[0]]?.id} at ${low[2]}, ${low[3]}`);

  /* The timing runs: each shot bare, then filmed, back to back. */
  console.log('\nthe timing: each shot over the bare map, then filmed');
  const base = { frames: [], shots: {} };
  const filmRun = { frames: [], cpu: [] };
  for (const [i, x] of SHOTS.entries()) {
    for (const bare of [true, false]) {
      await page.evaluate(`${DRIVE}({ bare: ${bare}, startMs: ${x.start} })`);
      await page.until(`window.__film.h.state().t >= ${x.start + x.ms - 40}`, x.ms + 60000);
      const got = await page.evaluate('window.__film.R');
      await page.evaluate('(window.__film.h.dispose(), window.__film.h = null, "")');
      const kept = got.frames.filter((f) => f[2] === i && f[3] >= x.start + SETTLE_MS);
      if (bare) {
        base.frames.push(...kept);
        base.shots[i] = got.shots[i];
      } else {
        filmRun.frames.push(...kept);
        filmRun.cpu.push(...got.cpu);
      }
    }
  }
  await page.evaluate('(window.__setCam(null), "")');
  const bareCalls = (i) => (base.shots[i] ? base.shots[i].calls : 0);
  const added = SHOTS.map((x, i) => shot(x.id).calls - bareCalls(i));
  row(`the film adds at most ${FILM_CALLS} draw calls to the map's view`, Math.max(...added) <= FILM_CALLS,
    `by shot ${added.join(' ')}; the film ${SHOTS.map((x) => shot(x.id).calls).join(' ')}, the bare map ${SHOTS.map((_, i) => bareCalls(i)).join(' ')}`);
  const over = SHOTS.map((_, i) => i).filter((i) => shot(SHOTS[i].id).calls > CALLS);
  row(`and puts no view over ${CALLS} (ITAIPU-PLAN section 13) that the map keeps under it`, over.every((i) => bareCalls(i) > CALLS),
    over.map((i) => `${SHOTS[i].id} ${shot(SHOTS[i].id).calls}, the bare map ${bareCalls(i)}`).join('; ') || 'none over');
  const times = (frames, i = null) => frames.filter((f) => !f[1] && f[2] >= 0 && (i == null || f[2] === i)).map((f) => f[0]).sort((a, b) => a - b);
  const pct = (d, p) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : NaN);
  const drops = (d) => d.filter((x) => x > DROP_MS).length / Math.max(1, d.length);
  const filmT = times(filmRun.frames);
  const bareT = times(base.frames);
  console.log(`  info  the bare map: ${bareT.length} frames, median ${pct(bareT, 0.5).toFixed(1)} ms, p95 ${pct(bareT, 0.95).toFixed(1)} ms, ${(100 * drops(bareT)).toFixed(1)} % over ${DROP_MS} ms`);
  console.log(`  info  the film:     ${filmT.length} frames, median ${pct(filmT, 0.5).toFixed(1)} ms, p95 ${pct(filmT, 0.95).toFixed(1)} ms, ${(100 * drops(filmT)).toFixed(1)} % over ${DROP_MS} ms`);
  const cpu = [...filmRun.cpu].sort((a, b) => a - b);
  console.log(`  info  the film's own frame(), main thread: median ${pct(cpu, 0.5).toFixed(2)} ms, p95 ${pct(cpu, 0.95).toFixed(2)} ms, max ${pct(cpu, 1).toFixed(1)} ms`);
  row(`frame time holds: the film misses at most ${DROP_SLACK * 100} points more vsyncs than the bare map on the same path`, drops(filmT) <= drops(bareT) + DROP_SLACK,
    `${(100 * drops(filmT)).toFixed(1)} % against ${(100 * drops(bareT)).toFixed(1)} %`);

  console.log('\nskipping, and a late start');
  await page.evaluate(`${DRIVE}({ seen: true, startMs: ${SHOTS[1].start} })`);
  await page.sleep(400);
  await page.tap('Space');
  await page.sleep(300);
  const tapped = await page.evaluate('window.__film.h.state()');
  await holdKey(page, HOLD_MS);
  await page.until('window.__film.h.state().done', 5000).catch(() => {});
  const sk = await page.evaluate('({ s: window.__film.h.state(), R: window.__film.R })');
  row('a seen film: a tap does not skip it, a 2 s hold does, and with no briefing it is over at once', !tapped.skipped && sk.s.skipped && sk.s.done && sk.R.skip === true,
    `tap ${tapped.skipped}, hold ${sk.s.skipped}, done ${sk.s.done}`);
  await page.evaluate('(window.__film.h.dispose(), "")');
  await page.evaluate(`${DRIVE}({ seen: true, hold: true, startMs: ${TIMED.ms - 6000} })`);
  await page.sleep(400);
  await holdKey(page, HOLD_MS);
  await page.until('window.__film.h.state().orbit', 5000);
  const orb = await page.evaluate('window.__film.h.state()');
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, page.sessionId);
  await writeFile(join(outDir, 'briefing-orbit.jpg'), Buffer.from(data, 'base64'));
  row('skipped in a room\'s briefing: the dam\'s orbit and the time left', orb.orbit && !orb.done && /^Briefing: [1-4] s$/.test(orb.hold || ''), orb.hold || 'none');
  await page.until('window.__film.h.state().done', 8000);
  await page.evaluate('(window.__film.h.dispose(), window.__film.h = null, "")');
  const mid = LINES[2];
  const into = 1000;
  await page.evaluate(`${DRIVE}({ startMs: ${mid.start + into} })`);
  await page.until(`window.__film.h.state().sound && window.__film.h.state().sound.cued.length > 0`, 10000).catch(() => {});
  const late = await page.evaluate('({ s: window.__film.h.state(), R: window.__film.R })');
  const lc = late.s.sound ? late.s.sound.cued[0] : null;
  row(`a late start plays the line under way from its offset (${mid.line}, ${into} ms in), never drops it`, lc && lc.line === mid.line && Math.abs(lc.offset - into) < 150,
    JSON.stringify(lc));
  await page.until(`window.__film.h.state().t >= ${SHOTS.at(-1).start + 200}`, 90000);
  row('and a viewing that did not start at the first shot is not seen', late.R.seen === 0 && (await page.evaluate('window.__film.R.seen')) === 0);
  await page.evaluate('(window.__film.h.dispose(), window.__film.h = null, window.__setCam(null), "")');
  const left = await page.evaluate(`({
    overlay: document.querySelectorAll('[data-war-intro]').length,
    scenery: Boolean(window.__mapScene().getObjectByName('war-intro')),
    filter: document.getElementById('view').style.filter,
  })`);
  row('dispose leaves no overlay, no scenery, and the canvas as it was', left.overlay === 0 && !left.scenery && left.filter === '', JSON.stringify(left));

  console.log('\nin the game, two pages on one room');
  await page.until('window.__shellReady === true', 60000);
  guest = await openPage({
    root, width: 1280, height: 720, url, seed: seedFor(false),
  });
  await guest.until('window.__shellReady === true && window.__map && window.__map().ready', 300000);
  await soundOn(guest);
  const code = await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  const film = (p) => p.evaluate('window.__warIntro()');
  const view = (p) => p.evaluate('window.__war().view');

  /* 1: the guest joins 9 s into the briefing. The host's world is
   * rebuilt for the mission's time first (WORLD_LEAD_MS in
   * edge/rooms/war.js): its film must still start in the black. */
  await page.evaluate("window.__warDo('brief')");
  await page.until('window.__warIntro()', 30000);
  const firstT = (await film(page)).t;
  row('the host\'s world rebuilt for the mission\'s time inside the briefing\'s lead: its film starts in the black, so from its start', firstT <= PRELOAD_MS,
    `first frame at film ${Math.round(firstT)} ms`);
  await page.until('window.__warIntro() && window.__warIntro().t > 9000', 40000);
  await guest.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await guest.until('window.__warIntro() && window.__warIntro().t > 0', 30000);
  const j = await Promise.all([film(page), film(guest)]);
  row('a guest joining mid briefing starts the film where the room is, not from its start', j[1].t > 9000 && Math.abs(j[0].t - j[1].t) < 1000,
    `host ${Math.round(j[0].t)}, guest ${Math.round(j[1].t)}`);
  /* The film plays in the world the mission is flown in (its `time`,
   * warTimeFrame in src/main.js), rebuilt at the briefing's start. */
  const lookTime = (p) => p.evaluate("(() => { const it = window.__mapScene && window.__mapScene().userData.itaipu; return it && it.look ? it.look.time : null; })()");
  const looks = [await lookTime(page), await lookTime(guest)];
  for (const [who, p] of [['host', page], ['guest', guest]]) {
    const builds = await p.evaluate('window.__war().night');
    console.log(`  info  ${who}'s world builds for the war's time: ${builds.map((b) => `${b.time ?? 'map'} at ${b.at}, up ${b.done == null ? 'not yet' : `${b.done - b.at} ms later`}`).join('; ')}`);
  }
  row(`both worlds are built at the mission's time of day (${MISSIONS['itaipu-1'].time})`, looks.every((t) => t === MISSIONS['itaipu-1'].time), looks.join(', '));
  /* Both films at the same wall time: each page sampled with Date.now(),
   * which the two pages share, the film's t interpolated between. */
  const samples = async (p) => p.evaluate(`new Promise((done) => { const out = []; const step = () => {
    const i = window.__warIntro(); if (i) { out.push([performance.timeOrigin + performance.now(), i.t]); }
    if (out.length < 120) { requestAnimationFrame(step); } else { done(out); } }; requestAnimationFrame(step); })`);
  const [sa, sb] = await Promise.all([samples(page), samples(guest)]);
  const at = (list, w) => {
    for (let k = 1; k < list.length; k += 1) {
      if (list[k][0] >= w) {
        const [w0, t0] = list[k - 1];
        const [w1, t1] = list[k];
        return t0 + ((t1 - t0) * (w - w0)) / Math.max(1e-6, w1 - w0);
      }
    }
    return NaN;
  };
  const skews = sa.slice(5, -5).map(([w, t]) => Math.abs(t - at(sb, w))).filter(Number.isFinite);
  const worst = Math.max(...skews);
  row(`both screens play the film from the room's clock, within ${MAX_SKEW_MS} ms of each other at the same wall time`, skews.length > 50 && worst <= MAX_SKEW_MS,
    `${skews.length} samples, worst ${worst.toFixed(1)} ms`);
  const hint = [(await film(page)).skippable, (await film(guest)).skippable];
  row('the host, who has seen it, may hold to skip; the guest, on a first viewing, may not', hint[0] === true && hint[1] === false, JSON.stringify(hint));
  await holdKey(guest, HOLD_MS);
  await holdKey(page, HOLD_MS);
  await page.sleep(500);
  const r1 = [await film(page), await film(guest), await view(page)];
  row('the host\'s hold leaves only the host\'s view, for the orbit, while the guest has not seen it: the room keeps its briefing',
    r1[0] && r1[0].orbit && r1[1] && !r1[1].orbit && !r1[1].skipped && r1[2].state === 'briefing',
    `${r1[2].state}, host orbit ${r1[0] && r1[0].orbit}, guest skipped ${r1[1] && r1[1].skipped}`);
  await guest.until('window.__war().view.state !== "briefing"', GAME_MS + WORLD_LEAD_MS + 20000);
  const filmsOf = (p) => p.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).campaign.films || {}`);
  row('a viewing joined late does not make it seen', ((await filmsOf(guest))[GAME_FILM.id] ?? 0) < GAME_FILM.version, JSON.stringify(await filmsOf(guest)));
  await page.evaluate("window.__warDo('end')");
  await page.until("window.__war().view.state === 'ended'", 10000);

  /* 2: the whole film on both, from the start. */
  await page.evaluate("window.__warDo('brief')");
  await guest.until('window.__warIntro() && window.__warIntro().t > 0', 30000);
  await guest.until('window.__war().view.state !== "briefing"', GAME_MS + WORLD_LEAD_MS + 20000);
  row('the guest, having watched it from its start to its end, has seen it', ((await filmsOf(guest))[GAME_FILM.id] ?? 0) >= GAME_FILM.version, JSON.stringify(await filmsOf(guest)));
  await page.evaluate("window.__warDo('end')");
  await page.until("window.__war().view.state === 'ended'", 10000);
  await page.until('(window.__war().view.seen || []).length === 2', 10000).catch(() => {});

  /* 3: both seen; the host's hold ends the briefing for the room. */
  await page.evaluate("window.__warDo('brief')");
  await page.until('window.__warIntro() && window.__warIntro().t > 3000', 30000);
  await holdKey(page, HOLD_MS);
  await page.until("window.__war().view.state === 'countdown'", 10000).catch(() => {});
  await guest.until('window.__warIntro() === null', 5000).catch(() => {});
  const r2 = await Promise.all([page, guest].map((p) => p.evaluate('({ i: window.__warIntro(), v: window.__war().view, room: window.__rooms().roomNow })')));
  row('both seen: the host\'s hold ends the briefing for the room, and the film is gone from both screens', r2.every((x) => x.v.state === 'countdown' && !x.i)
    && r2[0].v.goAt - r2[0].room <= COUNTDOWN_MS, r2.map((x) => `${x.v.state} ${Boolean(x.i)}`).join(' / '));
  await page.evaluate("window.__warDo('end')");

  row('no console errors', page.errors.length === 0 && guest.errors.length === 0, [...page.errors, ...guest.errors].slice(0, 5).join(' | ') || 'none');
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await page.close();
  if (guest) {
    await guest.close();
  }
  await server.stop();
  await rm(scratch, { recursive: true, force: true });
}

console.log(`\nframes -> ${outDir}`);
if (failures.length) {
  console.error(`FAIL, ${failures.length} of the checks above`);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
