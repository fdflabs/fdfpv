/*
 * nighttimber-derive.js: the arithmetic behind docs/NIGHTTIMBER-STAGE1.md,
 * from E-flite's published figures for the Night Timber X 1.2m (EFL13850
 * BNF Basic, EFL13875 PNP) and its photographs to every coefficient of
 * FW_NIGHTTIMBER1200 and every derived band in
 * tests/nighttimber-thresholds.json. It never loads the plant: this is
 * what the plant is checked against, so it has to stand apart from it.
 * Harness arithmetic in JS maths, which is allowed here because nothing it
 * prints is hashed. Run with npm run nighttimber:derive.
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

import { shares, wash as washOf } from './lib/wash.js';

const DEG = 180 / Math.PI;
const rho = 1.225;
const g = 9.81;

/*
 * THE AIRCRAFT. E-flite's manual (EFL13850-Manual-EN.pdf, p. 3) and the
 * product page's dimensioned top view (EFL13875_A73): span 1200 mm, length
 * 1055 mm, 34 dm^2, flying weight 57 to 60 oz, 1613 to 1698 g, on a 3S or
 * a 4S 2200: the two packs' 85 g apart is the range, so the suggested 4S
 * 2200 (SPMX22004S30) flies at 1698 g. The product page's infographic
 * says 1613 g "without battery" and 1883 g with it; Model Aviation's Timber
 * X review weighed its flying model at 54.5 oz, 1545 g, and E-flite says
 * the Night Timber X keeps "the same flying weight as the original Timber
 * X", so the manual's range is the flying weight and the infographic's
 * 1883 g is not taken. The 4S 2200 is 270 g (the infographic's
 * difference). The manual's CG (p. 8,
 * "without slats installed"): 89 mm +/- 3 behind the wing's leading edge
 * at the root with the carbon stabiliser joiner, 102 mm with the steel one
 * "for maximum 3D performance". The carbon joiner's 89 mm is taken: it is
 * the manual's first, and the video this aircraft is checked against
 * (analysis/3D-VIDEO-LESSONS.md) flew it with the tail weight and the
 * steel spar taken out, the nose heavy end.
 */
const b = 1.200, m = 1.698, W = m * g;
const packM = 0.270;

/*
 * The planform off EFL13875_A73, 1200 mm over 1457 px, 0.8236 mm a pixel
 * (the length comes out 1048 mm against the published 1055, 0.7 percent):
 * a constant chord wing, its slat line 481 to 531 px, the wing's own
 * leading edge at 536 and its trailing edge at 831, the flaps and ailerons
 * from 718. So the slat adds 41 mm to a 243 mm chord, and E-flite's 34
 * dm^2 is the slatted planform (1.2 by 0.288 less the rounded tips).
 * The aircraft ships with the slats in the box and off the wing: the
 * manual's CG is "without slats installed", and its slat page is
 * "optional". Clean, the area is E-flite's scaled by the chord.
 */
const PX = 1.2 / 1457;
const cClean = (831 - 536) * PX, cSlat = (831 - 481) * PX;
const S = 0.34 * cClean / cSlat;
const c = S / b, AR = b * b / S;
const cf = (831 - 718) * PX / cClean; /* the flaps' and ailerons' chord share */
/* The wing's halves from the top view's centreline at 1053.5 px: the
 * flaps from the fuselage's side, 940 px, to the break at 666, the
 * ailerons from there to 370, the tip at 325. */
const flapIn = (1053.5 - 940) * PX, flapOut = (1053.5 - 666) * PX, ailOut = (1053.5 - 370) * PX;
/* Full span ailerons: the manual's advanced setup (pp. 18 and 19) mixes
 * the flaps into the ailerons at the ailerons' own travel ("adjust the
 * percentages in P-Mix 2 and 3 to match the flap travel to aileron travel
 * at full aileron right and left"), and that is how the video's pilot
 * flies it ("full-span ailerons always on", 02:20). The flap panels
 * still go down together on the flap switch as well. */
const ailIn = flapIn;
/* Along the body off the top view: the spinner's tip at 232 px, the
 * prop's disc at 270, the wing's root leading edge at 536; the
 * stabiliser 495 mm across, its root leading edge at 1245, the elevator's
 * hinge at 1340 and its trailing edge at a mean 1445. */
