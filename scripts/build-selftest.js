/*
 * build-selftest.js: the in-sim builder's document and arithmetic, in Node.
 *
 *     node scripts/build-selftest.js
 *
 * What it holds, and why each one:
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
 *   The snap puts a piece where it says: upright on ground and slopes,
 *   standing out of a cliff face along its normal, or centred in the air in
 *   front of the camera with Alt held or nothing under the crosshair; the
 *   grid rounds it to half a metre and fifteen degrees without lifting it
 *   off what it stands on; a carried piece keeps its own orientation. The
 *   test flight parks behind the start gate facing it; clicking the lap in
 *   order and choosing the start keep the lap a loop.
 *
 *   The pieces: every placeable type is one, the default hotbar is nine of
 *   them, a middle click reads the right one back (the start gate, a pylon
 *   by its side), and the ghost's race gate is the placed one's, so it is
 *   red by the blocked warning's own rule. Undo and redo walk whole
 *   documents; two pieces overlap when their solids do; the gizmo moves
 *   along the level and up, and turns about the gate's own axes.
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
 * The Save button (src/builder/hud.js, on a stand in DOM): it is on the
 * builder's screen, a click on it is the builder's own save, the one Ctrl S
 * and a pad's Start call, the name its first save asks for is checked by
 * the tracks server's own rules, and what it says follows the save: not saved,
 * saved in this browser, saved and waiting to go online, online, refused;
 * and an edit after the save is not saved again.
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

import {
  MAP_SCHEMA_VERSION, deserialize, isMapTrack, normalize, serialize, toPlain,
} from '../src/trackbuilder/model.js';
import { inspectCourse, layoutFingerprint } from '../src/share/listing.js';
import { courseSeatKey } from '../src/share/session.js';
import {
  NEAR_POINTS, PASS_POINTS, PLANE_REACH, Race,
} from '../src/game/race.js';
import {
  BUILD_TYPES, CASUAL, CHAIN, DEFAULT_HOTBAR, DEFAULT_WING_HOTBAR, HOOP_TYPES, HOTBAR_SLOTS, PIECES, PIECE_CATS, RETIRED_HOOPS, WING_FIRST, addGate, casualCourse, chainPose, axesOf,
  capsOverlap, createHistory, gateSpec, gizmoAxes, makeStart, newCourse, offeredPiece, openingCentre, openingsOf, orderOf, pieceById, pieceGate, pieceOf, poseOf, qAxis,
  qMul, qRot, raceGatesOf, restoreHotbar,
  readoutFor, removeGate, setOrder, setPose, snapPose, spawnFor, startFor, floatStart, stepOf, turnGate, worldCaps, SPAWN_BACK,
} from '../src/builder/course.js';
import { Colliders, KINDS, contactMaterial } from '../src/game/collide.js';
import {
  HOOP_ROOM, SPAN_ROOM, craftLimits, lineWarnings, misfitGate, openingBlocked, racingLine, speedAt,
} from '../src/builder/line.js';
import { postGive } from '../src/game/crashworld.js';
import { planesFor } from '../src/game/verify.js';
import { ELEMENTS } from '../src/trackbuilder/elements.js';
import {
  AIRFRAMES, BRAMOR_CATAPULT, airStartSpeed, airframeById,
} from '../configs/airframes.js';
import { docPosToThree, docQuatToThree, threePosToDoc, threeQuatToDoc } from '../src/render/frame.js';
import { readFileSync } from 'node:fs';
import { createHud } from '../src/builder/hud.js';
import { createSaveMark, saveState, trackNameFor } from '../src/builder/course.js';
import { badWordIn } from '../tracks-api/words.js';

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
  const ground = snapPose(flat, cam, turn, 20, 0.88);
  const up = qRot(ground.quat, 0, 1, 0);
  const tr = qRot(ground.quat, 0, 0, -1);
  check('ground: a slope is ground, and the gate stands on the hit point', ground.mode === 'ground' && nearV(ground.base, flat.point));
  check('ground: upright whatever the slope', near(up.y, 1, 1e-9));
  check('ground: flown the way the camera looks', tr.z < -0.99, fmtV(tr));
  const steep = { point: flat.point, normal: { x: Math.sin(55 * DEG), y: Math.cos(55 * DEG), z: 0 } };
  check('a face 55 degrees off level is a face, 45 is still ground',
    snapPose(steep, cam, turn, 20, 0.88).mode === 'surface'
    && snapPose({ point: flat.point, normal: { x: Math.sin(45 * DEG), y: Math.cos(45 * DEG), z: 0 } }, cam, turn, 20, 0.88).mode === 'ground');
  const wall = { point: { x: 5, y: 60, z: -30 }, normal: { x: 0, y: 0, z: 1 } };
  const face = snapPose(wall, cam, turn, 20, 0.88);
  const fu = qRot(face.quat, 0, 1, 0);
  const ft = qRot(face.quat, 0, 0, -1);
  check('surface: stands out of a cliff face along its normal', face.mode === 'surface' && nearV(fu, { x: 0, y: 0, z: 1 }, 1e-9), fmtV(fu));
  check('surface: flown along the face, down it when the camera looks at it', near(ft.x * 0 + ft.y * 0 + ft.z * 1, 0, 1e-9) && ft.y < -0.9, fmtV(ft));
  const air = snapPose(null, cam, turn, 20, 0.88);
  const centre = qRot(air.quat, 0, 0.88, 0);
  const at = { x: air.base.x + centre.x, y: air.base.y + centre.y, z: air.base.z + centre.z };
  const aim = { x: 0 + cam.forward.x * 20, y: 100 + cam.forward.y * 20, z: 0 + cam.forward.z * 20 };
  check('nothing under the crosshair: the opening is centred where the camera points, at the distance, and it says air',
    air.mode === 'air' && nearV(at, aim, 1e-9), `${fmtV(at)} vs ${fmtV(aim)}`);
  const held = snapPose(flat, cam, turn, 20, 0.88, { air: true });
  check('Alt held hangs it in the air even over ground', held.mode === 'air' && nearV(held.base, air.base, 1e-9));
  const dive = snapPose(null, cam, { yaw: 0, pitch: -60 * DEG, roll: 0 }, 20, 0.88);
  check('a negative tilt points the travel down: a dive gate', qRot(dive.quat, 0, 0, -1).y < -0.8);

  /* The grid: half a metre and fifteen degrees. */
  const skew = { position: { x: 0.13, y: 100, z: 0.41 }, forward: { x: Math.sin(-7 * DEG) * 0.98, y: -0.2, z: -Math.cos(7 * DEG) * 0.98 } };
  const gAir = snapPose(null, skew, turn, 20, 0.88, { grid: true });
  const gc = qRot(gAir.quat, 0, 0.88, 0);
  const onGrid = (v) => near(v / 0.5, Math.round(v / 0.5), 1e-9);
  check('grid, in the air: the opening centre on the half metre grid',
    onGrid(gAir.base.x + gc.x) && onGrid(gAir.base.y + gc.y) && onGrid(gAir.base.z + gc.z), fmtV({ x: gAir.base.x + gc.x, y: gAir.base.y + gc.y, z: gAir.base.z + gc.z }));
  const gt = qRot(gAir.quat, 0, 0, -1);
  const gh = Math.atan2(-gt.x, -gt.z) / DEG;
  check('grid: the heading on 15 degrees', near(gh / 15, Math.round(gh / 15), 1e-6), `${gh.toFixed(3)} deg`);
  const slope = { point: { x: 3.3, y: 20.07, z: -40.2 }, normal: { x: 0.3, y: 0.95, z: 0.1 } };
  const gG = snapPose(slope, cam, turn, 20, 0.88, { grid: true });
  const nG = Math.hypot(0.3, 0.95, 0.1);
  const offPlane = ((gG.base.x - 3.3) * 0.3 + (gG.base.y - 20.07) * 0.95 + (gG.base.z + 40.2) * 0.1) / nG;
  check('grid, on a slope: x and z on the grid and the base still on the ground plane',
    onGrid(gG.base.x) && onGrid(gG.base.z) && Math.abs(offPlane) < 1e-9, `${fmtV(gG.base)}, ${offPlane.toExponential(1)} m off`);
  const gF = snapPose({ point: { x: 5.2, y: 60.3, z: -30 }, normal: { x: 0, y: 0, z: 1 } }, cam, turn, 20, 0.88, { grid: true });
  check('grid, on a face: on the grid in the face and still on it', onGrid(gF.base.x) && onGrid(gF.base.y) && near(gF.base.z, -30, 1e-9), fmtV(gF.base));

  /* A carried piece keeps its own orientation wherever it goes. */
  const tilted = qMul(qAxis(0, 1, 0, 1.1), qAxis(1, 0, 0, -0.4));
  const carried = snapPose(wall, cam, turn, 20, 0.88, { keep: tilted });
  const kept = ['x', 'y', 'z', 'w'].every((k) => near(Math.abs(carried.quat[k]), Math.abs(tilted[k]), 1e-9));
  check('carried: it keeps its orientation even against a face, and lands on the hit point', kept && nearV(carried.base, wall.point, 1e-9));
  const turned = snapPose(null, cam, { yaw: 15 * DEG, pitch: 0, roll: 0 }, 20, 0.88, { keep: tilted });
  const ty = qRot(turned.quat, 0, 1, 0);
  const oy = qRot(tilted, 0, 1, 0);
  check('carried: R turns it about its own up', nearV(ty, oy, 1e-9) && !['x', 'y', 'z', 'w'].every((k) => near(turned.quat[k], tilted[k], 1e-6)));
}

