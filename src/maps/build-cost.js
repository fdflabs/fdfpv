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
