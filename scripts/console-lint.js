/*
 * console-lint.js: no bare console.warn or console.error in src/
 * (docs/redesign/COMPLETENESS.md 65). A warning or an error the game
 * writes goes through logWarn or logError (src/share/crashrecord.js),
 * which print the same console line and keep it, under a category, in
 * the log the bug report carries. A bare call prints and is lost to the
 * report, which is how 34 of them sat outside the log until 2026-10-14.
 *
 * Every file git tracks under src/ ending .js or .mjs, comments included
 * (a comment can say "the console" instead). The one excused file is
 * crashrecord.js, whose logWarn and logError are the calls the rest use.
 * Each hit is printed as path:line:column with the line, and any hit fails.
 *
 * Run with npm run lint:console.
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

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OWNER = 'src/share/crashrecord.js';
/* A call, or the function handed on as a value (`.catch(console.error)`),
 * or the same through brackets. */
const BARE = /\bconsole\s*(?:\.\s*(warn|error)\b|\[\s*['"`](warn|error)['"`]\s*\])/g;

const files = execFileSync('git', ['ls-files', '-z', '--', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  .split('\0')
  .filter((f) => /\.m?js$/.test(f) && f !== OWNER);

let scanned = 0;
const hits = [];
for (const f of files) {
  let text;
  try {
    text = await readFile(join(root, f), 'utf8');
  } catch (e) {
    /* Tracked but gone from the working tree (a deletion not yet
     * committed): nothing to read, so nothing to judge. */
    if (e.code === 'ENOENT') {
      continue;
    }
    throw e;
  }
  scanned += 1;
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(BARE)) {
      hits.push(`${f}:${i + 1}:${m.index + 1}: console.${m[1] || m[2]}  ${line.trim().slice(0, 100)}`);
    }
  });
}

console.log(`console lint: ${scanned} files under src/ scanned, ${OWNER} excused`);
if (hits.length) {
  for (const h of hits) {
    console.log(`  ${h}`);
  }
  console.log(`FAIL, ${hits.length} bare console.warn or console.error: use logWarn or logError from ${OWNER}, with a category`);
  process.exit(1);
}
console.log('PASS, every warning and error in src/ goes through the log');
