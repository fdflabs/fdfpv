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
 * its staleness is dropped when its turn comes, since a call about a
 * moment that has passed is noise. The mission's end is said at once: it
 * clears the queue and cuts in.
 *
 * PRIORITY (docs/campaign/TECH-NEEDS.md T3.1). End lines over everything;
 * then a mission's story lines (its stages' radio cues), which wait up to
 * STORY_STALE_MS and push the oldest waiting call out of a full queue;
 * then the calls (bearing, kind, hit, kill), STALE_MS, which never push a
 * story line out. An item may be several lines said one after another
 * with nothing between them: a group's bearing and then its kind
 * (MIRADOR's "Out of the west arm." then CREST's "Strikers, low ...").
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
import { MISSIONS } from '../share/war/missions/index.js';

export const QUEUE_MAX = 3;
export const STALE_MS = 6000;
export const STORY_STALE_MS = 12000;
/* Each Act 1 mission's briefing, said over its countdown, and its
 * debrief, said at its end in place of the generic win or lose line: the
 * mission's own `radio` (docs/campaign/TECH-NEEDS.md T1.13: { brief: [ids],
 * win, lose }), or by its id, brief-<id>-1, -2 and debrief-<id>-win, -lose,
 * for a mission written before it had one. */
const radioOf = (m) => ({
  brief: m.radio?.brief ?? [`brief-${m.id}-1`, `brief-${m.id}-2`],
  win: m.radio?.win ?? `debrief-${m.id}-win`,
  lose: m.radio?.lose ?? `debrief-${m.id}-lose`,
});
export const BRIEF_LINES = Object.fromEntries(Object.values(MISSIONS).map((m) => [m.id, radioOf(m).brief]));
export const DEBRIEF_LINES = Object.fromEntries(Object.values(MISSIONS).map((m) => [m.id, { win: radioOf(m).win, lose: radioOf(m).lose }]));
/* The lines that end a mission: said at once, over whatever was queued. */
export const END_LINES = new Set(['win', 'lose-output', 'lose-rack',
  ...Object.values(DEBRIEF_LINES).flatMap((d) => [d.win, d.lose])]);
/* The music's level on the music setting, before the master: the intro
 * is a trailer and carries the countdown, the loop sits under the voice. */
export const INTRO_BUS = 0.5;
/* 0.335, not 0.22: the combat file was turned down 3.67 dB to bring its
 * true peak under -1 dBTP (tools/voice/music.py), and this gives the same
 * dB back so the war's mix does not move. */
export const COMBAT_BUS = 0.335;
/* Every bed by name: its level on the music setting and whether it loops.
 * The Interior's are generated at the level they sit at (tools/voice/
 * beds.py: music about -21 LUFS, the sound beds under it), so they share
 * one bus. */
export const INTERIOR_BUS = 0.9;
export const BEDS = Object.freeze({
  intro: { bus: INTRO_BUS, loop: false },
  combat: { bus: COMBAT_BUS, loop: true },
  interior: { bus: INTERIOR_BUS, loop: true },
  column: { bus: INTERIOR_BUS, loop: true },
  static: { bus: INTERIOR_BUS, loop: true },
  wind: { bus: INTERIOR_BUS, loop: true },
  room: { bus: INTERIOR_BUS, loop: true },
});
/* How far the motors and wind duck under a call, and the voice's level. */
const VOICE_LEVEL = 1.0;
export const VOICE_DUCK = 0.55;
/* The music already playing is moved to a film's time only when it is
 * this far off it, so the film's own clock never makes it stutter. */
export const MUSIC_SEEK_S = 0.25;
/* Under a teammate on voice chat the radio and the music step aside:
 * DUCK_DB down in DUCK_ATTACK_MS, back up over DUCK_RELEASE_MS once the
 * last one stops. Ramped in dB, so the attack and the release are even. */
export const DUCK_DB = -10;
export const DUCK_ATTACK_MS = 50;
export const DUCK_RELEASE_MS = 500;
/* The target kinds a hit line exists for (lines.json hit-*). */
const HIT_LINES = { intake: 'hit-intake', penstock: 'hit-penstock', gate: 'hit-gate', 'yard-right': 'hit-yard' };
/* Waves the radio does not call: a Jammer's jams a signal the war no
 * longer has (docs/WARFARE-PLAN.md 6.1), and no mission spawns one. */
const QUIET_WAVES = new Set(['jammer']);

