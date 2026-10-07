/*
 * oldkeys.js: moving values stored under the project's old webfpv.* names
 * to their fdfpv.* names, so nobody loses a setting to the rename.
 *
 * A module that renames a key calls carryRenamedKeys once, at load, with
 * [old, new] pairs. For each pair the old value is copied to the new name
 * unless the new name already holds one (then the new value is the live
 * one and the old is stale), and the old name is removed only after that,
 * so storage that refuses the write leaves the old value to try again on
 * the next load. Running it again changes nothing.
 *
 * Modules load after src/boot.js has run the move from the old origin
 * (src/share/move.js), so a guest's carried storage, which may still use
 * the old names, is renamed here on the same load.
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

/* `storage` defaults to the page's localStorage; with none (Node, storage
 * switched off) there is nothing stored to carry and nothing is done. A
 * pair whose write is refused is left for the next load and the rest
 * still move. */
export function carryRenamedKeys(pairs, storage = pageStorage()) {
  if (!storage) {
    return;
  }
  for (const [before, after] of pairs) {
    try {
      const value = storage.getItem(before);
      if (value === null) {
        continue;
      }
      if (storage.getItem(after) === null) {
        storage.setItem(after, value);
      }
      storage.removeItem(before);
    } catch (e) {
      /* Refused: the old value stays and is tried again next load. */
    }
  }
}

function pageStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (e) {
    return null;
  }
}
