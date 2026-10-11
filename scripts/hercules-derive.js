/*
 * hercules-derive.js: the arithmetic behind docs/HERCULES-STAGE1.md, from
 * AeroTetris's published figures for its C-130 Hercules 3077 kit, the full
 * size C-130H's published dimensions scaled to the kit's span, E-flite's
 * for the Power 25 and APC's for the 12 x 8E, to every coefficient of
 * FW_HERCULES3077 and every band in tests/hercules-thresholds.json. It
 * never loads the plant: this is what the plant is checked against, so it
 * has to stand apart from it. Harness arithmetic in JS maths, which is
 * allowed here because nothing it prints is hashed. Run with
 * npm run hercules:derive; --json prints the bands alone.
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

/*
 * THE KIT, AeroTetris's C-130 Hercules 3077 (docs/HERCULES-STAGE1.md has
 * the URL), its C-130H fuselage: span 3077 mm, length 2250 mm, wing area
 * 87.6 dm^2 (the panels outside the fuselage), reference area 104.86 dm^2
 * and reference length 356.4 mm (the area and the mean aerodynamic chord
 * its balance figures are taken on), the neutral point 980.8 mm behind
 * the nose and the CG 923.8 mm for a 16 percent static margin (980.8 -
 * 923.8 = 57.0 = 0.160 of 356.4), 2460 g glued. The reference area and
 * chord are the plant's: the kit's own stability figures are on them.
 */
const b = 3.077, S = 1.0486, MAC = 0.3564, kitLength = 2.250;
const xNP = 0.9808, xCG = 0.9238, SM = (xNP - xCG) / MAC;
const AR = b * b / S;
/* A straight taper with the kit's area and mean chord: cr + ct = 2 S / b
 * and MAC = 2/3 (cr^2 + cr ct + ct^2) / (cr + ct). */
const sumC = 2 * S / b, prodC = sumC * sumC - 1.5 * MAC * sumC;
const cr = (sumC + Math.sqrt(sumC * sumC - 4 * prodC)) / 2, ct = sumC - cr, lam = ct / cr;
const chordAt = (y) => cr + (ct - cr) * Math.abs(y) / (b / 2);
const yMAC = (b / 6) * (1 + 2 * lam) / (1 + lam);
const c = MAC;

/*
 * THE FULL SIZE, scaled. The kit is the C-130H at k = 3.077 / 40.41
 * (1:13.13; the USAF fact sheet's 132 ft 7 in span, 97 ft 9 in length,
 * 38 ft 3 in height, 1745 sq ft, root NACA 64A318 and tip 64A412,
 * Lednicer's guide). The kit's 2250 mm against the scaled 2268 checks it.
 * The rest is off Lockheed's three view, ESTIMATED to the drawing: the
 * tailplane 16.05 m across on 35.4 m^2, the fin and rudder 20.9 m^2 and
 * 6.1 m tall over the fuselage's top, the fuselage 4.34 m wide and 4.6 m
 * deep, the props 4.11 m across (Hamilton Standard 54H60), the inboard
 * pair 0.25 and the outboard 0.49 of the half span out, the ailerons from
 * 0.66 of it to 0.97 at a quarter of the chord, the wing on the fuselage's
 * top with 2.5 deg of dihedral outboard, 3 deg of incidence at the root
 * and 0 at the tip. The main gear sits in the sponsons on a 4.35 m track,
 * 9.77 m behind the nose wheel.
 */
const k = b / 40.41;
const Sh = 35.4 * k * k, bh = 16.05 * k;
const Sv = 20.9 * k * k, hFin = 6.1 * k;
const fusW = 4.34 * k, fusH = 4.6 * k;
const propD = 4.11 * k, propR = propD / 2;
const yInboard = 0.25 * b / 2, yOutboard = 0.49 * b / 2;
const aileronIn = 0.66 * b / 2, aileronOut = 0.97 * b / 2, cfA = 0.25, cfE = 0.35, cfR = 0.35;
const dihedral = 2.5 / DEG;
const washout = 3.0 / DEG;
/* Stations, metres behind the nose on the kit (its length over the scaled
 * full size's), then about the CG. The wing's MAC leading edge and the
 * tail's quarter chords off the three view. */
