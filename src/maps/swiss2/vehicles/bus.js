/*
 * bus.js: the PostAuto, near.
 *
 * The cel bus's own numbers (10.6 m long, 2.5 m wide, 3.05 m to the
 * roof, the wheels where they are), built as the low floor buses the
 * PostAuto runs up the valleys are: the yellow body swept with its
 * corners turned, the arches cut for the wheels; the window band the
 * length of both flanks, tinted glass bonded flush with black frit
 * over the pillars, and the bus inside it (the seats in their rows, the
 * yellow grab poles, the ceiling with its handrails and lights, the
 * driver's seat and wheel); the roof turned down to the band and capped
 * cream, the air conditioning on it; two double doors on the right,
 * glazed, in black frames; the big screen and the destination display
 * over it, lit amber; the mirrors on their arms out in front of the
 * screen, as a bus wears them; the lamp clusters, the black bumpers,
 * the plates; the engine grille and the lamps down the rear corners.
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
import { makeKit, FIN, fin, round, sweep, poly, strut, box, v3 } from './kit.js';

/* PostAuto's yellow and the cream of its roof. */
const YELLOW = 0xf2b800;
const CREAM = 0xefe9d6;
const NEAR = 70;
/* The seats' moquette, dark with the headrest a shade of the red. */
const SEAT = fin(0x262b36, 0.95, 0, 0, 0.4);
const SEAT_TOP = fin(0x5a1c1c, 0.9, 0, 0, 0.45);


