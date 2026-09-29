/*
 * power.js: the transmission lines, their towers and their conductors,
 * in numbers: where every tower stands and how tall, where each wire
 * hangs from, the chords each span's sag is drawn and collided with, and
 * the capsules a craft meets.
 *
 * OpenStreetMap gives each line's run as nodes, most of them towers
 * (power=tower, portal or pole) and the rest the points inside a
 * substation where the run ends on a gantry; it gives the voltage and not
 * the tower. So a tower's size is by the highest voltage it carries, in
 * the proportions of the region's lattice towers (the photographs
 * powerlines and aerial-dam-2: a waisted tower with one crossarm and
 * three phases across it, a shield wire over them), and a node that is
 * not a tower is a gantry. A conductor hangs with a sag of 2 % of its
 * span (docs/ITAIPU-PLAN.md section 7), as a parabola, cut into chords no
 * longer than CHORD: the drawn wire and the collided wire are the same
 * chords, so what a craft meets is exactly what is drawn.
 *
 * Every number here is + - * / and a square root on the data, so the
 * capsules are the same on every machine (CLAUDE.md, determinism).
 *
 * Pure: no THREE, so the checks run it in Node.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* Section 7: a conductor is a 0.1 m capsule and sags 2 % of its span. */
export const WIRE_R = 0.1;
export const SAG = 0.02;
/* The longest chord a span is cut into, metres: over a 400 m span sagging
 * 8 m, a 25 m chord stands at most 8 / 16^2 = 3 cm off the parabola. */
export const CHORD = 25;

/*
 * A tower by the voltage it carries: its height, the crossarm's height,
 * the phases' spacing either side of the middle, and the base's side.
 * Metres. 765 and 500 kV from the Furnas and Itaipu lines in the
 * photographs, the lower voltages scaled down the same way.
 */
const TOWERS = [
  { kv: 700, h: 52, arm: 40, phase: 13, base: 12 },
  { kv: 400, h: 45, arm: 34, phase: 11, base: 10 },
  { kv: 200, h: 36, arm: 28, phase: 7.5, base: 8 },
  { kv: 60, h: 26, arm: 20, phase: 4.5, base: 5 },
  { kv: 0, h: 20, arm: 16, phase: 3, base: 4 },
];
/* A substation's gantry and a pole, whatever they carry. */
const PORTAL = { h: 18, arm: 17, phase: 4 };
const POLE = { h: 14, arm: 12.5, phase: 1.6 };

function kvOf(line) {
  const v = Number(String(line.voltage ?? '').split(';')[0]);
  return v > 0 ? v / 1000 : 0;
}

function towerSize(kv) {
  return TOWERS.find((t) => kv >= t.kv);
}

function unit(x, z) {
  const l = Math.hypot(x, z);
  return l > 1e-9 ? [x / l, z / l] : [1, 0];
}

/*
 * The lines laid out. `data` is osm/power.json, `ground(x, z)` the
 * terrain. Returns the structures (towers, gantries, poles) with their
 * frames and sizes, and the wires as chords [ax, ay, az, bx, by, bz].
 */
export function layOut(data, ground) {
  const known = new Map(data.towers.map((t) => [t.id, t]));
  const nodes = new Map();
  const node = (id, x, z) => {
    let n = nodes.get(id);
    if (!n) {
      const t = known.get(id);
      n = { id, x, z, kind: t ? t.kind : 'portal', kv: 0, dx: 0, dz: 0, lines: 0 };
      nodes.set(id, n);
    }
    return n;
  };
  /* Each node's direction: the sum of its spans' directions, so a tower
   * at an angle stands on the bisector, as the real ones do. */
  for (const line of data.lines) {
    const kv = kvOf(line);
    for (let k = 0; k < line.nodes.length; k += 1) {
      const [x, z] = line.points[k];
      const n = node(line.nodes[k], x, z);
      n.kv = Math.max(n.kv, kv);
      n.lines += 1;
      const a = line.points[Math.max(0, k - 1)];
      const b = line.points[Math.min(line.points.length - 1, k + 1)];
      const [ux, uz] = unit(b[0] - a[0], b[1] - a[1]);
      /* Keep one sense along a node shared by lines running opposite
       * ways. */
      const s = n.dx * ux + n.dz * uz < 0 ? -1 : 1;
      n.dx += ux * s;
      n.dz += uz * s;
    }
  }
  /* The towers no line runs through stand too (a line cut at the hero's
   * edge leaves its next tower). */
  for (const t of data.towers) {
    node(t.id, t.x, t.z);
  }
  const structures = [];
  for (const n of nodes.values()) {
    const [ax, az] = unit(n.dx, n.dz);
    const size = n.kind === 'tower' ? towerSize(n.kv) : n.kind === 'pole' ? POLE : PORTAL;
    const y = ground(n.x, n.z);
    n.frame = { ax, az, px: -az, pz: ax, y, size };
    structures.push({
      id: n.id, kind: n.kind, x: n.x, z: n.z, y, ax, az, size, kv: n.kv,
    });
  }
  const wires = [];
  for (const line of data.lines) {
    for (let k = 0; k + 1 < line.nodes.length; k += 1) {
      const a = nodes.get(line.nodes[k]);
      const b = nodes.get(line.nodes[k + 1]);
      const span = Math.hypot(b.x - a.x, b.z - a.z);
      if (!(span > 1)) {
        continue;
      }
      /* The phases, each on the side of the line it hangs on at both
       * ends (the frames' perpendiculars may point either way). */
      const flip = a.frame.px * b.frame.px + a.frame.pz * b.frame.pz < 0 ? -1 : 1;
      const hangs = [-1, 0, 1].map((k3) => [
        [a.x + a.frame.px * a.frame.size.phase * k3, a.frame.y + a.frame.size.arm, a.z + a.frame.pz * a.frame.size.phase * k3],
        [b.x + b.frame.px * b.frame.size.phase * k3 * flip, b.frame.y + b.frame.size.arm, b.z + b.frame.pz * b.frame.size.phase * k3 * flip],
      ]);
      /* The shield wire, tower top to tower top. */
      if (a.kind === 'tower' && b.kind === 'tower') {
        hangs.push([[a.x, a.frame.y + a.frame.size.h, a.z], [b.x, b.frame.y + b.frame.size.h, b.z]]);
      }
      for (const [p, q] of hangs) {
        hang(p, q, span, wires);
      }
    }
  }
  return { structures, wires };
}

