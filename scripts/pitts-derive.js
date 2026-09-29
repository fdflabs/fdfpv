/*
 * pitts-derive.js: the arithmetic behind docs/PITTS-STAGE1.md, from
 * E-flite's published figures for its Pitts S-1S 850mm (EFL35500: the
 * manual, the product listing and its dimensioned top view) and the
 * photographs of it, to every coefficient of FW_PITTS850 and every derived
 * band in tests/pitts-thresholds.json. The aircraft is a biplane, and the
 * two wings are taken as two lifting lines in each other's flow: Prandtl's
 * interference on the induced drag, Munk's span factor for the equivalent
 * monoplane, each wing's own lift slope and load in the other's wash, and
 * the share of the cell's lift each carries (plant_wing.c, THE SECOND
 * WING). It never loads the plant: this is what the plant is checked
 * against, so it stands apart from it. Harness arithmetic in JS maths,
 * which is allowed here because nothing it prints is hashed. It follows
 * scripts/edge-derive.js where the two aircraft are alike, both four
 * channel electric aerobatic taildraggers. Run with npm run pitts:derive.
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

import { biplaneCell } from './lib/biplane.js';

const DEG = 180 / Math.PI;
const rho = 1.225;
const g = 9.81;

/*
 * THE AIRCRAFT. E-flite's manual and listing (docs/PITTS-STAGE1.md has the
 * URLs): span 850 mm, length 787 mm, wing area 28.2 dm^2, 1304 g without
 * the pack and 1529 g with the suggested 3S 2200 (the dimensioned top
 * view, EFL35500_A73), the CG 70 mm behind the top wing's leading edge
 * (the corrected figure for the BL15 motor; the first manual's 86 mm was
 * for the BL10).
 *
 * The planform, off E-flite's dimensioned top view (0.6348 mm a pixel on
 * the published span, the published length checking to 0.1 percent): the
 * top wing's chord 0.200 m, constant, both edges swept back 7.1 deg, its
 * tips rounded from 0.34 m out (0.00463 m^2 short of square at each) and a
 * cut out in its trailing edge over the cockpit, 0.13 m wide and 0.053 m
 * deep (0.0054 m^2); its span 0.849 m, E-flite's 850. The bottom view (EFL35500_A2),
 * scaled on the bottom wing's own span, 0.845 m: its chord 0.175 m, square
 * to the fuselage, its tips rounded (0.00275 m^2 each), its ailerons from
 * 0.131 to 0.378 m out at 48 mm of chord, the top wing's leading edge
 * 0.045 m ahead of the bottom's at the root. The side view (A18, 0.4394 mm
 * a pixel on the length at the cowl's 12 deg of rest attitude) gives the
 * same stagger at the root, 0.051 m, the gap at the struts, and the gear;
 * the front view (A16, 0.4994 mm a pixel on the span) the bottom wing's
 * 3 deg of dihedral (the full size S-1S's), the top wing flat. Each
 * wing's area is its measured planform: 0.1551 m^2 on top and 0.1424 m^2
 * under, of which 0.016 m^2 runs through the fuselage; the exposed sum,
 * 0.2815, is E-flite's 28.2 dm^2, which is the plant's reference area.
 */
const b1 = 0.850, c1 = 0.200, sweep1 = 7.1 / DEG;
const b2 = 0.845, c2 = 0.175, dihedral2 = 3.0 / DEG;
const S1 = b1 * c1 - 2 * 0.00463 - 0.0054;
const S2 = b2 * c2 - 2 * 0.00275;
const S = 0.282, m = 1.529, W = m * g;
const b = b1, AR = b * b / S;
/* The reference chord: the two wings' mean, weighted by their areas. */
const cbar = (S1 * c1 + S2 * c2) / (S1 + S2);
/* Heights over the thrust line, which runs through the CG (E-flite gives no
 * down or side thrust): the top wing's chord plane 0.090 m up, the bottom
 * wing's 0.060 m down at the root, off the side view at the struts. */
const z1 = 0.090, z2 = -0.060;
/* Stations, m forward of the CG: the top wing's root leading edge 70 mm
 * ahead of it (E-flite's CG), the bottom wing's 0.048 m behind that (the
 * mean of the bottom and side views' 0.045 and 0.051). Each wing's
 * aerodynamic centre is its mean chord's quarter point; a rectangle's mean
 * chord is at a quarter of the span, where the top wing's sweep has taken
 * its leading edge back b1/4 tan(sweep). */
const xLE1 = 0.070, xLE2 = xLE1 - 0.048;
const xAc1 = xLE1 - (b1 / 4) * Math.tan(sweep1) - 0.25 * c1;
const xAc2 = xLE2 - 0.25 * c2;
const gap = z1 - z2;
const stagger = xAc1 - xAc2;

