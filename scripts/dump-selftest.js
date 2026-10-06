/*
 * dump-selftest.js: pin everything src/fc/dump.js exports, over three real
 * tunes and a generated corpus of awkward CLI text. Plain Node, no
 * browser. Run with npm run dump:selftest.
 *
 * The tunes are copies in tests/fixtures/dump-corpus, taken from configs/
 * when this was written, so retuning an aircraft does not move the digest.
 *
 * composeConfig's text is what the module boots on, and stored best laps
 * are keyed by it, so a single changed byte in a composed config is a
 * regression even when the module would fly it the same. The module
 * accessors run against a fake export table that records every call, so
 * the buffer handling is pinned without a WASM build. The digest was
 * recorded from the code this file was written to hold still; see
 * scripts/lib/transcript.js for how to read a failure.
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

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as D from '../src/fc/dump.js';
import { RATE_DEFAULTS, TOUCH_RATE_DEFAULTS, profileForType } from '../configs/rates.js';
import { pick, seeded, transcript } from './lib/transcript.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const t = transcript();
const rand = seeded(0xd0e5);

for (const name of Object.keys(D).sort()) t.note(`export ${name}`, D[name]);

const LINES = [
  '', ' ', '\t', '# a comment', '#set roll_rc_rate = 9', 'diff all', 'save', 'batch start', 'batch end',
  'profile 0', 'profile 1', 'rateprofile 0', 'rateprofile 2', '  rateprofile 1',
  'set roll_rc_rate = 7', 'set roll_rc_rate=12', '  set pitch_srate =  80  ', '\tset yaw_expo = 10 # trailing',
  'set rates_type = BETAFLIGHT', 'set rates_type = ACTUAL', 'set rates_type = bogus',
  'set thr_mid = 40', 'set thr_expo = 30', 'set throttle_limit_type = SCALE', 'set throttle_limit_percent = 65',
  'set roll_rate_limit = 1998', 'set quickrates_rc_expo = ON',
  'set p_roll = 45', 'set p_roll = 47', 'set i_pitch = 80', 'set d_min_roll = 30', 'set dterm_lpf1_static_hz = 75',
  'set simplified_master_multiplier = 120', 'set simplified_d_gain = 90', 'set simplified_pids_mode = RPY',
  'simplified_tuning apply', '  simplified_tuning apply  ', 'simplified_tuning disable',
  'set rpm_filter_weights = 100,80,60', 'set rpm_filter_weights = 50', 'set rpm_filter_weights = ,,',
  'set rpm_filter_weights = 10, 20 ,30,40', 'set rpm_filter_weights', 'set rpm_filter_weights_2 = 70',
  'set rpm_filter_weights_1 = 90', 'set rpm_filter_weights_3 =',
  'feature AIRMODE', 'feature -AIRMODE', ' feature  AIRMODE', 'feature ANTI_GRAVITY', 'feature -ANTI_GRAVITY',
  'set', 'set ', 'set =5', 'set foo', 'set foo =', 'set foo = bar baz', 'set foo bar = 3', 'setx = 1',
  'SET roll_rc_rate = 3', 'set roll_rc_rate = ', 'get roll_rc_rate', 'aux 0 0 0 1700 2100 0 0',
];

const randomText = () => {
  const n = Math.floor(rand() * 14);
  const lines = [];
  for (let i = 0; i < n; i += 1) lines.push(pick(rand, LINES));
  const eol = rand() < 0.15 ? '\r\n' : '\n';
  return lines.join(eol) + pick(rand, ['', '', '\n', '\n\n', eol, '\r']);
};

const corpus = join(root, 'tests/fixtures/dump-corpus');
const diffs = readdirSync(corpus).sort().map((f) => readFileSync(join(corpus, f), 'utf8'));
const texts = [undefined, null, '', '\n', '\r\n', ...diffs];
for (let i = 0; i < 700; i += 1) texts.push(randomText());

const KEYS = ['roll_rc_rate', 'p_roll', 'rpm_filter_weights', 'rpm_filter_weights_2', 'simplified_d_gain',
  'thr_mid', 'foo', 'set', 'missing_key'];
const VALUES = ['7', 45, '100,80', '', 'ON', 0];
const FEATURES = ['AIRMODE', 'ANTI_GRAVITY', 'MOTOR_STOP', ''];
const PROFILES = [RATE_DEFAULTS, TOUCH_RATE_DEFAULTS, profileForType('BETAFLIGHT', {}),
  { type: 'KISS', throttleCap: 65, thrMid: 30, thrExpo: 40 }, undefined];
const PIDS = ['', undefined, '\n# PIDs\nset simplified_master_multiplier = 110\nsimplified_tuning apply\n', 'set p_roll = 50'];
const POLICIES = [D.RATES_KEEP, D.RATES_DUMP, undefined, 'other'];

texts.forEach((text, i) => {
  const tag = `t${i}`;
  t.note(tag, text);
  t.rec(`parseCli ${tag}`, () => D.parseCli(text));
  t.rec(`cliMap ${tag}`, () => D.cliMap(text));
  t.rec(`dumpCarriesRates ${tag}`, () => D.dumpCarriesRates(text));
  t.rec(`tuneBody ${tag}`, () => D.tuneBody(text));
  t.rec(`ensureSimplifiedApply ${tag}`, () => D.ensureSimplifiedApply(text));
  t.rec(`exportCli ${tag}`, () => D.exportCli(text));
  t.rec(`ratesFromDump ${tag}`, () => D.ratesFromDump(text));
  t.rec(`expandRpmWeights ${tag}`, () => D.expandRpmWeights(text));
  for (const key of KEYS) t.rec(`cliGet ${tag} ${key}`, () => D.cliGet(text, key));
  for (const name of FEATURES) {
    t.rec(`featureEnabled ${tag} ${name}`, () => D.featureEnabled(text, name));
    t.rec(`setFeatureLine ${tag} ${name} on`, () => D.setFeatureLine(text, name, true));
    t.rec(`setFeatureLine ${tag} ${name} off`, () => D.setFeatureLine(text, name, 0));
  }
  KEYS.forEach((key, k) => {
    t.rec(`setCliValue ${tag} ${key}`, () => D.setCliValue(text, key, VALUES[(i + k) % VALUES.length]));
  });
  t.rec(`composeConfig ${tag}`, () => D.composeConfig(text, PROFILES[i % PROFILES.length]));
  t.rec(`composeConfig ${tag} full`, () => D.composeConfig(
    text, PROFILES[(i + 1) % PROFILES.length], POLICIES[i % POLICIES.length], PIDS[i % PIDS.length]));
});

/*
 * A stand-in for the module's export table: a byte heap with a bump
 * allocator, and sim_bf_dump / sim_bf_get that answer from a script of
 * replies. What is pinned is the result and that every buffer allocated
 * was freed exactly once, not the buffer sizes asked for along the way.
 */
