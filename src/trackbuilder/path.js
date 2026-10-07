/*
 * path.js: the racing line, from the flying order to a sampled curve.
 *
 * buildKnots turns the sequence into knots, points the line must pass with
 * the direction it must pass them in, and buildPath joins consecutive knots
 * with cubic Hermite pieces and samples them.
 *
 * Where the knots come from:
 *
 *   an opening    its centre, facing along the structure's normal times the
 *                 entry sign, so the tangent is the way the quad flies it.
 *   a marker      the pole pushed out by the entry's clearance on the pass
 *                 side, facing the way the lap travels there, kept level.
 *   a stack wrap  between two passes through the same structure, from
 *                 figures.js, so the line goes round the frame and not up
 *                 through it.
 *   the finish    a copy of the first knot when the lap is a circuit (start
 *                 pads placed, or closeLoop asked for). The pads themselves
 *                 are never a knot: they are where the quad waits, and
 *                 routing the line out to them and back drew a loop round
 *                 the grid.
 *   a dodge       a steering knot just outside a gate the curve would
 *                 otherwise fly through without being sent there.
 *
 * Each piece's end tangents are scaled by settings.tangentScale times the
 * straight distance between its two knots, so a long leg bows as much as a
 * short one in proportion.
 *
 * Curvature comes from the Hermite's analytic derivatives. Differencing the
 * sampled polyline gives a radius that changes with samplesPerSegment, and a
 * tight turn warning that moves when an unrelated setting moves is one
 * nobody trusts.
 *
 * The output is a contract down to the last bit: trackdoc.js places a
 * marker's scoring square off its knot, and the board checks posted laps
 * against those squares. tests/fixtures/trackbuilder/golden.json pins it.
 * So the arithmetic below keeps one evaluation order on purpose, and the
 * records keep their field order.
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

import { KIND, trackClassOf, tuningFor, virtualApertureDims } from './elements.js';
import {
  apertureCenter, aperturesOf, elementById, elementNormal, entryAnchor, kindOf, startPadsOf,
} from './model.js';
import { markerPassDir, nearbyApertureTravel } from './faces.js';
import { wrapBetween } from './figures.js';
import {
  add, apertureFrame, clamp, cross, dist, dot, leftOf, length, normalize, scale, sub, yawVector,
} from './geometry.js';

const X_AXIS = { x: 1, y: 0, z: 0 };

/* Shorter than this between two knots and there is no piece to fit. */
const COINCIDENT = 1e-6;

/* A track still crossing a gate after this many dodges has a layout problem
 * the line cannot solve, and the builder reruns this on every keystroke, so
 * it stops rather than searching on. */
const MAX_DODGES = 12;

/* Samples per piece when searching for a crossing. Coarser than drawing,
 * because this runs on every edit, and no gate is thin enough for a step of
 * a 24th of a leg to jump it. */
const CROSSING_STEPS = 24;

/* ------------------------------------------------------------------ */
/* The cubic Hermite.                                                  */
/* ------------------------------------------------------------------ */

/* The four basis weights (start point, start tangent, end point, end
 * tangent) and their first and second derivatives in t. */
function weightsAt(t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, -2 * t3 + 3 * t2, t3 - t2];
}

function slopeWeightsAt(t) {
  const t2 = t * t;
  return [6 * t2 - 6 * t, 3 * t2 - 4 * t + 1, -6 * t2 + 6 * t, 3 * t2 - 2 * t];
}

function bendWeightsAt(t) {
  return [12 * t - 6, 6 * t - 4, -12 * t + 6, 6 * t - 2];
}

/* One piece of the line between two knots, or null when they coincide. */
function pieceBetween(a, b, tangentScale) {
  const span = dist(a.pos, b.pos);
  if (span < COINCIDENT) {
    return null;
  }
  const reach = span * tangentScale;
  return { p0: a.pos, m0: scale(a.tangent, reach), p1: b.pos, m1: scale(b.tangent, reach) };
}

