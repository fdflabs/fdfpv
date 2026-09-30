/*
 * campaign-selftest.js: Defend the Paraná's state and its merge
 * (src/game/campaign.js) and what it says to the war room
 * (src/share/campaignwar.js), in plain Node. Run with
 * npm run campaign:selftest.
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

import {
  ACT1, UPGRADES, applyResult, buy, campaignOwned, cannotBuy, cleanCampaign, createCampaignStore, credits,
  emptyCampaign, equip, expectedCredits, TWO_STAR_KILLS, gateOpen, loadoutOf, mergeCampaign, spent, starsOf, unlocked,
} from '../src/game/campaign.js';
import { loadoutDue, loadoutMessage, resultOf, startMessage } from '../src/share/campaignwar.js';
import { MISSIONS } from '../src/share/war/missions/index.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function throws(fn) {
  try {
    fn();
    return false;
  } catch (e) {
    return true;
  }
}

console.log('campaign state');
const fresh = emptyCampaign();
check('a fresh campaign: no credits, standard loadout', credits(fresh) === 0
  && same(loadoutOf(fresh), { rack: 4, warhead: 'standard', speedMul: 1 }), JSON.stringify(loadoutOf(fresh)));
check('mission 1 is open and free, the rest wait in order', unlocked(fresh, 0) && !unlocked(fresh, 1) && ACT1[0].free
  && ACT1.slice(1).every((m) => !m.free));
check('mission 1 is in this build', Object.hasOwn(MISSIONS, ACT1[0].id));
check('the full game gate is open for now, missions and shop', campaignOwned() && ACT1.every((m, i) => gateOpen(i)) && gateOpen(null));

let s = applyResult(fresh, 'itaipu-1', { stars: 2, credits: 225, won: true });
check('a won result: stars, credits, the next mission opens', starsOf(s, 'itaipu-1') === 2 && credits(s) === 225 && unlocked(s, 1));
s = applyResult(s, 'itaipu-1', { stars: 1, credits: 100, won: false });
check('a worse replay keeps the best stars and won, and still pays', starsOf(s, 'itaipu-1') === 2 && s.missions['itaipu-1'].won
  && s.missions['itaipu-1'].credits === 225 && credits(s) === 325);
check('stars are clamped to 0..3', starsOf(applyResult(fresh, 'itaipu-2', { stars: 9, credits: 0, won: true }), 'itaipu-2') === 3);
check('a lost mission does not open the next', !unlocked(applyResult(fresh, 'itaipu-1', { stars: 1, credits: 100, won: false }), 1));

console.log('the shop');
check('nothing to buy with no credits', cannotBuy(fresh, 'wide') === 'credits');
check('the hunter warning is shown, never sold', cannotBuy(s, 'warning') === 'later' && UPGRADES.find((u) => u.id === 'warning').later === 2);
check('rack +2 needs rack +1', cannotBuy(applyResult(fresh, 'x', { stars: 0, credits: 5000, won: false }), 'rack-2') === 'needs');
let rich = applyResult(fresh, 'itaipu-1', { stars: 3, credits: 5000, won: true });
rich = buy(rich, 'wide');
check('buying a warhead equips it and spends its price', rich.equipped.warhead === 'wide' && credits(rich) === 5000 - 500);
check('bought twice is refused', cannotBuy(rich, 'wide') === 'owned' && throws(() => buy(rich, 'wide')));
rich = buy(buy(buy(rich, 'rack-1'), 'rack-2'), 'speed');
check('rack stacks twice, speed on', same(loadoutOf(rich), { rack: 6, warhead: 'wide', speedMul: 1.15 }), JSON.stringify(loadoutOf(rich)));
rich = equip(equip(rich, 'warhead', 'standard'), 'speed', false);
check('equip back to standard, speed off', same(loadoutOf(rich), { rack: 6, warhead: 'standard', speedMul: 1 }));
check('an unowned warhead cannot be equipped', throws(() => equip(rich, 'warhead', 'emp')));

const shopTotal = UPGRADES.filter((u) => !u.later).reduce((n, u) => n + u.price, 0);
const twoStars = ACT1.reduce((n) => n + expectedCredits(2, TWO_STAR_KILLS), 0);
check('Act 1 at two stars buys about half the shop', twoStars / shopTotal > 0.45 && twoStars / shopTotal < 0.6, `${twoStars} of ${shopTotal}`);
const loadouts = [];
for (const u of UPGRADES.filter((x) => !x.later)) {
  loadouts.push(loadoutOf(buy(applyResult(fresh, 'x', { stars: 0, credits: 5000, won: false }), u.needs ? u.needs : u.id)));
}
check('every loadout is inside the war\'s bounds', loadouts.every((l) => l.rack >= 4 && l.rack <= 6 && l.speedMul >= 1 && l.speedMul <= 1.15
  && ['standard', 'wide', 'penetrator', 'emp'].includes(l.warhead)));

console.log('clean and store');
check('junk cleans to empty', same(cleanCampaign('junk'), fresh) && same(cleanCampaign({ missions: [1], owned: 3 }), fresh));
const odd = cleanCampaign({
  missions: { 'itaipu-1': { stars: 7.5, won: 'yes', credits: -4 }, 'Bad Id!': { stars: 1 } },
  earned: -10, owned: { emp: 400 }, equipped: { warhead: 'wide', speed: true },
});
check('clean clamps and drops what it cannot trust', same(odd.missions, { 'itaipu-1': { stars: 3, won: false, credits: 0 } })
  && odd.earned === 0 && odd.equipped.warhead === 'standard' && odd.equipped.speed === false, JSON.stringify(odd));
check('a later build\'s mission and upgrade survive a clean', 'itaipu-9' in cleanCampaign({ missions: { 'itaipu-9': { stars: 1 } } }).missions
  && 'radar-2' in cleanCampaign({ owned: { 'radar-2': 10 } }).owned);
const mem = new Map();
const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const store = createCampaignStore(storage);
store.save(rich);
check('the store round trips', same(store.load(), rich));
mem.set('webfpv.campaign', '{not json');
const warn = console.warn;
console.warn = () => {};
check('an unreadable store loads empty', same(store.load(), fresh));
console.warn = warn;

console.log('merge');
let pc = applyResult(fresh, 'itaipu-1', { stars: 3, credits: 600, won: true });
let phone = applyResult(fresh, 'itaipu-1', { stars: 1, credits: 200, won: false });
phone = applyResult(phone, 'itaipu-2', { stars: 2, credits: 400, won: true });
pc = buy(pc, 'wide');
phone = buy(phone, 'rack-1');
const m = mergeCampaign(pc, phone);
check('max stars per mission, won once is won', starsOf(m, 'itaipu-1') === 3 && m.missions['itaipu-1'].won && starsOf(m, 'itaipu-2') === 2);
check('earned is the higher total', m.earned === Math.max(pc.earned, phone.earned), `${m.earned}`);
check('owned is the union, at the price paid', same(Object.keys(m.owned).sort(), ['rack-1', 'wide']) && spent(m) === 900);
check('credits are earned less spent', credits(m) === m.earned - 900, `${credits(m)}`);
check('credits can go below zero after a merge, and nothing is then for sale', credits(m) < 0 && cannotBuy(m, 'speed') === 'credits');
check('the incoming side\'s equipped wins', m.equipped.warhead === 'wide');
check('merge is idempotent', same(mergeCampaign(m, m), m));
check('merge commutes on everything but equipped', same({ ...mergeCampaign(phone, pc), equipped: null }, { ...m, equipped: null }));
check('merging with nothing keeps everything', same(mergeCampaign(pc, null), cleanCampaign(pc)) && same(mergeCampaign(null, pc).missions, pc.missions));

console.log('the war adapter');
const l = { rack: 5, warhead: 'emp', speedMul: 1 };
check('the start carries mission, intro and loadout', same(startMessage('itaipu-1', l), {
  type: 'war', op: 'start', mission: 'itaipu-1', intro: true, loadout: l,
}));
check('the loadout message', same(loadoutMessage(l), { type: 'war', op: 'loadout', loadout: l }));
check('no loadout to a room that echoes none', !loadoutDue({ state: 'lobby' }, 1, l));
check('a loadout before the go when the echo differs', loadoutDue({ state: 'briefing', loadouts: { 1: { rack: 4, warhead: 'standard', speedMul: 1 } } }, 1, l));
check('none once it matches, none after the go', !loadoutDue({ state: 'briefing', loadouts: { 1: l } }, 1, l)
  && !loadoutDue({ state: 'live', loadouts: {} }, 1, l));
check('a result is read when whole', same(resultOf({ result: { stars: 2, credits: 225, won: true } }), { stars: 2, credits: 225, won: true }));
check('no result from a view without one or a broken one', resultOf({}) === null && resultOf({ result: { stars: 2 } }) === null && resultOf(null) === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
