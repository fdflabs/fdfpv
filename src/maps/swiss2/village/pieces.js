/*
 * pieces.js: the things a lived in Oberland village leaves about, each
 * built into a frame on the ground (x across, y up, z out, the origin at
 * its foot) under the buildings' own keys, so they bake into the
 * village's meshes and cost no draw of their own.
 *
 * Near only, all of it but the yards' sheds and hedges, which are
 * buildings and lines seen from far off (buildings/bake.js): a bicycle
 * or a garden chair is a speck past a couple of hundred metres. What
 * throws a shadow worth having (a parasol, a bed's boards, the washing)
 * is near(); the thin and the small (spokes, a flag's cross, a lettuce)
 * are detail(), which the shadow maps skip.
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
import { cyl, roofShell, gableProfile } from '../../alps/kit.js';
import { box, boxUp, cached, near, detail, blob, plate, own, frame, prism } from '../buildings/parts.js';

/* A hash of a frame's own place and a salt, for the little differences
 * no rng should be drawn for. */
const pick = (f, salt, n) => Math.floor(own(f, salt) * n);

/*
 * A bicycle on its stand, the kind every Swiss household has two of: a
 * diamond frame in the owner's colour, black tyres on silver rims with a
 * spoke or two to catch the light, a saddle, flat bars. Its length along
 * x, 1.75 m.
 */
const BIKE_PAINT = ['signRed', 'signBlue', 'ink', 'shutterGreen', 'paint', 'bikeTeal'];
export function bicycle(f) {
  const paint = BIKE_PAINT[pick(f, 1, BIKE_PAINT.length)];
  const tyre = cached('s2tyre', () => new THREE.TorusGeometry(0.33, 0.022, 4, 18));
  const r = 0.35;
  const wx = 0.54;
  const tube = (x0, y0, x1, y1, t = 0.028) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    f.put(detail(paint), box(len, t, t), (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, Math.atan2(y1 - y0, x1 - x0));
  };
  for (const x of [-wx, wx]) {
    f.put(near('ink'), tyre, x, r, 0);
    f.put(detail('metal'), box(0.02, 0.62, 0.012), x, r, 0, 0, 0, 0.6);
    f.put(detail('metal'), box(0.02, 0.62, 0.012), x, r, 0, 0, 0, -0.9);
  }
  const bb = [-0.02, 0.3];
  const seat = [-0.2, 0.86];
  const head = [0.4, 0.88];
  tube(-wx, r, bb[0], bb[1]);
  tube(-wx, r, seat[0], seat[1] - 0.06);
  tube(bb[0], bb[1], seat[0], seat[1] - 0.06, 0.034);
  tube(bb[0], bb[1], head[0], head[1] - 0.12, 0.034);
  tube(seat[0], seat[1] - 0.1, head[0], head[1] - 0.06, 0.03);
  tube(head[0], head[1], wx, r);
  f.put(detail('ink'), box(0.22, 0.05, 0.12), seat[0] - 0.02, seat[1] + 0.02, 0);
  f.put(detail('ink'), box(0.03, 0.03, 0.56), head[0] - 0.02, head[1] + 0.1, 0);
  f.put(detail('metal'), box(0.04, 0.14, 0.04), head[0], head[1] + 0.03, 0);
  f.put(detail('ink'), box(0.16, 0.02, 0.12), bb[0], bb[1] - 0.02, 0.08);
}

/* A cast iron lantern on its post, painted the dark green the valley's
 * municipal iron is, the glass lantern on top under a little hat. */
export function lampPost(f) {
  f.put(near('castIron'), cyl(0.12, 0.14, 0.5, 8), 0, 0, 0);
  f.put(near('castIron'), cyl(0.05, 0.07, 3.1, 8), 0, 0.5, 0);
  f.put(near('castIron'), box(0.3, 0.05, 0.3), 0, 3.6, 0);
  f.put(detail('lanternGlass'), cyl(0.17, 0.11, 0.45, 6), 0, 3.63, 0);
  f.put(near('castIron'), cyl(0.02, 0.26, 0.2, 6), 0, 4.08, 0);
  f.put(detail('castIron'), cyl(0.03, 0.03, 0.12, 6), 0, 4.28, 0);
}

/* A lamp on a telegraph pole: an arm out over the street, the shade and
 * its bulb under it. */
export function poleLamp(f, height) {
  f.put(near('castIron'), box(1.4, 0.06, 0.06), 0, height, 0.7, Math.PI / 2);
  f.put(detail('castIron'), box(0.04, 0.5, 0.04), 0, height - 0.22, 0.2, 0, 0.8);
  f.put(near('lamp'), cyl(0.28, 0.08, 0.16, 8), 0, height - 0.2, 1.35);
  f.put(detail('lanternGlass'), cyl(0.12, 0.12, 0.04, 8), 0, height - 0.23, 1.35);
}

