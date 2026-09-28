/*
 * edge-derive.js: the arithmetic behind docs/EDGE-STAGE1.md, from Extreme
 * Flight's published figures for its 60 in Edge 540T (the kit's data sheet
 * and assembly guide), T-Motor's for the AM600 on its 16 x 8, FlyingRC's
 * review, and the drawn model, to every coefficient and every derived band.
 * It never loads the plant: this is what the plant is checked against, so
 * it stands apart from it. Harness arithmetic in JS maths, which is
 * allowed here because nothing it prints is hashed. It follows
 * scripts/cub-derive.js where the two aircraft are alike: both are four
 * channel electric taildraggers with ailerons. Run with npm run edge:derive.
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

/*
 * The aircraft. Span, area, length and weight are Extreme Flight's data
 * sheet (60 in, 750 sq in, 58 in, 5 to 6 lb, the middle taken); the
 * balance is FlyingRC's measured "4 in sweet spot" inside EF's 3 3/4 to
 * 4 3/4 in at the root, which is "on the wing tube". The planform, the tail
 * and the stations are the drawn model's (src/render/edgecraft.js,
 * EDGE_DIMS), ESTIMATED off EF's photographs scaled by the published span
 * and length: a wing tapering from 15 in at the root to 10 in at the tip
 * with a straight trailing edge, so its area is the published 750 sq in.
 * Stations are inches aft of the prop's plane.
 */
const b = R(60), S = R(1) * R(1) * 750, m = 5.5 * 0.45359237, W = m * g, c = S / b, AR = b * b / S;
const cr = 15, ct = 10, lambda = ct / cr, semi = 30;
const mac = (2 / 3) * cr * (1 + lambda + lambda * lambda) / (1 + lambda);
const yMac = (semi / 3) * (1 + 2 * lambda) / (1 + lambda);
const macLE = (cr - ct) * yMac / semi;           /* the leading edge sweeps back 5 in, the trailing edge is square */
const wingLE = 15.0, cgAft = 4.0;
const xCG = wingLE + cgAft;
const xAcWing = wingLE + macLE + 0.25 * mac;
/*
 * A symmetric section at zero incidence, the full size Edge's John Roncz
 * symmetrical (Wikipedia, "Zivko Edge 540") and every 3D model's, and a
 * stabiliser at zero: the zero lift line is the thrust line.
 */
const alphaZL = 0;
/* A symmetric section of about 12 percent at 2e5: the wing's CLmax is 0.9
 * of the section's 1.0, XFOIL's for the NACA 0012 at 1.79e5 (aerospaceweb,
 * "NACA 0012 Lift Characteristics"), ESTIMATED (see SECTION in
 * scripts/stall-derive.js for the section's stall). CD0: film over a built up frame, a big canopy,
 * wheel pants on carbon legs, the side force generators off; ESTIMATED. */
const CLmax = 0.90, CD0 = 0.035, e = 0.80, k = 1 / (Math.PI * e * AR);
/*
 * The stabiliser, drawn: 23 in across, 9.5 in at the root and 6 in at the
 * tip, its leading edge swept and its hinge line square, the elevator 45
 * percent of its chord; its root leading edge at station 42.5. The fin and
 * rudder: 40 sq in of fin and 95 sq in of rudder running to the bottom of
 * the fuselage, as EF's photographs show, their centroid 3.5 in over the
 * thrust line and 34 in behind the CG.
 */
const Sh = R(1) * R(1) * 23 * (9.5 + 6) / 2, bh = R(23);
const macT = (2 / 3) * 9.5 * (1 + 6 / 9.5 + (6 / 9.5) ** 2) / (1 + 6 / 9.5);
const yMacT = (11.5 / 3) * (1 + 2 * 6 / 9.5) / (1 + 6 / 9.5);
const xAcTailSt = 42.5 + 3.5 * yMacT / 11.5 + 0.25 * macT;
const Sv = R(1) * R(1) * (40 + 95), xAcFinSt = 53.0, zv = R(3.5);
const eta = 0.9;
/* Surface effectiveness from the chord shares (Nelson fig. 2.21): the
 * elevator 45 percent, the rudder 70, the ailerons 33. */
const tauE = 0.66, tauR = 0.80, tauA = 0.55;
/* The fin's aspect ratio, 13 in over 135 sq in, raised half again by the
 * stabiliser across it. */
const arV = 1.5 * (13 * 13 / 135);
/* Ailerons: the whole trailing edge outside the fuselage, 2.75 in to the
 * tip at 30 in, a constant 4 in of chord (the photographs). */
