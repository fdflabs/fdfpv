/*
 * progress-selftest.js: src/game/progress.js in plain Node. The curve, a
 * stored progress made safe, what is locked and when it opens, the XP a
 * lap and a challenge earn and the events they make, and every challenge
 * judged from a scripted run, both the run that earns it and the nearest
 * run that must not.
 *
 *   node scripts/progress-selftest.js
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
  CHALLENGES, FIRST_LAP_XP, LAP_XP, LEVEL_XP, PLANE_LEVELS, RunWatch, STARTER_PLANES, STREAK_HOOPS,
  FIRST_XP, MILESTONE_S, PROGRESS_VERSION, addXp, awardChallenge, awardFirsts, awardLap, courseKind, everyFirst, firstsOf,
  BESTS, BEST_MARGIN, BEST_XP, awardBest, awardBests, bestsOf,
  COUNTED, countOf, foldEvents, freshProgress, levelInfo, levelOf, lockOf, migrateProgress, milestonesOf, normaliseProgress,
  opensAt, registerUnlockables, unlockables,
  AIRCRAFT_CHALLENGE_IDS, AIRCRAFT_CHALLENGE_XP, BEST_GLIDE, LANDING_STREAK, PLACE_XP,
  aircraftChallengesOf, awardAircraftChallenge, awardAircraftChallenges, awardPlace, challengeAmounts,
  awardFlight, challengeRun, challengesOn,
} from '../src/game/progress.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { POWER } from '../configs/power.js';
import { EventLog } from '../src/game/events.js';
import { emptyCampaign, payResult } from '../src/game/campaign.js';
import { mergeBlobs } from '../src/share/progressmerge.js';
import { PROPS } from '../configs/hangar-parts.js';
import { liveryKey, schemesFor } from '../configs/liveries.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('the curve');
check('level 1 at 0 XP, 2 at 60', levelOf(0) === 1 && levelOf(59) === 1 && levelOf(60) === 2);
check('every level costs at least as much as the one before', LEVEL_XP.every((x, i) => i < 2 || x - LEVEL_XP[i - 1] >= LEVEL_XP[i - 1] - LEVEL_XP[i - 2]));
check('past the table the levels go on', levelOf(LEVEL_XP[LEVEL_XP.length - 1] + 800) === LEVEL_XP.length + 1);
const li = levelInfo(120);
check('levelInfo reads 120 XP as level 2, half way to 3', li.level === 2 && li.from === 60 && li.to === 180 && Math.abs(li.frac - 0.5) < 1e-9, JSON.stringify(li));
/* The owner's casual rule, as numbers: the first lap ever opens level 2. */
check('the first lap on a new track is a level', LAP_XP.built + FIRST_LAP_XP >= LEVEL_XP[1] && LAP_XP.casual + FIRST_LAP_XP >= LEVEL_XP[1]);

console.log('stored progress');
check('nothing stored in a new browser: fresh, on the curve', same(normaliseProgress(undefined), freshProgress(false)));
check('nothing stored in a profile from before progression: all open', normaliseProgress(undefined, { existing: true }).unlockAll === true);
check('a stored switch wins over the profile\'s age', normaliseProgress({ unlockAll: false }, { existing: true }).unlockAll === false);
const bad = normaliseProgress({ xp: -5.5, courses: { a: true, b: 1, c: 'yes' }, challenges: ['x'], seen: null, unlockAll: 'on' });
check('junk is made safe', bad.xp === 0 && same(bad.courses, { a: true }) && same(bad.challenges, {}) && same(bad.seen, {}) && same(bad.casual, {}) && bad.unlockAll === false, JSON.stringify(bad));
/* The lessons (src/game/training.js): a profile stored before them has
 * no field, which reads as none passed, every other field kept. */
const old = { v: 1, xp: 420, courses: { 'track:t1': true }, challenges: { first_course: true }, seen: {}, casual: {}, unlockAll: false };
const moved = normaliseProgress(old);
check('a profile from before the lessons keeps everything and has none passed', same(moved.lessons, {}) && moved.xp === 420
  && same(moved.courses, old.courses) && same(moved.challenges, old.challenges) && moved.unlockAll === false, JSON.stringify(moved));
const kept = normaliseProgress({ ...old, lessons: { first_takeoff: 1760000000000.5, race_lap: 'yes', first_land: -1, first_turns: NaN } });
check('a passed lesson keeps its time, whole; anything else is dropped', same(kept.lessons, { first_takeoff: 1760000000000 }), JSON.stringify(kept.lessons));
check('and survives a round trip', same(normaliseProgress(JSON.parse(JSON.stringify(kept))).lessons, kept.lessons));
check('XP is whole and bounded', normaliseProgress({ xp: 123.9 }).xp === 123 && normaliseProgress({ xp: 1e12 }).xp === 1e7 && normaliseProgress({ xp: NaN }).xp === 0);

console.log('the stored shape\'s versions (docs/ECONOMY.md section 3)');
/* Seeds: what each build before versioning wrote to settings.progress. */
const SEED_V1_NO_V = { xp: 700, courses: { 'track:abc': true }, challenges: { deadstick: true }, seen: {}, casual: {}, unlockAll: false };
const SEED_V1 = { v: 1, xp: 320, courses: {}, challenges: {}, seen: { 'campaign-first': true }, casual: {}, unlockAll: true };
for (const [name, seed] of [['a v1 profile with no version', SEED_V1_NO_V], ['a v1 profile', SEED_V1]]) {
  const m = normaliseProgress(seed);
  check(`${name} becomes v${PROGRESS_VERSION}, keeping all it had`, m.v === PROGRESS_VERSION && m.xp === seed.xp
    && same(m.courses, seed.courses) && same(m.challenges, seed.challenges) && same(m.seen, seed.seen)
    && m.unlockAll === seed.unlockAll && same(m.firsts, {}), JSON.stringify(m));
  check(`${name}: migrating twice is a no op`, same(normaliseProgress(m), m) && same(migrateProgress(m), m));
}
check('a v2 profile is walked nowhere', same(migrateProgress({ v: 2, xp: 5, firsts: { k: true } }), { v: 2, xp: 5, firsts: { k: true } }));
check('the fresh profile is the current version', freshProgress().v === PROGRESS_VERSION && same(freshProgress().firsts, {}));

console.log('firsts pay once (PROGRESSION.md rule 1)');
const warVet = { missions: { 'itaipu-1': { stars: 2, won: true, credits: 300 } } };
const flown = { cub1400: 700, cub1400f: 3000, timber1500: 0.5 };
const seededV1 = normaliseProgress(SEED_V1_NO_V);
const ev1 = awardFirsts(seededV1, { campaign: warVet, seconds: flown });
const keys1 = ev1.filter((e) => e.type === 'first').map((e) => e.key);
check('a v1 war veteran is paid the win and both stars once', ['mission:itaipu-1:win', 'mission:itaipu-1:star1', 'mission:itaipu-1:star2'].every((k) => keys1.includes(k)) && !keys1.includes('mission:itaipu-1:star3'), keys1.join());
check('a float plane\'s time counts for its land plane: the Cub has its hour', keys1.includes('aircraft:cub1400:hour'));
check('under a second is not a first flight', !keys1.some((k) => k.startsWith('aircraft:timber1500')));
const paid = FIRST_XP.win + 2 * FIRST_XP.star + FIRST_XP.flight + FIRST_XP.ten + FIRST_XP.hour;
check('the XP is the sum of the firsts, once', seededV1.xp === SEED_V1_NO_V.xp + paid, `${seededV1.xp}`);
check('the same facts again pay nothing', awardFirsts(seededV1, { campaign: warVet, seconds: flown }).length === 0 && seededV1.xp === SEED_V1_NO_V.xp + paid);
const reloaded = normaliseProgress(JSON.parse(JSON.stringify(seededV1)));
check('a reload of the paid profile pays nothing', awardFirsts(reloaded, { campaign: warVet, seconds: flown }).length === 0);
const third = awardFirsts(reloaded, { campaign: { missions: { 'itaipu-1': { stars: 3, won: true } } }, seconds: flown });
check('a better result pays only what is new', same(third.filter((e) => e.type === 'first').map((e) => e.key), ['mission:itaipu-1:star3']));
{
  /* A war's result paid by the room's id for it (src/game/campaign.js
   * payResult): seen twice, across a reload, its firsts are paid once. */
  const uid = 'w1760000000000-W4RR00-000001';
  const r = { won: true, stars: 2, credits: 220 };
  const seenOnce = payResult(emptyCampaign(), uid, 'itaipu-1', r);
  const seenAgain = payResult(JSON.parse(JSON.stringify(seenOnce)), uid, 'itaipu-1', r);
  const p = freshProgress();
  const first = awardFirsts(p, { campaign: seenOnce, seconds: {} }).filter((e) => e.type === 'first').map((e) => e.key).sort();
  const xp = p.xp;
  check('a war paid by its id: its win and stars are firsts once, and the same war seen again after a reload pays no XP',
    same(first, ['mission:itaipu-1:star1', 'mission:itaipu-1:star2', 'mission:itaipu-1:win'])
    && awardFirsts(normaliseProgress(JSON.parse(JSON.stringify(p))), { campaign: seenAgain, seconds: {} }).length === 0
    && seenAgain.earned === seenOnce.earned && xp === FIRST_XP.win + 2 * FIRST_XP.star, `${first.join()} ${xp}`);
}
check('an unknown mission or aircraft pays nothing: the list is finite', firstsOf({ campaign: { missions: { 'my-own-1': { won: true, stars: 3 } } }, seconds: { notaplane: 1e6 } }).length === 0);
const everything = firstsOf({
  campaign: { missions: Object.fromEntries([...Array(12)].map((_, i) => [i < 7 ? `itaipu-${i + 1}` : `interior-${i - 6}`, { won: true, stars: 99 }])) },
  seconds: Object.fromEntries(AIRFRAMES.map((a) => [a.id, 1e9])),
});
const ceiling = everything.reduce((n, f) => n + f.xp, 0);
check('every fact at once has a ceiling: stars clamp to three', everything.filter((f) => f.key.includes(':star')).length === 12 * 3 && ceiling < 1e5, `${everything.length} firsts, ${ceiling} XP`);
const learner = normaliseProgress({ v: 2, xp: 0, lessons: { first_takeoff: 1759800000000, not_yet_written: 1759800000001, bad: 'x' } });
check('lesson passes are kept as times, unknown ids too, junk dropped', learner.lessons.first_takeoff === 1759800000000 && learner.lessons.not_yet_written && !('bad' in learner.lessons));
/* "I fly already": first_unaided flown, the three before it covered. */
const skipper = normaliseProgress({ v: 2, xp: 0, lessons: { first_takeoff: 5, first_turns: 5, first_land: 5, first_unaided: 5 }, lessonsFlown: { first_unaided: true } });
const skipEv = awardFirsts(skipper, { lessons: skipper.lessons, flown: skipper.lessonsFlown });
check('a skip pays only the lesson flown: the covered ones are passed and pay nothing', same(skipEv.filter((e) => e.type === 'first').map((e) => e.key), ['lesson:first_unaided'])
  && skipper.xp === FIRST_XP.lesson && Object.keys(skipper.lessons).length === 4);
