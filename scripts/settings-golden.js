/*
 * settings-golden.js: the stored profile, read and reseated, held to a
 * record taken before src/ui/ui.js's settings code was rewritten.
 *
 *     node scripts/settings-golden.js            compare
 *     node scripts/settings-golden.js --record   write tests/fixtures/settings-golden.json
 *
 * The profile is the one thing every visit starts from, and the old code
 * repairs a lot on the way in: wrong types, retired aircraft and worlds,
 * legacy rates, a tune the seated aircraft does not have. A rewrite that
 * reads one of those differently loses somebody's settings. So this
 * reads a few hundred stored profiles, plain, broken, old and random,
 * through loadSettings(), seats every aircraft from several of them
 * through seatAirframe(), and walks the small exported helpers over their
 * ranges. Each result is canonical JSON. The record keeps the full text
 * of the hand written cases, so a difference there can be read, and a
 * hash of each generated one.
 *
 * Node has no localStorage and a navigator that is not a browser's: both
 * are stood in for here, the storage as a plain map, and touch and the
 * user agent set per case because the old code reads them.
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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FILE = join(root, 'tests', 'fixtures', 'settings-golden.json');
const RECORD = process.argv.includes('--record');

/* Storage: a Map behind the Storage interface the code uses. */
const store = new Map();
globalThis.localStorage = {
  get length() { return store.size; },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(String(k), String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => store.clear(),
};
const agent = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', maxTouchPoints: 0 };
Object.defineProperty(globalThis, 'navigator', { value: agent, configurable: true, writable: true });

const ui = await import('../src/ui/ui.js');
const { AIRFRAME_IDS } = await import('../configs/airframes.js');
const { FC_DUMP_KEY, FC_DUMP_AIRFRAME_KEY } = await import('../src/fc/dump.js');

/* Sorted keys all the way down, so key order is not a difference. */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return `<${v}>`;
  if (v === undefined) return '<undefined>';
  return v;
}
const text = (v) => JSON.stringify(canon(v));
const hash = (v) => createHash('sha256').update(text(v)).digest('hex').slice(0, 20);

function reset({ profile = undefined, extra = {}, touch = 0, ua = agent.userAgent } = {}) {
  store.clear();
  if (profile !== undefined) {
    store.set(ui.SETTINGS_KEY, typeof profile === 'string' ? profile : JSON.stringify(profile));
  }
  for (const [k, v] of Object.entries(extra)) store.set(k, v);
  agent.maxTouchPoints = touch;
  agent.userAgent = ua;
}
/* A profile that makes loadSettings throw is recorded as the throw: the
 * old code throws on a stored JSON null, and that is behaviour too. */
function loaded(opts) {
  reset(opts);
  let s;
  try {
    s = ui.loadSettings();
  } catch (e) {
    s = { threw: e.constructor.name };
  }
  return { settings: s, storage: Object.fromEntries([...store].sort()) };
}

/* A seeded generator, so the random profiles are the same every run. */
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const full = {};
const hashed = {};

