/*
 * interior-2.js: The Interior, Mission 2, Eyes in the Forest, as data for
 * the room's ops modules (src/share/ops/, docs/campaign/interior/
 * CONTRACT-P0.md). The authority is docs/campaign/interior/MISSIONS.md's
 * M2 section; what is built here and what is not is CONTRACT-M2.md.
 * Text is string keys only; the radio is lines.json's, by line id (the
 * int2 voices are not generated yet: a screen plays nothing for an id it
 * does not have).
 *
 * Positions are the ops frame (z up, metres, over the ground: the
 * mission is `ground`). Mission 2's places are routes.js M2_AT on the
 * design grid, through G(); Claro Viejo's are WORLD's (places.js).
 *
 * ROUTES it names (routes.js, `m2-` prefixed):
 *   m2-watch-{cruce,loma,corral}       a watcher parked at his spot
 *   m2-ride-<zone>-{n,s}               the required watcher to a handoff
 *   m2-second-{n,s}, m2-b-{n,s}        the second person, then on foot
 *                                      to Estancia La Ceniza (Contact B)
 *   m2-a-{n,s}                         Contact A on to another post
 *   m2-courier                         A's post to the property
 *   m2-civ-{farmer,fence,rider}        the zones' civilians
 *   m2-convoy-{1,2,3}                  the friendly convoy
 *   m2-returner-{foot,moto}[-fast]     the returner, calm or seen
 *   m2-nuevo-{1..6}-{a,b}              Claro Nuevo's six by layout
 *   m2-old-courier                     the older contact's visit
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
import { CAMP_PROPS, PLACES } from '../places.js';
import { M2_AT } from '../routes.js';
import { CLASSES } from './interior-1.js';

/* A grid point (km east, km north) in ops frame metres. */
const G = (e, n) => [Math.round(e * 1000 - ORIGIN[0]), Math.round(n * 1000 - ORIGIN[1])];
const GA = (k) => G(...M2_AT[k]);
/* A place WORLD authored (scene [x, z]) in the ops frame, h over the ground. */
const P = ([x, z], h = 0) => {
  const d = threePosToDoc(x, 0, z, {});
  return [Math.round(d.x * 100) / 100, Math.round(d.y * 100) / 100, h];
};
const P2 = (at) => P(at).slice(0, 2);

const ZONES = ['cruce', 'loma', 'corral'];
const HANDOFFS = ['n', 's'];
/* One dial for the required watcher's zone and the handoff point: every
 * route the watcher rides is a pair of them, and a dial maps one name. */
const WATCH = ZONES.flatMap((z) => HANDOFFS.map((h) => `${z}-${h}`));
const byWatch = (f) => ({ dial: 'watch', map: Object.fromEntries(WATCH.map((w) => [w, f(...w.split('-'))])) });
/* The two optional watchers sit in the zones the dial left. */
const others = (z) => ZONES.filter((x) => x !== z);

const TRANSIT_S = (at) => {
  const [a, b] = [P2(PLACES.pistaCero.at), at];
  return Math.round(60 + Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) / 18);
};
/* MISSIONS.md M2 recovery: 20 s soft, 45 s hard. No authored alternate
 * yet (CONTRACT-M2.md gap 9), so a hard threshold only searches. */
const TRACK = { soft: 20, hard: 45 };
const NUEVO = [1, 2, 3, 4, 5, 6].map((k) => `nuevo-${k}`);
const DETECTED = { chosen: 'detected', is: 'yes' };
const RECON = { role: ['recon'] };
const ISR_TRACKER = { role: ['isr', 'tracker'] };

