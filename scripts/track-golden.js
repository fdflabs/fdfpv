/*
 * track-golden.js: src/game/track.js held to the exact outputs it gave when
 * tests/fixtures/track-golden.json was written. npm run track:golden.
 *
 * The module is small but every number in it is multiplied into something
 * else: GATE_SCALE and gateScaleFor size every built obstacle, the built
 * tube is what the scene draws and the colliders follow, and the two lap
 * functions are what a race reports as best lap and best three. So this pins
 * every export bit for bit; the UTT3 record in English and in Spanish,
 * because its text is looked up in the string table when the module loads
 * and a rewrite must look it up at the same moment; gateScaleFor over every
 * class a document can carry and over the awkward keys a plain object lookup
 * answers differently from a Map or a switch; and the lap functions over the
 * spec's edge vectors plus many seeded logs in the shape Race writes them.
 *
 * The record is written with --record; see scripts/lib/golden.js. Write it
 * again only on purpose, with the reason in the pull request.
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

import { readFileSync } from 'node:fs';
import { canon, goldenMain, seeded } from './lib/golden.js';
import { setLocale, useLocale } from '../src/strings/index.js';
import * as units from '../src/units.js';
import { trackClassOf } from '../src/trackbuilder/elements.js';

const FIXTURE = new URL('../tests/fixtures/track-golden.json', import.meta.url);

/* The same module loaded twice, once under each locale. The query string
 * makes the second load a separate instance; the string table is shared, so
 * the English instance must finish loading before the locale flips. */
const en = await import('../src/game/track.js');
await useLocale('es');
const es = await import('../src/game/track.js?locale=es');
setLocale('en');

/* The track documents committed to the repo: the classes real callers hand
 * to gateScaleFor come from these, through trackClassOf. */
const DOCS = [
  'scripts/gatecards-track.json',
  'docs/itaipu-courses/itaipu-run.json',
  'docs/itaipu-courses/powerhouse.json',
  'tests/fixtures/map-track-v4.json',
];

/* Written out rather than read from Object.getOwnPropertyNames, so a node
 * that grows a new Object.prototype member does not change the case. */
const PROTO_NAMES = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
  'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__defineSetter__', '__lookupGetter__',
  '__lookupSetter__'];

function exportsCase(m) {
  return (s) => {
    s.say('exports', Object.keys(m).sort().map((k) => `${k}:${typeof m[k]}`));
    s.say('arity', {
      gateScaleFor: m.gateScaleFor.length,
      fastestLap: m.fastestLap.length,
      fastestThreeConsecutive: m.fastestThreeConsecutive.length,
    });
  };
}

function constants(s) {
  s.say('GATE_SCALE', en.GATE_SCALE);
  s.say('FRAME_TUBE_OD', en.FRAME_TUBE_OD);
  s.say('BUILT_FRAME_TUBE_OD', en.BUILT_FRAME_TUBE_OD);
  s.say('identities', {
    tubeIsUnits: en.FRAME_TUBE_OD === units.FRAME_TUBE_OD,
    builtIsProduct: en.BUILT_FRAME_TUBE_OD === units.FRAME_TUBE_OD * en.GATE_SCALE,
    gateScaleIsLiteral: en.GATE_SCALE === 1.15,
    fullIsGateScale: en.gateScaleFor('full') === en.GATE_SCALE,
    sameAcrossInstances: en.GATE_SCALE === es.GATE_SCALE && en.BUILT_FRAME_TUBE_OD === es.BUILT_FRAME_TUBE_OD,
  });
  /* What the scene derives from the tube (render/scene.js): its radius and
   * the level pitch over a 5 ft opening built at scale. */
  s.say('tubeRadius', en.BUILT_FRAME_TUBE_OD * 0.5);
  s.say('levelPitch', 5 * units.FT * en.GATE_SCALE + en.BUILT_FRAME_TUBE_OD);
}

