/*
 * gen-baseline.js: write tests/inputs/baseline.rec, the committed 30 second
 * stick recording (250 Hz, rate from tests/thresholds.json) that every
 * replay check plays.
 *
 *     node tests/gen/gen-baseline.js [--force]   (npm run gen:baseline)
 *
 * Each axis is a table of [seconds, stick] corners joined by straight
 * lines. The sampling uses only IEEE 754 add, subtract, multiply and
 * divide, which every engine rounds the same way, so the bytes do not
 * depend on the machine: no transcendental functions, no randomness, no
 * clock. Regenerating baseline.rec changes every replay digest, which is
 * why the script refuses to overwrite it without --force.
 *
 * What the 30 s flight does:
 *   0 to 4 s       hover with a small roll and pitch jiggle
 *   4 to 7 s       punch-out at full throttle
 *   7 to 9.5 s     drop, catch, back to hover
 *   10 to 11 s     small right yaw
 *   12 to 12.8 s   full right roll
 *   15.5 to 17.2 s punch, full back flip, catch
 *   20 to 20.6 s   full left roll
 *   21.5 to 22.5 s small left yaw
 *   24 to 28 s     low throttle sink into its own propwash, roll jiggle
 *   28 to 30 s     catch and settle
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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { encodeRec } from '../lib/recfile.js';

const SECONDS = 30;
const target = fileURLToPath(new URL('../inputs/baseline.rec', import.meta.url));
const thresholds = fileURLToPath(new URL('../thresholds.json', import.meta.url));

/* Corners per axis, seconds ascending; before the first and after the last
 * the stick holds that corner's value. */
const PROFILE = {
  roll: [
    [0.5, 0], [0.75, 0.02], [1.25, -0.02], [1.75, 0.02], [2.25, -0.02], [2.75, 0.02], [3.25, -0.02], [3.5, 0],
    [12, 0], [12.05, 1], [12.75, 1], [12.8, 0],
    [20, 0], [20.05, -1], [20.55, -1], [20.6, 0],
    [24.5, 0], [25, 0.03], [25.75, -0.03], [26.5, 0.03], [27.25, -0.03], [27.6, 0],
  ],
  pitch: [
    [0.6, 0], [0.9, 0.02], [1.5, -0.02], [2.1, 0.02], [2.7, -0.02], [3.3, 0],
    [16, 0], [16.05, 1], [16.6, 1], [16.65, 0],
  ],
  yaw: [
    [10, 0], [10.2, 0.15], [10.8, 0.15], [11, 0],
    [21.5, 0], [21.7, -0.2], [22.3, -0.2], [22.5, 0],
  ],
  throttle: [
    [3.9, 0.26], [4, 1], [7, 1], [7.15, 0.18], [9, 0.18], [9.5, 0.3],
    [11.9, 0.3], [12, 0.5], [12.9, 0.5], [13.2, 0.3],
    [15.4, 0.3], [15.5, 0.45], [16, 0.45], [16.05, 0.42], [16.6, 0.42], [16.7, 0.55], [17.2, 0.55], [17.5, 0.28],
    [19.9, 0.28], [20, 0.45], [20.6, 0.45], [20.9, 0.3],
    [23.9, 0.3], [24.1, 0.08], [28, 0.08], [28.1, 0.45], [29, 0.32], [29.5, 0.27],
  ],
};

function stickAt(corners, t) {
  if (t <= corners[0][0]) return corners[0][1];
  const next = corners.findIndex(([at]) => at > t);
  if (next < 0) return corners[corners.length - 1][1];
  const [t0, v0] = corners[next - 1];
  const [t1, v1] = corners[next];
  return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
}

function record(rateHz) {
  const samples = [];
  for (let i = 0; i < SECONDS * rateHz; i++) {
    const t = i / rateHz;
    const sample = { tUs: (i * 1000000) / rateHz };
    for (const [axis, corners] of Object.entries(PROFILE)) sample[axis] = stickAt(corners, t);
    samples.push(sample);
  }
  return samples;
}

function main() {
  if (existsSync(target) && !process.argv.slice(2).includes('--force')) {
    console.error(
      'gen:baseline: tests/inputs/baseline.rec already exists and is a committed, byte-stable artifact. Use --force only for Loop A regeneration.',
    );
    process.exit(1);
  }
  const rateHz = JSON.parse(readFileSync(thresholds, 'utf8')).replay.input_sample_hz.value;
  const samples = record(rateHz);
  const bytes = encodeRec(rateHz, samples);
  writeFileSync(target, bytes);
  console.log(`gen:baseline: wrote ${target}`);
  console.log(`gen:baseline: ${samples.length} samples at ${rateHz} Hz, ${bytes.length} bytes`);
  console.log(`gen:baseline: sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
}

main();
