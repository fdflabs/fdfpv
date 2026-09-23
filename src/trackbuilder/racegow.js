import { str } from '../strings/index.js';
/*
 * racegow.js: the RaceGOW track specification, as numbers.
 *
 * WHAT RACEGOW IS, because the shape of it decides the shape of this file.
 * It is not a race league with heats and marshals. It is an asynchronous, at
 * home, video verified TIME TRIAL series run by Dan "FPV Skittles" Sugano,
 * the whoop sized version of MultiGP's Universal Time Trial: eight tracks a
 * season, one every fortnight, each published as a DIMENSIONED SPEC that
 * every pilot builds in their own living room out of 3/4 inch PVC and flies
 * alone. The metric is the fastest THREE CONSECUTIVE LAPS, always starting
 * and finishing on one designated gate.
 *
 * That is why a simulator can clone it honestly: the track is a spec, not a
 * place. Everybody flies the same geometry, and the times pool on one board.
 * It is the same loop this project already has.
 *
 * SOURCES. Every number below is quoted from RaceGOW's own published rules
 * or from the on screen dimension cards in the official build videos:
 *
 *   "RaceGOW Track Building Rules and Information"
 *     docs.google.com/document/d/1RDksQXnRSFZk1Xtg7ERQPjo_-OQ_DxJzZDR5UEtFjFY
 *   "RaceGOW Basic Concept and Classes"
 *     docs.google.com/document/d/1gVuj5Sy9m8SGn5isr9FQF6-FF4EzGyM9rJYqjwrTwJM
 *   "RaceGOW General Rules"
 *     docs.google.com/document/d/16ib_NF-k4bQZlHipQ_DtycPLboodA9TFNLXR6_CBQfQ
 *   the Track Diagram cards in youtube.com/watch?v=IZVy-fwQVjE
 *   the per track diagrams, e.g. RaceGOW Track8 and Track6
 *
 * The metric figures are RaceGOW's own where they published one, and the
 * exact conversion of their imperial figure where they did not. Where a
 * number here is DERIVED rather than quoted, it says so.
 *
 * This file has no DOM and no Three.js and imports nothing from the
 * simulator, exactly like the rest of the builder's data modules, so
 * src/game/trackdoc.js can read it too.
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

/* One inch and one foot, in metres, exactly. */
const IN = 0.0254;
const FT = 0.3048;

/*
 * THE PIPE.
 *
 * "Buy 3/4" PVC Connector Sets" and "weBLEED has all the 3/4" PVC connectors
 * for 99 cents each" (RaceGOW, twice). 3/4 inch nominal schedule 40 PVC has
 * an outside diameter of 1.050 in, which is 26.7 mm. RaceGOW does not
 * mandate a diameter, only the gate geometry, and European builders use
 * 20 mm; 3/4 inch is what the organiser's own tracks are built from and what
 * the diagrams are drawn against.
 *
 * The section length is the load bearing number and it is quoted exactly:
 * "If you cut your 20 PVC sections between 26.5" (67.31cm) and 27.25"
 * (69.22cm) then when you assemble adjacent gates you will have the maximum
 * allowable open area and the minimum allowable center to center distance
 * between gates." One length builds every element on the track.
 */
export const PIPE_OD = 1.050 * IN;      /* 26.7 mm */
export const PIPE_LEN_MIN = 26.5 * IN;  /* 673 mm */
export const PIPE_LEN_MAX = 27.25 * IN; /* 692 mm */

