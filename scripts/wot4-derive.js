/*
 * wot4-derive.js: the arithmetic behind docs/WOT4-STAGE1.md, from Chris
 * Foss's published figures for his Wot 4 (the Classic's 590 sq in and 70
 * to 90 oz, and his own electric conversion: an AXI 4120/14 on an APC 13 x
 * 8, a 60 A controller, a 4S 3700), the Ripmax Wot 4 Mk2 ARTF's manual
 * (its span, length, balance and throws, and the three view on its cover,
 * measured), AXI's figures for the 4120/14 and the drawn model, to every
 * coefficient and every derived band. It never loads the plant: this is
 * what the plant is checked against, so it stands apart from it. Harness
 * arithmetic in JS maths, which is allowed here because nothing it prints
 * is hashed. It follows edge-derive.js where the two are alike (four
 * channel electric taildraggers with ailerons) and extra-derive.js for the
 * knife edge. Run with npm run wot4:derive.
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
const MM = (mm) => mm / 1000;
const SQIN = 0.0254 * 0.0254;

/*
 * THE AIRCRAFT. Span 1334 mm and length 1185 mm: Ripmax's Wot 4 Mk2 ARTF
 * (A-CF002/A, its product page and manual). Area 590 sq in and weight 70
 * to 90 oz, the middle, 80 oz: Chris Foss's own page for the Wot 4
 * Classic, the 52 in constant chord wing the ARTF is built to. The CG 82
 * mm (3 1/4 in) behind the leading edge at the root: the ARTF's manual.
 *
 * THE OUTLINE, measured off the three view on the manual's cover, scaled
 * by the published span (1420 px at 600 dpi to 1334 mm, 0.9394 mm a
 * pixel); stations are mm aft of the prop's plane, which is taken 22 mm
 * behind the spinner's tip (ESTIMATED), heights mm above the thrust line:
 *
 *   wing      constant chord, the leading edge at station 226, the tips
 *             rounded; the drawing's chord is 300 mm, Foss's area over the
 *             span 285, which is taken; flat, on top of the fuselage, its
 *             chord line 70 mm over the thrust line (a shoulder wing)
 *   ailerons  strip ailerons 43 mm deep, 103 mm to 606 mm out
 *   stab      164 mm at the root to 91 at the square tip, 492 mm across,
 *             its leading edge swept back 61 mm from station 939, the
 *             hinge line square at 1046, an elevator 57 mm deep at the root
 *             and 45 at the tip; 33 mm over the thrust line
 *   fin       a swept triangle from station 930 at the fuselage's top, 60
 *             mm over the thrust line, to its tip 258 mm over it; the
 *             rudder, 89 mm deep behind a hinge at 1052, from the tip to
 *             the fuselage's bottom: the big rudder
 *   gear      an aluminium strap to 2 1/2 in wheels, the axles at station
 *             234 and 202 mm under the thrust line; a wire tailwheel on a
 *             1 in wheel at station 1089, 31 mm under it
 *
 * The length the drawing gives from the spinner's tip to the rudder's
 * trailing edge is 1163 mm against Ripmax's 1185, 2 percent short: the
 * span's scale is kept.
 */
const b = MM(1334), S = 590 * SQIN, m = 80 * 0.028349523125, W = m * g;
const c = S / b, AR = b * b / S;
const wingLE = 226, chordMm = c * 1000, cgAft = 82;
const xCG = wingLE + cgAft;
const xAcWing = wingLE + 0.25 * chordMm;
/* Heights over the thrust line, mm. The CG is taken on it, ESTIMATED:
 * the motor and the pack sit on the line, the wing's 0.46 kg 50 mm over it
 * and the strap gear, wheels and servos under it about balance. A first
 * estimate put it 20 mm over the line; with the thrust 20 mm under the CG
 * the 4120's 19 N at a hanging 12 m/s pitched the nose up by 0.38 N m,
 * more than 60 percent of the elevator could hold, where Wot 4s are flown
 * straight up and hung (RCM&E: it 'will hover'), so that estimate went. */
