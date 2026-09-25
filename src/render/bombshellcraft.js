/*
 * bombshellcraft.js: the Buzzard Bombshell's model, and nothing else.
 *
 * Its own file for the reason cubcraft.js is. The Bombshell is Joe
 * Konefes' 1940 gas free flight cabin model (Air Trails, October 1940; it
 * won the Buzzards Club of Chicago's club design contest and the Class C
 * record at the 1940 Nationals). The subject here is BMJR Models' 1/2A
 * Texaco kit of it, B-608, as BMJR's product photograph shows it built: a
 * tissue covered balsa airframe, the high wing and the stabiliser red,
 * the fuselage and the fin black with a red swoop along the lower cabin,
 * a Cox Texaco .049 glow engine in the nose with its finned cylinder
 * standing up out of the cowl, a wire gear on two light wheels and a wire
 * tail skid.
 *
 * BMJR publishes the span, 44 in, and the area, 330 sq in, and nothing of
 * the outline. The outline is Bob Peru's Baby Bombshell +20 percent, the
 * 1/2A Texaco Bombshell of the same size (42 in, 300 sq in, "Cox Texaco
 * .049 or any reed valve .049 recommended"), whose full size plan Outerzone
 * holds (oz2180): BMJR's 44 in and 330 sq in are that plan's 42 in and 300
 * sq in scaled by 44/42, to one percent, and so is every station below.
 * Each number is written in the PLAN'S INCHES, measured off the plan at 80
 * dpi, and turned into metres of the BMJR aircraft by P():
 *
 *   span            44 in; a constant 7.19 in chord out to 19.2 in, then
 *                   a balsa tip rounded in plan, more at the leading edge
 *   wing            a flat bottomed section about 10 percent thick, at 2
 *                   degrees of incidence on the cabin (the plan: "wing is
 *                   at 2 degree positive incidence (built in)");
 *                   polyhedral off the plan's spar template: 5 degrees
 *                   each side to 14.25 in out, the tips 23 degrees from
 *                   there
 *   fuselage        slab sided balsa, 2.05 in wide, the cabin under the
 *                   wing with a raked windscreen and two windows a side,
 *                   the turtledeck falling steeply to the tail
 *   tail            a stabiliser 15.5 in across on the fuselage's top at
 *                   0 degrees, its leading edge swept, 5.9 in of root
 *                   chord, the elevator its aft 1.38 in; a fin 4.85 in
 *                   over the thrust line whose round top runs down into
 *                   the rudder, the rudder its aft half
 *   engine          the Cox Texaco .049, drawn to Cox's full size drawing
 *                   (Cox, Texaco .049 care and operation, 1994) at life
 *                   size, not to the plan's scale: the black crankcase,
 *                   the five fin cylinder standing up, the glow head
 *   prop            Cox's 7 x 3.5 two blade, a 0.1778 m disc, clockwise
 *                   seen from behind as every glow engine turns
 *   gear            1/16 in wire from the fuselage's floor to 1 3/4 in
 *                   light wheels, the axles 3.5 in behind the prop and
 *                   4.375 in under the thrust line on a 6.5 in track
 *                   (the track ESTIMATED from the plan's gear pattern);
 *                   a wire tail skid under the stabiliser
 *   length          30.75 in, prop to the rudder's trailing edge
 *
 * THE ORIGIN IS THE CENTRE OF GRAVITY: 33 percent of the chord behind the
 * wing's leading edge, which is the forward end of the plan's "balance
 * point range" (29 to 43 percent), and 0.2 in above the thrust line,
 * ESTIMATED from the wing above and the gear below. Stations are measured
 * aft of the prop's plane and turned into the craft frame's z by st();
 * heights are over the thrust line and turned by ht().
 *
 * The contract with the shell is cubcraft.js's: group, discs, blades,
 * leds, cameraMount, stator, propSpin, four slots long, and
 * setSurfaces(leftAileron, rightAileron, elevator, rudder) in radians. The
 * Bombshell has no ailerons, so the first two are read and ignored, as
 * the plant reports them zero. Elevator positive trailing edge up; rudder
 * positive trailing edge to the LEFT. The tail skid is wire fixed to the
 * fuselage: nothing steers on the ground but the rudder in the slipstream.
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

/* The plan's inches in metres of the BMJR aircraft: 44 in for 42 in. */
const P = (inches) => inches * 0.0254 * (44 / 42);
/* Real inches, for what the kit does not scale: the engine, the prop and
 * the wheels are bought parts. */
const R = (inches) => inches * 0.0254;

/* Stations: the wing's leading edge and chord, and the CG. */
const LE_S = 3.875;
const CHORD_IN = 7.19;
const CG_S = LE_S + 0.33 * CHORD_IN;
const CG_H = 0.2;
const st = (s) => P(s - CG_S);
const ht = (h) => P(h - CG_H);

/* The wing, plan inches. HALF is the tip, TIP_IN where it starts to round,
 * BREAK the polyhedral joint. */
