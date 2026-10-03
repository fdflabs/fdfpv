/*
 * lap-selftest.js: the headless lap check against laps it must accept and
 * laps it must refuse.
 *
 * A synthetic lap is threaded through a track built in a world, three gates
 * hung in a ring (tests/lib/maptrack.js): from the timing gate, two metres
 * out of every gate in flying order, back through the timing gate, sampled
 * at the ghost rate at a steady speed and encoded with the real encoder.
 * Then the same lap is broken one way at a time, and each break must be
 * refused for the reason the check names. It was threaded through the 2022
 * AU Nationals field track until the race field went; the checks are the
 * same checks. Then a wing course of five metre gates on the 400 by 300 m
 * airfield is built with the document model and flown at cruise, and the
 * same skip is refused: the board still takes the field tracks published
 * before the field went, and checks their laps through this same file.
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

import { encodeGhost } from '../src/share/ghostdata.js';
import { checkLap, gatesFromCourse, LAP_TOLERANCE_MS, planesFor } from '../src/game/verify.js';
import { AIRFRAMES } from '../configs/airframes.js';
import { craftLimits, SPAN_ROOM } from '../src/builder/line.js';
import { courseFromDocument } from '../src/game/trackdoc.js';
import { Race } from '../src/game/race.js';
import { trackClassOf } from '../src/trackbuilder/elements.js';
import { createElement, createSequenceEntry, createTrack } from '../src/trackbuilder/model.js';
import { applyAutoFaces } from '../src/trackbuilder/faces.js';
import { syntheticLap } from '../tests/lib/synthlap.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { layoutFingerprint } from '../src/share/listing.js';

const doc = mapTrackDocument({ name: 'Lap check ring' });

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
check('the ring has gates', honest.gates > 0, `${honest.gates}`);
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

/*
 * Planes on a map track. A plane races a track built inside a world when it
 * fits every gate by the builder's own rule, its lap names it, and the
 * board files it on the plane board. The check scores the same gates the
 * same way for every aircraft; what it adds for a plane is only whether the
 * named plane fits through them at all.
 */
console.log('\nplanes on a map track');
const planeIds = AIRFRAMES.filter((af) => af.fixedWing).map((af) => af.id);
/* A five inch gate is 1.75 m across as built, which is 1.2 spans of a
 * 1.46 m plane: the Cub and the smaller ones fit it, the Skyhunter and the
 * bigger ones do not, and the rule says so rather than a list. */
const ringPlanes = planesFor(ring);
check('the ring of five inch gates takes the small planes only: the Cub in, the Skyhunter and the Bramor out',
  ringPlanes.includes('cub1400') && !ringPlanes.includes('sky1800') && !ringPlanes.includes('bramor2300'), ringPlanes.join());
check('no plane races a field track through planesFor: the airfield is its own class', planesFor(wing).length === 0);
/* Who a ring takes, by the builder's rule worked out here from the spans
 * alone: every plane 1.2 of whose spans clear its narrowest gate. */
const fitting = (widest) => AIRFRAMES.filter((af) => af.fixedWing && craftLimits(af).span * SPAN_ROOM <= widest).map((af) => af.id);
const large = mapTrackDocument({ radius: 70, types: ['wideGate5', 'pylonPair', 'wideGate5'], name: 'Large ring' });
check(`every fixed wing fits the 5 m gates and the pylon pair: ${planeIds.length} of them`,
  JSON.stringify(planesFor(large)) === JSON.stringify(planeIds), planesFor(large).join());
const wide = mapTrackDocument({ radius: 70, types: ['wideGate5', 'pylonPair', 'wideGate3'], name: 'Wide ring' });
check('with a 3 m gate in the ring, the planes 1.2 of whose spans clear 3 m and no others',
  JSON.stringify(planesFor(wide)) === JSON.stringify(fitting(3)), `${planesFor(wide).join()} against ${fitting(3).join()}`);
