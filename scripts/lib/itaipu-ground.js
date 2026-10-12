/*
 * itaipu-ground.js: the Itaipu map's ground in Node for the checks that
 * need it without a browser (scripts/water-itaipu.js builds the flood's
 * bed on it). The ground is src/share/itaipu/world.js, the page's
 * terrain finestAt over the whole pyramid cut to the concrete, the copy
 * the room reads too (edge/rooms/grounds.js).
 *
 * And the water.json the parts are given, met to the banks. The data
 * folder is FDFPV_ITAIPU_DATA, by default
 * ~/Desktop/fdfpv-itaipu-data; readGround resolves to null when it is
 * not there, so a check can say it skipped.
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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { HERO_HALF } from '../../src/maps/itaipu/terrain/frame.js';
import { meetBanks } from '../../src/maps/itaipu/water/meet.js';
import { makeItaipuWorld } from '../../src/share/itaipu/world.js';
import { itaipuDataDir, readItaipuBytes } from '../../src/share/itaipu/node.js';

export const DATA = itaipuDataDir();

/* { ground(x, z), water, dam, manifest }, or null without the data. */
export async function readGround() {
  const bytes = readItaipuBytes(DATA);
  if (!bytes) {
    return null;
  }
  const world = makeItaipuWorld(bytes);
  const water = JSON.parse(await readFile(join(DATA, 'water.json'), 'utf8'));
  /* The outlines as the map's parts are handed them, brought to the
   * banks on the ground as cut (itaipu.js, water/meet.js meetBanks). */
  return {
    ground: world.groundAt, water: meetBanks(water, world.dam, world.groundAt, HERO_HALF), dam: world.dam, manifest: world.manifest,
  };
}
