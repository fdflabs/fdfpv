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
 * A body here is a lake or a channel (kind). A lake is:
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
 * A CHANNEL is a river, as the map draws it (the map's view.rivers, its
 * stream's centre line with the drawn surface's height at every row, and
 * its width): water within half the width of the line, the surface level
 * across it and straight along it between two rows, which is the plant's
 * sim_water_channel. It is:
 *   line            [{ x, y, z }], y the surface there
 *   halfWidth       m
 *   bed(x, z)       the ground under it
 *   chunks          boxes round every CHUNK segments, for surfaceAt
 * It has no waves: a stream five metres wide has no fetch for a wind to
 * raise any, and the drawn stream's ripples are its material's, laid on
 * the still surface. The map's pools (view.pools, a disc of still water)
 * are small lakes without wind.
 *
 * The map's height() answers the lake's surface over the lake, so that a
 * quad or a wheeled plane rests ON the water; wetHeight gives every other
 * body the same, so the ground over a river or a pool is its surface.
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
    kind: 'lake',
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

/* Segments a channel's box covers, as the plant's WATER_CHUNK. */
const CHUNK = 32;
/* The corners of a pool's outline. */
const POOL_SIDES = 48;

function channel(line, width, bed) {
  const halfWidth = width / 2;
  const chunks = [];
  for (let k = 0; k + 1 < line.length; k += CHUNK) {
    const end = Math.min(line.length - 1, k + CHUNK);
    const box = { k, end, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (let j = k; j <= end; j += 1) {
      box.x0 = Math.min(box.x0, line[j].x - halfWidth);
      box.x1 = Math.max(box.x1, line[j].x + halfWidth);
      box.z0 = Math.min(box.z0, line[j].z - halfWidth);
      box.z1 = Math.max(box.z1, line[j].z + halfWidth);
    }
    chunks.push(box);
  }
  return { kind: 'channel', line, halfWidth, bed, chunks };
}

function pool({ x, z, r, y }, bed) {
  const outline = [];
  for (let k = 0; k < POOL_SIDES; k += 1) {
    const a = (k / POOL_SIDES) * Math.PI * 2;
    outline.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
  }
  return {
    kind: 'lake', surfaceY: y, outline, bed, centre: { x, z }, spawn: null, wind: { speed: 0, toX: 1, toZ: 0, fetch: 0 },
  };
}

/*
 * The water bodies of a map, by its id and as built: an empty list for a
 * map without. The lake first, since where two bodies meet (the stream's
 * mouth) the first declared is the water, in the plant as here, and
 * then the drawn pools and rivers, each over the map's own ground.
 */
export async function waterFor(mapId, map) {
  const make = WATER[mapId];
  const lakes = make ? await Promise.all(make()) : [];
  if (!map) {
    return lakes;
  }
  /* The ground itself, under any roof or bridge: the map's height as it
   * is now, before wetHeight wraps it. */
  const height = map.height;
  const bed = (x, z) => height(x, z, -Infinity);
  return [
    ...lakes,
    ...(map.pools || []).map((p) => pool(p, bed)),
    ...(map.rivers || []).map((r) => channel(r.line, r.width, bed)),
  ];
}

/*
 * A channel's surface under (x, z) and how far off its line that is:
 * { d2, y }, the nearest segment's, or null where no chunk's box holds
 * the point. The plant's channel_nearest (src/native/water.c) in the
 * map's frame.
 */
function channelNearest(body, x, z) {
  const L = body.line;
  let best = null;
  for (const c of body.chunks) {
    if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) {
      continue;
    }
    for (let k = c.k; k < c.end; k += 1) {
      const ex = L[k + 1].x - L[k].x;
      const ez = L[k + 1].z - L[k].z;
      const l2 = ex * ex + ez * ez;
      let t = l2 > 0 ? ((x - L[k].x) * ex + (z - L[k].z) * ez) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (L[k].x + t * ex);
      const dz = z - (L[k].z + t * ez);
      const d2 = dx * dx + dz * dz;
      if (!best || d2 < best.d2) {
        best = { d2, y: L[k].y + t * (L[k + 1].y - L[k].y) };
      }
    }
  }
  return best;
}

/* The still surface's height of a body at (x, z), which should be inside
 * it. */
export function surfaceAt(body, x, z) {
  if (body.kind !== 'channel') {
    return body.surfaceY;
  }
  const n = channelNearest(body, x, z);
  return n ? n.y : -Infinity;
}

/*
 * The map's height with the water's surface over every body it does not
 * already answer for: the higher of the ground and the surface, so the
 * ground over a river is its water as the ground over the lake is, and a
 * bridge over it is still the bridge. Over the lake the map's height is
 * already its surface or above, so the lake changes nothing there.
 */
export function wetHeight(height, bodies) {
  if (!bodies.length) {
    return height;
  }
  return (x, z, fromY) => {
    const h = height(x, z, fromY);
    for (const b of bodies) {
      if (insideWater(b, x, z)) {
        const y = surfaceAt(b, x, z);
        return y > h ? y : h;
      }
    }
    return h;
  };
}

/* Whether (x, z) is inside a body: a channel within its half width of
 * its line, a lake inside its outline by the even odd crossing test. */
export function insideWater(body, x, z) {
  if (body.kind === 'channel') {
    const n = channelNearest(body, x, z);
    return Boolean(n) && n.d2 <= body.halfWidth * body.halfWidth;
  }
  const o = body.outline;
  if (!body.box) {
    body.box = {
      x0: Math.min(...o.map((p) => p.x)), x1: Math.max(...o.map((p) => p.x)), z0: Math.min(...o.map((p) => p.z)), z1: Math.max(...o.map((p) => p.z)),
    };
  }
  if (x < body.box.x0 || x > body.box.x1 || z < body.box.z0 || z > body.box.z1) {
    return false;
  }
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
