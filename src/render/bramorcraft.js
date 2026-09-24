/*
 * bramorcraft.js: the C-Astral Bramor C4EYE's model, its parachute and its
 * catapult, and nothing else.
 *
 * Its own file for the reason every airframe has one: the Bramor does not
 * share a silhouette with anything else here. It is a blended wing body,
 * a deep rounded pod that runs into a cranked inner delta and then into
 * long, thin, swept outer panels, with a tall swept winglet at each tip, a
 * gimballed camera ball in the nose and a folding pusher on a raised tail
 * cone. docs/BRAMOR-STAGE1.md has the aircraft and its sources, and the
 * planform below is the one scripts/bramor-derive.js integrates for the
 * plant's area, chord and neutral point, so the plant flies the wing drawn
 * here:
 *
 *   span            2.300 m, tips at x = +-1.15
 *   planform        the pod to 0.11 m out, the cranked delta to 0.30 m,
 *                   the outer panel to the tip at 25 degrees of leading
 *                   edge sweep, 0.26 m of chord at its root and 0.12 at the
 *                   tip: 0.591 m2 in all, pod included
 *   length          0.966 m, the gimbal ball's front to the winglets'
 *                   trailing corners (C-Astral: 96 cm)
 *   elevons         one a side, 0.45 m to 1.10 m out, a quarter of the
 *                   local chord
 *   winglets        up, canted out 8 degrees, swept 32, to 0.25 m over
 *                   the CG
 *   gimbal          the C4EYE ball, 100 mm across, in the tip of the nose
 *   motor and prop  a folding 12 x 8 two blade pusher on a tail cone that
 *                   lifts the hub 87 mm over the CG
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY, 0.4097 m behind the nose, which is
 * seven percent of the mean aerodynamic chord ahead of the neutral point
 * (scripts/bramor-derive.js). Every z below is measured from it.
 *
 * The livery is C-Astral's plain light grey, a shade darker underneath,
 * the elevons a hair darker again so their hinge lines read, and the red
 * of the chute harness over the top; no markings. The camera ball is
 * mid grey with dark glass.
 *
 * The contract with the shell is wingcraft.js's was, field for field:
 * group, discs, blades, leds, cameraMount, stator, propSpin, all four slots
 * long, and setSurfaces(leftRad, rightRad) for the elevons, positive
 * trailing edge up. Three more, all optional to a caller:
 *
 *   setProp(rate)      the Radian's contract (src/render/glidercraft.js):
 *                      the plant's motor rate, and when it is zero the
 *                      prop folds back along the tail cone, as a folding
 *                      prop does, and opens again when it turns; returns
 *                      the fold, 0 open to 1 folded
 *   setChute(open, dir, down, groundDist)
 *                      the canopy, `open` 0 (stowed, hidden) to 1, hung
 *                      along `dir` from the risers' attachment point, both
 *                      vectors in the craft frame; with groundDist, the
 *                      CG's height over the ground along `down`, it lies
 *                      collapsed on the ground beside the aircraft
 *   launcher           the catapult, a group drawn under the aircraft as
 *                      it sits on the rail ready to go (hidden until the
 *                      shell shows it), with launcherRest, its pose on the
 *                      aircraft, for putting it back
 *
 * The canopy and the launcher are NAMED, 'chute' and 'launcher', because
 * they are not the aircraft: scripts/craft-check.js leaves them out of the
 * hull, as it does the antennas.
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
import { BRAMOR_CATAPULT } from '../../configs/airframes.js';

/* The nose to the CG, metres: scripts/bramor-derive.js. */
const NOSE_TO_CG = 0.4097;
const HALF = 1.15;
const TAN25 = Math.tan((25 * Math.PI) / 180);

/*
 * The half planform, the derivation's: [y out, leading edge aft of the
 * nose, trailing edge aft of the nose, total thickness, height of the
 * section's centre line over the CG]. Between stations everything is
 * linear. The pod is 130 mm deep, its belly 65 mm under the CG.
 */
