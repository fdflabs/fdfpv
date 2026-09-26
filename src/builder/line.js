/*
 * line.js: the racing line through a built course, the speed it implies for
 * one aircraft, and what is wrong with the course's geometry.
 *
 * No Three.js and no DOM, so scripts/build-selftest.js checks all of it in
 * Node; buildmode.js draws what this returns and hands it the world.
 *
 * THE LINE. A closed curve through every gate's opening in flying order,
 * from the start gate round the lap and back to it: between two gates a
 * cubic Hermite whose end tangents are the gates' own directions of travel,
 * each scaled by the track builder's tangent scale (src/trackbuilder/
 * elements.js TUNING.tangentScale, derived there) times the distance
 * between them. It is the field builder's line (src/trackbuilder/path.js)
 * in three dimensions, since a built gate stands at any orientation. A
 * course of one gate is a lap of leaving it and coming back through it
 * (src/game/race.js leftGate), so its line is a circle out of the gate and
 * back into it, at the radius the aircraft flies at its top speed, on
 * whichever side of the gate has more air under it.
 *
 * THE SPEED MODEL. At every point of the line the radius of curvature r is
 * read off the curve's own derivatives, and the speed the line implies is
 * the fastest the aircraft can go round that radius:
 *
 *     v(r) = min(topSpeed, sqrt(aLat * r))
 *
 * aLat is the aircraft's greatest sideways acceleration, which is its
 * greatest turn rate at a speed, aLat / v. A quad turns by tilting its
 * thrust while holding its weight up: aLat = sqrt(T^2 - W^2) per unit
 * mass, T its thrust to weight at 1 g (configs/airframes.js) and W the
 * weight it is flown at (its gravityBase). A fixed wing turns by banking,
 * and every wing's own derivation uses the same 60 degree bank for a hard
 * turn (tests/glider-thresholds.json g7_turn, the wing tuning's W6):
 * aLat = g tan 60. topSpeed is the level speed at full throttle.
 *
 * WHERE THE LINE ASKS TOO MUCH. A fixed wing cannot fly slower than it
 * stalls, and banked at 60 degrees it pulls two g, so it stalls at sqrt 2
 * times its level stall: it cannot turn tighter than rMin = 2 Vs^2 / aLat.
 * A quad can always slow down, so no radius is impossible for it; its
 * limit is the one the field track builder already warns at for its track
 * class (TUNING.minCurveRadius), a turn too tight to race. The line is
 * marked wherever r < rMin.
 *
 * Not modelled, on purpose: braking and accelerating between corners,
 * climbing and diving, drag and the wind. The line's colour is the speed
 * each corner allows on its own, which is what an author moving a gate
 * needs to see.
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

import { TUNING, tuningFor } from '../trackbuilder/elements.js';

const G0 = 9.80665;
/* A fixed wing's hard turn, radians of bank. See the header. */
const WING_BANK = 60 * Math.PI / 180;
/* The line is sampled at about this many metres. */
const SAMPLE_STEP = 1;
const SEGMENT_SAMPLES_MIN = 16;
const SEGMENT_SAMPLES_MAX = 1200;

/*
 * What an aircraft can do, from configs/airframes.js: its span (twice the
 * sweep radius src/game/collide.js derives from the same dims), its top
 * speed, its greatest sideways acceleration and the tightest radius it may
 * be asked to fly. See the header.
 */
export function craftLimits(af) {
  const span = 2 * (af.dims.arm + (af.dims.hullR ?? af.dims.propR));
  const weight = (af.gravityBase ?? 1) * G0;
  if (af.fixedWing) {
    const aLat = weight * Math.tan(WING_BANK);
    const vMin = af.stall * Math.sqrt(1 / Math.cos(WING_BANK));
    return {
      id: af.id, span, topSpeed: af.topSpeed, aLat, rMin: (vMin * vMin) / aLat, fixedWing: true,
    };
  }
  const thrust = af.thrustToWeight * G0;
  return {
    id: af.id,
    span,
    topSpeed: af.topSpeed,
    aLat: Math.sqrt(Math.max(0, thrust * thrust - weight * weight)),
    rMin: tuningFor(af.trackClass).minCurveRadius,
    fixedWing: false,
  };
}

/* The speed the line implies at a radius, m/s. */
export function speedAt(craft, r) {
  return Math.min(craft.topSpeed, Math.sqrt(craft.aLat * r));
}

/* ------------------------------------------------------------------ */
/* Vectors, plain { x, y, z }                                          */
/* ------------------------------------------------------------------ */

const add = (a, b, s = 1) => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/* ------------------------------------------------------------------ */
/* The line                                                            */
/* ------------------------------------------------------------------ */

/* One Hermite from gate a to gate b, sampled from t = 0 up to but not
 * including t = 1, which is the next segment's first sample. */
