/*
 * vehicles.js: what drives, and what is parked, in a Swiss valley.
 *
 * A yellow PostAuto, a red tractor with a hay trailer, an estate car of
 * the Subaru kind every farm has, a delivery van, hatchbacks, a
 * motorbike, and the light aircraft on the apron. Authored the way the
 * town's vehicles are, and for the same reasons: along +x with the nose
 * at +x, origin on the ground in the centre of the footprint, the
 * screens drawn between two named points of the profile rather than as
 * a box given a tilt. The parts carry their colour and bake into one
 * geometry (parts.js); the wheels are listed rather than drawn, so a
 * moving vehicle can turn them and a parked one can bake them in.
 *
 * Dimensions are real to a few centimetres, because a bus that is not
 * visibly twice a car is the one thing a street cannot survive.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { makeParts, bakeParts, panel, box, cylZ, extrudeZ, shade } from './parts.js';

/*
 * Swiss village colours. The PostAuto yellow is the one saturated note
 * and it is meant to be: a yellow bus reads at three hundred metres. The
 * cars are what is parked outside a Coop: white, silver, a dark blue,
 * a red, an anthracite. Glass is a deep blue grey that the cel ramp can
 * still band.
 */
export const PAINT = {
  postYellow: 0xf2c118,
  cream: 0xf3ecd9,
  white: 0xeeeeea,
  silver: 0xbfc4c8,
  red: 0xb8322a,
  blue: 0x2d4a86,
  green: 0x3d6a48,
  anthracite: 0x474b52,
  black: 0x1c1e21,
  dark: 0x2c2e33,
  glass: 0x27384b,
  tyre: 0x26272b,
  rim: 0xb4b8bc,
  chrome: 0xd6d9dc,
  lampF: 0xfff2c4,
  lampR: 0xd23a2f,
  cubYellow: 0xf0be2a,
  hay: 0xd8c070,
};

export const CAR_COLOURS = [
  PAINT.white, PAINT.white, PAINT.silver, PAINT.silver, PAINT.red, PAINT.blue, PAINT.anthracite, PAINT.green,
];

/*
 * One wheel, unit radius, axis along z, a metre wide: the instance
 * matrix scales it to the vehicle. Tyre, a rim face proud of the
 * sidewall so it is a wheel and not a dark dot at fifty metres, a hub.
 */
export function wheelGeometry() {
  const P = makeParts();
  P.push(PAINT.tyre, cylZ(1, 1, 12));
  P.push(PAINT.rim, cylZ(0.6, 1.06, 8));
  P.push(PAINT.dark, cylZ(0.2, 1.1, 6));
  return bakeParts(P);
}

/* A half torus lying in the xz plane of the flank: the lip of the arch
 * the wheel turns in. A dark well under it once stood inside the body
 * box where nothing could see it, at 192 triangles a car. */
function arch(P, x, r, z, colour, HW) {
  P.push(colour, new THREE.TorusGeometry(r + 0.055, 0.03, 3, 8, Math.PI), x, r + 0.01, Math.sign(z) * (HW + 0.008), 0, 0, 0, 1, 1, 1.3);
}

/*
 * The cars, as table rows. Real dimensions: a small hatch, a big estate
 * with roof rails and cladding, and a long high delivery van glazed over
 * its cab only. cab is where the glasshouse meets the waist, rear and
 * front; rakeF and rakeR are how far the roof edge sits back from each.
 */
export const CARS = {
  hatch: {
    L: 4.25, W: 1.78, R: 0.31, axle: [1.35, -1.25],
    sill: 0.34, waist: 0.95, roof: 1.48,
    cab: [-1.98, 0.85], rakeF: 0.65, rakeR: 0.42,
    pillars: [0.05, -0.85], handles: [-0.25, -1.15],
  },
  estate: {
    L: 4.82, W: 1.84, R: 0.34, axle: [1.42, -1.42],
    sill: 0.42, waist: 1.02, roof: 1.62,
    cab: [-2.2, 1.0], rakeF: 0.7, rakeR: 0.22,
    pillars: [0.15, -0.9, -1.85], handles: [-0.15, -1.2],
    rails: true, cladding: true,
  },
  van: {
    L: 5.9, W: 2.0, R: 0.37, axle: [2.0, -1.7],
    sill: 0.42, waist: 1.15, roof: 2.55,
    cab: [-2.9, 2.2], rakeF: 0.55, rakeR: 0.05,
    side: [1.0, 2.3],
    pillars: [1.05], handles: [1.3],
    seams: [-2.85, 0.2, -1.4],
  },
};

