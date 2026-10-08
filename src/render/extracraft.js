/*
 * extracraft.js: the Extra 300's model, and nothing else.
 *
 * Its own file for cubcraft.js's reason: a 3D monoplane is not a Cub. It
 * is a moulded foam fuselage, deep and slab sided, with a bubble canopy
 * aft over the wing; a low, tapered, untwisted wing whose ailerons run
 * nearly root to tip; a big stabiliser and elevator on the thrust line;
 * and a rudder three quarters of its fin's area that runs down under the
 * fuselage. A 13 x 6 wood prop turns ahead of a round cowl, and the
 * aircraft sits on two spatted wheels and a steered tailwheel.
 *
 * The subject is E-flite's Extra 300 3D 1.3m, EFL115500, in E-flite's
 * scheme: a yellow orange nose and spats, white and grey over the wing's
 * top and the fuselage, the wing's underside in yellow and black squares,
 * grey and black at the tail. E-flite publishes the span, 1308 mm, the
 * length, 1260 mm, the wing, 36.9 dm2, and the CG, 90 to 100 mm behind
 * the wing's leading edge at the root; the rest is taken off E-flite's
 * dimensioned top view (EFL115500_A73, 1.0163 mm a pixel on the span),
 * its side photograph (EFL115500_A03, 0.708 mm a pixel on the length) and
 * its front photograph, docs/EXTRA-STAGE1.md:
 *
 *   span            1.308 m, the tips square
 *   wing            0.366 m at the root, 0.204 at the tip, its leading
 *                   edge 0.072 of the span out behind the root's, a
 *                   symmetric 14 percent section, no dihedral, 0.07 m
 *                   under the thrust line
 *   ailerons        from 0.077 m out to the tip, 25 percent of the root's
 *                   chord to 34 of the tip's
 *   tail            a 0.501 m stabiliser, 0.208 at its root and 0.142 at
 *                   its tip, the elevator the aft 45 percent; a fin and
 *                   rudder 0.208 m over the thrust line and 0.085 under
 *                   it, the rudder three quarters of it
 *   gear            a 0.324 m track, 57 mm wheels in spats on curved
 *                   legs, the axles 0.153 m ahead of the CG
 *   tailwheel       22 mm, on a wire under the rudder, steered by it
 *   prop            13 x 6 two blade tractor, clockwise seen from behind,
 *                   0.302 m ahead of the CG, behind a 56 mm spinner
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 95 mm behind the wing's leading
 * edge at the root, the middle of E-flite's range, on the thrust line.
 * Every station below is measured aft from the spinner's tip and turned
 * into the craft frame's z by st().
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
const PROP_S = 0.035;
const CG_S = PROP_S + 0.302;
const st = (s) => s - CG_S;

const HALF = 0.654;
const ROOT_C = 0.366;
const TIP_C = 0.204;
/* The root's leading edge on the centreline, 95 mm ahead of the CG at the
 * fuselage's side 75 mm out, less the sweep there. */
const ROOT_LE_S = CG_S - 0.095 - 0.072 * 0.075;
const WING_Y = -0.070;
const WING_T = 0.14;

const AIL_IN = 0.077;
const AIL_HINGE_ROOT = 0.75;
const AIL_HINGE_TIP = 0.64;

const STAB_HALF = 0.2505;
const STAB_ROOT_LE_S = CG_S + 0.649;
const STAB_ROOT_C = 0.208;
const STAB_TIP_LE_S = CG_S + 0.700;
const STAB_TIP_C = 0.142;
const ELEV_F = 0.55;
const STAB_Y = -0.031;
const STAB_T = 0.07;

const TAIL_TOP = 0.208;
const RUDDER_BOTTOM = -0.085;
const RUDDER_S = CG_S + 0.800;
const RUDDER_TE_S = CG_S + 0.926;
const FIN_T = 0.07;

const PROP_R = 0.1651;
const SPINNER_R = 0.028;
const SPINNER_BASE_S = 0.045;

