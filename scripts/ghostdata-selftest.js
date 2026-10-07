/*
 * ghostdata-selftest.js: the ghost and live frame wire formats
 * (src/share/ghostdata.js) pinned as a transcript.
 *
 *     node scripts/ghostdata-selftest.js [--dump=<file>]   (npm run ghostdata:selftest)
 *
 * A seeded corpus of laps is encoded and every byte recorded; every blob
 * is decoded and every float recorded, bit for bit (a ghost on the board
 * must replay identically after the module changes); every header field is
 * corrupted in turn and the verdict recorded; live frames go both ways
 * with ordinary and hostile numbers; base64 round trips cross the 32 KB
 * chunk edge; and each refusal's message is recorded, since the board and
 * the logs read them. The digest below was taken on the module before its
 * rewrite (scripts/lib/transcript.js).
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
import * as ghost from '../src/share/ghostdata.js';
import { seeded, transcript } from './lib/transcript.js';

const PINNED = '7bcee14ca3bf6479c1f64fe68fdcf19659ce4a66640f13946a734a904530fa60';

const t = transcript();

/* A throw the engine raises (reading into undefined, a DataView over the
 * wrong thing) is recorded by its kind alone: its message quotes source
 * text, which is the implementation. Throws the module words itself are
 * recorded in full by t.rec. */
const ENGINE = [TypeError, RangeError, ReferenceError];
function engineSafe(fn) {
  return () => {
    try {
      return fn();
    } catch (e) {
      if (ENGINE.some((E) => e instanceof E)) {
        return `engine ${e.constructor.name}`;
      }
      throw e;
    }
  };
}
const rand = seeded(20261006);

/* Bytes as hex; floats as the hex of their own bits, so -0, NaN payloads
 * and the last mantissa bit all count. */
const hex = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('hex');
const bits = (arr) => hex(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24);

function decoded(d) {
  return {
    rateHz: d.rateHz, durationMs: d.durationMs, count: d.count, splits: d.splits,
    posType: d.pos.constructor.name, quatType: d.quat.constructor.name, pos: bits(d.pos), quat: bits(d.quat),
    keys: Object.keys(d),
  };
}

function tryEncode(label, lap) {
  let bytes = null;
  t.rec(`encode ${label}`, () => {
    bytes = ghost.encodeGhost(lap);
    return { type: bytes.constructor.name, length: bytes.length, offset: bytes.byteOffset, sha: sha(hex(bytes)) };
  });
  return bytes;
}

function tryDecode(label, bytes) {
  t.rec(`inspect ${label}`, () => ghost.inspectGhostBytes(bytes));
  t.rec(`decode ${label}`, () => decoded(ghost.decodeGhost(bytes)));
}

const unitQuat = () => {
  const v = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

/* A lap whose quaternion sometimes jumps hemispheres, the way a recorder
 * can hand them in. */
function randomLap(count, rateHz, { flip = 0.3, Arr = Float32Array, splits = 3 } = {}) {
  const pos = new Arr(count * 3);
  const quat = new Arr(count * 4);
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = (rand() - 0.5) * 400;
    pos[i * 3 + 1] = rand() * 60;
    pos[i * 3 + 2] = (rand() - 0.5) * 400;
    const q = unitQuat();
    const s = rand() < flip ? -1 : 1;
    for (let k = 0; k < 4; k += 1) {
      quat[i * 4 + k] = q[k] * s;
    }
  }
  const durationMs = ((count - 1) * 1000) / rateHz - rand() * (1000 / rateHz) * 0.9;
  const list = Array.from({ length: splits }, (_, i) => ((i + 1) / splits) * durationMs + (rand() - 0.5) * 3);
  return { rateHz, durationMs, splits: list, count, pos, quat };
}

t.note('constants', [ghost.GHOST_MAGIC, ghost.GHOST_VERSION, ghost.GHOST_RATE_HZ, ghost.GHOST_HEADER_BYTES, ghost.GHOST_SAMPLE_BYTES,
  ghost.GHOST_MAX_MS, ghost.GHOST_MAX_SPLITS, ghost.LIVE_FRAME_BYTES, ghost.LIVE_PEER_BYTES]);
t.note('exports', Object.keys(ghost).sort());

