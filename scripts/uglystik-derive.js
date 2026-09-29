/*
 * uglystik-derive.js: the arithmetic behind docs/UGLYSTIK-STAGE1.md, from
 * Phil Kraft's Das Ugly Stik as RCM published it in May and June 1985
 * (RCM plan 939, Jim Jensen's kit of it: the article's data table, its
 * control surface travel limits and the full size plan, measured), O.S.'s
 * figures for the MAX-61FX, an owner's measured rpm on it and APC's
 * propeller data, to every coefficient and every derived band. It never
 * loads the plant: this is what the plant is checked against, so it has to
 * stand apart from it. Harness arithmetic in JS maths, which is allowed
 * here because nothing it prints is hashed. It follows kadet-derive.js
 * where the two are alike (a glow engine on a tricycle gear, the throttle
 * to an idle) and edge-derive.js where they are (four channels, ailerons,
 * a section near enough symmetric to fly on its back). Run with
 * npm run uglystik:derive.
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

const DEG = 180 / Math.PI;
const rho = 1.225;
const g = 9.81;
const R = (inches) => inches * 0.0254;
const SQIN = R(1) * R(1);

/*
 * THE PLAN, measured. RCM plan 939 is drawn full size (its scale bar reads
 * 71.7 points to the inch on a 72 point page), so these are inches off the
 * plan. Stations are inches aft of the prop's plane, which is 4.25 in
 * ahead of the firewall's face (O.S.'s drawing of the 61FX: 66.5 mm from
 * the drive washer to the lugs' face, 29.1 mm of lugs, the backplate and a
 * gap to the firewall, ESTIMATED). Heights are the plan's, inches DOWN the
 * sheet, where the fuselage's flat bottom is at 22.08.
 *
 *   wing      12.48 in from the 3/8 in leading edge to the hinge line,
 *             constant; 56.0 in across the leading edge and 61.1 at the
 *             hinge line, the tips raked; strip ailerons of 1/4 in sheet
 *             behind the hinge, scalloped, 1.29 in at the scallops' points
 *             and 1.10 in their hollows, from 5.7 in out to the tip,
 *             which is 61.7 in across; the leading edge at station 11.31
 *   section   "Semi-Symmetrical" (the article's table), and the plan's own
 *             ribs are within a percent of camber of symmetric: 1.95 in
 *             thick, 15.6 percent; the chord 0.5 deg nose up to the
 *             fuselage's flat bottom, which is the thrust line's direction
 *             ("No thrust offsets are used")
 *   dihedral  "the distance under the Ugly Stik wing tip rib is 3 in when
 *             the opposite tip is flat": 1.5 in a side at the tip rib, 28.0
 *             in out
 *   CG        the plan's C.G. mark, 4.69 in behind the leading edge,
 *             station 16.00, "approximately on the main spar" (Kraft)
 *   heights   the wing's chord line at 17.95 (the fuselage's top: the
 *             article's "Shoulder" wing, its lower half inside the box);
 *             the thrust line at 20.17 (1.79 in over F1's foot, the F1
 *             detail); the CG at 20.00, ESTIMATED from the masses below
 *   stab      at the fuselage's bottom ("Bottom Of Fuselage"), flat, 5.79
 *             in to the hinge and a scalloped 1/4 in elevator, 1.67 in at
 *             its points; 19.2 in across its leading edge and 22.3 over the
 *             elevator's tips; its leading edge at station 41.52
 *   fin       the rounded "egg", 8.2 in over the fuselage's top at the
 *             rudder's hinge and 11.6 in long (the table's 8 in and 11 1/2
 *             in), the rudder hinged at station 46.86 and 3.96 in deep at
 *             its widest; a 3/16 in sub fin under the tail
 *   gear      a tricycle ("Tricycle"): a Goldberg 5/32 in nose leg to a
 *             2 3/4 in Du-Bro wheel, its axle at station 5.20 and height
 *             26.32; a dural strap (Great Planes L-4) to 3 1/2 in Du-Bro
 *             wheels, the axles at station 17.00 and height 26.25, 14.5 in
 *             between the strap's feet and 16.1 in between the wheels
 */
const wingLE = 11.31, chordW = 12.48, ailC = 1.2, ailIn = 5.7;
const halfLE = 28.0, halfHinge = 30.57, halfTip = 30.87;
const xCGst = 16.00;
const incidence = 0.5 / DEG;
const zChord = 17.95, zTL = 20.17, zCG = 20.00, zBottom = 22.08;
const stabLE = 41.52, stabC = 5.79, elevC = 1.67;
const stabHalfLE = 9.58, stabHalfHinge = 10.9, stabHalfTip = 11.15;
const rudderHinge = 46.86, rudderC = 3.96;
const gammaTipRise = 1.5, gammaAt = 28.0;

/* Area: the wing to its hinge line, a rectangle whose raked tips are
 * trapezoids, and the ailerons behind it at their mean chord. */
const Swing = chordW * (halfLE + halfHinge);
const Sail = 2 * (halfTip - ailIn) * ailC;
const S = (Swing + Sail) * SQIN;
const b = R(2 * halfTip);
const c = S / b, AR = b * b / S;
const cMac = chordW + ailC;                       /* the chord with its aileron, in */
/*
 * The weight: "Wt. Ready To Fly 96 Oz." (RCM's table), taken with the
 * 12 oz tank full, as the Kadet's is.
 */
