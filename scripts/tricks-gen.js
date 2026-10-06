/*
 * tricks-gen.js: writes src/game/tricks-sheet.js, the freestyle scoring
 * workbook's tables as a module, from the workbook's own extract.
 *
 *     node scripts/tricks-gen.js           write it
 *     node scripts/tricks-gen.js --check   fail if the committed file differs
 *
 * The source is tests/fixtures/freestyle-scoring/twp-calculator.json, the
 * extract of "Tyrantt_Pro_Whooper.xlsx" (The Whoop Pilots' freestyle scoring
 * calculator, supplied by the owner on 2026-08-30). Numbers carried from a
 * published sheet are facts, and a fact retyped by hand is a fact that can
 * drift, so the module is generated and the generator is the thing to read.
 *
 * What is taken, and how:
 *   TRICKS           every row of "Trick List - Outdoor", in sheet order.
 *   BUILDING_BLOCKS  every row of "Custom Trick Building Blocks".
 *   EXECUTION        the first block of the execution table (the sheet
 *                    restates it lower down with other wording), best grade
 *                    first. What a grade does to the streak is read off the
 *                    sheet's own note: "Kills Streak", "Stalls Streak",
 *                    "Reduces Streak" (halves it), and anything else leaves
 *                    the streak growing.
 *   REPEAT_TRICK, REPEAT_OBSTACLE
 *                    the penalty columns cut where they stop changing: the
 *                    last value then holds for every count past the end.
 *   BACK_TO_BACK_HALVING
 *                    the ratio between the first two back to back
 *                    penalties; the rest of the column must keep it, to the
 *                    sheet's display rounding (checked here).
 *   OBSTACLE_BONUS   [switches, multiplier] rows, cut where the multiplier
 *                    stops changing.
 *
 * Names a pilot reads go through the string table when the module loads: a
 * name or category gets str(key) where src/strings/en.js has a "tricks."
 * key holding exactly that text, and stays a literal where it has none.
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

import { readFileSync, writeFileSync } from 'node:fs';

import en from '../src/strings/en.js';

const SOURCE = new URL('../tests/fixtures/freestyle-scoring/twp-calculator.json', import.meta.url);
const TARGET = new URL('../src/game/tricks-sheet.js', import.meta.url);

const sheet = JSON.parse(readFileSync(SOURCE, 'utf8'));

const keyFor = new Map();
for (const [key, text] of Object.entries(en)) {
  if (!key.startsWith('tricks.')) continue;
  if (keyFor.has(text)) throw new Error(`tricks-gen: two string keys hold "${text}"`);
  keyFor.set(text, key);
}

/* A pilot-facing name as source text: the string table lookup if there is
 * one, else the literal. */