/*
 * A flagpole with the Swiss flag: white pole, gilt ball, the square red
 * flag with its white cross hung off the halyard in a lazy wave. The
 * flag is two faces, one for each side, bent along its length.
 */
export function flagpole(f, h = 8) {
  f.put(near('stone'), boxUp(0.5, 0.25, 0.5), 0, 0, 0);
  f.put(near('paint'), cyl(0.045, 0.07, h, 8), 0, 0.25, 0);
  f.put(detail('cross'), cached('s2flagball', () => new THREE.SphereGeometry(0.08, 8, 6)), 0, h + 0.3, 0);
  const s = 1.3;
  /* A rectangle w by h whose left edge is x0 along the flag, bent to
   * the flag's wave and lifted `off` off it; the back wound the other
   * way so each side faces out. */
  const waved = (w, h, x0, off, side) => cached(`s2flag${w},${h},${x0},${off},${side}`, () => {
    const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(w / 0.16)), 1);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i) + w / 2 + x0;
      p.setX(i, x);
      p.setZ(i, 0.1 * Math.sin((x / s) * Math.PI * 1.6) + side * off);
    }
    if (side < 0) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        const t = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = t;
      }
    }
    g.computeVertexNormals();
    return g;
  });
  const y = h + 0.1 - s / 2;
  /* The cross: its arms a sixth longer than broad, as the federal flag
   * has them, on each face. */
  const arm = (6 / 32) * s;
  const span = (20 / 32) * s;
  for (const side of [1, -1]) {
    f.put(near('flagRed'), waved(s, s, 0, 0.004, side), 0.06, y, 0);
    f.put(detail('paint'), waved(span, arm, (s - span) / 2, 0.012, side), 0.06, y, 0);
    f.put(detail('paint'), waved(arm, (span - arm) / 2, (s - arm) / 2, 0.012, side), 0.06, y + (span + arm) / 4, 0);
    f.put(detail('paint'), waved(arm, (span - arm) / 2, (s - arm) / 2, 0.012, side), 0.06, y - (span + arm) / 4, 0);
  }
}

/* A café table, round on its iron foot, with its chairs about it, and
 * a parasol on the table if it is given one. Returns the chairs, where
 * each stands in the world and which way it faces, for whoever sits. */
export function cafeSet(f, { chairs = 3, parasol = null } = {}) {
  f.put(near('lamp'), cyl(0.04, 0.04, 0.72, 6), 0, 0, 0);
  f.put(detail('lamp'), cyl(0.25, 0.25, 0.03, 8), 0, 0, 0);
  f.put(near('fence'), cyl(0.38, 0.38, 0.04, 12), 0, 0.72, 0);
  const yaw = Math.atan2(-f.m.elements[2], f.m.elements[0]);
  const seats = [];
  for (let k = 0; k < chairs; k += 1) {
    const a = (k / chairs) * Math.PI * 2 + own(f, 3) * 1.2;
    const c = { x: Math.cos(a) * 0.72, z: Math.sin(a) * 0.72 };
    const ry = -a - Math.PI / 2 + (own(f, 4 + k) - 0.5) * 0.4;
    gardenChair(f, c.x, c.z, ry);
    const w = f.at(c.x, 0, c.z);
    seats.push({ x: w.x, z: w.z, ry: yaw + ry });
  }
  if (parasol) {
    f.put(detail('paint'), cyl(0.025, 0.025, 2.3, 6), 0, 0.72, 0);
    const canopy = cached('s2parasol', () => new THREE.ConeGeometry(1.35, 0.42, 8, 1, true).translate(0, 0.21, 0));
    const under = cached('s2parasolIn', () => new THREE.ConeGeometry(1.35, 0.42, 8, 1, true).rotateX(Math.PI).translate(0, 0.21, 0));
    f.put(near(parasol), canopy, 0, 2.62, 0, Math.PI / 8);
    f.put(detail(parasol), under, 0, 2.62, 0, Math.PI / 8, 0, 0, 0.98, -0.95, 0.98);
    f.put(detail(parasol), box(2.4, 0.18, 0.01), 0, 2.56, 0, Math.PI / 8);
  }
  return seats;
}

