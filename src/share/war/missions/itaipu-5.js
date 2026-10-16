/*
 * itaipu-5.js: Defend the Paraná, act 1, mission 5, "The River Below"
 * (docs/campaign/MISSIONS.md M5): day two, the morning. Downriver, on the
 * Brazilian bank, Carancho's flight held the river all night and is out
 * of birds. The Aggressor's new axis comes up the river, under the
 * gorge's rims, onto the downstream face, and something on the water is
 * launching the swarms. Data, as itaipu-1.js, which it takes its targets
 * from, with First Light's floor and stars.
 *
 * THE STAGES, each a round, with the radio's story (MISSIONS.md M5 Radio):
 *   1  Carancho's Call  swarms up the gorge, two routes, staggered, onto
 *                       the penstocks
 *   2  Up the Gorge     a swarm hugging the left (east) rim, and Hunters
 *                       out of the gorge 25 to 40 s in. Over when the
 *                       swarm is gone and the Hunters are down or HUNT_S
 *                       have passed (The Long Night's rule: a Hunter lives
 *                       until it is killed)
 *   3  The Source       the carrier on the river (a RIVER route, drawn),
 *                       launching a swarm up the gorge every 50 s for one
 *                       pilot to 35 s for eight while it lives (its
 *                       spawn's `launch`, edge/rooms/war.js); kill it.
 *                       One of three twists, drawn as stage 2 ends:
 *                       A, two hulls: a second carrier 30 to 50 s in, and
 *                       one of the two, drawn, launches nothing (the
 *                       stage's `silent`); B, once every one of its first
 *                       swarm is killed it launches Hunters instead (its
 *                       launch's `then`); C, Carancho's last bird: its
 *                       swarms are twice the size. Over when the carrier
 *                       is dead and nothing else is left
 *   4  Clear the River  the convergence: swarms on both gorge routes,
 *                       Strikers low up the river, a Loiterer high, all
 *                       onto the penstocks
 * A stage lost (no pilot left flying) lets what is alive through and the
 * next comes; the mission is won when the fourth ends with the output at
 * or over the floor, lost the instant it falls under, and a lost mission
 * restarts from the stage it was lost in (war.js, two stars at most).
 *
 * SPOTTING (MISSIONS.md M5's as built): a carrier is `spot`, so a pilot
 * who stays within 450 m of it for 1.5 s spots it for everybody
 * (edge/rooms/war.js spot), and every screen marks it for what it is:
 * LAUNCHING, or EMPTY HULL for twist A's silent one (src/ui/warmarkers.js);
 * MIRADOR says which once the silent one is spotted and the second hull is
 * on the water. Twist C's hull is spotted at its birth (`spot: 'birth'`),
 * the same mark: Carancho's. Both hulls stay the objective. A hurt carrier
 * burns, the explosions' fire and smoke over its deck, until its last hit
 * (src/render/explosion.js burn).
 *
 * THE RADIO is the stages' cues (MISSIONS.md M5 Radio: CARANCHO, CREST,
 * MIRADOR, TALLER), the countdown's two lines, CARANCHO's and CREST's,
 * the debriefs (`radio`), and CREST's guide (`itaipu-5-g-*`, MISSIONS.md
 * M5 Guide): what to do now, after each stage's story; the nudge is
 * CREST's shared one.
 *
 * THE DIALS (MISSIONS.md 1.4), as First Light's: each group's time in a
 * window, the carrier's route on the river, the Loiterer's bearing, the
 * Strikers' route, the twist, and twist A's silent hull. `pace` stretches
 * every time for a small squad (MISSIONS.md 1.6); `adapt` weights the
 * bearings away from where the squad killed most last stage.
 *
 * THE ROUTES, y up, scene metres (-z is north); the penstocks are on the
 * powerhouse's downstream face, x -215 to 415, z -1734 to -1591, 169 m.
 * The river below the dam is the map's water.json `river`, 103.5 m; every
 * river route stays where the war's floor (itaipu-height.bin, ground and
 * water on 40 m cells) is that water, a band 200 to 250 m wide inside the
 * outline from z 1600 up to the gorge's head:
 *   gorge         the swarm up the river from the south onto the
 *                 penstocks, as First Light's
 *   gorge-left-rim
 *                 a swarm under the east (left bank) rims, 140 m, 30 m
 *                 inside the band's east edge, onto the east penstocks
 *   river-surface, river-west-bank
 *                 the carrier on the surface, 103.5 m, up the middle of
 *                 the band or 30 m inside its west edge from 1.2 to 1.3 km
 *                 downstream, holding 1.9 to 2.1 km below the face
 *   river-launch  what a carrier launches: from its deck (the birth's
 *                 `from`) to the gorge route's second point, then on up
 *                 the gorge as it does
 *   river-low, river-west-low
 *                 Strikers 31.5 m over the river, up the middle or the
 *                 west of the band, onto the penstocks
 *   high-south, high-south-east
 *                 a Loiterer at 650 to 700 m over the river below the dam
 *                 or its east bank, a circle, then the dive onto the
 *                 downstream face: from the north, as the other missions'
 *                 high routes come, the dive meets the dam's upstream
 *                 face (war:routes)
 *   gorge-hunt    where the Hunters are born, in the gorge 1.5 km below
 *                 the dam, and their home over the gorge's head
 * scripts/war-routes-check.js flies every one, and every launch from
 * every point of a carrier's flight.
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

const PENSTOCKS_WEST = ids('penstock', [0, 1, 2, 3, 4, 5, 6]);
const PENSTOCKS_MID = ids('penstock', [4, 5, 6, 7, 8, 9, 10, 11]);
const PENSTOCKS_EAST = ids('penstock', [12, 13, 14, 15, 16, 17, 18, 19]);
/* Every penstock: what a carrier's launches go for, so a source left
 * alive costs the face until the output is under the floor. */
