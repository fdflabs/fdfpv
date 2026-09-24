/*
 * cars.js: the hatchbacks, the estate and the delivery van, near.
 *
 * The cel car's own table (alps/vehicles.js CARS) sets every dimension:
 * the length and width, the wheels, the sill, the beltline and the roof,
 * where the glasshouse meets the body and how far its roof sits back.
 * On those numbers a car is built as one is: a body swept from nose to
 * tail (kit.js sweep) whose top is the bonnet, the belt and the boot,
 * rounded in plan at the corners and in profile at the bumpers, with
 * the wheel arches cut out of it; a glasshouse on it of glass between
 * pillars, leaning in toward the roof; the seats, the dashboard and the
 * wheel inside where the glass lets them show; the shut lines of the
 * doors, the bonnet and the tailgate; lamps with a lens over a reflector,
 * the daytime running lights on, Swiss plates, mirrors on the doors.
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
import { CARS } from '../../alps/vehicles.js';
import { makeKit, FIN, round, sweep, poly, strut, box, cylZ, v3 } from './kit.js';

/* The distance a car is drawn near within. */
const NEAR = 45;


/* How the lower body runs. Everything is the cel table's but these, which
 * a table of boxes did not need. */
const SHAPE = {
  hatch: { yb: 0.2, bonnet: 0.1, noseR: 0.24, tailR: 0.14, plan: 0.34, tail: 0.02 },
  estate: { yb: 0.24, bonnet: 0.11, noseR: 0.25, tailR: 0.12, plan: 0.36, tail: 0 },
  van: { yb: 0.26, bonnet: 0.14, noseR: 0.28, tailR: 0.08, plan: 0.3, tail: 0, cargo: true },
};

/*
 * Stations for the lower body, sill to belt. The top is the bonnet
 * falling to the nose, the belt under the glasshouse and the boot; the
 * bottom rises over each wheel as an arch and tucks under at the bumpers;
 * the width comes in round the corners.
 */
function lowerBody(s, sh) {
  const xF = s.L / 2;
  const xR = -s.L / 2;
  const Ra = s.R + 0.06;
  const xs = new Set();
  for (let x = xR; x <= xF + 1e-6; x += 0.22) {
    xs.add(+x.toFixed(3));
  }
  for (const u of [0, 0.03, 0.08, 0.15, 0.25, 0.36]) {
    xs.add(+(xF - u).toFixed(3));
    xs.add(+(xR + u).toFixed(3));
  }
  for (const ax of s.axle) {
    for (let k = -4; k <= 4; k += 1) {
      xs.add(+(ax + (k / 4) * Ra).toFixed(3));
    }
    xs.add(+(ax - Ra - 0.02).toFixed(3));
    xs.add(+(ax + Ra + 0.02).toFixed(3));
  }
  const list = [...xs].filter((x) => x >= xR && x <= xF).sort((a, b) => a - b);
  const top = (x) => {
    if (x > s.cab[1]) {
      const t = (x - s.cab[1]) / (xF - s.cab[1]);
      return s.waist - sh.bonnet * t * t;
    }
    if (x < s.cab[0]) {
      return s.waist - sh.tail;
    }
    return s.waist;
  };
  return list.map((x) => {
    const uF = xF - x;
    const uR = x - xR;
    let y0 = sh.yb + round(0.16, Math.min(uF, uR)) * 0.9;
    let y1 = top(x) - (uF < uR ? round(sh.noseR, uF) : round(sh.tailR, uR));
    for (const ax of s.axle) {
      const d = Math.abs(x - ax);
      if (d < Ra) {
        y0 = Math.max(y0, s.R + Math.sqrt(Ra * Ra - d * d));
      }
    }
    y1 = Math.max(y1, y0 + 0.12);
    const hw = s.W / 2 - round(sh.plan, Math.min(uF, uR));
    return { x, y0, y1, hw, hwT: hw - 0.05, rb: 0.05, rt: Math.min(0.12, (y1 - y0) / 2 - 0.01) };
  });
}

/* The front of the body at height y: the furthest station whose section
 * reaches it, for laying a lamp or a plate on the face. */
function faceX(stations, y, dir) {
  let best = dir > 0 ? -Infinity : Infinity;
  for (const st of stations) {
    if (y >= st.y0 && y <= st.y1) {
      best = dir > 0 ? Math.max(best, st.x) : Math.min(best, st.x);
    }
  }
  return best;
}

/* A Swiss plate: white, the canton's letters and the number in black,
 * the Swiss and the canton's shields at the ends. Laid on a face whose
 * outward normal is +x at the origin; the caller turns it. */
