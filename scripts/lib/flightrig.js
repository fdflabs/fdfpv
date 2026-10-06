/*
 * flightrig.js: fly the compiled plant headless, the way the shell flies it.
 *
 * The checks that judge contacts and trick names need a real aircraft, not a
 * kinematic stand in, and they need it in Node with no renderer. This rig
 * runs dist/sim.wasm on the sim clock and wraps it in the shell's seams: the
 * frame conversions (spawn yaw included), the ground plane, a port of the
 * obstacle contact pass with its rotor bleed, and the feed into the trick
 * recogniser. A small guidance law tracks planned paths so a check can say
 * "fly this circle" instead of scripting sticks.
 *
 * Every number here is bit exact on purpose: golden records digest the
 * detector calls this rig makes, so one ulp in a stick changes the flight
 * and the record. Formulas keep their operation order, and the pilot and
 * path generators use Math trig at the same places (they are not the plant,
 * which stays in the WASM).
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

import { loadSim, SIM_OK } from '../../tests/lib/simmod.js';
import { simPosToThree, threePosToSim, threeDirToSim } from '../../src/render/frame.js';
import {
  Colliders, contactPatch, contactMaterial, craftVerticalHalf, craftVerticalOffset,
  GROUND_MU, GROUND_E, GRAZE_SPEED_MAX, BOUNCE_SEPARATION,
  PRESS_CONFIRM_MS, PRESS_RELEASE_MS, PRESS_BLEED, thrustIntoFace,
} from '../../src/game/collide.js';
import { TrickDetector } from '../../src/game/trickdetect.js';

export { GRAZE_SPEED_MAX };

/* The shell's numbers, kept as local copies so the rig states what it
 * reproduces rather than following a refactor of the shell silently. */
const PLANT_LIFT = 0.045;   /* m, plant origin above the spawn point */
const PASS_MS = 4;          /* contact pass cadence, sim steps */
const BUMP_GAP_MS = 180;    /* least sim ms between two recogniser bumps */
const RC_PERIOD = 1 / 250;  /* s, RC sample period */
const G = 9.81;

export const TURN = 6.283185307179586;

export const V = (x, y, z) => ({ x, y, z });
export const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a) => Math.sqrt(dot(a, a));
/* A zero or NaN length scales by 1, so a degenerate vector passes through. */
export const norm = (a) => mul(a, 1 / (len(a) || 1));
export const cl = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/* frame.js writes into a caller's object, through set() for one direction
 * and plain fields for the other. */
function scratch() {
  return {
    x: 0, y: 0, z: 0,
    set(a, b, c) { this.x = a; this.y = b; this.z = c; },
  };
}

