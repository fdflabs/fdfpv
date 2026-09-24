/*
 * elements.js: the track builder's obstacle library, and the ONLY place a
 * dimension is written down.
 *
 * Every length in this file is metres. Feet appear in FT and in the comments
 * that quote the source, and nowhere else, per CLAUDE.md.
 *
 * PROVENANCE WARNING, READ BEFORE TRUSTING A NUMBER. The figures below are
 * approximations of the MultiGP obstacle standards, transcribed from memory
 * of the published page rather than read off it in this session. Every one
 * of them carries a VERIFY comment naming what has to be checked against
 * https://www.multigp.com/multigp-drone-race-course-obstacles/ before this
 * library is treated as authoritative. They are close enough to author a
 * course against and they are not a citation.
 *
 * This module is pure data and pure functions. It imports nothing, it knows
 * nothing about the DOM, the canvas, Three.js or the flight simulator, and
 * nothing outside it is allowed to write a dimension down.
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

/* FT and IN come from src/units.js, shared with src/game/track.js. The
 * builder must not import the game, so the constants they both need live in
 * a leaf module rather than being typed out twice. */
import { FT, IN, FRAME_TUBE_OD } from '../units.js';
import { str } from '../strings/index.js';
import {
  GATE_OPENING_DEFAULT, GATE_OPENING_MAX, GATE_SPACING_NOMINAL,
  ELEVATED_SILL_MIN, PIPE_OD, POLE_FROM_GATE_MIN, ROOM_WIDTH, ROOM_DEPTH, GRID as MICRO_GRID,
} from './racegow.js';

/* Re-exported because this module's consumers already read it from here. */
export { FRAME_TUBE_OD };

/*
 * THE THREE TRACK CLASSES.
 *
 * 'full' is the sixty metre field this builder has always drawn, flown on a
 * 5 inch quad through MultiGP sized gates. 'micro' is a RaceGOW room: a
 * course inside 1.42 by 2.13 m, built out of 3/4 inch PVC, flown on a 65 mm
 * whoop, in somebody's living room. 'wing' is an airfield: five metre gates
 * and pylons over four hundred by three hundred metres, flown on a 1000 mm
 * flying wing that cruises at 15 to 25 m/s and turns in about twenty
 * metres (docs/WING-STAGE1.md).
 *
 * IT IS A PROPERTY OF THE TRACK, not of the pilot and not of the session.
 * Each class is a different object from the others: different element
 * sizes, a different field, a different grid, different warnings, and a lap
 * that is three seconds, thirty, or a minute. So it is stored in the
 * document, defaulted to 'full' on read so that every track ever written
 * stays exactly what it was, and the builder picks the class for a NEW
 * track from the aircraft the pilot has seated.
 *
 * The class chooses which dims block each element definition below hands to
 * a newly placed instance, and nothing else in this file branches on it.
 * That is deliberate: a micro gate is a gate, and so is a wing gate.
 */
export const TRACK_CLASSES = ['full', 'micro', 'wing'];
export const TRACK_CLASS_DEFAULT = 'full';

export function trackClassOf(doc) {
  return TRACK_CLASSES.includes(doc?.trackClass) ? doc.trackClass : TRACK_CLASS_DEFAULT;
}

/*
 * The dims a newly placed element of `type` gets on a track of `cls`.
 *
 * `dims` is the full sized block. A class with its own sizes names a second
 * block on the element, and falls back to the full sized one for any
 * element that has no variant, which is the right answer for the two that
 * genuinely have none: a label is text and a ground logo is paint, and
 * neither has a size that depends on how big the aircraft is.
 */
const CLASS_DIMS = { micro: 'microDims', wing: 'wingDims' };

export function defaultDims(type, cls) {
  const def = ELEMENTS[type];
  if (!def) {
    return null;
  }
  return { ...(def[CLASS_DIMS[cls]] ?? def.dims) };
}

/*
 * How high off the floor a newly placed element of `type` starts on a track
 * of `cls`. Zero for everything except the horizontal pole, which is a bar
 * in the air by definition and would be a wall on the floor.
 */
export function defaultZ(type, cls) {
  const def = ELEMENTS[type];
  if (!def) {
    return 0;
  }
  if (cls === 'micro' && def.microDefaultZ !== undefined) {
    return def.microDefaultZ;
  }
  return def.defaultZ ?? 0;
}

/* Same, for the default aperture tilt, which the dive gate changes. */
export function defaultPitch(type, cls) {
  const def = ELEMENTS[type];
  if (!def) {
    return 0;
  }
  if (cls === 'micro' && def.microPitch !== undefined) {
    return def.microPitch;
  }
  return def.pitch ?? 0;
}

/*
 * What an element IS, which decides everything the tool does with it.
 *
 *   aperture   has one or more holes to fly through, so it can appear in the
 *              sequence, once per hole, each with its own entry face.
 *   marker     is passed on one side at a clearance radius. The pass side
 *              is a virtual gate: a square beside the pole that the quad
 *              has to fly through, the same way it flies a real opening.
 *   obstacle   is solid. It never appears in the sequence, and the path
 *              warning pass tests the racing line against it.
 *   start      the lap's start position and heading. Exactly one per track.
 *   annotation text on the field. Not part of the course in any way.
 *   decal      is PAINTED ON THE GROUND. It has a footprint and a heading
 *              and nothing else: no height, no collider, never in the
 *              sequence, and the path warning pass ignores it because a quad
 *              cannot hit paint. A sponsor's logo on the grass is the only
 *              one of these today.
 */
export const KIND = {
  APERTURE: 'aperture',
  MARKER: 'marker',
  OBSTACLE: 'obstacle',
  START: 'start',
  ANNOTATION: 'annotation',
  DECAL: 'decal',
};

/*
 * Frame tube diameter. MultiGP does not publish it. Their gates are built
 * from schedule 40 PVC and 1 inch nominal schedule 40 PVC has an outside
 * diameter of 1.315 in, which is what is used here. It sets how thick a gate
 * is drawn and how far apart the openings in a ladder sit; it does not change
 * any clear opening.
 *
 * VERIFY: whether MultiGP specifies a tube size anywhere. Treated as an
 * assumption until then.
 */

/*
 * Header pennant on a flagged gate. The mast stands on the header board, it
 * does not spike the ground, and this is the DEFAULT length: a flagged gate
 * carries `flagH` in its own dims so an author can set it. Pole radius is
 * the tube a teardrop sail sleeves onto, not the gate's own PVC.
 */
export const GATE_FLAG_H = 1.45;
export const GATE_FLAG_POLE_R = 0.012;

/* The wing gate's clear opening, metres, one number for the three elements
 * and the preset that carry it. See the gate entry for why five. */
export const WING_GATE = 5.0;

