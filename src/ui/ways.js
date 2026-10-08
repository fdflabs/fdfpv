/*
 * ways.js: the ways into the game, the cards behind the title's hubs.
 *
 * A way is a card: a kind of flying, the aircraft it takes (the first is
 * the one it seats when the pilot's own does not fit), the mode it sets,
 * and for the room games the game its lobby is set up for. Pressing one
 * seats the aircraft and sets the mode together. The aircraft is kept in
 * the settings; the mode is not, so every visit comes back through here.
 *
 * Cards are grouped under three hubs. The mode registry
 * (src/share/modes.js) names each mode's card and its category, which is
 * what puts a card under a hub, and modes:selftest holds the two tables
 * together. Cards with gate: false stay reachable by their action (the
 * title's rooms panel, Defend Itaipu's Play) but are not drawn.
 *
 * The plan drawings over each card are built here as SVG text, so the
 * title can paint before anything has been flown or fetched.
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

import { AIRFRAMES, AIRFRAME_IDS, airframeById, DEFAULT_AIRFRAME } from '../../configs/airframes.js';
import { MODES, modeById, wireMode } from '../share/modes.js';
import { str } from '../strings/index.js';
import { kindOf } from './carousel.js';

/* One SVG element as text, attributes in the order given. */
function tag(name, attrs) {
  const list = Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
  return `<${name}${list}/>`;
}

/* A square drawing of side `side`, styled by the page as a craft plan. */
function plan(body, side = 300) {
  return `<svg viewBox="0 0 ${side} ${side}" role="img" aria-hidden="true"`
    + str('ui.preserveaspectratio_xmidymid_meet_class_craft_plan')
    + body + '</svg>';
}

const placed = (x, y, scale, body) => `<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>`;

/* Drawn in currentColor so each card's accent colours its plan. */
/* Opacities are written as given: '0.30' stays 0.30 in the markup. */
const ink = (opacity) => ({ fill: 'currentColor', 'fill-opacity': opacity });
const line = (width, opacity) => ({ stroke: 'currentColor', 'stroke-width': width, 'stroke-opacity': opacity });

/* A fixed wing as a symbol, not to scale: a metre of span cannot share
 * the quads' 300 mm box. Nose up, fuselage, wing and tailplane. */
const PLANE = [
  tag('rect', { x: 138, y: 38, width: 24, height: 222, rx: 12, ...ink(0.55), ...line(4, 0.9) }),
  tag('path', { d: 'M 22 128 L 278 128 L 270 166 L 30 166 Z', ...ink(0.38), ...line(4, 0.9), 'stroke-linejoin': 'round' }),
  tag('path', { d: 'M 96 226 L 204 226 L 198 250 L 102 250 Z', ...ink(0.38), ...line(4, 0.9), 'stroke-linejoin': 'round' }),
].join('');

/* A ring with four ticks, a sight. */
const SIGHT = tag('circle', { cx: 150, cy: 150, r: 118, fill: 'none', ...line(8, 0.9) })
  + tag('path', { d: 'M 150 10 V 58 M 150 242 V 290 M 10 150 H 58 M 242 150 H 290', ...line(10, 0.9), 'stroke-linecap': 'round' });

export function planeSvg() {
  return plan(PLANE);
}

/* Two planes: flying together. */
export function pairSvg() {
  return plan(placed(4, 20, 0.56, PLANE) + placed(128, 112, 0.56, PLANE));
}

/* A plane trailing a streamer: the streamer combat game. */
export function streamerSvg() {
  return plan(placed(78, 4, 0.48, PLANE)
    + tag('path', { d: 'M 150 132 C 120 170, 190 190, 150 222 S 110 262, 150 294', fill: 'none', ...line(12, 0.7), 'stroke-linecap': 'round' }));
}

/* A crown: the tag game, where one pilot holds it. */
export function crownSvg() {
  return plan(tag('path', { d: 'M 50 210 L 38 96 L 104 150 L 150 70 L 196 150 L 262 96 L 250 210 Z', ...ink(0.45), ...line(8, 0.9), 'stroke-linejoin': 'round' })
    + tag('rect', { x: 50, y: 222, width: 200, height: 26, rx: 6, ...ink(0.7) }));
}

