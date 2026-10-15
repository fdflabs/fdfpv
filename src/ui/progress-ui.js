/*
 * progress-ui.js: progression on screen. The toasts, the hangar's
 * Challenges tab, the locks on the picker and in the hangar, and the rows
 * in Settings, all over src/game/progress.js, which is the arithmetic.
 *
 * The shell (src/main.js) tells a Progress what happens in a run, through
 * startRun, gatePass, touch, lap and tick; Progress logs each as the
 * flight's events (src/game/events.js), pays what the log earned through
 * the one fold (progress.js awardFlight), keeps the pilot's progress in
 * settings.progress, stores it on every change, and says what it earned
 * in a toast: a lap's XP, a challenge done, a level, and
 * each thing that level opens. The toasts are the one thing here drawn in
 * flight, so they take no pointer and sit clear of the OSD's corners.
 *
 * Nothing here imports three.js: scripts import src/ui/ui.js in Node.
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

import { airframeById } from '../../configs/airframes.js';
import { liveryKey } from '../../configs/liveries.js';
import {
  AIRCRAFT_CHALLENGE_IDS, AIRCRAFT_CHALLENGE_XP, CHALLENGES, RIM_KINDS, RunWatch, awardFlight,
  bestKind, challengeAmounts, challengeRun, findItem, fits, itemKey, levelInfo, levelStart, lockOf, unlockables,
} from '../game/progress.js';
import { placeKey, placesAt, placesOf } from '../game/discovery.js';
import { ACT1, INTERIOR } from '../game/campaign.js';
import { EventLog } from '../game/events.js';
import { itemById } from '../game/economy.js';
import { LessonWatch, certsEarned, lessonById, lessonFliesIn, passesOf } from '../game/training.js';
import { readWallet } from '../share/account.js';
import { flightTotals } from '../share/flighttime.js';
import { currentLocale, str } from '../strings/index.js';
import { registerHangarTab } from './hangar.js';
import { el } from './dom.js';
import { formatTime } from './format.js';
import { challengeNote, challengeTitle } from './challengewords.js';

/* How long a toast stays up, ms, and how many are on screen at once. */
const TOAST_MS = 3600;
const TOAST_MAX = 3;
const TOAST_MAX_FLYING = 2;

function number(n) {
  return n.toLocaleString(currentLocale());
}

/* An item's words: its own string key or function, or the plane's name. */
export function itemName(it) {
  if (typeof it.name === 'function') {
    return it.name();
  }
  if (typeof it.name === 'string') {
    return str(it.name);
  }
  if (it.name && it.name.key) {
    return str(it.name.key, it.name.vars);
  }
  return it.id;
}

/* A best's words: the lap or the run with its time, or the points. */
export function bestTitle(best) {
  const kind = bestKind(best.key);
  if (kind === 'lap') {
    return str('progress.best_lap', { time: formatTime(best.now) });
  }
  if (kind === 'run') {
    return str('progress.best_run', { n: Number(best.key.split(':')[1]), time: formatTime(best.now) });
  }
  return str('progress.best_score', { n: number(best.now) });
}

function kindWord(kind) {
  return str(['plane', 'power', 'scheme', 'prop', 'addon', 'finish', 'decal'].includes(kind) ? `progress.kind_${kind}` : 'progress.kind_other');
}

