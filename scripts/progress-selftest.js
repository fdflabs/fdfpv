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
  FIRST_XP, MILESTONE_S, PROGRESS_VERSION, addXp, awardChallenge, awardFirsts, awardLap, courseKind, firstsOf,
  freshProgress, levelInfo, levelOf, lockOf, migrateProgress, milestonesOf, normaliseProgress,
  opensAt, registerUnlockables, unlockables,
} from '../src/game/progress.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { POWER } from '../configs/power.js';
import { PROPS } from '../configs/hangar-parts.js';
import { schemesFor } from '../configs/liveries.js';
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
check('an unknown mission or aircraft pays nothing: the list is finite', firstsOf({ campaign: { missions: { 'my-own-1': { won: true, stars: 3 } } }, seconds: { notaplane: 1e6 } }).length === 0);
const everything = firstsOf({
  campaign: { missions: Object.fromEntries([...Array(12)].map((_, i) => [i < 7 ? `itaipu-${i + 1}` : `interior-${i - 6}`, { won: true, stars: 99 }])) },
  seconds: Object.fromEntries(AIRFRAMES.map((a) => [a.id, 1e9])),
});
const ceiling = everything.reduce((n, f) => n + f.xp, 0);
check('every fact at once has a ceiling: stars clamp to three', everything.filter((f) => f.key.includes(':star')).length === 12 * 3 && ceiling < 1e5, `${everything.length} firsts, ${ceiling} XP`);
const learner = normaliseProgress({ v: 2, xp: 0, lessons: { first_takeoff: 1759800000000, not_yet_written: 1759800000001, bad: 'x' } });
check('lesson passes are kept as times, unknown ids too, junk dropped', learner.lessons.first_takeoff === 1759800000000 && learner.lessons.not_yet_written && !('bad' in learner.lessons));
const lessonEv = awardFirsts(learner, { lessons: learner.lessons });
check('a known lesson passed is a first, paid once; an unknown one pays nothing', same(lessonEv.filter((e) => e.type === 'first').map((e) => e.key), ['lesson:first_takeoff'])
  && learner.xp === FIRST_XP.lesson && awardFirsts(learner, { lessons: learner.lessons }).length === 0);
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
check('only planes, power, schemes, props, add-ons, finishes and decals are locked: never a repair, tape, a pack, a tank or a palette colour',
  unlockables().every((it) => ['plane', 'power', 'scheme', 'prop', 'addon', 'finish', 'decal', 'part'].includes(it.kind)));
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

/* A run of `steps`, each { t, ...tick } or an action name, gathering the
 * challenges it came true on. */
function run(ctx, steps) {
  const w = new RunWatch();
  w.start(ctx);
  const got = new Set();
  const base = { crashed: false, grounded: false, power: null, battery: 'ok' };
  for (const s of steps) {
    const out = typeof s === 'string' ? (s === 'pass' ? w.gatePass() : s === 'lap' ? w.lap() : (w.touch(s.slice(6)), [])) : w.tick({ ...base, ...s });
    out.forEach((id) => got.add(id));
  }
  return got;
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