/* A folding garden chair, slatted, facing +z. */
export function gardenChair(f, x, z, ry) {
  const key = 'fence';
  const c = { put: (k, g, lx, ly, lz, lry = 0, lrx = 0) => {
    const s = Math.sin(ry);
    const co = Math.cos(ry);
    f.put(k, g, x + lx * co + lz * s, ly, z - lx * s + lz * co, ry + lry, lrx);
  } };
  c.put(near(key), box(0.42, 0.04, 0.42), 0, 0.45, 0);
  c.put(near(key), box(0.42, 0.4, 0.04), 0, 0.72, -0.22, 0, -0.12);
  for (const [lx, lz] of [[-0.19, 0.18], [0.19, 0.18], [-0.19, -0.2], [0.19, -0.2]]) {
    c.put(detail('lamp'), box(0.03, 0.45, 0.03), lx, 0.225, lz);
  }
}

/* A garden bench and table under the eaves, the Sunday kind: a plank
 * table on trestles and a bench each side. */
export function gardenTable(f) {
  f.put(near('fence'), box(1.6, 0.05, 0.75), 0, 0.74, 0);
  for (const s of [-1, 1]) {
    f.put(near('larchDark'), box(0.06, 0.72, 0.6), s * 0.65, 0.36, 0);
    f.put(near('fence'), box(1.6, 0.05, 0.28), 0, 0.44, s * 0.66);
    for (const t of [-1, 1]) {
      f.put(detail('larchDark'), box(0.06, 0.42, 0.24), t * 0.65, 0.21, s * 0.66);
    }
  }
}

/*
 * A raised vegetable bed: board sides, dark soil, rows of lettuces and
 * cabbages and a row of beans up canes. `w` along x, `d` along z.
 */
export function vegBed(f, w, d) {
  f.put(near('larchDark'), boxUp(w, 0.28, 0.05), 0, 0, d / 2);
  f.put(near('larchDark'), boxUp(w, 0.28, 0.05), 0, 0, -d / 2);
  f.put(near('larchDark'), boxUp(0.05, 0.28, d), w / 2, 0, 0);
  f.put(near('larchDark'), boxUp(0.05, 0.28, d), -w / 2, 0, 0);
  f.put('soil', box(w - 0.05, 0.04, d - 0.05), 0, 0.24, 0);
  const rows = Math.max(2, Math.round(d / 0.42));
  for (let r = 0; r < rows; r += 1) {
    const z = -d / 2 + (r + 0.5) * (d / rows);
    const kind = pick(f, 7 + r, 4);
    if (kind === 3 && r === 0) {
      const n = Math.max(2, Math.round(w / 0.5));
      for (let k = 0; k < n; k += 1) {
        const x = -w / 2 + (k + 0.5) * (w / n);
        f.put(detail('larchDark'), box(0.02, 1.6, 0.02), x, 1.05, z, 0, 0, 0.08);
        f.put(detail('leaf'), blob(), x, 0.9, z, k, 0.3, 0, 0.12, 0.6, 0.12);
      }
      continue;
    }
    const key = kind === 0 ? 'cabbage' : kind === 1 ? 'lettuce' : 'leaf';
    const size = kind === 0 ? 0.17 : kind === 1 ? 0.13 : 0.1;
    const n = Math.max(2, Math.round(w / (size * 2.6)));
    for (let k = 0; k < n; k += 1) {
      const x = -w / 2 + (k + 0.5) * (w / n);
      f.put(detail(key), blob(), x, 0.29, z, k * 1.7, 0, 0, size, size * 0.7, size);
    }
  }
}

/* A washing line between two T posts, the week's washing pegged on it:
 * sheets, shirts, towels, each hanging in its own colour. */
const WASH = ['clothWhite', 'clothWhite', 'clothBlue', 'clothRose', 'clothWhite', 'clothYellow', 'signRed'];
export function washingLine(f, len) {
  for (const s of [-1, 1]) {
    f.put(near('fence'), boxUp(0.08, 1.9, 0.08), s * len / 2, 0, 0);
    f.put(near('fence'), box(0.06, 0.06, 0.7), s * len / 2, 1.85, 0);
  }
  for (const z of [-0.25, 0.25]) {
    f.put(detail('ink'), box(len, 0.008, 0.008), 0, 1.8, z);
  }
  let x = -len / 2 + 0.35;
  let k = 0;
  while (x < len / 2 - 0.5) {
    const key = WASH[pick(f, 11 + k, WASH.length)];
    const sheet = own(f, 20 + k) < 0.25;
    const w = sheet ? 1.1 : 0.45 + 0.25 * own(f, 30 + k);
    const h = sheet ? 1.0 : 0.5 + 0.2 * own(f, 40 + k);
    if (x + w > len / 2 - 0.2) {
      break;
    }
    const z = k % 2 ? 0.25 : -0.25;
    f.put(near(key), box(w, h, 0.012), x + w / 2, 1.8 - h / 2, z, 0, 0, (own(f, 50 + k) - 0.5) * 0.06);
    x += w + 0.12;
    k += 1;
  }
}