function descriptors(obj) {
  const out = {};
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(obj))) {
    out[k] = 'value' in d ? `data${d.writable ? ' w' : ''}${d.enumerable ? ' e' : ''}${d.configurable ? ' c' : ''}`
      : 'accessor';
  }
  return out;
}

function utt3Case(m) {
  return (s) => {
    const u = m.UTT3;
    s.say('UTT3', u);
    s.say('stable', m.UTT3 === u && m.UTT3.gates === u.gates);
    s.say('frozen', {
      utt3: Object.isFrozen(u), gates: Object.isFrozen(u.gates), gate0: Object.isFrozen(u.gates[0]),
      dimensions: Object.isFrozen(u.dimensions), extensible: Object.isExtensible(u),
    });
    s.say('proto', Object.getPrototypeOf(u) === Object.prototype && Array.isArray(u.gates));
    s.say('descriptors', descriptors(u));
    s.say('gateDescriptors', u.gates.map(descriptors));
    s.say('dimensionDescriptors', descriptors(u.dimensions));
    /* The zeros are +0; canon spells -0 apart, so the record already holds
     * that, but say it plainly for whoever reads the dump. */
    s.say('zeros', u.gates.map((g) => [Object.is(g.x, 0), Object.is(g.z, 0)]));
  };
}

function gateScaleStrings(s) {
  s.call('gateScaleFor()', () => en.gateScaleFor());
  for (const c of ['full', 'wing', 'FULL', 'Full', 'Wing', 'micro', 'whoop', '', ' full', 'full ', 'wing\u0000',
    undefined, null]) {
    s.call(`gateScaleFor(${canon(c)})`, () => en.gateScaleFor(c));
  }
  s.call('gateScaleFor(full, wing)', () => en.gateScaleFor('full', 'wing'));
  s.call('gateScaleFor(wing, full)', () => en.gateScaleFor('wing', 'full'));
}

/* A plain object lookup answers inherited names with the inherited member;
 * the record holds what each one returns and which object it is. */
function gateScaleProto(s) {
  for (const name of PROTO_NAMES) {
    const v = s.call(`gateScaleFor(${name})`, () => en.gateScaleFor(name));
    s.say(`  typeof`, typeof v);
    s.say(`  is`, {
      Object: v === Object,
      ObjectPrototype: v === Object.prototype,
      protoMember: v === Object.prototype[name],
    });
  }
}

function gateScaleCoercion(s) {
  const keys = [
    ['["wing"]', ['wing']],
    ['["full"]', ['full']],
    ['[]', []],
    ['{toString:wing}', { toString: () => 'wing' }],
    ['{toString:full}', { toString: () => 'full' }],
    ['{}', {}],
    ['0', 0], ['1', 1], ['-0', -0], ['NaN', NaN], ['Infinity', Infinity], ['true', true], ['false', false],
    ['Symbol(full)', Symbol('full')], ['Symbol.iterator', Symbol.iterator],
    ['String(wing)', new String('wing')],
  ];
  for (const [tag, k] of keys) {
    s.call(`gateScaleFor(${tag})`, () => en.gateScaleFor(k));
  }
  /* Asking must not change the answer to the next question. */
  s.say('afterAll', [en.gateScaleFor('full'), en.gateScaleFor('wing'), en.gateScaleFor('micro')]);
}

function gateScaleDocs(s) {
  for (const path of DOCS) {
    const doc = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
    s.say(`${path} trackClass`, doc.trackClass);
    s.call(`${path} gateScaleFor(trackClassOf)`, () => en.gateScaleFor(trackClassOf(doc)));
    s.call(`${path} gateScaleFor(raw)`, () => en.gateScaleFor(doc.trackClass));
  }
}

/* Calls fn on input, then says the input again: neither function may
 * change what it was handed. */
function callKeep(s, label, fn, input) {
  const before = canon(input);
  s.call(label, () => fn(input));
  if (input !== null && typeof input === 'object' && canon(input) !== before) s.say(`${label} mutated`, input);
}

function* gen(list) {
  yield* list;
}

