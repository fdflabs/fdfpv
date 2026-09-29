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
  ELEMENTS, GATE_FLAG_POLE_R, KIND, apertureLevels, flagLeanSign, flagSideOf, flagSideSigns, gateFlagHeight,
  virtualApertureDims,
} from '../trackbuilder/elements.js';
import { passOffsetSign } from '../trackbuilder/faces.js';
import { createElement, createMapTrack, elementById, newSequenceId } from '../trackbuilder/model.js';
import { BUILT_FRAME_TUBE_OD, gateScaleFor } from '../game/track.js';
import { IN } from '../units.js';
import { docPosToThree, docQuatToThree, threePosToDoc, threeQuatToDoc } from '../render/frame.js';
import { badWordIn } from '../../tracks-api/words.js';
import { TRACK_NAME_MAX } from '../../tracks-api/limits.js';

/*
 * What can be placed. The field's aperture types that stand as one frame
 * on the ground: a dive gate and a launch gate are this list's gate turned,
 * now that a gate can be turned any way at all. Then the plane sized ones
 * (src/trackbuilder/elements.js, the span rule): the two wide gates, the
 * air race's pylon pair, and one pylon turned round on a set side, a marker
 * scoring through the square beside it. Then the sky hoops, round openings
 * that float: two small ones for the quads and the 30 m one for the
 * planes. Flags and cones are not here: they are the field's markers,
 * sized for a five inch.
 *
 * The 6, 12 and 20 m plane hoops are retired. The owner: "I only want the
 * 30 m hoop." No hotbar, inventory or generated course offers them, but
 * saved and published tracks name them, so they still load, draw, race and
 * can be moved: they stay in BUILD_TYPES and out of PIECES.
 */
export const HOOP_TYPES = ['hoop175', 'hoop250', 'hoop30'];
export const RETIRED_HOOPS = ['hoop6', 'hoop12', 'hoop20'];
export const BUILD_TYPES = ['gate', 'flaggedGate', 'doubleStack', 'ladder', 'tower', 'wideGate3', 'wideGate5', 'pylonPair', 'pylon', ...HOOP_TYPES, ...RETIRED_HOOPS];

/*
 * THE PIECES the hotbar and the inventory hold: a type, and what placing
 * it says about its step in the lap. The start gate is a gate that becomes
 * the start when it lands (makeStart), and a pylon comes as two pieces, one
 * for each side it is passed on, so turning a pylon round is picking the
 * other piece rather than a key of its own. `cat` is the inventory's
 * shelf. Every BUILD_TYPES type but the retired hoops is here.
 */
export const PIECES = [
  { id: 'start', type: 'gate', start: true, cat: 'gates' },
  { id: 'gate', type: 'gate', cat: 'gates' },
  { id: 'flaggedGate', type: 'flaggedGate', cat: 'gates' },
  { id: 'doubleStack', type: 'doubleStack', cat: 'stacks' },
  { id: 'ladder', type: 'ladder', cat: 'stacks' },
  { id: 'tower', type: 'tower', cat: 'stacks' },
  { id: 'wideGate3', type: 'wideGate3', cat: 'wide' },
  { id: 'wideGate5', type: 'wideGate5', cat: 'wide' },
  { id: 'pylonPair', type: 'pylonPair', cat: 'air' },
  { id: 'pylon', type: 'pylon', passSide: 'left', cat: 'air' },
  { id: 'pylonRight', type: 'pylon', passSide: 'right', cat: 'air' },
  ...HOOP_TYPES.map((type) => ({ id: type, type, cat: 'sky' })),
];

/* What a retired hoop placed on an old track is when it is picked up (F):
 * itself, so it moves as the size it is. A middle click or a copy of one
 * (offeredPiece) is the 30 m hoop, the one plane hoop still placed. */
const RETIRED_PIECES = RETIRED_HOOPS.map((type) => ({
  id: type, type, cat: 'sky', retired: true, successor: 'hoop30',
}));

/* The inventory's shelves, in order. */
export const PIECE_CATS = ['gates', 'stacks', 'wide', 'air', 'sky'];

/* The hotbar a new builder starts with: the common pieces, one a slot, the
 * two quad hoops among them. */
export const DEFAULT_HOTBAR = ['start', 'gate', 'flaggedGate', 'doubleStack', 'hoop175', 'hoop250', 'wideGate3', 'wideGate5', 'ladder'];

/* The hotbar a builder starts with when a fixed wing is seated: the 30 m
 * hoop and the air race's pylon pair first, the owner's two plane pieces
 * ("reintroduce the large air gates like Red Bull Air Race, not only
 * hoops"), then the single pylons and the wide gates, which are every
 * piece a plane fits. That is six, so the last three slots are the five
 * inch gates a mixed course is most likely to want; the quad hoops stay in
 * the inventory (E), since the owner wants no hoop but the 30 m one in a
 * plane's hand. No start piece: the first gate placed is the start. */