/*
 * THE TWO WINGS, scripts/lib/biplane.js: Prandtl's induced drag of the
 * pair on the Trefftz plane (NACA TN 182, 1924), Munk's span factor, each
 * wing's own lift slope and load in the other's trailing sheet and bound
 * vortex, and the plant's bip_* from them. The solver was this file's own;
 * it is shared so the Tiger Moth's derivation runs the same one. Both
 * wings are rigged at one incidence (E-flite's foam wings, like the full
 * size S-1S's: "symmetrical wings are parallel (same angle of incidence)",
 * Davisson). e for the planform's and the fuselage's losses on top of the
 * pair's own, 0.85, ESTIMATED.
 */
const eSpan = 0.85;
const cell = biplaneCell({
  w1: { b: b1, c: c1, S: S1, z: z1, dihedral: 0, xAc: xAc1 },
  w2: { b: b2, c: c2, S: S2, z: z2, dihedral: dihedral2, xAc: xAc2 },
  S, eSpan,
});
const {
  selfCheck, sigma, sigmaFit, gOverB, kMunk, kSpanCarried, kappa1, kappa2, A1, A2, aw, share1, share2, r1,
  bipM, bipX, bipKi, bipKx, kInduced, xAc, awMono, kMono,
} = cell;
const r2w = cell.r2;

/* The tail, off the top view (0.6348 mm a pixel): the stabiliser and
 * elevator 0.326 m across and 0.043 m^2 with the fuselage's strip, 0.040
 * outside it, their aerodynamic centre 0.385 m behind the CG; the elevator
 * 41 percent of the chord (the bottom view's hinge line). The fin and
 * rudder off the side view, ESTIMATED: 0.018 m^2, the rudder 55 percent
 * of it, its centre 0.44 m behind the CG and 0.06 m over the thrust line;
 * the rudder's 0.066 m chord at its widest. */
const Sh = 0.040, bh = 0.326, xAcT = -0.385, eta = 0.9;
const Sv = 0.018, xAcV = -0.44, zv = 0.06, hv = 0.17;
const cfE = 0.41, cfR = 0.55, cfA = 0.048 / 0.175;
const lh = xAc - xAcT, lv = -xAcV;

/* Throws: E-flite's high rates, 18, 32 and 28 mm, measured at each
 * surface's widest chord: the ailerons' 48 mm, the elevator's 70 mm at the
 * root (41 percent of 0.17 m), the rudder's 66 mm; low rates 12, 24 and 20
 * mm. */
const throwA = Math.asin(0.018 / 0.048), throwE = Math.asin(0.032 / 0.070), throwR = Math.asin(0.028 / 0.066);
const lowA = Math.asin(0.012 / 0.048), lowE = Math.asin(0.024 / 0.070), lowR = Math.asin(0.020 / 0.066);
/* The surface's knee (surf_knee, docs/EDGE-STAGE1.md), DATCOM's K' for a
 * plain flap past 15 deg: E-flite's 22 to 27 deg lose a tenth. */
const knee = 0.5;
const eff = (d) => d / Math.sqrt(1 + (d / knee) ** 2);
const expo = 0.30; /* the house stock expo (configs/tuning.js); E-flite gives none */
const tauOf = (cf) => { const th = Math.acos(1 - 2 * (1 - cf)); return 1 - (th - Math.sin(th)) / Math.PI; };
const tauA = tauOf(cfA), tauE = tauOf(cfE), tauR = tauOf(cfR);

/*
 * THE COEFFICIENTS, Nelson's forms. The downwash at the tail is DATCOM's
 * (section 4.4.1, as the Edge's derivation takes it), on the equivalent
 * monoplane's aspect ratio, (k b1)^2 / S with the span factor the wings
 * carry, untapered, the tail on the cell's mean height and 0.37 m behind
 * its ac: Nelson's far field 2 a_w / (pi AR) reads 0.78 here, which is the
 * wake a long way back, not two chords. The fuselage's destabilising
 * share, Raymer eq. 16.25: K_fus 0.007 per deg (the wing a quarter of the
 * way back), the round cowl's 0.11 m width and the 0.787 m length.
 */
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const ARe = (kSpanCarried * b1) ** 2 / S;
const KA = 1 / ARe - 1 / (1 + Math.pow(ARe, 1.7));
const KL = 1;
const KH = (1 - 0 / b) / Math.cbrt(2 * lh / b);
const deda = 4.44 * Math.pow(KA * KL * KH, 1.19);
const dedaFar = 2 * aw / (Math.PI * ARe);
const VH = Sh * lh / (S * cbar);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const fusCma = 0.007 * 0.11 * 0.11 * 0.787 / (cbar * S) * DEG;
const hAc = -xAc / cbar; /* the CG's distance ahead of the cell's ac, per chord */
const SM = hAc + VH * eta * (at / aw) * (1 - deda) - fusCma / CLa;
const Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * (xAc - xAcT) / cbar;
const Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
const arV = 1.55 * hv * hv / Sv, av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const CYb = -av * Sv / S - 0.12;
/* The fuselage's weathercock, Nelson eq. 2.64's slab sided form on the
 * side view's 0.075 m^2 and 0.787 m: destabilising. */
