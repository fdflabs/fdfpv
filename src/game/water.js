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

import { simErrorName, SIM_OK } from '../../tests/lib/simmod.js';

/* The outline's corners, the plant's most (WATER_VERTS_MAX), and the march
 * out along each: STEP to find the shore, then halved to a millimetre, and
 * the corner set SHORE_OUT past it, where the land is over the water and
 * the plant's water under it meets nothing. The shore is where the map's
 * own ground comes within `wet` of the still water: swiss2's lake is
 * drawn over its north shore's beach, one in eighty, five centimetres up
 * it (WET_SWISS2); the alps' stops where the ground crosses the water.
 * The outline was 96 corners on the terrain, not the map's ground, and
 * swiss2's north shore was drawn water with no water under it
 * (scripts/collide-audit-swiss2.js). */
const RAYS = 256;
const STEP = 3;
const SHORE_OUT = 1.5;
const WET_SWISS2 = 0.05;
/* The breeze on the Alps' lake, m/s. */
export const ALPS_LAKE_WIND = 2;

/* The lake over a ground height(x, z): the alps' own, or swiss2's, which is
 * the alps' with Lauterbrunnen's walls added where the walls are
 * (src/maps/swiss2/terrain.js, wallRise), so its lake's far shores are
 * where those walls meet the water. */
async function alpsLake(ground, shore, over = 0) {
  const t = await import('../maps/alps/terrain.js');
  const height = ground ? await ground(t) : t.terrainHeight;
  /* Where the shore is: on the map's own ground when it is built, which
   * answers the lake's surface over the water, within `over` of it; else
   * under the lake's level on the terrain. */
  const wet = shore ? (x, z) => shore(x, z) <= t.LAKE_Y + over : (x, z) => height(x, z) < t.LAKE_Y;
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
    while (r < 1100 && wet(cx + dx * r, cz + dz * r)) {
      r += STEP;
    }
    let inside = Math.max(0, r - STEP);
    while (r - inside > 0.001) {
      const m = (inside + r) / 2;
      if (wet(cx + dx * m, cz + dz * m)) {
        inside = m;
      } else {
        r = m;
      }
    }
    r += SHORE_OUT;
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
  alps: (shore) => [alpsLake(null, shore)],
  swiss2: (shore) => [alpsLake(async (t) => {
    const w = await import('../maps/swiss2/terrain.js');
    return (x, z) => t.terrainHeight(x, z) + w.wallRise(x, z);
  }, shore, WET_SWISS2)],
};

/* Segments a channel's box covers, as the plant's WATER_CHUNK. */
const CHUNK = 32;
/* The corners of a pool's outline. */
const POOL_SIDES = 48;
/* How far past the drawn stream's edge the plant's channel reaches, m.
 * The drawn ribbon's edge is exactly half its width off the line, so the
 * plant had water there by a rounding or not at all: swiss2's stream was
 * drawn water with none under it all along both edges, 2 528 m2 of it
 * (scripts/collide-audit-swiss2.js). Past the edge is the bank, over the
 * water, where the plant's water under the ground meets nothing. */
const CHANNEL_OUT = 0.25;

function channel(line, width, bed) {
  const halfWidth = width / 2 + CHANNEL_OUT;
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
  /* Round the drawn disc, not inside it: corners on the circle cut
   * inside it between them. */
  const R = r / Math.cos(Math.PI / POOL_SIDES);
  for (let k = 0; k < POOL_SIDES; k += 1) {
    const a = (k / POOL_SIDES) * Math.PI * 2;
    outline.push({ x: x + Math.cos(a) * R, z: z + Math.sin(a) * R });
  }
  return {
    kind: 'lake', surfaceY: y, outline, bed, centre: { x, z }, spawn: null, wind: { speed: 0, toX: 1, toZ: 0, fetch: 0 },
  };
}

/*
 * The water bodies of a map, by its id and as built: an empty list for a
 * map without. The lake first, since where two bodies meet (the stream's
 * mouth) the first declared is the water, in the plant as here, then the
 * lakes a map builds in this file's lake form itself (map.lakes: Itaipu's
 * reservoir and river, from its data), and then the drawn pools and
 * rivers, each over the map's own ground.
 */
