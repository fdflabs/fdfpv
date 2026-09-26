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
 *   A track of one gate is a lap of leaving it and coming back through
 *   it: flying on out of the gate after the first pass does not finish
 *   the lap it started, the way it did when every frame inside the scoring
 *   box counted as the next pass.
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
 *   A test flight from a start gate hung more than an opening over the
 *   ground starts in the air before it, at its height on its line of
 *   travel; from any other start gate it starts on the ground as before.
 *   A fixed wing starts at 1.3 times its stall, the Bramor catapult's own
 *   margin, and a quad at rest.
 *
 * The racing line (src/builder/line.js) goes through every gate's opening
 * centre in flying order and round the lap; the speed it implies round a
 * circle is the model's own sqrt(aLat r), capped at top speed; a fixed
 * wing is marked where the line is tighter than its stall allows and not
 * where it is not; a one gate track's line leaves the gate and comes back
 * into it. Every aircraft names the figures the model reads.
 *
 * Each geometry warning fires on a course built to trigger it and is gone
 * when the course is fixed: a gate inside a building, a line through a
 * wall, two gates too close, an opening too small for a wing's span, a
 * gate facing the wrong way round the lap, and a line too tight for a
 * wing.
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
  addGate, axesOf, flipPass, gateSpec, makeStart, moveInLap, newCourse, openingCentre, openingsOf, orderOf, poseOf, qAxis, qMul,
  qRot, raceGatesOf, readoutFor, removeGate, setPose, snapPose, spawnFor, startFor, stepOf, turnGate, worldCaps, SPAWN_BACK,
} from '../src/builder/course.js';
import { Colliders, KINDS, contactMaterial } from '../src/game/collide.js';
import { craftLimits, lineWarnings, racingLine, speedAt } from '../src/builder/line.js';
import { postGive } from '../src/game/crashworld.js';
import { ELEMENTS } from '../src/trackbuilder/elements.js';
import {
  AIRFRAMES, BRAMOR_CATAPULT, airStartSpeed, airframeById,
} from '../configs/airframes.js';
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
console.log('a track of one gate');
{
  /* Flown slowly enough that several frames' travel lies inside the
   * scoring box, which is what the shell does at 60 frames a second: the
   * lap used to finish on the frame after it started. */
  const one = newCourse('swiss2', 'One gate');
  addGate(one, 'gate', { x: 0, y: 100, z: 0 }, qAxis(0, 1, 0, 0));
  const [g] = raceGatesOf(one);
  const race = new Race([g], 'full');
  const t = g.axes.travel;
  const c = g.centre;
  const along = (s) => ({ x: c.x + t.x * s, y: c.y + t.y * s, z: c.z + t.z * s });
  let ms = 0;
  const fly = (from, to, step) => {
    let p = along(from);
    for (let s = from + step; s <= to + 1e-9; s += step) {
      const q = along(s);
      ms += 16;
      race.update(p, q, ms, ms);
      p = q;
    }
  };
  fly(-3, 3, 0.1);
  check('the first pass starts the lap and flying on out of the gate does not finish it',
    race.lapStartMs != null && race.lap === 0 && race.log.length === 0, `lap ${race.lap}, log ${race.log.length}`);
  /* Back round the outside to the entry side: away, then in from behind. */
  const far = { x: c.x + t.x * 3 + 30, y: c.y, z: c.z + t.z * 3 };
  ms += 2000;
  race.update(along(3), far, ms, ms);
  ms += 2000;
  race.update(far, along(-3), ms, ms);
  check('coming back round to the entry side is not a pass either', race.lap === 0);
  fly(-3, 3, 0.1);
  check('through it again: one lap, timed from the first crossing to the second',
    race.lap === 1 && race.laps.length === 1 && race.laps[0] > 4000,
    `lap ${race.lap}, ${race.laps[0]} ms`);
  const lap1 = race.lap;
  fly(3, 6, 0.1);
  check('and leaving it again does not count a second', race.lap === lap1);
  /* A craft that stops in the opening and pokes forward, frame by frame. */
  const hover = new Race([g], 'full');
  let hm = 0;
  let p = along(-2);
  for (let s = -1.9; s <= 0.4; s += 0.05) {
    const q = along(s);
    hm += 16;
    hover.update(p, q, hm, hm);
    p = q;
  }
  check('a craft creeping through the opening starts one lap and finishes none', hover.lapStartMs != null && hover.lap === 0);
  /* Two gates: nothing changed. */
  const two = newCourse('swiss2', 'Two');
  addGate(two, 'gate', { x: 0, y: 100, z: 0 }, qAxis(0, 1, 0, 0));
  addGate(two, 'gate', { x: 0, y: 100, z: -40 }, qAxis(0, 1, 0, 0));
  const pair = new Race(raceGatesOf(two), 'full');
  const g2 = raceGatesOf(two);
  const thru = (gg, m) => pair.update(
    { x: gg.centre.x, y: gg.centre.y, z: gg.centre.z + 1 }, { x: gg.centre.x, y: gg.centre.y, z: gg.centre.z - 1 }, m, m,
  );
  thru(g2[0], 10);
  thru(g2[1], 20);
  thru(g2[0], 30);
  /* Each crossing is timed at the midplane, half way through its frame. */
  check('a two gate lap is scored as before', pair.lap === 1 && pair.laps[0] === 15, `${pair.lap} ${pair.laps[0]}`);
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
  check('and asked about the frozen world alone, as the geometry warnings ask, it does not',
    col.gapAt(onUpright.x, onUpright.y, onUpright.z, 1, true) === Infinity);
  const treeBit = 1 << KINDS.indexOf('tree');
  check('a kind left out is not there, and every other kind still is',
    col.gapAt(30, 5, -10, 1) === 0 && col.gapAt(30, 5, -10, 1, false, treeBit) === Infinity
      && col.gapAt(-35, 4, -55, 1, true, treeBit) === 0);
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

/* ------------------------------------------------------------------ */
console.log('where a test flight starts');
{
  const flat = () => 100;
  const d = newCourse('alps', 'Start');
  addGate(d, 'gate', { x: 0, y: 100, z: 0 }, qAxis(0, 1, 0, 30 * DEG));
  let gates = raceGatesOf(d);
  const onGround = startFor(gates, flat);
  check('a start gate on the ground starts on the ground behind it, as before', !onGround.air && JSON.stringify(onGround) === JSON.stringify(spawnFor(gates)));
  const h = newCourse('alps', 'Hung');
  addGate(h, 'gate', { x: 0, y: 130, z: 0 }, qAxis(0, 1, 0, 30 * DEG));
  gates = raceGatesOf(h);
  const g = gates[0];
  const air = startFor(gates, flat);
  check('a hung start gate starts in the air', Boolean(air.air));
  check('at its height', near(air.air.y, g.centre.y, 1e-9), `${air.air.y} vs ${g.centre.y}`);
  const back = { x: g.centre.x - air.x, y: g.centre.y - air.air.y, z: g.centre.z - air.z };
  check('SPAWN_BACK before it, on its line of travel', near(Math.hypot(back.x, back.y, back.z), SPAWN_BACK, 1e-9)
    && near((back.x * g.axes.travel.x + back.y * g.axes.travel.y + back.z * g.axes.travel.z) / SPAWN_BACK, 1, 1e-9));
  check('facing through it', near(air.yaw, g.heading, 1e-9));
  const hill = (x, z) => (Math.hypot(x - air.x, z - air.z) < 1 ? g.centre.y - 0.5 : 100);
  check('with the ground behind it risen to the start point, the ground start again', !startFor(gates, hill).air);
  const low = newCourse('alps', 'Low');
  addGate(low, 'gate', { x: 0, y: 100.8, z: 0 }, qAxis(0, 1, 0, 0));
  check('a gate on a low stand is still a ground start', !startFor(raceGatesOf(low), flat).air);
}

console.log('an air start\'s speed');
{
  const wings = AIRFRAMES.filter((af) => af.fixedWing);
  check('every fixed wing names its stall', wings.every((af) => af.stall > 0), wings.filter((af) => !(af.stall > 0)).map((af) => af.id).join());
  check('a quad starts at rest', airStartSpeed(airframeById('5inch')) === 0 && airStartSpeed(airframeById('whoop65')) === 0);
  const bramor = airframeById('bramor2300');
  check('the margin is the Bramor catapult\'s: its air start is its release speed',
    Math.abs(airStartSpeed(bramor) - BRAMOR_CATAPULT.speed) / BRAMOR_CATAPULT.speed < 0.01, `${airStartSpeed(bramor)} vs ${BRAMOR_CATAPULT.speed}`);
  console.log(`  ${wings.map((af) => `${af.id} ${airStartSpeed(af).toFixed(2)} m/s`).join(', ')}`);
}

/* ------------------------------------------------------------------ */
console.log('the racing line');
{
  const quad = craftLimits(airframeById('5inch'));
  const sky = craftLimits(airframeById('sky1800'));
  check('every aircraft names a top speed, and every quad its thrust to weight',
    AIRFRAMES.every((af) => af.topSpeed > 0 && (af.fixedWing || af.thrustToWeight > 1)),
    AIRFRAMES.filter((af) => !(af.topSpeed > 0) || (!af.fixedWing && !(af.thrustToWeight > 1))).map((af) => af.id).join());
  check('the five inch: span 0.347 m, sideways 8.4 g of thrust less its 1.62 g of weight',
    near(quad.span, 0.347, 1e-3) && near(quad.aLat, Math.sqrt(8.4 ** 2 - 1.62 ** 2) * 9.80665, 1e-9), `${quad.span} ${quad.aLat}`);
  check('a Skyhunter at 60 degrees of bank stalls at sqrt 2 times 9.2 m/s: no tighter than 9.97 m',
    near(sky.rMin, (2 * 9.2 * 9.2) / (9.80665 * Math.tan(60 * DEG)), 1e-9) && near(sky.rMin, 9.97, 0.01), `${sky.rMin}`);
  for (const af of AIRFRAMES) {
    const c = craftLimits(af);
    console.log(`  ${af.id.padEnd(14)} span ${c.span.toFixed(2)} m, top ${c.topSpeed} m/s, sideways ${c.aLat.toFixed(1)} m/s2, tightest ${c.rMin.toFixed(2)} m`);
  }

  /* A lap of eight gates round a circle, each flown along it. */
  const ring = (R, n = 8, y = 200) => {
    const d = newCourse('swiss2', 'Ring');
    for (let k = 0; k < n; k += 1) {
      const th = (k / n) * 2 * Math.PI;
      addGate(d, 'gate', { x: R * Math.cos(th), y: y - 0.8763, z: R * Math.sin(th) }, qAxis(0, 1, 0, Math.PI - th));
    }
    return raceGatesOf(d);
  };
  const flat = () => 0;
  const gates = ring(10);
  const ln = racingLine(gates, quad, flat);
  const through = gates.every((g, i) => nearV(ln.samples[ln.gateAt[i]], g.centre, 1e-9));
  const ordered = ln.gateAt.every((k, i) => i === 0 || k > ln.gateAt[i - 1]);
  check('the line goes through every gate\'s opening centre, in flying order', through && ordered, ln.gateAt.join());
  const last = ln.samples[ln.samples.length - 1];
  check('and closes the lap: its last point is a step short of the start gate',
    Math.hypot(last.x - gates[0].centre.x, last.y - gates[0].centre.y, last.z - gates[0].centre.z) < 1.5);
  const leaves = gates.every((g, i) => {
    const t = ln.samples[ln.gateAt[i]].tangent;
    return t.x * g.axes.travel.x + t.y * g.axes.travel.y + t.z * g.axes.travel.z > 0.999;
  });
  check('through each gate along its travel', leaves);
  /* The field builder's tangent scale is a shade long for eight 45 degree
   * turns (src/trackbuilder/elements.js derives 1.04 for them), so the
   * curve swings a little either side of the circle. */
  const radii = ln.samples.map((p) => p.r);
  const rLo = Math.min(...radii);
  const rHi = Math.max(...radii);
  const rMean = radii.reduce((a, b) => a + b, 0) / radii.length;
  check('eight gates round a 10 m circle give a line of about 10 m radius',
    rLo > 8 && rHi < 13 && near(rMean, 10, 1), `${rLo.toFixed(2)} to ${rHi.toFixed(2)}, mean ${rMean.toFixed(2)}`);
  check('and the speed it implies is sqrt(aLat r)', ln.samples.every((p) => near(p.v, Math.min(quad.topSpeed, Math.sqrt(quad.aLat * p.r)), 1e-9)),
    `${ln.samples[0].v.toFixed(2)} m/s at ${ln.samples[0].r.toFixed(2)} m`);
  const vMean = ln.samples.reduce((a, p) => a + p.v, 0) / ln.samples.length;
  check('about 28 m/s for the five inch, sqrt(80.8 x 10)', near(vMean, Math.sqrt(quad.aLat * 10), 2), vMean.toFixed(2));
  check('capped at top speed on a wide circle', racingLine(ring(200), quad, flat).samples.every((p) => p.v === quad.topSpeed));
  check('the five inch can fly a 10 m circle', ln.samples.every((p) => p.ok));
  const tight = racingLine(ring(6), sky, flat);
  check('a Skyhunter cannot fly a 6 m circle: all of it is marked', tight.samples.every((p) => !p.ok));
  check('it can fly a 30 m one', racingLine(ring(30), sky, flat).samples.every((p) => p.ok));
  check('speedAt caps and grows', speedAt(quad, 1e9) === 40 && near(speedAt(sky, 10), Math.sqrt(sky.aLat * 10), 1e-12));

  /* One gate: out of it and back into it. */
  const solo = newCourse('swiss2', 'Solo');
  addGate(solo, 'gate', { x: 0, y: 100, z: 0 }, qAxis(0, 1, 0, 0));
  const g1 = raceGatesOf(solo);
  /* Ground rising to the gate's right (its -across is +x here). */
  const slope = (x) => 90 + Math.max(0, x) * 0.5;
  const loop = racingLine(g1, quad, slope);
  const L = loop.samples;
  const R = (quad.topSpeed ** 2) / quad.aLat;
  check('one gate: a loop that starts at its opening centre, along its travel',
    nearV(L[0], g1[0].centre, 1e-9) && L[0].tangent.z < -0.999 && loop.gateAt.join() === '0');
  check('at the radius flown at top speed', L.every((p) => near(p.r, R, 1e-9)) && L.every((p) => p.v === quad.topSpeed), `${R.toFixed(2)} m`);
  const endGap = Math.hypot(L[L.length - 1].x - L[0].x, L[L.length - 1].y - L[0].y, L[L.length - 1].z - L[0].z);
  check('and back into it: its last point is a step behind the opening', endGap < 1.5 && L[L.length - 1].z > L[0].z, endGap.toFixed(3));
  check('on the side with more air under it', L.every((p) => p.x <= 1e-9), `${Math.max(...L.map((p) => p.x)).toFixed(2)}`);
}

/* ------------------------------------------------------------------ */
console.log('geometry warnings');
{
  const quad = craftLimits(airframeById('5inch'));
  const sky = craftLimits(airframeById('sky1800'));
  /* Flat ground at 0 and one building, 10 by 20 by 10 m, at the origin. */
  const house = { x0: -5, x1: 5, y0: 0, y1: 20, z0: -5, z1: 5 };
  const world = {
    heightAt: () => 0,
    solidAt: (x, y, z) => x > house.x0 && x < house.x1 && y > house.y0 && y < house.y1 && z > house.z0 && z < house.z1,
  };
  const course = (list) => {
    const d = newCourse('swiss2', 'Warn');
    for (const [x, y, z, yaw] of list) {
      addGate(d, 'gate', { x, y: y - 0.8763, z }, qAxis(0, 1, 0, yaw));
    }
    return raceGatesOf(d);
  };
  const codes = (gates, c) => lineWarnings(gates, racingLine(gates, c, world.heightAt), c, world);
  const has = (list, code, gate) => list.some((w) => w.code === code && (gate == null || w.gate === gate));
  /* A lap round a triangle, each gate flown along the lap. None of the
   * rules fire on it for the five inch. */
  const clean = [[40, 10, 0, 0], [0, 10, -70, Math.PI / 2], [-40, 10, 0, Math.PI]];
  const ok = codes(course(clean), quad);
  check('a clean lap has no warnings', ok.length === 0, JSON.stringify(ok.map((w) => w.code)));

  const inHouse = codes(course([[0, 10, 0, 0], ...clean.slice(1)]), quad);
  check('blocked: a gate inside the building', has(inHouse, 'blocked', 0), JSON.stringify(inHouse.map((w) => w.code)));
  const buried = codes(course([[40, -1, 0, 0], ...clean.slice(1)]), quad);
  check('blocked: a gate half under the ground', has(buried, 'blocked', 0));

  const wall = codes(course([[0, 10, 30, 0], [0, 10, -30, 0], [-40, 25, 0, Math.PI]]), quad);
  check('clips: the line from gate 1 to gate 2 goes through the building', has(wall, 'clips', 0) && !has(wall, 'blocked'), JSON.stringify(wall.map((w) => w.code)));
  const over = codes(course([[0, 30, 30, 0], [0, 30, -30, 0], [-40, 25, 0, Math.PI]]), quad);
  check('and over its roof it does not', !has(over, 'clips'), JSON.stringify(over.map((w) => w.code)));

  const close = codes(course([[40, 10, 0, 0], [40, 10, -2, 0], [-40, 25, -30, Math.PI]]), quad);
  check('close: two gates 2 m apart, under the five inch\'s 2.5 m', has(close, 'close', 0), JSON.stringify(close.map((w) => w.code)));
  check('and at 60 m they are not', !has(ok, 'close'));

  const wide = codes(course(clean), sky);
  check('small: a 1.75 m gate for a 1.8 m Skyhunter, all three', [0, 1, 2].every((i) => has(wide, 'small', i)));
  check('and not for the five inch', !has(ok, 'small'));

  const turned = codes(course([clean[0], [0, 10, -70, -Math.PI / 2], clean[2]]), quad);
  check('backwards: the middle gate turned round', has(turned, 'backwards', 1), JSON.stringify(turned.map((w) => w.code)));
  check('and turned back it is not', !has(ok, 'backwards'));

  const zig = course([[0, 10, 0, 0], [8, 10, -12, 0], [0, 10, -24, 0], [-8, 10, -12, Math.PI]]);
  const zz = codes(zig, sky);
  check('tight: a Skyhunter round gates 12 m apart', has(zz, 'tight'), JSON.stringify(zz.map((w) => w.code)));
  const round = (R) => course([0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
    const th = (k / 8) * 2 * Math.PI;
    return [R * Math.cos(th), 10, R * Math.sin(th), Math.PI - th];
  }));
  check('and round eight gates on a 30 m circle, not', !has(codes(round(30), sky), 'tight'));
}

