/*
 * replaybeds.js: the crash cam's replay's own radio and music.
 *
 * A replay plays the flight's sound as it was (src/replay/sound.js): Crest
 * Control's lines when the playhead passes them, the war's music and the
 * flight's own record where they had got to at the frame on screen. The
 * live ones are the flight's and are held silent while a replay plays
 * (src/render/audio.js setReplaying), so these are elements of their
 * own: a WarRadio for the lines and the war's music (the same files, the
 * same levels), and one element for the flight's record. They play into
 * the same buses as the live ones, so the volume, the music setting and
 * the sound switch hold for them too.
 *
 * A bed follows the playhead: a record or a war track that is not the one
 * on the element is loaded; one more than SEEK_S from where the clip says
 * it was is moved there (a scrub, a jump, a slow display); its rate is the
 * replay's speed, so slow motion is slow music; paused, it stops.
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

import { WarRadio } from './warradio.js';
import { TRACKS, trackGain, trackUrl } from './tracks.js';

/* A bed this far from where the clip says it was is moved, seconds. */
export const SEEK_S = 0.3;
/* The slowest a media element plays at. */
const RATE_MIN = 0.0625;

export class ReplayBeds {
  constructor() {
    this.radio = new WarRadio();
    this.music = null;
    this.musicId = '';
    this.level = 0;
  }

  /* Into the graph, once: the lines to `voiceDest`, both beds to
   * `musicDest`. */
  route(ctx, voiceDest, musicDest, keep) {
    if (this.music || typeof Audio === 'undefined') {
      return;
    }
    this.radio.attach();
    this.radio.route(ctx, voiceDest, musicDest, keep);
    this.radio.setOutput(1);
    const el = new Audio();
    el.preload = 'auto';
    el.playsInline = true;
    el.loop = true;
    keep(ctx.createMediaElementSource(el)).connect(musicDest);
    this.music = el;
  }

  /* The music setting's level, 0 with music off. */
  setMusicLevel(v) {
    this.level = Math.max(0, Math.min(1, v));
    this.radio.setMusicLevel(this.level);
    if (this.music && this.musicId) {
      this.music.volume = trackGain(TRACKS.find((t) => t.id === this.musicId) || TRACKS[0]) * this.level;
    }
  }

  say(id, lang) {
    this.radio.setLang(lang);
    this.radio.say(id);
  }

  /*
   * The two beds at the frame on screen: `war` and `music` each { id, at }
   * or null (sound.js bedAt), `rate` the replay's speed, `playing` whether
   * the playhead is moving.
   */
  frame(war, music, rate, playing) {
    this.radio.music(war ? war.id : '');
    follow(this.radio.bed && this.radio.bed.el, war, rate, playing);
    const el = this.music;
    if (!el) {
      return;
    }
    const id = music ? music.id : '';
    if (id !== this.musicId) {
      this.musicId = id;
      if (!id) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } else {
        el.src = trackUrl(id, this.radio.ext);
        this.setMusicLevel(this.level);
      }
    }
    follow(id ? el : null, music, rate, playing);
  }

  stop() {
    this.radio.stop();
    this.frame(null, null, 1, false);
  }
}

/* An element on the bed `bed` ({ id, at }) at `rate`, playing or not. */
function follow(el, bed, rate, playing) {
  if (!el || !bed) {
    return;
  }
  const dur = el.duration;
  const at = Number.isFinite(dur) && dur > 0 ? bed.at % dur : bed.at;
  if (Math.abs(el.currentTime - at) > SEEK_S) {
    try {
      el.currentTime = at;
    } catch (e) {
      /* Not seekable before its metadata: the next frame tries again. */
    }
  }
  el.playbackRate = Math.max(RATE_MIN, rate);
  if (playing && el.paused) {
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  } else if (!playing && !el.paused) {
    el.pause();
  }
}
