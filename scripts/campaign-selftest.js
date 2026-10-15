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
  ACT1, INTERIOR, INTERIOR_CAMPAIGN, UPGRADES, actOf, opsCampaignOf, applyResult, cardLabel, buy, campaignOwned, cannotBuy, cleanCampaign, createCampaignStore, credits,
  emptyCampaign, equip, expectedCredits, TWO_STAR_KILLS, gateOpen, loadoutOf, markSeen, mergeCampaign, released, seenFilm, spent, starsOf, totalStars, unlocked,
  PAID_KEEP, paidWar, payResult,
} from '../src/game/campaign.js';
import { createCampaignScreen } from '../src/ui/campaign.js';
import { createOpsCampaignScreen } from '../src/ui/opscampaign.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import EN from '../src/strings/en.js';
import ES from '../src/strings/es.js';
import { loadoutDue, loadoutMessage, resultOf, startMessage } from '../src/share/campaignwar.js';
import { MISSIONS, PLANNED } from '../src/share/war/missions/index.js';
import { MISSIONS as OPS_MISSIONS, checkRows } from '../src/share/ops/missions.js';
import { ROWS as OPS_ROWS } from '../src/share/ops/rows.js';
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
console.log('Act 1 is the mission registry\'s (src/share/war/missions/index.js act, order, key, free, release)');
const actRows = [...Object.values(MISSIONS), ...PLANNED].filter((m) => m.act === 1);
check('every registry mission and planned row of act 1 is in ACT1, and nothing else',
  same(actRows.map((m) => m.id).sort(), ACT1.map((m) => m.id).sort()), actRows.map((m) => m.id).join());
check('ACT1 is each row\'s own key, free and release, in its order',
  ACT1.every((m, i) => {
    const r = MISSIONS[m.id] ?? PLANNED.find((p) => p.id === m.id);
    return r.order === i + 1 && r.key === m.key && (r.free === true) === m.free && (r.release ?? 'soon') === m.release;
  }));
check('the drill states no act', MISSIONS['itaipu-drill'].act === undefined);
/* Each change, made to a copy of the registry, must stop actOf. */
const reg = () => Object.fromEntries(Object.entries(MISSIONS).map(([id, m]) => [id, { ...m }]));
const ACT_CONTROLS = [
  ['an order twice', (r) => { r['itaipu-3'].order = 2; }],
  ['an order missing', (r) => { r['itaipu-3'].order = 9; }],
  ['a release a flown mission cannot have', (r) => { r['itaipu-2'].release = 'soon'; }],
  ['a release unknown', (r) => { r['itaipu-2'].release = 'released'; }],
  ['a mission without its key', (r) => { delete r['itaipu-4'].key; }],
  ['two free missions', (r) => { r['itaipu-2'].free = true; }],
  ['a planned row that has its file', (r, p) => { p.push({ ...PLANNED[0], id: 'itaipu-2', order: 8 }); }],
];
for (const [name, change] of ACT_CONTROLS) {
  const r = reg();
  const p = [...PLANNED];
  change(r, p);
  check(`negative control: ${name} is refused`, throws(() => actOf(1, r, p)));
}
check('the unchanged registry is not refused', same(actOf(1, reg(), [...PLANNED]), ACT1));
const moved = reg();
moved['itaipu-1'].release = 'available';
check('a release changed in the mission\'s file is the gate\'s', actOf(1, moved, PLANNED)[0].release === 'available');

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

