/*
 * kits-selftest.js: the visual part kits' data (configs/kits.js) and the
 * physics-zero guarantee's static half (docs/KITS.md sections 5 and 6),
 * in Node.
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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KITS, KIT_VERSION, LED_PATTERNS, checkKit, kitParts, lightsFor, slotsFor } from '../configs/kits.js';
import { LIVERIES, entryDrops, normaliseEntry, normaliseLiveries, normaliseSaves, readCode } from '../configs/liveries.js';
import { encodeLivery } from '../configs/paint.js';
import { cleanBlob, mergeBlobs } from '../src/share/progressmerge.js';
import { ledLevel } from '../src/render/kitlights.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('catalogue');
check('every paintable family has a kit and only those', same(Object.keys(KITS).sort(), Object.keys(LIVERIES).sort()));
check('every slot starts at stock with options unique', Object.values(KITS).flat()
  .every((s) => s.options[0] === 'stock' && new Set(s.options).size === s.options.length && s.options.length >= 2));
check('every family has a light', Object.keys(KITS).every((f) => Object.values(lightsFor(f)).some(Boolean)));

console.log('normalise');
const fullQuad = { kit: { v: 1, parts: { arms: 'blade', top: 'stock', antenna: 'pagoda' } },
  lights: { v: 1, led: '#ff2200', pattern: 'chase', glow: '#00ccff', glowPattern: 'breathe' } };
const q = normaliseEntry('7inch', fullQuad);
check('a quad kit keeps its options, stock left out', same(q.kit, { v: 1, parts: { arms: 'blade', antenna: 'pagoda' } }), JSON.stringify(q.kit));
check('a quad keeps its LEDs and glow', same(q.lights, fullQuad.lights));
check('nothing dropped from a good entry', entryDrops('7inch', fullQuad) === 0);
check('a plane slot on a quad is dropped and counted', entryDrops('7inch', { kit: { v: 1, parts: { spinner: 'bullet' } } }) === 1);
check('an unknown option is dropped', entryDrops('sky1800', { kit: { v: 1, parts: { spinner: 'gold' } } }) === 1);
check('LEDs on a plane are dropped', entryDrops('sky1800', { lights: { v: 1, led: '#ff0000' } }) === 1);
check('nav lights on a plane kept', same(normaliseEntry('sky1800', { lights: { v: 1, nav: true, strobe: false } }).lights, { v: 1, nav: true, strobe: false }));
check('a bad pattern is dropped', entryDrops('7inch', { lights: { v: 1, pattern: 'disco' } }) === 1);
check('LED_PATTERNS as the contract', same(LED_PATTERNS, ['solid', 'chase', 'strobe', 'throttle', 'battery']));
check('all stock is no key at all', normaliseEntry('sky1800', { kit: { v: 1, parts: { spinner: 'stock' } } }) === null);
check('a kit with no v is dropped', entryDrops('sky1800', { kit: { parts: { spinner: 'bullet' } } }) === 1);

console.log('migration');
const old = { sky1800: { scheme: 'stock', regions: { wing: '#FF0000' } }, '7inch': { regions: { frame: '#123456' } } };
const loaded = normaliseLiveries(old);
check('an old settings blob loads with no kit and no lights', Object.values(loaded).every((e) => !('kit' in e) && !('lights' in e)), JSON.stringify(loaded));
check('an old entry draws all stock', same(kitParts('sky1800', loaded.sky1800.kit), Object.fromEntries(slotsFor('sky1800').map((s) => [s.id, 'stock']))));
const newer = { v: KIT_VERSION + 1, parts: { spinner: 'hologram' } };
check('a newer kit version is kept as it came', same(checkKit('sky1800', newer).kit, newer));
check('a newer kit version draws stock', kitParts('sky1800', newer).spinner === 'stock');
const oldAccount = { v: 1, data: { livery: { sky1800: { regions: { wing: '#ff0000' } } } }, stamps: { livery: 1 } };
const withKit = { v: 1, data: { livery: { '7inch': fullQuad } }, stamps: { livery: 2 } };
check('the server keeps kit keys as sent', same(cleanBlob(withKit).data.livery['7inch'], fullQuad));
const merged = mergeBlobs(withKit, oldAccount);
check('an old account merged with a kit keeps both', same(merged.data.livery.sky1800, oldAccount.data.livery.sky1800) && same(merged.data.livery['7inch'], fullQuad), JSON.stringify(merged.data.livery));
check('saved liveries carry the kit', same(normaliseSaves({ '7inch': [{ name: 'night', entry: fullQuad }] })['7inch'][0].entry.kit, q.kit));

console.log('codes');
const code = encodeLivery('7inch', 'night', q);
const back = readCode(code);
check('a v1 code carries kit and lights', !back.error && same(back.entry.kit, q.kit) && same(back.entry.lights, q.lights), back.error ?? '');
check('a code with a bad kit is refused', readCode(encodeLivery('7inch', 'x', { kit: { v: 1, parts: { spinner: 'bullet' } } })).error === 'bad_value');
const plain = readCode(encodeLivery('sky1800', 'old', { regions: { wing: '#ff0000' } }));
check('an old code reads the same', !plain.error && same(plain.entry, { regions: { wing: '#ff0000' } }));

console.log('LED patterns');
const o = { level: 0, red: 0 };
const lv = (p, m, t, thr = 0, bat = 1) => ({ ...ledLevel(p, m, t, thr, bat, o) });
check('solid is full', lv('solid', 2, 12345).level === 1);
check('chase lights one arm a step, round the four', [0, 110, 220, 330, 440].map((t) => [0, 1, 2, 3].findIndex((m) => lv('chase', m, t).level === 1)).join() === '0,1,2,3,0');
check('strobe double flashes once a second', lv('strobe', 0, 30).level === 1 && lv('strobe', 0, 90).level < 0.1 && lv('strobe', 0, 150).level === 1 && lv('strobe', 0, 500).level < 0.1 && lv('strobe', 0, 1030).level === 1);
check('throttle follows the stick', lv('throttle', 0, 0, 0).level < lv('throttle', 0, 0, 0.5).level && lv('throttle', 0, 0, 1).level === 1);
check('battery reddens as the pack runs down', lv('battery', 0, 0, 0, 1).red === 0 && lv('battery', 0, 0, 0, 0).red === 1);
check('a pattern is the same at the same flight time', same(lv('chase', 1, 987654), lv('chase', 1, 987654)));

/*
 * PHYSICS ZERO, static half: nothing the flight runs on may reach the
 * kits. Walk the relative imports of every module under the sim, native
 * and fc trees, the journal, the referee, the test stand and the configs
 * the seat blocks come from, and fail if one reaches kits.js. The replay's
 * drawing modules (peerscene, crashcam) reach it by design, through the
 * peers' livery: they draw, they do not fly.
 */
