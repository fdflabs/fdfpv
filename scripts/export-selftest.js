/*
 * export-selftest.js: the movie export's pieces that run without a browser.
 *
 * 1. The bitrate table, and the codec levels: 1080p60 claims the H.264
 *    and VP9 levels that hold it.
 * 2. The codec choice given what a browser encodes: this box's Chromium as
 *    measured (H.264, VP9, VP8, Opus; no AAC), one with AAC, one without
 *    H.264, one with no audio encoder, one with nothing.
 * 3. The frame schedule, for the plans of durations 0.05 s to the 120 s
 *    cap at 30 and 60 fps, against an encoder whose queue fills and drains
 *    at random: every frame once, in order, no gaps and no repeats; a hold
 *    only while the queue is over its bound; asking twice before a capture
 *    gives the same frame; a capture nobody asked for is refused.
 * 4. The job refuses a movie over the 120 s cap, and a plan at another
 *    rate, before it touches a browser API.
 * 5. The soundtrack's cues: a clip's crash cues and its paper's SCHWINGs
 *    and coins, through an edit of three shots at 1x, 0.25x and 2x
 *    (edit.js), at their movie times, levels scaled by a slow shot; those
 *    outside In to Out, and events that make no sound, left out.
 * 6. tests/lib/moviefile.js against movies written by the two muxers the
 *    page loads, fetched from the exact jsDelivr URLs in index.html's
 *    import map and checked against their pinned SHA-256: frames, their
 *    timestamps, the frame size and the audio track, MP4 and WebM.
 *
 * Run: npm run export:selftest
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
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bitrate, videoCodecs, chooseCodecs, createSchedule, createExportJob, ExportError, QUEUE_MAX,
} from '../src/replay/export.js';
import { soundCues } from '../src/replay/soundtrack.js';
import {
  MOVIE_MAX_S, cut, defaultEdit, planMovie, setCam, setIn, setOut, setSpeed,
} from '../src/replay/edit.js';
import { defaults } from '../src/replay/cameras.js';
import { readMovie } from '../tests/lib/moviefile.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The muxers' published files, as npm packed them (the jsDelivr bytes are
 * the tarball's; its .min.mjs is minified on request, not published). */
const PINNED = {
  'mp4-muxer': {
    url: 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.mjs',
    sha256: 'd2c4c782f180c86ed30b1f5d9487a34a0d370bf9b4535285734ea187d38f9bb5',
  },
  'webm-muxer': {
    url: 'https://cdn.jsdelivr.net/npm/webm-muxer@5.1.4/build/webm-muxer.mjs',
    sha256: '53710543cecc4db7b6cd23fb0d9b308aa3374697f43a6149a8497f0a8547f0cb',
  },
};
/* The cache tests/lib/page.js keeps for the page's CDN files, so a check
 * run after this one fetches nothing. */
const CACHE = process.env.SIM_CDN_CACHE || join(tmpdir(), 'fdfpv-cdn');

/* Frame i's timestamp, microseconds, as a movie file must hold it. */
const stamp = (i, fps) => Math.round((i * 1e6) / fps);

let failures = 0;
function check(ok, what, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
}

