/*
 * physics-sources-lint.js: every physics constant in the C plant carries
 * its source (owner rule, CLAUDE.md: physics follows reality, and the
 * sources are cited). A constant is cited when its own line, or the
 * comment block directly above it, names a docs/*.md, a URL, a
 * scripts/*.js or an npm run check, or marks it FITTED: with its reason.
 *
 * Today's uncited constants are listed in scripts/physics-sources-baseline.txt,
 * keyed by file, symbol and value text, never by line number, so a lane
 * that moves lines is unaffected. The lint fails when:
 *   - an uncited constant is not in the baseline: a new constant, or a
 *     changed value (a changed value is a new key), needs a source;
 *   - a baseline entry no longer exists in the tree: delete it, so the
 *     list only shrinks;
 *   - the baseline holds more entries than PINNED_COUNT. Lowering the pin
 *     is the only edit that should ever touch it.
 * It reads the tree only, no git, so push, pull request and merge queue
 * runs are the same check. Run with npm run lint:physics-sources
 * (--root <dir> lints another checkout, --prune deletes stale baseline
 * entries and never adds one); its selftest is
 * npm run physics-sources:selftest.
 *
 * Known limit: a value changed in place under a comment that already
 * cites a source passes, whether or not that source gives the new value.
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

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILES = [
  'src/native/plant_wing.c',
  'src/native/plant.c',
  'src/native/sim.c',
  'src/native/crash.c',
  'src/native/crash_parts.h',
];
export const PINNED_COUNT = 2855;
const BASELINE = 'scripts/physics-sources-baseline.txt';

export const CITE = /FITTED:|docs\/[\w./-]+\.md|https?:\/\/|scripts\/[\w./-]+\.js|npm run [\w:-]+/;

const STRUCT_OPEN = /^(?:static )?const \w+ (\w+)(?:\[\w*\])? = \{\s*$/;
const FIELD = /^\s+\.(\w+)\s*=\s*(.*\d.*?),?\s*$/;
const DEFINE = /^#define (\w+) (.*\d.*?)\s*$/;

/* A comment block directly above line i: the contiguous comment lines that
 * end on line i - 1. A field or a blank line in between breaks it, so a
 * cite covers the constant it sits on, not the whole struct. */
function blockAbove(lines, i) {
  const block = [];
  for (let j = i - 1; j >= 0 && /^\s*(\/\*|\*|\/\/)/.test(lines[j]); j--) block.push(lines[j]);
  return block.join('\n');
}

/* Every constant in one file's text, as { key, cited }. */
export function scan(file, text, cite = CITE) {
  const lines = text.split('\n');
  const out = [];
  let struct = null;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    const open = STRUCT_OPEN.exec(s);
    if (open) { struct = open[1]; continue; }
    if (/^\};/.test(s)) { struct = null; continue; }
    const code = s.replace(/\/[*/].*$/, '');
    const f = struct ? FIELD.exec(code) : null;
    const d = DEFINE.exec(code);
    if (!f && !d) continue;
    const key = f ? `${file} ${struct}.${f[1]} = ${f[2].trim()}` : `${file} #define ${d[1]} ${d[2].trim()}`;
    out.push({ key, cited: cite.test(s) || cite.test(blockAbove(lines, i)) });
  }
  return out;
}

/* The failures for a tree's constants against a baseline (a list of keys,
 * duplicates allowed: two identical uncited rows are two entries). */
export function check(constants, baseline, pin = PINNED_COUNT) {
  const errors = [];
  if (baseline.length > pin) errors.push(`baseline holds ${baseline.length} entries, pinned at ${pin}; the list only shrinks`);
  const left = new Map();
  for (const k of baseline) left.set(k, (left.get(k) ?? 0) + 1);
  const uncited = new Set(constants.filter((c) => !c.cited).map((c) => c.key));
  for (const c of constants) {
    if (c.cited) continue;
    const n = left.get(c.key) ?? 0;
    if (n > 0) { left.set(c.key, n - 1); continue; }
    errors.push(`uncited: ${c.key} (cite a docs/*.md, URL, scripts/*.js, npm run check or FITTED: reason on its line or in the comment directly above)`);
  }
  for (const [k, n] of left) {
    if (n > 0 && !uncited.has(k)) errors.push(`stale baseline entry (cited, changed or gone), npm run lint:physics-sources -- --prune deletes it: ${k}`);
  }
  return errors;
}

/* The baseline with every stale entry removed and nothing added: a lane
 * that cites, changes or deletes a constant prunes, and its new uncited
 * constants still fail. */
export function prune(constants, baseline) {
  const have = new Map();
  for (const c of constants) if (!c.cited) have.set(c.key, (have.get(c.key) ?? 0) + 1);
  return baseline.filter((k) => {
    const n = have.get(k) ?? 0;
    if (n === 0) return false;
    have.set(k, n - 1);
    return true;
  });
}

export function readBaseline(root) {
  return readFileSync(join(root, BASELINE), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
}

export function scanTree(root, cite = CITE) {
  return FILES.flatMap((f) => scan(f, readFileSync(join(root, f), 'utf8'), cite));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--root');
  const root = at > 0 ? process.argv[at + 1] : fileURLToPath(new URL('..', import.meta.url));
  const constants = scanTree(root);
  const baseline = readBaseline(root);
  if (process.argv.includes('--prune')) {
    const file = join(root, BASELINE);
    const head = readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('#'));
    const kept = prune(constants, baseline);
    writeFileSync(file, [...head, ...kept].join('\n') + '\n');
    console.log(`physics-sources-lint: pruned ${baseline.length - kept.length} stale entries, ${kept.length} left; lower PINNED_COUNT to ${kept.length}`);
    process.exit(0);
  }
  const errors = check(constants, baseline);
  const uncited = constants.filter((c) => !c.cited).length;
  if (errors.length) {
    for (const e of errors) console.error(`physics-sources-lint: ${e}`);
    console.error(`physics-sources-lint: FAIL, ${errors.length} problem(s); ${constants.length} constants, ${uncited} uncited, baseline ${baseline.length}/${PINNED_COUNT}`);
    process.exit(1);
  }
  if (baseline.length < PINNED_COUNT) console.log(`physics-sources-lint: baseline ${baseline.length} is below the pin ${PINNED_COUNT}, lower PINNED_COUNT`);
  console.log(`physics-sources-lint: PASS, ${constants.length} constants, ${constants.length - uncited} cited, ${uncited} uncited all in the baseline (${baseline.length}, pinned ${PINNED_COUNT})`);
}
