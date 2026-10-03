/*
 * soundtrack.js: a movie's sound, rendered offline before its pictures.
 *
 * The live replay plays its motors and wind through the shell's MotorAudio,
 * slowed with the picture (crashcam.js sound()), and its crash cues,
 * SCHWINGs and Catch the Ace coins as the playhead crosses them. An
 * exported movie gets the same sound, made the same way, but on an
 * OfflineAudioContext: a fresh
 * MotorAudio built on it, dressed like the live one (voice, blade scale,
 * stem mix, volume), with the music off, driven once per movie frame at
 * that frame's movie time. So a movie is never short of sound because a
 * frame took long to draw: there is no wall clock in here at all.
 *
 * Since the clip keeps its sound (src/replay/sound.js), the movie has the
 * rest of it too (soundPlan below): the engine's air (the wind, the prop
 * wash, the servos and the retracts), the other pilots' motors heard from
 * the pilot's craft, the craft's impacts, prop strikes, mechanisms and
 * cues, the war's explosions at their distance from the craft, and Crest
 * Control's lines, the war's music and the flight's record, each fetched
 * and decoded (an OfflineAudioContext cannot host the media elements the
 * live ones play through) and started where the clip says it was, at the
 * shot's speed. The listener is the pilot's craft: the movie's cameras
 * are not evaluated here, and the chase and the onboard ride with it.
 * Not in it: the attackers (the world's voice is a worklet on the live
 * context, src/render/world-audio.js) and the world's ambience.
 *
 * The movie's time map is the plan (edit.js planMovie): frame i shows clip
 * time plan.clipT[i] and advances plan.step[i] of clip time, so a frame's
 * speed is step times fps. The cues come from edit.js cueTimes.
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

import { createSample, locate, sampleAt, HEAD, POSE } from './recorder.js';
import { cueTimes, movieTime, shotAt } from './edit.js';
import { MotorAudio, VOICES } from '../render/audio.js';
import {
  BEDS, airAt, bedAt, peerVoicesAt,
} from './sound.js';
import { createPeerSample, samplePeers } from './peers.js';
import {
  COMBAT_BUS, INTRO_BUS, warMusicUrl, warVoiceUrl,
} from '../render/warradio.js';
import { TRACKS, trackGain, trackUrl } from '../render/tracks.js';
import { engineSpecFor } from '../render/enginespec.js';
import { airframeById } from '../../configs/airframes.js';

export const SAMPLE_RATE = 48000;

/* The crash cues (the clip's events), and the SCHWINGs and coins (its
 * paper's) the movie plays, at their movie times, levels scaled for a
 * slow shot. */
export function soundCues(clip, edit) {
  return cueTimes(edit, clip.paper ? [...clip.events, ...clip.paper.events] : clip.events);
}

/*
 * The rest of a clip's sound on the movie's clock, from its sound and its
 * explosions: { calls: [{ m, call, args }] (the craft's one shots, their
 * levels scaled for a slow shot as the cues are), radio: [{ m, id, lang,
 * rate }], booms: [{ m, size, q, dist }] (its size over the biggest,
 * the shot's quietening and the distance from the craft),
 * beds: [{ name, id, m, dur, at, rate }] (a bed playing from `at` seconds
 * in, for `dur` movie seconds, at the shot's speed: one piece a shot and
 * a change of record) }. Pure, for the checks.
 */
