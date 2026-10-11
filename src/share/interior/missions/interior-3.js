/*
 * interior-3.js: The Interior, Mission 3, No Man's Land, as data for the
 * room's ops modules (src/share/ops/, docs/campaign/interior/
 * CONTRACT-P0.md). The authority is docs/campaign/interior/MISSIONS.md's
 * M3 section; what is built here and what is not is CONTRACT-M3.md (the
 * strike, the relay and the post are stood in for with the room's
 * existing triggers; the unknown drone is not built). Text is string
 * keys only; the radio is lines.json's, by line id (the int3 voices are
 * not generated yet: a screen plays nothing for an id it does not have).
 *
 * Positions are the ops frame (z up, metres, over the ground: the
 * mission is `ground`). Mission 3's places are routes.js M3_AT on the
 * design grid, through G().
 *
 * ROUTES it names (routes.js, `m3-` prefixed):
 *   m3-a-pickup, m3-a-family          contact A and the family it brings
 *   m3-b-police                       contact B to the post's checkpoint
 *   m3-c-walker-{1,2}                 contact C leaving south
 *   m3-d-{ab,ba}, m3-courier          contact D's two stops, the meeting
 *   m3-e-worker-{1,2,3}               contact E at work in the field
 *   m3-leaver-{1,2}                   civilians out of the vegetation
 *   m3-pair-{w,e}-{a,b}               the concealed pair, onto the gate
 *   m3-stopped                        a struck contact, gone at once
 *   m3-v{1,2,3}, m3-v1-people         the three look alike pickups
 *   m3-radio-op, m3-command-2         the command site's people
 *   m3-north                          the northern vehicle
 *
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
import { PLACES } from '../places.js';
import { M3_AT } from '../routes.js';
import { CLASSES } from './interior-1.js';
import { FILMS, briefingMs } from '../films/index.js';

/* A grid point (km east, km north) in ops frame metres. */
const G = (e, n) => [Math.round(e * 1000 - ORIGIN[0]), Math.round(n * 1000 - ORIGIN[1])];
const GA = (k) => G(...M3_AT[k]);
const P2 = ([x, z]) => {
  const d = threePosToDoc(x, 0, z, {});
  return [Math.round(d.x * 100) / 100, Math.round(d.y * 100) / 100];
};

/* A checkpoint restart starts on Pista Cero's rail: the seconds a first
 * timer takes to fly back out (interior-1.js TRANSIT_S). */
/* spot.js's numbers as Mission 1 sets them (interior-1.js SPOT). */
const SPOT = {
  height: 200, range: 450, overR: 60, loud: 24, rise: 0.05, fall: 0.05, levels: { looking: 0.25, spotted: 1 }, scene: 6,
  warn: 'int-spot-warn', lines: { spotted: 'int-spot-seen', low: 'int-spot-low', over: 'int-spot-over', loud: 'int-spot-loud' },
};

const TRANSIT_S = (at) => {
  const [a, b] = [P2(PLACES.pistaCero.at), at];
  return Math.round(60 + Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) / 18);
};
/* MISSIONS.md 1.7's defaults: 20 s soft, 45 s hard; no authored
 * alternates yet, so a hard threshold only searches. */
const TRACK = { soft: 20, hard: 45 };
const STRIKE = { role: ['strike'] };
const RELAY = { role: ['relay'] };
const TRACKER = { role: ['tracker'] };
/* A strike: the strike platform held 3 s over the place (CONTRACT-M3.md
 * gap 2: the room has no weapon; the run over a cleared target is it). */
const RUN = (point) => ({ zone: point, roles: ['strike'], ms: 3000 });
const CLEARED = { chosen: 'cleared', is: 'yes' };
const STOPPED = { chosen: 'threat', is: 'stopped' };
const ERR = (v) => ({ chosen: `error-${v}`, is: 'yes' });
const ERRORS = { any: [ERR('v1'), ERR('v2')] };
const RELAYED = { chosen: 'relay', is: 'held' };
const STAGE1 = ['civ-pickup', 'police', 'walker-1', 'walker-2', 'parked', 'worker-1', 'worker-2', 'worker-3', 'family'];


