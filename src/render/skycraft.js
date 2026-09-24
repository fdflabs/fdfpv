/*
 * skycraft.js: the Skyhunter's model, and nothing else.
 *
 * Its own file for the reason wingcraft.js is: a twin boom pusher does not
 * share a silhouette with a flying wing or a quad. It is a foam pod hung
 * under a straight wing, a pusher prop on the back of the pod, and two
 * carbon booms carrying an H tail clear of the prop disc.
 *
 * The subject is the X-UAV Skyhunter, the 1800 mm span FPV platform, in its
 * original three channel form as the owner's photographs show it. The
 * published numbers are the span, 1800 mm, the length, 48 in or 1219 mm
 * (Model Aviation's review of the Origin kit; Sonic Modell's later
 * reissue quotes 1400 mm with its booms fully extended), the wing area,
 * 604 in2 or 0.390 m2 (the same review), the centre of gravity, a third of
 * the chord back from the leading edge (Sonic Modell's manual), and the
 * prop, an 11 x 5.5 (the review's power system). Nothing publishes the
 * boom spacing, the tail or the pod, so those are taken off the owner's
 * photographs in proportion to the span:
 *
 *   span            1.800 m, tips at x = +-0.9
 *   wing            a straight leading edge, a constant 0.245 m chord out to
 *                   the booms' station and a taper to 0.170 m at the tip,
 *                   0.39 m2, 2.5 degrees of dihedral, and tips rounded in
 *                   plan and turned up over their last 60 mm
 *   ailerons        from 0.40 to 0.82 m out, the aft quarter of the chord
 *   booms           two 12 mm carbon tubes, 0.464 m apart
 *   H tail          a 0.456 m by 0.130 m stabiliser between the booms, its
 *                   elevator the aft 0.050 m of it, and a 0.19 m fin at
 *                   each boom end whose rudder is the aft 0.050 m
 *   pod             0.62 m nose to motor face, 0.14 m wide
 *   prop            11 x 5.5 two blade pusher, a 0.2794 m disc
 *   length          1.225 m nose to fin trailing edge
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY, as it is for the wing: a third of
 * the root chord behind the leading edge, and between the pod's axis and
 * the wing's, which is where a pack in the bay puts it on a high wing.
 *
 * The palette is the photograph's: white foam, black carbon, black plastic
 * at the clamps, skid and camera. The moving surfaces are the foam a shade
 * down, because on the real aircraft they are the same moulding cut on a
 * hinge line and the cut is what the eye reads. The pod carries an outline
 * hull; the wing and tail do not, for wingcraft.js's reason: a one percent
 * copy of 1.8 m of span stands off the tips by nine millimetres.
 *
 * The contract with the shell is wingcraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces. Here setSurfaces takes FOUR angles in radians: left aileron,
 * right aileron, elevator, rudder. Ailerons and elevator are positive
 * trailing edge up; the rudder is positive trailing edge to the LEFT, which
 * yaws the nose left. That is the contract with the plant.
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
 * aft, origin at the CG.
 */
const HALF = 0.9;
const ROOT_CHORD = 0.245;
const TIP_CHORD = 0.170;
/* The wing's chord is constant inboard of this and tapers outboard. */
const TAPER_IN = 0.30;
/* Where the tip starts to round in plan and turn up, and by how much. */
const TIP_IN = 0.84;
const TIP_UP = 0.028;
const DIHEDRAL = (2.5 * Math.PI) / 180;
/* A third of the root chord behind the leading edge is the CG. */
const LE_Z = -ROOT_CHORD / 3;
/* The root chord line's height above the CG. The pod's top rides a few
 * millimetres into the wing's underside, the saddle the wing bolts into. */
const WING_Y = 0.045;
/* NACA 3412: a cambered trainer section, near enough in profile to the
 * Skyhunter's nearly flat bottomed one. */
const WING_T = 0.12;
const WING_M = 0.03;
const WING_P = 0.4;

