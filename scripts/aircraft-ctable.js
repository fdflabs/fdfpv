/*
 * aircraft-ctable.js: the plant's FixedWingParams tables in
 * src/native/plant_wing.c are generated from aircraft/<id>/plant.json
 * (docs/AIRCRAFT-FOLDER.md). Each table is stored line by line: its lead
 * comment, then every line of its initializer as a field (the C
 * expression text, its inline comment and the spaces before it), a field
 * packed onto the line before it, a field whose value spans rows, or a
 * comment block. The text is kept rather than the evaluated double because
 * scripts/physics-sources-lint.js keys every constant by its expression
 * text and cites it by the comment on or above its line, so the citations
 * travel with the fields into the generated C and the lint reads them
 * there, unchanged.
 *
 * npm run aircraft:ctable writes the tables from the folders.
 * npm run aircraft:ctable -- --check fails when a folder and the C differ,
 * either way: the C a folder generates is not the C in the tree, or the
 * folder is not what reading the C gives back. Then a negative control:
 * one expression changed in a folder, and one in the C, must each fail.
 * npm run aircraft:ctable -- --from-c rewrites the folders from the C, for
 * a lane cut before the tables moved that edited plant_wing.c by hand.
 * --root <dir> runs against another checkout.
 *
 * A table no folder owns must be named in HAND, so a new table is never
 * silently left out.
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

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const PLANT = 'src/native/plant_wing.c';
const AIRCRAFT_DIR = 'aircraft';

/* FW_WING1000 is the retired 1000 mm wing, which has no folder. */
export const HAND = ['FW_WING1000'];

const OPEN = /^const FixedWingParams (FW_\w+) = \{$/;

/* One C expression from s at i to the comma that ends it at depth 0. */
function exprEnd(s, i) {
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '{' || c === '(') depth++;
    else if (c === '}' || c === ')') depth--;
    else if (c === ',' && depth === 0) return i;
  }
  return -1;
}

/* The text after a line's code: nothing, or spaces then one comment. */
function tail(rest, where) {
  if (rest === '') return {};
  const m = /^( +)\/\* (.*) \*\/$/.exec(rest);
  if (!m) throw new Error(`${where}: cannot read the end of the line: ${JSON.stringify(rest)}`);
  return m[1].length === 1 ? { comment: m[2] } : { comment: m[2], gap: m[1].length };
}

/* A comment block of lines at an indent: `/* a`, ` * b`, ` * c *\/`, or
 * one line `/* a *\/`. Returns the text lines and the index past it. */
function readComment(lines, i, indent, where) {
  const pad = ' '.repeat(indent);
  const out = [];
  let s = lines[i];
  if (!s.startsWith(`${pad}/* `)) throw new Error(`${where}: not a comment: ${JSON.stringify(s)}`);
  s = s.slice(indent + 3);
  for (;;) {
    if (s.endsWith(' */')) {
      out.push(s.slice(0, -3));
      return { text: out, next: i + 1 };
    }
    out.push(s);
    i++;
    s = lines[i];
    if (s === undefined || !s.startsWith(`${pad} * `)) throw new Error(`${where}: comment does not continue: ${JSON.stringify(s)}`);
    s = s.slice(indent + 3);
  }
}

function writeComment(text, indent) {
  const pad = ' '.repeat(indent);
  return text.map((t, k) => `${pad}${k === 0 ? '/*' : ' *'} ${t}${k === text.length - 1 ? ' */' : ''}`);
}