export const WING_FIRST = ['hoop30', 'pylonPair'];
export const DEFAULT_WING_HOTBAR = [...WING_FIRST, 'pylon', 'pylonRight', 'wideGate5', 'wideGate3', 'gate', 'flaggedGate', 'doubleStack'];

export const HOTBAR_SLOTS = 9;

/* A hotbar as this browser stored it (`got`, anything JSON.parse gave),
 * against its kind's defaults. A slot that is no longer a piece, a retired
 * hoop saved before it was retired or anything unreadable, is dropped and
 * the pilot's own pieces close up in their order. Each of `first` the bar
 * lacks goes back in at its default slot, which is how a bar stored
 * before the plane pieces were put first gets them back (buildmode.js runs
 * that once, as it moves the bar to a new key). The defaults the bar does
 * not already hold fill the end. So a stale bar does not keep offering a
 * retired hoop, shows no piece twice, and the old plane default comes back
 * as the new one exactly. */
export function restoreHotbar(got, defaults, first = []) {
  const kept = Array.isArray(got) ? got.slice(0, defaults.length).filter((id) => pieceById(id)) : [];
  for (const id of first) {
    if (!kept.includes(id)) {
      kept.splice(defaults.indexOf(id), 0, id);
    }
  }
  return [...kept, ...defaults.filter((id) => !kept.includes(id))].slice(0, defaults.length);
}

export function pieceById(id) {
  return PIECES.find((p) => p.id === id) ?? null;
}

/* The piece a placed element is, for a middle click: the start gate for
 * the lap's first gate, a pylon by its side. */
export function pieceOf(doc, id) {
  const el = elementById(doc, id);
  const step = stepOf(doc, id);
  if (!el || !step) {
    return null;
  }
  if (el.type === 'gate' && orderOf(doc, id) === 0) {
    return pieceById('start');
  }
  return PIECES.find((p) => p.type === el.type && !p.start && (p.passSide ?? null) === (step.passSide ?? null))
    ?? [...PIECES, ...RETIRED_PIECES].find((p) => p.type === el.type && !p.start);
}

/* The piece a middle click or a copy puts in hand for `piece`: the piece
 * itself, or for a retired hoop the hoop that replaced it. */
export function offeredPiece(piece) {
  return piece && piece.retired ? pieceById(piece.successor) : piece;
}

/* A five inch's gate is built at the field's 15 percent on MultiGP's
 * figures, the same size it is on the field. A plane sized element is
 * built at the wing class's one to one: its figures are already metres
 * against the aircraft's spans. */
const GATE_SCALE = gateScaleFor('full');
const WING_SCALE = gateScaleFor('wing');

function scaleOf(el) {
  return ELEMENTS[el.type].wing ? WING_SCALE : GATE_SCALE;
}

/* A wide gate's pipe, 1 1/2 inch schedule 40 (elements.js, wideGate3). */
const BANNER_TUBE_OD = 1.900 * IN;

/* The single pylon is the one marker placed here. */
function isMarker(el) {
  return ELEMENTS[el.type].kind === KIND.MARKER;
}

/* A sky hoop: a round opening that floats (elements.js). */
export function isHoop(type) {
  return Boolean(ELEMENTS[type]?.round);
}

/* How far behind the start gate a test flight is parked, the field's own
 * figure (src/game/trackdoc.js SPAWN_BACK), or the opening's own width
 * where that is more: from 7.5 m behind a 30 m hoop the pilot is inside
 * its ring and sees none of it. */
export const SPAWN_BACK = 7.5;

function spawnBack(g) {
  return Math.max(SPAWN_BACK, g.aperture.clearW);
}

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
 * The spec src/render/pylons.js builtGate builds from, at BUILT dimensions:
 * the author's figures through the element's scale, the same conversion
 * src/game/trackdoc.js makes for a field course. A framed gate's is the
 * obstacle spec scene.js standaloneGate reads, a wide gate's naming its own
 * pipe and the collider kind that pipe is; a pylon's is its cone, and the
 * single pylon's the side it is turned round on, from its step in the lap
 * (`step`, a sequence entry; none for the ghost, which shows the default).
 */
