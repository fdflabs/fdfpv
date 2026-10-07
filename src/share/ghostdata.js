/*
 * ghostdata.js: the bytes of a ghost lap and of a live frame.
 *
 * A ghost is one lap someone flew, kept so a later run can race it: the
 * aircraft's pose on a fixed time grid and the time at each gate. Poses
 * are in the scene's world frame (Three.js, y up, metres), the frame
 * src/game/race.js scores in, so a ghost recorded on a course replays on
 * that course in any browser with no conversion anywhere. Times count in
 * milliseconds from the lap's own start (the timing gate crossing), the
 * same zero the running lap uses; sample i lies at i * 1000 / rateHz.
 *
 * The board stores the base64 of these bytes beside a lap time, and its
 * src/validate.js checks the same header rules as inspectGhostBytes. Like
 * the .rec stick files (tests/lib/recfile.js) the format is little-endian
 * and read through DataView, so one module serves the browser and Node.
 *
 * Layout (every integer u32 unless marked):
 *
 *   0   "FPVGHST1"            8 ASCII bytes
 *   8   version               GHOST_VERSION
 *   12  rate                  samples per second, 1..240
 *   16  sample count          at least 2
 *   20  lap duration          ms, 1..GHOST_MAX_MS
 *   24  split count           at most GHOST_MAX_SPLITS
 *   28  reserved              written as 0, never read
 *   32  splits                one ms value per gate crossing, the last
 *                             being the finish
 *   ..  samples               GHOST_SAMPLE_BYTES each: position as three
 *                             f32, attitude quaternion as four i16 over
 *                             32767 (x y z w)
 *
 * Sixteen bits a quaternion component is well below anything visible on a
 * translucent craft and keeps a minute of lap under 40 KB. The encoder
 * keeps every sample in the same hemisphere as the one written before it
 * (q and -q are one rotation), so a reader can blend neighbours without a
 * sign test.
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

export const GHOST_MAGIC = 'FPVGHST1';
export const GHOST_VERSION = 1;
/* Position is smooth enough to spline from far fewer samples; attitude is
 * the fast part, and a 720 deg/s roll moves 24 degrees per 30 Hz step,
 * which a blend draws as the arc it was. More would only make every ghost
 * on the board bigger. */
export const GHOST_RATE_HZ = 30;
export const GHOST_HEADER_BYTES = 32;
export const GHOST_SAMPLE_BYTES = 20;
/* Ten minutes. A longer lap posts its time with no ghost; at 30 Hz the cap
 * keeps the largest blob near 360 KB, under the board's body limit. */
export const GHOST_MAX_MS = 600_000;
/* Far past any real course. It stops a forged header from claiming more
 * splits than the body could hold. */
export const GHOST_MAX_SPLITS = 256;

/* A live frame (racers on one track at once) is the sender's clock in ms,
 * u32, then one sample laid out as in a ghost. The relay puts the sender's
 * peer id, u16, in front and forwards the rest untouched, so receivers
 * read LIVE_PEER_BYTES + LIVE_FRAME_BYTES. Senders keep their own frames
 * in one hemisphere, as encodeGhost does. */
export const LIVE_FRAME_BYTES = 4 + GHOST_SAMPLE_BYTES;
export const LIVE_PEER_BYTES = 2;

const I16_UNIT = 32767;
const RATE_MIN = 1;
const RATE_MAX = 240;
const LE = true;

/* Byte offsets inside the header, and inside one sample. */
const AT = {
  version: 8, rate: 12, count: 16, duration: 20, splits: 24, reserved: 28,
};
const POS_AT = 0;
const QUAT_AT = 12;

const toI16Unit = (v) => Math.round(Math.max(-1, Math.min(1, v)) * I16_UNIT);

function writeSample(view, at, x, y, z, q) {
  view.setFloat32(at + POS_AT, x, LE);
  view.setFloat32(at + POS_AT + 4, y, LE);
  view.setFloat32(at + POS_AT + 8, z, LE);
  for (let k = 0; k < 4; k += 1) {
    view.setInt16(at + QUAT_AT + 2 * k, toI16Unit(q[k]), LE);
  }
}