const zCG = 0, zWing = 70, zStab = 33;
/*
 * The section: no maker publishes it. A semi-symmetrical section of about
 * 14 percent, the sport aerobat's, as the NACA 2415 of the UIUC data
 * (Selig et al., vol. 2, fig. 5.52) stands for it: zero lift at -2.0 deg,
 * CL max 1.22 at 2e5. The wing at no incidence to the thrust line and the
 * stabiliser at none, ESTIMATED. The wing's CL max 0.9 of the section's.
 */
const alphaZLw = -2.0 / DEG;
const CLmax = 0.9 * 1.22;
/* CD0: film on a built up balsa frame, an open cowl, the strap gear's
 * wheels bare, strip ailerons with their gaps; e for a rectangular wing on
 * a square box. ESTIMATED. */
const CD0 = 0.040, e = 0.78, k = 1 / (Math.PI * e * AR);

/* The stabiliser. */
const stabRoot = 164, stabTip = 91, stabHalf = 246, stabSweep = 61, stabLE = 939;
const Sh = MM(stabHalf) * MM(stabRoot + stabTip), bh = MM(2 * stabHalf);
const lamT = stabTip / stabRoot;
const macT = (2 / 3) * stabRoot * (1 + lamT + lamT * lamT) / (1 + lamT);
const yMacT = (stabHalf / 3) * (1 + 2 * lamT) / (1 + lamT);
const xAcTail = stabLE + stabSweep * yMacT / stabHalf + 0.25 * macT;
/* The fin and rudder. The fin a triangle, 122 mm at the root over 198 mm
 * of height; the rudder 89 mm by 254 mm less its rounded top, 21000 mm^2;
 * their centroid 128 mm over the thrust line, at station 1060. */
const Sfin = 0.5 * 122 * 198 * 1e-6, Srud = 21000 * 1e-6;
const Sv = Sfin + Srud, xAcFin = 1060, zFin = 128;
const zv = MM(zFin - zCG);
const eta = 0.9;
/* Surface effectiveness from the chord shares (Nelson fig. 2.21): the
 * elevator 35 to 50 percent, 0.60; the rudder 60 percent of the tail's
 * chord at mid height, 0.72; the strip ailerons 15 percent, 0.33. */
const tauE = 0.60, tauR = 0.72, tauA = 0.33;
/* The fin's aspect ratio, its height squared over its area, raised half
 * again by the stabiliser across it. */
const arV = 1.5 * (0.254 * 0.254 / Sv);
/* The ailerons' span, per semispan. */
const y1 = 103 / 667, y2 = 606 / 667;
/*
 * THE THROWS, the ARTF's manual, "each measured at the widest point of
 * the surface": elevator 9 to 15 mm, rudder 45 mm, ailerons 6 to 9 mm. The
 * top of each, over the surface's chord there: the elevator's 57 mm at
 * the root, the rudder's 89, the ailerons' 43. The low end of each range
 * is the low rate. One expo, the plant's 30 percent.
 */
const deg = (mm, chord) => Math.asin(mm / chord);
const throwA = deg(9, 43), throwE = deg(15, 57), throwR = deg(45, 89);
const lowA = deg(6, 43), lowE = deg(9, 57), lowR = throwR;
const expo = 0.30;

/* The thrust line through the CG. No down or side thrust is published;
 * the manual says only to line the engine up true, "as any discrepancy
 * here will induce undesirable engine thrust". */
const thrustZ = -MM(zCG);
/*
 * THE POWER, Foss's conversion (chrisfoss.co.uk, "Wot 4 electric
 * conversion", Dec. 2007): "AXI 4120/14 brushless motor, or equivalent,
 * and APC 13 x 8 propeller", "60 amp speed controller", "3700 mah 4 cell
 * 14.8v Li-Poly battery", which "will hold a vertical climb from take-off
 * on a freshly charged battery". AXI (modelmotors.cz, the 4120/14 GOLD
 * LINE V3): 660 rpm/V, 315 g, 55 A for 60 s, and on 4S with a 13 x 8
 * 3,500 g of thrust. The plant's rule for every electric table: no load at
 * kV times 3.7 V a cell, loaded at 0.85 of it, the pitch speed the loaded
 * rpm times the pitch.
 */