export function gateSpec(el, step = null) {
  const d = el.dims;
  if (isMarker(el)) {
    const sq = scoringOf(el, step);
    return {
      kindName: el.type,
      height: d.height,
      baseRadius: d.baseRadius,
      tipRadius: d.tipRadius,
      clearance: step?.clearance ?? d.clearance,
      passSign: passOffsetSign(step?.passSide ?? 'left'),
      scoring: {
        shape: 'square', index: 0, sillH: sq.centreY - sq.clearH / 2, centreY: sq.centreY, clearW: sq.clearW, clearH: sq.clearH,
      },
    };
  }
  if (el.type === 'pylonPair') {
    return {
      kindName: el.type, clearW: d.clearW, height: d.clearH, baseRadius: d.baseRadius, tipRadius: d.tipRadius,
    };
  }
  if (isHoop(el.type)) {
    /* A plane hoop's rim is the soft 'hoop' kind (src/game/jelly.js); a
     * quad hoop's is a thin firm tube, a gate's. */
    return {
      kindName: 'hoop', diameter: d.clearW, tubeR: d.tubeR, rimKind: ELEMENTS[el.type].plane ? 'hoop' : 'gate',
    };
  }
  const s = scaleOf(el);
  return {
    kindName: el.type,
    clearW: d.clearW * s,
    clearH: d.clearH * s,
    sillH: d.sillH * s,
    stack: Math.max(1, Math.round(d.levels)),
    levelPitch: d.levelPitch * s,
    ...(ELEMENTS[el.type].wing ? { tubeOD: BANNER_TUBE_OD, frameKind: 'banner' } : {}),
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
  if (isMarker(el)) {
    /* A pylon's is the cone itself, what the builder hangs, turns and
     * pivots it by; what it scores is scoringOf's. */
    return [{ centreY: el.dims.height / 2, clearW: el.dims.baseRadius * 2, clearH: el.dims.height }];
  }
  const s = scaleOf(el);
  return apertureLevels(el.dims).map((ap) => ({
    centreY: ap.centerH * s,
    clearW: ap.clearW * s,
    clearH: ap.clearH * s,
  }));
}

/*
 * The rectangle a step scores through, in the element's own frame: its
 * centre `across` metres along the race's across axis, R(-x), and centreY
 * up, and its size. An opening's is the opening. A pylon's is the wing
 * class's square on its pass side (elements.js virtualApertureDims): its
 * inner edge on the pylon's axis, `across` positive for a pass on the
 * pilot's left, which is the schema's `left(travel)` (schema.md, What
 * passSide means).
 */
export function scoringOf(el, step = null) {
  if (!isMarker(el)) {
    const ops = openingsOf(el);
    const op = ops[Math.min(Math.max(0, step?.apertureIndex ?? 0), ops.length - 1)];
    return {
      across: 0, centreY: op.centreY, clearW: op.clearW, clearH: op.clearH, round: isHoop(el.type),
    };
  }
  const v = virtualApertureDims(el, step, 'wing');
  const clearance = Math.max(0, step?.clearance ?? el.dims.clearance);
  return {
    across: passOffsetSign(step?.passSide ?? 'left') * (clearance + v.outward),
    centreY: v.centerH,
    clearW: v.clearW,
    clearH: v.clearH,
  };
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
  return capsAt(base, quat, caps);
}

/* The same, for a scene pose rather than an element: the ghost's. */
export function capsAt(base, quat, caps) {
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

/* A gate placed at a scene pose, appended to the lap. Returns the element.
 * `passSide` is a pylon's, 'left' unless it says otherwise. */
export function addGate(doc, type, base, quat, passSide = 'left') {
  if (!BUILD_TYPES.includes(type)) {
    throw new Error(`not a type the builder places: ${type}`);
  }
  const el = createElement(doc, type, { x: 0, y: 0, z: 0 });
  el.pitch = 0;
  el.yawOverridden = true;
  setPose(el, base, quat);
  doc.elements.push(el);
  /* entry 1: the rest pose already says which way through, so the face is
   * decided the moment the gate is placed. A pylon's step says which side
   * instead, the piece's (PIECES). A right hand one is marked overridden,
   * as the field marks a side the author chose over the default. */
  const marker = isMarker(el);
  const side = passSide === 'right' ? 'right' : 'left';
  doc.sequence.push({
    id: newSequenceId(doc),
    elementId: el.id,
    apertureIndex: marker ? null : 0,
    entry: marker ? null : 1,
    passSide: marker ? side : null,
    clearance: marker ? el.dims.clearance : null,
    overridden: marker && side === 'right',
  });
  return el;
}

/* The step an element is flown as: the builder gives each one exactly one. */
export function stepOf(doc, id) {
  return doc.sequence.find((q) => q.elementId === id) ?? null;
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

/*
 * The lap in a new order: the elements `ids` names first, in that order,
 * then every other one in the order it had. So an author who clicks the
 * gates round the lap from the start sets the whole order, and one who
 * stops after three has set the first three. Ids that are not in the lap
 * are ignored. True when the order changed.
 */
export function setOrder(doc, ids) {
  const was = doc.sequence.map((s) => s.elementId).join();
  const picked = [];
  for (const id of ids) {
    const s = doc.sequence.find((q) => q.elementId === id);
    if (s && !picked.includes(s)) {
      picked.push(s);
    }
  }
  doc.sequence = [...picked, ...doc.sequence.filter((s) => !picked.includes(s))];
  return doc.sequence.map((s) => s.elementId).join() !== was;
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
 * `position` is the scoring rectangle's centre less centreY straight up,
 * because race.js measures the centre as position plus centreY along the
 * world's up. That is exact for the field's upright gates and for these the
 * arithmetic lands on the same centre whichever way the gate is turned. A
 * pylon's rectangle is `virtual`, as the field's flags are: the race times
 * the lap from the first real opening.
 */
export function raceGatesOf(doc) {
  const out = [];
  doc.sequence.forEach((s, i) => {
    const el = elementById(doc, s.elementId);
    if (el && BUILD_TYPES.includes(el.type)) {
      out.push(raceGateOf(el, s, i));
    }
  });
  return out;
}

/*
 * The gate's structure in its scoring opening's own plane, for a scored
 * race's reach (src/game/race.js structureGap): x along the race's across
 * axis, y up, from the opening's centre, metres, from the same figures
 * the mesh is built from. A hoop is its rim's outer circle; a framed gate
 * the box its tubes stand in round the opening; the pylon pair its two
 * cones; a pylon its cone, and the side of it the square is on.
 */
function structureOf(el, sc) {
  const d = el.dims;
  if (isHoop(el.type)) {
    return { kind: 'ring', r: d.clearW / 2 + 2 * d.tubeR };
  }
  const cone = (x, y0) => ({
    x, y0, h: d.height ?? d.clearH, r0: d.baseRadius, r1: d.tipRadius,
  });
  if (el.type === 'pylonPair') {
    const x = d.clearW / 2 + d.baseRadius;
    return { kind: 'cones', cones: [cone(-x, -sc.centreY), cone(x, -sc.centreY)] };
  }
  if (isMarker(el)) {
    return { kind: 'cone', cone: cone(-sc.across, -sc.centreY), side: sc.across < 0 ? -1 : 1 };
  }
  const tube = ELEMENTS[el.type].wing ? BANNER_TUBE_OD : BUILT_FRAME_TUBE_OD;
  return { kind: 'box', hw: sc.clearW / 2 + tube, hh: sc.clearH / 2 + tube };
}

/* One element's race gate, flown as `step`, at place `flyOrder` in the lap. */
export function raceGateOf(el, step, flyOrder) {
  const sc = scoringOf(el, step);
  const { base, quat } = poseOf(el);
  const axes = axesOf(quat);
  const c = v3(
    base.x + axes.up.x * sc.centreY + axes.across.x * sc.across,
    base.y + axes.up.y * sc.centreY + axes.across.y * sc.across,
    base.z + axes.up.z * sc.centreY + axes.across.z * sc.across,
  );
  const k = Math.min(Math.max(0, step.apertureIndex ?? 0), openingsOf(el).length - 1);
  /* `round`: the opening is a disc of diameter clearW, scored as one
   * (src/game/race.js) and fitted by the hoop rule (src/builder/line.js). */
  const aperture = {
    centreY: sc.centreY, clearW: sc.clearW, clearH: sc.clearH, ...(sc.round ? { round: true } : {}), frame: structureOf(el, sc),
  };
  return {
    position: v3(c.x, c.y - sc.centreY, c.z),
    centre: c,
    heading: headingOf(axes.travel.x, axes.travel.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, axes.travel.y))),
    axes,
    aperture,
    apertures: [aperture],
    apertureIndex: k,
    kindName: el.type,
    elementId: el.id,
    flyOrder,
    virtual: isMarker(el),
  };
}

/*
 * The race gate a piece WOULD be at a scene pose, for the ghost: what the
 * blocked rule (src/builder/line.js openingBlocked) asks of a gate before
 * it is placed. Nothing is added to any document.
 */
export function pieceGate(piece, base, quat) {
  const el = { id: null, type: piece.type, dims: ELEMENTS[piece.type].dims };
  setPose(el, base, quat);
  const marker = isMarker(el);
  const step = {
    apertureIndex: marker ? null : 0, passSide: marker ? (piece.passSide ?? 'left') : null, clearance: marker ? el.dims.clearance : null,
  };
  return raceGateOf(el, step, -1);
}

/*
 * Where a test flight is parked: spawnBack behind the start gate along its
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
    x: g.centre.x - fx * spawnBack(g),
    z: g.centre.z - fz * spawnBack(g),
    yaw: headingOf(fx, fz),
  };
}

/*
 * Where a test flight starts, on the ground or in the air.
 *
 * THE RULE. A start gate whose opening is hung more than one opening's
 * height over the ground under it cannot be flown from the ground behind
 * it without climbing first, so the run starts in the air: spawnBack
 * before the opening along its own line of travel, which is the opening's
 * height for a level gate, lined up to fly straight through it. The spawn
 * says so with `air: { y }` and the shell (src/main.js airStart) puts the
 * craft there. Any other start gate, a gate on the ground among them, is
 * spawnFor's ground start as before. So is a hung one whose start point is
 * not at least half an opening clear of the ground under it, a gate hung
 * off a slope that rises behind it: the ground there is the start line.
 *
 * A ground start also carries `lift`: the air start the same gate would
 * give if the aircraft could not start on the ground there (floatStart).
 * Every start this returns has `lift` or `air`, which is how the shell
 * tells a course's start from a map's own spawn.
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
  const back = spawnBack(g);
  const p = v3(c.x - t.x * back, c.y - t.y * back, c.z - t.z * back);
  const hung = c.y - heightAt(c.x, c.z) > g.aperture.clearH;
  const clear = p.y - heightAt(p.x, p.z) >= g.aperture.clearH / 2;
  if (!hung || !clear) {
    /* Lined up on the opening as the air start is, and never less than
     * half an opening over the ground under it, the rule's own clearance. */
    const y = Math.max(p.y, heightAt(p.x, p.z) + g.aperture.clearH / 2);
    return { ...ground, lift: { x: p.x, z: p.z, y } };
  }
  return { x: p.x, z: p.z, yaw: ground.yaw, air: { y: p.y } };
}

