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

import { scanFile, scanJs, check, prune, PINS } from './physics-sources-lint.js';

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

/* Arrays and tables: a bare array, a struct field whose value spans rows
 * and a positional table, braces inside a comment to step over, and an
 * integer element (an index), which is not a constant. */
const EBASE = [
  '/* rows { of } a table, cited nowhere */',
  'static const double OCV[3] = {',
  '  3.000, 3.562,',
  '  4.200,',
  '};',
  'const FixedWingParams FW_B = {',
  '  .axial_curve = {',
  '    1.0000, 0.9681,',
  '  },',
  '};',
  'static const PartDef PARTS_B[] = {',
  '  { .parent = -1, BOX(-0.04, 0.07) },',
  '};',
].join('\n');
const EBASELINE = [
  `${F} OCV[] = 3.000`, `${F} OCV[] = 3.562`, `${F} OCV[] = 4.200`,
  `${F} FW_B.axial_curve[] = 1.0000`, `${F} FW_B.axial_curve[] = 0.9681`,
  `${F} PARTS_B[][] = BOX(-0.04, 0.07)`,
];
const ewith = (...extra) => EBASE + '\n' + extra.join('\n');

cases.push(
  ['today\'s arrays and tables, every uncited element baselined', EBASE, EBASELINE, 0],
  ['new array cited directly above its opening line', ewith('/* docs/SEA-STAGE1.md table 2 */', 'static const double SEA[2] = { 1.2195, 1.0 };'), EBASELINE, 0],
  ['new table row cited on its continuation line', EBASE.replace('    1.0000, 0.9681,', '    1.0000, 0.9681,\n    0.9281, 0.8794, /* npm run prop:curves */'), EBASELINE, 0],
  ['a field list cited by the comment directly above its opening', EBASE.replace('  .axial_curve = {', '  /* scripts/prop-curves.js */\n  .torque_curve = {\n    0.5, 0.4,\n  },\n  .axial_curve = {'), EBASELINE, 0],
  ['new array, no source', ewith('static const double SEA[2] = { 1.2195, 1.0 };'), EBASELINE, 2],
  ['a cite above another array does not cover this one', ewith('/* docs/SEA-STAGE1.md */', 'static const double SEA_T[1] = { 1.2195 };', 'static const double SEA_E[2] = { 0.1214, 0.4589 };'), EBASELINE, 2],
  ['a struct header cite over new rows still fails', EBASE.replace('const FixedWingParams FW_B = {', '/* docs/WING-STAGE1.md */\nconst FixedWingParams FW_B = {').replace('    1.0000, 0.9681,', '    1.0000, 0.9681, 0.9281,'), EBASELINE, 1],
  ['a changed element is one stale and one new entry', EBASE.replace('3.562', '3.560'), EBASELINE, 2],
  ['an inserted element is one new entry and moves none', EBASE.replace('  3.000, 3.562,', '  3.000, 3.300, 3.562,'), EBASELINE, 1],
  ['an array on a scalar field\'s line counts once, as that field', ewith('const FixedWingParams FW_C = {', '  .stall_re = { 1.0e4, 2.0e4 },', '};'), EBASELINE, 1],
);

/* JavaScript: module level numbers and the objects and arrays they are
 * built of, past a comment with braces, a string with a comma and a regex
 * with a bracket; a layout table (SIM_*), a derived value and a number in
 * a function body are not constants. */
const JF = 'configs/power.js';
const JBASE = [
  'const IN = 0.0254;',
  'export const SIM_POWER = { KIND: 0, MASS: 1 };',
  'const b = 1.4, W = m * g;',
  'const ROW = {',
  "  kv: 920, // a comment { with braces, }",
  '  massKg: 2.10 - 0.536,',
  "  name: 'x, y}',",
  '  re: /[{(,]/,',
  '  curve: [1.0000, 0.9617],',
  '};',
  'function f(x) { return x * 3.7; }',
].join('\n');
const JBASELINE = [
  `${JF} IN = 0.0254`, `${JF} b = 1.4`, `${JF} ROW.kv = 920`, `${JF} ROW.massKg = 2.10 - 0.536`,
  `${JF} ROW.curve[] = 1.0000`, `${JF} ROW.curve[] = 0.9617`,
];
const jwith = (...extra) => JBASE + '\n' + extra.join('\n');
const jcases = [
  ['today\'s configs, every uncited constant baselined', JBASE, JBASELINE, 0],
  ['new constant cited on its line', jwith('const RHO = 1.225; // docs/POWER-STAGE1.md'), JBASELINE, 0],
  ['new declarations sharing a cited line', jwith('const c1 = 2.5, c2 = 3.5; /* FITTED: npm run stall:probe */'), JBASELINE, 0],
  ['new option cited by its source property', jwith("const OPT = { kv: 800, thrustG: 2790, source: ['https://example.com/x'.slice(0)] };"), JBASELINE, 0],
  ['new option, a source property as a list of names', jwith('const OPT = { kv: 800, thrustG: 2790, source: [HH, SUNNYSKY] };'), JBASELINE, 0],
  ['new constant, no source', jwith('const RHO = 1.225;'), JBASELINE, 1],
  ['new option, no source', jwith('const OPT = { kv: 800, thrustG: 2790 };'), JBASELINE, 2],
  ['a source property in another object does not cover this one', jwith('const OPT = [{ kv: 800, source: [HH] }, { kv: 920 }];'), JBASELINE, 1],
  ['a changed value is one stale and one new entry', JBASE.replace('kv: 920', 'kv: 900'), JBASELINE, 2],
  ['a helper building a row of data: its arguments count', jwith("const PACKS = [lipo('3s1300', 3, 1300, 113)];"), JBASELINE, 3],
  ['a declaration with no semicolon still ends at the next one', jwith('const Z = 1.5', 'const Y = 2.5;'), JBASELINE, 2],
];
let pass = 0;
let fail = 0;
for (const [name, text, baseline, want] of cases) {
  const got = check(scanFile(F, text), baseline).length;
  if (got === want) { pass++; continue; }
  fail++;
  console.error(`FAIL ${name}: ${got} problem(s), wanted ${want}`);
}

