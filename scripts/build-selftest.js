/*
 * build-selftest.js: the in-sim builder's document and arithmetic, in Node.
 *
 *     node scripts/build-selftest.js
 *
 * What it holds, and why each one:
 *
 *   A field track is written exactly as before: schemaVersion 3, no `map`
 *   and no `orientation`, for every shipped preset and the reference
 *   course. The board refuses anything but 1, 2 and 3, so a field track
 *   that started saying 4 would stop being publishable.
 *
 *   A map track (schemaVersion 4) round trips byte for byte, keeps its map
 *   and every gate's full orientation, and a 4 that names no usable map is
 *   read as a field track rather than trusted.
 *
 *   The frame conversion in src/render/frame.js is its own inverse.
 *
 *   The race scores a gate hung at any orientation, rolled on its side and
 *   tilted into a dive, through the hole it has and not through the box
 *   around it, and not from behind.
 *
 *   The placement modes put a gate where they say: upright on the ground,
 *   standing out of a cliff face along its normal, or centred in the air in
 *   front of the camera; the test flight parks behind the start gate facing
 *   it; reordering and choosing the start keep the lap a loop.
 *
 *   The built gates are solid: a gate's colliders, carried by its whole
 *   pose, are met by the collider query in its frame and not in its
 *   opening, follow it when it moves and leave with it, and everything the
 *   world froze at build() answers exactly as it did before, while they
 *   are there and after.
 *
 * The browser half, the builder itself in the real page, is
 * scripts/build-check.js.
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

import {
  MAP_SCHEMA_VERSION, SCHEMA_VERSION, deserialize, isMapTrack, normalize, serialize,
} from '../src/trackbuilder/model.js';
import { PRESETS } from '../src/trackbuilder/presets.js';
import { Race } from '../src/game/race.js';
import {
  addGate, axesOf, makeStart, moveInLap, newCourse, openingCentre, orderOf, poseOf, qAxis, qMul,
  qRot, raceGatesOf, readoutFor, removeGate, setPose, snapPose, spawnFor, turnGate, worldCaps, SPAWN_BACK,
} from '../src/builder/course.js';
import { Colliders } from '../src/game/collide.js';
import { docPosToThree, docQuatToThree, threePosToDoc, threeQuatToDoc } from '../src/render/frame.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const nearV = (a, b, tol = 1e-6) => near(a.x, b.x, tol) && near(a.y, b.y, tol) && near(a.z, b.z, tol);
const fmtV = (v) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
console.log('field tracks are written as they were');
const reference = JSON.parse(await readFile(join(root, 'tests/fixtures/course-reference.json'), 'utf8'));
for (const raw of [...PRESETS, reference]) {
  const text = serialize(normalize(raw).doc);
  const plain = JSON.parse(text);
  const keys = JSON.stringify(plain);
  check(`${raw.name}: schemaVersion ${SCHEMA_VERSION}, no map, no orientation`,
    plain.schemaVersion === SCHEMA_VERSION && !('map' in plain) && !keys.includes('"orientation"'),
    `v${plain.schemaVersion}`);
  check(`${raw.name}: round trips byte for byte`, serialize(deserialize(text).doc) === text);
}

/* ------------------------------------------------------------------ */
console.log('a map track');
const doc = newCourse('swiss2', 'Cliff run');
check('it is a map track, version 4', isMapTrack(doc) && doc.schemaVersion === MAP_SCHEMA_VERSION);
const tilted = qMul(qMul(qAxis(0, 1, 0, 35 * DEG), qAxis(1, 0, 0, -30 * DEG)), qAxis(0, 0, 1, 90 * DEG));
const a = addGate(doc, 'gate', { x: 10, y: 400, z: -20 }, qAxis(0, 1, 0, 0));
const b = addGate(doc, 'ladder', { x: 40, y: 380, z: -60 }, tilted);
const c = addGate(doc, 'flaggedGate', { x: -5, y: 395, z: -90 }, qAxis(0, 1, 0, 170 * DEG));
const text = serialize(doc);
const plain = JSON.parse(text);
check('it is written as version 4 with its map', plain.schemaVersion === 4 && plain.map === 'swiss2', `${plain.schemaVersion} ${plain.map}`);
check('every element carries an orientation', plain.elements.every((e) => e.orientation && typeof e.orientation.w === 'number'));
const back = deserialize(text).doc;
check('it round trips byte for byte', serialize(back) === text);
check('it keeps its map on the way back', back.map === 'swiss2');
const pb = poseOf(back.elements[1]);
const want = poseOf(b);
check('the tilted, rolled ladder keeps its pose',
  nearV(pb.base, want.base, 1e-5) && near(Math.abs(pb.quat.x * want.quat.x + pb.quat.y * want.quat.y + pb.quat.z * want.quat.z + pb.quat.w * want.quat.w), 1, 1e-5),
  `${fmtV(pb.base)} vs ${fmtV(want.base)}`);
