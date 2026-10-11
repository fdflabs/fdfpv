/*
 * nighttimbercraft.js: the Night Timber X's model, and nothing else.
 *
 * Built on timbercraft.js's lofts, since the Timber X is a Timber: a boxy
 * foam fuselage under a constant chord high wing, flaps inboard and
 * ailerons outboard, fat foam tundra tyres on sprung legs, a small
 * tailwheel under the rudder. What differs is drawn here: the shorter,
 * squarer wing with its slat pockets and no slats (they ship in the box),
 * plain flaps hinged on the wing's own line, the low stabiliser on the
 * tail cone, the big rudder hanging below it, a two blade 13 x 4 behind a
 * black spinner, and E-flite's white, orange red, black and grey scheme.
 *
 * The subject is E-flite's Night Timber X 1.2m (EFL13850, EFL13875),
 * docs/NIGHTTIMBER-STAGE1.md: E-flite publishes the span, 1200 mm, the
 * length, 1055 mm, the CG, 89 mm behind the root's leading edge with the
 * carbon joiner, and the throws; the rest is measured off E-flite's own
 * photographs, the dimensioned top view (EFL13875_A73, 0.8236 mm a
 * pixel) and the side view (A02), as scripts/nighttimber-derive.js takes
 * them:
 *
 *   span            1.200 m, flat, the tips rounded in plan
 *   wing            a constant 0.239 m chord, its leading edge 0.250 m
 *                   behind the spinner's tip, its chord line 65 mm over
 *                   the thrust line on the cabin's roof
 *   flaps           plain, from 0.093 to 0.319 m out, the aft 38 percent;
 *                   in the manual's 3D setup they also move as ailerons
 *   ailerons        from 0.319 to 0.563 m out, the aft 38 percent
 *   tail            a 0.495 m stabiliser 0.113 m under the thrust line,
 *                   its elevator the aft 52 percent; a fin and rudder
 *                   from 147 mm under the thrust line to 80 mm over it,
 *                   the rudder 99 mm of its chord
 *   gear            a 0.285 m track on 113 mm tundra tyres, a 29 mm
 *                   tailwheel steered by the rudder
 *   prop            13 x 4 two blade tractor, a 0.330 m disc, clockwise
 *                   seen from the cockpit
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY, at the height of the thrust line.
 * Stations below are metres aft of the spinner's tip and turn into the
 * craft frame's z through st(); heights are metres above the thrust line.
 * NIGHTTIMBER_DIMS carries the wheels and the attitude they make, which
 * is the plant's settled pose (nighttimber:gates N13).
 *
 * The contract with the shell is timbercraft.js's: group, discs, blades,
 * leds, cameraMount, stator, propSpin, setSurfaces(leftAileron,
 * rightAileron, elevator, rudder) and setFlaps(rad). The flaps take the
 * ailerons' angle on top of their own, the full span ailerons the plant
 * flies (FW_NIGHTTIMBER1200).
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
import { spinnerFor } from './kitshapes.js';
import { navLevel } from './kitlights.js';
import { factoryLit } from './worldlight.js';

/*
 * The aircraft, in metres, in the Three.js craft frame: x right, y up, z
 * aft, origin at the CG. Stations are metres aft of the spinner's tip.
 */
const LE_S = 0.250;
const CHORD = 0.239;
const CG_S = LE_S + 0.089;
const st = (s) => s - CG_S;

const HALF = 0.600;
/* No droop: a flat wing, its tips rounded in plan. */
const DROOP_IN = HALF;
const DROOP = 0;
const WING_Y = 0.065;
const INCIDENCE = (1.5 * Math.PI) / 180;
const WING_T = 0.14;
const WING_M = 0.025;
const WING_P = 0.30;

const FLAP_IN = 0.093;
const FLAP_OUT = 0.317;
const AIL_IN = 0.321;
const AIL_OUT = 0.563;
const HINGE = 0.617;

/* The tail. */
const STAB_HALF = 0.2475;
const STAB_LE_S = 0.834;
const STAB_ROOT = 0.170;
const STAB_TIP = 0.150;
const ELEV_HINGE_S = 0.9125;
const STAB_Y = -0.113;
const STAB_T = 0.08;
const RUDDER_S = 0.956;
const RUDDER_TE_S = 1.055;
const RUDDER_BOTTOM = -0.147;
const TAIL_TOP = 0.080;
const FIN_T = 0.08;

/* The nose: the prop's plane, the spinner. */
const PROP_S = 0.031;
const PROP_R = 0.1651;
const SPINNER_R = 0.024;
const SPINNER_BASE_S = 0.052;

/* The gear, the plant's settled axles (src/native/plant.c). */
const MAIN_X = 0.1425;
const MAIN_S = 0.193;
const MAIN_Y = -0.213;
/* A kit's window tints (configs/kits.js): smoked and a gold film. */
const TINTS = { smoke: 0x3c454c, gold: 0x9a8248 };

const MAIN_R = 0.0565;
const MAIN_W = 0.045;
const TAIL_PIVOT_S = 0.950;
const TAIL_WHEEL_S = 0.969;
const TAIL_WHEEL_Y = -0.192;
const TAIL_WHEEL_R = 0.0145;

/* The flap's travel, E-flite's 30 and 55 mm at the trailing edge over its
 * 92 mm chord, for the preview and the dims; the plant has its own copy. */