function fastestLapEdges(s) {
  const f = en.fastestLap;
  const lists = [
    [], [null], [undefined], [null, undefined], [undefined, 2], [null, 7, null], [5], [5, 3, 4], [3, 4, 5],
    [4, 3, 3], [0, -1], [-1, 0], [-0, 0], [0, -0], [-0], [0], [-0, -0],
    [NaN, 3], [3, NaN], [1, NaN, 0], [NaN, NaN], [NaN], [null, NaN, 2], [NaN, -Infinity],
    [Infinity], [Infinity, 1e308], [-Infinity, 1], [1, -Infinity], [Number.MAX_VALUE, Number.MIN_VALUE],
    [5e-324, 0], [0, 5e-324], [1.5, 1.4999999999999998], [0.1 + 0.2, 0.3],
    ['5', '10'], ['10', '5'], [3, '2'], ['2', 3], ['', 0], [0, ''], ['a', 'B'], [false], [true, 0], [0, false],
    [{}], [[]], [[2], 1],
    [42000, 41999.999, 41999.9990001], [65432.1, 65432.1, 12345.6],
  ];
  for (const l of lists) callKeep(s, `fastestLap(${canon(l)})`, f, l);
  s.call("fastestLap('312')", () => f('312'));
  s.call("fastestLap('')", () => f(''));
  s.call('fastestLap(Set[4,2])', () => f(new Set([4, 2])));
  s.call('fastestLap(gen[9,8,null,10])', () => f(gen([9, 8, null, 10])));
  s.call('fastestLap(Float64Array[3,-0,1])', () => f(new Float64Array([3, -0, 1])));
  s.call('fastestLap(Map)', () => f(new Map([[2, 1]])));
  s.call('fastestLap(sparse)', () => f([, 4, , 2]));
  for (const [tag, v] of [['null', null], ['undefined', undefined], ['5', 5], ['{}', {}], ['true', true]]) {
    s.call(`fastestLap(${tag})`, () => f(v));
  }
  s.call('fastestLap()', () => f());
}

const lap = (ms, n) => ({ n, ms });
const voidLap = (n, reason = 'crash') => ({ n, ms: null, reason });

/* Logs written as a list of ms values, null for a void. */
function log(list) {
  return list.map((ms, i) => (ms === null ? voidLap(i + 1) : lap(ms, i + 1)));
}

