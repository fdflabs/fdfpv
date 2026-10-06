/*
 * guide.js: ground paint for a field track, worked out from the racing
 * line's knots.
 *
 * The line is a taut string: straight through gates and points, wrapped as a
 * circular arc round each flag or cone on the side the pilot passes it. From
 * that string come evenly spaced samples, dashes with holes cut round gates
 * and poles, a few arrows that cue height, and a short comma of paint on the
 * fly side of each lone peg. Everything is plain numbers in the scene's
 * horizontal plane, so trackdoc.js and the Node checks can load it with no
 * imports and no DOM. The arithmetic order is fixed on purpose: outputs are
 * held to a golden record bit for bit.
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

/* Paint sizes in metres (angles in radians). Read live on every call, so a
 * patched value takes effect at once. The last eight keys are renderer
 * tessellation sizes nothing reads any more; they stay because the object
 * is exported as it is. */
export const GUIDE = {
  sample: 0.35,
  dash: 1.05,
  gap: 2.4,
  dashMin: 0.28,
  weld: 0.04,
  tailMin: 0.05,
  pegRadius: 0.25,
  holeGate: 1.15,
  holeFlag: 0.35,
  approach: 6.8,
  approachStep: 3.5,
  pastCue: 2.6,
  startAhead: [2.2, 4.5, 7.5],
  startS: 1.6,
  longRun: 70,
  runRetry: 2,
  highM: 2.0,
  highBand: 0.25,
  flagArrowClear: 4.2,
  wrapCluster: 5.0,
  arrowClear: 5.0,
  arrowClearRun: 14,
  wrapSpan: (120 * Math.PI) / 180,
  dashW: 0.30,
  arcW: 0.44,
  arrowLen: 1.85,
  arrowW: 0.52,
  arrowShaft: 0.16,
  arrowNotch: 0.12,
  pairGap: 0.98,
  markerClearance: 1.5,
};

const TAU = Math.PI * 2;

function wrapAngle(a) {
  const x = a % TAU;
  return x < 0 ? x + TAU : x;
}

function turn(from, to) {
  let d = wrapAngle(to) - wrapAngle(from);
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

const apart = (a, b) => Math.abs(turn(a, b));

/* A contact keeps the angle it was made from, unnormalised, because arcs
 * later start from it and cos(a) and cos(a mod TAU) differ in the last bit. */
function onCircle(c, angle) {
  return { x: c.x + c.r * Math.cos(angle), z: c.z + c.r * Math.sin(angle), angle };
}

/* First of the strictly smallest scores; with every score NaN, the first. */
function closest(items, score) {
  let best = items[0];
  let bestScore = Infinity;
  for (const item of items) {
    const v = score(item);
    if (v < bestScore) {
      best = item;
      bestScore = v;
    }
  }
  return best;
}

/* The circle a knot wraps round, or null when it is a plain point. */
function pegOf(k) {
  if (k.role !== 'marker' || !(k.radius > GUIDE.pegRadius) || k.poleX == null || k.poleZ == null) return null;
  const c = { x: k.poleX, z: k.poleZ, r: k.radius };
  c.apex = Math.atan2(k.z - c.z, k.x - c.x);
  return c;
}

/* Common tangents of two pegs, external pair then internal pair, as
 * [contact on a, contact on b]. */
function sharedTangents(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  if (!(d > 1e-6)) return [];
  const theta = Math.atan2(dz, dx);
  const out = [];
  for (const [k, flip] of [[(a.r - b.r) / d, 0], [(a.r + b.r) / d, Math.PI]]) {
    if (Math.abs(k) > 1) continue;
    const phi = Math.acos(k);
    for (const n of [theta + phi, theta - phi]) out.push([onCircle(a, n), onCircle(b, n + flip)]);
  }
  return out;
}

/* Where a line from p touches c, on the side nearer the apex; the apex
 * itself when p is on or inside the circle. */
function touchFrom(c, p, apexPoint) {
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d <= c.r + 1e-6) return { x: apexPoint.x, z: apexPoint.z, angle: c.apex };
  const theta = Math.atan2(dz, dx);
  const phi = Math.acos(Math.min(1, c.r / d));
  return closest([onCircle(c, theta + phi), onCircle(c, theta - phi)], (t) => apart(t.angle, c.apex));
}

