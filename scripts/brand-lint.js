/*
 * brand-lint.js: the upstream firmware's name stays off the screen.
 *
 * The owner's rule (2 Oct 2026) is that no player-facing text names
 * Betaflight, except the one attribution entry on the Credits screen that
 * GPLv3 asks for. This fails on /betaflight/i in:
 *
 *   - every value of every string table (keys are identifiers, not copy);
 *   - every string literal and template in src/ and configs/, whatever
 *     the copy lint excuses, because a rate type label or a download name
 *     is a single word and the copy lint only reads sentences;
 *   - the served HTML pages, with their comments stripped.
 *
 * Code comments, identifier-shaped literals (a tune id, a path, an enum
 * key) and everything outside those trees (vendor/, patches/, docs/,
 * scripts/, tests/) are not player-facing and are not read. An enum key
 * that IS shown, the bench's rates_type lookup, is relabelled where it is
 * drawn (LOOKUP_LABEL in src/ui/fc.js), which this lint cannot see. Every
 * allowance is listed below with its reason, printed on every run, and
 * fails as stale once the text it excuses is gone, so the list cannot
 * outlive what it was for. Run with npm run lint:bf.
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

import { literals } from './lib/literals.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const NAME = /betaflight/i;

/* String table keys whose value may name the firmware, and why. */
const ALLOWED_KEYS = new Map([
  ['credits.betaflight_notice', 'the GPLv3 attribution on the Credits screen'],
]);

/* Exact text in a served page that may name the firmware, and why. */
const ALLOWED_HTML = [
  {
    file: 'index.html',
    text: 'Real Betaflight in your browser',
    why: 'boot loader markup, owned by the loader rewrite; delete this entry when it lands',
  },
];

const PAGES = ['index.html', 'terms.html', 'privacy.html', 'src/trackbuilder/index.html', 'src/share/orbit.html'];

/* A tune id, a path or an enum key names nothing on screen. No dot, so a
 * download name such as x.diff is still read as copy. */
const IDENTIFIER = [/^[a-z0-9_/-]+$/, /^[A-Z0-9_]+$/];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p, out);
    } else if (e.name.endsWith('.js') && !e.name.endsWith('selftest.js')) {
      out.push(p);
    }
  }
  return out;
}

const hits = [];
const excused = [];
/* A string table key is an identifier too: its value is read from the table. */
const KEYS = new Set(Object.keys((await import(join(root, 'src/strings/en.js'))).default));

for (const table of ['en', 'es']) {
  const strings = (await import(join(root, 'src/strings', `${table}.js`))).default;
  for (const [key, value] of Object.entries(strings)) {
    if (!NAME.test(value)) {
      continue;
    }
    if (ALLOWED_KEYS.has(key)) {
      excused.push(`src/strings/${table}.js ${key}: ${ALLOWED_KEYS.get(key)}`);
      continue;
    }
    hits.push(`src/strings/${table}.js ${key}  ${JSON.stringify(value).slice(0, 110)}`);
  }
}
for (const key of ALLOWED_KEYS.keys()) {
  if (!excused.some((e) => e.endsWith(`${key}: ${ALLOWED_KEYS.get(key)}`))) {
    hits.push(`stale allowance: no string ${key} names the firmware any more; remove it from ALLOWED_KEYS`);
  }
}

/* The tables were read whole above; a literal in them is a value. */
const code = [...await walk(join(root, 'src')), ...await walk(join(root, 'configs'))]
  .filter((f) => !f.includes(`${join('src', 'strings')}`))
  .sort();
for (const f of code) {
  const rel = relative(root, f).replace(/\\/g, '/');
  const src = await readFile(f, 'utf8');
  for (const lit of literals(src)) {
    if (!NAME.test(lit.text)) {
      continue;
    }
    let text = lit.text;
    for (let pass = 0; pass < 8 && /\$\{/.test(text); pass += 1) {
      text = text.replace(/\$\{[^{}]*\}/g, 'x');
    }
    if (KEYS.has(text) || IDENTIFIER.some((re) => re.test(text))) {
      continue;
    }
    hits.push(`${rel}:${lit.line}  ${JSON.stringify(lit.text).slice(0, 110)}`);
  }
}

for (const page of PAGES) {
  const html = await readFile(join(root, page), 'utf8');
  /* Comments become blank lines rather than nothing, so line numbers hold. */
  const blank = (m) => m.replace(/[^\n]/g, '');
  const lines = html
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split('\n');
  lines.forEach((line, i) => {
    if (!NAME.test(line)) {
      return;
    }
    const allowed = ALLOWED_HTML.find((a) => a.file === page && line.includes(a.text));
    if (allowed) {
      excused.push(`${page}:${i + 1} ${JSON.stringify(allowed.text)}: ${allowed.why}`);
      return;
    }
    hits.push(`${page}:${i + 1}  ${JSON.stringify(line.trim()).slice(0, 110)}`);
  });
}
for (const a of ALLOWED_HTML) {
  if (!excused.some((e) => e.startsWith(`${a.file}:`) && e.includes(JSON.stringify(a.text)))) {
    hits.push(`stale allowance: ${a.file} no longer says ${JSON.stringify(a.text)}; remove it from ALLOWED_HTML`);
  }
}

for (const e of excused) {
  console.log(`  allowed  ${e}`);
}
for (const h of hits) {
  console.log(`  FAIL     ${h}`);
}
console.log(`brand lint: 2 string tables, ${code.length} script(s), ${PAGES.length} page(s)`);
if (hits.length) {
  console.log(`FAIL, ${hits.length} player-facing mention(s) of the firmware's name`);
  process.exit(1);
}
console.log('PASS, the firmware is named only where its licence asks');