const STATIONS = [
  [0.00, 0.000, 0.620, 0.130, 0.000],
  [0.06, 0.040, 0.620, 0.120, 0.000],
  [0.11, 0.130, 0.620, 0.085, 0.002],
  [0.20, 0.239, 0.620, 0.050, 0.005],
  [0.30, 0.360, 0.620, 0.034, 0.008],
  [HALF, 0.360 + 0.85 * TAN25, 0.360 + 0.85 * TAN25 + 0.120, 0.013, 0.012],
];
function station(y, k) {
  const a = Math.abs(y);
  for (let i = 0; i + 1 < STATIONS.length; i += 1) {
    if (a <= STATIONS[i + 1][0]) {
      const t = (a - STATIONS[i][0]) / (STATIONS[i + 1][0] - STATIONS[i][0]);
      return STATIONS[i][k] + t * (STATIONS[i + 1][k] - STATIONS[i][k]);
    }
  }
  return STATIONS[STATIONS.length - 1][k];
}
/* Craft frame z of the leading edge, the chord, the thickness and the
 * centre line height at a station. */
const leZ = (x) => station(x, 1) - NOSE_TO_CG;
const chordAt = (x) => station(x, 2) - station(x, 1);
const thickAt = (x) => station(x, 3);
const midY = (x) => station(x, 4);

/* Elevons, hinged at three quarters of the local chord. */
const ELEVON_IN = 0.45;
const ELEVON_OUT = 1.10;
const HINGE = 0.75;

/* Winglets: the tip chord at the root, half of it at the top, 32 degrees
 * of leading edge sweep, canted out 3 degrees so the top's outer face is
 * at the published half span, and the top 0.25 m over the CG. */
const WINGLET_TOP = 0.25;
const WINGLET_CANT = (3 * Math.PI) / 180;
const WINGLET_SWEEP = Math.tan((32 * Math.PI) / 180);
const WINGLET_ROOT_X = HALF - 0.015;
const WINGLET_ROOT_Y = station(HALF, 4) + station(HALF, 3) / 2 - 0.004;
const WINGLET_LEN = (WINGLET_TOP - WINGLET_ROOT_Y) / Math.cos(WINGLET_CANT);
const WINGLET_ROOT_LE = station(HALF, 1) - NOSE_TO_CG + 0.006;
const WINGLET_ROOT_C = station(HALF, 2) - station(HALF, 1) - 0.006;
const WINGLET_TOP_C = 0.5 * WINGLET_ROOT_C;

/* The gimbal ball, and the pusher. */
const BALL_R = 0.050;
const BALL = new THREE.Vector3(0, -0.012, 0.050 - NOSE_TO_CG);
const HUB_Y = 0.087;
const PROP_R = 0.1524;
const PROP_Z = 0.760 - NOSE_TO_CG;

/*
 * The risers' attachment point, the plant's chute_attach (src/native/
 * plant_wing.c) in the craft frame: 64 mm ahead of the CG, on the belly.
 */
const CHUTE_ATTACH = new THREE.Vector3(0, -0.060, -0.0642);
/* The canopy, 1.64 m across, on risers 2.2 m long. */
const CANOPY_R = 0.82;
const RISER = 2.2;

export const BRAMOR_DIMS = {
  span: 2 * HALF,
  area: 0.591,
  /* The thermal lens' glass, which stands 2 mm proud of the ball. */
  noseZ: BALL.z - 0.052,
  /* The winglet's trailing corner, the furthest aft point. */
  tailZ: WINGLET_ROOT_LE + WINGLET_LEN * WINGLET_SWEEP + WINGLET_TOP_C,
  vHalfUp: WINGLET_TOP,
  /* The belly, and the prop disc, which reaches the same. */
  vHalfDown: 0.065,
  propR: PROP_R,
  catapult: BRAMOR_CATAPULT,
};

/*
 * The camera mount: the C4EYE ball's glass, 0.40 m ahead of the CG and
 * 12 mm under it, looking straight ahead. The ball is a real gimbal; here
 * it is the FPV camera, held on the nose.
 */
export const BRAMOR_MOUNT_FORWARD = NOSE_TO_CG - 0.010;
export const BRAMOR_MOUNT_UP = BALL.y;