const PENSTOCKS = ids('penstock', Array.from({ length: 20 }, (_, k) => k));

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
/* Seconds from a stage's entry after which its Hunters no longer hold it
 * open, its other groups still gone: The Long Night's (itaipu-4.js). */
const HUNT_S = 150;

/* What a carrier launches (MISSIONS.md M5: "a swarm group every 35 to 50
 * s", and for the pilots "a solo pilot's carrier launches every 50 s,
 * eight pilots' every 35 s"; T1.6 sizes it as a group, here as stage
 * 1's swarms). Its first comes one interval after its birth. */
const LAUNCH = {
  kind: 'fpv', n: 3, per: 1, route: 'river-launch', target: PENSTOCKS, spread: 10, group: 'launched', every: [50, 35],
};
/* The carrier itself: on a RIVER route, drawn, its launch its own; a
 * pilot who stays near it spots it (`spot`, edge/rooms/war.js: 450 m for
 * 1.5 s), and from then every screen marks it for what it is, LAUNCHING
 * or, twist A's silent one, EMPTY HULL (src/ui/warmarkers.js). */
const CARRIER = {
  at: [2, 4], kind: 'carrier', n: 1, per: 0, route: { sector: 'RIVER' }, group: 'carrier', launch: LAUNCH, spot: true,
};
/* The Source's kill objective, on the HUD once the carrier is born. */
const KILL = (done) => ({
  id: 'carrier', text: 'war.obj.itaipu_5.carrier', kind: 'kill', show: { born: { group: 'carrier' } }, done,
});
const DOWN = { down: { group: 'carrier' } };
/* The source's story (MISSIONS.md M5 Radio), from the carrier's birth `at`
 * seconds on: MIRADOR has it, CREST orders the kill (unless it is already
 * dead), TALLER marks the kill. */
const SOURCE_CUES = (at) => [
  { when: { born: { group: 'carrier' } }, at, radio: 'itaipu-5-s3-carrier' },
  { when: { born: { group: 'carrier' } }, at: at + 4, radio: 'itaipu-5-s3-order', skip: DOWN },
  { when: DOWN, radio: 'itaipu-5-s3-dead' },
];
/* CREST's guide on the source, every twist: where the hull is and what it
 * takes, after the order. */
const SOURCE_GUIDE = { when: { born: { group: 'carrier' } }, at: 11, radio: 'itaipu-5-g-source', skip: DOWN };
/* The act's turn (docs/campaign/BIBLE.md 10.4): MIRADOR, after TALLER
 * marks the kill. Last in each twist's list, so no cue before it draws
 * again. */