/* The weighted sum, grouped as (start terms) + (end terms). The grouping is
 * part of the pinned output. */
function combine(piece, w) {
  const { p0, m0, p1, m1 } = piece;
  return add(add(scale(p0, w[0]), scale(m0, w[1])), add(scale(p1, w[2]), scale(m1, w[3])));
}

/* ------------------------------------------------------------------ */
/* Knots.                                                              */
/* ------------------------------------------------------------------ */

/*
 * The sign of travel past a marker the author has turned by hand.
 *
 * A turned marker fixes the pass line; only the direction along it is open.
 * The neighbour chord (next anchor minus previous) answers that badly on a
 * hairpin round one pole, which is what RaceGOW5 Track 8 is built from: the
 * chord runs up the pole, or backwards. So ask where the quad is as it sets
 * off for this marker, one clearance along the previous knot's heading, and
 * whether the marker lies ahead of or behind that point along the pass line.
 * The step is deliberately short: it only breaks the tie when the marker is
 * dead abeam, and a body length overshoots a pole one lattice unit away and
 * flips the answer. Null leaves the decision to the chord.
 */
function fixedMarkerHeading(el, from, step) {
  if (!from) {
    return null;
  }
  const passLine = leftOf(yawVector(el.yaw));
  const heading = normalize({ x: from.tangent.x, y: from.tangent.y, z: 0 }, X_AXIS);
  const setOff = add(from.pos, scale(heading, step));
  const toMarker = sub(el.position, setOff);
  const ahead = passLine.x * toMarker.x + passLine.y * toMarker.y;
  if (Math.abs(ahead) < 1e-6) {
    return null;
  }
  return scale(passLine, ahead >= 0 ? 1 : -1);
}

/* The sequence entries that land somewhere, with the chord direction each
 * one is flown along: from the anchor before it to the anchor after it,
 * clamped at the ends. */
function stationsOf(doc) {
  const stations = [];
  doc.sequence.forEach((seq, i) => {
    const anchor = entryAnchor(doc, seq);
    if (anchor) {
      stations.push({ seq, anchor, el: elementById(doc, seq.elementId), order: i + 1 });
    }
  });
  const last = stations.length - 1;
  stations.forEach((st, i) => {
    st.chord = last > 0
      ? normalize(sub(stations[Math.min(last, i + 1)].anchor, stations[Math.max(0, i - 1)].anchor), X_AXIS)
      : X_AXIS;
  });
  return stations;
}

function openingKnot(st) {
  const facing = elementNormal(st.el);
  /* Entry 0 is undecided. Fly it the way the course runs so there is still
   * a line to draw; warnings.js reports the entry as unset. */
  const entry = st.seq.entry === 0 ? (dot(facing, st.chord) >= 0 ? 1 : -1) : st.seq.entry;
  return {
    pos: { ...st.anchor },
    tangent: scale(facing, entry),
    role: 'aperture',
    seq: st.seq,
    index: st.order,
    elementId: st.el.id,
  };
}

/*
 * A marker's knot. `from` is the knot the quad is coming from (or the pads
 * for the first one), `nextZ` the height of the anchor flown after it.
 *
 * Which way the lap travels past it, first answer wins: the gate a stile
 * pole belongs to (otherwise its scoring square stands along the PVC and a
 * pass through the opening misses it); a hand-turned waypoint's own arrow,
 * since a waypoint has no pass side and the apex of a loop must face the way
 * the lap goes; a hand-turned marker's pass line, signed as above; the chord.
 *
 * The tangent stays level: a flag has no vertical face to take a slope from,
 * and a sloped tangent between two ground markers sends the curve below the
 * floor.
 *
 * Height: the anchor is the foot of the pole, and a knot on the floor made
 * every pass round a pole dive and climb. A marker with a clearance takes the
 * mean of the height it is reached from and the next anchor's, held inside
 * its own scoring square so a cone is not cleared over its top. A marker
 * without one keeps its anchor height, which is what pins a waypoint.
 */
