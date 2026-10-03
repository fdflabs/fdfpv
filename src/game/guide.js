/*
 * guide.js: the marks on the ground that say where to fly.
 *
 * WHY THIS IS NOT THE BUILDER'S HERMITE. path.js draws a smooth cubic
 * through every knot with tangents taken off gate normals. That is the
 * right line for the plan view and for the curvature warning, because it
 * is forced through every opening square-on. It is the wrong line to
 * paint on the grass. A racer does not square up to every gate and then
 * balloon out to the next one; they pull a taut string around the flags
 * and go through the gates on the way. Painting the Hermite is how you
 * end up with a kart-track stripe that misses the side of a flag a
 * pilot would actually take.
 *
 * WHAT A RACER FLIES, as geometry:
 *
 *   a flag or a cone is a peg of radius `clearance`. The line is the
 *   taut string around that peg, on the pass side the sequence named;
 *   a gate is a point the string has to hit. The line goes through the
 *   opening's centre and does not try to wrap it;
 *   stacked wraps (split-S, spiral) are already offset knots, so they
 *   are points too. The ground mark is the plan of that wrap, which is
 *   the bit that says "go around, then back through".
 *
 * The paint is sparse on purpose. A dashed centreline, and arrows only
 * where the pilot has a height decision: two arrows side by side means
 * go up, one arrow means stay low. A comma on the fly side of an
 * isolated flag shows the pass. Close flags in a slalom get the dashes
 * only; wrapping every pole with a chevron is how the marks stacked.
 * A continuous stripe would read as a road.
 *
 * Scene frame, Y up, metres. This file does not import the builder and
 * it does not import Three.js: the field map must not pay for a track
 * document to draw its own figure eight, and the builder self test must
 * be able to check the line in Node.
 *
 * Every length in GUIDE is metres of paint, sized against the aircraft
 * that flies over it and the track it is drawn on: a 1.524 m MultiGP gate,
 * a quad, a lap of about 570 m.
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

const TAU = Math.PI * 2;

/* Paint layout. One named place, so a denser line is a decision rather
 * than four magic numbers that drift. */
export const GUIDE = {
  /* Sample spacing of the painted polyline, metres. Fine enough that a
   * 1.5 m flag wrap is a curve, coarse enough that a 570 m lap is a few
   * hundred points. */
  sample: 0.35,
  /* Dash on, gap, metres. Sparse: the dashes say "this way" without
   * paving a lane. */
  dash: 1.05,
  gap: 2.4,
  /* Shortest run of samples that is still a dash. Anything under it is the
   * painter stamping a dot on the lip of a hole rather than drawing a mark,
   * and a floor of four fifths of a sample is what drops a run of one
   * sample while keeping a run of two. */
  dashMin: 0.28,
  /* Two points closer together than this are the same point. The sampler
   * welds them rather than leaving a zero length segment, because the
   * ribbon takes its normal from the segment direction and a zero length
   * segment has none. */
  weld: 0.04,
  /* How far the end of the line has to be from the last resampled point
   * before it is worth a sample of its own. */
  tailMin: 0.05,
  /* A marker with a clearance smaller than this is a point on the line and
   * not a peg to wrap: a waypoint declares zero and is meant to be flown
   * through, not around. */
  pegRadius: 0.25,
  /* Keep the paint off the PVC. The start stands had their own, larger
   * hole while the pads were a knot on the line; the line does not go near
   * them any more. */
  holeGate: 1.15,
  holeFlag: 0.35,
  /* Arrow sits this far before a height decision, along the line. */
  approach: 6.8,
  /* How far further back the next try goes when that point is in a hole or
   * on a flag, and the last resort, which is just past the cue instead of
   * before it. */
  approachStep: 3.5,
  pastCue: 2.6,
  /* Leaving the start gate there is no line behind the cue to put an arrow
   * on, so these are tried ahead of it instead, in order. */
  startAhead: [2.2, 4.5, 7.5],
  /* How far into the lap still counts as being at the start gate. */
  startS: 1.6,
  /* A direction arrow on a long empty run with nothing else to aim at. */
  longRun: 70,
  /* How far the long run scan steps on when a candidate point is blocked.
   * Small enough to find the far side of a hole, big enough not to test
   * every sample twice. */
  runRetry: 2,
  /* Fly height at or above this, metres, is "go up". A standard 5x5
   * opening centres at 0.76 m; a 5x5 tower centres at 2.29 m. */
  highM: 2.0,
  /* Hysteresis either side of highM. Without it a course whose gates sit
   * a few centimetres apart across the threshold painted an arrow at every
   * one of them, alternating one lane and two. See lanesNext.
   *
   * 0.25 and not wider: a 5x5 tower centres at 2.29 m and MUST still read
   * as go up, so the upper edge has to stay below that. That leaves 1.75 to
   * 2.25 as the band a course has to cross to say anything. */
  highBand: 0.25,
  /* Do not sit an arrow this close to a flag pole. The wrap already
   * talks there, and a second mark is the stacked mess. */
  flagArrowClear: 4.2,
  /* Two painted wraps closer than this read as one blob. */
  wrapCluster: 5.0,
  /* Euclidean keep-out between arrows, metres. Height changes may sit
   * closer than a long-run filler. */
  arrowClear: 5.0,
  arrowClearRun: 14,
  /* Flag wrap: how much of the clearance circle is painted. A full ring
   * would say "go either side". 120 degrees on the fly side does not. */
  wrapSpan: (120 * Math.PI) / 180,
  /* Tessellated paint, metres. Sized to read from a 7.5 cm FPV camera
   * on mown turf, which is paler than meadow grass. */
  dashW: 0.30,
  arcW: 0.44,
  arrowLen: 1.85,
  arrowW: 0.52,
  arrowShaft: 0.16,
  /* Where the head meets the shaft, behind the arrow's centre. */
  arrowNotch: 0.12,
  /* Centre to centre of a dual "go up" pair. */
  pairGap: 0.98,
  /* What a marker gets when its sequence entry names no clearance. */
  markerClearance: 1.5,

};

