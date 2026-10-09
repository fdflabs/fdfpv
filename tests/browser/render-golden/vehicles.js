/*
 * render-golden/vehicles.js: the Alps' vehicle kit, which the Swiss valley
 * drives too (vehicles.js and the parts kit it is built from, under
 * src/maps/alps/ when this was recorded), pinned before it moves into the
 * shared asset library (docs/ASSET-LIBRARY.md), so the move is proved to
 * change nothing: every vehicle baked, its wheels and its numbers, and the
 * parts kit's own shapes and material.
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

import * as vehicles from '../../../src/maps/alps/vehicles.js';
import * as parts from '../../../src/maps/alps/parts.js';
import { describeGeometry, describeMaterial, makeTable } from '../render-golden-lib.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => sig(v)));
const exportsOf = (m) => Object.keys(m).sort().map((k) => [k, typeof m[k]]);

/* A builder's result: its parts baked, and everything else it returns. */
function baked(built) {
  const table = makeTable();
  const out = {};
  for (const k of Object.keys(built).sort()) {
    const v = built[k];
    if (v && v.list) {
      out[k] = describeGeometry(parts.bakeParts(v), table);
    } else if (v && v.isBufferGeometry) {
      out[k] = describeGeometry(v, table);
    } else if (Array.isArray(v)) {
      out[k] = v.map((w) => (w && w.isBufferGeometry ? describeGeometry(w, table) : round(w)));
    } else {
      out[k] = round(v);
    }
  }
  return out;
}

export function cases() {
  return {
    exports: () => ({ vehicles: exportsOf(vehicles), parts: exportsOf(parts) }),
    constants: () => round({
      PAINT: vehicles.PAINT, CAR_COLOURS: vehicles.CAR_COLOURS, CARS: vehicles.CARS, TRAILER_HITCH: vehicles.TRAILER_HITCH,
    }),
    wheel: () => describeGeometry(vehicles.wheelGeometry(), makeTable()),
    cars: () => Object.keys(vehicles.CARS).map((kind) => [kind, baked(vehicles.buildCar(kind, vehicles.CAR_COLOURS[0]))]),
    others: () => ({
      postbus: baked(vehicles.buildPostbus()),
      tractor: baked(vehicles.buildTractor()),
      trailer: baked(vehicles.buildTrailer()),
      motorbike: baked(vehicles.buildMotorbike(vehicles.CAR_COLOURS[1])),
      aircraft: baked(vehicles.buildAircraft()),
    }),
    kit: () => {
      const table = makeTable();
      const P = parts.makeParts();
      parts.panel(P, 0x336699, 0, 0, 1, 0.5, 0.8, 0.05);
      return {
        material: describeMaterial(parts.partsMaterial(), table),
        materialTuned: describeMaterial(parts.partsMaterial({ roughness: 0.4 }), table),
        panel: describeGeometry(parts.bakeParts(P), table),
        box: describeGeometry(parts.box(1, 2, 3), table),
        boxUp: describeGeometry(parts.boxUp(1, 2, 3), table),
        cylZ: describeGeometry(parts.cylZ(0.3, 2), table),
        extrudeZ: describeGeometry(parts.extrudeZ([[0, 0], [1, 0], [0.5, 1]], 0.4), table),
        shade: [parts.shade(0x808080, 0.5), parts.shade(0xff8800, 1.2)],
      };
    },
  };
}
