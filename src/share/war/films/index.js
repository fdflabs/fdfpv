/*
 * index.js: every war film, by id (src/share/war/film.js), and which a
 * mission plays: its `film`, or DEFAULT_FILM, "2030", until the mission
 * has its own (docs/campaign/INTROS.md section 5 writes one for each).
 * The room (edge/rooms/war.js, the briefing's length and the seen rule)
 * and every screen (src/render/warintro.js) read this one table.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import film2030 from './2030.js';
import { filmMs } from '../film.js';

export const FILMS = Object.freeze(Object.fromEntries([film2030].map((f) => [f.id, f])));
export const DEFAULT_FILM = '2030';

/* The film a mission plays: its own, or the default. A mission naming a
 * film this build does not have is a mistake in the data, loudly. */
export function filmFor(mission) {
  const id = mission?.film ?? DEFAULT_FILM;
  const f = FILMS[id];
  if (!f) {
    throw new Error(`war: no film ${id}`);
  }
  return f;
}

/* The briefing's length for a mission's film, ms, worked out once. */
const MS = new Map();
export function briefingMs(mission) {
  const f = filmFor(mission);
  if (!MS.has(f.id)) {
    MS.set(f.id, filmMs(f));
  }
  return MS.get(f.id);
}
