/*
 * uglystikcraft.js: the Ugly Stik's model, and nothing else.
 *
 * Its own file for the reason every plane has one: nothing else in the
 * hangar is a slab sided box with a square wing sat on its top, a flat
 * stabiliser under its tail and a round egg of a fin over it, the shape
 * Phil Kraft's friends said looked "beat with an ugly stick".
 *
 * The subject is Das Ugly Stik as RCM published it, plan 939, May and
 * June 1985 (Jim Jensen's kit of Kraft's 1966 design), in the scheme of
 * RCM's own model: red, the wing's outer panels and the fin white, black
 * crosses (docs/UGLYSTIK-STAGE1.md). The plan is drawn full size, and the
 * outline here is measured off it, in inches:
 *
 *   wing          12.48 in from the leading edge to the hinge, constant,
 *                 on a 15.6 percent section within a percent of
 *                 symmetric, at half a degree of incidence, its chord line
 *                 on the fuselage's top (a shoulder wing); the tips raked
 *                 from 28.0 in out at the leading edge to 30.87 at the
 *                 aileron's trailing edge; 1.5 in of dihedral a side at the
 *                 tip rib
 *   ailerons      strip ailerons of 1/4 in sheet behind the hinge from
 *                 5.7 in out to the tip, scalloped between the ribs, 1.29
 *                 in at the scallops' points and 1.10 in their hollows
 *   fuselage      a box of 1/4 in sheet with a flat bottom, 3.55 in wide at
 *                 the firewall and 3.96 under the wing, tapering to 0.8 in
 *                 at the rudder post; 3.6 in deep at the firewall, its top
 *                 rising along the hatch to the wing, then falling to the
 *                 post
 *   stabiliser    flat, on the fuselage's bottom, 5.79 in to the hinge and
 *                 a scalloped 1.67 in elevator; 19.2 in across its leading
 *                 edge and 22.3 over the elevator's tips
 *   fin, rudder   the egg, 11.6 in long and 8.2 in over the fuselage at
 *                 the rudder's hinge, the rudder its aft 3.96 in; a 3/16 in
 *                 sub fin under the tail and a wire skid
 *   engine        an O.S. 61FX mounted on its side, the cylinder out to
 *                 the right at 45 deg ("Engine mounted at 45 deg angle"),
 *                 a 12 x 6 wooden prop, the prop's plane 4.25 in ahead of
 *                 the firewall
 *   gear          a tricycle: a Goldberg 5/32 in nose leg to a 2 3/4 in
 *                 Du-Bro wheel, and a dural strap to 3 1/2 in Du-Bro
 *                 wheels on a 16.1 in track
 *
 * Stations are inches aft of the prop's plane, heights the plan's inches
 * DOWN the sheet, where the fuselage's flat bottom is at 22.08; st() and
 * ht() turn them into the craft frame: x right, y up, z aft, metres, THE
 * ORIGIN AT THE CG, the plan's C.G. mark at station 16.00, height 20.00
 * (docs/UGLYSTIK-STAGE1.md).
 *
 * The contract with the shell is kadetcraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians,
 * ailerons and elevator positive trailing edge up, the rudder positive
 * trailing edge left, the nose wheel turning with it at 0.6 of its angle
 * (src/native/plant.c, the nose wheel's steer).
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

const IN = 0.0254;
const CG_S = 16.0;
const CG_H = 20.0;
const st = (s) => (s - CG_S) * IN;
const ht = (h) => (CG_H - h) * IN;

/* The wing. */
const LE_S = 11.31;
const CHORD = 12.48;
const HINGE_S = LE_S + CHORD;
const HALF_LE = 28.0;
const HALF_HINGE = 30.57;
const HALF_TIP = 30.87;
const AIL_IN = 5.7;
const AIL_POINT = 1.29;
const AIL_HOLLOW = 1.10;
const RIB_PITCH = 3.63;
const WING_T = 0.156;
const CHORD_H = 17.95;
const INCIDENCE = (0.5 * Math.PI) / 180;
const DIHEDRAL = Math.atan(1.5 / 28.0);
/* The white panels and their crosses, off RCM's photographs and the
 * plan's "(WHITE)" and "(BLACK)" (ESTIMATED): the panel from 15.5 to 26.5
 * in out, the cross 8 in across centred at 21 in. */
const PANEL_IN = 15.5;
const PANEL_OUT = 26.5;
const CROSS_Y = 21.0;
const CROSS_R = 4.0;

/* The fuselage: [station, top height, half width], inches; the bottom is
 * flat at 22.08. */
const BOTTOM_H = 22.08;
const FUSE = [
  [4.25, 18.47, 1.775],
  [LE_S, 17.92, 1.98],
  [HINGE_S, 18.00, 1.98],
  [49.28, 21.40, 0.40],
];
const FIREWALL_S = 4.25;
const POST_S = 46.86;

