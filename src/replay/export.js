/*
 * export.js: an edit, written out as a movie file.
 *
 * Offline where the browser has WebCodecs: every movie frame is drawn by
 * the shell's own frame loop (so the world is drawn one way, not two),
 * handed to a VideoEncoder, and the loop is held while the encoder's queue
 * is deep. A slow machine makes a slow export, never a movie with a frame
 * missing: the file holds exactly plan.n frames at round(i * 1e6 / fps)
 * microseconds whatever each one took. The sound is rendered first, on an
 * OfflineAudioContext (soundtrack.js), and encoded before the first frame.
 *
 * Without WebCodecs, or when the encoder refuses every codec, the same
 * frames are recorded in real time with MediaRecorder off the canvas, with
 * the live mix; that can drop frames and says so (progress.realtime).
 *
 * The container is written by one of two pinned MIT muxers from jsDelivr,
 * loaded on the first export only (index.html's import map). Their output
 * is append only (fragmented MP4, streaming WebM) and is kept as Blob
 * parts, so a long movie is never one ArrayBuffer.
 *
 * The contract with the crash cam is docs/EDITOR-PLAN.md section 4.5; the
 * crash cam's frame() asks next() for the frame to draw and its
 * afterRender() calls capture(), the one moment the canvas still holds the
 * drawn pixels (it keeps no drawing buffer).
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

import { MOVIE_MAX_S } from './edit.js';
import { renderSoundtrack, SAMPLE_RATE } from './soundtrack.js';
import { stampedName } from './store.js';

/* next() holds the loop while more frames than this wait to be encoded. */
export const QUEUE_MAX = 4;
export const SIZES = { 720: [1280, 720], 1080: [1920, 1080] };
export const FPS = [30, 60];
export const FORMATS = ['mp4', 'webm'];
const AUDIO_BITRATE = 128000;
/* Opus's own frame, 20 ms at 48 kHz. */
const AUDIO_BLOCK = 960;
/* Muxer output is gathered into Blob parts of about this many bytes. */
const PART_BYTES = 8 << 20;

export class ExportError extends Error {}

/* Bits a second: 10 M at 1080p60, 6 M at 1080p30 and 720p60, 4 M at 720p30. */
export function bitrate(size, fps) {
  if (size === 1080) {
    return fps === 60 ? 10e6 : 6e6;
  }
  return fps === 60 ? 6e6 : 4e6;
}

/*
 * The video codecs to try, best first, as { codec, mux }: codec is the
 * WebCodecs string, mux the muxer's name for it. The level is the lowest
 * that holds the size and rate: H.264 level 4.0 stops at 245 760
 * macroblocks a second and 1080p60 is 489 600, which is level 4.2; VP9
 * level 4.0 stops at 83.6 M samples a second and 1080p60 is 124.4 M,
 * level 4.1. A stream that claims a level it exceeds is refused by some
 * hardware decoders, which is to say by phones.
 */
export function videoCodecs(format, size, fps) {
  const big = size === 1080 && fps === 60;
  const avc = { codec: big ? 'avc1.64002a' : 'avc1.640028', mux: 'avc' };
  const vp9 = big ? 'vp09.00.41.08' : 'vp09.00.40.08';
  if (format === 'mp4') {
    return [avc, { codec: vp9, mux: 'vp9' }];
  }
  if (format === 'webm') {
    return [{ codec: vp9, mux: 'V_VP9' }, { codec: 'vp8', mux: 'V_VP8' }];
  }
  throw new ExportError(`no format ${format}`);
}

/* The audio codecs to try, best first: AAC where it encodes (it plays
 * everywhere an MP4 does), else Opus. */
export function audioCodecs(format) {
  if (format === 'mp4') {
    return [{ codec: 'mp4a.40.2', mux: 'aac' }, { codec: 'opus', mux: 'opus' }];
  }
  if (format === 'webm') {
    return [{ codec: 'opus', mux: 'A_OPUS' }];
  }
  throw new ExportError(`no format ${format}`);
}

/*
 * The codecs an export uses, given `can(kind, codec)`, the browser's
 * answer ('video' or 'audio'). video is null when nothing encodes, which
 * is the real time recorder's case; audio is null when the sound cannot be
 * encoded, which leaves a movie without sound rather than no movie.
 */
export async function chooseCodecs(format, size, fps, can) {
  let video = null;
  for (const c of videoCodecs(format, size, fps)) {
    if (await can('video', c.codec)) {
      video = c;
      break;
    }
  }
  let audio = null;
  for (const c of audioCodecs(format)) {
    if (await can('audio', c.codec)) {
      audio = c;
      break;
    }
  }
  return { video, audio };
}

