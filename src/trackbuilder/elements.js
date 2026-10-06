/*
 * elements.js: what can stand on a track, how big it is by default, and the
 * few numbers that size the racing line.
 *
 * A track document stores the dimensions each element was placed with, so
 * the defaults here size NEW elements only and an old track keeps the sizes
 * it was built with. Even so, every number below is part of the format: a
 * placed element copies them into the document, the board's lap check reads
 * documents through this module, and the scoring square beside a flag is
 * computed here. tests/fixtures/trackbuilder pins all of it.
 *
 * Sizes are the MultiGP five foot gate family, built of schedule 40 PVC
 * (src/units.js holds the foot, the inch and the tube), plus the larger
 * pieces the fixed wings fly. A class is a property of the track, not of the
 * pilot: 'wing' hands a new element its wing sized block where it has one,
 * and everything else, including the retired 'micro', reads as 'full'.
 *
 * Labels and notes are looked up once, at import, under the elements.* keys
 * of src/strings.
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

import { FT, IN, FRAME_TUBE_OD } from '../units.js';
import { str } from '../strings/index.js';

/* Callers have always read the tube size from here as well as from units. */
export { FRAME_TUBE_OD };

export const TRACK_CLASSES = ['full', 'wing'];
export const TRACK_CLASS_DEFAULT = 'full';

/* The class a document is read at. Anything that is not a live class, a
 * missing field included, is the full sized field every older track is. */
export function trackClassOf(doc) {
  return doc?.trackClass === 'wing' ? 'wing' : TRACK_CLASS_DEFAULT;
}

/* 'micro' was flown only by the 65 mm whoop, which is gone. Such a document
 * must be refused (string track.no_aircraft) rather than read as a full
 * sized track, which would put a living room's gates on a sixty metre field. */
export function noAircraftFlies(doc) {
  return doc?.trackClass === 'micro';
}

/*
 * What each kind of element is to the course:
 *
 *   aperture   holes flown through; one sequence entry per hole per pass
 *   marker     passed on a side; the pass side scores as a square in the air
 *   obstacle   solid, never in the sequence
 *   start      where the lap starts and which way; one per track
 *   annotation text, not part of the course
 *   decal      paint on the ground: a footprint, no height, no collider
 */
export const KIND = {
  APERTURE: 'aperture',
  MARKER: 'marker',
  OBSTACLE: 'obstacle',
  START: 'start',
  ANNOTATION: 'annotation',
  DECAL: 'decal',
};

/* Default mast height of a header pennant above its board, and the radius
 * of the tube its sail sleeves onto. A flagged gate stores its own flagH. */
export const GATE_FLAG_H = 1.45;
export const GATE_FLAG_POLE_R = 0.012;

/* The clear opening of the wing sized gate, metres. */
export const WING_GATE = 5.0;

/*
 * The scoring square beside a marker grows OUTWARD only: its inner edge
 * stays on the pole, so a pass on the wrong side of a flag can never score,
 * while a line flown wide of the clearance still does. Width is the
 * clearance corridor plus a pad, with a floor.
 */
export const MARKER_GATE_PAD = 1.5;
export const MARKER_GATE_MIN_W = 3.0;
export const WING_MARKER_GATE_PAD = 5.0;
export const WING_MARKER_GATE_MIN_W = 10.0;

const FLAG_SIDES = ['left', 'right', 'both', 'top'];

/* Where a header's pennants stand, as fractions of the header's half width
 * from its centre: left is -1, right +1, top 0. */
const FLAG_POSTS = { left: [-1], right: [1], both: [-1, 1], top: [0] };

export function normalizeFlagSide(value, fallback = 'left') {
  return FLAG_SIDES.includes(value) ? value : fallback;
}

export function flagSideSigns(side) {
  return FLAG_SIDES.includes(side) ? [...FLAG_POSTS[side]] : [];
}

/* A pennant's cloth leans away from the header's middle. A centre mast has
 * no outside, so it hangs to the right. The mesh, the collider and both
 * previews read this, so they lean the same way. */
export function flagLeanSign(sign) {
  return sign < 0 ? -1 : 1;
}

/* The pennant position of a flagged gate, or null for anything that carries
 * no pennant. */
export function flagSideOf(el) {
  const def = ELEMENTS[el?.type];
  if (!def?.flagSide) {
    return null;
  }
  return normalizeFlagSide(el.flagSide, def.flagSide);
}