/* A loop with its arrow: Trick Battle's card. */
export function loopSvg() {
  return plan(tag('path', { d: 'M 150 236 A 86 86 0 1 1 236 150', fill: 'none', ...line(14, 0.8), 'stroke-linecap': 'round' })
    + tag('path', { d: 'M 206 140 L 236 182 L 266 140 Z', ...ink(0.8) }));
}

/* A sight over a target ball: the Interior campaign's card. */
export function ballSvg() {
  return plan(SIGHT
    + tag('circle', { cx: 150, cy: 150, r: 46, fill: 'none', ...line(8, 0.7) })
    + tag('circle', { cx: 150, cy: 150, r: 14, ...ink(0.8) }));
}

/* A sight over a plane: the war cards. */
export function reticleSvg() {
  return plan(SIGHT + placed(93, 93, 0.38, PLANE));
}

/*
 * An aircraft's plan. A quad is drawn to scale from its catalog
 * dimensions (millimetres in a box of at least 300, so small quads read
 * small): four arms on the diagonals, a body, and a disc per propeller.
 * Every fixed wing gets the plane symbol.
 */
export function craftSvg(a) {
  if (a.fixedWing) return planeSvg();
  const armMm = a.dims.arm * 1000;
  const propMm = a.dims.propR * 1000;
  const d = armMm / Math.SQRT2;
  const side = Math.max(300, Math.ceil(2 * (d + propMm) + 18));
  const mid = side / 2;
  const motors = [[d, d], [d, -d], [-d, d], [-d, -d]];
  const arms = motors.map(([x, y]) => tag('line', { x1: mid, y1: mid, x2: mid + x, y2: mid + y, ...line(propMm * 0.20, 0.55) }));
  const body = tag('rect', { x: mid - 22, y: mid - 38, width: 44, height: 76, rx: 10, ...ink('0.30') });
  const discs = motors.map(([x, y]) => tag('circle', { cx: mid + x, cy: mid + y, r: propMm, ...ink(0.16), ...line(1.4, 0.8) }));
  return plan(arms.join('') + body + discs.join(''), side);
}

/* A card's face and lobby from the mode registry: label, line, facts and
 * picture, the world it seats when it has one, and its lobby. */
function fromRegistry(modeId) {
  const card = modeById(modeId).card;
  const face = {
    lobby: wireMode(modeId),
    label: str(card.label),
    art: card.art,
    blurb: str(card.blurb),
    facts: card.facts.map((key) => str(key)),
  };
  if (card.home) face.home = card.home;
  return face;
}

const FIXED_WINGS = AIRFRAMES.filter((a) => a.fixedWing).map((a) => a.id);
const leading = (first, ids) => [first, ...ids.filter((id) => id !== first)];

/*
 * The cards, in order. Order is meaningful: picking a card for an
 * aircraft takes the first that fits, and the two solo cards come first
 * so that never lands on a room card. The ids outlived the machines they
 * were first named for (the five inch, the 1000 mm wing).
 */
