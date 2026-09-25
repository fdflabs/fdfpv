/*
 * parts.js: what a Bernese Oberland house is made of, piece by piece.
 *
 * Each piece writes into a frame (alps/kit.js's frame: x across, y up,
 * z out of a wall) under the house's own keys. Anything that casts a
 * shadow worth having at twenty metres is geometry: the roof's thick
 * edges, the purlin ends and their brackets, the rafter tails, the log
 * corners, the window frames standing proud of the wall, the shutters
 * standing off it, the balusters in front of the balcony's shade. The
 * grain, the courses and the render's texture are the photographs'.
 *
 * near(key) is near only (bake.js): the pieces a house is read by close
 * to and that are a speck from the air; detail(key) is near only and
 * casts no shadow. A key marked 'v' runs its boards up the face rather
 * than along it.
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
import {
  frame, box, boxUp, cached, polySolid, prism, roofShell, gableProfile, SOCLE,
} from '../../alps/kit.js';

export { frame, box, boxUp, cached, prism, SOCLE };

/* Near only; near only and casting no shadow (a glazing bar, a flower
 * head: what the shadow maps cannot resolve anyway). */
export const near = (key) => `${key}:f`;
export const detail = (key) => `${key}:fo`;

/* A number in [0, 1) that is a house's own, from where it stands. The
 * village's rng is not drawn for it: every draw the cel builders do not
 * make would move every house placed after this one. */
export function own(f, salt = 0) {
  const x = f.m.elements[12] * 12.9898 + f.m.elements[14] * 78.233 + salt * 37.719;
  const v = Math.sin(x) * 43758.5453;
  return v - Math.floor(v);
}

/* What the builders leave for the furnishing after them (village/):
 * where each house stands and how big it is. It rides on the bake,
 * which is the one thing a build's builders all share and which lives
 * exactly as long as the build. */
export function notes(f) {
  const bake = f.bake ?? f;
  bake.s2 ??= { houses: [] };
  return bake.s2;
}

/* A flat face toward +z. */
export function plate(w, h) {
  return cached(`s2plate${w},${h}`, () => new THREE.PlaneGeometry(w, h));
}

/* A planar polygon wound so its normal points along n, whichever way it
 * was listed: the pieces below are easier to write as corner lists than
 * to wind by hand. */
function orient(pts, n) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return x * n[0] + y * n[1] + z * n[2] < 0 ? [...pts].reverse() : pts;
}

/*
 * A window or door surround: a ring `bar` wide standing `depth` out of
 * the wall, its outer sides and its inner reveal closed, no back (the
 * wall is there). Twenty four triangles where a closed extrusion is
 * thirty two.
 */
export function ring(w, h, bar, depth, sides = true) {
  return cached(`s2ring${w},${h},${bar},${depth},${sides}`, () => {
    const W = w / 2;
    const H = h / 2;
    const iW = W - bar;
    const iH = H - bar;
    const d = depth;
    const faces = [
      [[-W, -H, d], [W, -H, d], [W, -iH, d], [-W, -iH, d]],
      [[-W, iH, d], [W, iH, d], [W, H, d], [-W, H, d]],
      [[-W, -iH, d], [-iW, -iH, d], [-iW, iH, d], [-W, iH, d]],
      [[iW, -iH, d], [W, -iH, d], [W, iH, d], [iW, iH, d]],
    ].map((f) => orient(f, [0, 0, 1]));
    if (!sides) {
      return polySolid(faces);
    }
    const side = (a, b, n) => faces.push(orient([[...a, 0], [...b, 0], [...b, d], [...a, d]], n));
    side([-W, H], [W, H], [0, 1, 0]);
    side([-W, -H], [W, -H], [0, -1, 0]);
    side([-W, -H], [-W, H], [-1, 0, 0]);
    side([W, -H], [W, H], [1, 0, 0]);
    side([-iW, iH], [iW, iH], [0, -1, 0]);
    side([-iW, -iH], [iW, -iH], [0, 1, 0]);
    side([-iW, -iH], [-iW, iH], [1, 0, 0]);
    side([iW, -iH], [iW, iH], [-1, 0, 0]);
    return polySolid(faces);
  });
}

/* A board with only its face and its two edges: a baluster, seen from
 * the street against the dark of the balcony behind it. The sawn waist
 * is the Bernese pattern, cut from a plank. */
function balusterRow(len, h, { width = 0.17, gap = 0.08 } = {}) {
  return cached(`s2bal${len},${h},${width},${gap}`, () => {
    const n = Math.max(2, Math.round(len / (width + gap)));
    const pitch = len / n;
    const w = Math.min(width, pitch - 0.03) / 2;
    const levels = [[0, 1], [h * 0.3, 1], [h * 0.42, 0.45], [h * 0.58, 0.45], [h * 0.7, 1], [h, 1]];
    const faces = [];
    for (let k = 0; k < n; k += 1) {
      const cx = -len / 2 + (k + 0.5) * pitch;
      for (let l = 0; l + 1 < levels.length; l += 1) {
        const [y0, s0] = levels[l];
        const [y1, s1] = levels[l + 1];
        faces.push(orient([[cx - w * s0, y0, 0], [cx + w * s0, y0, 0], [cx + w * s1, y1, 0], [cx - w * s1, y1, 0]], [0, 0, 1]));
      }
    }
    return polySolid(faces);
  });
}

/* The shade of one head of `bloom` (a geranium key), by a number in
 * [0, 1): mostly the plant's own red, some fresh, some going over; and
 * of one leaf. */
export function bloomShade(bloom, r) {
  if (bloom !== 'geranium' && bloom !== 'geraniumPink') {
    return bloom;
  }
  return r < 0.22 ? `${bloom}Deep` : r > 0.78 ? `${bloom}Light` : bloom;
}
export const leafShade = (r) => (r < 0.4 ? 'leafDark' : 'leaf');

/* A leafy mound or a flower head: an octahedron, squashed by the put. */
export function blob() {
  return cached('s2blob', () => new THREE.OctahedronGeometry(1, 0));
}

