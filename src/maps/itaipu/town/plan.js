/*
 * plan.js: what each OpenStreetMap building in the hero square looks
 * like: its style. The footprint's geometry (cleaned, its rectangle, its
 * heights, the faces it is drawn with, its roof as ground, a roofs.js
 * record, and its walls as boxes for the streamed collider set) is the
 * asset library's (src/render/library/buildings/footprint.js).
 *
 * STYLE. Only 35 buildings in the extract carry a height or a level count
 * and none carries a roof shape (docs/ITAIPU-PLAN.md section 7), so what
 * a building looks like is decided here from what the region builds,
 * matched against the reference photographs (~/Desktop/fdfpv-photoref/
 * itaipu): the houses of Hernandarias and Foz do Iguacu are hipped red
 * clay tile over white or pale render, with flat concrete slabs among
 * them; Brazil adds grey fibre cement and paints its render in colours,
 * Paraguay leaves more brick bare; the big sheds are low gables of
 * galvanised sheet; Itaipu's own buildings are white concrete, flat. The
 * data's own roof (A's rule: hipped for a house under 150 m2) is kept
 * wherever the footprint can carry it. Every choice is a function of the
 * building's OSM id (hashOf), so the town is the same on every load and
 * every machine.
 *
 * Pure: no THREE, so the checks run it in Node.
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

import { signedArea, inside } from '../../../render/library/buildings/footprint.js';

/* A footprint that fills this much of its rectangle is drawn as that
 * rectangle when its roof is pitched; less, and it keeps a flat roof on
 * its own outline. */
const RECT_FILL = 0.85;
const RECT_CORNERS = 8;

/*
 * The styles: the roof, its slope (rise over run: clay tile at 20
 * degrees, fibre cement at 10, sheet at 8), the eaves' overhang and the
 * roof's thickness in metres, and the surfaces (swiss2/look.js building
 * keys, whose group and finish the mesh takes; the tint is ours).
 */
export const ROOFS = {
  tile: { shape: 'hip', slope: 0.364, over: 0.6, thick: 0.18, surface: 'tile', material: 'rock', key: 'tile' },
  fibre: { shape: 'hip', slope: 0.176, over: 0.35, thick: 0.1, surface: 'render', material: 'concrete', key: 'fibre' },
  sheet: { shape: 'gable', slope: 0.141, over: 0.4, thick: 0.12, surface: 'hangarRoof', material: 'metal', key: 'sheetRoof' },
  slab: { shape: 'flat', surface: 'render', material: 'concrete', key: 'slab' },
  sheetFlat: { shape: 'flat', surface: 'hangarRoof', material: 'metal', key: 'sheetRoof' },
};

/* Linear tints on the photographed render, tile and sheet. */
const WALLS = {
  white: [0.78, 0.77, 0.73],
  offwhite: [0.72, 0.69, 0.62],
  cream: [0.74, 0.64, 0.45],
  yellow: [0.78, 0.6, 0.28],
  peach: [0.78, 0.55, 0.42],
  green: [0.52, 0.62, 0.48],
  blue: [0.52, 0.6, 0.68],
  grey: [0.5, 0.5, 0.48],
  brick: [0.56, 0.26, 0.15],
  concrete: [0.8, 0.8, 0.77],
};
const ROOF_TINTS = {
  tile: [[1.3, 0.55, 0.38], [1.1, 0.43, 0.3], [1.45, 0.66, 0.45], [0.95, 0.42, 0.32]],
  fibre: [[0.55, 0.56, 0.56], [0.46, 0.47, 0.47]],
  sheet: [[0.42, 0.44, 0.44], [0.55, 0.57, 0.57], [0.25, 0.32, 0.4], [0.47, 0.19, 0.09]],
  slab: [[0.55, 0.54, 0.5], [0.62, 0.61, 0.58], [0.45, 0.45, 0.43]],
  plant: [[0.72, 0.72, 0.7]],
};
/* Share of each wall colour by bank, of 1. */
const WALL_MIX = {
  py: [['white', 0.3], ['brick', 0.25], ['offwhite', 0.15], ['cream', 0.1], ['peach', 0.08], ['green', 0.06], ['blue', 0.06]],
  br: [['white', 0.35], ['offwhite', 0.15], ['cream', 0.12], ['yellow', 0.1], ['peach', 0.08], ['green', 0.07], ['blue', 0.07], ['grey', 0.06]],
};