/* The tail. */
const STAB_LE_S = 41.52;
const ELEV_HINGE_S = 47.22;
const ELEV_POINT = 1.67;
const ELEV_HOLLOW = 1.45;
const STAB_HALF_LE = 9.58;
const STAB_HALF_HINGE = 10.9;
const STAB_HALF_TIP = 11.15;
const STAB_H = 22.06;
const STAB_T = 0.31;
const FIN_T = 0.25;
const RUDDER_S = 46.86;
/* The egg over the fuselage, the plan's side view: [station, height]
 * around from the fin's foot, over the top, down the rudder's back to its
 * foot at the hinge. */
const EGG = [
  [39.32, 20.40], [39.22, 19.40], [39.72, 17.30], [40.82, 15.60], [42.42, 14.30],
  [44.42, 13.50], [46.86, 13.17], [48.92, 13.60], [50.22, 14.90], [50.82, 16.50],
  [50.82, 18.00], [50.32, 19.60], [49.42, 20.80], [48.22, 21.40], [46.86, 21.39],
];
const SUBFIN = [[40.32, 22.08], [46.72, 23.60], [46.72, 22.08]];

/* The engine and prop. */
const PROP_R = 6.0 * IN;
const THRUST_H = 20.17;

/* The gear, the plan's axles and wheels. */
const NOSE_S = 5.20;
const NOSE_H = 26.32;
const NOSE_R = 1.375 * IN;
const MAIN_S = 17.00;
const MAIN_H = 26.25;
const MAIN_R = 1.75 * IN;
const MAIN_TRACK = 16.08;
const STRAP_FOOT = 7.24;
const WHEEL_W = 1.0 * IN;
export const UGLYSTIK_NOSE_STEER = 0.6;

/* The NACA four digit thickness, half of it, at chord fraction t. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}

/* A closed section: over the top from f0 to f1 and back under, cosine
 * spaced. */
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

/* cubcraft.js's loft: closed sections skinned and capped, wound by the
 * sign of the enclosed volume. */
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
 * The wing's plan at |x| inches out: its leading edge and the chord to the
 * hinge. Inside HALF_LE the full chord; outside it the raked tip cuts the
 * leading edge back toward the hinge's tip corner.
 */
function wingPlan(ax) {
  if (ax <= HALF_LE) {
    return { le: LE_S, c: CHORD };
  }
  const u = Math.min(1, (ax - HALF_LE) / (HALF_HINGE - HALF_LE));
  const le = LE_S + CHORD * u;
  return { le, c: Math.max(0.05, HINGE_S - le) };
}
/* The section at x inches out (negative left): thickness on the plan's
 * root chord, the incidence tipping the trailing edge down and the
 * dihedral raising it along the span. */
function wingAt(x) {
  const ax = Math.abs(x);
  const { le, c } = wingPlan(ax);
  const y0 = ht(CHORD_H) + ax * Math.tan(DIHEDRAL) * IN;
  return (t, side) => {
    const s = le + t * c;
    return new THREE.Vector3(x * IN, y0 - (s - LE_S) * Math.tan(INCIDENCE) * IN + side * CHORD * naca((s - LE_S) / CHORD, WING_T) * IN, st(s));
  };
}
/* The scalloped trailing edge of a strip surface: the point at each rib,
 * the hollow between. */
function scallop(ax, point, hollow, pitch, from) {
  const u = ((ax - from) / pitch) % 1;
  const d = Math.abs(Math.sin(Math.PI * u));
  return point - (point - hollow) * d;
}
/* The aileron at x inches out: the hinge behind the wing, the chord to the
 * scalloped edge; the raked tip carries on across it. */
function aileronAt(x) {
  const ax = Math.abs(x);
  const y0 = ht(CHORD_H) + ax * Math.tan(DIHEDRAL) * IN - CHORD * Math.tan(INCIDENCE) * IN;
  let c = scallop(ax, AIL_POINT, AIL_HOLLOW, RIB_PITCH, AIL_IN);
  if (ax > HALF_HINGE) {
    c = Math.max(0.05, c * (1 - (ax - HALF_HINGE) / (HALF_TIP - HALF_HINGE)));
  }
  return (t, side) => new THREE.Vector3(x * IN, y0 + side * 0.125 * IN * (1 - t), st(HINGE_S + t * c));
}

function spanStations(from, to, step) {
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
  const xs = [];
  for (let i = 0; i <= n; i += 1) {
    xs.push(from + ((to - from) * i) / n);
  }
  return xs;
}
function wingGeometry(lite, from, to) {
  const n = lite ? 8 : 12;
  const xs = spanStations(from, to, lite ? 8 : 3);
  if (Math.max(Math.abs(from), Math.abs(to)) > HALF_LE) {
    const tipIn = Math.sign(to + from) * HALF_LE;
    for (const x of spanStations(tipIn, Math.sign(to + from) * HALF_HINGE, 0.5)) {
      if (!xs.some((y) => Math.abs(y - x) < 1e-6)) xs.push(x);
    }
    xs.sort((a, b) => a - b);
  }
  return loft(xs.filter((x) => Math.abs(x) <= HALF_HINGE).map((x) => section(wingAt(x), 0, 1, n)));
}
function aileronGeometry(lite, sign) {
  const xs = spanStations(AIL_IN + 0.02, HALF_TIP - 0.02, lite ? 1.0 : 0.3).map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  return loft(xs.map((x) => section(aileronAt(x), 0, 1, 3)));
}

