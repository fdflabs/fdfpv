/*
 * render-golden/photo-materials.js: the photographed materials Itaipu's
 * and the Interior's buildings are finished with, as the Swiss valley's
 * were (src/maps/swiss2/assets.js when this was recorded), pinned before
 * they moved into the shared asset library (docs/ASSET-LIBRARY.md), so the
 * move is proved to change nothing: the surface list and each surface's
 * three maps, their files and settings. The valley's terrain layers and
 * their two texture arrays left with the valleys (2026-10-20), and their
 * cases with them.
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
    lists: () => ({ SURFACES: assets.SURFACES }),
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