const kv = 660, cells = 4, pitchIn = 8, propR = 6.5 * 0.0254;
const Ts = 3.5 * 9.80665;
const rpmNL = kv * 3.7 * cells;
const Vp = rpmNL / 60 * pitchIn * 0.0254 * 0.85;
const omegaLoaded = 0.85 * rpmNL * 2 * Math.PI / 60;
const currentFull = 55;
const T = (V, d) => Math.max(0, Ts * d * d * (1 - V / (Vp * d)));
/*
 * Inertia, ESTIMATED from the masses: the wing 0.46 kg as a bar across the
 * span, the motor 0.32 kg 0.28 m ahead, the pack 0.40 kg 0.12 m ahead, the
 * tail group 0.12 kg 0.76 m behind, the fuselage 0.55 kg along its 1.1 m,
 * the servos, receiver and controller near the CG.
 */
const Ixx = 0.46 * b * b / 12 + 0.012;
const Iyy = 0.32 * 0.28 ** 2 + 0.40 * 0.12 ** 2 + 0.12 * 0.76 ** 2 + 0.55 * 1.1 ** 2 / 12 + 0.46 * c * c / 12;
const Izz = Ixx + Iyy - 0.008;

const lh = MM(xAcTail - xAcWing);
const lv = MM(xAcFin - xCG);

/* The coefficients, in the plant's reference chord S/b. */
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
/* DATCOM's downwash gradient: the stabiliser 37 mm under the wing's
 * plane. */
const KA = 1 / AR - 1 / (1 + Math.pow(AR, 1.7));
const KL = (10 - 3 * 1.0) / 7;
const hH = MM(zWing - zStab);
const KH = (1 - hH / b) / Math.cbrt(2 * lh / b);
const deda = 4.44 * Math.pow(KA * KL * KH, 1.19);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const hn = VH * eta * (at / aw) * (1 - deda);
const xNP = xAcWing + hn * chordMm;
const SM = (xNP - xCG) / chordMm;
const Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c;
const Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
/* The zero lift line, the aircraft's: the wing's -2 deg, the stabiliser
 * at none carrying none there less the downwash's share. */
const alphaZL = aw * alphaZLw * (1 + (at / aw) * (Sh / S) * eta * deda) / CLa;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
/* The fuselage: a slab sided box 1.05 m long and a mean 0.12 m deep, 0.13
 * m^2 in side view, Nelson eq. 2.64's weathercock term with DATCOM's K_N
 * 0.0012 per deg; its side force the Edge's -0.10 scaled by the side area
 * over the wing's. */
const SBs = 0.13, lf = 1.05;
const CnbFus = -0.0012 * DEG * (SBs / S) * (lf / b);
const CYb = -av * Sv / S - 0.10 * (SBs / S) / (0.26 / 0.48387);
const Cnb = av * VV + CnbFus;
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/*
 * Clβ: a flat wing, no dihedral, but on top of the fuselage. DATCOM's
 * wing and body term, -1.2 sqrt(AR) (z_w / b) (2 d / b) per 57.3 deg, the
 * wing's root 60 mm over the box's centre line, the box 110 mm across;
 * and the fin's over the CG.
 */
const ClbWing = -1.2 * Math.sqrt(AR) * (0.060 / b) * (2 * 0.110 / b);
const ClbFin = -av * (Sv / S) * (zv / b);
const Clb = ClbWing + ClbFin;
/* Strip theory on a constant chord: Clp -aw / 8; Clda over the ailerons'
 * span (Nelson eq. 5.46). */