/* A small seeded generator, so a failure repeats. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tables() {
  console.log('1. bitrates and levels');
  const b = [[1080, 60], [1080, 30], [720, 60], [720, 30]].map(([s, f]) => bitrate(s, f) / 1e6);
  check(b.join() === '10,6,6,4', 'bitrate 1080p60 10, 1080p30 6, 720p60 6, 720p30 4 Mbit/s', b.join(', '));
  const big = videoCodecs('mp4', 1080, 60).map((c) => c.codec);
  const small = videoCodecs('mp4', 720, 60).map((c) => c.codec);
  check(big[0] === 'avc1.64002a' && big[1] === 'vp09.00.41.08', '1080p60 claims H.264 High 4.2 and VP9 4.1', big.join(', '));
  check(small[0] === 'avc1.640028' && small[1] === 'vp09.00.40.08', 'below that, H.264 High 4.0 and VP9 4.0', small.join(', '));
  check(videoCodecs('webm', 720, 30).map((c) => c.mux).join() === 'V_VP9,V_VP8', 'WebM is VP9, else VP8');
}

async function choice() {
  console.log('2. codec choice');
  const table = (codecs) => async (kind, codec) => codecs.includes(codec);
  const linux = ['avc1.640028', 'avc1.64002a', 'vp09.00.40.08', 'vp09.00.41.08', 'vp8', 'opus'];
  const cases = [
    ['Chromium on Linux, measured', linux, 'mp4', 'avc1.64002a opus', 'webm', 'vp09.00.41.08 opus'],
    ['with AAC', [...linux, 'mp4a.40.2'], 'mp4', 'avc1.64002a mp4a.40.2', 'webm', 'vp09.00.41.08 opus'],
    ['no H.264', ['vp09.00.41.08', 'vp8', 'opus'], 'mp4', 'vp09.00.41.08 opus', 'webm', 'vp09.00.41.08 opus'],
    ['VP8 only, no audio encoder', ['vp8'], 'mp4', '- -', 'webm', 'vp8 -'],
    ['nothing', [], 'mp4', '- -', 'webm', '- -'],
  ];
  for (const [name, codecs, fa, wa, fb, wb] of cases) {
    const got = [];
    for (const f of [fa, fb]) {
      const c = await chooseCodecs(f, 1080, 60, table(codecs));
      got.push(`${c.video ? c.video.codec : '-'} ${c.audio ? c.audio.codec : '-'}`);
    }
    check(got[0] === wa && got[1] === wb, `${name}: MP4 ${wa}, WebM ${wb}`, got.join(' / '));
  }
}

function schedule() {
  console.log('3. the frame schedule');
  const next = rng(7);
  let plans = 0;
  let bad = [];
  let holds = 0;
  let wrongHolds = 0;
  for (const fps of [30, 60]) {
    for (const dur of [0.05, 0.1, 1 / 3, 1, 2.5, 10, 33.3, 60, 119.99, MOVIE_MAX_S]) {
      const n = Math.max(1, Math.round(dur * fps));
      const s = createSchedule(n);
      let queue = 0;
      const got = [];
      for (let guard = 0; guard < n * 20 + 100; guard += 1) {
        queue = Math.max(0, queue + Math.floor(next() * 4) - 2);
        const i = s.next(queue);
        if (i === null) {
          break;
        }
        if (i === -1) {
          holds += 1;
          if (queue <= QUEUE_MAX) {
            wrongHolds += 1;
          }
          continue;
        }
        /* Some iterations draw nothing, and ask again. */
        if (next() < 0.2 && s.next(queue) !== i && queue <= QUEUE_MAX) {
          bad.push(`${n}: a second ask moved`);
        }
        if (next() < 0.2) {
          continue;
        }
        if (s.next(queue) !== i) {
          continue;
        }
        got.push(s.captured());
        queue += 1;
      }
      plans += 1;
      if (got.length !== n || got.some((x, k) => x !== k) || s.next(0) !== null) {
        bad.push(`${dur} s at ${fps}: ${got.length} of ${n}`);
      }
    }
  }
  check(bad.length === 0, `${plans} plans: every frame captured once, in order, then null`, bad.slice(0, 3).join('; ') || `${holds} holds`);
  check(holds > 0 && wrongHolds === 0, `a hold only while more than ${QUEUE_MAX} frames are queued`, `${holds} holds, ${wrongHolds} wrong`);
  const s = createSchedule(3);
  let refused = '';
  try {
    s.captured();
  } catch (e) {
    refused = e instanceof ExportError ? e.message : `wrong error ${e}`;
  }
  check(Boolean(refused), 'a capture nobody asked for is refused', refused);
}

