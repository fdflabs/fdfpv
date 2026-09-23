/*
 * copy-lint.js: every sentence the pilot reads lives in src/strings.
 *
 * Scans the shell's JavaScript for string literals and templates that read
 * as prose, a space and some letters, outside the string tables, and fails
 * on any it finds. The tokenizer is the noun lint's: comments stripped,
 * every quoted literal collected, ${...} blanked. Literals that are data
 * with spaces in them are excused by shape (CSS values, SVG paths, class
 * lists, HTML) or by what stands before them on the line (an Error, a
 * console call, a style property, a storage key). Files listed in EXCUSED
 * are not scanned, each with its reason. Run with npm run lint:copy.
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

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'dist', 'tests', 'tmp', 'strings', 'vendored', 'native']);

/* Not scanned, and why. */
const EXCUSED = new Map([
  ['src/share/ghostdata.js', 'wire format; its errors travel to the board and the log, not the pilot'],
  ['src/share/identity.js', 'wire format; verified by the board'],
  ['src/share/live.js', 'socket; no copy'],
  ['src/game/verify.js', 'runs on the board; its refusal reasons are the board\'s to translate'],
  ['src/game/race.js', 'runs on the board too; its flash text is composed on the OSD'],
  ['src/maps/city/places/signs.js', 'signage baked into the world, English and Japanese by design'],
  ['src/art/clubhouse.js', 'a plaque baked into the world'],
  ['src/game/tricks.js', 'trick proper names stay as they are in every language'],
  ['src/ui/fc.js', 'Betaflight field names are the firmware\'s, not ours to translate'],
  ['src/boot.js', 'runs before the string table can load'],
  ['src/ui/loading.js', 'runs before the string table can load; its copy is the recovery advice'],
  ['src/game/proven.js', 'trick proper names and their proven signatures'],
  ['src/game/trickdetect.js', 'trick proper names, matched by the detector'],
  ['src/render/tracks.js', 'music titles are the tracks\' own names'],
  ['src/render/scene.js', 'material keys and assertions; nothing the pilot reads'],
  ['src/render/celmat.js', 'GLSL patches'],
  ['src/render/post.js', 'GLSL'],
  ['src/fc/dump.js', 'Betaflight CLI lines'],
  ['src/render/budget.js', 'a developer overlay of GPU allocations'],
]);

