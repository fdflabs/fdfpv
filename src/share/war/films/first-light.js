/*
 * first-light.js: mission 1's film, "First Light" (docs/campaign/INTROS.md
 * section 5.1): "2030"'s shots (2030.js, which was already cut after 5.1)
 * with the film's own lines in the act's voices. intro-2 is split in two,
 * so each half sits on its own picture (the haze, the ten); the spin up
 * is TALLER's and the first contact MIRADOR's, so the act's first film
 * introduces three voices. Data only.
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

/* Each shot's lines (INTROS.md 5.1's lead before each), by shot id. */
const LINES = {
  dawn: [{ line: 'film-itaipu-1-1', lead: 1.5, tail: 1.8 }],
  haze: [{ line: 'film-itaipu-1-2', lead: 1.0, tail: 0.8 }],
  ten: [{ line: 'film-itaipu-1-3', lead: 0.5, tail: 0.8 }],
  face: [{ line: 'film-itaipu-1-4', lead: 2.0, tail: 1.2 }],
  line: [{ line: 'film-itaipu-1-5', lead: 1.5, tail: 1.2 }],
  props: [{
    line: 'film-itaipu-1-6', lead: 0.8, tail: 0.8, span: 3,
  }],
  wave: [{ line: 'film-itaipu-1-7', lead: 2.0, tail: 1.0 }],
};

export default {
  ...film2030,
  id: 'first-light',
  version: 1,
  shots: film2030.shots.map((s) => ({ ...s, lines: LINES[s.id] ?? [] })),
};