/* The stored quaternion at `at`, scaled back to unit length (quantising
 * shortens it slightly), as [x, y, z, w]. An all-zero one can only be
 * forged and reads as no rotation. */
function readUnitQuat(view, at) {
  const q = [0, 1, 2, 3].map((k) => view.getInt16(at + 2 * k, LE) / I16_UNIT);
  const length = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (!(length > 1e-6)) {
    return [0, 0, 0, 1];
  }
  return q.map((c) => c / length);
}

const viewOf = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/*
 * The bytes of one recorded lap. `pos` holds 3 and `quat` 4 numbers per
 * sample on the fixed grid; `splits` are ascending ms ending with the lap.
 * A lap the format cannot hold throws: the recorder that made it is
 * broken, and a quiet failure would hide that.
 */
export function encodeGhost({
  rateHz, durationMs, splits, count, pos, quat,
}) {
  if (!Number.isInteger(rateHz) || rateHz < RATE_MIN || rateHz > RATE_MAX) {
    throw new Error(`ghost encode: bad rate ${rateHz}`);
  }
  if (!Number.isInteger(count) || count < 2) {
    throw new Error(`ghost encode: bad sample count ${count}`);
  }
  const wholeMs = Math.round(durationMs);
  if (!(wholeMs > 0 && wholeMs <= GHOST_MAX_MS)) {
    throw new Error(`ghost encode: bad duration ${durationMs}`);
  }
  if (pos.length !== count * 3 || quat.length !== count * 4) {
    throw new Error('ghost encode: frame arrays disagree with count');
  }
  const splitMs = (splits || []).map((ms) => Math.round(ms));
  if (splitMs.length > GHOST_MAX_SPLITS) {
    throw new Error(`ghost encode: ${splitMs.length} splits`);
  }

  const samplesAt = GHOST_HEADER_BYTES + 4 * splitMs.length;
  const out = new Uint8Array(samplesAt + GHOST_SAMPLE_BYTES * count);
  const view = new DataView(out.buffer);
  out.set(Array.from(GHOST_MAGIC, (ch) => ch.charCodeAt(0)), 0);
  view.setUint32(AT.version, GHOST_VERSION, LE);
  view.setUint32(AT.rate, rateHz, LE);
  view.setUint32(AT.count, count, LE);
  view.setUint32(AT.duration, wholeMs, LE);
  view.setUint32(AT.splits, splitMs.length, LE);
  view.setUint32(AT.reserved, 0, LE);
  splitMs.forEach((ms, i) => view.setUint32(GHOST_HEADER_BYTES + 4 * i, Math.max(0, ms), LE));

  /* Each sample is put in the hemisphere of the sample written before it,
   * so the stored stream always takes the short way round whatever the
   * recorder passed in. */
  let before = [0, 0, 0, 1];
  for (let i = 0; i < count; i += 1) {
    const q = [quat[4 * i], quat[4 * i + 1], quat[4 * i + 2], quat[4 * i + 3]];
    const agreement = q[0] * before[0] + q[1] * before[1] + q[2] * before[2] + q[3] * before[3];
    const written = agreement < 0 ? q.map((c) => -c) : q;
    writeSample(view, samplesAt + GHOST_SAMPLE_BYTES * i, pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], written);
    before = written;
  }
  return out;
}

export function encodeLiveFrame(tMs, px, py, pz, qx, qy, qz, qw) {
  const out = new Uint8Array(LIVE_FRAME_BYTES);
  const view = new DataView(out.buffer);
  view.setUint32(0, Math.max(0, Math.round(tMs)) >>> 0, LE);
  writeSample(view, 4, px, py, pz, [qx, qy, qz, qw]);
  return out;
}

/* { peer, tMs, px, py, pz, qx, qy, qz, qw } from a frame as the relay
 * delivers it, or null for bytes of any other length. */
