/*
 * opsworlds.js: an ops map's world in a browser ({ canopyBlocks,
 * poseOnRoute, groundAt }, CONTRACT-P0.md section 2), the same functions
 * the room has, built from the bytes a page fetches rather than the ones
 * the room reads from disk (src/share/ops/missions.js worldFor, which is
 * Node's). Built once per map, in the background: until it is ready a
 * screen has no world and draws, captures and frames nothing of the
 * mission, rather than guessing.
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

import { fetchWorldBytes } from './interior/world.js';
import { makeOpsWorld } from './interior/ops.js';

/* Each ops map's maker, by map id. */
const MAKERS = Object.freeze({ interior: async () => makeOpsWorld(await fetchWorldBytes()) });

/* map -> { world } once built, { error } if it failed, { pending }. */
const built = new Map();

/*
 * The map's world, or null while it is being built (the first ask starts
 * it), when the map has none, or when building it failed: that is said
 * once on the console (a page error the checks count) and not retried,
 * since a screen without its world is a defect to see, and throwing from
 * the frame loop would stop the flight with it.
 */
export function opsWorldOf(map) {
  const got = built.get(map);
  if (got) {
    return got.world ?? null;
  }
  const make = MAKERS[map];
  if (!make) {
    return null;
  }
  const entry = { pending: true, world: null, error: null };
  built.set(map, entry);
  make().then((w) => {
    entry.world = w;
    entry.pending = false;
  }, (e) => {
    entry.error = e;
    entry.pending = false;
    console.error(`ops: the ${map} world could not be built`, e);
  });
  return null;
}
