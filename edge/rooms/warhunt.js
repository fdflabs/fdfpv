/*
 * warhunt.js: the war room's hunters (docs/WARFARE-PLAN.md section 4.4),
 * the one attacker whose path depends on the players, so the room flies
 * it and sends its pose. edge/rooms/war.js owns the Hunters and calls
 * step() once a room tick with the defenders' last relayed poses.
 *
 * STEERING. Pure pursuit with lead: aim at the target's position plus its
 * velocity times the time to get there at HUNTER_SPEED (capped at
 * LEAD_MAX_S), and turn the heading toward the aim at no more than
 * TURN_RATE. Speed is constant. The target is the nearest live defender
 * within TARGET_RANGE_M, a tie to the lower seat, re-chosen when it dies
 * or leaves the list and every RETARGET_MS; with no target a hunter
 * heads back to its home (the point it was spawned to patrol, level at
 * its own height) until it is within HOME_M of it, and otherwise holds
 * its heading and levels off. Without a home it would fly on out of
 * every pilot's range for good, and a war is not won while it lives.
 *
 * THE FLOOR. A hunter holds CLEAR_M over the floor (the heightfield's
 * floorAt, which folds in water and the dam: tools/itaipu/
 * build_war_height.py), looking ahead along its course so it climbs
 * before a wall, and is lifted onto the floor plus clearance if its turn
 * rate could not climb in time, and never more than CEILING_M over it.
 * The one exception is the last TERMINAL_M
 * to its target: there the clearance is the target's own over the floor
 * (never below 0), or a defender skimming the reservoir at 5 m could
 * never be reached, since the bubble is BLAST_M = 6.
 *
 * DETERMINISM. Plain arithmetic and Math.sqrt only (correctly rounded
 * everywhere): the turn's sine and cosine are Taylor series, exact to
 * 1e-12 at the largest angle a substep turns. Elapsed room time is flown
 * in equal substeps of at most SUB_MS, and a gap over GAP_MS (a stalled
 * or restored room) flies only GAP_MS, so the same calls give the same
 * poses bit for bit, whatever the tick jitter was.
 *
 * FRAMES. Positions and velocities are scene world metres, y up, as the
 * POSE wire carries them (src/share/roomwire.js). The attitude is the
 * scene frame's craft convention (src/render/frame.js: nose -z, top +y):
 * the nose along the flight path, wings level, no roll.
 *
 * WHAT OWNS WHAT. A Hunters lives inside one room, which runs one event at
 * a time, so nothing here locks. save() is plain JSON for the room's
 * store and restore() takes it back.
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

/* 0.7 of section 4.4's 36 m/s and 2.5 rad/s (the owner slowed every
 * attacker by 30 % on 2026-09-29): the same turn radius, 14.4 m. */
export const HUNTER_SPEED = 25.2;
export const TURN_RATE = 1.75;
export const TARGET_RANGE_M = 1500;
export const RETARGET_MS = 5000;
export const CLEAR_M = 25;
export const TERMINAL_M = 200;
export const LEAD_MAX_S = 3;
export const SUB_MS = 50;
export const GAP_MS = 1000;
export const HOME_M = 150;
/* The most a hunter flies over the floor: a war is fought low (the
 * highest attackers, mission 1's Loiterers, circle 431 m over the
 * water), and a hunter lured upward must not leave every pilot's reach.
 * A pilot higher than this is out of its reach too, by choice. */
export const CEILING_M = 500;
/* Horizontal distances ahead at which the floor is read, metres: the
 * farthest is 6.3 s at speed, time to climb a gorge wall at SLOPE_MAX. */
const LOOK_M = [40, 80, 160];
/* The steepest the aim may climb or dive, rise over run. */
const SLOPE_MAX = 2;

/* The heightfield's layout (tools/itaipu/build_war_height.py). */
export const HEIGHT_CELLS = 256;
export const HEIGHT_CELL_M = 40;
export const HEIGHT_HALF = 5120;
export const HEIGHT_BYTES = HEIGHT_CELLS * HEIGHT_CELLS * 2;

/*
 * The floor from itaipu-height.bin's bytes (an ArrayBuffer or a typed
 * array over one). Bilinear between cell centres; outside the hero square
 * the nearest edge cell's value, which past the square's north edge is
 * the reservoir and elsewhere the plateau the edge reaches.
 */
export function loadHeight(buffer) {
  const bytes = ArrayBuffer.isView(buffer)
    ? new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : new DataView(buffer);
  if (bytes.byteLength !== HEIGHT_BYTES) {
    throw new Error(`warhunt: the heightfield is ${bytes.byteLength} bytes, not ${HEIGHT_BYTES}`);
  }
  const y = new Float64Array(HEIGHT_CELLS * HEIGHT_CELLS);
  for (let k = 0; k < y.length; k += 1) {
    y[k] = bytes.getUint16(2 * k, true) * 0.1 - 1000;
  }
  const last = HEIGHT_CELLS - 1;
  return {
    floorAt(x, z) {
      const gx = Math.max(0, Math.min(last, (x + HEIGHT_HALF) / HEIGHT_CELL_M - 0.5));
      const gz = Math.max(0, Math.min(last, (z + HEIGHT_HALF) / HEIGHT_CELL_M - 0.5));
      const i = Math.min(last - 1, Math.floor(gx));
      const j = Math.min(last - 1, Math.floor(gz));
      const u = gx - i;
      const v = gz - j;
      const k = j * HEIGHT_CELLS + i;
      const a = y[k] + (y[k + 1] - y[k]) * u;
      const b = y[k + HEIGHT_CELLS] + (y[k + HEIGHT_CELLS + 1] - y[k + HEIGHT_CELLS]) * u;
      return a + (b - a) * v;
    },
  };
}

