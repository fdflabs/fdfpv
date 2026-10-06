/*
 * signal.js: the radio's reach in a war game (docs/WARFARE-PLAN.md 6.1,
 * 6.2 and the planes' rule of 6.4).
 *
 * One number a frame, the link quality q in [0, 1] between the pilot's
 * ground station and the craft, from the terrain between them, the range,
 * the jammers and the relays. What q then does is here too, as rules the
 * shell applies and nowhere else: the snow it puts on the picture
 * (fpvfail.js), the delay and loss it puts on the sticks (link.js), when
 * the link counts as lost, and what a fixed wing does once it is.
 *
 * PURE AND DETERMINISTIC. Plain numbers and the ground function the caller
 * hands in, no three.js, no clock, no Math.random: the same positions give
 * the same q in Node and in the browser. The ground is terrain.finestAt,
 * never terrain.height: height() answers with whatever level the camera's
 * LOD drew, so a hill would block the link or not depending on where the
 * camera looked. Water counts as ground (the reservoir at 219.0, the river
 * at 103.5), since a radio does not see through a lake any better.
 *
 * Positions are the render world's metres, y up, as finestAt takes them.
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

/* The pilot's antenna over the ground where the pilot stands. */
export const STATION_H = 1.5;
/* Line of sight is sampled this often along a leg, and a leg is blocked
 * where the ground stands above the line less this clearance. The
 * clearance is more than STATION_H on purpose: it is the rule's stand in
 * for the Fresnel zone, so a craft skimming flat ground a long way off is
 * blocked even though a ray would clear it. */
export const LOS_STEP_M = 20;
export const LOS_CLEAR_M = 2;
/* Range: full quality to RANGE_FULL_M, falling linearly to 0 at RANGE_ZERO_M. */
export const RANGE_FULL_M = 1500;
export const RANGE_ZERO_M = 4000;
/* A live jammer multiplies quality by min(1, d / JAM_FULL_M). */
export const JAM_FULL_M = 600;
/* The airframes that carry a relay, and how high over the ground one must
 * be to serve as a second station. */
export const RELAY_AIRFRAMES = new Set(['bramor2300', 'sky1800', 'radian2000']);
export const RELAY_MIN_AGL_M = 150;

/* What q does. */
export const SNOW_BELOW_Q = 0.5;
export const DEGRADE_BELOW_Q = 0.25;
export const DEGRADE_DELAY_MS = 120;
export const DEGRADE_LOSS_MAX = 0.9;
export const LOST_AFTER_MS = 500;
export const AIRFRAME_LOST_AFTER_MS = 3000;

/* The ground a radio sees at (x, z): the terrain, or the water over it. */
function groundOf(finestAt, waterAt) {
  if (!waterAt) {
    return finestAt;
  }
  return (x, z) => {
    const g = finestAt(x, z);
    const w = waterAt(x, z);
    return w > g ? w : g;
  };
}

/*
 * Whether the ground at (x, z) stands above `lim`: the higher of terrain
 * and water, as groundOf, but the water is asked only when it could
 * matter. A water test is a point in polygon walk over the outlines, about
 * ten times the terrain's cost on Itaipu's two (scripts/signal-check.js), and
 * a line more than LOS_CLEAR_M over the highest water never needs it.
 */
function above(w, x, z, lim) {
  if (w.finestAt(x, z) > lim) {
    return true;
  }
  return w.waterAt !== null && lim < w.waterTop && w.waterAt(x, z) > lim;
}

function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function rangeQuality(d) {
  if (d <= RANGE_FULL_M) {
    return 1;
  }
  if (d >= RANGE_ZERO_M) {
    return 0;
  }
  return (RANGE_ZERO_M - d) / (RANGE_ZERO_M - RANGE_FULL_M);
}

/*
 * Whether the ground clears the segment a to b. Samples at every
 * LOS_STEP_M from a, strictly between the ends: at either end the ground
 * is by definition within LOS_CLEAR_M of an antenna standing STATION_H on
 * it, so sampling the ends would block every leg.
 */
function lineClear(a, b, d, w) {
  const n = Math.ceil(d / LOS_STEP_M);
  for (let k = 1; k < n; k += 1) {
    const t = (k * LOS_STEP_M) / d;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    if (above(w, x, z, y - LOS_CLEAR_M)) {
      return false;
    }
  }
  return true;
}

/* One leg's quality: its range, or 0 when the ground is in the way. Only
 * walks the line when the range could still beat `floor`, which is what
 * keeps a relay list cheap. */
function legQuality(a, b, w, floor) {
  const d = distance(a, b);
  const r = rangeQuality(d);
  if (r <= floor) {
    return 0;
  }
  return lineClear(a, b, d, w) ? r : 0;
}

/*
 * The link quality for one craft.
 *
 *   station   the pilot's antenna, { x, y, z }: stationPoint below
 *   craft     the craft, { x, y, z }
 *   relays    live teammates, [{ x, y, z, airframe }], the craft itself
 *             left out; any not on RELAY_AIRFRAMES or lower than
 *             RELAY_MIN_AGL_M over the ground is ignored here
 *   jammers   live jammers, [{ x, y, z }]
 *   finestAt  terrain.finestAt
 *   waterAt   (x, z) -> the water's surface there, or -Infinity; optional
 *   waterTop  the highest water surface on the map (Itaipu's reservoir,
 *             219.0): waterAt is not asked where the line is more than
 *             LOS_CLEAR_M over it. Leave it out and waterAt is always asked
 *
 * Returns { q, blocked, via }: q in [0, 1]; blocked, whether the ground
 * cuts the direct line; via, the index in `relays` of the relay that
 * carried q, or -1 for the direct link (or none at all).
 */
