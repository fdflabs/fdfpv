/*
 * glidercraft.js: the Radian's model, and nothing else.
 *
 * Its own file for the reason cubcraft.js is: a 2 m motor glider does not
 * share a silhouette with a taildragger or a twin boom pusher. It is a long
 * slender wing with a curved polyhedral, a fuselage that is a pod under a
 * canopy tapering to a thin boom, a tall swept fin with the stabiliser
 * through its foot, and a two blade prop in the nose that folds back along
 * the fuselage when the motor stops.
 *
 * The subject is the E-flite Radian Pro, the Radian with ailerons, in its
 * white foam with red tips edged in black and a black canopy, as the Model
 * Airplane News and Fly RC photographs show it. Every length is the
 * EFL4750 manual's: its top view silhouette, scaled to the 2000 mm span,
 * for the planforms, and its side view, scaled to the 1140 mm length, for
 * the fuselage and the fin; docs/GLIDER-STAGE1.md measures both and the
 * plant, src/native/plant.c and plant_wing.c, is built from the same
 * numbers:
 *
 *   span            2.000 m, tips at x = +-1.0 in plan; the chord 0.200 m
 *                   to 0.60 m out, the leading edge then curving back to
 *                   0.110 m at 0.95 m and a round tip, the trailing edge
 *                   straight; 36.3 dm2 drawn against the manual's 35.5
 *   polyhedral      the local dihedral 2 deg at the root growing as the
 *                   square of the span station to 14 deg at the tip, the
 *                   tip 0.106 m up: the Radian's "elliptical dihedral"
 *   wing            a thin cambered section, 9 percent thick, the root's
 *                   leading edge 0.2455 m behind the spinner's tip, the
 *                   chord line 30 mm over the CG: a mid wing
 *   ailerons        from 0.55 to 0.95 m out, the aft quarter
 *   tail            a 0.477 m stabiliser on a 0.117 m root chord through
 *                   the fin's foot, its elevator the aft 29 mm; a fin 0.218
 *                   m tall swept back to the aftmost point, its rudder
 *                   the aft 40 percent above the stabiliser
 *   prop            9.75 x 7.5 two blade folding tractor, a 0.2477 m disc,
 *                   clockwise from the cockpit, behind a 32 mm spinner
 *   length          1.140 m spinner tip to the fin's trailing corner
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 63 mm behind the wing root's
 * leading edge, the manual's, and 8 mm over the thrust line. Every station
 * below is measured aft from the spinner's tip and turned into the craft
 * frame's z by st().
 *
 * THE PROP FOLDS. setProp(omega), the motor's rate in rad/s from the
 * plant, which reads exactly zero when the plant has folded the prop:
 * turning, the two blades stand out from their hinges on the spinner's
 * yoke and the shell spins them; stopped, they swing back 73 degrees on
 * those hinges to lie along the nose's sides, splayed just clear of it,
 * and the rotor parks with them level. The swing takes a few frames each
 * way, as a real one does. The disc is only drawn while the prop is open
 * and turning, so a parked Radian has nothing hanging under its nose.
 *
 * The contract with the shell is cubcraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians,
 * ailerons and elevator positive trailing edge up, the rudder positive
 * trailing edge LEFT; and setProp, which only this craft has.
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
const LE_S = 0.2455;
const ROOT_C = 0.200;
const TE_S = LE_S + ROOT_C;
const CG_S = LE_S + 0.063;
const st = (s) => s - CG_S;

const HALF = 1.000;
/* The wing's chord line at the root, over the CG. */
const WING_Y = 0.030;
const WING_T = 0.09;
const WING_M = 0.04;
const WING_P = 0.40;
/* The measured planform: chord at the span station, the manual's top view. */
const PLAN = [
  [0.00, 0.200], [0.60, 0.198], [0.70, 0.185], [0.80, 0.164], [0.85, 0.149],
  [0.90, 0.132], [0.95, 0.110], [0.98, 0.092], [1.00, 0.050],
];