const FLAP_CHORD = (1 - HINGE) * CHORD;
const FLAP_HALF = Math.asin(0.030 / FLAP_CHORD);
const FLAP_FULL = Math.asin(0.055 / FLAP_CHORD);

function chordLE(ax) {
  /* The tip rounded at its leading edge over its last 35 mm. */
  const tipIn = HALF - 0.035;
  if (ax <= tipIn) {
    return { c: CHORD, le: st(LE_S) };
  }
  const u = Math.min(0.995, (ax - tipIn) / (HALF - tipIn));
  const f = 0.55 + 0.45 * Math.sqrt(1 - u * u);
  return { c: CHORD * f, le: st(LE_S) + CHORD * (1 - f) };
}
/* The chord line's height at span station ax: flat, then the droop, which
 * steepens toward the tip as the Timber's does. */
function wingLift(ax) {
  if (ax <= DROOP_IN) {
    return WING_Y;
  }
  const u = (ax - DROOP_IN) / (HALF - DROOP_IN);
  return WING_Y - DROOP * u * u;
}

/* The NACA four digit thickness, half of it, at chord fraction t. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}
function camber(t) {
  return t < WING_P
    ? (WING_M / (WING_P * WING_P)) * (2 * WING_P * t - t * t)
    : (WING_M / ((1 - WING_P) * (1 - WING_P))) * (1 - 2 * WING_P + 2 * WING_P * t - t * t);
}

/*
 * A closed airfoil section, skycraft.js's: a loop over the top from chord
 * fraction f0 to f1 and back under, cosine spaced.
 */
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

function wingAt(x) {
  const ax = Math.abs(x);
  const { c, le } = chordLE(ax);
  const y0 = wingLift(ax);
  const slope = Math.tan(INCIDENCE);
  return (t, side) => new THREE.Vector3(
    x,
    y0 + c * (camber(t) + side * naca(t, WING_T)) - t * c * slope,
    le + t * c,
  );
}

/* A symmetric tail section in the (y, z) plane at span station x. */
function stabAt(x, le, c) {
  return (t, side) => new THREE.Vector3(x, STAB_Y + side * c * naca(t, STAB_T), le + t * c);
}
/* A symmetric fin section in the (x, z) plane at height y. */
function finAt(y, le, c) {
  return (t, side) => new THREE.Vector3(side * c * naca(t, FIN_T), y, le + t * c);
}

/*
 * Skin a run of closed sections into one indexed geometry, capped at both
 * ends, cubcraft.js's loft: the signed volume of the closed result decides
 * which way the triangles face.
 */
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
 * A panel of paint laid on a surface a hair proud of it: point(u, v) for u
 * and v in 0..1 gives the surface, out(p) the outward direction there. The
 * panel is stood off along the surface's own normal, and its winding is
 * checked against outward rather than reasoned about.
 */
