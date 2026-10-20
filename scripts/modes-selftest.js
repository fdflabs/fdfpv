/*
 * modes-selftest.js: the mode registry (src/share/modes.js) is whole, and
 * the tables that read it agree with it.
 *
 * Node only. Every entry's fields are present and of their kind, its
 * card's strings are in the string table and its picture is a file, the
 * wire mapping is a round trip, and ROOM_MODES and ROOM_SETUPS are the
 * registry's in the wire's order with their values of before
 * (docs/FLOW-AUDIT.md: the wire is a published contract), and the title's
 * cards (src/ui/ui.js WAYS) wear the registry's faces and open its
 * lobbies. The page's lobby table (src/main.js LOBBY_GAMES) lives in a
 * closure Node cannot reach; the browser checks game:lobby and modes:card
 * are its proof.
 *
 * Run with npm run modes:selftest.
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

import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import en from '../src/strings/en.js';
import {
  GAME_STATES, MAKEABLE, MODES, SESSION_ENDED, SESSION_ON, SESSION_STATES, SETUPS, gameStateOf, minPlayersFor, modeById, modeOfRoom, modeOfWire,
  sessionOf, wireMode,
} from '../src/share/modes.js';
import { ROOM_MODES, ROOM_SETUPS } from '../src/share/roomwire.js';
import { MAPS } from '../src/maps/registry.js';
import { WAYS } from '../src/ui/ui.js';
import { gateWays } from '../src/ui/ways.js';
import { INTERIOR_CAMPAIGN } from '../src/game/campaign.js';
import { str } from '../src/strings/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
const exists = (p) => access(join(root, p)).then(() => true, () => false);

console.log('modes: the entries');
const ids = MODES.map((m) => m.id);
check('the two activities, each once', ids.length === 2 && new Set(ids).size === 2 && ['war', 'free'].every((id) => ids.includes(id)), ids.join(','));
const BOOLS = ['allowSolo', 'allowAI', 'allowDropIn', 'openEnded', 'consent', 'publicOnlyWhenMadeFor', 'makeable', 'hidden'];
const worlds = new Set(MAPS.filter((m) => m.mode === 'freestyle').map((m) => m.id));
for (const m of MODES) {
  check(`${m.id}: category is a hub`, ['flightclub', 'operations'].includes(m.category), m.category);
  check(`${m.id}: flags are booleans`, BOOLS.every((k) => typeof m[k] === 'boolean'), BOOLS.filter((k) => typeof m[k] !== 'boolean').join(','));
  check(`${m.id}: player minimums are whole and at least 1`, [m.minPlayers, m.minElsewhere].every((n) => Number.isInteger(n) && n >= 1));
  check(`${m.id}: allowSolo is a minimum of 1`, m.allowSolo === (m.minPlayers === 1));
  check(`${m.id}: no AI pilots: the room flies none`, m.allowAI === false);
  check(`${m.id}: setting is null or a key with choices`, m.setting === null
    || (typeof m.setting.key === 'string' && (m.setting.choices === null || (Array.isArray(m.setting.choices) && m.setting.choices.length > 0))));
  const c = m.card;
  const keys = [c.label, c.blurb, ...c.facts];
  check(`${m.id}: card strings are in the table`, keys.every((k) => typeof en[k] === 'string'), keys.filter((k) => typeof en[k] !== 'string').join(','));
  check(`${m.id}: two to four tags`, c.facts.length >= 2 && c.facts.length <= 4);
  check(`${m.id}: card picture is a file`, await exists(c.art), c.art);
  check(`${m.id}: card world is a world or none`, c.home === null || worlds.has(c.home), String(c.home));
  check(`${m.id}: card names its way`, typeof c.way === 'string' && c.way.length > 0);
}
check('every card way is distinct', new Set(MODES.map((m) => m.card.way)).size === MODES.length);

console.log('modes: what the tables held before');
check('ROOM_MODES is none: no game a room is made for as is', JSON.stringify(ROOM_MODES) === '[]', JSON.stringify(ROOM_MODES));
check('ROOM_SETUPS is ROOM_MODES then war', JSON.stringify(ROOM_SETUPS) === JSON.stringify(['war']), JSON.stringify(ROOM_SETUPS));
check('ROOM_MODES is the registry\'s makeable', JSON.stringify(ROOM_MODES) === JSON.stringify(MAKEABLE));
check('ROOM_SETUPS is the registry\'s setups', JSON.stringify(ROOM_SETUPS) === JSON.stringify(SETUPS));
check('setting keys: war mission, none for free flight',
  modeById('war').setting.key === 'mission' && modeById('free').setting === null);
check('every round takes a newcomer in', MODES.every((m) => m.allowDropIn));
check('only free flight is open ended', MODES.filter((m) => m.openEnded).map((m) => m.id).join() === 'free');
check('only the war asks consent and is public only when made for', MODES.filter((m) => m.consent).map((m) => m.id).join() === 'war'
  && MODES.filter((m) => m.publicOnlyWhenMadeFor).map((m) => m.id).join() === 'war');
/* A hidden row reaches no card (COMPLETENESS 81): the title's cards from
 * a registry hiding Free Flight have no card for it, and keep every
 * other. */
{
  const hideFree = MODES.map((m) => (m.id === 'free' ? { ...m, hidden: true } : m));
  const shown = gateWays(WAYS, MODES).map((w) => w.id);
  const without = gateWays(WAYS, hideFree).map((w) => w.id);
  check('no activity is hidden today, and every card is drawn', MODES.every((m) => !m.hidden) && shown.join() === WAYS.filter((w) => w.gate !== false).map((w) => w.id).join(), shown.join());
  check('a hidden row reaches no card: hiding Free Flight draws every card but its own', !without.includes('freestyle-wing1000') && without.join() === shown.filter((id) => id !== 'freestyle-wing1000').join(), without.join());
}
check('the war needs one, in its own room or another', minPlayersFor('war', 'war') === 1 && minPlayersFor('war', null) === 1);
check('the war is Operations, the rest Flight Club', MODES.filter((m) => m.category === 'operations').map((m) => m.id).join() === 'war');

