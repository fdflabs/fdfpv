/*
 * farm.js: the farm up the west side of the floor that the farm-low view
 * looks at, north of the village's pasture, and its hay barn out in the
 * meadow below it.
 *
 * The cel village has three farms and the fenced pastures' barns; north
 * of the pasture at z 330 the floor it leaves is open meadow as far as
 * the lake, and the view that is judged against a photograph of a hay
 * barn in a meadow with the farm behind it had nothing in its frame.
 * This stands a Stadel in the meadow eighty metres out from that view
 * and a farmhouse, its barn under the same ridge, up the rise across the
 * stream, placed exactly as alps/village.js places its farms: level on
 * the highest corner of the ground under it, the foundation cut down to
 * the lowest, its collider the box round the turned footprint from the
 * foundation to the ridge. They are baked with the village, so they are
 * drawn by the village's meshes and cost no draw of their own.
 *
 * Nothing here draws the village's rng: the farmhouse's is its own seed,
 * and it runs after everything else the village furnishes. The colliders
 * are returned, not added: swiss2.js adds them after it has taken the
 * village's walls as the gardens (vegetation/forest.js plants a tree or
 * two by each from the forest's rng, and one garden more moved three
 * hundred and sixty trees across the valley) and the huts' village
 * (props/). The trees and the meadow still keep off them, since they
 * are walls by the time the forest is planted, and none stood within
 * fifteen metres of either.
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

import { makeRng } from '../../alps/noise.js';
import { frame } from '../buildings/parts.js';
import { stadel, farmhouse } from '../buildings/houses.js';

/* Where they stand: x, z, the turn, and the footprint the ground is read
 * under, as village.js's place() takes them. The farmhouse keeps north
 * of z 500, in a bake cell of its own (bake.js), so its near detail is
 * drawn only within two hundred metres of it: in the cell south of it
 * the valley's west farm's detail would be drawn with it, a dozen draws
 * more in the view that sees them both from far off. */
export const FARM = {
  stadel: { x: -100, z: 468, ry: 1.25, hw: 4.3, hd: 5.6 },
  house: { x: -300, z: 518, ry: 0.36, hw: 7, hd: 15 },
};

/* The bake, with every near key made a far one that casts: the Stadel's
 * near detail is a few hundred triangles, and in the bake cell it would
 * join it would bring that cell's near detail into the farm-low view,
 * eight draws for what it has always drawn without. */
function farOnly(bake) {
  const far = (key) => {
    const [name, mark = ''] = key.split(':');
    if (!mark.includes('f')) {
      return key;
    }
    const rest = mark.replace(/[fo]/g, '');
    return rest ? `${name}:${rest}` : name;
  };
  return { ...bake, pushM: (key, geometry, matrix) => bake.pushM(far(key), geometry, matrix) };
}

/* Bake the farm; returns its buildings' keep out boxes, [x0, y0, z0, x1,
 * y1, z1], each with the roofs and solid parts it put and the village
 * datum they are over (alps/roofs.js standWalls). */
export function farmstead(ctx) {
  const { bake, onGround, villageY } = ctx;
  const walls = [];
  const corners = (x, z, ry, hw, hd) => {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    return [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]].map(([lx, lz]) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c }));
  };
  const place = (build, { x, z, ry, hw, hd }, into = bake) => {
    const pts = [...corners(x, z, ry, hw, hd), { x, z }].map((p) => onGround(p.x, p.z));
    const y = Math.max(...pts);
    const found = y - Math.min(...pts) + 0.4;
    const from = bake.roofs.length;
    const fromSolids = bake.solids.length;
    const ext = build(frame(into, x, y, z, ry), found);
    const box = corners(x, z, ry, ext.hw, ext.hd);
    const xs = box.map((p) => p.x);
    const zs = box.map((p) => p.z);
    walls.push({
      box: [Math.min(...xs), villageY + y - found, Math.min(...zs), Math.max(...xs), villageY + y + ext.top, Math.max(...zs)],
      roofs: bake.roofs.slice(from),
      parts: bake.solids.slice(fromSolids),
      lift: villageY,
    });
  };
  place((f, found) => stadel(f, { found }), FARM.stadel, farOnly(bake));
  const rng = makeRng(20261011);
  place((f, found) => farmhouse(f, rng, { found, board: 'larchDark' }), FARM.house);
  return walls;
}