/* FNV-1a over the id, then a second draw per `salt`: [0, 1). */
export function hashOf(id, salt = 0) {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

function pick(mix, u) {
  let acc = 0;
  for (const [name, w] of mix) {
    acc += w;
    if (u < acc) {
      return name;
    }
  }
  return mix[mix.length - 1][0];
}

/*
 * Which bank: Paraguay west of the Parana, Brazil east. Below the dam the
 * river's middle runs from x -925 at z 400 to x -1506 at the Friendship
 * Bridge (frame.js LANDMARKS); above it the border is the reservoir's
 * middle, taken as x -600. Only colours ride on it.
 */
export function bankOf(x, z) {
  const riverX = z > -1700 ? -925 + ((z - 400) * (-1506 + 925)) / (9535 - 400) : -600;
  return x < riverX ? 'py' : 'br';
}

/* Is (x, z) inside any of the landuse areas `areas` ([{ outer, box }]). */
function within(areas, x, z) {
  return areas.some((a) => x >= a.box[0] && x <= a.box[2] && z >= a.box[1] && z <= a.box[3] && inside(a.outer, x, z));
}

export function landuseAreas(features, value) {
  return features.filter((f) => f.key === 'landuse' && f.value === value).map((f) => {
    let box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, z] of f.outer) {
      box = [Math.min(box[0], x), Math.min(box[1], z), Math.max(box[2], x), Math.max(box[3], z)];
    }
    return { id: f.id, outer: f.outer, box };
  });
}

/*
 * The style of one building: its roof (a ROOFS key), whether it is drawn
 * on its rectangle, the wall and roof tints, and what kind of building
 * the roof record says it is.
 */
export function styleOf(f, ring, rect, industrial) {
  const bank = bankOf(rect.cx, rect.cz);
  const u = hashOf(f.id);
  const fill = Math.abs(signedArea(ring)) / rect.area;
  const rectLike = fill >= RECT_FILL && ring.length <= RECT_CORNERS && rect.hs >= 1.5;
  const tintOf = (list, salt) => list[Math.floor(hashOf(f.id, salt) * list.length)];
  const plant = within(industrial, rect.cx, rect.cz);
  let roof;
  if (plant) {
    roof = 'slab';
  } else if (f.building === 'industrial' || f.building === 'warehouse' || f.area >= 1200) {
    roof = rectLike ? 'sheet' : 'sheetFlat';
  } else if (!rectLike || f.area > 400 || f.building === 'apartments') {
    roof = 'slab';
  } else if (f.roof === 'hipped') {
    roof = 'tile';
  } else if (bank === 'br') {
    roof = u < 0.55 ? 'tile' : u < 0.8 ? 'fibre' : 'slab';
  } else {
    roof = u < 0.7 ? 'tile' : 'slab';
  }
  const spec = ROOFS[roof];
  const wall = plant ? WALLS.concrete : WALLS[pick(WALL_MIX[bank], hashOf(f.id, 1))];
  let roofTint;
  if (plant) {
    roofTint = ROOF_TINTS.plant[0];
  } else if (roof === 'sheet' || roof === 'sheetFlat') {
    roofTint = tintOf(ROOF_TINTS.sheet, 2);
  } else {
    roofTint = tintOf(ROOF_TINTS[roof], 2);
  }
  const kind = spec.shape === 'hip' ? 'house' : spec.shape === 'gable' ? 'shed' : 'flat';
  return {
    roof, spec, bank, wall, roofTint, kind, onRect: spec.shape !== 'flat', plant,
  };
}
