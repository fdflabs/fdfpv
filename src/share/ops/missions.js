/*
 * missions.js: every ops mission the room can run, by id, and the world
 * (canopy and routes, docs/campaign/interior/CONTRACT-P0.md section 2)
 * each map gives the room. A campaign adds its missions here as data;
 * nothing else in src/share/ops/ names one.
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

import INTERIOR_1 from '../interior/missions/interior-1.js';
import INTERIOR_2 from '../interior/missions/interior-2.js';
import INTERIOR_3 from '../interior/missions/interior-3.js';
import { readWorldBytes } from '../interior/node.js';
import { makeOpsWorld } from '../interior/ops.js';

export const MISSIONS = Object.freeze({ 'interior-1': INTERIOR_1, 'interior-2': INTERIOR_2, 'interior-3': INTERIOR_3 });

/* Each map's { canopyBlocks, poseOnRoute, groundAt }, made on first use:
 * the Interior's reads its ground from disk (the room on the VM, the
 * checks), so a browser importing this module never touches it. */
const MAKERS = Object.freeze({ interior: () => makeOpsWorld(readWorldBytes()) });
const WORLDS = new Map();

export function worldFor(map) {
  if (!WORLDS.has(map)) {
    const make = MAKERS[map];
    if (!make) {
      throw new Error(`ops: no world for map ${map}`);
    }
    WORLDS.set(map, make());
  }
  return WORLDS.get(map);
}

/* A height over the ground at (x, y) made absolute. */
const lift = (world, p) => (Array.isArray(p) && p.length === 3 && typeof p[0] === 'number' ? [p[0], p[1], world.groundAt(p[0], p[1]) + p[2]] : p);
/* A position that may be a dial's { dial, map } of them. */
const liftAny = (world, v) => (v && typeof v === 'object' && !Array.isArray(v) && v.dial != null
  ? { ...v, map: Object.fromEntries(Object.entries(v.map).map(([k, p]) => [k, lift(world, p)])) }
  : lift(world, v));

const GROUNDED = new WeakMap();
/*
 * A `ground` mission (its heights over the ground) with every height made
 * absolute over `world`: its items' places, its points' z, its sites' z0,
 * and its z0 (the ground at its first point, the base). A mission without
 * `ground` is returned as it is. Cached per mission and world.
 */
export function grounded(mission, world) {
  if (!mission.ground) {
    return mission;
  }
  let byWorld = GROUNDED.get(mission);
  if (!byWorld) {
    byWorld = new WeakMap();
    GROUNDED.set(mission, byWorld);
  }
  if (byWorld.has(world)) {
    return byWorld.get(world);
  }
  const base = Object.values(mission.points)[0].at;
  const out = {
    ...mission,
    ground: false,
    z0: world.groundAt(base[0], base[1]) + (mission.z0 ?? 0),
    items: mission.items.map((it) => (it.at ? { ...it, at: liftAny(world, it.at) } : it)),
    points: Object.fromEntries(Object.entries(mission.points).map(([k, pt]) => [k, { ...pt, z: world.groundAt(pt.at[0], pt.at[1]) + (pt.z ?? 0) }])),
    sites: (mission.sites ?? []).map((st) => ({ ...st, z0: world.groundAt(st.at[0], st.at[1]) + (st.z0 ?? 0) })),
  };
  byWorld.set(world, out);
  return out;
}
