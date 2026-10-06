/*
 * hoist.js: how far a spillway gate of the Itaipu dam stands open at any
 * room millisecond, from a mission's gate state (the lead, 3 October):
 * the one law the room (edge/rooms/war.js, for what a warhead meets),
 * the water (src/maps/itaipu/water/, for the flow under the leaf) and
 * the drawing (src/maps/itaipu/dam/index.js, the leaf turning on its
 * trunnions) all use, so all three agree at every millisecond.
 *
 * A gate's state is entries { gate: 'gate-N', at: room ms, open_m }: from
 * `at` the hoist drives the leaf's lip toward open_m metres over the
 * sill at HOIST_M_S, and stops there. A later entry for the same gate
 * starts its ramp from wherever the last one had got to at its own `at`,
 * moving or not. Before a gate's first entry, and for a gate no entry
 * names, it stands at FREE_OPEN_M, Free Flight's.
 *
 * Arithmetic only (+ - * /, comparisons): the same answer to the bit on
 * every engine, as the room's damage and every client's flood need.
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

/*
 * The hoist's rate, metres of lip travel a second. AN ESTIMATE, not
 * Itaipu's published figure (Itaipu publishes the gates' size and
 * discharge, not their hoists' speed): large radial spillway gates on
 * hydraulic hoists are commonly specified to travel at about half a
 * metre a minute, which this takes.
 */
export const HOIST_M_S = 0.5 / 60;

/* Where a gate stands with no entry: Free Flight's spillway, 2 m open. */
export const FREE_OPEN_M = 2;

/* From v toward `to` at HOIST_M_S over ms milliseconds, stopping there. */
function ramp(v, to, ms) {
  const step = (HOIST_M_S * ms) / 1000;
  if (to > v) {
    return v + step < to ? v + step : to;
  }
  return v - step > to ? v - step : to;
}

/*
 * Gate `gate`'s opening, metres of its lip over its sill, at room ms t,
 * from `entries` (any order; entries for other gates are ignored, and of
 * two at one `at` the later in the list wins). null or [] is no mission:
 * FREE_OPEN_M.
 */
export function openAt(entries, gate, t) {
  const mine = [];
  for (const [k, e] of (entries ?? []).entries()) {
    if (e.gate === gate && e.at <= t) {
      mine.push([e.at, k, e.open_m]);
    }
  }
  mine.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let v = FREE_OPEN_M;
  let at = -Infinity;
  let to = FREE_OPEN_M;
  for (const [eAt, , open] of mine) {
    v = at === -Infinity ? v : ramp(v, to, eAt - at);
    at = eAt;
    to = open;
  }
  return at === -Infinity ? v : ramp(v, to, t - at);
}
