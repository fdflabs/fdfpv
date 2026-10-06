/*
 * transcript.js: pin a module's observable behaviour as one long transcript
 * of calls and results, and compare it to a digest recorded from the code
 * it replaces.
 *
 * A characterization selftest drives every export over a fixed corpus of
 * inputs and records each result with rec(). The transcript is canonical
 * text rather than JSON because JSON cannot tell -0 from 0, NaN from null,
 * or a missing key from an undefined one, and every one of those is a
 * difference a caller can see. Running the selftest with --dump=<file>
 * writes the transcript, so a failing digest can be diffed against the
 * same dump taken at the old revision.
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

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

export function canon(v, seen = new Set()) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (typeof v === 'function') return `fn:${v.name}/${v.length}`;
  if (seen.has(v)) return 'cycle';
  seen.add(v);
  const frozen = Object.isFrozen(v) ? '!' : '';
  let out;
  if (Array.isArray(v)) {
    // Array.from rather than map: an array carrying its own `constructor`
    // property (a malformed stored blob can) breaks map's species lookup.
    const extra = Object.keys(v).filter((k) => !/^\d+$/.test(k));
    const props = extra.map((k) => `,${JSON.stringify(k)}:${canon(v[k], seen)}`).join('');
    out = `${frozen}[${Array.from(v, (x) => canon(x, seen)).join(',')}${props}]`;
  } else if (v instanceof Map) {
    out = `${frozen}Map{${[...v].map(([k, x]) => `${canon(k, seen)}=>${canon(x, seen)}`).join(',')}}`;
  } else if (v instanceof Set) {
    out = `${frozen}Set{${[...v].map((x) => canon(x, seen)).join(',')}}`;
  } else if (ArrayBuffer.isView(v)) {
    out = `${v.constructor.name}[${Array.from(v, (x) => canon(x, seen)).join(',')}]`;
  } else {
    const proto = Object.getPrototypeOf(v);
    const tag = proto === Object.prototype || proto === null ? '' : (proto.constructor?.name ?? '?');
    out = `${frozen}${tag}{${Object.keys(v).map((k) => `${JSON.stringify(k)}:${canon(v[k], seen)}`).join(',')}}`;
  }
  seen.delete(v);
  return out;
}

export function transcript() {
  const lines = [];
  return {
    // Records what a call returned, or what it threw: a throw is behaviour.
    rec(label, fn) {
      let result;
      try {
        result = canon(fn());
      } catch (err) {
        result = `throws ${err?.constructor?.name}: ${err?.message}`;
      }
      lines.push(`${label} -> ${result}`);
    },
    note(label, value) {
      lines.push(`${label} = ${canon(value)}`);
    },
    // Exits non-zero when the digest differs from the pinned one.
    finish(name, pinned) {
      const text = `${lines.join('\n')}\n`;
      const digest = createHash('sha256').update(text).digest('hex');
      const dump = process.argv.find((a) => a.startsWith('--dump='));
      if (dump) writeFileSync(dump.slice(7), text);
      if (digest !== pinned) {
        console.log(`FAIL  ${name}: ${lines.length} records, digest ${digest}, pinned ${pinned}`);
        console.log('      rerun with --dump=<file> here and at the old revision, and diff the two');
        process.exit(1);
      }
      console.log(`ok  ${name}: ${lines.length} records match the pinned transcript`);
    },
  };
}

// A small deterministic generator, so a corpus is the same on every run
// and every machine without being written out by hand.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rand, list) => list[Math.floor(rand() * list.length)];