const Clp = -aw / 8;
const Clda = 2 * aw * tauA * c * (b / 2) ** 2 * (y2 * y2 - y1 * y1) / 2 / (S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
const ClrPerCL = 0.25, CnpPerCL = -0.125, CndaPerCL = -0.12;
/* The side crossflow drag area, as the Extra's: the side area at Allen
 * and Perkins' crossflow 1.2 times their eta, 0.7. */
const sideCda = SBs * 1.2 * 0.7;

const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 6, hi = 40;
  if (T(lo, d) < D(lo) && T(10, d) < D(10)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
let best = { vz: -1, V: 0 };
for (let V = 1.2 * Vs; V < 30; V += 0.02) { const vz = (T(V, 1) - D(V)) * V / W; if (vz > best.vz) best = { vz, V }; }
const discP = Math.pow(Ts, 1.5) / Math.sqrt(2 * rho * Math.PI * propR * propR);

/* The trim: hands off at three quarter throttle, the sport cruise the
 * Edge is trimmed at too (at half throttle the plant's prop law holds no
 * level flight), the elevator neutral: Cm0 holds the lift that speed
 * needs. */
const Vtrim = level(0.75);
const CLtrim = 2 * W / (rho * Vtrim * Vtrim * S);
/* The plant takes the pitching moment on the angle of the zero lift line,
 * so Cm0 is the lift over the lift slope's worth of it. */
const Cm0 = -Cma * (CLtrim / CLa);
/*
 * THE SURFACE'S KNEE (surf_knee, docs/EDGE-STAGE1.md): the plant reads a
 * surface's angle as delta / sqrt(1 + (delta / knee)^2), DATCOM's plain
 * flap K'. At the Edge's knee, 0.5 rad, the ailerons' 12 deg and the
 * elevator's 15 keep 97 and 96 percent, the big rudder's 30 deg 69.
 */
const knee = 0.5;
const eff = (d) => d / Math.sqrt(1 + (d / knee) ** 2);
const rollAt = (V, dA) => Clda * eff(dA) / -Clp * 2 * V / b;
const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));

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
  return {
    V, CL,
    spiral: real[real.length - 1],
    rollTau: -1 / real[0],
    dutch: dr ? { wn: Math.hypot(dr.re, dr.im), zeta: -dr.re / Math.hypot(dr.re, dr.im) } : null,
  };
}
/* Full aileron at once from level at V, the linear lateral model with the
 * ailerons' roll and their adverse yaw: the largest sideslip over the
 * first half second, rudder centred. */
function aileronStep(V) {
  const q = 0.5 * rho * V * V, CL = W / (q * S);
  const bv = b / (2 * V);
  const Yb = q * S * CYb / m;
  const Lb = q * S * b * Clb / Ixx, Lp = q * S * b * Clp * bv / Ixx, Lr = q * S * b * ClrPerCL * CL * bv / Ixx;
  const Nb = q * S * b * Cnb / Izz, Np = q * S * b * CnpPerCL * CL * bv / Izz, Nr = q * S * b * Cnr * bv / Izz;
  const da = eff(throwA);
  const Lda = q * S * b * Clda * da / Ixx, Nda = q * S * b * CndaPerCL * CL * da / Izz;
  let x = [0, 0, 0, 0], worst = 0;
  const dt = 0.0002;
  for (let t = 0; t < 0.5; t += dt) {
    const [bt, p, r, ph] = x;
    const d = [Yb / V * bt - r + g / V * ph, Lb * bt + Lp * p + Lr * r + Lda, Nb * bt + Np * p + Nr * r + Nda, p];
    x = x.map((v, i) => v + d[i] * dt);
    worst = Math.max(worst, Math.abs(x[0]));
  }
  return worst;
}
function longitudinal(V) {
  const q = 0.5 * rho * V * V, CL = W / (q * S);
  const Xu = -2 * q * S * (CD0 + k * CL * CL) / (m * V);
  const Zu = -2 * q * S * CL / (m * V);
  const Za = -q * S * (CLa + CD0) / m;
  const Ma = q * S * c * Cma / Iyy;
  const Mq = q * S * c * Cmq * c / (2 * V) / Iyy;
  const A = [[Xu, 0, 0, -g], [Zu / V, Za / V, 1, 0], [0, Ma, Mq, 0], [0, 0, 1, 0]];
  const rs = roots(charPoly(A)).filter((r) => r.im > 1e-6).map((r) => ({ period: 2 * Math.PI / r.im, zeta: -r.re / Math.hypot(r.re, r.im) }));
  rs.sort((x, y) => y.period - x.period);
  return { phugoid: rs[0], short: rs[1] };
}

/*
 * THE GEAR, drawn: the axles 74 mm ahead of the CG and 222 mm under it on
 * 2 1/2 in wheels, a 300 mm track (ESTIMATED: the cover's photograph); the
 * tailwheel's 1 in wheel 781 mm behind and 51 mm under.
 */
