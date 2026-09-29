/*
 * intro.js: how long the war mode's "2030" intro runs (docs/WARFARE-PLAN.md
 * section 7.1), the one number the room and the client must agree on. The
 * room holds a war started with { intro: true } in its 'briefing' state for
 * INTRO_MS (edge/rooms/war.js); every screen plays src/render/warintro.js
 * over the same span, so the countdown starts as the last title fades.
 *
 * The seven shots' lengths live here rather than in warintro.js so the
 * room's number is their sum and cannot drift from the film. Each is long
 * enough for the longer of its two voice lines (assets/audio/war/manifest.json:
 * the Spanish of shots 1 to 6, the English of shot 7) with its lead in and
 * a beat after; the whole is the intro music's 70 s.
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

/* Shot 1 to 7, milliseconds. */
export const SHOT_MS = Object.freeze([7000, 11000, 10000, 10000, 10000, 9000, 13000]);

/* The whole intro, and the room's briefing. */
export const INTRO_MS = SHOT_MS.reduce((a, b) => a + b, 0);