function markerKnot(doc, st, from, nextZ, cls) {
  const { el, seq, anchor } = st;
  const clearance = seq.clearance ?? 0;
  let travel = nearbyApertureTravel(doc, el);
  if (!travel && el.type === 'waypoint' && el.yawOverridden) {
    travel = yawVector(el.yaw);
  }
  if (!travel && el.yawOverridden) {
    travel = fixedMarkerHeading(el, from, Math.max(0.05, clearance));
  }
  travel = travel || st.chord;

  let z = anchor.z;
  if (clearance > 0) {
    const fromZ = from ? from.pos.z : anchor.z;
    const square = virtualApertureDims(el, seq, cls);
    z = clamp((fromZ + nextZ) / 2, anchor.z, anchor.z + square.clearH * 0.9);
  }
  return {
    pos: { ...add(anchor, scale(markerPassDir(el, seq, travel), clearance)), z },
    tangent: normalize({ x: travel.x, y: travel.y, z: 0 }, X_AXIS),
    role: 'marker',
    seq,
    index: st.order,
    elementId: el.id,
    markerPos: { ...anchor },
  };
}

/* A knot that steers the line and is not a station: trackdoc scores
 * openings and markers with a clearance, never these. */
function steeringKnot(pos, tangent, elementId) {
  return { pos, tangent, role: 'wrap', seq: null, index: null, elementId };
}

/* Two passes in a row through one structure need a knot between them, or
 * the curve climbs straight up the shared frame. */
function withStackWraps(doc, knots, cls) {
  const out = [];
  knots.forEach((knot, i) => {
    out.push(knot);
    const next = knots[i + 1];
    const sameFrame = next && knot.role === 'aperture' && next.role === 'aperture' && knot.elementId === next.elementId;
    if (!sameFrame) {
      return;
    }
    const frame = elementById(doc, knot.elementId);
    if (!frame) {
      return;
    }
    const wrap = wrapBetween(frame, knot.seq, next.seq, cls);
    out.push(steeringKnot(wrap.pos, wrap.tangent, frame.id));
  });
  return out;
}

/*
 * The closing knot: the first knot again, so the last piece meets the first
 * without a kink. Needs at least two knots, because a lone gate closed on
 * itself is a zero length lap, and that would greet an author's first gate
 * with a coincident knots warning instead of nothing.
 */
function finishKnot(first) {
  return {
    pos: { ...first.pos },
    tangent: { ...first.tangent },
    role: 'finish',
    seq: first.seq,
    index: null,
    elementId: first.elementId,
    markerPos: first.markerPos ? { ...first.markerPos } : undefined,
  };
}

/*
 * closeLoop asks for the finish knot even without start pads. The builder
 * never asks, so authors see the line they always saw. The animation export
 * does: a RaceGOW lap starts and ends on the first gate flown whether or not
 * pads are placed, and without the return leg the exported line cannot loop
 * (on the shipped Living room 1 that leg is 5.134 m of a 7.154 m lap).
 */
export function buildKnots(doc, { closeLoop = false } = {}) {
  const pads = startPadsOf(doc);
  const cls = trackClassOf(doc);
  const stations = stationsOf(doc);
  const padKnot = pads ? { pos: { ...pads.position }, tangent: yawVector(pads.yaw) } : null;

  const knots = [];
  stations.forEach((st, i) => {
    if (kindOf(st.el) === KIND.APERTURE) {
      knots.push(openingKnot(st));
      return;
    }
    const from = knots.length ? knots[knots.length - 1] : padKnot;
    /* After the last marker the lap heads back to the first anchor. */
    const nextZ = (stations[i + 1] || stations[0]).anchor.z;
    knots.push(markerKnot(doc, st, from, nextZ, cls));
  });

  const line = withStackWraps(doc, knots, cls);
  if ((pads || closeLoop) && line.length > 1) {
    line.push(finishKnot(line[0]));
  }
  /* Dodging comes last so the closing leg is checked like any other. */
  return dodgeForeignGates(doc, line);
}

