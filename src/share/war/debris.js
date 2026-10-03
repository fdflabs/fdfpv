/*
 * debris.js: where the chunks a warhead broke (src/share/war/damage.js)
 * fly and come to rest. The room decides what broke and sends it
 * (edge/rooms/war.js strike); every screen flies the pieces itself, from
 * the event alone, on the room clock: DETERMINISTIC, not physics the
 * craft meets. A piece's pose at room ms t is a function of its event,
 * its chunk and the map's floor, stepped at STEP_MS from the event's
 * `at`, so every screen draws the same rubble in the same place at the
 * same moment, and a pilot who joins late steps the pieces up to now and
 * sees them where the others do. The craft flies through them: a broken
 * chunk's colliders are retired, and nothing takes their place.
 *
 * What a piece meets is the floor (floorAt(x, z, y): the highest drawn
 * top at or under y, terrain or roof, never water, which a piece sinks
 * through), never a wall. On the floor it bounces (BOUNCE of its fall
 * back up), slides (FRICTION of its run kept a contact) and sleeps once
 * slower than SLEEP_MPS: from then on it is still, and costs nothing.
 * A piece that has not slept by LIFE_MS sleeps where it is.
 *
 * How it leaves: a chunk the blast broke flies from the blast, at
 * THROW_MPS by the blast's share of what broke it, plus a seeded scatter;
 * a chunk that fell (the support check) drops with a nudge. Each spins at
 * a seeded rate up to SPIN. Seeds are integer hashes of the event's seq
 * and the chunk's index, so no draw depends on the order pieces are made.
 *
 * Only + - * / and Math.sqrt. A pose is { p: [x, y, z], q: [x, y, z, w] }.
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

import { CHARGE, DEFENDER, chunkDistance } from './damage.js';
import { turnDir, turnPoint } from './leaf.js';

export const STEP_MS = 1000 / 60;
const DT = 1 / 60;
const G = 9.81;
export const THROW_MPS = 22;
export const BOUNCE = 0.25;
export const FRICTION = 0.55;
export const SLEEP_MPS = 0.6;
export const SPIN = 2.5;
export const LIFE_MS = 20000;
/* How far a piece's box stands over its centre, as a share of its
 * smallest half extent: it rests on its broad face. */
const REST = 1;

/* A seeded draw in [0, 1) from three integers, the same on every engine. */
function draw(a, b, c) {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b) ^ Math.imul(c + 13, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/* The warhead an event was (its `by`): the table's, for the throw. */
function warheadOf(by) {
  return Object.hasOwn(CHARGE, by) ? CHARGE[by] : DEFENDER.standard;
}

/* The quaternion of a chunk's box: its axes e0, e1, e0 x e1 as columns. */
function quatOf(e) {
  const a = [e[0], e[1], e[2]];
  const b = [e[3], e[4], e[5]];
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const m00 = a[0];
  const m11 = b[1];
  const m22 = c[2];
  const tr = m00 + m11 + m22;
  let x;
  let y;
  let z;
  let w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = s / 4;
    x = (b[2] - c[1]) / s;
    y = (c[0] - a[2]) / s;
    z = (a[1] - b[0]) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (b[2] - c[1]) / s;
    x = s / 4;
    y = (b[0] + a[1]) / s;
    z = (c[0] + a[2]) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (c[0] - a[2]) / s;
    x = (b[0] + a[1]) / s;
    y = s / 4;
    z = (c[1] + b[2]) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (a[1] - b[0]) / s;
    x = (c[0] + a[2]) / s;
    y = (c[1] + b[2]) / s;
    z = s / 4;
  }
  return [x, y, z, w];
}

/* Chunk ch of structure s as it stood with a gate's leaf turned by t
 * (src/share/war/leaf.js): moved if it is the leaf's, else itself. */
export function standing(s, ch, t) {
  const h = s.frame.hinge;
  if (!h || !t || !ch.m) {
    return ch;
  }
  return {
    ...ch, c: turnPoint(h, t, ch.c), e: [...turnDir(h, t, ch.e.slice(0, 3)), ...turnDir(h, t, ch.e.slice(3, 6))],
  };
}

/*
 * The pieces of one damage event (war.js strike's, as roomwar.js passes
 * it on) of structure s: one a removed chunk, its box's size, in the
 * event's chunks order. `kind` is the chunk's, for its look. A gate's
 * leaf turned by t (leaf.js) at the event: each piece starts where its
 * chunk stood then.
 */
export function piecesOf(e, s, t = null) {
  const fell = new Set(e.fell);
  const w = warheadOf(e.by);
  return e.chunks.map((i) => {
    const ch = standing(s, s.chunks[i], t);
    const r1 = draw(e.seq, i, 1);
    const r2 = draw(e.seq, i, 2);
    const r3 = draw(e.seq, i, 3);
    const v = [(r1 - 0.5) * 2, 0.5 + r2, (r3 - 0.5) * 2];
    if (!fell.has(i) && e.p) {
      const d = [ch.c[0] - e.p[0], ch.c[1] - e.p[1], ch.c[2] - e.p[2]];
      const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
      const q = chunkDistance(ch, e.p) / w.r;
      const speed = THROW_MPS / (1 + q * q);
      v[0] = v[0] * 2 + (d[0] / l) * speed;
      v[1] = v[1] * 2 + (d[1] / l) * speed + speed * 0.3;
      v[2] = v[2] * 2 + (d[2] / l) * speed;
    }
    const spin = [(draw(e.seq, i, 4) - 0.5) * 2 * SPIN, (draw(e.seq, i, 5) - 0.5) * 2 * SPIN, (draw(e.seq, i, 6) - 0.5) * 2 * SPIN];
    return {
      target: e.target, chunk: i, kind: ch.k, h: ch.h.slice(), at: e.at,
      t: e.at, p: ch.c.slice(), v, q: quatOf(ch.e), w: spin, asleep: false,
    };
  });
}