skipper.lessonsFlown.first_turns = true;
check('a covered lesson flown later pays then, once', same(awardFirsts(skipper, { lessons: skipper.lessons, flown: skipper.lessonsFlown }).filter((e) => e.type === 'first').map((e) => e.key), ['lesson:first_turns']));
learner.lessonsFlown = { first_takeoff: true, not_yet_written: true };
const lessonEv = awardFirsts(learner, { lessons: learner.lessons, flown: learner.lessonsFlown });
check('a known lesson flown is a first, paid once; an unknown one pays nothing', same(lessonEv.filter((e) => e.type === 'first').map((e) => e.key), ['lesson:first_takeoff'])
  && learner.xp === FIRST_XP.lesson && awardFirsts(learner, { lessons: learner.lessons, flown: learner.lessonsFlown }).length === 0);
check('milestones by name', same(milestonesOf({ cub1400: MILESTONE_S.ten }, 'cub1400f'), { flight: true, ten: true, hour: false }));

console.log('what is locked');
const p0 = freshProgress(false);
for (const id of STARTER_PLANES) {
  check(`the ${id} is open from the start`, lockOf(p0, 'plane', id) === null);
}
check('float planes go with their land plane', lockOf(p0, 'plane', 'timber1500f') === null && lockOf(p0, 'plane', 'cub1400f') === null);
check('quads are never locked', AIRFRAMES.filter((a) => !a.fixedWing).every((a) => lockOf(p0, 'plane', a.id) === null));
for (const [id, lv] of Object.entries(PLANE_LEVELS)) {
  check(`the ${id} is locked until level ${lv}`, same(lockOf(p0, 'plane', id), { level: lv }));
}
check('every fixed wing is a starter or on the curve', AIRFRAMES.filter((a) => a.fixedWing).every((a) => {
  const fam = a.id.replace(/f$/, '');
  return STARTER_PLANES.includes(fam) || PLANE_LEVELS[fam] || STARTER_PLANES.includes(a.id) || PLANE_LEVELS[a.id];
}));
check('the stock power and the first two schemes are never locked', Object.keys(POWER).every((id) => lockOf(p0, 'power', POWER[id][0].id, id) === null)
  && ['timber1500', 'kadet1981'].every((id) => schemesFor(id).slice(0, 2).every((sc) => lockOf(p0, 'scheme', sc.id, id) === null)));
check('the Timber\'s 3S option opens at level 2', same(lockOf(p0, 'power', '3s', 'timber1500'), { level: 2 }));
check('every plane\'s stock prop is open, and the Timber\'s first APC prop opens at level 2', Object.keys(PROPS).every((id) => lockOf(p0, 'prop', 'stock', id) === null)
  && same(lockOf(p0, 'prop', '11x7e', 'timber1500'), { level: 2 }));
check('the add-ons open in their order, the smoke last, and never before their plane', same(lockOf(p0, 'addon', 'pod', 'timber1500'), { level: 3 })
  && same(lockOf(p0, 'addon', 'smoke', 'timber1500'), { level: 5 }) && same(lockOf(p0, 'addon', 'pod', 'bramor2300'), { level: PLANE_LEVELS.bramor2300 }));
check('the kit\'s finish and gloss are free, then matte at 2, metallic at 3, chrome at 4, on every plane alike',
  lockOf(p0, 'finish', 'kit', 'cub1400') === null && lockOf(p0, 'finish', 'gloss', 'timber1500') === null
  && same(lockOf(p0, 'finish', 'matte', 'timber1500'), { level: 2 }) && same(lockOf(p0, 'finish', 'chrome', 'kadet1981'), { level: 4 }));
check('a number, a stripe and a checker are free decals, the rest open two a level', ['num', 'stripe', 'checker'].every((k) => lockOf(p0, 'decal', k, 'timber1500') === null)
  && same(lockOf(p0, 'decal', 'chevron', 'timber1500'), { level: 2 }) && same(lockOf(p0, 'decal', 'wings', 'timber1500'), { level: 5 }));
check('the float Timber\'s parts are the Timber\'s', same(lockOf(p0, 'prop', '11x7e', 'timber1500f'), lockOf(p0, 'prop', '11x7e', 'timber1500')));
check('only planes, power, schemes, props, add-ons, surface tiers, finishes and decals are locked: never a repair, tape, a pack, a tank or a palette colour',
  unlockables().every((it) => ['plane', 'power', 'scheme', 'prop', 'addon', 'surface', 'finish', 'decal', 'part'].includes(it.kind)));
check('an item on a locked plane waits for its plane', unlockables().filter((it) => it.airframe && PLANE_LEVELS[it.airframe]).every((it) => it.level >= PLANE_LEVELS[it.airframe]));
check('Unlock all opens everything', unlockables().every((it) => lockOf({ ...p0, unlockAll: true }, it.kind, it.id, it.airframe) === null));
const all = unlockables();
check('every lockable item opens at a level of the curve, and each of levels 2 to 6 opens something', all.every((it) => it.level >= 2) && [2, 3, 4, 5, 6].every((n) => opensAt(n).length > 0),
  JSON.stringify([2, 3, 4, 5, 6].map((n) => opensAt(n).length)));
registerUnlockables([{ kind: 'decal', id: 'selftest-star', level: 2 }, { kind: 'part', id: 'selftest-wheel', airframe: 'kadet1981', level: 1 }]);
check('a registered item joins the list', same(lockOf(p0, 'decal', 'selftest-star'), { level: 2 }));
check('a registered item on a plane waits for its plane', same(lockOf(p0, 'part', 'selftest-wheel', 'kadet1981'), { level: PLANE_LEVELS.kadet1981 }));

console.log('XP and its events');
const p1 = freshProgress(false);
const e1 = awardLap(p1, { key: 'custom:abc', kind: 'built' });
check('a first lap on a built track: 40 and the first lap bonus', p1.xp === LAP_XP.built + FIRST_LAP_XP && e1[0].type === 'xp' && e1[0].why.first === true);
check('it makes level 2 and opens the Kadet', e1.some((e) => e.type === 'level' && e.level === 2) && e1.some((e) => e.type === 'unlock' && e.item.kind === 'plane' && e.item.id === 'kadet1981'),
  JSON.stringify(e1.map((e) => e.type + (e.item ? `:${e.item.key}` : ''))));
