/*
 * itaipu-1.js: Defend Itaipu, mission 1 (docs/WARFARE-PLAN.md sections 3,
 * 4.2 and 4.5). Data, shared by the room (edge/rooms/war.js) and every
 * client; src/share/war/routes.js flies it.
 *
 * THE TARGETS are where the map builds them (itaipu-targets.js, generated
 * from map.targets by scripts/war-targets.js); this file adds what each
 * one is worth. The plant makes 14 000 MW, twenty units of 700: an intake
 * or a penstock hit takes its unit's 700 (the two are counted apart, so a
 * unit hit at both ends costs 1 400: the room counts targets, not units),
 * a spillway gate 350 (the plant runs down its reservoir to spill round
 * it), and the right bank switchyard 2 800, a fifth of the plant's way to
 * the grid. The mission is lost under floorMw, half the plant: ten units.
 *
 * THE ROUTES fly the geography, y up, scene metres (-z is north):
 *   reservoir-*   Strikers 30 m over the reservoir (219 m) from the north,
 *                 onto the intakes in the upstream face, or over the right
 *                 bank's shore to the switchyard at 60 m over the ground
 *   gorge         the FPV swarm up the river from the south, under the
 *                 rims, onto the penstocks on the downstream face
 *   high-*        Loiterers at 650 m, a circle, then the dive: onto the
 *                 intakes from the north east, the spillway gates from
 *                 the north west, down its approach channel
 *   surface-*     Sea drones on the reservoir's surface, 219.0 m, to the
 *                 upstream face
 *   *-orbit       Scouts circling 250 m over the water
 *   gorge-hunt    where the Hunters are born, in the gorge 1.5 km below
 *                 the dam, and their home over the gorge's head, where
 *                 one with no pilot in range goes back to (warhunt.js
 *                 steers them)
 * scripts/war-routes-check.js samples every attacker of every wave, at 1
 * to 8 pilots and at the extremes of its spread, against the hunters'
 * floor (itaipu-height.bin: ground, water and the dam) and fails unless
 * each clears it until its terminal run: the last leg onto its target, or
 * a Loiterer's dive. Boats hold the water.
 *
 * THE WAVES, born at (minutes after the go), about ten minutes in all:
 *   0:05  a Scout over the reservoir
 *   0:20  Strikers on the switchyard (the biggest single loss, early, so
 *         the squad learns what a hit costs; it lands at 2:10)
 *   1:00  the first FPV swarm up the gorge, two penstocks
 *   1:50  a Loiterer on an intake, 2:30 Sea drones on another
 *   3:15  Hunters, mid mission: now the pilots are the targets
 *   3:35  a second Scout; 4:10 a swarm on four penstocks
 *   5:00  Loiterers on the gates, 5:40 Strikers on the west intakes
 *   6:35  the last wave, all at once: Strikers on the east intakes, a
 *         swarm, Loiterers, Hunters and boats
 * Undefended, the output is 9 100 MW at 5:00 (so the Hunters always come
 * to a war still on), falls under the floor at 6:13, and the whole
 * mission would take 2.8 times the 7 000 MW margin.
 *
 * THE NUMBERS. Each wave's n is for one pilot and `per` more come for
 * every pilot after the first (index.js waveSize): 30 attackers alone,
 * 43 for two, 66 for four, 113 for eight. The output decides the game;
 * the rack, 16 airframes a pilot, is a backstop against waste. A clean
 * solo pilot spends about 13 of it, and at 14 a solo bot that was
 * winning on output ran out half the time: losing with the plant at
 * 11 000 MW for want of an airframe reads as a bug, not a defeat.
 * scripts/war-balance.js flies bot squads of
 * 1, 2, 4 and 8 through it on the real room; its table and the reasons
 * for these numbers are in the pull request that set them.
 *
 * No jammer: the war has no radio signal since 2026-09-29
 * (docs/WARFARE-PLAN.md 6.1).
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

import AT from '../itaipu-targets.js';

const MW = {
  intake: 700, penstock: 700, gate: 350, yard: 2800,
};

const targets = {};
for (const [id, t] of Object.entries(AT)) {
  targets[id] = { mw: MW[id.split('-')[0]], at: t.at, r: t.r };
}

const ids = (part, ks) => ks.map((k) => `${part}-${k}`);

export default {
  id: 'itaipu-1',
  map: 'itaipu',
  targets,
  output: 14000,
  floorMw: 7000,
  rack: 16,
  /* Seconds after the go. */
  waves: [
    { at: 5, kind: 'scout', n: 1, per: 0.25, route: 'reservoir-orbit' },
    { at: 20, kind: 'strike', n: 1, per: 0.75, route: 'reservoir-west', target: 'yard-right', spread: 60 },
    { at: 60, kind: 'fpv', n: 2, per: 0.75, route: 'gorge', target: ids('penstock', [5, 6]), spread: 10 },
    { at: 110, kind: 'loiter', n: 1, per: 0.75, route: 'high-east', target: 'intake-12', spread: 25 },
    { at: 150, kind: 'boat', n: 1, per: 0.75, route: 'surface-east', target: 'intake-17', spread: 20 },
    { at: 195, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
    { at: 215, kind: 'scout', n: 1, per: 0.25, route: 'west-orbit' },
    { at: 250, kind: 'fpv', n: 4, per: 1, route: 'gorge', target: ids('penstock', [10, 11, 12, 13]), spread: 10 },
    { at: 300, kind: 'loiter', n: 2, per: 1, route: 'high-west', target: ids('gate', [2, 6, 10]), spread: 25 },
    { at: 340, kind: 'strike', n: 4, per: 1.25, route: 'reservoir-mid', target: ids('intake', [2, 4, 6, 8]), spread: 30 },
    { at: 395, kind: 'strike', n: 3, per: 1.25, route: 'reservoir-east', target: ids('intake', [14, 15, 16, 18, 19]), spread: 30 },
    { at: 398, kind: 'fpv', n: 4, per: 1, route: 'gorge', target: ids('penstock', [0, 1, 2, 3, 15, 16]), spread: 10 },
    { at: 401, kind: 'loiter', n: 2, per: 1, route: 'high-east', target: ids('intake', [9, 11]), spread: 25 },
    { at: 404, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
    { at: 407, kind: 'boat', n: 2, per: 0.75, route: 'surface-east', target: ids('intake', [13, 19]), spread: 20 },
  ],
  routes: {
    'reservoir-orbit': [[300, 470, -5000], [300, 470, -3200]],
    'west-orbit': [[-2400, 470, -3700], [-1700, 470, -2800]],
    'reservoir-west': [[-1600, 249, -4500], [-1600, 249, -1700], [-1800, 300, -1000]],
    'reservoir-mid': [[400, 249, -5000], [0, 249, -2800], [-50, 249, -2200]],
    'reservoir-east': [[1500, 249, -5000], [500, 249, -2200]],
    gorge: [[-1440, 180, 1600], [-1100, 180, 400], [-760, 180, 0], [-640, 180, -450], [-400, 180, -800], [-150, 180, -1100], [0, 185, -1350]],
    'high-east': [[1900, 700, -4600], [800, 650, -2700]],
    'high-west': [[-2400, 700, -4400], [-1300, 650, -2400]],
    'surface-east': [[1800, 219, -4000], [700, 219, -2300], [450, 219, -1880]],
    'gorge-hunt': [[-760, 200, 0], [-100, 260, -1300]],
  },
};
