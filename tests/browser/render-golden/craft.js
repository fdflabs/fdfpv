/*
 * render-golden/craft.js: src/render/craft.js's dispatch and its
 * published dimensions. Which ids share a builder (retired and unknown ids
 * included), what buildCraft hands its builder and returns, and craftDims
 * for every airframe once it is the one last built. The models themselves
 * are their builders' business and are not described.
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

import * as craft from '../../../src/render/craft.js';
import { AIRFRAME_IDS } from '../../../configs/airframes.js';

const sig = (v) => (typeof v === 'number' ? Number(v.toPrecision(12)) + 0 : v);
const EXTRA = ['5inch', 'whoop65', 'nope', undefined, ''];

export function cases() {
  return {
    exports: () => Object.keys(craft).sort(),
    dispatch: () => {
      const seen = [];
      return [...AIRFRAME_IDS, ...EXTRA].map((id) => {
        let fn;
        try {
          fn = craft.craftBuilderFor(id);
        } catch (e) {
          return [String(id), `threw ${e.message}`];
        }
        if (typeof fn !== 'function') {
          return [String(id), typeof fn];
        }
        if (!seen.includes(fn)) {
          seen.push(fn);
        }
        return [String(id), seen.indexOf(fn)];
      });
    },
    built: () => AIRFRAME_IDS.map((id) => {
      const built = craft.buildCraft(id);
      const g = built.group;
      return {
        id,
        name: g.name,
        scale: g.scale.toArray(),
        keys: Object.keys(built).filter((k) => built[k] !== undefined).sort(),
        dims: Object.fromEntries(Object.entries(craft.craftDims()).map(([k, v]) => [k, sig(v)])),
      };
    }),
  };
}
