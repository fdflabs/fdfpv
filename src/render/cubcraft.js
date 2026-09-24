/*
 * cubcraft.js: the Cub's model, and nothing else.
 *
 * Its own file for the reason skycraft.js is: a taildragger with a tractor
 * prop does not share a silhouette with a twin boom pusher. It is a fabric
 * box fuselage under a strut braced high wing, an engine in the nose with
 * its cylinder heads out in the air, two main wheels on a V gear ahead of
 * the CG and a small steered wheel under the rudder.
 *
 * The subject is the FMS Piper J-3 Cub 1400 mm, in Cub Yellow with the black
 * lightning stripe. It is a scale model, so the full size J-3's numbers
 * scale into it, and they agree with FMS's own. FMS publishes the span,
 * 1400 mm, the length, 900 mm, the wing area, 28 dm2 (the V4 manual; the V3
 * listing says 25.1), the CG, 55 to 65 mm behind the leading edge (the V4
 * manual), and the prop, an 11 x 7 (a V3 dealer listing). Piper's J-3C-65
 * is 35 ft 3 in (10.74 m) of span, 22 ft 5 in (6.83 m) long, 6 ft 8 in
 * (2.03 m) high and 178.5 ft2 (16.58 m2) of wing (the type data A2A's J-3
 * manual reprints), on the J-3's commonly quoted 63 in (1.60 m) chord, 9 ft
 * 6 in stabiliser and 8.00 x 4 tyres. 1.4 / 10.74 is 1 : 7.67, and through
 * it Piper's wing is 0.2816 m2 against FMS's 28 dm2, and Piper's length
 * 0.890 m against FMS's 900 mm with the spinner. So this model is Piper's
 * aircraft at 1 : 7.67, with FMS's prop and spinner:
 *
 *   span            1.400 m, tips at x = +-0.7, rounded in plan over their
 *                   last 45 mm, 1 degree of dihedral
 *   wing            a constant 0.2085 m chord (63 in at scale), a flat
 *                   bottomed 11 percent section, the leading edge 0.200 m
 *                   behind the spinner's tip
 *   ailerons        from 0.36 to 0.645 m out, the aft 28 percent
 *   struts          a V each side, front and rear spar at 0.335 m out down
 *                   to the lower longeron, a jury strut on each
 *   tail            a 0.378 m stabiliser (9 ft 6 in at scale) on a 0.122 m
 *                   chord, its elevator the aft half, cut away at the root
 *                   for the rudder; a fin and rudder 0.114 m over the top
 *                   longeron, the rudder's trailing edge the aftmost point
 *   gear            a 0.238 m track (6 ft at scale, off the three view),
 *                   70 mm wheels (the 8.00 x 4 at scale) on sprung V legs
 *                   with the axle bar between them, the axles 15 mm ahead
 *                   of the leading edge
 *   tailwheel       24 mm, on a leaf spring under the rudder, steered by it
 *   prop            11 x 7 two blade tractor, a 0.2794 m disc, clockwise
 *                   seen from the cockpit, behind a 40 mm spinner
 *   length          0.900 m spinner tip to rudder trailing edge
 *
 * Where no one publishes a number, the fuselage's section, the windows,
 * the fin's outline, the gear's track and its legs' stations, it is taken
 * off the J-3's three view in proportion to the span.
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 60 mm behind the wing's leading edge,
 * the middle of FMS's range, at the height of the thrust line, in the cabin
 * where the pack sits. Every station below is measured aft from the
 * spinner's tip and turned into the craft frame's z by st().
 *
 * The aircraft rests on three wheels, and CUB_DIMS carries them: each
 * wheel's axle and radius, the lowest drawn point of each in the level
 * craft frame, and the three point attitude those make, eleven degrees
 * nose up. That is the attitude a J-3 sits at, and a taildragger's height
 * is measured sitting in it: the wing's top at its spar is 0.264 m off the
 * ground here, which is Piper's 6 ft 8 in at scale.
 *
 * The palette is the Cub's: Cub Yellow over everything that is fabric,
 * struts and gear legs included, the moving surfaces a shade down so the
 * hinge line reads, gloss black for the stripe and the tyres, and metal for
 * the cylinder heads, spinner, hubs and axle bar. The fuselage carries an
 * outline hull; the wing does not, for skycraft.js's reason.
 *
 * The contract with the shell is skycraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians.
 * Ailerons and elevator are positive trailing edge up; the rudder is
 * positive trailing edge to the LEFT, which yaws the nose left, and the
 * tailwheel turns with it the same way, because on the aircraft it is
 * steered off the rudder horn by springs.
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

/*
 * The aircraft, in metres, in the Three.js craft frame: x right, y up, z
 * aft, origin at the CG. Stations are metres aft of the spinner's tip.
 */