const xMACle = 0.8065, xTailAC = 2.000, xFinAC = 2.030;
const lh = xTailAC - xCG, lv = xFinAC - xCG;
const hCG = (xCG - xMACle) / MAC;
/* Heights over the belly line: the wing on the fuselage's top, the
 * thrust lines at the nacelles' centres a hand under it, the tailplane on
 * the upswept tail cone at three quarters of the depth, the fin's centre
 * of area 0.42 of its height up. The CG's height comes out of the mass
 * build up below; everything is then taken about it. */
const hbWing = fusH - 0.01, hbThrust = hbWing - 0.045, hbTail = 0.75 * fusH, hbFin = fusH + 0.42 * hFin;
const hbPack = 0.07, hbGear = 0.04, hbMid = fusH / 2;

function integrate(f, a, bb, n = 4000) { let s = 0; for (let i = 0; i < n; i += 1) { const y = a + (bb - a) * (i + 0.5) / n; s += f(y) * (bb - a) / n; } return s; }

/*
 * THE MASS, ESTIMATED from the parts' classes, summing to the flying
 * weight: the kit's 2460 g frame, its covering, four Power 25s with their
 * ESCs, props and spinners in the nacelles, four 3S 5000 packs slid along the
 * cargo floor to the kit's CG, the servos (ailerons, elevators, rudder,
 * the nose wheel, the ramp and the door), the fixed gear in its sponsons.
 * x is metres ahead of the CG, z over it; a rod from x0 to x1 where given.
 */
const xs = (xFromNose) => xCG - xFromNose;
const parts = [
  { name: 'fuselage frame', m: 1.05, x0: xs(kitLength), x1: xs(0), hb: hbMid },
  { name: 'tailplane, elevators', m: 0.17, x: xs(xTailAC), hb: hbTail },
  { name: 'fin, rudder', m: 0.13, x: xs(xFinAC), hb: hbFin },
  { name: 'nacelles', m: 0.16, x: 0.12, hb: hbThrust, y: (yInboard + yOutboard) / 2 },
  { name: 'covering, glass and paint', m: 0.45, x0: xs(kitLength), x1: xs(0), hb: hbMid },
  { name: 'Power 25 motors x 4', m: 4 * 0.186, x: 0.235, hb: hbThrust, y: (yInboard + yOutboard) / 2 },
  { name: '40 A ESCs x 4', m: 4 * 0.045, x: 0.13, hb: hbThrust, y: (yInboard + yOutboard) / 2 },
  { name: 'APC 12 x 8E and spinners x 4', m: 4 * (0.026 + 0.015), x: 0.315, hb: hbThrust, y: (yInboard + yOutboard) / 2 },
  { name: 'servos x 8', m: 8 * 0.055, x: -0.15, hb: hbMid },
  { name: 'gear, wheels, sponsons', m: 0.45, x: 0.10, hb: hbGear },
  { name: 'receiver, wiring, switch', m: 0.20, x: 0.15, hb: hbMid },
];
const wingM = 0.95, packM = 4 * 0.410;
let mh = wingM * hbWing + packM * hbPack, mAll = wingM + packM;
for (const p of parts) {
  mh += p.m * p.hb;
  mAll += p.m;
}
const hbCG = mh / mAll;
for (const p of parts) p.z = p.hb - hbCG;
const zWing = hbWing - hbCG, zThrust = hbThrust - hbCG, zFin = hbFin - hbCG, zPack = hbPack - hbCG;
const xOf = (p) => (p.x0 === undefined ? p.x : (p.x0 + p.x1) / 2);
const x2Of = (p) => (p.x0 === undefined ? p.x * p.x : (p.x0 * p.x0 + p.x0 * p.x1 + p.x1 * p.x1) / 3);
let mSum = packM + wingM, mx = wingM * xs(xMACle + 0.4 * MAC);
for (const p of parts) {
  mSum += p.m;
  mx += p.m * xOf(p);
}
const m = mSum, W = m * g;
const packX = -mx / packM;
const wingIxx = wingM * integrate((y) => chordAt(y) * y * y, 0, b / 2) / integrate(chordAt, 0, b / 2);
let Ixx = wingIxx + wingM * zWing * zWing, Iyy = wingM * (c * c / 12 + zWing * zWing), Izz = wingIxx + wingM * c * c / 12;
for (const p of parts) {
  const y = p.y ?? 0;
  Ixx += p.m * (p.z * p.z + y * y);
  Iyy += p.m * (x2Of(p) + p.z * p.z);
  Izz += p.m * (x2Of(p) + y * y);
}
Iyy += packM * (packX * packX + zPack * zPack);
Izz += packM * packX * packX;
Ixx += packM * zPack * zPack;

