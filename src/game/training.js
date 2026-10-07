/*
 * training.js: the lessons (docs/TRAINING-DAMAGE-CONTRACT.md, item 18) and
 * their judge.
 *
 * A lesson is data: the aircraft and tune it is flown on, the place, and
 * its steps in order. LessonWatch is fed what RunWatch (progress.js) is fed,
 * from the shell's frame, plus the craft's heading for the turn steps, and
 * says when the lesson is passed. It reads; it never writes to the plant or
 * the sticks, so a lesson changes no trajectory. The assist is a tune id from
 * configs/registry.js: Stabilised is the auto level, Acro is the lesson
 * without it. Nothing is gated on a lesson.
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

/* What a flight must do before it counts, and how long down and still is a
 * landing: the same as progress.js judges a landing by. */
export const TAKEOFF_HOLD_MS = 20000;
const LANDED_MS = 1000;
const FLEW_MS = 2000;
const TURN_RAD = 2 * Math.PI;

/*
 * Steps: { airborne: ms } in the air that long without touching down;
 * { turn: 'left' | 'right' } a full circle that way; { land: true } down
 * and whole after a real flight; { laps: n, clean } n laps on the course,
 * clean meaning no rim touched; { ghost: true } a lap faster than the ghost.
 * A crash starts the lesson's steps again. The words are
 * training.lesson.<id> and training.lesson.<id>_note.
 */
export const LESSONS = [
  { id: 'first_takeoff', track: 'first', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', steps: [{ airborne: TAKEOFF_HOLD_MS }] },
  { id: 'first_turns', track: 'first', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', steps: [{ turn: 'left' }, { turn: 'right' }] },
  { id: 'first_land', track: 'first', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', steps: [{ land: true }] },
  {
    id: 'first_unaided', track: 'first', airframe: 'timber1500', tune: 'timber-acro', place: 'swiss2',
    steps: [{ airborne: TAKEOFF_HOLD_MS }, { turn: 'left' }, { turn: 'right' }, { land: true }],
  },
  { id: 'race_lap', track: 'racing', airframe: null, tune: null, place: null, steps: [{ laps: 1, clean: false }] },
  { id: 'race_clean', track: 'racing', airframe: null, tune: null, place: null, steps: [{ laps: 1, clean: true }] },
  { id: 'race_ghost', track: 'racing', airframe: null, tune: null, place: null, steps: [{ ghost: true }] },
];

/* The tracks in the order the page lists them. */
export const TRACKS = ['first', 'racing'];

/*
 * The craft's heading from a plant state (src/sim, CLAUDE.md): the body to
 * world quaternion is st[7..10] as w, x, y, z, in the plant's frame, z up,
 * x forward, y left (src/render/frame.js). The yaw about +z, so a turn to
 * the left raises it: what LessonWatch's turn steps count as left.
 */
export function headingOf(st) {
  const w = st[7];
  const x = st[8];
  const y = st[9];
  const z = st[10];
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

export function lessonById(id) {
  return LESSONS.find((l) => l.id === id) ?? null;
}

/* The heading change from `a` to `b`, radians, wrapped to (-pi, pi]. */
function turnBetween(a, b) {
  let d = b - a;
  while (d > Math.PI) {
    d -= 2 * Math.PI;
  }
  while (d <= -Math.PI) {
    d += 2 * Math.PI;
  }
  return d;
}

export class LessonWatch {
  constructor(lesson) {
    if (!lesson || !Array.isArray(lesson.steps) || !lesson.steps.length) {
      throw new Error('LessonWatch needs a lesson with steps');
    }
    this.lesson = lesson;
    this.passed = false;
    this.restart();
  }

  /* Back to the first step: a new lesson, or a crash. */
  restart() {
    this.step = 0;
    this.airSince = null;
    this.flew = false;
    this.downSince = null;
    this.enterStep();
  }

  /* What one step counts. The flight itself (in the air since, flown)
   * carries over, so a landing straight after the last turn counts. */
  enterStep() {
    this.heading = null;
    this.turned = 0;
    this.laps = 0;
    this.clean = true;
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
   * crash flag, `grounded` on a surface, `heading` the craft's yaw in
   * radians (z up, positive left). Returns whether the lesson is passed.
   */
  tick({ simMs, crashed, grounded, heading = null }) {
    if (this.passed) {
      return true;
    }
    if (crashed) {
      this.restart();
      return false;
    }
    if (grounded) {
      this.airSince = null;
    } else {
      this.downSince = null;
      if (this.airSince == null) {
        this.airSince = simMs;
      }
      if (simMs - this.airSince >= FLEW_MS) {
        this.flew = true;
      }
    }
    const s = this.current;
    if (s.airborne != null && !grounded && simMs - this.airSince >= s.airborne) {
      this.advance();
    } else if (s.turn && heading != null) {
      this.judgeTurn(s.turn, heading, grounded);
    } else if (s.land && grounded && this.flew) {
      this.downSince ??= simMs;
      if (simMs - this.downSince >= LANDED_MS) {
        this.advance();
      }
    }
    return this.passed;
  }

  judgeTurn(dir, heading, grounded) {
    if (grounded) {
      this.heading = null;
      this.turned = 0;
      return;
    }
    if (this.heading != null) {
      this.turned += turnBetween(this.heading, heading);
    }
    this.heading = heading;
    if ((dir === 'left' ? this.turned : -this.turned) >= TURN_RAD) {
      this.advance();
    }
  }

  /* The craft touched a rim (progress.js RIM_KINDS decides what is one). */
  rim() {
    this.clean = false;
  }

  /* A lap closed: `ms` its time, `ghostMs` the ghost's lap or null. */
  lap({ ms = null, ghostMs = null } = {}) {
    const s = this.current;
    if (!s) {
      return this.passed;
    }
    if (s.ghost && ms != null && ghostMs != null && ms < ghostMs) {
      this.advance();
    } else if (s.laps && (this.clean || !s.clean)) {
      this.laps += 1;
      if (this.laps >= s.laps) {
        this.advance();
      }
    }
    this.clean = true;
    return this.passed;
  }
}
