/*
 * water.js: the water a map has, as the shell declares it to the plant.
 *
 * The plant floats an aircraft on floats on water bodies the host declares
 * (src/native/water.c, sim_water_add and its siblings), in the plant's own
 * frame, which moves with the spawn. This file says where each map's water
 * is in the MAP's frame (Three.js, y up, metres) and the shell converts it
 * at every reset, the way it converts the ground plane. It is the one
 * place a map's water is named to the physics, so that no map file has to
 * learn about floats: a map's own look of its water stays the map's.
 *
 * A body here is:
 *   surfaceY        the still water's height
 *   outline         its shore, [{ x, z }], in order round it
 *   bed(x, z)       the ground under the water, for the plane an aircraft
 *                   on floats is given under it, since the map's height()
 *                   answers the surface there so that everything else
 *                   (a quad, a wheeled plane) rests ON the water as it
 *                   always has
 *   centre          where the waves' phases are measured from
 *   spawn           where an aircraft on floats starts: { x, z, yaw }
 *   wind            the breeze on it, { speed, toX, toZ, fetch }: m/s, the
 *                   unit direction it blows toward, the open water it
 *                   crosses. The waves are the plant's from these.
 *
 * THE ALPS' LAKE, which swiss2 shares because it is built on the same
 * valley (src/maps/swiss2.js builds through alps.js's buildValley, on its
 * own walls where they meet the water): the
 * basin at the valley's south end whose shore is wherever the terrain
 * crosses LAKE_Y, found as src/maps/alps/nature.js finds it, by marching
 * rays out from the basin's middle. Read from src/maps/alps/terrain.js,
 * never written. Light air, 2 m/s, down the valley from the north, which
 * over the lake's 0.9 km raises a chop of 3.1 cm at 0.76 s: enough that an
 * aircraft afloat rocks a few degrees, as a model on a lake does, and no
 * more; the map draws the lake from the same waves (src/render/
 * lakewaves.js, docs/FLOATS-STAGE1.md). The aircraft spawns in the middle
 * facing into it, up the lake.
 *
 * Every other map has no water, and there an aircraft on floats stands on
 * its keels on the strip.
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

const RAYS = 96;
const STEP = 3;
/* The breeze on the Alps' lake, m/s. */
export const ALPS_LAKE_WIND = 2;

/* The lake over a ground height(x, z): the alps' own, or swiss2's, which is
 * the alps' with Lauterbrunnen's walls added where the walls are
 * (src/maps/swiss2/terrain.js, wallRise), so its lake's far shores are
 * where those walls meet the water. */
async function alpsLake(ground) {
  const t = await import('../maps/alps/terrain.js');
  const height = ground ? await ground(t) : t.terrainHeight;
  const cz = (t.LAKE_N + t.LAKE_END) / 2;
  const cx = t.valleyAxis(cz);
  const outline = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let k = 0; k < RAYS; k += 1) {
    const a = (k / RAYS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let r = 0;
    while (r < 1100 && height(cx + dx * r, cz + dz * r) < t.LAKE_Y) {
      r += STEP;
    }
    outline.push({ x: cx + dx * r, z: cz + dz * r });
    zMin = Math.min(zMin, cz + dz * r);
    zMax = Math.max(zMax, cz + dz * r);
  }
  return {
    surfaceY: t.LAKE_Y,
    outline,
    bed: height,
    centre: { x: cx, z: cz },
    spawn: { x: cx, z: cz, yaw: 0 },
    wind: { speed: ALPS_LAKE_WIND, toX: 0, toZ: 1, fetch: zMax - zMin },
  };
}

const WATER = {
  alps: () => [alpsLake(null)],
  swiss2: () => [alpsLake(async (t) => {
    const w = await import('../maps/swiss2/terrain.js');
    return (x, z) => t.terrainHeight(x, z) + w.wallRise(x, z);
  })],
};

/* The water bodies of a map, by its id: an empty list for a map without. */
export async function waterFor(mapId) {
  const make = WATER[mapId];
  return make ? Promise.all(make()) : [];
}

/* Whether (x, z) is inside a body's outline: the even odd crossing test. */
export function insideWater(body, x, z) {
  const o = body.outline;
  let inside = false;
  for (let j = 0, k = o.length - 1; j < o.length; k = j, j += 1) {
    if ((o[j].z > z) !== (o[k].z > z)) {
      const xc = o[j].x + (z - o[j].z) * (o[k].x - o[j].x) / (o[k].z - o[j].z);
      if (x < xc) {
        inside = !inside;
      }
    }
  }
  return inside;
}
