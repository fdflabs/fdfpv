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

import { AIR_START_STALL_MARGIN } from '../../configs/airframes.js';
import { MEDAL_STEPS } from './medals.js';
import { ACT1 } from './campaign.js';
import { PRACTICE_ID } from '../share/war/missions/itaipu-practice.js';

/* What a flight must do before it counts, and how long down and still is a
 * landing: the same as progress.js judges a landing by. */
export const TAKEOFF_HOLD_MS = 20000;
const LANDED_MS = 1000;
const FLEW_MS = 2000;
const TURN_RAD = 2 * Math.PI;
/* The sticks lesson (docs/redesign/TRAINING.md 9, the lead 2026-10-13):
 * each stick's end is 95 percent of its travel, held a second, on the
 * channels as the plant gets them (src/input/input.js: roll, pitch and
 * yaw -1 to 1, throttle 0 to 1). */
export const STICK_END = 0.95;
export const STICK_HOLD_MS = 1000;
/* The stall lesson (docs/redesign/TRAINING.md 9, the lead 2026-10-13): a
 * stall is the airspeed under the aircraft's derived clean stall
 * (configs/airframes.js `stall`), recovered once it is back to the margin
 * the air starts and the catapults use, AIR_START_STALL_MARGIN times it,
 * all of it at least STALL_FLOOR_M over the ground: the middle of the
 * height lesson's 25 to 35 m band. */
export const STALL_FLOOR_M = 30;
export const STALL_RECOVERED = AIR_START_STALL_MARGIN;
/* The coordinated turn (docs/redesign/TRAINING.md 9, the lead 2026-10-13):
 * a figure eight, two full circles of opposite bank, each counted on the
 * heading only while the bank is between EIGHT_BANK's two angles, with
 * the body's lateral acceleration under SLIP_G g the whole way. The FAA
 * Airplane Flying Handbook (FAA-H-8083-3C, Basic Flight Maneuvers) flies a
 * coordinated turn with the inclinometer's ball centred; 0.1 g is the
 * lead's reading of the ball within half its width. */
export const SLIP_G = 0.1;
export const EIGHT_BANK = [(20 * Math.PI) / 180, (45 * Math.PI) / 180];
const G = 9.81;
/* The thermal lesson (docs/redesign/TRAINING.md 9): metres climbed with
 * the throttle closed (Sticks' closed end) in rising air. More than a
 * zoom gives: the Radian trading 15 m/s for its 6.49 m/s stall climbs
 * (15^2 - 6.49^2) / 2g, 9.3 m, with no air rising at all. */
export const THERMAL_CLIMB_M = 10;
/* Tracking a target (docs/redesign/TRAINING.md track 5): the avionics
 * camera's primary track held this long, sim ms. */
export const TRACK_HOLD_MS = 10000;
const STICK_ENDS = {
  'roll+': (c) => c.roll >= STICK_END,
  'roll-': (c) => c.roll <= -STICK_END,
  'pitch+': (c) => c.pitch >= STICK_END,
  'pitch-': (c) => c.pitch <= -STICK_END,
  'yaw+': (c) => c.yaw >= STICK_END,
  'yaw-': (c) => c.yaw <= -STICK_END,
  'throttle+': (c) => c.throttle >= STICK_END,
  'throttle-': (c) => c.throttle <= 1 - STICK_END,
};

