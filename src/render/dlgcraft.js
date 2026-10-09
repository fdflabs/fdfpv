/*
 * dlgcraft.js: the NRJ discus launch glider's model, and nothing else.
 *
 * Its own file because nothing else here looks like an F3K glider: a thin
 * carbon wing on an elliptic planform with a straight trailing edge and 7
 * degrees of dihedral a panel, set on top of a short pod whose nose is a
 * slip on cone, a boom no thicker than a pencil, an underslung elliptic
 * stabiliser, a tall fin, a peg on the left wingtip the pilot throws it by,
 * and no motor, no prop and no camera.
 *
 * The subject is OA Composites' NRJ as Hyperflight's photographs show it,
 * in its "Blue #5" scheme: dark carbon with pink and blue bands and a
 * blue nose cone. Every length is docs/DLG-STAGE1.md's, which
 * scripts/dlg-derive.js and the plant (src/native/plant.c, plant_wing.c)
 * are built from:
 *
 *   span        1.490 m; the chord 0.1624 m at the root going as the
 *               ellipse to the tips, the trailing edge straight 0.0964 m
 *               behind the CG, the leading edge sweeping back to meet it
 *   dihedral    7 deg a panel from the root, the tips 0.091 m up
 *   wing        a 6 percent section at the root thinning to 5.2 at the
 *               tip, lightly cambered, its root chord line 9 mm under
 *               the CG, on the pod's top: the CG is over the root because
 *               the dihedral carries the panels' mass up
 *   flaperons   the aft quarter from 0.08 to 0.70 m out
 *   pod         0.26 m ahead of the CG to 0.07 m behind, 26 mm wide, its
 *               belly 42 mm under the CG; the nose cone the front 69 mm
 *   boom        9 mm carbon tube to 0.70 m behind the CG
 *   tail        a 0.30 m elliptic stabiliser on an 85 mm root chord under
 *               the boom, its elevator the aft 30 mm; a fin 0.196 m tall
 *               whose rudder's trailing edge is the aftmost point
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY, 66 mm behind the wing root's
 * leading edge, the manual's. Positions below are the plant's body frame
 * (x forward, y left, z up) and turned into the craft frame by v().
 *
 * The contract with the shell is glidercraft.js's, field for field, with
 * four empty rotor slots: it has no rotor at all.
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

/* Body frame (x forward, y left, z up) to the craft frame (x right, y up,
 * z aft), src/render/frame.js's turn. */
const v = (x, y, z) => new THREE.Vector3(-y, z, -x);

const HALF = 0.745;
const ROOT_C = 0.1624;
const TE_X = 0.066 - ROOT_C;
const WING_Z = -0.009;
const DIHEDRAL = (7 * Math.PI) / 180;
const TAN_D = Math.tan(DIHEDRAL);
const AIL_IN = 0.08;
const AIL_OUT = 0.70;
const AIL_F = 0.75;

const POD_NOSE = 0.259;
const POD_TAIL = -0.07;
const CONE_X = 0.19;
const POD_W = 0.013;
const POD_TOP = -0.012;
const POD_BELLY = -0.042;

const BOOM_R0 = 0.0045;
const BOOM_R1 = 0.003;
const BOOM_Z = -0.020;
const TAIL_X = -0.700;

const STAB_HALF = 0.15;
const STAB_C = 0.085;
const STAB_C4 = -0.553;
const STAB_Z = -0.028;
const ELEV_HINGE = -0.587;

const FIN_TOP = 0.180;
const FIN_BOTTOM = -0.016;
const RUD_HINGE = -0.650;
const RUD_LO = -0.008;
const RUD_HI = 0.160;

const chordAt = (ay) => ROOT_C * Math.sqrt(Math.max(0, 1 - (ay / HALF) ** 2));
const thickAt = (ay) => 0.060 - 0.008 * (ay / HALF);

/* The NACA four digit half thickness at chord fraction t, and a 2 percent
 * camber at 40 percent: a thin, lightly cambered DLG section. */