const HALF = 21.0;
const TIP_IN = 19.2;
const BREAK = 14.25;
const DIH_IN = (5 * Math.PI) / 180;
const DIH_OUT = (23 * Math.PI) / 180;
/* The root's flat bottom at the leading edge; 2 degrees of incidence drop
 * the trailing edge's 0.251 in lower, onto the cabin's top. */
const ROOT_Y = 2.60;
const INCIDENCE = (2 * Math.PI) / 180;
const WING_T = 0.10;
const WING_M = 0.045;
const WING_P = 0.35;

/* The tail, plan inches. */
const STAB_HALF = 7.75;
const STAB_LE_S = 24.875;
const STAB_TE_S = 30.75;
const STAB_SWEEP = 2.2;
const ELEV_HINGE_S = 29.37;
const STAB_Y = 0.19;
const STAB_T = 0.06;
const FIN_LE_S = 24.19;
const FIN_TOP = 4.85;
const FIN_TOP_S = 26.4;
const RUDDER_S = 27.4;
const FIN_T = 0.07;

/* The nose, plan inches but the engine and prop in real ones. */
const PROP_S = 0.0;
const PROP_R = R(3.5);
const THRUST_H = 0.0;

/* The gear: axle station and height, plan inches; the wheel real. */
const MAIN_S = 3.5;
const MAIN_H = -4.375;
const MAIN_TRACK = 6.5;
const MAIN_R = R(1.75 / 2);
const MAIN_W = R(0.45);
const SKID_ROOT_S = 27.6;
const SKID_TIP_S = 28.4;
const SKID_TIP_H = -1.5;
const SKID_WIRE = R(1 / 32);

/*
 * The fuselage off the plan's side and top views: station, half width,
 * top and bottom over the thrust line, and squareness. A balsa box with
 * a rounded cowl: the cowl's front round the crankcase, the firewall, the
 * windscreen's rake up to the wing's leading edge, the cabin under the
 * wing, then the turtledeck falling to the stabiliser's saddle.
 */
const FUSE = [
  [0.40, 0.80, 0.62, -0.40, 2.4],
  [1.00, 0.95, 0.85, -1.00, 2.8],
  [2.25, 1.02, 0.92, -1.55, 3.6],
  [2.45, 1.02, 0.94, -1.62, 3.6],
  [3.875, 1.02, 2.60, -2.00, 3.6],
  [6.60, 1.02, 2.505, -2.25, 3.6],
  [11.06, 1.00, 2.35, -2.08, 3.6],
  [13.10, 0.95, 1.79, -1.91, 3.4],
  [17.10, 0.80, 0.97, -1.60, 3.2],
  [21.00, 0.60, 0.45, -1.30, 3.0],
  [24.10, 0.42, 0.19, -1.04, 2.8],
  [STAB_TE_S, 0.17, 0.16, -0.56, 2.6],
];
function fuseAt(s) {
  const last = FUSE[FUSE.length - 1];
  const t = Math.min(Math.max(s, FUSE[0][0]), last[0]);
  for (let i = 0; i + 1 < FUSE.length; i += 1) {
    const a = FUSE[i];
    const b = FUSE[i + 1];
    if (t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      /* The windscreen and the deck are straight, the cowl eases. */
      const k = i < 2 ? u * u * (3 - 2 * u) : u;
      const lerp = (j) => a[j] + (b[j] - a[j]) * k;
      const top = lerp(2);
      const bottom = lerp(3);
      return { w: P(lerp(1)), h: P((top - bottom) / 2), yc: ht((top + bottom) / 2), e: lerp(4) };
    }
  }
  throw new Error(`bombshellcraft: station ${s} is off the fuselage`);
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
  return lite
    ? FUSE.map((f) => f[0])
    : [0.40, 0.60, 1.00, 1.60, 2.25, 2.45, 3.20, 3.875, 6.60, 11.06, 13.10, 15.10, 17.10, 21.00, 24.10,
      27.50, STAB_TE_S];
}

/* The NACA four digit thickness, half of it, and a flat bottomed camber. */
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

/*
 * The planform at |x| plan inches out: a constant chord, and outboard of
 * TIP_IN a round tip, its leading edge swept back on a quarter ellipse to
 * 70 percent of the chord at the tip and its trailing edge rounded up on
 * a smaller one, the way the plan's balsa tip block is cut.
 */
function chordLE(ax) {
  if (ax <= TIP_IN) {
    return { le: 0, te: CHORD_IN };
  }
  const u = Math.min(0.995, (ax - TIP_IN) / (HALF - TIP_IN));
  const f = Math.sqrt(1 - u * u);
  return { le: 0.62 * CHORD_IN * (1 - f), te: CHORD_IN - 0.30 * CHORD_IN * (1 - f) };
}
/* The flat bottom's height at the leading edge, |x| plan inches out,
 * through the two dihedral angles. */
function wingLift(ax) {
  if (ax <= BREAK) {
    return ROOT_Y + ax * Math.tan(DIH_IN);
  }
  return ROOT_Y + BREAK * Math.tan(DIH_IN) + (ax - BREAK) * Math.tan(DIH_OUT);
}
/* A point on the wing's skin: x plan inches out, t chord fraction, side
 * +1 over and -1 under. The section is laid on the local panel, so the
 * tips' sections tilt with them. */