/* ------------------------------------------------------------------ */
console.log('the pieces');
{
  check('every type the builder places is a piece, and the retired hoops are not',
    BUILD_TYPES.every((t) => RETIRED_HOOPS.includes(t) !== PIECES.some((p) => p.type === t)));
  check('every piece is on an inventory shelf', PIECES.every((p) => PIECE_CATS.includes(p.cat)));
  check('the default hotbar is nine real pieces', DEFAULT_HOTBAR.length === HOTBAR_SLOTS && DEFAULT_HOTBAR.every((id) => pieceById(id)));
  const d = newCourse('swiss2', 'Pieces');
  const q = qAxis(0, 1, 0, 0);
  const a = addGate(d, 'gate', { x: 0, y: 10, z: 0 }, q);
  const b = addGate(d, 'gate', { x: 0, y: 10, z: -30 }, q);
  const l = addGate(d, 'pylon', { x: 20, y: 10, z: -60 }, q);
  const r = addGate(d, 'pylon', { x: 20, y: 10, z: -90 }, q, 'right');
  check('a right hand pylon piece lands passed on its right', stepOf(d, r.id).passSide === 'right' && stepOf(d, l.id).passSide === 'left');
  check('a middle click reads the piece back: the start gate, a gate, and each pylon by its side',
    pieceOf(d, a.id).id === 'start' && pieceOf(d, b.id).id === 'gate' && pieceOf(d, l.id).id === 'pylon' && pieceOf(d, r.id).id === 'pylonRight');
  const pg = pieceGate(pieceById('pylonRight'), poseOf(r).base, poseOf(r).quat);
  const rg = raceGatesOf(d)[3];
  check('the ghost\'s race gate is the placed one\'s, scoring square and all', nearV(pg.centre, rg.centre, 1e-9) && near(pg.aperture.clearW, rg.aperture.clearW, 1e-9));
}

/* ------------------------------------------------------------------ */
console.log('undo, overlap and the gizmo');
{
  const h = createHistory(3);
  check('nothing to undo on a new track', h.undo('now') === null);
  h.record('a');
  h.record('b');
  check('undo steps back one edit at a time', h.undo('c') === 'b' && h.undo('b') === 'a' && h.undo('a') === null);
  check('and redo forward again', h.redo('a') === 'b' && h.redo('b') === 'c' && h.redo('c') === null);
  h.undo('c');
  h.record('x');
  check('a new edit forgets what could be redone', h.redo('y') === null);
  ['1', '2', '3', '4', '5'].forEach((s) => h.record(s));
  check('and it holds only so many', h.depth.undo === 3);

  const d = newCourse('swiss2', 'Overlap');
  const g1 = addGate(d, 'gate', { x: 0, y: 10, z: 0 }, qAxis(0, 1, 0, 0));
  const caps = (el) => worldCaps(el, [
    { kind: 'gate', ax: -0.85, ay: 0, az: 0, bx: -0.85, by: 1.7, bz: 0, r: 0.03 },
    { kind: 'gate', ax: 0.85, ay: 0, az: 0, bx: 0.85, by: 1.7, bz: 0, r: 0.03 },
    { kind: 'gate', ax: -0.85, ay: 1.7, az: 0, bx: 0.85, by: 1.7, bz: 0, r: 0.03 },
  ]);
  const same = addGate(d, 'gate', { x: 0.2, y: 10, z: 0 }, qAxis(0, 1, 0, 0));
  const crossed = addGate(d, 'gate', { x: 0, y: 10, z: 0 }, qAxis(0, 1, 0, Math.PI / 2));
  const beside = addGate(d, 'gate', { x: 3, y: 10, z: 0 }, qAxis(0, 1, 0, 0));
  const behind = addGate(d, 'gate', { x: 0, y: 10, z: 2 }, qAxis(0, 1, 0, 0));
  check('a gate on another, or crossed through it, overlaps it', capsOverlap(caps(g1), caps(same)) && capsOverlap(caps(g1), caps(crossed)));
  check('one beside it or behind it does not', !capsOverlap(caps(g1), caps(beside)) && !capsOverlap(caps(g1), caps(behind)));

  const tilt = addGate(d, 'gate', { x: 0, y: 10, z: 0 }, qMul(qAxis(0, 1, 0, 0.7), qAxis(1, 0, 0, -0.6)));
  const gz = gizmoAxes(tilt);
  const tt = axesOf(poseOf(tilt).quat).travel;
  check('the gizmo moves a tilted gate along the level: ahead is its travel laid flat, and up is straight up',
    near(gz.move.travel.y, 0, 1e-12) && near(gz.move.up.y, 1, 1e-12) && gz.move.travel.x * tt.x + gz.move.travel.z * tt.z > 0.7);
  check('and turns it about its own axes, from its opening', nearV(gz.turn.roll, tt, 1e-12) && nearV(gz.pivot, openingCentre(tilt, 0), 1e-12));
}