const tipToLE = (536 - 232) * PX;
const cgBehindLE = 0.089;
const cgFromTip = tipToLE + cgBehindLE;
const propX = cgFromTip - (270 - 232) * PX;
const bh = 601 * PX;
const stabLE = 1245, stabHinge = 1340, stabTE = 1445;
const cStab = (stabTE - stabLE) * PX;
const Sh = bh * cStab - 0.5 * 0.07 * 0.06; /* less the rudder's notch, about 70 by 60 mm */
const lh = (stabLE + 0.25 * (stabTE - stabLE) - 536) * PX - cgBehindLE;
const cfE = (stabTE - stabHinge) / (stabTE - stabLE);
const hCG = cgBehindLE / c;

/*
 * The side view, EFL13875_A02, 0.5666 mm a pixel along the body (the
 * spinner's tip at x 59 to the rudder's trailing edge at 1921 over the
 * published 1055 mm, the body pitched as below). The spinner's cone, its
 * upper edge at 22.6 deg and its lower at 31.7, puts its axis, the thrust
 * line, 4.5 deg nose up of the ground the wheels stand on. In the body
 * frame, the thrust line the x axis: the main axles 193 mm behind the
 * spinner's tip and 213 mm under the line, 113 mm tyres; the tailwheel's
 * axle 969 mm behind and 192 mm under, a 29 mm wheel. Both wheels touch a
 * level ground at that pitch within 2 mm, which is the check on it. The
 * fin and rudder from 80 mm over the thrust line to 147 mm under it, the
 * stabiliser 113 mm under it, the wing's chord 65 mm over it on the
 * cabin's roof.
 */
const restPitchDeg = 4.5;
const mainX = cgFromTip - 0.193, mainZ = -0.213, mainR = 0.0565;
const tailX = cgFromTip - 0.969, tailZ = -0.192, tailR = 0.0145;
const hvUp = 0.080, hvDn = 0.147, zStab = -0.113, zWing = 0.065;
/* The fin and rudder: 0.034 m^2 off the side view, the rudder 99 mm of
 * its chord at the widest, about 0.6 of the area; its quarter chord 0.58 m
 * behind the CG. zv, the fin's centre of pressure, 33 mm under the
 * thrust line on that span. */
const Sv = 0.034, lv = 0.58, zv = (hvUp - hvDn) / 2, cfR = 0.60;
const arVgeo = (hvUp + hvDn) ** 2 / Sv;
const arV = 1.55 * arVgeo; /* the stabiliser and the fuselage end plate it, Roskam's usual factor, as the Extra's */
const fusL = 1.055, fusW = 0.112, fusD = 0.15;
const fusVol = fusL * fusW * fusD * 0.6;
const propR = 13 * 0.0254 / 2;

/*
 * The section and the drag. The Turbo Timber's: a thick semi symmetric
 * section (E-flite, "Airfoil Shape: Semi-symmetrical"), CLmax 1.15 clean,
 * its zero lift line 5 deg under the body axis, e 0.78. The zero lift
 * drag is the Timber's 0.042 with its gear's share, about 0.015 of it,
 * grown by the smaller wing it is counted on (0.361 / S): the same tundra
 * tyres on a wing a fifth smaller. ESTIMATED.
 */
const CLmax = 1.15, e = 0.78, k = 1 / (Math.PI * e * AR);
const CD0 = 0.042 - 0.015 + 0.015 * 0.361 / S;
const alphaZL = -5 / DEG;
const blend = 3 / DEG;
const eta = 0.9;

/*
 * The throws, the manual's high rates (p. 3) at each surface's widest
 * chord: ailerons 45 mm each way on 93 mm, elevator 55 on the elevator's
 * 94 mm at its tips, rudder 55 on 99 mm, the flaps 30 mm at half and 55
 * at full on 93 mm.
 */
const ailChord = (831 - 718) * PX, elevChord = 0.094, rudChord = 0.099;
const throwA = Math.asin(0.045 / ailChord), throwE = Math.asin(0.055 / elevChord), throwR = Math.asin(0.055 / rudChord);
const flapHalf = Math.asin(0.030 / ailChord), flapFull = Math.asin(0.055 / ailChord);
/* The manual's flap mix (p. 4, every transmitter's table): half flap
 * with 14 percent of the elevator, full flap with 20, taken nose down as
 * the Turbo Timber's is. The plant's mix is one gain, elevator per flap
 * angle, so the line through both notches and the origin by least
 * squares. */
const mixHalf = 0.14 * throwE, mixFull = 0.20 * throwE;
const deDf = -(mixHalf * flapHalf + mixFull * flapFull) / (flapHalf * flapHalf + flapFull * flapFull);