/*
 * A casement window the Swiss way: the glass at the wall, a painted frame
 * standing proud round it so the glass sits in a reveal, glazing bars in
 * six panes, a sill that throws a shadow, a head board over it on timber,
 * and louvred shutters folded back, standing off the wall and not quite
 * flat against it. `key` is the house's timber (the sill and head on a
 * log wall) or null on masonry, where the surround is a stone band.
 */
export function casement(wall, x, y, w, h, { shutter = null, bars = true, sill = true, key = null, seed = 0, bloom = null } = {}) {
  const win = frame(wall, x, y, 0, 0);
  win.put('glass:o', plate(w - 0.12, h - 0.12), 0, 0, 0.02);
  win.put(detail('trim'), ring(w, h, 0.09, 0.11), 0, 0, 0);
  if (!key) {
    win.put(detail('surround'), ring(w + 0.3, h + 0.3, 0.15, 0.03, false), 0, 0, 0);
  }
  if (bars) {
    win.put(detail('trim'), plate(0.05, h - 0.16), 0, 0, 0.05);
    win.put(detail('trim'), plate(w - 0.16, 0.035), 0, h * 0.17, 0.05);
    win.put(detail('trim'), plate(w - 0.16, 0.035), 0, -h * 0.17, 0.05);
  }
  if (sill) {
    win.put(near(key ?? 'stone'), box(w + (key ? 0.2 : 0.42), 0.06, 0.2), 0, -h / 2 - (key ? 0.03 : 0.18), 0.1);
  }
  if (key) {
    win.put(near(key), box(w + 0.3, 0.1, 0.14), 0, h / 2 + 0.07, 0.07);
  }
  if (shutter && bloom && own(win, 5) < 0.8) {
    flowerBox(win, w, -h / 2 + 0.02, 0.2, bloom);
  }
  if (shutter) {
    const sw = w / 2;
    for (const s of [-1, 1]) {
      /* Folded back to the wall on its hinges, a little off it and not
       * quite flat, each by its own amount. */
      const ajar = 0.05 + 0.09 * (((seed * 7 + s * 3) % 5 + 5) % 5) / 4;
      const hx = s * (w / 2 + 0.04);
      win.put(near(`${shutter}`), box(sw, h + 0.02, 0.035), hx + s * Math.cos(ajar) * sw / 2, 0, 0.075 + Math.sin(ajar) * sw / 2, -s * ajar);
    }
  }
}

/*
 * A hanging basket off a wall at (x, y), `out` from it: a wrought arm, a
 * chain, the moss basket, and geraniums heaped on it with trailing green
 * spilling below. What an inn hangs by its door and under its Laube.
 */
export function hangingBasket(wall, x, y, out, bloom = 'geranium') {
  wall.put(near('ink'), box(0.03, 0.03, out + 0.05), x, y, out / 2);
  wall.put(detail('ink'), box(0.02, 0.2, 0.02), x, y - 0.06, 0.12, 0, -0.6);
  wall.put(detail('ink'), box(0.012, 0.3, 0.012), x, y - 0.15, out);
  wall.put(near('larchDark'), blob(), x, y - 0.42, out, 0.4, 0, 0, 0.2, 0.13, 0.2);
  wall.put(near('leaf'), blob(), x, y - 0.4, out, 0.9, 0, 0, 0.27, 0.16, 0.27);
  wall.put(detail('leaf'), blob(), x + 0.05, y - 0.62, out + 0.04, 0.2, 0, 0, 0.14, 0.22, 0.14);
  wall.put(detail('leaf'), blob(), x - 0.08, y - 0.58, out - 0.06, 1.3, 0, 0, 0.1, 0.18, 0.1);
  for (let k = 0; k < 4; k += 1) {
    const a = k * 1.7 + x;
    wall.put(detail(bloom), blob(), x + Math.cos(a) * 0.14, y - 0.3 - 0.06 * (k % 2), out + Math.sin(a) * 0.14, a, 0.4, 0, 0.1, 0.09, 0.1);
  }
}

/*
 * The dressing of a church's great door, over what doorway() draws: the
 * two leaves in raised panels, iron strap hinges across them, a ring on
 * each, a dressed stone lintel over the frame, and a second, wider step.
 * The doorway is w wide and h high at x.
 */
export function churchDoor(wall, x, w, h, y0 = SOCLE) {
  const d = frame(wall, x, y0, 0, 0);
  for (const s of [-1, 1]) {
    const cx = s * w / 4;
    for (const [py, ph] of [[0.25, h * 0.38], [0.35 + h * 0.4, h * 0.44]]) {
      d.put(near('larchDark'), box(w / 2 - 0.22, ph, 0.03), cx, py + ph / 2, 0.055);
    }
    for (const hy of [0.45, h * 0.5, h - 0.45]) {
      d.put(detail('ink'), box(w / 2 - 0.12, 0.06, 0.02), cx, hy, 0.075);
      d.put(detail('ink'), box(0.08, 0.08, 0.02), cx + s * (w / 4 - 0.15), hy, 0.085, Math.PI / 4);
    }
    d.put(detail('metal'), cached('s2doorring', () => new THREE.TorusGeometry(0.07, 0.012, 4, 10)), cx - s * (w / 4 - 0.14), h * 0.46, 0.09);
  }
  d.put(near('ink'), box(0.03, h, 0.05), 0, h / 2, 0.06);
  d.put(near('stone'), box(w + 0.7, 0.22, 0.2), 0, h + 0.3, 0.06);
  d.put('stone', box(w + 1.2, 0.14, 0.9), 0, -y0 + 0.07, 0.55);
}

/* A door in a heavy frame, the leaf set back, the step outside. */
export function doorway(wall, x, w, h, { key = 'larchDark', frameKey = 'larch', step = 'stone', y0 = SOCLE } = {}) {
  const d = frame(wall, x, y0 + h / 2, 0, 0);
  d.put(key, box(w, h, 0.04), 0, 0, 0.02);
  d.put(near(frameKey), ring(w + 0.3, h + 0.3, 0.15, 0.14), 0, 0, 0);
  d.put(detail('metal'), box(0.04, 0.04, 0.1), w / 2 - 0.12, 0, 0.08);
  if (step) {
    d.put(step, box(w + 0.6, y0 + 0.02, 0.55), 0, -h / 2 - y0 / 2 + 0.01, 0.27);
  }
}