console.log('a war\'s result is paid once, by the room\'s id for it (phase 19, COMPLETENESS 2)');
{
  const UID = 'w1760000000000-W4RR00-000001';
  const won = { won: true, stars: 2, credits: 220 };
  const once = payResult(fresh, UID, 'itaipu-1', won);
  const twice = payResult(once, UID, 'itaipu-1', { won: true, stars: 3, credits: 330 });
  check('paid the first time: the stars, the credits, the war kept', starsOf(once, 'itaipu-1') === 2 && once.earned === 220 && paidWar(once, UID)
    && same(once.wars, [UID]));
  check('paid nothing the second time, whatever it says', same(twice, once));
  const other = payResult(once, 'w1760000999000-W4RR00-000002', 'itaipu-1', won);
  check('another war of the same mission is paid', other.earned === 440 && other.wars.length === 2);
  check('the wars paid survive a clean, junk does not', same(cleanCampaign({ wars: [UID, 'no spaces', 7, UID, null] }).wars, [UID])
    && same(cleanCampaign({ wars: 'x' }).wars, []) && same(cleanCampaign({}).wars, []));
  check('merge keeps the wars either computer paid, sorted, and is idempotent',
    same(mergeCampaign(other, once).wars, other.wars) && same(mergeCampaign(once, other).wars, other.wars)
    && same(mergeCampaign(mergeCampaign(once, other), other), mergeCampaign(once, other)));
  let many = fresh;
  for (let i = 0; i < PAID_KEEP + 5; i += 1) {
    many = payResult(many, `w${String(1760000000000 + i).padStart(13, '0')}-ROOM${i}-000001`, 'itaipu-1', { won: false, stars: 0, credits: 0 });
  }
  check(`the newest ${PAID_KEEP} wars are kept, and a newer one paid still counts as paid`, many.wars.length === PAID_KEEP
    && many.wars[0].includes('ROOM5-') && paidWar(many, many.wars.at(-1)));
}
{
  /* The page's half (src/ui/campaign.js observe) on a fake shell: its
   * settings are the save, a reload is a new screen over them. */
  const events = [];
  const settings = {};
  const shell = () => ({
    settings,
    persistSettings() {},
    nameDialog: { hidden: true },
    progress: { airframe: 'cub1400', event(type, e) { events.push(type); }, foldFlight() {}, checkFirsts() {} },
  });
  const screen = () => createCampaignScreen({
    ui: shell(), enterWarRoom: () => null, send: () => {}, view: () => null, room: () => ({ phase: 'idle' }),
  });
  const UID = 'w1760000000000-W4RR00-000003';
  const res = { won: true, stars: 2, credits: 240, criteria: [] };
  const live = { id: 3, uid: UID, mission: 'itaipu-1', state: 'live', result: null };
  const done = { ...live, state: 'won', result: res };
  const a = screen();
  a.observe(live, 'W4RR00');
  a.observe(done, 'W4RR00');
  a.observe(done, 'W4RR00');
  check('a page that saw it begin is paid at its end, once', a.state().earned === 240 && same(a.state().wars, [UID])
    && same(events, ['mission_start', 'mission_end']), events.join());
  const b = screen();
  b.observe(done, 'W4RR00');
  b.observe(done, 'W4RR00');
  check('a reload at the result card pays nothing more, and logs no second mission_end', b.state().earned === 240
    && events.filter((x) => x === 'mission_end').length === 1, events.join());
  delete settings.campaign;
  const c = screen();
  c.observe(done, 'W4RR00');
  check('a page that saw only the end (a reload, a reconnect, a late join into the result) is paid it', c.state().earned === 240
    && starsOf(c.state(), 'itaipu-1') === 2 && events.filter((x) => x === 'mission_end').length === 2, events.join());
  c.observe({ ...done, uid: 'w1760000000000-W4RR00-000004', id: 4, result: null }, 'W4RR00');
  check('a decided war the room sent no result for (a watcher, a seat that did not fly it) pays nothing', c.state().earned === 240
    && events.filter((x) => x === 'mission_end').length === 2);
  delete settings.campaign;
  const old = screen();
  old.observe({ id: 5, mission: 'itaipu-1', state: 'won', result: res }, 'OLD000');
  check('a room from before uid: a war first seen decided pays nothing, as before', old.state().earned === 0);
  old.observe({ id: 6, mission: 'itaipu-1', state: 'live', result: null }, 'OLD000');
  old.observe({ id: 6, mission: 'itaipu-1', state: 'won', result: res }, 'OLD000');
  old.observe({ id: 6, mission: 'itaipu-1', state: 'won', result: res }, 'OLD000');
  check('and one seen undecided is paid once', old.state().earned === 240 && same(old.state().wars, []));
}