/* Thin aerofoil flap effectiveness for a trailing edge surface of chord cf. */
const tauOf = (cf) => { const th = Math.acos(1 - 2 * (1 - cf)); return 1 - (th - Math.sin(th)) / Math.PI; };
/*
 * THE THROWS, ESTIMATED: AeroTetris ships the frame without a manual, so
 * no throws are published. The full size's are aileron 25 deg up and 15
 * down, elevator 40 up and 15 down, rudder 35 each way (the C-130's
 * flight manual, TO 1C-130H-1, as commonly quoted); a scale model is set
 * to its builder's taste well inside them. Taken: aileron and elevator 15
 * deg, rudder 25, the usual scale low rate, under Roskam's 15 deg knee so
 * no K' is folded in.
 */
const throwA = 15 / DEG, throwE = 15 / DEG, throwR = 25 / DEG;
const tauA = tauOf(cfA), tauE = tauOf(cfE), tauR = tauOf(cfR);

/* The section: CLmax of an 18 percent 6 series section at the model's
 * Reynolds number, 2.9e5 at 12 m/s on the mean chord, ESTIMATED from the
 * 64A-series' 1.2 at 6e6 (Abbott and von Doenhoff) less the low Reynolds
 * number's loss. */
const CLmax = 1.10;
/*
 * THE PARASITE DRAG, a component build up off the kit's geometry
 * (Raymer, Aircraft Design: A Conceptual Approach, 6th ed., sec. 12.5):
 * each part's skin friction Cf on its wetted area, times its form factor
 * FF and its interference Q, over the reference area, at the cruise's
 * Reynolds numbers (15.5 m/s, nu 1.46e-5). A glassed, painted balsa model
 * at 2e5 to 2e6 runs laminar over part of each surface: Cf is taken as the
 * mean of Blasius's laminar 1.328 / sqrt(Re) and the turbulent
 * 0.455 / (log10 Re)^2.58 (eq. 12.27), and the band of the result runs
 * from all laminar to all turbulent. The C-130's upswept tail adds its
 * own (eq. 12.36, 3.83 u^2.5 A_max, the upsweep u 15 deg, 12 to 18 for the
 * band). Wheels and struts: the exposed tyres and the nose leg's wire.
 * Leaks and protuberances: 10 percent (Raymer's 5 to 15 for a propeller
 * aircraft). The Oswald factor of a straight wing (eq. 12.48):
 * 1.78 (1 - 0.045 A^0.68) - 0.64.
 */
const NU = 1.46e-5, Vref = 15.5;
const cfLam = (L) => 1.328 / Math.sqrt(Vref * L / NU);
const cfTurb = (L) => 0.455 / Math.log10(Vref * L / NU) ** 2.58;
function buildup(mix, upsweepDeg) {
  const cf = (L) => mix * cfTurb(L) + (1 - mix) * cfLam(L);
  const wingSwet = 0.876 * (1.977 + 0.52 * 0.15);
  const wing = cf(MAC) * (1 + 0.6 / 0.4 * 0.15 + 100 * 0.15 ** 4) * wingSwet;
  const dEq = Math.sqrt(fusW * fusH), f = kitLength / dEq;
  const fus = cf(kitLength) * (1 + 60 / f ** 3 + f / 400) * Math.PI * dEq * kitLength * 0.8;
  const u = upsweepDeg / DEG;
  const upsweep = 3.83 * u ** 2.5 * (fusW * fusH * 0.78);
  const tailFF = 1 + 0.6 / 0.3 * 0.10 + 100 * 0.10 ** 4;
  const tail = 1.04 * tailFF * (cf(Sh / bh) * 2.04 * (Sh - fusW * Sh / bh) + cf(Sv / hFin) * 2.04 * Sv);
  const nacD = 0.075, nacL = 0.30, nf = nacL / nacD;
  const nacelles = 4 * 1.3 * cf(nacL) * (1 + 0.35 / nf) * Math.PI * nacD * nacL * 0.8;
  const spD = 0.08, spL = 0.5, sf = spL / spD;
  const sponsons = 2 * 1.3 * cf(spL) * (1 + 60 / sf ** 3 + sf / 400) * Math.PI * spD * spL * 0.8;
  const gear = 3 * 0.25 * 0.055 * 0.02 * 0.5 + 1.2 * 0.004 * 0.10;
  const parts = { wing, fus, upsweep, tail, nacelles, sponsons, gear };
  const sum = Object.values(parts).reduce((a, b) => a + b, 0);
  return { cd0: 1.10 * sum / S, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v / S])) };
}
const drag = buildup(0.5, 15);
const dragLo = buildup(0, 12);
const dragHi = buildup(1, 18);
const CD0 = Number(drag.cd0.toFixed(4));
const e = Number((1.78 * (1 - 0.045 * AR ** 0.68) - 0.64).toFixed(3));
const kInd = 1 / (Math.PI * e * AR);
const blend = 4 / DEG;
const eta = 0.9;