/*
 * WHERE ON THE HEADER THE MAST STANDS.
 *
 * The owner's report: "a flagged gate should allow me to set the flag gate
 * on top of the actual gate, currently the flag is just ornamental". The
 * three old choices were all at the header's ENDS, so the flag was a corner
 * decoration with no way to put it over the gate at all, and `top` is the
 * missing placement: one mast on the centre of the header board, standing
 * directly over the opening.
 *
 * It is not decoration in the physical sense either, and it is worth saying
 * because the report reads as though it might be: the mast and its whip are
 * both colliders on the race field, so a pennant over the gate is something
 * a pilot can hit while diving onto the top rail. Putting it on top is a
 * course design decision with a consequence, which is what makes it worth
 * offering.
 */
export const FLAG_SIDES = ['left', 'right', 'both', 'top'];

export function normalizeFlagSide(value, fallback = 'left') {
  if (value === 'left' || value === 'right' || value === 'both' || value === 'top') {
    return value;
  }
  return fallback;
}

/*
 * Which header positions carry a pennant, as a fraction of the header's own
 * half width. Left is local -X when facing the gate, right is +X, and TOP is
 * ZERO: dead centre, over the opening. Reading these as a fraction rather
 * than as a bare sign is what lets 0 mean the middle instead of meaning
 * nothing; every drawer multiplies by the half width, so the arithmetic did
 * not have to change to gain a third place to stand.
 */
export function flagSideSigns(side) {
  if (side === 'right') {
    return [1];
  }
  if (side === 'both') {
    return [-1, 1];
  }
  if (side === 'left') {
    return [-1];
  }
  if (side === 'top') {
    return [0];
  }
  return [];
}

/*
 * Which way a pennant's sail and whip LEAN, given where its mast stands.
 * Outboard from the header on an end mast, and a centre one has no outboard
 * so it takes the right, which is where a single flag hangs by convention.
 * One function because the mesh, the collider and both previews all have to
 * agree: a mast whose cloth hangs one way and whose collider leans the other
 * is the class of bug that only shows up as an invisible wall.
 */
export function flagLeanSign(sign) {
  return sign < 0 ? -1 : 1;
}

export function flagSideOf(el) {
  const def = ELEMENTS[el?.type];
  if (!def?.flagSide) {
    return null;
  }
  return normalizeFlagSide(el.flagSide, def.flagSide);
}

/*
 * AN OPENING THAT IS A GAP IN THE LATTICE RATHER THAN A GATE OF ITS OWN.
 *
 * Every aperture here builds its own four sided frame, which is what a
 * MultiGP gate is and what RaceGOW's rule 2 asks for: "All gates must be
 * fully enclosed." The official RaceGOW5 tracks are not built that way
 * throughout. A bar on two legs with one leg carried up as a pole makes two
 * scored openings, one under the bar and one over it, and the one over it
 * has a bar below and a pole beside and NOTHING ELSE. Drawing a frame there
 * puts two lengths of PVC in mid air that the real track does not have, one
 * of them straight through the flight path, and it boxes in a pole that is
 * meant to be flown around.
 *
 * So an aperture can say that nothing is built for it: the pipe that bounds
 * the opening belongs to the structures around it, and this element is the
 * hole. It still scores, still lights, still carries its number and still
 * pins the racing line. It just has no pipe of its own.
 *
 * Every renderer reads this ONE function, so the game, the exporter, the
 * builder's preview and the course card cannot disagree about which
 * openings have a frame.
 */
export function isUnbuilt(el) {
  if (!el || el.unbuilt !== true) {
    return false;
  }
  return ELEMENTS[el.type]?.kind === KIND.APERTURE;
}

/*
 * How much wider than the clearance corridor a marker's scoring square is,
 * metres, and the narrowest one that may ever be built.
 *
 * THE PAD IS ADDED ENTIRELY ON THE OUTER SIDE. The square's inner edge is
 * on the pole and it has to stay there: an inner edge past the pole would
 * score a pass flown on the wrong side of the flag, which is the one thing
 * a turn marker exists to prevent. So the width grows away from the
 * obstacle, and virtualApertureDims reports how far the square's centre
 * therefore sits beyond the racing-line knot.
 *
 * The owner's words: "extend the virtual gate width of a flag, so the user
 * doesn't have to fly so close to the flag". A 1.5 m clearance used to
 * yield a 3.0 m square whose far edge was 3.0 m off the pole; it now
 * yields 4.5 m and 4.5 m, so the same line flown a metre and a half wide of
 * the flag still scores. Nothing about which SIDE is passed has moved.
 */
export const MARKER_GATE_PAD = 1.5;
export const MARKER_GATE_MIN_W = 3.0;

/*
 * The same two on a micro track, and this is the single largest scale error
 * a RaceGOW course would have had: a 3 m minimum scoring square, in a room
 * that is 5 m across, around a pole 27 mm thick.
 *
 * Sized against RaceGOW's own pole rule rather than by dividing the full
 * sized numbers by something. The diagrams dimension a pole at 14 in from
 * the centre of a gate, which is the distance the course is designed around,
 * so the pad is that 14 in and the floor is twice it. That is the same
 * relationship the full sized pair has to a flag's 1.5 m clearance, arrived
 * at from the other end.
 *
 * They are separate constants rather than a ratio applied to whatever
 * clearance an element declares, deliberately: deriving them would change
 * the square on every full sized track whose author edited a clearance, and
 * some of those tracks are published with times on them.
 */
export const MICRO_MARKER_GATE_PAD = POLE_FROM_GATE_MIN;
export const MICRO_MARKER_GATE_MIN_W = POLE_FROM_GATE_MIN * 2;

/*
 * And on a wing track, where the marker is a pylon the wing rounds at
 * cruise. The pylon's clearance is 5 m, the same relationship to the
 * aircraft the flag's 1.5 m has to a five inch (about three spans off the
 * pole), so the pad is that clearance and the floor is twice it, the way
 * the micro pair is built from RaceGOW's 14 inch rule. A 15 m square
 * beside a pylon is what a 1000 mm wing at 20 m/s can be asked to hit.
 */
export const WING_MARKER_GATE_PAD = 5.0;
export const WING_MARKER_GATE_MIN_W = 10.0;

const MARKER_GATE = {
  full: { pad: MARKER_GATE_PAD, minW: MARKER_GATE_MIN_W },
  micro: { pad: MICRO_MARKER_GATE_PAD, minW: MICRO_MARKER_GATE_MIN_W },
  wing: { pad: WING_MARKER_GATE_PAD, minW: WING_MARKER_GATE_MIN_W },
};

/*
 * The scoring square a flag or a cone assigns on its pass side.
 *
 * Width is the clearance corridor plus the class's pad, never less than its
 * floor, with the inner edge still on the pole. Height is at least that
 * wide, and at least as tall as the marker, so a 2.5 m flag is not scored
 * by a waist-high slot. Waypoints keep a clearance of zero and do not get
 * one of these: they pin the line, they are not a hole.
 *
 * `outward` is how far the square's CENTRE sits beyond the racing line
 * knot, along the pass direction, which is what keeps the inner edge on the
 * pole while the width grows. Every drawer and the game read it, so the
 * plan, the preview and the race field cannot disagree about where the
 * square is.
 */
