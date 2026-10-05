/*
 * interior-1.js: The Interior, Mission 1, The Old War, as data for the
 * room's ops modules (src/share/ops/, docs/campaign/interior/
 * CONTRACT-P0.md). The authority is docs/campaign/interior/MISSIONS.md's
 * M1 section (from the owner's mission script v1.0): its stages (the
 * script's checkpoint names), triggers, objectives, recovery, dials,
 * stars, flags, roles and radio. Text is string keys only; the voices are
 * a later track and the line ids are the contract with it.
 *
 * Positions are the ops frame (z up, metres), written on MISSIONS.md
 * 1.9's design grid in km east and north of the map's south west corner
 * through G() and ORIGIN, the one number to change if track WORLD puts
 * the map's origin somewhere else. z0 is the ground under Pista Cero.
 *
 * ROUTES this mission asks WORLD for (poseOnRoute ids; the fixture in
 * src/share/ops/fixtures/interior-1.js stands in until they land):
 *   conceal-{west,mid,east}-{a,b}      the pair, forest edge to camp edge,
 *                                      through the narrow opening; end at
 *                                      the camp edge and stay
 *   conceal-{west,mid,east}-alt-{a,b}  each route's alternate from its
 *                                      reacquisition point (the cañada for
 *                                      west and east, a path crossing for
 *                                      mid) to the camp edge
 *   camp-<id>-loop                     each camp person's loop in the
 *                                      clearing; camp-tarp-move the tarp
 *   out-{n,e,s,w}-{a,b}, pair-out-{a,b} the dispersal into the forest,
 *                                      over when its walker is gone
 *   bravo-moto                         the motorcycle on Ruta Vieja
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

/* The design grid's south west corner in the ops frame. */
export const ORIGIN = [0, 0];
/* A grid point (km east, km north) in ops frame metres. */
export const G = (e, n) => [Math.round(e * 1000 - ORIGIN[0]), Math.round(n * 1000 - ORIGIN[1])];
const G3 = (e, n, z = 0) => [...G(e, n), z];

/* The campaign's classes (BIBLE.md 6), unknown first: what a contact is on
 * its discovery. */
export const CLASSES = ['unknown', 'civilian', 'friendly', 'poi', 'column-linked', 'network-linked', 'hostile'];

/* The marked shelter (a dial): where the mark is, and the side its
 * roof's underside can be seen from (MISSIONS.md M1 stage 5: one bearing
 * band, at a depression under 35 degrees: tan 35 = 0.700). */
export const SHELTERS = {
  s1: { at: G3(11.88, 10.49, 2), dir: [-1, 0] },
  s2: { at: G3(11.91, 10.52, 2), dir: [0, 1] },
  s3: { at: G3(11.92, 10.48, 2), dir: [1, 0] },
};

const CAMP = ['camp-look', 'camp-tarp', 'camp-up', 'camp-mast', 'camp-moto-1', 'camp-moto-2', 'camp-1', 'camp-2'];
/* The dispersal (MISSIONS.md M1, routes): two a direction. */
const OUT = {
  n: ['camp-look', 'camp-up'], e: ['camp-mast', 'camp-tarp'], s: ['camp-moto-1', 'camp-1'], w: ['camp-moto-2', 'camp-2'],
};
/* The first direction to leave goes at once, the rest 20 s after (a dial). */
const FIRST_OUT_S = 20;

const ISR_TRACKER = { role: ['isr', 'tracker'] };
const TRACKER = { role: ['tracker'] };
const DISPERSAL = {
  any: [
    { captured: { set: 'camp' }, n: 5 },
    { time: 480 },
    { alert: 'camp', level: 'high' },
  ],
};