check('and the Kadet is open now', lockOf(p1, 'plane', 'kadet1981') === null);
const e2 = awardLap(p1, { key: 'custom:abc', kind: 'built' });
check('the same track again: no bonus', e2[0].xp === LAP_XP.built && !e2[0].why.first);
const c1 = awardChallenge(p1, 'first_course');
check('a challenge: its XP once', c1[0].type === 'challenge' && c1[1].xp === 40 && awardChallenge(p1, 'first_course').length === 0);
check('an unknown challenge earns nothing', awardChallenge(p1, 'nope').length === 0);
const p2 = { ...freshProgress(false), unlockAll: true };
check('with Unlock all a level opens no item toasts', addXp(p2, 5000, { kind: 'lap' }).every((e) => e.type !== 'unlock'));
check('a track recorded as casual is the casual track, any other a built one, none the world\'s', courseKind('trk-1', { casual: { 'trk-1': true } }) === 'casual'
  && courseKind('trk-2', { casual: { 'trk-1': true } }) === 'built' && courseKind(null, freshProgress()) === 'map');

console.log('the challenges, judged');
const words = CHALLENGES.every((c) => en[`progress.challenge.${c.id}`] && en[`progress.challenge.${c.id}_note`] && es[`progress.challenge.${c.id}`] && es[`progress.challenge.${c.id}_note`]);
check('every challenge has its words in English and Spanish', words);
const timber = { airframe: 'timber1500', fixedWing: true, power: 'electric', smallestPack: false };
const kadetSmall = { airframe: 'kadet1981', fixedWing: true, power: 'glow', smallestPack: true };
const bomb = { airframe: 'bombshell1118', fixedWing: true, power: 'glow', smallestPack: false };
const slow = { airframe: 'slowstick1180', fixedWing: true, power: 'electric', smallestPack: true };
const quad = { airframe: 'interceptor', fixedWing: false, power: null, smallestPack: false };

/* A run of `steps`, each { t, ...tick } or an action name, logged as
 * src/ui/progress-ui.js Progress logs them (RunWatch detecting the crash,
 * engine and battery edges and the landings), gathering the challenges
 * the rows find in the log (challengesOn). */
function run(ctx, steps) {
  const w = new RunWatch();
  w.start(ctx);
  const log = new EventLog();
  let simMs = 0;
  let was = false;
  log.append('seated', 0, { ...ctx, crashed: false });
  const base = { crashed: false, grounded: false, power: null, battery: 'ok' };
  for (const s of steps) {
    if (s === 'pass') {
      log.append('gate', simMs);
    } else if (s === 'lap') {
      log.append('lap', simMs, { ms: 1, airframe: ctx.airframe, medal: null });
    } else if (typeof s === 'string') {
      log.append('touch', simMs, { kind: s.slice(6) });
    } else {
      const state = { ...base, ...s };
      simMs = state.simMs;
      if (state.crashed && !was) {
        log.append('crash', simMs, { airframe: ctx.airframe });
      }
      was = state.crashed;
      const landings = w.landings;
      for (const edge of w.tick(state)) {
        log.append(edge, simMs);
      }
      if (w.landings > landings) {
        log.append('landing', simMs, { airframe: ctx.airframe, airMs: w.lastAirMs });
      }
    }
  }
  const r = challengeRun();
  return new Set(log.events.flatMap((e) => challengesOn(r, e)));
}
check('any lap is the first lap, even a quad\'s', run(quad, ['lap']).has('first_course'));
check('a Timber lap with no touch is clean', run(timber, ['pass', 'pass', 'lap']).has('timber_clean'));
check('a Timber lap with a gate touched is not', !run(timber, ['pass', 'touch:gate', 'pass', 'lap']).has('timber_clean'));
check('a tree is not a rim', run(timber, ['pass', 'touch:tree', 'lap']).has('timber_clean'));
check('a crash spoils the lap', !run(timber, [{ simMs: 0, crashed: true }, { simMs: 10 }, 'lap']).has('timber_clean'));
check('a clean lap on the Cub is not the Timber\'s', !run({ ...timber, airframe: 'cub1400' }, ['lap']).has('timber_clean'));
check('the float Timber counts as the Timber', run({ ...timber, airframe: 'timber1500f' }, ['lap']).has('timber_clean'));
const ten = Array(STREAK_HOOPS).fill('pass');
check('ten hoops in a row', run(timber, ten).has('hoops_10'));
check('nine, a rim, and nine more is not', !run(timber, [...ten.slice(1), 'touch:hoop', ...ten.slice(1)]).has('hoops_10'));
check('a rim then ten is', run(timber, ['touch:hoop', ...ten]).has('hoops_10'));
check('three Slow Stick laps', run(slow, ['lap', 'lap', 'lap']).has('slowstick_three') && !run(slow, ['lap', 'lap']).has('slowstick_three'));
const running = { tankM3: 1e-4, running: true };
const out = { tankM3: 1e-4, running: false };
check('the Kadet round on the small tank with the engine running', run(kadetSmall, [{ simMs: 0, power: running }, 'lap']).has('kadet_small_tank'));
check('not once the engine has quit', !run(kadetSmall, [{ simMs: 0, power: out }, 'lap']).has('kadet_small_tank'));
check('not on the big tank', !run({ ...kadetSmall, smallestPack: false }, ['lap']).has('kadet_small_tank'));
/* Airborne then down: 2.5 s up, then 1.2 s down in one piece. */
const flight = (extra, landing = {}) => [
  { simMs: 0, grounded: false, ...extra }, { simMs: 2500, grounded: false, ...extra },
  { simMs: 2600, grounded: true, ...extra, ...landing }, { simMs: 3700, grounded: true, ...extra, ...landing },
];
check('dead stick: LOW BATTERY, then down in one piece', run(timber, [{ simMs: 0, battery: 'warning' }, ...flight({ battery: 'warning' })]).has('deadstick'));
check('not without LOW BATTERY', !run(timber, flight({})).has('deadstick'));
check('not if it crashed after the warning', !run(timber, [{ simMs: 0, battery: 'warning' }, { simMs: 10, crashed: true }, ...flight({ battery: 'warning' })]).has('deadstick'));
check('not a hop: under 2 s in the air is not a flight', !run(timber, [{ simMs: 0, battery: 'warning' }, { simMs: 100, grounded: false }, { simMs: 900, grounded: true }, { simMs: 2500, grounded: true }]).has('deadstick'));
check('not on a glow plane', !run(kadetSmall, [{ simMs: 0, battery: 'warning' }, ...flight({ battery: 'warning' })]).has('deadstick'));
check('the Bombshell glides home after the engine quits', run(bomb, [{ simMs: 0, power: out }, ...flight({ power: out })]).has('bombshell_glide'));
check('not with the engine running', !run(bomb, flight({ power: running })).has('bombshell_glide'));
check('a row per challenge, each on one event type with a condition', CHALLENGES.every((c) => ['gate', 'lap', 'landing'].includes(c.on) && typeof c.when === 'function'));
check('a log with no seat judges nothing: no row fits no aircraft', challengesOn(challengeRun(), { type: 'lap' }).length === 0);

/*
 * THE ONE FOLD (awardFlight, COMPLETENESS.md item 28): recorded logs fed
 * in, and exactly which achievements it pays, in order, each once.
 */