function fastestThreeEdges(s) {
  const f = en.fastestThreeConsecutive;
  const logs = [
    [], [1], [1, 2], [1, 2, 3], [3, 2, 1], [1, null, 2, 3, 4], [5, 1, 1, 1], [3, 3, 3, 1, 4, 4], [2, 2, 2, 1, 1, 4],
    [1, 2, null, 3, 4], [null, null, null], [1, 1, null, 1, 1], [1, 1, 1, null], [null, 1, 1, 1],
    [0.1, 0.2, 0.3], [0.3, 0.2, 0.1], [0.2, 0.1, 0.3], [0.1, 0.2, 0.3, 0.3, 0.2, 0.1], [0.3, 0.2, 0.1, 0.1, 0.2, 0.3],
    [1e16, 1, -1e16], [1, 1e16, -1e16], [-1e16, 1e16, 1],
    [-0, -0, -0], [0, -0, -0], [-0, -0, 0], [-0, 0, -0, -0, -0],
    [NaN, 1, 2, 1, 1, 1], [1, 1, 1, NaN, 1, 1], [1, 2, 3, NaN, 1, 1], [NaN, NaN, NaN], [1, NaN, null, 1, 1, 1],
    [Infinity, 1, 1, 1], [Infinity, -Infinity, 1, 1, 1], [-Infinity, 1, 1, 0],
    ['1', 2, 3], [1, '2', 3], [1, 2, '3'], ['1', '2', '3', 0], ['', '', ''], [false, false, false],
    [true, 1, 1, 0], [{}, 1, 2], [[1], 2, 3],
    [62000, 61000, 60000, 59000, 60500, 58000], [45123.4, 44987.6, 45001.2, null, 44000.1, 44000.2, 44000.3],
  ];
  for (const l of logs) callKeep(s, `fastestThreeConsecutive(${canon(l)})`, f, log(l));

  /* Records as Race writes them, and the variants a void can take. */
  const shapes = [
    [{ n: 1, ms: 30000, score: 12 }, { n: 2, ms: 31000, score: 0 }, { n: 3, ms: 29000, score: null }],
    [{ n: 1, ms: 1 }, {}, { n: 3, ms: 2 }, { n: 4, ms: 3 }, { n: 5, ms: 4 }],
    [{ ms: 1 }, { ms: undefined }, { ms: 2 }, { ms: 3 }, { ms: 4 }],
    [{ ms: 1 }, { ms: null, reason: 'missed gate' }, { ms: 2 }, { ms: 3 }, { ms: 4 }],
    [{ ms: 1 }, { reason: 'crash' }, { ms: 2 }, { ms: 3 }, { ms: 4 }],
    [{ ms: 1 }, { ms: 0 }, { ms: 2 }],
    [{ MS: 1 }, { MS: 2 }, { MS: 3 }],
    [{ ms: 5, n: 'x' }, { ms: 5, score: 'y' }, { ms: 5, reason: 'z' }],
  ];
  for (const l of shapes) callKeep(s, `fastestThreeConsecutive(${canon(l)})`, f, l);

  /* Values that are not records: reading .ms of a primitive is undefined,
   * which is a void; of null it throws. */
  for (const [tag, v] of [['[5]', [5]], ['[5,6,7]', [5, 6, 7]], ["'abc'", 'abc'], ["''", ''], ['[true]', [true]]]) {
    s.call(`fastestThreeConsecutive(${tag})`, () => f(v));
  }
  s.call('fastestThreeConsecutive(Set)', () => f(new Set(log([3, 2, 1]))));
  s.call('fastestThreeConsecutive(gen)', () => f(gen(log([4, 4, 4, null, 1, 1, 1]))));
  s.call('fastestThreeConsecutive(Map)', () => f(new Map([[1, 2]])));
  for (const [tag, v] of [['[null]', [null]], ['[undefined]', [undefined]], ['[{ms:1},null]', [{ ms: 1 }, null]],
    ['sparse', [{ ms: 1 }, , { ms: 2 }]],
    ['null', null], ['undefined', undefined], ['5', 5], ['{}', {}]]) {
    s.call(`fastestThreeConsecutive(${tag})`, () => f(v));
  }
  s.call('fastestThreeConsecutive()', () => f());
}

/* Which properties of a record are read. The spec says ms alone; a
 * rewrite that read n or score would see a getter a caller could have put
 * there. The set of names is the contract, not how many times each one is
 * read. */
function fastestThreeReads(s) {
  const read = new Set();
  const rec = (o) => new Proxy(o, { get(t, k) { read.add(String(k)); return t[k]; } });
  const records = [{ n: 1, ms: 3, score: 1 }, { n: 2, ms: null, reason: 'x' }, { n: 3, ms: 1 }, { n: 4, ms: 2 },
    { n: 5, ms: 3 }].map(rec);
  s.call('result', () => en.fastestThreeConsecutive(records));
  s.say('read', [...read].sort());
}

const REASONS = ['crash', 'missed gate', 'wrong direction', 'reset', 'cut'];

/* One race's worth of attempts, built the way Race builds them: a clean lap
 * goes to laps and to log, a void only to log, n counts attempts. */