/* The coefficients, Nelson's forms as every derivation here uses them. */
const aw = 2 * Math.PI * AR / (AR + 2) * Math.cos(dihedral) ** 2;
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const deda = 2 * aw / (Math.PI * AR);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
/* The kit's static margin rather than Nelson's neutral point: AeroTetris
 * computed it on the frame it cuts. Nelson's, with Raymer's fuselage term
 * (eq. 16.25, K_fus 0.006 per deg on the fuselage's width and length),
 * is printed beside it as the check. */
const fusCma = 0.006 * fusW * fusW * kitLength / (c * S) * DEG;
const hnNelson = 0.25 + VH * eta * (at / aw) * (1 - deda) - fusCma / CLa;
const Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c, Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
const arV = 1.55 * hFin * hFin / Sv; /* the fin end plated by the tailplane and fuselage, Roskam's usual factor */
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const fusVol = kitLength * fusW * fusH * 0.6;
const CYb = -av * Sv / S - 0.11;
const Cnb = av * VV - 1.3 * fusVol / (S * b);
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/* Roll per sideslip: the dihedral (Nelson, Cl beta = -a_w Gamma / 6 times
 * the taper's (1 + 2 lam) / (1 + lam) / 2 for a trapezoid), the high
 * wing's (DATCOM, 1.2 sqrt(A) (z_w / b)(2 D / b), negative for a high
 * wing), the fin's. */
