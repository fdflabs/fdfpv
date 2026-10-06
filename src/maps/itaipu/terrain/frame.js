/*
 * frame.js: the Itaipu contract's numbers, in one place.
 *
 * Restated from docs/ITAIPU-PLAN.md sections 2 and 3 and nothing else.
 * World x = E - 742 500 (east), z = -(N - 7 186 000) (north is -z), y is
 * metres above EGM2008 with no offset, so every height here can be
 * checked against a source. The tiles are the terrain engine's format
 * (src/maps/terrain/frame.js) on a smaller square than it was written
 * for: the ring reaches 20 480 m each way, the hero 5 120 m, and the
 * pyramid stops at level 3, whose one tile covers the ring.
 * Plain data, no three.js, so the Node check reads the same copy.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { makeFrame } from '../../terrain/frame.js';

export const RING_HALF = 20480;
export const HERO_HALF = 5120;

/*
 * The apron past the ring is the Parana plateau the fog takes: rolling
 * farmland between about 220 and 290 m, where the engine's first map's
 * invented foothills would stand a kilometre over the reservoir. Sixty kilometres
 * deep, past the 53 km horizon from the crest.
 */
export const ITAIPU_FRAME = makeFrame({
  half: RING_HALF,
  coarsest: 3,
  apron: { base: 240, amp: 110, depth: 60000 },
});

/* Section 2's landmarks, world metres. */
export const LANDMARKS = {
  crest: { x: 59, z: -1672 },
  mainDam: { x: 58, z: -1670 },
  spillway: { x: -900, z: -798 },
  spillGates: { x: -982, z: -1028 },
  mirante: { x: 225, z: -1059 },
  river: { x: -925, z: 400 },
  bridge: { x: -1506, z: 9535 },
};

/* The water levels (section 5), for the check; the map reads them from
 * water.json. */
export const RESERVOIR_Y = 219.0;
export const RIVER_Y = 103.5;