export const WAYS = [
  /* Racing: every aircraft, the interceptor first. */
  { id: 'race-5inch', airframes: leading(DEFAULT_AIRFRAME, AIRFRAME_IDS), mode: 'race', ...fromRegistry('race') },
  /* Free flight: every fixed wing, the Bramor first. */
  { id: 'freestyle-wing1000', airframes: leading('bramor2300', FIXED_WINGS), mode: 'freestyle', ...fromRegistry('free') },
  /* Free flight with friends in a private room; off the title since
   * 2026-10-02, still the way in for the title's rooms panel. */
  {
    id: 'friends',
    gate: false,
    airframes: AIRFRAME_IDS,
    mode: 'freestyle',
    home: 'swiss2',
    room: true,
    label: str('friends.title'),
    art: 'assets/gate/friends.jpg',
    svg: pairSvg(),
    blurb: str('friends.card_blurb'),
    facts: [str('friends.card_public'), str('friends.card_code'), str('friends.card_craft')],
  },
  /* The room games: the friends card with its game chosen. */
  { id: 'combat', airframes: AIRFRAME_IDS, mode: 'freestyle', room: true, game: 'combat', ...fromRegistry('combat'), svg: streamerSvg() },
  { id: 'ace', airframes: AIRFRAME_IDS, mode: 'freestyle', room: true, game: 'tag', ...fromRegistry('tag'), svg: crownSvg() },
  { id: 'jam', airframes: AIRFRAME_IDS, mode: 'freestyle', room: true, game: 'jam', ...fromRegistry('jam'), svg: loopSvg() },
  /* Defend Itaipu: its consent gate runs in the shell before the room
   * (src/main.js). Off the title since 2026-09-30; Defend the Parana's
   * Play still enters through it. */
  {
    id: 'war',
    gate: false,
    airframes: AIRFRAME_IDS,
    mode: 'freestyle',
    home: 'itaipu',
    room: true,
    game: 'war',
    label: str('war.card'),
    art: 'assets/posters/itaipu.jpg',
    svg: reticleSvg(),
    blurb: str('war.card_blurb'),
    facts: [str('war.card_hold'), str('war.card_warhead'), str('friends.card_code')],
  },
  /* Defend the Parana, the war campaign. */
  { id: 'campaign', airframes: AIRFRAME_IDS, mode: 'freestyle', room: true, game: 'war', campaign: true, ...fromRegistry('war'), svg: reticleSvg() },
  /* The Interior, the second campaign, flown on the Bramor alone. */
  {
    id: 'interior',
    opsCampaign: 'interior',
    category: 'operations',
    airframes: ['bramor2300'],
    mode: 'freestyle',
    label: str('ops.campaign.interior.card'),
    svg: ballSvg(),
    blurb: str('ops.campaign.interior.card_blurb'),
    facts: [str('ops.campaign.interior.card_missions'), str('ops.campaign.interior.card_roles'), str('ops.campaign.interior.card_quiet')],
  },
].map((way) => ({ ...way, action: `way-${way.id}` }));

/* The cards the title draws. */
export const GATE_WAYS = WAYS.filter((way) => way.gate !== false);

/* The title's three hubs; a card belongs to the hub of its category. */
export const HUBS = [
  { id: 'club', label: 'hub.club', blurb: 'hub.club_blurb', art: 'assets/posters/swiss2.jpg', category: 'flightclub' },
  { id: 'ops', label: 'hub.ops', blurb: 'hub.ops_blurb', art: 'assets/posters/itaipu.jpg', category: 'operations' },
  { id: 'hangar', label: 'hub.hangar', blurb: 'hub.hangar_blurb', art: 'assets/gate/hangar.jpg', category: null },
];

/* Actions anyone may take before signing in: getting around and leaving.
 * Everything behind a card or a row asks for the sign in first. */
export const OPEN_ACTIONS = new Set([
  'title', 'paused', 'pause', 'resume', 'back', 'card-back', 'mode-gate', 'update-reload', 'noop', 'room-bar', 'reportbug', 'credits', 'leaderboard',
]);

/* A card's category: its mode's, from the registry, or its own. */
function categoryOf(way) {
  const mode = MODES.find((m) => m.card.way === way.id);
  return mode ? mode.category : way.category;
}

export function hubWays(hubId) {
  const hub = HUBS.find((h) => h.id === hubId);
  if (!hub) return [];
  return GATE_WAYS.filter((way) => categoryOf(way) === hub.category);
}

/* The hub a card's action lives under, or null. */
export function hubOfAction(action) {
  const way = WAYS.find((w) => w.action === action);
  const category = way && categoryOf(way);
  if (!category) return null;
  const hub = HUBS.find((h) => h.category === category);
  return hub ? hub.id : null;
}

/* The card the seated aircraft answers for a mode: the first that takes
 * it in that mode, else the first whose aircraft are all its kind, else
 * the first that takes it at all. */
export function seatedWay(settings, mode) {
  const airframe = settings.airframe;
  const taking = WAYS.filter((way) => way.airframes.includes(airframe));
  const sameKind = (way) => way.airframes.every((id) => kindOf(id) === kindOf(airframe));
  return taking.find((way) => way.mode === mode) || taking.find(sameKind) || taking[0] || WAYS[0];
}

/* The aircraft picker's filter for a card: its one kind, or 'all'. */
export function wayFilter(way) {
  const kinds = new Set(way.airframes.map(kindOf));
  return kinds.size === 1 ? kinds.values().next().value : 'all';
}

/* What a board link carries for an aircraft: a quad's own id, a fixed
 * wing's track class. The board knows one airframe per class (for wings
 * still the retired wing1000), so every wing is sent as its class. */
export function boardCraft(id) {
  const airframe = airframeById(id);
  return airframe.fixedWing ? airframe.trackClass : airframe.id;
}