/* A picket fence along x, `len` long, its gate left out if asked. */
export function picketFence(f, len, key = 'fenceWhite') {
  const n = Math.max(2, Math.round(len / 0.13));
  f.put(near(key), box(len, 0.06, 0.03), 0, 0.3, 0);
  f.put(near(key), box(len, 0.06, 0.03), 0, 0.72, 0);
  const pale = cached('s2pale', () => new THREE.BoxGeometry(0.07, 0.95, 0.02).translate(0, 0.47, 0));
  for (let k = 0; k < n; k += 1) {
    f.put(detail(key), pale, -len / 2 + (k + 0.5) * (len / n), 0, 0.025);
  }
  for (let k = 0; k <= Math.round(len / 2); k += 1) {
    f.put(near(key), boxUp(0.08, 1.0, 0.08), -len / 2 + k * (len / Math.round(len / 2)), 0, -0.03);
  }
}

/* Split logs stacked in a free standing rick under a board roof. */
export function woodRick(f, len) {
  const log = cached('s2log', () => new THREE.CylinderGeometry(0.12, 0.12, 0.5, 5, 1, true).rotateX(Math.PI / 2));
  const cut = cached('s2logend', () => new THREE.CircleGeometry(0.12, 5));
  const rows = 5;
  const n = Math.max(2, Math.floor(len / 0.25));
  for (let r = 0; r < rows; r += 1) {
    for (let k = 0; k < n - (r % 2); k += 1) {
      const x = -len / 2 + 0.13 + k * 0.25 + (r % 2) * 0.12;
      f.put(detail('logEnd'), cut, x, 0.12 + r * 0.22, 0.26 + ((k * 7 + r) % 3) * 0.02);
    }
  }
  f.put(near('larchDark'), box(len, rows * 0.22 + 0.02, 0.5), 0, (rows * 0.22) / 2 + 0.02, 0);
  f.put(detail('larchDark'), log, -len / 2, 0.14, 0);
  f.put(near('shingleDark'), box(len + 0.3, 0.05, 0.85), 0, rows * 0.22 + 0.2, 0, 0, -0.2);
  for (const s of [-1, 1]) {
    f.put(near('larchDark'), boxUp(0.08, rows * 0.22 + 0.15, 0.08), s * (len / 2 + 0.05), 0, 0.25);
  }
}

/* A planter: a timber trough or a stone basin, heaped with flowers. */
export function planter(f, len, bloom = 'geranium', key = 'larchDark') {
  f.put(near(key), boxUp(len, 0.5, 0.5), 0, 0, 0);
  f.put(detail('soil'), box(len - 0.08, 0.02, 0.42), 0, 0.49, 0);
  const n = Math.max(2, Math.round(len / 0.3));
  for (let k = 0; k < n; k += 1) {
    const x = -len / 2 + (k + 0.5) * (len / n);
    const r = own(f, 60 + k);
    f.put(detail('leaf'), blob(), x, 0.58, 0, r * 4, 0.2, 0, 0.2, 0.16, 0.24);
    f.put(detail(bloom), blob(), x + 0.06 - 0.12 * r, 0.7, 0.1 - 0.2 * r, r * 3, 0.5, 0, 0.09, 0.08, 0.09);
    f.put(detail(bloom), blob(), x - 0.06 + 0.1 * r, 0.66, -0.1 + 0.16 * r, r, 0.3, 0, 0.08, 0.07, 0.08);
  }
}

/* The village's notice board: two posts, a shingled hood, the board
 * with the commune's notices pinned on it. */
export function noticeBoard(f) {
  for (const s of [-1, 1]) {
    f.put(near('larchDark'), boxUp(0.1, 2.3, 0.1), s * 0.75, 0, 0);
  }
  f.put(near('larchDark'), box(1.4, 1.0, 0.05), 0, 1.5, 0.02);
  f.put(near('shingleDark'), box(1.9, 0.05, 0.5), 0, 2.28, 0.12, 0, 0.3);
  const papers = [[-0.4, 1.7, 0.36, 0.5, 'clothWhite'], [0.05, 1.75, 0.3, 0.42, 'clothYellow'], [0.42, 1.62, 0.34, 0.46, 'clothWhite'],
    [-0.3, 1.2, 0.42, 0.3, 'clothWhite'], [0.25, 1.22, 0.3, 0.36, 'signRed']];
  for (const [x, y, w, h, key] of papers) {
    f.put(detail(key), plate(w, h), x, y, 0.05);
  }
}