export function postbus() {
  const K = makeKit();
  const G = makeKit();
  const paint = FIN.paint(YELLOW);
  const cream = FIN.paint(CREAM);
  const L = 10.6;
  const HW = 1.25;
  const R = 0.5;
  const Ra = 0.58;
  const axles = [3.2, -2.7];
  const xF = L / 2;
  const xR = -L / 2;
  const yb = 0.3;
  const waist = 1.22;
  const winTop = 2.62;
  const roof = 3.05;
  const screenFoot = 1.02;

  /* THE LOWER BODY, skirt to window band, the front stepped down under
   * the screen. */
  const xs = new Set();
  for (let x = xR; x <= xF + 1e-6; x += 0.25) {
    xs.add(+x.toFixed(3));
  }
  for (const u of [0, 0.02, 0.05, 0.1, 0.16, 0.22, 0.3]) {
    xs.add(+(xF - u).toFixed(3));
    xs.add(+(xR + u).toFixed(3));
  }
  for (const ax of axles) {
    for (let k = -6; k <= 6; k += 1) {
      xs.add(+(ax + (k / 6) * Ra).toFixed(3));
    }
  }
  const lower = [...xs].filter((x) => x >= xR && x <= xF).sort((a, b) => a - b).map((x) => {
    const uF = xF - x;
    const uR = x - xR;
    let y0 = yb + round(0.1, Math.min(uF, uR));
    for (const ax of axles) {
      const d = Math.abs(x - ax);
      if (d < Ra) {
        y0 = Math.max(y0, R + Math.sqrt(Ra * Ra - d * d));
      }
    }
    const y1 = uF < 0.3 ? screenFoot : waist;
    const hw = HW - round(0.24, Math.min(uF, uR));
    return { x, y0, y1, hw, hwT: hw, rb: 0.05, rt: 0.03 };
  });
  K.push(paint, sweep(lower));

  /* THE UPPER BODY, window head to roof, its edge turned down in a long
   * radius, and the cream roof on it. */
  const upper = [];
  for (let k = 0; k <= 28; k += 1) {
    const x = xR + (L * k) / 28;
    const u = Math.min(xF - x, x - xR);
    const hw = HW - round(0.24, u);
    upper.push({ x, y0: winTop - 0.02, y1: roof - round(0.2, u) * 0.4, hw, hwT: hw - 0.04, rb: 0.02, rt: 0.3 });
  }
  K.push(paint, sweep(upper));
  const lid = [];
  for (let k = 0; k <= 12; k += 1) {
    const x = xR + 0.25 + ((L - 0.5) * k) / 12;
    lid.push({ x, y0: roof - 0.1, y1: roof + 0.03, hw: HW - 0.3, hwT: HW - 0.36, rb: 0.02, rt: 0.08 });
  }
  K.push(cream, sweep(lid, 2));
  /* The air conditioning on the roof, and the hatches. */
  K.push(cream, box(2.6, 0.24, 1.7), -1.4, roof + 0.13, 0);
  K.push(fin(0x9a968c, 0.6), box(2.4, 0.03, 1.5), -1.4, roof + 0.26, 0);
  for (const x of [2.4, -3.8]) {
    K.push(fin(0xd8d4c6, 0.5), box(0.8, 0.06, 0.7), x, roof + 0.05, 0);
  }

  /* THE WINDOW BAND. Panes between frit covered pillars, flush with
   * the flanks; over the doors the doors' own glass. */
  const doors = [{ x0: 3.9, x1: 5.0 }, { x0: -1.32, x1: -0.08 }];
  const band0 = xR + 0.3;
  const band1 = xF - 0.26;
  const posts = [band0, -4.0, -2.7, -1.32, -0.08, 1.3, 2.6, 3.9, band1];
  const zg = HW - 0.012;
  for (const t of [-1, 1]) {
    for (let k = 0; k + 1 < posts.length; k += 1) {
      const a = posts[k] + 0.07;
      const b = posts[k + 1] - 0.07;
      if (t > 0 && doors.some((d) => a >= d.x0 - 0.01 && b <= d.x1 + 0.01)) {
        continue;
      }
      G.push(FIN.lens, poly([v3(a, waist + 0.02, t * zg), v3(b, waist + 0.02, t * zg), v3(b, winTop, t * zg), v3(a, winTop, t * zg)], v3(0, 0, t)));
    }
    for (const x of posts) {
      K.push(FIN.trim, box(0.16, winTop - waist + 0.04, 0.02), x, (waist + winTop) / 2, t * (HW - 0.004));
    }
    /* The frit's edges along the band's head and foot. */
    K.push(FIN.trim, box(band1 - band0, 0.05, 0.02), (band0 + band1) / 2, winTop - 0.005, t * (HW - 0.004));
    K.push(FIN.trim, box(band1 - band0, 0.035, 0.02), (band0 + band1) / 2, waist + 0.012, t * (HW - 0.004));
    /* The skirt, black between the arches. */
    const skirt = [[xR + 0.25, axles[1] - Ra - 0.02], [axles[1] + Ra + 0.02, axles[0] - Ra - 0.02], [axles[0] + Ra + 0.02, xF - 0.25]];
    for (const [a, b] of skirt) {
      K.push(FIN.plastic, box(b - a, 0.14, 0.03), (a + b) / 2, yb + 0.07, t * (HW - 0.005));
    }
    /* The arch trims. */
    for (const ax of axles) {
      const lip = new THREE.TorusGeometry(Ra + 0.01, 0.03, 4, 16, Math.PI);
      K.push(FIN.plastic, lip, ax, R, t * (HW - 0.02), 0, 0, 0, 1, 1, 1.5);
      lip.dispose();
    }
  }
  for (const ax of axles) {
    K.push(FIN.well, box(Ra * 1.7, Ra * 0.95, 2 * (1.115 - 0.17)), ax, R + Ra * 0.48, 0);
  }

  /* THE DOORS, each two glazed leaves in black frames, the rubber seam
   * between them, the low pane opaque dark glass over the skirt. */
  for (const d of doors) {
    const mid = (d.x0 + d.x1) / 2;
    const z = HW + 0.006;
    for (const [a, b] of [[d.x0, mid], [mid, d.x1]]) {
      const c = (a + b) / 2;
      const w = b - a;
      K.push(FIN.glassFar, box(w - 0.06, waist - yb - 0.12, 0.02), c, (yb + 0.1 + waist) / 2, z);
      G.push(FIN.lens, poly([v3(a + 0.05, waist + 0.02, z + 0.004), v3(b - 0.05, waist + 0.02, z + 0.004), v3(b - 0.05, winTop - 0.06, z + 0.004), v3(a + 0.05, winTop - 0.06, z + 0.004)], v3(0, 0, 1)));
      for (const [x0, y0, x1, y1] of [[a, yb + 0.08, a, winTop], [b, yb + 0.08, b, winTop], [a, winTop - 0.03, b, winTop - 0.03], [a, yb + 0.08, b, yb + 0.08], [a, waist, b, waist]]) {
        strut(K, FIN.trim, v3(x0, y0, z + 0.008), v3(x1, y1, z + 0.008), 0.05, 0.03);
      }
      K.push(FIN.chrome, box(0.03, 0.6, 0.03), c + (a < mid - 0.01 ? w * 0.3 : -w * 0.3), waist + 0.3, z + 0.03);
    }
    K.push(FIN.rubber, box(0.04, winTop - yb - 0.05, 0.03), mid, (yb + winTop) / 2, z + 0.01);
  }

  /* THE FRONT. The screen from the lower body's step to the display, the
   * black corner pillars that wrap it, the display lit amber, the wipers,
   * the lamps, the bumper and the plate. */
  const sx0 = xF - 0.03;
  const sx1 = xF - 0.1;
  const sTop = 2.44;
  G.push(FIN.lens, poly([v3(sx0, screenFoot + 0.03, -(HW - 0.1)), v3(sx0, screenFoot + 0.03, HW - 0.1), v3(sx1, sTop, HW - 0.12), v3(sx1, sTop, -(HW - 0.12))], v3(1, 0.05, 0)));
  for (const t of [-1, 1]) {
    strut(K, FIN.trim, v3(xF - 0.1, screenFoot, t * (HW - 0.07)), v3(xF - 0.16, winTop + 0.02, t * (HW - 0.07)), 0.16, 0.12);
    /* The corner of the band ahead of the first pane. */
    K.push(FIN.trim, box(0.26, waist - screenFoot + 0.02, 0.02), xF - 0.17, (waist + screenFoot) / 2, t * (HW - 0.01));
  }
  K.push(FIN.trim, box(0.05, 0.08, 2 * HW - 0.2), sx0 + 0.005, screenFoot + 0.02, 0);
  K.push(FIN.trim, box(0.06, winTop + 0.05 - sTop, 2 * HW - 0.22), xF - 0.12, (sTop + winTop + 0.05) / 2, 0);
  K.push(fin(0xffa01e, 0.4, -2.2), box(0.02, 0.1, 1.5), xF - 0.085, (sTop + winTop) / 2 + 0.02, 0.1);
  K.push(fin(0xffa01e, 0.4, -2.2), box(0.02, 0.1, 0.22), xF - 0.085, (sTop + winTop) / 2 + 0.02, -0.95);
  for (const t of [-1, 1]) {
    strut(K, FIN.trim, v3(sx0 + 0.03, screenFoot + 0.08, t * 0.1), v3(sx0 + 0.01, screenFoot + 0.95, t * 0.1 - 0.35), 0.02, 0.02);
  }
  /* The lamp clusters: a black housing, two round lenses on chrome, the
   * running light under them, the indicator outboard. */
  for (const t of [-1, 1]) {
    const z = t * (HW - 0.38);
    K.push(FIN.trim, box(0.06, 0.22, 0.52), xF + 0.005, 0.72, z);
    for (const dz of [-0.12, 0.12]) {
      const lens = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14).rotateZ(Math.PI / 2);
      K.push(FIN.chrome, lens, xF + 0.03, 0.74, z + dz);
      K.push(FIN.lens, lens, xF + 0.035, 0.74, z + dz, 0, 0, 0, 1.2, 0.95, 0.95);
      lens.dispose();
    }
    K.push(FIN.drl, box(0.03, 0.03, 0.42), xF + 0.035, 0.63, z);
    K.push(FIN.lensAmber, box(0.04, 0.12, 0.1), xF + 0.02, 0.72, t * (HW - 0.06));
  }
  K.push(FIN.plastic, box(0.2, 0.26, 2 * HW - 0.04), xF - 0.04, yb + 0.13, 0);
  K.push(FIN.plastic, box(0.08, 0.14, 1.4), xF + 0.005, 0.93, 0);
  K.push(FIN.plate, box(0.012, 0.11, 0.5), xF + 0.065, yb + 0.14, 0);
  for (let k = 0; k < 8; k += 1) {
    K.push(FIN.plateInk, box(0.006, 0.06, 0.035), xF + 0.073, yb + 0.14, -0.16 + k * 0.045);
  }
  /* The mirrors, on arms from the roof's front corners out and down to
   * hang ahead of the screen. */
  for (const t of [-1, 1]) {
    const root = v3(xF - 0.2, winTop + 0.1, t * (HW - 0.2));
    const elbow = v3(xF + 0.2, winTop + 0.02, t * (HW + 0.05));
    const head = v3(xF + 0.34, 2.3, t * (HW + 0.08));
    strut(K, FIN.trim, root, elbow, 0.04);
    strut(K, FIN.trim, elbow, head, 0.035);
    K.push(FIN.trim, box(0.1, 0.46, 0.28), head.x, head.y - 0.22, head.z);
    K.push(FIN.chrome, box(0.01, 0.42, 0.24), head.x - 0.055, head.y - 0.22, head.z);
  }

  /* THE REAR. The upper window, the engine grille, the lamps down the
   * corners, the bumper and the plate. */
  G.push(FIN.lens, poly([v3(xR + 0.02, 1.78, -(HW - 0.25)), v3(xR + 0.02, 1.78, HW - 0.25), v3(xR + 0.02, winTop - 0.05, HW - 0.25), v3(xR + 0.02, winTop - 0.05, -(HW - 0.25))], v3(-1, 0, 0)));
  K.push(FIN.trim, box(0.03, winTop - 1.66, 2 * HW - 0.4), xR + 0.005, (winTop + 1.66) / 2, 0);
  for (let k = 0; k < 6; k += 1) {
    K.push(FIN.trim, box(0.04, 0.035, 1.5), xR - 0.005, 0.72 + k * 0.1, 0);
  }
  for (const t of [-1, 1]) {
    K.push(FIN.lensRed, box(0.05, 0.62, 0.14), xR - 0.005, 1.15, t * (HW - 0.1));
    K.push(FIN.lensAmber, box(0.05, 0.14, 0.14), xR - 0.005, 1.55, t * (HW - 0.1));
    K.push(FIN.lens, box(0.05, 0.1, 0.14), xR - 0.005, 0.76, t * (HW - 0.1));
  }
  K.push(FIN.plastic, box(0.2, 0.3, 2 * HW - 0.04), xR + 0.05, yb + 0.15, 0);
  K.push(FIN.plate, box(0.012, 0.11, 0.5), xR - 0.055, yb + 0.2, 0);
  for (let k = 0; k < 8; k += 1) {
    K.push(FIN.plateInk, box(0.006, 0.06, 0.035), xR - 0.063, yb + 0.2, -0.16 + k * 0.045);
  }

  /* INSIDE. The ceiling under the upper body, its light strips and the
   * handrails along it; the seats in pairs facing forward, their backs
   * over the band's foot; the yellow poles at the doors and down the
   * aisle; the driver behind the screen. */
  const zi = HW - 0.08;
  K.push(FIN.headliner, box(L - 0.6, 0.02, 2 * zi), 0, winTop - 0.04, 0);
  /* The floor the seats stand on, where the lower body's painted top
   * would otherwise show through the glass. */
  K.push(FIN.cabin, box(L - 0.7, 0.01, 2 * zi), -0.1, waist + 0.006, 0);
  const poleF = fin(0xf0c020, 0.35, 0, 0.8, 0.5);
  for (const t of [-1, 1]) {
    K.push(fin(0xd8d6d0, 0.5, 0, 0, 0.5), box(L - 1.4, 0.02, 0.1), -0.2, winTop - 0.055, t * (zi - 0.45));
    strut(K, poleF, v3(xR + 0.8, winTop - 0.25, t * (zi - 0.25)), v3(xF - 1.2, winTop - 0.25, t * (zi - 0.25)), 0.035);
  }
  const rows = [4.1, 2.35, 1.6, 0.85, -1.9, -2.65, -3.4, -4.15];
  for (const x of rows) {
    for (const t of [-1, 1]) {
      if (t > 0 && doors.some((d) => x > d.x0 - 0.5 && x < d.x1 + 0.3)) {
        continue;
      }
      const z = t * (zi - 0.46);
      /* Two seats, not a bench: a gap between the backs. */
      for (const dz of [-0.22, 0.22]) {
        K.push(SEAT, box(0.46, 0.1, 0.42), x + 0.05, waist - 0.05, z + dz);
        K.push(SEAT, box(0.08, 0.56, 0.42), x - 0.2, waist + 0.22, z + dz, 0, 0, 0.12);
        K.push(SEAT_TOP, box(0.09, 0.07, 0.42), x - 0.235, waist + 0.52, z + dz, 0, 0, 0.12);
      }
      K.push(poleF, box(0.03, 0.03, 0.3), x - 0.27, waist + 0.6, z - t * 0.3);
    }
  }
  /* The rear bench across the back, over the engine. */
  K.push(SEAT, box(0.12, 0.6, 2 * zi - 0.2), xR + 0.55, waist + 0.25, 0);
  for (const x of [4.6, 3.4, -0.3, -1.1, -2.2]) {
    for (const t of [-1, 1]) {
      strut(K, poleF, v3(x, waist - 0.1, t * 0.6), v3(x, winTop - 0.05, t * 0.6), 0.04);
    }
  }
  /* The driver's place, front left: seat, wheel, dashboard. */
  K.push(FIN.cabin, box(0.5, 0.18, 2 * zi - 0.3), xF - 0.45, screenFoot + 0.05, 0);
  K.push(FIN.seat, box(0.14, 0.75, 0.52), xF - 1.4, waist + 0.15, -0.72, 0, 0, 0.15);
  const wheel = new THREE.TorusGeometry(0.25, 0.022, 4, 18);
  K.push(FIN.trim, wheel, xF - 0.8, waist + 0.1, -0.72, Math.PI / 2, 0, -0.9);
  wheel.dispose();
  /* A cab partition and ticket machine behind the driver. */
  K.push(fin(0x9aa0a6, 0.4, 0.6, 0, 0.5), box(0.05, 0.8, 0.6), xF - 1.75, waist + 0.2, -0.75);
  K.push(FIN.cabin, box(0.3, 0.4, 0.3), xF - 1.2, waist + 0.4, -0.25);

  return { body: K, glass: G, wheel: 'steel', lod: NEAR };
}
