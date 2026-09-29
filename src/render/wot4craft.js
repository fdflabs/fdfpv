/*
 * wot4craft.js: the Wot 4's model, and nothing else.
 *
 * Its own file for cubcraft.js's reason: Chris Foss's club sport aerobat
 * is not a Cub. It is a slab sided balsa box with a fibreglass cowl, a
 * constant chord wing with rounded tips sitting flat on top of the box (a
 * shoulder wing), strip ailerons along most of its trailing edge, a sheet
 * stabiliser with a swept leading edge, and a small swept fin carrying a
 * big rudder that runs down to the bottom of the fuselage. An APC 13 x 8
 * turns ahead of the cowl, and the aircraft sits on an aluminium strap
 * and a wire tailwheel steered by the rudder it is epoxied into.
 *
 * The subject is the Ripmax Wot 4 Mk2 ARTF (A-CF002/A) in its box scheme:
 * white film with the Wot 4's red, orange and yellow bands sweeping round
 * the wing tips, along the fuselage and over the fin. Ripmax publishes the
 * span, 1334 mm, and the length, 1185 mm; Chris Foss the area, 590 sq in;
 * the manual the CG, 82 mm behind the leading edge at the root. The rest
 * is measured off the three view on the manual's cover, scaled by the
 * span (0.9394 mm a pixel at 600 dpi), docs/WOT4-STAGE1.md:
 *
 *   span            1.334 m, the tips rounded
 *   wing            0.2853 m chord (Foss's area over the span), flat,
 *                   on top of the fuselage, its chord line 0.064 m over
 *                   the thrust line, a 14 percent semi-symmetrical section
 *   ailerons        strip ailerons 43 mm deep, 0.103 to 0.606 m out
 *   tail            a 0.492 m stabiliser, 0.164 m at its root and 0.091 at
 *                   its tip, its leading edge swept, the hinge line
 *                   square; a swept fin to 0.258 m over the thrust line,
 *                   and an 89 mm rudder from its top to the fuselage's
 *                   bottom
 *   gear            an aluminium strap to 2 1/2 in wheels on a 0.300 m
 *                   track, the axles 0.074 m ahead of the CG and 0.202
 *                   under the thrust line
 *   tailwheel       1 in, on a wire under the rudder, steered by it
 *   prop            13 x 8 two blade tractor, clockwise seen from behind,
 *                   0.308 m ahead of the CG
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY, on the thrust line, 82 mm behind the
 * wing's leading edge. Every station below is measured aft from the
 * spinner's tip and turned into the craft frame's z by st().
 *
 * The contract with the shell is cubcraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians.
 * Ailerons and elevator are positive trailing edge up; the rudder is
 * positive trailing edge to the LEFT, and the tailwheel turns with it.
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
const PROP_S = 0.022;
const CG_S = PROP_S + 0.308;
const st = (s) => s - CG_S;

const HALF = 0.667;
const CHORD = 0.2853;
const LE_S = PROP_S + 0.226;
const WING_Y = 0.064;
const WING_T = 0.14;
const WING_CAMBER = 0.02;
/* The rounded tip: a quarter circle at each corner in plan. */
const TIP_R = 0.045;

const AIL_IN = 0.103;
const AIL_OUT = 0.606;
const AIL_HINGE = 1 - 0.043 / CHORD;

const STAB_HALF = 0.246;
const STAB_ROOT_LE_S = PROP_S + 0.939;
const STAB_TIP_LE_S = PROP_S + 1.000;
const STAB_HINGE_S = PROP_S + 1.046;
const STAB_ROOT_TE_S = PROP_S + 1.103;
const STAB_TIP_TE_S = PROP_S + 1.091;
const STAB_Y = 0.033;
const STAB_T = 0.05;

const TAIL_TOP = 0.258;
const RUDDER_BOTTOM = 0.0;
const RUDDER_S = PROP_S + 1.052;
const RUDDER_TE_S = PROP_S + 1.141;
const FIN_ROOT_S = PROP_S + 0.930;
const FIN_Y0 = 0.058;
const FIN_T = 0.06;

