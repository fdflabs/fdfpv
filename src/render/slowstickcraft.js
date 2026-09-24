/*
 * slowstickcraft.js: the GWS Slow Stick's model, and nothing else.
 *
 * Its own file for the reason cubcraft.js is: a stick is not a fuselage. It
 * is a moulded foam wing on two saddles over a square black tube, a sheet
 * foam tail on the tube's end, a geared can motor turning a big slow prop
 * in front, a wire V of main gear under the wing's leading edge and a
 * small wheel under the tail. Everything else, the pack, the servos, the
 * receiver, is strapped to the tube in the open air.
 *
 * GWS publishes the span, 1176 mm, the length, 954 mm, the wing area,
 * 32.64 dm2, and the flying weight; the prop is GWS's EP1180, 11 x 8 in,
 * on the EPS-300C D gearbox. Nothing publishes the planform's details,
 * the tail's size or where the gear stands, so they are taken off
 * photographs of kits and of flying aircraft (Aloft Hobbies' production
 * photographs of the kit's parts and of built aircraft, and GWS's own)
 * and are ESTIMATED to about ten percent; docs/SLOWSTICK-STAGE1.md says
 * which:
 *
 *   span            1.176 m at the trailing edge; each tip is cut back
 *                   from the leading edge over its last 100 mm, so the
 *                   leading edge spans 0.976 m
 *   wing            a constant 0.3033 m chord inboard of the cut, which is
 *                   the chord that gives the published area; a flat
 *                   bottomed 9 percent section with the moulded rib ridges
 *                   of the real one; 12 degrees of dihedral each side from
 *                   a single joint on the centreline; 3 degrees of
 *                   incidence on the saddles
 *   stick           10 mm square, from the gearbox to the tail
 *   tail            a flat 5 mm plate: the stabiliser 0.36 m across its
 *                   leading edge and 0.44 m across its trailing edge,
 *                   0.14 m of chord, the elevator the aft 45 percent with
 *                   the scalloped edge the foam sheet is cut with; a fin
 *                   like half an egg on top, 0.18 m long and 0.19 m tall,
 *                   the rudder its aft half
 *   motor           a can under the gearbox, the prop's shaft on the
 *                   stick's line; the 11 x 8 two blade prop 10 mm behind
 *                   the nut, clockwise seen from behind
 *   gear            a wire V from the wing's leading edge saddle raked
 *                   forward to 60 mm spoked wheels on a 0.17 m track, and
 *                   a 25 mm tailwheel on a wire leg under the stabiliser,
 *                   steered with the rudder
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 100 mm behind the wing's leading
 * edge, inside the 95 to 105 mm pilots balance it at, and 2.5 mm above the
 * stick's centreline, which is where the wing above and the pack, motor
 * and gear below put it. Stations below are metres aft of the prop nut's
 * front and turn into the craft frame's z through st().
 *
 * The contract with the shell is cubcraft.js's: group, discs, blades,
 * leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians. The
 * Slow Stick has no ailerons, so the first two are read and ignored, as the
 * plant reports them zero. Elevator positive trailing edge up; rudder
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

/*
 * The aircraft, in metres, in the Three.js craft frame: x right, y up, z
 * aft, origin at the CG. Stations are metres aft of the prop nut.
 */
const LE_S = 0.220;
const CHORD = 0.3033;
const CG_S = LE_S + 0.100;
const st = (s) => s - CG_S;

/* The stick: its centreline 2.5 mm under the CG, 10 mm square. */
const STICK_Y = -0.0025;
const STICK_H = 0.005;
const STICK_FRONT_S = 0.034;
const STICK_BACK_S = 0.930;

/* The wing. */
const HALF = 0.588;
const RAKE = 0.100;
const LE_HALF = HALF - RAKE;
const DIHEDRAL = (12 * Math.PI) / 180;
const INCIDENCE = (3 * Math.PI) / 180;
/* The flat bottom's height at the leading edge on the root: 25 mm of
 * saddle over the stick's top. */
const WING_Y = STICK_Y + STICK_H + 0.025;
const WING_T = 0.09;
const RIB_PITCH = 0.070;

