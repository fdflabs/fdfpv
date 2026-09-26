/*
 * lap-selftest.js: the headless lap check against laps it must accept and
 * laps it must refuse.
 *
 * A synthetic lap is threaded through the reference course: from the timing
 * gate, two metres out of every gate in flying order, back through the
 * timing gate, sampled at the ghost rate at a steady speed and encoded with
 * the real encoder. Then the same lap is broken one way at a time, and each
 * break must be refused for the reason the check names. Then a wing course
 * of five metre gates on the 400 by 300 m airfield is built with the
 * builder's own model and flown at cruise, and the same skip is refused.
 * Run with npm run lap:selftest.
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

import { encodeGhost } from '../src/share/ghostdata.js';
import { checkLap, gatesFromCourse, LAP_TOLERANCE_MS } from '../src/game/verify.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { Race } from '../src/game/race.js';
import { trackClassOf } from '../src/trackbuilder/elements.js';
import { createElement, createSequenceEntry, createTrack } from '../src/trackbuilder/model.js';
import { applyAutoFaces } from '../src/trackbuilder/faces.js';
import { syntheticLap } from '../tests/lib/synthlap.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { layoutFingerprint } from '../src/share/listing.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const doc = JSON.parse(await readFile(join(root, 'tests/fixtures/course-reference.json'), 'utf8'));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

console.log('lap check');
const honest = syntheticLap(doc);
const gates = { length: honest.gates };
check('the reference course has gates', honest.gates > 0, `${honest.gates}`);
const honestBytes = encodeGhost(honest);
const ok = checkLap(doc, honestBytes, honest.lapMs);
check('an honest lap is accepted', ok.ok === true, ok.reason);
check('and it passed every gate', ok.gates === gates.length, `${ok.gates}`);
check('and the course clock agrees with the ghost clock',
  ok.ok && Math.abs(ok.lapMs - honest.lapMs) <= LAP_TOLERANCE_MS, `${ok.lapMs} vs ${honest.lapMs}`);
check('and the top speed is the flown speed', ok.ok && Math.abs(ok.topSpeed - 20) < 0.5, `${ok.topSpeed}`);

const skipK = Math.max(1, Math.floor(gates.length / 2));
const skipped = syntheticLap(doc, { skip: skipK });
/* The detector never closes this lap, so there is no measured time; the
 * forger claims the ghost's own length, which the duration check lets
 * through and the gates do not. */
const bad1 = checkLap(doc, encodeGhost(skipped), skipped.durationMs);
check('a lap that skips a gate is refused', bad1.ok === false && /never closed/.test(bad1.reason), bad1.reason);

const teleported = { ...honest, pos: Float32Array.from(honest.pos) };
const mid = Math.floor(honest.count / 2);
teleported.pos[mid * 3] += 40;
const bad2 = checkLap(doc, encodeGhost(teleported), honest.lapMs);
check('a lap with a 40 m jump between two samples is refused', bad2.ok === false && /jump/.test(bad2.reason), bad2.reason);

const bad3 = checkLap(doc, honestBytes, honest.lapMs - 500);
check('a claim 500 ms faster than its own ghost is refused', bad3.ok === false && /claimed lap/.test(bad3.reason), bad3.reason);

const hovered = syntheticLap(doc, { hoverAfterMs: 1500 });
const bad4 = checkLap(doc, encodeGhost(hovered), hovered.durationMs);
check('a ghost that outlasts its lap by 1.5 s cannot claim the long time', bad4.ok === false && /measures/.test(bad4.reason), bad4.reason);

const wrongSplits = { ...honest, splits: honest.splits.map((s, i) => (i === 0 ? s + 400 : s)) };
const bad5 = checkLap(doc, encodeGhost(wrongSplits), honest.lapMs);
check('a ghost whose first split disagrees with the course by 400 ms is refused', bad5.ok === false && /split 1/.test(bad5.reason), bad5.reason);

const reversed = { ...honest, pos: new Float32Array(honest.pos.length) };
for (let i = 0; i < honest.count; i += 1) {
  const j = honest.count - 1 - i;
  reversed.pos.set(honest.pos.subarray(j * 3, j * 3 + 3), i * 3);
}
const bad6 = checkLap(doc, encodeGhost(reversed), honest.lapMs);
check('the lap flown backwards is refused', bad6.ok === false, bad6.reason);

const junk = checkLap(doc, new Uint8Array(10), honest.lapMs);
check('ten bytes of nothing are refused as a ghost', junk.ok === false && /^ghost:/.test(junk.reason), junk.reason);

