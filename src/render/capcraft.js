/*
 * capcraft.js: the CAP 580's model, and nothing else.
 *
 * Its own file for extracraft.js's reason: a CAP is not an Extra. It is a
 * balsa and film fuselage, deep and slab sided behind a big round cowl,
 * with a bubble canopy over the wing and a turtle deck falling to the fin;
 * a low, straight tapered wing whose quarter chord is unswept, with
 * ailerons nearly root to tip and a side force generator on each square
 * tip; a big flat stabiliser on top of the tail post; and a squarish fin
 * whose rudder runs down under the fuselage to a raked foot. An 18 x 8
 * carbon prop turns ahead of the cowl, and the aircraft sits on carbon
 * legs with wheel pants and a steered tailwheel.
 *
 * The subject is Extreme Flight's 67 in CAP 580 (A464-BY and A464-GR) in
 * the blue, yellow and red scheme: a red cowl and spinner, a blue fuselage
 * with yellow and red flashes, a blue wing top with a yellow band and red
 * outer panels, red tips and side force generators, yellow pants. Extreme
 * Flight publishes the span, 1702 mm, the length, 1676 mm, and the wing,
 * 860 sq in; the rest is read off its side, underside and rear
 * photographs (IMG_7289, IMG_7296, IMG_7299) as docs/CAP580-STAGE1.md and
 * scripts/cap580-derive.js take them:
 *
 *   span            1.702 m, the tips square, a side force generator on
 *                   each, inside the span
 *   wing            0.435 m at the root, 0.217 at the tip, its quarter
 *                   chord unswept (the leading edge 0.054 m back at the
 *                   tip), a symmetric 15 percent section, no dihedral,
 *                   0.085 m under the thrust line
 *   ailerons        from 0.115 m out to the tip, 43 percent of the chord
 *   tail            a 0.75 m stabiliser, 0.29 at its root and 0.22 at
 *                   its tip, 0.027 m over the thrust line, the elevator
 *                   the aft 67 percent; a fin and rudder 0.277 m over the
 *                   thrust line and 0.075 under it, the rudder's hinge and
 *                   trailing edge raked
 *   gear            a 0.38 m track, 2.5 in wheels in pants on carbon legs,
 *                   the axles 0.12 m ahead of the CG and 0.31 under it
 *   tailwheel       22 mm, 0.941 m behind the CG and 0.127 under, on a
 *                   bracket under the rudder, steered by it
 *   prop            18 x 8 two blade carbon tractor, clockwise seen from
 *                   behind, 0.56 m ahead of the CG, behind a 76 mm spinner
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 0.130 m behind the wing's leading
 * edge at the root, the derivation's fitted station for the tube, on the
 * thrust line. Every station below is measured aft from the spinner's tip
 * and turned into the craft frame's z by st().
 *
 * The contract with the shell is cubcraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians.
 * Ailerons and elevator are positive trailing edge up; the rudder is
 * positive trailing edge to the LEFT, and the tailwheel turns with it.
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

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial, outlineHull } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { paintRegions } from './livery.js';
import { plateGeometry, profileBands, spinnerFor } from './kitshapes.js';

/*
 * The aircraft, in metres, in the Three.js craft frame: x right, y up, z
 * aft, origin at the CG. Stations are metres aft of the spinner's tip.
 */
const PROP_S = 0.040;
const CG_S = PROP_S + 0.560;
const st = (s) => s - CG_S;

const HALF = 0.851;
const ROOT_C = 0.435;
const TIP_C = 0.217;
const ROOT_LE_S = 0.470;
const TIP_SWEEP = 0.054;
const WING_Y = -0.085;
const WING_T = 0.15;

const AIL_IN = 0.115;
const AIL_HINGE = 0.57;

/* The tip's leading edge is not measured; 1.3875 keeps the quarter chord
 * unswept, as the rear photograph's straight hinge line reads. */
const STAB_HALF = 0.375;
const STAB_ROOT_LE_S = 1.370;
const STAB_ROOT_C = 0.290;
const STAB_TIP_LE_S = 1.3875;
const STAB_TIP_C = 0.220;
const ELEV_F = 0.33;
const STAB_Y = 0.027;
const STAB_T = 0.08;

/* The fin and rudder. The "0.10 m of chord at the top" and the trailing
 * edge at 1.676 only agree with a raked trailing edge, 1.563 at the top
 * back to 1.676 at the foot, which is what IMG_7289 shows. */
const TAIL_TOP = 0.277;
const RUDDER_BOTTOM = -0.075;
const RUDDER_TOP_S = 1.488;
const RUDDER_FOOT_S = 1.541;
const RUDDER_TOP_TE_S = 1.563;
const RUDDER_TE_S = 1.676;
const FIN_ROOT_Y = 0.045;
const FIN_ROOT_LE_S = 1.380;
const FIN_TOP_LE_S = 1.460;
const FIN_T = 0.07;

const PROP_R = 0.2286;
const SPINNER_R = 0.038;
const SPINNER_BASE_S = 0.050;

const MAIN_X = 0.190;
const MAIN_S = CG_S - 0.120;
const MAIN_Y = -0.310;
const MAIN_R = 0.03175;
const MAIN_W = 0.022;
const TAIL_PIVOT_S = 1.527;
const TAIL_PIVOT_Y = -0.082;
const TAIL_WHEEL_S = CG_S + 0.941;
const TAIL_WHEEL_Y = -0.127;
const TAIL_WHEEL_R = 0.011;

function chordLE(ax) {
  const u = Math.min(1, ax / HALF);
  return { c: ROOT_C + (TIP_C - ROOT_C) * u, le: st(ROOT_LE_S + TIP_SWEEP * u) };
}

/* The NACA four digit thickness, half of it, at chord fraction t. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}

/* A closed airfoil section, cubcraft.js's. */
function section(at, f0, f1, n) {
  const ts = [];
  for (let i = 0; i < n; i += 1) {
    ts.push(f0 + (f1 - f0) * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1))));
  }
  const loop = ts.map((t) => at(t, 1));
  const stop = f0 === 0 ? 1 : 0;
  for (let i = n - 1; i >= stop; i -= 1) {
    loop.push(at(ts[i], -1));
  }
  return loop;
}