function emptyGuide() {
  return {
    samples: [], dashes: [], arrows: [], flagArcs: [], length: 0,
  };
}

function hypot2(dx, dz) {
  return Math.hypot(dx, dz);
}

function wrapTau(a) {
  const x = a % TAU;
  return x < 0 ? x + TAU : x;
}

/* Shortest signed turn from a to b, in (-pi, pi]. */
function turnDelta(a, b) {
  let d = wrapTau(b) - wrapTau(a);
  if (d > Math.PI) {
    d -= TAU;
  }
  if (d <= -Math.PI) {
    d += TAU;
  }
  return d;
}

function circDist(a, b) {
  return Math.abs(turnDelta(a, b));
}

function angOf(cx, cz, x, z) {
  return Math.atan2(z - cz, x - cx);
}

function onCircle(cx, cz, r, ang) {
  return { x: cx + r * Math.cos(ang), z: cz + r * Math.sin(ang), ang };
}

function isPeg(k, g) {
  return k.role === 'marker' && k.radius > g.pegRadius && k.poleX != null && k.poleZ != null;
}

function pegCrowded(knots, i, g) {
  const a = knots[i];
  for (let j = 0; j < knots.length; j += 1) {
    if (j === i || !isPeg(knots[j], g)) {
      continue;
    }
    if (hypot2(a.poleX - knots[j].poleX, a.poleZ - knots[j].poleZ) < g.wrapCluster) {
      return true;
    }
  }
  return false;
}

/*
 * External (same-side) and internal (crossing) common tangents of two
 * circles. A racing line between two flags picks the pair whose contact
 * points sit closest to the two apexes, which is how an S-bend gets the
 * crossing tangent and a same-side pair gets the outer one, without a
 * separate case for passSide.
 */
function circleTangents(c1x, c1z, r1, c2x, c2z, r2) {
  const dx = c2x - c1x;
  const dz = c2z - c1z;
  const d = Math.hypot(dx, dz);
  const out = [];
  if (!(d > 1e-6)) {
    return out;
  }
  const theta = Math.atan2(dz, dx);
  const add = (k, flip) => {
    if (Math.abs(k) > 1) {
      return;
    }
    const phi = Math.acos(k);
    for (const sign of [1, -1]) {
      const n = theta + sign * phi;
      out.push({
        a: onCircle(c1x, c1z, r1, n),
        b: onCircle(c2x, c2z, r2, flip ? n + Math.PI : n),
      });
    }
  };
  add((r1 - r2) / d, false);
  add((r1 + r2) / d, true);
  return out;
}