const STYLE = `
#ui > .pg-toasts { visibility: visible; }
.pg-toasts {
  position: absolute; left: 50%; top: max(64px, calc(env(safe-area-inset-top) + 56px)); z-index: 30;
  transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px;
  pointer-events: none; width: min(440px, calc(100% - 32px));
}
.pg-toast {
  display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 12px;
  width: 100%; box-sizing: border-box; padding: 10px 14px 10px 10px; border-radius: 14px;
  background: linear-gradient(180deg, rgba(24, 32, 26, 0.94), rgba(10, 14, 11, 0.95));
  border: 1px solid rgba(243, 234, 212, 0.14);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(243, 234, 212, 0.07);
  color: var(--cream); font-family: var(--ui-font);
  animation: pg-in 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.pg-toast.out { animation: pg-out 360ms cubic-bezier(0.2, 0.9, 0.25, 1) both; }
.pg-toast-icon {
  width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
  font: 800 18px/1 var(--ui-font); color: var(--deep); background: var(--amber);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 6px 18px rgba(255, 212, 92, 0.35);
}
.pg-toast.challenge .pg-toast-icon { background: var(--mint); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 6px 18px rgba(125, 255, 180, 0.35); }
.pg-toast.unlock .pg-toast-icon { background: var(--cream); }
.pg-toast.level { border-color: rgba(255, 212, 92, 0.55); }
.pg-toast.level .pg-toast-icon { width: 44px; font-size: 20px; }
.pg-toast-words { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pg-toast-kicker { font: 700 10px/1 var(--ui-font); letter-spacing: 0.18em; text-transform: uppercase; color: var(--slate); }
.pg-toast.challenge .pg-toast-kicker { color: var(--mint); }
.pg-toast.level .pg-toast-kicker, .pg-toast.unlock .pg-toast-kicker { color: var(--amber); }
.pg-toast-title { font: 800 16px/1.2 var(--ui-font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pg-toast-sub { font: 600 12px/1.2 var(--ui-font); color: var(--slate); }
.pg-toast-bar { height: 3px; border-radius: 2px; background: rgba(243, 234, 212, 0.12); overflow: hidden; margin-top: 3px; }
.pg-toast-fill { display: block; height: 100%; transform-origin: left center; background: linear-gradient(90deg, #ffb43c, var(--amber)); transition: transform 900ms cubic-bezier(0.2, 0.9, 0.25, 1) 200ms; }
.pg-toast-xp { font: 800 14px/1 var(--ui-font); color: var(--amber); font-variant-numeric: tabular-nums; white-space: nowrap; }
@keyframes pg-in { from { opacity: 0; transform: translateY(-18px) scale(0.92); } to { opacity: 1; transform: none; } }
@keyframes pg-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-10px) scale(0.96); } }

.pg-level { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 14px; align-items: center; margin-top: 2px; }
.pg-ring {
  width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center;
  background: conic-gradient(var(--amber) calc(var(--frac) * 1turn), rgba(243, 234, 212, 0.1) 0);
  box-shadow: 0 6px 22px rgba(255, 212, 92, 0.18);
}
.pg-ring-in {
  width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center;
  background: #111812; font: 800 22px/1 var(--ui-font); color: var(--amber); font-variant-numeric: tabular-nums;
}
.pg-level-words { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.pg-level-name { font: 800 20px/1.1 var(--ui-font); }
.pg-level-xp { font: 600 13px/1.2 var(--ui-font); color: var(--slate); font-variant-numeric: tabular-nums; }
.pg-level-next { font: 600 13px/1.35 var(--ui-font); color: var(--cream); opacity: 0.85; }
.pg-switch {
  appearance: none; width: 100%; margin-top: 14px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center;
  text-align: left; padding: 11px 12px; border-radius: 12px; cursor: pointer; color: var(--cream);
  border: 1px solid rgba(243, 234, 212, 0.16); background: rgba(243, 234, 212, 0.04);
  font: 700 14px/1.2 var(--ui-font); transition: border-color 160ms, background 160ms;
}
.pg-switch:hover, .pg-switch:focus-visible { border-color: rgba(243, 234, 212, 0.5); background: rgba(243, 234, 212, 0.07); }
.pg-switch-note { display: block; margin-top: 4px; font: 500 12px/1.35 var(--ui-font); color: var(--slate); }
.pg-knob {
  position: relative; width: 44px; height: 24px; border-radius: 999px; background: rgba(243, 234, 212, 0.16);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35); transition: background 200ms;
}
.pg-knob::after {
  content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--cream); transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.pg-switch.on .pg-knob { background: var(--mint); }
.pg-switch.on .pg-knob::after { transform: translateX(20px); background: var(--deep); }
.pg-list { display: flex; flex-direction: column; gap: 7px; }
.pg-ch {
  display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 10px; align-items: start;
  padding: 10px 11px; border-radius: 11px; border: 1px solid rgba(243, 234, 212, 0.1); background: rgba(243, 234, 212, 0.03);
}
.pg-ch.here { border-color: rgba(255, 212, 92, 0.35); background: rgba(255, 212, 92, 0.05); }
.pg-ch.done { border-color: rgba(125, 255, 180, 0.3); background: rgba(125, 255, 180, 0.05); }
.pg-ch.shut { opacity: 0.55; }
.pg-ch-mark {
  width: 22px; height: 22px; margin-top: 1px; border-radius: 50%; display: grid; place-items: center;
  box-shadow: inset 0 0 0 2px rgba(243, 234, 212, 0.3); font: 800 12px/1 var(--ui-font); color: var(--deep);
}
.pg-ch.here .pg-ch-mark { box-shadow: inset 0 0 0 2px var(--amber); }
.pg-ch.done .pg-ch-mark { background: var(--mint); box-shadow: none; }
.pg-ch-words { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pg-ch-title { font: 700 14px/1.25 var(--ui-font); }
.pg-ch-note { font: 500 12px/1.4 var(--ui-font); color: var(--slate); }
.pg-ch-xp { font: 800 12px/1 var(--ui-font); color: var(--amber); white-space: nowrap; padding-top: 3px; font-variant-numeric: tabular-nums; }
.pg-ch.done .pg-ch-xp { color: var(--mint); }
.pg-soon { display: flex; flex-direction: column; gap: 6px; }
.pg-soon-row { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 10px; align-items: baseline; font: 600 13px/1.35 var(--ui-font); }
.pg-soon-lv { font: 800 11px/1 var(--ui-font); letter-spacing: 0.12em; text-transform: uppercase; color: var(--amber); }
.pg-lock {
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  font: 800 10px/1 var(--ui-font); letter-spacing: 0.12em; text-transform: uppercase; color: var(--amber);
  padding: 4px 8px; border-radius: 999px; background: rgba(255, 212, 92, 0.12); border: 1px solid rgba(255, 212, 92, 0.3);
}
.pg-new {
  align-self: flex-start; font: 800 10px/1 var(--ui-font); letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--deep); background: var(--mint); padding: 4px 8px; border-radius: 999px;
}
.hangar-card.pg-locked, .hangar-scheme.pg-locked { cursor: not-allowed; opacity: 0.6; border-style: dashed; }
.hangar-card.pg-locked:hover, .hangar-scheme.pg-locked:hover { transform: none; }
.carousel-info .pg-lock, .carousel-info .pg-new { align-self: center; margin-top: 6px; }
.carousel-info .pg-why { margin: 8px auto 0; max-width: 34em; font: 600 14px/1.4 var(--ui-font); color: var(--amber); text-align: center; }
.carousel-choose.pg-unlock { background: var(--amber); color: var(--deep); }
@media (prefers-reduced-motion: reduce) {
  .pg-toast, .pg-toast.out { animation: none; }
  .pg-toast-fill, .pg-knob::after { transition: none; }
}
@media (max-height: 520px) {
  .pg-toasts { top: 10px; }
}
`;

function injectStyle() {
  if (document.getElementById('pg-style')) {
    return;
  }
  const s = document.createElement('style');
  s.id = 'pg-style';
  s.textContent = STYLE;
  document.head.append(s);
}

