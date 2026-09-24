/*
 * kit.js: what the photographic valley's vehicles are made of.
 *
 * A vehicle is a list of parts, each carrying its colour and its finish
 * on every vertex, baked into one geometry and drawn with one material
 * (materials.js), as the cel vehicles are (alps/parts.js). A finish is
 * how the surface meets the light: car paint under a clear coat, black
 * plastic, rubber, chrome, a lamp's lens, the grey inside a cabin where
 * the sky does not reach. Glass is the other list: it is drawn apart, see
 * through, so the seats show behind it.
 *
 * The pieces here are the shapes a car body is: sweep() runs a rounded
 * section along the length, so a flank, a bonnet and a roof curve into
 * each other and the clear coat has a surface to run a reflection along;
 * quad() and strut() lay glass and pillars between named points; the
 * wheels are turned, a tyre with its shoulders and grooves on a rim.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAINT, wheelGeometry } from '../../alps/vehicles.js';

/*
 * A finish: c the colour (sRGB, as the cel PAINT table gives it), r the
 * roughness, m the metalness (negative: the surface glows, a lamp that
 * is on, by that much), k the clear coat, ao how much of the sky reaches
 * it (1 outside, less in a cabin or a wheel well).
 */
export const fin = (c, r, m = 0, k = 0, ao = 1) => ({ c, r, m, k, ao });

export const FIN = {
  paint: (c) => fin(c, 0.32, 0, 1),
  /* Unpainted textured plastic, the bumpers and cladding of a real car
   * and every bus's skirt: not black, a dark grey with a dull sheen. */
  plastic: fin(0x1d1f22, 0.62, 0, 0.1),
  trim: fin(0x0e0f10, 0.35, 0, 0.6),
  rubber: fin(0x151516, 0.88),
  sidewall: fin(0x1c1c1e, 0.8),
  chrome: fin(0xe8eaec, 0.12, 1),
  alloy: fin(0xb9bcbf, 0.3, 1, 0.4),
  steel: fin(0x8a8d90, 0.45, 1),
  disc: fin(0x6a6660, 0.55, 1),
  /* The glass the far vehicles are drawn with, opaque: dark and
   * mirror smooth, the sky in it. */
  glassFar: fin(0x0b1014, 0.04, 0, 1),
  lens: fin(0xd8dde2, 0.08, 0, 1),
  lensRed: fin(0x8a0a08, 0.1, 0, 1),
  lensAmber: fin(0xd06a08, 0.12, 0, 1),
  /* Daytime running lights: a Swiss car drives with them on. */
  drl: fin(0xfff4e0, 0.2, -3.5, 0),
  plate: fin(0xf2f2ee, 0.4, 0, 0.3),
  plateInk: fin(0x111111, 0.5),
  seat: fin(0x2a2c30, 0.9, 0, 0, 0.35),
  cabin: fin(0x1e2022, 0.85, 0, 0, 0.3),
  headliner: fin(0x8c8a86, 0.9, 0, 0, 0.35),
  well: fin(0x0c0c0d, 0.9, 0, 0, 0.3),
};

/* The cel PAINT colours the far vehicles are built in, and the finish
 * each means; anything else is a body colour, painted. */
const BY_PAINT = new Map([
  [PAINT.glass, FIN.glassFar],
  [PAINT.tyre, FIN.rubber],
  [PAINT.rim, FIN.alloy],
  [PAINT.chrome, FIN.chrome],
  [PAINT.lampF, FIN.lens],
  [PAINT.lampR, FIN.lensRed],
  [PAINT.black, FIN.plastic],
  [PAINT.dark, FIN.plastic],
  [PAINT.hay, fin(PAINT.hay, 0.95)],
]);

const C = new THREE.Color();

/* A geometry as the merge wants it: unindexed, position and normal only,
 * the finish written on every vertex. */
function finished(geometry, f) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.getAttribute('position').clone());
  if (!src.getAttribute('normal')) {
    src.computeVertexNormals();
  }
  g.setAttribute('normal', src.getAttribute('normal').clone());
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const fn = new Float32Array(n * 4);
  C.set(f.c);
  for (let i = 0; i < n; i += 1) {
    col[i * 3] = C.r;
    col[i * 3 + 1] = C.g;
    col[i * 3 + 2] = C.b;
    fn[i * 4] = f.r;
    fn[i * 4 + 1] = f.m;
    fn[i * 4 + 2] = f.k;
    fn[i * 4 + 3] = f.ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('s2Fin', new THREE.BufferAttribute(fn, 4));
  return g;
}

