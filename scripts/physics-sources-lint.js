/*
 * physics-sources-lint.js: every physics constant in the C plant carries
 * its source (owner rule, CLAUDE.md: physics follows reality, and the
 * sources are cited). A constant is cited when its own line, or the
 * comment block directly above it, names a docs/*.md, a URL, a
 * scripts/*.js or an npm run check, or marks it FITTED: with its reason.
 * The constants are the #defines and struct fields (scan), and every
 * array and table element those leave (scanElements), whose list's
 * opening line, or the comment block directly above it, also cites them;
 * and the numbers in the JavaScript configs and derive scripts' module
 * level data (scanJs), which a `source` property beside them also cites.
 *
 * Today's uncited constants are listed in scripts/physics-sources-baseline.txt,
 * keyed by file, symbol and value text, never by line number, so a lane
 * that moves lines is unaffected. The lint fails when:
 *   - an uncited constant is not in the baseline: a new constant, or a
 *     changed value (a changed value is a new key), needs a source;
 *   - a baseline entry no longer exists in the tree: delete it, so the
 *     list only shrinks;
 *   - the baseline holds more C scalar entries than PINNED_COUNT, C
 *     element entries than PINNED_ELEMENT_COUNT or JavaScript entries
 *     than PINNED_JS_COUNT. Lowering a pin is the only edit that should
 *     ever touch them.
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

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILES = [
  'src/native/plant_wing.c',
  'src/native/plant.c',
  'src/native/sim.c',
  'src/native/crash.c',
  'src/native/crash_parts.h',
];
export const PINNED_COUNT = 2743;
/* The array and table elements (scanElements) are pinned on their own, so
 * neither count can grow by the other shrinking. water.c holds the sea's
 * spectrum tables; its #defines are not scanned. */
export const ELEMENT_FILES = [...FILES, 'src/native/water.c'];
export const PINNED_ELEMENT_COUNT = 2654;
/* The JavaScript the plant's numbers come from: the hand written configs
 * that hand the plant physics (each derive script's inputs, every
 * scripts/*-derive.js, read at run time so a new one is covered). Not the
 * files a script writes (power-estimates.js, motor-estimates.js,
 * prop-estimates.js, hulls.js, surfaces-tiers.js, surfaces-stats.js):
 * their numbers are outputs, sourced by their generator's inputs here. */
export const JS_FILES = [
  'configs/airframes.js',
  'configs/power.js',
  'configs/motors.js',
  'configs/tuning.js',
  'configs/surfaces.js',
  'configs/combat.js',
  'configs/hangar-parts.js',
  'configs/hullfit.js',
];
export const PINNED_JS_COUNT = 5092;
export const PINS = { scalar: PINNED_COUNT, element: PINNED_ELEMENT_COUNT, js: PINNED_JS_COUNT };
const PIN_NAMES = { scalar: 'PINNED_COUNT', element: 'PINNED_ELEMENT_COUNT', js: 'PINNED_JS_COUNT' };
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
    out.push({ key, line: i, cited: cite.test(s) || cite.test(blockAbove(lines, i)) });
  }
  return out;
}

/* Each line's code with comments and string contents blanked to spaces,
 * so braces, commas and digits in them are never read as code. */
function codeOnly(lines) {
  let inBlock = false;
  return lines.map((s) => {
    let out = '';
    for (let k = 0; k < s.length; k++) {
      if (inBlock) {
        if (s.startsWith('*/', k)) { inBlock = false; out += '  '; k++; } else out += ' ';
      } else if (s.startsWith('/*', k)) { inBlock = true; out += '  '; k++; }
      else if (s.startsWith('//', k)) { out += ' '.repeat(s.length - k); break; }
      else if (s[k] === '"') {
        const end = s.indexOf('"', k + 1);
        const stop = end < 0 ? s.length : end;
        out += '"' + ' '.repeat(stop - k - 1) + (end < 0 ? '' : '"');
        k = stop;
      } else out += s[k];
    }
    return out;
  });
}

const INIT_OPEN = /^(?:static )?const \w+ (\w+)(?:\[[^\]]*\])* = \{/;
const DESIGNATED = /^(\.\w+|\[[^\]]*\])\s*=\s*([^]*)$/;
const FLOATING = /(?<![\w.])(?:\d+\.\d*|\.\d+|\d+(?=[eE]))(?:[eE][-+]?\d+)?(?![\w.])/;