const LE_S = 0.200;
const CHORD = 0.2085;
const CG_S = LE_S + 0.060;
const st = (s) => s - CG_S;

const HALF = 0.700;
/* Where the tip starts to round in plan. */
const TIP_IN = 0.655;
const DIHEDRAL = (1 * Math.PI) / 180;
/* The root chord line's height above the CG: the flat bottom rides on the
 * cabin's top, which is at 0.098. */
const WING_Y = 0.099;
/* A flat bottomed trainer section, near enough the Cub's USA 35B. */
const WING_T = 0.11;
const WING_M = 0.05;
const WING_P = 0.35;

const AIL_IN = 0.36;
const AIL_OUT = 0.645;
const AIL_HINGE = 0.72;

/* The struts meet the wing's spars here, and the lower longeron there. */
const STRUT_X = 0.335;
const SPAR_F = 0.18;
const SPAR_R = 0.62;

/* The tail. */
const STAB_HALF = 0.189;
const STAB_LE_S = 0.742;
const STAB_CHORD = 0.122;
const ELEV_HINGE_S = 0.802;
const STAB_Y = 0.043;
const STAB_T = 0.08;
const RUDDER_S = 0.838;
const RUDDER_TE_S = 0.900;
const RUDDER_BOTTOM = 0.006;
const TAIL_TOP = 0.160;
const FIN_T = 0.09;

/* The nose: the prop's plane, the thrust line, the spinner. */
const THRUST_Y = 0.002;
const PROP_S = 0.030;
const PROP_R = 0.1397;
const SPINNER_R = 0.020;
const SPINNER_BASE_S = 0.038;

/* The gear. */
const MAIN_X = 0.119;
const MAIN_S = 0.185;
const MAIN_Y = -0.128;
const MAIN_R = 0.035;
const MAIN_W = 0.022;
const TAIL_PIVOT_S = 0.846;
const TAIL_WHEEL_S = 0.856;
const TAIL_WHEEL_Y = -0.021;
const TAIL_WHEEL_R = 0.012;

