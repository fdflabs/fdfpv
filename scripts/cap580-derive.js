/*
 * cap580-derive.js: the arithmetic behind docs/CAP580-STAGE1.md, from
 * Extreme Flight's data sheet for the 67 in CAP 580, T-Motor's measured
 * bench table for its stock AM670 520 kV on the 18 x 8, APC's data for
 * that prop and the photographs of the aircraft, to every coefficient of
 * FW_CAP1702, its PLANT_TABLE row and every derived band in
 * tests/cap580-thresholds.json. It never loads the plant: this is what
 * the plant is checked against, so it has to stand apart from it. Harness
 * arithmetic in JS maths, which is allowed here because nothing it prints
 * is hashed.
 *
 *   node scripts/cap580-derive.js           print the derivation
 *   node scripts/cap580-derive.js --check   also fail when a constant in
 *                                           plant_wing.c, plant.c or the
 *                                           thresholds differs from it
 *   node scripts/cap580-derive.js --write-bands   rewrite the bands'
 *                                           centres and edges from it
 *
 * Run with npm run cap580:derive.
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

import { fuselageRatio } from './lib/crossflow.js';
import { washKw } from './lib/washcontrol.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { shares, wash as washOf } from './lib/wash.js';
import { SEAT_GATES, wingProp, wingSeat } from './lib/propcurve.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = 180 / Math.PI;
const rho = 1.225;
const g = 9.81;
const IN = 0.0254;

/*
 * THE AIRCRAFT, Extreme Flight's data sheet for the 67 in CAP 580
 * (DATASHEET_67_CAP, docs/CAP580-STAGE1.md has the URL): span 67 in,
 * length 66 in, wing 860 sq in, weight 8 lb, the CG "center of wing tube
 * for maiden, sport and precision flight", a 6S 4000 to 5000 mAh pack of
 * 600 to 750 g. The product page gives 8 to 8.5 lb; the sheet's 8 lb is
 * taken as the flying weight on the stock pack, a 6S 4500, Motion RC's
 * Admiral at 652 g (configs/power.js F16_6S has its URL), in the middle of
 * the sheet's range.
 */
const b = 67 * IN, length = 66 * IN, S = 860 * IN * IN, m = 8 * 0.45359237, W = m * g, AR = b * b / S;
const packM = 0.652;


/*
 * THE OUTLINE, MEASURED OR FITTED: Extreme Flight publishes no drawing and
 * no front view, so the planform, the tail, the gear and the stations are
 * taken off its product photographs (the URLs in docs/CAP580-STAGE1.md),
 * each one marked. MEASURED is read off a photograph at the scale named;
 * FITTED is chosen where a photograph only bounds it, with the reason.
 *
 * The side view, IMG_7289: the spinner's tip to the rudder's trailing edge
 * is the sheet's 66 in, 0.991 mm a pixel along the thrust line (the 76 mm
 * spinner reads 82: take 8 to 10 percent on everything off it). The
 * underside view, IMG_7296: tip to tip is the sheet's 67 in, but its
 * chords are foreshortened about two to one, so only ratios are read off
 * it. The rear view from above, IMG_7299, gives a second taper and the
 * tail's shares; its tail is nearer the camera than its wing, so a tail
 * length off it is an upper bound.
 */
const O = {
  /* The wing. Taper: 0.45 off IMG_7296, 0.58 to 0.62 off IMG_7299, FITTED
   * 0.50 between them; with the sheet's 860 sq in on the centreline
   * trapezoid that is a root of 0.435 m and a tip of 0.217. The quarter
   * chord unswept (IMG_7296, the leading edge back and the trailing edge
   * forward), so the leading edge is a quarter of the chords' difference
   * back at the tip. The ailerons from 0.115 m out (the fuselage's side is
   * 0.085) to the tip, 0.385 of the chord inboard to 0.47 at the tip
   * (IMG_7296), 0.43 taken. */
  cr: 0.4346, ct: 0.2173, leSweepTip: 0.0543, ailIn: 0.115, cfA: 0.43,
  /* The CG, "center of wing tube" (the sheet): the 20 mm tube's station is
   * not published and no photograph shows it, FITTED at 0.30 of the root
   * chord, 0.130 m behind the root's leading edge, which puts the CG at
   * 0.31 of the mean chord. */
  cgBehindRootLE: 0.130,
  /* The prop's disc 0.56 m ahead of the CG: the root's leading edge 0.47 m
   * behind the spinner's tip (IMG_7289, at the gear leg), the CG 0.13
   * behind it, the disc 0.04 behind the tip. The wing's chord plane 0.085
   * m under the thrust line (IMG_7289, off the side force generators'
   * bolts, +/- 25 mm). */
  propX: 0.560, zWing: 0.085,
  /* The stabiliser. Its root chord 0.29 m (IMG_7289, its leading edge 1.37
   * m behind the spinner's tip to the trailing edge at 1.66), its taper
   * 0.68 to 0.77 (IMG_7296, IMG_7299), 0.22 at the tip. Its span over the
   * wing's is 0.60 and 0.65 off the two views, both magnified by the
   * tail's nearness; FITTED at 0.44, 0.75 m, the 0.60 over a near tail's
   * magnification of about 1.35. The quarter chord 0.85 m behind the CG.
   * The elevators 0.65 to 0.70 of the chord (IMG_7296, IMG_7299), 0.67. */
  bh: 0.750, chRoot: 0.290, chTip: 0.220, lh: 0.850, cfE: 0.67,
  /* The fin and rudder (IMG_7289): 0.277 m over the thrust line and 0.075
   * under it; 0.067 m^2 from its outline (0.10 m of chord at the top, 0.27
   * at the fuselage's top, the rudder's 0.135 under it); the rudder 0.73
   * of the chord at the top and the whole of it under the fuselage, 0.70
   * of the area; its quarter chord 0.90 m behind the CG. */
  hvUp: 0.277, hvDn: 0.075, Sv: 0.067, lv: 0.900, cfR: 0.70,
  /* The fuselage at the wing: 0.18 m deep (IMG_7289, 179 mm at the
   * canopy's station), 0.15 m wide (under IMG_7296's 0.169 upper bound). */
  fusD: 0.180, fusW: 0.150,
  /* The gear, the 67 in line's carbon legs (Extreme Flight sells one set
   * for the 67 in Laser, Extra, Edge, CAP and Slick). The main axles 0.48
   * m behind the spinner's tip, 0.12 ahead of the CG, and 0.31 under the
   * thrust line (IMG_7289, +/- 30 mm); the wheels in their pants, FITTED
   * 2.5 in (the size is not published and the pants hide them); the track
   * 0.38 m, under IMG_7296's 0.418 upper bound. The tailwheel's axle 1.54
   * m behind the tip, 0.127 m under the line, a 22 mm wheel (IMG_7289). */
  mainX: 0.120, mainZ: -0.310, mainR: 0.0318, track: 0.380,
  tailX: -0.941, tailZ: -0.127, tailR: 0.011,
};
const { cr, ct, ailIn, cfA, cfE, cfR, Sv, lv, hvUp, hvDn, zWing, fusD, fusW, bh, lh, propX } = O;
const lam = ct / cr;
/* The trapezoid on the measured chords against the sheet's area: the
 * check on the planform's measurement, printed below. */