const AIL_IN = 0.40;
const AIL_OUT = 0.82;
const AIL_HINGE = 0.75;

/* The booms, and the tail on their ends. */
const BOOM_X = 0.232;
const BOOM_R = 0.006;
const BOOM_Z0 = 0.02;
const BOOM_Z1 = 0.80;
const STAB_HALF = 0.228;
const STAB_LE = 0.705;
const STAB_CHORD = 0.130;
const STAB_T = 0.07;
const ELEV_HINGE = 1 - 0.050 / STAB_CHORD;
const FIN_TE = 0.840;
const FIN_LE_ROOT = 0.690;
const FIN_LE_TIP = 0.745;
const FIN_DOWN = 0.022;
const FIN_UP = 0.168;
const FIN_T = 0.07;
const RUDDER_Z = FIN_TE - 0.050;

/* The pod's nose, the motor face on its tail, and the prop behind it. */
const NOSE_Z = -0.385;
const POD_TAIL_Z = 0.235;
const MOTOR_Y = 0.032;
const PROP_Z = 0.268;
const PROP_R = 0.1397;

function chordLE(ax) {
  const nominal = ax <= TAPER_IN
    ? ROOT_CHORD
    : ROOT_CHORD - (ROOT_CHORD - TIP_CHORD) * ((ax - TAPER_IN) / (HALF - TAPER_IN));
  if (ax <= TIP_IN) {
    return { c: nominal, le: LE_Z };
  }
  /* An ellipse in plan over the last 60 mm, closing on 45 percent of the
   * nominal chord, so both the leading and trailing corners round off.
   * Stopped short of the point, so the tip closes on a 17 mm chord rather
   * than on a degenerate ring. */
  const u = Math.min(0.995, (ax - TIP_IN) / (HALF - TIP_IN));
  const f = Math.sqrt(1 - u * u);
  return { c: nominal * f, le: LE_Z + 0.45 * nominal * (1 - f) };
}
function wingLift(ax) {
  const u = Math.max(0, (ax - TIP_IN) / (HALF - TIP_IN));
  return WING_Y + ax * Math.tan(DIHEDRAL) + TIP_UP * u * u;
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
 * A closed airfoil section, as a loop running over the top from chord
 * fraction f0 to f1 and back under. `at(t, side)` gives the point at t on
 * the upper (side +1) or lower (-1) surface. From the leading edge the two
 * surfaces meet at t = 0, so the lower run stops short of it; from a hinge
 * they do not, and the loop takes both. Cosine spacing puts points where
 * the curvature is.
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
function tailAt(x, y0, le, c, thick) {
  return (t, side) => new THREE.Vector3(x, y0 + side * c * naca(t, thick), le + t * c);
}

/*
 * Skin a run of closed sections, all the same point count, into one indexed
 * geometry, with a triangle fan capping each end. Indexed so the normals are
 * shared across a station and the surface shades as one form.
 *
 * The outward direction is not reasoned about: the signed volume of the
 * closed result says whether it faces out, and a negative one flips every
 * triangle. That makes one loft serve a wing lofted along x, a pod lofted
 * along z and a fin lofted up and turned.
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
  /* Each cap walks its ring against the side quads, so every shared edge
   * is traversed once each way and the whole shell winds one way. */
  cap(sections[0], 0, true);
  cap(sections[sections.length - 1], (sections.length - 1) * n, false);

  /* Closed and consistently wound, so the signed volume says whether it
   * faces out. */
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
 * The wing, tip to tip in one loft. Across each aileron the section stops
 * at the hinge, and the step from a full section to a cut one at the same
 * station is the cut out's side wall, as on wingcraft.js's elevons.
 */
function wingGeometry(lite) {
  const n = lite ? 9 : 14;
  const eps = 0.0005;
  const half = [
    [0, 1], [0.12, 1], [TAPER_IN, 1], [AIL_IN - eps, 1], [AIL_IN + eps, AIL_HINGE],
    [0.61, AIL_HINGE], [AIL_OUT - eps, AIL_HINGE], [AIL_OUT + eps, 1], [TIP_IN, 1],
  ];
  const tip = lite ? [0.87, HALF] : [0.855, 0.87, 0.882, 0.892, HALF];
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
 * A hinged surface: its geometry laid in the craft frame, then moved so
 * the pivot sits on the hinge line and the flap turns about the hinge's
 * own axis. The axis is chosen pointing +x for a horizontal hinge and +y
 * for a vertical one, so for every surface a NEGATIVE turn lifts the
 * trailing edge (or swings it to the left): see setSurfaces.
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
  return { pivot, axis };
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

/* The stabiliser's fixed part, or its elevator, between the fins. */
function stabGeometry(f0, f1, n) {
  const xs = [-STAB_HALF, 0, STAB_HALF];
  const y0 = boomY();
  return loft(xs.map((x) => section(tailAt(x, y0, STAB_LE, STAB_CHORD, STAB_T), f0, f1, n)));
}

/*
 * A fin at x, or its rudder. Lofted with its span along x and then stood
 * up, so the airfoil helpers serve it unchanged: span s from the bottom of
 * the fin, the leading edge raked back with height, the trailing edge and
 * the rudder hinge vertical.
 */
function finGeometry(x, rudder, n) {
  const h = FIN_DOWN + FIN_UP;
  const secs = [];
  for (const s of [0, h * 0.5, h]) {
    const le = FIN_LE_ROOT + (FIN_LE_TIP - FIN_LE_ROOT) * (s / h);
    const c = FIN_TE - le;
    const fh = (RUDDER_Z - le) / c;
    const at = tailAt(s, 0, le, c, FIN_T);
    secs.push(rudder ? section(at, fh, 1, n) : section(at, 0, fh, n));
  }
  const geo = loft(secs);
  /* Span x becomes up, thickness y becomes across. */
  geo.rotateZ(Math.PI / 2);
  geo.translate(x, boomY() - FIN_DOWN, 0);
  geo.computeVertexNormals();
  return geo;
}

function boomY() {
  return wingLift(BOOM_X) - 0.004;
}

/*
 * The pod, as a loft of rounded box sections along z: half width, half
 * height, centre height and squareness at each station. A blunt elliptic
 * nose, a bay whose top rides into the wing's saddle, and a tail that
 * climbs to the motor so the pod's back stands proud behind the wing.
 */
const POD = [
  [-0.300, 0.066, 0.075, -0.033, 2.6],
  [-0.100, 0.068, 0.079, -0.036, 2.8],
  [0.050, 0.066, 0.078, -0.036, 2.8],
  [0.130, 0.056, 0.066, -0.020, 2.5],
  [0.195, 0.042, 0.046, 0.016, 2.2],
  [POD_TAIL_Z, 0.028, 0.028, MOTOR_Y, 2.0],
];
function podAt(z) {
  if (z <= POD[0][0]) {
    const [z0, w, h, yc, e] = POD[0];
    const u = (z0 - z) / (z0 - NOSE_Z);
    const f = Math.sqrt(Math.max(0, 1 - u * u));
    return { w: w * f, h: h * f, yc: yc + 0.010 * u, e: 2 + (e - 2) * f };
  }
  for (let i = 0; i + 1 < POD.length; i += 1) {
    const a = POD[i];
    const b = POD[i + 1];
    if (z <= b[0]) {
      const u = (z - a[0]) / (b[0] - a[0]);
      const s = u * u * (3 - 2 * u);
      return {
        w: a[1] + (b[1] - a[1]) * s,
        h: a[2] + (b[2] - a[2]) * s,
        yc: a[3] + (b[3] - a[3]) * s,
        e: a[4] + (b[4] - a[4]) * s,
      };
    }
  }
  const [, w, h, yc, e] = POD[POD.length - 1];
  return { w, h, yc, e };
}
/* A point on the pod's skin at z, angle a from the top towards +x. */
function podPoint(z, a, out = 0) {
  const { w, h, yc, e } = podAt(z);
  const s = Math.sin(a);
  const c = Math.cos(a);
  const p = 2 / e;
  return new THREE.Vector3(
    Math.sign(s) * (w + out) * Math.abs(s) ** p,
    yc + Math.sign(c) * (h + out) * Math.abs(c) ** p,
    z,
  );
}
function podGeometry(lite) {
  const around = lite ? 14 : 24;
  const zs = [];
  const noseSteps = lite ? 4 : 7;
  for (let i = 1; i <= noseSteps; i += 1) {
    zs.push(NOSE_Z + (POD[0][0] - NOSE_Z) * (1 - Math.cos((Math.PI / 2) * (i / noseSteps))));
  }
  const body = lite ? [-0.1, 0.05, 0.13, 0.195, POD_TAIL_Z]
    : [-0.2, -0.1, 0.0, 0.05, 0.1, 0.13, 0.165, 0.195, 0.218, POD_TAIL_Z];
  zs.push(...body);
  /* The nose's first ring is a hair off the tip, so the cap fan closes it
   * without a degenerate ring. */
  zs.unshift(NOSE_Z + 0.002);
  return loft(zs.map((z) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(podPoint(z, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/*
 * The canopy hatch's cut line, a closed loop on the pod's top from behind
 * the nose to the wing's leading edge, as a thin tube a hair proud of the
 * skin.
 */
function hatchSeam(lite) {
  const z0 = -0.325;
  const z1 = LE_Z - 0.010;
  const a0 = 0.95;
  const pts = [];
  const m = lite ? 6 : 12;
  for (let i = 0; i <= m; i += 1) {
    pts.push(podPoint(z0 + ((z1 - z0) * i) / m, a0, 0.0008));
  }
  for (let i = 0; i <= m; i += 1) {
    pts.push(podPoint(z1, a0 - (2 * a0 * i) / m, 0.0008));
  }
  for (let i = 0; i <= m; i += 1) {
    pts.push(podPoint(z1 - ((z1 - z0) * i) / m, -a0, 0.0008));
  }
  for (let i = 1; i < m; i += 1) {
    pts.push(podPoint(z0, -a0 + (2 * a0 * i) / m, 0.0008));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return new THREE.TubeGeometry(curve, lite ? 40 : 72, 0.0011, 3, true);
}

/* The boom fairing: a teardrop through the wing at the boom's station,
 * humped above it and carrying the boom out of its tail. */
function nacelleGeometry(sign, seg) {
  const pts = [
    new THREE.Vector2(0.000, -0.090),
    new THREE.Vector2(0.014, -0.078),
    new THREE.Vector2(0.024, -0.050),
    new THREE.Vector2(0.029, 0.000),
    new THREE.Vector2(0.027, 0.060),
    new THREE.Vector2(0.019, 0.130),
    new THREE.Vector2(0.011, 0.180),
    new THREE.Vector2(0.000, 0.182),
  ];
  const geo = new THREE.LatheGeometry(pts, seg);
  geo.rotateX(Math.PI / 2);
  geo.scale(1, 0.95, 1);
  geo.translate(sign * BOOM_X, boomY() + 0.008, LE_Z + 0.110);
  return geo;
}

/* An 11 x 5.5 blade: the same outline as the wing's, drawn to this disc. */
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

/* Lay a geometry where it goes, for merging by material. */
function bake(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
/* mergeGeometries wants one attribute set; lofts carry no uv. */
function merged(parts) {
  for (const g of parts) {
    g.deleteAttribute('uv');
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('skycraft: merge failed');
  }
  return geo;
}

/*
 * Exported numbers, so the airframe table and the scale check are held
 * against the drawn machine rather than a figure typed twice. `dims` is
 * the shape configs/airframes.js keeps per aircraft, filled the way the
 * wing's entry fills it: hullR is the half span, vHalfUp is the fins' tops,
 * which stand above the prop disc, and vHalfDown is the skid, which stands
 * 12 mm below the disc's bottom so the belly lands before the prop does.
 */
const SKID_T = 0.008;
const SKID_Y = podAt(-0.05).yc - podAt(-0.05).h - 0.001;
const DOWN = -(SKID_Y - SKID_T / 2);
const UP = Math.max(MOTOR_Y + PROP_R, boomY() + FIN_UP);
export const SKY_DIMS = {
  span: 2 * HALF,
  rootChord: ROOT_CHORD,
  tipChord: TIP_CHORD,
  dihedralDeg: 2.5,
  boomSpacing: 2 * BOOM_X,
  stabSpan: 2 * STAB_HALF,
  stabChord: STAB_CHORD,
  finHeight: FIN_UP + FIN_DOWN,
  propR: PROP_R,
  noseZ: NOSE_Z,
  tailZ: FIN_TE,
  length: FIN_TE - NOSE_Z,
  vHalfUp: UP,
  vHalfDown: DOWN,
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: HALF,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: FIN_TE - NOSE_Z,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera mount, in the craft frame: the FPV camera in the pod's nose,
 * 365 mm ahead of the CG and 5 mm below it, its lens just proud of the
 * nose, looking straight ahead. The shell seats the FPV view from these
 * for this aircraft the way it reads WING_MOUNT_FORWARD and WING_MOUNT_UP
 * for the wing.
 */
export const SKY_MOUNT_FORWARD = 0.365;
export const SKY_MOUNT_UP = -0.005;

/* A pusher turning the way the wing's does. Slots 1 to 3 spin nothing. */
export const SKY_PROP_SPIN = [1, 0, 0, 0];

export function buildSkyCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'sky-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 10 : 18;

  const foam = cel({ color: 0xd4e2ee, rim: 0.30, spec: 0.20, specWidth: 0.012 });
  const flapMat = cel({ color: 0xc6d2dc, rim: 0.30, spec: 0.18, specWidth: 0.012 });
  const podMat = cel({ color: 0xd4e2ee, rim: 0.30, spec: 0.24, specWidth: 0.014 });
  const carbon = cel({ color: 0x1b1f22, rim: 0.34, spec: 0.60, specWidth: 0.020, specColor: 0xd8e0e8 });
  const plastic = cel({ color: 0x262b28, rim: 0.26, spec: 0.22 });
  const seamMat = cel({ color: 0x6a6e66, rim: 0.10 });
  const bell = cel({ color: 0xd8d0c4, rim: 0.32, spec: 0.72, specWidth: 0.022 });
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
  const hubMat = cel({ color: 0x161c18, rim: 0.22, spec: 0.25 });
  const propMat = cel({ color: 0x2c302c, rim: 0.26, spec: 0.30 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on herocraft.js's contract with check 15. */
  if (opts.measure) {
    const d = SKY_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), foam);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /*
   * Every fixed foam part in one draw: the wing, the two boom fairings, the
   * stabiliser and both fins. The servo covers are thin plates on the wing
   * over each aileron's inboard end, as the photographs show them.
   */
  {
    const n = lite ? 6 : 9;
    const parts = [
      wingGeometry(lite),
      nacelleGeometry(-1, seg),
      nacelleGeometry(1, seg),
      stabGeometry(0, ELEV_HINGE, n),
      finGeometry(-BOOM_X, false, n),
      finGeometry(BOOM_X, false, n),
    ];
    for (const sign of [-1, 1]) {
      const x = sign * (AIL_IN + 0.050);
      const top = wingAt(x)(0.46, 1);
      parts.push(bake(new THREE.BoxGeometry(0.052, 0.003, 0.038), top.x, top.y + 0.0005, top.z,
        0, 0, sign * DIHEDRAL));
    }
    const airframe = new THREE.Mesh(merged(parts), foam);
    airframe.name = 'sky-airframe';
    airframe.castShadow = shade;
    group.add(airframe);
  }

  /* The pod, centred on its own middle so the hull thickens it evenly. */
  {
    const geo = podGeometry(lite);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const pod = new THREE.Mesh(geo, podMat);
    pod.position.copy(c);
    pod.name = 'sky-pod';
    pod.castShadow = shade;
    hull(pod, 1.018, ink);
    group.add(pod);
    const seam = new THREE.Mesh(hatchSeam(lite), seamMat);
    group.add(seam);
  }

  /*
   * The black plastic and carbon, one draw each. Plastic: the belly skid,
   * a clamp collar where each boom leaves its fairing, and the tail mount
   * each boom plugs into under its fin. Carbon: the two booms.
   */
  {
    const skidZ0 = -0.230;
    const skidZ1 = 0.060;
    const plasticParts = [
      bake(new THREE.BoxGeometry(0.022, SKID_T, skidZ1 - skidZ0), 0, SKID_Y, (skidZ0 + skidZ1) / 2),
    ];
    const carbonParts = [];
    const boomLen = BOOM_Z1 - BOOM_Z0;
    for (const sign of [-1, 1]) {
      const x = sign * BOOM_X;
      const y = boomY();
      carbonParts.push(bake(new THREE.CylinderGeometry(BOOM_R, BOOM_R, boomLen, lite ? 8 : 12),
        x, y, (BOOM_Z0 + BOOM_Z1) / 2, Math.PI / 2));
      plasticParts.push(bake(new THREE.CylinderGeometry(BOOM_R + 0.0035, BOOM_R + 0.0035, 0.016, lite ? 8 : 14),
        x, y, LE_Z + 0.110 + 0.176, Math.PI / 2));
      plasticParts.push(bake(new THREE.BoxGeometry(0.022, 0.026, 0.080), x, y, 0.765));
      plasticParts.push(bake(new THREE.CylinderGeometry(BOOM_R + 0.0035, BOOM_R + 0.0035, 0.012, lite ? 8 : 14),
        x, y, 0.719, Math.PI / 2));
    }
    const plasticMesh = new THREE.Mesh(merged(plasticParts), plastic);
    plasticMesh.castShadow = shade;
    group.add(plasticMesh);
    const carbonMesh = new THREE.Mesh(merged(carbonParts), carbon);
    carbonMesh.name = 'sky-booms';
    carbonMesh.castShadow = shade;
    group.add(carbonMesh);
  }

  /*
   * The five moving surfaces. One angle drives both rudders, because on the
   * aircraft one servo does through a pull pull across the stabiliser.
   */
  const leftAil = aileron(-1, flapMat, shade, lite);
  const rightAil = aileron(1, flapMat, shade, lite);
  const n = lite ? 5 : 7;
  const y0 = boomY();
  const hingeY = (x) => new THREE.Vector3(x, y0, STAB_LE + ELEV_HINGE * STAB_CHORD);
  const elevator = hinged(stabGeometry(ELEV_HINGE, 1, n), hingeY(-STAB_HALF), hingeY(STAB_HALF), flapMat, shade);
  const rudders = [-1, 1].map((sign) => {
    const x = sign * BOOM_X;
    return hinged(
      finGeometry(x, true, n),
      new THREE.Vector3(x, y0 - FIN_DOWN, RUDDER_Z),
      new THREE.Vector3(x, y0 + FIN_UP, RUDDER_Z),
      flapMat,
      shade,
    );
  });
  const surfaces = {
    'aileron-left': leftAil,
    'aileron-right': rightAil,
    elevator,
    'rudder-left': rudders[0],
    'rudder-right': rudders[1],
  };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  /*
   * The camera, in the nose of the pod, looking out of the blunt front
   * under the hatch. The mount group is what the shell parents the FPV
   * view to and tilts by the pilot's camera angle.
   */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, SKY_MOUNT_UP, -SKY_MOUNT_FORWARD);
  cameraMount.name = 'sky-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), camBody);
    housing.position.set(0, 0, 0.008);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0090, 0.0096, 0.014, lite ? 8 : 14), camBody);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.014);
    cameraMount.add(barrel);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0082, lite ? 10 : 18), lens);
    glass.rotation.y = Math.PI;
    glass.position.set(0, 0, -0.0212);
    cameraMount.add(glass);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0088, 0.0014, lite ? 5 : 8, lite ? 10 : 18), ring);
    bezel.position.set(0, 0, -0.0206);
    cameraMount.add(bezel);
  }

  /* The video antenna, a whip off the pod's back. NAMED, because it is
   * wire and not aircraft: scripts/craft-check.js leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.090, lite ? 5 : 8), antenna);
    mast.position.set(0.020, 0.100, 0.150);
    mast.rotation.z = -0.25;
    mast.rotation.x = -0.30;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The motor on the pod's tail face and the prop behind it. The prop mount
   * turns the rotor's y axis onto the craft's forward axis, so
   * rotor.rotation.y is the spin the shell drives from RPM, and the disc
   * is the same faint blur the wing's is.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.0150, 0.0150, 0.012, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, MOTOR_Y, POD_TAIL_Z + 0.006);
    can.castShadow = shade;
    group.add(can);
    const bellMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0175, 0.018, seg), bell);
    bellMesh.rotation.x = Math.PI / 2;
    bellMesh.position.set(0, MOTOR_Y, POD_TAIL_Z + 0.021);
    bellMesh.castShadow = shade;
    hull(bellMesh, 1.07, 0x121810);
    group.add(bellMesh);

    const propMount = new THREE.Group();
    propMount.position.set(0, MOTOR_Y, PROP_Z);
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0100, 0.0100, 0.0080, lite ? 8 : 12), hubMat);
    rotor.add(hub);
    const nut = new THREE.Mesh(new THREE.ConeGeometry(0.0060, 0.012, lite ? 6 : 10), ring);
    nut.position.y = 0.010;
    rotor.add(nut);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    const bladeParts = [bladeGeo, bladeGeo.clone().rotateY(Math.PI)];
    const bladeMesh = new THREE.Mesh(mergeGeometries(bladeParts, false), propMat);
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
    disc.position.y = 0.0025;
    disc.renderOrder = 1;
    propMount.add(disc);
    discs.push(disc);
  }
  for (let m = 1; m < 4; m += 1) {
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
   * Four lamps on the four slots the pose driver walks, the wing's
   * arrangement: sakura on the left tip and the nose, mint on the right tip
   * and the tail, here the stabiliser's centre.
   */
  const tipTop = (x) => wingAt(x)(0.5, 1);
  const lampAt = [
    { p: tipTop(-0.86), front: true },
    { p: tipTop(0.86), front: false },
    { p: podPoint(-0.34, 0), front: true },
    { p: new THREE.Vector3(0, y0 + 0.006, STAB_LE + 0.040), front: false },
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
   * positive trailing edge to the left. Every hinge axis points +x or +y
   * (see hinged), and about either a negative turn carries an aft point up
   * or to -x, so each surface turns by the negated angle.
   *
   * elevRad and rudRad default to zero because src/main.js today reads two
   * doubles from the wing plant and passes two; until it reads four, this
   * aircraft's tail stays neutral rather than going NaN.
   */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    for (const r of rudders) {
      r.pivot.quaternion.copy(q.setFromAxisAngle(r.axis, -rudRad));
    }
  }
  setSurfaces(0, 0, 0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: SKY_PROP_SPIN,
    setSurfaces,
  };
}