/* The yellow hiking signpost at the start of every path in Switzerland:
 * a steel post and its arrow boards, one each way. */
export function hikeSign(f, headings) {
  f.put(near('metal'), cyl(0.04, 0.04, 2.6, 6), 0, 0, 0);
  headings.forEach((ry, k) => {
    const y = 2.35 - k * 0.24;
    const arrow = cached('s2hikearrow', () => {
      const s = new THREE.Shape();
      s.moveTo(0.05, -0.09);
      s.lineTo(0.7, -0.09);
      s.lineTo(0.8, 0);
      s.lineTo(0.7, 0.09);
      s.lineTo(0.05, 0.09);
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }).translate(0, 0, -0.01);
    });
    f.put(near('hikeYellow'), arrow, 0, y, 0, ry);
    f.put(detail('ink'), plate(0.4, 0.04), 0, y, 0, ry);
  });
  f.put(near('clothWhite'), box(0.24, 0.12, 0.02), 0, 2.58, 0.05);
}

/* A red hydrant with its caps. */
export function hydrant(f) {
  f.put(near('signRed'), cyl(0.1, 0.12, 0.8, 8), 0, 0, 0);
  f.put(near('signRed'), cyl(0.02, 0.13, 0.12, 8), 0, 0.8, 0);
  for (const s of [-1, 1]) {
    f.put(detail('metal'), cyl(0.05, 0.05, 0.12, 6), s * 0.1, 0.6, 0, 0, 0, s * Math.PI / 2);
  }
}

/* The yellow post box on its post. */
export function postBox(f) {
  f.put(near('metal'), boxUp(0.06, 0.9, 0.06), 0, 0, 0);
  f.put(near('postYellow'), box(0.36, 0.5, 0.26), 0, 1.15, 0.05);
  f.put(near('postYellow'), cached('s2postTop', () => new THREE.CylinderGeometry(0.13, 0.13, 0.36, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2)), 0, 1.4, 0.05);
  f.put(detail('ink'), plate(0.2, 0.03), 0, 1.3, 0.19);
}

/* A drain in the gutter: a dark grate in a stone frame. */
export function drain(f) {
  f.put(near('stone'), box(0.6, 0.03, 0.45), 0, 0.012, 0);
  f.put(detail('ink'), box(0.46, 0.03, 0.32), 0, 0.02, 0);
  for (let k = 0; k < 5; k += 1) {
    f.put(detail('metal'), box(0.03, 0.012, 0.32), -0.18 + k * 0.09, 0.037, 0);
  }
}

/* A puddle: a still film on the paving, its outline irregular. */
export function puddle(f, r) {
  const g = cached(`s2puddle${pick(f, 71, 3)}`, () => {
    const s = new THREE.Shape();
    const seed = pick(f, 71, 3);
    for (let k = 0; k < 14; k += 1) {
      const a = (k / 14) * Math.PI * 2;
      const q = 0.75 + 0.35 * Math.sin(a * 3 + seed * 2.1) * Math.cos(a * 2 - seed);
      const fn = k === 0 ? 'moveTo' : 'lineTo';
      s[fn](Math.cos(a) * q, Math.sin(a) * q * 0.62);
    }
    s.closePath();
    return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  });
  f.put(detail('puddle'), g, 0, 0.004, 0, own(f, 72) * Math.PI, 0, 0, r, 1, r);
}

/*
 * A market stall, the kind a farm sets up by the church on market day:
 * a trestle table under a striped awning on four poles, its crates of
 * fruit and vegetables tipped toward the customers, more crates stacked
 * beside it, the prices on a slate. Along x, 2.6 m; its front, where the
 * customers stand, toward +z.
 */
