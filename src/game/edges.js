/*
 * edges.js: where a world ends, one rule for every world
 * (docs/redesign/COMPLETENESS.md item 53, phase 29).
 *
 * Past each world's playable square the HUD says turn back, with the
 * bearing and distance home; past twice that the craft is put back on its
 * start after RESET_NOTICE_MS of notice, the same reset the R key makes
 * (src/main.js reset), and coming back inside twice the square calls the
 * notice off. Never a wall: nothing here touches the plant, and every
 * world has ground out there to fly over (the alps' far range to 12 km,
 * the terrain engine's apron round Itaipu and the Interior), so the rule
 * is the only edge a pilot meets.
 *
 * Squares, not circles, because every world's data is a square round its
 * origin and a circle that fits the play area leaves its corners out
 * (Pista Cero, the Interior's start, is 7.8 km from the centre of an 8 km
 * half side). A live operation's own boundary (edge/rooms/ops.js
 * BOUNDARY_MS, which costs the mission) stands in for this one while it
 * runs; the shell does not run both.
 *
 * Pure: no clock of its own, no DOM. The caller hands it a clock that
 * holds in a pause, so a pause holds the notice where it is.
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
 * Each world's playable square, half a side in metres round its origin.
 * Literal, so the boot does not fetch a world's modules to read them;
 * scripts/edges-selftest.js holds each to the constant it is taken from.
 *
 *   alps, swiss2  the valley's field, src/maps/alps/heights.js HALF; the
 *                 far range is drawn to 12 km, so twice it is ground
 *   itaipu        half the data's square, src/maps/itaipu/terrain/frame.js
 *                 RING_HALF / 2, so twice it is the data's edge
 *   interior      the play area, src/share/interior/frame.js PLAY_HALF;
 *                 twice it is on the apron, 150 km of landable country
 */
export const WORLD_EDGES = Object.freeze({
  alps: 3000,
  swiss2: 3000,
  itaipu: 10240,
  interior: 8000,
});

/* ms between the notice and the reset. */
export const RESET_NOTICE_MS = 5000;

/* A run's own state for edgeStep, which it also answers in: since, the
 * ms the craft went past twice the square or null; phase, bearing,
 * km and msLeft, below. One object a run, so the frame loop allocates
 * nothing for it. */
export function edgeState() {
  return {
    since: null, phase: 'in', bearing: 0, km: 0, msLeft: 0,
  };
}

/*
 * The rule at one frame: the world's half side `half` (WORLD_EDGES), the
 * craft at (x, z), its start at (hx, hz), the caller's clock ms. Sets and
 * returns st.phase:
 *
 *   'in'       inside the square
 *   'turn'     past it: turn back; the start is at compass bearing
 *              st.bearing (whole degrees, north is -z, east +x), st.km away
 *   'leaving'  past twice it: the same, and st.msLeft to the reset
 *   'reset'    the notice ran out: reset now
 */
export function edgeStep(half, st, x, z, hx, hz, ms) {
  const out = Math.max(Math.abs(x), Math.abs(z));
  if (!(out > half)) {
    st.since = null;
    st.phase = 'in';
    return st.phase;
  }
  const dx = hx - x;
  const dz = hz - z;
  st.bearing = Math.round((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  st.km = Math.hypot(dx, dz) / 1000;
  if (!(out > 2 * half)) {
    st.since = null;
    st.phase = 'turn';
    return st.phase;
  }
  if (st.since === null) {
    st.since = ms;
  }
  st.msLeft = st.since + RESET_NOTICE_MS - ms;
  if (st.msLeft <= 0) {
    st.since = null;
    st.phase = 'reset';
    return st.phase;
  }
  st.phase = 'leaving';
  return st.phase;
}