const y1 = R(2.75) / (b / 2), y2 = 1.0;
/*
 * EF's throws, the data sheet: aileron high rate 38 to 40 deg, elevator the
 * 3D rate 45 to 50, rudder high rate 45 to 50, the middles taken. Low
 * rates 15 to 20, 8 to 10 and 20.
 */
const throwA = 39 / DEG, throwE = 47.5 / DEG, throwR = 47.5 / DEG;
/* The table's one expo, 70 percent, inside EF's aileron and rudder ranges. */
const expoE70 = 0.70;
/*
 * THE SURFACE'S KNEE (a new plant term, docs/EDGE-STAGE1.md). A plain flap
 * loses effectiveness past about 15 deg as its flow separates: DATCOM's
 * K' (fig. 6.1.1.1-40, plain flaps) falls to about 0.8 at 20 deg, 0.65 at
 * 30, 0.55 at 40 and 0.5 at 50. The plant takes delta / sqrt(1 +
 * (delta / knee)^2), which with the knee at 0.5 rad is 0.82, 0.69, 0.58,
 * 0.50 at those angles: a trainer's 15 deg loses 4 percent, an aerobat's
 * 47 deg half.
 */
const knee = 0.5;
const eff = (d) => d / Math.sqrt(1 + (d / knee) ** 2);

/* The prop's thrust line is the thrust line: the motor on the centre line
 * through the CG of a mid wing, EF's 2.5 to 3 deg of right thrust not
 * modelled (P factor and torque below are). */
const thrustZ = 0;
/*
 * The T-Motor AM600 525 kV on 6S with its T16x8, EF's recommendation:
 * T-Motor's published "up to 8298g of thrust" and "maximum power 1700W"
 * with that prop. The plant's rule: no load at kV times 3.7 V a cell, loaded
 * at 0.85 of it, the pitch speed the loaded rpm times the pitch.
 */
const kv = 525, cells = 6, pitchIn = 8, propR = R(8);
const Ts = 8.298 * 9.80665;
const rpmNL = kv * 3.7 * cells;
const Vp = rpmNL / 60 * pitchIn * 0.0254 * 0.85;
const omegaLoaded = 0.85 * rpmNL * 2 * Math.PI / 60;
const currentFull = 1700 / (3.7 * cells);
const T = (V, d) => Math.max(0, Ts * d * d * (1 - V / (Vp * d)));
/*
 * Inertia, ESTIMATED from the masses: the wing panels 0.50 kg as a tapered
 * bar, the motor 0.36 kg 0.44 m ahead, the pack 0.58 kg 0.12 m ahead, the
 * tail group 0.14 kg 0.80 m behind, the fuselage 0.45 kg along its 1.4 m.
 */
const Ixx = 0.105, Iyy = 0.215, Izz = 0.305;

const lh = R(xAcTailSt - xAcWing);
const lv = R(xAcFinSt - xCG);

/* The coefficients, in the plant's reference chord S/b. */
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
/* DATCOM's downwash gradient, the Kadet's: a mid wing, the stabiliser on
 * the thrust line, the wing's plane. */
const KA = 1 / AR - 1 / (1 + Math.pow(AR, 1.7));
const KL = (10 - 3 * lambda) / 7;
const hH = R(0.0);
const KH = (1 - hH / b) / Math.cbrt(2 * lh / b);
const deda = 4.44 * Math.pow(KA * KL * KH, 1.19);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const hn = VH * eta * (at / aw) * (1 - deda);            /* the NP behind the wing's ac, per c */
const xNP = xAcWing + mac * 0 + hn * (c / 0.0254);
const SM = (xNP - xCG) * 0.0254 / c;
const Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c;
const CmdeLin = eta * VH * at * tauE, CLdeLin = -eta * (Sh / S) * at * tauE;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
/* The fuselage, deep and slab sided: Nelson eq. 2.64's weathercock term
 * with DATCOM's K_N 0.0012 per deg, on 0.26 m^2 of side area over 1.40 m. */
const SBs = 0.26, lf = R(55);
const CnbFus = -0.0012 * DEG * 1.0 * (SBs / S) * (lf / b);
const CYb = -av * Sv / S - 0.10;
const Cnb = av * VV + CnbFus;
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/* No dihedral on a mid wing: the fin's roll alone. */
const Clb = -av * (Sv / S) * (zv / b);
/* Strip theory on the taper: Clp -aw (1 + 3 lambda) / (12 (1 + lambda)),
 * Clda from the ailerons' chord share over their span (Nelson eq. 5.46 on
 * the tapered chord). */