const shown = (text) => (keyFor.has(text) ? `str(${q(keyFor.get(text))})` : q(text));
function q(text) {
  return `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
function num(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`tricks-gen: not a number: ${n}`);
  return String(n);
}

/* Values up to the point where they stop changing, keeping one copy of the
 * value that then holds forever. */
function untilSteady(values) {
  let end = values.length;
  while (end > 1 && values[end - 2] === values[end - 1]) end -= 1;
  return values.slice(0, end);
}

function streakRule(note) {
  if (/Kills Streak/i.test(note ?? '')) return 'kill';
  if (/Stalls Streak/i.test(note ?? '')) return 'hold';
  if (/Reduces Streak/i.test(note ?? '')) return 'halve';
  return 'grow';
}

function grades() {
  const first = [];
  for (const g of sheet.trickExecution) {
    if (first.some((f) => f.execution === g.execution)) break;
    first.push(g);
  }
  /* Best grade first; a stable sort keeps the sheet's order between equals. */
  return first.slice().sort((a, b) => b.pointAdj - a.pointAdj);
}

function halving() {
  const rows = sheet.backToBackPenalty;
  const ratio = rows[1][1] / rows[0][1];
  for (let i = 1; i < rows.length && rows[i][1] > 0; i += 1) {
    /* The extract carries the sheet's display rounding, about 13 figures. */
    if (Math.abs(rows[i][1] / (rows[i - 1][1] * ratio) - 1) > 1e-9) throw new Error('tricks-gen: back to back penalty is not a constant ratio');
  }
  return ratio;
}

function obstacleBonus() {
  const rows = sheet.obstacleBonus.map((r) => [r.switches, r.multiplier]);
  let end = rows.length;
  while (end > 1 && rows[end - 2][1] === rows[end - 1][1]) end -= 1;
  return rows.slice(0, end);
}

const out = [];
out.push(`/*
 * tricks-sheet.js: the freestyle scoring workbook's tables.
 *
 * GENERATED FILE. Do not edit by hand: run \`node scripts/tricks-gen.js\`,
 * which reads tests/fixtures/freestyle-scoring/twp-calculator.json and says
 * how each table is taken from it. src/game/tricks.js is the module to
 * import; it re-exports these.
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

import { str } from '../strings/index.js';

const trick = (name, category, difficulty, points) => ({ name, category, difficulty, points });
const block = (name, points) => ({ name, points });
`);

out.push(`/* ${sheet.source.title}, "Trick List - Outdoor", ${sheet.outdoorTricks.length} rows. */`);
out.push('export const TRICKS = [');
for (const t of sheet.outdoorTricks) {
  out.push(`  trick(${shown(t.trick)}, ${shown(t.category)}, ${q(t.difficulty)}, ${num(t.points)}),`);
}
out.push('];', '');

out.push(`/* "Custom Trick Building Blocks", ${sheet.buildingBlocks.length} rows. */`);
out.push('export const BUILDING_BLOCKS = [');
for (const b of sheet.buildingBlocks) {
  out.push(`  block(${shown(b.trick)}, ${num(b.points)}),`);
}
out.push('];', '');

out.push('/* The execution grades, best first, with what each does to the streak. */');
out.push('export const EXECUTION = {');
for (const g of grades()) {
  out.push(`  ${g.execution}: { points: ${num(g.pointAdj)}, streak: ${q(streakRule(g.streakNote))}, label: ${shown(g.execution)} },`);
}
out.push('};', '');

out.push('/* Penalty for the nth repeat of a trick; the last value holds past the end. */');
out.push(`export const REPEAT_TRICK = [${untilSteady(sheet.repeatTrickPenalty.map((r) => r[1])).map(num).join(', ')}];`, '');
out.push('/* Each further back to back repeat multiplies the trick by this. */');
out.push(`export const BACK_TO_BACK_HALVING = ${num(halving())};`, '');
out.push('/* Penalty for the nth trick in a row on one obstacle; the last value holds. */');
out.push(`export const REPEAT_OBSTACLE = [${untilSteady(sheet.repeatObstaclePenalty.map((r) => r[1])).map(num).join(', ')}];`, '');
out.push('/* [obstacle switches needed, end of run multiplier]. */');
out.push('export const OBSTACLE_BONUS = [');
for (const [switches, mult] of obstacleBonus()) out.push(`  [${num(switches)}, ${num(mult)}],`);
out.push('];');

const text = `${out.join('\n')}\n`;
if (process.argv.includes('--check')) {
  let have = '';
  try {
    have = readFileSync(TARGET, 'utf8');
  } catch { /* a missing file is a stale file */ }
  if (have !== text) {
    console.log('tricks:gen FAILED: src/game/tricks-sheet.js is not what scripts/tricks-gen.js writes; run it and commit');
    process.exit(1);
  }
  console.log('tricks:gen ok: src/game/tricks-sheet.js matches the workbook extract');
} else {
  writeFileSync(TARGET, text);
  console.log(`tricks:gen: wrote src/game/tricks-sheet.js (${sheet.outdoorTricks.length} tricks, ${sheet.buildingBlocks.length} blocks)`);
}
