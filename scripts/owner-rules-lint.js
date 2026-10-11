/*
 * owner-rules-lint.js: the owner's physics rule at the top of CLAUDE.md
 * (between the OWNER RULE: BEGIN and END markers) is present and
 * unchanged, byte for byte. The owner asked for it to be "unchangeable
 * and unremovable" (2026-10-09), so an edit, a removal or a moved marker
 * fails CI. Only the owner changes the rule; changing it means changing
 * PINNED below in the same commit, which a reviewer sees.
 *
 * Run with npm run lint:owner-rules.
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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PINNED = '9fe572ffd43520f14f9173c2169ee4886ed84c9fd2463ffdbd6915de2248433b';
const BEGIN = '<!-- OWNER RULE: BEGIN';
const END = '<!-- OWNER RULE: END -->';

const text = readFileSync(fileURLToPath(new URL('../CLAUDE.md', import.meta.url)), 'utf8');
const i = text.indexOf(BEGIN);
const j = text.indexOf(END);
if (i < 0 || j < i) {
  console.error('owner-rules-lint: FAIL, the owner rule block is missing from CLAUDE.md');
  process.exit(1);
}
const hash = createHash('sha256').update(text.slice(i, j + END.length)).digest('hex');
if (hash !== PINNED) {
  console.error(`owner-rules-lint: FAIL, the owner rule in CLAUDE.md changed (sha256 ${hash}, pinned ${PINNED}); only the owner may change it`);
  process.exit(1);
}
console.log('owner-rules-lint: PASS, the owner rule in CLAUDE.md is present and unchanged');
