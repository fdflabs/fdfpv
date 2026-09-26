/*
 * verify.js: check a posted lap against the course, headlessly.
 *
 * A time on the board arrives with a ghost: position and attitude at 30 Hz
 * for the whole lap, and a split per gate crossing. Until now the board
 * checked only that the ghost's duration matched the claimed lap, which is
 * a check on internal consistency and nothing else: a ghost that flies
 * straight through the ground and posts a four second lap passes it. This
 * module runs the simulator's own gate detector over the ghost and asks
 * the questions a marshal would: did it start on the line, pass every gate
 * in flying order, cross the line again, and does the clock agree.
 *
 * It is a pure function of the track document, the ghost bytes and the
 * claimed lap, with no DOM, no Three.js and no module state, so the board
 * imports it from a pinned checkout of this repository and the two can
 * never disagree about what a gate is. Anything the board could not know
 * from the ghost, such as whether the craft was buried in the dirt at the
 * moment of a pass, stays the simulator's business: this check is at most
 * more permissive than the simulator, never stricter, so a lap the
 * simulator scored always passes it and a lap it did not may not.
 *
 * This is geometry, not re-simulation. The physics is deterministic, but a
 * lap is not a pure function of the stick recording: the shell feeds the
 * module a ground plane and contacts from the scene every millisecond, and
 * several of those calls are gated on the wall clock. Re-simulating a lap
 * headlessly means extracting the world builders from the renderer, which
 * is written down as the next step and not taken here.
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

import { courseFromDocument } from './trackdoc.js';
import { Race } from './race.js';
import { decodeGhost } from '../share/ghostdata.js';
import { isMapTrack, normalize } from '../trackbuilder/model.js';
import { raceGatesOf } from '../builder/course.js';

/*
 * A crossing time recovered from a 30 Hz ghost is interpolated inside a
 * 33 ms interval, and the simulator's own crossing was interpolated inside a
 * render frame, so the two clocks disagree by a few tens of milliseconds on
 * an honest lap. Sixty is about two ghost intervals: loose enough never to
 * refuse a real lap, tight enough that a lap padded by a hover at the line
 * is refused.
 */
export const LAP_TOLERANCE_MS = 60;

/* The ghost recorder's own teleport threshold, src/game/ghost.js. A segment
 * faster than this is a respawn or a forgery, and neither is a lap. */
export const TELEPORT_SPEED = 100;

/*
 * The gates as the race detector wants them, from a built course. This is
 * what src/render/scene.js does on the way to building meshes, reduced to
 * the arithmetic: a station is already one aperture in flying order with
 * its opening centred at baseY + centreY above the terrain, and along the
 * course the terrain is flat, so a gate's base is its station's baseY.
 */
export function gatesFromCourse(course) {
  return course.stations.map((st, i) => {
    const aperture = { centreY: st.centreY, clearW: st.clearW, clearH: st.clearH };
    return {
      position: { x: st.x, y: st.baseY ?? 0, z: st.z },
      heading: st.yaw,
      pitch: st.pitch ?? 0,
      flyOrder: i,
      elementId: st.elementId,
      apertureIndex: st.apertureIndex,
      kindName: st.type,
      virtual: Boolean(st.virtual),
      apertures: [aperture],
      aperture,
    };
  });
}

/*
 * The race's gates and class for any published document, which is the one
 * question the checker and its synthetic laps both ask.
 *
 * A MAP TRACK (schemaVersion 4, src/builder/) stands in a world with every
 * gate at an absolute pose, and its race gates are the ones the in-sim
 * builder hands the shell (src/builder/course.js raceGatesOf), in the same
 * scene frame a ghost is recorded in. It is raced as the 'full' class
 * because that is what the shell races it as: swiss2 and alps carry no
 * trackClass of their own, and main.js falls back to 'full'. A field track
 * is what it always was.
 */
export function raceFromDocument(document) {
  if (document && document.schemaVersion >= 4 && isMapTrack(document)) {
    const { doc } = normalize(document);
    return { gates: raceGatesOf(doc), trackClass: 'full' };
  }
  const course = courseFromDocument(document);
  return { gates: gatesFromCourse(course), trackClass: course.trackClass };
}

function refuse(reason, extra) {
  return { ok: false, reason, ...extra };
}

/*
 * Returns { ok: true, lapMs, gates, topSpeed } for a lap the course agrees
 * with, or { ok: false, reason } naming the first thing that did not hold.
 * lapMs is the claimed time in milliseconds; ghostBytes is the wire format
 * from src/share/ghostdata.js.
 */
