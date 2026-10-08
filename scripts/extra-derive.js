/*
 * extra-derive.js: the arithmetic behind docs/EXTRA-STAGE1.md, from
 * E-flite's published figures for the Extra 300 3D 1.3m and the
 * photographs of it to every coefficient of FW_EXTRA1308 and every
 * derived band in tests/extra-thresholds.json. It never loads the plant:
 * this is what the plant is checked against, so it has to stand apart
 * from it. Harness arithmetic in JS maths, which is allowed here because
 * nothing it prints is hashed. Run with npm run extra:derive.
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
 * The aircraft. E-flite's manual and listing (docs/EXTRA-STAGE1.md has the
 * URLs): span 1308 mm, length 1260 mm, wing 36.9 dm^2, 1240 g without the
 * pack and 1510 g on the suggested 4S 2200, the CG 90 to 100 mm behind the
 * wing's leading edge at the root. The planform, off E-flite's dimensioned
 * top view (EFL115500_A73, 1.0163 mm a pixel on the published span): the
 * root chord 0.366 m on the centreline, the tip 0.204, the ailerons from
 * 0.077 m to the tip at 29 percent of the chord, the stabiliser 0.501 m
 * across at a mean chord of 0.175 with its quarter chord 0.717 m behind the
 * CG. The side view (EFL115500_A03, 0.708 mm a pixel on the published
 * length, the stabiliser's chord line 5.6 deg down aft in it and the
 * ground 1.1 deg up): the fin and rudder 0.046 m^2, 0.208 m over the
 * thrust line and 0.085 under it, their quarter chord 0.80 m behind the
 * CG, the rudder three quarters of it; the front view (EFL115500_A04): the
 * wing 0.07 m under the thrust line. The thrust line is taken through the
 * CG, as a 3D aircraft is built to have it, so power does not pitch it.
 */
const b = 1.308, S = 0.369, m = 1.51, W = m * g, AR = b * b / S;
const cr = 0.366, ct = 0.204, lam = ct / cr;
const chordAt = (y) => cr + (ct - cr) * Math.abs(y) / (b / 2);
const MAC = (2 / 3) * cr * (1 + lam + lam * lam) / (1 + lam);
const yMAC = (b / 6) * (1 + 2 * lam) / (1 + lam);
/* The wing's leading edge sweeps back 0.072 of the span out, measured. */
const macLE = 0.072 * yMAC;
const cgBehindRootLE = 0.095;
const hCG = (cgBehindRootLE - macLE) / MAC;
const c = MAC;
const CLmax = 0.95, CD0 = 0.045, e = 0.75, k = 1 / (Math.PI * e * AR);
const blend = 3 / DEG;
const Sh = 0.0877, lh = 0.717, bh = 0.501, eta = 0.9;
const Sv = 0.046, lv = 0.80, zv = 0.06, hvUp = 0.208, hvDn = 0.085, arVgeo = (hvUp + hvDn) ** 2 / Sv;
const arV = 1.55 * arVgeo; /* the stabiliser and the fuselage end plate it, Roskam's usual factor */
const fusVol = 1.26 * 0.15 * 0.14 * 0.6;
const zWing = 0.07;
const aileronIn = 0.077, aileronOut = b / 2, cfA = 0.29, cfE = 0.45, cfR = 0.76;
const propR = 0.1651, propX = 0.302;

/* The throws: E-flite's high rates, 50, 60 and 100 mm, measured at each
 * surface's widest chord, the aileron's 84 mm at its root, the elevator's
 * 94 mm (45 percent of the 0.208 m root) and the rudder's 122 mm at its
 * foot; low rates are 70 percent of them. */
const throwA = Math.asin(0.050 / 0.084), throwE = Math.asin(0.060 / 0.094), throwR = Math.asin(0.100 / 0.122);

/* Large deflection: Roskam's plain flap correction K' (Airplane Design VI
 * fig. 10.7, cf/c 0.33), as Mason's curve fit gives it for 15 deg and
 * more. The table's control derivatives are per radian at full throw, K'
 * of the throw folded in, as the Timber's are. */