/* Every array and table element in one file's text that scan() has not
 * keyed already: the rows of a bare array (LIPO_OCV, GE_S, GUST_*), the
 * positional rows of a table (SURF, THERMALS), a field whose value spans
 * rows (.axial_curve = {), and the fields of a parts row that opens on its
 * own line. An element is one comma separated value holding a floating
 * literal (a point or an exponent): the plant's quantities are doubles
 * written so, and an integer there is an index or a count (a part's
 * parent, motor, wheel or blade count), not a measurement;
 * its key is the brace path down to it and its value text, no index, so
 * an inserted element adds one key and moves none. A path step is the
 * designator (.field or [NAME]) or [] for a positional one, so every
 * element key's symbol carries a [ and no scalar key's does.
 *
 * Cited: any line the element is on, the comment block directly above its
 * first line, or the line that opens the brace list holding it and the
 * comment block directly above that, so one source over a table covers
 * its rows. Only the innermost list: a struct's header covers no field's
 * rows, as it covers no scalar field. */
export function scanElements(file, text, keyed, cite = CITE) {
  const lines = text.split('\n');
  const code = codeOnly(lines);
  const out = [];
  for (let i = 0; i < code.length; i++) {
    const open = INIT_OPEN.exec(code[i]);
    if (!open) continue;
    const frames = [];
    let el = null;
    const covers = (frame) => cite.test(lines[frame.open]) || cite.test(blockAbove(lines, frame.open));
    const finish = () => {
      const frame = frames[frames.length - 1];
      const e = el;
      el = null;
      if (!e || e.nested || !FLOATING.test(e.text) || keyed.has(e.first)) return;
      const d = DESIGNATED.exec(e.text.trim());
      const path = frame.path + (d ? d[1] : '[]');
      const value = (d ? d[2] : e.text).trim().replace(/\s+/g, ' ');
      let cited = cite.test(blockAbove(lines, e.first)) || covers(frame);
      for (let j = e.first; j <= e.last; j++) cited ||= cite.test(lines[j]);
      if (!path.includes('[')) throw new Error(`${file}:${e.first + 1}: element ${path} has no [ step, so its key would count as a scalar`);
      out.push({ key: `${file} ${path} = ${value}`, line: e.first, cited });
    };
    let j = i;
    let k = code[i].indexOf('{', open[0].length - 1);
    for (; j < code.length; j++, k = 0) {
      const s = code[j];
      for (; k < s.length; k++) {
        const ch = s[k];
        if (el && el.paren > 0) {
          el.text += ch;
          el.last = j;
          if (ch === '(') el.paren++;
          else if (ch === ')') el.paren--;
          continue;
        }
        if (ch === '{') {
          if (!frames.length) {
            frames.push({ path: open[1], open: j });
            continue;
          }
          const d = el ? /^\s*(\.\w+|\[[^\]]*\])\s*=\s*$/.exec(el.text) : null;
          if (el) el.nested = true;
          const parent = frames[frames.length - 1];
          frames.push({ path: parent.path + (d ? d[1] : '[]'), open: j, held: el });
          el = null;
        } else if (ch === '}') {
          finish();
          el = frames.pop().held ?? null;
          if (!frames.length) break;
        } else if (ch === ',') {
          finish();
        } else {
          if (!el) {
            if (/\s/.test(ch)) continue;
            el = { text: '', first: j, last: j, nested: false, paren: 0 };
          }
          el.text += ch;
          el.last = j;
          if (ch === '(') el.paren++;
        }
      }
      if (!frames.length) break;
    }
    i = j;
  }
  return out;
}

/* The failures for a tree's constants against a baseline (a list of keys,
 * duplicates allowed: two identical uncited rows are two entries). */
/* A JavaScript source as tokens, each { t, at, line, col }: comments
 * dropped, a string, template or regex literal one token. A / opens a
 * regex where an operand cannot end before it. */
const JS_TOKEN = /\s+|\/\/[^\n]*|\/\*[^]*?\*\/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\])*`|0[xXbBoO][\da-fA-F_]+|(?:\d[\d_]*\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|=>|\.\.\.|[{}[\](),;:]|[^\s\w]/y;
const REGEX = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n])+\/[a-z]*/y;
function jsTokens(text) {
  const out = [];
  let line = 0;
  let lineAt = 0;
  for (let at = 0; at < text.length;) {
    const prev = out[out.length - 1];
    if (text[at] === '/' && text[at + 1] !== '/' && text[at + 1] !== '*' && !(prev && /^[\w$)\]'"`.]/.test(prev.t.slice(-1)))) {
      REGEX.lastIndex = at;
      const r = REGEX.exec(text);
      if (r) { out.push({ t: r[0], at, line, col: at - lineAt }); at += r[0].length; continue; }
    }
    JS_TOKEN.lastIndex = at;
    const m = JS_TOKEN.exec(text);
    if (!m) throw new Error(`cannot read the JavaScript at line ${line + 1}`);
    if (!/^(\s|\/\/|\/\*)/.test(m[0])) out.push({ t: m[0], at, line, col: at - lineAt });
    for (let k = m[0].indexOf('\n'); k >= 0; k = m[0].indexOf('\n', k + 1)) { line++; lineAt = at + k + 1; }
    at += m[0].length;
  }
  return out;
}