/*
 * Where an aircraft on floats starts a course, from startFor's `start`.
 *
 * On floats a ground start is a start on the water: the aircraft sits on
 * its floats behind the start gate and takes off off the lake, which is the
 * only ground a floatplane takes off from. So a ground start whose spot is
 * on the water (`onWater(x, z)`, the map's) stays as it is, and one on land,
 * where a floatplane would sit on its keels in the grass, becomes the air
 * start the same gate carries in `lift`, lined up on its opening by the air
 * start rule. An air start is an air start for every aircraft.
 */
export function floatStart(start, onWater) {
  if (!start || start.air || !start.lift || onWater(start.x, start.z)) {
    return start;
  }
  return { x: start.lift.x, z: start.lift.z, yaw: start.yaw, air: { y: start.lift.y } };
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

/* The grid snap (G): positions to half a metre, headings to the same 15
 * degrees one press of R turns by. */
export const GRID_STEP = 0.5;
export const TURN_STEP = 15 * Math.PI / 180;

/* A surface whose normal is more than 50 degrees off straight up is a face
 * a gate stands out of; anything flatter is ground it stands upright on, a
 * steep meadow among it, because a gate on a slope is still built plumb. */
const FACE_COS = Math.cos(50 * Math.PI / 180);

const snapTo = (v, step) => Math.round(v / step) * step;

/* The author's own turn on top of the snap: yaw about the gate's up, then
 * tilt about its across axis, then roll about its direction of travel. */
function userTurn(turn) {
  return qMul(qMul(qAxis(0, 1, 0, turn.yaw), qAxis(1, 0, 0, turn.pitch)), qAxis(0, 0, 1, turn.roll));
}

/* The orientation a face gives a gate: its up along the normal, flown along
 * the face the way the camera looks, the camera's forward with its part
 * along the normal taken out. Looking square at a wall leaves nothing, so
 * the direction down the wall stands in. */
function faceBasis(normal, f) {
  const up = unit(normal) ?? v3(0, 1, 0);
  const along = f.x * up.x + f.y * up.y + f.z * up.z;
  let t = unit(v3(f.x - up.x * along, f.y - up.y * along, f.z - up.z * along));
  if (!t) {
    const down = -up.y;
    t = unit(v3(-up.x * down, -1 - up.y * down, -up.z * down)) ?? unit(cross(up, v3(1, 0, 0)));
  }
  const z = v3(-t.x, -t.y, -t.z);
  return qBasis(cross(up, z), up, z);
}

/*
 * The pose the next piece takes where the crosshair is.
 *
 *   ground   the crosshair is on ground or a roof: it stands upright on the
 *            hit point, flown the way the camera looks
 *   surface  the crosshair is on a face steeper than FACE_COS: its up along
 *            the face's normal, so it stands out of the cliff, flown along
 *            the face the way the camera looks
 *   air      Alt is held (opts.air), or the crosshair meets nothing in
 *            range: its opening centred `distance` in front of the camera,
 *            where nothing has to be under it, the gate out over a drop
 *
 * hit is { point, normal } in the scene or null, cam { position, forward },
 * turn { yaw, pitch, roll } the author's own turn on top, and centreY the
 * first opening's height above the base. opts.keep is the orientation of a
 * piece being carried, which it keeps wherever it goes, the turn on top.
 * opts.grid rounds the position to GRID_STEP, and a heading taken from the
 * camera to TURN_STEP; on ground and faces the rounded point is put back
 * on the plane the crosshair read, so the piece stays on what it stands on.
 * Returns { base, quat, mode }.
 */
export function snapPose(hit, cam, turn, distance, centreY, opts = {}) {
  const f = cam.forward;
  const n = hit ? unit(hit.normal) : null;
  let mode = 'air';
  if (hit && !opts.air) {
    mode = n && n.y < FACE_COS ? 'surface' : 'ground';
  }
  let heading = headingOf(f.x, f.z);
  if (opts.grid) {
    heading = snapTo(heading, TURN_STEP);
  }
  let rest = qAxis(0, 1, 0, heading);
  if (opts.keep) {
    rest = opts.keep;
  } else if (mode === 'surface') {
    rest = faceBasis(n, f);
  }
  const quat = qNorm(qMul(rest, userTurn(turn)));
  if (mode !== 'air') {
    const p = hit.point;
    if (!opts.grid) {
      return { base: v3(p.x, p.y, p.z), quat, mode };
    }
    const r = v3(snapTo(p.x, GRID_STEP), snapTo(p.y, GRID_STEP), snapTo(p.z, GRID_STEP));
    const up = n ?? v3(0, 1, 0);
    if (mode === 'ground') {
      /* Straight down onto the plane, so the piece keeps its rounded x and z. */
      const y = p.y - (up.x * (r.x - p.x) + up.z * (r.z - p.z)) / up.y;
      return { base: v3(r.x, y, r.z), quat, mode };
    }
    const off = (r.x - p.x) * up.x + (r.y - p.y) * up.y + (r.z - p.z) * up.z;
    return { base: v3(r.x - up.x * off, r.y - up.y * off, r.z - up.z * off), quat, mode };
  }
  let c = v3(cam.position.x + f.x * distance, cam.position.y + f.y * distance, cam.position.z + f.z * distance);
  if (opts.grid) {
    c = v3(snapTo(c.x, GRID_STEP), snapTo(c.y, GRID_STEP), snapTo(c.z, GRID_STEP));
  }
  const up = qRot(quat, 0, centreY, 0);
  return { base: v3(c.x - up.x, c.y - up.y, c.z - up.z), quat, mode };
}

/*
 * THE HOOP CHAIN, Shift and a click with a hoop in hand: the next hoop
 * `distance` metres on from `from`, the last gate in the lap (a race gate,
 * raceGateOf), along the camera's look `forward`, and turned to be flown
 * along that line, climbing or diving with it. So a pilot lays a sky course
 * by looking where the next hoop goes and clicking, with no need to fly
 * there. The author's own turn goes on top and the grid rounds it as it
 * rounds any air placement; centreY is the hoop's centre over its base.
 * Returns { base, quat, centre }.
 *
 * The spacing is the aircraft's, CHAIN below: the owner asked for plane
 * courses laid "5 to 6 times more apart" than a quad's, so a child flying
 * one has time to line up on every hoop.
 */
export const CHAIN = {
  quad: { start: 30, min: 5, max: 200, notch: 5 },
  plane: { start: 400, min: 50, max: 1500, notch: 25 },
};

export function chainPose(from, forward, distance, turn, centreY, grid = false) {
  const f = unit(forward) ?? v3(0, 0, -1);
  let c = v3(from.centre.x + f.x * distance, from.centre.y + f.y * distance, from.centre.z + f.z * distance);
  let heading = headingOf(f.x, f.z);
  if (grid) {
    c = v3(snapTo(c.x, GRID_STEP), snapTo(c.y, GRID_STEP), snapTo(c.z, GRID_STEP));
    heading = snapTo(heading, TURN_STEP);
  }
  /* A turn about the hoop's across axis by the climb takes its travel,
   * (0, 0, -1) at rest, onto (0, sin, -cos): up the look. */
  const climb = Math.asin(Math.max(-1, Math.min(1, f.y)));
  const quat = qNorm(qMul(qMul(qAxis(0, 1, 0, heading), qAxis(1, 0, 0, climb)), userTurn(turn)));
  const up = qRot(quat, 0, centreY, 0);
  return { base: v3(c.x - up.x, c.y - up.y, c.z - up.z), quat, centre: c };
}

/*
 * THE CASUAL SKY TRACK, the one click starter My tracks offers a plane
 * (src/ui/ui.js): CASUAL.gates big gates round a wide oval, CASUAL.spacing
 * apart, flown round it counter clockwise from above. The owner's words:
 * "even a very small child can complete the courses", and then
 * "reintroduce the large air gates like Red Bull Air Race, not only
 * hoops". So by turns a 30 m hoop, hung CASUAL.over metres over the
 * highest ground on its way to the next and never more than CASUAL.top
 * over its own, and the air race's pylon pair, standing on the ground,
 * starting with a hoop. A pair goes only where the ground will take it:
 * the ground across it, cone to cone, within CASUAL.level from its lowest
 * to its highest, so the cones stand and the opening's foot, 2.5 m up, is
 * out of the ground (line.js openingBlocked); none
 * half way to either neighbour more than CASUAL.clear over it, so the line
 * through its middle, 12.5 m up, clears it; and none all the way to either
 * more than CASUAL.rise over it, so the dive from a hoop to it and the
 * climb out clear the ground. Where the ground will not, that slot is a
 * hoop too.
 *
 * Where: of ovals centred within CASUAL.reach of `from` (the world's
 * spawn), at four turns and on a grid, the one whose ground is flattest
 * under its path and whose hoops all fit the height rule. Flattest first,
 * not most pairs: a hillier oval puts hillsides beside the gates, and a
 * child missing a hoop wide flies into them. The oval is
 * sized so its length is the spacing times the number of gates, and the
 * gates go on it at equal steps of its length. `heightAt(x, z)` is the
 * map's. Returns a new map track, or null where no oval fits.
 */
/* The casual oval's short axis over its long one. */
const ASPECT = 0.6;
export const CASUAL = {
  gates: 8, spacing: 400, over: 60, top: 150, reach: 1600, step: 200, types: ['hoop30', 'pylonPair'], level: 2, clear: 8, rise: 30,
};

export function casualCourse(mapId, name, heightAt, from) {
  /* The parameter of each gate on an oval of semi axes 1 and ASPECT, at
   * equal steps of its length, and that length, from a fine polyline. */
  const M = 720;
  const len = [0];
  for (let j = 1; j <= M; j += 1) {
    const u0 = (2 * Math.PI * (j - 1)) / M;
    const u1 = (2 * Math.PI * j) / M;
    len.push(len[j - 1] + Math.hypot(Math.cos(u1) - Math.cos(u0), ASPECT * (Math.sin(u1) - Math.sin(u0))));
  }
  const us = [];
  for (let i = 0, j = 0; i < CASUAL.gates; i += 1) {
    const want = (len[M] * i) / CASUAL.gates;
    while (len[j + 1] < want) {
      j += 1;
    }
    us.push(((2 * Math.PI) / M) * (j + (want - len[j]) / (len[j + 1] - len[j])));
  }
  const a = (CASUAL.gates * CASUAL.spacing) / len[M];
  let best = null;
  for (let cx = from.x - CASUAL.reach; cx <= from.x + CASUAL.reach; cx += CASUAL.step) {
    for (let cz = from.z - CASUAL.reach; cz <= from.z + CASUAL.reach; cz += CASUAL.step) {
      for (let k = 0; k < 4; k += 1) {
        const turn = (k * Math.PI) / 4;
        const plan = casualPlan(cx, cz, a, turn, us, heightAt);
        if (plan && (!best || plan.relief < best.relief)) {
          best = plan;
        }
      }
    }
  }
  if (!best) {
    return null;
  }
  const doc = newCourse(mapId, name);
  for (const g of best.gates) {
    addGate(doc, g.type, v3(g.x, g.base, g.z), qAxis(0, 1, 0, headingOf(g.tx, g.tz)));
  }
  return doc;
}

/* The pylon pair's cone axes are this far either side of its centre. */
const PAIR_HALF = ELEMENTS.pylonPair.dims.clearW / 2 + ELEMENTS.pylonPair.dims.baseRadius;

/* The gates round one oval, { type, x, base, z, tx, tz } each with the
 * height of its base and its level heading, or null when the ground will
 * not let every hoop hang between CASUAL.over and CASUAL.top over its own
 * ground. `relief` is the ground's rise under the whole path. */
function casualPlan(cx, cz, a, turn, us, heightAt) {
  const n = us.length;
  const b = ASPECT * a;
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  const at = (u) => {
    const ex = a * Math.cos(u);
    const ez = b * Math.sin(u);
    return { x: cx + ex * c - ez * sn, z: cz + ex * sn + ez * c };
  };
  /* The ground under the path, SUB samples from each gate to the next. */
  const SUB = 8;
  const ground = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n * SUB; i += 1) {
    const k = Math.floor(i / SUB);
    const u1 = k + 1 < n ? us[k + 1] : 2 * Math.PI;
    const p = at(us[k] + ((u1 - us[k]) * (i % SUB)) / SUB);
    const h = heightAt(p.x, p.z);
    if (!Number.isFinite(h)) {
      return null;
    }
    ground.push(h);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  /* The ground from `reach` samples back to `reach` on from gate i. */
  const around = (i, reach) => {
    const out = [];
    for (let j = -reach; j <= reach; j += 1) {
      out.push(ground[(i * SUB + j + n * SUB) % (n * SUB)]);
    }
    return out;
  };
  const hoopCentreY = openingsOf({ type: CASUAL.types[0], dims: ELEMENTS[CASUAL.types[0]].dims })[0].centreY;
  const gates = [];
  for (let i = 0; i < n; i += 1) {
    const u = us[i];
    const p = at(u);
    const own = ground[i * SUB];
    /* The tangent, d/du, counter clockwise seen from above (-y). */
    const dx = -a * Math.sin(u);
    const dz = b * Math.cos(u);
    const tx = dx * c - dz * sn;
    const tz = dx * sn + dz * c;
    const tl = Math.hypot(tx, tz);
    const t = { x: tx / tl, z: tz / tl };
    const type = CASUAL.types[i % CASUAL.types.length];
    if (type === 'pylonPair') {
      /* The ground across the line from cone to cone, on its lowest. */
      const across = [];
      for (let k = -4; k <= 4; k += 1) {
        across.push(heightAt(p.x - (t.z * k * PAIR_HALF) / 4, p.z + (t.x * k * PAIR_HALF) / 4));
      }
      const base = Math.min(...across);
      if (Math.max(...across) - base <= CASUAL.level && Math.max(...around(i, SUB / 2)) - own <= CASUAL.clear
        && Math.max(...around(i, SUB)) - own <= CASUAL.rise) {
        gates.push({
          type, x: p.x, base, z: p.z, tx: t.x, tz: t.z,
        });
        continue;
      }
    }
    /* A hoop: over the highest ground from half way back to half way on. */
    const y = Math.max(...around(i, SUB / 2)) + CASUAL.over;
    if (y - own > CASUAL.top) {
      return null;
    }
    gates.push({
      type: CASUAL.types[0], x: p.x, base: y - hoopCentreY, z: p.z, tx: t.x, tz: t.z,
    });
  }
  return { gates, relief: hi - lo };
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

/*
 * The axes the gizmo moves and turns a gate along, in the scene, all unit.
 * It turns about the gate's own axes, the ones turnGate names, pivoting on
 * its opening. It moves along the level ground and straight up whatever
 * the gate's tilt: along its line of travel laid flat, across that, and up,
 * so a dive gate dragged "ahead" stays at its height. A gate flown straight
 * up or down has no level travel, and its up laid flat stands in.
 */
export function gizmoAxes(el) {
  const { quat } = poseOf(el);
  const a = axesOf(quat);
  let t = unit(v3(a.travel.x, 0, a.travel.z));
  if (!t || Math.hypot(a.travel.x, a.travel.z) < 0.05) {
    t = unit(v3(a.up.x, 0, a.up.z)) ?? v3(0, 0, -1);
  }
  return {
    pivot: openingCentre(el, 0),
    move: { across: v3(-t.z, 0, t.x), up: v3(0, 1, 0), travel: t },
    turn: { yaw: a.up, pitch: a.across, roll: a.travel },
  };
}

/* ------------------------------------------------------------------ */
/* Overlap                                                             */
/* ------------------------------------------------------------------ */

/* The closest two points of segments p1 q1 and p2 q2 are this far apart
 * (Ericson, Real-Time Collision Detection, 5.1.9). */
function segmentGap(p1, q1, p2, q2) {
  const d1 = v3(q1.x - p1.x, q1.y - p1.y, q1.z - p1.z);
  const d2 = v3(q2.x - p2.x, q2.y - p2.y, q2.z - p2.z);
  const r = v3(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
  const a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z;
  const e = d2.x * d2.x + d2.y * d2.y + d2.z * d2.z;
  const f = d2.x * r.x + d2.y * r.y + d2.z * r.z;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    t = clamp(f / e);
  } else {
    const c = d1.x * r.x + d1.y * r.y + d1.z * r.z;
    if (e <= 1e-12) {
      s = clamp(-c / a);
    } else {
      const b = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z;
      const den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a);
      }
    }
  }
  return Math.hypot(r.x + d1.x * s - d2.x * t, r.y + d1.y * s - d2.y * t, r.z + d1.z * s - d2.z * t);
}