/* The one prop turns positive about the body's forward axis, as the
 * flying wing's did: the plant applies the reaction as a negative roll. */
export const BRAMOR_PROP_SPIN = [1, 0, 0, 0];

/*
 * A closed section at station x, over the top from the leading edge to
 * `fMax` of the chord and back under: a NACA four digit thickness
 * distribution scaled to the station's depth, round nosed and fullest at
 * three tenths, on a small reflexed camber line. Across the pod the same
 * shape at a fifth of the chord deep is the blended body.
 */
function section(x, fMax, n) {
  const c = chordAt(x);
  const le = leZ(x);
  const t = thickAt(x);
  const y0 = midY(x);
  const upper = [];
  const lower = [];
  for (let i = 0; i < n; i += 1) {
    const u = fMax * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1)));
    const half = (t / 0.2) * (0.2969 * Math.sqrt(u) - 0.1260 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1015 * u * u * u * u);
    const camber = 0.06 * c * u * (1 - u) * (1 - 2.2 * u) * Math.min(1, Math.abs(x) / 0.3);
    upper.push(new THREE.Vector3(x, y0 + camber + half, le + u * c));
    lower.push(new THREE.Vector3(x, y0 + camber - half, le + u * c));
  }
  const loop = upper.slice();
  for (let i = n - 2; i >= 1; i -= 1) {
    loop.push(lower[i]);
  }
  return loop;
}

/*
 * Skin a run of closed sections, all the same point count, into one
 * indexed geometry with a fan capping each end, the way wingcraft.js did:
 * sections that run over the top first and advance along +x wind outward,
 * and `flip` turns a run that winds the other way out again.
 */
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

/* The wing and the body, tip to tip, cut at the elevons' hinges. */
function wingGeometry(lite) {
  const n = lite ? 11 : 17;
  const eps = 0.0005;
  const inner = lite ? [0.30, 0.11, 0] : [0.30, 0.20, 0.11, 0.06, 0.03, 0];
  const right = [
    ...inner.slice().reverse().filter((x) => x > 0).map((x) => [x, 1]),
    [ELEVON_IN - eps, 1],
    [ELEVON_IN + eps, HINGE],
    [ELEVON_OUT - eps, HINGE],
    [ELEVON_OUT + eps, 1],
    [HALF, 1],
  ];
  const left = right.slice().reverse().map(([x, f]) => [-x, f]);
  const stations = [...left, [0, 1], ...right];
  return loft(stations.map(([x, f]) => section(x, f, n)));
}

/* One elevon on its swept hinge, moved into a frame whose x axis is the
 * hinge so the flap's rotation.x is the deflection and nothing else. */
