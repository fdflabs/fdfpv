/*
 * combatcraft.js: the long range combat quads, the 7 inch and the 10 inch,
 * built from parts.
 *
 * ONE BUILDER, buildCombatDrone({ frame, payload, accessories }), for every
 * place a combat quad is drawn: the craft in flight (src/render/craft.js),
 * the hangar's preview, a peer in a room and a replay. All four call it
 * with the same answers and get the same machine, vertex for vertex
 * (scripts/combat-models-check.js asserts it), because nothing in here reads
 * a clock, a random number or anything but its arguments.
 *
 * WHAT IT IS. The owner's reference (2026-10-01) is a 7 to 10 inch long
 * range FPV quad: a black carbon X between stacked plates on standoffs,
 * four motors with big three blade props, an FPV camera in a cage at the
 * front, Li-ion packs strapped on top with red leads and yellow plugs, a
 * tall video antenna and thin receiver whips, olive tape on the arms, and
 * an olive drab warhead with a pointed steel nose slung underneath in
 * straps with a safety pin. docs/COMBAT-DRONES.md is the interface: its ids
 * are the ids here, and its parts list (scripts/combat-derive.js) is where
 * every part is put, about the bare machine's centre of mass. The bare
 * machine is the frame, one pack (the 10 inch's pair of bricks), the
 * camera in a plain mount, a stubby video antenna, short receiver tails and
 * landing legs; each accessory and the payload is one more PART, its own
 * named group, so the hangar can point at it.
 *
 * DRAW CALLS. Within a part every piece of one material is merged into one
 * mesh, and the part's outline is one more: back sided copies of its
 * pieces, each grown about its own centre, merged. So a part costs one
 * call a material plus one, not one a bolt. The rotors stay a mesh each
 * because they turn, and the blur discs a mesh each because the shell
 * fades them by motor (src/main.js).
 *
 * Built in the model frame every builder uses: x right, y up, z aft, front
 * at -z, metres, the bare CG at the origin. Positions written in the
 * plant's body frame come through src/render/frame.js bodyPosToModel.
 * Motor order is Betaflight's RR FR RL FL, as in src/render/herocraft.js.
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
import { celMaterial } from './celmat.js';
import { WORLD_SCALE, bodyPosToModel } from './frame.js';
import { PROP_SPIN } from './herocraft.js';
import { paintRegions } from './livery.js';
import { paintHook } from './combatpaint.js';
import { thermalKind } from './thermal.js';

/*
 * THE FRAMES, as docs/COMBAT-DRONES.md and scripts/combat-derive.js give
 * them. `cg` and every `z` below are in that script's FRAME DATUM (x
 * forward, y left, z up, metres from the middle of the arm plane); the
 * payloads' and accessories' points are about the bare CG, as the doc
 * prints them and configs/airframes.js `combat` carries them. The motors
 * are about the CG too, at the doc's +-arm_x, because that is where the
 * plant spins them.
 *
 * The doc's numbers are copied here rather than read from the airframe
 * table because this file has to build before, and without, a seated
 * airframe (the hangar's preview, the checks); scripts/combat-models-check.js
 * holds the copy to configs/airframes.js wherever the table has a combat
 * block, so the two cannot drift apart unseen.
 */
export const COMBAT_FRAMES = {
  '7in': {
    arm: 0.1575,
    propR: 0.0889,
    armT: 0.005,
    cg: [-0.0033, 0, 0.0287],
    belly: -0.005,
    plates: [0.16, 0.075, 0.03, 0.012],
    propZ: 0.037,
    motorR: 0.0172,
    pack: { at: [-0.005, 0, 0.050], box: [0.072, 0.063, 0.042], bricks: 1 },
    camera: [0.075, 0, 0.012],
    hullDown: 0.109,
    payloads: {
      standard: { d: 0.060, len: 0.26, at: [0.0233, 0, -0.0637] },
      wide: { d: 0.075, len: 0.24, at: [0.0133, 0, -0.0712] },
      penetrator: { d: 0.050, len: 0.32, at: [0.0433, 0, -0.0587] },
      emp: { d: 0.065, len: 0.18, at: [0.0033, 0, -0.0662] },
    },
    accessories: {
      pack2: [-0.0017, 0, 0.0633],
      cage: [0.0833, 0, -0.0167],
      lrantenna: [-0.0717, 0, 0.0613],
      gps: [-0.0567, 0, 0.0313],
    },
  },
  '10in': {
    arm: 0.210,
    propR: 0.127,
    armT: 0.006,
    cg: [-0.0034, 0, 0.035],
    belly: -0.006,
    plates: [0.20, 0.090, 0.035, 0.014],
    propZ: 0.049,
    motorR: 0.0192,
    pack: { at: [-0.005, 0, 0.058], box: [0.072, 0.126, 0.042], bricks: 2 },
    camera: [0.095, 0, 0.014],
    hullDown: 0.141,
    payloads: {
      standard: { d: 0.080, len: 0.34, at: [0.0284, 0, -0.081] },
      wide: { d: 0.100, len: 0.32, at: [0.0184, 0, -0.091] },
      penetrator: { d: 0.065, len: 0.42, at: [0.0534, 0, -0.0735] },
      emp: { d: 0.085, len: 0.24, at: [0.0034, 0, -0.0835] },
    },
    accessories: {
      cage: [0.1034, 0, -0.021],
      lrantenna: [-0.0866, 0, 0.075],
      gps: [-0.0666, 0, 0.045],
    },
  },
  /*
   * The interceptor, PROVISIONAL: the owner's reference (2026-10-01) is a
   * stretched X 7 inch, its motors further apart fore and aft than across,
   * clear two blade props, an armoured carbon box round the camera, one
   * big pack strapped on top and two antennas at the back, light payload.
   * Its airframe and parts list are another part's to write into
   * docs/COMBAT-DRONES.md; until then these are the reference's
   * proportions, and the check holds them to the airframe table the day
   * the table has a combat block with this frame. `motor` is [fore and
   * aft, across] about the CG; no legs, since it lands on its belly.
   */
  interceptor: {
    arm: 0.1588,
    motor: [0.125, 0.098],
    propR: 0.0889,
    blades: 2,
    clearProps: true,
    nose: 'armour',
    antennas: 'twin',
    legs: false,
    tape: false,
    armT: 0.005,
    cg: [0, 0, 0.022],
    belly: -0.0045,
    plates: [0.17, 0.050, 0.026, 0.011],
    propZ: 0.040,
    motorR: 0.0160,
    pack: { at: [0.005, 0, 0.046], box: [0.115, 0.046, 0.038], bricks: 1 },
    camera: [0.100, 0, 0.012],
    hullDown: 0.0665,
    payloads: {
      standard: { d: 0.040, len: 0.16, at: [0.010, 0, -0.0465] },
    },
    accessories: {
      gps: [-0.040, 0, 0.0475],
    },
  },
};