/* An item's entry that is a line, not a pause (a number, seconds). */
const isLine = (id) => typeof id === 'string';

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
      if (ev.type === 'state' && ev.to === 'countdown' && v && BRIEF_LINES[v.mission]) {
        out.push(...BRIEF_LINES[v.mission]);
      } else if (ev.type === 'state' && ev.to === 'live') {
        out.push('start');
      } else if (ev.type === 'state' && (ev.to === 'won' || ev.to === 'lost')) {
        const debrief = v && DEBRIEF_LINES[v.mission]?.[ev.to === 'won' ? 'win' : 'lose'];
        out.push(END_LINES.has(debrief) ? debrief : ev.to === 'won' ? 'win' : 'lose-output');
      } else if (ev.type === 'born') {
        /* A decoy is called as what it looks like. A group drawn from a
         * sector (src/share/war/stages.js) is MIRADOR's bearing first,
         * then the kind, as one item. */
        const kind = ev.agents[0].kind === 'decoy' ? 'strike' : ev.agents[0].kind;
        if (!QUIET_WAVES.has(kind)) {
          const call = v.wave >= v.waves && v.waves > 0 ? 'wave-last' : `wave-${kind}`;
          const sector = ev.agents[0].sector;
          out.push(sector ? [`bearing-${sector.toLowerCase()}`, call] : call);
        }
      } else if (ev.type === 'boom') {
        blasts += 1;
      } else if (ev.type === 'scouts') {
        out.push('scouts-down');
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

  /* A round's result (src/ui/warround.js), with the lines there are:
   * held, the wave cleared; damaged, the grid on the edge; lost, every
   * pilot out of airframes. */
  function round(result) {
    const line = { win: 'wave-clear', damaged: 'output-low', lost: 'lose-rack' }[result];
    return line ? [line] : [];
  }

  return { events, reset, round };
}

/*
 * The two media elements, made by attach() the first time a war wants
 * them, and routed (route()) into the mix's graph: the calls onto its
 * Voice bus, the music into the crate's duck, so the limiter, the Volume
 * and the action ducks hold for them (src/render/audio.js war()). The
 * element volumes still carry the radio's own share: the bed's level
 * against the calls, the music setting, and the duck under a teammate's
 * voice. setOutput() is 1 once routed, because the graph's master is the
 * Volume; it stays for a radio that was never given a graph.
 */
export class WarRadio {
  constructor() {
    this.ready = false;
    this.routed = false;
    this.output = 0;
    this.voice = null;
    this.bed = null;
    this.lang = 'en';
    this.ext = 'webm';
    this.queue = [];
    this.current = null;
    this.said = [];
    this.started = [];
    this.pauseTimer = 0;
    this.track = '';
    this.musicLevel = 0;
    this.onSpeak = null;
    /* The voice chat duck, dB (0 or down to DUCK_DB), and when it last ran. */
    this.duckDb = 0;
    this.duckAt = null;
  }

  /*
   * Once a frame: `heard` is whether any teammate's voice is playing on
   * this page (src/share/voice.js speaking(), never this pilot's own).
   * Moves the duck toward DUCK_DB or back to 0 at the attack's or the
   * release's rate, on the element volumes, adding no audio node.
   */
  duck(heard, nowMs = performance.now()) {
    const dt = this.duckAt == null ? 0 : Math.max(0, nowMs - this.duckAt);
    this.duckAt = nowMs;
    const was = this.duckDb;
    this.duckDb = heard
      ? Math.max(DUCK_DB, was + (DUCK_DB / DUCK_ATTACK_MS) * dt)
      : Math.min(0, was - (DUCK_DB / DUCK_RELEASE_MS) * dt);
    if (this.duckDb !== was) {
      this.applyLevel();
    }
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
    /* A line heard, not only asked for: the element's audio is running. */
    this.voice.el.addEventListener('playing', () => {
      if (this.current && this.current.id) {
        this.started.push(this.current.id);
        if (this.started.length > 40) {
          this.started.splice(0, this.started.length - 40);
        }
      }
    });
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

  /* Into a graph: the calls to `voiceDest`, the music to `musicDest`, one
   * MediaElementSource each, counted through `keep`. Once: an element can
   * have one source node for its life. */
  route(ctx, voiceDest, musicDest, keep) {
    if (this.routed || !this.voice) {
      return;
    }
    keep(ctx.createMediaElementSource(this.voice.el)).connect(voiceDest);
    keep(ctx.createMediaElementSource(this.bed.el)).connect(musicDest);
    /* The intro film's lines, decoded and scheduled on the context's
     * clock (src/render/warintro.js): into the calls' destination at the
     * calls' level, so they duck and obey the settings as a call does. */
    this.filmVoice = keep(ctx.createGain());
    this.filmVoice.connect(voiceDest);
    this.routed = true;
    this.applyLevel();
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
      this.play(this.current.ids, this.current.i);
    } else if (el === this.bed.el && this.track) {
      const t = this.track;
      this.track = '';
      this.music(t);
    }
  }

  setLang(lang) {
    this.lang = lang === 'es' ? 'es' : 'en';
  }