function naca(t, thick) {
  return 5 * thick * (0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t);
}
function camber(t) {
  const m = 0.02, p = 0.40;
  return t < p ? (m / (p * p)) * (2 * p * t - t * t) : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * t - t * t);
}

/* A closed section, a loop over the top from chord fraction f0 to f1 and
 * back under, cosine spaced; at(t, side) is its point. */
function section(at, f0, f1, n) {
  const ts = [];
  for (let i = 0; i < n; i += 1) {
    ts.push(f0 + (f1 - f0) * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1))));
  }
  const loop = ts.map((t) => at(t, 1));
  for (let i = n - 1; i >= (f0 === 0 ? 1 : 0); i -= 1) {
    loop.push(at(ts[i], -1));
  }
  return loop;
}

/* A wing section at body y (left positive), chord fraction t from the
 * leading edge. The tip keeps a 4 mm chord so the loft closes cleanly. */
function wingAt(y) {
  const ay = Math.abs(y);
  const c = Math.max(0.004, chordAt(ay));
  const le = TE_X + c;
  const z0 = WING_Z + ay * TAN_D;
  const th = thickAt(ay);
  return (t, side) => v(le - t * c, y, z0 + c * (camber(t) + side * naca(t, th)));
}

/* Skin a run of closed sections into one indexed geometry, capped, facing
 * out whichever way the sections were listed (the signed volume decides). */
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
  const p = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let i = 0; i < idx.length; i += 3) {
    vol += p(idx[i]).dot(p(idx[i + 1]).cross(p(idx[i + 2])));
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

/* One geometry from several: positions and normals only, a lathe's or a
 * cylinder's uv dropped so they merge with the lofts. */
function merged(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
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
    throw new Error('dlgcraft: merge failed');
  }
  return geo;
}

/*
 * The wing in bands of the scheme, one panel's stations between a and b
 * (absolute span, m), cut at the flaperon's hinge where it runs. The bands
 * are where the NRJ's paint changes, so each region is one draw.
 */
function wingBand(sign, a, b, n, steps) {
  const st = [];
  for (let i = 0; i <= steps; i += 1) {
    st.push(a + ((b - a) * i) / steps);
  }
  const f = (ay) => (ay > AIL_IN + 1e-6 && ay < AIL_OUT - 1e-6 ? AIL_F : 1);
  const secs = [];
  for (const ay of st) {
    secs.push(section(wingAt(sign * ay), 0, f(ay), n));
  }
  return loft(secs);
}

/* The paint's bands, absolute span from the root: the colour region each
 * band is drawn in. The NRJ's stripes as its photographs place them. */
const BANDS = [
  [0.000, 0.120, 'wing'],
  [0.120, 0.160, 'band'],
  [0.160, 0.300, 'stripe'],
  [0.300, 0.330, 'wing'],
  [0.330, 0.450, 'stripe'],
  [0.450, 0.520, 'band'],
  [0.520, 0.700, 'wing'],
  [0.700, 0.745, 'stripe'],
];

/* A hinged surface: the geometry moved so the pivot sits on the hinge and
 * turns about the hinge's own axis, so a negative turn lifts the trailing
 * edge or swings it left, glidercraft.js's convention. */
function hinged(geo, a, b, material, shade) {
  const axis = new THREE.Vector3().subVectors(b, a).normalize();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  geo.translate(-mid.x, -mid.y, -mid.z);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = shade;
  pivot.add(mesh);
  return { pivot, axis, mesh };
}

/* One panel's flaperon: the aft quarter from AIL_IN to AIL_OUT. */
function flaperon(sign, n) {
  const secs = [];
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    const ay = AIL_IN + ((AIL_OUT - AIL_IN) * i) / steps;
    secs.push(section(wingAt(sign * ay), AIL_F, 1, n));
  }
  return loft(secs);
}
function flaperonHinge(sign) {
  const at = (ay) => wingAt(sign * ay)(AIL_F, 0);
  /* Left to right in the craft frame, so the axis points +x. */
  return sign > 0 ? [at(AIL_OUT), at(AIL_IN)] : [at(AIL_IN), at(AIL_OUT)];
}

