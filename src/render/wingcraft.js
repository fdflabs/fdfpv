/*
 * wingcraft.js: the 1000 mm flying wing's model, and nothing else.
 *
 * Its own file for the reason whoopcraft.js is: the wing does not share a
 * silhouette with either quad. A quad is motors around a centre; a wing is
 * ONE surface, swept, with two hinged flaps on its trailing edge, a pod on
 * its centre line and a single pusher prop behind it. Nothing here is a
 * motor arm and nothing in herocraft.js is a wing.
 *
 * The subject is the aircraft docs/WING-STAGE1.md derives the plant from, a
 * ZOHD Dart XL and AR Wing 900 class wing, and the numbers are that
 * document's where it has them:
 *
 *   span            1.000 m, tips at x = +-0.5
 *   area            0.220 m2 as a trapezoid, so a 0.32 m root chord tapering
 *                   to 0.12 m at the tip and a 0.22 m mean chord
 *   sweep           25 degrees at the leading edge
 *   elevons         the outboard third of each semi span, a quarter of the
 *                   local chord, hinged on the wing's own trailing edge line
 *   winglets        one up at each tip, 65 mm
 *   motor and prop  a 2216 pusher on the tail of the centre pod, 6 x 4 two
 *                   blade, so a 76.2 mm disc behind the trailing edge
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY, because the plant's position is the
 * CG and the shell puts this group there. On a flying wing that is about a
 * fifth of the mean aerodynamic chord behind that chord's leading edge,
 * which for this planform is 146 mm behind the nose. Every z below is
 * measured from it, and the consequences show in the measurements
 * scripts/craft-check.js reports: the swept back tips reach further from
 * the CG than the half span, and the nose is much closer than the tail.
 *
 * The palette is the project's, landed where a foam wing puts it: the wing
 * is the cream a covered EPP wing is, the control surfaces and winglets are
 * the sakura a pilot tapes on them so they can be seen moving from the
 * ground, the pod is the dark of the electronics bay, and the lamps are
 * mint. No outline hull on the wing itself: the hull is a copy scaled about
 * the origin, and on a metre of span a copy one percent larger stands off
 * the tips by five millimetres while adding nothing to the thin edge the
 * ink is meant for. The post pass draws that edge from depth on its own.
 *
 * The contract with the shell is herocraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, all four slots long
 * because src/main.js and src/render/craftpose.js walk four. Slot 0 is the
 * prop; slots 1 to 3 hold empty groups and lamps with no motor behind them,
 * which is the same shape the plant reports, RPM in slot 0 and zeros after.
 * On top of that contract this one adds setSurfaces(leftRad, rightRad),
 * which poses the elevons from sim_wing_surfaces, positive trailing edge up.
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

/*
 * The aircraft, in metres, in the Three.js craft frame: x right, y up, z
 * aft, origin at the CG. Exported so the airframe table and the scale check
 * can be held against the drawn machine rather than against a number typed
 * a second time.
 */
/* The prop's axis above the CG, and its radius. The motor rides a pylon on
 * the tail of the pod, high enough that the disc's bottom edge sits about
 * level with the wing's underside, which is where a belly landed wing
 * keeps its prop out of the grass. */
const MOTOR_Y = 0.045;
const PROP_R = 0.0762;
export const WING_DIMS = {
  span: 1.0,
  rootChord: 0.32,
  tipChord: 0.12,
  meanChord: 0.22,
  sweepDeg: 25,
  propR: PROP_R,
  /* The nose, and the furthest aft point, from the CG. The tail is the
   * winglet's raked trailing corner, not the prop: the sweep carries the
   * tips further back than the motor sits. */
  noseZ: -0.146,
  tailZ: 0.215,
  /* How far the model stands above and below the CG, level. Both are the
   * prop disc's edges; the winglets, the pod and the wing are inside. */
  vHalfUp: MOTOR_Y + PROP_R,
  vHalfDown: PROP_R - MOTOR_Y,
};
const SPAN = WING_DIMS.span;
const HALF = SPAN / 2;
const ROOT_CHORD = WING_DIMS.rootChord;
const TIP_CHORD = WING_DIMS.tipChord;
const SWEEP = (WING_DIMS.sweepDeg * Math.PI) / 180;
const NOSE_Z = WING_DIMS.noseZ;
/* Elevons: hinged at three quarters of the local chord, from a third of the
 * semi span in from the tip to just short of the winglet. */