function raceLog(rng, opts) {
  const attempts = rng.int(0, opts.maxLen);
  const base = rng.range(15000, 120000);
  const out = { log: [], laps: [] };
  for (let i = 0; i < attempts; i += 1) {
    const n = i + 1;
    if (rng.chance(opts.voidP)) {
      out.log.push({ n, ms: null, reason: rng.pick(REASONS) });
      continue;
    }
    let ms;
    const r = rng.next();
    if (r < opts.oddP) ms = rng.pick([NaN, Infinity, -Infinity, -0, 0, '45000', undefined, 1e-9, 2 ** 53]);
    else if (r < 0.5) ms = Math.round(base + rng.range(-4000, 4000));
    else if (r < 0.6) ms = Math.round(base);
    else ms = base + rng.range(-4000, 4000);
    if (ms === undefined) {
      out.log.push({ n });
      out.laps.push(undefined);
      continue;
    }
    out.log.push(rng.chance(0.4) ? { n, ms, score: rng.int(0, 40) } : { n, ms });
    out.laps.push(ms);
  }
  return out;
}

function seededRaces(seed, opts, count) {
  return (s) => {
    const rng = seeded(seed);
    for (let i = 0; i < count; i += 1) {
      const { log: l, laps } = raceLog(rng, opts);
      s.say(`${i} laps`, laps);
      callKeep(s, `${i} fastestLap`, en.fastestLap, laps);
      s.say(`${i} log`, l);
      callKeep(s, `${i} fastestThreeConsecutive`, en.fastestThreeConsecutive, l);
    }
  };
}

/* Short lists of small values with many ties and repeats, so the tie and
 * order rules (first window wins, strict <) are hit over and over. */
function seededTies(seed, count) {
  return (s) => {
    const rng = seeded(seed);
    for (let i = 0; i < count; i += 1) {
      const len = rng.int(0, 9);
      const list = [];
      for (let j = 0; j < len; j += 1) {
        list.push(rng.chance(0.2) ? null : rng.pick([0, -0, 1, 1, 2, 0.1, 0.2, 0.3, NaN]));
      }
      callKeep(s, `${i} fastestLap(${canon(list)})`, en.fastestLap, list);
      callKeep(s, `${i} fastestThreeConsecutive`, en.fastestThreeConsecutive, log(list));
    }
  };
}

const RACE_FAMILIES = [
  /* Clean races of realistic length, the bulk of what Race hands over. */
  { tag: 'race-clean', opts: { maxLen: 12, voidP: 0.05, oddP: 0 }, seeds: 12 },
  /* Crash heavy: voids break the run of three often. */
  { tag: 'race-voids', opts: { maxLen: 20, voidP: 0.35, oddP: 0 }, seeds: 12 },
  /* Long sessions, many windows per list. */
  { tag: 'race-long', opts: { maxLen: 80, voidP: 0.12, oddP: 0 }, seeds: 8 },
  /* Values no race writes today but a caller could pass. */
  { tag: 'race-odd', opts: { maxLen: 16, voidP: 0.15, oddP: 0.12 }, seeds: 12 },
];

const cases = [
  { id: 'exports-en', run: exportsCase(en) },
  { id: 'exports-es', run: exportsCase(es) },
  { id: 'constants', run: constants },
  { id: 'utt3-en', run: utt3Case(en) },
  { id: 'utt3-es', run: utt3Case(es) },
  { id: 'gateScaleFor-strings', run: gateScaleStrings },
  { id: 'gateScaleFor-prototype', run: gateScaleProto },
  { id: 'gateScaleFor-coercion', run: gateScaleCoercion },
  { id: 'gateScaleFor-docs', run: gateScaleDocs },
  { id: 'fastestLap-edges', run: fastestLapEdges },
  { id: 'fastestThree-edges', run: fastestThreeEdges },
  { id: 'fastestThree-reads', run: fastestThreeReads },
];
for (const fam of RACE_FAMILIES) {
  for (let k = 0; k < fam.seeds; k += 1) {
    cases.push({ id: `${fam.tag}-${k}`, run: seededRaces(1000 * (RACE_FAMILIES.indexOf(fam) + 1) + k, fam.opts, 40) });
  }
}
for (let k = 0; k < 8; k += 1) cases.push({ id: `ties-${k}`, run: seededTies(9000 + k, 200) });

goldenMain('track:golden', FIXTURE, cases);
