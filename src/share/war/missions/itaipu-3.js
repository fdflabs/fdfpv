/*
 * itaipu-3.js: Defend the Paraná, act 1, mission 3, "Lights Out"
 * (docs/campaign/MISSIONS.md M3): day one, dusk. The right bank
 * switchyard (yard-right, 2 800 MW, hit within 40 m of its middle) is how
 * the right bank's power leaves the dam; DESPACHO is rerouting the grid
 * around it and needs time, and the Aggressor wants the yard before the
 * reroute is done. Among its Strikers are DECOYS: the 'decoy' kind flies
 * and looks like a Striker (its marker says STRIKER until 300 m,
 * src/ui/warmarkers.js), is worth nothing where it arrives, and dies to
 * any warhead, so a pilot who spends airframes on them has fewer for the
 * real ones. Data, as itaipu-1.js, which it takes its targets from.
 *
 * The yard is one target: once hit it takes nothing more (war.js take),
 * so its 2 800 MW goes the first time an attacker gets through, and the
 * whole right bank goes dark with it (grid.js). The west intakes and the
 * gorge's swarm are the danger after that, and the floor is the plant
 * without the yard and two units more.
 *
 * THE STAGES, each a round, with the radio's story (MISSIONS.md M3 Radio):
 *   1  Dusk       a Scout circling the west arm, and a Striker and a
 *                 decoy down the west arm onto the yard, each in its own
 *                 window, so which comes first is the seed's
 *   2  The Lie    a stream onto the yard, two decoys to every Striker,
 *                 from the west arm or along the 500 kV lines (NW or
 *                 LINES), and when it is gone a second from the other
 *   3  Reroute    DESPACHO's hold on the yard while the reroute runs
 *                 (HOLD_MS), a swarm up the gorge onto the yard, and one
 *                 of three twists, drawn: A, a tight pack of decoys with
 *                 one real Striker in it; B, a loud decoy run at the yard
 *                 while real Strikers go for the west intakes from the
 *                 north; C, Strikers low along the line corridor from the
 *                 west, where a crossing may take one (wires.js). Each
 *                 twist adds its own objective once it is born. A yard hit
 *                 inside the hold fails it and damages the stage (no third
 *                 star). A yard already down when the stage opens cannot
 *                 fail it: the reroute then only moves what is left
 *   4  The Dark   Loiterers onto the yard from HIGH, Strikers salted with
 *                 decoys onto the west intakes from the north, and a swarm
 *                 up the gorge onto the west penstocks, so a squad that
 *                 lost the yard still has the plant to lose (with nobody
 *                 shooting the mission is lost here; war:stages holds it)
 * A stage lost (no pilot left flying) lets what is alive through and the
 * next comes; the mission is won when the fourth ends with the output at
 * or over the floor, lost the instant it falls under, and a lost mission
 * restarts from the stage it was lost in (war.js, two stars at most).
 *
 * THE LIGHT falls across the mission (TECH-NEEDS T1.11): it starts at
 * the golden hour and Reroute's `daytime` runs the room's clock into the
 * night over the hold (src/share/daytime.js missionClock).
 *
 * Not built, and not said (MISSIONS.md 2.1): the reroute bringing
 * districts back (T1.10): a dark district stays dark. Nor the spotters
 * of T1.8, and a decoy group's
 * share is one mix whatever the pilots (MISSIONS.md's 1 to 1 for one
 * pilot and 3 to 1 for eight need a mix by pilots).
 *
 * The `itaipu-3-g-*` cues are the guide (as First Light's and the
 * Spillway's): CREST saying plainly what to do, after the story line it
 * follows, at each objective's start; a twist's is skipped once its group
 * is down.
 *
 * THE ROUTES, y up, scene metres (-z is north); the yard's middle is at
 * (-2146, -432), 2.7 km west of the squad's seats on the crest road:
 *   reservoir-west, west-arm-low     Strikers 30 m over the reservoir's
 *                    west arm, then over the shore onto the yard (NW)
 *   reservoir-west-far   the first stage's, from further out: the squad
 *                    needs the time to get there
 *   corridor-west, corridor-south    Strikers 25 to 40 m over the ground
 *                    along the 500 kV lines into the yard from the west
 *                    and from the south (LINES; the lines' towers from
 *                    OpenStreetMap, src/maps/itaipu/town/power.js)
 *   high-yard, high-west   Loiterers at 650 to 700 m, then the dive
 *   reservoir-mid, reservoir-nne    Strikers onto the west intakes (N)
 *   gorge-yard       the swarm up the gorge and out over the right bank
 *   gorge            the last swarm up the gorge onto the penstocks
 *   west-orbit       the Scout's circle over the west arm
 * scripts/war-routes-check.js flies every one.
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

import { ids, targets } from './itaipu-1.js';
import { withWaves } from '../stages.js';

const YARD = 'yard-right';
const INTAKES_WEST = ids('intake', [0, 1, 2, 3, 4, 5, 6]);
const PENSTOCKS_WEST = ids('penstock', [0, 1, 2, 3, 4, 5, 6]);
/* A stream onto the yard: two decoys to every Striker. */
const LIE = [['decoy', 2], ['strike', 1]];