const CnbFus = -0.0012 * DEG * (0.075 / S) * (0.787 / b);
const Cnb = av * VV + CnbFus;
const Cnr = -2 * av * VV * lv / b - 0.04 / 4;
/* Roll per sideslip: the fin over the CG, and the bottom wing's 3 deg of
 * dihedral, DATCOM's -a (Gamma / 6) (1 + 2 lambda)/(1 + lambda) per wing
 * on its share, the rectangle's 1.5 / 6; the two wings' heights over and
 * under the fuselage cancel near enough (the top one's parasol stability,
 * the bottom one's low wing), ESTIMATED. */
const ClbFin = -av * (Sv / S) * (zv / b);
const ClbDih = -A2 * (S2 / S) * dihedral2 / 4;
const Clb = ClbFin + ClbDih;
/* Roll damping and the ailerons, strip theory on each wing at its own
 * lift slope in the other's wash, over the reference S b: a rectangle's
 * -a (c y^2) integrated. The ailerons on all four panels (the full size
 * S-1S's "four ailerons"), from 0.131 to 0.378 m out on both wings,
 * joined by their struts. */
function integrate(f, a, bb, n = 4000) { let s = 0; for (let i = 0; i < n; i += 1) { const y = a + (bb - a) * (i + 0.5) / n; s += f(y) * (bb - a) / n; } return s; }
const Clp = -(A1 * integrate((y) => c1 * y * y, 0, b1 / 2) + A2 * integrate((y) => c2 * y * y, 0, b2 / 2)) * 4 / (S * b * b);
const yA0 = 0.131, yA1 = 0.378;
const Clda = 2 * tauA * (A1 * integrate((y) => c1 * y, yA0, yA1) + A2 * integrate((y) => c2 * y, yA0, yA1)) / (S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;

/*
 * Mass and inertia, ESTIMATED: the parts' classes (the BL15 and its mount,
 * the 11 x 7 and spinner, the ESC, the cowl, the foam fuselage as a rod,
 * two foam wings with their servos and spars, the struts, the tail, the
 * gear and pants), summing to E-flite's 1304 g, and the 225 g pack (1529
 * less 1304) placed where the CG comes out at the manual's.
 */
const parts = [
  { name: 'motor, mount, prop, spinner', m: 0.210, x: 0.180, z: 0 },
  { name: 'ESC', m: 0.050, x: 0.130, z: -0.01 },
  { name: 'receiver, wiring', m: 0.033, x: 0.000, z: 0 },
  { name: 'cowl', m: 0.060, x: 0.160, z: 0 },
  { name: 'fuselage shell', m: 0.200, x0: -0.54, x1: 0.16, z: 0 },
  { name: 'cockpit, hatch, battery tray', m: 0.080, x: 0.0, z: 0.02 },
  { name: 'top wing, spar, two servos', m: 0.200, x: xLE1 - 0.09, z: z1, wing: [b1, c1] },
  { name: 'bottom wing, spar, two servos', m: 0.190, x: xLE2 - 0.08, z: z2, wing: [b2, c2] },
  { name: 'cabane and interplane struts, wires', m: 0.045, x: 0.02, z: 0.02, y: 0.25 },
  { name: 'stabiliser and elevator', m: 0.040, x: -0.385, z: 0.0 },
  { name: 'fin and rudder', m: 0.024, x: -0.44, z: zv },
  { name: 'tail servos, pushrods', m: 0.040, x: 0.0, z: 0 },
  { name: 'gear, pants, wheels', m: 0.120, x: 0.064, z: -0.15 },
  { name: 'tailwheel', m: 0.012, x: -0.49, z: -0.07 },
];
const packM = 1.529 - 1.304;
const xOf = (p) => (p.x0 === undefined ? p.x : (p.x0 + p.x1) / 2);
const x2Of = (p) => (p.x0 === undefined ? p.x * p.x : (p.x0 * p.x0 + p.x0 * p.x1 + p.x1 * p.x1) / 3);
let mSum = packM, mx = 0;
for (const p of parts) { mSum += p.m; mx += p.m * xOf(p); }
const packX = -mx / packM;
let Ixx = 0, Iyy = packM * packX * packX, Izz = packM * packX * packX;
for (const p of parts) {
  const yy = p.wing ? p.wing[0] * p.wing[0] / 12 : (p.y ? p.y * p.y : 0);
  const cc = p.wing ? p.wing[1] * p.wing[1] / 12 : 0;
  Ixx += p.m * (p.z * p.z + yy);
  Iyy += p.m * (x2Of(p) + cc + p.z * p.z);
  Izz += p.m * (x2Of(p) + cc + yy);
}
/* The wheels' track, 0.21 m, and the pants on it. */
Ixx += 0.120 * 0.105 * 0.105;
Izz += 0.120 * 0.105 * 0.105;

/*
 * THE MOTOR, ESTIMATED: E-flite's BL15 880 kV on the 11 x 7 and its 40 A
 * ESC, no bench figure published. A DC motor on the pack, as the Extra's
 * derivation runs it: I = (V - n / kV) / R, the torque (I - I0) 60 /
 * (2 pi kV); R and I0 are E-flite's Power 15's (the BL15's class: 0.03
 * ohm, 2 A at 10 V); the pack 3S at the plant's 3.7 V a cell and 8
 * milliohm a cell, 5 milliohm of ESC and wire. The prop is APC's 11 x 7E
 * (PER3_11x7E.dat, static: 8,000 rpm 0.254 N m and 14.858 N; 9,000 0.320
 * and 18.873; 10,000 0.395 and 23.393).
 */
const kv = 880, cells = 3, vNom = 3.7 * cells, rPack = 0.008 * cells, rMotor = 0.030, rEsc = 0.005, i0 = 2.0;
const apc = [[8000, 0.254, 14.858], [9000, 0.320, 18.873], [10000, 0.395, 23.393]];
function apcAt(n, col) {
  const kf = (r) => r[col] / (r[0] * r[0]);
  if (n <= apc[0][0]) return kf(apc[0]) * n * n;
  for (let i = 1; i < apc.length; i += 1) {
    if (n <= apc[i][0]) { const a = apc[i - 1], bb = apc[i]; return (kf(a) + (n - a[0]) / (bb[0] - a[0]) * (kf(bb) - kf(a))) * n * n; }
  }
  return kf(apc[apc.length - 1]) * n * n;
}
const ktm = 60 / (2 * Math.PI * kv);
let nStatic = 8000;
for (let it = 0; it < 300; it += 1) {
  const q = apcAt(nStatic, 1);
  const i = q / ktm + i0;
  const vm = vNom - i * (rPack + rEsc);
  const n = kv * (vm - i * rMotor);
  nStatic += 0.3 * (n - nStatic);
}
const Qs = apcAt(nStatic, 1), Ts = apcAt(nStatic, 2), Is = Qs / ktm + i0;
const rpmNL = kv * vNom, Vp = 0.85 * rpmNL / 60 * 7 * 0.0254;
const torqueArm = Qs / Ts;
const propR = 0.1397;
const T = (V, d) => Math.max(0, Ts * d * d * (1 - Math.max(0, V) / (Vp * d)));
/* The prop's inertia: APC's 11 x 7E, 23 g, a tapered blade's 0.7 of a
 * rod's m D^2 / 12, and the BL15's can. */
const propJ = 0.7 * 0.023 * (2 * propR) ** 2 / 12 + 0.05 * 0.0175 * 0.0175;
/* The same on 4S, for the hangar and the check that it "rocks on 4S". */
function motorOn(nCells) {
  const v = 3.7 * nCells, rp = 0.008 * nCells;
  let n = 9000;
  for (let it = 0; it < 300; it += 1) {
    const q = apcAt(n, 1);
    const i = q / ktm + i0;
    n += 0.3 * (kv * (v - i * (rp + rEsc) - i * rMotor) - n);
  }
  return { rpm: n, thrust: apcAt(n, 2), current: apcAt(n, 1) / ktm + i0, rpmNL: kv * v, vp: 0.85 * kv * v / 60 * 7 * 0.0254 };
}

/* Performance on the plant's polar: the cell's linear lift, CD0 plus the
 * biplane's induced drag. CD0 ESTIMATED at 0.055: two wings, eight struts
 * and the wires, the big pants and a round cowl (a biplane's is
 * 0.04 to 0.06 on its total area, Hoerner ch. 14). */
const CD0 = 0.055;
const CLmaxWing = 0.90; /* each wing's own, the Edge's symmetric section at the same Reynolds number, ESTIMATED */
const rMax = Math.max(r1, r2w);
const CLmaxCell = CLmaxWing / rMax;
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + kInduced * CL * CL); };
const level = (d) => {
  let lo = 8, hi = 45;
  if (T(lo, d) < D(lo) && T(12, d) < D(12)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmaxCell));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + kInduced * CL * CL); };
