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
 * chords, so what a craft meets is exactly what is drawn. A phase is a
 * bundle of one, two or four conductors (OSM's `wires`, else by voltage),
 * drawn each and collided as the one capsule round the bundle; on a
 * tower it hangs from an insulator string, which is drawn and collided
 * too.
 *
 * Every number here is + - * / and a square root on the data, so the
 * capsules are the same on every machine (CLAUDE.md, determinism).
 *
 * Pure: no THREE, so the checks run it in Node.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* Section 7: a conductor sags 2 % of its span. */
export const SAG = 0.02;
/*
 * A conductor's radius as drawn and collided, metres. ACSR on the region's
 * lines is 25 to 36 mm across (Grosbeak 25.2, Drake 28.1, Bersfort 35.6:
 * the ACSR tables); drawn at 36 mm, the top of that, so a wire reads at
 * distance without looking like a cable. An earth wire (OPGW, 15 to 20 mm)
 * is drawn at 24 mm.
 */
export const CONDUCTOR_R = 0.018;
export const EARTH_R = 0.012;
/* A bundle's sub conductors stand this far apart, 18 in, the spacers' on
 * 500 and 765 kV lines: a two bundle side by side, a four a square. */
export const BUNDLE_S = 0.457;
/* The capsule a phase is met as: round the whole bundle. */
export function bundleR(k) {
  return BUNDLE_OFFSETS[k].reduce((m, [h, v]) => Math.max(m, Math.sqrt(h * h + v * v)), 0) + CONDUCTOR_R;
}
/* Each conductor of a bundle of k, metres along the span's level across
 * (h) and up (v) from the phase's line: a pair side by side, a triangle
 * point up, a square. Up rather than square to the chord, so a bundle's
 * conductors run on unbroken from chord to chord; a span's chords slope a
 * tenth at most, where the two differ by half a percent. */
const B2 = BUNDLE_S / 2;
const B3 = BUNDLE_S / Math.sqrt(3);
export const BUNDLE_OFFSETS = {
  1: [[0, 0]],
  2: [[-B2, 0], [B2, 0]],
  3: [[0, B3], [-B2, -B3 / 2], [B2, -B3 / 2]],
  4: [[-B2, -B2], [B2, -B2], [B2, B2], [-B2, B2]],
};
/* An insulator string's radius: a 254 mm glass disc's. */
export const STRING_R = 0.127;
/* The longest chord a span is cut into, metres: over a 400 m span sagging
 * 8 m, a 25 m chord stands at most 8 / 16^2 = 3 cm off the parabola. */
export const CHORD = 25;

/*
 * A tower by the voltage it carries: its height, the crossarm's height,
 * the phases' spacing either side of the middle, the base's side and the
 * insulator string the phases hang from. Metres. 765 and 500 kV from the
 * Furnas and Itaipu lines in the photographs, the lower voltages scaled
 * down the same way; a string is about a metre and a half of discs a
 * hundred kV, the arcing distance's (a 500 kV I string is 25 to 28 discs
 * of 146 mm, 4 m with its fittings).
 */
const TOWERS = [
  { kv: 700, h: 52, arm: 40, phase: 13, base: 12, string: 5.5 },
  { kv: 400, h: 45, arm: 34, phase: 11, base: 10, string: 4 },
  { kv: 200, h: 36, arm: 28, phase: 7.5, base: 8, string: 2.4 },
  { kv: 60, h: 26, arm: 20, phase: 4.5, base: 5, string: 1.1 },
  { kv: 0, h: 20, arm: 16, phase: 3, base: 4, string: 0.8 },
];
/* The string hangs from the crossarm's underside (piecesOf: the arm's
 * bar is 0.5 m in radius at arm + 0.6). */
const ARM_UNDER = 0.1;
/* A substation's gantry and a pole, whatever they carry. */
const PORTAL = { h: 18, arm: 17, phase: 4 };
const POLE = { h: 14, arm: 12.5, phase: 1.6 };

function kvOf(line) {
  const v = Number(String(line.voltage ?? '').split(';')[0]);
  return v > 0 ? v / 1000 : 0;
}

/* A line's conductors to a phase: OSM's `wires` when it says, else a four
 * bundle from 400 kV (every such line here that is tagged is `quad`) and
 * one below (the tagged 66 to 220 kV lines are `single` but for one). */
const BUNDLES = { single: 1, double: 2, triple: 3, quad: 4 };
function bundleOf(line, kv) {
  const tagged = BUNDLES[String(line.wires ?? '').split(';')[0]];
  if (tagged) {
    return tagged;
  }
  return kv >= 400 ? 4 : 1;
}

function towerSize(kv) {
  return TOWERS.find((t) => kv >= t.kv);
}

function unit(x, z) {
  const l = Math.sqrt(x * x + z * z);
  return l > 1e-9 ? [x / l, z / l] : [1, 0];
}

/* Where a phase hangs on structure n's frame: at the foot of its string
 * on a tower, on the beam of a gantry (a strain string, along the line)
 * and on the arm of a pole. */
function hangY(n) {
  const size = n.frame.size;
  return n.frame.y + (size.string ? size.arm + ARM_UNDER - size.string : size.arm);
}

/*
 * The lines laid out. `data` is osm/power.json, `ground(x, z)` the
 * terrain. Returns the structures (towers, gantries, poles) with their
 * frames and sizes, and the wires as chords [ax, ay, az, bx, by, bz, r,
 * k, hx, hz, span]: r the radius a craft meets it within (bundleR, or
 * EARTH_R for an earth wire), k the conductors it is drawn as, (hx, hz)
 * the span's level unit across it, which a bundle's conductors stand
 * along (drawnWires), and the span it hangs in, numbered from 0 in the
 * order the lines and their towers come.
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
  let spans = 0;
  for (const line of data.lines) {
    const bundle = bundleOf(line, kvOf(line));
    for (let k = 0; k + 1 < line.nodes.length; k += 1) {
      const a = nodes.get(line.nodes[k]);
      const b = nodes.get(line.nodes[k + 1]);
      const span = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z));
      if (!(span > 1)) {
        continue;
      }
      const [ux, uz] = unit(b.x - a.x, b.z - a.z);
      const across = [-uz, ux];
      const id = spans;
      spans += 1;
      /* The phases, each on the side of the line it hangs on at both
       * ends (the frames' perpendiculars may point either way). */
      const flip = a.frame.px * b.frame.px + a.frame.pz * b.frame.pz < 0 ? -1 : 1;
      const ya = hangY(a);
      const yb = hangY(b);
      for (const k3 of [-1, 0, 1]) {
        hang(
          [a.x + a.frame.px * a.frame.size.phase * k3, ya, a.z + a.frame.pz * a.frame.size.phase * k3],
          [b.x + b.frame.px * b.frame.size.phase * k3 * flip, yb, b.z + b.frame.pz * b.frame.size.phase * k3 * flip],
          span, [bundleR(bundle), bundle, ...across, id], wires,
        );
      }
      /* The earth wire, tower top to tower top. */
      if (a.kind === 'tower' && b.kind === 'tower') {
        hang([a.x, a.frame.y + a.frame.size.h, a.z], [b.x, b.frame.y + b.frame.size.h, b.z], span, [EARTH_R, 1, ...across, id], wires);
      }
    }
  }
  return { structures, wires };
}