export function virtualApertureDims(el, seq, cls = TRACK_CLASS_DEFAULT) {
  const clearance = Math.max(0, seq?.clearance ?? el?.dims?.clearance ?? 0);
  const { pad, minW } = MARKER_GATE[cls] ?? MARKER_GATE[TRACK_CLASS_DEFAULT];
  const clearW = Math.max(minW, clearance * 2 + pad);
  const poleH = Math.max(0, el?.dims?.height ?? 0);
  const clearH = Math.max(clearW, poleH);
  return {
    clearW,
    clearH,
    sillH: 0,
    centerH: clearH * 0.5,
    outward: clearW * 0.5 - clearance,
  };
}

/*
 * Every element type, in palette order, with its hotkey and its default
 * dimensions.
 *
 * An aperture element is described by five numbers and the tool derives its
 * holes from them:
 *
 *   levels      how many openings the structure has
 *   sillH       height of the BOTTOM of the lowest opening above the ground
 *   clearW      clear opening width, the dimension a pilot flies through
 *   clearH      clear opening height
 *   levelPitch  vertical distance from one opening's bottom to the next
 *
 * All five are per instance editable in the inspector. The values here are
 * only the defaults handed to a newly placed element, which is why an old
 * saved track keeps the sizes it was authored with when a default in this
 * file changes.
 *
 * `pitch` is not a dimension and so it is not in `dims`. It is the default
 * TILT of the aperture plane in radians, the angle the normal is raised
 * above the horizontal, and it lives on the element itself next to yaw.
 */