const m = 96 * 0.028349523125, W = m * g;
/*
 * A 16 percent section near enough symmetric: its CL max at 2.3e5 (10 m/s
 * on its 0.33 m chord) about that of the NACA 0015, 1.05 (Sheldahl and
 * Klimas, SAND80-2114, at 3.6e5, less for the lower Reynolds number), the
 * wing's 0.9 of it; CD0 for an open side mounted engine and silencer, a
 * slab sided box, strip ailerons with open gaps, a dural strap and wire
 * gear on 3 1/2 in wheels; e for a rectangular wing on a square body.
 * ESTIMATED.
 */
const CLmax = 0.95, CD0 = 0.045, e = 0.75, k = 1 / (Math.PI * e * AR);
const alphaZLwing = 0;
const gamma = Math.atan(gammaTipRise / gammaAt), taper = 1.0;
const cosFactor = Math.cos(gamma) ** 2;
const xAcWing = R(wingLE + 0.25 * cMac);
const xCG = R(xCGst);

/* The stabiliser and elevator. */
const Sh = ((stabHalfLE + stabHalfHinge) * stabC + 2 * stabHalfTip * elevC * 0.95) * SQIN;
const bh = R(2 * stabHalfTip);
const xAcTail = R(stabLE + 0.25 * (stabC + elevC));
/*
 * The fin and rudder, off the plan's side view: the egg over the fuselage
 * 71 sq in, 0.80 of its 11.6 by 7.7 in box; the rudder 26 of it, 0.80 of
 * its 3.96 by 8.2; the sub fin's triangle, 6.4 by 1.5 in, 4.8. Their
 * centroid at station 45.0, 2.6 in over the CG.
 */
const SvEgg = 0.80 * 11.6 * 7.7, SvRud = 0.80 * rudderC * 8.2, SvSub = 0.5 * 6.4 * 1.5;
const Sv = (SvEgg + SvSub) * SQIN;
const xAcFin = R(45.0), zv = R(2.6);
const eta = 0.9;
/*
 * Surface effectiveness from each one's share of its surface's chord
 * (Nelson fig. 2.21, as the Kadet's and the Edge's read it): the elevator
 * 1.67 of 7.46 in, 22 percent; the rudder 26 of 71 sq in, 37 percent; the
 * strip ailerons 1.2 of 13.68 in, 9 percent, and their open hinge gap.
 */
const tauE = 0.45, tauR = 0.56, tauA = 0.22;
/* The fin's own aspect ratio, its 8.2 in over 71 sq in, raised half again
 * by the fuselage under it. */
const arV = 1.5 * (8.2 * 8.2 / SvEgg);
/*
 * RCM's "Control Surface Travel Limits (measured at trailing edge, limit
 * of control surface)": elevator 3/8 in up and 3/8 down, rudder 1 in left
 * and right, ailerons 5/16 in up and 1/4 down (the Williams Bros 60 deg
 * bellcranks' differential), on the chords at their widest: the
 * elevator's 1.67 in, the rudder's 3.96, the ailerons' 1.29.
 */
const throwE = Math.asin(0.375 / elevC);
const throwR = Math.asin(1.0 / rudderC);
const throwAup = Math.asin(0.3125 / 1.29), throwAdown = Math.asin(0.25 / 1.29);
const throwA = (throwAup + throwAdown) / 2;
const expo = 0.30;
const muGrass = 0.08;

/*
 * THE ENGINE. An O.S. MAX-61FX (9.95 cc, "1.9 ps / 1.93 hp / 16,000
 * r.p.m.", 2,000 to 17,000 rpm, 550 g, O.S.'s manual), inside RCM's
 * ".40-.61" and Kraft's ".56 to .60", on the 12 x 6 O.S. list first for
 * it. An owner's tachometer: a 61FX on the stock silencer "turned APC
 * 12.25-3.75 at 13100 rpm max peaked out" (RC Universe, "O.S. .61 FX
 * Engines"); APC's data for that prop there is 0.612 N m. The engine's
 * torque taken flat below its power peak (ESTIMATED), the 12 x 6 absorbs
 * it at 10,895 rpm, where APC's data give 36.21 N standing
 * (scripts/power-derive.js).
 */
const rpmLoaded = 10895, pitchIn = 6, propR = R(6);
const Ts = 36.206;
const shaftTorque = 0.6119;
const idle = 2000 / rpmLoaded;                     /* O.S.'s lowest practical rpm */
const zThrust = zCG - zTL;                          /* inches, the line under the CG is negative */
const thrustZ = R(zThrust);

/*
 * MASS AND INERTIA, ESTIMATED from the parts: the engine, its silencer,
 * the prop and the spinner 0.62 kg at station 2.8 (its mass centre 0.6 in
 * over the crankshaft, the cylinder out at 45 deg); the 12 oz tank full,
 * 0.36 kg at station 8; the dural strap and its wheels 0.19 kg at station
 * 17, the nose leg and wheel 0.055 kg at 5.2; the wing 0.55 kg along its
 * span; the radio, four servos, the receiver and its pack, 0.32 kg on the
 * servo tray at station 18; the tail group 0.15 kg at station 45.5; and
 * the fuselage the rest, its box along 43 in, its mass centre where the
 * CG comes out at the plan's mark. That puts it at station 28.5, further
 * aft than a box's own centre: what the kit's balance leaves the fuselage
 * to carry is the builder's tail weight, which is how a .61 on a Stik's
 * short nose balances on the main spar.
 */
