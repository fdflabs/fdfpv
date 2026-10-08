/*
 * index.js: The Interior's films, by id, and which a mission plays at
 * each moment (docs/campaign/interior/INTROS.md, FILMS.md, TECH-NEEDS.md
 * N24): the campaign's `prologue` once before Mission 1's intro, the
 * mission's `intro` as the room's briefing, its `outro` after the
 * landing. Data only, read by the room (the briefing's length) and every
 * screen (src/render/interiorfilms.js).
 *
 * A film's id is its own across both campaigns, so "seen" (src/game/
 * campaign.js films, by id and version) keeps one record for every film
 * of the game; scripts/films-lint.js fails a clash with a war film's.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import prologue from './prologue.js';
import int1Intro from './int1-intro.js';
import int1Outro from './int1-outro.js';
import int2Intro from './int2-intro.js';
import int2Outro from './int2-outro.js';
import { filmMs } from '../../war/film.js';

export const FILMS = Object.freeze(Object.fromEntries([prologue, int1Intro, int1Outro, int2Intro, int2Outro].map((f) => [f.id, f])));
/* Every film in story order, for a menu of the films a pilot has seen. */
export const INTERIOR_FILM_IDS = Object.freeze([prologue, int1Intro, int1Outro, int2Intro, int2Outro].map((f) => f.id));

/* The aircraft The Interior's films may show (PLAN.md 6: the war's "only
 * combat drones" rule is the war's): Mission 1's ISR, Mission 2's recon
 * quad. */
export const FILM_AIRFRAMES = Object.freeze(['bramor2300', '7inch']);

/* Each mission's films by moment. `prologue` plays on the pilot's own
 * screen the first time the campaign is opened (INTROS P), `intro` is
 * the room's briefing, `outro` plays on every screen from the mission's
 * end. Missions 3 to 5 have none until they are built. */
export const MISSION_FILMS = Object.freeze({
  'interior-1': Object.freeze({ prologue: 'interior-prologue', intro: 'int1-intro', outro: 'int1-outro' }),
  'interior-2': Object.freeze({ intro: 'int2-intro', outro: 'int2-outro' }),
});

/* A mission's film for a moment, or null when it has none. A name this
 * build has no film for is a mistake in the data, loudly. */
export function filmFor(missionId, moment) {
  const id = MISSION_FILMS[missionId]?.[moment];
  if (!id) {
    return null;
  }
  const f = FILMS[id];
  if (!f) {
    throw new Error(`interior: no film ${id}`);
  }
  return f;
}

/* The room's briefing for a mission, ms: its intro's length, preload and
 * all (src/share/war/film.js filmMs), 0 when it has no intro. */
export function briefingMs(missionId) {
  const f = filmFor(missionId, 'intro');
  return f ? filmMs(f) : 0;
}
