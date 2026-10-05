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

import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import en from '../src/strings/en.js';
import {
  MAKEABLE, MODES, ROUND_MINUTES, SETUPS, minPlayersFor, modeById, modeOfRoom, modeOfWire, wireMode,
} from '../src/share/modes.js';
import { ROOM_MODES, ROOM_SETUPS } from '../src/share/roomwire.js';
import { GOALS } from '../src/share/roomtag.js';
import { MAPS } from '../src/maps/registry.js';
import { WAYS } from '../src/ui/ui.js';
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
check('the five activities, each once', ids.length === 5 && new Set(ids).size === 5 && ['race', 'tag', 'combat', 'war', 'free'].every((id) => ids.includes(id)), ids.join(','));
const BOOLS = ['allowSolo', 'allowAI', 'allowDropIn', 'openEnded', 'consent', 'publicOnlyWhenMadeFor', 'straightToLobby', 'makeable'];
const worlds = new Set(MAPS.filter((m) => m.mode === 'freestyle').map((m) => m.id));
for (const m of MODES) {
  check(`${m.id}: category is a hub`, ['flightclub', 'operations'].includes(m.category), m.category);
  check(`${m.id}: flags are booleans`, BOOLS.every((k) => typeof m[k] === 'boolean'), BOOLS.filter((k) => typeof m[k] !== 'boolean').join(','));
  check(`${m.id}: player minimums are whole and at least 1`, [m.minPlayers, m.minElsewhere].every((n) => Number.isInteger(n) && n >= 1));
  check(`${m.id}: allowSolo is a minimum of 1`, m.allowSolo === (m.minPlayers === 1));
  check(`${m.id}: no AI pilots (none exist)`, m.allowAI === false);
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
check('ROOM_MODES is race, tag, combat, in that order', JSON.stringify(ROOM_MODES) === JSON.stringify(['race', 'tag', 'combat']), JSON.stringify(ROOM_MODES));
check('ROOM_SETUPS is ROOM_MODES then war', JSON.stringify(ROOM_SETUPS) === JSON.stringify(['race', 'tag', 'combat', 'war']), JSON.stringify(ROOM_SETUPS));
check('ROOM_MODES is the registry\'s makeable', JSON.stringify(ROOM_MODES) === JSON.stringify(MAKEABLE));
check('ROOM_SETUPS is the registry\'s setups', JSON.stringify(ROOM_SETUPS) === JSON.stringify(SETUPS));
check('combat rounds are 3 or 5 minutes', JSON.stringify(ROUND_MINUTES) === '[3,5]');
check('tag goals are roomtag\'s', JSON.stringify(modeById('tag').setting.choices) === JSON.stringify(GOALS.map((g) => g.goal)));
check('setting keys: war mission, combat minutes, tag goal',
  modeById('war').setting.key === 'mission' && modeById('combat').setting.key === 'minutes' && modeById('tag').setting.key === 'goal'
  && modeById('race').setting === null && modeById('free').setting === null);
check('a race is the one round a newcomer waits out', MODES.filter((m) => !m.allowDropIn).map((m) => m.id).join() === 'race');
check('only free flight is open ended', MODES.filter((m) => m.openEnded).map((m) => m.id).join() === 'free');
check('only the war asks consent and is public only when made for', MODES.filter((m) => m.consent).map((m) => m.id).join() === 'war'
  && MODES.filter((m) => m.publicOnlyWhenMadeFor).map((m) => m.id).join() === 'war');
check('only combat goes straight back to its lobby', MODES.filter((m) => m.straightToLobby).map((m) => m.id).join() === 'combat');
check('combat and tag need two in passing, one in their own room', minPlayersFor('combat', 'combat') === 1 && minPlayersFor('combat', null) === 2
  && minPlayersFor('tag', 'tag') === 1 && minPlayersFor('tag', 'race') === 2 && minPlayersFor('race', null) === 1 && minPlayersFor('war', 'war') === 1);
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
check('every card on the title is an activity of the registry, or a campaign of ops missions', cards.filter((w) => !w.opsCampaign).every((w) => MODES.some((m) => m.card.way === w.id)), cards.map((w) => w.id).join(','));
check('a campaign card is a campaign of src/game/campaign.js, in Operations, with no lobby', opsCards.length > 0 && opsCards.every((w) => w.opsCampaign === INTERIOR_CAMPAIGN.id && w.category === 'operations' && !Object.hasOwn(w, 'lobby')),
  opsCards.map((w) => `${w.id}:${w.opsCampaign}:${w.category}`).join());

console.log('modes: the wire');
check('free flight is null on the wire', wireMode('free') === null && modeOfWire(null) === 'free' && modeOfWire(undefined) === 'free');
check('a game is its own id on the wire', ['race', 'tag', 'combat', 'war'].every((id) => wireMode(id) === id && modeOfWire(id) === id));
check('a room\'s mode finds its entry, an unknown one none', modeOfRoom(null) === modeById('free') && modeOfRoom('war') === modeById('war') && modeOfRoom('nope') === null);
check('\'free\' never reaches a wire list', !ROOM_SETUPS.includes('free') && !ROOM_MODES.includes('free'));

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