const ELEVON_IN = HALF * (2 / 3);
const ELEVON_OUT = HALF - 0.020;
const HINGE_FRACTION = 0.75;
/* The pod's axis above the CG: the wing's centre section is 29 mm thick and
 * the pod sits on its back. The prop plane, behind the pod's tail. */
const POD_Y = 0.010;
const PROP_Z = 0.234;

/*
 * The camera mount, in the Three.js craft frame, and NOT lens.js's
 * CAMERA_MOUNT_FORWARD / CAMERA_MOUNT_UP: those are the five inch's, 80 mm
 * ahead of its CG, which on this machine is inside the wing's leading edge
 * fillet. The wing carries its camera in the nose of the pod, 145 mm ahead
 * of the CG and 30 mm above it, looking straight ahead. The shell's FPV
 * position has to be seated from these for the wing the way it reads
 * lens.js for the quad.
 */
export const WING_MOUNT_FORWARD = 0.145;
export const WING_MOUNT_UP = 0.030;

/* Leading edge z and chord at a spanwise station, from the planform. */
function leadingEdgeAt(x) {
  return NOSE_Z + Math.abs(x) * Math.tan(SWEEP);
}
function chordAt(x) {
  return ROOT_CHORD - (ROOT_CHORD - TIP_CHORD) * (Math.abs(x) / HALF);
}
function hingeAt(x) {
  return leadingEdgeAt(x) + HINGE_FRACTION * chordAt(x);
}
function trailingEdgeAt(x) {
  return leadingEdgeAt(x) + chordAt(x);
}

/*
 * A closed section of the wing at station x, as points running over the top
 * from the leading edge to `fMax` of the chord and back under. A NACA four
 * digit thickness distribution at nine percent with a small reflexed camber
 * line, which is what a flying wing section looks like in profile: the
 * camber goes positive over the front and turns down toward the trailing
 * edge, and that reflex is the Cm0 in the plant. Cosine spacing puts the
 * points where the curvature is.
 */
function wingSection(x, fMax, n) {
  const c = chordAt(x);
  const le = leadingEdgeAt(x);
  const upper = [];
  const lower = [];
  for (let i = 0; i < n; i += 1) {
    const t = fMax * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1)));
    const yt = 5 * 0.09 * c * (
      0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
    );
    const yc = 0.08 * c * t * (1 - t) * (1 - 2.2 * t);
    upper.push(new THREE.Vector3(x, yc + yt, le + t * c));
    lower.push(new THREE.Vector3(x, yc - yt, le + t * c));
  }
  /* Top, LE to the end, then the underside back, without repeating the two
   * end points. */
  const loop = upper.slice();
  for (let i = n - 2; i >= 1; i -= 1) {
    loop.push(lower[i]);
  }
  return loop;
}

