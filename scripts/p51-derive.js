/*
 * p51-derive.js: the arithmetic behind docs/P51-STAGE1.md, from FMS's
 * published figures for the 1450 mm P-51D Mustang V8 (span, length,
 * weight, area, CG, motor, prop, battery and throws, its manual), the
 * full size P-51D's published geometry scaled to the kit's span (Aviation
 * magazine's July 1944 design analysis), and the kit manual's own side
 * view, to every coefficient and every derived band. It never loads the
 * plant: this is what the plant is checked against, so it has to stand
 * apart from it. Harness arithmetic in JS maths, which is allowed here
 * because nothing it prints is hashed. It follows scripts/timber-derive.js
 * and scripts/kadet-derive.js where the aircraft are alike. Run with
 * npm run p51:derive.
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

const DEG = 180 / Math.PI;
const rho = 1.225;
const g = 9.81;
const IN = 0.0254;
const FT = 0.3048;

/*
 * FMS's figures: span 1450 mm, flying weight about 2,350 g, wing area 35.4
 * dm^2, CG 110 mm behind the leading edge where the wing meets the
 * fuselage, a 4250 540 kV motor on a 14 x 8 four blade and a 4S 2600.
 */
const b = 1.450, S = 0.354, m = 2.350, W = m * g, c = S / b, AR = b * b / S;
/*
 * The full size P-51D (Aviation, July 1944, "Design Analysis of the P-51",
 * its leading particulars): span 37.03 ft, wing 233.19 sq ft at a taper
 * of 0.499, dihedral 5 deg on the quarter chord line, which is square to
 * the fuselage; incidence about 1 deg at the root and minus 58 minutes at
 * the tips; the stabiliser 13 ft 2 1/8 in across, 27.85 sq ft with its
 * elevators' 13.05; the fin 8.83 sq ft and the rudder 10.25; the tread 11
 * ft 10 in on 27 in wheels, the tail wheel 12.5 in. The kit is the full
 * size to its span: 233.19 sq ft scaled is 0.3575 m^2 against FMS's 0.354.
 */
const s = b / (37.03 * FT);
const taper = 0.499;
const cr = 2 * S / (b * (1 + taper)), ct = taper * cr;       /* the trapezoid of FMS's area */
const chordAt = (y) => cr - (cr - ct) * Math.abs(y) / (b / 2);
const mac = (2 / 3) * cr * (1 + taper + taper * taper) / (1 + taper);
const gamma = 5 / DEG, cosFactor = Math.cos(gamma) ** 2;
const washout = (1 + 58 / 60) / DEG;                          /* +1 deg root, -0 deg 58 min tip */
const Sh = 27.85 * FT * FT * s * s, bh = (13 * 12 + 2.125) * IN * s;
const elevFrac = 13.05 / 27.85;
const Sv = (8.83 + 10.25) * FT * FT * s * s, rudFrac = 10.25 / (8.83 + 10.25);
const track = (11 * 12 + 10) * IN * s, rMain = 27 / 2 * IN * s, rTail = 12.5 / 2 * IN * s;
/*
 * Stations from the kit manual's own side view (fig. 76), whose length
 * from the spinner's tip to the rudder's trailing edge, 1,755 pixels at
 * 300 dpi, is the full size's 32 ft 2 3/8 in, so a pixel is 0.7196 mm of
 * the kit: the wing's leading edge at the fuselage 550 px, the
 * stabiliser's root 1,590 to 1,720 px (its 30 in chord), the fin's mean
 * quarter chord 1,690 px and 162 px over the thrust line, the thrust line
 * 18 px over the CG, the main axle 615 px and 285 px under the CG, the
 * tail wheel's 1,488 px and 115 px under, the belly scoop 180 px under,
 * the prop's plane 205 px. Metres below, x forward of the CG, z up.
 */
const PX = 32.198 * FT * s / 1755;
const xCGpx = 550 + 0.110 / PX;
const px = (x) => (xCGpx - x) * PX;           /* forward of the CG, m */
const pz = (y) => (370 - y) * PX;             /* over the CG, m */
/* The wing's quarter chord line is straight across, so it is the wing's
 * aerodynamic centre wherever it is measured; the fuselage side is 0.0572
 * m out (the full size's 2 ft 11 in over two). */
const yFus = 35 * IN * s / 2;
const leFus = px(550);
const xAcWing = leFus - 0.25 * chordAt(yFus);
const xAcTail = px(1590 + 0.25 * 130);
const lh = xAcWing - xAcTail;
const lv = -px(1690), zv = pz(370 - 18 - 162);
const zWing = pz(440);                        /* the wing's chord plane at the root */
const thrustZ = pz(352);
const propX = px(205);
const hCG = (0.25 * mac + (xAcWing - 0)) / mac; /* CG behind the MAC's leading edge, per MAC */
const eta = 0.9;
/* Thin aerofoil theory for a trailing edge surface of chord fraction cf:
 * its effectiveness and its section moment per radian. */