function fakeSim(replies, { noMalloc = false, missing = '', key = '' } = {}) {
  const memory = { buffer: new ArrayBuffer(1 << 20) };
  const live = new Set();
  const log = { leaked: 0, badFrees: 0 };
  let top = 8;
  const heap = () => new Uint8Array(memory.buffer);
  const e = {
    memory,
    malloc(n) {
      if (noMalloc) return 0;
      const p = top;
      top += n + 8;
      live.add(p);
      return p;
    },
    free(p) {
      if (!live.delete(p)) log.badFrees += 1;
    },
    sim_bf_dump(ptr, size) {
      const r = replies.shift();
      if (typeof r !== 'string') return r;
      heap().set(new TextEncoder().encode(r.slice(0, size)), ptr);
      return r.length;
    },
    sim_bf_get(kp, op, cap) {
      let k = '';
      for (let i = kp; heap()[i] !== 0; i += 1) k += String.fromCharCode(heap()[i]);
      const r = replies.shift();
      if (k !== key) throw new Error(`sim_bf_get read key ${k}`);
      if (typeof r !== 'string') return r;
      heap().set(new TextEncoder().encode(r.slice(0, cap)), op);
      return r.length;
    },
  };
  if (missing) delete e[missing];
  const freed = () => ({ ...log, leaked: live.size });
  return { sim: { e }, freed };
}