const parts = [
  { m: 0.62, s: 2.8, z: 19.6, r: [0.03, 0.04, 0.04] },
  { m: 0.36, s: 8.0, z: 20.2, r: [0.03, 0.08, 0.08] },
  { m: 0.19, s: 17.0, z: 25.4, r: [0.17, 0.02, 0.17] },
  { m: 0.055, s: 5.2, z: 24.2, r: [0.01, 0.03, 0.02] },
  { m: 0.55, s: wingLE + 0.40 * cMac, z: zChord, r: [b / Math.sqrt(12), R(cMac) / Math.sqrt(12), b / Math.sqrt(12)] },
  { m: 0.32, s: 18.0, z: 20.8, r: [0.03, 0.05, 0.05] },
  { m: 0.15, s: 45.5, z: 20.3, r: [0.12, 0.05, 0.12] },
];
const fuseM = m - parts.reduce((a, p) => a + p.m, 0);
const fuseS = (xCGst * m - parts.reduce((a, p) => a + p.m * p.s, 0)) / fuseM;
parts.push({ m: fuseM, s: fuseS, z: 20.2, r: [0.03, R(43) / Math.sqrt(12), R(43) / Math.sqrt(12)] });
const zCGmass = parts.reduce((a, p) => a + p.m * p.z, 0) / m;
const inertia = [0, 0, 0];
for (const p of parts) {
  const dx = R(p.s - xCGst), dz = R(p.z - zCG);
  inertia[0] += p.m * (dz * dz + p.r[0] * p.r[0]);
  inertia[1] += p.m * (dx * dx + dz * dz + p.r[1] * p.r[1]);
  inertia[2] += p.m * (dx * dx + p.r[2] * p.r[2]);
}
const [Ixx, Iyy, Izz] = inertia;

const lh = xAcTail - xAcWing;
const lv = xAcFin - xCG;

/* The coefficients, in the plant's reference chord S/b. */
const aw = cosFactor * 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
/* DATCOM's downwash gradient: the stabiliser at the fuselage's bottom,
 * 4.1 in under the wing's chord plane. */
const KA = 1 / AR - 1 / (1 + Math.pow(AR, 1.7));
const KL = (10 - 3 * taper) / 7;
const hH = R(22.06 - zChord);
const KH = (1 - hH / b) / Math.cbrt(2 * lh / b);
const deda = 4.44 * Math.pow(KA * KL * KH, 1.19);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const xNP = xAcWing + c * VH * eta * (at / aw) * (1 - deda);
const hn = (xNP - xAcWing) / c;
const SM = (xNP - xCG) / c;
const Cma = -CLa * SM;
/* The zero lift line: the section's zero at the wing's 0.5 deg of
 * incidence, the stabiliser's at none, the tail's share. */
const a0w = alphaZLwing - incidence;
const tailK = at * (Sh / S) * eta;
const alphaZL = (aw * a0w + tailK * (-deda * a0w)) / (aw + tailK * (1 - deda));
const Cmq = -2 * eta * at * VH * lh / c;
const Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
/* The slab sided box's weathercock term, Nelson eq. 2.64 with DATCOM's
 * K_N 0.0012 per deg, on 0.10 m^2 of side area over 50 in. */
const SBs = 0.10, lf = R(50);
const CnbFus = -0.0012 * DEG * 1.0 * (SBs / S) * (lf / b);
const CYb = -av * Sv / S;
const Cnb = av * VV + CnbFus;
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/* The shoulder wing's own roll with sideslip, DATCOM's wing height term,
 * the chord plane 2.1 in over the box's centre line, d its mean depth. */
const zw = R((zBottom + zChord) / 2 - zChord), dFus = R(Math.sqrt(4.0 * 4.1));
const ClbHigh = -1.2 * Math.sqrt(AR) * (zw / b) * (2 * dFus / b);
const ClbDihedral = -aw * gamma * (1 + 2 * taper) / (6 * (1 + taper));
const ClbFin = -av * (Sv / S) * (zv / b);
const Clb = ClbDihedral + ClbFin + ClbHigh;
const Clp = -aw * (1 + 3 * taper) / (12 * (1 + taper));
/* The strip ailerons from 5.7 in to the tip, on the full chord's lift
 * slope over the plant's reference chord: Nelson eq. 5.46. */
const y1 = ailIn / halfTip, y2 = 1.0;
const ClDa = aw * tauA * (cMac / (c / 0.0254)) * (y2 * y2 - y1 * y1) / 4;
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
/* The bellcranks' differential takes most of the adverse yaw: the Cub's
 * -0.12 per CL halved. */
const ClrPerCL = 0.25, CnpPerCL = -0.125, CndaPerCL = -0.06;

/* The engine, the Kadet's law: the throttle runs the rpm from the idle to
 * full, linearly, and the thrust falls with airspeed to nothing at the
 * pitch speed times that. */