const surf = (cf) => {
  const th = Math.acos(1 - 2 * (1 - cf));
  return { tau: 1 - (th - Math.sin(th)) / Math.PI, cm: -0.5 * Math.sin(th) * (1 - Math.cos(th)) };
};
const tauE = surf(elevFrac).tau, tauR = surf(rudFrac).tau;
const ailFrac = 0.22, flapFrac = 0.25;
const tauAil = surf(ailFrac).tau * 0.85, tauTE = surf(flapFrac).tau;
/* The ailerons from 0.45 to 0.68 m out (the full size's 12.64 sq ft of
 * aileron over its outer panels), the flaps from the fuselage's side to
 * 0.42 m. */
const y1 = 0.45, y2 = 0.68, flapIn = yFus, flapOut = 0.42;
/*
 * FMS's throws at the surfaces' widest point, low rate, which the manual
 * says is for normal flying: ailerons 17 mm on a 50 mm aileron, elevator
 * 24 on a 55 mm elevator root, rudder 21 on a 100 mm rudder; flaps 22 mm
 * half and 45 full on the 78 mm flap at the fuselage (a quarter of the
 * 0.313 m chord there). The surfaces' chords are the scaled full size's,
 * ESTIMATED.
 */
const throwA = Math.asin(17 / 50), throwE = Math.asin(24 / 55), throwR = Math.asin(21 / 100);
const flapChord = flapFrac * chordAt(yFus);
const flapHalf = Math.asin(0.022 / flapChord), flapFull = Math.asin(0.045 / flapChord);
const expo = 0.30;

/*
 * The wing's section, the NAA/NACA 45-100 laminar flow family, 15.1
 * percent at the root and 11.4 near the tip: CL max 1.05 for the wing at
 * the kit's Reynolds number, 2e5 (12 m/s on 0.244 m), ESTIMATED from the
 * UIUC low speed data's 15 percent NACA 2415 at 2e5, 1.22, times 0.9 for
 * the wing and less for a laminar section's thinner nose. Zero lift 1.3
 * deg under its chord, a 6 series section's design lift of 0.2.
 */
const CLmax = 1.05, CD0 = 0.030, e = 0.80, k = 1 / (Math.PI * e * AR);
const cdGear = 0.008;
const alphaZLwing = -1.3 / DEG;
/* The wing's incidence, 1 deg at the root falling linearly to minus 58
 * minutes at the tip, averaged over the tapered area. */
const incidence = (1 / DEG) - washout * (0.5 - (1 - taper) / 3) / (1 - (1 - taper) / 2);
const muGrass = 0.08;

/* The coefficients, in the plant's reference chord S/b. */
const aw = cosFactor * 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const KA = 1 / AR - 1 / (1 + Math.pow(AR, 1.7));
const KL = (10 - 3 * taper) / 7;
const hH = pz(300) - zWing;                   /* the stabiliser, 300 px, over the wing's chord plane */
const KH = (1 - hH / b) / Math.cbrt(2 * lh / b);
const deda = 4.44 * Math.pow(KA * KL * KH, 1.19);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
/* The long nose's own moment, Raymer eq. 16.25, K_fus 0.007 per degree
 * for a wing whose root quarter chord is 34 percent down the body. */
const lFus = 1.24, wFus = 2 * yFus;
const fusCma = 0.007 * wFus * wFus * lFus / (c * S) * DEG;
const xNP = xAcWing - c * (VH * eta * (at / aw) * (1 - deda)) + c * fusCma / CLa;
const SM = (0 - xNP) / c;                     /* the CG at 0, xNP negative behind it */
const Cma = -CLa * SM;
const a0w = alphaZLwing - incidence;
const tailK = at * (Sh / S) * eta;
const alphaZL = (aw * a0w + tailK * (-deda * a0w)) / (aw + tailK * (1 - deda));
const Cmq = -2 * eta * at * VH * lh / c;
const Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
const arV = 1.5 * ((0.18 * 0.18) / Sv);
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
/* The long fuselage's weathercock term, Nelson eq. 2.64, K_N 0.0011 per
 * degree, its side area 0.105 m^2 (the side view's). */
const SBs = 0.105;
const CnbFus = -0.0011 * DEG * (SBs / S) * (lFus / b);
const CYb = -av * Sv / S - 0.10;
const Cnb = av * VV + CnbFus;
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/* A low wing rolls into a sideslip by itself: DATCOM's wing height term
 * with the chord plane under the fuselage's centre line, +1.2 sqrt(AR)
 * (z_w/b)(2d/b). */
