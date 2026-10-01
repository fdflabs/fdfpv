/*
 * routes.js: where a scripted attacker of the war mode is at any room
 * millisecond (docs/WARFARE-PLAN.md section 4.2). Pure: plain arrays, no
 * three.js, no clock, so the room (edge/rooms/war.js) and every client
 * call the same function on the same numbers and draw the same path. That
 * is why a scripted attacker's pose is never sent: the room sends its
 * birth ({ id, kind, route, t0, k, n, err, target }) and its death, and
 * everything between is this file.
 *
 * Positions are scene world metres, y up, the POSE frame
 * (src/share/roomwire.js). An attitude is the quaternion turning the
 * Three.js body's nose (-z) onto the direction of flight, the shortest arc,
 * so a level heading is a pure yaw.
 *
 * DETERMINISM. Only + - * / and Math.sqrt, which IEEE 754 fixes to the
 * bit, so the answer is the same in every engine; the orbit and the weave
 * turn through sinDet below, a polynomial, never Math.sin or Math.cos,
 * whose last bits are each engine's own.
 *
 * What each kind does with its route (section 3):
 *
 *   scout   the route, then circles ORBIT_R to the left of its last point
 *           for its orbit time, then flies on straight ahead for LEAVE_M
 *           and is gone ('leave')
 *   loiter  the route at cruise, one whole circle at its last point, then
 *           a straight dive at dive speed onto the aim point ('arrive')
 *   strike, fpv, boat
 *           the route and on to the aim point ('arrive')
 *   hunter  steered by the room (edge/rooms/war.js); its route gives only
 *           where it is born
 *   jammer  the route, then parks at its last point for good ('park')
 *
 * and any of them but a hunter whose birth record carries `wire` (room
 * ms, edge/rooms/war.js from wires.js wireStrike) flies into a power
 * line there and ends ('wire').
 *
 * The aim point is the target's `at` moved sideways by `err` metres (the
 * seeded error the room draws once the scouts are dead): an attacker
 * whose |err| is more than the target's hitR (else its r) misses it. A group's k of n
 * flies `gap` metres to the side of the next, closing on the aim point as
 * it gets there; fpv and boats weave, dying away at the end.
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

/* A defender's warhead: any part box this close to an attacker's centre
 * (section 4.3, tag's BUBBLE_M). */
export const BLAST_M = 6;

/* The kinds, in the order of the AGENTS message's kind byte. */
export const KINDS = ['scout', 'loiter', 'strike', 'fpv', 'hunter', 'boat', 'jammer', 'decoy'];

/*
 * Each kind's flight, m/s and metres: speed, the loiterer's dive, the
 * circle's radius and (the scout's) its time, the weave's amplitude and
 * period, and a group's spacing. The speeds are 0.7 of section 3's (the
 * owner, 2026-09-29: "make all enemy drones 30% slower"); the circles
 * and weaves keep their shape, so a weave's period is section 3's over
 * 0.7 and a circle's radius is unchanged (it turns 0.7 as fast).
 */
export const SPEED_SCALE = 0.7;
export const KIND = {
  scout: { speed: 10.5, orbitR: 300, orbitMs: 90000, gap: 60 },
  loiter: { speed: 19.6, dive: 28, orbitR: 200, gap: 40 },
  strike: { speed: 26.6, gap: 25 },
  fpv: { speed: 21, weaveM: 8, weaveMs: 3000 / SPEED_SCALE, gap: 6 },
  hunter: { speed: 25.2, gap: 10 },
  boat: { speed: 9.8, weaveM: 15, weaveMs: 8000 / SPEED_SCALE, gap: 20 },
  jammer: { speed: 3.5, gap: 30 },
  /* A Striker's flight and look, worth nothing where it arrives. */
  decoy: { speed: 26.6, gap: 25 },
};

/* How far a scout flies on after its circle before it is gone: 200 s at
 * its speed, as before it was slowed. */
export const LEAVE_M = 2100;

const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const PI = 3.141592653589793;

/*
 * sin(x) to about 1e-9 on any engine: reduced to [-pi/2, pi/2] and a
 * Taylor series to x^15 (the last term there is under 1e-10).
 */