const kPrime = (d) => { const x = d * DEG; return x < 15 ? 1 : 4e-7 * x ** 4 - 7e-5 * x ** 3 + 0.0047 * x ** 2 - 0.1453 * x + 2.3167; };
const tauOf = (f) => { const th = Math.acos(1 - 2 * (1 - f)); return 1 - (th - Math.sin(th)) / Math.PI; };
const tauA = tauOf(cf) * kPrime(throwA), tauE = tauOf(cfE) * kPrime(throwE), tauR = tauOf(cfR) * kPrime(throwR);

/* The coefficients, Nelson's forms as for the Cub, the Timber and the Extra. */
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const deda = 2 * aw / (Math.PI * AR);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const fusCma = 0.006 * fusW * fusW * fusL / (c * S) * DEG; /* Raymer eq. 16.25, K_fus 0.006 per deg */
const hn = 0.25 + VH * eta * (at / aw) * (1 - deda) - fusCma / CLa;
const SM = hn - hCG, Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c, Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
/* The trim: hands off at its sport pace, 13 m/s, the Timber's. */
const Vtrim = 13, CLtrim = 2 * W / (rho * Vtrim * Vtrim * S), Cm0 = -Cma * CLtrim / CLa;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const CYb = -av * Sv / S - 0.11;
const Cnb = av * VV - 1.3 * fusVol / (S * b);
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/* A flat wing on top (the front view, EFL13875_A04): no dihedral, the
 * high wing's roll (DATCOM, -1.2 sqrt(A) (z_w / b)(2 D / b)) and the
 * fin's, which sits mostly under the thrust line and so rolls the other
 * way. */