function car(P, s, colour) {
  const deep = shade(colour, 0.72);
  const HW = s.W / 2;
  /* The cabin is narrower than the body by the shoulder line; without
   * that step a car in this style is a loaf. */
  const CW = s.W - 0.14;
  /* The tyre's outer face stands 15 mm proud of the flank: flush, it
   * fights the body for the same pixels. */
  const track = s.W - 0.17;
  const roofFront = s.cab[1] - s.rakeF;
  const roofRear = s.cab[0] + s.rakeR;
  const side = s.side ?? [roofRear, roofFront];

  /* Lower body to the beltline, the valance under it, the nose and tail
   * raked off the top where there is a bonnet or a boot to rake. */
  P.push(colour, box(s.L, s.waist - s.sill, s.W), 0, (s.sill + s.waist) / 2, 0);
  P.push(s.cladding ? PAINT.dark : deep, box(s.L - 0.16, s.sill - 0.1, s.W - 0.07), 0, (s.sill + 0.1) / 2 + 0.05, 0);
  if (s.L / 2 - s.cab[1] > 0.55) {
    panel(P, colour, s.L / 2 - 0.01, s.waist - 0.15, s.L / 2 - 0.46, s.waist + 0.01, s.W - 0.05, 0.13);
  }
  if (s.cab[0] + s.L / 2 > 0.45) {
    panel(P, colour, -s.L / 2 + 0.01, s.waist - 0.1, -s.L / 2 + 0.3, s.waist + 0.01, s.W - 0.05, 0.11);
  }

  /* The cabin: a core between the roof edges, the screens as wedges off
   * it, the roof cap for a crisp top line. */
  P.push(colour, box(roofFront - roofRear, s.roof - s.waist, CW), (roofFront + roofRear) / 2, (s.waist + s.roof) / 2, 0);
  panel(P, colour, s.cab[1], s.waist, roofFront, s.roof, CW, 0.11);
  panel(P, colour, s.cab[0], s.waist, roofRear, s.roof, CW, 0.11);
  P.push(colour, box(roofFront - roofRear + 0.05, 0.05, CW + 0.03), (roofFront + roofRear) / 2, s.roof - 0.015, 0);

  /* Glass laid ON the wedge faces, 62 mm outward, shortened so the body
   * frames it. Written along the wedge's own centreline the screen is
   * inside the body and every car has a painted windscreen. */
  const cx = (roofFront + roofRear) / 2;
  const cy = (s.waist + s.roof) / 2;
  const lay = (ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    let nx = uy;
    let ny = -ux;
    if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const o = 0.062;
    const k = 0.05;
    panel(P, PAINT.glass, ax + ux * k + nx * o, ay + uy * k + ny * o, bx - ux * k + nx * o, by - uy * k + ny * o, CW - 0.15, 0.055);
  };
  lay(s.cab[1], s.waist + 0.05, roofFront, s.roof - 0.045);
  lay(s.cab[0], s.waist + 0.05, roofRear, s.roof - 0.045);

  /* Side glass, one pane a side proud of the core, pillars painted over
   * it. `side` is what makes the van a van. */
  const gy0 = s.waist + 0.035;
  const gy1 = s.roof - 0.075;
  const gx0 = Math.max(side[0], roofRear) + 0.04;
  const gx1 = Math.min(side[1], roofFront) - 0.04;
  for (const t of [-1, 1]) {
    P.push(PAINT.glass, box(gx1 - gx0, gy1 - gy0, 0.05), (gx0 + gx1) / 2, (gy0 + gy1) / 2, t * (CW / 2 - 0.006));
    for (const px of s.pillars) {
      if (px > gx0 + 0.06 && px < gx1 - 0.06) {
        P.push(colour, box(0.075, gy1 - gy0 + 0.02, 0.05), px, (gy0 + gy1) / 2, t * (CW / 2 - 0.002));
      }
    }
    /* Door seams and handles on the flank, the sliding door and rear
     * door lines on the van's blank sides. */
    const z = t * (HW + 0.004);
    for (const px of s.seams ?? []) {
      P.push(PAINT.dark, box(0.022, s.roof - s.sill - 0.5, 0.02), px, (s.sill + s.roof) / 2 + 0.05, z);
    }
    for (const px of s.handles) {
      P.push(PAINT.chrome, box(0.15, 0.045, 0.035), px, s.waist - 0.15, z + t * 0.012);
    }
    P.push(deep, box(s.L - 0.5, 0.06, 0.03), 0, s.sill + 0.03, z);
    /* Mirrors on stalks off the A pillar foot, the one thing that breaks
     * the plan silhouette. */
    const mx = s.cab[1] - 0.14;
    const my = s.waist + 0.14;
    P.push(deep, box(0.07, 0.05, 0.19), mx, my, t * (HW + 0.075));
    P.push(deep, box(0.1, 0.16, 0.07), mx - 0.01, my + 0.03, t * (HW + 0.17));
    P.push(PAINT.dark, box(0.34, 0.022, 0.022), s.cab[1] - 0.2, s.waist + 0.035, t * 0.28, 0, 0, 0.12);
    if (s.rails) {
      P.push(deep, box(roofFront - roofRear - 0.25, 0.05, 0.05), cx, s.roof + 0.045, t * (CW / 2 - 0.16));
    }
  }

  /* Bumpers in body colour with a dark rub strip, lamps hard into the
   * corners so they carry the width, the grille, the Swiss plates. */
  const lampY = Math.min(s.waist - 0.17, s.sill + 0.36);
  const lz = s.W / 2 - 0.2;
  for (const [sx, front] of [[1, true], [-1, false]]) {
    const x = sx * (s.L / 2);
    P.push(colour, box(0.1, 0.36, s.W - 0.02), x + sx * 0.04, s.sill + 0.12, 0);
    P.push(PAINT.dark, box(0.05, 0.07, s.W - 0.46), x + sx * 0.08, s.sill + 0.04, 0);
    for (const t of [-1, 1]) {
      if (front) {
        P.push(PAINT.lampF, box(0.05, 0.16, 0.32), x + 0.015, lampY, t * lz);
      } else {
        P.push(PAINT.lampR, box(0.05, 0.21, 0.155), x - 0.015, lampY + 0.05, t * lz);
        P.push(PAINT.dark, box(0.055, 0.028, 0.165), x - 0.02, lampY + 0.05, t * lz);
      }
    }
    if (front) {
      P.push(PAINT.dark, box(0.04, 0.15, s.W - 0.66), x + 0.02, lampY + 0.01, 0);
      P.push(PAINT.dark, box(0.05, 0.13, s.W - 0.5), x + 0.05, s.sill + 0.16, 0);
      P.push(PAINT.white, box(0.02, 0.08, 0.3), x + 0.1, s.sill + 0.13, 0);
    } else {
      P.push(PAINT.dark, box(0.03, 0.022, s.W - 0.3), x - 0.025, s.sill + 0.3, 0);
      P.push(PAINT.white, box(0.02, 0.11, 0.5), x - 0.1, s.sill + 0.14, 0);
    }
  }
  P.push(PAINT.chrome, cylZ(0.033, 0.14, 8), -s.L / 2 - 0.02, s.sill - 0.05, -(s.W / 2 - 0.32), Math.PI / 2);

  const wheels = [];
  for (const ax of s.axle) {
    for (const t of [-1, 1]) {
      arch(P, ax, s.R, t, s.cladding ? PAINT.dark : deep, HW);
      wheels.push({ x: ax, z: t * track / 2, r: s.R, w: 0.2 });
    }
  }
  return wheels;
}