/* Laps that encode, and their decodes. */
const blobs = [];
for (const [label, opts] of [
  ['30 Hz, 3 splits', [90, 30]],
  ['30 Hz, many flips', [200, 30, { flip: 0.9 }]],
  ['1 Hz, two samples', [2, 1, { splits: 1 }]],
  ['240 Hz', [500, 240, { splits: 12 }]],
  ['7 Hz, no splits', [40, 7, { splits: 0 }]],
  ['Float64 input', [60, 30, { Arr: Float64Array }]],
  ['plain array input', [30, 30, { Arr: Array }]],
  ['256 splits', [300, 30, { splits: 256 }]],
]) {
  const lap = randomLap(...opts);
  const bytes = tryEncode(label, lap);
  if (bytes) {
    t.note(`bytes ${label}`, hex(bytes).slice(0, 400));
    blobs.push([label, bytes]);
    tryDecode(label, bytes);
  }
}
{
  /* Hand-made values: exact halves, out of range components, NaN, -0,
   * splits needing rounding or below zero, and a zero quaternion. */
  const quat = Float32Array.from([
    0, 0, 0, 1,
    0, 0, 0, -1,
    -0, 0.5, -0.5, 0.70710678,
    2, -3, 0.25, 0.1,
    NaN, 0, 0, 1,
    0, 0, 0, 0,
    1 / 32767 / 2, -1 / 32767 / 2, 1.5 / 32767, -1.5 / 32767,
    0.3, 0.3, 0.3, -0.3,
  ]);
  const pos = Float32Array.from([0, 0, 0, -0, 1e-45, 3.4e38, NaN, Infinity, -Infinity, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0.1, 0.2, 0.3, -1, -2, -3]);
  const lap = { rateHz: 30, durationMs: 233.4, splits: [-5, 10.5, 11.49, NaN, 4294967296.4, 233.5], count: 8, pos, quat };
  const bytes = tryEncode('hand values', lap);
  t.note('bytes hand values', hex(bytes));
  tryDecode('hand values', bytes);
  blobs.push(['hand values', bytes]);
  /* The same lap read through a view that does not start at byte 0. */
  const padded = new Uint8Array(bytes.length + 7);
  padded.set(bytes, 3);
  tryDecode('hand values at an offset', padded.subarray(3, 3 + bytes.length));
}

/* Laps the format refuses, and the words it refuses them with. */
const good = () => randomLap(10, 30);
for (const [label, change] of [
  ['rate 0', { rateHz: 0 }],
  ['rate 241', { rateHz: 241 }],
  ['rate 29.5', { rateHz: 29.5 }],
  ['rate as a string', { rateHz: '30' }],
  ['count 1', { count: 1 }],
  ['count 2.5', { count: 2.5 }],
  ['duration 0', { durationMs: 0 }],
  ['duration 0.4', { durationMs: 0.4 }],
  ['duration 0.5', { durationMs: 0.5 }],
  ['duration NaN', { durationMs: NaN }],
  ['duration over the cap', { durationMs: 600_000.6 }],
  ['duration at the cap', { durationMs: 600_000.4, count: 18001 }],
  ['duration as a string', { durationMs: '300' }],
  ['positions short', { pos: new Float32Array(29) }],
  ['quaternions long', { quat: new Float32Array(41) }],
  ['257 splits', { splits: new Array(257).fill(1) }],
  ['splits null', { splits: null }],
  ['splits undefined', { splits: undefined }],
]) {
  const lap = { ...good(), ...change };
  if (change.count === 18001) {
    lap.pos = new Float32Array(18001 * 3);
    lap.quat = new Float32Array(18001 * 4);
  }
  t.rec(`encode refuses? ${label}`, () => {
    const b = ghost.encodeGhost(lap);
    return { length: b.length, sha: sha(hex(b)) };
  });
}
t.rec('encode of nothing', () => ghost.encodeGhost({}));
t.rec('encode with no argument', engineSafe(() => ghost.encodeGhost()));

/* Every header field broken in turn, on a real blob. */
{
  const base = blobs[0][1];
  const set32 = (b, at, v) => {
    const c = b.slice();
    new DataView(c.buffer).setUint32(at, v, true);
    return c;
  };
  const cases = [
    ['not bytes: array', Array.from(base)],
    ['not bytes: buffer', base.buffer],
    ['not bytes: Int8Array', new Int8Array(base.buffer)],
    ['not bytes: null', null],
    ['not bytes: string', 'FPVGHST1'],
    ['31 bytes', base.slice(0, 31)],
    ['empty', new Uint8Array(0)],
    ['magic off by one', (() => { const c = base.slice(); c[7] = 0x32; return c; })()],
    ['magic lower case', (() => { const c = base.slice(); c[0] = 0x66; return c; })()],
    ['version 2', set32(base, 8, 2)],
    ['version 0', set32(base, 8, 0)],
    ['rate 0', set32(base, 12, 0)],
    ['rate 241', set32(base, 12, 241)],
    ['rate 240', set32(base, 12, 240)],
    ['count 1', set32(base, 16, 1)],
    ['count 0', set32(base, 16, 0)],
    ['count huge', set32(base, 16, 0xffffffff)],
    ['duration 0', set32(base, 20, 0)],
    ['duration over the cap', set32(base, 20, 600_001)],
    ['duration one past the grid', set32(base, 20, 3001)],
    ['duration at the grid end', set32(base, 20, 3000)],
    ['splits 257', set32(base, 24, 257)],
    ['splits one more', set32(base, 24, 4)],
    ['reserved non zero', set32(base, 28, 99)],
    ['one byte long', (() => { const c = new Uint8Array(base.length + 1); c.set(base); return c; })()],
    ['one byte short', base.slice(0, base.length - 1)],
  ];
  for (const [label, bytes] of cases) {
    tryDecode(`broken: ${label}`, bytes);
  }
}

