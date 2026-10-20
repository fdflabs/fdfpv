/*
 * training.js: the Defence lessons (docs/TRAINING-DAMAGE-CONTRACT.md, item
 * 18) and their judge.
 *
 * A lesson is data: the war mission its room is made for and its steps in
 * order. LessonWatch reads what the war's room credits this pilot (a kill,
 * the avionics camera's primary track, a mission's end) and the crash flag
 * from the shell's frame, and says when the lesson is passed. It reads;
 * it never writes to the plant or the sticks, so a lesson changes no
 * trajectory. Nothing is gated on a lesson.
 *
 * The fixed wing, glider, first flight and multirotor lessons, flown in
 * free flight on the Swiss valley, left with the rest of Flight Club in
 * the combat-only cut (2026-10-20); Openflight flies them now. Their
 * passes stay in progress.lessons, unread, and their paid firsts stay
 * paid.
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

import { ACT1 } from './campaign.js';
import { PRACTICE_ID } from '../share/war/missions/itaipu-practice.js';

/* Tracking a target (docs/redesign/TRAINING.md track 5): the avionics
 * camera's primary track held this long, sim ms. */
export const TRACK_HOLD_MS = 10000;

/*
 * Steps: { kill: kind, mission } an attacker of that kind the war's room
 * credited to this pilot in that mission; { track: ms } one track held as
 * the avionics camera's primary, unbroken, that long; { won: mission }
 * that war mission won, with any number of pilots. A crash starts the
 * lesson's steps again. `mission` is the war mission the lesson's room is
 * made for. The words are training.lesson.<id> and
 * training.lesson.<id>_note.
 *
 * Defence (TRAINING.md track 5, 9): in the war's aircraft, which the room
 * seats, behind the war's consent.
 */
export const LESSONS = [
  { id: 'defence_intercept', track: 'defence', mission: PRACTICE_ID, steps: [{ kill: 'strike', mission: PRACTICE_ID }] },
  { id: 'defence_track', track: 'defence', mission: PRACTICE_ID, steps: [{ track: TRACK_HOLD_MS }] },
  { id: 'defence_mission', track: 'defence', mission: ACT1[0].id, steps: [{ won: ACT1[0].id }] },
];

/*
 * A LESSON'S SETTINGS (docs/redesign/TRAINING.md 9, the lead 2026-10-13):
 * the lessons that left with Flight Club seated their aircraft, tune,
 * flight mode and weather and held what they were in storage
 * (fdfpv.lessonRestore) until the lesson was left. A page closed mid
 * lesson before the cut left them held; src/main.js puts them back once,
 * through this, and drops the key. The Defence lessons seat nothing.
 */
export const LESSON_SETTINGS = ['airframe', 'tune', 'flightMode', 'weather'];

/* Puts `held` (maybe from storage) back into `s`, each value only if
 * `valid(key, value)`: the aircraft first, so the tune is judged against
 * it. `seat(s, id)` seats an aircraft. Returns whether there was anything
 * to put back. */
export function restoreSettings(s, held, seat, valid) {
  if (!held || typeof held !== 'object') {
    return false;
  }
  if (typeof held.airframe === 'string' && valid('airframe', held.airframe) && held.airframe !== s.airframe) {
    seat(s, held.airframe);
  }
  for (const k of LESSON_SETTINGS.slice(1)) {
    if (typeof held[k] === 'string' && valid(k, held[k])) {
      s[k] = held[k];
    }
  }
  return true;
}

/* The tracks in the order the page lists them. */
export const TRACKS = ['defence'];

/*
 * CERTIFICATIONS (PROGRESSION.md 7, the lead 2026-10-13): a track's, earned
 * when every lesson of it is passed, and kept from then on
 * (progress.certs, synced; a merge never drops one). The words are
 * training.cert.<track>.
 */
export const CERTS = ['defence'];

/* The certifications `passed` (lesson id to its pass time) has earned. */
export function certsEarned(passed) {
  return CERTS.filter((t) => LESSONS.filter((l) => l.track === t).every((l) => Number.isFinite(passed[l.id]) && passed[l.id] > 0));
}

/* The avionics camera's primary track (src/avionics/tracks.js snapshot)
 * while it is seen, not coasting stale: its id, else null. */
export function heldTrack(snapshot) {
  const v = snapshot && snapshot.primaryId != null ? snapshot.tracks.find((x) => x.id === snapshot.primaryId) : null;
  return v && !v.stale ? v.id : null;
}

/*
 * Whether lesson `lesson` flies in a room of activity `mode` (a registry
 * id, src/share/modes.js): its own room keeps it (TRAINING.md 10), any
 * other ends it. The Defence lessons fly in the war's.
 */
export function lessonFliesIn(lesson, mode) {
  return lesson.mission != null && mode === 'war';
}

export function lessonById(id) {
  return LESSONS.find((l) => l.id === id) ?? null;
}

export class LessonWatch {
  constructor(lesson) {
    if (!lesson || !Array.isArray(lesson.steps) || !lesson.steps.length) {
      throw new Error('LessonWatch needs a lesson with steps');
    }
    this.lesson = lesson;
    this.passed = false;
    /* The crashes that restarted it, for the notice (progress-ui.js). */
    this.crashes = 0;
    this.restart();
  }

  /* Back to the first step: a new lesson, or a crash. */
  restart() {
    this.crashed = false;
    this.step = 0;
    this.enterStep();
  }

  enterStep() {
    this.trackId = null;
    this.trackSince = null;
  }

  get current() {
    return this.passed ? null : this.lesson.steps[this.step];
  }

  advance() {
    this.step += 1;
    if (this.step >= this.lesson.steps.length) {
      this.passed = true;
      return;
    }
    this.enterStep();
  }

  /*
   * Once a frame in flight: `simMs` the sim clock, `crashed` the shell's
   * crash flag. Times the track hold. Returns whether the lesson is
   * passed.
   */
  tick({ simMs, crashed }) {
    if (this.passed) {
      return true;
    }
    if (crashed) {
      /* Counted once per crash, however many frames it is reported. */
      const first = !this.crashed;
      this.restart();
      this.crashed = true;
      if (first) {
        this.crashes += 1;
      }
      return false;
    }
    this.crashed = false;
    const s = this.current;
    if (s.track != null && this.trackSince != null && simMs - this.trackSince >= s.track) {
      this.advance();
    }
    return this.passed;
  }

  /* An attacker the room credited to this pilot: its `kill` event
   * (src/game/events.js), victim its kind, mission the war's. */
  kill({ victim = null, mission = null } = {}) {
    const s = this.current;
    if (s && s.kill && victim === s.kill && mission === s.mission) {
      this.advance();
    }
    return this.passed;
  }

  /* The avionics camera's primary track held or let go: its `contact`
   * event, `track` the track's id, `held` which, at the event's simMs.
   * The hold is timed on tick. */
  contact({ track = null, held = false, simMs = null } = {}) {
    const s = this.current;
    if (!s || s.track == null) {
      return this.passed;
    }
    if (held && Number.isFinite(simMs)) {
      this.trackId = track;
      this.trackSince = simMs;
    } else if (track === this.trackId) {
      this.trackId = null;
      this.trackSince = null;
    }
    return this.passed;
  }

  /* A war mission's result applied to the save: its `mission_end` event. */
  missionEnd({ mission = null, won = false } = {}) {
    const s = this.current;
    if (s && s.won && mission === s.won && won === true) {
      this.advance();
    }
    return this.passed;
  }
}
