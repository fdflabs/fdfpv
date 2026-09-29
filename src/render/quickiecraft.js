/*
 * quickiecraft.js: the Quickie 500's model, and nothing else.
 *
 * Its own file for the reason every plane has one: nothing else in the
 * hangar is a club pylon racer, a square wing under a slab sided box with
 * its engine hung out in the air on its side, the shape the class rules
 * make on purpose (a box fuselage, the engine "fully exposed", fixed wire
 * gear).
 *
 * The subject is Glen Spickler's Quickie 500 as American Aircraft Modeler
 * published it in December 1972, in the scheme its colour photographs
 * show: white, a red sunburst on the wing, a blue leading edge band with
 * white stars, red and blue on the fuselage and the fin
 * (docs/QUICKIE-STAGE1.md). Outerzone's scan of the plan (oz6868) is full
 * size, and the outline here is measured off it, in inches:
 *
 *   wing          10.0 in from the leading edge to the aileron's trailing
 *                 edge, constant, "15% Symmetrical" (RCM), at no incidence,
 *                 its chord line at height 23.55 under the fuselage (a low
 *                 wing); the sheeted panel to 23.97 in out and a soft block
 *                 tip rounded to 25.46; 4 deg of dihedral a side
 *   ailerons      strip ailerons, 1 in of the chord, straight, from the
 *                 fuselage's side, 1.54 in out, to the tip rib
 *   fuselage      a box of 3/16 in sides, 2.5 in wide at the firewall and
 *                 3.0 at the wing, tapering to 0.6 at the tail; its top at
 *                 20.85 at the firewall, 20.55 at former C and falling to
 *                 21.85 at the tail; its bottom dropping from the firewall
 *                 to the wing, flat at 23.7 behind it
 *   stab          flat 1/4 in sheet on the fuselage's top, 16 in over its
 *                 tips, 7.15 in at the root and 5.1 at the tip with a 1.5
 *                 in elevator
 *   fin, rudder   swept 1/4 in sheet: the leading edge from station 33.0
 *                 on the fuselage to 40.2 at the top, 5.6 in over it; the
 *                 rudder 2 in deep, carried down to the fuselage's bottom
 *                 behind the post; a wire tail skid
 *   engine        a K&B 40 R/C on its side on a Kraft-Hayes mount, the
 *                 cylinder out to the right, no silencer, an APC 9 x 6 and
 *                 no spinner (AMA: "The use of a spinner of any size in
 *                 Quickie 500 ... shall not")
 *   gear          5/32 in wire legs from straps under former C, out and
 *                 down to 2 1/4 in Kraft-Hayes wheels 6.3 in either side
 *
 * Stations are inches along the plan's side view, heights the plan's
 * inches DOWN the sheet; st() and ht() turn them into the craft frame: x
 * right, y up, z aft, metres, THE ORIGIN AT THE CG, the plan's C.G. mark
 * at station 14.0 and the height the masses put it at, 22.52
 * (scripts/quickie-derive.js).
 *
 * The contract with the shell is kadetcraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians,
 * ailerons and elevator positive trailing edge up, the rudder positive
 * trailing edge left.
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
const CG_S = 14.0;
const CG_H = 22.52;
const st = (s) => (s - CG_S) * IN;
const ht = (h) => (CG_H - h) * IN;

/* The wing. */
const LE_S = 11.2;
const CHORD = 10.0;
const AIL_C = 1.0;
const HINGE_S = LE_S + CHORD - AIL_C;
const HALF_RIB = 23.97;
const HALF_TIP = 25.46;
const AIL_IN = 1.54;
const WING_T = 0.15;
const CHORD_H = 23.55;
const DIHEDRAL = (4.0 * Math.PI) / 180;
/* The sunburst and the band, off AAM's colour photographs (ESTIMATED):
 * the blue band along the leading edge, 2.2 in deep, with white stars; a
 * red stripe fanning out from the root's trailing edge to the tip rib. */
const BAND_C = 2.2;