/* A car of one of the CARS kinds in a colour. */
export function buildCar(kind, colour) {
  const s = CARS[kind];
  const P = makeParts();
  const wheels = car(P, s, colour);
  return { parts: P, wheels, size: { L: s.L, W: s.W, H: s.roof + (s.rails ? 0.07 : 0) } };
}

/*
 * The PostAuto: a 10.6 m low floor bus in the PostAuto yellow with the
 * cream roof, the black skirt and bumpers, a glass band the length of
 * both flanks, two doors on the right, the destination box over the
 * screen and the posthorn on each flank.
 */
export function buildPostbus() {
  const P = makeParts();
  const L = 10.6;
  const W = 2.5;
  const HW = W / 2;
  const sill = 0.36;
  const waist = 1.32;
  const roof = 3.05;
  const R = 0.5;
  const Y = PAINT.postYellow;
  const midY = (waist + roof) / 2;

  /* The lower body runs the full length; the upper body stops short of
   * the front, where a prism with the raked profile takes over so the
   * screen has a face to lie on and the corners are closed. */
  P.push(Y, box(L, waist - sill, W), 0, (sill + waist) / 2, 0);
  P.push(Y, box(L - 0.4, roof - waist, W - 0.06), -0.2, midY, 0);
  P.push(Y, extrudeZ([[L / 2 - 0.4, waist], [L / 2, waist], [L / 2 - 0.28, roof], [L / 2 - 0.4, roof]], W - 0.06), 0, 0, 0);
  P.push(PAINT.black, box(L - 0.2, 0.16, W + 0.01), 0, sill + 0.08, 0);
  /* The roof: cream, stepped twice so its edge reads as rounded from the
   * air, and the air conditioning pod. */
  P.push(PAINT.cream, box(L - 0.1, 0.16, W - 0.1), 0, roof + 0.08, 0);
  P.push(PAINT.cream, box(L - 0.6, 0.12, W - 0.6), 0, roof + 0.22, 0);
  P.push(PAINT.cream, box(1.8, 0.26, 1.6), -2.0, roof + 0.4, 0);

  /* The glass band, a pillar every window, the doors on the right. */
  for (const t of [-1, 1]) {
    P.push(PAINT.glass, box(9.9, roof - waist - 0.22, 0.05), -0.3, midY + 0.02, t * (HW - 0.02));
    for (const x of [-4.2, -2.6, -1.0, 0.6, 2.2, 3.8]) {
      P.push(Y, box(0.09, roof - waist - 0.2, 0.05), x, midY + 0.02, t * (HW - 0.0));
    }
    /* The posthorn: a black ring with its straight tube above, behind
     * the rear axle where PostAuto paints it. */
    P.push(PAINT.black, new THREE.TorusGeometry(0.24, 0.035, 6, 16), -4.3, 0.84, t * (HW + 0.02));
    P.push(PAINT.black, box(0.34, 0.05, 0.03), -4.15, 1.1, t * (HW + 0.02));
    /* Mirrors, on long arms, the way a bus wears them. */
    P.push(PAINT.black, box(0.06, 0.06, 0.5), L / 2 - 0.45, waist + 1.0, t * (HW + 0.25));
    P.push(PAINT.black, box(0.12, 0.5, 0.22), L / 2 - 0.45, waist + 0.78, t * (HW + 0.47));
  }
  for (const x of [4.05, -0.7]) {
    P.push(PAINT.dark, box(1.24, roof - sill - 0.3, 0.04), x, (sill + roof) / 2, HW + 0.006);
    P.push(PAINT.glass, box(1.0, roof - waist - 0.35, 0.05), x, midY - 0.02, HW + 0.022);
    P.push(PAINT.dark, box(0.03, roof - sill - 0.3, 0.06), x, (sill + roof) / 2, HW + 0.03);
  }

  /* The front: a wedge from the bumper to the roof, glass laid on it,
   * the destination box over the top. */
  panel(P, PAINT.glass, L / 2 + 0.06, waist + 0.1, L / 2 - 0.22, roof - 0.34, W - 0.3, 0.05);
  P.push(PAINT.black, box(0.12, 0.3, 1.9), L / 2 - 0.22, roof - 0.17, 0);
  P.push(PAINT.lampF, box(0.03, 0.2, 1.7), L / 2 - 0.15, roof - 0.17, 0);
  P.push(PAINT.black, box(0.16, 0.42, W - 0.02), L / 2 + 0.02, sill + 0.14, 0);
  P.push(PAINT.black, box(0.16, 0.42, W - 0.02), -L / 2 - 0.02, sill + 0.14, 0);
  P.push(PAINT.dark, box(0.04, 0.9, 1.6), -L / 2 - 0.02, sill + 0.75, 0);
  for (const t of [-1, 1]) {
    P.push(PAINT.lampF, box(0.05, 0.22, 0.5), L / 2 + 0.09, sill + 0.68, t * (HW - 0.42));
    P.push(PAINT.lampR, box(0.05, 0.4, 0.22), -L / 2 - 0.1, sill + 0.95, t * (HW - 0.25));
  }
  P.push(PAINT.white, box(0.02, 0.11, 0.5), L / 2 + 0.11, sill + 0.14, 0);
  P.push(PAINT.white, box(0.02, 0.11, 0.5), -L / 2 - 0.11, sill + 0.14, 0);

  const wheels = [];
  for (const ax of [3.2, -2.7]) {
    for (const t of [-1, 1]) {
      arch(P, ax, R, t, PAINT.black, HW);
      wheels.push({ x: ax, z: t * (HW - 0.135), r: R, w: 0.3 });
    }
  }
  return { parts: P, wheels, size: { L, W, H: roof + 0.55 } };
}

