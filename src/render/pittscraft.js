/*
 * pittscraft.js: the Pitts S-1S's model, and nothing else.
 *
 * Its own file for cubcraft.js's reason: a biplane is not a monoplane. It
 * is a short round nosed fuselage under a top wing swept back a little on
 * a low cabane, a straight bottom wing through the fuselage's belly with
 * a little dihedral, the two joined out at the ailerons by an I strut each
 * side and braced by flying and landing wires; four ailerons, the top
 * pair driven off the bottom by a link strut; a rounded stabiliser and
 * the Pitts's big round rudder; wire gear in teardrop pants and a
 * tailwheel on a wire off the rudder. An 11 x 7 turns ahead of the cowl.
 *
 * The subject is E-flite's Pitts S-1S 850mm, EFL35500, in E-flite's
 * scheme: red, the top wing's top a white sunburst from the cockpit, white
 * bars across the bottom wing's underside, white pinstripes down the
 * fuselage. E-flite publishes the span, 850 mm, the length, 787 mm, the
 * wing, 28.2 dm2, and the CG, 70 mm behind the top wing's leading edge;
 * the rest is taken off E-flite's dimensioned top view (EFL35500_A73,
 * 0.6348 mm a pixel on the span), its bottom, side and front photographs,
 * docs/PITTS-STAGE1.md and scripts/pitts-derive.js:
 *
 *   top wing        0.850 m, 0.200 m of chord swept back 7.1 deg, the tips
 *                   rounded from 0.34 m out, a cut out over the cockpit;
 *                   0.090 m over the thrust line, flat
 *   bottom wing     0.845 m, 0.175 m of chord, square, rounded tips, 3 deg
 *                   of dihedral, 0.060 m under the thrust line at the root;
 *                   its leading edge 0.048 m behind the top one's
 *   ailerons        all four, 0.131 to 0.378 m out, 48 mm of chord
 *   tail            a rounded 0.326 m stabiliser, the elevator 41 percent;
 *                   the fin and round rudder 0.105 m over the thrust line
 *                   and 0.066 under it, the rudder's hinge 0.066 m ahead of
 *                   its trailing edge
 *   gear            a 0.21 m track, 49 mm wheels in pants on wire legs, the
 *                   axles 0.070 m ahead of the CG and 0.209 m under it
 *   tailwheel       24 mm, 0.493 m behind the CG on a wire off the rudder
 *   prop            11 x 7 two blade tractor, clockwise seen from behind,
 *                   0.200 m ahead of the CG
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 70 mm behind the top wing's
 * leading edge at the root, on the thrust line. Every station below is
 * measured aft from the spinner's tip and turned into the craft frame's z
 * by st().
 *
 * The contract with the shell is cubcraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians.
 * Ailerons and elevator are positive trailing edge up; the rudder is
 * positive trailing edge to the LEFT, and the tailwheel turns with it.
 * Each side's two ailerons move together, as their link strut makes them.
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

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial, outlineHull } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { paintRegions } from './livery.js';

/*
 * The aircraft, in metres, in the Three.js craft frame: x right, y up, z
 * aft, origin at the CG. Stations are metres aft of the spinner's tip.
 */
const CG_S = 0.246;
const PROP_S = CG_S - 0.1997;
const st = (s) => s - CG_S;

/* The two wings: each a planform along its half span, its leading edge's
 * station, its chord and its height at a span station. */
const TOP = {
  half: 0.425,
  chord: 0.200,
  rootLE: CG_S - 0.070,
  sweep: Math.tan((7.1 * Math.PI) / 180),
  round0: 0.340,
  y: 0.090,
  dihedral: 0,
  thick: 0.11,
};
const BOTTOM = {
  half: 0.4225,
  chord: 0.175,
  rootLE: CG_S - 0.070 + 0.048,
  sweep: 0,
  round0: 0.345,
  y: -0.060,
  dihedral: Math.tan((3 * Math.PI) / 180),
  thick: 0.11,
};
const AIL_IN = 0.131;
const AIL_OUT = 0.378;
const AIL_C = 0.048;
/* The I struts' span station, off the front photograph. */
const STRUT_X = 0.292;

/* A wing's chord, leading edge station and height at span station ax,
 * its tip an ellipse's quarter from round0 out. */
