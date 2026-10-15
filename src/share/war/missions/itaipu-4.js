/*
 * itaipu-4.js: Defend the Paraná, act 1, mission 4, "The Long Night"
 * (docs/campaign/MISSIONS.md M4): night one, from the middle of the night
 * to sunrise. The Aggressor has learned the cell's habits by day, and at
 * night it changes the game: boats with no lights, Hunters that come for
 * the pilots rather than the concrete, and long silences. Data, as
 * itaipu-1.js, which it takes its targets from, with First Light's floor
 * and stars. `night: true` is the flag the world reads (index.js
 * missionTime): every screen builds its world at night before the film
 * (edge/rooms/war.js WORLD_LEAD_MS), and war:twopage --mission=itaipu-4
 * checks it is night on both pages.
 *
 * THE STAGES, each a round, with the radio's story (MISSIONS.md M4 Radio):
 *   1  Quiet        nothing for 40 to 70 s, the HUD saying STAND BY; then
 *                   one boat with no lights on the water for the middle
 *                   intakes. Over when it is gone, killed or arrived
 *   2  Dark Water   boats on the water, two groups, each on a bearing of
 *                   its own drawn from WATER; a Loiterer from HIGH 30 to
 *                   50 s in
 *   3  Hunters      Hunters out of the gorge for the pilots, and Strikers
 *                   from the north 20 to 35 s in as cover, onto the
 *                   intakes while the squad is busy with them
 *   4  The Turn     one of three twists, drawn: A, Station dark (STATION_DARK
 *                   below); B, the towns, Strikers down
 *                   the west arm onto the switchyard, the right bank's
 *                   districts at stake in the dark (grid.js puts them out
 *                   on a hit), under a Loiterer onto the intakes; C, a
 *                   Scout with no lights circling over the islands, under
 *                   Strikers from the north east. The Scout is the
 *                   mission's only one: while it lives or once it has
 *                   gone home, stage 5 flies its routes exactly, and only
 *                   once it is killed does each attacker draw its error
 *                   (edge/rooms/war.js births), so "kill it or the dawn
 *                   comes in exact" is the room's own rule, not a line
 *   5  Before Dawn  the night's hardest convergence: Strikers from the
 *                   north, boats on the water, a swarm up the gorge onto
 *                   the penstocks, a Loiterer, and Hunters among them
 * A stage lost (no pilot left flying) lets what is alive through and the
 * next comes; the mission is won when the fifth ends with the output at
 * or over the floor, lost the instant it falls under, and a lost mission
 * restarts from the stage it was lost in (war.js, two stars at most).
 *
 * TWIST A (Station dark: the crest's floodlights off by order, and the
 * stage's groups given their error as if a Scout were dead) is
 * STATION_DARK below.
 *
 * THE DAWN rises across stage 5 (TECH-NEEDS T1.11): Before Dawn's
 * `daytime` runs the room's clock from the night to the morning
 * (src/share/daytime.js missionClock).
 *
 * THE RADIO is the stages' cues (MISSIONS.md M4 Radio: CREST, MIRADOR,
 * TALLER, DESPACHO), the countdown's two lines and the debriefs
 * (`radio`). Four of MISSIONS.md's lines say what the night here does not
 * show, a boat or a Scout with no lights and every bird's nav lights off
 * (every attacker wears its own at night, src/render/attackers.js), the
 * sky going grey (no dawn ramp), so they are said otherwise (lines.json
 * notes). The film is films/long-night.js, and a win ends on
 * films/long-night-outro.js. The `itaipu-4-g-*` cues are the guide, as
 * First Light's (docs/campaign/FIRST-LIGHT-AUDIT.md): CREST saying
 * plainly what to do, after the story line it follows, dropped once its
 * objective settles.
 *
 * THE DIALS (MISSIONS.md 1.4), as First Light's: each group's sector and
 * route in it, its time in a window, the twist. `pace` stretches every
 * time for a small squad (MISSIONS.md 1.6), `adapt` weights the bearings
 * away from where the squad killed most last stage.
 *
 * THE ROUTES, y up, scene metres (-z is north); the intakes are in the
 * powerhouse's upstream face, x -194 to 435, z -1828 to -1684:
 *   surface-*, east-shore-water
 *                 boats on the reservoir's surface, 219.0 m, to the face:
 *                 from the north east (surface-east, east-shore-water,
 *                 First Light's), down the middle (surface-mid) and from
 *                 the west of the open water (surface-west)
 *   reservoir-*   Strikers 30 m over the reservoir from the north onto the
 *                 intakes; reservoir-west and reservoir-west-far down the
 *                 west arm and over the right bank to the switchyard
 *   east-shore-*  in over the east arm of the reservoir
 *   high-*        Loiterers at 650 to 700 m, a circle, then the dive
 *   gorge         the swarm up the river from the south onto the penstocks
 *   gorge-hunt    where the Hunters are born, in the gorge 1.5 km below
 *                 the dam, and their home over the gorge's head
 *   islands-orbit twist C's Scout, circling 250 m over the open water
 *                 north of the powerhouse
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

const INTAKES_WEST = ids('intake', [0, 1, 2, 3, 4, 5, 6]);
const INTAKES_MID = ids('intake', [7, 8, 9, 10, 11, 12]);
const INTAKES_EAST = ids('intake', [13, 14, 15, 16, 17, 18, 19]);

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
 * open (stages 3 and 5), the exit still waiting for every other group to
 * be gone: two and a half minutes, about when stage 3's cover arrives at
 * the soonest (born 20 s in, then 125 to 136 s of flight on the N
 * routes, routes.js plans). */