/*
 * THE CONTROLLER, one per Ui: `ui` is the Ui (its settings, its store and
 * its sounds), `host` its root.
 */
/*
 * The lesson in flight, { id, step }, kept in storage from its Fly until it
 * is passed or left, so the next load knows a reload or a closed browser
 * interrupted it (docs/redesign/TRAINING.md 10). Without storage nothing
 * is kept and nothing is said.
 */
const LESSON_IN_FLIGHT_KEY = 'fdfpv.lessonInFlight';

function keepLessonInFlight(w) {
  try {
    if (w) {
      localStorage.setItem(LESSON_IN_FLIGHT_KEY, JSON.stringify({ id: w.lesson.id, step: w.step }));
    } else {
      localStorage.removeItem(LESSON_IN_FLIGHT_KEY);
    }
  } catch (e) {
    /* No storage: a reload says nothing of it. */
  }
}

function takeLessonInFlight() {
  try {
    const was = JSON.parse(localStorage.getItem(LESSON_IN_FLIGHT_KEY) || 'null');
    localStorage.removeItem(LESSON_IN_FLIGHT_KEY);
    return was && typeof was.id === 'string' && Number.isInteger(was.step) && was.step >= 0 ? was : null;
  } catch (e) {
    return null;
  }
}

export class Progress {
  constructor(ui, host) {
    this.ui = ui;
    this.host = host;
    this.watch = new RunWatch();
    /* The run's state as the challenges read it (progress.js
     * challengeRun), carried across the flights of one run: a recovery or
     * a placement starts a new log, not a new run. */
    this.run = challengeRun();
    /* This flight's events (src/game/events.js), and the sim clock as the
     * last tick gave it, for the calls that do not carry one. */
    this.flight = new EventLog();
    /* How far into this flight's log progress has counted. */
    this.folded = 0;
    /* The bests this run set (progress.js awardBest's `best` events), for
     * its debrief to say (runBests); a new run (the sim clock back to its
     * start, src/main.js reset) forgets them. */
    this.bests = [];
    this.simMs = 0;
    this.wasCrashed = false;
    /* The avionics camera's primary track as last logged (contact). */
    this.heldTrack = null;
    /* The world this flight's places are looked for in, and the ids not
     * to look for: found already, or the flight began inside them
     * (src/game/discovery.js); null until the flight's first tick. */
    this.placeWorld = null;
    this.placeSkip = null;
    this.toasts = [];
    /* Every toast shown, newest last, for a check to read. */
    this.log = [];
    injectStyle();
    this.stack = el('div', 'pg-toasts');
    this.stack.setAttribute('aria-live', 'polite');
    host.append(this.stack);
    this.bindCarousel(ui.carousel);
  }

  get state() {
    return this.ui.settings.progress;
  }

  save() {
    this.ui.persistSettings();
  }

  /* Whether an item is locked for this pilot now: { level }, { shop }
   * for a shop item the account does not own (src/game/economy.js; Unlock
   * all does not open those, docs/ECONOMY.md rule 5), or null. */
  lock(kind, id, airframe = null) {
    const item = itemById(`${kind}:${id}`);
    if (item) {
      const w = readWallet();
      return w && w.owned[item.id] ? null : { shop: item.earn ? 'earn' : 'buy' };
    }
    return lockOf(this.state, kind, id, airframe);
  }

  /* A casual sky track just made (src/main.js onBuild): its id is how its
   * laps are known as the casual track's from now on. */
  markCasual(id) {
    this.state.casual[id] = true;
    this.save();
  }

  isCasual(id) {
    return Boolean(id) && Boolean(this.state.casual[id]);
  }

  setUnlockAll(on) {
    this.state.unlockAll = Boolean(on);
    this.save();
  }

  /* The run the shell just seated: which plane on which power, and
   * whether the crash flag is up as it is seated (ctx.crashed). */
  startRun(ctx) {
    this.watch.start(ctx);
    this.event('seated', {
      airframe: ctx.airframe, fixedWing: Boolean(ctx.fixedWing), power: ctx.power ?? null, smallestPack: Boolean(ctx.smallestPack), crashed: Boolean(ctx.crashed),
    });
  }

  /* A new flight from the spawn at sim time `simMs`; `roomNow` the room
   * clock while in a room. The last flight's log is folded to its end and
   * ends here. */
  startFlight(simMs, roomNow = null) {
    this.foldFlight();
    if (simMs <= 0 || simMs < this.simMs) {
      this.bests = [];
    }
    this.simMs = simMs;
    this.flight.end(simMs);
    this.flight = new EventLog({ roomNow });
    this.folded = 0;
    this.heldTrack = null;
    this.placeSkip = null;
    this.flight.append('spawned', simMs);
  }

  /*
   * This flight's events not yet folded, paid (progress.js awardFlight,
   * the one place an achievement is paid), stored when anything was, and
   * each award said in its own toast. A best and an aircraft challenge
   * are kept for the run's debrief too (src/game/debrief.js withBests).
   * Returns the awards' events.
   */
  foldFlight() {
    /* A sync answered by a server older than progress v2 can hand back
     * progress without the map. */
    if (!this.state.firsts || typeof this.state.firsts !== 'object') {
      this.state.firsts = {};
    }
    const { at, counted, awards } = awardFlight(this.state, this.flight.events, this.folded, this.run, {
      campaign: this.ui.settings.campaign,
      seconds: flightTotals(this.ui.settings.flightTime).byAirframe,
    });
    this.folded = at;
    if (counted || awards.length) {
      this.save();
    }
    for (const group of awards) {
      for (const e of group) {
        if (e.type === 'best') {
          this.bests.push(e);
        } else if (e.type === 'aircraft_challenge') {
          this.bests.push({ key: `challenge:${e.key}`, airframe: e.airframe, id: e.id });
        }
      }
      this.show(group);
    }
    return awards.flat();
  }