/*
 * Steps: { sticks: true } every stick held at each of its ends (STICK_END)
 * for STICK_HOLD_MS, in any order; { stall: true } a stall entered and
 * recovered without going under STALL_FLOOR_M; { eight: true } a
 * coordinated figure eight; { thermal: true }
 * THERMAL_CLIMB_M climbed, throttle closed, in rising air; { airborne: ms } in the air that long without touching down;
 * { turn: 'left' | 'right' } a full circle that way; { land: true } down
 * and whole after a real flight; { laps: n, clean } n laps on the course,
 * clean meaning no rim touched, casual meaning only laps of a casual sky
 * track count (the lap event's `kind`, progress.js courseKind); { ghost:
 * true } a lap faster than the ghost; { medal: 'bronze' } a lap that
 * reaches that medal or a better one on a course with medals
 * (src/game/medals.js); { race: n } a room
 * race finished with at least n pilots on its grid, this one among them;
 * { hold: ms, low, high, radius } held in a height band (and a circle);
 * { land: true, deadstick: true } a landing after the pack ran low;
 * { land: true, onStrip: true } a landing at rest on its place's strip;
 * { gates: n } n gates or hoops in a row without a touch;
 * { kill: kind, mission } an attacker of that kind the war's room credited
 * to this pilot in that mission; { track: ms } one track held as the
 * avionics camera's primary, unbroken, that long; { won: mission } that
 * war mission won, with any number of pilots. `mode` is a
 * quad's flight mode, 'angle' (self levelling) or 'acro'.
 * A crash starts the lesson's steps again. `aid` is the visual aid the
 * lesson draws: 'glide', the glide path to its place's strip, or 'gate',
 * the next gate's direction on the HUD. `room` is the activity
 * (src/share/modes.js) whose lobby a lesson flown with others opens;
 * `mission` the war mission a Defence lesson's room is made for.
 * `covers` lists the lessons a pass of this one passes too, because it
 * asks all they ask. The words are training.lesson.<id> and
 * training.lesson.<id>_note.
 */
