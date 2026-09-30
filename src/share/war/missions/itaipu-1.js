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
 * the grid. The mission is lost under floorMw, 7 700 MW: eleven units.
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
 * THE WAVES. The attackers fly 0.7 of section 3's speeds (the owner,
 * 2026-09-29), so each wave is born early enough to land when it did
 * at full speed. Born at (minutes after the go), about ten minutes in
 * all, the last wave's kinds born apart so they land together:
 *   0:02  a Scout over the reservoir; Strikers on the switchyard (the
 *         biggest single loss, early, so the squad learns what a hit
 *         costs; they land at 2:41, 2.4 km from the intakes)
 *   0:07  the first FPV swarm up the gorge, two penstocks (lands 3:03)
 *   0:44  a Loiterer on an intake, 1:07 Sea drones on another
 *   3:02  a second Scout; 3:15 Hunters, mid mission: now the pilots are
 *         the targets; 3:18 a swarm on four penstocks
 *   3:50  Loiterers on the gates, 5:03 Strikers on the west intakes (7:05)
 *   5:22  the last wave, landing from 8:07 to 10:05: boats, Loiterers, a
 *         swarm and Strikers on the east intakes, 6:44 Hunters
 * Undefended, the output is 9 100 MW at 5:00 (so the Hunters always come
 * to a war still on), falls under the floor at 6:13, and the whole
 * mission would take 3.2 times the 6 300 MW margin.
 *
 * THE NUMBERS. Each wave's n is for one pilot and `per` more come for
 * every pilot after the first (index.js waveSize): 33 attackers alone,
 * 52 for two, 89 for four, 161 for eight. The output decides the game;
 * the rack, 20 airframes a pilot, is a backstop against waste. Taking
 * off from the crest road by the intakes (the spawn the lead is moving
 * there), a clean solo pilot flies short sorties and spends about 16 of
 * it; losing with the plant at 10 000 MW for want of an airframe reads
 * as a bug, not a defeat. The first threat reaches the dam at 3:03, so a
 * pilot has time to take off and climb before anything arrives.
 * scripts/war-balance.js flies bot squads of 1, 2, 4 and 8 through it on
 * the real room (--spawn=x,z for where they take off); its table and the
 * reasons for these numbers are in the pull request that set them.
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
/* The yard's r, 537 m, is its whole extent, for the smoke and the
 * markers; an attacker with a seeded error (the Scouts dead) hits it only
 * within YARD_HIT_M of its middle, the transformer rows, as an intake is
 * hit within its 12 m. Every attacker arrives only at the end of its own
 * route, its aim point, however deep in the yard's r it already is. */
const YARD_HIT_M = 40;
targets['yard-right'].hitR = YARD_HIT_M;

const ids = (part, ks) => ks.map((k) => `${part}-${k}`);

export default {
  id: 'itaipu-1',
  map: 'itaipu',
  targets,
  output: 14000,
  floorMw: 7700,
  rack: 20,
  /* Seconds after the go. */
  waves: [
    { at: 2, kind: 'scout', n: 1, per: 0.25, route: 'reservoir-orbit' },
    { at: 3, kind: 'strike', n: 1, per: 1, route: 'reservoir-west', target: 'yard-right', spread: 60 },
    { at: 7, kind: 'fpv', n: 2, per: 1, route: 'gorge', target: ids('penstock', [5, 6]), spread: 10 },
    { at: 44, kind: 'loiter', n: 1, per: 1, route: 'high-east', target: 'intake-12', spread: 25 },
    { at: 67, kind: 'boat', n: 1, per: 1, route: 'surface-east', target: 'intake-17', spread: 20 },
    { at: 182, kind: 'scout', n: 1, per: 0.25, route: 'west-orbit' },
    { at: 195, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
    { at: 198, kind: 'fpv', n: 5, per: 1.5, route: 'gorge', target: ids('penstock', [10, 11, 12, 13]), spread: 10 },
    { at: 230, kind: 'loiter', n: 2, per: 2, route: 'high-west', target: ids('gate', [2, 6, 10]), spread: 25 },
    { at: 303, kind: 'strike', n: 5, per: 2, route: 'reservoir-mid', target: ids('intake', [2, 4, 6, 8]), spread: 30 },
    { at: 322, kind: 'boat', n: 2, per: 1, route: 'surface-east', target: ids('intake', [13, 19]), spread: 20 },
    { at: 335, kind: 'loiter', n: 2, per: 2, route: 'high-east', target: ids('intake', [9, 11]), spread: 25 },
    { at: 344, kind: 'fpv', n: 5, per: 1.75, route: 'gorge', target: ids('penstock', [0, 1, 2, 3, 15, 16]), spread: 10 },
    { at: 355, kind: 'strike', n: 3, per: 2.25, route: 'reservoir-east', target: ids('intake', [14, 15, 16, 18, 19]), spread: 30 },
    { at: 404, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
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