export default {
  id: 'interior-1',
  campaign: 'interior',
  title: 'ops.interior.m1.title',
  map: 'interior',
  z0: 0,
  /* No film yet (the films are a later track): no briefing hold. */
  filmMs: 0,
  classes: CLASSES,
  roles: [
    {
      id: 'isr', core: true, guide: 'IBARRA', platforms: ['bramor2300'],
    },
    {
      id: 'tracker', core: false, guide: 'IBARRA', platforms: ['bramor2300'],
    },
  ],
  contacts: [
    {
      id: 'moto-road', kind: 'vehicle', group: 'bravo-civil', faction: 'civilian',
    },
    {
      id: 'pair-a', kind: 'person', group: 'pair', faction: 'column', track: { soft: 20, hard: 45 },
    },
    {
      id: 'pair-b', kind: 'person', group: 'pair', faction: 'column', track: { soft: 20, hard: 45 },
    },
    ...CAMP.map((id) => ({
      id, kind: 'person', group: 'camp', faction: 'column',
    })),
  ],
  items: [
    {
      id: 'bridge', set: 'alpha', at: G3(5.6, 7.0, 4), size: 60,
    },
    {
      id: 'road', set: 'alpha', at: { dial: 'road', map: { north: G3(4.6, 5.95), south: G3(4.2, 5.62) } }, size: 40,
    },
    {
      id: 'sheds', set: 'alpha', at: G3(5.5, 4.0, 6), size: 35,
    },
    {
      id: 'burned', set: 'alpha-optional', at: G3(6.3, 3.6), size: 90,
    },
    {
      id: 'colonia', set: 'bravo', at: G3(8.5, 7.5), size: 300,
    },
    {
      id: 'crossing', set: 'bravo', at: G3(8.6, 7.3, 2), size: 25,
    },
    {
      id: 'shelters', set: 'camp', at: G3(11.9, 10.5, 2), size: 25,
    },
    {
      id: 'motorcycles', set: 'camp', at: G3(11.93, 10.47, 1), size: 6,
    },
    {
      id: 'antenna', set: 'camp', at: G3(11.88, 10.53, 4), size: 8,
    },
    {
      id: 'personnel', set: 'camp', contact: 'camp', size: 1.7,
    },
    {
      id: 'access', set: 'camp', at: G3(11.88, 10.46), size: 15,
    },
    {
      id: 'lookout', set: 'camp-optional', at: G3(11.9, 10.56, 6), size: 5,
    },
    {
      id: 'solar', set: 'camp-optional', at: G3(11.91, 10.51, 1), size: 2,
    },
    {
      id: 'symbol',
      set: 'camp-optional',
      at: { dial: 'mark', map: Object.fromEntries(Object.entries(SHELTERS).map(([k, v]) => [k, v.at])) },
      size: 2,
      view: { dir: { dial: 'mark', map: Object.fromEntries(Object.entries(SHELTERS).map(([k, v]) => [k, v.dir])) }, cos: 0.866, tanDep: 0.7 },
      /* Shown to any angle once a camp person moves the tarp. */
      open: { chosen: 'tarp', is: 'moved' },
    },
  ],
  points: {
    'pista-cero': { at: G(3.0, 2.0), r: 150 },
    corridor: { at: G(10.1, 8.6), r: 500 },
    'teacher-house': { at: G(8.9, 7.9), r: 12, z: 3 },
    'forest-edge': { at: G(10.8, 9.1), r: 60 },
    opening: { at: G(11.3, 9.8), r: 30 },
    'camp-edge': { at: G(11.85, 10.38), r: 40 },
  },
  sites: [{
    id: 'camp', at: G(11.9, 10.5), z0: 0, r: 400, below: 300, reach: 1500, rise: 0.05, fall: 0.01, levels: { wary: 0.5, high: 1 },
  }],
  dials: {
    conceal: ['west', 'mid', 'east'],
    mark: ['s1', 's2', 's3'],
    road: ['north', 'south'],
    firstOut: ['n', 'e', 's', 'w'],
  },
  boundary: { min: G(1.5, 1.0), max: G(13.5, 12.0) },
  lines: {
    boundary: { warning: 'int-boundary', final: 'int-boundary-final' },
    fail: 'int1-fail',
    take: 'int-take-role',
    downed: 'int-lost-aircraft',
  },
  /* The mission's fails beyond its stages' (MISSIONS.md M1, recovery and
   * fails): the ISR down with nobody else airborne, and the light gone
   * (two minutes past the latest the script can need: a broken run). */
  lost: [
    { when: { downed: ['isr'], alone: true }, why: 'isr-down', radio: 'int-fail-function' },
    { when: { clock: 2700 }, why: 'light', radio: 'int-fail-function' },
  ],
  stars: [
    { id: 'symbol', card: 'symbol', when: { captured: 'symbol', grade: 'usable' } },
    { id: 'camp', card: 'distant', when: { flag: 'M1_CAMP_FULLY_DOCUMENTED' } },
    { id: 'eyes', card: null, when: { captured: ['burned', 'lookout', 'solar'] } },
  ],
  stages: [
    {
      id: 'M1_CP_START',
      title: 'ops.interior.m1.s1',
      /* Shown once each and cleared by the screen (VIEW): the room cannot
       * see a mode switch or a map opened. */
      tutorial: ['ops.tut.launch', 'ops.tut.climb', 'ops.tut.eo_thermal', 'ops.tut.map'],
      /* The camp is there from the start, its people on their loops. */
      cues: [{ at: 0, spawn: CAMP.map((id) => ({ id, route: `camp-${id}-loop` })) }],
      objectives: [
        {
          id: 'launch', text: 'ops.interior.m1.obj.launch', tier: 'primary', done: { above: 500, roles: ['isr'] },
        },
        { id: 'rule', text: 'ops.rule.no_engagement', tier: 'rule' },
      ],
      exits: [{ when: { above: 500, roles: ['isr'] }, to: 'next' }],
    },
    {
      id: 'M1_CP_AIRBORNE',
      title: 'ops.interior.m1.s2',
      objectives: [
        {
          id: 'alpha', text: 'ops.interior.m1.obj.alpha', tier: 'primary', done: { captured: { set: 'alpha' }, n: 3 },
        },
        {
          id: 'burned', text: 'ops.interior.m1.obj.burned', tier: 'optional', done: { captured: 'burned' },
        },
        {
          id: 'bravo', text: 'ops.interior.m1.obj.bravo', tier: 'primary', after: 'alpha', done: { captured: { set: 'bravo' }, n: 2 },
        },
      ],
      cues: [
        {
          at: 0, radio: ['int1-s1-clean', 'int1-s1-proceed'], card: 'card.primary_updated', spawn: [{ id: 'moto-road', route: 'bravo-moto' }],
        },
        { at: 1, radio: 'int1-tr-assign', heard: TRACKER },
        { when: { captured: { set: 'alpha' }, n: 1 }, radio: 'int1-s2-hold', heard: ISR_TRACKER },
        { when: { captured: { set: 'alpha' }, n: 3 }, radio: 'int1-s2-alpha', card: 'card.primary_updated' },
        { when: { captured: 'burned' }, radio: ['int1-s2-burned-1', 'int1-s2-burned-2', 'int1-s2-burned-3', 'int1-s2-burned-4', 'int1-s2-burned-5'] },
        { when: { dwell: 'teacher-house', s: 4 }, radio: ['int1-s2-teacher-1', 'int1-s2-teacher-2', 'int1-s2-teacher-3', 1.5, 'int1-s2-teacher-4'] },
        {
          when: { discovered: 'moto-road' }, at: 3, classify: { contacts: 'moto-road', to: 'civilian', why: 'ev.public_road' }, card: 'card.classification_updated',
        },
      ],
      /* Bravo may be surveyed in parallel by a tracker (MISSIONS.md M1,
       * roles): the stage ends when both sectors are in. */
      exits: [{ when: { all: [{ captured: { set: 'alpha' }, n: 3 }, { captured: { set: 'bravo' }, n: 2 }] }, to: 'next' }],
    },
    {
      id: 'M1_CP_BRAVO_COMPLETE',
      title: 'ops.interior.m1.s3',
      objectives: [
        {
          id: 'charlie', text: 'ops.interior.m1.obj.charlie', tier: 'primary', done: { discovered: 'pair' },
        },
      ],
      cues: [
        { at: 0, radio: 'int1-s2-charlie', card: 'card.primary_updated' },
        /* The anomaly: 5 to 20 s (a seeded window) after an ISR or a
         * tracker crosses the corridor. */
        {
          when: { zone: 'corridor', roles: ['isr', 'tracker'] },
          at: [5, 20],
          spawn: [
            { id: 'pair-a', route: { dial: 'conceal', map: { west: 'conceal-west-a', mid: 'conceal-mid-a', east: 'conceal-east-a' } }, alt: { dial: 'conceal', map: { west: 'conceal-west-alt-a', mid: 'conceal-mid-alt-a', east: 'conceal-east-alt-a' } } },
            { id: 'pair-b', route: { dial: 'conceal', map: { west: 'conceal-west-b', mid: 'conceal-mid-b', east: 'conceal-east-b' } }, alt: { dial: 'conceal', map: { west: 'conceal-west-alt-b', mid: 'conceal-mid-alt-b', east: 'conceal-east-alt-b' } } },
          ],
        },
        /* The discovery window: 25 s after they appear. */
        {
          when: { route: 'pair', point: 'forest-edge' },
          at: 25,
          unless: { discovered: 'pair' },
          radio: ['int1-s3-hold', 'int1-s3-bearing'],
          search: { id: 'pair-search', at: G(10.8, 9.1), r: 250 },
          card: 'card.search_area',
        },
        {
          when: { discovered: 'pair' }, at: 1.5, radio: ['int1-s3-class', 'int1-s3-none', 'int1-s3-road', 'int1-s3-notclass', 'int1-s3-follow'], unsearch: 'pair-search',
        },
      ],
      exits: [{ when: { discovered: 'pair' }, to: 'next', after: 8000 }],
    },
    {
      id: 'M1_CP_CONTACT_FOUND',
      title: 'ops.interior.m1.s4',
      objectives: [
        {
          id: 'observe', text: 'ops.interior.m1.obj.observe', tier: 'primary', done: { route: 'pair', point: 'camp-edge' },
        },
        { id: 'rule', text: 'ops.rule.no_engagement', tier: 'rule' },
      ],
      cues: [
        { at: 2, radio: 'int1-tr-picket', heard: TRACKER },
        { when: { lost: 'pair', s: 8 }, radio: 'int1-s4-welcome' },
        {
          when: { lost: 'pair', s: 20 }, repeat: true, radio: ['int1-s4-lost', 'int1-s4-pilot'], card: 'card.last_known', search: { id: 'pair-lkp', contact: 'pair', r: 150 },
        },
        {
          when: { reacquired: 'pair' }, repeat: true, radio: ['int1-s4-there', 1, 'int1-s4-goodeye'], unsearch: 'pair-lkp',
        },
        {
          when: { lost: 'pair', s: 45 },
          repeat: true,
          radio: { dial: 'conceal', map: { west: 'int1-s4-hard', mid: 'int1-s4-hard-b', east: 'int1-s4-hard' } },
          search: { id: 'pair-alt', at: { dial: 'conceal', map: { west: G(12.0, 9.8), mid: G(11.5, 10.2), east: G(12.05, 9.9) } }, r: 200 },
          card: 'card.search_area',
        },
        {
          when: { all: [{ route: 'pair', point: 'opening' }, { seen: 'pair', now: true }] },
          radio: ['int1-s4-armed', 'int1-s4-possible', 'int1-s4-comeon', 'int1-s4-rifle', 'int1-s4-know'],
          classify: { contacts: 'pair', to: 'poi', why: 'ev.long_objects' },
          card: 'card.intelligence_updated',
        },
      ],
      exits: [
        { when: { route: 'pair', point: 'camp-edge' }, to: 'next' },
        /* Three hard thresholds before the camp: the soft fail, played
         * again from this checkpoint (MISSIONS.md M1). */
        { when: { hards: 'pair', n: 3 }, to: 'lost', why: 'track' },
      ],
    },
    {
      id: 'M1_CP_CAMP_FOUND',
      title: 'ops.interior.m1.s5',
      objectives: [
        {
          id: 'document', text: 'ops.interior.m1.obj.document', tier: 'primary', done: { captured: { set: 'camp' }, n: 5 },
        },
        {
          id: 'lookout', text: 'ops.interior.m1.obj.lookout', tier: 'optional', done: { captured: 'lookout' },
        },
        {
          id: 'solar', text: 'ops.interior.m1.obj.solar', tier: 'optional', done: { captured: 'solar' },
        },
        {
          id: 'symbol', text: 'ops.interior.m1.obj.symbol', tier: 'optional', done: { captured: 'symbol', grade: 'usable' },
        },
        {
          id: 'distant', text: 'ops.interior.m1.obj.distant', tier: 'optional', done: { vanished: 'camp', watched: true },
        },
        {
          id: 'rtb', text: 'ops.interior.m1.obj.rtb', tier: 'primary', after: 'document', done: { landed: 'pista-cero', roles: ['isr'] },
        },
      ],
      cues: [
        { at: 2, radio: ['int1-s5-nolow', 'int1-s5-record'] },
        { at: 4, radio: 'int1-tr-angle', heard: TRACKER },
        {
          when: { captured: { set: 'camp' }, n: 3 }, at: 5, move: [{ contacts: 'camp-tarp', route: 'camp-tarp-move' }], choose: { name: 'tarp', value: 'moved' },
        },
        {
          when: { captured: 'symbol', grade: 'usable' },
          flag: 'M1_SYMBOL_CAPTURED',
          card: 'card.archive_searching',
          radio: ['int1-s5-receiving', 'int1-s5-weare', 'int1-s5-checking', 3, 'int1-s5-historical', 'int1-s5-column', 'int1-s5-years', 'int1-s5-answer', 'int1-s5-no', 1, 'int1-s5-remembers'],
          classify: [
            {
              contacts: ['camp', 'pair'], to: 'column-linked', label: 'ops.label.new_column_unconfirmed', why: 'ev.historical_mark',
            },
          ],
        },
        {
          when: DISPERSAL,
          choose: { name: 'dispersal', value: 'started' },
          text: 'ops.interior.m1.dispersal',
          radio: ['int1-s5-moving', 'int1-s5-high', 'int1-s5-people', 'int1-s5-noway', 'int1-s5-major', 'int1-s5-fivemin', 1, 'int1-s5-understand'],
          move: [
            ...Object.entries(OUT).map(([d, ids]) => ids.map((id, k) => ({
              contacts: id, route: `out-${d}-${'ab'[k]}`, after: { dial: 'firstOut', map: Object.fromEntries(Object.keys(OUT).map((x) => [x, x === d ? 0 : FIRST_OUT_S])) },
            }))).flat(),
            { contacts: 'pair-a', route: 'pair-out-a', after: 30 },
            { contacts: 'pair-b', route: 'pair-out-b', after: 30 },
          ],
        },
        { when: DISPERSAL, radio: 'int1-tr-split', heard: TRACKER },
        { when: { alert: 'camp', level: 'high' }, unless: { captured: { set: 'camp' }, n: 5 }, radio: 'int1-s5-early' },
        { when: { vanished: 'camp', watched: true }, flag: 'M1_CAMP_FULLY_DOCUMENTED' },
      ],
      /* Home once the camp has gone: the debrief (M1_10) is the outro
       * over the squad's stills, VIEW's. */
      exits: [{ when: { all: [{ chosen: 'dispersal', is: 'started' }, { landed: 'pista-cero', roles: ['isr'] }] }, to: 'won', why: 'landed' }],
    },
  ],
};