  /* The bests this run set and the aircraft challenges it did, for its
   * debrief (src/game/debrief.js withBests), which may be drawn more than
   * once. */
  runBests() {
    return this.bests.slice();
  }

  /* A Streamer Combat round or a Catch the Ace! match this pilot had a
   * seat in, ended by the room, on world `world` (src/main.js): logged,
   * folded, and its first paid now rather than at the next flight time.
   * `more.points` is this pilot's in the room's final standings, which a
   * best is read from; a best of this game's last round is forgotten
   * first, so a debrief says only this round's. */
  roundFinished(game, world, more = {}) {
    this.bests = this.bests.filter((b) => bestKind(b.key) !== game);
    const round = this.event('round', { game, world, ...more });
    this.foldFlight();
    if (this.lesson) {
      this.lesson.round(round);
      this.lessonNews();
    }
  }

  /* Attackers the room credited to this pilot's warhead (src/share/roomwar.js
   * dead `kills`) in war mission `mission`, each a `kill` on the seated
   * aircraft, then folded. */
  killed(kills, mission = null) {
    for (const k of kills) {
      const kill = this.event('kill', { airframe: this.airframe, victim: k.kind, mission });
      if (this.lesson) {
        this.lesson.kill(kill);
      }
    }
    this.foldFlight();
    this.lessonNews();
  }

  /* The avionics camera's primary track this frame (src/game/training.js
   * heldTrack), or null: a `contact` event on each change only. */
  contact(track) {
    if (track === this.heldTrack) {
      return;
    }
    const was = this.heldTrack;
    this.heldTrack = track;
    if (was != null) {
      this.feedLesson(this.event('contact', { track: was, held: false }));
    }
    if (track != null) {
      this.feedLesson(this.event('contact', { track, held: true }));
    }
  }

  /* A logged event the lesson reads with no call of its own: a contact,
   * and a war mission's end, which src/ui/campaign.js logs. */
  feedLesson(e) {
    if (!this.lesson || !e) {
      return;
    }
    if (e.type === 'contact') {
      this.lesson.contact(e);
    } else if (e.type === 'mission_end') {
      this.lesson.missionEnd(e);
    }
    this.lessonNews();
  }

  /* The seated aircraft, for the events counted per aircraft. */
  get airframe() {
    return this.watch.ctx ? this.watch.ctx.airframe : null;
  }

  /* One event into this flight's log at the last tick's sim time. */
  event(type, data = {}) {
    const e = this.flight.append(type, this.simMs, data);
    if (type === 'mission_end') {
      this.feedLesson(e);
    }
    return e;
  }

  /*
   * THE LESSON being flown (src/game/training.js), or none: judged beside
   * the challenges from the same calls, and said in toasts. It lasts until
   * another lesson or endLesson (any other card).
   */
  startLesson(lesson) {
    this.lesson = lesson ? new LessonWatch(lesson) : null;
    this.lessonStep = 0;
    this.lessonCrashes = 0;
    this.interrupted = null;
    keepLessonInFlight(this.lesson);
    if (lesson) {
      this.toast({
        cls: 'lap', icon: '1', kicker: str('training.toast_lesson'),
        title: str(`training.lesson.${lesson.id}`), sub: str(`training.lesson.${lesson.id}_note`),
      });
    }
  }

  endLesson() {
    this.lesson = null;
    keepLessonInFlight(null);
    if (this.onLessonEnd) {
      this.onLessonEnd();
    }
  }

  /* The visual aid the lesson in flight draws, or null. */
  lessonAid() {
    return this.lesson ? this.lesson.lesson.aid ?? null : null;
  }

  /*
   * INTERRUPTIONS (docs/redesign/TRAINING.md 10, COMPLETENESS item 55),
   * each said in a toast under the lesson's name. The pause menu holds the
   * lesson (its judge counts on the sim clock, stopped while paused); a
   * crash starts it again (lessonNews); a session that is not its own, or
   * the page gone, leaves it, and the page marks it Interrupted.
   */
  lessonNotice(id, key, vars = {}) {
    this.toast({ cls: 'lap', icon: '!', kicker: str('training.toast_lesson'), title: str(`training.lesson.${id}`), sub: str(key, vars) });
  }

  /* The pause menu opened over a lesson's flight (src/ui/actions.js). */
  lessonPaused() {
    const w = this.lesson;
    if (w && !w.passed) {
      this.lessonNotice(w.lesson.id, 'training.interrupt_held', { n: w.step + 1, of: w.lesson.steps.length });
    }
  }

  /* A room's welcome, activity `mode` (src/main.js roomSessionWelcome). */
  roomJoined(mode) {
    const w = this.lesson;
    if (!w || lessonFliesIn(w.lesson, mode)) {
      return;
    }
    this.interrupted = w.lesson.id;
    this.lessonNotice(w.lesson.id, 'training.interrupt_room');
    this.endLesson();
  }

  /* At load: the lesson the last page was flying when it went, said and
   * marked on the Learn to fly page until a lesson is flown again. */
  lessonReloaded() {
    const was = takeLessonInFlight();
    const lesson = was ? lessonById(was.id) : null;
    if (!lesson) {
      return;
    }
    this.interrupted = lesson.id;
    this.lessonNotice(lesson.id, 'training.interrupt_reload', { n: Math.min(was.step, lesson.steps.length - 1) + 1, of: lesson.steps.length });
  }