console.log('the one fold: a log in, exactly these achievements out');
{
  const say = (g) => {
    const e = g[0];
    if (e.type === 'xp') return `lap${e.why.first ? ' first' : ''}`;
    if (e.type === 'challenge') return `challenge:${e.id}`;
    if (e.type === 'medal') return `medal:${e.medal}`;
    if (e.type === 'best') return `best:${e.key}`;
    if (e.type === 'aircraft_challenge') return `aircraft:${e.key}`;
    if (e.type === 'place') return `place:${e.world}:${e.id}`;
    if (e.type === 'first') return `first:${g.filter((x) => x.type === 'first').map((x) => x.key).join('+')}`;
    return e.type;
  };
  const timber = { airframe: 'timber1500', fixedWing: true, power: 'electric', smallestPack: false, crashed: false };
  const log = new EventLog();
  log.append('spawned', 0);
  log.append('seated', 0, timber);
  for (let g = 1; g <= STREAK_HOOPS; g += 1) log.append('gate', g * 4000);
  log.append('lap', 45000, { ms: 44000, airframe: 'timber1500', medal: 'silver', kind: 'built', course: 'track:t1', n: 1, of: 1 });
  log.append('found', 50000, { world: 'itaipu', id: 'main_dam' });
  log.append('battery_low', 60000);
  log.append('landing', 400000, { airframe: 'timber1500', airMs: 330000 });
  const outside = { campaign: null, seconds: { timber1500: 700 } };
  const p = freshProgress();
  const r = challengeRun();
  const once = awardFlight(p, log.events, 0, r, outside);
  const got = once.awards.map(say);
  const want = [
    'challenge:hoops_10', 'lap first', 'medal:silver', 'best:lap:plane:track:t1', 'best:run:1:plane:track:t1',
    'challenge:first_course', 'challenge:timber_clean', 'place:itaipu:main_dam',
    'aircraft:timber1500:endurance', 'challenge:deadstick', 'first:aircraft:timber1500:flight+aircraft:timber1500:ten',
  ];
  check('a flight: these, in log order, the firsts last', same(got, want), got.join(' | '));
  check('the fold took the whole log, and counted its lap and landing', once.at === log.events.length && once.counted === 2 && p.laps.timber1500 === 1 && p.landings.timber1500 === 1);
  check('the XP is the sum of what it paid', p.xp === once.awards.flat().filter((e) => e.type === 'xp').reduce((n, e) => n + e.xp, 0));
  const again = awardFlight(p, log.events, once.at, r, outside);
  check('folded again from where it stopped: nothing', again.awards.length === 0 && again.counted === 0 && again.at === once.at);
  const xp = p.xp;
  const replayed = awardFlight(p, log.events, 0, challengeRun(), outside);
  check('the whole log again from the start: no achievement twice, only the lap\'s own XP (a lap pays every time, its course\'s first once)',
    same(replayed.awards.map(say), ['lap']) && p.xp === xp + LAP_XP.built, replayed.awards.map(say).join(' | '));
  check('no outside facts: no firsts read', awardFlight(freshProgress(), log.events, 0, challengeRun(), null).awards.every((g) => g[0].type !== 'first'));
  /* The debrief's words (src/game/events.js lap_void, bail, trick,
   * COMPLETENESS.md item 26) between every event of the same flight: the
   * fold pays exactly the same, counts the same and gives the same XP. */
  const words = [
    ['lap_void', { ms: null, reason: 'wreck' }], ['bail', { cause: 'bounce' }], ['trick', { id: 'Power Loop', score: 480 }],
    ['lap_void', { ms: 39000, reason: 'test' }], ['bail', { cause: 'crash' }],
  ];
  const noisy = new EventLog();
  log.events.forEach((e, i) => {
    const { seq, type, simMs, roomMs, ...data } = e;
    noisy.append(type, simMs, data);
    const [w, d] = words[i % words.length];
    noisy.append(w, simMs, d);
  });
  const pn = freshProgress();
  const quiet = awardFlight(pn, noisy.events, 0, challengeRun(), outside);
  check('the debrief\'s words between every event: the same achievements, counts and XP', same(quiet.awards.map(say), want) && quiet.counted === 2
    && pn.xp === awardFlight(freshProgress(), log.events, 0, challengeRun(), outside).awards.flat().filter((e) => e.type === 'xp').reduce((n, e) => n + e.xp, 0)
    && same(pn.laps, { timber1500: 1 }) && same(pn.crashes, {}), quiet.awards.map(say).join(' | '));

  /* A thousand seeded random flights folded with and without the
   * debrief's words between their events: the same achievements, in the
   * same order, and the same progress after. */
  let seed = 20261014;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const seats = [timber, { ...timber, airframe: 'slowstick1180' }, { ...timber, airframe: 'bombshell1118', power: 'glow' }, { airframe: 'interceptor', fixedWing: false, power: null, smallestPack: false, crashed: false }];
  let alike = 0;
  let paidAll = 0;
  let firstOdd = '';
  for (let k = 0; k < 1000; k += 1) {
    const plain = new EventLog();
    const loud = new EventLog();
    const both = (type, t, data) => {
      plain.append(type, t, data);
      loud.append(type, t, data);
    };
    let t = 0;
    let seat = pick(seats);
    both('spawned', 0);
    both('seated', 0, seat);
    for (let n = 0; n < 60; n += 1) {
      t += 500 + Math.floor(rand() * 4000);
      const r = rand();
      if (r < 0.3) both('gate', t);
      else if (r < 0.45) both('lap', t, { ms: 20000 + Math.floor(rand() * 40000), airframe: seat.airframe, medal: pick([null, 'bronze', 'silver', 'gold']), kind: pick(['casual', 'built', 'map']), course: pick(['track:a', 'track:b']), n: 1 + Math.floor(rand() * 3), of: pick([null, 3]) });
      else if (r < 0.5) both('crash', t, { airframe: seat.airframe });
      else if (r < 0.6) both('landing', t, { airframe: seat.airframe, airMs: Math.floor(rand() * 400000) });
      else if (r < 0.63) both('battery_low', t);
      else if (r < 0.66) both('touch', t, { kind: pick(['gate', 'hoop', 'tree']) });
      else if (r < 0.68) {
        seat = pick(seats);
        both('seated', t, seat);
      }
      const [w, d] = words[Math.floor(rand() * words.length)];
      loud.append(w, t, d);
    }
    const pa = freshProgress();
    const pb = freshProgress();
    const fa = awardFlight(pa, plain.events, 0, challengeRun(), outside);
    const fb = awardFlight(pb, loud.events, 0, challengeRun(), outside);
    paidAll += fa.awards.length;
    if (same(fa.awards.map(say), fb.awards.map(say)) && fa.counted === fb.counted && same(pa, pb)) alike += 1;
    else if (!firstOdd) firstOdd = `flight ${k}: ${fa.awards.map(say).join()} vs ${fb.awards.map(say).join()}`;
  }
  check(`a thousand seeded flights, the debrief's words between their events: the same achievements and progress (${alike} of 1000, ${paidAll} paid)`, alike === 1000 && paidAll > 1000, firstOdd);

  /* A run is carried across its flights: a placement starts a new log,
   * not a new run, so a third lap after two placements is the third. */
  const slow = { airframe: 'slowstick1180', fixedWing: true, power: 'electric', smallestPack: false, crashed: false };
  const q = freshProgress();
  const carried = challengeRun();
  const flights = [0, 1, 2].map((k) => {
    const l = new EventLog();
    l.append('spawned', k * 100000);
    if (k === 0) l.append('seated', 0, slow);
    l.append('lap', k * 100000 + 50000, { ms: 40000, airframe: 'slowstick1180', medal: null, kind: 'built', course: 'track:s', n: 1, of: null });
    return l.events;
  });
  const paid = flights.map((events) => awardFlight(q, events, 0, carried, null).awards.map(say).filter((x) => x.startsWith('challenge')));
  check('three laps over three flights of one run: the Slow Stick\'s three on the third', same(paid, [['challenge:first_course'], [], ['challenge:slowstick_three']]), JSON.stringify(paid));
  const reseat = challengeRun();
  const l2 = new EventLog();
  l2.append('spawned', 0);
  l2.append('seated', 0, slow);
  l2.append('lap', 50000, { ms: 40000, airframe: 'slowstick1180', medal: null, kind: 'built', course: 'track:s', n: 1, of: null });
  l2.append('lap', 90000, { ms: 40000, airframe: 'slowstick1180', medal: null, kind: 'built', course: 'track:s', n: 1, of: null });
  l2.append('seated', 95000, slow);
  l2.append('lap', 140000, { ms: 40000, airframe: 'slowstick1180', medal: null, kind: 'built', course: 'track:s', n: 1, of: null });
  check('a new seat is a new run: two laps, a refit, one more is not three', !l2.events.flatMap((e) => challengesOn(reseat, e)).includes('slowstick_three'));
  const dead = (rows) => {
    const l = new EventLog();
    l.append('seated', 0, timber);
    rows.forEach(([type, t, data]) => l.append(type, t, data));
    const rr = challengeRun();
    return l.events.flatMap((e) => challengesOn(rr, e));
  };
  const landing = ['landing', 9000, { airframe: 'timber1500', airMs: 6000 }];
  check('dead stick from the log: LOW BATTERY then a landing', same(dead([['battery_low', 1000], landing]), ['deadstick']));
  check('a crash after LOW BATTERY spoils it', dead([['battery_low', 1000], ['crash', 2000, { airframe: 'timber1500' }], landing]).length === 0);
  check('a crash before it does not', same(dead([['crash', 500, { airframe: 'timber1500' }], ['battery_low', 1000], landing]), ['deadstick']));
  const bombshell = { airframe: 'bombshell1118', fixedWing: true, power: 'glow', smallestPack: false, crashed: false };
  const glide = (rows) => {
    const l = new EventLog();
    l.append('seated', 0, bombshell);
    rows.forEach(([type, t, data]) => l.append(type, t, data));
    const rr = challengeRun();
    return l.events.flatMap((e) => challengesOn(rr, e));
  };
  check('the Bombshell\'s glide from the log: the engine out, then a landing', same(glide([['engine_out', 1000], ['landing', 9000, { airframe: 'bombshell1118', airMs: 6000 }]]), ['bombshell_glide']));
  check('seated mid crash reads as a crash: the next lap is not clean', (() => {
    const rr = challengeRun();
    challengesOn(rr, { type: 'seated', ...timber, crashed: true });
    return !challengesOn(rr, { type: 'lap' }).includes('timber_clean');
  })());
}

/*
 * COUNTS PER AIRCRAFT (PROGRESSION.md 5 and 9, COMPLETENESS.md 27):
 * landings, crashes, laps, kills and missions started and completed
 * counted from the flight's event log, once each, per aircraft family,
 * merged as the higher of two computers.
 */