export default {
  id: 'interior-2',
  campaign: 'interior',
  title: 'ops.interior.m2.title',
  map: 'interior',
  ground: true,
  z0: 0,
  sensor: { palette: 'arctic' },
  debrief: {
    required: ['fire', 'cable', 'impressions', 'tracks', 'diagram', 'stash', 'radio', 'notes', 'nuevo_people', 'nuevo_vehicles', 'nuevo_comms', 'nuevo_overview'],
  },
  classes: CLASSES,
  roles: [
    {
      id: 'isr', core: true, guide: 'IBARRA', platforms: ['bramor2300'],
    },
    /* The recon quad: the owner picks it by feel under canopy (PLAN 6);
     * both kept quads are offered until then. */
    {
      id: 'recon', core: true, guide: 'IBARRA', platforms: ['7inch', '10inch'],
    },
    {
      id: 'tracker', core: false, guide: 'IBARRA', platforms: ['bramor2300'],
    },
  ],
  contacts: [
    {
      id: 'watcher', kind: 'vehicle', look: 'motorcycle', group: 'watchers', faction: 'column', track: TRACK,
    },
    { id: 'watch-opt-1', kind: 'vehicle', look: 'motorcycle', group: 'watchers', faction: 'column' },
    { id: 'watch-opt-2', kind: 'vehicle', look: 'motorcycle', group: 'watchers', faction: 'column' },
    {
      id: 'second', kind: 'person', group: 'handoff', faction: 'column', track: TRACK,
    },
    {
      id: 'courier', kind: 'vehicle', look: 'motorcycle', group: 'handoff', faction: 'column', track: TRACK,
    },
    { id: 'civ-farmer', kind: 'person', group: 'zone-civil', faction: 'civilian' },
    { id: 'civ-fence', kind: 'person', group: 'zone-civil', faction: 'civilian' },
    {
      id: 'civ-rider', kind: 'vehicle', look: 'motorcycle', group: 'zone-civil', faction: 'civilian',
    },
    ...[1, 2, 3].map((k) => ({
      id: `convoy-${k}`, kind: 'vehicle', look: 'pickup', group: 'convoy', faction: 'friendly',
    })),
    {
      id: 'returner', kind: 'person', group: 'returner', faction: 'column', track: TRACK,
    },
    ...NUEVO.map((id) => ({
      id, kind: 'person', group: 'nuevo', faction: 'column',
    })),
    { id: 'old-courier', kind: 'person', group: 'old', faction: 'column' },
  ],
  items: [
    /* The emptied Claro Viejo at close range (stage 1): small things the
     * quad must be within a few metres of to grade (capture.js CUTS). */
    {
      id: 'fire', set: 'camp-close', at: P(CAMP_PROPS.fire.at, 0.2), size: 0.8,
    },
    {
      id: 'cable', set: 'camp-close', at: P(CAMP_PROPS.mast.at, 0.3), size: 0.5,
    },
    {
      id: 'impressions', set: 'camp-close', at: P(CAMP_PROPS.motorcycles[0].at, 0.05), size: 1.2,
    },
    {
      id: 'tracks', set: 'camp-close', at: [...G(8.565, 9.48), 0.05], size: 1.5,
    },
    {
      id: 'diagram', set: 'camp-close', at: P(CAMP_PROPS.shelters[0].at, 1.2), size: 0.6,
    },
    /* The box on a contact at the handoff is the choice (stage 2). */
    {
      id: 'follow_a', set: 'choice', contact: 'watcher', size: 1.8,
    },
    {
      id: 'follow_b', set: 'choice', contact: 'second', size: 1.7,
    },
    /* Estancia La Ceniza, inside the house (stage 3, RECON). */
    {
      id: 'stash', set: 'property', at: [...GA('estancia'), 0.4], size: 0.7,
    },
    {
      id: 'radio', set: 'property', at: [...GA('estancia').map((v, k) => v + [3, 2][k]), 1], size: 0.4,
    },
    {
      id: 'notes', set: 'property', at: [...GA('estancia').map((v, k) => v + [-2, 3][k]), 1.6], size: 0.5,
    },
    /* Claro Nuevo (stage 4). */
    {
      id: 'nuevo_people', set: 'nuevo', contact: 'nuevo', size: 1.7,
    },
    {
      id: 'nuevo_vehicles', set: 'nuevo', at: [...GA('claroNuevo').map((v, k) => v + [5, 17][k]), 0.6], size: 4,
    },
    {
      id: 'nuevo_comms', set: 'nuevo', at: [...GA('claroNuevo').map((v, k) => v + [-4, 31][k]), 3], size: 3,
    },
    {
      id: 'nuevo_overview', set: 'nuevo', at: [...GA('claroNuevo'), 0], size: 60,
    },
    {
      id: 'comparison', set: 'nuevo-optional', contact: 'old-courier', size: 1.7,
    },
  ],
  points: {
    'pista-cero': { at: P2(PLACES.pistaCero.at), r: 250 },
    'claro-viejo': { at: P2(PLACES.claroViejo.at), r: 40 },
    'zone-cruce': { at: GA('cruce'), r: 300 },
    'zone-loma': { at: GA('loma'), r: 300 },
    'zone-corral': { at: GA('corral'), r: 300 },
    'handoff-n': { at: GA('handoffN'), r: 12 },
    'handoff-s': { at: GA('handoffS'), r: 12 },
    'post-a': { at: GA('postA'), r: 15 },
    'property-yard': { at: GA('yard'), r: 10 },
    'property-gate': { at: GA('gate'), r: 12 },
    'nuevo-edge': { at: GA('nuevoEdge'), r: 15 },
    'nuevo-middle': { at: GA('claroNuevo'), r: 10 },
  },
  /* The returner's ears and eyes at the property's gate, stage 3 on
   * (MISSIONS.md M2: the quad's sound within 15 m): a quad low over the
   * gate while he comes in is heard; the house's inside is 200 m away,
   * so the inspection before him is not. The view cone is not built
   * (CONTRACT-M2.md gap 8). */
  sites: [{
    id: 'property', stage: 'M2_CP_PROPERTY', at: GA('gate'), z0: 0, r: 15, below: 6, reach: 40, rise: 0.25, fall: 0.02, levels: { wary: 0.5, high: 1 },
  }],
  dials: {
    watch: WATCH,
    returner: ['foot', 'moto'],
    layout: ['a', 'b'],
  },
  boundary: { min: [-PLACES.boundary.warn, -PLACES.boundary.warn], max: [PLACES.boundary.warn, PLACES.boundary.warn] },
  lines: {
    boundary: { warning: 'int-boundary', final: 'int-boundary-final' },
    fail: 'int-fail-function',
    take: 'int-take-role',
    downed: 'int-lost-aircraft',
  },
  /* Every required platform lost (MISSIONS.md M2 fails). */
  lost: [
    { when: { downed: ['isr', 'recon'], alone: true }, why: 'isr-down', radio: 'int-fail-function' },
  ],
  stars: [
    { id: 'watchers', card: 'watchers', when: { flag: 'M2_ALL_WATCHERS_FOUND' } },
    { id: 'unseen', card: null, when: { flag: 'M2_SECOND_CAMP_UNDETECTED' } },
    { id: 'both', card: 'comparison', when: { captured: ['comparison', 'nuevo_vehicles', 'nuevo_comms'] } },
  ],
  stages: [
    {
      id: 'M2_CP_START',
      title: 'ops.interior.m2.s1',
      cues: [
        {
          at: 0,
          spawn: [
            { id: 'watcher', route: byWatch((z) => `m2-watch-${z}`) },
            { id: 'watch-opt-1', route: byWatch((z) => `m2-watch-${others(z)[0]}`) },
            { id: 'watch-opt-2', route: byWatch((z) => `m2-watch-${others(z)[1]}`) },
            { id: 'civ-farmer', route: 'm2-civ-farmer' },
            { id: 'civ-fence', route: 'm2-civ-fence' },
            { id: 'civ-rider', route: 'm2-civ-rider' },
            ...NUEVO.map((id, k) => ({ id, route: { dial: 'layout', map: { a: `m2-nuevo-${k + 1}-a`, b: `m2-nuevo-${k + 1}-b` } } })),
          ],
        },
        {
          when: { captured: 'diagram' },
          radio: ['int2-s1-notmap', 'int2-s1-road', 'int2-s1-points'],
        },
        { when: { captured: 'diagram' }, at: 4, radio: 'int2-s1-back', heard: { role: ['isr'] } },
        { when: { captured: { set: 'camp-close' }, n: 5 }, card: ['card.primary_updated', 'card.search_area'] },
        ...ZONES.map((z) => ({ when: { captured: { set: 'camp-close' }, n: 5 }, search: { id: `zone-${z}`, at: GA(z), r: 300 } })),
        { when: { captured: { set: 'camp-close' }, n: 5 }, at: 2, radio: 'int2-tr-zone', heard: { role: ['tracker'] } },
        { when: { discovered: 'watcher' }, at: 1, radio: ['int2-s1-guy', 'int2-s1-man', 'int2-s1-thanks', 'int2-s1-welcome'] },
        ...ZONES.map((z) => ({ when: { discovered: 'watcher' }, unsearch: `zone-${z}` })),
        { when: { discovered: 'watch-opt-1' }, radio: 'int2-s1-optional', heard: ISR_TRACKER },
        { when: { discovered: 'watch-opt-2' }, radio: 'int2-s1-optional', heard: ISR_TRACKER },
        {
          when: { all: [{ discovered: 'watcher' }, { discovered: 'watch-opt-1' }, { discovered: 'watch-opt-2' }] }, flag: 'M2_ALL_WATCHERS_FOUND',
        },
        /* The convoy crosses the distant road 20 s after he is seen, in a
         * seeded window of 30 s, and he leaves at once. */
        {
          when: { discovered: 'watcher' },
          at: [20, 50],
          spawn: [1, 2, 3].map((k) => ({ id: `convoy-${k}`, route: `m2-convoy-${k}` })),
          choose: { name: 'convoy', value: 'passed' },
        },
      ],
      objectives: [
        {
          id: 'inspect', text: 'ops.interior.m2.obj.inspect', tier: 'primary', done: { captured: { set: 'camp-close' }, n: 5 },
        },
        {
          id: 'posts', text: 'ops.interior.m2.obj.posts', tier: 'primary', after: 'inspect', done: { discovered: 'watcher' },
        },
        {
          id: 'watchers', text: 'ops.interior.m2.obj.watchers', tier: 'optional', after: 'inspect', done: { flag: 'M2_ALL_WATCHERS_FOUND' },
        },
        { id: 'rule', text: 'ops.rule.no_engagement', tier: 'rule' },
      ],
      exits: [{ when: { chosen: 'convoy', is: 'passed' }, to: 'next', after: 4000 }],
    },
    {
      id: 'M2_CP_WATCHER',
      title: 'ops.interior.m2.s2',
      restartLead: TRANSIT_S(GA('handoffN')),
      objectives: [
        {
          id: 'follow', text: 'ops.interior.m2.obj.follow', tier: 'primary', done: { any: [{ route: 'watcher', point: 'handoff-n' }, { route: 'watcher', point: 'handoff-s' }] },
        },
        {
          id: 'choose', text: 'ops.interior.m2.obj.choose', tier: 'primary', show: { chosen: 'split', is: 'done' }, done: { any: [{ chosen: 'follow', is: 'a' }, { chosen: 'follow', is: 'b' }] },
        },
        { id: 'rule', text: 'ops.rule.no_engagement', tier: 'rule' },
      ],
      cues: [
        {
          at: 0,
          radio: 'int2-s2-interesting',
          card: 'card.primary_updated',
          move: [{ contacts: 'watcher', route: byWatch((z, h) => `m2-ride-${z}-${h}`) }],
          spawn: [{ id: 'second', route: byWatch((z, h) => `m2-second-${h}`) }],
        },
        {
          when: { lost: 'watcher', s: TRACK.soft }, repeat: true, card: 'card.last_known', search: { id: 'watcher-lkp', contact: 'watcher', r: 200 },
        },
        { when: { reacquired: 'watcher' }, repeat: true, unsearch: 'watcher-lkp' },
        /* The handoff: a short stop, a small object changes hands, they
         * separate (MISSIONS.md M2 stage 2). */
        {
          when: { any: [{ route: 'watcher', point: 'handoff-n' }, { route: 'watcher', point: 'handoff-s' }] },
          at: 15,
          radio: ['int2-s2-which', 'int2-s2-second', 'int2-s2-why', 'int2-s2-see'],
          card: 'card.primary_updated',
          choose: { name: 'split', value: 'done' },
          move: [
            { contacts: 'watcher', route: byWatch((z, h) => `m2-a-${h}`) },
            { contacts: 'second', route: byWatch((z, h) => `m2-b-${h}`) },
          ],
        },
        { when: { chosen: 'split', is: 'done' }, at: 3, radio: 'int2-tr-other', heard: { role: ['tracker'] } },
        {
          when: { all: [{ chosen: 'split', is: 'done' }, { captured: 'follow_a' }] }, unless: { chosen: 'follow', is: 'b' }, choose: { name: 'follow', value: 'a' },
        },
        {
          when: { all: [{ chosen: 'split', is: 'done' }, { captured: 'follow_b' }] }, unless: { chosen: 'follow', is: 'a' }, choose: { name: 'follow', value: 'b' },
        },
        /* Choosing "wrong" is no fail: a courier leaves A's post 3 to 5
         * minutes later for the same property. */
        {
          when: { all: [{ chosen: 'follow', is: 'a' }, { route: 'watcher', point: 'post-a' }] },
          at: [180, 300],
          spawn: [{ id: 'courier', route: 'm2-courier' }],
          radio: 'int2-s2-courier',
        },
        {
          when: { lost: 'second', s: TRACK.soft }, repeat: true, card: 'card.last_known', search: { id: 'second-lkp', contact: 'second', r: 150 },
        },
        { when: { reacquired: 'second' }, repeat: true, unsearch: 'second-lkp' },
        {
          when: { lost: 'courier', s: TRACK.soft }, repeat: true, card: 'card.last_known', search: { id: 'courier-lkp', contact: 'courier', r: 150 },
        },
        { when: { reacquired: 'courier' }, repeat: true, unsearch: 'courier-lkp' },
      ],
      exits: [
        { when: { all: [{ chosen: 'follow', is: 'b' }, { route: 'second', point: 'property-yard' }] }, to: 'next' },
        { when: { all: [{ chosen: 'follow', is: 'a' }, { route: 'courier', point: 'property-yard' }] }, to: 'next' },
      ],
    },
    {
      id: 'M2_CP_PROPERTY',
      title: 'ops.interior.m2.s3',
      restartLead: TRANSIT_S(GA('estancia')),
      objectives: [
        {
          id: 'property', text: 'ops.interior.m2.obj.property', tier: 'primary', done: { captured: { set: 'property' }, n: 3 },
        },
        {
          id: 'avoid', text: 'ops.interior.m2.obj.avoid', tier: 'primary', after: 'property', fail: DETECTED,
        },
        {
          id: 'observe', text: 'ops.interior.m2.obj.observe', tier: 'primary', after: 'property', done: { route: 'returner', point: 'property-gate' },
        },
        { id: 'rule', text: 'ops.rule.no_engagement', tier: 'rule' },
      ],
      cues: [
        { at: 0, card: 'card.primary_updated' },
        {
          when: { captured: { set: 'property' }, n: 3 },
          radio: ['int2-s3-warning', 'int2-s3-this', 'int2-s3-this2', 'int2-s3-radio', 'int2-s3-satellites'],
        },
        {
          when: { captured: { set: 'property' }, n: 3 },
          at: 25,
          spawn: [{ id: 'returner', route: { dial: 'returner', map: { foot: 'm2-returner-foot', moto: 'm2-returner-moto' } } }],
          radio: 'int2-s3-movement',
          card: 'card.primary_updated',
          choose: { name: 'returner', value: 'in' },
        },
        { when: { chosen: 'returner', is: 'in' }, at: 2, radio: 'int2-s3-quiet', heard: RECON },
        /* Seen: he leaves fast, UNSEEN is gone, the mission goes on. */
        {
          when: { all: [{ alert: 'property', level: 'high' }, { chosen: 'returner', is: 'in' }] },
          choose: { name: 'detected', value: 'yes' },
          radio: 'int2-s3-seen',
          move: [{ contacts: 'returner', route: { dial: 'returner', map: { foot: 'm2-returner-foot-fast', moto: 'm2-returner-moto-fast' } } }],
        },
        {
          when: { lost: 'returner', s: TRACK.soft }, repeat: true, card: 'card.last_known', search: { id: 'returner-lkp', contact: 'returner', r: 150 },
        },
        { when: { reacquired: 'returner' }, repeat: true, unsearch: 'returner-lkp' },
      ],
      exits: [{ when: { route: 'returner', point: 'property-gate' }, to: 'next', after: 5000 }],
    },
    {
      id: 'M2_CP_SECOND_CAMP',
      title: 'ops.interior.m2.s4',
      restartLead: TRANSIT_S(GA('claroNuevo')),
      objectives: [
        {
          id: 'document', text: 'ops.interior.m2.obj.document', tier: 'primary', done: { captured: { set: 'nuevo' }, n: 4 },
        },
        {
          id: 'meeting', text: 'ops.interior.m2.obj.meeting', tier: 'primary', after: 'document', done: { vanished: 'old-courier' },
        },
        {
          id: 'comparison', text: 'ops.interior.m2.obj.comparison', tier: 'optional', done: { captured: 'comparison' },
        },
        {
          id: 'both', text: 'ops.interior.m2.obj.both', tier: 'primary', show: { chosen: 'meeting', is: 'over' }, done: { chosen: 'cells', is: 'said' },
        },
        { id: 'rule', text: 'ops.rule.no_engagement', tier: 'rule' },
      ],
      cues: [
        { at: 0, card: 'card.primary_updated' },
        { at: 0, unless: DETECTED, flag: 'M2_SECOND_CAMP_UNDETECTED' },
        {
          when: { discovered: 'nuevo' },
          at: 1,
          radio: ['int2-s4-radio', 'int2-s4-newer', 'int2-s4-replacement', 'int2-s4-people'],
          classify: {
            contacts: 'nuevo', to: 'column-linked', label: 'ops.label.new_column_unconfirmed', why: 'ev.newer_equipment',
          },
          card: 'card.classification_updated',
        },
        {
          when: { captured: { set: 'nuevo' }, n: 4 }, at: 10, spawn: [{ id: 'old-courier', route: 'm2-old-courier' }],
        },
        { when: { route: 'old-courier', point: 'nuevo-middle' }, radio: 'int2-s4-hold' },
        {
          when: { vanished: 'old-courier' },
          radio: ['int2-s4-same', 'int2-s4-myth', 'int2-s4-asked', 'int2-s4-only'],
          card: ['card.intelligence_updated', 'card.possible_split'],
          choose: { name: 'meeting', value: 'over' },
        },
        {
          when: { chosen: 'meeting', is: 'over' }, at: 6, radio: ['int2-s4-cells', 'int2-s4-orgs', 'int2-s4-routes'], choose: { name: 'cells', value: 'said' },
        },
      ],
      /* The outro film carries the emergency transition (INTROS M2). */
      exits: [{ when: { chosen: 'cells', is: 'said' }, to: 'won', why: 'documented', after: 8000 }],
    },
  ],
};