/* ------------------------------------------------------------------ */
console.log('the lap');
{
  const d = newCourse('alps', 'Lap');
  const g1 = addGate(d, 'gate', { x: 0, y: 10, z: 0 }, qAxis(0, 1, 0, 0));
  const g2 = addGate(d, 'gate', { x: 0, y: 30, z: -50 }, qAxis(0, 1, 0, 0));
  const g3 = addGate(d, 'tower', { x: 20, y: 5, z: -90 }, qAxis(0, 1, 0, 0));
  check('clicking the lap in order sets the order', setOrder(d, [g1.id, g3.id]) && d.sequence.map((s) => s.elementId).join() === [g1.id, g3.id, g2.id].join());
  check('the gates not clicked keep their order after the ones that were', setOrder(d, [g2.id]) && d.sequence.map((s) => s.elementId).join() === [g2.id, g1.id, g3.id].join());
  check('the same order again is no change', !setOrder(d, [g2.id, g1.id]));
  setOrder(d, [g1.id, g3.id, g2.id]);
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
  const { lift, ...groundOnly } = onGround;
  check('a start gate on the ground starts on the ground behind it, as before', !onGround.air && JSON.stringify(groundOnly) === JSON.stringify(spawnFor(gates)));
  const g0 = gates[0];
  check('and asks the ground from the bottom of its opening, so a gate on a roof starts on the roof',
    near(onGround.y, g0.centre.y - g0.aperture.clearH / 2, 1e-9) && onGround.y >= 100 - 1e-9, `${onGround.y}`);
  check('and carries the air start the same gate would give, lined up on its opening',
    Boolean(lift) && near(lift.y, g0.centre.y, 1e-9)
    && near(Math.hypot(g0.centre.x - lift.x, g0.centre.z - lift.z), SPAWN_BACK, 1e-9), JSON.stringify(lift));
  /* An aircraft on floats: on the water where the ground start is on the
   * lake, in the air where it is on land, and an air start untouched. */
  check('on floats, a ground start on the water stays on the water', floatStart(onGround, () => true) === onGround);
  const lifted = floatStart(onGround, () => false);
  check('on floats, a ground start on land becomes the air start in its lift',
    Boolean(lifted.air) && lifted.air.y === lift.y && lifted.x === lift.x && lifted.z === lift.z && lifted.yaw === onGround.yaw, JSON.stringify(lifted));
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
  check('on floats an air start is an air start', floatStart(air, () => true) === air && floatStart(air, () => false) === air);
  const risen = startFor(gates, hill);
  check('and its lift is half an opening over the risen ground, never in it',
    near(risen.lift.y, Math.max(g.centre.y, hill(risen.lift.x, risen.lift.z) + g.aperture.clearH / 2), 1e-9) && risen.lift.y - hill(risen.lift.x, risen.lift.z) >= g.aperture.clearH / 2 - 1e-9,
    `${risen.lift.y} over ${hill(risen.lift.x, risen.lift.z)}`);
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
  const ghostIn = pieceGate(pieceById('gate'), { x: 0, y: 10 - 0.8763, z: 0 }, qAxis(0, 1, 0, 0));
  const ghostOut = pieceGate(pieceById('gate'), { x: 40, y: 10 - 0.8763, z: 0 }, qAxis(0, 1, 0, 0));
  check('the ghost is red by the same rule: in the building it is blocked, in the air it is not',
    openingBlocked(ghostIn, world) && !openingBlocked(ghostOut, world));

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
  const pair = ELEMENTS.pylonPair.dims;
  const widest = Math.max(...wings.map(span));
  const rMid = (pair.baseRadius + pair.tipRadius) / 2;
  const pairW = pair.clearW + 2 * pair.baseRadius - 2 * rMid;
  check('between the pylons at half their height, two spans of the widest wing',
    pairW >= 2 * widest, `${pairW.toFixed(2)} vs ${(2 * widest).toFixed(2)}`);
  /* The banner gates are sized by the rule for the planes up to 2.5 m
   * across. One wider, the Striker (3.15 m across its sweep), has no
   * banner gate two of its spans wide and is sent between the pylons. */
  const small = wings.filter((af) => 2 * span(af) <= w3.clearW);
  const big = wings.filter((af) => 2 * span(af) > w3.clearW && 2 * span(af) <= w5.clearW);
  const pylonsOnly = wings.filter((af) => 2 * span(af) > w5.clearW);
  check('every fixed wing has a plane sized opening two of its spans wide: a wide gate, or past the 5 m one the pylon pair',
    pylonsOnly.every((af) => 2 * span(af) <= pairW), pylonsOnly.filter((af) => 2 * span(af) > pairW).map((af) => af.id).join());
  console.log(`  3 m: ${small.map((af) => `${af.id} ${span(af).toFixed(2)}`).join(', ')}; 5 m: ${big.map((af) => `${af.id} ${span(af).toFixed(2)}`).join(', ')}; the pylons: ${pylonsOnly.map((af) => `${af.id} ${span(af).toFixed(2)}`).join(', ')}`);

  const d = newCourse('swiss2', 'Air race');
  const up = qAxis(0, 1, 0, 0);
  const wg = addGate(d, 'wideGate5', { x: 0, y: 100, z: 0 }, up);
  const pp = addGate(d, 'pylonPair', { x: 0, y: 100, z: -60 }, up);
  const py = addGate(d, 'pylon', { x: 0, y: 100, z: -120 }, up);
  check('a pylon\'s step carries a side, the left, and no face', d.sequence[2].passSide === 'left' && d.sequence[2].entry === null && d.sequence[2].clearance === 15);
  const spec = gateSpec(wg);
  check('a wide gate is a PVC frame of 1 1/2 inch pipe, the banner kind', spec.frameKind === 'banner' && near(spec.tubeOD, 1.9 * 0.0254, 1e-12));
  const gates = raceGatesOf(d);
  check('the pair is the air race\'s cones at full size, 50 m apart: it scores the 45 m between their bases, ground to their 25 m tips',
    near(gates[1].aperture.clearW, 45) && near(gates[1].aperture.clearH, 25) && near(gates[1].centre.y, 112.5) && !gates[1].virtual);
  check('the pylon scores the wing class\'s square for its 15 m clearance beside it, 35 m, virtual',
    near(gates[2].aperture.clearW, 35) && gates[2].virtual);
  /* The span warning (src/builder/line.js) reads each one's clear air. */
  const flat = { heightAt: () => 100, solidAt: () => false };
  const smallFor = (gs, af) => {
    const c = craftLimits(airframeById(af));
    return lineWarnings(gs, racingLine(gs, c, flat.heightAt), c, flat).filter((w) => w.code === 'small').map((w) => w.gate);
  };
  check('the Bramor fits the 5 m gate, the pylon pair and round the pylon: no small warning', smallFor(gates, 'bramor2300').length === 0, JSON.stringify(smallFor(gates, 'bramor2300')));
  const d3 = newCourse('swiss2', 'Small');
  addGate(d3, 'wideGate3', { x: 0, y: 100, z: 0 }, up);
  addGate(d3, 'wideGate3', { x: 0, y: 100, z: -80 }, up);
  /* The warning asks for 1.2 spans; the size rule here is two, so even
   * the Bramor is only told off at a five inch's gate. The Striker, 1.2
   * of whose spans are 3.78 m, is told off at the 3 m one. */
  const warned3 = wings.filter((af) => smallFor(raceGatesOf(d3), af.id).length > 0).map((af) => af.id);
  const over3 = wings.filter((af) => span(af) * SPAN_ROOM > 3).map((af) => af.id);
  check('the warning reads the 3 m gate as 3 m: a fixed wing is warned there when 1.2 of its spans are over 3 m, and only then',
    JSON.stringify(warned3) === JSON.stringify(over3), `${warned3.join()} against ${over3.join()}`);
  check('the Bramor is not warned there, and the Striker is, at both gates',
    !warned3.includes('bramor2300') && JSON.stringify(smallFor(raceGatesOf(d3), 'striker2500')) === '[0,1]', JSON.stringify(smallFor(raceGatesOf(d3), 'striker2500')));
  check('and the Striker is not warned at the 5 m gate, the pylon pair and round the pylon', smallFor(gates, 'striker2500').length === 0, JSON.stringify(smallFor(gates, 'striker2500')));
  const d4 = newCourse('swiss2', 'Five inch');
  addGate(d4, 'gate', { x: 0, y: 100, z: 0 }, up);
  addGate(d4, 'gate', { x: 0, y: 100, z: -80 }, up);
  check('and a five inch gate is small for the Bramor', smallFor(raceGatesOf(d4), 'bramor2300').length === 2);
  /* Flown along -z, the pilot's left is -x: a pass on the left has the
   * square's centre 17.5 m to -x and its inner edge on the pylon's axis. */
  check('its square is on the pilot\'s left with its inner edge on the axis',
    near(gates[2].centre.x, -17.5) && near(gates[2].centre.x + gates[2].aperture.clearW / 2, 0));

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
  check('over their tips: not', !pass(race, 1, 0, 125.5));
  check('round the pylon on its left: counted', pass(race, 2, -4, 103));
  check('on its right: not', !pass(race, 2, 4, 103));
  /* The right hand pylon piece, put where the left hand one was. */
  const { base: pyBase, quat: pyQuat } = poseOf(py);
  removeGate(d, py.id);
  const pyR = addGate(d, 'pylon', pyBase, pyQuat, 'right');
  check('the right hand pylon piece in its place: passed on its right', stepOf(d, pyR.id).passSide === 'right');
  const race2 = new Race(raceGatesOf(d).map((x) => ({ ...x })), 'full');
  gates.splice(0, gates.length, ...raceGatesOf(d));
  check('and on its right it counts', pass(race2, 2, 4, 103));
  check('and on its left it does not', !pass(race2, 2, -4, 103));
  check('its ghost and its mesh show the side: the spec\'s sign', gateSpec(pyR, stepOf(d, pyR.id)).passSign === -1 && gateSpec(pyR).passSign === 1);

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

console.log('sky hoops');
{
  const up = qAxis(0, 1, 0, 0);
  const span = (id) => craftLimits(airframeById(id)).span;
  check('every hoop is a piece on the sky hoops shelf', HOOP_TYPES.every((t) => PIECES.some((p) => p.type === t && p.cat === 'sky')) && PIECE_CATS.includes('sky'));
  check('the plane hotbar opens on the 30 m hoop and the air race\'s pylon pair and holds no other hoop, the quad one on the quad hoops',
    DEFAULT_WING_HOTBAR.slice(0, 2).join() === 'hoop30,pylonPair' && WING_FIRST.join() === 'hoop30,pylonPair' && DEFAULT_WING_HOTBAR.filter((id) => pieceById(id).cat === 'sky').join() === 'hoop30'
    && ['hoop175', 'hoop250'].every((t) => DEFAULT_HOTBAR.includes(t))
    && DEFAULT_WING_HOTBAR.length === HOTBAR_SLOTS && DEFAULT_WING_HOTBAR.every((id) => pieceById(id))
    && new Set(DEFAULT_WING_HOTBAR).size === HOTBAR_SLOTS);
  const sizes = HOOP_TYPES.map((t) => ELEMENTS[t].dims.clearW);
  check('the hoops placed are 1.75, 2.5 and 30 m across', sizes.join() === '1.75,2.5,30', sizes.join());
  const retiredSizes = RETIRED_HOOPS.map((t) => ELEMENTS[t].dims.clearW);
  check('the retired ones, 6, 12 and 20 m, are still elements', retiredSizes.join() === '6,12,20', retiredSizes.join());

  /* The owner: "I only want the 30 m hoop." Nothing a pilot can place or
   * be handed offers the others. */
  const placeable = [...PIECES.map((p) => p.type), ...DEFAULT_HOTBAR, ...DEFAULT_WING_HOTBAR].map((id) => pieceById(id)?.type ?? id);
  check('no piece, hotbar or inventory shelf offers a 6, 12 or 20 m hoop', !placeable.some((t) => RETIRED_HOOPS.includes(t)) && RETIRED_HOOPS.every((t) => pieceById(t) === null));
  const casual = casualCourse('swiss2', 'Casual', () => 0, { x: 0, z: 0 });
  const casualTypes = casual ? casual.elements.map((e) => e.type).join() : 'none';
  check(`on level ground the casual course is ${CASUAL.gates} gates, the 30 m hoop and the air race's pylon pair by turns, a hoop first: ${casualTypes}`,
    casual && casual.elements.length === CASUAL.gates && casual.elements.every((e, i) => e.type === (i % 2 ? 'pylonPair' : 'hoop30')));
  const cg = casual ? raceGatesOf(casual) : [];
  check('its pairs stand on the ground and its hoops hang 60 m over it',
    cg.every((g, i) => (i % 2 ? near(g.position.y, 0, 1e-9) : near(g.centre.y, CASUAL.over, 1e-9))), cg.map((g) => g.centre.y.toFixed(1)).join());
  check('each is flown towards the next', cg.every((g, i) => {
    const q = cg[(i + 1) % cg.length].centre;
    return (q.x - g.centre.x) * g.axes.travel.x + (q.y - g.centre.y) * g.axes.travel.y + (q.z - g.centre.z) * g.axes.travel.z > 0;
  }));
  {
    const flatW = { heightAt: () => 0, solidAt: () => false };
    const bad = AIRFRAMES.filter((af) => af.fixedWing).map((af) => {
      const c = craftLimits(af);
      const ws = lineWarnings(cg, racingLine(cg, c, flatW.heightAt), c, flatW);
      return ws.length ? `${af.id}: ${ws.map((w) => `${w.code}@${w.gate + 1}`).join(' ')}` : '';
    }).filter(Boolean);
    check('and no plane gets a warning on it: the dives to the pairs and the climbs out are flyable', bad.length === 0, bad.join('; '));
  }
  /* A 10 percent slope: wherever the line runs along it the approach
   * climbs too much for a pair, and wherever it runs across it the cones
   * stand too far apart in height, so every slot is a hoop, still eight. */
  const sloped = casualCourse('swiss2', 'Casual', (x) => 0.1 * x, { x: 0, z: 0 });
  check(`on a slope too steep for a pair the casual course is still ${CASUAL.gates} gates, all hoops: ${sloped ? sloped.elements.map((e) => e.type).join() : 'none'}`,
    sloped && sloped.elements.length === CASUAL.gates && sloped.elements.every((e) => e.type === 'hoop30'));
  /* Rolling hills: wherever the pairs land and whichever slots stay
   * hoops, no plane's line through them meets the ground or anything else. */
  const hills = (x, z) => 25 * Math.sin(x / 150) * Math.cos(z / 170) + 10 * Math.sin((x + z) / 60);
  const rolled = casualCourse('swiss2', 'Casual', hills, { x: 0, z: 0 });
  const rg = rolled ? raceGatesOf(rolled) : [];
  const rollBad = AIRFRAMES.filter((af) => af.fixedWing).map((af) => {
    const c = craftLimits(af);
    const w = { heightAt: hills, solidAt: () => false };
    const ws = lineWarnings(rg, racingLine(rg, c, hills), c, w);
    return ws.length ? `${af.id}: ${ws.map((x) => `${x.code}@${x.gate + 1}`).join(' ')}` : '';
  }).filter(Boolean);
  check(`on rolling hills: ${rolled ? rolled.elements.map((e) => e.type).join() : 'none'}, and no plane gets a warning`,
    rolled && rg.length === CASUAL.gates && rollBad.length === 0, rollBad.join('; '));
  const stale = ['hoop20', 'hoop12', 'hoop30', 'hoop6', 'pylonPair', 'pylon', 'pylonRight', 'wideGate5', 'wideGate3'];
  const mended = restoreHotbar(stale, DEFAULT_WING_HOTBAR);
  check(`the old plane default, stored, comes back as the new default: ${mended.join(' ')}`, mended.join() === DEFAULT_WING_HOTBAR.join()
    && restoreHotbar(stale, DEFAULT_WING_HOTBAR, WING_FIRST).join() === DEFAULT_WING_HOTBAR.join());
  const dropped = ['hoop20', 'wideGate5', 'wideGate3', 'pylon', 'pylonRight', 'tower', 'ladder', 'gate', 'hoop12'];
  const back2 = restoreHotbar(dropped, DEFAULT_WING_HOTBAR, WING_FIRST);
  check(`a stored plane bar that had dropped the pylon pair and the 30 m hoop gets both back in their slots, the rest kept in order: ${back2.join(' ')}`,
    back2.slice(0, 2).join() === 'hoop30,pylonPair' && back2.slice(2).join() === 'wideGate5,wideGate3,pylon,pylonRight,tower,ladder,gate');
  const chosen = ['hoop30', 'wideGate5', 'wideGate3', 'pylon', 'pylonRight', 'tower', 'ladder', 'gate', 'flaggedGate'];
  check('and without `first`, the way a bar stored after that is read, the pilot\'s choice stands', restoreHotbar(chosen, DEFAULT_WING_HOTBAR).join() === chosen.join());
  const own = restoreHotbar(['wideGate3', 'hoop12', 'pylon', 'hoop175', 'hoop6', 'hoop30', 'tower', 'pylonPair', 'hoop20'], DEFAULT_WING_HOTBAR);
  check(`a bar the pilot arranged loses the retired hoops, keeps its own pieces in order, and fills from the defaults with no piece twice: ${own.join(' ')}`,
    own.length === HOTBAR_SLOTS && new Set(own).size === HOTBAR_SLOTS && own.every((id) => pieceById(id))
    && own.slice(0, 6).join() === 'wideGate3,pylon,hoop175,hoop30,tower,pylonPair' && !own.some((id) => RETIRED_HOOPS.includes(id)));
  check('nothing stored, or junk stored, is the defaults', restoreHotbar(null, DEFAULT_WING_HOTBAR).join() === DEFAULT_WING_HOTBAR.join()
    && restoreHotbar('x', DEFAULT_HOTBAR).join() === DEFAULT_HOTBAR.join() && restoreHotbar([1, null], DEFAULT_HOTBAR).join() === DEFAULT_HOTBAR.join());

  /* A published contract: tracks already saved and on the board name the
   * retired hoops, and they load, draw and race as before. */
  const old = newCourse('swiss2', 'Before the retirement');
  const h20 = addGate(old, 'hoop20', { x: 0, y: 100, z: 0 }, up);
  addGate(old, 'hoop6', { x: 0, y: 100, z: -400 }, up);
  const oldBack = deserialize(serialize(old)).doc;
  const oldGates = raceGatesOf(oldBack);
  check('an old track with a 20 m and a 6 m hoop still loads with both as race gates, round and their own size',
    oldBack.elements.map((e) => e.type).join() === 'hoop20,hoop6' && oldGates.length === 2 && oldGates.every((g) => g.aperture.round)
    && near(oldGates[0].aperture.clearW, 20) && near(oldGates[1].aperture.clearW, 6));
  check('and each still has a mesh spec, a soft plane hoop\'s', oldBack.elements.every((e) => gateSpec(e).kindName === 'hoop' && gateSpec(e).rimKind === 'hoop'));
  const picked = pieceOf(oldBack, h20.id);
  check('picked up (F) it is itself; a middle click or a copy of it is the 30 m hoop',
    picked && picked.type === 'hoop20' && picked.retired && offeredPiece(picked).id === 'hoop30' && offeredPiece(pieceById('pylon')).id === 'pylon');

  const d = newCourse('swiss2', 'Sky');
  addGate(d, 'hoop30', { x: 0, y: 100, z: 0 }, up);
  const h6 = addGate(d, 'hoop6', { x: 0, y: 100, z: -400 }, up);
  const gates = raceGatesOf(d);
  const t30 = ELEMENTS.hoop30.dims.tubeR;
  check('a hoop scores a round opening its own diameter across', gates[0].aperture.round === true && near(gates[0].aperture.clearW, 30) && !gates[0].virtual);
  check('its centre is one outer radius over its base: it stands on its rim', near(gates[0].centre.y, 100 + 2 * t30 + 15), fmtV(gates[0].centre));
  check('a square gate\'s opening is not round', raceGatesOf((() => { const q = newCourse('swiss2', 'q'); addGate(q, 'gate', { x: 0, y: 0, z: 0 }, up); return q; })())[0].aperture.round === undefined);

  const race = new Race(gates.map((x) => ({ ...x })), 'full');
  const through = (i, dx, dy) => {
    const g = gates[i];
    race.next = i;
    race.leaving = -1;
    race.prevSimMs = null;
    const a = { x: g.centre.x + dx, y: g.centre.y + dy, z: g.centre.z + 20 };
    const b = { x: g.centre.x + dx, y: g.centre.y + dy, z: g.centre.z - 20 };
    race.update(a, a, 0, 0);
    return race.update(a, b, 2000, 0).passed === i;
  };
  check('through the middle of the 30 m hoop: counted', through(0, 0, 0));
  check('12 m off its centre: counted, the drawn disc is the whole of it', through(0, 12, 0) && through(0, -8.4, 8.4));
  check('outside the disc but inside the square round it: not counted', !through(0, 12.5, 12.5));
  check('past the rim: not counted', !through(0, 15.5, 0));
  {
    const g = gates[0];
    race.next = 0;
    race.leaving = -1;
    race.prevSimMs = null;
    const a = { x: g.centre.x, y: g.centre.y, z: g.centre.z - 20 };
    const b = { x: g.centre.x, y: g.centre.y, z: g.centre.z + 20 };
    race.update(a, a, 0, 0);
    check('through it backwards: not counted', race.update(a, b, 2000, 0).passed === null);
  }
  {
    /* 40 m/s at 60 frames a second is 0.67 m a frame; at 5 it is 8 m, and
     * the segment still crosses the disc's plane. */
    const g = gates[0];
    race.next = 0;
    race.leaving = -1;
    race.prevSimMs = null;
    const a = { x: g.centre.x + 3, y: g.centre.y, z: g.centre.z + 0.4 };
    const b = { x: g.centre.x + 3, y: g.centre.y, z: g.centre.z - 7.6 };
    race.update(a, a, 0, 0);
    check('a fast plane cannot step over it in one frame: 8 m of travel across the disc counts', race.update(a, b, 200, 0).passed === 0);
  }

  const flat = { heightAt: () => 0, solidAt: () => false };
  const warn = (gs, id) => {
    const c = craftLimits(airframeById(id));
    return lineWarnings(gs, racingLine(gs, c, flat.heightAt), c, flat);
  };
  const small6 = warn(gates, 'bramor2300').filter((w) => w.code === 'small');
  check(`the 6 m hoop is small for the Bramor: it needs ${HOOP_ROOM} spans, ${(HOOP_ROOM * span('bramor2300')).toFixed(2)} m`,
    small6.length === 1 && small6[0].gate === 1 && near(small6[0].value, 6) && near(small6[0].limit, HOOP_ROOM * span('bramor2300')));
  check('and not for the Cub', !warn(gates, 'cub1400').some((w) => w.code === 'small'));
  const wings = AIRFRAMES.filter((af) => af.fixedWing);
  const d12 = newCourse('swiss2', 'Twelves');
  addGate(d12, 'hoop12', { x: 0, y: 100, z: 0 }, up);
  check('every plane fits the 12 m hoop', wings.every((af) => misfitGate(raceGatesOf(d12), craftLimits(af)) < 0));
  const dq = newCourse('swiss2', 'Quad hoops');
  addGate(dq, 'hoop175', { x: 0, y: 100, z: 0 }, up);
  check('the 1.75 m hoop takes a quad and no plane',
    misfitGate(raceGatesOf(dq), craftLimits(airframeById('5inch'))) < 0 && wings.every((af) => misfitGate(raceGatesOf(dq), craftLimits(af)) === 0));
  check('and the board\'s rule agrees: no plane may race it', planesFor(toPlain(dq)).length === 0);
  const close = newCourse('swiss2', 'Close');
  addGate(close, 'hoop20', { x: 0, y: 100, z: 0 }, up);
  addGate(close, 'hoop20', { x: 0, y: 100, z: -100 }, up);
  check('two plane hoops 100 m apart are close for a plane: it wants 150 m', warn(raceGatesOf(close), 'cub1400').some((w) => w.code === 'close' && w.limit === 150));
  check('and not for a quad', !warn(raceGatesOf(close), '5inch').some((w) => w.code === 'close'));
  const far = newCourse('swiss2', 'Far');
  addGate(far, 'hoop20', { x: 0, y: 100, z: 0 }, up);
  addGate(far, 'hoop20', { x: 0, y: 100, z: -400 }, up);
  check('400 m apart they are not', !warn(raceGatesOf(far), 'cub1400').some((w) => w.code === 'close'));
  const rock = { heightAt: () => 0, solidAt: (x, y) => Math.hypot(x, y - gates[0].centre.y) > 12.3 && Math.hypot(x, y - gates[0].centre.y) < 20 };
  check('the blocked rule probes a disc on its circle: rock just outside 0.8 of its radius is not in it', !openingBlocked(gates[0], rock));

  const cam = { x: 0.3, y: 0.2, z: -1 };
  const n = Math.hypot(cam.x, cam.y, cam.z);
  const cy = openingsOf(h6)[0].centreY;
  const next = chainPose(gates[0], cam, CHAIN.plane.start, { yaw: 0, pitch: 0, roll: 0 }, cy);
  const along = qRot(next.quat, 0, 0, -1);
  check(`the chain puts the next hoop ${CHAIN.plane.start} m on along the look`,
    near(Math.hypot(next.centre.x - gates[0].centre.x, next.centre.y - gates[0].centre.y, next.centre.z - gates[0].centre.z), 400, 1e-6)
    && near(along.x, cam.x / n) && near(along.y, cam.y / n) && near(along.z, cam.z / n));
  addGate(d, 'hoop6', next.base, next.quat);
  const g2 = raceGatesOf(d)[2];
  check('and placed there its disc is where the chain said', nearV(g2.centre, next.centre, 1e-6), `${fmtV(g2.centre)} ${fmtV(next.centre)}`);
  check('a plane chain is 400 m and a quad chain 30 m to start', CHAIN.plane.start === 400 && CHAIN.quad.start === 30);

  const text = serialize(d);
  const back = deserialize(text).doc;
  check('saved and read back byte for byte, the hoops with it', serialize(back) === text && back.elements.map((e) => e.type).join() === 'hoop30,hoop6,hoop6'
    && back.elements[0].dims.tubeR === t30);
  const field = JSON.parse(text);
  delete field.map;
  field.schemaVersion = 3;
  check('a field track naming one drops it', normalize(field).doc.elements.length === 0);
}

console.log('a plane\'s course is scored, by reach and by accuracy');
{
  const up = qAxis(0, 1, 0, 0.3);
  /* Across the gate at (x, y) in its opening's plane, from the opening's
   * centre, along its travel: what a scored race makes of it. */
  const fly = (g, x, y, reach = PLANE_REACH) => {
    const race = new Race([{ ...g, flyOrder: 0 }], 'full', { reach });
    const c = (k) => ({
      x: g.centre.x + g.axes.across.x * x + g.axes.up.x * y + g.axes.travel.x * k,
      y: g.centre.y + g.axes.across.y * x + g.axes.up.y * y + g.axes.travel.y * k,
      z: g.centre.z + g.axes.across.z * x + g.axes.up.z * y + g.axes.travel.z * k,
    });
    race.update(c(-10), c(-10), 0, 0);
    const passed = race.update(c(-10), c(10), 2000, 0).passed === 0;
    return { passed, call: race.call };
  };
  const gateOf = (type) => {
    const d = newCourse('swiss2', type);
    addGate(d, type, { x: 30, y: 400, z: -60 }, up);
    return raceGatesOf(d)[0];
  };
  const text = (r) => (r.passed ? `${r.call.code} ${r.call.points}` : 'not counted');
  for (const type of ['hoop6', 'hoop12', 'hoop20', 'hoop30', 'hoop175', 'hoop250', 'wideGate3', 'wideGate5', 'pylonPair', 'gate']) {
    const g = gateOf(type);
    const hw = g.aperture.clearW / 2;
    /* The structure's edge, straight out across from the centre. */
    const f = g.aperture.frame;
    let edge = hw;
    if (f.kind === 'ring') {
      edge = f.r;
    } else if (f.kind === 'box') {
      edge = f.hw;
    } else if (f.kind === 'cones') {
      const cc = f.cones[1];
      edge = cc.x + cc.r0 + ((cc.r1 - cc.r0) * (0 - cc.y0)) / cc.h;
    }
    const got = {
      centre: fly(g, 0, 0), mid: fly(g, 0.45 * hw, 0), rim: fly(g, 0.98 * hw, 0),
      out20: fly(g, edge + 20, 0), out39: fly(g, edge + 39, 0), out41: fly(g, edge + 41, 0),
    };
    check(`${type}: centre, mid, just inside the rim, and 20, 39 and 41 m outside: ${Object.values(got).map(text).join(', ')}`,
      got.centre.passed && got.centre.call.code === 'centre' && got.centre.call.points === PASS_POINTS
      && got.mid.passed && got.mid.call.code === 'good' && got.mid.call.points === Math.round(PASS_POINTS * (1 - 0.5 * 0.45 * 0.45))
      && got.rim.passed && got.rim.call.code === 'through' && got.rim.call.points > 0.5 * PASS_POINTS && got.rim.call.points < 0.55 * PASS_POINTS
      && got.out20.passed && got.out20.call.code === 'close' && got.out20.call.points === NEAR_POINTS
      && got.out39.passed && got.out39.call.code === 'close'
      && !got.out41.passed);
    /* Over the top of it: the rim's or the frame's top, or a cone's tip. */
    const [topX, top] = f.kind === 'ring' ? [0, f.r] : (f.kind === 'box' ? [0, f.hh] : [f.cones[1].x, f.cones[1].y0 + f.cones[1].h]);
    check(`${type}: over the top, 39 m above it counts and 41 m does not`, fly(g, topX, top + 39).passed && !fly(g, topX, top + 41).passed);
    check(`${type}: a quad's race threads it as before: the 20 m near miss is not counted`, !fly(g, edge + 20, 0, 0).passed && fly(g, 0, 0, 0).passed);
  }
  {
    /* The single pylon's opening is its 35 m square beside it; its reach is
     * from its cone, on the side it is rounded on only. */
    const g = gateOf('pylon');
    const f = g.aperture.frame;
    const cx = f.cone.x;
    const rMid = f.cone.r0 + ((f.cone.r1 - f.cone.r0) * (0 - f.cone.y0)) / f.cone.h;
    const far = g.aperture.clearW / 2;
    const inside = fly(g, 0, 0);
    const past = fly(g, far + 3, 0);
    const beyond = fly(g, cx + f.side * (rMid + 41), 0);
    const wrong = fly(g, cx - f.side * (rMid + 5), 0);
    check(`the pylon: the middle of its square ${text(inside)}; 3 m past the square's far edge (${(far + 3 - cx).toFixed(1)} m from its axis) ${text(past)}; 41 m off the cone ${text(beyond)}; 5 m off it on the wrong side ${text(wrong)}`,
      inside.passed && inside.call.code === 'centre' && past.passed && past.call.code === 'close' && !beyond.passed && !wrong.passed);
  }
  {
    /* Scores run through a lap: two hoops, the second flown well off. */
    const d = newCourse('swiss2', 'Scored');
    addGate(d, 'hoop30', { x: 0, y: 400, z: 0 }, qAxis(0, 1, 0, 0));
    addGate(d, 'hoop30', { x: 0, y: 400, z: -400 }, qAxis(0, 1, 0, 0));
    const gs = raceGatesOf(d);
    const race = new Race(gs.map((x) => ({ ...x })), 'full', { reach: PLANE_REACH });
    const y = gs[0].centre.y;
    const path = [[0, y, 20], [0, y, -20], [9, y, -380], [9, y, -420], [0, y, -300], [0, y, 30], [0, y, -20]];
    let prev = { x: path[0][0], y: path[0][1], z: path[0][2] };
    race.update(prev, prev, 0, 0);
    path.slice(1).forEach(([x, py, z], i) => {
      const p = { x, y: py, z };
      race.update(prev, p, (i + 1) * 5000, 0);
      prev = p;
    });
    const want = PASS_POINTS + Math.round(PASS_POINTS * (1 - 0.5 * (9 / 15) ** 2));
    check(`a lap's score is its gates', the start's included: ${race.lastLapScore} (${race.log.map((l) => `${l.n}: ${l.score}`).join(', ')}), the run ${race.runScore}`,
      race.lap === 1 && race.lastLapScore === want && race.log[0].score === want && race.runScore === want + PASS_POINTS);
  }
}

/* ------------------------------------------------------------------ */
/*
 * The seat, which is how the shell flies a track: one of the pilot's own
 * played from My tracks, or one from the board, and what each is to the
 * board. These are the cases the 2D builder's selftest held for field
 * tracks, on a track built in a world, and the pilot's own beside them.
 */
console.log('the seat and the board');
{
  const d = newCourse('swiss2', 'Ladder loop');
  addGate(d, 'gate', { x: 10, y: 400, z: -20 }, qAxis(0, 1, 0, 0));
  const plainDoc = toPlain(d);
  const renamed = { ...plainDoc, name: 'Renamed loop' };
  check('the layout fingerprint ignores the title', layoutFingerprint(plainDoc) === layoutFingerprint(renamed));
  const board = { id: plainDoc.id, name: plainDoc.name, author: 'Ada Rook', board: 'http://127.0.0.1:3180', document: plainDoc };
  const community = inspectCourse({ share: board, editKeyFor: () => null, bindFor: () => null });
  check('a board track you do not own is a community listing that takes a time',
    community.kind === 'community' && community.canPostTime && community.shareId === plainDoc.id);
  const owned = inspectCourse({
    share: board,
    editKeyFor: (id) => (id === plainDoc.id ? 'key' : null),
    bindFor: () => ({ layoutFingerprint: layoutFingerprint(plainDoc), nameOnBoard: plainDoc.name, owned: true }),
  });
  check('a board track you published is owned', owned.kind === 'owned' && owned.canPostTime);
  const drifted = inspectCourse({
    share: { ...board, document: renamed, name: renamed.name },
    editKeyFor: (id) => (id === plainDoc.id ? 'key' : null),
    bindFor: () => ({ layoutFingerprint: layoutFingerprint(plainDoc), nameOnBoard: 'Old name', owned: true }),
  });
  check('an owned rename is name drift, not layout drift', drifted.nameDrift === true && drifted.layoutDrift === false && drifted.canPostTime);
  const authorShift = inspectCourse({
    share: board,
    editKeyFor: (id) => (id === plainDoc.id ? 'key' : null),
    bindFor: () => ({ layoutFingerprint: layoutFingerprint(plainDoc), nameOnBoard: plainDoc.name, owned: true, author: 'Ada Rook' }),
    pilotName: 'Ada Two',
  });
  check('an owned handle change is author drift, not layout drift',
    authorShift.authorDrift === true && authorShift.layoutDrift === false && authorShift.canUpdateListing === true);
  const local = inspectCourse({ share: { id: plainDoc.id, name: plainDoc.name, document: plainDoc, local: true }, editKeyFor: () => null, bindFor: () => null });
  check('one of your own played from My tracks is on no board: no share id, no time to post',
    local.kind === 'local' && local.shareId === null && !local.canPostTime && !local.published && local.gates === 1);
  check('and nothing seated is none', inspectCourse({ share: null }).kind === 'none');
  check('a board track is seated by its id',
    courseSeatKey(board) === `share:${plainDoc.id}`);
  const edited = { ...plainDoc, modifiedUtc: '2099-01-01T00:00:00.000Z' };
  check('one of your own by its id and when it last changed, so playing it after an edit seats the edit',
    courseSeatKey({ id: plainDoc.id, local: true, document: plainDoc }) !== courseSeatKey({ id: plainDoc.id, local: true, document: edited }));
  check('and nothing seated has no key', courseSeatKey(null) === '');
}

/*
 * Just enough DOM for hud.js to build itself on: elements that nest, take
 * listeners and text, and fire what is dispatched on them.
 */
function fakeDom() {
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.listeners = {};
      this.textContent = '';
      this.className = '';
      const cls = new Set();
      this.classList = {
        add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c),
      };
    }
    append(...kids) { this.children.push(...kids); }
    replaceChildren() { this.children = []; }
    remove() {}
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type, e = {}) {
      const ev = { preventDefault() { this.prevented = true; }, stopPropagation() {}, button: 0, ...e };
      for (const fn of this.listeners[type] || []) fn(ev);
      return ev;
    }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }
    find(pred) {
      if (pred(this)) return this;
      for (const k of this.children) {
        const f = k.find ? k.find(pred) : null;
        if (f) return f;
      }
      return null;
    }
  }
  const body = new El('body');
  globalThis.document = {
    createElement: (t) => new El(t),
    getElementById: () => null,
    head: new El('head'),
    body,
  };
  return body;
}

