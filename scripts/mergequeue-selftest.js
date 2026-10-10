/*
 * mergequeue-selftest.js: the merge queue's settings and the workflows
 * agree (docs/MERGE-QUEUE.md). Run with npm run mergequeue:selftest.
 *
 * A queue waits for every required check on the merge group's commit. A
 * required check whose workflow does not run on merge_group never reports,
 * and the queue holds every pull request until its timeout, so this holds
 * each required context in deploy/github/ruleset-main.json to a job in a
 * workflow that runs on merge_group and on pull_request (the queue only
 * takes a pull request whose required checks passed on it first).
 *
 * Plain text reading, no YAML parser: the workflows here keep `on:` and
 * `jobs:` at column 0 and job ids at two spaces, and a workflow that stops
 * doing so fails this check loudly rather than passing blind.
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

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/* The lines under a top-level key, up to the next top-level key. */
function block(text, key) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l === `${key}:`);
  if (at < 0) {
    return null;
  }
  const end = lines.findIndex((l, i) => i > at && /^[A-Za-z]/.test(l));
  return lines.slice(at + 1, end < 0 ? lines.length : end);
}

/* Each job's check name: its `name:` when it has one, else its id. */
function jobs(text) {
  const lines = block(text, 'jobs') || [];
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const id = lines[i].match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (!id) {
      continue;
    }
    let name = id[1];
    for (let j = i + 1; j < lines.length && !/^ {2}\S/.test(lines[j]); j += 1) {
      const n = lines[j].match(/^ {4}name:\s*(.+?)\s*$/);
      if (n) {
        name = n[1].replace(/^['"]|['"]$/g, '');
      }
    }
    out.push(name);
  }
  return out;
}

function triggers(text) {
  return (block(text, 'on') || []).map((l) => l.match(/^ {2}([a-z_]+):/)).filter(Boolean).map((m) => m[1]);
}

const dir = '.github/workflows';
const workflows = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => {
  const text = readFileSync(join(dir, f), 'utf8');
  return { file: f, on: triggers(text), jobs: jobs(text) };
});
const ruleset = JSON.parse(readFileSync('deploy/github/ruleset-main.json', 'utf8'));
const rule = (type) => ruleset.rules.find((r) => r.type === type);

console.log('the ruleset');
const queue = rule('merge_queue');
check('main is the target and the merge queue is on', ruleset.target === 'branch' && ruleset.enforcement === 'active'
  && ruleset.conditions.ref_name.include.includes('~DEFAULT_BRANCH') && Boolean(queue));
check('the queue lands merge commits, as land.sh did', queue && queue.parameters.merge_method === 'MERGE');
/* checks.yml took 42 to 69 minutes on 2026-10-08; a group still building
 * at the timeout is failed, so the timeout is well past the slowest run. */
check('a group gets 120 minutes before the queue gives up on it', queue && queue.parameters.check_response_timeout_minutes >= 120,
  String(queue && queue.parameters.check_response_timeout_minutes));
const required = (rule('required_status_checks')?.parameters.required_status_checks || []).map((c) => c.context);
check('at least one check is required', required.length > 0);

console.log('every required check runs where the queue waits for it');
for (const context of required) {
  const home = workflows.filter((w) => w.jobs.includes(context));
  check(`"${context}" is one job, in one workflow`, home.length === 1, home.map((w) => w.file).join(' '));
  const w = home[0];
  check(`"${context}" runs on merge_group`, Boolean(w) && w.on.includes('merge_group'), w ? `${w.file}: ${w.on.join(' ')}` : '');
  check(`"${context}" runs on pull_request`, Boolean(w) && w.on.includes('pull_request'), w ? `${w.file}: ${w.on.join(' ')}` : '');
}

console.log('the reader sees the workflows');
check('every workflow has triggers and jobs', workflows.every((w) => w.on.length > 0 && w.jobs.length > 0),
  workflows.filter((w) => !w.on.length || !w.jobs.length).map((w) => w.file).join(' '));

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