const kPrime = (d) => { const x = d * DEG; return x < 15 ? 1 : 4e-7 * x ** 4 - 7e-5 * x ** 3 + 0.0047 * x ** 2 - 0.1453 * x + 2.3167; };
/* Thin aerofoil flap effectiveness for a trailing edge surface of chord cf. */
const tauOf = (cf) => { const th = Math.acos(1 - 2 * (1 - cf)); return 1 - (th - Math.sin(th)) / Math.PI; };
const tauA = tauOf(cfA) * kPrime(throwA), tauE = tauOf(cfE) * kPrime(throwE), tauR = tauOf(cfR) * kPrime(throwR);

/* The coefficients, Nelson's forms as for the Cub and the Timber. */
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const deda = 2 * aw / (Math.PI * AR);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const fusCma = 0.006 * 0.15 * 0.15 * 1.26 / (c * S) * DEG; /* Raymer eq. 16.25, K_fus 0.006 per deg */
const hn = 0.25 + VH * eta * (at / aw) * (1 - deda) - fusCma / CLa;
const SM = hn - hCG, Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c, Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
/* The trim: the pilot trims a 3D aircraft to fly level hands off at its
 * sport pace; that trimmed elevator is the table's neutral. */
const Vtrim = 15, CLtrim = 2 * W / (rho * Vtrim * Vtrim * S), Cm0 = -Cma * CLtrim / CLa;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const CYb = -av * Sv / S - 0.11;
const Cnb = av * VV - 1.3 * fusVol / (S * b);
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/* No dihedral: the fin's roll, and the low wing's (DATCOM, 1.2 sqrt(A)
 * (z_w / b)(2 D / b) per radian, the fuselage 0.15 m deep), which
 * cancel within a hundredth: an aerobatic aircraft is built neutral. */
