/*
 * zagicraft.js: Zagi's 48 in Zagi HP, and nothing else.
 *
 * Its own file for the reason every airframe has one: a Zagi is a single
 * swept slab of taped EPP with nothing hanging off it but a canopy over
 * the bay, two winglets and a pusher. docs/ZAGI-STAGE1.md has the aircraft
 * and its sources; the planform below is the one Trick R/C drew to scale
 * in the Zagi-400 X manual (figs. 2 and 3), taken to the HP's 2.8 sq ft
 * as scripts/zagi-derive.js does, so the plant flies the wing drawn here:
 *
 *   span            48 in, 1.2192 m, tips at x = +-0.6096
 *   planform        a straight tapered swept wing: 11.87 in of chord at
 *                   the root, 4.93 at the tip, the leading edge 0.543 aft
 *                   per unit out, the trailing edge swept less
 *   section         a reflexed 9 percent section, the class of the Zagi
 *                   101.4, whose underside at the root is the belly the
 *                   aircraft lands on, 12 mm under the CG
 *   elevons         1.5 in balsa, constant chord, from the bay's edge,
 *                   2.5 in out, to the tip
 *   winglets        Zagi's black plastic ones, 5.5 in at the root, 2.5 at
 *                   the top, 5 in tall, their leading edge swept 3 in
 *   canopy          the styrene tray and canopy over the bay at the root,
 *                   the motor on its back and the 5 x 5 carbon pusher
 *                   behind the trailing edge
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY, 8 in (0.2032 m) behind the nose,
 * Zagi's balance point. The craft frame is the shell's: x to the right, y
 * up, z aft.
 *
 * The livery is Zagi's own: the HP's orange covering tape all over with
 * black winglets and a charcoal canopy, as zagi.com photographs it. The
 * regions are 'wing', 'trim' (the leading and trailing edge bands the
 * 5C's scheme puts on), 'winglets' and 'canopy'.
 *
 * The contract with the shell is the Bramor's: group, discs, blades,
 * leds, cameraMount, stator, propSpin, all four slots long, and
 * setSurfaces(leftRad, rightRad) for the elevons, positive trailing edge
 * up.
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
import { celMaterial, outlineHull } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { paintRegions } from './livery.js';

const IN = 0.0254;
const NOSE_TO_CG = 8.0 * IN;
const HALF = 24.0 * IN;
const ROOT_C = 11.866 * IN;
const TIP_C = 4.934 * IN;
const TAN_LE = 0.543;
const THICK = 0.09;
/* The reflexed camber line's height, per chord: up over the front, a
 * little down at the back, where the trailing edge turns up. */
const CAMBER = 0.018;

const chordAt = (x) => ROOT_C - (ROOT_C - TIP_C) * Math.abs(x) / HALF;
const leZ = (x) => TAN_LE * Math.abs(x) - NOSE_TO_CG;
const thickHalf = (u) => (0.2969 * Math.sqrt(u) - 0.1260 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1015 * u * u * u * u) / 0.2;
const camberAt = (u) => CAMBER * u * (1 - u) * (1 - 1.8 * u) * 4;

/* The chord plane's height: the root's underside at its lowest is the
 * plant's hull_hz_down, 12 mm under the CG. */
const BELLY = -0.012;
const MID_Y = (() => {
  let low = 0;
  for (let i = 0; i <= 400; i += 1) {
    const u = i / 400;
    low = Math.min(low, (camberAt(u) - THICK * thickHalf(u)) * ROOT_C);
  }
  return BELLY - low;
})();

/* Elevons: 1.5 in of chord from 2.5 in out to the tip. */
const ELEVON_C = 1.5 * IN;
const ELEVON_IN = 2.5 * IN;
const ELEVON_OUT = HALF - 0.0016;
/* The winglets, Hendricks's measured Zagi's (docs/ZAGI-STAGE1.md). */
const WINGLET = { root: 5.5 * IN, top: 2.5 * IN, h: 5.0 * IN, sweep: 3.0 * IN };
/* The motor on the tray, and the prop's hub: 52 mm over the CG, so the
 * prop's tip clears the ground by nothing at rest, 5 in across. */