/*
 * The offline frame schedule, apart from any encoder so it can be proved in
 * Node. next(queued) is the index of the next frame to draw, -1 to hold
 * while more than `bound` frames wait in the encoder, null after the last;
 * asking again before a capture gives the same index, so a loop iteration
 * that drew nothing costs nothing. captured() takes the frame last handed
 * out. Every index 0..total-1 is captured once, in order.
 */
export function createSchedule(total, bound = QUEUE_MAX) {
  let done = 0;
  let asked = -1;
  return {
    next(queued) {
      if (done >= total) {
        return null;
      }
      if (queued > bound) {
        asked = -1;
        return -1;
      }
      asked = done;
      return done;
    },
    captured() {
      if (asked !== done) {
        throw new ExportError(`capture without a frame asked for (asked ${asked}, next ${done})`);
      }
      asked = -1;
      done += 1;
      return done - 1;
    },
    get done() {
      return done;
    },
  };
}

/* The MediaRecorder type for a format, or '' when it records none. */
function recorderMime(format) {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  const types = format === 'mp4'
    ? ['video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function hasWebCodecs() {
  return typeof VideoEncoder === 'function' && typeof VideoFrame === 'function';
}

/* The browser's own answer for one codec at one size and rate. */
function browserCan(size, fps) {
  const [width, height] = SIZES[size];
  return async (kind, codec) => {
    try {
      if (kind === 'video') {
        const r = await VideoEncoder.isConfigSupported({
          codec, width, height, bitrate: bitrate(size, fps), framerate: fps,
        });
        return r.supported === true;
      }
      if (typeof AudioEncoder !== 'function') {
        return false;
      }
      const r = await AudioEncoder.isConfigSupported({
        codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: AUDIO_BITRATE,
      });
      return r.supported === true;
    } catch (e) {
      /* isConfigSupported throws a TypeError for a string it cannot parse
       * at all; for this question that is a no. */
      return false;
    }
  };
}

/*
 * What the export dialog can offer. `why` is a reason code, which
 * crashcam.js exportOptions() words from src/strings before the dialog
 * shows it: 'no-video' (nothing encodes this container here), 'no-audio'
 * (the sound cannot be encoded or recorded). This file stays free of the
 * page's strings so it runs in Node. Probed at the largest size and rate,
 * so an option offered works at all.
 */
export async function exportCapabilities() {
  const webcodecs = hasWebCodecs();
  const formats = [];
  let anySound = false;
  for (const id of FORMATS) {
    if (webcodecs) {
      const c = await chooseCodecs(id, 1080, 60, browserCan(1080, 60));
      if (c.video) {
        formats.push({ id, ok: true, why: '', video: c.video.mux, audio: c.audio ? c.audio.mux : '' });
        anySound = anySound || Boolean(c.audio && typeof OfflineAudioContext === 'function');
        continue;
      }
    }
    const mime = recorderMime(id);
    formats.push({ id, ok: Boolean(mime), why: mime ? '' : 'no-video', video: mime, audio: '' });
    anySound = anySound || Boolean(mime);
  }
  return {
    webcodecs,
    sizes: [720, 1080],
    fps: FPS.slice(),
    formats,
    sound: { ok: anySound, why: anySound ? '' : 'no-audio' },
  };
}

/* Append only bytes, kept as Blob parts. The muxers promise positions that
 * only grow in these modes; one that did not would be a corrupt file, so it
 * is refused loudly. */
function createSink() {
  const parts = [];
  let pending = [];
  let pendingBytes = 0;
  let written = 0;
  const seal = () => {
    if (pending.length) {
      parts.push(new Blob(pending));
      pending = [];
      pendingBytes = 0;
    }
  };
  return {
    write(data, position) {
      if (position !== written) {
        throw new ExportError(`muxer wrote at ${position}, expected ${written}`);
      }
      pending.push(data.slice());
      pendingBytes += data.byteLength;
      written += data.byteLength;
      if (pendingBytes >= PART_BYTES) {
        seal();
      }
    },
    blob(type) {
      seal();
      return new Blob(parts, { type });
    },
    get bytes() {
      return written;
    },
  };
}

const MUXERS = {
  mp4: () => import('mp4-muxer'),
  webm: () => import('webm-muxer'),
};

/* The sound as encoded chunks, in 20 ms blocks of planar float. */
async function encodeSound(buffer, codec, add) {
  let failure = null;
  const enc = new AudioEncoder({
    output: add,
    error: (e) => {
      failure = e;
    },
  });
  enc.configure({
    codec, sampleRate: buffer.sampleRate, numberOfChannels: 2, bitrate: AUDIO_BITRATE,
  });
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
  for (let o = 0; o < buffer.length && !failure; o += AUDIO_BLOCK) {
    const k = Math.min(AUDIO_BLOCK, buffer.length - o);
    const planar = new Float32Array(k * 2);
    planar.set(L.subarray(o, o + k), 0);
    planar.set(R.subarray(o, o + k), k);
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: buffer.sampleRate,
      numberOfFrames: k,
      numberOfChannels: 2,
      timestamp: Math.round((o * 1e6) / buffer.sampleRate),
      data: planar,
    });
    enc.encode(data);
    data.close();
  }
  await enc.flush();
  enc.close();
  if (failure) {
    throw failure;
  }
}

