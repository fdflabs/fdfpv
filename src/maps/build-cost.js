/*
 * build-cost.js: how long each map takes to build, measured.
 *
 * It is its own file for one reason: src/boot.js needs the number BEFORE it
 * imports anything else, so the loading screen's stage weights are right from
 * the first frame, and importing src/maps/registry.js there would be fine
 * today and a trap tomorrow. The registry's whole job is to hold the two
 * loader thunks, and the day somebody turns one of those dynamic imports into
 * a static one the city's 59 file graph would arrive at boot for every
 * player, which is exactly what deliverable 4 forbids. A file with two
 * numbers in it cannot do that.
 *
 * Measured on this container at 1280 by 720 across three runs. The city's
 * world build was 7554, 7646 and 8782 ms; the field's 2886 and 3042. These
 * are weights for a progress bar, so the spread does not matter much, but
 * replace them with a re-measurement rather than a guess.
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

export const MAP_BUILD_MS = {
  field: 2964,
  /* The same world as the field, with a designed course in place of the
   * built in one. A ten gate track builds a little faster than fourteen
   * stations, and the terrain, grass and scenery, which are most of the
   * cost, are identical. Close enough to the field's figure that giving it
   * its own would be pretending to a precision the loading bar does not
   * have. */
  custom: 2964,
  city: 7994,
  /* A flat field with a dozen meshes in it. The world stage as the shell's
   * own loading ledger reports it, through shots.js on this container at
   * 1600 by 900 on Low, two runs: 709 and 717 ms. */
  airfield: 713,
  /* A six kilometre heightfield, its painted texture, the range beyond,
   * a baked village of forty buildings with their windows, balconies and
   * fences, the forests, the lake and the fall, and what moves: the
   * traffic, the PostAuto, the tractor, the herd, the hikers, the
   * paragliders and the gondola. World stage from the shell's loading
   * ledger through shots.js on this machine at 1600 by 900 on Low, three
   * runs after a warm cache: 921, 912 and 919 ms, with a load average
   * near seventeen from other sessions' Chromiums. main without the life
   * and vehicles work, run interleaved with those, gave 853, 935 and 885
   * ms, so what moves costs a few tens of milliseconds a loading bar
   * cannot see. The village's rebuild measured 1337 to 1466 ms earlier
   * under a load over thirty, which is the spread these numbers carry. */
  alps: 917,
};