const HUB_Y = 0.052;
const PROP_R = 2.5 * IN;
const PROP_Z = ROOT_C - NOSE_TO_CG + 0.012;
/* The canopy and tray over the bay: 5 in wide, from 2 in behind the nose
 * to the trailing edge. */
const CANOPY = { x: 2.5 * IN, z0: 2.0 * IN - NOSE_TO_CG, z1: ROOT_C - NOSE_TO_CG - 0.004, h: 0.024 };

export const ZAGI_DIMS = {
  span: 2 * HALF,
  area: 2.8 * 0.09290304,
  noseZ: -NOSE_TO_CG,
  /* The winglet's top trailing corner, the furthest aft point. */
  tailZ: leZ(HALF) + WINGLET.sweep + WINGLET.top,
  vHalfUp: MID_Y + WINGLET.h,
  vHalfDown: -BELLY,
  propR: PROP_R,
};

/* The FPV camera on the canopy's nose, looking straight ahead. */
export const ZAGI_MOUNT_FORWARD = -CANOPY.z0 - 0.02;
export const ZAGI_MOUNT_UP = 0.025;

/* The one prop turns positive about the body's forward axis, the Bramor's
 * way: clockwise seen from behind, which the plant answers with a roll. */
export const ZAGI_PROP_SPIN = [1, 0, 0, 0];

/* A closed section at station x, over the top from the leading edge to
 * `fMax` of the chord and back under. */
function section(x, fMax, n) {
  const c = chordAt(x);
  const le = leZ(x);
  const upper = [];
  const lower = [];
  for (let i = 0; i < n; i += 1) {
    const u = fMax * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1)));
    const half = THICK * thickHalf(u) * c;
    const cam = camberAt(u) * c;
    upper.push(new THREE.Vector3(x, MID_Y + cam + half, le + u * c));
    lower.push(new THREE.Vector3(x, MID_Y + cam - half, le + u * c));
  }
  const loop = upper.slice();
  for (let i = n - 2; i >= 1; i -= 1) {
    loop.push(lower[i]);
  }
  return loop;
}

/* Skin a run of closed sections into one geometry, both ends capped: the
 * Bramor's loft. */
