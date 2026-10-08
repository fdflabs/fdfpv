/*
 * medals-selftest.js: medals on built courses in plain Node
 * (src/game/medals.js, docs/FLIGHTCLUB-PROGRESSION.md section 2). The
 * three times from one gold, which medal a lap reaches, the gold a course
 * is published with, the document keeping and dropping it, a medal paying
 * once per step, and two computers merging to the better medal.
 *
 *   node scripts/medals-selftest.js
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
  betterMedal, cleanMedals, medalFor, medalTimes, newSteps, publishMedals,
} from '../src/game/medals.js';
import { MEDAL_XP, awardMedal, freshProgress, normaliseProgress } from '../src/game/progress.js';
import { mergeBlobs } from '../src/share/progressmerge.js';
import { layoutFingerprint } from '../src/share/listing.js';
import {
  createTrack, duplicateTrack, normalize, toPlain,
} from '../src/trackbuilder/model.js';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) {
    failed += 1;
  }
}

const M = { goldMs: 40000 };
const t = medalTimes(M);
check('silver and bronze are fixed ratios of gold, rounded up', t.gold === 40000 && t.silver === 46000 && t.bronze === 54000, JSON.stringify(t));
check('a time not a whole ms rounds up', medalTimes({ goldMs: 40001 }).silver === 46002);
check('no medals, no times', medalTimes(undefined) === null && medalTimes({ goldMs: 0 }) === null && medalTimes({ goldMs: 1.5 }) === null);
check('equal to gold is gold', medalFor(M, 40000) === 'gold');
check('a ms over gold is silver', medalFor(M, 40001) === 'silver');
check('equal to bronze is bronze', medalFor(M, 54000) === 'bronze');
check('slower than bronze is none', medalFor(M, 54001) === null);
check('no medals on the course, none', medalFor(undefined, 1) === null);
check('a lap that is not a lap is none', medalFor(M, NaN) === null && medalFor(M, 0) === null);
const W = { goldMs: 40000, wing: true };
check('a plane gold is no measure of a quad lap', medalFor(W, 30000) === null && medalFor(W, 30000, true) === 'gold');
check('a quad gold is no measure of a plane lap', medalFor(M, 30000, true) === null);
check('wing is kept only when true', JSON.stringify(cleanMedals({ goldMs: 5, wing: false })) === '{"goldMs":5}' && cleanMedals(W).wing === true);
check('the better medal', betterMedal('silver', 'gold') === 'gold' && betterMedal('gold', undefined) === 'gold' && betterMedal(null, undefined) === null && betterMedal('bronze', 'x') === 'bronze');
check('new steps', JSON.stringify(newSteps(null, 'gold')) === '["bronze","silver","gold"]' && newSteps('gold', 'silver').length === 0 && JSON.stringify(newSteps('bronze', 'silver')) === '["silver"]');

/* The gold a course is published with. */
const L1 = 'layout-1';
const L2 = 'layout-2';
check('a test lap on this layout sets gold', publishMedals(null, L1, '', { layout: L1, ms: 41234.6 }).goldMs === 41235);
check('a faster held gold on the same layout stays', publishMedals({ goldMs: 39000 }, L1, L1, { layout: L1, ms: 41000 }).goldMs === 39000);
check('a faster test lap replaces it', publishMedals({ goldMs: 39000 }, L1, L1, { layout: L1, ms: 38000 }).goldMs === 38000);
check('a rename (same layout, no lap) keeps gold', publishMedals({ goldMs: 39000 }, L1, L1, null).goldMs === 39000);
check('a changed layout with no lap on it has no medals', publishMedals({ goldMs: 39000 }, L2, L1, { layout: L1, ms: 30000 }) === null);
check('a changed layout lapped gets its own gold', publishMedals({ goldMs: 39000 }, L2, L1, { layout: L2, ms: 45000 }).goldMs === 45000);
check('a plane test lap publishes plane medals', publishMedals(null, L1, '', { layout: L1, ms: 50000, wing: true }).wing === true);
check('a test lap on the other kind replaces a faster held gold', JSON.stringify(publishMedals({ goldMs: 39000 }, L1, L1, { layout: L1, ms: 50000, wing: true })) === '{"goldMs":50000,"wing":true}');
check('a held plane gold kept on a rename stays a plane gold', publishMedals(W, L1, L1, null).wing === true);
check('never lapped, never published: none', publishMedals(undefined, L1, undefined, null) === null);