export function soundPlan(clip, edit) {
  const out = {
    calls: [], radio: [], booms: [], beds: [],
  };
  const speedOf = (t) => edit.shots[shotAt(edit, t)].speed;
  const events = clip.sound ? clip.sound.events : [];
  for (const e of events) {
    const m = movieTime(edit, e.t);
    if (!Number.isFinite(m) || e.t >= edit.out || BEDS.includes(e.call)) {
      continue;
    }
    const q = Math.min(1, speedOf(e.t));
    const [a0, a1, a2] = e.args;
    if (e.call === 'radio') {
      out.radio.push({
        m, id: a0, lang: a1, rate: speedOf(e.t),
      });
    } else if (e.call === 'impact') {
      out.calls.push({ m, call: e.call, args: [a0 * q, a1, a2 * q] });
    } else if (e.call === 'propStrike') {
      out.calls.push({ m, call: e.call, args: [a0 * q, a1] });
    } else if (e.call === 'event') {
      out.calls.push({ m, call: e.call, args: [a0, a1 === null ? q : a1 * q] });
    } else {
      out.calls.push({ m, call: e.call, args: e.args.slice() });
    }
  }
  const s = createSample();
  for (const e of clip.paper ? clip.paper.events : []) {
    const m = movieTime(edit, e.t);
    if (e.type !== 'boom' || !Number.isFinite(m) || e.t >= edit.out) {
      continue;
    }
    sampleAt(clip, e.t, s);
    const dist = Math.hypot(s.pose[POSE.pos] - e.p[0], s.pose[POSE.pos + 1] - e.p[1], s.pose[POSE.pos + 2] - e.p[2]);
    out.booms.push({
      m, size: e.level, q: Math.min(1, speedOf(e.t)), dist,
    });
  }
  /* The beds, cut at every shot and every change of record. */
  const t0 = edit.shots[0].t0;
  const cuts = [...new Set([...edit.shots.map((x) => x.t0), edit.out, ...events.filter((e) => BEDS.includes(e.call)).map((e) => e.t)])]
    .filter((t) => t >= t0 && t <= edit.out)
    .sort((x, y) => x - y);
  for (const name of BEDS) {
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const a = cuts[i];
      const b = cuts[i + 1];
      const bed = bedAt(events, name, a);
      if (!bed || !(b > a)) {
        continue;
      }
      const sp = speedOf(a);
      out.beds.push({
        name, id: bed.id, m: movieTime(edit, a), dur: (b - a) / sp, at: bed.at, rate: sp,
      });
    }
  }
  return out;
}

/* A file decoded on ctx, or null when it cannot be had (a movie is made
 * without a line rather than not at all; the count says so). */
async function decodeUrl(ctx, url, cache) {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) {
          return null;
        }
        return await ctx.decodeAudioData(await r.arrayBuffer());
      } catch (err) {
        return null;
      }
    })());
  }
  return cache.get(url);
}

function voiceName(voice) {
  const name = Object.keys(VOICES).find((k) => VOICES[k] === voice);
  if (!name) {
    throw new Error('soundtrack: the live mix has a voice VOICES does not name');
  }
  return name;
}

/*
 * The movie's sound as an AudioBuffer, stereo at sampleRate, exactly
 * plan.n / plan.fps seconds long (rounded up to a sample). `audio` is the
 * shell's live MotorAudio, read and never changed.
 */