async function refusals() {
  console.log('4. refusals before any browser API');
  const plan = (n, fps) => ({
    n, fps, clipT: new Float64Array(n), shot: new Int16Array(n), step: new Float64Array(n).fill(1 / fps),
    us: new Float64Array(n + 1).map((x, i) => stamp(i, fps)),
  });
  const tryJob = async (p, fps) => {
    try {
      await createExportJob({
        clip: { meta: { map: 'x' } }, plan: p, size: 720, fps, format: 'mp4', sound: false, audio: null, surface: null, signal: null,
      });
      return 'accepted';
    } catch (e) {
      return e instanceof ExportError ? e.message : `wrong error ${e.message}`;
    }
  };
  const over = await tryJob(plan(MOVIE_MAX_S * 30 + 1, 30), 30);
  check(/longer than 120 s/.test(over), `a movie a frame over ${MOVIE_MAX_S} s is refused`, over);
  const rate = await tryJob(plan(30, 60), 30);
  check(/not 30/.test(rate), 'a plan at another rate is refused', rate);
}

function sound() {
  console.log('5. the soundtrack cues');
  const cam = (rig) => ({ rig, target: -1, watch: 0, p: defaults(rig, 1) });
  /* Clip 2 s to 8 s: 2..4 at 1x (2 s), 4..5 at 0.25x (4 s), 5..8 at 2x (1.5 s). */
  let edit = setOut(setIn(defaultEdit(10, cam('chase')), 2), 8);
  edit = cut(cut(edit, 4), 5);
  edit = setSpeed(setCam(edit, 1, cam('orbit')), 1, 0.25);
  edit = setSpeed(setCam(edit, 2, cam('follow')), 2, 2);
  const plan = planMovie(edit, 60);
  check(plan.n === 450, 'the edit is a 7.5 s movie', `${plan.n} frames at 60`);
  const clip = {
    events: [
      { t: 1, type: 'cue', kind: 'snap', level: 1 },
      { t: 3, type: 'cue', kind: 'snap', level: 0.8 },
      { t: 4.5, type: 'cue', kind: 'crunch', level: 1 },
      { t: 6, type: 'debris' },
      { t: 6.5, type: 'off', part: 3 },
      { t: 9, type: 'cue', kind: 'splash', level: 1 },
    ],
    paper: {
      events: [{ t: 4.25, type: 'schwing', level: 1 }, { t: 7, type: 'schwing', level: 0.5 }, { t: 5.5, type: 'cut' },
        { t: 6, type: 'crown', p: [0, 0, 0], from: null, level: 1 }, { t: 6, type: 'coin', level: 0.4 }],
    },
  };
  const got = soundCues(clip, edit).map((c) => `${c.type} ${c.kind || ''} ${c.m.toFixed(3)} ${c.level.toFixed(3)}`).join(', ');
  const exp = 'cue snap 1.000 0.800, schwing  3.000 0.250, cue crunch 4.000 0.250, coin  6.500 0.400, schwing  7.000 0.500';
  check(got === exp, 'cues, SCHWINGs and Catch the Ace coins at their movie times, a slow shot\'s quieter, the rest left out', got);
  const bare = soundCues({ events: clip.events }, edit).map((c) => c.type).join();
  check(bare === 'cue,cue', 'a clip with no paper plays its cues', bare);
}