  /*
   * A line by its lines.json id, or a list of them said back to back, in
   * its turn: prio 'call' (the default) or 'story' (PRIORITY above).
   */
  say(ids, nowMs = performance.now(), prio = 'call') {
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.some((id) => END_LINES.has(id))) {
      this.queue = [];
      this.said.push(...list.filter(isLine));
      this.play(list);
      return;
    }
    const key = list.join('+');
    if (this.queue.some((q) => q.key === key) || (this.current && this.current.key === key)) {
      return;
    }
    if (!this.current) {
      this.said.push(...list.filter(isLine));
      this.play(list);
      return;
    }
    const item = {
      key, ids: list, at: nowMs, prio,
    };
    if (this.queue.length < QUEUE_MAX) {
      this.queue.push(item);
      return;
    }
    /* A full queue: a story line pushes the oldest call out; a call never
     * pushes a story line. */
    const call = prio === 'story' ? this.queue.findIndex((q) => q.prio !== 'story') : -1;
    if (call >= 0) {
      this.queue.splice(call, 1);
      this.queue.push(item);
    }
  }

  /* An item's lines, from its i-th. A number in an item is a pause, in
   * seconds, before the line after it (docs/campaign/interior/
   * CONTRACT-P0.md section 6: the script's "after X" exchanges): no file
   * is asked for, the next line follows when the pause is over. */
  play(ids, i = 0) {
    clearTimeout(this.pauseTimer);
    this.current = { key: ids.join('+'), ids, i, id: ids[i] };
    if (this.said.length > 40) {
      this.said.splice(0, this.said.length - 40);
    }
    if (!this.voice) {
      this.current = null;
      return;
    }
    if (typeof ids[i] === 'number') {
      this.current.id = null;
      this.pauseTimer = setTimeout(() => this.next(), Math.max(0, ids[i]) * 1000);
      return;
    }
    const el = this.voice.el;
    el.src = warVoiceUrl(this.lang, ids[i], this.ext);
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => this.next());
    }
    if (this.onSpeak) {
      this.onSpeak();
    }
  }

  /* The current item's next line, or the queue's next item still fresh:
   * a story line before a call, each by its own staleness. */
  next(nowMs = performance.now()) {
    const cur = this.current;
    if (cur && cur.i + 1 < cur.ids.length) {
      this.play(cur.ids, cur.i + 1);
      return;
    }
    this.current = null;
    this.queue = this.queue.filter((q) => nowMs - q.at <= (q.prio === 'story' ? STORY_STALE_MS : STALE_MS));
    const k = Math.max(0, this.queue.findIndex((q) => q.prio === 'story'));
    const q = this.queue.splice(k, 1)[0];
    if (q) {
      this.said.push(...q.ids.filter(isLine));
      this.play(q.ids);
    }
  }

  /* A bed of BEDS by name ('intro', 'combat', The Interior's), or '' for
   * none. The level is the music setting's,
   * 0 when music is off. `at` seconds in: a screen that starts the intro
   * film late hears its music where the film is (an element seeks once
   * its length is known). */
  music(track, at = 0) {
    if (track === this.track) {
      if (track && at > 0 && this.bed && Math.abs(this.bed.el.currentTime - at) > MUSIC_SEEK_S) {
        this.bed.el.currentTime = at;
      }
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
    el.loop = BEDS[track]?.loop ?? false;
    el.src = warMusicUrl(track, this.ext);
    if (at > 0) {
      const seek = () => {
        el.currentTime = at;
      };
      el.addEventListener('loadedmetadata', seek, { once: true });
    }
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
    const duck = 10 ** (this.duckDb / 20);
    if (this.voice) {
      this.voice.el.volume = Math.min(1, this.output * VOICE_LEVEL) * duck;
    }
    if (this.filmVoice) {
      this.filmVoice.gain.value = Math.min(1, this.output * VOICE_LEVEL) * duck;
    }
    if (this.bed) {
      const bus = BEDS[this.track]?.bus ?? COMBAT_BUS;
      this.bed.el.volume = Math.min(1, this.output * this.musicLevel * bus) * duck;
    }
  }

  /* Everything stops: the war is over, or the sound was turned off. */
  stop() {
    clearTimeout(this.pauseTimer);
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
      queue: this.queue.flatMap((q) => q.ids),
      said: this.said.slice(),
      started: this.started.slice(),
      track: this.track,
      lang: this.lang,
      ext: this.ext,
      attached: Boolean(this.voice),
      volume: this.voice ? this.voice.el.volume : 0,
      duckDb: this.duckDb,
      musicVolume: this.bed ? this.bed.el.volume : 0,
      musicPlaying: this.bed ? !this.bed.el.paused : false,
    };
  }
}

