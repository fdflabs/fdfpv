/*
 * town/index.js: OpenStreetMap's buildings, roads and power lines in the
 * hero square, and the Friendship Bridge in the ring (docs/ITAIPU-PLAN.md
 * section 7; section 14, package F).
 *
 *   model.js    the town in numbers: what is drawn, what is ground, what
 *               is streamed (plan.js buildings, roads.js roads and
 *               bridges, power.js towers and wires, bridge.js the
 *               Friendship Bridge, drape.js the roads on the ground)
 *   mesh.js     the faces into a batch a surface, in chunks each pass culls
 *
 * The part interface is the one every part is built against:
 *
 *   export async function buildPart(ctx) -> { group, update(stepIndex), dispose(), stats() }
 *
 * and this part adds `stream`, the map's seam for the streamed set
 * (src/maps/itaipu.js), and `view`, which once a frame gives each chunk
 * its near or far detail by its distance from the camera (mesh.js
 * NEAR). The roofs and the bridges' decks go into ctx.roofs and the
 * decks' walls into ctx.colliders during buildPart; the buildings' walls
 * and the power lines are only ever in the streamed set.
 *
 * The data is OpenStreetMap's, ODbL: "(c) OpenStreetMap contributors",
 * credited where the map is shown (src/ui/credits.js and the world card,
 * package B) and carried in stats() with the data it came from.
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

import { planTown } from './model.js';
import { makeSink } from './mesh.js';
import { yieldToPaint } from '../../../ui/loading.js';

export async function buildPart(ctx) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  group.name = 'itaipu-town';
  const t0 = performance.now();
  const sink = makeSink(THREE, ctx.mats.look);
  /* The yard's gantries, which a warhead can bring down, go in the map's
   * breakable mesh (ctx.breakable, mesh.js makeBreakable). */
  const town = await planTown({
    data: ctx.data,
    ground: ctx.ground,
    sink,
    breakable: ctx.breakable ?? null,
    progress: (f) => ctx.progress(0.9 * f),
    yieldEvery: yieldToPaint,
  });
  for (const rec of town.records) {
    ctx.roofs.push(rec);
  }
  for (const b of town.fixed) {
    ctx.colliders.addBox('wall', ...b);
  }
  for (const c of town.fixedCaps) {
    ctx.colliders.add('wall', ...c);
  }
  const drawn = sink.build(group, town.wires);
  const buildMs = performance.now() - t0;
  ctx.progress(1);
  const osm = ctx.data['osm/buildings.json'];
  return {
    group,
    update() {},
    view(target, camera) {
      sink.view(camera);
    },
    dispose() {},
    stream: town.stream,
    /* The model, for the checks (scripts/town-check.js). */
    town,
    stats: () => ({
      ...town.counts,
      drawn,
      buildMs: Math.round(buildMs),
      friendship: town.friendship,
      stream: { ...town.stream.near },
      attribution: osm.attribution,
      data: osm.data,
    }),
  };
}
