/*
 * edgecraft.js: the Edge 540's model, and nothing else.
 *
 * Its own file for the reason every plane has one: a mid wing unlimited
 * aerobat on a long, slab sided fuselage under a bubble canopy, with a
 * tail of 3D surfaces, shares no silhouette with a trainer.
 *
 * The subject is Extreme Flight's 60 in Edge 540T, the kit this project
 * flies (docs/EDGE-STAGE1.md), in EF's blue scheme. EF publishes the span,
 * 60 in, the length, 58 in, the area, 750 sq in, the balance "on the wing
 * tube", the throws and the covering's colour codes (the 60 in data sheet);
 * FlyingRC's review measured the balance at 4 in behind the root's leading
 * edge. Everything else here is ESTIMATED off EF's photographs, scaled by
 * the span and the length, and scripts/edge-derive.js reads the same
 * figures:
 *
 *   wing            15 in at the root to 10 in at the square tip, the
 *                   leading edge swept back 5 in, the trailing edge square
 *                   at station 30; a symmetric 13 percent section on the
 *                   thrust line, no dihedral, no twist
 *   ailerons        the whole trailing edge outside the fuselage, 4 in of
 *                   chord, hinged at station 26
 *   stabiliser      23 in across, 9.5 in at the root and 6 in at the tip,
 *                   its hinge line square at station 48, a 4 in elevator
 *   fin and rudder  the fin raked from station 42 on the turtledeck to 48
 *                   at its top, 12.5 in over the thrust line; the rudder
 *                   hinged at 50.5 and running below the fuselage to 3.5
 *                   in under the thrust line, its trailing edge at 57
 *   gear            carbon legs to 2 3/4 in wheels in pants, the axles at
 *                   station 14, 9.5 in under the thrust line on a 12 in
 *                   track; a carbon tailwheel's 1.2 in wheel at station 56
 *   prop            a 16 x 8 two blade tractor behind EF's 63 mm spinner,
 *                   clockwise seen from the cockpit
 *
 * Stations are inches aft of the prop's plane, and st() turns them into
 * the craft frame: x right, y up, z aft, metres, THE ORIGIN AT THE CG, 4 in
 * behind the root's leading edge on the thrust line.
 *
 * The palette is EF's blue scheme: Blue #50 over the wing, the fuselage and
 * the tail, the moving surfaces a shade down so the hinge lines read, and
 * Cub Yellow #30 on the cowl, the wing's and stabiliser's tips, the fin's
 * cap and the wheel pants; the gear black carbon, the canopy tinted.
 *
 * The contract with the shell is cubcraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians,
 * ailerons and elevator positive trailing edge up, the rudder positive
 * trailing edge left, the tailwheel turning with it at half its angle
 * (src/native/plant.c, the tailwheel's steer).
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
const CG_IN = 19.0;
/* A station in inches aft of the prop's plane to the craft frame's z. */
const st = (s) => (s - CG_IN) * IN;

/* The wing. */
const HALF = 30.0 * IN;
const ROOT_LE = 15.0;
const ROOT_C = 15.0;
const TIP_LE = 20.0;
const TE = 30.0;
const TIP_TRIM = 26.0 * IN;
const WING_T = 0.13;
const AIL_HINGE = 26.0;
const AIL_IN = 2.75 * IN;

/* The tail. */
const STAB_HALF = 11.5 * IN;
const STAB_ROOT_LE = 42.5;
const STAB_TIP_LE = 46.0;
const ELEV_HINGE = 48.0;
const ELEV_TE = 52.0;
const STAB_TIP_TRIM = 9.5 * IN;
const STAB_Y = 0.3 * IN;
const STAB_T = 0.09;
const RUDDER_HINGE = 50.5;
const RUDDER_TE_BOTTOM = 57.0;
const RUDDER_TE_TOP = 56.0;
const RUDDER_BOTTOM = -3.5 * IN;
const TAIL_TOP = 12.5 * IN;
const FIN_CAP = 10.5 * IN;
const FIN_T = 0.09;

/* The nose. */
const PROP_R = 8.0 * IN;
const SPINNER_R = 0.0315;
const SPINNER_TIP = -2.0;
const SPINNER_BASE = 0.6;