/* Tangents from a point to a circle. Two of them, or none if the point
 * is inside. */
function pointTangents(px, pz, cx, cz, r) {
  const dx = px - cx;
  const dz = pz - cz;
  const d = Math.hypot(dx, dz);
  if (d <= r + 1e-6) {
    return [];
  }
  const theta = Math.atan2(dz, dx);
  const phi = Math.acos(Math.min(1, r / d));
  return [
    onCircle(cx, cz, r, theta + phi),
    onCircle(cx, cz, r, theta - phi),
  ];
}

function nearestTangent(cands, cx, cz, kx, kz) {
  const want = angOf(cx, cz, kx, kz);
  let best = cands[0];
  let bestD = Infinity;
  for (const t of cands) {
    const d = circDist(t.ang, want);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/*
 * Walk the circle from `from` to `to` via `via`, the short way that still
 * contains the apex. Returns signed sweep (positive ccw) starting at from.
 */
function sweepVia(from, via, to) {
  const ccw = wrapTau(via - from) + wrapTau(to - via);
  const cw = wrapTau(from - via) + wrapTau(via - to);
  if (ccw <= cw) {
    return ccw;
  }
  return -cw;
}

function pushPoint(pts, x, z, g) {
  const last = pts[pts.length - 1];
  if (last && hypot2(x - last.x, z - last.z) < g.weld) {
    last.x = x;
    last.z = z;
    return;
  }
  pts.push({ x, z });
}

function sampleArc(pts, cx, cz, r, fromAng, sweep, g) {
  const len = Math.abs(sweep) * r;
  const steps = Math.max(2, Math.ceil(len / g.sample));
  const arc = [];
  for (let i = 0; i <= steps; i += 1) {
    const ang = fromAng + sweep * (i / steps);
    const p = onCircle(cx, cz, r, ang);
    pushPoint(pts, p.x, p.z, g);
    arc.push({ x: p.x, z: p.z, ang });
  }
  return arc;
}

function knotPoint(k) {
  return { x: k.x, z: k.z };
}

/*
 * The taut string through the knots, as a dense polyline, plus the flag
 * wraps the painter will stroke more heavily.
 */
function pickPair(pairs, angA, angB) {
  let best = pairs[0];
  let bestD = Infinity;
  for (const pair of pairs) {
    const d = circDist(pair.a.ang, angA) + circDist(pair.b.ang, angB);
    if (d < bestD) {
      bestD = d;
      best = pair;
    }
  }
  return best;
}

function stringLine(knots, g) {
  const pts = [];
  const flagArcs = [];
  if (knots.length === 0) {
    return { pts, flagArcs };
  }

  const pegAt = (i) => (isPeg(knots[i], g) ? knots[i] : null);

  /* Adjacent peg-to-peg tangents, computed once so the inbound contact
   * on flag N is the same point as the outbound contact from flag N-1. */
  const inbound = new Array(knots.length);
  const outbound = new Array(knots.length);
  for (let i = 0; i < knots.length - 1; i += 1) {
    const a = pegAt(i);
    const b = pegAt(i + 1);
    if (!a || !b) {
      continue;
    }
    const pairs = circleTangents(a.poleX, a.poleZ, a.radius, b.poleX, b.poleZ, b.radius);
    if (!pairs.length) {
      continue;
    }
    const pair = pickPair(
      pairs,
      angOf(a.poleX, a.poleZ, a.x, a.z),
      angOf(b.poleX, b.poleZ, b.x, b.z),
    );
    outbound[i] = pair.a;
    inbound[i + 1] = pair.b;
  }

  for (let i = 0; i < knots.length; i += 1) {
    const k = knots[i];
    const peg = pegAt(i);
    if (!peg) {
      pushPoint(pts, k.x, k.z, g);
      continue;
    }

    const cx = peg.poleX;
    const cz = peg.poleZ;
    const r = peg.radius;
    const apex = knotPoint(peg);
    const apexAng = angOf(cx, cz, apex.x, apex.z);

    let tin = inbound[i];
    if (!tin) {
      const prev = pts.length ? pts[pts.length - 1] : (i > 0 ? knotPoint(knots[i - 1]) : apex);
      const cands = pointTangents(prev.x, prev.z, cx, cz, r);
      tin = cands.length ? nearestTangent(cands, cx, cz, apex.x, apex.z) : { ...apex, ang: apexAng };
    }

    let tout = outbound[i];
    if (!tout) {
      const next = i + 1 < knots.length ? knotPoint(knots[i + 1]) : apex;
      const cands = pointTangents(next.x, next.z, cx, cz, r);
      tout = cands.length ? nearestTangent(cands, cx, cz, apex.x, apex.z) : { ...apex, ang: apexAng };
    }

    const sweep = sweepVia(tin.ang, apexAng, tout.ang);
    pushPoint(pts, tin.x, tin.z, g);
    sampleArc(pts, cx, cz, r, tin.ang, sweep, g);
    pushPoint(pts, tout.x, tout.z, g);

    /* The painted wrap is a window on that arc, centred on the apex, so
     * a long wrap around a hairpin does not ring the flag and a short
     * graze still gets a readable comma. */
    const dir = Math.sign(sweep || 1);
    const wrapFrom = apexAng - dir * (g.wrapSpan * 0.5);
    const wrapSweep = dir * g.wrapSpan;
    const ax = Math.cos(apexAng);
    const az = Math.sin(apexAng);
    const paint = [];
    const wrapSteps = Math.max(4, Math.ceil((r * g.wrapSpan) / g.sample));
    for (let s = 0; s <= wrapSteps; s += 1) {
      const ang = wrapFrom + wrapSweep * (s / wrapSteps);
      const p = onCircle(cx, cz, r, ang);
      /* Never paint the back of the flag. A 120 degree window centred on
       * the apex can still nibble the wrong hemisphere on a tight wrap,
       * and that nibble is exactly the "which side?" confusion this mark
       * exists to prevent. */
      if ((p.x - cx) * ax + (p.z - cz) * az < 0) {
        continue;
      }
      paint.push(p);
    }
    if (paint.length < 3) {
      paint.length = 0;
      const tight = g.wrapSpan * 0.5;
      const from = apexAng - dir * (tight * 0.5);
      const steps = 6;
      for (let s = 0; s <= steps; s += 1) {
        paint.push(onCircle(cx, cz, r, from + dir * tight * (s / steps)));
      }
    }
    /* A slalom of close flags already has the dashed string weaving
     * through. Painting a comma on every pole stacks the marks. Isolated
     * flags keep the wrap so the pass side is still named. */
    if (pegCrowded(knots, i, g)) {
      continue;
    }
    flagArcs.push({
      cx,
      cz,
      r,
      points: paint.map((p) => ({ x: p.x, z: p.z })),
    });
  }

  return { pts, flagArcs };
}

function resample(pts, g) {
  const spacing = g.sample;
  const samples = [];
  if (pts.length === 0) {
    return samples;
  }
  samples.push({ x: pts[0].x, z: pts[0].z, s: 0, hx: 1, hz: 0 });
  let s = 0;
  let acc = 0;
  for (let i = 1; i < pts.length; i += 1) {
    let ax = pts[i - 1].x;
    let az = pts[i - 1].z;
    const bx = pts[i].x;
    const bz = pts[i].z;
    let dx = bx - ax;
    let dz = bz - az;
    let seg = Math.hypot(dx, dz);
    if (seg < 1e-9) {
      continue;
    }
    dx /= seg;
    dz /= seg;
    while (acc + seg >= spacing) {
      const take = spacing - acc;
      ax += dx * take;
      az += dz * take;
      seg -= take;
      s += take;
      acc = 0;
      samples.push({ x: ax, z: az, s, hx: dx, hz: dz });
    }
    acc += seg;
    s += seg;
  }
  const last = pts[pts.length - 1];
  const prev = samples[samples.length - 1];
  if (hypot2(last.x - prev.x, last.z - prev.z) > g.tailMin) {
    const dx = last.x - prev.x;
    const dz = last.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    samples.push({
      x: last.x, z: last.z, s, hx: dx / len, hz: dz / len,
    });
  } else {
    prev.hx = samples.length > 1 ? samples[samples.length - 2].hx : prev.hx;
    prev.hz = samples.length > 1 ? samples[samples.length - 2].hz : prev.hz;
  }
  /* Headings on the first sample. */
  if (samples.length > 1) {
    samples[0].hx = samples[1].hx;
    samples[0].hz = samples[1].hz;
  }
  return samples;
}

function inHole(x, z, holes) {
  for (const h of holes) {
    if (hypot2(x - h.x, z - h.z) <= h.r) {
      return true;
    }
  }
  return false;
}

function layoutDashes(samples, holes, g) {
  const dashes = [];
  if (samples.length < 2) {
    return dashes;
  }
  const period = g.dash + g.gap;
  let run = null;
  const flush = () => {
    if (run && hypot2(run.bx - run.ax, run.bz - run.az) >= g.dashMin) {
      dashes.push(run);
    }
    run = null;
  };
  for (let i = 0; i < samples.length; i += 1) {
    const p = samples[i];
    const on = (p.s % period) < g.dash;
    const clear = !inHole(p.x, p.z, holes);
    if (on && clear) {
      if (!run) {
        run = { ax: p.x, az: p.z, bx: p.x, bz: p.z };
      } else {
        run.bx = p.x;
        run.bz = p.z;
      }
    } else {
      flush();
    }
  }
  flush();
  return dashes;
}

function nearestSample(samples, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < samples.length; i += 1) {
    const d = hypot2(samples[i].x - x, samples[i].z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function sampleAtS(samples, s) {
  if (!samples.length) {
    return null;
  }
  if (s <= samples[0].s) {
    return samples[0];
  }
  const last = samples[samples.length - 1];
  if (s >= last.s) {
    return last;
  }
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].s >= s) {
      const a = samples[i - 1];
      const b = samples[i];
      const t = (s - a.s) / Math.max(1e-9, b.s - a.s);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        s,
        hx: dx / len,
        hz: dz / len,
      };
    }
  }
  return last;
}