const AIL_IN = 0.55;
const AIL_OUT = 0.95;
const AIL_HINGE = 0.75;
/* Where the red of the tips starts: a line from the leading edge at this
 * station to the trailing edge TIP_SLANT further out, a black edge inboard
 * of it. */
const TIP_RED = 0.80;
const TIP_SLANT = 0.10;
const TIP_EDGE = 0.018;

/* The tail. */
const STAB_HALF = 0.2385;
const STAB_LE_S = 0.960;
const STAB_C = 0.117;
const ELEV_C = 0.029;
const STAB_Y = 0.075;
const STAB_T = 0.06;
const STAB_TIP_IN = 0.19;
const FIN_T = 0.055;
const RUD_BOTTOM = 0.095;
const RUD_TOP = 0.200;

/* The nose: the prop's plane, the thrust line, the spinner. */
const THRUST_Y = -0.008;
const PROP_S = 0.0155;
const PROP_R = 0.1238;
const SPINNER_R = 0.016;
const HINGE_R = 0.016;
/* Folded, each blade swings back this far about its hinge, which leaves it
 * splayed 17 degrees off the nose, just clear of the fuselage's side. */
const FOLD_ANGLE = (73 * Math.PI) / 180;

function chordAt(ax) {
  for (let i = 0; i + 1 < PLAN.length; i += 1) {
    const [y0, c0] = PLAN[i];
    const [y1, c1] = PLAN[i + 1];
    if (ax <= y1) {
      return c0 + ((c1 - c0) * (ax - y0)) / (y1 - y0);
    }
  }
  return PLAN[PLAN.length - 1][1];
}
/* The local dihedral, radians, and the height the polyhedral has lifted
 * the chord line at |x|, integrated once into a table at import. */
const dihedralAt = (ax) => ((2 + 12 * (ax / HALF) ** 2) * Math.PI) / 180;
const RISE_N = 200;
const RISE = (() => {
  const out = [0];
  let z = 0;
  for (let i = 0; i < RISE_N; i += 1) {
    z += (Math.tan(dihedralAt(((i + 0.5) / RISE_N) * HALF)) * HALF) / RISE_N;
    out.push(z);
  }
  return out;
})();
function wingRise(ax) {
  const f = Math.min(1, ax / HALF) * RISE_N;
  const i = Math.min(RISE_N - 1, Math.floor(f));
  return RISE[i] + (RISE[i + 1] - RISE[i]) * (f - i);
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

/* A closed airfoil section, cubcraft.js's: a loop over the top from chord
 * fraction f0 to f1 and back under, cosine spaced. */
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
  const c = chordAt(ax);
  const le = st(TE_S) - c;
  const y0 = WING_Y + wingRise(ax);
  return (t, side) => new THREE.Vector3(x, y0 + c * (camber(t) + side * naca(t, WING_T)), le + t * c);
}
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
 * The wing, tip to tip in one loft, cut at each aileron's hinge the way
 * cubcraft.js cuts it: the step from a full section to a cut one at the
 * same station is the cut out's side wall.
 */