const lying = normalize({ ...plain, map: 'no such map!' }).doc;
check('a 4 naming no usable map reads as a field track', !isMapTrack(lying) && JSON.parse(serialize(lying)).schemaVersion === 3);
const oldReader = normalize({ ...plain, schemaVersion: 3 }).doc;
check('and a 3 with a map is not promoted to one', !isMapTrack(oldReader));

/* ------------------------------------------------------------------ */
console.log('frame.js, the document frame');
{
  const v = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  docPosToThree(1.5, -2.25, 7, v);
  check('document +z is scene up and document +y is scene -z', v.x === 1.5 && v.y === 7 && v.z === 2.25);
  const d = threePosToDoc(v.x, v.y, v.z, {});
  check('and back', d.x === 1.5 && d.y === -2.25 && d.z === 7);
  const q = { set(x, y, z, w) { Object.assign(this, { x, y, z, w }); return this; } };
  const o = { w: 0.5, x: 0.5, y: -0.5, z: 0.5 };
  docQuatToThree(o.w, o.x, o.y, o.z, q);
  const r = threeQuatToDoc(q.x, q.y, q.z, q.w, {});
  check('an orientation converts and comes back', r.w === o.w && r.x === o.x && r.y === o.y && r.z === o.z);
  /* A rotation about the document's up is a rotation about the scene's up
   * by the same angle and in the same sense seen from above. */
  const about = { w: Math.cos(0.3), x: 0, y: 0, z: Math.sin(0.3) };
  docQuatToThree(about.w, about.x, about.y, about.z, q);
  check('a yaw about document up is a yaw about scene up', near(q.y, Math.sin(0.3)) && near(q.x, 0) && near(q.z, 0));
}