/* The tail, a flat plate on the stick's top at its end. */
const PLATE_T = 0.005;
const STAB_LE_S = 0.780;
const STAB_TE_S = 0.920;
const STAB_LE_HALF = 0.180;
const STAB_TE_HALF = 0.220;
const ELEV_HINGE_S = 0.857;
const STAB_Y = STICK_Y + STICK_H + PLATE_T / 2;
const FIN_Y = STAB_Y + PLATE_T / 2;
const FIN_FRONT_S = 0.772;
const FIN_BACK_S = 0.952;
const FIN_H = 0.190;
const RUDDER_S = 0.860;

/* The nose: the prop's plane, the thrust line on the stick's line. */
const THRUST_Y = STICK_Y;
const PROP_S = 0.010;
const PROP_R = 0.1397;

/* The gear. */
const MAIN_X = 0.085;
const MAIN_S = 0.140;
const MAIN_Y = STICK_Y - 0.125;
const MAIN_R = 0.030;
const MAIN_W = 0.010;
const GEAR_TOP_S = 0.215;
const TAIL_PIVOT_S = 0.880;
const TAIL_TRAIL = 0.008;
const TAIL_WHEEL_Y = STICK_Y - 0.052;
const TAIL_WHEEL_R = 0.0125;

/* How much of the chord the tip's cut has taken at span |x|, from the
 * leading edge: 0 inboard of the cut, rising to nearly all of it at the
 * tip. The section there is the wing's own section from that fraction
 * aft, so the cut face stands as thick as the foam is there. */
function cutAt(ax) {
  return ax <= LE_HALF ? 0 : Math.min(0.97, (ax - LE_HALF) / RAKE);
}

/* The NACA four digit thickness at chord fraction t, the whole of it: the
 * section is flat bottomed, so the top carries the thickness and the bottom
 * is the chord line. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}

/* A point on the wing at span x, chord fraction t of what is left there,
 * top (side 1) or bottom (-1). The bottom is a straight line at the
 * incidence; the top rides on it with the moulded ribs, a shallow dip
 * between each pair. */
function wingAt(x, ribs) {
  const ax = Math.abs(x);
  const u = cutAt(ax);
  const lift = ax * Math.tan(DIHEDRAL);
  const dip = ribs ? 1 - 0.16 * Math.pow(Math.sin((Math.PI * ax) / RIB_PITCH), 2) : 1;
  return (t, side) => {
    const tt = u + t * (1 - u);
    const s = LE_S + tt * CHORD;
    const bottom = WING_Y + lift - (s - LE_S) * Math.tan(INCIDENCE);
    const top = side > 0 ? 2 * naca(tt, WING_T) * CHORD * dip : 0;
    return new THREE.Vector3(x, bottom + top, st(s));
  };
}

/* A closed section, cosine spaced, over the top and back under. */
function section(at, n) {
  const ts = [];
  for (let i = 0; i < n; i += 1) {
    ts.push(0.5 * (1 - Math.cos((Math.PI * i) / (n - 1))));
  }
  const loop = ts.map((t) => at(t, 1));
  for (let i = n - 2; i >= 0; i -= 1) {
    loop.push(at(ts[i], -1));
  }
  return loop;
}

/*
 * Skin a run of closed sections into one indexed geometry, capped at both
 * ends, cubcraft.js's loft: the signed volume decides which way the
 * triangles face.
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

/* The wing, tip to tip in one loft through the dihedral's joint. The full
 * model has a station every quarter rib, so the ridges read. */
function wingGeometry(lite) {
  const n = lite ? 10 : 14;
  const half = [];
  const step = lite ? 0.098 : RIB_PITCH / 4;
  for (let x = 0; x < LE_HALF - 1e-6; x += step) {
    half.push(x);
  }
  half.push(LE_HALF);
  for (const u of lite ? [0.5, 1] : [0.25, 0.5, 0.75, 1]) {
    half.push(LE_HALF + RAKE * u);
  }
  const xs = [...half.slice(1).reverse().map((x) => -x), ...half];
  return loft(xs.map((x) => section(wingAt(x, !lite), n)));
}

/* The white tape along the leading edge, a hair proud of the foam. */
function tapeGeometry(lite) {
  const ring = (x) => {
    const at = wingAt(x, false);
    const out = [];
    for (const t of [0.018, 0.008, 0.002, 0]) {
      const p = at(t, 1);
      p.y += 0.0006;
      out.push(p);
    }
    for (const t of [0.002, 0.008, 0.018]) {
      const p = at(t, -1);
      p.y -= 0.0006;
      out.push(p);
    }
    return out;
  };
  const parts = [];
  for (const sign of [-1, 1]) {
    const xs = lite ? [0, LE_HALF] : [0, LE_HALF / 2, LE_HALF];
    parts.push(loft(xs.map((x) => ring(sign * x))));
  }
  return parts;
}