/*
 * A parts list. push(finish, geometry, x, y, z, ry, rx, rz, sx, sy, sz)
 * places a copy of the geometry with its finish on it; pushBaked places
 * one that already carries its own (a wheel). bake() merges the lot.
 */
export function makeKit() {
  const list = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const place = (g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    e.set(rx, ry, rz);
    m.compose(p.set(x, y, z), q.setFromEuler(e), s.set(sx, sy, sz));
    g.applyMatrix4(m);
    /* A mirrored part turns inside out; wind it back. */
    if (sx * sy * sz < 0) {
      const a = g.getAttribute('position').array;
      const nn = g.getAttribute('normal').array;
      for (const arr of [a, nn]) {
        for (let i = 0; i < arr.length; i += 9) {
          for (let k = 0; k < 3; k += 1) {
            const t = arr[i + 3 + k];
            arr[i + 3 + k] = arr[i + 6 + k];
            arr[i + 6 + k] = t;
          }
        }
      }
    }
    list.push(g);
    return g;
  };
  const push = (f, geometry, ...at) => place(finished(geometry, f), ...at);
  const pushBaked = (geometry, ...at) => place(geometry.clone(), ...at);
  const bake = () => {
    const g = mergeGeometries(list, false);
    for (const x of list) {
      x.dispose();
    }
    list.length = 0;
    return g;
  };
  return { list, push, pushBaked, bake };
}

/* Copy every part of `src` into `dst`, placed at (x, y, z) and yawed. */
export function placeKit(dst, src, x, y, z, ry) {
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  for (const g of src.list) {
    const c = g.clone();
    c.applyMatrix4(m);
    dst.list.push(c);
  }
}

/* A vertex coloured geometry of several colours, cut back into one
 * geometry per colour (a cel wheel, the cel aircraft). */
function byColour(geometry) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = src.getAttribute('position');
  const nrm = src.getAttribute('normal');
  const col = src.getAttribute('color');
  const groups = new Map();
  for (let i = 0; i < pos.count; i += 3) {
    const hex = C.fromBufferAttribute(col, i).getHex();
    if (!groups.has(hex)) {
      groups.set(hex, { p: [], n: [] });
    }
    const grp = groups.get(hex);
    for (let k = i; k < i + 3; k += 1) {
      grp.p.push(pos.getX(k), pos.getY(k), pos.getZ(k));
      grp.n.push(nrm.getX(k), nrm.getY(k), nrm.getZ(k));
    }
  }
  return [...groups].map(([hex, grp]) => {
    const part = new THREE.BufferGeometry();
    part.setAttribute('position', new THREE.Float32BufferAttribute(grp.p, 3));
    part.setAttribute('normal', new THREE.Float32BufferAttribute(grp.n, 3));
    return { hex, part };
  });
}

/* The cel vehicle's own parts, each given the finish its colour means:
 * what the valley draws past the near distance. A part may be of
 * several colours (the aircraft is baked whole). Given a `glass` kit,
 * the glass goes there, see through, rather than into the body; given
 * `paint`, the body colours take that finish rather than a car's. */
export function refinish(celParts, { glass = null, paint = FIN.paint } = {}) {
  const K = makeKit();
  for (const g of celParts.list) {
    for (const { hex, part } of byColour(g)) {
      if (glass && hex === PAINT.glass) {
        glass.push(FIN.lens, part);
      } else {
        K.push(BY_PAINT.get(hex) ?? paint(hex), part);
      }
      part.dispose();
    }
  }
  return K;
}

/* The cel wheel, refinished: the far vehicles' wheel. */
export function farWheel() {
  const g = wheelGeometry();
  const K = refinish({ list: [g] });
  g.dispose();
  return K.bake();
}

/* A circle's rise `r` in from its end, for rounding an end in profile or
 * in plan: r at the end itself, nothing from r in. */