const ClbFin = -av * (Sv / S) * (zv / b), ClbLow = 1.2 * Math.sqrt(AR) * (zWing / b) * (2 * 0.15 / b);
const Clb = ClbFin + ClbLow;
const Clp = -aw * (1 + 3 * lam) / (12 * (1 + lam));
/* Aileron roll, strip theory on the tapered chord over the aileron span. */
function integrate(f, a, bb, n = 4000) { let s = 0; for (let i = 0; i < n; i += 1) { const y = a + (bb - a) * (i + 0.5) / n; s += f(y) * (bb - a) / n; } return s; }
const Clda = 2 * aw * tauA * integrate((y) => chordAt(y) * y, aileronIn, aileronOut) / (S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;

/* The mass and its moments of inertia, built up from the parts: the motor
 * and prop forward, the pack slid to balance, the foam shell, the wing
 * with its tube and servos, the tail feathers, the gear. Each mass is the
 * part's class, ESTIMATED; the sum is E-flite's 1510 g and the pack goes
 * where the CG comes out at the manual's. */
const parts = [
  /* name, kg, x from the CG, z; a rod along x from x0 to x1 where given */
  { name: 'motor, prop, spinner', m: 0.230, x: 0.270, z: 0 },
  { name: 'ESC', m: 0.060, x: 0.170, z: 0 },
  { name: 'receiver, wiring', m: 0.040, x: 0.020, z: 0 },
  { name: 'cowl, cockpit and canopy', m: 0.240, x0: -0.30, x1: 0.33, z: 0.01 },
  { name: 'aft fuselage', m: 0.095, x0: -0.93, x1: -0.30, z: 0 },
  { name: 'stabiliser and elevator', m: 0.045, x: -0.717, z: 0 },
  { name: 'fin and rudder', m: 0.025, x: -0.80, z: zv },
  { name: 'tail servos, pushrods', m: 0.060, x: -0.05, z: 0 },
  { name: 'gear, pants, wheels, tailwheel', m: 0.105, x: 0.10, z: -0.12 },
];
const wingM = 0.340, packM = 0.270;
const xOf = (p) => (p.x0 === undefined ? p.x : (p.x0 + p.x1) / 2);
const x2Of = (p) => (p.x0 === undefined ? p.x * p.x : (p.x0 * p.x0 + p.x0 * p.x1 + p.x1 * p.x1) / 3);
let mSum = packM + wingM, mx = 0;
for (const p of parts) {
  mSum += p.m;
  mx += p.m * xOf(p);
}
const packX = -mx / packM; /* the pack's place for the CG */
const fusX = [-0.93, 0.33];
/* Ixx: the wing along the span as its chord loads it, point masses else;
 * Iyy and Izz: rods along their length, the wing's chord. */
const wingIxx = wingM * integrate((y) => chordAt(y) * y * y, 0, b / 2) / integrate(chordAt, 0, b / 2);
let Ixx = wingIxx, Iyy = wingM * (c * c / 12 + zWing * zWing), Izz = wingIxx + wingM * c * c / 12;
for (const p of parts) {
  Ixx += p.m * p.z * p.z;
  Iyy += p.m * (x2Of(p) + p.z * p.z);
  Izz += p.m * x2Of(p);
}
Iyy += packM * packX * packX;
Izz += packM * packX * packX;
/* The gear legs' spread, the wheels 0.16 m each side, adds to Ixx. */
Ixx += 0.105 * 0.16 * 0.16;

/*
 * THE MOTOR, ESTIMATED: E-flite publishes the 4250 910 kV and the 13 x 6
 * wood prop, not a bench figure. A DC motor on the pack: the speed where
 * the motor's torque, (I - I0) 60 / (2 pi kV), meets the prop's, with
 * I = (V - n / kV) / R. R and I0 are E-flite's Power 32's (the 42 by 50 mm
 * class of the 4250), 0.02 ohm and 2.4 A; the pack is the plant's, 4S at
 * 3.7 V a cell nominal and 8 milliohm a cell, and 5 milliohm of ESC and
 * wire. The prop is stood in for by APC's 13 x 6.5E, whose static rows
 * are (PER3_13x65E.dat): 9,000 rpm 0.512 N m and 29.66 N; 10,000 rpm
 * 0.634 N m and 36.88 N; 11,000 rpm 0.771 N m and 44.97 N. Between rows
 * the torque and thrust go as the square of the rpm, as parts-derive.js
 * takes them.
 */
const kv = 910, cells = 4, vNom = 3.7 * cells, rPack = 0.008 * cells, rMotor = 0.020, rEsc = 0.005, i0 = 2.4;
const apc = [[9000, 0.512, 29.664], [10000, 0.634, 36.877], [11000, 0.771, 44.972]];
function apcAt(n, col) {
  const kf = (r) => r[col] / (r[0] * r[0]);
  if (n <= apc[0][0]) return kf(apc[0]) * n * n;
  for (let i = 1; i < apc.length; i += 1) {
    if (n <= apc[i][0]) { const a = apc[i - 1], bb = apc[i]; return (kf(a) + (n - a[0]) / (bb[0] - a[0]) * (kf(bb) - kf(a))) * n * n; }
  }
  return kf(apc[apc.length - 1]) * n * n;
}
const kt = 60 / (2 * Math.PI * kv);
let nStatic = 9000;
for (let it = 0; it < 200; it += 1) {
  const q = apcAt(nStatic, 1);
  const i = q / kt + i0;
  const vm = vNom - i * (rPack + rEsc);
  const n = kv * (vm - i * rMotor);
  nStatic += 0.3 * (n - nStatic);
}
const Qs = apcAt(nStatic, 1), Ts = apcAt(nStatic, 2), Is = Qs / kt + i0;
const rpmNL = kv * vNom, Vp = 0.85 * rpmNL / 60 * 6 * 0.0254;
const omegaLoaded = 0.85 * rpmNL * 2 * Math.PI / 60;
const torqueArm = Qs / Ts;
const T = (V, d) => Math.max(0, Ts * d * d * (1 - Math.max(0, V) / (Vp * d)));
/* The prop's inertia, ESTIMATED: a 13 in wood blade of about 35 g, a
 * tapered blade's 0.7 of a rod's m D^2 / 12, and the outrunner's can. */
const propJ = 0.7 * 0.035 * (2 * propR) ** 2 / 12 + 0.06 * 0.021 * 0.021;

/* Performance, the plant's polar: the linear lift with its stall blend
 * to the flat plate, and drag cd0 + k CL^2. */
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 7, hi = 45;
  if (T(lo, d) < D(lo) && T(9, d) < D(9)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
/* The roll rate, steady, pb/2V = Clda da / -Clp, at full aileron. */
const pb2v = Clda * throwA / -Clp;
const rollAt = (V) => pb2v * 2 * V / b;

/*
 * THE 3D REGIME.
 *
 * Hover: nose up, still, the thrust the weight. The plant's thrust goes
 * as the duty squared at zero airspeed, so the stick is sqrt(W / Ts).
 * The vertical climb: full throttle, straight up, where the thrust meets
 * the weight and the drag at zero lift.
 */
const hoverDuty = Math.sqrt(W / Ts);
let vClimb = 0;
for (let V = 0; V < 30; V += 0.001) { if (T(V, 1) - W - 0.5 * rho * V * V * S * CD0 <= 0) { vClimb = V; break; } }

/* The slipstream at a thrust and an axial speed, momentum theory, as the
 * plant takes it: dp, v_i, the contracted radius, the shares. */
function wash(thrust, u) {
  const dp = thrust / (Math.PI * propR * propR);
  const vi = 0.5 * (Math.sqrt(u * u + 2 * dp / rho) - u);
  const rw = propR * Math.sqrt((u + vi) / (u + 2 * vi));
  const fh = Math.min(1, rw / (bh / 2));
  const fv = (Math.min(rw, hvUp) + Math.min(rw, hvDn)) / (hvUp + hvDn);
  const ye = Math.min(rw, aileronOut);
  const fa = rw > aileronIn ? (ye * ye - aileronIn * aileronIn) / (aileronOut * aileronOut - aileronIn * aileronIn) : 0;
  return { dp, vi, rw, fh, fv, fa };
}
/* The tail's shares of the derivatives (plant_wing.c, THE SLIPSTREAM):
 * the stabiliser's lift slope and pitch stiffness, the fin's
 * weathercock, damping, side force and roll per sideslip. Its zero lift
 * is taken at the trim cm_0 is set for, as the held Slow Stick work took
 * it (origin/slipstream-held): cm_0 already holds whatever the tail's
 * rigging does there. */
const slipCla = at * (Sh / S) * eta * (1 - deda);
const slipCma = -eta * VH * at * (1 - deda);
const slipA0 = CLtrim / CLa;
const slipCnb = av * VV, slipCnr = -2 * av * VV * lv / b, slipCyb = -av * Sv / S, slipClb = ClbFin;

/*
 * The air a slow aircraft turns through: each surface's strips swept
 * through still air by the rotation, a flat plate normal to its flow,
 * C_N 1.17 (Hoerner, Fluid-Dynamic Drag, fig. 3-23, a plate of aspect
 * ratio 1 to 5), 1/2 rho C_N chord |r|^3 summed. Roll: the wing along its
 * span, the stabiliser, the fin up and down. Pitch: the stabiliser at its
 * arm, the fuselage's plan view (0.13 m wide) and the wing's chord. Yaw:
 * the fin at its arm, the fuselage's side (0.13 m deep), the wing's chord.
 */
const CN = 1.17;
const plate = (chord, a, bb) => 0.5 * rho * CN * integrate((r) => chord(r) * Math.abs(r) ** 3, a, bb);
const stabChord = () => Sh / bh, finChord = () => Sv / (hvUp + hvDn);
const rotK = [
  plate(chordAt, -b / 2, b / 2) + plate(stabChord, -bh / 2, bh / 2) + plate(finChord, -hvDn, hvUp),
  plate(() => 0.13, fusX[0], fusX[1]) + 0.5 * rho * CN * Sh * lh ** 3 + plate(() => b, -c / 2, c / 2),
  plate(() => 0.13, fusX[0], fusX[1]) + 0.5 * rho * CN * Sv * lv ** 3 + plate(() => b, -c / 2, c / 2) * 0.2,
];
/* The side crossflow drag area: the fuselage's side, 1.26 m by a mean
 * 0.125 m and the canopy, at Allen and Perkins' crossflow coefficient of
 * 1.2 times their eta of 0.7 for a body of fineness 9. */
const sideCda = (1.26 * 0.125) * 1.2 * 0.7;

/* Hanging on the prop: the thrust the weight, no airspeed. */
const hov = wash(W, 0);
/* Torque roll: the prop's reaction, torque_arm W, against the air the
 * turning wing sweeps through; steady at sqrt(Q / k_roll). The full
 * aileron in the wash, dp fa S b Clda throwA, against it. */
const Qprop = torqueArm * W;
/* The swirl (plant_wing.c, docs/FLIGHTMODEL.md): half of the wash's
 * angular momentum, SWIRL_KEEP, reaches the fin, whose side force rolls
 * the airframe against the torque by the fin's Clb at the swirl's sideways
 * speed, Omega (up - dn) / 2 with Q = mdot Omega rw^2 / 2; the wing's root
 * takes the other half straight back against it. What turns the hanging
 * aircraft is the torque less both. */
const SWIRL_KEEP = 0.5;
const swirlXs = SWIRL_KEEP * Qprop * (Math.min(hov.rw, hvUp) - Math.min(hov.rw, hvDn)) / (rho * Math.PI * propR * propR * hov.vi * hov.rw * hov.rw);
const finSwirlRoll = S * b * rho * hov.vi * hov.fv * slipClb * -swirlXs;
const Qhover = Qprop - (1 - SWIRL_KEEP) * Qprop - finSwirlRoll;
const torqueRoll = Math.sqrt(Qhover / rotK[0]);
const aileronHover = hov.dp * hov.fa * S * b * Clda * throwA;
const aileronRollNet = aileronHover > Qhover ? Math.sqrt((aileronHover - Qhover) / rotK[0]) : -Math.sqrt((Qhover - aileronHover) / rotK[0]);
/*
 * hi_alpha's surfaces (plant_wing.c): each tail surface's normal force,
 * linear x = a (angle) with its control's share, saturates on a flat
 * plate's 1.17, x / (1 + (x / 1.17)^4)^(1/4). The stabiliser's and the
 * fin's volume coefficients the saturation is taken on.
 */
const tailCn = 1.17;
const plateRatio = (x) => 1 / Math.sqrt(Math.sqrt(1 + (x / tailCn) ** 4));
const vhT = -slipCma / (at * (1 - deda)), vvF = slipCnb / av;
/* Full elevator and rudder hanging on the prop, from rest: the first
 * angular accelerations, each surface's share of the wash's dp on its
 * control, saturated at the control's own angle, and what the same sticks
 * do with the prop stopped, which is nothing. */
const pitchAccHover = hov.dp * hov.fh * S * c * Cmde * throwE * plateRatio(Cmde * throwE / vhT) / Iyy;
const yawAccHover = hov.dp * hov.fv * S * b * Math.abs(Cndr) * throwR * plateRatio(Cndr * throwR / vvF) / Izz;
/* The prop's precession: a yaw rate r pitches the airframe at r h / Iy. */
const hHover = propJ * 0.85 * hoverDuty * rpmNL * 2 * Math.PI / 60;

/*
 * The plant's post stall lift (plant_wing.c, stalled_lift) on the whole
 * wing, for the harrier: the peak the blend reaches held for stall_top,
 * the fall to stall_k of it over 2 blends, Viterna and Corrigan's
 * extrapolation past it, the plate alone past 90 deg.
 */
const stallTop = 2.0 / DEG, stallK = 0.70;
function smooth(a0, a1, x) { if (x <= a0) return 0; if (x >= a1) return 1; const t = (x - a0) / (a1 - a0); return t * t * (3 - 2 * t); }
function clPlant(alpha) {
  const aS = CLmax / CLa;
  const sig = smooth(aS - blend, aS + blend, Math.abs(alpha));
  const lin = CLa * alpha, plateL = 2 * Math.sin(alpha) * Math.cos(alpha);
  const old = (1 - sig) * lin + sig * plateL;
  if (sig <= 0) return { CL: lin, CD: CD0 + k * lin * lin, sig, clLin: lin, clSt: lin, fall: 0 };
  let clS = 0;
  for (let i = 0; i <= 16; i += 1) {
    const ai = aS - blend + blend * 0.125 * i;
    const si = smooth(aS - blend, aS + blend, ai);
    const cc = (1 - si) * CLa * ai + si * 2 * Math.sin(ai) * Math.cos(ai);
    clS = Math.max(clS, cc);
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
  return { CL, CD, sig, clLin: lin, clSt, fall: t, past };
}
/*
 * The harrier: level, wings level, the nose held at a body angle of attack
 * well past the stall, the throttle holding height. Lift plus the thrust's
 * vertical share against the weight, the thrust's forward share against
 * the drag; then the elevator that holds the attitude, as the plant takes
 * the moment with hi_alpha: the wing and body's stiffness on the sine of
 * the angle, the stalled wing's normal force at its centre of pressure,
 * the stabiliser at its own angle, the downwash going with the wing's lift,
 * saturating with the elevator's share, and the wash's share on it at the
 * angle in the wash's stream.
 */
const armAc = hCG - 0.25, armCp = 0.40 - hCG, stallDw = eta * VH * at * deda / aw;
function harrier(alphaDeg) {
  const a = alphaDeg / DEG;
  const { CL, CD, sig, clSt, fall, past } = clPlant(a);
  const qS = 0.5 * rho * S;
  /* T cos a = D, q S CL + T sin a = W. */
  const V = Math.sqrt(W / (qS * (CL + CD * Math.tan(a))));
  const thrust = qS * V * V * CD / Math.cos(a);
  const u = V * Math.cos(a);
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (T(u, mid) < thrust) lo = mid; else hi = mid; }
  const duty = lo;
  const qb = 0.5 * rho * V * V;
  const w = wash(thrust, u);
  const sa = Math.sin(a);
  const clLinM = CLa * sa;
  const cnSt = 2 * sa + (clSt - 2 * sa * Math.cos(a)) * Math.cos(a);
  const cmPost = sig * (((1 - fall) * armAc - fall * armCp) * cnSt - armAc * clLinM);
  const alphaT = sa - deda * CL / CLa - slipA0 * (1 - deda);
  const xa = V * Math.sin(a - slipA0);
  const vw = u + 2 * w.vi;
  const cm = (de) => {
    const xt = at * alphaT - Cmde * de / vhT;
    const free = Cm0 + (Cma - slipCma) * sa + slipCma * slipA0 - vhT * xt * plateRatio(xt) + past * cmPost;
    const rh = plateRatio(at * xa / vw - Cmde * de / vhT);
    const wsh = (rho * w.vi * w.fh * rh * slipCma * xa + w.dp * w.fh * rh * Cmde * de) / qb;
    return free + wsh;
  };
  let dLo = -throwE, dHi = throwE;
  for (let i = 0; i < 60; i += 1) { const mid = (dLo + dHi) / 2; if (cm(mid) < 0) dLo = mid; else dHi = mid; }
  const de = dLo;
  return { alphaDeg, V, thrust, duty, deDeg: de * DEG, deOfThrow: de / throwE, cmAtFull: cm(throwE), CL, CD, dp: w.dp, qbar: qb, fh: w.fh };
}

/*
 * Knife edge: rolled to 90 deg, the nose yawed up by the sideslip, the
 * fuselage and the fin lifting sideways, the thrust's share holding the
 * rest, the rudder holding the sideslip. The body's side force is normal
 * to its axis, as a slender body's and a fin's are: it lifts by cos beta
 * and drags by sin beta, and the thrust along the axis lifts by sin beta
 * and pulls by cos beta. At a speed, the sideslip and throttle that hold
 * the height and the speed, with hi_alpha's sines and the crossflow. The
 * rudder's own side force opposes; the wash adds to the rudder and the
 * fin, and with the thrust it depends on, the throttle is found by
 * iteration.
 */
function knifeEdge(V) {
  const qb = 0.5 * rho * V * V;
  for (let bDeg = 1; bDeg < 60; bDeg += 0.01) {
    const bt = bDeg / DEG, sb = Math.sin(bt), cb = Math.cos(bt);
    const u = V * cb;
    let thrust = qb * S * CD0 / cb;
    let side = 0, dr = 0, w = null;
    for (let it = 0; it < 30; it += 1) {
      w = wash(thrust, u);
      const nBeta = qb * S * b * Cnb * sb + rho * w.vi * w.fv * S * b * slipCnb * (V * sb);
      const nPerDr = qb * S * b * Cndr + w.dp * w.fv * S * b * Cndr;
      dr = -nBeta / nPerDr;
      side = qb * S * (-CYb) * sb + 0.5 * rho * sideCda * (V * sb) ** 2 + rho * w.vi * w.fv * S * (-slipCyb) * (V * sb)
        - (qb + w.dp * w.fv) * S * CYdr * Math.abs(dr);
      thrust = (qb * S * CD0 + side * sb) / cb;
    }
    if (T(u, 1) < thrust) break;
    if (side * cb + thrust * sb >= W) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (T(u, mid) < thrust) lo = mid; else hi = mid; }
      return { V, betaDeg: bDeg, duty: lo, thrust, drDeg: Math.abs(dr) * DEG, drOfThrow: Math.abs(dr) / throwR };
    }
  }
  return null;
}