const dFus = Math.sqrt(wFus * 0.16);
const ClbLow = -1.2 * Math.sqrt(AR) * (zWing / b) * (2 * dFus / b);
const Clb = -aw * gamma * (1 + 2 * taper) / (6 * (1 + taper)) - av * (Sv / S) * (zv / b) + ClbLow;
const Clp = -aw * (1 + 3 * taper) / (12 * (1 + taper));
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
/* The ailerons: strip theory over y1 to y2 on the tapered chord. */
const intC = (a, bb) => { let sum = 0; const N = 400; for (let i = 0; i < N; i += 1) { const y = a + (bb - a) * (i + 0.5) / N; sum += chordAt(y) * y * (bb - a) / N; } return sum; };
const Clda = 2 * aw * tauAil * intC(y1, y2) / (S * b);
const ClrPerCL = 0.25, CnpPerCL = -0.125, CndaPerCL = -0.12;

/*
 * The flaps, the Timber's method for a plain flap: section lift 2 pi tau
 * with the plain flap's large deflection factor, 0.80 at 16 deg and 0.60
 * at 35 (DATCOM, plain flap, read to about ten percent), over the flapped
 * area; CLmax Raymer eq. 12.21, 0.9 x 0.9 (plain) x S_flapped/S at full;
 * drag Raymer eq. 12.61 with F 0.0144 for a plain flap and the part span
 * flap's induced term.
 */
const intChord = (a, bb) => { let sum = 0; const N = 400; for (let i = 0; i < N; i += 1) { const y = a + (bb - a) * (i + 0.5) / N; sum += chordAt(y) * (bb - a) / N; } return sum; };
const SfS = 2 * intChord(flapIn, flapOut) / S;
const flapCL = (d, etaF) => 2 * Math.PI * tauTE * etaF * d * (aw / (2 * Math.PI)) * SfS;
const dclHalf = flapCL(flapHalf, 0.80), dclFull = flapCL(flapFull, 0.60);
const clDf2 = (dclFull / flapFull - dclHalf / flapHalf) / (flapFull - flapHalf);
const clDf = dclHalf / flapHalf - clDf2 * flapHalf;
const dclmaxFull = 0.9 * 0.9 * SfS;
const clmaxDf = dclmaxFull / flapFull;
const flapCd = (d, dcl) => 0.0144 * flapFrac * SfS * Math.max(0, d * DEG - 10) + 0.14 * 0.14 * dcl * dcl;
const cdFull = flapCd(flapFull, dclFull), cdDf2 = cdFull / (flapFull * flapFull);
const cmSection = surf(flapFrac).cm / (2 * Math.PI * tauTE);
const cmPerDcl = cmSection + (hCG - 0.25) * mac / c + eta * VH * at * 1.5 * 2 / (Math.PI * AR);

/*
 * The motor: FMS's 4250 540 kV on 4S, 7,992 rpm unloaded at 3.7 V a cell,
 * and the plant's rule, 0.85 of it loaded, for the pitch speed on the 8 in
 * pitch. The static thrust and current: the 14 x 8 four blade's static
 * coefficients, ESTIMATED as an APC 14 x 8E's (UIUC, C_T 0.10, C_P 0.045)
 * times 1.4 and 1.7 for four blades, turned on the motor where its
 * torque, back EMF and the pack's and motor's resistance balance the
 * pack's 14.8 V: the motor 0.020 ohm, the ESC 0.003, the pack 0.008 a
 * cell, and a 1.5 A no load current.
 */
const kv = 540, cells = 4, pitchIn = 8, propR = 7 * IN, blades = 4;
const Ct = 0.10 * 1.4, Cp = 0.045 * 1.7;
const rTot = 0.020 + 0.003 + 0.008 * cells, i0 = 1.5, Kt = 60 / (2 * Math.PI * kv);
const Dp = 2 * propR;
const staticPoint = (() => {
  let lo = 10, hi = kv * 3.7 * cells / 60;
  for (let it = 0; it < 80; it += 1) {
    const n = (lo + hi) / 2;
    const P = Cp * rho * n ** 3 * Dp ** 5;
    const I = P / (2 * Math.PI * n) / Kt + i0;
    const v = n * 60 / kv + I * rTot;
    if (v < 3.7 * cells) lo = n; else hi = n;
  }
  const n = lo;
  const P = Cp * rho * n ** 3 * Dp ** 5;
  return { rpm: n * 60, I: P / (2 * Math.PI * n) / Kt + i0, T: Ct * rho * n * n * Dp ** 4, P };
})();
const Ts = staticPoint.T;
/* The owners' upgrade on 4S: FMS's 4258 650 kV from the 1400 mm P-40 on
 * the stock four blade (HobbySquawk's FMS P-51 threads), turned the same
 * way, its resistance ESTIMATED at 0.018 ohm. */