function wingAt(x) {
  const ax = Math.abs(x);
  const { le, te } = chordLE(ax);
  const c = te - le;
  const y0 = wingLift(ax);
  const tilt = ax <= BREAK ? DIH_IN : DIH_OUT;
  return (t, side) => {
    const s = LE_S + le + t * c;
    const n = CHORD_IN * (camber(t) + side * naca(t, WING_T)) * (c / CHORD_IN) ** 0.5;
    const drop = (s - LE_S) * Math.tan(INCIDENCE);
    return new THREE.Vector3(
      P(x - Math.sign(x) * n * Math.sin(tilt)),
      ht(y0 - drop + n * Math.cos(tilt)),
      st(s),
    );
  };
}

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

/* cubcraft.js's loft: closed sections skinned and capped, faced outward
 * by the sign of the closed volume. */
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

/* The wing tip to tip, one loft, with a station either side of each break
 * so the joint is a crease and not a curve. */
function wingGeometry(lite) {
  const n = lite ? 8 : 12;
  const half = lite
    ? [0, BREAK, TIP_IN, 20.3, HALF]
    : [0, 6, BREAK - 0.02, BREAK + 0.02, 17, TIP_IN, 19.9, 20.5, 20.85, HALF];
  const xs = [...half.slice(1).reverse().map((x) => -x), ...half];
  return loft(xs.map((x) => section(wingAt(x), 0, 1, n)));
}

/* The rubber bands that hold the wing down, white over its centre from
 * the dowel ahead of the leading edge to the one behind the trailing
 * edge, as the photograph shows them. */
function bandGeometry(lite) {
  const parts = [];
  const seg = lite ? 3 : 4;
  for (const x of [-0.9, -0.3, 0.3, 0.9]) {
    const pts = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = i / 8;
      pts.push(wingAt(x)(t, 1).add(new THREE.Vector3(0, 0.0012, 0)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    parts.push(new THREE.TubeGeometry(curve, lite ? 8 : 12, 0.0011, seg, false));
  }
  return parts;
}

/* The stabiliser's planform at |x| plan inches: the leading edge swept
 * back to the tip, the trailing edge straight, the tip rounded over its
 * outer 1.6 in; the elevator from the hinge back. */
function stabPlan(ax) {
  const tipIn = STAB_HALF - 1.6;
  const leStraight = STAB_LE_S + STAB_SWEEP * Math.min(ax, tipIn) / tipIn;
  if (ax <= tipIn) {
    return { le: leStraight, hinge: ELEV_HINGE_S, te: STAB_TE_S };
  }
  const u = Math.min(0.995, (ax - tipIn) / (STAB_HALF - tipIn));
  const f = Math.sqrt(1 - u * u);
  const mid = (leStraight + STAB_TE_S) / 2;
  const le = mid - (mid - leStraight) * f;
  const te = mid + (STAB_TE_S - mid) * f;
  return { le, hinge: Math.min(Math.max(ELEV_HINGE_S, le + 0.05), te - 0.05), te };
}
function stabAt(x, le, c) {
  return (t, side) => new THREE.Vector3(P(x), ht(STAB_Y + 0.04) + side * P(c * naca(t, STAB_T)), st(le + t * c));
}
function stabGeometry(n, lite) {
  const half = lite ? [0, 6.15, 7.2, STAB_HALF - 0.01] : [0, 3, 6.15, 6.8, 7.3, 7.6, STAB_HALF - 0.01];
  const xs = [...half.slice(1).reverse().map((x) => -x), ...half];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.le, p.hinge - p.le), 0, 1, n);
  }));
}
function elevatorGeometry(n, lite) {
  const half = lite ? [0, 6.15, 7.0] : [0, 3, 6.15, 6.6, 7.0, 7.3];
  const xs = [...half.slice(1).reverse().map((x) => -x), ...half];
  return loft(xs.map((x) => {
    const p = stabPlan(Math.abs(x));
    return section(stabAt(x, p.hinge, Math.max(0.05, p.te - p.hinge)), 0, 1, n);
  }));
}

/*
 * The fin and rudder's outline at height h plan inches over the thrust
 * line: the fin's leading edge raked straight back from the deck, the top
 * a round arch over to the rudder, whose trailing edge curves down into
 * the fuselage's end.
 */
