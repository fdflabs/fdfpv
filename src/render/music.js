/*
 * music.js: the recorded beds (src/render/tracks.js) on the mix bus.
 *
 * One HTMLAudioElement through one MediaElementSource, and three gains:
 * four nodes of the 64 the audio graph is allowed, and nothing decoded into
 * memory before it plays. The two crates share the element, because they
 * are never wanted together: the menu bed under every screen but a
 * flight, the flight crate while flying. The shell says which through
 * setContext.
 *
 * A crate change fades. Setting src is instant but sound returning from
 * the element is not, so swapping in the same call would cut into a
 * silent cold start. setContext starts the fade down and tick() lands the
 * change once it has run, then fades back up. Each record's position is
 * kept by id and resumed on the way back, so the menu bed is not the same
 * thirty seconds after every race.
 *
 * Three things for slow connections. The cheaper format: Opus in WebM
 * (about 2.5 MB a record) where the browser will take it, mp3 (3.1 MB)
 * where not, and a WebM that fails to decode drops the whole session to
 * mp3 rather than skipping through the crate. preload 'none': attach runs
 * on the first gesture, usually the click that starts a flight, and with
 * music off nothing at all is fetched. And one record warmed out of spare
 * bandwidth only, never under Save-Data: in the menus the flight record
 * about to be needed, once the menu bed is well ahead of itself; in flight
 * the next record in rotation, near the end and once the current one has
 * fully arrived.
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

import { str } from '../strings/index.js';
import { TRACKS, MENU_TRACKS, trackUrl, trackGain } from './tracks.js';

/*
 * Each crate's bus gain at a Music setting of ten.
 * Records arrive levelled to -17.2 LUFS (trackGain, on the element). In
 * flight 0.90 puts the bed at -30 LUFS at the default Volume 6 and Music 5
 * (docs/AUDIO.md), under four motors and the wind. The menus have nothing
 * to sit under, so the same gain would push the bed far forward on
 * screens where someone is reading; a third, 9.5 dB down, puts it back
 * where it sits in flight. The menu records are not quiet files, and
 * scripts/music.js may not make them so: the quiet is this decision. The
 * live audio-bed check taps a key on the title, so it reads the menu
 * figure (0.15 at defaults against its 0.05 floor).
 */
const BUS = { menu: 0.30, flight: 0.90 };

/* A random record of a crate, or null for an empty one. */
const anyOf = (records) => (records.length ? records[Math.floor(Math.random() * records.length)] : null);

const SECONDS = {
  /* In flight, the next record warms within this of the end: time for
   * 2.5 MB on a slow line, little wasted by a skip. */
  warmLead: 25,
  /* In the menus, the flight record warms only once the bed is this far
   * buffered ahead of itself: the line keeping up is the only licence for
   * a speculative fetch, and the bed playing comes first. */
  menuAhead: 20,
  /* The swap's fade: down quickly, so the flight bed is gone before
   * results are read; up slowly, so the next bed arrives under the
   * screen. */
  fadeDown: 0.25,
  fadeUp: 0.70,
  /* A resume this close to the end would end at once, which sounds
   * broken; the record starts from the top instead. */
  resumeMargin: 15,
};

/* MediaError codes that blame the format rather than the file. */
const FORMAT_FAULTS = new Set([3, 4]);

/* Ramp `param` from its value now to `value` by now + `seconds`. */
function rampFrom(param, now, value, seconds) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

export class Music {
  /* `crates` is tracks.js's, except where a test drives the class through
   * records of its own: the crates being empty must not leave the walk,
   * skip and warm paths unexercised. */
  constructor(crates = { menu: MENU_TRACKS, flight: TRACKS }) {
    this.records = crates;
    this.ctx = null;
    this.enabled = false;
    this.level = 0.5;
    /* 'rotation' or a flight record's id: the Music track setting. */
    this.selection = 'rotation';
    /* The crate on the element; a visit always opens in the menus. */
    this.context = 'menu';
    /* Where each crate is, kept while the other plays. The flight crate
     * starts somewhere random and walks on; the menu crate is rolled again
     * on every return to the menus. */
    this.place = { flight: crates.flight.indexOf(anyOf(crates.flight)), menu: crates.menu.indexOf(anyOf(crates.menu)) };
    /* A crate change in progress: where it is going ('' for none) and
     * when its fade down has run. */
    this.fade = { toward: '', landsAt: 0 };
    /* Seconds into each record by id, and the resume waiting for the
     * element to know its duration. */
    this.resumeAt = Object.create(null);
    this.seekTo = 0;
    this.el = null;
    this.src = null;
    this.gain = null;
    this.swap = null;
    this.duck = null;
    this.onChange = null;
    /* What the bed should be doing and what the element was last told. */
    this.intent = { play: false, starting: false };
    this.pointedAt = '';
    this.ext = 'mp3';
    this.mp3Only = false;
    this.failures = 0;
    this.warm = null;
    this.warmId = '';
  }

