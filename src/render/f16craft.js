/*
 * f16craft.js: the Freewing F-16 Fighting Falcon V3's model, and nothing
 * else.
 *
 * Its own file for the reason cubcraft.js is: a jet is not a propeller
 * aeroplane. Freewing's F-16 is a 1/11.5 scale EPO foam model of the
 * General Dynamics F-16C on a 70 mm, 12 blade ducted fan: an ogive radome
 * with a pitot, a bubble canopy, the chin intake with the nose gear under
 * it, a cropped delta with the strakes blended into its root, one big fin,
 * all moving stabilators on booms beside the nozzle, two canted ventral
 * fins, and electric retracts.
 *
 * THE NUMBERS are off the maker's manual's dimensioned top view, measured:
 * the length, 1.306 m pitot tip to the fin's tip; the span, 0.878 m over
 * the missile rails; the fuselage's plan width by station; the wing, its
 * leading edge swept 38.9 deg from (0.620, 0.117) to the tip at (0.857,
 * 0.410) and its trailing edge straight across at 0.940; the stabilators,
 * the fin, the gear. The heights are ESTIMATED from the F-16's own
 * proportions, since the manual draws no side view with numbers on it.
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY, on the fuselage's centreline at
 * station 0.710. Stations are metres aft of the pitot's tip and turn into
 * the craft frame's z through st(); heights are metres over the CG and are
 * the craft frame's y as they are. The craft frame is Three.js's: x right,
 * y up, z aft.
 *
 * THE PAINT is Freewing's "modern three tone gray", the F-16C's FS 595
 * colours, in four regions (src/render/livery.js): `dark`, FS 36118
 * Gunship Gray, a band over the spine and the strakes and the wing roots;
 * `medium`, FS 36270, the fuselage's sides, the outer wing, the fin and
 * the stabilators; `light`, FS 36375 Light Ghost Gray, underneath and the
 * radome; and the gold tinted `canopy`.
 *
 * The contract with the shell is cubcraft.js's: group, discs, blades,
 * leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians,
 * ailerons and elevator positive trailing edge up and the rudder positive
 * trailing edge to the LEFT. The ailerons are the flaperons and roll only;
 * the elevator turns both stabilators together; the nose wheel turns with
 * the rudder by F16_NOSE_STEER, its front the way the rudder's trailing
 * edge goes. The "prop" is the fan's rotor, deep in the jet pipe where a
 * look up the nozzle finds it. On top of it, setGear(g): the retracts, 0
 * down and locked to 1 up, as sim_wing_gear reports them, p51craft.js's;
 * the mains fold forward and in to the fuselage's sides, the nose leg aft
 * into the intake's fairing.
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

const CG_S = 0.710;
const st = (s) => s - CG_S;
const DEG = Math.PI / 180;

/* The ends: the pitot's tip is station 0, the fin's tip the aft end. */
const LENGTH = 1.306;

/* The wing: the exposed root's leading edge, the tip's, the straight
 * trailing edge, the chord plane's height, and the flaperons' hinge. */
const ROOT_LE = [0.620, 0.117];
const TIP_LE = [0.857, 0.410];
const TE_S = 0.940;
const WING_Z = -0.005;
const HINGE_S = 0.890;
const FLAP_IN = 0.117;
const FLAP_OUT = 0.300;
/* Where the top's dark band gives way to the medium, spanwise. */
const DARK_OUT = 0.180;
/* The missile rail's outer edge, which is the span. */
const RAIL_OUT = 0.439;

/* The stabilators: root and tip leading edges and trailing edges, the
 * anhedral, and the pivot. */
const STAB_ROOT = 0.088;
const STAB_TIP = 0.245;
const STAB_ROOT_LE = 1.048;
const STAB_ROOT_TE = 1.258;
const STAB_TIP_LE = 1.192;
const STAB_TIP_TE = 1.256;
const STAB_ANHEDRAL = 10 * DEG;
const STAB_PIVOT_S = 1.160;
const STAB_Z = -0.010;

/* The fin: the root's leading edge on the spine and the tip, whose
 * trailing edge is the aircraft's aft end; the rudder the aft 60 mm. */
const FIN_ROOT_Z = 0.055;
const FIN_TIP_Z = 0.265;
const FIN_ROOT_LE = 1.000;
const FIN_ROOT_TE = 1.260;
const FIN_TIP_LE = 1.231;
const FIN_TIP_TE = LENGTH;
const RUDDER_BOTTOM = 0.075;
const RUDDER_TOP = 0.240;
const RUDDER_CHORD = 0.060;

/* The fan: 70 mm, a 69 mm rotor of 12 blades at station 0.95. */
const FAN_S = 0.950;
const FAN_R = 0.0345;
const FAN_BLADES = 12;
const PIPE_R = 0.036;

/* The gear. All three tyres' bottoms are 0.140 under the CG, so the
 * aircraft stands level. */
const MAIN_S = 0.762;
const MAIN_X = 0.1025;
const MAIN_Y = -0.110;
const MAIN_R = 0.030;
const MAIN_W = 0.018;
const NOSE_S = 0.414;
const NOSE_Y = -0.120;
const NOSE_R = 0.020;
const NOSE_W = 0.012;

/*
 * The fuselage: station, half width, top, bottom, the height of the
 * widest line (the chine, where the strakes and the wing join), and the
 * squareness of the upper and lower halves. The half width is the
 * manual's plan up to the strakes; from there it is the body inside them,
 * widening to the engine bay behind the wing and closing on the nozzle.
 * The bottom steps down behind the intake, where its duct fairs into the
 * belly.
 */
const FUSE = [
  [0.026, 0.0000, 0.0000, 0.0000, 0.000, 2.0, 2.0],
  [0.030, 0.0036, 0.0033, -0.0037, 0.000, 2.0, 2.0],
  [0.050, 0.0062, 0.0060, -0.0066, -0.0003, 2.0, 2.0],
  [0.074, 0.0100, 0.0098, -0.0106, -0.0006, 2.0, 2.0],
  [0.108, 0.0195, 0.0165, -0.0178, -0.0010, 2.05, 2.1],
  [0.141, 0.0270, 0.0228, -0.0230, -0.0020, 2.1, 2.3],
  [0.175, 0.0340, 0.0283, -0.0268, -0.0030, 2.2, 2.5],
  [0.208, 0.0400, 0.0330, -0.0292, -0.0040, 2.3, 2.7],
  [0.242, 0.0445, 0.0368, -0.0306, -0.0040, 2.4, 2.8],
  [0.276, 0.0485, 0.0398, -0.0312, -0.0050, 2.5, 2.9],
  [0.330, 0.0520, 0.0428, -0.0310, -0.0050, 2.5, 3.0],
  [0.400, 0.0550, 0.0442, -0.0300, -0.0050, 2.6, 3.0],
  [0.450, 0.0575, 0.0448, -0.0310, -0.0050, 2.6, 3.0],
  [0.520, 0.0615, 0.0450, -0.0420, -0.0050, 2.7, 2.6],
  [0.600, 0.0670, 0.0450, -0.0540, -0.0050, 2.8, 2.4],
  [0.680, 0.0710, 0.0450, -0.0590, -0.0050, 2.8, 2.4],
  [0.800, 0.0745, 0.0452, -0.0600, -0.0050, 2.8, 2.4],
  [0.900, 0.0745, 0.0460, -0.0590, -0.0040, 2.8, 2.4],
  [0.970, 0.0700, 0.0480, -0.0555, -0.0030, 2.7, 2.4],
  [1.040, 0.0640, 0.0500, -0.0510, -0.0020, 2.6, 2.4],
  [1.120, 0.0555, 0.0500, -0.0460, -0.0010, 2.4, 2.3],
  [1.180, 0.0495, 0.0480, -0.0430, 0.0000, 2.2, 2.2],
  [1.240, 0.0450, 0.0450, -0.0425, 0.0010, 2.05, 2.05],
];
const RADOME_S = 0.141;
const FUSE_STATIONS = [0.026, 0.029, 0.034, 0.042, 0.052, 0.066, 0.084, 0.108, 0.126, RADOME_S, 0.165,
  0.192, 0.220, 0.250, 0.276, 0.310, 0.350, 0.400, 0.440, 0.480, 0.520, 0.570, 0.620, 0.690, 0.760, 0.840,
  0.910, 0.970, 1.030, 1.090, 1.150, 1.200, 1.240];
