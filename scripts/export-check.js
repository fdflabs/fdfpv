/*
 * export-check.js: movies exported from a real replay, read back frame by
 * frame.
 *
 * In headless Chromium, on the Swiss valley, a Skyhunter thrown four
 * times to fill the replay's half minute, then a fifth time, its right
 * wing broken off in the air and flown on into the ground. V opens the
 * replay, and the edit is made through the crash cam's own api: three
 * shots, Chase, an Orbit at 0.25x blending in round the wing leaving, a
 * Follow of the wing. Every export is the api's exportMovie, driven by
 * the crash cam's frame loop and edit clock (src/replay/crashcam.js), as
 * the dialog's Export is:
 *
 *  1. 720p30 MP4 and WebM, sound on: the file holds exactly plan.n video
 *     frames at round(i * 1e6 / 30) microseconds (WebM keeps whole
 *     milliseconds of them), 1280 x 720, and an audio track about as long
 *     as the movie. The picture is not black.
 *  2. The same MP4 count and timestamps with the CPU throttled four times,
 *     and again with an 80 ms busy wait in every frame.
 *  3. With WebCodecs hidden, the real time recorder: a WebM of about the
 *     movie's frames (it can drop some, and says so), with the live mix.
 *  4. Cancelled midway through a 1080p60 export: no file, and the canvas
 *     is back at its own size.
 *  5. No page errors.
 *
 * With --movie=<dir>, also the owner's movie: the whole clip, six shots
 * (Chase, an Orbit blending in, a Follow of the wing at 0.25x, Chase,
 * Onboard at 0.25x into the crash, an Orbit blending in to the end) at
 * 1080p60 MP4 with sound, written to <dir>, with the peak memory of the
 * browser's processes (their summed PSS, read from /proc) and the page's
 * JS heap while it exports.
 *
 * SIM_GPU=1 draws on this machine's GPU (tests/lib/page.js); the owner's
 * movie is meant to be made that way.
 *
 * Run: node scripts/export-check.js [--movie=dir] [--out=dir]
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

import { copyFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { readMovie } from '../tests/lib/moviefile.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? resolve(a.slice(name.length + 3)) : null;
};
const movieDir = arg('movie');
const outDir = arg('out') || join(tmpdir(), `fdfpv-export-check-${process.pid}`);
mkdirSync(outDir, { recursive: true });
if (movieDir) {
  mkdirSync(movieDir, { recursive: true });
}

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const load = () => execFileSync('uptime').toString().trim().replace(/^.*load/, 'load');

const AIRFRAME = 'sky1800';
function seed() {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, AIRFRAME),
    airframeAsked: true,
    map: 'swiss2',
    /* The GPU draws the owner's movie as a pilot sees it; the software
     * rasteriser draws the cheapest picture that still has every pass. */
    graphics: process.env.SIM_GPU === '1' ? 'high' : 'low',
    graphicsAuto: false,
    crashDamage: true,
    sound: true,
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

const WAIT = 120000;
const simT = (page) => page.evaluate('window.__crash().simT');
async function afterSteps(page, ms) {
  const t0 = await simT(page);
  await page.until(`window.__crash().simT >= ${t0 + ms / 1000}`, WAIT);
}
async function frames(page, n) {
  const f0 = await page.evaluate('window.__boot().frames');
  await page.until(`window.__boot().frames >= ${f0 + n}`, WAIT);
}

/*
 * The page side, installed as source. __buildEdit makes the edit through
 * the crash cam's own api, as the pilot's keys do (a cut at the playhead,
 * the shot's camera, its speed, how it starts). __exportRun calls the
 * api's exportMovie, which runs the export from the crash cam's frame
 * loop, and watches it from a requestAnimationFrame callback that runs
 * after the shell's each frame: the canvas size, a few pictures' mean
 * brightness, the page's heap, and on request a busy wait or a cancel.
 */
