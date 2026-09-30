/*
 * warintro-check.js: the war mode's "2030" intro (src/render/warintro.js,
 * docs/WARFARE-PLAN.md section 7.1), played whole in the real game on the
 * Itaipu map. npm run warintro:check.
 *
 *     SIM_GPU=1 node scripts/warintro-check.js [OUT_DIR]
 *
 * It loads the shell headless on the machine's GPU (tests/lib/page.js,
 * which mutes the page), imports the player into the page and drives it
 * the way a shell does: frame() once an animation frame, the film's
 * camera handed to the shell through its harness camera (__setCam, which
 * takes a position, a point to look at and a lens; everything else is
 * the shell's own draw). Then it holds the film to:
 *
 *   shots     every shot drawn, and what each one is for there: the
 *             title "2030"; eleven Strikers over the water; the counter
 *             reaching 14 000 MW; the line of eight aircraft; the spin up
 *             cuts' cast; the wave (Strikers, FPVs, Loiterers), the six
 *             defenders and the mission card
 *   words     every played voice line's subtitle shown, in the page's
 *             language, as lines.json has it, and every voice file as
 *             long as the manifest measured it, so the subtitles' timing
 *             is the files'; intro-6, the signal line, never said (the
 *             signal system is out of the war mode for now, and its shot
 *             with it)
 *   camera    never under the ground (__heightAt) at any frame
 *   budget    the film's own draw calls at most FILM_CALLS on the map's
 *             view, and no view over ITAIPU-PLAN section 13's 300 that the
 *             map alone keeps under it; and
 *             the frame time against the map's own: shot by shot, the
 *             shot's camera path is flown with nothing of the film in the
 *             scene or on the screen (the bare map), then the shot itself,
 *             back to back so the rest of the machine's load falls on both
 *             alike; the film's share of frames over 20 ms (a missed 60 Hz
 *             vsync) may not be more than DROP_SLACK over the bare map's.
 *             The 95th percentile of the time between animation frames is
 *             reported for both, and not judged: under vsync it is 16.7 or
 *             33.4 ms and nothing between, so it flips on one frame in
 *             twenty and says less than the share. Each run's first
 *             SETTLE_MS is left out: the camera has just jumped, for both
 *   console   no page error at all
 *   skip      a key skips it; with a room's briefing still running the
 *             camera circles the dam over "Briefing: N s" until it ends;
 *             dispose() leaves no overlay, no scenery and the canvas as it
 *             was
 *   the game  then through src/main.js's own hook, on a rooms server this
 *             check runs in its own process (edge/rooms/node.js): the
 *             host's Watch intro plays on the shell's camera with its
 *             screens hidden and a key gives them back; the host's start
 *             with the intro puts the room in its briefing, the film plays
 *             from where the room is in it, and the host's key ends the
 *             briefing for the room, which counts down at once
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
import { SHOT_MS, INTRO_MS } from '../src/share/war/intro.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import { startRooms } from '../edge/rooms/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* How much more of the film's frames than the bare map's may miss a 60 Hz
 * vsync, on the same camera path: the film adds its scenery, the overlays
 * and the grade. */
const DROP_SLACK = 0.03;
const DROP_MS = 20;
const SETTLE_MS = 600;
/* ITAIPU-PLAN section 13; and what the film's scenery may add to a
 * view: eight baked aircraft on the crest and four turning rotors. */
const CALLS = 300;
const FILM_CALLS = 16;
/* The camera's least height over the ground: the spin up cuts sit a
 * quarter metre over the crest by an aircraft on it. */
const CLEAR_M = 0.15;

if (process.env.SIM_GPU !== '1') {
  throw new Error('warintro-check: run with SIM_GPU=1; a software rasteriser cannot time the frames');
}
const outDir = resolve(process.argv[2] || join(tmpdir(), 'warintro-frames'));
if (outDir === root || outDir.startsWith(`${root}/`)) {
  throw new Error(`warintro-check: ${outDir} is inside the repository; frames go outside it`);
}
await mkdir(outDir, { recursive: true });

/* The intro's lines the film plays, one a shot in order: intro-6 went
 * with the gorge's shot and the signal system. */