const OPEN = { '{': '}', '[': ']', '(': ')' };
const PURE = /^(?:[-+*/%]|\*\*|Math\.PI|\d[\d_]*\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|0[xXbBoO][\da-fA-F_]+)$/;
const KEY = /^(?:[A-Za-z_$][\w$]*|'[^']*'|"[^"]*"|\d+)$/;
/* The SIM_* tables mirror src/native/sim_abi.h's layout, offsets and
 * sizes, not quantities. */
const ABI = /^SIM_[A-Z\d_]*$/;
const SOURCE_KEY = /^\.sources?$/;

/* Every constant in a JavaScript physics source: each value of a module
 * level declaration (export const, const, let) that is a number, or an
 * arithmetic of numbers only, and each such value at any depth in the
 * objects, arrays and call arguments it is built of. A value that names
 * anything else is derived from it, not a constant, and so is a call's
 * result: a call's arguments count only where the call is a row of an
 * object or array literal (a helper building data, lipo(...) in a list of
 * packs), not where it computes a declaration's value. Keyed by file, the
 * declared name and the path down (.key, [] for a position, name() for a
 * call's arguments) and the value text, no index.
 *
 * Cited as in the C: any line the value is on, the comment block directly
 * above its first line, or the line opening the brace list holding it and
 * the block above that; and, the config files' own form, a `source` or
 * `sources` property in the object holding it. A declaration's own
 * statement is not such a list: `const a = 1.4, b = 0.28` cites each on
 * its line. Known limit: a number inside a function body (a formula's
 * coefficient) is not read. */
export function scanJs(file, text, cite = CITE, sourceKey = SOURCE_KEY) {
  const lines = text.split('\n');
  const tokens = jsTokens(text);
  const out = [];
  const startsDecl = (k) => tokens[k].col === 0 && /^(const|let|var)$/.test(tokens[k].t)
    || tokens[k].col === 0 && tokens[k].t === 'export' && /^(const|let|var)$/.test(tokens[k + 1]?.t);
  const lineCites = (i) => cite.test(lines[i]) || cite.test(blockAbove(lines, i));
  for (let k = 0; k < tokens.length; k++) {
    if (!startsDecl(k)) continue;
    k += tokens[k].t === 'export' ? 2 : 1;
    const frames = [{ path: '', open: -1, leaves: [], source: false }];
    let el = [];
    const step = (toks, frame) => {
      if (frame.open < 0 && toks.length >= 2 && toks[1].t === '=') return [toks[0].t, toks.slice(2)];
      if (toks.length >= 2 && toks[1].t === ':' && KEY.test(toks[0].t)) return [`.${toks[0].t.replace(/^['"]|['"]$/g, '')}`, toks.slice(2)];
      return [frame.open < 0 ? null : '[]', toks];
    };
    const finish = () => {
      const frame = frames[frames.length - 1];
      const toks = el;
      el = [];
      if (!toks.length) return;
      const [name, value] = step(toks, frame);
      if (sourceKey.test(name ?? '')) frame.source = true;
      if (toks.nested || frame.abi || frame.formula || name === null || ABI.test(name) || !value.length || !value.every((t) => PURE.test(t.t)) || !value.some((t) => /\d/.test(t.t))) return;
      const first = toks[0].line;
      const last = value[value.length - 1].line;
      const v = text.slice(value[0].at, value[value.length - 1].at + value[value.length - 1].t.length).replace(/\s+/g, ' ');
      let cited = frame.open >= 0 && lineCites(frame.open);
      for (let i = first; i <= last; i++) cited ||= cite.test(lines[i]);
      frame.leaves.push({ key: `${file} ${frame.path}${name} = ${v}`, line: first, cited: cited || lineCites(first) });
    };
    for (; k < tokens.length; k++) {
      const tok = tokens[k];
      const frame = frames[frames.length - 1];
      if (frames.length === 1 && (tok.t === ';' || (el.length && tok.line > el[el.length - 1].line && tok.col === 0))) {
        finish();
        if (tok.t !== ';') k--;
        break;
      }
      if (OPEN[tok.t]) {
        const [name, value] = step(el, frame);
        const callee = tok.t === '(' && value.length && /^[A-Za-z_$]/.test(value[value.length - 1].t) ? `.${value[value.length - 1].t.replace(/^.*\./, '')}()` : '';
        el.nested = true;
        const abi = frame.abi || ABI.test(name ?? '');
        const formula = frame.formula || (callee !== '' && !frame.literal);
        frames.push({ path: frame.path + (name ?? '') + (callee || (tok.t === '(' ? '()' : '')), open: tok.line, leaves: [], source: false, abi, formula, literal: tok.t !== '(', close: OPEN[tok.t], held: el });
        el = [];
      } else if (frames.length > 1 && tok.t === frame.close) {
        finish();
        const done = frames.pop();
        for (const leaf of done.leaves) out.push({ ...leaf, cited: leaf.cited || done.source });
        el = done.held;
        el.push(tok);
      } else if (tok.t === ',') {
        finish();
      } else {
        el.push(tok);
      }
    }
    for (const leaf of frames[0].leaves) out.push(leaf);
  }
  return out;
}