function pageDriver() {
  window.__buildEdit = (shots, out) => {
    const h = window.__crashCam.h();
    const { api } = h;
    while (h.edit().shots.length > 1) {
      api.removeCut(h.edit().shots.length - 1);
    }
    api.setEdge('in', 0);
    api.setEdge('out', out);
    api.setEdge('in', shots[0].t0);
    shots.forEach((s, k) => {
      api.jumpTo(s.t0);
      if (k > 0) {
        api.cut();
      }
      if (s.rig === 'follow') {
        api.follow(s.target);
      } else {
        api.setRig(s.rig);
      }
      api.setSpeed(s.speed);
      if (s.enter) {
        api.setEnter(k, s.enter);
      }
    });
    const e = h.edit();
    return e.shots.map((x) => `${x.cam.rig}${x.speed !== 1 ? ` ${x.speed}x` : ''} from ${x.t0.toFixed(2)} s`
      + `${x.enter.type !== 'cut' ? ` (${x.enter.type}${x.enter.d ? ` ${x.enter.d} s` : ''})` : ''}`).join(', ');
  };

  window.__exportRun = async (o) => {
    const store = await import('/src/replay/store.js');
    const h = window.__crashCam.h();
    const { api } = h;
    const canvas = document.getElementById('view');
    const before = [canvas.width, canvas.height];
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 18;
    const g = probe.getContext('2d', { willReadFrequently: true });
    const lumaOf = () => {
      g.drawImage(canvas, 0, 0, 32, 18);
      const d = g.getImageData(0, 0, 32, 18).data;
      let sum = 0;
      for (let k = 0; k < d.length; k += 4) {
        sum += d[k] + d[k + 1] + d[k + 2];
      }
      return sum / ((d.length / 4) * 3);
    };
    const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    let peakHeap = heap0;
    const sizes = new Set();
    const luma = [];
    let last = null;
    let watching = true;
    let cancelled = false;
    const watch = () => {
      if (!watching) {
        return;
      }
      const x = h.view().exporting;
      if (x) {
        last = x;
        sizes.add(`${canvas.width}x${canvas.height}`);
        const at = [1, x.total >> 1, x.total - 2];
        if (luma.length < at.length && x.done >= at[luma.length]) {
          luma.push(lumaOf());
        }
        if (o.busyMs) {
          const until = performance.now() + o.busyMs;
          while (performance.now() < until) { /* The slow machine. */ }
        }
        if (o.cancelAt && x.done >= o.cancelAt && !cancelled) {
          cancelled = true;
          api.cancelExport();
        }
      }
      if (performance.memory) {
        peakHeap = Math.max(peakHeap, performance.memory.usedJSHeapSize);
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    /* A browser without WebCodecs, for the real time recorder: hidden
     * until the job has been made. */
    const encoder = window.VideoEncoder;
    if (o.hideWebCodecs) {
      window.VideoEncoder = undefined;
    }
    const t0 = performance.now();
    let settled = false;
    const run = api.exportMovie({
      size: o.size, fps: o.fps, format: o.format, sound: o.sound,
    }).finally(() => {
      settled = true;
    });
    while (!settled && !h.view().exporting) {
      await new Promise((r) => setTimeout(r, 5));
    }
    window.VideoEncoder = encoder;
    let res;
    try {
      res = await run;
    } finally {
      watching = false;
    }
    const wallMs = performance.now() - t0;
    if (res && o.download) {
      store.downloadBlob(res.name, res.bytes);
    }
    return {
      n: h.plan().n,
      captured: res ? h.plan().n : (last ? last.done : 0),
      realtime: Boolean(last && last.realtime),
      wallMs,
      cancelled: !res,
      name: res ? res.name : '',
      bytes: res ? res.bytes.size : 0,
      type: res ? res.bytes.type : '',
      before,
      after: [canvas.width, canvas.height],
      drawnSize: [...sizes],
      luma,
      heap0,
      peakHeap,
    };
  };
}

/* Summed proportional set size of a process and all its descendants, MB. */
function treePssMb(pid) {
  const kids = new Map();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) {
      continue;
    }
    try {
      const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      if (!kids.has(ppid)) {
        kids.set(ppid, []);
      }
      kids.get(ppid).push(Number(d));
    } catch (e) {
      /* The process ended between the listing and the read. */
    }
  }
  let kb = 0;
  const todo = [pid];
  while (todo.length) {
    const p = todo.pop();
    try {
      const m = readFileSync(`/proc/${p}/smaps_rollup`, 'utf8').match(/^Pss:\s+(\d+) kB/m);
      kb += m ? Number(m[1]) : 0;
    } catch (e) {
      /* Gone, or not ours to read. */
    }
    todo.push(...(kids.get(p) || []));
  }
  return kb / 1024;
}