function comma(c, sweep) {
  const dir = Math.sign(sweep || 1);
  const span = dir * GUIDE.wrapSpan;
  const start = c.apex - dir * (GUIDE.wrapSpan * 0.5);
  const ux = Math.cos(c.apex);
  const uz = Math.sin(c.apex);
  const count = Math.max(4, Math.ceil((c.r * GUIDE.wrapSpan) / GUIDE.sample));
  const kept = [];
  for (let s = 0; s <= count; s++) {
    const p = onCircle(c, start + span * (s / count));
    if (!((p.x - c.x) * ux + (p.z - c.z) * uz < 0)) kept.push({ x: p.x, z: p.z });
  }
  if (kept.length >= 3) return kept;
  const tight = GUIDE.wrapSpan * 0.5;
  const from = c.apex - dir * (tight * 0.5);
  const fallback = [];
  for (let s = 0; s <= 6; s++) {
    const p = onCircle(c, from + dir * tight * (s / 6));
    fallback.push({ x: p.x, z: p.z });
  }
  return fallback;
}

/* The taut string through every knot, plus a comma for each lone peg. */
function stringLine(knots, pegs) {
  const line = [];
  const add = (x, z) => {
    const last = line[line.length - 1];
    if (last && Math.hypot(x - last.x, z - last.z) < GUIDE.weld) {
      last.x = x;
      last.z = z;
    } else {
      line.push({ x, z });
    }
  };

  const enter = [];
  const leave = [];
  for (let i = 0; i + 1 < knots.length; i++) {
    const a = pegs[i];
    const b = pegs[i + 1];
    if (!a || !b) continue;
    const pairs = sharedTangents(a, b);
    if (!pairs.length) continue;
    const [ta, tb] = closest(pairs, ([pa, pb]) => apart(pa.angle, a.apex) + apart(pb.angle, b.apex));
    leave[i] = ta;
    enter[i + 1] = tb;
  }

  const commas = [];
  knots.forEach((k, i) => {
    const c = pegs[i];
    if (!c) {
      add(k.x, k.z);
      return;
    }
    const before = line[line.length - 1] ?? (i > 0 ? knots[i - 1] : k);
    const after = i + 1 < knots.length ? knots[i + 1] : k;
    const tin = enter[i] ?? touchFrom(c, before, k);
    const tout = leave[i] ?? touchFrom(c, after, k);
    const ccw = wrapAngle(c.apex - tin.angle) + wrapAngle(tout.angle - c.apex);
    const cw = wrapAngle(tin.angle - c.apex) + wrapAngle(c.apex - tout.angle);
    const sweep = ccw <= cw ? ccw : -cw;

    add(tin.x, tin.z);
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) * c.r) / GUIDE.sample));
    for (let j = 0; j <= steps; j++) {
      const p = onCircle(c, tin.angle + sweep * (j / steps));
      add(p.x, p.z);
    }
    add(tout.x, tout.z);

    const crowded = pegs.some((o, j) => o && j !== i && Math.hypot(c.x - o.x, c.z - o.z) < GUIDE.wrapCluster);
    if (!crowded) commas.push({ cx: c.x, cz: c.z, r: c.r, points: comma(c, sweep) });
  });
  return { line, commas };
}

function sample(x, z, s, hx, hz) {
  return { x, z, s, hx, hz };
}

/* Even resampling. The cursor walks forward step by step rather than being
 * recomputed from the segment start, and the golden record holds that. */
function resample(line) {
  const out = [sample(line[0].x, line[0].z, 0, 1, 0)];
  let along = 0;
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    let left = Math.hypot(dx, dz);
    if (left < 1e-9) continue;
    dx /= left;
    dz /= left;
    let { x, z } = a;
    while (carry + left >= GUIDE.sample) {
      const take = GUIDE.sample - carry;
      x += dx * take;
      z += dz * take;
      left -= take;
      along += take;
      carry = 0;
      out.push(sample(x, z, along, dx, dz));
    }
    carry += left;
    along += left;
  }

  const end = line[line.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(end.x - tail.x, end.z - tail.z) > GUIDE.tailMin) {
    const dx = end.x - tail.x;
    const dz = end.z - tail.z;
    const len = Math.hypot(dx, dz) || 1;
    out.push(sample(end.x, end.z, along, dx / len, dz / len));
  } else if (out.length >= 2) {
    tail.hx = out[out.length - 2].hx;
    tail.hz = out[out.length - 2].hz;
  }
  if (out.length >= 2) {
    out[0].hx = out[1].hx;
    out[0].hz = out[1].hz;
  }
  return out;
}

/* Position on the line at distance s; the heading is the chord between the
 * two samples either side, and s is the one asked for. */
