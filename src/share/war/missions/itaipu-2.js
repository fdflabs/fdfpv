/*
 * itaipu-2.js: Defend the Paraná, act 1, mission 2, "The Spillway"
 * (docs/campaign/MISSIONS.md M2): day one, the afternoon after rain
 * upstream. The reservoir is at the top of the gates and the plant must
 * spill; only some of the fourteen radial gates on the right bank (gate-0
 * to gate-13, west to east) are ready to move, and the Aggressor knows
 * which. Data, as itaipu-1.js, which it takes its targets from.
 *
 * THE WORKING GATES (`sets.working`, stages.js drawSets): three of the
 * fourteen drawn by the seed as the match starts, four from four pilots.
 * The film outlines them, stage 3 opens them and stages 3 and 4 aim at
 * them; while the spill runs a hit one costs double (`worth`), 700 MW.
 * Stages 1 and 2 go only for gates that are not working (IDLE), so all
 * of them stand when the spill opens.
 *
 * THE STAGES, each a round, with the radio's story (MISSIONS.md M2 Radio):
 *   1  High Water   a Scout from the west arm or the north (MIRADOR sees
 *                   it watching the right bank), and 15 to 30 s in
 *                   Loiterers from HIGH onto two gates
 *   2  The Channel  boats down the reservoir to the gates (WATER), and
 *                   Strikers low up the approach channel 0 to 10 s after
 *                   the boats are gone, or 35 s in, whichever is first
 *   3  Open the Gates  the working gates' hoists raise them from Free
 *                   Flight's 2 m to 4 m over the 240 s hold (`open`: the
 *                   view's `gates`, which the room's damage, the map and
 *                   the flood read, hoist.js); Loiterers come for them
 *                   only, and one of three twists, drawn: A, Loiterers
 *                   out of the spray 40 to 60 s in (markers past
 *                   SPRAY_HIDE_M hidden in it, src/ui/warmarkers.js); B,
 *                   boats down the west arm 15 to 30 s in; C, Hunters
 *                   over the chute 40 to 60 s in. Each twist adds its own
 *                   objective once it is born, and two lines. A working
 *                   gate hit fails the hold: its hoist stops, the spill
 *                   runs on the rest, and the stage is damaged (no third
 *                   star)
 *   4  Hold the River  boats, Loiterers and Strikers converging on the
 *                   working gates; CREST orders the squad onto them
 * A stage lost (no pilot left flying) lets what is alive through and the
 * next comes; the mission is won when the fourth ends with the output at
 * or over the floor, lost the instant it falls under, and a lost mission
 * restarts from the stage it was lost in (war.js, two stars at most).
 * Floor and stars as the old mission 2: a gate is worth 350 MW and the
 * gates are fourteen of the plant's targets here, so the floor sits where
 * losing about half of them would take it. With nobody shooting the
 * mission is lost in stage 3 (war:stages holds it).
 *
 * THE ROUTES, y up, scene metres (-z is north); the gates' upstream faces
 * are at z about -960 to -1070, x -1125 to -813, and the chute runs
 * south south east from them to its flip buckets near (-805, -553):
 *   high-*            Loiterers at 650 to 700 m, then the dive
 *   surface-*, west-arm-mid
 *                     Sea drones on the reservoir's surface, 219.0 m;
 *                     twist B's from half way down the west arm, so they
 *                     reach the gates inside the hold
 *   channel-low       Strikers 30 m over the approach channel
 *   spray-dive        twist A: Loiterers from over the river below the
 *                     dam, down through the spray and over the gates
 *   chute-hunt        twist C: where the Hunters are born, over the
 *                     plunge pool, and their home over the chute
 *   *-orbit, gorge-hunt  as mission 1
 * scripts/war-routes-check.js flies every one.
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

import { ids, targets } from './itaipu-1.js';
import { withWaves } from '../stages.js';
import { FREE_OPEN_M, HOIST_M_S } from '../hoist.js';

const GATES = ids('gate', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
const WORKING = { set: 'working' };
/* The gates of a list that are not working, in its order: what the first
 * two stages go for. The Aggressor keeps the working gates for the spill,
 * when a hit costs double, so all of them stand when it opens, and a
 * squad that lets everything through loses the hold and the mission (the
 * first stages hit only working gates the draw shared with their lists,
 * and a match could then be won with nobody flying). */
const IDLE = (ks) => ({ of: ids('gate', ks), not: 'working' });

/* The hold, ms: the working gates opening until the spill is running.
 * Four minutes, not MISSIONS.md's two: nothing of the stage can reach a
 * gate sooner than 117 s after its birth (a Loiterer's circle, a boat's
 * run; measured on routes.js's plans), so a two minute hold from the
 * stage's entry was never under attack and could not fail. Four holds
 * the stage's arrivals, its first Loiterers at 145 to 221 s and the
 * twist's at 157 to 240. */
