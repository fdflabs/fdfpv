/*
 * craft-pick-selftest.js: the aircraft picker's facts and rules, in Node.
 *
 * 1. What the picker says about each aircraft is true: its weight is the
 *    compiled plant's mass (the sum of its part table, the table the crash
 *    physics carries), its size is the figure its own facts quote, and it
 *    has a line in every language.
 * 2. The lists the tabs show, and the direct cycle, [ and ], which visits
 *    every aircraft and comes back round.
 * 3. The layout a drag reads is the layout drawn: slotOf undoes slotX.
 * 4. Changing aircraft and changing back lands on the tune each was last
 *    flown on (seatAirframe's tuneFor), and a stale entry falls back to
 *    the aircraft's default.
 *
 * Run with npm run pick:selftest.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { readPartTable } from './lib/crash.js';
import { AIRFRAMES, airframeById, floatVersionOf, isFloatVersion, landPlaneOf } from '../configs/airframes.js';
import { tunesFor } from '../configs/registry.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';
import { cycleCraft, kindOf, pickList, slotOf, slotX } from '../src/ui/carousel.js';
import { normaliseFloats, seatAirframe, withFloats } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

/* The whoop flies the five inch's plant; the machine the picker shows is
 * the real 65 mm one, which is the module's airframe 1 (sim_abi.h). */
const MASS_PLANT = { whoop65: 1 };

console.log('1. what the picker says');
for (const af of AIRFRAMES) {
  const sim = await loadSim(wasmBytes);
  const plant = MASS_PLANT[af.id] ?? af.simId;
  if (sim.init(configText) !== SIM_OK || sim.e.sim_set_airframe(plant) !== SIM_OK || sim.reset() !== SIM_OK) {
    check(`${af.id}: the module takes plant ${plant}`, false);
    continue;
  }
  const grams = readPartTable(sim).reduce((s, p) => s + p.mass, 0) * 1000;
  check(`${af.id} weighs ${af.grams} g, the plant's ${grams.toFixed(1)} g`, Math.abs(grams - af.grams) < 0.05);
  const quoted = af.facts.some((f) => f === `${af.sizeMm} mm`);
  check(`${af.id} is ${af.sizeMm} mm, the figure its facts quote`, quoted, af.facts.join(', '));
  const key = `carousel.note.${af.id}`;
  check(`${af.id} has a line in English and Spanish`, Boolean(en[key]) && Boolean(es[key]) && en[key] !== es[key]);
}

console.log('2. the lists and the cycle');
check('the quads are the quads', pickList('quad').every((id) => !airframeById(id).fixedWing) && pickList('quad').length === 5);
/* A float version is its land plane's Floats toggle, not a card. */
const CARDS = AIRFRAMES.filter((a) => !isFloatVersion(a.id));
check('the float versions are the Timber\'s and the Cub\'s', AIRFRAMES.filter((a) => isFloatVersion(a.id)).map((a) => `${landPlaneOf(a.id)}>${a.id}`).join() === 'timber1500>timber1500f,cub1400>cub1400f');
check('the planes are the planes, a float version not a card of its own', pickList('plane').every((id) => airframeById(id).fixedWing) && pickList('plane').length === CARDS.filter((a) => a.fixedWing).length && !pickList('plane').some(isFloatVersion), `${pickList('plane').length} of ${CARDS.filter((a) => a.fixedWing).length}`);
check('all is every card, in the table\'s order', pickList('all').join() === CARDS.map((a) => a.id).join());
check('kindOf agrees', kindOf('5inch') === 'quad' && kindOf('cub1400f') === 'plane');
{
  const seen = [];
  let id = '5inch';
  for (let k = 0; k < CARDS.length; k += 1) {
    id = cycleCraft(id, 1);
    seen.push(id);
  }
  check('] visits every card once and comes back to the first', new Set(seen).size === CARDS.length && id === '5inch', seen.join(' '));
  check('[ goes the other way', cycleCraft('5inch', -1) === CARDS[CARDS.length - 1].id && cycleCraft(cycleCraft('cub1400', 1), -1) === 'cub1400');
  check('from a float version ] goes on from its land plane', cycleCraft('cub1400f', 1) === cycleCraft('cub1400', 1), cycleCraft('cub1400f', 1));
}

console.log('3. the layout');
{
  const ds = [-2.4, -1.5, -1, -0.3, 0, 0.4, 1, 1.7, 2.5];
  const worst = Math.max(...ds.map((d) => Math.abs(slotOf(slotX(d)) - d)));
  check('slotOf undoes slotX', worst < 1e-12, `worst ${worst.toExponential(1)}`);
  check('the neighbours stand either side, in order', ds.every((d, i) => i === 0 || slotX(d) > slotX(ds[i - 1])));
}