/* A cross of the Stik's scheme, a black Maltese cross laid on a surface:
 * four arms widening outward, as a flat shape centred at (0, 0), r its
 * half span, inches. */
function crossShape(r) {
  const s = new THREE.Shape();
  const w0 = 0.22 * r;
  const w1 = 0.45 * r;
  const pts = [];
  for (let k = 0; k < 4; k += 1) {
    const a = (k * Math.PI) / 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const at = (u, v) => [u * c - v * sn, u * sn + v * c];
    pts.push(at(w0, -w0), at(r, -w1), at(r, w1), at(w0, w0));
  }
  s.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i += 1) {
    s.lineTo(...pts[i]);
  }
  s.closePath();
  return s;
}

/* The fuselage at station s: its top height, half width, inches. */
function fuseAt(s) {
  const t = Math.min(Math.max(s, FUSE[0][0]), FUSE[FUSE.length - 1][0]);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      return { top: a[1] + (b[1] - a[1]) * u, w: a[2] + (b[2] - a[2]) * u };
    }
  }
  throw new Error(`uglystikcraft: station ${s} is off the fuselage`);
}
/* A ring round the box at station s, its corners rounded on a quarter
 * inch, as the kit's "sand a radius on all the outside corners". */
function fuseRing(s, n) {
  const { top, w } = fuseAt(s);
  const yTop = ht(top);
  const yBot = ht(BOTTOM_H);
  const hw = w * IN;
  const r = Math.min(0.25 * IN, hw * 0.45, (yTop - yBot) * 0.45);
  const corners = [
    [hw - r, yTop - r, 0], [-(hw - r), yTop - r, Math.PI / 2],
    [-(hw - r), yBot + r, Math.PI], [hw - r, yBot + r, (3 * Math.PI) / 2],
  ];
  const ring = [];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= n; i += 1) {
      const a = a0 + ((Math.PI / 2) * i) / n;
      ring.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), st(s)));
    }
  }
  return ring;
}
function fuseGeometry(lite, from, to) {
  const n = lite ? 1 : 3;
  const xs = spanStations(from, to, lite ? 12 : 4);
  for (const f of FUSE) {
    if (f[0] > from && f[0] < to && !xs.includes(f[0])) xs.push(f[0]);
  }
  xs.sort((a, b) => a - b);
  return loft(xs.map((s) => fuseRing(s, n)));
}

/* A flat outline in the side plane (station, height pairs), extruded
 * `thick` inches across the centre line. */
function sidePlate(points, thick) {
  const shape = new THREE.Shape();
  shape.moveTo(st(points[0][0]), ht(points[0][1]));
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(st(points[i][0]), ht(points[i][1]));
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick * IN, bevelEnabled: false, curveSegments: 4 });
  /* The shape's x is the station (craft z), its y the height: turn it so
   * x runs aft and the extrusion runs across. */
  g.rotateY(-Math.PI / 2);
  g.translate((thick * IN) / 2, 0, 0);
  return g;
}

/* A round rod from a to b. */
function rod(a, b, r, seg, flat = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.scale(1 / flat, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/* A 12 x 6 wooden blade, cubcraft.js's outline drawn to this disc. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0060, 0.010);
  s.bezierCurveTo(0.0240, -0.016, 0.0200, -r * 0.45, 0.0080, -r * 0.96);
  s.lineTo(-0.0060, -r * 0.93);
  s.bezierCurveTo(-0.0180, -r * 0.40, -0.0130, -0.010, -0.0045, 0.010);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false, curveSegments: segments });
}

function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('uglystikcraft: merge failed');
  }
  return geo;
}

/*
 * The gear and the attitude it sits the aircraft at: the ground line
 * tangent under the nose wheel's and the mains' circles, nose up
 * positive. The plan's nose wheel's bottom sits 0.31 in higher in the
 * craft than the mains', so it rests 1.48 deg nose down, negative.
 */
const MAIN_AXLE = [(MAIN_TRACK / 2) * IN, ht(MAIN_H), st(MAIN_S)];
const NOSE_AXLE = [0, ht(NOSE_H), st(NOSE_S)];
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

const EGG_TOP = Math.min(...EGG.map((p) => p[1]));
const UP = ht(EGG_TOP);
const DOWN = -(MAIN_AXLE[1] - MAIN_R);
const RUDDER_TE_S = Math.max(...EGG.map((p) => p[0]));
const NOSE_S_TIP = -0.6;
const REACH = Math.max(Math.hypot(HALF_TIP * IN, st(HINGE_S + AIL_POINT)), Math.abs(st(RUDDER_TE_S)));
export const UGLYSTIK_DIMS = {
  span: 2 * HALF_TIP * IN,
  chord: CHORD * IN,
  dihedralDeg: (DIHEDRAL * 180) / Math.PI,
  stabSpan: 2 * STAB_HALF_TIP * IN,
  gearTrack: MAIN_TRACK * IN,
  propR: PROP_R,
  thrustY: ht(THRUST_H),
  noseZ: st(NOSE_S_TIP),
  tailZ: st(RUDDER_TE_S),
  length: (RUDDER_TE_S - NOSE_S_TIP) * IN,
  reach: REACH,
  vHalfUp: UP,
  vHalfDown: DOWN,
  wing: {
    le: st(LE_S), te: st(HINGE_S), half: HALF_TIP * IN, rootY: ht(CHORD_H), tipY: ht(CHORD_H) + HALF_LE * Math.tan(DIHEDRAL) * IN,
  },
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: WHEEL_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: WHEEL_W },
    nose: { axle: [...NOSE_AXLE], r: NOSE_R, width: WHEEL_W },
  },
  contact: {
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    nose: [0, NOSE_AXLE[1] - NOSE_R, NOSE_AXLE[2]],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: (REST_PITCH * 180) / Math.PI,
    cgHeight: REST_CG_HEIGHT,
    contact: {
      mainLeft: restContact([-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], MAIN_R),
      mainRight: restContact(MAIN_AXLE, MAIN_R),
      nose: restContact(NOSE_AXLE, NOSE_R),
    },
  },
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: REACH,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: (RUDDER_TE_S - NOSE_S_TIP) * IN,
    bodyWidth: 2 * HALF_TIP * IN,
    bodyHeight: UP + DOWN,
  },
};

