/*
 * floatset.js: a pair of floats, their struts and spreader bars, and the
 * water rudders on their sterns, for an aircraft drawn on floats.
 *
 * One builder for the float set rather than one in each aircraft's file,
 * because a float is the same object under the Timber and under the Cub:
 * a V bottomed hull with a flat forebody, a step, an afterbody rising to
 * the stern and a bow rising to the deck, which is exactly the shape the
 * plant floats (src/native/sim.c, float_apply) and the shape
 * docs/FLOATS-STAGE1.md derives. What differs between the two is numbers,
 * and each aircraft's file hands its own in.
 *
 * The geometry is given in the BODY frame of the aircraft on floats, the
 * plant's (x forward, y left, z up, metres, origin the CG with the floats
 * on), with the same names and meanings as the plant's FloatParams, so the
 * drawn keel is the keel the water meets: flat at zKeel from the step to
 * the knee, rising bowRise to the bow, stepH higher aft of the step and
 * rising aftSlope per metre to the stern; the deck depth over the forebody
 * keel; a V of the deadrise to the chines. It is drawn in the craft frame
 * (x right, y up, z aft), converted here once: craft x = -body y, craft y
 * = body z, craft z = -body x. The plan view is the photographs': the bow
 * narrowing to a rounded point, the stern to a blunt one.
 *
 * The struts run from each float's deck at two stations to the roots the
 * aircraft's file gives, on its belly; a spreader bar joins the floats at
 * each station and a pair of wires crosses between them. Each water rudder
 * hangs under its float's stern on a vertical hinge and turns with the air
 * rudder: setRudder(rad), positive trailing edge to the LEFT, the air
 * rudder's convention.
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

/* The keel's height, body z, at body x: the plant's float_keel. */
export function floatKeel(f, x) {
  if (x > f.xKnee) {
    return f.zKeel + f.bowRise * (x - f.xKnee) / (f.xBow - f.xKnee);
  }
  if (x >= f.xStep) {
    return f.zKeel;
  }
  return f.zKeel + f.stepH + (f.xStep - x) * f.aftSlope;
}

/* The float's width in plan at body x. */
function planWidth(f, x) {
  if (x > f.xKnee) {
    const u = Math.min(1, (x - f.xKnee) / (f.xBow - f.xKnee));
    return f.beam * (0.30 + 0.70 * Math.sqrt(Math.max(0, 1 - u * u)));
  }
  const taper = f.xStep - 0.10;
  if (x < taper) {
    const u = Math.min(1, (taper - x) / (taper - f.xStern));
    return f.beam * (1 - 0.50 * u * u);
  }
  return f.beam;
}

/*
 * One closed cross section at body x, as craft frame points, for the
 * float whose centreline is at craft x = cx: the keel, the chine, the
 * side's top and a rounded deck edge on the right, the crown, and back
 * down the left, so every section has the same number of points and they
 * loft.
 */
function section(f, x, cx, keel) {
  const deck = f.zKeel + f.depth;
  const w = planWidth(f, x) / 2;
  const chine = keel + Math.min(w * f.tanDr, (deck - keel) * 0.5);
  const edge = Math.min(0.006, (deck - chine) * 0.4);
  const z = -x;
  const pts = [
    [0, keel], [w, chine], [w, deck - edge], [w - edge, deck], [0, deck + 0.002],
    [-(w - edge), deck], [-w, deck - edge], [-w, chine],
  ];
  return pts.map(([u, y]) => new THREE.Vector3(cx + u, y, z));
}