/* Downloads land in outDir under a GUID; this waits for the next one to
 * complete and names it. */
function downloads(page) {
  const waiting = [];
  const begun = new Map();
  page.cdp.onEvent((msg) => {
    if (msg.method === 'Browser.downloadWillBegin') {
      begun.set(msg.params.guid, msg.params.suggestedFilename);
    } else if (msg.method === 'Browser.downloadProgress' && msg.params.state === 'completed') {
      const w = waiting.shift();
      if (w) {
        w({ guid: msg.params.guid, name: begun.get(msg.params.guid) });
      }
    }
  });
  let count = 0;
  return {
    next: () => new Promise((r) => {
      waiting.push((d) => {
        count += 1;
        r(d);
      });
    }),
    get count() {
      return count;
    },
    get begun() {
      return begun.size;
    },
  };
}

function verify(label, file, run, fps, w, h) {
  const movie = readMovie(readFileSync(file));
  const video = movie.tracks.find((t) => t.kind === 'video');
  const audio = movie.tracks.find((t) => t.kind === 'audio');
  const webm = movie.container === 'webm';
  const us = (i) => Math.round((i * 1e6) / fps);
  const want = (i) => (webm ? Math.floor(us(i) / 1000) * 1000 : us(i));
  const off = video ? video.pts.findIndex((p, i) => p !== want(i)) : -2;
  check(`${label}: exactly ${run.n} video frames at their timestamps, ${w} x ${h}`,
    video && video.frames === run.n && off === -1 && video.width === w && video.height === h,
    video ? `${video.frames} frames ${video.codec} ${video.width} x ${video.height}${off >= 0 ? `, frame ${off} at ${video.pts[off]} us, want ${want(off)}` : ''}` : 'no video');
  const dur = run.n / fps;
  check(`${label}: an audio track about the movie's length`, audio && Math.abs(audio.duration - dur) < 0.05,
    audio ? `${audio.codec} ${audio.frames} chunks, ${audio.duration.toFixed(3)} s against ${dur.toFixed(3)} s` : 'no audio');
  return movie;
}