/* The body lines of one table as entries. */
function readBody(lines, where) {
  const body = [];
  for (let i = 0; i < lines.length;) {
    const s = lines[i];
    if (s.startsWith('  /* ')) {
      const c = readComment(lines, i, 2, `${where} line ${i + 1}`);
      body.push({ note: c.text });
      i = c.next;
      continue;
    }
    const multi = /^ {2}\.(\w+) = \{$/.exec(s);
    if (multi) {
      const rows = [];
      for (i++; i < lines.length && lines[i].startsWith('    '); i++) rows.push(lines[i].slice(4));
      const close = /^ {2}\},(.*)$/.exec(lines[i] ?? '');
      if (!close) throw new Error(`${where}: .${multi[1]} has no closing line`);
      body.push({ field: multi[1], rows, ...tail(close[1], where) });
      i++;
      continue;
    }
    if (!s.startsWith('  .')) throw new Error(`${where}: cannot read line: ${JSON.stringify(s)}`);
    let at = 2;
    let first = true;
    for (;;) {
      const m = /^\.(\w+) = /.exec(s.slice(at));
      if (!m) throw new Error(`${where}: cannot read field at ${JSON.stringify(s.slice(at))}`);
      const start = at + m[0].length;
      const end = exprEnd(s, start);
      if (end < 0) throw new Error(`${where}: .${m[1]} has no closing comma`);
      const entry = { field: m[1], expr: s.slice(start, end) };
      if (!first) entry.packed = true;
      body.push(entry);
      at = end + 1;
      first = false;
      if (s.startsWith(' .', at)) { at++; continue; }
      Object.assign(entry, tail(s.slice(at), where));
      break;
    }
    i++;
  }
  return body;
}

function writeBody(body) {
  const out = [];
  for (const e of body) {
    if (e.note) { out.push(...writeComment(e.note, 2)); continue; }
    const end = e.comment === undefined ? '' : `${' '.repeat(e.gap ?? 1)}/* ${e.comment} */`;
    if (e.rows) {
      out.push(`  .${e.field} = {`, ...e.rows.map((r) => `    ${r}`), `  },${end}`);
      continue;
    }
    const code = `.${e.field} = ${e.expr},`;
    if (e.packed) out[out.length - 1] += ` ${code}${end}`;
    else out.push(`  ${code}${end}`);
  }
  return out;
}

/* Every table in the C: symbol, the lines its lead comment and struct span
 * ([from, to), lead comment first), and the table as data. */
export function readTables(text) {
  const lines = text.split('\n');
  const tables = new Map();
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i]);
    if (!open) continue;
    const symbol = open[1];
    let from = i;
    while (from > 0 && /^(\/\*| \*)/.test(lines[from - 1])) from--;
    let to = i + 1;
    while (to < lines.length && lines[to] !== '};') to++;
    if (to === lines.length) throw new Error(`${symbol}: no closing };`);
    const comment = from < i ? readComment(lines, from, 0, `${symbol} lead comment`) : { text: [], next: i };
    if (comment.next !== i) throw new Error(`${symbol}: the lead comment does not end on the line above the table`);
    if (tables.has(symbol)) throw new Error(`${symbol}: defined twice`);
    tables.set(symbol, { from, to: to + 1, table: { symbol, comment: comment.text, body: readBody(lines.slice(i + 1, to), symbol) } });
  }
  return { lines, tables };
}

export function writeTable(t) {
  return [...writeComment(t.comment, 0), `const FixedWingParams ${t.symbol} = {`, ...writeBody(t.body), '};'];
}

/* plant.json as text: one body entry per line, so a changed value is a
 * one line diff. */
export function serialize(folder) {
  const table = (t) => [
    '    {',
    `      "symbol": ${JSON.stringify(t.symbol)},`,
    `      "comment": ${JSON.stringify(t.comment, null, 2).replace(/\n/g, '\n      ')},`,
    '      "body": [',
    t.body.map((e) => `        ${JSON.stringify(e)}`).join(',\n'),
    '      ]',
    '    }',
  ].join('\n');
  return `{\n  "id": ${JSON.stringify(folder.id)},\n  "tables": [\n${folder.tables.map(table).join(',\n')}\n  ]\n}\n`;
}

/* A folder is a boundary: every entry must be one the C reader gives back
 * exactly, keys and their order included, so a misspelt key or a comment
 * the writer cannot write fails here rather than vanishing from the C. */
