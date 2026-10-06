/*
 * pids-selftest.js: pin everything configs/pids.js exports. Plain Node, no
 * browser. Run with npm run pids:selftest.
 *
 * The PID adjustment is stored per tune in the pilot's settings and the
 * text pidsDiffFor emits is part of the composed config, so best laps are
 * keyed by it. Two kinds of record: the pure functions over generated
 * stored blobs, well formed and not, and random sequences of the editing
 * helpers (which change the blob in place) with the blob, the CLI text
 * and the summary recorded after every step. The digest was recorded from
 * the code this file was written to hold still; see
 * scripts/lib/transcript.js for how to read a failure.
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

import * as P from '../configs/pids.js';
import { canon, pick, seeded, transcript } from './lib/transcript.js';

const t = transcript();
const rand = seeded(0x91d5);

for (const name of Object.keys(P).sort()) t.note(`export ${name}`, P[name]);

// A fixed list rather than the registry's, so adding a tune elsewhere does
// not move this digest. The order is deliberately not registry order.
// Callers only ever pass registry ids; 'bogus' stands for a retired one.
const TUNES = ['custom', 'betaflight-interceptor', 'zagi-acro', 'betaflight-7inch', 'wing-stab', 'bogus'];
const VALUES = [undefined, null, '', NaN, Infinity, -1, -0, 0, 0.5, 1, 29, 30, 31, 99.5, 100, 185, 199.6, 200,
  201, 249, 250, 251, 999, 1000, 1001, '120', ' 45 ', 'abc', true, [], {}];
const SLIDER_NAMES = [...P.SLIDER_KEYS, 'bogus', 'constructor'];

const randomTable = () => {
  if (rand() < 0.1) return pick(rand, [undefined, null, 5, 'x', []]);
  const table = {};
  for (const axis of P.PID_AXES) {
    if (rand() < 0.05) continue;
    table[axis] = {};
    for (const f of P.PID_FIELDS) {
      table[axis][f] = rand() < 0.85 ? Math.floor(rand() * 300) : pick(rand, VALUES);
    }
  }
  return table;
};
const randomEntry = () => {
  if (rand() < 0.08) return pick(rand, [undefined, null, 3, 'expert', []]);
  const e = {};
  if (rand() < 0.6) e.mode = pick(rand, ['expert', 'sliders', 'other', undefined]);
  if (rand() < 0.8) {
    e.sliders = rand() < 0.1 ? pick(rand, [null, 'x', []]) : {};
    for (const k of SLIDER_NAMES) if (e.sliders && typeof e.sliders === 'object' && rand() < 0.4) e.sliders[k] = pick(rand, VALUES);
  }
  if (rand() < 0.4) e.pids = randomTable();
  return e;
};
const randomBlob = () => {
  if (rand() < 0.05) return pick(rand, [undefined, null, 1, 'x', []]);
  const blob = {};
  for (const id of TUNES) if (rand() < 0.4) blob[id] = randomEntry();
  return blob;
};

for (let i = 0; i < 500; i += 1) {
  const blob = randomBlob();
  const before = canon(blob);
  const tag = `b${i} ${before}`;
  t.rec(`normalisePids ${tag}`, () => P.normalisePids(blob));
  for (const id of TUNES) {
    t.rec(`pidsEntry ${tag} ${id}`, () => P.pidsEntry(blob, id));
    t.rec(`pidsDiffFor ${tag} ${id}`, () => P.pidsDiffFor(blob, id));
    t.rec(`pidsSummary ${tag} ${id}`, () => P.pidsSummary(blob, id));
    t.rec(`pidsAdjusted ${tag} ${id}`, () => P.pidsAdjusted(blob, id));
  }
  t.rec(`unmutated ${tag}`, () => canon(blob) === before);
}

for (const f of [...P.PID_FIELDS, 'bogus']) {
  for (const axis of [...P.PID_AXES, 'x']) t.rec(`pidCliKey ${f} ${axis}`, () => P.pidCliKey(f, axis));
}

// Editing sessions: what a pilot does on the PIDs screen, in random order.
// The helpers edit a blob loadSettings has already normalised, so that is
// what a session starts from.
for (let s = 0; s < 150; s += 1) {
  const state = rand() < 0.3 ? P.normalisePids(randomBlob()) : {};
  t.note(`session ${s} start`, state);
  for (let step = 0; step < 25; step += 1) {
    const id = pick(rand, TUNES.slice(0, 5));
    const op = rand();
    let label;
    if (op < 0.55) {
      // Only real slider keys: the screen never passes another, and what an
      // unknown one does is not part of the contract.
      const key = pick(rand, P.SLIDER_KEYS);
      const value = rand() < 0.7 ? Math.floor(rand() * 230) : pick(rand, VALUES);
      const tuneValue = pick(rand, [undefined, null, 100, value, 90, 130]);
      label = `setPidSlider ${id} ${key} ${canon(value)} ${canon(tuneValue)}`;
      t.rec(label, () => P.setPidSlider(state, id, key, value, tuneValue));
    } else if (op < 0.8) {
      const on = pick(rand, [true, false, 1, 0]);
      const seed = pick(rand, [undefined, null, P.STOCK_PIDS, randomTable()]);
      label = `setPidsExpert ${id} ${canon(on)} ${canon(seed)}`;
      t.rec(label, () => P.setPidsExpert(state, id, on, seed));
    } else if (op < 0.88) {
      label = `clearPidsFor ${id}`;
      t.rec(label, () => P.clearPidsFor(state, id));
    } else {
      label = `pidsEntry edit ${id}`;
      t.rec(label, () => {
        const e = P.pidsEntry(state, id);
        if (e && e.pids && e.pids.roll) e.pids.roll.p = 77;
        return e;
      });
    }
    t.note(`  state`, state);
    t.rec(`  diff ${id}`, () => P.pidsDiffFor(state, id));
    t.rec(`  summary ${id}`, () => P.pidsSummary(state, id));
  }
}

for (const target of [undefined, null, 'x', 5]) {
  t.rec(`clearPidsFor ${canon(target)}`, () => P.clearPidsFor(target, 'custom'));
}

t.finish('configs/pids.js', '7ef119a69d4a1cb24ff65868da52f59b8bf3c59fa588cb80611508ac5a6bb17f');