  /* After a lesson call: a toast for each step done, a crash's restart,
   * and the pass. */
  lessonNews() {
    const w = this.lesson;
    if (w && w.crashes > this.lessonCrashes) {
      this.lessonCrashes = w.crashes;
      this.lessonNotice(w.lesson.id, 'training.interrupt_crash');
    }
    if (!w || w.step === this.lessonStep) {
      return;
    }
    const total = w.lesson.steps.length;
    if (w.passed) {
      const now = Date.now();
      for (const id of passesOf(w.lesson.id)) {
        this.state.lessons[id] ??= now;
      }
      /* Only the lesson actually flown pays its first (progress.js
       * lessonsFlown); what it covers is passed, not flown. The map is
       * made here when a profile from before it has none. */
      this.state.lessonsFlown ??= {};
      this.state.lessonsFlown[w.lesson.id] = true;
      this.state.certs ??= {};
      const certified = certsEarned(this.state.lessons).filter((t) => !this.state.certs[t]);
      for (const track of certified) {
        this.state.certs[track] = now;
      }
      this.save();
      this.toast({ cls: 'challenge', icon: '\u2713', kicker: str('training.toast_passed'), title: str(`training.lesson.${w.lesson.id}`) });
      for (const track of certified) {
        this.toast({ cls: 'challenge', icon: '\u2605', kicker: str('training.toast_cert'), title: str(`training.cert.${track}`) });
      }
      this.lesson = null;
      keepLessonInFlight(null);
      return;
    }
    keepLessonInFlight(w);
    if (w.step > this.lessonStep) {
      this.toast({ cls: 'lap', icon: String(w.step + 1), kicker: str('training.toast_step', { n: w.step + 1, of: total }), title: str(`training.lesson.${w.lesson.id}`) });
    }
    this.lessonStep = w.step;
  }

  gatePass() {
    this.event('gate');
    this.foldFlight();
    if (this.lesson) {
      this.lesson.gatePass();
      this.lessonNews();
    }
  }

  /* Folded with the next fold: a touch pays nothing by itself. */
  touch(kind) {
    this.event('touch', { kind });
    if (this.lesson && RIM_KINDS.includes(kind)) {
      this.lesson.rim();
    }
  }

  /* A lap closed on `course`, { key, kind }; `ms` its time, `ghostMs`
   * the ghost's it was flown against, and `medal` the one it reached on a
   * course with medals (src/game/medals.js), each null when there is none;
   * `n` and `of` the lap's place in a solo run and the run's laps, null in
   * a room, so a run's best is read from the log (progress.js bestsOf). */
  lap(course, { ms = null, ghostMs = null, medal = null, n = null, of = null } = {}) {
    const lapped = this.event('lap', { ms, airframe: this.airframe, medal, kind: course.kind, course: course.key ?? null, n, of });
    this.foldFlight();
    if (this.lesson) {
      this.lesson.lap(lapped, ghostMs);
      this.lessonNews();
    }
  }

  tick(state) {
    this.simMs = state.simMs;
    const logged = this.flight.events.length;
    /* Its own edge: startRun clears RunWatch's flag mid crash. */
    if (state.crashed && !this.wasCrashed) {
      this.event('crash', { airframe: this.airframe });
    }
    this.wasCrashed = Boolean(state.crashed);
    const landings = this.watch.landings;
    for (const edge of this.watch.tick(state)) {
      this.event(edge);
    }
    if (this.watch.landings > landings) {
      this.event('landing', { airframe: this.airframe, airMs: this.watch.lastAirMs });
    }
    this.lookForPlaces(state);
    if (this.flight.events.length > logged) {
      this.foldFlight();
    }
    if (this.lesson) {
      this.lesson.tick(state);
      this.lessonNews();
    }
  }

  /*
   * DISCOVERY: a place of the world flown into is logged `found`, and
   * the fold pays it once (progress.js awardFlight, awardPlace).
   * `state.world` is the world's registry id, `state.pos` the craft in
   * the map's frame and `state.agl` its height over what is under it. On
   * a flight's first tick the places it began inside are set aside, so a
   * spawn or a placement finds nothing.
   */
  lookForPlaces({ world, pos, agl, crashed }) {
    if (!placesOf(world).length || crashed || !pos) {
      return;
    }
    if (this.placeSkip === null || this.placeWorld !== world) {
      this.placeWorld = world;
      const found = placesOf(world).filter((p) => this.state.places && this.state.places[placeKey(world, p.id)]).map((p) => p.id);
      this.placeSkip = new Set([...found, ...placesAt(world, pos, agl)]);
      return;
    }
    for (const id of placesAt(world, pos, agl, this.placeSkip)) {
      this.placeSkip.add(id);
      this.event('found', { world, id });
    }
  }

  /*
   * The firsts the pilot's own record now shows and has not been paid
   * for: a mission's win and stars from the campaign, an aircraft's
   * milestones from the flight time. Asked after whatever can make one
   * outside a flight's log: flight time committed, a war result recorded,
   * a sync that brought another computer's, and once at start, which is
   * how a profile from before firsts (progress v1) is paid, once. Paid
   * by the same fold as the rest (foldFlight).
   */
  checkFirsts() {
    return this.foldFlight();
  }