/* Live frames. */
const liveCases = [
  [0, 0, 0, 0, 0, 0, 0, 1],
  [1234.5, 1.5, -2.25, 3e3, 0.1, 0.2, 0.3, 0.927],
  [-50, 1, 2, 3, 0, 0, 0, -1],
  [4294967295.6, 0, 0, 0, 1, 1, 1, 1],
  [4294967296 * 2 + 17, 0, 0, 0, 0, 0, 0, 0],
  [NaN, NaN, Infinity, -Infinity, NaN, 2, -2, 0.5],
  [16.6, -0, 0, -0, -0, 0, -0, 1e-9],
  [99, 0, 0, 0, 1e-7, -1e-7, 1e-7, 1e-7],
];
for (const args of liveCases) {
  const label = args.map(String).join(',');
  let frame = null;
  t.rec(`live encode ${label}`, () => {
    frame = ghost.encodeLiveFrame(...args);
    return { type: frame.constructor.name, hex: hex(frame) };
  });
  for (const peer of [0, 7, 65535]) {
    const relayed = new Uint8Array(ghost.LIVE_PEER_BYTES + frame.length);
    new DataView(relayed.buffer).setUint16(0, peer, true);
    relayed.set(frame, ghost.LIVE_PEER_BYTES);
    t.rec(`live decode ${label} peer ${peer}`, () => {
      const d = ghost.decodeLiveFrame(relayed);
      return { keys: Object.keys(d), bits: bits(Float64Array.from(Object.values(d))) };
    });
  }
}
{
  const frame = ghost.encodeLiveFrame(5, 1, 2, 3, 0, 0, 0, 1);
  const relayed = new Uint8Array(40);
  relayed.set([1, 0], 9);
  relayed.set(frame, 11);
  t.rec('live decode at an offset', () => bits(Float64Array.from(Object.values(ghost.decodeLiveFrame(relayed.subarray(9, 35))))));
  for (const [label, bad] of [['null', null], ['undefined', undefined], ['25 bytes', new Uint8Array(25)], ['27 bytes', new Uint8Array(27)],
    ['an ArrayBuffer of 26', new ArrayBuffer(26)], ['an array of 26', new Array(26).fill(0)], ['zero quaternion', new Uint8Array(26)]]) {
    t.rec(`live decode ${label}`, engineSafe(() => {
      const d = ghost.decodeLiveFrame(bad);
      return d && bits(Float64Array.from(Object.values(d)));
    }));
  }
}

/* Base64. */
for (const [label, bytes] of [
  ['empty', new Uint8Array(0)],
  ['one byte', Uint8Array.of(255)],
  ['every byte value', Uint8Array.from({ length: 256 }, (_, i) => i)],
  ['32 KB exactly', Uint8Array.from({ length: 0x8000 }, () => Math.floor(rand() * 256))],
  ['32 KB and one', Uint8Array.from({ length: 0x8001 }, () => Math.floor(rand() * 256))],
  ['three chunks and change', Uint8Array.from({ length: 0x8000 * 3 + 5 }, () => Math.floor(rand() * 256))],
  ...blobs.slice(0, 3),
]) {
  let text = '';
  t.rec(`base64 ${label}`, () => {
    text = ghost.ghostToBase64(bytes);
    return { length: text.length, sha: sha(text), head: text.slice(0, 60) };
  });
  t.rec(`base64 back ${label}`, () => {
    const back = ghost.ghostFromBase64(text);
    return { type: back.constructor.name, same: hex(back) === hex(bytes), length: back.length };
  });
}
t.rec('base64 of a subarray', () => ghost.ghostToBase64(Uint8Array.of(1, 2, 3, 4, 5).subarray(1, 4)));
t.rec('base64 of a plain array', engineSafe(() => ghost.ghostToBase64([1, 2, 3])));
for (const text of ['', 'AQID', 'AQI', 'AQ==', 'A Q I D', '@@@@', '====', 'AQID\n']) {
  t.rec(`from base64 ${JSON.stringify(text)}`, () => hex(ghost.ghostFromBase64(text)));
}
t.rec('from base64 of null', () => hex(ghost.ghostFromBase64(null)));

t.finish('ghostdata.js', PINNED);