console.log('\nThe Save button');
{
  const body = fakeDom();
  let saves = 0;
  const hud = createHud({ onSlot: () => {}, onAssign: () => {}, onSave: () => { saves += 1; } });
  const button = body.find((e) => e.tagName === 'BUTTON' && e.className === 'bh-save');
  check('the builder\'s screen has a Save button', Boolean(button));
  const down = button.fire('mousedown');
  button.fire('click');
  check('a click on it saves, once, and the press takes no focus from the builder\'s keys', saves === 1 && down.prevented === true);
  hud.setSave({ label: 'Save', key: 'Ctrl S', tip: 't', name: 'Ring', state: 'pending', text: 'Saved, not online yet' });
  let r = hud.rects().save;
  check('it says what became of the save, and the track\'s name', r.state === 'pending' && r.text === 'Saved, not online yet' && r.name === 'Ring');
  hud.setSave({ label: 'Save', key: 'Ctrl S', tip: 't', name: 'Ring', state: 'online', text: 'Saved and online' });
  r = hud.rects().save;
  check('and changes when the upload lands', r.state === 'online' && r.text === 'Saved and online');
  delete globalThis.document;

  /* The same save as Ctrl S: the key, the pad and the button all name
   * the one function, so there is no second save to drift from it. */
  const src = readFileSync(new URL('../src/builder/buildmode.js', import.meta.url), 'utf8');
  check('Ctrl S, Start and the button all call the one save()',
    /KeyS: save,/.test(src) && /pressed\(PAD\.start\)\) \{\s*save\(\);/.test(src) && /onSave: save,/.test(src)
    && (src.match(/function save\(\)/g) || []).length === 1);

  check('never saved is not saved', saveState(true, true, null) === 'unsaved');
  check('saved with no tracks server is saved in this browser', saveState(false, false, { state: 'pending' }) === 'saved');
  check('saved and not uploaded yet is pending', saveState(false, true, { state: 'pending' }) === 'pending' && saveState(false, true, undefined) === 'pending');
  check('uploaded is online', saveState(false, true, { state: 'online' }) === 'online');
  check('refused by the server says so', saveState(false, true, { state: 'failed', error: 'x' }) === 'refused');
  const mark = createSaveMark();
  mark.seat(false);
  const fresh = mark.dirty;
  mark.saved();
  const afterSave = mark.dirty;
  mark.edited();
  check('the save mark: a new track is not saved, a save is, and the next edit is not again', fresh && !afterSave && mark.dirty);
  mark.seat(true);
  check('and a track seated as the library holds it is saved', !mark.dirty);
  /* The first save's name, checked the way the tracks server checks it. */
  const bad = readFileSync(new URL('../tracks-api/words.js', import.meta.url), 'utf8').match(/const ANYWHERE = \[\s*'([^']+)'/)[1];
  check('a typed name is trimmed and its spaces folded', trackNameFor('  Ridge   Run ', 'Ada\'s track 3') === 'Ridge Run');
  check('a blank name is the generated one', trackNameFor('   ', 'Ada\'s track 3') === 'Ada\'s track 3');
  check('a name the server\'s word filter refuses is refused here', Boolean(badWordIn(`the ${bad} ring`)) && trackNameFor(`the ${bad} ring`, 'x') === '');
  check('and so is one over 80 characters', trackNameFor('a'.repeat(81), 'x') === '' && trackNameFor('a'.repeat(80), 'x') === 'a'.repeat(80));
  check('an edit after the save is not saved, whatever the server holds', saveState(true, true, { state: 'online' }) === 'unsaved');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  process.exit(1);
}