function buildElevon(sign, material, shade) {
  const stations = [];
  for (let i = 0; i <= 3; i += 1) {
    const x = sign * (ELEVON_IN + ((ELEVON_OUT - ELEVON_IN) * i) / 3);
    const c = chordAt(x);
    const u = HINGE;
    const half = (thickAt(x) / 0.2) * (0.2969 * Math.sqrt(u) - 0.1260 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1015 * u * u * u * u);
    const camber = 0.06 * c * u * (1 - u) * (1 - 2.2 * u);
    const y0 = midY(x) + camber;
    const zh = leZ(x) + HINGE * c;
    const zt = leZ(x) + c;
    stations.push([
      new THREE.Vector3(x, y0 + half, zh),
      new THREE.Vector3(x, y0 + half * 0.35, zh + (zt - zh) * 0.55),
      new THREE.Vector3(x, midY(x), zt),
      new THREE.Vector3(x, y0 - half * 0.35, zh + (zt - zh) * 0.55),
      new THREE.Vector3(x, y0 - half, zh),
    ]);
  }
  if (sign < 0) {
    stations.reverse();
  }
  const geo = loft(stations);
  const x0 = Math.min(sign * ELEVON_IN, sign * ELEVON_OUT);
  const x1 = Math.max(sign * ELEVON_IN, sign * ELEVON_OUT);
  const z0 = leZ(x0) + HINGE * chordAt(x0);
  const z1 = leZ(x1) + HINGE * chordAt(x1);
  const yaw = -Math.atan2(z1 - z0, x1 - x0);
  const mid = new THREE.Vector3((x0 + x1) / 2, midY((x0 + x1) / 2), (z0 + z1) / 2);
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

/*
 * A winglet: two thin sections, the tip's chord at the root and half of it
 * at the top, lofted up the canted, swept span of the winglet. Built for
 * the right tip and mirrored.
 */
function wingletGeometry(sign, n) {
  const len = WINGLET_LEN;
  const rootC = WINGLET_ROOT_C;
  const topC = WINGLET_TOP_C;
  const rootLe = WINGLET_ROOT_LE;
  const at = (s, c, le) => {
    const x = sign * (WINGLET_ROOT_X + s * Math.sin(WINGLET_CANT));
    const y = WINGLET_ROOT_Y + s * Math.cos(WINGLET_CANT);
    const pts = [];
    const upper = [];
    const lower = [];
    for (let i = 0; i < n; i += 1) {
      const u = 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1)));
      /* An eight percent section, NACA's 5 t c times the polynomial. */
      const half = 5 * 0.08 * c * (0.2969 * Math.sqrt(u) - 0.1260 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1015 * u * u * u * u);
      upper.push(new THREE.Vector3(x + sign * half, y, le + u * c));
      lower.push(new THREE.Vector3(x - sign * half, y, le + u * c));
    }
    for (const p of upper) pts.push(p);
    for (let i = n - 2; i >= 1; i -= 1) pts.push(lower[i]);
    return pts;
  };
  const secs = [at(0, rootC, rootLe), at(len * 0.5, (rootC + topC) / 2, rootLe + len * 0.5 * WINGLET_SWEEP), at(len, topC, rootLe + len * WINGLET_SWEEP)];
  /* Built going up, which is the loft's +x only on the right: the left's
   * sections run the other way round, so reverse its point order. */
  if (sign < 0) {
    for (const s of secs) {
      s.reverse();
    }
  }
  return loft(secs);
}

/*
 * The raised tail cone the motor rides: elliptical rings from over the
 * pod's back, where it blends into the body, up and aft to the motor.
 */
function tailConeGeometry(segments) {
  const rings = [
    [0.44, 0.030, 0.080, 0.040],
    [0.54, 0.048, 0.062, 0.042],
    [0.64, 0.068, 0.040, 0.034],
    [0.72, 0.083, 0.026, 0.026],
    [0.742, 0.087, 0.022, 0.022],
  ];
  const secs = rings.map(([aft, yc, w, h]) => {
    const pts = [];
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * w, yc + Math.sin(a) * h, aft - NOSE_TO_CG));
    }
    return pts;
  });
  return loft(secs, TAIL_CONE_FLIP);
}

/* Which way the tail cone's rings wind, looked at in the preview. */
const TAIL_CONE_FLIP = true;

/* A folding prop blade, built along +x from its hinge, long and slim. */
function bladeGeometry(segments) {
  const len = PROP_R - 0.020;
  const s = new THREE.Shape();
  s.moveTo(0, -0.008);
  s.bezierCurveTo(len * 0.35, -0.014, len * 0.8, -0.010, len, -0.004);
  s.lineTo(len, 0.003);
  s.bezierCurveTo(len * 0.7, 0.010, len * 0.3, 0.012, 0, 0.008);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.002, bevelEnabled: false, curveSegments: segments });
  /* Lay it in the rotor's plane: the shape's y becomes the blade's chord
   * along the spin axis' normal, its thickness along the axis. */
  geo.rotateX(Math.PI / 2);
  geo.translate(0.020, 0, 0);
  return geo;
}

/* The height of the upper skin at station x, `aft` metres behind the
 * nose: the section's own shape, for parts that sit on the skin. */
function topAt(x, aft) {
  const c = chordAt(x);
  const u = Math.min(1, Math.max(0, (aft - station(x, 1)) / c));
  const half = (thickAt(x) / 0.2) * (0.2969 * Math.sqrt(u) - 0.1260 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1015 * u * u * u * u);
  const camber = 0.06 * c * u * (1 - u) * (1 - 2.2 * u) * Math.min(1, Math.abs(x) / 0.3);
  return midY(x) + camber + half;
}