export function decodeLiveFrame(bytes) {
  if (!bytes || bytes.byteLength !== LIVE_PEER_BYTES + LIVE_FRAME_BYTES) {
    return null;
  }
  const view = viewOf(bytes);
  const sample = LIVE_PEER_BYTES + 4;
  const [qx, qy, qz, qw] = readUnitQuat(view, sample + QUAT_AT);
  return {
    peer: view.getUint16(0, LE),
    tMs: view.getUint32(LIVE_PEER_BYTES, LE),
    px: view.getFloat32(sample + POS_AT, LE),
    py: view.getFloat32(sample + POS_AT + 4, LE),
    pz: view.getFloat32(sample + POS_AT + 8, LE),
    qx,
    qy,
    qz,
    qw,
  };
}

/*
 * Null for a blob decodeGhost will read, otherwise the reason as a short
 * phrase. Separate from decoding so a judge of blobs (the board, before it
 * stores one) does not build the arrays.
 */
export function inspectGhostBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return 'not a byte array';
  }
  if (bytes.length < GHOST_HEADER_BYTES) {
    return 'shorter than the header';
  }
  if ([...GHOST_MAGIC].some((ch, i) => bytes[i] !== ch.charCodeAt(0))) {
    return 'wrong magic';
  }
  const view = viewOf(bytes);
  const field = (name) => view.getUint32(AT[name], LE);
  const version = field('version');
  if (version !== GHOST_VERSION) {
    return `version ${version} is not ${GHOST_VERSION}`;
  }
  const rateHz = field('rate');
  if (rateHz < RATE_MIN || rateHz > RATE_MAX) {
    return `rate ${rateHz} Hz`;
  }
  const count = field('count');
  if (count < 2) {
    return `${count} samples`;
  }
  const durationMs = field('duration');
  if (durationMs < 1 || durationMs > GHOST_MAX_MS) {
    return `duration ${durationMs} ms`;
  }
  const splitCount = field('splits');
  if (splitCount > GHOST_MAX_SPLITS) {
    return `${splitCount} splits`;
  }
  const expected = GHOST_HEADER_BYTES + 4 * splitCount + GHOST_SAMPLE_BYTES * count;
  if (bytes.length !== expected) {
    return `${bytes.length} bytes for a header that describes ${expected}`;
  }
  /* The last sample has to land within one grid step of the finish, or a
   * reader sampling near the finish holds a pose that was never flown. */
  const gridStepMs = 1000 / rateHz;
  const reachMs = ((count - 1) * 1000) / rateHz + gridStepMs;
  return reachMs < durationMs ? 'grid ends before the lap does' : null;
}

export function decodeGhost(bytes) {
  const problem = inspectGhostBytes(bytes);
  if (problem) {
    throw new Error(`ghost decode: ${problem}`);
  }
  const view = viewOf(bytes);
  const rateHz = view.getUint32(AT.rate, LE);
  const count = view.getUint32(AT.count, LE);
  const durationMs = view.getUint32(AT.duration, LE);
  const splitCount = view.getUint32(AT.splits, LE);
  const splits = Array.from({ length: splitCount }, (_, i) => view.getUint32(GHOST_HEADER_BYTES + 4 * i, LE));
  const samplesAt = GHOST_HEADER_BYTES + 4 * splitCount;
  const pos = new Float32Array(3 * count);
  const quat = new Float32Array(4 * count);
  for (let i = 0; i < count; i += 1) {
    const at = samplesAt + GHOST_SAMPLE_BYTES * i;
    for (let k = 0; k < 3; k += 1) {
      pos[3 * i + k] = view.getFloat32(at + POS_AT + 4 * k, LE);
    }
    quat.set(readUnitQuat(view, at + QUAT_AT), 4 * i);
  }
  return {
    rateHz, durationMs, count, splits, pos, quat,
  };
}

/* btoa takes a binary string, and fromCharCode takes its bytes as
 * arguments, so the bytes go across in 32 KB pieces to stay under every
 * engine's argument limit. */
const BASE64_PIECE = 0x8000;

export function ghostToBase64(bytes) {
  const pieces = [];
  for (let from = 0; from < bytes.length; from += BASE64_PIECE) {
    pieces.push(String.fromCharCode(...bytes.subarray(from, from + BASE64_PIECE)));
  }
  return btoa(pieces.join(''));
}

export function ghostFromBase64(text) {
  const binary = atob(text);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}