function aboutY(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return V(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

/* Quaternions are [w, x, y, z] arrays. */
function qMul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

/* Written for a general v even where callers pass unit axes: dropping the
 * zero terms would change the sign of a zero, and atan2 sees that. */
function qTurn(q, v) {
  const [w, x, y, z] = q;
  const ux = 2 * (y * v.z - z * v.y);
  const uy = 2 * (z * v.x - x * v.z);
  const uz = 2 * (x * v.y - y * v.x);
  return V(
    v.x + w * ux + (y * uz - z * uy),
    v.y + w * uy + (z * ux - x * uz),
    v.z + w * uz + (x * uy - y * ux),
  );
}

const WORLD_UP = () => V(0, 1, 0);
const WORLD_AHEAD = () => V(0, 0, -1);

/* --- Paths: fn(t) -> {p, v, a, done}, with fn.total in seconds. --- */

function asPath(fn, total) {
  fn.total = total;
  return fn;
}

export function circlePath(c, e1, e2, r, secs, ph0, turns) {
  const w = (TURN * (turns >= 0 ? 1 : -1)) / secs;
  const total = Math.abs(turns) * secs;
  return asPath((t) => {
    const ph = ph0 + w * (t > total ? total : t);
    const cs = Math.cos(ph);
    const sn = Math.sin(ph);
    const done = t >= total;
    return {
      p: add(c, add(mul(e1, r * cs), mul(e2, r * sn))),
      v: done ? V(0, 0, 0) : mul(add(mul(e1, -sn), mul(e2, cs)), r * w),
      a: done ? V(0, 0, 0) : mul(add(mul(e1, cs), mul(e2, sn)), -r * w * w),
      done,
    };
  }, total);
}

/* Cosine eased, at rest at both ends. Past the end the clamped phase
 * leaves sin(PI) in the velocity, which is kept: the flights are pinned. */
export function linePath(a, b, secs) {
  const d = sub(b, a);
  return asPath((t) => {
    const x = Math.PI * cl(t / secs, 0, 1);
    const s = 0.5 - 0.5 * Math.cos(x);
    const ds = (Math.PI / (2 * secs)) * Math.sin(x);
    const dds = ((Math.PI * Math.PI) / (2 * secs * secs)) * Math.cos(x);
    return { p: add(a, mul(d, s)), v: mul(d, ds), a: mul(d, dds), done: t >= secs };
  }, secs);
}

/* Cubic from rest at a to about vEnd at b; the end speed gain is clamped so
 * the curve never runs backwards or overshoots wildly. */
export function rampPath(a, b, secs, vEnd) {
  const d = sub(b, a);
  const g1 = cl((vEnd * secs) / (len(d) || 1), 0.2, 2.6);
  const c2 = 3 - g1;
  const c3 = g1 - 2;
  return asPath((t) => {
    const u = cl(t / secs, 0, 1);
    const sv = c2 * u * u + c3 * u * u * u;
    const dv = (2 * c2 * u + 3 * c3 * u * u) / secs;
    const av = (2 * c2 + 6 * c3 * u) / (secs * secs);
    return { p: add(a, mul(d, sv)), v: mul(d, dv), a: mul(d, av), done: t >= secs };
  }, secs);
}

export function dropPath(path, g2) {
  return asPath((t) => {
    const d = path(t);
    return {
      p: V(d.p.x, d.p.y - 0.5 * g2 * t * t, d.p.z),
      v: V(d.v.x, d.v.y - g2 * t, d.v.z),
      a: V(d.a.x, d.a.y - g2, d.a.z),
      done: d.done,
    };
  }, path.total);
}

export function seqPath(...parts) {
  const last = parts.length - 1;
  return asPath((t) => {
    let start = 0;
    for (let i = 0; ; i += 1) {
      const part = parts[i];
      if (t < start + part.total || i === last) return part(t - start);
      start += part.total;
    }
  }, parts.reduce((sum, part) => sum + part.total, 0));
}

/* --- Worlds --- */

export function buildWorld(parts, deriveObstacles, groundY = 0) {
  const c = new Colliders();
  for (const s of parts) {
    if (s.kind === 'box') c.addBox(s.material ?? 'wall', s.x0, s.y0, s.z0, s.x1, s.y1, s.z1);
    else if (s.kind === 'capsule') c.add(s.material ?? 'obstacle', s.ax, s.ay, s.az, s.bx, s.by, s.bz, s.r);
  }
  c.build();
  const field = deriveObstacles ? deriveObstacles(c, () => groundY) : null;
  return { colliders: c, field };
}

/* --- The rig --- */

/* The shell's frame seam for one spawn: plant state to world and back. */
function frameSeam(spawn, spawnYaw) {
  const qSpawn = [Math.cos(spawnYaw / 2), 0, Math.sin(spawnYaw / 2), 0];
  return {
    point(st) {
      const o = scratch();
      simPosToThree(st[1], st[2], st[3] + PLANT_LIFT, o);
      return add(aboutY(o, spawnYaw), spawn);
    },
    velocity(st) {
      const o = scratch();
      simPosToThree(st[4], st[5], st[6], o);
      return aboutY(o, spawnYaw);
    },
    attitude(st) {
      return qMul(qSpawn, [st[7], -st[9], st[10], -st[8]]);
    },
    toPlant(w) {
      const p = aboutY(sub(w, spawn), -spawnYaw);
      const o = scratch();
      threePosToSim(p.x, p.y, p.z, o);
      o.z -= PLANT_LIFT;
      return o;
    },
    /* The spawn rotation belongs here too: leaving it out is invisible on
     * a floor and reverses a wall's normal at yaw pi. */
    toPlantDir(d) {
      const u = aboutY(d, -spawnYaw);
      const o = scratch();
      threeDirToSim(u.x, u.y, u.z, o);
      return o;
    },
  };
}

const speedOf = (st) => Math.sqrt(st[4] * st[4] + st[5] * st[5] + st[6] * st[6]);

export async function makeRig({
  wasmBytes, diffText, colliders = null, field = null,
  spawn = V(0, 0, 0), spawnYaw = 0, groundY = 0, cell = 4.0,
} = {}) {
  const sim = await loadSim(wasmBytes);
  if (sim.init(diffText) !== SIM_OK) throw new Error('flightrig: sim_init failed');
  sim.reset();
  if (cell) sim.setCellVoltage(cell);

  const tricks = [];
  const det = new TrickDetector((t) => tricks.push(t), field);
  if (colliders) {
    det.solids = {
      gapAt: (x, y, z, r) => colliders.gapAt(x, y, z, r),
      axisAt(x, y, z, r) {
        if (!colliders.axisAt(x, y, z, r)) return null;
        return {
          gap: colliders.axisGap,
          dx: colliders.axisDx, dy: colliders.axisDy, dz: colliders.axisDz,
          cx: colliders.axisCx, cy: colliders.axisCy, cz: colliders.axisCz,
        };
      },
    };
  }

  const seam = frameSeam(spawn, spawnYaw);
  const read = () => sim.readState().state;
  let st = read();
  const clock = { steps: 0, nextRc: 0, phase: 0, lastBump: -1e9 };
  let sticks = [0, 0, 0, 0];
  let lastPassAt = null;
  const press = { held: 0, idle: 0, on: false };
  const track = [];
  const stats = { contacts: 0, resolved: 0, resting: 0, inbound: 0, outbound: 0, buried: 0, pressed: 0 };

  function craft() {
    const q = seam.attitude(st);
    return {
      p: seam.point(st),
      v: seam.velocity(st),
      up: qTurn(q, WORLD_UP()),
      fwd: qTurn(q, WORLD_AHEAD()),
      rates: { p: st[11], q: st[12], r: st[13] },
      upZ: 1 - 2 * (st[8] * st[8] + st[9] * st[9]),
      simMs: clock.steps,
    };
  }

  /* Move the plant to world point w keeping its attitude; false if the
   * plant refused, in which case st is left as it was. */
  function poseAt(w) {
    const ps = seam.toPlant(w);
    if (sim.e.sim_set_pose(ps.x, ps.y, ps.z, st[7], st[8], st[9], st[10]) !== SIM_OK) return false;
    st = read();
    return true;
  }

  function releasePress() {
    press.held = 0;
    press.idle = 0;
    press.on = false;
  }

  /* One sweep from the last pass position to here, resolving up to four
   * hits in turn as the shell does. Returns whether anything was touched
   * and the hardest closing speed into a face (never below 0). */
  function contactPass() {
    const pass = { touched: false, closing: 0 };
    if (!colliders || !lastPassAt) {
      lastPassAt = seam.point(st);
      releasePress();
      return pass;
    }
    let a = lastPassAt;
    let b = seam.point(st);
    lastPassAt = b;
    const q = seam.attitude(st);
    const up = qTurn(q, WORLD_UP());
    const vh = craftVerticalHalf(Math.sqrt(Math.max(0, 1 - up.y * up.y)));
    const [aqw, aqx, aqy, aqz] = q;
    let pressing = false;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const k = colliders.hit(a.x, a.y, a.z, b.x, b.y, b.z, vh, aqx, aqy, aqz, aqw, craftVerticalOffset());
      if (k < 0) {
        /* The last resolution left a slide still to travel: finish it. */
        if (attempt > 0 && (b.x !== a.x || b.y !== a.y || b.z !== a.z)) poseAt(b);
        break;
      }
      stats.contacts += 1;
      pass.touched = true;
      const n = V(colliders.hitNx, colliders.hitNy, colliders.hitNz);
      if (thrustIntoFace(n.x, n.y, n.z, up.x, up.y, up.z)) pressing = true;
      const closing = speedOf(st) * colliders.hitNormalDot;
      if (closing > pass.closing) pass.closing = closing;

      const ht = cl(colliders.hitT, 0, 1);
      const at = V(a.x + (b.x - a.x) * ht, a.y + (b.y - a.y) * ht, a.z + (b.z - a.z) * ht);
      const depth = Math.max(colliders.hitPen, colliders.hitOverlap);
      const startedInside = colliders.hitT <= 1e-6;
      const sep = (startedInside && depth > 0) ? depth + BOUNCE_SEPARATION : BOUNCE_SEPARATION;
      const clear = V(at.x + n.x * sep, at.y + n.y * sep, at.z + n.z * sep);

      if (startedInside && colliders.hitPen > 0.05) {
        /* Buried: lift it out along the normal and sweep again from there. */
        stats.buried += 1;
        if (!poseAt(clear)) break;
        a = seam.point(st);
        b = a;
        continue;
      }

      const mat = contactMaterial(colliders.kindName(k));
      const rest = 1 - ht;
      let rx = (b.x - a.x) * rest;
      let ry = (b.y - a.y) * rest;
      let rz = (b.z - a.z) * rest;
      const dn = rx * n.x + ry * n.y + rz * n.z;
      if (dn < 0) {
        rx -= n.x * dn;
        ry -= n.y * dn;
        rz -= n.z * dn;
      }

      const ps = seam.toPlant(clear);
      const nS = seam.toPlantDir(n);
      const nl = Math.sqrt(nS.x * nS.x + nS.y * nS.y + nS.z * nS.z);
      if (!(nl > 1e-9)) break;
      const patch = contactPatch(n.x, n.y, n.z, aqx, aqy, aqz, aqw, { x: 0, y: 0, z: 0 });
      const rS = seam.toPlantDir(patch);

      const vn = (nS.x * st[4] + nS.y * st[5] + nS.z * st[6]) / nl;
      if (vn > 0.05) stats.outbound += 1;
      else if (vn < -0.05) stats.inbound += 1;

      const before = [st[4], st[5], st[6]];
      const code = sim.e.sim_contact_at(nS.x / nl, nS.y / nl, nS.z / nl, mat.e, mat.mu,
        ps.x, ps.y, ps.z, 0, 0, 0, rS.x, rS.y, rS.z);
      if (code !== SIM_OK) break;
      st = read();
      a = seam.point(st);
      const dvx = st[4] - before[0];
      const dvy = st[5] - before[1];
      const dvz = st[6] - before[2];
      if (dvx * dvx + dvy * dvy + dvz * dvz <= 0) {
        /* The plant judged it a resting contact and changed nothing. */
        stats.resting += 1;
        if (rx * rx + ry * ry + rz * rz <= 1e-12) break;
      } else {
        stats.resolved += 1;
      }
      b = V(a.x + rx, a.y + ry, a.z + rz);
    }

    /* The shell's rotor bleed for a craft holding itself on a face: confirm
     * after a while, release after a short gap, and never during turtle. */
    if (pressing) {
      press.idle = 0;
      press.on = true;
    } else if (press.on) {
      press.idle += PASS_MS;
      if (press.idle > PRESS_RELEASE_MS) releasePress();
    }
    if (press.on) {
      press.held += PASS_MS;
      if (press.held >= PRESS_CONFIRM_MS && !sim.e.sim_crashflip_active()) {
        stats.pressed += 1;
        sim.e.sim_prop_strike(PRESS_BLEED);
        st = read();
      }
    }
    lastPassAt = seam.point(st);
    return pass;
  }

  function raiseGround() {
    const w = seam.point(st);
    const p = seam.toPlant(V(w.x, groundY, w.z));
    const n = seam.toPlantDir(WORLD_UP());
    sim.e.sim_set_ground(1, n.x, n.y, n.z, p.x, p.y, p.z, GROUND_MU, GROUND_E);
  }

  /* One millisecond of sim time, in the shell's order. */
  function tick() {
    const t = clock.steps / 1000;
    if (t >= clock.nextRc) {
      sim.input(t, sticks[0], sticks[1], sticks[2], sticks[3]);
      clock.nextRc += RC_PERIOD;
    }
    raiseGround();
    sim.step(1);
    clock.steps += 1;
    st = read();

    const c = craft();
    track.push([c.p.x, c.p.y, c.p.z]);
    det.step(0.001, st[11], st[12], st[13], st[8], st[9], speedOf(st),
      c.p.x, c.p.y, c.p.z, c.fwd.x, c.fwd.y, c.fwd.z, c.up.x, c.up.y, c.up.z);
    if (colliders && clock.phase === 0) det.near(colliders.gapAt(c.p.x, c.p.y, c.p.z, 2.0));

    clock.phase += 1;
    if (clock.phase < PASS_MS) return;
    clock.phase = 0;
    const pass = contactPass();
    if (pass.touched && clock.steps - clock.lastBump >= BUMP_GAP_MS) {
      clock.lastBump = clock.steps;
      det.bump(pass.closing);
    }
  }

  /* Takes effect at the next RC sample, as a radio would. */
  function stick(r, p, y, thr) {
    sticks = [cl(r, -1, 1), cl(p, -1, 1), cl(y, -1, 1), cl(thr, 0, 1)];
  }

  function hold(ms, r = 0, p = 0, y = 0, thr = 0.5) {
    stick(r, p, y, thr);
    for (let i = 0; i < ms; i += 1) tick();
  }

  /* Sticks per step (fixed, or from the craft), until done() or msMax.
   * Returns the body rates integrated over the run, in radians. */
  function stickUntil(sticksOf, msMax, done) {
    const acc = { p: 0, q: 0, r: 0 };
    for (let i = 0; i < msMax; i += 1) {
      const s = typeof sticksOf === 'function' ? sticksOf(craft(), i, acc) : sticksOf;
      stick(s[0], s[1], s[2], s[3]);
      tick();
      acc.p += st[11] * 0.001;
      acc.q += st[12] * 0.001;
      acc.r += st[13] * 0.001;
      if (done && done(craft(), i, acc)) break;
    }
    return acc;
  }

  /* A pitch rotation of about `turns`, then stopped and held level. */
  function quarter(sign, turns = 0.25) {
    const spun = stickUntil([0, sign * 0.55, 0, 0.58], 900, (c, i, a) => Math.abs(a.q) >= TURN * turns * 0.62);
    stickUntil([0, -sign * 0.5, 0, 0.6], 500, (c) => Math.abs(c.rates.q) < 1.2);
    hold(120, 0, 0, 0, 0.58);
    return spun.q;
  }

  /* The pilot: a PD law on path position and velocity, plus the path's own
   * acceleration, gives a wanted thrust vector; attitude error to it maps
   * to roll and pitch rate, its length to throttle. */
  function fly(path, o = {}) {
    const kp = o.kp ?? 3.5;
    const kd = o.kd ?? 4.5;
    const ka = o.ka ?? 7.0;
    const maxRate = o.maxRate ?? 12;
    const dr = o.dr ?? 0.14;
    const hover = o.hover ?? 0.345;
    const yawMax = o.yawMax ?? 0.3;
    const ky = o.ky ?? 0.35;
    const extraMs = o.extraMs ?? 0;
    const yawRate = o.yawRate ?? 0;
    const { heading, invert, invertOk, watch } = o;
    const totalMs = Math.round(path.total * 1000) + extraMs;
    let integ = 0;
    let worst = 0;
    for (let i = 0; i < totalMs; i += 1) {
      const c = craft();
      const t = i / 1000;
      const d = path(t);
      const ep = sub(d.p, c.p);
      const ev = sub(d.v, c.v);
      const e = len(ep);
      if (e > worst) worst = e;

      const aCmd = add(d.a, add(mul(ep, kp), mul(ev, kd)));
      const f = V(aCmd.x, aCmd.y + G, aCmd.z);
      const fWant = invert ? mul(f, -1) : f;
      const b3 = c.up;
      const fwd = norm(c.fwd);
      const right = norm(cross(fwd, b3));
      const err = cross(b3, norm(fWant));
      const angRoll = Math.asin(cl(dot(err, fwd), -1, 1));
      const angPitch = Math.asin(cl(dot(err, right), -1, 1));
      const roll = cl((ka * angRoll - dr * c.rates.p) / maxRate, -1, 1);
      const pitch = cl((ka * angPitch + dr * c.rates.q) / maxRate, -1, 1);

      let yaw = yawRate;
      /* Heading is only steered while the nose is off vertical, and belly up
       * only when the flight asks for it. */
      if (heading != null && Math.abs(fwd.y) < 0.86 && (invertOk || invert || b3.y > 0.15)) {
        const want = typeof heading === 'function' ? heading(t, c) : heading;
        let he = want - Math.atan2(fwd.x, fwd.z);
        while (he > Math.PI) he -= Math.PI * 2;
        while (he < -Math.PI) he += Math.PI * 2;
        const flip = b3.y < 0 ? -1 : 1;
        yaw += cl(-he * flip * ky, -yawMax, yawMax);
      }
      yaw = cl(yaw, -1, 1);

      const along = invert ? -dot(f, b3) : dot(f, b3);
      if (e < 2.5) integ = cl(integ + dot(ev, b3) * 0.001 * 0.28, -0.2, 0.25);
      else integ *= (1 - Math.min(1, 0.002));
      const thr = cl(hover * Math.sqrt(Math.max(0.02, along) / G) + integ, 0.02, 1);

      stick(roll, pitch, yaw, thr);
      tick();
      if (watch) watch(craft(), i);
    }
    return { worstErr: worst };
  }

  function settle(p, heading, secs = 1.6) {
    fly(linePath(craft().p, p, secs), { heading });
    fly(linePath(p, p, 0.5), { heading });
  }

  function done(tailMs = 900) {
    hold(tailMs, 0, 0, 0, 0.5);
    det.flush(craft().upZ);
    return tricks;
  }

  return {
    sim, det, stick, hold, stickUntil, quarter, fly, settle, done, craft, tricks, track, stats,
    state: () => st,
    simMs: () => clock.steps,
    names: () => tricks.map((t) => t.name).join(' + '),
    graded: () => tricks.map((t) => `${t.name}:${t.execution}`).join(' + '),
  };
}
