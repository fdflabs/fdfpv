/*
 * tigermothcraft.js: the Tiger Moth's model, and nothing else.
 *
 * Its own file for cubcraft.js's reason: a biplane is not a monoplane,
 * and this one is not the Pitts either. A long narrow fuselage, slab sided
 * under a rounded top decking, with the Gipsy's long cowl ahead and two
 * open cockpits; two wings of one span and chord, both swept back, the
 * top one staggered well ahead on its cabane over the front cockpit, the
 * bottom one's panels off the fuselage's sides with its ailerons, the
 * only ones; two interplane struts a side, the flying, landing and
 * incidence wires between them; a tailplane on the top longerons with its
 * big lobed elevators, a small fin and de Havilland's big rounded rudder;
 * V strut main gear and a tail wheel on a wire off the rudder. A wooden 12
 * x 6 turns ahead of the cowl.
 *
 * The subject is Great Planes' Tiger Moth ARF, GPMA1330, the full size
 * DH.82A at 1/4.96 on its 71 in span. Great Planes publish the span, the
 * area, the weight, the length, the CG, 70 mm behind the bottom wing's
 * leading edge, and the wheels, 3 1/4 in and a 1 1/4 in tail wheel; the
 * rest is de Havilland's rigging diagram at that scale, as
 * docs/TIGERMOTH-STAGE1.md and scripts/tigermoth-derive.js take it:
 *
 *   wings          1.8034 m both, 0.2683 m of chord, the tips rounded from
 *                  0.80 m out; the top one's leading edge 0.1134 m ahead of
 *                  the bottom one's at the root and swept back 5.2 deg,
 *                  the bottom one's 4.8 deg; dihedral 2 deg 45 min on top,
 *                  4 deg 30 min under; the top wing's chord plane 0.207 m
 *                  over the CG at the root and the bottom's 0.110 under
 *   ailerons       the bottom wing's alone, 0.35 to 0.89 m out, 67 mm
 *   struts         two interplane struts a side 0.615 m out, the cabane's
 *                  four legs over the front cockpit
 *   tail           the tailplane 0.605 m across on the top longerons, its
 *                  root 1.156 to 1.287 m behind the spinner's tip and the
 *                  lobed elevators to 1.440; the rudder's post at 1.287
 *                  and its trailing edge at 1.471, 0.253 m over the CG
 *   gear           a 0.323 m track on 83 mm wheels, the axles 0.169 m ahead
 *                  of the CG and 0.251 m under it; a 32 mm tail wheel
 *                  1.035 m behind
 *   prop           a wooden 12 x 6, clockwise seen from behind, its plane
 *                  0.381 m ahead of the CG
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 70 mm behind the bottom wing's
 * leading edge at the root, 7 mm under the thrust line. Every station
 * below is measured aft from the spinner's tip and turned into the craft
 * frame's z by st(); heights are over the CG.
 *
 * The contract with the shell is cubcraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians.
 * Ailerons and elevator are positive trailing edge up; the rudder is
 * positive trailing edge to the LEFT, and the tail wheel turns with it.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { celMaterial, outlineHull } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { paintRegions } from './livery.js';

/*
 * The aircraft, in metres, in the Three.js craft frame: x right, y up, z
 * aft, origin at the CG. Stations are metres aft of the spinner's tip.
 */
const CG_S = 0.401;
const THRUST_Y = 0.0074;
const PROP_S = CG_S - 0.3808;
const st = (s) => s - CG_S;
const deg = (d) => (d * Math.PI) / 180;

/* The two wings: each a planform along its half span from its root, its
 * leading edge's station and height at a span station. */
const TOP = {
  root: 0,
  half: 0.9017,
  chord: 0.2683,
  rootLE: CG_S - 0.070 - 0.1134,
  sweep: Math.tan(deg(5.23)),
  round0: 0.80,
  y: 0.207,
  dihedral: Math.tan(deg(2.75)),
  thick: 0.12,
};
const BOTTOM = {
  root: 0.0625,
  half: 0.9017,
  chord: 0.2683,
  rootLE: CG_S - 0.070,
  sweep: Math.tan(deg(4.82)),
  round0: 0.80,
  y: -0.110,
  dihedral: Math.tan(deg(4.5)),
  thick: 0.12,
};
const AIL_IN = 0.35;
const AIL_OUT = 0.89;
const AIL_C = 0.067;
/* The interplane struts' span station and the chord fractions of the
 * front and rear struts, at the spars. */
const STRUT_X = 0.615;
const STRUT_F = [0.18, 0.66];

/* A wing's chord, leading edge station and height at span station ax,
 * measured from the centre line; its tip an ellipse's quarter from round0
 * out, raked back as de Havilland's are. */
function plan(w, ax) {
  const a = Math.min(Math.max(ax, w.root), w.half);
  let c = w.chord;
  let rake = 0;
  if (a > w.round0) {
    const u = (a - w.round0) / (w.half - w.round0);
    c = w.chord * Math.sqrt(Math.max(0, 1 - u * u));
    rake = 0.35 * (w.chord - c);
  }
  const le = w.rootLE + w.sweep * (a - w.root) + rake;
  return { c, le, y: w.y + w.dihedral * (a - w.root) };
}
function hingeF(w, ax) {
  const { c } = plan(w, ax);
  return Math.max(0.4, (c - AIL_C) / c);
}