const ClbDih = -aw * dihedral / 6 * (1 + 2 * lam) / (1 + lam);
const ClbHigh = -1.2 * Math.sqrt(AR) * ((zWing - (fusH / 2 - hbCG)) / b) * (2 * fusH / b);
const ClbFin = -av * (Sv / S) * (zFin / b);
const Clb = ClbDih + ClbHigh + ClbFin;
const Clp = -aw * (1 + 3 * lam) / (12 * (1 + lam));
const Clda = 2 * aw * tauA * integrate((y) => chordAt(y) * y, aileronIn, aileronOut) / (S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zFin / b;
/* The strips' chords at an eighth, three, five and seven eighths of the
 * half span over the mean chord S / b, the plant's Schrenk loading. */
const stripC = [1, 3, 5, 7].map((i) => chordAt(i * b / 16) / (S / b));

/*
 * THE POWER, ESTIMATED: AeroTetris names none. Four E-flite Power 25s,
 * 870 kV, 0.03 ohm, Io 2.4 A at 10 V, 32 A continuous and 44 A burst,
 * 0.41 lb (Horizon's listing, EFLM4025A: 3 to 4S, 11 x 8 to 14 x 7, for
 * 1.4 to 2.5 kg a motor), each on its own pack as Paschaloudis's 11 ft
 * C-130 flies four packs (Model Airplane News), here 3S 5000, on APC's 12
 * x 8E, the scale prop's diameter (4.11 m at 1:13.13 is 12.3 in). The
 * static point where the motor's torque meets APC's (PER3_12x8E.dat
 * static rows 7,000 to 10,000 rpm), the pack 6 milliohm a cell and 5 of
 * ESC and wire. All four turn the same way, clockwise from behind, as the
 * full size's do. On 4S the same prop draws 56 A static, past the
 * motor's burst rating: 3S is the one that fits it.
 */
const kv = 870, cells = 3, vNom = 3.7 * cells, rPack = 0.006 * cells, rMotor = 0.030, rEsc = 0.005, i0 = 2.4;
const apc = [[7000, 0.293, 15.661], [8000, 0.381, 20.527], [9000, 0.481, 26.083], [10000, 0.594, 32.344]];
function apcAt(n, col) {
  const kf = (r) => r[col] / (r[0] * r[0]);
  if (n <= apc[0][0]) return kf(apc[0]) * n * n;
  for (let i = 1; i < apc.length; i += 1) {
    if (n <= apc[i][0]) { const a = apc[i - 1], bb = apc[i]; return (kf(a) + (n - a[0]) / (bb[0] - a[0]) * (kf(bb) - kf(a))) * n * n; }
  }
  return kf(apc[apc.length - 1]) * n * n;
}
const kt = 60 / (2 * Math.PI * kv);
let nStatic = 8000;
for (let it = 0; it < 400; it += 1) {
  const q = apcAt(nStatic, 1);
  const i = q / kt + i0;
  const n = kv * (vNom - i * (rPack + rEsc + rMotor));
  nStatic += 0.3 * (n - nStatic);
}
const Qs1 = apcAt(nStatic, 1), Ts1 = apcAt(nStatic, 2), Is1 = Qs1 / kt + i0;
const Ts = 4 * Ts1;
const rpmNL = kv * vNom, Vp = 0.85 * rpmNL / 60 * 8 * 0.0254;
const torqueArm = Qs1 / Ts1;
const T = (V, d) => Math.max(0, Ts * d * d * (1 - Math.max(0, V) / (Vp * d)));
/* Each prop's inertia: a 26 g blade at 0.7 of a rod's m D^2 / 12, the
 * spinner and the can; four of them. */
const propJ = 4 * (0.7 * 0.026 * (0.3048) ** 2 / 12 + 0.07 * 0.021 * 0.021);
const shaftW = Qs1 * nStatic * 2 * Math.PI / 60;

/* Performance on the plant's polar. */
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + kInd * CL * CL); };
const level = (d) => {
  let lo = 9, hi = 45;
  if (T(lo, d) < D(lo) && T(12, d) < D(12)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + kInd * CL * CL); };
/* The power off glide: the best L/D's speed and the minimum sink's. */
let bestLD = 0, vBestLD = 0, minSink = 1e9, vMinSink = 0;
for (let V = Vs * 1.05; V < 30; V += 0.01) {
  const r = ld(V);
  if (r > bestLD) { bestLD = r; vBestLD = V; }
  const sink = V / ld(V);
  if (sink < minSink) { minSink = sink; vMinSink = V; }
}
const pb2v = Clda * throwA / -Clp;
const rollAt = (V) => pb2v * 2 * V / b;
/* The cruise: the full size's, scaled by Froude (sqrt k): 292 kt true at
 * cruise is 150 m/s, 41 m/s at 1:13.13, faster than this model's level
 * top; a scale pace is flown at about 1.6 Vs, which is what the gate
 * takes as cruise, with the throttle that holds it level. */
const Vcruise = 1.6 * Vs;
let dCruise = 0;
for (let lo = 0, hi = 1, i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (T(Vcruise, mid) < D(Vcruise)) lo = mid; else hi = mid; dCruise = hi; }
/* The rest on its gear: level on its tricycle, as the full size stands;
 * the main axles 0.08 m behind the CG on a 0.331 m track, the nose's 0.664
 * m ahead of them (the full size's wheelbase scaled), 55 mm wheels. The
 * belly 0.065 m over the ground (the full size's 0.85 m) puts the CG,
 * hbCG over the belly, over the grass by both. */
const restPitchDeg = 0;
const wheelR = 0.0275, track = 4.35 * k, wheelbase = 9.77 * k;
const mainX = -0.08, noseX = mainX + wheelbase;
const cgHeight = 0.065 + hbCG;
const mainZ = -(cgHeight - wheelR), noseZ = mainZ;
const noseShare = -mainX / wheelbase;
const mainLoad = W * (1 - noseShare) / 2, noseLoad = W * noseShare;
const kMain = mainLoad / 0.005, kNose = noseLoad / 0.005;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2), cNose = 2 * 0.6 * Math.sqrt(kNose * m * noseShare);