const Strap = b * (cr + ct) / 2;
const chordAt = (y) => cr + (ct - cr) * Math.abs(y) / (b / 2);
const MAC = (2 / 3) * cr * (1 + lam + lam * lam) / (1 + lam);
const yMAC = (b / 6) * (1 + 2 * lam) / (1 + lam);
const macLE = O.leSweepTip * yMAC / (b / 2);
const hCG = (O.cgBehindRootLE - macLE) / MAC;
const c = MAC;
const aileronOut = b / 2;
const Sh = bh * (O.chRoot + O.chTip) / 2;
const zv = (hvUp - hvDn) / 2;
const arVgeo = (hvUp + hvDn) ** 2 / Sv;
const arV = 1.55 * arVgeo; /* the stabiliser and the fuselage end plate it, Roskam's usual factor, as the Extra's */
const fusL = length - 0.035; /* the spinner's tip to the rudder's trailing edge, less the spinner's cone ahead of the cowl */
const fusVol = fusL * fusW * fusD * 0.6;
const eta = 0.9;

/*
 * The section and the drag. No maker publishes the model's section; the
 * full size CAP 231's is the V16F, 16 percent (Lednicer), so a thick
 * symmetric section, and the stall is the Extra's measured one
 * (docs/FLIGHTMODEL.md, "The Extra's stall from a measured section"):
 * Timmer's NACA 0018 (Wind Engineering 32(6), 2008), CL max 0.988 at 11.6
 * deg at Re 1.5e5 and 1.056 at 15.1 deg at 3e5, the wing's 0.9 of the
 * section's (Raymer, Aircraft Design, sec. 12.4) and its peak the
 * section's plus the induced angle CL / (pi A e), straight between the two
 * Reynolds numbers on the mean chord as the plant takes them (stall_re),
 * the stall angle on the wing's own slope (cl_alpha_wing). The CAP flies
 * above 3e5 from 14 m/s, where the plant holds the 3e5 figures. CD0 and e
 * are the Extra's class, ESTIMATED: spatted gear on carbon legs, open
 * hinge gaps, a thick wing, and the side force generators on the tips.
 */
const CD0 = 0.045, e = 0.75, k = 1 / (Math.PI * e * AR);
const AIR_MU = 1.789e-5; /* plant_wing.c's */
const STALL_RE = [1.5e5, 3.0e5];
const STALL_CLMAX = [0.9 * 0.988, 0.9 * 1.056];
const STALL_PEAK = [11.6 / DEG + STALL_CLMAX[0] / (Math.PI * AR * e), 15.1 / DEG + STALL_CLMAX[1] / (Math.PI * AR * e)];
const reOf = (V) => rho * V * MAC / AIR_MU;
const clmaxAt = (V) => {
  const re = reOf(V);
  const x = re <= STALL_RE[0] ? 0 : (re >= STALL_RE[1] ? 1 : (re - STALL_RE[0]) / (STALL_RE[1] - STALL_RE[0]));
  return STALL_CLMAX[0] + x * (STALL_CLMAX[1] - STALL_CLMAX[0]);
};
/* The stall's speed on the CL max at its own Reynolds number. */
let VsRe = 10;
for (let i = 0; i < 50; i += 1) VsRe = Math.sqrt(2 * W / (rho * S * clmaxAt(VsRe)));
const reStall = reOf(VsRe);
const CLmax = clmaxAt(VsRe);
const blend = 3 / DEG;

/*
 * The throws, the data sheet's high rates, in degrees: aileron 38 up and
 * 34 down ("4 deg differential"), elevator 50 each way, rudder 50 to 55.
 * The plant's aileron is one throw each way: the mean of the up and the
 * down, 36 deg (the differential is listed for the flight model lane).
 * The rudder the middle of the range, 52.5. Expo: the sheet's high rates
 * give 50 to 60 percent on the elevator, 65 to 70 on the ailerons and 60
 * to 80 on the rudder; the plant has one figure for all three, 0.60, the
 * one in or at the edge of all three ranges (the ailerons' is 5 short).
 */
const throwA = 36 / DEG, throwE = 50 / DEG, throwR = 52.5 / DEG;
const EXPO = 0.60;

const kPrime = (d) => { const x = d * DEG; return x < 15 ? 1 : 4e-7 * x ** 4 - 7e-5 * x ** 3 + 0.0047 * x ** 2 - 0.1453 * x + 2.3167; };
const tauOf = (f) => { const th = Math.acos(1 - 2 * (1 - f)); return 1 - (th - Math.sin(th)) / Math.PI; };
const tauA = tauOf(cfA) * kPrime(throwA), tauE = tauOf(cfE) * kPrime(throwE), tauR = tauOf(cfR) * kPrime(throwR);

/* The coefficients, Nelson's forms as the Extra's. */
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const deda = 2 * aw / (Math.PI * AR);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const fusCma = 0.006 * fusW * fusW * fusL / (c * S) * DEG; /* Raymer eq. 16.25, K_fus 0.006 per deg */
const hn = 0.25 + VH * eta * (at / aw) * (1 - deda) - fusCma / CLa;
const SM = hn - hCG, Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c, Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
/* The trim: hands off level at its sport pace. 18 m/s, the Extra's 15
 * scaled by the square root of the wing loadings (64 against 40 N/m^2),
 * the speed at the same lift coefficient. */
const Vtrim = 18, CLtrim = 2 * W / (rho * Vtrim * Vtrim * S), Cm0 = -Cma * CLtrim / CLa;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const CYb = -av * Sv / S - 0.11;
const Cnb = av * VV - 1.3 * fusVol / (S * b);
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/* No dihedral, a mid low wing: the fin's roll and the low wing's (DATCOM,
 * 1.2 sqrt(A) (z_w / b)(2 D / b)), as the Extra's. */