const wideLap = syntheticLap(wide, { speed: 20 });
const wideBytes = encodeGhost(wideLap);
check('a synthetic lap closes on the wide ring', wideLap.lapMs != null && wideLap.gates === 3, `${wideLap.lapMs} ${wideLap.gates}`);
const quadOnWide = checkLap(wide, wideBytes, wideLap.lapMs);
check('posted bare, it is a quad\'s lap as always, and accepted', quadOnWide.ok === true, quadOnWide.reason);
const skyOnWide = checkLap(wide, wideBytes, wideLap.lapMs, 'sky1800');
check('named for the Skyhunter, it is accepted', skyOnWide.ok === true, skyOnWide.reason);
const floatsOnWide = checkLap(wide, wideBytes, wideLap.lapMs, 'timber1500f');
check('and for the Timber on floats', floatsOnWide.ok === true, floatsOnWide.reason);
const skyOnRing = checkLap(ring, encodeGhost(ringLap), ringLap.lapMs, 'sky1800');
check('a Skyhunter lap on five inch gates is refused: it does not fit', skyOnRing.ok === false && /does not fit gate 1/.test(skyOnRing.reason), skyOnRing.reason);
const skyOnField = checkLap(wing, encodeGhost(wingLap), wingLap.lapMs, 'sky1800');
check('a lap naming a plane on a field track is refused', skyOnField.ok === false && /field track/.test(skyOnField.reason), skyOnField.reason);
const quadNamed = checkLap(wide, wideBytes, wideLap.lapMs, 'interceptor');
check('a lap naming a quad is refused: a quad\'s lap names nothing', quadNamed.ok === false && /not a fixed wing/.test(quadNamed.reason), quadNamed.reason);
const unknown = checkLap(wide, wideBytes, wideLap.lapMs, 'sopwith');
check('and one naming no aircraft there is', unknown.ok === false && /not a fixed wing/.test(unknown.reason), unknown.reason);
const wideSkipped = syntheticLap(wide, { speed: 20, skip: 1 });
const planeSkip = checkLap(wide, encodeGhost(wideSkipped), wideSkipped.durationMs, 'sky1800');
check('a plane\'s lap that skips the pylon pair is refused', planeSkip.ok === false && /never closed/.test(planeSkip.reason), planeSkip.reason);
/* The narrowest plane gate there is: 3 m, which every plane up to 2.5 m
 * across clears with 1.2 of its spans and the Striker, 3.15 m across its
 * sweep, does not (3.78 m). It races the 5 m gates and the
 * pylons and is turned away from a ring with a 3 m gate in it, by the
 * same rule and the same words as any plane too big for a gate. */
const tight = mapTrackDocument({ radius: 70, types: ['wideGate3', 'wideGate3', 'wideGate3'] });
check('the 3 m gates take every plane 1.2 of whose spans clear 3 m and no others',
  JSON.stringify(planesFor(tight)) === JSON.stringify(fitting(3)), `${planesFor(tight).join()} against ${fitting(3).join()}`);
const largeLap = syntheticLap(large, { speed: 20 });
const strikerOnLarge = checkLap(large, encodeGhost(largeLap), largeLap.lapMs, 'striker2500');
check('a Striker lap through the 5 m gates and the pylons is accepted', strikerOnLarge.ok === true, strikerOnLarge.reason);
const tightLap = syntheticLap(tight, { speed: 20 });
const strikerOnTight = checkLap(tight, encodeGhost(tightLap), tightLap.lapMs, 'striker2500');
check('and one through 3 m gates is refused: the Striker does not fit gate 1, 3.00 m wide',
  strikerOnTight.ok === false && /Striker does not fit gate 1, 3\.00 m wide/.test(strikerOnTight.reason), strikerOnTight.reason);

console.log(`\n${failed ? `${failed} FAILED, ` : ''}${passed} passed`);
process.exit(failed ? 1 : 0);
