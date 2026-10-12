/*
 * figures-table.js: the manoeuvre table, docs/figures-table.json. One row
 * per figure in the catalogue (src/game/figures.js): where its K comes
 * from, the person who flies it (personpilot.js) and the law they fly it
 * by, and what one flight of that law on the compiled plant measured. A
 * figure with a program (tests/lib/figureprograms.js) is flown once on
 * the Extra 330 in Manual, level at 22 m/s, 150 m up: whether the judge
 * named it, its grade, what else it named, whether the program finished,
 * whether it reached the ground (150 m below its start) and the lowest
 * height, and the grade the CAP and the Slick name it at flying the same
 * program (others, null where not named). tiers: the hangar's control
 * surface tiers the program needs (PROGRAM_TIERS), null where stock throws
 * fly it; each flight seats them and seated says what it got (an aircraft
 * with no tiers in the hangar flies stock, null). The loop, the aileron
 * roll and the 4-point roll are flown by figures-plant-check.js's own
 * program, a gate with its own pass band, and the row says so. The
 * 'waits' figures have no law yet.
 *
 * margin: the loops a program closes through the person whose phase and
 * gain margins are measured (scripts/figures-margins.js, on the Extra; the
 * hover's on all three, and a hover loop short of the criterion blocks
 * every figure flown on it from being flown),
 * named per row, their numbers under pilot.margins; --check fails when a
 * margin is short of the bandwidth criterion or the line hold's fit is
 * not the plant's. The other phases (pulls, rolls, points, the 3D holds)
 * fly fixed sticks or fixed gains with no measured margin, and a row
 * whose program has none of the measured loops says so with null.
 *
 *   node scripts/figures-table.js           write the table
 *   node scripts/figures-table.js --check   fail when the table on disk is
 *                                           not what the tree flies, or a
 *                                           row is missing or has no law
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

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIGURES } from '../src/game/figures.js';
import { PERSON } from '../tests/lib/personpilot.js';
import { PROGRAMS, PROGRAM_TIERS, EVERY, LINE_GAINS, fly } from '../tests/lib/figureprograms.js';
import { CAP_AIRFRAME, SLICK_AIRFRAME } from '../tests/lib/wingpilot.js';
import { measureMargins, marginFailures, hoverShort } from './figures-margins.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const FILE = join(root, 'docs/figures-table.json');

const PLANT_CHECK = new Set(['loop', 'aileron_roll', 'four_point_roll']);
/* The measured loops, by the phase names that fly them. */
const MEASURED_LOOPS = [['line ', ['lineElevator', 'lineRudder']], ['knife ', ['knife']], ['knife loop', ['knifeLoop']], ['hover ', ['hover']]];
const marginOf = (phases) => {
  const loops = MEASURED_LOOPS.filter(([prefix]) => phases.some((p) => p.startsWith(prefix))).flatMap(([, loop]) => loop);
  return loops.length ? loops : null;
};

function lawOf(f) {
  if (PROGRAMS[f.id]) return { by: 'tests/lib/figureprograms.js', phases: PROGRAMS[f.id].map((p) => p.name) };
  if (PLANT_CHECK.has(f.id)) return { by: 'scripts/figures-plant-check.js (npm run figures:plant, graded 4 to 10)', phases: null };
  return null;
}

/* The same program on the CAP and the Slick, at the same launch: the grade
 * each names the figure at, or null. A figure is promoted on the Extra;
 * these say whether the others fly it too. */
async function others(id, seated) {
  const out = {};
  for (const [name, airframe] of [['cap', CAP_AIRFRAME], ['slick', SLICK_AIRFRAME]]) {
    const r = await fly(PROGRAMS[id], { wasmBytes, configText, airframe, tiers: tiersOf(id) });
    const hit = r.got.find((g) => g.figure === id);
    out[name] = hit ? hit.grade : null;
    seated[name] = r.seated;
  }
  return out;
}

const tiersOf = (id) => PROGRAM_TIERS[id] ?? null;

async function build() {
  const rows = [];
  for (const f of FIGURES) {
    const law = lawOf(f);
    let measured = null;
    if (law && law.phases) {
      const r = await fly(PROGRAMS[f.id], { wasmBytes, configText, tiers: tiersOf(f.id) });
      const hit = r.got.find((g) => g.figure === f.id);
      const seated = { extra: r.seated };
      measured = {
        named: Boolean(hit),
        grade: hit ? hit.grade : null,
        flew: r.got.map((g) => `${g.figure} ${g.grade}`),
        finished: r.finished,
        crashed: r.crashed,
        lowestM: Number(r.minZ.toFixed(1)),
        others: await others(f.id, seated),
        seated,
      };
    }
    rows.push({
      id: f.id,
      family: f.family,
      k: f.k,
      source: f.aresti ? `Aresti ${f.aresti.join(' + ')} (OpenAero figures19.js, powered K)` : 'game scale (docs/TRICKS-CATALOG.md, "The game scale")',
      physics: f.physics,
      tiers: law && law.phases ? tiersOf(f.id) : null,
      law,
      measured,
      margin: law && law.phases ? marginOf(law.phases) : null,
    });
  }
  return {
    about: 'Generated by scripts/figures-table.js; do not edit. One row per figure in src/game/figures.js.',
    pilot: {
      delayMs: PERSON.delayMs,
      everyMs: EVERY,
      steps: PERSON.steps,
      lineGains: LINE_GAINS,
      source: 'McRuer and Jex, IEEE Trans. HFE 8(3), 1967: a trained operator\'s effective delay in compensatory tracking',
      margins: await measureMargins(),
    },
    rows,
  };
}

