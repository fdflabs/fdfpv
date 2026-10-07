/*
 * build-cost.js: how long each map takes to build, measured.
 *
 * It is its own file for one reason: src/boot.js needs the number BEFORE it
 * imports anything else, so the loading screen's stage weights are right from
 * the first frame, and importing src/maps/registry.js there would be fine
 * today and a trap tomorrow. The registry's whole job is to hold the
 * loader thunks, and the day somebody turns one of those dynamic imports into
 * a static one a whole world's graph would arrive at boot for every player,
 * which is exactly what deliverable 4 forbids. A file of numbers cannot do
 * that.
 *
 * These are weights for a progress bar, so the spread does not matter much,
 * but replace them with a re-measurement rather than a guess.
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

export const MAP_BUILD_MS = {
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
  /* The Alps' valley again, plus what makes it a photograph: nine terrain
   * photographs decoded into two texture arrays, ten surfaces and the sky
   * fetched, the ground's masks, the mountains' shadow baked on the GPU,
   * the vegetation's forests (their impostors photographed at build) and
   * the water, and every program compiled. World stage from the shell's
   * loading ledger through shots.js with SIM_GPU=1 on this machine at 1600
   * by 900 on Low, three warm runs: 2566, 2408 and 2519 ms; on High 2877,
   * 2669 and 2692. The load average was near thirty from other sessions'
   * test fleets, so these carry the Alps' figure's spread and more. */
  swiss2: 2500,
  /* Itaipu with every part in: the manifest and every JSON file it
   * lists, the whole tile pyramid fetched (86 tiles, 11.4 MB on data v2;
   * these figures are v1's 66 and its reconcile pass, about 0.2 s, since
   * removed), the imagery, the masks and
   * swiss2's photographs, the chunks round the spawn, then the dam, the
   * water, the town and the forest, and the streamed colliders filled
   * round the spawn. World stage from the shell's loading ledger, the data
   * served locally, SIM_GPU=1, on 2026-09-29: 2558, 2600 and 2629 ms at
   * 960 by 540 on Low with a load average of 15 to 31 from other
   * sessions, and 4374, 5566 and 6127 ms at 1280 by 720 on High with it
   * near 50. The quieter figure is the one here; from the public host it
   * is longer by the round trips. */
  itaipu: 2600,
  /* The Interior's corridor (src/maps/interior.js): its shared ground's
   * two files, the terrain's tiles cut from them in memory, the far
   * forest's points, the corridor's buildings and water, and Itaipu's sky
   * and swiss2's photographs. Itaipu's figure until one is measured. */
  interior: 2600,
};
