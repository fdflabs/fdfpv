/*
 * herculescraft.js: the C-130H Hercules's model, and nothing else.
 *
 * Its own file for cubcraft.js's reason: a four engined transport is not
 * a sport model. It is a deep, square sided fuselage with a radome nose
 * and a stepped flight deck; a high, straight tapered wing sitting on the
 * fuselage's top in a long fairing; four nacelles slung under the wing;
 * main wheels in sponsons either side of the belly and a nose wheel; and
 * an upswept rear fuselage that opens on a ramp and an upper cargo door,
 * under a conventional low set tailplane and a tall fin. The C-130 has no
 * T tail: its tailplane sits on the tail cone, the fin standing over it.
 *
 * The subject is AeroTetris's balsa C-130 Hercules 3077, 1:13.13 of the
 * full size. Every number is scripts/hercules-derive.js's:
 *
 *   span            3.077 m, a straight taper, 0.4671 m at the root and
 *                   0.2144 at the tip, the trailing edge straight across,
 *                   which puts the mean chord's leading edge 0.8065 m
 *                   behind the nose; 2.5 degrees of dihedral, 3 of
 *                   washout, the wing's chord line 0.2235 m over the CG
 *   fuselage        2.25 m long, 0.3305 wide, 0.3503 deep, its belly
 *                   0.065 m off the ground at rest, level
 *   nacelles        at 0.3846 and 0.7539 m out, their thrust lines 0.1785
 *                   over the CG, the props' discs 0.315 m ahead of it
 *   props           APC 12 x 8E, 0.1524 m, two bladed. The full size
 *                   turns four bladed Hamilton Standard props; the kit
 *                   flies two blades and this draws what flies.
 *   tail            a 1.2221 m tailplane of 0.2052 m2, its quarter chord
 *                   2.000 m behind the nose; a fin 0.4645 m over the
 *                   fuselage's top, 0.1212 m2, its quarter chord 2.030 m
 *   ramp            the full size's 3.12 by 3.02 m, so 0.238 by 0.230,
 *                   hinged 0.68 of the length back
 *   gear            fixed, 55 mm wheels: mains on a 0.3312 m track 0.08 m
 *                   behind the CG, the nose wheel 0.7439 m ahead of them
 *
 * THE PAINT is the USAF airlifter's overall grey, FS 36173, which the
 * USAF calls AMC Battle Grey (USAF SIG's review of Authentic Decals 72-51,
 * C-130 Hercules USAF cargo versions: "painted in overall AMC Battle Grey
 * (FS36173)", https://usaf-sig.org/index.php/references/reviews/118-decal-reviews/431-authentic-decals-72-51-c-130-hercules-usaf-cargo-versions).
 * No insignia and no unit markings: the non goals rule them out.
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY, 0.9238 m behind the nose and
 * 0.2604 m over the ground (DRAWN_DROP below). Stations are metres aft of the nose's tip
 * and turn into the craft frame's z through st(); heights are metres
 * over the CG and are the craft frame's y. The craft frame is Three.js's:
 * x right, y up, z aft.
 *
 * The contract with the shell is cubcraft.js's: group, discs, blades,
 * leds, cameraMount, stator, propSpin, four slots long and here all four
 * used, and setSurfaces(leftAileron, rightAileron, elevator, rudder) in
 * radians; the nose wheel turns with the rudder by HERCULES_NOSE_STEER,
 * kadetcraft.js's way. On top of it, setRamp(t): 0 closed to 1 open, the
 * ramp ('ramp') swinging down about its forward edge to the ground line,
 * the upper door ('cargo-door') swinging up into the tail about its aft
 * edge.
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

const CG_S = 0.9238;
const CG_HEIGHT = 0.1818;
/* The heights below are the drawing's, taken with the CG a third of the
 * fuselage's depth over its belly; the derive's mass build up puts it
 * 0.1954 m over the belly, so the drawn aircraft hangs 0.0786 m lower
 * under the CG than its own numbers say, which puts the CG 0.2604 m over
 * the grass, where the plant settles (src/native/plant.c). Every height
 * exported is the shifted one. */
const DRAWN_DROP = 0.0786;
const st = (s) => s - CG_S;
const DEG = Math.PI / 180;

const HALF = 3.077 / 2;
const ROOT_C = 0.4671;
const TIP_C = 0.2144;
/* The straight trailing edge, where the mean chord's leading edge at
 * 0.8065 m and its 0.3564 m chord put it. */
const WING_TE_S = 0.8065 + 0.3564;
const WING_Y = 0.2235;
const DIHEDRAL = 2.5 * DEG;
const WASHOUT = 3 * DEG;
const WING_T_ROOT = 0.16;
const WING_T_TIP = 0.12;

const AIL_IN = 1.0154;
const AIL_OUT = 1.4924;
const AIL_HINGE = 0.74;