export async function renderSoundtrack({
  clip, edit, plan, audio, sampleRate = SAMPLE_RATE,
}) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC) {
    throw new Error('soundtrack: no OfflineAudioContext');
  }
  const { n, fps, clipT } = plan;
  const ctx = new OAC(2, Math.ceil((n / fps) * sampleRate), sampleRate);
  const a = new MotorAudio();
  a.setVoice(voiceName(audio.voice));
  a.setBladeScale(audio.bladeScale);
  a.setEngineSpec({ model: audio.engineModel, params: audio.engineParams });
  a.attach(ctx);
  /* The engine is an AudioWorklet module, loaded asynchronously: nothing
   * may be scheduled on it before it is there. */
  await a.ready;
  a.setLevel(audio.level);
  a.setMix({ motors: audio.mix.motors, wind: audio.mix.wind });
  a.setMusicEnabled(false);
  a.setEnabled(true);
  const s = createSample();
  const rpm = [0, 0, 0, 0];
  const air = {
    u: 0, v: 0, w: 0, amps: 0, flapsMoving: false, gearMoving: false,
  };
  const peerSample = clip.peers ? createPeerSample(clip.peers.slots) : null;
  const heard = [];
  const specs = new Map();
  for (let i = 0; i < n; i += 1) {
    sampleAt(clip, clipT[i], s);
    /* The frame's playback speed. */
    const k = plan.step[i] * fps;
    for (let m = 0; m < 4; m += 1) {
      rpm[m] = s.pose[POSE.rpm + m] * k;
    }
    let frameAir;
    if (clip.sound) {
      const [r, u] = locate(clip, clipT[i]);
      airAt(clip.sound, clip.n, r, u, air);
      air.u *= k;
      air.v *= k;
      air.w *= k;
      frameAir = air;
    }
    a.update(rpm, s.head[HEAD.speed] * k, i / fps, frameAir);
    if (peerSample) {
      const [r, u] = locate(clip, clipT[i]);
      samplePeers(clip.peers, clip.n, r, u, peerSample);
      /* Heard from the craft, its right hand from its attitude. */
      const qx = s.pose[POSE.quat];
      const qy = s.pose[POSE.quat + 1];
      const qz = s.pose[POSE.quat + 2];
      const qw = s.pose[POSE.quat + 3];
      a.setListener(s.pose[POSE.pos], s.pose[POSE.pos + 1], s.pose[POSE.pos + 2],
        1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy));
      for (const h of peerVoicesAt(clip.peers, peerSample, k, heard)) {
        if (!specs.has(h.airframe)) {
          specs.set(h.airframe, h.airframe && airframeById(h.airframe) ? engineSpecFor(h.airframe, {}, {}) : null);
        }
        h.spec = specs.get(h.airframe);
      }
      a.updatePeers(heard, i / fps);
    }
  }
  const sp = soundPlan(clip, edit);
  for (const c of sp.calls) {
    if (c.call === 'impact') {
      a.impact(c.args[0], c.args[1], c.args[2], c.m);
    } else if (c.call === 'propStrike') {
      a.propStrike(c.args[0], c.args[1], c.m);
    } else if (c.call === 'mechanical') {
      a.mechanical(c.args[0], c.m);
    } else if (c.call === 'event') {
      a.event(c.args[0], c.m, c.args[1]);
    }
  }
  /* As loud as main.js warBoomAt rates it (three.js, so the browser's). */
  const { SIZE_MAX } = await import('../render/explosion.js');
  for (const b of sp.booms) {
    a.boom(Math.min(1, 0.35 + 0.2 * b.size * SIZE_MAX) * b.q, b.dist, b.m);
  }
  /* The radio and the beds, decoded, into the voice bus and the music's. */
  const cache = new Map();
  const music = audio.musicWanted ? audio.mix.music : 0;
  const ext = audio.warRadio ? audio.warRadio.ext : 'webm';
  const play = async (url, dest, gain, m, offset, rate, dur, loop = false) => {
    const buf = await decodeUrl(ctx, url, cache);
    if (!buf || gain <= 0) {
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    const at = offset % buf.duration;
    src.loop = loop;
    src.start(m, at);
    if (dur != null) {
      src.stop(m + dur);
    }
  };
  const jobs = [];
  for (const r of sp.radio) {
    jobs.push(play(warVoiceUrl(r.lang, r.id, ext), a.voiceBus, 1, r.m, 0, r.rate, null));
  }
  for (const b of sp.beds) {
    const war = b.name === 'bed';
    const url = war ? warMusicUrl(b.id, ext) : trackUrl(b.id, ext);
    const level = music * (war ? (b.id === 'intro' ? INTRO_BUS : COMBAT_BUS) : trackGain(TRACKS.find((x) => x.id === b.id) || TRACKS[0]));
    /* The intro runs out into the fight's loop (warradio.js), which loops;
     * a record loops when pinned, and a piece ends at its next change. */
    jobs.push(play(url, a.music.duck, level, b.m, b.at, b.rate, b.dur, b.id !== 'intro'));
  }
  await Promise.all(jobs);
  for (const c of soundCues(clip, edit)) {
    if (c.type === 'cue') {
      a.wreck(c.kind, c.level, c.m);
    } else if (c.type === 'schwing') {
      a.schwing(c.level, c.m);
    } else {
      a.coin(c.level, c.m);
    }
  }
  return ctx.startRendering();
}
