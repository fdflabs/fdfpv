/*
 * itaipu-1.js: Defend the Paraná, act 1, mission 1, "First Light"
 * (docs/campaign/MISSIONS.md M1): day one, dawn, the first contacts over
 * the reservoir. Data, shared by the room (edge/rooms/war.js runs it as a
 * stage graph, src/share/war/stages.js) and every client; routes.js flies
 * it. Every other Act 1 mission imports its targets.
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
 * THE STAGES, each a round of the owner's economy (every pilot's airframes
 * back at its open), a beat of seeded seconds between them:
 *   1  Eyes      a Scout high or over the open water, and a Striker on
 *                the yard 25 to 40 s in (the act's first hit, if it comes,
 *                is the biggest, so the squad learns what a hit costs);
 *                over when the Scout is killed, gone home or 80 s have
 *                passed, and nothing else is left
 *   2  Probe     a Striker group on a drawn bearing, then 8 to 15 s after
 *                the first is gone, a second on another bearing
 *   3  Pressure  Loiterers high onto intakes; 10 to 20 s in, Strikers low
 *                from the north or the east shore onto others, a decoy
 *                among them now and then
 *   4  The Turn  one of three twists, drawn: A, a swarm up the gorge
 *                behind a Striker run from the north; B, boats down the
 *                east shore under a Loiterer; C, Hunters out of the gorge
 *                behind bait Strikers
 *   5  First Light  three axes landing together: Loiterers onto the gates,
 *                Strikers onto the intakes, a swarm onto the penstocks,
 *                and smaller groups of the two twists that did not fire
 * A stage lost (no pilot left flying) lets what is alive through and the
 * next one comes; the mission is won when the fifth ends with the output
 * at or over the floor, lost the instant it falls under. Stars: held,
 * noLosses, output over starMw (war.js resultOf).
 *
 * THE DIALS (MISSIONS.md 1.4), drawn from the match's seed: each group's
 * sector (`sectors` below, never the last sector drawn twice running) and
 * its route in it, its time in a window, a decoy salted into a Striker
 * group, the twist. `pace` stretches every time for a small squad
 * (MISSIONS.md 1.6) and `adapt` weights the bearings away from where the
 * squad killed most last stage (TECH-NEEDS T1.5).
 *
 * THE ROUTES fly the geography, y up, scene metres (-z is north):
 *   reservoir-*   Strikers 30 m over the reservoir (219 m) from the north,
 *                 onto the intakes in the upstream face, or over the right
 *                 bank's shore to the switchyard at 60 m over the ground
 *   east-shore-*  in over the east arm of the reservoir
 *   gorge         the FPV swarm up the river from the south, under the
 *                 rims, onto the penstocks on the downstream face
 *   high-*        Loiterers at 650 m, a circle, then the dive
 *   surface-*, east-shore-water
 *                 Sea drones on the reservoir's surface, 219.0 m, to the
 *                 upstream face
 *   *-orbit       Scouts circling 250 m over the water
 *   gorge-hunt    where the Hunters are born, in the gorge 1.5 km below
 *                 the dam, and their home over the gorge's head
 * scripts/war-routes-check.js flies every route of every family, at 1 to
 * 8 pilots and the extremes of its spread, against the hunters' floor
 * (itaipu-height.bin: ground, water and the dam).
 *
 * THE RADIO is the stages' cues (MISSIONS.md M1 Radio: CREST, MIRADOR,
 * TALLER), the countdown's two lines and the debriefs (`radio`); the film
 * is films/first-light.js. The `itaipu-1-g-*` cues are the guide
 * (docs/campaign/FIRST-LIGHT-AUDIT.md): CREST saying plainly what to do,
 * after the story line it follows, at each objective's start. They wait in
 * the story queue (warradio.js), so each is heard after the line before.
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

import AT from '../itaipu-targets.js';
import { withWaves } from '../stages.js';

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

const INTAKES_WEST = ids('intake', [0, 1, 2, 3, 4, 5, 6]);
const INTAKES_MID = ids('intake', [7, 8, 9, 10, 11, 12]);
const INTAKES_EAST = ids('intake', [13, 14, 15, 16, 17, 18, 19]);
const GATES = ids('gate', [1, 3, 5, 7, 9, 11, 13]);

/* A stage's way out as the old rounds had it, with a seeded beat: over
 * when `when` fires (with nothing left but Scouts, cleared), or lost when
 * no pilot can fly on and what is alive gets through. */
