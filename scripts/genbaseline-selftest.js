/*
 * genbaseline-selftest.js: tests/gen/gen-baseline.js still produces the
 * committed tests/inputs/baseline.rec byte for byte, and still guards it.
 *
 *     node scripts/genbaseline-selftest.js   (npm run genbaseline:selftest)
 *
 * The generator always writes to tests/inputs/baseline.rec beside its own
 * folder, so it is copied into a scratch tree (tests/gen plus links to
 * tests/lib and tests/thresholds.json, which sets the sample rate) and run
 * there; the real recording is never touched. Checked:
 * a fresh run matches the committed bytes (length and sha256), a second
 * run refuses to overwrite with exit 1 and its message, and --force
 * rewrites the same bytes. Every replay digest depends on those bytes.
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

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMITTED = readFileSync(join(ROOT, 'tests/inputs/baseline.rec'));
const SHA = '13bbb5bb2ffb84292ad338ab5712411eeb14bc9ed3f281c63114c379af40d2a9';
const LENGTH = 150032;
const REFUSAL =
  'gen:baseline: tests/inputs/baseline.rec already exists and is a committed, byte-stable artifact. Use --force only for Loop A regeneration.';

const sha = (b) => createHash('sha256').update(b).digest('hex');
let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok' : 'FAILED'}: ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
}

check('committed baseline.rec is the pinned recording', COMMITTED.length === LENGTH && sha(COMMITTED) === SHA,
  `${COMMITTED.length} bytes, sha256 ${sha(COMMITTED)}`);

const scratch = mkdtempSync(join(tmpdir(), 'genbaseline-'));
try {
  mkdirSync(join(scratch, 'tests/gen'), { recursive: true });
  mkdirSync(join(scratch, 'tests/inputs'));
  copyFileSync(join(ROOT, 'tests/gen/gen-baseline.js'), join(scratch, 'tests/gen/gen-baseline.js'));
  symlinkSync(join(ROOT, 'tests/lib'), join(scratch, 'tests/lib'));
  symlinkSync(join(ROOT, 'tests/thresholds.json'), join(scratch, 'tests/thresholds.json'));
  const out = join(scratch, 'tests/inputs/baseline.rec');
  const run = (...args) =>
    spawnSync(process.execPath, [join(scratch, 'tests/gen/gen-baseline.js'), ...args], { encoding: 'utf8' });

  const fresh = run();
  const expectOut = [
    `gen:baseline: wrote ${out}`,
    `gen:baseline: 7500 samples at 250 Hz, ${LENGTH} bytes`,
    `gen:baseline: sha256 ${SHA}`,
    '',
  ].join('\n');
  check('fresh run exits 0', fresh.status === 0, `exit ${fresh.status} ${fresh.stderr.trim()}`);
  check('fresh run prints path, sample count and digest', fresh.stdout === expectOut, JSON.stringify(fresh.stdout));
  const bytes = readFileSync(out);
  check('fresh run writes the committed bytes', bytes.length === LENGTH && sha(bytes) === SHA,
    `${bytes.length} bytes, sha256 ${sha(bytes)}`);

  const again = run();
  check('second run refuses with exit 1', again.status === 1, `exit ${again.status}`);
  check('second run says why on stderr', again.stderr === `${REFUSAL}\n` && again.stdout === '',
    JSON.stringify(again.stderr));

  const forced = run('--force');
  check('--force exits 0 with the same report', forced.status === 0 && forced.stdout === expectOut,
    `exit ${forced.status} ${JSON.stringify(forced.stdout)}`);
  check('--force rewrites the same bytes', sha(readFileSync(out)) === SHA);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failed) {
  console.log(`genbaseline:selftest: ${failed} FAILED`);
  process.exit(1);
}
console.log('genbaseline:selftest: all ok');
