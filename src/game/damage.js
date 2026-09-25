/*
 * damage.js: the shell's side of the crash physics readback.
 *
 * The plant decides what breaks (src/native/crash.c); this file only reads
 * what it decided, through the ABI in src/native/sim_abi.h under "CRASH
 * PHYSICS", into buffers allocated once in the module's heap, so the frame
 * loop and the step loop read the damage without allocating. Nothing here
 * writes to the plant except setMode, which is the one call the run's
 * setting makes between runs.
 *
 * scripts/lib/crash.js reads the same ABI into plain objects for the tests
 * and the suite; that shape allocates on every call, which is right for a
 * report and wrong for a loop that runs a thousand times a second.
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

import {
  DAMAGE_EVENT_DOUBLES, DAMAGE_EVENTS_MAX, DAMAGE_FLAGS, INFO, PART_INFO_DOUBLES,
  PART_KINDS, PART_PTS_MAX, PART_STATE_DOUBLES, PARTS_MAX, STATE,
} from '../../configs/parts.js';

/*
 * WHAT MAKES AN AIRCRAFT A WRECK: the damage the pilot cannot fly on. A
 * quad without one of its four props, arms or motors is past what
 * Betaflight can hold; any aircraft whose pack has gone has no power; a
 * plane without a wing panel or its tail spins in. A chipped prop, a bent
 * arm, a knocked camera or a lost aileron are damage the pilot flies home
 * on, so they are not here.
 */
export const WRECK_FLAGS = DAMAGE_FLAGS.propLost | DAMAGE_FLAGS.armLost
  | DAMAGE_FLAGS.motorLost | DAMAGE_FLAGS.batteryEjected
  | DAMAGE_FLAGS.wingLost | DAMAGE_FLAGS.tailLost;

/* What leaves the FPV picture with nothing to show. The camera gone, or
 * the pack that powers it and the transmitter. */
export const FEED_DEAD_FLAGS = DAMAGE_FLAGS.cameraLost | DAMAGE_FLAGS.batteryEjected;

export function isWreck(flags) {
  return (flags & WRECK_FLAGS) !== 0;
}

/*
 * A reader over one loaded module (tests/lib/simmod.js Sim). `available` is
 * false on a dist/sim.wasm older than the crash ABI, and then every read
 * answers "intact" so the shell behaves exactly as it did before it.
 */
export function createDamageLink(sim) {
  const e = sim.e;
  const available = typeof e.sim_set_damage === 'function'
    && typeof e.sim_parts_state === 'function'
    && typeof e.sim_damage_events === 'function'
    && typeof e.sim_damage_flags === 'function';
  let eventsPtr = 0;
  let partsPtr = 0;
  let infoPtr = 0;
  let hullPtr = 0;
  let motorPtr = 0;

  function alloc(doubles) {
    const p = e.malloc(doubles * 8);
    if (!p) {
      throw new Error('sim.wasm malloc failed for the damage readback');
    }
    return p;
  }

  /* A view is rebuilt whenever the module's memory has grown, because a
   * grow detaches every view over the old buffer. */
  let eventsView = null;
  let partsView = null;
  let motorView = null;
  function view(cur, ptr, doubles) {
    if (cur && cur.buffer === e.memory.buffer) {
      return cur;
    }
    return new Float64Array(e.memory.buffer, ptr, doubles);
  }

  const link = {
    available,

    setMode(on) {
      if (!available) {
        return false;
      }
      return e.sim_set_damage(on ? 1 : 0) === 0;
    },

    mode() {
      return available ? e.sim_damage() !== 0 : false;
    },

    /*
     * The airframe's part table, static per airframe: read once when the
     * airframe changes, so allocating here is fine. Each part carries what
     * the renderer needs to find it on the drawn model: its kind, parent,
     * motor, centre and hull box, all body frame metres.
     */
    table() {
      if (!available) {
        return [];
      }
      if (!infoPtr) {
        infoPtr = alloc(PART_INFO_DOUBLES);
        hullPtr = alloc(1 + 3 * PART_PTS_MAX);
      }
      const n = e.sim_parts_count();
      const parts = [];
      for (let i = 0; i < n; i += 1) {
        if (e.sim_part_info(i, infoPtr) !== 0) {
          throw new Error(`sim_part_info(${i}) refused`);
        }
        const d = new Float64Array(e.memory.buffer, infoPtr, PART_INFO_DOUBLES);
        parts.push({
          index: i,
          kind: d[INFO.kind],
          kindName: PART_KINDS[d[INFO.kind]] ?? 'part',
          parent: d[INFO.parent],
          motor: d[INFO.motor],
          mass: d[INFO.mass],
          cg: [d[INFO.cg], d[INFO.cg + 1], d[INFO.cg + 2]],
          boxMin: [d[INFO.boxMin], d[INFO.boxMin + 1], d[INFO.boxMin + 2]],
          boxMax: [d[INFO.boxMax], d[INFO.boxMax + 1], d[INFO.boxMax + 2]],
          material: d[INFO.material],
        });
      }
      return parts;
    },

    /*
     * Drain the events since the last call into `fn(events, offset)`, one
     * call per event, oldest first, reading straight out of the module's
     * heap. Returns how many there were. The step loop calls this after
     * every sim_step(1), which is what the ABI asks for exact attribution.
     */
    drain(fn) {
      if (!available) {
        return 0;
      }
      if (!eventsPtr) {
        eventsPtr = alloc(DAMAGE_EVENTS_MAX * DAMAGE_EVENT_DOUBLES);
      }
      const n = e.sim_damage_events(eventsPtr, DAMAGE_EVENTS_MAX);
      if (n <= 0) {
        return 0;
      }
      eventsView = view(eventsView, eventsPtr, DAMAGE_EVENTS_MAX * DAMAGE_EVENT_DOUBLES);
      for (let k = 0; k < n; k += 1) {
        fn(eventsView, k * DAMAGE_EVENT_DOUBLES);
      }
      return n;
    },

    /* Every part now, into the module heap; returns the view, count x
     * PART_STATE_DOUBLES, valid until the next call. */
    parts() {
      if (!available) {
        return null;
      }
      if (!partsPtr) {
        partsPtr = alloc(PARTS_MAX * PART_STATE_DOUBLES);
      }
      if (e.sim_parts_state(partsPtr) !== 0) {
        return null;
      }
      partsView = view(partsView, partsPtr, PARTS_MAX * PART_STATE_DOUBLES);
      return partsView;
    },

    count() {
      return available ? e.sim_parts_count() : 0;
    },

    flags() {
      return available ? e.sim_damage_flags() : 0;
    },

    freeBodies() {
      return available && typeof e.sim_free_bodies_active === 'function'
        ? e.sim_free_bodies_active()
        : 0;
    },

    /* Per motor [thrust kept, imbalance, tilt x, tilt y], four motors. */
    motors() {
      if (!available || typeof e.sim_motor_damage !== 'function') {
        return null;
      }
      if (!motorPtr) {
        motorPtr = alloc(16);
      }
      e.sim_motor_damage(motorPtr);
      motorView = view(motorView, motorPtr, 16);
      return motorView;
    },
  };
  return link;
}

/* Offsets into one part's state, for the readers of link.parts(). */
export { STATE, PART_STATE_DOUBLES };
