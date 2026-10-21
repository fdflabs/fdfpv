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
 * 6. Favourites (settings.favourites): a profile's or a sync's list is
 *    held to card ids, once each; the star toggles; the sync keeps a good
 *    list and refuses a bad one, the newer side winning.
 * 7. The camera goes with the aircraft (keepCamera, seatAirframe's
 *    cameraFor): the pilot's own angle and lens come back on the aircraft
 *    they were set on, an aircraft never changed gets its stock, a change
 *    back to stock leaves no entry, a camera nobody set is not kept, and
 *    the sync holds the entries' shape.
 *
 * Run with npm run pick:selftest.
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { readPartTable } from './lib/crash.js';
import { AIRFRAMES, airframeById } from '../configs/airframes.js';
import { tunesFor } from '../configs/registry.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';
import { cycleCraft, kindOf, pickList, slotOf, slotX } from '../src/ui/carousel.js';
import { seatAirframe } from '../src/ui/ui.js';
import { keepCamera, normaliseFavourites, toggleFavourite } from '../src/ui/settings.js';
import { blobRefusal, cleanBlob, mergeBlobs, pickSynced } from '../src/share/progressmerge.js';

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

console.log('1. what the picker says');
for (const af of AIRFRAMES) {
  const sim = await loadSim(wasmBytes);
  const plant = af.simId;
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
check('the quads are the quads', pickList('quad').every((id) => !airframeById(id).fixedWing) && pickList('quad').length === 3, pickList('quad').join());
const CARDS = AIRFRAMES;
check('the planes are the planes', pickList('plane').every((id) => airframeById(id).fixedWing) && pickList('plane').length === CARDS.filter((a) => a.fixedWing).length, `${pickList('plane').length} of ${CARDS.filter((a) => a.fixedWing).length}`);
check('all is every card, in the table\'s order', pickList('all').join() === CARDS.map((a) => a.id).join());
check('kindOf agrees', kindOf('interceptor') === 'quad' && kindOf('bramor2300') === 'plane');
{
  const seen = [];
  let id = CARDS[0].id;
  for (let k = 0; k < CARDS.length; k += 1) {
    id = cycleCraft(id, 1);
    seen.push(id);
  }
  check('] visits every card once and comes back to the first', new Set(seen).size === CARDS.length && id === CARDS[0].id, seen.join(' '));
  check('[ goes the other way', cycleCraft(CARDS[0].id, -1) === CARDS[CARDS.length - 1].id && cycleCraft(cycleCraft('bramor2300', 1), -1) === 'bramor2300');
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
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'bramor2300');
  const wingTunes = tunesFor('bramor2300').map((t) => t.id);
  const other = wingTunes.find((t) => t !== airframeById('bramor2300').defaultTune);
  check('the Bramor gets its default tune the first time', s.tune === airframeById('bramor2300').defaultTune, s.tune);
  s.tune = other;
  seatAirframe(s, 'interceptor');
  check('the interceptor gets its own back', s.tune === airframeById('interceptor').defaultTune, s.tune);
  seatAirframe(s, 'bramor2300');
  check('and the Bramor the one it was last flown on', s.tune === other, `${s.tune}, of ${wingTunes.join(', ')}`);
  s.tuneFor = { ...s.tuneFor, striker2500: 'no-such-tune' };
  seatAirframe(s, 'striker2500');
  check('a remembered tune the aircraft no longer offers falls back to its default', s.tune === airframeById('striker2500').defaultTune, s.tune);
}