const BEAT = (lo, hi) => [lo * 1000, hi * 1000];
function exits(when, to, after, why) {
  return [
    {
      when, to, after, result: 'auto', clear: 'leave', why,
    },
    {
      when: { allOut: true }, to, after, result: 'lost', clear: 'through', why,
    },
  ];
}
const STAGE_LOST = { when: { allOut: true }, radio: 'stage-lost' };

export default withWaves({
  id: 'itaipu-1',
  /* A string key (src/strings): First Light. */
  title: 'war.mission.itaipu_1',
  map: 'itaipu',
  /* Minutes, low and high, a squad takes (docs/campaign/MISSIONS.md 2);
   * Operations' briefing shows it (src/ui/briefing.js). */
  estimatedMinutes: [9, 13],
  targets,
  output: 14000,
  floorMw: 7700,
  /* The output a third star needs (war.js resultOf). */
  starMw: 11200,
  /* Each pilot's airframes a stage (war.js). */
  airframes: 4,
  /* Day one's first light (MISSIONS.md M1): the world is built at it. */
  time: 'morning',
  radio: { brief: ['itaipu-1-s0-brief', 'itaipu-1-s0-rules'], win: 'debrief-itaipu-1-win', lose: 'debrief-itaipu-1-lose' },
  film: 'first-light',
  /* CREST's nudge to the attacker nearest the targets after no progress
   * (src/share/war/nudge.js, docs/campaign/WAR-NUDGE.md). */
  nudge: true,
  pace: { 1: 1.6, 2: 1.3, 3: 1.3 },
  adapt: true,
  sectors: {
    N: ['reservoir-mid', 'reservoir-east', 'reservoir-nne'],
    NW: ['reservoir-west', 'reservoir-west-far'],
    NE: ['east-shore-low', 'east-shore-high'],
    HIGH: ['high-east', 'high-west', 'high-north'],
    GORGE: ['gorge'],
  },
  /* Twist B fires when the boats cross the east arm's middle. */
  lines: { 'east-shore-mid': [[1650, -2950], [2050, -2350]] },
  stages: [
    {
      id: 'eyes',
      round: true,
      title: 'war.stage.itaipu_1.eyes',
      spawns: [
        {
          at: 2, kind: 'scout', n: 1, per: 0.25, route: ['reservoir-orbit', 'west-orbit'], group: 'eyes',
        },
        {
          at: [25, 40], kind: 'strike', n: 1, per: 0.5, route: 'reservoir-west', target: 'yard-right', spread: 60, group: 'yard',
        },
      ],
      objectives: [{
        id: 'scout', text: 'war.obj.itaipu_1.scout', kind: 'kill', done: { down: { group: 'eyes' } }, fail: { left: 1, group: 'eyes' },
      }],
      cues: [
        { at: 0, radio: 'itaipu-1-g-first' },
        { when: { born: { group: 'eyes' } }, at: 3, radio: 'itaipu-1-s1-eyes' },
        { when: { born: { group: 'eyes' } }, at: 8, radio: 'itaipu-1-s1-why' },
        { when: { born: { group: 'eyes' } }, at: 12, radio: 'itaipu-1-g-scout' },
        { when: { down: { group: 'eyes' } }, radio: 'itaipu-1-s1-down' },
        { when: { left: 1, group: 'eyes' }, radio: 'itaipu-1-s1-gone' },
        STAGE_LOST,
      ],
      exits: exits({
        all: [{ any: [{ down: { group: 'eyes' } }, { left: 1, group: 'eyes' }, { time: 80 }] }, { cleared: true }],
      }, 'probe', BEAT(10, 15)),
    },
    {
      id: 'probe',
      round: true,
      title: 'war.stage.itaipu_1.probe',
      spawns: [
        {
          at: [4, 10], kind: 'strike', n: 1, per: 0.5, route: { sector: ['N', 'NW', 'NE'] }, target: INTAKES_MID, spread: 30, group: 'a',
        },
        {
          when: { gone: { group: 'a' } }, at: [8, 15], kind: 'strike', n: 1, per: 0.5, route: { sector: ['N', 'NW', 'NE'] }, target: INTAKES_WEST, spread: 30, group: 'b',
        },
      ],
      objectives: [{ id: 'intakes', text: 'war.obj.protect_intakes', kind: 'protect' }],
      cues: [
        { at: 0, radio: 'itaipu-1-g-intakes' },
        { when: { born: { group: 'a' } }, at: 4, radio: 'itaipu-1-s2-probe' },
        { when: { born: { group: 'b' } }, radio: 'itaipu-1-s2-again' },
        { when: { all: [{ gone: { group: 'b' } }, { cleared: true }] }, radio: 'itaipu-1-s2-clear' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'pressure', BEAT(12, 20)),
    },
    {
      id: 'pressure',
      round: true,
      title: 'war.stage.itaipu_1.pressure',
      spawns: [
        {
          at: 2, kind: 'loiter', n: 1, per: 0.75, route: { sector: 'HIGH' }, target: INTAKES_MID, spread: 25, group: 'high',
        },
        {
          at: [10, 20], mix: [['strike', 4], ['decoy', 1]], n: 2, per: 1, route: { sector: ['N', 'NE'] }, target: INTAKES_EAST, spread: 30, group: 'low',
        },
      ],
      objectives: [{ id: 'face', text: 'war.obj.protect_intakes_gates', kind: 'protect' }],
      cues: [
        { at: 0, radio: 'itaipu-1-g-face' },
        { when: { born: { group: 'high' } }, at: 2, radio: 'itaipu-1-s3-split' },
        { when: { killed: 1 }, radio: 'itaipu-1-s3-hold' },
        { when: { cleared: true }, radio: 'itaipu-1-s3-clear' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, { pick: ['back-door', 'low-water', 'come-for-you'] }, BEAT(15, 15)),
    },
    {
      id: 'back-door',
      round: true,
      title: 'war.stage.itaipu_1.turn',
      spawns: [
        {
          at: 4, kind: 'strike', n: 2, per: 0.75, route: { sector: 'N' }, target: INTAKES_MID, spread: 30, group: 'cover',
        },
        {
          at: [14, 20], kind: 'fpv', n: 4, per: 1.5, route: 'gorge', target: ids('penstock', [4, 5, 6, 7, 8, 9]), spread: 10, group: 'swarm',
        },
      ],
      objectives: [{
        id: 'swarm', text: 'war.obj.itaipu_1.back_door', kind: 'kill', done: { down: { group: 'swarm' } }, fail: { leaked: 1, group: 'swarm' },
      }],
      cues: [
        { when: { born: { group: 'swarm' } }, radio: 'itaipu-1-ta-turn' },
        { when: { born: { group: 'swarm' } }, at: 4, radio: 'itaipu-1-ta-why' },
        { when: { born: { group: 'swarm' } }, at: 8, radio: 'itaipu-1-g-back-door' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'first-light', BEAT(20, 25)),
    },
    {
      id: 'low-water',
      round: true,
      title: 'war.stage.itaipu_1.turn',
      spawns: [
        {
          at: 4, kind: 'loiter', n: 1, per: 0.5, route: 'high-east', target: INTAKES_EAST, spread: 25, group: 'cover',
        },
        {
          at: [6, 12], kind: 'boat', n: 2, per: 1, route: 'east-shore-water', target: INTAKES_EAST, spread: 15, group: 'boats',
        },
      ],
      objectives: [{
        id: 'boats', text: 'war.obj.itaipu_1.low_water', kind: 'kill', done: { down: { group: 'boats' } }, fail: { leaked: 1, group: 'boats' },
      }],
      cues: [
        { when: { crossed: 'east-shore-mid', group: 'boats' }, radio: 'itaipu-1-tb-turn' },
        { when: { crossed: 'east-shore-mid', group: 'boats' }, at: 4, radio: 'itaipu-1-tb-why' },
        { when: { crossed: 'east-shore-mid', group: 'boats' }, at: 8, radio: 'itaipu-1-g-low-water' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'first-light', BEAT(20, 25)),
    },
    {
      id: 'come-for-you',
      round: true,
      title: 'war.stage.itaipu_1.turn',
      spawns: [
        {
          at: 4, kind: 'strike', n: 2, per: 0.75, route: { sector: ['N', 'NE'] }, target: INTAKES_MID, spread: 30, group: 'bait',
        },
        {
          at: [12, 18], kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt', group: 'hunters',
        },
      ],
      objectives: [{
        id: 'hunters', text: 'war.obj.itaipu_1.come_for_you', kind: 'kill', done: { down: { group: 'hunters' } },
      }],
      cues: [
        { when: { born: { group: 'hunters' } }, radio: 'itaipu-1-tc-turn' },
        { when: { born: { group: 'hunters' } }, at: 4, radio: 'itaipu-1-tc-why' },
        { when: { born: { group: 'hunters' } }, at: 8, radio: 'itaipu-1-g-come-for-you' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'first-light', BEAT(20, 25)),
    },
    {
      id: 'first-light',
      round: true,
      title: 'war.stage.itaipu_1.first_light',
      spawns: [
        {
          at: 2, kind: 'loiter', n: 2, per: 1, route: 'high-west', target: GATES, spread: 25, group: 'gates',
        },
        {
          at: [24, 30], kind: 'strike', n: 2, per: 1.5, route: { sector: ['N', 'NE'] }, target: [...INTAKES_MID, ...INTAKES_EAST], spread: 30, group: 'face',
        },
        {
          at: [30, 36], kind: 'fpv', n: 4, per: 1.5, route: 'gorge', target: ids('penstock', [0, 1, 2, 3, 15, 16]), spread: 10, group: 'swarm',
        },
        /* The kinds of the two twists that did not fire, smaller. */
        {
          at: [40, 46], kind: 'fpv', n: 2, per: 0.75, route: 'gorge', target: ids('penstock', [10, 11, 12, 13]), spread: 10, skip: { visited: 'back-door' },
        },
        {
          at: [36, 44], kind: 'boat', n: 1, per: 0.5, route: 'east-shore-water', target: INTAKES_EAST, spread: 15, skip: { visited: 'low-water' },
        },
        {
          at: [40, 48], kind: 'hunter', n: 1, per: 0.25, route: 'gorge-hunt', skip: { visited: 'come-for-you' },
        },
      ],
      objectives: [{ id: 'all', text: 'war.obj.protect_all', kind: 'protect' }],
      cues: [
        { when: { born: {} }, radio: 'itaipu-1-s5-all' },
        { when: { born: {} }, at: 4, radio: 'itaipu-1-s5-order' },
        { when: { born: {} }, at: 8, radio: 'itaipu-1-g-all' },
      ],
      /* The last: lost or held, the mission is won if the output is still
       * over the floor when it ends (as the old fifth round). */
      exits: exits({ cleared: true }, 'won', 0, 'waves'),
    },
  ],
  routes: {
    'reservoir-orbit': [[300, 470, -5000], [300, 470, -3200]],
    'west-orbit': [[-2400, 470, -3700], [-1700, 470, -2800]],
    'reservoir-west': [[-1600, 249, -3200], [-1600, 249, -1700], [-1800, 300, -1000]],
    'reservoir-west-far': [[-1600, 249, -4800], [-1600, 249, -1700], [-1800, 300, -1000]],
    'reservoir-mid': [[400, 249, -5000], [0, 249, -2800], [-50, 249, -2200]],
    'reservoir-east': [[1500, 249, -5000], [500, 249, -2200]],
    'reservoir-nne': [[900, 249, -5200], [400, 249, -3000], [150, 249, -2300]],
    'east-shore-low': [[2600, 249, -3600], [1400, 249, -2500], [700, 249, -2050]],
    'east-shore-high': [[2800, 320, -4200], [1600, 300, -3000], [800, 280, -2200]],
    gorge: [[-1100, 180, 400], [-760, 180, 0], [-640, 180, -450], [-400, 180, -800], [-150, 180, -1100], [0, 185, -1350]],
    'high-east': [[1200, 700, -3400], [800, 650, -2700]],
    'high-west': [[-1700, 700, -3100], [-1300, 650, -2400]],
    'high-north': [[200, 700, -4500], [150, 650, -3000]],
    'surface-east': [[1000, 219, -2800], [700, 219, -2300], [450, 219, -1880]],
    'east-shore-water': [[2400, 219, -3000], [1300, 219, -2300], [650, 219, -1850]],
    'gorge-hunt': [[-760, 200, 0], [-100, 260, -1300]],
  },
});