const Clp = -aw * (1 + 3 * lambda) / (12 * (1 + lambda));
const chordAt = (eta2) => R(cr) * (1 - (1 - lambda) * eta2);
let intCy = 0;
for (let i = 0; i < 4000; i += 1) {
  const e2 = y1 + (y2 - y1) * (i + 0.5) / 4000;
  intCy += chordAt(e2) * e2 * (b / 2) * (b / 2) * (y2 - y1) / 4000;
}
const ClDaLin = 2 * aw * tauA * intCy / (S * b);
const CndrLin = -VV * av * tauR, CYdrLin = av * (Sv / S) * tauR, CldrLin = CYdrLin * zv / b;
const ClrPerCL = 0.25, CnpPerCL = -0.125, CndaPerCL = -0.10;

const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 8, hi = 45;
  if (T(lo, d) < D(lo) && T(12, d) < D(12)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
let best = { vz: -1, V: 0 };
for (let V = 1.2 * Vs; V < 30; V += 0.02) { const vz = (T(V, 1) - D(V)) * V / W; if (vz > best.vz) best = { vz, V }; }
const discP = Math.pow(Ts, 1.5) / Math.sqrt(2 * rho * Math.PI * propR * propR);

/* The trim: the neutral elevator flies it level at three quarter throttle,
 * the cruise an aerobatic pilot trims at so the aircraft tracks through
 * its manoeuvres; with the section symmetric and both incidences zero, Cm0
 * is the stabiliser rigged to hold that. Inverted it then wants "just a bit
 * of down elevator to hold" (FlyingRC's review). */
const Vtrim = level(0.75);
const CLtrim = 2 * W / (rho * Vtrim * Vtrim * S);
const Cm0 = -Cma * CLtrim / CLa;

/* The derivatives the plant flies, at the high rates' full throw, and the
 * effective deflection's, through the knee. */
const rollAt = (V, dA) => ClDaLin * eff(dA) / -Clp * 2 * V / b;
const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));

/* The lateral model, Nelson ch. 5, as kadet-derive.js has it. */
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

/* The longitudinal model at a speed, for the phugoid and the short period. */
function longitudinal(V) {
  const q = 0.5 * rho * V * V, CL = W / (q * S);
  const u0 = V;
  const Xu = -2 * q * S * (CD0 + k * CL * CL) / (m * V);
  const Zu = -2 * q * S * CL / (m * V);
  const Za = -q * S * (CLa + CD0) / m;
  const Ma = q * S * c * Cma / Iyy;
  const Mq = q * S * c * Cmq * c / (2 * V) / Iyy;
  const A = [[Xu, 0, 0, -g], [Zu / u0, Za / u0, 1, 0], [0, Ma, Mq, 0], [0, 0, 1, 0]];
  const rs = roots(charPoly(A)).filter((r) => r.im > 1e-6).map((r) => ({ period: 2 * Math.PI / r.im, zeta: -r.re / Math.hypot(r.re, r.im) }));
  rs.sort((x, y) => y.period - x.period);
  /* The pitch rate's answer to an elevator step de (rad, trailing edge up
   * positive), the same linear model with the elevator's moment and lift:
   * the time to its first peak and the peak. */
  const Zde = -q * S * CLdeLin / m;
  const Mde = q * S * c * CmdeLin / Iyy;
  const step = (de) => {
    let x = [0, 0, 0, 0];
    let peak = 0, at = null;
    const dt = 0.0005;
    for (let t = 0; t < 1.5; t += dt) {
      const dx = A.map((row, i) => row.reduce((acc, v, j) => acc + v * x[j], 0) + [0, Zde / u0, Mde, 0][i] * de);
      x = x.map((v, i) => v + dx[i] * dt);
      if (x[2] > peak) { peak = x[2]; at = t + dt; } else if (at !== null && x[2] < 0.97 * peak) break;
    }
    return { at, peakDegS: peak * DEG };
  };
  return { phugoid: rs[0], short: rs[1], step };
}

/*
 * The gear, drawn: carbon legs to 2 3/4 in wheels in pants, the axles 5 in
 * ahead of the CG and 9.5 in under the thrust line on a 12 in track; the
 * carbon tailwheel's 1.2 in wheel 37 in behind the CG and 3 in under.
 */