/*
 * The tractor: a red bonnet over a dark chassis, a glazed cab with a
 * pale roof, big rear wheels under red fenders, an exhaust stack up the
 * right of the bonnet. Hürlimann red, the valley's own make.
 */
export function buildTractor() {
  const P = makeParts();
  const red = PAINT.red;
  const deep = shade(red, 0.76);
  P.push(PAINT.dark, box(3.3, 0.3, 0.7), 0.1, 0.72, 0);
  P.push(PAINT.dark, box(0.16, 0.14, 1.4), 1.25, 0.45, 0);
  P.push(red, box(1.7, 0.7, 0.86), 1.25, 1.22, 0);
  P.push(deep, box(1.74, 0.05, 0.9), 1.25, 1.6, 0);
  P.push(PAINT.dark, box(0.06, 0.5, 0.7), 2.13, 1.18, 0);
  for (const t of [-1, 1]) {
    P.push(PAINT.lampF, box(0.04, 0.12, 0.14), 2.15, 1.45, t * 0.28);
    P.push(PAINT.lampR, box(0.04, 0.1, 0.12), -1.62, 1.1, t * 0.5);
  }
  P.push(PAINT.dark, new THREE.CylinderGeometry(0.045, 0.045, 1.5, 8), 1.4, 2.3, 0.36);
  P.push(PAINT.dark, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), 1.4, 3.08, 0.36, 0, 0, Math.PI / 2);
  /* The cab: a red floor mass, four dark pillars, glass between, a
   * cream roof; the seat inside is what stops it reading as empty. */
  P.push(red, box(1.7, 0.7, 1.5), -0.45, 1.25, 0);
  for (const x of [-1.25, 0.35]) {
    for (const t of [-1, 1]) {
      P.push(PAINT.dark, box(0.08, 1.3, 0.08), x, 2.25, t * 0.72);
    }
  }
  P.push(PAINT.glass, box(0.04, 1.2, 1.4), 0.36, 2.25, 0);
  P.push(PAINT.glass, box(0.04, 1.2, 1.4), -1.26, 2.25, 0);
  for (const t of [-1, 1]) {
    P.push(PAINT.glass, box(1.5, 1.2, 0.04), -0.45, 2.25, t * 0.73);
  }
  P.push(PAINT.cream, box(1.9, 0.12, 1.7), -0.45, 2.95, 0);
  P.push(PAINT.dark, box(0.5, 0.5, 0.5), -0.6, 1.8, 0);
  P.push(PAINT.dark, box(0.5, 0.06, 0.5), -0.35, 2.05, 0, 0, 0, 0.5);
  for (const t of [-1, 1]) {
    P.push(red, box(1.4, 0.32, 0.56), -0.9, 1.78, t * 0.95);
  }
  P.push(PAINT.dark, box(0.3, 0.1, 0.24), -1.62, 0.6, 0);
  P.push(PAINT.dark, box(0.12, 0.12, 0.12), -1.8, 0.6, 0);
  const wheels = [];
  for (const t of [-1, 1]) {
    wheels.push({ x: -0.9, z: t * 0.95, r: 0.85, w: 0.5 });
    wheels.push({ x: 1.25, z: t * 0.72, r: 0.45, w: 0.26 });
  }
  return { parts: P, wheels, size: { L: 3.9, W: 2.4, H: 3.1 } };
}

