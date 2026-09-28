/*
 * p51craft.js: the P-51D Mustang's model, and nothing else.
 *
 * The subject is FMS's 1450 mm P-51D Mustang V8, which is the full size
 * P-51D to the kit's span: FMS publish the span, 1450 mm, the length,
 * 1240 mm, the wing area, 35.4 dm2, the CG, 110 mm behind the leading
 * edge at the fuselage, the prop, a 14 x 8 four blade, the flaps and the
 * retracts. The outline is the full size's leading particulars scaled by
 * the span (Aviation, July 1944, "Design Analysis of the P-51": taper
 * 0.499 with the quarter chord line square to the fuselage, 5 deg of
 * dihedral, +1 deg of incidence at the root and -58 min at the tip, the
 * stabiliser 13 ft 2 1/8 in with a 30 in chord, the tread 11 ft 10 in on
 * 27 in wheels, a 12.5 in tail wheel), and the stations and heights are
 * the kit manual's own side view (fig. 76), whose spinner to rudder is the
 * full size's 32 ft 2 3/8 in; docs/P51-STAGE1.md says which is which.
 *
 *   span            1.450 m, a straight taper from 0.326 m at the
 *                   centreline to 0.163 m at the square tip
 *   wing            the NAA/NACA 45-100 laminar family, 15 percent at the
 *                   root to 11 at the tip, the chord plane 50 mm under the
 *                   CG at the root, 5 deg of dihedral
 *   flaps           plain, from the fuselage's side to 0.42 m, the aft
 *                   quarter; ailerons from 0.45 to 0.68 m, the aft 22 percent
 *   tail            a 0.516 m stabiliser, 98 mm of chord at the root, its
 *                   elevator the aft 47 percent; the fin and a rudder to
 *                   the fuselage's bottom
 *   gear            inward retracting mains on a 0.463 m track with 88 mm
 *                   wheels, a 41 mm tail wheel retracting forward
 *   prop            14 x 8 four blade tractor, 0.356 m, clockwise seen from
 *                   the cockpit, behind a red spinner
 *   length          1.263 m spinner tip to rudder trailing edge
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 110 mm behind the wing's leading
 * edge at the fuselage, FMS's figure, 12.9 mm under the thrust line.
 * Stations below are metres aft of the spinner's tip and turn into the
 * craft frame's z through st(); heights are metres above the CG.
 *
 * The contract with the shell is timbercraft.js's: group, discs, blades,
 * leds, cameraMount, stator, propSpin, setSurfaces(leftAileron,
 * rightAileron, elevator, rudder) and setFlaps(rad). On top of it,
 * setGear(g): the retracts, 0 down and locked to 1 up, as sim_wing_gear
 * reports them; the mains fold inward into the wing, the tail wheel
 * forward into the fuselage.
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
import { celMaterial, outlineHull } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { paintRegions } from './livery.js';

/*
 * The side view's scale: 1,755 pixels at 300 dpi from the spinner's tip
 * to the rudder's trailing edge are the full size's 32 ft 2 3/8 in to the
 * kit's span, 0.7196 mm of the kit each. PS(px) is a station, PH(py) a
 * height over the CG, which is 370 px down the view.
 */
const PX = 1.2628 / 1755;
const PS = (px) => (px - 105) * PX;
const PH = (py) => (370 - py) * PX;
const CG_S = PS(550) + 0.110;
const st = (s) => s - CG_S;

/* The thrust line and the spinner. */
const THRUST_Y = PH(352);
const PROP_S = PS(205);
const PROP_R = 0.1778;
const SPINNER_R = 0.042;
const SPINNER_BASE_S = PS(225);

/* The wing: the quarter chord line square to the fuselage, so a straight
 * taper of the chord about it; FMS's area over the span at the full size's
 * 0.499. */
const HALF = 0.725;
const C_ROOT = 2 * 0.354 / (1.450 * 1.499);
const C_TIP = 0.499 * C_ROOT;
const FUSE_HALF = 0.0572;
const chordAt = (ax) => C_ROOT - (C_ROOT - C_TIP) * Math.min(ax, HALF) / HALF;
const QC_S = PS(550) + 0.25 * chordAt(FUSE_HALF);
const WING_Y = PH(440);
const DIHEDRAL = (5 * Math.PI) / 180;
const INC_ROOT = (1 * Math.PI) / 180;
const WASHOUT = ((1 + 58 / 60) * Math.PI) / 180;
const WING_M = 0.015;
const WING_P = 0.40;

const FLAP_IN = FUSE_HALF;
const FLAP_OUT = 0.420;
const FLAP_HINGE = 0.75;
const AIL_IN = 0.450;
const AIL_OUT = 0.680;
const AIL_HINGE = 0.78;

/* The tail. */
const STAB_HALF = (13 * 12 + 2.125) * 0.0254 * 1.450 / (37.03 * 0.3048) / 2;
const STAB_ROOT = 30 * 0.0254 * 1.450 / (37.03 * 0.3048);
const STAB_TIP = 0.060;
const STAB_TE_S = PS(1720);
const STAB_Y = PH(300);
const STAB_HINGE = 0.53;
const STAB_T = 0.10;
const FIN_T = 0.10;
const TAIL_TOP = PH(50);
const RUDDER_S = PS(1770);
const RUDDER_TE_S = PS(1860);
const RUDDER_BOTTOM = PH(360);

