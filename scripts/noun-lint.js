/*
 * noun-lint.js: the player only ever reads "track". Fails when "course" or
 * "courses" appears in text a player can read: string literals in .js files
 * and, in .html pages, inline script literals, text nodes and the attributes
 * that render. Identifiers, screen ids, class names, storage keys, routes and
 * comments are not read. Run with npm run lint:nouns.
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
 * One word for one thing. The object a player builds, publishes and races
 * used to be a "track" in map ids, menu rows, screen titles and a mode, and a
 * "course" on the board and in the builder's prose; the board's own empty
 * state used both nouns in one sentence. A player cannot be expected to work
 * out that two nouns are one object. The rename is finished; this keeps the
 * word from coming back with the next new screen.
 *
 * Only player-visible text is policed. activeCourseSummary or .course-card
 * are read by developers only, and renaming a stored key would orphan every
 * track already saved in someone's browser. Comments are free to say the
 * word, since one may have to explain why a key is still spelled that way.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/*
 * Exceptions, each argued: a blanket rule that cannot be argued with gets
 * switched off rather than obeyed. Entries are { file, text }, matched
 * against the raw literal of a .js file. Empty now. The one historical entry
 * was "FINA 50 m course" in the Municipal baths map (the swimming term), and
 * it went with the map on 2026-08-30: an exception outliving the file it
 * excuses is how such a list stops meaning anything.
 */
const ALLOWED = [];

const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.loop', 'vendor', 'dist', 'tests', 'tmp']);

/*
 * The check harnesses drive the shell by its internal screen ids inside
 * templates passed to page.evaluate (ui.show('courses')), which a string
 * reader cannot tell from prose, and selftest names describe code. Other
 * scripts that generate player-visible output are still read.
 */
const SKIP_FILES = [
  (rel) => rel === 'scripts/noun-lint.js',
  (rel) => rel.endsWith('selftest.js'),
  (rel) => /^scripts\/[a-z-]+-check\.js$/.test(rel),
];

const WORD = /(?<![A-Za-z0-9_])[cC]ourses?(?![A-Za-z0-9_])/;
const MACHINE_TOKEN = /^[a-z0-9\-_./#?=&:]+$/;
/* ${...} is code, not text: ${card.course.track.id} puts the word in front
 * of the lint and nothing in front of a player. */
const INTERPOLATION = /\$\{[^}]*\}/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const SCRIPT_BLOCK = /<script[^>]*>([\s\S]*?)<\/script>/gi;
const STYLE_BLOCK = /<style[^>]*>[\s\S]*?<\/style>/gi;
const TEXT_NODE = />([^<]+)</g;
const ATTRIBUTE = /(content|placeholder|aria-label|title|alt)="([^"]*)"/g;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walk(path);
      }
      continue;
    }
    if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) {
      yield path;
    }
  }
}

/*
 * A character scanner rather than a regex, because a regex cannot tell an
 * apostrophe in a comment from the start of a string. It knows nothing of
 * regex literals: a quote inside one opens a string.
 */
function literals(src) {
  const found = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (ch !== '\'' && ch !== '"' && ch !== '`') {
      i++;
      continue;
    }
    const start = i + 1;
    let j = start;
    while (j < src.length && src[j] !== ch) {
      j += src[j] === '\\' ? 2 : 1;
    }
    const end = Math.min(j, src.length);
    found.push({ pos: start, text: src.slice(start, end) });
    i = end + 1;
  }
  return found;
}

function isMachineText(text) {
  return text.trim().split(/\s+/).filter(Boolean).every((token) => MACHINE_TOKEN.test(token));
}

function visibleText(raw) {
  return raw.replace(INTERPOLATION, '');
}

function lineAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
    }
  }
  return line;
}

/* Keeps the newlines so every later line number still points into the original. */
function blank(block) {
  return block.replace(/[^\n]/g, '');
}

function readsAsProse(raw) {
  const visible = visibleText(raw);
  return WORD.test(visible) && !isMachineText(visible);
}

function lintJs(rel, src) {
  return literals(src)
    .filter(({ text }) => readsAsProse(text))
    .filter(({ text }) => !ALLOWED.some((a) => a.file === rel && text.includes(a.text)))
    .map(({ pos, text }) => ({ line: lineAt(src, pos), text: text.trim().replace(/\s+/g, ' ').slice(0, 90) }));
}

/*
 * Style is not player text and script is JavaScript, read by the literal
 * rule; both are blanked before the text node pass, or the palette and every
 * inline module would come back as prose. Inline script lines are counted in
 * the original file at the block's offset in the comment-stripped text, so a
 * comment before a script reads short; kept so results match the history.
 */
function lintHtml(src) {
  const stripped = src.replace(HTML_COMMENT, blank);
  const scripts = [...stripped.matchAll(SCRIPT_BLOCK)];
  const blanked = stripped.replace(STYLE_BLOCK, blank).replace(SCRIPT_BLOCK, blank);
  const findings = [];
  for (const script of scripts) {
    const line = lineAt(src, script.index);
    for (const { text } of literals(script[1])) {
      if (readsAsProse(text)) {
        findings.push({ line, text: `inline script: ${visibleText(text).trim().slice(0, 80)}` });
      }
    }
  }
  for (const node of blanked.matchAll(TEXT_NODE)) {
    if (WORD.test(node[1])) {
      findings.push({ line: lineAt(blanked, node.index), text: node[1].trim().slice(0, 90) });
    }
  }
  for (const attr of blanked.matchAll(ATTRIBUTE)) {
    const [, name, value] = attr;
    if (WORD.test(value)) {
      findings.push({ line: lineAt(blanked, attr.index), text: `${name}="${value.slice(0, 70)}"` });
    }
  }
  return findings;
}

let scanned = 0;
const failures = [];
for await (const path of walk(root)) {
  const rel = relative(root, path).split(sep).join('/');
  if (SKIP_FILES.some((skip) => skip(rel))) {
    continue;
  }
  scanned++;
  const src = await readFile(path, 'utf8');
  const findings = rel.endsWith('.html') ? lintHtml(src) : lintJs(rel, src);
  for (const { line, text } of findings) {
    failures.push(`  ${rel}:${line}  ${text}`);
  }
}

console.log(`noun lint: ${scanned} file(s) scanned for a player-visible "course"`);
if (failures.length) {
  for (const failure of failures) {
    console.log(failure);
  }
  console.log('');
  console.log(`FAIL, ${failures.length} player-visible "course"`);
  console.log('The player sees one noun. Use track, or add an argued exception to ALLOWED.');
  process.exit(1);
}
console.log(`  allowed, with reasons in this file: ${ALLOWED.length}`);
console.log('');
console.log('PASS, the player only ever sees a track');