/* ------------------------------------------------------------------ */
/* Not flying through a gate the quad was not sent through.            */
/* ------------------------------------------------------------------ */

/*
 * A Hermite piece knows its two knots and nothing else, so it will happily
 * pass through a third gate standing between them; five of the seventeen
 * shipped tracks did. A pilot goes round. So: find the first place a piece
 * crosses an opening that is not one of its own two, and drop a steering
 * knot there pushed out past the nearer edge of the frame (the smaller
 * correction, the one a pilot takes) by the class's barrier clearance,
 * because the line is a centreline and the quad has width. Then look again,
 * from the start, since the new knot changes its neighbours' pieces.
 */

/* Every opening on the track, as a centred rectangle in its own frame. */
function openingRects(doc) {
  const rects = [];
  for (const el of doc.elements) {
    if (kindOf(el) !== KIND.APERTURE) {
      continue;
    }
    const frame = apertureFrame(el.yaw, el.pitch);
    for (const ap of aperturesOf(el)) {
      rects.push({
        id: `${el.id}#${ap.index}`,
        centre: apertureCenter(el, ap.index),
        frame,
        halfW: ap.clearW / 2,
        halfH: ap.clearH / 2,
      });
    }
  }
  return rects;
}

/* The opening a knot is scored in, if it is scored in one. */
function openingIdOf(knot) {
  if (!knot.seq) {
    return null;
  }
  return `${knot.seq.elementId}#${knot.seq.apertureIndex ?? 0}`;
}

/*
 * Where segment p to q of the probe walk passes through `rect`'s opening, as
 * the fraction along the segment and the in-plane offsets, or null. A point
 * exactly on the plane counts as behind it.
 */
function throughOpening(p, q, rect) {
  const n = rect.frame.normal;
  const before = dot(sub(p, rect.centre), n);
  const after = dot(sub(q, rect.centre), n);
  if (before === after || (before > 0) === (after > 0)) {
    return null;
  }
  const f = before / (before - after);
  const at = add(p, scale(sub(q, p), f));
  const off = sub(at, rect.centre);
  const u = dot(off, rect.frame.widthAxis);
  const v = dot(off, rect.frame.heightAxis);
  if (Math.abs(u) > rect.halfW || Math.abs(v) > rect.halfH) {
    return null;
  }
  return { f, at, u, v };
}

/* Out of the opening across its nearer edge, plus the clearance. Sideways
 * wins a tie. */
function escapePoint(hit, rect, clearance) {
  const roomU = rect.halfW - Math.abs(hit.u);
  const roomV = rect.halfH - Math.abs(hit.v);
  const sideways = roomU <= roomV;
  const axis = sideways ? rect.frame.widthAxis : rect.frame.heightAxis;
  const sign = (sideways ? hit.u : hit.v) >= 0 ? 1 : -1;
  const push = (sideways ? roomU : roomV) + clearance;
  return add(hit.at, scale(axis, sign * push));
}

/* The dodge knot for the earliest foreign crossing on the piece a to b. */
function dodgeOnPiece(a, b, rects, tangentScale, clearance) {
  const piece = pieceBetween(a, b, tangentScale);
  if (!piece) {
    return null;
  }
  const own = [openingIdOf(a), openingIdOf(b)];
  const foreign = rects.filter((r) => !own.includes(r.id));
  let p = combine(piece, weightsAt(0));
  for (let step = 1; step <= CROSSING_STEPS; step += 1) {
    const q = combine(piece, weightsAt(step / CROSSING_STEPS));
    for (const rect of foreign) {
      const hit = throughOpening(p, q, rect);
      if (hit) {
        const t = (step - 1 + hit.f) / CROSSING_STEPS;
        return steeringKnot(escapePoint(hit, rect, clearance), normalize(combine(piece, slopeWeightsAt(t)), a.tangent), null);
      }
    }
    p = q;
  }
  return null;
}