console.log('landings, crashes, laps, kills and missions, from the event log');
{
  check('counted: landings, crashes, laps, kills, missions started and completed', same(COUNTED, {
    landing: 'landings', crash: 'crashes', lap: 'laps', kill: 'kills',
    mission_start: 'missionsStarted', mission_end: 'missionsCompleted',
  }));
  const log = new EventLog();
  log.append('spawned', 0);
  log.append('landing', 5000, { airframe: 'cub1400' });
  log.append('crash', 6000, { airframe: 'cub1400' });
  log.append('landing', 9000, { airframe: 'cub1400' });
  log.append('lap', 10000, { ms: 41000, airframe: 'timber1500' });
  log.append('gate', 10500);
  log.append('landing', 12000, { airframe: 'timber1500' });
  log.append('landing', 13000, { airframe: null });
  const p = freshProgress();
  const first = foldEvents(p, log.events);
  check('each counts once on its aircraft; one with no aircraft counts nowhere',
    same(p.landings, { cub1400: 2, timber1500: 1 }) && same(p.crashes, { cub1400: 1 }) && same(p.laps, { timber1500: 1 }) && first.counted === 5,
    JSON.stringify([p.landings, p.crashes, p.laps, first.counted]));
  const again = foldEvents(p, log.events, first.at);
  check('the same log folded again counts nothing twice', again.counted === 0 && same(p.landings, { cub1400: 2, timber1500: 1 }) && same(p.crashes, { cub1400: 1 }));
  log.append('landing', 20000, { airframe: 'cub1400' });
  foldEvents(p, log.events, first.at);
  check('an event after the last fold is counted by the next', countOf(p, 'landing', 'cub1400') === 3);
  const floatId = AIRFRAMES.find((a) => a.id !== liveryKey(a.id) && a.fixedWing);
  if (floatId) {
    const q = freshProgress();
    const fl = new EventLog();
    fl.append('landing', 1, { airframe: floatId.id });
    fl.append('crash', 2, { airframe: floatId.id });
    foldEvents(q, fl.events);
    check(`a ${floatId.id} landing and crash are its family's (${liveryKey(floatId.id)})`,
      countOf(q, 'landing', floatId.id) === 1 && q.crashes[liveryKey(floatId.id)] === 1, JSON.stringify(q));
  }
  /* A kill is logged only for a victim the room credited to this pilot
   * (src/share/roomwar.js), one event a victim: a blast that took two is
   * two kills on the aircraft that flew it. */
  const k = freshProgress();
  const kl = new EventLog();
  kl.append('spawned', 0);
  kl.append('kill', 4000, { airframe: 'cub1400', victim: 'strike' });
  kl.append('kill', 4000, { airframe: 'cub1400', victim: 'strike' });
  kl.append('crash', 4000, { airframe: 'cub1400' });
  kl.append('kill', 9000, { airframe: 'timber1500', victim: 'scout' });
  kl.append('kill', 9500, { airframe: null, victim: 'decoy' });
  const kf = foldEvents(k, kl.events);
  const kAgain = foldEvents(k, kl.events, kf.at);
  check('kills count per aircraft like landings: a two kill blast is two, one with no aircraft counts nowhere, a second fold takes nothing',
    same(k.kills, { cub1400: 2, timber1500: 1 }) && countOf(k, 'kill', 'cub1400') === 2 && kf.counted === 4 && kAgain.counted === 0 && k.xp === 0,
    JSON.stringify([k.kills, kf.counted, kAgain.counted]));
  check('a fresh profile has no kills', same(freshProgress().kills, {}));
  /* A mission is started when its war is seen begun and completed when
   * its result is applied, won or lost (src/ui/campaign.js,
   * src/ui/opscampaign.js); the win and the stars are the campaign's. */
  const ms = freshProgress();
  const ml = new EventLog();
  ml.append('spawned', 0);
  ml.append('mission_start', 1000, { mission: 'm1', airframe: 'cub1400' });
  ml.append('mission_end', 90000, { mission: 'm1', won: false, stars: 0, airframe: 'cub1400' });
  ml.append('mission_start', 95000, { mission: 'm1', airframe: 'cub1400' });
  ml.append('mission_end', 180000, { mission: 'm1', won: true, stars: 2, airframe: 'cub1400' });
  ml.append('mission_start', 185000, { mission: 'm2', airframe: 'timber1500' });
  ml.append('mission_end', 190000, { mission: 'm2', won: true, stars: 1, airframe: null });
  const mf = foldEvents(ms, ml.events);
  const mAgain = foldEvents(ms, ml.events, mf.at);
  check('missions count per aircraft like landings: a lost one is completed too, one with no aircraft counts nowhere, a second fold takes nothing',
    same(ms.missionsStarted, { cub1400: 2, timber1500: 1 }) && same(ms.missionsCompleted, { cub1400: 2 })
    && countOf(ms, 'mission_end', 'cub1400') === 2 && mf.counted === 5 && mAgain.counted === 0 && ms.xp === 0,
    JSON.stringify([ms.missionsStarted, ms.missionsCompleted, mf.counted, mAgain.counted]));
  /* An Interior match's result logged for its debrief though this entry
   * paid nothing (paid before, by its uid; src/ui/opscampaign.js record)
   * is not completed again. */
  const mu = freshProgress();
  const mul = new EventLog();
  mul.append('mission_end', 1000, { mission: 'interior-1', match: 'u1', won: true, state: 'won', stars: 1, earned: 1, paid: true, airframe: 'cub1400' });
  mul.append('mission_end', 2000, { mission: 'interior-1', match: 'u1', won: true, state: 'won', stars: 1, earned: 1, paid: false, airframe: 'cub1400' });
  const muf = foldEvents(mu, mul.events);
  check('a result logged unpaid counts nowhere, the paid one once', same(mu.missionsCompleted, { cub1400: 1 }) && muf.counted === 1, JSON.stringify([mu.missionsCompleted, muf.counted]));
  check('a fresh profile has no missions counted', same(freshProgress().missionsStarted, {}) && same(freshProgress().missionsCompleted, {}));
  check('a count pays no XP', p.xp === 0);
  const older = normaliseProgress({ v: 2, xp: 300, firsts: { a: true } });
  check('a profile from before the counts reads as none, everything else kept', same(older.landings, {}) && same(older.crashes, {}) && same(older.laps, {}) && same(older.kills, {})
    && same(older.missionsStarted, {}) && same(older.missionsCompleted, {}) && older.xp === 300);
  const families = [...new Set(AIRFRAMES.map((af) => liveryKey(af.id)))];
  const dropped = families.filter((id) => Object.values(COUNTED).some((m) => normaliseProgress({ [m]: { [id]: 1 } })[m][id] !== 1));
  check(`every aircraft family's counts survive a load (${families.length})`, dropped.length === 0, dropped.join());
  check('stored counts are whole counts on known shaped keys',
    same(normaliseProgress({ crashes: { cub1400: 4, timber1500: 2.5, 'BAD KEY': 3, kadet1981: -1, sky1800: '7' } }).crashes, { cub1400: 4 }));
  const blob = (map, counts) => ({ v: 1, data: { progress: { ...freshProgress(), [map]: counts } }, stamps: {} });
  const a = { cub1400: 5, timber1500: 1 };
  const b = { cub1400: 3, kadet1981: 2 };
  for (const map of Object.values(COUNTED)) {
    const m1 = mergeBlobs(blob(map, a), blob(map, b)).data.progress[map];
    const m2 = mergeBlobs(blob(map, b), blob(map, a)).data.progress[map];
    check(`${map}: two computers merge to the higher count per aircraft, either way round`,
      same(m1, { cub1400: 5, timber1500: 1, kadet1981: 2 }) && same(Object.entries(m1).sort(), Object.entries(m2).sort()), JSON.stringify(m1));
    check(`${map}: a merge never exceeds either side, and a blob merged with itself is itself`,
      Object.entries(m1).every(([k, n]) => n <= Math.max(a[k] || 0, b[k] || 0)) && same(mergeBlobs(blob(map, m1), blob(map, m1)).data.progress[map], m1));
  }
}

/*
 * A ROOM GAME FINISHED, ONCE PER WORLD (PROGRESSION.md 3, the lead's
 * ruling of 2026-10-13) paid Streamer Combat and Catch the Ace! firsts
 * until both left in the combat-only cut (2026-10-20). What a pilot holds
 * from them stays: the `played` flags, the firsts paid and their XP.
 */