/* An opening with no frame of its own: a gap in a lattice of bars and poles
 * that still scores, lights and pins the line. Only apertures can be one,
 * and only by an explicit true. */
export function isUnbuilt(el) {
  return el?.unbuilt === true && ELEMENTS[el.type]?.kind === KIND.APERTURE;
}

/*
 * The square a marker scores through on its pass side. `outward` is how far
 * the square's centre stands beyond the racing line knot, along the pass
 * direction; the game and every drawer place it by that, so they agree.
 * Height is at least the width and at least the marker, so a tall flag is
 * not scored through a slot at knee height. The clearance is the pass's own,
 * or the marker's default when the pass names none.
 */
export function virtualApertureDims(el, seq, cls = TRACK_CLASS_DEFAULT) {
  const wing = cls === 'wing';
  const pad = wing ? WING_MARKER_GATE_PAD : MARKER_GATE_PAD;
  const floor = wing ? WING_MARKER_GATE_MIN_W : MARKER_GATE_MIN_W;
  const clearance = Math.max(0, seq?.clearance ?? el?.dims?.clearance ?? 0);
  const clearW = Math.max(floor, 2 * clearance + pad);
  const clearH = Math.max(clearW, el?.dims?.height ?? 0);
  return { clearW, clearH, sillH: 0, centerH: clearH / 2, outward: clearW / 2 - clearance };
}

/* An opening's sill to the next one's: one clear height and the one shared
 * cross tube. What the inspector offers when a stack is resized. */
export function levelPitchFor(clearH) {
  return clearH + FRAME_TUBE_OD;
}

/* An aperture's five numbers. Openings stack sill to sill one tube apart
 * unless a spacing is given. */
function openings(levels, sillH, clearW, clearH, levelPitch = levelPitchFor(clearH)) {
  return { levels, sillH, clearW, clearH, levelPitch };
}

/* A sky hoop is round, has no frame tube between levels, and floats. */
function hoop(size, sillH, tubeR) {
  return { levels: 1, sillH, clearW: size, clearH: size, levelPitch: size, tubeR };
}

const FIVE_FT = 5 * FT;
const STANDARD = openings(1, 0, FIVE_FT, FIVE_FT);
const WING_STANDARD = openings(1, 0, WING_GATE, WING_GATE);

/*
 * One row per element type, in palette order:
 *   [type, label key, hotkey, palette group, kind, extras, note key, sizes]
 * `extras` are the type's flags (pennant side, wing piece, round, ...) and
 * `sizes` holds the default tilt for apertures, `dims`, an optional
 * `wingDims` and an optional `defaultZ`. The rows become ELEMENTS below.
 */