function pointAt(samples, s) {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const copy = (p) => sample(p.x, p.z, p.s, p.hx, p.hz);
  if (s <= first.s) return copy(first);
  if (s >= last.s) return copy(last);
  const k = samples.findIndex((p, i) => i >= 1 && p.s >= s);
  if (k < 0) return copy(last);
  const a = samples[k - 1];
  const b = samples[k];
  const t = (s - a.s) / Math.max(1e-9, b.s - a.s);
  const ddx = b.x - a.x;
  const ddz = b.z - a.z;
  const len = Math.hypot(ddx, ddz) || 1;
  return sample(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, s, ddx / len, ddz / len);
}

function dashesOf(samples, blocked) {
  const out = [];
  if (samples.length < 2) return out;
  const period = GUIDE.dash + GUIDE.gap;
  let run = null;
  const close = () => {
    if (run && Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z) >= GUIDE.dashMin) {
      out.push({ ax: run.a.x, az: run.a.z, bx: run.b.x, bz: run.b.z });
    }
    run = null;
  };
  for (const p of samples) {
    if (p.s % period < GUIDE.dash && !blocked(p)) {
      if (run) run.b = p;
      else run = { a: p, b: p };
    } else {
      close();
    }
  }
  close();
  return out;
}

/* One lane means stay low, two means climb. Once a reading is set it only
 * flips when the height crosses the band, so a gate sitting right at the
 * threshold does not flicker the cue. */
function lanesFor(h, current) {
  if (current === undefined) return h >= GUIDE.highM ? 2 : 1;
  if (current === 2) return h < GUIDE.highM - GUIDE.highBand ? 1 : 2;
  return h >= GUIDE.highM + GUIDE.highBand ? 2 : 1;
}

function arrowsOf(knots, samples, blocked) {
  const arrows = [];
  if (samples.length < 2) return arrows;
  const clearOf = (p, r) => !arrows.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < r);
  const place = (p, kind, lanes) => arrows.push({ x: p.x, z: p.z, s: p.s, hx: p.hx, hz: p.hz, kind, lanes });

  let lane;
  for (const k of knots) {
    if (k.role !== 'aperture') continue;
    const near = closest(samples, (p) => Math.hypot(p.x - k.x, p.z - k.z));
    const lanes = lanesFor(k.y ?? 0, lane);
    const cue = lane === undefined || lanes !== lane;
    lane = lanes;
    if (!cue) continue;
    const offsets = near.s < GUIDE.startS
      ? GUIDE.startAhead
      : [
        -GUIDE.approach,
        -(GUIDE.approach + GUIDE.approachStep),
        -(GUIDE.approach + GUIDE.approachStep * 2),
        GUIDE.pastCue,
      ];
    let spot = null;
    for (const off of offsets) {
      const p = pointAt(samples, near.s + off);
      if (!blocked(p)) {
        spot = p;
        break;
      }
    }
    if (spot && clearOf(spot, GUIDE.arrowClear)) place(spot, 'gate', lanes);
  }

  const runLanes = lane ?? 1;
  let next = GUIDE.longRun;
  for (const p of samples) {
    if (p.s < next) continue;
    const recent = arrows.some((a) => a.s != null && Math.abs(a.s - p.s) < GUIDE.longRun);
    if (blocked(p) || recent || !clearOf(p, GUIDE.arrowClearRun)) {
      next = p.s + GUIDE.runRetry;
      continue;
    }
    place(p, 'run', runLanes);
    next = p.s + GUIDE.longRun;
  }
  return arrows;
}

function emptyGuide() {
  return { samples: [], dashes: [], arrows: [], flagArcs: [], length: 0 };
}

export function guideFromKnots(knots) {
  if (!knots || knots.length < 2) return emptyGuide();
  const pegs = Array.from(knots, pegOf);
  const { line, commas } = stringLine(knots, pegs);
  if (line.length < 2) return emptyGuide();

  const samples = resample(line);
  const holes = [];
  knots.forEach((k, i) => {
    if (k.role === 'aperture') holes.push({ x: k.x, z: k.z, r: GUIDE.holeGate, flag: false });
    else if (pegs[i]) holes.push({ x: pegs[i].x, z: pegs[i].z, r: GUIDE.holeFlag, flag: true });
  });
  const inHole = (p) => holes.some((h) => Math.hypot(p.x - h.x, p.z - h.z) <= h.r);
  const nearFlag = (p) => holes.some((h) => h.flag && Math.hypot(p.x - h.x, p.z - h.z) < GUIDE.flagArrowClear);

  return {
    samples,
    dashes: dashesOf(samples, inHole),
    arrows: arrowsOf(knots, samples, (p) => inHole(p) || nearFlag(p)),
    flagArcs: commas,
    length: samples[samples.length - 1].s,
  };
}