/* The payload ids, 'none' first, and the accessory ids, in the doc's order:
 * the order a build draws them in whatever order a list arrives in. */
export const COMBAT_PAYLOAD_IDS = ['none', 'standard', 'wide', 'penetrator', 'emp'];
export const COMBAT_ACCESSORY_IDS = ['pack2', 'cage', 'lrantenna', 'gps'];

/* ------------------------------------------------------------------ */
/* Pieces and kits.                                                    */
/* ------------------------------------------------------------------ */

const UP = new THREE.Vector3(0, 1, 0);
const scratchQ = new THREE.Quaternion();
const scratchE = new THREE.Euler();

/* Geometry placed in the part's frame: non indexed, no uvs, so any two
 * pieces merge. */
function place(geo, at = [0, 0, 0], rot = [0, 0, 0]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) {
    geo.dispose();
  }
  if (g.getAttribute('uv')) {
    g.deleteAttribute('uv');
  }
  scratchE.set(rot[0], rot[1], rot[2], 'YXZ');
  scratchQ.setFromEuler(scratchE);
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(at[0], at[1], at[2]),
    scratchQ,
    new THREE.Vector3(1, 1, 1),
  ));
  return g;
}

/*
 * A part's pieces by material key, and the subset that is outlined. A
 * piece's outline is a copy grown INK metres a side about its own centre,
 * which a whole merged part scaled about the craft's centre would not be:
 * its far pieces would slide outward off themselves.
 */
const INK = 0.0010;
const INK_COLOUR = 0x0a0c0a;

function createKit() {
  const byMat = new Map();
  const inked = [];
  function add(key, geo, at, rot, { ink = true } = {}) {
    const g = place(geo, at, rot);
    if (!byMat.has(key)) {
      byMat.set(key, []);
    }
    byMat.get(key).push(g);
    if (ink) {
      inked.push(g);
    }
    return g;
  }
  return { add, byMat, inked };
}

function grown(g) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  const c = b.getCenter(new THREE.Vector3());
  const s = b.getSize(new THREE.Vector3());
  const k = (d) => (d > 1e-5 ? Math.min(1.25, (d + 2 * INK) / d) : 1);
  const out = g.clone();
  out.translate(-c.x, -c.y, -c.z);
  out.scale(k(s.x), k(s.y), k(s.z));
  out.translate(c.x, c.y, c.z);
  return out;
}

function merged(list, what) {
  const g = mergeGeometries(list, false);
  if (!g) {
    throw new Error(`combatcraft: ${what} merge failed`);
  }
  for (const p of list) {
    p.dispose();
  }
  return g;
}

/* The kit as meshes in one named group: a mesh a material, then the ink. */
function kitGroup(kit, name, mats, { shade, ink, inkMat }) {
  const group = new THREE.Group();
  group.name = name;
  const hull = ink && kit.inked.length > 0 ? merged(kit.inked.map(grown), `${name} ink`) : null;
  for (const key of [...kit.byMat.keys()].sort()) {
    const mat = mats[key];
    if (!mat) {
      throw new Error(`combatcraft: ${name} uses unknown material ${key}`);
    }
    const mesh = new THREE.Mesh(merged(kit.byMat.get(key), `${name} ${key}`), mat);
    mesh.name = `${name}-${key}`;
    mesh.castShadow = shade;
    group.add(mesh);
  }
  if (hull) {
    const mesh = new THREE.Mesh(hull, inkMat);
    mesh.name = `${name}-ink`;
    group.add(mesh);
  }
  return group;
}

/* ------------------------------------------------------------------ */
/* Shapes.                                                             */
/* ------------------------------------------------------------------ */

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylY = (r, h, seg = 10, r2 = r) => new THREE.CylinderGeometry(r, r2, h, seg);
/* A cylinder along z, r1 at the -z end. */
const cylZ = (r1, r2, len, seg = 12) => new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(-Math.PI / 2);
/* A band round a body on the z axis, `w` long. Closed, so every piece is
 * a solid (scripts/combat-models-check.js weighs each mesh's signed
 * volume); its end caps are inside the body it is wrapped round. */
const band = (r, w, seg = 14) => cylZ(r, r, w, seg);

/*
 * A solid of revolution about z from [radius, z] pairs, front to back,
 * closed on the axis at both ends. LatheGeometry's faces point outward for
 * a profile that climbs its y, so the profile climbs from the front and the
 * quarter turn lays y onto z. A profile the wrong way round is a solid
 * drawn inside out, which front face culling hides; the check weighs it.
 */
function closedProfile(pairs) {
  const pts = pairs.map(([r, y]) => [Math.max(r, 1e-5), y]);
  if (pts[0][0] > 1e-5) {
    pts.unshift([1e-5, pts[0][1]]);
  }
  if (pts[pts.length - 1][0] > 1e-5) {
    pts.push([1e-5, pts[pts.length - 1][1]]);
  }
  return pts.map(([r, y]) => new THREE.Vector2(r, y));
}

function latheZ(pairs, seg) {
  const g = new THREE.LatheGeometry(closedProfile(pairs), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/* A flat outline in x and z, extruded `t` in y about y = 0. */
function slab(points, t) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -t / 2, 0);
  return g;
}

/*
 * A thin round stalk from `from` along `dir`, `len` long, `r` at the root
 * and `r2` at the tip: an antenna, a whip, a mast, a leg. Returns its end.
 */
function stalk(k, key, from, dir, len, r, { seg = 6, r2 = r, ink = false } = {}) {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const g = cylY(r2, len, seg, r);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d));
  k.add(key, g, [from[0] + d.x * len / 2, from[1] + d.y * len / 2, from[2] + d.z * len / 2], [0, 0, 0], { ink });
  return [from[0] + d.x * len, from[1] + d.y * len, from[2] + d.z * len];
}

/*
 * A long range blade: a narrow root, widest a third out, a slim tip. Flat
 * in x and z along +z from the hub, given a small twist about its own
 * axis so a disc of them reads as props and not paddles.
 */
function bladeGeo(r, seg, chord) {
  const c = r * chord;
  const s = new THREE.Shape();
  s.moveTo(0.004, 0.003);
  s.bezierCurveTo(c * 0.9, -r * 0.12, c * 1.05, -r * 0.40, c * 0.30, -r * 0.97);
  s.quadraticCurveTo(0, -r * 1.0, -c * 0.25, -r * 0.95);
  s.bezierCurveTo(-c * 0.55, -r * 0.45, -c * 0.45, -r * 0.12, -0.004, 0.003);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0016, bevelEnabled: false, curveSegments: seg });
  g.rotateX(-Math.PI / 2);
  g.rotateZ(0.16);
  return g;
}