/* The gear, as drawn: the axles at rest, loaded. */
const MAIN_X = (11 * 12 + 10) * 0.0254 * 1.450 / (37.03 * 0.3048) / 2;
const MAIN_S = PS(615);
const MAIN_Y = PH(655);
const MAIN_R = 27 / 2 * 0.0254 * 1.450 / (37.03 * 0.3048);
const MAIN_W = 0.022;
const TAIL_WHEEL_S = PS(1488);
const TAIL_WHEEL_Y = PH(485);
const TAIL_WHEEL_R = 12.5 / 2 * 0.0254 * 1.450 / (37.03 * 0.3048);

function chordLE(ax) {
  /* The square tip, its corners rounded over the last 20 mm. */
  const c0 = chordAt(ax);
  const tipIn = HALF - 0.020;
  const le0 = st(QC_S) - 0.25 * c0;
  if (ax <= tipIn) {
    return { c: c0, le: le0 };
  }
  const u = Math.min(0.995, (ax - tipIn) / (HALF - tipIn));
  const f = 0.45 + 0.55 * Math.sqrt(1 - u * u);
  return { c: c0 * f, le: le0 + 0.35 * c0 * (1 - f) };
}
const wingHeight = (ax) => WING_Y + ax * Math.tan(DIHEDRAL);
const thickAt = (ax) => 0.151 - (0.151 - 0.114) * Math.min(ax, HALF) / HALF;
const incAt = (ax) => INC_ROOT - WASHOUT * Math.min(ax, HALF) / HALF;

/* The NACA four digit thickness, half of it, at chord fraction t. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}
function camber(t) {
  return t < WING_P
    ? (WING_M / (WING_P * WING_P)) * (2 * WING_P * t - t * t)
    : (WING_M / ((1 - WING_P) * (1 - WING_P))) * (1 - 2 * WING_P + 2 * WING_P * t - t * t);
}

/* A closed section: a loop over the top from chord fraction f0 to f1 and
 * back under, cosine spaced, timbercraft.js's. */
function section(at, f0, f1, n) {
  const ts = [];
  for (let i = 0; i < n; i += 1) {
    ts.push(f0 + (f1 - f0) * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1))));
  }
  const loop = ts.map((t) => at(t, 1));
  const stop = f0 === 0 ? 1 : 0;
  for (let i = n - 1; i >= stop; i -= 1) {
    loop.push(at(ts[i], -1));
  }
  return loop;
}

function wingAt(x) {
  const ax = Math.abs(x);
  const { c, le } = chordLE(ax);
  const y0 = wingHeight(ax);
  const slope = Math.tan(incAt(ax));
  const th = thickAt(ax);
  /* The incidence turns the chord about its quarter point. */
  return (t, side) => new THREE.Vector3(
    x,
    y0 + c * (camber(t) + side * naca(t, th)) - (t - 0.25) * c * slope,
    le + t * c,
  );
}
function stabAt(x, le, c) {
  return (t, side) => new THREE.Vector3(x, STAB_Y + side * c * naca(t, STAB_T), le + t * c);
}
function finAt(y, le, c) {
  return (t, side) => new THREE.Vector3(side * c * naca(t, FIN_T), y, le + t * c);
}

/* Skin a run of closed sections, capped, facing out: timbercraft.js's. */
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