/*
 * The rest on the gear, off the side view: the main axles 0.153 m ahead of
 * the CG and 0.213 under it with 57 mm wheels, the tailwheel's 0.824 m
 * behind and 0.116 under with a 22 mm wheel, which stand the aircraft 6.7
 * deg nose up, the stabiliser's chord line against the ground as the
 * photograph has it.
 */
const restPitchDeg = 6.7;
const mainX = 0.153, mainZ = -0.2131 - 0.0285, tailX = -0.824, tailZ = -0.1158 - 0.011;
const rp = restPitchDeg / DEG;
const mainXw = mainX * Math.cos(rp) - mainZ * Math.sin(rp);
const tailXw = tailX * Math.cos(rp) - tailZ * Math.sin(rp);
const tailShare = mainXw / (mainXw - tailXw);
const cgHeight = -(mainX * Math.sin(rp) + mainZ * Math.cos(rp));
/* The gear's springs for 5 mm of static deflection under each wheel's
 * load, damped at 0.6 of critical, the Cub's rule; the tail's effective
 * mass is the pitch inertia about the main wheels over the wheelbase. */
const wheelbase = mainXw - tailXw;
const mainLoad = W * (1 - tailShare) / 2, tailLoad = W * tailShare;
const kMain = mainLoad / 0.005, kTail = tailLoad / 0.005;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mTail = (Iyy + m * mainXw * mainXw) / (wheelbase * wheelbase);
const cTail = 2 * 0.6 * Math.sqrt(kTail * mTail);