const ldMono = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + kMono * CL * CL); };
const CLopt = Math.sqrt(CD0 / kInduced), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));

const Vtrim = level(0.75);
const CLtrim = 2 * W / (rho * Vtrim * Vtrim * S);
const Cm0 = -Cma * CLtrim / CLa;
const rollAt = (V, dA) => Clda * eff(dA) / -Clp * 2 * V / b;

/*
 * THE SLIPSTREAM over the tail, the Extra's capability (plant_wing.c,
 * slip_*, docs/EXTRA-STAGE1.md), with its formulas: the 11 in prop's wash
 * by momentum theory, contracted to R sqrt((V + v_i)/(V + 2 v_i)), over
 * the stabiliser's 0.163 m half span and the fin's 0.105 m over the
 * thrust line and 0.066 m under it (the side view, the thrust line drawn
 * from the spinner through the CG at the rest attitude); the ailerons,
 * 0.131 m out and more, are outside it. The tail's shares of the
 * derivatives are the Extra's forms; its zero lift at the trim cm_0 is set
 * for. On a Pitts the tail sits close behind a big prop, and under power
 * the elevator has the wash's pressure on top of the free stream's.
 */
const slipYh = bh / 2, slipHv = [0.105, 0.066], slipYa = [yA0, yA1];
function wash(thrust, u) {
  const dp = thrust / (Math.PI * propR * propR);
  const vi = 0.5 * (Math.sqrt(u * u + 2 * dp / rho) - u);
  const rw = propR * Math.sqrt((u + vi) / (u + 2 * vi));
  const fh = Math.min(1, rw / slipYh);
  const fv = (Math.min(rw, slipHv[0]) + Math.min(rw, slipHv[1])) / (slipHv[0] + slipHv[1]);
  return { dp, vi, rw, fh, fv };
}
const slipCla = at * (Sh / S) * eta * (1 - deda);
const slipCma = -eta * VH * at * (1 - deda);
const slipA0 = CLtrim / CLa;
const slipCnb = av * VV, slipCnr = -2 * av * VV * lv / b, slipCyb = -av * Sv / S, slipClb = ClbFin;
/* The elevator's authority at the trim, three quarter throttle, with the
 * wash on the stabiliser's share: over the free stream's alone. */