/*
 * A job for one export (docs/EDITOR-PLAN.md 4.5). `plan` is edit.js
 * planMovie(edit, fps), whose us[] are the frames' timestamps. `surface`
 * is the shell's export surface, (w, h, clock) => restore, where clock()
 * is the movie time of the frame being drawn, for the world's own motion
 * (grass, water).
 */
export async function createExportJob({
  clip, edit, plan, size, fps, format, sound, audio, surface, signal,
}) {
  if (!SIZES[size] || !FPS.includes(fps) || !FORMATS.includes(format)) {
    throw new ExportError(`no export at ${size}p${fps} ${format}`);
  }
  if (plan.fps !== fps || !(plan.n >= 1)) {
    throw new ExportError(`the plan is ${plan.n} frames at ${plan.fps} fps, not ${fps}`);
  }
  if (plan.n / fps > MOVIE_MAX_S + 1e-9) {
    throw new ExportError(`the movie is ${(plan.n / fps).toFixed(2)} s, longer than ${MOVIE_MAX_S} s`);
  }
  const base = {
    clip, edit, plan, size, fps, format, sound, audio, surface, signal,
  };
  const codecs = hasWebCodecs()
    ? await chooseCodecs(format, size, fps, browserCan(size, fps))
    : { video: null, audio: null };
  if (codecs.video) {
    return offlineJob(base, codecs);
  }
  const mime = recorderMime(format);
  if (!mime) {
    throw new ExportError(`this browser cannot write ${format}`);
  }
  return realtimeJob(base, mime);
}

async function offlineJob(o, codecs) {
  const { clip, plan, size, fps, format, surface, signal } = o;
  const [w, h] = SIZES[size];
  const total = plan.n;
  const { us } = plan;
  const lib = await MUXERS[format]();
  const sink = createSink();
  const withSound = Boolean(o.sound && codecs.audio);
  const muxer = new lib.Muxer({
    target: new lib.StreamTarget({ onData: (data, position) => sink.write(data, position) }),
    video: { codec: codecs.video.mux, width: w, height: h, frameRate: fps },
    audio: withSound ? { codec: codecs.audio.mux, numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined,
    ...(format === 'mp4' ? { fastStart: 'fragmented' } : { streaming: true }),
    firstTimestampBehavior: 'strict',
  });
  let failure = null;
  const fail = (e) => {
    failure = failure || e;
  };
  if (withSound) {
    const buffer = await renderSoundtrack({
      clip, edit: o.edit, plan, audio: o.audio,
    });
    await encodeSound(buffer, codecs.audio.codec, (chunk, meta) => {
      try {
        muxer.addAudioChunk(chunk, meta);
      } catch (e) {
        fail(e);
      }
    });
  }
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (e) {
        fail(e);
      }
    },
    error: fail,
  });
  enc.configure({
    codec: codecs.video.codec,
    width: w,
    height: h,
    bitrate: bitrate(size, fps),
    framerate: fps,
    latencyMode: 'quality',
    ...(codecs.video.mux === 'avc' ? { avc: { format: 'avc' } } : {}),
  });
  const schedule = createSchedule(total);
  let drawing = 0;
  const restore = surface(w, h, () => drawing / fps);
  const t0 = performance.now();
  let state = 'running';
  const end = () => {
    if (state === 'running') {
      state = 'ended';
      restore();
      if (enc.state !== 'closed') {
        enc.close();
      }
    }
  };
  const job = {
    realtime: false,
    codecs: { video: codecs.video.codec, audio: withSound ? codecs.audio.codec : '' },
    next() {
      if (state !== 'running' || failure) {
        return null;
      }
      const i = schedule.next(enc.encodeQueueSize);
      if (i !== null && i >= 0) {
        drawing = i;
      }
      return i;
    },
    capture(canvas) {
      if (state !== 'running' || failure) {
        return;
      }
      if (canvas.width !== w || canvas.height !== h) {
        fail(new ExportError(`the canvas is ${canvas.width} x ${canvas.height}, the movie ${w} x ${h}`));
        return;
      }
      const i = schedule.captured();
      const frame = new VideoFrame(canvas, { timestamp: us[i], duration: us[i + 1] - us[i] });
      try {
        enc.encode(frame, { keyFrame: i % (2 * fps) === 0 });
      } finally {
        frame.close();
      }
    },
    get progress() {
      const done = schedule.done;
      const per = done ? (performance.now() - t0) / 1000 / done : 0;
      return { done, total, etaS: per * (total - done), realtime: false };
    },
    async finish() {
      if (state === 'cancelled') {
        return null;
      }
      try {
        if (!failure && schedule.done < total) {
          throw new ExportError(`finished at frame ${schedule.done} of ${total}`);
        }
        if (!failure) {
          await enc.flush();
        }
        if (state === 'cancelled') {
          return null;
        }
        if (failure) {
          throw failure;
        }
        muxer.finalize();
      } finally {
        end();
      }
      const type = format === 'mp4' ? 'video/mp4' : 'video/webm';
      return { name: stampedName(clip.meta.map, `.${format}`), bytes: sink.blob(type) };
    },
    cancel() {
      if (state === 'running') {
        end();
      }
      state = 'cancelled';
    },
  };
  if (signal) {
    if (signal.aborted) {
      job.cancel();
    }
    signal.addEventListener('abort', () => job.cancel(), { once: true });
  }
  return job;
}

