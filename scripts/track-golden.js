/*
 * track-golden.js: src/game/track.js held to the exact outputs it gave when
 * tests/fixtures/track-golden.json was written. npm run track:golden.
 *
 * What is left of the module is the gate scale: GATE_SCALE and gateScaleFor
 * size the crash world's gate posts and answer verify's world scale check.
 * So this pins both exports bit for bit, and gateScaleFor over every class
 * a document could carry and over the awkward keys a plain object lookup
 * answers differently from a Map or a switch.
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

import { canon, goldenMain } from './lib/golden.js';

const FIXTURE = new URL('../tests/fixtures/track-golden.json', import.meta.url);

const en = await import('../src/game/track.js');

/* Written out rather than read from Object.getOwnPropertyNames, so a node
 * that grows a new Object.prototype member does not change the case. */
const PROTO_NAMES = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
  'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__defineSetter__', '__lookupGetter__',
  '__lookupSetter__'];

function exportsCase(m) {
  return (s) => {
    s.say('exports', Object.keys(m).sort().map((k) => `${k}:${typeof m[k]}`));
    s.say('arity', { gateScaleFor: m.gateScaleFor.length });
  };
}

function constants(s) {
  s.say('GATE_SCALE', en.GATE_SCALE);
  s.say('identities', {
    gateScaleIsLiteral: en.GATE_SCALE === 1.15,
    fullIsGateScale: en.gateScaleFor('full') === en.GATE_SCALE,
  });
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

const cases = [
  { id: 'exports-en', run: exportsCase(en) },
  { id: 'constants', run: constants },
  { id: 'gateScaleFor-strings', run: gateScaleStrings },
  { id: 'gateScaleFor-prototype', run: gateScaleProto },
  { id: 'gateScaleFor-coercion', run: gateScaleCoercion },
];

goldenMain('track:golden', FIXTURE, cases);