const mainX = MM(xCG - 234), mainZ = -MM(202 + zCG), wheelR = MM(31.75);
const tailX = -MM(1089 - xCG), tailZ = -MM(31 + zCG), tailR = MM(12.7);
const restPitch = Math.atan2((tailZ - tailR) - (mainZ - wheelR), mainX - tailX);
const th = restPitch;
const along = (x, z) => x * Math.cos(th) - z * Math.sin(th);
const cgHeight = -((mainZ - wheelR) * Math.cos(th) + mainX * Math.sin(th));
const mainW = along(mainX, mainZ), tailW = along(tailX, tailZ);
const tailShare = mainW / (mainW - tailW);
const loadMain = W * (1 - tailShare) / 2, loadTail = W * tailShare;
const defl = 0.006;
const kMain = loadMain / defl, kTail = loadTail / defl;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mTail = (Iyy + m * mainW * mainW) / Math.pow(mainW - tailW, 2);
const cTail = 2 * 0.6 * Math.sqrt(kTail * mTail);
const propX = MM(xCG);
const tipLevel = -(mainZ - wheelR) - (propR - thrustZ * 0) + thrustZ;
const tipRest = propX * Math.sin(restPitch) - (mainX * Math.sin(restPitch) + (mainZ - wheelR) * Math.cos(restPitch)) + thrustZ * Math.cos(restPitch) - propR;

/* Straight up at full throttle: T(V) = W + q S CD0. */
const vertical = (() => {
  let lo = 0, hi = Vp;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (T(mid, 1) > W + 0.5 * rho * mid * mid * S * CD0) lo = mid; else hi = mid;
  }
  return lo;
})();

/*
 * THE SLIPSTREAM over the tail and the ailerons (plant_wing.c, slip_r,
 * docs/EXTRA-STAGE1.md), the Extra's capability: the Wot 4's rudder and
 * elevator sit in the 13 in prop's wash, which is what flies it slowly
 * nose high and straight up, where the free stream alone left the rudder
 * too weak at 10 m/s to hold the yaw the P factor and the ailerons' own
 * yaw put in, and what RCM&E's "the model will hover (and even fly
 * backwards!) in a strong wind" needs. Momentum theory as the plant takes
 * it; the surfaces' spans: the stabiliser's half span, the rudder from
 * the thrust line to the fin's tip, the ailerons 103 to 606 mm out.
 */
const hvUp = MM(258 - zCG), hvDn = 0.0, aileronIn = MM(103), aileronOut = MM(606);
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
/* The tail's shares of the derivatives, as extra-derive.js takes them; the
 * stabiliser's zero lift at the trim's body angle of attack, the lift over
 * the slope less the zero lift line's angle under the body. */
const slipCla = at * (Sh / S) * eta * (1 - deda);
const slipCma = -eta * VH * at * (1 - deda);
const slipA0 = CLtrim / CLa + alphaZL;
const slipCnb = av * VV, slipCnr = -2 * av * VV * lv / b, slipCyb = -av * Sv / S, slipClb = ClbFin;

/* The knife edge, as extra-derive.js takes it, the wash in: rolled to 90
 * deg at V, the fuselage and fin's side force at a sideslip beta and the
 * crossflow drag hold the weight with the thrust's share along the yawed
 * axis; the rudder holds the sideslip against the weathercock, in the
 * free stream and the wash, and its own side force opposes. Past the
 * rudder's reach at full throttle, the share of the weight it holds and
 * the sink the rest leaves. */