console.log('room games: what was paid stays');
{
  check('a room game first paid the lower Flight Club activity first, a course\'s first lap, as a place still does', FIRST_XP.game === FIRST_LAP_XP && FIRST_LAP_XP < FIRST_XP.lesson);
  const p = freshProgress();
  const log = new EventLog();
  log.append('round', 1, { game: 'combat', world: 'alps' });
  log.append('round', 2, { game: 'tag', world: 'itaipu', points: 9 });
  foldEvents(p, log.events);
  check('a round from an old log is played nowhere and is no best', same(p.played, {}) && bestsOf(log.events).length === 0, JSON.stringify(p.played));
  check('no game is a first: the finite list holds none', !everyFirst().some((f) => f.key.startsWith('game:'))
    && firstsOf({ played: { 'combat:alps': true, 'tag:itaipu': true } }).length === 0);
  check('played survives a load and junk is dropped', same(normaliseProgress({ played: { 'tag:alps': true, 'combat:alps': 1 } }).played, { 'tag:alps': true }));
  const paid = normaliseProgress({ v: PROGRESS_VERSION, xp: 80, firsts: { 'game:tag:alps': true, 'game:combat:swiss2': true }, played: { 'tag:alps': true, 'combat:swiss2': true } });
  check('a first paid before stays paid, its XP kept, and pays nothing again', paid.xp === 80 && paid.firsts['game:tag:alps'] === true
    && awardFirsts(paid, { played: paid.played }).length === 0 && paid.xp === 80, JSON.stringify(paid.firsts));
  const blob = (played) => ({ v: 1, data: { progress: { ...freshProgress(), played } }, stamps: {} });
  check('two computers merge played as the union', same(mergeBlobs(blob({ 'tag:alps': true }), blob({ 'combat:itaipu': true })).data.progress.played, { 'combat:itaipu': true, 'tag:alps': true }));
}

/*
 * BESTS (PROGRESSION.md section 3, the lead's decision of 2026-10-14):
 * per activity and place, set only from a finished, valid run's log, XP
 * once for the first and a smaller amount for a real improvement.
 */
console.log('bests: a personal record per activity and place');
{
  const xpOf = (events) => events.filter((e) => e.type === 'xp').reduce((n, e) => n + e.xp, 0);
  const lapLog = (laps, { start = 0, of = null, course = 'track:t1', airframe = 'timber1500' } = {}) => {
    const log = new EventLog();
    log.append('spawned', start);
    let t = start + 5000;
    laps.forEach((ms, i) => {
      t += ms;
      log.append('lap', t, { ms, airframe, medal: null, kind: 'built', course, n: i + 1, of });
    });
    return log;
  };
  check('every kind has a direction and a margin', Object.keys(BESTS).every((k) => ['lower', 'higher'].includes(BESTS[k]) && BEST_MARGIN[k] > 0)
    && same(Object.keys(BESTS).sort(), Object.keys(BEST_MARGIN).sort()));
  check('a time\'s margin is the clock\'s hundredth, a score\'s one point', BEST_MARGIN.lap === 10 && BEST_MARGIN.run === 10 && BEST_MARGIN.combat === 1 && BEST_MARGIN.tag === 1);
  check('a better best pays less than the first', BEST_XP.improved > 0 && BEST_XP.improved < BEST_XP.set);
  check('a fresh profile has no bests', same(freshProgress().bests, {}));

  /* Track Day: a lap per course and aircraft class, lower is better. */
  const p = freshProgress();
  const first = awardBests(p, lapLog([42000]).events);
  check('lap: the first lap on a course sets its best for the class and pays BEST_XP.set',
    same(p.bests, { 'lap:plane:track:t1': 42000 }) && xpOf(first) === BEST_XP.set && first[0].before === null, JSON.stringify(p.bests));
  const fold = awardBests(p, lapLog([42000]).events);
  check('lap: matching it pays nothing and sets nothing', fold.length === 0 && p.bests['lap:plane:track:t1'] === 42000);
  const slower = awardBests(p, lapLog([43000]).events);
  check('lap: a slower lap pays nothing and keeps the best', slower.length === 0 && p.bests['lap:plane:track:t1'] === 42000);
  const creep = awardBests(p, lapLog([41995]).events);
  check('lap: better by under the margin is kept and pays nothing', creep.length === 1 && creep[0].xp === 0 && xpOf(creep) === 0
    && p.bests['lap:plane:track:t1'] === 41995, JSON.stringify(creep));
  const xpBefore = p.xp;
  const real = awardBests(p, lapLog([41985]).events);
  check('lap: better by the margin pays BEST_XP.improved, the old value with it',
    xpOf(real) === BEST_XP.improved && p.xp === xpBefore + BEST_XP.improved && real[0].before === 41995 && real[0].now === 41985, JSON.stringify(real));
  check('lap: another class on the same course is its own best', xpOf(awardBests(p, lapLog([30000], { airframe: 'interceptor' }).events)) === BEST_XP.set
    && p.bests['lap:multirotor:track:t1'] === 30000);
  check('lap: another course is its own best', xpOf(awardBests(p, lapLog([50000], { course: 'track:t2' }).events)) === BEST_XP.set);

  /* A reset mid lap (resetCraft starts a new log; so does a developer
   * hook putting the craft somewhere): the lap began before this log. */
  const reset = new EventLog();
  reset.append('spawned', 100000);
  reset.append('lap', 101000, { ms: 9000, airframe: 'timber1500', medal: null, kind: 'built', course: 'track:t3', n: 1, of: null });
  check('reset: a lap longer than its flight so far is no best', bestsOf(reset.events).length === 0);
  const placed = new EventLog();
  placed.append('spawned', 0);
  placed.append('lap', 40000, { ms: 40000, airframe: 'timber1500', medal: null, kind: 'built', course: 'track:t3', n: 1, of: null });
  check('reset: a lap the length of its whole flight is one (the start is in this log)', bestsOf(placed.events).length === 1);
  const unlogged = new EventLog();
  unlogged.append('lap', 40000, { ms: 1000, airframe: 'timber1500', medal: null, kind: 'built', course: 'track:t3', n: 1, of: null });
  check('reset: a log that does not say where its flight began proves nothing', bestsOf(unlogged.events).length === 0);
  check('lap: no course, no aircraft or no time is no best',
    bestsOf(lapLog([40000], { course: null }).events).length === 0 && bestsOf(lapLog([40000], { airframe: null }).events).length === 0);

  /* A solo run: every lap of it closed in one log. */
  const r = freshProgress();
  const run = awardBests(r, lapLog([40000, 39000, 41000], { of: 3 }).events);
  check('run: three laps of a three lap run set the run\'s best, their sum', r.bests['run:3:plane:track:t1'] === 120000, JSON.stringify(r.bests));
  check('run: and pays BEST_XP.set once for it, besides the lap\'s', run.filter((e) => e.type === 'best' && e.key.startsWith('run:')).length === 1
    && xpOf(run) === BEST_XP.set + BEST_XP.set + BEST_XP.improved, `${xpOf(run)}`);
  const recovered = lapLog([39000, 38000], { of: 3 });
  recovered.events.forEach((e, i) => { if (i > 0) { recovered.events[i] = { ...e, n: e.n + 1 }; } });
  check('run: a run whose first lap closed in an earlier log (a recovery) is no run best',
    !bestsOf(recovered.events).some((b) => b.key.startsWith('run:')));
  check('run: a room\'s laps (no `of`) make no run best', !bestsOf(lapLog([40000, 39000, 41000]).events).some((b) => b.key.startsWith('run:')));
  check('run: a run under its laps is none yet', !bestsOf(lapLog([40000, 39000], { of: 3 }).events).some((b) => b.key.startsWith('run:')));
  const better = awardBests(r, lapLog([39000, 39000, 39000], { of: 3 }).events).filter((e) => e.type === 'best' && e.key.startsWith('run:'));
  check('run: a faster run by the margin pays the improvement', better.length === 1 && better[0].xp === BEST_XP.improved && better[0].before === 120000);

  /* Streamer Combat's and Catch the Ace!'s points per world were bests
   * until the games left (the combat-only cut, 2026-10-20): a best held
   * is kept, and only a better value moves it. */
  const g = freshProgress();
  check('combat: a stored best is still a best kind, higher better, and pays BEST_XP.set the first time', xpOf(awardBest(g, 'combat:alps', 300)) === BEST_XP.set && g.bests['combat:alps'] === 300);
  check('tag: a lower value pays nothing and moves nothing', awardBest(g, 'tag:itaipu', 7).length > 0 && awardBest(g, 'tag:itaipu', 5).length === 0 && g.bests['tag:itaipu'] === 7);

  /* Folding from where the last fold stopped finds nothing twice. */
  const f = freshProgress();
  const log = lapLog([40000], { of: 2 });
  const once = awardBests(f, log.events, 0);
  log.append('lap', 90000, { ms: 39000, airframe: 'timber1500', medal: null, kind: 'built', course: 'track:t1', n: 2, of: 2 });
  const twice = awardBests(f, log.events, 2);
  check('a fold from the last one takes only the new laps', once.filter((e) => e.type === 'best').length === 1
    && same(twice.filter((e) => e.type === 'best').map((e) => e.key), ['lap:plane:track:t1', 'run:2:plane:track:t1']), JSON.stringify(twice.map((e) => e.key)));
  check('awardBest refuses an unknown kind or a junk value', awardBest(freshProgress(), 'jam:alps', 5).length === 0
    && awardBest(freshProgress(), 'lap:plane:x', 1.5).length === 0 && awardBest(freshProgress(), 'lap:plane:x', -3).length === 0);
  check('bests are not firsts: none is on the finite list the tokens are paid from', !everyFirst().some((x) => /^(lap|run|combat|tag):/.test(x.key)));
  check('Unlock all is untouched by a best', (() => { const q = freshProgress(true); awardBests(q, lapLog([42000]).events); return q.unlockAll === true && q.bests['lap:plane:track:t1'] === 42000; })());

  /* Stored, and the save's migration: additive inside v2, no step. */
  const v2 = { v: 2, xp: 640, firsts: { 'game:tag:alps': true }, courses: { 'track:t1': true } };
  const loaded = normaliseProgress(v2);
  check('migration: a v2 profile from before bests reads as none, everything else kept, no version step',
    same(loaded.bests, {}) && loaded.xp === 640 && loaded.v === PROGRESS_VERSION && PROGRESS_VERSION === 2 && same(loaded.firsts, v2.firsts), JSON.stringify(loaded));
  check('migration: a v1 profile walks up and reads bests as none', same(normaliseProgress({ xp: 50 }).bests, {}) && normaliseProgress({ xp: 50 }).v === PROGRESS_VERSION);
  const junk = normaliseProgress({ bests: { 'lap:plane:t': 40000, 'run:3:plane:t': 120000.5, 'jam:alps': 4, 'combat:alps': 0, 'tag:alps': '9', [`lap:${'x'.repeat(200)}`]: 5 } });
  check('stored bests keep known kinds with whole positive values; junk is dropped', same(junk.bests, { 'lap:plane:t': 40000 }), JSON.stringify(junk.bests));
  check('and survive a round trip', same(normaliseProgress(JSON.parse(JSON.stringify(p))).bests, p.bests));

  /* Sync: per key the better of the two, by the key's direction. */
  const blob = (bests) => ({ v: 1, data: { progress: { ...freshProgress(), bests } }, stamps: {} });
  const da = { 'lap:plane:t': 41000, 'combat:alps': 200, 'tag:alps': 4 };
  const db = { 'lap:plane:t': 42000, 'combat:alps': 250, 'run:3:plane:t': 130000 };
  const m1 = mergeBlobs(blob(da), blob(db)).data.progress.bests;
  const m2 = mergeBlobs(blob(db), blob(da)).data.progress.bests;
  check('sync: the lower time and the higher score win, either way round, a key on one side kept',
    same(m1, { 'combat:alps': 250, 'lap:plane:t': 41000, 'run:3:plane:t': 130000, 'tag:alps': 4 }) && same(m1, m2), JSON.stringify(m1));
  check('sync: a merge never invents a record', Object.entries(m1).every(([k, v]) => v === da[k] || v === db[k]));
  /* Flight Club's pilot numbers (src/ui/pilotstats.js, docs/PILOT-STATS.md). */
  const { pilotStats } = await import('../src/ui/pilotstats.js');
  const shown = pilotStats({ progress: { xp: 0, bests: { ...da, ...db, 'combat:itaipu': 400, 'jam:alps': 9 } } }).bests;
  check('pilot stats: Track Day counts its lap and run bests; a Streamer Combat best, its game gone, shows nowhere', same(shown, { race: 2 }), JSON.stringify(shown));
  check('pilot stats: a pilot with none shows none', same(pilotStats({}).bests, { race: 0 }));
  check('sync: a side from before bests loses nothing the other has', same(mergeBlobs(blob(undefined), blob(da)).data.progress.bests, Object.fromEntries(Object.entries(da).sort())));
}