const PRODUCE = ['apple', 'pear', 'lettuce', 'fruitOrange', 'plum', 'apple', 'cabbage', 'pear'];
export function marketStall(f) {
  const len = 2.6;
  const deep = 1.0;
  const top = 0.86;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.put(near('larchDark'), boxUp(0.06, top, 0.06), sx * (len / 2 - 0.12), 0, sz * (deep / 2 - 0.08));
    }
  }
  f.put(near('larch'), box(len + 0.1, 0.05, deep + 0.1), 0, top + 0.025, 0);
  f.put(near('canvasRed'), box(len + 0.12, 0.62, 0.02), 0, top - 0.3, deep / 2 + 0.06);
  /* Two rows of crates on the table, the front row tipped toward the
   * customers, each heaped with what it holds. */
  const n = 5;
  for (let row = 0; row < 2; row += 1) {
    for (let k = 0; k < n; k += 1) {
      const x = -len / 2 + (k + 0.5) * (len / n);
      const z = row === 0 ? 0.2 : -0.24;
      const tip = row === 0 ? 0.28 : 0.1;
      const y = top + 0.1 + (row === 0 ? 0.02 : 0.12);
      const what = PRODUCE[(k + row * 3 + pick(f, 81, 8)) % PRODUCE.length];
      f.put(near('larch'), box(len / n - 0.05, 0.16, 0.4), x, y, z, 0, tip);
      for (let q = 0; q < 3; q += 1) {
        const r = own(f, 90 + k * 7 + row * 3 + q);
        f.put(detail(what), blob(), x - 0.16 + q * 0.16, y + 0.1 + 0.03 * r, z + 0.05 * (r - 0.5), r * 3, 0.4, 0, 0.13, 0.06, 0.16);
      }
    }
  }
  /* The awning: poles higher at the back so the rain runs forward, a
   * canvas in red and white stripes, a valance along its front. */
  const back = 2.35;
  const front = 2.05;
  for (const sx of [-1, 1]) {
    f.put(near('castIron'), boxUp(0.04, back, 0.04), sx * (len / 2 + 0.05), 0, -deep / 2 - 0.1);
    f.put(near('castIron'), boxUp(0.04, front, 0.04), sx * (len / 2 + 0.05), 0, deep / 2 + 0.35);
  }
  const run = deep + 0.45;
  const slope = Math.atan2(back - front, run);
  const stripes = 8;
  const width = (len + 0.3) / stripes;
  for (let k = 0; k < stripes; k += 1) {
    const x = -len / 2 - 0.15 + (k + 0.5) * width;
    const key = k % 2 ? 'canvas' : 'canvasRed';
    f.put(near(key), box(width, 0.02, Math.hypot(run, back - front) + 0.3), x, (back + front) / 2 + 0.03, 0.12, 0, slope);
    f.put(near(key), box(width, 0.22, 0.015), x, front - 0.08, deep / 2 + 0.5);
  }
  /* Crates stacked at the end of the table, the top one of apples. */
  for (let k = 0; k < 3; k += 1) {
    f.put(near('larch'), boxUp(0.5, 0.26, 0.36), len / 2 + 0.45, k * 0.27, -0.1 + (k % 2) * 0.04, (k % 2) * 0.12);
  }
  f.put(detail('apple'), blob(), len / 2 + 0.45, 0.83, -0.08, 0.3, 0, 0, 0.2, 0.07, 0.14);
  /* The slate of prices on its easel, out front. */
  f.put(near('ink'), box(0.5, 0.65, 0.03), -len / 2 + 0.2, 0.62, deep / 2 + 0.75, 0, -0.25);
  f.put(detail('clothWhite'), plate(0.36, 0.03), -len / 2 + 0.2, 0.75, deep / 2 + 0.785, 0, -0.25);
  f.put(detail('clothWhite'), plate(0.28, 0.03), -len / 2 + 0.2, 0.62, deep / 2 + 0.765, 0, -0.25);
  f.put(near('larchDark'), boxUp(0.03, 0.95, 0.03), -len / 2 + 0.2, 0, deep / 2 + 0.9, 0, 0.3);
}

/*
 * The yards' outbuildings (village/yards.js), each along z with its
 * front, where the doors are, toward +z. Their walls and roofs are
 * drawn at any distance, as the houses' are: from the air a village's
 * sheds and garages are half of what makes it a village and not a plan.
 *
 *   shed      a garden shed of weathered boards under a gable of old
 *             shingle or tin, a plank door, a window in the side;
 *   garage    a rendered box under a shallow gable of eternit, its door
 *             a sheet of painted steel;
 *   woodshed  a lean to open at the front, the winter's wood stacked in
 *             it to the roof, its back and sides boards.
 *
 * Returns the height of its top over its foot.
 */
