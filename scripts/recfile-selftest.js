/*
 * recfile-selftest.js: the .rec stick recording format (tests/lib/recfile.js)
 * pinned as a transcript.
 *
 *     node scripts/recfile-selftest.js [--dump=<file>]   (npm run recfile:selftest)
 *
 * Every committed recording under tests/inputs decodes (its samples
 * recorded by digest) and encodes back to the same bytes; hand-made
 * streams with awkward numbers go both ways bit for bit; each header
 * field broken in turn is refused in the module's own words. Pinned by
 * digest (scripts/lib/transcript.js) on the module before its rewrite.
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
import { readFileSync, readdirSync } from 'node:fs';
import * as rec from '../tests/lib/recfile.js';
import { transcript } from './lib/transcript.js';

/* Re-pinned when a recording is re-recorded: the flight model lane's
 * tractors (docs/FLIGHTMODEL.md) moved only their own decode lines. */
const PINNED = '4a1498bb210247886cd741760787b2a54c0169217a4b424f2951154ef36e2de0';
const t = transcript();
const sha = (x) => createHash('sha256').update(x).digest('hex').slice(0, 24);
const hex = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('hex');
const engineSafe = (fn) => () => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof TypeError || e instanceof RangeError) {
      return `engine ${e.constructor.name}`;
    }
    throw e;
  }
};

t.note('exports', Object.keys(rec).sort());
t.note('constants', [rec.REC_MAGIC, rec.REC_VERSION, rec.REC_CHANNELS, rec.REC_HEADER_BYTES, rec.REC_SAMPLE_BYTES]);

const dir = new URL('../tests/inputs/', import.meta.url);
for (const name of readdirSync(dir).filter((f) => f.endsWith('.rec')).sort()) {
  const bytes = new Uint8Array(readFileSync(new URL(name, dir)));
  t.rec(`decode ${name}`, () => {
    const d = rec.decodeRec(bytes);
    const floats = new Float64Array(d.samples.flatMap((s) => [s.tUs, s.roll, s.pitch, s.yaw, s.throttle]));
    return {
      keys: Object.keys(d), version: d.version, rateHz: d.rateHz, count: d.count, sampleKeys: Object.keys(d.samples[0] || {}), samples: sha(Buffer.from(floats.buffer)),
    };
  });
  t.rec(`re-encode ${name} is the same bytes`, () => {
    const d = rec.decodeRec(bytes);
    return hex(rec.encodeRec(d.rateHz, d.samples)) === hex(bytes);
  });
}

const AWKWARD = [
  { tUs: 0, roll: 0, pitch: -0, yaw: 1, throttle: 0.5 },
  { tUs: 4000.7, roll: 0.1, pitch: -0.3333333, yaw: NaN, throttle: Infinity },
  { tUs: -1, roll: 1e-46, pitch: 3.5e38, yaw: -1e39, throttle: 2 },
  { tUs: 4294967296 + 5, roll: '0.25', pitch: null, yaw: undefined, throttle: true },
];
t.rec('encode awkward', () => hex(rec.encodeRec(250, AWKWARD)));
t.rec('encode none', () => hex(rec.encodeRec(1000, [])));
t.rec('encode a fractional rate', () => hex(rec.encodeRec(249.9, [AWKWARD[0]])));
t.rec('decode awkward', () => {
  const d = rec.decodeRec(rec.encodeRec(250, AWKWARD));
  return d.samples.map((s) => Object.values(s).map((v) => (Object.is(v, -0) ? '-0' : String(v))));
});
t.rec('decode at an offset', () => {
  const b = rec.encodeRec(500, AWKWARD.slice(0, 2));
  const padded = new Uint8Array(b.length + 5);
  padded.set(b, 3);
  return rec.decodeRec(padded.subarray(3, 3 + b.length)).samples.length;
});
t.rec('encode without samples', engineSafe(() => rec.encodeRec(250)));

const good = rec.encodeRec(250, AWKWARD.slice(0, 2));
const with32 = (at, v) => {
  const c = good.slice();
  new DataView(c.buffer).setUint32(at, v, true);
  return c;
};
for (const [label, bytes] of [
  ['31 bytes', good.slice(0, 31)],
  ['magic off', (() => { const c = good.slice(); c[6] = 0x39; return c; })()],
  ['version 2', with32(8, 2)],
  ['3 channels', with32(12, 3)],
  ['rate 0', with32(16, 0)],
  ['rate 1000000', with32(16, 1000000)],
  ['rate 1000001', with32(16, 1000001)],
  ['count one more', with32(20, 3)],
  ['reserved set', with32(24, 7)],
  ['a byte too many', (() => { const c = new Uint8Array(good.length + 1); c.set(good); return c; })()],
  ['empty', new Uint8Array(0)],
]) {
  t.rec(`decode ${label}`, () => {
    const d = rec.decodeRec(bytes);
    return [d.version, d.rateHz, d.count];
  });
}
t.rec('decode of nothing', engineSafe(() => rec.decodeRec()));

t.finish('recfile.js', PINNED);