const rpmNL = rpmLoaded / 0.85;
const Vp = rpmNL / 60 * pitchIn * 0.0254 * 0.85;
const omegaLoaded = rpmLoaded * 2 * Math.PI / 60;
const dutyOf = (stick) => idle + (1 - idle) * stick;
const T = (V, stick) => { const d = dutyOf(stick); return Math.max(0, Ts * d * d * (1 - V / (Vp * d))); };
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 4, hi = 40;
  if (T(lo, d) < D(lo) && T(8, d) < D(8)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
let best = { vz: -1, V: 0 };
for (let V = 1.15 * Vs; V < 26; V += 0.02) { const vz = (T(V, 1) - D(V)) * V / W; if (vz > best.vz) best = { vz, V }; }
const discP = Math.pow(Ts, 1.5) / Math.sqrt(2 * rho * Math.PI * propR * propR);
/* Straight up: the speed where the thrust holds the weight and the drag
 * at no lift. */
const vertical = (() => {
  let lo = 0, hi = Vp;
  if (T(0, 1) < W) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, 1) > W + 0.5 * rho * mid * mid * S * CD0) lo = mid; else hi = mid; }
  return lo;
})();

/* The stick for a surface angle through the expo. */
function stickFor(delta, travel) {
  const want = delta / travel;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (expo * mid * mid * mid + (1 - expo) * mid < want) lo = mid; else hi = mid; }
  return lo;
}

/* Roots of a real polynomial, highest power first, by Durand Kerner. */
function roots(coef) {
  const n = coef.length - 1;
  const a = coef.map((v) => v / coef[0]);
  const cm = (x, y) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
  const cs = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });
  const cd = (x, y) => { const d = y.re * y.re + y.im * y.im; return { re: (x.re * y.re + x.im * y.im) / d, im: (x.im * y.re - x.re * y.im) / d }; };
  const pe = (z) => a.reduce((acc, cf) => { const t = cm(acc, z); return { re: t.re + cf, im: t.im }; }, { re: 0, im: 0 });
  let r = Array.from({ length: n }, (_, i) => ({ re: Math.cos(i * 1.3 + 0.4), im: Math.sin(i * 1.3 + 0.4) }));
  for (let it = 0; it < 800; it += 1) {
    r = r.map((z, i) => { let den = { re: 1, im: 0 }; r.forEach((w, j) => { if (j !== i) den = cm(den, cs(z, w)); }); return cs(z, cd(pe(z), den)); });
  }
  return r;
}
/* The characteristic polynomial of a square matrix, Faddeev LeVerrier. */
function charPoly(A) {
  const n = A.length;
  const mul = (X, Y) => X.map((row, i) => Y[0].map((_, j) => row.reduce((s, _v, kk) => s + X[i][kk] * Y[kk][j], 0)));
  const coef = [1];
  let M = A.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
  for (let kk = 1; kk <= n; kk += 1) {
    const AM = mul(A, M);
    const ck = -AM.reduce((s, row, i) => s + row[i], 0) / kk;
    coef.push(ck);
    M = AM.map((row, i) => row.map((v, j) => v + (i === j ? ck : 0)));
  }
  return coef;
}

/*
 * The trim, RCM's: "we cranked in a bit of up elevator with the clevis at
 * the elevator horn" after the first flight. The pilot's trim is the
 * table's neutral: the neutral elevator flies it level at three quarter
 * throttle, the thrust line's own moment on the cruise thrust included.
 */
const Vtrim = level(0.75);
const CLtrim = 2 * W / (rho * Vtrim * Vtrim * S);
const Cm0 = -Cma * CLtrim / CLa + thrustZ * D(Vtrim) / (0.5 * rho * Vtrim * Vtrim * S * c);

/* The longitudinal model, the plant's equations, trimmed and linearised. */
function deriv(x, de, d, inverted = false) {
  const [u, w, q, thp] = x;
  const V = Math.hypot(u, w);
  const a = Math.atan2(-w, u) - alphaZL;
  const qb = 0.5 * rho * V * V;
  const CL = CLa * a + CLde * de;
  const CD = CD0 + k * CL * CL;
  const L = qb * S * CL, Dr = qb * S * CD, Tt = T(Math.max(0, u), d);
  const Fx = L * (-w / V) - Dr * u / V + Tt;
  const Fz = L * (u / V) - Dr * w / V;
  const My = qb * S * c * (Cm0 + Cma * a + Cmq * q * c / (2 * V) + Cmde * de) - thrustZ * Tt;
  const gz = inverted ? -1 : 1;
  return [Fx / m - g * Math.sin(thp) + q * w, Fz / m - gz * g * Math.cos(thp) - q * u, My / Iyy, q];
}
function solve3(A, bb) {
  const M = A.map((r, i) => [...r, bb[i]]);
  for (let i = 0; i < 3; i += 1) {
    let p = i;
    for (let r = i + 1; r < 3; r += 1) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < 3; r += 1) { const f = M[r][i] / M[i][i]; for (let j = i; j < 4; j += 1) M[r][j] -= f * M[i][j]; }
  }
  const out = [0, 0, 0];
  for (let i = 2; i >= 0; i -= 1) { let s = M[i][3]; for (let j = i + 1; j < 3; j += 1) s -= M[i][j] * out[j]; out[i] = s / M[i][i]; }
  return out;
}
/* Trim at a speed, level, upright or on its back (gravity along the body's
 * +z rather than -z): the pitch, the elevator and the throttle. */