const SHAPE_OK = [
  /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,\-e]+$/,                        /* svg path */
  /(\d(px|em|rem|vh|vw|%|deg|ms|s)\b|rgba?\(|hsla?\(|var\(--|calc\(|translate|scale\(|url\(|!important|inset\b)/,
  /^\s*[<{[]/,                                                    /* html or json */
  /^[A-Z_0-9]+(\s+[A-Z_0-9]+)+$/,                                 /* constants */
  /^[\s\d.,+\-*/%()=<>!&|?:^~]+$/,                              /* numbers and operators */
  /^(source-over|destination-|lighter|multiply|screen|overlay|round|square|butt|miter|bevel|center|left|right|top|bottom|middle|alphabetic|hanging|ideographic|bold|italic|normal|small-caps)\b/,
  /\b(vec[234]|mat[234]|texture2D|uniform|varying|gl_[A-Za-z]+|float [a-z]|#include|precision)\b/, /* GLSL */
  /^[a-z_]+:\s*x\s*$/,                                             /* a key with a placeholder */
  /^[a-z_]+( x)+$/,                                                 /* a CLI line with placeholders */
  /\/api\//,                                                        /* a board route */
];
const CONTEXT_OK = /(new Error|new TypeError|new RangeError|throw |console\.[a-z]+|\.style\.[a-zA-Z]+ *=|setProperty\(|\.cssText|className *=|classList\.|setAttribute\((['"])(d|viewBox|points|fill|stroke|transform|style|class|font|font-family)\1|\.font *=|\.textBaseline|\.textAlign|\.globalCompositeOperation|\.filter *=|localStorage\.|sessionStorage\.|Symbol\(|new RegExp|assert\(|must\(|import\(|from |\.matchMedia\(|querySelector(All)?\(|getContext\(|new URL\(|fetch\(|performance\.mark|performance\.measure|dataset\.[a-zA-Z]+ *=)[^;]*$/;

function literals(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      /* A template's \${...} can hold strings of its own, backticks included,
       * so a template is walked with the brace depth in hand and an inner
       * string is stepped over whole. */
      let depth = 0;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (c === '`' && depth > 0 && (src[j] === '"' || src[j] === "'" || src[j] === '`')) {
          const q = src[j];
          j += 1;
          while (j < n && src[j] !== q) {
            j += src[j] === '\\' ? 2 : 1;
          }
          j += 1;
          continue;
        }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') {
          depth += 1;
          j += 2;
          continue;
        }
        if (c === '`' && depth > 0 && src[j] === '}') {
          depth -= 1;
          j += 1;
          continue;
        }
        if (src[j] === c && depth === 0) {
          break;
        }
        if (src[j] === '\n') {
          line += 1;
        }
        j += 1;
      }
      /* Two lines of context, because an Error's message often starts on the
       * line after the throw. */
      const lineStart = src.lastIndexOf('\n', i) + 1;
      const prevStart = src.lastIndexOf('\n', lineStart - 2) + 1;
      out.push({ line, text: src.slice(i + 1, Math.min(j, n)), before: src.slice(prevStart, i) });
      i = j + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      const chunk = src.slice(i, j < 0 ? n : j + 2);
      line += (chunk.match(/\n/g) || []).length;
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    i += 1;
  }
  return out;
}

function isProse(raw) {
  /* Innermost placeholders first, so a template inside a template blanks
   * whole rather than leaving its tail behind. */
  let text = raw;
  for (let pass = 0; pass < 8 && /\$\{/.test(text); pass += 1) {
    text = text.replace(/\$\{[^{}]*\}/g, 'x');
  }
  text = text.trim();
  if (!/\s/.test(text) || !/[A-Za-z]{2,}/.test(text.replace(/\bx+\b/g, ''))) {
    return false;
  }
  if (SHAPE_OK.some((re) => re.test(text))) {
    return false;
  }
  if (/^[a-z0-9-]+( [a-z0-9-]+)+$/.test(text) && !text.split(' ').some((w) => /^(the|a|an|and|or|to|of|in|on|is|it|you|your|this|that|for|with|not|no|at|by|as|be|are|was|from|per|one|two|three)$/.test(w))) {
    return false; /* a class list */
  }
  return true;
}

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) {
      continue;
    }
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p, out);
    } else if (e.name.endsWith('.js') && !e.name.endsWith('selftest.js')) {
      out.push(p);
    }
  }
  return out;
}

const files = (await walk(join(root, 'src'))).sort();
let hits = 0;
let scanned = 0;
for (const f of files) {
  const rel = relative(root, f).replace(/\\/g, '/');
  if (EXCUSED.has(rel)) {
    continue;
  }
  scanned += 1;
  const src = await readFile(f, 'utf8');
  for (const lit of literals(src)) {
    if (!isProse(lit.text) || CONTEXT_OK.test(lit.before)) {
      continue;
    }
    /* A continuation line of a thrown message: the throw is a few lines up
     * and every line between is a string joined with +. */
    const back = src.slice(Math.max(0, src.lastIndexOf('\n', src.indexOf(lit.text) - 1) - 400), src.indexOf(lit.text));
    if (/throw new [A-Za-z]*Error\(\s*(`[^`]*`|'[^']*'|"[^"]*")?\s*(\+\s*(`[^`]*`|'[^']*'|"[^"]*")\s*)*[+`'"\s]*$/.test(back)) {
      continue;
    }
    hits += 1;
    if (hits <= 60) {
      console.log(`  ${rel}:${lit.line}  ${JSON.stringify(lit.text).slice(0, 100)}`);
    }
  }
}
console.log(`copy lint: ${scanned} file(s) scanned, ${EXCUSED.size} excused`);
if (hits) {
  console.log(`FAIL, ${hits} sentence(s) outside src/strings`);
  process.exit(1);
}
console.log('PASS, every sentence the pilot reads is in the string table');