const FUSE_STATIONS_LITE = [0.026, 0.034, 0.052, 0.078, 0.110, RADOME_S, 0.175, 0.242, 0.330, 0.430, 0.520,
  0.600, 0.700, 0.820, 0.930, 1.030, 1.130, 1.240];

/*
 * The manual's plan outline, station and half width, from the radome to
 * the strakes' junction with the wing: the leading edge of the strakes is
 * this line, so a span station's strake leading edge is read back off it.
 */
const PLAN = [
  [0.024, 0.001], [0.074, 0.008], [0.108, 0.021], [0.141, 0.029], [0.175, 0.036], [0.208, 0.041],
  [0.242, 0.045], [0.276, 0.050], [0.309, 0.056], [0.343, 0.061], [0.377, 0.065], [0.410, 0.068],
  [0.444, 0.075], [0.477, 0.083], [0.511, 0.092], [0.545, 0.103], [0.578, 0.112], [0.612, 0.115],
  ROOT_LE,
];

/* The intake duct: station, half width, top and bottom. The mouth's
 * bottom lip is at 0.430 and its top edge raked back INTAKE_RAKE. */
const DUCT = [
  [0.430, 0.035, -0.025, -0.075],
  [0.470, 0.037, -0.026, -0.0745],
  [0.520, 0.041, -0.028, -0.073],
  [0.580, 0.046, -0.030, -0.070],
  [0.640, 0.050, -0.032, -0.066],
  [0.700, 0.052, -0.034, -0.062],
  [0.760, 0.050, -0.036, -0.057],
];
const INTAKE_S = 0.430;
const INTAKE_RAKE = 0.022;

/*
 * Monotone cubic interpolation (Fritsch and Carlson) through a column of
 * a table: smooth like a spline, and it never overshoots between rows, so
 * a fuselage drawn through it has no ripples.
 */