/* The pod: elliptic rings from the nose to the boom, its top flat under
 * the wing. x0 to x1 is the part of it drawn. */
function podRing(x, m, needle = false) {
  const len = POD_NOSE - POD_TAIL;
  const u = (POD_NOSE - x) / len;
  /* A kit's long pointed cone: straight sided to the same point, meeting
   * the stock ring at the cone's joint so the pod is untouched. */
  const uc = (POD_NOSE - CONE_X) / len;
  const nose = needle && u < uc
    ? Math.sqrt(uc / 0.30) * (u / uc) ** 1.15
    : Math.sqrt(Math.min(1, u / 0.30));
  const tail = u > 0.7 ? 1 - 0.55 * ((u - 0.7) / 0.3) : 1;
  const w = Math.max(0.0008, POD_W * nose * tail);
  const zc = (POD_TOP + POD_BELLY) / 2;
  const h = Math.max(0.0008, ((POD_TOP - POD_BELLY) / 2) * nose * tail);
  const ring = [];
  for (let i = 0; i < m; i += 1) {
    const a = (2 * Math.PI * i) / m;
    ring.push(v(x, w * Math.cos(a), zc + h * Math.sin(a)));
  }
  return ring;
}
function podGeometry(x0, x1, steps, m, needle = false) {
  const secs = [];
  for (let i = 0; i <= steps; i += 1) {
    secs.push(podRing(x0 + ((x1 - x0) * i) / steps, m, needle));
  }
  return loft(secs);
}

/* The stabiliser: an ellipse about its straight quarter chord line, under
 * the boom, cut at the elevator's hinge where it reaches it. */
const stabC = (ay) => Math.max(0.004, STAB_C * Math.sqrt(Math.max(0, 1 - (ay / STAB_HALF) ** 2)));
const stabLE = (ay) => STAB_C4 + 0.25 * stabC(ay);
const stabTE = (ay) => STAB_C4 - 0.75 * stabC(ay);
/* A flat carbon plate, 2.4 mm at its thickest, thinning to its edges. */
function stabPoint(y, xFront, xBack) {
  const c = xFront - xBack;
  return (t, side) => v(xFront - t * c, y, STAB_Z + side * 0.0012 * Math.sqrt(Math.sin(Math.PI * Math.min(1, Math.max(0.02, t)))));
}
function stabGeometry(n) {
  const ys = [];
  for (let i = -10; i <= 10; i += 1) {
    ys.push((STAB_HALF - 0.0005) * Math.sin((Math.PI / 2) * (i / 10)));
  }
  return loft(ys.map((y) => section(stabPoint(y, stabLE(Math.abs(y)), Math.max(stabTE(Math.abs(y)), ELEV_HINGE)), 0, 1, n)));
}
const ELEV_HALF = 0.126;
function elevatorGeometry(n) {
  const ys = [];
  for (let i = -8; i <= 8; i += 1) {
    ys.push(ELEV_HALF * (i / 8));
  }
  return loft(ys.map((y) => section(stabPoint(y, ELEV_HINGE, Math.min(ELEV_HINGE - 0.001, stabTE(Math.abs(y)))), 0, 1, n)));
}

/* The fin in body x z: the leading edge swept back toward a rounded top,
 * the rudder's trailing edge the aftmost point. */