  /* The events of an award, as toasts: one for what earned the XP, which
   * says so when it made a level, then one for what each level opened,
   * the plane first and the rest counted. */
  show(events) {
    const xp = events.find((e) => e.type === 'xp');
    const ch = events.find((e) => e.type === 'challenge');
    const firsts = events.filter((e) => e.type === 'first');
    const medal = events.find((e) => e.type === 'medal');
    const best = events.find((e) => e.type === 'best' && e.xp > 0);
    const place = events.find((e) => e.type === 'place');
    const feat = events.find((e) => e.type === 'aircraft_challenge');
    const levels = events.filter((e) => e.type === 'level');
    const up = levels.length ? levels[levels.length - 1].level : 0;
    const info = levelInfo(this.state.xp);
    if (medal) {
      this.toast({
        cls: `medal medal-${medal.medal}${up ? ' level' : ''}`,
        icon: '\u25CF',
        kicker: str('progress.toast_medal'),
        title: str(`medal.${medal.medal}`),
        xp: xp ? xp.xp : 0,
        frac: info.frac,
      });
    } else if (place) {
      this.toast({
        cls: `first${up ? ' level' : ''}`,
        icon: up ? String(up) : '\u2691',
        kicker: up ? str('progress.toast_place_level', { n: up }) : str('progress.toast_place'),
        title: str(`discovery.place.${place.world}.${place.id}`),
        sub: str(`discovery.place.${place.world}.${place.id}_fact`),
        xp: xp ? xp.xp : 0,
        frac: info.frac,
      });
    } else if (feat) {
      this.toast({
        cls: `challenge${up ? ' level' : ''}`,
        icon: '\u2713',
        kicker: up ? str('progress.toast_challenge_level', { n: up }) : str('progress.toast_challenge'),
        title: str('progress.item_on', { item: challengeTitle(feat.airframe, feat.id), plane: airframeById(feat.airframe).name }),
        xp: xp ? xp.xp : 0,
        frac: info.frac,
      });
    } else if (best) {
      this.toast({
        cls: `best${up ? ' level' : ''}`,
        icon: up ? String(up) : '\u2191',
        kicker: up ? str('progress.toast_best_level', { n: up }) : str('progress.toast_best'),
        title: bestTitle(best),
        xp: xp ? xp.xp : 0,
        frac: info.frac,
      });
    } else if (firsts.length) {
      this.toast({
        cls: `first${up ? ' level' : ''}`,
        icon: up ? String(up) : '\u2691',
        kicker: up ? str('progress.toast_first_level', { n: up }) : str('progress.toast_first'),
        title: firstTitle(firsts[0].key),
        sub: firsts.length > 1 ? str('progress.first_more', { n: firsts.length - 1 }) : '',
        xp: xp ? xp.xp : 0,
        frac: info.frac,
      });
    } else if (ch) {
      this.toast({
        cls: `challenge${up ? ' level' : ''}`,
        icon: '\u2713',
        kicker: up ? str('progress.toast_challenge_level', { n: up }) : str('progress.toast_challenge'),
        title: str(`progress.challenge.${ch.id}`),
        xp: xp ? xp.xp : 0,
        frac: info.frac,
      });
    } else if (xp) {
      this.toast({
        cls: `lap${up ? ' level' : ''}`,
        icon: up ? String(up) : '+',
        kicker: str(xp.why && xp.why.first ? 'progress.toast_first_track' : 'progress.toast_lap'),
        title: str(up ? 'progress.level_up' : 'progress.level', { n: info.level }),
        xp: xp.xp,
        frac: info.frac,
      });
    }
    const order = { plane: 0, power: 1, prop: 2, addon: 3, scheme: 4, finish: 5, decal: 6 };
    for (const e of levels) {
      const items = events.filter((u) => u.type === 'unlock' && u.item.level === e.level).map((u) => u.item)
        .sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3));
      if (items.length) {
        this.toast({
          cls: 'unlock',
          icon: '\u2605',
          kicker: str('progress.toast_unlocked', { kind: kindWord(items[0].kind) }),
          title: this.unlockTitle(items[0]),
          sub: items.length > 1 ? str('progress.and_more', { n: items.length - 1 }) : '',
        });
      }
    }
  }

  unlockTitle(it) {
    return it.airframe ? str('progress.item_on', { item: itemName(it), plane: airframeById(it.airframe).name }) : itemName(it);
  }

  /* A toast waits its turn: TOAST_MAX are up at once, the rest follow as
   * those go. */
  toast(t) {
    this.log.push({ cls: t.cls, kicker: t.kicker, title: t.title, sub: t.sub ?? '', xp: t.xp ?? 0 });
    this.pending = this.pending || [];
    this.pending.push(t);
    this.pump();
  }

  pump() {
    /* Two in flight, where they are over the pilot's view; more on a menu. */
    const max = this.ui.screen === 'flight' ? TOAST_MAX_FLYING : TOAST_MAX;
    while (this.pending && this.pending.length && this.toasts.length < max) {
      this.raise(this.pending.shift());
    }
  }

  raise({ cls, icon, kicker, title, sub = '', xp = 0, frac = null }) {
    const t = el('div', `pg-toast ${cls}`);
    const words = el('div', 'pg-toast-words');
    words.append(el('span', 'pg-toast-kicker', kicker), el('span', 'pg-toast-title', title));
    if (sub) {
      words.append(el('span', 'pg-toast-sub', sub));
    }
    if (frac != null) {
      const bar = el('span', 'pg-toast-bar');
      const fill = el('span', 'pg-toast-fill');
      fill.style.transform = 'scaleX(0)';
      bar.append(fill);
      words.append(bar);
      requestAnimationFrame(() => {
        fill.style.transform = `scaleX(${Math.max(0.03, Math.min(1, frac))})`;
      });
    }
    t.append(el('span', 'pg-toast-icon', icon), words, el('span', 'pg-toast-xp', xp ? str('progress.xp_gain', { n: number(xp) }) : ''));
    this.stack.append(t);
    const entry = { t };
    this.toasts.push(entry);
    /* Each toast after the first stays a little longer, so a lap that
     * opens a level reads as a sequence and not as a wall. */
    entry.timer = setTimeout(() => this.drop(entry), TOAST_MS + 450 * (this.toasts.length - 1));
    if (this.ui.onUiSound) {
      this.ui.onUiSound(cls === 'lap' ? 'adjust' : 'select');
    }
  }

  drop(entry) {
    const i = this.toasts.indexOf(entry);
    if (i < 0) {
      return;
    }
    this.toasts.splice(i, 1);
    clearTimeout(entry.timer);
    entry.t.classList.add('out');
    setTimeout(() => {
      entry.t.remove();
      this.pump();
    }, 380);
  }

  /*
   * THE PICKER'S LOCKS (src/ui/carousel.js decorate and blocked). This is
   * where a pilot meets a lock, so it is where the way past one is: a
   * locked plane is on show with the level that opens it and how far off
   * that is, and its Choose button becomes Unlock everything, which opens
   * it and everything else at once (the Challenges tab turns it back
   * off). Choose then chooses. A plane opened since the pilot last saw it
   * wears New until it has been centred once.
   */
  bindCarousel(c) {
    if (!c) {
      return;
    }
    c.blocked = (id) => {
      if (!this.lock('plane', id)) {
        return false;
      }
      this.setUnlockAll(true);
      if (this.ui.onUiSound) {
        this.ui.onUiSound('select');
      }
      c.paint();
      return true;
    };
    c.decorate = (car, id) => {
      for (const n of car.root.querySelectorAll('.carousel-info .pg-lock, .carousel-info .pg-new, .carousel-info .pg-why')) {
        n.remove();
      }
      const lock = this.lock('plane', id);
      car.chooseBtn.classList.toggle('pg-unlock', Boolean(lock));
      if (lock) {
        const info = levelInfo(this.state.xp);
        car.chooseBtn.textContent = str('progress.unlock_all');
        const why = el('p', 'pg-why', str('progress.plane_opens', {
          n: lock.level, plane: airframeById(id).name, level: info.level, xp: number(levelStart(lock.level) - this.state.xp),
        }));
        car.nameEl.after(el('span', 'pg-lock', str('progress.locked_level', { n: lock.level })), why);
        return;
      }
      const key = itemKey('plane', liveryKey(id));
      if (this.isNew(key)) {
        car.nameEl.after(el('span', 'pg-new', str('progress.new')));
        this.state.seen[key] = true;
        this.save();
      }
    };
  }

  /* Opened by progression, and not yet seen since. */
  isNew(key) {
    const s = this.state;
    if (s.unlockAll || s.seen[key]) {
      return false;
    }
    const it = unlockables().find((x) => x.key === key);
    return Boolean(it) && lockOf(s, it.kind, it.id, it.airframe) == null;
  }

  /*
   * A hangar card for an item progression can lock (Hangar.markLock):
   * locked, it is shown dimmed with its level and cannot be picked; newly
   * opened, it says New, once.
   */
  markCard(b, kind, id, airframe) {
    const lock = this.lock(kind, id, airframe);
    if (lock) {
      b.disabled = true;
      b.classList.add('pg-locked');
      b.setAttribute('aria-disabled', 'true');
      b.append(el('span', 'pg-lock', lock.shop ? str(`progress.locked_${lock.shop}`) : str('progress.locked_level', { n: lock.level })));
      return;
    }
    const it = findItem(kind, id, airframe);
    if (it && this.isNew(it.key)) {
      b.append(el('span', 'pg-new', str('progress.new')));
      this.newShown.add(it.key);
    }
  }

  /* The hangar opened and shut: what it showed as New is seen. */
  hangarOpened(h) {
    this.newShown = new Set();
    h.markLock = (b, kind, id) => this.markCard(b, kind, id, h.id);
  }

  hangarClosed() {
    if (this.newShown && this.newShown.size) {
      for (const k of this.newShown) {
        this.state.seen[k] = true;
      }
      this.save();
    }
    this.newShown = new Set();
  }

  /*
   * THE CHALLENGES TAB: the level and how far into it, the Unlock all
   * switch, this plane's challenges first and then the rest, and what the
   * next levels open.
   */
  paintTab(h) {
    const box = el('div', 'hangar-tab pg-tab');
    const s = this.state;
    const info = levelInfo(s.xp);
    box.append(el('h3', 'hangar-h', str('progress.your_level')));
    const lv = el('div', 'pg-level');
    const ring = el('div', 'pg-ring');
    ring.style.setProperty('--frac', String(s.unlockAll ? 1 : info.frac));
    ring.append(el('span', 'pg-ring-in', String(info.level)));
    const words = el('div', 'pg-level-words');
    words.append(
      el('span', 'pg-level-name', str('progress.level', { n: info.level })),
      el('span', 'pg-level-xp', str('progress.xp_of', { xp: number(s.xp), to: number(info.to) })),
    );
    const next = s.unlockAll ? null : unlockables().filter((it) => it.level > info.level).sort((a, b) => a.level - b.level)[0];
    words.append(el('span', 'pg-level-next', next
      ? str('progress.next_unlock', { n: next.level, what: this.unlockTitle(next) })
      : str('progress.all_open')));
    lv.append(ring, words);
    box.append(lv);

    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = `pg-switch${s.unlockAll ? ' on' : ''}`;
    sw.dataset.key = 'unlock-all';
    sw.dataset.focus = 'overview';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(s.unlockAll));
    const label = el('span', null, str('progress.unlock_all'));
    label.append(el('span', 'pg-switch-note', str('progress.unlock_all_note')));
    sw.append(label, el('span', 'pg-knob'));
    sw.addEventListener('click', () => {
      this.setUnlockAll(!s.unlockAll);
      h.changed('unlock-all');
    });
    box.append(sw);

    if (challengeAmounts(h.id)) {
      box.append(el('h3', 'hangar-h', str('progress.this_aircraft', { plane: airframeById(h.id).name })));
      box.append(this.aircraftList(h.id));
    }
    const ctx = { airframe: h.id, fixedWing: Boolean(airframeById(h.id).fixedWing), power: this.powerKind(h) };
    const here = CHALLENGES.filter((c) => fits(c, ctx) && c.plane);
    const rest = CHALLENGES.filter((c) => !here.includes(c));
    if (here.length) {
      box.append(el('h3', 'hangar-h', str('progress.this_plane')));
      box.append(this.challengeList(here, true));
    }
    box.append(el('h3', 'hangar-h', str(here.length ? 'progress.more_challenges' : 'progress.challenges')));
    box.append(this.challengeList(rest, false));

    if (!s.unlockAll) {
      const soon = unlockables().filter((it) => it.level > info.level).sort((a, b) => a.level - b.level).slice(0, 5);
      if (soon.length) {
        box.append(el('h3', 'hangar-h', str('progress.coming_up')));
        const list = el('div', 'pg-soon');
        for (const it of soon) {
          const row = el('div', 'pg-soon-row');
          row.append(el('span', 'pg-soon-lv', str('progress.level', { n: it.level })), el('span', null, this.unlockTitle(it)));
          list.append(row);
        }
        box.append(list);
      }
    }
    box.append(el('p', 'hangar-source', str('progress.how_to_earn')));
    return box;
  }

  powerKind(h) {
    const option = h.power && h.power.options ? h.power.options.find((o) => o.id === h.choice.option) : null;
    return option ? option.kind : null;
  }

  /* The aircraft's own three (progress.js AIRCRAFT_CHALLENGE_IDS), with
   * the amounts its class gives, each done or its XP. */
  aircraftList(airframe) {
    const box = el('div', 'pg-list');
    const family = liveryKey(airframe);
    for (const id of AIRCRAFT_CHALLENGE_IDS) {
      const done = Boolean(this.state.aircraftChallenges && this.state.aircraftChallenges[`${family}:${id}`]);
      const row = el('div', `pg-ch${done ? ' done' : ' here'}`);
      row.dataset.challenge = `${family}:${id}`;
      const words = el('div', 'pg-ch-words');
      words.append(el('span', 'pg-ch-title', challengeTitle(airframe, id)), el('span', 'pg-ch-note', challengeNote(airframe, id)));
      row.append(el('span', 'pg-ch-mark', done ? '\u2713' : ''), words, el('span', 'pg-ch-xp', done ? str('progress.done') : str('progress.xp_gain', { n: number(AIRCRAFT_CHALLENGE_XP) })));
      box.append(row);
    }
    return box;
  }

  challengeList(list, here) {
    const box = el('div', 'pg-list');
    for (const c of list) {
      const done = Boolean(this.state.challenges[c.id]);
      const shut = !done && c.plane && Boolean(this.lock('plane', c.plane));
      const row = el('div', `pg-ch${done ? ' done' : here ? ' here' : ''}${shut ? ' shut' : ''}`);
      row.dataset.challenge = c.id;
      const words = el('div', 'pg-ch-words');
      words.append(el('span', 'pg-ch-title', str(`progress.challenge.${c.id}`)), el('span', 'pg-ch-note', str(`progress.challenge.${c.id}_note`)));
      if (shut) {
        words.append(el('span', 'pg-lock', str('progress.plane_at', { plane: airframeById(c.plane).name, n: this.lock('plane', c.plane).level })));
      }
      row.append(el('span', 'pg-ch-mark', done ? '\u2713' : ''), words, el('span', 'pg-ch-xp', done ? str('progress.done') : str('progress.xp_gain', { n: number(c.xp) })));
      box.append(row);
    }
    return box;
  }
}