const washTrim = wash(T(Vtrim, 0.75), Vtrim);
const elevGain = 1 + washTrim.dp * washTrim.fh / (0.5 * rho * Vtrim * Vtrim);

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
function longitudinal(V) {
  const q = 0.5 * rho * V * V, CL = W / (q * S);
  const u0 = V;
  const Xu = -2 * q * S * (CD0 + kInduced * CL * CL) / (m * V);
  const Zu = -2 * q * S * CL / (m * V);
  const Za = -q * S * (CLa + CD0) / m;
  const Ma = q * S * cbar * Cma / Iyy;
  const Mq = q * S * cbar * Cmq * cbar / (2 * V) / Iyy;
  const A = [[Xu, 0, 0, -g], [Zu / u0, Za / u0, 1, 0], [0, Ma, Mq, 0], [0, 0, 1, 0]];
  const rs = roots(charPoly(A)).filter((r) => r.im > 1e-6).map((r) => ({ period: 2 * Math.PI / r.im, zeta: -r.re / Math.hypot(r.re, r.im) }));
  rs.sort((x, y) => y.period - x.period);
  const Zde = -q * S * CLde / m;
  const Mde = q * S * cbar * Cmde / Iyy;
  const step = (de) => {
    let x = [0, 0, 0, 0];
    let peak = 0, at2 = null;
    const dt = 0.0005;
    for (let t = 0; t < 1.5; t += dt) {
      const dx = A.map((row, i) => row.reduce((acc, v, j) => acc + v * x[j], 0) + [0, Zde / u0, Mde, 0][i] * de);
      x = x.map((v, i) => v + dx[i] * dt);
      if (x[2] > peak) { peak = x[2]; at2 = t + dt; } else if (at2 !== null && x[2] < 0.97 * peak) break;
    }
    return { at: at2, peakDegS: peak * DEG };
  };
  return { phugoid: rs[0], short: rs[1], step };
}
function lateral(V) {
  const q = 0.5 * rho * V * V, CL = W / (q * S);
  const bv = b / (2 * V);
  const Yb = q * S * CYb / m;
  const Lb = q * S * b * Clb / Ixx, Lp = q * S * b * Clp * bv / Ixx, Lr = q * S * b * 0.25 * CL * bv / Ixx;
  const Nb = q * S * b * Cnb / Izz, Np = q * S * b * -0.125 * CL * bv / Izz, Nr = q * S * b * Cnr * bv / Izz;
  const A = [[Yb / V, 0, -1, g / V], [Lb, Lp, Lr, 0], [Nb, Np, Nr, 0], [0, 1, 0, 0]];
  const rs = roots(charPoly(A));
  const real = rs.filter((r) => Math.abs(r.im) < 1e-6).map((r) => r.re).sort((x, y) => x - y);
  const dr = rs.find((r) => r.im > 1e-6);
  return { V, CL, spiral: real[real.length - 1], rollTau: -1 / real[0], dutch: dr ? { wn: Math.hypot(dr.re, dr.im), zeta: -dr.re / Math.hypot(dr.re, dr.im) } : null };
}