const MAIN_X = 0.162;
const MAIN_S = CG_S - 0.153;
const MAIN_Y = -0.2131;
const MAIN_R = 0.0285;
const MAIN_W = 0.020;
const TAIL_PIVOT_S = CG_S + 0.815;
const TAIL_WHEEL_S = CG_S + 0.824;
const TAIL_WHEEL_Y = -0.1158;
const TAIL_WHEEL_R = 0.011;

function chordLE(ax) {
  const u = Math.min(1, ax / HALF);
  return { c: ROOT_C + (TIP_C - ROOT_C) * u, le: st(ROOT_LE_S + 0.072 * ax) };
}
function ailHinge(ax) {
  const u = Math.min(1, Math.max(0, (ax - AIL_IN) / (HALF - AIL_IN)));
  return AIL_HINGE_ROOT + (AIL_HINGE_TIP - AIL_HINGE_ROOT) * u;
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
 * The wing, tip to tip in one loft, cut at the ailerons' hinge line from
 * AIL_IN out: the step from a full section to a cut one at the same
 * station is the cut out's side wall.
 */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const outs = lite ? [0.30, HALF] : [0.20, 0.35, 0.50, HALF];
  const half = [[0, 1], [AIL_IN - eps, 1], ...[AIL_IN + eps, ...outs].map((x) => [x, ailHinge(x)])];
  const stations = [
    ...half.slice(1).reverse().map(([x, f]) => [-x, f]),
    ...half,
  ];
  return loft(stations.map(([x, f]) => section(wingAt(x), 0, f, n)));
}

/* A hinged surface, cubcraft.js's: the pivot on the hinge, turning about
 * the hinge's own axis, +x or +y, so a negative turn lifts the trailing
 * edge or swings it left. */
function hinged(geo, a, b, material, shade) {
  const axis = new THREE.Vector3().subVectors(b, a).normalize();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  geo.translate(-mid.x, -mid.y, -mid.z);
  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = shade;
  pivot.add(mesh);
  return { pivot, axis, mesh };
}