/*
 * A Laube: the balcony the whole width of a face. The deck with its
 * thickness and its joist ends, a dark boarded back that is the shade
 * inside the balustrade, the sawn balusters in front of it, a handrail,
 * posts, consoles under the deck and flower boxes on brackets outside
 * the rail, red geraniums spilling over green. From the air the deck,
 * the rail and a red line along it are all there is (near-only keys).
 */
export function balcony(wall, len, { out = 1.3, board = 'larch', flowers = true } = {}) {
  wall.put(board, box(len, 0.14, out), 0, 0.07, out / 2);
  wall.put('shade', box(len - 0.1, 0.84, 0.03), 0, 0.14 + 0.42, out - 0.12);
  wall.put(detail('baluster'), balusterRow(len - 0.1, 0.82), 0, 0.14, out - 0.08);
  wall.put(board, box(len + 0.12, 0.08, 0.16), 0, 1.0, out - 0.08);
  wall.put(board, box(len, 0.06, 0.06), 0, 0.17, out - 0.07);
  const posts = Math.max(2, Math.round(len / 2.6));
  for (let k = 0; k <= posts; k += 1) {
    const x = -len / 2 + 0.07 + k * ((len - 0.14) / posts);
    wall.put(near(board), boxUp(0.12, 0.86, 0.12), x, 0.14, out - 0.08);
  }
  const consoles = Math.max(2, Math.round(len / 1.6));
  for (let k = 0; k < consoles; k += 1) {
    const x = -len / 2 + 0.3 + (k + 0.5) * ((len - 0.6) / consoles);
    wall.put(near(board), box(0.12, 0.2, out - 0.05), x, -0.1, (out - 0.05) / 2);
    /* The console's sawn nose under the deck edge. */
    wall.put(near(board), box(0.12, 0.14, 0.24), x, -0.25, out * 0.62, 0, -0.6);
  }
  if (!flowers) {
    return;
  }
  const boxLen = len - 0.6;
  wall.put('boardLine', box(boxLen, 0.2, 0.22), 0, 1.13, out + 0.08);
  wall.put('geranium', box(boxLen - 0.1, 0.08, 0.16), 0, 1.25, out + 0.08);
  /* Leaves in a loose mound along the box, the flower heads dotted over
   * it and some spilling down the front; turned every which way so no
   * two read as the same shape. */
  const n = Math.max(4, Math.round(boxLen / 0.45));
  for (let k = 0; k < n; k += 1) {
    const x = -boxLen / 2 + (k + 0.5) * (boxLen / n);
    const r = ((k * 37) % 11) / 11;
    const q = ((k * 53) % 13) / 13;
    wall.put(detail(leafShade(q)), blob(), x, 1.29, out + 0.1 + 0.04 * q, r * 3, q, 0, 0.3, 0.13, 0.17);
    wall.put(detail(bloomShade('geranium', r)), blob(), x - 0.1 + 0.08 * q, 1.4 + 0.05 * r, out + 0.06 + 0.1 * r, r * 5, 0.7, q, 0.09, 0.08, 0.09);
    wall.put(detail(bloomShade('geranium', q)), blob(), x + 0.1 - 0.06 * r, 1.36 + 0.04 * q, out + 0.18, q * 4, r, 0.5, 0.08, 0.07, 0.08);
    if (k % 2 === 0) {
      wall.put(detail(leafShade(r)), blob(), x + 0.05, 1.12, out + 0.21, r, 0.4, 0, 0.14, 0.16, 0.06);
    }
  }
}

/*
 * An outside stair up a wall to the first log storey, the way a Bernese
 * house reaches its upper floor: two stringers, open treads, a handrail
 * on posts, and a landing at the top by the door. The wall frame's x
 * runs along the wall; the stair climbs from `x0` toward `x1`.
 */
export function stair(wall, x0, x1, rise, key) {
  const run = Math.abs(x1 - x0) - 1.0;
  const dir = Math.sign(x1 - x0);
  const len = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  const mid = x0 + (dir * run) / 2;
  for (const z of [0.12, 0.98]) {
    wall.put(key, box(len, 0.24, 0.07), mid, rise / 2 + 0.05, z, 0, 0, dir * ang);
  }
  const steps = Math.round(rise / 0.2);
  for (let k = 1; k < steps; k += 1) {
    wall.put(near(key), box(0.3, 0.05, 0.86), x0 + dir * (k / steps) * run, (k / steps) * rise, 0.55);
  }
  const lx = x1 - (dir * 1.0) / 2;
  wall.put(key, box(1.0, 0.12, 1.1), lx, rise - 0.06, 0.6);
  for (const x of [x1, x1 - dir * 1.0]) {
    wall.put(key, boxUp(0.12, rise, 0.12), x, 0, 1.1);
  }
  wall.put(near(key), box(len, 0.07, 0.07), mid, rise / 2 + 0.95, 1.08, 0, 0, dir * ang);
  wall.put(near(key), boxUp(0.08, 0.95, 0.08), x0 + dir * 0.1, 0.05, 1.08);
  wall.put(key, box(1.1, 0.07, 0.07), lx, rise + 0.95, 1.1);
}

/*
 * THE MASONRY STOREY. A Bernese house stands its timber on a ground
 * floor of rubble walls sixty centimetres thick, rendered and limed, so
 * a window there sits deep in its opening with the reveal round it lit
 * and shadowed, and a door is let in under a lintel. The storey is a
 * core set back REVEAL behind the face, and a skin REVEAL thick with the
 * openings left in it: each wall's skin is the piers between its
 * openings and the pieces over and under them. An opening is
 * { x, y0, y1, w } in the wall's frame. The skin is only its faces that
 * show, the face and the reveals: a village of boxes was a third back
 * faces. Round its foot runs the socle, the stone band `band` high that
 * takes the splash, broken for a door; a wall's band runs `bandLen`,
 * round the corners.
 */