function hermite(a, b, seg, craft, out) {
  const p0 = a.centre;
  const p1 = b.centre;
  const chord = len(sub(p1, p0));
  const k = TUNING.tangentScale * chord;
  const m0 = { x: a.axes.travel.x * k, y: a.axes.travel.y * k, z: a.axes.travel.z * k };
  const m1 = { x: b.axes.travel.x * k, y: b.axes.travel.y * k, z: b.axes.travel.z * k };
  /* The arc is never longer than the Bezier hull round it. */
  const hull = chord + (2 * k) / 3;
  const n = Math.min(SEGMENT_SAMPLES_MAX, Math.max(SEGMENT_SAMPLES_MIN, Math.ceil(hull / SAMPLE_STEP)));
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const d00 = 6 * t2 - 6 * t;
    const d10 = 3 * t2 - 4 * t + 1;
    const d01 = -6 * t2 + 6 * t;
    const d11 = 3 * t2 - 2 * t;
    const e00 = 12 * t - 6;
    const e10 = 6 * t - 4;
    const e01 = -12 * t + 6;
    const e11 = 6 * t - 2;
    const at = (c0, c1, c2, c3) => ({
      x: c0 * p0.x + c1 * m0.x + c2 * p1.x + c3 * m1.x,
      y: c0 * p0.y + c1 * m0.y + c2 * p1.y + c3 * m1.y,
      z: c0 * p0.z + c1 * m0.z + c2 * p1.z + c3 * m1.z,
    });
    const p = at(h00, h10, h01, h11);
    const d1 = at(d00, d10, d01, d11);
    const d2 = at(e00, e10, e01, e11);
    const speed = len(d1);
    const bend = len(cross(d1, d2));
    const r = bend > 1e-12 ? (speed * speed * speed) / bend : Infinity;
    out.push(sampleOf(p, speed > 1e-9 ? { x: d1.x / speed, y: d1.y / speed, z: d1.z / speed } : a.axes.travel, r, seg, craft));
  }
}

function sampleOf(p, tangent, r, seg, craft) {
  return {
    x: p.x, y: p.y, z: p.z, tangent, r, v: speedAt(craft, r), ok: !(r < craft.rMin), seg,
  };
}

/* A course of one gate: a circle out of it and back into it, at the radius
 * flown at top speed, in the plane of its travel and its across axis, on
 * whichever side has the higher ground furthest below it. */
function loopOf(g, craft, heightAt, out) {
  const R = Math.max(craft.rMin, (craft.topSpeed * craft.topSpeed) / craft.aLat);
  const t = g.axes.travel;
  let best = null;
  for (const side of [1, -1]) {
    const s = { x: g.axes.across.x * side, y: g.axes.across.y * side, z: g.axes.across.z * side };
    let low = Infinity;
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * 2 * Math.PI;
      const p = add(add(g.centre, t, R * Math.sin(a)), s, R * (1 - Math.cos(a)));
      low = Math.min(low, p.y - heightAt(p.x, p.z));
    }
    if (!best || low > best.low) {
      best = { s, low };
    }
  }
  const n = Math.min(SEGMENT_SAMPLES_MAX, Math.max(SEGMENT_SAMPLES_MIN, Math.ceil((2 * Math.PI * R) / SAMPLE_STEP)));
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * 2 * Math.PI;
    const p = add(add(g.centre, t, R * Math.sin(a)), best.s, R * (1 - Math.cos(a)));
    const tangent = add({ x: t.x * Math.cos(a), y: t.y * Math.cos(a), z: t.z * Math.cos(a) }, best.s, Math.sin(a));
    out.push(sampleOf(p, tangent, R, 0, craft));
  }
}

/*
 * The racing line through `gates` (course.js raceGatesOf) for `craft`
 * (craftLimits). Returns { samples, gateAt }: the samples round the closed
 * lap from the start gate, each { x, y, z, tangent, r, v, ok, seg } with seg
 * the index of the gate it leaves from, and gateAt[i] the index of the
 * sample that is gate i's opening centre, exactly.
 */
export function racingLine(gates, craft, heightAt) {
  const samples = [];
  const gateAt = [];
  if (!gates.length) {
    return { samples, gateAt };
  }
  if (gates.length === 1) {
    gateAt.push(0);
    loopOf(gates[0], craft, heightAt, samples);
    return { samples, gateAt };
  }
  gates.forEach((g, i) => {
    gateAt.push(samples.length);
    hermite(g, gates[(i + 1) % gates.length], i, craft, samples);
  });
  return { samples, gateAt };
}

/* ------------------------------------------------------------------ */
/* Geometry warnings                                                   */
/* ------------------------------------------------------------------ */

/* The line is walked at this step for the ground and the solids: half a
 * metre is thinner than any wall or rock the valleys are built from. */
const CLIP_STEP = 0.5;
/* An opening must be this much wider than the aircraft's span: a tenth of
 * the span spare either side, room to fly it rather than thread it. */
const SPAN_ROOM = 1.2;
/* Where on an opening the blocked check looks: its centre and eight points
 * at this fraction of the way to its edges. */
const OPENING_PROBE = 0.8;
/* A chord that runs against a gate's travel by more than this cosine is
 * running against it, not across it. */
const AGAINST_COS = -0.1;