/* q turned by the rate w over DT, normalised. */
function spinStep(q, w) {
  const hx = w[0] * DT * 0.5;
  const hy = w[1] * DT * 0.5;
  const hz = w[2] * DT * 0.5;
  const x = q[0] + (hx * q[3] + hy * q[2] - hz * q[1]);
  const y = q[1] + (hy * q[3] + hz * q[0] - hx * q[2]);
  const z = q[2] + (hz * q[3] + hx * q[1] - hy * q[0]);
  const ww = q[3] - (hx * q[0] + hy * q[1] + hz * q[2]);
  const n = Math.sqrt(x * x + y * y + z * z + ww * ww);
  q[0] = x / n;
  q[1] = y / n;
  q[2] = z / n;
  q[3] = ww / n;
}

/*
 * Piece `pc` stepped on to room ms t (never back), in place, against
 * floorAt(x, z, y). Returns pc.
 */
export function advance(pc, t, floorAt) {
  const rest = Math.min(pc.h[0], pc.h[1], pc.h[2]) * REST;
  while (!pc.asleep && pc.t + STEP_MS <= t) {
    pc.t += STEP_MS;
    if (pc.t - pc.at >= LIFE_MS) {
      pc.asleep = true;
      break;
    }
    const v = pc.v;
    v[1] -= G * DT;
    const p = pc.p;
    p[0] += v[0] * DT;
    p[1] += v[1] * DT;
    p[2] += v[2] * DT;
    spinStep(pc.q, pc.w);
    const floor = floorAt(p[0], p[2], p[1] + rest + 1);
    if (p[1] - rest > floor) {
      continue;
    }
    p[1] = floor + rest;
    if (v[1] < 0) {
      v[1] = -v[1] * BOUNCE;
    }
    v[0] *= FRICTION;
    v[2] *= FRICTION;
    for (let k = 0; k < 3; k += 1) {
      pc.w[k] *= FRICTION;
    }
    if (v[0] * v[0] + v[1] * v[1] + v[2] * v[2] < SLEEP_MPS * SLEEP_MPS) {
      pc.asleep = true;
    }
  }
  if (pc.asleep) {
    pc.t = Math.max(pc.t, t);
  }
  return pc;
}

/*
 * What a break is made of, for its sound (src/render/world-audio.js
 * breach): each chunk kind's material, and the share of its box that is
 * that material, sized from what is drawn: a gate's skin panel is 20 mm
 * plate and its ribs, a penstock's segment a 30 mm shell round its bore,
 * a beam or a post a box section, the intake's column a hollow shaft, a
 * transformer's tank its core and oil in a shell. Times the material's
 * density, kg.
 */
const KIND = Object.freeze({
  skin: ['steel', 0.03],
  girder: ['steel', 0.1],
  arm: ['steel', 0.1],
  brace: ['steel', 0.1],
  trunnion: ['steel', 0.3],
  hoist: ['steel', 0.2],
  leaf: ['steel', 0.08],
  shell: ['steel', 0.012],
  cover: ['steel', 0.1],
  post: ['steel', 0.1],
  beam: ['steel', 0.1],
  column: ['concrete', 0.15],
  tank: ['transformer', 0.25],
  bushing: ['transformer', 0.5],
});
const DENSITY = Object.freeze({ steel: 7850, concrete: 2400, transformer: 7850 });

/* A chunk's material and mass, kg. */
export function massOf(ch) {
  const kind = KIND[ch.k];
  if (!kind) {
    throw new Error(`debris: no material for a ${ch.k}`);
  }
  const [material, fill] = kind;
  return { material, mass: 8 * ch.h[0] * ch.h[1] * ch.h[2] * DENSITY[material] * fill };
}

/*
 * One damage event of structure s as one break heard: at the event's
 * room ms, at the mass weighted middle of what broke, of the material
 * most of its mass is, and all of its mass. Null for an event that took
 * nothing out.
 */
export function breachOf(e, s) {
  const by = {};
  let mass = 0;
  const p = [0, 0, 0];
  for (const i of e.chunks) {
    const ch = s.chunks[i];
    const m = massOf(ch);
    by[m.material] = (by[m.material] ?? 0) + m.mass;
    mass += m.mass;
    for (let k = 0; k < 3; k += 1) {
      p[k] += ch.c[k] * m.mass;
    }
  }
  if (!(mass > 0)) {
    return null;
  }
  const material = Object.keys(by).sort((a, b) => by[b] - by[a] || (a < b ? -1 : 1))[0];
  return {
    at: e.at, position: p.map((v) => v / mass), material, mass,
  };
}