export function signalQuality({
  station, craft, relays = [], jammers = [], finestAt, waterAt = null, waterTop = Infinity,
}) {
  const ground = groundOf(finestAt, waterAt);
  const w = { finestAt, waterAt, waterTop };
  const dDirect = distance(station, craft);
  const rDirect = rangeQuality(dDirect);
  const blocked = !lineClear(station, craft, dDirect, w);
  let best = blocked ? 0 : rDirect;
  let via = -1;
  for (let i = 0; i < relays.length; i += 1) {
    const r = relays[i];
    if (!RELAY_AIRFRAMES.has(r.airframe) || r.y - ground(r.x, r.z) < RELAY_MIN_AGL_M) {
      continue;
    }
    /* The product can beat `best` only if each leg can on its own. */
    const up = legQuality(station, r, w, best);
    if (up <= best) {
      continue;
    }
    const q = up * legQuality(r, craft, w, best / up);
    if (q > best) {
      best = q;
      via = i;
    }
  }
  for (const j of jammers) {
    const f = distance(j, craft) / JAM_FULL_M;
    if (f < 1) {
      best *= f;
    }
  }
  return { q: best, blocked, via };
}

/* The pilot's antenna at a standing point { x, z } (slots.js stationFor). */
export function stationPoint(at, finestAt, waterAt = null) {
  return { x: at.x, y: groundOf(finestAt, waterAt)(at.x, at.z) + STATION_H, z: at.z };
}

/* The picture's snow for q, 0 to 1, for fpvfail's signal(). */
export function snowFor(q) {
  return q >= SNOW_BELOW_Q ? 0 : (SNOW_BELOW_Q - q) / SNOW_BELOW_Q;
}

/*
 * What q does to the sticks, for link.js setSignal: { delayMs, lossPpm }.
 * Below DEGRADE_BELOW_Q the link runs DEGRADE_DELAY_MS late and loses a
 * share of its packets rising linearly to DEGRADE_LOSS_MAX at q = 0; a
 * lost link (LinkWatch) loses every packet.
 */
export function linkDegradeFor(q, lost) {
  if (lost) {
    return { delayMs: DEGRADE_DELAY_MS, lossPpm: 1e6 };
  }
  if (q >= DEGRADE_BELOW_Q) {
    return { delayMs: 0, lossPpm: 0 };
  }
  return { delayMs: DEGRADE_DELAY_MS, lossPpm: Math.round(1e6 * DEGRADE_LOSS_MAX * (1 - q / DEGRADE_BELOW_Q)) };
}

/*
 * When q has been 0 long enough for the link to be lost, and a lost link
 * long enough to lose the airframe. Driven by the sim clock, never the
 * wall, so a replay agrees. `airframeLost` latches until reset: the rack
 * has already paid for it.
 */
export class LinkWatch {
  constructor() {
    this.reset();
  }

  reset() {
    this.zeroSinceMs = -1;
    this.lostSinceMs = -1;
    this.lost = false;
    this.airframeLost = false;
  }

  update(q, nowMs) {
    if (q > 0) {
      this.zeroSinceMs = -1;
      this.lostSinceMs = -1;
      this.lost = false;
      return this;
    }
    if (this.zeroSinceMs < 0) {
      this.zeroSinceMs = nowMs;
    }
    if (!this.lost && nowMs - this.zeroSinceMs >= LOST_AFTER_MS) {
      this.lost = true;
      this.lostSinceMs = nowMs;
    }
    if (this.lost && nowMs - this.lostSinceMs >= AIRFRAME_LOST_AFTER_MS) {
      this.airframeLost = true;
    }
    return this;
  }
}

/*
 * THE PLANES' FAILSAFE (6.4). No flight controller flies a fixed wing
 * here, so the receiver's failsafe is the whole of it, and this is that
 * rule, written once: on link loss the wing goes to Stabilised, the
 * receiver puts out centred sticks with the throttle cut, and the aircraft
 * glides wings level. An aircraft with a recovery chute (the Bramor) pulls
 * it, which the module answers by stopping the motor itself. When the link
 * comes back the pilot's stabiliser mode is put back; a chute that is out
 * stays out, as it does in the air.
 *
 * `e` is the module's exports (sim.e). Call it once a frame for a fixed
 * wing only, and hand what it returns to link.js setSignal as the
 * receiver's failsafe output. Call reset() wherever the shell resets the
 * run, since a reset puts the pilot's own stabiliser mode back.
 */
export const FAILSAFE_RC = Object.freeze({ roll: 0, pitch: 0, yaw: 0, throttle: 0 });
export const WING_STABILISED = 1;

function must(code, what) {
  if (code !== 0) {
    throw new Error(`plane failsafe: ${what} returned ${code}`);
  }
}

export class PlaneFailsafe {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.stabBefore = -1;
  }

  /* Returns FAILSAFE_RC while the failsafe holds the aircraft, else null.
   * `chute`: the airframe has one; `airborne`: not on the ground, where a
   * chute has nothing to do. */
  update(lost, e, { chute = false, airborne = true } = {}) {
    if (lost && !this.active) {
      this.active = true;
      this.stabBefore = e.sim_wing_stab();
      must(e.sim_wing_set_stab(WING_STABILISED), 'sim_wing_set_stab');
      if (chute && airborne && e.sim_wing_chute_open() === 0) {
        must(e.sim_wing_chute(1), 'sim_wing_chute');
      }
    } else if (!lost && this.active) {
      this.active = false;
      must(e.sim_wing_set_stab(this.stabBefore), 'sim_wing_set_stab');
    }
    return this.active ? FAILSAFE_RC : null;
  }
}