function pchip(xs, ys) {
  const n = xs.length;
  const h = [];
  const d = [];
  for (let i = 0; i + 1 < n; i += 1) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i + 1 < n; i += 1) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    const t0 = Math.min(Math.max(x, xs[0]), xs[n - 1]);
    let i = 0;
    while (i + 2 < n && t0 > xs[i + 1]) {
      i += 1;
    }
    const t = (t0 - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
      + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
function table(rows) {
  const xs = rows.map((r) => r[0]);
  return rows[0].slice(1).map((_, j) => pchip(xs, rows.map((r) => r[j + 1])));
}
function lerpTable(rows, x) {
  const t0 = Math.min(Math.max(x, rows[0][0]), rows[rows.length - 1][0]);
  let i = 0;
  while (i + 2 < rows.length && t0 > rows[i + 1][0]) {
    i += 1;
  }
  const u = (t0 - rows[i][0]) / (rows[i + 1][0] - rows[i][0]);
  return rows[i].map((v, j) => v + (rows[i + 1][j] - v) * u);
}

const FUSE_COLS = table(FUSE);
function fuseAt(s) {
  const [w, top, bottom, yw, eT, eB] = FUSE_COLS.map((f) => f(s));
  return { w: Math.max(0, w), top, bottom, yw, eT, eB };
}
/* A point on the fuselage's skin at station s, angle a from the top
 * towards +x: a superellipse over the chine and another under it. */
function fusePoint(s, a) {
  const { w, top, bottom, yw, eT, eB } = fuseAt(s);
  const sn = Math.sin(a);
  const cs = Math.cos(a);
  const e = cs >= 0 ? eT : eB;
  const h = cs >= 0 ? top - yw : yw - bottom;
  return new THREE.Vector3(
    Math.sign(sn) * w * Math.abs(sn) ** (2 / e),
    yw + Math.sign(cs) * Math.max(0, h) * Math.abs(cs) ** (2 / e),
    st(s),
  );
}
/* The fuselage's half width at height y on its upper half. */
function fuseHalfWidthAt(s, y) {
  const { w, top, yw, eT } = fuseAt(s);
  const r = Math.min(1, Math.max(0, (y - yw) / Math.max(1e-6, top - yw)));
  return w * (1 - r ** eT) ** (1 / eT);
}

const DUCT_COLS = table(DUCT);
function ductAt(s) {
  const [w, top, bottom] = DUCT_COLS.map((f) => f(s));
  return { w, top, bottom, yc: (top + bottom) / 2, h: (top - bottom) / 2 };
}
/* A point on the duct's section at station s, angle a from the top: flat
 * topped where it meets the fuselage, round underneath. k scales it about
 * its middle (the lip's inside), and rake moves the point aft by that
 * much times its height up the section, which is the mouth's slant. */
function ductPoint(s, a, k = 1, rake = 0) {
  const { w, h, yc, bottom, top } = ductAt(s);
  const sn = Math.sin(a);
  const cs = Math.cos(a);
  const e = cs >= 0 ? 6 : 2.4;
  const x = k * Math.sign(sn) * w * Math.abs(sn) ** (2 / e);
  const y = yc + k * Math.sign(cs) * h * Math.abs(cs) ** (2 / e);
  return new THREE.Vector3(x, y, st(s + rake * (y - bottom) / (top - bottom)));
}

/* The strakes' and wing's leading edge station at span station y. */
function leadingEdge(y) {
  if (y >= ROOT_LE[1]) {
    return ROOT_LE[0] + (y - ROOT_LE[1]) * (TIP_LE[0] - ROOT_LE[0]) / (TIP_LE[1] - ROOT_LE[1]);
  }
  for (let i = 0; i + 1 < PLAN.length; i += 1) {
    const [s0, y0] = PLAN[i];
    const [s1, y1] = PLAN[i + 1];
    if (y <= y1) {
      return s0 + (s1 - s0) * Math.max(0, (y - y0) / (y1 - y0));
    }
  }
  throw new Error(`f16craft: span station ${y} is off the plan`);
}
/* The wing's whole thickness at span station y: NACA 64A204 is 4 percent,
 * 17 mm at the exposed root and 4 mm at the tip; inboard of the root the
 * strakes thin toward their leading edge. */
function wingThick(y) {
  if (y >= ROOT_LE[1]) {
    return 0.017 + (0.004 - 0.017) * (y - ROOT_LE[1]) / (TIP_LE[1] - ROOT_LE[1]);
  }
  return 0.017 * Math.min(1, Math.max(0.35, (y - 0.045) / (ROOT_LE[1] - 0.045)));
}

/* A NACA four digit thickness with the trailing edge closed, over its own
 * maximum, so a surface's thickness is given whole and its shape by this. */
const nacaClosed = (t) => 0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4;
const NACA_MAX = (() => {
  let m = 0;
  for (let i = 0; i <= 200; i += 1) {
    m = Math.max(m, nacaClosed(i / 200));
  }
  return m;
})();
const shape = (t) => Math.max(0, nacaClosed(Math.min(1, Math.max(0, t)))) / NACA_MAX;

/*
 * Geometry. Every surface below is a grid of rows of points, indexed so
 * its normals come out smooth, and faced by checking its triangles against
 * an outward direction rather than by reasoning about winding.
 */
function faceOut(geo, out) {
  const pos = geo.getAttribute('position');
  const idx = geo.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    c.fromBufferAttribute(pos, idx[i + 2]);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const m = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3);
    sum += n.dot(out(m));
  }
  if (sum < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  geo.computeVertexNormals();
  return geo;
}
/* A grid through rows of equal length; closed wraps each row round. */
function grid(rows, closed, out) {
  const n = rows[0].length;
  const pos = [];
  for (const row of rows) {
    for (const p of row) {
      pos.push(p.x, p.y, p.z);
    }
  }
  const idx = [];
  const cols = closed ? n : n - 1;
  for (let r = 0; r + 1 < rows.length; r += 1) {
    for (let j = 0; j < cols; j += 1) {
      const k = (j + 1) % n;
      const a = r * n;
      const b = (r + 1) * n;
      idx.push(a + j, a + k, b + j, a + k, b + k, b + j);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return faceOut(geo, out);
}
/* A flat fan closing a ring about its middle. */
function cap(ring, out) {
  const c = new THREE.Vector3();
  for (const p of ring) {
    c.add(p);
  }
  c.multiplyScalar(1 / ring.length);
  const pos = [c.x, c.y, c.z];
  for (const p of ring) {
    pos.push(p.x, p.y, p.z);
  }
  const idx = [];
  for (let j = 0; j < ring.length; j += 1) {
    idx.push(0, 1 + j, 1 + ((j + 1) % ring.length));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return faceOut(geo, () => out);
}
/* The triangles `keep` names out of an indexed geometry, with only the
 * vertices they use, normals and all. */
function subset(geo, keep) {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const idx = geo.index.array;
  const map = new Map();
  const p = [];
  const n = [];
  const out = [];
  for (const t of keep) {
    for (let k = 0; k < 3; k += 1) {
      const v = idx[t * 3 + k];
      if (!map.has(v)) {
        map.set(v, p.length / 3);
        p.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        n.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
      }
      out.push(map.get(v));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setIndex(out);
  return g;
}

/* Cosine spaced fractions from f0 to f1, n of them. */
function spaced(f0, f1, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(f0 + (f1 - f0) * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1))));
  }
  return out;
}

/*
 * A thin lifting surface: rows along its span, each a leading and a
 * trailing edge point in the craft frame, its whole thickness t there, and
 * the chord fractions f0 to f1 of it drawn (a control surface or the part
 * in front of one). `across` is the direction the thickness is laid along.
 * Out come the two skins and the walls where the drawn part is cut from the
 * whole, and the end caps, each its own geometry so each can be painted.
 */
function plate(rows, n, across) {
  const at = (r, f, side) => new THREE.Vector3().lerpVectors(r.le, r.te, f)
    .addScaledVector(across, side * (r.t / 2) * shape(f) + side * 1e-5);
  const skin = (side) => rows.map((r) => spaced(r.f0 ?? 0, r.f1 ?? 1, n).map((f) => at(r, f, side)));
  const top = skin(1);
  const bottom = skin(-1);
  const span = new THREE.Vector3().subVectors(rows[rows.length - 1].le, rows[0].le).normalize();
  const chord = new THREE.Vector3().subVectors(rows[0].te, rows[0].le).normalize();
  const neg = across.clone().negate();
  const wallAt = (j, dir) => grid([top.map((row) => row[j]), bottom.map((row) => row[j])], false, () => dir);
  const capAt = (i, dir) => grid([top[i], bottom[i]], false, () => dir);
  return {
    top: grid(top, false, () => across),
    bottom: grid(bottom, false, () => neg),
    front: rows.some((r) => (r.f0 ?? 0) > 0) ? wallAt(0, chord.clone().negate()) : null,
    back: rows.some((r) => (r.f1 ?? 1) < 1) ? wallAt(n - 1, chord) : null,
    first: capAt(0, span.clone().negate()),
    last: capAt(rows.length - 1, span),
  };
}

/* A ring loft about an axis along z: rows of rings, each ring from a
 * function of the angle. */
function ringRows(stations, n, pointAt) {
  return stations.map((s) => {
    const ring = [];
    for (let j = 0; j < n; j += 1) {
      ring.push(pointAt(s, (2 * Math.PI * j) / n));
    }
    return ring;
  });
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

/* mergeGeometries wants one attribute set, all indexed; the lofts carry
 * no uv. */
function merged(parts) {
  const list = parts.filter(Boolean);
  for (const g of list) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
    if (g.index === null) {
      g.setIndex([...Array(g.getAttribute('position').count).keys()]);
    }
  }
  const geo = mergeGeometries(list, false);
  if (!geo) {
    throw new Error('f16craft: merge failed');
  }
  return geo;
}

/*
 * The fuselage in one closed skin, the radome's rows and three angle
 * bands round the rest cut out of it for the paint: dark over the top
 * within DARK_A of it, medium down the sides to MEDIUM_A, light under
 * that. The normals are the whole skin's, so no seam shades at a band.
 * DARK_A reaches nearly to the chine because any medium above it shows
 * from overhead as a pale line between the spine and the dark strakes.
 */
const DARK_A = 80 * DEG;
const MEDIUM_A = 100 * DEG;
function fuseSkin(lite) {
  const around = lite ? 24 : 36;
  const ss = lite ? FUSE_STATIONS_LITE : FUSE_STATIONS;
  const rows = ringRows(ss, around, fusePoint);
  const whole = grid(rows, true, (p) => {
    const at = fuseAt(p.z + CG_S);
    return new THREE.Vector3(p.x, p.y - at.yw, 0);
  });
  /* The band a column of cells is in, by the angle at its middle. */
  const bandOf = (j) => {
    const a = (2 * Math.PI * (j + 0.5)) / around;
    const off = Math.min(a, 2 * Math.PI - a);
    return off < DARK_A ? 'dark' : off < MEDIUM_A ? 'medium' : 'light';
  };
  const cells = { dark: [], medium: [], light: [] };
  for (let r = 0; r + 1 < ss.length; r += 1) {
    for (let j = 0; j < around; j += 1) {
      const band = ss[r] < RADOME_S ? 'light' : bandOf(j);
      const t = (r * around + j) * 2;
      cells[band].push(t, t + 1);
    }
  }
  return {
    whole,
    dark: subset(whole, cells.dark),
    medium: subset(whole, cells.medium),
    light: subset(whole, cells.light),
  };
}

/* The pitot probe, a thin tube on a cone out of the radome's tip. */
function pitotGeometry(lite) {
  const n = lite ? 6 : 10;
  const ss = [0.000, 0.0025, 0.020, 0.024, 0.032];
  const rs = [0.000, 0.0009, 0.0009, 0.0015, 0.0022];
  const rows = ss.map((s, i) => {
    const ring = [];
    for (let j = 0; j < n; j += 1) {
      const a = (2 * Math.PI * j) / n;
      ring.push(new THREE.Vector3(rs[i] * Math.sin(a), rs[i] * Math.cos(a), st(s)));
    }
    return ring;
  });
  return grid(rows, true, (p) => new THREE.Vector3(p.x, p.y, 0));
}

/*
 * The canopy: a bubble on the fuselage's top from the windscreen's foot
 * to where it fairs into the spine, highest over the seat. Each section is
 * an arch standing on a sill a little under the fuselage's top, so its
 * edges are buried in the skin. The windscreen rakes up at 35 degrees and
 * the back runs down into the spine tangent to it.
 */
const CANOPY_FRONT = 0.185;
const CANOPY_PEAK = 0.300;
const CANOPY_BACK = 0.425;
const CANOPY_TOP = 0.075;
function canopyAt(s) {
  const sill = fuseAt(s).top - 0.006;
  let bump;
  let wide;
  if (s <= CANOPY_PEAK) {
    const u = Math.min(1, Math.max(0, (s - CANOPY_FRONT) / (CANOPY_PEAK - CANOPY_FRONT)));
    bump = 1 - (1 - u) ** 2;
    wide = Math.sqrt(Math.max(0, 1 - (1 - u) ** 2));
  } else {
    const u = Math.min(1, Math.max(0, (s - CANOPY_PEAK) / (CANOPY_BACK - CANOPY_PEAK)));
    bump = Math.cos((u * Math.PI) / 2) ** 1.3;
    wide = Math.cos((u * Math.PI) / 2) ** 0.7;
  }
  const w = Math.min(0.029 * wide, 0.92 * fuseHalfWidthAt(s, sill));
  const peak = fuseAt(s).top + (CANOPY_TOP - fuseAt(CANOPY_PEAK).top) * bump;
  return { sill, w, h: Math.max(0, peak - sill) };
}
function canopyGeometry(lite) {
  const ns = lite ? 9 : 14;
  const na = lite ? 9 : 13;
  const rows = [];
  for (let i = 0; i < ns; i += 1) {
    const u = i / (ns - 1);
    const s = CANOPY_FRONT + (CANOPY_BACK - CANOPY_FRONT) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    const { sill, w, h } = canopyAt(s);
    const row = [];
    for (let j = 0; j < na; j += 1) {
      const phi = -Math.PI / 2 + (Math.PI * j) / (na - 1);
      const c = Math.cos(phi);
      row.push(new THREE.Vector3(w * Math.sin(phi), sill + h * Math.abs(c) ** (2 / 2.3), st(s)));
    }
    rows.push(row);
  }
  return grid(rows, false, (p) => new THREE.Vector3(p.x, p.y - (fuseAt(p.z + CG_S).top - 0.02), 0));
}

/*
 * The intake: the lip and the duct's fairing under the fuselage, from the
 * mouth back into the belly, and the black inside of the mouth. The lip
 * rolls in from the fairing's outside over its front to the inside, the
 * top edge raked back from the bottom lip.
 */
function intakeGeometry(lite) {
  const n = lite ? 16 : 24;
  const lipIn = 0.84;
  const rows = [
    (a) => ductPoint(INTAKE_S + 0.010, a, lipIn, INTAKE_RAKE),
    (a) => ductPoint(INTAKE_S - 0.001, a, 0.93, INTAKE_RAKE),
    (a) => ductPoint(INTAKE_S + 0.006, a, 1, INTAKE_RAKE),
  ];
  const aft = lite ? [0.470, 0.580, 0.700, 0.760] : [0.450, 0.470, 0.520, 0.580, 0.640, 0.700, 0.760];
  for (const s of aft) {
    const rake = s < 0.46 ? INTAKE_RAKE * 0.6 : 0;
    rows.push((a) => ductPoint(s, a, 1, rake));
  }
  const ring = (f) => {
    const out = [];
    for (let j = 0; j < n; j += 1) {
      out.push(f((2 * Math.PI * j) / n));
    }
    return out;
  };
  const outward = (p) => new THREE.Vector3(p.x, p.y - ductAt(p.z + CG_S).yc, 0);
  /* The lip's first ring is on the inside, where outward points in, so
   * the whole is faced by the fairing's rows, which are the most of it. */
  const outer = grid(rows.map(ring), true, outward);
  /* Shallow and raked with the mouth: the nose leg folds into the
   * fairing just behind it. */
  const deep = 0.455;
  const tunnelRows = [
    ring((a) => ductPoint(INTAKE_S + 0.010, a, lipIn, INTAKE_RAKE)),
    ring((a) => ductPoint(deep, a, lipIn * 0.95, INTAKE_RAKE)),
  ];
  const tunnel = grid(tunnelRows, true, (p) => outward(p).negate());
  const back = cap(tunnelRows[1], new THREE.Vector3(0, 0, -1));
  return { outer, inside: merged([tunnel, back]) };
}

/*
 * The booms each side of the engine bay behind the wing, where the
 * stabilators pivot and the speed brakes sit at the aft end: flat, their
 * outer edges at the stabilators' roots.
 */
const BOOM = [
  [0.900, 0.004, 0.003],
  [0.940, 0.022, 0.011],
  [1.100, 0.022, 0.011],
  [1.240, 0.021, 0.010],
  [1.272, 0.018, 0.008],
  [1.285, 0.009, 0.004],
];
const BOOM_X = STAB_ROOT - 0.022;
const BOOM_Y = -0.008;
function boomGeometry(sign, lite) {
  const n = lite ? 12 : 20;
  const rows = BOOM.map(([s, w, h]) => {
    const ring = [];
    for (let j = 0; j < n; j += 1) {
      const a = (2 * Math.PI * j) / n;
      const sn = Math.sin(a);
      const cs = Math.cos(a);
      ring.push(new THREE.Vector3(
        sign * BOOM_X + Math.sign(sn) * w * Math.abs(sn) ** 0.8,
        BOOM_Y + Math.sign(cs) * h * Math.abs(cs) ** 0.8,
        st(s),
      ));
    }
    return ring;
  });
  const out = (p) => new THREE.Vector3(p.x - sign * BOOM_X, p.y - BOOM_Y, 0);
  const whole = grid(rows, true, out);
  const top = [];
  const bottom = [];
  for (let r = 0; r + 1 < rows.length; r += 1) {
    for (let j = 0; j < n; j += 1) {
      const a = (2 * Math.PI * (j + 0.5)) / n;
      const t = (r * n + j) * 2;
      (Math.cos(a) > 0 ? top : bottom).push(t, t + 1);
    }
  }
  const end = cap(rows[rows.length - 1], new THREE.Vector3(0, 0, 1));
  return { top: subset(whole, top), bottom: merged([subset(whole, bottom), end]) };
}

/* The dorsal fairing at the fin's root, which carries it aft over the
 * nozzle: station, half width, top, bottom. */
const DORSAL = [
  [0.960, 0.002, 0.0462, 0.036],
  [1.000, 0.010, 0.0555, 0.034],
  [1.100, 0.013, 0.0570, 0.034],
  [1.220, 0.013, 0.0570, 0.036],
  [1.265, 0.011, 0.0555, 0.040],
  [1.278, 0.004, 0.0500, 0.043],
];
function dorsalGeometry(lite) {
  const n = lite ? 10 : 16;
  const rows = DORSAL.map(([s, w, top, bottom]) => {
    const yc = (top + bottom) / 2;
    const h = (top - bottom) / 2;
    const ring = [];
    for (let j = 0; j < n; j += 1) {
      const a = (2 * Math.PI * j) / n;
      ring.push(new THREE.Vector3(w * Math.sin(a), yc + h * Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.8, st(s)));
    }
    return ring;
  });
  const whole = grid(rows, true, (p) => new THREE.Vector3(p.x, p.y - 0.045, 0));
  return merged([whole, cap(rows[rows.length - 1], new THREE.Vector3(0, 0, 1))]);
}

/*
 * The nozzle: twelve petals round a convergent cone from the fuselage's
 * end to the exit, the ridges drawn by alternating the ring's radius; its
 * lip turning in to the jet pipe, a black tube up to the fan.
 */
const NOZZLE_S = 1.232;
const NOZZLE_EXIT_S = 1.300;
const NOZZLE_EXIT_R = 0.0375;
function nozzleGeometry(lite) {
  const n = lite ? 24 : 36;
  /* Twelve petals: the ring's vertex on each seam between two is pulled
   * in, so the seams show as grooves. */
  const perPetal = n / 12;
  const ringAt = (s, r, ridged) => {
    const ring = [];
    for (let j = 0; j < n; j += 1) {
      const a = (2 * Math.PI * j) / n;
      const rr = ridged && j % perPetal === 0 ? r * 0.972 : r;
      ring.push(new THREE.Vector3(rr * Math.sin(a), rr * Math.cos(a), st(s)));
    }
    return ring;
  };
  const outRows = [
    ringAt(NOZZLE_S, 0.0445, false),
    ringAt(1.245, 0.0442, false),
    ringAt(1.255, 0.0432, true),
    ringAt(1.278, 0.0408, true),
    ringAt(NOZZLE_EXIT_S, NOZZLE_EXIT_R + 0.0012, true),
    ringAt(NOZZLE_EXIT_S + 0.001, NOZZLE_EXIT_R - 0.0008, false),
  ];
  const radial = (p) => new THREE.Vector3(p.x, p.y, 0);
  const metal = grid(outRows, true, radial);
  const pipeRows = [
    ringAt(NOZZLE_EXIT_S + 0.001, NOZZLE_EXIT_R - 0.0008, false),
    ringAt(1.280, PIPE_R, false),
    ringAt(FAN_S - 0.03, PIPE_R, false),
  ];
  const pipe = grid(pipeRows, true, (p) => radial(p).negate());
  const back = cap(pipeRows[2], new THREE.Vector3(0, 0, 1));
  return { metal, pipe: merged([pipe, back]) };
}

/* The missile rail on a wing tip: a slim box along the tip chord, its
 * nose tapered, its outer face the span. */
function railGeometry(sign, lite) {
  const n = lite ? 8 : 12;
  const hw = (RAIL_OUT - TIP_LE[1] - 0.0015) / 2;
  const cx = sign * (RAIL_OUT - hw);
  const rows = [[0.790, 0.25], [0.803, 0.75], [0.815, 1], [0.945, 1], [0.950, 0.6]].map(([s, k]) => {
    const ring = [];
    for (let j = 0; j < n; j += 1) {
      const a = (2 * Math.PI * j) / n;
      const sn = Math.sin(a);
      const cs = Math.cos(a);
      /* The outer face stays the full width, so the span is held along it. */
      const kx = sign * sn > 0 ? 1 : k;
      ring.push(new THREE.Vector3(
        cx + kx * hw * Math.sign(sn) * Math.abs(sn) ** 0.5,
        WING_Z + k * 0.0055 * Math.sign(cs) * Math.abs(cs) ** 0.5,
        st(s),
      ));
    }
    return ring;
  });
  const out = (p) => new THREE.Vector3(p.x - cx, p.y - WING_Z, 0);
  return merged([
    grid(rows, true, out),
    cap(rows[0], new THREE.Vector3(0, 0, -1)),
    cap(rows[rows.length - 1], new THREE.Vector3(0, 0, 1)),
  ]);
}

/* A wing's rows from span station y0 to y1 on the side sign picks, cut at
 * the flaperons' hinge or not. */
function wingRows(ys, sign, cut) {
  return ys.map((y) => {
    const le = leadingEdge(y);
    return {
      le: new THREE.Vector3(sign * y, WING_Z, st(le)),
      te: new THREE.Vector3(sign * y, WING_Z, st(TE_S)),
      t: wingThick(y),
      f0: 0,
      f1: cut ? (HINGE_S - le) / (TE_S - le) : 1,
    };
  });
}
const STRAKE_YS = [0.045, 0.050, 0.056, 0.061, 0.065, 0.068, 0.075, 0.083, 0.092, 0.103, 0.112, 0.115, ROOT_LE[1]];
const STRAKE_YS_LITE = [0.045, 0.056, 0.068, 0.083, 0.103, ROOT_LE[1]];

/* The fin's leading and trailing edges and the rudder's hinge at height z. */
const finLE = (z) => FIN_ROOT_LE + (z - FIN_ROOT_Z) * (FIN_TIP_LE - FIN_ROOT_LE) / (FIN_TIP_Z - FIN_ROOT_Z);
const finTE = (z) => FIN_ROOT_TE + (z - FIN_ROOT_Z) * (FIN_TIP_TE - FIN_ROOT_TE) / (FIN_TIP_Z - FIN_ROOT_Z);
const finThick = (z) => 0.009 + (0.003 - 0.009) * (z - FIN_ROOT_Z) / (FIN_TIP_Z - FIN_ROOT_Z);
const rudderHinge = (z) => finTE(z) - RUDDER_CHORD;
function finRows(zs, cut, surface = false) {
  return zs.map((z) => {
    const le = finLE(z);
    const te = finTE(z);
    const f = (rudderHinge(z) - le) / (te - le);
    return {
      le: new THREE.Vector3(0, z, st(le)),
      te: new THREE.Vector3(0, z, st(te)),
      t: finThick(z),
      f0: surface ? f + 0.002 : 0,
      f1: cut ? f : 1,
    };
  });
}

/* The stabilator's chord line height at span station y, with its
 * anhedral, and its rows on the side sign picks. */
const stabZ = (y) => STAB_Z - (y - STAB_ROOT) * Math.tan(STAB_ANHEDRAL);
function stabRows(sign) {
  return [[STAB_ROOT + 0.0008, STAB_ROOT_LE, STAB_ROOT_TE, 0.0084], [STAB_TIP, STAB_TIP_LE, STAB_TIP_TE, 0.003]]
    .map(([y, le, te, t]) => {
      const f = (y - STAB_ROOT) / (STAB_TIP - STAB_ROOT);
      const s0 = STAB_ROOT_LE + (STAB_TIP_LE - STAB_ROOT_LE) * f;
      return {
        le: new THREE.Vector3(sign * y, stabZ(y), st(Math.max(le, s0))),
        te: new THREE.Vector3(sign * y, stabZ(y), st(te)),
        t,
      };
    });
}

/*
 * A hinged surface, cubcraft.js's: the parts moved so the pivot sits on
 * the hinge and turns about the hinge's own axis, pointing +x for a
 * horizontal hinge and +y for a vertical one, so a NEGATIVE turn lifts the
 * trailing edge or swings it left.
 */
function hinged(parts, a, b, shade) {
  const axis = new THREE.Vector3().subVectors(b, a).normalize();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  for (const [geo, material, name] of parts) {
    geo.translate(-mid.x, -mid.y, -mid.z);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shade;
    if (name) {
      mesh.name = name;
    }
    pivot.add(mesh);
  }
  return { pivot, axis };
}

/*
 * The wheels' drawn lowest points in the level craft frame. The three
 * tyres' bottoms are one height, so the aircraft rests level on them with
 * its CG that height over the ground.
 */
const MAIN_AXLE = [MAIN_X, MAIN_Y, st(MAIN_S)];
const NOSE_AXLE = [0, NOSE_Y, st(NOSE_S)];
const REST_PITCH = Math.atan2((MAIN_AXLE[1] - MAIN_R) - (NOSE_AXLE[1] - NOSE_R), MAIN_AXLE[2] - NOSE_AXLE[2]);
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
 * Exported numbers, in KADET_DIMS's shape, so the airframe table and the
 * scale check are held against the drawn machine: the pitot's tip reaches
 * furthest from the CG, 0.710 m, further than the rails' 0.439 m span; the
 * fin's tip is the top and the tyres the bottom.
 */
const UP = FIN_TIP_Z;
const DOWN = -Math.min(MAIN_AXLE[1] - MAIN_R, NOSE_AXLE[1] - NOSE_R);
const REACH = Math.max(-st(0), st(LENGTH), Math.hypot(RAIL_OUT, st(0.950)), Math.hypot(STAB_TIP, st(STAB_TIP_TE)));
/* The mean aerodynamic chord of the trapezoid from the centreline to the
 * tip, the root its theoretical 0.4145 m at the apex. */
const ROOT_CHORD = TE_S - (ROOT_LE[0] - ROOT_LE[1] * (TIP_LE[0] - ROOT_LE[0]) / (TIP_LE[1] - ROOT_LE[1]));
const TIP_CHORD = TE_S - TIP_LE[0];
const TAPER = TIP_CHORD / ROOT_CHORD;
const MAC = (2 / 3) * ROOT_CHORD * (1 + TAPER + TAPER * TAPER) / (1 + TAPER);
export const F16_DIMS = {
  span: 2 * RAIL_OUT,
  chord: MAC,
  stabSpan: 2 * STAB_TIP,
  finHeight: FIN_TIP_Z - FIN_ROOT_Z,
  gearTrack: 2 * MAIN_X,
  propR: FAN_R,
  thrustY: 0,
  noseZ: st(0),
  tailZ: st(LENGTH),
  length: LENGTH,
  reach: REACH,
  vHalfUp: UP,
  vHalfDown: DOWN,
  wing: {
    le: st(ROOT_LE[0]),
    te: st(TE_S),
    half: TIP_LE[1],
    rootY: WING_Z,
    tipY: WING_Z,
    rootChord: ROOT_CHORD,
    tipChord: TIP_CHORD,
    sweepDeg: Math.atan2(TIP_LE[0] - ROOT_LE[0], TIP_LE[1] - ROOT_LE[1]) / DEG,
  },
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: MAIN_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: MAIN_W },
    nose: { axle: [...NOSE_AXLE], r: NOSE_R, width: NOSE_W },
  },
  contact: {
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    nose: [0, NOSE_AXLE[1] - NOSE_R, NOSE_AXLE[2]],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: REST_PITCH / DEG,
    cgHeight: REST_CG_HEIGHT,
    contact: {
      mainLeft: restContact([-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], MAIN_R),
      mainRight: restContact(MAIN_AXLE, MAIN_R),
      nose: restContact(NOSE_AXLE, NOSE_R),
    },
  },
  dims: {
    arm: 0,
    propR: FAN_R,
    hullR: REACH,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: LENGTH,
    bodyWidth: 2 * RAIL_OUT,
    bodyHeight: UP + DOWN,
  },
};