function loft(sections, flip = false) {
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
      if (flip) {
        idx.push(a + j, b + j, a + k);
        idx.push(a + k, b + j, b + k);
      } else {
        idx.push(a + j, a + k, b + j);
        idx.push(a + k, b + k, b + j);
      }
    }
  }
  const cap = (sec, base, last) => {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of sec) {
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    const centre = pos.length / 3;
    pos.push(cx / n, cy / n, cz / n);
    for (let j = 0; j < n; j += 1) {
      const k = (j + 1) % n;
      if (last !== flip) {
        idx.push(centre, base + k, base + j);
      } else {
        idx.push(centre, base + j, base + k);
      }
    }
  };
  cap(sections[0], 0, false);
  cap(sections[sections.length - 1], (sections.length - 1) * n, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* The fraction of the chord ahead of the elevon's hinge at station x. */
const hingeAt = (x) => 1 - ELEVON_C / chordAt(x);

/* The wing, tip to tip, cut at the elevons' hinges. */
function wingGeometry(lite) {
  const n = lite ? 11 : 19;
  const eps = 0.0005;
  const inner = lite ? [0] : [0, 0.03];
  const outer = lite ? [0.3, 0.45] : [0.15, 0.3, 0.45, 0.55];
  const right = [
    ...inner.filter((x) => x > 0).map((x) => [x, 1]),
    [ELEVON_IN - eps, 1],
    [ELEVON_IN + eps, hingeAt(ELEVON_IN)],
    ...outer.map((x) => [x, hingeAt(x)]),
    [ELEVON_OUT, hingeAt(ELEVON_OUT)],
    [HALF, 1],
  ];
  const left = right.slice().reverse().map(([x, f]) => [-x, f]);
  const stations = [...left, [0, 1], ...right];
  return loft(stations.map(([x, f]) => section(x, f, n)));
}

/* A band of tape over the wing's chord from `from` to `to`, a shade
 * proud of the skin. */
function bandGeometry(lite, from, to) {
  const n = lite ? 5 : 8;
  const stations = [];
  for (let i = -6; i <= 6; i += 1) {
    const x = (i / 6) * (HALF - 0.004);
    const c = chordAt(x);
    const le = leZ(x);
    const pts = [];
    for (let j = 0; j <= n; j += 1) {
      const u = from + (to - from) * (0.5 * (1 - Math.cos((Math.PI * j) / n)));
      const half = THICK * thickHalf(u) * c + 0.0006;
      pts.push(new THREE.Vector3(x, MID_Y + camberAt(u) * c + half, le + u * c));
    }
    for (let j = n; j >= 0; j -= 1) {
      const u = from + (to - from) * (0.5 * (1 - Math.cos((Math.PI * j) / n)));
      const half = THICK * thickHalf(u) * c + 0.0006;
      pts.push(new THREE.Vector3(x, MID_Y + camberAt(u) * c - half, le + u * c));
    }
    stations.push(pts);
  }
  return loft(stations);
}

/* One elevon on its swept hinge, in a frame whose x axis is the hinge so
 * the flap's rotation.x is the deflection and nothing else. */
function buildElevon(sign, material, shade) {
  const stations = [];
  for (let i = 0; i <= 3; i += 1) {
    const x = sign * (ELEVON_IN + ((ELEVON_OUT - ELEVON_IN) * i) / 3);
    const c = chordAt(x);
    const u = hingeAt(x);
    const half = THICK * thickHalf(u) * c;
    const y0 = MID_Y + camberAt(u) * c;
    const zh = leZ(x) + u * c;
    const zt = leZ(x) + c;
    stations.push([
      new THREE.Vector3(x, y0 + half, zh),
      new THREE.Vector3(x, y0 + half * 0.4, zh + (zt - zh) * 0.6),
      new THREE.Vector3(x, MID_Y, zt),
      new THREE.Vector3(x, y0 - half * 0.4, zh + (zt - zh) * 0.6),
      new THREE.Vector3(x, y0 - half, zh),
    ]);
  }
  if (sign < 0) {
    stations.reverse();
  }
  const geo = loft(stations);
  const x0 = Math.min(sign * ELEVON_IN, sign * ELEVON_OUT);
  const x1 = Math.max(sign * ELEVON_IN, sign * ELEVON_OUT);
  const z0 = leZ(x0) + hingeAt(x0) * chordAt(x0);
  const z1 = leZ(x1) + hingeAt(x1) * chordAt(x1);
  const yaw = -Math.atan2(z1 - z0, x1 - x0);
  const mid = new THREE.Vector3((x0 + x1) / 2, MID_Y, (z0 + z1) / 2);
  geo.translate(-mid.x, -mid.y, -mid.z);
  geo.rotateY(-yaw);
  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  pivot.rotation.y = yaw;
  const flap = new THREE.Group();
  pivot.add(flap);
  flap.name = sign < 0 ? 'elevon-left' : 'elevon-right';
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = shade;
  flap.add(mesh);
  return { pivot, flap };
}

/* A winglet: a flat 1.5 mm plate, the root on the tip's chord from its
 * leading edge, swept back, straight up. Built for the right tip and
 * mirrored. */
function wingletGeometry(sign) {
  const t = 0.0015;
  const x = sign * (HALF + t);
  const base = MID_Y;
  const le0 = leZ(HALF);
  const pts = [
    [le0, base], [le0 + WINGLET.root, base],
    [le0 + WINGLET.sweep + WINGLET.top, base + WINGLET.h], [le0 + WINGLET.sweep, base + WINGLET.h],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2 * t, bevelEnabled: false });
  /* The shape is drawn in (z, y); turn it so its depth lies along x. */
  geo.rotateY(-Math.PI / 2);
  geo.translate(x + t, 0, 0);
  return geo;
}

/* The canopy over the bay: a low rounded hump, elliptical rings from the
 * nose of the tray to the trailing edge. */