console.log('discovery (src/game/discovery.js, PROGRESSION.md section 6)');
{
  const { PLACES, placeKey, placesAt, placesOf } = await import('../src/game/discovery.js');
  const { MAPS } = await import('../src/maps/registry.js');
  const { CREST_SPAWN, AIR_SPAWN } = await import('../src/maps/itaipu/spawns.js');
  const { grantsFrom } = await import('../src/game/economy.js');
  check('every world with places is a world, with 6 to 12 of them, ids plain',
    Object.entries(PLACES).every(([w, list]) => MAPS.some((m) => m.id === w && m.id !== 'track') && list.length >= 6 && list.length <= 12 && list.every((p) => /^[a-z0-9_]{1,40}$/.test(p.id))),
    Object.entries(PLACES).map(([w, l]) => `${w} ${l.length}`).join());
  check('every place has a name and a fact in English and in Spanish, the fact one short line',
    Object.entries(PLACES).every(([w, list]) => list.every((p) => [en, es].every((t) => t[`discovery.place.${w}.${p.id}`] && t[`discovery.place.${w}.${p.id}_fact`]
      && t[`discovery.place.${w}.${p.id}_fact`].length <= 100))));
  const apart = Object.values(PLACES).every((list) => list.every((a, i) => list.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) > a.r + b.r)));
  check('a world\'s places are apart: one pass finds one place', apart);
  check('no Itaipu place is under a spawn: the crest\'s and the air start\'s',
    placesOf('itaipu').every((p) => [CREST_SPAWN, AIR_SPAWN].every((s) => Math.hypot(s.x - p.x, s.z - p.z) > p.r)));
  const dam = placesOf('itaipu').find((p) => p.id === 'main_dam');
  check('found inside its radius, low over it', same(placesAt('itaipu', { x: dam.x + dam.r - 1, z: dam.z }, 10), ['main_dam']));
  check('not found outside its radius', placesAt('itaipu', { x: dam.x + dam.r + 1, z: dam.z }, 10).length === 0);
  check('not found higher over it than its radius', placesAt('itaipu', { x: dam.x, z: dam.z }, dam.r + 1).length === 0);
  check('not found in a world without it, nor with no position', placesAt('alps', { x: dam.x, z: dam.z }, 10).length === 0 && placesAt('itaipu', null, 10).length === 0);
  check('a place set aside (found, or begun inside) is not found again', placesAt('itaipu', { x: dam.x, z: dam.z }, 10, new Set(['main_dam'])).length === 0);
  const p = freshProgress();
  const first = awardPlace(p, 'itaipu', 'main_dam');
  check('found once: kept, and PLACE_XP paid, the firsts table\'s Flight Club amount', p.places[placeKey('itaipu', 'main_dam')] === true
    && PLACE_XP === FIRST_XP.game && p.xp === PLACE_XP && first[0].type === 'place', JSON.stringify(first));
  check('found again: nothing', awardPlace(p, 'itaipu', 'main_dam').length === 0 && p.xp === PLACE_XP);
  check('a place the world has not: nothing', awardPlace(p, 'itaipu', 'nowhere').length === 0 && awardPlace(p, 'alps', 'main_dam').length === 0 && p.xp === PLACE_XP);
  check('no tokens: no place is a first, a record of every place found is granted nothing, and places and aircraft challenges add no grant',
    !everyFirst().some((f) => f.key.startsWith('place')) && grantsFrom({ data: { progress: { places: Object.fromEntries(placesOf('itaipu').map((q) => [placeKey('itaipu', q.id), true])) } } }).length === 0
    && same(grantsFrom({ data: { progress: { challenges: { deadstick: true } } } }), grantsFrom({ data: { progress: { challenges: { deadstick: true }, places: { 'itaipu:river': true }, aircraftChallenges: { 'cub1400:lap': true } } } })));
  check('stored: kept through a load and a round trip, junk dropped, an older profile has none',
    same(normaliseProgress(JSON.parse(JSON.stringify(p))).places, p.places) && same(normaliseProgress({ places: { 'itaipu:x': 'yes', 'itaipu:y': true } }).places, { 'itaipu:y': true })
    && same(normaliseProgress({ v: 2, xp: 5 }).places, {}));
  const blob = (places) => ({ v: 1, data: { progress: { ...freshProgress(), places } }, stamps: {} });
  const m = mergeBlobs(blob({ 'itaipu:main_dam': true }), blob({ 'itaipu:spillway': true })).data.progress.places;
  check('sync: two computers\' finds are the union, either way round', same(Object.keys(m).sort(), ['itaipu:main_dam', 'itaipu:spillway'])
    && same(Object.keys(mergeBlobs(blob({ 'itaipu:spillway': true }), blob({ 'itaipu:main_dam': true })).data.progress.places).sort(), Object.keys(m).sort()));
  check('sync: a side from before discovery loses nothing the other found', mergeBlobs(blob(undefined), blob({ 'itaipu:river': true })).data.progress.places['itaipu:river'] === true);
}

