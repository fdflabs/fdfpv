/*
 * modes.js: every activity the game offers, as data, read by the page and
 * by the rooms server alike (docs/redesign/PLAN.md section 3).
 *
 * Before this the same five ids were four tables that nothing held
 * together: the title's cards (src/ui/ui.js WAYS), the lobby's per game
 * rows (src/main.js LOBBY_GAMES), the server's per game start
 * (edge/rooms/gamelobby.js GAMES) and what a room may be made for
 * (src/share/roomwire.js ROOM_MODES, ROOM_SETUPS), plus a branch on the
 * game's id wherever one of them did not carry what differed. Each of
 * those now reads its entry here. What a mode IS lives here; what a mode
 * DOES (its start, its round, its rows) stays with the code that runs it,
 * keyed by these ids.
 *
 * THE WIRE IS UNCHANGED. A room made for free flight has meta.mode null
 * on the wire and in every stored room; here it is 'free'. wireMode and
 * modeOfWire are the one place the two meet.
 *
 * The order is the wire's: ROOM_MODES and ROOM_SETUPS are read off it in
 * this order, and Make a room lists them so. The title draws its cards in
 * its own order (WAYS).
 *
 * Pure data and no imports from edge/ or the shell: both sides import it.
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

/*
 * One entry per activity. The fields:
 *
 *   id            the registry's name; the room's meta.mode except 'free'
 *   category      'flightclub' or 'operations', its hub
 *   card          the title card: its string keys (label, blurb, facts),
 *                 its picture, the world it seats (home), its way's id in
 *                 WAYS
 *   minPlayers    pilots here that keep a round going in a room made for
 *                 it (1: every lobby is played alone, the owner 2026-10-02)
 *   minElsewhere  the same in a room made for something else, where the
 *                 game is a host's start in passing
 *   allowSolo     Ready alone starts a round
 *   allowAI       AI pilots fill seats: false for every game since the
 *                 rooms' AI pilots left with the race (the combat-only
 *                 cut, 2026-10-19)
 *   allowDropIn   a pilot arriving mid round flies in, else it waits in
 *                 the lobby
 *   openEnded     the round has no end: on until the room is empty
 *   setting       the host's one choice between rounds, { key, choices }:
 *                 its key on the wire and on the room's meta, its values
 *                 (null where they are not a fixed list: the war's are the
 *                 missions on the room's map)
 *   consent       asks the war's one question before a pilot enters
 *                 (docs/WARFARE-PLAN.md section 9), and a room made for it
 *                 seats only a build that asks it (roomwire.js WAR_JOIN)
 *   publicOnlyWhenMadeFor  in a public room only when the room was made
 *                 for it, so nobody meets it without having chosen it
 *   makeable      offered on Make a room's Game row as is (the war has its
 *                 own rule there: only on its map)
 *   hidden        offered nowhere: no card draws it and home's Continue
 *                 never holds it (COMPLETENESS 81: one place to hide a
 *                 row, the author's decision over a flags system)
 */
export const MODES = [
  {
    id: 'war',
    category: 'operations',
    card: {
      way: 'campaign', label: 'campaign.card', blurb: 'campaign.card_blurb', facts: ['campaign.card_act', 'campaign.card_missions', 'campaign.card_shop'],
      art: 'assets/posters/itaipu.jpg', home: 'itaipu',
    },
    minPlayers: 1,
    minElsewhere: 1,
    allowSolo: true,
    allowAI: false,
    allowDropIn: true,
    openEnded: false,
    setting: { key: 'mission', choices: null },
    consent: true,
    publicOnlyWhenMadeFor: true,
    makeable: false,
    hidden: false,
  },
  {
    id: 'free',
    category: 'flightclub',
    card: {
      way: 'freestyle-wing1000', label: 'ui.free_flight_card', blurb: 'ui.card_line_flight', facts: ['ui.every_plane', 'ui.the_swiss_valley'],
      art: 'assets/gate/flight.jpg', home: 'swiss2',
    },
    minPlayers: 1,
    minElsewhere: 1,
    allowSolo: true,
    allowAI: false,
    allowDropIn: true,
    openEnded: true,
    setting: null,
    consent: false,
    publicOnlyWhenMadeFor: false,
    makeable: false,
    /* No card since free flight left PDCS (the combat-only cut,
     * 2026-10-20): the row stays because the Interior's room is a free
     * room on the wire (mode null, src/main.js opsEnter). */
    hidden: true,
  },
];

/*
 * WHO JOINS A SESSION (docs/redesign/SESSIONS.md section 2), the same
 * three for every activity, so none carries a field for it: public is a
 * listed room anybody drops into, friends a private room whose invite
 * code the lobby shows, solo a private room whose code it hides, so
 * nobody can join. Public by default (the owner, 2026-10-02); each
 * pilot's last choice per activity is settings.sessionVisibility, keyed
 * by the registry id, and read through visibilityFor so a value a build
 * never wrote falls back rather than reaching a room.
 */
