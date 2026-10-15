/*
 * discovery.js: the named places a pilot finds by flying to them
 * (docs/redesign/PROGRESSION.md section 6, the lead's decision of
 * 2026-10-15).
 *
 * THE RULE. A place is a real, named thing that is in the world's own data
 * (a part of the dam the map models, an OpenStreetMap feature it draws),
 * with one short factual line from a source the repository already cites.
 * No invented history and no person named. A world whose data holds no
 * real named place has none here, and that is why three of the four have
 * none today: the Alps and the Swiss valley are one procedural valley that
 * only takes Lauterbrunnen as an art reference (docs/SWISS2-ASSETS.md "Nothing
 * here is a real map, a real village"), and every name in The Interior is
 * invented on purpose (src/share/interior/places.js "INVENTED, ALL OF IT",
 * held by `npm run lint:interior-names`).
 *
 * FOUND is a cylinder: the craft within `r` metres of the place across the
 * ground, and no more than `r` metres above whatever is under it (the
 * map's height, which counts the dam's crest and the bridge's deck as
 * ground). So a pass along the feature finds it and a cruise a kilometre
 * over it does not. A place the flight began inside is not found on that
 * flight: a spawn, a room's start slot or a developer hook putting the
 * craft there is not flying to it (the same reasoning as a best, which a
 * reset or a placement voids, src/game/progress.js bestsOf).
 *
 * Coordinates are the map's own frame, which is the render frame the craft
 * is drawn in (x east, z south, metres): for Itaipu, UTM 21S less
 * (742 500, 7 186 000) with z negated (docs/ITAIPU-PLAN.md section 3,
 * src/maps/itaipu/terrain/frame.js). A long feature is placed at the
 * middle of its axis in the map's dam data (~/Desktop/fdfpv-itaipu-data
 * dam.json, the source of src/maps/itaipu/dam); the rest at the point
 * ITAIPU-PLAN.md section 4 lists for them. Radii are the lane's call,
 * scaled to the feature and kept apart so one pass finds one place:
 * `progress:selftest` holds every pair of a world apart and every place
 * outside the spawns' reach.
 *
 * The words are discovery.place.<world>.<id> and its _fact.
 *
 * Pure: no DOM, no three.js, no strings, so the server and the selftests
 * import it in Node.
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
 * Each { id, x, z, r }. The fact each line's words say, and where it is
 * from (ITAIPU-PLAN.md lines quote Itaipu's own pages, /energia/barragem,
 * /energia/vertedouro, /energia/casa-de-forca; the rest OpenStreetMap):
 *
 *   main_dam        1 064 m crest, 196 m high, hollow gravity and buttress (PLAN section 6 table)
 *   diversion       170 m, 162 m high, concrete gravity (the same)
 *   right_wing      998 m, 64.5 m high, concrete buttress (the same)
 *   spillway        14 gates 20 x 21.34 m, 62 200 m3/s (the same); at the gates' bridge
 *   powerhouse      968 m long, 99 m wide; 20 penstocks, 690 m3/s each (the same)
 *   rockfill_dam    1 984 m, 70 m high (the same)
 *   left_earth_dam  2 294 m, 30 m high (the same)
 *   reservoir       normal level 220.30 m, 223.10 m in a flood (PLAN section 1, item 2)
 *   river           the Parana below the dam runs at about 1 m/s (PLAN section 5)
 *   substation      right bank, 50 Hz, 500 kV, 48 ha (PLAN section 4, OSM way 32302779)
 *   acaray          Paraguay's Acaray hydro plant, 210 MW (PLAN section 4, OSM way 262532170)
 *   bridge          a concrete deck arch (src/maps/itaipu/town/bridge.js, OSM way 26122712)
 */
export const PLACES = Object.freeze({
  itaipu: Object.freeze([
    { id: 'main_dam', x: 117, z: -1725, r: 60 },
    { id: 'diversion', x: 720, z: -1594, r: 60 },
    { id: 'right_wing', x: -758, z: -1554, r: 80 },
    { id: 'spillway', x: -967, z: -1009, r: 100 },
    { id: 'powerhouse', x: 88, z: -1606, r: 50 },
    { id: 'rockfill_dam', x: 1670, z: -979, r: 100 },
    { id: 'left_earth_dam', x: 2570, z: 946, r: 100 },
    { id: 'reservoir', x: 60, z: -2500, r: 300 },
    { id: 'river', x: -925, z: 400, r: 150 },
    { id: 'substation', x: -2128, z: -434, r: 300 },
    { id: 'acaray', x: -3464, z: 4008, r: 100 },
    { id: 'bridge', x: -1506, z: 9534, r: 150 },
  ].map(Object.freeze)),
});

/* The key a found place is kept under in progress.places. */
export function placeKey(world, id) {
  return `${world}:${id}`;
}

export function placesOf(world) {
  return Object.hasOwn(PLACES, world) ? PLACES[world] : [];
}

/* Whether the craft at `pos` (render frame, metres), `agl` metres above
 * what is under it, is inside place `p`'s cylinder. */
export function inside(p, pos, agl) {
  return Math.hypot(pos.x - p.x, pos.z - p.z) <= p.r && Number.isFinite(agl) && agl <= p.r;
}

/*
 * The places of `world` the craft is inside now that are not in `skip`
 * (a Set of ids: those already found, and those the flight began inside):
 * their ids, in the table's order.
 */
export function placesAt(world, pos, agl, skip = new Set()) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
    return [];
  }
  return placesOf(world).filter((p) => !skip.has(p.id) && inside(p, pos, agl)).map((p) => p.id);
}
