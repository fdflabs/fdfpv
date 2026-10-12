/*
 * node.js: Itaipu's data folder read from disk, for the room on the Node
 * VM and for the checks. The folder is its own public repository
 * (fdflabs/fdfpv-itaipu-data), not this one: FDFPV_ITAIPU_DATA names it,
 * by default ~/Desktop/fdfpv-itaipu-data. A browser fetches the same
 * files. getBuiltinModule rather than an import, as
 * src/share/interior/node.js reads the Interior's, so nothing that
 * bundles this module for a browser or a Worker meets node:fs.
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

import { tilePath } from '../../maps/terrain/frame.js';

function builtin(name) {
  const mod = globalThis.process && process.getBuiltinModule ? process.getBuiltinModule(name) : null;
  if (!mod) {
    throw new Error('itaipu: no file system here; a browser fetches the data folder');
  }
  return mod;
}

/* The data folder, absolute. */
export function itaipuDataDir() {
  const path = builtin('node:path');
  const os = builtin('node:os');
  return path.resolve(process.env.FDFPV_ITAIPU_DATA || path.join(os.homedir(), 'Desktop', 'fdfpv-itaipu-data'));
}

/*
 * world.js makeItaipuWorld's bytes, read synchronously from `dir`:
 * { manifest, dam, tile(level, i, j) }. Null when the folder has no
 * manifest.json, so a caller decides what a missing folder means.
 */
export function readItaipuBytes(dir = itaipuDataDir()) {
  const fs = builtin('node:fs');
  const path = builtin('node:path');
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    return null;
  }
  const json = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const tile = (level, i, j) => {
    const buf = fs.readFileSync(path.join(dir, tilePath(level, i, j)));
    return new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2).slice();
  };
  return { manifest: json('manifest.json'), dam: json('dam.json'), tile };
}