function trimAt(V, inverted = false) {
  const res = (p) => { const r = deriv([V * Math.cos(p[0]), (inverted ? 1 : -1) * V * Math.sin(p[0]), 0, p[0]], p[1], p[2], inverted); return [r[0], r[1], r[2]]; };
  let p = [inverted ? -0.02 : 0.02, 0, 0.8];
  for (let it = 0; it < 60; it += 1) {
    const r = res(p);
    const J = [0, 1, 2].map((j) => { const pp = p.slice(); pp[j] += 1e-7; const rr = res(pp); return rr.map((v, i) => (v - r[i]) / 1e-7); });
    const dx = solve3([0, 1, 2].map((i) => [0, 1, 2].map((j) => J[j][i])), r.map((v) => -v));
    p = p.map((v, i) => v + dx[i]);
  }
  return p;
}
function longitudinalModes(V) {
  const p = trimAt(V);
  const x0 = [V * Math.cos(p[0]), -V * Math.sin(p[0]), 0, p[0]];
  const A = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => {
    const xp = x0.slice(), xm = x0.slice(); xp[j] += 1e-6; xm[j] -= 1e-6;
    return (deriv(xp, p[1], p[2])[i] - deriv(xm, p[1], p[2])[i]) / 2e-6;
  }));
  const modes = roots(charPoly(A)).filter((r) => r.im > 1e-6).map((r) => { const wn = Math.hypot(r.re, r.im); return { period: 2 * Math.PI / r.im, zeta: -r.re / wn }; });
  modes.sort((x, y) => y.period - x.period);
  return { thetaDeg: p[0] * DEG, deDeg: p[1] * DEG, duty: p[2], phugoid: modes[0], short: modes[1] };
}

/*
 * On its back at the upright trim's speed, flown level: the body's angle
 * to the air, the elevator and the throttle. The push is the elevator that
 * holds it there, as a stick through the expo; its sign is the plant's,
 * trailing edge up positive, so a push is negative.
 */
function invertedAt(V) {
  const p = trimAt(V, true);
  return { V, alphaDeg: -p[0] * DEG, deDeg: p[1] * DEG, duty: p[2], stick: -stickFor(-p[1], throwE) };
}

/* The lateral model, Nelson ch. 5, as kadet-derive.js has it. */
function lateral(V) {
  const q = 0.5 * rho * V * V, CL = W / (q * S);
  const bv = b / (2 * V);
  const Yb = q * S * CYb / m;
  const Lb = q * S * b * Clb / Ixx, Lp = q * S * b * Clp * bv / Ixx, Lr = q * S * b * ClrPerCL * CL * bv / Ixx;
  const Nb = q * S * b * Cnb / Izz, Np = q * S * b * CnpPerCL * CL * bv / Izz, Nr = q * S * b * Cnr * bv / Izz;
  const A = [[Yb / V, 0, -1, g / V], [Lb, Lp, Lr, 0], [Nb, Np, Nr, 0], [0, 1, 0, 0]];
  const rs = roots(charPoly(A));
  const real = rs.filter((r) => Math.abs(r.im) < 1e-6).map((r) => r.re).sort((x, y) => x - y);
  const dr = rs.find((r) => r.im > 1e-6);
  const spiral = real[real.length - 1];
  const La = q * S * b * ClDa / Ixx, Na = q * S * b * CndaPerCL * CL / Izz;
  return {
    V, CL, A, B: [0, La, Na, 0],
    spiral: { root: spiral, tHalf: spiral < 0 ? Math.log(2) / -spiral : null, t2: spiral > 0 ? Math.log(2) / spiral : null },
    rollTau: -1 / real[0],
    dutch: dr ? { wn: Math.hypot(dr.re, dr.im), zeta: -dr.re / Math.hypot(dr.re, dr.im) } : null,
  };
}
/* The hands off bank after a time, from a bank with the sticks centred. */
function bankAfter(lat, phi0, tEnd) {
  let x = [0, 0, 0, phi0];
  const dt = 0.001;
  for (let t = 0; t < tEnd; t += dt) {
    const dx = lat.A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
    x = x.map((v, i) => v + dx[i] * dt);
  }
  return x[3];
}
/*
 * Full aileron from level on the linear lateral model, held to 90 deg of
 * bank: the time, the peak sideslip and the heading the yaw rate adds up
 * to. Past a quarter turn the model's small angle gravity no longer
 * holds, so this is how the roll starts, not its whole path: whether the
 * aircraft rolls about its own axis or yaws away as it goes.
 */
function quarterRoll(lat) {
  let x = [0, 0, 0, 0];
  let psi = 0, betaPk = 0, pPk = 0;
  const dt = 0.0005;
  let t = 0;
  while (x[3] < Math.PI / 2 && t < 10) {
    const dx = lat.A.map((row, i) => row.reduce((s, v, j) => s + v * x[j], 0) + lat.B[i] * throwA);
    x = x.map((v, i) => v + dx[i] * dt);
    psi += x[2] * dt;
    betaPk = Math.max(betaPk, Math.abs(x[0]));
    pPk = Math.max(pPk, x[1]);
    t += dt;
  }
  return { t, psiDeg: psi * DEG, betaDeg: betaPk * DEG, pDegS: pPk * DEG };
}