function validate(folder, id) {
  const where = `aircraft/${id}/plant.json`;
  if (JSON.stringify(Object.keys(folder)) !== '["id","tables"]' || folder.id !== id || !Array.isArray(folder.tables)) {
    throw new Error(`${where}: wants exactly { "id": "${id}", "tables": [...] }`);
  }
  for (const t of folder.tables) {
    if (JSON.stringify(Object.keys(t)) !== '["symbol","comment","body"]') throw new Error(`${where}: a table wants exactly symbol, comment and body`);
    const lines = writeTable(t);
    const back = readTables(lines.join('\n')).tables.get(t.symbol)?.table;
    if (JSON.stringify(back?.comment) !== JSON.stringify(t.comment)) throw new Error(`${where}: ${t.symbol}'s comment does not read back as written`);
    const n = t.body.findIndex((e, k) => JSON.stringify(e) !== JSON.stringify(back.body[k]));
    if (n >= 0 || back.body.length !== t.body.length) {
      throw new Error(`${where}: ${t.symbol} body entry ${n + 1} does not read back as written: ${JSON.stringify(t.body[n])}`);
    }
  }
}

export function readFolders(root) {
  const dir = join(root, AIRCRAFT_DIR);
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'plant.json')))
    .map((e) => e.name)
    .sort()
    .map((id) => {
      const file = join(dir, id, 'plant.json');
      const text = readFileSync(file, 'utf8');
      const folder = JSON.parse(text);
      validate(folder, id);
      return { id, file, text, folder };
    });
}

/* Which folder owns each table; every table in the C is owned once or is
 * in HAND. */
function owners(folders, tables) {
  const own = new Map();
  for (const { id, folder } of folders) {
    for (const t of folder.tables) {
      if (own.has(t.symbol)) throw new Error(`${t.symbol}: owned by aircraft/${own.get(t.symbol)} and aircraft/${id}`);
      if (!tables.has(t.symbol)) throw new Error(`aircraft/${id}/plant.json: ${t.symbol} is not a table in ${PLANT}`);
      own.set(t.symbol, id);
    }
  }
  for (const symbol of tables.keys()) {
    if (!own.has(symbol) && !HAND.includes(symbol)) throw new Error(`${symbol} in ${PLANT} has no folder and is not in HAND`);
  }
  return own;
}

/* The C with every owned table written from its folder, the rest of the
 * file byte for byte. */
export function generate(cText, folders) {
  const { lines, tables } = readTables(cText);
  owners(folders, tables);
  const spans = folders.flatMap(({ folder }) => folder.tables.map((t) => ({ ...tables.get(t.symbol), out: writeTable(t) })));
  spans.sort((a, b) => b.from - a.from);
  const out = [...lines];
  for (const s of spans) out.splice(s.from, s.to - s.from, ...s.out);
  return out.join('\n');
}

/* Every way a folder and the C disagree, as messages. */
export function check(cText, folders) {
  const errors = [];
  let tables;
  try {
    ({ tables } = readTables(cText));
    owners(folders, tables);
  } catch (e) {
    return [e.message];
  }
  for (const { id, text, folder } of folders) {
    const fromC = { id, tables: folder.tables.map((t) => tables.get(t.symbol).table) };
    for (let k = 0; k < folder.tables.length; k++) {
      const t = folder.tables[k];
      if (isDeepStrictEqual(t, fromC.tables[k])) continue;
      const a = writeTable(t);
      const b = writeTable(fromC.tables[k]);
      const n = a.findIndex((l, j) => l !== b[j]);
      errors.push(`${t.symbol}: aircraft/${id}/plant.json and ${PLANT} differ at table line ${n + 1}:\n  folder: ${a[n]}\n  C:      ${b[n]}`);
    }
    if (serialize(folder) !== text) errors.push(`aircraft/${id}/plant.json is not in the form npm run aircraft:ctable writes; run it`);
  }
  if (errors.length === 0 && generate(cText, folders) !== cText) errors.push(`${PLANT}: the folders generate different text outside the compared tables`);
  return errors;
}