/*
 * Everything wrong with the course's geometry for `craft`, as a list of
 * { code, gate, next, pos, value, limit }: gate is the lap index the
 * warning belongs to (the gate a segment leaves from), next the one it
 * goes to where there is one, pos where to mark it in the scene, value
 * and limit the numbers the rule compared, in metres.
 *
 * `world` is the map: heightAt(x, z) the ground, solidAt(x, y, z) whether
 * a point is inside one of the map's own solids. The built gates are not
 * the map's, and neither are its trees: see buildmode.js.
 *
 * THE RULES.
 *   blocked    the gate's opening is inside rock or a building: its centre
 *              or one of eight points OPENING_PROBE of the way to its edges
 *              is under the ground or inside a solid.
 *   clips      the line between two gates goes into the ground or into a
 *              solid, walked at CLIP_STEP; marked where it first does.
 *   tight      the line between two gates turns tighter than the craft's
 *              rMin; marked at the tightest point.
 *   close      two gates in a row are nearer than the craft's rMin: there
 *              is no room for any turn between them.
 *   small      the opening is narrower than SPAN_ROOM times the craft's
 *              span.
 *   backwards  the line arrives at the gate from in front of it and leaves
 *              it behind: the chords from the gate before and to the gate
 *              after both run against its travel, so flying the lap straight
 *              through it is flying it backwards. Needs three gates: on two,
 *              the chord in is the chord out reversed.
 */
export function lineWarnings(gates, line, craft, world) {
  const out = [];
  const n = gates.length;
  gates.forEach((g, i) => {
    const { across, up } = g.axes;
    const hw = (g.aperture.clearW / 2) * OPENING_PROBE;
    const hh = (g.aperture.clearH / 2) * OPENING_PROBE;
    for (const u of [0, -1, 1]) {
      for (const w of [0, -1, 1]) {
        const p = add(add(g.centre, across, u * hw), up, w * hh);
        if (p.y < world.heightAt(p.x, p.z) || world.solidAt(p.x, p.y, p.z)) {
          out.push({ code: 'blocked', gate: i, pos: g.centre });
          return;
        }
      }
    }
  });
  gates.forEach((g, i) => {
    if (g.aperture.clearW < craft.span * SPAN_ROOM) {
      out.push({
        code: 'small', gate: i, pos: g.centre, value: g.aperture.clearW, limit: craft.span * SPAN_ROOM,
      });
    }
  });
  if (n >= 2) {
    for (let i = 0; i < (n === 2 ? 1 : n); i += 1) {
      const a = gates[i].centre;
      const b = gates[(i + 1) % n].centre;
      const d = len(sub(b, a));
      if (d < craft.rMin) {
        out.push({
          code: 'close', gate: i, next: (i + 1) % n, pos: add(a, sub(b, a), 0.5), value: d, limit: craft.rMin,
        });
      }
    }
  }
  if (n >= 3) {
    gates.forEach((g, i) => {
      const prev = gates[(i + n - 1) % n].centre;
      const next = gates[(i + 1) % n].centre;
      const into = sub(g.centre, prev);
      const onto = sub(next, g.centre);
      const t = g.axes.travel;
      if (dot(into, t) < AGAINST_COS * len(into) && dot(onto, t) < AGAINST_COS * len(onto)) {
        out.push({ code: 'backwards', gate: i, pos: g.centre });
      }
    });
  }
  segmentWarnings(gates, line, craft, world, out);
  return out;
}

/* The two rules read along the line: clips and tight, once per segment. */
function segmentWarnings(gates, line, craft, world, out) {
  const s = line.samples;
  if (!s.length) {
    return;
  }
  const segs = new Map();
  const segOf = (k) => {
    if (!segs.has(k)) {
      segs.set(k, { clip: null, tight: null });
    }
    return segs.get(k);
  };
  for (let i = 0; i < s.length; i += 1) {
    const a = s[i];
    const b = s[(i + 1) % s.length];
    const w = segOf(a.seg);
    if (!a.ok && (!w.tight || a.r < w.tight.r)) {
      w.tight = a;
    }
    if (w.clip) {
      continue;
    }
    const d = sub(b, a);
    const steps = Math.max(1, Math.ceil(len(d) / CLIP_STEP));
    for (let k = 0; k < steps; k += 1) {
      const p = add(a, d, k / steps);
      if (p.y < world.heightAt(p.x, p.z) || world.solidAt(p.x, p.y, p.z)) {
        w.clip = p;
        break;
      }
    }
  }
  const n = gates.length;
  for (const [seg, w] of [...segs].sort((x, y) => x[0] - y[0])) {
    const next = (seg + 1) % n;
    if (w.clip) {
      out.push({ code: 'clips', gate: seg, next, pos: { x: w.clip.x, y: w.clip.y, z: w.clip.z } });
    }
    if (w.tight) {
      out.push({
        code: 'tight', gate: seg, next, pos: { x: w.tight.x, y: w.tight.y, z: w.tight.z }, value: w.tight.r, limit: craft.rMin,
      });
    }
  }
}
