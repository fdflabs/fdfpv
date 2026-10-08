/*
 * campaign-selftest.js: Defend the Paraná's state and its merge
 * (src/game/campaign.js) and what it says to the war room
 * (src/share/campaignwar.js), in plain Node. Run with
 * npm run campaign:selftest.
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

import {
  ACT1, INTERIOR, INTERIOR_CAMPAIGN, UPGRADES, applyResult, cardLabel, buy, campaignOwned, cannotBuy, cleanCampaign, createCampaignStore, credits,
  emptyCampaign, equip, expectedCredits, TWO_STAR_KILLS, gateOpen, loadoutOf, markSeen, mergeCampaign, released, seenFilm, spent, starsOf, totalStars, unlocked,
} from '../src/game/campaign.js';
import { loadoutDue, loadoutMessage, resultOf, startMessage } from '../src/share/campaignwar.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { MISSIONS as OPS_MISSIONS } from '../src/share/ops/missions.js';
import {
  SYNCED_SECTIONS, mergeBlobs, pickSynced, stampChanges,
} from '../src/share/progressmerge.js';

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

console.log('release (the owner, 2026-10-04: only mission 1 until it is right; 2026-10-07: mission 1 held too, until it has its narration)');
check('Act 1 is the seven missions of docs/campaign/MISSIONS.md, in order',
  ACT1.map((m) => m.id).join() === 'itaipu-1,itaipu-2,itaipu-3,itaipu-4,itaipu-5,itaipu-6,itaipu-7', ACT1.map((m) => m.id).join());
check('every mission says available, development or soon', ACT1.every((m) => ['available', 'development', 'soon'].includes(m.release)));
check('no mission is available: First Light is held with the rest', ACT1.every((m) => m.release !== 'available'));
check('a mission with a definition in the build is in development, one without is coming soon',
  ACT1.filter((m) => m.release !== 'available').every((m) => (m.release === 'development') === Object.hasOwn(MISSIONS, m.id)));
check('released: none of 1 to 7', ACT1.every((m) => !released(m.id)));
check('released with dev: 2 to 4 too, never 5 to 7', ['itaipu-1', 'itaipu-2', 'itaipu-3', 'itaipu-4'].every((id) => released(id, true))
  && ['itaipu-5', 'itaipu-6', 'itaipu-7'].every((id) => !released(id, true)));
check('a mission outside Act 1 (the drill) is not the campaign\'s to hold back', released('itaipu-drill') && Object.hasOwn(MISSIONS, 'itaipu-drill'));
const saved = cleanCampaign({ missions: { 'itaipu-2': { stars: 3, won: true, credits: 300 }, 'itaipu-4': { stars: 1, won: false, credits: 50 } }, earned: 350 });
check('stars saved on a mission held back are kept, and still counted', starsOf(saved, 'itaipu-2') === 3 && saved.missions['itaipu-4'].credits === 50
  && totalStars(saved) === 4 && same(mergeCampaign(saved, emptyCampaign()).missions, saved.missions), JSON.stringify(saved.missions));
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
/* The act as built: the shop was priced against missions 1 to 4, and
 * 5 to 7 (release 'soon') have no mission to pay for yet. */
const twoStars = ACT1.filter((m) => Object.hasOwn(MISSIONS, m.id)).reduce((n) => n + expectedCredits(2, TWO_STAR_KILLS), 0);
check('Act 1 as built, at two stars, buys about half the shop', twoStars / shopTotal > 0.45 && twoStars / shopTotal < 0.6, `${twoStars} of ${shopTotal}`);
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
const settings = {};
let persisted = 0;
const store = createCampaignStore(settings, () => {
  persisted += 1;
});
check('a settings object with no campaign loads empty', same(store.load(), fresh));
store.save(rich);
check('the store keeps it in the settings section and persists', same(settings.campaign, rich) && persisted === 1 && same(store.load(), rich));
settings.campaign = 'junk from a hand edit';
check('a broken section loads empty', same(store.load(), fresh));

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
{
  /* The intro films seen (docs/campaign/INTROS.md section 3). */
  const one = markSeen(fresh, '2030', 2);
  check('a film is unseen until marked, then seen at that cut and not at a newer one', !seenFilm(fresh, '2030', 1) && seenFilm(one, '2030', 2)
    && seenFilm(one, '2030', 1) && !seenFilm(one, '2030', 3));
  check('a later build\'s film survives a clean, junk does not', same(cleanCampaign({ films: { 'film-9': 4, 'BAD ID': 1, x: 'y' } }).films, { 'film-9': 4, x: 0 }));
  const merged = mergeCampaign(markSeen(fresh, 'a', 3), markSeen(markSeen(fresh, 'a', 1), 'b', 2));
  check('merge keeps the newer cut of each film seen on either computer', same(merged.films, { a: 3, b: 2 }));
}
check('merge commutes on everything but equipped', same({ ...mergeCampaign(phone, pc), equipped: null }, { ...m, equipped: null }));
check('merging with nothing keeps everything', same(mergeCampaign(pc, null), cleanCampaign(pc)) && same(mergeCampaign(null, pc).missions, pc.missions));

