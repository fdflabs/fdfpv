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

import { GOALS } from './roomtag.js';
import { RUN_SECONDS } from './roomjam.js';

/* A combat round's lengths in minutes, the host's choice between rounds;
 * the first is a room's until its host picks. */
export const ROUND_MINUTES = [3, 5];

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
 *   allowAI       AI pilots fill seats: none exist (the owner, 2026-10-02:
 *                 not before a later phase)
 *   allowDropIn   a pilot arriving mid round flies in; a race went off a
 *                 grid, so its newcomer waits in the lobby
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
 *   straightToLobby  a room made for it skips the results pause and goes
 *                 back to its lobby when a round ends (combat.js)
 *   makeable      offered on Make a room's Game row as is (the war has its
 *                 own rule there: only on its map)
 */
export const MODES = [
  {
    id: 'race',
    category: 'flightclub',
    card: {
      way: 'race-5inch', label: 'ui.track_mode', blurb: 'ui.card_line_race', facts: ['ui.gates', 'ui.the_clock', 'ui.the_board'],
      art: 'assets/gate/race.jpg', home: null,
    },
    minPlayers: 1,
    minElsewhere: 1,
    allowSolo: true,
    allowAI: false,
    allowDropIn: false,
    openEnded: false,
    setting: null,
    consent: false,
    publicOnlyWhenMadeFor: false,
    straightToLobby: false,
    makeable: true,
  },
  {
    id: 'tag',
    category: 'flightclub',
    card: {
      way: 'ace', label: 'roomtag.section', blurb: 'roomtag.card_blurb', facts: ['roomtag.card_crown', 'roomtag.card_touch', 'friends.card_code'],
      art: 'assets/gate/ace.jpg', home: 'swiss2',
    },
    minPlayers: 1,
    minElsewhere: 2,
    allowSolo: true,
    allowAI: false,
    allowDropIn: true,
    openEnded: false,
    setting: { key: 'goal', choices: GOALS.map((g) => g.goal) },
    consent: false,
    publicOnlyWhenMadeFor: false,
    straightToLobby: false,
    makeable: true,
  },
  {
    id: 'combat',
    category: 'flightclub',
    card: {
      way: 'combat', label: 'combat.card', blurb: 'combat.card_blurb', facts: ['combat.card_cut', 'combat.card_rounds', 'friends.card_code'],
      art: 'assets/gate/combat.jpg', home: 'swiss2',
    },
    minPlayers: 1,
    minElsewhere: 2,
    allowSolo: true,
    allowAI: false,
    allowDropIn: true,
    openEnded: false,
    setting: { key: 'minutes', choices: ROUND_MINUTES },
    consent: false,
    publicOnlyWhenMadeFor: false,
    straightToLobby: true,
    makeable: true,
  },
  {
    id: 'jam',
    category: 'flightclub',
    card: {
      way: 'jam', label: 'jam.card', blurb: 'jam.card_blurb', facts: ['jam.card_runs', 'jam.card_rounds', 'friends.card_code'],
      art: 'assets/gate/flight.jpg', home: 'swiss2',
    },
    minPlayers: 1,
    minElsewhere: 2,
    allowSolo: true,
    allowAI: false,
    /* A newcomer watches the match out: its turn order was set at the
     * start (docs/JAM-PLAN.md). */
    allowDropIn: false,
    openEnded: false,
    setting: { key: 'seconds', choices: RUN_SECONDS },
    consent: false,
    publicOnlyWhenMadeFor: false,
    straightToLobby: false,
    makeable: true,
  },
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
    straightToLobby: false,
    makeable: false,
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
    straightToLobby: false,
    makeable: false,
  },
];

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