/* No map: flat ground at y 0. */
const FLAT = { floorAt: () => 0 };

function cosSin(a) {
  const a2 = a * a;
  const c = 1 - a2 / 2 * (1 - a2 / 12 * (1 - a2 / 30));
  const s = a * (1 - a2 / 6 * (1 - a2 / 20 * (1 - a2 / 42)));
  return [c, s];
}

function unit(x, y, z) {
  const n = Math.sqrt(x * x + y * y + z * z);
  return [x / n, y / n, z / n];
}

/* The scene quaternion [x, y, z, w] of a body whose -z is the unit f and
 * whose +x is the level unit r, w >= 0. */
function attitude(f, r) {
  const bx = -f[0];
  const by = -f[1];
  const bz = -f[2];
  const ux = by * r[2] - bz * r[1];
  const uy = bz * r[0] - bx * r[2];
  const uz = bx * r[1] - by * r[0];
  /* Columns r, u, b; Shepperd's method on m[row][col]. */
  const m00 = r[0]; const m01 = ux; const m02 = bx;
  const m10 = r[1]; const m11 = uy; const m12 = by;
  const m20 = r[2]; const m21 = uz; const m22 = bz;
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  return q[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
}

export class Hunters {
  constructor(height) {
    this.height = height || FLAT;
    /* id -> { id, p, f (unit heading, or null before the first step), r
     * (level right, for a vertical heading), target (seat or -1), chosen
     * (room ms of the choice), ms (room ms flown to) }, in spawn order. */
    this.list = new Map();
    /* How often, and by how much at most, the hard floor lifted a hunter
     * its steering had not: numbers for the check, not state. */
    this.lifts = 0;
    this.liftMax = 0;
  }

  spawn(id, pos, roomMs, home = null) {
    this.list.set(id, {
      id, p: [pos[0], pos[1], pos[2]], f: null, r: [1, 0, 0], target: -1, chosen: roomMs, ms: roomMs, home: home ? [home[0], home[2]] : null,
    });
  }

  kill(id) {
    this.list.delete(id);
  }

  /* An EMP: the hunter holds where it is, flying nowhere, until room ms
   * `until` (edge/rooms/war.js). */
  stall(id, until) {
    const h = this.list.get(id);
    if (h) {
      h.stallUntil = until;
    }
  }

  step(roomMs, defenders) {
    const out = [];
    for (const h of this.list.values()) {
      if (h.stallUntil > roomMs) {
        h.ms = roomMs;
        out.push({ id: h.id, p: [h.p[0], h.p[1], h.p[2]], q: attitude(h.f || [0, 0, -1], h.r), target: h.target });
        continue;
      }
      this.choose(h, roomMs, defenders);
      const gap = Math.min(GAP_MS, roomMs - h.ms);
      if (gap > 0) {
        const n = Math.ceil(gap / SUB_MS);
        const tgt = h.target < 0 ? null : defenders.find((d) => d.seat === h.target);
        for (let k = 0; k < n; k += 1) {
          this.fly(h, tgt, gap / n / 1000);
        }
      }
      h.ms = Math.max(h.ms, roomMs);
      if (!h.f) {
        this.fly(h, h.target < 0 ? null : defenders.find((d) => d.seat === h.target), 0);
      }
      out.push({ id: h.id, p: [h.p[0], h.p[1], h.p[2]], q: attitude(h.f, h.r), target: h.target });
    }
    return out;
  }

  choose(h, roomMs, defenders) {
    const cur = h.target < 0 ? null : defenders.find((d) => d.seat === h.target);
    if (cur && cur.live && roomMs - h.chosen < RETARGET_MS) {
      return;
    }
    let best = null;
    let bestD2 = TARGET_RANGE_M * TARGET_RANGE_M;
    for (const d of defenders) {
      if (!d.live) {
        continue;
      }
      const dx = d.p[0] - h.p[0];
      const dy = d.p[1] - h.p[1];
      const dz = d.p[2] - h.p[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2 || (d2 === bestD2 && best && d.seat < best.seat)) {
        best = d;
        bestD2 = d2;
      }
    }
    h.target = best ? best.seat : -1;
    h.chosen = roomMs;
  }

  /* One substep of dt seconds toward tgt (a defender or null). */
  fly(h, tgt, dt) {
    const floorAt = (x, z) => this.height.floorAt(x, z);
    const p = h.p;
    let ax;
    let ay;
    let az;
    let clear = CLEAR_M;
    if (tgt) {
      const dx = tgt.p[0] - p[0];
      const dy = tgt.p[1] - p[1];
      const dz = tgt.p[2] - p[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      /* A target behind it gets no lead: led, one on its tail puts the
       * aim just ahead of the hunter, which then flies on (and up) for
       * good instead of turning to meet it. */
      const f = h.f;
      const behind = f && f[0] * dx + f[1] * dy + f[2] * dz < 0;
      const lead = behind ? 0 : Math.min(LEAD_MAX_S, dist / HUNTER_SPEED);
      ax = tgt.p[0] + tgt.v[0] * lead;
      ay = tgt.p[1] + tgt.v[1] * lead;
      az = tgt.p[2] + tgt.v[2] * lead;
      if (dist < TERMINAL_M) {
        clear = Math.max(0, Math.min(CLEAR_M, tgt.p[1] - floorAt(tgt.p[0], tgt.p[2])));
      }
    } else if (h.home && (h.home[0] - p[0]) * (h.home[0] - p[0]) + (h.home[1] - p[2]) * (h.home[1] - p[2]) > HOME_M * HOME_M) {
      ax = h.home[0];
      ay = p[1];
      az = h.home[1];
    } else {
      const f = h.f || [0, 0, -1];
      const n = Math.sqrt(f[0] * f[0] + f[2] * f[2]);
      const hx = n > 1e-6 ? f[0] / n : h.r[2];
      const hz = n > 1e-6 ? f[2] / n : -h.r[0];
      ax = p[0] + hx * LOOK_M[LOOK_M.length - 1];
      ay = p[1];
      az = p[2] + hz * LOOK_M[LOOK_M.length - 1];
    }
    let hx = ax - p[0];
    let hz = az - p[2];
    const run = Math.sqrt(hx * hx + hz * hz);
    let slope;
    if (run > 1e-6) {
      hx /= run;
      hz /= run;
      slope = (Math.max(ay, floorAt(ax, az) + clear) - p[1]) / run;
      for (const s of LOOK_M) {
        if (s < run) {
          slope = Math.max(slope, (floorAt(p[0] + hx * s, p[2] + hz * s) + clear - p[1]) / s);
        }
      }
      slope = Math.max(-SLOPE_MAX, Math.min(SLOPE_MAX, slope));
    } else {
      hx = 0;
      hz = 0;
      slope = ay >= p[1] ? 1 : -1;
    }
    /* Never aim over the ceiling. */
    slope = Math.min(slope, run > 1e-6 ? (floorAt(p[0], p[2]) + CEILING_M - p[1]) / Math.max(run, LOOK_M[0]) : slope);
    const d = unit(hx, slope, hz);
    this.turn(h, d, TURN_RATE * dt);
    const f = h.f;
    const step = HUNTER_SPEED * dt;
    p[0] += f[0] * step;
    p[1] += f[1] * step;
    p[2] += f[2] * step;
    const low = floorAt(p[0], p[2]) + clear;
    if (p[1] < low) {
      this.lifts += 1;
      this.liftMax = Math.max(this.liftMax, low - p[1]);
      p[1] = low;
    }
    p[1] = Math.min(p[1], floorAt(p[0], p[2]) + CEILING_M);
  }

  /* Turn h.f toward the unit d by at most a radians; an unset heading
   * takes d whole. */
  turn(h, d, a) {
    const f = h.f;
    if (!f) {
      h.f = d;
      this.right(h);
      return;
    }
    const c = f[0] * d[0] + f[1] * d[1] + f[2] * d[2];
    const [ca, sa] = cosSin(a);
    if (c >= ca) {
      h.f = d;
      this.right(h);
      return;
    }
    let wx = d[0] - f[0] * c;
    let wy = d[1] - f[1] * c;
    let wz = d[2] - f[2] * c;
    let wn = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (wn < 1e-9) {
      /* d is straight behind: turn through the level right. */
      [wx, wy, wz] = h.r;
      wn = 1;
    }
    h.f = unit(f[0] * ca + wx / wn * sa, f[1] * ca + wy / wn * sa, f[2] * ca + wz / wn * sa);
    this.right(h);
  }

  /* The level right of the heading (up x back), kept from before when the
   * heading is vertical. */
  right(h) {
    const [x, , z] = h.f;
    const n = Math.sqrt(x * x + z * z);
    if (n > 1e-6) {
      h.r = [-z / n, 0, x / n];
    }
  }

  save() {
    return {
      hunters: [...this.list.values()].map((h) => ({
        id: h.id, p: h.p, f: h.f, r: h.r, target: h.target, chosen: h.chosen, ms: h.ms, home: h.home, stallUntil: h.stallUntil ?? null,
      })),
    };
  }

  restore(value) {
    this.list = new Map();
    for (const h of value?.hunters ?? []) {
      this.list.set(h.id, {
        id: h.id, p: [...h.p], f: h.f ? [...h.f] : null, r: [...h.r], target: h.target, chosen: h.chosen, ms: h.ms, home: h.home ? [...h.home] : null, stallUntil: h.stallUntil ?? null,
      });
    }
  }
}