const ClbFin = -av * (Sv / S) * (zv / b), ClbLow = 1.2 * Math.sqrt(AR) * (zWing / b) * (2 * fusD / b);
const Clb = ClbFin + ClbLow;
const Clp = -aw * (1 + 3 * lam) / (12 * (1 + lam));
function integrate(f, a, bb, n = 4000) { let s = 0; for (let i = 0; i < n; i += 1) { const y = a + (bb - a) * (i + 0.5) / n; s += f(y) * (bb - a) / n; } return s; }
const Clda = 2 * aw * tauA * integrate((y) => chordAt(y) * y, ailIn, aileronOut) / (S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
/* The ailerons' share of each stall strip, the plant's four a side at an
 * eighth, three, five and seven eighths of the semispan. */
const stripTau = [0, 1, 2, 3].map((i) => {
  const y0 = i * b / 8, y1 = (i + 1) * b / 8;
  return tauA * Math.max(0, Math.min(y1, aileronOut) - Math.max(y0, ailIn)) / (y1 - y0);
});
/* The strips' chords over the mean, the taper's (scripts/stall-derive.js's form). */
const stripC = [0.125, 0.375, 0.625, 0.875].map((eta2) => (1 - (1 - lam) * eta2) / ((1 + lam) / 2));

/*
 * THE MOTOR AND PROP, MEASURED: T-Motor's bench table for the AM670 520 kV
 * on the 18 x 8 at 6S (LIG Power's copy of T-Motor's 2017 test platform;
 * the URL is in docs/CAP580-STAGE1.md), the stock power system Extreme
 * Flight's combo names. Twelve throttle points, each throttle percent,
 * volts, amps, watts, rpm, N m and grams.
 */
export const BENCH = [
  [40, 23.58, 13.44, 316.98, 4303, 0.471, 2183],
  [45, 23.52, 17.20, 404.44, 4728, 0.569, 2649],
  [50, 23.40, 22.11, 517.21, 5182, 0.689, 3212],
  [55, 23.29, 27.79, 647.05, 5618, 0.816, 3802],
  [60, 23.16, 34.44, 797.57, 6043, 0.954, 4433],
  [65, 23.01, 41.91, 964.42, 6456, 1.101, 5110],
  [70, 22.84, 50.41, 1151.29, 6860, 1.256, 5823],
  [75, 22.64, 59.79, 1353.52, 7236, 1.405, 6534],
  [80, 22.41, 71.29, 1597.29, 7633, 1.589, 7361],
  [85, 22.13, 83.74, 1852.97, 8001, 1.762, 8137],
  [90, 21.88, 95.82, 2096.23, 8314, 1.916, 8822],
  [100, 21.55, 111.11, 2394.77, 8636, 2.097, 9617],
];
const G0 = 9.80665;
const full = BENCH[BENCH.length - 1];
const Ts = full[6] / 1000 * G0, Qs = full[5], nStatic = full[4], Is = full[2];
const torqueArm = Qs / Ts;
/* The plant shows 0.85 of rpm_no_load at full throttle (plant_wing.c's
 * rule), so the no load figure is the one that shows the bench's 8,636. */
const rpmNL = nStatic / 0.85;
/* The bench's source sags 0.0208 ohm across its rows (23.58 V at 13.4 A
 * to 21.55 V at 111.1 A): taken as the pack's, 6S, a cell's share. */
const rCell = (BENCH[0][1] - full[1]) / (full[2] - BENCH[0][2]) / 6;
/* The throttle the bench lifts the weight at: the grams through the
 * twelve rows, linear between rows. */
function benchThrottleFor(grams) {
  for (let i = 1; i < BENCH.length; i += 1) {
    const [p0, , , , , , g0] = BENCH[i - 1], [p1, , , , , , g1] = BENCH[i];
    if (grams <= g1) return (p0 + (p1 - p0) * (grams - g0) / (g1 - g0)) / 100;
  }
  return 1;
}
/* The rpm fraction against the throttle the bench gives. */
const benchRpmFrac = BENCH.map((r) => [r[0] / 100, r[4] / nStatic]);
/*
 * THE THROTTLE CURVE, measured (FixedWingParams.throttle_rpm): the steady
 * speed over full at the stick's 0, 0.1, ... 1, which the plant turns into
 * the ESC duty Drela's motor settles on (plant_wing.c). 0.4 to 1 are the
 * bench's rows (0.9 its 90 percent row, 0.95 not needed). Under 40 percent
 * T-Motor measured nothing: FITTED, a straight line from the ESC's stop at
 * 0 to the 40 percent row, so the hover (about 0.53) and everything flown
 * over 0.4 is measured.
 */
const benchAt = (pct) => BENCH.find((r) => r[0] === pct)[4] / nStatic;
const THROTTLE_RPM = [0, benchAt(40) / 4, 2 * benchAt(40) / 4, 3 * benchAt(40) / 4, benchAt(40), benchAt(50), benchAt(60), benchAt(70), benchAt(80), benchAt(90), 1];
/* The prop's speed share at a stick, and the stick for a speed share, on
 * the pack the gates seat: the curve's speed at the bench's voltage, the
 * duty that holds it times the loaded pack over v_meas, through the
 * motor's law (scripts/lib/propcurve.js wingSeat, plant_wing.c
 * power_duty). The table's own throttle_rpm is the curve above. */
const seat = wingSeat('FW_CAP1702');
const nAt = (stick, V) => seat.at(SEAT_GATES, stick, V).n;
const stickFor = (n, V = 0) => seat.stickFor(SEAT_GATES, n, V);
/* Right thrust, 2.5 deg (the 67 in line's build guide and air-rc), the
 * plant's thrust_yaw. */
const THRUST_YAW = 2.5 / DEG;

/*
 * APC's PER3_18x8E (the stand in for the AMZ carbon 18 x 8 in forward
 * flight; the URL in docs/CAP580-STAGE1.md): static, 8,000 rpm 1.681 N m
 * and 77.23 N, 9,000 rpm 2.155 N m and 99.13 N, which at the bench's
 * 8,636 rpm interpolate (as the square of the rpm) to within a few
 * percent of the bench's own, the check that the file stands in for the
 * carbon blade. Its thrust against the airspeed at 9,000 rpm, every row
 * from standing to the zero thrust speed, scaled to the bench's rpm (the
 * speed as the rpm, the thrust as its square), is the curve the plant now
 * flies: FW_CAP1702's axial_curve and torque_curve, APC's file over its
 * advance ratio (npm run prop:curves -- wings, docs/FLIGHTMODEL.md "The
 * prop's curves"), on the geometric pitch speed, the bench's 8,636 rpm
 * times the 8 in. The derivation reads the table's curve (scripts/lib/
 * propcurve.js) and prints APC's own row beside it as the check.
 */
const APC9000 = [
  [0.00, 99.128], [1.39, 97.372], [2.78, 95.495], [4.17, 93.494], [5.56, 91.363], [6.95, 89.099], [8.34, 86.698],
  [9.72, 84.155], [11.11, 81.470], [12.50, 78.639], [13.89, 75.662], [15.28, 72.538], [16.67, 69.263], [18.06, 65.837],
  [19.45, 62.271], [20.84, 58.577], [22.23, 54.765], [23.62, 50.846], [25.01, 46.830], [26.39, 42.727], [27.78, 38.549],
  [29.17, 34.307], [30.56, 30.013], [31.95, 25.682], [33.34, 21.328], [34.73, 16.970], [36.12, 12.627], [37.51, 8.322],
  [38.90, 4.077], [40.29, -0.140],
];
const apcStatic = (n) => {
  const kf = (r, t) => t / (r * r);
  const f8 = kf(8000, 77.233), f9 = kf(9000, 99.128);
  return (f8 + (n - 8000) / 1000 * (f9 - f8)) * n * n;
};
const apcQStatic = (n) => {
  const f8 = 1.681 / 8000 ** 2, f9 = 2.155 / 9000 ** 2;
  return (f8 + (n - 8000) / 1000 * (f9 - f8)) * n * n;
};
const sc = nStatic / 9000;
const apcCurve = APC9000.map(([v, t]) => [v * sc, t * sc * sc]);
const apcAt = (V) => {
  for (let i = 1; i < apcCurve.length; i += 1) {
    const [v0, t0] = apcCurve[i - 1], [v1, t1] = apcCurve[i];
    if (V <= v1) return t0 + (t1 - t0) * (V - v0) / (v1 - v0);
  }
  return 0;
};
/* The drag at a speed, the plant's polar, before the line exists. */
const dragAt = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
/* The geometric pitch speed: the bench's full rpm times the 8 in. */
const Vp = nStatic / 60 * 8 * IN;
const prop = wingProp('FW_CAP1702');
const T = (V, d) => Math.max(0, prop.thrust(Ts, V, d));
let vTopApc = 10;
for (let i = 0; i < 80; i += 1) vTopApc = apcAt(vTopApc) > dragAt(vTopApc) ? vTopApc + 30 / 2 ** (i + 1) : vTopApc - 30 / 2 ** (i + 1);
const tTopApc = apcAt(vTopApc) * Ts / apcCurve[0][1];
/* The prop's inertia, ESTIMATED: a carbon 18 in blade of about 60 g
 * (T-Motor lists none for the AMZ), a tapered blade's 0.7 of a rod's
 * m D^2 / 12, and the AM670's 63.5 mm can, about 0.16 kg at its radius. */
const propR = 18 * IN / 2;
const propJ = 0.7 * 0.060 * (2 * propR) ** 2 / 12 + 0.16 * 0.029 * 0.029;
/* The pack, the 6S 4500 above. */
const packMah = 4500;

/*
 * The mass and its moments of inertia, built from the parts, ESTIMATED,
 * each part's class; the shell takes what the sheet's 8 lb leaves; the
 * pack slid to the sheet's CG.
 */
const parts = [
  { name: 'AM670 motor and mount, 416 g, the 18 x 8 and the 76 mm spinner', m: 0.416 + 0.060 + 0.040, x: propX - 0.04, z: 0 },
  { name: 'AM116 ESC', m: 0.110, x: propX - 0.20, z: -0.03 },
  { name: 'receiver, switch, wiring', m: 0.060, x: 0.0, z: 0 },
  { name: 'four servos (EF/Theta 989s, about 60 g each)', m: 0.240, x: -0.10, z: 0 },
  { name: 'stabiliser and elevators', m: 0.120, x: -lh, z: 0 },
  { name: 'fin and rudder', m: 0.080, x: -lv, z: zv },
  { name: 'carbon main gear, pants, wheels', m: 0.180, x: O.mainX, z: O.mainZ * 0.6 },
  { name: 'tailwheel', m: 0.030, x: O.tailX, z: O.tailZ },
  { name: 'canopy and pilot', m: 0.080, x: -0.05, z: 0.10 },
];
const wingM = 0.600; /* two balsa and ply panels with their covering, the carbon tube, the SFGs */
let known = wingM;
for (const p of parts) known += p.m;
const shellM = (m - packM) - known;
const fusX = [-(length - O.propX - 0.035) + 0.0, O.propX];
parts.push({ name: 'fuselage, cowl', m: shellM, x0: fusX[0] + 0.2, x1: fusX[1], z: 0.0 });
const xOf = (p) => (p.x0 === undefined ? p.x : (p.x0 + p.x1) / 2);
const x2Of = (p) => (p.x0 === undefined ? p.x * p.x : (p.x0 * p.x0 + p.x0 * p.x1 + p.x1 * p.x1) / 3);
const wingX = -(O.cgBehindRootLE - 0.45 * cr);
let mx = wingM * wingX;
for (const p of parts) mx += p.m * xOf(p);
const packX = -mx / packM;
const wingIxx = wingM * integrate((y) => chordAt(y) * y * y, 0, b / 2) / integrate(chordAt, 0, b / 2);
let Ixx = wingIxx + wingM * zWing * zWing, Iyy = wingM * (c * c / 12 + zWing * zWing + wingX * wingX), Izz = wingIxx + wingM * (c * c / 12 + wingX * wingX);
for (const p of parts) {
  Ixx += p.m * p.z * p.z;
  Iyy += p.m * (x2Of(p) + p.z * p.z);
  Izz += p.m * x2Of(p);
}
Iyy += packM * packX * packX;
Izz += packM * packX * packX;
Ixx += 0.180 * (O.track / 2) ** 2;

/* Performance, the plant's polar. */
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
/* Level at a stick: the prop at the curve's speed for it. */
const level = (stick) => {
  let lo = 9, hi = 50;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, nAt(stick, mid)) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
const pb2v = Clda * throwA / -Clp;
const rollAt = (V) => pb2v * 2 * V / b;

/* THE 3D REGIME, as the Extra's derivation takes it. The plant's hover
 * stick is sqrt(W / Ts) (its thrust goes as the duty squared standing);
 * the bench's is where its thrust meets the weight. */
/* The prop speed that holds the weight is sqrt(W / Ts) of full; the
 * stick that turns it there is the curve's, the bench's own rows. */
const hoverDuty = stickFor(Math.sqrt(W / Ts));
const hoverBench = benchThrottleFor(W / G0 * 1000);
let vClimb = 0;
for (let V = 0; V < 40; V += 0.001) { if (T(V, nAt(1, V)) - W - 0.5 * rho * V * V * S * CD0 <= 0) { vClimb = V; break; } }

const slipA0 = CLtrim / CLa;
const slip = shares({ propR, bh, hv: [hvUp, hvDn], ya: [ailIn, aileronOut], at, Sh, S, eta, deda, VH, av, VV, lv, b, Sv, ClbFin, a0: slipA0 });
const hov = washOf(slip, W, 0);

/* The air a slow aircraft turns through, Hoerner's flat plate, C_N 1.17,
 * the Extra's sums. */
const CN = 1.17;
const plate = (chord, a, bb) => 0.5 * rho * CN * integrate((r) => chord(r) * Math.abs(r) ** 3, a, bb);
const rotK = [
  plate(chordAt, -b / 2, b / 2) + plate(() => Sh / bh, -bh / 2, bh / 2) + plate(() => Sv / (hvUp + hvDn), -hvDn, hvUp),
  plate(() => fusW, fusX[0], fusX[1]) + 0.5 * rho * CN * Sh * lh ** 3 + plate(() => b, -c / 2, c / 2),
  plate(() => fusD, fusX[0], fusX[1]) + 0.5 * rho * CN * Sv * lv ** 3 + plate(() => b, -c / 2, c / 2) * 0.2,
];
/* The side crossflow drag area, Allen and Perkins' 1.2 times their eta of
 * 0.7 on the fuselage's side, the 1.2 taken over to the drawn rounded
 * box's sections as the Extra's (scripts/lib/crossflow.js, NACA TN 3038).
 * The sections: station aft of the spinner's tip, half width, top,
 * bottom, squareness, m, the drawn model's FUSE (src/render/capcraft.js). */
const FUSE = [
  [0.045, 0.040, 0.040, -0.042, 2.0], [0.065, 0.060, 0.058, -0.068, 2.1], [0.110, 0.076, 0.070, -0.098, 2.4],
  [0.180, 0.081, 0.074, -0.118, 2.8], [0.300, 0.080, 0.077, -0.124, 3.2], [0.450, 0.077, 0.077, -0.121, 3.6],
  [0.600, 0.075, 0.072, -0.113, 3.8], [0.800, 0.065, 0.070, -0.096, 3.6], [1.000, 0.051, 0.064, -0.078, 3.2],
  [1.200, 0.035, 0.056, -0.060, 2.8], [1.400, 0.018, 0.046, -0.043, 2.4], [1.530, 0.008, 0.040, -0.034, 2.2],
];
const sectionK = fuselageRatio(FUSE);
const sideCda = fusL * fusD * 0.8 * 1.2 * sectionK * 0.7;

/* The torque roll and the aileron against it, SWIRL_KEEP the plant's 0.74
 * (Selig, AIAA 2010-7938; docs/FLIGHTMODEL.md). */
const SWIRL_KEEP = 0.74;
const Qprop = torqueArm * W;
const finSwirl = S * b * rho * hov.vi * hov.fv * slip.slip_cl_b * -(Qprop * (Math.min(hov.rw, hvUp) - Math.min(hov.rw, hvDn)) / (rho * Math.PI * propR * propR * hov.vi * hov.rw * hov.rw));
/* A pilot hanging it holds the nose on the rudder (wingpilot.js
 * hangSticks, the gate's pilot): the swirl's side wind on the fin yaws the
 * nose, and the rudder that stops the yaw pushes back on the same surface,
 * so the fin and rudder together roll the airframe by
 * S b rho v_i fv (-x_s) (slip_cl_b - cl_dr slip_cn_b / cn_dr), which with
 * Nelson's forms is zero: the fin's counter roll is gone with its side
 * force, and the net torque is the prop's less the root's share alone.
 * (The Extra's derivation took the fin's roll with no rudder; its plant
 * gate E8 flies with the rudder held and reads above it for this reason.) */
const xsHover = SWIRL_KEEP * Qprop * (Math.min(hov.rw, hvUp) - Math.min(hov.rw, hvDn)) / (rho * Math.PI * propR * propR * hov.vi * hov.rw * hov.rw);
const finHeld = S * b * rho * hov.vi * hov.fv * -xsHover * (slip.slip_cl_b - Cldr * slip.slip_cn_b / Cndr);
const Qhover = Qprop - (1 - SWIRL_KEEP) * Qprop + finHeld;
const torqueRoll = Math.sign(Qhover) * Math.sqrt(Math.abs(Qhover) / rotK[0]);
const aileronHover = hov.dp * hov.fa * S * b * Clda * throwA;
const aileronRollNet = aileronHover > Qhover ? Math.sqrt((aileronHover - Qhover) / rotK[0]) : -Math.sqrt((Qhover - aileronHover) / rotK[0]);
const tailCn = 1.17;
const plateRatio = (x) => 1 / Math.sqrt(Math.sqrt(1 + (x / tailCn) ** 4));
const vhT = -slip.slip_cm_a / (at * (1 - deda)), vvF = slip.slip_cn_b / av;
const pitchAccHover = hov.dp * hov.fh * S * c * Cmde * throwE * plateRatio(Cmde * throwE / vhT) / Iyy;
const yawAccHover = hov.dp * hov.fv * S * b * Math.abs(Cndr) * throwR * plateRatio(Cndr * throwR / vvF) / Izz;

/* The rest on the gear: each axle lowered by its 5 mm of static
 * deflection, as every taildragger's here. */
const { mainX, mainZ, mainR, tailX, tailZ, tailR } = O;
/* The pose both wheels' contacts rest at on level ground; IMG_7289 reads
 * 9 to 13 deg, the check on it. */
const restPitchDeg = Math.atan(((tailZ - tailR) - (mainZ - mainR)) / (mainX - tailX)) * DEG;
const rp = restPitchDeg / DEG;
const mainZc = mainZ - mainR, tailZc = tailZ - tailR;
const mainXw = mainX * Math.cos(rp) - mainZc * Math.sin(rp);
const tailXw = tailX * Math.cos(rp) - tailZc * Math.sin(rp);
const mainHw = -(mainX * Math.sin(rp) + mainZc * Math.cos(rp));
const tailHw = -(tailX * Math.sin(rp) + tailZc * Math.cos(rp));
const tailShare = mainXw / (mainXw - tailXw);
const wheelbase = mainXw - tailXw;
const mainLoad = W * (1 - tailShare) / 2, tailLoad = W * tailShare;
const kMain = mainLoad / 0.005, kTail = tailLoad / 0.005;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mTail = (Iyy + m * mainXw * mainXw) / (wheelbase * wheelbase);
const cTail = 2 * 0.6 * Math.sqrt(kTail * mTail);
const cgHeight = (mainHw + tailHw) / 2;

/* Past the stall: the Extra's forms in chords, and its section's break,
 * the same class of thick symmetric section (stall_top 2 deg, stall_k
 * 0.70, docs/EXTRA-STAGE1.md). */
const armAc = hCG - 0.25, armCp = 0.40 - hCG, stallDw = eta * VH * at * deda / aw;
const stallTop = 2.0 / DEG, stallK = 0.70;

/* The wing's normal force broadside, Viterna and Janetzke's finite wing
 * 1.11 + 0.018 AR (NASA TM-82944 eq. 12), as plant_wing.c plate_cn and as
 * extra-derive.js takes it. */
const PCN = 1.11 + 0.018 * Math.min(AR, 50);
function smooth(a0, a1, x) { if (x <= a0) return 0; if (x >= a1) return 1; const t = (x - a0) / (a1 - a0); return t * t * (3 - 2 * t); }
function clPlant(alpha) {
  const aS = CLmax / CLa;
  const sig = smooth(aS - blend, aS + blend, Math.abs(alpha));
  const lin = CLa * alpha, plateL = PCN * Math.sin(alpha) * Math.cos(alpha);
  const old = (1 - sig) * lin + sig * plateL;
  if (sig <= 0) return { CL: lin, CD: CD0 + k * lin * lin, sig, clSt: lin, fall: 0, past: 0 };
  let clS = 0;
  for (let i = 0; i <= 16; i += 1) {
    const ai = aS - blend + blend * 0.125 * i;
    const si = smooth(aS - blend, aS + blend, ai);
    clS = Math.max(clS, (1 - si) * CLa * ai + si * PCN * Math.sin(ai) * Math.cos(ai));
  }
  const a0 = aS + stallTop, a1 = a0 + 2 * blend;
  const t = smooth(a0, a1, Math.abs(alpha));
  const st = Math.min(a1, 0.5);
  const a2 = (stallK * clS - PCN * Math.sin(st) * Math.cos(st)) * Math.sin(st) / (Math.cos(st) ** 2);
  const vit = Math.cos(alpha) > 0 && Math.abs(Math.sin(alpha)) > 0.05 ? a2 * Math.cos(alpha) ** 2 / Math.sin(alpha) : 0;
  const clSt = (1 - t) * clS + t * (plateL + vit);
  const past = smooth(aS, aS + blend, Math.abs(alpha));
  const CL = old + past * (clSt - old);
  const CD = (1 - sig) * (CD0 + k * lin * lin) + sig * (CD0 + PCN * Math.sin(alpha) ** 2);
  return { CL, CD, sig, clSt, fall: t, past };
}
/* The harrier, the Extra's derivation's. */
function harrier(alphaDeg) {
  const a = alphaDeg / DEG;
  const { CL, CD, sig, clSt, fall, past } = clPlant(a);
  const qS = 0.5 * rho * S;
  const V = Math.sqrt(W / (qS * (CL + CD * Math.tan(a))));
  const thrust = qS * V * V * CD / Math.cos(a);
  const u = V * Math.cos(a);
  let lo = 0, hi = nAt(1, u);
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (T(u, mid) < thrust) lo = mid; else hi = mid; }
  const duty = lo;
  const qb = 0.5 * rho * V * V;
  const w = washOf(slip, thrust, u);
  const sa = Math.sin(a);
  const cnSt = PCN * sa + (clSt - PCN * sa * Math.cos(a)) * Math.cos(a);
  const cmPost = sig * (((1 - fall) * armAc - fall * armCp) * cnSt - armAc * CLa * sa);
  const alphaT = sa - deda * CL / CLa - slip.slip_a0 * (1 - deda);
  const xa = V * Math.sin(a - slip.slip_a0);
  const vw = u + 2 * w.vi;
  /* scripts/lib/washcontrol.js, as the plant: the side the elevator is on against the crossflow. */
  const cm = (de) => {
    const kw = washKw(a, w.dp, V, rho, Cmde * de * xa > 0 ? 'against' : 'with');
    const xt = at * alphaT - Cmde * de / vhT;
    const free = Cm0 + (Cma - slip.slip_cm_a) * sa + slip.slip_cm_a * slip.slip_a0 - vhT * xt * plateRatio(xt) + past * cmPost;
    const rh = plateRatio(at * xa / vw - kw * Cmde * de / vhT);
    return free + (rho * w.vi * w.fh * rh * slip.slip_cm_a * xa + w.dp * w.fh * rh * kw * Cmde * de) / qb;
  };
  let dLo = -throwE, dHi = throwE;
  for (let i = 0; i < 60; i += 1) { const mid = (dLo + dHi) / 2; if (cm(mid) < 0) dLo = mid; else dHi = mid; }
  return { alphaDeg, V, thrust, duty: stickFor(duty, u), deOfThrow: dLo / throwE, cmAtFull: cm(throwE) };
}
/* The knife edge, the Extra's derivation's. */
function knifeEdge(V) {
  const qb = 0.5 * rho * V * V;
  for (let bDeg = 1; bDeg < 60; bDeg += 0.01) {
    const bt = bDeg / DEG, sb = Math.sin(bt), cb = Math.cos(bt);
    const u = V * cb;
    let thrust = qb * S * CD0 / cb;
    let side = 0, dr = 0;
    for (let it = 0; it < 30; it += 1) {
      const w = washOf(slip, thrust, u);
      const nBeta = qb * S * b * Cnb * sb + rho * w.vi * w.fv * S * b * slip.slip_cn_b * (V * sb);
      const nPerDr = qb * S * b * Cndr + w.dp * w.fv * S * b * Cndr;
      dr = -nBeta / nPerDr;
      side = qb * S * (-CYb) * sb + 0.5 * rho * sideCda * (V * sb) ** 2 + rho * w.vi * w.fv * S * (-slip.slip_cy_b) * (V * sb)
        - (qb + w.dp * w.fv) * S * CYdr * Math.abs(dr);
      thrust = (qb * S * CD0 + side * sb) / cb;
    }
    if (T(u, nAt(1, u)) < thrust) break;
    if (side * cb + thrust * sb >= W) {
      let lo = 0, hi = nAt(1, u);
      for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (T(u, mid) < thrust) lo = mid; else hi = mid; }
      return { V, betaDeg: bDeg, duty: stickFor(lo, u), thrust, drOfThrow: Math.abs(dr) / throwR };
    }
  }
  return null;
}
/* The take off roll, full throttle, the tail held to 6 m/s, then 2 deg,
 * and 8 deg from the rotation speed, the Extra's. */