/* The Challenges tab, in the hangar's tab registry. Progress is the Ui's;
 * the tab finds it through the settings the hangar is opened with. */
let active = null;

const MISSION_KEYS = new Map([
  ...ACT1.map((m) => [m.id, `campaign.m.${m.key}`]),
  ...INTERIOR.map((m) => [m.id, `ops.campaign.interior.m.${m.key}`]),
]);

/* The words for a room game's first (progress.js PLAYED_GAMES, WORLDS):
 * each game's card name and each world's registry name. */
const GAME_NAMES = { combat: 'combat.card', tag: 'roomtag.section' };
const WORLD_NAMES = { alps: 'registry.the_alps', swiss2: 'registry.swiss2', itaipu: 'registry.itaipu', interior: 'registry.interior' };

/* A first's words, from its key (progress.js firstsOf). */
export function firstTitle(key) {
  const [what, id, part] = key.split(':');
  if (what === 'lesson') {
    return str('progress.first.lesson', { lesson: str(`training.lesson.${id}`) });
  }
  if (what === 'game') {
    return str('progress.first.game', { game: str(GAME_NAMES[id]), world: str(WORLD_NAMES[part]) });
  }
  if (what === 'mission') {
    const mission = str(MISSION_KEYS.get(id) ?? id);
    return part === 'win' ? str('progress.first.win', { mission }) : str('progress.first.star', { mission, n: part.slice(4) });
  }
  const af = airframeById(id);
  return str(`progress.first.${part}`, { plane: af ? af.name : id });
}

export function bindProgress(p) {
  active = p;
}

registerHangarTab({
  id: 'challenges',
  focus: 'overview',
  open(h) {
    if (active) {
      active.hangarOpened(h);
    }
  },
  close() {
    if (active) {
      active.hangarClosed();
    }
  },
  paint(h) {
    return active ? active.paintTab(h) : el('div', 'hangar-tab');
  },
});
