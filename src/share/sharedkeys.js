/*
 * sharedkeys.js: the storage keys the simulator shares with the board, and
 * their move from webfpv.* to fdfpv.* names.
 *
 * Where the simulator and the board are served from one origin (the VM:
 * the simulator at the root, the board under /board) they read one
 * localStorage, and two values are shared on purpose: the language choice
 * and the statistics memory (first and latest visit day, sponsor slug, opt
 * out). The board's public/sharedkeys.js holds the same table and rules;
 * KEEP THE TWO IN STEP.
 *
 * The two sites deploy separately, so for a while one may run a build that
 * knows only the old name. The rule that keeps both right through that:
 * a build that knows both names writes the value under both, identically;
 * on reading, a value under the old name that differs from the new one can
 * only have been written since by an old build, so it wins. Once both
 * sites have run this for a while, the old names can be dropped (stop
 * writing them, stop reading them, delete them).
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

export const LANG_KEY = 'fdfpv.lang';
export const STATS_KEY = 'fdfpv.stats.v1';

/* New name to the old one it replaces. */
const OLD_NAMES = {
  [LANG_KEY]: 'webfpv.lang',
  [STATS_KEY]: 'webfpv.stats.v1',
};

/* The value under `key` (one of the names above), or null. Throws as
 * localStorage does when storage is refused; callers already guard. */
export function readSharedKey(key, storage = localStorage) {
  const now = storage.getItem(key);
  const before = storage.getItem(OLD_NAMES[key]);
  return before !== null && before !== now ? before : now;
}

/* Write `value` under both names, the old one first: if the second write
 * is refused, the old name holds the new value and wins on reading, and if
 * the first is refused, nothing has changed. Throws as localStorage does. */
export function writeSharedKey(key, value, storage = localStorage) {
  const text = String(value);
  storage.setItem(OLD_NAMES[key], text);
  storage.setItem(key, text);
}
