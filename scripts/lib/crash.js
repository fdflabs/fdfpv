/*
 * crash.js: read the crash physics ABI of a loaded module (tests/lib/simmod.js
 * Sim) into plain objects. For the plant tests and the crash suite; the
 * names come from configs/parts.js, the layouts from src/native/sim_abi.h.
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
  DAMAGE_EVENT_DOUBLES, DAMAGE_EVENTS_MAX, EVENT, EVENT_TYPES, INFO, PART_INFO_DOUBLES,
  PART_KINDS, PART_PTS_MAX, PART_STATE_DOUBLES, PART_STATUS, STATE, partLabel,
} from '../../configs/parts.js';

function withBuffer(sim, doubles, fn) {
  const p = sim.e.malloc(doubles * 8);
  if (!p) {
    throw new Error('sim.wasm malloc failed');
  }
  try {
    const rc = fn(p);
    return { rc, data: new Float64Array(new Float64Array(sim.e.memory.buffer, p, doubles)) };
  } finally {
    sim.e.free(p);
  }
}

const v3 = (a, i) => [a[i], a[i + 1], a[i + 2]];

/* The airframe's part table: [{ index, kind, kindName, label, parent, ... }]. */
export function readPartTable(sim) {
  const n = sim.e.sim_parts_count();
  const quad = n > 0 && withBuffer(sim, PART_INFO_DOUBLES, (p) => sim.e.sim_part_info(0, p)).data[INFO.kind] === 0;
  const parts = [];
  for (let i = 0; i < n; i += 1) {
    const { rc, data } = withBuffer(sim, PART_INFO_DOUBLES, (p) => sim.e.sim_part_info(i, p));
    if (rc !== 0) {
      throw new Error(`sim_part_info(${i}) returned ${rc}`);
    }
    const hull = withBuffer(sim, 1 + 3 * PART_PTS_MAX, (p) => sim.e.sim_part_hull(i, p)).data;
    const points = [];
    for (let k = 0; k < hull[0]; k += 1) {
      points.push(v3(hull, 1 + 3 * k));
    }
    const cg = v3(data, INFO.cg);
    parts.push({
      index: i,
      kind: data[INFO.kind],
      kindName: PART_KINDS[data[INFO.kind]],
      label: partLabel(data[INFO.kind], cg[0], cg[1], quad),
      parent: data[INFO.parent],
      material: data[INFO.material],
      motor: data[INFO.motor],
      mass: data[INFO.mass],
      cg,
      joint: v3(data, INFO.joint),
      momentLimit: data[INFO.momentLimit],
      forceLimit: data[INFO.forceLimit],
      stiffness: data[INFO.stiffness],
      crushStress: data[INFO.crushStress],
      crushArea: data[INFO.crushArea],
      crushDepth: data[INFO.crushDepth],
      boxMin: v3(data, INFO.boxMin),
      boxMax: v3(data, INFO.boxMax),
      points,
    });
  }
  return parts;
}

/* Every part now: [{ status, statusName, damage, pos, quat, vel, ... }]. */
export function readPartsState(sim) {
  const n = sim.e.sim_parts_count();
  const { rc, data } = withBuffer(sim, n * PART_STATE_DOUBLES, (p) => sim.e.sim_parts_state(p));
  if (rc !== 0) {
    throw new Error(`sim_parts_state returned ${rc}`);
  }
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const o = i * PART_STATE_DOUBLES;
    out.push({
      status: data[o + STATE.status],
      statusName: PART_STATUS[data[o + STATE.status]],
      damage: data[o + STATE.damage],
      pos: v3(data, o + STATE.pos),
      quat: [data[o + STATE.quat], data[o + STATE.quat + 1], data[o + STATE.quat + 2], data[o + STATE.quat + 3]],
      vel: v3(data, o + STATE.vel),
      omega: v3(data, o + STATE.omega),
      body: data[o + STATE.body],
      peak: data[o + STATE.peak],
      deform: v3(data, o + STATE.deform),
      energy: data[o + STATE.energy],
      kind: data[o + STATE.kind],
      parent: data[o + STATE.parent],
    });
  }
  return out;
}

/* The damage events since the last read, oldest first. */
export function readDamageEvents(sim) {
  const { rc, data } = withBuffer(sim, DAMAGE_EVENTS_MAX * DAMAGE_EVENT_DOUBLES,
    (p) => sim.e.sim_damage_events(p, DAMAGE_EVENTS_MAX));
  const out = [];
  for (let k = 0; k < rc; k += 1) {
    const o = k * DAMAGE_EVENT_DOUBLES;
    out.push({
      step: data[o + EVENT.step],
      t: data[o + EVENT.step] / 1000,
      part: data[o + EVENT.part],
      type: data[o + EVENT.type],
      typeName: EVENT_TYPES[data[o + EVENT.type]],
      ratio: data[o + EVENT.ratio],
      force: data[o + EVENT.force],
      moment: data[o + EVENT.moment],
      energy: data[o + EVENT.energy],
      point: v3(data, o + EVENT.point),
      normal: v3(data, o + EVENT.normal),
      closing: data[o + EVENT.closing],
      surface: data[o + EVENT.surface],
      damage: data[o + EVENT.damage],
    });
  }
  return out;
}

/* Per motor: { thrust, imbalance, tiltX, tiltY }. */
export function readMotorDamage(sim) {
  const { data } = withBuffer(sim, 16, (p) => sim.e.sim_motor_damage(p));
  const out = [];
  for (let m = 0; m < 4; m += 1) {
    out.push({ thrust: data[4 * m], imbalance: data[4 * m + 1], tiltX: data[4 * m + 2], tiltY: data[4 * m + 3] });
  }
  return out;
}