function plan(w, ax) {
  const a = Math.min(ax, w.half);
  let c = w.chord;
  if (a > w.round0) {
    const u = (a - w.round0) / (w.half - w.round0);
    c = w.chord * Math.sqrt(Math.max(0, 1 - u * u));
  }
  const mid = w.rootLE + w.sweep * a + w.chord / 2;
  return { c, le: mid - c / 2, y: w.y + w.dihedral * a };
}
function hingeF(w, ax) {
  const { c } = plan(w, ax);
  return Math.max(0.5, (c - AIL_C) / c);
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

/* A wing's symmetric section at span station x; `lift` raises it off the
 * surface, for the paint over it. */
function wingAt(w, x) {
  const { c, le, y } = plan(w, Math.abs(x));
  return (t, side, lift = 0) => new THREE.Vector3(x, y + side * (c * naca(t, w.thick) + lift), st(le) + t * c);
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
 * A wing, tip to tip in one loft, cut at the ailerons' hinge line from
 * AIL_IN to AIL_OUT: the step from a full section to a cut one at the same
 * station is the cut out's side wall. The top wing's cut out over the
 * cockpit is drawn by the sunburst's centre, not cut.
 */
function wingGeometry(w, lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const tip = lite ? [w.half - 0.030, w.half - 0.004] : [w.half - 0.050, w.half - 0.025, w.half - 0.010, w.half - 0.003];
  const mids = lite ? [0.25] : [0.20, 0.25, 0.30];
  const half = [
    [0, 1],
    [AIL_IN - eps, 1],
    ...[AIL_IN + eps, ...mids, AIL_OUT - eps].map((x) => [x, hingeF(w, x)]),
    [AIL_OUT + eps, 1],
    ...[w.round0, ...tip].filter((x) => x > AIL_OUT + eps).map((x) => [x, 1]),
  ];
  const stations = [
    ...half.slice(1).reverse().map(([x, f]) => [-x, f]),
    ...half,
  ];
  return loft(stations.map(([x, f]) => section(wingAt(w, x), 0, f, n)));
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

function aileron(w, sign, material, shade, lite) {
  const n = lite ? 4 : 6;
  const xs = [AIL_IN + 0.002, 0.25, AIL_OUT - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  const geo = loft(xs.map((x) => section(wingAt(w, x), hingeF(w, Math.abs(x)), 1, n)));
  const hingePoint = (x) => wingAt(w, x)(hingeF(w, Math.abs(x)), 1).add(wingAt(w, x)(hingeF(w, Math.abs(x)), -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

/*
 * The tail, off the top and side views. The stabiliser's planform is the
 * Pitts's rounded one: its leading edge an ellipse's quarter back to the
 * tip, its hinge line square across.
 */
const STAB_HALF = 0.163;
const STAB_ROOT_LE_S = 0.580;
const STAB_HINGE_S = 0.679;
const STAB_ROOT_TE_S = 0.748;
const STAB_Y = -0.010;
const STAB_T = 0.08;
function stabPlan(ax) {
  const u = Math.min(1, ax / STAB_HALF);
  const le = STAB_HINGE_S - (STAB_HINGE_S - STAB_ROOT_LE_S) * Math.sqrt(Math.max(0, 1 - u ** 2.2));
  const te = STAB_HINGE_S + (STAB_ROOT_TE_S - STAB_HINGE_S) * Math.sqrt(Math.max(0, 1 - u ** 3));
  return { le: st(Math.min(le, STAB_HINGE_S - 0.012)), hinge: st(STAB_HINGE_S), te: st(Math.max(te, STAB_HINGE_S + 0.010)) };
}
function stabAt(x, le, c) {
  return (t, side, lift = 0) => new THREE.Vector3(x, STAB_Y + side * (c * naca(t, STAB_T) + lift), le + t * c);
}
function stabGeometry(n) {
  const xs = [-STAB_HALF + 0.002, -0.14, -0.10, -0.05, 0, 0.05, 0.10, 0.14, STAB_HALF - 0.002];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
/* The elevator, both halves in one piece across a notch for the rudder. */
function elevatorGeometry(n) {
  const halfOf = (sign) => {
    const xs = [0.014, 0.07, 0.12, STAB_HALF - 0.004].map((x) => sign * x);
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

/* The fin and the big round rudder, their outline by height y. */
const TAIL_TOP = 0.105;
const RUDDER_BOTTOM = -0.066;
const RUDDER_S = 0.721;
const RUDDER_TE_S = 0.787;
const FIN_T = 0.08;
function finAt(y, le, c) {
  return (t, side) => new THREE.Vector3(side * c * naca(t, FIN_T), y, le + t * c);
}
function finLE(y) {
  const y0 = 0.035;
  const u = Math.min(1, Math.max(0, (y - y0) / (TAIL_TOP - y0)));
  /* A curved leading edge rising from a long fillet on the turtle deck. */
  return 0.600 + (0.700 - 0.600) * Math.sqrt(u);
}
function rudderTE(y) {
  /* The round rudder: widest at mid height, rounded over the top and down
   * to its foot. */
  const yc = (TAIL_TOP + RUDDER_BOTTOM) / 2;
  const h = (TAIL_TOP - RUDDER_BOTTOM) / 2;
  const u = Math.min(1, Math.abs(y - yc) / h);
  return RUDDER_S + (RUDDER_TE_S - RUDDER_S) * Math.sqrt(Math.max(0.04, 1 - u * u));
}
function finGeometry(n) {
  const ys = [0.030, 0.050, 0.070, 0.090, TAIL_TOP - 0.004];
  return loft(ys.map((y) => {
    const le = finLE(y);
    return section(finAt(y, st(le), RUDDER_S - le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUDDER_BOTTOM + 0.004, -0.050, -0.025, 0.0, 0.030, 0.060, 0.085, TAIL_TOP - 0.004];
  return loft(ys.map((y) => section(finAt(y, st(RUDDER_S), rudderTE(y) - RUDDER_S), 0, 1, n)));
}

/*
 * The fuselage, as rounded box sections along the stations: half width,
 * top, bottom and squareness. The side photograph puts the thrust line
 * high on it: the cowl's top and the turtle deck 35 to 40 mm over it, the
 * belly 0.11 m under it at the wing. The big round cowl behind the
 * spinner, slab sides, the turtle deck tapering to the rudder post.
 */
const FUSE = [
  [0.036, 0.038, 0.022, -0.052, 2.0],
  [0.050, 0.046, 0.028, -0.062, 2.0],
  [0.080, 0.056, 0.034, -0.080, 2.2],
  [0.140, 0.060, 0.036, -0.096, 2.5],
  [0.220, 0.056, 0.036, -0.110, 2.8],
  [0.330, 0.050, 0.040, -0.110, 3.0],
  [0.450, 0.040, 0.042, -0.094, 3.0],
  [0.600, 0.026, 0.035, -0.068, 2.8],
  [RUDDER_S, 0.010, 0.030, -0.045, 2.4],
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
  throw new Error(`pittscraft: station ${s} is off the fuselage`);
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
    ? [0.036, 0.050, 0.080, 0.140, 0.220, 0.330, 0.450, 0.600, RUDDER_S]
    : [0.036, 0.042, 0.050, 0.065, 0.080, 0.110, 0.140, 0.180, 0.220, 0.275, 0.330, 0.390, 0.450, 0.525, 0.600,
      0.660, RUDDER_S];
  return loft(ss.map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/* The canopy, a small bubble behind the top wing's cut out, the pilot in
 * it. */
const CANOPY_S0 = 0.330;
const CANOPY_S1 = 0.440;
function canopyGeometry(lite) {
  const len = CANOPY_S1 - CANOPY_S0;
  const g = new THREE.SphereGeometry(1, lite ? 12 : 20, lite ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(0.038, 0.042, len / 2);
  const mid = (CANOPY_S0 + CANOPY_S1) / 2;
  g.translate(0, fuseAt(mid).yc + fuseAt(mid).h - 0.006, st(mid));
  return g;
}

/* A panel a hair over (side 1) or under (-1) a surface given as at(x, f),
 * a quad from (x0, f0) to (x1, f1) in its span and chord, subdivided along
 * the chord so it follows the section. */
function surfacePanel(at, quad, side, lift = 0.0012, steps = 6) {
  const pos = [];
  const idx = [];
  const [[xa, fa], [xb, fb], [xc, fc], [xd, fd]] = quad;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const p = at(xa + (xd - xa) * u, fa + (fd - fa) * u, side, lift);
    const q = at(xb + (xc - xb) * u, fb + (fc - fb) * u, side, lift);
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (Math.sign(geo.getAttribute('normal').getY(0)) !== side) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    geo.setIndex(idx);
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

/* An 11 x 7 composite blade, APC's shape. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0050, 0.010);
  s.bezierCurveTo(0.0200, -0.018, 0.0170, -r * 0.55, 0.0070, -r * 0.97);
  s.lineTo(-0.0050, -r * 0.95);
  s.bezierCurveTo(-0.0150, -r * 0.45, -0.0100, -0.010, -0.0035, 0.010);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0030, bevelEnabled: false, curveSegments: segments });
}

function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('pittscraft: merge failed');
  }
  return geo;
}

const PROP_R = 0.1397;
const SPINNER_R = 0.023;
const SPINNER_BASE_S = 0.058;

/* The gear, as scripts/pitts-derive.js reads it off the side view. */
const MAIN_X = 0.105;
const MAIN_S = CG_S - 0.0700;
const MAIN_Y = -0.2093;
const MAIN_R = 0.0243;
const MAIN_W = 0.016;
const TAIL_PIVOT_S = CG_S + 0.482;
const TAIL_WHEEL_S = CG_S + 0.4926;
const TAIL_WHEEL_Y = -0.0991;
const TAIL_WHEEL_R = 0.012;

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
 * the rudder's trailing edge's, 0.541 m aft against the tips' 0.425 out,
 * vHalfUp the prop's tip standing straight up, over the fin's 0.105 and
 * the top wing's 0.101, vHalfDown the main tyres' bottoms.
 */
const UP = Math.max(PROP_R, TAIL_TOP, TOP.y + TOP.chord * naca(0.3, TOP.thick));
const DOWN = -(MAIN_Y - MAIN_R);
export const PITTS_DIMS = {
  span: 2 * TOP.half,
  bottomSpan: 2 * BOTTOM.half,
  topChord: TOP.chord,
  bottomChord: BOTTOM.chord,
  gap: TOP.y - BOTTOM.y,
  stagger: BOTTOM.rootLE - TOP.rootLE,
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
    bodyWidth: 2 * TOP.half,
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera mount: the FPV camera on the top wing's centre section over
 * the cowl, where the plant's camera is (src/native/plant.c), 60 mm ahead
 * of the CG and 115 mm over it: from the cockpit the top wing is the
 * whole view ahead.
 */
const CAM_S = CG_S - 0.060;
export const PITTS_MOUNT_FORWARD = -st(CAM_S);
export const PITTS_MOUNT_UP = 0.115;

/* A tractor turning clockwise seen from behind, as cubcraft.js's. */
export const PITTS_PROP_SPIN = [1, 0, 0, 0];

export function buildPittsCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'pitts-craft';
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

  /* The scheme's colours by region (src/render/livery.js): the red of the
   * wings, the fuselage and the tail, the white of the sunburst, the bars
   * and the stripes, the black trim; the surfaces a shade of their
   * region. */
  const coat = paintRegions();
  const wingMat = coat.base('wing', cel({ color: 0xd42a22, rim: 0.28, spec: 0.32, specWidth: 0.014 }));
  const fuseMat = coat.base('fuselage', cel({ color: 0xd42a22, rim: 0.28, spec: 0.36, specWidth: 0.016 }));
  const tailMat = coat.base('tail', cel({ color: 0xd42a22, rim: 0.28, spec: 0.32, specWidth: 0.014 }));
  const raysMat = coat.base('rays', cel({ color: 0xf2f0ec, rim: 0.28, spec: 0.30, specWidth: 0.014 }));
  const trimMat = coat.base('trim', cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 }));
  const wingFlap = coat.shade('wing', cel({ color: 0xbc241d, rim: 0.28, spec: 0.28, specWidth: 0.014 }));
  const tailFlap = coat.shade('tail', cel({ color: 0xbc241d, rim: 0.28, spec: 0.28, specWidth: 0.014 }));
  const black = cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 });
  const metal = cel({ color: 0xb4b0a6, rim: 0.30, spec: 0.70, specWidth: 0.022 });
  const wire = cel({ color: 0x5a5e62, rim: 0.30, spec: 0.60, specWidth: 0.020 });
  const glass = cel({ color: 0x2f4658, rim: 0.40, spec: 0.55, specWidth: 0.020, specColor: 0xf3ead4 });
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
  const propMat = cel({ color: 0x1c1e20, rim: 0.26, spec: 0.40, specWidth: 0.016 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = PITTS_DIMS;
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
    fuse.name = 'pitts-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.018, ink);
    group.add(fuse);
  }

  /* The two wings, one draw, and the tail feathers, one draw. The top
   * wing's pants and the gear legs are the fuselage's red. */
  {
    const n = lite ? 5 : 7;
    const wings = new THREE.Mesh(merged([wingGeometry(TOP, lite), wingGeometry(BOTTOM, lite)]), wingMat);
    wings.name = 'pitts-wings';
    wings.castShadow = shade;
    hull(wings, 1.006, ink);
    group.add(wings);
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n)]), tailMat);
    tail.name = 'pitts-tail';
    tail.castShadow = shade;
    group.add(tail);
    /* The pants, teardrops around the wheels, in the fuselage's red. */
    const parts = [];
    for (const sign of [-1, 1]) {
      const pant = new THREE.SphereGeometry(1, lite ? 10 : 16, lite ? 6 : 10);
      pant.scale(0.020, 0.030, 0.070);
      pant.translate(sign * MAIN_X, MAIN_Y + 0.008, st(MAIN_S) + 0.012);
      parts.push(pant);
    }
    const pants = new THREE.Mesh(merged(parts), fuseMat);
    pants.name = 'pitts-pants';
    pants.castShadow = shade;
    group.add(pants);
  }

  /*
   * The white, one draw: the sunburst over the top wing's top from the cut
   * out, the rays over the stabiliser, the bars under the bottom wing and
   * the pinstripes down each side of the fuselage.
   */
  {
    const parts = [];
    const topAt = (x, f, side, lift) => wingAt(TOP, x)(Math.min(0.995, Math.max(0.005, f)), side, lift);
    /* Rays from the cut out's middle, alternate wedges white, out to the
     * leading edge and round the tips. The ray ends: the leading edge at
     * span stations, then the tip's own stations down its trailing edge. */
    const ends = [];
    for (const x of [0.02, 0.08, 0.14, 0.20, 0.26, 0.31, 0.36, 0.40]) {
      ends.push([x, 0.02]);
    }
    for (const f of [0.30, 0.62, 0.95]) {
      ends.push([TOP.half - 0.012, f]);
    }
    ends.push([0.36, 0.98]);
    for (const sign of [-1, 1]) {
      for (let i = 0; i + 1 < ends.length; i += 2) {
        const a = ends[i];
        const b = ends[i + 1];
        const o = [sign * 0.004, 0.97];
        parts.push(surfacePanel(topAt, [o, o, [sign * b[0], b[1]], [sign * a[0], a[1]]], 1, 0.0014, 8));
      }
    }
    /* The bottom wing's top wears the same rays, from its root's trailing
     * edge out, where they show between the wings. */
    const botAt = (x, f, side, lift) => wingAt(BOTTOM, x)(Math.min(0.995, Math.max(0.005, f)), side, lift);
    for (const sign of [-1, 1]) {
      for (let i = 0; i + 1 < ends.length; i += 2) {
        const a = ends[i];
        const b = ends[i + 1];
        const o = [sign * 0.07, 0.97];
        const cl = (e) => [sign * Math.min(e[0], BOTTOM.half - 0.012), e[1]];
        if (a[0] < 0.07 && b[0] < 0.07) {
          continue;
        }
        parts.push(surfacePanel(botAt, [o, o, cl(b), cl(a)], 1, 0.0014, 8));
      }
      /* The bars under the bottom wing, chordwise, four a side. */
      for (const [x0, x1] of [[0.07, 0.115], [0.16, 0.205], [0.25, 0.295], [0.34, 0.385]]) {
        parts.push(surfacePanel(botAt, [[sign * x0, 0.03], [sign * x1, 0.03], [sign * x1, 0.97], [sign * x0, 0.97]], -1, 0.0014, 6));
      }
    }
    /* The stabiliser's rays, from the hinge line's middle. */
    const stabTop = (x, f, side, lift) => {
      const p = stabPlan(Math.abs(x));
      return stabAt(x, p.le, p.hinge - p.le)(Math.min(0.995, Math.max(0.005, f)), side, lift);
    };
    for (const sign of [-1, 1]) {
      for (const [x0, x1] of [[0.03, 0.07], [0.10, 0.14]]) {
        parts.push(surfacePanel(stabTop, [[sign * 0.012, 0.96], [sign * 0.012, 0.96], [sign * x1, 0.05], [sign * x0, 0.05]], 1, 0.0012, 6));
      }
    }
    /* The pinstripes: two thin bands down each side from the cowl to the
     * tail, rising aft a little, as the photographs have them. */
    for (const sign of [-1, 1]) {
      for (const a0 of [1.55, 1.72]) {
        const pos = [];
        const idx = [];
        const ss = [0.090, 0.180, 0.300, 0.420, 0.540, 0.660];
        ss.forEach((s, i) => {
          const a = sign * (a0 - 0.25 * (s - 0.09));
          const u = fusePoint(s, a - 0.035 * sign, 0.0012);
          const d = fusePoint(s, a + 0.035 * sign, 0.0012);
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
      }
    }
    const rays = new THREE.Mesh(merged(parts), raysMat);
    rays.name = 'pitts-rays';
    group.add(rays);
  }

  /*
   * The struts and the wires. The cabane: two legs a side from the
   * fuselage's top longerons to the top wing's underside at its spars. The
   * I struts, flat, between the wings' mid chords at STRUT_X. The flying
   * wires from the bottom wing's root to the I strut's top, the landing
   * wires from the top wing's root to its foot, crossing between. The
   * aileron link strut beside each I strut.
   */
  {
    const strutParts = [];
    const wireParts = [];
    const under = (w, x, f) => wingAt(w, x)(f, -1);
    const over = (w, x, f) => wingAt(w, x)(f, 1);
    for (const sign of [-1, 1]) {
      for (const f of [0.18, 0.62]) {
        const s = plan(TOP, 0.06).le + f * TOP.chord;
        const foot = new THREE.Vector3(sign * 0.040, fuseAt(s).yc + fuseAt(s).h - 0.006, st(s));
        const head = under(TOP, sign * 0.060, f);
        strutParts.push(rod(foot, head, 0.0035, rodSeg, 2.0));
      }
      const top = under(TOP, sign * STRUT_X, 0.5);
      const foot = over(BOTTOM, sign * STRUT_X, 0.5);
      /* The I strut, a flat blade 40 mm across the flow. */
      const blade = new THREE.BoxGeometry(0.006, top.y - foot.y + 0.004, 0.040);
      blade.translate(sign * STRUT_X, (top.y + foot.y) / 2, (top.z + foot.z) / 2);
      strutParts.push(blade);
      /* The aileron link strut, a thin rod from the bottom aileron's horn
       * up to the top one's, outboard of the I strut. */
      const lx = sign * (STRUT_X + 0.030);
      strutParts.push(rod(over(BOTTOM, lx, hingeF(BOTTOM, Math.abs(lx)) + 0.02), under(TOP, lx, hingeF(TOP, Math.abs(lx)) + 0.02), 0.0016, rodSeg));
      /* The wires, doubled front and back. */
      for (const f of [0.25, 0.70]) {
        const rootLow = new THREE.Vector3(sign * 0.045, BOTTOM.y + 0.004, plan(BOTTOM, 0.045).le + f * BOTTOM.chord - CG_S);
        const rootHigh = under(TOP, sign * 0.045, f);
        wireParts.push(rod(rootLow, under(TOP, sign * (STRUT_X - 0.012), f), 0.0007, lite ? 3 : 4));
        wireParts.push(rod(rootHigh, over(BOTTOM, sign * (STRUT_X - 0.012), f), 0.0007, lite ? 3 : 4));
      }
    }
    const struts = new THREE.Mesh(merged(strutParts), fuseMat);
    struts.name = 'pitts-struts';
    struts.castShadow = shade;
    group.add(struts);
    /* NAMED, because it is wire and not aircraft: scripts/craft-check.js
     * leaves wires out of the machine's size. */
    const wires = new THREE.Mesh(merged(wireParts), wire);
    wires.name = 'wires';
    group.add(wires);
  }

  /* Black trim, one draw: the tyres. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const tyre = new THREE.TorusGeometry(MAIN_R - 0.008, 0.008, 6, lite ? 16 : 20);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(tyre);
    }
    const trim = new THREE.Mesh(merged(parts), trimMat);
    trim.name = 'pitts-trim';
    trim.castShadow = shade;
    group.add(trim);
  }

  /* The metal: the wire gear legs, the axles and the tailwheel's wire. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const hub = new THREE.CylinderGeometry(0.008, 0.008, MAIN_W + 0.002, seg);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(hub);
      /* The wire gear, a V a side from the belly to the pant. */
      const axle = new THREE.Vector3(sign * (MAIN_X - 0.012), MAIN_Y + 0.012, st(MAIN_S));
      for (const ds of [-0.030, 0.035]) {
        const s = MAIN_S + ds;
        const root = new THREE.Vector3(sign * 0.030, fuseAt(s).yc - fuseAt(s).h + 0.004, st(s));
        parts.push(rod(root, axle, 0.0022, rodSeg));
      }
    }
    parts.push(rod(new THREE.Vector3(0, fuseAt(0.700).yc - fuseAt(0.700).h + 0.002, st(0.700)),
      new THREE.Vector3(0, RUDDER_BOTTOM - 0.004, st(TAIL_PIVOT_S)), 0.0016, lite ? 4 : 6, 0.4));
    const metalMesh = new THREE.Mesh(merged(parts), metal);
    metalMesh.name = 'pitts-metal';
    metalMesh.castShadow = shade;
    group.add(metalMesh);
  }

  /* The canopy, one draw. */
  {
    const glassMesh = new THREE.Mesh(canopyGeometry(lite), glass);
    glassMesh.name = 'pitts-glass';
    group.add(glassMesh);
  }

  /* The moving surfaces: two ailerons a side, the elevator, the rudder. */
  const n = lite ? 4 : 5;
  const leftAil = aileron(BOTTOM, -1, wingFlap, shade, lite);
  const rightAil = aileron(BOTTOM, 1, wingFlap, shade, lite);
  const leftTop = aileron(TOP, -1, wingFlap, shade, lite);
  const rightTop = aileron(TOP, 1, wingFlap, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, stabPlan(Math.abs(x)).hinge);
  const elevator = hinged(elevatorGeometry(n), eh(-STAB_HALF), eh(STAB_HALF), tailFlap, shade);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_S)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_S)),
    tailFlap, shade);

  /* The tailwheel on its own vertical pivot under the rudder, turning with
   * it, as its wire on the rudder turns it. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, RUDDER_BOTTOM - 0.004, st(TAIL_PIVOT_S));
    const trail = TAIL_WHEEL_S - TAIL_PIVOT_S;
    const dropY = TAIL_WHEEL_Y - (RUDDER_BOTTOM - 0.004);
    const forkParts = [
      rod(new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(0, dropY + 0.002, trail), 0.0015, lite ? 4 : 6),
      new THREE.CylinderGeometry(0.0035, 0.0035, 0.008, lite ? 6 : 10).rotateZ(Math.PI / 2).translate(0, dropY, trail),
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
    'aileron-left-top': leftTop,
    'aileron-right-top': rightTop,
    elevator,
    rudder,
    tailwheel,
  };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  /* The camera on the top wing's centre section. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, PITTS_MOUNT_UP, -PITTS_MOUNT_FORWARD);
  cameraMount.name = 'pitts-camera-mount';
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

  /* The video antenna, a whip on the turtle deck. NAMED, because it is
   * wire and not aircraft: scripts/craft-check.js leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.070, lite ? 5 : 8), antenna);
    const s = CG_S + 0.280;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.032, st(s) + 0.010);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /* The motor behind the spinner, the spinner, and the prop, on
   * cubcraft.js's mount. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.012, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, 0, st(0.062));
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
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 10 : 14), fuseMat);
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
        color: 0x40444a,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        fog,
      }),
    );
    disc.renderOrder = 1;
    propMount.add(disc);
    discs.push(disc);
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
   * arrangement: the top wing's tips, the cowl and the turtle deck ahead
   * of the fin. */
  const tipTop = (x) => wingAt(TOP, x)(0.4, 1);
  const lampAt = [
    { p: tipTop(-0.40), front: true },
    { p: tipTop(0.40), front: false },
    { p: fusePoint(0.080, 0), front: true },
    { p: fusePoint(0.600, 0), front: false },
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

  /* Pose the surfaces, cubcraft.js's signs; each side's two ailerons
   * together. */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    leftTop.pivot.quaternion.copy(q.setFromAxisAngle(leftTop.axis, -leftRad));
    rightTop.pivot.quaternion.copy(q.setFromAxisAngle(rightTop.axis, -rightRad));
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
    propSpin: PITTS_PROP_SPIN,
    setSurfaces,
    livery: coat.livery,
  };
}