/*
 * The take off roll, the way wingpilot.js flies it: full throttle from
 * rest, the tail held down to 5 m/s (6 deg of pitch asked for, the
 * three point attitude near enough), then up to 2 deg, and at the
 * rotation speed, 10 m/s, 8 deg; liftoff where the lift at the attitude
 * held carries the weight. Rolling resistance on the load left on the
 * wheels, short grass's 0.08.
 */
function takeoff() {
  let V = 0, x = 0, t = 0;
  const dt = 0.0005;
  while (t < 10) {
    const pDeg = V < 5 ? restPitchDeg : (V < 10 ? 2 : 8);
    const a = pDeg / DEG;
    const { CL, CD } = clPlant(a);
    const q = 0.5 * rho * V * V;
    if (q * S * CL >= W) break;
    const acc = (T(V, 1) - q * S * CD - 0.08 * Math.max(0, W - q * S * CL)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, V };
}

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const J = (o, n = 3) => JSON.stringify(o, (kk, v) => (typeof v === 'number' ? +v.toFixed(n) : v));
const rows = [
  ['AR, MAC, y_MAC, taper, W/S N/m2', `${f(AR)} ${f(MAC, 4)} ${f(yMAC, 4)} ${f(lam)} ${f(W / S, 1)}`],
  ['h_cg (MAC), MAC LE behind root LE m', `${f(hCG, 4)} ${f(macLE, 4)}`],
  ['a_w, a_t, a_v /rad; AR_v geometric, effective', `${f(aw)} ${f(at)} ${f(av)}; ${f(arVgeo)} ${f(arV)}`],
  ['dε/dα, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, h_n, static margin', `${f(CLa, 4)} ${f(hn)} ${f(SM)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde, 4)} ${f(CLde, 4)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb, 4)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ (fin, low wing), Clp, Clδa', `${f(Clb, 4)} (${f(ClbFin, 4)} ${f(ClbLow, 4)}) ${f(Clp, 4)} ${f(Clda, 4)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['throws deg a e r; K\' a e r; tau a e r', `${f(throwA * DEG, 2)} ${f(throwE * DEG, 2)} ${f(throwR * DEG, 2)}; ${f(kPrime(throwA))} ${f(kPrime(throwE))} ${f(kPrime(throwR))}; ${f(tauA)} ${f(tauE)} ${f(tauR)}`],
  ['mass: sum kg, pack x m', `${f(mSum, 3)} ${f(packX, 4)}`],
  ['inertia Ixx Iyy Izz', `${f(Ixx, 4)} ${f(Iyy, 4)} ${f(Izz, 4)}`],
  ['motor static: rpm, torque N m, thrust N, current A', `${f(nStatic, 0)} ${f(Qs, 4)} ${f(Ts, 2)} ${f(Is, 1)}`],
  ['rpm NL, pitch speed, torque arm m, T/W', `${f(rpmNL, 0)} ${f(Vp, 2)} ${f(torqueArm, 5)} ${f(Ts / W, 3)}`],
  ['prop J kg m2, shaft power W', `${f(propJ, 6)} ${f(Qs * nStatic * 2 * Math.PI / 60, 0)}`],
  ['slipstream: tail CLα, Cmα, a0; fin Cnβ, Cnr, CYβ, Clβ', `${f(slipCla, 4)} ${f(slipCma, 4)} ${f(slipA0, 4)}; ${f(slipCnb, 4)} ${f(slipCnr, 4)} ${f(slipCyb, 4)} ${f(slipClb, 4)}`],
  ['rot_k roll pitch yaw N m s2', `${f(rotK[0], 5)} ${f(rotK[1], 5)} ${f(rotK[2], 5)}`],
  ['side crossflow drag area m2', f(sideCda, 4)],
  ['E1 level at 75 percent', f(level(0.75), 2)],
  ['E2 stall, CLmax / CLα', `${f(Vs, 2)} ${f(CLmax / CLa, 5)}`],
  ['E3 L/D at 12, 14 m/s', `${f(ld(12), 2)} ${f(ld(14), 2)}`],
  ['E4 top speed', f(level(1), 2)],
  ['E5 roll pb/2V, deg/s at 15 m/s, at 20 m/s', `${f(pb2v, 4)} ${f(rollAt(15) * DEG, 0)} ${f(rollAt(20) * DEG, 0)}`],
  ['E6 hover duty; wash dp, v_i, rw, fh fv fa', `${f(hoverDuty, 4)}; ${f(hov.dp, 1)} ${f(hov.vi, 2)} ${f(hov.rw, 4)} ${f(hov.fh)} ${f(hov.fv)} ${f(hov.fa, 4)}`],
  ['E7 vertical climb speed, full throttle', f(vClimb, 2)],
  ['E8 torque at hover N m, less the swirl\'s root and fin, torque roll deg/s', `${f(Qprop, 4)} ${f(Qhover, 4)} ${f(torqueRoll * DEG, 0)}`],
  ['E9 full aileron in the wash N m, net roll deg/s', `${f(aileronHover, 4)} ${f(aileronRollNet * DEG, 0)}`],
  ['E10 full elevator hanging, rad/s2; rudder', `${f(pitchAccHover, 2)} ${f(yawAccHover, 2)}`],
  ['   prop angular momentum at hover N m s', f(hHover, 4)],
  ['E11 harrier at 35, 40, 45 deg', ''],
  ['   35', J(harrier(35))],
  ['   40', J(harrier(40))],
  ['   45', J(harrier(45))],
  ['E12 knife edge at 12, 15, 18 m/s', ''],
  ['   12', J(knifeEdge(12))],
  ['   15', J(knifeEdge(15))],
  ['   18', J(knifeEdge(18))],
  ['rest: pitch deg, CG height m, tail share', `${f(restPitchDeg, 2)} ${f(cgHeight, 4)} ${f(tailShare, 4)}`],
  ['E14 take off roll', J(takeoff())],
  ['gear: wheelbase m, loads main tail N', `${f(wheelbase, 4)} ${f(mainLoad, 3)} ${f(tailLoad, 3)}`],
  ['   k main tail N/m, c main tail N s/m, tail m_eff', `${f(kMain, 0)} ${f(kTail, 0)} ${f(cMain, 2)} ${f(cTail, 2)} ${f(mTail, 4)}`],
  ['stall: arm_ac, arm_cp, dw, asym', `${f(armAc, 4)} ${f(armCp, 4)} ${f(stallDw, 4)} ${f(0.001 / c, 5)}`],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(56)} ${v}`);
}