const flagged = (dims, flagH) => ({ ...dims, flagH });
const ROWS = [
  ['gate', 'gate', 'G', 'track', KIND.APERTURE, {}, 'vertical_square_aperture_the_standard_element',
    { pitch: 0, dims: STANDARD, wingDims: WING_STANDARD }],
  ['flaggedGate', 'flagged_gate', 'A', 'track', KIND.APERTURE, { flagSide: 'left' }, 'standard_square_gate_with_a_pennant',
    { pitch: 0, dims: flagged(STANDARD, GATE_FLAG_H), wingDims: flagged(WING_STANDARD, 3) }],
  ['doubleStack', 'double_stack', '2', 'track', KIND.APERTURE, {}, 'two_standard_gates_stacked_each_hole',
    { pitch: 0, dims: openings(2, 0, FIVE_FT, FIVE_FT) }],
  ['flaggedDoubleStack', 'flagged_double', 'H', 'track', KIND.APERTURE, { flagSide: 'left' }, 'two_standard_gates_stacked_with_a',
    { pitch: 0, dims: flagged(openings(2, 0, FIVE_FT, FIVE_FT), GATE_FLAG_H) }],
  ['ladder', 'triple_stack', 'R', 'track', KIND.APERTURE, {}, 'three_standard_gates_stacked_each_hole',
    { pitch: 0, dims: openings(3, 0, FIVE_FT, FIVE_FT) }],
  ['tower', 'tower', 'T', 'track', KIND.APERTURE, {}, 'tall_structure_apertures_at_multiple_heights',
    { pitch: 0, dims: openings(2, FIVE_FT, FIVE_FT, FIVE_FT) }],
  ['diveGate', 'dive_gate', 'D', 'track', KIND.APERTURE, {}, 'aperture_plane_horizontal_or_angled_not',
    { pitch: Math.PI / 2, dims: openings(1, 15 * FT, 7 * FT, 6 * FT) }],
  ['barrier', 'barrier', 'B', 'track', KIND.OBSTACLE, {}, 'solid_obstacle_not_flown_through_collision',
    { dims: { width: 4, depth: 1, height: 2 } }],
  ['flag', 'flag', 'F', 'track', KIND.MARKER, {}, 'turn_marker_the_pass_side_is',
    { dims: { height: 2.5, poleRadius: 0.025, clearance: 1.5 }, wingDims: { height: 6, poleRadius: 0.05, clearance: 5 } }],
  ['cone', 'cone', 'C', 'track', KIND.MARKER, {}, 'ground_marker_the_pass_side_is',
    { dims: { height: 28 * IN, baseRadius: 7 * IN, clearance: 1.5 } }],
  ['waypoint', 'waypoint', 'W', 'track', KIND.MARKER, {}, 'nothing_is_standing_here_the_line',
    { dims: { height: 1.6, poleRadius: 0.02, clearance: 0 } }],
  ['pole', 'pole', 'U', 'track', KIND.MARKER, {}, 'a_bare_upright_pipe_flown_around',
    { dims: { height: 2.5, poleRadius: 0.025, clearance: 1.5 } }],
  ['horizontalPole', 'horizontal_pole', 'Z', 'track', KIND.OBSTACLE, {}, 'a_single_bar_across_the_track',
    { dims: { width: 3, depth: 0.08, height: 0.08 }, defaultZ: 1.6 }],
  ['wideGate3', 'wide_gate_3', null, 'track', KIND.APERTURE, { wing: true }, 'a_3_m_banner_gate_for',
    { pitch: 0, dims: openings(1, 0, 3, 3) }],
  ['wideGate5', 'wide_gate_5', null, 'track', KIND.APERTURE, { wing: true }, 'a_5_m_banner_gate_for',
    { pitch: 0, dims: openings(1, 0, 5, 5) }],
  ['pylonPair', 'pylon_pair', null, 'track', KIND.APERTURE, { wing: true }, 'two_inflatable_pylons_flown_between_the',
    { pitch: 0, dims: { ...openings(1, 0, 45, 25), baseRadius: 2.5, tipRadius: 0.375 } }],
  ['pylon', 'pylon', null, 'track', KIND.MARKER, { wing: true }, 'one_inflatable_pylon_turned_round_on',
    { dims: { height: 25, baseRadius: 2.5, tipRadius: 0.375, clearance: 15 } }],
  ['hoop175', 'hoop_175', null, 'track', KIND.APERTURE, { wing: true, round: true, plane: false }, 'a_small_firm_hoop_for_quads',
    { pitch: 0, dims: hoop(1.75, 0.05, 0.025) }],
  ['hoop250', 'hoop_250', null, 'track', KIND.APERTURE, { wing: true, round: true, plane: false }, 'a_small_firm_hoop_for_quads',
    { pitch: 0, dims: hoop(2.5, 0.06, 0.03) }],
  ['hoop6', 'hoop_6', null, 'track', KIND.APERTURE, { wing: true, round: true, plane: true }, 'a_big_soft_hoop_for_planes',
    { pitch: 0, dims: hoop(6, 0.5, 0.25) }],
  ['hoop12', 'hoop_12', null, 'track', KIND.APERTURE, { wing: true, round: true, plane: true }, 'a_big_soft_hoop_for_planes',
    { pitch: 0, dims: hoop(12, 0.9, 0.45) }],
  ['hoop20', 'hoop_20', null, 'track', KIND.APERTURE, { wing: true, round: true, plane: true }, 'a_big_soft_hoop_for_planes',
    { pitch: 0, dims: hoop(20, 1.4, 0.7) }],
  ['hoop30', 'hoop_30', null, 'track', KIND.APERTURE, { wing: true, round: true, plane: true }, 'a_big_soft_hoop_for_planes',
    { pitch: 0, dims: hoop(30, 2, 1) }],
  ['startPads', 'start_pads', 'S', 'extra', KIND.START, {}, 'lap_start_position_and_heading_exactly',
    { dims: { pads: 4, spacing: 1.5, padSize: 0.6 } }],
  ['label', 'label', 'L', 'extra', KIND.ANNOTATION, {}, 'text_annotation_on_the_field_not',
    { dims: { textHeight: 0.9 } }],
  ['groundLogo', 'ground_logo', 'O', 'extra', KIND.DECAL, { logoId: '' }, 'a_sponsor_logo_painted_on_the',
    { dims: { width: 10, depth: 4 } }],
];

