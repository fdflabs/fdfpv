/*
 * bots.js: the room's AI pilots (docs/AI-PILOTS-CONTRACT.md), flown by the
 * room on its tick, as edge/rooms/warhunt.js flies the war's hunters. This
 * file is the flight and the choices only: it knows nothing of seats,
 * sockets or games. core.js hands it what the game says each AI pilot is
 * after (the Ace to catch, the orb, the hunters to run from) and turns the
 * poses it returns into POSE bytes for the room's own judges.
 *
 * THE FLIGHT. A flying wing at a constant speed, its heading turned toward
 * an aim point at no more than its turn rate, banked by how hard it is
 * turning, its nose along its path. The aim is held for the level's
 * reaction time before it is read again, so a pilot who jinks gains that
 * long. Speed, turn rate, lead and reaction are the level's (LEVELS).
 *
 * WHERE. Only where the room knows the ground: swiss2's valley floor
 * (grounds.js, the field the page builds). The floor rolls between about
 * -2 and 8 m within CORRIDOR.half of the valley's axis, so an AI pilot
 * keeps within that and between CORRIDOR.yMin and CORRIDOR.yMax (lower
 * only on the last TERMINAL_M to a target, below): its aim is put inside
 * first, and a position its turn could not keep inside is held at the
 * edge (counted in `clamps`, the largest such move in `clampMax`: numbers
 * for the checks).
 *
 * CRASHING. An AI pilot is a person's equal in a crash: it touches the
 * ground (a terminal run over rising pasture), or the room's mid air
 * referee breaks a part of it (crash(), from roombots.js), and it falls
 * under gravity from where it was, lies DOWN_MS where it came to rest
 * (FLAG_CRASHED), and is born again as add() births one, untouchable
 * (FLAG_SPAWNING) for SPAWN_MS as a person's fresh flight is.
 *
 * DETERMINISM. warhunt.js's recipe: plain arithmetic, Math.sqrt, and
 * sinDet (src/share/war/routes.js), never Math.sin, in the flight. The
 * ground is the page's own field, Math.sin and all: only the room reads it
 * here, one process on one Node, so a restored room still reads the same
 * heights, and matching the page matters more than matching a replay on
 * another engine. Elapsed room time in
 * equal substeps of at most SUB_MS; a gap over GAP_MS flies only GAP_MS.
 * Every random draw is from the generator below, whose state is saved, so
 * a room restored mid match flies on exactly as it would have.
 *
 * FRAMES. Scene world metres, y up, as the POSE wire carries them; the
 * attitude is the scene's craft convention (nose -z, top +y).
 *
 * WHAT OWNS WHAT. A Bots lives inside one RoomCore, which runs one event
 * at a time, so nothing here locks. save() is plain JSON for the room's
 * store, restore() takes it back.
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

import { attitude, cosSin, unit, GAP_MS, SUB_MS } from './warhunt.js';
import { groundOf } from './grounds.js';
import { sinDet } from '../../src/share/war/routes.js';
import { FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING } from '../../src/share/roomwire.js';

/* A flying wing: nothing on it to animate but its prop. */
export const BOT_AIRFRAME = 'zagi1219';
/* The world AI pilots fly in: the only one whose ground the room knows. */
export const BOT_MAP = 'swiss2';
/* How many AI pilots bots:selftest's cost row flies at once: a public
 * room's cap less the person who keeps it open. */
export const BOT_CAP_MEASURE = 7;

/*
 * The levels. speed m/s, turn rad/s, lead s (the most it aims ahead of a
 * target's velocity), react ms (how long an aim is held). Easy is a
 * hunter a new pilot can shake with one turn: slower than a cruising Zagi
 * (about 20 m/s) and a turn circle of 21 m radius. Hard is faster than a
 * cruising pilot and turns inside one, but still reads the target only
 * every quarter second, so a hard jink still gains a little.
 */