const ClbFin = -av * (Sv / S) * (zv / b), ClbHigh = -1.2 * Math.sqrt(AR) * (zWing / b) * (2 * fusD / b);
const Clb = ClbFin + ClbHigh;
const Clp = -aw * (1 + 3) / (12 * (1 + 1)); /* (1 + 3 lambda) / (12 (1 + lambda)) at a constant chord, lambda 1 */
function integrate(f, a, bb, n = 4000) { let s = 0; for (let i = 0; i < n; i += 1) { const y = a + (bb - a) * (i + 0.5) / n; s += f(y) * (bb - a) / n; } return s; }
const Clda = 2 * aw * tauA * integrate((y) => c * y, ailIn, ailOut) / (S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
/* The ailerons' share of each stall strip, the plant's four a side at an
 * eighth, three, five and seven eighths of the semispan, each a quarter
 * of it wide. */
const stripTau = [0, 1, 2, 3].map((i) => {
  const y0 = i * b / 8, y1 = (i + 1) * b / 8;
  return tauA * Math.max(0, Math.min(y1, ailOut) - Math.max(y0, ailIn)) / (y1 - y0);
});

/*
 * The flaps, plain, inboard: Raymer's and DATCOM's forms as the Timber's,
 * with a plain flap's large deflection K' in place of the slotted's
 * factor. CLmax: Raymer eq. 12.21, 0.9 for a plain flap times the flapped
 * area's share. Drag: Raymer eq. 12.61, F 0.0144 for a plain flap, and
 * the part span flap's induced drag. Pitch: the section's own nose down
 * moment and the downwash at the tail, as the Timber's.
 */
const SfS = 2 * (flapOut - flapIn) * c / S;
const tauF = tauOf(cf);
const flapCL = (d) => 2 * Math.PI * tauF * kPrime(d) * d * (aw / (2 * Math.PI)) * SfS;
const dclHalf = flapCL(flapHalf), dclFull = flapCL(flapFull);
const clDf2 = (dclFull / flapFull - dclHalf / flapHalf) / (flapFull - flapHalf);
const clDf = dclHalf / flapHalf - clDf2 * flapHalf;
const dclmaxFull = 0.9 * 0.9 * SfS;
const clmaxDf = dclmaxFull / flapFull;
const flapCd = (d, dcl) => 0.0144 * cf * SfS * Math.max(0, d * DEG - 10) + 0.14 * 0.14 * dcl * dcl;
const cdDf2 = flapCd(flapFull, dclFull) / (flapFull * flapFull);
const thH = Math.acos(1 - 2 * (1 - cf));
const cmTE = -0.5 * Math.sin(thH) * (1 - Math.cos(thH));
const cmPerDcl = cmTE / (2 * Math.PI * tauF) + (hCG - 0.25) + eta * VH * at * 1.5 * 2 / (Math.PI * AR);
const flapRate = flapFull / 2; /* across in 2 s, E-flite's flap speed setting, "SPEED 2.0S" */

/*
 * The mass and its moments of inertia, built from the parts: each part's
 * class, ESTIMATED, the airframe's shell taking what E-flite's 1613 g
 * leaves, and the pack slid to the manual's CG.
 */
const parts = [
  { name: 'BL10 motor, prop, spinner, mount', m: 0.150, x: propX - 0.02, z: 0 },
  { name: 'Avian 60 A ESC', m: 0.060, x: propX - 0.12, z: -0.02 },
  { name: 'receiver, LED regulator, wiring', m: 0.050, x: 0.0, z: 0.0 },
  { name: 'tail servos, pushrods', m: 0.030, x: -0.05, z: 0.0 },
  { name: 'stabiliser and elevator', m: 0.060, x: -lh, z: zStab },
  { name: 'fin and rudder', m: 0.030, x: -lv, z: zv },
  { name: 'main gear, tundra tyres', m: 0.160, x: mainX, z: -0.15 },
  { name: 'tailwheel', m: 0.020, x: tailX, z: tailZ },
];
const wingM = 0.500; /* the foam panels, the tube, four servos, the LED strips */
let known = wingM;
for (const p of parts) known += p.m;
const shellM = (m - packM) - known; /* the fuselage's foam, cowl and cabin */
const fusX = [cgFromTip - fusL, cgFromTip];
parts.push({ name: 'fuselage shell', m: shellM, x0: fusX[0] + 0.25, x1: fusX[1], z: 0.0 });
const xOf = (p) => (p.x0 === undefined ? p.x : (p.x0 + p.x1) / 2);
const x2Of = (p) => (p.x0 === undefined ? p.x * p.x : (p.x0 * p.x0 + p.x0 * p.x1 + p.x1 * p.x1) / 3);
let mx = wingM * (-(cgBehindLE - 0.5 * c));
for (const p of parts) mx += p.m * xOf(p);
const packX = -mx / packM;
const wingIxx = wingM * b * b / 12;
let Ixx = wingIxx + wingM * zWing * zWing, Iyy = wingM * (c * c / 12 + zWing * zWing), Izz = wingIxx + wingM * c * c / 12;
for (const p of parts) {
  Ixx += p.m * p.z * p.z;
  Iyy += p.m * (x2Of(p) + p.z * p.z);
  Izz += p.m * x2Of(p);
}
Iyy += packM * packX * packX;
Izz += packM * packX * packX;
Ixx += 0.160 * 0.16 * 0.16; /* the main wheels 0.16 m each side */

/*
 * THE MOTOR, ESTIMATED: E-flite publishes the BL10 900 kV (EFLM17553) and
 * the 13 x 4 prop, not a bench figure. A DC motor on the pack as the
 * Extra's: R and I0 are E-flite's Power 10's (the same 10 size, 0.04 ohm
 * and 2.1 A at 1100 kV, EFLM4010A) wound for 900 kV, R by the square of
 * the turns and I0 by kV, 0.060 ohm and 1.7 A; the pack the plant's, 4S
 * at 3.7 V a cell and 8 milliohm a cell, and 5 milliohm of ESC and wire.
 * The prop is APC's 13 x 4E (PER3_13x4E.dat) static rows: 10,000 rpm
 * 0.374 N m and 25.62 N; 11,000 rpm 0.454 and 31.28; 12,000 rpm 0.543
 * and 37.60.
 */
const kv = 900, cells = 4, vNom = 3.7 * cells, rPack = 0.008 * cells, rMotor = 0.060, rEsc = 0.005, i0 = 1.7;
const apc = [[10000, 0.374, 25.620], [11000, 0.454, 31.277], [12000, 0.543, 37.601]];
function apcAt(n, col) {
  const kf = (r) => r[col] / (r[0] * r[0]);
  if (n <= apc[0][0]) return kf(apc[0]) * n * n;
  for (let i = 1; i < apc.length; i += 1) {
    if (n <= apc[i][0]) { const a = apc[i - 1], bb = apc[i]; return (kf(a) + (n - a[0]) / (bb[0] - a[0]) * (kf(bb) - kf(a))) * n * n; }
  }
  return kf(apc[apc.length - 1]) * n * n;
}
const kt = 60 / (2 * Math.PI * kv);
let nStatic = 10000;
for (let it = 0; it < 400; it += 1) {
  const q = apcAt(nStatic, 1);
  const i = q / kt + i0;
  const vm = vNom - i * (rPack + rEsc);
  const n = kv * (vm - i * rMotor);
  nStatic += 0.3 * (n - nStatic);
}
const Qs = apcAt(nStatic, 1), Ts = apcAt(nStatic, 2), Is = Qs / kt + i0;
const rpmNL = kv * vNom, Vp = 0.85 * rpmNL / 60 * 4 * 0.0254;
const torqueArm = Qs / Ts;
const T = (V, d) => Math.max(0, Ts * d * d * (1 - Math.max(0, V) / (Vp * d)));
/* The prop's inertia, ESTIMATED: a 13 in prop of about 25 g, a tapered
 * blade's 0.7 of a rod's m D^2 / 12, and the BL10's can. */
const propJ = 0.7 * 0.025 * (2 * propR) ** 2 / 12 + 0.04 * 0.017 * 0.017;

/* Performance, the plant's polar. */
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 7, hi = 45;
  if (T(lo, d) < D(lo) && T(9, d) < D(9)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const VsFull = Math.sqrt(2 * W / (rho * S * (CLmax + dclmaxFull)));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
const pb2v = Clda * throwA / -Clp;
const rollAt = (V) => pb2v * 2 * V / b;

/* THE 3D REGIME, as the Extra's derivation takes it. */
const hoverDuty = Math.sqrt(W / Ts);
let vClimb = 0;
for (let V = 0; V < 30; V += 0.001) { if (T(V, 1) - W - 0.5 * rho * V * V * S * CD0 <= 0) { vClimb = V; break; } }

/* The slipstream's shares, scripts/lib/wash.js as every tractor's: the
 * stabiliser's half span, the fin over and under the thrust line, the
 * ailerons' span. Its zero lift at the trim cm_0 is set for. */
const slipA0 = alphaZL + CLtrim / CLa;
const slip = shares({ propR, bh, hv: [hvUp, hvDn], ya: [ailIn, ailOut], at, Sh, S, eta, deda, VH, av, VV, lv, b, Sv, ClbFin, a0: slipA0 });
const hov = washOf(slip, W, 0);

/* The air a slow aircraft turns through, Hoerner's flat plate, C_N 1.17,
 * as the Extra's: the wing, the stabiliser and the fin in roll; the
 * stabiliser, the fuselage's plan and the wing's chord in pitch; the fin,
 * the fuselage's side and the wing's chord in yaw. */
const CN = 1.17;
const plate = (chord, a, bb) => 0.5 * rho * CN * integrate((r) => chord(r) * Math.abs(r) ** 3, a, bb);
const rotK = [
  plate(() => c, -b / 2, b / 2) + plate(() => Sh / bh, -bh / 2, bh / 2) + plate(() => Sv / (hvUp + hvDn), -hvDn, hvUp),
  plate(() => fusW, fusX[0], fusX[1]) + 0.5 * rho * CN * Sh * lh ** 3 + plate(() => b, -c / 2, c / 2),
  plate(() => fusD, fusX[0], fusX[1]) + 0.5 * rho * CN * Sv * lv ** 3 + plate(() => b, -c / 2, c / 2) * 0.2,
];
/* The side crossflow drag area: the fuselage's side at Allen and Perkins'
 * 1.2 times their eta of 0.7, as the Extra's and the Timber's. */
const sideCda = fusL * 0.13 * 1.2 * 0.7;

/* The torque roll and the aileron against it, SWIRL_KEEP the plant's 0.74
 * (Selig, AIAA 2010-7938; docs/FLIGHTMODEL.md). */
const SWIRL_KEEP = 0.74;
const Qprop = torqueArm * W;
const finSwirl = S * b * rho * hov.vi * hov.fv * slip.slip_cl_b * -(Qprop * (Math.min(hov.rw, hvUp) - Math.min(hov.rw, hvDn)) / (rho * Math.PI * propR * propR * hov.vi * hov.rw * hov.rw));
const Qhover = Qprop - (1 - SWIRL_KEEP) * Qprop - SWIRL_KEEP * finSwirl;
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
/* The axles are drawn 5 mm low and the springs take that 5 mm back. */
const cgHeight = (mainHw + tailHw) / 2;

/* The post stall arms, the Extra's forms, in chords: the CG's distance
 * behind the wing's aerodynamic centre and ahead of the stalled plate's
 * centre of pressure at 0.40 of the chord, and the tail's lift as the
 * downwash goes. */
const armAc = hCG - 0.25, armCp = 0.40 - hCG, stallDw = eta * VH * at * deda / aw;
const stallTop = 3.7 / DEG, stallK = 0.63;

/*
 * The plant's post stall lift on the whole wing (plant_wing.c,
 * stalled_lift), as the Extra's derivation takes it, for the harrier and
 * the knife edge. alpha is the zero lift line's, as the plant's is.
 */
function smooth(a0, a1, x) { if (x <= a0) return 0; if (x >= a1) return 1; const t = (x - a0) / (a1 - a0); return t * t * (3 - 2 * t); }
function clPlant(alpha) {
  const aS = CLmax / CLa;
  const sig = smooth(aS - blend, aS + blend, Math.abs(alpha));
  const lin = CLa * alpha, plateL = 2 * Math.sin(alpha) * Math.cos(alpha);
  const old = (1 - sig) * lin + sig * plateL;
  if (sig <= 0) return { CL: lin, CD: CD0 + k * lin * lin, sig, clSt: lin, fall: 0, past: 0 };
  let clS = 0;
  for (let i = 0; i <= 16; i += 1) {
    const ai = aS - blend + blend * 0.125 * i;
    const si = smooth(aS - blend, aS + blend, ai);
    clS = Math.max(clS, (1 - si) * CLa * ai + si * 2 * Math.sin(ai) * Math.cos(ai));
  }
  const a0 = aS + stallTop, a1 = a0 + 2 * blend;
  const t = smooth(a0, a1, Math.abs(alpha));
  const st = Math.min(a1, 0.5);
  const a2 = (stallK * clS - 2 * Math.sin(st) * Math.cos(st)) * Math.sin(st) / (Math.cos(st) ** 2);
  const vit = Math.cos(alpha) > 0 && Math.abs(Math.sin(alpha)) > 0.05 ? a2 * Math.cos(alpha) ** 2 / Math.sin(alpha) : 0;
  const clSt = (1 - t) * clS + t * (plateL + vit);
  const past = smooth(aS, aS + blend, Math.abs(alpha));
  const CL = old + past * (clSt - old);
  const CD = (1 - sig) * (CD0 + k * lin * lin) + sig * (CD0 + 2 * Math.sin(alpha) ** 2);
  return { CL, CD, sig, clSt, fall: t, past };
}
const tailCnH = 1.17;
const plateRatioH = (x) => 1 / Math.sqrt(Math.sqrt(1 + (x / tailCnH) ** 4));
const vhTH = -slip.slip_cm_a / (at * (1 - deda));
/*
 * The static margin the plant reads, as tuning:check U2 measures it:
 * -dCm/dCL at cruise, sticks centred, between the body at 0 and at 0.03
 * rad, the zero lift line at 5 to 6.7 deg. With hi_alpha the plant's
 * pitch stiffness is not Cma alpha: the body's share goes as sin(alpha)
 * and the tail's angle is sin(alpha) less the downwash, which goes with
 * the lift, deda CL / CLa (plant_wing.c, docs/EXTRA-STAGE1.md). The slope
 * is then Cma cos(alpha) - slip_cm_a deda (1 - cos(alpha)) / (1 - deda),
 * 2.5 percent shallower than the linear h_n's at these angles. The Extra,
 * whose zero lift line is the body's, reads its h_n margin at 0.
 */
function cmHiAlpha(a) {
  const sa = Math.sin(a);
  const xt = at * (sa - deda * a - slip.slip_a0 * (1 - deda));
  return Cm0 + (Cma - slip.slip_cm_a) * sa + slip.slip_cm_a * slip.slip_a0 - vhTH * xt * plateRatioH(xt);
}
const SMplant = -(cmHiAlpha(-alphaZL + 0.03) - cmHiAlpha(-alphaZL)) / (CLa * 0.03);
/*
 * The harrier: level, wings level, the zero lift line held at an angle
 * well past the stall (the body 5 deg less), the throttle holding height,
 * as the Extra's derivation flies it: the elevator that holds it, with
 * the wash's share on the stabiliser.
 */
function harrier(alphaDeg) {
  const a = alphaDeg / DEG, ab = a + alphaZL;
  const { CL, CD, sig, clSt, fall, past } = clPlant(a);
  const qS = 0.5 * rho * S;
  const V = Math.sqrt(W / (qS * (CL + CD * Math.tan(ab))));
  const thrust = qS * V * V * CD / Math.cos(ab);
  const u = V * Math.cos(ab);
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (T(u, mid) < thrust) lo = mid; else hi = mid; }
  const duty = lo;
  const qb = 0.5 * rho * V * V;
  const w = washOf(slip, thrust, u);
  const sa = Math.sin(a);
  const cnSt = 2 * sa + (clSt - 2 * sa * Math.cos(a)) * Math.cos(a);
  const cmPost = sig * (((1 - fall) * armAc - fall * armCp) * cnSt - armAc * CLa * sa);
  const alphaT = sa - deda * CL / CLa - slip.slip_a0 * (1 - deda);
  const xa = V * Math.sin(a - slip.slip_a0);
  const vw = u + 2 * w.vi;
  const cm = (de) => {
    const xt = at * alphaT - Cmde * de / vhTH;
    const free = Cm0 + (Cma - slip.slip_cm_a) * sa + slip.slip_cm_a * slip.slip_a0 - vhTH * xt * plateRatioH(xt) + past * cmPost;
    const rh = plateRatioH(at * xa / vw - Cmde * de / vhTH);
    return free + (rho * w.vi * w.fh * rh * slip.slip_cm_a * xa + w.dp * w.fh * rh * Cmde * de) / qb;
  };
  let dLo = -throwE, dHi = throwE;
  for (let i = 0; i < 60; i += 1) { const mid = (dLo + dHi) / 2; if (cm(mid) < 0) dLo = mid; else dHi = mid; }
  return { alphaDeg, bodyDeg: ab * DEG, V, thrust, duty, deOfThrow: dLo / throwE, cmAtFull: cm(throwE) };
}
/* The knife edge, the Extra's derivation's: the body's side force, the
 * crossflow, the wash on the fin, the rudder holding the sideslip. */
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
    if (T(u, 1) < thrust) break;
    if (side * cb + thrust * sb >= W) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (T(u, mid) < thrust) lo = mid; else hi = mid; }
      return { V, betaDeg: bDeg, duty: lo, thrust, drOfThrow: Math.abs(dr) / throwR };
    }
  }
  return null;
}