function tailOutline(h) {
  const base = 0.2;
  const u = Math.min(1, Math.max(0, (h - base) / (FIN_TOP - base)));
  const le = FIN_LE_S + (FIN_TOP_S - FIN_LE_S) * (u < 0.8 ? u / 0.8 * 0.75 : 0.75 + 0.25 * (1 - Math.sqrt(1 - ((u - 0.8) / 0.2) ** 2)));
  const te = RUDDER_S + (STAB_TE_S - RUDDER_S) * Math.sqrt(Math.max(0, 1 - u ** 1.6));
  return { le: Math.min(le, RUDDER_S - 0.15), hinge: RUDDER_S, te: Math.max(te, RUDDER_S + 0.15) };
}
function finAt(h, le, c) {
  return (t, side) => new THREE.Vector3(side * P(c * naca(t, FIN_T)), ht(h), st(le + t * c));
}
function finGeometry(n, lite) {
  const hs = lite ? [0.2, 2.0, 3.8, 4.6, FIN_TOP - 0.02] : [0.2, 1.2, 2.2, 3.2, 3.9, 4.3, 4.6, 4.78, FIN_TOP - 0.02];
  return loft(hs.map((h) => {
    const o = tailOutline(h);
    return section(finAt(h, o.le, o.hinge - o.le), 0, 1, n);
  }));
}
function rudderGeometry(n, lite) {
  const hs = lite ? [0.2, 2.0, 3.8, 4.6, FIN_TOP - 0.05] : [0.2, 1.2, 2.2, 3.2, 3.9, 4.3, 4.6, 4.75, FIN_TOP - 0.05];
  return loft(hs.map((h) => {
    const o = tailOutline(h);
    return section(finAt(h, o.hinge, o.te - o.hinge), 0, 1, n);
  }));
}

function fuseGeometry(lite) {
  const around = lite ? 16 : 24;
  return loft(fuseStations(lite).map((s) => {
    const ring = [];
    for (let i = 0; i < around; i += 1) {
      ring.push(fusePoint(s, (2 * Math.PI * i) / around));
    }
    return ring;
  }));
}