console.log('an ops match\'s result is paid once, by the room\'s id for it (the war\'s rule, COMPLETENESS 2)');
{
  /* The page's half (src/ui/opscampaign.js record) on a fake shell, as
   * the war's above: a reload is a new screen over the same settings, and
   * a new page's run log. Every result seen is logged for its debrief
   * (COMPLETENESS 26); `paid` says whether that entry paid it, and only a
   * paid one is a match completed (progress.js foldEvents). */
  const events = [];
  const settings = {};
  const shell = () => {
    const run = [];
    return {
      settings,
      persistSettings() {},
      nameDialog: { hidden: true },
      progress: {
        airframe: 'bramor2300',
        event(type, data = {}) {
          const e = { type, ...data };
          run.push(e);
          events.push(e);
        },
        runEvents: () => run.slice(),
        foldFlight() {},
        checkFirsts() {},
      },
    };
  };
  const screen = () => createOpsCampaignScreen({
    ui: shell(), campaign: INTERIOR_CAMPAIGN, missions: INTERIOR, consented: async () => true, play: () => {},
  });
  const ends = () => events.filter((x) => x.type === 'mission_end' && x.paid).length;
  const seen = () => events.filter((x) => x.type === 'mission_end' && !x.paid).length;
  const UID = 'o1760000000000-OPS000-000001';
  const res = { won: true, stars: 2, starIds: ['a', 'b'], flags: { M1_SYMBOL_CAPTURED: true }, restarted: null };
  const live = { id: 1, uid: UID, mission: 'interior-1', state: 'live', result: null };
  const done = { ...live, state: 'won', result: res };
  const a = screen();
  a.record('OPS000:1', live);
  a.record('OPS000:1', done);
  a.record('OPS000:1', done);
  check('a page that saw it end is paid once: the stars, the flags, the uid kept, one mission_end',
    starsOf(cleanCampaign(settings.campaign), 'interior-1') === 2 && cleanCampaign(settings.campaign).flags.M1_SYMBOL_CAPTURED === true
    && same(cleanCampaign(settings.campaign).wars, [UID]) && ends() === 1 && seen() === 0, JSON.stringify(events));
  const b = screen();
  b.record('OPS000:1', done);
  b.record('OPS000:1', done);
  check('a reload at the debrief pays nothing more, and logs no second paid mission_end: its debrief\'s is logged once, seen, not paid', ends() === 1 && seen() === 1
    && starsOf(cleanCampaign(settings.campaign), 'interior-1') === 2, JSON.stringify(events));
  delete settings.campaign;
  const c = screen();
  c.record('OPS000:1', done);
  check('a page that saw only the end (a reload, a reconnect, a late join into the debrief) is paid it',
    starsOf(cleanCampaign(settings.campaign), 'interior-1') === 2 && cleanCampaign(settings.campaign).flags.M1_SYMBOL_CAPTURED === true && ends() === 2, JSON.stringify(events));
  c.record('OPS000:1', { ...done, result: { ...res, stars: 3 } });
  const d = screen();
  d.record('OPS000:1', { ...done, result: { ...res, stars: 3 } });
  check('a second sighting pays nothing, on that page or a fresh one, whatever it says', ends() === 2 && seen() === 2
    && starsOf(cleanCampaign(settings.campaign), 'interior-1') === 2, JSON.stringify(events));
  d.record('OPS000:2', { ...done, id: 2, uid: 'o1760000000000-OPS000-000002', result: null });
  check('an ended match the room sent no result for (a watcher, a pilot first seated after the end) pays nothing',
    ends() === 2 && seen() === 3 && cleanCampaign(settings.campaign).wars.length === 1);
  d.record('OPS000:3', { ...done, id: 3, uid: 'o1760000000000-OPS000-000003', mission: 'itaipu-1' });
  check('a match of another campaign\'s mission is not this screen\'s to pay', ends() === 2 && seen() === 4 && cleanCampaign(settings.campaign).wars.length === 1);
  delete settings.campaign;
  const old = screen();
  old.record('OLD000:4', { id: 4, mission: 'interior-1', state: 'won', result: res });
  old.record('OLD000:4', { id: 4, mission: 'interior-1', state: 'won', result: res });
  check('a room from before uid: paid once per match key from the debrief, as before, and no uid kept',
    ends() === 3 && starsOf(cleanCampaign(settings.campaign), 'interior-1') === 2 && same(cleanCampaign(settings.campaign).wars, []));
}
{
  /* The war's and the ops' ids share the save's list, kept by the start's
   * time past their kind's letter: an ops match paid after many wars is
   * not the first dropped, and is not paid again. */
  const OPS = `o${String(1760000000000 + 1000).padStart(13, '0')}-OPS000-000001`;
  let both = payResult(fresh, OPS, 'interior-1', { won: true, stars: 1, credits: 0 });
  for (let i = 0; i < PAID_KEEP + 5; i += 1) {
    both = payResult(both, `w${String(1760000000000 + i).padStart(13, '0')}-ROOM${i}-000001`, 'itaipu-1', { won: false, stars: 0, credits: 0 });
  }
  check(`after ${PAID_KEEP + 5} older wars the newer ops match is still kept as paid, the oldest wars dropped`, both.wars.length === PAID_KEEP
    && paidWar(both, OPS) && both.wars.at(-1) === OPS && !both.wars.some((id) => id.includes('ROOM0-')), both.wars.slice(-2).join());
  check('and a clean or a merge keeps that order', same(cleanCampaign(JSON.parse(JSON.stringify(both))).wars, both.wars)
    && same(mergeCampaign(both, fresh).wars, both.wars));
}

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
check('Mission 1 is held in development: not started on the live server, started with dev', INTERIOR[0].release === 'development'
  && !released('interior-1') && released('interior-1', true));
/* A mission is built when it has its file: then held in development
 * like Mission 1, else soon in the gate and never started. */