const mainX = R(5.0), mainZ = R(-9.5), wheelR = R(1.375), tailX = R(-37.0), tailZ = R(-3.0), tailR = R(0.6);
/* Nose up positive: the tail's contact sits higher in the body than the
 * mains', so both touch with the nose up by the angle between them. */
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
const hubClearLevel = -(mainZ - wheelR) - propR;
const hubClearRest = R(19) * Math.sin(restPitch) - (mainX * Math.sin(restPitch) + (mainZ - wheelR) * Math.cos(restPitch)) - propR;

/* Straight up at full throttle: the speed where the thrust holds the
 * weight and the drag at no lift, T(V) = W + q S CD0. */
const vertical = (() => {
  let lo = 0, hi = Vp;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (T(mid, 1) > W + 0.5 * rho * mid * mid * S * CD0) lo = mid; else hi = mid;
  }
  return lo;
})();

/* The take off roll on grass: three point until the tail comes up at 6
 * m/s, then tail up at 3 deg of pitch (the zero lift line's own angle,
 * 3 deg of alpha), the throttle opened over a second. At vRot the pilot
 * asks 10 deg: the nose comes up at the pitch rate his stick, 2.5 per rad
 * of the 7 deg asked through the expo and the knee, gives on the linear
 * model at that speed, and on three times its weight in thrust the
 * aircraft goes on accelerating while it does; it lifts off where the
 * wing's lift at the angle reached carries its weight. Three point the
 * wing is at 9.8 deg of alpha, short of its 10.75 deg stall. */