const TURN = (when) => ({ when, radio: 'itaipu-5-s3-learn' });

export default withWaves({
  id: 'itaipu-5',
  /* Act 1's mission 5 (index.js, the campaign's fields). Released to
   * every pilot on 2026-10-16 (the owner: "make everything available to
   * everyone"). */
  act: 1,
  order: 5,
  key: 'river',
  free: false,
  release: 'available',
  /* A string key (src/strings): The River Below. */
  title: 'war.mission.itaipu_5',
  map: 'itaipu',
  /* Minutes, low and high, a squad takes (docs/campaign/MISSIONS.md 2);
   * Operations' briefing shows it (src/ui/briefing.js). From the room:
   * war:stages' ten good bot games end 8.0 to 13.5 minutes after the go
   * (2026-10-15), against MISSIONS.md's first guess of 11 to 15: a squad
   * that kills the carrier before it launches twice ends early. */
  estimatedMinutes: [7, 14],
  targets,
  output: 14000,
  floorMw: 7700,
  starMw: 11200,
  airframes: 4,
  /* Day two, the morning (MISSIONS.md M5 "Time: day"; daytime.js). */
  time: 'day',
  radio: { brief: ['itaipu-5-s0-brief', 'itaipu-5-s0-rules'], win: 'debrief-itaipu-5-win', lose: 'debrief-itaipu-5-lose' },
  /* Its film (films/river-below.js, INTROS.md 5.5); no outro: INTROS.md
   * writes none for M5, so a win ends on its debrief. */
  film: 'river-below',
  /* CREST's nudge, as First Light's (docs/campaign/WAR-NUDGE.md). */
  nudge: true,
  /* When the face opens (src/share/war/contain.js, MISSIONS.md 1.9): the
   * mission's own line after the opening is called, CARANCHO's from
   * downriver. */
  contain: { op: 'itaipu-5-op' },
  pace: { 1: 1.6, 2: 1.3, 3: 1.3 },
  adapt: true,
  sectors: {
    GORGE: ['gorge', 'gorge-left-rim'],
    HIGH: ['high-south', 'high-south-east'],
    RIVER: ['river-surface', 'river-west-bank'],
  },
  stages: [
    {
      id: 'call',
      round: true,
      title: 'war.stage.itaipu_5.call',
      spawns: [
        {
          at: [6, 12], kind: 'fpv', n: 3, per: 1, route: 'gorge', sector: 'GORGE', target: PENSTOCKS_MID, spread: 10, group: 'swarm',
        },
        {
          at: [26, 40], kind: 'fpv', n: 3, per: 1, route: 'gorge-left-rim', sector: 'GORGE', target: PENSTOCKS_EAST, spread: 10, group: 'swarm-2',
        },
      ],
      objectives: [{ id: 'penstocks', text: 'war.obj.protect_penstocks', kind: 'protect' }],
      cues: [
        { when: { born: { group: 'swarm' } }, at: 2, radio: 'itaipu-5-s1-swarm' },
        { when: { born: { group: 'swarm' } }, at: 7, radio: 'itaipu-5-g-face', skip: { any: [{ down: { group: 'swarm' } }, { leaked: 1, group: 'swarm' }] } },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'gorge', BEAT(12, 12)),
    },
    {
      id: 'gorge',
      round: true,
      title: 'war.stage.itaipu_5.gorge',
      spawns: [
        {
          at: [4, 8], kind: 'fpv', n: 3, per: 1, route: 'gorge-left-rim', sector: 'GORGE', target: PENSTOCKS_EAST, spread: 10, group: 'swarm',
        },
        {
          at: [25, 40], kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt', group: 'hunters',
        },
      ],
      objectives: [{ id: 'penstocks', text: 'war.obj.protect_penstocks', kind: 'protect' }],
      cues: [
        { at: 1, radio: 'itaipu-5-s2-pattern' },
        { when: { born: { group: 'swarm' } }, at: 3, radio: 'itaipu-5-g-rim', skip: { down: { group: 'swarm' } } },
        { when: { born: { group: 'hunters' } }, at: 4, radio: 'itaipu-5-g-hunters', skip: { down: { group: 'hunters' } } },
        STAGE_LOST,
      ],
      /* Over when the swarm is gone and the Hunters are down or HUNT_S
       * have passed, not while the face is closing (MISSIONS.md 1.9 point
       * 4); then the source, one of its three twists. */
      exits: exits({
        all: [{ gone: { group: 'swarm' } }, { any: [{ down: { group: 'hunters' } }, { time: HUNT_S }] }, { contained: true }],
      }, { pick: ['two-hulls', 'hunters-launched', 'last-bird'] }, BEAT(15, 15)),
    },
    {
      /* Twist A: a second hull 30 to 50 s in; one of the two, drawn,
       * launches nothing, and nothing on the screen says which. */
      id: 'two-hulls',
      round: true,
      title: 'war.stage.itaipu_5.source',
      silent: ['carrier', 'carrier-2'],
      spawns: [
        { ...CARRIER, route: 'river-surface', sector: 'RIVER' },
        {
          ...CARRIER, at: [30, 50], route: 'river-west-bank', sector: 'RIVER', group: 'carrier-2',
        },
      ],
      objectives: [KILL({ all: [DOWN, { down: { group: 'carrier-2' } }] })],
      /* MIRADOR calls the hull "launching" only once one is: the first
       * hull may be the silent one. Once a pilot has spotted the silent
       * one and the second is on the water, MIRADOR says which. */
      cues: [
        { when: { born: { group: 'launched' } }, radio: 'itaipu-5-s3-carrier' },
        { when: { born: { group: 'launched' } }, at: 4, radio: 'itaipu-5-s3-order', skip: { objective: 'carrier', is: 'done' } },
        { when: { born: { group: 'carrier-2' } }, at: 2, radio: 'itaipu-5-ta-turn' },
        { when: { all: [{ spot: { silent: true } }, { born: { group: 'carrier-2' } }] }, at: 1, radio: 'itaipu-5-ta-spot', skip: { objective: 'carrier', is: 'done' } },
        SOURCE_GUIDE,
        { when: { born: { group: 'carrier-2' } }, at: 6, radio: 'itaipu-5-g-hulls', skip: { objective: 'carrier', is: 'done' } },
        { when: { objective: 'carrier', is: 'done' }, radio: 'itaipu-5-s3-dead' },
        STAGE_LOST,
        TURN({ objective: 'carrier', is: 'done' }),
      ],
      exits: exits({ all: [DOWN, { down: { group: 'carrier-2' } }, { cleared: true }] }, 'clear', BEAT(20, 20)),
    },
    {
      /* Twist B: once every one of its first swarm is killed, Hunters. */
      id: 'hunters-launched',
      round: true,
      title: 'war.stage.itaipu_5.source',
      spawns: [{
        ...CARRIER,
        launch: {
          ...LAUNCH,
          then: {
            kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt', group: 'launched-hunters',
          },
        },
      }],
      objectives: [KILL(DOWN)],
      cues: [
        ...SOURCE_CUES(3),
        SOURCE_GUIDE,
        { when: { born: { group: 'launched-hunters' } }, radio: 'itaipu-5-tb-turn' },
        { when: { born: { group: 'launched-hunters' } }, at: 4, radio: 'itaipu-5-g-deck', skip: DOWN },
        STAGE_LOST,
        TURN(DOWN),
      ],
      /* Over when the carrier is dead and nothing is left, or its swarms
       * are gone and HUNT_S have passed: its Hunters, as stage 2's. */
      exits: exits({
        all: [DOWN, { any: [{ cleared: true }, { all: [{ gone: { group: 'launched' } }, { time: HUNT_S }] }] }, { contained: true }],
      }, 'clear', BEAT(20, 20)),
    },
    {
      /* Twist C: Carancho's last bird marks the hull, spotted as it is
       * born, the same mark a pilot's spot gives; its escort, every swarm
       * it launches, is twice the size. */
      id: 'last-bird',
      round: true,
      title: 'war.stage.itaipu_5.source',
      spawns: [{ ...CARRIER, spot: 'birth', launch: { ...LAUNCH, n: 6, per: 2 } }],
      objectives: [KILL(DOWN)],
      /* CARANCHO first: the hull is his to mark, then MIRADOR has it. */
      cues: [
        { when: { born: { group: 'carrier' } }, at: 1, radio: 'itaipu-5-tc-turn' },
        ...SOURCE_CUES(3),
        SOURCE_GUIDE,
        { when: { born: { group: 'launched' } }, at: 4, radio: 'itaipu-5-g-escort', skip: DOWN },
        STAGE_LOST,
        TURN(DOWN),
      ],
      exits: exits({ all: [DOWN, { cleared: true }] }, 'clear', BEAT(20, 20)),
    },
    {
      id: 'clear',
      round: true,
      title: 'war.stage.itaipu_5.clear',
      spawns: [
        {
          at: [2, 6], kind: 'fpv', n: 3, per: 1, route: 'gorge', sector: 'GORGE', target: PENSTOCKS_WEST, spread: 10, group: 'swarm',
        },
        {
          at: [8, 14], kind: 'fpv', n: 3, per: 1, route: 'gorge-left-rim', sector: 'GORGE', target: PENSTOCKS_EAST, spread: 10, group: 'swarm-2',
        },
        {
          at: [16, 24], kind: 'strike', n: 2, per: 0.75, route: ['river-low', 'river-west-low'], sector: 'RIVER', target: PENSTOCKS_MID, spread: 30, group: 'river',
        },
        {
          at: [24, 34], kind: 'loiter', n: 1, per: 0.75, route: { sector: 'HIGH' }, target: PENSTOCKS_MID, spread: 25, group: 'high',
        },
      ],
      objectives: [{ id: 'penstocks', text: 'war.obj.protect_penstocks', kind: 'protect' }],
      cues: [
        { at: 1, radio: 'itaipu-5-s4-last' },
        { when: { born: {} }, at: 8, radio: 'itaipu-5-g-all' },
      ],
      /* The last: lost or held, the mission is won if the output is still
       * over the floor when it ends (as First Light's). */
      exits: exits({ cleared: true }, 'won', 0, 'waves'),
    },
  ],
  routes: {
    gorge: [[-1100, 180, 400], [-760, 180, 0], [-640, 180, -450], [-400, 180, -800], [-150, 180, -1100], [0, 185, -1350]],
    'gorge-left-rim': [[-970, 140, 600], [-810, 140, 300], [-690, 140, 0], [-570, 140, -300], [-410, 140, -600], [-250, 140, -900], [-100, 150, -1150], [150, 165, -1350]],
    'river-surface': [[-1200, 103.5, 1200], [-1160, 103.5, 1000], [-1140, 103.5, 850], [-1100, 103.5, 700], [-1040, 103.5, 600], [-980, 103.5, 500], [-940, 103.5, 400], [-900, 103.5, 300]],
    'river-west-bank': [[-1330, 103.5, 1300], [-1270, 103.5, 1200], [-1230, 103.5, 1000], [-1230, 103.5, 800], [-1190, 103.5, 700], [-1095, 103.5, 600], [-1040, 103.5, 500], [-1010, 103.5, 400]],
    'river-launch': [[-760, 180, 0], [-640, 180, -450], [-400, 180, -800], [-150, 180, -1100], [0, 185, -1350]],
    'river-low': [[-1200, 135, 1200], [-1140, 135, 850], [-1040, 135, 600], [-940, 135, 400], [-840, 135, 200], [-760, 135, 0], [-680, 135, -300], [-580, 135, -500], [-380, 135, -700], [-280, 135, -900], [-240, 140, -1000], [-100, 150, -1300]],
    'river-west-low': [[-1270, 135, 1200], [-1230, 135, 800], [-1070, 135, 500], [-910, 135, 200], [-800, 135, -100], [-790, 135, -400], [-470, 135, -600], [-360, 135, -800], [-280, 140, -1000], [-250, 150, -1300]],
    'high-south': [[-1500, 700, 1500], [-900, 650, 300]],
    'high-south-east': [[400, 700, 1300], [-200, 650, 100]],
    'gorge-hunt': [[-760, 200, 0], [-100, 260, -1300]],
  },
});