const built = (m) => Object.hasOwn(OPS_MISSIONS, m.id);
check('2 to 5: with a mission file held in development (dev only), without one soon and never started', INTERIOR.slice(1).every((m) => (built(m)
  ? m.release === 'development' && !released(m.id) && released(m.id, true)
  : m.release === 'soon' && !released(m.id) && !released(m.id, true))) && built(INTERIOR[1]) && built(INTERIOR[2]));
check('Mission 1 has its mission file, as development means', Object.hasOwn(OPS_MISSIONS, 'interior-1'));
check('the cards read Under development on 2 to 5 (the owner\'s words)', INTERIOR.slice(1).every((m) => cardLabel(m) === 'development')
  && cardLabel(INTERIOR[0]) === 'development' && cardLabel(ACT1[4]) === 'soon');
check('the campaign asks the war\'s consent first (armed conflict)', INTERIOR_CAMPAIGN.consent === true);
/* Each change, made to copies of the ops registry and its rows, must stop
 * checkRows (src/share/ops/missions.js), which runs at its load. */
const opsReg = () => Object.fromEntries(Object.entries(OPS_MISSIONS).map(([id, m]) => [id, { ...m }]));
const opsRows = () => OPS_ROWS.map((r) => ({ ...r }));
const ROW_CONTROLS = [
  ['a mission file without a row', (m, r) => { r.splice(r.findIndex((x) => x.id === 'interior-2'), 1); }],
  ['a mission file whose row is soon', (m, r) => { r.find((x) => x.id === 'interior-3').release = 'soon'; }],
  ['a mission file whose row is another campaign\'s', (m, r) => { r.find((x) => x.id === 'interior-1').campaign = 'other'; }],
  ['a row in development without its file', (m) => { delete m['interior-3']; }],
  ['an available row without its file', (m, r) => { r.find((x) => x.id === 'interior-4').release = 'available'; }],
];
for (const [name, change] of ROW_CONTROLS) {
  const m = opsReg();
  const r = opsRows();
  change(m, r);
  check(`negative control: ${name} is refused`, throws(() => checkRows(m, r)));
}
check('the unchanged ops registry and rows are not refused', !throws(() => checkRows(opsReg(), opsRows())));
/* Each change, made to a copy of the rows, must stop opsCampaignOf. */
const LIST_CONTROLS = [
  ['a campaign with no rows', (r) => { r.forEach((x) => { x.campaign = 'other'; }); }],
  ['an order twice', (r) => { r[2].order = 2; }],
  ['an order missing', (r) => { r[2].order = 9; }],
  ['a release unknown', (r) => { r[1].release = 'released'; }],
  ['a label unknown', (r) => { r[3].label = 'later'; }],
  ['a mission without its key', (r) => { delete r[0].key; }],
  ['a mission twice', (r) => { r[4].id = 'interior-1'; }],
];
for (const [name, change] of LIST_CONTROLS) {
  const r = opsRows();
  change(r);
  check(`negative control: ${name} is refused`, throws(() => opsCampaignOf('interior', r)));
}
check('the unchanged rows are not refused, and are the list', same(opsCampaignOf('interior', opsRows()), INTERIOR));
{
  const r = opsRows();
  r[0].release = 'available';
  check('a release changed in the row is the list\'s', opsCampaignOf('interior', r)[0].release === 'available');
}
check('every row\'s card words are in English and Spanish', INTERIOR.every((m) => [`m.${m.key}`, `m.${m.key}_blurb`]
  .every((k) => [EN, ES].every((t) => typeof t[`ops.campaign.interior.${k}`] === 'string'))));
/* campaign.js reaches the browser's settings and the tracks Worker, so its
 * static imports must never reach the ops registry or a mission's world
 * (rows.js is the one ops module it reads). A walk of the import graph,
 * with the registry itself as the negative control. */
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
function closure(entry) {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) {
      return;
    }
    seen.add(f);
    for (const [, spec] of readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s(?:[^'"]*?from\s*)?['"](\.[^'"]+)['"]/gm)) {
      const next = resolve(dirname(f), spec);
      if (existsSync(next)) {
        walk(next);
      }
    }
  };
  walk(resolve(ROOT, entry));
  return [...seen].map((f) => relative(ROOT, f));
}
const heavy = (files) => files.filter((f) => f === 'src/share/ops/missions.js' || f.startsWith('src/share/interior/'));
const reach = closure('src/game/campaign.js');
check('campaign.js imports no ops registry and no Interior world', reach.includes('src/share/ops/rows.js') && heavy(reach).length === 0, heavy(reach).join() || `${reach.length} modules`);
check('negative control: the registry\'s own imports are seen', heavy(closure('src/share/ops/missions.js')).includes('src/share/interior/node.js'));
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