/* A flat plate from an outline in (x, s), extruded PLATE_T thick about y. */
function plate(outline, y) {
  const shape = new THREE.Shape();
  outline.forEach(([x, s], i) => (i === 0 ? shape.moveTo(x, s) : shape.lineTo(x, s)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: PLATE_T, bevelEnabled: false, curveSegments: 1 });
  /* Shape x, y becomes craft x, z; the extrusion becomes y. */
  geo.rotateX(Math.PI / 2);
  geo.translate(0, y + PLATE_T / 2, -CG_S);
  return geo;
}
/* The same for a vertical plate, outline in (s, h) with h up from FIN_Y. */
function finPlate(outline) {
  const shape = new THREE.Shape();
  outline.forEach(([s, h], i) => (i === 0 ? shape.moveTo(s, h) : shape.lineTo(s, h)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: PLATE_T, bevelEnabled: false, curveSegments: 1 });
  /* Shape x, y becomes craft z, y; the extrusion becomes x. */
  geo.rotateY(-Math.PI / 2);
  geo.translate(-PLATE_T / 2, FIN_Y, -CG_S);
  return geo;
}

/* The stabiliser's half width at station s: straight tips from the leading
 * edge's corner to the trailing edge's. */
function stabHalf(s) {
  const u = (s - STAB_LE_S) / (STAB_TE_S - STAB_LE_S);
  return STAB_LE_HALF + (STAB_TE_HALF - STAB_LE_HALF) * u;
}
function stabOutline() {
  const h = stabHalf(ELEV_HINGE_S);
  return [[-STAB_LE_HALF, STAB_LE_S], [STAB_LE_HALF, STAB_LE_S], [h, ELEV_HINGE_S], [-h, ELEV_HINGE_S]];
}
/* The elevator, both halves in one, its trailing edge in the foam sheet's
 * scallops: nine bays across. */
function elevatorOutline(lite) {
  const h = stabHalf(ELEV_HINGE_S);
  const out = [[-h, ELEV_HINGE_S + 0.001], [h, ELEV_HINGE_S + 0.001]];
  const bays = 9;
  const per = lite ? 3 : 6;
  for (let i = 0; i <= bays * per; i += 1) {
    const x = STAB_TE_HALF - (2 * STAB_TE_HALF * i) / (bays * per);
    const phase = ((i % per) / per) * Math.PI;
    out.push([x, STAB_TE_S - 0.008 * Math.sin(phase)]);
  }
  return out;
}

/* The fin and rudder: half an egg standing on the stabiliser, fuller aft,
 * the rudder behind a vertical hinge. h(s) is its height at station s. */
function finHeight(s) {
  const mid = FIN_FRONT_S + 0.52 * (FIN_BACK_S - FIN_FRONT_S);
  const a = s < mid ? mid - FIN_FRONT_S : FIN_BACK_S - mid;
  const u = Math.min(1, Math.abs(s - mid) / a);
  return FIN_H * Math.sqrt(Math.max(0, 1 - u * u));
}
function finOutline(from, to, n) {
  const out = [[from, 0]];
  for (let i = 0; i <= n; i += 1) {
    const s = from + ((to - from) * i) / n;
    out.push([s, Math.max(0.004, finHeight(s))]);
  }
  out.push([to, 0]);
  return out;
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
function box(w, h, l, x, y, s) {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, st(s));
  return g;
}

/*
 * A GWS spoked wheel in the craft's y z plane: a thin tyre, a rim, three
 * curved spokes and a hub, as the kit's moulded ones. Returns tyre and
 * wheel parts separately, since the tyre is black and the rest is too, but
 * the tyre is what touches the ground and is measured.
 */
