/*
 * golden.js: the plumbing for a golden record, a check that a module still
 * gives exactly the outputs it gave when the record was written.
 *
 * A characterization check drives a module through a fixed, seeded list of
 * cases, writes everything the module said into a stream, and compares a
 * digest of each case's stream with the record. Exact means exact: numbers
 * are written by their shortest round trip spelling, which names one double
 * and only one, and -0, NaN and the infinities are spelled out, because
 * JSON.stringify folds them into 0 and null and a rewrite that turned a -0
 * into a 0 would sail through.
 *
 *   node scripts/<module>-golden.js            compare with the record
 *   node scripts/<module>-golden.js --record   write the record
 *   node scripts/<module>-golden.js --dump=DIR write every case's stream
 *
 * The record is a digest per case, not the stream, so a fixture stays a few
 * kilobytes however much a case says. --dump is for whoever has to find
 * where two streams part.
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

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * A canonical spelling of any value a module can hand back: plain objects
 * with their keys in insertion order (the order is part of what a caller
 * sees when it spreads or iterates one), arrays, typed arrays, Maps, Sets,
 * strings, booleans, null, undefined and numbers spelled exactly. A cycle
 * is written as a back reference rather than followed.
 */
export function canon(value, seen = []) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined': return 'undefined';
    case 'boolean': return value ? 'true' : 'false';
    case 'string': return JSON.stringify(value);
    case 'bigint': return `${value}n`;
    case 'function': return `fn:${value.name}`;
    case 'number':
      if (Object.is(value, -0)) return '-0';
      return Number.isNaN(value) ? 'NaN' : String(value);
    default: break;
  }
  const at = seen.indexOf(value);
  if (at >= 0) return `@${at}`;
  seen.push(value);
  let out;
  if (Array.isArray(value)) {
    out = `[${value.map((v) => canon(v, seen)).join(',')}]`;
  } else if (ArrayBuffer.isView(value)) {
    out = `${value.constructor.name}[${Array.from(value, (v) => canon(v, seen)).join(',')}]`;
  } else if (value instanceof Map) {
    out = `Map{${Array.from(value, ([k, v]) => `${canon(k, seen)}=>${canon(v, seen)}`).join(',')}}`;
  } else if (value instanceof Set) {
    out = `Set{${Array.from(value, (v) => canon(v, seen)).join(',')}}`;
  } else {
    const keys = Object.keys(value);
    out = `{${keys.map((k) => `${JSON.stringify(k)}:${canon(value[k], seen)}`).join(',')}}`;
  }
  seen.pop();
  return out;
}

/*
 * A small seeded generator, so a case is the same case on every machine.
 * The sequence itself is arbitrary; all that matters is that it never
 * changes once a record has been written against it.
 */
export function seeded(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    range: (lo, hi) => lo + next() * (hi - lo),
  };
}

/* What a case says, line by line. */
export class Stream {
  constructor() {
    this.lines = [];
  }

  say(label, value) {
    this.lines.push(`${label} ${canon(value)}`);
  }

  /* Runs fn and says what it returned, or the message it threw: a throw is
   * an output like any other, and a rewrite must throw where the old code
   * threw. */
  call(label, fn) {
    let v;
    try {
      v = fn();
    } catch (err) {
      this.lines.push(`${label} threw ${JSON.stringify(String(err && err.message))}`);
      return undefined;
    }
    this.say(label, v);
    return v;
  }

  text() {
    return `${this.lines.join('\n')}\n`;
  }

  digest() {
    return createHash('sha256').update(this.text()).digest('hex');
  }
}

/*
 * The common main: cases is a list of { id, run(stream) }. Compares each
 * digest with the record at fixtureUrl, or writes the record with --record,
 * and exits non zero on any difference so a CI step can run it.
 */
export function goldenMain(name, fixtureUrl, cases) {
  const args = process.argv.slice(2);
  const record = args.includes('--record');
  const dumpArg = args.find((a) => a.startsWith('--dump='));
  const dump = dumpArg ? dumpArg.slice('--dump='.length) : null;
  if (dump) mkdirSync(dump, { recursive: true });

  const got = {};
  for (const c of cases) {
    const s = new Stream();
    c.run(s);
    got[c.id] = s.digest();
    if (dump) writeFileSync(join(dump, `${c.id}.txt`), s.text());
  }

  if (record) {
    let commit = 'unknown';
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch { /* outside a checkout the record still stands; it just cannot say where */ }
    writeFileSync(fixtureUrl, `${JSON.stringify({ commit, cases: got }, null, 1)}\n`);
    console.log(`${name}: recorded ${cases.length} cases at ${commit}`);
    return;
  }

  const want = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
  let bad = 0;
  for (const c of cases) {
    if (!(c.id in want.cases)) {
      console.log(`FAIL  ${c.id}: not in the record`);
      bad += 1;
    } else if (want.cases[c.id] !== got[c.id]) {
      console.log(`FAIL  ${c.id}: differs from the record`);
      bad += 1;
    }
  }
  for (const id of Object.keys(want.cases)) {
    if (!(id in got)) {
      console.log(`FAIL  ${id}: in the record but no longer run`);
      bad += 1;
    }
  }
  if (bad) {
    console.log(`${name}: ${bad} of ${cases.length} cases FAILED against the record (${want.commit})`);
    process.exit(1);
  }
  console.log(`${name} ok: ${cases.length} cases equal to the record (${want.commit})`);
}