function tube(a, b, r, material, segments = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), segments), material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/*
 * The catapult, as the aircraft sits on it ready to go: an aluminium rail
 * from the ground up under the belly at the rail's angle, a bungee under
 * it, a cradle, and a bipod near the top (the Italian Army's photograph in
 * docs/BRAMOR-STAGE1.md). Built level, with the aircraft's CG at the
 * origin `height` over the ground, and turned by minus the rail's pitch,
 * so that as a child of the aircraft pitched up on the rail it stands
 * level on the ground.
 */
function buildLauncher(cat, cel, lite) {
  const theta = (cat.pitchDeg * Math.PI) / 180;
  const g = new THREE.Group();
  g.name = 'launcher';
  const metal = cel({ color: 0x2a2f33, rim: 0.20, spec: 0.35, specWidth: 0.02 });
  const bungee = cel({ color: 0xa89468, rim: 0.18 });
  const seg = lite ? 5 : 8;
  /* The aircraft's own down, then the rail's direction, down and aft. */
  const craftDown = new THREE.Vector3(0, -Math.cos(theta), -Math.sin(theta));
  const railDir = new THREE.Vector3(0, -Math.sin(theta), Math.cos(theta));
  const top = craftDown.clone().multiplyScalar(0.105);
  const foot = top.clone().addScaledVector(railDir, cat.railLength);
  const nose = top.clone().addScaledVector(railDir, -0.10);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, nose.distanceTo(foot)), metal);
  beam.position.copy(nose).add(foot).multiplyScalar(0.5);
  beam.rotation.x = theta;
  beam.castShadow = !lite;
  g.add(beam);
  const under = craftDown.clone().multiplyScalar(0.05);
  g.add(tube(nose.clone().add(under), foot.clone().add(under), 0.011, bungee, seg));
  const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.22), metal);
  cradle.position.copy(craftDown).multiplyScalar(0.08);
  cradle.rotation.x = theta;
  g.add(cradle);
  /* The bipod, from 0.4 m down the rail to the ground, splayed. */
  const ground = -cat.height;
  const hip = top.clone().addScaledVector(railDir, 0.4);
  for (const side of [-1, 1]) {
    g.add(tube(hip, new THREE.Vector3(side * 0.42, ground, hip.z - 0.30), 0.012, metal, seg));
  }
  /* A base plate where the rail's foot meets the ground. */
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.30), metal);
  plate.position.set(0, ground + 0.01, foot.z);
  g.add(plate);
  g.rotation.x = -theta;
  g.visible = false;
  return g;
}

/*
 * The parachute: a round canopy of twelve gores, orange and white for
 * being found in long grass, and eight risers to the attachment point. A
 * group whose origin IS that point and whose +y is the way the canopy
 * hangs, so pointing it is one quaternion and opening it is a scale.
 */
function buildChute(cel, lite) {
  const g = new THREE.Group();
  g.name = 'chute';
  g.position.copy(CHUTE_ATTACH);
  const orange = cel({ color: 0xe8702a, rim: 0.30, side: THREE.DoubleSide });
  const white = cel({ color: 0xece8e0, rim: 0.30, side: THREE.DoubleSide });
  const gores = lite ? 6 : 12;
  const canopy = new THREE.Group();
  canopy.position.y = RISER;
  for (let i = 0; i < gores; i += 1) {
    const geo = new THREE.SphereGeometry(CANOPY_R, lite ? 2 : 3, lite ? 5 : 8,
      (i / gores) * Math.PI * 2, (Math.PI * 2) / gores, 0, Math.PI * 0.42);
    geo.scale(1, 0.62, 1);
    const m = new THREE.Mesh(geo, i % 2 ? white : orange);
    canopy.add(m);
  }
  g.add(canopy);
  const skirtY = RISER + CANOPY_R * 0.62 * Math.cos(Math.PI * 0.42);
  const skirtR = CANOPY_R * Math.sin(Math.PI * 0.42);
  const pts = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    pts.push(0, 0, 0, Math.cos(a) * skirtR, skirtY, Math.sin(a) * skirtR);
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const risers = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x3a3430 }));
  g.add(risers);
  g.visible = false;
  /* The canopy collapsed on the grass, once it is down: a flattened dome
   * lying on its side. Parented to the craft, not the risers. */
  const puddle = new THREE.Mesh(new THREE.SphereGeometry(0.55, lite ? 8 : 14, lite ? 4 : 6), orange);
  puddle.scale.set(1.3, 0.06, 0.8);
  puddle.name = 'chute';
  puddle.visible = false;
  return { group: g, puddle };
}