function wheelParts(r, w, lite) {
  const tube = Math.max(0.0025, r * 0.1);
  const tyre = new THREE.TorusGeometry(r - tube, tube, 6, lite ? 16 : 24);
  tyre.rotateY(Math.PI / 2);
  const inner = [];
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, w, lite ? 8 : 10);
  hub.rotateZ(Math.PI / 2);
  inner.push(hub);
  const spokes = lite ? 0 : 3;
  for (let k = 0; k < spokes; k += 1) {
    const a0 = (2 * Math.PI * k) / spokes;
    const pts = [];
    for (let i = 0; i <= 4; i += 1) {
      const u = i / 4;
      const rr = r * 0.2 + (r - 2 * tube - r * 0.2) * u;
      const a = a0 + 0.9 * u;
      pts.push(new THREE.Vector3(0, rr * Math.cos(a), rr * Math.sin(a)));
    }
    for (let i = 0; i + 1 < pts.length; i += 1) {
      inner.push(rod(pts[i], pts[i + 1], 0.0012, 4));
    }
  }
  return { tyre, inner };
}

/* An 11 x 8 slow flyer blade: narrow at the hub, broad and square tipped
 * outboard, as GWS's are. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0040, 0.006);
  s.bezierCurveTo(0.0200, -0.030, 0.0190, -r * 0.60, 0.0120, -r * 0.985);
  s.lineTo(-0.0080, -r * 0.975);
  s.bezierCurveTo(-0.0130, -r * 0.55, -0.0110, -0.025, -0.0035, 0.006);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0020, bevelEnabled: false, curveSegments: segments });
}

function merged(parts, what) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  if (!geo) {
    throw new Error(`slowstickcraft: ${what} merge failed`);
  }
  return geo;
}

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

/*
 * The wheels' drawn lowest points in the level craft frame and the three
 * point attitude they make, cubcraft.js's construction: the ground line
 * tangent under both wheel circles in the side plane, solved by bisection.
 * A tyre is a torus whose outermost ring has a vertex straight under the
 * axle, so the lowest vertex is the axle less the radius, exactly.
 */
const MAIN_AXLE = [MAIN_X, MAIN_Y, st(MAIN_S)];
const TAIL_AXLE = [0, TAIL_WHEEL_Y, st(TAIL_PIVOT_S + TAIL_TRAIL)];
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
const restContact = (axle, r) => [axle[0], axle[1] - r * Math.cos(REST_PITCH), axle[2] + r * Math.sin(REST_PITCH)];
const REST_CG_HEIGHT = (() => {
  const c = restContact(MAIN_AXLE, MAIN_R);
  return -(Math.cos(REST_PITCH) * c[1] - Math.sin(REST_PITCH) * c[2]);
})();

/*
 * The furthest the drawn machine reaches from the CG in plan, which is the
 * elevator's outer trailing corner, 0.64 m aft and 0.22 m out, a little
 * further than either the wing's tips or the rudder.
 */
const REACH = Math.max(
  Math.hypot(STAB_TE_HALF, st(STAB_TE_S)),
  Math.hypot(HALF, st(LE_S + CHORD)),
  st(FIN_BACK_S),
);
const UP = FIN_Y + FIN_H;
const DOWN = -(MAIN_Y - MAIN_R);

export const SLOWSTICK_DIMS = {
  span: 2 * HALF,
  chord: CHORD,
  dihedralDeg: 12,
  stabSpan: 2 * STAB_TE_HALF,
  stabChord: STAB_TE_S - STAB_LE_S,
  finHeight: FIN_H,
  gearTrack: 2 * MAIN_X,
  propR: PROP_R,
  thrustY: THRUST_Y,
  noseZ: st(0),
  tailZ: st(FIN_BACK_S),
  length: FIN_BACK_S,
  reach: REACH,
  vHalfUp: UP,
  vHalfDown: DOWN,
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: MAIN_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: MAIN_W },
    tail: { axle: [...TAIL_AXLE], r: TAIL_WHEEL_R, width: 0.005 },
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
    hullR: REACH,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: FIN_BACK_S,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera mount: an FPV camera strapped on top of the stick just behind
 * the gearbox, where Slow Stick FPV builds put it, looking through the
 * prop. 0.22 m ahead of the CG and 17 mm above it.
 */
const CAM_S = 0.100;
export const SLOWSTICK_MOUNT_FORWARD = -st(CAM_S);
export const SLOWSTICK_MOUNT_UP = STICK_Y + STICK_H + 0.014;

/* The prop turns clockwise seen from behind, as cubcraft.js's; slots 1 to
 * 3 spin nothing. */
export const SLOWSTICK_PROP_SPIN = [1, 0, 0, 0];