/* The document. */
const doc = createTrack('Medal test');
const plainBefore = JSON.stringify(toPlain(doc));
check('a course without medals serialises as before', !('medals' in toPlain(doc)));
const withMedals = { ...doc, medals: { goldMs: 42000 } };
check('toPlain writes medals', toPlain(withMedals).medals.goldMs === 42000);
check('normalize keeps them', normalize(JSON.parse(JSON.stringify(toPlain(withMedals)))).doc.medals.goldMs === 42000);
check('normalize drops a bad one', !('medals' in normalize({ ...toPlain(doc), medals: { goldMs: -5 } }).doc));
check('medals are not layout', layoutFingerprint(withMedals) === layoutFingerprint(doc));
check('a copy has no medals', !('medals' in duplicateTrack(withMedals, 'Copy')) && withMedals.medals.goldMs === 42000);
check('setting medals leaves the rest of the document alone', JSON.stringify({ ...toPlain(withMedals), medals: undefined }) === JSON.stringify({ ...JSON.parse(plainBefore), medals: undefined }));
check('cleanMedals keeps only goldMs', JSON.stringify(cleanMedals({ goldMs: 5, junk: 1 })) === '{"goldMs":5}');

/* Progress: once per step. */
const p = freshProgress();
const K = 'track:trk-1a2b3c4d';
const first = awardMedal(p, K, 'silver');
const xpOf = (ev) => (ev.find((e) => e.type === 'xp') || {}).xp || 0;
check('a first silver pays bronze and silver', xpOf(first) === 2 * MEDAL_XP && p.medals[K] === 'silver' && first[0].type === 'medal');
check('the same medal again pays nothing', awardMedal(p, K, 'silver').length === 0 && p.xp === 2 * MEDAL_XP);
check('a lower medal pays nothing and is not kept', awardMedal(p, K, 'bronze').length === 0 && p.medals[K] === 'silver');
check('gold then pays one step', xpOf(awardMedal(p, K, 'gold')) === MEDAL_XP && p.medals[K] === 'gold' && p.xp === 3 * MEDAL_XP);
check('no course key pays nothing', awardMedal(p, '', 'gold').length === 0);
check('normaliseProgress keeps medals, drops unknown ones', JSON.stringify(normaliseProgress({ xp: 1, medals: { a: 'gold', b: 'platinum', c: 3 } }).medals) === '{"a":"gold"}');
check('an old profile reads as no medals', JSON.stringify(normaliseProgress({ xp: 5 }).medals) === '{}');

/* Two computers. */
const one = { v: 1, data: { progress: { ...freshProgress(), xp: 100, medals: { a: 'gold', b: 'bronze' } } }, stamps: {} };
const two = { v: 1, data: { progress: { ...freshProgress(), xp: 50, medals: { b: 'silver', c: 'bronze' } } }, stamps: {} };
const m1 = mergeBlobs(one, two).data.progress.medals;
const m2 = mergeBlobs(two, one).data.progress.medals;
check('a merge keeps the better medal per course', m1.a === 'gold' && m1.b === 'silver' && m1.c === 'bronze', JSON.stringify(m1));
check('either way round', JSON.stringify(Object.entries(m1).sort()) === JSON.stringify(Object.entries(m2).sort()));
check('a merge never invents a medal', Object.keys(m1).length === 3);

console.log(failed ? `${failed} FAILED` : 'medals selftest PASS');
process.exit(failed ? 1 : 0);