/* One wire from p to q as chords of its parabola, each with `tail` (its
 * r, k, hx, hz and span), into `out`. */
function hang(p, q, span, tail, out) {
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
    out.push([prev[0], prev[1], prev[2], cur[0], cur[1], cur[2], ...tail]);
    prev = cur;
  }
}

/*
 * Chord w's conductors as they are drawn, [ax, ay, az, bx, by, bz, r]
 * each: a bundle's k at its offsets (BUNDLE_OFFSETS) with the conductor's
 * radius, an earth wire or a single conductor as itself. Into `out` from
 * `o`; returns the offset past them.
 */
export function conductorsOf(w, out, o) {
  const k = w[7];
  const r = k === 1 ? w[6] : CONDUCTOR_R;
  for (const [h, v] of BUNDLE_OFFSETS[k]) {
    const dx = w[8] * h;
    const dz = w[9] * h;
    out[o] = w[0] + dx;
    out[o + 1] = w[1] + v;
    out[o + 2] = w[2] + dz;
    out[o + 3] = w[3] + dx;
    out[o + 4] = w[4] + v;
    out[o + 5] = w[5] + dz;
    out[o + 6] = r;
    o += 7;
  }
  return o;
}

/* Every chord's conductors, flat (conductorsOf). */
export function drawnWires(wires) {
  let n = 0;
  for (const w of wires) {
    n += w[7];
  }
  const out = new Float32Array(n * 7);
  let o = 0;
  for (const w of wires) {
    o = conductorsOf(w, out, o);
  }
  return out;
}

/* A bundle seen from afar, where its conductors are under a pixel apart:
 * the one line as wide as it is, or the conductor itself. */
export function bundleHalf(w) {
  return w[7] === 1 ? w[6] : BUNDLE_OFFSETS[w[7]].reduce((m, [h, v]) => Math.max(m, Math.abs(h), Math.abs(v)), 0) + CONDUCTOR_R;
}

/*
 * A tower's insulator strings, [ax, ay, az, bx, by, bz, r], one a phase
 * from the crossarm's underside to where the phase hangs (hangY); none on
 * a gantry or a pole. Drawn and collided like its pieces.
 */
export function stringsOf(s) {
  if (s.kind !== 'tower') {
    return [];
  }
  const { x, z, y, ax, az, size } = s;
  const top = y + size.arm + ARM_UNDER;
  return [-1, 0, 1].map((k3) => {
    const px = x - az * size.phase * k3;
    const pz = z + ax * size.phase * k3;
    return [px, top, pz, px, top - size.string, pz, STRING_R];
  });
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