export const LESSONS = [
  { id: 'first_sticks', track: 'first', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', steps: [{ sticks: true }] },
  { id: 'first_takeoff', track: 'first', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', steps: [{ airborne: TAKEOFF_HOLD_MS }] },
  { id: 'first_turns', track: 'first', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', steps: [{ turn: 'left' }, { turn: 'right' }] },
  { id: 'first_land', track: 'first', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', aid: 'glide', steps: [{ land: true }] },
  {
    id: 'first_unaided', track: 'first', airframe: 'timber1500', tune: 'timber-as3x', place: 'swiss2', aid: 'glide',
    covers: ['first_takeoff', 'first_turns', 'first_land'],
    steps: [{ airborne: TAKEOFF_HOLD_MS }, { turn: 'left' }, { turn: 'right' }, { land: true }],
  },
  { id: 'wing_height', track: 'wing', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', steps: [{ hold: 20000, low: 25, high: 35 }] },
  { id: 'wing_eight', track: 'wing', airframe: 'cub1400', tune: 'cub-as3x', place: 'swiss2', steps: [{ eight: true }] },
  { id: 'wing_stall', track: 'wing', airframe: 'timber1500', tune: 'timber-as3x', place: 'swiss2', steps: [{ stall: true }] },
  {
    id: 'wing_approaches', track: 'wing', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', aid: 'glide',
    steps: [{ land: true }, { land: true }, { land: true }],
  },
  { id: 'wing_deadstick', track: 'wing', airframe: 'timber1500', tune: 'timber-stab', place: 'swiss2', aid: 'glide', steps: [{ land: true, deadstick: true }] },
  { id: 'glider_launch', track: 'glider', airframe: 'radian2000', tune: 'radian-stab', place: 'swiss2', steps: [{ airborne: TAKEOFF_HOLD_MS }] },
  { id: 'glider_thermal', track: 'glider', airframe: 'radian2000', tune: 'radian-stab', place: 'swiss2', weather: 'breeze', steps: [{ thermal: true }] },
  { id: 'glider_land', track: 'glider', airframe: 'radian2000', tune: 'radian-stab', place: 'swiss2', aid: 'glide', steps: [{ land: true, onStrip: true }] },
  { id: 'quad_hover', track: 'multirotor', airframe: 'interceptor', mode: 'angle', place: 'swiss2', steps: [{ hold: 15000, low: 1, high: 4, radius: 3 }] },
  { id: 'quad_throttle', track: 'multirotor', airframe: 'interceptor', mode: 'angle', place: 'swiss2', steps: [{ hold: 5000, low: 9, high: 11 }] },
  {
    id: 'quad_acro', track: 'multirotor', airframe: 'interceptor', mode: 'acro', place: 'swiss2', covers: ['quad_hover'],
    steps: [{ hold: 15000, low: 1, high: 4, radius: 3 }],
  },
  { id: 'quad_gates', track: 'multirotor', airframe: null, mode: null, place: null, aid: 'gate', steps: [{ laps: 1, clean: true, casual: true }] },
  { id: 'quad_precision', track: 'multirotor', airframe: null, mode: null, place: null, aid: 'gate', steps: [{ gates: 10 }] },
  { id: 'race_lap', track: 'racing', airframe: null, tune: null, place: null, aid: 'gate', steps: [{ laps: 1, clean: false }] },
  { id: 'race_clean', track: 'racing', airframe: null, tune: null, place: null, aid: 'gate', covers: ['race_lap'], steps: [{ laps: 1, clean: true }] },
  { id: 'race_bronze', track: 'racing', airframe: null, tune: null, place: null, aid: 'gate', steps: [{ medal: 'bronze' }] },
  { id: 'race_ghost', track: 'racing', airframe: null, tune: null, place: null, aid: 'gate', steps: [{ ghost: true }] },
  { id: 'race_pilot', track: 'racing', airframe: null, tune: null, place: null, aid: 'gate', room: 'race', steps: [{ race: 2 }] },
  /* Defence (TRAINING.md track 5, 9): in the war's aircraft, which the
   * room seats, behind the war's consent. */
  {
    id: 'defence_intercept', track: 'defence', airframe: null, tune: null, place: null, mission: PRACTICE_ID,
    steps: [{ kill: 'strike', mission: PRACTICE_ID }],
  },
  { id: 'defence_track', track: 'defence', airframe: null, tune: null, place: null, mission: PRACTICE_ID, steps: [{ track: TRACK_HOLD_MS }] },
  { id: 'defence_mission', track: 'defence', airframe: null, tune: null, place: null, mission: ACT1[0].id, steps: [{ won: ACT1[0].id }] },
];

/*
 * THE STRIPS a glide path is drawn to, in the world's frame (Three.js, y
 * up, metres): the threshold's x and z, and the way a landing rolls along
 * the ground. The Swiss valley's strip is the Alps' (src/maps/alps/terrain.js
 * STRIP_L long and STRIP_W wide, along z at the origin; training:selftest
 * reads them from there), landed from its +z end towards -z.
 */
export const STRIPS = {
  swiss2: { x: 0, z: 160 / 2, dirX: 0, dirZ: -1, length: 160, width: 12 },
};

/* Whether { x, z } in the world is on `strip`: along it from the
 * threshold, within half its width of its centre line. */
export function onStrip(strip, p) {
  const dx = p.x - strip.x;
  const dz = p.z - strip.z;
  const along = dx * strip.dirX + dz * strip.dirZ;
  const across = dx * strip.dirZ - dz * strip.dirX;
  return along >= 0 && along <= strip.length && Math.abs(across) <= strip.width / 2;
}

/* The glide path: a gate every SPACING metres back up the approach at
 * SLOPE (radians, a model's steeper approach than a full size 3 degrees),
 * the nearest NEAR metres short of the threshold. */
export const GLIDE = { slope: (6 * Math.PI) / 180, spacing: 18, count: 10, near: 12 };

/* The glide path's gates, nearest first: { x, y, z } with y above the
 * ground at the threshold, `groundY`. */
export function glidePoints(strip, groundY) {
  const out = [];
  for (let i = 0; i < GLIDE.count; i += 1) {
    const back = GLIDE.near + i * GLIDE.spacing;
    out.push({
      x: strip.x - strip.dirX * back,
      y: groundY + back * Math.tan(GLIDE.slope),
      z: strip.z - strip.dirZ * back,
    });
  }
  return out;
}

/*
 * The next gate's direction for the HUD: `cam` the camera's position and
 * its forward and up unit vectors, `to` the gate's centre, all in one frame.
 * Returns the angle round the crosshair (radians, 0 up the screen, positive
 * clockwise) and whether the gate is ahead within `cone` (radians), where
 * the gate itself is the cue and no arrow is drawn.
 */
export function gateCue(cam, to, cone = 0.35) {
  const dx = to.x - cam.x;
  const dy = to.y - cam.y;
  const dz = to.z - cam.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const f = cam.forward;
  const u = cam.up;
  const r = { x: f.y * u.z - f.z * u.y, y: f.z * u.x - f.x * u.z, z: f.x * u.y - f.y * u.x };
  const ahead = (dx * f.x + dy * f.y + dz * f.z) / len;
  const right = (dx * r.x + dy * r.y + dz * r.z) / len;
  const upward = (dx * u.x + dy * u.y + dz * u.z) / len;
  return { angle: Math.atan2(right, upward), ahead: ahead > Math.cos(cone) };
}

/*
 * A LESSON'S SETTINGS (docs/redesign/TRAINING.md 9, the lead 2026-10-13):
 * flying one seats its aircraft, tune, flight mode and weather in the
 * pilot's stored settings, and what they were goes back when the lesson
 * is left, so no lesson leaves Breeze or a trainer's tune behind.
 */
export const LESSON_SETTINGS = ['airframe', 'tune', 'flightMode', 'weather'];

/* The settings a lesson would change, as they are in `s`. */
export function heldSettings(s) {
  return Object.fromEntries(LESSON_SETTINGS.map((k) => [k, s[k]]));
}

/* Seats `lesson` in settings `s`; `seat(s, id)` seats an aircraft. */
export function applyLesson(s, lesson, seat) {
  const craft = lesson.airframe || s.airframe;
  if (craft !== s.airframe) {
    seat(s, craft);
  }
  if (lesson.tune) {
    s.tune = lesson.tune;
  }
  if (lesson.mode) {
    s.flightMode = lesson.mode;
  }
  if (lesson.weather) {
    s.weather = lesson.weather;
  }
}

/* Puts `held` (heldSettings, maybe from storage) back into `s`, each
 * value only if `valid(key, value)`: the aircraft first, so the tune is
 * judged against it. Returns whether there was anything to put back. */
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
export const TRACKS = ['first', 'wing', 'glider', 'multirotor', 'racing', 'defence'];

/*
 * CERTIFICATIONS (PROGRESSION.md 7, the lead 2026-10-13): a track's, earned
 * when every lesson of it is passed, a pass by "I fly already" included,
 * and kept from then on (progress.certs, synced; a merge never drops one).
 * Because a stored one is never taken back, a track is listed only once
 * every lesson TRAINING.md gives it exists here; First flight has none.
 * The words are training.cert.<track>.
 */
export const CERTS = ['wing', 'glider', 'multirotor', 'racing', 'defence'];

/* The certifications `passed` (lesson id to its pass time) has earned. */
export function certsEarned(passed) {
  return CERTS.filter((t) => LESSONS.filter((l) => l.track === t).every((l) => Number.isFinite(passed[l.id]) && passed[l.id] > 0));
}

/* "I fly already": per track, the one lesson an experienced pilot flies
 * to pass the track's basics at once (TRAINING.md 4), the lesson that
 * covers the rest. */
export const SKIPS = { first: 'first_unaided', multirotor: 'quad_acro', racing: 'race_clean' };

/* What a pass of lesson `id` passes: itself and what it covers. */
export function passesOf(id) {
  const l = lessonById(id);
  return l ? [l.id, ...(l.covers || [])] : [];
}

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

/* The craft's bank from a plant state: the roll about its nose, radians,
 * positive with the right wing down (the plant's y is left, so a positive
 * roll lifts the left wing). */
export function bankOf(st) {
  const w = st[7];
  const x = st[8];
  const y = st[9];
  const z = st[10];
  return Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
}

/*
 * The body's lateral acceleration, g, what an inclinometer's ball reads:
 * the specific force (the velocity's change over one plant step, less
 * gravity) along the body's left axis, from two consecutive plant states
 * (src/native/sim_abi.h: [0] t, [4..6] world velocity, [7..10] body to
 * world). Positive to the left; null without two states a step apart.
 */
export function lateralG(prev, curr) {
  const dt = prev && curr ? curr[0] - prev[0] : 0;
  if (!(dt > 0)) {
    return null;
  }
  const fx = (curr[4] - prev[4]) / dt;
  const fy = (curr[5] - prev[5]) / dt;
  const fz = (curr[6] - prev[6]) / dt + G;
  const w = curr[7];
  const x = curr[8];
  const y = curr[9];
  const z = curr[10];
  return (fx * 2 * (x * y - w * z) + fy * (1 - 2 * (x * x + z * z)) + fz * 2 * (y * z + w * x)) / G;
}

/* The avionics camera's primary track (src/avionics/tracks.js snapshot)
 * while it is seen, not coasting stale: its id, else null. */
export function heldTrack(snapshot) {
  const v = snapshot && snapshot.primaryId != null ? snapshot.tracks.find((x) => x.id === snapshot.primaryId) : null;
  return v && !v.stale ? v.id : null;
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
    this.lowBattery = false;
    this.enterStep();
  }

  /* What one step counts. The flight itself (in the air since, flown)
   * carries over, so a landing straight after the last turn counts. */
  enterStep() {
    this.heading = null;
    this.turned = 0;
    this.laps = 0;
    this.clean = true;
    this.holdSince = null;
    this.holdAt = null;
    this.streak = 0;
    this.endSince = {};
    this.endsHeld = new Set();
    this.stalled = false;
    this.thermalLow = null;
    this.eight = null;
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
   * crash flag, `grounded` on a surface, `heading` the craft's yaw in
   * radians (z up, positive left), `agl` metres above the ground under
   * it, `pos` its { x, z } in the world, `battery` the OSD's 'ok',
   * 'warning' or 'critical', `sticks` the channels the plant got this
   * frame, `airspeed` m/s through the air and `stall` the seated
   * aircraft's clean stall, m/s (null on a quad), `airUp` the air's rise
   * where the craft is, m/s. `pos` carries its height, y. Returns whether
   * the lesson is passed. `bank` is the craft's bank, radians, positive
   * right wing down (bankOf), and `slipG` its lateral acceleration, g
   * (lateralG).
   */
  tick({
    simMs, crashed, grounded, heading = null, agl = null, pos = null, battery = 'ok', sticks = null, airspeed = null, stall = null, airUp = 0,
    bank = null, slipG = null,
  }) {
    if (this.passed) {
      return true;
    }
    if (crashed) {
      this.restart();
      return false;
    }
    if (battery && battery !== 'ok') {
      this.lowBattery = true;
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
    if (s.sticks && sticks) {
      this.judgeSticks(simMs, sticks);
    } else if (s.stall) {
      this.judgeStall(grounded, agl, airspeed, stall);
    } else if (s.eight) {
      this.judgeEight(grounded, heading, bank, slipG);
    } else if (s.thermal) {
      this.judgeThermal(grounded, pos, sticks, airUp);
    } else if (s.track != null) {
      if (this.trackSince != null && simMs - this.trackSince >= s.track) {
        this.advance();
      }
    } else if (s.airborne != null && !grounded && simMs - this.airSince >= s.airborne) {
      this.advance();
    } else if (s.turn && heading != null) {
      this.judgeTurn(s.turn, heading, grounded);
    } else if (s.hold != null) {
      this.judgeHold(s, simMs, grounded, agl, pos);
    } else if (s.land && grounded && this.flew && (!s.deadstick || this.lowBattery) && (!s.onStrip || (pos && onStrip(STRIPS[this.lesson.place], pos)))) {
      this.downSince ??= simMs;
      if (simMs - this.downSince >= LANDED_MS) {
        /* The next landing needs another flight. */
        this.flew = false;
        this.advance();
      }
    }
    return this.passed;
  }

  /* { sticks: true }: each end held STICK_HOLD_MS; letting go of an end
   * before then starts that end's second again. */
  judgeSticks(simMs, sticks) {
    for (const [end, at] of Object.entries(STICK_ENDS)) {
      if (!at(sticks)) {
        delete this.endSince[end];
        continue;
      }
      this.endSince[end] ??= simMs;
      if (simMs - this.endSince[end] >= STICK_HOLD_MS) {
        this.endsHeld.add(end);
      }
    }
    if (this.endsHeld.size === Object.keys(STICK_ENDS).length) {
      this.advance();
    }
  }

  /* { stall: true }: under the stall speed and back to STALL_RECOVERED
   * times it, never under STALL_FLOOR_M in between; going under it, or
   * down, makes the next stall the one that counts. */
  judgeStall(grounded, agl, airspeed, stall) {
    if (!(stall > 0) || airspeed == null || agl == null) {
      return;
    }
    if (grounded || agl < STALL_FLOOR_M) {
      this.stalled = false;
      return;
    }
    if (airspeed < stall) {
      this.stalled = true;
    } else if (this.stalled && airspeed >= STALL_RECOVERED * stall) {
      this.advance();
    }
  }

  /* { eight: true }, on the heading's integral `h`, which counts a frame's
   * turn only while the bank is in EIGHT_BANK towards it (right wing down
   * turning right). The first circle is `h` reaching a full turn either
   * way, `dir`; the second is `h` coming back a full turn from the
   * furthest it went, `peak`, so the circles are joined where the heading
   * reverses. A slip of SLIP_G or more, or the ground, starts it again. */
  judgeEight(grounded, heading, bank, slipG) {
    if (heading == null || bank == null || slipG == null) {
      return;
    }
    if (grounded || Math.abs(slipG) >= SLIP_G) {
      this.eight = null;
      return;
    }
    const e = this.eight ?? { heading, h: 0, dir: 0, peak: 0 };
    this.eight = e;
    const d = turnBetween(e.heading, heading);
    e.heading = heading;
    const inBand = Math.abs(bank) >= EIGHT_BANK[0] && Math.abs(bank) <= EIGHT_BANK[1];
    if (inBand && Math.sign(d) === (bank > 0 ? -1 : 1)) {
      e.h += d;
    }
    if (e.dir === 0) {
      if (Math.abs(e.h) >= TURN_RAD) {
        e.dir = Math.sign(e.h);
        e.peak = e.h;
      }
      return;
    }
    e.peak = e.dir > 0 ? Math.max(e.peak, e.h) : Math.min(e.peak, e.h);
    if ((e.peak - e.h) * e.dir >= TURN_RAD) {
      this.advance();
    }
  }

  /* { thermal: true }: the height climbed from the lowest point since the
   * throttle closed in rising air; opening it, sinking air or the ground
   * starts again. */
  judgeThermal(grounded, pos, sticks, airUp) {
    const soaring = !grounded && pos && sticks && sticks.throttle <= 1 - STICK_END && airUp > 0;
    if (!soaring) {
      this.thermalLow = null;
      return;
    }
    this.thermalLow = Math.min(this.thermalLow ?? pos.y, pos.y);
    if (pos.y - this.thermalLow >= THERMAL_CLIMB_M) {
      this.advance();
    }
  }

  /* { hold: ms, low, high, radius }: that long in the air between low and
   * high metres over the ground and, with a radius, within it of where the
   * hold began. Leaving the box starts the hold again from there. */
  judgeHold(s, simMs, grounded, agl, pos) {
    const inBand = !grounded && agl != null && agl >= s.low && agl <= s.high;
    const inBox = !s.radius || (pos && this.holdAt && Math.hypot(pos.x - this.holdAt.x, pos.z - this.holdAt.z) <= s.radius);
    if (!inBand || (this.holdSince != null && !inBox)) {
      this.holdSince = null;
      this.holdAt = null;
      return;
    }
    if (this.holdSince == null) {
      this.holdSince = simMs;
      this.holdAt = pos ? { x: pos.x, z: pos.z } : null;
      return;
    }
    if (simMs - this.holdSince >= s.hold) {
      this.advance();
    }
  }

  /* A gate or hoop flown through: { gates: n } counts n in a row. */
  gatePass() {
    const s = this.current;
    if (!s || !s.gates) {
      return this.passed;
    }
    this.streak += 1;
    if (this.streak >= s.gates) {
      this.advance();
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
    this.streak = 0;
  }

  /* A round ended (its event in the flight's log, src/game/events.js): a
   * room race this pilot finished carries game 'race' and its grid's size. */
  round({ game = null, pilots = null } = {}) {
    const s = this.current;
    if (s && s.race && game === 'race' && Number.isInteger(pilots) && pilots >= s.race) {
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

  /* A lap closed: `lap` its event in the flight's log (src/game/events.js:
   * its `ms`, the `medal` it reached or null and its course's `kind`,
   * progress.js courseKind), `ghostMs` the ghost's lap or null, which the
   * log does not carry. */
  lap({ ms = null, medal = null, kind = null } = {}, ghostMs = null) {
    const s = this.current;
    if (!s) {
      return this.passed;
    }
    if (s.ghost && ms != null && ghostMs != null && ms < ghostMs) {
      this.advance();
    } else if (s.medal && MEDAL_STEPS.indexOf(medal) >= MEDAL_STEPS.indexOf(s.medal)) {
      this.advance();
    } else if (s.laps && (this.clean || !s.clean) && (!s.casual || kind === 'casual')) {
      this.laps += 1;
      if (this.laps >= s.laps) {
        this.advance();
      }
    }
    this.clean = true;
    return this.passed;
  }
}