const point650 = (() => {
  const kv2 = 650, r2 = 0.018 + 0.003 + 0.008 * cells, Kt2 = 60 / (2 * Math.PI * kv2);
  let lo = 10, hi = kv2 * 3.7 * cells / 60;
  for (let it = 0; it < 80; it += 1) {
    const n = (lo + hi) / 2;
    const P = Cp * rho * n ** 3 * Dp ** 5;
    const I = P / (2 * Math.PI * n) / Kt2 + i0;
    if (n * 60 / kv2 + I * r2 < 3.7 * cells) lo = n; else hi = n;
  }
  const P = Cp * rho * lo ** 3 * Dp ** 5;
  return { rpm: lo * 60, I: P / (2 * Math.PI * lo) / Kt2 + i0, T: Ct * rho * lo * lo * Dp ** 4, rpmNL: kv2 * 3.7 * cells, Vp: kv2 * 3.7 * cells / 60 * pitchIn * IN * 0.85 };
})();
const rpmNL = kv * 3.7 * cells, Vp = rpmNL / 60 * pitchIn * IN * 0.85;
const omegaLoaded = 0.85 * rpmNL * 2 * Math.PI / 60;
const discP = Math.pow(Ts, 1.5) / Math.sqrt(2 * rho * Math.PI * propR * propR);
/*
 * The prop's angular momentum, which the airframe answers in pitch and yaw
 * as it turns: each blade a rod from the hub, 25 g on 0.178 m (FMS's four
 * blade set), m L^2 / 3, four of them, and the spinner and the motor's
 * bell, 60 g at 30 mm and 100 g at 25 mm, m r^2.
 */
const jProp = blades * 0.025 * propR * propR / 3 + 0.060 * 0.03 * 0.03 + 0.100 * 0.025 * 0.025;
/*
 * P factor, the Cub's blade element figure: the yaw arm of the thrust is
 * kappa V sin(alpha) / Omega, kappa = 1 + phi / (2 alpha_b) at 0.75 R. The
 * 14 x 8 at 6,790 rpm loaded, 10 m/s: phi 0.105, the blade at 0.10, 1.5;
 * static 1.35. The Cub's 1.6, at the climb it was taken, is used, the
 * same prop class.
 */
const pfactor = 1.6;
const T = (V, d) => Math.max(0, Ts * d * d * (1 - V / (Vp * d)));
const D = (V, cd0 = CD0) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (cd0 + k * CL * CL); };
const level = (d, cd0 = CD0) => {
  let lo = 5, hi = 40;
  if (T(8, d) < D(8, cd0) && T(lo, d) < D(lo, cd0)) {
    let any = false;
    for (let V = 5; V < 40; V += 0.1) if (T(V, d) > D(V, cd0)) any = true;
    if (!any) return null;
  }
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid, cd0)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const VsFull = Math.sqrt(2 * W / (rho * S * (CLmax + dclmaxFull)));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V, cd0 = CD0) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (cd0 + k * CL * CL); };
let best = { vz: -1, V: 0 };
for (let V = 12; V < 24; V += 0.02) { const vz = (T(V, 1) - D(V)) * V / W; if (vz > best.vz) best = { vz, V }; }

/* Inertia, ESTIMATED: the wing 0.62 kg as a bar across the span with the
 * retracts 0.10 kg a side at 0.23 m, the motor, prop and spinner 0.33 kg
 * 0.33 m ahead, the pack 0.29 kg 0.12 m ahead, the tail 0.11 kg 0.69 m
 * back, the fuselage along its 1.24 m. */
const Ixx = 0.62 * b * b / 12 + 2 * 0.10 * 0.23 * 0.23 + 0.01;
const Iyy = 0.33 * 0.33 * 0.33 + 0.29 * 0.12 * 0.12 + 0.11 * 0.69 * 0.69 + 0.55 * lFus * lFus / 12;
const Izz = Ixx + Iyy - 0.01;

/* The trim: the manual's, "Reduce throttle to half. Put the plane on a
 * straight and level trajectory", then trimmed until it flies hands off.
 * Half the stick is half the prop's pitch speed, 11.5 m/s, under the
 * stall, so no speed is level there: the trim is taken at three quarters,
 * the cruise, as the Kadet's is. */
const Vtrim = level(0.75), CLtrim = 2 * W / (rho * Vtrim * Vtrim * S);
const Cm0 = -Cma * CLtrim / CLa + thrustZ * D(Vtrim) / (0.5 * rho * Vtrim * Vtrim * S * c);