console.log('the aircraft challenges (PROGRESSION.md section 5)');
{
  const { LESSONS } = await import('../src/game/training.js');
  const families = AIRFRAMES.filter((a) => a.id === liveryKey(a.id));
  check('every aircraft has its three, from its class', families.every((a) => challengeAmounts(a.id) !== null), families.filter((a) => !challengeAmounts(a.id)).map((a) => a.id).join());
  check('a float plane\'s are its land plane\'s; an unknown id has none', same(challengeAmounts('cub1400f'), challengeAmounts('cub1400')) && challengeAmounts('notaplane') === null);
  check('the landing streak is the approaches lesson\'s', LANDING_STREAK === LESSONS.find((l) => l.id === 'wing_approaches').steps.length && LANDING_STREAK === 3);
  check('every glider has its best glide; a multirotor\'s lap is 360 m at 13 m/s, 28 s',
    AIRFRAMES.filter((a) => a.class === 'glider').every((a) => Number.isFinite(BEST_GLIDE[a.id])) && challengeAmounts('interceptor').lapMs === 28000);
  check('a plane\'s lap is 3 200 m at the middle of its stall and top speed, rounded up to the second',
    challengeAmounts('timber1500').lapMs === Math.ceil(3200 / ((7.2 + 27.2) / 2)) * 1000, String(challengeAmounts('timber1500').lapMs));
  check('a glider flies 600 s, the rest 300 s', challengeAmounts('nrj1490').airMs === MILESTONE_S.ten * 1000 && challengeAmounts('cub1400').airMs === MILESTONE_S.ten * 500);
  check('XP only, on the firsts\' scale: a lesson\'s', AIRCRAFT_CHALLENGE_XP === FIRST_XP.lesson && !everyFirst().some((f) => f.key.includes(':landings') || f.key.includes(':endurance')));

  const log = (rows) => {
    const l = new EventLog();
    l.append('spawned', 0);
    for (const [type, simMs, data] of rows) {
      l.append(type, simMs, data);
    }
    return l.events;
  };
  const ids = (events) => aircraftChallengesOf(events).map((c) => `${c.airframe}:${c.id}`);
  const land = (t, airMs = 5000, airframe = 'cub1400') => ['landing', t, { airframe, airMs }];
  check('three landings in one flight: the streak', same(ids(log([land(10000), land(20000), land(30000)])), ['cub1400:landings']));
  check('a crash between: no streak', ids(log([land(10000), land(20000), ['crash', 25000, { airframe: 'cub1400' }], land(30000)])).length === 0);
  check('two aircraft\'s landings are two streaks', ids(log([land(10000), land(20000, 5000, 'timber1500'), land(30000)])).length === 0);
  check('a float plane lands for its land plane', same(ids(log([land(10000, 5000, 'cub1400f'), land(20000), land(30000, 5000, 'cub1400f')])), ['cub1400:landings']));
  check('five minutes up, then landed: the endurance', same(ids(log([land(310000, 300000)])), ['cub1400:endurance']));
  check('a second short: none', ids(log([land(310000, 299999)])).length === 0);
  check('a flight longer than the log (a placement mid air) is none', ids(log([land(200000, 300000)])).length === 0);
  check('a glider needs the whole ten minutes', ids(log([land(310000, 300000, 'nrj1490')])).length === 0 && same(ids(log([land(610000, 600000, 'nrj1490')])), ['nrj1490:endurance']));
  const lap = (t, ms, kind = 'casual', airframe = 'interceptor') => ['lap', t, { ms, airframe, medal: null, kind, course: 'track:c', n: 1, of: 1 }];
  check('a casual lap under the time: the lap', same(ids(log([lap(40000, 27999)])), ['interceptor:lap']));
  check('at the time is under it; over, none', same(ids(log([lap(40000, 28000)])), ['interceptor:lap']) && ids(log([lap(40000, 28001)])).length === 0);
  check('a lap on a built or a world\'s track is not a casual lap', ids(log([lap(40000, 20000, 'built'), lap(80000, 20000, 'map')])).length === 0);
  check('a lap begun before its log (a reset inside it) is none', ids(log([lap(20000, 27000)])).length === 0);
  check('a log with no spawn is read as none', aircraftChallengesOf([{ seq: 0, type: 'landing', simMs: 400000, airframe: 'cub1400', airMs: 350000 }]).length === 0);

  const q = freshProgress();
  const events = log([land(10000), land(20000), land(310000, 280000), lap(400000, 200000, 'casual', 'cub1400')]);
  const paid = awardAircraftChallenges(q, events);
  check('earned once: kept per family, AIRCRAFT_CHALLENGE_XP each', same(Object.keys(q.aircraftChallenges).sort(), ['cub1400:landings', 'cub1400:lap'])
    && q.xp === 2 * AIRCRAFT_CHALLENGE_XP && paid.filter((e) => e.type === 'aircraft_challenge').length === 2, JSON.stringify(q.aircraftChallenges));
  check('the same log folded again pays nothing', awardAircraftChallenges(q, events).length === 0 && q.xp === 2 * AIRCRAFT_CHALLENGE_XP);
  check('and on the float plane it is already done', awardAircraftChallenge(q, 'cub1400f', 'lap').length === 0);
  check('an unknown challenge or aircraft pays nothing', awardAircraftChallenge(q, 'cub1400', 'trick').length === 0 && awardAircraftChallenge(q, 'notaplane', 'lap').length === 0);
  check('a fold from the last one finds only the new', aircraftChallengesOf(events, events.length - 1).map((c) => c.id).join() === 'lap');
  check('stored: kept through a round trip; an older profile has none', same(normaliseProgress(JSON.parse(JSON.stringify(q))).aircraftChallenges, q.aircraftChallenges)
    && same(normaliseProgress({ v: 2, xp: 1 }).aircraftChallenges, {}));
  const blob = (aircraftChallenges) => ({ v: 1, data: { progress: { ...freshProgress(), aircraftChallenges } }, stamps: {} });
  const m = mergeBlobs(blob({ 'cub1400:lap': true }), blob({ 'interceptor:landings': true })).data.progress.aircraftChallenges;
  check('sync: the union of two computers\' challenges', same(Object.keys(m).sort(), ['cub1400:lap', 'interceptor:landings']));
  check('every challenge has its words in English and Spanish', AIRCRAFT_CHALLENGE_IDS.every((id) => [en, es].every((t) => t[`progress.aircraft.${id}`] && t[`progress.aircraft.${id}_note`]))
    && [en, es].every((t) => t['debrief.challenge_done'] && t['progress.this_aircraft'] && t['progress.toast_place']));

  /* RunWatch's time in the air: take off to touchdown, a bounce part of it. */
  const w = new RunWatch();
  w.start({ airframe: 'cub1400', fixedWing: true, power: 'electric', smallestPack: false });
  const step = (simMs, grounded) => w.tick({ simMs, crashed: false, grounded, power: null, battery: 'ok' });
  step(0, true);
  for (let t = 1000; t < 100000; t += 100) step(t, false);
  for (let t = 100000; t < 100500; t += 100) step(t, true);
  for (let t = 100500; t < 301000; t += 100) step(t, false);
  for (let t = 301000; t <= 303000; t += 100) step(t, true);
  check('RunWatch: one landing, its time in the air from the take off, the bounce inside it', w.landings === 1 && w.lastAirMs === 300000, `${w.landings} ${w.lastAirMs}`);
  step(304000, false);
  step(305000, true);
  for (let t = 400000; t <= 500000; t += 100) step(t, true);
  for (let t = 500100; t < 510000; t += 100) step(t, false);
  for (let t = 510000; t <= 512000; t += 100) step(t, true);
  check('a hop too short to fly does not start the next flight early', w.landings === 2 && w.lastAirMs === 9900, `${w.landings} ${w.lastAirMs}`);
}

console.log('certifications (src/game/training.js CERTS)');
{
  check('a new pilot has none', same(freshProgress().certs, {}));
  check('a profile from before them reads as none', same(normaliseProgress({ v: 2, xp: 10, lessons: { race_lap: 5 } }).certs, {}));
  const kept = normaliseProgress({ certs: { racing: 1760000000000.5, multirotor: 'yes', glider: -1, 'BAD ID': 5, defence: 1760000000001 } });
  check('earned ones keep their time, whole, unknown ones too; junk dropped', same(kept.certs, { racing: 1760000000000, defence: 1760000000001 }), JSON.stringify(kept.certs));
  const blob = (certs) => ({ v: 1, data: { progress: { ...freshProgress(), certs } }, stamps: {} });
  const m1 = mergeBlobs(blob({ racing: 200 }), blob({ racing: 100, multirotor: 300 })).data.progress.certs;
  const m2 = mergeBlobs(blob({ racing: 100, multirotor: 300 }), blob({ racing: 200 })).data.progress.certs;
  check('two computers merge as the union at the earlier time, either way round', same(m1, { multirotor: 300, racing: 100 }) && same(m2, m1), JSON.stringify(m1));
  check('a merge never drops one', Object.keys(mergeBlobs(blob({}), blob({ racing: 100 })).data.progress.certs).join() === 'racing');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
