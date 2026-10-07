/*
 * preset-lint.js: every shipped tune in configs/*.diff must reach the
 * compiled Betaflight module. Each file is loaded into a fresh dist/sim.wasm
 * and the module's own counters say how many `set` lines it applied, kept
 * as inert by design, or did not recognise. Run with npm run lint:presets.
 *
 * The config shim once recognised only 25 keys and silently accepted the
 * rest, so shipped tunes carried `set` lines that changed nothing. A tune
 * that silently does not apply is worse than one that fails to load.
 *
 * scripts/crash-identity.js compares this script's stdout across builds,
 * so the output format is a contract.
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

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TUNES } from '../configs/registry.js';
import { loadSim, SIM_OK, simErrorName } from '../tests/lib/simmod.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configsDir = join(root, 'configs');

/* sim_bf_debug slots from src/native/bf/bf_glue.c. A debug channel, not the
 * ABI, so a rebuild that moves them shows up here first. */
const SLOT_APPLIED = 13;
const SLOT_INERT = 14;
const SLOT_UNKNOWN = 15;

const SET_LINE = /^\s*set\s+\S+\s*=/;

async function lintFile(wasm, name) {
  const text = await readFile(join(configsDir, name), 'utf8');
  /* A fresh instance per file: a second sim_init on one instance is not a
   * power-on, and counters would carry over. */
  const sim = await loadSim(wasm);
  if (typeof sim.e.sim_bf_debug !== 'function') {
    console.error('sim.wasm does not export sim_bf_debug; rebuild with npm run build:wasm');
    process.exit(1);
  }
  const code = sim.init(text);
  if (code !== SIM_OK) {
    return { name, ok: false, detail: `sim_init returned ${simErrorName(code)}` };
  }

  const setLines = text.split('\n').filter((line) => SET_LINE.test(line)).length;
  const applied = sim.e.sim_bf_debug(SLOT_APPLIED);
  const inert = sim.e.sim_bf_debug(SLOT_INERT);
  const unknown = sim.e.sim_bf_debug(SLOT_UNKNOWN);
  const counted = applied + inert + unknown;

  const reasons = [];
  if (unknown > 0) {
    reasons.push(`${unknown} key(s) unrecognised`);
  }
  if (applied === 0) {
    reasons.push('nothing applied');
  }
  if (counted !== setLines) {
    reasons.push(`counted ${counted} of ${setLines} set lines`);
  }

  let detail = `${setLines} set lines: ${applied} applied, ${inert} inert by design, ${unknown} unrecognised`;
  if (reasons.length > 0) {
    detail += `  <-- ${reasons.join('; ')}`;
  }
  return { name, ok: reasons.length === 0, detail };
}

const wasm = await readFile(join(root, 'dist', 'sim.wasm'));
const files = (await readdir(configsDir)).filter((name) => name.endsWith('.diff')).sort();

const rows = [];
for (const name of files) {
  rows.push(await lintFile(wasm, name));
}
for (const tune of TUNES) {
  const name = `${tune.id}.diff`;
  if (!files.includes(name)) {
    rows.push({ name, ok: false, detail: 'named in configs/registry.js, no such file' });
  }
}

const width = Math.max(...rows.map((r) => r.name.length));
const failed = rows.filter((r) => !r.ok).length;

console.log('preset-lint: every shipped tune, against the compiled module\n');
for (const r of rows) {
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} presets clean`);
process.exit(failed === 0 ? 0 : 1);