export const REVEAL = 0.2;

export function masonry(f, w, d, y0, h, key, walls, band) {
  f.put(key, boxUp(w - 2 * REVEAL, h, d - 2 * REVEAL), 0, y0, 0);
  const y1 = y0 + h;
  for (const { wall, len, openings, bandLen } of walls) {
    const doors = openings.filter((o) => o.y0 < y0 + band).sort((a, b) => a.x - b.x);
    let bx = -bandLen / 2;
    for (const o of [...doors, { x: bandLen / 2, w: 0 }]) {
      const xa = o.x - o.w / 2 - 0.12;
      if (xa - bx > 0.01) {
        wall.put('stone', boxUp(xa - bx, band, 0.08), (bx + xa) / 2, y0, 0.02);
      }
      bx = o.x + o.w / 2 + 0.12;
    }
    const holes = [...openings].sort((a, b) => a.x - b.x);
    const face = (xa, xb, ya, yb) => {
      if (xb - xa > 0.01 && yb - ya > 0.01) {
        wall.put(key, plate(xb - xa, yb - ya), (xa + xb) / 2, (ya + yb) / 2, 0);
      }
    };
    const side = (x, ya, yb, turn) => wall.put(key, plate(REVEAL, yb - ya), x, (ya + yb) / 2, -REVEAL / 2, turn);
    let x = -len / 2;
    side(x, y0, y1, -Math.PI / 2);
    for (const o of holes) {
      const xa = o.x - o.w / 2;
      const xb = o.x + o.w / 2;
      face(x, xa, y0, y1);
      face(xa, xb, y0, o.y0);
      face(xa, xb, o.y1, y1);
      /* The reveals: the jambs, the sill's top and the lintel's soffit. */
      side(xa, o.y0, o.y1, Math.PI / 2);
      side(xb, o.y0, o.y1, -Math.PI / 2);
      if (o.y0 > y0 + 0.01) {
        wall.put(key, plate(o.w, REVEAL), o.x, o.y0, -REVEAL / 2, 0, -Math.PI / 2);
      }
      wall.put(key, plate(o.w, REVEAL), o.x, o.y1, -REVEAL / 2, 0, Math.PI / 2);
      x = xb;
    }
    face(x, len / 2, y0, y1);
    side(len / 2, y0, y1, Math.PI / 2);
  }
}

/* A window in the masonry: its frame and glass back in the opening, the
 * limed band round the opening on the face, a stone sill standing out
 * under it, the shutters folded back against the face. Returns the
 * opening. */
export function deepWindow(wall, x, y, w, h, { shutter = null, seed = 0, surround = 'surround', bloom = null } = {}) {
  const win = frame(wall, x, y, -REVEAL, 0);
  win.put('glass:o', plate(w - 0.1, h - 0.1), 0, 0, 0.03);
  win.put(detail('trim'), ring(w, h, 0.08, 0.08), 0, 0, 0);
  win.put(detail('trim'), plate(0.05, h - 0.14), 0, 0, 0.06);
  win.put(detail('trim'), plate(w - 0.14, 0.035), 0, h * 0.17, 0.06);
  win.put(detail('trim'), plate(w - 0.14, 0.035), 0, -h * 0.17, 0.06);
  const face = frame(wall, x, y, 0, 0);
  face.put(near(surround), ring(w + 0.34, h + 0.34, 0.17, 0.015, false), 0, 0, 0);
  face.put(near('stone'), box(w + 0.3, 0.07, REVEAL + 0.07), 0, -h / 2 - 0.035, -REVEAL / 2 + 0.035);
  if (shutter && bloom && own(face, 5) < 0.65) {
    flowerBox(face, w, -h / 2 - 0.02, 0.07, bloom);
  }
  if (shutter) {
    for (const s of [-1, 1]) {
      const ajar = 0.05 + 0.09 * (((seed * 7 + s * 3) % 5 + 5) % 5) / 4;
      const sw = w / 2;
      const hx = s * (w / 2 + 0.16);
      face.put(near(shutter), box(sw, h + 0.02, 0.035), hx + s * Math.cos(ajar) * sw / 2, 0, 0.04 + Math.sin(ajar) * sw / 2, -s * ajar);
    }
  }
  return { x, y0: y - h / 2, y1: y + h / 2, w };
}

/* A door let into the masonry under its lintel: the leaf back in the
 * opening, the stone surround on the face, the threshold and the step
 * out, and over it a little roof on two brackets. Returns the opening. */
export function deepDoor(wall, x, w, h, { key = 'larchDark', frameKey = 'stone', roofKey = null, board = 'larch', y0 = SOCLE } = {}) {
  const d = frame(wall, x, y0 + h / 2, 0, 0);
  d.put(`${key}:v`, box(w, h, 0.05), 0, 0, -REVEAL + 0.06);
  d.put(near('boardLine'), box(0.03, h, 0.02), 0, 0, -REVEAL + 0.1);
  d.put(detail('metal'), box(0.04, 0.04, 0.1), w / 2 - 0.12, -0.05, -REVEAL + 0.12);
  d.put(near(frameKey), ring(w + 0.3, h + 0.15, 0.15, 0.05), 0, 0.075, 0);
  d.put('stone', box(w + 0.1, 0.05, REVEAL + 0.02), 0, -h / 2 + 0.02, -REVEAL / 2);
  d.put('stone', box(w + 0.7, y0 + 0.02, 0.6), 0, -h / 2 - y0 / 2 + 0.01, 0.3);
  if (roofKey) {
    const ry = h / 2 + 0.45;
    d.put(roofKey, box(w + 0.9, 0.06, 1.05), 0, ry, 0.5, 0, 0.28);
    d.put(near(board), box(w + 0.9, 0.12, 0.05), 0, ry - 0.2, 1.02);
    for (const s of [-1, 1]) {
      d.put(near(board), box(0.1, 0.1, 0.95), s * (w / 2 + 0.3), ry - 0.15, 0.5);
      d.put(near(board), box(0.09, 0.09, 0.7), s * (w / 2 + 0.3), ry - 0.42, 0.26, 0, -0.75);
    }
  }
  return { x, y0, y1: y0 + h, w };
}

