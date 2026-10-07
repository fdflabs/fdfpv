/*
 * replaybeds.js: the crash cam's replay's radio and music.
 *
 * A replay plays the flight's sound as it was (src/replay/sound.js): Crest
 * Control's lines when the playhead passes them, and the war's music or
 * the flight's own record where it had got to at the frame on screen. It
 * plays them on the war radio the live game already has (src/render/
 * warradio.js): its voice element for the lines, its music element for
 * whichever bed the clip says was playing (live, the war's music and the
 * flight's record never play together: a war's bed silences the crate).
 * So a replay adds no node to the audio graph past the two a war's radio
 * holds anyway (tests/thresholds.json max_nodes). The live radio is
 * stopped when the replay opens, so none of the live war's calls play over
 * it, and its music is put back when it closes.
 *
 * A bed follows the playhead: a record that is not the one on the element
 * is loaded; one more than SEEK_S from where the clip says it was is moved
 * there (a scrub, a jump, a slow display); its rate is the replay's speed,
 * so slow motion is slow music; paused, it stops.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { COMBAT_BUS, INTRO_BUS, warMusicUrl } from './warradio.js';
import { trackById, trackGain, trackUrl } from './tracks.js';

/* A bed this far from where the clip says it was is moved, seconds. */
export const SEEK_S = 0.3;
/* The slowest a media element plays at. */
const RATE_MIN = 0.0625;

export class ReplayBeds {
  /* radio: the live WarRadio, attached and routed; musicExt: the
   * flight crate's file kind (src/render/music.js ext). */
  constructor(radio, musicExt) {
    this.radio = radio;
    this.musicExt = musicExt;
    this.liveTrack = '';
    this.url = '';
    this.open = false;
  }

  /* The replay opens: the live radio is stopped, its music remembered. */
  begin() {
    if (this.open) {
      return;
    }
    this.open = true;
    this.liveTrack = this.radio.track;
    this.radio.stop();
    this.url = '';
  }

  /* The replay closes: the replay's bed off (it is on the element, not
   * the radio's track, so the radio's stop does not reach it), and the
   * radio's own music back as it was. */
  end() {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.radio.stop();
    this.silence();
    if (this.liveTrack) {
      this.radio.music(this.liveTrack);
    }
  }

  silence() {
    const el = this.radio.bed && this.radio.bed.el;
    this.url = '';
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
  }

  say(id, lang) {
    this.radio.setLang(lang);
    this.radio.say(id);
  }

  /*
   * The bed at the frame on screen: `war` and `music` each { id, at } or
   * null (sound.js bedAt), `rate` the replay's speed, `playing` whether the
   * playhead is moving.
   */
  frame(war, music, rate, playing) {
    const el = this.radio.bed && this.radio.bed.el;
    if (!el) {
      return;
    }
    const bed = war || music;
    let url = '';
    let level = 0;
    if (war) {
      url = warMusicUrl(war.id, this.radio.ext);
      level = war.id === 'intro' ? INTRO_BUS : COMBAT_BUS;
    } else if (music && trackById(music.id)) {
      /* A record no longer in the crate is no bed, not some other record. */
      url = trackUrl(music.id, this.musicExt);
      level = trackGain(trackById(music.id));
    }
    if (url !== this.url) {
      if (!url) {
        this.silence();
        return;
      }
      this.url = url;
      el.src = url;
      el.loop = !(war && war.id === 'intro');
    }
    if (!url) {
      return;
    }
    el.volume = Math.min(1, this.radio.output * this.radio.musicLevel * level);
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
}