export const LEVELS = {
  easy: { speed: 16, turn: 0.75, lead: 0, react: 900 },
  normal: { speed: 20, turn: 1.1, lead: 1.5, react: 500 },
  hard: { speed: 24, turn: 1.5, lead: 2.5, react: 250 },
};

/* swiss2's flat floor runs FLOOR_HALF = 220 m either side of the axis
 * (alps/terrain.js); 150 keeps a turn circle clear of the walls' foot.
 * z stops short of the side valley's lip to the north and the lake basin
 * to the south (LAKE_N = 1860). The floor's buildings stand under yMin. */
export const CORRIDOR = { half: 150, zMin: -1200, zMax: 1700, yMin: 20, yMax: 120 };
/* The steepest an aim climbs or dives, rise over run. */
const SLOPE_MAX = 0.5;
/* How far ahead the band's edges are seen, metres. */
const BAND_LOOK_M = 80;
/* The most an AI pilot banks, radians, and how much bank a rad/s of turn
 * is: a coordinated turn at 20 m/s and 1.1 rad/s is about 66 degrees,
 * drawn a little flatter. */
const BANK_MAX = 1.05;
const BANK_PER_TURN = 0.9;
/* A wander point is done with this close, metres. */
const WANDER_M = 60;
/* The last this many metres (horizontally) to a target, an AI pilot may
 * come down to its height, but never under LOW_M: else a pilot sat on the
 * strip or skimming the grass could never be caught, tag's bubble being
 * 6 m. The floor is flat here, and what is built on it is passed through,
 * as the war's hunters do in their terminal run (warhunt.js). */
const TERMINAL_M = 150;
/* A target is aimed at this far over its centre: inside tag's 6 m bubble,
 * clear of its wings, so a catch is not a mid air that breaks the person
 * (a real collision still is one, judged by the referee as ever). */
const ABOVE_M = 3.5;
const LOW_M = 2;
/* A hunter this close (horizontally) is what an Ace runs from. */
const FLEE_M = 300;
const FLEE_EDGE_M = 25;
/* The prop's speed in the pose, rad/s: for drawing only. */
const PROP = 900;
/* A person's fresh flight is untouchable this long, parked or not
 * (src/main.js ROOM_SPAWN_MS; bots:selftest reads it there). */
export const SPAWN_MS = 5000;
/* How long a crashed AI pilot lies before it is born again: about as long
 * as a person reads a crash before pressing R, well inside the crash
 * cam's 9 s REPLAY prompt (src/replay/crashcam.js PROMPT_MS). */
export const DOWN_MS = 5000;
/* The Zagi's centre this close over the ground is its belly on it. */
export const CONTACT_M = 0.15;
const GRAVITY = 9.81;

/* The valley's axis, x at z: alps/terrain.js valleyAxis, its numbers
 * exactly (bots:selftest reads that file to be sure), on sinDet. */
export function valleyAxis(z) {
  return 180 * sinDet(z / 1500) + 60 * sinDet(z / 430 + 1.2);
}