/* cubcraft.js's loft: closed sections skinned and capped, the winding set
 * by the signed volume. */
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
      idx.push(a + j, a + k, b + j, a + k, b + k, b + j);
    }
  }
  const cap = (sec, base, flip) => {
    const c = new THREE.Vector3();
    for (const p of sec) {
      c.add(p);
    }
    c.multiplyScalar(1 / n);
    const centre = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let j = 0; j < n; j += 1) {
      const k = (j + 1) % n;
      idx.push(centre, flip ? base + k : base + j, flip ? base + j : base + k);
    }
  };
  cap(sections[0], 0, true);
  cap(sections[sections.length - 1], (sections.length - 1) * n, false);
  let vol = 0;
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let i = 0; i < idx.length; i += 3) {
    vol += v(idx[i]).dot(v(idx[i + 1]).cross(v(idx[i + 2])));
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* One float's hull, the step a wall between two sections at one station. */
function hullGeometry(f, cx, lite) {
  const xs = [];
  const nb = lite ? 4 : 8;
  for (let i = 0; i <= nb; i += 1) {
    xs.push([f.xBow - (f.xBow - f.xKnee) * (1 - Math.cos((Math.PI / 2) * (i / nb))), null]);
  }
  const nf = lite ? 2 : 4;
  for (let i = 1; i <= nf; i += 1) {
    xs.push([f.xKnee - (f.xKnee - f.xStep) * (i / nf), null]);
  }
  /* The step: the forebody's section and the afterbody's, 1 mm apart. */
  xs[xs.length - 1][1] = f.zKeel;
  xs.push([f.xStep - 0.001, f.zKeel + f.stepH]);
  const na = lite ? 3 : 6;
  for (let i = 1; i <= na; i += 1) {
    xs.push([f.xStep - 0.001 - (f.xStep - 0.001 - f.xStern) * (i / na), null]);
  }
  return loft(xs.map(([x, k]) => section(f, x, cx, k ?? floatKeel(f, x))));
}

/* A round rod from a to b, flattened across by `flat` for a strut. */
function rod(a, b, r, seg, flat = 1) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  geo.scale(flat, 1, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  geo.applyQuaternion(q);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  geo.translate(mid.x, mid.y, mid.z);
  return geo;
}

/*
 * The float set. `f` the geometry, body frame, the plant's; `struts`
 * { front, rear } body x stations, and `roots(sign, which)` the craft frame
 * point on the belly the strut from the float on side sign (+1 right) at
 * that station goes to; `rudder` { x, chord, span } the water rudder's
 * blade centre station and size; `mats` { hull, stripe, trim, metal };
 * `stripe` true draws the aircraft's lightning on the floats' sides.
 */
export function buildFloatSet({ f, struts, roots, rudder, mats, stripe = false, lite = false, shade = true }) {
  const group = new THREE.Group();
  group.name = 'floats';
  const deck = f.zKeel + f.depth;
  const rodSeg = lite ? 4 : 8;

  const hulls = [];
  for (const sign of [-1, 1]) {
    hulls.push(hullGeometry(f, sign * f.y, lite));
  }
  const hullMesh = new THREE.Mesh(mergeGeometries(hulls, false), mats.hull);
  hullMesh.name = 'float-hulls';
  hullMesh.castShadow = shade;
  group.add(hullMesh);

  if (stripe) {
    /* A red band along each float's outer and inner side under the deck
     * edge from the bow's rise to the afterbody, and a black one under it
     * forward, the kit's lightning as the photographs show it, laid a hair
     * proud of the side. */
    const bands = { red: [], black: [] };
    const band = (sign, side, x0, x1, top0, top1, h, list) => {
      const pos = [];
      const n = 6;
      for (let i = 0; i <= n; i += 1) {
        const x = x0 + (x1 - x0) * (i / n);
        const w = planWidth(f, x) / 2 + 0.0008;
        const cx = sign * f.y + side * w;
        const top = deck - 0.008 - (top0 + (top1 - top0) * (i / n));
        pos.push(cx, top, -x, cx, top - h, -x);
      }
      const idx = [];
      for (let i = 0; i < n; i += 1) {
        const a = i * 2;
        if (side > 0) {
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        } else {
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      list.push(geo);
    };
    for (const sign of [-1, 1]) {
      for (const side of [-1, 1]) {
        band(sign, side, f.xKnee + 0.02, f.xStep - 0.12, 0.000, 0.030, 0.012, bands.red);
        band(sign, side, f.xKnee - 0.02, f.xStep + 0.04, 0.016, 0.034, 0.005, bands.black);
      }
    }
    const red = new THREE.Mesh(mergeGeometries(bands.red, false), mats.stripe);
    red.name = 'float-stripe';
    group.add(red);
    const black = new THREE.Mesh(mergeGeometries(bands.black, false), mats.trim);
    black.name = 'float-trim';
    group.add(black);
  }

  /* The struts, the spreader bars and the cross wires. */
  {
    const parts = [];
    const at = (sign, x) => new THREE.Vector3(sign * f.y, deck, -x);
    for (const which of ['front', 'rear']) {
      const x = struts[which];
      for (const sign of [-1, 1]) {
        parts.push(rod(at(sign, x), roots(sign, which), 0.0028, rodSeg, 1.8));
      }
      parts.push(rod(at(-1, x), at(1, x), 0.0035, rodSeg));
      /* Crossed wires between the floats' decks and the other side's root. */
      parts.push(rod(at(-1, x), roots(1, which), 0.0007, 3));
      parts.push(rod(at(1, x), roots(-1, which), 0.0007, 3));
    }
    const metal = new THREE.Mesh(mergeGeometries(parts, false), mats.metal);
    metal.name = 'float-struts';
    metal.castShadow = shade;
    group.add(metal);
  }

  /* The water rudders on vertical hinges at their leading edges. */
  const rudders = [];
  for (const sign of [-1, 1]) {
    const hingeX = rudder.x + rudder.chord / 2;
    const top = floatKeel(f, hingeX) + 0.004;
    const pivot = new THREE.Group();
    pivot.position.set(sign * f.y, top, -hingeX);
    const blade = new THREE.BoxGeometry(0.002, rudder.span + 0.004, rudder.chord);
    blade.translate(0, -(rudder.span + 0.004) / 2, rudder.chord / 2);
    const mesh = new THREE.Mesh(blade, mats.metal);
    mesh.name = 'water-rudder';
    mesh.castShadow = shade;
    pivot.add(mesh);
    pivot.name = sign < 0 ? 'water-rudder-left' : 'water-rudder-right';
    group.add(pivot);
    rudders.push(pivot);
  }
  const axis = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  function setRudder(rad) {
    for (const p of rudders) {
      p.quaternion.copy(q.setFromAxisAngle(axis, -rad));
    }
  }
  setRudder(0);
  return { group, setRudder };
}