function canopyGeometry(segments) {
  const rings = [];
  const N = 7;
  for (let i = 0; i <= N; i += 1) {
    const f = i / N;
    const z = CANOPY.z0 + (CANOPY.z1 - CANOPY.z0) * f;
    const rise = CANOPY.h * Math.sin(Math.min(1, f * 2.2) * Math.PI / 2) * (1 - 0.35 * Math.max(0, f - 0.6) / 0.4);
    const w = CANOPY.x * (0.55 + 0.45 * Math.sin(Math.min(1, f * 1.8) * Math.PI / 2));
    const u = (z - leZ(0)) / ROOT_C;
    const top = MID_Y + (camberAt(u) + THICK * thickHalf(Math.max(0, Math.min(1, u)))) * ROOT_C;
    const pts = [];
    for (let k = 0; k < segments; k += 1) {
      const a = (k / segments) * Math.PI;
      pts.push(new THREE.Vector3(Math.cos(a) * w, top - 0.002 + Math.sin(a) * Math.max(0.001, rise), z));
    }
    rings.push(pts);
  }
  return loft(rings, true);
}

/* A two blade carbon prop, built along +x from the hub. */
function bladeGeometry(segments) {
  const len = PROP_R - 0.008;
  const s = new THREE.Shape();
  s.moveTo(0, -0.007);
  s.bezierCurveTo(len * 0.35, -0.013, len * 0.8, -0.011, len, -0.005);
  s.lineTo(len, 0.004);
  s.bezierCurveTo(len * 0.7, 0.010, len * 0.3, 0.011, 0, 0.007);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0015, bevelEnabled: false, curveSegments: segments });
  geo.rotateX(Math.PI / 2);
  geo.translate(0.008, 0, 0);
  return geo;
}