/* ------------------------------------------------------------------ */
/* The frame's measurements in the model frame.                        */
/* ------------------------------------------------------------------ */

const MOTOR_SIGNS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/*
 * Everything the parts below are placed by, in model metres about the CG:
 * `D` takes a frame datum point, `C` a point about the CG.
 */
function measure(spec) {
  const [cgx, cgy, cgz] = spec.cg;
  const D = (x, y, z) => bodyPosToModel(x - cgx, y - cgy, z - cgz);
  const C = (x, y, z) => bodyPosToModel(x, y, z);
  const [plL, plW, plH, plZ] = spec.plates;
  const plateT = -spec.belly - spec.armT / 2;
  const armTop = spec.armT / 2 - cgz;
  const propY = spec.propZ - cgz;
  return {
    spec,
    D,
    C,
    arm: spec.arm,
    propR: spec.propR,
    /* The motors' axes, across (model x) and fore and aft (model z): a true
     * X's are the arm over root two both ways, a stretched X's its own. */
    motorX: spec.motor ? spec.motor[1] : spec.arm / Math.SQRT2,
    motorZ: spec.motor ? spec.motor[0] : spec.arm / Math.SQRT2,
    bodyL: plL,
    bodyW: plW,
    /* The plates' centre fore and aft, which is the datum's x = 0. */
    bodyZ: D(0, 0, 0)[2],
    armT: spec.armT,
    armW: 0.010 + 0.060 * spec.arm,
    plateT,
    belly: spec.belly - cgz,
    armTop,
    roof: plZ + plH / 2 - cgz,
    propY,
    motorR: spec.motorR,
    /* The bell's top, below the prop's hub by the prop adapter. */
    motorH: (propY - armTop) * 0.64,
    hullDown: spec.hullDown,
  };
}

/* ------------------------------------------------------------------ */
/* The bare machine.                                                   */
/* ------------------------------------------------------------------ */

function frameKit(k, f, lite) {
  const seg = lite ? 8 : 12;
  const { bodyL, bodyW, bodyZ, armW, armT, plateT, belly, armTop, roof, motorX, motorZ } = f;
  /* The bottom plate under the arms and the top plate, wider where the X
   * is clamped between them. */
  const plate = (w, l) => [
    [-w * 0.40, -l / 2], [w * 0.40, -l / 2], [w / 2, -l * 0.28], [w / 2, l * 0.28],
    [w * 0.40, l / 2], [-w * 0.40, l / 2], [-w / 2, l * 0.28], [-w / 2, -l * 0.28],
  ];
  k.add('carbon', slab(plate(bodyW, bodyL), plateT), [0, belly + plateT / 2, bodyZ]);
  k.add('carbon', slab(plate(bodyW * 0.92, bodyL * 0.90), 0.002), [0, roof - 0.001, bodyZ + 0.004]);
  /* The arms, one slab each from under the plates to a wider pad at the
   * motor, a lighter slot of carbon down the middle and olive tape round
   * them twice, the reference's crew marking. */
  const len = Math.hypot(motorX, motorZ);
  const armY = armTop - armT / 2;
  for (const [sx, sz] of MOTOR_SIGNS) {
    const mx = sx * motorX;
    const mz = sz * motorZ;
    const yaw = Math.atan2(mx, mz);
    const root = bodyW * 0.20;
    const outline = [
      [-armW * 0.62, -root], [armW * 0.62, -root],
      [armW / 2, len * 0.70], [armW * 0.80, len - armW * 0.2], [armW * 0.74, len + armW * 0.66],
      [-armW * 0.74, len + armW * 0.66], [-armW * 0.80, len - armW * 0.2], [-armW / 2, len * 0.70],
    ];
    k.add('carbon', slab(outline, armT), [0, armY, 0], [0, yaw, 0]);
    k.add('carbonDeep', box(armW * 0.34, armT * 1.04, len * 0.40), [mx * 0.50, armY, mz * 0.50], [0, yaw, 0], { ink: false });
    for (const t of f.spec.tape === false ? [] : [0.56, 0.80]) {
      k.add('tape', box(armW * 1.12, armT * 1.4, len * 0.07), [mx * t, armY, mz * t], [0, yaw, 0], { ink: false });
    }
    k.add('strap', box(armW * 1.16, armT * 1.7, 0.003), [mx * 0.40, armY, mz * 0.40], [0, yaw, 0], { ink: false });
  }
  /* Standoffs: black aluminium at the plate's corners, two brass ones at
   * the stack. */
  const sy = (belly + plateT + roof - 0.002) / 2 + armT / 4;
  const sh = roof - 0.002 - (armTop);
  for (const [x, z] of [[0.40, -0.34], [-0.40, -0.34], [0.40, 0.40], [-0.40, 0.40]]) {
    k.add('standoff', cylY(0.0028, sh, 8), [x * bodyW, sy, bodyZ + z * bodyL]);
  }
  for (const x of [0.28, -0.28]) {
    k.add('brass', cylY(0.0026, sh, 8), [x * bodyW, sy, bodyZ + 0.06 * bodyL]);
  }
  /* The stack between the plates: a 4 in 1 ESC, the flight controller over
   * it, the video transmitter at the back, and the capacitor. */
  const stackZ = bodyZ + 0.02 * bodyL;
  k.add('pcb', box(0.034, 0.003, 0.034), [0, armTop + 0.003, stackZ], [0, 0, 0], { ink: false });
  k.add('pcbDark', box(0.031, 0.006, 0.031), [0, armTop + 0.0075, stackZ], [0, 0, 0], { ink: false });
  k.add('pcb', box(0.030, 0.0025, 0.030), [0, armTop + 0.014, stackZ], [0, 0, 0], { ink: false });
  k.add('pcbDark', box(0.022, 0.006, 0.026), [0, roof - 0.008, bodyZ + 0.30 * bodyL], [0, 0, 0], { ink: false });
  k.add('steelDark', box(0.020, 0.0015, 0.024), [0, roof - 0.0045, bodyZ + 0.30 * bodyL], [0, 0, 0], { ink: false });
  k.add('wireRed', cylZ(0.005, 0.005, 0.022, 8), [0.014, armTop + 0.006, bodyZ + 0.40 * bodyL], [0, 0.3, 0], { ink: false });
  /* The pack's leads down through the stack, red, either side of it. */
  for (const sx of [1, -1]) {
    k.add('wireRed', cylZ(0.0018, 0.0018, bodyL * 0.5, 6), [sx * bodyW * 0.36, armTop + 0.011, bodyZ + 0.12 * bodyL], [0, 0, 0], { ink: false });
  }

  /* Motors: copper windings showing at the base, a dark bell over them,
   * the shaft and nut up to the prop. */
  const { motorR, motorH, propY } = f;
  /* The bell's profile climbs from its skirt to its crown. */
  const bellPts = closedProfile([
    [0.94, 0.26], [1.0, 0.36], [1.0, 0.72], [0.95, 0.92], [0.70, 1.0],
  ].map(([r, y]) => [r * motorR, y * motorH]));
  for (const [sx, sz] of MOTOR_SIGNS) {
    const x = sx * motorX;
    const z = sz * motorZ;
    k.add('bell', cylY(motorR * 0.98, motorH * 0.10, seg), [x, armTop + motorH * 0.05, z], [0, 0, 0], { ink: false });
    k.add('copper', cylY(motorR * 0.86, motorH * 0.18, seg), [x, armTop + motorH * 0.19, z]);
    k.add('bell', new THREE.LatheGeometry(bellPts, lite ? 10 : 16), [x, armTop, z]);
    k.add('steel', cylY(motorR * 0.16, propY - armTop - motorH, 6), [x, (propY + armTop + motorH) / 2, z], [0, 0, 0], { ink: false });
  }
  return k;
}

