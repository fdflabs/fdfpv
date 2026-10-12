/*
 * deploy-files-check.js: every file a VM server imports is a file
 * deploy/vm/deploy.sh copies to the VM.
 *
 *     node scripts/deploy-files-check.js      (npm run deploy:files)
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
 * The VM holds only what deploy.sh rsyncs. configs/airframes.js began to
 * import aircraft/, which the list did not name, and the rooms server
 * would have crashed on the VM at startup with nothing in CI to say so
 * (2026-10-12, found by hand). Nothing here is a second list: the rsync
 * list is read out of deploy.sh itself, and the entry points out of the
 * ExecStart line of every deploy/vm unit that runs node from /opt/fdfpv
 * (the board unit runs from /opt/fdfpv-board, its own deploy). From those
 * entries the check follows every static import, re-export and
 * dynamic import with a string literal. It fails on:
 *   - an imported file outside the rsync list;
 *   - a relative import that does not resolve to a file;
 *   - a dynamic import whose specifier is not a literal, which the walk
 *     cannot follow (a template literal of the form `./${name}.js` is
 *     followed to every file in that directory ending in .js);
 *   - a package the VM would not have: `npm ci --omit=dev` installs only
 *     package.json "dependencies".
 * Its negative control drops, one at a time, each listed path the walk
 * reaches, and requires the check to fail for it, so a parser that finds
 * nothing cannot pass. A file read by path rather than imported
 * (readFile, new URL) is not followed.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const REMOTE_DIR = '/opt/fdfpv';

/* The paths deploy.sh's rsync copies: every word after the options and
 * before the destination (the one holding host:path). */
function rsyncList(script) {
  const lines = script.replace(/\\\n/g, ' ').split('\n');
  const line = lines.find((l) => /^\s*rsync\s/.test(l));
  if (!line) {
    throw new Error('deploy.sh has no rsync line');
  }
  const words = [...line.matchAll(/"[^"]*"|'[^']*'|\S+/g)].map((m) => m[0]);
  const paths = [];
  for (let i = 1; i < words.length; i += 1) {
    const w = words[i];
    if (w === '-e' || w === '--exclude') {
      i += 1;
    } else if (!w.startsWith('-')) {
      paths.push(w.replace(/^["']|["']$/g, ''));
    }
  }
  const dest = paths.pop();
  if (!/^\S*:\S*$/.test(dest || '') || paths.length === 0) {
    throw new Error(`deploy.sh's rsync line is not <paths> <host:dir>: ${line.trim()}`);
  }
  return paths;
}

/* Entry points: node's script argument on each ExecStart line of a unit
 * that runs from REMOTE_DIR. */
function entryPoints(unitDir) {
  const entries = [];
  for (const name of readdirSync(unitDir).filter((f) => f.endsWith('.service')).sort()) {
    const text = readFileSync(join(unitDir, name), 'utf8');
    if (!new RegExp(`^WorkingDirectory=${REMOTE_DIR}\\s*$`, 'm').test(text)) {
      continue;
    }
    for (const m of text.matchAll(/^ExecStart=(\S*\/node)\s+(.*)$/gm)) {
      const script = m[2].split(/\s+/).find((w) => !w.startsWith('-'));
      entries.push({ unit: name, file: script });
    }
  }
  return entries;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/* Specifiers a module imports. `from` must follow an import or export
 * clause, so a line of prose cannot match. */
function specifiers(src) {
  const code = stripComments(src);
  const found = [];
  for (const m of code.matchAll(/^\s*(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])([^'"]+)\1/gm)) {
    found.push(m[2]);
  }
  for (const m of code.matchAll(/^\s*import\s*(['"])([^'"]+)\1/gm)) {
    found.push(m[2]);
  }
  const dynamic = [];
  const globs = [];
  const opaque = [];
  for (const m of code.matchAll(/\bimport\(\s*([^)]{0,80})\)/g)) {
    const arg = m[1].trim();
    const lit = /^(['"`])([^'"`$]+)\1(?:\s*,|$)/.exec(arg);
    const tpl = /^`(\.\/)\$\{[^}]*\}([^`$]*)`$/.exec(arg);
    if (lit) {
      dynamic.push(lit[2]);
    } else if (tpl) {
      globs.push(tpl[2]);
    } else {
      opaque.push(arg);
    }
  }
  return { found: found.concat(dynamic), globs, opaque };
}

const builtin = new Set(builtinModules);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const prodDeps = new Set(Object.keys(pkg.dependencies || {}));

/* Walks the graph from the entries once. Returns the files reached and the
 * problems that do not depend on the rsync list. */
function walk(entries) {
  const files = new Set();
  const problems = [];
  const queue = entries.map((e) => ({ file: resolve(root, e.file), from: `${e.unit} ExecStart` }));
  while (queue.length) {
    const { file, from } = queue.pop();
    const rel = relative(root, file);
    if (files.has(rel)) {
      continue;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      problems.push(`${rel}: imported by ${from}, no such file`);
      continue;
    }
    files.add(rel);
    if (!/\.m?js$/.test(file)) {
      continue;
    }
    const { found, globs, opaque } = specifiers(readFileSync(file, 'utf8'));
    for (const o of opaque) {
      problems.push(`${rel}: import(${o}) has no literal specifier, the walk cannot follow it`);
    }
    for (const suffix of globs) {
      for (const sibling of readdirSync(dirname(file)).filter((n) => n.endsWith(suffix))) {
        queue.push({ file: join(dirname(file), sibling), from: rel });
      }
    }
    for (const spec of found) {
      if (spec.startsWith('node:') || builtin.has(spec)) {
        continue;
      }
      if (spec.startsWith('.') || spec.startsWith('/')) {
        queue.push({ file: resolve(dirname(file), spec), from: rel });
        continue;
      }
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!prodDeps.has(name)) {
        problems.push(`${rel}: imports package ${name}, not in package.json dependencies (the VM runs npm ci --omit=dev)`);
      }
    }
  }
  return { files, problems };
}

const outside = (files, list) => [...files].filter((f) => !list.some((p) => f === p || f.startsWith(`${p}/`))).sort();

const list = rsyncList(readFileSync(join(root, 'deploy/vm/deploy.sh'), 'utf8'));
const entries = entryPoints(join(root, 'deploy/vm'));
if (entries.length === 0) {
  console.log('FAIL, no node ExecStart under deploy/vm runs from ' + REMOTE_DIR);
  process.exit(1);
}
const { files, problems } = walk(entries);
const missing = outside(files, list);

console.log(`deploy files check: rsync list [${list.join(', ')}], ${entries.length} entry point(s), ${files.size} files reached`);
const failures = [...problems, ...missing.map((f) => `${f}: imported by a VM server, not in deploy.sh's rsync list`)];

/* A walk that reaches nothing would pass any list; drop each listed path
 * the walk uses and require the check to notice. */
const used = list.filter((p) => [...files].some((f) => f === p || f.startsWith(`${p}/`)));
for (const dropped of used) {
  const without = list.filter((p) => p !== dropped);
  if (outside(files, without).length === 0) {
    failures.push(`negative control: dropping ${dropped} from the list did not fail`);
  }
}
console.log(`negative control: dropping each of [${used.join(', ')}] fails the check`);

if (failures.length) {
  for (const f of failures) {
    console.log(`  ${f}`);
  }
  console.log(`FAIL, ${failures.length} problem(s)`);
  process.exit(1);
}
console.log('PASS, every file the VM servers import is shipped');