/* Paint laid a hair proud of a surface: timbercraft.js's. */
function paint(point, nu, nv, out, lift = 0.0008) {
  const pos = [];
  const e = 1e-4;
  for (let i = 0; i <= nu; i += 1) {
    for (let j = 0; j <= nv; j += 1) {
      const u = i / nu;
      const v = j / nv;
      const p = point(u, v);
      const du = point(Math.min(1, u + e), v).sub(point(Math.max(0, u - e), v));
      const dv = point(u, Math.min(1, v + e)).sub(point(u, Math.max(0, v - e)));
      const nrm = du.cross(dv).normalize();
      if (nrm.dot(out(p)) < 0) {
        nrm.negate();
      }
      p.addScaledVector(nrm, lift);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = nv + 1;
  const idx = [];
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const v3 = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const mid = Math.floor(idx.length / 6) * 3;
  const [p0, p1, p2] = [v3(idx[mid]), v3(idx[mid + 1]), v3(idx[mid + 2])];
  const nrm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  if (nrm.dot(out(p0)) < 0) {
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
function wingPaint(x0, x1, t0, t1, side, nu, nv) {
  return paint(
    (u, v) => wingAt(x0 + (x1 - x0) * u)(t0 + (t1 - t0) * v, side),
    nu, nv, () => new THREE.Vector3(0, side, 0),
  );
}

/*
 * The wing, tip to tip in one loft, cut at the flaps' and ailerons' hinges:
 * the step from a full section to a cut one at the same station is the cut
 * out's side wall. The centre section runs through the fuselage.
 */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const half = [
    [0, 1], [FLAP_IN - eps, 1], [FLAP_IN + eps, FLAP_HINGE], [0.24, FLAP_HINGE], [FLAP_OUT - eps, FLAP_HINGE],
    [FLAP_OUT + eps, 1], [AIL_IN - eps, 1], [AIL_IN + eps, AIL_HINGE], [0.56, AIL_HINGE],
    [AIL_OUT - eps, AIL_HINGE], [AIL_OUT + eps, 1],
  ];
  const tip = lite ? [0.710, HALF - 0.006, HALF] : [0.700, 0.712, HALF - 0.008, HALF - 0.003, HALF];
  for (const x of tip) {
    half.push([x, 1]);
  }
  const stations = [
    ...half.slice(1).reverse().map(([x, f]) => [-x, f]),
    ...half,
  ];
  return loft(stations.map(([x, f]) => section(wingAt(x), 0, f, n)));
}

/* A hinged surface, timbercraft.js's: a NEGATIVE turn about its axis
 * lifts the trailing edge or swings it left. */
function hinged(geo, a, b, material, shade) {
  const axis = new THREE.Vector3().subVectors(b, a).normalize();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  geo.translate(-mid.x, -mid.y, -mid.z);
  const pivot = new THREE.Group();
  pivot.position.copy(mid);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = shade;
  pivot.add(mesh);
  return { pivot, axis, mesh };
}
function spanRun(x0, x1, n, sign) {
  const xs = [];
  for (let i = 0; i <= n; i += 1) {
    xs.push(sign * (x0 + ((x1 - x0) * i) / n));
  }
  if (sign < 0) {
    xs.reverse();
  }
  return xs;
}
function trailing(x0, x1, hinge, sign, material, shade, lite) {
  const xs = spanRun(x0, x1, 2, sign);
  const geo = loft(xs.map((x) => section(wingAt(x), hinge, 1, lite ? 4 : 6)));
  const hingePoint = (x) => wingAt(x)(hinge, 1).add(wingAt(x)(hinge, -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

/* The stabiliser's planform at |x|: the hinge line straight across, the
 * leading edge swept back to a 60 mm tip, the tips squared off with their
 * corners rounded as the full size's. */
function stabPlan(ax) {
  const u = Math.min(1, ax / STAB_HALF);
  const c = STAB_ROOT + (STAB_TIP - STAB_ROOT) * u;
  const te = STAB_TE_S;
  const hinge = te - (1 - STAB_HINGE) * STAB_ROOT;
  let le = te - c;
  let teNow = te;
  const tipIn = STAB_HALF - 0.015;
  if (ax > tipIn) {
    const w = Math.min(0.995, (ax - tipIn) / (STAB_HALF - tipIn));
    const f = Math.sqrt(1 - w * w);
    le = hinge - (hinge - le) * f;
    teNow = hinge + (te - hinge) * f;
  }
  /* Inboard, the elevator is cut forward round the rudder's travel. */
  const notch = Math.min(1, Math.max(0, (ax - 0.010) / 0.010));
  teNow = Math.min(teNow, hinge + 0.020 + (teNow - hinge - 0.020) * notch);
  return { le: st(le), hinge: st(hinge), te: st(teNow) };
}
function stabGeometry(n) {
  const xs = [-STAB_HALF, -(STAB_HALF - 0.006), -(STAB_HALF - 0.015), -0.12, 0, 0.12, STAB_HALF - 0.015, STAB_HALF - 0.006, STAB_HALF];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
function elevatorHalf(sign, n) {
  const xs = [0.010, 0.015, 0.020, 0.12, STAB_HALF - 0.015, STAB_HALF - 0.006, STAB_HALF - 0.001].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.hinge, Math.max(0.004, p.te - p.hinge)), 0, 1, n);
  }));
}

/*
 * The fin and rudder at height y: the fin's leading edge swept up from the
 * dorsal fillet to the top, the top rounded into the rudder, whose
 * trailing edge bows out as the full size's does and runs down to the
 * fuselage's bottom.
 */
function tailOutline(y) {
  const rootY = PH(305);
  const leRoot = PS(1560);
  const leTop = PS(1700);
  let le = leRoot + ((y - rootY) / (TAIL_TOP - rootY)) * (leTop - leRoot);
  le = Math.min(le, RUDDER_S - 0.008);
  const mid = (y - RUDDER_BOTTOM) / (TAIL_TOP - RUDDER_BOTTOM);
  let te = RUDDER_TE_S - 0.010 * (2 * mid - 1) * (2 * mid - 1);
  const round0 = TAIL_TOP - 0.035;
  if (y > round0) {
    const u = Math.min(0.995, (y - round0) / (TAIL_TOP - round0));
    const f = Math.sqrt(1 - u * u);
    te = RUDDER_S + (te - RUDDER_S) * f;
    le = RUDDER_S - (RUDDER_S - le) * (0.35 + 0.65 * f);
  }
  return { le: st(le), hinge: st(RUDDER_S), te: st(Math.max(te, RUDDER_S + 0.004)) };
}
function finGeometry(n) {
  const ys = [PH(318), PH(305), 0.080, 0.130, 0.170, TAIL_TOP - 0.035, TAIL_TOP - 0.015, TAIL_TOP - 0.004, TAIL_TOP];
  return loft(ys.map((y) => {
    const o = tailOutline(Math.max(y, PH(305)));
    return section(finAt(y, o.le, o.hinge - o.le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUDDER_BOTTOM, RUDDER_BOTTOM + 0.006, 0.050, 0.110, 0.160, TAIL_TOP - 0.035, TAIL_TOP - 0.015, TAIL_TOP - 0.004, TAIL_TOP];
  return loft(ys.map((y) => {
    const o = tailOutline(y);
    return section(finAt(y, o.hinge, o.te - o.hinge), 0, 1, n);
  }));
}

/*
 * The fuselage, off the side view: at each station the top and the bottom
 * in pixels of the view, the half width in metres (the full size's 2 ft
 * 11 in at the widest), and how square the section is. The long cowl
 * behind the spinner over the Merlin, the cockpit's deck under the bubble,
 * the belly running back to the scoop, the tail cone to the rudder post.
 */
const FUSE_PX = [
  [225, 293, 412, 0.043, 2.1],
  [300, 280, 432, 0.047, 2.2],
  [400, 270, 446, 0.051, 2.3],
  [520, 264, 456, 0.055, 2.4],
  [640, 258, 462, 0.057, 2.4],
  [760, 254, 465, 0.057, 2.4],
  [900, 253, 466, 0.056, 2.4],
  [1040, 255, 460, 0.053, 2.3],
  [1200, 263, 440, 0.047, 2.2],
  [1400, 282, 410, 0.035, 2.1],
  [1600, 298, 384, 0.022, 2.0],
  [1770, 306, 364, 0.010, 2.0],
];
const FUSE = FUSE_PX.map(([px, top, bottom, w, e]) => [PS(px), w, PH(top), PH(bottom), e]);
function fuseAt(s) {
  const last = FUSE[FUSE.length - 1];
  const t = Math.min(Math.max(s, FUSE[0][0]), last[0]);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      const k = u * u * (3 - 2 * u);
      const lerp = (j) => a[j] + (b[j] - a[j]) * k;
      const top = lerp(2);
      const bottom = lerp(3);
      return { w: lerp(1), h: (top - bottom) / 2, yc: (top + bottom) / 2, e: lerp(4) };
    }
  }
  throw new Error(`p51craft: station ${s} is off the fuselage`);
}
function fusePoint(s, a, out = 0) {
  const { w, h, yc, e } = fuseAt(s);
  const sn = Math.sin(a);
  const cs = Math.cos(a);
  const p = 2 / e;
  return new THREE.Vector3(
    Math.sign(sn) * (w + out) * Math.abs(sn) ** p,
    yc + Math.sign(cs) * (h + out) * Math.abs(cs) ** p,
    st(s),
  );
}
function fuseAngle(s, v, sign) {
  const { e } = fuseAt(s);
  return sign * Math.acos(Math.sign(v) * Math.abs(v) ** (e / 2));
}
function fuseStations(lite) {
  const all = FUSE.map((f) => f[0]);
  if (lite) {
    return all;
  }
  const out = [];
  for (let i = 0; i + 1 < all.length; i += 1) {
    out.push(all[i], (all[i] + all[i + 1]) / 2);
  }
  out.push(all[all.length - 1]);
  return out;
}
function fuseGeometry(lite) {
  const around = lite ? 16 : 28;
  return loft(fuseStations(lite).map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}
/* A point on the skin as the loft draws it, straight between stations. */
function skinPoint(ss, s, a, out) {
  let i = 0;
  while (i + 2 < ss.length && s > ss[i + 1]) {
    i += 1;
  }
  const u = (s - ss[i]) / (ss[i + 1] - ss[i]);
  return fusePoint(ss[i], a, out).lerp(fusePoint(ss[i + 1], a, out), u).setZ(st(s));
}
function skinPanel(lite, s0, s1, ns, band, na, out = 0.0008) {
  const ss = fuseStations(lite);
  return paint((u, v) => {
    const s = s0 + (s1 - s0) * u;
    const [a0, a1] = band(s);
    return skinPoint(ss, s, a0 + (a1 - a0) * v, out);
  }, ns, na, (p) => new THREE.Vector3(p.x, p.y - fuseAt(p.z + CG_S).yc, 0), 0);
}

/*
 * A pod under the fuselage, lofted from rounded box sections: the belly
 * scoop with the radiators in it (its bottom 180 px under the CG, the
 * lowest the fuselage goes) and the chin intake under the cowl.
 */
function podGeometry(stations, lite) {
  const around = lite ? 10 : 18;
  return loft(stations.map(([s, w, top, bottom]) => {
    const ring = [];
    const h = (top - bottom) / 2;
    const yc = (top + bottom) / 2;
    for (let i = 0; i < around; i += 1) {
      const a = (2 * Math.PI * i) / around;
      const sn = Math.sin(a);
      const cs = Math.cos(a);
      ring.push(new THREE.Vector3(Math.sign(sn) * w * Math.abs(sn) ** 0.8, yc + Math.sign(cs) * h * Math.abs(cs) ** 0.8, st(s)));
    }
    return ring;
  }));
}
const SCOOP = [
  [PS(790), 0.018, PH(455), PH(470)],
  [PS(820), 0.034, PH(455), PH(535)],
  [PS(900), 0.038, PH(455), PH(550)],
  [PS(1060), 0.037, PH(452), PH(548)],
  [PS(1180), 0.030, PH(445), PH(525)],
  [PS(1230), 0.022, PH(440), PH(500)],
];
const CHIN = [
  [PS(330), 0.012, PH(430), PH(445)],
  [PS(350), 0.020, PH(430), PH(462)],
  [PS(450), 0.020, PH(440), PH(466)],
  [PS(520), 0.014, PH(450), PH(460)],
];

/* The bubble canopy: a loft of half ellipses on the deck from the
 * windscreen to its tail. */
function canopyGeometry(lite) {
  const around = lite ? 9 : 15;
  const secs = [];
  const stations = [PS(700), PS(740), PS(800), PS(870), PS(940), PS(990), PS(1015)];
  const topAt = [PH(252), PH(205), PH(185), PH(180), PH(188), PH(218), PH(250)];
  const halfAt = [0.020, 0.028, 0.032, 0.032, 0.030, 0.024, 0.012];
  stations.forEach((s, k) => {
    const base = fuseAt(s).yc + fuseAt(s).h - 0.004;
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      const a = Math.PI * (i / (around - 1)) - Math.PI / 2;
      ring.push(new THREE.Vector3(halfAt[k] * Math.sin(a), base + (topAt[k] - base) * Math.cos(a), st(s)));
    }
    secs.push(ring);
  });
  return loft(secs);
}

function rod(a, b, r, seg, flat = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.scale(1 / flat, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/* A Hamilton Standard paddle blade, broad to near the tip. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0060, 0.010);
  s.bezierCurveTo(0.0200, -0.030, 0.0200, -r * 0.70, 0.0130, -r * 0.97);
  s.quadraticCurveTo(0.0020, -r * 1.0, -0.0080, -r * 0.965);
  s.bezierCurveTo(-0.0150, -r * 0.55, -0.0130, -0.015, -0.0045, 0.010);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0024, bevelEnabled: false, curveSegments: segments });
}

function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
    if (g.index === null) {
      g.setIndex([...Array(g.getAttribute('position').count).keys()]);
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('p51craft: merge failed');
  }
  return geo;
}

/*
 * The wheels' lowest drawn points in the level craft frame and the three
 * point attitude they make, timbercraft.js's way.
 */
const MAIN_AXLE = [MAIN_X, MAIN_Y, st(MAIN_S)];
const TAIL_AXLE = [0, TAIL_WHEEL_Y, st(TAIL_WHEEL_S)];
function restPitch() {
  const dy = TAIL_AXLE[1] - MAIN_AXLE[1];
  const dz = TAIL_AXLE[2] - MAIN_AXLE[2];
  const f = (p) => Math.cos(p) * dy - Math.sin(p) * dz - (TAIL_WHEEL_R - MAIN_R);
  let lo = 0;
  let hi = Math.PI / 4;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}
const REST_PITCH = restPitch();
const restContact = (axle, r) => [
  axle[0],
  axle[1] - r * Math.cos(REST_PITCH),
  axle[2] + r * Math.sin(REST_PITCH),
];
const REST_CG_HEIGHT = (() => {
  const c = restContact(MAIN_AXLE, MAIN_R);
  return -(Math.cos(REST_PITCH) * c[1] - Math.sin(REST_PITCH) * c[2]);
})();

/*
 * Exported numbers, TIMBER_DIMS's shape, held against the airframe table
 * and the plant: hullR the furthest reach in plan, the rudder's trailing
 * edge, vHalfUp the fin's top, vHalfDown the main tyres' bottoms, level.
 */
const UP = TAIL_TOP;
const DOWN = -(MAIN_Y - MAIN_R);
export const P51_DIMS = {
  span: 2 * HALF,
  rootChord: C_ROOT,
  tipChord: C_TIP,
  stabSpan: 2 * STAB_HALF,
  gearTrack: 2 * MAIN_X,
  propR: PROP_R,
  noseZ: st(0),
  tailZ: st(RUDDER_TE_S),
  length: RUDDER_TE_S,
  vHalfUp: UP,
  vHalfDown: DOWN,
  belly: -PH(550),
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: MAIN_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: MAIN_W },
    tail: { axle: [...TAIL_AXLE], r: TAIL_WHEEL_R, width: 0.010 },
  },
  contact: {
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    tail: [0, TAIL_AXLE[1] - TAIL_WHEEL_R, TAIL_AXLE[2]],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: (REST_PITCH * 180) / Math.PI,
    cgHeight: REST_CG_HEIGHT,
    contact: {
      mainLeft: restContact([-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], MAIN_R),
      mainRight: restContact(MAIN_AXLE, MAIN_R),
      tail: restContact(TAIL_AXLE, TAIL_WHEEL_R),
    },
  },
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: Math.max(st(RUDDER_TE_S), Math.hypot(HALF, chordLE(HALF - 0.02).le + chordLE(HALF - 0.02).c)),
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: RUDDER_TE_S,
    bodyWidth: 2 * HALF,
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera: the pilot's eye in the cockpit under the bubble, 91 mm
 * behind the CG and 86 mm over it, looking over the long nose: the plant's
 * camera_x and camera_z (src/native/plant.c).
 */
const CAM_S = PS(830);
export const P51_MOUNT_FORWARD = -st(CAM_S);
export const P51_MOUNT_UP = PH(250);

/* A tractor turning clockwise seen from the cockpit, as the Timber's. */
export const P51_PROP_SPIN = [1, 0, 0, 0];

export function buildP51Craft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'p51d-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 8 : 14;
  const rodSeg = lite ? 4 : 8;

  /* The Red Tail scheme FMS's manual photographs: natural metal all over,
   * a red spinner, nose band and rudder top, black identification bands
   * across the wings and the stabiliser, and the black anti-glare panel
   * ahead of the windscreen. Metal is a bright, sharp specular. */
  const coat = paintRegions();
  const metalOf = (id) => coat.base(id, cel({ color: 0xcad0d5, rim: 0.34, spec: 0.85, specWidth: 0.020, specColor: 0xf7f4ea }));
  const metalDimOf = (id) => coat.shade(id, cel({ color: 0xb6bcc1, rim: 0.34, spec: 0.75, specWidth: 0.020, specColor: 0xf7f4ea }));
  const fuseMetal = metalOf('fuselage');
  const wingMetal = metalOf('wing');
  const tailMetal = metalOf('tail');
  const red = coat.base('trim', cel({ color: 0xc8161a, rim: 0.28, spec: 0.40, specWidth: 0.016 }));
  const redDim = coat.shade('trim', cel({ color: 0xb01216, rim: 0.28, spec: 0.36, specWidth: 0.016 }));
  const black = coat.base('stripe', cel({ color: 0x17191b, rim: 0.30, spec: 0.35, specWidth: 0.016, specColor: 0xd8e0e8 }));
  const tyre = cel({ color: 0x1b1c1e, rim: 0.26, spec: 0.20, specWidth: 0.012 });
  const strut = cel({ color: 0xd4d7da, rim: 0.30, spec: 0.90, specWidth: 0.024 });
  const glass = cel({ color: 0x7f97a6, rim: 0.42, spec: 0.70, specWidth: 0.020, specColor: 0xf3ead4 });
  const frame = cel({ color: 0x3c4146, rim: 0.26, spec: 0.40 });
  const stator = cel({ color: 0x2a2c2e, rim: 0.24, spec: 0.20 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({ color: 0x101610, rim: 0.40, spec: 0.95, specWidth: 0.03, specColor: 0xf3ead4, side: THREE.DoubleSide });
  const ring = cel({ color: 0xb8b09e, rim: 0.28, spec: 0.55 });
  const propMat = cel({ color: 0x1f2224, rim: 0.26, spec: 0.30 });
  const tipYellow = cel({ color: 0xf0c81e, rim: 0.28, spec: 0.40 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  if (opts.measure) {
    const d = P51_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), fuseMetal);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The fuselage with its scoop and chin, centred so the hull thickens it
   * evenly. */
  {
    const geo = merged([fuseGeometry(lite), podGeometry(SCOOP, lite), podGeometry(CHIN, lite)]);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const fuse = new THREE.Mesh(geo, fuseMetal);
    fuse.position.copy(c);
    fuse.name = 'p51d-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.014, ink);
    group.add(fuse);
  }

  /* The wing and the tail, one region each. */
  {
    const n = lite ? 5 : 7;
    const wing = new THREE.Mesh(wingGeometry(lite), wingMetal);
    wing.name = 'p51d-wing';
    wing.castShadow = shade;
    group.add(wing);
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n)]), tailMetal);
    tail.name = 'p51d-tail';
    tail.castShadow = shade;
    group.add(tail);
  }

  /*
   * The red, one draw: the nose band behind the spinner, the fin's top
   * above the rudder's, drawn as paint on the fin.
   */
  {
    const parts = [];
    parts.push(skinPanel(lite, PS(226), PS(330), lite ? 3 : 6, () => [-Math.PI * 0.999, Math.PI * 0.999], lite ? 10 : 20));
    const finTop = (side) => paint((u, v) => {
      const y = TAIL_TOP - 0.060 + 0.058 * v;
      const o = tailOutline(y);
      return finAt(y, o.le, o.hinge - o.le)(0.02 + 0.96 * u, side);
    }, lite ? 3 : 6, lite ? 2 : 4, () => new THREE.Vector3(side, 0, 0));
    parts.push(finTop(1), finTop(-1));
    const redMesh = new THREE.Mesh(merged(parts), red);
    redMesh.name = 'p51d-red';
    redMesh.castShadow = shade;
    group.add(redMesh);
  }

  /*
   * The black, one draw: the anti-glare panel on the cowl's top back to
   * the windscreen, the identification bands across each wing panel top
   * and bottom, and across the stabiliser.
   */
  {
    const parts = [];
    parts.push(skinPanel(lite, PS(330), PS(700), lite ? 4 : 8, (s) => [fuseAngle(s, 0.55, -1), fuseAngle(s, 0.55, 1)], lite ? 4 : 8));
    for (const sign of [-1, 1]) {
      for (const [x0, x1] of [[0.30, 0.36], [0.52, 0.58]]) {
        for (const side of [1, -1]) {
          parts.push(wingPaint(sign * x0, sign * x1, 0.004, side > 0 ? 0.992 : 0.992, side, 2, lite ? 4 : 8));
        }
      }
      for (const side of [1, -1]) {
        parts.push(paint((u, v) => {
          const x = sign * (0.13 + 0.05 * u);
          const p = stabPlan(Math.abs(x));
          return stabAt(x, p.le, p.hinge - p.le)(0.02 + 0.96 * v, side);
        }, 2, lite ? 3 : 5, () => new THREE.Vector3(0, side, 0)));
      }
    }
    const blackMesh = new THREE.Mesh(merged(parts), black);
    blackMesh.name = 'p51d-black';
    group.add(blackMesh);
  }

  /* The bubble canopy and the windscreen's frame. */
  {
    const bubble = new THREE.Mesh(canopyGeometry(lite), glass);
    bubble.name = 'p51d-canopy';
    bubble.castShadow = shade;
    hull(bubble, 1.02, ink);
    group.add(bubble);
    const parts = [];
    const s = PS(740);
    const base = fuseAt(s).yc + fuseAt(s).h - 0.004;
    for (const sign of [-1, 1]) {
      parts.push(rod(new THREE.Vector3(sign * 0.020, fuseAt(PS(700)).yc + fuseAt(PS(700)).h, st(PS(700))),
        new THREE.Vector3(sign * 0.006, PH(205), st(s)), 0.0022, 4));
    }
    parts.push(rod(new THREE.Vector3(-0.027, base, st(s)), new THREE.Vector3(0.027, base, st(s)), 0.0020, 4));
    const frames = new THREE.Mesh(merged(parts), frame);
    frames.name = 'p51d-canopy-frame';
    group.add(frames);
  }

  /*
   * The exhaust stacks each side of the cowl, six a side: dark metal.
   */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 6; i += 1) {
        const s0 = PS(300) + i * 0.022;
        const p = fusePoint(s0, sign * Math.PI * 0.40, 0.002);
        parts.push(rod(p, p.clone().add(new THREE.Vector3(sign * 0.006, -0.002, 0.010)), 0.0040, 5));
      }
    }
    const stacks = new THREE.Mesh(merged(parts), stator);
    stacks.name = 'p51d-stacks';
    group.add(stacks);
  }

  /* The moving surfaces. */
  const n = lite ? 4 : 5;
  const leftAil = trailing(AIL_IN + 0.002, AIL_OUT - 0.002, AIL_HINGE, -1, metalDimOf('wing'), shade, lite);
  const rightAil = trailing(AIL_IN + 0.002, AIL_OUT - 0.002, AIL_HINGE, 1, metalDimOf('wing'), shade, lite);
  const leftFlap = trailing(FLAP_IN + 0.002, FLAP_OUT - 0.002, FLAP_HINGE, -1, metalDimOf('wing'), shade, lite);
  const rightFlap = trailing(FLAP_IN + 0.002, FLAP_OUT - 0.002, FLAP_HINGE, 1, metalDimOf('wing'), shade, lite);
  const hingeS = stabPlan(0.1).hinge;
  const eh = (x) => new THREE.Vector3(x, STAB_Y, hingeS);
  const elevator = hinged(merged([elevatorHalf(-1, n), elevatorHalf(1, n)]),
    eh(-STAB_HALF), eh(STAB_HALF), metalDimOf('tail'), shade);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_S)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_S)),
    redDim, shade);

  /*
   * The main gear: each leg with its oleo, its wheel and its outer door,
   * on a pivot at the leg's root under the wing, the axis fore and aft, so
   * that it folds inward and the wheel lies in the well by the fuselage.
   */
  const legRoot = (sign) => {
    const w = wingAt(sign * MAIN_X);
    const p = w(0.10, -1);
    return new THREE.Vector3(sign * MAIN_X, p.y + 0.004, st(MAIN_S) - 0.004);
  };
  const mainLeg = (sign) => {
    const root = legRoot(sign);
    const pivot = new THREE.Group();
    pivot.position.copy(root);
    const axle = new THREE.Vector3(sign * MAIN_X, MAIN_Y, st(MAIN_S)).sub(root);
    const parts = [
      rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(axle.x - sign * (MAIN_W / 2 + 0.004), axle.y + 0.010, axle.z), 0.0048, rodSeg),
    ];
    const hub = new THREE.CylinderGeometry(0.013, 0.013, MAIN_W + 0.004, seg);
    hub.rotateZ(Math.PI / 2);
    hub.translate(axle.x, axle.y, axle.z);
    parts.push(hub);
    const legMesh = new THREE.Mesh(merged(parts), strut);
    legMesh.castShadow = shade;
    pivot.add(legMesh);
    /* The outer door: a plate along the leg, outboard of it. */
    const door = new THREE.BoxGeometry(0.004, Math.abs(axle.y) * 0.75, 0.050);
    door.translate(sign * 0.012 - sign * 0.004, axle.y * 0.45, axle.z - 0.004);
    const doorMesh = new THREE.Mesh(door, wingMetal);
    doorMesh.castShadow = shade;
    pivot.add(doorMesh);
    const t = new THREE.TorusGeometry(MAIN_R - 0.008, 0.008, lite ? 6 : 10, lite ? 16 : 24);
    t.rotateY(Math.PI / 2);
    t.translate(axle.x, axle.y, axle.z);
    const side = new THREE.CylinderGeometry(MAIN_R - 0.008, MAIN_R - 0.008, MAIN_W * 0.9, lite ? 12 : 20);
    side.rotateZ(Math.PI / 2);
    side.translate(axle.x, axle.y, axle.z);
    const wheel = new THREE.Mesh(merged([t, side]), tyre);
    wheel.name = `tyre-main-${sign < 0 ? 'left' : 'right'}`;
    wheel.castShadow = shade;
    pivot.add(wheel);
    return { pivot, axis: new THREE.Vector3(0, 0, 1), sign };
  };
  const leftGear = mainLeg(-1);
  const rightGear = mainLeg(1);

  /*
   * The tail wheel: a fork on a vertical pivot that turns with the rudder,
   * hung from a retract pivot across the fuselage that swings it forward
   * and up into the tail cone.
   */
  const tailGear = (() => {
    const bay = new THREE.Group();
    const top = fuseAt(TAIL_WHEEL_S).yc - fuseAt(TAIL_WHEEL_S).h + 0.004;
    bay.position.set(0, top, st(TAIL_WHEEL_S) - 0.012);
    const steer = new THREE.Group();
    bay.add(steer);
    const axle = new THREE.Vector3(0, TAIL_WHEEL_Y - top, 0.012);
    const fork = new THREE.Mesh(merged([
      rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axle.y + 0.010, axle.z), 0.0022, lite ? 4 : 6),
      new THREE.CylinderGeometry(0.006, 0.006, 0.012, lite ? 6 : 10).rotateZ(Math.PI / 2).translate(axle.x, axle.y, axle.z),
    ]), strut);
    fork.castShadow = shade;
    steer.add(fork);
    const tg = new THREE.TorusGeometry(TAIL_WHEEL_R - 0.004, 0.004, 6, 12);
    tg.rotateY(Math.PI / 2);
    tg.translate(axle.x, axle.y, axle.z);
    const wheel = new THREE.Mesh(tg, tyre);
    wheel.name = 'tyre-tail';
    wheel.castShadow = shade;
    steer.add(wheel);
    return { bay, steer, axis: new THREE.Vector3(1, 0, 0) };
  })();

  const surfaces = {
    'aileron-left': leftAil,
    'aileron-right': rightAil,
    'flap-left': leftFlap,
    'flap-right': rightFlap,
    elevator,
    rudder,
    'gear-left': leftGear,
    'gear-right': rightGear,
  };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }
  tailGear.bay.name = 'gear-tail';
  group.add(tailGear.bay);

  /* The camera in the cockpit, the pilot's eye. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, P51_MOUNT_UP, -P51_MOUNT_FORWARD);
  cameraMount.name = 'p51d-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.018), camBody);
    housing.position.set(0, 0, 0.006);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0078, 0.010, lite ? 8 : 14), camBody);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.008);
    cameraMount.add(barrel);
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0065, lite ? 10 : 18), lens);
    glassDisc.rotation.y = Math.PI;
    glassDisc.position.set(0, 0, -0.0132);
    cameraMount.add(glassDisc);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0070, 0.0012, lite ? 4 : 6, lite ? 10 : 14), ring);
    bezel.position.set(0, 0, -0.0126);
    cameraMount.add(bezel);
  }

  /* The radio mast behind the canopy. NAMED: scripts/craft-check.js
   * leaves wire out of the aircraft's reach. */
  {
    const s = PS(1080);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0020, 0.0012, 0.050, lite ? 5 : 8), antenna);
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.022, st(s) + 0.006);
    mast.rotation.x = 0.30;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The motor behind the spinner, the red spinner, and the four blade prop
   * with yellow tips, on timbercraft.js's mount: rotor.rotation.y is the
   * spin the shell drives.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.012, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, THRUST_Y, st(SPINNER_BASE_S + 0.010));
    group.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(0, THRUST_Y, st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    const back = -(SPINNER_BASE_S - PROP_S);
    const len = PROP_S;
    const prof = [];
    const m = lite ? 5 : 9;
    prof.push(new THREE.Vector2(0.0001, back));
    prof.push(new THREE.Vector2(SPINNER_R, back));
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      const r = Math.max(0.0012, SPINNER_R * Math.sqrt(1 - u * u));
      prof.push(new THREE.Vector2(r, back + (len - back) * (0.15 + 0.85 * u * u) * 0.999));
    }
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 12 : 20), red);
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    propMount.add(spinner);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateZ((22 * Math.PI) / 180);
    const four = [0, 1, 2, 3].map((i) => bladeGeo.clone().rotateY((i * Math.PI) / 2));
    const bladeMesh = new THREE.Mesh(mergeGeometries(four, false), propMat);
    bladeMesh.castShadow = shade;
    rotor.add(bladeMesh);
    const tips = [0, 1, 2, 3].map((i) => {
      const g = new THREE.BoxGeometry(0.026, 0.004, 0.020);
      g.translate(0.002, 0.0012, -PROP_R * 0.93);
      g.rotateY((i * Math.PI) / 2);
      return g;
    });
    const tipMesh = new THREE.Mesh(merged(tips), tipYellow);
    rotor.add(tipMesh);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({ color: 0x4a4d50, transparent: true, opacity: 0.16, depthWrite: false, fog }),
    );
    disc.renderOrder = 1;
    propMount.add(disc);
    discs.push(disc);
  }
  for (let k = 1; k < 4; k += 1) {
    const none = new THREE.Group();
    group.add(none);
    blades.push(none);
    const noDisc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }));
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }

  /* The lights on the pose driver's four slots: the navigation lights in
   * the square tips, red left and green right, a white one on the rudder's
   * trailing edge, and the landing light in the left wing's leading edge. */
  const tipLamp = (sign) => wingAt(sign * (HALF - 0.004))(0.30, 1);
  const lampAt = [
    { p: tipLamp(-1), base: 0xff3a30, front: true },
    { p: tipLamp(1), base: 0x3aff7a, front: false },
    { p: new THREE.Vector3(0, 0.060, st(RUDDER_TE_S) - 0.004), base: 0xfff4dc, front: false },
    { p: wingAt(-0.30)(0.0, 1).add(new THREE.Vector3(0, -0.004, -0.006)), base: 0xfff4dc, front: true },
  ];
  for (const at of lampAt) {
    const ledMat = new THREE.MeshBasicMaterial({ color: at.base, fog });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0050, 8, 6), ledMat);
    led.position.copy(at.p);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base: at.base });
  }

  /*
   * Pose the surfaces, timbercraft.js's signs: ailerons and elevator
   * positive trailing edge up, rudder positive trailing edge to the left,
   * and the tail wheel with it; the flaps positive trailing edge down.
   */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    tailGear.steer.quaternion.copy(q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rudRad));
  }
  function setFlaps(rad) {
    leftFlap.pivot.quaternion.copy(q.setFromAxisAngle(leftFlap.axis, rad));
    rightFlap.pivot.quaternion.copy(q.setFromAxisAngle(rightFlap.axis, rad));
  }
  /* The retracts, 0 down and locked to 1 up: the mains turn inward about
   * their fore and aft pivots through 88 deg, the tail wheel forward and up
   * through 95. */
  function setGear(g) {
    const u = Math.min(1, Math.max(0, g));
    for (const leg of [leftGear, rightGear]) {
      leg.pivot.quaternion.copy(q.setFromAxisAngle(leg.axis, -leg.sign * u * (88 * Math.PI) / 180));
    }
    tailGear.bay.quaternion.copy(q.setFromAxisAngle(tailGear.axis, u * (95 * Math.PI) / 180));
  }
  setSurfaces(0, 0, 0, 0);
  setFlaps(0);
  setGear(0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: P51_PROP_SPIN,
    setSurfaces,
    setFlaps,
    setGear,
    livery: coat.livery,
  };
}