const PROP_R = 0.1651;
const SPINNER_R = 0.026;
const SPINNER_BASE_S = 0.050;

const MAIN_X = 0.150;
const MAIN_S = PROP_S + 0.234;
const MAIN_Y = -0.202;
const MAIN_R = 0.03175;
const MAIN_W = 0.022;
const LEG_ROOT_S = PROP_S + 0.286;
const TAIL_PIVOT_S = PROP_S + 1.066;
const TAIL_WHEEL_S = PROP_S + 1.089;
const TAIL_WHEEL_Y = -0.031;
const TAIL_WHEEL_R = 0.0127;

/* The chord and leading edge at span station ax, the tip's corners rounded. */
function plan(ax) {
  const a = Math.min(ax, HALF);
  let cut = 0;
  if (a > HALF - TIP_R) {
    const u = (a - (HALF - TIP_R)) / TIP_R;
    cut = TIP_R * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
  }
  return { le: st(LE_S) + cut, c: Math.max(0.004, CHORD - 2 * cut) };
}

/* The NACA four digit thickness, half of it, at chord fraction t, and a
 * two percent camber line's height, peak at 0.4. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}
function camber(t) {
  const p = 0.4;
  return t < p ? (WING_CAMBER / (p * p)) * (2 * p * t - t * t)
    : (WING_CAMBER / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * t - t * t);
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

/* The wing's section at span station x. */
function wingAt(x) {
  const { c, le } = plan(Math.abs(x));
  return (t, side) => new THREE.Vector3(x, WING_Y + c * (camber(t) + side * naca(t, WING_T)), le + t * c);
}
function stabPlan(ax) {
  const u = Math.min(1, ax / STAB_HALF);
  const le = STAB_ROOT_LE_S + (STAB_TIP_LE_S - STAB_ROOT_LE_S) * u;
  const te = STAB_ROOT_TE_S + (STAB_TIP_TE_S - STAB_ROOT_TE_S) * u;
  return { le: st(le), hinge: st(STAB_HINGE_S), te: st(te) };
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
 * AIL_IN to AIL_OUT: the step from a full section to a cut one at the
 * same station is the cut out's side wall.
 */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const inner = lite ? [0.35] : [0.25, 0.40, 0.52];
  const tip = lite ? [HALF - 0.03, HALF - 0.004] : [HALF - 0.035, HALF - 0.02, HALF - 0.008, HALF - 0.002];
  const half = [
    [0, 1], [AIL_IN - eps, 1],
    ...[AIL_IN + eps, ...inner, AIL_OUT - eps].map((x) => [x, AIL_HINGE]),
    [AIL_OUT + eps, 1], ...tip.map((x) => [x, 1]),
  ];
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
  return { pivot, axis, mesh, mid };
}