/* One wire from p to q as chords of its parabola, into `out`. */
function hang(p, q, span, out) {
  const sag = SAG * span;
  const n = Math.max(1, Math.ceil(span / CHORD));
  let prev = p;
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const cur = [
      p[0] + (q[0] - p[0]) * t,
      p[1] + (q[1] - p[1]) * t - 4 * sag * t * (1 - t),
      p[2] + (q[2] - p[2]) * t,
    ];
    out.push([prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]]);
    prev = cur;
  }
}

/*
 * A structure's pieces, [ax, ay, az, bx, by, bz, r]: for a tower its four
 * legs from the base's corners to the crossarm's, tapering to a waist,
 * and the crossarm across the line; for a gantry its two posts and the
 * beam; for a pole the pole and its arm. The same pieces are drawn (as
 * square bars) and collided (as capsules, kind `pole`), and so is a
 * tower's bracing (bracesOf).
 */
export function piecesOf(s) {
  const { x, z, y, ax, az, size } = s;
  const px = -az;
  const pz = ax;
  const at = (u, v, h) => [x + ax * u + px * v, y + h, z + az * u + pz * v];
  const bar = (p, q, r) => [...p, ...q, r];
  if (s.kind === 'tower') {
    const b = size.base / 2;
    const w = 1.1;
    const legs = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      legs.push(bar(at(su * b, sv * b, -0.5), at(su * w, sv * w, size.h - 1), 0.3));
    }
    const reach = size.phase + 1;
    return [...legs, bar(at(0, -reach, size.arm + 0.6), at(0, reach, size.arm + 0.6), 0.5)];
  }
  if (s.kind === 'pole') {
    return [bar(at(0, 0, -0.5), at(0, 0, size.h), 0.2), bar(at(0, -size.phase - 0.3, size.arm + 0.2), at(0, size.phase + 0.3, size.arm + 0.2), 0.1)];
  }
  const reach = size.phase + 1.5;
  return [
    bar(at(0, -reach, -0.5), at(0, -reach, size.h), 0.35),
    bar(at(0, reach, -0.5), at(0, reach, size.h), 0.35),
    bar(at(0, -reach, size.arm + 0.5), at(0, reach, size.arm + 0.5), 0.35),
  ];
}

/*
 * A tower's bracing: on each face, crossed diagonals between the legs in
 * BRACES bays from the base to the crossarm, and a strut across the top
 * of each bay. Drawn and collided like the legs: a craft flown into a
 * tower's face meets the lattice it sees, and only a gap in it as big as
 * the real one's lets it through.
 */
const BRACES = 3;
export function bracesOf(s) {
  if (s.kind !== 'tower') {
    return [];
  }
  const legs = piecesOf(s).slice(0, 4);
  const pointOn = (leg, t) => [leg[0] + (leg[3] - leg[0]) * t, leg[1] + (leg[4] - leg[1]) * t, leg[2] + (leg[5] - leg[2]) * t];
  const top = (s.size.arm - 1) / (s.size.h - 1);
  const out = [];
  for (let f = 0; f < 4; f += 1) {
    const l0 = legs[f];
    const l1 = legs[(f + 1) % 4];
    for (let k = 0; k < BRACES; k += 1) {
      const t0 = (top * k) / BRACES;
      const t1 = (top * (k + 1)) / BRACES;
      out.push([...pointOn(l0, t0), ...pointOn(l1, t1), 0.1]);
      out.push([...pointOn(l1, t0), ...pointOn(l0, t1), 0.1]);
      out.push([...pointOn(l0, t1), ...pointOn(l1, t1), 0.1]);
    }
  }
  return out;
}