console.log('4. the tune goes with the aircraft');
{
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, 'cub1400');
  const cubTunes = tunesFor('cub1400').map((t) => t.id);
  const other = cubTunes.find((t) => t !== airframeById('cub1400').defaultTune);
  check('the Cub gets its default tune the first time', s.tune === airframeById('cub1400').defaultTune, s.tune);
  s.tune = other;
  seatAirframe(s, '5inch');
  check('the five inch gets its own back', s.tune === airframeById('5inch').defaultTune, s.tune);
  seatAirframe(s, 'cub1400');
  check('and the Cub the one it was last flown on', s.tune === other, `${s.tune}, of ${cubTunes.join(', ')}`);
  s.tuneFor = { ...s.tuneFor, sky1800: 'no-such-tune' };
  seatAirframe(s, 'sky1800');
  check('a remembered tune the aircraft no longer offers falls back to its default', s.tune === airframeById('sky1800').defaultTune, s.tune);
}

console.log('5. the Floats toggle');
{
  check('a profile seated on a float version has that plane\'s toggle on', JSON.stringify(normaliseFloats({}, 'timber1500f')) === '{"timber1500":true}');
  check('a stored toggle is kept for a plane with floats and dropped for one without, or not a boolean',
    JSON.stringify(normaliseFloats({ cub1400: true, sky1800: true, timber1500: 'yes' }, 'sky1800')) === '{"cub1400":true}');
  const s = { airframe: '5inch', rates: airframeById('5inch').rates, floats: { cub1400: true }, power: {}, parts: {}, tuning: {} };
  check('a card with its toggle on seats the float version, one with it off the land plane',
    withFloats(s, 'cub1400') === 'cub1400f' && withFloats(s, 'timber1500') === 'timber1500' && withFloats(s, 'sky1800') === 'sky1800');
  seatAirframe(s, 'timber1500');
  s.power = { timber1500: { option: '3s', pack: '3s2200' } };
  s.parts = { timber1500: { prop: '11x7e', addons: [], damage: null } };
  s.tuning = { timber1500: { rate: 'low' } };
  const tune = tunesFor('timber1500').map((t) => t.id).find((t) => t !== airframeById('timber1500').defaultTune);
  s.tune = tune;
  seatAirframe(s, floatVersionOf('timber1500'));
  check('the toggle follows the seat', s.airframe === 'timber1500f' && s.floats.timber1500 === true && s.floats.cub1400 === true, JSON.stringify(s.floats));
  check('the tune, the power, the prop and the bench setup go across to the floats',
    s.tune === tune && JSON.stringify(s.power.timber1500f) === JSON.stringify(s.power.timber1500)
      && s.parts.timber1500f && s.parts.timber1500f.prop === '11x7e' && s.tuning.timber1500f && s.tuning.timber1500f.rate === 'low',
    `${s.tune} ${JSON.stringify(s.power.timber1500f)} ${JSON.stringify(s.parts.timber1500f)} ${JSON.stringify(s.tuning.timber1500f)}`);
  /* A broken part is an index into the table it broke on: the Timber's 19
   * parts are not the float Timber's 18, so its damage stays behind. */
  {
    const boxes = Array.from({ length: 19 }, () => [[0, 0, 0], [0.1, 0.1, 0.1]]);
    const parents = boxes.map((b, i) => i - 1);
    const damage = { boxes, parents, parts: [{ i: 18, kind: 0, cg: [0, 0, 0], mass: 0.01, joint: [0, 0, 0], state: 'broken' }] };
    const t = { ...s, parts: { timber1500: { prop: '11x7e', addons: [], damage } } };
    seatAirframe(t, 'timber1500');
    seatAirframe(t, floatVersionOf('timber1500'));
    check('a broken part on the wheels is not carried to the floats, the prop is',
      Boolean(t.parts.timber1500.damage) && t.parts.timber1500f && t.parts.timber1500f.damage === null && t.parts.timber1500f.prop === '11x7e',
      JSON.stringify(t.parts.timber1500f));
  }
  s.power = { ...s.power, timber1500f: { option: 'stock', pack: '4s3200' } };
  seatAirframe(s, 'timber1500');
  check('and back to the wheels, the toggle off and the choice made on floats carried back',
    s.airframe === 'timber1500' && s.floats.timber1500 === false && JSON.stringify(s.power.timber1500) === JSON.stringify(s.power.timber1500f),
    `${JSON.stringify(s.floats)} ${JSON.stringify(s.power)}`);
  seatAirframe(s, 'sky1800');
  check('another plane leaves the toggles as they were', JSON.stringify(s.floats) === '{"cub1400":true,"timber1500":false}', JSON.stringify(s.floats));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
