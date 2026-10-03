/*
 * dash-lint.js: no em dash and no en dash in any text the repository
 * holds (CLAUDE.md: "No em dashes or en dashes in prose, comments, commit
 * messages or documentation"). Until this ran, the rule was enforced only
 * on the replay's strings (scripts/editor-ui-check.js).
 *
 * Every file git tracks, outside vendor/ (Betaflight and the other
 * upstream sources, read only), that is text: valid UTF-8 with no NUL
 * byte. Anything else is binary (a picture, a sound, a font, the HDR sky)
 * and is passed over, since the two dashes' UTF-8 bytes turn up in
 * compressed data by chance. Each hit is printed as path:line:column with the line, and any
 * hit fails. There is no list of excused files: a dash is replaced by a
 * comma, a colon or a full stop.
 *
 * Run with npm run lint:dashes.
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

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DASHES = /[\u2013\u2014]/g;
const SKIP = [/^vendor\//];
/* Text is what decodes as UTF-8 and holds no NUL; anything else is a
 * picture, a sound, a font or a sky, whose bytes form the dashes by chance. */
const UTF8 = new TextDecoder('utf-8', { fatal: true });

const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter((f) => f && !SKIP.some((re) => re.test(f)));

let scanned = 0;
let binary = 0;
const hits = [];
for (const f of files) {
  let buf;
  try {
    buf = await readFile(join(root, f));
  } catch (e) {
    /* Tracked but gone from the working tree (a deletion not yet
     * committed): nothing to read, so nothing to judge. */
    if (e.code === 'ENOENT' || e.code === 'EISDIR') {
      continue;
    }
    throw e;
  }
  let text;
  try {
    text = buf.includes(0) ? null : UTF8.decode(buf);
  } catch (e) {
    text = null;
  }
  if (text === null) {
    binary += 1;
    continue;
  }
  scanned += 1;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(DASHES)) {
      hits.push(`${f}:${i + 1}:${m.index + 1}: ${m[0] === '\u2014' ? 'em' : 'en'} dash  ${line.trim().slice(0, 100)}`);
    }
  });
}

console.log(`dash lint: ${scanned} text files scanned, ${binary} binary passed over, vendor/ skipped`);
if (hits.length) {
  for (const h of hits) {
    console.log(`  ${h}`);
  }
  console.log(`FAIL, ${hits.length} em or en dash(es): use a comma, a colon or a full stop`);
  process.exit(1);
}
console.log('PASS, no em or en dash in any text file');