/* ------------------------------------------------------------------ */
console.log('the race scores a gate at any orientation');
{
  const gates = raceGatesOf(doc);
  check('one race gate per step, in flying order', gates.length === 3 && gates.map((g) => g.elementId).join() === [a.id, b.id, c.id].join());
  const g = gates[1];
  const ax = g.axes;
  const dots = [
    ax.across.x * ax.up.x + ax.across.y * ax.up.y + ax.across.z * ax.up.z,
    ax.up.x * ax.travel.x + ax.up.y * ax.travel.y + ax.up.z * ax.travel.z,
    ax.travel.x * ax.across.x + ax.travel.y * ax.across.y + ax.travel.z * ax.across.z,
  ];
  check('its scoring axes are orthonormal', dots.every((d) => near(d, 0, 1e-9)));
  check('the rolled ladder\'s scoring up is not the world\'s', Math.abs(ax.up.y) < 0.2, `up.y ${ax.up.y.toFixed(3)}`);
  const race = new Race(gates.map((x) => ({ ...x })), 'full', { recordSuffix: '.build.test' });
  race.next = 1;
  const cen = g.centre;
  const t = ax.travel;
  const along = (s, off = { x: 0, y: 0, z: 0 }) => ({
    x: cen.x + t.x * s + off.x, y: cen.y + t.y * s + off.y, z: cen.z + t.z * s + off.z,
  });
  let r = race.update(along(-1.5), along(-1.5), 0, 0);
  r = race.update(along(-1.5), along(1.5), 100, 0);
  check('a line through the centre along travel is a pass', r.passed === 1, `${r.passed}`);
  race.next = 1;
  race.prevSimMs = null;
  race.update(along(1.5), along(1.5), 0, 0);
  r = race.update(along(1.5), along(-1.5), 100, 0);
  check('the same line flown backwards is not', r.passed == null);
  /* Offset along the gate's own UP by more than half its height: outside a
   * rolled opening, though a world up box round it would have taken it. */
  const hH = g.aperture.clearH * 0.5;
  const off = { x: ax.up.x * (hH + 0.3), y: ax.up.y * (hH + 0.3), z: ax.up.z * (hH + 0.3) };
  race.next = 1;
  race.prevSimMs = null;
  race.update(along(-1.5, off), along(-1.5, off), 0, 0);
  r = race.update(along(-1.5, off), along(1.5, off), 100, 0);
  check('a line past the rolled opening\'s edge is not a pass', r.passed == null);
  const inside = { x: ax.up.x * (hH - 0.3), y: ax.up.y * (hH - 0.3), z: ax.up.z * (hH - 0.3) };
  race.next = 1;
  race.prevSimMs = null;
  race.update(along(-1.5, inside), along(-1.5, inside), 0, 0);
  r = race.update(along(-1.5, inside), along(1.5, inside), 100, 0);
  check('and one just inside it is', r.passed === 1);
  race.setRecordKey('webfpv.best.x');
  check('a built course keeps its record under its own key', race.key === 'webfpv.best.x.build.test', race.key);
}

/* ------------------------------------------------------------------ */
console.log('placement');
{
  const cam = { position: { x: 0, y: 100, z: 0 }, forward: { x: 0, y: -0.2, z: -0.98 } };
  const turn = { yaw: 0, pitch: 0, roll: 0 };
  const flat = { point: { x: 3, y: 20, z: -40 }, normal: { x: 0.3, y: 0.95, z: 0 } };
  const ground = snapPose('ground', flat, cam, turn, 20, 0.88);
  const up = qRot(ground.quat, 0, 1, 0);
  const tr = qRot(ground.quat, 0, 0, -1);
  check('ground: stands on the hit point', nearV(ground.base, flat.point));
  check('ground: upright whatever the slope', near(up.y, 1, 1e-9));
  check('ground: flown the way the camera looks', tr.z < -0.99, fmtV(tr));
  const wall = { point: { x: 5, y: 60, z: -30 }, normal: { x: 0, y: 0, z: 1 } };
  const face = snapPose('surface', wall, cam, turn, 20, 0.88);
  const fu = qRot(face.quat, 0, 1, 0);
  const ft = qRot(face.quat, 0, 0, -1);
  check('surface: stands out of a cliff face along its normal', nearV(fu, { x: 0, y: 0, z: 1 }, 1e-9), fmtV(fu));
  check('surface: flown along the face, down it when the camera looks at it', near(ft.x * 0 + ft.y * 0 + ft.z * 1, 0, 1e-9) && ft.y < -0.9, fmtV(ft));
  const air = snapPose('air', null, cam, turn, 20, 0.88);
  const centre = qRot(air.quat, 0, 0.88, 0);
  const at = { x: air.base.x + centre.x, y: air.base.y + centre.y, z: air.base.z + centre.z };
  const aim = { x: 0 + cam.forward.x * 20, y: 100 + cam.forward.y * 20, z: 0 + cam.forward.z * 20 };
  check('air: the opening is centred where the camera points, at the distance', nearV(at, aim, 1e-9), `${fmtV(at)} vs ${fmtV(aim)}`);
  const lost = snapPose('ground', null, cam, turn, 20, 0.88);
  check('ground with nothing under the crosshair falls back to air, and says so', lost.mode === 'air');
  const dive = snapPose('air', null, cam, { yaw: 0, pitch: -60 * DEG, roll: 0 }, 20, 0.88);
  check('a negative tilt points the travel down: a dive gate', qRot(dive.quat, 0, 0, -1).y < -0.8);
}