const big = (n) => 'set x = 1\n'.repeat(Math.ceil(n / 10)).slice(0, n);
const DUMPS = [
  [[''], undefined], [['set a = 1\n'], undefined], [[big(100), big(100)], 64], [[big(64), big(64)], 64], [[big(63)], 64],
  [[big(200), big(200)], 64], [[big(5000), big(5000)], 100], [[big(10), big(500), big(500)], 8],
  [[-1], undefined], [[big(300), big(300), big(300), big(300), big(300)], 16], [[big(70000), big(70000)], undefined],
];
DUMPS.forEach(([replies, cap], i) => {
  const { sim, freed } = fakeSim([...replies]);
  t.rec(`moduleDump ${i}`, () => (cap === undefined ? D.moduleDump(sim) : D.moduleDump(sim, cap)));
  t.note(`moduleDump ${i} buffers`, freed());
});
for (const opts of [{ noMalloc: true }, { missing: 'sim_bf_dump' }]) {
  const { sim, freed } = fakeSim(['x'], opts);
  t.rec(`moduleDump ${JSON.stringify(opts)}`, () => D.moduleDump(sim));
  t.note(`moduleDump ${JSON.stringify(opts)} buffers`, freed());
}

const GETS = [['p_roll', '45'], ['rates_type', 'ACTUAL'], ['missing', -1], ['long', 'y'.repeat(100)],
  ['edge', 'z'.repeat(63)], ['edge64', 'w'.repeat(64)], ['empty', ''], ['', '0']];
for (const [key, reply] of GETS) {
  const { sim, freed } = fakeSim([reply], { key });
  t.rec(`moduleGet ${key}`, () => D.moduleGet(sim, key));
  t.note(`moduleGet ${key} buffers`, freed());
}
for (const opts of [{ noMalloc: true }, { missing: 'sim_bf_get' }]) {
  const { sim, freed } = fakeSim(['1'], { ...opts, key: 'p_roll' });
  t.rec(`moduleGet ${JSON.stringify(opts)}`, () => D.moduleGet(sim, 'p_roll'));
  t.note(`moduleGet ${JSON.stringify(opts)} buffers`, freed());
}

// The storage rename: a pilot's saved dump under the old webfpv.* keys
// must reach the new keys once, a newer value under the new key must win,
// a second run must change nothing, and a refused write must keep the old
// key for the next load.
function memoryStorage(seed, refuse = false) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      if (refuse) throw new Error('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k) => { map.delete(k); },
  };
}
const MIGRATIONS = [
  {},
  { 'webfpv.fc.v1': 'set p_roll = 50\n', 'webfpv.fc.airframe.v1': '7inch', other: 'x' },
  { 'webfpv.fc.v1': 'old dump\n', [D.FC_DUMP_KEY]: 'new dump\n' },
  { 'webfpv.fc.airframe.v1': '10inch' },
  { 'webfpv.fc.v1': '' },
];
MIGRATIONS.forEach((seed, i) => {
  const storage = memoryStorage(seed);
  D.moveRenamedDumpKeys(storage);
  t.note(`migrate ${i} once`, Object.fromEntries(storage.map));
  const once = JSON.stringify([...storage.map]);
  D.moveRenamedDumpKeys(storage);
  t.rec(`migrate ${i} twice is a no-op`, () => JSON.stringify([...storage.map]) === once);
});
{
  const storage = memoryStorage(MIGRATIONS[1], true);
  t.rec('migrate refused write', () => D.moveRenamedDumpKeys(storage));
  t.note('migrate refused write keeps', Object.fromEntries(storage.map));
}

t.finish('src/fc/dump.js', '65e0ff873fd4e10c7a3704adbe11b0308233c674c233ed0bd14d902b2aa6fa85');