/*
 * The gear as drawn (the side view, scaled): the mains 0.0633 m ahead of
 * the CG and 0.205 m under it on the full size's tread, the tail wheel
 * 0.565 m behind and 0.083 m under, each tyre the full size's scaled. At
 * rest on three points the line through the contacts is the pitch.
 */
const main = { x: px(615), z: pz(655) - rMain };
const tail = { x: px(1488), z: pz(485) - rTail };
const restPitch = Math.atan2(tail.z - main.z, main.x - tail.x);
const wx = (p) => p.x * Math.cos(restPitch) - p.z * Math.sin(restPitch);
const wz = (p) => p.x * Math.sin(restPitch) + p.z * Math.cos(restPitch);
const cgHeight = -wz(main);
const tailShare = wx(main) / (wx(main) - wx(tail));
const loadMain = W * (1 - tailShare) / 2, loadTail = W * tailShare;
const kMain = loadMain / 0.008, kTail = loadTail / 0.006;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const wb = wx(main) - wx(tail);
const mTail = (Iyy + m * wx(main) * wx(main)) / (wb * wb);
const cTail = 2 * 0.6 * Math.sqrt(kTail * mTail);
const noseOver = Math.atan2(wx(main), cgHeight);
const belly = pz(550), canopy = pz(180);
const propTip = thrustZ - propR;

/* The yaw moments on the take off roll, tail down at rest pitch, full
 * throttle, at a speed: P factor, the prop's torque shared onto the left
 * wheel's rolling resistance, and the rudder's full authority to hold
 * them, and the gyroscopic kick of raising the tail at a pitch rate. */
const Oml = omegaLoaded;
const rollYaw = (V) => {
  const Tt = T(V, 1);
  const pf = pfactor * Tt * V * Math.sin(restPitch - alphaZL * 0) / Oml;
  const q = 0.5 * rho * V * V;
  const rud = q * S * b * Math.abs(Cndr) * throwR;
  const torque = discP / Oml;
  const wheel = muGrass * torque / track * track;
  return { V, pfactorNm: pf, rudderNm: rud, share: pf / rud, torqueWheelNm: wheel };
};
const gyroKick = (qRate) => jProp * Oml * qRate;

/* The strips' chords over the mean chord and the section's CL max at
 * each, stall-derive's convention, and the strips' own stall order. */
const strips = [0.125, 0.375, 0.625, 0.875];
const stripC = strips.map((e2) => chordAt(e2 * b / 2) / c);
/* Each strip's section CL max over the root strip's: its Reynolds number
 * against the root's, 0.12 of CL max per halving of it (the UIUC low
 * speed data between 1e5 and 3e5), and its thickness, 15.1 percent at the
 * root to 11.4 at the tip, 0.022 of CL max per percent (Abbott and von
 * Doenhoff, the 63 and 64 series between 12 and 15 percent). */
const tAt = (eta2) => 15.1 - (15.1 - 11.4) * eta2;
const stripK = strips.map((e2, i) => 1 - 0.12 * Math.log2(stripC[0] / stripC[i]) - 0.022 * (tAt(strips[0]) - tAt(e2)));
/* How each strip stalls, by its thickness: a 15 percent section at 2e5
 * the NACA 2415's UIUC curve (held 4.2 deg past its stall, falling to
 * 0.76), a 12 percent one McCullough and Gault's 63-012 (NACA TN 2502,
 * fig. 3: a sharp peak, no rounding, and its lift down to 0.57 of it at
 * once), linear between and clamped at the ends. */
const stripTop = strips.map((e2) => 4.2 * Math.min(1, Math.max(0, (tAt(e2) - 12) / 3)));
const stripFall = strips.map((e2) => 0.57 + (0.76 - 0.57) * Math.min(1, Math.max(0, (tAt(e2) - 12) / 3)));
const schrenk = strips.map((e2, i) => 0.5 * (1 + 4 / Math.PI * Math.sqrt(1 - e2 * e2) / stripC[i]));
const stallOrder = strips.map((e2, i) => ({ eta: e2, rel: stripK[i] / schrenk[i] }));
const relMin = Math.min(...stallOrder.map((o) => o.rel));
const alphaS = CLmax / CLa;

/* The longitudinal model, the plant's equations, trimmed and linearised:
 * scripts/kadet-derive.js's, with the gear up. */