/* Hand written profiles, kept in full. */
const defaults = loaded().settings;
const KEYS = Object.keys(defaults).sort();
const CASES = {
  'empty': {},
  'no-profile': undefined,
  'not-json': '{oops',
  'json-null': 'null',
  'json-array': '[1,2,3]',
  'touch-device': { opts: { touch: 5 } },
  'steam-deck': { opts: { ua: 'Mozilla/5.0 (X11; Linux x86_64) Steam Deck' } },
  'asked-cub': { airframeAsked: true, airframe: 'cub1400' },
  'unasked-cub': { airframeAsked: false, airframe: 'cub1400' },
  'asked-float': { airframeAsked: true, airframe: 'cub1400f' },
  'retired-whoop': { airframeAsked: true, airframe: 'whoop65' },
  'retired-wing': { airframeAsked: true, airframe: 'wing1000', tune: 'wing-manual' },
  'unknown-airframe': { airframeAsked: true, airframe: 'nope' },
  'bramor-wing-manual': { airframeAsked: true, airframe: 'bramor2300', tune: 'wing-manual' },
  'bramor-wing-stab': { airframeAsked: true, airframe: 'bramor2300', tune: 'wing-stab', wingDefaults: 1 },
  'sky-stab': { airframeAsked: true, airframe: 'sky1800', tune: 'sky-stab', wingDefaults: 1 },
  'retired-map': { map: 'city', freestyleMap: 'yellowstone' },
  'unknown-map': { map: 'moon', freestyleMap: 'track' },
  'freestyle-map': { map: 'swiss2', freestyleMap: 'alps' },
  'angle-mode': { flightMode: 'angle', wingView: 'chase' },
  'wing-view-los': { wingView: 'los' },
  'wing-view-ball': { wingView: 'ball' },
  'wing-view-fpv': { wingView: 'fpv', flightMode: 'acro' },
  'bad-enums': {
    flightMode: 'horizon', wingView: 'top', laps: 7, packVoltage: 4.0, renderScale: 33, fpsCap: 75,
    hudStyle: 'retro', ghost: 'ghostly', live: 'maybe', cameraFov: 1, latencyMode: 'fast',
  },
  'hud-by': { hudStyleBy: { interceptor: 'game', nope: 'osd', cub1400: 'retro', '7inch': 'avionics' } },
  'hud-by-junk': { hudStyleBy: 'osd' },
  'weight': { weight: 123 },
  'weight-junk': { weight: 'heavy' },
  'graphics-stored': { graphics: 'low' },
  'graphics-junk': { graphics: 'ultra' },
  'scoring-not-reset': { freestyleScoring: 'scored' },
  'scoring-reset': { freestyleScoring: 'scored', scoringReset: true },
  'legacy-rates': { rcRate: 1.2, superRate: 0.7, expo: 0.1 },
  'object-rates': { rates: { type: 'actual', roll: { rcRate: 70, srate: 670, expo: 0 }, pitch: { rcRate: 70, srate: 500, expo: 0 }, yaw: { rcRate: 70, srate: 400, expo: 0 } } },
  'floats-map': { floats: { timber1500: true, cub1400: 'yes', nope: true, '7inch': true } },
  'tune-for-other': { airframeAsked: true, airframe: 'interceptor', tune: 'not-a-tune' },
  'progress-existing': { progress: { v: 1 }, airframeAsked: true },
  'fc-dump-retired-stamp': { opts: { extra: { [FC_DUMP_KEY]: 'set roll_rc_rate = 7', [FC_DUMP_AIRFRAME_KEY]: 'whoop65' } } },
  'fc-dump-custom-tune': { airframeAsked: true, airframe: '7inch', tune: 'custom', opts: { extra: { [FC_DUMP_KEY]: 'x', [FC_DUMP_AIRFRAME_KEY]: '7inch' } } },
};
for (const [name, c] of Object.entries(CASES)) {
  const opts = c && typeof c === 'object' && !Array.isArray(c) && c.opts ? c.opts : {};
  let profile = c;
  if (c && typeof c === 'object' && c.opts) {
    const { opts: _, ...rest } = c;
    profile = Object.keys(rest).length ? rest : undefined;
  }
  full[`load:${name}`] = loaded({ ...opts, profile });
}

/* Every key of the defaults given a value of each wrong type. */
const WRONG = [null, 0, 1.5, -1, '', 'x', true, false, [], {}, [1], { a: 1 }];
for (const k of KEYS) {
  WRONG.forEach((w, i) => {
    hashed[`wrongtype:${k}:${i}`] = hash(loaded({ profile: { airframeAsked: true, [k]: w } }).settings);
  });
}

/* Every aircraft seated from a loaded profile for every aircraft, asked
 * and not, then reseated straight back. */
for (const from of AIRFRAME_IDS) {
  const base = loaded({ profile: { airframeAsked: true, airframe: from } }).settings;
  hashed[`loadas:${from}`] = hash(base);
  for (const to of AIRFRAME_IDS) {
    const s = JSON.parse(JSON.stringify(base));
    ui.seatAirframe(s, to);
    const there = text(s);
    ui.seatAirframe(s, from);
    hashed[`seat:${from}>${to}`] = hash({ there, back: s });
  }
}
/* Seating from a profile carrying power, parts and tuning for the plane,
 * the case that carries them across a float version. */