/* What the table must hold whatever the plant does: every catalogue
 * figure once, in order, and a law for every one that is not waiting on
 * the 3D lane. Returns what is wrong, or ''. */
function structureBroken(table) {
  const ids = table.rows.map((r) => r.id);
  if (ids.join() !== FIGURES.map((f) => f.id).join()) return 'the rows are not the catalogue\'s figures, once each, in order';
  const lawless = table.rows.filter((r) => r.physics !== 'waits' && !r.law).map((r) => r.id);
  if (lawless.length) return `no pilot law for ${lawless.join(', ')}`;
  const unflown = table.rows.filter((r) => r.law && r.law.phases && !r.measured).map((r) => r.id);
  if (unflown.length) return `a program never flown for ${unflown.join(', ')}`;
  return '';
}

const table = await build();
const text = `${JSON.stringify(table, null, 2)}\n`;
const broken = structureBroken(table);
if (broken) {
  console.log(`figures table: FAIL ${broken}`);
  process.exit(1);
}
if (!process.argv.includes('--check')) {
  await writeFile(FILE, text);
  console.log(`figures table: wrote ${table.rows.length} rows to docs/figures-table.json`);
  process.exit(0);
}

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const disk = await readFile(FILE, 'utf8').catch(() => '');
check('docs/figures-table.json is what the tree flies (npm run figures:table to regenerate)', disk === text,
  disk === text ? '' : disk ? 'differs' : 'missing');
check(`every catalogue figure has a row and every one not waiting a law (${table.rows.length} rows)`, broken === '');
/* Negative controls: a table missing a row, and one with a law dropped,
 * must both be caught. */
check('negative control: a table missing a row is caught', structureBroken({ rows: table.rows.slice(1) }) !== '');
check('negative control: a row with its law dropped is caught',
  structureBroken({ rows: table.rows.map((r) => (r.id === 'loop' ? { ...r, law: null } : r)) }) !== '');
/* A figure marked flown is one the person names on today's plant
 * (src/game/figures.js): a flown row whose program no longer names it, or
 * that never finishes or flies into the ground, means the status is stale
 * or the plant moved under the program, and must be seen. two_point_roll
 * sat flown for a day while its program flew an aileron roll (the prop
 * curves, 562dc785e, rolled it faster than its points law let go for). */
const staleFlown = (rows) => rows.filter((r) => r.physics === 'flown' && r.measured
  && !(r.measured.named && r.measured.grade > 0 && r.measured.finished && !r.measured.crashed)).map((r) => r.id);
const stale = staleFlown(table.rows);
check('every flown figure with a program is named by it above zero, finished and clear of the ground', stale.length === 0, stale.join(', '));
check('negative control: a flown row its program no longer names is caught',
  staleFlown(table.rows.map((r) => (r.id === 'tailslide' ? { ...r, measured: { ...r.measured, named: false } } : r))).includes('tailslide'));
/* A row that needs tiers says so only if its Extra flight seated them:
 * a program flown stock under a tier's name would be a stock result
 * reported as a tier's, or a tier's reported as stock. */
const unseated = (rows) => rows.filter((r) => r.tiers && JSON.stringify(r.measured.seated.extra) !== JSON.stringify(r.tiers)).map((r) => r.id);
const notSeated = unseated(table.rows);
check('every row that needs control surface tiers was flown on them on the Extra', notSeated.length === 0, notSeated.join(', '));
check('negative control: a row flown stock under a tier\'s name is caught',
  unseated(table.rows.map((r) => (r.tiers ? { ...r, measured: { ...r.measured, seated: { ...r.measured.seated, extra: null } } } : r))).length > 0);
const short = marginFailures(table.pilot.margins);
check('every measured loop keeps the bandwidth criterion\'s margins and the line hold\'s fit is the plant\'s', short.length === 0, short.join('; '));
check('negative control: a loop at 5 dB is caught', marginFailures({ ...table.pilot.margins,
  lineElevator: { ...table.pilot.margins.lineElevator, level: [{ ...table.pilot.margins.lineElevator.level[0], gmDb: 5 }] } }).length === 1);
/* A figure flown on the hover's loops is promoted only while every one of
 * them keeps the criterion on the three aircraft it is flown on: a hover
 * held on a loop short of it is a hover held by luck, not by a person. */
const onShortHover = (rows, short) => rows.filter((r) => r.physics === 'flown' && r.margin && r.margin.includes('hover') && short.length).map((r) => r.id);
const shortHover = hoverShort(table.pilot.margins);
for (const s2 of shortHover) console.log(`     hover loop short of the criterion: ${s2}`);
const promotedShort = onShortHover(table.rows, shortHover);
check('no figure flown on a hover loop short of the criterion', promotedShort.length === 0, promotedShort.join(', '));
check('negative control: a hover row marked flown on a short loop is caught',
  onShortHover(table.rows.map((r) => (r.id === 'hover' ? { ...r, physics: 'flown' } : r)), ['extra yaw']).includes('hover'));
const named = table.rows.filter((r) => r.measured && r.measured.named).length;
const flown = table.rows.filter((r) => r.measured).length;
console.log(`\nfigures table: ${named} of ${flown} programs named as flown; ${fail ? `${fail} failed` : 'all hold'}`);
process.exit(fail ? 1 : 0);
