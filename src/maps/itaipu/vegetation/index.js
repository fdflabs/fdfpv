/*
 * vegetation/index.js: the forests and the near trees. A STUB, package B's, until package G
 * replaces it (docs/ITAIPU-PLAN.md section 14).
 *
 * The part interface, the seam every part is built against:
 *
 *   export async function buildPart(ctx) -> { group, update(stepIndex), dispose(), stats() }
 *
 *   ctx = {
 *     THREE, scene, quality: 'low'|'medium'|'high',
 *     data,          parsed JSON files from the data folder, by name
 *                    ('water.json', 'dam.json', 'osm/roads.json', ...)
 *     base,          the data folder's URL, ending in a slash, for what is
 *                    not JSON (canopy/, masks/, imagery/)
 *     manifest,      the data's manifest.json
 *     ground(x, z),  terrain height, world metres, water beds included
 *     colliders,     the map's Colliders, not yet built
 *     roofs,         the map's roofs record (src/maps/alps/roofs.js)
 *     mats,          swiss2's material kit, shared, never disposed by a part
 *     progress(f),   0 to 1 within the part's share of the bar
 *   }
 *
 * A part adds its colliders and roof records during buildPart and never
 * after; the map calls colliders.build() once, when every part is in.
 * The map adds `group` to the scene, and passes every material in it
 * through the light (look/index.js finish) once all the parts are built.
 * On a swap the scene graph frees every geometry, material and texture
 * in `group` (src/render/shell.js disposeSceneGraph); dispose() frees
 * only what the graph cannot reach (a render target, a worker's buffer).
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export async function buildPart(ctx) {
  const group = new ctx.THREE.Group();
  group.name = 'itaipu-vegetation';
  ctx.progress(1);
  return {
    group,
    update() {},
    dispose() {},
    stats: () => ({ stub: true }),
  };
}