export function outbuilding(f, { kind, w, d, h, wall, roofKey }) {
  const hw = w / 2;
  const hd = d / 2;
  if (kind === 'woodshed') {
    const back = h + 0.45;
    f.put(wall, boxUp(w, back, 0.08), 0, 0, -hd + 0.04);
    for (const sx of [-1, 1]) {
      f.put(wall, boxUp(0.08, back, d - 0.1), sx * (hw - 0.04), 0, -0.05);
      f.put('larchDark', boxUp(0.12, h, 0.12), sx * (hw - 0.06), 0, hd - 0.06);
    }
    const slope = Math.atan2(back - h, d);
    f.put(roofKey, box(w + 0.5, 0.08, Math.hypot(d, back - h) + 0.7), 0, (back + h) / 2 + 0.05, 0.1, 0, slope);
    /* The wood, split and stacked, end on to the front. */
    const rows = Math.max(3, Math.floor((h - 0.15) / 0.24));
    const log = cached('s2logend', () => new THREE.CircleGeometry(0.12, 5));
    f.put('larchDark', boxUp(w - 0.2, rows * 0.24, d - 0.5), 0, 0.05, -0.15);
    const n = Math.max(2, Math.floor((w - 0.3) / 0.25));
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < n - (r % 2); k += 1) {
        f.put(detail('logEnd'), log, -hw + 0.28 + k * 0.25 + (r % 2) * 0.12, 0.17 + r * 0.24, hd - 0.4 + ((k * 7 + r) % 3) * 0.02);
      }
    }
    return back + 0.2;
  }
  const pitch = kind === 'garage' ? 0.22 : 0.62;
  f.put(wall, boxUp(w, h, d), 0, 0, 0);
  f.put(kind === 'garage' ? 'stone' : 'larchDark', boxUp(w + 0.06, 0.22, d + 0.06), 0, -0.1, 0);
  const roof = roofShell({ kind: 'gable', hw, hd, ov: 0.35, ovA: 0.35, ovB: 0.55, pitch, t: 0.12 });
  const gable = gableProfile(roof, 'gable', hw);
  f.put(wall, prism(gable.map(([x, y]) => [x, y + h]), -hd, hd));
  frame(f, 0, h, 0, 0).put(roofKey, roof.geo);
  const front = frame(f, 0, 0, hd + 0.02, 0);
  if (kind === 'garage') {
    front.put(near('door'), box(w - 0.9, h - 0.4, 0.05), 0, (h - 0.4) / 2, 0);
    for (let k = 1; k < 6; k += 1) {
      front.put(detail('joint'), box(w - 0.95, 0.02, 0.02), 0, (k * (h - 0.4)) / 6, 0.03);
    }
    front.put(detail('lamp'), box(0.2, 0.14, 0.14), 0, h - 0.15, 0.08);
  } else {
    front.put('larchDark:fv', box(0.95, 1.85, 0.05), -hw + 0.8, 0.93, 0);
    front.put(detail('ink'), box(0.03, 0.03, 0.08), -hw + 1.15, 0.95, 0.05);
    frame(f, hw + 0.02, 0, 0, Math.PI / 2).put(detail('ink'), plate(0.55, 0.45), 0, h - 0.7, 0.01);
    /* Tools leant by the door, a watering can. */
    front.put(detail('larch'), box(0.03, 1.4, 0.03), hw - 0.35, 0.68, 0.1, 0, 0.12);
    front.put(detail('metal'), box(0.2, 0.28, 0.02), hw - 0.42, 0.14, 0.14, 0, 0.12);
    front.put(detail('shutterGreen'), cyl(0.12, 0.12, 0.28, 8), hw - 0.8, 0, 0.3);
  }
  return h + roof.yR + 0.1;
}

/* A compost bin of boards, open at the front, heaped with what the
 * garden gave up, a fork stuck in it. 1.3 m square. */
export function compost(f) {
  const s = 1.3;
  for (const [x, z, w, d] of [[0, -s / 2, s, 0.06], [-s / 2, 0, 0.06, s], [s / 2, 0, 0.06, s]]) {
    f.put(near('weathered'), boxUp(w, 0.8, d), x, 0, z);
  }
  f.put(near('soil'), blob(), 0, 0.3, 0, own(f, 3), 0, 0, s * 0.46, 0.5, s * 0.5);
  f.put(detail('leaf'), blob(), 0.2, 0.62, 0.1, own(f, 4) * 3, 0, 0, 0.35, 0.16, 0.3);
  f.put(detail('lettuce'), blob(), -0.25, 0.58, -0.1, own(f, 5) * 3, 0, 0, 0.3, 0.14, 0.25);
  f.put(detail('larch'), box(0.03, 1.3, 0.03), 0.3, 0.9, 0.2, 0, 0.2, 0.3);
}

/* A round clump of leaves: smooth shaded, so a bush or a row of
 * potatoes is soft at any distance and not a cut stone. */
function lump() {
  return cached('s2lump', () => new THREE.SphereGeometry(1, 6, 3));
}

/*
 * A vegetable plot on the open ground, w across and d along z: the earth
 * turned and raked (the ground's own worn earth lies under it, and this
 * is its raised tilth), rows of potatoes, cabbages and lettuces along z,
 * and a path of old boards down the middle.
 */