/*
 * A loop at full throttle, the point mass the plant's aerodynamics make:
 * entered level at the full throttle speed, the elevator stick pulled to
 * the fraction given and held, the angle of attack where the pitching
 * moment trims with the path's own pitch rate on the damping; the loop's
 * height against its length, the speed over the top and the height it
 * comes out at. A round loop is as tall as it is long.
 */
function loop(stick, thr = 1) {
  const de = (expo * stick ** 3 + (1 - expo) * stick) * throwE;
  let V = level(thr), th = 0, x = 0, z = 0, t = 0;
  let zMax = 0, xMin = 0, xMax = 0, vTop = null, exitZ = null;
  const dt = 0.001;
  while (t < 20) {
    /* The angle where the moment trims with the path's own pitch rate on
     * the damping: the moment falls as the angle rises, so bisect. */
    const cmOf = (a) => {
      const q = 0.5 * rho * V * V;
      const L = q * S * Math.min(CLa * a + CLde * de, CLmax);
      const qp = (L - m * g * Math.cos(th)) / (m * V);
      return Cm0 + Cma * a + Cmde * de + Cmq * qp * c / (2 * V);
    };
    let lo = -0.3, hi = 0.6;
    for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (cmOf(mid) > 0) lo = mid; else hi = mid; }
    const a = lo;
    const q = 0.5 * rho * V * V;
    const CL = Math.min(CLa * a + CLde * de, CLmax);
    const L = q * S * CL, Dr = q * S * (CD0 + k * CL * CL);
    const dV = (T(V, thr) - Dr) / m - g * Math.sin(th);
    const dth = (L - m * g * Math.cos(th)) / (m * V);
    V += dV * dt; th += dth * dt; t += dt;
    x += V * Math.cos(th) * dt; z += V * Math.sin(th) * dt;
    zMax = Math.max(zMax, z); xMin = Math.min(xMin, x); xMax = Math.max(xMax, x);
    if (vTop === null && th >= Math.PI) vTop = V;
    if (th >= 2 * Math.PI) { exitZ = z; break; }
    if (V < 2) return null;
  }
  return { height: zMax, length: xMax - xMin, ratio: zMax / (xMax - xMin), vTop, exitZ, t };
}
/*
 * The same loop on the plant's longitudinal equations, deriv() above,
 * integrated whole rather than trimmed at each instant: level at full
 * throttle on its trim elevator, then the stick stepped to the fraction
 * given and held, the short period's lag, the thrust line's moment and
 * the speed's own change all in it; it ends where the flight path, from
 * the velocity, has gone once round. The point mass above trims the angle
 * at once and so starts its pull early: it came out 3.7 m higher than
 * the plant's (docs/UGLYSTIK-STAGE1.md).
 */