export function buildBramorCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'bramor-craft';
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

  /* Cool greys: under the game's warm sun a neutral grey reads as sand. */
  const skin = cel({ color: 0xa9b5c1, rim: 0.30, spec: 0.34, specWidth: 0.014 });
  const skinDark = cel({ color: 0x94a0ac, rim: 0.28, spec: 0.28, specWidth: 0.014 });
  const gimbalMat = cel({ color: 0x8e979f, rim: 0.30, spec: 0.50, specWidth: 0.02 });
  const glass = cel({ color: 0x241c2c, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xe8c8ff });
  const black = cel({ color: 0x1c1f22, rim: 0.22, spec: 0.25 });
  const harness = cel({ color: 0xa83232, rim: 0.20 });
  const stator = cel({ color: 0x2a2e31, rim: 0.24, spec: 0.20 });
  const ink = 0x14181c;

  /* The measurement box, on herocraft.js's contract with check 15: span
   * wide, nose to tail deep, the winglets' top to the belly high. */
  if (opts.measure) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(BRAMOR_DIMS.span, BRAMOR_DIMS.vHalfUp + BRAMOR_DIMS.vHalfDown, BRAMOR_DIMS.tailZ - BRAMOR_DIMS.noseZ),
      skin,
    );
    body.position.set(0, (BRAMOR_DIMS.vHalfUp - BRAMOR_DIMS.vHalfDown) / 2, (BRAMOR_DIMS.tailZ + BRAMOR_DIMS.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The wing and the body, one loft, one material, no outline hull: a
   * copy scaled about the origin stands off a 2.3 m span's tips by
   * centimetres. The post pass inks the edge from depth. */
  const wing = new THREE.Mesh(wingGeometry(lite), skin);
  wing.castShadow = shade;
  group.add(wing);

  const left = buildElevon(-1, skinDark, shade);
  const right = buildElevon(1, skinDark, shade);
  group.add(left.pivot);
  group.add(right.pivot);

  for (const sign of [-1, 1]) {
    const winglet = new THREE.Mesh(wingletGeometry(sign, lite ? 7 : 11), skin);
    winglet.castShadow = shade;
    group.add(winglet);
  }

  const cone = new THREE.Mesh(tailConeGeometry(seg), skin);
  cone.castShadow = shade;
  group.add(cone);

  /* The chute bay's lid on the pod's back, and the harness over the top
   * in C-Astral's red, from the lid out to the roots. */
  /* The lid is thin and follows the pod's back fore and aft, as a strip
   * of skin a shade darker with its seam. */
  {
    const pts = [];
    for (let i = 0; i <= 6; i += 1) {
      const aft = 0.24 + (0.16 * i) / 6;
      pts.push(new THREE.Vector2(topAt(0, aft) + 0.0012, aft - NOSE_TO_CG));
    }
    const lidGeo = new THREE.PlaneGeometry(0.10, 1, 1, 6);
    const lp = lidGeo.attributes.position;
    for (let i = 0; i < lp.count; i += 1) {
      const row = Math.round((0.5 - lp.getY(i)) * 6);
      lp.setXYZ(i, lp.getX(i), pts[row].x, pts[row].y);
    }
    lidGeo.computeVertexNormals();
    const lid = new THREE.Mesh(lidGeo, cel({ color: 0x94a0ac, rim: 0.28, spec: 0.28, side: THREE.DoubleSide }));
    group.add(lid);
  }
  if (!lite) {
    /* Each strap in short straight runs laid on the skin. */
    const from = [0, 0.32];
    for (const to of [[-0.26, 0.30], [0.26, 0.30], [-0.20, 0.58], [0.20, 0.58]]) {
      let prev = null;
      for (let i = 0; i <= 6; i += 1) {
        const x = from[0] + ((to[0] - from[0]) * i) / 6;
        const aft = from[1] + ((to[1] - from[1]) * i) / 6;
        const p = new THREE.Vector3(x, topAt(x, aft) + 0.0015, aft - NOSE_TO_CG);
        if (prev) {
          group.add(tube(prev, p, 0.0016, harness, 4));
        }
        prev = p;
      }
    }
  }

  /*
   * The C4EYE ball in the nose: a collar the body opens round, the ball,
   * and on its face the big thermal lens under two small day lenses. The
   * camera mount is the shell's FPV view, on the ball's glass.
   */
  {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(BALL_R * 0.9, 0.005, lite ? 5 : 8, seg), black);
    collar.position.copy(BALL).add(new THREE.Vector3(0, 0, 0.012));
    group.add(collar);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, seg, lite ? 8 : 14), gimbalMat);
    ball.position.copy(BALL);
    ball.castShadow = shade;
    hull(ball, 1.05, ink);
    group.add(ball);
    const face = new THREE.Group();
    face.position.copy(BALL);
    group.add(face);
    const lens = (r, x, y) => {
      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.010, lite ? 10 : 18), black);
      bezel.rotation.x = Math.PI / 2;
      const dz = Math.sqrt(Math.max(0, BALL_R * BALL_R - x * x - y * y));
      bezel.position.set(x, y, -dz + 0.002);
      face.add(bezel);
      const g = new THREE.Mesh(new THREE.CircleGeometry(r, lite ? 10 : 18), glass);
      g.rotation.y = Math.PI;
      g.position.set(x, y, -dz - 0.0035);
      face.add(g);
    };
    lens(0.019, 0, -0.012);
    lens(0.008, -0.011, 0.020);
    lens(0.008, 0.011, 0.020);
  }
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, BRAMOR_MOUNT_UP, -BRAMOR_MOUNT_FORWARD);
  cameraMount.name = 'bramor-camera-mount';
  group.add(cameraMount);

  /* The pitot, low on the nose's left side, and two antenna stubs on the
   * back. The stubs are NAMED antenna: wire, not aircraft. */
  {
    const pitot = tube(new THREE.Vector3(-0.055, -0.035, 0.13 - NOSE_TO_CG), new THREE.Vector3(-0.058, -0.037, 0.04 - NOSE_TO_CG), 0.0035, black, 6);
    group.add(pitot);
    for (const x of [0.030, 0.052]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.004, 0.040, 6), black);
      mast.position.set(x, topAt(x, 0.47) + 0.018, 0.47 - NOSE_TO_CG);
      mast.name = 'antenna';
      group.add(mast);
    }
  }

  /*
   * The motor on the end of the tail cone and the folding prop behind it.
   * The prop mount turns the rotor's y axis onto the craft's forward axis,
   * so rotor.rotation.y is the spin the shell drives from RPM. Each blade
   * hangs on its own hinge: folded, it lies back along the cone.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  const hinges = [];
  let disc = null;
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.024, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, HUB_Y, PROP_Z - 0.014);
    can.castShadow = shade;
    group.add(can);
    const propMount = new THREE.Group();
    propMount.position.set(0, HUB_Y, PROP_Z);
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);
    const rotor = new THREE.Group();
    propMount.add(rotor);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.040, seg), black);
    spinner.rotation.x = Math.PI;
    spinner.position.y = -0.020;
    rotor.add(spinner);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    for (let b = 0; b < 2; b += 1) {
      const arm = new THREE.Group();
      arm.rotation.y = b * Math.PI;
      rotor.add(arm);
      const hinge = new THREE.Group();
      arm.add(hinge);
      const blade = new THREE.Mesh(bladeGeo, black);
      blade.castShadow = shade;
      hinge.add(blade);
      hinges.push(hinge);
    }
    blades.push(rotor);
    disc = new THREE.Mesh(
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
   * nose under the ball and the tail cone. */
  const lampAt = [
    { x: -HALF + 0.02, y: midY(HALF), z: leZ(HALF) + 0.03, front: true },
    { x: HALF - 0.02, y: midY(HALF), z: leZ(HALF) + 0.03, front: false },
    { x: 0, y: -0.058, z: 0.12 - NOSE_TO_CG, front: true },
    { x: 0, y: HUB_Y + 0.018, z: PROP_Z - 0.05, front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.004, 0.012), ledMat);
    led.position.set(at.x, at.y, at.z);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

  const chute = buildChute(cel, lite);
  group.add(chute.group);
  group.add(chute.puddle);
  const launcher = buildLauncher(BRAMOR_CATAPULT, cel, lite);
  group.add(launcher);
  const launcherRest = { position: launcher.position.clone(), quaternion: launcher.quaternion.clone() };

  function setSurfaces(leftRad, rightRad) {
    left.flap.rotation.x = -leftRad;
    right.flap.rotation.x = -rightRad;
  }
  setSurfaces(0, 0);

  /* Folded when the plant has stopped the motor, which on this aircraft
   * is only the chute's doing (a fixed prop idles at two percent): each
   * blade swings back about its hinge, a fifth of the way each call, until
   * it lies along the cone, aft, which is the rotor's -y, and the rotor
   * eases round to lay the pair level either side of the cone whatever
   * idle spin the shell adds. Built folded, as it sits on the rail. */
  const rotor = blades[0];
  const FOLD = -Math.PI / 2 + 0.12;
  let fold = 1;
  function setProp(rate) {
    const open = rate > 0;
    fold += ((open ? 0 : 1) - fold) * 0.2;
    if (Math.abs(fold - (open ? 0 : 1)) < 1e-3) {
      fold = open ? 0 : 1;
    }
    for (const h of hinges) {
      h.rotation.z = fold * FOLD;
    }
    if (!open) {
      const park = Math.round(rotor.rotation.y / Math.PI) * Math.PI;
      rotor.rotation.y += (park - rotor.rotation.y) * 0.3;
    }
    disc.visible = open && fold < 0.05;
    return fold;
  }
  for (const h of hinges) {
    h.rotation.z = FOLD;
  }
  disc.visible = false;

  const yAxis = new THREE.Vector3(0, 1, 0);
  const dirV = new THREE.Vector3();
  const downV = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  function setChute(open, dir, down, groundDist = null) {
    if (!(open > 0)) {
      chute.group.visible = false;
      chute.puddle.visible = false;
      return;
    }
    if (groundDist != null && down) {
      /* Down: the canopy lies in the grass 1.6 m off along the way it was
       * hanging, laid flat on the ground plane. */
      downV.set(down[0], down[1], down[2]).normalize();
      dirV.set(dir[0], dir[1], dir[2]);
      dirV.addScaledVector(downV, -dirV.dot(downV));
      if (dirV.lengthSq() < 1e-6) {
        dirV.set(1, 0, 0).addScaledVector(downV, -downV.x);
      }
      dirV.normalize();
      tmp.copy(CHUTE_ATTACH).addScaledVector(downV, groundDist - CHUTE_ATTACH.dot(downV) - 0.02);
      chute.puddle.position.copy(tmp).addScaledVector(dirV, 1.6);
      chute.puddle.quaternion.setFromUnitVectors(yAxis, downV.clone().negate());
      chute.puddle.visible = true;
      chute.group.visible = false;
      return;
    }
    dirV.set(dir[0], dir[1], dir[2]).normalize();
    chute.group.quaternion.setFromUnitVectors(yAxis, dirV);
    const f = 0.12 + 0.88 * Math.min(1, open);
    chute.group.scale.set(f, 1, f);
    chute.group.visible = true;
    chute.puddle.visible = false;
  }

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: BRAMOR_PROP_SPIN,
    setSurfaces,
    setProp,
    setChute,
    launcher,
    launcherRest,
  };
}