/* The landing legs: four splayed struts under the arms down to the hull's
 * depth, which is what the plant parks the machine on with or without a
 * payload (docs/COMBAT-DRONES.md section 2.3), each on a foot. */
function legsKit(k, f) {
  const legR = 0.0035 + 0.006 * f.arm;
  const footH = 0.004;
  const top = f.belly;
  const bottom = -f.hullDown;
  const rx = f.motorX * 0.52;
  const rz = f.motorZ * 0.52;
  const out = 0.014 / Math.SQRT2;
  for (const [sx, sz] of MOTOR_SIGNS) {
    const from = [sx * rx, top, sz * rz];
    const foot = [sx * (rx + out), bottom + footH, sz * (rz + out)];
    const d = [foot[0] - from[0], foot[1] - from[1], foot[2] - from[2]];
    stalk(k, 'leg', from, d, Math.hypot(d[0], d[1], d[2]), legR, { seg: 8, ink: true });
    k.add('leg', cylY(legR * 2.0, footH, 10, legR * 2.2), [foot[0], bottom + footH / 2, foot[2]]);
  }
  return k;
}

/* The pack: 21700 bricks on a grip pad on the top plate, two straps with
 * steel buckles round them, a red and a black lead out of the back to a
 * yellow plug. `at` and `bx` are the bricks' block in model metres. */
function packKit(k, at, bx, bricks, { pad = 0, straps = [-0.20, 0.20] } = {}) {
  const [w, h, l] = bx;
  const brickW = w / bricks;
  for (let i = 0; i < bricks; i += 1) {
    const x = at[0] - w / 2 + brickW * (i + 0.5);
    k.add('pack', box(brickW - 0.0015, h, l), [x, at[1], at[2]]);
    k.add('packEdge', box(brickW * 0.9, 0.0025, l * 1.004), [x, at[1] + h * 0.24, at[2]], [0, 0, 0], { ink: false });
  }
  if (pad > 0) {
    k.add('strap', box(w * 0.9, pad, l * 0.8), [at[0], at[1] - h / 2 - pad / 2, at[2]], [0, 0, 0], { ink: false });
  }
  const tall = h + pad;
  const midY = at[1] - pad / 2;
  for (const s of straps) {
    const z = at[2] + s * l;
    k.add('strap', box(w + 0.004, 0.0024, 0.016), [at[0], at[1] + h / 2 + 0.0012, z], [0, 0, 0], { ink: false });
    for (const sx of [1, -1]) {
      k.add('strap', box(0.0024, tall + 0.004, 0.016), [at[0] + sx * (w / 2 + 0.0012), midY, z], [0, 0, 0], { ink: false });
    }
    k.add('steel', box(0.010, 0.0035, 0.018), [at[0] + w * 0.22, at[1] + h / 2 + 0.0028, z], [0, 0, 0], { ink: false });
  }
  const back = at[2] + l / 2;
  const lead = [0, 0.5, 1];
  stalk(k, 'wireRed', [at[0] + 0.005, at[1] - h * 0.2, back], lead, 0.022, 0.0019);
  stalk(k, 'strap', [at[0] - 0.005, at[1] - h * 0.2, back], lead, 0.022, 0.0019);
  k.add('xt', box(0.017, 0.008, 0.013), [at[0], at[1] - h * 0.2 + 0.011, back + 0.026], [0.45, 0, 0]);
  return k;
}

function basePackKit(k, f) {
  const { box: [lx, ly, lz], at, bricks } = f.spec.pack;
  const c = f.D(...at);
  const pad = Math.max(0, c[1] - lz / 2 - f.roof);
  return packKit(k, c, [ly, lz, lx], bricks, { pad });
}

/* The camera, in its own group so it tilts with the camera angle. */
function cameraKit(k, lite) {
  const seg = lite ? 10 : 16;
  k.add('camBody', box(0.019, 0.019, 0.020), [0, 0, 0.004]);
  k.add('camBody', cylZ(0.0090, 0.0092, 0.012, seg), [0, 0, -0.011]);
  k.add('steel', new THREE.TorusGeometry(0.0088, 0.0012, 6, seg), [0, 0, -0.0172], [0, 0, 0], { ink: false });
  k.add('lens', new THREE.CircleGeometry(0.0078, seg).rotateY(Math.PI), [0, 0, -0.0174], [0, 0, 0], { ink: false });
  return k;
}

/* The plain mount: two side plates from the bottom plate to the top, the
 * camera on a screw through each. */
function mountKit(k, f, cam) {
  const top = f.roof;
  const bottom = f.belly;
  const h = top - bottom;
  for (const sx of [1, -1]) {
    k.add('carbon', box(0.0025, h, 0.026), [sx * 0.0122, (top + bottom) / 2, cam[2] + 0.006]);
    k.add('steel', cylY(0.0022, 0.0012, 6), [sx * 0.0140, cam[1], cam[2]], [0, 0, Math.PI / 2], { ink: false });
  }
  return k;
}

/* The bare machine's stubby video antenna and short receiver tails, wire
 * and not aircraft (craft-check measures the machine without them). */
function stockAntennaKit(k, f) {
  const at = f.D(f.spec.plates[0] * -0.42, 0, 0);
  stalk(k, 'antenna', [-0.012, f.roof, at[2]], [0, 1, 0.1], 0.026, 0.0034, { seg: 8, r2: 0.0045, ink: true });
  for (const side of [1, -1]) {
    stalk(k, 'whip', [0.012, f.roof, at[2]], [side * 0.25, 0.7, 0.8], 0.028, 0.0011, { seg: 5 });
  }
  return k;
}

/* The interceptor's two antennas, angled up and out at the back: a tall
 * video stalk on the right with its cap, a shorter receiver one on the
 * left, from SMA nuts on the top plate. */