export function checkLap(document, ghostBytes, lapMs) {
  let course;
  try {
    course = raceFromDocument(document);
  } catch (e) {
    return refuse(`course: ${e.message}`);
  }
  const { gates } = course;
  if (gates.length === 0) {
    return refuse('the track has no gates, so it has no laps');
  }

  let ghost;
  try {
    ghost = decodeGhost(ghostBytes);
  } catch (e) {
    return refuse(`ghost: ${e.message}`);
  }
  if (!(Number.isFinite(lapMs) && lapMs > 0)) {
    return refuse('the claimed lap is not a time');
  }
  if (Math.abs(ghost.durationMs - lapMs) > 250) {
    return refuse(`the ghost lasts ${ghost.durationMs} ms and the claimed lap is ${Math.round(lapMs)} ms`);
  }
  if (ghost.count < 2) {
    return refuse('the ghost has fewer than two samples');
  }

  const dt = 1000 / ghost.rateHz;
  const at = (i) => ({ x: ghost.pos[i * 3], y: ghost.pos[i * 3 + 1], z: ghost.pos[i * 3 + 2] });
  let topSpeed = 0;
  for (let i = 1; i < ghost.count; i += 1) {
    const a = at(i - 1);
    const b = at(i);
    const speed = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / (dt / 1000);
    if (speed > TELEPORT_SPEED) {
      return refuse(`a jump of ${speed.toFixed(0)} m/s at ${Math.round(i * dt)} ms, which is a respawn or a forgery`);
    }
    topSpeed = Math.max(topSpeed, speed);
  }

  /*
   * The ghost begins on the timing gate: sample 0 is the crossing itself,
   * and the last sample is the finish. The detector needs a segment that
   * crosses the plane, so the lap is bracketed with one step extrapolated
   * before the first sample and one after the last, and the detector is
   * armed on the timing gate, where the lap begins, rather than on gate 0
   * where a spawned craft would be.
   */
  const race = new Race(gates, course.trackClass);
  race.next = race.timingIdx;
  const first = at(0);
  const second = at(1);
  const last = at(ghost.count - 1);
  const penult = at(ghost.count - 2);
  const before = { x: 2 * first.x - second.x, y: 2 * first.y - second.y, z: 2 * first.z - second.z };
  const after = { x: 2 * last.x - penult.x, y: 2 * last.y - penult.y, z: 2 * last.z - penult.z };

  let prev = before;
  race.update(prev, prev, -dt, 0);
  for (let i = 0; i < ghost.count; i += 1) {
    const curr = at(i);
    race.update(prev, curr, i * dt, 0);
    prev = curr;
  }
  race.update(prev, after, ghost.count * dt, 0);

  const n = gates.length;
  if (race.laps.length === 0) {
    const passed = race.lapStartMs == null ? 0 : race.splits.length;
    return refuse(race.lapStartMs == null
      ? 'the ghost never crosses the timing gate'
      : `the lap never closed: ${passed} of ${n} gates passed in order`);
  }
  if (race.laps.length > 1) {
    return refuse(`the ghost holds ${race.laps.length} laps, and a time is one lap`);
  }
  const measured = race.laps[0];
  const startMs = race.lapStartMs - measured;
  if (Math.abs(startMs) > dt + LAP_TOLERANCE_MS) {
    return refuse(`the lap starts ${Math.round(startMs)} ms into the ghost rather than on the line`);
  }
  if (Math.abs(measured - lapMs) > LAP_TOLERANCE_MS) {
    return refuse(`the track measures ${Math.round(measured)} ms and the claim is ${Math.round(lapMs)} ms`);
  }
  if (race.lastSplits.length !== n) {
    return refuse(`${race.lastSplits.length} crossings in the lap for ${n} gates`);
  }
  if (ghost.splits.length) {
    if (ghost.splits.length !== n) {
      return refuse(`the ghost carries ${ghost.splits.length} splits for ${n} gates`);
    }
    for (let k = 0; k < n; k += 1) {
      if (Math.abs(ghost.splits[k] - race.lastSplits[k]) > LAP_TOLERANCE_MS) {
        return refuse(`split ${k + 1} is ${ghost.splits[k]} ms in the ghost and ${Math.round(race.lastSplits[k])} ms on the track`);
      }
    }
  }
  return { ok: true, lapMs: measured, gates: n, topSpeed };
}