const vRotate = 1.2 * Vs;
function takeoff() {
  let V = 0, x = 0, t = 0;
  const dt = 0.0005;
  while (t < 15) {
    const pDeg = V < 6 ? restPitchDeg : (V < vRotate ? 2 : 8);
    const { CL, CD } = clPlant(pDeg / DEG);
    const q = 0.5 * rho * V * V;
    if (q * S * CL >= W) break;
    const acc = (T(V, nAt(1, V)) - q * S * CD - 0.08 * Math.max(0, W - q * S * CL)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, V };
}

/*
 * The table, as the C source must hold it: each field's text up to its
 * comma, which --check finds in FW_CAP1702 (plant_wing.c) and the
 * PLANT_TABLE row (plant.c).
 */
const r = (x, n) => Number(x).toFixed(n);
const deg = (x, n = 2) => `${r(x * DEG, n)} * WING_PI / 180.0`;
const arr = (a, n) => `{ ${a.map((x) => r(x, n)).join(', ')} }`;
export const FW = {
  span: r(b, 4), area: r(S, 4), chord: r(c, 4), cl_alpha: r(CLa, 4), cl_max: r(CLmax, 4),
  cl_alpha_wing: r(aw, 3), stall_re: '{ 1.5e5, 3.0e5 }', stall_clmax: arr(STALL_CLMAX, 4), stall_peak: arr(STALL_PEAK, 4),
  cd0: r(CD0, 3), k_induced: r(k, 5), cl_de: r(CLde, 4), cy_beta: r(CYb, 4), cy_dr: r(CYdr, 4),
  cl_beta: r(Clb, 4), cl_p: r(Clp, 4), cl_da: r(Clda, 4), cl_dr: r(Cldr, 4), cm_0: r(Cm0, 4),
  cm_alpha: r(Cma, 4), cm_q: r(Cmq, 3), cm_de: r(Cmde, 4), cn_beta: r(Cnb, 4), cn_r: r(Cnr, 4),
  cn_dr: r(Cndr, 4),
  throw_a: deg(throwA), throw_e: deg(throwE), throw_r: deg(throwR), surface_max: deg(throwA), expo: r(EXPO, 2),
  thrust_static: r(Ts, 2), pitch_speed: r(Vp, 3), rpm_no_load: r(rpmNL, 1), torque_arm: r(torqueArm, 5),
  current_full: r(Is, 2), jet_kj: '0.80', prop_x: r(propX, 3),
  throttle_rpm: arr(THROTTLE_RPM, 4), thrust_yaw: deg(THRUST_YAW),
  stall_arm_ac: r(armAc, 4), stall_arm_cp: r(armCp, 4), stall_dw: r(stallDw, 4), stall_k: r(stallK, 2),
  stall_top: deg(stallTop, 1), strip_c: arr(stripC, 3),
  slip_r: r(propR, 4), slip_yh: r(bh / 2, 4), slip_hv: arr([hvUp, hvDn], 3), slip_ya: arr([ailIn, aileronOut], 4),
  slip_a0: r(slip.slip_a0, 4), slip_cl_a: r(slip.slip_cl_a, 4), slip_cm_a: r(slip.slip_cm_a, 4),
  slip_cn_b: r(slip.slip_cn_b, 4), slip_cn_r: r(slip.slip_cn_r, 4), slip_cy_b: r(slip.slip_cy_b, 4), slip_cl_b: r(slip.slip_cl_b, 4),
  strip_tau: arr(stripTau, 4), tail_at: r(at, 3), tail_av: r(av, 3), tail_deda: r(deda, 3),
  side_cda: r(sideCda, 4), rot_k: arr(rotK, 5), j_prop: r(propJ, 6),
};
export const PT = {
  mass_kg: r(m, 4), inertia: arr([Ixx, Iyy, Izz], 4), r_cell: r(rCell, 5), pack_c: `${r(packMah, 1)} * 3.6`, prop_r: r(propR, 4),
};
export const GEAR = {
  main: [mainX, O.track / 2, mainZ - 0.005, mainR, kMain, cMain],
  tail: [tailX, 0, tailZ - 0.005, tailR, kTail, cTail],
};
export const DERIVED = {
  W, Ts, Vp, Vs, CLa, aw, CLmax, hoverDuty, hoverBench, vClimb, pb2v, torqueRoll: torqueRoll * DEG, aileronRollNet: aileronRollNet * DEG,
  pitchAccHover, yawAccHover, restPitchDeg, cgHeight, tailShare, level75: level(0.75), top: level(1), ld: ld(14),
  harrier40: harrier(40), knife20: knifeEdge(20), takeoff: takeoff(), vRotate, ld15: ld(15),
};

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const J = (o, n = 3) => JSON.stringify(o, (kk, v) => (typeof v === 'number' ? +v.toFixed(n) : v));
const rows = [
  ['b, S sheet m2, S of the measured trapezoid, AR, W/S N/m2', `${f(b, 4)} ${f(S, 4)} ${f(Strap, 4)} ${f(AR)} ${f(W / S, 1)}`],
  ['taper, MAC, y_MAC, MAC LE behind root LE, h_cg', `${f(lam)} ${f(MAC, 4)} ${f(yMAC, 4)} ${f(macLE, 4)} ${f(hCG, 4)}`],
  ['stall: Re on the MAC, the wing\'s CL max there; stall_clmax; stall_peak deg', `${f(reStall, 0)} ${f(CLmax, 4)}; ${f(STALL_CLMAX[0], 4)} ${f(STALL_CLMAX[1], 4)}; ${f(STALL_PEAK[0] * DEG, 2)} ${f(STALL_PEAK[1] * DEG, 2)}`],
  ['stab: Sh, AR, V_H; fin: AR geometric, effective, V_V', `${f(Sh, 4)} ${f(ARt)} ${f(VH)}; ${f(arVgeo)} ${f(arV)} ${f(VV, 4)}`],
  ['a_w, a_t, a_v /rad; dε/dα', `${f(aw)} ${f(at)} ${f(av)}; ${f(deda)}`],
  ['CLα, h_n, static margin', `${f(CLa, 4)} ${f(hn)} ${f(SM)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde, 4)} ${f(CLde, 4)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb, 4)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ (fin, low wing), Clp, Clδa', `${f(Clb, 4)} (${f(ClbFin, 4)} ${f(ClbLow, 4)}) ${f(Clp, 4)} ${f(Clda, 4)}`],
  ['cl_beta_wing, cl_beta_fin, cn_beta_fin: the wing\'s and the fin\'s shares (docs/FLIGHTMODEL.md, sideslip past the stall)', `${f(Clb - ClbFin, 4)} ${f(ClbFin, 4)} ${f(av * VV, 4)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['K\' a e r; tau a e r', `${f(kPrime(throwA))} ${f(kPrime(throwE))} ${f(kPrime(throwR))}; ${f(tauA)} ${f(tauE)} ${f(tauR)}`],
  ['strip_tau; strip_c', `${J(stripTau, 4)}; ${J(stripC, 3)}`],
  ['mass: shell kg, pack x m', `${f(shellM, 3)} ${f(packX, 4)}`],
  ['inertia Ixx Iyy Izz', `${f(Ixx, 4)} ${f(Iyy, 4)} ${f(Izz, 4)}`],
  ['bench full: rpm, N m, N, A, V; T/W', `${nStatic} ${f(Qs, 3)} ${f(Ts, 2)} ${f(Is, 2)} ${full[1]}; ${f(Ts / W, 3)}`],
  ['APC 18x8E static at the bench rpm: N, N m (bench over APC)', `${f(apcStatic(nStatic), 2)} ${f(apcQStatic(nStatic), 3)} (${f(Ts / apcStatic(nStatic), 3)} ${f(Qs / apcQStatic(nStatic), 3)})`],
  ['rpm NL (plant shows 0.85 of it), geometric pitch speed, torque arm m', `${f(rpmNL, 1)} ${f(Vp, 2)} ${f(torqueArm, 5)}`],
  ['APC row at the bench rpm: top speed, its thrust there; zero thrust speed', `${f(vTopApc, 2)} ${f(tTopApc, 2)}; ${f(apcCurve[apcCurve.length - 1][0], 2)}`],
  ['APC\'s row against the table\'s curve at 0, 10, 20, 30 m/s, N', [0, 10, 20, 30].map((v) => `${f(apcAt(v) * Ts / apcCurve[0][1], 1)}/${f(T(v, 1), 1)}`).join(' ')],
  ['r_cell from the bench sag, prop J', `${f(rCell, 5)} ${f(propJ, 6)}`],
  ['bench rpm fraction at throttle 0.4 .. 1 (the plant\'s is the throttle)', benchRpmFrac.map(([t, n]) => `${t}:${f(n, 3)}`).join(' ')],
  ['slipstream', J(slip, 4)],
  ['rot_k roll pitch yaw N m s2; side_cda m2, its section over a round body\'s (TN 3038)', `${f(rotK[0], 5)} ${f(rotK[1], 5)} ${f(rotK[2], 5)}; ${f(sideCda, 4)}, ${f(sectionK, 4)}`],
  ['C1 level at 75 percent', f(level(0.75), 2)],
  ['C2 stall, CLmax / a_w', `${f(Vs, 2)} ${f(CLmax / aw, 5)}`],
  ['C3 L/D at 15 m/s', f(ld(15), 2)],
  ['C4 top speed', f(level(1), 2)],
  ['C5 roll pb/2V, deg/s at 18 m/s', `${f(pb2v, 4)} ${f(rollAt(18) * DEG, 0)}`],
  ['C6 hover: the stick the curve turns sqrt(W/Ts) at; the bench\'s', `${f(hoverDuty, 4)}; ${f(hoverBench, 4)}`],
  ['throttle_rpm', J(THROTTLE_RPM, 4)],
  ['   wash dp, v_i, rw, fh fv fa', `${f(hov.dp, 1)} ${f(hov.vi, 2)} ${f(hov.rw, 4)} ${f(hov.fh)} ${f(hov.fv)} ${f(hov.fa, 4)}`],
  ['C7 vertical climb speed, full throttle', f(vClimb, 2)],
  ['C8 torque at hover N m; root, fin free, fin with the rudder held; net; torque roll deg/s', `${f(Qprop, 4)}; ${f((1 - SWIRL_KEEP) * Qprop, 4)} ${f(SWIRL_KEEP * finSwirl, 4)} ${f(finHeld, 4)}; ${f(Qhover, 4)}; ${f(torqueRoll * DEG, 0)}`],
  ['C9 full aileron in the wash N m, net roll deg/s', `${f(aileronHover, 4)} ${f(aileronRollNet * DEG, 0)}`],
  ['C10 full elevator hanging, rad/s2; rudder', `${f(pitchAccHover, 2)} ${f(yawAccHover, 2)}`],
  ['C11 harrier at 35, 40, 45 deg', ''],
  ['   35', J(harrier(35))],
  ['   40', J(harrier(40))],
  ['   45', J(harrier(45))],
  ['C12 knife edge at 18, 20, 22 m/s', ''],
  ['   18', J(knifeEdge(18))],
  ['   20', J(knifeEdge(20))],
  ['   22', J(knifeEdge(22))],
  ['C13 rest: pitch deg, CG height m, tail share', `${f(restPitchDeg, 2)} ${f(cgHeight, 4)} ${f(tailShare, 4)}`],
  ['C14 take off roll, rotation speed', `${J(takeoff())} ${f(vRotate, 2)}`],
  ['gear: wheelbase, loads main tail N; k main tail; c main tail', `${f(wheelbase, 4)} ${f(mainLoad, 3)} ${f(tailLoad, 3)}; ${f(kMain, 0)} ${f(kTail, 0)}; ${f(cMain, 2)} ${f(cTail, 2)}`],
  ['stall: arm_ac, arm_cp, dw', `${f(armAc, 4)} ${f(armCp, 4)} ${f(stallDw, 4)}`],
];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [name, v] of rows) console.log(`${name.padEnd(64)} ${v}`);
  if (process.argv.includes('--table')) {
    for (const [kk, v] of Object.entries(FW)) console.log(`  .${kk} = ${v},`);
    for (const [kk, v] of Object.entries(PT)) console.log(`  .${kk} = ${v},`);
  }
  /*
   * --write-bands: a plant change that moves a derivation (the aero lane's,
   * the propulsion lane's) is re-derived mechanically: each band's centre
   * is written from this derivation and its edges at the width the
   * thresholds file states for it, the Extra's for the same gate (never
   * wider). The source texts name the old centre where they quote one, and
   * that number is replaced with the new.
   */
  if (process.argv.includes('--write-bands')) {
    const file = join(root, 'tests/cap580-thresholds.json');
    const th = JSON.parse(readFileSync(file, 'utf8'));
    const D = DERIVED;
    const fix = (x, n) => Number(x.toFixed(n));
    /* Edges are rounded inward, so rounding never widens a band. */
    const up = (x, n) => Number((Math.ceil(x * 10 ** n - 1e-9) / 10 ** n).toFixed(n));
    const dn = (x, n) => Number((Math.floor(x * 10 ** n + 1e-9) / 10 ** n).toFixed(n));
    /* [gate, centre key, value, digits, min key, max key, low factor or offset, high, offsets?] */
    const BANDS = [
      ['c1_level_75', 'derived', D.level75, 2, 'min', 'max', 0.88, 1.12],
      ['c2_stall', 'derived', D.Vs, 2, 'min', 'max', 0.94, 1.14],
      ['c3_glide', 'derived', D.ld15, 2, 'min', 'max', 0.88, 1.12],
      ['c4_top', 'derived', D.top, 2, 'min', 'max', 0.90, 1.10],
      ['c5_roll', 'derived', D.pb2v, 4, 'min', 'max', 0.75, 1.25, 2],
      ['c6_hover', 'derived', D.hoverDuty, 4, null, null],
      ['c7_vertical', 'derived', D.vClimb, 2, 'min', 'max', 0.90, 1.10],
      ['c8_torque_roll', 'derived', D.torqueRoll, 0, 'min', 'max', 0.75, 1.25],
      ['c9_aileron_hover', 'derived', D.aileronRollNet, 0, 'min', 'max', 0.60, 1.40],
      ['c10_zero_speed', 'pitchDerived', D.pitchAccHover, 2, 'pitchMin', 'pitchMax', 0.75, 1.25, 1],
      ['c10_zero_speed', 'yawDerived', D.yawAccHover, 2, 'yawMin', 'yawMax', 0.75, 1.25, 1],
      ['c11_harrier', 'vDerived', D.harrier40.V, 3, 'vMin', 'vMax', 0.80, 1.20, 2],
      ['c11_harrier', 'dutyDerived', D.harrier40.duty, 3, 'dutyMin', 'dutyMax', 0.85, 1.15, 3],
      ['c12_knife_edge', 'betaDerived', D.knife20.betaDeg, 2, 'betaMin', 'betaMax', 0.75, 1.25, 1],
      ['c12_knife_edge', 'dutyDerived', D.knife20.duty, 3, 'dutyMin', 'dutyMax', 0.85, 1.15, 3],
      ['c14_takeoff', 'derived', D.takeoff.x, 3, 'distMin', 'distMax', 0.60, 1.60, 2],
    ];
    for (const [gate, key, value, n, lo, hi, fl, fh, nb] of BANDS) {
      const g = th[gate];
      const was = g[key];
      g[key] = fix(value, n);
      if (lo === null) continue;
      g[lo] = up(value * fl, nb ?? n);
      g[hi] = dn(value * fh, nb ?? n);
      if (g.source && was !== g[key]) g.source = g.source.replace(String(was), String(g[key]));
    }
    th.c2_stall.alphaStall = fix(D.CLmax / D.aw, 5);
    /* The hover is gated on the measurement: the bench's throttle, 5
     * percent either way (the Extra's E6 width). */
    th.c6_hover.bench = fix(D.hoverBench, 4);
    th.c6_hover.min = up(D.hoverBench * 0.95, 3);
    th.c6_hover.max = dn(D.hoverBench * 1.05, 3);
    /* The rest pose: half a degree, 5 mm and 3.5 points either way. */
    const r13 = th.c13_rest;
    r13.pitchDerived = fix(D.restPitchDeg, 2); r13.pitchMin = up(D.restPitchDeg - 0.5, 2); r13.pitchMax = dn(D.restPitchDeg + 0.5, 2);
    r13.zDerived = fix(D.cgHeight, 4); r13.zMin = up(D.cgHeight - 0.005, 3); r13.zMax = dn(D.cgHeight + 0.005, 3);
    r13.tailDerived = fix(D.tailShare, 4); r13.tailMin = up(D.tailShare - 0.035, 3); r13.tailMax = dn(D.tailShare + 0.035, 3);
    const text = `{\n${Object.entries(th).map(([kk, v]) => `  ${JSON.stringify(kk)}: ${JSON.stringify(v).replace(/,"/g, ', "').replace(/":/g, '": ')}`).join(',\n')}\n}\n`;
    writeFileSync(file, text);
    console.log('wrote tests/cap580-thresholds.json');
  }
  if (process.argv.includes('--check')) {
    const wing = readFileSync(join(root, 'src/native/plant_wing.c'), 'utf8');
    const plant = readFileSync(join(root, 'src/native/plant.c'), 'utf8');
    const fw = wing.slice(wing.indexOf('const FixedWingParams FW_CAP1702 = {')).split('\n};')[0];
    const pt = plant.slice(plant.indexOf('[SIM_AIRFRAME_CAP1702] = {')).split('\n},')[0];
    let bad = 0;
    const want = (body, kk, v) => {
      if (!body.includes(`.${kk} = ${v},`)) { console.log(`DIFFERS .${kk}: derived ${v}`); bad += 1; }
    };
    if (!fw.includes('FW_CAP1702')) { console.log('no FW_CAP1702 in plant_wing.c'); bad += 1; }
    for (const [kk, v] of Object.entries(FW)) want(fw, kk, v);
    for (const [kk, v] of Object.entries(PT)) want(pt, kk, v);
    const wheel = ([x, y, z, rr, kk, cc]) => `.pos = { ${r(x, 4)}, ${r(y, 4)}, ${r(z, 4)} }, .r = ${r(rr, 4)}, .k = ${r(kk, 1)}, .c = ${r(cc, 2)},`;
    for (const [name, w] of [['main', GEAR.main], ['main, left', [GEAR.main[0], -GEAR.main[1], ...GEAR.main.slice(2)]], ['tail', GEAR.tail]]) {
      if (!pt.includes(wheel(w))) { console.log(`DIFFERS ${name} wheel: derived ${wheel(w)}`); bad += 1; }
    }
    /* The bands' centres in tests/cap580-thresholds.json are this
     * derivation's, to the digits they are written with. */
    const th = JSON.parse(readFileSync(join(root, 'tests/cap580-thresholds.json'), 'utf8'));
    const D = DERIVED;
    const centres = [
      ['c1_level_75.derived', th.c1_level_75.derived, D.level75], ['c2_stall.derived', th.c2_stall.derived, D.Vs],
      ['c2_stall.alphaStall', th.c2_stall.alphaStall, D.CLmax / D.aw], ['c3_glide.derived', th.c3_glide.derived, D.ld15],
      ['c4_top.derived', th.c4_top.derived, D.top], ['c5_roll.derived', th.c5_roll.derived, D.pb2v],
      ['c6_hover.derived', th.c6_hover.derived, D.hoverDuty], ['c6_hover.bench', th.c6_hover.bench, D.hoverBench],
      ['c7_vertical.derived', th.c7_vertical.derived, D.vClimb], ['c8_torque_roll.derived', th.c8_torque_roll.derived, D.torqueRoll],
      ['c9_aileron_hover.derived', th.c9_aileron_hover.derived, D.aileronRollNet],
      ['c10_zero_speed.pitchDerived', th.c10_zero_speed.pitchDerived, D.pitchAccHover], ['c10_zero_speed.yawDerived', th.c10_zero_speed.yawDerived, D.yawAccHover],
      ['c11_harrier.vDerived', th.c11_harrier.vDerived, D.harrier40.V], ['c11_harrier.dutyDerived', th.c11_harrier.dutyDerived, D.harrier40.duty],
      ['c12_knife_edge.betaDerived', th.c12_knife_edge.betaDerived, D.knife20.betaDeg], ['c12_knife_edge.dutyDerived', th.c12_knife_edge.dutyDerived, D.knife20.duty],
      ['c13_rest.pitchDerived', th.c13_rest.pitchDerived, D.restPitchDeg], ['c13_rest.zDerived', th.c13_rest.zDerived, D.cgHeight],
      ['c13_rest.tailDerived', th.c13_rest.tailDerived, D.tailShare], ['c14_takeoff.derived', th.c14_takeoff.derived, D.takeoff.x],
    ];
    for (const [name, written, derived] of centres) {
      const digits = (String(written).split('.')[1] || '').length;
      if (!(Math.abs(written - derived) <= 0.5 * 10 ** -digits + 1e-12)) { console.log(`DIFFERS ${name}: written ${written}, derived ${derived}`); bad += 1; }
    }
    console.log(bad ? `cap580:derive: ${bad} constant(s) differ from the derivation` : `cap580:derive: every FW_CAP1702 and PLANT_TABLE constant and every band's centre is the derivation's (${Object.keys(FW).length + Object.keys(PT).length + 3} and ${centres.length})`);
    process.exit(bad ? 1 : 0);
  }
}
