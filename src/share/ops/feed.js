/*
 * feed.js: a mission's forward feed breaking up (MISSIONS.md M3 stage 4,
 * TECH-NEEDS N11): past the ridge toward the command site the recon's
 * picture is snow until a relay holds the network's volume. Each screen
 * works it out for its own pilot from the room's view (the stage, the
 * roles, the choices) and where its aircraft is; nothing crosses the
 * wire, and the room's captures are not gated on it (CONTRACT-M3.md).
 *
 * mission.feed = { stage, roles, point, clear: { chosen, is }, snow }:
 * in stage `stage`, a pilot flying one of `roles` inside `point`'s ring
 * sees `snow` (0..1) until the choice `clear` is made.
 *
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


/* The snow, 0..1, on this seat's picture. `at` is the aircraft's
 * position in the ops frame, [x, y]. */
export function feedSnow(mission, view, seat, at) {
  const f = mission && mission.feed;
  if (!f || !view || view.state !== 'live' || !view.stage || view.stage.id !== f.stage || !at) {
    return 0;
  }
  if (view.choices && view.choices[f.clear.chosen] === f.clear.is) {
    return 0;
  }
  const key = view.roles && view.roles.active ? view.roles.active[seat] : null;
  if (key == null || !f.roles.includes(String(key).split(':')[0])) {
    return 0;
  }
  const pt = mission.points[f.point];
  const dx = at[0] - pt.at[0];
  const dy = at[1] - pt.at[1];
  return dx * dx + dy * dy <= pt.r * pt.r ? f.snow : 0;
}