export function sinDet(x) {
  let r = x - Math.round(x / TWO_PI) * TWO_PI;
  if (r > HALF_PI) {
    r = PI - r;
  } else if (r < -HALF_PI) {
    r = -PI - r;
  }
  const r2 = r * r;
  let term = r;
  let sum = r;
  for (let n = 2; n <= 14; n += 2) {
    term *= -r2 / (n * (n + 1));
    sum += term;
  }
  return sum;
}

export function cosDet(x) {
  return sinDet(x + HALF_PI);
}

/* The quaternion [x, y, z, w] turning the body's nose (-z) onto the unit
 * direction d, the shortest arc. Straight backward is half a turn about y. */
export function noseTo(d, out = [0, 0, 0, 1]) {
  const w = 1 - d[2];
  if (w < 1e-9) {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    out[3] = 0;
    return out;
  }
  const n = Math.sqrt(d[1] * d[1] + d[0] * d[0] + w * w);
  out[0] = d[1] / n;
  out[1] = -d[0] / n;
  out[2] = 0;
  out[3] = w / n;
  return out;
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function len(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/* The horizontal unit vector to the left of direction d (y up), or zeros
 * for a vertical d. */
function leftOf(d) {
  const h = Math.sqrt(d[0] * d[0] + d[2] * d[2]);
  return h > 1e-9 ? [d[2] / h, 0, -d[0] / h] : [0, 0, 0];
}

/* A polyline's legs: [{ a, d (unit), m (length), s (distance at a) }]. */
function legsOf(pts) {
  const legs = [];
  let s = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const v = sub(pts[i], pts[i - 1]);
    const m = len(v);
    if (m < 1e-9) {
      continue;
    }
    legs.push({ a: pts[i - 1], d: [v[0] / m, v[1] / m, v[2] / m], m, s });
    s += m;
  }
  return { legs, m: s };
}

/*
 * An attacker's flight as phases on the room clock, from its birth
 * (agent: { kind, route, t0, k, n, err, target }) and its mission.
 * Returns { t0, tEnd, end, phases }: end is 'arrive' (at its target at
 * tEnd), 'leave' (gone at tEnd), 'park' (tEnd Infinity), 'wire' (into a
 * power line at tEnd) or 'steer' (a hunter: the room flies it, and phases
 * say only where it is born).
 * Throws on a route or target the mission does not have: a mission file
 * is data the room trusts, and a wrong one must fail loudly.
 */
export function planAgent(mission, agent) {
  const plan = cutAtWire(planRoute(mission, agent), agent.wire);
  const stalls = agent.stalls;
  if (!stalls || !stalls.length || !Number.isFinite(plan.tEnd)) {
    return plan;
  }
  plan.stalls = stalls.map(([at, ms]) => [at, ms]).sort((a, b) => a[0] - b[0]);
  for (const [, ms] of plan.stalls) {
    plan.tEnd += ms;
  }
  return plan;
}

/* The plan ended at room ms t, where it flew into a line: the phases up
 * to t, the last cut there. A t outside the flight leaves it whole. */
function cutAtWire(plan, t) {
  if (!Number.isFinite(t) || !(t > plan.t0) || !(t < plan.tEnd) || plan.end === 'steer') {
    return plan;
  }
  const phases = plan.phases.filter((ph) => ph.t0 < t);
  phases[phases.length - 1].t1 = t;
  return {
    t0: plan.t0, tEnd: t, end: 'wire', phases,
  };
}

/* The plan without stalls. */
function planRoute(mission, agent) {
  const kind = KIND[agent.kind];
  if (!kind) {
    throw new Error(`war: no kind ${agent.kind}`);
  }
  const route = mission.routes[agent.route];
  if (!route || route.length < 1) {
    throw new Error(`war: no route ${agent.route}`);
  }
  const target = agent.target == null ? null : mission.targets[agent.target];
  if (agent.target != null && !target) {
    throw new Error(`war: no target ${agent.target}`);
  }
  const n = agent.n || 1;
  const form = ((agent.k || 0) - (n - 1) / 2) * kind.gap;
  const pts = route.map((p) => [p[0], p[1], p[2]]);
  let aim = null;
  if (target) {
    const last = pts[pts.length - 1];
    const toward = sub(target.at, last);
    const m = len(toward);
    const side = leftOf(m > 1e-9 ? toward : [0, 0, -1]);
    const e = agent.err || 0;
    aim = [target.at[0] + side[0] * e, target.at[1], target.at[2] + side[2] * e];
  }
  const phases = [];
  let t = agent.t0;
  const push = (p, ms) => {
    p.t0 = t;
    p.t1 = t + ms;
    phases.push(p);
    t += ms;
  };
  const straightOn = agent.kind === 'strike' || agent.kind === 'decoy' || agent.kind === 'fpv' || agent.kind === 'boat';
  const path = legsOf(straightOn && aim ? [...pts, aim] : pts);
  if (agent.kind === 'hunter' || !path.legs.length) {
    const d = path.legs.length ? path.legs[0].d : [0, 0, -1];
    const at = pts[0].slice();
    const side = leftOf(d);
    at[0] += side[0] * form;
    at[2] += side[2] * form;
    push({ k: 'park', p: at, d }, 0);
    return { t0: agent.t0, tEnd: Infinity, end: agent.kind === 'hunter' ? 'steer' : 'park', phases };
  }
  /* The formation closes on the aim point only when there is one. */
  push({
    k: 'path', legs: path.legs, m: path.m, speed: kind.speed, form, close: Boolean(aim) && straightOn,
    weaveM: kind.weaveM || 0, weaveMs: kind.weaveMs || 1, phase: (agent.k || 0) * 0.9,
  }, (path.m / kind.speed) * 1000);
  const endLeg = path.legs[path.legs.length - 1];
  const endSide = leftOf(endLeg.d);
  const endAt = [
    endLeg.a[0] + endLeg.d[0] * endLeg.m + endSide[0] * form,
    endLeg.a[1] + endLeg.d[1] * endLeg.m,
    endLeg.a[2] + endLeg.d[2] * endLeg.m + endSide[2] * form,
  ];
  if (straightOn) {
    return { t0: agent.t0, tEnd: t, end: aim ? 'arrive' : 'leave', phases };
  }
  if (agent.kind === 'jammer') {
    push({ k: 'park', p: endAt, d: [endLeg.d[0], 0, endLeg.d[2]] }, 0);
    return { t0: agent.t0, tEnd: Infinity, end: 'park', phases };
  }
  /* A level circle to the left of the path's end, entered on its tangent. */
  const flat = leftOf(endLeg.d);
  const dir0 = [-flat[2], 0, flat[0]];
  const c = [endAt[0] + flat[0] * kind.orbitR, endAt[1], endAt[2] + flat[2] * kind.orbitR];
  const w = kind.speed / kind.orbitR;
  const orbitMs = agent.kind === 'scout' ? kind.orbitMs : (TWO_PI / w) * 1000;
  push({ k: 'orbit', c, r0: sub(endAt, c), dir0, w, speed: kind.speed }, orbitMs);
  const out = orbitAt(phases[phases.length - 1], t);
  if (agent.kind === 'scout') {
    push({ k: 'line', a: out.p, d: out.d, speed: kind.speed }, (LEAVE_M / kind.speed) * 1000);
    return { t0: agent.t0, tEnd: t, end: 'leave', phases };
  }
  const dive = aim ? sub(aim, out.p) : out.d.map((x) => x * LEAVE_M);
  const m = len(dive);
  push({ k: 'line', a: out.p, d: dive.map((x) => x / m), speed: kind.dive }, (m / kind.dive) * 1000);
  return { t0: agent.t0, tEnd: t, end: aim ? 'arrive' : 'leave', phases };
}

/* Where an orbit phase has got to at t: { p, d }. */
function orbitAt(ph, t) {
  const a = ph.w * (t - ph.t0) / 1000;
  const c = cosDet(a);
  const s = sinDet(a);
  /* Turning left about y (up): x' = x c + z s, z' = -x s + z c. */
  const rx = ph.r0[0] * c + ph.r0[2] * s;
  const rz = -ph.r0[0] * s + ph.r0[2] * c;
  const dx = ph.dir0[0] * c + ph.dir0[2] * s;
  const dz = -ph.dir0[0] * s + ph.dir0[2] * c;
  return { p: [ph.c[0] + rx, ph.c[1], ph.c[2] + rz], d: [dx, 0, dz] };
}

/*
 * The pose of a planned attacker at room ms t, into out: { p: [3], q: [4],
 * v: [3] (m/s) }. Before its birth, null; after its end, where it ended
 * (the room has taken it off by then).
 */
export function poseAt(plan, t, out = { p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0] }) {
  if (!plan.stalls || t < plan.t0) {
    return poseRoute(plan, t, out);
  }
  /* An EMP's stall (war.js): the route's clock stops at its start for its
   * ms, and runs on from there after. */
  let te = t;
  let still = false;
  for (const [at, ms] of plan.stalls) {
    if (t <= at) {
      break;
    }
    if (t < at + ms) {
      te = at - (t - te);
      still = true;
      break;
    }
    te -= ms;
  }
  const o = poseRoute(plan, te, out);
  if (o && still) {
    o.v[0] = 0;
    o.v[1] = 0;
    o.v[2] = 0;
  }
  return o;
}