/* The hay trailer: a green body on a dark chassis, one axle, a drawbar
 * out the front to the tractor's hitch, three round bales on the bed.
 * The hitch eye is at HITCH on x and the axle at the origin. */
export const TRAILER_HITCH = 3.4;
export function buildTrailer() {
  const P = makeParts();
  const green = PAINT.green;
  P.push(PAINT.dark, box(3.4, 0.15, 0.6), 0, 0.82, 0);
  P.push(PAINT.dark, box(1.9, 0.1, 0.12), 2.45, 0.66, 0, 0, 0, 0.09);
  P.push(green, box(3.6, 0.1, 1.9), 0, 0.95, 0);
  for (const t of [-1, 1]) {
    P.push(green, box(3.6, 0.5, 0.05), 0, 1.25, t * 0.925);
    P.push(shade(green, 0.7), box(0.5, 0.2, 0.3), 0, 1.02, t * 0.95);
  }
  for (const x of [-1.8, 1.8]) {
    P.push(green, box(0.05, 0.5, 1.9), x, 1.25, 0);
  }
  for (const x of [-1.15, 0.05, 1.25]) {
    P.push(PAINT.hay, cylZ(0.58, 1.2, 12), x, 1.58, 0);
  }
  P.push(PAINT.lampR, box(0.03, 0.1, 0.14), -1.83, 1.1, 0.8);
  P.push(PAINT.lampR, box(0.03, 0.1, 0.14), -1.83, 1.1, -0.8);
  const wheels = [{ x: 0, z: 0.82, r: 0.45, w: 0.26 }, { x: 0, z: -0.82, r: 0.45, w: 0.26 }];
  return { parts: P, wheels, size: { L: 3.7, W: 1.9, H: 2.2 } };
}