/* A bench against a wall, the old kind: a plank on two stub legs and a
 * back rail. */
export function wallBench(wall, x, len) {
  wall.put('fence', box(len, 0.05, 0.36), x, 0.47, 0.22);
  wall.put(near('fence'), box(len, 0.1, 0.04), x, 0.8, 0.04);
  for (const s of [-1, 1]) {
    wall.put(near('larchDark'), boxUp(0.08, 0.45, 0.3), x + s * (len / 2 - 0.12), 0, 0.22);
  }
}

/* The strip of gravel round a house's foot that keeps the splash off
 * the wall. */
export function dripEdge(f, w, d, key = 'dripEdge') {
  const o = 0.45;
  f.put(key, box(w + 0.24 + 2 * o, 0.14, o), 0, -0.06, d / 2 + 0.12 + o / 2);
  f.put(key, box(w + 0.24 + 2 * o, 0.14, o), 0, -0.06, -d / 2 - 0.12 - o / 2);
  f.put(key, box(o, 0.14, d + 0.24), w / 2 + 0.12 + o / 2, -0.06, 0);
  f.put(key, box(o, 0.14, d + 0.24), -w / 2 - 0.12 - o / 2, -0.06, 0);
}

/* A stack of split logs under the eaves, cut ends out, a little uneven. */
export function woodpile(wall, x, len, rows = 3) {
  const log = cached('s2log', () => new THREE.CylinderGeometry(0.12, 0.12, 0.5, 5, 1, true).rotateX(Math.PI / 2));
  const cut = cached('s2logend', () => new THREE.CircleGeometry(0.12, 5));
  const n = Math.max(2, Math.floor(len / 0.26));
  for (let r = 0; r < rows; r += 1) {
    const count = n - (r % 2);
    for (let k = 0; k < count; k += 1) {
      const lx = x - ((count - 1) * 0.26) / 2 + k * 0.26;
      const jut = ((k * 13 + r * 7) % 5) * 0.025;
      wall.put(near('larchDark'), log, lx, 0.13 + r * 0.23, 0.28 + jut, 0, 0, k + r);
      wall.put(detail('logEnd'), cut, lx, 0.13 + r * 0.23, 0.531 + jut, 0, 0, k + r);
    }
  }
  wall.put('larchDark', box(len + 0.1, rows * 0.23 + 0.05, 0.4), x, (rows * 0.23 + 0.05) / 2 + 0.02, 0.27);
}

/* The stone plinth under a footprint, from the cut foundation up, and a
 * socle band standing out round the foot of the walls. */
export function plinth(f, w, d, found, band = true) {
  f.put('stone', box(w + 0.2, found + SOCLE, d + 0.2), 0, (SOCLE - found) / 2, 0);
  if (band) {
    f.put('stone', boxUp(w + 0.12, 0.42, d + 0.12), 0, SOCLE, 0);
  }
}

/* A chimney through the roof: a stone stack, a projecting cap, and the
 * little gabled hood on four posts that keeps the snow out. */
export function chimney(f, x, z, y0, y1, roofKey) {
  f.put('stone', boxUp(0.72, y1 - y0, 0.72), x, y0, z);
  f.put('stone', box(0.88, 0.1, 0.88), x, y1 + 0.05, z);
  for (const [px, pz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    f.put(detail('ink'), boxUp(0.06, 0.34, 0.06), x + px, y1 + 0.1, z + pz);
  }
  for (const s of [-1, 1]) {
    f.put(roofKey, box(0.6, 0.05, 1.05), x + s * 0.26, y1 + 0.54, z, 0, 0, -s * 0.45);
  }
}

/* Log corners: in a Strickbau the logs of each wall run on past the
 * corner, so every corner is a stack of log ends standing out of both
 * faces. Two stacks per corner, one out of each face. */
export function logCorners(f, key, hw, hd, y0, y1) {
  const h = y1 - y0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.put(near(key), boxUp(0.34, h, 0.2), sx * (hw + 0.13), y0, sz * (hd - 0.12));
      f.put(near(key), boxUp(0.2, h, 0.34), sx * (hw - 0.12), y0, sz * (hd + 0.13));
    }
  }
}

/* A carved frieze beam across a face, proud of the logs: the Bernese
 * facade's horizontal lines, under the sills and at every floor. */
export function frieze(wall, len, y, key = 'frieze') {
  wall.put(key, box(len, 0.2, 0.07), 0, y, 0.035);
}

/*
 * A roof, dressed. The shell is alps/kit.js's roofShell, so the eaves,
 * the ridge and the house's height are what the cel village has; on it
 * go thick fascia and verge boards in the house's timber, a lip where the
 * first course overhangs the eave, the ridge cap, rafter tails under the
 * long eaves, and under the gable overhangs the purlins running out to
 * their ends with a bracket under each. `rf` is the roof's frame (y 0 at
 * the wall plate).
 */