async function main() {
  console.log(`movie export, on the real page (${process.env.SIM_GPU === '1' ? 'GPU' : 'SwiftShader'}; ${load()})`);
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?map=swiss2', seed: seed() });
  try {
    await page.cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: outDir, eventsEnabled: true });
    const dl = downloads(page);
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__crashCam && window.__boot', 180000);
    await frames(page, 3);
    /* A key press is the pilot's gesture that starts the sound. */
    await page.tap('ShiftLeft');

    console.log('0. a flight, a wing off, a crash, the replay');
    await page.evaluate('window.__drawOff(true)');
    const pad = await page.evaluate('(() => { const s = window.__craftState(); return { x: s.worldX, z: s.worldZ, g: s.worldY - s.groundClearance }; })()');
    /* Four hands off throws first, so the replay's half minute window is
     * full: a long flight on a stick script finds the valley's walls. */
    for (let k = 0; k < 4; k += 1) {
      await page.evaluate('window.__stick(0, 0, 0, 0.7)');
      await page.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 40}, z: ${pad.z}, yaw: ${60 * k}, pitch: 0, vx: 0, vy: 0, vz: -16, showCraft: false })`);
      await afterSteps(page, 7000);
    }
    /* The one the movie is about: thrown at 60 m, the right wing broken
     * off in the air, flown on with the sticks, into the grass (the throw
     * of scripts/crashcam-e2e.js). */
    await page.evaluate('window.__stick(0, 0, 0, 0.7)');
    const thrown = await page.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 60}, z: ${pad.z}, yaw: 30, pitch: 0, vx: -9, vy: 0, vz: -15.6, showCraft: false }).ok`);
    await afterSteps(page, 1500);
    const wing = await page.evaluate("window.__crash().partLabels.findIndex((l) => l === 'wing right')");
    const broke = await page.evaluate(`window.__crashBreak(${wing})`);
    await page.evaluate('window.__stick(-0.6, -0.2, 0, 0.8)');
    await afterSteps(page, 1500);
    await page.evaluate('window.__stick(-0.3, 0.3, 0, 0.4)');
    await page.until('window.__crash().wrecked || window.__craftState().landed', WAIT);
    await afterSteps(page, 2500);
    await page.evaluate('window.__drawOff(false)');
    await frames(page, 3);
    await page.tap('KeyV');
    await page.until('window.__crashCam.live()', 10000);
    await frames(page, 3);
    const H = 'window.__crashCam.h()';
    const v = await page.evaluate(`JSON.parse(JSON.stringify(${H}.view()))`);
    const off = v.markers.findLast((m) => m.type === 'off' && m.label === 'wing right');
    /* Where it came down: the first impact after the wing left, or, when
     * it came to rest without one (landed on its belly, which is not an
     * impact), the moment the wait above began. */
    const impact = off && v.markers.find((m) => m.type === 'impact' && m.t > off.t);
    const down = impact ? impact.t : v.dur - 2.5;
    check('thrown, the wing broken off in the air, down, replayed', thrown && broke === 'OK' && off && off.t < down && v.live && v.dur > 29,
      `clip ${v.dur.toFixed(2)} s, wing off at ${off ? off.t.toFixed(2) : '-'} s, down at ${down.toFixed(2)} s${impact ? ` (impact, ${impact.kind})` : ' (came to rest)'}`);
    if (!off) {
      throw new Error('no wing marker; nothing further can be checked');
    }
    await page.evaluate(`(${pageDriver.toString()})()`);

    const built = await page.evaluate(`window.__buildEdit(${JSON.stringify([
      { t0: off.t - 1, rig: 'chase', speed: 1 },
      { t0: off.t - 0.2, rig: 'orbit', speed: 0.25, enter: { type: 'blend', d: 0.5 } },
      { t0: off.t + 0.3, rig: 'follow', target: wing, speed: 1 },
    ])}, ${off.t + 1.3})`);
    console.log(`     the edit: ${built}`);
    check('an edit of three shots, a 0.25x shot and a blend', /orbit 0\.25x .*blend 0\.5 s.*follow/.test(built), built);
    const short = { size: 720, fps: 30, sound: true, download: true };
    const exported = async (label, opts) => {
      const t = Date.now();
      const run = await page.evaluate(`window.__exportRun(${JSON.stringify(opts)})`);
      const file = run.cancelled ? null : await dl.next();
      const path = file ? join(outDir, `${label}.${opts.format}`) : null;
      if (file) {
        renameSync(join(outDir, file.guid), path);
      }
      console.log(`     ${label}: ${run.n} frames in ${(run.wallMs / 1000).toFixed(1)} s, ${(run.wallMs / Math.max(1, run.captured)).toFixed(1)} ms a frame,`
        + ` ${run.realtime ? 'real time' : 'offline'}, ${run.type || 'no file'} ${(run.bytes / 1048576).toFixed(2)} MB, wall ${((Date.now() - t) / 1000).toFixed(1)} s; ${load()}`);
      return { run, path };
    };

    console.log('1. 720p30, MP4 and WebM, with sound');
    for (const format of ['mp4', 'webm']) {
      const { run, path } = await exported(`720p30-${format}`, { ...short, format });
      check(`${format}: offline, the canvas drawn at the movie's size and restored after`,
        !run.realtime && !run.cancelled && run.drawnSize.join() === '1280x720'
        && run.after[0] === run.before[0] && run.after[1] === run.before[1],
        `${run.n} frames, drawn ${run.drawnSize.join(' ')}, canvas ${run.before.join('x')} then ${run.after.join('x')}`);
      check(`${format}: the picture is not black`, run.luma.length === 3 && run.luma.every((l) => l > 8), run.luma.map((l) => l.toFixed(1)).join(', '));
      verify(format, path, run, 30, 1280, 720);
    }

    console.log('2. the same frames on a slow machine');
    await page.cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }, page.sessionId);
    const slow = await exported('720p30-throttled', { ...short, format: 'mp4' });
    await page.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }, page.sessionId);
    verify('CPU throttled 4x', slow.path, slow.run, 30, 1280, 720);
    const busy = await exported('720p30-busy', { ...short, format: 'mp4', busyMs: 80 });
    verify('80 ms busy wait a frame', busy.path, busy.run, 30, 1280, 720);

    console.log('3. without WebCodecs, the real time recorder');
    const rt = await exported('720p30-realtime', { ...short, format: 'webm', hideWebCodecs: true });
    const rtMovie = readMovie(readFileSync(rt.path));
    const rtVideo = rtMovie.tracks.find((t) => t.kind === 'video');
    const rtAudio = rtMovie.tracks.find((t) => t.kind === 'audio');
    check('real time: a WebM of about the movie\'s frames, with the live mix, the canvas restored',
      rt.run.realtime && rtVideo && rtVideo.frames > rt.run.n / 2 && rtVideo.frames < rt.run.n * 1.5 && rtAudio
      && rt.run.after[0] === rt.run.before[0] && rt.run.after[1] === rt.run.before[1],
      `${rt.run.type}, ${rtVideo ? rtVideo.frames : 0} frames for a plan of ${rt.run.n}, ${rtVideo ? `${rtVideo.width} x ${rtVideo.height}` : ''}, audio ${rtAudio ? rtAudio.codec : 'none'}`);

    console.log('4. cancelled midway');
    const before = dl.begun;
    /* At 1080p, so the canvas it restores is not already the movie's size. */
    const cancelled = await exported('1080p60-cancelled', { ...short, size: 1080, fps: 60, format: 'mp4', cancelAt: 20 });
    await frames(page, 5);
    check('cancel: no file, and the canvas back at its own size', cancelled.run.cancelled && dl.begun === before
      && cancelled.run.after[0] === cancelled.run.before[0] && cancelled.run.after[1] === cancelled.run.before[1],
      `stopped after ${cancelled.run.captured} of ${cancelled.run.n}, canvas ${cancelled.run.before.join('x')} then ${cancelled.run.after.join('x')}`);

    if (movieDir) {
      console.log('5. the owner\'s movie, the whole clip at 1080p60');
      const movieShots = [
        { t0: 0, rig: 'chase', speed: 1 },
        { t0: off.t - 2, rig: 'orbit', speed: 1, enter: { type: 'blend', d: 1 } },
        { t0: off.t - 0.3, rig: 'follow', target: wing, speed: 0.25, enter: { type: 'blend', d: 0.5 } },
        { t0: off.t + 0.7, rig: 'chase', speed: 1, enter: { type: 'blend', d: 0.5 } },
        { t0: down - 0.6, rig: 'fpv', speed: 0.25 },
        { t0: down + 0.4, rig: 'orbit', speed: 1, enter: { type: 'blend', d: 1 } },
      ].filter((s, k, a) => k === 0 || s.t0 > a[k - 1].t0 + 0.05);
      const movieEdit = await page.evaluate(`window.__buildEdit(${JSON.stringify(movieShots)}, ${v.dur})`);
      const baseline = treePssMb(page.proc.pid);
      let peak = baseline;
      const sampler = setInterval(() => {
        peak = Math.max(peak, treePssMb(page.proc.pid));
      }, 250);
      let movie;
      try {
        movie = await exported('movie-1080p60', {
          size: 1080, fps: 60, format: 'mp4', sound: true, download: true,
        });
      } finally {
        clearInterval(sampler);
      }
      const final = join(movieDir, movie.run.name);
      /* Copied, not renamed: the scratch directory is often on another
       * filesystem (a tmpfs) than the movie's. */
      copyFileSync(movie.path, final);
      rmSync(movie.path);
      verify('1080p60 movie', final, movie.run, 60, 1920, 1080);
      console.log(`     ${final}`);
      console.log(`     shots: ${movieEdit}`);
      console.log(`     memory: the browser's processes ${baseline.toFixed(0)} MB before, ${peak.toFixed(0)} MB at the peak`
        + ` (+${(peak - baseline).toFixed(0)} MB); page JS heap ${(movie.run.heap0 / 1048576).toFixed(0)} MB before, ${(movie.run.peakHeap / 1048576).toFixed(0)} MB at the peak; file ${(movie.run.bytes / 1048576).toFixed(1)} MB`);
    }

    check('no page errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  } finally {
    await page.close();
    if (!arg('out')) {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
  console.log(failed ? `export:check FAILED (${failed})` : 'export:check ok');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