/*
 * THE GATE RULES, verbatim in the comments, exact in the numbers.
 *
 * 1. "All gates must have an open area the size of a 28" (71cm) square or
 *    anything that would fit inside a 28" square."
 * 2. "All gates must be fully enclosed. This means when using PVC you must
 *    have a section along the ground of each gate. If you are creating gates
 *    then the floor, wall, and/or ceiling cannot act as a side of a gate."
 *    THIS IS WHY EVERY MICRO GATE HAS A BAR ON THE FLOOR and why the default
 *    sill height is zero rather than the six inches rule 4 would allow.
 * 3. "All adjacent gates must be between 27" (68.58cm) minimum and 33"
 *    (83.82cm) maximum from center to center of the gates. ... This rule
 *    applies to both side by side and vertically stacked gates." The Track
 *    Diagram cards give the nominal as 30" plus or minus 3".
 * 4. "Gates on the 'ground' have their center at 20" (50.8cm) or lower above
 *    the ground. This means a full size gate can be a MAXIMUM of 6" (15cm)
 *    above the ground."
 * 5. "The top gate on a two high stack of gates must be AT LEAST 42"
 *    (106.7cm) above the ground. A 3rd gate stacked on top would need to be
 *    AT LEAST 69" (175.3cm) above the ground."
 *
 * And from the season doc: a minimum gate size of 24", "no maximum size but
 * all your gates must be the same size. You must scale the entire track up
 * equally based on your gate size."
 */
export const GATE_OPENING_MIN = 24 * IN;   /* 610 mm */
export const GATE_OPENING_MAX = 28 * IN;   /* 711 mm */
export const GATE_SPACING_NOMINAL = 30 * IN; /* 762 mm */
export const GATE_SPACING_MIN = 27 * IN;   /* 686 mm */
export const GATE_SPACING_MAX = 33 * IN;   /* 838 mm */
export const GROUND_GATE_CENTRE_MAX = 20 * IN; /* 508 mm */
export const STACK2_CENTRE_MIN = 42 * IN;  /* 1067 mm */
export const STACK3_CENTRE_MIN = 69 * IN;  /* 1753 mm */

/*
 * Pole clearances, from the Track6 diagram, which dimensions them three
 * times: "14" minimum" from the centre of a gate to a pole, and "36"
 * minimum" between two poles.
 */
export const POLE_FROM_GATE_MIN = 14 * IN; /* 356 mm */
export const POLE_FROM_POLE_MIN = 36 * IN; /* 914 mm */

/*
 * The Elevated Gate, from the Track8 diagram: "bottom of gate must be a
 * minimum 56" (142.2cm) above the ground", and it "must be centered between
 * the Side by Side gates and on the same plane".
 */
export const ELEVATED_SILL_MIN = 56 * IN;  /* 1422 mm */

/*
 * THE ENVELOPE, and it has moved three times, which is why all three are
 * here rather than only the current one.
 *
 *   RaceGOW1     "All tracks will fit inside a 5' x 8' (152cm x 244cm)
 *                rectangle but you will need some additional space around
 *                the border of the rectangle to fly the tracks."
 *   RaceGOW2     "All RaceGOW2 tracks will fit in a 6' x 6' square"
 *   RaceGOW3/5   "All RaceGOW tracks will fit in a 4' x 6' rectangle (if you
 *                are using the minimum gate size of 24")"
 *
 * The current one is the 4 by 6, and the parenthesis is load bearing: it is
 * the envelope AT THE MINIMUM GATE SIZE. A track built at the 28 inch
 * maximum scales with the gates, so the envelope this file uses is the 4 by
 * 6 scaled by the ratio of the built opening to 24 inches. At the 28 inch
 * default that is 1.42 by 2.13 m.
 */
export const ENVELOPE_W_AT_MIN = 4 * FT;   /* 1219 mm */
export const ENVELOPE_D_AT_MIN = 6 * FT;   /* 1829 mm */

/* The envelope for a track whose gates are `opening` wide. */
export function envelopeFor(opening) {
  const k = opening / GATE_OPENING_MIN;
  return { width: ENVELOPE_W_AT_MIN * k, depth: ENVELOPE_D_AT_MIN * k };
}