function plate(K, x, y, dir, long) {
  const w = long ? 0.5 : 0.3;
  const h = long ? 0.11 : 0.16;
  K.push(FIN.plate, box(0.012, h, w), x, y, 0);
  const n = long ? 8 : 5;
  for (let k = 0; k < n; k += 1) {
    const z = -w / 2 + 0.09 + (k + 0.5) * ((w - 0.18) / n);
    K.push(FIN.plateInk, box(0.006, h * 0.52, (w - 0.18) / n * 0.62), x + dir * 0.008, y, z);
  }
  K.push({ ...FIN.plate, c: 0xc81414 }, box(0.006, h * 0.5, 0.05), x + dir * 0.008, y, -w / 2 + 0.045);
  K.push({ ...FIN.plate, c: 0xc81414 }, box(0.006, h * 0.5, 0.05), x + dir * 0.008, y, w / 2 - 0.045);
}

/* A seat: cushion, back and head rest, facing +x, at (x, y, z). */
function seat(K, x, y, z, w = 0.5) {
  K.push(FIN.seat, box(0.5, 0.12, w), x + 0.05, y, z);
  K.push(FIN.seat, box(0.12, 0.62, w - 0.02), x - 0.2, y + 0.33, z, 0, 0, 0.22);
  K.push(FIN.seat, box(0.1, 0.18, w * 0.5), x - 0.29, y + 0.74, z, 0, 0, 0.18);
}