/* mulberry32: one 32 bit word of state, saved with the room. */
export function nextRandom(state) {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: s, u: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/* The point put inside the corridor less `inset` metres, in place. An aim
 * is put further in than a position is held, so a turn toward an aim at
 * the edge ends before the edge rather than on it. */
function inside(a, inset = 0, low = CORRIDOR.yMin) {
  a[2] = Math.max(CORRIDOR.zMin + inset, Math.min(CORRIDOR.zMax - inset, a[2]));
  const x0 = valleyAxis(a[2]);
  a[0] = Math.max(x0 - CORRIDOR.half + inset, Math.min(x0 + CORRIDOR.half - inset, a[0]));
  a[1] = Math.max(low + (low < CORRIDOR.yMin ? 0 : inset / 2), Math.min(CORRIDOR.yMax - inset / 2, a[1]));
  return a;
}
const AIM_INSET = 20;

export class Bots {
  constructor(seed = 1, ground = groundOf(BOT_MAP)) {
    this.ground = ground;
    /* seat -> { seat, level, p, f (unit heading), r (right, banked), bank,
     * aim, aimAt (room ms the aim was read), wander, ms (room ms flown
     * to) }, in the order they were added. */
    this.list = new Map();
    this.rand = seed >>> 0;
    this.clamps = 0;
    this.clampMax = 0;
    /* Crashes, for the checks: on the ground, and from the referee. */
    this.crashes = { ground: 0, hit: 0 };
  }

  random() {
    const n = nextRandom(this.rand);
    this.rand = n.state;
    return n.u;
  }

  /* A point drawn anywhere in the corridor. */
  drawPoint() {
    const z = CORRIDOR.zMin + this.random() * (CORRIDOR.zMax - CORRIDOR.zMin);
    const x = valleyAxis(z) + (this.random() * 2 - 1) * CORRIDOR.half;
    const y = CORRIDOR.yMin + this.random() * (CORRIDOR.yMax - CORRIDOR.yMin);
    return inside([x, y, z], AIM_INSET);
  }

  /* A new AI pilot at `seat`, on `level` (a LEVELS key), born in the
   * air within 300 m of the strip at the origin, heading down the valley. */
  add(seat, level, roomMs) {
    if (!LEVELS[level]) {
      throw new Error(`bots: no level ${level}`);
    }
    const b = { seat, level, ms: roomMs };
    this.born(b, roomMs);
    this.list.set(seat, b);
  }

  /* b in the air again within 300 m of the strip at the origin, heading
   * down the valley, untouchable as a fresh flight is. */
  born(b, roomMs) {
    const z = (this.random() * 2 - 1) * 300;
    const p = inside([valleyAxis(z) + (this.random() * 2 - 1) * 60, 40 + this.random() * 30, z]);
    const f = this.random() < 0.5 ? [0, 0, -1] : [0, 0, 1];
    Object.assign(b, {
      p, f, r: [-f[2], 0, f[0]], bank: 0, boost: 1, low: CORRIDOR.yMin, aim: null, aimAt: -Infinity, wander: this.drawPoint(),
      down: null, spawnAt: roomMs,
    });
  }

  /* AI pilot `seat` crashed at roomMs (the referee broke a part of it):
   * it falls from where it is with the velocity it had. Nothing if it is
   * down already or untouchable. */
  crash(seat, roomMs, why = 'hit') {
    const b = this.list.get(seat);
    if (!b || b.down || this.spawning(b, roomMs)) {
      return false;
    }
    const v = LEVELS[b.level].speed * (b.boost || 1);
    b.down = { at: roomMs, restAt: null, v: [b.f[0] * v, b.f[1] * v, b.f[2] * v] };
    this.crashes[why] += 1;
    return true;
  }

  spawning(b, roomMs) {
    if (b.spawnAt == null) {
      return false;
    }
    if (roomMs - b.spawnAt >= SPAWN_MS) {
      b.spawnAt = null;
      return false;
    }
    return true;
  }

  /* One substep of a crashed b: a fall, stopped by the ground, where it
   * comes to rest at roomMs. */
  fall(b, dt, roomMs) {
    const v = b.down.v;
    const p = b.p;
    const floor = this.ground ? this.ground(p[0], p[2]) + CONTACT_M : -Infinity;
    if (p[1] <= floor) {
      p[1] = floor;
      v[0] = 0;
      v[1] = 0;
      v[2] = 0;
      b.down.restAt ??= roomMs;
      return;
    }
    v[1] -= GRAVITY * dt;
    p[0] += v[0] * dt;
    p[1] = Math.max(floor, p[1] + v[1] * dt);
    p[2] += v[2] * dt;
  }

  remove(seat) {
    this.list.delete(seat);
  }

  has(seat) {
    return this.list.has(seat);
  }

  seats() {
    return [...this.list.keys()];
  }

  /*
   * Every AI pilot flown to roomMs. orders(seat) is what the game wants of
   * it, read once per reaction time: { chase: { p, v }, boost } a target to
   * catch (led by the level's lead, flown at the level's speed times boost,
   * tag's CHASE_BOOST for a hunter), { flee: [p, ...] } the places to run
   * from, or null to wander. Returns [{ seat, pose }], pose as encodePose takes
   * it, t being roomMs.
   */
  step(roomMs, orders) {
    const out = [];
    for (const b of this.list.values()) {
      const lv = LEVELS[b.level];
      if (b.down && b.down.restAt != null && roomMs - b.down.restAt >= DOWN_MS) {
        this.born(b, roomMs);
      }
      if (b.down) {
        const gap = Math.min(GAP_MS, roomMs - b.ms);
        const n = gap > 0 ? Math.ceil(gap / SUB_MS) : 0;
        for (let k = 0; k < n; k += 1) {
          this.fall(b, gap / n / 1000, b.ms + (k + 1) * gap / n);
        }
        b.ms = Math.max(b.ms, roomMs);
        out.push({ seat: b.seat, pose: this.poseOf(b, lv, 0, roomMs) });
        continue;
      }
      if (roomMs - b.aimAt >= lv.react) {
        const order = orders(b.seat);
        b.aim = this.aimFor(b, lv, order);
        b.boost = (order && order.chase && order.boost) || 1;
        b.aimAt = roomMs;
      }
      const gap = Math.min(GAP_MS, roomMs - b.ms);
      let rate = 0;
      if (gap > 0) {
        const n = Math.ceil(gap / SUB_MS);
        for (let k = 0; k < n && !b.down; k += 1) {
          rate = this.fly(b, lv, gap / n / 1000);
          if (this.ground && b.p[1] <= this.ground(b.p[0], b.p[2]) + CONTACT_M && !this.spawning(b, b.ms + (k + 1) * gap / n)) {
            this.crash(b.seat, b.ms + (k + 1) * gap / n, 'ground');
          }
        }
      }
      b.ms = Math.max(b.ms, roomMs);
      out.push({ seat: b.seat, pose: this.poseOf(b, lv, rate, roomMs) });
    }
    return out;
  }

  aimFor(b, lv, order) {
    const p = b.p;
    b.low = CORRIDOR.yMin;
    if (order && order.chase) {
      const c = order.chase;
      const dx = c.p[0] - p[0];
      const dy = c.p[1] - p[1];
      const dz = c.p[2] - p[2];
      /* No lead on a target behind: it would aim ahead of itself and fly
       * away from the target (warhunt.js's lesson). */
      const behind = b.f[0] * dx + b.f[1] * dy + b.f[2] * dz < 0;
      const lead = behind ? 0 : Math.min(lv.lead, Math.sqrt(dx * dx + dy * dy + dz * dz) / lv.speed);
      b.low = dx * dx + dz * dz < TERMINAL_M * TERMINAL_M ? Math.max(LOW_M, Math.min(CORRIDOR.yMin, c.p[1])) : CORRIDOR.yMin;
      return inside([c.p[0] + c.v[0] * lead, c.p[1] + c.v[1] * lead + ABOVE_M, c.p[2] + c.v[2] * lead], AIM_INSET, b.low);
    }
    if (order && order.flee && order.flee.length) {
      let near = null;
      let best = FLEE_M * FLEE_M;
      for (const q of order.flee) {
        const d2 = (q[0] - p[0]) ** 2 + (q[2] - p[2]) ** 2;
        if (d2 < best) {
          best = d2;
          near = q;
        }
      }
      if (near) {
        /* Away from it, along the valley: the corridor is long and
         * narrow, so running across it ends at a wall. */
        const dz = p[2] - near[2];
        const away = dz === 0 ? (b.f[2] >= 0 ? 1 : -1) : Math.sign(dz);
        let z = p[2] + away * 400;
        if (z > CORRIDOR.zMax - 100 || z < CORRIDOR.zMin + 100) {
          /* Cornered at an end: turn back past it on the far side. */
          z = p[2] - away * 400;
        }
        /* The far side of the valley and the far end of the height band
         * from the hunter, so it must turn and climb or dive to follow;
         * FLEE_EDGE_M short of the band's edge, where a hunter's pitch,
         * lagging its aim, would only be held at the edge. */
        const y = near[1] < (CORRIDOR.yMin + CORRIDOR.yMax) / 2 ? CORRIDOR.yMax - FLEE_EDGE_M : CORRIDOR.yMin + FLEE_EDGE_M;
        return inside([valleyAxis(z) - (near[0] - valleyAxis(near[2])), y, z], AIM_INSET);
      }
    }
    const w = b.wander;
    if ((w[0] - p[0]) ** 2 + (w[1] - p[1]) ** 2 + (w[2] - p[2]) ** 2 < WANDER_M * WANDER_M) {
      b.wander = this.drawPoint();
    }
    return b.wander;
  }

  /* One substep of dt seconds toward b.aim. Returns the turn rate flown,
   * rad/s, signed: positive to the right. */
  fly(b, lv, dt) {
    const p = b.p;
    const a = b.aim || b.wander;
    let hx = a[0] - p[0];
    let hz = a[2] - p[2];
    const run = Math.sqrt(hx * hx + hz * hz);
    let slope = 0;
    if (run > 1e-6) {
      hx /= run;
      hz /= run;
      slope = (a[1] - p[1]) / Math.max(run, 40);
    } else {
      /* Right over or under the aim: on along the level heading. The
       * heading itself would do only while it is level, and fed back it
       * steepens every substep. */
      const n = Math.sqrt(b.f[0] * b.f[0] + b.f[2] * b.f[2]);
      hx = n > 1e-6 ? b.f[0] / n : -b.r[2];
      hz = n > 1e-6 ? b.f[2] / n : b.r[0];
    }
    /* Level off before the band's edges: the heading's pitch lags the aim
     * by the turn rate, and an aim at the edge would carry it past. */
    slope = Math.min(slope, (CORRIDOR.yMax - p[1]) / BAND_LOOK_M, SLOPE_MAX);
    slope = Math.max(slope, ((b.low ?? CORRIDOR.yMin) - p[1]) / BAND_LOOK_M, -SLOPE_MAX);
    /* The turn is a yaw and a pitch, each at most the turn rate: a turn
     * on the great circle toward an aim behind and above can pass through
     * the vertical, and flown on from there an AI pilot points at the
     * ground. */
    const f = b.f;
    const n = Math.sqrt(f[0] * f[0] + f[2] * f[2]);
    let gx = n > 1e-6 ? f[0] / n : -b.r[2];
    let gz = n > 1e-6 ? f[2] / n : b.r[0];
    const s0 = n > 1e-6 ? f[1] / n : 0;
    const turn = lv.turn * dt;
    const dot = gx * hx + gz * hz;
    const cross = gx * hz - gz * hx;
    const [ca, sa] = cosSin(turn);
    let rate;
    if (dot >= ca) {
      rate = dt > 0 ? Math.sqrt(Math.max(0, 2 - 2 * dot)) / dt * (cross >= 0 ? 1 : -1) : 0;
      gx = hx;
      gz = hz;
    } else {
      const sg = cross >= 0 ? 1 : -1;
      const x = gx * ca - gz * sa * sg;
      gz = gx * sa * sg + gz * ca;
      gx = x;
      rate = lv.turn * sg;
    }
    const s1 = s0 + Math.max(-turn, Math.min(turn, slope - s0));
    b.f = unit(gx, s1, gz);
    const step = lv.speed * (b.boost || 1) * dt;
    /* Under the band after a terminal run, it climbs back on its slope
     * and is never lifted at once. */
    const low = Math.max(LOW_M, Math.min(b.low ?? CORRIDOR.yMin, p[1]));
    p[0] += b.f[0] * step;
    p[1] += b.f[1] * step;
    p[2] += b.f[2] * step;
    const was = [p[0], p[1], p[2]];
    inside(p, 0, low);
    if (was[0] !== p[0] || was[1] !== p[1] || was[2] !== p[2]) {
      this.clamps += 1;
      this.clampMax = Math.max(this.clampMax, Math.sqrt((was[0] - p[0]) ** 2 + (was[1] - p[1]) ** 2 + (was[2] - p[2]) ** 2));
    }
    return rate;
  }

  /* The pose of b now, banked into its turn. */
  poseOf(b, lv, rate, roomMs) {
    const f = b.f;
    const n = Math.sqrt(f[0] * f[0] + f[2] * f[2]);
    const lr = n > 1e-6 ? [-f[2] / n, 0, f[0] / n] : b.r;
    b.bank = Math.max(-BANK_MAX, Math.min(BANK_MAX, rate * BANK_PER_TURN));
    const [cb, sb] = cosSin(b.bank);
    /* The level up of the heading, then right turned about the nose by
     * the bank: down on the inside of a right turn. */
    const ux = lr[1] * -f[2] - lr[2] * -f[1];
    const uy = lr[2] * -f[0] - lr[0] * -f[2];
    const uz = lr[0] * -f[1] - lr[1] * -f[0];
    b.r = unit(lr[0] * cb - ux * sb, lr[1] * cb - uy * sb, lr[2] * cb - uz * sb);
    const q = attitude(f, b.r);
    const v = b.down ? b.down.v : [f[0] * lv.speed * (b.boost || 1), f[1] * lv.speed * (b.boost || 1), f[2] * lv.speed * (b.boost || 1)];
    return {
      flags: (b.down ? FLAG_CRASHED : FLAG_AIRBORNE) | (this.spawning(b, roomMs) ? FLAG_SPAWNING : 0),
      seq: 0,
      t: roomMs,
      px: b.p[0], py: b.p[1], pz: b.p[2],
      qx: q[0], qy: q[1], qz: q[2], qw: q[3],
      vx: v[0], vy: v[1], vz: v[2],
      wx: 0, wy: rate, wz: 0,
      c0: 0, c1: 0, c2: 0, c3: 0,
      motor: b.down ? 0 : PROP,
      flaps: 0,
    };
  }

  save() {
    return {
      rand: this.rand,
      bots: [...this.list.values()].map((b) => ({
        seat: b.seat, level: b.level, p: b.p, f: b.f, r: b.r, bank: b.bank, boost: b.boost ?? 1, low: b.low ?? CORRIDOR.yMin, aim: b.aim, aimAt: b.aimAt === -Infinity ? null : b.aimAt, wander: b.wander, ms: b.ms,
        down: b.down, spawnAt: b.spawnAt,
      })),
      crashes: { ...this.crashes },
    };
  }

  restore(value) {
    this.list = new Map();
    this.rand = (value?.rand ?? 1) >>> 0;
    for (const b of value?.bots ?? []) {
      this.list.set(b.seat, {
        seat: b.seat, level: b.level, p: [...b.p], f: [...b.f], r: [...b.r], bank: b.bank, boost: b.boost ?? 1, low: b.low ?? CORRIDOR.yMin, aim: b.aim ? [...b.aim] : null, aimAt: b.aimAt ?? -Infinity, wander: [...b.wander], ms: b.ms,
        down: b.down ? { at: b.down.at, restAt: b.down.restAt ?? null, v: [...b.down.v] } : null, spawnAt: b.spawnAt ?? null,
      });
    }
    this.crashes = { ground: 0, hit: 0, ...(value?.crashes ?? {}) };
  }
}