const over = check(scanFile(F, BASE), BASELINE, { ...PINS, scalar: BASELINE.length - 1 }).length;
if (over === 1) pass++; else { fail++; console.error(`FAIL baseline over the pin: ${over} problem(s), wanted 1`); }

const eover = check(scanFile(F, EBASE), EBASELINE, { ...PINS, element: EBASELINE.length - 1 }).length;
if (eover === 1) pass++; else { fail++; console.error(`FAIL elements over their pin: ${eover} problem(s), wanted 1`); }
/* Each pin counts its own kind only: a scalar pin of 0 holds a baseline of
 * elements, and an element pin of 0 a baseline of scalars. */
const apart = check(scanFile(F, EBASE), EBASELINE, { ...PINS, scalar: 0 }).length + check(scanFile(F, BASE), BASELINE, { ...PINS, element: 0 }).length;
if (apart === 0) pass++; else { fail++; console.error(`FAIL one kind counted against the other's pin: ${apart} problem(s), wanted 0`); }
const ints = check(scanFile(F, EBASE.replace('.parent = -1', '.parent = 0, .wheel = 3')), EBASELINE).length;
if (ints === 0) pass++; else { fail++; console.error(`FAIL an integer element (an index) counted as a constant: ${ints} problem(s), wanted 0`); }

/* Negative control: with citation detection disabled, every cited case
 * above must fail, or the cited passes prove nothing. */
const never = /(?!)/;
for (const [name, text, baseline, want] of cases) {
  if (want !== 0 || text === BASE || text === EBASE) continue;
  if (check(scanFile(F, text, never), baseline).length > 0) { pass++; continue; }
  fail++;
  console.error(`FAIL negative control ${name}: still passes with citations disabled`);
}

/* prune drops a cited and a gone entry, keeps the rest, and never admits
 * a new uncited constant. */
const cited = BASE.replace('  .cd0 = 0.030,', '  .cd0 = 0.030, /* docs/WING-STAGE1.md */') + '\n#define NEW_K 2.0';
const pruned = prune(scanFile(F, cited), [...BASELINE, `${F} FW_A.cm_0 = 0.02`]);
const wantPruned = [BASELINE[0], BASELINE[2]];
if (JSON.stringify(pruned) === JSON.stringify(wantPruned)) pass++; else { fail++; console.error(`FAIL prune: ${JSON.stringify(pruned)}`); }
const afterPrune = check(scanFile(F, cited), pruned).length;
if (afterPrune === 1) pass++; else { fail++; console.error(`FAIL prune admitted a new uncited constant: ${afterPrune} problem(s), wanted 1`); }

for (const [name, text, baseline, want] of jcases) {
  const got = check(scanJs(JF, text), baseline).length;
  if (got === want) { pass++; continue; }
  fail++;
  console.error(`FAIL ${name}: ${got} problem(s), wanted ${want}`);
}
for (const [name, text, baseline, want] of jcases) {
  if (want !== 0 || text === JBASE) continue;
  if (check(scanJs(JF, text, /(?!)/, /(?!)/), baseline).length > 0) { pass++; continue; }
  fail++;
  console.error(`FAIL negative control ${name}: still passes with citations disabled`);
}
const notConstants = check(scanJs(JF, jwith('const SIM_TUNE = { CG: 0, RATE: 1 };', 'export const SIM_TUNE_DOUBLES = 12;', 'const Vs = Math.sqrt(2 * W / (1.225 * S));', 'const ARGS = process.argv.slice(2), K = Math.pow(1.5, 2);', 'const PICK = { pack: PACKS[1], cell: CELLS[0][2] };', 'const g2 = (x) => { return x * 9.81; };')), JBASELINE).length;
if (notConstants === 0) pass++; else { fail++; console.error(`FAIL a layout table, a derived value or a function body counted as a constant: ${notConstants} problem(s), wanted 0`); }
const jover = check(scanJs(JF, JBASE), JBASELINE, { ...PINS, js: JBASELINE.length - 1 }).length;
const japart = check(scanJs(JF, JBASE), JBASELINE, { ...PINS, scalar: 0, element: 0 }).length;
if (jover === 1 && japart === 0) pass++; else { fail++; console.error(`FAIL the js pin: over ${jover} (wanted 1), against the C pins ${japart} (wanted 0)`); }

console.log(`physics-sources-selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