console.log('modes: the title\'s cards (src/ui/ui.js WAYS)');
for (const m of MODES) {
  const way = WAYS.find((w) => w.id === m.card.way);
  check(`${m.id}: its card is the way ${m.card.way}, on the title`, Boolean(way) && way.gate !== false);
  check(`${m.id}: the card's lobby is the room's mode`, Boolean(way) && way.lobby === wireMode(m.id), way && String(way.lobby));
  check(`${m.id}: the card wears the registry's face`, Boolean(way) && way.label === str(m.card.label) && way.blurb === str(m.card.blurb)
    && way.art === m.card.art && JSON.stringify(way.facts) === JSON.stringify(m.card.facts.map((k) => str(k))) && (way.home ?? null) === m.card.home);
}
const cards = WAYS.filter((w) => w.gate !== false);
/* A campaign of ops missions is a card with no room mode yet
 * (docs/campaign/interior/CONTRACT-P0.md section 12): it must be one of
 * the campaigns src/game/campaign.js lists, in Operations, and nothing
 * else may skip the registry. */
const opsCards = cards.filter((w) => w.opsCampaign);
/* Defence training is lessons, each flown in a war room the lesson makes
 * itself, so it has no mode either (docs/TRAINING-DAMAGE-CONTRACT.md):
 * one card, in Operations. */
const trainingCards = cards.filter((w) => w.training);
check('every card on the title is an activity of the registry, a campaign of ops missions, or Defence training', cards.filter((w) => !w.opsCampaign && !w.training).every((w) => MODES.some((m) => m.card.way === w.id)), cards.map((w) => w.id).join(','));
check('Defence training is one card, in Operations, with no lobby', trainingCards.length === 1 && trainingCards[0].category === 'operations' && !Object.hasOwn(trainingCards[0], 'lobby'));
check('a campaign card is a campaign of src/game/campaign.js, in Operations, with no lobby', opsCards.length > 0 && opsCards.every((w) => w.opsCampaign === INTERIOR_CAMPAIGN.id && w.category === 'operations' && !Object.hasOwn(w, 'lobby')),
  opsCards.map((w) => `${w.id}:${w.opsCampaign}:${w.category}`).join());

console.log('modes: the wire');
check('free flight is null on the wire', wireMode('free') === null && modeOfWire(null) === 'free' && modeOfWire(undefined) === 'free');
check('a game is its own id on the wire', wireMode('war') === 'war' && modeOfWire('war') === 'war');
check('a room\'s mode finds its entry, an unknown one none', modeOfRoom(null) === modeById('free') && modeOfRoom('war') === modeById('war') && modeOfRoom('nope') === null);
check('\'free\' never reaches a wire list', !ROOM_SETUPS.includes('free') && !ROOM_MODES.includes('free'));

console.log('modes: the named session states');
check('every activity has its own states listed, and nothing else does', JSON.stringify(Object.keys(GAME_STATES).sort()) === JSON.stringify(MODES.map((m) => m.id).sort()),
  Object.keys(GAME_STATES).join());
check('on and ended are named states, apart, with lobby in neither', [...SESSION_ON, ...SESSION_ENDED].every((x) => SESSION_STATES.includes(x))
  && !SESSION_ON.some((x) => SESSION_ENDED.includes(x)) && !SESSION_ON.includes('lobby') && !SESSION_ENDED.includes('lobby'));
/* Each game's every state, in each of the views it can take (the clock
 * before and after a goAt, a round's first turn, a result standing, an
 * abandon), names one of SESSION_STATES. */
const variants = [{}, { goAt: 1000 }, { abandoned: true }, { nextAt: 5 }, { roundState: 'result' }, { turn: 0, round: 1 }, { turn: 0, round: 2 }, { turn: 2, round: 1 }];
for (const id of Object.keys(GAME_STATES)) {
  const bad = [];
  for (const state of GAME_STATES[id]) {
    for (const extra of variants) {
      const view = id === 'free' ? { live: state === 'live', ...extra } : { state, ...extra };
      for (const t of [0, 2000]) {
        const named = sessionOf(id, view, t);
        if (!SESSION_STATES.includes(named) || gameStateOf(id, view) !== state) {
          bad.push(`${state}${JSON.stringify(extra)}@${t}:${named}`);
        }
      }
    }
  }
  check(`${id}: every one of its states maps to a named state`, !bad.length, bad.slice(0, 4).join(' '));
}
const named = (id, view, t = 0) => sessionOf(id, view, t);
check('no view is a lobby; a state this build does not know names none, nor a game it does not know', named('war', null) === 'lobby' && named('war', { state: 'overtime' }) === null
  && named('tag', { state: 'live' }) === null);
check('the war: its briefing a countdown, a round result between, won and lost over, ended over or abandoned',
  [named('war', { state: 'briefing' }), named('war', { state: 'countdown' }), named('war', { state: 'live', roundState: 'live' }), named('war', { state: 'live', roundState: 'result' }),
    named('war', { state: 'won' }), named('war', { state: 'lost' }), named('war', { state: 'ended' }), named('war', { state: 'ended', abandoned: true })].join()
    === 'countdown,countdown,live,between,over,over,over,abandoned');
check('free flight: its lobby until it flies, then live, never over', named('free', { live: false }) === 'lobby' && named('free', { live: true }) === 'live');

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