export const VISIBILITIES = ['public', 'friends', 'solo'];
export const DEFAULT_VISIBILITY = 'public';
export function visibilityFor(settings, id) {
  const v = settings && settings.sessionVisibility ? settings.sessionVisibility[id] : null;
  return VISIBILITIES.includes(v) ? v : DEFAULT_VISIBILITY;
}

const BY_ID = new Map(MODES.map((m) => [m.id, m]));

/* The entry for a registry id, or null. */
export function modeById(id) {
  return BY_ID.get(id) ?? null;
}

/* A room's meta.mode as it travels (null for free flight) to the
 * registry's id, and back. */
export function modeOfWire(mode) {
  return mode == null ? 'free' : mode;
}
export function wireMode(id) {
  return id === 'free' ? null : id;
}

/* The entry for a room's meta.mode, null or a game's id; null for an id
 * the registry does not know. */
export function modeOfRoom(mode) {
  return modeById(modeOfWire(mode));
}

/* The games a room may be made for as is, and with the war, in the wire's
 * order (roomwire.js ROOM_MODES, ROOM_SETUPS). */
export const MAKEABLE = MODES.filter((m) => m.makeable).map((m) => m.id);
export const SETUPS = MODES.filter((m) => m.id !== 'free').map((m) => m.id);

/* Game `id`'s entry when the room (its meta.mode `roomMode`) was made for
 * it, else null: what separates a room's own game from one its host
 * starts in passing. */
export function madeFor(roomMode, id) {
  return modeOfWire(roomMode) === id ? modeById(id) : null;
}

/* The pilots here that keep game `id` going in a room made for `roomMode`
 * (its meta.mode): its own minimum in a room made for it, else the one
 * for a start in passing. */
export function minPlayersFor(id, roomMode) {
  const m = modeById(id);
  return modeOfWire(roomMode) === id ? m.minPlayers : m.minElsewhere;
}

/*
 * NAMED SESSION STATES (COMPLETENESS 4, docs/redesign/SESSIONS.md): the
 * states every game's round passes through, under one name each, so the
 * lobby, the HUD and the rooms panel ask one question of every game:
 *
 *   lobby      no round: the room's lobby, or none started yet
 *   countdown  a round started, its go still to come (the war's briefing
 *              too)
 *   live       the round flying
 *   between    a round of a match over and the next to come: the war's
 *              round result
 *   over       the round or match ended, its results standing
 *   abandoned  ended by the room because too few of its players were here
 *              (edge/rooms/core.js settleGames, ABANDON_MS), not by its end
 *              or its host
 *
 * Each game keeps its own states (GAME_STATES, as its view says them,
 * edge/rooms/<game>.js view(); free flight's is its lobby's `live`) and
 * sessionOf maps them, at the room's time. A countdown ends at the view's
 * goAt on the room clock. The room stamps each game's view with `session`,
 * as it stands when sent; a reader with the room clock maps the view
 * itself.
 */
export const SESSION_STATES = ['lobby', 'countdown', 'live', 'between', 'over', 'abandoned'];
/* A round under way, and one ended. */
export const SESSION_ON = ['countdown', 'live', 'between'];
export const SESSION_ENDED = ['over', 'abandoned'];

export const GAME_STATES = {
  war: ['lobby', 'briefing', 'countdown', 'live', 'won', 'lost', 'ended'],
  free: ['lobby', 'live'],
};

const ended = (v) => (v.abandoned ? 'abandoned' : 'over');
const GAME_SESSION = {
  war: {
    lobby: () => 'lobby',
    briefing: () => 'countdown',
    countdown: () => 'countdown',
    live: (v) => (v.roundState === 'result' ? 'between' : 'live'),
    won: () => 'over',
    lost: () => 'over',
    ended,
  },
  free: { lobby: () => 'lobby', live: () => 'live' },
};

/* Game `id`'s own state in its view: free flight's from its lobby's. */
export function gameStateOf(id, view) {
  if (id === 'free') {
    return view && view.live ? 'live' : 'lobby';
  }
  return view && typeof view.state === 'string' ? view.state : 'lobby';
}

/* Game `id`'s view as a named session state at room time `roomNow`
 * (room ms), or null for a state this build does not know (a newer
 * room's). No view is a lobby. */
export function sessionOf(id, view, roomNow) {
  const map = GAME_SESSION[id];
  const state = gameStateOf(id, view);
  if (!map || !Object.hasOwn(map, state)) {
    return null;
  }
  return map[state](view || {}, roomNow);
}
