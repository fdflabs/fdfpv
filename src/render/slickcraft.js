/*
 * slickcraft.js: Extreme Flight's Slick 580's model, and nothing else.
 *
 * Its own file for cubcraft.js's reason: a 35 percent IMAC monoplane is
 * not an Extra. A deep, slab sided balsa fuselage with a round cowl on a
 * petrol twin, a long bubble canopy that runs on into the turtle deck; a
 * mid wing, tapered and untwisted, with moulded rounded tips and ailerons
 * from near the root to the tip rib; a big stabiliser whose elevators
 * carry balance horns at the tips; a fin and a full depth rudder with a
 * horn at its top; two wheel pants on carbon legs and a steered tailwheel;
 * a 28 x 10 carbon prop behind a 5 in spinner.
 *
 * The subject is the 105.5 in (2680 mm) Slick 580 EXP as Extreme Flight's
 * dimensioned data sheet draws it (DATASHEET_105SLICK580v2.pdf), the V3
 * on the same wing, in the 10th Anniversary red and white (356RC);
 * docs/SLICK-STAGE1.md has the measurements and why the labels win where
 * the drawing differs:
 *
 *   span            2.680 m, 2.540 between the tip ribs, rounded tips
 *   wing            0.570 m at the fuselage's side, 0.285 at the tip rib,
 *                   the leading edge swept back 73 mm to it, a symmetric
 *                   12.6 percent section, no dihedral, its chord line 34
 *                   mm under the thrust line
 *   ailerons        32 percent of the chord, from 0.181 m out to the rib
 *   tail            a 1.039 m stabiliser, 0.335 at its root and 0.206 at
 *                   its tip, the elevators behind a straight hinge line
 *                   and over the whole chord outboard of 0.42 m; a fin and
 *                   rudder 0.466 m over the thrust line and 0.096 under
 *                   it, the rudder's hinge line 2.250 m from the
 *                   spinner's tip, the sheet's label
 *   gear            a 0.630 m track, 105 mm wheels in pants on carbon
 *                   legs, the axles 0.159 m ahead of the CG
 *   tailwheel       38 mm, under the rudder, steered by it
 *   prop            28 x 10 two blade carbon tractor, clockwise seen from
 *                   behind, 0.609 m ahead of the CG, behind a 5 in spinner
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 169 mm behind the wing's leading
 * edge at the root, the middle of the sheet's range on the wing tube, 39
 * mm under the thrust line (npm run slick:derive). Every station below is
 * measured aft from the spinner's tip and turned into the craft frame's z
 * by st(); heights are over the CG.
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
const PROP_S = 0.160;
const CG_S = PROP_S + 0.6093;
const st = (s) => s - CG_S;
/* The thrust line over the CG. */
const THRUST_Y = 0.039;

const HALF = 1.340;
const RIB = 1.270;
const ROOT_Y = 0.163;
const ROOT_C = 0.570;
const RIB_C = 0.285;
const TIP_END_C = 0.20;
const ROOT_LE_S = CG_S - 0.169;
const LE_SWEEP = 0.073;
const WING_Y = THRUST_Y - 0.034;
const WING_T = 0.126;

const AIL_IN = 0.181;
const AIL_HINGE = 0.68;

const STAB_HALF = 0.5195;
const STAB_ROOT_LE_S = 2.011;
const STAB_ROOT_C = 0.335;
const STAB_TIP_LE_S = STAB_ROOT_LE_S + 0.0935;
const STAB_TIP_C = 0.206;
/* The hinge line straight across, 0.165 m behind the root's leading edge;
 * outboard of HORN_X the elevator is the whole chord, its balance. */
const STAB_HINGE_S = STAB_ROOT_LE_S + 0.165;
const HORN_X = 0.42;
const STAB_Y = THRUST_Y + 0.014;
const STAB_T = 0.10;