const CUT = 'intro-6';
const lines = JSON.parse(await readFile(join(root, 'assets/audio/war/lines.json'), 'utf8')).lines.filter((l) => l.group === 'intro' && l.id !== CUT);
if (lines.length !== SHOT_MS.length) {
  throw new Error(`warintro-check: ${lines.length} lines played for ${SHOT_MS.length} shots`);
}
const manifest = JSON.parse(await readFile(join(root, 'assets/audio/war/manifest.json'), 'utf8'));

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
 * The in page driver: the player, a proxy camera, and one animation frame
 * callback that runs the film and hands the camera to the shell. Per frame
 * it keeps the time since the last, the camera's height over the ground,
 * and per shot the most of each thing the film is meant to show.
 */
const DRIVE = /* js */ `(async (opts) => {
  const THREE = window.__three;
  const { play } = await import('/src/render/warintro.js');
  const cam = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 60000);
  /* bare: the film's camera path alone, its scenery in a scene nobody
   * draws and its overlay hidden. */
  const bare = Boolean(opts.bare);
  const h = play(bare ? new THREE.Scene() : window.__mapScene(), cam, {
    audio: bare ? null : window.__audio, ground: (x, z) => window.__heightAt(x, z),
    ...(bare ? { canvas: document.createElement('canvas') } : {}), ...opts,
  });
  if (bare) {
    for (const e of document.querySelectorAll('[data-war-intro]')) { e.style.display = 'none'; }
  }
  const R = { frames: [], cpu: [], clear: [], shots: {} };
  window.__intro2030 = { h, R, capturing: false };
  const fwd = new THREE.Vector3();
  let last = null;
  let k = 0;
  const tick = (now) => {
    if (window.__intro2030.h !== h) { return; }
    const c0 = performance.now();
    h.frame(now);
    R.cpu.push(performance.now() - c0);
    const s = h.state();
    if (last != null) { R.frames.push([now - last, window.__intro2030.capturing ? 1 : 0, s.shot, s.t]); }
    last = now;
    if (!s.done) {
      cam.getWorldDirection(fwd);
      window.__setCam(cam.position.x, cam.position.y, cam.position.z,
        cam.position.x + fwd.x * 100, cam.position.y + fwd.y * 100, cam.position.z + fwd.z * 100, cam.fov);
      k += 1;
      if (!s.orbit && s.shot >= 0) {
        const g = window.__heightAt(cam.position.x, cam.position.z);
        R.clear.push([s.shot, cam.position.y - g, Math.round(cam.position.x), Math.round(cam.position.z)]);
        const x = (R.shots[s.shot] ||= { frames: 0, drawn: {}, cast: [], titles: [], subs: [], counter: null, calls: 0 });
        x.frames += 1;
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
          x.callsAt = [Math.round(s.t - ${JSON.stringify(SHOT_MS)}.slice(0, s.shot).reduce((a, b) => a + b, 0)), Math.round(cam.position.x), Math.round(cam.position.y), Math.round(cam.position.z)];
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
const page = await openPage({
  root, width: 1600, height: 900, url: `/index.html?map=itaipu&rooms=${encodeURIComponent(`http://127.0.0.1:${server.port}`)}`, seed,
});
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
let report = null;
try {
  await page.until('window.__map && window.__map().id === "itaipu" && window.__map().ready', 300000);
  console.log(`map ready at ${await page.evaluate('window.__map().graphics')}; renderer ${await page.evaluate(`(() => { const g = document.getElementById('view').getContext('webgl2');
    return g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); })()`)}`);
  await page.evaluate('(document.getElementById("ui").style.display = "none", "")');
  /* A click is the gesture a browser wants before sound, as a pilot's
   * own clicks into a room are; then the shell's audio is started. */
  await page.cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1,
  }, page.sessionId);
  await page.cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1,
  }, page.sessionId);
  await page.evaluate('(window.__audio.start(), window.__audio.setEnabled(true), "")');
  await page.sleep(500);
  console.log(`audio context: ${await page.evaluate('window.__audio.ctx ? window.__audio.ctx.state : "none"')}`);

  /* Each voice file's own length, as the browser decodes it. */
  const durations = await page.evaluate(`Promise.all(${JSON.stringify(lines.map((l) => l.id))}.map((id) => new Promise((done) => {
    const a = new Audio(new URL('assets/audio/war/voice/en/' + id + '.webm', location.href).href);
    a.preload = 'metadata';
    a.onloadedmetadata = () => done([id, a.duration]);
    a.onerror = () => done([id, NaN]);
  }))).then(Object.fromEntries)`);

  console.log(`\nthe whole film, ${INTRO_MS / 1000} s`);
  await page.evaluate(`${DRIVE}({})`);
  const shotStarts = SHOT_MS.map((_, i) => SHOT_MS.slice(0, i).reduce((a, b) => a + b, 0));
  const grabs = [];
  for (let i = 0; i < SHOT_MS.length; i += 1) {
    for (const f of [0.2, 0.5, 0.8]) {
      grabs.push({ shot: i, at: shotStarts[i] + SHOT_MS[i] * f, name: `shot${i + 1}-${Math.round(f * 100)}` });
    }
  }
  for (const g of grabs) {
    await page.until(`window.__intro2030.h.state().t >= ${g.at}`, 120000);
    await page.evaluate('window.__intro2030.capturing = true');
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, page.sessionId);
    await page.evaluate('requestAnimationFrame(() => requestAnimationFrame(() => { window.__intro2030.capturing = false; }))');
    await writeFile(join(outDir, `${g.name}.jpg`), Buffer.from(data, 'base64'));
  }
  await page.until('window.__intro2030.h.state().done', 120000);
  report = await page.evaluate('({ R: window.__intro2030.R, s: window.__intro2030.h.state() })');
  await page.evaluate('(window.__intro2030.h.dispose(), window.__intro2030.h = null, window.__setCam(null), "")');
  const bedAfter = await page.evaluate('window.__audio.warRadio ? window.__audio.warRadio.track : null');

  const { R, s } = report;
  const shot = (i) => R.shots[i] || {
    frames: 0, drawn: {}, cast: [], titles: [], subs: [], calls: 0,
  };
  console.log('\nper shot: frames, most attackers drawn, the cast, most draw calls');
  for (let i = 0; i < SHOT_MS.length; i += 1) {
    const x = shot(i);
    console.log(`  shot ${i + 1}: ${x.frames} frames, ${JSON.stringify(x.drawn)}, [${x.cast.join(' ')}], ${x.calls} calls`);
  }
  console.log('');
  row('every shot is drawn', SHOT_MS.every((_, i) => shot(i).frames >= 30), SHOT_MS.map((_, i) => shot(i).frames).join(' '));
  row('shot 1: the title "2030"', shot(0).titles.includes('2030'), shot(0).titles.join(' | '));
  row('shot 2: one Striker, then ten, over the water', shot(1).drawn.strike >= 11, `${shot(1).drawn.strike} at most at once`);
  row('shot 3: the counter reaches 14 000 MW', /14\s?000 MW/.test(shot(2).counter || ''), shot(2).counter || 'none');
  const LINE = ['p51', 'cub', 'q1', 'q2', 'q3', 'sky', 'f16', 'timber'];
  row('shot 4: the line of eight aircraft on the crest', LINE.every((n) => shot(3).cast.includes(n)), shot(3).cast.join(' '));
  row('shot 5: the spin up cuts: a quad, the Skyhunter thrown, the float plane, the F-16', ['q2s', 'skys', 'float', 'f16'].every((n) => shot(4).cast.includes(n)), shot(4).cast.join(' '));
  row('shot 6: the wave (Strikers, FPVs, Loiterers) and six defenders rising', shot(5).drawn.strike >= 10 && shot(5).drawn.fpv >= 8 && shot(5).drawn.loiter >= 3
    && ['q4', 'q5', 'q6', 'q7', 'p51', 'zagi'].every((n) => shot(5).cast.includes(n)), `${JSON.stringify(shot(5).drawn)} [${shot(5).cast.join(' ')}]`);
  row('shot 6: the card "DEFEND ITAIPU / Mission 1"', shot(5).titles.includes('DEFEND ITAIPU'), shot(5).titles.join(' | '));
  row('no other shot draws an attacker', [0, 2, 3, 4].every((i) => Object.values(shot(i).drawn).every((n) => n === 0)));

  const subs = lines.map((l, i) => shot(i).subs.includes(l.en));
  row('every voice line is subtitled in its shot, in English as lines.json has it', subs.every(Boolean), subs.map((x, i) => `${i + 1}:${x ? 'y' : 'n'}`).join(' '));
  const lens = lines.map((l) => [l.id, durations[l.id], manifest.voice[`${l.id}.en`].seconds]);
  row('every voice file is as long as the manifest measured it (the subtitles\' timing)', lens.every(([, d, m]) => Math.abs(d - m) < 0.15),
    lens.map(([id, d, m]) => `${id} ${Number(d).toFixed(2)}/${m.toFixed(2)}`).join(', '));
  const fits = lines.map((l, i) => {
    const shotDef = SHOT_MS[i];
    const longest = Math.max(manifest.voice[`${l.id}.en`].seconds, manifest.voice[`${l.id}.es`].seconds) * 1000;
    return { id: l.id, ok: longest < shotDef, longest };
  });
  row('every line, in either language, is shorter than its shot', fits.every((f) => f.ok), fits.map((f) => `${f.id} ${(f.longest / 1000).toFixed(1)} s`).join(', '));
  const heard = s.sound ? s.sound.cued : [];
  row(`the voice: all ${lines.length} lines said on the war radio, each at its cue, in the page's language, and never ${CUT}`, heard.length === lines.length
    && lines.every((l) => heard.some((x) => x.line === l.id) && s.sound.said.includes(l.id)) && !s.sound.said.includes(CUT) && s.sound.lang === 'en',
    `${heard.map((x) => `${x.line}@${(x.at / 1000).toFixed(1)}`).join(' ')}; radio ${s.sound ? `${s.sound.lang} ${s.sound.ext}` : 'none'}`);
  row('the music: the war bed\'s intro track under every shot, and the bed put back as it was after', SHOT_MS.every((_, i) => shot(i).music === 'intro')
    && bedAfter === '', `${SHOT_MS.map((_, i) => shot(i).music || '-').join(' ')}; after, '${bedAfter}'`);

  const low = R.clear.reduce((m, c) => (c[1] < m[1] ? c : m), [0, Infinity]);
  row(`the camera never goes under the ground (least clearance over ${CLEAR_M} m)`, low[1] >= CLEAR_M, `least ${low[1].toFixed(2)} m in shot ${low[0] + 1} at ${low[2]}, ${low[3]}`);
  /* The timing runs: each shot bare, then filmed, back to back. */
  console.log(`\nthe timing: each shot over the bare map, then filmed, ${(2 * INTRO_MS) / 1000} s`);
  const base = { frames: [], shots: {} };
  const timed = { frames: [], cpu: [] };
  for (let i = 0; i < SHOT_MS.length; i += 1) {
    for (const bare of [true, false]) {
      await page.evaluate(`${DRIVE}({ bare: ${bare}, startMs: ${shotStarts[i]} })`);
      await page.until(`window.__intro2030.h.state().t >= ${shotStarts[i] + SHOT_MS[i] - 40}`, SHOT_MS[i] + 60000);
      const got = await page.evaluate('window.__intro2030.R');
      await page.evaluate('(window.__intro2030.h.dispose(), window.__intro2030.h = null, "")');
      const kept = got.frames.filter((f) => f[2] === i && f[3] >= shotStarts[i] + SETTLE_MS);
      if (bare) {
        base.frames.push(...kept);
        base.shots[i] = got.shots[i];
      } else {
        timed.frames.push(...kept);
        timed.cpu.push(...got.cpu);
      }
    }
  }
  await page.evaluate('(window.__setCam(null), "")');

  const bareCalls = (i) => (base.shots[i] ? base.shots[i].calls : 0);
  const added = SHOT_MS.map((_, i) => shot(i).calls - bareCalls(i));
  row(`the film adds at most ${FILM_CALLS} draw calls to the map's view`, Math.max(...added) <= FILM_CALLS,
    `by shot ${added.join(' ')}; the film ${SHOT_MS.map((_, i) => shot(i).calls).join(' ')}, the bare map ${SHOT_MS.map((_, i) => bareCalls(i)).join(' ')}`);
  const over = SHOT_MS.map((_, i) => i).filter((i) => shot(i).calls > CALLS);
  row(`and puts no view over ${CALLS} (ITAIPU-PLAN section 13) that the map keeps under it`, over.every((i) => bareCalls(i) > CALLS),
    over.map((i) => `shot ${i + 1} ${shot(i).calls} at ${JSON.stringify(shot(i).callsAt)}, the bare map ${bareCalls(i)} at ${JSON.stringify(base.shots[i].callsAt)} (shot ms, camera x y z)`).join('; ') || 'none over');
  for (const i of over.filter((j) => bareCalls(j) > CALLS)) {
    console.log(`  NOTE  shot ${i + 1}: the map alone draws ${bareCalls(i)} calls at ${JSON.stringify(base.shots[i].callsAt)}, over its own budget; the map's to fix (scripts/itaipu-views.js judges it), not the film's`);
  }
  const times = (frames, shotNo = null) => frames.filter((f) => !f[1] && f[2] >= 0 && (shotNo == null || f[2] === shotNo)).map((f) => f[0]).sort((a, b) => a - b);
  const pct = (d, p) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : NaN);
  const drops = (d) => d.filter((x) => x > DROP_MS).length / Math.max(1, d.length);
  const film = times(timed.frames);
  const bare = times(base.frames);
  const byShot = (frames) => `${SHOT_MS.map((_, i) => pct(times(frames, i), 0.95).toFixed(1)).join(' ')}, missed by shot ${SHOT_MS.map((_, i) => (100 * drops(times(frames, i))).toFixed(0)).join(' ')} %`;
  console.log(`  info  the bare map: ${bare.length} frames, median ${pct(bare, 0.5).toFixed(1)} ms, p95 ${pct(bare, 0.95).toFixed(1)} ms, `
    + `${(100 * drops(bare)).toFixed(1)} % over ${DROP_MS} ms; p95 by shot ${byShot(base.frames)}`);
  console.log(`  info  the film:     ${film.length} frames, median ${pct(film, 0.5).toFixed(1)} ms, p95 ${pct(film, 0.95).toFixed(1)} ms, `
    + `${(100 * drops(film)).toFixed(1)} % over ${DROP_MS} ms, max ${pct(film, 1).toFixed(1)} ms; p95 by shot ${byShot(timed.frames)}`);
  const cpu = [...timed.cpu].sort((a, b) => a - b);
  console.log(`  info  the film's own frame(), main thread: median ${pct(cpu, 0.5).toFixed(2)} ms, p95 ${pct(cpu, 0.95).toFixed(2)} ms, max ${pct(cpu, 1).toFixed(1)} ms`);
  row(`frame time holds: the film misses at most ${DROP_SLACK * 100} points more vsyncs than the bare map on the same path`, drops(film) <= drops(bare) + DROP_SLACK,
    `${(100 * drops(film)).toFixed(1)} % against ${(100 * drops(bare)).toFixed(1)} %`);

  console.log('\nskipping');
  await page.evaluate(`${DRIVE}({ startMs: 12000 })`);
  await page.until('window.__intro2030.h.state().shot === 1', 20000);
  await page.tap('Space');
  await page.until('window.__intro2030.h.state().done', 5000).catch(() => {});
  const sk = await page.evaluate('window.__intro2030.h.state()');
  row('a key skips it, and with no briefing to wait for it is over at once', sk.skipped && sk.done);
  await page.evaluate('(window.__intro2030.h.dispose(), "")');
  await page.evaluate(`${DRIVE}({ holdUntilMs: performance.now() + 4000 })`);
  await page.sleep(600);
  await page.tap('Space');
  await page.until('window.__intro2030.h.state().orbit', 5000);
  await page.sleep(300);
  const orb = await page.evaluate('window.__intro2030.h.state()');
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, page.sessionId);
  await writeFile(join(outDir, 'briefing-orbit.jpg'), Buffer.from(data, 'base64'));
  row('skipped in a room\'s briefing: the dam\'s orbit and the time left', orb.orbit && !orb.done && /^Briefing: [1-4] s$/.test(orb.hold || ''), orb.hold || 'none');
  await page.until('window.__intro2030.h.state().done', 8000);
  row('and over when the briefing is', true);
  await page.evaluate('(window.__intro2030.h.dispose(), window.__intro2030.h = null, window.__setCam(null), "")');
  const left = await page.evaluate(`({
    overlay: document.querySelectorAll('[data-war-intro]').length,
    scenery: Boolean(window.__mapScene().getObjectByName('war-intro')),
    filter: document.getElementById('view').style.filter,
  })`);
  row('dispose leaves no overlay, no scenery, and the canvas as it was', left.overlay === 0 && !left.scenery && left.filter === '', JSON.stringify(left));

  console.log('\nin the game, through src/main.js');
  await page.until('window.__shellReady === true', 60000);
  const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 1;
  const look = `({ i: window.__warIntro(), cam: window.__camGround(), hidden: document.body.classList.contains('war-intro'),
    ui: getComputedStyle(document.getElementById('ui')).visibility, bed: window.__audio.warRadio ? window.__audio.warRadio.track : '' })`;
  await page.evaluate('(window.__warIntroWatch(), "")');
  await page.until('window.__warIntro() && window.__warIntro().shot >= 0', 10000);
  const cam0 = await page.evaluate('window.__camGround()');
  await page.sleep(1500);
  const w1 = await page.evaluate(look);
  row('Watch intro plays it on the shell\'s own camera, the shell\'s screens hidden, the war bed\'s intro under it', Boolean(w1.i) && w1.i.for === 'watch' && w1.i.t > 1000
    && moved(cam0, w1.cam) && w1.hidden && w1.ui === 'hidden' && w1.bed === 'intro', JSON.stringify({ t: w1.i && Math.round(w1.i.t), hidden: w1.hidden, ui: w1.ui, bed: w1.bed }));
  await page.tap('Space');
  await page.until('window.__warIntro() === null', 5000).catch(() => {});
  const w2 = await page.evaluate(look);
  row('a key ends it: the screens back and the bed as it was', !w2.i && !w2.hidden && w2.ui !== 'hidden' && w2.bed === '', JSON.stringify({ i: Boolean(w2.i), hidden: w2.hidden, ui: w2.ui, bed: w2.bed }));

  const code = await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await page.evaluate("window.__warDo('brief')");
  await page.until("window.__war().view.state === 'briefing'", 10000);
  await page.until('window.__warIntro() && window.__warIntro().t > 2500', 15000);
  const b1 = await page.evaluate(`({ w: window.__war().view, i: window.__warIntro(), room: window.__rooms().roomNow, bed: window.__audio.warRadio ? window.__audio.warRadio.track : '' })`);
  row(`the host's start with the intro: room ${code} briefs for INTRO_MS before its countdown, and the film plays from where the room is in it`,
    b1.w.goAt === b1.w.briefAt + INTRO_MS + COUNTDOWN_MS && b1.i.for === b1.w.id && Math.abs(b1.i.t - (b1.room - b1.w.briefAt)) < 500 && b1.bed === 'intro',
    `briefAt ${b1.w.briefAt}, goAt ${b1.w.goAt}; film at ${Math.round(b1.i.t)} ms, room at ${Math.round(b1.room - b1.w.briefAt)} ms into it; bed ${b1.bed}`);
  await page.tap('Space');
  await page.until("window.__war().view.state === 'countdown'", 10000).catch(() => {});
  await page.until('window.__warIntro() === null', 5000).catch(() => {});
  const b2 = await page.evaluate(`({ w: window.__war().view, i: window.__warIntro(), room: window.__rooms().roomNow, bed: window.__audio.warRadio ? window.__audio.warRadio.track : '' })`);
  row('the host\'s key ends the briefing for the room: it counts down at once, the film is gone, the music plays on', b2.w.state === 'countdown'
    && b2.w.goAt - b2.room <= COUNTDOWN_MS && b2.w.goAt - b2.room > COUNTDOWN_MS - 3000 && !b2.i && b2.bed === 'intro',
    `${b2.w.state}, go in ${Math.round(b2.w.goAt - b2.room)} ms, bed ${b2.bed}`);
  await page.evaluate("window.__warDo('end')");

  row('no console errors', page.errors.length === 0, page.errors.slice(0, 5).join(' | ') || 'none');
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await page.close();
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