/*
 * THE GEAR, off the side view (EFL35500_A18), the aircraft standing on its
 * wheels on a level floor. In its pixels: the spinner's tip at (1875, 805),
 * the main wheel's centre at (1575, 1345) and the tailwheel's at (280,
 * 1343), their radii 55 and 27 pixels. The body stands at theta, 11 deg
 * nose up: the fuselage's pinstripes, straight from the cowl to the tail,
 * read 11.1 and 11.4 deg over their fore and aft halves, the cowl's top
 * line 9.7; ESTIMATED to 1.5 deg. (The wheels cannot give it: both axles
 * are in the picture, so any theta read into it puts them back where they
 * are.) The scale is the 787 mm length's horizontal extent, 1745 pixels,
 * at cos theta; the CG is 0.246 m behind the spinner's tip along the body
 * (the top view: the tip 0.316 m ahead of the top wing's leading edge, the
 * CG 0.070 m behind it) on the thrust line. The main wheels' track, 0.21
 * m, off the front view.
 */
const side = { tip: [1875, 805], main: [1575, 1345], tail: [280, 1343], rMain: 55, rTail: 27, lengthPx: 1745 };
function gearAt(theta) {
  const s = 0.787 * Math.cos(theta) / side.lengthPx;
  const ct = Math.cos(theta), st = Math.sin(theta);
  /* The CG in the picture: 0.246 m back along the body from the tip, the
   * body's x axis pointing up by theta (the picture's y runs down). */
  const cg = [side.tip[0] - 0.246 * ct / s, side.tip[1] + 0.246 * st / s];
  const body = (px) => {
    const fwd = (px[0] - cg[0]) * s, up = -(px[1] - cg[1]) * s;
    return [fwd * ct + up * st, -fwd * st + up * ct];
  };
  const mn = body(side.main), tl = body(side.tail);
  return { s, main: mn, tail: tl, rMain: side.rMain * s, rTail: side.rTail * s };
}
const theta = 11 / DEG;
const gearFit = gearAt(theta);
const mainX = gearFit.main[0], mainZ = gearFit.main[1], wheelR = gearFit.rMain;
const tailX = gearFit.tail[0], tailZ = gearFit.tail[1], tailR = gearFit.rTail;
const restPitch = Math.atan2((tailZ - tailR) - (mainZ - wheelR), mainX - tailX);
const th = restPitch;
const along = (x, z) => x * Math.cos(th) - z * Math.sin(th);
const cgHeight = -((mainZ - wheelR) * Math.cos(th) + mainX * Math.sin(th));
const mainW = along(mainX, mainZ), tailW = along(tailX, tailZ);
const tailShare = mainW / (mainW - tailW);
const loadMain = W * (1 - tailShare) / 2, loadTail = W * tailShare;
const defl = 0.005;
const kMain = loadMain / defl, kTail = loadTail / defl;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mTail = (Iyy + m * mainW * mainW) / Math.pow(mainW - tailW, 2);
const cTail = 2 * 0.6 * Math.sqrt(kTail * mTail);
const propX = 0.1997;
const hubClearLevel = -(mainZ - wheelR) - propR;
const hubClearRest = propX * Math.sin(restPitch) - (mainX * Math.sin(restPitch) + (mainZ - wheelR) * Math.cos(restPitch)) - propR;
/* How short the Pitts is on its wheels: the CG's distance behind the
 * main wheels' contact over the wheelbase (what the tailwheel has to hold
 * a swerve against), and the yaw inertia over the weight's arm there. */
const cgBehindMains = mainW;
const wheelbase = mainW - tailW;