function farAlong(arrows, s, min) {
  for (const a of arrows) {
    if (a.s != null && Math.abs(a.s - s) < min) {
      return false;
    }
  }
  return true;
}

function farFrom(arrows, x, z, min) {
  for (const a of arrows) {
    if (hypot2(a.x - x, a.z - z) < min) {
      return false;
    }
  }
  return true;
}

function lanesFor(y, g) {
  return (y ?? 0) >= g.highM ? 2 : 1;
}

/*
 * The lane cue WITH hysteresis, given what it currently reads.
 *
 * lanesFor is a hard edge at highM, and a course whose gates sit either
 * side of it by a few centimetres flipped the cue at every gate: an arrow
 * at each one, alternating one and two, which says "change height now" over
 * and over on a stretch that is essentially level. A height cue that fires
 * constantly is not a cue.
 *
 * Going UP has to clear highM + band, coming back DOWN has to fall below
 * highM - band, so a course has to mean it. The band is generous on
 * purpose: 0.45 m is over half a gate opening, and anything inside it is
 * not a height decision a pilot makes with the sticks.
 */
function lanesNext(y, current, g) {
  const h = y ?? 0;
  if (current == null) {
    return lanesFor(h, g);
  }
  if (current === 2) {
    return h < g.highM - g.highBand ? 1 : 2;
  }
  return h >= g.highM + g.highBand ? 2 : 1;
}