/* The NACA four digit thickness, half of it, at chord fraction t. */
function naca(t, thick) {
  return 5 * thick * (
    0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t
  );
}
/* A trainer's camber, 4 percent at 0.4 of the chord: the wings are drawn
 * cambered, as a Tiger Moth's are. */
function camber(t) {
  const m = 0.04;
  const p = 0.4;
  return t < p ? (m / (p * p)) * (2 * p * t - t * t) : (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * t - t * t);
}

/* A closed airfoil section, cubcraft.js's. */
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

/* A wing's cambered section at span station x; `lift` raises it off the
 * surface, for the paint over it. */
function wingAt(w, x) {
  const { c, le, y } = plan(w, Math.abs(x));
  return (t, side, lift = 0) => new THREE.Vector3(x, y + c * camber(t) + side * (c * naca(t, w.thick) + lift), st(le) + t * c);
}

/* cubcraft.js's loft: closed sections skinned and capped, faced out by
 * the closed result's signed volume. */
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

/* The tip's stations, from round0 out. */
function tipStations(w, lite) {
  const f = lite ? [0.5, 0.85, 0.97] : [0.3, 0.55, 0.75, 0.88, 0.95, 0.985];
  return f.map((u) => w.round0 + (w.half - w.round0) * u);
}

/* The top wing, tip to tip in one loft through its centre section. */
function topWingGeometry(lite) {
  const n = lite ? 8 : 12;
  const half = [0, 0.1, 0.3, 0.5, STRUT_X, TOP.round0, ...tipStations(TOP, lite)];
  const xs = [...half.slice(1).reverse().map((x) => -x), ...half];
  return loft(xs.map((x) => section(wingAt(TOP, x), 0, 1, n)));
}

/* A bottom panel from the fuselage's side to the tip, cut at the
 * aileron's hinge line from AIL_IN to AIL_OUT: the step from a full
 * section to a cut one at the same station is the cut out's side wall. */
function bottomPanelGeometry(sign, lite) {
  const n = lite ? 8 : 12;
  const eps = 0.0005;
  const mids = lite ? [0.6] : [0.5, 0.62, 0.75];
  const half = [
    [BOTTOM.root, 1],
    [0.2, 1],
    [AIL_IN - eps, 1],
    ...[AIL_IN + eps, ...mids, BOTTOM.round0, AIL_OUT - eps].map((x) => [x, hingeF(BOTTOM, x)]),
    [AIL_OUT + eps, 1],
    ...tipStations(BOTTOM, lite).filter((x) => x > AIL_OUT + eps).map((x) => [x, 1]),
  ];
  const stations = sign > 0 ? half : half.slice().reverse();
  return loft(stations.map(([x, f]) => section(wingAt(BOTTOM, sign * x), 0, f, n)));
}

/* A hinged surface, cubcraft.js's: the pivot on the hinge, turning about
 * the hinge's own axis, +x or +y, so a negative turn lifts the trailing
 * edge or swings it left. */
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

function aileron(sign, material, shade, lite) {
  const n = lite ? 4 : 6;
  const xs = [AIL_IN + 0.002, 0.5, 0.62, 0.75, BOTTOM.round0, AIL_OUT - 0.002].map((x) => sign * x);
  if (sign < 0) {
    xs.reverse();
  }
  const geo = loft(xs.map((x) => section(wingAt(BOTTOM, x), hingeF(BOTTOM, Math.abs(x)), 1, n)));
  const hingePoint = (x) => wingAt(BOTTOM, x)(hingeF(BOTTOM, Math.abs(x)), 1).add(wingAt(BOTTOM, x)(hingeF(BOTTOM, Math.abs(x)), -1)).multiplyScalar(0.5);
  return hinged(geo, hingePoint(xs[0]), hingePoint(xs[xs.length - 1]), material, shade);
}

/*
 * The tail, off the rigging diagram's plan view at 1/4.96. The tailplane's
 * leading edge a quarter ellipse from its root, 1.156 m back, to the hinge
 * at the tip; the elevators' big lobes behind the hinge line, to 1.440 at
 * their widest.
 */