function firstDodge(line, rects, tangentScale, clearance) {
  for (let i = 0; i + 1 < line.length; i += 1) {
    const knot = dodgeOnPiece(line[i], line[i + 1], rects, tangentScale, clearance);
    if (knot) {
      return { at: i + 1, knot };
    }
  }
  return null;
}

function dodgeForeignGates(doc, line) {
  const rects = openingRects(doc);
  if (rects.length < 2 || line.length < 2) {
    return line;
  }
  const tangentScale = doc.settings.tangentScale;
  /* The warning pass's barrier clearance, which depends on the class. */
  const clearance = tuningFor(trackClassOf(doc)).barrierClearance;
  const out = line.slice();
  for (let n = 0; n < MAX_DODGES; n += 1) {
    const dodge = firstDodge(out, rects, tangentScale, clearance);
    if (!dodge) {
      break;
    }
    out.splice(dodge.at, 0, dodge.knot);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The sampled line.                                                   */
/* ------------------------------------------------------------------ */

function radiusAt(piece, t) {
  const d1 = combine(piece, slopeWeightsAt(t));
  const d2 = combine(piece, bendWeightsAt(t));
  const speed = length(d1);
  const curvature = speed > 1e-9 ? length(cross(d1, d2)) / (speed * speed * speed) : 0;
  return curvature > 1e-9 ? 1 / curvature : Infinity;
}

/*
 * The whole line:
 *
 *   knots     buildKnots' output
 *   samples   [{ pos, s, radius, segment, t }]: s is arc length from the
 *             start in metres, radius the radius of curvature in metres
 *             (Infinity on a straight)
 *   segments  [{ a, b, from, to, degenerate }], one per consecutive knot
 *             pair, for the warning pass; a degenerate one has coincident
 *             knots and no samples, and warnings.js reports it
 *   length    total arc length in metres
 *   closed    the lap returns to its first element: pads placed or
 *             closeLoop asked for, and something in the sequence
 *   tightest  the sample with the smallest radius, first one on a tie
 *
 * Pieces share their end points, so every piece but the last stops one step
 * short of t = 1 and the next one supplies that point.
 */
export function buildPath(doc, { closeLoop = false } = {}) {
  const knots = buildKnots(doc, { closeLoop });
  const steps = Math.max(4, Math.round(doc.settings.samplesPerSegment));
  const tangentScale = doc.settings.tangentScale;
  const samples = [];
  const segments = [];
  if (knots.length < 2) {
    return { knots, samples, segments, length: 0, closed: false, tightest: null };
  }

  let travelled = 0;
  let last = null;
  let tightest = null;
  for (let i = 0; i + 1 < knots.length; i += 1) {
    const a = knots[i];
    const b = knots[i + 1];
    const piece = pieceBetween(a, b, tangentScale);
    segments.push({ a, b, from: i, to: i + 1, degenerate: !piece });
    if (!piece) {
      continue;
    }
    const upTo = i + 2 === knots.length ? steps : steps - 1;
    for (let j = 0; j <= upTo; j += 1) {
      const t = j / steps;
      const pos = combine(piece, weightsAt(t));
      const radius = radiusAt(piece, t);
      if (last) {
        travelled += dist(last, pos);
      }
      last = pos;
      samples.push({ pos, s: travelled, radius, segment: i, t });
      if (!tightest || radius < tightest.radius) {
        tightest = { radius, s: travelled, pos, segment: i };
      }
    }
  }

  return {
    knots,
    samples,
    segments,
    length: travelled,
    closed: (Boolean(startPadsOf(doc)) || closeLoop) && doc.sequence.length > 0,
    tightest,
  };
}
