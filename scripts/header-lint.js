/*
 * header-lint.js: no file gains the upstream's licence header.
 *
 *     node scripts/header-lint.js      (npm run lint:header)
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
 * The upstream's code is being rewritten out of this repository, and its
 * header ("This file is part of WebFPVSimulator") may stay only on a file
 * that still holds upstream code. Every new file copied the header from its
 * neighbour, so without this check the number of files naming the upstream
 * only ever grew.
 *
 * scripts/upstream-headers.txt is the list of files allowed to keep that
 * header. It only shrinks:
 *   - a file not on the list that names the upstream in its header fails:
 *     give it the header in CLAUDE.md;
 *   - a listed file that no longer names the upstream, or no longer
 *     exists, fails as stale: take it off the list;
 *   - where git history reaches the fork point (locally, not in CI's
 *     shallow clone), a listed file must have existed at 9ed8b9c or be one
 *     of the POST_FORK files below, so the list cannot be grown to make a
 *     new file pass.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FORK = '9ed8b9c';
const MARK = 'part of WebFPVSimulator';

/* Written after the fork but holding copied upstream snippets (or, for
 * drone.svg, written by a generator that still does) on 2026-10-06. Frozen:
 * entries leave as their files are rewritten, none are added. */
const POST_FORK = new Set([
  'assets/boot/drone.svg', 'scripts/bombshell-shell.js', 'scripts/boot-loader-check.js',
  'scripts/build-save-check.js', 'scripts/build-selftest.js', 'scripts/crash-rules-selftest.js',
  'scripts/drone-wireframe.js', 'scripts/floats-shell.js', 'scripts/itaipu-check.js',
  'scripts/mouse-shell.js', 'scripts/og-check.js', 'scripts/track-mode-check.js',
  'src/game/airframehull.js', 'src/game/verify.js', 'src/render/pylons.js',
  'src/replay/crashcam.js', 'src/ui/accountui.js', 'src/ui/campaign.js', 'src/ui/carousel.js',
  'src/ui/hangar-combat.js', 'src/ui/hangar-paint.js', 'src/ui/hangar-parts.js',
  'src/ui/hangar-tuning.js', 'src/ui/hangar.js', 'src/ui/progress-ui.js', 'src/ui/update.js',
]);

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });

const listed = readFileSync(join(root, 'scripts/upstream-headers.txt'), 'utf8').split('\n').filter(Boolean);
const allowed = new Set(listed);

/* git grep exits 1 when nothing matches, which is the goal state. */
let marked;
try {
  marked = git('grep', '-l', '-F', MARK, '--', '.', ':!vendor').split('\n').filter(Boolean);
} catch (e) {
  if (e.status !== 1) throw e;
  marked = [];
}
const markedSet = new Set(marked);

const failures = [];
for (const f of marked) {
  if (f === 'scripts/header-lint.js') continue;
  if (!allowed.has(f)) failures.push(`${f}: names WebFPVSimulator in its header; use the header in CLAUDE.md`);
}
for (const f of listed) {
  if (!markedSet.has(f)) failures.push(`${f}: listed in scripts/upstream-headers.txt but no longer carries the upstream header; remove the line`);
}

let historyNote;
try {
  git('cat-file', '-e', `${FORK}^{commit}`);
  const atFork = new Set(git('ls-tree', '-r', '--name-only', FORK).split('\n'));
  for (const f of listed) {
    if (!atFork.has(f) && !POST_FORK.has(f)) failures.push(`${f}: did not exist at ${FORK}; the list only shrinks, give the file the header in CLAUDE.md`);
  }
  historyNote = `every entry existed at ${FORK} or is a frozen post-fork exception`;
} catch {
  historyNote = `fork point ${FORK} not in this clone (shallow), entry origins not checked here`;
}

if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  console.log(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(`ok  ${listed.length} files still carry the upstream header, all listed; ${historyNote}`);
