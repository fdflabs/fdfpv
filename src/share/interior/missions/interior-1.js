/*
 * interior-1.js: The Interior, Mission 1, The Old War, as data for the
 * room's ops modules (src/share/ops/, docs/campaign/interior/
 * CONTRACT-P0.md). The authority is docs/campaign/interior/MISSIONS.md's
 * M1 section (from the owner's mission script v1.0): its stages (the
 * script's checkpoint names), triggers, objectives, recovery, dials,
 * stars, flags, roles and radio. Text is string keys only; the voices are
 * lines.json's, by line id. A primary objective's `guide` is the line its
 * role's guide says when it becomes a screen's objective (one id, or one
 * per role id; src/share/ops/guide.js).
 *
 * Positions are the ops frame (z up, metres). The places are WORLD's
 * (src/share/interior/places.js, routes.js: docs/campaign/interior/
 * WORLD.md section 5 lists where the land moved MISSIONS.md 1.9's
 * layout), turned into the ops frame by P() through frame.js; a few
 * points WORLD does not name are written on the design grid through G()
 * and ORIGIN ([8000, 8000]). The mission is `ground`: every z here is
 * metres over the ground, which the room adds (src/share/ops/missions.js).
 *
 * ROUTES it names (WORLD's ids, routes.js ROUTES):
 *   conceal-{west,mid,east}-{a,b}      the pair, forest edge to camp edge,
 *                                      through the narrow opening
 *   conceal-{west,mid,east}-alt-{a,b}  each route's alternate from its
 *                                      reacquisition point (ALT_POINTS)
 *   <id>-loop (camp-look-loop ...)    each camp person's loop;
 *                                      camp-tarp-move-s1/-s2/-s3 the tarp
 *                                      at the marked shelter (the dial)
 *   out-{n,e,s,w}-{a,b}, pair-out-{a,b} the dispersal into the forest,
 *                                      over when its walker is gone
 *   bravo-moto                         the motorcycle on the colonia's road
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

import { threePosToDoc } from '../../../render/frame.js';
import { ORIGIN } from '../ops.js';
import {
  BUILDINGS, CAMP_PROPS, CROSSINGS, PLACES,
} from '../places.js';
import { ALT_POINTS, CONCEAL_POINTS, ROUTES } from '../routes.js';
import { M1_CLOCK, sunsetMs } from '../clock.js';
import { FILMS, briefingMs } from '../films/index.js';

/* The design grid's south west corner, metres west and south of the ops
 * frame's origin (docs/campaign/interior/WORLD.md section 2). */
export { ORIGIN };
/* A grid point (km east, km north) in ops frame metres. */
export const G = (e, n) => [Math.round(e * 1000 - ORIGIN[0]), Math.round(n * 1000 - ORIGIN[1])];
/* A place WORLD authored (scene metres [x, z], places.js and routes.js)
 * in the ops frame, h metres over the ground (the mission is `ground`:
 * the room adds the ground's height, src/share/ops/missions.js). */
const P = ([x, z], h = 0) => {
  const d = threePosToDoc(x, 0, z, {});
  return [Math.round(d.x * 100) / 100, Math.round(d.y * 100) / 100, h];
};
const P2 = (at) => P(at).slice(0, 2);
/* A named point along the concealment routes (routes.js CONCEAL_POINTS). */
const ALONG = (name) => P2(ROUTES['conceal-west-a'].pts[CONCEAL_POINTS[name]]);
const ALT_AT = (k) => P2(ROUTES[`conceal-${k}-alt-a`].pts[ALT_POINTS.reacquire]);
const CAMP_AT = CAMP_PROPS.middle;
const SHELTER = Object.fromEntries(CAMP_PROPS.shelters.map((x) => [x.id, x]));
/* The unit horizontal direction, ops frame, from the camp's middle out
 * through a shelter: the side its roof's underside is seen from. */
function outward(id) {
  const [a, b] = [P2(CAMP_AT), P2(SHELTER[id].at)];
  const n = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
  return [Math.round(((b[0] - a[0]) / n) * 1000) / 1000, Math.round(((b[1] - a[1]) / n) * 1000) / 1000];
}

