/*
 * dom.js: the two small things every screen of the shell builds with, kept
 * in one place so the hangar tabs, the campaign card and the toasts stop
 * carrying a private copy each.
 *
 *   el        a new element with an optional class list and text
 *   padLevels a gamepad or radio poll reduced to plain booleans, the shape
 *             the edge triggered pollPad methods keep as their last poll
 *
 * Nothing here runs at import, so scripts can import the screens in Node.
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

/* An empty class or a missing text leaves that property alone, so
 * el('div') is a bare div. A text of 0 or '' is still written: only null
 * and undefined mean "no text". */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/* The navigation fields a pollPad reads, each forced to a boolean so the
 * previous poll can be compared key by key. Only the named keys are kept:
 * the comparison would otherwise see fields like look, which are levels
 * read every poll and never edges. */
export function padLevels(nav, keys) {
  const levels = {};
  for (const key of keys) levels[key] = Boolean(nav[key]);
  return levels;
}