function aileron(sign, material, shade, lite) {
  const n = lite ? 4 : 6;
  const xs = [AIL_IN + 0.002, 0.30, HALF - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  const geo = loft(xs.map((x) => section(wingAt(x), ailHinge(Math.abs(x)), 1, n)));
  const hingePoint = (x) => wingAt(x)(ailHinge(Math.abs(x)), 1).add(wingAt(x)(ailHinge(Math.abs(x)), -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

function stabGeometry(n) {
  const xs = [-STAB_HALF, -0.12, 0, 0.12, STAB_HALF];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
/* The elevator, both halves in one piece across a notch for the rudder,
 * as its horns are joined by a U wire. */
function elevatorGeometry(n) {
  const halfOf = (sign) => {
    const xs = [0.016, 0.12, STAB_HALF - 0.001].map((x) => sign * x);
    if (sign < 0) {
      xs.reverse();
    }
    return loft(xs.map((x) => {
      const p = stabPlan(Math.abs(x));
      return section(stabAt(x, p.hinge, p.te - p.hinge), 0, 1, n);
    }));
  };
  return merged([halfOf(-1), halfOf(1)]);
}

/*
 * The fin and rudder's outline at height y: the fin's leading edge raked
 * back from the fuselage's top to the square top of the rudder, the
 * rudder's hinge vertical and its trailing edge raked a little forward
 * up, the rudder running on under the fuselage to its foot.
 */
function finLE(y) {
  const y0 = 0.035;
  const u = Math.min(1, Math.max(0, (y - y0) / (TAIL_TOP - y0)));
  return CG_S + 0.640 + (0.795 - 0.640) * u;
}
function rudderTE(y) {
  const u = (y - RUDDER_BOTTOM) / (TAIL_TOP - RUDDER_BOTTOM);
  return RUDDER_TE_S - 0.025 * u;
}
function finGeometry(n) {
  const ys = [0.030, 0.080, 0.130, 0.180, TAIL_TOP];
  return loft(ys.map((y) => {
    const le = finLE(y);
    return section(finAt(y, st(le), RUDDER_S - le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUDDER_BOTTOM, -0.040, 0.0, 0.060, 0.130, TAIL_TOP];
  return loft(ys.map((y) => section(finAt(y, st(RUDDER_S), rudderTE(y) - RUDDER_S), 0, 1, n)));
}

/*
 * The fuselage, as rounded box sections along the stations: half width,
 * top, bottom and squareness. The round cowl behind the spinner, deep slab
 * sides under the wing, the turtle deck rising to the canopy aft over the
 * wing and tapering to the rudder post.
 */
const FUSE = [
  [0.030, 0.032, 0.030, -0.032, 2.0],
  [0.050, 0.052, 0.050, -0.056, 2.2],
  [0.110, 0.062, 0.060, -0.074, 2.6],
  [0.220, 0.064, 0.062, -0.100, 3.0],
  [0.340, 0.063, 0.060, -0.104, 3.2],
  [0.480, 0.058, 0.055, -0.098, 3.2],
  [0.700, 0.042, 0.046, -0.070, 3.0],
  [0.950, 0.024, 0.036, -0.042, 2.8],
  [RUDDER_S, 0.009, 0.030, -0.030, 2.4],
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
  throw new Error(`extracraft: station ${s} is off the fuselage`);
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
function fuseGeometry(lite) {
  const around = lite ? 16 : 24;
  const ss = lite
    ? [0.030, 0.050, 0.110, 0.220, 0.340, 0.480, 0.700, 0.950, RUDDER_S]
    : [0.030, 0.040, 0.050, 0.080, 0.110, 0.160, 0.220, 0.280, 0.340, 0.410, 0.480, 0.590, 0.700, 0.820,
      0.950, 1.050, RUDDER_S];
  return loft(ss.map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/*
 * The canopy, a bubble over the turtle deck aft over the wing, 0.09 m
 * over the thrust line at its top: a half ellipsoid along z.
 */
const CANOPY_S0 = CG_S + 0.080;
const CANOPY_S1 = CG_S + 0.340;
function canopyGeometry(lite) {
  const len = CANOPY_S1 - CANOPY_S0;
  const g = new THREE.SphereGeometry(1, lite ? 12 : 20, lite ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(0.046, 0.042, len / 2);
  const mid = (CANOPY_S0 + CANOPY_S1) / 2;
  g.translate(0, fuseAt(mid).yc + fuseAt(mid).h - 0.004, st(mid));
  return g;
}

/* The nose's yellow: the cowl, as a sleeve of the fuselage's own sections
 * a hair proud of it, from the spinner back to the paint's edge. */
function sleeve(lite, s0, s1, out) {
  const around = lite ? 16 : 24;
  const n = lite ? 4 : 8;
  const secs = [];
  for (let i = 0; i <= n; i += 1) {
    const s = s0 + ((s1 - s0) * i) / n;
    const ring = [];
    for (let j = 0; j < around; j += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * j) / around, out));
    }
    secs.push(ring);
  }
  return loft(secs);
}

/* A flat panel a hair under the wing's underside: the squares of the
 * scheme, the chord fractions f0 to f1 from span x0 to x1. */
function underPanel(x0, x1, f0, f1) {
  const at = (x, f) => wingAt(x)(f, -1).add(new THREE.Vector3(0, -0.0012, 0));
  const a = at(x0, f0);
  const b = at(x1, f0);
  const c = at(x1, f1);
  const d = at(x0, f1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
  geo.setIndex([0, 2, 1, 0, 3, 2]);
  geo.computeVertexNormals();
  if (geo.getAttribute('normal').getY(0) > 0) {
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
  }
  return geo;
}
/* The same over the top, for the grey panels. */
function overPanel(x0, x1, f0, f1) {
  const at = (x, f) => wingAt(x)(f, 1).add(new THREE.Vector3(0, 0.0012, 0));
  const a = at(x0, f0);
  const b = at(x1, f0);
  const c = at(x1, f1);
  const d = at(x0, f1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  if (geo.getAttribute('normal').getY(0) < 0) {
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
  }
  return geo;
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

/* A 13 x 6 wood blade, wide in the middle, rounded at the tip. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0055, 0.012);
  s.bezierCurveTo(0.0240, -0.020, 0.0200, -r * 0.50, 0.0080, -r * 0.97);
  s.lineTo(-0.0055, -r * 0.94);
  s.bezierCurveTo(-0.0180, -r * 0.45, -0.0120, -0.012, -0.0040, 0.012);
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
    throw new Error('extracraft: merge failed');
  }
  return geo;
}

/*
 * The wheels' drawn lowest points in the level craft frame, and the
 * attitude they rest at, cubcraft.js's construction: the ground line
 * tangent under the main and tail wheel circles, solved by bisection.
 */
const MAIN_AXLE = [MAIN_X, MAIN_Y, st(MAIN_S)];
const TAIL_AXLE = [0, TAIL_WHEEL_Y, st(TAIL_WHEEL_S)];
function restPitch() {
  const dy = TAIL_AXLE[1] - MAIN_AXLE[1];
  const dz = TAIL_AXLE[2] - MAIN_AXLE[2];
  const f = (p) => Math.cos(p) * dy - Math.sin(p) * dz - (TAIL_WHEEL_R - MAIN_R);
  let lo = 0;
  let hi = Math.PI / 4;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
const REST_PITCH = restPitch();
const restContact = (axle, r) => [
  axle[0],
  axle[1] - r * Math.cos(REST_PITCH),
  axle[2] + r * Math.sin(REST_PITCH),
];
const REST_CG_HEIGHT = (() => {
  const c = restContact(MAIN_AXLE, MAIN_R);
  return -(Math.cos(REST_PITCH) * c[1] - Math.sin(REST_PITCH) * c[2]);
})();

/*
 * Exported numbers, so the airframe table and the scale check are held
 * against the drawn machine: hullR the furthest reach in plan, which is
 * the rudder's trailing edge's, 0.926 m aft against the tips' 0.654 out,
 * vHalfUp the rudder's top, vHalfDown the main tyres' bottoms.
 */
const UP = TAIL_TOP;
const DOWN = -(MAIN_Y - MAIN_R);
export const EXTRA_DIMS = {
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
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    tail: [0, TAIL_AXLE[1] - TAIL_WHEEL_R, TAIL_AXLE[2]],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: (REST_PITCH * 180) / Math.PI,
    cgHeight: REST_CG_HEIGHT,
    contact: {
      mainLeft: restContact([-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], MAIN_R),
      mainRight: restContact(MAIN_AXLE, MAIN_R),
      tail: restContact(TAIL_AXLE, TAIL_WHEEL_R),
    },
  },
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: RUDDER_TE_S - CG_S,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: RUDDER_TE_S,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera mount: the FPV camera on the turtle deck ahead of the
 * canopy, where the plant's camera is (src/native/plant.c), 50 mm ahead of
 * the CG and 70 mm over it, looking over the long nose through the prop.
 */
const CAM_S = CG_S - 0.050;
export const EXTRA_MOUNT_FORWARD = -st(CAM_S);
export const EXTRA_MOUNT_UP = 0.070;

/* A tractor turning clockwise seen from behind, as cubcraft.js's. */
export const EXTRA_PROP_SPIN = [1, 0, 0, 0];

export function buildExtraCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'extra-craft';
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

  /* The scheme's colours by region (src/render/livery.js): the white of
   * the wing and of the fuselage, the yellow of the nose and spats, the
   * grey tail, the black trim, the yellow of the wing's underside squares;
   * the surfaces a shade of their region. */
  const coat = paintRegions();
  const wingMat = coat.base('wing', cel({ color: 0xeceef0, rim: 0.28, spec: 0.30, specWidth: 0.014 }));
  const fuseMat = coat.base('fuselage', cel({ color: 0xeceef0, rim: 0.28, spec: 0.34, specWidth: 0.016 }));
  const noseMat = coat.base('nose', cel({ color: 0xf2a81d, rim: 0.28, spec: 0.36, specWidth: 0.016 }));
  const tailMat = coat.base('tail', cel({ color: 0x8a9096, rim: 0.28, spec: 0.30, specWidth: 0.014 }));
  const trimMat = coat.base('trim', cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 }));
  const checkMat = coat.base('checks', cel({ color: 0xf2b21d, rim: 0.28, spec: 0.30, specWidth: 0.014 }));
  const wingFlap = coat.shade('wing', cel({ color: 0xd6d9dc, rim: 0.28, spec: 0.26, specWidth: 0.014 }));
  const tailFlap = coat.shade('tail', cel({ color: 0x747a80, rim: 0.28, spec: 0.26, specWidth: 0.014 }));
  const black = cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 });
  const metal = cel({ color: 0xb4b0a6, rim: 0.30, spec: 0.70, specWidth: 0.022 });
  /* The visual kit (configs/kits.js kitParts): pixels only, drawn inside
   * the stock model's box, which is what configs/hulls.js is made from.
   * The glass is not a paint region, so a tint is its own colour. */
  const kit = opts.kit ?? {};
  const glass = cel({
    color: { smoke: 0x1c242b, gold: 0x8a7440 }[kit.canopy] ?? 0x2f4658,
    rim: 0.40, spec: kit.canopy ? 0.80 : 0.55, specWidth: 0.020, specColor: 0xf3ead4,
  });
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
  const propMat = cel({ color: 0xc89a5e, rim: 0.26, spec: 0.40, specWidth: 0.016 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = EXTRA_DIMS;
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
    fuse.name = 'extra-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.018, ink);
    group.add(fuse);
  }

  /* The yellow: the cowl's sleeve to the firewall and the two spats. */
  {
    const parts = [sleeve(lite, 0.030, 0.200, 0.0010)];
    for (const sign of [-1, 1]) {
      const spat = new THREE.SphereGeometry(1, lite ? 10 : 16, lite ? 6 : 10);
      spat.scale(0.022, 0.030, 0.062);
      spat.translate(sign * MAIN_X, MAIN_Y + 0.004, st(MAIN_S) + 0.006);
      parts.push(spat);
      /* The leg, a curved moulding from the fuselage's bottom out to the
       * spat, drawn as two straight runs. */
      const root = new THREE.Vector3(sign * 0.045, fuseAt(MAIN_S).yc - fuseAt(MAIN_S).h + 0.004, st(MAIN_S - 0.015));
      const knee = new THREE.Vector3(sign * 0.120, MAIN_Y + 0.070, st(MAIN_S - 0.004));
      const foot = new THREE.Vector3(sign * (MAIN_X - 0.012), MAIN_Y + 0.024, st(MAIN_S));
      parts.push(rod(root, knee, 0.0065, rodSeg, 2.2));
      parts.push(rod(knee, foot, 0.0065, rodSeg, 2.2));
    }
    const nose = new THREE.Mesh(merged(parts), noseMat);
    nose.name = 'extra-nose';
    nose.castShadow = shade;
    group.add(nose);
  }

  /* The wing, one draw, and the tail feathers, one draw. */
  {
    const n = lite ? 5 : 7;
    const wing = new THREE.Mesh(wingGeometry(lite), wingMat);
    wing.name = 'extra-wing';
    wing.castShadow = shade;
    group.add(wing);
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n)]), tailMat);
    tail.name = 'extra-tail';
    tail.castShadow = shade;
    group.add(tail);
  }

  /*
   * Black trim, one draw: the stripe along each side of the fuselage, the
   * grey panels' black edge across the wing's top, the tyres.
   */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const a = 0.70 * sign;
      const stripe = [];
      const ss = [0.200, 0.400, 0.600, 0.800, 1.000, RUDDER_S - 0.01];
      for (const s of ss) {
        const up = fusePoint(s, a + 0.10 * sign, 0.0012);
        const dn = fusePoint(s, a, 0.0012);
        stripe.push([up, dn]);
      }
      const pos = [];
      const idx = [];
      stripe.forEach(([u, d], i) => {
        pos.push(u.x, u.y, u.z, d.x, d.y, d.z);
        if (i > 0) {
          const k = i * 2;
          if (sign > 0) {
            idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
          } else {
            idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
          }
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      parts.push(g);
      parts.push(overPanel(sign * 0.30, sign * 0.33, 0.02, 0.62));
      const tyre = new THREE.TorusGeometry(MAIN_R - 0.009, 0.009, 6, lite ? 16 : 20);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(tyre);
    }
    const trim = new THREE.Mesh(merged(parts), trimMat);
    trim.name = 'extra-trim';
    trim.castShadow = shade;
    group.add(trim);
  }

  /* The underside's squares, yellow on the white, and the top's grey
   * panels outboard, the scheme's. */
  {
    const parts = [];
    const cols = [0.12, 0.25, 0.38, 0.51, HALF - 0.005];
    const rows = [0.0, 0.33, 0.66];
    for (const sign of [-1, 1]) {
      for (let i = 0; i + 1 < cols.length; i += 1) {
        for (let j = 0; j < rows.length; j += 1) {
          if ((i + j) % 2 === 0) {
            const f1 = j + 1 < rows.length ? rows[j + 1] : 0.97;
            parts.push(underPanel(sign * cols[i], sign * cols[i + 1], rows[j] + 0.01, f1));
          }
        }
      }
    }
    const checks = new THREE.Mesh(merged(parts), checkMat);
    checks.name = 'extra-checks';
    group.add(checks);
    const grey = [];
    for (const sign of [-1, 1]) {
      grey.push(overPanel(sign * 0.33, sign * (HALF - 0.005), 0.02, 0.60));
    }
    const greyMesh = new THREE.Mesh(merged(grey), tailMat);
    greyMesh.name = 'extra-grey';
    group.add(greyMesh);
  }

  /* The metal: the spats' axles and the tailwheel's wire. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const hub = new THREE.CylinderGeometry(0.009, 0.009, MAIN_W + 0.002, seg);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(hub);
    }
    parts.push(rod(new THREE.Vector3(0, fuseAt(1.080).yc - fuseAt(1.080).h + 0.002, st(1.080)),
      new THREE.Vector3(0, RUDDER_BOTTOM - 0.004, st(TAIL_PIVOT_S)), 0.0018, lite ? 4 : 6, 0.4));
    const metalMesh = new THREE.Mesh(merged(parts), metal);
    metalMesh.name = 'extra-metal';
    metalMesh.castShadow = shade;
    group.add(metalMesh);
  }

  /* A kit's side force generators: a black plate on each square tip, a
   * hand of chord fore and aft and a few centimetres above and below,
   * set in by half its thickness so the span does not grow. */
  if (kit.wingtips === 'sfg') {
    const plates = [-1, 1].map((sign) => {
      const x = sign * (HALF - 0.003);
      const le = wingAt(x)(0.06, 1);
      const te = wingAt(x)(0.94, 1);
      return plateGeometry([
        [x, WING_Y + 0.042, le.z + 0.010],
        [x, WING_Y + 0.042, te.z - 0.020],
        [x, WING_Y - 0.042, te.z - 0.020],
        [x, WING_Y - 0.042, le.z + 0.010],
      ], [sign, 0, 0], 0.004);
    });
    const sfg = new THREE.Mesh(merged(plates), black);
    sfg.name = 'extra-sfg';
    sfg.castShadow = shade;
    group.add(sfg);
  }

  /* The canopy, one draw. */
  {
    const glassMesh = new THREE.Mesh(canopyGeometry(lite), glass);
    glassMesh.name = 'extra-glass';
    group.add(glassMesh);
  }

  /* The four moving surfaces. */
  const n = lite ? 4 : 5;
  const leftAil = aileron(-1, wingFlap, shade, lite);
  const rightAil = aileron(1, wingFlap, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, stabPlan(Math.abs(x)).hinge);
  const elevator = hinged(elevatorGeometry(n), eh(-STAB_HALF), eh(STAB_HALF), tailFlap, shade);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_S)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_S)),
    tailFlap, shade);

  /* The tailwheel on its own vertical pivot under the rudder, turning with
   * it, as its wire bracket on the rudder turns it. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, RUDDER_BOTTOM - 0.004, st(TAIL_PIVOT_S));
    const trail = TAIL_WHEEL_S - TAIL_PIVOT_S;
    const dropY = TAIL_WHEEL_Y - (RUDDER_BOTTOM - 0.004);
    const forkParts = [
      rod(new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(0, dropY + 0.002, trail), 0.0016, lite ? 4 : 6),
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

  /* The camera on the turtle deck ahead of the canopy. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, EXTRA_MOUNT_UP, -EXTRA_MOUNT_FORWARD);
  cameraMount.name = 'extra-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.020, 0.020), camBody);
    housing.position.set(0, 0, 0.006);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
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
    const s = CG_S + 0.400;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.036, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /* The motor behind the spinner, the spinner, and the wood prop, on
   * cubcraft.js's mount. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.012, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, 0, st(0.050));
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
    /* A kit's spinner: another shape in the nose's colour, or the stock
     * one with a black ring round its middle. */
    const shape = kit.spinner === 'striped' ? prof : spinnerFor(kit.spinner, prof, SPINNER_R, back, len, m + 2);
    let spinner;
    if (kit.spinner === 'striped') {
      spinner = new THREE.Group();
      const y = (f) => back + (len - back) * f;
      profileBands(shape, [y(0.28), y(0.42)]).forEach((band, i) => {
        const piece = new THREE.Mesh(new THREE.LatheGeometry(band, lite ? 10 : 14), i === 1 ? black : noseMat);
        piece.name = 'spinner';
        piece.castShadow = shade;
        spinner.add(piece);
      });
    } else {
      spinner = new THREE.Mesh(new THREE.LatheGeometry(shape, lite ? 10 : 14), noseMat);
    }
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    propMount.add(spinner);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateZ((15 * Math.PI) / 180);
    const bladeMesh = new THREE.Mesh(mergeGeometries([bladeGeo, bladeGeo.clone().rotateY(Math.PI)], false), propMat);
    bladeMesh.castShadow = shade;
    rotor.add(bladeMesh);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({
        color: 0x8a7050,
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

  /* The blur: a 13 in prop at speed reads as a disc, at rest as two
   * blades. Its density follows the motor's rate, omega rad/s off the
   * plant (stateCurr[14]), so a hover's half throttle shows a fainter
   * disc than a punch; a stopped prop shows none. Full is the plant's
   * 0.85 of the 4250's 13,468 rpm no load, 1,199 rad/s. */
  const DISC_FULL = 1199;
  function setProp(omega) {
    const disc = discs[0];
    const n = Math.min(1, Math.max(0, omega) / DISC_FULL);
    disc.visible = n > 0.04;
    disc.material.opacity = 0.32 * n;
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
    { p: tipTop(-0.62), front: true },
    { p: tipTop(0.62), front: false },
    { p: fusePoint(0.070, 0), front: true },
    { p: fusePoint(0.950, 0), front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.0035, 0.012), ledMat);
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
    propSpin: EXTRA_PROP_SPIN,
    setSurfaces,
    setProp,
    livery: coat.livery,
  };
}