const HOLD_MS = 240000;
/* Where their hoists take them, metres: from Free Flight's spill, the
 * hoist's rate over the hold (hoist.js: 0.5 m a minute, so 2 m to 4 m),
 * so the hoists stop as the hold is done. */
const OPEN_M = FREE_OPEN_M + (HOIST_M_S * HOLD_MS) / 1000;

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

/* Stage 3, the same in each of its twists but the twist's group, its
 * objective (on the HUD once the twist is born, so the entry does not give
 * it away) and its lines. */
function openTheGates(id, twist, objective, cues) {
  return {
    id,
    round: true,
    title: 'war.stage.itaipu_2.open',
    worth: { working: 2 },
    spawns: [
      {
        at: [8, 14], kind: 'loiter', n: 1, per: 0.75, route: { sector: 'HIGH' }, target: WORKING, spread: 20, group: 'first',
      },
      { at: [40, 60], ...twist, group: 'twist' },
      {
        at: [60, 75], kind: 'loiter', n: 2, per: 0.75, route: { sector: 'HIGH' }, target: WORKING, spread: 20, group: 'late',
      },
    ],
    objectives: [{
      id: 'spill', text: 'war.obj.itaipu_2.spill', kind: 'hold', ms: HOLD_MS, targets: WORKING, open: OPEN_M, fail: { hit: WORKING },
    }, {
      id: 'twist', kind: 'kill', show: { born: { group: 'twist' } }, done: { down: { group: 'twist' } }, ...objective,
    }],
    cues: [
      { at: 1, radio: 'itaipu-2-s3-open' },
      { when: { held: 'spill', f: 0.5 }, radio: 'itaipu-2-s3-half' },
      { when: { objective: 'spill', is: 'done' }, radio: 'itaipu-2-s3-held' },
      { when: { objective: 'spill', is: 'failed' }, radio: 'itaipu-2-s3-failed' },
      ...cues,
      STAGE_LOST,
    ],
    exits: exits({
      all: [{ any: [{ objective: 'spill', is: 'done' }, { objective: 'spill', is: 'failed' }] }, { cleared: true }],
    }, 'hold-river', BEAT(12, 12)),
  };
}