for (const [from, to] of [['timber1500', 'timber1500f'], ['timber1500f', 'timber1500'], ['cub1400', 'cub1400f'], ['cub1400f', 'cub1400']]) {
  const s = loaded({ profile: { airframeAsked: true, airframe: from, tuneFor: { [to]: 'zzz' } } }).settings;
  full[`seatfloat:${from}>${to}`] = ui.seatAirframe(s, to);
}

/* Random profiles: a mix of real values from other airframes' loaded
 * profiles and wrong ones, key by key. */
const pool = AIRFRAME_IDS.map((id) => loaded({ profile: { airframeAsked: true, airframe: id } }).settings);
const r = rng(20261006);
for (let n = 0; n < 300; n += 1) {
  const p = {};
  for (const k of KEYS) {
    const roll = r();
    if (roll < 0.45) continue;
    if (roll < 0.85) p[k] = pool[Math.floor(r() * pool.length)][k];
    else p[k] = WRONG[Math.floor(r() * WRONG.length)];
  }
  hashed[`random:${n}`] = hash(loaded({ profile: p, touch: r() < 0.2 ? 5 : 0 }));
}

/* The exported helpers over their ranges. */
const weights = [-1e9, -5, 0, 1, 59, 60, 61, 62.5, 63, 99, 100, 101, 102.4, 102.5, 139, 140, 141, 1e9, NaN, Infinity, '100', 'x', null, undefined];
full.clampWeight = weights.map((w) => [String(w), ui.clampWeight(w)]);
full.gravityScaleFor = AIRFRAME_IDS.map((id) => [id, weights.map((w) => ui.gravityScaleFor(w, id))]);
full.hudStyleFor = AIRFRAME_IDS.map((id) => [id,
  ui.hudStyleFor({ hudStyle: 'osd', hudStyleBy: {} }, id),
  ui.hudStyleFor({ hudStyle: 'game', hudStyleBy: { [id]: 'osd' } }, id),
  ui.hudStyleFor({ hudStyle: 'game' }, id)]);
const floatInputs = [null, 'x', [], { timber1500: true }, { timber1500: false, cub1400: true }, { cub1400: 1, nope: true, timber1500f: true }];
full.normaliseFloats = AIRFRAME_IDS.map((id) => [id, floatInputs.map((f) => ui.normaliseFloats(f, id))]);
full.withFloats = AIRFRAME_IDS.map((id) => [id,
  ui.withFloats({ floats: { [id]: true } }, id),
  ui.withFloats({ floats: { [id]: false } }, id),
  ui.withFloats({}, id)]);
full.constants = Object.fromEntries(Object.entries(ui).filter(([, v]) => typeof v !== 'function' && typeof v !== 'object' || Array.isArray(v)));

const got = { full: canon(full), hashed };
const count = Object.keys(full).length + Object.keys(hashed).length;
if (RECORD) {
  writeFileSync(FILE, `${JSON.stringify(got, null, 1)}\n`);
  console.log(`wrote ${count} records to ${FILE}`);
  process.exit(0);
}
if (!existsSync(FILE)) {
  console.log(`FAIL no record at ${FILE}`);
  process.exit(1);
}
const want = JSON.parse(readFileSync(FILE, 'utf8'));
const bad = [];
for (const k of new Set([...Object.keys(want.full), ...Object.keys(got.full)])) {
  if (JSON.stringify(want.full[k]) !== JSON.stringify(got.full[k])) bad.push(k);
}
for (const k of new Set([...Object.keys(want.hashed), ...Object.keys(got.hashed)])) {
  if (want.hashed[k] !== got.hashed[k]) bad.push(k);
}
if (bad.length) {
  console.log(`FAIL ${bad.length} of ${count} records differ: ${bad.slice(0, 15).join(', ')}`);
  for (const k of bad.filter((x) => x in got.full).slice(0, 2)) {
    const a = want.full[k];
    const b = got.full[k];
    const keys = a && b && typeof a === 'object' ? Object.keys({ ...a, ...b }).filter((x) => JSON.stringify(a[x]) !== JSON.stringify(b[x])) : [];
    console.log(`  ${k}: ${keys.length ? `differs in ${keys.join(', ')}` : `${JSON.stringify(a).slice(0, 200)} vs ${JSON.stringify(b).slice(0, 200)}`}`);
  }
  process.exit(1);
}
console.log(`ok ${count} records equal to the record`);