/*
 * A motorbike and its rider. The rider is what says "motorbike" from
 * the air; without one it is a bicycle with a tank.
 */
export function buildMotorbike(colour) {
  const P = makeParts();
  P.push(PAINT.dark, box(1.05, 0.1, 0.12), -0.05, 0.5, 0);
  P.push(PAINT.dark, box(0.5, 0.36, 0.36), 0.05, 0.42, 0);
  P.push(colour, box(0.52, 0.28, 0.32), 0.3, 0.8, 0);
  P.push(PAINT.black, box(0.62, 0.1, 0.3), -0.32, 0.82, 0);
  P.push(colour, box(0.4, 0.06, 0.28), -0.62, 0.72, 0);
  for (const t of [-1, 1]) {
    P.push(PAINT.dark, box(0.03, 0.72, 0.03), 0.57, 0.65, t * 0.07, 0, 0, 0.42);
  }
  P.push(PAINT.dark, box(0.05, 0.03, 0.62), 0.42, 1.02, 0);
  P.push(PAINT.lampF, box(0.05, 0.14, 0.14), 0.62, 0.9, 0);
  P.push(PAINT.lampR, box(0.03, 0.06, 0.12), -0.84, 0.76, 0);
  P.push(PAINT.chrome, new THREE.CylinderGeometry(0.045, 0.04, 0.9, 8), -0.25, 0.36, 0.18, 0, 0, Math.PI / 2);
  /* The rider: legs down to the pegs, a jacket leaning into the bars,
   * arms out to them, a white helmet. */
  for (const t of [-1, 1]) {
    P.push(PAINT.dark, box(0.12, 0.5, 0.12), -0.12, 0.6, t * 0.2, 0, 0, 0.25);
    P.push(PAINT.black, box(0.55, 0.09, 0.09), 0.2, 1.05, t * 0.2, 0, 0, -0.35);
  }
  P.push(PAINT.black, box(0.3, 0.56, 0.38), -0.08, 1.14, 0, 0, 0, -0.35);
  P.push(PAINT.white, new THREE.SphereGeometry(0.15, 10, 8), 0.12, 1.5, 0);
  const wheels = [{ x: 0.72, z: 0, r: 0.32, w: 0.12 }, { x: -0.72, z: 0, r: 0.32, w: 0.14 }];
  return { parts: P, wheels, size: { L: 2.1, W: 0.8, H: 1.65 } };
}

/*
 * The light aircraft on the apron: a high wing two seater of the Piper
 * Cub kind, in Cub yellow, on a tailwheel. Authored level with the
 * origin under the main wheels, then pitched nose up about them until
 * the tailwheel sits on the ground, which is how a Cub stands. It never
 * moves, so its wheels are parts rather than a list.
 */