function twinAntennaKit(k, f) {
  const z = f.bodyZ + f.bodyL * 0.44;
  for (const [x, len, lean, cap] of [[0.012, 0.115, 0.30, true], [-0.012, 0.075, -0.40, false]]) {
    k.add('brass', cylY(0.0034, 0.007, 6), [x, f.roof + 0.0035, z], [0, 0, 0], { ink: false });
    const dir = [lean * 0.5, 1, 0.42];
    const top = stalk(k, 'antenna', [x, f.roof + 0.007, z], dir, len, 0.0040, { seg: 8, r2: 0.0030, ink: true });
    if (cap) {
      const g = cylY(0.008, 0.022, 10, 0.0085);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()));
      k.add('antenna', g, top);
    }
  }
  return k;
}

/*
 * The interceptor's armoured nose: a box of dark weathered carbon plate
 * round the camera, from the bottom plate to above the top one, open at
 * the front round the lens behind a thick frame, angled cheeks at the
 * sides, bolts at the corners.
 */
function armourKit(k, f, cam) {
  const [, cy, cz] = cam;
  const w = 0.040;
  const bottom = f.belly;
  /* Up to just under the props' plane: the front props sweep over it. */
  const top = f.propY - 0.007;
  const h = top - bottom;
  const midY = (top + bottom) / 2;
  const back = cz + 0.030;
  const front = cz - 0.016;
  const t = 0.003;
  for (const sx of [1, -1]) {
    k.add('armour', box(t, h, back - front), [sx * (w / 2), midY, (back + front) / 2]);
    k.add('armour', box(0.012, h * 0.8, t), [sx * (w / 2 + 0.004), midY, front + 0.004], [0, sx * -0.6, 0]);
  }
  k.add('armour', box(w + t, t, back - front), [0, top, (back + front) / 2]);
  k.add('armour', box(w + t, t, back - front), [0, bottom + t / 2, (back + front) / 2]);
  /* The front frame round the lens: a plate above it and one below. */
  const lensTop = cy + 0.013;
  const lensBottom = cy - 0.013;
  k.add('armour', box(w, top - lensTop, t), [0, (top + lensTop) / 2, front]);
  k.add('armour', box(w, lensBottom - bottom, t), [0, (lensBottom + bottom) / 2, front]);
  k.add('armour', box(t * 2, lensTop - lensBottom, t), [0.016, cy, front], [0, 0, 0], { ink: false });
  k.add('armour', box(t * 2, lensTop - lensBottom, t), [-0.016, cy, front], [0, 0, 0], { ink: false });
  for (const sx of [1, -1]) {
    for (const y of [top - 0.006, bottom + 0.006]) {
      k.add('steel', cylY(0.0024, 0.002, 6), [sx * (w / 2 + t / 2 + 0.001), y, front + 0.006], [0, 0, Math.PI / 2], { ink: false });
    }
  }
  return k;
}

/* ------------------------------------------------------------------ */
/* Accessories, each at its docs/COMBAT-DRONES.md point.               */
/* ------------------------------------------------------------------ */

/* A second brick strapped on top of the first, its own straps outside the
 * first pack's, its own lead and plug. */
function pack2Kit(k, f, at) {
  const { box: [lx, ly, lz] } = f.spec.pack;
  return packKit(k, at, [ly, lz, lx], 1, { straps: [-0.36, 0.36] });
}

/* A printed guard round the camera: a TPU box of four rails about the
 * mount, side cheeks, and a square bumper proud of the lens. */
function cageKit(k, f, at) {
  const [x, y, z] = at;
  const w = 0.034;
  const h = 0.032;
  const l = 0.040;
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      k.add('tpu', box(0.004, 0.004, l), [x + sx * w / 2, y + sy * h / 2, z - 0.004]);
    }
    k.add('tpu', box(0.003, h * 0.7, l * 0.6), [x + sx * (w / 2 + 0.0005), y, z]);
  }
  /* The bumper: a square frame proud of the lens on four short posts. */
  const front = z - l / 2 - 0.010;
  for (const sy of [1, -1]) {
    k.add('tpu', box(w + 0.004, 0.005, 0.005), [x, y + sy * h / 2, front]);
  }
  for (const sx of [1, -1]) {
    k.add('tpu', box(0.005, h, 0.005), [x + sx * w / 2, y, front]);
    for (const sy of [1, -1]) {
      k.add('tpu', box(0.003, 0.003, 0.012), [x + sx * w / 2, y + sy * h / 2, front + 0.007]);
    }
  }
  return k;
}

/* The long range antennas: the tall video antenna at the back on the
 * right, raked aft with a mushroom cap, its mass point (the doc's) at its
 * middle; the receiver's two whips in a V off the back on the left. Moved
 * off the centreline by 14 mm a side so the GPS mast between them stays
 * clear: a lateral offset the plant's lumped mass does not see. */
function lrAntennaKit(k, f, at) {
  const h = 2 * (at[1] - f.roof);
  const base = [-0.014, f.roof, at[2]];
  k.add('brass', cylY(0.0036, 0.008, 6), [base[0], base[1] + 0.004, base[2]], [0, 0, 0], { ink: false });
  const dir = [0, 1, 0.16];
  const top = stalk(k, 'antenna', [base[0], base[1] + 0.008, base[2]], dir, h - 0.008, 0.0036, { seg: 8, r2: 0.0026, ink: true });
  const cap = cylY(0.0115, 0.015, 12, 0.011);
  cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()));
  k.add('antenna', cap, top);
  const root = stalk(k, 'antenna', [0.014, f.roof, at[2]], [0, 1, 0], 0.018, 0.0024);
  stalk(k, 'whip', root, [0.75, 1, 0.45], h * 0.55, 0.0009, { seg: 5 });
  stalk(k, 'whip', root, [-0.30, 1, 0.55], h * 0.55, 0.0009, { seg: 5 });
  return k;
}

/* A GPS puck on a short mast, its centre at the doc's point. */
function gpsKit(k, f, at) {
  const puckH = 0.007;
  const foot = [at[0], f.roof, at[2]];
  stalk(k, 'standoff', foot, [0, 1, 0], at[1] - puckH / 2 - f.roof, 0.0022);
  k.add('gps', cylY(0.014, puckH, 14), at);
  k.add('gpsTop', cylY(0.010, 0.0012, 12), [at[0], at[1] + puckH / 2 + 0.0006, at[2]], [0, 0, 0], { ink: false });
  return k;
}

const ACCESSORY_KITS = { pack2: pack2Kit, cage: cageKit, lrantenna: lrAntennaKit, gps: gpsKit };

/* ------------------------------------------------------------------ */
/* Payloads, each about its own centre on the z axis, nose at -z,      */
/* exactly d across and len long.                                      */
/* ------------------------------------------------------------------ */