function chordLE(ax) {
  if (ax <= TIP_IN) {
    return { c: CHORD, le: st(LE_S) };
  }
  /* An ellipse in plan over the last 45 mm closing on half the chord, the
   * Cub's tip bow, stopped short of the point so the cap is not degenerate. */
  const u = Math.min(0.995, (ax - TIP_IN) / (HALF - TIP_IN));
  const f = Math.sqrt(1 - u * u);
  return { c: CHORD * f, le: st(LE_S) + 0.5 * CHORD * (1 - f) };
}
function wingLift(ax) {
  return WING_Y + ax * Math.tan(DIHEDRAL);
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
  return (t, side) => new THREE.Vector3(
    x,
    y0 + c * (camber(t) + side * naca(t, WING_T)),
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
 * ends, skycraft.js's loft: the signed volume of the closed result decides
 * which way the triangles face, so one loft serves a wing along x, a
 * fuselage along z and a fin up y.
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
 * The wing, tip to tip in one loft, cut at each aileron's hinge the way
 * skycraft.js cuts it: the step from a full section to a cut one at the
 * same station is the cut out's side wall.
 */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const half = [
    [0, 1], [AIL_IN - eps, 1], [AIL_IN + eps, AIL_HINGE],
    [0.50, AIL_HINGE], [AIL_OUT - eps, AIL_HINGE], [AIL_OUT + eps, 1], [TIP_IN, 1],
  ];
  const tip = lite ? [0.684, HALF] : [0.675, 0.690, HALF];
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
 * A hinged surface, skycraft.js's: the geometry moved so the pivot sits on
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

function aileron(sign, material, shade, lite) {
  const n = lite ? 4 : 6;
  const xs = [AIL_IN, (AIL_IN + AIL_OUT) / 2, AIL_OUT].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  const geo = loft(xs.map((x) => section(wingAt(x), AIL_HINGE, 1, n)));
  const hingePoint = (x) => {
    const up = wingAt(x)(AIL_HINGE, 1);
    const down = wingAt(x)(AIL_HINGE, -1);
    return up.add(down).multiplyScalar(0.5);
  };
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

/*
 * The stabiliser's planform at |x|: its leading and trailing edges, rounded
 * in plan over the outer 55 mm about the hinge line the way the Cub's tip
 * bows are. Inboard of 50 mm the elevator's trailing edge is cut forward
 * to 10 mm behind its hinge, which is the notch the rudder swings in.
 */
function stabPlan(ax) {
  const fixed = ELEV_HINGE_S - STAB_LE_S;
  const elev = STAB_LE_S + STAB_CHORD - ELEV_HINGE_S;
  const tipIn = STAB_HALF - 0.055;
  const u = Math.min(0.995, Math.max(0, (ax - tipIn) / (STAB_HALF - tipIn)));
  const f = Math.sqrt(1 - u * u);
  const notch = Math.min(1, Math.max(0, (ax - 0.014) / 0.036));
  const elevNow = Math.min(elev * f, 0.010 + (elev - 0.010) * notch);
  return { le: st(ELEV_HINGE_S - fixed * f), hinge: st(ELEV_HINGE_S), te: st(ELEV_HINGE_S) + elevNow };
}

function stabGeometry(n) {
  const xs = [-STAB_HALF, -0.176, -0.160, -0.134, 0, 0.134, 0.160, 0.176, STAB_HALF];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}

/* One elevator half, from the notch out; sign picks the side. */
function elevatorHalf(sign, n) {
  const xs = [0.014, 0.032, 0.050, 0.134, 0.160, 0.176, STAB_HALF - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.hinge, p.te - p.hinge), 0, 1, n);
  }));
}

/*
 * The fin and rudder's outline at height y: the fin's leading edge raked
 * back from the turtledeck and curling over into the rudder's round top,
 * the rudder's trailing edge vertical, rounded into the top and a little
 * at the bottom corner. Every section keeps at least 6 mm of fin ahead of
 * the hinge, so the rudder has a fin to hinge on all the way up.
 */
function tailOutline(y) {
  const top = TAIL_TOP;
  const rTE = RUDDER_TE_S - RUDDER_S;
  const bend = 0.105;
  const leLine = (h) => STAB_LE_S - 0.012 + ((h - 0.036) / (bend - 0.036)) * 0.052;
  let le = leLine(y);
  if (y > bend) {
    const u = Math.min(1, (y - bend) / (top - bend));
    le = RUDDER_S - (RUDDER_S - leLine(bend)) * Math.sqrt(1 - u * u);
  }
  le = Math.min(le, RUDDER_S - 0.006);
  let te = RUDDER_TE_S;
  const round0 = top - 0.070;
  if (y > round0) {
    const u = Math.min(0.995, (y - round0) / (top - round0));
    te = RUDDER_S + rTE * Math.sqrt(1 - u * u);
  }
  if (y < RUDDER_BOTTOM + 0.014) {
    const u = (RUDDER_BOTTOM + 0.014 - y) / 0.014;
    te = RUDDER_S + rTE * (0.55 + 0.45 * Math.sqrt(1 - u * u));
  }
  return { le: st(le), hinge: st(RUDDER_S), te: st(Math.max(te, RUDDER_S + 0.004)) };
}

