/*
 * kitshapes.js: the shapes the planes' visual part kits share
 * (configs/kits.js, docs/KITS.md section 3): spinner profiles, a lathe cut
 * into colour bands, a wheel pant and a thin plate for winglets. Each
 * builder places them on its own stations; nothing here has a mass, a
 * drag or a box the referee reads (docs/KITS.md section 5).
 *
 * Every shape is drawn inside the envelope it is given, so a builder that
 * passes its stock part's radius and length keeps the kit inside the stock
 * model's box, which is what configs/hulls.js is made from.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';

/*
 * A spinner's lathe profile for a kit option, about +y: its back plate
 * radius `r` at y0, its tip toward y1 (either side of y0), `m` steps.
 * Every option stays inside r and between y0 and y1:
 *   bullet  a parallel barrel half the length, then a round nose
 *   flat    a short barrel and a flat face, a scale spinner cap
 *   pointed a long straight cone, the sailplane's needle
 *   none    no spinner, a prop nut on the shaft
 */
export function spinnerProfile(option, r, y0, y1, m) {
  const len = y1 - y0;
  const at = (rr, t) => new THREE.Vector2(Math.max(0.0004, rr), y0 + len * t);
  const out = [new THREE.Vector2(0.0001, y0)];
  if (option === 'bullet') {
    out.push(at(r, 0), at(r, 0.45));
    for (let i = 1; i <= m; i += 1) {
      const u = i / m;
      out.push(at(r * Math.sqrt(1 - u * u), 0.45 + 0.55 * u));
    }
  } else if (option === 'flat') {
    out.push(at(r, 0), at(r, 0.30));
    for (let i = 1; i <= m; i += 1) {
      const a = (i / m) * (Math.PI / 2);
      out.push(at(r * (0.72 + 0.28 * Math.cos(a)), 0.30 + 0.18 * Math.sin(a)));
    }
    out.push(at(0.0004, 0.48));
  } else if (option === 'pointed') {
    out.push(at(r, 0));
    for (let i = 1; i <= m; i += 1) {
      const u = i / m;
      out.push(at(r * (1 - u) ** 0.8, u));
    }
  } else if (option === 'none') {
    out.push(at(r * 0.34, 0), at(r * 0.34, 0.22), at(r * 0.24, 0.28), at(0.0004, 0.50));
  } else {
    throw new Error(`kitshapes: no spinner ${JSON.stringify(option)}`);
  }
  /* A lathe's faces point out when its profile climbs; one that runs
   * toward -y is turned over by the caller's mount, so keep y increasing. */
  return len < 0 ? out.reverse() : out;
}

/* The spinner profile a kit asks for, or the builder's own stock one. */
export function spinnerFor(option, stock, r, y0, y1, m) {
  return option && option !== 'stock' ? spinnerProfile(option, r, y0, y1, m) : stock;
}

/*
 * A lathe profile cut at the y values `cuts` into bands, each closed on
 * the axis, for a spinner painted in two tones or in rings: band k runs
 * from cut k-1 to cut k. The profile must climb in y.
 */
export function profileBands(profile, cuts) {
  const ys = [profile[0].y, ...cuts, profile[profile.length - 1].y];
  const rAt = (y) => {
    for (let i = 0; i + 1 < profile.length; i += 1) {
      const a = profile[i];
      const b = profile[i + 1];
      if (y >= a.y && y <= b.y && b.y > a.y) {
        return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
      }
    }
    return profile[profile.length - 1].x;
  };
  const bands = [];
  for (let k = 0; k + 1 < ys.length; k += 1) {
    const lo = ys[k];
    const hi = ys[k + 1];
    const band = [new THREE.Vector2(0.0001, lo), new THREE.Vector2(Math.max(0.0004, rAt(lo)), lo)];
    for (const p of profile) {
      if (p.y > lo && p.y < hi) {
        band.push(p.clone());
      }
    }
    band.push(new THREE.Vector2(Math.max(0.0004, rAt(hi)), hi), new THREE.Vector2(0.0001, hi));
    bands.push(band);
  }
  return bands;
}

/*
 * A wheel pant about a wheel's axle at the origin, the axle along x: a
 * teardrop fairing `r` the tyre's radius and `w` its width, standing
 * higher than the wheel so the tyre's bottom shows under it, never lower,
 * and no longer than 1.9 tyre radii, so it stays inside the gear's box.
 */
export function wheelPantGeometry(r, w, seg) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg >> 1));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    /* Aft (+z) drawn out to a tail and thinned, the teardrop. */
    const aft = Math.max(0, z);
    pos.setXYZ(i, x * w * (1 - 0.35 * aft), r * (0.25 + 0.88 * y * (1 - 0.30 * aft)), z * r * (z > 0 ? 1.15 : 0.80));
  }
  g.computeVertexNormals();
  return g;
}

/*
 * A thin plate through four corners, given as [x, y, z] in order round
 * the outline, `t` thick along `n`: a winglet, a fin cap.
 */
export function plateGeometry(corners, n, t) {
  /* A unit box, indexed like the lofts it is merged with, each face its
   * own vertices so the plate shades flat. */
  const g = new THREE.BoxGeometry(1, 1, 1);
  const off = new THREE.Vector3(...n).normalize().multiplyScalar(t);
  let [a, b, c, d] = corners.map((q) => new THREE.Vector3(...q));
  /* The box's u, v, k are right handed; corners that run the other way
   * round `n` would turn every face inward, so they are taken reversed. */
  if (new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).dot(off) < 0) {
    [b, d] = [d, b];
  }
  const pos = g.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    const u = pos.getX(i) + 0.5;
    const v = pos.getY(i) + 0.5;
    const k = pos.getZ(i);
    /* Bilinear across the four corners, then half the thickness each way. */
    p.copy(a).multiplyScalar((1 - u) * (1 - v))
      .addScaledVector(b, u * (1 - v))
      .addScaledVector(c, u * v)
      .addScaledVector(d, (1 - u) * v)
      .addScaledVector(off, k);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