function wingGeometry(lite) {
  const n = lite ? 9 : 13;
  const eps = 0.0005;
  const inner = lite ? [0.30] : [0.15, 0.30, 0.45];
  const outer = lite ? [0.75, 0.88] : [0.65, 0.75, 0.82, 0.88, 0.92];
  const tip = lite ? [0.975, HALF] : [0.965, 0.98, 0.992, HALF];
  const half = [
    [0, 1], ...inner.map((x) => [x, 1]), [AIL_IN - eps, 1], [AIL_IN + eps, AIL_HINGE],
    ...outer.map((x) => [x, AIL_HINGE]), [AIL_OUT - eps, AIL_HINGE], [AIL_OUT + eps, 1],
    ...tip.map((x) => [x, 1]),
  ];
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
 * trailing edge or swings it left. extra are more geometries in the same
 * frame, moved with it, each drawn in its own material.
 */
function hinged(geo, a, b, material, shade, extra = []) {
  const axis = new THREE.Vector3().subVectors(b, a).normalize();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  const add = (g, m) => {
    g.translate(-mid.x, -mid.y, -mid.z);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shade;
    pivot.add(mesh);
    return mesh;
  };
  const mesh = add(geo, material);
  for (const [g, m] of extra) {
    add(g, m);
  }
  return { pivot, axis, mesh };
}

/*
 * A patch laid on the wing's skin a hair proud of it, top (side 1) or
 * bottom (-1): chord fractions f0 to f1, and at each fraction the span
 * from xFrom(f) to xTo(f), on the side sign picks. The tips' paint is
 * this. Its winding is checked against the outward normal rather than
 * reasoned about.
 */
function wingPatch(sign, side, f0, f1, xFrom, xTo, nf, nx, out = 0.0006) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= nf; i += 1) {
    const f = f0 + ((f1 - f0) * i) / nf;
    const a = xFrom(f);
    const b = xTo(f);
    for (let j = 0; j <= nx; j += 1) {
      const x = a + ((b - a) * j) / nx;
      const p = wingAt(sign * x)(f, side);
      p.y += side * out;
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = nx + 1;
  for (let i = 0; i < nf; i += 1) {
    for (let j = 0; j < nx; j += 1) {
      const a = i * row + j;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const nrm = new THREE.Vector3().subVectors(v(idx[1]), v(idx[0])).cross(new THREE.Vector3().subVectors(v(idx[2]), v(idx[0])));
  if (nrm.y * side < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    geo.setIndex(idx);
  }
  geo.computeVertexNormals();
  return geo;
}
/* The red's inboard edge at chord fraction f, and the black band inside
 * it. */
const redFrom = (f) => TIP_RED + TIP_SLANT * f;
const blackFrom = (f) => redFrom(f) - TIP_EDGE;

/* The tips' paint on the fixed wing, or on the aileron, one side, top and
 * bottom: [red parts, black parts]. */
function tipPaint(sign, onAileron, lite) {
  const nf = lite ? 3 : 6;
  const nx = lite ? 3 : 6;
  const red = [];
  const black = [];
  for (const side of [1, -1]) {
    if (onAileron) {
      red.push(wingPatch(sign, side, AIL_HINGE + 0.01, 0.995, redFrom, () => AIL_OUT - 0.002, nf, nx));
      black.push(wingPatch(sign, side, AIL_HINGE + 0.01, 0.995, blackFrom, redFrom, nf, 1));
      continue;
    }
    /* Ahead of the aileron's hinge all the way out; aft of it, only
     * outboard of the aileron. */
    red.push(wingPatch(sign, side, 0.01, AIL_HINGE - 0.01, redFrom, (f) => Math.min(0.985, 0.99 - 0.04 * Math.abs(f - 0.4)), nf, nx));
    black.push(wingPatch(sign, side, 0.01, AIL_HINGE - 0.01, blackFrom, redFrom, nf, 1));
    red.push(wingPatch(sign, side, AIL_HINGE + 0.01, 0.99, () => AIL_OUT + 0.002, () => 0.975, nf, 2));
  }
  return [red, black];
}

function aileron(sign, material, shade, lite, red, black) {
  const n = lite ? 5 : 7;
  const xs = [AIL_IN, 0.65, 0.75, 0.85, AIL_OUT].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  const geo = loft(xs.map((x) => section(wingAt(x), AIL_HINGE, 1, n)));
  const hingePoint = (x) => {
    const up = wingAt(x)(AIL_HINGE, 1);
    const down = wingAt(x)(AIL_HINGE, -1);
    return up.add(down).multiplyScalar(0.5);
  };
  const [reds, blacks] = tipPaint(sign, true, lite);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade, [
    [merged(reds), red], [merged(blacks), black],
  ]);
}

/*
 * The stabiliser's planform at |x|: its leading edge swept back from 50 mm
 * out and rounded into the tip over the last 50 mm, its trailing edge and
 * the elevator's hinge straight. Inboard of 14 mm the elevator's trailing
 * edge is cut forward to 8 mm behind its hinge, the notch the rudder's
 * foot would swing in.
 */
function stabPlan(ax) {
  const hinge = STAB_LE_S + STAB_C - ELEV_C;
  let le = STAB_LE_S + 0.2 * Math.max(0, ax - 0.05);
  let te = STAB_LE_S + STAB_C;
  if (ax > STAB_TIP_IN) {
    const u = Math.min(0.995, (ax - STAB_TIP_IN) / (STAB_HALF - STAB_TIP_IN));
    const f = Math.sqrt(1 - u * u);
    const mid = (STAB_LE_S + 0.2 * (STAB_TIP_IN - 0.05) + te) / 2;
    const halfc = (te - (STAB_LE_S + 0.2 * (STAB_TIP_IN - 0.05))) / 2;
    le = mid - halfc * f;
    te = mid + halfc * f;
  }
  const notch = Math.min(1, Math.max(0, (ax - 0.010) / 0.012));
  const elevTE = Math.min(te, hinge + 0.008 + (ELEV_C - 0.008) * notch);
  return { le: st(le), hinge: st(Math.min(hinge, te - 0.002)), te: st(elevTE), tip: st(te) };
}
/* The fixed stabiliser, from |x| a to b on the side sign picks; out on
 * the tips, past the elevator, it is the whole chord. */
function stabGeometry(xs, n) {
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    const aft = Math.abs(x) > STAB_TIP_IN ? p.tip : p.hinge;
    return section(stabAt(x, p.le, aft - p.le), 0, 1, n);
  }));
}
function elevatorHalf(sign, n) {
  const xs = [0.010, 0.016, 0.022, 0.10, 0.16, STAB_TIP_IN].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.hinge, p.te - p.hinge), 0, 1, n);
  }));
}