console.log('the war adapter');
const l = { rack: 5, warhead: 'emp', speedMul: 1 };
check('the start carries mission, intro and loadout', same(startMessage('itaipu-1', l), {
  type: 'war', op: 'start', mission: 'itaipu-1', intro: true, loadout: l,
}));
check('after a loss the start carries from checkpoint and the loadout, no intro', same(startMessage('itaipu-1', l, { from: 'checkpoint' }), {
  type: 'war', op: 'start', mission: 'itaipu-1', from: 'checkpoint', loadout: l,
}));
check('the loadout message',same(loadoutMessage(l), { type: 'war', op: 'loadout', loadout: l }));
check('no loadout to a room that echoes none', !loadoutDue({ state: 'lobby' }, 1, l));
check('a loadout before the go when the echo differs', loadoutDue({ state: 'briefing', loadouts: { 1: { rack: 4, warhead: 'standard', speedMul: 1 } } }, 1, l));
check('none once it matches, none after the go', !loadoutDue({ state: 'briefing', loadouts: { 1: l } }, 1, l)
  && !loadoutDue({ state: 'live', loadouts: {} }, 1, l));
check('a result is read when whole', same(resultOf({ result: { stars: 2, credits: 225, won: true } }), { stars: 2, credits: 225, won: true }));
check('no result from a view without one or a broken one', resultOf({}) === null && resultOf({ result: { stars: 2 } }) === null && resultOf(null) === null);

console.log('the account blob');
const one = { v: 1, data: { campaign: pc }, stamps: {} };
const two = { v: 1, data: { campaign: phone }, stamps: { campaign: 5 } };
check('campaign is a synced section', SYNCED_SECTIONS.campaign === 'campaign' && same(pickSynced({ campaign: pc, graphics: 'x' }), { campaign: pc }));
check('the blob merges it by mergeCampaign, whatever the stamps', same(mergeBlobs(one, two).data.campaign, mergeCampaign(pc, phone)));
check('one side without it keeps the other\'s', same(mergeBlobs({ v: 1, data: {} }, two).data.campaign, cleanCampaign(phone))
  && !('campaign' in mergeBlobs({ v: 1, data: {} }, { v: 1, data: {} }).data));
check('a change to it is stamped', stampChanges({ campaign: pc }, { campaign: phone }, 9).campaign === 9);

console.log('The Interior (docs/campaign/interior/PLAN.md section 3, TECH-NEEDS.md N20)');
check('its five missions, in order', INTERIOR.map((m) => m.id).join() === 'interior-1,interior-2,interior-3,interior-4,interior-5');
check('Missions 1 and 2 are held in development: not started on the live server, started with dev', INTERIOR.slice(0, 2).every((m) => m.release === 'development'
  && !released(m.id) && released(m.id, true)));
check('3 to 5 are soon in the gate (no mission file) and never started, dev or not', INTERIOR.slice(2).every((m) => m.release === 'soon'
  && !Object.hasOwn(OPS_MISSIONS, m.id) && !released(m.id) && !released(m.id, true)));
check('Missions 1 and 2 have their mission files, as development means', Object.hasOwn(OPS_MISSIONS, 'interior-1') && Object.hasOwn(OPS_MISSIONS, 'interior-2'));
check('the cards read Under development on 2 to 5 (the owner\'s words)', INTERIOR.slice(1).every((m) => cardLabel(m) === 'development')
  && cardLabel(INTERIOR[0]) === 'development' && cardLabel(ACT1[4]) === 'soon');
check('the campaign asks the war\'s consent first (armed conflict)', INTERIOR_CAMPAIGN.consent === true);
{
  const f = applyResult(fresh, 'interior-1', {
    stars: 2, credits: 0, won: true, flags: { M1_SYMBOL_CAPTURED: true, 'bad flag': true, M1_X: 7 },
  });
  check('a result\'s flags are kept, junk dropped', same(f.flags, { M1_SYMBOL_CAPTURED: true }) && starsOf(f, 'interior-1') === 2, JSON.stringify(f.flags));
  check('a flag once true stays true over a later result without it', applyResult(f, 'interior-1', { stars: 1, credits: 0, won: true, flags: {} }).flags.M1_SYMBOL_CAPTURED === true);
  check('clean keeps flags of the script\'s shape only', same(cleanCampaign({ flags: { M5_FINAL_CHOICE: 'PRESERVE', M2_ALL_WATCHERS_FOUND: true, lower: true, M1_X: false } }).flags,
    { M5_FINAL_CHOICE: 'PRESERVE', M2_ALL_WATCHERS_FOUND: true }));
  const a = cleanCampaign({ flags: { M1_SYMBOL_CAPTURED: true, M5_FINAL_CHOICE: 'EXECUTE' } });
  const b = cleanCampaign({ flags: { M1_CAMP_FULLY_DOCUMENTED: true, M5_FINAL_CHOICE: 'FOLLOW' } });
  const ab = mergeCampaign(a, b);
  check('merge: every flag either has, a word flag the incoming copy\'s', same(ab.flags, { M1_CAMP_FULLY_DOCUMENTED: true, M1_SYMBOL_CAPTURED: true, M5_FINAL_CHOICE: 'EXECUTE' }), JSON.stringify(ab.flags));
  check('merge with flags is idempotent', same(mergeCampaign(ab, ab), ab));
  check('the account blob carries the flags', same(mergeBlobs({ v: 1, data: { campaign: a } }, { v: 1, data: { campaign: b } }).data.campaign.flags, ab.flags));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