function poseRoute(plan, t, out) {
  if (t < plan.t0) {
    return null;
  }
  const phases = plan.phases;
  let ph = phases[phases.length - 1];
  for (const x of phases) {
    if (t <= x.t1) {
      ph = x;
      break;
    }
  }
  const tt = Math.min(t, ph.t1);
  let d;
  if (ph.k === 'park') {
    out.p[0] = ph.p[0];
    out.p[1] = ph.p[1];
    out.p[2] = ph.p[2];
    out.v[0] = 0;
    out.v[1] = 0;
    out.v[2] = 0;
    d = ph.d;
  } else if (ph.k === 'orbit') {
    const o = orbitAt(ph, tt);
    out.p[0] = o.p[0];
    out.p[1] = o.p[1];
    out.p[2] = o.p[2];
    d = o.d;
    out.v[0] = d[0] * ph.speed;
    out.v[1] = 0;
    out.v[2] = d[2] * ph.speed;
  } else if (ph.k === 'line') {
    const s = ph.speed * (tt - ph.t0) / 1000;
    d = ph.d;
    for (let i = 0; i < 3; i += 1) {
      out.p[i] = ph.a[i] + d[i] * s;
      out.v[i] = d[i] * ph.speed;
    }
  } else {
    d = pathAt(ph, tt, out);
  }
  noseTo(d, out.q);
  return out;
}