export async function waterFor(mapId, map) {
  const make = WATER[mapId];
  const lakes = make ? await Promise.all(make(map ? (x, z) => map.height(x, z, -Infinity) : null)) : [];
  if (!map) {
    return lakes;
  }
  /* The ground itself, under any roof or bridge: the map's height as it
   * is now, before wetHeight wraps it. */
  const height = map.height;
  const bed = (x, z) => height(x, z, -Infinity);
  return [
    ...lakes,
    ...(map.lakes || []),
    ...(map.pools || []).map((p) => pool(p, bed)),
    ...(map.rivers || []).map((r) => channel(r.line, r.width, bed)),
  ];
}

/*
 * THE WATER, DECLARED TO THE PLANT: every body in `bodies`, in order, as
 * plant body 0, 1, 2 ..., through the module's exports `e`. `frame` turns
 * the map's frame into the plant's, which moves with the spawn: pos(x, y,
 * z, out) a point, dir(x, y, z, out) a direction, perMetre the plant's
 * metres in one of the map's (src/main.js declareWater gives the shell's
 * own). Returns [{ w, body }] for the lakes, whose waves the shell reads
 * back. The caller clears the plant's water first.
 *
 * Every refusal THROWS. The host used to drop them: a ninth body was
 * skipped, and an outline past the plant's 256 corners was cut short at
 * the 256th without a word, so a float plane met a shore that was not
 * drawn and fell through water that was. A map whose water the plant
 * cannot hold is a map to fix, and the error says which body and why.
 */
const waterSim = { x: 0, y: 0, z: 0 };
export function declareBodies(e, bodies, frame) {
  const must = (code, what, k) => {
    if (code !== SIM_OK) {
      throw new Error(`${what}: ${simErrorName(code)} for water body ${k} of ${bodies.length}`);
    }
  };
  const lakes = [];
  bodies.forEach((w, k) => {
    if (w.kind === 'channel') {
      const body = e.sim_water_channel(w.halfWidth * frame.perMetre);
      must(body < 0 ? body : SIM_OK, 'sim_water_channel', k);
      for (const p of w.line) {
        frame.pos(p.x, p.y, p.z, waterSim);
        must(e.sim_water_channel_point(body, waterSim.x, waterSim.y, waterSim.z), 'sim_water_channel_point', k);
      }
      return;
    }
    frame.pos(w.centre.x, w.surfaceY, w.centre.z, waterSim);
    const body = e.sim_water_add(waterSim.z, waterSim.x, waterSim.y);
    must(body < 0 ? body : SIM_OK, 'sim_water_add', k);
    w.outline.forEach((p, j) => {
      frame.pos(p.x, w.surfaceY, p.z, waterSim);
      must(e.sim_water_vertex(body, waterSim.x, waterSim.y), `sim_water_vertex (corner ${j + 1} of ${w.outline.length})`, k);
    });
    frame.dir(w.wind.toX, 0, w.wind.toZ, waterSim);
    const n = Math.hypot(waterSim.x, waterSim.y);
    must(e.sim_water_wind(body, w.wind.speed, waterSim.x / n, waterSim.y / n, w.wind.fetch), 'sim_water_wind', k);
    lakes.push({ w, body });
  });
  return lakes;
}

/*
 * Where an aircraft on floats starts, flown free: body `chosen`'s own
 * spawn. A body without one (a pool, a river channel) is not a start, and
 * choosing it throws rather than starting on some other body.
 */
export function floatSpawn(bodies, chosen) {
  const w = bodies[chosen];
  if (!w || !w.spawn) {
    throw new Error(`water body ${chosen} of ${bodies.length} has no float spawn`);
  }
  return w.spawn;
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
 * it: a lake's surfaceY, or its levelAt(x, z) where it has one and that
 * answers (water whose level is not one height, Itaipu's flood). */
export function surfaceAt(body, x, z) {
  if (body.kind !== 'channel') {
    const y = body.levelAt ? body.levelAt(x, z) : null;
    return y ?? body.surfaceY;
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