function knifeEdge(V) {
  const qb = 0.5 * rho * V * V;
  const drMax = eff(throwR);
  const at1 = (bDeg) => {
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
    const roll = qb * S * b * (Clb * sb + Cldr * dr) + rho * w.vi * w.fv * S * b * slipClb * (V * sb) + w.dp * w.fv * S * b * Cldr * dr;
    const perAileron = (qb + w.dp * w.fa) * S * b * Clda * eff(throwA);
    return { sb, cb, u, thrust, side, dr, couple: roll / perAileron };
  };
  let last = null;
  for (let bDeg = 1; bDeg < 60; bDeg += 0.01) {
    const k1 = at1(bDeg);
    if (T(k1.u, 1) < k1.thrust || Math.abs(k1.dr) > drMax) {
      if (!last) return { V, none: 'nothing' };
      const up = last.side * last.cb + T(last.u, 1) * last.sb;
      return { V, heldTo: +(bDeg - 0.01).toFixed(2), why: T(k1.u, 1) < k1.thrust ? 'thrust' : 'rudder', shareOfWeight: +(up / W).toFixed(3), sinkAccel: +((W - up) / m).toFixed(2), rollOfAileron: +last.couple.toFixed(3) };
    }
    if (k1.side * k1.cb + k1.thrust * k1.sb >= W) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (T(k1.u, mid) < k1.thrust) lo = mid; else hi = mid; }
      return { V, betaDeg: +bDeg.toFixed(2), duty: +lo.toFixed(3), drOfThrow: +(Math.abs(k1.dr) / drMax).toFixed(3), rollOfAileron: +k1.couple.toFixed(3) };
    }
    last = k1;
  }
  return { V, none: 'no sideslip holds it' };
}

/* The take off on grass, as edge-derive.js: tail up at 6 m/s at 3 deg of
 * pitch, the throttle opened over a second, rotated at 1.2 Vs to 10 deg
 * at a steady 40 deg/s. */