/* The standard: the photograph's. An olive drab body, a pointed bare
 * steel nose behind a clamp ring, a tapered tail with four short fins
 * set at 45 degrees so none reaches below the body. */
function standard(k, d, len, seg) {
  const r = d / 2;
  const z0 = -len / 2;
  const nose = len * 0.26;
  const tail = len * 0.17;
  const shoulder = len * 0.05;
  const body = len - nose - tail - shoulder;
  k.add('steel', latheZ([[0.0025, 0], [r * 0.22, nose * 0.08], [r * 0.50, nose * 0.38], [r * 0.74, nose * 0.74], [r * 0.84, nose]], seg), [0, 0, z0]);
  k.add('steel', band(r * 0.87, 0.005, seg), [0, 0, z0 + nose - 0.002], [0, 0, 0], { ink: false });
  k.add('olive', latheZ([[r * 0.84, 0], [r, shoulder]], seg), [0, 0, z0 + nose]);
  k.add('olive', cylZ(r, r, body, seg), [0, 0, z0 + nose + shoulder + body / 2]);
  k.add('olive', latheZ([[r, 0], [r * 0.80, tail * 0.55], [r * 0.50, tail]], seg), [0, 0, z0 + len - tail]);
  k.add('oliveDark', cylZ(r * 0.5, r * 0.5, 0.003, seg), [0, 0, z0 + len - 0.0015], [0, 0, 0], { ink: false });
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const fin = slab([[0, 0], [r * 0.78, tail * 0.30], [r * 0.78, tail * 0.98], [0, tail * 0.98]], 0.002);
    k.add('olive', fin, [Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, z0 + len - tail], [0, 0, a]);
  }
  return { pin: [0, r * 0.62, z0 + nose * 0.50], straps: [-0.20, 0.16] };
}

/* The wide charge: short and fat, a ribbed fragmentation sleeve, a blunt
 * rounded nose and a flat back. The ribs are the full diameter. */
function wide(k, d, len, seg) {
  const r = d / 2;
  const z0 = -len / 2;
  const nose = len * 0.16;
  k.add('olive', latheZ([[0.002, 0], [r * 0.55, nose * 0.10], [r * 0.82, nose * 0.40], [r * 0.93, nose]], seg), [0, 0, z0]);
  const sleeve = len - nose - 0.012;
  k.add('olive', cylZ(r * 0.93, r * 0.93, sleeve, seg), [0, 0, z0 + nose + sleeve / 2]);
  const ribs = 7;
  for (let i = 0; i < ribs; i += 1) {
    const z = z0 + nose + sleeve * ((i + 0.5) / ribs);
    k.add('oliveDark', cylZ(r, r, sleeve * 0.06, seg), [0, 0, z], [0, 0, 0], { ink: false });
  }
  k.add('steelDark', cylZ(r * 0.93, r * 0.80, 0.012, seg), [0, 0, z0 + len - 0.006]);
  k.add('steelDark', cylZ(0.006, 0.006, 0.006, 8), [0, 0, z0 + 0.003], [0, 0, 0], { ink: false });
  return { pin: [0, r * 0.75, z0 + nose * 0.6], straps: [-0.17, 0.25] };
}

/* The penetrator: long and slim, a long pointed steel nose, no fins, a
 * dark tail cap. */
function penetrator(k, d, len, seg) {
  const r = d / 2;
  const z0 = -len / 2;
  const nose = len * 0.38;
  k.add('steel', latheZ([[0.0015, 0], [r * 0.30, nose * 0.20], [r * 0.62, nose * 0.52], [r * 0.88, nose * 0.82], [r, nose]], seg), [0, 0, z0]);
  k.add('steelDark', band(r * 1.002, 0.004, seg), [0, 0, z0 + nose + 0.002], [0, 0, 0], { ink: false });
  const body = len - nose - 0.016;
  k.add('olive', cylZ(r, r, body, seg), [0, 0, z0 + nose + body / 2]);
  k.add('steelDark', cylZ(r, r * 0.72, 0.016, seg), [0, 0, z0 + len - 0.008]);
  return { pin: [0, r * 0.85, z0 + nose * 0.75], straps: [-0.06, 0.24] };
}

/* The EMP: a grey canister with banded coils round it and a flat cap at
 * each end; nothing pointed, so it reads as not a bomb at a glance. The
 * coils are the full diameter. */
function emp(k, d, len, seg) {
  const r = d / 2;
  const z0 = -len / 2;
  const cap = 0.010;
  k.add('canister', cylZ(r * 0.90, r * 0.90, len - 2 * cap, seg), [0, 0, 0]);
  for (const s of [-1, 1]) {
    k.add('steelDark', cylZ(r * 0.96, r * 0.96, cap, seg), [0, 0, s * (len / 2 - cap / 2)]);
  }
  const coils = 3;
  for (let i = 0; i < coils; i += 1) {
    const z = z0 + cap + (len - 2 * cap) * (0.18 + 0.32 * i);
    k.add('coil', cylZ(r, r, len * 0.10, seg), [0, 0, z]);
  }
  k.add('xt', box(r * 0.5, 0.003, len * 0.12), [0, -r * 0.9, 0], [0, 0, 0], { ink: false });
  return { pin: [0, r * 0.9, z0 + cap * 0.5], straps: [-0.26, 0.26] };
}

const PAYLOAD_KITS = { standard, wide, penetrator, emp };

/*
 * The straps and the pin, about the payload's centre: a webbing band round
 * it at each station with a tab up through the belly plate, and the safety
 * pin's ring at the nose with its red wire up to the front of the belly,
 * which is what a crew pulls before launch.
 */
function slingKit(k, d, len, held, toBelly, toFront, seg) {
  const r = d / 2;
  for (const s of held.straps) {
    const z = s * len;
    /* Raised by its own thickness so it rides over the top and is flush
     * underneath: the deepest payload's belly is the hull's depth, and a
     * strap under it would be the lowest thing on the machine. */
    k.add('strap', band(r + 0.0015, 0.016, seg), [0, 0.0015, z], [0, 0, 0], { ink: false });
    k.add('strap', box(0.010, toBelly - r + 0.003, 0.016), [0, (r + toBelly) / 2, z], [0, 0, 0], { ink: false });
  }
  const ring = held.pin;
  k.add('steel', new THREE.TorusGeometry(0.0055, 0.0009, 5, 12), ring, [0, Math.PI / 2, 0], { ink: false });
  const anchor = [0, toBelly - 0.001, toFront];
  const v = [anchor[0] - ring[0], anchor[1] - ring[1], anchor[2] - ring[2]];
  stalk(k, 'wireRed', ring, v, Math.hypot(v[0], v[1], v[2]), 0.0007, { seg: 4 });
  return k;
}

