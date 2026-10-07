/*
 * recfile.js: the .rec file, a recorded stream of stick input that the
 * replay checks fly through the plant.
 *
 * DataView only, no platform API, so the same module runs in Node and in
 * the browser. Little-endian throughout:
 *
 *   0   "FPVREC01"        8 ASCII bytes
 *   8   version           u32, REC_VERSION
 *   12  channels          u32, REC_CHANNELS
 *   16  sample rate       u32, Hz
 *   20  sample count      u32
 *   24  reserved          2 x u32, written as 0
 *   32  samples           REC_SAMPLE_BYTES each: time in microseconds
 *                         from the start (u32), then roll, pitch, yaw,
 *                         throttle (f32 each)
 *
 * Channels follow sim_abi.h: roll, pitch, yaw in -1..1 (positive is roll
 * right, nose up, nose right) and throttle in 0..1.
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

export const REC_MAGIC = 'FPVREC01';
export const REC_VERSION = 1;
export const REC_CHANNELS = 4;
export const REC_HEADER_BYTES = 32;
export const REC_SAMPLE_BYTES = 20;

const LE = true;
const AXES = ['roll', 'pitch', 'yaw', 'throttle'];
const RATE_LIMIT_HZ = 1000000;

/* The bytes of a recording at `rateHz` of `samples`, each
 * { tUs, roll, pitch, yaw, throttle }. */
export function encodeRec(rateHz, samples) {
  const out = new Uint8Array(REC_HEADER_BYTES + REC_SAMPLE_BYTES * samples.length);
  const view = new DataView(out.buffer);
  out.set(Array.from(REC_MAGIC, (ch) => ch.charCodeAt(0)));
  [REC_VERSION, REC_CHANNELS, rateHz, samples.length, 0, 0].forEach((word, k) => view.setUint32(8 + 4 * k, word, LE));
  samples.forEach((sample, i) => {
    const at = REC_HEADER_BYTES + REC_SAMPLE_BYTES * i;
    view.setUint32(at, sample.tUs, LE);
    AXES.forEach((axis, k) => view.setFloat32(at + 4 + 4 * k, sample[axis], LE));
  });
  return out;
}

/* { version, rateHz, count, samples } from a recording's bytes; throws,
 * saying what is wrong, for bytes that are not one. */
export function decodeRec(bytes) {
  if (bytes.length < REC_HEADER_BYTES) {
    throw new Error('rec: file shorter than header');
  }
  const magic = String.fromCharCode(...bytes.subarray(0, REC_MAGIC.length));
  if (magic !== REC_MAGIC) {
    throw new Error(`rec: bad magic "${magic}"`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = (at) => view.getUint32(at, LE);
  const version = word(8);
  if (version !== REC_VERSION) {
    throw new Error(`rec: unsupported version ${version}`);
  }
  const channels = word(12);
  if (channels !== REC_CHANNELS) {
    throw new Error(`rec: expected ${REC_CHANNELS} channels, got ${channels}`);
  }
  const rateHz = word(16);
  if (rateHz < 1 || rateHz > RATE_LIMIT_HZ) {
    throw new Error(`rec: implausible sample rate ${rateHz} Hz`);
  }
  const count = word(20);
  const size = REC_HEADER_BYTES + REC_SAMPLE_BYTES * count;
  if (bytes.length !== size) {
    throw new Error(`rec: expected ${size} bytes for ${count} samples, got ${bytes.length}`);
  }
  const samples = Array.from({ length: count }, (_, i) => {
    const at = REC_HEADER_BYTES + REC_SAMPLE_BYTES * i;
    const sample = { tUs: word(at) };
    AXES.forEach((axis, k) => {
      sample[axis] = view.getFloat32(at + 4 + 4 * k, LE);
    });
    return sample;
  });
  return {
    version, rateHz, count, samples,
  };
}
