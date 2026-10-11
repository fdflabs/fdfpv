/*
 * physics-sources-selftest.js: proves scripts/physics-sources-lint.js
 * catches what it claims to, on fixture plant texts and baselines rather
 * than the real tree, so a lint that silently passes everything fails
 * here. The negative control runs the same fixtures through a scanner
 * whose citation test never matches, and the cited cases must then fail.
 *
 * Run with npm run physics-sources:selftest.
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

import { scan, check, prune } from './physics-sources-lint.js';

const F = 'src/native/plant_wing.c';
const BASE = [
  '#define STALL_RE_LO 3.0e4',
  'const FixedWingParams FW_A = {',
  '  .cd0 = 0.030,',
  '  .throw_r = 0.0,',
  '};',
].join('\n');
const BASELINE = [
  `${F} #define STALL_RE_LO 3.0e4`,
  `${F} FW_A.cd0 = 0.030`,
  `${F} FW_A.throw_r = 0.0`,
];
const withLines = (...extra) => BASE.replace('  .throw_r = 0.0,', ['  .throw_r = 0.0,', ...extra].join('\n'));

const cases = [
  ['today\'s tree, every uncited constant baselined', BASE, BASELINE, 0],
  ['new constant cited on its line (docs)', withLines('  .cl_max = 0.90,  /* docs/WING-STAGE1.md section 2 */'), BASELINE, 0],
  ['new constant cited by a URL in the comment directly above', withLines('  /* https://m-selig.ae.illinois.edu/ads/coord_database.html */', '  .cl_max = 0.90,'), BASELINE, 0],
  ['new constant marked FITTED: with its reason', withLines('  .cl_max = 0.90,  /* FITTED: npm run stall:probe row B */'), BASELINE, 0],
  ['new #define cited by a derive script', BASE + '\n#define SWIRL_KEEP 0.74 /* scripts/swirl-derive.js */', BASELINE, 0],
  ['new constant, no source', withLines('  .cl_max = 0.90,'), BASELINE, 1],
  ['new constant, a comment that cites nothing', withLines('  .cl_max = 0.90,  /* per rad, Helmbold */'), BASELINE, 1],
  ['a cite two fields up does not cover this one', withLines('  .cl_alpha = 4.36, /* docs/WING-STAGE1.md */', '  .cl_max = 0.90,'), BASELINE, 1],
  ['a cite above a blank line does not cover this one', withLines('  /* docs/WING-STAGE1.md */', '', '  .cl_max = 0.90,'), BASELINE, 1],
  ['changed value of a baselined constant', BASE.replace('.cd0 = 0.030', '.cd0 = 0.025'), BASELINE, 2],
  ['a copied uncited row is a second, unbaselined entry', withLines('  .cd0 = 0.030,'), BASELINE, 1],
  ['stale baseline entry', BASE, [...BASELINE, `${F} FW_A.cm_0 = 0.02`], 1],
  ['a baselined constant that gains a cite is stale', BASE.replace('  .cd0 = 0.030,', '  .cd0 = 0.030, /* docs/WING-STAGE1.md */'), BASELINE, 1],
];

let pass = 0;
let fail = 0;
for (const [name, text, baseline, want] of cases) {
  const got = check(scan(F, text), baseline).length;
  if (got === want) { pass++; continue; }
  fail++;
  console.error(`FAIL ${name}: ${got} problem(s), wanted ${want}`);
}

const over = check(scan(F, BASE), BASELINE, BASELINE.length - 1).length;
if (over === 1) pass++; else { fail++; console.error(`FAIL baseline over the pin: ${over} problem(s), wanted 1`); }

/* Negative control: with citation detection disabled, every cited case
 * above must fail, or the cited passes prove nothing. */
const never = /(?!)/;
for (const [name, text, baseline, want] of cases) {
  if (want !== 0 || text === BASE) continue;
  if (check(scan(F, text, never), baseline).length > 0) { pass++; continue; }
  fail++;
  console.error(`FAIL negative control ${name}: still passes with citations disabled`);
}

/* prune drops a cited and a gone entry, keeps the rest, and never admits
 * a new uncited constant. */
const cited = BASE.replace('  .cd0 = 0.030,', '  .cd0 = 0.030, /* docs/WING-STAGE1.md */') + '\n#define NEW_K 2.0';
const pruned = prune(scan(F, cited), [...BASELINE, `${F} FW_A.cm_0 = 0.02`]);
const wantPruned = [BASELINE[0], BASELINE[2]];
if (JSON.stringify(pruned) === JSON.stringify(wantPruned)) pass++; else { fail++; console.error(`FAIL prune: ${JSON.stringify(pruned)}`); }
const afterPrune = check(scan(F, cited), pruned).length;
if (afterPrune === 1) pass++; else { fail++; console.error(`FAIL prune admitted a new uncited constant: ${afterPrune} problem(s), wanted 1`); }

console.log(`physics-sources-selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