const STAB_HALF = 0.3025;
const STAB_ROOT_LE_S = 1.156;
const STAB_HINGE_S = 1.287;
const ELEV_TE_S = 1.440;
const STAB_Y = THRUST_Y;
const STAB_T = 0.07;
function stabPlan(ax) {
  const u = Math.min(1, ax / STAB_HALF);
  const le = STAB_HINGE_S - (STAB_HINGE_S - STAB_ROOT_LE_S) * Math.sqrt(Math.max(0, 1 - u ** 2));
  /* The lobe: fullest at mid span, rounded to the tip and cut in at the
   * root for the rudder. */
  const lobe = Math.sin(Math.PI * Math.min(1, Math.max(0, (ax - 0.02) / (STAB_HALF - 0.02))) ** 0.8);
  const te = STAB_HINGE_S + (ELEV_TE_S - STAB_HINGE_S) * Math.max(0.12, lobe);
  return { le: st(Math.min(le, STAB_HINGE_S - 0.012)), hinge: st(STAB_HINGE_S), te: st(Math.max(te, STAB_HINGE_S + 0.012)) };
}
function stabAt(x, le, c) {
  return (t, side, lift = 0) => new THREE.Vector3(x, STAB_Y + side * (c * naca(t, STAB_T) + lift), le + t * c);
}
function stabGeometry(n) {
  const xs = [-STAB_HALF + 0.003, -0.28, -0.24, -0.18, -0.10, 0, 0.10, 0.18, 0.24, 0.28, STAB_HALF - 0.003];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
/* The elevators, both halves in one piece joined behind the rudder
 * post's foot. */
function elevatorGeometry(n) {
  const halfOf = (sign) => {
    const xs = [0.018, 0.06, 0.12, 0.18, 0.24, 0.28, STAB_HALF - 0.005].map((x) => sign * x);
    if (sign < 0) {
      xs.reverse();
    }
    return loft(xs.map((x) => {
      const p = stabPlan(Math.abs(x));
      return section(stabAt(x, p.hinge, p.te - p.hinge), 0, 1, n);
    }));
  };
  return merged([halfOf(-1), halfOf(1)]);
}

/* The small fin and de Havilland's rounded rudder, their outline by
 * height y over the CG. */
const TAIL_TOP = 0.253;
const RUDDER_BOTTOM = -0.073;
const RUDDER_S = STAB_HINGE_S;
const RUDDER_TE_S = 1.4706;
const FIN_T = 0.07;
function finAt(y, le, c) {
  return (t, side) => new THREE.Vector3(side * c * naca(t, FIN_T), y, le + t * c);
}
function finLE(y) {
  const y0 = 0.02;
  const u = Math.min(1, Math.max(0, (y - y0) / (0.14 - y0)));
  return 1.195 + (RUDDER_S - 0.008 - 1.195) * Math.sqrt(u);
}
function rudderTE(y) {
  /* The rudder: its trailing edge a tall ellipse, widest under its middle,
   * rounded over the top into the post. */
  const yc = 0.07;
  const h = TAIL_TOP - yc;
  const u = Math.min(1, Math.max(0, (y - yc) / h));
  const below = Math.min(1, Math.max(0, (yc - y) / (yc - RUDDER_BOTTOM)));
  const top = Math.sqrt(Math.max(0.02, 1 - u * u));
  return RUDDER_S + (RUDDER_TE_S - RUDDER_S) * (y >= yc ? top : Math.sqrt(Math.max(0.3, 1 - below ** 3)));
}
function finGeometry(n) {
  const ys = [0.02, 0.05, 0.08, 0.11, 0.135];
  return loft(ys.map((y) => {
    const le = finLE(y);
    return section(finAt(y, st(le), RUDDER_S - le), 0, 1, n);
  }));
}
function rudderGeometry(n) {
  const ys = [RUDDER_BOTTOM + 0.004, -0.04, 0.0, 0.05, 0.10, 0.15, 0.19, 0.22, 0.24, TAIL_TOP - 0.003];
  return loft(ys.map((y) => section(finAt(y, st(RUDDER_S), rudderTE(y) - RUDDER_S), 0, 1, n)));
}

/*
 * The fuselage, as rounded box sections along the stations: half width,
 * top, bottom (over the CG) and squareness. The Gipsy's long narrow cowl
 * from the spinner's back plate to the firewall, 0.176 m behind the tip;
 * the fuselage slab sided under a rounded top decking, deepest at the
 * cockpits, its bottom the bottom wing's root, tapering to the rudder
 * post, where the rigging diagram's side view puts its bottom 0.40 m (full
 * size) under the thrust line.
 */
const FIREWALL_S = CG_S - 0.205;
const FUSE = [
  [0.028, 0.022, 0.030, -0.028, 2.0],
  [0.045, 0.034, 0.042, -0.050, 2.2],
  [0.090, 0.044, 0.052, -0.078, 2.6],
  [0.150, 0.050, 0.060, -0.098, 3.0],
  [FIREWALL_S, 0.054, 0.064, -0.108, 3.4],
  [0.300, 0.062, 0.070, -0.118, 3.6],
  [0.450, 0.064, 0.074, -0.122, 3.6],
  [0.600, 0.060, 0.070, -0.118, 3.6],
  [0.800, 0.046, 0.056, -0.104, 3.4],
  [1.000, 0.032, 0.042, -0.092, 3.2],
  [1.150, 0.020, 0.030, -0.082, 3.0],
  [RUDDER_S, 0.010, 0.020, -0.075, 2.6],
];
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
      return { w: lerp(1), h: (top - bottom) / 2, yc: (top + bottom) / 2, e: lerp(4), top, bottom };
    }
  }
  throw new Error(`tigermothcraft: station ${s} is off the fuselage`);
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
function fuseGeometry(ss, around) {
  return loft(ss.map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/* The two cockpits: the front one under the top wing's trailing edge,
 * the rear one, the pilot's, behind it; each an opening in the decking
 * with a small windscreen ahead. */
const COCKPITS = [0.395, 0.555];
const COCKPIT_L = 0.085;

/* A panel a hair over (side 1) or under (-1) a surface given as at(x, f),
 * a quad from (x0, f0) to (x1, f1) in its span and chord, subdivided along
 * the chord so it follows the section. */
function surfacePanel(at, quad, side, lift = 0.0012, steps = 6) {
  const pos = [];
  const idx = [];
  const [[xa, fa], [xb, fb], [xc, fc], [xd, fd]] = quad;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const p = at(xa + (xd - xa) * u, fa + (fd - fa) * u, side, lift);
    const q = at(xb + (xc - xb) * u, fb + (fc - fb) * u, side, lift);
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (Math.sign(geo.getAttribute('normal').getY(0)) !== side) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return geo;
}

/* A band round the fuselage from station s0 to s1, a hair proud of it. */
function fuseBand(s0, s1, around, out = 0.0012) {
  const ss = [s0, (s0 + s1) / 2, s1];
  const ring = (s) => {
    const r = [];
    for (let i = 0; i < around; i += 1) {
      r.push(fusePoint(s, (2 * Math.PI * i) / around, out));
    }
    return r;
  };
  const rings = ss.map(ring);
  const pos = [];
  for (const r of rings) {
    for (const p of r) {
      pos.push(p.x, p.y, p.z);
    }
  }
  const idx = [];
  for (let k = 0; k + 1 < rings.length; k += 1) {
    for (let j = 0; j < around; j += 1) {
      const a = k * around + j;
      const b = k * around + ((j + 1) % around);
      idx.push(a, b, a + around, b, b + around, a + around);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
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

/* A 12 x 6 wooden blade, broad and round tipped. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0060, 0.012);
  s.bezierCurveTo(0.0230, -0.020, 0.0210, -r * 0.60, 0.0120, -r * 0.96);
  s.quadraticCurveTo(0.0020, -r * 1.01, -0.0070, -r * 0.95);
  s.bezierCurveTo(-0.0170, -r * 0.45, -0.0120, -0.012, -0.0040, 0.012);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0050, bevelEnabled: false, curveSegments: segments });
}

function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('tigermothcraft: merge failed');
  }
  return geo;
}

const PROP_R = 0.1524;
const SPINNER_R = 0.0286;
const SPINNER_BASE_S = 0.052;

/* The gear, as scripts/tigermoth-derive.js takes it off the rigging
 * diagram's side view. */
const MAIN_X = 0.1614;
const MAIN_S = CG_S - 0.1688;
const MAIN_Y = -0.2508;
const MAIN_R = 0.0413;
const MAIN_W = 0.024;
const TAIL_PIVOT_S = CG_S + 1.010;
const TAIL_WHEEL_S = CG_S + 1.0354;
const TAIL_WHEEL_Y = -0.1033;
const TAIL_WHEEL_R = 0.0159;

/*
 * The wheels' drawn lowest points in the level craft frame, and the
 * attitude they rest at, cubcraft.js's construction: the ground line
 * tangent under the main and tail wheel circles, solved by bisection.
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
 * Exported numbers, so the airframe table and the scale check are held
 * against the drawn machine: hullR the furthest reach in plan, which is
 * the wing tips', 0.90 m out against the rudder's trailing edge 1.07 m
 * aft; vHalfUp the rudder's top, over the top wing's 0.25 at its tips;
 * vHalfDown the main tyres' bottoms.
 */
const TIP_UP = TOP.y + TOP.dihedral * TOP.half + TOP.chord * 0.1;
const UP = Math.max(PROP_R + THRUST_Y, TAIL_TOP, TIP_UP);
const DOWN = -(MAIN_Y - MAIN_R);
const REACH = Math.hypot(TOP.half, st(plan(TOP, TOP.half).le));
export const TIGERMOTH_DIMS = {
  span: 2 * TOP.half,
  chord: TOP.chord,
  gapRoot: TOP.y - BOTTOM.y,
  staggerRoot: BOTTOM.rootLE - TOP.rootLE,
  stabSpan: 2 * STAB_HALF,
  gearTrack: 2 * MAIN_X,
  propR: PROP_R,
  noseZ: st(0),
  tailZ: st(RUDDER_TE_S),
  length: RUDDER_TE_S,
  vHalfUp: UP,
  vHalfDown: DOWN,
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
    hullR: Math.max(REACH, RUDDER_TE_S - CG_S),
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: RUDDER_TE_S,
    bodyWidth: 2 * TOP.half,
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera mount: the pilot's eye in the rear cockpit, where the plant's
 * camera is (src/native/plant.c), 0.10 m behind the CG and 0.08 m over
 * it: the top wing's trailing edge overhead, the long nose ahead between
 * the cabane's legs, the wings and their wires either side.
 */
const CAM_S = CG_S + 0.10;
export const TIGERMOTH_MOUNT_FORWARD = -st(CAM_S);
export const TIGERMOTH_MOUNT_UP = 0.08;

/* A tractor turning clockwise seen from behind, as cubcraft.js's. */
export const TIGERMOTH_PROP_SPIN = [1, 0, 0, 0];

export function buildTigermothCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'tigermoth-craft';
  if (opts.worldScale) {
    group.scale.setScalar(1 / WORLD_SCALE);
  }
  const hull = (mesh, t, c) => {
    if (inkOn) {
      outlineHull(mesh, t, c);
    }
    return mesh;
  };
  const seg = lite ? 8 : 12;
  const rodSeg = lite ? 4 : 6;

  /* The scheme's colours by region (src/render/livery.js), Great Planes'
   * own: Top Flite's Cub Yellow film all over, the cowl and the stripe
   * black; the trainer bands, which the stock scheme does not show, are
   * its yellow too. The surfaces a shade of their region. */
  const coat = paintRegions();
  const yellow = { color: 0xf5b21c, rim: 0.28, spec: 0.34, specWidth: 0.016 };
  const wingMat = coat.base('wing', cel(yellow));
  const fuseMat = coat.base('fuselage', cel(yellow));
  const tailMat = coat.base('tail', cel(yellow));
  const cowlMat = coat.base('cowl', cel({ color: 0x17181a, rim: 0.30, spec: 0.55, specWidth: 0.018, specColor: 0xd8e0e8 }));
  const bandMat = coat.base('bands', cel(yellow));
  const trimMat = coat.base('trim', cel({ color: 0x17181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 }));
  const wingFlap = coat.shade('wing', cel({ color: 0xdc9e14, rim: 0.28, spec: 0.30, specWidth: 0.016 }));
  const tailFlap = coat.shade('tail', cel({ color: 0xdc9e14, rim: 0.28, spec: 0.30, specWidth: 0.016 }));
  const black = cel({ color: 0x16181a, rim: 0.30, spec: 0.45, specWidth: 0.016, specColor: 0xd8e0e8 });
  const strutMat = cel({ color: 0x2a2b2d, rim: 0.30, spec: 0.40, specWidth: 0.016 });
  const metal = cel({ color: 0xb4b0a6, rim: 0.30, spec: 0.70, specWidth: 0.022 });
  const wire = cel({ color: 0x6a6e72, rim: 0.30, spec: 0.60, specWidth: 0.020 });
  const glass = cel({ color: 0x2f4658, rim: 0.40, spec: 0.55, specWidth: 0.020, specColor: 0xf3ead4 });
  const leather = cel({ color: 0x3a2618, rim: 0.26, spec: 0.20 });
  const stator = cel({ color: 0x2a322c, rim: 0.24, spec: 0.20 });
  const camBody = cel({ color: 0x141c16, rim: 0.26, spec: 0.35 });
  const lens = cel({
    color: 0x101610,
    rim: 0.40,
    spec: 0.95,
    specWidth: 0.03,
    specColor: 0xf3ead4,
    side: THREE.DoubleSide,
  });
  const ring = cel({ color: 0xb8b09e, rim: 0.28, spec: 0.55 });
  const propMat = cel({ color: 0x7a4a24, rim: 0.28, spec: 0.45, specWidth: 0.016 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c120e;

  /* The measurement box, hidden, on the contract with verify's check 15 (tests/lib/checks.js). */
  if (opts.measure) {
    const d = TIGERMOTH_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), wingMat);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The fuselage from the firewall aft, and the cowl ahead of it, each
   * centred on its own middle so the hull thickens it evenly. */
  const around = lite ? 16 : 24;
  const addBody = (ss, mat, name) => {
    const geo = fuseGeometry(ss, around);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(c);
    m.name = name;
    m.castShadow = shade;
    hull(m, 1.018, ink);
    group.add(m);
  };
  addBody(lite
    ? [FIREWALL_S, 0.300, 0.450, 0.600, 0.800, 1.000, 1.150, RUDDER_S]
    : [FIREWALL_S, 0.250, 0.300, 0.375, 0.450, 0.525, 0.600, 0.700, 0.800, 0.900, 1.000, 1.075, 1.150, 1.220, RUDDER_S],
  fuseMat, 'tigermoth-fuselage');
  addBody(lite ? [0.028, 0.045, 0.090, 0.150, FIREWALL_S] : [0.028, 0.035, 0.045, 0.065, 0.090, 0.120, 0.150, 0.180, FIREWALL_S],
    cowlMat, 'tigermoth-cowl');

  /* The two wings, one draw, and the tail feathers, one draw. */
  {
    const n = lite ? 5 : 7;
    const wings = new THREE.Mesh(merged([topWingGeometry(lite), bottomPanelGeometry(-1, lite), bottomPanelGeometry(1, lite)]), wingMat);
    wings.name = 'tigermoth-wings';
    wings.castShadow = shade;
    hull(wings, 1.006, ink);
    group.add(wings);
    const tail = new THREE.Mesh(merged([stabGeometry(n), finGeometry(n)]), tailMat);
    tail.name = 'tigermoth-tail';
    tail.castShadow = shade;
    group.add(tail);
  }

  /*
   * The trainer bands, one draw: a band round the rear fuselage ahead of
   * the tail and one chordwise across each wing panel, over the top wing's
   * top and under the bottom wing, as the RAF's post war trainers wore
   * them. In the stock scheme they are the film's own yellow.
   */
  {
    const parts = [fuseBand(0.93, 1.00, around)];
    const topAt = (x, f, side, lift) => wingAt(TOP, x)(Math.min(0.995, Math.max(0.005, f)), side, lift);
    const botAt = (x, f, side, lift) => wingAt(BOTTOM, x)(Math.min(0.995, Math.max(0.005, f)), side, lift);
    for (const sign of [-1, 1]) {
      const [x0, x1] = [0.66, 0.74];
      parts.push(surfacePanel(topAt, [[sign * x0, 0.02], [sign * x1, 0.02], [sign * x1, 0.98], [sign * x0, 0.98]], 1, 0.0014, 8));
      parts.push(surfacePanel(topAt, [[sign * x0, 0.02], [sign * x1, 0.02], [sign * x1, 0.98], [sign * x0, 0.98]], -1, 0.0014, 8));
      parts.push(surfacePanel(botAt, [[sign * 0.26, 0.02], [sign * 0.33, 0.02], [sign * 0.33, 0.98], [sign * 0.26, 0.98]], -1, 0.0014, 8));
      parts.push(surfacePanel(botAt, [[sign * 0.26, 0.02], [sign * 0.33, 0.02], [sign * 0.33, 0.98], [sign * 0.26, 0.98]], 1, 0.0014, 8));
    }
    const bands = new THREE.Mesh(merged(parts), bandMat);
    bands.name = 'tigermoth-bands';
    group.add(bands);
  }

  /*
   * The black, one draw: Great Planes' stripe down each side from the
   * cowl to the tail, the cockpits' leather coamings, and the RAF's fin
   * flash on each side of the rudder.
   */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const pos = [];
      const idx = [];
      const ss = [FIREWALL_S, 0.35, 0.55, 0.75, 0.95];
      ss.forEach((s, i) => {
        const a = sign * 1.45;
        const u = fusePoint(s, a - 0.05 * sign, 0.0012);
        const d = fusePoint(s, a + 0.05 * sign, 0.0012);
        pos.push(u.x, u.y, u.z, d.x, d.y, d.z);
        if (i > 0) {
          const k = i * 2;
          if (sign > 0) {
            idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
          } else {
            idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
          }
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      parts.push(g);
    }
    const stripe = new THREE.Mesh(merged(parts), trimMat);
    stripe.name = 'tigermoth-stripe';
    group.add(stripe);
    const coaming = [];
    for (const s of COCKPITS) {
      const t = new THREE.TorusGeometry(1, 0.10, 5, lite ? 12 : 18);
      t.rotateX(Math.PI / 2);
      t.scale(fuseAt(s).w * 0.85, 0.08, COCKPIT_L / 2);
      t.translate(0, fuseAt(s).top + 0.002, st(s));
      coaming.push(t);
      const hole = new THREE.CircleGeometry(1, lite ? 12 : 18);
      hole.rotateX(-Math.PI / 2);
      hole.scale(fuseAt(s).w * 0.80, 1, COCKPIT_L / 2 * 0.94);
      hole.translate(0, fuseAt(s).top + 0.003, st(s));
      coaming.push(hole);
    }
    const pits = new THREE.Mesh(merged(coaming), leather);
    pits.name = 'tigermoth-cockpits';
    group.add(pits);
  }

  /* The windscreens, a small curved screen ahead of each cockpit. */
  {
    const parts = [];
    for (const s of COCKPITS) {
      const f = fuseAt(s - COCKPIT_L / 2);
      const g = new THREE.CylinderGeometry(f.w * 0.7, f.w * 0.7, 0.030, lite ? 8 : 12, 1, true, -Math.PI / 2, Math.PI);
      g.rotateX(-0.35);
      g.translate(0, f.top + 0.016, st(s - COCKPIT_L / 2 - 0.004));
      parts.push(g);
    }
    const screens = new THREE.Mesh(merged(parts), glass);
    screens.name = 'tigermoth-glass';
    group.add(screens);
  }

  /*
   * The struts and the wires. The cabane: a front and a rear leg a side
   * from the top longerons over the front cockpit to the top wing's
   * centre section at its spars. The interplane struts, two a side, flat,
   * between the wings' spars at STRUT_X. The flying wires from the bottom
   * wing's root to the top of the interplane struts, the landing wires
   * from the top wing's root to their feet, doubled front and back; the
   * incidence wires crossing between the front and rear struts.
   */
  {
    const strutParts = [];
    const wireParts = [];
    const under = (w, x, f) => wingAt(w, x)(f, -1);
    const over = (w, x, f) => wingAt(w, x)(f, 1);
    for (const sign of [-1, 1]) {
      for (const f of [0.18, 0.62]) {
        const head = under(TOP, sign * 0.09, f);
        const s = head.z + CG_S;
        const foot = new THREE.Vector3(sign * (fuseAt(s).w - 0.004), fuseAt(s).top - 0.012, head.z + 0.03);
        strutParts.push(rod(foot, head, 0.0045, rodSeg, 2.5));
      }
      const tops = [];
      const feet = [];
      for (const f of STRUT_F) {
        const top = under(TOP, sign * STRUT_X, f);
        const foot = over(BOTTOM, sign * STRUT_X, f);
        tops.push(top);
        feet.push(foot);
        strutParts.push(rod(foot, top, 0.0055, rodSeg, 2.8));
      }
      /* The incidence wires, an X between the front and rear struts. */
      wireParts.push(rod(feet[0], tops[1], 0.0008, lite ? 3 : 4));
      wireParts.push(rod(feet[1], tops[0], 0.0008, lite ? 3 : 4));
      /* Flying and landing wires, front and back. */
      for (const f of STRUT_F) {
        const rootLow = over(BOTTOM, sign * (BOTTOM.root + 0.005), f);
        const rootHigh = under(TOP, sign * 0.10, f);
        wireParts.push(rod(rootLow, under(TOP, sign * (STRUT_X - 0.015), f), 0.0009, lite ? 3 : 4));
        wireParts.push(rod(rootHigh, over(BOTTOM, sign * (STRUT_X - 0.015), f), 0.0009, lite ? 3 : 4));
      }
    }
    /* The gear's V struts and shock struts are the struts' black too. */
    for (const sign of [-1, 1]) {
      const axle = new THREE.Vector3(sign * (MAIN_X - MAIN_W / 2 - 0.004), MAIN_Y, st(MAIN_S));
      for (const ds of [-0.075, 0.075]) {
        const s = MAIN_S + ds;
        const root = new THREE.Vector3(sign * 0.030, fuseAt(s).bottom + 0.006, st(s));
        strutParts.push(rod(root, axle, 0.0040, rodSeg, 1.8));
      }
      /* The shock strut, from the axle up to the fuselage's side under the
       * front cockpit's floor, and the axle's bar across. */
      const top = new THREE.Vector3(sign * (fuseAt(MAIN_S + 0.02).w - 0.002), fuseAt(MAIN_S + 0.02).bottom + 0.035, st(MAIN_S + 0.02));
      strutParts.push(rod(axle, top, 0.0055, rodSeg));
    }
    const struts = new THREE.Mesh(merged(strutParts), strutMat);
    struts.name = 'tigermoth-struts';
    struts.castShadow = shade;
    group.add(struts);
    /* NAMED, because it is wire and not aircraft. */
    const wires = new THREE.Mesh(merged(wireParts), wire);
    wires.name = 'wires';
    group.add(wires);
  }

  /* Black trim, one draw: the tyres. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const tyre = new THREE.TorusGeometry(MAIN_R - 0.011, 0.011, 6, lite ? 16 : 22);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(tyre);
    }
    const tyres = new THREE.Mesh(merged(parts), black);
    tyres.name = 'tigermoth-tyres';
    tyres.castShadow = shade;
    group.add(tyres);
  }

  /* The metal: the wheels' hubs, the exhaust along the cowl's left side,
   * and the tail wheel's wire. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const hub = new THREE.CylinderGeometry(0.022, 0.022, MAIN_W, seg);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sign * MAIN_X, MAIN_Y, st(MAIN_S));
      parts.push(hub);
    }
    const ex0 = fusePoint(0.07, -1.75, 0.006);
    const ex1 = fusePoint(0.40, -1.75, 0.010);
    parts.push(rod(ex0, ex1, 0.0055, seg));
    parts.push(rod(new THREE.Vector3(0, fuseAt(1.24).bottom + 0.004, st(1.24)),
      new THREE.Vector3(0, RUDDER_BOTTOM - 0.004, st(TAIL_PIVOT_S)), 0.0018, lite ? 4 : 6, 0.4));
    const metalMesh = new THREE.Mesh(merged(parts), metal);
    metalMesh.name = 'tigermoth-metal';
    metalMesh.castShadow = shade;
    group.add(metalMesh);
  }

  /* The moving surfaces: the bottom wing's ailerons, the elevators, the
   * rudder. */
  const n = lite ? 4 : 5;
  const leftAil = aileron(-1, wingFlap, shade, lite);
  const rightAil = aileron(1, wingFlap, shade, lite);
  const eh = (x) => new THREE.Vector3(x, STAB_Y, stabPlan(Math.abs(x)).hinge);
  const elevator = hinged(elevatorGeometry(n), eh(-STAB_HALF), eh(STAB_HALF), tailFlap, shade);
  const rudder = hinged(rudderGeometry(n),
    new THREE.Vector3(0, RUDDER_BOTTOM, st(RUDDER_S)),
    new THREE.Vector3(0, TAIL_TOP, st(RUDDER_S)),
    tailFlap, shade);
  /* The RAF's fin flash on the rudder, red, white and blue from the post,
   * riding on it. */
  {
    const flash = [];
    const cols = [0xc8102e, 0xf2f0ec, 0x1d3f8a];
    cols.forEach((col, i) => {
      const mat = cel({ color: col, rim: 0.28, spec: 0.30, side: THREE.DoubleSide });
      const w = 0.018;
      const g = new THREE.PlaneGeometry(w, 0.10);
      const z = st(RUDDER_S) + 0.012 + i * w + w / 2;
      for (const side of [-1, 1]) {
        const p = g.clone();
        p.rotateY(Math.PI / 2);
        p.translate(side * 0.0075, 0.12, z);
        p.translate(-rudder.pivot.position.x, -rudder.pivot.position.y, -rudder.pivot.position.z);
        const m = new THREE.Mesh(p, mat);
        rudder.pivot.add(m);
        flash.push(m);
      }
    });
  }

  /* The tail wheel on its own vertical pivot under the rudder post,
   * turning with it, as its wire in the rudder turns it. */
  const tailwheel = (() => {
    const pivot = new THREE.Group();
    pivot.position.set(0, RUDDER_BOTTOM - 0.004, st(TAIL_PIVOT_S));
    const trail = TAIL_WHEEL_S - TAIL_PIVOT_S;
    const dropY = TAIL_WHEEL_Y - (RUDDER_BOTTOM - 0.004);
    const forkParts = [
      rod(new THREE.Vector3(0, 0.002, 0), new THREE.Vector3(0, dropY + 0.002, trail), 0.0018, lite ? 4 : 6),
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.010, lite ? 6 : 10).rotateZ(Math.PI / 2).translate(0, dropY, trail),
    ];
    const fork = new THREE.Mesh(merged(forkParts), metal);
    fork.castShadow = shade;
    pivot.add(fork);
    const tyreGeo = new THREE.TorusGeometry(TAIL_WHEEL_R - 0.0045, 0.0045, 5, 12);
    tyreGeo.rotateY(Math.PI / 2);
    tyreGeo.translate(0, dropY, trail);
    const tyre = new THREE.Mesh(tyreGeo, black);
    tyre.name = 'tyre-tail';
    tyre.castShadow = shade;
    pivot.add(tyre);
    return { pivot, axis: new THREE.Vector3(0, 1, 0) };
  })();

  const surfaces = {
    'aileron-left': leftAil,
    'aileron-right': rightAil,
    elevator,
    rudder,
    tailwheel,
  };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  /* The camera, the pilot's eye in the rear cockpit. */
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, TIGERMOTH_MOUNT_UP, -TIGERMOTH_MOUNT_FORWARD);
  cameraMount.name = 'tigermoth-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.020, 0.020), camBody);
    housing.position.set(0, 0, 0.006);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0080, 0.0086, 0.012, lite ? 8 : 14), camBody);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.010);
    cameraMount.add(barrel);
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0072, lite ? 10 : 18), lens);
    glassDisc.rotation.y = Math.PI;
    glassDisc.position.set(0, 0, -0.0162);
    cameraMount.add(glassDisc);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0078, 0.0013, lite ? 4 : 6, lite ? 10 : 14), ring);
    bezel.position.set(0, 0, -0.0156);
    cameraMount.add(bezel);
  }

  /* The video antenna, a whip on the decking behind the rear cockpit.
   * NAMED, because it is wire and not aircraft: scripts/craft-check.js
   * leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.070, lite ? 5 : 8), antenna);
    const s = CG_S + 0.40;
    mast.position.set(0, fuseAt(s).top + 0.032, st(s) + 0.010);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /* The engine's front behind the spinner, the spinner, and the prop, on
   * cubcraft.js's mount. */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.010, seg), stator);
    can.rotation.x = Math.PI / 2;
    can.position.set(0, THRUST_Y, st(SPINNER_BASE_S + 0.006));
    group.add(can);

    const propMount = new THREE.Group();
    propMount.position.set(0, THRUST_Y, st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);

    const back = -(SPINNER_BASE_S - PROP_S);
    const len = PROP_S;
    const prof = [];
    const m = lite ? 4 : 6;
    prof.push(new THREE.Vector2(0.0001, back));
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      const r = Math.max(0.0005, SPINNER_R * Math.sqrt(1 - u * u));
      prof.push(new THREE.Vector2(r, back + 0.004 + (len - back - 0.004) * u));
    }
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 10 : 14), black);
    spinner.name = 'spinner';
    spinner.castShadow = shade;
    propMount.add(spinner);

    const rotor = new THREE.Group();
    propMount.add(rotor);
    const bladeGeo = bladeGeometry(lite ? 5 : 8);
    bladeGeo.rotateX(-Math.PI / 2);
    bladeGeo.rotateZ((12 * Math.PI) / 180);
    const bladeMesh = new THREE.Mesh(mergeGeometries([bladeGeo, bladeGeo.clone().rotateY(Math.PI)], false), propMat);
    bladeMesh.castShadow = shade;
    rotor.add(bladeMesh);
    blades.push(rotor);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(PROP_R, PROP_R, 0.0012, lite ? 16 : 32),
      new THREE.MeshBasicMaterial({
        color: 0x5a4a3a,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        fog,
      }),
    );
    disc.renderOrder = 1;
    propMount.add(disc);
    discs.push(disc);
  }
  for (let k = 1; k < 4; k += 1) {
    const none = new THREE.Group();
    group.add(none);
    blades.push(none);
    const noDisc = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, fog }),
    );
    noDisc.visible = false;
    group.add(noDisc);
    discs.push(noDisc);
  }

  /* Four lamps on the four slots the pose driver walks, cubcraft.js's
   * arrangement: the top wing's tips, the cowl and the decking ahead of
   * the fin. */
  const tipTop = (x) => wingAt(TOP, x)(0.4, 1);
  const lampAt = [
    { p: tipTop(-0.86), front: true },
    { p: tipTop(0.86), front: false },
    { p: fusePoint(0.090, 0), front: true },
    { p: fusePoint(1.100, 0), front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0035, 0.014), ledMat);
    led.position.copy(at.p);
    led.position.y += 0.001;
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

  /* Pose the surfaces, cubcraft.js's signs. */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    leftAil.pivot.quaternion.copy(q.setFromAxisAngle(leftAil.axis, -leftRad));
    rightAil.pivot.quaternion.copy(q.setFromAxisAngle(rightAil.axis, -rightRad));
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
    tailwheel.pivot.quaternion.copy(q.setFromAxisAngle(tailwheel.axis, -rudRad));
  }
  setSurfaces(0, 0, 0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: TIGERMOTH_PROP_SPIN,
    setSurfaces,
    livery: coat.livery,
  };
}