function deriv(x, de, d) {
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
  return [Fx / m - g * Math.sin(thp) + q * w, Fz / m - g * Math.cos(thp) - q * u, My / Iyy, q];
}
function solve3(A, bb) {
  const M = A.map((r, i) => [...r, bb[i]]);
  for (let i = 0; i < 3; i += 1) {
    let p = i;
    for (let r = i + 1; r < 3; r += 1) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < 3; r += 1) { const ff = M[r][i] / M[i][i]; for (let j = i; j < 4; j += 1) M[r][j] -= ff * M[i][j]; }
  }
  const out = [0, 0, 0];
  for (let i = 2; i >= 0; i -= 1) { let sum = M[i][3]; for (let j = i + 1; j < 3; j += 1) sum -= M[i][j] * out[j]; out[i] = sum / M[i][i]; }
  return out;
}
function roots(coef) {
  const n = coef.length - 1;
  const a = coef.map((v) => v / coef[0]);
  const cm = (x, y) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
  const cs = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });
  const cd = (x, y) => { const dd = y.re * y.re + y.im * y.im; return { re: (x.re * y.re + x.im * y.im) / dd, im: (x.im * y.re - x.re * y.im) / dd }; };
  const pe = (z) => a.reduce((acc, cf) => { const t = cm(acc, z); return { re: t.re + cf, im: t.im }; }, { re: 0, im: 0 });
  let r = Array.from({ length: n }, (_, i) => ({ re: Math.cos(i * 1.3 + 0.4), im: Math.sin(i * 1.3 + 0.4) }));
  for (let it = 0; it < 800; it += 1) {
    r = r.map((z, i) => { let den = { re: 1, im: 0 }; r.forEach((w2, j) => { if (j !== i) den = cm(den, cs(z, w2)); }); return cs(z, cd(pe(z), den)); });
  }
  return r;
}
function charPoly(A) {
  const n = A.length;
  const mul = (X, Y) => X.map((row, i) => Y[0].map((_, j) => row.reduce((sum, _v, kk) => sum + X[i][kk] * Y[kk][j], 0)));
  const coef = [1];
  let M = A.map((row, i) => row.map((_, j) => (i === j ? 1 : 0)));
  for (let kk = 1; kk <= n; kk += 1) {
    const AM = mul(A, M);
    const ck = -AM.reduce((sum, row, i) => sum + row[i], 0) / kk;
    coef.push(ck);
    M = AM.map((row, i) => row.map((v, j) => v + (i === j ? ck : 0)));
  }
  return coef;
}
function longitudinalModes(V) {
  const res = (p) => { const r = deriv([V * Math.cos(p[0]), -V * Math.sin(p[0]), 0, p[0]], p[1], p[2]); return [r[0], r[1], r[2]]; };
  let p = [0.02, 0, 0.7];
  for (let it = 0; it < 60; it += 1) {
    const r = res(p);
    const Jm = [0, 1, 2].map((j) => { const pp = p.slice(); pp[j] += 1e-7; const rr = res(pp); return rr.map((v, i) => (v - r[i]) / 1e-7); });
    const dx = solve3([0, 1, 2].map((i) => [0, 1, 2].map((j) => Jm[j][i])), r.map((v) => -v));
    p = p.map((v, i) => v + dx[i]);
  }
  const x0 = [V * Math.cos(p[0]), -V * Math.sin(p[0]), 0, p[0]];
  const A = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => {
    const xp = x0.slice(), xm = x0.slice(); xp[j] += 1e-6; xm[j] -= 1e-6;
    return (deriv(xp, p[1], p[2])[i] - deriv(xm, p[1], p[2])[i]) / 2e-6;
  }));
  const modes = roots(charPoly(A)).filter((r) => r.im > 1e-6).map((r) => { const wn = Math.hypot(r.re, r.im); return { period: 2 * Math.PI / r.im, zeta: -r.re / wn }; });
  modes.sort((x, y) => y.period - x.period);
  return { thetaDeg: p[0] * DEG, deDeg: p[1] * DEG, duty: p[2], phugoid: modes[0], short: modes[1] };
}

/* Energy: level at full throttle with the gear up, then the throttle
 * closed and the height held, the speed after 3 s and the distance the
 * aircraft carries to 1.3 Vs, against the Kadet Senior's same coast from
 * its top speed (its derivation's numbers). */
function coast(V0, mass, area, cd0, kk, until) {
  let V = V0, t = 0, x = 0, v3 = null;
  const dt = 0.001;
  while (V > until && t < 120) {
    const q = 0.5 * rho * V * V;
    const CL = mass * g / (q * area);
    V -= q * area * (cd0 + kk * CL * CL) / mass * dt;
    x += V * dt; t += dt;
    if (v3 === null && t >= 3) v3 = V;
  }
  return { v3, t, x };
}

/* The take off: full throttle from three points with the stick forward,
 * the tail up at 4 deg of pitch once the elevator lifts it, then rotated
 * to 8 deg at 1.1 Vs; liftoff when the lift at 8 deg carries the weight.
 * Rolling resistance on the weight the wing is not carrying. */