const STAB_HALF = 1.2221 / 2;
const STAB_ROOT_C = 0.220;
const STAB_TIP_C = 0.116;
const STAB_ROOT_LE_S = 1.930;
const STAB_TIP_LE_S = 1.995;
const STAB_Y = 0.160;
const STAB_T = 0.10;
const ELEV_F = 0.66;

const FUSE_TOP = 0.2335;
const FIN_TOP = FUSE_TOP + 0.4645;
const FIN_ROOT_Y = 0.19;
const FIN_ROOT_LE_S = 1.810;
const FIN_TIP_LE_S = 2.090;
const FIN_ROOT_C = 0.370;
const FIN_TIP_C = 0.160;
const FIN_T = 0.11;
const RUDDER_F = 0.66;

const PROP_R = 0.1524;
const PROP_S = CG_S - 0.315;
const THRUST_Y = 0.1785;
const NACELLES = [0.3846, 0.7539];
const SPINNER_R = 0.034;

const WHEEL_R = 0.0275;
const WHEEL_W = 0.020;
const AXLE_Y = WHEEL_R - CG_HEIGHT;
const MAIN_X = 0.3312 / 2;
const MAIN_S = CG_S + 0.080;
const NOSE_S = MAIN_S - 0.7439;

const RAMP_HINGE_S = 0.68 * 2.25;
const RAMP_L = 0.238;
const RAMP_HALF_W = 0.230 / 2;
const DOOR_HINGE_S = 1.985;

/* The fuselage, rounded box sections: station, half width, top, bottom,
 * squareness. Linear between rows, so the upswept belly under the ramp
 * and the door is straight, as the ramp that closes over it is. */
const FUSE = [
  [0.000, 0.012, 0.030, 0.010, 2.0],
  [0.030, 0.062, 0.062, -0.030, 2.0],
  [0.065, 0.092, 0.084, -0.062, 2.1],
  [0.100, 0.118, 0.100, -0.086, 2.3],
  [0.125, 0.135, 0.128, -0.098, 2.5],
  [0.200, 0.155, 0.198, -0.110, 2.8],
  [0.280, 0.163, 0.226, -0.1155, 3.0],
  [0.380, 0.16525, FUSE_TOP, -0.1168, 3.2],
  [1.350, 0.16525, FUSE_TOP, -0.1168, 3.2],
  [RAMP_HINGE_S, 0.163, FUSE_TOP, -0.070, 3.1],
  [RAMP_HINGE_S + 0.222, 0.150, 0.231, -0.018, 3.0],
  [DOOR_HINGE_S, 0.112, 0.225, 0.070, 2.8],
  [2.140, 0.064, 0.214, 0.135, 2.4],
  [2.225, 0.020, 0.198, 0.170, 2.0],
];
const FUSE_END_S = FUSE[FUSE.length - 1][0];
function fuseAt(s) {
  const t = Math.min(Math.max(s, 0), FUSE_END_S);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      const lerp = (j) => a[j] + (b[j] - a[j]) * u;
      const top = lerp(2);
      const bottom = lerp(3);
      return { w: lerp(1), h: (top - bottom) / 2, yc: (top + bottom) / 2, e: lerp(4) };
    }
  }
  throw new Error(`herculescraft: station ${s} is off the fuselage`);
}
/* A point on the fuselage's skin at angle a round from the top, out
 * metres proud of it. */
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
const bellyY = (s) => fuseAt(s).yc - fuseAt(s).h;