/* The campaign's classes (BIBLE.md 6), unknown first: what a contact is on
 * its discovery. */
export const CLASSES = ['unknown', 'civilian', 'friendly', 'poi', 'column-linked', 'network-linked', 'hostile'];

/* The marked shelter (a dial): where the mark is, and the side its
 * roof's underside can be seen from (MISSIONS.md M1 stage 5: one bearing
 * band, at a depression under 35 degrees: tan 35 = 0.700). */
/* The mark's dial to the map's shelter: the one table both the room's
 * judging (SHELTERS) and the screen's painting (`camp` below) read. */
export const MARKED = { s1: 'shelter-1', s2: 'shelter-2', s3: 'shelter-3' };
export const SHELTERS = Object.fromEntries(Object.entries(MARKED)
  .map(([k, id]) => [k, { at: P(SHELTER[id].at, 1.5), dir: outward(id) }]));

const CAMP = ['camp-look', 'camp-tarp', 'camp-up', 'camp-mast', 'camp-moto-1', 'camp-moto-2', 'camp-1', 'camp-2'];
/* The dispersal (MISSIONS.md M1, routes): two a direction. */
const OUT = {
  n: ['camp-look', 'camp-up'], e: ['camp-mast', 'camp-tarp'], s: ['camp-moto-1', 'camp-1'], w: ['camp-moto-2', 'camp-2'],
};
/* The first direction to leave goes at once, the rest 20 s after (a dial). */
const FIRST_OUT_S = 20;

const BUILDING = (id) => BUILDINGS.find((b) => b.id === id);

/* The pair's loss thresholds (MISSIONS.md 1.7: 20 s and 45 s by default,
 * tuned per mission). Hard is 75 s here, a lead decision (reversible):
 * under WORLD's canopy an orbiting fixed wing about 150 m off the pair
 * sees it through gaps up to 57.6 to 58.1 s apart (canopy round #467),
 * so 60 s left two seconds; a pilot flying correctly
 * must never be moved to the alternate or soft failed for it. */
const PAIR_TRACK = { soft: 20, hard: 75 };