export function plot(f, w, d) {
  const leaf = lump();
  f.put(near('soil'), box(w, 0.05, d), 0, 0.02, 0);
  const rows = Math.max(3, Math.floor(w / 0.7));
  for (let r = 0; r < rows; r += 1) {
    const x = -w / 2 + (r + 0.5) * (w / rows);
    if (r === Math.floor(rows / 2)) {
      f.put(near('weathered'), box(0.3, 0.04, d - 0.4), x, 0.06, 0);
      continue;
    }
    const kind = pick(f, 300 + r, 3);
    const key = ['cabbage', 'lettuce', 'leaf'][kind];
    const size = [0.2, 0.14, 0.26][kind];
    const n = Math.max(3, Math.round(d / (size * 2.4)));
    for (let k = 0; k < n; k += 1) {
      const z = -d / 2 + (k + 0.5) * (d / n);
      const q = own(f, 320 + r * 31 + k);
      f.put(detail(key), leaf, x + (q - 0.5) * 0.08, 0.05 + size * 0.35, z, q * 6, 0, 0, size, size * 0.7, size);
    }
  }
}

/*
 * A garden shrub `s` metres across: a lilac, a hydrangea, a box ball, a
 * currant, a mound of leaf clumps each of its own shade, a few in
 * flower. The clumps over the top are drawn at any distance; the ones
 * low round the sides only near.
 */
const SHRUB_BLOOM = [null, null, 'roseWhite', 'geraniumPink', 'rose', null, 'clothBlue'];
export function shrub(f, s) {
  const leaf = lump();
  const tints = ['leaf', 'hedge', 'hedgeLight', 'hedgeDark', 'ivyLight'];
  const bloom = SHRUB_BLOOM[pick(f, 400, SHRUB_BLOOM.length)];
  const n = 5 + pick(f, 401, 3);
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * Math.PI * 2 + own(f, 410 + k);
    const r = own(f, 430 + k);
    const top = k < 2;
    const x = top ? (r - 0.5) * s * 0.25 : Math.cos(a) * s * 0.26;
    const z = top ? (own(f, 450 + k) - 0.5) * s * 0.25 : Math.sin(a) * s * 0.26;
    const y = top ? s * (0.48 + 0.1 * r) : s * (0.28 + 0.1 * r);
    const key = tints[pick(f, 470 + k, tints.length)];
    f.put(top ? near(key) : detail(key), leaf, x, y, z, a, 0, 0, s * (0.3 + 0.08 * r), s * (0.26 + 0.06 * r), s * (0.3 + 0.08 * r));
  }
  if (bloom) {
    for (let k = 0; k < 7; k += 1) {
      const a = own(f, 490 + k) * Math.PI * 2;
      const r = own(f, 500 + k);
      f.put(detail(bloom), blob(), Math.cos(a) * s * 0.34 * r, s * (0.45 + 0.28 * r), Math.sin(a) * s * 0.34 * r, a, 0.5, 0, 0.1 * s, 0.08 * s, 0.1 * s);
    }
  }
}

/*
 * A clipped hedge along x, `len` long: beech or privet grown into a wall
 * and cut each summer. A body, and over its sides and top the leaves in
 * clumps of their own shades, a little higher and paler where the
 * summer's growth has come since the shears, so the light breaks on it
 * as on a hedge and not on a board.
 */
export function hedge(f, len, h = 1.5, thick = 1.0) {
  const leaf = lump();
  const tints = ['hedge', 'hedgeDark', 'hedgeLight', 'hedge'];
  f.put('hedgeDark', boxUp(len - 0.2, h * 0.9, thick * 0.8), 0, 0, 0);
  /* Round the section: down each side and over the top. */
  const SECTION = [[0.55, -0.4], [0.92, 0], [0.55, 0.4]];
  const n = Math.max(2, Math.round(len / 0.75));
  for (let k = 0; k < n; k += 1) {
    const x = -len / 2 + (k + 0.5) * (len / n);
    SECTION.forEach(([y, z], q) => {
      const r = own(f, 110 + k * 3 + q);
      const s = own(f, 700 + k * 3 + q);
      const key = tints[Math.floor(r * 4)];
      f.put(q === 1 ? near(key) : detail(key), leaf, x + (r - 0.5) * 0.15, h * (y + 0.05 * (s - 0.5)), thick * z + (s - 0.5) * 0.06,
        0, 0, 0, 0.42 + 0.1 * s, q === 1 ? 0.2 + 0.06 * r : h * 0.42, q === 1 ? thick * 0.45 : 0.18 + 0.05 * r);
    });
  }
}