const TAIL_TOP = THRUST_Y + 0.466;
const RUDDER_BOTTOM = THRUST_Y - 0.096;
const RUDDER_S = 2.250;
const RUDDER_TE_TOP_S = 2.351;
const RUDDER_TE_S = 2.497;
/* The rudder's balance horn, over the fin's top from this height. */
const HORN_Y = THRUST_Y + 0.378;
const FIN_ROOT_Y = THRUST_Y + 0.134;
const FIN_T = 0.09;

const PROP_R = 0.3556;
const SPINNER_R = 0.0623;
const SPINNER_BASE_S = PROP_S + 0.010;

const MAIN_X = 0.315;
const MAIN_S = CG_S - 0.1592;
const MAIN_Y = -0.3875;
const MAIN_R = 0.0525;
const MAIN_W = 0.036;
const PANT_S = MAIN_S + 0.048;
const TAIL_PIVOT_S = 2.262;
const TAIL_WHEEL_S = CG_S + 1.5088;
const TAIL_WHEEL_Y = -0.1454;
const TAIL_WHEEL_R = 0.019;

/* The plan: the root chord to the fuselage's side, tapering to the rib,
 * the moulded tip rounding off to its end. */
function chordLE(ax) {
  const x = Math.abs(ax);
  if (x <= ROOT_Y) {
    return { c: ROOT_C, le: st(ROOT_LE_S) };
  }
  if (x <= RIB) {
    const u = (x - ROOT_Y) / (RIB - ROOT_Y);
    return { c: ROOT_C + (RIB_C - ROOT_C) * u, le: st(ROOT_LE_S + LE_SWEEP * u) };
  }
  const u = Math.min(1, (x - RIB) / (HALF - RIB));
  const round = 1 - Math.sqrt(1 - u * u);
  const c = RIB_C - (RIB_C - TIP_END_C) * round;
  return { c, le: st(ROOT_LE_S + LE_SWEEP + (RIB_C - c) * 0.35) };
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
  const { c, le } = chordLE(x);
  return (t, side) => new THREE.Vector3(x, WING_Y + side * c * naca(t, WING_T), le + t * c);
}
function stabPlan(ax) {
  const u = Math.min(1, ax / STAB_HALF);
  const le = STAB_ROOT_LE_S + (STAB_TIP_LE_S - STAB_ROOT_LE_S) * u;
  const c = STAB_ROOT_C + (STAB_TIP_C - STAB_ROOT_C) * u;
  return { le: st(le), hinge: st(Math.max(le, STAB_HINGE_S)), te: st(le + c) };
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
 * AIL_IN out to the rib: the step from a full section to a cut one at the
 * same station is the cut out's side wall. The moulded tips are whole.
 */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const outs = lite ? [0.60, RIB - eps] : [0.40, 0.70, 1.00, RIB - eps];
  const tips = lite ? [RIB + eps, HALF] : [RIB + eps, 1.300, 1.322, HALF];
  const half = [[0, 1], [AIL_IN - eps, 1], ...[AIL_IN + eps, ...outs].map((x) => [x, AIL_HINGE]), ...tips.map((x) => [x, 1])];
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
  const xs = [AIL_IN + 0.002, 0.70, RIB - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  const geo = loft(xs.map((x) => section(wingAt(x), AIL_HINGE, 1, n)));
  const hingePoint = (x) => wingAt(x)(AIL_HINGE, 1).add(wingAt(x)(AIL_HINGE, -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

/* The stabiliser ahead of the hinge line, out to the elevators' horns. */
function stabGeometry(n) {
  const xs = [-HORN_X, -0.20, 0, 0.20, HORN_X];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
/* The elevators, both halves in one piece across the rudder's notch as
 * their horns are joined, each from the hinge line in and over the whole
 * chord outboard of HORN_X, its balance. */
function elevatorGeometry(n) {
  const eps = 0.0005;
  const halfOf = (sign) => {
    const xs = [[0.045, false], [0.20, false], [HORN_X - eps, false], [HORN_X + eps, true], [STAB_HALF - 0.001, true]]
      .map(([x, horn]) => [sign * x, horn]);
    if (sign < 0) {
      xs.reverse();
    }
    return loft(xs.map(([x, horn]) => {
      const p = stabPlan(Math.abs(x));
      const le = horn ? p.le + 0.002 : p.hinge;
      return section(stabAt(x, le, p.te - le), 0, 1, n);
    }));
  };
  return merged([halfOf(-1), halfOf(1)]);
}

/*
 * The fin and rudder's outline at height y: the fin's leading edge raked
 * back from the fuselage's top to the rudder's horn, the hinge vertical,
 * the rudder's trailing edge raked forward up from its foot on the
 * fuselage's bottom line, its horn over the fin's top.
 */
function finLE(y) {
  const u = Math.min(1, Math.max(0, (y - FIN_ROOT_Y) / (TAIL_TOP - FIN_ROOT_Y)));
  return 2.047 + (2.177 - 2.047) * u;
}
function rudderTE(y) {
  const u = (y - RUDDER_BOTTOM) / (TAIL_TOP - RUDDER_BOTTOM);
  return RUDDER_TE_S + (RUDDER_TE_TOP_S - RUDDER_TE_S) * u;
}
function finGeometry(n) {
  const ys = [FIN_ROOT_Y - 0.02, 0.24, 0.32, HORN_Y];
  return loft(ys.map((y) => {
    const le = finLE(y);
    return section(finAt(y, st(le), RUDDER_S - le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const eps = 0.0005;
  const ys = [[RUDDER_BOTTOM, false], [0.0, false], [0.15, false], [0.30, false], [HORN_Y - eps, false], [HORN_Y + eps, true], [TAIL_TOP, true]];
  return loft(ys.map(([y, horn]) => {
    const le = horn ? finLE(y) + 0.002 : RUDDER_S;
    return section(finAt(y, st(le), rudderTE(y) - le), 0, 1, n);
  }));
}

/*
 * The fuselage, as rounded box sections along the stations: half width,
 * top, bottom and squareness, off the sheet's side and top views. The
 * round cowl behind the spinner, deep slab sides under the wing, the
 * turtle deck rising behind the canopy and tapering to the rudder post.
 */
const FUSE = [
  [0.159, 0.064, 0.102, -0.023, 2.0],
  [0.196, 0.091, 0.113, -0.092, 2.4],
  [0.288, 0.150, 0.132, -0.121, 3.0],
  [0.419, 0.163, 0.152, -0.151, 3.4],
  [0.550, 0.163, 0.158, -0.149, 3.4],
  [0.682, 0.154, 0.150, -0.143, 3.4],
  [0.813, 0.147, 0.150, -0.137, 3.2],
  [0.944, 0.140, 0.200, -0.130, 3.0],
  [1.075, 0.133, 0.290, -0.124, 3.0],
  [1.338, 0.108, 0.279, -0.111, 2.8],
  [1.600, 0.085, 0.237, -0.099, 2.6],
  [1.863, 0.060, 0.195, -0.086, 2.6],
  [2.047, 0.044, 0.166, -0.078, 2.4],
  [RUDDER_S, 0.020, 0.118, -0.067, 2.2],
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
  throw new Error(`slickcraft: station ${s} is off the fuselage`);
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
    ? FUSE.map((r) => r[0])
    : [0.159, 0.175, 0.196, 0.24, 0.288, 0.35, 0.419, 0.48, 0.550, 0.62, 0.682, 0.75, 0.813, 0.88, 0.944, 1.01, 1.075,
      1.20, 1.338, 1.47, 1.600, 1.73, 1.863, 1.95, 2.047, 2.15, RUDDER_S];
  return loft(ss.map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/*
 * The canopy, the long bubble from over the cowl's back to where it runs
 * into the turtle deck, 0.31 m over the CG at its top: a half ellipsoid
 * along z on the deck's sill.
 */
const CANOPY_S0 = 0.400;
const CANOPY_S1 = 1.080;
function canopyGeometry(lite) {
  const len = CANOPY_S1 - CANOPY_S0;
  const g = new THREE.SphereGeometry(1, lite ? 12 : 20, lite ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(0.118, 0.165, len / 2);
  g.translate(0, 0.145, st((CANOPY_S0 + CANOPY_S1) / 2));
  return g;
}

/* The cowl's colour: a sleeve of the fuselage's own sections a hair proud
 * of it, from the spinner back to the paint's edge. */
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

/* A flat panel a hair under the wing's underside: the scheme's panels,
 * the chord fractions f0 to f1 from span x0 to x1. */
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
/* The same over the top. */
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

/* A 28 x 10 carbon blade, narrow at the root, wide past the middle,
 * square at the tip. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.010, 0.020);
  s.bezierCurveTo(0.040, -0.040, 0.034, -r * 0.55, 0.018, -r * 0.98);
  s.lineTo(-0.012, -r * 0.97);
  s.bezierCurveTo(-0.028, -r * 0.50, -0.020, -0.020, -0.008, 0.020);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: segments });
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
 * the rudder's foot's trailing edge, 1.728 m aft, against the tips' 1.340
 * out, vHalfUp the rudder's top, vHalfDown the main tyres' bottoms.
 */
const UP = TAIL_TOP;
const DOWN = -(MAIN_Y - MAIN_R);
export const SLICK_DIMS = {
  span: 2 * HALF,
  rootChord: ROOT_C,
  tipChord: RIB_C,
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
    tail: { axle: [...TAIL_AXLE], r: TAIL_WHEEL_R, width: 0.014 },
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
 * The camera mount: the FPV camera on the canopy's front, where the
 * plant's camera is (src/native/plant.c), 0.22 m ahead of the CG and 0.30
 * m over it: lower and further forward the 5 in spinner fills the bottom
 * of the picture.
 */
export const SLICK_MOUNT_FORWARD = 0.22;
export const SLICK_MOUNT_UP = 0.30;

/* A tractor turning clockwise seen from behind, as cubcraft.js's. */
export const SLICK_PROP_SPIN = [1, 0, 0, 0];

export function buildSlickCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'slick-craft';
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

  /* The scheme's colours by region (src/render/livery.js), the 10th
   * Anniversary's: white wing and fuselage, the red cowl, pants and tail,
   * the red sunburst bands out on the wing, black trim; the surfaces a
   * shade of their region. */
  const coat = paintRegions();
  const wingMat = coat.base('wing', cel({ color: 0xf2f2ef, rim: 0.28, spec: 0.40, specWidth: 0.014 }));
  const fuseMat = coat.base('fuselage', cel({ color: 0xf2f2ef, rim: 0.28, spec: 0.44, specWidth: 0.016 }));
  const noseMat = coat.base('nose', cel({ color: 0xc8141c, rim: 0.28, spec: 0.46, specWidth: 0.016 }));
  const tailMat = coat.base('tail', cel({ color: 0xc8141c, rim: 0.28, spec: 0.40, specWidth: 0.014 }));
  const trimMat = coat.base('trim', cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 }));
  const raysMat = coat.base('rays', cel({ color: 0xc8141c, rim: 0.28, spec: 0.40, specWidth: 0.014 }));
  const wingFlap = coat.shade('wing', cel({ color: 0xdcdcd8, rim: 0.28, spec: 0.36, specWidth: 0.014 }));
  const tailFlap = coat.shade('tail', cel({ color: 0xa81118, rim: 0.28, spec: 0.36, specWidth: 0.014 }));
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
  const carbon = cel({ color: 0x1e2124, rim: 0.30, spec: 0.60, specWidth: 0.018, specColor: 0xd8e0e8 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = SLICK_DIMS;
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
    fuse.name = 'slick-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.018, ink);
    group.add(fuse);
  }

  /* The cowl's sleeve to the firewall, the two pants and their carbon legs
   * faired in the nose's colour. */
  {
    const parts = [sleeve(lite, 0.159, 0.485, 0.0015)];
    for (const sign of [-1, 1]) {
      const pant = new THREE.SphereGeometry(1, lite ? 10 : 16, lite ? 6 : 10);
      pant.scale(0.034, 0.049, 0.158);
      pant.translate(sign * MAIN_X, MAIN_Y + 0.025, st(PANT_S));
      parts.push(pant);
      const root = new THREE.Vector3(sign * 0.090, fuseAt(MAIN_S).yc - fuseAt(MAIN_S).h + 0.006, st(MAIN_S - 0.010));
      const foot = new THREE.Vector3(sign * (MAIN_X - 0.020), MAIN_Y + 0.060, st(MAIN_S));
      parts.push(rod(root, foot, 0.012, rodSeg, 3.0));
    }
    const nose = new THREE.Mesh(merged(parts), noseMat);
    nose.name = 'slick-nose';
    nose.castShadow = shade;
    group.add(nose);
  }

  /* The wing, one draw, and the tail feathers, one draw. */
  {
    const n = lite ? 5 : 7;
    const wing = new THREE.Mesh(wingGeometry(lite), wingMat);
    wing.name = 'slick-wing';
    wing.castShadow = shade;
    group.add(wing);
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n)]), tailMat);
    tail.name = 'slick-tail';
    tail.castShadow = shade;
    group.add(tail);
  }

  /* Black trim, one draw: the stripe along each side of the fuselage
   * under the canopy's sill and back to the tail, the tyres. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const a = 1.05 * sign;
      const stripe = [];
      const ss = [0.500, 0.800, 1.100, 1.400, 1.700, 2.000, RUDDER_S - 0.01];
      for (const s of ss) {
        const up = fusePoint(s, a + 0.12 * sign, 0.0015);
        const dn = fusePoint(s, a, 0.0015);
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
      const tyre = new THREE.TorusGeometry(MAIN_R - 0.014, 0.014, 6, lite ? 16 : 20);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(tyre);
    }
    const trim = new THREE.Mesh(merged(parts), trimMat);
    trim.name = 'slick-trim';
    trim.castShadow = shade;
    group.add(trim);
  }

  /* The rays: the scheme's bands out on the wing, top and bottom, from
   * two thirds of the way out to the rib, and a band inboard of them. */
  {
    const parts = [];
    /* Each band in chordwise strips, so the flat panels follow the
     * section's curve over a chord this deep. */
    const band = (x0, x1, f0, f1) => {
      const k = 8;
      for (let i = 0; i < k; i += 1) {
        const a0 = f0 + ((f1 - f0) * i) / k;
        const a1 = f0 + ((f1 - f0) * (i + 1)) / k;
        parts.push(overPanel(x0, x1, a0, a1), underPanel(x0, x1, a0, a1));
      }
    };
    for (const sign of [-1, 1]) {
      band(sign * 0.86, sign * (RIB - 0.004), 0.02, 0.66);
      band(sign * 0.70, sign * 0.78, 0.02, 0.66);
    }
    const rays = new THREE.Mesh(merged(parts), raysMat);
    rays.name = 'slick-rays';
    group.add(rays);
  }

  /* The metal: the axles and the tailwheel's wire. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const hub = new THREE.CylinderGeometry(0.014, 0.014, MAIN_W + 0.004, seg);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(hub);
    }
    parts.push(rod(new THREE.Vector3(0, fuseAt(2.15).yc - fuseAt(2.15).h + 0.002, st(2.15)),
      new THREE.Vector3(0, RUDDER_BOTTOM - 0.006, st(TAIL_PIVOT_S)), 0.003, lite ? 4 : 6, 0.4));
    const metalMesh = new THREE.Mesh(merged(parts), metal);
    metalMesh.name = 'slick-metal';
    metalMesh.castShadow = shade;
    group.add(metalMesh);
  }

  /* A kit's side force generators: a black plate on each tip rib, a hand
   * of chord fore and aft and a few centimetres above and below, inside
   * the rounded tips so the span does not grow. */
  if (kit.wingtips === 'sfg') {
    const plates = [-1, 1].map((sign) => {
      const x = sign * (RIB + 0.004);
      const le = wingAt(x)(0.06, 1);
      const te = wingAt(x)(0.94, 1);
      return plateGeometry([
        [x, WING_Y + 0.085, le.z + 0.015],
        [x, WING_Y + 0.085, te.z - 0.030],
        [x, WING_Y - 0.085, te.z - 0.030],
        [x, WING_Y - 0.085, le.z + 0.015],
      ], [sign, 0, 0], 0.006);
    });
    const sfg = new THREE.Mesh(merged(plates), black);
    sfg.name = 'slick-sfg';
    sfg.castShadow = shade;
    group.add(sfg);
  }

  /* The canopy, one draw. */
  {
    const glassMesh = new THREE.Mesh(canopyGeometry(lite), glass);
    glassMesh.name = 'slick-glass';
    group.add(glassMesh);
  }

  /* The four moving surfaces. */
  const n = lite ? 4 : 5;
  const leftAil = aileron(-1, wingFlap, shade, lite);
  const rightAil = aileron(1, wingFlap, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, st(STAB_HINGE_S));
  const elevator = hinged(elevatorGeometry(n), eh(-STAB_HALF), eh(STAB_HALF), tailFlap, shade);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_S)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_S)),
    tailFlap, shade);

  /* The tailwheel on its own vertical pivot under the rudder, turning with
   * it, as its tiller in the rudder's keeper turns it. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, RUDDER_BOTTOM - 0.006, st(TAIL_PIVOT_S));
    const trail = TAIL_WHEEL_S - TAIL_PIVOT_S;
    const dropY = TAIL_WHEEL_Y - (RUDDER_BOTTOM - 0.006);
    const forkParts = [
      rod(new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(0, dropY + 0.002, trail), 0.0028, lite ? 4 : 6),
      new THREE.CylinderGeometry(0.006, 0.006, 0.016, lite ? 6 : 10).rotateZ(Math.PI / 2).translate(0, dropY, trail),
    ];
    const fork = new THREE.Mesh(merged(forkParts), metal);
    fork.castShadow = shade;
    pivot.add(fork);
    const tyreGeo = new THREE.TorusGeometry(TAIL_WHEEL_R - 0.006, 0.006, 5, 12);
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

  /* The camera on the hatch ahead of the canopy. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, SLICK_MOUNT_UP, -SLICK_MOUNT_FORWARD);
  cameraMount.name = 'slick-camera-mount';
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

  /* The video antenna, a whip on the turtle deck behind the canopy. NAMED,
   * because it is wire and not aircraft: scripts/craft-check.js leaves it
   * out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.090, lite ? 5 : 8), antenna);
    const s = 1.300;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.040, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /* The engine's crankcase behind the spinner, the spinner, and the carbon
   * prop, on cubcraft.js's mount, on the thrust line. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.016, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, THRUST_Y, st(PROP_S + 0.014));
    group.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(0, THRUST_Y, st(PROP_S));
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
    bladeGeo.rotateZ((12 * Math.PI) / 180);
    const bladeMesh = new THREE.Mesh(mergeGeometries([bladeGeo, bladeGeo.clone().rotateY(Math.PI)], false), carbon);
    bladeMesh.castShadow = shade;
    rotor.add(bladeMesh);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({
        color: 0x30343a,
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

  /* The blur: the prop at speed reads as a disc, at rest as two blades,
   * its density following the engine's rate, omega rad/s off the plant
   * (stateCurr[14]). Full is the DA-120's 6,550 rpm on the 28 x 10, 686
   * rad/s; its idle, 1,300 rpm, shows a faint disc. */
  const DISC_FULL = 686;
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
   * arrangement: the wingtips' blind nuts (the kit's "pre-installed blind
   * nuts in wingtips for night lights"), the cowl and the turtle deck ahead
   * of the fin. */
  const tipTop = (x) => wingAt(x)(0.4, 1);
  const lampAt = [
    { p: tipTop(-1.26), front: true },
    { p: tipTop(1.26), front: false },
    { p: fusePoint(0.250, 0), front: true },
    { p: fusePoint(1.900, 0), front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.020), ledMat);
    led.position.copy(at.p);
    led.position.y += 0.002;
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
    propSpin: SLICK_PROP_SPIN,
    setSurfaces,
    setProp,
    livery: coat.livery,
  };
}