const finLE = (z) => -0.560 - 0.085 * (z / FIN_TOP) ** 2;
const finTE = (z) => TAIL_X + 0.030 * (z / FIN_TOP) ** 3;
function finPoint(z, xFront, xBack) {
  const c = xFront - xBack;
  return (t, side) => v(xFront - t * c, side * Math.max(0.0006, 0.045 * c * naca(t, 1)), z);
}
function finGeometry(n, rudder) {
  const zs = [];
  const z0 = rudder ? RUD_LO : FIN_BOTTOM;
  const z1 = rudder ? RUD_HI : FIN_TOP - 0.0005;
  for (let i = 0; i <= 12; i += 1) {
    zs.push(z0 + (z1 - z0) * Math.sin((Math.PI / 2) * (i / 12)));
  }
  return loft(zs.map((z) => {
    const inRudder = z >= RUD_LO && z <= RUD_HI;
    if (rudder) {
      return section(finPoint(z, RUD_HINGE, finTE(z)), 0, 1, n);
    }
    const back = inRudder ? RUD_HINGE : finTE(z);
    const front = Math.max(finLE(z), back + 0.004);
    return section(finPoint(z, front, back), 0, 1, n);
  }));
}

function rod(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/*
 * THE DRAWN MACHINE'S MEASURE, which configs/airframes.js's dims, the
 * plant's hull and scripts/craft-check.js are held to: the tips' trailing
 * corners' reach,
 * the rudder's trailing edge, the fin's top and the pod's belly, which is
 * where the plant's hull rests it (hull_hz_down 0.042).
 */
export const DLG_DIMS = {
  span: 2 * HALF,
  rootChord: ROOT_C,
  tipRise: HALF * TAN_D,
  noseZ: -POD_NOSE,
  tailZ: -TAIL_X,
  length: POD_NOSE - TAIL_X,
  vHalfUp: FIN_TOP,
  vHalfDown: -POD_BELLY,
  dims: {
    arm: 0,
    propR: 0,
    hullR: Math.hypot(HALF, TE_X),
    vHalfDown: -POD_BELLY,
    vHalfUp: FIN_TOP,
    bodyLength: POD_NOSE - TAIL_X,
    bodyWidth: 2 * HALF,
    bodyHeight: FIN_TOP - POD_BELLY,
  },
};

/* The camera: no DLG carries one, so the pilot's eye sits on the pod's
 * nose over the pack, the plant's camera point. */
export const DLG_MOUNT_FORWARD = 0.16;
export const DLG_MOUNT_UP = -0.002;

/* No rotor turns on this machine. */
export const DLG_PROP_SPIN = [0, 0, 0, 0];

export function buildDlgCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'dlg-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const ink = 0x0c120e;
  const n = lite ? 9 : 13;
  const m = lite ? 10 : 16;

  /* The scheme's colours by region (src/render/livery.js). */
  const coat = paintRegions();
  const carbon = { rim: 0.30, spec: 0.55, specWidth: 0.018, specColor: 0xdfe6ee };
  const regionMat = {
    wing: coat.base('wing', cel({ color: 0x2b2d31, ...carbon })),
    stripe: coat.base('stripe', cel({ color: 0xe8358f, rim: 0.28, spec: 0.40, specWidth: 0.016 })),
    band: coat.base('band', cel({ color: 0x39b3e6, rim: 0.28, spec: 0.40, specWidth: 0.016 })),
  };
  const nose = coat.base('cone', cel({ color: 0x3a9ad9, rim: 0.30, spec: 0.55, specWidth: 0.020 }));
  const tailMat = coat.base('tail', cel({ color: 0x1a1b1d, ...carbon }));
  const flapMat = coat.shade('wing', cel({ color: 0x25272b, ...carbon }));
  const tailFlap = coat.shade('tail', cel({ color: 0x161719, ...carbon }));
  const podMat = cel({ color: 0x151618, ...carbon });

  if (opts.measure) {
    const d = DLG_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), podMat);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The wing, a draw per paint region. */
  const byRegion = { wing: [], stripe: [], band: [] };
  for (const sign of [1, -1]) {
    for (const [a, b, region] of BANDS) {
      byRegion[region].push(wingBand(sign, a, b, n, Math.max(2, Math.round((b - a) / 0.02))));
    }
  }
  for (const [region, list] of Object.entries(byRegion)) {
    const mesh = new THREE.Mesh(merged(list), regionMat[region]);
    mesh.name = `dlg-wing-${region}`;
    mesh.castShadow = shade;
    group.add(mesh);
  }

  /* The pod and the boom; the nose cone its own region. */
  {
    const pod = new THREE.Mesh(podGeometry(CONE_X, POD_TAIL, 16, m), podMat);
    pod.name = 'dlg-pod';
    pod.castShadow = shade;
    if (inkOn) outlineHull(pod, 1.04, ink);
    group.add(pod);
    const needle = (opts.kit ?? {}).nose === 'pointed';
    const cone = new THREE.Mesh(podGeometry(POD_NOSE - 0.0002, CONE_X, 10, m, needle), nose);
    cone.name = 'dlg-nose';
    cone.castShadow = shade;
    if (inkOn) outlineHull(cone, 1.04, ink);
    group.add(cone);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(BOOM_R1, BOOM_R0, POD_TAIL - TAIL_X + 0.03, lite ? 6 : 10), podMat);
    boom.rotation.x = Math.PI / 2;
    const bx = (POD_TAIL + 0.03 + TAIL_X) / 2;
    boom.position.copy(v(bx, 0, BOOM_Z));
    boom.name = 'dlg-boom';
    boom.castShadow = shade;
    group.add(boom);
  }

  /* The tail, its fixed parts in one draw. */
  {
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n, false),
      rod(v(-0.560, 0, BOOM_Z), v(-0.560, 0, STAB_Z), 0.0025, lite ? 5 : 8)]), tailMat);
    tail.name = 'dlg-tail';
    tail.castShadow = shade;
    group.add(tail);
  }

  /* The peg, a carbon blade standing on the left tip's trailing edge. */
  {
    const tipZ = WING_Z + 0.735 * TAN_D;
    const peg = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.014, 0.010), podMat);
    peg.position.copy(v(TE_X + 0.006, 0.735, tipZ + 0.006));
    peg.name = 'dlg-peg';
    group.add(peg);
  }

  /* The four moving surfaces: the flaperons, the elevator and the rudder. */
  const [la, lb] = flaperonHinge(1);
  const [ra, rb] = flaperonHinge(-1);
  const leftAil = hinged(flaperon(1, n), la, lb, flapMat, shade);
  const rightAil = hinged(flaperon(-1, n), ra, rb, flapMat, shade);
  const elevator = hinged(elevatorGeometry(n), v(ELEV_HINGE, ELEV_HALF, STAB_Z), v(ELEV_HINGE, -ELEV_HALF, STAB_Z), tailFlap, shade);
  const rudder = hinged(finGeometry(n, true), v(RUD_HINGE, 0, RUD_LO), v(RUD_HINGE, 0, RUD_HI), tailFlap, shade);
  const surfaces = { 'aileron-left': leftAil, 'aileron-right': rightAil, elevator, rudder };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, DLG_MOUNT_UP, -DLG_MOUNT_FORWARD);
  cameraMount.name = 'dlg-camera-mount';
  group.add(cameraMount);

  /* Four empty rotor slots, and four lamps on the slots the pose driver
   * walks, the Radian's arrangement: the tips, the nose and the boom. */
  const discs = [];
  const blades = [];
  const leds = [];
  const stator = podMat;
  for (let k = 0; k < 4; k += 1) {
    const none = new THREE.Group();
    group.add(none);
    blades.push(none);
    const noDisc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }));
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }
  const lampAt = [
    { p: wingAt(0.70)(0.3, 1), front: true },
    { p: wingAt(-0.70)(0.3, 1), front: false },
    { p: v(0.20, 0, POD_TOP + 0.001), front: true },
    { p: v(-0.50, 0, BOOM_Z + BOOM_R1 + 0.001), front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.010), ledMat);
    led.position.copy(at.p);
    led.position.y += 0.001;
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

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
    propSpin: DLG_PROP_SPIN,
    setSurfaces,
    livery: coat.livery,
  };
}