/* The gear. */
const MAIN_X = 6.0 * IN;
const MAIN_S = 14.0;
const MAIN_Y = -9.5 * IN;
const MAIN_R = 1.375 * IN;
const MAIN_W = 0.9 * IN;
const TAIL_PIVOT_S = 55.0;
const TAIL_WHEEL_S = 56.0;
const TAIL_WHEEL_Y = -3.0 * IN;
const TAIL_WHEEL_R = 0.6 * IN;

/* The wing's chord and leading edge at |x|, metres. */
function wingPlan(ax) {
  const u = Math.min(1, ax / HALF);
  const le = ROOT_LE + (TIP_LE - ROOT_LE) * u;
  return { le: st(le), c: (TE - le) * IN };
}

/* The NACA four digit thickness, half of it, at chord fraction t. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}

/* A closed section, cubcraft.js's: over the top from f0 to f1 and back
 * under, cosine spaced. */
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

/* The symmetric wing section at span station x, on the thrust line. */
function wingAt(x) {
  const { le, c } = wingPlan(Math.abs(x));
  return (t, side) => new THREE.Vector3(x, side * c * naca(t, WING_T), le + t * c);
}
function stabPlan(ax) {
  const u = Math.min(1, ax / STAB_HALF);
  return { le: st(STAB_ROOT_LE + (STAB_TIP_LE - STAB_ROOT_LE) * u), hinge: st(ELEV_HINGE), te: st(ELEV_TE) };
}
function stabAt(x, le, c) {
  return (t, side) => new THREE.Vector3(x, STAB_Y + side * c * naca(t, STAB_T), le + t * c);
}
function finAt(y, le, c) {
  return (t, side) => new THREE.Vector3(side * c * naca(t, FIN_T), y, le + t * c);
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

/* The hinge's chord fraction at |x| on the wing. */
const ailF = (ax) => {
  const { le, c } = wingPlan(ax);
  return (st(AIL_HINGE) - le) / c;
};

/*
 * The wing from tip to tip, the fixed part: full sections across the
 * fuselage, cut at the hinge from the aileron's inner end out. The tips,
 * outside TIP_TRIM, are their own loft in the trim's colour.
 */
function wingGeometry(lite, fromX, toX) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const xs = [];
  const steps = lite ? 3 : 5;
  for (let i = 0; i <= steps; i += 1) {
    xs.push(fromX + ((toX - fromX) * i) / steps);
  }
  const stations = [];
  for (const x of xs) {
    const ax = Math.abs(x);
    stations.push([x, ax < AIL_IN - eps ? 1 : ailF(ax)]);
  }
  return loft(stations.map(([x, f]) => section(wingAt(x), 0, f, n)));
}
function wingCentre(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const xs = [-(AIL_IN + eps), -(AIL_IN - eps), 0, AIL_IN - eps, AIL_IN + eps];
  return loft(xs.map((x) => section(wingAt(x), 0, Math.abs(x) < AIL_IN ? 1 : ailF(Math.abs(x)), n)));
}

/* A hinged surface, cubcraft.js's: the pivot on the hinge, turning about
 * its own axis, +x for a horizontal hinge and +y for a vertical one. */
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

/* One aileron, the inner part in the wing's colour and the tip part in the
 * trim's, on one hinge. */
function aileron(sign, mats, shade, lite) {
  const n = lite ? 4 : 6;
  const run = (a, b) => {
    const xs = [a, (a + b) / 2, b].map((x) => sign * x);
    if (sign < 0) {
      xs.reverse();
    }
    return loft(xs.map((x) => section(wingAt(x), ailF(Math.abs(x)), 1, n)));
  };
  const hingePoint = (x) => {
    const f = ailF(Math.abs(x));
    return wingAt(x)(f, 1).add(wingAt(x)(f, -1)).multiplyScalar(0.5);
  };
  const a = hingePoint(sign * AIL_IN);
  const b = hingePoint(sign * HALF);
  const [p, q] = sign < 0 ? [b, a] : [a, b];
  const s = hinged(run(AIL_IN + 0.0005, TIP_TRIM), p, q, mats.wing, shade);
  const tipGeo = run(TIP_TRIM, HALF);
  tipGeo.translate(-s.pivot.position.x, -s.pivot.position.y, -s.pivot.position.z);
  const tip = new THREE.Mesh(tipGeo, mats.trim);
  tip.castShadow = shade;
  s.pivot.add(tip);
  return s;
}