const ISR_TRACKER = { role: ['isr', 'tracker'] };
const TRACKER = { role: ['tracker'] };
const GONE = { chosen: 'dispersal', is: 'started' };
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
  /* Every height here is over the ground; z0 is Pista Cero's ground. */
  ground: true,
  z0: 0,
  /* The briefing: Mission 1's intro film, held for its length, preload
   * and all (src/share/interior/films, docs/campaign/interior/FILMS.md). */
  filmMs: briefingMs('interior-1'),
  /* Which cut the briefing plays, so the host's skip waits until every
   * pilot here has seen it (CONTRACT-P0.md section 11). */
  film: { id: FILMS['int1-intro'].id, version: FILMS['int1-intro'].version },
  /* The hours of the day on the room clock (WORLD's clock.js): a screen
   * moves the sun by it, the light rule below ends at its sunset. */
  clock: M1_CLOCK,
  /* The marked shelter as the map names it, by the mark's dial, so the
   * screen paints the mark on the shelter the room judges (SHELTERS). */
  camp: { mark: { dial: 'mark', map: MARKED } },
  /* The items the debrief shows an analyst reconstruction for when nobody
   * captured them (M1_10): the required survey, the camp, and the mark. */
  debrief: {
    required: ['bridge', 'road', 'sheds', 'colonia', 'crossing', 'shelters', 'motorcycles', 'antenna', 'personnel', 'access', 'symbol'],
  },
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
      id: 'moto-road', kind: 'vehicle', look: 'motorcycle', group: 'bravo-civil', faction: 'civilian',
    },
    {
      id: 'pair-a', kind: 'person', group: 'pair', faction: 'column', track: PAIR_TRACK,
    },
    {
      id: 'pair-b', kind: 'person', group: 'pair', faction: 'column', track: PAIR_TRACK,
    },
    ...CAMP.map((id) => ({
      id, kind: 'person', group: 'camp', faction: 'column',
    })),
  ],
  items: [
    {
      id: 'bridge', set: 'alpha', at: P(PLACES.puenteDoble.at, 4), size: 60,
    },
    {
      /* One of two stretches of Ruta Vieja in Sector Alpha (a dial). */
      id: 'road', set: 'alpha', at: { dial: 'road', map: { north: [...G(4.98, 5.1), 0], south: [...G(4.6, 4.45), 0] } }, size: 40,
    },
    {
      id: 'sheds', set: 'alpha', at: P(BUILDING('alpha-shed-1').at, 5), size: 35,
    },
    {
      id: 'burned', set: 'alpha-optional', at: [...G(6.27, 5.27), 0], size: 300,
    },
    {
      id: 'colonia', set: 'bravo', at: P(PLACES.coloniaArroyoManso.at), size: 300,
    },
    {
      id: 'crossing', set: 'bravo', at: P(CROSSINGS[0].at, 1), size: 20,
    },
    {
      id: 'shelters', set: 'camp', at: P(CAMP_AT, 1.5), size: 30,
    },
    {
      id: 'motorcycles', set: 'camp', at: P(CAMP_PROPS.motorcycles[0].at, 0.6), size: 6,
    },
    {
      id: 'antenna', set: 'camp', at: P(CAMP_PROPS.mast.at, 5), size: 9,
    },
    {
      id: 'personnel', set: 'camp', contact: 'camp', size: 1.7,
    },
    {
      id: 'access', set: 'camp', at: [...G(8.565, 9.48), 0], size: 15,
    },
    {
      /* The lookout position by its foot and ladder, 2 m up: its deck
       * (7.5 m) is inside its own tree's crown and canopyBlocks hides it
       * from every side and from overhead; the foot shows through the
       * gaps at the clearing's edge. */
      id: 'lookout', set: 'camp-optional', at: P(CAMP_PROPS.lookout.at, 2), size: 5,
    },
    {
      id: 'solar', set: 'camp-optional', at: P(CAMP_PROPS.solar.at, 1), size: 2,
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
    'pista-cero': { at: P2(PLACES.pistaCero.at), r: 250 },
    corridor: { at: G(9.15, 8.45), r: 450 },
    'teacher-house': { at: P2(PLACES.teacherHouse.at), r: 12, z: 3 },
    'forest-edge': { at: ALONG('forest-edge'), r: 40 },
    opening: { at: ALONG('opening'), r: 25 },
    'camp-edge': { at: ALONG('camp-edge'), r: 25 },
  },
  sites: [{
    id: 'camp', at: P2(CAMP_AT), z0: 0, r: 400, below: 300, reach: 1500, rise: 0.05, fall: 0.01, levels: { wary: 0.5, high: 1 },
  }],
  dials: {
    conceal: ['west', 'mid', 'east'],
    mark: ['s1', 's2', 's3'],
    road: ['north', 'south'],
    firstOut: ['n', 'e', 's', 'w'],
  },
  /* The played square less WORLD's warning margin (places.js boundary). */
  boundary: { min: [-PLACES.boundary.warn, -PLACES.boundary.warn], max: [PLACES.boundary.warn, PLACES.boundary.warn] },
  lines: {
    boundary: { warning: 'int-boundary', final: 'int-boundary-final' },
    fail: 'int1-fail',
    take: 'int-take-role',
    downed: 'int-lost-aircraft',
  },
  /* The mission's fails beyond its stages' (MISSIONS.md M1, recovery and
   * fails): the ISR down with nobody else airborne, and the light gone
   * (clock.js: about 12 minutes after a first timer at 18 m/s would land,
   * so it ends a run that dawdled or got lost, not an ordinary one). */
  lost: [
    { when: { downed: ['isr'], alone: true }, why: 'isr-down', radio: 'int-fail-function' },
    { when: { clock: Math.round(sunsetMs(M1_CLOCK) / 1000) }, why: 'light', radio: 'int-fail-function' },
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
      cues: [{ at: 0, spawn: CAMP.map((id) => ({ id, route: `${id}-loop` })) }],
      objectives: [
        {
          id: 'launch', text: 'ops.interior.m1.obj.launch', tier: 'primary', done: { above: 500, roles: ['isr'] }, guide: { isr: 'int1-g-launch', tracker: 'int1-g-tr-launch' },
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
          id: 'alpha', text: 'ops.interior.m1.obj.alpha', tier: 'primary', done: { captured: { set: 'alpha' }, n: 3 }, guide: 'int1-g-alpha',
        },
        {
          id: 'burned', text: 'ops.interior.m1.obj.burned', tier: 'optional', done: { captured: 'burned' },
        },
        {
          id: 'bravo', text: 'ops.interior.m1.obj.bravo', tier: 'primary', after: 'alpha', done: { captured: { set: 'bravo' }, n: 2 }, guide: 'int1-g-bravo',
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
          id: 'charlie', text: 'ops.interior.m1.obj.charlie', tier: 'primary', done: { discovered: 'pair' }, guide: 'int1-g-charlie',
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
          search: { id: 'pair-search', at: ALONG('forest-edge'), r: 250 },
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
          id: 'observe', text: 'ops.interior.m1.obj.observe', tier: 'primary', done: { route: 'pair', point: 'camp-edge' }, guide: { isr: 'int1-g-follow', tracker: 'int1-g-tr-follow' },
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
          when: { lost: 'pair', s: PAIR_TRACK.hard },
          repeat: true,
          radio: { dial: 'conceal', map: { west: 'int1-s4-hard', mid: 'int1-s4-hard-b', east: 'int1-s4-hard' } },
          search: { id: 'pair-alt', at: { dial: 'conceal', map: { west: ALT_AT('west'), mid: ALT_AT('mid'), east: ALT_AT('east') } }, r: 200 },
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
      /* RETURN TO BASE comes with the dispersal (the script's M1_09), not
       * after the documentation: a camp gone early (its timer, an alert)
       * takes PERSONNEL with it. Listed first, so it is the guide's
       * focus once shown; documentation goes on beside it, and is missed
       * once the camp's people have all gone. */
      objectives: [
        {
          id: 'rtb', text: 'ops.interior.m1.obj.rtb', tier: 'primary', show: GONE, done: { landed: 'pista-cero', roles: ['isr'] }, guide: 'int1-g-rtb',
        },
        {
          id: 'document', text: 'ops.interior.m1.obj.document', tier: 'primary', done: { captured: { set: 'camp' }, n: 5 }, fail: { vanished: 'camp' }, guide: 'int1-g-camp',
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
      ],
      cues: [
        { at: 2, radio: ['int1-s5-nolow', 'int1-s5-record'] },
        { at: 4, radio: 'int1-tr-angle', heard: TRACKER },
        /* Once the dispersal has started nobody walks back into the camp
         * (the tarp's walk starts in it and ends there): the mark is
         * opened with the camp being stripped instead. */
        {
          when: { captured: { set: 'camp' }, n: 3 },
          at: 5,
          unless: GONE,
          move: [{ contacts: 'camp-tarp', route: { dial: 'mark', map: { s1: 'camp-tarp-move-s1', s2: 'camp-tarp-move-s2', s3: 'camp-tarp-move-s3' } } }],
          choose: { name: 'tarp', value: 'moved' },
        },
        { when: { all: [{ captured: { set: 'camp' }, n: 3 }, GONE] }, choose: { name: 'tarp', value: 'moved' } },
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
            /* No alternate on the way out: a hard threshold would send
             * the pair back along its concealment route to the camp. */
            { contacts: 'pair-a', route: 'pair-out-a', alt: null, after: 30 },
            { contacts: 'pair-b', route: 'pair-out-b', alt: null, after: 30 },
          ],
        },
        { when: DISPERSAL, radio: 'int1-tr-split', heard: TRACKER },
        { when: { alert: 'camp', level: 'high' }, unless: { captured: { set: 'camp' }, n: 5 }, radio: 'int1-s5-early' },
        { when: { vanished: 'camp', watched: true }, flag: 'M1_CAMP_FULLY_DOCUMENTED' },
      ],
      /* Home once the camp has gone: the debrief (M1_10) is the outro
       * over the squad's stills, VIEW's. */
      exits: [{ when: { all: [GONE, { landed: 'pista-cero', roles: ['isr'] }] }, to: 'won', why: 'landed' }],
    },
  ],
};