/* The fuselage: [station, top height, bottom height, half width]. */
const FUSE = [
  [5.2, 20.85, 23.30, 1.25],
  [11.1, 20.55, 24.15, 1.50],
  [12.6, 20.56, 23.60, 1.50],
  [21.2, 20.75, 23.68, 1.50],
  [33.0, 21.55, 23.70, 0.85],
  [40.85, 21.85, 23.70, 0.30],
];
const FIREWALL_S = 5.2;
const TAIL_S = 40.85;

/* The tail. */
const STAB_LE_ROOT = 35.15;
const STAB_LE_TIP = 37.2;
const STAB_HALF = 8.0;
const ELEV_HINGE_S = 40.8;
const ELEV_TE_S = 42.3;
const STAB_H = 21.6;
const STAB_T = 0.25;
const FIN_T = 0.25;
/* The fin and the rudder off the side view, [station, height]. */
const FIN = [[33.0, 21.55], [37.0, 18.5], [39.4, 16.7], [40.2, 16.0], [38.85, 21.7], [38.8, 21.7]];
const RUDDER = [[40.2, 16.0], [42.2, 15.95], [40.85, 21.7], [40.4, 23.7], [38.8, 23.7], [38.85, 21.7]];
const RUD_HINGE = [[38.8, 23.7], [40.2, 16.0]];

/* The engine and prop. */
const PROP_R = 4.5 * IN;
const THRUST_H = 22.05;
const PROP_S = 0.9;
const MOUNT_S = 2.3;

/* The gear. */
const STRAP_S = 10.8;
const STRAP_H = 24.25;
const AXLE_S = 10.0;
const AXLE_H = 27.1;
const WHEEL_R = 1.125 * IN;
const KNEE_X = 2.5;
const AXLE_X = 6.0;
const WHEEL_X = 6.3;
const WHEEL_W = 0.75 * IN;
const SKID_TIP = [41.4, 24.65];
const SKID_ROOT = [39.0, 23.7];

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
 * The wing's plan at |x| inches out: its leading edge and its chord to
 * the hinge. Inside the tip rib the full chord; the soft block tip rounds
 * it off, the plan's outline taken as an ellipse about 40 percent of the
 * chord.
 */
function wingPlan(ax) {
  if (ax <= HALF_RIB) {
    return { le: LE_S, te: LE_S + CHORD };
  }
  const u = Math.min(1, (ax - HALF_RIB) / (HALF_TIP - HALF_RIB));
  const k = Math.sqrt(Math.max(0.0025, 1 - u * u));
  const mid = LE_S + 0.4 * CHORD;
  return { le: mid - 0.4 * CHORD * k, te: mid + 0.6 * CHORD * k };
}
/* The height the dihedral raises the chord line to, x inches out. */
const rise = (ax) => ax * Math.tan(DIHEDRAL) * IN;
/* The wing's section at x inches out, from the leading edge to `teS`
 * (the hinge inside the ailerons, the trailing edge outside them). */
function wingAt(x, teS) {
  const ax = Math.abs(x);
  const { le, te } = wingPlan(ax);
  const end = Math.min(te, teS);
  const c = te - le;
  const y0 = ht(CHORD_H) + rise(ax);
  return (t, side) => {
    const s = le + t * (end - le);
    const f = (s - le) / c;
    return new THREE.Vector3(x * IN, y0 + side * c * naca(Math.min(1, f), WING_T) * IN, st(s));
  };
}
/* The aileron at x inches out: from the hinge to the trailing edge,
 * tapering to its sharp edge. */
function aileronAt(x) {
  const ax = Math.abs(x);
  const y0 = ht(CHORD_H) + rise(ax);
  const half = CHORD * naca(HINGE_S - LE_S < CHORD ? (HINGE_S - LE_S) / CHORD : 1, WING_T) * IN;
  return (t, side) => new THREE.Vector3(x * IN, y0 + side * half * (1 - t), st(HINGE_S + t * AIL_C));
}

function spanStations(from, to, step) {
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
  const xs = [];
  for (let i = 0; i <= n; i += 1) {
    xs.push(from + ((to - from) * i) / n);
  }
  return xs;
}
/* The wing between two span stations. Where the ailerons run (1.54 to
 * 23.97 in out) it stops at the hinge; the centre and the tips carry
 * the whole chord. */