function takeoff() {
  let V = 0, x = 0, t = 0, vTail = null;
  const dt = 0.0005;
  const clOf = (pitch) => CLa * (pitch - alphaZL);
  const cdOf = (cl) => CD0 + cdGear + k * cl * cl;
  while (t < 20) {
    const q = 0.5 * rho * V * V;
    const threePoint = vTail === null;
    const pitch = threePoint ? restPitch : (V < 1.1 * Vs ? 4 / DEG : 8 / DEG);
    const cl = Math.min(clOf(pitch), CLmax);
    if (!threePoint && pitch > 5 / DEG && q * S * cl >= W) break;
    if (threePoint) {
      const cm = Cm0 + Cma * (restPitch - alphaZL) - Cmde * throwE;
      if (-cm * q * S * c >= (W - q * S * cl) * wx(main)) vTail = V;
    }
    const acc = (T(V, 1) - q * S * cdOf(cl) - muGrass * Math.max(0, W - q * S * cl)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, V, vTail };
}

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const J = (o, n = 3) => JSON.stringify(o, (kk, v) => (typeof v === 'number' ? +v.toFixed(n) : v));
const rows = [
  ['scale, c = S/b, MAC, AR, W/S N/m2', `${f(s, 5)} ${f(c, 4)} ${f(mac, 4)} ${f(AR, 3)} ${f(W / S, 1)}`],
  ['root, tip chord (trapezoid), fuselage side', `${f(cr, 4)} ${f(ct, 4)} ${f(chordAt(yFus), 4)}`],
  ['Sh, bh, ARt, Sv, lh, lv, zv', `${f(Sh, 4)} ${f(bh, 4)} ${f(ARt, 2)} ${f(Sv, 4)} ${f(lh, 4)} ${f(lv, 4)} ${f(zv, 4)}`],
  ['x ac wing, NP (from CG, m); h_cg per MAC', `${f(xAcWing, 4)} ${f(xNP, 4)}; ${f(hCG, 3)}`],
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα DATCOM, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, static margin (fuselage dh)', `${f(CLa)} ${f(SM, 4)} (${f(fusCma / CLa, 4)})`],
  ['zero lift line deg, sin, cos', `${f(alphaZL * DEG, 2)} ${Math.sin(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)} ${Math.cos(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde)} ${f(CLde)}`],
  ['CYβ, Cnβ (fuselage), Cnr', `${f(CYb)} ${f(Cnb, 4)} (${f(CnbFus, 4)}) ${f(Cnr, 4)}`],
  ['Clβ (the low wing\'s), Clp, Clδa', `${f(Clb, 4)} (${f(ClbLow, 4)}) ${f(Clp)} ${f(Clda, 4)}`],
  ['Cnδr, CYδr, Clδr; tau e, r, a', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}; ${f(tauE)} ${f(tauR)} ${f(tauAil)}`],
  ['throws a, e, r deg; flaps half, full deg', `${f(throwA * DEG, 4)} ${f(throwE * DEG, 4)} ${f(throwR * DEG, 4)}; ${f(flapHalf * DEG, 2)} ${f(flapFull * DEG, 2)}`],
  ['   in rad a, e, r, flaps half, full', `${throwA.toPrecision(17)} ${throwE.toPrecision(17)} ${throwR.toPrecision(17)} ${flapHalf.toPrecision(17)} ${flapFull.toPrecision(17)}`],
  ['flaps: S_f/S, dCL half full, fit a b', `${f(SfS)} ${f(dclHalf)} ${f(dclFull)}; ${f(clDf, 4)} ${f(clDf2, 4)}`],
  ['   dCLmax full, per rad; CD per rad2; Cm per dCL', `${f(dclmaxFull)} ${f(clmaxDf, 4)}; ${f(cdDf2, 4)}; ${f(cmPerDcl, 4)}`],
  ['motor static: rpm, A, W shaft, thrust N', `${f(staticPoint.rpm, 0)} ${f(staticPoint.I, 1)} ${f(staticPoint.P, 0)} ${f(Ts, 2)}`],
  ['the 650 kV upgrade: static rpm, A, thrust N; rpm NL, Vp', `${f(point650.rpm, 0)} ${f(point650.I, 1)} ${f(point650.T, 2)}; ${f(point650.rpmNL, 0)} ${f(point650.Vp, 3)}`],
  ['rpm no load, Vp, omega loaded',`${f(rpmNL, 0)} ${f(Vp, 3)} ${f(Oml, 1)}`],
  ['disc W, torque N m, torque arm m', `${f(discP, 1)} ${f(discP / Oml, 4)} ${f(discP / Oml / Ts, 4)}`],
  ['prop J kg m2, H at full N m s', `${jProp.toPrecision(4)} ${f(jProp * Oml, 4)}`],
  ['level at 100, 75, 50 percent, gear up', `${f(level(1), 2)} ${f(level(0.75), 2)} ${f(level(0.5), 2)}`],
  ['level at 100 percent, gear down', f(level(1, CD0 + cdGear), 2)],
  ['stall clean, full flap (formula)', `${f(Vs, 2)} ${f(VsFull, 2)}`],
  ['approach 1.3 Vs full flap, clean', `${f(1.3 * VsFull, 2)} ${f(1.3 * Vs, 2)}`],
  ['glide: best L/D at, at 14, gear down at 14', `${f(LDmax, 2)} ${f(Vmd, 2)}; ${f(ld(14), 2)}; ${f(ld(14, CD0 + cdGear), 2)}`],
  ['energy: decel at top speed throttle closed m/s2, time const s', `${f(D(level(1)) / m, 3)} ${f(level(1) * m / (2 * D(level(1))), 2)}`],
  ['best climb m/s at m/s', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['Inertia Ixx Iyy Izz', `${f(Ixx)} ${f(Iyy)} ${f(Izz)}`],
  ['trim: V at 3/4 throttle', f(Vtrim, 2)],
  ['gear: main x z, tail x z (body)', `${f(main.x, 4)} ${f(main.z, 4)} ${f(tail.x, 4)} ${f(tail.z, 4)}`],
  ['   rest pitch deg, CG height, tail share', `${f(restPitch * DEG, 2)} ${f(cgHeight, 4)} ${f(tailShare, 4)}`],
  ['   k main, c main, k tail, c tail; nose over deg', `${f(kMain, 0)} ${f(cMain, 2)} ${f(kTail, 0)} ${f(cTail, 2)}; ${f(noseOver * DEG, 1)}`],
  ['   track, r main, r tail; belly, canopy, prop tip z', `${f(track, 4)} ${f(rMain, 4)} ${f(rTail, 4)}; ${f(belly, 4)} ${f(canopy, 4)} ${f(propTip, 4)}`],
  ['   prop x, thrust z', `${f(propX, 4)} ${f(thrustZ, 4)}`],
  ['roll yaw at 5 m/s', J(rollYaw(5), 4)],
  ['roll yaw at 8 m/s', J(rollYaw(8), 4)],
  ['gyro kick at 0.5 rad/s tail raise, N m', f(gyroKick(0.5), 4)],
  ['strips: c/cmean', stripC.map((x) => x.toFixed(4)).join(', ')],
  ['   section CL max ratio', stripK.map((x) => x.toFixed(4)).join(', ')],
  ['   Schrenk r', schrenk.map((x) => x.toFixed(4)).join(', ')],
  ['   stall alpha rel (k/r / min), deg with washout', stallOrder.map((o) => `${(o.rel / relMin).toFixed(3)} ${((alphaS * o.rel / relMin + washout * o.eta) * DEG).toFixed(2)}`).join(', ')],
  ['washout deg', f(washout * DEG, 3)],
  ['   thickness percent', strips.map((e2) => tAt(e2).toFixed(2)).join(', ')],
  ['   strip_top deg, strip_kfall', `${stripTop.map((x) => x.toFixed(2)).join(', ')}; ${stripFall.map((x) => x.toFixed(3)).join(', ')}`],
  ['roll: pb/2V full aileron, deg/s at 15, 18 m/s', `${f(Clda * throwA / -Clp, 4)} ${f(Clda * throwA / -Clp * 2 * 15 / b * DEG, 0)} ${f(Clda * throwA / -Clp * 2 * 18 / b * DEG, 0)}`],
  ['glide L/D at 13 m/s, gear up; sink', `${f(ld(13), 2)} ${f(13 / ld(13), 3)}`],
  ['coast from top, gear up: v at 3 s, s to 1.3 Vs, m', J(coast(level(1), m, S, CD0, k, 1.3 * Vs), 2)],
  ['   the Kadet from its 18.28 m/s: v at 3 s, to 1.3 Vs', J(coast(18.28, 2.7216, 0.741934, 0.042, 0.08022, 1.3 * 7.15), 2)],
  ['take off roll, grass', J(takeoff(), 3)],
  ['gear up vs down top speed delta', f(level(1) - level(1, CD0 + cdGear), 3)],
];
const lm = longitudinalModes(level(0.75));
rows.push(['trim at 75 percent: theta, de, duty', `${f(lm.thetaDeg, 2)} ${f(lm.deDeg, 2)} ${f(lm.duty)}`]);
rows.push(['   phugoid s, zeta; short period s, zeta', `${f(lm.phugoid && lm.phugoid.period, 2)} ${f(lm.phugoid && lm.phugoid.zeta)}; ${f(lm.short && lm.short.period, 2)} ${f(lm.short && lm.short.zeta)}`]);
for (const [name, v] of rows) {
  console.log(`${name.padEnd(52)} ${v}`);
}