/* The reroute's hold, ms. Four minutes, not MISSIONS.md's 150 s, for the
 * reason the Spillway's is (itaipu-2.js): nothing of the stage reaches
 * the yard sooner than 99 s after its birth (a Striker along the
 * corridor; routes.js's plans), the swarm up the gorge 105 s, so at one
 * pilot's pace (1.6) the swarm born at 96 to 128 s arrives at 201 to
 * 233 s. Four minutes holds every arrival of the stage at every pace. */
const HOLD_MS = 240000;

/* A stage's way out as mission 1's (itaipu-1.js exits). */
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

/* Stage 3, the same in each of its twists but the twist's groups, its
 * objective (on the HUD once the twist is born, so the entry does not give
 * it away) and its lines. */
function reroute(id, twist, objective, cues) {
  return {
    id,
    round: true,
    title: 'war.stage.itaipu_3.reroute',
    /* Dusk into dark over the hold (MISSIONS.md M3: the towns' lights
     * come on in stage 3; src/share/daytime.js missionClock): the room's
     * clock runs from the golden hour to night across HOLD_MS, so The
     * Dark opens at night whatever the twist. */
    daytime: { to: 'night', ms: HOLD_MS },
    spawns: [
      ...twist,
      {
        at: [60, 80], kind: 'fpv', n: 3, per: 1, route: 'gorge-yard', target: YARD, spread: 30, group: 'swarm',
      },
    ],
    objectives: [{
      id: 'reroute', text: 'war.obj.itaipu_3.reroute', kind: 'hold', ms: HOLD_MS, targets: YARD, fail: { hit: YARD },
    }, {
      id: 'twist', kind: 'kill', show: { born: { group: 'twist' } }, done: { down: { group: 'twist' } }, fail: { leaked: 1, group: 'twist' }, ...objective,
    }],
    cues: [
      { at: 1, radio: 'itaipu-3-s3-despacho' },
      { at: 2, radio: 'itaipu-3-g-reroute' },
      { when: { held: 'reroute', f: 0.5 }, radio: 'itaipu-3-s3-half' },
      /* Held with the yard standing, or held with it already down (it
       * fell before the stage, so nothing could fail the hold): nothing
       * comes back on (TECH-NEEDS T1.10), and the second line says so. */
      { when: { objective: 'reroute', is: 'done' }, skip: { destroyed: YARD }, radio: 'itaipu-3-s3-done' },
      { when: { all: [{ objective: 'reroute', is: 'done' }, { destroyed: YARD }] }, radio: 'itaipu-3-s3-down' },
      { when: { objective: 'reroute', is: 'failed' }, radio: 'itaipu-3-s3-failed' },
      ...cues,
      STAGE_LOST,
    ],
    exits: exits({
      all: [{ any: [{ objective: 'reroute', is: 'done' }, { objective: 'reroute', is: 'failed' }] }, { cleared: true }],
    }, 'dark', BEAT(15, 15)),
  };
}