/* ------------------------------------------------------------------ */
/* Materials, one set a build.                                         */
/* ------------------------------------------------------------------ */

function materials(fog) {
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  /* The motors' bells and windings warm with the throttle in a thermal
   * picture (src/render/thermal.js, the motor kind). */
  const motor = (o) => thermalKind(cel(o), 'motor');
  return {
    carbon: cel({ color: 0x1b1d1f, rim: 0.30, spec: 0.30, specWidth: 0.012 }),
    carbonDeep: cel({ color: 0x2c2f33, rim: 0.20, spec: 0.20 }),
    standoff: cel({ color: 0x232527, rim: 0.24, spec: 0.50 }),
    brass: cel({ color: 0xc8a050, rim: 0.30, spec: 0.60, specWidth: 0.018 }),
    pcb: cel({ color: 0x2f4a3a, rim: 0.20, spec: 0.25 }),
    pcbDark: cel({ color: 0x15181a, rim: 0.20, spec: 0.30 }),
    copper: motor({ color: 0xb8673a, rim: 0.30, spec: 0.55, specWidth: 0.02 }),
    /* The payload's coils: the motors' copper, not their heat. */
    coil: cel({ color: 0xb8673a, rim: 0.30, spec: 0.55, specWidth: 0.02 }),
    bell: motor({ color: 0x3a3c40, rim: 0.32, spec: 0.75, specWidth: 0.022 }),
    steel: cel({ color: 0x8e98a2, rim: 0.30, spec: 0.70, specWidth: 0.02, specColor: 0xe8eef4 }),
    steelDark: cel({ color: 0x55595e, rim: 0.30, spec: 0.60 }),
    strap: cel({ color: 0x141516, rim: 0.18, spec: 0.08 }),
    leg: cel({ color: 0x18191b, rim: 0.24, spec: 0.20 }),
    tpu: cel({ color: 0x3a3f2a, rim: 0.26, spec: 0.18 }),
    camBody: cel({ color: 0x121314, rim: 0.26, spec: 0.35 }),
    lens: cel({ color: 0x0c1014, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xf3ead4, side: THREE.DoubleSide }),
    wireRed: cel({ color: 0xc8241c, rim: 0.30, spec: 0.40 }),
    xt: cel({ color: 0xe0b020, rim: 0.28, spec: 0.40 }),
    pack: cel({ color: 0x18191b, rim: 0.24, spec: 0.35, specWidth: 0.02 }),
    packEdge: cel({ color: 0x2e3034, rim: 0.20, spec: 0.40 }),
    antenna: cel({ color: 0x16171a, rim: 0.26, spec: 0.30 }),
    whip: cel({ color: 0x2a2c30, rim: 0.20 }),
    tape: cel({ color: 0x5d6038, rim: 0.24, spec: 0.12 }),
    gps: cel({ color: 0x1d1f22, rim: 0.26, spec: 0.30 }),
    gpsTop: cel({ color: 0xd9d6cc, rim: 0.20, spec: 0.20 }),
    olive: cel({ color: 0x4d5130, rim: 0.30, spec: 0.35, specWidth: 0.02 }),
    oliveDark: cel({ color: 0x3b3e24, rim: 0.26, spec: 0.25 }),
    canister: cel({ color: 0x6c7177, rim: 0.30, spec: 0.40 }),
    prop: cel({ color: 0x232527, rim: 0.30, spec: 0.40, side: THREE.DoubleSide }),
    propClear: cel({ color: 0xc8d0d8, rim: 0.45, spec: 0.70, specWidth: 0.02, side: THREE.DoubleSide, transparent: true, opacity: 0.45 }),
    armour: cel({ color: 0x2a2b2b, rim: 0.26, spec: 0.22 }),
  };
}

/*
 * The paint regions (src/render/livery.js): each one colour as built, and
 * the materials a repaint of it takes along as shades. What is metal,
 * glass, copper, wire or circuit board stays as it is.
 */
function paintCoat(mats) {
  const coat = paintRegions();
  coat.base('frame', mats.carbon);
  coat.shade('frame', mats.carbonDeep);
  coat.shade('frame', mats.standoff);
  coat.base('pack', mats.pack);
  coat.shade('pack', mats.packEdge);
  coat.base('payload', mats.olive);
  coat.shade('payload', mats.oliveDark);
  coat.shade('payload', mats.canister);
  coat.base('tape', mats.tape);
  coat.base('cage', mats.tpu);
  coat.base('legs', mats.leg);
  coat.base('props', mats.prop);
  coat.base('armour', mats.armour);
  return coat;
}

/* Where decals go on the packs: the side of the block (and its twin) and
 * its top, on the second brick when there is one. */
function packSurfaces(f, pack2At) {
  const { box: [lx, ly, lz], at, bricks } = f.spec.pack;
  const base = f.D(...at);
  const top = pack2At ?? base;
  const w = ly;
  const yTop = top[1] + lz / 2;
  return [
    { id: 'pack-side', p: [base[0] - w / 2, base[1], base[2]], n: [-1, 0, 0], size: Math.min(lz, lx) * 0.8, mirror: true },
    { id: 'pack-top', p: [top[0] + (bricks > 1 ? -w / 4 : 0), yTop, top[2]], n: [0, 1, 0], size: Math.min(w / bricks, lx) * 0.8, mirror: bricks > 1 },
  ];
}

/* ------------------------------------------------------------------ */
/* The builder.                                                        */
/* ------------------------------------------------------------------ */

/*
 * Build a combat quad. `frame` is a COMBAT_FRAMES id ('7in', '10in' or
 * 'interceptor', the airframe's combat.frame); `payload` 'none' or one of
 * COMBAT_PAYLOAD_IDS the frame carries; and `accessories` a list of
 * COMBAT_ACCESSORY_IDS it offers. An id this file does not know, or one
 * the frame does not offer, throws: the shell resolves the pilot's choice before it gets here
 * (docs/COMBAT-DRONES.md section 2), so either is a bug upstream, and a
 * machine quietly drawn without the part would hide it. The other options
 * are every builder's: name, fog, lite, worldScale, measure.
 *
 * Returns what every builder returns ({ group, discs, blades,
 * cameraMount, propSpin, stator }) and `combat`: the answers as built, the
 * parts by name for the hangar to point at, and the measurements the
 * checks hold the parts to.
 */