export function buildSlowStickCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'slowstick-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 6 : 10;

  const foam = cel({ color: 0xe5402a, rim: 0.28, spec: 0.22, specWidth: 0.012 });
  const flapMat = cel({ color: 0xcf3522, rim: 0.28, spec: 0.20, specWidth: 0.012 });
  const tape = cel({ color: 0xf4f1ea, rim: 0.30, spec: 0.40, specWidth: 0.016 });
  const black = cel({ color: 0x17191b, rim: 0.30, spec: 0.40, specWidth: 0.016, specColor: 0xd8e0e8 });
  const wire = cel({ color: 0x2a2c2e, rim: 0.30, spec: 0.55, specWidth: 0.020 });
  const band = cel({ color: 0xd9b24a, rim: 0.26, spec: 0.20 });
  const pack = cel({ color: 0x3b5e8c, rim: 0.28, spec: 0.35 });
  const stator = cel({ color: 0x9a968c, rim: 0.30, spec: 0.65, specWidth: 0.022 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({ color: 0x101610, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xf3ead4, side: THREE.DoubleSide });
  const propMat = cel({ color: 0x2c302c, rim: 0.26, spec: 0.30 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = SLOWSTICK_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), foam);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The wing, its own draw so its outline hull wraps it alone. */
  {
    const wing = new THREE.Mesh(wingGeometry(lite), foam);
    wing.name = 'slowstick-wing';
    wing.castShadow = shade;
    hull(wing, 1.006, ink);
    group.add(wing);
  }

  /* Fixed foam, one draw: the stabiliser and the fin ahead of the hinges. */
  {
    const parts = [plate(stabOutline().map(([x, s]) => [x, s]), STAB_Y),
      finPlate(finOutline(FIN_FRONT_S, RUDDER_S - 0.001, lite ? 6 : 12))];
    const tail = new THREE.Mesh(merged(parts, 'tail'), foam);
    tail.name = 'slowstick-tail';
    tail.castShadow = shade;
    group.add(tail);
  }

  /* White, one draw: the leading edge tape. */
  {
    const t = new THREE.Mesh(merged(tapeGeometry(lite), 'tape'), tape);
    t.name = 'slowstick-tape';
    group.add(t);
  }

  /*
   * Black, one draw: the stick, the two wing saddles, the gearbox and its
   * clamp, the servo tray and the two servos, the receiver and the ESC, the
   * main tyres and the wheels' hubs and spokes.
   */
  {
    const len = STICK_BACK_S - STICK_FRONT_S;
    const parts = [box(2 * STICK_H, 2 * STICK_H, len, 0, STICK_Y, STICK_FRONT_S + len / 2)];
    /* The saddles: a V under the leading edge, a lower one under the
     * trailing edge, each a crossbar the wing sits on and its post. */
    const saddleTop = (s) => WING_Y - (s - LE_S) * Math.tan(INCIDENCE);
    for (const [s, w] of [[LE_S + 0.012, 0.11], [LE_S + CHORD - 0.018, 0.12]]) {
      const top = saddleTop(s);
      parts.push(box(w, 0.004, 0.012, 0, top - 0.002, s));
      parts.push(box(0.008, top - (STICK_Y + STICK_H), 0.010, 0, (top + STICK_Y + STICK_H) / 2, s));
      for (const sign of [-1, 1]) {
        parts.push(rod(new THREE.Vector3(sign * w * 0.45, top - 0.003, st(s)),
          new THREE.Vector3(sign * 0.004, STICK_Y + STICK_H, st(s)), 0.0018, 4));
      }
    }
    /* The gearbox: a housing over the spur gear ahead of the stick's end,
     * the socket the stick slides into, and the motor's end bell. */
    parts.push(box(0.016, 0.040, 0.012, 0, THRUST_Y - 0.008, 0.026));
    parts.push(box(0.014, 0.014, 0.020, 0, STICK_Y, 0.040));
    /* Servos either side of the stick, the ESC on top ahead of the wing,
     * the receiver on top behind it. */
    for (const sign of [-1, 1]) {
      parts.push(box(0.011, 0.022, 0.024, sign * 0.0115, STICK_Y - 0.004, 0.560));
    }
    parts.push(box(0.018, 0.008, 0.034, 0, STICK_Y + STICK_H + 0.004, 0.075));
    parts.push(box(0.020, 0.009, 0.030, 0, STICK_Y + STICK_H + 0.0045, 0.575));
    /* The wheels: tyres, hubs and spokes. */
    for (const sign of [-1, 1]) {
      const { tyre, inner } = wheelParts(MAIN_R, MAIN_W, lite);
      for (const g of [tyre, ...inner]) {
        g.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
        parts.push(g);
      }
    }
    const blackMesh = new THREE.Mesh(merged(parts, 'black'), black);
    blackMesh.name = 'slowstick-black';
    blackMesh.castShadow = shade;
    hull(blackMesh, 1.03, ink);
    group.add(blackMesh);
  }

  /*
   * Wire, one draw: the main gear's V from the leading edge saddle to the
   * axles with its crossbar, the axles, the pushrods from the servos along
   * the stick to the horns, and the tailwheel's leg down from the stick.
   */
  {
    const r = 0.0011;
    const parts = [];
    const topAt = (sign) => new THREE.Vector3(sign * 0.006, STICK_Y - STICK_H, st(GEAR_TOP_S));
    const footAt = (sign) => new THREE.Vector3(sign * (MAIN_X - 0.010), MAIN_Y, st(MAIN_S));
    for (const sign of [-1, 1]) {
      parts.push(rod(topAt(sign), footAt(sign), r, seg));
      parts.push(rod(footAt(sign), new THREE.Vector3(sign * (MAIN_X + MAIN_W / 2 + 0.003), MAIN_Y, st(MAIN_S)), r, seg));
    }
    const bar = (u) => [-1, 1].map((sign) => new THREE.Vector3().lerpVectors(topAt(sign), footAt(sign), u));
    const [bl, br] = bar(0.82);
    parts.push(rod(bl, br, r, seg));
    for (const sign of [-1, 1]) {
      const from = new THREE.Vector3(sign * 0.0115, STICK_Y + 0.006, st(0.575));
      const to = new THREE.Vector3(sign * 0.004, STICK_Y + (sign > 0 ? STICK_H + 0.010 : -STICK_H - 0.006), st(0.870));
      parts.push(rod(from, to, 0.0008, 4));
    }
    parts.push(rod(new THREE.Vector3(0, STICK_Y - STICK_H, st(TAIL_PIVOT_S)),
      new THREE.Vector3(0, TAIL_WHEEL_Y + 0.004, st(TAIL_PIVOT_S)), r, seg));
    const wireMesh = new THREE.Mesh(merged(parts, 'wire'), wire);
    wireMesh.name = 'slowstick-wire';
    wireMesh.castShadow = shade;
    group.add(wireMesh);
    /* The sleeve on the gear's crossbar, and the rubber bands over the wing
     * from saddle to saddle, one draw. */
    const bands = [rod(new THREE.Vector3().lerpVectors(bl, br, 0.3), new THREE.Vector3().lerpVectors(bl, br, 0.7),
      0.0024, 6)];
    const over = (x, t) => wingAt(x, false)(t, 1).add(new THREE.Vector3(0, 0.0015, 0));
    for (const [x0, x1] of [[-0.05, 0.05], [0.05, -0.05], [-0.03, 0.03], [0.03, -0.03]]) {
      const pts = [0.02, 0.2, 0.4, 0.6, 0.8, 0.96].map((t) => over(x0 + (x1 - x0) * t, t));
      for (let i = 0; i + 1 < pts.length; i += 1) {
        bands.push(rod(pts[i], pts[i + 1], 0.0012, 4));
      }
    }
    const bandMesh = new THREE.Mesh(merged(bands, 'bands'), band);
    bandMesh.name = 'slowstick-bands';
    group.add(bandMesh);
  }

  /* The pack under the stick, ahead of the wing, where it balances. */
  {
    const p = new THREE.Mesh(box(0.030, 0.017, 0.072, 0, STICK_Y - STICK_H - 0.0085, 0.165), pack);
    p.name = 'slowstick-pack';
    p.castShadow = shade;
    hull(p, 1.05, ink);
    group.add(p);
  }

  /* The two moving surfaces. The elevator is both halves in one plate; the
   * rudder hangs on a vertical hinge on the stabiliser's top. */
  const elevator = hinged(plate(elevatorOutline(lite), STAB_Y),
    new THREE.Vector3(-stabHalf(ELEV_HINGE_S), STAB_Y, st(ELEV_HINGE_S)),
    new THREE.Vector3(stabHalf(ELEV_HINGE_S), STAB_Y, st(ELEV_HINGE_S)),
    flapMat, shade);
  const rudder = hinged(finPlate(finOutline(RUDDER_S + 0.001, FIN_BACK_S, lite ? 6 : 12)),
    new THREE.Vector3(0, FIN_Y, st(RUDDER_S)),
    new THREE.Vector3(0, FIN_Y + FIN_H, st(RUDDER_S)),
    flapMat, shade);

  /* The tailwheel on its own vertical pivot at the leg's foot, trailing a
   * little behind it, turning with the rudder. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, TAIL_WHEEL_Y + 0.004, st(TAIL_PIVOT_S));
    const fork = new THREE.Mesh(merged([
      rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.004, TAIL_TRAIL), 0.0011, 4),
      rod(new THREE.Vector3(-0.004, -0.004, TAIL_TRAIL), new THREE.Vector3(0.004, -0.004, TAIL_TRAIL), 0.0011, 4),
    ], 'fork'), wire);
    fork.castShadow = shade;
    pivot.add(fork);
    const { tyre, inner } = wheelParts(TAIL_WHEEL_R, 0.005, true);
    const tw = new THREE.Mesh(merged([tyre, ...inner].map((g) => g.translate(0, -0.004, TAIL_TRAIL)), 'tailwheel'), black);
    tw.name = 'tyre-tail';
    tw.castShadow = shade;
    pivot.add(tw);
    return { pivot, axis: new THREE.Vector3(0, 1, 0) };
  })();

  const surfaces = { elevator, rudder, tailwheel };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  /* The camera on the stick's top behind the gearbox. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, SLOWSTICK_MOUNT_UP, -SLOWSTICK_MOUNT_FORWARD);
  cameraMount.name = 'slowstick-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.019, 0.019), camBody);
    housing.position.set(0, 0, 0.006);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0084, 0.012, lite ? 8 : 14), camBody);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.010);
    cameraMount.add(barrel);
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0070, lite ? 10 : 18), lens);
    glassDisc.rotation.y = Math.PI;
    glassDisc.position.set(0, 0, -0.0162);
    cameraMount.add(glassDisc);
  }

  /* The video antenna, a whip up from the receiver. NAMED, because it is
   * wire and not aircraft: scripts/craft-check.js leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.070, lite ? 5 : 8), antenna);
    mast.position.set(0.006, STICK_Y + STICK_H + 0.042, st(0.600));
    mast.rotation.x = 0.4;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The motor under the gearbox, the prop nut, and the prop. The prop
   * mount turns the rotor's y onto the craft's forward axis, -z, as
   * cubcraft.js does, so rotor.rotation.y is the spin the shell drives.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.0120, 0.0120, 0.032, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, THRUST_Y - 0.0152, st(0.050));
    can.castShadow = shade;
    group.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(0, THRUST_Y, st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    /* The shaft and its nut, from the gearbox to the nut's front. */
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.022, 6), stator);
    shaft.position.set(0, -0.001, 0);
    propMount.add(shaft);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0055, 0.008, lite ? 6 : 8), stator);
    nut.position.set(0, PROP_S - 0.004, 0);
    nut.name = 'spinner';
    propMount.add(nut);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateZ((18 * Math.PI) / 180);
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
    const noDisc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }));
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }

  /*
   * Four lamps on the four slots the pose driver walks, cubcraft.js's
   * arrangement: sakura on the left tip and the gearbox, mint on the right
   * tip and the stick's end.
   */
  const tipTop = (x) => wingAt(x, false)(0.4, 1);
  const lampAt = [
    { p: tipTop(-(LE_HALF - 0.02)), front: true },
    { p: tipTop(LE_HALF - 0.02), front: false },
    { p: new THREE.Vector3(0, THRUST_Y + 0.013, st(0.026)), front: true },
    { p: new THREE.Vector3(0, STICK_Y + STICK_H, st(STICK_BACK_S - 0.004)), front: false },
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

  /*
   * Pose the surfaces. Radians: left aileron, right aileron (the Slow Stick
   * has none, and the plant reports zero there), elevator, rudder. The
   * elevator's axis points +x and the rudder's +y, and about either a
   * negative turn carries an aft point up or to -x, so each turns by the
   * negated angle; the tailwheel with the rudder.
   */
  const q = new THREE.Quaternion();
  function setSurfaces(_leftRad, _rightRad, elevRad = 0, rudRad = 0) {
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
    propSpin: SLOWSTICK_PROP_SPIN,
    setSurfaces,
  };
}
