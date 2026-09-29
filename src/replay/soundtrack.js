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
 * The music is not in it: the bed plays through a media element, which an
 * OfflineAudioContext cannot host, and which track played when is not
 * recorded (docs/EDITOR-PLAN.md section 0).
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

import { createSample, sampleAt, HEAD, POSE } from './recorder.js';
import { cueTimes } from './edit.js';
import { MotorAudio, VOICES } from '../render/audio.js';

export const SAMPLE_RATE = 48000;

/* The crash cues (the clip's events), and the SCHWINGs and coins (its
 * paper's) the movie plays, at their movie times, levels scaled for a
 * slow shot. */
export function soundCues(clip, edit) {
  return cueTimes(edit, clip.paper ? [...clip.events, ...clip.paper.events] : clip.events);
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
  a.attach(ctx);
  a.setLevel(audio.level);
  a.setMix({ motors: audio.mix.motors, wind: audio.mix.wind });
  a.setMusicEnabled(false);
  a.setEnabled(true);
  const s = createSample();
  const rpm = [0, 0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    sampleAt(clip, clipT[i], s);
    /* The frame's playback speed. */
    const k = plan.step[i] * fps;
    for (let m = 0; m < 4; m += 1) {
      rpm[m] = s.pose[POSE.rpm + m] * k;
    }
    a.update(rpm, s.head[HEAD.speed] * k, i / fps);
  }
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
