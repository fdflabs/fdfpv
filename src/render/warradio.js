/*
 * warradio.js: the war mode's radio and its music (docs/WARFARE-PLAN.md
 * section 7): Crest Control's calls from assets/audio/war/voice/<lang>/,
 * one at a time, and the two tracks in assets/audio/war/music/, the intro
 * over the start countdown and the combat loop under the fight.
 *
 * Two parts. createWarCalls() is what to say: it reads roomwar's events
 * and the room's view as the shell hands them over, and answers with line
 * ids from lines.json. It keeps only what it needs to see a change (the
 * rack, the contacts), so it is pure and runs
 * in Node. WarRadio is how it sounds: two media elements on the mix, owned
 * by src/render/audio.js (MotorAudio.war()), so the volume and the sound
 * setting hold for it as for every cue, and the music follows the music
 * setting. Nothing here reaches a plant or the room.
 *
 * ONE LINE AT A TIME. A radio call talked over is two calls nobody hears,
 * and a burst of events (a swarm dying together, a wave born with a hit)
 * is common. So a line waits its turn in a queue of QUEUE_MAX, a line
 * already waiting is not queued twice, and a line that waited longer than
 * STALE_MS is dropped when its turn comes, since a call about a moment
 * that has passed is noise. The mission's end is said at once: it clears
 * the queue and cuts in.
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

import { str } from '../strings/index.js';

export const QUEUE_MAX = 3;
export const STALE_MS = 6000;
/* The lines that end a mission: said at once, over whatever was queued. */
export const END_LINES = new Set(['win', 'lose-output', 'lose-rack']);
/* The music's level on the music setting, before the master: the intro
 * is a trailer and carries the countdown, the loop sits under the voice. */
const INTRO_BUS = 0.5;
const COMBAT_BUS = 0.22;
/* How far the motors and wind duck under a call, and the voice's level. */
const VOICE_LEVEL = 1.0;
export const VOICE_DUCK = 0.55;
/* The target kinds a hit line exists for (lines.json hit-*). */
const HIT_LINES = { intake: 'hit-intake', penstock: 'hit-penstock', gate: 'hit-gate', 'yard-right': 'hit-yard' };
/* Waves the radio does not call: a Jammer's jams a signal the war no
 * longer has (docs/WARFARE-PLAN.md 6.1), and no mission spawns one. */
const QUIET_WAVES = new Set(['jammer']);

/* A voice file or a track, resolved against this module so a shell
 * mounted under a path still finds it. */
export function warVoiceUrl(lang, id, ext) {
  return new URL(`../../assets/audio/war/voice/${lang}/${id}.${ext}`, import.meta.url).href;
}
export function warMusicUrl(name, ext) {
  return new URL(`../../assets/audio/war/music/${name}.${ext}`, import.meta.url).href;
}

/*
 * What Crest Control says. Each call takes what happened and returns the
 * line ids it calls for, in order:
 *
 *   events(list, view)   roomwar's takeEvents(), then its view()
 *   reset()              a new war, or none
 *
 * The signal, relay and jammer lines (lines.json group 'signal',
 * wave-jammer, jammer-down) are never said: the war has no radio signal
 * since 2026-09-29 (docs/WARFARE-PLAN.md 6.1). Their audio stays.
 */
export function createWarCalls() {
  let was = null;
  let kills = 0;
  let lowSaid = false;
  let rackSaid = '';

  function reset() {
    was = null;
    kills = 0;
    lowSaid = false;
    rackSaid = '';
  }

  function events(list, v) {
    const out = [];
    let blasts = 0;
    for (const ev of list) {
      if (ev.type === 'state' && ev.to === 'live') {
        out.push('start');
      } else if (ev.type === 'state' && (ev.to === 'won' || ev.to === 'lost')) {
        out.push(ev.to === 'won' ? 'win' : (v.why === 'rack' ? 'lose-rack' : 'lose-output'));
      } else if (ev.type === 'born') {
        const kind = ev.agents[0].kind;
        if (!QUIET_WAVES.has(kind)) {
          out.push(v.wave >= v.waves && v.waves > 0 ? 'wave-last' : `wave-${kind}`);
        }
      } else if (ev.type === 'boom') {
        blasts += 1;
      } else if (ev.type === 'dead' && ev.why === 'arrive' && ev.hit && ev.target) {
        const m = /^(intake|penstock|gate)-\d+$/.exec(ev.target);
        const line = HIT_LINES[m ? m[1] : ev.target];
        if (line) {
          out.push(line);
        }
      } else if (ev.type === 'dead' && ev.why === 'boom') {
        if (ev.mine) {
          kills += 1;
          out.push(ev.ids.length > 1 ? 'kill-multi' : (kills % 2 ? 'kill-1' : 'kill-2'));
        }
      }
    }
    if (v && v.state === 'live') {
      out.push(...changes(v, blasts));
    }
    if (v) {
      was = { rack: v.rack, alive: v.alive, wave: v.wave };
    }
    return out;
  }

  /* What the view says that no single event does: a bird lost that no
   * warhead took, the rack running out, a wave cleared, output low. */
  function changes(v, blasts) {
    const out = [];
    if (was && v.rack < was.rack && v.rack < was.rack - blasts) {
      out.push('bird-lost');
    }
    if (v.rack === 1 && rackSaid !== 'last') {
      rackSaid = 'last';
      out.push('rack-last');
    } else if (v.rack > 1 && v.rack <= Math.max(2, Math.ceil(v.rackMax / 4)) && rackSaid === '') {
      rackSaid = 'low';
      out.push('rack-low');
    }
    if (was && was.alive > 0 && v.alive === 0 && v.wave < v.waves) {
      out.push('wave-clear');
    }
    if (!lowSaid && v.output < v.floor * 1.1 && v.output >= v.floor) {
      lowSaid = true;
      out.push('output-low');
    }
    return out;
  }

  return { events, reset };
}

