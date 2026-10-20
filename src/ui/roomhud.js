/*
 * roomhud.js: a room game's standings on screen, one line each, down the
 * left of the flight screen while the game is on (RoomRaceHud). The room's
 * race drew it first; Catch the Ace draws it now (src/main.js roomTagHud).
 *
 * NO WORK ON A QUIET FRAME. The shell updates the flight screen's lines a
 * few times a second, and the DOM is touched only when the text changed.
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

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) {
    n.className = cls;
  }
  if (text != null) {
    n.textContent = text;
  }
  return n;
}

export class RoomRaceHud {
  constructor(parent) {
    this.root = el('div', 'room-race is-off');
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
    this.key = '';
  }

  /* view: null to hide, or { title, rows: [{ place, name, value, me }],
   * chip }, chip a short line under the title, or absent. */
  update(view) {
    const key = view ? JSON.stringify(view) : '';
    if (key === this.key) {
      return;
    }
    this.key = key;
    this.root.classList.toggle('is-off', !view);
    this.root.textContent = '';
    if (!view) {
      return;
    }
    this.root.append(el('div', 'room-race-title', view.title));
    if (view.chip) {
      this.root.append(el('div', 'room-race-chip', view.chip));
    }
    for (const r of view.rows) {
      const row = el('div', `room-race-row${r.me ? ' is-me' : ''}`);
      row.append(el('span', 'room-race-place', String(r.place)), el('span', 'room-race-name', r.name), el('span', 'room-race-value', r.value));
      this.root.append(row);
    }
  }
}