function finGeometry(n) {
  const ys = [0.036, 0.070, 0.105, 0.125, 0.140, 0.150, 0.156, TAIL_TOP];
  return loft(ys.map((y) => {
    const o = tailOutline(y);
    return section(finAt(y, o.le, o.hinge - o.le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUDDER_BOTTOM, RUDDER_BOTTOM + 0.006, RUDDER_BOTTOM + 0.014, 0.060, 0.090,
    0.110, 0.128, 0.142, 0.152, 0.157, TAIL_TOP];
  return loft(ys.map((y) => {
    const o = tailOutline(y);
    return section(finAt(y, o.hinge, o.te - o.hinge), 0, 1, n);
  }));
}

/*
 * The fuselage, as rounded box sections along the stations: half width,
 * top, bottom and squareness. The nose bowl behind the spinner, the cowl
 * widening to the firewall, the windscreen's slope up to the wing, the
 * cabin under the wing, and the long taper of the turtledeck to the post
 * the rudder hangs on.
 */
const FUSE = [
  [0.040, 0.024, 0.026, -0.024, 2.4],
  [0.052, 0.034, 0.036, -0.036, 2.6],
  [0.075, 0.040, 0.044, -0.046, 2.8],
  [0.125, 0.046, 0.050, -0.053, 3.0],
  [0.200, 0.0475, 0.098, -0.056, 3.2],
  [0.360, 0.0475, 0.098, -0.056, 3.2],
  [0.410, 0.045, 0.098, -0.052, 3.0],
  [0.500, 0.040, 0.084, -0.040, 2.8],
  [0.620, 0.031, 0.068, -0.022, 2.6],
  [0.740, 0.019, 0.053, -0.002, 2.4],
  [RUDDER_S, 0.006, 0.046, 0.012, 2.2],
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
  throw new Error(`cubcraft: station ${s} is off the fuselage`);
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
/* The stations the fuselage is lofted at, full and lite. */
function fuseStations(lite) {
  return lite
    ? [0.040, 0.055, 0.080, 0.125, 0.200, 0.360, 0.410, 0.520, 0.640, 0.740, RUDDER_S]
    : [0.040, 0.046, 0.056, 0.075, 0.100, 0.125, 0.162, 0.200, 0.360, 0.410, 0.480, 0.560,
      0.650, 0.740, RUDDER_S];
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

/*
 * A point on the skin as the LOFT draws it: straight between its stations,
 * not the eased curve fuseAt gives between them, which dips up to a
 * millimetre inside the lofted skin and would bury a panel laid on it.
 */
function skinPoint(ss, s, a, out) {
  let i = 0;
  while (i + 2 < ss.length && s > ss[i + 1]) {
    i += 1;
  }
  const u = (s - ss[i]) / (ss[i + 1] - ss[i]);
  return fusePoint(ss[i], a, out).lerp(fusePoint(ss[i + 1], a, out), u).setZ(st(s));
}

/*
 * A panel laid on the fuselage's skin a hair proud of it: stations s0 to
 * s1, and between them the angles band(s) returns. The stripe, the windows
 * and the windscreen are all this. Its winding is checked against the
 * outward direction rather than reasoned about.
 */
function skinPanel(lite, s0, s1, ns, band, na, out = 0.0008) {
  const ss = fuseStations(lite);
  const pos = [];
  const idx = [];
  for (let i = 0; i <= ns; i += 1) {
    const s = s0 + ((s1 - s0) * i) / ns;
    const [a0, a1] = band(s);
    for (let j = 0; j <= na; j += 1) {
      const p = skinPoint(ss, s, a0 + ((a1 - a0) * j) / na, out);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = na + 1;
  for (let i = 0; i < ns; i += 1) {
    for (let j = 0; j < na; j += 1) {
      const a = i * row + j;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  /* Outward is away from the section's middle. */
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const mid = Math.floor(idx.length / 6) * 3;
  const [p0, p1, p2] = [v(idx[mid]), v(idx[mid + 1]), v(idx[mid + 2])];
  const nrm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  const c = fuseAt(p0.z + CG_S);
  const outward = new THREE.Vector3(p0.x, p0.y - c.yc, 0);
  if (nrm.dot(outward) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* Piecewise linear through [s, y] knots. */
function knots(pts) {
  return (s) => {
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const [s0, v0] = pts[i];
      const [s1, v1] = pts[i + 1];
      if (s <= s1) {
        return v0 + (v1 - v0) * Math.max(0, (s - s0) / (s1 - s0));
      }
    }
    return pts[pts.length - 1][1];
  };
}

/*
 * The lightning stripe on one side, its edges as heights: a point at the
 * nose bowl level with the prop shaft, widening up the cowl to a band
 * that runs straight along the cabin under the windows, a bolt jogging
 * down and back under the wing's trailing edge, and a taper to a point
 * three quarters of the way to the tail.
 */
const STRIPE_TOP = knots([[0.046, 0.012], [0.130, 0.034], [0.200, 0.037], [0.400, 0.037], [0.435, 0.018],
  [0.780, 0.018]]);
const STRIPE_BOTTOM = knots([[0.046, 0.004], [0.130, 0.020], [0.200, 0.023], [0.375, 0.023], [0.410, -0.004],
  [0.780, 0.018]]);
function stripeV(s, y) {
  const { h, yc } = fuseAt(s);
  return Math.min(0.95, Math.max(-0.95, (y - yc) / h));
}
function stripeGeometry(sign, lite) {
  /* Dense where the bolt jogs, so its edges are straight. */
  const parts = [];
  const spans = [[0.046, 0.130, lite ? 3 : 5], [0.130, 0.375, lite ? 4 : 8], [0.375, 0.435, lite ? 4 : 8],
    [0.435, 0.780, lite ? 5 : 10]];
  for (const [s0, s1, ns] of spans) {
    parts.push(skinPanel(lite, s0, s1, ns, (s) => {
      const a = fuseAngle(s, stripeV(s, STRIPE_TOP(s)), sign);
      const b = fuseAngle(s, stripeV(s, STRIPE_BOTTOM(s)), sign);
      return [a, b];
    }, 2));
  }
  return parts;
}

/* The glass: the windscreen over the top from the cowl to the wing, its
 * sides stopping 4 mm over the stripe, and on each side the door window
 * and the rear quarter window under the wing. */
function glassGeometry(lite) {
  const parts = [];
  const side = lite ? 2 : 4;
  parts.push(skinPanel(lite, 0.129, 0.197, side, (s) => {
    const v = Math.max(0.30, stripeV(s, STRIPE_TOP(s) + 0.004));
    return [fuseAngle(s, v, -1), fuseAngle(s, v, 1)];
  }, lite ? 8 : 14));
  for (const sign of [-1, 1]) {
    for (const [s0, s1] of [[0.205, 0.300], [0.310, 0.365]]) {
      parts.push(skinPanel(lite, s0, s1, side, (s) => [fuseAngle(s, 0.86, sign), fuseAngle(s, 0.40, sign)], 3));
    }
  }
  return parts;
}

/* A round rod from a to b, flattened to a streamline across the flow by
 * flat, for struts and gear legs. */
function rod(a, b, r, seg, flat = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.scale(1 / flat, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/*
 * A finned cylinder head standing out of the cowl's side at station s:
 * the barrel, three cooling fins and the rocker cover on the end, laid
 * along x on the side sign picks.
 */
function cylinderHead(sign, s, y, lite) {
  const seg = lite ? 8 : 10;
  const parts = [];
  const out = (g, x) => {
    g.rotateZ(Math.PI / 2);
    g.translate(sign * x, y, st(s));
    parts.push(g);
  };
  out(new THREE.CylinderGeometry(0.0095, 0.0095, 0.030, seg), 0.043);
  const fins = lite ? [0.050] : [0.046, 0.052];
  for (const x of fins) {
    out(new THREE.CylinderGeometry(0.0130, 0.0130, 0.0022, seg), x);
  }
  const cover = new THREE.BoxGeometry(0.005, 0.017, 0.013);
  cover.translate(sign * 0.0595, y, st(s));
  parts.push(cover);
  return parts;
}

/* An 11 x 7 blade, skycraft.js's outline drawn to this disc. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0040, 0.010);
  s.bezierCurveTo(0.0200, -0.016, 0.0170, -r * 0.45, 0.0060, -r * 0.96);
  s.lineTo(-0.0045, -r * 0.93);
  s.bezierCurveTo(-0.0150, -r * 0.40, -0.0100, -0.010, -0.0030, 0.010);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0022, bevelEnabled: false, curveSegments: segments });
}

/* mergeGeometries wants one attribute set; lofts carry no uv. */
function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('cubcraft: merge failed');
  }
  return geo;
}

/*
 * The wheels' drawn lowest points in the level craft frame, and the three
 * point attitude they make. A tyre is a torus whose tube's outermost ring
 * has a vertex straight under the axle (tubular segments a multiple of
 * four), so the lowest vertex is the axle less the radius, exactly.
 *
 * The attitude is the ground line tangent under both wheel circles in the
 * craft's side plane: with up = (0, cos p, -sin p) in the craft frame, the
 * two centres stand their own radius above one plane when
 * cos p dy - sin p dz = r_tail - r_main. Solved by bisection, since it is
 * computed once at import.
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
/* The CG's height over the ground at rest: the up axis dotted with the
 * main wheel's contact, negated. */
const REST_CG_HEIGHT = (() => {
  const c = restContact(MAIN_AXLE, MAIN_R);
  return -(Math.cos(REST_PITCH) * c[1] - Math.sin(REST_PITCH) * c[2]);
})();

/*
 * Exported numbers, so the airframe table and the scale check are held
 * against the drawn machine. `dims` is configs/airframes.js's shape, filled
 * the way the Skyhunter's entry fills it: hullR the half span, vHalfUp the
 * rudder's top, vHalfDown the main tyres' bottoms.
 */
const UP = TAIL_TOP;
const DOWN = -(MAIN_Y - MAIN_R);
export const CUB_DIMS = {
  span: 2 * HALF,
  chord: CHORD,
  dihedralDeg: 1,
  stabSpan: 2 * STAB_HALF,
  stabChord: STAB_CHORD,
  tailHeight: TAIL_TOP - fuseAt(RUDDER_S).yc - fuseAt(RUDDER_S).h,
  gearTrack: 2 * MAIN_X,
  propR: PROP_R,
  noseZ: st(0),
  tailZ: st(RUDDER_TE_S),
  length: RUDDER_TE_S,
  vHalfUp: UP,
  vHalfDown: DOWN,
  /* The wheels: axle centres and radii in the craft frame, level. */
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: MAIN_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: MAIN_W },
    tail: { axle: [...TAIL_AXLE], r: TAIL_WHEEL_R, width: 0.008 },
  },
  /* The lowest drawn point of each wheel with the craft level. */
  contact: {
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    tail: [0, TAIL_AXLE[1] - TAIL_WHEEL_R, TAIL_AXLE[2]],
  },
  /* On the ground, three point: the nose up pitch in radians, the points
   * on each tyre that touch, and the CG's height over the ground. */
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
    hullR: HALF,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: RUDDER_TE_S,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera mount, in the craft frame: the FPV camera ON TOP OF THE COWL,
 * just ahead of the windscreen, where FPV Cubs carry it, looking over the
 * nose through the prop. 165 mm ahead of the CG and 57 mm above it.
 */
const CAM_S = 0.095;
export const CUB_MOUNT_FORWARD = -st(CAM_S);
export const CUB_MOUNT_UP = fuseAt(CAM_S).yc + fuseAt(CAM_S).h + 0.011;

/*
 * A tractor turning clockwise seen from the cockpit, as a Cub's does. The
 * prop mount turns the rotor's y onto the craft's forward axis, -z, and a
 * positive turn about an axis pointing away from the eye is clockwise, so
 * +1 is clockwise from behind. Slots 1 to 3 spin nothing.
 */
export const CUB_PROP_SPIN = [1, 0, 0, 0];

export function buildCubCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'cub-craft';
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

  const yellow = cel({ color: 0xf0be2a, rim: 0.28, spec: 0.30, specWidth: 0.014 });
  const flapMat = cel({ color: 0xd9a41f, rim: 0.28, spec: 0.26, specWidth: 0.014 });
  const fuseMat = cel({ color: 0xf0be2a, rim: 0.28, spec: 0.34, specWidth: 0.016 });
  const black = cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 });
  const metal = cel({ color: 0xb4b0a6, rim: 0.30, spec: 0.70, specWidth: 0.022 });
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
  const propMat = cel({ color: 0x2c302c, rim: 0.26, spec: 0.30 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = CUB_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), yellow);
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
    fuse.name = 'cub-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.018, ink);
    group.add(fuse);
  }

  /*
   * Every fixed yellow part in one draw: the wing, the stabiliser, the fin,
   * the lift struts and their jury struts, and the gear legs.
   */
  {
    const n = lite ? 5 : 7;
    const parts = [wingGeometry(lite), stabGeometry(n), finGeometry(n)];
    for (const sign of [-1, 1]) {
      const foot = [
        new THREE.Vector3(sign * 0.045, -0.050, st(0.215)),
        new THREE.Vector3(sign * 0.045, -0.050, st(0.235)),
      ];
      const heads = [SPAR_F, SPAR_R].map((t) => wingAt(sign * STRUT_X)(t, -1));
      for (let i = 0; i < 2; i += 1) {
        parts.push(rod(foot[i], heads[i], 0.0022, rodSeg, 1.8));
        /* The jury strut: from 60 percent up the strut straight up to the
         * wing's underside. */
        const j = new THREE.Vector3().lerpVectors(foot[i], heads[i], 0.6);
        const top = wingAt(j.x)(i === 0 ? SPAR_F : SPAR_R, -1);
        parts.push(rod(j, new THREE.Vector3(j.x, top.y, j.z), 0.0016, lite ? 4 : 6));
      }
      /* The gear: a V of legs from the lower longeron to the axle. */
      const axle = new THREE.Vector3(sign * (MAIN_X - MAIN_W / 2 - 0.002), MAIN_Y, st(MAIN_S));
      parts.push(rod(new THREE.Vector3(sign * 0.040, -0.050, st(0.148)), axle, 0.0028, rodSeg, 1.6));
      parts.push(rod(new THREE.Vector3(sign * 0.040, -0.052, st(0.238)), axle, 0.0028, rodSeg, 1.6));
    }
    const airframe = new THREE.Mesh(merged(parts), yellow);
    airframe.name = 'cub-airframe';
    airframe.castShadow = shade;
    group.add(airframe);
  }

  /*
   * Gloss black, one draw: the stripe on both sides, the shock sleeves on
   * the rear gear legs, and the main tyres.
   */
  {
    const parts = [...stripeGeometry(1, lite), ...stripeGeometry(-1, lite)];
    for (const sign of [-1, 1]) {
      const axle = new THREE.Vector3(sign * (MAIN_X - MAIN_W / 2 - 0.002), MAIN_Y, st(MAIN_S));
      const root = new THREE.Vector3(sign * 0.040, -0.052, st(0.238));
      parts.push(rod(
        new THREE.Vector3().lerpVectors(root, axle, 0.30),
        new THREE.Vector3().lerpVectors(root, axle, 0.62),
        0.0056, rodSeg,
      ));
      const tyre = new THREE.TorusGeometry(MAIN_R - 0.011, 0.011, 6, lite ? 16 : 20);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(tyre);
    }
    const blackMesh = new THREE.Mesh(merged(parts), black);
    blackMesh.name = 'cub-black';
    blackMesh.castShadow = shade;
    group.add(blackMesh);
  }

  /*
   * Metal, one draw: the four cylinder heads, staggered as a flat four's
   * are, the exhaust stack, the main wheels' hubs and the axle bar, and
   * the tailwheel's leaf spring.
   */
  {
    const parts = [];
    for (const [sign, s0] of [[-1, 0.074], [1, 0.080]]) {
      for (const s of [s0, s0 + 0.024]) {
        parts.push(...cylinderHead(sign, s, -0.012, lite));
      }
    }
    parts.push(rod(new THREE.Vector3(0.018, -0.046, st(0.110)), new THREE.Vector3(0.020, -0.066, st(0.118)),
      0.0030, seg));
    for (const sign of [-1, 1]) {
      const hub = new THREE.CylinderGeometry(0.0125, 0.0125, MAIN_W + 0.002, seg);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(hub);
    }
    parts.push(rod(new THREE.Vector3(-(MAIN_X - MAIN_W / 2), MAIN_Y, st(MAIN_S)),
      new THREE.Vector3(MAIN_X - MAIN_W / 2, MAIN_Y, st(MAIN_S)), 0.0024, seg));
    parts.push(rod(new THREE.Vector3(0, fuseAt(0.800).yc - fuseAt(0.800).h + 0.002, st(0.800)),
      new THREE.Vector3(0, -0.003, st(TAIL_PIVOT_S)), 0.0022, lite ? 4 : 6, 0.4));
    const metalMesh = new THREE.Mesh(merged(parts), metal);
    metalMesh.name = 'cub-metal';
    metalMesh.castShadow = shade;
    group.add(metalMesh);
  }

  /* The glass, one draw. */
  {
    const glassMesh = new THREE.Mesh(merged(glassGeometry(lite)), glass);
    glassMesh.name = 'cub-glass';
    group.add(glassMesh);
  }

  /* The four moving surfaces. The elevator is both halves on one pivot,
   * joined through the fuselage as the real one is by its torque tube. */
  const n = lite ? 4 : 5;
  const leftAil = aileron(-1, flapMat, shade, lite);
  const rightAil = aileron(1, flapMat, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, st(ELEV_HINGE_S));
  const elevator = hinged(merged([elevatorHalf(-1, n), elevatorHalf(1, n)]),
    eh(-STAB_HALF), eh(STAB_HALF), flapMat, shade);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_S)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_S)),
    flapMat, shade);

  /*
   * The tailwheel on its own vertical pivot at the spring's end: the fork
   * trailing 10 mm behind it and the tyre, which turns with the rudder.
   */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, -0.003, st(TAIL_PIVOT_S));
    const trail = TAIL_WHEEL_S - TAIL_PIVOT_S;
    const forkParts = [
      rod(new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(0, TAIL_WHEEL_Y + 0.003, trail), 0.0018, lite ? 4 : 6),
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.009, lite ? 6 : 10).rotateZ(Math.PI / 2)
        .translate(0, TAIL_WHEEL_Y + 0.003, trail),
    ];
    const fork = new THREE.Mesh(merged(forkParts), metal);
    fork.castShadow = shade;
    pivot.add(fork);
    const tyreGeo = new THREE.TorusGeometry(TAIL_WHEEL_R - 0.0038, 0.0038, 5, 12);
    tyreGeo.rotateY(Math.PI / 2);
    tyreGeo.translate(0, TAIL_WHEEL_Y + 0.003, trail);
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

  /*
   * The camera on the cowl's top, ahead of the windscreen. The mount group
   * is what the shell parents the FPV view to and tilts.
   */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, CUB_MOUNT_UP, -CUB_MOUNT_FORWARD);
  cameraMount.name = 'cub-camera-mount';
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
    const s = 0.450;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.036, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The motor behind the spinner, the spinner, and the prop. The prop mount
   * turns the rotor's y axis onto the craft's forward axis, as skycraft.js
   * does, so rotor.rotation.y is the spin the shell drives. The spinner
   * sits on the mount, not the rotor: it is round and need not turn, and it
   * stays drawn when the shell swaps the blades for the disc.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.010, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, THRUST_Y, st(0.041));
    group.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(0, THRUST_Y, st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    /* The spinner as a lathe about the mount's y, which is forward: its
     * base 8 mm behind the prop's plane, its tip on the station origin. */
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
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 10 : 14), metal);
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    propMount.add(spinner);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    /*
     * Two blades along the mount's z, which is up, pitched so each blade's
     * leading edge, the one it turns towards, stands forward: about the
     * blade's own axis by +15 degrees for the upper blade, and the lower
     * one is the same blade turned half round the spin axis.
     */
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
        color: 0x5a6558,
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

  /*
   * Four lamps on the four slots the pose driver walks, skycraft.js's
   * arrangement: sakura on the left tip and the cowl, mint on the right
   * tip and the turtledeck ahead of the fin.
   */
  const tipTop = (x) => wingAt(x)(0.5, 1);
  const lampAt = [
    { p: tipTop(-0.66), front: true },
    { p: tipTop(0.66), front: false },
    { p: fusePoint(0.058, 0), front: true },
    { p: fusePoint(0.700, 0), front: false },
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

  /*
   * Pose the surfaces. Radians: left aileron, right aileron, elevator,
   * rudder. Ailerons and elevator positive trailing edge up, rudder
   * positive trailing edge to the left, and the tailwheel with it. Every
   * axis points +x or +y (see hinged), and about either a negative turn
   * carries an aft point up or to -x, so each turns by the negated angle.
   * elevRad and rudRad default to zero for skycraft.js's reason.
   */
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
    propSpin: CUB_PROP_SPIN,
    setSurfaces,
  };
}