function aileron(sign, material, shade, lite) {
  const n = lite ? 4 : 6;
  const xs = [AIL_IN + 0.002, 0.35, AIL_OUT - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  const geo = loft(xs.map((x) => section(wingAt(x), AIL_HINGE, 1, n)));
  const hingePoint = (x) => wingAt(x)(AIL_HINGE, 1).add(wingAt(x)(AIL_HINGE, -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

function stabGeometry(n) {
  const xs = [-STAB_HALF, -0.12, 0, 0.12, STAB_HALF];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
/* The elevator halves on their wire joiner, a notch between them for the
 * rudder. */
function elevatorGeometry(n) {
  const halfOf = (sign) => {
    const xs = [0.012, 0.12, STAB_HALF - 0.001].map((x) => sign * x);
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
 * The fin and rudder's outline at height y: the fin's leading edge swept
 * from the fuselage's top up to the rudder's hinge at the top, a
 * triangle; the rudder's hinge vertical, its trailing edge nearly so, its
 * top rounded over.
 */
function finLE(y) {
  const u = Math.min(1, Math.max(0, (y - FIN_Y0) / (TAIL_TOP - FIN_Y0)));
  return FIN_ROOT_S + (RUDDER_S - 0.012 - FIN_ROOT_S) * u;
}
function rudderTE(y) {
  const u = (y - RUDDER_BOTTOM) / (TAIL_TOP - RUDDER_BOTTOM);
  const round = u > 0.8 ? 0.030 * (1 - Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2))) : 0;
  return RUDDER_TE_S - 0.008 * u - round;
}
function finGeometry(n) {
  const ys = [FIN_Y0 - 0.004, 0.100, 0.150, 0.200, TAIL_TOP - 0.004];
  return loft(ys.map((y) => {
    const le = finLE(y);
    return section(finAt(y, st(le), RUDDER_S - le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUDDER_BOTTOM, 0.050, 0.120, 0.190, 0.225, 0.245, TAIL_TOP];
  return loft(ys.map((y) => section(finAt(y, st(RUDDER_S), rudderTE(y) - RUDDER_S), 0, 1, n)));
}

/*
 * The fuselage, as rounded box sections along the stations: half width,
 * top, bottom and squareness. The fibreglass cowl rounding to the spinner,
 * the slab sided box under the wing, the canopy's windows ahead of it,
 * the top rising and the bottom sweeping up to the thrust line at the
 * rudder post.
 */
const FUSE = [
  [0.034, 0.028, 0.028, -0.028, 2.0],
  [0.070, 0.040, 0.036, -0.040, 2.4],
  [0.153, 0.046, 0.042, -0.048, 3.2],
  [0.250, 0.047, 0.056, -0.058, 3.6],
  [0.400, 0.047, 0.058, -0.062, 3.6],
  [0.560, 0.043, 0.058, -0.054, 3.4],
  [0.800, 0.029, 0.057, -0.028, 3.2],
  [0.980, 0.016, 0.059, -0.006, 3.0],
  [RUDDER_S, 0.009, 0.060, 0.000, 2.6],
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
  throw new Error(`wot4craft: station ${s} is off the fuselage`);
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
    ? [0.034, 0.070, 0.153, 0.250, 0.400, 0.560, 0.800, 0.980, RUDDER_S]
    : [0.034, 0.045, 0.070, 0.110, 0.153, 0.200, 0.250, 0.320, 0.400, 0.480, 0.560, 0.680, 0.800, 0.890,
      0.980, 1.030, RUDDER_S];
  return loft(ss.map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/*
 * The canopy's black windows: a low hood on the fuselage's top from the
 * cowl back under the wing's leading edge, 0.078 m over the thrust line
 * at its highest, as the cover's side view draws it.
 */
const CANOPY_S0 = PROP_S + 0.150;
const CANOPY_S1 = PROP_S + 0.300;
function canopyGeometry(lite) {
  const len = CANOPY_S1 - CANOPY_S0;
  const g = new THREE.SphereGeometry(1, lite ? 12 : 20, lite ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(0.042, 0.034, len / 2);
  const mid = (CANOPY_S0 + CANOPY_S1) / 2;
  g.translate(0, fuseAt(mid).yc + fuseAt(mid).h - 0.006, st(mid));
  return g;
}

/* A thin panel a hair off a surface: the quad a b c d, its normal turned
 * to face `up` (+1 away from the surface's top, -1 its underside, or a
 * side's x sign). */
function panel(a, b, c, d, faceAxis, faceSign) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  const comp = faceAxis === 'x' ? nrm.getX(0) : nrm.getY(0);
  if (comp * faceSign < 0) {
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
  }
  return geo;
}

/*
 * The box scheme's three bands round each wing tip, on the top: each band
 * between two lines slanting inboard from the leading edge to the
 * trailing edge, as the cover's top view draws them, red outermost. d0 and
 * d1 are the band's distances in from the tip at the leading edge.
 */
const SLANT = 0.22;
function tipBand(sign, d0, d1, steps) {
  const parts = [];
  const lift = new THREE.Vector3(0, 0.0012, 0);
  const at = (d, f) => {
    const x = sign * Math.max(0, HALF - d - SLANT * f);
    return wingAt(x)(f, 1).add(lift);
  };
  for (let i = 0; i < steps; i += 1) {
    const f0 = 0.02 + (0.96 * i) / steps;
    const f1 = 0.02 + (0.96 * (i + 1)) / steps;
    parts.push(panel(at(d0, f0), at(d1, f0), at(d1, f1), at(d0, f1), 'y', 1));
  }
  return parts;
}

/* The fuselage's bands, a swoop from under the cowl rising aft along each
 * side to the fin: a band between angles round the section (0 the top,
 * pi/2 the side) that climb from a0 to a1 along the stations. */
function sideBand(sign, s0, s1, a0, a1, width, steps) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= steps; i += 1) {
    const s = s0 + ((s1 - s0) * i) / steps;
    const a = a0 + (a1 - a0) * (i / steps);
    const up = fusePoint(s, sign * (a + width), 0.0012);
    const dn = fusePoint(s, sign * a, 0.0012);
    pos.push(up.x, up.y, up.z, dn.x, dn.y, dn.z);
    if (i > 0) {
      const k = i * 2;
      if (sign > 0) {
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      } else {
        idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* The fin's and the rudder's bands, horizontal across their tops on both
 * sides: y0 to y1 over the fin (its leading edge to the hinge) or over the
 * rudder (the hinge to its trailing edge). */
function finBand(y0, y1, onRudder) {
  const parts = [];
  for (const side of [-1, 1]) {
    const off = side * 0.0045;
    const edge = (y) => (onRudder ? [RUDDER_S + 0.002, rudderTE(y) - 0.002] : [finLE(y) + 0.004, RUDDER_S - 0.001]);
    const [a0, b0] = edge(y0);
    const [a1, b1] = edge(y1);
    parts.push(panel(
      new THREE.Vector3(off, y0, st(a0)), new THREE.Vector3(off, y0, st(b0)),
      new THREE.Vector3(off, y1, st(b1)), new THREE.Vector3(off, y1, st(a1)), 'x', side,
    ));
  }
  return parts;
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

/* A 13 x 8 thin electric blade, narrow and pointed, APC's E shape. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0050, 0.012);
  s.bezierCurveTo(0.0200, -0.020, 0.0170, -r * 0.55, 0.0040, -r * 0.99);
  s.lineTo(-0.0040, -r * 0.97);
  s.bezierCurveTo(-0.0150, -r * 0.50, -0.0110, -0.012, -0.0040, 0.012);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0025, bevelEnabled: false, curveSegments: segments });
}

function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('wot4craft: merge failed');
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
 * the rudder's trailing edge's, 0.833 m aft against the tips' 0.667 out;
 * vHalfUp the fin's top, vHalfDown the main tyres' bottoms.
 */
const UP = TAIL_TOP;
const DOWN = -(MAIN_Y - MAIN_R);
export const WOT4_DIMS = {
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
 * The camera mount: the FPV camera on the cowl's top at the firewall,
 * where the plant's camera is (src/native/plant.c), 0.17 m ahead of the
 * CG and 0.058 m over it, looking out over the nose through the prop.
 */
const CAM_S = CG_S - 0.170;
export const WOT4_MOUNT_FORWARD = -st(CAM_S);
export const WOT4_MOUNT_UP = 0.058;

/* A tractor turning clockwise seen from behind, as cubcraft.js's. */
export const WOT4_PROP_SPIN = [1, 0, 0, 0];

export function buildWot4Craft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'wot4-craft';
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

  /* The scheme's colours by region (src/render/livery.js): the white film
   * of the wing, the fuselage and the tail, the red, orange and yellow
   * bands, the canopy's black; the surfaces a shade of their region. */
  const coat = paintRegions();
  const wingMat = coat.base('wing', cel({ color: 0xf2f1ec, rim: 0.28, spec: 0.34, specWidth: 0.016 }));
  const fuseMat = coat.base('fuselage', cel({ color: 0xf2f1ec, rim: 0.28, spec: 0.36, specWidth: 0.016 }));
  const tailMat = coat.base('tail', cel({ color: 0xf2f1ec, rim: 0.28, spec: 0.34, specWidth: 0.016 }));
  const redMat = coat.base('trim', cel({ color: 0xd8232a, rim: 0.28, spec: 0.40, specWidth: 0.016 }));
  const orangeMat = coat.base('stripe', cel({ color: 0xf07c1e, rim: 0.28, spec: 0.40, specWidth: 0.016 }));
  const yellowMat = coat.base('swoop', cel({ color: 0xf6d418, rim: 0.28, spec: 0.40, specWidth: 0.016 }));
  const canopyMat = coat.base('canopy', cel({ color: 0x15171a, rim: 0.36, spec: 0.60, specWidth: 0.020, specColor: 0xd8e0e8 }));
  const wingFlap = coat.shade('wing', cel({ color: 0xdedcd6, rim: 0.28, spec: 0.30, specWidth: 0.014 }));
  const tailFlap = coat.shade('tail', cel({ color: 0xdedcd6, rim: 0.28, spec: 0.30, specWidth: 0.014 }));
  const black = cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 });
  const metal = cel({ color: 0xb8bcc0, rim: 0.30, spec: 0.75, specWidth: 0.024 });
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
  const propMat = cel({ color: 0x9c9a92, rim: 0.26, spec: 0.40, specWidth: 0.016 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = WOT4_DIMS;
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
    fuse.name = 'wot4-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.018, ink);
    group.add(fuse);
  }

  /* The wing, one draw, and the tail feathers, one draw. */
  {
    const n = lite ? 5 : 7;
    const wing = new THREE.Mesh(wingGeometry(lite), wingMat);
    wing.name = 'wot4-wing';
    wing.castShadow = shade;
    hull(wing, 1.006, ink);
    group.add(wing);
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n)]), tailMat);
    tail.name = 'wot4-tail';
    tail.castShadow = shade;
    group.add(tail);
  }

  /*
   * The three bands, one draw a colour: round each wing tip, along each
   * side of the fuselage and across the fin's top, red over orange over
   * yellow, the box scheme's order from the tip and the top.
   */
  {
    const steps = lite ? 4 : 8;
    const along = lite ? 8 : 16;
    const bands = [
      { mat: redMat, name: 'wot4-red', tip: [0.000, 0.040], side: 0, fin: [0.214, TAIL_TOP - 0.006] },
      { mat: orangeMat, name: 'wot4-orange', tip: [0.040, 0.068], side: 1, fin: [0.176, 0.214] },
      { mat: yellowMat, name: 'wot4-yellow', tip: [0.068, 0.096], side: 2, fin: [0.138, 0.176] },
    ];
    const width = 0.15;
    for (const b of bands) {
      const parts = [];
      for (const sign of [-1, 1]) {
        parts.push(...tipBand(sign, b.tip[0], b.tip[1], steps));
        /* The swoop, from low on the side under the cockpit rising aft to
         * the fin's root, red lowest and each colour a band above it. */
        const lag = b.side * 0.030;
        parts.push(sideBand(sign, 0.180 + lag, 0.990, 2.25 - b.side * width, 1.30 - b.side * width, width, along));
      }
      parts.push(...finBand(b.fin[0], b.fin[1], false));
      const mesh = new THREE.Mesh(merged(parts), b.mat);
      mesh.name = b.name;
      group.add(mesh);
    }
  }

  /* The canopy's windows. */
  {
    const glassMesh = new THREE.Mesh(canopyGeometry(lite), canopyMat);
    glassMesh.name = 'wot4-canopy';
    group.add(glassMesh);
  }

  /* The metal: the aluminium strap's two legs, flat and swept forward from
   * the fuselage's bottom to the axles, and the axles; the tailwheel's
   * wire from the fuselage's bottom to the rudder. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const root = new THREE.Vector3(sign * 0.030, fuseAt(LEG_ROOT_S).yc - fuseAt(LEG_ROOT_S).h + 0.002, st(LEG_ROOT_S));
      const foot = new THREE.Vector3(sign * (MAIN_X - MAIN_W / 2 - 0.004), MAIN_Y + 0.004, st(MAIN_S));
      parts.push(rod(root, foot, 0.0065, rodSeg, 3.0));
      const hub = new THREE.CylinderGeometry(0.0035, 0.0035, MAIN_W + 0.010, seg);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sign * (MAIN_X - 0.004), MAIN_Y, st(MAIN_S));
      parts.push(hub);
    }
    parts.push(rod(new THREE.Vector3(0, fuseAt(1.000).yc - fuseAt(1.000).h + 0.001, st(1.000)),
      new THREE.Vector3(0, RUDDER_BOTTOM - 0.004, st(TAIL_PIVOT_S)), 0.0012, lite ? 4 : 6));
    const metalMesh = new THREE.Mesh(merged(parts), metal);
    metalMesh.name = 'wot4-metal';
    metalMesh.castShadow = shade;
    group.add(metalMesh);
  }

  /* The main wheels: black tyres on white hubs, one draw each. */
  {
    const tyres = [];
    const hubs = [];
    for (const sign of [-1, 1]) {
      const tyre = new THREE.TorusGeometry(MAIN_R - 0.0085, 0.0085, 6, lite ? 16 : 20);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      tyres.push(tyre);
      const hub = new THREE.CylinderGeometry(MAIN_R - 0.010, MAIN_R - 0.010, MAIN_W * 0.7, seg);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      hubs.push(hub);
    }
    const tyreMesh = new THREE.Mesh(merged(tyres), black);
    tyreMesh.name = 'wot4-tyres';
    tyreMesh.castShadow = shade;
    group.add(tyreMesh);
    const hubMesh = new THREE.Mesh(merged(hubs), metal);
    hubMesh.name = 'wot4-hubs';
    group.add(hubMesh);
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
  /* The rudder's own bands, riding on it. */
  {
    const bandsOn = [[redMat, 0.214, TAIL_TOP - 0.010], [orangeMat, 0.176, 0.214], [yellowMat, 0.138, 0.176]];
    for (const [mat, y0, y1] of bandsOn) {
      const geo = merged(finBand(y0, y1, true));
      geo.translate(-rudder.mid.x, -rudder.mid.y, -rudder.mid.z);
      rudder.pivot.add(new THREE.Mesh(geo, mat));
    }
  }

  /* The tailwheel on its wire under the rudder, turning with it, as the
   * wire epoxied into the rudder turns it. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, RUDDER_BOTTOM - 0.004, st(TAIL_PIVOT_S));
    const trail = TAIL_WHEEL_S - TAIL_PIVOT_S;
    const dropY = TAIL_WHEEL_Y - (RUDDER_BOTTOM - 0.004);
    const forkParts = [
      rod(new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(0, dropY + 0.002, trail), 0.0012, lite ? 4 : 6),
      new THREE.CylinderGeometry(0.003, 0.003, 0.010, lite ? 6 : 10).rotateZ(Math.PI / 2).translate(0, dropY, trail),
    ];
    const fork = new THREE.Mesh(merged(forkParts), metal);
    fork.castShadow = shade;
    pivot.add(fork);
    const tyreGeo = new THREE.TorusGeometry(TAIL_WHEEL_R - 0.004, 0.004, 5, 12);
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

  /* The camera on the cowl's top at the firewall. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, WOT4_MOUNT_UP, -WOT4_MOUNT_FORWARD);
  cameraMount.name = 'wot4-camera-mount';
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

  /* The video antenna, a whip on the fuselage's top behind the wing.
   * NAMED, because it is wire and not aircraft: scripts/craft-check.js
   * leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.080, lite ? 5 : 8), antenna);
    const s = PROP_S + 0.620;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.036, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /* The motor behind the spinner, the black spinner, and the prop, on
   * cubcraft.js's mount. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.012, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, 0, st(0.056));
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
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 10 : 14), black);
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
        color: 0x7a7870,
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
   * arrangement: the wingtips, the cowl and the fuselage's top ahead of
   * the fin. */
  const tipTop = (x) => wingAt(x)(0.4, 1);
  const lampAt = [
    { p: tipTop(-0.60), front: true },
    { p: tipTop(0.60), front: false },
    { p: fusePoint(0.090, 0), front: true },
    { p: fusePoint(0.900, 0), front: false },
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
    propSpin: WOT4_PROP_SPIN,
    setSurfaces,
    livery: coat.livery,
  };
}