async function cdn(url) {
  await mkdir(CACHE, { recursive: true });
  const path = join(CACHE, createHash('sha256').update(url).digest('hex').slice(0, 32));
  if (existsSync(path)) {
    return readFile(path);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  return buf;
}

async function muxers() {
  console.log('6. moviefile.js against the pinned muxers');
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const libs = {};
  for (const [name, pin] of Object.entries(PINNED)) {
    check(map[name] === pin.url, `index.html maps ${name} to ${pin.url}`, map[name] || 'missing');
    const bytes = await cdn(pin.url);
    const sha = createHash('sha256').update(bytes).digest('hex');
    check(sha === pin.sha256, `${name} is the pinned file`, `${bytes.length} bytes, sha256 ${sha.slice(0, 16)}`);
    libs[name] = await import(`data:text/javascript;base64,${bytes.toString('base64')}`);
  }
  const fps = 30;
  const n = 97;
  const audioN = Math.ceil((n / fps) / 0.02);
  const opus = { decoderConfig: { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, description: new Uint8Array(19) } };
  const avcC = new Uint8Array([1, 100, 0, 40, 255, 225, 0, 0, 1, 0, 0]);
  for (const format of ['mp4', 'webm']) {
    const lib = libs[`${format}-muxer`];
    const out = [];
    let written = 0;
    let appendOnly = true;
    const muxer = new lib.Muxer({
      target: new lib.StreamTarget({
        onData: (d, p) => {
          appendOnly = appendOnly && p === written;
          written += d.byteLength;
          out.push(d.slice());
        },
      }),
      video: { codec: format === 'mp4' ? 'avc' : 'V_VP9', width: 1280, height: 720, frameRate: fps },
      audio: { codec: format === 'mp4' ? 'opus' : 'A_OPUS', numberOfChannels: 2, sampleRate: 48000 },
      ...(format === 'mp4' ? { fastStart: 'fragmented' } : { streaming: true }),
    });
    for (let k = 0; k < audioN; k += 1) {
      if (format === 'mp4') {
        muxer.addAudioChunkRaw(new Uint8Array(12), 'key', k * 20000, 20000, k === 0 ? opus : undefined);
      } else {
        muxer.addAudioChunkRaw(new Uint8Array(12), 'key', k * 20000, k === 0 ? opus : undefined);
      }
    }
    for (let i = 0; i < n; i += 1) {
      const type = i % (2 * fps) === 0 ? 'key' : 'delta';
      const data = new Uint8Array(40 + (i % 7));
      if (format === 'mp4') {
        const meta = i === 0 ? { decoderConfig: { codec: 'avc1.640028', codedWidth: 1280, codedHeight: 720, description: avcC } } : undefined;
        muxer.addVideoChunkRaw(data, type, stamp(i, fps), stamp(i + 1, fps) - stamp(i, fps), meta);
      } else {
        muxer.addVideoChunkRaw(data, type, stamp(i, fps));
      }
    }
    muxer.finalize();
    const file = new Uint8Array(written);
    let o = 0;
    for (const d of out) {
      file.set(d, o);
      o += d.byteLength;
    }
    const movie = readMovie(file);
    const video = movie.tracks.find((t) => t.kind === 'video');
    const audio = movie.tracks.find((t) => t.kind === 'audio');
    /* WebM keeps milliseconds: a timestamp is the microsecond one floored. */
    const want = (i) => (format === 'webm' ? Math.floor(stamp(i, fps) / 1000) * 1000 : stamp(i, fps));
    const off = video ? video.pts.findIndex((p, i) => p !== want(i)) : -2;
    check(appendOnly, `${format}: the muxer only appends`, `${written} bytes in ${out.length} writes`);
    check(movie.container === format && video && video.frames === n && off === -1 && video.width === 1280 && video.height === 720,
      `${format}: ${n} video frames read back at their timestamps, 1280 x 720`,
      video ? `${video.frames} frames ${video.codec} ${video.width} x ${video.height}${off >= 0 ? `, frame ${off} at ${video.pts[off]} us` : ''}` : 'no video track');
    check(audio && audio.frames === audioN && audio.pts[audioN - 1] === (audioN - 1) * 20000,
      `${format}: the audio track, ${audioN} chunks of 20 ms`, audio ? `${audio.frames} ${audio.codec}` : 'no audio track');
  }
}

tables();
await choice();
schedule();
await refusals();
sound();
await muxers();

if (failures) {
  console.log(`export:selftest FAILED (${failures})`);
  process.exit(1);
}
console.log('export:selftest ok');
