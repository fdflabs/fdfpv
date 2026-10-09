/*
 * render-golden/building-kit.js: the Alps' building kit, which the Swiss
 * valley builds its village, farms, station and hangar on (kit.js, under
 * src/maps/alps/ when this was recorded), pinned before it moves into the
 * shared asset library (docs/ASSET-LIBRARY.md), so the move is proved to
 * change nothing: every builder put in a frame of its own, its bake's
 * buffers by material key, its instances, its roof records and the solids
 * it notes, the fence on a slope, and the village's materials.
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

import * as kit from '../../../src/maps/alps/kit.js';
import { makeRng } from '../../../src/render/library/noise.js';
import { describeGeometry, describeMaterial, makeTable, hashBytes } from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => sig(v)));

/* One builder's bake, described. */
function built(build) {
  const bake = kit.makeBake();
  const f = kit.frame(bake, 3, 0.5, -2, 0.4);
  const ret = build(f, bake);
  const table = makeTable();
  return {
    parts: Object.fromEntries(Object.keys(bake.parts).sort().map((k) => [k, bake.parts[k].map((g) => describeGeometry(g, table))])),
    instances: Object.fromEntries(Object.keys(bake.instances).sort().map((k) => {
      const e = bake.instances[k];
      return [k, { key: e.key, geometry: describeGeometry(e.geometry, table), matrices: hashBytes(new Float32Array(e.matrices.flatMap((m) => m.elements))) }];
    })),
    roofs: round(bake.roofs),
    solids: round(bake.solids),
    returned: ret === undefined ? null : round(ret && typeof ret === 'object' ? Object.keys(ret).sort() : ret),
  };
}

const HOUSES = [
  { w: 9.5, d: 13, floors: 2, roof: 'gable', board: 'larchDark', base: 'stone', balconies: 'one', roofKey: 'shingle' },
  { w: 10, d: 14, floors: 1, roof: 'halfhip', board: 'larch', base: 'stone', balconies: 'both', roofKey: 'shingle' },
  { w: 10.5, d: 12, floors: 2, roof: 'hip', board: 'larch', base: 'render', balconies: 'both', roofKey: 'slate', ov: 1.2 },
];

export function cases() {
  return {
    exports: () => Object.keys(kit).sort().map((k) => [k, typeof kit[k]]),
    materials: () => {
      const mats = kit.villageMaterials();
      const table = makeTable();
      return Object.fromEntries(Object.keys(mats).sort().map((k) => [k, describeMaterial(mats[k], table)]));
    },
    chalets: () => HOUSES.map((s, i) => built((f) => kit.chalet(f, makeRng(11 + i), { ...s, found: 0.4 }))),
    buildings: () => ({
      barnHay: built((f) => kit.barn(f, { kind: 'hay', found: 0.3, w: 11, d: 15 })),
      barnStall: built((f) => kit.barn(f, { kind: 'stall', found: 0.3, w: 10, d: 16 })),
      farmhouse: built((f) => kit.farmhouse(f, makeRng(5), { found: 0.3, board: 'honey' })),
      gasthof: built((f) => kit.gasthof(f, makeRng(6), { found: 0.3 })),
      shop: built((f) => kit.shop(f, makeRng(7), { found: 0.3 })),
      church: built((f) => kit.church(f, { found: 0.3 })),
      hangar: built((f) => kit.hangar(f, { found: 0.3 })),
    }),
    small: () => ({
      bridge: built((f) => kit.bridge(f)),
      bridgeLong: built((f) => kit.bridge(f, { span: 8, deckY: 1.4 })),
      fountain: built((f) => kit.fountain(f)),
      bench: built((f) => kit.bench(f)),
      busShelter: built((f) => kit.busShelter(f)),
      roadSign: built((f) => kit.roadSign(f)),
      telegraphPole: built((f) => kit.telegraphPole(f)),
      cone: built((f) => kit.cone(f, 1, 2)),
      fence: built((f, bake) => kit.fence(bake, (x, z) => 0.05 * x - 0.02 * z, -10, 0, 12, 8)),
      geometries: [kit.poleGeometry(), kit.insulatorGeometry(), kit.coneGeometry()].map((g) => describeGeometry(g, makeTable())),
    }),
  };
}
