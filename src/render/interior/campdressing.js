/*
 * campdressing.js: where the camp's decorative dressing stands, round 4
 * of docs/INTERIOR-LOOP.md (the camp read sparse in its middle against
 * the golden hour mock). Offsets in metres east and south of the camp's
 * middle (places.js CAMP_PROPS.middle), as camp.js's STORES are. None of
 * it is the room's: places.js's props are judged and never move, and
 * these fill the pockets between the routes the camp's people walk. A
 * piece that would stand within a walkway of a route is left out by
 * camp.js (clearOf), so this table can be generous; everything tall
 * stands at the clearing's edge, and nothing in the middle stands higher
 * than a crate stack, so no piece hides a judged item from a camera ball
 * over the standoff.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

export const DRESSING = {
  /* A work table of planks on trestles: tools, a lantern, a radio. */
  table: { at: [-8, 12], yaw: 0.35 },
  /* The cooking place: a second, smaller fire with a pot on a tripod, a
   * grill on stones, a bench log, a water drum. */
  cook: { at: [-7.4, -3.4] },
  /* Split firewood stacked between stakes. */
  firewood: [{ at: [8.1, 7.8], yaw: 0.7 }, { at: [-13.5, 15.6], yaw: -0.4 }, { at: [4.8, 0], yaw: 1.3 }],
  /* A plastic water tank in its cage, blue water bottles beside it. */
  tank: { at: [18.6, -7.6], yaw: 0.25 },
  bottles: [[17.2, -6.4], [17.6, -5.9], [16.9, -5.7], [-12.4, 0.7], [-0.2, -3.8], [-0.5, -3.5]],
  /* Stacks of crates, a box or two on top, round the pockets. */
  crates: [
    { at: [-15.8, -13.4], yaw: 0.5 },
    { at: [-12.4, -15.6], yaw: 1.2 },
    { at: [11.2, -14.4], yaw: -0.3 },
    { at: [-4.5, 19], yaw: 0.2 },
    { at: [16.4, 11.8], yaw: 1.4 },
    { at: [8.4, -3.4], yaw: 0.9 },
    { at: [-6.4, 15.8], yaw: -0.6 },
    { at: [19.4, -10.4], yaw: 0.1 },
    { at: [-1.2, 9], yaw: 0.6 },
    { at: [-7.2, 1.8], yaw: 2.1 },
  ],
  /* A generator by the panel and the mast, its cable along the ground. */
  generator: { at: [-1.2, -11.2], yaw: 0.4 },
  /* A wheelbarrow, sacks of rice and flour by the table. */
  wheelbarrow: { at: [-5.6, 13.2], yaw: 1.9 },
  /* A washing line between two poles at the north west edge. */
  clothesline: { from: [-17.2, -11.6], to: [-13.4, -15.8] },
  /* A string of bulbs between two poles across the middle's north side,
   * high over the walkers. */
  bulbs: { from: [-10.8, -3.2], to: [8.2, -6], h: 2.9, sag: 0.45, n: 11 },
  /* Litter, cans, sacking and offcuts lying flat, scattered over the
   * floor; none of it is anything a person or a craft meets. */
  litter: 45,
};