/* ------------------------------------------------------------------ */
console.log('the lap');
{
  const d = newCourse('alps', 'Lap');
  const g1 = addGate(d, 'gate', { x: 0, y: 10, z: 0 }, qAxis(0, 1, 0, 0));
  const g2 = addGate(d, 'gate', { x: 0, y: 30, z: -50 }, qAxis(0, 1, 0, 0));
  const g3 = addGate(d, 'tower', { x: 20, y: 5, z: -90 }, qAxis(0, 1, 0, 0));
  moveInLap(d, g3.id, -1);
  check('a gate moves one step earlier', d.sequence.map((s) => s.elementId).join() === [g1.id, g3.id, g2.id].join());
  makeStart(d, g2.id);
  check('choosing a start turns the loop, and keeps its order', d.sequence.map((s) => s.elementId).join() === [g2.id, g1.id, g3.id].join());
  check('the start is first in flying order', orderOf(d, g2.id) === 0);
  const gates = raceGatesOf(d);
  const sp = spawnFor(gates);
  const start = gates[0];
  check('the test flight parks SPAWN_BACK behind the start gate',
    near(Math.hypot(sp.x - start.centre.x, sp.z - start.centre.z), SPAWN_BACK, 1e-9) && sp.z > start.centre.z, `${sp.x},${sp.z}`);
  check('facing through it', near(sp.yaw, start.heading, 1e-9));
  const ro = readoutFor(gates, 0, () => 12);
  const c0 = openingCentre(g2, 0);
  const c1 = openingCentre(g1, 0);
  check('the readout: height over the ground under the opening', near(ro.height, c0.y - 12, 1e-9), `${ro.height}`);
  check('the readout: the drop and distance to the next gate',
    near(ro.next.drop, c0.y - c1.y, 1e-9) && near(ro.next.distance, Math.hypot(c0.x - c1.x, c0.y - c1.y, c0.z - c1.z), 1e-9));
  const hang = turnGate(g2, 'roll', 90 * DEG);
  const beforeC = openingCentre(g2, 0);
  g2.position = threePosToDoc(hang.base.x, hang.base.y, hang.base.z, {});
  g2.orientation = threeQuatToDoc(hang.quat.x, hang.quat.y, hang.quat.z, hang.quat.w, {});
  check('a gate turned in place turns about its opening, not its feet', nearV(openingCentre(g2, 0), beforeC, 1e-6));
  check('and rolled a quarter turn it lies on its side', Math.abs(axesOf(poseOf(g2).quat).up.y) < 1e-6);
  removeGate(d, g1.id);
  check('deleting a gate takes its step with it', d.elements.length === 2 && d.sequence.length === 2 && orderOf(d, g1.id) === -1);
}