/*
 * Skin a run of closed sections, all the same point count, into one indexed
 * geometry with a triangle fan capping each end. Indexed so the normals are
 * shared across a station and the surface shades as one curved form, which
 * is what the cel ramp wants from a wing.
 *
 * Winding is chosen for sections that run over the top first and stations
 * that advance along +x, so the outside faces out; the smoke test in
 * scripts asserts the upper surface normals point up.
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
      idx.push(a + j, a + k, b + j);
      idx.push(a + k, b + k, b + j);
    }
  }
  /* The caps: a fan about each end section's centroid. */
  const cap = (sec, base, flip) => {
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
      if (flip) {
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

/*
 * The wing as one loft from tip to tip. Where the elevons live the section
 * stops at the hinge, and the step from a full section to a cut one at the
 * same station is the side wall of the cut out. A hair of spanwise gap
 * keeps the two coincident sections from fighting.
 */
function wingGeometry(lite) {
  const n = lite ? 9 : 13;
  const eps = 0.0005;
  const stations = [
    [-HALF, 1],
    [-ELEVON_OUT - eps, 1],
    [-ELEVON_OUT + eps, HINGE_FRACTION],
    [-ELEVON_IN - eps, HINGE_FRACTION],
    [-ELEVON_IN + eps, 1],
    [-HALF * 0.40, 1],
    [-HALF * 0.16, 1],
    [0, 1],
    [HALF * 0.16, 1],
    [HALF * 0.40, 1],
    [ELEVON_IN - eps, 1],
    [ELEVON_IN + eps, HINGE_FRACTION],
    [ELEVON_OUT - eps, HINGE_FRACTION],
    [ELEVON_OUT + eps, 1],
    [HALF, 1],
  ];
  return loft(stations.map(([x, f]) => wingSection(x, f, n)));
}

/*
 * One elevon, built in the craft frame along its own swept hinge, then
 * moved into a frame whose x axis IS the hinge, so the flap group's
 * rotation.x is the deflection and nothing else. The section is a wedge:
 * the wing's thickness at the hinge closing to the trailing edge.
 *
 * Returns the pivot to add to the craft and the flap to rotate. sign is +1
 * for the right elevon (x > 0) and -1 for the left.
 */
function buildElevon(sign, material, shade) {
  const xIn = sign * ELEVON_IN;
  const xOut = sign * ELEVON_OUT;
  const stations = [];
  for (let i = 0; i <= 3; i += 1) {
    const x = xIn + ((xOut - xIn) * i) / 3;
    const c = chordAt(x);
    /* Half the section's thickness at the hinge line, from the same
     * distribution wingSection uses, so the flap meets the wing flush. */
    const t = HINGE_FRACTION;
    const yt = 5 * 0.09 * c * (
      0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
    );
    const yc = 0.08 * c * t * (1 - t) * (1 - 2.2 * t);
    const zh = hingeAt(x);
    const zt = trailingEdgeAt(x);
    stations.push([
      new THREE.Vector3(x, yc + yt, zh),
      new THREE.Vector3(x, yc + yt * 0.35, zh + (zt - zh) * 0.55),
      new THREE.Vector3(x, yc * 0.6, zt),
      new THREE.Vector3(x, yc - yt * 0.35, zh + (zt - zh) * 0.55),
      new THREE.Vector3(x, yc - yt, zh),
    ]);
  }
  /* The left elevon's stations run outboard, which is -x: reverse them so
   * every loft here advances along +x and winds the same way. */
  if (sign < 0) {
    stations.reverse();
  }
  const geo = loft(stations);

  /* The hinge, from its most negative x end to its most positive, and the
   * yaw that lays it on the pivot's x axis. */
  const x0 = Math.min(xIn, xOut);
  const x1 = Math.max(xIn, xOut);
  const z0 = hingeAt(x0);
  const z1 = hingeAt(x1);
  const yaw = -Math.atan2(z1 - z0, x1 - x0);
  const mid = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
  geo.translate(-mid.x, -mid.y, -mid.z);
  geo.rotateY(-yaw);

  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  pivot.rotation.y = yaw;
  const flap = new THREE.Group();
  pivot.add(flap);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = shade;
  flap.add(mesh);
  return { pivot, flap };
}

/*
 * A winglet: a thin raked plate standing up off the tip chord, drawn in
 * the (z, y) plane and turned to stand at x = +-0.5.
 */
function wingletGeometry(sign) {
  const le = leadingEdgeAt(HALF);
  const te = trailingEdgeAt(HALF);
  const s = new THREE.Shape();
  s.moveTo(le + 0.012, -0.004);
  s.lineTo(te, -0.004);
  s.lineTo(te + 0.008, 0.060);
  s.lineTo(te - 0.040, 0.065);
  s.lineTo(le + 0.030, 0.034);
  s.closePath();
  const thick = 0.006;
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 2 });
  /* Shape x is chordwise, so it becomes craft z; the extrusion runs along
   * shape z and becomes craft x, inboard from the tip face. */
  geo.rotateY(-Math.PI / 2);
  /* The extrusion now spans x in [-thick, 0]: put its outer face on the
   * tip. */
  geo.translate(sign > 0 ? HALF : -HALF + thick, 0, 0);
  return geo;
}

/* The pod, a lathe about the craft's z axis: a nose for the camera, a bay
 * for the pack and a tail that carries the motor. */