export default withWaves({
  id: 'itaipu-2',
  /* A string key (src/strings): The Spillway. */
  title: 'war.mission.itaipu_2',
  map: 'itaipu',
  /* Minutes, low and high, a squad takes (docs/campaign/MISSIONS.md 2);
   * Operations' briefing shows it (src/ui/briefing.js). */
  estimatedMinutes: [10, 14],
  targets,
  output: 14000,
  floorMw: 11200,
  starMw: 11900,
  airframes: 4,
  /* The afternoon (MISSIONS.md M2: `day`). */
  time: 'day',
  radio: { brief: ['itaipu-2-s0-brief', 'itaipu-2-s0-rules'], win: 'debrief-itaipu-2-win', lose: 'debrief-itaipu-2-lose' },
  film: 'spillway',
  pace: { 1: 1.6, 2: 1.3, 3: 1.3 },
  adapt: true,
  sets: { working: { from: GATES, n: { 1: 3, 4: 4 } } },
  /* The spill's spray over the chute and the plunge pool: while a gate is
   * open, an attacker in it farther than SPRAY_HIDE_M from a pilot has no
   * marker on that pilot's screen (warmarkers.js, twist A). */
  spray: { at: [-880, -720], r: 320, y: [80, 340] },
  sectors: {
    HIGH: ['high-west', 'high-north'],
    WATER: ['surface-gates', 'surface-west-arm'],
  },
  stages: [
    {
      id: 'high-water',
      round: true,
      title: 'war.stage.itaipu_2.high_water',
      spawns: [
        {
          at: 2, kind: 'scout', n: 1, per: 0.25, route: ['west-orbit', 'reservoir-orbit'], group: 'eyes',
        },
        {
          at: [15, 30], kind: 'loiter', n: 2, per: 1, route: { sector: 'HIGH' }, target: IDLE([3, 10, 7, 12, 0]), spread: 20, group: 'high',
        },
      ],
      objectives: [{ id: 'gates', text: 'war.obj.protect_gates', kind: 'protect' }],
      cues: [
        { when: { born: { group: 'eyes' } }, at: 3, radio: 'itaipu-2-s1-eyes' },
        { when: { born: { group: 'high' } }, at: 2, radio: 'itaipu-2-s1-high' },
        { when: { cleared: true }, radio: 'itaipu-2-s1-clear' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'channel', BEAT(10, 15)),
    },
    {
      id: 'channel',
      round: true,
      title: 'war.stage.itaipu_2.channel',
      spawns: [
        {
          at: [4, 8], kind: 'boat', n: 2, per: 1, route: { sector: 'WATER' }, target: IDLE([1, 9, 4, 13, 5, 8]), spread: 10, group: 'boats',
        },
        {
          when: { any: [{ gone: { group: 'boats' } }, { time: 35 }] }, at: [0, 10], kind: 'strike', n: 1, per: 0.75, route: 'channel-low', target: IDLE([2, 11, 6, 0, 8]), spread: 15, group: 'fast',
        },
      ],
      objectives: [{ id: 'gates', text: 'war.obj.protect_gates', kind: 'protect' }],
      cues: [
        { when: { born: { group: 'boats' } }, at: 2, radio: 'itaipu-2-s2-wakes' },
        { when: { born: { group: 'fast' } }, radio: 'itaipu-2-s2-fast' },
        { when: { cleared: true }, radio: 'itaipu-2-s2-clear' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, { pick: ['open-spray', 'open-west-arm', 'open-chute'] }, BEAT(15, 15)),
    },
    openTheGates('open-spray', {
      kind: 'loiter', n: 2, per: 0.75, route: 'spray-dive', target: WORKING, spread: 15,
    }, { text: 'war.obj.itaipu_2.spray', fail: { leaked: 1, group: 'twist' } }, [
      { when: { born: { group: 'twist' } }, at: 3, radio: 'itaipu-2-ta-turn' },
      { when: { born: { group: 'twist' } }, at: 7, radio: 'itaipu-2-ta-why' },
    ]),
    openTheGates('open-west-arm', {
      at: [15, 30], kind: 'boat', n: 2, per: 1, route: 'west-arm-mid', target: WORKING, spread: 10,
    }, { text: 'war.obj.itaipu_2.west_arm', fail: { leaked: 1, group: 'twist' } }, [
      { when: { born: { group: 'twist' } }, at: 3, radio: 'itaipu-2-tb-turn' },
      { when: { born: { group: 'twist' } }, at: 7, radio: 'itaipu-2-tb-why' },
    ]),
    openTheGates('open-chute', {
      kind: 'hunter', n: 1, per: 0.5, route: 'chute-hunt',
    }, { text: 'war.obj.itaipu_2.chute' }, [
      { when: { born: { group: 'twist' } }, radio: 'itaipu-2-tc-turn' },
      { when: { born: { group: 'twist' } }, at: 5, radio: 'itaipu-2-tc-why' },
    ]),
    {
      id: 'hold-river',
      round: true,
      title: 'war.stage.itaipu_2.hold',
      worth: { working: 2 },
      spawns: [
        {
          at: [2, 8], kind: 'boat', n: 2, per: 1, route: { sector: 'WATER' }, target: WORKING, spread: 10, group: 'boats',
        },
        {
          at: [10, 20], kind: 'loiter', n: 2, per: 1, route: { sector: 'HIGH' }, target: WORKING, spread: 20, group: 'high',
        },
        {
          at: [28, 40], mix: [['strike', 4], ['decoy', 1]], n: 2, per: 1, route: 'channel-low', target: WORKING, spread: 15, group: 'fast',
        },
      ],
      objectives: [{ id: 'working', text: 'war.obj.itaipu_2.working', kind: 'protect' }],
      cues: [
        { when: { born: {} }, radio: 'itaipu-2-s4-all' },
        { when: { born: {} }, at: 4, radio: 'itaipu-2-s4-order' },
        { when: { killed: 1 }, radio: 'itaipu-2-s4-hold' },
      ],
      exits: exits({ cleared: true }, 'won', 0, 'waves'),
    },
  ],
  routes: {
    'reservoir-orbit': [[300, 470, -5000], [300, 470, -3200]],
    'west-orbit': [[-2400, 470, -3700], [-1700, 470, -2800]],
    'high-west': [[-1500, 700, -2600], [-1250, 650, -2000]],
    'high-north': [[-500, 700, -4200], [-800, 650, -2700]],
    'surface-gates': [[-1350, 219, -2300], [-1250, 219, -1800], [-1080, 219, -1250]],
    'surface-west-arm': [[-2600, 219, -3500], [-1900, 219, -2600], [-1400, 219, -1900], [-1150, 219, -1350]],
    'west-arm-mid': [[-1850, 219, -2500], [-1400, 219, -1900], [-1150, 219, -1350]],
    'channel-low': [[-1150, 249, -4200], [-1100, 249, -1700]],
    'spray-dive': [[-600, 650, -100], [-760, 330, -560], [-900, 260, -860]],
    'chute-hunt': [[-720, 200, -380], [-880, 270, -780]],
    'gorge-hunt': [[-760, 200, 0], [-100, 260, -1300]],
  },
});