function wingGeometry(lite, from, to) {
  const n = lite ? 8 : 12;
  const xs = spanStations(from, to, lite ? 8 : 3);
  for (const edge of [-HALF_RIB, HALF_RIB, -AIL_IN, AIL_IN]) {
    if (edge > Math.min(from, to) && edge < Math.max(from, to) && !xs.some((y) => Math.abs(y - edge) < 1e-6)) xs.push(edge);
  }
  xs.sort((a, b) => a - b);
  return loft(xs.map((x) => {
    const ax = Math.abs(x);
    const teS = ax > AIL_IN + 1e-6 && ax < HALF_RIB - 1e-6 ? HINGE_S : LE_S + CHORD;
    return section(wingAt(x, teS), 0, 1, n);
  }));
}
function tipGeometry(lite, sign) {
  const n = lite ? 8 : 12;
  const xs = spanStations(HALF_RIB, HALF_TIP - 0.01, lite ? 0.5 : 0.15).map((x) => sign * x);
  if (sign < 0) xs.reverse();
  return loft(xs.map((x) => section(wingAt(x, LE_S + CHORD), 0, 1, n)));
}
function aileronGeometry(lite, sign) {
  const xs = spanStations(AIL_IN + 0.05, HALF_RIB - 0.05, lite ? 4 : 1.5).map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  return loft(xs.map((x) => section(aileronAt(x), 0, 1, 3)));
}

/* A five pointed star, flat, r its outer radius, metres. */
function starShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.4;
    if (i === 0) s.moveTo(rr * Math.cos(a), rr * Math.sin(a));
    else s.lineTo(rr * Math.cos(a), rr * Math.sin(a));
  }
  s.closePath();
  return s;
}

/* The fuselage at station s: top, bottom, half width, inches. */
function fuseAt(s) {
  const t = Math.min(Math.max(s, FUSE[0][0]), FUSE[FUSE.length - 1][0]);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      return { top: a[1] + (b[1] - a[1]) * u, bottom: a[2] + (b[2] - a[2]) * u, w: a[3] + (b[3] - a[3]) * u };
    }
  }
  throw new Error(`quickiecraft: station ${s} is off the fuselage`);
}
/* A ring round the box at station s, its corners rounded on the rule's
 * quarter inch. */