console.log('physics zero');
const KIT_FILES = new Set([join(ROOT, 'configs/kits.js'), join(ROOT, 'src/render/kitlights.js')]);
const seen = new Map();
function reaches(file) {
  if (seen.has(file)) {
    return seen.get(file);
  }
  seen.set(file, null);
  let src = '';
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    seen.set(file, null);
    return null;
  }
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const dep = resolve(dirname(file), m[1] ?? m[2]);
    if (KIT_FILES.has(dep)) {
      seen.set(file, [file, dep]);
      return seen.get(file);
    }
    const via = reaches(dep);
    if (via) {
      seen.set(file, [file, ...via]);
      return seen.get(file);
    }
  }
  return null;
}
function jsUnder(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? jsUnder(p) : (p.endsWith('.js') ? [p] : []);
  });
}
const roots = [...['src/sim', 'src/native', 'src/fc'].flatMap((d) => jsUnder(join(ROOT, d))),
  ...['configs/power.js', 'configs/motors.js', 'configs/hangar-parts.js', 'configs/wear.js', 'configs/hulls.js', 'src/game/midair.js', 'src/game/teststand.js', 'src/replay/journal.js']
    .map((f) => join(ROOT, f))];
const hits = roots.map(reaches).filter(Boolean);
check(`no physics module reaches configs/kits.js or kitlights.js (${roots.length} roots)`, hits.length === 0,
  hits.length ? hits[0].map((f) => f.slice(ROOT.length + 1)).join(' -> ') : '');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
