/*
 * long-night.js: mission 4's film, "The Long Night" (docs/campaign/
 * INTROS.md section 5.4): darkness and silence, almost nothing happening,
 * slowly. A wake crossing the dark water under the lit dam, the crest's
 * lamps, the line of aircraft waiting, MIRADOR's scope with one small
 * contact, a ride up the gorge, and the rise over the crest. Data only
 * (src/share/war/film.js). It plays in the mission's night world, which
 * every screen builds before the film (edge/rooms/war.js WORLD_LEAD_MS).
 *
 * Three departures from 5.4, each for something the player does not have,
 * and the film does not fake. Shot 3's aircraft do not put their nav
 * lights out one by one: a film's cast has no light switch. Shot 4 is
 * MIRADOR's scope (the SCOPE insert, as The Spillway's), not the Avionics
 * HUD's thermal look, which no film camera draws. Shot 5 rides an FPV up
 * the swarm's gorge, not a Hunter: a Hunter has no route of its own to
 * ride (the room steers it, edge/rooms/warhunt.js), and an FPV is the
 * same quad. TALLER's line in shot 3 is not 5.4's "Lights off on every
 * bird": every attacker wears its nav lights at night
 * (src/render/attackers.js), and nothing turns a pilot's own off.
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

import {
  CREST_Y, LINE_AT, LINE_OFF, crest, lineCast,
} from './2030.js';

/* The scope's middle and reach: the open water north of the dam. */
const SCOPE_AT = [250, -2700];

export default {
  id: 'long-night',
  version: 2,
  cast: {
    ten: { airframe: '10inch' },
    ten2: { airframe: '10inch' },
    q1: { airframe: '7inch' },
    q2: { airframe: '7inch' },
    q3: { airframe: '7inch' },
    int: { airframe: 'interceptor' },
    int2: { airframe: 'interceptor' },
  },
  routes: {
    /* A boat crossing the long lens's line 800 m out, west to east. */
    'dark-wake': [[-350, 219, -2800], [700, 219, -2800]],
    /* What the scope shows: one boat coming down the open water. */
    'scope-water': [[900, 219, -3700], [500, 219, -2800], [300, 219, -2200]],
    /* The ride up the gorge, the swarm's way (itaipu-4.js gorge). */
    'gorge-run': [[-1100, 180, 400], [-760, 180, 0], [-640, 180, -450], [-400, 180, -800]],
  },
  agents: [
    {
      id: 'wake', kind: 'boat', route: 'dark-wake', n: 1, pass: { shot: 'water', at: 6, point: [150, 219, -2800] }, shots: ['water'],
    },
    {
      id: 'contact', kind: 'boat', route: 'scope-water', n: 1, pass: { shot: 'scope', at: { at: 'end' }, point: [600, 219, -3025] }, shots: [],
    },
    {
      id: 'rider', kind: 'fpv', route: 'gorge-run', n: 1, pass: { shot: 'gorge', at: 0, point: [-930, 180, 200] }, shots: ['gorge'],
    },
  ],
  shots: [
    {
      id: 'water',
      min: 9,
      grade: 'night',
      /* A long lens low over the black water, the lit dam across the far
       * edge of it; a wake crosses the frame. */
      camera: {
        type: 'telephoto', lens: 200, ease: 'hold', at: [150, 221, -3600], look: crest(9.5, 0, 230),
      },
      /* The slate (INTROS.md 1.8): where, when and the stakes. */
      titles: [
        {
          key: 'war.slate.itaipu_4.place', when: 'war.slate.itaipu_4.when', sub: 'war.slate.itaipu_4.stakes', from: 1.5, to: { at: 'end', s: -0.8 }, kind: 'slate',
        },
      ],
      fade: [[0, 1], [1.5, 0]],
      out: 'cut',
    },
    {
      id: 'lamps',
      min: 8,
      grade: 'night',
      lines: [{ line: 'film-itaipu-4-1', lead: 2.0, tail: 1.0 }],
      /* On the crest road, along the crest's lamps, the camera breathing. */
      camera: {
        type: 'handheld', lens: 35, at: crest(3, 4, CREST_Y + 1.7), look: crest(16, 4, CREST_Y + 3), amp: 0.01, drift: 3,
      },
      out: 'cut',
    },
    {
      id: 'line',
      min: 9,
      grade: 'night',
      lines: [{ line: 'film-itaipu-4-2', lead: 1.0, tail: 1.2 }],
      /* Down the line of aircraft on the crest deck, as "2030"'s line
       * shot looks along it, dark. */
      camera: {
        type: 'dolly',
        lens: 75,
        path: [crest(LINE_AT, LINE_OFF + 2.6, CREST_Y + 0.32, -20), crest(LINE_AT, LINE_OFF + 2.2, CREST_Y + 0.3, -16.5)],
        look: [crest(LINE_AT, LINE_OFF - 0.2, CREST_Y + 0.9, 0), crest(LINE_AT, LINE_OFF - 0.2, CREST_Y + 0.9, 6)],
      },
      cast: lineCast(['strk']),
      out: 'cut',
    },
    {
      id: 'scope',
      min: 7,
      grade: 'night',
      lines: [{ line: 'film-itaipu-4-3', lead: 1.5, tail: 1.0 }],
      /* MIRADOR's scope: the open water quiet, then one small contact. */
      camera: {
        type: 'telephoto', lens: 50, at: crest(9.5, 300, 260), look: crest(9.5, 2000, 240),
      },
      scope: {
        at: SCOPE_AT,
        r: 1800,
        groups: ['contact'],
        appear: [{ at: 'vo.start', s: 0.3 }, { at: 'vo.start', s: 0.3 }],
        lines: [[[-202.2, -1794.2], [430.8, -1655.0]]],
        marks: [
          { key: 'war.scope.dam', at: [110, -1560] },
        ],
      },
      out: 'smash',
    },
    {
      id: 'gorge',
      min: 6,
      grade: 'night',
      /* Riding a quad up the gorge out of the dark, the downstream face
       * ahead. */
      camera: {
        type: 'drone', lens: 18, ride: { agent: 'rider' }, back: 1.2, up: 0.35, lag: 60, ease: 'lin',
      },
      hero: { agent: 'rider', minPx: 40 },
      out: 'cut',
    },
    {
      id: 'rise',
      min: 11,
      grade: 'night',
      lines: [{ line: 'film-itaipu-4-4', lead: 2.5, tail: 1.0 }],
      /* From the crest road at deck level, rising over the dark crest,
       * the lights of both banks beyond. */
      camera: {
        type: 'crane', lens: 24, base: crest(LINE_AT, 30, CREST_Y), h: [2, 90], look: [crest(LINE_AT, 0, CREST_Y + 2), crest(LINE_AT, -900, 140)],
      },
      cast: lineCast(['strk']),
      titles: [
        {
          mission: true, from: 4.0, to: { at: 'end', s: -0.6 }, kind: 'mission',
        },
      ],
      out: 'handoff',
    },
  ],
};