function loopWhole(stick, thr = 1) {
  const V0 = level(thr);
  const p = trimAt(V0);
  const de = (expo * stick ** 3 + (1 - expo) * stick) * throwE;
  let x = [V0 * Math.cos(p[0]), -V0 * Math.sin(p[0]), 0, p[0]];
  let X = 0, Z = 0, t = 0, turned = 0;
  const pathOf = (s) => {
    const vx = s[0] * Math.cos(s[3]) - s[1] * Math.sin(s[3]);
    const vz = s[0] * Math.sin(s[3]) + s[1] * Math.cos(s[3]);
    return { vx, vz, a: Math.atan2(vz, vx) };
  };
  let prev = pathOf(x).a;
  let zMax = 0, xMin = 0, xMax = 0, vTop = null;
  const dt = 0.0005;
  while (t < 20 && turned < 2 * Math.PI) {
    const k1 = deriv(x, de, thr);
    const k2 = deriv(x.map((v, i) => v + 0.5 * dt * k1[i]), de, thr);
    const k3 = deriv(x.map((v, i) => v + 0.5 * dt * k2[i]), de, thr);
    const k4 = deriv(x.map((v, i) => v + dt * k3[i]), de, thr);
    x = x.map((v, i) => v + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
    const pth = pathOf(x);
    X += pth.vx * dt; Z += pth.vz * dt; t += dt;
    turned += Math.atan2(Math.sin(pth.a - prev), Math.cos(pth.a - prev));
    prev = pth.a;
    zMax = Math.max(zMax, Z); xMin = Math.min(xMin, X); xMax = Math.max(xMax, X);
    if (vTop === null && turned >= Math.PI) vTop = Math.hypot(x[0], x[1]);
  }
  return { height: zMax, length: xMax - xMin, ratio: zMax / (xMax - xMin), vTop, exitZ: Z, t, alphaDeg: (Math.atan2(-x[1], x[0]) - alphaZL) * DEG };
}

/*
 * The tricycle at rest, drawn (src/render/uglystikcraft.js): the ground
 * line tangent under the nose wheel and the mains, the CG over it, and the
 * nose wheel's share of the weight by moments about the mains along that
 * line. The plan's 3 1/2 in mains reach 0.31 in lower than its 2 3/4 in
 * nose wheel, so on level grass it sits 1.48 deg NOSE DOWN (negative), as
 * the plan's own ground line under the wheels slopes. Each leg deflects 6
 * mm under its load; damping 0.6 of critical, the Cub's rule.
 */
const noseX = R(xCGst - 5.20), noseZ = R(zCG - 26.32), noseR = R(1.375);
const mainX = R(xCGst - 17.00), mainZ = R(zCG - 26.25), mainR = R(1.75);
const restPitch = Math.atan2((mainZ - mainR) - (noseZ - noseR), noseX - mainX);
const th = restPitch;
const along = (x, z) => x * Math.cos(th) - z * Math.sin(th);
const cgHeight = -(mainX * Math.sin(th) + (mainZ - mainR) * Math.cos(th));
const mainW = along(mainX, mainZ - mainR), noseW = along(noseX, noseZ - noseR);
const noseShare = -mainW / (noseW - mainW);
const loadNose = W * noseShare, loadMain = W * (1 - noseShare) / 2;
const defl = 0.006;
const kMain = loadMain / defl, kNose = loadNose / defl;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mNose = (Iyy + m * mainW * mainW) / Math.pow(noseW - mainW, 2);
const cNose = 2 * 0.6 * Math.sqrt(kNose * mNose);
const propX = R(xCGst), propClear = (() => {
  const tipZ = thrustZ - propR;
  return propX * Math.sin(th) + tipZ * Math.cos(th) + cgHeight;
})();
/* Standing with the engine idling, the wheels' friction holding its
 * thrust back at the ground, the CG's height under it, leans it further
 * onto the nose wheel (kadet-derive.js's restIdle): the loads by moments
 * about the mains, and the pitch the two legs' deflections add. */
const restIdle = (() => {
  const Ti = T(0, 0);
  const wb = noseW - mainW;
  const nose = (W * -mainW + Ti * (cgHeight + thrustZ)) / wb;
  const main = (W - nose) / 2;
  const pitch = th - ((nose / kNose - defl) - (main / kMain - defl)) / wb;
  return { share: nose / W, pitchDeg: pitch * DEG };
})();

/* The take off roll from rest, full throttle, the sticks centred, to the
 * speed a pilot rotates at, 1.2 Vs, at the rest attitude. */
function takeoff(mu, vRot) {
  const a = restPitch - alphaZL;
  const CL = CLa * a, CD = CD0 + k * CL * CL;
  let V = 0, x = 0, t = 0;
  const dt = 0.001;
  while (V < vRot && t < 30) {
    const q = 0.5 * rho * V * V;
    const acc = (T(V, 1) - q * S * CD - mu * Math.max(0, W - q * S * CL)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, V };
}

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const lat = lateral(Vtrim);
const lon = longitudinalModes(Vtrim);
const inv = invertedAt(Vtrim);
const roll = quarterRoll(lat);
const armAc = (xCG - xAcWing) / c;
const armCp = (R(wingLE + 0.40 * cMac) - xCG) / c;
const stallDw = eta * VH * at * deda / aw;
const rows = [
  ['S wing, ailerons (sq in), S m^2, b m, c = S/b, AR', `${f(Swing, 1)} ${f(Sail, 1)} ${f(S, 5)} ${f(b, 4)} ${f(c, 4)} ${f(AR, 3)}`],
  ['m kg, W/S N/m^2 (oz/sq ft)', `${f(m, 4)} ${f(W / S, 2)} (${f(96 / (S / SQIN / 144), 2)})`],
  ['dihedral deg, cos^2', `${f(gamma * DEG, 3)} ${f(cosFactor, 4)}`],
  ['stations: wing ac, CG, NP, tail ac, fin (in)', `${f(xAcWing / 0.0254, 2)} ${f(xCGst, 2)} ${f(xNP / 0.0254, 2)} ${f(xAcTail / 0.0254, 2)} ${f(xAcFin / 0.0254, 2)}`],
  ['S_h m^2, AR_t, l_h m, l_v m, S_v m^2', `${f(Sh, 5)} ${f(ARt, 2)} ${f(lh, 4)} ${f(lv, 4)} ${f(Sv, 5)}`],
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα DATCOM, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, h_n, static margin', `${f(CLa)} ${f(hn, 4)} ${f(SM, 4)}`],
  ['zero lift line deg, its sin, cos', `${f(alphaZL * DEG, 3)} ${Math.sin(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)} ${Math.cos(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)}`],
  ['Cmα, Cm0, Cmq', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)}`],
  ['Cmδe, CLδe', `${f(Cmde, 4)} ${f(CLde, 4)}`],
  ['CYβ, Cnβ (fuselage), Cnr', `${f(CYb, 4)} ${f(Cnb, 4)} (${f(CnbFus, 4)}) ${f(Cnr, 4)}`],
  ['Clβ: dihedral, fin, shoulder wing, total', `${f(ClbDihedral, 4)} ${f(ClbFin, 4)} ${f(ClbHigh, 4)} ${f(Clb, 4)}`],
  ['Clp, Clδa', `${f(Clp, 4)} ${f(ClDa, 4)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['throws deg: aileron up, down, mean; elevator; rudder', `${f(throwAup * DEG, 4)} ${f(throwAdown * DEG, 4)} ${f(throwA * DEG, 4)}; ${f(throwE * DEG, 4)}; ${f(throwR * DEG, 4)}`],
  ['k, rpm no load, V_p, idle', `${f(k, 5)} ${f(rpmNL, 1)} ${f(Vp, 3)} ${f(idle, 4)}`],
  ['static thrust N, thrust to weight, idle static N', `${f(Ts, 3)} ${f(Ts / W, 3)} ${f(T(0, 0), 3)}`],
  ['disc power W, shaft torque N m, torque arm m', `${f(discP, 1)} ${f(shaftTorque, 4)} ${f(shaftTorque / Ts, 5)}`],
  ['thrust line over the CG m', f(thrustZ, 4)],
  ['mass: fuselage kg at station, CG height from masses', `${f(fuseM, 3)} ${f(fuseS, 2)} ${f(zCGmass, 2)}`],
  ['inertia Ixx Iyy Izz', `${f(Ixx, 4)} ${f(Iyy, 4)} ${f(Izz, 4)}`],
  ['U1 level at 75 (the trim), 100 percent; 50', `${f(Vtrim, 2)} ${f(level(1), 2)}; ${f(level(0.5), 2)}`],
  ['U2 stall m/s', f(Vs, 3)],
  ['U3 glide L/D at 1.4 Vs, best, at', `${f(ld(1.4 * Vs), 3)} ${f(LDmax, 3)} ${f(Vmd, 2)}`],
  ['U5 best climb m/s at m/s; straight up m/s', `${f(best.vz, 2)} ${f(best.V, 2)}; ${f(vertical, 2)}`],
  ['U6 full aileron pb/2V, deg/s at the trim, at 20', `${f(ClDa * throwA / -Clp, 4)} ${f(ClDa * throwA / -Clp * 2 * Vtrim / b * DEG, 1)} ${f(ClDa * throwA / -Clp * 40 / b * DEG, 1)}`],
  ['U7 a quarter roll, linear model: s, heading deg, beta deg, p deg/s', `${f(roll.t, 3)} ${f(roll.psiDeg, 2)} ${f(roll.betaDeg, 2)} ${f(roll.pDegS, 1)}`],
  ['U8 on its back at the trim speed: alpha, elevator deg, throttle, stick', `${f(inv.alphaDeg, 2)} ${f(inv.deDeg, 2)} ${f(inv.duty, 3)} ${f(inv.stick, 3)}`],
  ['   upright at the trim: theta, elevator deg, throttle', `${f(lon.thetaDeg, 2)} ${f(lon.deDeg, 3)} ${f(lon.duty, 3)}`],
  ['U9 loops at full throttle, point mass, stick 0.3, 0.4, 0.5, 0.6, 1.0', [0.3, 0.4, 0.5, 0.6, 1.0].map((s) => JSON.stringify(loop(s), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))).join(' ')],
  ['U9 the loop at half stick on the whole longitudinal equations', JSON.stringify(loopWhole(0.5), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['U10 spiral root, t_half s; 30 deg let go, bank at 2, 6 s', `${f(lat.spiral.root, 4)} ${f(lat.spiral.tHalf, 1)}; ${f(bankAfter(lat, 30 / DEG, 2) * DEG, 1)} ${f(bankAfter(lat, 30 / DEG, 6) * DEG, 1)}`],
  ['   roll tau s, Dutch roll wn, zeta', `${f(lat.rollTau, 4)} ${lat.dutch ? `${f(lat.dutch.wn, 2)} ${f(lat.dutch.zeta)}` : 'none'}`],
  ['   phugoid s zeta, short period s zeta', `${f(lon.phugoid && lon.phugoid.period, 2)} ${f(lon.phugoid && lon.phugoid.zeta)}; ${f(lon.short && lon.short.period, 3)} ${f(lon.short && lon.short.zeta)}`],
  ['alpha at full up, linear moment; stall (deg)', `${f((Cm0 + Cmde * throwE) / -Cma * DEG, 1)} ${f(CLmax / CLa * DEG, 2)}`],
  ['stall arms ac, cp, dw', `${f(armAc, 4)} ${f(armCp, 4)} ${f(stallDw, 4)}`],
  ['rest: pitch deg, CG height m, nose share', `${f(restPitch * DEG, 3)} ${f(cgHeight, 4)} ${f(noseShare, 4)}`],
  ['   idling: nose share, pitch deg', `${f(restIdle.share, 4)} ${f(restIdle.pitchDeg, 3)}`],
  ['   k main, c main, k nose, c nose', `${f(kMain, 0)} ${f(cMain, 2)} ${f(kNose, 0)} ${f(cNose, 2)}`],
  ['   prop tip clearance at rest m', f(propClear, 4)],
  ['U15 take off to 1.1, 1.2, 1.5 Vs on grass', [1.1, 1.2, 1.5].map((r) => JSON.stringify(takeoff(muGrass, r * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))).join(' ')],
  ['U21 taxi radius: wheelbase over tan of 0.6 of the rudder, m', f((noseX - mainX) / Math.tan(0.6 * throwR), 3)],
  ['U12 prop torque N m: the engine\'s, ideal disc', `${f(shaftTorque, 4)} ${f(discP / omegaLoaded, 4)}`],
  ['U19 idle rpm, static thrust N, rolling resistance N', `${f(idle * rpmLoaded, 0)} ${f(T(0, 0), 3)} ${f(muGrass * W, 3)}`],
  ['fuel: the 61FX at full throttle cc/min', f(17.9 * 9.95 / 6.5, 2)],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(62)} ${v}`);
}