function tooCloseToFlag(x, z, holes, g) {
  for (const h of holes) {
    if (h.kind === 'flag' && hypot2(x - h.x, z - h.z) < g.flagArrowClear) {
      return true;
    }
  }
  return false;
}

function pickArrowPoint(samples, at, holes, after, g) {
  const deltas = after
    ? g.startAhead
    : [-g.approach, -(g.approach + g.approachStep), -(g.approach + g.approachStep * 2), g.pastCue];
  for (const d of deltas) {
    const p = sampleAtS(samples, at.s + d);
    if (!p) {
      continue;
    }
    if (inHole(p.x, p.z, holes) || tooCloseToFlag(p.x, p.z, holes, g)) {
      continue;
    }
    return p;
  }
  return null;
}

/*
 * Arrows are a height cue, not a breadcrumb. Two side by side: go up.
 * One: stay low. Placed on a height change, at the start of the lap,
 * and on a long empty run. Never on a flag.
 */
function layoutArrows(samples, cues, holes, g) {
  const arrows = [];
  if (samples.length < 2) {
    return arrows;
  }

  const cueS = [];
  for (const cue of cues) {
    if (cue.kind === 'flag') {
      continue;
    }
    const i = nearestSample(samples, cue.x, cue.z);
    cueS.push({ cue, at: samples[i], s: samples[i].s });
  }

  /*
   * The lane cue as it stands at this point in the lap. This is SEPARATE
   * from the last arrow actually painted: it used to be one variable, so a
   * cue whose arrow was rejected for sitting too close to its neighbour
   * left the state believing the height had not changed, and the change was
   * then re-announced at the NEXT gate, which is how a cue for one climb
   * ended up drawn somewhere down the following straight.
   */
  let laneState = null;
  let lastLanes = null;

  const tryPush = (p, kind, lanes, min) => {
    if (!p || !farFrom(arrows, p.x, p.z, min)) {
      return false;
    }
    arrows.push({
      x: p.x, z: p.z, s: p.s, hx: p.hx, hz: p.hz, kind, lanes,
    });
    lastLanes = lanes;
    return true;
  };

  /* Every cue is a gate or a flag now. The 'start' special case that used
   * to be threaded through this loop has gone with the start knot: it made
   * the first arrow unconditional and put it AFTER its hole, which is what
   * an arrow leaving the grid wants. The first cue on the line is now the
   * first gate, and `initial` already makes that one unconditional. */
  for (const row of cueS) {
    const lanes = lanesNext(row.cue.y, laneState, g);
    const initial = laneState == null;
    const changed = laneState != null && lanes !== laneState;
    /* Updated whether or not an arrow lands, so a rejected one is dropped
     * rather than deferred onto the next gate. */
    laneState = lanes;
    if (!(initial || changed)) {
      continue;
    }
    const p = pickArrowPoint(samples, row.at, holes, row.s < g.startS, g);
    tryPush(p, 'gate', lanes, g.arrowClear);
  }

  let next = g.longRun;
  for (const p of samples) {
    if (p.s < next) {
      continue;
    }
    if (inHole(p.x, p.z, holes) || tooCloseToFlag(p.x, p.z, holes, g)
        || !farAlong(arrows, p.s, g.longRun)) {
      next = p.s + g.runRetry;
      continue;
    }
    const lanes = laneState ?? lastLanes ?? 1;
    if (tryPush(p, 'run', lanes, g.arrowClearRun)) {
      next = p.s + g.longRun;
    } else {
      next = p.s + g.runRetry;
    }
  }
  return arrows;
}