export function buildCombatDrone(opts = {}) {
  const frameId = opts.frame ?? '7in';
  const spec = COMBAT_FRAMES[frameId];
  if (!spec) {
    throw new Error(`combatcraft: unknown frame ${JSON.stringify(frameId)}`);
  }
  const payloadId = opts.payload ?? 'none';
  if (payloadId !== 'none' && !(COMBAT_PAYLOAD_IDS.includes(payloadId) && spec.payloads[payloadId])) {
    throw new Error(`combatcraft: the ${frameId} frame carries no payload ${JSON.stringify(payloadId)}`);
  }
  const wanted = new Set(opts.accessories ?? []);
  for (const id of wanted) {
    if (!spec.accessories[id]) {
      throw new Error(`combatcraft: the ${frameId} frame has no accessory ${JSON.stringify(id)}`);
    }
  }
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const shade = !lite;
  const ink = !lite;
  const seg = lite ? 12 : 20;
  const f = measure(spec);
  const mats = materials(fog);
  const coat = paintCoat(mats);
  const inkMat = new THREE.MeshBasicMaterial({ color: INK_COLOUR, side: THREE.BackSide, fog });
  inkMat.userData.hullColor = INK_COLOUR;
  const style = { shade, ink, inkMat };

  const group = new THREE.Group();
  group.name = opts.name ?? 'combat-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  if (opts.measure) {
    /* The plates' box, hidden, as every quad builder leaves for the scale
     * checks to find. */
    const body = new THREE.Mesh(new THREE.BoxGeometry(f.bodyW, f.roof - f.belly, f.bodyL), mats.carbon);
    body.position.set(0, (f.roof + f.belly) / 2, f.bodyZ);
    body.visible = false;
    group.add(body);
  }

  const parts = { accessories: {} };
  const surfaces = packSurfaces(f, wanted.has('pack2') ? f.C(...spec.accessories.pack2) : null);
  const cam = f.D(...spec.camera);
  const nose = spec.nose === 'armour' ? armourKit : mountKit;
  parts.frame = kitGroup(nose(frameKit(createKit(), f, lite), f, cam), 'frame', mats, style);
  parts.pack = kitGroup(basePackKit(createKit(), f), 'pack', mats, style);
  group.add(parts.frame, parts.pack);
  if (spec.legs !== false) {
    parts.legs = kitGroup(legsKit(createKit(), f), 'legs', mats, style);
    group.add(parts.legs);
  }

  const cameraMount = new THREE.Group();
  cameraMount.name = 'camera';
  cameraMount.position.set(cam[0], cam[1], cam[2]);
  cameraMount.add(kitGroup(cameraKit(createKit(), lite), 'camera-head', mats, style));
  group.add(cameraMount);
  parts.camera = cameraMount;

  /* The antennas are wire, not aircraft: named 'antenna', which
   * scripts/craft-check.js leaves out of the machine's size, as the five
   * inch's mast is. */
  if (!wanted.has('lrantenna')) {
    const stock = kitGroup((spec.antennas === 'twin' ? twinAntennaKit : stockAntennaKit)(createKit(), f), 'antenna', mats, style);
    group.add(stock);
    parts.stockAntenna = stock;
  }
  for (const id of COMBAT_ACCESSORY_IDS) {
    if (!wanted.has(id)) {
      continue;
    }
    const at = f.C(...spec.accessories[id]);
    const g = kitGroup(ACCESSORY_KITS[id](createKit(), f, at), id === 'lrantenna' ? 'antenna' : `accessory-${id}`, mats, style);
    g.userData.accessory = id;
    group.add(g);
    parts.accessories[id] = g;
  }

  if (payloadId !== 'none') {
    const p = spec.payloads[payloadId];
    const centre = f.C(...p.at);
    const k = createKit();
    const held = PAYLOAD_KITS[payloadId](k, p.d, p.len, seg);
    const body = kitGroup(k, `payload-${payloadId}`, mats, style);
    const toBelly = f.belly - centre[1];
    const toFront = f.bodyZ - f.bodyL * 0.42 - centre[2];
    const sling = kitGroup(slingKit(createKit(), p.d, p.len, held, toBelly, toFront, seg), 'payload-sling', mats, style);
    const payload = new THREE.Group();
    payload.name = 'payload';
    payload.userData.payload = payloadId;
    payload.position.set(centre[0], centre[1], centre[2]);
    payload.add(body, sling);
    group.add(payload);
    parts.payload = payload;
    parts.payloadBody = body;
    const r = p.d / 2;
    surfaces.push({ id: 'payload-side', p: [centre[0] - r, centre[1], centre[2]], n: [-1, 0, 0], size: p.d * 0.8, mirror: true });
  }

  /* Rotors: the hub and three blades as one mesh a motor, turned by the
   * shell; a blur disc a motor, a direct child, as on the five inch. */
  const blade = bladeGeo(f.propR, lite ? 5 : 8, spec.blades === 2 ? 0.16 : 0.13);
  const bladeCount = spec.blades ?? 3;
  const propMat = spec.clearProps ? mats.propClear : mats.prop;
  const discs = [];
  const blades = [];
  for (let m = 0; m < 4; m += 1) {
    const [sx, sz] = MOTOR_SIGNS[m];
    const x = sx * f.motorX;
    const z = sz * f.motorZ;
    const pieces = [
      place(cylY(f.motorR * 0.42, 0.006, 10), [0, 0, 0]),
      place(new THREE.ConeGeometry(f.motorR * 0.30, 0.008, 8), [0, 0.007, 0]),
    ];
    for (let b = 0; b < bladeCount; b += 1) {
      pieces.push(place(blade.clone(), [0, 0, 0], [0, (b * Math.PI * 2) / bladeCount, 0]));
    }
    const rotor = new THREE.Group();
    rotor.name = `rotor-${m}`;
    rotor.position.set(x, f.propY, z);
    const mesh = new THREE.Mesh(merged(pieces, 'rotor'), propMat);
    mesh.castShadow = shade;
    rotor.add(mesh);
    group.add(rotor);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(f.propR, f.propR, 0.0012, lite ? 16 : 28),
      new THREE.MeshBasicMaterial({ color: 0x3a3d40, transparent: true, opacity: 0.12, depthWrite: false, fog }),
    );
    disc.name = `disc-${m}`;
    disc.position.set(x, f.propY + 0.001, z);
    disc.renderOrder = 1;
    group.add(disc);
    discs.push(disc);
  }
  blade.dispose();

  const craft = {
    group,
    discs,
    blades,
    cameraMount,
    propSpin: PROP_SPIN,
    stator: mats.copper,
    combat: {
      frame: frameId,
      payload: payloadId,
      accessories: COMBAT_ACCESSORY_IDS.filter((id) => wanted.has(id)),
      parts,
      size: {
        motorX: f.motorX,
        motorZ: f.motorZ,
        motorR: f.motorR,
        propR: f.propR,
        propY: f.propY,
        belly: f.belly,
        roof: f.roof,
        bodyL: f.bodyL,
        bodyW: f.bodyW,
        bodyZ: f.bodyZ,
        hullDown: f.hullDown,
      },
    },
  };
  craft.combat.paint = paintHook(craft, coat, surfaces);
  return craft;
}