const HUNT_S = 150;
/* The dawn's ramp, ms: night at 22:00 to the morning's 07:47 (daytime.js
 * TIME_HOUR). The sun clears NIGHT_SIN about four fifths of the way in,
 * 190 s after Before Dawn opens, so a stage that runs its Hunters' HUNT_S
 * and the flights after it ends in the grey before sunrise and a long
 * one in the first light; the sunrise itself is the outro film's. A
 * choice, not a measurement. */
const DAWN_MS = 240000;

/*
 * Twist A, Station dark (MISSIONS.md M4): CREST has the dam's own
 * floodlights put out to take the attackers' aim, so this stage's
 * attackers draw their error as if every scout were dead
 * (`stationDark`, edge/rooms/war.js births) and the dam goes dark
 * for everyone from the stage's start to the mission's end (the
 * view's stationDark, src/main.js). A swarm up the gorge onto the
 * penstocks, close defence in the dark, under Strikers from the north.
 * CREST makes the trade out loud as the stage opens (itaipu-4-ta-turn),
 * since the lights go then; the why and the guide wait for the swarm.
 */
export const STATION_DARK = {
  id: 'station-dark',
  round: true,
  title: 'war.stage.itaipu_4.turn',
  stationDark: true,
  spawns: [
    {
      at: [6, 12], kind: 'strike', n: 2, per: 0.75, route: { sector: 'N' }, target: INTAKES_MID, spread: 30, group: 'cover',
    },
    {
      at: [14, 22], kind: 'fpv', n: 3, per: 1, route: { sector: 'GORGE' }, target: ids('penstock', [4, 5, 6, 7, 8, 9, 10]), spread: 10, group: 'twist',
    },
  ],
  objectives: [{
    id: 'twist', text: 'war.obj.itaipu_4.station', kind: 'kill', show: { born: { group: 'twist' } }, done: { down: { group: 'twist' } }, fail: { leaked: 1, group: 'twist' },
  }],
  cues: [
    { at: 1, radio: 'itaipu-4-ta-turn' },
    { when: { born: { group: 'twist' } }, radio: 'itaipu-4-ta-why' },
    { when: { born: { group: 'twist' } }, at: 4, radio: 'itaipu-4-g-dark', skip: { down: { group: 'twist' } } },
    STAGE_LOST,
  ],
  exits: exits({ cleared: true }, 'before-dawn', BEAT(20, 20)),
};