function podGeometry(segments) {
  const pts = [
    new THREE.Vector2(0.004, -0.168),
    new THREE.Vector2(0.016, -0.150),
    new THREE.Vector2(0.026, -0.110),
    new THREE.Vector2(0.032, -0.040),
    new THREE.Vector2(0.032, 0.030),
    new THREE.Vector2(0.028, 0.100),
    new THREE.Vector2(0.021, 0.160),
    new THREE.Vector2(0.016, 0.200),
    new THREE.Vector2(0.016, 0.206),
    new THREE.Vector2(0.000, 0.206),
  ];
  const geo = new THREE.LatheGeometry(pts, segments);
  /* Lathe axis is y; the pod lies along z. */
  geo.rotateX(Math.PI / 2);
  return geo;
}

/* A 6 x 4 blade: long, slender and high pitched next to a quad's. */
function wingBlade(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0030, 0.008);
  s.bezierCurveTo(0.0120, -0.010, 0.0110, -r * 0.45, 0.0040, -r * 0.96);
  s.lineTo(-0.0030, -r * 0.93);
  s.bezierCurveTo(-0.0100, -r * 0.40, -0.0070, -0.008, -0.0020, 0.008);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.0015,
    bevelEnabled: false,
    curveSegments: segments,
  });
}

/*
 * The one prop turns positive about the body's forward axis: the plant
 * applies its torque reaction as a negative roll, so the prop itself goes
 * the other way. Slots 1 to 3 have nothing in them and spin nothing.
 */
export const WING_PROP_SPIN = [1, 0, 0, 0];

