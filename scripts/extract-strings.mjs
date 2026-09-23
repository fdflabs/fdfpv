/*
 * extract-strings.mjs: move prose literals into the string table.
 *
 * The codemod that built src/strings/en.js, kept for the next time copy is
 * added in bulk. It parses with acorn, which this repository does not
 * depend on: run it with acorn installed beside it and nothing saved,
 *
 *   npm install --no-save acorn@8 acorn-walk@8
 *   node scripts/extract-strings.mjs --root=. --broad --singles src/ui/ui.js
 *   node scripts/extract-strings.mjs --root=. --broad --apply src/ui/ui.js
 *
 * Dry runs print what would change; --apply rewrites the files and merges
 * the table. Review the diff and run lint:copy and strings:selftest after.
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

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const APPLY = args.includes('--apply');
const BROAD = args.includes('--broad');
/* --singles: one capitalised word in a copy-like position (a ternary branch,
 * a data table's array, a value/label property, a button or chip label).
 * Key codes and brands stay. */
const SINGLES = args.includes('--singles');
const KEYCODES = new Set(['Enter', 'Esc', 'Escape', 'Tab', 'Space', 'Shift', 'Control', 'Ctrl', 'Alt', 'Meta', 'Backspace', 'Delete', 'Home', 'End', 'Insert', 'Pause', 'Up', 'Down', 'Left', 'Right', 'Auto', 'None', 'Betaflight', 'Harness', 'Chrome', 'Firefox', 'Safari', 'Edge', 'Windows', 'Linux', 'Android', 'Mac', 'Gamepad', 'Xbox', 'Playstation', 'Unknown', 'Untitled']);
const LIST = args.includes('--list');
const ROOT = resolve(opt('root', '.'));
const TABLE = resolve(ROOT, opt('table', 'src/strings/en.js'));
const STRINGS = opt('strings', 'src/strings/index.js');
const files = args.filter((a) => !a.startsWith('--'));
const PROPS = new Set(['label', 'note', 'title', 'detail', 'placeholder', 'rules', 'empty', 'confirmLabel', 'text', 'hint', 'lede', 'sub', 'caption', 'summary', 'description']);
const ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt']);
/* Brand and marks that stay as they are in every language. */
const NEVER = new Set(['FDFPV', 'FD', 'FPV', 'Betaflight', 'MultiGP', 'RaceGOW']);
const MACHINE = /^[a-z0-9\-_./#?=&:%,+*()\[\]{}|<>!@$^~`'";\s]*$/;

function isProse(text) {
  if (typeof text !== 'string') return false;
  const s = text.trim();
  if (NEVER.has(s)) return false;
  if (s.length < 2) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (MACHINE.test(s) && !/\s/.test(s)) return false; /* class names, ids, keys */
  if (/^[A-Z][a-z]*$/.test(s) && s.length <= 3) return false;
  if (/^(https?:|data:|\/|\.\/|\.\.\/|#|\.[\w/])/.test(s)) return false;
  if (/^[A-Za-z]+(\.[A-Za-z0-9_]+)+$/.test(s)) return false; /* dotted keys */
  if (/^(Key[A-Z]|Arrow|Digit|Numpad|Shift|Control|Alt|Meta|Enter|Escape|Space|Tab|Backspace|Delete|Home|End|Page)/.test(s) && !/\s/.test(s)) return false;
  return true;
}

function slug(text) {
  return text.toLowerCase().replace(/\{[a-z_0-9]+\}/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 6).join('_') || 'text';
}

let table = {};
try { const mod = await import(`${TABLE}?${Date.now()}`); table = { ...mod.default }; } catch (e) { table = {}; }
const byText = new Map(Object.entries(table).map(([k, v]) => [v, k]));

function keyFor(text, fileKey) {
  if (byText.has(text)) return byText.get(text);
  let base = `${fileKey}.${slug(text)}`;
  let key = base;
  let n = 2;
  while (key in table) { key = `${base}_${n}`; n += 1; }
  table[key] = text;
  byText.set(text, key);
  return key;
}

const report = { files: 0, literals: 0, templates: 0, skippedTemplates: 0, samples: [] };

for (const f of files) {
  const path = resolve(ROOT, f);
  const src = await readFile(path, 'utf8');
  const fileKey = basename(f, '.js').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true });
  const edits = []; /* { start, end, code } */
  let needsImport = false;

  function templateToCall(node) {
    /* `Fly ${track.name}` -> t(key, { name: track.name }) */
    const vars = [];
    let text = '';
    for (let i = 0; i < node.quasis.length; i += 1) {
      text += node.quasis[i].value.cooked;
      if (i < node.expressions.length) {
        const ex = node.expressions[i];
        let name = null;
        if (ex.type === 'Identifier') name = ex.name;
        else if (ex.type === 'MemberExpression' && ex.property.type === 'Identifier' && !ex.computed) name = ex.property.name;
        else if (ex.type === 'CallExpression' && ex.callee.type === 'MemberExpression' && ex.callee.property.name === 'toFixed' && ex.callee.object.type === 'Identifier') name = ex.callee.object.name;
        else if (ex.type === 'CallExpression' && ex.callee.type === 'Identifier') name = ex.callee.name;
        /* Anything else is hoisted into a numbered var: the sentence keeps its
         * shape in the table and the expression stays in the code. */
        if (!name) name = `v${i + 1}`;
        let v = name;
        let k = 2;
        while (vars.some((x) => x.name === v)) { v = `${name}${k}`; k += 1; }
        vars.push({ name: v, code: src.slice(ex.start, ex.end) });
        text += `{${v}}`;
      }
    }
    if (!isProse(text.replace(/\{[a-z0-9_]+\}/gi, 'x'))) return null;
    return { text, vars };
  }

  function replaceNode(node, why) {
    if (seen.has(node.start) && why !== 'broad') return false;
    seen.add(node.start);
    if (node.type === 'Literal' && typeof node.value === 'string') {
      if (!isProse(node.value)) return false;
      const key = keyFor(node.value, fileKey);
      edits.push({ start: node.start, end: node.end, code: `str('${key}')` });
      report.literals += 1;
      if (report.samples.length < 12) report.samples.push(`${f}:${node.loc.start.line} ${why} ${JSON.stringify(node.value).slice(0, 70)} -> ${key}`);
      return true;
    }
    if (node.type === 'TemplateLiteral') {
      const conv = templateToCall(node);
      if (!conv) { if (node.expressions.length && /[A-Za-z]{3,}\s/.test(node.quasis.map((q) => q.value.cooked).join(''))) { report.skippedTemplates += 1; if (report.samples.length < 24) report.samples.push(`${f}:${node.loc.start.line} SKIP template ${src.slice(node.start, Math.min(node.end, node.start + 80))}`); } return false; }
      const key = keyFor(conv.text, fileKey);
      const varsCode = conv.vars.length ? `, { ${conv.vars.map((v) => (v.code === v.name ? v.name : `${v.name}: ${v.code}`)).join(', ')} }` : '';
      edits.push({ start: node.start, end: node.end, code: `str('${key}'${varsCode})` });
      report.templates += 1;
      return true;
    }
    return false;
  }

  /* Broad pass: every string literal or template with at least one space and
   * letters, unless its context says data: comparisons, switch tests, object
   * keys, imports, console and Error arguments, style and class assignments,
   * SVG attributes, storage keys, regex sources. Runs over ancestors. */
  const CSS_ATTR = new Set(['d', 'viewBox', 'points', 'fill', 'stroke', 'transform', 'style', 'class', 'href', 'src', 'id', 'name', 'type', 'for', 'rel', 'target', 'download', 'accept', 'autocomplete', 'inputmode', 'role', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'points', 'preserveAspectRatio', 'xmlns', 'font-family', 'font', 'align', 'valign', 'lang', 'dir']);
  const seen = new Set();
  function broadSkip(ancestors) {
    const node = ancestors[ancestors.length - 1];
    const parent = ancestors[ancestors.length - 2];
    if (!parent) return true;
    if (parent.type === 'BinaryExpression' && parent.operator !== '+') return true;
    if (parent.type === 'SwitchCase' || parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration') return true;
    if (parent.type === 'Property' && parent.key === node) return true;
    if (parent.type === 'MemberExpression' && parent.computed && parent.property === node) return true;
    if (parent.type === 'NewExpression' && parent.callee.type === 'Identifier' && /Error$|RegExp|URL|Date|Function/.test(parent.callee.name)) return true;
    if (parent.type === 'ThrowStatement') return true;
    if (parent.type === 'CallExpression') {
      const c = parent.callee;
      if (c.type === 'MemberExpression' && !c.computed) {
        const obj = c.object;
        const m = c.property.name;
        if (obj.type === 'Identifier' && (obj.name === 'console' || obj.name === 'localStorage' || obj.name === 'sessionStorage')) return true;
        if (/^(setProperty|setItem|getItem|removeItem|matchMedia|querySelector|querySelectorAll|getElementById|closest|matches|createElementNS|createElement|addEventListener|removeEventListener|includes|startsWith|endsWith|indexOf|split|replace|test|match|padStart|padEnd|toggle|add|remove|contains|has|get|set|delete|open|postMessage|warn|error|info|log|debug|assert|fetch|importKey|exportKey|digest|sign|verify|getContext|createLinearGradient|measureText)$/.test(m)) return true;
        if (obj.type === 'MemberExpression' && obj.property && obj.property.name === 'style') return true;
        if (obj.type === 'Identifier' && /^(Math|JSON|Object|Array|Number|String|Symbol|Reflect|Promise|crypto|performance|history|location|navigator|URL)$/.test(obj.name)) return true;
        if (m === 'setAttribute') {
          const a = parent.arguments[0];
          if (a && a.type === 'Literal' && (CSS_ATTR.has(a.value) || String(a.value).startsWith('data-') || String(a.value).startsWith('aria-') && a.value !== 'aria-label')) return true;
          if (parent.arguments[0] === node) return true;
        }
        if (m === 'fillText' || m === 'strokeText') return false;
      }
      if (c.type === 'Identifier' && /^(check|assert|fail|must|ok|expect|describe|it|log|debug|trace|deprecate|fetchJson|readJson|join|resolve|require|import|hash|sha256|encode|decode|atob|btoa|escape|unescape|encodeURIComponent|decodeURIComponent|classNames|cls|css|style|track|count|event|sendEvent|stat|stats|metric|measure)$/.test(c.name)) return true;
      if (c.type === 'Identifier' && (c.name === 'Error' || c.name === 'RegExp')) return true;
    }
    if (parent.type === 'AssignmentExpression') {
      const l = parent.left;
      if (l.type === 'MemberExpression' && !l.computed) {
        const m = l.property.name;
        if (/^(className|id|href|src|type|name|cssText|transform|background|font|color|fill|stroke|filter|transition|animation|display|gridTemplateColumns|gridTemplateRows|boxShadow|border|margin|padding|width|height|top|left|right|bottom|content|value|key|data|role|lang|dir|autocomplete|inputMode|accept|download|rel|target|d)$/.test(m)) return true;
        if (l.object.type === 'MemberExpression' && l.object.property && l.object.property.name === 'style') return true;
        if (l.object.type === 'MemberExpression' && l.object.property && l.object.property.name === 'dataset') return true;
      }
    }
    if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier' && /(RE|REGEX|KEY|URL|PATH|ID|CLASS|SELECTOR|CSS|STYLE|FONT|COLOR|PREFIX|MAGIC|MIME|EXT|GRID|GLYPH|SVG|D)$/.test(parent.id.name)) return true;
    if (parent.type === 'TaggedTemplateExpression') return true;
    for (const a of ancestors) {
      if (a.type === 'CallExpression' && a.callee.type === 'MemberExpression' && a.callee.property.name === 'setProperty') return true;
      if (a.type === 'AssignmentExpression' && a.left.type === 'MemberExpression' && a.left.object.type === 'MemberExpression' && a.left.object.property && a.left.object.property.name === 'style') return true;
    }
    return false;
  }
  function isBroadProse(text) {
    const s = String(text);
    if (!/\s/.test(s.trim())) return false;
    if (!/[A-Za-z]{2,}/.test(s)) return false;
    if (NEVER.has(s.trim())) return false;
    if (/^[MmLlHhVvCcSsQqTtAaZz0-9\s.,\-e]+$/.test(s)) return false; /* svg path */
    if (/(\d(px|em|rem|vh|vw|%|deg|ms|s)\b|rgba?\(|hsla?\(|var\(--|calc\(|translate|scale\(|url\(|!important|inset\b)/.test(s)) return false; /* css */
    if (/^[a-z0-9-]+( [a-z0-9-]+)+$/.test(s) && !s.split(' ').some((w) => /^(the|a|an|and|or|to|of|in|on|is|it|you|your|this|that|for|with|not|no|at|by|as|be|are|was|from|per|one|two|three)$/.test(w))) return false; /* class list */
    if (/^\s*[<{[]/.test(s)) return false; /* html or json */
    if (/^[A-Z_0-9]+(\s+[A-Z_0-9]+)+$/.test(s) && s.length < 12) return false; /* shouting constants */
    return true;
  }
  if (BROAD) {
    walk.fullAncestor(ast, (node, state, ancestors) => {
      if (node.type !== 'Literal' && node.type !== 'TemplateLiteral') return;
      if (node.type === 'Literal' && typeof node.value !== 'string') return;
      if (seen.has(node.start)) return;
      if (broadSkip(ancestors)) return;
      const text = node.type === 'Literal' ? node.value : node.quasis.map((q) => q.value.cooked).join('x');
      if (!isBroadProse(text)) return;
      seen.add(node.start);
      if (LIST) { console.log(`${f}:${node.loc.start.line} ${node.type === 'Literal' ? JSON.stringify(node.value).slice(0, 90) : 'TPL ' + src.slice(node.start, Math.min(node.end, node.start + 90))}`); return; }
      if (replaceNode(node, 'broad')) needsImport = true;
    });
  }

  if (SINGLES) {
    walk.fullAncestor(ast, (node, state, ancestors) => {
      if (node.type !== 'Literal' || typeof node.value !== 'string') return;
      const v = node.value;
      if (seen.has(node.start) || !/^[A-Z][a-z]{2,}( [a-z]+)?$/.test(v) || KEYCODES.has(v) || NEVER.has(v)) return;
      const p = ancestors[ancestors.length - 2];
      const gp = ancestors[ancestors.length - 3];
      let ok = false;
      if (p.type === 'ConditionalExpression' && p.test !== node) ok = true;
      else if (p.type === 'ArrayExpression' && gp && gp.type === 'Property') ok = true;
      else if (p.type === 'Property' && p.value === node && ['value', 'label', 'tag', 'using', 'note', 'title', 'text', 'yes', 'no', 'off', 'on'].includes(p.key.name || p.key.value)) ok = true;
      else if (p.type === 'CallExpression' && p.callee.type === 'Identifier' && ['btn', 'choice', 'text', 'stepper', 'setBanner', 'recover', 'el', 'stat', 'toast', 'toggle', 'field'].includes(p.callee.name) && (p.callee.name !== 'el' || p.arguments[2] === node)) ok = true;
      else if (p.type === 'LogicalExpression' && p.operator === '||' && p.right === node) ok = true;
      else if (p.type === 'AssignmentExpression' && p.left.type === 'MemberExpression' && p.left.property.name === 'textContent') ok = true;
      else if (p.type === 'VariableDeclarator' && /^(value|label|text|title|name|word)$/.test(p.id.name)) ok = true;
      if (!ok) return;
      if (LIST) { console.log(`${f}:${node.loc.start.line} ${JSON.stringify(v)} (${p.type})`); seen.add(node.start); return; }
      if (replaceNode(node, 'single')) needsImport = true;
    });
  }

  walk.simple(ast, {
    Property(node) {
      if (seen.has(node.value.start)) return;
      if (node.computed || node.shorthand) return;
      const name = node.key.type === 'Identifier' ? node.key.name : (node.key.type === 'Literal' ? node.key.value : null);
      if (!PROPS.has(name)) return;
      if (replaceNode(node.value, `${name}:`)) needsImport = true;
    },
    CallExpression(node) {
      const c = node.callee;
      if (c.type === 'Identifier' && (c.name === 'el' || c.name === 'btn' || c.name === 'toast' || c.name === 'note')) {
        const idx = c.name === 'el' ? 2 : (c.name === 'btn' ? 1 : 0);
        const arg = node.arguments[idx];
        if (arg && replaceNode(arg, `${c.name}()`)) needsImport = true;
      } else if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'setAttribute') {
        const [a, b] = node.arguments;
        if (a && a.type === 'Literal' && ATTRS.has(a.value) && b && replaceNode(b, `setAttribute(${a.value})`)) needsImport = true;
      } else if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'createTextNode') {
        const [a] = node.arguments;
        if (a && replaceNode(a, 'createTextNode()')) needsImport = true;
      }
    },
    AssignmentExpression(node) {
      const l = node.left;
      if (l.type === 'MemberExpression' && !l.computed && (l.property.name === 'textContent' || l.property.name === 'title' || l.property.name === 'placeholder' || l.property.name === 'innerText')) {
        if (replaceNode(node.right, `.${l.property.name} =`)) needsImport = true;
      }
    },
  });

  report.files += 1;
  if (!APPLY || !edits.length) continue;
  /* An edit inside another edit's range (a template inside a template's
   * expression) is dropped: the outer replacement already carries it. */
  const kept = edits.filter((e) => !edits.some((o) => o !== e && o.start <= e.start && o.end >= e.end && (o.start < e.start || o.end > e.end)));
  kept.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of kept) out = out.slice(0, e.start) + e.code + out.slice(e.end);
  if (needsImport && !/from '[./]*strings\/index\.js'/.test(out)) {
    const rel = relative(resolve(ROOT, f, '..'), resolve(ROOT, STRINGS)).replace(/\\/g, '/');
    const importLine = `import { str } from '${rel.startsWith('.') ? rel : `./${rel}`}';\n`;
    const m = out.match(/^import [^\n]*\n(?![\s\S]*^import )/m);
    const lastImport = [...out.matchAll(/^import [^\n]*;\n/gm)].pop();
    if (lastImport) out = out.slice(0, lastImport.index + lastImport[0].length) + importLine + out.slice(lastImport.index + lastImport[0].length);
    else out = importLine + out;
  }
  await writeFile(path, out);
}

if (APPLY) {
  const keys = Object.keys(table).sort();
  const body = keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(table[k])},`).join('\n');
  const head = (await readFile(TABLE, 'utf8').catch(() => '')).split('export default')[0];
  await writeFile(TABLE, `${head}export default {\n${body}\n};\n`);
}
console.log(JSON.stringify({ files: report.files, literals: report.literals, templates: report.templates, skippedTemplates: report.skippedTemplates, tableSize: Object.keys(table).length }));
for (const s of report.samples) console.log(' ', s);