console.log('plane sized gates');
{
  const wings = AIRFRAMES.filter((af) => af.fixedWing);
  const span = (af) => 2 * af.dims.hullR;
  const w3 = openingsOf({ type: 'wideGate3', dims: ELEMENTS.wideGate3.dims })[0];
  const w5 = openingsOf({ type: 'wideGate5', dims: ELEMENTS.wideGate5.dims })[0];
  check('the wide gates are built one to one: 3 m and 5 m', near(w3.clearW, 3, 1e-9) && near(w5.clearW, 5, 1e-9), `${w3.clearW} ${w5.clearW}`);
  const small = wings.filter((af) => 2 * span(af) <= w3.clearW);
  const big = wings.filter((af) => 2 * span(af) > w3.clearW);
  check('every fixed wing has a wide gate two of its spans wide',
    big.every((af) => 2 * span(af) <= w5.clearW), big.filter((af) => 2 * span(af) > w5.clearW).map((af) => af.id).join());
  console.log(`  3 m: ${small.map((af) => `${af.id} ${span(af).toFixed(2)}`).join(', ')}; 5 m: ${big.map((af) => `${af.id} ${span(af).toFixed(2)}`).join(', ')}`);
  const pair = ELEMENTS.pylonPair.dims;
  const widest = Math.max(...wings.map(span));
  const rMid = (pair.baseRadius + pair.tipRadius) / 2;
  check('between the pylons at half their height, two spans of the widest wing',
    pair.clearW - 2 * rMid >= 2 * widest, `${(pair.clearW - 2 * rMid).toFixed(2)} vs ${(2 * widest).toFixed(2)}`);

  const d = newCourse('swiss2', 'Air race');
  const up = qAxis(0, 1, 0, 0);
  const wg = addGate(d, 'wideGate5', { x: 0, y: 100, z: 0 }, up);
  const pp = addGate(d, 'pylonPair', { x: 0, y: 100, z: -60 }, up);
  const py = addGate(d, 'pylon', { x: 0, y: 100, z: -120 }, up);
  check('a pylon\'s step carries a side, the left, and no face', d.sequence[2].passSide === 'left' && d.sequence[2].entry === null && d.sequence[2].clearance === 5);
  const spec = gateSpec(wg);
  check('a wide gate is a PVC frame of 1 1/2 inch pipe, the banner kind', spec.frameKind === 'banner' && near(spec.tubeOD, 1.9 * 0.0254, 1e-12));
  const gates = raceGatesOf(d);
  check('the pair scores the plane between the pylons, ground to tips',
    near(gates[1].aperture.clearW, 6) && near(gates[1].aperture.clearH, 8) && near(gates[1].centre.y, 104) && !gates[1].virtual);
  check('the pylon scores the wing class\'s 15 m square beside it, virtual',
    near(gates[2].aperture.clearW, 15) && gates[2].virtual);
  /* Flown along -z, the pilot's left is -x: a pass on the left has the
   * square's centre 7.5 m to -x and its inner edge on the pylon's axis. */
  check('its square is on the pilot\'s left with its inner edge on the axis',
    near(gates[2].centre.x, -7.5) && near(gates[2].centre.x + gates[2].aperture.clearW / 2, 0));

  const pass = (race, i, x, y, z0 = 10) => {
    const g = gates[i];
    race.next = i;
    race.prevSimMs = null;
    const a = { x, y, z: g.centre.z + z0 };
    const b = { x, y, z: g.centre.z - z0 };
    race.update(a, a, 0, 0);
    return race.update(a, b, 200, 0).passed === i;
  };
  const race = new Race(gates.map((x) => ({ ...x })), 'full');
  check('through the wide gate: counted', pass(race, 0, 1.5, 101.5));
  check('between the pylons: counted', pass(race, 1, 2, 103));
  check('over their tips: not', !pass(race, 1, 0, 108.5));
  check('round the pylon on its left: counted', pass(race, 2, -4, 103));
  check('on its right: not', !pass(race, 2, 4, 103));
  check('F turns it round: the right now', flipPass(d, py.id) === 'right' && flipPass(d, wg.id) === null);
  const race2 = new Race(raceGatesOf(d).map((x) => ({ ...x })), 'full');
  gates.splice(0, gates.length, ...raceGatesOf(d));
  check('and on its right it counts', pass(race2, 2, 4, 103));
  check('and on its left it does not', !pass(race2, 2, -4, 103));
  check('its ghost and its mesh show the side: the spec\'s sign', gateSpec(py, stepOf(d, py.id)).passSign === -1 && gateSpec(py).passSign === 1);

  const text = serialize(d);
  const back = deserialize(text).doc;
  check('saved and read back byte for byte, the side with it', serialize(back) === text && back.sequence[2].passSide === 'right'
    && back.elements.map((e) => e.type).join() === 'wideGate5,pylonPair,pylon');
  const field = JSON.parse(text);
  delete field.map;
  field.schemaVersion = 3;
  const fieldBack = normalize(field);
  check('a field track naming one drops it, and says so',
    fieldBack.doc.elements.length === 0 && fieldBack.repairs.filter((r) => /stands only in a world/.test(r)).length === 3, fieldBack.repairs.join(' | '));

  const col = new Colliders();
  col.addPost('tree', 300, -10, 0, 12, 0.4);
  col.build();
  const caps = [];
  for (let k = 0; k < 4; k += 1) {
    caps.push({ kind: 'pylon', ax: 3, ay: k * 2, az: -60, bx: 3, by: (k + 1) * 2, bz: -60, r: 0.5 });
  }
  caps.push({ kind: 'banner', ax: 2.52, ay: 0, az: 0, bx: 2.52, by: 5, bz: 0, r: 0.024 });
  col.setBuilt(caps);
  check('a pylon and a banner frame are colliders of their own kinds',
    col.kindName(col.hit(3, 3, -50, 3, 3, -70)) === 'pylon' && col.kindName(col.hit(2.52, 2, 2, 2.52, 2, -2)) === 'banner');
  check('the banner gives as a PVC gate\'s pipe, the pylon is soft and dead',
    contactMaterial('banner').e === contactMaterial('gate').e && contactMaterial('pylon').e === 0);
  const pvc = postGive('banner', 1.9 * 0.0254 / 2, 1.15);
  const gatePipe = postGive('gate', 1.9 * 0.0254 / 2, 1);
  check('a banner upright gives as 1 1/2 inch pipe whatever the world\'s gate scale', pvc && gatePipe && pvc.ei === gatePipe.ei);
  const base = postGive('pylon', 0.7156, 1, 3.43);
  const tip = postGive('pylon', 0.2094, 1, 2.42);
  check('the pylon collapses at pi p r^3: about 1.2 kN m at the base, 29 N m at the tip',
    near(base.mFree, Math.PI * 1000 * 0.7156 ** 3) && tip.mFree < 30, `${base.mFree.toFixed(0)} ${tip.mFree.toFixed(1)}`);
  check('and it gives nothing without a length', postGive('pylon', 0.5, 1) === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  process.exit(1);
}