/* The FPV camera on the hatch ahead of the wing. */
const CAM_S = 9.0;
export const UGLYSTIK_MOUNT_FORWARD = -st(CAM_S);
export const UGLYSTIK_MOUNT_UP = ht(fuseAt(CAM_S).top) + 0.012;

/* A glow engine turns counter clockwise seen from the front, which is
 * clockwise from behind: cubcraft.js's sense. */
export const UGLYSTIK_PROP_SPIN = [1, 0, 0, 0];

export function buildUglystikCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'uglystik-craft';
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
  const rodSeg = lite ? 4 : 6;

  /* RCM's scheme by region (src/render/livery.js): red on the wing, the
   * fuselage and the tail, each its own region, the moving surfaces a
   * shade down so the hinge lines read; white panels; black crosses. */
  const coat = paintRegions();
  const redOf = (id) => coat.base(id, cel({ color: 0xc8161a, rim: 0.30, spec: 0.42, specWidth: 0.016 }));
  const flapOf = (id) => coat.shade(id, cel({ color: 0xae1216, rim: 0.30, spec: 0.38, specWidth: 0.016 }));
  const wingMat = redOf('wing');
  const fuseMat = redOf('fuselage');
  const tailMat = redOf('tail');
  const panelMat = coat.base('panels', cel({ color: 0xf2efe6, rim: 0.28, spec: 0.40, specWidth: 0.016 }));
  const panelFlap = coat.shade('panels', cel({ color: 0xdcd8ce, rim: 0.28, spec: 0.36, specWidth: 0.016 }));
  const crossMat = coat.base('crosses', cel({ color: 0x141416, rim: 0.26, spec: 0.30, side: THREE.DoubleSide }));
  const wingFlap = flapOf('wing');
  const tailFlap = flapOf('tail');
  const metal = cel({ color: 0xc2c6ca, rim: 0.30, spec: 0.75, specWidth: 0.022 });
  const engineMat = cel({ color: 0xb4b2ac, rim: 0.30, spec: 0.65, specWidth: 0.022 });
  const engineBlack = cel({ color: 0x202022, rim: 0.26, spec: 0.35 });
  const tyre = cel({ color: 0x1b1b1d, rim: 0.30, spec: 0.20 });
  const hub = cel({ color: 0xd8d4c8, rim: 0.28, spec: 0.35 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x101610, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xf3ead4, side: THREE.DoubleSide,
  });
  const ring = cel({ color: 0xb8b09e, rim: 0.28, spec: 0.55 });
  const propMat = cel({ color: 0x8a5a2c, rim: 0.26, spec: 0.30 });
  const stator = cel({ color: 0x9a9ea2, rim: 0.28, spec: 0.55, specWidth: 0.02 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c0c0e;

  if (opts.measure) {
    const d = UGLYSTIK_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), wingMat);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The box: red, with the white band and its cross behind the wing. */
  {
    const BAND = [24.4, 28.9];
    const red = new THREE.Mesh(merged([fuseGeometry(lite, FIREWALL_S, BAND[0]), fuseGeometry(lite, BAND[1], FUSE[FUSE.length - 1][0])]), fuseMat);
    red.name = 'uglystik-fuselage';
    red.castShadow = shade;
    hull(red, 1.018, ink);
    group.add(red);
    const band = new THREE.Mesh(fuseGeometry(lite, BAND[0], BAND[1]), panelMat);
    band.name = 'uglystik-band';
    band.castShadow = shade;
    group.add(band);
    const crosses = [];
    const mid = (BAND[0] + BAND[1]) / 2;
    const { top, w } = fuseAt(mid);
    const cy = (ht(top) + ht(BOTTOM_H)) / 2;
    for (const sign of [-1, 1]) {
      const g = new THREE.ShapeGeometry(crossShape(1.6 * IN));
      g.rotateY((sign * Math.PI) / 2);
      g.translate(sign * (w * IN + 0.0008), cy, st(mid));
      crosses.push(g);
    }
    const crossMesh = new THREE.Mesh(merged(crosses), crossMat);
    crossMesh.name = 'uglystik-fuselage-crosses';
    group.add(crossMesh);
  }

  /* The wing: red to the white panels, the panels, the red tips; the
   * crosses laid on the panels, top and bottom. */
  {
    const red = new THREE.Mesh(merged([
      wingGeometry(lite, -PANEL_IN, PANEL_IN),
      wingGeometry(lite, -HALF_HINGE, -PANEL_OUT),
      wingGeometry(lite, PANEL_OUT, HALF_HINGE),
    ]), wingMat);
    red.name = 'uglystik-wing';
    red.castShadow = shade;
    hull(red, 1.012, ink);
    group.add(red);
    const white = new THREE.Mesh(merged([
      wingGeometry(lite, -PANEL_OUT, -PANEL_IN),
      wingGeometry(lite, PANEL_IN, PANEL_OUT),
    ]), panelMat);
    white.name = 'uglystik-panels';
    white.castShadow = shade;
    group.add(white);
    const crosses = [];
    for (const sign of [-1, 1]) {
      for (const side of [1, -1]) {
        const x = sign * CROSS_Y;
        const tMid = 0.42;
        const p = wingAt(x)(tMid, side);
        const g = new THREE.ShapeGeometry(crossShape(CROSS_R * IN));
        g.rotateX((side * -Math.PI) / 2);
        g.rotateZ(sign * DIHEDRAL);
        g.translate(p.x, p.y + side * 0.0012, p.z);
        crosses.push(g);
      }
    }
    const crossMesh = new THREE.Mesh(merged(crosses), crossMat);
    crossMesh.name = 'uglystik-wing-crosses';
    group.add(crossMesh);
  }

  /* The stabiliser, flat on the fuselage's bottom: a thin slab to the
   * hinge. */
  const stabPlan = (ax) => {
    const u = ax / STAB_HALF_HINGE;
    return { le: STAB_LE_S + (u > STAB_HALF_LE / STAB_HALF_HINGE ? (ax - STAB_HALF_LE) / (STAB_HALF_HINGE - STAB_HALF_LE) * (ELEV_HINGE_S - STAB_LE_S) : 0) };
  };
  const slab = (x, le, c, h, t) => (tt, side) => new THREE.Vector3(x * IN, ht(h) + side * t * IN * 0.5 * Math.min(1, 4 * Math.min(tt, 1 - tt) + 0.3), st(le + tt * c));
  {
    const xs = spanStations(-STAB_HALF_HINGE, STAB_HALF_HINGE, lite ? 6 : 1.5);
    const geo = loft(xs.map((x) => {
      const { le } = stabPlan(Math.abs(x));
      return section(slab(x, le, Math.max(0.05, ELEV_HINGE_S - le), STAB_H, STAB_T), 0, 1, 4);
    }));
    const stab = new THREE.Mesh(geo, tailMat);
    stab.name = 'uglystik-stab';
    stab.castShadow = shade;
    hull(stab, 1.02, ink);
    group.add(stab);
  }

  /* The fin's fixed part and the sub fin, white; the cross over the fin
   * and the rudder. */
  const finFixed = EGG.filter((p) => p[0] <= RUDDER_S + 1e-6);
  const finPoly = [...finFixed.slice(0, finFixed.length), [RUDDER_S, EGG[EGG.length - 1][1]]];
  {
    const fin = new THREE.Mesh(merged([sidePlate(finPoly, FIN_T), sidePlate(SUBFIN, 3 / 16)]), panelMat);
    fin.name = 'uglystik-fin';
    fin.castShadow = shade;
    hull(fin, 1.03, ink);
    group.add(fin);
  }

  /* The engine: the O.S. 61FX on its side, the crankcase on the thrust
   * line, the finned cylinder and its head out to the right at 45 deg, the
   * silencer under it, the needle valve and the mount's beams back to the
   * firewall. */
  {
    const parts = [];
    const blacks = [];
    const yT = ht(THRUST_H);
    const crank = new THREE.CylinderGeometry(0.95 * IN, 0.95 * IN, 1.6 * IN, seg);
    crank.rotateX(Math.PI / 2);
    crank.translate(0, yT, st(2.4));
    parts.push(crank);
    const nose = new THREE.CylinderGeometry(0.42 * IN, 0.55 * IN, 1.1 * IN, seg);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, yT, st(1.0));
    parts.push(nose);
    const back = new THREE.CylinderGeometry(0.85 * IN, 0.85 * IN, 0.5 * IN, seg);
    back.rotateX(Math.PI / 2);
    back.translate(0, yT, st(3.45));
    blacks.push(back);
    /* The cylinder's axis out to the right and up at 45 deg: x right. */
    const dir = new THREE.Vector3(Math.SQRT1_2, Math.SQRT1_2, 0);
    const at = (d) => new THREE.Vector3(dir.x * d * IN, yT + dir.y * d * IN, st(2.4));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const barrel = new THREE.CylinderGeometry(0.62 * IN, 0.62 * IN, 1.8 * IN, seg);
    barrel.applyQuaternion(q);
    const c0 = at(1.8);
    barrel.translate(c0.x, c0.y, c0.z);
    parts.push(barrel);
    const fins = lite ? 3 : 8;
    for (let i = 0; i < fins; i += 1) {
      const f = new THREE.CylinderGeometry(0.95 * IN, 0.95 * IN, 0.05 * IN, seg);
      f.applyQuaternion(q);
      const p = at(1.2 + (i * 1.5) / fins);
      f.translate(p.x, p.y, p.z);
      parts.push(f);
    }
    const head = new THREE.CylinderGeometry(0.8 * IN, 0.9 * IN, 0.45 * IN, seg);
    head.applyQuaternion(q);
    const ph = at(2.95);
    head.translate(ph.x, ph.y, ph.z);
    parts.push(head);
    const plug = rod(at(3.1), at(3.45), 0.12 * IN, 6);
    blacks.push(plug);
    /* The silencer on the exhaust side, under the cylinder. */
    const muff = new THREE.CylinderGeometry(0.6 * IN, 0.6 * IN, 2.6 * IN, seg);
    muff.rotateX(Math.PI / 2);
    muff.translate(1.9 * IN, yT - 0.9 * IN, st(2.9));
    parts.push(muff);
    parts.push(rod(new THREE.Vector3(0.9 * IN, yT - 0.3 * IN, st(2.4)), new THREE.Vector3(1.6 * IN, yT - 0.8 * IN, st(2.6)), 0.3 * IN, 6));
    /* The carburettor and its needle on the left of the crankcase. */
    const carb = rod(new THREE.Vector3(-0.8 * IN, yT, st(1.6)), new THREE.Vector3(-1.5 * IN, yT, st(1.6)), 0.3 * IN, 8);
    parts.push(carb);
    blacks.push(rod(new THREE.Vector3(-1.4 * IN, yT, st(1.6)), new THREE.Vector3(-2.1 * IN, yT, st(1.6)), 0.06 * IN, 5));
    /* The mount's two beams, back to the firewall. */
    for (const sign of [-1, 1]) {
      const b = new THREE.BoxGeometry(0.35 * IN, 0.3 * IN, 1.8 * IN);
      b.translate(sign * 1.05 * IN, yT - 0.55 * IN, st(3.35));
      blacks.push(b);
    }
    const eng = new THREE.Mesh(merged(parts), engineMat);
    eng.name = 'uglystik-engine';
    eng.castShadow = shade;
    group.add(eng);
    const engB = new THREE.Mesh(merged(blacks), engineBlack);
    engB.name = 'uglystik-engine-black';
    engB.castShadow = shade;
    group.add(engB);
  }

  /* The gear: the dural strap bolted across the fuselage's bottom and out
   * and down to the axles, the axles and wire; the nose leg from its
   * bearing on the firewall, a coil over the fork, turning with the
   * rudder in its own group. */
  const noseSteer = new THREE.Group();
  {
    const parts = [];
    const bottom = ht(BOTTOM_H);
    const strapW = 1.0 * IN;
    const topHalf = 2.0 * IN;
    for (const sign of [-1, 1]) {
      const inner = new THREE.Vector3(sign * topHalf, bottom - 0.002, st(MAIN_S - 0.5));
      const foot = new THREE.Vector3(sign * STRAP_FOOT * IN, MAIN_AXLE[1] + 0.004, st(MAIN_S));
      /* A flat strap, an inch fore and aft and an eighth thick: a rod
       * whose round section is squashed across and stretched along. */
      parts.push(rod(inner, foot, 0.0045, 6, 2.8));
      parts.push(rod(new THREE.Vector3(sign * STRAP_FOOT * IN, MAIN_AXLE[1], MAIN_AXLE[2]), new THREE.Vector3(sign * (MAIN_AXLE[0] + WHEEL_W / 2 + 0.003), MAIN_AXLE[1], MAIN_AXLE[2]), 0.002, rodSeg));
    }
    const across = new THREE.BoxGeometry(2 * topHalf, 0.004, strapW);
    across.translate(0, bottom - 0.002, st(MAIN_S - 0.5));
    parts.push(across);
    const strap = new THREE.Mesh(merged(parts), metal);
    strap.name = 'uglystik-strap';
    strap.castShadow = shade;
    group.add(strap);

    noseSteer.position.set(0, 0, NOSE_AXLE[2]);
    group.add(noseSteer);
    const wire = 0.002;
    const top = ht(BOTTOM_H) + 0.3 * IN;
    const legTop = new THREE.Vector3(0, top, st(FIREWALL_S - 0.3) - NOSE_AXLE[2]);
    const forkTop = new THREE.Vector3(0, NOSE_AXLE[1] + NOSE_R + 0.012, 0);
    const legParts = [rod(legTop, forkTop, wire, rodSeg)];
    legParts.push(new THREE.TorusGeometry(0.008, wire, 4, lite ? 8 : 12).rotateX(Math.PI / 2).translate(forkTop.x, forkTop.y + 0.02, forkTop.z + (legTop.z - forkTop.z) * 0.1));
    for (const sign of [-1, 1]) {
      legParts.push(rod(forkTop, new THREE.Vector3(sign * (WHEEL_W / 2 + 0.003), forkTop.y, 0), wire, rodSeg));
      legParts.push(rod(new THREE.Vector3(sign * (WHEEL_W / 2 + 0.003), forkTop.y, 0), new THREE.Vector3(sign * (WHEEL_W / 2 + 0.003), NOSE_AXLE[1], 0), wire, rodSeg));
    }
    const leg = new THREE.Mesh(merged(legParts), metal);
    leg.name = 'uglystik-nose-leg';
    leg.castShadow = shade;
    noseSteer.add(leg);
    /* The skid under the sub fin, 1/16 in wire. */
    const skid = new THREE.Mesh(rod(new THREE.Vector3(0, ht(23.5), st(45.5)), new THREE.Vector3(0, ht(23.75), st(47.2)), 0.001, 4), metal);
    skid.name = 'uglystik-skid';
    group.add(skid);
  }

  /* The wheels: Du-Bro's treaded tyres and white hubs. */
  {
    const wheel = (r, x, y, z) => {
      const t = new THREE.TorusGeometry(r - 0.010, 0.010, lite ? 5 : 8, lite ? 16 : 24);
      t.rotateY(Math.PI / 2);
      t.scale(WHEEL_W / 0.020, 1, 1);
      t.translate(x, y, z);
      return t;
    };
    const hubOf = (r, x, y, z) => {
      const h = new THREE.CylinderGeometry(r - 0.018, r - 0.018, WHEEL_W * 0.7, seg);
      h.rotateZ(Math.PI / 2);
      h.translate(x, y, z);
      return h;
    };
    const tyres = [];
    const hubs = [];
    for (const sign of [-1, 1]) {
      tyres.push(wheel(MAIN_R, sign * MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]));
      hubs.push(hubOf(MAIN_R, sign * MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]));
    }
    const mainTyres = new THREE.Mesh(merged(tyres), tyre);
    mainTyres.name = 'uglystik-tyres';
    mainTyres.castShadow = shade;
    group.add(mainTyres);
    group.add(Object.assign(new THREE.Mesh(merged(hubs), hub), { name: 'uglystik-hubs' }));
    const noseTyre = new THREE.Mesh(wheel(NOSE_R, 0, NOSE_AXLE[1], 0), tyre);
    noseTyre.name = 'tyre-nose';
    noseTyre.castShadow = shade;
    noseSteer.add(noseTyre);
    noseSteer.add(new THREE.Mesh(hubOf(NOSE_R, 0, NOSE_AXLE[1], 0), hub));
  }

  /* The moving surfaces: the strip ailerons, red with their share of the
   * white panels; the elevator's halves on one hinge; the rudder, white,
   * with its half of the fin's cross. */
  const hinged = (geo, a, b, material) => {
    const axis = new THREE.Vector3().subVectors(b, a).normalize();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    geo.translate(-mid.x, -mid.y, -mid.z);
    const pivot = new THREE.Group();
    pivot.position.copy(mid);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shade;
    pivot.add(mesh);
    return { pivot, axis, mesh };
  };
  const hingeAt = (x) => aileronAt(x)(0, 1).add(aileronAt(x)(0, -1)).multiplyScalar(0.5);
  const aileron = (sign) => {
    const a = hingeAt(sign * AIL_IN);
    const b = hingeAt(sign * HALF_TIP);
    const [p, q] = sign < 0 ? [b, a] : [a, b];
    const s = hinged(aileronGeometry(lite, sign), p, q, wingFlap);
    /* The panel's stretch of it, white over the red. */
    const xs = spanStations(PANEL_IN, PANEL_OUT, lite ? 2 : 0.5).map((x) => sign * x);
    if (sign < 0) xs.reverse();
    const panel = loft(xs.map((x) => section((t, side) => aileronAt(x)(t, side).add(new THREE.Vector3(0, side * 0.0006, 0)), 0, 1, 3)));
    panel.translate(-s.pivot.position.x, -s.pivot.position.y, -s.pivot.position.z);
    const m = new THREE.Mesh(panel, panelFlap);
    s.pivot.add(m);
    return s;
  };
  const leftAil = aileron(-1);
  const rightAil = aileron(1);

  const elevAt = (x) => {
    const ax = Math.abs(x);
    let c = scallop(ax, ELEV_POINT, ELEV_HOLLOW, 2.6, 0.5);
    if (ax > STAB_HALF_HINGE) {
      c *= 1 - (ax - STAB_HALF_HINGE) / (STAB_HALF_TIP - STAB_HALF_HINGE + 0.4);
    }
    return (t, side) => new THREE.Vector3(x * IN, ht(STAB_H) + side * 0.125 * IN * (1 - 0.6 * t), st(ELEV_HINGE_S + t * c));
  };
  const eh = (x) => new THREE.Vector3(x * IN, ht(STAB_H), st(ELEV_HINGE_S));
  const elevGeo = merged([-1, 1].map((sign) => {
    const xs = spanStations(0.2, STAB_HALF_TIP, lite ? 3 : 0.4).map((x) => sign * x);
    if (sign < 0) xs.reverse();
    return loft(xs.map((x) => section(elevAt(x), 0, 1, 3)));
  }));
  const elevator = hinged(elevGeo, eh(-STAB_HALF_TIP), eh(STAB_HALF_TIP), tailFlap);

  const rudderPoly = [[RUDDER_S, EGG[6][1]], ...EGG.filter((p) => p[0] > RUDDER_S + 1e-6), [RUDDER_S, EGG[EGG.length - 1][1]]];
  const rudder = hinged(sidePlate(rudderPoly, FIN_T),
    new THREE.Vector3(0, ht(EGG[EGG.length - 1][1]), st(RUDDER_S)),
    new THREE.Vector3(0, ht(EGG_TOP), st(RUDDER_S)),
    panelFlap);

  /* The fin's cross, half on the fin and half on the rudder, each side. */
  {
    const cz = RUDDER_S;
    const cyH = 17.3;
    const r = 2.9;
    for (const [target, clip] of [[group, -1], [rudder.pivot, 1]]) {
      const shape = crossShape(r * IN);
      const pts = shape.getPoints(4);
      const half = new THREE.Shape();
      /* The cross's half on this side of the hinge line: its points
       * clipped to the side, x being the station across the hinge. */
      const kept = pts.map((p) => new THREE.Vector2(clip > 0 ? Math.max(0, p.x) : Math.min(0, p.x), p.y));
      half.setFromPoints(kept);
      const g = [];
      for (const side of [-1, 1]) {
        const sg = new THREE.ShapeGeometry(half);
        sg.rotateY(-Math.PI / 2);
        sg.translate(side * (FIN_T * IN / 2 + 0.0008), ht(cyH), st(cz));
        g.push(sg);
      }
      const geo = merged(g);
      if (target !== group) {
        geo.translate(-rudder.pivot.position.x, -rudder.pivot.position.y, -rudder.pivot.position.z);
      }
      const m = new THREE.Mesh(geo, crossMat);
      m.name = clip > 0 ? 'uglystik-rudder-cross' : 'uglystik-fin-cross';
      target.add(m);
    }
  }

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

  /* The camera on the hatch ahead of the wing. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, UGLYSTIK_MOUNT_UP, -UGLYSTIK_MOUNT_FORWARD);
  cameraMount.name = 'uglystik-camera-mount';
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

  /* The video antenna on the fuselage's top behind the wing. NAMED: wire,
   * not aircraft. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.080, lite ? 5 : 8), antenna);
    const s = 31.0;
    mast.position.set(0, ht(fuseAt(s).top) + 0.036, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /* The prop on the crankshaft, a spinner nut, the prop's disc. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const propMount = new THREE.Group();
    propMount.position.set(0, ht(THRUST_H), st(0));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);
    const nut = new THREE.Mesh(new THREE.ConeGeometry(0.45 * IN, 0.8 * IN, lite ? 8 : 14), metal);
    nut.position.set(0, 0.3 * IN, 0);
    nut.rotation.x = Math.PI;
    nut.name = 'spinner';
    nut.castShadow = shade;
    propMount.add(nut);
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
      new THREE.MeshBasicMaterial({ color: 0x5a6558, transparent: true, opacity: 0.12, depthWrite: false, fog }),
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

  /* Four lamps on the four slots the pose driver walks: sakura on the left
   * tip and the hatch, mint on the right tip and the fuselage's top aft. */
  const lampAt = [
    { p: wingAt(-(HALF_LE - 1))(0.3, 1), front: true },
    { p: wingAt(HALF_LE - 1)(0.3, 1), front: false },
    { p: new THREE.Vector3(0, ht(fuseAt(6.0).top), st(6.0)), front: true },
    { p: new THREE.Vector3(0, ht(fuseAt(38.0).top), st(38.0)), front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.0035, 0.012), ledMat);
    led.position.copy(at.p);
    led.position.y += 0.002;
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

  /* Pose the surfaces, cubcraft.js's signs; the nose wheel at 0.6 of the
   * rudder's angle, its front the way the rudder's trailing edge goes. */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    noseSteer.rotation.y = UGLYSTIK_NOSE_STEER * rudRad;
  }
  setSurfaces(0, 0, 0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: UGLYSTIK_PROP_SPIN,
    setSurfaces,
    livery: coat.livery,
  };
}