/*
 * The wing course: four five metre gates round the 400 by 300 m airfield,
 * built by the builder's own model so the check flies what the WING
 * toggle would make, and flown at the wing's cruise. The ghost is threaded
 * two metres either side of each centre, which is exactly the depth of a
 * wing gate's scoring box, so a box any shallower than the class asks for
 * would still pass here: the depth itself is asserted on the race.
 */
console.log('\nwing course');
const wing = createTrack('Wing check', 'wing');
check('a new wing track is the wing class', trackClassOf(wing) === 'wing', trackClassOf(wing));
check('on the 400 by 300 m airfield', wing.field.width === 400 && wing.field.depth === 300, `${wing.field.width} by ${wing.field.depth}`);
for (const [x, y] of [[100, 75], [300, 75], [300, 225], [100, 225]]) {
  const gate = createElement(wing, 'gate', { x, y }, 0);
  wing.elements.push(gate);
  wing.sequence.push(createSequenceEntry(wing, gate.id));
}
applyAutoFaces(wing);
check('a wing gate is five metres square', wing.elements.every((e) => e.dims.clearW === 5 && e.dims.clearH === 5), JSON.stringify(wing.elements[0].dims));
const wingCourse = courseFromDocument(wing);
check('the course is built one to one', wingCourse.stations.every((st) => Math.abs(st.clearW - 5) < 1e-9), `${wingCourse.stations[0].clearW}`);
const wingRace = new Race(gatesFromCourse(wingCourse), wingCourse.trackClass);
check('a wing gate scores two metres deep', wingRace.passDepth === 2, `${wingRace.passDepth}`);
const wingLap = syntheticLap(wing, { speed: 20 });
const wingOk = checkLap(wing, encodeGhost(wingLap), wingLap.lapMs);
check('an honest wing lap at cruise is accepted', wingOk.ok === true, wingOk.reason);
check('and it passed every gate', wingOk.gates === 4, `${wingOk.gates}`);
check('and the top speed is cruise', wingOk.ok && Math.abs(wingOk.topSpeed - 20) < 0.5, `${wingOk.topSpeed}`);
const wingSkipped = syntheticLap(wing, { speed: 20, skip: 2 });
const wingBad = checkLap(wing, encodeGhost(wingSkipped), wingSkipped.durationMs);
check('a wing lap that skips a gate is refused', wingBad.ok === false && /never closed/.test(wingBad.reason), wingBad.reason);

/*
 * A track built inside a world: three gates hung in a ring on swiss2, at
 * absolute poses, published as schemaVersion 4. The board checks a lap on
 * it through this same file, so the checker has to read its gates the way
 * the shell races them, from the builder's own race gates.
 */
console.log('\nmap track');
const ring = mapTrackDocument();
check('a map track is written as schemaVersion 4 naming its world', ring.schemaVersion === 4 && ring.map === 'swiss2', `${ring.schemaVersion} ${ring.map}`);
const ringLap = syntheticLap(ring);
check('the synthetic lap closes on the ring', ringLap.lapMs != null && ringLap.gates === 3, `${ringLap.lapMs} ${ringLap.gates}`);
const ringOk = checkLap(ring, encodeGhost(ringLap), ringLap.lapMs);
check('an honest lap of a map track is accepted', ringOk.ok === true, ringOk.reason);
check('and it passed all three gates', ringOk.gates === 3, `${ringOk.gates}`);
const ringSkipped = syntheticLap(ring, { skip: 1 });
const ringBad = checkLap(ring, encodeGhost(ringSkipped), ringSkipped.durationMs);
check('a map lap that skips a gate is refused', ringBad.ok === false && /never closed/.test(ringBad.reason), ringBad.reason);
/* The same gates read as a field track stand somewhere else entirely, so a
 * lap of the ring cannot be claimed on a document that has lost its map. */
const unmapped = { ...ring, schemaVersion: 3 };
delete unmapped.map;
const fieldRead = checkLap(unmapped, encodeGhost(ringLap), ringLap.lapMs);
check('the ring\'s lap does not hold on the same gates read as a field', fieldRead.ok === false, fieldRead.reason);
const moved = mapTrackDocument({ centre: [120, 660, -80], id: ring.id });
const movedRead = checkLap(moved, encodeGhost(ringLap), ringLap.lapMs);
check('nor on the ring raised twenty metres', movedRead.ok === false, movedRead.reason);
const alps = mapTrackDocument({ map: 'alps', id: ring.id });
check('the same ring on another world is a different layout', layoutFingerprint(alps) !== layoutFingerprint(ring));
check('and the same ring on the same world is the same layout', layoutFingerprint(mapTrackDocument({ id: ring.id })) === layoutFingerprint(ring));

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