/*
 * The take off roll the way wingpilot.js flies it: full throttle from
 * rest, level on the wheels to the rotation speed 1.2 Vs, then 8 deg;
 * liftoff where the lift at that attitude carries the weight. Rolling
 * resistance on short grass, 0.08. The zero lift line is the root's 3 deg
 * of incidence less the section's camber, so the level fuselage already
 * lifts.
 */
const alphaZl = -(3.0 - 1.5) / DEG - 2.0 / DEG; /* the 64A318's -2 deg zero lift, the wing set 1.5 deg on the mean */
function clAt(alphaBody) { const a = alphaBody - alphaZl; return Math.min(CLa * a, CLmax); }
function takeoff() {
  let V = 0, x = 0, t = 0;
  const dt = 0.0005;
  while (t < 30) {
    const pDeg = V < 1.2 * Vs ? restPitchDeg : 8;
    const CL = clAt(pDeg / DEG);
    const q = 0.5 * rho * V * V;
    if (q * S * CL >= W) break;
    const acc = (T(V, 1) - q * S * (CD0 + kInd * CL * CL) - 0.08 * Math.max(0, W - q * S * CL)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, V };
}
/* The ground roll to a speed at the rest attitude, full throttle: the
 * take off gate's band runs from the roll to 1.1 Vs to the roll to 1.5 Vs,
 * as the Kadet's does. */
function rollTo(Vend) {
  let V = 0, x = 0;
  const dt = 0.0005;
  const CL = clAt(restPitchDeg / DEG);
  while (V < Vend) {
    const q = 0.5 * rho * V * V;
    const acc = (T(V, 1) - q * S * (CD0 + kInd * CL * CL) - 0.08 * Math.max(0, W - q * S * CL)) / m;
    V += acc * dt; x += V * dt;
  }
  return x;
}
/* The glide gate: L/D and the sink at 1.25 Vs, power off. */
const vGlide = 1.25 * Vs;
const ldGlide = ld(vGlide), sinkGlide = vGlide / ldGlide;
/*
 * THE OPEN RAMP, ESTIMATED (docs/HERCULES-CONTRACT.md). The full size's
 * ramp opening, 3.02 m wide by 2.77 m high (Wikipedia's C-130H specs: the
 * hold's 9 ft 11 in by 9 ft, the ramp 119 in wide), at 1:13.13 is 0.230 by
 * 0.211 m: open, a blunt base in the tail cone's flow, C_D 0.25 on it
 * (Hoerner, Fluid-Dynamic Drag, a blunt base behind a body). The ramp
 * itself, 0.238 by 0.230 m, hangs 28 deg below the floor into the stream
 * the tail cone shelters: a flat plate's normal force, 1.17 (Hoerner),
 * times its drag share sin 28 deg and half for the shelter. The drag acts
 * at the ramp, under the CG by the belly's depth less a third of the
 * opening: a nose down moment. The full size flies its airdrops with the
 * ramp open and trims for it; the lift a hanging ramp makes is left out.
 */
const rampOpenA = 0.230 * 0.211, rampPlateA = 0.238 * 0.230;
const cdDoorA = 0.25 * rampOpenA + 0.5 * 1.17 * Math.sin(28 * Math.PI / 180) * rampPlateA;
const cdDoor = cdDoorA / S;
const zDoor = -(hbCG - 0.211 / 3);
const cmDoor = cdDoor * zDoor / c;
const doorTime = 4.0;
/* Level at 75 percent with the ramp open. */
const levelDoor = (d) => {
  const Dd = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + cdDoor + kInd * CL * CL); };
  let lo = 9, hi = 45;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > Dd(mid)) lo = mid; else hi = mid; }
  return lo;
};
/*
 * THE FLIGHT TIME, from the drag. Steady level cruise at 1.6 Vs: the
 * drag times the speed is the thrust power; over the prop's 0.55 (APC's
 * 12 x 8E near J 0.5), the motor's 0.80 and the ESC's 0.95 it is the
 * packs' power, drawn from four 3S 5000s' 222 Wh to 80 percent. The band:
 * the drag's band and a prop from 0.45 to 0.65. The cross check is
 * Paschaloudis's 11 ft C-130, 18 minutes on four 5S 5000s (370 Wh): the
 * same aircraft scaled to its 3.35 m span, the weight its packs and size
 * imply (ESTIMATED 10 kg), and the same lift coefficient, so its cruise
 * is faster by the root of its wing loading's ratio and its drag in
 * proportion to its weight.
 */