/* A path phase at t: position and velocity into out, the direction back. */
function pathAt(ph, t, out) {
  const s = Math.min(ph.m, ph.speed * (t - ph.t0) / 1000);
  const legs = ph.legs;
  let leg = legs[legs.length - 1];
  for (const x of legs) {
    if (s <= x.s + x.m) {
      leg = x;
      break;
    }
  }
  const u = s / ph.m;
  const fade = ph.close ? 1 - u : 1;
  const side = leftOf(leg.d);
  /* Sideways: the formation's place (closing to the aim point) and the
   * weave (dying away there), and the weave's own speed. */
  const wa = TWO_PI * (t - ph.t0) / ph.weaveMs + ph.phase;
  const weave = ph.weaveM * sinDet(wa) * fade;
  const lat = ph.form * fade + weave;
  const latV = ph.weaveM * cosDet(wa) * fade * TWO_PI * 1000 / ph.weaveMs - (ph.close ? (ph.form + ph.weaveM * sinDet(wa)) * ph.speed / ph.m : 0);
  const along = s - leg.s;
  for (let i = 0; i < 3; i += 1) {
    out.p[i] = leg.a[i] + leg.d[i] * along + side[i] * lat;
    out.v[i] = leg.d[i] * ph.speed + side[i] * latV;
  }
  return leg.d;
}