export const ELEMENTS = {
  gate: {
    id: 'gate',
    label: str('elements.gate'),
    key: 'G',
    group: 'track',
    kind: KIND.APERTURE,
    note: str('elements.vertical_square_aperture_the_standard_element'),
    /* "5x5 Gate: opening 5 feet by 5 feet." The chapter standard gate.
     * VERIFY: the 5 ft by 5 ft clear opening on multigp.com. */
    pitch: 0,
    dims: { levels: 1, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
    /* RaceGOW Single Gate, or the Start/Finish Gate, which is the same
     * object drawn green. The bar is ON THE FLOOR because rule 2 says a gate
     * must be fully enclosed and the floor cannot act as a side of it, which
     * puts the centre at 356 mm, well under the 508 mm rule 4 allows. */
    microDims: {
      levels: 1, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
    /* A wing gate is the tool's own size: no series publishes one. Five
     * metres is five spans of the 1000 mm wing, which is the same margin a
     * 5 ft gate gives a five inch's 0.35 m sweep, and it is a hole a wing
     * at cruise can be aimed through rather than threaded. */
    wingDims: { levels: 1, sillH: 0, clearW: WING_GATE, clearH: WING_GATE, levelPitch: WING_GATE + FRAME_TUBE_OD },
  },
  flaggedGate: {
    id: 'flaggedGate',
    label: str('elements.flagged_gate'),
    key: 'A',
    group: 'track',
    kind: KIND.APERTURE,
    /* Which end of the header the pennant sits on, as seen facing the gate.
     * Not a dimension: it is an element field like a label's text. The
     * inspector offers left, right or both; this is the default a newly
     * placed one gets. */
    flagSide: 'left',
    note: str('elements.standard_square_gate_with_a_pennant'),
    /* Same 5 ft opening as `gate`. The pennant is dress on the header, not
     * a second sequence marker: the hole is still one gate.
     * VERIFY: nothing on multigp.com dimensions a header flag. 1.45 m of
     * mast above the board is the tool's own length, written once as
     * GATE_FLAG_H and offered here as an editable default. */
    pitch: 0,
    dims: {
      levels: 1, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD,
      flagH: GATE_FLAG_H,
    },
    /* A pennant on a whoop gate is a real thing people build, and the mast
     * is a third of the full sized one because everything else is. */
    microDims: {
      levels: 1, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
      flagH: 0.42,
    },
    /* Same five metre hole as `gate`; the mast is three metres so the
     * pennant reads over a gate that size. */
    wingDims: {
      levels: 1, sillH: 0, clearW: WING_GATE, clearH: WING_GATE, levelPitch: WING_GATE + FRAME_TUBE_OD,
      flagH: 3.0,
    },
  },
  doubleStack: {
    id: 'doubleStack',
    label: str('elements.double_stack'),
    key: '2',
    group: 'track',
    kind: KIND.APERTURE,
    note: str('elements.two_standard_gates_stacked_each_hole'),
    /* "5x5 Double Gate Tower: two standard gates stacked vertically", sat
     * on the ground rather than elevated. The elevated version is `tower`.
     * VERIFY: whether the published double gate tower sits on the ground. */
    pitch: 0,
    dims: { levels: 2, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
    /* RaceGOW Double Stacked Gates. At the nominal 762 mm pitch the second
     * opening's centre lands at 1118 mm, which clears rule 5's 1067 mm
     * floor, and the 762 itself is inside rule 3's 686 to 838 band. Both
     * rules are satisfied by one number, which is why 30 inches is the
     * number every diagram uses. */
    microDims: {
      levels: 2, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
  },
  flaggedDoubleStack: {
    id: 'flaggedDoubleStack',
    label: str('elements.flagged_double'),
    key: 'H',
    group: 'track',
    kind: KIND.APERTURE,
    /* Same header pennant as `flaggedGate`, stood on the top board of a
     * two hole stack. The flags are dress: the holes are still two gates. */
    flagSide: 'left',
    note: str('elements.two_standard_gates_stacked_with_a'),
    pitch: 0,
    dims: {
      levels: 2, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD,
      flagH: GATE_FLAG_H,
    },
    microDims: {
      levels: 2, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
      flagH: 0.42,
    },
  },
  ladder: {
    id: 'ladder',
    label: str('elements.triple_stack'),
    key: 'R',
    group: 'track',
    kind: KIND.APERTURE,
    note: str('elements.three_standard_gates_stacked_each_hole'),
    /* "5x5 Ladder: three standard gates stacked vertically." The openings
     * share a frame tube, so each sill sits one opening plus one tube above
     * the one below it.
     * VERIFY: the stack count, and whether the shared tube is the real
     * vertical spacing or whether MultiGP dimensions the overall height. */
    pitch: 0,
    dims: { levels: 3, sillH: 0, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
    /* RaceGOW Triple Gate Stack. Third opening's centre at 1880 mm, over
     * rule 5's 1753 mm floor, and the top of the frame at 2235 mm, which is
     * under a 2.4 m domestic ceiling with 165 mm to spare. That margin is
     * why a triple is the tallest thing on a RaceGOW track. */
    microDims: {
      levels: 3, sillH: 0,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
  },
  tower: {
    id: 'tower',
    label: str('elements.tower'),
    key: 'T',
    group: 'track',
    kind: KIND.APERTURE,
    note: str('elements.tall_structure_apertures_at_multiple_heights'),
    /* "5x5 Tower: opening 5 feet by 5 feet, elevation 5 feet off the
     * ground", and "5x5 Double Gate Tower: two standard gates stacked
     * vertically". The default here is the double gate tower standing on a
     * 5 ft elevation, which is the version worth two sequence entries.
     * VERIFY: the 5 ft elevation, and whether the double gate tower is
     * itself elevated or sits on the ground. */
    pitch: 0,
    dims: { levels: 2, sillH: 5 * FT, clearW: 5 * FT, clearH: 5 * FT, levelPitch: 5 * FT + FRAME_TUBE_OD },
    /* RaceGOW Elevated Gate: ONE opening, carried above the ground gates,
     * "bottom of gate must be a minimum 56 inches above the ground". One
     * rather than two because that is what the Track8 diagram draws and
     * because a second opening at 56 plus 30 inches would put its top at
     * 2.53 m, through the ceiling. */
    microDims: {
      levels: 1, sillH: ELEVATED_SILL_MIN,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
  },
  diveGate: {
    id: 'diveGate',
    label: str('elements.dive_gate'),
    key: 'D',
    group: 'track',
    kind: KIND.APERTURE,
    note: str('elements.aperture_plane_horizontal_or_angled_not'),
    /* "7x6 Dive Gate: elevation 15 ft. Slight angle for entry facilitation."
     * The angle is described but never dimensioned, so the default here is a
     * fully horizontal aperture, which is the honest reading of "flown
     * through vertically", and the inspector exposes the tilt so an angled
     * dive gate is one drag away.
     * VERIFY: the 15 ft elevation, the 7 ft by 6 ft opening, and whether
     * MultiGP anywhere states the entry angle. */
    pitch: Math.PI / 2,
    dims: { levels: 1, sillH: 15 * FT, clearW: 7 * FT, clearH: 6 * FT, levelPitch: 6 * FT + FRAME_TUBE_OD },
    /* RaceGOW Horizontal Gate, also called a Cube Gate: the same square
     * opening laid flat. 15 ft of elevation is a five inch's dive gate; a
     * whoop's is at 900 mm, which is chest height and is where the official
     * builds put one, because the ceiling is 2.4 m and you have to get above
     * it to drop through it. */
    microDims: {
      levels: 1, sillH: 0.900,
      clearW: GATE_OPENING_DEFAULT, clearH: GATE_OPENING_DEFAULT,
      levelPitch: GATE_SPACING_NOMINAL,
    },
  },
  barrier: {
    id: 'barrier',
    label: str('elements.barrier'),
    key: 'B',
    group: 'track',
    kind: KIND.OBSTACLE,
    note: str('elements.solid_obstacle_not_flown_through_collision'),
    /* Not a MultiGP obstacle. A barrier is the tool's way of saying "the
     * racing line must not go here": a shipping container, a fence, a stand.
     * The default is a 4 m by 1 m panel 2 m tall, which is a plausible crowd
     * barrier and is only a starting size. */
    dims: { width: 4, depth: 1, height: 2 },
    /* A living room's furniture. A sofa is about this, and a sofa is the
     * commonest obstacle on a RaceGOW track by a wide margin. */
    microDims: { width: 1.8, depth: 0.85, height: 0.75 },
  },
  flag: {
    id: 'flag',
    label: str('elements.flag'),
    key: 'F',
    group: 'track',
    kind: KIND.MARKER,
    note: str('elements.turn_marker_the_pass_side_is'),
    /* "Split-S Gate: flag placement 1.5 ft behind and to the side of the
     * gate" is the only flag dimension MultiGP publishes, and it is an
     * offset rather than a flag. A turn flag on a course is a pole with a
     * banner; 2.5 m of pole is the common build. The clearance radius is the
     * tool's own number: how far off the pole the racing line is drawn.
     * VERIFY: whether MultiGP dimensions a standalone turn flag at all. */
    dims: { height: 2.5, poleRadius: 0.025, clearance: 1.5 },
    /* A pennant on a whoop track is dress, and the mast is a length of the
     * same 3/4 inch pipe everything else is built from. The clearance is
     * RaceGOW's own 14 inch pole rule, which is the distance the diagrams
     * dimension from a gate centre to a pole. */
    microDims: { height: 0.90, poleRadius: PIPE_OD / 2, clearance: POLE_FROM_GATE_MIN },
    /* A pylon on an airfield: a six metre pole a wing can see from the far
     * end of a 400 m field, rounded five metres off, which is about three
     * spans, the same relationship the flag's 1.5 m has to a five inch.
     * WING_MARKER_GATE_PAD is built on this clearance. */
    wingDims: { height: 6.0, poleRadius: 0.05, clearance: 5.0 },
  },
  cone: {
    id: 'cone',
    label: str('elements.cone'),
    key: 'C',
    group: 'track',
    kind: KIND.MARKER,
    note: str('elements.ground_marker_the_pass_side_is'),
    /* A standard traffic cone: 28 in tall on a 14 in square base. Not a
     * MultiGP dimension, a highway one, and near enough for a ground marker.
     * VERIFY: nothing on multigp.com, this is a road cone.
     *
     * THE CLEARANCE IS THE FLAG'S, 1.5 m, and it used to be 1.0. The owner
     * asked for cones to "function the same as a flag, a larger gate around
     * the cone to trigger a pass", and the machinery was already identical:
     * a cone is a MARKER, it takes a knot at the clearance radius and it
     * scores through the same virtual square. What was not the same was
     * this number, so a cone gave a 2.0 m hole where a flag gave 3.0 and
     * the two markers a course mixes flew differently for no reason an
     * author could see. The cone is SHORTER than a flag and that is fine:
     * virtualApertureDims floors the height at the square's own width, so
     * a 0.71 m cone is not scored by a knee-high slot. */
    dims: { height: 28 * IN, baseRadius: 7 * IN, clearance: 1.5 },
    /* A whoop sized marker cone, the kind sold for indoor courses: 100 mm
     * tall on a 60 mm base. Same clearance as the flag, for the same reason
     * the full sized pair share one. */
    microDims: { height: 0.100, baseRadius: 0.030, clearance: POLE_FROM_GATE_MIN },
  },
  waypoint: {
    id: 'waypoint',
    label: str('elements.waypoint'),
    key: 'W',
    group: 'track',
    kind: KIND.MARKER,
    note: str('elements.nothing_is_standing_here_the_line'),
    /*
     * NOT AN OBSTACLE, AND THAT IS THE WHOLE POINT.
     *
     * A waypoint says "the lap goes through here" and nothing else. It exists
     * because imported courses need it: Velocidrone lets an author drop an
     * invisible trigger box in open air to pin the racing line where there is
     * no gate to fly through, and 55 of the stops across the tracks under
     * tracks/ are exactly that. Before this existed the import had to call
     * each one either a gate, which puts PVC on the field that is not on the
     * real course, or a flag, which is worse, because a flag is passed at a
     * clearance radius and so the line is pushed 1.5 m off the one point the
     * author was trying to pin it to.
     *
     * It is a MARKER because path.js already does the right thing with one:
     * the knot lands at marker plus clearance times the pass side, so a
     * clearance of ZERO puts the knot exactly on the point and takes its
     * tangent from the run of the course. A marker also cannot raise a
     * reversal warning, which is correct: a waypoint has no face to reverse.
     *
     * height is how tall it is DRAWN in the builder, so an author can see one
     * and grab it. Nothing is built for it on the race field.
     */
    dims: { height: 1.6, poleRadius: 0.02, clearance: 0 },
    /* Clearance stays ZERO. It is zero because a waypoint pins the line to a
     * point, and a point does not get smaller. */
    microDims: { height: 0.35, poleRadius: 0.008, clearance: 0 },
  },
  /*
   * SIDE BY SIDE GATES ARE NOT AN ELEMENT HERE, and it is worth writing down
   * why, because RaceGOW's diagrams draw them as one.
   *
   * They would need a lateral offset inside an aperture structure, and every
   * opening this builder has ever had is offset VERTICALLY: apertureLevels,
   * apertureCenter, entryAnchor, the 2D plan, the 3D frames and the sequence
   * editor all read a level's sill and centre height and nothing else. A
   * horizontal sibling means a new axis through all six.
   *
   * What a side by side actually IS, physically, is two gates 30 inches
   * apart that happen to share a vertical pipe. So it is two gates, and the
   * thing that makes it a RaceGOW side by side rather than two gates near
   * each other is rule 3, the 27 to 33 inch centre to centre band. That rule
   * is checked, on every pair of gates on a micro track, by
   * src/trackbuilder/warnings.js. The tool holds the rule; the author places
   * the second gate.
   *
   * If a compound placement is wanted later, app.js's place path is where it
   * goes, beside the auto sequencing it already does for a stack.
   */

  /*
   * VERTICAL POLE. RaceGOW's own element, a bare length of pipe stood on
   * end and flown around, drawn as a red dot in plan on every diagram.
   *
   * It is a MARKER, which is the builder's word for "passed on one side at a
   * clearance radius, and the pass side is a virtual gate". That is exactly
   * what a pole is, and it means the existing scoring, the existing racing
   * line and the existing warnings all work on one without a line of new
   * code. It is not `flag` because a flag has a pennant and a pole has not,
   * and the diagrams distinguish them.
   */
  pole: {
    id: 'pole',
    label: str('elements.pole'),
    /* U for upright, not P. P has been the racing line toggle since before
     * this element existed and the key handler answers it first, so a pole
     * on P was a hotkey the palette advertised and the keyboard never
     * delivered: pressing it hid the line. */
    key: 'U',
    group: 'track',
    kind: KIND.MARKER,
    note: str('elements.a_bare_upright_pipe_flown_around'),
    dims: { height: 2.5, poleRadius: 0.025, clearance: 1.5 },
    microDims: { height: 1.500, poleRadius: PIPE_OD / 2, clearance: POLE_FROM_GATE_MIN },
  },
  /*
   * HORIZONTAL POLE. The other RaceGOW element with no existing equivalent:
   * a single bar across the course, on two legs, flown over or under.
   *
   * An OBSTACLE rather than a marker or an aperture, and the choice is the
   * honest one: it is solid, the racing line must not go through it, and
   * nothing about it says which side of it the lap goes. The Track6 diagram
   * labels one "off upper grid", which is a track designer telling pilots to
   * go under, and that is a matter for the flying order rather than for the
   * element.
   */
  horizontalPole: {
    id: 'horizontalPole',
    label: str('elements.horizontal_pole'),
    key: 'Z',
    group: 'track',
    kind: KIND.OBSTACLE,
    note: str('elements.a_single_bar_across_the_track'),
    dims: { width: 3.0, depth: 0.08, height: 0.08 },
    defaultZ: 1.60,
    /* One pipe section wide and one pipe thick, raised to where a RaceGOW
     * build puts one: a shade under the second gate of a stack, so the two
     * together make a slot. defaultZ is how high a NEWLY PLACED one starts;
     * an obstacle is drawn from its own position.z upward, so this is a bar
     * in the air rather than a wall, which is what a horizontal pole is. */
    microDims: { width: GATE_SPACING_NOMINAL, depth: PIPE_OD, height: PIPE_OD },
    microDefaultZ: 0.950,
  },
  startPads: {
    id: 'startPads',
    label: str('elements.start_pads'),
    key: 'S',
    group: 'extra',
    kind: KIND.START,
    note: str('elements.lap_start_position_and_heading_exactly'),
    /* A row of launch stands on the start line. MultiGP runs heats of four,
     * so four stands at 1.5 m spacing is the default grid. padSize is the
     * cell the stand sits in; the mesh is a two-rail wooden start block,
     * not a floor tile. See src/art/startblock.js.
     * VERIFY: MultiGP's published starting grid spacing, if any. */
    dims: { pads: 4, spacing: 1.5, padSize: 0.6 },
    /*
     * ONE PAD, and that is not a scaled down grid, it is the format.
     *
     * MultiGP runs heats of four and the full sized default is that starting
     * grid. RaceGOW has no heats at all: "every pilot flies alone at home",
     * and the whole competition is an asynchronous time trial. Four stands
     * on a RaceGOW start line would be four stands nobody is standing on.
     */
    microDims: { pads: 1, spacing: 0.30, padSize: 0.10 },
  },
  label: {
    id: 'label',
    label: str('elements.label'),
    key: 'L',
    group: 'extra',
    kind: KIND.ANNOTATION,
    note: str('elements.text_annotation_on_the_field_not'),
    /* Text height is a drawing size, not a course size, but it is a length
     * in metres on the field and so it lives here with the rest. */
    dims: { textHeight: 0.9 },
  },
  groundLogo: {
    id: 'groundLogo',
    label: str('elements.ground_logo'),
    key: 'O',
    group: 'extra',
    kind: KIND.DECAL,
    /* Which of the course's logos this one wears, as the id of an entry in
     * branding.logos. An element field like a label's text, not a
     * dimension. Empty means the first logo the course carries, so a decal
     * dropped on a course with one sponsor needs no further decision. */
    logoId: '',
    note: str('elements.a_sponsor_logo_painted_on_the'),
    /*
     * The footprint the logo is fitted inside, width along the element's own
     * heading and depth across it, the same way a barrier reads. Ten by four
     * is a wide sponsor board's proportions laid flat, which is the shape
     * most logos arrive in; the inspector resizes it and a square logo
     * fitted inside it simply paints square and smaller.
     */
    dims: { width: 10, depth: 4 },
  },
};

/*
 * THE SPACING BETWEEN TWO OPENINGS OF A STACK, derived rather than typed.
 *
 * Two openings share ONE cross member, so the distance from one sill to the
 * next is one clear height plus one tube diameter. Every default in the
 * library above is this expression, and the inspector uses it to keep a
 * resized stack sensible: change a gate's opening height and its levels
 * would otherwise stay at whatever spacing the old height implied, which
 * either overlaps the frames or leaves a gap of nothing between them.
 *
 * An author can still type any spacing they like. This is the number the
 * tool offers, not a number it enforces.
 */
export function levelPitchFor(clearH) {
  return clearH + FRAME_TUBE_OD;
}

/*
 * NAMED OPENING SIZES, so an author does not have to type 1.524 twice per
 * gate.
 *
 * The owner's report: "for the track editor, include preset gate sizes so
 * the user doesn't have to customise each gate placement." Three of these
 * four are MultiGP's own published openings, quoted from the same page
 * src/game/track.js quotes and carrying the same VERIFY caveat as the rest
 * of this file. The fourth is not, and says so: a course for somebody's
 * first hour needs a hole a beginner can hit, and pretending an oversize
 * gate is in a rulebook would be worse than offering it honestly.
 *
 * Applying one sets the opening AND the level spacing, because a stack
 * whose spacing does not follow its opening height is a stack with its
 * frames overlapping or with a metre of air between them.
 */
export const GATE_PRESETS = [
  {
    id: 'standard',
    label: str('elements.standard'),
    size: '5 x 5 ft',
    published: true,
    hint: str('elements.the_multigp_chapter_gate_5_ft'),
    clearW: 5 * FT,
    clearH: 5 * FT,
  },
  {
    id: 'championship',
    label: str('elements.championship'),
    size: '7 x 6 ft',
    published: true,
    hint: str('elements.multigp_championship_size_7_ft_wide'),
    clearW: 7 * FT,
    clearH: 6 * FT,
  },
  {
    id: 'whoop',
    label: str('elements.whoop'),
    size: str('elements.19_x_19_in'),
    published: true,
    hint: str('elements.tiny_whoop_size_19_in_square'),
    clearW: 19 * IN,
    clearH: 19 * IN,
  },
  {
    id: 'trainer',
    label: str('elements.trainer'),
    size: '10 x 8 ft',
    published: false,
    hint: str('elements.not_a_multigp_size_a_deliberately'),
    clearW: 10 * FT,
    clearH: 8 * FT,
  },
];

/*
 * THE MICRO PRESET: 28 INCHES, AND ONLY 28 INCHES.
 *
 * RaceGOW's rules give a range, 24 to 28, and a 24 inch option was offered
 * here alongside the 28 because the published 4 by 6 foot envelope is
 * quoted at the minimum. It is gone, and what went with it is the only way
 * a track built in this tool could come out at a size nothing else in the
 * project uses.
 *
 * Everything here is built around 28. The pipe rule says to cut 20 sections
 * at 26.5 to 27.25 inches for "the maximum allowable open area", the tube
 * weBLEEDfpv sells for these tracks is 28 inches, the RaceGOW5 tracks in
 * presets.js are generated on a lattice derived from 28, src/game/track.js
 * scales the aircraft against 28 and src/render/scene.js builds the room
 * around it. One size, everywhere, is the whole point of a series where
 * everybody builds the same track in their own living room.
 *
 * This is what the tool OFFERS. The inspector still lets an author type any
 * number, and warnings.js still checks the 24 to 28 range against what they
 * typed, so a pilot whose own pipe is shorter is told their track is legal
 * rather than stopped.
 */
export const MICRO_GATE_PRESETS = [
  {
    id: 'racegow28',
    label: str('elements.racegow_28_in'),
    size: str('elements.28_x_28_in'),
    published: true,
    hint: str('elements.the_maximum_racegow_allows_and_what'),
    clearW: GATE_OPENING_MAX,
    clearH: GATE_OPENING_MAX,
  },
];

/* THE WING PRESET: the five metre square the palette places, and only
 * that. It is the tool's own size, so `published` is false the way the
 * trainer's is: no series publishes a wing gate to cite. */
export const WING_GATE_PRESETS = [
  {
    id: 'wing5',
    label: str('elements.wing'),
    size: str('elements.5_x_5_m'),
    published: false,
    hint: str('elements.a_five_metre_square_for_a'),
    clearW: WING_GATE,
    clearH: WING_GATE,
  },
];

const GATE_PRESETS_BY_CLASS = { full: GATE_PRESETS, micro: MICRO_GATE_PRESETS, wing: WING_GATE_PRESETS };

/* The presets offered on a track of this class. */
export function gatePresetsFor(cls) {
  return GATE_PRESETS_BY_CLASS[cls] ?? GATE_PRESETS;
}

/* Within a millimetre, which is finer than anything an author types and
 * coarser than the six decimal places the document rounds to. */
const PRESET_TOL = 0.001;

/* Which preset a set of dimensions IS, or null for a size somebody typed.
 * The inspector shows the answer, so "custom" is a state an author can see
 * rather than a silent one. */
export function matchingGatePreset(dims) {
  if (!dims) {
    return null;
  }
  /* Every list, because the answer to "which preset IS this" cannot depend
   * on which class is open: a 19 inch whoop gate on a full sized track is
   * still the Whoop preset. */
  return [...GATE_PRESETS, ...MICRO_GATE_PRESETS, ...WING_GATE_PRESETS]
    .find((p) => Math.abs(dims.clearW - p.clearW) < PRESET_TOL
      && Math.abs(dims.clearH - p.clearH) < PRESET_TOL) || null;
}

/*
 * Put a preset's opening on a set of dimensions, in place.
 *
 * Levels, sill height and everything else the element carries are LEFT
 * ALONE: a preset is an opening size, not a new element. A three level
 * ladder resized to championship is still a three level ladder.
 */
export function applyGatePreset(dims, preset) {
  if (!dims || !preset) {
    return dims;
  }
  dims.clearW = preset.clearW;
  dims.clearH = preset.clearH;
  /*
   * A RACEGOW STACK'S PITCH IS A RULE, NOT A CONSEQUENCE.
   *
   * Everywhere else the level pitch follows the opening, because two MultiGP
   * openings share one cross member and the spacing is whatever the frame
   * makes it. RaceGOW fixes it independently: rule 3 puts adjacent gates 27
   * to 33 inches centre to centre whether they are stacked or side by side,
   * and rule 5 wants the second opening's centre at 42 inches or more. At
   * the 28 inch opening the frame's own pitch would be 29.05 inches, which
   * is legal by rule 3 and puts the second centre at 43.05 with an inch of
   * margin. The nominal 30 is used instead, because it is the number the
   * rules name and it is comfortably inside both, and because an author who
   * types a smaller opening then has a stack that is still legal where the
   * frame's own pitch would not be: at 24 inches that pitch is 25.05, which
   * BREAKS rule 3.
   */
  dims.levelPitch = MICRO_GATE_PRESETS.includes(preset)
    ? GATE_SPACING_NOMINAL
    : levelPitchFor(preset.clearH);
  return dims;
}

/* Palette order is the order the task specifies, and the order the palette
 * draws. It is written out rather than derived from Object.keys so a future
 * reorder is one obvious edit. */
export const PALETTE_ORDER = [
  'gate', 'flaggedGate', 'doubleStack', 'flaggedDoubleStack', 'ladder', 'tower', 'diveGate', 'barrier', 'flag', 'cone', 'waypoint',
];

/*
 * The MICRO palette, in RaceGOW's own order and holding only RaceGOW's own
 * vocabulary. It is a different list rather than the full one with two
 * entries appended, because a palette is a statement about what this kind of
 * track is made of: a RaceGOW course has no flagged gates and no MultiGP
 * dive gate, and offering them would be the tool inventing a class rule.
 *
 * Barrier is on it because a living room has furniture in it, which is a
 * real and constant feature of these tracks.
 */
export const MICRO_PALETTE_ORDER = [
  'gate', 'doubleStack', 'ladder', 'tower', 'diveGate',
  'pole', 'horizontalPole', 'cone', 'barrier', 'waypoint',
];

/*
 * The WING palette. Gates, pylons and the waypoints that pin a line
 * between them, which is what a wing course is: an aircraft that cannot
 * hover has no use for a stack, a ladder, a dive gate or a ground cone,
 * and a barrier on an airfield is a tree.
 */
export const WING_PALETTE_ORDER = ['gate', 'flaggedGate', 'flag', 'waypoint'];

const PALETTES = { full: PALETTE_ORDER, micro: MICRO_PALETTE_ORDER, wing: WING_PALETTE_ORDER };

/* The palette for a track class. */
export function paletteFor(cls) {
  return PALETTES[cls] ?? PALETTE_ORDER;
}
export const PALETTE_EXTRA = ['startPads', 'label', 'groundLogo'];

/*
 * The path toggle. It is in the palette because the task puts it there, and
 * it is not an element: pressing P shows or hides the derived racing line.
 * It carries a key so the hotkey table has one source.
 */
export const PATH_TOGGLE = { id: 'path', label: str('elements.path'), key: 'P', note: str('elements.toggles_display_of_the_derived_racing') };

/*
 * Tuning. Every number the tool uses that is a length in metres, or that the
 * task explicitly asks to be a single named constant.
 */
export const TUNING = {
  /* Default field, in metres, and the grid it snaps to. */
  fieldWidth: 60,
  fieldDepth: 40,
  gridSize: 1,
  /*
   * THE MICRO SET. Every number below that is a length has a micro twin
   * here, because every one of them was chosen against a machine that
   * sweeps 0.35 m to a blade tip and flies at 20 m/s, and a whoop sweeps
   * 0.096 and flies at 4.
   *
   * They are in one block rather than scattered through the entries above
   * so that a reader can see the whole of what changes with the class, and
   * so `tuningFor` below is one lookup rather than eleven.
   */
  micro: {
    /*
     * The room, not the field. RaceGOW's own envelope is 1.22 by 1.83 m at
     * the minimum gate size, and its rules say "you will need some
     * additional space around the outside of that to fly the tracks
     * optimally". 5 by 6 m is a two car garage or a large living room, which
     * is where these are actually flown. See src/trackbuilder/racegow.js.
     */
    fieldWidth: ROOM_WIDTH,
    fieldDepth: ROOM_DEPTH,
    /* One inch. Every dimension RaceGOW publishes is a whole number of
     * inches and a metric grid would put none of them on a line. */
    gridSize: MICRO_GRID,
    /*
     * The curvature warning. A 5 inch at racing speed does 20 m/s and 2.5 m
     * of radius is 16 g, which no quad does. A whoop's fastest published lap
     * is 2.26 s over roughly 24 m, so about 10 m/s at the quickest and 4 to
     * 6 m/s round the technical parts. Holding 6 m/s round 0.45 m is 8 g,
     * which is at the edge of a 4.7:1 machine's envelope once the cosine of
     * the bank is paid for. Same reasoning, a fifth of the speed and a
     * twentieth of the radius.
     */
    minCurveRadius: 0.45,
    /* A metre of slop on a 60 m field is a gate sitting on the boundary. On
     * a 5 m room it is a fifth of the room. */
    boundarySlack: 0.25,
    /* Clearance a barrier gets when the line is tested against it. The line
     * is a centreline and a whoop is 96 mm across its ducts, so this is the
     * same fraction of the aircraft the full sized 0.35 is of a 5 inch. */
    barrierClearance: 0.10,
    /* How far the line steps off a stacked gate between two passes. Sized
     * the same way the full sized one is: the opening plus its frame plus a
     * body length, which on a 711 mm gate out of 27 mm pipe is 0.84 m. */
    stackWrap: 0.84,
  },
  /*
   * THE WING SET, built the same way against docs/WING-STAGE1.md: a 1000 mm
   * wing sweeping 0.5 m to a tip, cruising 15 to 25 m/s, turning in about
   * twenty metres. No stackWrap, because the wing palette has no stacks;
   * the field's value falls through and is never read.
   */
  wing: {
    /* An airfield. A lap of six pylons sixty metres apart is a minute at
     * cruise, and 400 by 300 holds that with room to line up on a gate. */
    fieldWidth: 400,
    fieldDepth: 300,
    /* Five metres, one gate width: nothing on a wing course is placed to
     * the metre, and a metre grid on a 400 m field is noise. */
    gridSize: 5,
    /* W6: a 60 degree bank at 20 m/s is 23.5 m of radius, and the wing is
     * flown at up to 25 m/s. A line tighter than 20 m is one the aircraft
     * cannot follow. */
    minCurveRadius: 20,
    /* Five metres on a 400 m field is the same fraction of the field the
     * full sized metre is of sixty. */
    boundarySlack: 5,
    /* A metre of clearance for a 0.5 m sweep, the same two sweeps the full
     * sized 0.35 gives a 0.17 m five inch. */
    barrierClearance: 1.0,
  },

  /*
   * How long a Hermite tangent is, as a fraction of the distance to the next
   * knot. The task asks for this to be one named constant so the line can be
   * tuned, and this is it.
   *
   * DERIVED, NOT CHOSEN, and the derivation matters because the obvious
   * number is wrong by a factor of three.
   *
   * The well known figure for approximating a circular arc with a cubic is
   * k = (4/3)tan(theta/4)R, which is 0.5523R for a quarter circle. That is
   * the offset of a BEZIER CONTROL POINT from the endpoint. A Hermite
   * tangent is three times that, because the Bezier control point sits at
   * p0 + m0/3. Using the Bezier figure as a Hermite tangent makes every
   * tangent a third as long as it should be, and a cubic whose tangents are
   * too short does not gently straighten: it puts a near cusp at every knot
   * whose tangent is not already pointing along the chord. Measured on a 120
   * m demo lap it gave a radius of curvature of 0.2 m at almost every gate,
   * which is what the curvature warning is for and how this was caught.
   *
   * The correct ratio for a turn of theta through two knots is
   *
   *     m / chord = 2 tan(theta/4) / sin(theta/2)
   *
   * which is 1.000 for a straight, 1.072 at 60 degrees, 1.172 at 90 and
   * 1.333 at 120. 1.1 sits in the middle of the range a racing line actually
   * turns through, reproduces a circle to within a few percent over it, and
   * sits a shade over the Catmull-Rom value of 1.0, which is the other
   * defensible answer.
   */
  tangentScale: 1.1,

  /*
   * Minimum radius of curvature the line may reach before the results panel
   * warns, in metres. A 5 inch quad at racing speed is doing 20 m/s or so;
   * holding 20 m/s round a 2.5 m radius is 160 m/s squared of lateral
   * acceleration, over 16 g, which no quad does. So a line that dips below
   * this is telling the author the two elements either side are too close or
   * face the wrong way. Per track, in doc.settings, so it is configurable.
   */
  minCurveRadius: 2.5,

  /* How finely the spline is sampled, per segment between two knots. Arc
   * length, curvature, the barrier test and the elevation profile all read
   * this polyline, so it is one number rather than four. */
  samplesPerSegment: 48,

  /* How far outside the field boundary a sample has to stray before the
   * results panel says the line left the field. A metre of slop stops a
   * gate sitting exactly on the boundary from warning every time. */
  boundarySlack: 1.0,

  /* Clearance a barrier is given when the line is tested against it. The
   * line is a centreline and a quad is not a point. */
  barrierClearance: 0.35,

  /*
   * How far the racing line steps off a stacked gate between two passes, in
   * metres. A Hermite between two openings that share an XY climbs through
   * the PVC; this offset is what turns that climb into a wrap around the
   * structure. Sized from the 5 ft opening plus its sleeves plus a body
   * length, so the line clears the frame on a standard stack.
   */
  stackWrap: 2.6,
};

/*
 * The tuning for a track class. Falls through to the full sized value for
 * anything the class's block does not name, which is every ratio and count
 * in TUNING: a tangent scale and a samples per segment are dimensionless
 * and do not care how big the track is.
 */
export function tuningFor(cls) {
  const block = cls !== TRACK_CLASS_DEFAULT && TRACK_CLASSES.includes(cls) ? TUNING[cls] : null;
  return block ? { ...TUNING, ...block } : TUNING;
}

/* Convenience: every element definition in palette order, extras last. */
export function paletteItems(cls = TRACK_CLASS_DEFAULT) {
  return [
    ...paletteFor(cls).map((id) => ELEMENTS[id]),
    ...PALETTE_EXTRA.map((id) => ELEMENTS[id]),
  ];
}

const EXTRA_TYPES = new Set(PALETTE_EXTRA);

/*
 * How many of each palette type stand on the field. Start pads and labels
 * are extras, not course furniture, so they stay out of this list. Types
 * that are not present are omitted, and the order is the palette order so
 * two tracks with the same mix always print the same way.
 *
 * This is the inventory an author quotes: 4 gates, 1 double stack, 1 dive
 * gate, 2 flags. It is not the flying-order length, which still lives on
 * the sequence. A flagged gate stays a flagged gate; the pennant is dress
 * but the palette tool is distinct, and collapsing it into Gate would hide
 * that.
 */
export function countElementsByType(elements) {
  const tally = new Map();
  for (const el of elements || []) {
    const type = el && el.type;
    if (!type || !ELEMENTS[type] || EXTRA_TYPES.has(type)) {
      continue;
    }
    tally.set(type, (tally.get(type) || 0) + 1);
  }
  const rows = [];
  /* Both palettes, so an inventory names every element on the track even if
   * the document mixes classes, which a hand edit can do. The order is the
   * full palette's, then whatever is only on the micro one. */
  const order = [...PALETTE_ORDER, ...MICRO_PALETTE_ORDER.filter((id) => !PALETTE_ORDER.includes(id))];
  for (const id of order) {
    const count = tally.get(id) || 0;
    if (count > 0) {
      rows.push({ type: id, label: ELEMENTS[id].label, count });
    }
  }
  return rows;
}

/* "4 gates, 1 triple stack, 1 dive gate". Empty field: "no elements". */
export function formatElementCounts(rows) {
  if (!rows || !rows.length) {
    return str('elements.no_elements');
  }
  return rows.map((row) => {
    const word = row.count === 1 ? row.label : `${row.label}s`;
    return `${row.count} ${word.toLowerCase()}`;
  }).join(', ');
}

/*
 * Look up an element definition by the hotkey the user pressed. Returns
 * undefined for a key that is not on THIS CLASS'S palette.
 *
 * It used to search the micro palette and then the full one, so on a five
 * inch track Z armed a horizontal pole and U a RaceGOW pole, neither of which
 * is on that track's palette, and each of them landed at the five inch's
 * default size on a field the class never meant them for. A hotkey arms what
 * the palette shows.
 */
export function elementByKey(letter, cls = TRACK_CLASS_DEFAULT) {
  const up = String(letter || '').toUpperCase();
  return paletteItems(cls).find((d) => d.key === up);
}

/*
 * The openings a set of dimensions produces, bottom to top.
 *
 * `centerH` is the height of the opening's centre above the element's own
 * base, which is what everything downstream actually wants: the aperture's
 * world centre is the element's position raised by centerH, and the tilt
 * rotates the opening about that centre.
 */
/* The mast height an element actually carries, with the default for a
 * document written before flagH existed. One reader, so the mesh, the
 * collider, the preview and the height cannot disagree. */
export function gateFlagHeight(dims) {
  const h = dims?.flagH;
  return Number.isFinite(h) && h > 0 ? h : GATE_FLAG_H;
}

export function apertureLevels(dims) {
  const out = [];
  const n = Math.max(1, Math.round(dims.levels));
  for (let i = 0; i < n; i += 1) {
    const sill = dims.sillH + i * dims.levelPitch;
    out.push({
      index: i,
      sillH: sill,
      centerH: sill + dims.clearH / 2,
      clearW: dims.clearW,
      clearH: dims.clearH,
    });
  }
  return out;
}

/* Overall height of an element, for the 3D view and for the height drag
 * limits. Aperture elements are as tall as their top opening plus a tube. */
export function elementHeight(def, dims) {
  if (def.kind === KIND.APERTURE) {
    const levels = apertureLevels(dims);
    const top = levels[levels.length - 1];
    const h = top.sillH + top.clearH + FRAME_TUBE_OD;
    /* The author's own mast, not the default, so raising a pennant raises
     * the height the 3D view's drag limits and the plan's labels use. */
    return def.flagSide ? h + gateFlagHeight(dims) : h;
  }
  if (def.kind === KIND.OBSTACLE) {
    return dims.height;
  }
  if (def.kind === KIND.MARKER) {
    return dims.height;
  }
  if (def.kind === KIND.START) {
    /* Visual height of the launch stand in src/art/startblock.js. */
    return Math.max(0.08, dims.padSize * 0.40);
  }
  return dims.textHeight;
}