/* ------------------------------------------------------------------ */
console.log('the built gates are solid');
{
  /* A world with some of everything, frozen once, and the answers its
   * queries give before anything is built in it. */
  const col = new Colliders();
  col.addPost('tree', 30, -10, 0, 12, 0.4);
  col.addBox('wall', -40, 0, -60, -30, 8, -50);
  col.add('gate', 5, 1, -20, 7, 1, -20, 0.02);
  col.addSphere('canopy', 30, 14, -10, 3);
  col.build();
  const probes = [
    [20, 5, -10, 40, 5, -10], [-50, 4, -55, -20, 4, -55], [6, 1, -25, 6, 1, -15], [30, 20, -10, 30, 8, -10], [60, 3, 0, 60, 3, -100],
  ];
  const answer = (p) => {
    const k = col.hit(...p);
    return [k, col.hitIndex, col.hitT, col.hitNx, col.hitNy, col.hitNz, col.hitPen, col.hitOverlap].join();
  };
  const before = probes.map(answer);
  const gapBefore = col.gapAt(0, 3, -50, 5);
  const baseCount = col.count;
  const cellsBefore = new Map(col.grid);

  /* A gate's own frame, as scene.js obstacle() builds one: two uprights and
   * two bars round a 1.75 m opening, 0.02 m tubes. */
  const W = 1.7526;
  const R = 0.02;
  const s = W / 2 + R;
  const local = [
    { kind: 'gate', ax: -s, ay: 0, az: 0, bx: -s, by: W + 2 * R, bz: 0, r: R },
    { kind: 'gate', ax: s, ay: 0, az: 0, bx: s, by: W + 2 * R, bz: 0, r: R },
    { kind: 'gate', ax: -s, ay: R, az: 0, bx: s, by: R, bz: 0, r: R },
    { kind: 'gate', ax: -s, ay: W + R, az: 0, bx: s, by: W + R, bz: 0, r: R },
  ];
  const d = newCourse('swiss2', 'Solid');
  const hungQ = qMul(qAxis(0, 1, 0, 40 * DEG), qAxis(0, 0, 1, 25 * DEG));
  const el = addGate(d, 'gate', { x: 0, y: 3, z: -50 }, hungQ);
  const caps = worldCaps(el, local);
  const { base: gb, quat: gq } = poseOf(el);
  const upr = qRot(gq, s, 0.9, 0);
  const foot = qRot(gq, s, 0, 0);
  check('worldCaps carries a member by the whole pose',
    nearV({ x: caps[1].ax, y: caps[1].ay, z: caps[1].az }, { x: gb.x + foot.x, y: gb.y + foot.y, z: gb.z + foot.z }, 1e-12) && caps[1].r === R);
  col.setBuilt(caps);
  const g = raceGatesOf(d)[0];
  const t = g.axes.travel;
  const through = (c, back = 2, ahead = 2) => [c.x - t.x * back, c.y - t.y * back, c.z - t.z * back, c.x + t.x * ahead, c.y + t.y * ahead, c.z + t.z * ahead];
  const onUpright = { x: gb.x + upr.x, y: gb.y + upr.y, z: gb.z + upr.z };
  const kGate = col.hit(...through(onUpright));
  check('a flight into a built gate\'s upright hits a gate', col.kindName(kGate) === 'gate' && col.hitIndex >= baseCount, `${col.kindName(kGate)} ${col.hitIndex}`);
  check('its opening is open', col.hit(...through(g.centre)) === -1);
  check('the gap query sees it', col.gapAt(onUpright.x, onUpright.y, onUpright.z, 1) < 0.05);
  check('everything frozen answers exactly as before', probes.map(answer).join('|') === before.join('|'));

  /* Moved: the old place empty, the new one solid. */
  const moved = { x: 20, y: 6, z: -80 };
  setPose(el, moved, hungQ);
  col.setBuilt(worldCaps(el, local));
  check('moved, the old upright is air', col.hit(...through(onUpright)) === -1);
  const upr2 = qRot(gq, s, 0.9, 0);
  const onUpright2 = { x: moved.x + upr2.x, y: moved.y + upr2.y, z: moved.z + upr2.z };
  check('and the new one is solid', col.kindName(col.hit(...through(onUpright2))) === 'gate');

  /* Deleted: what build() froze and nothing else. */
  removeGate(d, el.id);
  col.setBuilt([]);
  check('deleted, nothing is left', col.hit(...through(onUpright2)) === -1 && col.count === baseCount);
  check('every cell is the frozen one again', col.grid.size === cellsBefore.size && [...col.grid].every(([k, v]) => cellsBefore.get(k) === v));
  check('and every query answers as before', probes.map(answer).join('|') === before.join('|') && col.gapAt(0, 3, -50, 5) === gapBefore);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  process.exit(1);
}
