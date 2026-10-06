/*
 * render-golden.js: src/render and src/art outputs against recorded goldens.
 *
 *   node scripts/render-golden.js [--only=MODULE] [--write]
 *
 * Every file in tests/browser/render-golden/ holds one module's cases.
 * This opens tests/browser/render-golden.html with all of them (or only
 * MODULE's), runs every case and compares its value with the module's
 * tests/fixtures/render-golden/MODULE.json, exactly. A case missing from
 * the file fails, so a new case cannot pass by never having been recorded.
 *
 * --write records the selected modules' cases. A golden is only worth
 * something if it was recorded from the code it pins BEFORE that code
 * changed: record from the untouched module, commit, then change the
 * module and run without --write. Rewriting a golden to match a changed
 * module defeats the check.
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

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CASES = join(root, 'tests/browser/render-golden');
const GOLDENS = join(root, 'tests/fixtures/render-golden');

const args = process.argv.slice(2);
const write = args.includes('--write');
const only = (args.find((a) => a.startsWith('--only=')) || '').slice('--only='.length);

const modules = readdirSync(CASES)
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.slice(0, -3))
  .filter((m) => !only || m === only)
  .sort();
if (modules.length === 0) {
  console.log(`render-golden: no case module${only ? ` named ${only}` : ''} in ${CASES}`);
  process.exit(1);
}

/* The first place two values part, as a path, so a failure says where. */
function firstDifference(a, b, path = '') {
  if (Object.is(a, b)) {
    return null;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path || '(root)'}: recorded ${JSON.stringify(a)}, got ${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return `${path || '(root)'}: recorded ${Array.isArray(a) ? 'an array' : 'an object'}, got ${Array.isArray(b) ? 'an array' : 'an object'}`;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    if (!(k in a)) {
      return `${path}.${k}: not recorded, got ${JSON.stringify(b[k])}`;
    }
    if (!(k in b)) {
      return `${path}.${k}: recorded ${JSON.stringify(a[k])}, missing`;
    }
    const d = firstDifference(a[k], b[k], `${path}.${k}`);
    if (d) {
      return d;
    }
  }
  return null;
}

const goldenPath = (m) => join(GOLDENS, `${m}.json`);
const recorded = Object.fromEntries(modules.map((m) => [m, existsSync(goldenPath(m)) ? JSON.parse(readFileSync(goldenPath(m), 'utf8')) : {}]));
const page = await openPage({ root, width: 640, height: 360, url: `/tests/browser/render-golden.html?modules=${modules.join(',')}` });
let failed = 0;
let ran = 0;
try {
  await page.until('window.__goldenReady === true', 60000);
  for (const name of await page.evaluate('window.__golden.names()')) {
    const slash = name.indexOf('/');
    const [mod, key] = [name.slice(0, slash), name.slice(slash + 1)];
    const got = JSON.parse(await page.evaluate(`window.__golden.run(${JSON.stringify(name)})`));
    ran += 1;
    if (write) {
      recorded[mod][key] = got;
      console.log(`  wrote ${name}`);
      continue;
    }
    if (!(key in recorded[mod])) {
      failed += 1;
      console.log(`  FAIL  ${name}: no golden recorded`);
      continue;
    }
    const d = firstDifference(recorded[mod][key], got);
    if (d) {
      failed += 1;
      console.log(`  FAIL  ${name}: ${d}`);
    } else {
      console.log(`  pass  ${name}`);
    }
  }
  /* A recorded case that no longer runs is a pin quietly dropped. */
  const names = new Set(await page.evaluate('window.__golden.names()'));
  for (const m of write ? [] : modules) {
    for (const key of Object.keys(recorded[m]).filter((k) => !names.has(`${m}/${k}`))) {
      failed += 1;
      console.log(`  FAIL  ${m}/${key}: recorded but no longer run`);
    }
  }
  if (page.errors.length > 0) {
    failed += 1;
    console.log(`  FAIL  console errors:\n    ${page.errors.join('\n    ')}`);
  }
} finally {
  await page.close();
}
if (write) {
  mkdirSync(GOLDENS, { recursive: true });
  for (const m of modules) {
    const sorted = Object.fromEntries(Object.keys(recorded[m]).sort().map((k) => [k, recorded[m][k]]));
    writeFileSync(goldenPath(m), `${JSON.stringify(sorted, null, 1)}\n`);
    console.log(`render-golden: wrote ${goldenPath(m)}`);
  }
}
if (failed > 0) {
  console.log(`render-golden: ${failed} of ${ran} FAILED`);
  process.exit(1);
}
console.log(`render-golden: ${ran} cases ok in ${modules.join(', ')}`);