export function dressRoof(rf, roof, { roofKey, key, edgeKey = key, snowGuard = false, rafters = true, purlins = true }) {
  const { yT, yR, ex, zA, zB, rzA, rzB, dy, tanP, hw } = roof;
  const slope = Math.atan(tanP);
  for (const [a, b] of roof.edges) {
    const dx = b[0] - a[0];
    const dyy = b[1] - a[1];
    const dz = b[2] - a[2];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    if (Math.abs(dz) > Math.abs(dx)) {
      /* A long eave has no board: the shell's own edge is the covering's
       * thickness, the first course doubled over it and run out past the
       * rafter tails. */
      const len = Math.abs(dz) + 0.04;
      const out = Math.sign(mid[0]) || Math.sign(dz);
      rf.put(roofKey, box(0.4, 0.035, len), mid[0] - out * 0.16, mid[1] + 0.16 * tanP + 0.018, mid[2], 0, 0, -out * slope);
    } else {
      const len = Math.hypot(dx, dyy) + 0.14;
      const ang = Math.atan2(dyy, dx);
      const out = Math.sign(mid[2]);
      let nx = Math.sin(ang);
      let ny = -Math.cos(ang);
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      rf.put(edgeKey, box(len, 0.36, 0.08), mid[0] + nx * 0.12, mid[1] + ny * 0.12, mid[2] + out * 0.04, 0, 0, ang);
    }
  }
  const ridgeLen = rzB - rzA;
  if (ridgeLen > 0.2) {
    rf.put(roofKey, box(0.38, 0.16, ridgeLen + 0.12), 0, yR - 0.01, (rzA + rzB) / 2);
  }
  /* Under the roof the shell's underside is (hw - |x|) tan over the
   * plate. */
  const under = (x) => (hw - Math.abs(x)) * tanP;
  if (rafters) {
    const n = Math.max(3, Math.round((zB - zA) / 1.35));
    const ov = ex - hw;
    for (const side of [-1, 1]) {
      for (let k = 0; k < n; k += 1) {
        const z = zA + 0.35 + (k + 0.5) * ((zB - zA - 0.7) / n);
        const len = ov + 0.4;
        const cx = side * (ex - len / 2 - 0.06);
        rf.put(near(key), box(len, 0.15, 0.11), cx, under(cx) - 0.075, z, 0, 0, -side * slope);
      }
    }
  }
  if (purlins && roof.kind !== 'hip') {
    /* The purlins that show: the ridge, one each side half way down and
     * the two wall plates. On a half hip only those under the hip's foot
     * reach the gable. */
    const hipFoot = roof.kind === 'halfhip' ? roof.yH - dy - 0.05 : Infinity;
    for (const x of [0, -hw * 0.5, hw * 0.5, -hw + 0.1, hw - 0.1]) {
      const top = under(x);
      if (top > hipFoot) {
        continue;
      }
      const za = zA + 0.15;
      const zb = zB - 0.15;
      rf.put(near(key), box(0.2, 0.26, zb - za), x, top - 0.13, (za + zb) / 2);
      for (const [end, ov] of [[za, roof.zA0], [zb, roof.zB0]]) {
        if (ov < 0.5) {
          continue;
        }
        /* A bracket from the wall up and out to the purlin's end. */
        const s = Math.sign(end);
        const wallZ = s * roof.hd;
        const reach = Math.min(ov * 0.7, 1.0);
        const rise = reach * 1.1;
        const len = Math.hypot(reach, rise);
        rf.put(near(key), box(0.14, 0.14, len), x, top - 0.2 - rise / 2, wallZ + s * reach / 2, 0, -s * Math.atan2(rise, reach), 0);
      }
    }
  }
  if (snowGuard) {
    /* On shingle a squared log held by iron hooks, the old way; on
     * slate a pair of iron rails. */
    const iron = roofKey === 'slate';
    for (const side of [-1, 1]) {
      const x = side * (ex - 0.8);
      const ySurf = yT + 0.8 * tanP;
      const len = zB - zA - 0.8;
      if (iron) {
        rf.put(detail('metal'), box(0.05, 0.05, len), x, ySurf + 0.24, 0);
        rf.put(detail('metal'), box(0.05, 0.05, len), x, ySurf + 0.12, 0);
      } else {
        rf.put(near(key), box(0.16, 0.16, len), x, ySurf + 0.13, 0, 0, 0, -side * slope * 0.5);
      }
      const n = Math.max(2, Math.round((zB - zA) / 2.5));
      for (let k = 0; k < n; k += 1) {
        const z = zA + 0.5 + (k + 0.5) * ((zB - zA - 1) / n);
        rf.put(detail('ink'), box(0.04, 0.3, 0.04), x + side * 0.1, ySurf + 0.1, z);
      }
    }
  }
}

/*
 * An old roof sags between its gables. A frame over the roof's own whose
 * put() cuts each part at the thirds of the roof's length and lowers it
 * by `sag` times a half sine along the ridge, so the shell, its boards,
 * the ridge cap and the purlins under it all dip together and nothing
 * parts from anything. Three cuts and a crease too slight to shade are
 * cheaper than a curved roof and read the same from the street.
 */
function sagFrame(rf, roof, sag) {
  const { zA, zB } = roof;
  const cuts = [zA + (zB - zA) / 3, zA + (2 * (zB - zA)) / 3];
  const dip = (z) => sag * Math.sin(Math.PI * Math.min(1, Math.max(0, (z - zA) / (zB - zA))));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const put = (key, geometry, lx = 0, ly = 0, lz = 0, lry = 0, lrx = 0, lrz = 0, sx = 1, sy = 1, sz = 1) => {
    e.set(lrx, lry, lrz);
    m.compose(p.set(lx, ly, lz), q.setFromEuler(e), sc.set(sx, sy, sz));
    const src = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    src.applyMatrix4(m);
    let tris = [];
    const pos = src.getAttribute('position');
    for (let i = 0; i < pos.count; i += 3) {
      tris.push([0, 1, 2].map((k) => [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)]));
    }
    src.dispose();
    for (const c of cuts) {
      tris = tris.flatMap((t) => cutAt(t, c));
    }
    const out = [];
    for (const t of tris) {
      for (const v of t) {
        out.push(v[0], v[1] - dip(v[2]), v[2]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((out.length / 3) * 2), 2));
    rf.put(key, g);
    g.dispose();
  };
  return { ...rf, put };
}

/* A triangle cut by the plane z = c into the pieces either side of it,
 * each wound as the original was. */