function paint(point, nu, nv, out, lift = 0.0008) {
  const pos = [];
  const e = 1e-4;
  for (let i = 0; i <= nu; i += 1) {
    for (let j = 0; j <= nv; j += 1) {
      const u = i / nu;
      const v = j / nv;
      const p = point(u, v);
      const du = point(Math.min(1, u + e), v).sub(point(Math.max(0, u - e), v));
      const dv = point(u, Math.min(1, v + e)).sub(point(u, Math.max(0, v - e)));
      const nrm = du.cross(dv).normalize();
      if (nrm.dot(out(p)) < 0) {
        nrm.negate();
      }
      p.addScaledVector(nrm, lift);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = nv + 1;
  const idx = [];
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const v3 = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const mid = Math.floor(idx.length / 6) * 3;
  const [p0, p1, p2] = [v3(idx[mid]), v3(idx[mid + 1]), v3(idx[mid + 2])];
  const nrm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  if (nrm.dot(out(p0)) < 0) {
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

/* Paint on the wing's upper (side 1) or lower (side -1) skin, spanwise
 * from x0 to x1 and chordwise from t0 to t1. */
function wingPaint(x0, x1, t0, t1, side, nu, nv, lift = 0.0008) {
  return paint(
    (u, v) => wingAt(x0 + (x1 - x0) * u)(t0 + (t1 - t0) * v, side),
    nu, nv, () => new THREE.Vector3(0, side, 0), lift,
  );
}
/* A slash across the wing's top, leaning outboard toward the trailing
 * edge as the scheme's do: centred at span xc on the leading edge side,
 * w wide, from chord t0 to t1, moving out by lean over its length. */
function wingSlash(xc, w, t0, t1, lean, lift) {
  const sign = Math.sign(xc);
  return paint(
    (u, v) => wingAt(xc + sign * (lean * v) + (u - 0.5) * w)(t0 + (t1 - t0) * v, 1),
    1, 3, () => new THREE.Vector3(0, 1, 0), lift,
  );
}

/*
 * The wing, tip to tip in one loft, cut at the flaps' and ailerons' hinge
 * the way skycraft.js cuts it: the step from a full section to a cut one at
 * the same station is the cut out's side wall.
 */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const half = [
    [0, 1], [FLAP_IN - eps, 1], [FLAP_IN + eps, HINGE], [0.20, HINGE], [FLAP_OUT, HINGE],
    [0.45, HINGE], [AIL_OUT - eps, HINGE], [AIL_OUT + eps, 1],
  ];
  const tip = lite ? [0.575, HALF - 0.012, HALF] : [0.570, 0.580, 0.588, HALF - 0.012, HALF - 0.004, HALF];
  for (const x of tip) {
    half.push([x, 1]);
  }
  const stations = [
    ...half.slice(1).reverse().map(([x, f]) => [-x, f]),
    ...half,
  ];
  return loft(stations.map(([x, f]) => section(wingAt(x), 0, f, n)));
}

/*
 * A hinged surface, cubcraft.js's: the geometry moved so the pivot sits on
 * the hinge and turns about the hinge's own axis, pointing +x for a
 * horizontal hinge and +y for a vertical one, so a NEGATIVE turn lifts the
 * trailing edge or swings it left.
 */
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

/* The span stations of a trailing edge surface from x0 to x1 on the side
 * sign picks, ordered so the hinge axis points +x. */
function spanRun(x0, x1, n, sign) {
  const xs = [];
  for (let i = 0; i <= n; i += 1) {
    xs.push(sign * (x0 + ((x1 - x0) * i) / n));
  }
  if (sign < 0) {
    xs.reverse();
  }
  return xs;
}

function aileron(sign, material, shade, lite) {
  const xs = spanRun(AIL_IN, AIL_OUT, 2, sign);
  const geo = loft(xs.map((x) => section(wingAt(x), HINGE, 1, lite ? 4 : 6)));
  const hingePoint = (x) => wingAt(x)(HINGE, 1).add(wingAt(x)(HINGE, -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

/* A plain flap, the wing's aft 38 percent on the wing's own hinge line,
 * the aileron's way. */
function flap(sign, material, shade, lite) {
  const xs = spanRun(FLAP_IN + 0.002, FLAP_OUT - 0.002, 2, sign);
  const geo = loft(xs.map((x) => section(wingAt(x), HINGE, 1, lite ? 4 : 6)));
  const hingePoint = (x) => wingAt(x)(HINGE, 1).add(wingAt(x)(HINGE, -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

/*
 * The stabiliser's planform at |x|: a straight taper with the leading edge
 * swept and the hinge line straight, the tips rounded over their last
 * 30 mm. Inboard of 20 mm the elevator is cut forward to 40 mm behind its
 * hinge, which is the notch the rudder swings in.
 */
function stabPlan(ax) {
  const u = Math.min(1, ax / STAB_HALF);
  const c = STAB_ROOT + (STAB_TIP - STAB_ROOT) * u;
  const te0 = STAB_LE_S + STAB_ROOT;
  const te = te0 - 0.004 * u;
  let le = te - c;
  const tipIn = STAB_HALF - 0.030;
  let teNow = te;
  if (ax > tipIn) {
    const w = Math.min(0.995, (ax - tipIn) / (STAB_HALF - tipIn));
    const f = Math.sqrt(1 - w * w);
    le = ELEV_HINGE_S - (ELEV_HINGE_S - le) * f;
    teNow = ELEV_HINGE_S + (te - ELEV_HINGE_S) * f;
  }
  const notch = Math.min(1, Math.max(0, (ax - 0.012) / 0.012));
  teNow = Math.min(teNow, ELEV_HINGE_S + 0.040 + (teNow - ELEV_HINGE_S - 0.040) * notch);
  return { le: st(le), hinge: st(ELEV_HINGE_S), te: st(teNow) };
}

function stabGeometry(n) {
  const xs = [-STAB_HALF, -0.236, -0.218, -0.12, 0, 0.12, 0.218, 0.236, STAB_HALF];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}

/* One elevator half, from the notch out; sign picks the side. */
function elevatorHalf(sign, n) {
  const xs = [0.012, 0.018, 0.024, 0.12, 0.218, 0.236, STAB_HALF - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.hinge, p.te - p.hinge), 0, 1, n);
  }));
}

/*
 * The fin and rudder's outline at height y: the fin's leading edge swept
 * from the turtledeck up to the top, the top edge level and rounded into
 * the rudder, whose trailing edge is vertical from the fuselage's bottom
 * to the top. Every section keeps at least 6 mm of fin ahead of the hinge.
 */
function tailOutline(y) {
  const top = TAIL_TOP;
  const rootY = -0.060;
  const leRoot = 0.780;
  const leTop = 0.935;
  let le = leRoot + ((y - rootY) / (top - rootY)) * (leTop - leRoot);
  le = Math.min(le, RUDDER_S - 0.006);
  let te = RUDDER_TE_S;
  const round0 = top - 0.030;
  if (y > round0) {
    const u = Math.min(0.995, (y - round0) / (top - round0));
    te = RUDDER_S + (RUDDER_TE_S - RUDDER_S) * Math.sqrt(1 - u * u);
  }
  return { le: st(le), hinge: st(RUDDER_S), te: st(Math.max(te, RUDDER_S + 0.004)) };
}

function finGeometry(n) {
  const ys = [-0.074, -0.060, -0.030, 0.0, 0.035, 0.055, 0.068, TAIL_TOP];
  return loft(ys.map((y) => {
    const o = tailOutline(y);
    const le = y < -0.060 ? tailOutline(-0.060).le : o.le;
    return section(finAt(y, le, o.hinge - le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUDDER_BOTTOM, RUDDER_BOTTOM + 0.006, -0.100, -0.050, 0.0, 0.050, 0.065, 0.075, TAIL_TOP];
  return loft(ys.map((y) => {
    const o = tailOutline(y);
    return section(finAt(y, o.hinge, o.te - o.hinge), 0, 1, n);
  }));
}

/*
 * The fuselage, as rounded box sections along the stations: half width,
 * top, bottom and squareness. The cowl behind the spinner, deepening to
 * the firewall; the windscreen's rake up to the wing; the cabin under the
 * wing, as deep as a box; and the turtledeck falling away behind the wing
 * to the tail post the rudder hangs on.
 */
const FUSE = [
  [0.045, 0.036, 0.028, -0.032, 2.4],
  [0.070, 0.045, 0.034, -0.050, 2.6],
  [0.120, 0.052, 0.038, -0.072, 2.8],
  [0.180, 0.056, 0.040, -0.092, 3.2],
  [0.250, 0.056, 0.052, -0.100, 3.6],
  [0.490, 0.056, 0.052, -0.100, 3.6],
  [0.560, 0.050, 0.030, -0.104, 3.2],
  [0.720, 0.034, -0.020, -0.122, 2.8],
  [0.880, 0.020, -0.056, -0.136, 2.4],
  [RUDDER_S, 0.010, -0.066, -0.140, 2.2],
];
function fuseAt(s) {
  const last = FUSE[FUSE.length - 1];
  const t = Math.min(Math.max(s, FUSE[0][0]), last[0]);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      /* The windscreen is a straight rake, everything else eases. */
      const k = i === 3 ? u : u * u * (3 - 2 * u);
      const lerp = (j) => a[j] + (b[j] - a[j]) * k;
      const top = lerp(2);
      const bottom = lerp(3);
      return { w: lerp(1), h: (top - bottom) / 2, yc: (top + bottom) / 2, e: lerp(4) };
    }
  }
  throw new Error(`nighttimbercraft: station ${s} is off the fuselage`);
}
/* A point on the fuselage's skin at station s, angle a from the top
 * towards +x, stood off it by out. */
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
/* The angle on the section at s whose height is v of the half height up
 * from the section's middle, on the side sign picks. */
function fuseAngle(s, v, sign) {
  const { e } = fuseAt(s);
  return sign * Math.acos(Math.sign(v) * Math.abs(v) ** (e / 2));
}
function fuseStations(lite) {
  return lite
    ? [0.045, 0.070, 0.120, 0.180, 0.250, 0.490, 0.560, 0.720, 0.880, RUDDER_S]
    : [0.045, 0.052, 0.062, 0.080, 0.100, 0.120, 0.150, 0.180, 0.215, 0.250, 0.490, 0.525, 0.560,
      0.640, 0.720, 0.800, 0.880, RUDDER_S];
}
function fuseGeometry(lite) {
  const around = lite ? 16 : 28;
  return loft(fuseStations(lite).map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/*
 * A point on the skin as the LOFT draws it: straight between its stations,
 * not the eased curve fuseAt gives between them, which dips inside the
 * lofted skin and would bury a panel laid on it.
 */
function skinPoint(ss, s, a, out) {
  let i = 0;
  while (i + 2 < ss.length && s > ss[i + 1]) {
    i += 1;
  }
  const u = (s - ss[i]) / (ss[i + 1] - ss[i]);
  return fusePoint(ss[i], a, out).lerp(fusePoint(ss[i + 1], a, out), u).setZ(st(s));
}
/* Paint on the fuselage from station s0 to s1, between the two angles
 * band(s) returns. */
function skinPanel(lite, s0, s1, ns, band, na, out = 0.0008) {
  const ss = fuseStations(lite);
  return paint((u, v) => {
    const s = s0 + (s1 - s0) * u;
    const [a0, a1] = band(s);
    return skinPoint(ss, s, a0 + (a1 - a0) * v, out);
  }, ns, na, (p) => new THREE.Vector3(p.x, p.y - fuseAt(p.z + CG_S).yc, 0), 0);
}

/* A round rod from a to b, flattened across the flow by flat, for legs
 * and springs. */
function rod(a, b, r, seg, flat = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.scale(1 / flat, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/* A 13 x 4 blade, slender with a rounded tip. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0045, 0.008);
  s.bezierCurveTo(0.0160, -0.020, 0.0140, -r * 0.60, 0.0060, -r * 0.985);
  s.lineTo(-0.0040, -r * 0.98);
  s.bezierCurveTo(-0.0110, -r * 0.45, -0.0090, -0.010, -0.0035, 0.008);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0024, bevelEnabled: false, curveSegments: segments });
}

/* mergeGeometries wants one attribute set; lofts carry no uv. */
function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
    if (g.index === null) {
      g.setIndex([...Array(g.getAttribute('position').count).keys()]);
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('nighttimbercraft: merge failed');
  }
  return geo;
}

/*
 * The wheels' drawn lowest points in the level craft frame, and the three
 * point attitude they make, cubcraft.js's way: the ground line tangent
 * under both wheel circles in the craft's side plane, solved by bisection.
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
 * against the drawn machine, in TIMBER_DIMS's shape: hullR the furthest
 * reach in plan, the rudder's trailing edge (further than the tips),
 * vHalfUp the prop's tip (higher than the wing's top), vHalfDown the
 * main tyres' bottoms.
 */
const UP = Math.max(TAIL_TOP, wingAt(0)(0.30, 1).y, PROP_R);
const DOWN = -(MAIN_Y - MAIN_R);
export const NIGHTTIMBER_DIMS = {
  span: 2 * HALF,
  chord: CHORD,
  stabSpan: 2 * STAB_HALF,
  gearTrack: 2 * MAIN_X,
  propR: PROP_R,
  noseZ: st(0),
  tailZ: st(RUDDER_TE_S),
  length: RUDDER_TE_S,
  vHalfUp: UP,
  vHalfDown: DOWN,
  flapHalf: FLAP_HALF,
  flapFull: FLAP_FULL,
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: MAIN_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: MAIN_W },
    tail: { axle: [...TAIL_AXLE], r: TAIL_WHEEL_R, width: 0.010 },
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
    hullR: Math.max(st(RUDDER_TE_S), Math.hypot(HALF, st(LE_S + CHORD))),
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: RUDDER_TE_S,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/* The camera mount: on the cowl's top ahead of the windscreen, looking
 * over the nose through the prop. */
const CAM_S = 0.150;
export const NIGHTTIMBER_MOUNT_FORWARD = -st(CAM_S);
export const NIGHTTIMBER_MOUNT_UP = fuseAt(CAM_S).yc + fuseAt(CAM_S).h + 0.011;

/* A tractor turning clockwise seen from the cockpit, as the Timber's. */
export const NIGHTTIMBER_PROP_SPIN = [1, 0, 0, 0];

/*
 * Where the real one's lights are, from E-flite's night photographs
 * (EFL13875_A14 to A17, docs/NIGHTTIMBER-STAGE1.md section 5), for the
 * lights PR: the navigation lights at the tips' leading edges, red left
 * and green right; the red beacon on the wing's top over the cabin; the
 * landing light in the cowl's chin.
 */
const tipLamp = (sign) => {
  const p = wingAt(sign * (HALF - 0.010))(0.06, 1);
  p.y -= 0.004;
  return p;
};
export const NIGHTTIMBER_LAMPS = {
  navLeft: tipLamp(-1),
  navRight: tipLamp(1),
  beacon: wingAt(0)(0.35, 1).add(new THREE.Vector3(0, 0.004, 0)),
  landing: fusePoint(0.060, Math.PI, 0.002),
};

export function buildNightTimberCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'nighttimber-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 8 : 14;
  const rodSeg = lite ? 4 : 8;

  /* The scheme's colours by region (src/render/livery.js), off E-flite's
   * photographs: white foam, the orange red of the flashes, black stripes
   * and cowl, grey slashes. */
  const coat = paintRegions();
  const whiteOf = (id) => coat.base(id, cel({ color: 0xf2f2ee, rim: 0.28, spec: 0.30, specWidth: 0.014 }));
  const whiteDimOf = (id) => coat.shade(id, cel({ color: 0xdfdfda, rim: 0.28, spec: 0.26, specWidth: 0.014 }));
  const fuseWhite = whiteOf('fuselage');
  const wingWhite = whiteOf('wing');
  const tailWhite = whiteOf('tail');
  const orange = coat.base('trim', cel({ color: 0xee4a1f, rim: 0.28, spec: 0.34, specWidth: 0.016 }));
  const black = coat.base('stripe', cel({ color: 0x17191b, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 }));
  const grey = coat.base('grey', cel({ color: 0x8d9195, rim: 0.28, spec: 0.30, specWidth: 0.014 }));
  const tyreBlack = cel({ color: 0x17191b, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 });
  const foam = cel({ color: 0x1f2022, rim: 0.22, spec: 0.08, specWidth: 0.010 });
  const metal = cel({ color: 0xc2c5c8, rim: 0.30, spec: 0.75, specWidth: 0.022 });
  const plastic = cel({ color: 0xe9e9e6, rim: 0.28, spec: 0.30, specWidth: 0.014 });
  const kit = opts.kit ?? {};
  const tint = TINTS[kit.canopy];
  const glass = cel({ color: tint ?? 0x7d8a92, rim: 0.40, spec: tint ? 0.75 : 0.55, specWidth: 0.020, specColor: 0xf3ead4 });
  const stator = cel({ color: 0x2a2c2e, rim: 0.24, spec: 0.20 });
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
  const propMat = cel({ color: 0x1d1f21, rim: 0.26, spec: 0.30 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on the contract with verify's check 15. */
  if (opts.measure) {
    const d = NIGHTTIMBER_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), fuseWhite);
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
    const fuse = new THREE.Mesh(geo, fuseWhite);
    fuse.position.copy(c);
    fuse.name = 'nighttimber-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.016, ink);
    group.add(fuse);
  }

  /* The wing, and the tail's stabiliser and fin, one region each. The
   * slat pockets' covers are moulded in: four flat pads along the leading
   * edge each side, a hair proud of it. */
  {
    const parts = [wingGeometry(lite)];
    for (const sign of [-1, 1]) {
      for (const x of [0.12, 0.25, 0.38, 0.51]) {
        parts.push(wingPaint(sign * (x - 0.012), sign * (x + 0.012), 0.004, 0.05, 1, 1, 1));
      }
    }
    const airframe = new THREE.Mesh(merged(parts), wingWhite);
    airframe.name = 'nighttimber-airframe';
    airframe.castShadow = shade;
    group.add(airframe);
    const n = lite ? 5 : 7;
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n)]), tailWhite);
    tail.name = 'nighttimber-tail';
    tail.castShadow = shade;
    group.add(tail);
  }

  /*
   * The orange red, one draw: the wing's big flash over each panel's
   * outer top, from the leading edge back to the hinge; the fuselage's
   * long sweep from the cowl to the tail; the stabiliser's tips and the
   * fin's flash.
   */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      parts.push(wingPaint(sign * 0.150, sign * 0.555, 0.010, 0.55, 1, lite ? 4 : 10, lite ? 3 : 6));
      parts.push(skinPanel(lite, 0.130, 0.930, lite ? 8 : 20, (s) => {
        const c = 0.30 - 0.55 * (s - 0.13) / 0.80;
        const w = 0.42 - 0.20 * (s - 0.13) / 0.80;
        return [fuseAngle(s, c, sign), fuseAngle(s, c - w, sign)];
      }, 3));
    }
    const stabPaint = (side, x0, x1) => paint((u, v) => {
      const x = x0 + (x1 - x0) * u;
      const p = stabPlan(Math.abs(x));
      return stabAt(x, p.le, p.hinge - p.le)(0.10 + 0.80 * v, side);
    }, lite ? 2 : 4, lite ? 2 : 3, () => new THREE.Vector3(0, side, 0));
    parts.push(stabPaint(1, 0.120, 0.230), stabPaint(1, -0.230, -0.120));
    for (const side of [-1, 1]) {
      parts.push(paint((u, v) => {
        const y = -0.010 + 0.040 * v;
        const o = tailOutline(y);
        const t = 0.30 + 0.60 * u;
        return finAt(y, o.le, o.hinge - o.le)(t, side);
      }, lite ? 2 : 4, 2, () => new THREE.Vector3(side, 0, 0)));
    }
    const mesh = new THREE.Mesh(merged(parts), orange);
    mesh.name = 'nighttimber-orange';
    mesh.castShadow = shade;
    group.add(mesh);
  }

  /*
   * The black, one draw: the cowl's top and the spinner's ring back to the
   * windscreen, the stripe inside the orange sweep, and the slashes on
   * the wing's flash.
   */
  {
    const parts = [];
    parts.push(skinPanel(lite, 0.047, 0.180, lite ? 3 : 6, (s) => [fuseAngle(s, 0.35, -1), fuseAngle(s, 0.35, 1)], lite ? 6 : 10));
    for (const sign of [-1, 1]) {
      parts.push(skinPanel(lite, 0.200, 0.780, lite ? 6 : 16, (s) => {
        const c = 0.30 - 0.55 * (s - 0.13) / 0.80 - 0.10;
        return [fuseAngle(s, c, sign), fuseAngle(s, c - 0.08, sign)];
      }, 1, 0.0014));
      parts.push(wingPaint(sign * 0.300, sign * 0.470, 0.10, 0.16, 1, 2, 1, 0.0014));
      for (const x of [0.340, 0.380, 0.420]) {
        parts.push(wingSlash(sign * x, 0.018, 0.18, 0.48, 0.05, 0.0014));
      }
    }
    const mesh = new THREE.Mesh(merged(parts), black);
    mesh.name = 'nighttimber-black';
    group.add(mesh);
  }

  /* The grey, one draw: the slashes behind the black on each wing and
   * along the fuselage's side under the sweep. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      for (const x of [0.220, 0.260]) {
        parts.push(wingSlash(sign * x, 0.018, 0.20, 0.48, 0.05, 0.0014));
      }
      for (const s0 of [0.40, 0.46, 0.52]) {
        parts.push(skinPanel(lite, s0, s0 + 0.035, 1, (s) => [fuseAngle(s, -0.30, sign), fuseAngle(s, -0.62, sign)], 1));
      }
    }
    const mesh = new THREE.Mesh(merged(parts), grey);
    mesh.name = 'nighttimber-grey';
    group.add(mesh);
  }

  /* The glass, one draw: the windscreen and the two windows each side. */
  {
    const parts = [];
    parts.push(skinPanel(lite, 0.185, 0.246, lite ? 2 : 4, () => [-1.05, 1.05], lite ? 6 : 12));
    for (const sign of [-1, 1]) {
      for (const [s0, s1] of [[0.262, 0.355], [0.365, 0.455]]) {
        parts.push(skinPanel(lite, s0, s1, 2, (s) => [fuseAngle(s, 0.88, sign), fuseAngle(s, 0.30, sign)], 3));
      }
    }
    const glassMesh = new THREE.Mesh(merged(parts), glass);
    glassMesh.name = 'nighttimber-glass';
    group.add(glassMesh);
  }

  /*
   * The tyres, one draw: fat foam tundra tyres, a torus whose outermost
   * ring has a vertex straight under the axle, so the lowest vertex is the
   * axle less the radius, exactly.
   */
  {
    const parts = [];
    const tube = MAIN_W / 2;
    for (const sign of [-1, 1]) {
      const tyre = new THREE.TorusGeometry(MAIN_R - tube, tube, lite ? 6 : 10, lite ? 16 : 24);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(tyre);
      const side = new THREE.CylinderGeometry(MAIN_R - tube, MAIN_R - tube, MAIN_W * 0.9, lite ? 12 : 20);
      side.rotateZ(Math.PI / 2);
      side.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(side);
    }
    const tyres = new THREE.Mesh(merged(parts), foam);
    tyres.name = 'nighttimber-tyres';
    tyres.castShadow = shade;
    group.add(tyres);
  }

  /*
   * The gear, one draw: the white moulded legs from the belly to the
   * axles, the hubs, the shock struts, the tailwheel's wire.
   */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const root = new THREE.Vector3(sign * 0.040, -0.090, st(0.200));
      const axle = new THREE.Vector3(sign * (MAIN_X - MAIN_W / 2 - 0.004), MAIN_Y, st(MAIN_S));
      parts.push(rod(root, axle, 0.010, rodSeg, 2.6));
      const hub = new THREE.CylinderGeometry(0.014, 0.014, MAIN_W + 0.003, seg);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(hub);
      const mid = new THREE.Vector3().lerpVectors(root, axle, 0.55);
      parts.push(rod(mid, new THREE.Vector3(0, -0.098, st(0.215)), 0.0045, rodSeg));
    }
    const legs = new THREE.Mesh(merged(parts), plastic);
    legs.name = 'nighttimber-gear';
    legs.castShadow = shade;
    group.add(legs);
    const wire = rod(new THREE.Vector3(0, fuseAt(0.935).yc - fuseAt(0.935).h + 0.002, st(0.925)),
      new THREE.Vector3(0, TAIL_WHEEL_Y + 0.030, st(TAIL_PIVOT_S)), 0.0018, lite ? 4 : 6);
    const wireMesh = new THREE.Mesh(wire, metal);
    wireMesh.castShadow = shade;
    group.add(wireMesh);
  }

  /* The moving surfaces. The elevator is both halves on one pivot. */
  const n = lite ? 4 : 5;
  const leftAil = aileron(-1, wingWhite, shade, lite);
  const rightAil = aileron(1, wingWhite, shade, lite);
  const flapDim = whiteDimOf('wing');
  const leftFlap = flap(-1, flapDim, shade, lite);
  const rightFlap = flap(1, flapDim, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, st(ELEV_HINGE_S));
  const elevator = hinged(merged([elevatorHalf(-1, n), elevatorHalf(1, n)]),
    eh(-STAB_HALF), eh(STAB_HALF), whiteDimOf('tail'), shade);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_S)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_S)),
    whiteDimOf('tail'), shade);

  /* The tailwheel on its own vertical pivot, trailing behind it, turning
   * with the rudder. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, TAIL_WHEEL_Y + 0.030, st(TAIL_PIVOT_S));
    const trail = TAIL_WHEEL_S - TAIL_PIVOT_S;
    const forkParts = [
      rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.006, -0.030, trail), 0.0014, lite ? 4 : 6),
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.010, lite ? 6 : 10).rotateZ(Math.PI / 2)
        .translate(0, -0.030, trail),
    ];
    const fork = new THREE.Mesh(merged(forkParts), metal);
    fork.castShadow = shade;
    pivot.add(fork);
    const tyreGeo = new THREE.TorusGeometry(TAIL_WHEEL_R - 0.0045, 0.0045, 6, 12);
    tyreGeo.rotateY(Math.PI / 2);
    tyreGeo.translate(0, -0.030, trail);
    const tyre = new THREE.Mesh(tyreGeo, tyreBlack);
    tyre.name = 'tyre-tail';
    tyre.castShadow = shade;
    pivot.add(tyre);
    return { pivot, axis: new THREE.Vector3(0, 1, 0) };
  })();

  const surfaces = {
    'aileron-left': leftAil,
    'aileron-right': rightAil,
    'flap-left': leftFlap,
    'flap-right': rightFlap,
    elevator,
    rudder,
    tailwheel,
  };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  /* The camera on the cowl's top, ahead of the windscreen. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, NIGHTTIMBER_MOUNT_UP, -NIGHTTIMBER_MOUNT_FORWARD);
  cameraMount.name = 'nighttimber-camera-mount';
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

  /* The video antenna, a whip off the turtledeck behind the wing. NAMED,
   * because it is wire and not aircraft: scripts/craft-check.js leaves it
   * out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.080, lite ? 5 : 8), antenna);
    const s = 0.600;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.036, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The motor behind the spinner, the black spinner, and the two blade
   * prop: rotor.rotation.y is the spin the shell drives.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.010, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, 0, st(0.055));
    group.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(0, 0, st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    const back = -(SPINNER_BASE_S - PROP_S);
    const len = PROP_S;
    const prof = [];
    const m = lite ? 4 : 7;
    prof.push(new THREE.Vector2(0.0001, back));
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      const r = Math.max(0.0012, SPINNER_R * Math.sqrt(1 - u * u));
      prof.push(new THREE.Vector2(r, back + 0.004 + (len - back - 0.004) * u));
    }
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(spinnerFor(kit.spinner, prof, SPINNER_R, back, len, m), lite ? 10 : 16), propMat);
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    propMount.add(spinner);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateZ((12 * Math.PI) / 180);
    const two = [0, 1].map((i) => bladeGeo.clone().rotateY(i * Math.PI));
    const bladeMesh = new THREE.Mesh(mergeGeometries(two, false), propMat);
    bladeMesh.castShadow = shade;
    rotor.add(bladeMesh);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({
        color: 0x4a4d50,
        transparent: true,
        opacity: 0.14,
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

  /* The kit's LEDs on the four slots the pose driver walks, where the real
   * one has its lamps: nav red left, green right, the beacon, the landing
   * light. */
  const lampAt = [
    { p: NIGHTTIMBER_LAMPS.navLeft, base: 0xff3a30, front: true },
    { p: NIGHTTIMBER_LAMPS.navRight, base: 0x3aff7a, front: false },
    { p: NIGHTTIMBER_LAMPS.beacon, base: 0xff2a20, front: false },
    { p: NIGHTTIMBER_LAMPS.landing, base: 0xfff4dc, front: true },
  ];
  for (const at of lampAt) {
    const ledMat = new THREE.MeshBasicMaterial({ color: at.base, fog });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), ledMat);
    led.position.copy(at.p);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base: at.base });
  }

  /*
   * THE FACTORY LIGHTS, the real one's LED system (docs/NIGHTTIMBER-STAGE1.md
   * section 5, E-flite's night photographs EFL13875_A14 to A17): the
   * strips inside the wings light each panel from within, whitest over
   * the leading edge half; the stabiliser and the cabin's underside glow
   * the same white; the landing light in the cowl's chin and the nav
   * lights at the tips burn steady, the strobes at the tips double flash
   * and the beacon on the wing's top pulses red. Unlit meshes, fogged
   * with the craft, no real light: the kits' budget (docs/KITS.md
   * section 4). Four draws: the glow, the steady lamps, the strobes, the
   * beacon. opts.lights.factory is the switch: auto (absent) on at night,
   * on, off.
   */
  const factoryMode = (opts.lights && opts.lights.factory) || 'auto';
  const factory = new THREE.Group();
  factory.name = 'factory-lights';
  {
    const glowParts = [];
    const lift = 0.0016;
    for (const sign of [-1, 1]) {
      for (const side of [-1, 1]) {
        glowParts.push(wingPaint(sign * (FLAP_IN + 0.004), sign * (HALF - 0.02), 0.03, 0.55, side, lite ? 3 : 8, lite ? 2 : 4, lift));
      }
    }
    for (const side of [-1, 1]) {
      glowParts.push(paint((u, v) => {
        const x = -STAB_HALF + 0.02 + (2 * STAB_HALF - 0.04) * u;
        const p = stabPlan(Math.abs(x));
        return stabAt(x, p.le, p.hinge - p.le)(0.08 + 0.80 * v, side);
      }, lite ? 3 : 8, 2, () => new THREE.Vector3(0, side, 0), lift));
    }
    glowParts.push(skinPanel(lite, 0.270, 0.480, lite ? 2 : 4, () => [Math.PI * 0.80, Math.PI * 1.20], 2, lift));
    const glow = new THREE.Mesh(merged(glowParts), new THREE.MeshBasicMaterial({
      color: 0xfff3dc, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog,
    }));
    glow.name = 'factory-glow';
    glow.renderOrder = 2;
    factory.add(glow);
  }
  const bulbs = (points, hex, name) => {
    const geos = points.map((p) => new THREE.SphereGeometry(0.0075, 8, 6).translate(p.x, p.y, p.z));
    const mesh = new THREE.Mesh(merged(geos), new THREE.MeshBasicMaterial({ color: hex, fog }));
    mesh.name = name;
    factory.add(mesh);
    return mesh;
  };
  const L = NIGHTTIMBER_LAMPS;
  const tipOut = (p, sign) => p.clone().add(new THREE.Vector3(sign * 0.006, 0, 0));
  const strobePos = (sign) => tipOut(sign < 0 ? L.navLeft : L.navRight, sign).add(new THREE.Vector3(0, 0, 0.03));
  bulbs([tipOut(L.navLeft, -1)], 0xff2010, 'factory-nav-left');
  bulbs([tipOut(L.navRight, 1)], 0x20ff40, 'factory-nav-right');
  bulbs([L.landing], 0xffffff, 'factory-landing');
  const strobes = bulbs([strobePos(-1), strobePos(1)], 0xffffff, 'factory-strobes');
  const beacon = bulbs([L.beacon], 0xff1a10, 'factory-beacon');
  factory.visible = factoryLit(factoryMode);
  group.add(factory);
  /* On the flight clock as every light here, so a replay flashes as the
   * flight did; the switch read against the world's night each time. */
  group.userData.setLights = (tMs) => {
    factory.visible = factoryLit(factoryMode);
    if (!factory.visible) {
      return;
    }
    strobes.visible = navLevel(tMs) > 0.5;
    beacon.visible = (tMs % 1000) < 450;
  };

  /*
   * Pose the surfaces. Radians: left aileron, right aileron, elevator,
   * rudder; ailerons and elevator positive trailing edge up, the rudder
   * positive trailing edge left, the tailwheel with it. The flaps are
   * positive trailing edge DOWN as lowered, and carry their side's
   * aileron on top, the full span ailerons of the 3D setup.
   */
  const q = new THREE.Quaternion();
  let flapNow = 0;
  let ailNow = [0, 0];
  const poseFlaps = () => {
    leftFlap.pivot.quaternion.copy(q.setFromAxisAngle(leftFlap.axis, flapNow - ailNow[0]));
    rightFlap.pivot.quaternion.copy(q.setFromAxisAngle(rightFlap.axis, flapNow - ailNow[1]));
  };
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    tailwheel.pivot.quaternion.copy(q.setFromAxisAngle(tailwheel.axis, -rudRad));
    ailNow = [leftRad, rightRad];
    poseFlaps();
  }
  function setFlaps(rad) {
    flapNow = rad;
    poseFlaps();
  }
  setSurfaces(0, 0, 0, 0);
  setFlaps(0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: NIGHTTIMBER_PROP_SPIN,
    setSurfaces,
    setFlaps,
    livery: coat.livery,
  };
}