  get flightIndex() {
    return this.place.flight;
  }

  set flightIndex(i) {
    this.place.flight = i;
  }

  get pendingContext() {
    return this.fade.toward;
  }

  /* The record the element plays: the up crate's at its place, or null
   * when that crate has none. */
  get track() {
    return this.records[this.context][this.place[this.context]] ?? null;
  }

  /*
   * Builds the bus: the setting and the crate's level on `gain` (the
   * audio-bed check reads it, so it holds exactly that), the swap's fade
   * on `swap`, cue ducks on `duck`. Three, because a duck landing mid swap
   * must leave the swap alone. Every node goes through `keep`, the owner's
   * count against the node budget. With no media element source, or no
   * Audio, the bus is built and stays silent.
   */
  attach(ctx, dest, keep) {
    this.ctx = ctx;
    const stage = (value) => {
      const node = keep(ctx.createGain());
      node.gain.value = value;
      return node;
    };
    this.gain = stage(0);
    this.swap = stage(1);
    this.duck = stage(1);
    this.gain.connect(this.swap);
    this.swap.connect(this.duck);
    this.duck.connect(dest);
    const playable = typeof ctx.createMediaElementSource === 'function' && typeof Audio !== 'undefined';
    if (playable) {
      this.el = this.makeElement();
      this.src = keep(ctx.createMediaElementSource(this.el));
      this.src.connect(this.gain);
    }
    this.setGain();
    if (!playable) {
      return;
    }
    this.point(false);
    if (this.enabled) {
      this.resume();
    }
  }

  /* The bed's element: fetching nothing until played, inline on phones,
   * and in the cheaper format when the browser says it can open it (older
   * Safari answers ''; one that says maybe and then fails is caught when
   * the error arrives). */
  makeElement() {
    const el = new Audio();
    el.preload = 'none';
    el.loop = false;
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    const listeners = {
      ended: () => this.recordEnded(),
      error: () => this.recordFailed(),
      loadedmetadata: () => this.onMeta(),
      /* Sound that starts after the bed was turned off is stopped. */
      playing: () => {
        this.failures = 0;
        if (!this.intent.play && this.el) {
          this.el.pause();
        }
      },
    };
    Object.entries(listeners).forEach(([type, fn]) => el.addEventListener(type, fn));
    const opus = typeof el.canPlayType === 'function' && el.canPlayType(str('music.audio_webm_codecs_opus')) !== '';
    this.ext = opus ? 'webm' : 'mp3';
    return el;
  }

  setLevel(v) {
    this.level = Math.max(0, Math.min(1, v));
    this.setGain();
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    this.setGain();
    (this.enabled ? this.resume : this.pause).call(this);
  }

  setGain() {
    if (this.gain) {
      this.gain.gain.value = this.enabled ? this.level * BUS[this.context] : 0;
    }
  }

  /* `context` says which crate the record is from: the dock shows any
   * record, but the Music track setting only lists flight ones. */
  status() {
    const { id, name } = this.track ?? { id: '', name: '' };
    return { id, name, selection: this.selection, index: this.place[this.context], context: this.context };
  }

  announce() {
    if (typeof this.onChange === 'function') {
      this.onChange(this.status());
    }
  }

  /*
   * 'flight', or anything else for the menus, called on every screen
   * change, so it returns at once when that crate is up or on its way.
   * Otherwise the bed fades down and tick() lands the change; when nobody
   * can hear the bed (no graph yet, or music off) there is nothing to fade
   * and the crate changes now, so the right one is armed for later.
   */
  setContext(sel) {
    const next = sel === 'flight' ? 'flight' : 'menu';
    if (next === (this.fade.toward || this.context)) {
      return;
    }
    this.fade.toward = next;
    if (!(this.el && this.ctx && this.swap && this.enabled && this.intent.play)) {
      this.land();
      return;
    }
    const now = this.ctx.currentTime;
    rampFrom(this.swap.gain, now, 0, SECONDS.fadeDown);
    this.fade.landsAt = now + SECONDS.fadeDown;
  }