export default withWaves({
  id: 'itaipu-3',
  /* Act 1's mission 3 (index.js, the campaign's fields). */
  act: 1,
  order: 3,
  key: 'switchyard',
  free: false,
  release: 'development',
  /* A string key (src/strings): Lights Out. */
  title: 'war.mission.itaipu_3',
  map: 'itaipu',
  /* Minutes, low and high, a squad takes (docs/campaign/MISSIONS.md 2);
   * Operations' briefing shows it (src/ui/briefing.js). From the room:
   * war:stages' ten good bot games end 12.5 to 14.3 minutes after the go
   * (2026-10-14), past MISSIONS.md's first guess of 10 to 14. */
  estimatedMinutes: [12, 15],
  targets,
  output: 14000,
  floorMw: 9700,
  starMw: 12600,
  airframes: 4,
  radio: { brief: ['itaipu-3-s0-brief', 'itaipu-3-s0-rules'], win: 'debrief-itaipu-3-win', lose: 'debrief-itaipu-3-lose' },
  film: 'lights-out',
  /* The film a win ends on (films/lights-out-outro.js). */
  outro: 'lights-out-outro',
  /* CREST's nudge, as First Light's (docs/campaign/WAR-NUDGE.md). */
  nudge: true,
  /* Dusk (MISSIONS.md M3): the mission starts at the golden hour and
   * the Reroute's daytime takes it into the night. */
  time: 'golden',
  pace: { 1: 1.6, 2: 1.3, 3: 1.3 },
  adapt: true,
  sectors: {
    NW: ['reservoir-west', 'west-arm-low'],
    LINES: ['corridor-west', 'corridor-south'],
    HIGH: ['high-yard', 'high-west'],
    N: ['reservoir-mid', 'reservoir-nne'],
  },
  stages: [
    {
      id: 'dusk',
      round: true,
      title: 'war.stage.itaipu_3.dusk',
      spawns: [
        {
          at: 2, kind: 'scout', n: 1, per: 0.25, route: 'west-orbit', group: 'eyes',
        },
        {
          at: [2, 8], kind: 'strike', n: 1, per: 0.5, route: 'reservoir-west-far', target: YARD, spread: 60, group: 'pair',
        },
        {
          at: [2, 8], kind: 'decoy', n: 1, per: 0.5, route: 'reservoir-west-far', target: YARD, spread: 60, group: 'pair',
        },
      ],
      objectives: [{ id: 'yard', text: 'war.obj.protect_yard', kind: 'protect' }],
      cues: [
        { at: 0, radio: 'itaipu-3-g-yard' },
        { when: { born: { group: 'eyes' } }, at: 3, radio: 'itaipu-3-s1-eyes' },
        { when: { born: { group: 'pair' } }, at: 2, radio: 'itaipu-3-s1-pair' },
        { when: { cleared: true }, radio: 'itaipu-3-s1-clear' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'lie', BEAT(12, 12)),
    },
    {
      id: 'lie',
      round: true,
      title: 'war.stage.itaipu_3.lie',
      spawns: [
        {
          at: [4, 10], mix: LIE, n: 3, per: 1, route: { sector: ['NW', 'LINES'] }, target: YARD, spread: 60, group: 'stream',
        },
        {
          when: { gone: { group: 'stream' } }, at: [6, 12], mix: LIE, n: 2, per: 0.5, route: { sector: ['NW', 'LINES'] }, target: YARD, spread: 60, group: 'again',
        },
      ],
      objectives: [{ id: 'yard', text: 'war.obj.protect_yard', kind: 'protect' }],
      cues: [
        { when: { born: { group: 'stream' } }, at: 2, radio: 'itaipu-3-s2-stream' },
        { when: { born: { group: 'stream' } }, at: 6, radio: 'itaipu-3-s2-why' },
        { when: { born: { group: 'stream' } }, at: 10, radio: 'itaipu-3-g-lie', skip: { gone: { group: 'stream' } } },
        { when: { killed: 1, kind: 'decoy' }, radio: 'itaipu-3-s2-wasted' },
        { when: { cleared: true }, radio: 'itaipu-3-s2-clear' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, { pick: ['reroute-pack', 'reroute-feint', 'reroute-wires'] }, BEAT(15, 15)),
    },
    reroute('reroute-pack', [
      {
        at: [20, 40], kind: 'decoy', n: 3, per: 1, route: 'reservoir-west', target: YARD, spread: 40, group: 'pack',
      },
      {
        when: { born: { group: 'pack' } }, at: [1, 3], kind: 'strike', n: 1, per: 0, route: 'reservoir-west', target: YARD, spread: 40, group: 'twist',
      },
    ], { text: 'war.obj.itaipu_3.pack' }, [
      { when: { born: { group: 'pack' } }, at: 3, radio: 'itaipu-3-ta-turn' },
      { when: { born: { group: 'pack' } }, at: 7, radio: 'itaipu-3-ta-why' },
      { when: { born: { group: 'pack' } }, at: 11, radio: 'itaipu-3-g-pack', skip: { down: { group: 'twist' } } },
    ]),
    reroute('reroute-feint', [
      {
        at: [20, 40], kind: 'decoy', n: 3, per: 1, route: { sector: 'NW' }, target: YARD, spread: 60, group: 'noise',
      },
      {
        at: [25, 45], kind: 'strike', n: 1, per: 0.5, route: { sector: 'N' }, target: INTAKES_WEST, spread: 30, group: 'twist',
      },
    ], { text: 'war.obj.itaipu_3.feint' }, [
      { when: { born: { group: 'twist' } }, radio: 'itaipu-3-tb-turn' },
      { when: { born: { group: 'twist' } }, at: 4, radio: 'itaipu-3-tb-why' },
      { when: { born: { group: 'twist' } }, at: 8, radio: 'itaipu-3-g-feint', skip: { down: { group: 'twist' } } },
    ]),
    reroute('reroute-wires', [
      {
        at: [20, 40], kind: 'strike', n: 2, per: 0.75, route: 'corridor-west', target: YARD, spread: 25, group: 'twist',
      },
    ], { text: 'war.obj.itaipu_3.wires' }, [
      { when: { born: { group: 'twist' } }, at: 2, radio: 'itaipu-3-tc-turn' },
      { when: { born: { group: 'twist' } }, at: 6, radio: 'itaipu-3-tc-why' },
      { when: { born: { group: 'twist' } }, at: 10, radio: 'itaipu-3-g-wires', skip: { down: { group: 'twist' } } },
    ]),
    {
      id: 'dark',
      round: true,
      title: 'war.stage.itaipu_3.dark',
      spawns: [
        {
          at: [4, 10], kind: 'loiter', n: 2, per: 1, route: { sector: 'HIGH' }, target: YARD, spread: 20, group: 'high',
        },
        {
          at: [20, 30], mix: [['strike', 3], ['decoy', 1]], n: 3, per: 1, route: { sector: 'N' }, target: INTAKES_WEST, spread: 30, group: 'intakes',
        },
        {
          at: [30, 40], kind: 'fpv', n: 2, per: 1, route: 'gorge', target: PENSTOCKS_WEST, spread: 10, group: 'swarm',
        },
      ],
      objectives: [{ id: 'dark', text: 'war.obj.itaipu_3.dark', kind: 'protect' }],
      cues: [
        { at: 1, radio: 'itaipu-3-s4-dark' },
        { when: { born: { group: 'high' } }, at: 2, radio: 'itaipu-3-s4-all' },
        { when: { born: { group: 'high' } }, at: 6, radio: 'itaipu-3-s4-order' },
        { when: { born: { group: 'high' } }, at: 10, radio: 'itaipu-3-g-dark' },
      ],
      exits: exits({ cleared: true }, 'won', 0, 'waves'),
    },
  ],
  routes: {
    'west-orbit': [[-2400, 470, -3700], [-1700, 470, -2800]],
    'reservoir-west': [[-1600, 249, -2800], [-1600, 249, -1700], [-1800, 300, -1000]],
    'reservoir-west-far': [[-1600, 249, -4800], [-1600, 249, -1700], [-1800, 300, -1000]],
    'west-arm-low': [[-2600, 249, -3400], [-2300, 249, -2000], [-2250, 300, -1100]],
    'corridor-west': [[-4800, 262, 330], [-4000, 255, 170], [-3030, 262, 30], [-2780, 265, -150], [-2620, 262, -420]],
    'corridor-south': [[-1300, 200, 1500], [-1900, 235, 900], [-2040, 245, 300], [-2000, 248, -100]],
    'high-yard': [[-2800, 700, -2600], [-2500, 650, -1500]],
    'high-west': [[-1700, 700, -3100], [-1300, 650, -2400]],
    'reservoir-mid': [[400, 249, -5000], [0, 249, -2800], [-50, 249, -2200]],
    'reservoir-nne': [[900, 249, -5200], [400, 249, -3000], [150, 249, -2300]],
    'gorge-yard': [[-1100, 180, 400], [-760, 180, 0], [-800, 260, -300], [-1500, 300, -400]],
    gorge: [[-1100, 180, 400], [-760, 180, 0], [-640, 180, -450], [-400, 180, -800], [-150, 180, -1100], [0, 185, -1350]],
  },
});