function fuseRing(s, n) {
  const { top, bottom, w } = fuseAt(s);
  const yTop = ht(top);
  const yBot = ht(bottom);
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
  const xs = spanStations(from, to, lite ? 12 : 3);
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
  g.rotateY(-Math.PI / 2);
  g.translate((thick * IN) / 2, 0, 0);
  return g;
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

/* An APC 9 x 6 blade: narrow, its tip squared off. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0050, 0.008);
  s.bezierCurveTo(0.0170, -0.012, 0.0140, -r * 0.5, 0.0070, -r * 0.97);
  s.lineTo(-0.0055, -r * 0.95);
  s.bezierCurveTo(-0.0130, -r * 0.45, -0.0100, -0.008, -0.0040, 0.008);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false, curveSegments: segments });
}

function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('quickiecraft: merge failed');
  }
  return geo;
}

/*
 * The gear and the attitude it sits the aircraft at: the ground line
 * under the mains' circles and through the skid's tip, nose up positive:
 * 6.50 deg, the CG 0.1327 m up, the plant's own rest (src/native/plant.c).
 */
const MAIN_AXLE = [WHEEL_X * IN, ht(AXLE_H), st(AXLE_S)];
const SKID = [0, ht(SKID_TIP[1]), st(SKID_TIP[0])];
const REST_PITCH = Math.atan2(SKID[1] - (MAIN_AXLE[1] - WHEEL_R), SKID[2] - MAIN_AXLE[2]);
const restContact = (axle, r) => [
  axle[0],
  axle[1] - r * Math.cos(REST_PITCH),
  axle[2] + r * Math.sin(REST_PITCH),
];
const REST_CG_HEIGHT = (() => {
  const c = restContact(MAIN_AXLE, WHEEL_R);
  return -(Math.cos(REST_PITCH) * c[1] - Math.sin(REST_PITCH) * c[2]);
})();

const FIN_TOP = Math.min(...[...FIN, ...RUDDER].map((p) => p[1]));
const UP = ht(FIN_TOP);
const DOWN = -(MAIN_AXLE[1] - WHEEL_R);
const RUDDER_TE_S = Math.max(...RUDDER.map((p) => p[0]));
const NOSE_S_TIP = PROP_S - 0.3;
const REACH = Math.max(Math.hypot(HALF_TIP * IN, st(LE_S + 0.4 * CHORD)), Math.abs(st(RUDDER_TE_S)));
export const QUICKIE_DIMS = {
  span: 2 * HALF_TIP * IN,
  chord: CHORD * IN,
  dihedralDeg: (DIHEDRAL * 180) / Math.PI,
  stabSpan: 2 * STAB_HALF * IN,
  gearTrack: 2 * WHEEL_X * IN,
  propR: PROP_R,
  thrustY: ht(THRUST_H),
  noseZ: st(NOSE_S_TIP),
  tailZ: st(RUDDER_TE_S),
  length: (RUDDER_TE_S - NOSE_S_TIP) * IN,
  reach: REACH,
  vHalfUp: UP,
  vHalfDown: DOWN,
  wing: {
    le: st(LE_S), te: st(LE_S + CHORD), half: HALF_TIP * IN, rootY: ht(CHORD_H), tipY: ht(CHORD_H) + rise(HALF_RIB),
  },
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: WHEEL_R, width: WHEEL_W },
    mainRight: { axle: [...MAIN_AXLE], r: WHEEL_R, width: WHEEL_W },
  },
  contact: {
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - WHEEL_R, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - WHEEL_R, MAIN_AXLE[2]],
    skid: [...SKID],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: (REST_PITCH * 180) / Math.PI,
    cgHeight: REST_CG_HEIGHT,
    contact: {
      mainLeft: restContact([-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], WHEEL_R),
      mainRight: restContact(MAIN_AXLE, WHEEL_R),
      skid: [...SKID],
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

/* The FPV camera on the hatch over the tank. */
const CAM_S = 9.0;
export const QUICKIE_MOUNT_FORWARD = -st(CAM_S);
export const QUICKIE_MOUNT_UP = ht(fuseAt(CAM_S).top) + 0.012;

/* A glow engine turns counter clockwise seen from the front, which is
 * clockwise from behind: cubcraft.js's sense. */
export const QUICKIE_PROP_SPIN = [1, 0, 0, 0];

export function buildQuickieCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'quickie-craft';
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

  /* AAM's scheme by region (src/render/livery.js): white on the wing, the
   * fuselage and the tail, each its own region, the moving surfaces a
   * shade down; the red sunburst and stripes; the blue band. */
  const coat = paintRegions();
  const whiteOf = (id) => coat.base(id, cel({ color: 0xf1efe8, rim: 0.28, spec: 0.42, specWidth: 0.016 }));
  const flapOf = (id) => coat.shade(id, cel({ color: 0xdbd8cf, rim: 0.28, spec: 0.38, specWidth: 0.016 }));
  const wingMat = whiteOf('wing');
  const fuseMat = whiteOf('fuselage');
  const tailMat = whiteOf('tail');
  const wingFlap = flapOf('wing');
  const tailFlap = flapOf('tail');
  const redMat = coat.base('stripe', cel({ color: 0xc3161c, rim: 0.30, spec: 0.40, specWidth: 0.016, side: THREE.DoubleSide }));
  const blueMat = coat.base('trim', cel({ color: 0x1d3f8f, rim: 0.30, spec: 0.40, specWidth: 0.016, side: THREE.DoubleSide }));
  const starMat = cel({ color: 0xf6f4ee, rim: 0.26, spec: 0.30, side: THREE.DoubleSide });
  const metal = cel({ color: 0xc2c6ca, rim: 0.30, spec: 0.75, specWidth: 0.022 });
  const engineMat = cel({ color: 0xb8b6b0, rim: 0.30, spec: 0.65, specWidth: 0.022 });
  const engineBlack = cel({ color: 0x202022, rim: 0.26, spec: 0.35 });
  const tyre = cel({ color: 0x1b1b1d, rim: 0.30, spec: 0.20 });
  const hub = cel({ color: 0xd8d4c8, rim: 0.28, spec: 0.35 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x101610, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xf3ead4, side: THREE.DoubleSide,
  });
  const ring = cel({ color: 0xb8b09e, rim: 0.28, spec: 0.55 });
  const propMat = cel({ color: 0x28282a, rim: 0.26, spec: 0.40 });
  const stator = cel({ color: 0x9a9ea2, rim: 0.28, spec: 0.55, specWidth: 0.02 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c0c0e;

  if (opts.measure) {
    const d = QUICKIE_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), wingMat);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The box, white, with a red stripe down each side and a blue one under
   * it. */
  {
    const box = new THREE.Mesh(fuseGeometry(lite, FIREWALL_S, TAIL_S), fuseMat);
    box.name = 'quickie-fuselage';
    box.castShadow = shade;
    hull(box, 1.018, ink);
    group.add(box);
    const stripes = { red: [], blue: [] };
    for (const sign of [-1, 1]) {
      for (const [key, dh, wide] of [['red', 0.45, 0.45], ['blue', 1.0, 0.30]]) {
        const xs = spanStations(FIREWALL_S + 0.2, TAIL_S - 0.6, lite ? 6 : 2);
        const pos = [];
        const idx = [];
        xs.forEach((s, i) => {
          const { top, w } = fuseAt(s);
          const x = sign * (w * IN + 0.0008);
          pos.push(x, ht(top + dh), st(s), x, ht(top + dh + wide), st(s));
          if (i > 0) {
            const a = (i - 1) * 2;
            idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        stripes[key].push(g);
      }
    }
    group.add(Object.assign(new THREE.Mesh(merged(stripes.red), redMat), { name: 'quickie-fuse-red' }));
    group.add(Object.assign(new THREE.Mesh(merged(stripes.blue), blueMat), { name: 'quickie-fuse-blue' }));
  }

  /* The wing, white, the soft block tips, and on the top of each panel
   * the blue band along the leading edge with its stars and the red
   * sunburst fanning from the root's trailing edge to the tip. */
  {
    const white = new THREE.Mesh(merged([
      wingGeometry(lite, -HALF_RIB, HALF_RIB),
      tipGeometry(lite, -1),
      tipGeometry(lite, 1),
    ]), wingMat);
    white.name = 'quickie-wing';
    white.castShadow = shade;
    hull(white, 1.012, ink);
    group.add(white);
    const onTop = (x, s, lift = 0.0010) => {
      const ax = Math.abs(x);
      const { le, te } = wingPlan(ax);
      const f = Math.min(1, Math.max(0, (s - le) / (te - le)));
      return new THREE.Vector3(x * IN, ht(CHORD_H) + rise(ax) + (te - le) * naca(f, WING_T) * IN + lift, st(s));
    };
    const strip = (xs, sOf, lift) => {
      const pos = [];
      const idx = [];
      xs.forEach((x, i) => {
        const [s0, s1] = sOf(x);
        const n = 4;
        for (let k = 0; k <= n; k += 1) {
          const p = onTop(x, s0 + ((s1 - s0) * k) / n, lift);
          pos.push(p.x, p.y, p.z);
        }
        if (i > 0) {
          const a = (i - 1) * (n + 1);
          const b = i * (n + 1);
          for (let k = 0; k < n; k += 1) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const blues = [];
    const reds = [];
    const stars = [];
    for (const sign of [-1, 1]) {
      const xs = spanStations(1.6, HALF_RIB, lite ? 6 : 1.5).map((x) => sign * x);
      blues.push(strip(xs, () => [LE_S + 0.3, LE_S + BAND_C], 0.0012));
      /* The sunburst: from 3 in behind the band at the root to the
       * hinge line at the tip rib, 3 in wide. */
      reds.push(strip(xs, (x) => {
        const u = Math.abs(x) / HALF_RIB;
        const s1 = HINGE_S - 0.1;
        const s0 = LE_S + BAND_C + 0.3 + u * (HINGE_S - 3.2 - LE_S - BAND_C - 0.3);
        return [s0, Math.max(s0 + 0.5, s1 - (1 - u) * 3.5)];
      }, 0.0010));
      for (let i = 0; i < 7; i += 1) {
        const x = sign * (4.0 + i * 3.0);
        const p = onTop(x, LE_S + 0.3 + BAND_C / 2, 0.0016);
        const g = new THREE.ShapeGeometry(starShape(0.65 * IN));
        g.rotateX(-Math.PI / 2);
        g.rotateZ(sign * DIHEDRAL);
        g.translate(p.x, p.y, p.z);
        stars.push(g);
      }
    }
    group.add(Object.assign(new THREE.Mesh(merged(blues), blueMat), { name: 'quickie-wing-band' }));
    group.add(Object.assign(new THREE.Mesh(merged(reds), redMat), { name: 'quickie-wing-burst' }));
    group.add(Object.assign(new THREE.Mesh(merged(stars), starMat), { name: 'quickie-wing-stars' }));
  }

  /* The stab, flat sheet on the fuselage's top, to the hinge. */
  const stabLe = (ax) => STAB_LE_ROOT + (ax / STAB_HALF) * (STAB_LE_TIP - STAB_LE_ROOT);
  const slab = (x, le, c, h, t) => (tt, side) => new THREE.Vector3(x * IN, ht(h) + side * t * IN * 0.5 * Math.min(1, 4 * Math.min(tt, 1 - tt) + 0.3), st(le + tt * c));
  {
    const xs = spanStations(-STAB_HALF, STAB_HALF, lite ? 4 : 1.0);
    const geo = loft(xs.map((x) => {
      const le = stabLe(Math.abs(x));
      return section(slab(x, le, ELEV_HINGE_S - le, STAB_H, STAB_T), 0, 1, 4);
    }));
    const stab = new THREE.Mesh(geo, tailMat);
    stab.name = 'quickie-stab';
    stab.castShadow = shade;
    hull(stab, 1.02, ink);
    group.add(stab);
  }

  /* The fin, with a red stripe along its leading edge and a blue one
   * behind it. */
  {
    const fin = new THREE.Mesh(sidePlate(FIN, FIN_T), tailMat);
    fin.name = 'quickie-fin';
    fin.castShadow = shade;
    hull(fin, 1.03, ink);
    group.add(fin);
    const band = (pts, mat, name) => {
      const g = [];
      for (const side of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(st(pts[0][0]), ht(pts[0][1]));
        for (let i = 1; i < pts.length; i += 1) shape.lineTo(st(pts[i][0]), ht(pts[i][1]));
        shape.closePath();
        const sg = new THREE.ShapeGeometry(shape);
        sg.rotateY(-Math.PI / 2);
        sg.translate(side * (FIN_T * IN / 2 + 0.0008), 0, 0);
        g.push(sg);
      }
      group.add(Object.assign(new THREE.Mesh(merged(g), mat), { name }));
    };
    band([[33.6, 21.5], [39.4, 17.1], [39.6, 16.95], [38.95, 20.6], [35.4, 21.5]], redMat, 'quickie-fin-red');
    band([[35.9, 21.5], [38.9, 20.85], [38.86, 21.5]], blueMat, 'quickie-fin-blue');
  }

  /* The engine: the K&B 40 on its side, the crankcase on the thrust line,
   * the finned cylinder and head out to the right, the open exhaust stack
   * under it, the carburettor to the left; the Kraft-Hayes mount's two
   * beams back to the firewall. */
  {
    const parts = [];
    const blacks = [];
    const yT = ht(THRUST_H);
    const crank = new THREE.CylinderGeometry(0.62 * IN, 0.62 * IN, 1.3 * IN, seg);
    crank.rotateX(Math.PI / 2);
    crank.translate(0, yT, st(3.1));
    parts.push(crank);
    const nose = new THREE.CylinderGeometry(0.30 * IN, 0.42 * IN, 1.2 * IN, seg);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, yT, st(1.8));
    parts.push(nose);
    const back = new THREE.CylinderGeometry(0.58 * IN, 0.58 * IN, 0.35 * IN, seg);
    back.rotateX(Math.PI / 2);
    back.translate(0, yT, st(3.9));
    blacks.push(back);
    const barrel = new THREE.CylinderGeometry(0.45 * IN, 0.45 * IN, 1.4 * IN, seg);
    barrel.rotateZ(-Math.PI / 2);
    barrel.translate(1.25 * IN, yT, st(3.1));
    parts.push(barrel);
    const fins = lite ? 3 : 7;
    for (let i = 0; i < fins; i += 1) {
      const f = new THREE.CylinderGeometry(0.68 * IN, 0.68 * IN, 0.04 * IN, seg);
      f.rotateZ(-Math.PI / 2);
      f.translate((0.8 + (i * 1.0) / fins) * IN, yT, st(3.1));
      parts.push(f);
    }
    const head = new THREE.CylinderGeometry(0.62 * IN, 0.66 * IN, 0.4 * IN, seg);
    head.rotateZ(-Math.PI / 2);
    head.translate(2.1 * IN, yT, st(3.1));
    parts.push(head);
    blacks.push(rod(new THREE.Vector3(2.3 * IN, yT, st(3.1)), new THREE.Vector3(2.6 * IN, yT, st(3.1)), 0.1 * IN, 6));
    /* The exhaust stack, open, down and back on the right. */
    parts.push(rod(new THREE.Vector3(0.7 * IN, yT - 0.4 * IN, st(3.3)), new THREE.Vector3(1.1 * IN, yT - 1.2 * IN, st(3.6)), 0.28 * IN, rodSeg));
    parts.push(rod(new THREE.Vector3(-0.5 * IN, yT, st(2.4)), new THREE.Vector3(-1.1 * IN, yT, st(2.4)), 0.22 * IN, 8));
    blacks.push(rod(new THREE.Vector3(-1.0 * IN, yT, st(2.4)), new THREE.Vector3(-1.6 * IN, yT, st(2.4)), 0.05 * IN, 5));
    for (const sign of [-1, 1]) {
      const b = new THREE.BoxGeometry(0.3 * IN, 0.35 * IN, (FIREWALL_S - MOUNT_S) * IN);
      b.translate(sign * 0.75 * IN, yT - 0.6 * IN, st((FIREWALL_S + MOUNT_S) / 2));
      blacks.push(b);
    }
    const eng = new THREE.Mesh(merged(parts), engineMat);
    eng.name = 'quickie-engine';
    eng.castShadow = shade;
    group.add(eng);
    const engB = new THREE.Mesh(merged(blacks), engineBlack);
    engB.name = 'quickie-engine-black';
    engB.castShadow = shade;
    group.add(engB);
  }

  /* The gear: each 5/32 in wire leg from its strap under former C across
   * the bottom, then out and down to its axle; the tail skid. */
  {
    const wire = 0.002;
    const parts = [];
    const yStrap = ht(STRAP_H);
    for (const sign of [-1, 1]) {
      const inner = new THREE.Vector3(0, yStrap, st(STRAP_S));
      const knee = new THREE.Vector3(sign * KNEE_X * IN, yStrap, st(STRAP_S));
      const foot = new THREE.Vector3(sign * AXLE_X * IN, MAIN_AXLE[1], MAIN_AXLE[2]);
      const end = new THREE.Vector3(sign * (WHEEL_X * IN + WHEEL_W / 2 + 0.003), MAIN_AXLE[1], MAIN_AXLE[2]);
      parts.push(rod(inner, knee, wire, rodSeg));
      parts.push(rod(knee, foot, wire, rodSeg));
      parts.push(rod(foot, end, wire, rodSeg));
    }
    const straps = new THREE.BoxGeometry(2.2 * IN, 0.004, 0.5 * IN);
    straps.translate(0, yStrap + 0.002, st(STRAP_S));
    parts.push(straps);
    parts.push(rod(new THREE.Vector3(0, ht(SKID_ROOT[1]), st(SKID_ROOT[0])), new THREE.Vector3(...SKID), 0.001, 4));
    const gear = new THREE.Mesh(merged(parts), metal);
    gear.name = 'quickie-gear';
    gear.castShadow = shade;
    group.add(gear);
  }

  /* The wheels: Kraft-Hayes' treaded tyres and white hubs. */
  {
    const tyres = [];
    const hubs = [];
    for (const sign of [-1, 1]) {
      const t = new THREE.TorusGeometry(WHEEL_R - 0.008, 0.008, lite ? 5 : 8, lite ? 16 : 24);
      t.rotateY(Math.PI / 2);
      t.scale(WHEEL_W / 0.016, 1, 1);
      t.translate(sign * MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]);
      tyres.push(t);
      const h = new THREE.CylinderGeometry(WHEEL_R - 0.014, WHEEL_R - 0.014, WHEEL_W * 0.7, seg);
      h.rotateZ(Math.PI / 2);
      h.translate(sign * MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]);
      hubs.push(h);
    }
    const t = new THREE.Mesh(merged(tyres), tyre);
    t.name = 'quickie-tyres';
    t.castShadow = shade;
    group.add(t);
    group.add(Object.assign(new THREE.Mesh(merged(hubs), hub), { name: 'quickie-hubs' }));
  }

  /* The moving surfaces: the strip ailerons, the elevator's halves either
   * side of the rudder, the rudder. */
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
    const b = hingeAt(sign * HALF_RIB);
    const [p, q] = sign < 0 ? [b, a] : [a, b];
    return hinged(aileronGeometry(lite, sign), p, q, wingFlap);
  };
  const leftAil = aileron(-1);
  const rightAil = aileron(1);

  const elevAt = (x) => (t, side) => new THREE.Vector3(x * IN, ht(STAB_H) + side * 0.125 * IN * (1 - 0.6 * t), st(ELEV_HINGE_S + t * (ELEV_TE_S - ELEV_HINGE_S)));
  const eh = (x) => new THREE.Vector3(x * IN, ht(STAB_H), st(ELEV_HINGE_S));
  const elevGeo = merged([-1, 1].map((sign) => {
    const xs = spanStations(0.3, STAB_HALF, lite ? 3 : 0.5).map((x) => sign * x);
    if (sign < 0) xs.reverse();
    return loft(xs.map((x) => section(elevAt(x), 0, 1, 3)));
  }));
  const elevator = hinged(elevGeo, eh(-STAB_HALF), eh(STAB_HALF), tailFlap);

  const rudder = hinged(sidePlate(RUDDER, FIN_T),
    new THREE.Vector3(0, ht(RUD_HINGE[0][1]), st(RUD_HINGE[0][0])),
    new THREE.Vector3(0, ht(RUD_HINGE[1][1]), st(RUD_HINGE[1][0])),
    tailFlap);

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

  /* The camera on the hatch over the tank. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, QUICKIE_MOUNT_UP, -QUICKIE_MOUNT_FORWARD);
  cameraMount.name = 'quickie-camera-mount';
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
    const s = 26.0;
    mast.position.set(0, ht(fuseAt(s).top) + 0.036, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /* The prop on the crankshaft behind its nut, the prop's disc. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const propMount = new THREE.Group();
    propMount.position.set(0, ht(THRUST_H), st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * IN, 0.22 * IN, 0.35 * IN, lite ? 6 : 6), metal);
    nut.position.set(0, 0.15 * IN, 0);
    nut.name = 'spinner';
    nut.castShadow = shade;
    propMount.add(nut);
    const rotor = new THREE.Group();
    propMount.add(rotor);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateZ((14 * Math.PI) / 180);
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
    { p: wingAt(-(HALF_RIB - 1), LE_S + CHORD)(0.3, 1), front: true },
    { p: wingAt(HALF_RIB - 1, LE_S + CHORD)(0.3, 1), front: false },
    { p: new THREE.Vector3(0, ht(fuseAt(6.5).top), st(6.5)), front: true },
    { p: new THREE.Vector3(0, ht(fuseAt(30.0).top), st(30.0)), front: false },
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

  /* Pose the surfaces, cubcraft.js's signs. */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
  }
  setSurfaces(0, 0, 0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: QUICKIE_PROP_SPIN,
    setSurfaces,
    livery: coat.livery,
  };
}