  /* Lands a crate change and fades the bed back up. Turning straight back
   * to the crate already up only fades up. */
  land() {
    const next = this.fade.toward;
    this.fade.toward = '';
    const changes = Boolean(next) && next !== this.context;
    if (changes) {
      this.notePlace();
      this.context = next;
      if (next === 'menu') {
        this.place.menu = this.records.menu.indexOf(anyOf(this.records.menu));
      }
      this.setGain();
      /* A warm was for the crate that just left. */
      this.dropWarm();
      this.point(false);
    }
    if (this.swap && this.ctx) {
      rampFrom(this.swap.gain, this.ctx.currentTime, 1, SECONDS.fadeUp);
    }
    if (changes) {
      this.announce();
    }
  }

  notePlace() {
    const at = this.el && this.track ? this.el.currentTime : NaN;
    if (Number.isFinite(at) && at > 0) {
      this.resumeAt[this.track.id] = at;
    }
  }

  /* The element only seeks once it knows its duration, so the resume
   * parked by point() is spent when the metadata arrives. */
  onMeta() {
    const at = this.seekTo;
    this.seekTo = 0;
    if (!this.el || !(at > 0)) {
      return;
    }
    const length = this.el.duration;
    if (Number.isFinite(length) && at <= length - SECONDS.resumeMargin) {
      try {
        this.el.currentTime = at;
      } catch (e) {
        /* Not seekable yet: the record plays from the top, which is fine. */
      }
    }
  }

  /*
   * The Music track setting: 'rotation', or a flight id to pin and loop;
   * anything else means rotation. It may arrive before attach, and asking
   * for rotation again changes nothing, so writing settings never re-rolls.
   * In the menus the choice is only remembered: the Sound screen writes
   * every setting on every press and must not restart the bed.
   */
  setTrack(sel) {
    const flight = this.records.flight;
    const known = flight.some((t) => t.id === sel);
    const next = sel === 'rotation' || known ? sel : 'rotation';
    const place = next === 'rotation' ? this.place.flight : flight.findIndex((t) => t.id === next);
    if (next === this.selection && place === this.place.flight) {
      return;
    }
    this.selection = next;
    this.place.flight = place;
    if (this.context !== 'flight') {
      return;
    }
    this.point(false);
    this.announce();
  }

  /* Next or previous record of the crate that is up, from the top; with
   * two menu records, a toggle. Skipping off a pinned flight record pins
   * the one it lands on. */
  skip(dir) {
    const count = this.records[this.context].length;
    if (count === 0) {
      return;
    }
    this.notePlace();
    this.place[this.context] = (this.place[this.context] + (dir < 0 ? count - 1 : 1)) % count;
    if (this.context === 'flight' && this.selection !== 'rotation') {
      this.selection = this.track.id;
    }
    this.intent.play = this.intent.play || this.enabled;
    this.point(true);
    this.announce();
  }

  /* The menu crate always walks on, a looping menu bed being the thing it
   * must not be; the flight crate walks in rotation and loops a pin. */
  recordEnded() {
    const loops = this.context === 'flight' && this.selection !== 'rotation';
    if (!loops) {
      this.skip(1);
      return;
    }
    if (this.el) {
      this.el.currentTime = 0;
      this.resume();
    }
  }

  /*
   * A WebM the browser cannot decode is the format's fault: the session
   * drops to mp3 once and the same record reloads. Anything else moves on
   * a record, until the whole crate has failed in a row, where it stops
   * rather than spinning.
   */
  recordFailed() {
    const code = this.el && this.el.error ? this.el.error.code : 4;
    if (this.ext === 'webm' && !this.mp3Only && FORMAT_FAULTS.has(code)) {
      this.mp3Only = true;
      this.ext = 'mp3';
      this.dropWarm();
      this.point(true);
      return;
    }
    this.failures += 1;
    if (this.failures < this.records[this.context].length) {
      this.skip(1);
    }
  }

  /*
   * Brings the element in line with the record it should play: looping
   * only for a pinned flight record; a new URL with its level, its resume
   * parked for onMeta (a restart asks for the top), and any warm of that
   * same record let go since the element now asks for those bytes itself;
   * the same URL rewound on a restart. Then playing, if the bed is wanted.
   */
  point(restart) {
    const el = this.el;
    if (!el) {
      return;
    }
    const record = this.track;
    if (!record) {
      /* No record: the element lets go of whatever it held and fetches
       * nothing. */
      el.pause();
      if (this.pointedAt) {
        this.pointedAt = '';
        el.removeAttribute('src');
        el.load();
      }
      return;
    }
    const url = trackUrl(record.id, this.ext);
    el.loop = this.context === 'flight' && this.selection !== 'rotation';
    if (url !== this.pointedAt) {
      this.pointedAt = url;
      el.src = url;
      el.volume = trackGain(record);
      this.seekTo = restart ? 0 : this.resumeAt[record.id] ?? 0;
      if (record.id === this.warmId) {
        this.dropWarm();
      }
    } else if (restart) {
      el.currentTime = 0;
    }
    if (this.intent.play && this.enabled) {
      this.resume();
    }
  }