{
  console.log('\n5. favourites');
  const f = normaliseFavourites({ list: ['wing1000', 'bogus', 7, 'interceptor', 'bramor2300', 'striker2500', 'interceptor'] });
  check('a retired aircraft is its successor, unknown ids and repeats go',
    f.list.join() === 'bramor2300,interceptor,striker2500', f.list.join());
  check('a profile with none, or junk, has an empty list',
    normaliseFavourites(undefined).list.length === 0 && normaliseFavourites({ list: 'bramor2300' }).list.length === 0);
  const on = toggleFavourite({ list: ['bramor2300'] }, 'striker2500');
  const off = toggleFavourite(on, 'bramor2300');
  check('the star puts an aircraft first and takes it out again', on.list.join() === 'striker2500,bramor2300' && off.list.join() === 'striker2500',
    `${on.list.join()} / ${off.list.join()}`);
  const sent = { v: 1, data: pickSynced({ favourites: { list: ['striker2500'] }, graphics: 'low' }), stamps: { favourites: 2000 } };
  check('the list is synced and kept whole', JSON.stringify(cleanBlob(sent).data.favourites) === '{"list":["striker2500"]}');
  const held = { v: 1, data: { favourites: { list: ['bramor2300', '7inch'] } }, stamps: { favourites: 1000 } };
  check('the newer side wins a merge', JSON.stringify(mergeBlobs(sent, held).data.favourites) === '{"list":["striker2500"]}'
    && JSON.stringify(mergeBlobs({ ...sent, stamps: { favourites: 500 } }, held).data.favourites) === '{"list":["bramor2300","7inch"]}');
  const bad = blobRefusal({ data: { favourites: { list: ['Not an id!'] } } });
  const long = blobRefusal({ data: { favourites: { list: Array.from({ length: 65 }, (_, i) => `a${i}`) } } });
  check('a list that is not ids, or too long, is refused', bad && bad.section === 'favourites' && long && long.section === 'favourites',
    `${JSON.stringify(bad)} ${JSON.stringify(long)}`);
}

{
  console.log('\n6. the camera goes with the aircraft');
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const stock = (id) => ({ angle: airframeById(id).cameraAngle, fov: airframeById(id).cameraFov });
  const cam = (s) => ({ angle: s.cameraAngle, fov: s.cameraFov });
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
  check('an aircraft never changed flies its stock camera', same(cam(s), stock('interceptor')), JSON.stringify(cam(s)));
  s.cameraAngle = 30;
  s.cameraFov = 115;
  keepCamera(s);
  seatAirframe(s, 'bramor2300');
  check('the Bramor gets its own stock, not the quad\'s camera', same(cam(s), stock('bramor2300')), JSON.stringify(cam(s)));
  check('and the quad\'s is kept for it', same(s.cameraFor, { interceptor: { angle: 30, fov: 115 } }), JSON.stringify(s.cameraFor));
  s.cameraAngle = 12;
  keepCamera(s);
  seatAirframe(s, 'interceptor');
  check('back on the quad, its camera is the pilot\'s', same(cam(s), { angle: 30, fov: 115 }), JSON.stringify(cam(s)));
  check('an angle alone on the Bramor\'s stock lens is kept too', same(s.cameraFor.bramor2300, { angle: 12, fov: stock('bramor2300').fov }), JSON.stringify(s.cameraFor));
  s.cameraAngle = stock('interceptor').angle;
  s.cameraFov = stock('interceptor').fov;
  keepCamera(s);
  check('a camera put back to stock leaves no entry', !('interceptor' in s.cameraFor), JSON.stringify(s.cameraFor));
  const fresh = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates, cameraAngle: 30, cameraFov: 85 }, 'bramor2300');
  check('a camera nobody set (the defaults) is not kept at a seat change', same(fresh.cameraFor, {}), JSON.stringify(fresh.cameraFor));
  s.cameraFor = { ...s.cameraFor, striker2500: { angle: 'x', fov: 115 }, wing1000: { angle: 10, fov: 95 } };
  seatAirframe(s, 'striker2500');
  check('a broken entry or one for an aircraft this build lacks is dropped', same(cam(s), stock('striker2500')) && same(Object.keys(s.cameraFor), ['bramor2300']), JSON.stringify(s.cameraFor));
  const sent = { v: 1, data: pickSynced({ cameraFor: { bramor2300: { angle: 12, fov: 100 }, whoop65: { angle: 1, fov: 95 } } }), stamps: {} };
  check('the sync keeps an entry and drops a retired aircraft\'s', same(cleanBlob(sent).data.cameraFor, { bramor2300: { angle: 12, fov: 100 } }), JSON.stringify(cleanBlob(sent).data.cameraFor));
  const bad = blobRefusal({ data: { cameraFor: { bramor2300: { angle: 'x', fov: 100 } } } });
  check('an entry without a numeric angle and lens is refused', Boolean(bad) && bad.section === 'cameraFor', JSON.stringify(bad));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
