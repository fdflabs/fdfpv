/*
 * course.js: a course built inside a world, as data and arithmetic.
 *
 * The in-sim builder (buildmode.js) places race gates in the swiss2 and alps
 * valleys at any position and any orientation, and the document that holds
 * them is a schemaVersion 4 track (src/trackbuilder/model.js). This file is
 * everything about that document that is not the screen: where a gate
 * stands, how it is oriented, where each of its openings is, the frame the
 * race scores it against, where a test flight starts, and the numbers the
 * builder reads out. No Three.js and no DOM, so scripts/build-selftest.js
 * checks all of it in Node.
 *
 * THE REST POSE. An element's orientation is the rotation from its rest pose
 * to where it stands. At rest a gate stands upright on its base, exactly as
 * the race field builds it (src/render/scene.js obstacle(): x across the
 * opening, y up from the base, z through it), and is flown along its own -z,
 * which is the document's +y. The race's aperture frame (src/game/race.js)
 * is then across = R(-x), up = R(+y), travel = R(-z), the same frame the
 * field's own gates carry at a heading.
 *
 * Positions and orientations cross between the document's z up frame and
 * the scene's y up one through src/render/frame.js and nowhere else. Every
 * vector below that is not named as a document one is in the scene's frame.
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
  ELEMENTS, GATE_FLAG_POLE_R, apertureLevels, flagLeanSign, flagSideOf, flagSideSigns, gateFlagHeight,
} from '../trackbuilder/elements.js';
import { createElement, createMapTrack, elementById, newSequenceId } from '../trackbuilder/model.js';
import { gateScaleFor } from '../game/track.js';
import { docPosToThree, docQuatToThree, threePosToDoc, threeQuatToDoc } from '../render/frame.js';

/*
 * What can be placed. The field's aperture types that stand as one frame on
 * the ground: a dive gate and a launch gate are this list's gate turned, now
 * that a gate can be turned any way at all. Flags and cones are not here:
 * a marker scores through a square the racing line puts beside it, and the
 * racing line is not built on a map yet.
 */
export const BUILD_TYPES = ['gate', 'flaggedGate', 'doubleStack', 'ladder', 'tower'];

/* Every built course is a five inch's course: the field's 15 percent on
 * MultiGP's figures, the same size the gate is on the field. */
const GATE_SCALE = gateScaleFor('full');

/* How far behind the start gate a test flight is parked, the field's own
 * figure (src/game/trackdoc.js SPAWN_BACK). */
export const SPAWN_BACK = 7.5;

/* ------------------------------------------------------------------ */
/* Vectors and quaternions, plain objects, scene frame                 */
/* ------------------------------------------------------------------ */

/* A point with the set() frame.js writes through, so a plain object can take
 * a conversion without Three.js. */
function v3(x = 0, y = 0, z = 0) {
  return {
    x,
    y,
    z,
    set(a, b, c) {
      this.x = a;
      this.y = b;
      this.z = c;
      return this;
    },
  };
}

/* A quaternion the same way. { x, y, z, w }, Three.js order. */
function q4(x = 0, y = 0, z = 0, w = 1) {
  return {
    x,
    y,
    z,
    w,
    set(a, b, c, d) {
      this.x = a;
      this.y = b;
      this.z = c;
      this.w = d;
      return this;
    },
  };
}

export function qMul(a, b) {
  return q4(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  );
}

export function qAxis(ax, ay, az, angle) {
  const s = Math.sin(angle / 2);
  return q4(ax * s, ay * s, az * s, Math.cos(angle / 2));
}

export function qNorm(q) {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return q4(q.x / n, q.y / n, q.z / n, q.w / n);
}

/* v rotated by unit quaternion q. */
export function qRot(q, x, y, z) {
  const ix = q.w * x + q.y * z - q.z * y;
  const iy = q.w * y + q.z * x - q.x * z;
  const iz = q.w * z + q.x * y - q.y * x;
  const iw = -q.x * x - q.y * y - q.z * z;
  return v3(
    ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  );
}

