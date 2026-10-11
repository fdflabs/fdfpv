/*
 * ci-coverage-lint.js: every aircraft's gates and stabiliser checks run in
 * CI.
 *
 *     node scripts/ci-coverage-lint.js      (npm run lint:ci-coverage)
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

/*
 * Six aircraft's :gates and :stab sat in package.json with no step in
 * .github/workflows/checks.yml, so neither CI nor local-ci ran them and
 * their regressions went unseen (2026-10-11). Every npm script named
 * <name>:gates or <name>:stab must be run by a checks.yml step.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scripts = Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts);
const yml = readFileSync(join(root, '.github/workflows/checks.yml'), 'utf8');
const run = new Set([...yml.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]));
const missing = scripts.filter((s) => /^[\w-]+:(gates|stab)$/.test(s) && !run.has(s));
for (const s of missing) console.log(`ci-coverage-lint: ${s} is in package.json and no checks.yml step runs it`);
console.log(`ci-coverage-lint: ${missing.length ? 'FAIL' : 'PASS'}, ${scripts.filter((s) => /^[\w-]+:(gates|stab)$/.test(s)).length} gates and stab scripts`);
process.exit(missing.length ? 1 : 0);
