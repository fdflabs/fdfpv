/*
 * render-golden/photo-materials.js: the photographed materials the Swiss
 * valley's ground is blended from and its buildings, Itaipu's and the
 * Interior's are finished with (src/maps/swiss2/assets.js when this was
 * recorded), pinned before they move into the shared asset library
 * (docs/ASSET-LIBRARY.md), so the move is proved to change nothing: the
 * layer and surface lists, the terrain layers' two texture arrays to the
 * byte, and each surface's three maps, their files and settings.
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

import * as assets from '../../../src/render/library/surfaces.js';
import { describeTexture, makeTable } from '../render-golden-lib.js';

const file = (t) => (t.image && t.image.src ? t.image.src.replace(window.location.origin, '') : null);

export function cases() {
  return {
    lists: () => ({ LAYERS: assets.LAYERS, SURFACES: assets.SURFACES }),
    terrain: async () => {
      const table = makeTable();
      const a = await assets.loadTerrainArrays(64, 4);
      return { keys: Object.keys(a).sort(), col: describeTexture(a.col, table), nrh: describeTexture(a.nrh, table) };
    },
    surfaces: async () => {
      const out = {};
      for (const n of assets.SURFACES) {
        const table = makeTable();
        const s = await assets.loadSurface(n, 8);
        out[n] = Object.fromEntries(Object.keys(s).sort().map((k) => [k, { file: file(s[k]), ...describeTexture(s[k], table) }]));
      }
      return out;
    },
  };
}