/*
 * THE ROOM, which RaceGOW does not specify and which a simulator has to.
 *
 * Pilots need run off: the RaceGOW3 Track 7 leaderboard carries the note
 * "Can we quit with the tracks that go out of the bounds on all 4 sides?",
 * and the rules themselves say "you will need some additional space around
 * the outside of that to fly the tracks optimally". A metre and a bit on
 * every side of the envelope is what the organiser's own footage shows.
 *
 * IT WAS 5 BY 6 BY 2.4 M, A DOMESTIC ROOM, AND IT IS NOW A HALL. The owner
 * flew it and asked for twice the room and a higher ceiling, which is a
 * judgement about how a whoop reads on screen rather than about RaceGOW: at
 * 5 by 6 the aircraft is never more than two and a half metres from a wall,
 * so almost every input is a correction and the pilot spends the lap
 * defending the boundary instead of flying the track. RaceGOW itself does
 * not specify the room, only the envelope and that pilots "will need some
 * additional space around the outside of that", so a bigger space is inside
 * the spec rather than a departure from it: the RaceGOW3 Track 7 leaderboard
 * carries the note "Can we quit with the tracks that go out of the bounds on
 * all 4 sides?", which is a field complaining about too little run off, not
 * too much.
 *
 * 10 by 12 m with a 4 m ceiling is a sports hall, a shed or a warehouse bay,
 * which is where organised whoop racing is actually flown once it leaves the
 * living room. It holds a 28 inch track with 4.3 m of run off on the short
 * sides and 4.9 m on the long ones.
 *
 * The ceiling matters more than the floor and that is why it moved too. A
 * triple stack's top gate centre is at 1.88 m and the Elevated Gate rule
 * pushes an opening to 2.13 m, so a 2.4 m domestic ceiling left 270 mm of
 * air over the tallest legal element: a pilot who ballooned over an elevated
 * gate hit the joists. At 4 m there is nearly 1.9 m of it, which is room to
 * make the mistake and recover from it.
 */
export const ROOM_WIDTH = 10.0;
export const ROOM_DEPTH = 12.0;
export const ROOM_HEIGHT = 4.0;

/*
 * The grid. One inch, because every dimension RaceGOW publishes is a whole
 * number of inches and a metric grid would make none of them land on a line.
 * The builder still stores metres; this is only what it snaps to.
 */
export const GRID = 1 * IN;

/*
 * THE ELEMENT VOCABULARY, with the names taken verbatim off the official
 * diagrams, and what each one is in this builder's own terms.
 *
 * RaceGOW has no named track designs, only Track1 to Track8 per season, but
 * it has a firm named element vocabulary and that is what a track editor
 * actually needs. The mapping is deliberately onto the builder's EXISTING
 * element types wherever one fits, because a micro track and a full sized
 * one should be the same kind of document with different numbers in it.
 *
 * Two are genuinely new. `sideBySide` exists because RaceGOW treats a row of
 * gates as ONE element with a spacing rule, and modelling it as loose gates
 * would make the rule the author's problem instead of the tool's.
 * `horizontalPole` exists because there is no existing element that is a
 * single horizontal bar to be flown over or under.
 */
export const RACEGOW_ELEMENTS = [
  { racegow: str('racegow.start_finish_gate'), type: 'gate', colour: 'green',
    note: str('racegow.a_ground_gate_and_the_one') },
  { racegow: str('racegow.single_gate'), type: 'gate', colour: 'yellow',
    note: str('racegow.one_square_with_its_bottom_bar') },
  { racegow: str('racegow.side_by_side_gates'), type: 'sideBySide', colour: 'blue',
    note: str('racegow.two_or_three_gates_in_a') },
  { racegow: str('racegow.double_stacked_gates'), type: 'doubleStack', colour: 'purple',
    note: str('racegow.two_gates_vertically_the_top_one') },
  { racegow: str('racegow.triple_gate_stack'), type: 'ladder', colour: 'purple',
    note: str('racegow.three_high_the_top_one_is') },
  { racegow: str('racegow.elevated_gate'), type: 'tower', colour: 'orange',
    note: str('racegow.a_gate_carried_above_the_ground') },
  { racegow: str('racegow.horizontal_gate'), type: 'diveGate', colour: 'blue',
    note: str('racegow.a_gate_in_the_horizontal_plane') },
  { racegow: str('racegow.vertical_pole'), type: 'pole', colour: 'red',
    note: str('racegow.a_single_upright_pipe_to_be') },
  { racegow: str('racegow.horizontal_pole'), type: 'horizontalPole', colour: 'red',
    note: str('racegow.a_single_horizontal_pipe_flown_over') },
];