/* Every element type by id, in palette order. Each entry is its own record
 * with its own dims, so no two types share an object a caller could edit. */
export const ELEMENTS = {};
for (const [id, label, key, group, kind, extras, note, sizes] of ROWS) {
  const { pitch, dims, wingDims, defaultZ } = sizes;
  const def = { id, label: str(`elements.${label}`), key, group, kind, ...extras, note: str(`elements.${note}`) };
  if (pitch !== undefined) {
    def.pitch = pitch;
  }
  def.dims = { ...dims };
  if (wingDims) {
    def.wingDims = { ...wingDims };
  }
  if (defaultZ !== undefined) {
    def.defaultZ = defaultZ;
  }
  ELEMENTS[id] = def;
}

/* A copy of the dims a new element of `type` gets on a track of `cls`, or
 * null for a type that does not exist. A class falls back to the full sized
 * block where the type has no block of its own. */
export function defaultDims(type, cls) {
  const def = ELEMENTS[type];
  if (!def) {
    return null;
  }
  return { ...((cls === 'wing' && def.wingDims) || def.dims) };
}

/* Starting height of a new element's base: the floor, except for the bar
 * that is only a bar when it is in the air. */
export function defaultZ(type, cls) {
  return ELEMENTS[type]?.defaultZ ?? 0;
}

/* Starting tilt of a new element's opening; the dive gate lies flat. */
export function defaultPitch(type, cls) {
  return ELEMENTS[type]?.pitch ?? 0;
}

/*
 * Lengths and counts that size the field and the racing line, full sized,
 * with the wing class's own lengths under `wing`. Ratios and counts have no
 * size, so the wing block does not repeat them.
 */
export const TUNING = {
  fieldWidth: 60,
  fieldDepth: 40,
  gridSize: 1,
  wing: { fieldWidth: 400, fieldDepth: 300, gridSize: 5, minCurveRadius: 20, boundarySlack: 5, barrierClearance: 1 },
  tangentScale: 1.1,
  minCurveRadius: 2.5,
  samplesPerSegment: 48,
  boundarySlack: 1,
  barrierClearance: 0.35,
  stackWrap: 2.6,
};

/* TUNING as a class reads it: the wing's lengths over the full set, or the
 * full set itself. */
export function tuningFor(cls) {
  return cls === 'wing' ? { ...TUNING, ...TUNING.wing } : TUNING;
}

/* The mast height a pennant actually has: the element's own when it is a
 * usable length, the default otherwise (documents from before flagH). */
export function gateFlagHeight(dims) {
  const h = dims?.flagH;
  return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : GATE_FLAG_H;
}

/* The openings of an aperture's dims, bottom first. centerH is the middle
 * of the opening above the element's base, which is where its scoring plane
 * and its knot sit. The count is rounded, and never below one. */
export function apertureLevels(dims) {
  const count = Math.max(1, Math.round(dims.levels));
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const sillH = dims.sillH + index * dims.levelPitch;
    out.push({ index, sillH, centerH: sillH + dims.clearH / 2, clearW: dims.clearW, clearH: dims.clearH });
  }
  return out;
}

/* How tall an element stands above its base: an aperture to the top of its
 * top frame and pennant, a marker or an obstacle to its height, start pads
 * to a slab, and anything else to its text height. */
export function elementHeight(def, dims) {
  if (def.kind === KIND.APERTURE) {
    const levels = apertureLevels(dims);
    const top = levels[levels.length - 1];
    const frame = top.sillH + top.clearH + FRAME_TUBE_OD;
    return def.flagSide ? frame + gateFlagHeight(dims) : frame;
  }
  if (def.kind === KIND.MARKER || def.kind === KIND.OBSTACLE) {
    return dims.height;
  }
  if (def.kind === KIND.START) {
    return dims.padSize * 0.4;
  }
  return dims.textHeight;
}
