/*
 * trickdetect-tapped.js: src/game/trickdetect.js as scripts/lib/
 * trickdetect-tap.js serves it, with TrickDetector subclassed to record its
 * boundary. Never imported directly.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import * as real from '../../src/game/trickdetect.js';
import { canon } from './golden.js';

export * from '../../src/game/trickdetect.js';

/* The calls a caller makes. Anything else on the class is the detector's
 * own business. */
const BOUNDARY = ['step', 'idle', 'bump', 'near', 'reset', 'restart', 'flush'];

const tapes = [];
const fieldIds = new WeakMap();
let nextFieldId = 0;

/* Which world the detector is looking at, by identity: the first field a
 * process hands any detector is 0, the next new one 1, and so on. */
function envOf(det) {
  const ob = det.obstacles;
  let field = 'none';
  if (ob) {
    if (!fieldIds.has(ob)) fieldIds.set(ob, nextFieldId++);
    field = fieldIds.get(ob);
  }
  return `field=${field} solids=${det.solids ? 'yes' : 'no'}`;
}

export class TrickDetector extends real.TrickDetector {
  constructor(onTrick, obstacles = null) {
    const tape = {
      hash: createHash('sha256'), calls: 0, tricks: [], env: '', depth: 0,
    };
    super((t) => {
      tape.hash.update(`trick ${canon(t)}\n`);
      tape.tricks.push(t.name);
      return onTrick(t);
    }, obstacles);
    Object.defineProperty(this, '__tape', { value: tape });
    tapes.push(tape);
  }
}

for (const name of BOUNDARY) {
  const inner = real.TrickDetector.prototype[name];
  TrickDetector.prototype[name] = function tapped(...args) {
    const tape = this.__tape;
    if (!tape || tape.depth > 0) return inner.apply(this, args);
    const env = envOf(this);
    if (env !== tape.env) {
      tape.hash.update(`env ${env}\n`);
      tape.env = env;
    }
    tape.calls += 1;
    tape.hash.update(`${name}(${args.map((a) => canon(a)).join(',')})\n`);
    tape.depth += 1;
    let r;
    try {
      r = inner.apply(this, args);
    } finally {
      tape.depth -= 1;
    }
    tape.hash.update(`= ${canon(r)}\n`);
    return r;
  };
}

process.on('exit', () => {
  const out = process.env.TRICK_TAP_OUT;
  if (!out) return;
  writeFileSync(out, JSON.stringify(tapes.map((t) => ({
    digest: t.hash.digest('hex'), calls: t.calls, tricks: t.tricks,
  }))));
});