/*
 * THE DEFAULT GATE, and why it is the maximum rather than the minimum.
 *
 * The rules allow 24 to 28 inches and the envelope is quoted at 24. But the
 * pipe rule tells you what people actually build: cutting 20 sections at
 * 26.5 to 27.25 inches gives "the maximum allowable open area and the
 * minimum allowable center to center distance", and the commercial tube
 * weBLEEDfpv sells for these tracks is 28 inches long. So the aircraft the
 * builder should default to putting on the field is the one the shop sells
 * you the parts for.
 */
export const GATE_OPENING_DEFAULT = GATE_OPENING_MAX;

/*
 * Every check the rules imply, as data, so the builder's warnings and any
 * future validator read one list. Each returns null or a sentence.
 *
 * `ctx` carries { openings, spacings, groundCentres, stackCentres, poles }
 * gathered by the caller from the document; this module does no geometry.
 */
export const RULES = [
  {
    id: 'opening-range',
    title: str('racegow.gate_opening'),
    detail: str('racegow.racegow_gates_are_between_and_across', { inches: inches(GATE_OPENING_MIN), inches2: inches(GATE_OPENING_MAX) }),
  },
  {
    id: 'opening-uniform',
    title: str('racegow.one_gate_size'),
    detail: str('racegow.every_gate_on_a_racegow_track'),
  },
  {
    id: 'spacing',
    title: str('racegow.adjacent_gates'),
    detail: str('racegow.adjacent_gates_sit_to_apart_centre', { inches: inches(GATE_SPACING_MIN), inches2: inches(GATE_SPACING_MAX), inches3: inches(GATE_SPACING_NOMINAL) }),
  },
  {
    id: 'ground-centre',
    title: str('racegow.ground_gates'),
    detail: str('racegow.a_gate_on_the_ground_has', { inches: inches(GROUND_GATE_CENTRE_MAX) }),
  },
  {
    id: 'stack-2',
    title: str('racegow.second_gate_of_a_stack'),
    detail: str('racegow.at_least_above_the_ground', { inches: inches(STACK2_CENTRE_MIN) }),
  },
  {
    id: 'stack-3',
    title: str('racegow.third_gate_of_a_stack'),
    detail: str('racegow.at_least_above_the_ground', { inches: inches(STACK3_CENTRE_MIN) }),
  },
  {
    id: 'pole-clear',
    title: str('racegow.poles'),
    detail: str('racegow.at_least_from_the_centre_of', { inches: inches(POLE_FROM_GATE_MIN), inches2: inches(POLE_FROM_POLE_MIN) }),
  },
  {
    id: 'square-headings',
    title: str('racegow.gate_headings'),
    detail: str('racegow.every_gate_faces_along_one_of'),
  },
  {
    id: 'envelope',
    title: str('racegow.the_envelope'),
    detail: str('racegow.the_whole_track_fits_a_by', { inches: inches(ENVELOPE_W_AT_MIN), inches2: inches(ENVELOPE_D_AT_MIN) }),
  },
];

/* Both units, because the rules are published in inches and the document is
 * stored in metres, and an author checking their build against a YouTube
 * video needs the inches. */
export function inches(m) {
  const i = m / IN;
  const shown = Math.abs(i - Math.round(i)) < 0.02 ? String(Math.round(i)) : i.toFixed(1);
  return str('racegow.in_mm', { shown, v2: Math.round(m * 1000) });
}

/*
 * The lap the board should measure, and it is not one lap.
 *
 * "On all tracks we will be looking for your best 3-consecutive-lap time.
 * Your timing will always start and finish on a designated start/finish
 * gate." Three, always, on every RaceGOW track in every season.
 *
 * Real times, computed from the RaceGOW5 leaderboards across the seven
 * published tracks (161 to 365 entries each): the fastest three lap time on
 * a track runs 6.78 s to 21.80 s, the fastest single lap is 2.26 s and the
 * median single lap is 5.87 s. That is the band a simulated whoop has to be
 * able to produce, and scripts/whoop-gates.js gate W13 checks it.
 */
export const LAPS_COUNTED = 3;