/* The FPV camera in the cockpit where the pilot's head would be, 0.41 m
 * ahead of the CG and 58 mm over it, under the canopy. */
const CAM_S = 0.300;
export const F16_MOUNT_FORWARD = -st(CAM_S);
export const F16_MOUNT_UP = 0.058;

/* The fan turns clockwise seen from behind, as a tractor seen from the
 * cockpit does, on the prop mount's convention. */
export const F16_PROP_SPIN = [1, 0, 0, 0];

/* How far the nose wheel turns per radian of rudder. */
export const F16_NOSE_STEER = 0.6;

export function buildF16Craft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'f16-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const seg = lite ? 8 : 14;
  const rodSeg = lite ? 5 : 8;
  const ink = 0x0e1114;

  /* The scheme by region (src/render/livery.js), the moving surfaces a
   * shade darker so their hinge lines read. */
  const coat = paintRegions();
  const paint = (hex) => cel({ color: hex, rim: 0.28, spec: 0.22, specWidth: 0.014 });
  const dark = coat.base('dark', paint(0x4d5357));
  const medium = coat.base('medium', paint(0x7f878c));
  const light = coat.base('light', paint(0xa9b0b4));
  const canopyMat = coat.base('canopy', cel({ color: 0x8a7440, rim: 0.42, spec: 0.85, specWidth: 0.030, specColor: 0xfff2cc }));
  const mediumDim = coat.shade('medium', paint(0x767e83));
  const lightDim = coat.shade('light', paint(0x9ea5a9));
  const black = cel({ color: 0x131517, rim: 0.12, spec: 0.05 });
  const nozzleMetal = cel({ color: 0x55585c, rim: 0.30, spec: 0.60, specWidth: 0.020 });
  const metal = cel({ color: 0xc2c6ca, rim: 0.30, spec: 0.75, specWidth: 0.022 });
  const strut = cel({ color: 0xdcdfe1, rim: 0.28, spec: 0.40, specWidth: 0.018 });
  const tyreMat = cel({ color: 0x1b1b1d, rim: 0.30, spec: 0.20 });
  const stator = cel({ color: 0x3a3d40, rim: 0.24, spec: 0.45, specWidth: 0.02 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });

  /* The measurement box, hidden, on the contract with verify's check 15 (tests/lib/checks.js). */
  if (opts.measure) {
    const d = F16_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), light);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  const darkParts = [];
  const mediumParts = [];
  const lightParts = [];
  const blackParts = [];

  /* The fuselage in its three bands; the outline is one hull round the
   * whole skin, the intake's fairing and the canopy, taken off a mesh
   * that is never drawn so that it scales about the fuselage's middle. */
  const skin = fuseSkin(lite);
  darkParts.push(skin.dark);
  mediumParts.push(skin.medium);
  lightParts.push(skin.light);
  const intake = intakeGeometry(lite);
  lightParts.push(intake.outer);
  blackParts.push(intake.inside);
  const canopyGeo = canopyGeometry(lite);
  if (inkOn) {
    const inkGeo = merged([skin.whole.clone(), intake.outer.clone(), canopyGeo.clone()]);
    inkGeo.computeBoundingBox();
    const c = inkGeo.boundingBox.getCenter(new THREE.Vector3());
    inkGeo.translate(-c.x, -c.y, -c.z);
    const holder = new THREE.Mesh(inkGeo, dark);
    outlineHull(holder, 1.012, ink);
    const hull = holder.children[0];
    holder.remove(hull);
    hull.position.copy(c);
    hull.name = 'f16-outline';
    group.add(hull);
  }

  /* The dorsal fairing on the spine under the fin. */
  darkParts.push(dorsalGeometry(lite));

  /* The booms, medium over and light under. */
  for (const sign of [-1, 1]) {
    const boom = boomGeometry(sign, lite);
    mediumParts.push(boom.top);
    lightParts.push(boom.bottom);
  }

  /*
   * The wing each side, in four spans: the strakes to the exposed root,
   * the root to the dark band's end and on to the flaperon's end, both cut
   * at its hinge, and the rest to the tip. Dark on top inboard, medium
   * outboard, light underneath.
   */
  const n = lite ? 7 : 12;
  const up = new THREE.Vector3(0, 1, 0);
  for (const sign of [-1, 1]) {
    const pieces = [
      { ys: lite ? STRAKE_YS_LITE : STRAKE_YS, cut: false, top: darkParts, ends: false },
      { ys: [FLAP_IN, DARK_OUT], cut: true, top: darkParts, ends: false },
      { ys: [DARK_OUT, 0.240, FLAP_OUT], cut: true, top: mediumParts, ends: false },
      { ys: [FLAP_OUT, 0.355, TIP_LE[1]], cut: false, top: mediumParts, ends: true },
    ];
    for (const p of pieces) {
      const w = plate(wingRows(p.ys, sign, p.cut), n, up);
      p.top.push(w.top);
      lightParts.push(w.bottom);
      if (w.back) {
        lightParts.push(w.back);
      }
      if (p.ends) {
        mediumParts.push(w.last);
      }
    }
    mediumParts.push(railGeometry(sign, lite));
  }

  /* The fin, fixed, cut round the rudder, and its tip. */
  {
    const across = new THREE.Vector3(1, 0, 0);
    const nf = lite ? 6 : 9;
    const parts = [
      { rows: finRows([FIN_ROOT_Z - 0.004, RUDDER_BOTTOM], false) },
      { rows: finRows(lite ? [RUDDER_BOTTOM, RUDDER_TOP] : [RUDDER_BOTTOM, 0.130, 0.190, RUDDER_TOP], true) },
      { rows: finRows([RUDDER_TOP, FIN_TIP_Z], false), tip: true },
    ];
    for (const p of parts) {
      const f = plate(p.rows, nf, across);
      mediumParts.push(f.top, f.bottom);
      if (f.back) {
        mediumParts.push(f.back);
      }
      if (p.tip) {
        mediumParts.push(f.last);
      }
    }
  }

  /* The ventral fins under the booms, canted out 15 degrees. */
  for (const sign of [-1, 1]) {
    const cant = 15 * DEG;
    const down = new THREE.Vector3(sign * Math.sin(cant), -Math.cos(cant), 0);
    const across = new THREE.Vector3(Math.cos(cant), sign * Math.sin(cant), 0);
    const root = new THREE.Vector3(sign * 0.052, -0.016, 0);
    const tip = root.clone().addScaledVector(down, (0.070 - 0.016) / Math.cos(cant));
    const rows = [
      { le: root.clone().setZ(st(1.100)), te: root.clone().setZ(st(1.220)), t: 0.004 },
      { le: tip.clone().setZ(st(1.160)), te: tip.clone().setZ(st(1.212)), t: 0.0025 },
    ];
    const v = plate(rows, lite ? 5 : 7, across);
    lightParts.push(v.top, v.bottom, v.last);
  }

  const darkMesh = new THREE.Mesh(merged(darkParts), dark);
  /* The dark band is the fuselage's spine and the strakes: the shell
   * finds the drawn model by its fuselage mesh's name. */
  darkMesh.name = 'f16-fuselage';
  darkMesh.castShadow = shade;
  group.add(darkMesh);
  const mediumMesh = new THREE.Mesh(merged(mediumParts), medium);
  mediumMesh.name = 'f16-medium';
  mediumMesh.castShadow = shade;
  group.add(mediumMesh);
  const lightMesh = new THREE.Mesh(merged(lightParts), light);
  lightMesh.name = 'f16-light';
  lightMesh.castShadow = shade;
  group.add(lightMesh);

  /* The canopy. */
  {
    canopyGeo.computeBoundingBox();
    const c = canopyGeo.boundingBox.getCenter(new THREE.Vector3());
    canopyGeo.translate(-c.x, -c.y, -c.z);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.copy(c);
    canopy.name = 'f16-canopy';
    canopy.castShadow = shade;
    group.add(canopy);
  }

  /* The nozzle's metal and, black, the jet pipe and the intake's inside. */
  const nozzle = nozzleGeometry(lite);
  {
    const nozzleMesh = new THREE.Mesh(nozzle.metal, nozzleMetal);
    nozzleMesh.name = 'f16-nozzle';
    nozzleMesh.castShadow = shade;
    group.add(nozzleMesh);
    blackParts.push(nozzle.pipe);
    const blackMesh = new THREE.Mesh(merged(blackParts), black);
    blackMesh.name = 'f16-black';
    group.add(blackMesh);
  }

  /*
   * The gear, electric retracts, each leg on its own pivot so setGear can
   * fold it. Down, it is where the physics' wheels are: the mains on
   * raked oleos up into the wing's root, and a door
   * inboard of each on its own hinge; the nose leg's oleo down from under
   * the intake to a steering collar, and below it the fork, which turns
   * with the wheel.
   */
  const metalMesh = new THREE.Mesh(pitotGeometry(lite), metal);
  metalMesh.name = 'f16-metal';
  metalMesh.castShadow = shade;
  group.add(metalMesh);
  const tyreOf = (r, w, x, y, z) => {
    const tube = w / 2;
    const t = new THREE.TorusGeometry(r - tube, tube, lite ? 5 : 6, lite ? 16 : 24);
    t.rotateY(Math.PI / 2);
    t.translate(x, y, z);
    return t;
  };
  const hubOf = (r, w, x, y, z) => {
    const h = new THREE.CylinderGeometry(r, r, w, seg);
    h.rotateZ(Math.PI / 2);
    h.translate(x, y, z);
    return h;
  };
  /* A mesh of parts drawn in the craft frame, moved into a pivot's. */
  const partOf = (geo, material, at, name) => {
    geo.translate(-at.x, -at.y, -at.z);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shade;
    if (name) {
      mesh.name = name;
    }
    return mesh;
  };

  /*
   * A main leg turns about its head on a skewed axis, as the F-16's does:
   * forward and inward, so the wheel ends inside the fuselage's side beside
   * the intake duct with its axle at MAIN_STOWED, leaning MAIN_LEAN with
   * its bottom inboard, because the fuselage narrows under the chine and an
   * upright 60 mm wheel stands out of it. The turn is the one that carries
   * the leg's direction and the axle's onto their stowed directions, built
   * from the two frames.
   */
  const MAIN_STOWED = { x: 0.042, y: -0.018 };
  const MAIN_LEAN = 30 * DEG;
  const mainLeg = (sign) => {
    const inner = MAIN_X - MAIN_W / 2 - 0.004;
    const head = new THREE.Vector3(sign * (inner - 0.002), -0.008, st(MAIN_S - 0.027));
    const foot = new THREE.Vector3(sign * inner, MAIN_Y + 0.004, st(MAIN_S));
    const axle = new THREE.Vector3(sign * MAIN_X, MAIN_Y, st(MAIN_S));
    const knee = new THREE.Vector3().lerpVectors(head, foot, 0.55);
    const legGeo = merged([
      rod(head, knee, 0.0042, rodSeg),
      rod(knee, foot, 0.0029, rodSeg),
      rod(new THREE.Vector3(sign * inner, MAIN_Y, st(MAIN_S)),
        new THREE.Vector3(sign * (MAIN_X + MAIN_W / 2 + 0.002), MAIN_Y, st(MAIN_S)), 0.0022, rodSeg),
    ]);
    const side = sign < 0 ? 'left' : 'right';
    const pivot = new THREE.Group();
    pivot.position.copy(head);
    pivot.add(partOf(legGeo, strut, head, `f16-leg-${side}`));
    pivot.add(partOf(tyreOf(MAIN_R, MAIN_W, axle.x, axle.y, axle.z), tyreMat, head, `tyre-main-${side}`));
    pivot.add(partOf(hubOf(0.017, MAIN_W * 0.8, axle.x, axle.y, axle.z), metal, head));

    const v0 = new THREE.Vector3().subVectors(axle, head);
    const len = v0.length();
    const dx = sign * MAIN_STOWED.x - head.x;
    const dy = MAIN_STOWED.y - head.y;
    const v1 = new THREE.Vector3(dx, dy, -Math.sqrt(len * len - dx * dx - dy * dy));
    const frame = (d, want) => {
      const a = want.clone().addScaledVector(d, -want.dot(d)).normalize();
      return new THREE.Matrix4().makeBasis(d, a, new THREE.Vector3().crossVectors(d, a));
    };
    const m0 = frame(v0.normalize(), new THREE.Vector3(1, 0, 0));
    const m1 = frame(v1.normalize(), new THREE.Vector3(Math.cos(MAIN_LEAN), -sign * Math.sin(MAIN_LEAN), 0));
    const up = new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()));
    return { pivot, up };
  };

  /* A main door hinged along its top edge, fore and aft; retracting, it
   * swings in under the wing's root to lie flat across the well. */
  const mainDoor = (sign) => {
    const hinge = new THREE.Vector3(sign * 0.078, -0.010, st(MAIN_S - 0.020));
    const pivot = new THREE.Group();
    pivot.position.copy(hinge);
    const door = new THREE.BoxGeometry(0.0016, 0.048, 0.080);
    door.translate(hinge.x, hinge.y - 0.024, hinge.z);
    pivot.add(partOf(door, lightDim, hinge, `f16-door-${sign < 0 ? 'left' : 'right'}`));
    return { pivot, axis: new THREE.Vector3(0, 0, 1), sign };
  };

  /*
   * The nose leg turns aft about a transverse pivot at the oleo's top,
   * under the intake, through NOSE_FOLD, which lifts the collar to
   * NOSE_STOWED_Y; the fork turns on a knuckle at the collar through
   * FORK_FOLD to trail level behind it, so the wheel lies upright in the
   * duct's fairing behind the intake's black recess. The leg is too long
   * for the fairing's depth folded straight: the fork would end under it.
   * About +x, a turn by phi takes the angle atan2(y, z) to itself less phi.
   */
  const NOSE_TOP = new THREE.Vector3(0, -0.066, st(0.448));
  const NOSE_STOWED_Y = -0.050;
  const collarY = NOSE_Y + NOSE_R + 0.010;
  const collar = new THREE.Vector3(0, collarY + 0.004, st(NOSE_S + 0.003));
  const angleOf = (v) => Math.atan2(v.y, v.z);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const oleo = new THREE.Vector3().subVectors(collar, NOSE_TOP);
  const NOSE_FOLD = angleOf(oleo) - Math.asin((NOSE_STOWED_Y - NOSE_TOP.y) / oleo.length());
  const FORK_FOLD = wrap(angleOf(new THREE.Vector3(0, NOSE_Y - collar.y, NOSE_AXLE[2] - collar.z)) - NOSE_FOLD);
  const noseBay = new THREE.Group();
  noseBay.position.copy(NOSE_TOP);
  noseBay.add(partOf(rod(NOSE_TOP.clone(), collar.clone(), 0.0036, rodSeg), strut, NOSE_TOP, 'f16-nose-oleo'));
  const knuckle = new THREE.Group();
  knuckle.position.copy(oleo);
  noseBay.add(knuckle);

  /* The nose wheel on its fork, steered about the vertical through its
   * axle as the Kadet's is, down; its children are in the craft frame's
   * heights, the group standing at the axle's station. */
  const noseSteer = new THREE.Group();
  noseSteer.name = 'nosewheel';
  noseSteer.position.set(0, -collar.y, NOSE_AXLE[2] - collar.z);
  knuckle.add(noseSteer);
  {
    const legs = [];
    const fx = NOSE_W / 2 + 0.003;
    legs.push(new THREE.CylinderGeometry(0.0048, 0.0048, 0.008, rodSeg).translate(0, collarY, 0));
    legs.push(rod(new THREE.Vector3(-fx, collarY - 0.003, 0), new THREE.Vector3(fx, collarY - 0.003, 0), 0.0022, rodSeg));
    for (const sign of [-1, 1]) {
      legs.push(rod(new THREE.Vector3(sign * fx, collarY - 0.003, 0), new THREE.Vector3(sign * fx, NOSE_Y, 0), 0.0018, rodSeg));
    }
    const fork = new THREE.Mesh(merged(legs), strut);
    fork.name = 'f16-nose-fork';
    fork.castShadow = shade;
    noseSteer.add(fork);
    const tyre = new THREE.Mesh(tyreOf(NOSE_R, NOSE_W, 0, NOSE_Y, 0), tyreMat);
    tyre.name = 'tyre-nose';
    tyre.castShadow = shade;
    noseSteer.add(tyre);
    noseSteer.add(new THREE.Mesh(hubOf(0.011, NOSE_W * 0.8, 0, NOSE_Y, 0), metal));
  }

  const gear = { 'gear-left': mainLeg(-1), 'gear-right': mainLeg(1) };
  const doors = { 'gear-door-left': mainDoor(-1), 'gear-door-right': mainDoor(1) };
  for (const [name, leg] of Object.entries({ ...gear, ...doors, 'gear-nose': { pivot: noseBay } })) {
    leg.pivot.name = name;
    group.add(leg.pivot);
  }

  /* The moving surfaces: the flaperons, the stabilators on one elevator
   * group, each on its own pivot since the anhedral tilts its axis, and
   * the rudder. */
  const ailerons = {};
  for (const [name, sign] of [['aileron-left', -1], ['aileron-right', 1]]) {
    const ys = [FLAP_IN + 0.001, (FLAP_IN + FLAP_OUT) / 2, FLAP_OUT - 0.001];
    const rows = ys.map((y) => {
      const le = leadingEdge(y);
      return {
        le: new THREE.Vector3(sign * y, WING_Z, st(le)),
        te: new THREE.Vector3(sign * y, WING_Z, st(TE_S)),
        t: wingThick(y),
        f0: (HINGE_S + 0.0008 - le) / (TE_S - le),
        f1: 1,
      };
    });
    const f = plate(rows, lite ? 4 : 5, up);
    const hingeAt = (y) => new THREE.Vector3(sign * y, WING_Z, st(HINGE_S));
    const [a, b] = sign > 0 ? [hingeAt(FLAP_IN), hingeAt(FLAP_OUT)] : [hingeAt(FLAP_OUT), hingeAt(FLAP_IN)];
    ailerons[name] = hinged([[f.top, mediumDim], [merged([f.bottom, f.front, f.first, f.last]), lightDim]], a, b, shade);
  }
  const elevator = { pivot: new THREE.Group(), halves: [] };
  for (const sign of [-1, 1]) {
    const across = new THREE.Vector3(sign * Math.sin(STAB_ANHEDRAL), Math.cos(STAB_ANHEDRAL), 0);
    const f = plate(stabRows(sign), lite ? 5 : 8, across);
    const pivotAt = (y) => new THREE.Vector3(sign * y, stabZ(y), st(STAB_PIVOT_S));
    const [a, b] = sign > 0 ? [pivotAt(STAB_ROOT), pivotAt(STAB_TIP)] : [pivotAt(STAB_TIP), pivotAt(STAB_ROOT)];
    const half = hinged([[f.top, mediumDim], [merged([f.bottom, f.first, f.last]), lightDim]], a, b, shade);
    half.pivot.name = sign < 0 ? 'stabilator-left' : 'stabilator-right';
    elevator.pivot.add(half.pivot);
    elevator.halves.push(half);
  }
  const rudder = (() => {
    const zs = lite ? [RUDDER_BOTTOM + 0.0005, RUDDER_TOP - 0.0005] : [RUDDER_BOTTOM + 0.0005, 0.130, 0.190, RUDDER_TOP - 0.0005];
    const f = plate(finRows(zs, false, true), lite ? 4 : 5, new THREE.Vector3(1, 0, 0));
    return hinged([[merged([f.top, f.bottom, f.front, f.first, f.last]), mediumDim]],
      new THREE.Vector3(0, RUDDER_BOTTOM, st(rudderHinge(RUDDER_BOTTOM))),
      new THREE.Vector3(0, RUDDER_TOP, st(rudderHinge(RUDDER_TOP))), shade);
  })();
  const surfaces = { ...ailerons, elevator, rudder };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  /* The camera's place in the cockpit. Nothing is drawn there: the
   * canopy over it is tinted, and it is the pilot's head in the picture. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, F16_MOUNT_UP, -F16_MOUNT_FORWARD);
  cameraMount.name = 'f16-camera-mount';
  group.add(cameraMount);

  /* The video antenna, a short whip on the spine behind the canopy. Named:
   * it is wire, not aircraft, and scripts/craft-check.js leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.050, lite ? 5 : 8), antenna);
    const s = 0.520;
    mast.position.set(0, fuseAt(s).top + 0.022, st(s) + 0.008);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The fan, in the jet pipe at its station: twelve pitched blades on a
   * hub with the motor's tail cone behind it. The mount turns the rotor's
   * y onto the craft's forward axis, cubcraft.js's, so rotor.rotation.y is
   * the spin the shell drives.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const fanMount = new THREE.Group();
    fanMount.position.set(0, 0, st(FAN_S));
    fanMount.rotation.x = -Math.PI / 2;
    group.add(fanMount);
    const hubR = 0.0125;
    const cone = new THREE.CylinderGeometry(0.0035, hubR, 0.028, seg);
    cone.translate(0, -0.020, 0);
    const hub = new THREE.Mesh(merged([new THREE.CylinderGeometry(hubR, hubR, 0.012, seg), cone]), stator);
    hub.name = 'fan-hub';
    fanMount.add(hub);
    const rotor = new THREE.Group();
    fanMount.add(rotor);
    const blade = new THREE.BoxGeometry(FAN_R - hubR + 0.001, 0.0008, 0.010);
    blade.rotateX(35 * DEG);
    blade.translate(hubR + (FAN_R - hubR) / 2, 0, 0);
    const all = [];
    for (let i = 0; i < FAN_BLADES; i += 1) {
      all.push(blade.clone().rotateY((2 * Math.PI * i) / FAN_BLADES));
    }
    const rotorMesh = new THREE.Mesh(merged(all), stator);
    rotorMesh.name = 'fan-rotor';
    rotor.add(rotorMesh);
    blades.push(rotor);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(FAN_R, FAN_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({ color: 0x3a3d40, transparent: true, opacity: 0.25, depthWrite: false, fog }),
    );
    disc.renderOrder = 1;
    fanMount.add(disc);
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
   * The lights on the four slots the pose driver walks: the position
   * lights on the rails' noses, red left and green right, the white tail
   * light on the fin's tip, and the red beacon under the intake.
   */
  const railNose = (sign) => new THREE.Vector3(sign * (RAIL_OUT - 0.012), WING_Z + 0.002, st(0.800));
  const lampAt = [
    { p: railNose(-1), base: 0xff3a30, front: true },
    { p: railNose(1), base: 0x3aff7a, front: false },
    { p: new THREE.Vector3(0, FIN_TIP_Z - 0.006, st(FIN_TIP_TE - 0.010)), base: 0xfff4dc, front: false },
    { p: new THREE.Vector3(0, ductAt(0.600).bottom - 0.002, st(0.600)), base: 0xff2a20, front: true },
  ];
  for (const at of lampAt) {
    const ledMat = new THREE.MeshBasicMaterial({ color: at.base, fog });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), ledMat);
    led.position.copy(at.p);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base: at.base });
  }

  /*
   * Pose the surfaces. Radians: left aileron, right aileron, elevator,
   * rudder. Ailerons and elevator positive trailing edge up, rudder
   * positive trailing edge to the left. Every axis points +x or +y (see
   * hinged), and about either a negative turn carries an aft point up or
   * to -x, so each turns by the negated angle. The nose wheel turns about
   * the craft's vertical with the rudder: trailing edge left, positive,
   * turns its front left, which is a positive turn about +y.
   */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    const left = surfaces['aileron-left'];
    const right = surfaces['aileron-right'];
    left.pivot.quaternion.copy(q.setFromAxisAngle(left.axis, -leftRad));
    right.pivot.quaternion.copy(q.setFromAxisAngle(right.axis, -rightRad));
    for (const half of elevator.halves) {
      half.pivot.quaternion.copy(q.setFromAxisAngle(half.axis, -elevRad));
    }
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    steerRad = F16_NOSE_STEER * rudRad;
    noseSteer.rotation.y = steerRad * (1 - gearUp);
  }
  /*
   * The retracts, 0 down and locked to 1 up, as sim_wing_gear reports
   * them: the mains swing forward and in on their skewed axes, the nose
   * leg aft, the steering centred as it goes, and the main doors close
   * over the second half once the legs are clear of them.
   */
  const none = new THREE.Quaternion();
  let gearUp = 0;
  let steerRad = 0;
  function setGear(g) {
    gearUp = Math.min(1, Math.max(0, g));
    for (const leg of Object.values(gear)) {
      leg.pivot.quaternion.slerpQuaternions(none, leg.up, gearUp);
    }
    const shut = Math.min(1, Math.max(0, (gearUp - 0.5) / 0.5));
    for (const door of Object.values(doors)) {
      door.pivot.quaternion.copy(q.setFromAxisAngle(door.axis, -door.sign * shut * Math.PI / 2));
    }
    noseBay.quaternion.copy(q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), gearUp * NOSE_FOLD));
    knuckle.quaternion.copy(q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), gearUp * FORK_FOLD));
    noseSteer.rotation.y = steerRad * (1 - gearUp);
  }
  setGear(0);
  setSurfaces(0, 0, 0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: F16_PROP_SPIN,
    setSurfaces,
    setGear,
    livery: coat.livery,
  };
}
