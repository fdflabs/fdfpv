/*
 * tunename.js: a tune's mode word (Stabilised, Manual) in the pilot's
 * language, for the Tune row (items.js) and the presets list (fc.js).
 *
 * The registry names tunes in English; a name with no key (AS3X, a brand)
 * is shown as it is, and scripts/es-leak-lint.js holds every name to a key
 * (tune.name.<word>) or to its list of words Spanish shares. This module
 * imports nothing from ui.js, so fc.js can use it without the loop
 * items.js -> ui.js -> fc.js.
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

import { tuneById } from '../../configs/registry.js';
import { hasStr, str } from '../strings/index.js';

export function tuneName(id) {
  const name = tuneById(id).name;
  const key = `tune.name.${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  return hasStr(key) ? str(key) : name;
}