function cutAt(t, c) {
  const side = t.map((v) => v[2] < c);
  const below = side.filter(Boolean).length;
  if (below === 0 || below === 3) {
    return [t];
  }
  /* Rotate so the lone vertex is first; winding is kept. */
  const lone = side.findIndex((s) => (below === 1 ? s : !s));
  const a = t[lone];
  const b = t[(lone + 1) % 3];
  const d = t[(lone + 2) % 3];
  const at = (u, v) => {
    const k = (c - u[2]) / (v[2] - u[2]);
    return [u[0] + (v[0] - u[0]) * k, u[1] + (v[1] - u[1]) * k, c];
  };
  const ab = at(a, b);
  const ad = at(a, d);
  return [[a, ab, ad], [ab, b, d], [ab, d, ad]];
}

/*
 * The upper storeys of a timber house: the log walls as one solid whose
 * profile closes the gable under the roof (alps/kit.js's shape, so the
 * house is as tall as the cel one), vertical boarding over the gable, the
 * roof and its dressing, and the chimney.
 */
export function timberTop(f, {
  w, d, y0, floors, floorH, kind, key, roofKey, ov, ovA = ov, ovB = ov, pitch, snowGuard, chimneyAt, f: hipF = 0.5,
  purlins = true, rafters = true, gableBoards = true, edgeKey = key, sag = 0, solar = false, dormer = false,
}) {
  if (kind === 'hip') {
    ovA = ov;
    ovB = ov;
  }
  const hw = w / 2;
  const hd = d / 2;
  const plate = y0 + floors * floorH;
  const roof = roofShell({ kind, hw, hd, ov, ovA, ovB, pitch, f: hipF });
  Object.assign(roof, { hw, hd, kind, zA0: ovA, zB0: ovB });
  const gable = gableProfile(roof, kind, hw);
  const profile = [[hw, y0], ...gable.map(([x, y]) => [x, y + plate]), [-hw, y0]];
  f.put(key, prism(profile, -hd, hd));
  if (gableBoards && kind !== 'hip') {
    /* The gable's boards, standing on the plate, a few centimetres out. */
    const tri = gable.map(([x, y]) => [x * 0.99, y + plate - 0.02]);
    for (const s of [-1, 1]) {
      f.put(`${key}:v`, prism(tri, s > 0 ? hd : -hd - 0.04, s > 0 ? hd + 0.04 : -hd));
    }
  }
  const flat = frame(f, 0, plate, 0, 0);
  const rf = sag > 0 ? sagFrame(flat, roof, sag) : flat;
  rf.put(roofKey, roof.geo);
  dressRoof(rf, roof, { roofKey, key, edgeKey, snowGuard, purlins, rafters });
  if (solar && kind !== 'hip' && sag === 0) {
    solarArray(flat, roof);
  }
  if (dormer && kind !== 'hip') {
    dormerOn(flat, roof, key, roofKey, chimneyAt ? -Math.sign(chimneyAt[1] || 1) : 1);
  }
  if (chimneyAt) {
    chimney(f, chimneyAt[0], chimneyAt[1], plate - 0.5, plate + roof.yR + 0.8, roofKey);
  }
  return { roof, plate, top: plate + roof.yR + 0.9 };
}

/*
 * A window box, the Oberland's signature: a board trough on two iron
 * brackets under the sill, the leaves in a loose mound, the geraniums
 * over them and trailing down its front. `y` is the trough's top and
 * `z` its back, in the window's frame. From the air a window box is a
 * red dash under every window, which is what a Bernese street is.
 */
export function flowerBox(win, w, y, z, bloom) {
  const len = w + 0.12;
  win.put(near('boardLine'), box(len, 0.17, 0.2), 0, y - 0.085, z + 0.1);
  for (const s of [-1, 1]) {
    win.put(detail('ink'), box(0.03, 0.03, 0.2), s * (len / 2 - 0.12), y - 0.19, z + 0.1);
  }
  const n = Math.max(3, Math.round(len / 0.26));
  const seed = own(win, 9) * 7;
  for (let k = 0; k < n; k += 1) {
    const x = -len / 2 + (k + 0.5) * (len / n);
    const r = ((k * 37 + seed * 11) % 11) / 11;
    const q = ((k * 53 + seed * 5) % 13) / 13;
    win.put(detail(leafShade(q)), blob(), x, y + 0.05, z + 0.1 + 0.04 * q, r * 3, q, 0, 0.19, 0.12, 0.14);
    win.put(detail(bloomShade(bloom, r)), blob(), x - 0.05 + 0.08 * q, y + 0.15 + 0.06 * r, z + 0.08 + 0.08 * r, r * 5, 0.7, q, 0.085, 0.075, 0.085);
    win.put(detail(bloomShade(bloom, q)), blob(), x + 0.07 - 0.06 * r, y + 0.11 + 0.05 * q, z + 0.2, q * 4, r, 0.5, 0.075, 0.065, 0.075);
    if (k % 2 === 0) {
      win.put(detail(leafShade(r)), blob(), x + 0.04, y - 0.12, z + 0.22, r, 0.4, 0, 0.12, 0.17, 0.05);
      win.put(detail(bloomShade(bloom, (r + q) % 1)), blob(), x + 0.02, y - 0.2 - 0.06 * q, z + 0.24, q, r, 0, 0.06, 0.06, 0.05);
    }
  }
}

/*
 * A climber on a wall: ivy in a mat that thins and gives out raggedly
 * at its top, or a rose on its trellis with the flowers dotted through
 * it. Leaves flat to the face, `z` off it; `h` is how high the tallest
 * run reaches. Near only and shadowless: from twenty metres a climber is
 * a dark green shape on a pale wall, and that shape is all it has to be.
 */
