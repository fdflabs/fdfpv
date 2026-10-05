/*
 * node.js: the Interior's shared ground read from the files beside this
 * module, for the room on the Node VM and for the checks. A browser
 * fetches the same bytes (world.js fetchWorldBytes). getBuiltinModule
 * rather than an import, as edge/rooms/war.js reads Itaipu's heightfield,
 * so nothing that bundles this module for a browser or a Worker meets
 * node:fs.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* height.bin and land.bin's bytes, read synchronously. Throws where there
 * is no file system (a browser, a Worker). */
export function readWorldBytes() {
  const fs = globalThis.process && process.getBuiltinModule ? process.getBuiltinModule('node:fs') : null;
  if (!fs) {
    throw new Error('interior: no file system here; a browser fetches the ground (world.js fetchWorldBytes)');
  }
  return {
    height: fs.readFileSync(new URL('./height.bin', import.meta.url)),
    land: fs.readFileSync(new URL('./land.bin', import.meta.url)),
  };
}
