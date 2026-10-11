/*
 * render-golden/footprint-buildings.js: buildings raised from footprint
 * polygons (Itaipu's town, src/maps/itaipu/town/plan.js when this was
 * recorded): each footprint cleaned, its rectangle, its style, heights,
 * roof as ground and as faces, walls as faces and as collider boxes,
 * pinned before the geometry moves into the shared asset library
 * (docs/ASSET-LIBRARY.md) and the style stays Itaipu's, so the split is
 * proved to change nothing. The footprints are made up: rectangles of
 * every size and turn, L, U and T shapes, a long shed, on both banks
 * and in an industrial area, on sloping ground.
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

import * as plan from '../../../src/maps/itaipu/town/plan.js';
import { hashText } from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'function' ? '[fn]' : sig(v))));

/* A long list as its count and a hash of its rounded text. */
const pin = (list) => ({ n: list.length, hash: hashText(JSON.stringify(round(list))) });

const ground = (x, z) => 120 + 0.03 * x - 0.05 * z + 1.5 * Math.sin(x / 13) * Math.cos(z / 17);

/* A shape's outline round the origin, turned by `a` and set at (cx, cz),
 * closed as OSM closes it. */
function placed(shape, cx, cz, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const ring = shape.map(([x, z]) => [Number((cx + c * x - s * z).toFixed(1)), Number((cz + s * x + c * z).toFixed(1))]);
  return ring.concat([ring[0]]);
}
const rect = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
const SHAPES = {
  small: rect(8, 6),
  house: rect(12, 9),
  long: rect(40, 14),
  shed: rect(60, 30),
  block: rect(25, 22),
  ell: [[0, 0], [16, 0], [16, 6], [6, 6], [6, 14], [0, 14]],
  you: [[0, 0], [20, 0], [20, 14], [14, 14], [14, 5], [6, 5], [6, 14], [0, 14]],
  tee: [[0, 8], [7, 8], [7, 0], [11, 0], [11, 8], [18, 8], [18, 12], [0, 12]],
  notch: [[0, 0], [12, 0], [12, 9], [7, 9], [7, 8], [0, 8]],
  bent: [[0, 0], [10, 0], [10.3, 5], [10, 10], [0, 10]],
};
const areaOf = (ring) => {
  let s = 0;
  for (let i = 0; i + 1 < ring.length; i += 1) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(s / 2);
};
function features() {
  const out = [];
  const names = Object.keys(SHAPES);
  const kinds = ['yes', 'house', 'apartments', 'industrial', 'warehouse', 'yes', 'house', 'retail'];
  let k = 0;
  for (const bank of [-1500, 400]) {
    for (let i = 0; i < 18; i += 1) {
      const name = names[i % names.length];
      const outer = placed(SHAPES[name], bank + 70 * (i % 6), 300 + 60 * Math.floor(i / 6), (i * 0.37) % 1.6);
      out.push({
        id: `w${1000 + k}`,
        building: kinds[k % kinds.length],
        outer,
        holes: [],
        area: areaOf(outer),
        height: 3 + (k % 5) * 2.5,
        roof: k % 4 === 0 ? 'hipped' : 'flat',
      });
      k += 1;
    }
  }
  return out;
}
const LANDUSE = [
  { id: 'w1', key: 'landuse', value: 'industrial', outer: [[300, 250], [800, 250], [800, 430], [300, 430], [300, 250]], holes: [] },
  { id: 'w2', key: 'natural', value: 'wetland', outer: [[0, 0], [10, 0], [10, 10], [0, 0]], holes: [] },
];

export function cases() {
  return {
    exports: () => Object.keys(plan).sort().map((k) => [k, typeof plan[k]]),
    constants: () => round({ COLUMN: plan.COLUMN, ROOFS: plan.ROOFS }),
    helpers: () => round({
      hashes: ['w1', 'w186542023', 'n77', ''].map((id) => [plan.hashOf(id), plan.hashOf(id, 3)]),
      banks: [[-2000, 0], [0, 0], [-700, -2000], [-500, -2000], [-1300, 6000]].map(([x, z]) => plan.bankOf(x, z)),
      areas: Object.values(SHAPES).map((s) => plan.signedArea(s)),
      landuse: plan.landuseAreas(LANDUSE, 'industrial'),
    }),
    buildings: () => {
      const industrial = plan.landuseAreas(LANDUSE, 'industrial');
      return round(features().map((f) => {
        const ring = plan.cleanRing(f.outer, f.id);
        const rect = plan.rectOf(ring);
        const style = plan.styleOf(f, ring, rect, industrial);
        const drawn = style.onRect ? plan.rectRing(rect) : ring;
        const { base, plate } = plan.heightsOf(drawn, ground, f.height);
        const roof = plan.roofOf(style, drawn, rect, plate, f.id);
        const tris = plan.triangulate(ring, f.id);
        const boxes = plan.wallBoxes(drawn, base, plate, roof.rec, roof.gables);
        const bare = plan.wallBoxes(drawn, 0, 10, null, []);
        return {
          id: f.id,
          ring,
          rect,
          style,
          drawn,
          base,
          plate,
          roof: { rec: roof.rec, faces: pin(roof.faces), gables: pin(roof.gables), frame: roof.frame },
          walls: pin(plan.wallFaces(drawn, base, plate)),
          boxes: { boxes: pin(boxes.boxes), eaves: pin(boxes.eaves), keys: Object.keys(boxes).sort() },
          bare: { boxes: pin(bare.boxes), eaves: pin(bare.eaves) },
          tris: { ...tris, tris: pin(tris.tris) },
          pieces: pin(plan.convexPieces(ring, tris.tris)),
        };
      }));
    },
  };
}