/* The rotation whose columns are the orthonormal right handed x, y, z. */
function qBasis(x, y, z) {
  const m00 = x.x;
  const m10 = x.y;
  const m20 = x.z;
  const m01 = y.x;
  const m11 = y.y;
  const m21 = y.z;
  const m02 = z.x;
  const m12 = z.y;
  const m22 = z.z;
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = q4((m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s);
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = q4(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = q4((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = q4((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
  }
  return qNorm(q);
}

function cross(a, b) {
  return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function unit(a) {
  const n = Math.hypot(a.x, a.y, a.z);
  return n > 1e-9 ? v3(a.x / n, a.y / n, a.z / n) : null;
}

/* The heading whose rest forward, (0, 0, -1) turned about +y, is along the
 * horizontal part of f. The race's own convention: travelAxis(h, 0). */
export function headingOf(fx, fz) {
  return Math.atan2(-fx, -fz);
}

/* ------------------------------------------------------------------ */
/* The element's shape                                                 */
/* ------------------------------------------------------------------ */

/*
 * The obstacle spec src/render/scene.js standaloneGate builds from, at BUILT
 * dimensions: the author's figures through the field's gate scale, the same
 * conversion src/game/trackdoc.js makes for a field course.
 */
export function gateSpec(el) {
  const d = el.dims;
  return {
    kindName: el.type,
    clearW: d.clearW * GATE_SCALE,
    clearH: d.clearH * GATE_SCALE,
    sillH: d.sillH * GATE_SCALE,
    stack: Math.max(1, Math.round(d.levels)),
    levelPitch: d.levelPitch * GATE_SCALE,
  };
}

/* The header pennants' options for a flagged gate, as the field passes
 * them; empty for everything else. */
export function gateFlags(el) {
  if (!ELEMENTS[el.type].flagSide) {
    return {};
  }
  const flagSigns = flagSideSigns(flagSideOf(el));
  return {
    flagSigns,
    flagLeans: flagSigns.map(flagLeanSign),
    flagH: gateFlagHeight(el.dims) * GATE_SCALE,
    flagPoleR: GATE_FLAG_POLE_R * GATE_SCALE,
  };
}

/* Every opening, built, as { centreY, clearW, clearH } above the base in the
 * element's own frame. */
export function openingsOf(el) {
  return apertureLevels(el.dims).map((ap) => ({
    centreY: ap.centerH * GATE_SCALE,
    clearW: ap.clearW * GATE_SCALE,
    clearH: ap.clearH * GATE_SCALE,
  }));
}

/* ------------------------------------------------------------------ */
/* Pose: document to scene and back                                    */
/* ------------------------------------------------------------------ */

/* An element's base and orientation in the scene frame. */
export function poseOf(el) {
  const o = el.orientation;
  return {
    base: docPosToThree(el.position.x, el.position.y, el.position.z, v3()),
    quat: docQuatToThree(o.w, o.x, o.y, o.z, q4()),
  };
}

/* Write a scene pose back onto an element. */
export function setPose(el, base, quat) {
  const p = threePosToDoc(base.x, base.y, base.z, {});
  el.position = { x: p.x, y: p.y, z: p.z };
  const n = qNorm(quat);
  el.orientation = threeQuatToDoc(n.x, n.y, n.z, n.w, {});
  /* The yaw a best effort reader would draw it at, so a version 3 reader
   * that meets this document at least faces the gates the right way. A
   * field gate's document yaw is its plane normal, a quarter turn short of
   * the heading it is flown at (src/game/trackdoc.js sceneYawFor). */
  const t = qRot(n, 0, 0, -1);
  const yaw = headingOf(t.x, t.z) - Math.PI / 2;
  el.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

/* The centre of opening k, in the scene. */
export function openingCentre(el, k = 0) {
  const { base, quat } = poseOf(el);
  const ops = openingsOf(el);
  const op = ops[Math.min(Math.max(0, k), ops.length - 1)];
  const up = qRot(quat, 0, op.centreY, 0);
  return v3(base.x + up.x, base.y + up.y, base.z + up.z);
}

/*
 * A gate's colliders in the scene: `caps` are the capsules src/render/
 * scene.js obstacle() hands back in the gate's own frame, carried by the
 * element's whole pose, which is what the field does with a heading alone.
 * A capsule's radius does not turn.
 */
export function worldCaps(el, caps) {
  const { base, quat } = poseOf(el);
  return caps.map((c) => {
    const a = qRot(quat, c.ax, c.ay, c.az);
    const b = qRot(quat, c.bx, c.by, c.bz);
    return {
      kind: c.kind, ax: base.x + a.x, ay: base.y + a.y, az: base.z + a.z, bx: base.x + b.x, by: base.y + b.y, bz: base.z + b.z, r: c.r,
    };
  });
}

/* The gate's three scoring axes in the scene, from its orientation. */
export function axesOf(quat) {
  return {
    across: qRot(quat, -1, 0, 0),
    up: qRot(quat, 0, 1, 0),
    travel: qRot(quat, 0, 0, -1),
  };
}

/* ------------------------------------------------------------------ */
/* The document                                                        */
/* ------------------------------------------------------------------ */

export function newCourse(mapId, name) {
  return createMapTrack(name, mapId);
}

/* A gate placed at a scene pose, appended to the lap. Returns the element. */
export function addGate(doc, type, base, quat) {
  if (!BUILD_TYPES.includes(type)) {
    throw new Error(`not a type the builder places: ${type}`);
  }
  const el = createElement(doc, type, { x: 0, y: 0, z: 0 });
  el.pitch = 0;
  el.yawOverridden = true;
  setPose(el, base, quat);
  doc.elements.push(el);
  /* entry 1: the rest pose already says which way through, so the face is
   * decided the moment the gate is placed. */
  doc.sequence.push({
    id: newSequenceId(doc),
    elementId: el.id,
    apertureIndex: 0,
    entry: 1,
    passSide: null,
    clearance: null,
    overridden: false,
  });
  return el;
}

export function removeGate(doc, id) {
  doc.elements = doc.elements.filter((e) => e.id !== id);
  doc.sequence = doc.sequence.filter((s) => s.elementId !== id);
}

/* The element's place in the lap, or -1. The builder gives every gate one
 * step, so this is the flying order. */
export function orderOf(doc, id) {
  return doc.sequence.findIndex((s) => s.elementId === id);
}

/* Move an element one step earlier (-1) or later (+1) in the lap. */
export function moveInLap(doc, id, step) {
  const i = orderOf(doc, id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= doc.sequence.length) {
    return false;
  }
  const [s] = doc.sequence.splice(i, 1);
  doc.sequence.splice(j, 0, s);
  return true;
}

/* Make an element the start gate by rotating the lap round to it, so the
 * order after it is unchanged: a lap is a loop, and the start is where it is
 * cut. */
export function makeStart(doc, id) {
  const i = orderOf(doc, id);
  if (i <= 0) {
    return i === 0;
  }
  doc.sequence = [...doc.sequence.slice(i), ...doc.sequence.slice(0, i)];
  return true;
}

/*
 * The gates the race scores, in flying order: the shape src/game/race.js
 * reads, with the whole frame given as `axes` because a heading and a pitch
 * cannot say a gate on its side.
 *
 * `position` is the opening's centre less centreY straight up, because
 * race.js measures the centre as position plus centreY along the world's up.
 * That is exact for the field's upright gates and for these the arithmetic
 * lands on the same centre whichever way the gate is turned.
 */
export function raceGatesOf(doc) {
  const out = [];
  doc.sequence.forEach((s, i) => {
    const el = elementById(doc, s.elementId);
    if (!el || !BUILD_TYPES.includes(el.type)) {
      return;
    }
    const ops = openingsOf(el);
    const k = Math.min(Math.max(0, s.apertureIndex ?? 0), ops.length - 1);
    const op = ops[k];
    const c = openingCentre(el, k);
    const { quat } = poseOf(el);
    const axes = axesOf(quat);
    const aperture = { centreY: op.centreY, clearW: op.clearW, clearH: op.clearH };
    out.push({
      position: v3(c.x, c.y - op.centreY, c.z),
      centre: c,
      heading: headingOf(axes.travel.x, axes.travel.z),
      pitch: Math.asin(Math.max(-1, Math.min(1, axes.travel.y))),
      axes,
      aperture,
      apertures: [aperture],
      apertureIndex: k,
      kindName: el.type,
      elementId: el.id,
      flyOrder: i,
      virtual: false,
    });
  });
  return out;
}

/*
 * Where a test flight is parked: SPAWN_BACK behind the start gate along its
 * direction of travel, facing through it, on whatever ground is there. A
 * gate flown straight down has no horizontal travel to stand behind, so the
 * top edge of its opening stands in for it.
 */
export function spawnFor(gates) {
  if (!gates.length) {
    return null;
  }
  const g = gates[0];
  let fx = g.axes.travel.x;
  let fz = g.axes.travel.z;
  if (Math.hypot(fx, fz) < 0.05) {
    fx = g.axes.up.x;
    fz = g.axes.up.z;
  }
  const n = Math.hypot(fx, fz) || 1;
  fx /= n;
  fz /= n;
  return {
    x: g.centre.x - fx * SPAWN_BACK,
    z: g.centre.z - fz * SPAWN_BACK,
    yaw: headingOf(fx, fz),
  };
}

/*
 * Where a test flight starts, on the ground or in the air.
 *
 * THE RULE. A start gate whose opening is hung more than one opening's
 * height over the ground under it cannot be flown from the ground behind
 * it without climbing first, so the run starts in the air: SPAWN_BACK
 * before the opening along its own line of travel, which is the opening's
 * height for a level gate, lined up to fly straight through it. The spawn
 * says so with `air: { y }` and the shell (src/main.js airStart) puts the
 * craft there. Any other start gate, a gate on the ground among them, is
 * spawnFor's ground start as before. So is a hung one whose start point is
 * not at least half an opening clear of the ground under it, a gate hung
 * off a slope that rises behind it: the ground there is the start line.
 *
 * `heightAt(x, z)` is the map's.
 */
export function startFor(gates, heightAt) {
  const ground = spawnFor(gates);
  if (!ground) {
    return null;
  }
  const g = gates[0];
  const t = g.axes.travel;
  const c = g.centre;
  const p = v3(c.x - t.x * SPAWN_BACK, c.y - t.y * SPAWN_BACK, c.z - t.z * SPAWN_BACK);
  const hung = c.y - heightAt(c.x, c.z) > g.aperture.clearH;
  const clear = p.y - heightAt(p.x, p.z) >= g.aperture.clearH / 2;
  if (!hung || !clear) {
    return ground;
  }
  return { x: p.x, z: p.z, yaw: ground.yaw, air: { y: p.y } };
}

/*
 * What the builder reads out for one gate: its opening's height over the
 * ground under it, and the next gate in the lap's distance and drop (drop
 * positive when the next one is lower). `heightAt(x, z)` is the map's.
 */
export function readoutFor(gates, index, heightAt) {
  const g = gates[index];
  if (!g) {
    return null;
  }
  const out = { height: g.centre.y - heightAt(g.centre.x, g.centre.z), next: null };
  if (gates.length > 1) {
    const n = gates[(index + 1) % gates.length];
    out.next = {
      order: (index + 1) % gates.length,
      distance: Math.hypot(n.centre.x - g.centre.x, n.centre.y - g.centre.y, n.centre.z - g.centre.z),
      drop: g.centre.y - n.centre.y,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Placement                                                           */
/* ------------------------------------------------------------------ */

/* The three ways a gate meets the world. */
export const SNAP_MODES = ['ground', 'surface', 'air'];

/* The author's own turn on top of the snap: yaw about the gate's up, then
 * tilt about its across axis, then roll about its direction of travel. */
function userTurn(turn) {
  return qMul(qMul(qAxis(0, 1, 0, turn.yaw), qAxis(1, 0, 0, turn.pitch)), qAxis(0, 0, 1, turn.roll));
}

/*
 * The pose a gate takes for a snap mode.
 *
 *   ground   stands upright on the hit point, flown the way the camera looks
 *   surface  its up along the surface normal, so it stands out of a cliff
 *            face or a roof, flown along the surface the way the camera looks
 *   air      its opening centred `distance` in front of the camera, where
 *            nothing has to be under it: the gate out over a drop
 *
 * hit is { point, normal } in the scene, or null when the crosshair meets
 * nothing, which leaves ground and surface nothing to stand on: they fall
 * back to air, and the result says so. cam is { position, forward }, turn is
 * { yaw, pitch, roll } and centreY is the first opening's height above the
 * base. Returns { base, quat, mode }.
 */
export function snapPose(mode, hit, cam, turn, distance, centreY) {
  const f = cam.forward;
  const h = headingOf(f.x, f.z);
  const want = hit ? mode : 'air';
  if (want === 'surface') {
    const up = unit(hit.normal) ?? v3(0, 1, 0);
    /* Along the surface, the way the camera looks: the camera's forward with
     * its component along the normal taken out. Looking square at a wall
     * leaves nothing, so the direction down the wall stands in. */
    const along = f.x * up.x + f.y * up.y + f.z * up.z;
    let t = unit(v3(f.x - up.x * along, f.y - up.y * along, f.z - up.z * along));
    if (!t) {
      const down = -up.y;
      t = unit(v3(-up.x * down, -1 - up.y * down, -up.z * down)) ?? unit(cross(up, v3(1, 0, 0)));
    }
    const z = v3(-t.x, -t.y, -t.z);
    const x = cross(up, z);
    const base = qBasis(x, up, z);
    return { base: v3(hit.point.x, hit.point.y, hit.point.z), quat: qMul(base, userTurn(turn)), mode: want };
  }
  const quat = qMul(qAxis(0, 1, 0, h), userTurn(turn));
  if (want === 'ground') {
    return { base: v3(hit.point.x, hit.point.y, hit.point.z), quat, mode: want };
  }
  const c = v3(cam.position.x + f.x * distance, cam.position.y + f.y * distance, cam.position.z + f.z * distance);
  const up = qRot(quat, 0, centreY, 0);
  return { base: v3(c.x - up.x, c.y - up.y, c.z - up.z), quat, mode: want };
}

/*
 * Turn a placed gate about one of its own axes ('yaw' up, 'pitch' across,
 * 'roll' travel), pivoting on its first opening's centre so a gate hung in
 * the air turns where it hangs. Returns the new { base, quat }.
 */
export function turnGate(el, axis, angle) {
  const { quat } = poseOf(el);
  const c = openingCentre(el, 0);
  const local = axis === 'yaw' ? qAxis(0, 1, 0, angle) : (axis === 'pitch' ? qAxis(1, 0, 0, angle) : qAxis(0, 0, 1, angle));
  const next = qNorm(qMul(quat, local));
  const up = qRot(next, 0, openingsOf(el)[0].centreY, 0);
  return { base: v3(c.x - up.x, c.y - up.y, c.z - up.z), quat: next };
}