/*
 * The two media elements, made by attach() the first time a war wants
 * them. They play outside the Web Audio graph, at the element's own
 * volume: the graph's budget is 64 nodes (tests/thresholds.json
 * max_nodes) and a flight already stands at it, so a MediaElementSource
 * and a gain each, four more, would break it. setOutput() is the master's
 * part instead, the volume setting times the sound on or off, handed in
 * by the owner every frame (MotorAudio.update).
 */
export class WarRadio {
  constructor() {
    this.ready = false;
    this.output = 0;
    this.voice = null;
    this.bed = null;
    this.lang = 'en';
    this.ext = 'webm';
    this.queue = [];
    this.current = null;
    this.said = [];
    this.track = '';
    this.musicLevel = 0;
    this.onSpeak = null;
  }

  attach() {
    this.ready = true;
    if (typeof Audio === 'undefined') {
      return;
    }
    const make = () => {
      const el = new Audio();
      el.preload = 'auto';
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.volume = 0;
      return { el };
    };
    this.ext = new Audio().canPlayType(str('music.audio_webm_codecs_opus')) !== '' ? 'webm' : 'mp3';
    this.voice = make();
    this.voice.el.addEventListener('ended', () => this.next());
    this.voice.el.addEventListener('error', () => this.failed(this.voice.el));
    this.bed = make();
    this.bed.el.addEventListener('ended', () => {
      /* The intro runs out into the fight's loop. */
      if (this.track === 'intro') {
        this.music('combat');
      }
    });
    this.bed.el.addEventListener('error', () => this.failed(this.bed.el));
    /* A track asked for before there was a context to play it on. */
    if (this.track) {
      const t = this.track;
      this.track = '';
      this.music(t);
    }
  }

  /* An Opus file this browser said it could play and then could not: the
   * whole session goes to mp3, and the same file is tried again. */
  failed(el) {
    if ((el === this.voice.el && !this.current) || (el === this.bed.el && !this.track)) {
      return;
    }
    if (this.ext === 'mp3') {
      if (el === this.voice.el) {
        this.next();
      }
      return;
    }
    this.ext = 'mp3';
    if (el === this.voice.el && this.current) {
      this.play(this.current.id);
    } else if (el === this.bed.el && this.track) {
      const t = this.track;
      this.track = '';
      this.music(t);
    }
  }

  setLang(lang) {
    this.lang = lang === 'es' ? 'es' : 'en';
  }

  /* One line by its lines.json id, in its turn. */
  say(id, nowMs = performance.now()) {
    if (END_LINES.has(id)) {
      this.queue = [];
      this.said.push(id);
      this.play(id);
      return;
    }
    if (this.queue.some((q) => q.id === id) || (this.current && this.current.id === id)) {
      return;
    }
    if (!this.current) {
      this.said.push(id);
      this.play(id);
      return;
    }
    if (this.queue.length < QUEUE_MAX) {
      this.queue.push({ id, at: nowMs });
    }
  }

  play(id) {
    this.current = { id };
    if (this.said.length > 40) {
      this.said.shift();
    }
    if (!this.voice) {
      this.current = null;
      return;
    }
    const el = this.voice.el;
    el.src = warVoiceUrl(this.lang, id, this.ext);
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => this.next());
    }
    if (this.onSpeak) {
      this.onSpeak();
    }
  }

  next(nowMs = performance.now()) {
    this.current = null;
    while (this.queue.length) {
      const q = this.queue.shift();
      if (nowMs - q.at <= STALE_MS) {
        this.said.push(q.id);
        this.play(q.id);
        return;
      }
    }
  }

  /* 'intro', 'combat', or '' for none. The level is the music setting's,
   * 0 when music is off. */
  music(track) {
    if (track === this.track) {
      return;
    }
    this.track = track;
    if (!this.bed) {
      return;
    }
    const el = this.bed.el;
    if (!track) {
      el.pause();
      el.removeAttribute('src');
      el.load();
      return;
    }
    el.loop = track === 'combat';
    el.src = warMusicUrl(track, this.ext);
    this.applyLevel();
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  }

  setMusicLevel(v) {
    this.musicLevel = Math.max(0, Math.min(1, v));
    this.applyLevel();
  }

  /* The master's share: the volume setting, 0 while the sound is off. */
  setOutput(v) {
    const o = Math.max(0, Math.min(1, v));
    if (o !== this.output) {
      this.output = o;
      this.applyLevel();
    }
  }

  applyLevel() {
    if (this.voice) {
      this.voice.el.volume = Math.min(1, this.output * VOICE_LEVEL);
    }
    if (this.bed) {
      const bus = this.track === 'intro' ? INTRO_BUS : COMBAT_BUS;
      this.bed.el.volume = Math.min(1, this.output * this.musicLevel * bus);
    }
  }

  /* Everything stops: the war is over, or the sound was turned off. */
  stop() {
    this.queue = [];
    this.current = null;
    if (this.voice) {
      this.voice.el.pause();
    }
    this.music('');
  }

  status() {
    return {
      speaking: this.current ? this.current.id : null,
      queue: this.queue.map((q) => q.id),
      said: this.said.slice(),
      track: this.track,
      lang: this.lang,
      ext: this.ext,
      attached: Boolean(this.voice),
      volume: this.voice ? this.voice.el.volume : 0,
      musicVolume: this.bed ? this.bed.el.volume : 0,
      musicPlaying: this.bed ? !this.bed.el.paused : false,
    };
  }
}