/* The take off roll, full throttle, flaps at half, the tail held to 5
 * m/s then flown off at the attitude the plant's own lift carries it at. */
function takeoff(flapD) {
  let V = 0, x = 0, t = 0;
  const dt = 0.0005;
  const dcl = clDf * flapD + clDf2 * flapD * flapD;
  while (t < 10) {
    const a = (V < 5 ? restPitchDeg : 8) / DEG - alphaZL;
    const CL = Math.min(CLa * a + dcl, CLmax + clmaxDf * flapD);
    const q = 0.5 * rho * V * V;
    if (q * S * CL >= W) break;
    const CD = CD0 + cdDf2 * flapD * flapD + k * CL * CL;
    const acc = (T(V, 1) - q * S * CD - 0.08 * Math.max(0, W - q * S * CL)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, V };
}

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const J = (o, n = 3) => JSON.stringify(o, (kk, v) => (typeof v === 'number' ? +v.toFixed(n) : v));
const rows = [
  ['S clean m2, chord, slat chord, AR, W/S N/m2', `${f(S, 4)} ${f(c, 4)} ${f(cSlat, 4)} ${f(AR)} ${f(W / S, 1)}`],
  ['flaps y m, ailerons y m, chord share', `${f(flapIn)} ${f(flapOut)} ${f(ailIn)} ${f(ailOut)} ${f(cf)}`],
  ['CG from spinner m, prop ahead m, h_cg', `${f(cgFromTip, 4)} ${f(propX, 4)} ${f(hCG, 4)}`],
  ['stab: Sh, bh, lh, chord, elevator share', `${f(Sh, 4)} ${f(bh, 4)} ${f(lh, 4)} ${f(cStab, 4)} ${f(cfE)}`],
  ['a_w, a_t, a_v /rad; AR_v geometric, effective', `${f(aw)} ${f(at)} ${f(av)}; ${f(arVgeo)} ${f(arV)}`],
  ['dε/dα, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, h_n, static margin', `${f(CLa, 4)} ${f(hn)} ${f(SM)}`],
  ['static margin the plant reads (hi_alpha, U2\'s span)', `${f(SMplant, 4)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde, 4)} ${f(CLde, 4)}`],
  ['CD0, k', `${f(CD0, 4)} ${f(k, 5)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb, 4)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ (fin, high wing), Clp, Clδa', `${f(Clb, 4)} (${f(ClbFin, 4)} ${f(ClbHigh, 4)}) ${f(Clp, 4)} ${f(Clda, 4)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['throws deg a e r; K\' a e r; tau a e r', `${f(throwA * DEG, 2)} ${f(throwE * DEG, 2)} ${f(throwR * DEG, 2)}; ${f(kPrime(throwA))} ${f(kPrime(throwE))} ${f(kPrime(throwR))}; ${f(tauA)} ${f(tauE)} ${f(tauR)}`],
  ['strip_tau', J(stripTau, 4)],
  ['flaps: half, full rad, rate', `${f(flapHalf, 6)} ${f(flapFull, 6)} ${f(flapRate, 6)}`],
  ['   cl_df, cl_df2, clmax_df, cd_df2, cm_dcl_f, de_df', `${f(clDf, 4)} ${f(clDf2, 4)} ${f(clmaxDf, 4)} ${f(cdDf2, 4)} ${f(cmPerDcl, 4)} ${f(deDf, 6)}`],
  ['mass: shell kg, pack x m', `${f(shellM, 3)} ${f(packX, 4)}`],
  ['inertia Ixx Iyy Izz', `${f(Ixx, 4)} ${f(Iyy, 4)} ${f(Izz, 4)}`],
  ['motor static: rpm, torque N m, thrust N, current A', `${f(nStatic, 0)} ${f(Qs, 4)} ${f(Ts, 2)} ${f(Is, 1)}`],
  ['rpm NL, pitch speed, torque arm m, T/W', `${f(rpmNL, 0)} ${f(Vp, 2)} ${f(torqueArm, 5)} ${f(Ts / W, 3)}`],
  ['prop J kg m2, shaft power W', `${f(propJ, 6)} ${f(Qs * nStatic * 2 * Math.PI / 60, 0)}`],
  ['slipstream', J(slip, 4)],
  ['rot_k roll pitch yaw N m s2', `${f(rotK[0], 5)} ${f(rotK[1], 5)} ${f(rotK[2], 5)}`],
  ['side crossflow drag area m2', f(sideCda, 4)],
  ['N1 level at 75 percent', f(level(0.75), 2)],
  ['N2 stall clean, CLmax / CLα; full flaps', `${f(Vs, 2)} ${f(CLmax / CLa, 5)}; ${f(VsFull, 2)}`],
  ['N3 L/D at 11, 13 m/s', `${f(ld(11), 2)} ${f(ld(13), 2)}`],
  ['N4 top speed', f(level(1), 2)],
  ['N5 roll pb/2V, deg/s at 13 m/s', `${f(pb2v, 4)} ${f(rollAt(13) * DEG, 0)}`],
  ['N6 hover duty; wash dp, v_i, rw, fh fv fa', `${f(hoverDuty, 4)}; ${f(hov.dp, 1)} ${f(hov.vi, 2)} ${f(hov.rw, 4)} ${f(hov.fh)} ${f(hov.fv)} ${f(hov.fa, 4)}`],
  ['N7 vertical climb speed, full throttle', f(vClimb, 2)],
  ['N8 torque at hover N m, net, torque roll deg/s', `${f(Qprop, 4)} ${f(Qhover, 4)} ${f(torqueRoll * DEG, 0)}`],
  ['N9 full aileron in the wash N m, net roll deg/s', `${f(aileronHover, 4)} ${f(aileronRollNet * DEG, 0)}`],
  ['N10 full elevator hanging, rad/s2; rudder', `${f(pitchAccHover, 2)} ${f(yawAccHover, 2)}`],
  ['rest: pitch deg, CG height m, tail share; contacts main tail m', `${f(restPitchDeg, 2)} ${f(cgHeight, 4)} ${f(tailShare, 4)}; ${f(mainHw, 4)} ${f(tailHw, 4)}`],
  ['gear body: main x z, tail x z (axle, lowered 5 mm)', `${f(mainX, 4)} ${f(mainZ - 0.005, 4)} ${f(tailX, 4)} ${f(tailZ - 0.005, 4)}`],
  ['   wheelbase m, loads main tail N', `${f(wheelbase, 4)} ${f(mainLoad, 3)} ${f(tailLoad, 3)}`],
  ['   k main tail N/m, c main tail N s/m', `${f(kMain, 0)} ${f(kTail, 0)} ${f(cMain, 2)} ${f(cTail, 2)}`],
  ['N11 harrier at 40, 45, 50 deg of the zero lift line', ''],
  ['   40', J(harrier(40))],
  ['   45', J(harrier(45))],
  ['   50', J(harrier(50))],
  ['N12 knife edge at 12, 14, 16 m/s', ''],
  ['   12', J(knifeEdge(12))],
  ['   14', J(knifeEdge(14))],
  ['   16', J(knifeEdge(16))],
  ['N14 take off, half flaps', J(takeoff(flapHalf))],
  ['stall: arm_ac, arm_cp, dw', `${f(armAc, 4)} ${f(armCp, 4)} ${f(stallDw, 4)}`],
  ['hi_alpha tail_at tail_av tail_deda', `${f(at, 3)} ${f(av, 3)} ${f(deda, 3)}`],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(56)} ${v}`);
}