const cruisePower = (cd0v, etaProp) => {
  const V = Vcruise, q = 0.5 * rho * V * V, CL = W / (q * S);
  return q * S * (cd0v + kInd * CL * CL) * V / (etaProp * 0.80 * 0.95);
};
const packWh = 4 * 3 * 3.7 * 5.0 * 0.8;
const minutesOf = (P) => packWh / P * 60;
const endurance = {
  minutes: minutesOf(cruisePower(CD0, 0.55)),
  lo: minutesOf(cruisePower(dragHi.cd0, 0.45)),
  hi: minutesOf(cruisePower(dragLo.cd0, 0.65)),
};
const big = { span: 3.35, m: 10 };
big.S = S * (big.span / b) ** 2;
big.V = Vcruise * Math.sqrt((big.m / big.S) / (m / S));
big.P = cruisePower(CD0, 0.55) * (big.m / m) * (big.V / Vcruise);
big.minutes = 4 * 5 * 3.7 * 5.0 * 0.8 / big.P * 60;
/* The power its 18 minutes average, over its cruise's. */
big.flownOverCruise = (4 * 5 * 3.7 * 5.0 * 0.8 / (18 / 60)) / big.P;
/* The cm_0 that trims the cruise with the elevator neutral. */
const CLcruise = 2 * W / (rho * Vcruise * Vcruise * S);
const alphaCruise = CLcruise / CLa;
const Cm0 = -Cma * alphaCruise;

/* Past the stall (scripts/stall-derive.js's tailed form). */
const armAc = hCG - 0.25, armCp = 0.40 - hCG, stallDw = eta * VH * at * deda / aw;
/* The side view's crossflow drag area: the fuselage's side at Allen and
 * Perkins' 1.2 times their 0.65 for a body of fineness 6.5. */
const sideCda = kitLength * fusH * 0.85 * 1.2 * 0.65;

const out = {
  m, W, S, b, c, AR, cr, ct, lam, yMAC, hCG, SM, hnNelson, aw, at, av, deda, VH, VV, CLa, Cma, Cm0, Cmq, Cmde, CLde,
  CYb, Cnb, Cnr, Clb, ClbDih, ClbHigh, ClbFin, Clp, Clda, Cndr, CYdr, Cldr, tauA, tauE, tauR, stripC,
  Ixx, Iyy, Izz, packX, nStatic, Qs1, Ts1, Is1, Ts, rpmNL, Vp, torqueArm, propJ, shaftW, kInd,
  Vs, top: level(1), level75: level(0.75), bestLD, vBestLD, minSink, vMinSink, Vcruise, dCruise,
  roll15: rollAt(15) * DEG, pb2v, takeoff: takeoff(), roll11: rollTo(1.1 * Vs), roll15Vs: rollTo(1.5 * Vs), vGlide, ldGlide, sinkGlide, alphaStall: CLmax / CLa, cdDoor, cmDoor, zDoor, doorTime, drag, dragLo: dragLo.cd0, dragHi: dragHi.cd0, e, endurance, big, level75Door: levelDoor(0.75), cgHeight, mainX, mainZ, noseX, noseZ, track, wheelbase, wheelR, noseShare,
  kMain, kNose, cMain, cNose, armAc, armCp, stallDw, sideCda, alphaZl, zThrust, zWing, zFin, hbCG, lh, lv, Sh, bh, Sv, hFin,
  fusW, fusH, propR, yInboard, yOutboard, aileronIn, aileronOut, throwA, throwE, throwR, xCG, xMACle, kitLength, k, washout,
};
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, (kk, v) => (typeof v === 'number' ? +v.toPrecision(6) : v), 1));
} else {
  const f = (x, n = 4) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
  for (const [name, v] of Object.entries(out)) {
    console.log(`${name.padEnd(12)} ${typeof v === 'object' ? JSON.stringify(v, (kk, x) => (typeof x === 'number' ? +x.toFixed(4) : x)) : f(v)}`);
  }
}

export { out as HERCULES };