  /* Keeps the place, so music back on resumes, and drops any warm, since
   * nobody will hear it. */
  pause() {
    this.intent.play = false;
    this.notePlace();
    this.el?.pause();
    this.dropWarm();
  }

  resume() {
    if (!this.enabled) {
      return;
    }
    this.intent.play = true;
    if (!this.el || !this.track) {
      return;
    }
    this.intent.starting = true;
    const started = this.el.play();
    const settled = () => {
      this.intent.starting = false;
    };
    if (started && typeof started.then === 'function') {
      started.then(settled, settled);
    } else {
      settled();
    }
  }

  /*
   * A cue ducks the bed to `depth` and lets it back up by atTime +
   * seconds. As duckFlight in src/render/audio.js: from where the bus is,
   * the deeper of the two ducks wins, and no step to unity under a cue
   * still sounding.
   */
  duckNow(atTime, depth, seconds) {
    const param = this.duck?.gain;
    if (!param) {
      return;
    }
    const from = param.value;
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(atTime);
    } else {
      param.cancelScheduledValues(atTime);
    }
    param.setValueAtTime(from, atTime);
    param.linearRampToValueAtTime(Math.min(from, depth), atTime + 0.012);
    param.linearRampToValueAtTime(1, atTime + seconds);
  }

  dropWarm() {
    if (!this.warm) {
      return;
    }
    this.warm.removeAttribute('src');
    this.warm.load();
    this.warm = null;
    this.warmId = '';
  }

  /*
   * The record worth spare bandwidth now, or ''. In the menus: the next
   * menu record when this one is near its end, otherwise the flight record
   * a flight will open on, once the bed is SECONDS.menuAhead ahead of
   * itself. In flight: only in rotation (a pin loops), near the end, and
   * once this record has arrived to within half a second of its end.
   */
  nextToWarm() {
    const { duration, currentTime, buffered } = this.el;
    const arrived = buffered.length ? buffered.end(buffered.length - 1) : null;
    const nearEnd = Number.isFinite(duration) && duration > SECONDS.warmLead && duration - currentTime <= SECONDS.warmLead;
    const after = (records, i) => records[(i + 1) % records.length]?.id ?? '';
    if (this.context === 'menu') {
      if (nearEnd) {
        return after(this.records.menu, this.place.menu);
      }
      return (arrived === null ? 0 : arrived - currentTime) >= SECONDS.menuAhead ? this.records.flight[this.place.flight]?.id ?? '' : '';
    }
    const ready = this.selection === 'rotation' && nearEnd && arrived !== null && arrived >= duration - 0.5;
    return ready ? after(this.records.flight, this.place.flight) : '';
  }

  /* Warms a record into the HTTP cache through a second, muted element
   * that is never played or connected; render.yaml serves the crate
   * immutable, so the real element's requests then hit the cache. */
  warmUp() {
    const connection = typeof navigator !== 'undefined' ? navigator.connection : null;
    if ((connection && connection.saveData) || typeof Audio === 'undefined') {
      return;
    }
    const id = this.nextToWarm();
    if (!id || id === this.warmId || id === this.track?.id) {
      return;
    }
    this.dropWarm();
    this.warmId = id;
    const warm = new Audio();
    warm.preload = 'auto';
    warm.muted = true;
    warm.src = trackUrl(id, this.ext);
    this.warm = warm;
  }

  /*
   * Every audio frame: lands a crate change whose fade has run (first, so
   * one armed before music went off still lands), restarts an element
   * paused under a bed that should play (a tab blur, an autoplay race)
   * once it has data, and otherwise warms.
   */
  tick(t) {
    if (this.fade.toward && (!Number.isFinite(t) || t >= this.fade.landsAt)) {
      this.land();
    }
    const live = this.el && this.enabled && this.intent.play && !this.intent.starting;
    if (!live) {
      return;
    }
    if (!this.el.paused) {
      this.warmUp();
    } else if (this.el.readyState >= 2) {
      this.resume();
    }
  }
}