/* The wing's symmetric section at span station x. */
function wingAt(x) {
  const { c, le } = chordLE(Math.abs(x));
  return (t, side) => new THREE.Vector3(x, WING_Y + side * c * naca(t, WING_T), le + t * c);
}
function stabPlan(ax) {
  const u = Math.min(1, ax / STAB_HALF);
  const le = STAB_ROOT_LE_S + (STAB_TIP_LE_S - STAB_ROOT_LE_S) * u;
  const c = STAB_ROOT_C + (STAB_TIP_C - STAB_ROOT_C) * u;
  return { le: st(le), hinge: st(le + ELEV_F * c), te: st(le + c) };
}
function stabAt(x, le, c) {
  return (t, side) => new THREE.Vector3(x, STAB_Y + side * c * naca(t, STAB_T), le + t * c);
}
function finAt(y, le, c) {
  return (t, side) => new THREE.Vector3(side * c * naca(t, FIN_T), y, le + t * c);
}

/* cubcraft.js's loft: closed sections skinned and capped, faced out by
 * the closed result's signed volume. */
function loft(sections) {
  const n = sections[0].length;
  const pos = [];
  for (const sec of sections) {
    for (const p of sec) {
      pos.push(p.x, p.y, p.z);
    }
  }
  const idx = [];
  for (let s = 0; s + 1 < sections.length; s += 1) {
    const a = s * n;
    const b = (s + 1) * n;
    for (let j = 0; j < n; j += 1) {
      const k = (j + 1) % n;
      idx.push(a + j, a + k, b + j, a + k, b + k, b + j);
    }
  }
  const cap = (sec, base, flip) => {
    const c = new THREE.Vector3();
    for (const p of sec) {
      c.add(p);
    }
    c.multiplyScalar(1 / n);
    const centre = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let j = 0; j < n; j += 1) {
      const k = (j + 1) % n;
      idx.push(centre, flip ? base + k : base + j, flip ? base + j : base + k);
    }
  };
  cap(sections[0], 0, true);
  cap(sections[sections.length - 1], (sections.length - 1) * n, false);
  let vol = 0;
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let i = 0; i < idx.length; i += 3) {
    vol += v(idx[i]).dot(v(idx[i + 1]).cross(v(idx[i + 2])));
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/*
 * A painted panel: a grid of nu by nv quads through at(u, v), laid on a
 * curved skin so it follows the surface instead of cutting under it, and
 * faced the way outward(point) says.
 */
function skinPatch(nu, nv, at, outward) {
  const pts = [];
  for (let i = 0; i <= nu; i += 1) {
    for (let j = 0; j <= nv; j += 1) {
      pts.push(at(i / nu, j / nv));
    }
  }
  const idx = [];
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  let facing = 0;
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const mid = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    const [p0, p1, p2] = [pts[idx[i]], pts[idx[i + 1]], pts[idx[i + 2]]];
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    mid.copy(p0).add(p1).add(p2).multiplyScalar(1 / 3);
    facing += e1.cross(e2).dot(outward(mid));
  }
  if (facing < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
const bilerp = (q, u, v) => [0, 1].map((k) => (
  q[0][k] * (1 - u) * (1 - v) + q[1][k] * u * (1 - v) + q[2][k] * u * v + q[3][k] * (1 - u) * v
));

/* A panel on the wing's top (side 1) or underside (-1) through four
 * corners [x, chord fraction], round the outline in order. */
function wingPanel(q, side, nu = 6, nv = 6) {
  return skinPatch(nu, nv, (u, v) => {
    const [x, f] = bilerp(q, u, v);
    return wingAt(x)(f, side).add(new THREE.Vector3(0, side * 0.0012, 0));
  }, () => new THREE.Vector3(0, side, 0));
}
/* The same on the stabiliser's fixed part, or on the elevator when
 * `elev`, the fraction then of that part's own chord. */
function stabPanel(q, side, elev, nu = 4, nv = 4) {
  return skinPatch(nu, nv, (u, v) => {
    const [x, f] = bilerp(q, u, v);
    const p = stabPlan(Math.abs(x));
    const at = elev ? stabAt(x, p.hinge, elevTE(x) - p.hinge) : stabAt(x, p.le, p.hinge - p.le);
    return at(f, side).add(new THREE.Vector3(0, side * 0.0010, 0));
  }, () => new THREE.Vector3(0, side, 0));
}

/*
 * The wing, tip to tip in one loft, cut at the ailerons' hinge line from
 * AIL_IN out: the step from a full section to a cut one at the same
 * station is the cut out's side wall.
 */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const outs = lite ? [0.45, HALF] : [0.25, 0.40, 0.55, 0.70, HALF];
  const half = [[0, 1], [AIL_IN - eps, 1], ...[AIL_IN + eps, ...outs].map((x) => [x, AIL_HINGE])];
  const stations = [
    ...half.slice(1).reverse().map(([x, f]) => [-x, f]),
    ...half,
  ];
  return loft(stations.map(([x, f]) => section(wingAt(x), 0, f, n)));
}

/* A hinged surface, cubcraft.js's: the pivot on the hinge, turning about
 * the hinge's own axis, +x or +y, so a negative turn lifts the trailing
 * edge or swings it left. `extras` are painted panels that ride on it. */
function hinged(geo, a, b, material, shade, extras = []) {
  const axis = new THREE.Vector3().subVectors(b, a).normalize();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  geo.translate(-mid.x, -mid.y, -mid.z);
  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = shade;
  pivot.add(mesh);
  for (const [g, m] of extras) {
    g.translate(-mid.x, -mid.y, -mid.z);
    pivot.add(new THREE.Mesh(g, m));
  }
  return { pivot, axis, mesh };
}

function aileron(sign, material, shade, lite) {
  const n = lite ? 4 : 6;
  const xs = [AIL_IN + 0.002, 0.45, HALF - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  const geo = loft(xs.map((x) => section(wingAt(x), AIL_HINGE, 1, n)));
  const hingePoint = (x) => wingAt(x)(AIL_HINGE, 1).add(wingAt(x)(AIL_HINGE, -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

function stabGeometry(n) {
  const xs = [-STAB_HALF, -0.15, 0, 0.15, STAB_HALF];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
/* The elevator, both halves in one piece across a notch for the rudder,
 * as its horns are joined by a U wire. The notch is the inboard trailing
 * corners cut on a diagonal back from the rudder's hinge, so the rudder
 * swings clear of them to about 40 deg. */
const ELEV_IN = 0.012;
function elevTE(x) {
  return Math.min(stabPlan(Math.abs(x)).te, st(1.535) + 0.75 * Math.abs(x));
}
function elevatorGeometry(n) {
  const halfOf = (sign) => {
    const xs = [ELEV_IN, 0.05, 0.10, 0.15, 0.26, STAB_HALF - 0.001].map((x) => sign * x);
    if (sign < 0) {
      xs.reverse();
    }
    return loft(xs.map((x) => {
      const p = stabPlan(Math.abs(x));
      return section(stabAt(x, p.hinge, elevTE(x) - p.hinge), 0, 1, n);
    }));
  };
  return merged([halfOf(-1), halfOf(1)]);
}

/*
 * The fin and rudder's outline at height y: the fin's leading edge raked
 * back from the fuselage's top to its square top, the rudder's hinge and
 * trailing edge both raked back going down, the rudder running on under
 * the fuselage to its foot.
 */
function finLE(y) {
  const u = Math.min(1, Math.max(0, (y - FIN_ROOT_Y) / (TAIL_TOP - FIN_ROOT_Y)));
  return FIN_ROOT_LE_S + (FIN_TOP_LE_S - FIN_ROOT_LE_S) * u;
}
function rudderHinge(y) {
  const u = (y - RUDDER_BOTTOM) / (TAIL_TOP - RUDDER_BOTTOM);
  return RUDDER_FOOT_S + (RUDDER_TOP_S - RUDDER_FOOT_S) * u;
}
function rudderTE(y) {
  const u = (y - RUDDER_BOTTOM) / (TAIL_TOP - RUDDER_BOTTOM);
  return RUDDER_TE_S + (RUDDER_TOP_TE_S - RUDDER_TE_S) * u;
}
function finGeometry(n) {
  const ys = [0.030, FIN_ROOT_Y, 0.110, 0.180, 0.240, TAIL_TOP];
  return loft(ys.map((y) => {
    const le = finLE(y);
    return section(finAt(y, st(le), rudderHinge(y) - le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUDDER_BOTTOM, -0.030, 0.020, 0.090, 0.170, 0.230, TAIL_TOP];
  return loft(ys.map((y) => section(finAt(y, st(rudderHinge(y)), rudderTE(y) - rudderHinge(y)), 0, 1, n)));
}
/* A panel on the fin's side, `side` +1 right, through [height, chord
 * fraction] corners. */
function finPanel(q, side, nu = 4, nv = 3) {
  return skinPatch(nu, nv, (u, v) => {
    const [y, f] = bilerp(q, u, v);
    const le = finLE(y);
    return finAt(y, st(le), rudderHinge(y) - le)(f, side).add(new THREE.Vector3(side * 0.0010, 0, 0));
  }, () => new THREE.Vector3(side, 0, 0));
}

/*
 * The fuselage, as rounded box sections along the stations: half width,
 * top, bottom and squareness. The round cowl behind the spinner, the deep
 * slab sides at the wing, the deck under the canopy and the turtle deck
 * falling to the tail post at the rudder's hinge.
 */
const FUSE_END_S = 1.530;
const FUSE = [
  [0.045, 0.040, 0.040, -0.042, 2.0],
  [0.065, 0.060, 0.058, -0.068, 2.1],
  [0.110, 0.076, 0.070, -0.098, 2.4],
  [0.180, 0.081, 0.074, -0.118, 2.8],
  [0.300, 0.080, 0.077, -0.124, 3.2],
  [0.450, 0.077, 0.077, -0.121, 3.6],
  [0.600, 0.075, 0.072, -0.113, 3.8],
  [0.800, 0.065, 0.070, -0.096, 3.6],
  [1.000, 0.051, 0.064, -0.078, 3.2],
  [1.200, 0.035, 0.056, -0.060, 2.8],
  [1.400, 0.018, 0.046, -0.043, 2.4],
  [FUSE_END_S, 0.008, 0.040, -0.034, 2.2],
];
function fuseAt(s) {
  const last = FUSE[FUSE.length - 1];
  const t = Math.min(Math.max(s, FUSE[0][0]), last[0]);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      const k = u * u * (3 - 2 * u);
      const lerp = (j) => a[j] + (b[j] - a[j]) * k;
      const top = lerp(2);
      const bottom = lerp(3);
      return { w: lerp(1), h: (top - bottom) / 2, yc: (top + bottom) / 2, e: lerp(4) };
    }
  }
  throw new Error(`capcraft: station ${s} is off the fuselage`);
}
function fusePoint(s, a, out = 0) {
  const { w, h, yc, e } = fuseAt(s);
  const sn = Math.sin(a);
  const cs = Math.cos(a);
  const p = 2 / e;
  return new THREE.Vector3(
    Math.sign(sn) * (w + out) * Math.abs(sn) ** p,
    yc + Math.sign(cs) * (h + out) * Math.abs(cs) ** p,
    st(s),
  );
}
/* fusePoint's angle, from the top round to the bottom, at height y. */
function angleAt(s, y) {
  const { h, yc, e } = fuseAt(s);
  const k = Math.max(-1, Math.min(1, (y - yc) / h));
  return Math.acos(Math.sign(k) * Math.abs(k) ** (e / 2));
}
/* The skin's height at half width x off the centreline, on the top. */
function deckAt(s, x) {
  const { w, h, yc, e } = fuseAt(s);
  const sn = Math.min(1, x / w) ** (e / 2);
  return yc + h * Math.sqrt(1 - sn * sn) ** (2 / e);
}
function fuseStations(lite) {
  return lite
    ? [0.045, 0.065, 0.110, 0.180, 0.300, 0.450, 0.600, 0.800, 1.000, 1.200, 1.400, FUSE_END_S]
    : [0.045, 0.052, 0.065, 0.085, 0.110, 0.140, 0.180, 0.240, 0.300, 0.370, 0.450, 0.520, 0.600, 0.700,
      0.800, 0.900, 1.000, 1.100, 1.200, 1.300, 1.400, 1.470, FUSE_END_S];
}
function fuseGeometry(lite) {
  const around = lite ? 16 : 24;
  return loft(fuseStations(lite).map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}
/* A panel on the fuselage's skin, `out` proud of it, from station s0 to
 * s1, between the angles lo(s) and hi(s) on the side `side`. */
function fusePanel(s0, s1, lo, hi, side, out, ns, na) {
  return skinPatch(ns, na, (u, v) => {
    const s = s0 + (s1 - s0) * u;
    const a = lo(s) + (hi(s) - lo(s)) * v;
    return fusePoint(s, side * a, out);
  }, (p) => new THREE.Vector3(p.x, p.y - fuseAt(p.z + CG_S).yc, 0));
}

/* The nose's red: the cowl, as a sleeve of the fuselage's own sections a
 * hair proud of it, from the spinner back past the cowl's joint, on the
 * fuselage's own stations so its chords follow the cowl's curve. */
function sleeve(lite, s1, out) {
  const around = lite ? 16 : 24;
  const ss = [...fuseStations(lite).filter((s) => s < s1), s1];
  return loft(ss.map((s) => {
    const ring = [];
    for (let j = 0; j < around; j += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * j) / around, out));
    }
    return ring;
  }));
}

/*
 * The scheme's flashes on the fuselage's side, read off IMG_7289 and
 * IMG_7299: the height of the yellow's top edge along the stations, the
 * yellow under it to the keel. It climbs off the cowl's chin to the
 * chevron's arms on the cowl's shoulders, falls to the wing's root, runs
 * aft along it and jumps up again ahead of the tail.
 */
const YELLOW_EDGE = [
  [0.120, -0.080], [0.300, 0.030], [0.350, 0.030], [0.450, -0.030], [0.550, -0.058],
  [1.000, -0.052], [1.120, -0.042], [1.200, 0.008], [FUSE_END_S, 0.020],
];
/* The chevron over the cowl's top, pointing aft (IMG_7299): its arms
 * leave the side's yellow at CHEVRON_A off the top, where that edge's
 * 0.030 m height is, and meet on the centreline ahead of the canopy. */
const CHEVRON_A = 1.2;
const CHEVRON_W = 0.050;
const chevronFront = (a) => 0.420 - 0.120 * Math.min(1, Math.abs(a) / CHEVRON_A);
function yellowEdge(s) {
  for (let i = 0; i + 1 < YELLOW_EDGE.length; i += 1) {
    const [s0, y0] = YELLOW_EDGE[i];
    const [s1, y1] = YELLOW_EDGE[i + 1];
    if (s <= s1) {
      return y0 + ((y1 - y0) * (s - s0)) / (s1 - s0);
    }
  }
  return YELLOW_EDGE[YELLOW_EDGE.length - 1][1];
}

/*
 * The canopy, a bubble over the deck from 0.55 to 0.95 m, 0.15 m over the
 * thrust line at its top: a half ellipsoid along z, its tail drawn lower,
 * its base on the deck's shoulder at its own half width so no slit shows.
 */
const CANOPY_S0 = 0.550;
const CANOPY_S1 = 0.950;
const CANOPY_TOP = 0.150;
const CANOPY_W = 0.047;
function canopyGeometry(lite) {
  const len = CANOPY_S1 - CANOPY_S0;
  const mid = (CANOPY_S0 + CANOPY_S1) / 2;
  const base = deckAt(mid, CANOPY_W) - 0.002;
  const g = new THREE.SphereGeometry(1, lite ? 12 : 22, lite ? 6 : 11, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const aft = Math.max(0, pos.getZ(i));
    pos.setY(i, pos.getY(i) * (1 - 0.30 * aft * aft));
  }
  g.scale(CANOPY_W, CANOPY_TOP - base, len / 2);
  g.translate(0, base, st(mid));
  g.computeVertexNormals();
  return g;
}

/* A pant, a teardrop round the wheel: blunt ahead of the axle, drawn out
 * and thinned behind it, 0.17 m long, its bottom 12 mm over the tyre's. */
const PANT_FWD = 0.065;
const PANT_AFT = 0.105;
const PANT_W = 0.024;
const PANT_H = 0.036;
const PANT_RISE = 0.016;
function pantGeometry(seg) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg >> 1));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const aft = Math.max(0, z);
    pos.setXYZ(i, x * PANT_W * (1 - 0.55 * aft), PANT_RISE + y * PANT_H * (1 - 0.40 * aft), z * (z > 0 ? PANT_AFT : PANT_FWD));
  }
  g.computeVertexNormals();
  return g;
}

function rod(a, b, r, seg, flat = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.scale(1 / flat, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/* An 18 x 8 carbon blade: extracraft.js's outline scaled to the radius,
 * as herculescraft.js does, with a slimmer chord than a wood blade's. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const k = 1.05;
  const s = new THREE.Shape();
  s.moveTo(0.0055 * k, 0.012);
  s.bezierCurveTo(0.0240 * k, -0.020, 0.0200 * k, -r * 0.50, 0.0080 * k, -r * 0.97);
  s.lineTo(-0.0055 * k, -r * 0.94);
  s.bezierCurveTo(-0.0180 * k, -r * 0.45, -0.0120 * k, -0.012, -0.0040 * k, 0.012);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0035, bevelEnabled: false, curveSegments: segments });
}

function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('capcraft: merge failed');
  }
  return geo;
}

/*
 * The wheels' drawn lowest points in the level craft frame, and the
 * attitude they rest at. The plant's contacts are those two points fixed
 * in the body (scripts/cap580-derive.js), so the pose is the line through
 * them, as the derivation takes it; the drawn tyres then touch the ground
 * to within r (1 - cos pitch), half a millimetre at the mains.
 */
const MAIN_AXLE = [MAIN_X, MAIN_Y, st(MAIN_S)];
const TAIL_AXLE = [0, TAIL_WHEEL_Y, st(TAIL_WHEEL_S)];
const MAIN_LOW = [MAIN_X, MAIN_Y - MAIN_R, st(MAIN_S)];
const TAIL_LOW = [0, TAIL_WHEEL_Y - TAIL_WHEEL_R, st(TAIL_WHEEL_S)];
const REST_PITCH = Math.atan2(TAIL_LOW[1] - MAIN_LOW[1], TAIL_LOW[2] - MAIN_LOW[2]);
const REST_CG_HEIGHT = -(Math.cos(REST_PITCH) * MAIN_LOW[1] - Math.sin(REST_PITCH) * MAIN_LOW[2]);

/*
 * Exported numbers, so the airframe table and the scale check are held
 * against the drawn machine: hullR the furthest reach in plan, which is
 * the rudder's foot's, 1.076 m aft, against the stabiliser's tips' 1.075
 * and the wing's tips' 0.863; vHalfUp the fin's top, vHalfDown the main
 * tyres' bottoms. The side force generators sit inside the span.
 */
const UP = TAIL_TOP;
const DOWN = -(MAIN_Y - MAIN_R);
const REACH = Math.max(
  st(RUDDER_TE_S),
  Math.hypot(STAB_HALF, stabPlan(STAB_HALF).te),
  Math.hypot(HALF, chordLE(HALF).le + TIP_C),
);
export const CAP_DIMS = {
  span: 2 * HALF,
  rootChord: ROOT_C,
  tipChord: TIP_C,
  stabSpan: 2 * STAB_HALF,
  gearTrack: 2 * MAIN_X,
  propR: PROP_R,
  noseZ: st(0),
  tailZ: st(RUDDER_TE_S),
  length: RUDDER_TE_S,
  vHalfUp: UP,
  vHalfDown: DOWN,
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: MAIN_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: MAIN_W },
    tail: { axle: [...TAIL_AXLE], r: TAIL_WHEEL_R, width: 0.008 },
  },
  contact: {
    mainLeft: [-MAIN_LOW[0], MAIN_LOW[1], MAIN_LOW[2]],
    mainRight: [...MAIN_LOW],
    tail: [...TAIL_LOW],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: (REST_PITCH * 180) / Math.PI,
    cgHeight: REST_CG_HEIGHT,
    contact: {
      mainLeft: [-MAIN_LOW[0], MAIN_LOW[1], MAIN_LOW[2]],
      mainRight: [...MAIN_LOW],
      tail: [...TAIL_LOW],
    },
  },
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: REACH,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: RUDDER_TE_S,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera mount: the FPV camera at the canopy's front, where the
 * plant's camera is (src/native/plant.c, 0.10 m ahead of the CG and 0.12
 * over it), on a riser off the deck, looking over the cowl through the
 * prop.
 */
const CAM_S = CG_S - 0.100;
export const CAP_MOUNT_FORWARD = -st(CAM_S);
export const CAP_MOUNT_UP = 0.120;

/* A tractor turning clockwise seen from behind, as cubcraft.js's. */
export const CAP_PROP_SPIN = [1, 0, 0, 0];

export function buildCapCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'cap-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 8 : 12;
  const rodSeg = lite ? 4 : 6;
  const pn = lite ? 3 : 6;

  /* The scheme's colours by region (src/render/livery.js,
   * configs/liveries.js cap1702): the blue of the wing, the fuselage and
   * the tail, the yellow of the flashes and pants, the red of the cowl,
   * spinner, outer panels, tips and side force generators; the moving
   * surfaces a shade of their region. The green scheme is the same
   * regions in other colours. */
  const coat = paintRegions();
  const wingMat = coat.base('wing', cel({ color: 0x2343b4, rim: 0.28, spec: 0.40, specWidth: 0.014 }));
  const fuseMat = coat.base('fuselage', cel({ color: 0x2343b4, rim: 0.28, spec: 0.44, specWidth: 0.016 }));
  const tailMat = coat.base('tail', cel({ color: 0x2343b4, rim: 0.28, spec: 0.40, specWidth: 0.014 }));
  const stripeMat = coat.base('stripe', cel({ color: 0xf5b318, rim: 0.28, spec: 0.40, specWidth: 0.014 }));
  const trimMat = coat.base('trim', cel({ color: 0xe2202e, rim: 0.28, spec: 0.44, specWidth: 0.016 }));
  const tailFlap = coat.shade('tail', cel({ color: 0x1e3a9c, rim: 0.28, spec: 0.36, specWidth: 0.014 }));
  const trimFlap = coat.shade('trim', cel({ color: 0xc81c28, rim: 0.28, spec: 0.40, specWidth: 0.014 }));
  const black = cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 });
  const carbon = cel({ color: 0x24272b, rim: 0.30, spec: 0.60, specWidth: 0.020, specColor: 0xd8e0e8 });
  const metal = cel({ color: 0xb4b0a6, rim: 0.30, spec: 0.70, specWidth: 0.022 });
  const hub = cel({ color: 0xd8d8d4, rim: 0.28, spec: 0.50 });
  const skin = cel({ color: 0xe0b08c, rim: 0.24, spec: 0.20 });
  const shirt = cel({ color: 0xe8e8e4, rim: 0.26, spec: 0.25 });
  /* The visual kit (configs/kits.js kitParts): pixels only, drawn inside
   * the stock model's box, which is what configs/hulls.js is made from.
   * The glass is not a paint region, so a tint is its own colour. It is
   * see through, unlike the other canopies, so the pilot in it shows. */
  const kit = opts.kit ?? {};
  const glass = cel({
    color: { smoke: 0x1c242b, gold: 0x8a7440 }[kit.canopy] ?? 0x3f5a6e,
    rim: 0.40, spec: kit.canopy ? 0.80 : 0.60, specWidth: 0.020, specColor: 0xf3ead4,
    transparent: true, opacity: { smoke: 0.72, gold: 0.66 }[kit.canopy] ?? 0.45,
  });
  glass.depthWrite = false;
  const stator = cel({ color: 0x2a322c, rim: 0.24, spec: 0.20 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x101610,
    rim: 0.40,
    spec: 0.95,
    specWidth: 0.03,
    specColor: 0xf3ead4,
    side: THREE.DoubleSide,
  });
  const ring = cel({ color: 0xb8b09e, rim: 0.28, spec: 0.55 });
  const propMat = cel({ color: 0x1a1c1e, rim: 0.26, spec: 0.55, specWidth: 0.018, specColor: 0xd8e0e8 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = CAP_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), wingMat);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The fuselage, centred on its own middle so the hull thickens it evenly. */
  {
    const geo = fuseGeometry(lite);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const fuse = new THREE.Mesh(geo, fuseMat);
    fuse.position.copy(c);
    fuse.name = 'cap-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.018, ink);
    group.add(fuse);
  }

  /* The wing, one draw, and the tail feathers, one draw. */
  {
    const n = lite ? 5 : 7;
    const wing = new THREE.Mesh(wingGeometry(lite), wingMat);
    wing.name = 'cap-wing';
    wing.castShadow = shade;
    group.add(wing);
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n)]), tailMat);
    tail.name = 'cap-tail';
    tail.castShadow = shade;
    group.add(tail);
  }

  /*
   * The yellow, one draw: the fuselage's flashes from the cowl's chin to
   * the tail, the band across the wing's top along the hinge line and up
   * its diagonal to the leading edge, the underside's panels between the
   * blue stripes, the stabiliser's middle, the fin's strip at the hinge,
   * and the pants.
   */
  const band = (f) => 0.66 + (0.52 - 0.66) * (f / AIL_HINGE);
  const BAND_W = 0.07;
  {
    const parts = [];
    for (const side of [-1, 1]) {
      /* The side's yellow in two runs, the nose's denser where its edge
       * climbs and falls fastest. */
      const lo = (s) => angleAt(s, yellowEdge(s));
      parts.push(fusePanel(YELLOW_EDGE[0][0], 0.550, lo, () => Math.PI, side, 0.0025,
        lite ? 12 : 24, lite ? 8 : 12));
      parts.push(fusePanel(0.550, FUSE_END_S - 0.004, lo, () => Math.PI, side, 0.0025,
        lite ? 16 : 24, lite ? 8 : 12));
      const fh = AIL_HINGE - 0.005;
      const x = (v) => side * v;
      parts.push(wingPanel([[x(band(0) - BAND_W), 0.005], [x(band(0)), 0.005],
        [x(band(fh)), fh], [x(band(fh) - BAND_W), fh]], 1, 2, pn));
      parts.push(wingPanel([[x(0.075), 0.47], [x(band(0.47) - BAND_W), 0.47],
        [x(band(fh) - BAND_W), fh], [x(0.075), fh]], 1, pn, 2));
      /* The underside, yellow with raked blue stripes, IMG_7296. */
      const stripes = [0.075, 0.22, 0.37, 0.52, 0.67, HALF - 0.004];
      const rake = (x0, f) => Math.min(HALF - 0.004, x0 + 0.06 * (f / AIL_HINGE));
      for (let i = 0; i + 1 < stripes.length; i += 1) {
        const a = stripes[i] + (i === 0 ? 0 : 0.018);
        const b = stripes[i + 1] - 0.018;
        parts.push(wingPanel([[x(rake(a, 0.005)), 0.005], [x(rake(b, 0.005)), 0.005],
          [x(rake(b, fh)), fh], [x(rake(a, fh)), fh]], -1, 2, pn));
      }
      for (const s of [-1, 1]) {
        parts.push(stabPanel([[x(0.060), 0.03], [x(0.230), 0.03], [x(0.230), 0.97], [x(0.060), 0.97]], s, false));
      }
      parts.push(finPanel([[FIN_ROOT_Y + 0.004, 0.70], [TAIL_TOP - 0.004, 0.70],
        [TAIL_TOP - 0.004, 0.94], [FIN_ROOT_Y + 0.004, 0.94]], side));
      const pant = pantGeometry(lite ? 10 : 16);
      pant.translate(side * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(pant);
    }
    parts.push(skinPatch(lite ? 3 : 6, lite ? 8 : 16, (u, v) => {
      const a = CHEVRON_A * (2 * v - 1);
      return fusePoint(chevronFront(a) + CHEVRON_W * u, a, 0.0025);
    }, (p) => new THREE.Vector3(p.x, p.y - fuseAt(p.z + CG_S).yc, 0)));
    const yellow = new THREE.Mesh(merged(parts), stripeMat);
    yellow.name = 'cap-stripe';
    yellow.castShadow = shade;
    group.add(yellow);
  }

  /*
   * The red, one draw: the cowl's sleeve, the red flashes inside the
   * yellow, the wing's outer panels top and the tips, and the side force
   * generators: a plate on each square tip, 0.20 m long at its foot and
   * 0.16 tall, 0.04 over the wing and 0.12 under it, raked back, set in
   * by half its thickness so the span does not grow.
   */
  {
    const parts = [sleeve(lite, 0.330, 0.0012)];
    for (const side of [-1, 1]) {
      const flash = (s0, s1, depth) => fusePanel(s0, s1,
        (s) => angleAt(s, yellowEdge(s) - 0.006),
        (s) => angleAt(s, yellowEdge(s) - 0.006 - depth(s)), side, 0.0040, lite ? 8 : 20, lite ? 2 : 4);
      parts.push(flash(0.440, 0.950, (s) => 0.045 * (0.950 - s) / 0.510));
      parts.push(flash(1.150, FUSE_END_S - 0.006, (s) => 0.055 * (s - 1.150) / (FUSE_END_S - 1.156)));
      const x = (v) => side * v;
      const fh = AIL_HINGE - 0.005;
      parts.push(wingPanel([[x(band(0)), 0.005], [x(HALF - 0.004), 0.005],
        [x(HALF - 0.004), fh], [x(band(fh)), fh]], 1, pn, pn));
      parts.push(wingPanel([[x(HALF - 0.060), 0.005], [x(HALF - 0.004), 0.005],
        [x(HALF - 0.004), fh], [x(HALF - 0.060), fh]], -1, 2, pn));
      const px = side * (HALF - 0.002);
      parts.push(plateGeometry([
        [px, WING_Y + 0.040, st(0.535)],
        [px, WING_Y + 0.040, st(0.700)],
        [px, WING_Y - 0.120, st(0.760)],
        [px, WING_Y - 0.120, st(0.560)],
      ], [side, 0, 0], 0.004));
    }
    const trim = new THREE.Mesh(merged(parts), trimMat);
    trim.name = 'cap-trim';
    trim.castShadow = shade;
    group.add(trim);
  }

  /*
   * The carbon gear, one draw: each leg a flat blade from the fuselage's
   * bottom at the wing's leading edge out and down into its pant, and the
   * tailwheel's bracket from the tail post's underside to the pivot.
   */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const rootS = MAIN_S - 0.015;
      const root = new THREE.Vector3(sign * 0.040, fuseAt(rootS).yc - fuseAt(rootS).h + 0.004, st(rootS));
      const foot = new THREE.Vector3(sign * (MAIN_X - 0.014), MAIN_Y + 0.012, st(MAIN_S));
      parts.push(rod(root, foot, 0.0075, rodSeg, 2.6));
    }
    const bs = 1.430;
    parts.push(rod(new THREE.Vector3(0, fuseAt(bs).yc - fuseAt(bs).h + 0.002, st(bs)),
      new THREE.Vector3(0, TAIL_PIVOT_Y, st(TAIL_PIVOT_S)), 0.0035, rodSeg, 2.0));
    const gear = new THREE.Mesh(merged(parts), carbon);
    gear.name = 'cap-gear';
    gear.castShadow = shade;
    group.add(gear);
  }

  /* The main tyres and their hubs and axles. */
  {
    const tyres = [];
    const hubs = [];
    for (const sign of [-1, 1]) {
      const tyre = new THREE.TorusGeometry(MAIN_R - 0.009, 0.009, 6, lite ? 16 : 20);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      tyres.push(tyre);
      const h = new THREE.CylinderGeometry(0.012, 0.012, MAIN_W - 0.004, seg);
      h.rotateZ(Math.PI / 2);
      h.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      hubs.push(h);
      const axle = new THREE.CylinderGeometry(0.003, 0.003, 0.026, rodSeg);
      axle.rotateZ(Math.PI / 2);
      axle.translate(sign * (MAIN_X - 0.012), MAIN_Y, st(MAIN_S));
      hubs.push(axle);
    }
    const tyreMesh = new THREE.Mesh(merged(tyres), black);
    tyreMesh.name = 'cap-tyres';
    tyreMesh.castShadow = shade;
    group.add(tyreMesh);
    const hubMesh = new THREE.Mesh(merged(hubs), hub);
    hubMesh.name = 'cap-hubs';
    group.add(hubMesh);
  }

  /* The canopy, one draw, and the pilot under it: shoulders in a white
   * shirt, a face, and a helmet in the scheme's main colour, as both of
   * Extreme Flight's schemes have it. */
  {
    const ps = 0.720;
    const shoulders = new THREE.SphereGeometry(1, lite ? 8 : 14, lite ? 5 : 8);
    shoulders.scale(0.038, 0.020, 0.026);
    shoulders.translate(0, deckAt(ps, 0) + 0.010, st(ps));
    const neck = new THREE.CylinderGeometry(0.008, 0.009, 0.016, lite ? 5 : 8);
    neck.translate(0, deckAt(ps, 0) + 0.032, st(ps));
    const body = new THREE.Mesh(merged([shoulders, neck]), shirt);
    body.name = 'cap-pilot';
    group.add(body);
    const headY = deckAt(ps, 0) + 0.054;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.019, lite ? 8 : 12, lite ? 6 : 9), skin);
    face.position.set(0, headY, st(ps) - 0.002);
    face.name = 'cap-pilot';
    group.add(face);
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.0215, lite ? 8 : 14, lite ? 5 : 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
      fuseMat,
    );
    helmet.rotation.x = 0.35;
    helmet.position.set(0, headY + 0.002, st(ps) + 0.002);
    helmet.name = 'cap-pilot';
    group.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.008, 0.006), black);
    visor.position.set(0, headY + 0.004, st(ps) - 0.018);
    visor.name = 'cap-pilot';
    group.add(visor);

    const glassMesh = new THREE.Mesh(canopyGeometry(lite), glass);
    glassMesh.name = 'cap-glass';
    glassMesh.renderOrder = 1;
    group.add(glassMesh);
  }

  /* The four moving surfaces: the ailerons red, the elevator blue with
   * its yellow middle riding on it, the rudder red. */
  const n = lite ? 4 : 5;
  const leftAil = aileron(-1, trimFlap, shade, lite);
  const rightAil = aileron(1, trimFlap, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, stabPlan(Math.abs(x)).hinge);
  const elevBand = [];
  for (const sign of [-1, 1]) {
    for (const s of [-1, 1]) {
      elevBand.push(stabPanel([[sign * 0.060, 0.03], [sign * 0.230, 0.03], [sign * 0.230, 0.97], [sign * 0.060, 0.97]], s, true));
    }
  }
  const elevator = hinged(elevatorGeometry(n), eh(-STAB_HALF), eh(STAB_HALF), tailFlap, shade,
    [[merged(elevBand), stripeMat]]);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_FOOT_S)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_TOP_S)),
    trimFlap, shade);

  /* The tailwheel on its own vertical pivot under the rudder's foot,
   * turning with it, as its tiller on the rudder turns it. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, TAIL_PIVOT_Y, st(TAIL_PIVOT_S));
    const trail = TAIL_WHEEL_S - TAIL_PIVOT_S;
    const dropY = TAIL_WHEEL_Y - TAIL_PIVOT_Y;
    const forkParts = [
      rod(new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(0.006, dropY, trail), 0.0016, lite ? 4 : 6),
      new THREE.CylinderGeometry(0.004, 0.004, 0.008, lite ? 6 : 10).rotateZ(Math.PI / 2).translate(0, dropY, trail),
    ];
    const fork = new THREE.Mesh(merged(forkParts), metal);
    fork.castShadow = shade;
    pivot.add(fork);
    const tyreGeo = new THREE.TorusGeometry(TAIL_WHEEL_R - 0.0035, 0.0035, 5, 12);
    tyreGeo.rotateY(Math.PI / 2);
    tyreGeo.translate(0, dropY, trail);
    const tyre = new THREE.Mesh(tyreGeo, black);
    tyre.name = 'tyre-tail';
    tyre.castShadow = shade;
    pivot.add(tyre);
    return { pivot, axis: new THREE.Vector3(0, 1, 0) };
  })();

  const surfaces = {
    'aileron-left': leftAil,
    'aileron-right': rightAil,
    elevator,
    rudder,
    tailwheel,
  };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  /* The camera at the canopy's front, on a riser off the deck. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, CAP_MOUNT_UP, -CAP_MOUNT_FORWARD);
  cameraMount.name = 'cap-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.020, 0.020), camBody);
    housing.position.set(0, 0, 0.006);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
    const riserH = CAP_MOUNT_UP - 0.010 - deckAt(CAM_S + 0.006, 0) + 0.004;
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.012, riserH, 0.014), camBody);
    riser.position.set(0, -0.010 - riserH / 2, 0.006);
    cameraMount.add(riser);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0080, 0.0086, 0.012, lite ? 8 : 14), camBody);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.010);
    cameraMount.add(barrel);
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0072, lite ? 10 : 18), lens);
    glassDisc.rotation.y = Math.PI;
    glassDisc.position.set(0, 0, -0.0162);
    cameraMount.add(glassDisc);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0078, 0.0013, lite ? 4 : 6, lite ? 10 : 14), ring);
    bezel.position.set(0, 0, -0.0156);
    cameraMount.add(bezel);
  }

  /* The video antenna, a whip behind the canopy. NAMED, because it is wire
   * and not aircraft: scripts/craft-check.js leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.080, lite ? 5 : 8), antenna);
    const s = 1.020;
    mast.position.set(0, deckAt(s, 0) + 0.036, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /* The motor behind the spinner, the spinner, and the carbon prop, on
   * cubcraft.js's mount. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.014, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, 0, st(0.058));
    group.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(0, 0, st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    const back = -(SPINNER_BASE_S - PROP_S);
    const len = PROP_S;
    const prof = [];
    const m = lite ? 4 : 6;
    prof.push(new THREE.Vector2(0.0001, back));
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      const r = Math.max(0.0005, SPINNER_R * Math.sqrt(1 - u * u));
      prof.push(new THREE.Vector2(r, back + 0.004 + (len - back - 0.004) * u));
    }
    /* A kit's spinner: another shape in the cowl's red, or the stock one
     * with a black ring round its middle. */
    const shape = kit.spinner === 'striped' ? prof : spinnerFor(kit.spinner, prof, SPINNER_R, back, len, m + 2);
    let spinner;
    if (kit.spinner === 'striped') {
      spinner = new THREE.Group();
      const y = (f) => back + (len - back) * f;
      profileBands(shape, [y(0.28), y(0.42)]).forEach((b, i) => {
        const piece = new THREE.Mesh(new THREE.LatheGeometry(b, lite ? 10 : 14), i === 1 ? black : trimMat);
        piece.name = 'spinner';
        piece.castShadow = shade;
        spinner.add(piece);
      });
    } else {
      spinner = new THREE.Mesh(new THREE.LatheGeometry(shape, lite ? 10 : 14), trimMat);
    }
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    propMount.add(spinner);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateZ((12 * Math.PI) / 180);
    const bladeMesh = new THREE.Mesh(mergeGeometries([bladeGeo, bladeGeo.clone().rotateY(Math.PI)], false), propMat);
    bladeMesh.castShadow = shade;
    rotor.add(bladeMesh);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({
        color: 0x3a3e44,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        fog,
      }),
    );
    disc.renderOrder = 1;
    disc.visible = false;
    propMount.add(disc);
    discs.push(disc);
  }

  /* The blur: an 18 in prop at speed reads as a disc, at rest as two
   * blades. Its density follows the motor's rate, omega rad/s off the
   * plant (stateCurr[14]), so a hover's part throttle shows a fainter disc
   * than a punch; a stopped prop shows none. Full is the plant's 0.85 of
   * the AM670's 10,160 rpm no load, 8,636 rpm (docs/CAP580-STAGE1.md),
   * 904 rad/s. */
  const DISC_FULL = 904;
  function setProp(omega) {
    const disc = discs[0];
    const k = Math.min(1, Math.max(0, omega) / DISC_FULL);
    disc.visible = k > 0.04;
    disc.material.opacity = 0.32 * k;
    return 0;
  }
  for (let k = 1; k < 4; k += 1) {
    const none = new THREE.Group();
    group.add(none);
    blades.push(none);
    const noDisc = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }),
    );
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }

  /* Four lamps on the four slots the pose driver walks, cubcraft.js's
   * arrangement: the wingtips, the cowl and the turtle deck ahead of the
   * fin. */
  const tipTop = (x) => wingAt(x)(0.4, 1);
  const lampAt = [
    { p: tipTop(-0.80), front: true },
    { p: tipTop(0.80), front: false },
    { p: fusePoint(0.100, 0), front: true },
    { p: fusePoint(1.250, 0), front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0035, 0.014), ledMat);
    led.position.copy(at.p);
    led.position.y += 0.001;
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

  /* Pose the surfaces, cubcraft.js's signs. */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    tailwheel.pivot.quaternion.copy(q.setFromAxisAngle(tailwheel.axis, -rudRad));
  }
  setSurfaces(0, 0, 0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: CAP_PROP_SPIN,
    setSurfaces,
    setProp,
    livery: coat.livery,
  };
}
