/*
 * retired.js: the maps this build no longer has, and where each one went.
 *
 * An id in here is not an unknown id. A pilot's stored settings, a bookmark
 * with ?map= and a saved crash cam clip all name the world they were made
 * in, and each of them outlives the world. An unknown id falls back quietly
 * (src/maps/registry.js mapById), which is right for a typo and wrong for a
 * world a pilot flew last week: they would land somewhere else and not be
 * told why. So a retired id is named here, with the world a setting moves
 * to and the words that say what it was.
 *
 * `to` is the Swiss valley for both: it is the title's world, the Track
 * seat's home and the Free Flight card's home, so it is where a pilot with
 * no world of their own already lands. `name` is a string key, not a
 * string, so this file imports nothing and src/boot.js can read it before
 * anything else loads.
 *
 * Retired on 2026-09-28 on the owner's ask ("leave only alps and swiss").
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

const RETIRED_MAPS = {
  city: { to: 'swiss2', name: 'retired.city' },
  airfield: { to: 'swiss2', name: 'retired.airfield' },
};

/* The retired entry for an id, or null for a map this build has or never
 * had. */
export function retiredMap(id) {
  return typeof id === 'string' && Object.hasOwn(RETIRED_MAPS, id) ? RETIRED_MAPS[id] : null;
}
