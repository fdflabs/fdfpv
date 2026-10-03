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
 * THE ROUNDS (edge/rooms/war.js rounds, the owner's, 2026-09-29): five,
 * each a group of waves whose `at` counts from the round's start, and
 * each pilot has 4 airframes a round, one more for every kill. The
 * attackers fly 0.7 of section 3's speeds, and the routes start close
 * enough that a round runs about 1.5 to 3 minutes:
 *   1  a Scout; Strikers on the switchyard (the biggest single loss,
 *      first, so the squad learns what a hit costs); a swarm on two
 *      penstocks
 *   2  a Loiterer on an intake, Sea drones on another
 *   3  a second Scout; a swarm on four penstocks; Hunters
 *   4  Loiterers on the gates, Strikers on the west intakes
 *   5  everything: Loiterers, boats, Strikers on the east intakes,
 *      Hunters and a swarm, landing together
 * Each wave's n is for one pilot and `per` more come for every pilot
 * after the first (index.js waveSize). The mission is lost the instant
 * the output is under floorMw. scripts/war-balance.js flies bot squads
 * of 1, 2, 4 and 8 through it on the real room, from the crest road's
 * seats (--spawn=x,z for elsewhere); its table and the reasons for these
 * numbers are in the pull request that set them.
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
import { round, withWaves } from '../stages.js';

const MW = {
  intake: 700, penstock: 700, gate: 350, yard: 2800,
};

/* The reservoir's surface, metres (the map's water.json reservoir). */
const RESERVOIR_Y = 219;

/* The parts in the dam's upstream face, under the reservoir: an intake's
 * gate is 177.6 to 196.9 m, a spillway gate's middle 212.3 m. */
const UPSTREAM = new Set(['intake', 'gate']);

/* The Itaipu targets with their MW, shared by every Itaipu mission. A
 * target's `at` is where an attacker's route ends (routes.js), so a part
 * under the reservoir is struck on the face straight over it at the
 * waterline: a route to its middle ran on through the water to it, the
 * Strikers going under 130 m short of a gate (bug-552ecdab). The room
 * and the view read no other height from it: a hit is decided by the
 * attacker's err, and the radar draws x and z. The map's own targets
 * keep the part's middle. */
export const targets = {};
for (const [id, t] of Object.entries(AT)) {
  const part = id.split('-')[0];
  const at = UPSTREAM.has(part) ? [t.at[0], RESERVOIR_Y, t.at[2]] : t.at;
  targets[id] = { mw: MW[part], at, r: t.r };
}
/* The yard's r, 537 m, is its whole extent, for the smoke and the
 * markers; an attacker with a seeded error (the Scouts dead) hits it only
 * within YARD_HIT_M of its middle, the transformer rows, as an intake is
 * hit within its 12 m. Every attacker arrives only at the end of its own
 * route, its aim point, however deep in the yard's r it already is. */
const YARD_HIT_M = 40;
targets['yard-right'].hitR = YARD_HIT_M;

export const ids = (part, ks) => ks.map((k) => `${part}-${k}`);

export default withWaves({
  id: 'itaipu-1',
  /* A string key (src/strings): Defend the intakes. */
  title: 'war.mission.itaipu_1',
  map: 'itaipu',
  targets,
  output: 14000,
  floorMw: 7700,
  /* The output a third star needs (war.js resultOf). */
  starMw: 11200,
  /* Each pilot's airframes a round (war.js rounds). */
  airframes: 4,
  /* Rounds of waves (stages.js round): a wave's `at` is seconds after
   * its round starts. */
  stages: [
    round('round-1', [
      { at: 2, kind: 'scout', n: 1, per: 0.25, route: 'reservoir-orbit' },
      { at: 2, kind: 'strike', n: 1, per: 0.75, route: 'reservoir-west', target: 'yard-right', spread: 60 },
      { at: 4, kind: 'fpv', n: 2, per: 1, route: 'gorge', target: ids('penstock', [5, 6]), spread: 10 },
    ]),
    round('round-2', [
      { at: 2, kind: 'loiter', n: 1, per: 0.75, route: 'high-east', target: 'intake-12', spread: 25 },
      { at: 20, kind: 'boat', n: 2, per: 1, route: 'surface-east', target: 'intake-17', spread: 20 },
    ]),
    round('round-3', [
      { at: 2, kind: 'scout', n: 1, per: 0.25, route: 'west-orbit' },
      { at: 2, kind: 'fpv', n: 4, per: 1.5, route: 'gorge', target: ids('penstock', [10, 11, 12, 13]), spread: 10 },
      { at: 20, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
    ]),
    round('round-4', [
      { at: 2, kind: 'loiter', n: 2, per: 1.25, route: 'high-west', target: ids('gate', [2, 6, 10]), spread: 25 },
      { at: 40, kind: 'strike', n: 3, per: 1.5, route: 'reservoir-mid', target: ids('intake', [2, 4, 6, 8]), spread: 30 },
    ]),
    round('round-5', [
      { at: 2, kind: 'loiter', n: 1, per: 1, route: 'high-east', target: ids('intake', [9, 11]), spread: 25 },
      { at: 20, kind: 'boat', n: 1, per: 0.75, route: 'surface-east', target: ids('intake', [13, 19]), spread: 20 },
      { at: 30, kind: 'strike', n: 2, per: 1.5, route: 'reservoir-east', target: ids('intake', [14, 15, 16, 18, 19]), spread: 30 },
      { at: 40, kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt' },
      { at: 45, kind: 'fpv', n: 4, per: 1.5, route: 'gorge', target: ids('penstock', [0, 1, 2, 3, 15, 16]), spread: 10 },
    ], { last: true }),
  ],
  routes: {
    'reservoir-orbit': [[300, 470, -5000], [300, 470, -3200]],
    'west-orbit': [[-2400, 470, -3700], [-1700, 470, -2800]],
    'reservoir-west': [[-1600, 249, -3200], [-1600, 249, -1700], [-1800, 300, -1000]],
    'reservoir-mid': [[400, 249, -5000], [0, 249, -2800], [-50, 249, -2200]],
    'reservoir-east': [[1500, 249, -5000], [500, 249, -2200]],
    gorge: [[-1100, 180, 400], [-760, 180, 0], [-640, 180, -450], [-400, 180, -800], [-150, 180, -1100], [0, 185, -1350]],
    'high-east': [[1200, 700, -3400], [800, 650, -2700]],
    'high-west': [[-1700, 700, -3100], [-1300, 650, -2400]],
    'surface-east': [[1000, 219, -2800], [700, 219, -2300], [450, 219, -1880]],
    'gorge-hunt': [[-760, 200, 0], [-100, 260, -1300]],
  },
});