export function climber(wall, x, y0, w, h, { rose = null } = {}) {
  const cols = Math.max(2, Math.round(w / 0.3));
  const seed = own(wall, 17) * 13;
  const hash = (a, b) => {
    const v = Math.sin(a * 12.9898 + b * 78.233 + seed) * 43758.5453;
    return v - Math.floor(v);
  };
  if (rose) {
    for (let k = 0; k <= cols; k += 2) {
      wall.put(detail('larchDark'), box(0.03, h, 0.03), x - w / 2 + (k / cols) * w, y0 + h / 2, 0.03);
    }
  }
  for (let c = 0; c < cols; c += 1) {
    const edge = Math.min(c + 0.5, cols - c - 0.5) / (cols / 2);
    const colH = h * (0.35 + 0.65 * Math.sqrt(edge)) * (0.75 + 0.25 * hash(c, 1));
    const rows = Math.max(1, Math.round(colH / 0.26));
    for (let r = 0; r < rows; r += 1) {
      const u = hash(c, r + 3);
      const v = hash(r, c + 7);
      const lx = x - w / 2 + (c + 0.5) * (w / cols) + (u - 0.5) * 0.16;
      const ly = y0 + 0.12 + r * (colH / rows) + (v - 0.5) * 0.12;
      const leafKey = (u + v) % 1 < 0.5 ? 'ivy' : 'ivyLight';
      wall.put(detail(leafKey), blob(), lx, ly, 0.07 + 0.05 * v, u * 6, 0, v * 3, 0.21, 0.18, 0.07);
      if (rose && u > 0.55) {
        wall.put(detail(rose), blob(), lx + 0.05, ly + 0.04, 0.14, v * 4, u, 0, 0.055, 0.05, 0.05);
      }
    }
  }
}

/*
 * A painted band across a rendered face: the frieze a village painter
 * put under the eaves of the masonry storey, a ground in one colour and
 * a row of lozenges in another between two ruled lines. Plates on the
 * face, near only: from the street it is the thing that says this house
 * was decorated, from the air it is a coloured line.
 */
export function paintedBand(wall, len, y, [ground, figure]) {
  wall.put(detail(ground), plate(len, 0.3), 0, y, 0.012);
  for (const dy of [-0.17, 0.17]) {
    wall.put(detail(figure), plate(len, 0.035), 0, y + dy, 0.014);
  }
  const n = Math.max(2, Math.round(len / 0.55));
  for (let k = 0; k < n; k += 1) {
    wall.put(detail(figure), plate(0.15, 0.15), -len / 2 + (k + 0.5) * (len / n), y, 0.016, 0, 0, Math.PI / 4);
  }
}

/* Painted quoins up a rendered storey's corners, long and short in
 * turn, on both faces that meet there. */
export function paintedQuoins(f, hw, hd, y0, h, key) {
  for (let k = 0; k * 0.5 < h - 0.3; k += 1) {
    const y = y0 + 0.25 + k * 0.5;
    const long = k % 2 === 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        f.put(detail(key), box(long ? 0.6 : 0.36, 0.4, 0.02), sx * (hw - (long ? 0.3 : 0.18)), y, sz * (hd + 0.012));
        f.put(detail(key), box(0.02, 0.4, long ? 0.36 : 0.6), sx * (hw + 0.012), y, sz * (hd - (long ? 0.18 : 0.3)));
      }
    }
  }
}

/*
 * Solar panels on the +x slope, the way the valley has put them on its
 * old roofs since the subsidies: a dark array in a thin aluminium frame
 * standing a hand's breadth off the covering, below the snow guard's
 * line and clear of the verges. From the air they are the one hard,
 * glassy rectangle on a roof, and that is the tell they are there to be.
 */
function solarArray(rf, roof) {
  const { ex, yT, tanP, zA, zB } = roof;
  const slope = Math.atan(tanP);
  const L = Math.min(3.4, ex - 2.4);
  const W = Math.min(6.2, zB - zA - 3.2);
  if (L < 1.6 || W < 2) {
    return;
  }
  const u = 1.3 + L / 2;
  const along = L / Math.cos(slope);
  const x = ex - u;
  const y = yT + u * tanP + 0.09;
  const z = (zA + zB) / 2 - 0.4;
  rf.put('solar', box(along, 0.04, W), x, y, z, 0, 0, -slope);
  const rows = Math.max(1, Math.round(along / 1.7));
  const cols = Math.max(1, Math.round(W / 1.05));
  const n = Math.cos(slope);
  const t = Math.sin(slope);
  for (let r = 0; r <= rows; r += 1) {
    const s = -along / 2 + (r / rows) * along;
    rf.put(detail('flashing'), box(0.04, 0.012, W), x + s * n, y + 0.024 - s * t, z, 0, 0, -slope);
  }
  for (let c = 0; c <= cols; c += 1) {
    rf.put(detail('flashing'), box(along, 0.012, 0.03), x, y + 0.024, z - W / 2 + (c / cols) * W, 0, 0, -slope);
  }
}

/*
 * A dormer on the -x slope: timber cheeks and front standing out of the
 * roof, a window in the front with its own little gable roof over it,
 * the kind a loft was made a room with. `side` is which half of the
 * house it goes to along the ridge, away from the chimney.
 */
function dormerOn(rf, roof, key, roofKey, side) {
  const { ex, yT, tanP, zA, zB } = roof;
  const front = 2.0;
  const h = 1.35;
  const back = front + h / tanP;
  if (back > ex - 0.4) {
    return;
  }
  const wd = 1.9;
  const z = side * (zB - zA) * 0.22;
  const xF = -(ex - front);
  const xB = -(ex - back);
  const yb = yT + front * tanP;
  const yt = yb + h;
  rf.put(key, boxUp(xB - xF, h + 0.4, wd), (xF + xB) / 2, yb - 0.4, z);
  const face = frame(rf, xF, 0, z, -Math.PI / 2);
  casement(face, 0, yb + 0.72, 0.9, 0.85, { key, bars: true });
  const pitch = 0.62;
  const half = wd / 2 + 0.35;
  const rise = half * Math.tan(pitch);
  face.put(`${key}:v`, prism([[-wd / 2, yt], [wd / 2, yt], [0, yt + (wd / 2) * Math.tan(pitch)]], -0.04, 0));
  const len = xB - xF + 0.45;
  for (const s of [-1, 1]) {
    rf.put(roofKey, box(len, 0.07, half / Math.cos(pitch)), xF - 0.45 + len / 2, yt + rise / 2 + 0.05, z + s * half / 2, 0, s * pitch, 0);
  }
}
