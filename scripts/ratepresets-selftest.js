/*
 * ratepresets-selftest.js: pin everything configs/ratepresets.js exports.
 * Plain Node, no browser. Run with npm run ratepresets:selftest.
 *
 * Presets live in the pilot's browser storage under one versioned key, so
 * what is written there, what is read back from a corrupt or older entry,
 * and what the Rates screen is told are all behaviour. This runs random
 * sessions of saves, deletes and lookups against an in-memory storage that
 * can refuse writes or be corrupted, with a fixed clock and a seeded
 * random source. Generated preset ids are recorded by order of first
 * appearance rather than by value, so the test pins that ids are stable,
 * distinct and in the rp-xxxxxxxx form without pinning how many random
 * numbers were drawn to make them. The digest was recorded from the code
 * this file was written to hold still; see scripts/lib/transcript.js for
 * how to read a failure.
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

import { canon, pick, seeded, transcript } from './lib/transcript.js';

const KEY = 'webfpv.rates.library.v1';
const store = new Map();
const faults = { refuseWrites: false, throwOnRead: false };
globalThis.localStorage = {
  getItem(k) {
    if (faults.throwOnRead) throw new Error('SecurityError');
    return store.has(k) ? store.get(k) : null;
  },
  setItem(k, v) {
    if (faults.refuseWrites) throw new Error('QuotaExceededError');
    store.set(k, String(v));
  },
  removeItem(k) { store.delete(k); },
};

Math.random = seeded(0x2a7e);
const RealDate = Date;
let clock = RealDate.UTC(2026, 9, 6, 12, 0, 0);
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super((clock += 1000 * 37));
  }
};

const R = await import('../configs/ratepresets.js');
const { RATE_DEFAULTS, TOUCH_RATE_DEFAULTS, profileForType } = await import('../configs/rates.js');

const t = transcript();
const rand = seeded(0x7e57);

const aliases = new Map();
const anonymise = (text) => text.replace(/rp-[0-9a-f]{8}/g, (id) => {
  if (!aliases.has(id)) aliases.set(id, `rp#${aliases.size}`);
  return aliases.get(id);
});
const rec = (label, fn) => t.rec(anonymise(label), () => {
  const out = fn();
  return { out: anonymise(canon(out)) };
});
const snapshot = (label) => t.note(anonymise(label), anonymise(String(store.get(KEY) ?? '<none>')));

for (const name of Object.keys(R).sort()) t.note(`export ${name}`, R[name]);

const NAMES = ['Bando', 'bando', '  Bando  ', 'BANDO', 'Field', 'Indoor', 'Spec race', '', '   ', null, undefined, 42,
  'A name that is far too long to be stored in full here', 'x'.repeat(32), 'y'.repeat(33), 'Ñandutí', 'Field '];
const PROFILES = [RATE_DEFAULTS, TOUCH_RATE_DEFAULTS, profileForType('KISS', {}), profileForType('RACEFLIGHT', {}),
  { type: 'ACTUAL', roll: { rcRate: 9, srate: 80, expo: 20 }, throttleCap: 65 }, { type: 'BOGUS' }, undefined, null];
const CORRUPT = ['not json', '[]', '"text"', '7', 'null', '{}',
  JSON.stringify({ a: { name: '  Spaced  ', rates: { type: 'KISS' } }, b: { name: '', rates: {} }, c: null, d: 'x',
    e: { name: 'No date', id: '', rates: RATE_DEFAULTS }, f: { name: 'Dated', id: 'kept-id', savedUtc: '2030-01-01T00:00:00.000Z' },
    g: { name: 5 }, 7: { name: 'Numbered', id: '7', savedUtc: 3 } }),
  JSON.stringify({ x: { name: 'Same time', id: 'x', savedUtc: '2026-01-01' }, y: { name: 'same time', id: 'y', savedUtc: '2026-01-01' } })];

const knownIds = () => {
  try {
    return Object.keys(JSON.parse(store.get(KEY) ?? '{}') ?? {});
  } catch {
    return [];
  }
};

for (let session = 0; session < 60; session += 1) {
  store.clear();
  faults.refuseWrites = false;
  faults.throwOnRead = false;
  if (rand() < 0.3) store.set(KEY, pick(rand, CORRUPT));
  snapshot(`session ${session} start`);
  for (let step = 0; step < 20; step += 1) {
    const op = rand();
    if (op < 0.35) {
      const name = pick(rand, NAMES);
      const rates = pick(rand, PROFILES);
      rec(`save ${canon(name)} ${canon(rates)}`, () => R.saveRatePreset(name, rates));
    } else if (op < 0.5) {
      const id = rand() < 0.75 ? pick(rand, [...knownIds(), 'nope']) : pick(rand, [undefined, null, '', 'nope']);
      rec(`delete ${canon(id)}`, () => R.deleteRatePreset(id));
    } else if (op < 0.62) {
      rec('list', () => R.listRatePresets());
    } else if (op < 0.72) {
      const id = rand() < 0.75 ? pick(rand, [...knownIds(), 'nope']) : pick(rand, [undefined, null, '', 0]);
      rec(`byId ${canon(id)}`, () => R.ratePresetById(id));
    } else if (op < 0.82) {
      const rates = pick(rand, PROFILES);
      rec(`matching ${canon(rates)}`, () => R.presetMatching(rates));
    } else if (op < 0.92) {
      const name = pick(rand, NAMES);
      rec(`named ${canon(name)}`, () => R.presetNamed(name));
    } else if (op < 0.96) {
      faults.refuseWrites = !faults.refuseWrites;
      t.note('refuseWrites', faults.refuseWrites);
    } else {
      faults.throwOnRead = !faults.throwOnRead;
      t.note('throwOnRead', faults.throwOnRead);
    }
    snapshot('  stored');
  }
}

t.finish('configs/ratepresets.js', 'b61bcd36d497ce63ade966aa68ef519fe84b2b49a2275665182c8762435daab0');