export function car(kind, colour) {
  const s = CARS[kind];
  const sh = SHAPE[kind];
  const K = makeKit();
  const G = makeKit();
  const paint = FIN.paint(colour);
  const trimSide = s.cladding ? FIN.plastic : paint;
  const xF = s.L / 2;
  const xR = -s.L / 2;
  const HW = s.W / 2;
  const Ra = s.R + 0.06;

  const st = lowerBody(s, sh);
  K.push(paint, sweep(st));

  /* The wheel wells between each pair of wheels, so the arches are not
   * windows through the car. */
  const track = s.W - 0.17;
  for (const ax of s.axle) {
    K.push(FIN.well, box(Ra * 1.7, Ra * 0.9, track - 0.24), ax, s.R + Ra * 0.5, 0);
    for (const t of [-1, 1]) {
      /* The arch's lip, black on the estate's cladding, a painted edge
       * on the others. */
      const lip = new THREE.TorusGeometry(Ra + 0.005, 0.022, 3, 10, Math.PI);
      K.push(s.cladding ? FIN.plastic : paint, lip, ax, s.R, t * (HW - 0.03), 0, 0, 0, 1, 1, 2.2);
      lip.dispose();
    }
  }

  /* THE GLASSHOUSE. Its base at the belt, its roof the cel roof; the
   * sides lean in by the tumblehome, the front and rear lines are the
   * screens' rakes. */
  const yb = s.waist;
  const yt = s.roof;
  const zb = HW - 0.08;
  const zt = HW - 0.2;
  const roofF = s.cab[1] - s.rakeF;
  const roofR = s.cab[0] + s.rakeR;
  const cargo = sh.cargo;
  const rearX = cargo ? s.side[0] : s.cab[0];
  const rearTopX = cargo ? s.side[0] : roofR;
  const zAt = (y) => zb + (zt - zb) * ((y - yb) / (yt - yb));
  const frontAt = (y) => s.cab[1] + (roofF - s.cab[1]) * ((y - yb) / (yt - yb));
  const rearAt = (y) => rearX + (rearTopX - rearX) * ((y - yb) / (yt - yb));

  /* The roof: a thin swept panel, its edges turned, over a headliner. */
  const roofSt = [];
  const r0 = rearTopX - (cargo ? 0 : 0.04);
  const r1 = roofF + 0.05;
  for (let k = 0; k <= 10; k += 1) {
    const x = r0 + ((r1 - r0) * k) / 10;
    const u = Math.min(x - r0, r1 - x);
    const hw = zt + 0.03 - round(0.12, u) * 0.4;
    roofSt.push({ x, y0: yt - 0.075 + round(0.06, u) * 0.3, y1: yt - round(0.08, u) * 0.5, hw, hwT: hw - 0.04, rb: 0.02, rt: 0.045 });
  }
  K.push(paint, sweep(roofSt, 2));
  K.push(FIN.headliner, box(r1 - r0 - 0.1, 0.01, 2 * zt - 0.06), (r0 + r1) / 2, yt - 0.08, 0);

  /* Glass: the screen, the rear window, a pane each side. */
  const gy0 = yb + 0.025;
  const gy1 = yt - 0.06;
  G.push(FIN.lens, poly([
    v3(frontAt(gy0), gy0, -zAt(gy0) + 0.04), v3(frontAt(gy0), gy0, zAt(gy0) - 0.04),
    v3(frontAt(gy1), gy1, zAt(gy1) - 0.04), v3(frontAt(gy1), gy1, -zAt(gy1) + 0.04),
  ], v3(1, 0.6, 0)));
  if (!cargo) {
    G.push(FIN.lens, poly([
      v3(rearAt(gy0), gy0 + 0.02, -zAt(gy0) + 0.06), v3(rearAt(gy0), gy0 + 0.02, zAt(gy0) - 0.06),
      v3(rearAt(gy1), gy1, zAt(gy1) - 0.06), v3(rearAt(gy1), gy1, -zAt(gy1) + 0.06),
    ], v3(-1, 0.5, 0)));
  }
  for (const t of [-1, 1]) {
    const pts = [
      v3(rearAt(gy0) + 0.03, gy0, t * zAt(gy0)), v3(frontAt(gy0) - 0.03, gy0, t * zAt(gy0)),
      v3(frontAt(gy1) - 0.03, gy1, t * zAt(gy1)), v3(rearAt(gy1) + 0.03, gy1, t * zAt(gy1)),
    ];
    G.push(FIN.lens, poly(pts, v3(0, 0.2, t)));
  }

  /* The pillars. The A pillars and the rear ones in the body colour,
   * the B pillars black between the door glass, as a modern car has
   * them; the last pillar of a hatch or an estate is a broad painted
   * quarter. */
  for (const t of [-1, 1]) {
    const Z = (y) => t * (zAt(y) + 0.012);
    strut(K, paint, v3(frontAt(yb), yb, Z(yb)), v3(frontAt(yt - 0.02), yt - 0.02, Z(yt - 0.02)), 0.075, 0.05);
    if (!cargo) {
      strut(K, paint, v3(rearAt(yb) + 0.03, yb, Z(yb)), v3(rearAt(yt - 0.02) + 0.03, yt - 0.02, Z(yt - 0.02)), 0.12, 0.05);
    }
    /* The screen's pillars from the front, over the glass's edge. */
    strut(K, paint, v3(frontAt(yb) + 0.01, yb, t * (zAt(yb) - 0.02)), v3(frontAt(yt) + 0.005, yt - 0.03, t * (zAt(yt) - 0.02)), 0.05, 0.07);
    const last = s.pillars.length - 1;
    s.pillars.forEach((px, i) => {
      const quarter = !cargo && i === last && px < -0.6;
      const topX = px + (quarter ? (rearTopX - rearX) * 0.35 : -0.03);
      const lo = v3(px, yb, Z(yb));
      const hi = v3(topX, yt - 0.03, Z(yt - 0.03));
      if (quarter) {
        /* The painted quarter panel from this pillar back to the rear
         * line: the glass behind it is covered. */
        K.push(paint, poly([
          v3(rearAt(gy0) + 0.02, gy0 - 0.03, Z(gy0) * 1.0 + t * 0.004), v3(px, gy0 - 0.03, Z(gy0) + t * 0.004),
          v3(topX, gy1 + 0.03, Z(gy1) + t * 0.004), v3(rearAt(gy1) + 0.02, gy1 + 0.03, Z(gy1) + t * 0.004),
        ], v3(0, 0, t)));
        strut(K, paint, lo, hi, 0.1, 0.045);
      } else {
        strut(K, FIN.trim, lo, hi, 0.075, 0.035);
      }
    });
    /* The belt's black seal under the side glass, and the rail over it. */
    strut(K, FIN.trim, v3(rearAt(yb) + 0.02, yb + 0.012, t * (zb + 0.012)), v3(frontAt(yb) - 0.02, yb + 0.012, t * (zb + 0.012)), 0.022, 0.03);
    strut(K, FIN.trim, v3(rearAt(gy1) + 0.02, gy1 + 0.02, t * (zAt(gy1) + 0.01)), v3(frontAt(gy1) - 0.02, gy1 + 0.02, t * (zAt(gy1) + 0.01)), 0.02, 0.025);
  }

  /* The cargo box of the van: the whole body above the belt from the
   * cab's back wall to the tail, square with a turned roof. */
  if (cargo) {
    const cs = [];
    const c0 = xR;
    const c1 = s.side[0];
    const n = 14;
    for (let k = 0; k <= n; k += 1) {
      const x = c0 + ((c1 - c0) * k) / n;
      const u = x - c0;
      const hw = HW - 0.015 - round(0.1, u);
      cs.push({ x, y0: yb - 0.06, y1: yt - round(0.06, u) * 0.6, hw, hwT: zt + 0.03, rb: 0.02, rt: 0.16 });
    }
    K.push(paint, sweep(cs));
    for (const t of [-1, 1]) {
      /* The sliding door's seams and the track it runs in. */
      for (const px of (s.seams ?? []).filter((x) => x > xR + 0.3)) {
        strut(K, FIN.trim, v3(px, sh.yb + 0.1, t * (HW + 0.002)), v3(px, yt - 0.12, t * (HW - 0.05)), 0.01, 0.008);
      }
      strut(K, FIN.trim, v3(-1.4, yt - 0.85, t * (HW - 0.005)), v3(xR + 0.05, yt - 0.85, t * (HW - 0.005)), 0.03, 0.02);
    }
    /* The rear doors' centre seam and their handle. */
    strut(K, FIN.trim, v3(xR - 0.003, sh.yb + 0.15, 0), v3(xR - 0.003, yt - 0.1, 0), 0.01, 0.01);
    K.push(FIN.plastic, box(0.03, 0.04, 0.18), xR - 0.01, yb - 0.05, 0.12);
  }

  /* INSIDE: the seats (the driver on the left), the dashboard with its
   * wheel, the rear bench. Only what shows over the belt counts. */
  const seatX = Math.max(rearAt(yb) + 0.45, Math.min(s.pillars[0] - 0.05, roofF - 0.55));
  const seatY = yb - 0.04;
  for (const t of [-1, 1]) {
    seat(K, seatX, seatY, t * 0.38);
  }
  if (!cargo) {
    const benchX = seatX - 0.85;
    if (benchX > rearAt(yb) + 0.3) {
      seat(K, benchX, seatY, 0, 2 * zb - 0.25);
    }
  } else {
    /* The bulkhead behind the seats. */
    K.push(FIN.cabin, box(0.04, yt - yb, 2 * zt), s.side[0] + 0.03, (yb + yt) / 2, 0);
  }
  /* The cabin's floor over the body's painted top, which the glass
   * would otherwise show. */
  K.push(FIN.cabin, box(s.cab[1] - rearX - 0.1, 0.01, 2 * zb - 0.04), (s.cab[1] + rearX) / 2, yb + 0.005, 0);
  const dashX = s.cab[1] - 0.25;
  K.push(FIN.cabin, box(0.5, 0.14, 2 * zb - 0.1), dashX, yb + 0.03, 0);
  const wheel = new THREE.TorusGeometry(0.18, 0.018, 4, 16);
  K.push(FIN.trim, wheel, dashX - 0.28, yb + 0.2, -0.38, Math.PI / 2, 0, -0.45);
  wheel.dispose();

  /* THE FRONT. Lamps hard into the corners, each a lens over a chrome
   * reflector with the running light along its foot; the grille and the
   * air intake; the plate; the bonnet's shut line. */
  const lampY = s.waist - sh.bonnet - 0.12;
  const lampZ = HW - 0.24;
  const noseAtLamp = faceX(st, lampY, 1);
  for (const t of [-1, 1]) {
    const x = noseAtLamp - 0.05;
    K.push(FIN.chrome, box(0.1, 0.1, 0.3), x, lampY, t * lampZ, -t * 0.28);
    K.push(FIN.lens, box(0.1, 0.11, 0.33), x + 0.015, lampY + 0.005, t * lampZ, -t * 0.28);
    K.push(FIN.drl, box(0.1, 0.018, 0.3), x + 0.02, lampY - 0.06, t * lampZ, -t * 0.28);
  }
  const grilleY = lampY - 0.02;
  K.push(FIN.trim, box(0.06, 0.12, s.W - 0.8), faceX(st, grilleY, 1) - 0.02, grilleY, 0);
  const intakeY = sh.yb + 0.16;
  K.push(FIN.plastic, box(0.06, 0.1, s.W - 0.6), faceX(st, intakeY, 1) - 0.02, intakeY, 0);
  const plateY = sh.yb + 0.3;
  plate(K, faceX(st, plateY, 1) + 0.004, plateY, 1, false);
  for (const t of [-1, 1]) {
    /* The bonnet's shut lines where it meets the wings. */
    strut(K, FIN.trim, v3(s.cab[1] + 0.02, s.waist + 0.004, t * (HW - 0.2)), v3(xF - sh.noseR, s.waist - sh.bonnet * 0.8 + 0.004, t * (HW - 0.25)), 0.008, 0.008);
  }

  /* THE REAR. Lamps wrapped round the corners, the plate in its recess,
   * the bumper's black lower edge, the tailpipe; the tailgate's shut
   * line round the rear glass. */
  const tailY = s.waist - 0.14;
  const tailAt = faceX(st, tailY, -1);
  for (const t of [-1, 1]) {
    K.push(FIN.lensRed, box(0.08, 0.14, 0.34), tailAt + 0.05, tailY, t * (HW - 0.2), t * 0.2);
    K.push(FIN.lensAmber, box(0.08, 0.04, 0.2), tailAt + 0.045, tailY - 0.09, t * (HW - 0.2), t * 0.2);
    if (cargo) {
      K.push(FIN.lensRed, box(0.05, 0.55, 0.12), xR - 0.005, tailY + 0.36, t * (HW - 0.1));
    }
  }
  const rearPlateY = sh.yb + 0.34;
  plate(K, faceX(st, rearPlateY, -1) - 0.004, rearPlateY, -1, true);
  const bumperY = sh.yb + 0.08;
  K.push(FIN.plastic, box(0.08, 0.08, s.W - 0.4), faceX(st, bumperY, -1) + 0.05, bumperY, 0);
  K.push(FIN.chrome, cylZ(0.03, 0.12, 8), xR + 0.05, sh.yb + 0.02, -(HW - 0.35), Math.PI / 2);

  /* THE FLANKS: the door shut lines, the handles, the mirrors on the
   * doors, the sill. A line is a thin dark bar standing a hair off the
   * paint. */
  for (const t of [-1, 1]) {
    const flank = (x, y) => {
      const at = st.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
      const f = Math.min(1, Math.max(0, (y - at.y0 - at.rb) / Math.max(0.01, at.y1 - at.rt - at.y0 - at.rb)));
      return t * (at.hw + (at.hwT - at.hw) * f + 0.002);
    };
    const lines = cargo ? [s.cab[1] - 0.05, s.pillars[0]] : [s.cab[1] - 0.05, ...s.pillars.slice(0, s.pillars.length > 2 ? 2 : 1)];
    for (const px of lines) {
      const ya = sh.yb + 0.1;
      const yb2 = s.waist - 0.03;
      strut(K, FIN.trim, v3(px, ya, flank(px, ya)), v3(px, yb2, flank(px, yb2)), 0.008, 0.006);
    }
    for (const px of s.handles) {
      const hy = s.waist - 0.12;
      K.push(paint, box(0.15, 0.03, 0.03), px, hy, flank(px, hy) + t * 0.01);
    }
    /* The mirror: a painted housing on an arm, its glass facing back. */
    const mx = s.cab[1] - 0.12;
    const my = s.waist + 0.1;
    const reach = cargo ? 0.14 : 0.08;
    K.push(FIN.plastic, box(0.08, 0.05, HW + reach - zb), mx, my - 0.03, t * (zb + HW + reach) / 2);
    K.push(paint, box(0.1, cargo ? 0.2 : 0.11, 0.17), mx, my, t * (HW + reach));
    K.push(FIN.chrome, box(0.01, cargo ? 0.17 : 0.09, 0.14), mx - 0.051, my, t * (HW + reach));
    /* The sill, black plastic on the estate. */
    if (s.cladding) {
      strut(K, FIN.plastic, v3(s.axle[1] + Ra, sh.yb + 0.06, t * (HW - 0.01)), v3(s.axle[0] - Ra, sh.yb + 0.06, t * (HW - 0.01)), 0.1, 0.03);
    }
    if (s.rails) {
      const ry = yt + 0.04;
      strut(K, FIN.alloy, v3(r0 + 0.2, ry, t * (zt - 0.12)), v3(r1 - 0.25, ry, t * (zt - 0.12)), 0.035, 0.035);
      for (const x of [r0 + 0.22, r1 - 0.27]) {
        K.push(FIN.plastic, box(0.1, 0.05, 0.04), x, yt + 0.015, t * (zt - 0.12));
      }
    }
    /* The wipers, parked at the foot of the screen. */
    strut(K, FIN.trim, v3(frontAt(yb) + 0.06, yb + 0.03, t * 0.05 - 0.35), v3(frontAt(yb) + 0.02, yb + 0.05, t * 0.05 + 0.25), 0.014, 0.014);
  }

  return { body: K, glass: G, wheel: 'alloy', lod: kind === 'van' ? NEAR + 10 : NEAR };
}