function takeoff(mu, Vtail, vRot) {
  let V = 0, x = 0, t = 0, a = restPitch, rotating = false;
  const dt = 0.001;
  while (t < 30) {
    const q = 0.5 * rho * V * V;
    if (V >= vRot) rotating = true;
    if (rotating) a = Math.min(10 / DEG, a + 40 / DEG * dt);
    else a = V < Vtail ? restPitch : 3 / DEG;
    const CLg = CLa * (a - alphaZL);
    if (rotating && q * S * CLg >= W) return { x, t, V };
    const CDg = CD0 + k * CLg * CLg;
    const d = Math.min(1, Math.max(0.02, t));
    const acc = (T(V, d) - q * S * CDg - mu * Math.max(0, W - q * S * CLg)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return null;
}

/* A loop: from level at full throttle, the speed at the top of the
 * biggest round loop it can fly on its energy, pulled at CL 0.6 at the
 * bottom (a sport pilot's firm pull, 2.3 g at 20 m/s): the radius at the
 * entry and the speed left at the top, energy and drag taken on a circle. */
function loop(Vin, CLpull) {
  const R0 = m * Vin * Vin / (0.5 * rho * Vin * Vin * S * CLpull - W);
  let V = Vin, th2 = 0, n = 0;
  const dth = 0.001;
  while (th2 < Math.PI) {
    const q = 0.5 * rho * V * V;
    const CL = (m * V * V / R0 + W * Math.cos(th2)) / (q * S);
    const drag = q * S * (CD0 + k * CL * CL);
    const dE = (T(V, 1) - drag - W * Math.sin(th2)) * R0 * dth;
    const ke = 0.5 * m * V * V + dE;
    if (ke <= 0) return { R0, top: null };
    V = Math.sqrt(2 * ke / m);
    th2 += dth;
    n += 1;
    if (CL > CLmax) return { R0, top: V, stalledAtDeg: th2 * DEG };
  }
  return { R0, top: V, diameter: 2 * R0 };
}

const lat = lateral(Vtrim);
const lon = longitudinal(Vtrim);
const rows = [
  ['b, S, c = S/b, AR, m, W/S N/m^2', `${f(b, 4)} ${f(S, 5)} ${f(c, 4)} ${f(AR, 3)} ${f(m, 4)} ${f(W / S, 2)}`],
  ['stations: wing ac, CG, NP, tail ac, fin (mm)', `${f(xAcWing, 1)} ${f(xCG, 1)} ${f(xNP, 1)} ${f(xAcTail, 1)} ${f(xAcFin, 1)}`],
  ['S_h m^2, AR_t, l_h m, l_v m, S_v m^2', `${f(Sh, 5)} ${f(ARt, 2)} ${f(lh, 4)} ${f(lv, 4)} ${f(Sv, 5)}`],
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['deps/dalpha DATCOM, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLalpha, static margin, alpha_zl deg', `${f(CLa)} ${f(SM, 4)} ${f(alphaZL * DEG, 3)}`],
  ['sin, cos of alpha_zl', `${alphaZL} ${Math.sin(alphaZL).toPrecision(17)} ${Math.cos(alphaZL).toPrecision(17)}`],
  ['Cmalpha, Cm0, Cmq', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)}`],
  ['Cmde, CLde', `${f(Cmde, 4)} ${f(CLde, 4)}`],
  ['CYbeta, Cnbeta (fuselage), Cnr', `${f(CYb, 4)} ${f(Cnb, 4)} (${f(CnbFus, 4)}) ${f(Cnr, 4)}`],
  ['Clbeta (wing on top, fin), Clp, Clda', `${f(Clb, 4)} (${f(ClbWing, 4)}, ${f(ClbFin, 4)}) ${f(Clp, 4)} ${f(Clda, 4)}`],
  ['Cndr, CYdr, Cldr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['k, CLmax, CD0', `${f(k, 5)} ${f(CLmax)} ${f(CD0)}`],
  ['throws high a e r, low (deg)', `${f(throwA * DEG, 2)} ${f(throwE * DEG, 2)} ${f(throwR * DEG, 2)}; ${f(lowA * DEG, 2)} ${f(lowE * DEG, 2)} ${f(lowR * DEG, 2)}`],
  ['inertia Ixx Iyy Izz', `${f(Ixx, 4)} ${f(Iyy, 4)} ${f(Izz, 4)}`],
  ['rpm no load, V_p, current A', `${f(rpmNL, 0)} ${f(Vp, 3)} ${f(currentFull, 1)}`],
  ['static thrust N, thrust to weight', `${f(Ts, 3)} ${f(Ts / W, 3)}`],
  ['disc power W, torque N m, arm m', `${f(discP, 1)} ${f(discP / omegaLoaded, 4)} ${f(discP / omegaLoaded / Ts, 5)}`],
  ['W1 level at 50, 75 (the trim), 100 percent', `${f(level(0.5), 2)} ${f(level(0.75), 2)} ${f(level(1), 2)}`],
  ['W2 stall m/s, alpha stall (rad over the zero lift line)', `${f(Vs, 3)} ${f(CLmax / CLa, 5)}`],
  ['W3 glide at 1.4 Vs, best, at', `${f(ld(1.4 * Vs), 2)} ${f(LDmax, 2)} ${f(Vmd, 2)}`],
  ['W5 full aileron pb/2V; deg/s at 15, 20 m/s', `${f(Clda * eff(throwA) / -Clp, 4)} ${f(rollAt(15, throwA) * DEG, 0)} ${f(rollAt(20, throwA) * DEG, 0)}`],
  ['W5 full aileron from level at 18 m/s: the largest sideslip in 0.5 s, deg', f(aileronStep(18) * DEG, 2)],
  ['   low rate: pb/2V, deg/s at 20', `${f(Clda * eff(lowA) / -Clp, 4)} ${f(rollAt(20, lowA) * DEG, 0)}`],
  ['best climb at a held airspeed, m/s at m/s', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['W7 straight up at full throttle, m/s', f(vertical, 2)],
  ['lateral at the trim: V, CL, spiral root', `${f(lat.V, 2)} ${f(lat.CL)} ${f(lat.spiral, 4)}`],
  ['   roll tau s, Dutch roll wn zeta', `${f(lat.rollTau, 4)} ${lat.dutch ? `${f(lat.dutch.wn, 2)} ${f(lat.dutch.zeta)}` : 'none'}`],
  ['   phugoid s zeta, short period s zeta', `${f(lon.phugoid && lon.phugoid.period, 2)} ${f(lon.phugoid && lon.phugoid.zeta)}; ${f(lon.short && lon.short.period, 3)} ${f(lon.short && lon.short.zeta)}`],
  ['alpha at full up over the zero lift line, stall (deg)', `${f((Cm0 + Cmde * eff(throwE)) / -Cma * DEG, 1)} ${f(CLmax / CLa * DEG, 2)}`],
  ['   low rate: alpha at full up (deg)', f((Cm0 + Cmde * eff(lowE)) / -Cma * DEG, 2)],
  ['W8 at full throttle: stick upright, on its back, the push between', (() => {
    const V = level(1), CLf = 2 * W / (rho * V * V * S);
    /* The stick through the expo for an elevator angle read through the
     * knee, trailing edge up positive. */
    const stickFor = (de) => {
      let lo = -1, hi = 1;
      for (let i = 0; i < 80; i += 1) {
        const mid = (lo + hi) / 2;
        const d = (expo * mid ** 3 + (1 - expo) * mid) * throwE;
        if (eff(d) < de) lo = mid; else hi = mid;
      }
      return lo;
    };
    const deFor = (CL) => -(Cm0 + Cma * (CL / CLa)) / Cmde;
    const u = stickFor(deFor(CLf)), i = stickFor(deFor(-CLf));
    return `${f(u, 3)} ${f(i, 3)} ${f(u - i, 3)}`;
  })()],
  ['W9 a loop from full throttle level: radius m, speed at the top', JSON.stringify(loop(level(1), 0.6), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['W12 knife edge at 15, 18, 21 m/s', ''],
  ['   15', JSON.stringify(knifeEdge(15))],
  ['   18', JSON.stringify(knifeEdge(18))],
  ['   21', JSON.stringify(knifeEdge(21))],
  ['side crossflow drag area m^2', f(sideCda, 4)],
  ['slip: r, yh, hv up dn, ya in out', `${f(propR, 4)} ${f(bh / 2, 4)} ${f(hvUp, 4)} ${f(hvDn, 4)} ${f(aileronIn, 4)} ${f(aileronOut, 4)}`],
  ['slip: a0, cl_a, cm_a, cn_b, cn_r, cy_b, cl_b', `${f(slipA0, 4)} ${f(slipCla, 4)} ${f(slipCma, 4)} ${f(slipCnb, 4)} ${f(slipCnr, 4)} ${f(slipCyb, 4)} ${f(slipClb, 4)}`],
  ['the wash hanging at 10 m/s straight up: dp Pa, v_i, rw, fh fv fa', (() => { const w = wash(T(10, 1), 10); return `${f(w.dp, 1)} ${f(w.vi, 2)} ${f(w.rw, 4)} ${f(w.fh, 3)} ${f(w.fv, 3)} ${f(w.fa, 3)}`; })()],
  ['rest: pitch deg, CG height m, tail share', `${f(restPitch * DEG, 2)} ${f(cgHeight, 4)} ${f(tailShare, 4)}`],
  ['   gear body frame: main x z, tail x z', `${f(mainX, 4)} ${f(mainZ - defl, 4)} ${f(tailX, 4)} ${f(tailZ - defl, 4)}`],
  ['   k main, c main, k tail, c tail', `${f(kMain, 0)} ${f(cMain, 2)} ${f(kTail, 0)} ${f(cTail, 2)}`],
  ['   prop tip over the grass level, at rest m', `${f(tipLevel, 4)} ${f(tipRest, 4)}`],
  ['arms for the stall model: ac, cp, dw', `${f((xCG - xAcWing) / chordMm, 4)} ${f((wingLE + 0.40 * chordMm - xCG) / chordMm, 4)} ${f(eta * VH * at * deda / aw, 4)}`],
  ['W14 take off on grass, rotated at 1.2 Vs', JSON.stringify(takeoff(0.08, 6, 1.2 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['W15 taxi radius, wheelbase over tan of the tailwheel at the rudder\'s angle, m', f((mainX - tailX) / Math.tan(throwR), 3)],
  ['effective throws through the knee a e r (deg)', `${f(eff(throwA) * DEG, 2)} ${f(eff(throwE) * DEG, 2)} ${f(eff(throwR) * DEG, 2)}`],
  ['strip_tau: the aileron\'s share of each strip times tau_a', [[0, 1], [1, 2], [2, 3], [3, 4]].map(([a0, a1]) => f(tauA * Math.max(0, Math.min(a1 / 4, y2) - Math.max(a0 / 4, y1)) * 4, 3)).join(' ')],
  ['W6 prop torque N m, arm m', `${f(discP / omegaLoaded, 4)} ${f(discP / omegaLoaded / Ts, 5)}`],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(58)} ${v}`);
}