export default withWaves({
  id: 'itaipu-4',
  /* Act 1's mission 4 (index.js, the campaign's fields). */
  act: 1,
  order: 4,
  key: 'night',
  free: false,
  release: 'development',
  /* A string key (src/strings): The Long Night. */
  title: 'war.mission.itaipu_4',
  map: 'itaipu',
  /* Minutes, low and high, a squad takes (docs/campaign/MISSIONS.md 2);
   * Operations' briefing shows it (src/ui/briefing.js). From the room:
   * war:stages' ten good bot games end 12.1 to 15.6 minutes after the go,
   * the closures' waits apart, with twist A in the draw (2026-10-14;
   * 11.0 to 14.9 before it), against MISSIONS.md's first guess of 12 to
   * 16. */
  estimatedMinutes: [11, 16],
  targets,
  output: 14000,
  floorMw: 7700,
  starMw: 11200,
  airframes: 4,
  night: true,
  radio: { brief: ['itaipu-4-s0-brief', 'itaipu-4-s0-rules'], win: 'debrief-itaipu-4-win', lose: 'debrief-itaipu-4-lose' },
  film: 'long-night',
  /* The film a win ends on (films/long-night-outro.js). */
  outro: 'long-night-outro',
  /* The countdown's extra length (war.js start). A briefing builds every
   * screen's night world before its film (WORLD_LEAD_MS); a start with no
   * film, a restart from a stage among them, builds it in the countdown,
   * and a screen seats its pilot only once that is done. Measured in
   * war:twopage when the rebuild was the countdown's: 2.7 to 4.1 s idle,
   * 6.1 to 6.3 s with 16 other workers on the CPU, where with no extra
   * time it ended 0.3 s after the go and seated both pilots 1.7 s into
   * the war. */
  prepMs: 15000,
  /* CREST's nudge, as First Light's (docs/campaign/WAR-NUDGE.md). */
  nudge: true,
  /* When the face opens (src/share/war/contain.js, MISSIONS.md 1.9): the
   * mission's own line after the opening is called. */
  contain: { op: 'itaipu-4-op' },
  pace: { 1: 1.6, 2: 1.3, 3: 1.3 },
  adapt: true,
  sectors: {
    N: ['reservoir-mid', 'reservoir-east', 'reservoir-nne'],
    NW: ['reservoir-west', 'reservoir-west-far'],
    NE: ['east-shore-low', 'east-shore-high'],
    HIGH: ['high-east', 'high-west', 'high-north'],
    WATER: ['surface-east', 'east-shore-water', 'surface-mid', 'surface-west'],
    GORGE: ['gorge'],
  },
  stages: [
    {
      id: 'quiet',
      round: true,
      title: 'war.stage.itaipu_4.quiet',
      spawns: [
        {
          at: [40, 70], kind: 'boat', n: 1, per: 0, route: { sector: 'WATER' }, target: INTAKES_MID, spread: 15, group: 'boat',
        },
      ],
      /* Nothing on the HUD but STAND BY until the boat is born; then the
       * boat. */
      objectives: [{
        id: 'boat', text: 'war.obj.itaipu_4.boat', kind: 'kill', show: { born: { group: 'boat' } }, done: { down: { group: 'boat' } }, fail: { leaked: 1, group: 'boat' },
      }],
      cues: [
        { at: 0, text: 'war.obj.itaipu_4.stand_by' },
        { at: 0, radio: 'itaipu-4-g-standby' },
        { at: 20, radio: 'itaipu-4-s1-quiet' },
        { at: 34, radio: 'itaipu-4-s1-long', skip: { born: { group: 'boat' } } },
        { when: { born: { group: 'boat' } }, text: null },
        { when: { born: { group: 'boat' } }, at: 3, radio: 'itaipu-4-s1-boat' },
        { when: { born: { group: 'boat' } }, at: 7, radio: 'itaipu-4-g-boat', skip: { any: [{ down: { group: 'boat' } }, { leaked: 1, group: 'boat' }] } },
        { when: { down: { group: 'boat' } }, radio: 'itaipu-4-s1-down' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'dark-water', BEAT(10, 10)),
    },
    {
      id: 'dark-water',
      round: true,
      title: 'war.stage.itaipu_4.dark_water',
      spawns: [
        {
          at: [4, 8], kind: 'boat', n: 1, per: 0.5, route: { sector: 'WATER' }, target: INTAKES_WEST, spread: 15, group: 'boats',
        },
        {
          at: [14, 22], kind: 'boat', n: 1, per: 0.5, route: { sector: 'WATER' }, target: INTAKES_EAST, spread: 15, group: 'boats-2',
        },
        {
          at: [30, 50], kind: 'loiter', n: 1, per: 0.5, route: { sector: 'HIGH' }, target: INTAKES_MID, spread: 25, group: 'high',
        },
      ],
      objectives: [{ id: 'intakes', text: 'war.obj.protect_intakes', kind: 'protect' }],
      cues: [
        { at: 1, radio: 'itaipu-4-s2-water' },
        { at: 2, radio: 'itaipu-4-g-intakes' },
        { when: { born: { group: 'boats-2' } }, at: 2, radio: 'itaipu-4-s2-split' },
        { when: { born: { group: 'high' } }, at: 2, radio: 'itaipu-4-s2-high' },
        { when: { cleared: true }, radio: 'itaipu-4-s2-clear' },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'hunters', BEAT(15, 15)),
    },
    {
      id: 'hunters',
      round: true,
      title: 'war.stage.itaipu_4.hunters',
      spawns: [
        {
          at: [6, 12], kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt', group: 'hunters',
        },
        {
          at: [20, 35], kind: 'strike', n: 2, per: 0.75, route: { sector: 'N' }, target: [...INTAKES_MID, ...INTAKES_EAST], spread: 30, group: 'cover',
        },
      ],
      objectives: [
        { id: 'intakes', text: 'war.obj.protect_intakes', kind: 'protect' },
        {
          id: 'hunters', text: 'war.obj.itaipu_4.hunters', kind: 'kill', show: { born: { group: 'hunters' } }, done: { down: { group: 'hunters' } },
        },
      ],
      cues: [
        { when: { born: { group: 'hunters' } }, radio: 'itaipu-4-s3-hunt' },
        { when: { born: { group: 'hunters' } }, at: 4, radio: 'itaipu-4-s3-pairs' },
        { when: { born: { group: 'hunters' } }, at: 8, radio: 'itaipu-4-g-hunters', skip: { down: { group: 'hunters' } } },
        { when: { born: { group: 'cover' } }, at: 2, radio: 'itaipu-4-s3-cover' },
        { when: { down: { group: 'hunters' } }, radio: 'itaipu-4-s3-down' },
        STAGE_LOST,
      ],
      /* Survive: over when the cover is gone and the Hunters are down or
       * HUNT_S have passed. A Hunter lives until it is killed (warhunt.js
       * steers it home when it has nobody to chase), so a stage that
       * waited for every one of them to die would never end for a squad
       * that kept away from them. Not while the face is closing
       * (MISSIONS.md 1.9 point 4): it waits for the closure's hold. */
      exits: exits({
        all: [{ gone: { group: 'cover' } }, { any: [{ down: { group: 'hunters' } }, { time: HUNT_S }] }, { contained: true }],
      }, { pick: ['station-dark', 'towns', 'dark-scout'] }, BEAT(15, 15)),
    },
    {
      id: 'towns',
      round: true,
      title: 'war.stage.itaipu_4.turn',
      spawns: [
        {
          at: [4, 8], kind: 'loiter', n: 1, per: 0.5, route: { sector: 'HIGH' }, target: INTAKES_EAST, spread: 25, group: 'cover',
        },
        {
          at: [10, 18], kind: 'strike', n: 2, per: 0.75, route: { sector: 'NW' }, target: 'yard-right', spread: 60, group: 'twist',
        },
      ],
      objectives: [{
        id: 'twist', text: 'war.obj.itaipu_4.yard', kind: 'kill', show: { born: { group: 'twist' } }, done: { down: { group: 'twist' } }, fail: { leaked: 1, group: 'twist' },
      }],
      cues: [
        { when: { born: { group: 'twist' } }, radio: 'itaipu-4-tb-turn' },
        { when: { born: { group: 'twist' } }, at: 6, radio: 'itaipu-4-tb-why' },
        { when: { born: { group: 'twist' } }, at: 10, radio: 'itaipu-4-g-yard', skip: { down: { group: 'twist' } } },
        STAGE_LOST,
      ],
      exits: exits({ cleared: true }, 'before-dawn', BEAT(20, 20)),
    },
    {
      id: 'dark-scout',
      round: true,
      title: 'war.stage.itaipu_4.turn',
      spawns: [
        {
          at: [4, 8], kind: 'scout', n: 1, per: 0, route: 'islands-orbit', group: 'twist',
        },
        {
          at: [14, 22], kind: 'strike', n: 2, per: 0.75, route: { sector: ['NE', 'N'] }, target: INTAKES_EAST, spread: 30, group: 'cover',
        },
      ],
      objectives: [{
        id: 'twist', text: 'war.obj.itaipu_4.scout', kind: 'kill', show: { born: { group: 'twist' } }, done: { down: { group: 'twist' } }, fail: { left: 1, group: 'twist' },
      }],
      cues: [
        { when: { born: { group: 'twist' } }, at: 3, radio: 'itaipu-4-tc-turn' },
        { when: { born: { group: 'twist' } }, at: 7, radio: 'itaipu-4-tc-why' },
        { when: { born: { group: 'twist' } }, at: 11, radio: 'itaipu-4-g-scout', skip: { any: [{ down: { group: 'twist' } }, { left: 1, group: 'twist' }] } },
        { when: { down: { group: 'twist' } }, radio: 'itaipu-4-tc-down' },
        STAGE_LOST,
      ],
      /* Over, as First Light's Eyes, when the Scout is killed, gone home
       * or 80 s have passed, and nothing else is left: a stage that ended
       * with its cover would take the Scout with it before a pilot could
       * climb to it. */
      exits: exits({
        all: [{ any: [{ down: { group: 'twist' } }, { left: 1, group: 'twist' }, { time: 80 }] }, { cleared: true }],
      }, 'before-dawn', BEAT(20, 20)),
    },
    STATION_DARK,
    {
      id: 'before-dawn',
      round: true,
      title: 'war.stage.itaipu_4.before_dawn',
      /* Dawn across the last stage (MISSIONS.md M4; src/share/daytime.js
       * missionClock): the room's clock runs from the night to the
       * morning over DAWN_MS. */
      daytime: { to: 'morning', ms: DAWN_MS },
      spawns: [
        {
          at: [2, 6], kind: 'boat', n: 2, per: 1, route: { sector: 'WATER' }, target: [...INTAKES_WEST, ...INTAKES_MID], spread: 15, group: 'boats',
        },
        {
          at: [10, 16], kind: 'loiter', n: 1, per: 0.75, route: { sector: 'HIGH' }, target: INTAKES_MID, spread: 25, group: 'high',
        },
        {
          at: [20, 28], kind: 'strike', n: 2, per: 1.5, route: { sector: 'N' }, target: [...INTAKES_MID, ...INTAKES_EAST], spread: 30, group: 'face',
        },
        {
          at: [26, 34], kind: 'hunter', n: 1, per: 0.5, route: 'gorge-hunt', group: 'hunters',
        },
        {
          at: [32, 40], kind: 'fpv', n: 4, per: 1.5, route: { sector: 'GORGE' }, target: ids('penstock', [0, 1, 2, 3, 15, 16, 17, 18]), spread: 10, group: 'swarm',
        },
      ],
      objectives: [{ id: 'all', text: 'war.obj.protect_all', kind: 'protect' }],
      cues: [
        { when: { born: {} }, radio: 'itaipu-4-s5-all' },
        { when: { born: {} }, at: 4, radio: 'itaipu-4-s5-order' },
        { when: { born: {} }, at: 8, radio: 'itaipu-4-g-all' },
        { at: 45, radio: 'itaipu-4-s5-near' },
      ],
      /* The last: lost or held, the mission is won if the output is still
       * over the floor when it ends (as First Light's). Its Hunters, as
       * stage 3's, end it when they are down or HUNT_S have passed, and
       * a closure running holds it as stage 3's. */
      exits: exits({
        all: [
          ...['boats', 'high', 'face', 'swarm'].map((group) => ({ gone: { group } })),
          { any: [{ down: { group: 'hunters' } }, { time: HUNT_S }] },
          { contained: true },
        ],
      }, 'won', 0, 'waves'),
    },
  ],
  routes: {
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
    'surface-mid': [[300, 219, -4200], [100, 219, -2900], [100, 219, -2000]],
    'surface-west': [[-1300, 219, -3200], [-800, 219, -2500], [-250, 219, -1980]],
    'islands-orbit': [[900, 470, -3600], [600, 470, -2700]],
    'gorge-hunt': [[-760, 200, 0], [-100, 260, -1300]],
  },
});