function stabGeometry(n, fromX, toX) {
  const xs = [];
  for (let i = 0; i <= 4; i += 1) {
    xs.push(fromX + ((toX - fromX) * i) / 4);
  }
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
function elevatorGeometry(n, fromX, toX) {
  const xs = [fromX, (fromX + toX) / 2, toX];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.hinge, p.te - p.hinge), 0, 1, n);
  }));
}

/* The fin and rudder at height y: the fin's leading edge raked from the
 * turtledeck to its top; the rudder square topped, its trailing edge a
 * little forward at the top. */
function tailOutline(y) {
  const base = FUSE_TOP_AT(RUDDER_HINGE - 6) + 0.004;
  const u = Math.max(0, Math.min(1, (y - base) / (TAIL_TOP - base)));
  const le = 42.0 + (48.0 - 42.0) * u;
  const v = (y - RUDDER_BOTTOM) / (TAIL_TOP - RUDDER_BOTTOM);
  const te = RUDDER_TE_BOTTOM + (RUDDER_TE_TOP - RUDDER_TE_BOTTOM) * v;
  return { le: st(Math.min(le, RUDDER_HINGE - 0.3)), hinge: st(RUDDER_HINGE), te: st(te) };
}
function finGeometry(n, y0, y1) {
  const ys = [];
  for (let i = 0; i <= 4; i += 1) {
    ys.push(y0 + ((y1 - y0) * i) / 4);
  }
  return loft(ys.map((y) => {
    const o = tailOutline(y);
    return section(finAt(y, o.le, o.hinge - o.le), 0, 1, n);
  }));
}
function rudderGeometry(n, y0, y1) {
  const ys = [];
  for (let i = 0; i <= 4; i += 1) {
    ys.push(y0 + ((y1 - y0) * i) / 4);
  }
  return loft(ys.map((y) => {
    const o = tailOutline(y);
    return section(finAt(y, o.hinge, o.te - o.hinge), 0, 1, n);
  }));
}

/*
 * The fuselage, as rounded box sections: [station in, half width, top,
 * bottom, squareness], inches. The round cowl behind the spinner widening
 * to the firewall, the slab sides past the wing, the deep belly under it,
 * and the long taper to the rudder post.
 */