/* The tables read back from the C must write the same lines, or a table
 * the reader misreads would round trip into a folder unnoticed. */
function roundTrip(cText) {
  const { lines, tables } = readTables(cText);
  for (const { from, to, table } of tables.values()) {
    const a = lines.slice(from, to);
    const b = writeTable(table);
    const n = a.findIndex((l, j) => l !== b[j]);
    if (n >= 0 || a.length !== b.length) throw new Error(`${table.symbol}: reading the C and writing it back differs at line ${from + n + 1}: ${JSON.stringify(a[n])} vs ${JSON.stringify(b[n])}`);
  }
  return tables;
}

/* Negative controls: a folder expression changed, and a C expression
 * changed, must each fail the check. */
function negative(cText, folders) {
  const errors = [];
  const numeric = (e) => /\d/.test(e.expr ?? '');
  const victim = folders.find(({ folder }) => folder.tables[0].body.some(numeric));
  if (!victim) return ['negative control: no folder has a field to change'];
  const changed = structuredClone(victim.folder);
  const entry = changed.tables[0].body.find(numeric);
  entry.expr = `${entry.expr} + 1.0`;
  const mutated = folders.map((f) => (f === victim ? { ...f, folder: changed } : f));
  if (check(cText, mutated).length === 0) errors.push(`negative control: aircraft/${victim.id} .${entry.field} changed in the folder still passed`);
  const symbol = victim.folder.tables[0].symbol;
  const at = cText.indexOf(`const FixedWingParams ${symbol} = {`);
  const field = cText.indexOf(`  .${entry.field} = `, at);
  const comma = cText.indexOf(',', field);
  const cMutated = `${cText.slice(0, comma)} + 1.0${cText.slice(comma)}`;
  if (check(cMutated, folders).length === 0) errors.push(`negative control: ${symbol}.${entry.field} changed in the C still passed`);
  return errors;
}

const FAIL = 'aircraft-ctable: FAIL; the tables are generated: edit aircraft/<id>/plant.json and run npm run aircraft:ctable';

function main(argv) {
  const at = argv.indexOf('--root');
  const root = at > 0 ? argv[at + 1] : fileURLToPath(new URL('..', import.meta.url));
  const cFile = join(root, PLANT);
  const cText = readFileSync(cFile, 'utf8');
  const folders = readFolders(root);
  const owned = folders.reduce((n, f) => n + f.folder.tables.length, 0);
  if (argv.includes('--from-c')) {
    const tables = roundTrip(cText);
    for (const f of folders) {
      writeFileSync(f.file, serialize({ id: f.id, tables: f.folder.tables.map((t) => tables.get(t.symbol).table) }));
    }
    console.log(`aircraft-ctable: wrote ${folders.length} folders (${owned} tables) from ${PLANT}`);
    return 0;
  }
  if (argv.includes('--check')) {
    const errors = check(cText, folders);
    if (errors.length === 0) errors.push(...negative(cText, folders));
    for (const e of errors) console.error(`aircraft-ctable: ${e}`);
    if (errors.length) return 1;
    console.log(`aircraft-ctable: PASS, ${owned} tables from ${folders.length} folders match ${PLANT} both ways (${HAND.length} hand: ${HAND}); a changed folder and a changed C each fail`);
    return 0;
  }
  const out = generate(cText, folders);
  if (out !== cText) writeFileSync(cFile, out);
  for (const f of folders) if (serialize(f.folder) !== f.text) writeFileSync(f.file, serialize(f.folder));
  console.log(`aircraft-ctable: ${out === cText ? 'unchanged' : 'wrote'} ${PLANT}, ${owned} tables from ${folders.length} folders`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let code;
  try {
    code = main(process.argv);
  } catch (e) {
    console.error(`aircraft-ctable: ${e.message}`);
    code = 1;
  }
  if (code !== 0) console.error(FAIL);
  process.exit(code);
}
