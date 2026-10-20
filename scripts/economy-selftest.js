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
  FIRST_TOKENS, ITEMS, KIT_PRICE, earnedFrom, kitItem, grantCeiling, grantsFrom, itemById,
} from '../src/game/economy.js';
import { KITS, slotsFor } from '../configs/kits.js';
import { everyFirst, freshProgress, unlockables } from '../src/game/progress.js';
import {
  DECAL_KINDS, FINISHES, SHOP_DECALS, SHOP_FINISHES, newDecal,
} from '../configs/paint.js';
import { ACT1, INTERIOR, UPGRADES, released } from '../src/game/campaign.js';
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
    progress: { challenges: { first_course: true, deadstick: true, my_own: true }, lessons: { ...Object.fromEntries(LESSONS.map((l) => [l.id, 1759800000000])), my_lesson: 1 }, lessonsFlown: { ...Object.fromEntries(LESSONS.map((l) => [l.id, true])), my_lesson: true },
      played: { 'combat:alps': true, 'tag:swiss2': true } },
    campaign: { v: 1, missions: Object.fromEntries(everyFirst().filter((f) => f.key.startsWith('mission:')).map((f) => [f.key.split(':')[1], { stars: 99, won: true, credits: 0 }])) },
    flightTime: flight,
  },
};
const all = grantsFrom(everything);
check('a record holding every fact there is pays exactly the ceiling', sum(all) === grantCeiling(), `${sum(all)} against ${grantCeiling()}`);
check('every first there is is granted by the record holding every fact, at a whole, positive amount',
  everyFirst().every((f) => all.some((g) => g.key === `first:${f.key}` && Number.isInteger(g.amount) && g.amount > 0)) && Number.isInteger(grantCeiling()));
/* A room game finished once per world paid FIRST_TOKENS.game until
 * Streamer Combat and Catch the Ace! left (the combat-only cut,
 * 2026-10-20): a record's stored `played` flags now pay nothing new, and
 * the grants paid before stay in the wallet (tracks-api/wallet.js inserts,
 * never takes back). */
check('a room game\'s stored played flags pay nothing since its game left', !all.some((g) => g.key.startsWith('first:game:')));
check('every grant key is unique, so the server pays each once', new Set(all.map((g) => g.key)).size === all.length);
/* The seven challenges paid 50 each until they left with Flight Club
 * (the combat-only cut, 2026-10-20): a record's stored challenge flags
 * now pay nothing new, and the grants paid before stay in the wallet. */
check('a record\'s stored challenges pay nothing since the challenges left', !all.some((g) => g.key.startsWith('challenge:')));
check('a made up challenge, lesson, mission or aircraft pays nothing; every known lesson pays', !all.some((g) => /my_own|my_lesson/.test(g.key))
  && LESSONS.every((l) => all.some((g) => g.key === `first:lesson:${l.id}` && g.amount === FIRST_TOKENS.lesson))
  && grantsFrom({ data: { campaign: { missions: { 'my-war-1': { stars: 3, won: true } } }, flightTime: addFlight({}, 'everydevice1', 'notaplane', 'free', 1e6, '2026-10-01') } }).length === 0);
const twice = { ...everything, data: { ...everything.data, flightTime: addFlight(flight, 'otherdevice2', 'cub1400', 'free', 1e6, '2026-10-02') } };
check('more flying on the same aircraft pays nothing more: repetition never pays', sum(grantsFrom(twice)) === sum(all));
check('an empty record pays nothing', grantsFrom(null).length === 0 && grantsFrom({}).length === 0);
check('the amounts are whole and positive', all.every((g) => Number.isInteger(g.amount) && g.amount > 0));

check('a lesson passed but not flown pays no tokens, nor one that left with Flight Club', grantsFrom({ data: { progress: { lessons: { defence_track: 5, defence_intercept: 5, first_unaided: 5 }, lessonsFlown: { defence_intercept: true, first_unaided: true } } } }).map((g) => g.key).join() === 'first:lesson:defence_intercept');

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
check('the gold finish is earned with every released mission won, the ribbon with three stars', earnedFrom(everything).filter((id) => !id.startsWith('kit:')).sort().join() === 'decal:ribbon,finish:gold'
  && earnedFrom({ data: { campaign: { missions: { 'itaipu-1': { stars: 2, won: true } } } } }).length === 0);
/*
 * THE GOLD FINISH IS NEVER EVERY ACCOUNT'S (the combat-only cut,
 * 2026-10-20): its feat was every challenge done, and with the challenges
 * gone that read 0 === 0, which the next sync would have granted to every
 * account. No record that has not won every released mission earns it:
 * none, a fresh one, and one from before the cut that holds every
 * challenge and lesson there was.
 */
const RELEASED = [...ACT1, ...INTERIOR].filter((m) => released(m.id)).map((m) => m.id);
const wonAll = (ids) => ({ v: 1, data: { campaign: { v: 1, missions: Object.fromEntries(ids.map((id) => [id, { stars: 1, won: true, credits: 0 }])) } } });
const PRE_CUT = ['first_course', 'timber_clean', 'hoops_10', 'slowstick_three', 'kadet_small_tank', 'deadstick', 'bombshell_glide'];
const preCut = { v: 1, data: { progress: { ...freshProgress(false), challenges: Object.fromEntries(PRE_CUT.map((id) => [id, true])),
  lessons: { first_sticks: 1, wing_eight: 1, glider_land: 1, quad_acro: 1 }, lessonsFlown: { first_sticks: true, wing_eight: true }, played: { 'tag:swiss2': true } } } };
const gold = (blob) => earnedFrom(blob).includes('finish:gold');
check('no gold for no record, an empty one or a fresh one', !gold(null) && !gold({}) && !gold({ v: 1, data: {} }) && !gold({ v: 1, data: { progress: freshProgress(false) } }));
check('no gold for a pre-cut record holding every challenge and lessons', !gold(preCut));
check('no gold with one released mission still to win, gold with all of them', RELEASED.length > 1
  && RELEASED.every((id) => !gold(wonAll(RELEASED.filter((x) => x !== id)))) && gold(wonAll(RELEASED)), RELEASED.join());
check('itemById knows each and nothing else', ITEMS.every((it) => itemById(it.id) === it) && itemById('finish:chrome') === null);

check('every item\'s paint exists, and the shop lists are exactly the items', PAINTED.every((it) => (it.kind === 'finish' ? FINISHES.includes(it.paint) : Boolean(DECAL_KINDS[it.paint])))
  && ITEMS.filter((it) => it.kind === 'finish').map((it) => it.paint).sort().join() === [...SHOP_FINISHES].sort().join()
  && ITEMS.filter((it) => it.kind === 'decal').map((it) => it.paint).sort().join() === [...SHOP_DECALS].sort().join());
check('everything the shop sells costs less than a pilot who flies everything once is paid', ITEMS.reduce((n, it) => n + (it.price ?? 0), 0) <= grantCeiling(),
  `${ITEMS.reduce((n, it) => n + (it.price ?? 0), 0)} against ${grantCeiling()}`);
check('a shop decal is a valid decal', SHOP_DECALS.every((k) => newDecal(k, [0, 0, 0], [0, 1, 0]).k === k));
check('no shop item is a level unlock, so Unlock all cannot give it', !unlockables().some((u) => (u.kind === 'finish' && SHOP_FINISHES.includes(u.id)) || (u.kind === 'decal' && SHOP_DECALS.includes(u.id))));

console.log('the tables');
check('the tables are the contract\'s', FIRST_TOKENS.win === 60);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
