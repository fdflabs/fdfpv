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

/* A leafy mound or a flower head: an octahedron, squashed by the put. */
function blob() {
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
export function casement(wall, x, y, w, h, { shutter = null, bars = true, sill = true, key = null, seed = 0 } = {}) {
  const win = frame(wall, x, y, 0, 0);
  win.put('glass:o', plate(w - 0.12, h - 0.12), 0, 0, 0.02);
  win.put(near('trim'), ring(w, h, 0.09, 0.11), 0, 0, 0);
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
  wall.put(near(board), balusterRow(len - 0.1, 0.82), 0, 0.14, out - 0.08);
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
    wall.put(detail('leaf'), blob(), x, 1.29, out + 0.1 + 0.04 * q, r * 3, q, 0, 0.3, 0.13, 0.17);
    wall.put(detail('geranium'), blob(), x - 0.1 + 0.08 * q, 1.4 + 0.05 * r, out + 0.06 + 0.1 * r, r * 5, 0.7, q, 0.09, 0.08, 0.09);
    wall.put(detail('geranium'), blob(), x + 0.1 - 0.06 * r, 1.36 + 0.04 * q, out + 0.18, q * 4, r, 0.5, 0.08, 0.07, 0.08);
    if (k % 2 === 0) {
      wall.put(detail('leaf'), blob(), x + 0.05, 1.12, out + 0.21, r, 0.4, 0, 0.14, 0.16, 0.06);
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
export function plinth(f, w, d, found) {
  f.put('stone', box(w + 0.2, found + SOCLE, d + 0.2), 0, (SOCLE - found) / 2, 0);
  f.put('stone', boxUp(w + 0.12, 0.42, d + 0.12), 0, SOCLE, 0);
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
    for (const side of [-1, 1]) {
      const x = side * (ex - 0.7);
      const ySurf = yT + 0.7 * tanP;
      rf.put(detail('metal'), box(0.05, 0.05, zB - zA - 0.8), x, ySurf + 0.24, 0);
      const n = Math.max(2, Math.round((zB - zA) / 3));
      for (let k = 0; k < n; k += 1) {
        const z = zA + 0.5 + (k + 0.5) * ((zB - zA - 1) / n);
        rf.put(detail('metal'), box(0.04, 0.3, 0.04), x, ySurf + 0.1, z);
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
  purlins = true, rafters = true, gableBoards = true, edgeKey = key, sag = 0,
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
  if (chimneyAt) {
    chimney(f, chimneyAt[0], chimneyAt[1], plate - 0.5, plate + roof.yR + 0.8, roofKey);
  }
  return { roof, plate, top: plate + roof.yR + 0.9 };
}