function chordLE(ax) {
  const u = Math.min(1, ax / HALF);
  const c = ROOT_C + (TIP_C - ROOT_C) * u;
  return { c, le: st(WING_TE_S - c), u };
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

/* The wing at span station x: the dihedral lifts it, the washout turns
 * the tip nose down about its quarter chord. */
function wingAt(x) {
  const ax = Math.abs(x);
  const { c, le, u } = chordLE(ax);
  const thick = WING_T_ROOT + (WING_T_TIP - WING_T_ROOT) * u;
  const y0 = WING_Y + ax * Math.tan(DIHEDRAL);
  const tw = WASHOUT * u;
  return (t, side) => new THREE.Vector3(x, y0 + side * c * naca(t, thick) + (t - 0.25) * c * tw, le + t * c);
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
function finPlan(y) {
  const u = (y - FUSE_TOP) / (FIN_TOP - FUSE_TOP);
  const le = FIN_ROOT_LE_S + (FIN_TIP_LE_S - FIN_ROOT_LE_S) * u;
  const c = FIN_ROOT_C + (FIN_TIP_C - FIN_ROOT_C) * u;
  return { le, hinge: le + RUDDER_F * c, te: le + c };
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
 * A patch of the fuselage's skin, out metres proud of it, stations s0 to
 * s1 and angles a0 to a1 round from the top: the glass, the frames, the
 * radome's paint, the hold's opening and the ramp and door themselves.
 * Faced away from the fuselage's axis, so one sided materials show.
 */
function skinPatch(s0, s1, a0, a1, out, ns, na) {
  const pos = [];
  for (let i = 0; i <= ns; i += 1) {
    const s = s0 + ((s1 - s0) * i) / ns;
    for (let j = 0; j <= na; j += 1) {
      const p = fusePoint(s, a0 + ((a1 - a0) * j) / na, out);
      pos.push(p.x, p.y, p.z);
    }
  }
  const idx = [];
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
  geo.computeVertexNormals();
  const mid = Math.floor(pos.length / 6) * 3;
  const p = new THREE.Vector3(pos[mid], pos[mid + 1], pos[mid + 2]);
  const outward = new THREE.Vector3(p.x, p.y - fuseAt(p.z + CG_S).yc, 0);
  const nrm = new THREE.Vector3().fromBufferAttribute(geo.getAttribute('normal'), mid / 3);
  if (nrm.dot(outward) < 0) {
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

function fuseGeometry(lite) {
  const around = lite ? 16 : 28;
  const ss = lite
    ? [0.000, 0.030, 0.100, 0.200, 0.380, 1.350, RAMP_HINGE_S, RAMP_HINGE_S + 0.222, DOOR_HINGE_S, 2.140, FUSE_END_S]
    : [...FUSE.map((r) => r[0]), 0.015, 0.160, 0.240, 0.700, 1.000].sort((a, b) => a - b);
  return loft(ss.map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/*
 * The wing, tip to tip in one loft, cut at the ailerons' hinge line from
 * AIL_IN to AIL_OUT: the step from a full section to a cut one at the
 * same station is the cut out's side wall.
 */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const inner = lite ? [0, 0.6] : [0, 0.25, 0.5, 0.75];
  const cut = lite ? [1.25] : [1.15, 1.30];
  const half = [
    ...inner.map((x) => [x, 1]),
    [AIL_IN - eps, 1],
    ...[AIL_IN + eps, ...cut, AIL_OUT - eps].map((x) => [x, AIL_HINGE]),
    [AIL_OUT + eps, 1],
    [HALF, 1],
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
  return { pivot, axis, mesh };
}

function aileron(sign, material, shade, lite) {
  const n = lite ? 4 : 6;
  const xs = [AIL_IN + 0.002, (AIL_IN + AIL_OUT) / 2, AIL_OUT - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  const geo = loft(xs.map((x) => section(wingAt(x), AIL_HINGE, 1, n)));
  const hingePoint = (x) => wingAt(x)(AIL_HINGE, 1).add(wingAt(x)(AIL_HINGE, -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

function stabGeometry(n) {
  const xs = [-STAB_HALF, -0.3, 0, 0.3, STAB_HALF];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
/* The elevator, both halves on one hinge across the tail cone, as the
 * kit's joiner wire ties them. */
function elevatorGeometry(n) {
  const halfOf = (sign) => {
    const xs = [0.050, 0.3, STAB_HALF - 0.001].map((x) => sign * x);
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
function finGeometry(n) {
  const ys = [FIN_ROOT_Y, FUSE_TOP, 0.40, 0.55, FIN_TOP];
  return loft(ys.map((y) => {
    const p = finPlan(y);
    return section(finAt(y, st(p.le), p.hinge - p.le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [STAB_Y + 0.03, FUSE_TOP, 0.45, FIN_TOP];
  return loft(ys.map((y) => {
    const p = finPlan(y);
    return section(finAt(y, st(p.hinge), p.te - p.hinge), 0, 1, n);
  }));
}
/* The dorsal fillet: a low strake from the top of the upsweep running
 * into the fin's leading edge, buried at both ends. */
function dorsalGeometry(n) {
  const rows = [[FIN_ROOT_Y, 1.540], [FUSE_TOP, 1.600], [0.300, finPlan(0.300).le - 0.004]];
  return loft(rows.map(([y, le]) => section(finAt(y, st(le), finPlan(y).le + 0.06 - le), 0, 1, n)));
}

/* A nacelle at span station x: an oval loft from behind the spinner to a
 * point past the trailing edge, its rear half rising into the wing. */
const NACELLE = [
  [PROP_S + 0.030, 0.030, 0.032, 0.000],
  [PROP_S + 0.055, 0.044, 0.050, 0.000],
  [PROP_S + 0.120, 0.050, 0.060, 0.002],
  [PROP_S + 0.300, 0.050, 0.062, 0.010],
  [PROP_S + 0.460, 0.044, 0.050, 0.022],
  [PROP_S + 0.580, 0.030, 0.034, 0.034],
  [PROP_S + 0.680, 0.010, 0.012, 0.045],
];
function nacelleGeometry(x, lite) {
  const around = lite ? 10 : 16;
  return loft(NACELLE.map(([s, rx, ry, dy]) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      const a = (2 * Math.PI * i) / around;
      ring.push(new THREE.Vector3(x + rx * Math.sin(a), THRUST_Y + dy + ry * Math.cos(a), st(s)));
    }
    return ring;
  }));
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

/* A 12 x 8E blade, extracraft.js's outline scaled to its radius. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const k = r / 0.1651;
  const s = new THREE.Shape();
  s.moveTo(0.0055 * k, 0.012);
  s.bezierCurveTo(0.0240 * k, -0.020, 0.0200 * k, -r * 0.50, 0.0080 * k, -r * 0.97);
  s.lineTo(-0.0055 * k, -r * 0.94);
  s.bezierCurveTo(-0.0180 * k, -r * 0.45, -0.0120 * k, -0.012, -0.0040 * k, 0.012);
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
    throw new Error('herculescraft: merge failed');
  }
  return geo;
}

/*
 * The ramp and door. The ramp's closed line is the belly's upsweep from
 * its hinge; open, it hangs down to the ground line, which with its hinge
 * where it is comes to about 28 degrees below level, the full size's
 * ramp on the ground. The door closes the upsweep from the ramp's end to
 * its hinge under the tail and opens 20 degrees over level, into the tail.
 */
const RAMP_END_S = RAMP_HINGE_S + RAMP_L * Math.cos(Math.atan2(bellyY(RAMP_HINGE_S + 0.1) - bellyY(RAMP_HINGE_S), 0.1));
const RAMP_UP = Math.atan2(bellyY(RAMP_END_S) - bellyY(RAMP_HINGE_S), RAMP_END_S - RAMP_HINGE_S);
const RAMP_DOWN = Math.asin(Math.min(1, (bellyY(RAMP_HINGE_S) + CG_HEIGHT - 0.004) / RAMP_L));
const DOOR_DOWN = Math.atan2(bellyY(DOOR_HINGE_S) - bellyY(RAMP_END_S), DOOR_HINGE_S - RAMP_END_S);
const DOOR_UP = 20 * DEG;
const HOLD_A = 0.62;

/*
 * The gear and the attitude it sits the aircraft at, kadetcraft.js's
 * construction: the ground line tangent under the nose wheel's and the
 * mains' circles. Both axles are the same height and the wheels the same
 * size, so it comes out level, the derive's rest pitch.
 */
const MAIN_AXLE = [MAIN_X, AXLE_Y, st(MAIN_S)];
const NOSE_AXLE = [0, AXLE_Y, st(NOSE_S)];
const REST_PITCH = Math.atan2((MAIN_AXLE[1] - WHEEL_R) - (NOSE_AXLE[1] - WHEEL_R), MAIN_AXLE[2] - NOSE_AXLE[2]);
const restContact = (axle, r) => [
  axle[0],
  axle[1] - r * Math.cos(REST_PITCH),
  axle[2] + r * Math.sin(REST_PITCH),
];
const REST_CG_HEIGHT = (() => {
  const c = restContact(MAIN_AXLE, WHEEL_R);
  return -(Math.cos(REST_PITCH) * c[1] - Math.sin(REST_PITCH) * c[2]);
})();

/*
 * Exported numbers, so the airframe table and the scale check are held
 * against the drawn machine: hullR the furthest reach in plan, which is
 * the wingtips', vHalfUp the fin's top, vHalfDown the tyres' bottoms.
 */
const WING_TIP_TOP = wingAt(HALF)(0.3, 1).y;
const UP = Math.max(FIN_TOP, WING_TIP_TOP);
const DOWN = -(AXLE_Y - WHEEL_R);
const TAIL_S = finPlan(FIN_TOP).te;
const REACH = Math.max(HALF, st(TAIL_S), Math.hypot(STAB_HALF, stabPlan(STAB_HALF).te));
export const HERCULES_DIMS = {
  span: 2 * HALF,
  rootChord: ROOT_C,
  tipChord: TIP_C,
  dihedralDeg: DIHEDRAL / DEG,
  stabSpan: 2 * STAB_HALF,
  finHeight: FIN_TOP - FUSE_TOP,
  gearTrack: 2 * MAIN_X,
  wheelbase: MAIN_S - NOSE_S,
  propR: PROP_R,
  thrustY: THRUST_Y - DRAWN_DROP,
  nacelles: [...NACELLES],
  noseZ: st(0),
  tailZ: st(TAIL_S),
  length: TAIL_S,
  reach: REACH,
  vHalfUp: UP - DRAWN_DROP,
  vHalfDown: DOWN + DRAWN_DROP,
  ramp: { hingeZ: st(RAMP_HINGE_S), length: RAMP_L, width: 2 * RAMP_HALF_W, openDeg: RAMP_DOWN / DEG },
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1] - DRAWN_DROP, MAIN_AXLE[2]], r: WHEEL_R, width: WHEEL_W },
    mainRight: { axle: [MAIN_AXLE[0], MAIN_AXLE[1] - DRAWN_DROP, MAIN_AXLE[2]], r: WHEEL_R, width: WHEEL_W },
    nose: { axle: [NOSE_AXLE[0], NOSE_AXLE[1] - DRAWN_DROP, NOSE_AXLE[2]], r: WHEEL_R, width: WHEEL_W },
  },
  contact: {
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - WHEEL_R - DRAWN_DROP, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - WHEEL_R - DRAWN_DROP, MAIN_AXLE[2]],
    nose: [0, NOSE_AXLE[1] - WHEEL_R - DRAWN_DROP, NOSE_AXLE[2]],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: REST_PITCH / DEG,
    cgHeight: REST_CG_HEIGHT + DRAWN_DROP,
    contact: {
      mainLeft: restContact([-MAIN_AXLE[0], MAIN_AXLE[1] - DRAWN_DROP, MAIN_AXLE[2]], WHEEL_R),
      mainRight: restContact([MAIN_AXLE[0], MAIN_AXLE[1] - DRAWN_DROP, MAIN_AXLE[2]], WHEEL_R),
      nose: restContact([NOSE_AXLE[0], NOSE_AXLE[1] - DRAWN_DROP, NOSE_AXLE[2]], WHEEL_R),
    },
  },
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: REACH,
    vHalfDown: DOWN + DRAWN_DROP,
    vHalfUp: UP - DRAWN_DROP,
    bodyLength: TAIL_S,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/* The FPV camera behind the windscreen's lower frame, where the plant's
 * camera is: 0.80 m ahead of the CG and 0.10 over it. */
export const HERCULES_MOUNT_FORWARD = 0.80;
export const HERCULES_MOUNT_UP = 0.10;

/* All four turn clockwise seen from behind, as the full size's T56s all
 * turn the same way. */
export const HERCULES_PROP_SPIN = [1, 1, 1, 1];

/* How far the nose wheel turns per radian of rudder: the kit's steering
 * arm is on the rudder servo one to one. An assumption, not a measured
 * linkage. */
export const HERCULES_NOSE_STEER = 1.0;

export function buildHerculesCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'hercules-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const drawn = new THREE.Group();
  drawn.position.y = -DRAWN_DROP;
  group.add(drawn);
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 8 : 12;
  const rodSeg = lite ? 4 : 6;

  /* The scheme's colours by region (src/render/livery.js): FS 36173 over
   * the fuselage, wing and tail; the radome a darker grey, as the
   * dielectric paint weathers; the spinners grey; the props black; the
   * trim, frames and exhausts, near black. Surfaces a shade of their
   * region. */
  const GREY = 0x61686c;
  const coat = paintRegions();
  const fuseMat = coat.base('fuselage', cel({ color: GREY, rim: 0.28, spec: 0.26, specWidth: 0.016 }));
  const wingMat = coat.base('wing', cel({ color: GREY, rim: 0.28, spec: 0.24, specWidth: 0.014 }));
  const tailMat = coat.base('tail', cel({ color: GREY, rim: 0.28, spec: 0.24, specWidth: 0.014 }));
  const radomeMat = coat.base('radome', cel({ color: 0x3e4347, rim: 0.28, spec: 0.30, specWidth: 0.016 }));
  const spinnerMat = coat.base('spinners', cel({ color: GREY, rim: 0.28, spec: 0.40, specWidth: 0.016 }));
  const propMat = coat.base('props', cel({ color: 0x1c1d1f, rim: 0.26, spec: 0.40, specWidth: 0.016 }));
  const trimMat = coat.base('trim', cel({ color: 0x2b2e31, rim: 0.30, spec: 0.40, specWidth: 0.016 }));
  const wingFlap = coat.shade('wing', cel({ color: 0x575d61, rim: 0.28, spec: 0.22, specWidth: 0.014 }));
  const tailFlap = coat.shade('tail', cel({ color: 0x575d61, rim: 0.28, spec: 0.22, specWidth: 0.014 }));
  /* Double sided: open, the ramp and door are seen from the hold's side. */
  const rampMat = coat.shade('fuselage', cel({ color: 0x5b6266, rim: 0.28, spec: 0.24, specWidth: 0.016, side: THREE.DoubleSide }));
  const holdMat = cel({ color: 0x1a1d1f, rim: 0.10, spec: 0.05 });
  const tyreMat = cel({ color: 0x16181a, rim: 0.30, spec: 0.35, specWidth: 0.016 });
  const metal = cel({ color: 0x8e9196, rim: 0.30, spec: 0.60, specWidth: 0.022 });
  const glass = cel({ color: 0x24323d, rim: 0.40, spec: 0.60, specWidth: 0.020, specColor: 0xf3ead4 });
  const stator = cel({ color: 0x2a322c, rim: 0.24, spec: 0.20 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x101610, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xf3ead4, side: THREE.DoubleSide,
  });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = HERCULES_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), wingMat);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    drawn.add(body);
  }

  /* The fuselage, centred on its own middle so the hull thickens it
   * evenly, with the sponsons and the wing's top fairing in its paint. */
  {
    const geo = fuseGeometry(lite);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const fuse = new THREE.Mesh(geo, fuseMat);
    fuse.position.copy(c);
    fuse.name = 'hercules-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.012, ink);
    drawn.add(fuse);

    const parts = [];
    for (const sign of [-1, 1]) {
      const sponson = new THREE.SphereGeometry(1, lite ? 10 : 16, lite ? 6 : 10);
      sponson.scale(0.050, 0.060, 0.230);
      sponson.translate(sign * 0.150, -0.075, st(MAIN_S - 0.010));
      parts.push(sponson);
    }
    /* The fairing the wing's centre section sits in, a long low hump
     * over the fuselage's top; it is also the wing's root fillet. */
    const hump = new THREE.SphereGeometry(1, lite ? 12 : 20, lite ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2);
    hump.scale(0.120, 0.075, 0.420);
    hump.translate(0, FUSE_TOP - 0.012, st(0.960));
    parts.push(hump);
    const body = new THREE.Mesh(merged(parts), fuseMat);
    body.name = 'hercules-sponsons';
    body.castShadow = shade;
    drawn.add(body);
  }

  /* The radome's paint, a sleeve a hair proud of the nose. */
  {
    const radome = new THREE.Mesh(skinPatch(0.0, 0.098, 0, 2 * Math.PI, 0.0012, lite ? 4 : 8, lite ? 16 : 28), radomeMat);
    radome.name = 'radome';
    radome.castShadow = shade;
    drawn.add(radome);
  }

  /* The flight deck's glass: the windscreen's panes over the step, the
   * side windows, the eyebrow windows over them, and the frames. */
  {
    const na = lite ? 6 : 12;
    const panes = [
      skinPatch(0.103, 0.190, -1.05, 1.05, 0.0015, lite ? 2 : 4, na),
      skinPatch(0.200, 0.255, 0.95, 1.40, 0.0015, 2, 3),
      skinPatch(0.200, 0.255, -1.40, -0.95, 0.0015, 2, 3),
      skinPatch(0.215, 0.250, 0.45, 0.70, 0.0015, 1, 2),
      skinPatch(0.215, 0.250, -0.70, -0.45, 0.0015, 1, 2),
    ];
    const g = new THREE.Mesh(merged(panes), glass);
    g.name = 'hercules-glass';
    drawn.add(g);
    const frames = [];
    for (const a of [-1.05, -0.62, -0.20, 0.20, 0.62, 1.05]) {
      frames.push(skinPatch(0.101, 0.192, a - 0.025, a + 0.025, 0.0025, lite ? 2 : 4, 1));
    }
    frames.push(skinPatch(0.101, 0.110, -1.07, 1.07, 0.0025, 1, na));
    frames.push(skinPatch(0.186, 0.195, -1.07, 1.07, 0.0025, 1, na));
    const f = new THREE.Mesh(merged(frames), trimMat);
    f.name = 'hercules-frames';
    drawn.add(f);
  }

  /* The hold's opening: dark skin under the ramp and the door, hidden
   * while they are shut and the hole the eye reads when they open. */
  {
    const hold = new THREE.Mesh(skinPatch(RAMP_HINGE_S, DOOR_HINGE_S, Math.PI - HOLD_A, Math.PI + HOLD_A, 0.0010, 6, 8), holdMat);
    hold.name = 'hercules-hold';
    drawn.add(hold);
  }

  /* The wing, one draw, and the tail feathers and dorsal fillet, one. */
  {
    const n = lite ? 5 : 7;
    const wing = new THREE.Mesh(wingGeometry(lite), wingMat);
    wing.name = 'hercules-wing';
    wing.castShadow = shade;
    drawn.add(wing);
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n), dorsalGeometry(n)]), tailMat);
    tail.name = 'hercules-tail';
    tail.castShadow = shade;
    drawn.add(tail);
  }

  /* The four nacelles, one draw in the wing's paint, and their trim: the
   * chin intake under each spinner and the exhaust stub on the nacelle's
   * outboard side behind the wing. */
  {
    const nac = [];
    const trim = [];
    for (const x of NACELLES.flatMap((y) => [-y, y])) {
      nac.push(nacelleGeometry(x, lite));
      const intake = new THREE.BoxGeometry(0.030, 0.018, 0.050);
      intake.translate(x, THRUST_Y - 0.052, st(PROP_S + 0.085));
      trim.push(intake);
      const out = Math.sign(x);
      trim.push(rod(
        new THREE.Vector3(x + out * 0.040, THRUST_Y + 0.020, st(PROP_S + 0.470)),
        new THREE.Vector3(x + out * 0.042, THRUST_Y + 0.022, st(PROP_S + 0.540)),
        0.012, rodSeg,
      ));
    }
    const nacelles = new THREE.Mesh(merged(nac), wingMat);
    nacelles.name = 'hercules-nacelles';
    nacelles.castShadow = shade;
    drawn.add(nacelles);
    const t = new THREE.Mesh(merged(trim), trimMat);
    t.name = 'hercules-trim';
    t.castShadow = shade;
    drawn.add(t);
  }

  /* The main gear: tyres and hubs under the sponsons. The full size's
   * tandem pairs are the kit's single wheel a side. */
  {
    const tyres = [];
    const hubs = [];
    for (const sign of [-1, 1]) {
      const tyre = new THREE.TorusGeometry(WHEEL_R - 0.008, 0.008, 6, lite ? 14 : 20);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, AXLE_Y, st(MAIN_S));
      tyres.push(tyre);
      const hub = new THREE.CylinderGeometry(0.014, 0.014, WHEEL_W, seg);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sign * MAIN_X, AXLE_Y, st(MAIN_S));
      hubs.push(hub);
    }
    const t = new THREE.Mesh(merged(tyres), tyreMat);
    t.name = 'tyre-main';
    t.castShadow = shade;
    drawn.add(t);
    const h = new THREE.Mesh(merged(hubs), metal);
    h.name = 'hercules-hubs';
    drawn.add(h);
  }

  /* The four moving surfaces. */
  const n = lite ? 4 : 5;
  const leftAil = aileron(-1, wingFlap, shade, lite);
  const rightAil = aileron(1, wingFlap, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, stabPlan(Math.abs(x)).hinge);
  const elevator = hinged(elevatorGeometry(n), eh(-STAB_HALF), eh(STAB_HALF), tailFlap, shade);
  const rh = (y) => new THREE.Vector3(0, y, st(finPlan(y).hinge));
  const rudder = hinged(rudderGeometry(n), rh(STAB_Y + 0.03), rh(FIN_TOP), tailFlap, shade);

  /* The nose wheel on its strut, on a vertical pivot that turns with the
   * rudder, kadetcraft.js's noseSteer. */
  const noseSteer = new THREE.Group();
  noseSteer.position.set(0, 0, NOSE_AXLE[2]);
  {
    const top = bellyY(NOSE_S) + 0.004;
    const strut = new THREE.Mesh(merged([
      rod(new THREE.Vector3(0, top, 0), new THREE.Vector3(0, AXLE_Y + WHEEL_R + 0.004, 0), 0.006, rodSeg),
      rod(new THREE.Vector3(-(WHEEL_W / 2 + 0.003), AXLE_Y + WHEEL_R + 0.004, 0), new THREE.Vector3(WHEEL_W / 2 + 0.003, AXLE_Y + WHEEL_R + 0.004, 0), 0.003, rodSeg),
      rod(new THREE.Vector3(-(WHEEL_W / 2 + 0.003), AXLE_Y + WHEEL_R + 0.004, 0), new THREE.Vector3(-(WHEEL_W / 2 + 0.003), AXLE_Y, 0), 0.003, rodSeg),
      rod(new THREE.Vector3(WHEEL_W / 2 + 0.003, AXLE_Y + WHEEL_R + 0.004, 0), new THREE.Vector3(WHEEL_W / 2 + 0.003, AXLE_Y, 0), 0.003, rodSeg),
    ]), metal);
    strut.castShadow = shade;
    noseSteer.add(strut);
    const tyreGeo = new THREE.TorusGeometry(WHEEL_R - 0.008, 0.008, 6, lite ? 14 : 20);
    tyreGeo.rotateY(Math.PI / 2);
    tyreGeo.translate(0, AXLE_Y, 0);
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.name = 'tyre-nose';
    tyre.castShadow = shade;
    noseSteer.add(tyre);
    const hub = new THREE.CylinderGeometry(0.014, 0.014, WHEEL_W, seg);
    hub.rotateZ(Math.PI / 2);
    hub.translate(0, AXLE_Y, 0);
    noseSteer.add(new THREE.Mesh(hub, metal));
  }
  noseSteer.name = 'nose-steer';
  drawn.add(noseSteer);

  /* The ramp and the door, each on a pivot at its hinge with its skin
   * built where it closes, so rotation 0 is shut. */
  const shell = (s0, s1, pivot) => {
    const geo = skinPatch(s0, s1, Math.PI - HOLD_A - 0.04, Math.PI + HOLD_A + 0.04, 0.0030, 4, lite ? 6 : 10);
    geo.translate(0, -pivot.y, -pivot.z);
    return geo;
  };
  const rampPivot = new THREE.Group();
  rampPivot.position.set(0, bellyY(RAMP_HINGE_S), st(RAMP_HINGE_S));
  {
    const ramp = new THREE.Mesh(shell(RAMP_HINGE_S, RAMP_END_S, rampPivot.position), rampMat);
    ramp.name = 'ramp';
    ramp.castShadow = shade;
    rampPivot.add(ramp);
  }
  rampPivot.name = 'ramp-hinge';
  drawn.add(rampPivot);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(0, bellyY(DOOR_HINGE_S), st(DOOR_HINGE_S));
  {
    const door = new THREE.Mesh(shell(RAMP_END_S + 0.002, DOOR_HINGE_S, doorPivot.position), rampMat);
    door.name = 'cargo-door';
    door.castShadow = shade;
    doorPivot.add(door);
  }
  doorPivot.name = 'cargo-door-hinge';
  drawn.add(doorPivot);

  const surfaces = {
    'aileron-left': leftAil,
    'aileron-right': rightAil,
    elevator,
    rudder,
  };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    drawn.add(s.pivot);
  }

  /* The camera behind the windscreen. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, HERCULES_MOUNT_UP, -HERCULES_MOUNT_FORWARD);
  cameraMount.name = 'hercules-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.020, 0.020), camBody);
    housing.position.set(0, 0, 0.012);
    cameraMount.add(housing);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0080, 0.0086, 0.012, lite ? 8 : 14), camBody);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.004);
    cameraMount.add(barrel);
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0072, lite ? 10 : 18), lens);
    glassDisc.rotation.y = Math.PI;
    glassDisc.position.set(0, 0, -0.0102);
    cameraMount.add(glassDisc);
  }

  /* Four motors, spinners and props, one slot each, cubcraft.js's mount:
   * slots 0 to 3 from the left outboard to the right outboard. */
  const discs = [];
  const blades = [];
  const leds = [];
  const bladeGeo = bladeGeometry(lite ? 5 : 8);
  bladeGeo.rotateX(-Math.PI / 2);
  bladeGeo.rotateZ((15 * Math.PI) / 180);
  const pair = mergeGeometries([bladeGeo, bladeGeo.clone().rotateY(Math.PI)], false);
  const spinnerProfile = (() => {
    const back = -0.030;
    const len = 0.050;
    const m = lite ? 4 : 6;
    const prof = [new THREE.Vector2(0.0001, back)];
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      prof.push(new THREE.Vector2(Math.max(0.0005, SPINNER_R * Math.sqrt(1 - u * u)), back + 0.004 + (len - back - 0.004) * u));
    }
    return prof;
  })();
  for (const x of [-NACELLES[1], -NACELLES[0], NACELLES[0], NACELLES[1]]) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.014, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(x, THRUST_Y, st(PROP_S + 0.022));
    drawn.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(x, THRUST_Y, st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    drawn.add(propMount);
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(spinnerProfile, lite ? 10 : 14), spinnerMat);
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    propMount.add(spinner);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const bladeMesh = new THREE.Mesh(pair, propMat);
    bladeMesh.castShadow = shade;
    rotor.add(bladeMesh);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({ color: 0x3a3c40, transparent: true, opacity: 0.12, depthWrite: false, fog }),
    );
    disc.renderOrder = 1;
    disc.visible = false;
    propMount.add(disc);
    discs.push(disc);
  }

  /* The blur, extracraft.js's, on all four discs: full is 0.85 of the
   * derive's 9,657 rpm no load, 860 rad/s. */
  const DISC_FULL = 860;
  function setProp(omega) {
    const k = Math.min(1, Math.max(0, omega) / DISC_FULL);
    for (const disc of discs) {
      disc.visible = k > 0.04;
      disc.material.opacity = 0.32 * k;
    }
    return 0;
  }

  /* Four lamps on the four slots the pose driver walks: the wingtips, the
   * radome and the tail cone. */
  const tipTop = (x) => wingAt(x)(0.4, 1);
  const lampAt = [
    { p: tipTop(-(HALF - 0.03)), front: true },
    { p: tipTop(HALF - 0.03), front: false },
    { p: fusePoint(0.040, 0, 0.002), front: true },
    { p: fusePoint(FUSE_END_S - 0.04, 0, 0.002), front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.014), ledMat);
    led.position.copy(at.p);
    led.position.y += 0.001;
    drawn.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

  /* Pose the surfaces, cubcraft.js's signs; the nose wheel turns with the
   * rudder, kadetcraft.js's sense. */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    noseSteer.rotation.y = HERCULES_NOSE_STEER * rudRad;
  }
  /* The ramp and door, t 0 shut to 1 open. A positive turn about +x
   * swings the ramp's aft end down and the door's forward edge up. */
  function setRamp(t) {
    const u = Math.min(1, Math.max(0, t));
    rampPivot.rotation.x = u * (RAMP_UP + RAMP_DOWN);
    doorPivot.rotation.x = u * (DOOR_DOWN + DOOR_UP);
  }
  setSurfaces(0, 0, 0, 0);
  setRamp(0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: HERCULES_PROP_SPIN,
    setSurfaces,
    setProp,
    setRamp,
    livery: coat.livery,
  };
}
