/*
 * slots.js: where each pilot in a room starts, and where they stand.
 *
 * The room gives every pilot a seat, 1 to 8, and no two pilots in a room
 * ever hold the same one (edge/rooms/core.js), so a seat IS a spawn slot:
 * nobody has to ask whether a slot is free, and a respawn goes back to the
 * pilot's own. Slot 0 (seat 1) is the map's own spawn exactly, so the
 * first pilot in a room starts where a pilot flying alone does.
 *
 * The slots are a row across the spawn's heading, 8 m apart, alternating
 * right and left of it (docs/MULTIPLAYER-PLAN.md section 8, derived
 * slots). Quads and planes share the row: one seat, one place, whatever it
 * flies. The pilots stand in a line 12 m behind the row, 3 m apart, so an
 * aircraft taking off from the row flies away from the people.
 *
 * yaw 0 faces -z, and a positive yaw turns toward -x (src/render/frame.js),
 * so the spawn's right is (cos yaw, 0, -sin yaw) and its forward is
 * (-sin yaw, 0, -cos yaw).
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

export const SLOT_RIGHT_M = [0, 8, -8, 16, -16, 24, -24, 32];
export const STATION_BACK_M = 12;
export const STATION_GAP_M = 3;

function place(sp, right, forward) {
  const c = Math.cos(sp.yaw || 0);
  const s = Math.sin(sp.yaw || 0);
  return { x: sp.x + right * c - forward * s, z: sp.z - right * s - forward * c };
}

/* The spawn for slot `slot` (0 based), as the spawn it is derived from
 * with x and z moved. A spawn may carry its own row, `slots`, a
 * [right, forward] in metres per slot, where the default row across the
 * heading would leave the ground it stands on: a runway on a dam's crest
 * lines its planes up along it (src/maps/itaipu/spawns.js). */
export function slotSpawn(sp, slot) {
  if (!sp || !(slot > 0) || slot >= SLOT_RIGHT_M.length) {
    return sp;
  }
  const [right, forward] = sp.slots ? sp.slots[slot] : [SLOT_RIGHT_M[slot], 0];
  return { ...sp, ...place(sp, right, forward) };
}

/* Where slot `slot`'s pilot stands: { x, z }. */
export function stationFor(sp, slot) {
  const right = (slot - (SLOT_RIGHT_M.length - 1) / 2) * STATION_GAP_M;
  return place(sp, right, -STATION_BACK_M);
}
