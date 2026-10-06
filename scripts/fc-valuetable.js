/*
 * fc-valuetable.js: read the Betaflight 4.5.1 CLI value table out of
 * vendor/betaflight and the keys our module writes out of bf_settings.c.
 *
 * Both sources are C, and both are read as C initialisers rather than
 * scraped line by line: a clivalue_t is { name, flags, config, pgn,
 * offset } (cli/settings.h), so each entry is split into those five fields
 * and every catalog column comes from the field that owns it. The catalog
 * generator and lint:catalog share this, so the data the FC screen shows
 * and the coverage check agree on what the firmware has.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCES = {
  names: 'vendor/betaflight/src/main/fc/parameter_names.h',
  settings: 'vendor/betaflight/src/main/cli/settings.c',
  writer: 'src/native/bf/bf_settings.c',
};

// The widths the FC screen knows how to edit. VAR_INT32 (the two GPS lap
// timer gate coordinates) is outside it and has always been catalogued as
// UINT8; those keys are INERT, so the width is never used to clamp a value.
const CATALOG_TYPES = new Set(['UINT8', 'UINT16', 'INT8', 'INT16', 'UINT32']);

// Blank out comments and preprocessor lines but keep every other character
// where it was, so slices of the result are the source text the catalog
// quotes for bounds like `VTX_TABLE_MAX_POWER_LEVELS - 1`.
function blankNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (c) => ' '.repeat(c.length))
    .replace(/^[ \t]*#[^\n]*/gm, (c) => ' '.repeat(c.length));
}

// Split on commas that are not inside braces, brackets, parentheses or a
// string literal. Pieces are trimmed; an empty trailing piece (a trailing
// comma) is dropped.
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '\\') i += 1;
      else if (c === '"') quoted = false;
    } else if (c === '"') {
      quoted = true;
    } else if ('{(['.includes(c)) {
      depth += 1;
    } else if ('})]'.includes(c)) {
      depth -= 1;
    } else if (c === ',' && depth === 0) {
      parts.push(text.slice(from, i).trim());
      from = i + 1;
    }
  }
  const last = text.slice(from).trim();
  if (last) parts.push(last);
  return parts;
}

function unbrace(text) {
  const t = text.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) {
    throw new Error(`expected a braced initialiser, got: ${t.slice(0, 60)}`);
  }
  return t.slice(1, -1);
}

// The text between `name ... = {` and its matching `}`.
function arrayInitialiser(code, declaration) {
  const at = code.indexOf(declaration);
  if (at < 0) throw new Error(`${declaration} not found`);
  const open = code.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}' && (depth -= 1) === 0) return code.slice(open + 1, i);
  }
  throw new Error(`${declaration} is not closed`);
}

export function parseParamNames(src) {
  const names = new Map();
  for (const m of src.matchAll(/^\s*#\s*define\s+(PARAM_NAME_\w+)\s+"([^"]*)"/gm)) {
    names.set(m[1], m[2]);
  }
  return names;
}

// A key is written either as a literal or as a PARAM_NAME_ macro. Returns
// null for anything else, which is not a key.
function keyOf(token, names) {
  const t = token.trim();
  if (/^"[^"]*"$/.test(t)) return t.slice(1, -1);
  if (!/^PARAM_NAME_\w+$/.test(t)) return null;
  if (!names.has(t)) throw new Error(`${t} is not defined in parameter_names.h`);
  return names.get(t);
}

// `.config.<member> = <value>`, the designated union member of
// cliValueConfig_t. Only the two min/max members carry bounds; lookup,
// bitpos, array, string and d32Max entries have none in the catalog.
function bounds(config) {
  const m = /^\.config\.(minmax|minmaxUnsigned)\s*=\s*([\s\S]*)$/.exec(config);
  if (!m) return { min: null, max: null };
  const [min, max] = splitTopLevel(unbrace(m[2]));
  return { min, max };
}

// The catalog's lookup column is the first TABLE_ name in the entry. For a
// MODE_LOOKUP entry that is its own table; vtx_power has no table but its
// bound VTX_TABLE_MAX_POWER_LEVELS carries the substring, so it reads
// MAX_POWER_LEVELS. Kept as is so the FC screen is unchanged by this
// generator; it is an INERT key and lookupValues has no such table.
function lookupOf(fields) {
  const m = /TABLE_([A-Z0-9_]+)/.exec(fields.join(','));
  return m ? m[1] : null;
}

export function parseValueTable(src, names) {
  const body = arrayInitialiser(blankNonCode(src), 'const clivalue_t valueTable[]');
  const rows = [];
  const seen = new Set();
  for (const entry of splitTopLevel(body)) {
    const fields = splitTopLevel(unbrace(entry));
    const key = keyOf(fields[0], names);
    // #if / #else branches both survive blanking, so a key can appear twice;
    // the first spelling is the one Betaflight's default target builds.
    if (key === null || seen.has(key)) continue;
    seen.add(key);
    const flags = fields[1].split('|').map((f) => f.trim());
    const width = flags.find((f) => f.startsWith('VAR_'))?.slice(4);
    rows.push({
      key,
      type: CATALOG_TYPES.has(width) ? width : 'UINT8',
      lookup: lookupOf(fields),
      pg: fields[3]?.startsWith('PG_') ? fields[3].slice(3) : null,
      ...bounds(fields[2]),
      array: flags.includes('MODE_ARRAY'),
    });
  }
  return rows;
}

// bf_settings_build() registers each key through one of the setter macros
// below, always with the key as the first argument. The body is taken up
// to the INERT_PREFIX table, which lists prefixes, not keys.
const SETTERS = ['U8', 'U16', 'I8', 'I16', 'LUT8', 'LUTI8'];

export function parseBfSettingsKeys(src, names) {
  const code = blankNonCode(src);
  const from = code.indexOf('void bf_settings_build(void)');
  const to = code.indexOf('static const char *const INERT_PREFIX');
  if (from < 0 || to <= from) throw new Error('bf_settings_build() body not found');
  const call = new RegExp(`\\b(?:${SETTERS.join('|')})\\(([^,)]*)`, 'g');
  const keys = [];
  for (const m of code.slice(from, to).matchAll(call)) {
    const key = keyOf(m[1], names);
    if (key !== null && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

export async function loadFirmwareTables(root) {
  const read = (rel) => readFile(join(root, rel), 'utf8');
  const names = parseParamNames(await read(SOURCES.names));
  const table = parseValueTable(await read(SOURCES.settings), names);
  const live = parseBfSettingsKeys(await read(SOURCES.writer), names);
  return { names, table, live };
}