export function buildWingCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'wing-craft';
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

  const foam = cel({ color: 0xe8dcc0, rim: 0.30, spec: 0.20, specWidth: 0.012 });
  const foamUnder = cel({ color: 0xd8ccb0, rim: 0.24, spec: 0.14 });
  const tape = cel({ color: 0xe8a8b8, rim: 0.40, spec: 0.44, specWidth: 0.016 });
  const podMat = cel({ color: 0x1c241e, rim: 0.30, spec: 0.26, specWidth: 0.014 });
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
  const propMat = cel({ color: 0x4a554c, rim: 0.26, spec: 0.22 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /*
   * The measurement box, hidden, on herocraft.js's contract with check 15:
   * a direct child BoxGeometry whose depth is the published length. Width
   * is the span, depth is nose to tail, height is what the prop disc
   * reaches.
   */
  if (opts.measure) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        SPAN,
        WING_DIMS.vHalfUp + WING_DIMS.vHalfDown,
        WING_DIMS.tailZ - WING_DIMS.noseZ,
      ),
      foam,
    );
    body.position.set(0, (WING_DIMS.vHalfUp - WING_DIMS.vHalfDown) / 2, (WING_DIMS.tailZ + WING_DIMS.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The wing. One mesh, one material, no hull: see the header. The
   * underside reads darker through the cel ramp's shadow band on its own. */
  const wing = new THREE.Mesh(wingGeometry(lite), foam);
  wing.castShadow = shade;
  wing.receiveShadow = false;
  group.add(wing);

  /* The elevons, sakura, on their hinges. */
  const left = buildElevon(-1, tape, shade);
  const right = buildElevon(1, tape, shade);
  group.add(left.pivot);
  group.add(right.pivot);

  /* The winglets. */
  for (const sign of [-1, 1]) {
    const winglet = new THREE.Mesh(wingletGeometry(sign), tape);
    winglet.castShadow = shade;
    group.add(winglet);
  }

  /* The pod, flattened a little so it reads as a bay on a wing rather than
   * a tube through one. */
  const pod = new THREE.Mesh(podGeometry(seg), podMat);
  pod.scale.set(1, 0.82, 1);
  pod.position.set(0, POD_Y, 0);
  pod.castShadow = shade;
  hull(pod, 1.04, ink);
  group.add(pod);
  /* A cream hatch line down the top of the bay, so the pod reads as a lid
   * on the wing and not as a separate animal. */
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.0016, 0.120), foamUnder);
  hatch.position.set(0, POD_Y + 0.0265, -0.010);
  group.add(hatch);

  /*
   * The camera, in the nose of the pod. The mount group is what the shell
   * parents the FPV view to and tilts by the pilot's camera angle, which
   * on a wing is zero: it looks where the nose points.
   */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, WING_MOUNT_UP, -WING_MOUNT_FORWARD);
  cameraMount.name = 'wing-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.019, 0.022), camBody);
    housing.position.set(0, 0, -0.004);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0084, 0.0090, 0.014, lite ? 8 : 14), camBody);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.018);
    cameraMount.add(barrel);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0078, lite ? 10 : 18), lens);
    glass.rotation.y = Math.PI;
    glass.position.set(0, 0, -0.0242);
    cameraMount.add(glass);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0084, 0.0013, lite ? 5 : 8, lite ? 10 : 18), ring);
    bezel.position.set(0, 0, -0.0236);
    cameraMount.add(bezel);
  }

  /* The antenna, a whip off the back of the pod. NAMED, because it is wire
   * and not aircraft: scripts/craft-check.js leaves it out of the hull. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.060, lite ? 5 : 8), antenna);
    mast.position.set(0.012, POD_Y + 0.045, 0.090);
    mast.rotation.z = -0.20;
    mast.rotation.x = -0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The motor on the tail of the pod, and its prop behind it. The prop
   * mount turns the rotor's y axis to lie along the craft's forward axis,
   * so rotor.rotation.y is the spin the shell drives from RPM, the same
   * way it drives a quad's.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    /* The pylon, a raked fin from the pod's tail up to the motor mount. */
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.014, MOTOR_Y - POD_Y + 0.004, 0.046), podMat);
    pylon.position.set(0, (MOTOR_Y + POD_Y) / 2 - 0.002, 0.186);
    pylon.rotation.x = 0.30;
    pylon.castShadow = shade;
    hull(pylon, 1.05, ink);
    group.add(pylon);
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.006, 0.030), podMat);
    mount.position.set(0, MOTOR_Y, 0.198);
    group.add(mount);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.0110, 0.0110, 0.016, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, MOTOR_Y, 0.206 + 0.008);
    can.castShadow = shade;
    group.add(can);
    const bellMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0139, 0.0139, 0.012, seg), bell);
    bellMesh.rotation.x = Math.PI / 2;
    bellMesh.position.set(0, MOTOR_Y, 0.220);
    bellMesh.castShadow = shade;
    hull(bellMesh, 1.07, 0x121810);
    group.add(bellMesh);

    const propMount = new THREE.Group();
    propMount.position.set(0, MOTOR_Y, PROP_Z);
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.0060, lite ? 8 : 12), hubMat);
    rotor.add(hub);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.0040, 6), ring);
    nut.position.y = 0.005;
    rotor.add(nut);
    const bladeGeo = wingBlade(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    for (let b = 0; b < 2; b += 1) {
      const blade = new THREE.Mesh(bladeGeo, propMat);
      blade.rotation.y = b * Math.PI;
      blade.castShadow = shade;
      rotor.add(blade);
    }
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 12 : 24),
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
  /* Slots 1 to 3: nothing turns there. Empty groups, so a caller that
   * walks four rotors finds four objects and spins three of nothing. */
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
   * Four lamps, on the four slots the pose driver walks: the two tips, the
   * nose and the tail. Sakura on the left and the nose, mint on the right
   * and the tail, which is how a pilot tells the wing's heading at a
   * hundred metres.
   */
  const lampAt = [
    { x: -HALF + 0.010, y: 0.006, z: trailingEdgeAt(HALF) - 0.030, front: true },
    { x: HALF - 0.010, y: 0.006, z: trailingEdgeAt(HALF) - 0.030, front: false },
    { x: 0, y: POD_Y + 0.022, z: -0.120, front: true },
    { x: 0, y: POD_Y + 0.018, z: 0.150, front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0030, 0.010), ledMat);
    led.position.set(at.x, at.y, at.z);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

  /*
   * Pose the elevons. Radians, left then right, positive trailing edge up,
   * which is sim_wing_surfaces' own convention. The flap frame's z runs
   * aft, so a negative turn about its x lifts the trailing edge.
   */
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
    propSpin: WING_PROP_SPIN,
    setSurfaces,
  };
}