function takeoff(mu, Vtail, vRot) {
  let V = 0, x = 0, t = 0, a = restPitch, rot = null;
  const dt = 0.001;
  while (t < 30) {
    const q = 0.5 * rho * V * V;
    if (V >= vRot && rot === null) {
      const stick = 2.5 * (7 / DEG);
      rot = longitudinal(vRot).step(eff((expoE70 * stick * stick * stick + (1 - expoE70) * stick) * throwE)).peakDegS / DEG;
    }
    if (rot !== null) a = Math.min(10 / DEG, a + rot * dt);
    else a = V < Vtail ? restPitch : 3 / DEG;
    const CLg = CLa * a;
    if (rot !== null && q * S * CLg >= W) return { x, t, V, rotDegS: rot * DEG };
    const CDg = CD0 + k * CLg * CLg;
    const d = Math.min(1, Math.max(0.02, t));
    const acc = (T(V, d) - q * S * CDg - mu * Math.max(0, W - q * S * CLg)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return null;
}

/* The short period's step: the time to the pitch rate's first peak, pi
 * over the damped frequency, at the trim. */
const lat = lateral(Vtrim);
const lon = longitudinal(Vtrim);
const rows = [
  ['b, S, c = S/b, AR, m, W/S N/m^2', `${f(b, 4)} ${f(S, 5)} ${f(c, 4)} ${f(AR, 3)} ${f(m, 4)} ${f(W / S, 2)}`],
  ['MAC in, its LE behind the root LE in, y_mac in', `${f(mac, 3)} ${f(macLE, 3)} ${f(yMac, 3)}`],
  ['stations: wing ac, CG, NP, tail ac, fin (in)', `${f(xAcWing, 2)} ${f(xCG, 2)} ${f(xNP, 2)} ${f(xAcTailSt, 2)} ${f(xAcFinSt, 2)}`],
  ['S_h m^2, AR_t, l_h m, l_v m, S_v m^2', `${f(Sh, 4)} ${f(ARt, 2)} ${f(lh, 4)} ${f(lv, 4)} ${f(Sv, 4)}`],
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα DATCOM, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, static margin', `${f(CLa)} ${f(SM, 4)}`],
  ['Cmα, Cm0, Cmq', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)}`],
  ['Cmδe, CLδe (linear, per rad)', `${f(CmdeLin, 4)} ${f(CLdeLin, 4)}`],
  ['CYβ, Cnβ (fuselage), Cnr', `${f(CYb)} ${f(Cnb, 4)} (${f(CnbFus, 4)}) ${f(Cnr, 4)}`],
  ['Clβ, Clp, Clδa', `${f(Clb, 4)} ${f(Clp, 4)} ${f(ClDaLin, 4)}`],
  ['Cnδr, CYδr, Clδr', `${f(CndrLin, 4)} ${f(CYdrLin, 4)} ${f(CldrLin, 4)}`],
  ['k, rpm no load, V_p, current A', `${f(k, 5)} ${f(rpmNL, 0)} ${f(Vp, 3)} ${f(currentFull, 1)}`],
  ['static thrust N, thrust to weight', `${f(Ts, 3)} ${f(Ts / W, 2)}`],
  ['disc power W, torque N m, arm m', `${f(discP, 1)} ${f(discP / omegaLoaded, 4)} ${f(discP / omegaLoaded / Ts, 5)}`],
  ['the knee: effective throw of 39, 47.5 deg (deg)', `${f(eff(throwA) * DEG, 2)} ${f(eff(throwE) * DEG, 2)}`],
  ['E1 level at 50, 75 percent (the trim), 100', `${f(level(0.5), 2)} ${f(level(0.75), 2)} ${f(level(1), 2)}`],
  ['E2 stall m/s', f(Vs, 3)],
  ['E3 glide at 1.4 Vs, best, at', `${f(ld(1.4 * Vs), 2)} ${f(LDmax, 2)} ${f(Vmd, 2)}`],
  ['E5 full aileron pb/2V; deg/s at 20, 25 m/s, at top', `${f(ClDaLin * eff(throwA) / -Clp, 4)} ${f(rollAt(20, throwA) * DEG, 0)} ${f(rollAt(25, throwA) * DEG, 0)} ${f(rollAt(level(1), throwA) * DEG, 0)}`],
  ['   low rate 17.5 deg: pb/2V, deg/s at 25', `${f(ClDaLin * eff(17.5 / DEG) / -Clp, 4)} ${f(rollAt(25, 17.5 / DEG) * DEG, 0)}`],
  ['best climb at a held airspeed, m/s at m/s', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['lateral at the trim: V, CL, spiral root', `${f(lat.V, 2)} ${f(lat.CL)} ${f(lat.spiral, 4)}`],
  ['   roll tau s, Dutch roll wn zeta', `${f(lat.rollTau, 4)} ${lat.dutch ? `${f(lat.dutch.wn, 2)} ${f(lat.dutch.zeta)}` : 'none'}`],
  ['   phugoid s zeta, short period s zeta', `${f(lon.phugoid && lon.phugoid.period, 2)} ${f(lon.phugoid && lon.phugoid.zeta)}; ${f(lon.short && lon.short.period, 3)} ${f(lon.short && lon.short.zeta)}`],
  ['alpha at full up, linear moment, eff throw (deg); stall', `${f((Cm0 + CmdeLin * eff(throwE)) / -Cma * DEG, 1)} ${f(CLmax / CLa * DEG, 2)}`],
  ['alpha at full down (deg), the same on its back', f((Cm0 - CmdeLin * eff(throwE)) / -Cma * DEG, 1)],
  ['   the load factor full up asks at 25 m/s', f(((Cm0 + CmdeLin * eff(throwE)) / -Cma) * CLa * 0.5 * rho * 625 * S / W, 1)],
  ['   low rate 9 deg: alpha at full up (deg)', f((Cm0 + CmdeLin * eff(9 / DEG)) / -Cma * DEG, 2)],
  ['rest: pitch deg, CG height m, tail share', `${f(restPitch * DEG, 2)} ${f(cgHeight, 4)} ${f(tailShare, 4)}`],
  ['   k main, c main, k tail, c tail', `${f(kMain, 0)} ${f(cMain, 2)} ${f(kTail, 0)} ${f(cTail, 2)}`],
  ['   prop tip clearance level, at rest m', `${f(hubClearLevel, 4)} ${f(hubClearRest, 4)}`],
  ['arms for the stall model: ac, cp, dw', `${f((xCG - xAcWing) * 0.0254 / c, 4)} ${f((wingLE + macLE + 0.40 * mac - xCG) * 0.0254 / c, 4)} ${f(eta * VH * at * deda / aw, 4)}`],
  ['E7 straight up at full throttle, m/s', f(vertical, 2)],
  ['E13 take off on grass, rotated at 1.2 Vs: liftoff m, s, m/s', JSON.stringify(takeoff(0.08, 6, 1.2 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['E15 taxi radius, wheelbase over tan of the tailwheel at half the rudder, m', f((mainX - tailX) / Math.tan(throwR / 2), 3)],
  ['E6 half stick up at the trim: time to the pitch rate\'s peak s, peak deg/s', (() => { const r = lon.step(eff((expoE70 * 0.125 + (1 - expoE70) * 0.5) * throwE)); return `${f(r.at, 3)} ${f(r.peakDegS, 0)}`; })()],
  ['taper, strip chords over the mean', [0.125, 0.375, 0.625, 0.875].map((e2) => f((1 - (1 - lambda) * e2) / ((1 + lambda) / 2), 4)).join(' ')],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(54)} ${v}`);
}