/* Which pin a key counts against: a JavaScript file's, else a C element's
 * (its symbol carries a [, scanElements) or a C scalar's (never does). */
export function kindOf(key) {
  const [file, symbol] = key.split(' ');
  if (file.endsWith('.js')) return 'js';
  return symbol.includes('[') ? 'element' : 'scalar';
}

export function counts(baseline) {
  const n = Object.fromEntries(Object.keys(PINS).map((k) => [k, 0]));
  for (const k of baseline) n[kindOf(k)]++;
  return n;
}

export function check(constants, baseline, pins = PINS) {
  const errors = [];
  for (const [kind, n] of Object.entries(counts(baseline))) {
    if (n > pins[kind]) errors.push(`baseline holds ${n} ${kind} entries, pinned at ${pins[kind]} (${PIN_NAMES[kind]}); the list only shrinks`);
  }
  const left = new Map();
  for (const k of baseline) left.set(k, (left.get(k) ?? 0) + 1);
  const uncited = new Set(constants.filter((c) => !c.cited).map((c) => c.key));
  for (const c of constants) {
    if (c.cited) continue;
    const n = left.get(c.key) ?? 0;
    if (n > 0) { left.set(c.key, n - 1); continue; }
    errors.push(`uncited: ${c.key} (cite a docs/*.md, URL, scripts/*.js, npm run check or FITTED: reason on its line or in the comment directly above; for an array or table element, also at the line opening its list or directly above that; in a JavaScript object, also a source property beside it)`);
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

/* One file's scalars and elements; an element on a line scan() keyed is
 * that scalar's, not counted twice. */
export function scanFile(file, text, cite = CITE) {
  const scalars = FILES.includes(file) ? scan(file, text, cite) : [];
  return [...scalars, ...scanElements(file, text, new Set(scalars.map((c) => c.line)), cite)];
}

export function jsFiles(root) {
  const derive = readdirSync(join(root, 'scripts')).filter((f) => f.endsWith('-derive.js')).sort().map((f) => `scripts/${f}`);
  return [...JS_FILES, ...derive];
}

export function scanTree(root, cite = CITE) {
  const read = (f) => readFileSync(join(root, f), 'utf8');
  return [
    ...ELEMENT_FILES.flatMap((f) => scanFile(f, read(f), cite)),
    ...jsFiles(root).flatMap((f) => scanJs(f, read(f), cite)),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--root');
  const root = at > 0 ? process.argv[at + 1] : fileURLToPath(new URL('..', import.meta.url));
  const constants = scanTree(root);
  const baseline = readBaseline(root);
  if (process.argv.includes('--prune')) {
    const file = join(root, BASELINE);
    const kept = prune(constants, baseline);
    const left = new Map();
    for (const k of kept) left.set(k, (left.get(k) ?? 0) + 1);
    /* Comment lines stay where they are; each kept key keeps its place. */
    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => {
      if (!l || l.startsWith('#')) return l !== '';
      const n = left.get(l) ?? 0;
      left.set(l, n - 1);
      return n > 0;
    });
    writeFileSync(file, lines.join('\n') + '\n');
    const lower = Object.entries(counts(kept)).map(([kind, n]) => `${PIN_NAMES[kind]} to ${n}`).join(', ');
    console.log(`physics-sources-lint: pruned ${baseline.length - kept.length} stale entries, ${kept.length} left; lower ${lower}`);
    process.exit(0);
  }
  const errors = check(constants, baseline);
  const uncited = constants.filter((c) => !c.cited).length;
  const have = counts(baseline);
  const pins = Object.entries(have).map(([kind, n]) => `${kind} ${n}/${PINS[kind]}`).join(', ');
  if (errors.length) {
    for (const e of errors) console.error(`physics-sources-lint: ${e}`);
    console.error(`physics-sources-lint: FAIL, ${errors.length} problem(s); ${constants.length} constants, ${uncited} uncited, baseline ${pins}`);
    process.exit(1);
  }
  for (const [kind, n] of Object.entries(have)) {
    if (n < PINS[kind]) console.log(`physics-sources-lint: ${n} ${kind} entries is below the pin ${PINS[kind]}, lower ${PIN_NAMES[kind]}`);
  }
  console.log(`physics-sources-lint: PASS, ${constants.length} constants, ${constants.length - uncited} cited, ${uncited} uncited all in the baseline (${pins})`);
}
