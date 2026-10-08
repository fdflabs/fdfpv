/*
 * economy-selftest.js: the token catalog's rules (src/game/economy.js,
 * docs/ECONOMY.md section 2), in Node. What the server does with them is
 * tracks-api/accounts-selftest.js.
 *
 *  * This file is part of the Paraguayan Drone Combat Simulator.
 *  *
 *  * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 *  * it under the terms of the GNU General Public License as published by
 *  * the Free Software Foundation, either version 3 of the License, or (at
 *  * your option) any later version.
 *  *
 *  * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 *  * WITHOUT ANY WARRANTY, without even the implied warranty of
 *  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 *  * General Public License for more details.
 *  *
 *  * You should have received a copy of the GNU General Public License
 *  * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  CHALLENGE_TOKENS, EVENT_TIERS, FIRST_TOKENS, ITEMS, KIT_PRICE, earnedFrom, kitItem, eventGrants, grantCeiling, grantsFrom, itemById,
} from '../src/game/economy.js';
import { KITS, slotsFor } from '../configs/kits.js';
import { CHALLENGES, everyFirst, unlockables } from '../src/game/progress.js';
import {
  DECAL_KINDS, FINISHES, SHOP_DECALS, SHOP_FINISHES, newDecal,
} from '../configs/paint.js';
import { UPGRADES } from '../src/game/campaign.js';
import { LESSONS } from '../src/game/training.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { addFlight } from '../src/share/flighttime.js';

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
const sum = (gs) => gs.reduce((n, g) => n + g.amount, 0);

console.log('grants are finite and paid once');
let flight = {};
for (const af of AIRFRAMES) {
  flight = addFlight(flight, 'everydevice1', af.id, 'free', 1e6, '2026-10-01');
}
const everything = {
  v: 1,
  data: {
    progress: { challenges: { ...Object.fromEntries(CHALLENGES.map((c) => [c.id, true])), my_own: true }, lessons: { ...Object.fromEntries(LESSONS.map((l) => [l.id, 1759800000000])), my_lesson: 1 }, lessonsFlown: { ...Object.fromEntries(LESSONS.map((l) => [l.id, true])), my_lesson: true } },
    campaign: { v: 1, missions: Object.fromEntries(everyFirst().filter((f) => f.key.startsWith('mission:')).map((f) => [f.key.split(':')[1], { stars: 99, won: true, credits: 0 }])) },
    flightTime: flight,
  },
};
const all = grantsFrom(everything);
check('a record holding every fact there is pays exactly the ceiling', sum(all) === grantCeiling(), `${sum(all)} against ${grantCeiling()}`);
check('every grant key is unique, so the server pays each once', new Set(all.map((g) => g.key)).size === all.length);
check('a made up challenge, lesson, mission or aircraft pays nothing; every known lesson pays', !all.some((g) => /my_own|my_lesson/.test(g.key))
  && LESSONS.every((l) => all.some((g) => g.key === `first:lesson:${l.id}` && g.amount === FIRST_TOKENS.lesson))
  && grantsFrom({ data: { campaign: { missions: { 'my-war-1': { stars: 3, won: true } } }, flightTime: addFlight({}, 'everydevice1', 'notaplane', 'free', 1e6, '2026-10-01') } }).length === 0);
const twice = { ...everything, data: { ...everything.data, flightTime: addFlight(flight, 'otherdevice2', 'cub1400', 'free', 1e6, '2026-10-02') } };
check('more flying on the same aircraft pays nothing more: repetition never pays', sum(grantsFrom(twice)) === sum(all));
check('an empty record pays nothing', grantsFrom(null).length === 0 && grantsFrom({}).length === 0);
check('the amounts are whole and positive', all.every((g) => Number.isInteger(g.amount) && g.amount > 0));

check('a lesson covered by a skip, passed but not flown, pays no tokens', grantsFrom({ data: { progress: { lessons: { first_takeoff: 5, first_unaided: 5 }, lessonsFlown: { first_unaided: true } } } }).map((g) => g.key).join() === 'first:lesson:first_unaided');

console.log('three currencies, never exchanged');
check('no grant reads or pays war credits', !all.some((g) => /credit/.test(g.key)));
const rich = JSON.parse(JSON.stringify(everything));
rich.data.campaign.earned = 1e6;
check('a million war credits pay no token', sum(grantsFrom(rich)) === sum(all));
check('no shop item is a war upgrade', !ITEMS.some((it) => UPGRADES.some((u) => it.id.endsWith(u.id))));
const PAINTED = ITEMS.filter((it) => it.kind !== 'kit');
check('every item is a finish, a decal or a visual kit option: nothing changes flight', PAINTED.every((it) => ['finish', 'decal'].includes(it.kind) && it.id === `${it.kind}:${it.paint}`)
  && ITEMS.filter((it) => it.kind === 'kit').every((it) => slotsFor(it.family).some((sl) => sl.id === it.slot && sl.options.includes(it.option) && it.option !== 'stock')));
check('every kit family sells at most two and earns one (lead decision 2026-10-08); one with no kit yet has none', Object.keys(KITS).every((f) => {
  const mine = ITEMS.filter((it) => it.kind === 'kit' && it.family === f);
  if (!slotsFor(f).length) {
    return mine.length === 0;
  }
  return mine.filter((it) => it.price).length <= 2 && mine.filter((it) => it.earn).length === 1 && mine.find((it) => it.earn).earn === `hour:${f}`;
}));
check('a kit option is earned by an hour on that aircraft and not before', earnedFrom({ data: { flightTime: { device01: { first: '2026-10-01', by: { sky1800: { free: 3600 } } } } } }).join() === 'kit:sky1800:wingtips:winglet'
  && earnedFrom({ data: { flightTime: { device01: { first: '2026-10-01', by: { sky1800: { free: 3599 } } } } } }).length === 0);
check('kitItem finds a sold option and nothing for a free one', kitItem('7inch', 'arms', 'tapered').price === KIT_PRICE && kitItem('7inch', 'arms', 'blade') === null);

console.log('the shop');
check('every item is sold or earned, never both', ITEMS.every((it) => Number.isInteger(it.price) !== Boolean(it.earn)));
check('flying everything once buys the whole shop', ITEMS.filter((it) => it.price).reduce((n, it) => n + it.price, 0) <= grantCeiling());
check('the gold finish is earned with all seven challenges, the ribbon with three stars', earnedFrom(everything).filter((id) => !id.startsWith('kit:')).sort().join() === 'decal:ribbon,finish:gold'
  && earnedFrom({ data: { campaign: { missions: { 'itaipu-1': { stars: 2, won: true } } } } }).length === 0);
check('itemById knows each and nothing else', ITEMS.every((it) => itemById(it.id) === it) && itemById('finish:chrome') === null);

check('every item\'s paint exists, and the shop lists are exactly the items', PAINTED.every((it) => (it.kind === 'finish' ? FINISHES.includes(it.paint) : Boolean(DECAL_KINDS[it.paint])))
  && ITEMS.filter((it) => it.kind === 'finish').map((it) => it.paint).sort().join() === [...SHOP_FINISHES].sort().join()
  && ITEMS.filter((it) => it.kind === 'decal').map((it) => it.paint).sort().join() === [...SHOP_DECALS].sort().join());
check('a shop decal is a valid decal', SHOP_DECALS.every((k) => newDecal(k, [0, 0, 0], [0, 1, 0]).k === k));
check('no shop item is a level unlock, so Unlock all cannot give it', !unlockables().some((u) => (u.kind === 'finish' && SHOP_FINISHES.includes(u.id)) || (u.kind === 'decal' && SHOP_DECALS.includes(u.id))));

console.log('Flight Club events');
check('a gold pays every tier under it, keyed by event', sum(eventGrants('2026-w41-alps', 'gold')) === Object.values(EVENT_TIERS).reduce((a, b) => a + b, 0)
  && eventGrants('2026-w41-alps', 'bronze').map((g) => g.key).join() === 'event:2026-w41-alps:finish,event:2026-w41-alps:bronze');
check('a bad id or tier pays nothing', eventGrants('Not An Id', 'gold').length === 0 && eventGrants('2026-w41-alps', 'platinum').length === 0);
check('the tables are the contract\'s', FIRST_TOKENS.win === 60 && CHALLENGE_TOKENS === 50 && EVENT_TIERS.gold === 100);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