export function buildAircraft() {
  const P = makeParts();
  const Y = PAINT.cubYellow;
  const deep = shade(Y, 0.78);
  /* Fuselage: cabin, nose, a four sided taper to the tail post. */
  P.push(Y, box(1.8, 1.2, 0.8), 0.9, 1.45, 0);
  P.push(Y, box(1.3, 0.9, 0.74), 2.45, 1.4, 0);
  P.push(PAINT.dark, box(0.9, 0.08, 0.5), 2.5, 1.86, 0);
  const taper = new THREE.CylinderGeometry(0.56, 0.14, 4.5, 4, 1);
  /* Square section with flat faces, then laid along x wide end forward. */
  taper.rotateY(Math.PI / 4);
  taper.rotateZ(-Math.PI / 2);
  P.push(Y, taper, -2.25, 1.5, 0);
  /* Tail: fin and rudder as one profile, the stabiliser a plate. */
  const fin = new THREE.Shape();
  fin.moveTo(-3.6, 1.6);
  fin.lineTo(-4.3, 2.9);
  fin.lineTo(-4.9, 2.9);
  fin.lineTo(-5.0, 1.6);
  fin.lineTo(-3.6, 1.6);
  P.push(Y, new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false }), 0, 0, -0.03);
  P.push(Y, box(1.0, 0.05, 2.9), -4.5, 1.62, 0);
  /* The wing over the cabin, a strut pair each side down to the lower
   * longeron. Aileron lines as dark strips on the trailing edge. */
  P.push(Y, box(1.6, 0.15, 10.7), 1.25, 2.3, 0);
  P.push(deep, box(0.02, 0.16, 3.6), 0.46, 2.3, 3.4);
  P.push(deep, box(0.02, 0.16, 3.6), 0.46, 2.3, -3.4);
  for (const t of [-1, 1]) {
    for (const x of [0.75, 1.65]) {
      const dz = 3.3;
      const dy = 1.25;
      const len = Math.hypot(dz, dy);
      P.push(PAINT.dark, box(0.06, len, 0.1), x, 0.97 + dy / 2, t * dz / 2, 0, t * Math.atan2(dz, dy), 0);
    }
  }
  /* Glass: the windscreen laid on the cabin front, side windows, the
   * skylight the Cub has over the seats. */
  panel(P, PAINT.glass, 1.85, 1.9, 1.5, 2.22, 0.78, 0.05);
  for (const t of [-1, 1]) {
    P.push(PAINT.glass, box(1.4, 0.55, 0.04), 0.85, 1.8, t * 0.41);
  }
  P.push(PAINT.glass, box(0.9, 0.03, 0.6), 0.9, 2.07, 0);
  /* Engine: the cowl cheeks, the exhaust, the spinner and two blades. */
  for (const t of [-1, 1]) {
    P.push(deep, box(0.7, 0.4, 0.1), 2.6, 1.3, t * 0.4);
  }
  P.push(PAINT.dark, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), 2.6, 0.9, 0.2, 0, 0, Math.PI / 2);
  const spinner = new THREE.ConeGeometry(0.12, 0.3, 10);
  spinner.rotateZ(-Math.PI / 2);
  P.push(PAINT.chrome, spinner, 3.25, 1.4, 0);
  P.push(PAINT.dark, box(0.05, 1.8, 0.14), 3.13, 1.4, 0, 0, 0.3, 0);
  /* Gear: legs out to the mains, the tailwheel on its spring. */
  for (const t of [-1, 1]) {
    P.push(PAINT.dark, box(0.06, 1.1, 0.06), 0.15, 0.65, t * 0.55, 0, -t * 0.9, 0);
    P.push(PAINT.dark, box(0.06, 0.8, 0.06), 0.65, 0.6, t * 0.5, 0, -t * 0.8, 0.5);
    P.push(PAINT.tyre, cylZ(0.3, 0.16, 14), 0, 0.3, t * 0.98);
    P.push(PAINT.rim, cylZ(0.14, 0.18, 10), 0, 0.3, t * 0.98);
  }
  P.push(PAINT.dark, box(0.06, 0.5, 0.06), -4.7, 1.18, 0, 0, 0, 0.25);
  P.push(PAINT.tyre, cylZ(0.1, 0.06, 10), -4.75, 0.98, 0);
  /* The pitch: the Cub sits eleven degrees nose up on its tailwheel, so
   * the tail that was authored a metre off the ground comes down to it. */
  const geometry = bakeParts(P);
  geometry.rotateZ(0.19);
  return { geometry, size: { L: 8.3, W: 10.7, H: 2.6 } };
}