export function buildZagiCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'zagi-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const seg = lite ? 10 : 18;

  /* Zagi's HP: orange tape, the elevons a shade of it, black winglets, a
   * charcoal canopy. The trim bands are hidden unless a scheme colours
   * them apart from the wing. */
  const coat = paintRegions();
  const skin = coat.base('wing', cel({ color: 0xf0561e, rim: 0.30, spec: 0.55, specWidth: 0.012 }));
  const skinDark = coat.shade('wing', cel({ color: 0xd84a18, rim: 0.28, spec: 0.45, specWidth: 0.012 }));
  const trim = coat.base('trim', cel({ color: 0xf0561e, rim: 0.30, spec: 0.55, specWidth: 0.012 }));
  const wingletMat = coat.base('winglets', cel({ color: 0x17191b, rim: 0.30, spec: 0.40, side: THREE.DoubleSide }));
  const canopyMat = coat.base('canopy', cel({ color: 0x34383c, rim: 0.30, spec: 0.50, specWidth: 0.02 }));
  const black = cel({ color: 0x1c1f22, rim: 0.22, spec: 0.25 });
  const motorMat = cel({ color: 0x6a2c8e, rim: 0.30, spec: 0.60, specWidth: 0.02 });
  const white = cel({ color: 0xeeeeee, rim: 0.25 });
  const glass = cel({ color: 0x241c2c, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xe8c8ff });
  const stator = cel({ color: 0x2a2e31, rim: 0.24, spec: 0.20 });

  /* The measurement box, herocraft.js's contract with check 15. */
  if (opts.measure) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(ZAGI_DIMS.span, ZAGI_DIMS.vHalfUp + ZAGI_DIMS.vHalfDown, ZAGI_DIMS.tailZ - ZAGI_DIMS.noseZ),
      skin,
    );
    body.position.set(0, (ZAGI_DIMS.vHalfUp - ZAGI_DIMS.vHalfDown) / 2, (ZAGI_DIMS.tailZ + ZAGI_DIMS.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The wing, one loft; the post pass inks its edge from depth. */
  const wing = new THREE.Mesh(wingGeometry(lite), skin);
  wing.castShadow = shade;
  group.add(wing);
  /* The leading edge's tape band, over its front sixth: the wing's own
   * colour on the HP, black on the 5C's scheme. */
  const band = new THREE.Mesh(bandGeometry(lite, 0, 0.16), trim);
  band.castShadow = false;
  group.add(band);

  const left = buildElevon(-1, skinDark, shade);
  const right = buildElevon(1, skinDark, shade);
  group.add(left.pivot);
  group.add(right.pivot);

  for (const sign of [-1, 1]) {
    const winglet = new THREE.Mesh(wingletGeometry(sign), wingletMat);
    winglet.castShadow = shade;
    group.add(winglet);
  }

  const canopy = new THREE.Mesh(canopyGeometry(seg), canopyMat);
  canopy.castShadow = shade;
  if (inkOn) {
    outlineHull(canopy, 1.03, 0x14181c);
  }
  group.add(canopy);
  /* The servo fairings, white, on the top skin either side of the bay. */
  if (!lite) {
    for (const sign of [-1, 1]) {
      const x = sign * 4.0 * IN;
      const z = leZ(x) + 0.55 * chordAt(x);
      const u = 0.55;
      const top = MID_Y + (camberAt(u) + THICK * thickHalf(u)) * chordAt(x);
      const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.040), white);
      fairing.position.set(x, top + 0.002, z);
      group.add(fairing);
    }
  }

  /* The FPV camera on the canopy's nose. */
  {
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.019, 0.022), black);
    cam.position.set(0, ZAGI_MOUNT_UP, -ZAGI_MOUNT_FORWARD + 0.012);
    group.add(cam);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.006, 12), glass);
    lens.rotation.y = Math.PI;
    lens.position.set(0, ZAGI_MOUNT_UP, -ZAGI_MOUNT_FORWARD - 0.0005);
    group.add(lens);
  }
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, ZAGI_MOUNT_UP, -ZAGI_MOUNT_FORWARD);
  cameraMount.name = 'zagi-camera-mount';
  group.add(cameraMount);

  /* The inrunner on the tray's hard point, purple as Zagi's is, and the
   * prop behind the trailing edge. rotor.rotation.y is the spin. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.035, seg), motorMat);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, HUB_Y, PROP_Z - 0.030);
    can.castShadow = shade;
    group.add(can);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.020, HUB_Y - 0.010, 0.030), canopyMat);
    post.position.set(0, (HUB_Y + 0.010) / 2 - 0.004, PROP_Z - 0.030);
    group.add(post);
    const propMount = new THREE.Group();
    propMount.position.set(0, HUB_Y, PROP_Z);
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);
    const rotor = new THREE.Group();
    propMount.add(rotor);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 8), cel({ color: 0x9aa0a6, rim: 0.3, spec: 0.7 }));
    rotor.add(hub);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    for (let b = 0; b < 2; b += 1) {
      const blade = new THREE.Mesh(bladeGeo, black);
      blade.rotation.y = b * Math.PI;
      blade.castShadow = shade;
      rotor.add(blade);
    }
    blades.push(rotor);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 12 : 24),
      new THREE.MeshBasicMaterial({ color: 0x4a5058, transparent: true, opacity: 0.12, depthWrite: false, fog }),
    );
    disc.renderOrder = 1;
    propMount.add(disc);
    discs.push(disc);
  }
  for (let m = 1; m < 4; m += 1) {
    const none = new THREE.Group();
    group.add(none);
    blades.push(none);
    const noDisc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }));
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }

  /* Four lamps on the four slots the pose driver walks: the tips, the
   * canopy's nose and the motor. */
  const lampAt = [
    { x: -HALF + 0.02, y: MID_Y + 0.004, z: leZ(HALF) + 0.03, front: true },
    { x: HALF - 0.02, y: MID_Y + 0.004, z: leZ(HALF) + 0.03, front: false },
    { x: 0, y: 0.020, z: CANOPY.z0 + 0.02, front: true },
    { x: 0, y: HUB_Y + 0.016, z: PROP_Z - 0.04, front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.010), ledMat);
    led.position.set(at.x, at.y, at.z);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

  function setSurfaces(leftRad, rightRad) {
    left.flap.rotation.x = -leftRad;
    right.flap.rotation.x = -rightRad;
  }
  setSurfaces(0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: ZAGI_PROP_SPIN,
    setSurfaces,
    livery: coat.livery,
  };
}