/*
 * Whether two pieces' solids interpenetrate: `a` and `b` are worldCaps
 * lists, capsules { ax..bz, r } in the scene. Two frames that merely touch
 * are not overlapping; a capsule inside another is.
 */
export function capsOverlap(a, b) {
  for (const p of a) {
    for (const q of b) {
      if (segmentGap({ x: p.ax, y: p.ay, z: p.az }, { x: p.bx, y: p.by, z: p.bz },
        { x: q.ax, y: q.ay, z: q.az }, { x: q.bx, y: q.by, z: q.bz }) < p.r + q.r - 1e-3) {
        return true;
      }
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Undo                                                                */
/* ------------------------------------------------------------------ */

/*
 * Undo and redo as whole documents. A built track is tens of gates, a few
 * kilobytes of JSON, so a copy per edit is cheaper to be sure of than an
 * inverse for every kind of edit. `record(before)` is called with the
 * document as it was before an edit and forgets anything redoable; undo
 * and redo take the document as it is now and hand back the one to go to,
 * or null when there is none. Snapshots are strings, so nothing held here
 * can be changed by the edits that follow.
 */
export function createHistory(limit = 200) {
  const back = [];
  const ahead = [];
  return {
    record(before) {
      back.push(before);
      if (back.length > limit) {
        back.shift();
      }
      ahead.length = 0;
    },
    undo(now) {
      if (!back.length) {
        return null;
      }
      ahead.push(now);
      return back.pop();
    },
    redo(now) {
      if (!ahead.length) {
        return null;
      }
      back.push(now);
      return ahead.pop();
    },
    clear() {
      back.length = 0;
      ahead.length = 0;
    },
    get depth() {
      return { undo: back.length, redo: ahead.length };
    },
  };
}

/*
 * The name a track is saved under, from what the pilot typed: blank is
 * `fallback`, and a name the tracks server would refuse (worker.js
 * inspectTrackName: its length rule and the word filter) is '', so the
 * dialog asks again instead of the upload failing later where nobody looks.
 */
export function trackNameFor(raw, fallback) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) {
    return fallback;
  }
  if (name.length > TRACK_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name) || badWordIn(name)) {
    return '';
  }
  return name;
}

/*
 * What the Save button says about the track being built, as a key under
 * build.save_ in the string tables. `stored` is the library's copy of it
 * or null, `server` whether a tracks server is configured (cloud.js), and
 * `online` its entry in storage.js readOnlineStates. An edit since the save
 * is unsaved whatever the server holds, because what the server holds is
 * the save and not the edit. With no server a save is the whole story.
 */
export function saveState(doc, stored, server, online) {
  if (!stored || stored.modifiedUtc !== doc.modifiedUtc) {
    return 'unsaved';
  }
  if (!server) {
    return 'saved';
  }
  const st = online ? online.state : '';
  if (st === 'online') {
    return 'online';
  }
  return st === 'failed' ? 'refused' : 'pending';
}