const vertical = (() => {
  let lo = 0, hi = Vp;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (T(mid, 1) > W + 0.5 * rho * mid * mid * S * CD0) lo = mid; else hi = mid;
  }
  return lo;
})();
function takeoff(mu2, Vtail, vRot) {
  let V = 0, x = 0, t = 0, a = restPitch, rot = null;
  const dt = 0.001;
  while (t < 30) {
    const q = 0.5 * rho * V * V;
    if (V >= vRot && rot === null) {
      const stick = 2.5 * (7 / DEG);
      rot = longitudinal(vRot).step(eff((expo * stick * stick * stick + (1 - expo) * stick) * throwE)).peakDegS / DEG;
    }
    if (rot !== null) a = Math.min(10 / DEG, a + rot * dt);
    else a = V < Vtail ? restPitch : 3 / DEG;
    const CLg = CLa * a;
    if (rot !== null && q * S * CLg >= W) return { x, t, V, rotDegS: rot * DEG };
    const CDg = CD0 + kInduced * CLg * CLg;
    const d = Math.min(1, Math.max(0.02, t));
    const acc = (T(V, d) - q * S * CDg - mu2 * Math.max(0, W - q * S * CLg)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return null;
}

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const lat = lateral(Vtrim);
const lon = longitudinal(Vtrim);
const m4 = motorOn(4);
const alphaFullUp = (Cm0 + Cmde * eff(throwE)) / -Cma;
const rows = [
  ['top wing: b, c, S, AR; bottom wing', `${f(b1)} ${f(c1)} ${f(S1, 4)} ${f(b1 * b1 / S1, 3)}; ${f(b2)} ${f(c2)} ${f(S2, 4)} ${f(b2 * b2 / S2, 3)}`],
  ['S ref, exposed sum, W/S N/m^2, cbar, AR on S', `${f(S)} ${f(S1 + S2 - 0.016, 4)} ${f(W / S, 2)} ${f(cbar, 4)} ${f(AR, 3)}`],
  ['gap, stagger of the quarter chords, G/b', `${f(gap, 4)} ${f(stagger, 4)} ${f(gOverB, 4)}`],
  ['Trefftz: one wing against L^2/(pi q b^2)', f(selfCheck, 5)],
  ['sigma: Trefftz, Prandtl chart fit', `${f(sigma, 4)} ${f(sigmaFit, 4)}`],
  ['Munk span factor k (optimum split), carried split', `${f(kMunk, 4)} ${f(kSpanCarried, 4)}`],
  ['bound vortex: kappa top, bottom rad per CL', `${f(kappa1, 5)} ${f(kappa2, 5)}`],
  ['A1, A2 (own CL per rad), a_w cell, a_w monoplane', `${f(A1, 4)} ${f(A2, 4)} ${f(aw, 4)} ${f(awMono, 4)}`],
  ['bip_w (lift shares), bip_r (own CL over the cell\'s)', `${f(share1, 4)} ${f(share2, 4)}; ${f(r1, 4)} ${f(r2w, 4)}`],
  ['bip_m (CL per CL of the other lost), bip_x (per chord)', `${f(bipM[0], 4)} ${f(bipM[1], 4)}; ${f(bipX[0], 4)} ${f(bipX[1], 4)}`],
  ['bip_ki, bip_kx', `${f(bipKi[0], 5)} ${f(bipKi[1], 5)}; ${f(bipKx[0], 5)} ${f(bipKx[1], 5)}`],
  ['k_induced: biplane at its split, monoplane of S and b1', `${f(kInduced, 5)} ${f(kMono, 5)}`],
  ['ac: top, bottom, cell (m ahead of the CG)', `${f(xAc1, 4)} ${f(xAc2, 4)} ${f(xAc, 4)}`],
  ['tail: AR_t, a_t, l_h, V_H, dε/dα DATCOM, far field (AR_e)', `${f(ARt, 3)} ${f(at, 4)} ${f(lh, 4)} ${f(VH, 4)} ${f(deda, 4)} ${f(dedaFar, 4)} (${f(ARe, 3)})`],
  ['CLα, h_ac, static margin, fus', `${f(CLa, 4)} ${f(hAc, 4)} ${f(SM, 4)} ${f(fusCma, 4)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq, 3)} ${f(Cmde, 4)} ${f(CLde, 4)}`],
  ['fin: AR_v, a_v, V_V; CYβ, Cnβ (fus), Cnr', `${f(arV, 3)} ${f(av, 4)} ${f(VV, 5)}; ${f(CYb, 4)} ${f(Cnb, 4)} (${f(CnbFus, 4)}) ${f(Cnr, 4)}`],
  ['Clβ (fin, dihedral), Clp, Clδa', `${f(Clb, 4)} (${f(ClbFin, 4)} ${f(ClbDih, 4)}) ${f(Clp, 4)} ${f(Clda, 4)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['throws high a e r deg; low; tau a e r', `${f(throwA * DEG, 2)} ${f(throwE * DEG, 2)} ${f(throwR * DEG, 2)}; ${f(lowA * DEG, 2)} ${f(lowE * DEG, 2)} ${f(lowR * DEG, 2)}; ${f(tauA)} ${f(tauE)} ${f(tauR)}`],
  ['mass: sum kg, pack x m', `${f(mSum, 4)} ${f(packX, 4)}`],
  ['inertia Ixx Iyy Izz', `${f(Ixx, 5)} ${f(Iyy, 5)} ${f(Izz, 5)}`],
  ['motor 3S static: rpm, N m, N, A; T/W', `${f(nStatic, 0)} ${f(Qs, 4)} ${f(Ts, 3)} ${f(Is, 1)}; ${f(Ts / W, 3)}`],
  ['rpm NL, pitch speed, torque arm, prop J', `${f(rpmNL, 0)} ${f(Vp, 3)} ${f(torqueArm, 5)} ${f(propJ, 7)}`],
  ['4S: rpm, N, A, rpm NL, pitch speed', `${f(m4.rpm, 0)} ${f(m4.thrust, 3)} ${f(m4.current, 1)} ${f(m4.rpmNL, 0)} ${f(m4.vp, 3)}`],
  ['P1 level at 75 (the trim), 50, 100 percent', `${f(level(0.75), 2)} ${f(level(0.5), 2)} ${f(level(1), 2)}`],
  ['P2 stall m/s, cell CLmax, alpha of the top wing\'s stall deg', `${f(Vs, 3)} ${f(CLmaxCell, 4)} ${f(CLmaxWing / (r1 * CLa) * DEG, 3)}`],
  ['   the bottom wing\'s stall alpha deg', f(CLmaxWing / (r2w * CLa) * DEG, 3)],
  ['P3 glide L/D at 1.4 Vs; best at; the monoplane\'s at 1.4 Vs', `${f(ld(1.4 * Vs), 3)} ${f(LDmax, 3)} ${f(Vmd, 2)}; ${f(ldMono(1.4 * Vs), 3)}`],
  ['P5 roll pb/2V high, deg/s at 15, 20 m/s; low rate pb/2V', `${f(Clda * eff(throwA) / -Clp, 4)} ${f(rollAt(15, throwA) * DEG, 0)} ${f(rollAt(20, throwA) * DEG, 0)}; ${f(Clda * eff(lowA) / -Clp, 4)}`],
  ['   full size S-1S four ailerons 220 deg/s at 54 m/s: pb/2V', f(220 / DEG * 5.28 / (2 * 54), 4)],
  ['P6 a 0.15 stick of up at the trim, short of the blend: time to the peak s, deg/s; its alpha deg', (() => { const d = eff((expo * 0.15 ** 3 + (1 - expo) * 0.15) * throwE); const r = lon.step(d); return `${f(r.at, 3)} ${f(r.peakDegS, 0)}; ${f((Cm0 + Cmde * d) / -Cma * DEG, 2)}`; })()],
  ['   phugoid s zeta; short period s zeta', `${f(lon.phugoid && lon.phugoid.period, 2)} ${f(lon.phugoid && lon.phugoid.zeta)}; ${f(lon.short && lon.short.period, 3)} ${f(lon.short && lon.short.zeta)}`],
  ['   lateral: spiral, roll tau s, Dutch roll wn zeta', `${f(lat.spiral, 4)} ${f(lat.rollTau, 4)} ${lat.dutch ? `${f(lat.dutch.wn, 2)} ${f(lat.dutch.zeta)}` : 'none'}`],
  ['alpha at full up, linear, deg; the top wing\'s stall', `${f(alphaFullUp * DEG, 2)} ${f(CLmaxWing / (r1 * CLa) * DEG, 2)}`],
  ['   half stick up alpha deg', f((Cm0 + Cmde * eff((expo * 0.125 + (1 - expo) * 0.5) * throwE)) / -Cma * DEG, 2)],
  ['   low rate full up alpha deg', f((Cm0 + Cmde * eff(lowE)) / -Cma * DEG, 2)],
  ['P7 vertical at full throttle m/s', f(vertical, 2)],
  ['rest: pitch deg, CG height m, tail share', `${f(restPitch * DEG, 3)} ${f(cgHeight, 4)} ${f(tailShare, 4)}`],
  ['   main axle x z r, tail axle x z r (m, body)', `${f(mainX, 4)} ${f(mainZ, 4)} ${f(wheelR, 4)}; ${f(tailX, 4)} ${f(tailZ, 4)} ${f(tailR, 4)}`],
  ['   k main, c main, k tail, c tail, tail m_eff', `${f(kMain, 0)} ${f(cMain, 2)} ${f(kTail, 0)} ${f(cTail, 2)} ${f(mTail, 4)}`],
  ['   prop tip clearance level, at rest', `${f(hubClearLevel, 4)} ${f(hubClearRest, 4)}`],
  ['   CG behind the mains, wheelbase, ratio', `${f(cgBehindMains, 4)} ${f(wheelbase, 4)} ${f(cgBehindMains / wheelbase, 4)}`],
  ['stall arms: ac (CG behind the cell ac), cp, dw', `${f(-hAc, 4)} ${f((xAc - 0.15 * cbar) / cbar * -1, 4)} ${f(eta * VH * at * deda / aw, 4)}`],
  ['take off, grass, rotated at 1.2 Vs', JSON.stringify(takeoff(0.08, 6, 1.2 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['taxi radius at full rudder, tailwheel at half the rudder', f(wheelbase / Math.tan(throwR * 0.5), 3)],
  ['   taxi throttle: static thrust 1.3 times the rolling resistance, 0.08 W', f(Math.sqrt(1.3 * 0.08 * W / Ts), 3)],
  ['slipstream: tail CLα, Cmα, a0; fin Cnβ, Cnr, CYβ, Clβ', `${f(slipCla, 4)} ${f(slipCma, 4)} ${f(slipA0, 4)}; ${f(slipCnb, 4)} ${f(slipCnr, 4)} ${f(slipCyb, 4)} ${f(slipClb, 4)}`],
  ['   at the trim, 3/4 throttle: dp Pa, rw m, fh, fv; elevator over the free stream', `${f(washTrim.dp, 1)} ${f(washTrim.rw, 4)} ${f(washTrim.fh)} ${f(washTrim.fv)}; ${f(elevGain, 3)}`],
  ['   alpha at full up and full down with the wash, linear deg', `${f((Cm0 + elevGain * Cmde * eff(throwE)) / -Cma * DEG, 2)} ${f((Cm0 - elevGain * Cmde * eff(throwE)) / -Cma * DEG, 2)}`],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(60)} ${v}`);
}