export default {
  id: 'interior-3',
  campaign: 'interior',
  title: 'ops.interior.m3.title',
  map: 'interior',
  ground: true,
  z0: 0,
  /* The briefing: Mission 3's intro film, held for its length, and which
   * cut it is, so a host's skip waits for everyone to have seen it. */
  filmMs: briefingMs('interior-3'),
  film: { id: FILMS['int3-intro'].id, version: FILMS['int3-intro'].version },
  /* Thermal matters more as the light goes (MISSIONS.md M3). */
  sensor: { palette: 'arctic' },
  /* The forward feed's loss past the ridge, until the relay holds
   * (src/share/ops/feed.js): the recon's picture is snow over it. */
  feed: {
    stage: 'M3_CP_RELAY', roles: ['recon'], point: 'command', clear: { chosen: 'relay', is: 'held' }, snow: 0.6,
  },
  debrief: {
    required: ['radio_op', 'temp_shelter', 'command_motos', 'route_markers'],
  },
  classes: CLASSES,
  roles: [
    {
      id: 'isr', core: true, guide: 'IBARRA', platforms: ['bramor2300'],
    },
    /* The recon quad: the 7 inch (lead decision 2026-10-08). */
    {
      id: 'recon', core: true, guide: 'IBARRA', platforms: ['7inch'],
    },
    {
      id: 'strike', core: true, guide: 'ROJAS', platforms: ['striker2500'],
    },
    /* The relay is a fixed wing loiterer: the Bramor until one is built. */
    {
      id: 'relay', core: true, guide: 'FERRER', platforms: ['bramor2300'],
    },
    {
      id: 'tracker', core: false, guide: 'IBARRA', platforms: ['bramor2300'],
    },
  ],
  /* Every person here is a `person`, grouped by beat, so the shared
   * spotted rule (a pilot too low over people) can name groups when its
   * data shape lands (plan file, the spotted lane). */
  contacts: [
    {
      id: 'civ-pickup', kind: 'vehicle', look: 'pickup', group: 'key', faction: 'civilian', track: TRACK,
    },
    { id: 'family', kind: 'person', group: 'farm', faction: 'civilian' },
    {
      id: 'police', kind: 'vehicle', look: 'motorcycle', group: 'key', faction: 'friendly', track: TRACK,
    },
    { id: 'walker-1', kind: 'person', group: 'walkers', faction: 'civilian' },
    { id: 'walker-2', kind: 'person', group: 'walkers', faction: 'civilian' },
    {
      id: 'parked', kind: 'vehicle', look: 'pickup', group: 'key', faction: 'column', track: TRACK,
    },
    { id: 'courier', kind: 'person', group: 'courier', faction: 'column' },
    ...[1, 2, 3].map((k) => ({
      id: `worker-${k}`, kind: 'person', group: 'workers', faction: 'civilian',
    })),
    { id: 'leaver-1', kind: 'person', group: 'leavers', faction: 'civilian' },
    { id: 'leaver-2', kind: 'person', group: 'leavers', faction: 'civilian' },
    {
      id: 'pair-a', kind: 'person', group: 'pair', faction: 'column', track: TRACK,
    },
    {
      id: 'pair-b', kind: 'person', group: 'pair', faction: 'column', track: TRACK,
    },
    ...[1, 2, 3].map((k) => ({
      id: `v${k}`, kind: 'vehicle', look: 'pickup', group: 'pickups', faction: k === 3 ? 'column' : 'civilian', track: TRACK,
    })),
    { id: 'v1-people', kind: 'person', group: 'v1-people', faction: 'civilian' },
    { id: 'radio-man', kind: 'person', group: 'command', faction: 'column' },
    { id: 'command-2', kind: 'person', group: 'command', faction: 'column' },
    {
      id: 'north', kind: 'vehicle', look: 'pickup', group: 'north', faction: 'column', track: TRACK,
    },
  ],
  items: [
    /* CONFIRM IDENTIFICATION is a capture of the box on the contact
     * (MISSIONS.md 1.6: any pilot's, on the contact in their box). */
    {
      id: 'confirm_pair', set: 'confirm', contact: 'pair', size: 1.7,
    },
    ...[1, 2, 3].map((k) => ({
      id: `confirm_v${k}`, set: 'confirm', contact: `v${k}`, size: 5,
    })),
    /* The northern vehicle's still, for the outro (INTROS.md M3): the
     * squad's when someone captured it, else the reconstruction. */
    {
      id: 'north_vehicle', set: 'north-optional', contact: 'north', size: 5,
    },
    /* The command site (stage 4, RECON forward). */
    {
      id: 'radio_op', set: 'command', contact: 'radio-man', size: 1.7,
    },
    {
      id: 'temp_shelter', set: 'command', at: [...G(7.167, 15.271), 1.2], size: 4,
    },
    {
      id: 'command_motos', set: 'command', at: [...G(7.178, 15.259), 0.6], size: 3,
    },
    {
      id: 'route_markers', set: 'command', at: [...G(7.15, 15.235), 0.3], size: 1,
    },
  ],
  points: {
    'pista-cero': { at: P2(PLACES.pistaCero.at), r: 250 },
    post: { at: GA('post'), r: 25 },
    'post-area': { at: GA('post'), r: 1500 },
    'gate-near': { at: G(M3_AT.gate[0], M3_AT.gate[1] + 0.012), r: 8 },
    farmhouse: { at: GA('farmhouse'), r: 15 },
    checkpoint: { at: GA('checkpoint'), r: 12 },
    'obs-a': { at: GA('obsA'), r: 15 },
    'obs-b': { at: GA('obsB'), r: 15 },
    meet: { at: GA('meet'), r: 15 },
    'south-road': { at: G(4.4, 13.0), r: 40 },
    'strike-gate': { at: GA('gate'), r: 150 },
    'v1-stop': { at: GA('v1Stop'), r: 150 },
    'v2-stop': { at: GA('v2Stop'), r: 150 },
    'v1-stopped': { at: GA('v1Stop'), r: 15 },
    'v2-stopped': { at: GA('v2Stop'), r: 15 },
    'v3-meet': { at: G(7.12, 15.215), r: 20 },
    command: { at: GA('command'), r: 400 },
    relay: { at: GA('relay'), r: 350 },
    turn: { at: GA('turn'), r: 20 },
    edge: { at: GA('edge'), r: 20 },
    exit: { at: GA('exit'), r: 30 },
  },
  dials: {
    order: ['ab', 'ba'],
    side: ['w', 'e'],
  },
  boundary: { min: [-PLACES.boundary.warn, -PLACES.boundary.warn], max: [PLACES.boundary.warn, PLACES.boundary.warn] },
  lines: {
    boundary: { warning: 'int-boundary', final: 'int-boundary-final' },
    fail: 'int-fail-function',
    take: 'int-take-role',
    downed: 'int-lost-aircraft',
  },
  /* Who notices a low aircraft (src/share/ops/spot.js, the owner's rule
   * of 2026-10-08), Mission 1's numbers: the courier at the meeting and
   * the concealed pair, the two groups the ISR photographs. The strike
   * run counts over the gate at any height (RUN), so it is flown above
   * the pair's 200 m like any other look. The command site is the recon
   * quad's close work and has no spotter. */
  spotters: [
    {
      ...SPOT, id: 'courier', group: 'courier', stage: 'M3_CP_START', scatter: [{ contacts: 'courier', route: 'm3-courier-scatter' }],
    },
    {
      ...SPOT, id: 'pair', group: 'pair', stage: 'M3_CP_CONFIRMED_CONTACT', scatter: ['a', 'b'].map((k) => ({ contacts: `pair-${k}`, route: `m3-pair-scatter-${k}` })),
    },
  ],
  /* MISSIONS.md M3 fails: all ISR lost; repeated engagement of
   * civilians; the post overrun (the pair reaching it unstopped stands in
   * for `critical` 60 s: CONTRACT-M3.md gap 3). */
  lost: [
    { when: { spotted: 'courier' }, why: 'spotted', spot: 'courier' },
    { when: { spotted: 'pair' }, why: 'spotted', spot: 'pair' },
    { when: { downed: ['isr'], alone: true }, why: 'isr-down', radio: 'int-fail-function' },
    { when: { all: [ERR('v1'), ERR('v2')] }, why: 'errors', radio: 'int-fail-function' },
    { when: { route: 'pair', point: 'post' }, why: 'post', radio: 'int-fail-function' },
  ],
  stars: [
    { id: 'positive', card: null, when: { flag: 'M3_ZERO_CIVILIAN_ERRORS' } },
    { id: 'notalone', card: null, when: { flag: 'M3_HOSTILE_DRONE_INTERCEPTED' } },
    { id: 'command', card: null, when: { flag: 'M3_COMMAND_SITE' } },
  ],
  stages: [
    {
      id: 'M3_CP_START',
      title: 'ops.interior.m3.s1',
      objectives: [
        {
          id: 'classify', text: 'ops.interior.m3.obj.classify', tier: 'primary', done: { classified: 'parked', is: 'hostile' }, guide: { isr: 'int3-g-classify', tracker: 'int3-g-classify', recon: 'int3-g-classify', strike: 'int3-g-strike-wait', relay: 'int3-g-classify' },
        },
        { id: 'rule', text: 'ops.rule.confirmed_only', tier: 'rule' },
      ],
      cues: [
        { at: 0, card: 'card.primary_updated' },
        /* The traffic starts when an eye reaches the post, so a 12 km
         * transit does not miss D's two stops. */
        {
          when: { zone: 'post-area', roles: ['isr', 'tracker'] },
          spawn: [
            { id: 'civ-pickup', route: 'm3-a-pickup' },
            { id: 'police', route: 'm3-b-police' },
            { id: 'walker-1', route: 'm3-c-walker-1' },
            { id: 'walker-2', route: 'm3-c-walker-2' },
            { id: 'parked', route: { dial: 'order', map: { ab: 'm3-d-ab', ba: 'm3-d-ba' } } },
            { id: 'worker-1', route: 'm3-e-worker-1' },
            { id: 'worker-2', route: 'm3-e-worker-2' },
            { id: 'worker-3', route: 'm3-e-worker-3' },
          ],
        },
        { at: 1, radio: 'int3-tr-contact', heard: TRACKER },
        { when: { route: 'civ-pickup', point: 'farmhouse' }, spawn: [{ id: 'family', route: 'm3-a-family' }] },
        {
          when: { all: [{ route: 'civ-pickup', point: 'farmhouse' }, { seen: 'family' }] },
          classify: { contacts: ['civ-pickup', 'family'], to: 'civilian', why: 'ev.family_unloads' },
          card: 'card.classification_updated',
          radio: 'int3-s1-watch',
        },
        {
          when: { all: [{ route: 'police', point: 'checkpoint' }, { seen: 'police' }] },
          classify: { contacts: 'police', to: 'friendly', why: 'ev.police_checkpoint' },
          card: 'card.classification_updated',
          radio: 'int3-s1-ours',
        },
        {
          when: { all: [{ route: 'walkers', point: 'south-road' }, { seen: 'walkers' }] },
          classify: { contacts: 'walkers', to: 'civilian', why: 'ev.leaving' },
          card: 'card.classification_updated',
        },
        {
          when: { discovered: 'workers' }, at: 5, classify: { contacts: 'workers', to: 'civilian', why: 'ev.at_work' }, card: 'card.classification_updated',
        },
        /* D's second stop with its radio seen: the pattern, not proof. */
        {
          /* Both stops reached is the second stop, whichever order. */
          when: { all: [{ route: 'parked', point: 'obs-a' }, { route: 'parked', point: 'obs-b' }, { seen: 'parked', now: true }] },
          radio: ['int3-s1-pattern', 'int3-s1-enough', 'int3-s1-no'],
          classify: { contacts: 'parked', to: 'poi', why: 'ev.watches_post' },
          card: 'card.intelligence_updated',
          spawn: [{ id: 'courier', route: 'm3-courier' }],
        },
        /* linked(D, m2-courier): both at the meeting, both seen. */
        {
          when: { all: [{ route: 'parked', point: 'meet' }, { route: 'courier', point: 'meet' }, { seen: 'parked' }, { seen: 'courier' }] },
          radio: ['int3-s1-corr', 'int3-s1-sayit', 'int3-s1-confirmed'],
          classify: { contacts: ['parked', 'courier'], to: 'hostile', why: 'ev.historical_correlation' },
          card: 'card.classification_updated',
        },
      ],
      exits: [{ when: { classified: 'parked', is: 'hostile' }, to: 'next', after: 6000 }],
    },
    {
      id: 'M3_CP_CONFIRMED_CONTACT',
      title: 'ops.interior.m3.s2',
      restartLead: TRANSIT_S(GA('post')),
      objectives: [
        {
          id: 'threats', text: 'ops.interior.m3.obj.threats', tier: 'primary', done: STOPPED, guide: { isr: 'int3-g-threats', tracker: 'int3-g-threats', recon: 'int3-g-threats', strike: 'int3-g-strike', relay: 'int3-g-threats' },
        },
        { id: 'rule', text: 'ops.rule.confirmed_only', tier: 'rule' },
      ],
      cues: [
        { at: 0, card: 'card.primary_updated' },
        {
          /* MISSIONS.md M3: 20 to 40 s after stage 1's exit (seeded). */
          at: [20, 40],
          spawn: [
            { id: 'leaver-1', route: 'm3-leaver-1' },
            { id: 'leaver-2', route: 'm3-leaver-2' },
            { id: 'pair-a', route: { dial: 'side', map: { w: 'm3-pair-w-a', e: 'm3-pair-e-a' } }, alt: null },
            { id: 'pair-b', route: { dial: 'side', map: { w: 'm3-pair-w-b', e: 'm3-pair-e-b' } }, alt: null },
          ],
        },
        { when: { discovered: 'leavers' }, at: 4, classify: { contacts: 'leavers', to: 'civilian', why: 'ev.leaving' }, card: 'card.classification_updated' },
        { when: { discovered: 'pair' }, at: 2, classify: { contacts: 'pair', to: 'poi', why: 'ev.concealed_watching' }, card: 'card.intelligence_updated' },
        /* No eyes on the pair while it waits: the post is pressed. */
        { when: { lost: 'pair', s: 20 }, unless: STOPPED, radio: 'int3-s2-pressed', search: { id: 'pair-lkp', contact: 'pair', r: 120 }, card: 'card.last_known' },
        { when: { reacquired: 'pair' }, repeat: true, unsearch: 'pair-lkp' },
        /* The hostile action, unambiguous: the pair at the gate. */
        {
          when: { all: [{ route: 'pair', point: 'gate-near' }, { seen: 'pair' }] },
          radio: ['int3-s2-contact', 'int3-s2-pilot'],
          card: 'card.confirm_identification',
          text: 'ops.interior.m3.confirm',
        },
        { when: { captured: 'confirm_pair' }, unless: { route: 'pair', point: 'gate-near' }, radio: 'int3-s2-notyet' },
        {
          when: { all: [{ route: 'pair', point: 'gate-near' }, { captured: 'confirm_pair' }] },
          radio: 'int3-s2-cleared',
          classify: { contacts: 'pair', to: 'hostile', why: 'ev.hostile_action' },
          card: 'card.classification_updated',
          choose: { name: 'cleared', value: 'yes' },
        },
        { when: CLEARED, radio: 'int3-st-ready', heard: STRIKE },
        {
          when: { all: [CLEARED, RUN('strike-gate')] },
          text: 'ops.interior.m3.stopped',
          radio: ['int3-s2-stopped', 'int3-s2-continue'],
          move: [{ contacts: 'pair', route: 'm3-stopped', alt: null }],
          choose: { name: 'threat', value: 'stopped' },
        },
      ],
      exits: [{ when: STOPPED, to: 'next', after: 10000 }],
    },
    {
      id: 'M3_CP_FIRST_ENGAGEMENT',
      title: 'ops.interior.m3.s3',
      restartLead: TRANSIT_S(GA('post')),
      objectives: [
        {
          id: 'pickups', text: 'ops.interior.m3.obj.pickups', tier: 'primary', done: { all: [{ classified: 'v1', is: 'civilian' }, { chosen: 'v2', is: 'empty' }, { classified: 'v3', is: 'hostile' }] }, guide: { isr: 'int3-g-pickups', tracker: 'int3-g-pickups', recon: 'int3-g-pickups', strike: 'int3-g-strike-wait', relay: 'int3-g-pickups' },
        },
        { id: 'rule', text: 'ops.rule.confirmed_only', tier: 'rule' },
      ],
      cues: [
        { at: 0, card: 'card.primary_updated' },
        /* The three leave a few seconds apart. */
        { at: 5, spawn: [{ id: 'v1', route: 'm3-v1' }], radio: ['int3-s3-chassis', 'int3-s3-answers'] },
        { at: 11, spawn: [{ id: 'v2', route: 'm3-v2' }] },
        { at: 17, spawn: [{ id: 'v3', route: 'm3-v3' }] },
        { at: 6, radio: 'int3-tr-contact', heard: TRACKER },
        { when: { route: 'v1', point: 'v1-stopped' }, at: 4, spawn: [{ id: 'v1-people', route: 'm3-v1-people' }] },
        {
          when: { seen: 'v1-people' }, classify: { contacts: 'v1', to: 'civilian', why: 'ev.people_left' }, card: 'card.classification_updated',
        },
        /* Nobody near it, watched: the empty decoy. */
        {
          when: { all: [{ route: 'v2', point: 'v2-stopped' }, { seen: 'v2' }] },
          at: 45,
          classify: { contacts: 'v2', to: 'unknown', label: 'ops.label.empty_vehicle', why: 'ev.nobody_near' },
          choose: { name: 'v2', value: 'empty' },
          card: 'card.classification_updated',
        },
        {
          when: { all: [{ route: 'v3', point: 'v3-meet' }, { seen: 'v3' }] },
          classify: { contacts: 'v3', to: 'hostile', why: 'ev.met_known' },
          card: 'card.classification_updated',
        },
        /* A strike on vehicle 1 or 2: a designation, then the strike
         * platform's run over it (MISSIONS.md 1.6). */
        ...['v1', 'v2'].map((v) => ({
          when: { all: [{ captured: `confirm_${v}` }, RUN(`${v}-stop`)] },
          radio: ['int3-s3-error', 'int3-s3-error-2'],
          move: [{ contacts: v, route: 'm3-stopped', alt: null }],
          choose: { name: `error-${v}`, value: 'yes' },
        })),
      ],
      exits: [
        { when: { all: [{ classified: 'v1', is: 'civilian' }, { chosen: 'v2', is: 'empty' }, { classified: 'v3', is: 'hostile' }] }, to: 'next', after: 4000 },
        { when: { all: [ERRORS, { classified: 'v3', is: 'hostile' }] }, to: 'next', after: 4000 },
      ],
    },
    {
      id: 'M3_CP_RELAY',
      title: 'ops.interior.m3.s4',
      restartLead: TRANSIT_S(GA('command')),
      objectives: [
        {
          id: 'relay', text: 'ops.interior.m3.obj.relay', tier: 'primary', done: RELAYED, guide: { isr: 'int3-g-relay', tracker: 'int3-g-relay', recon: 'int3-g-relay', strike: 'int3-g-relay', relay: 'int3-g-relay-hold' },
        },
        {
          id: 'command', text: 'ops.interior.m3.obj.command', tier: 'primary', after: 'relay', done: { captured: { set: 'command' }, n: 4 }, guide: { isr: 'int3-g-command', tracker: 'int3-g-command', recon: 'int3-g-command', strike: 'int3-g-command', relay: 'int3-g-relay-hold' },
        },
        { id: 'rule', text: 'ops.rule.confirmed_only', tier: 'rule' },
      ],
      cues: [
        {
          at: 0, card: 'card.primary_updated', spawn: [{ id: 'radio-man', route: 'm3-radio-op' }, { id: 'command-2', route: 'm3-command-2' }],
        },
        /* The forward feed's loss is told, not drawn (CONTRACT-M3.md gap 4). */
        { when: { zone: 'command', roles: ['recon'] }, radio: ['int3-s4-losing', 'int3-s4-both', 'int3-s4-normal', 'int3-s4-talk', 'int3-s4-cando'], search: { id: 'relay-volume', at: GA('relay'), r: 350 } },
        { when: { zone: 'command', roles: ['recon'] }, at: 2, radio: 'int3-re-volume', heard: RELAY },
        {
          when: { zone: 'relay', roles: ['relay'], ms: 10000 }, radio: 'int3-s4-stable', unsearch: 'relay-volume', choose: { name: 'relay', value: 'held' },
        },
        { when: { captured: { set: 'command' }, n: 3 }, radio: ['int3-s4-random', 'int3-s4-command', 'int3-s4-temp'], card: 'card.coordinated_activity' },
        {
          when: { all: [RELAYED, { captured: { set: 'command' }, n: 4 }] }, flag: 'M3_COMMAND_SITE',
        },
      ],
      exits: [{ when: { all: [RELAYED, { captured: { set: 'command' }, n: 4 }] }, to: 'next', after: 4000 }],
    },
    {
      id: 'M3_CP_AIR_CONTACT',
      title: 'ops.interior.m3.s5',
      restartLead: TRANSIT_S(GA('command')),
      /* The unknown drone (M3_07, M3_08) is not built: the room has no air
       * contact (CONTRACT-M3.md gap 5). The northern vehicle is. */
      objectives: [
        {
          id: 'north', text: 'ops.interior.m3.obj.north', tier: 'primary', done: { route: 'north', point: 'exit' }, guide: { isr: 'int3-g-north', tracker: 'int3-g-north', recon: 'int3-g-north', strike: 'int3-g-north', relay: 'int3-g-north' },
        },
        { id: 'rule', text: 'ops.rule.no_engagement', tier: 'rule' },
      ],
      cues: [
        {
          at: [30, 90], card: 'card.primary_updated', spawn: [{ id: 'north', route: 'm3-north', alt: null }],
        },
        { when: { route: 'north', point: 'turn' }, radio: ['int3-s5-wrong', 'int3-s5-what', 'int3-s5-direction'] },
        { when: { route: 'north', point: 'edge' }, radio: ['int3-s5-edge', 'int3-s5-boundary'] },
        { when: { lost: 'north', s: 20 }, repeat: true, search: { id: 'north-lkp', contact: 'north', r: 200 }, card: 'card.last_known' },
        { when: { reacquired: 'north' }, repeat: true, unsearch: 'north-lkp' },
        { when: { route: 'north', point: 'exit' }, unless: ERRORS, flag: 'M3_ZERO_CIVILIAN_ERRORS' },
      ],
      exits: [{ when: { route: 'north', point: 'exit' }, to: 'won', why: 'north', after: 3000 }],
    },
  ],
};