/*
 * The fallback. The shell draws whatever frame the wall clock says, and
 * MediaRecorder takes the canvas and the live mix as they come.
 */
function realtimeJob(o, mime) {
  const { clip, plan, fps, size, sound, audio, surface, signal } = o;
  const [w, h] = SIZES[size];
  const total = plan.n;
  let showing = 0;
  const restore = surface(w, h, () => showing / fps);
  let start = -1;
  let recorder = null;
  let stream = null;
  let tap = null;
  const chunks = [];
  let state = 'running';
  const stopped = () => new Promise((resolve) => {
    if (!recorder || recorder.state === 'inactive') {
      resolve();
      return;
    }
    recorder.addEventListener('stop', () => resolve(), { once: true });
    recorder.stop();
  });
  const end = async () => {
    await stopped();
    if (tap) {
      audio.master.disconnect(tap);
    }
    if (stream) {
      for (const tr of stream.getTracks()) {
        tr.stop();
      }
    }
    restore();
  };
  const job = {
    realtime: true,
    codecs: { video: mime, audio: '' },
    next() {
      if (state !== 'running') {
        return null;
      }
      const now = performance.now();
      if (start < 0) {
        start = now;
      }
      const i = Math.floor(((now - start) / 1000) * fps);
      if (i >= total) {
        return null;
      }
      showing = i;
      return i;
    },
    capture(canvas) {
      if (recorder || state !== 'running') {
        return;
      }
      stream = canvas.captureStream(fps);
      if (sound && audio.ctx && audio.master && typeof audio.ctx.createMediaStreamDestination === 'function') {
        tap = audio.ctx.createMediaStreamDestination();
        audio.master.connect(tap);
        for (const tr of tap.stream.getAudioTracks()) {
          stream.addTrack(tr);
        }
      }
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate(size, fps) });
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size) {
          chunks.push(ev.data);
        }
      };
      recorder.start(1000);
    },
    get progress() {
      return { done: showing, total, etaS: Math.max(0, (total - showing) / fps), realtime: true };
    },
    async finish() {
      if (state !== 'running') {
        return null;
      }
      state = 'ended';
      await end();
      const type = mime.split(';')[0];
      return { name: stampedName(clip.meta.map, type === 'video/mp4' ? '.mp4' : '.webm'), bytes: new Blob(chunks, { type }) };
    },
    cancel() {
      if (state === 'running') {
        state = 'cancelled';
        end();
      }
    },
  };
  if (signal) {
    if (signal.aborted) {
      job.cancel();
    }
    signal.addEventListener('abort', () => job.cancel(), { once: true });
  }
  return job;
}