function holesFromKnots(knots, g) {
  const holes = [];
  for (const k of knots) {
    if (k.role === 'aperture') {
      holes.push({ x: k.x, z: k.z, r: g.holeGate, kind: 'gate' });
    } else if (isPeg(k, g)) {
      holes.push({ x: k.poleX, z: k.poleZ, r: g.holeFlag, kind: 'flag' });
    }
  }
  return holes;
}

function cuesFromKnots(knots) {
  const cues = [];
  for (const k of knots) {
    const y = k.y ?? 0;
    if (k.role === 'aperture') {
      cues.push({ x: k.x, z: k.z, y, kind: 'gate' });
    } else if (k.role === 'marker') {
      cues.push({ x: k.x, z: k.z, y, kind: 'flag' });
    }
  }
  return cues;
}

function finishGuide(pts, flagArcs, holes, cues, g) {
  if (pts.length < 2) {
    return emptyGuide();
  }
  const samples = resample(pts, g);
  const dashes = layoutDashes(samples, holes, g);
  const arrows = layoutArrows(samples, cues, holes, g);
  const length = samples.length ? samples[samples.length - 1].s : 0;
  return {
    samples, dashes, arrows, flagArcs, length,
  };
}

/*
 * Knots in scene XZ:
 *   role     'aperture' | 'marker' | 'wrap' | 'finish'
 *
 * There is no 'start' role. src/trackbuilder/path.js stopped putting the
 * pads on the racing line, because the pads are a place to park and not a
 * hole, and nothing has produced one since. The branches that used to read
 * it are gone rather than left standing: a dead branch naming a role the
 * producer cannot emit is how the pads get put back on the line by someone
 * fixing a missing start hole.
 *   x, z     fly point (already offset, for a marker)
 *   y        fly height, metres, used to pick one arrow or two
 *   poleX, poleZ, radius   only on markers
 */
export function guideFromKnots(knots) {
  const g = GUIDE;
  if (!knots || knots.length < 2) {
    return emptyGuide();
  }
  const { pts, flagArcs } = stringLine(knots, g);
  return finishGuide(pts, flagArcs, holesFromKnots(knots, g), cuesFromKnots(knots), g);
}