export const round = (r, u) => (u >= r ? 0 : r - Math.sqrt(r * r - (r - Math.max(0, u)) ** 2));

export function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

/* A cylinder along z, as an axle lies under a vehicle drawn along x. */
export function cylZ(r, len, seg = 12) {
  return new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);
}

/*
 * A body swept along x. Each station is { x, y0, y1, hw, hwT, rb, rt }:
 * the section's bottom and top, its half width at the flank and at the
 * top, and the radii its bottom and top corners are turned to. The
 * sections are joined with smooth normals, which is what makes car
 * paint read as a body rather than a box, and closed at both ends.
 */
export function sweep(stations, seg = 3) {
  const ring = (st) => {
    const { y0, y1, hw, hwT = hw } = st;
    /* Corners never larger than the section holds. */
    const rb = Math.min(st.rb, (y1 - y0) * 0.45, hw * 0.9);
    const rt = Math.min(st.rt, (y1 - y0) * 0.45, hwT * 0.9);
    const right = [[0, y0]];
    for (let k = 0; k <= seg; k += 1) {
      const a = -Math.PI / 2 + (k / seg) * (Math.PI / 2);
      right.push([hw - rb + rb * Math.cos(a), y0 + rb + rb * Math.sin(a)]);
    }
    for (let k = 0; k <= seg; k += 1) {
      const a = (k / seg) * (Math.PI / 2);
      right.push([hwT - rt + rt * Math.cos(a), y1 - rt + rt * Math.sin(a)]);
    }
    right.push([0, y1]);
    const left = right.slice(1, -1).reverse().map(([z, y]) => [-z, y]);
    return [...right, ...left];
  };
  const rings = stations.map((st) => ring(st));
  const n = rings[0].length;
  const pos = [];
  for (let s = 0; s < stations.length; s += 1) {
    for (const [z, y] of rings[s]) {
      pos.push(stations[s].x, y, z);
    }
  }
  const idx = [];
  for (let s = 0; s + 1 < stations.length; s += 1) {
    for (let k = 0; k < n; k += 1) {
      const a = s * n + k;
      const b = s * n + ((k + 1) % n);
      const c = (s + 1) * n + k;
      const d = (s + 1) * n + ((k + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tube.setIndex(idx);
  tube.computeVertexNormals();
  /* The ends, flat, their own vertices so the tube's normals stay round. */
  const caps = [];
  for (const [s, dir] of [[0, -1], [stations.length - 1, 1]]) {
    const x = stations[s].x;
    const r = rings[s];
    let cy = 0;
    for (const [, y] of r) {
      cy += y / n;
    }
    for (let k = 0; k < n; k += 1) {
      const [z0, y0] = r[k];
      const [z1, y1] = r[(k + 1) % n];
      if (dir > 0) {
        caps.push(x, cy, 0, x, y1, z1, x, y0, z0);
      } else {
        caps.push(x, cy, 0, x, y0, z0, x, y1, z1);
      }
    }
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(caps, 3));
  cap.computeVertexNormals();
  const out = mergeGeometries([tube.toNonIndexed(), cap], false);
  tube.dispose();
  cap.dispose();
  return out;
}

/* A flat polygon through the given points (a convex list), facing the
 * side `out` points to. */
export function poly(points, out) {
  const [a, b, c] = points;
  const u = new THREE.Vector3().subVectors(b, a);
  const v = new THREE.Vector3().subVectors(c, a);
  const n = u.cross(v);
  const pts = n.dot(out) < 0 ? [...points].reverse() : points;
  const pos = [];
  for (let k = 1; k + 1 < pts.length; k += 1) {
    for (const p of [pts[0], pts[k], pts[k + 1]]) {
      pos.push(p.x, p.y, p.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/* A square bar `t` thick from point a to point b: a pillar, a strut, a
 * wiper, a mirror arm. */
const UP = new THREE.Vector3(0, 1, 0);
export function strut(K, f, a, b, t, t2 = t) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.BoxGeometry(t, len, t2);
  const qq = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  const mm = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), qq, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(mm);
  K.push(f, g);
  g.dispose();
}

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/*
 * A near wheel, unit radius and a metre wide along z as the cel wheel
 * is, so the movers' matrices scale it to each vehicle alike. The tyre
 * is turned from its section: the tread with its centre groove, the
 * rounded shoulders, the sidewall bulging a little to the rim; a field
 * tyre ('lug') carries the chevron lugs across its tread. The rim is on
 * both faces, since the same wheel turns on both sides of a vehicle:
 * five spokes over a brake disc on an alloy, a pressed disc with its
 * holes, hub and nuts on a steel wheel. About five hundred triangles,
 * which is why a wheel is near only.
 */
export function nearWheel(kind = 'alloy', rimR = 0.64) {
  const K = makeKit();
  const segs = 16;
  const h = 0.5;
  const sec = [
    [rimR + 0.01, -h * 0.94], [rimR + 0.14, -h], [0.94, -h * 0.9], [1, -h * 0.5],
    [1, -h * 0.07], [0.975, 0], [1, h * 0.07],
    [1, h * 0.5], [0.94, h * 0.9], [rimR + 0.14, h], [rimR + 0.01, h * 0.94],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  /* LatheGeometry turns about y; its y is our z. */
  const tyre = new THREE.LatheGeometry(sec, segs).rotateX(Math.PI / 2);
  K.push(FIN.rubber, tyre);
  tyre.dispose();
  if (kind === 'lug') {
    for (let k = 0; k < 18; k += 1) {
      const a = (k / 18) * Math.PI * 2;
      for (const s of [-1, 1]) {
        const lug = box(0.1, 0.06, h * 0.9);
        K.push(FIN.rubber, lug, Math.cos(a) * 1.0, Math.sin(a) * 1.0, s * h * 0.45, 0, s * 0.5, a);
        lug.dispose();
      }
    }
  }
  const rimF = kind === 'alloy' ? FIN.alloy : FIN.steel;
  for (const side of [-1, 1]) {
    const z = side * h * 0.9;
    const turn = side > 0 ? 0 : Math.PI;
    /* The dark barrel inside the rim. */
    const barrel = new THREE.CylinderGeometry(rimR, rimR, 0.2, 12, 1, true).rotateX(Math.PI / 2);
    K.push(FIN.well, barrel, 0, 0, z - side * 0.1);
    barrel.dispose();
    if (kind === 'alloy') {
      const back = new THREE.CircleGeometry(rimR, 12);
      K.push(FIN.disc, back, 0, 0, z - side * 0.12, turn);
      back.dispose();
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2;
        const spoke = box(0.13, rimR - 0.12, 0.06);
        K.push(rimF, spoke, Math.cos(a) * (rimR * 0.52), Math.sin(a) * (rimR * 0.52), z - side * 0.03, 0, 0, a - Math.PI / 2);
        spoke.dispose();
      }
      const hub = new THREE.CylinderGeometry(0.17, 0.2, 0.08, 8).rotateX(Math.PI / 2);
      K.push(rimF, hub, 0, 0, z);
      hub.dispose();
      const lip = new THREE.RingGeometry(rimR - 0.05, rimR + 0.01, segs, 1);
      K.push(rimF, lip, 0, 0, z + side * 0.005, turn);
      lip.dispose();
    } else {
      /* A pressed steel disc, its ring of holes read as dark dots, the
       * hub and its nuts. */
      const face = new THREE.CircleGeometry(rimR + 0.01, segs);
      K.push(rimF, face, 0, 0, z - side * 0.04, turn);
      face.dispose();
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2;
        const hole = new THREE.CircleGeometry(0.07, 6);
        K.push(FIN.well, hole, Math.cos(a) * rimR * 0.66, Math.sin(a) * rimR * 0.66, z - side * 0.035, turn);
        hole.dispose();
      }
      const hub = new THREE.CylinderGeometry(0.2, 0.26, 0.12, 12).rotateX(Math.PI / 2);
      K.push(FIN.chrome, hub, 0, 0, z - side * 0.02);
      hub.dispose();
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2;
        const nut = box(0.05, 0.05, 0.05);
        K.push(FIN.steel, nut, Math.cos(a) * 0.32, Math.sin(a) * 0.32, z - side * 0.02, 0, 0, a);
        nut.dispose();
      }
    }
  }
  return K.bake();
}