/*
 * The fin and rudder's outline at height y, off the side view: the leading
 * edge raked back from the fuselage to the round top, the trailing edge
 * raked too, and the rudder's hinge parallel to it 40 percent of the chord
 * ahead, from over the stabiliser to under the red cap.
 */
const FIN_LE = [
  [0.050, 0.858], [0.057, 0.861], [0.082, 0.8939], [0.1455, 0.9369], [0.1771, 0.9641],
  [0.2088, 0.9913], [0.2341, 1.0134], [0.2530, 1.0457], [0.2657, 1.0976], [0.2680, 1.118],
];
const FIN_TE = [
  [0.050, 1.086], [0.057, 1.0912], [0.0822, 1.1159], [0.1139, 1.1210], [0.1455, 1.1254],
  [0.1771, 1.1298], [0.2088, 1.1343], [0.2341, 1.1374], [0.2530, 1.1400], [0.2657, 1.1330],
  [0.2680, 1.122],
];
const FIN_TOP = 0.2680;
function interp(table, y) {
  for (let i = 0; i + 1 < table.length; i += 1) {
    const [y0, s0] = table[i];
    const [y1, s1] = table[i + 1];
    if (y <= y1) {
      return s0 + ((s1 - s0) * Math.max(0, y - y0)) / (y1 - y0);
    }
  }
  return table[table.length - 1][1];
}
const finLE = (y) => interp(FIN_LE, y);
const finTE = (y) => interp(FIN_TE, y);
const rudderHinge = (y) => finTE(y) - 0.4 * (finTE(y) - finLE(y));
/* The fixed fin between heights, full chord where there is no rudder. */
function finGeometry(ys, n) {
  return loft(ys.map((y) => {
    const le = finLE(y);
    const aft = y > RUD_BOTTOM + 0.0005 && y < RUD_TOP - 0.0005 ? rudderHinge(y) : finTE(y);
    return section(finAt(y, st(le), aft - le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUD_BOTTOM, 0.12, 0.15, 0.18, RUD_TOP];
  return loft(ys.map((y) => section(finAt(y, st(rudderHinge(y)), finTE(y) - rudderHinge(y)), 0, 1, n)));
}

/*
 * The fuselage, as rounded sections along the stations: half width, top,
 * bottom and squareness, off the side and top views. The nose ring behind
 * the spinner, the pod under the canopy to the wing, and the long taper
 * of the boom to the fin's foot.
 */
const FUSE = [
  [0.014, 0.013, 0.005, -0.021, 2.0],
  [0.030, 0.026, 0.018, -0.030, 2.2],
  [0.055, 0.035, 0.032, -0.035, 2.4],
  [0.095, 0.040, 0.046, -0.043, 2.6],
  [0.155, 0.042, 0.060, -0.052, 2.8],
  [0.250, 0.042, 0.070, -0.045, 2.8],
  [0.312, 0.040, 0.070, -0.040, 2.8],
  [0.440, 0.031, 0.066, -0.030, 2.6],
  [0.565, 0.025, 0.063, -0.021, 2.5],
  [0.690, 0.021, 0.059, -0.012, 2.4],
  [0.820, 0.018, 0.055, -0.001, 2.3],
  [0.945, 0.017, 0.050, 0.010, 2.2],
  [1.040, 0.013, 0.046, 0.020, 2.2],
  [1.088, 0.008, 0.043, 0.028, 2.0],
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
  throw new Error(`glidercraft: station ${s} is off the fuselage`);
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
function fuseStations(lite) {
  return lite
    ? [0.014, 0.030, 0.055, 0.095, 0.155, 0.250, 0.312, 0.440, 0.690, 0.945, 1.040, 1.088]
    : FUSE.map((r) => r[0]).flatMap((s, i, a) => (i + 1 < a.length && a[i + 1] - s > 0.1 ? [s, (s + a[i + 1]) / 2] : [s]));
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
/* A point on the skin as the loft draws it, straight between stations. */
function skinPoint(ss, s, a, out) {
  let i = 0;
  while (i + 2 < ss.length && s > ss[i + 1]) {
    i += 1;
  }
  const u = (s - ss[i]) / (ss[i + 1] - ss[i]);
  return fusePoint(ss[i], a, out).lerp(fusePoint(ss[i + 1], a, out), u).setZ(st(s));
}
/* The canopy: black over the pod's top from behind the spinner to the
 * wing's leading edge, its lower edge sloping down toward the nose. */
function canopyGeometry(lite) {
  const ss = fuseStations(lite);
  const s0 = 0.036;
  const s1 = LE_S - 0.004;
  const ns = lite ? 8 : 16;
  const na = lite ? 8 : 14;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= ns; i += 1) {
    const s = s0 + ((s1 - s0) * i) / ns;
    /* How far down the side it reaches, as an angle from the top. */
    const reach = 1.25 + 0.35 * (1 - (s - s0) / (s1 - s0));
    for (let j = 0; j <= na; j += 1) {
      const a = -reach + (2 * reach * j) / na;
      const p = skinPoint(ss, s, a, 0.0008);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = na + 1;
  for (let i = 0; i < ns; i += 1) {
    for (let j = 0; j < na; j += 1) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const mid = Math.floor(idx.length / 6) * 3;
  const nrm = new THREE.Vector3().subVectors(v(idx[mid + 1]), v(idx[mid])).cross(new THREE.Vector3().subVectors(v(idx[mid + 2]), v(idx[mid])));
  const c = fuseAt(v(idx[mid]).z + CG_S);
  if (nrm.dot(new THREE.Vector3(v(idx[mid]).x, v(idx[mid]).y - c.yc, 0)) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    geo.setIndex(idx);
  }
  geo.computeVertexNormals();
  return geo;
}

/* A round rod from a to b. */
function rod(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/*
 * One folding blade, in its hinge's frame: along +z from the hinge, the
 * chord across x, thin along y, which is the spin axis, forward. A folding
 * blade is narrow and nearly straight, widest a third of the way out.
 */
function bladeGeometry(segments) {
  const L = PROP_R - HINGE_R;
  const s = new THREE.Shape();
  s.moveTo(-0.004, 0);
  s.lineTo(0.004, 0);
  s.bezierCurveTo(0.0115, 0.2 * L, 0.0105, 0.6 * L, 0.0055, 0.97 * L);
  s.lineTo(0.0015, L);
  s.lineTo(-0.0035, 0.97 * L);
  s.bezierCurveTo(-0.0080, 0.6 * L, -0.0085, 0.2 * L, -0.004, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0022, bevelEnabled: false, curveSegments: segments });
  /* Shape x, y, z to blade x, z, y: the length out along z. */
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.0011, 0);
  /* Pitched so the leading edge, the one it turns toward, stands forward. */
  g.rotateZ((14 * Math.PI) / 180);
  return g;
}

/* mergeGeometries wants one attribute set; lofts carry no uv. */
function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
    if (g.getAttribute('normal') === undefined) {
      g.computeVertexNormals();
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('glidercraft: merge failed');
  }
  return geo;
}

/*
 * Exported numbers, so the airframe table, the plant and the scale check
 * are held against the drawn machine. `dims` is configs/airframes.js's
 * shape: hullR the half span's reach (the tip's trailing corner), vHalfUp
 * the fin's top, vHalfDown the belly, which is where the plant's hull
 * rests it (hull_hz_down 0.052).
 */
const TIP_REACH = Math.hypot(HALF, st(TE_S));
const UP = FIN_TOP;
const DOWN = -FUSE[4][3];
export const GLIDER_DIMS = {
  span: 2 * HALF,
  rootChord: ROOT_C,
  tipRise: wingRise(HALF),
  stabSpan: 2 * STAB_HALF,
  finHeight: FIN_TOP - fuseAt(0.9).yc - fuseAt(0.9).h,
  propR: PROP_R,
  propZ: st(PROP_S),
  thrustY: THRUST_Y,
  noseZ: st(0),
  tailZ: st(finTE(0.2530)),
  length: finTE(0.2530),
  vHalfUp: UP,
  vHalfDown: DOWN,
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: TIP_REACH,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: finTE(0.2530),
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera mount, in the craft frame: the FPV camera under the canopy's
 * front, 230 mm ahead of the CG and 35 mm over it, looking out over the
 * spinner. The plant's camera is the same point.
 */
const CAM_S = CG_S - 0.230;
export const GLIDER_MOUNT_FORWARD = -st(CAM_S);
export const GLIDER_MOUNT_UP = 0.035;

/* A tractor turning clockwise from the cockpit, cubcraft.js's sense. */
export const GLIDER_PROP_SPIN = [1, 0, 0, 0];

export function buildGliderCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'glider-craft';
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

  const white = cel({ color: 0xf1f1ec, rim: 0.26, spec: 0.30, specWidth: 0.014 });
  const flapMat = cel({ color: 0xdedfd8, rim: 0.26, spec: 0.26, specWidth: 0.014 });
  const fuseMat = cel({ color: 0xf1f1ec, rim: 0.26, spec: 0.34, specWidth: 0.016 });
  const red = cel({ color: 0xcf2a26, rim: 0.28, spec: 0.30, specWidth: 0.014 });
  const black = cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 });
  const canopy = cel({ color: 0x1b2127, rim: 0.40, spec: 0.60, specWidth: 0.020, specColor: 0xf3ead4 });
  const stator = cel({ color: 0x2a322c, rim: 0.24, spec: 0.20 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({ color: 0x101610, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xf3ead4, side: THREE.DoubleSide });
  const propMat = cel({ color: 0x1c1e1c, rim: 0.26, spec: 0.30 });
  const metal = cel({ color: 0xb4b0a6, rim: 0.30, spec: 0.70, specWidth: 0.022 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = GLIDER_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), white);
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
    fuse.name = 'glider-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.02, ink);
    group.add(fuse);
  }

  /*
   * Every fixed white part in one draw: the wing, the stabiliser inboard of
   * its red tips, the fin under its red cap, and the wing's root fairing.
   */
  const n = lite ? 5 : 7;
  {
    const parts = [
      wingGeometry(lite),
      stabGeometry([-STAB_TIP_IN, -0.10, 0, 0.10, STAB_TIP_IN], n),
      finGeometry([0.050, 0.070, RUD_BOTTOM, RUD_BOTTOM + 0.001, 0.15, RUD_TOP - 0.001, RUD_TOP], n),
    ];
    const airframe = new THREE.Mesh(merged(parts), white);
    airframe.name = 'glider-airframe';
    airframe.castShadow = shade;
    group.add(airframe);
  }

  /* Red, one draw: the wing's tips top and bottom, the stabiliser's tips
   * and the fin's cap. Black, one draw: the tips' edges, the canopy's
   * frame line and the spinner. */
  {
    const reds = [];
    const blacks = [];
    for (const sign of [-1, 1]) {
      const [r, b] = tipPaint(sign, false, lite);
      reds.push(...r);
      blacks.push(...b);
      const tip = stabGeometry([sign * STAB_TIP_IN, sign * 0.21, sign * 0.225, sign * (STAB_HALF - 0.001)].sort((p, q) => p - q), n);
      reds.push(tip);
    }
    reds.push(finGeometry([RUD_TOP, 0.22, 0.24, 0.2530, 0.2610, FIN_TOP], n));
    const redMesh = new THREE.Mesh(merged(reds), red);
    redMesh.name = 'glider-red';
    redMesh.castShadow = shade;
    group.add(redMesh);
    const blackMesh = new THREE.Mesh(merged(blacks), black);
    blackMesh.name = 'glider-black';
    group.add(blackMesh);
  }

  /* The canopy, one draw. */
  {
    const c = new THREE.Mesh(canopyGeometry(lite), canopy);
    c.name = 'glider-canopy';
    group.add(c);
  }

  /* The four moving surfaces. The elevator is both halves on one pivot,
   * joined behind the fin as the real one is. */
  const leftAil = aileron(-1, flapMat, shade, lite, red, black);
  const rightAil = aileron(1, flapMat, shade, lite, red, black);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, st(STAB_LE_S + STAB_C - ELEV_C));
  const elevator = hinged(merged([elevatorHalf(-1, n), elevatorHalf(1, n)]), eh(-STAB_TIP_IN), eh(STAB_TIP_IN), flapMat, shade);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUD_BOTTOM, st(rudderHinge(RUD_BOTTOM))),
    new THREE.Vector3(0, RUD_TOP, st(rudderHinge(RUD_TOP))),
    flapMat, shade);
  const surfaces = {
    'aileron-left': leftAil,
    'aileron-right': rightAil,
    elevator,
    rudder,
  };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  /* The camera under the canopy's front. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, GLIDER_MOUNT_UP, -GLIDER_MOUNT_FORWARD);
  cameraMount.name = 'glider-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.016), camBody);
    housing.position.set(0, -0.002, 0.006);
    cameraMount.add(housing);
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.006, lite ? 10 : 16), lens);
    glassDisc.rotation.y = Math.PI;
    glassDisc.position.set(0, -0.002, -0.0025);
    cameraMount.add(glassDisc);
  }

  /* The video antenna, a whip off the boom behind the wing. NAMED, because
   * it is wire and not aircraft: scripts/craft-check.js leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.070, lite ? 5 : 8), antenna);
    const s = 0.500;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.032, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The spinner, the yoke and the two folding blades. The prop mount turns
   * the rotor's y axis onto the craft's forward axis, as cubcraft.js's
   * does, so rotor.rotation.y is the spin the shell drives. Each blade
   * hangs on its own hinge on the yoke, HINGE_R out along the blade's axis
   * and turning about the axis across it, so a positive fold swings its
   * tip aft; the second blade's hinge is the first turned half round.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  const folds = [];
  const propMount = new THREE.Group();
  propMount.position.set(0, THRUST_Y, st(PROP_S));
  propMount.rotation.x = -Math.PI / 2;
  group.add(propMount);
  const rotor = new THREE.Group();
  propMount.add(rotor);
  let disc = null;
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.010, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, THRUST_Y, st(0.024));
    group.add(can);

    /* The spinner, a lathe about the mount's y, which is forward: its base
     * 3 mm behind the prop's plane, its tip on the station origin. */
    const prof = [new THREE.Vector2(0.0001, -0.003)];
    const m = lite ? 4 : 7;
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      prof.push(new THREE.Vector2(Math.max(0.0005, SPINNER_R * Math.sqrt(1 - u * u)), -0.003 + (PROP_S + 0.003) * (0.15 + 0.85 * u)));
    }
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 10 : 16), black);
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    rotor.add(spinner);

    const yoke = new THREE.Mesh(rod(new THREE.Vector3(0, -0.002, -HINGE_R - 0.002), new THREE.Vector3(0, -0.002, HINGE_R + 0.002), 0.0032, lite ? 6 : 8), metal);
    rotor.add(yoke);

    const bladeGeo = bladeGeometry(lite ? 4 : 7);
    for (const turn of [0, Math.PI]) {
      const arm = new THREE.Group();
      arm.rotation.y = turn;
      rotor.add(arm);
      const hinge = new THREE.Group();
      hinge.name = 'prop-hinge';
      hinge.position.set(0, -0.002, HINGE_R);
      arm.add(hinge);
      const blade = new THREE.Mesh(bladeGeo, propMat);
      blade.castShadow = shade;
      hinge.add(blade);
      folds.push(hinge);
    }
    blades.push(rotor);

    disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({ color: 0x5a6558, transparent: true, opacity: 0.12, depthWrite: false, fog }),
    );
    disc.renderOrder = 1;
    disc.name = 'prop-disc';
    propMount.add(disc);
    discs.push(disc);
  }
  for (let k = 1; k < 4; k += 1) {
    const none = new THREE.Group();
    group.add(none);
    blades.push(none);
    const noDisc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }));
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }

  /* Four lamps on the four slots the pose driver walks, cubcraft.js's
   * arrangement: sakura on the left tip and the nose, mint on the right tip
   * and the boom ahead of the fin. */
  const lampAt = [
    { p: wingAt(-0.93)(0.3, 1), front: true },
    { p: wingAt(0.93)(0.3, 1), front: false },
    { p: fusePoint(0.040, 0), front: true },
    { p: fusePoint(0.800, 0), front: false },
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
   * Pose the surfaces, cubcraft.js's convention: left aileron, right
   * aileron, elevator, rudder, radians; every axis points +x or +y, and a
   * negative turn about either carries an aft point up or to -x.
   */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
  }
  setSurfaces(0, 0, 0, 0);

  /*
   * The prop, from the motor's rate: open while it turns, folded when the
   * plant has stopped it, which it reads as exactly zero. The blades swing
   * a fifth of the way to where they are going each call, a few frames
   * each way; folded, the rotor eases round to the nearest angle that lays
   * the blades level along the nose's sides and stays there whatever the
   * shell adds to its spin. Returns the fold, 0 open to 1 folded.
   */
  let fold = 1;
  function setProp(omega) {
    const open = omega > 0;
    fold += ((open ? 0 : 1) - fold) * 0.2;
    if (Math.abs(fold - (open ? 0 : 1)) < 1e-3) {
      fold = open ? 0 : 1;
    }
    for (const h of folds) {
      h.rotation.x = fold * FOLD_ANGLE;
    }
    if (!open) {
      const park = Math.PI / 2 + Math.round((rotor.rotation.y - Math.PI / 2) / Math.PI) * Math.PI;
      rotor.rotation.y += (park - rotor.rotation.y) * 0.3;
    }
    disc.visible = open && fold < 0.05;
    return fold;
  }
  /* Built as it sits on the grass: folded, the blades level, no disc. */
  for (const h of folds) {
    h.rotation.x = FOLD_ANGLE;
  }
  rotor.rotation.y = Math.PI / 2;
  disc.visible = false;

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: GLIDER_PROP_SPIN,
    setSurfaces,
    setProp,
  };
}