/* cubcraft.js's skin panels: the loft's straight skin between stations,
 * a hair proud of it, faced outward. */
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
  const pos = [];
  const idx = [];
  for (let i = 0; i <= ns; i += 1) {
    const s = s0 + ((s1 - s0) * i) / ns;
    const [a0, a1] = band(s);
    for (let j = 0; j <= na; j += 1) {
      const p = skinPoint(ss, s, a0 + ((a1 - a0) * j) / na, out);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = na + 1;
  for (let i = 0; i < ns; i += 1) {
    for (let j = 0; j < na; j += 1) {
      const a = i * row + j;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const v = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const mid = Math.floor(idx.length / 6) * 3;
  const [p0, p1, p2] = [v(idx[mid]), v(idx[mid + 1]), v(idx[mid + 2])];
  const nrm = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
  const c = fuseAt(p0.z / P(1) + CG_S);
  const outward = new THREE.Vector3(p0.x, p0.y - c.yc, 0);
  if (nrm.dot(outward) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
/* The fraction of the half height at s where a height h plan inches over
 * the thrust line falls, clipped inside the section. */
function sideV(s, h) {
  const { h: hh, yc } = fuseAt(s);
  return Math.min(0.97, Math.max(-0.97, (ht(h) - yc) / hh));
}

/*
 * The red swoop on each side, as the photograph has it: from a rounded
 * point low on the cowl behind the engine it sweeps up and back along the
 * cabin's lower half, under the windows, to a point under the wing's
 * trailing edge. Its edges are heights over the thrust line.
 */
function swoopEdges(s) {
  const a = (s - 1.4) / (12.0 - 1.4);
  const top = s < 2.8 ? -1.0 + 1.5 * Math.sqrt(Math.max(0, (s - 1.4) / 1.4)) : 0.55 - 0.35 * Math.max(0, (s - 8) / 4);
  const bottom = -1.55 - 0.45 * Math.min(1, Math.max(0, (s - 2.0) / 2.5)) + 1.9 * Math.max(0, a - 0.62) ** 1.4;
  return [top, Math.min(bottom, top - 0.05)];
}
function swoopGeometry(sign, lite) {
  return skinPanel(lite, 1.45, 12.0, lite ? 10 : 22, (s) => {
    const [top, bottom] = swoopEdges(s);
    return [fuseAngle(s, sideV(s, top), sign), fuseAngle(s, sideV(s, bottom), sign)];
  }, lite ? 3 : 5, 0.0009);
}

/* The glass: the windscreen over the cowl's top up to the wing, and on
 * each side the door window and the rear window, its back rounded, both
 * under the wing, as the plan draws them. */
function glassGeometry(lite) {
  const parts = [];
  const side = lite ? 2 : 4;
  parts.push(skinPanel(lite, 2.5, 3.84, side, (s) => {
    const v = sideV(s, 0.98 + (s - 2.45) * 0.55);
    return [fuseAngle(s, Math.max(0.25, v), -1), fuseAngle(s, Math.max(0.25, v), 1)];
  }, lite ? 8 : 14));
  for (const sign of [-1, 1]) {
    parts.push(skinPanel(lite, 4.3, 6.4, side, (s) => [fuseAngle(s, sideV(s, 2.25), sign), fuseAngle(s, sideV(s, 0.95), sign)], 3));
    parts.push(skinPanel(lite, 6.8, 8.9, side, (s) => {
      const round = Math.sqrt(Math.max(0, 1 - ((s - 7.4) / 1.5) ** 2));
      const mid = 1.6;
      const half = s < 7.4 ? 0.65 : 0.65 * round + 0.05;
      return [fuseAngle(s, sideV(s, mid + half), sign), fuseAngle(s, sideV(s, mid - half), sign)];
    }, 3));
  }
  return parts;
}

/* A round rod from a to b. */
function rod(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

/* A 7 x 3.5 blade drawn to this disc: a narrow glow prop's outline. */
function bladeGeometry(segments) {
  const r = PROP_R;
  const s = new THREE.Shape();
  s.moveTo(0.0030, 0.006);
  s.bezierCurveTo(0.0120, -0.010, 0.0110, -r * 0.45, 0.0045, -r * 0.97);
  s.lineTo(-0.0035, -r * 0.94);
  s.bezierCurveTo(-0.0100, -r * 0.40, -0.0070, -0.008, -0.0025, 0.006);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.0018, bevelEnabled: false, curveSegments: segments });
}

function merged(parts) {
  for (const g of parts) {
    if (g.getAttribute('uv')) {
      g.deleteAttribute('uv');
    }
  }
  const geo = mergeGeometries(parts, false);
  if (!geo) {
    throw new Error('bombshellcraft: merge failed');
  }
  return geo;
}

/*
 * The gear, and the attitude it sits the aircraft at. The main axles and
 * the skid's tip in the level craft frame; the attitude is the ground line
 * tangent under the wheels' circles through the skid's tip, solved as
 * cubcraft.js solves it with a skid of no radius.
 */
const MAIN_AXLE = [P(MAIN_TRACK / 2), ht(MAIN_H), st(MAIN_S)];
const SKID_TIP = [0, ht(SKID_TIP_H), st(SKID_TIP_S)];
function restPitch() {
  const dy = SKID_TIP[1] - MAIN_AXLE[1];
  const dz = SKID_TIP[2] - MAIN_AXLE[2];
  const f = (p) => Math.cos(p) * dy - Math.sin(p) * dz + MAIN_R;
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

/* How far the drawn machine reaches: the polyhedral tips' tops, which
 * stand higher than the fin, the wheels' bottoms,
 * the tips of the span, the prop's plane and the fuselage's end. */
const WING_TOP = Math.max(...[19.9, 20.5, 20.85, HALF].flatMap((x) => section(wingAt(x), 0, 1, 12).map((v) => v.y)));
const UP = Math.max(ht(FIN_TOP), WING_TOP);
const DOWN = -(MAIN_AXLE[1] - MAIN_R);
/* The elevator's trailing edge at its loft's stations, since its tips are
 * round and the corner of its plan is not drawn. */
const REACH = Math.max(P(HALF), st(STAB_TE_S), ...[3, 6.15, 6.6, 7.0, 7.3].map((x) => Math.hypot(P(x), st(stabPlan(x).te))));
export const BOMBSHELL_DIMS = {
  span: 2 * P(HALF),
  chord: P(CHORD_IN),
  dihedralDeg: [5, 23],
  stabSpan: 2 * P(STAB_HALF),
  finHeight: P(FIN_TOP),
  gearTrack: P(MAIN_TRACK),
  propR: PROP_R,
  thrustY: ht(THRUST_H),
  noseZ: st(PROP_S) - 0.004,
  tailZ: st(STAB_TE_S),
  length: P(STAB_TE_S - PROP_S),
  reach: REACH,
  vHalfUp: UP,
  vHalfDown: DOWN,
  /* Where the wing's panels are, for the part table: the polyhedral
   * joint's span and height, the tips'. Body frame is x forward, so these
   * stay in the craft frame and plant.c converts them. */
  wing: {
    le: st(LE_S), te: st(LE_S + CHORD_IN), half: P(HALF), breakX: P(BREAK),
    rootY: ht(ROOT_Y), breakY: ht(wingLift(BREAK)), tipY: ht(wingLift(HALF)),
  },
  wheels: {
    mainLeft: { axle: [-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], r: MAIN_R, width: MAIN_W },
    mainRight: { axle: [...MAIN_AXLE], r: MAIN_R, width: MAIN_W },
    tail: { axle: [...SKID_TIP], r: 0, width: 0 },
  },
  contact: {
    mainLeft: [-MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    mainRight: [MAIN_AXLE[0], MAIN_AXLE[1] - MAIN_R, MAIN_AXLE[2]],
    tail: [...SKID_TIP],
  },
  rest: {
    pitch: REST_PITCH,
    pitchDeg: (REST_PITCH * 180) / Math.PI,
    cgHeight: REST_CG_HEIGHT,
    contact: {
      mainLeft: restContact([-MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]], MAIN_R),
      mainRight: restContact(MAIN_AXLE, MAIN_R),
      tail: [...SKID_TIP],
    },
  },
  dims: {
    arm: 0,
    propR: PROP_R,
    hullR: REACH,
    vHalfDown: DOWN,
    vHalfUp: UP,
    bodyLength: P(STAB_TE_S - PROP_S),
    bodyWidth: 2 * P(HALF),
    bodyHeight: UP + DOWN,
  },
};

/*
 * The camera mount: an FPV camera on the cowl's top just ahead of the
 * windscreen, behind the engine's cylinder, looking over it through the
 * prop.
 */
const CAM_S = 2.05;
export const BOMBSHELL_MOUNT_FORWARD = -st(CAM_S);
export const BOMBSHELL_MOUNT_UP = fuseAt(CAM_S).yc + fuseAt(CAM_S).h + 0.012;

/* A glow engine turns counter clockwise seen from the front, which is
 * clockwise from behind: cubcraft.js's sense. */
export const BOMBSHELL_PROP_SPIN = [1, 0, 0, 0];

export function buildBombshellCraft(opts = {}) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const inkOn = !lite;
  const shade = !lite;
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const group = new THREE.Group();
  group.name = opts.name ?? 'bombshell-craft';
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

  /* Doped tissue: a deep red, a little translucent in life, and black. */
  const red = cel({ color: 0xc8161a, rim: 0.28, spec: 0.22, specWidth: 0.014 });
  const redSurf = cel({ color: 0xa81216, rim: 0.28, spec: 0.20, specWidth: 0.014 });
  const black = cel({ color: 0x17171a, rim: 0.30, spec: 0.40, specWidth: 0.016, specColor: 0xd8e0e8 });
  const blackSurf = cel({ color: 0x232327, rim: 0.30, spec: 0.36, specWidth: 0.016, specColor: 0xd8e0e8 });
  const metal = cel({ color: 0xc2c6ca, rim: 0.30, spec: 0.75, specWidth: 0.022 });
  const band = cel({ color: 0xfaf8f2, rim: 0.30, spec: 0.20 });
  const hub = cel({ color: 0xd6d4cc, rim: 0.28, spec: 0.35 });
  const glass = cel({ color: 0x3a5064, rim: 0.40, spec: 0.60, specWidth: 0.020, specColor: 0xf3ead4 });
  const stator = cel({ color: 0x1c1c1e, rim: 0.24, spec: 0.30 });
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
  const propMat = cel({ color: 0x1e1e20, rim: 0.26, spec: 0.30 });
  const antenna = cel({ color: 0x1a241c, rim: 0.22 });
  const ink = 0x0c0c0e;

  if (opts.measure) {
    const d = BOMBSHELL_DIMS;
    const body = new THREE.Mesh(new THREE.BoxGeometry(d.span, d.vHalfUp + d.vHalfDown, d.length), black);
    body.position.set(0, (d.vHalfUp - d.vHalfDown) / 2, (d.tailZ + d.noseZ) / 2);
    body.visible = false;
    body.castShadow = false;
    group.add(body);
  }

  /* The fuselage, black, centred on its own middle for the outline. */
  {
    const geo = fuseGeometry(lite);
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    const fuse = new THREE.Mesh(geo, black);
    fuse.position.copy(c);
    fuse.name = 'bombshell-fuselage';
    fuse.castShadow = shade;
    hull(fuse, 1.02, ink);
    group.add(fuse);
  }

  /* Red tissue, one draw: the wing, the stabiliser and the swoops. */
  {
    const n = lite ? 5 : 7;
    const parts = [wingGeometry(lite), stabGeometry(n, lite), swoopGeometry(1, lite), swoopGeometry(-1, lite)];
    const redMesh = new THREE.Mesh(merged(parts), red);
    redMesh.name = 'bombshell-red';
    redMesh.castShadow = shade;
    group.add(redMesh);
  }

  /* Black, one draw: the fin, the tyres and the prop driver's washer. */
  {
    const n = lite ? 5 : 7;
    const parts = [finGeometry(n, lite)];
    for (const sign of [-1, 1]) {
      const tyre = new THREE.TorusGeometry(MAIN_R - 0.0055, 0.0055, lite ? 5 : 6, lite ? 16 : 20);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(sign * MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]);
      parts.push(tyre);
    }
    const blackMesh = new THREE.Mesh(merged(parts), black);
    blackMesh.name = 'bombshell-black';
    blackMesh.castShadow = shade;
    group.add(blackMesh);
  }

  /* The wire, one draw: the gear's legs, a V each side from the floor to
   * the axle, and the axles. */
  {
    const parts = [];
    const r = R(1 / 32);
    for (const sign of [-1, 1]) {
      const axle = new THREE.Vector3(sign * (MAIN_AXLE[0] - MAIN_W / 2 - 0.001), MAIN_AXLE[1], MAIN_AXLE[2]);
      const floorY = (s) => fuseAt(s).yc - fuseAt(s).h + 0.001;
      parts.push(rod(new THREE.Vector3(sign * P(0.7), floorY(4.2), st(4.2)), axle, r, rodSeg));
      parts.push(rod(new THREE.Vector3(sign * P(0.7), floorY(6.4), st(6.4)), axle, r, rodSeg));
      parts.push(rod(axle, new THREE.Vector3(sign * (MAIN_AXLE[0] + MAIN_W / 2 + 0.002), MAIN_AXLE[1], MAIN_AXLE[2]), r, rodSeg));
    }
    const wire = new THREE.Mesh(merged(parts), metal);
    wire.name = 'bombshell-wire';
    wire.castShadow = shade;
    group.add(wire);
  }

  /* The tail skid, its own mesh so its tip can be measured. */
  {
    const root = new THREE.Vector3(0, fuseAt(SKID_ROOT_S).yc - fuseAt(SKID_ROOT_S).h + 0.001, st(SKID_ROOT_S));
    const tip = new THREE.Vector3(...SKID_TIP).add(new THREE.Vector3(0, SKID_WIRE, 0));
    const skid = new THREE.Mesh(merged([
      rod(root, tip, SKID_WIRE, rodSeg),
      new THREE.SphereGeometry(SKID_WIRE, rodSeg, 4).translate(tip.x, tip.y, tip.z),
    ]), metal);
    skid.name = 'tail-skid';
    skid.castShadow = shade;
    group.add(skid);
  }

  /* The hubs, the rubber bands. */
  {
    const parts = [];
    for (const sign of [-1, 1]) {
      const h = new THREE.CylinderGeometry(MAIN_R - 0.009, MAIN_R - 0.009, MAIN_W * 0.8, seg);
      h.rotateZ(Math.PI / 2);
      h.translate(sign * MAIN_AXLE[0], MAIN_AXLE[1], MAIN_AXLE[2]);
      parts.push(h);
    }
    const hubMesh = new THREE.Mesh(merged(parts), hub);
    hubMesh.name = 'bombshell-hubs';
    group.add(hubMesh);
    const bands = new THREE.Mesh(merged(bandGeometry(lite)), band);
    bands.name = 'bombshell-bands';
    group.add(bands);
  }

  /* The glass. */
  {
    const glassMesh = new THREE.Mesh(merged(glassGeometry(lite)), glass);
    glassMesh.name = 'bombshell-glass';
    group.add(glassMesh);
  }

  /*
   * The engine, a Cox Texaco .049 at life size off Cox's drawing: the
   * black crankcase inside the cowl's front, the finned cylinder standing
   * 42 mm over the shaft with its five fins bright aluminium, the glow
   * head on top, the needle valve out of the back. The crankcase shows
   * through the cowl's mouth; the cylinder stands out of its top.
   */
  {
    const metalParts = [];
    const blackParts = [];
    const cylS = st(0.95);
    const up = (h) => ht(THRUST_H) + h;
    const barrel = new THREE.CylinderGeometry(0.0072, 0.0072, 0.030, seg);
    barrel.translate(0, up(0.020), cylS);
    blackParts.push(barrel);
    const fins = lite ? 3 : 5;
    for (let i = 0; i < fins; i += 1) {
      const f = new THREE.CylinderGeometry(0.0099, 0.0099, 0.0014, seg);
      f.translate(0, up(0.029 + (i * 0.010) / fins), cylS);
      metalParts.push(f);
    }
    const head = new THREE.CylinderGeometry(0.0062, 0.0075, 0.005, seg);
    head.translate(0, up(0.0415), cylS);
    metalParts.push(head);
    const plug = new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, 6);
    plug.translate(0, up(0.046), cylS);
    metalParts.push(plug);
    const crank = new THREE.CylinderGeometry(0.0099, 0.0099, 0.020, seg);
    crank.rotateX(Math.PI / 2);
    crank.translate(0, up(0), st(0.45));
    blackParts.push(crank);
    const needle = rod(new THREE.Vector3(P(0.2), up(0.006), st(1.6)), new THREE.Vector3(P(0.2), up(0.024), st(1.6)), 0.0009, 5);
    metalParts.push(needle);
    const engMetal = new THREE.Mesh(merged(metalParts), metal);
    engMetal.name = 'bombshell-engine-fins';
    engMetal.castShadow = shade;
    group.add(engMetal);
    const engBlack = new THREE.Mesh(merged(blackParts), stator);
    engBlack.name = 'bombshell-engine';
    engBlack.castShadow = shade;
    group.add(engBlack);
  }

  /*
   * BMJR's name in red on each side of the fin, as the kit's photograph
   * has it: a canvas drawn once, on a plane a hair off the fin's skin,
   * unlit like the lamps. Where there is no canvas, a worker or a test
   * without a document, the fin goes without it.
   */
  if (typeof document !== 'undefined' && !lite) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const g2 = canvas.getContext('2d');
    g2.fillStyle = '#d0141c';
    g2.font = 'italic bold 92px sans-serif';
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillText('BMJR', 128, 68);
    const tex = new THREE.CanvasTexture(canvas);
    const decalMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog });
    const h = 3.0;
    const o = tailOutline(h);
    const w = P(o.te - o.le) * 0.78;
    for (const sign of [-1, 1]) {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), decalMat);
      decal.rotation.y = sign * Math.PI / 2;
      const thick = P((RUDDER_S - o.le) * naca(0.3, FIN_T)) + 0.0008;
      decal.position.set(sign * thick, ht(h), st((o.le + o.te) / 2));
      decal.name = 'fin-name';
      decal.renderOrder = 2;
      group.add(decal);
    }
  }

  /* The moving surfaces: the elevator, red, one piece across the fuselage
   * as the plan builds it; the rudder, black. */
  const n = lite ? 4 : 5;
  const hinged = (geo, a, b, material) => {
    const axis = new THREE.Vector3().subVectors(b, a).normalize();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    geo.translate(-mid.x, -mid.y, -mid.z);
    const pivot = new THREE.Group();
    pivot.position.copy(mid);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shade;
    pivot.add(mesh);
    return { pivot, axis, mesh };
  };
  const eh = (x) => new THREE.Vector3(P(x), ht(STAB_Y + 0.04), st(ELEV_HINGE_S));
  const elevator = hinged(elevatorGeometry(n, lite), eh(-STAB_HALF), eh(STAB_HALF), redSurf);
  const rudder = hinged(rudderGeometry(n, lite),
    new THREE.Vector3(0, ht(0.2), st(RUDDER_S)),
    new THREE.Vector3(0, ht(FIN_TOP), st(RUDDER_S)),
    blackSurf);
  const surfaces = { elevator, rudder };
  for (const [name, s] of Object.entries(surfaces)) {
    s.pivot.name = name;
    group.add(s.pivot);
  }

  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, BOMBSHELL_MOUNT_UP, -BOMBSHELL_MOUNT_FORWARD);
  cameraMount.name = 'bombshell-camera-mount';
  group.add(cameraMount);
  {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.019, 0.019), camBody);
    housing.position.set(0, 0, 0.006);
    housing.castShadow = shade;
    hull(housing, 1.08, ink);
    cameraMount.add(housing);
    const barrelC = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0084, 0.012, lite ? 8 : 14), camBody);
    barrelC.rotation.x = Math.PI / 2;
    barrelC.position.set(0, 0, -0.010);
    cameraMount.add(barrelC);
    const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(0.0070, lite ? 10 : 18), lens);
    glassDisc.rotation.y = Math.PI;
    glassDisc.position.set(0, 0, -0.0162);
    cameraMount.add(glassDisc);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0076, 0.0013, lite ? 4 : 6, lite ? 10 : 14), ring);
    bezel.position.set(0, 0, -0.0156);
    cameraMount.add(bezel);
  }

  /* The video antenna, a whip off the deck behind the wing. Named: it is
   * wire, not aircraft, and scripts/craft-check.js leaves it out. */
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.070, lite ? 5 : 8), antenna);
    const s = 13.5;
    mast.position.set(0, fuseAt(s).yc + fuseAt(s).h + 0.032, st(s) + 0.010);
    mast.rotation.x = 0.35;
    mast.name = 'antenna';
    group.add(mast);
  }

  /*
   * The prop on the engine's driver, with the Cox spinner nut. The mount
   * turns the rotor's y onto the craft's forward axis, as cubcraft.js
   * does, so rotor.rotation.y is the spin the shell drives.
   */
  const discs = [];
  const blades = [];
  const leds = [];
  {
    const propMount = new THREE.Group();
    propMount.position.set(0, ht(THRUST_H), st(PROP_S));
    propMount.rotation.x = -Math.PI / 2;
    group.add(propMount);
    const prof = [];
    const m = lite ? 3 : 5;
    const nutR = 0.0055;
    const back = -0.010;
    prof.push(new THREE.Vector2(0.0001, back));
    for (let i = 0; i <= m; i += 1) {
      const u = i / m;
      prof.push(new THREE.Vector2(Math.max(0.0004, nutR * (1 - u * u * 0.9)), back + 0.002 + 0.012 * u));
    }
    const nut = new THREE.Mesh(new THREE.LatheGeometry(prof, lite ? 8 : 12), metal);
    nut.name = 'spinner';
    nut.castShadow = shade;
    propMount.add(nut);

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
      new THREE.MeshBasicMaterial({ color: 0x3a3a3c, transparent: true, opacity: 0.12, depthWrite: false, fog }),
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

  /* Four lamps on the four slots, skycraft.js's arrangement: sakura on
   * the left tip and the cowl, mint on the right tip and the deck. */
  const lampAt = [
    { p: wingAt(-20.2)(0.5, 1), front: true },
    { p: wingAt(20.2)(0.5, 1), front: false },
    { p: fusePoint(1.2, 0), front: true },
    { p: fusePoint(20.0, 0), front: false },
  ];
  for (const at of lampAt) {
    const base = at.front ? 0xe8a8b8 : 0x7dffb4;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.0035, 0.011), ledMat);
    led.position.copy(at.p);
    led.position.y += 0.001;
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }

  /* Radians: left aileron, right aileron, elevator, rudder; the first two
   * are the ailerons the Bombshell has not got. Each hinge axis points +x
   * or +y, so each turns by the negated angle (cubcraft.js). */
  const q = new THREE.Quaternion();
  function setSurfaces(leftRad, rightRad, elevRad = 0, rudRad = 0) {
    elevator.pivot.quaternion.copy(q.setFromAxisAngle(elevator.axis, -elevRad));
    rudder.pivot.quaternion.copy(q.setFromAxisAngle(rudder.axis, -rudRad));
  }
  setSurfaces(0, 0, 0, 0);

  return {
    group,
    discs,
    blades,
    leds,
    cameraMount,
    stator,
    propSpin: BOMBSHELL_PROP_SPIN,
    setSurfaces,
  };
}