const FUSE = [
  [0.6, 1.30, 1.20, -1.40, 2.2],
  [3.0, 2.30, 2.10, -2.60, 2.4],
  [7.5, 2.75, 2.70, -3.60, 2.8],
  [14.0, 2.80, 3.00, -4.30, 3.2],
  [21.0, 2.80, 3.00, -4.50, 3.2],
  [28.0, 2.60, 2.80, -4.00, 3.2],
  [36.0, 1.90, 2.30, -2.60, 3.0],
  [44.0, 1.00, 1.60, -1.20, 2.8],
  [RUDDER_HINGE, 0.30, 1.20, -0.60, 2.4],
];
const COWL_END = 7.5;
function fuseAt(s) {
  const last = FUSE[FUSE.length - 1];
  const t = Math.min(Math.max(s, FUSE[0][0]), last[0]);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      const k = u * u * (3 - 2 * u);
      const lerp = (j) => (a[j] + (b[j] - a[j]) * k) * (j === 4 ? 1 : IN);
      const top = lerp(2);
      const bottom = lerp(3);
      return { w: lerp(1), h: (top - bottom) / 2, yc: (top + bottom) / 2, e: lerp(4) };
    }
  }
  throw new Error(`edgecraft: station ${s} is off the fuselage`);
}
function FUSE_TOP_AT(s) {
  const f = fuseAt(s);
  return f.yc + f.h;
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
function fuseGeometry(lite, stations) {
  const around = lite ? 16 : 24;
  return loft(stations.map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/* The bubble canopy: a half ellipsoid on the fuselage's top from station
 * 12 to 28, 5.6 in over the thrust line at its highest. */
function canopyGeometry(lite) {
  const g = new THREE.SphereGeometry(1, lite ? 12 : 20, lite ? 6 : 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(2.2 * IN, 2.9 * IN, 8.0 * IN);
  g.translate(0, 2.7 * IN, st(20.0));
  return g;
}

/* A round rod from a to b, flattened across the flow by flat. */
function rod(a, b, r, seg, flat = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.scale(1 / flat, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/* A 16 x 8 blade, cubcraft.js's outline drawn to this disc. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0060, 0.012);
  s.bezierCurveTo(0.0300, -0.020, 0.0250, -r * 0.45, 0.0090, -r * 0.96);
  s.lineTo(-0.0065, -r * 0.93);
  s.bezierCurveTo(-0.0220, -r * 0.40, -0.0150, -0.012, -0.0045, 0.012);
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
    throw new Error('edgecraft: merge failed');
  }
  return geo;
}

/*
 * The wheels' drawn lowest points and the three point attitude, as
 * cubcraft.js finds them: the ground line tangent under both wheel circles
 * in the side plane.
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
 * Exported numbers, held against the airframe table and the plant: `dims`
 * is configs/airframes.js's shape, hullR the furthest reach in plan, the
 * rudder's trailing edge at its foot, 38 in behind the CG, where the tips
 * are 30 in out; vHalfUp the fin's top, vHalfDown the main tyres' bottoms.
 */
const UP = TAIL_TOP;
const DOWN = -(MAIN_Y - MAIN_R);
export const EDGE_DIMS = {
  span: 2 * HALF,
  rootChord: ROOT_C * IN,
  stabSpan: 2 * STAB_HALF,
  gearTrack: 2 * MAIN_X,
  propR: PROP_R,
  noseZ: st(SPINNER_TIP),
  tailZ: st(RUDDER_TE_BOTTOM),
  length: (RUDDER_TE_BOTTOM - SPINNER_TIP) * IN,
  vHalfUp: UP,
  vHalfDown: DOWN,
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
    hullR: (RUDDER_TE_BOTTOM - CG_IN) * IN,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: (RUDDER_TE_BOTTOM - SPINNER_TIP) * IN,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/* The camera on the cowl's top at the firewall, looking over the spinner. */
const CAM_S = 7.5;
export const EDGE_MOUNT_FORWARD = -st(CAM_S);
export const EDGE_MOUNT_UP = FUSE_TOP_AT(CAM_S) + 0.011;

/* Clockwise seen from the cockpit, as the AM600 turns a 16 x 8. */
export const EDGE_PROP_SPIN = [1, 0, 0, 0];

export function buildEdgeCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'edge-craft';
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

  /* EF's blue scheme by region (src/render/livery.js): Blue #50 on the
   * wing, the fuselage and the tail, each its own region, Cub Yellow #30
   * the trim, the surfaces a shade of their region. */
  const coat = paintRegions();
  const blueOf = (id) => coat.base(id, cel({ color: 0x1d4fc4, rim: 0.30, spec: 0.40, specWidth: 0.016 }));
  const flapOf = (id) => coat.shade(id, cel({ color: 0x1a45aa, rim: 0.30, spec: 0.36, specWidth: 0.016 }));
  const wingMat = blueOf('wing');
  const fuseMat = blueOf('fuselage');
  const tailMat = blueOf('tail');
  const trimMat = coat.base('trim', cel({ color: 0xf5d20f, rim: 0.28, spec: 0.40, specWidth: 0.016 }));
  const trimFlap = coat.shade('trim', cel({ color: 0xdcbc0d, rim: 0.28, spec: 0.36, specWidth: 0.016 }));
  const carbon = cel({ color: 0x1b1d20, rim: 0.30, spec: 0.55, specWidth: 0.018, specColor: 0xd8e0e8 });
  const metal = cel({ color: 0xb4b0a6, rim: 0.30, spec: 0.70, specWidth: 0.022 });
  const glass = cel({ color: 0x3a2e24, rim: 0.40, spec: 0.60, specWidth: 0.020, specColor: 0xf3ead4 });
  const stator = cel({ color: 0x2a322c, rim: 0.24, spec: 0.20 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x101610, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xf3ead4, side: THREE.DoubleSide,
  });
  const ring = cel({ color: 0xb8b09e, rim: 0.28, spec: 0.55 });
  const propMat = cel({ color: 0x1c1e20, rim: 0.26, spec: 0.40 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  if (opts.measure) {
    const d = EDGE_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), wingMat);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The fuselage aft of the cowl, and the cowl in the trim's yellow. */
  const fuseStations = lite
    ? [COWL_END, 14, 21, 28, 36, 44, RUDDER_HINGE]
    : [COWL_END, 10, 14, 18, 21, 25, 28, 32, 36, 40, 44, 47, RUDDER_HINGE];
  const cowlStations = lite ? [0.6, 3, COWL_END] : [0.6, 1.5, 3, 5, COWL_END];
  for (const [stations, mat, name] of [[fuseStations, fuseMat, 'edge-fuselage'], [cowlStations, trimMat, 'edge-cowl']]) {
    const geo = fuseGeometry(lite, stations);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(c);
    mesh.name = name;
    mesh.castShadow = shade;
    hull(mesh, 1.018, ink);
    group.add(mesh);
  }

  /* The wing's fixed part in blue, its tips in yellow. */
  {
    const centre = new THREE.Mesh(merged([
      wingGeometry(lite, -TIP_TRIM, -AIL_IN - 0.0005),
      wingCentre(lite),
      wingGeometry(lite, AIL_IN + 0.0005, TIP_TRIM),
    ]), wingMat);
    centre.name = 'edge-wing';
    centre.castShadow = shade;
    group.add(centre);
    const tips = new THREE.Mesh(merged([
      wingGeometry(lite, -HALF, -TIP_TRIM),
      wingGeometry(lite, TIP_TRIM, HALF),
    ]), trimMat);
    tips.name = 'edge-wingtips';
    tips.castShadow = shade;
    group.add(tips);
  }

  /* The stabiliser and fin in blue, the stabiliser's tips and the fin's
   * cap in yellow. */
  const n = lite ? 5 : 7;
  const finBase = FUSE_TOP_AT(RUDDER_HINGE - 6) + 0.004;
  {
    const tail = new THREE.Mesh(merged([
      stabGeometry(n, -STAB_TIP_TRIM, STAB_TIP_TRIM),
      finGeometry(n, finBase, FIN_CAP),
    ]), tailMat);
    tail.name = 'edge-tail';
    tail.castShadow = shade;
    group.add(tail);
    const caps = new THREE.Mesh(merged([
      stabGeometry(n, -STAB_HALF, -STAB_TIP_TRIM),
      stabGeometry(n, STAB_TIP_TRIM, STAB_HALF),
      finGeometry(n, FIN_CAP, TAIL_TOP),
    ]), trimMat);
    caps.name = 'edge-tailtips';
    caps.castShadow = shade;
    group.add(caps);
  }

  /* The canopy. */
  {
    const canopy = new THREE.Mesh(canopyGeometry(lite), glass);
    canopy.name = 'edge-canopy';
    group.add(canopy);
  }

  /*
   * Carbon, one draw: the gear legs from the fuselage's belly out and down
   * to the axles, and the tailwheel's bracket. Yellow, one draw: the wheel
   * pants round the main wheels.
   */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const root = new THREE.Vector3(sign * 1.2 * IN, -4.2 * IN, st(MAIN_S + 0.6));
      const foot = new THREE.Vector3(sign * (MAIN_X - MAIN_W / 2 - 0.004), MAIN_Y + 0.004, st(MAIN_S));
      parts.push(rod(root, foot, 0.006, rodSeg, 3.0));
      const axle = new THREE.CylinderGeometry(0.003, 0.003, MAIN_W + 0.012, seg);
      axle.rotateZ(Math.PI / 2);
      axle.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(axle);
    }
    parts.push(rod(new THREE.Vector3(0, fuseAt(51).yc - fuseAt(51).h, st(51.0)),
      new THREE.Vector3(0, TAIL_WHEEL_Y + 0.012, st(TAIL_PIVOT_S)), 0.004, rodSeg, 2.0));
    const gear = new THREE.Mesh(merged(parts), carbon);
    gear.name = 'edge-gear';
    gear.castShadow = shade;
    group.add(gear);

    const pants = [];
    for (const sign of [-1, 1]) {
      const pant = new THREE.SphereGeometry(1, lite ? 10 : 16, lite ? 6 : 10);
      pant.scale(0.020, 0.024, 0.068);
      pant.translate(sign * MAIN_X, MAIN_Y + 0.010, st(MAIN_S) - 0.004);
      pants.push(pant);
    }
    const pantMesh = new THREE.Mesh(merged(pants), trimMat);
    pantMesh.name = 'edge-pants';
    pantMesh.castShadow = shade;
    group.add(pantMesh);

    const tyres = [];
    for (const sign of [-1, 1]) {
      const tyre = new THREE.TorusGeometry(MAIN_R - 0.008, 0.008, 6, lite ? 16 : 20);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      tyres.push(tyre);
    }
    const tyreMesh = new THREE.Mesh(merged(tyres), carbon);
    tyreMesh.name = 'edge-tyres';
    tyreMesh.castShadow = shade;
    group.add(tyreMesh);
  }

  /* The moving surfaces: the ailerons with their yellow tips, the
   * elevator's halves on one pivot with theirs, the rudder with its cap. */
  const wingFlap = flapOf('wing');
  const tailFlap = flapOf('tail');
  const leftAil = aileron(-1, { wing: wingFlap, trim: trimFlap }, shade, lite);
  const rightAil = aileron(1, { wing: wingFlap, trim: trimFlap }, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, st(ELEV_HINGE));
  const elevator = hinged(merged([
    elevatorGeometry(n, -STAB_TIP_TRIM, -0.3 * IN),
    elevatorGeometry(n, 0.3 * IN, STAB_TIP_TRIM),
  ]), eh(-STAB_HALF), eh(STAB_HALF), tailFlap, shade);
  {
    const tipGeo = merged([elevatorGeometry(n, -STAB_HALF, -STAB_TIP_TRIM), elevatorGeometry(n, STAB_TIP_TRIM, STAB_HALF)]);
    const p = elevator.pivot.position;
    tipGeo.translate(-p.x, -p.y, -p.z);
    const m = new THREE.Mesh(tipGeo, trimFlap);
    m.castShadow = shade;
    elevator.pivot.add(m);
  }
  const rudder = hinged(rudderGeometry(n, RUDDER_BOTTOM, FIN_CAP),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_HINGE)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_HINGE)),
    tailFlap, shade);
  {
    const capGeo = rudderGeometry(n, FIN_CAP, TAIL_TOP);
    const p = rudder.pivot.position;
    capGeo.translate(-p.x, -p.y, -p.z);
    const m = new THREE.Mesh(capGeo, trimFlap);
    m.castShadow = shade;
    rudder.pivot.add(m);
  }

  /* The tailwheel on its vertical pivot at the bracket's end. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, TAIL_WHEEL_Y + 0.012, st(TAIL_PIVOT_S));
    const trail = (TAIL_WHEEL_S - TAIL_PIVOT_S) * IN;
    const fork = new THREE.Mesh(merged([
      rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.012, trail), 0.0018, rodSeg),
      new THREE.CylinderGeometry(0.004, 0.004, 0.010, lite ? 6 : 10).rotateZ(Math.PI / 2).translate(0, -0.012, trail),
    ]), metal);
    fork.castShadow = shade;
    pivot.add(fork);
    const tyreGeo = new THREE.TorusGeometry(TAIL_WHEEL_R - 0.004, 0.004, 5, 12);
    tyreGeo.rotateY(Math.PI / 2);
    tyreGeo.translate(0, -0.012, trail);
    const tyre = new THREE.Mesh(tyreGeo, carbon);
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
  cameraMount.position.set(0, EDGE_MOUNT_UP, -EDGE_MOUNT_FORWARD);
  cameraMount.name = 'edge-camera-mount';
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

  /* The video antenna behind the canopy. NAMED: wire, not aircraft. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.080, lite ? 5 : 8), antenna);
    const s = 32.0;
    mast.position.set(0, FUSE_TOP_AT(s) + 0.036, st(s) + 0.012);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /* The motor's can behind the spinner, the spinner and the prop, as
   * cubcraft.js mounts them. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.012, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, 0, st(1.0));
    group.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(0, 0, st(0));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    const back = -SPINNER_BASE * IN;
    const len = -SPINNER_TIP * IN;
    const prof = [];
    const m = lite ? 4 : 6;
    prof.push(new THREE.Vector2(0.0001, back));
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      const r = Math.max(0.0005, SPINNER_R * Math.sqrt(1 - u * u));
      prof.push(new THREE.Vector2(r, back + 0.004 + (len - back - 0.004) * u));
    }
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 10 : 14), trimMat);
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
   * tip and the cowl, mint on the right tip and the turtledeck. */
  const tipTop = (x) => wingAt(x)(0.4, 1);
  const lampAt = [
    { p: tipTop(-(HALF - 0.03)), front: true },
    { p: tipTop(HALF - 0.03), front: false },
    { p: fusePoint(5.0, 0), front: true },
    { p: fusePoint(40.0, 0), front: false },
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

  /* Pose the surfaces, cubcraft.js's signs; the tailwheel at half the
   * rudder's angle, the plant's steer. */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    tailwheel.pivot.quaternion.copy(q.setFromAxisAngle(tailwheel.axis, -0.5 * rudRad));
  }
  setSurfaces(0, 0, 0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: EDGE_PROP_SPIN,
    setSurfaces,
    livery: coat.livery,
  };
}
