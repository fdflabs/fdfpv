/*
 * kadet-derive.js: the arithmetic behind docs/KADET-STAGE1.md, from SIG's
 * published figures for the Kadet Senior (kit RC58), O.S.'s for the FS-52
 * Surpass, owners' measured rpm on its prop, and the drawn model, to every
 * coefficient and every derived band. It never loads the plant: this is
 * what the plant is checked against, so it has to stand apart from it.
 * Harness arithmetic in JS maths, which is allowed here because nothing it
 * prints is hashed. It follows scripts/bombshell-derive.js line for line
 * where the two aircraft are alike: both are three channel aircraft whose
 * rudder the roll stick drives, on a glow engine with a throttle to idle.
 * Run with npm run kadet:derive.
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
 * The aircraft. Span, area, weight, the balance point, the incidences, the
 * throws and the wood are SIG's; the tail and the stations are the drawn
 * model's (src/render/kadetcraft.js), ESTIMATED off SIG's box art side view
 * scaled by the published 62 in length. Stations are metres aft of the
 * prop's plane; R() turns inches into them.
 */
const R = (inches) => inches * 0.0254;
const b = R(78), S = R(1) * R(1) * 1150, m = 6 * 0.45359237, W = m * g, c = S / b, AR = b * b / S;
const chordDrawn = c;
const CLmax = 1.15, CD0 = 0.042, e = 0.75, k = 1 / (Math.PI * e * AR);
/* Flat bottomed, about 13 percent: its zero lift angle about -4 deg, as a
 * Clark-Y's; SIG's "+1-1/2 degree wing, 0 degree stabilizer". */
const alphaZLwing = -4 / DEG, incidence = 1.5 / DEG;
const wingLE = R(13.5), cgAft = R(3.875);           /* SIG: 3 7/8 in, at the main spar */
const xAcWingDrawn = wingLE + 0.25 * chordDrawn;
/* The stabiliser: 31 in across (its elevator's 30 in trailing edge, the
 * kit's 3/16 x 3/4 x 30 stick, and the frame's ends), 8 in of chord with
 * its outer leading corners rounded on 2 in, the elevator the aft 3 in less
 * a 1.8 in cut out for the rudder. The fin and rudder off the drawn side
 * view: 57.8 sq in of fin over the stabiliser, 51.5 of rudder, the whole
 * one's centroid 3 in over the CG. */
const Sh = R(1) * R(1) * (31 * 8 - 2 * 2 * 2 * (1 - Math.PI / 4)), bh = R(31), xAcTailSt = R(53 + 0.25 * 8);
const Sv = R(1) * R(1) * (57.8 + 51.5), xAcFinSt = R(55.5), zv = R(3.0);
const eta = 0.9, tauE = 0.55, tauR = 0.64;
/* The fin's own aspect ratio, 10.8 in over the stabiliser on 109 sq in,
 * raised half again by the stabiliser across it. */
const arV = 1.5 * (10.8 * 10.8 / 109.3);
/* Straight dihedral: one tip 6 in over the other panel laid flat (the
 * manual's step 18), 3 in a side over 39 in. */
const gamma = Math.atan(3 / 39), taper = 1.0;
const cosFactor = Math.cos(gamma) ** 2;
/* SIG's "Engine Offset 6 degree down": the hub 17.4 in ahead of the CG
 * and 0.5 in under it, the thrust line tipped 6 deg down, pitches as a
 * level line 1.32 in over the CG does. Its tenth of the thrust pointing
 * down is not modelled. */
const thrustZ = R(17.375 * Math.sin(6 / DEG) - 0.5 * Math.cos(6 / DEG));
/* The O.S. FS-52 Surpass on a 12 x 6, which an owner measured at 9,500
 * rpm standing (RC Universe, "OS FS-52 Prop Size"); O.S. list the 12 x 6
 * for it and give 2,300 to 13,000 rpm and 0.9 bhp at 12,000. */
const rpmLoaded = 9500, pitchIn = 6, propR = R(6);
const CT = 0.105, CP = 0.045;                       /* a wooden 12 x 6 at rest, ESTIMATED */
const nRev = rpmLoaded / 60;
const Ts = CT * rho * nRev * nRev * (2 * propR) ** 4;
const shaftP = CP * rho * nRev ** 3 * (2 * propR) ** 5;
/* The carburettor's stop: O.S.'s lowest practical 2,300 of the 9,500. */
const idle = 2300 / 9500;
const Ixx = 0.22, Iyy = 0.29, Izz = 0.48;
/* SIG's throws at the trailing edge: 3/4 in on the 3 in elevator, 7/8 in
 * on the 3.5 in rudder. */
const throwE = Math.asin(0.75 / 3), throwR = Math.asin(0.875 / 3.5), expo = 0.30;
const muGrass = 0.08;

const mac = chordDrawn, macLE = 0;
const xAcWing = xAcWingDrawn;
const xCG = wingLE + cgAft;
const xAcTail = xAcTailSt;
const lh = xAcTail - xAcWing;
const lv = xAcFinSt - xCG;

/* The coefficients, in the plant's reference chord S/b. */
const aw = cosFactor * 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
/* Downwash: DATCOM's gradient, as for the Slow Stick. */
const KA = 1 / AR - 1 / (1 + Math.pow(AR, 1.7));
const KL = (10 - 3 * taper) / 7;
const hH = R(4.6);                                  /* the stab under the wing's chord plane */
const KH = (1 - hH / b) / Math.cbrt(2 * lh / b);
const deda = 4.44 * Math.pow(KA * KL * KH, 1.19);
const dedaNelson = 2 * aw / (Math.PI * AR);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const xNP = xAcWing + c * VH * eta * (at / aw) * (1 - deda);
const hn = (xNP - xAcWing) / c;
const SM = (xNP - xCG) / c;
const Cma = -CLa * SM;
const a0w = alphaZLwing - incidence;
const tailK = at * (Sh / S) * eta;
const alphaZL = (aw * a0w + tailK * (-deda * a0w)) / (aw + tailK * (1 - deda));
const Cmq = -2 * eta * at * VH * lh / c;
const Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
/* The box fuselage's weathercock contribution, Nelson eq. 2.64 with K_N
 * 0.0012 per degree off DATCOM's chart for a body this slender and K_Rl
 * 1.0, is destabilising: -K_N K_Rl (S_Bs/S)(l_f/b), per radian. The side
 * area is the drawn fuselage's, 0.24 m^2 over its 57.3 in. */
const SBs = 0.24, lf = R(57.3);
const CnbFus = -0.0012 * DEG * 1.0 * (SBs / S) * (lf / b);
const CYb = -av * Sv / S;
const Cnb = av * VV + CnbFus;
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/* A high wing on a deep fuselage rolls away from a sideslip by itself:
 * DATCOM's wing height term, -1.2 sqrt(AR) (z_w/b)(2d/b) per radian, the
 * wing's mid thickness 5.45 in over the fuselage's centre line at the
 * cabin and d its mean depth, the square root of 3.75 by 9 in. */
const zw = R(5.45), dFus = R(Math.sqrt(3.75 * 9));
const ClbHigh = -1.2 * Math.sqrt(AR) * (zw / b) * (2 * dFus / b);
const Clb = -aw * gamma * (1 + 2 * taper) / (6 * (1 + taper)) - av * (Sv / S) * (zv / b) + ClbHigh;
const Clp = -aw * (1 + 3 * taper) / (12 * (1 + taper));
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
const ClrPerCL = 0.25, CnpPerCL = -0.125;

/* The engine. The plant reads a no load rpm that it loads by 0.85, as for
 * the other aircraft, so the loaded rpm is the measured 9,500 and the pitch
 * speed the loaded one. The throttle stick runs the rpm from the
 * carburettor's idle to full, linearly: duty = idle + (1 - idle) stick. */
const rpmNL = rpmLoaded / 0.85;
const Vp = rpmNL / 60 * pitchIn * 0.0254 * 0.85;
const omegaLoaded = rpmLoaded * 2 * Math.PI / 60;
const dutyOf = (stick) => idle + (1 - idle) * stick;
const T = (V, stick) => { const d = dutyOf(stick); return Math.max(0, Ts * d * d * (1 - V / (Vp * d))); };
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 3, hi = 30;
  if (T(lo, d) < D(lo) && T(6, d) < D(6)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
/* The best climb, over the speeds the plant flies unstalled: its lift
 * curve rounds off short of CL max (the plant's CL max row below), so the
 * sweep starts a little over that rather than at the formula's stall. */
const VclimbMin = 9.0;
let best = { vz: -1, V: 0 };
for (let V = VclimbMin; V < 20; V += 0.02) { const vz = (T(V, 1) - D(V)) * V / W; if (vz > best.vz) best = { vz, V }; }
const discP = Math.pow(Ts, 1.5) / Math.sqrt(2 * rho * Math.PI * propR * propR);

/* The stick for a surface angle through the expo. */
function stickFor(delta, travel) {
  const want = delta / travel;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (expo * mid * mid * mid + (1 - expo) * mid < want) lo = mid; else hi = mid; }
  return lo;
}
const surf = (x, travel) => (expo * x * x * x + (1 - expo) * x) * travel;

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
  let ck = 0;
  for (let kk = 1; kk <= n; kk += 1) {
    const AM = mul(A, M);
    ck = -AM.reduce((s, row, i) => s + row[i], 0) / kk;
    coef.push(ck);
    M = AM.map((row, i) => row.map((v, j) => v + (i === j ? ck : 0)));
  }
  return coef;
}

/* The longitudinal model, the plant's equations, trimmed and linearised. */
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
    for (let r = i + 1; r < 3; r += 1) { const f = M[r][i] / M[i][i]; for (let j = i; j < 4; j += 1) M[r][j] -= f * M[i][j]; }
  }
  const out = [0, 0, 0];
  for (let i = 2; i >= 0; i -= 1) { let s = M[i][3]; for (let j = i + 1; j < 3; j += 1) s -= M[i][j] * out[j]; out[i] = s / M[i][i]; }
  return out;
}
function longitudinalModes(V) {
  const res = (p) => { const r = deriv([V * Math.cos(p[0]), -V * Math.sin(p[0]), 0, p[0]], p[1], p[2]); return [r[0], r[1], r[2]]; };
  let p = [0.02, 0, 0.5];
  for (let it = 0; it < 60; it += 1) {
    const r = res(p);
    const J = [0, 1, 2].map((j) => { const pp = p.slice(); pp[j] += 1e-7; const rr = res(pp); return rr.map((v, i) => (v - r[i]) / 1e-7); });
    const dx = solve3([0, 1, 2].map((i) => [0, 1, 2].map((j) => J[j][i])), r.map((v) => -v));
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

/*
 * The lateral model at a speed, Nelson ch. 5, states beta, p, r, phi in
 * the aero convention: the spiral, the roll subsidence and the Dutch roll.
 */
function lateral(V) {
  const q = 0.5 * rho * V * V, CL = W / (q * S);
  const bv = b / (2 * V);
  const Yb = q * S * CYb / m, Ydr = q * S * CYdr / m;
  const Lb = q * S * b * Clb / Ixx, Lp = q * S * b * Clp * bv / Ixx, Lr = q * S * b * ClrPerCL * CL * bv / Ixx, Ldr = q * S * b * Cldr / Ixx;
  const Nb = q * S * b * Cnb / Izz, Np = q * S * b * CnpPerCL * CL * bv / Izz, Nr = q * S * b * Cnr * bv / Izz, Ndr = q * S * b * Cndr / Izz;
  const A = [
    [Yb / V, 0, -1, g / V],
    [Lb, Lp, Lr, 0],
    [Nb, Np, Nr, 0],
    [0, 1, 0, 0],
  ];
  const rs = roots(charPoly(A));
  const real = rs.filter((r) => Math.abs(r.im) < 1e-6).map((r) => r.re).sort((x, y) => x - y);
  const dr = rs.find((r) => r.im > 1e-6);
  const spiral = real[real.length - 1];
  return {
    V, CL,
    spiral: { root: spiral, t2: spiral > 0 ? Math.log(2) / spiral : null, tHalf: spiral < 0 ? Math.log(2) / -spiral : null },
    roll: { root: real[0], tau: -1 / real[0] },
    dutch: dr ? { wn: Math.hypot(dr.re, dr.im), zeta: -dr.re / Math.hypot(dr.re, dr.im), period: 2 * Math.PI / dr.im } : null,
    spiralMargin: Clb * Cnr - Cnb * ClrPerCL * CL,
    A,
    B: [Ydr / V, Ldr, Ndr, 0],
  };
}

/* Integrate the linear lateral model from a bank with the rudder centred:
 * the bank at a time, for the hands off levelling. */
function bankAfter(lat, phi0, tEnd) {
  let x = [0, 0, 0, phi0];
  const dt = 0.001;
  for (let t = 0; t < tEnd; t += dt) {
    const dx = lat.A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
    x = x.map((v, i) => v + dx[i] * dt);
  }
  return x[3];
}

/* The linear lateral model from level with the rudder held at dr (aero
 * sign, positive trailing edge left): the bank and the peak yaw rate. */
function rudderStep(lat, dr, tEnd) {
  let x = [0, 0, 0, 0];
  const dt = 0.001;
  let peakR = 0;
  for (let t = 0; t < tEnd; t += dt) {
    const dx = lat.A.map((row, i) => row.reduce((s, v, j) => s + v * x[j], 0) + lat.B[i] * dr);
    x = x.map((v, i) => v + dx[i] * dt);
    peakR = Math.max(peakR, Math.abs(x[2]));
  }
  return { bankDeg: x[3] * DEG, peakRDegS: peakR * DEG, betaDeg: x[0] * DEG };
}

/*
 * The gear as drawn (src/render/kadetcraft.js KADET_DIMS), at rest: a
 * tricycle standing level, the mains 3.625 in behind the CG and the nose
 * wheel 11.875 in ahead of it, so the nose carries the mains' moment arm's
 * share. Each leg's stiffness gives 8 mm of static deflection, a torsion
 * bar and a coil of 5/32 in wire, and its damping is 0.6 of critical, the
 * Cub's rule.
 */
const rest = { pitchDeg: 0, cgHeight: 0.3072, mainAft: R(3.625), noseAhead: R(11.875) };
const noseShare = rest.mainAft / (rest.mainAft + rest.noseAhead);
const loadNose = W * noseShare, loadMain = W * (1 - noseShare) / 2;
const kMain = loadMain / 0.008, kNose = loadNose / 0.008;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mNose = (Iyy + m * rest.mainAft * rest.mainAft) / Math.pow(rest.mainAft + rest.noseAhead, 2);
const cNose = 2 * 0.6 * Math.sqrt(kNose * mNose);
/* Standing with the engine idling, the wheels' friction holding its
 * thrust back at the ground, 0.307 m under the CG, and the thrust line's
 * own moment, both lean the aircraft onto its nose wheel: the loads by
 * moments about the mains, and the pitch the two struts' deflections
 * make over the wheelbase, nose down negative. */
const restIdle = (() => {
  const Ti = T(0, 0);
  const wb = rest.mainAft + rest.noseAhead;
  const nose = (W * rest.mainAft + Ti * (rest.cgHeight + thrustZ)) / wb;
  const main = (W - nose) / 2;
  const pitch = -((nose / kNose - 0.008) - (main / kMain - 0.008)) / wb;
  return { share: nose / W, pitchDeg: pitch * DEG };
})();

/* The take off roll from rest with the sticks centred, level on all three
 * wheels: the plant's lift and drag at the rest attitude, full throttle,
 * rolling resistance on the load the wing has not taken, to the speed a
 * pilot rotates at, 1.2 times the stall; and the speed at which it would
 * lift off level with no elevator at all. */
const stallBlend = 4 / DEG;
function coeffs(alpha) {
  const aStall = CLmax / CLa;
  const x = Math.abs(alpha);
  const t = Math.min(1, Math.max(0, (x - (aStall - stallBlend)) / (2 * stallBlend)));
  const sigma = t * t * (3 - 2 * t);
  const clLin = CLa * alpha;
  return {
    CL: (1 - sigma) * clLin + sigma * 2 * Math.sin(alpha) * Math.cos(alpha),
    CD: (1 - sigma) * (CD0 + k * clLin * clLin) + sigma * (CD0 + 2 * Math.sin(alpha) ** 2),
  };
}
function takeoff(mu, vRot) {
  const { CL, CD } = coeffs(-alphaZL);
  const vLevel = Math.sqrt(2 * W / (rho * S * CL));
  let V = 0, x = 0, t = 0;
  const dt = 0.001;
  while (V < vRot && t < 30) {
    const q = 0.5 * rho * V * V;
    const a = (T(V, 1) - q * S * CD - mu * Math.max(0, W - q * S * CL)) / m;
    V += a * dt; x += V * dt; t += dt;
  }
  return { CL, CD, vLevel, vRot, x, t, V };
}

/*
 * Past the stall, the plant's model since crash round 4 (docs/STALL-
 * STAGE1.md, src/native/plant_wing.c), at a chord Reynolds number over 5e4
 * where all of it is taken. Short of the stall angle the lift and the
 * moment are the plant's earlier ones: the blend to the flat plate, and the
 * linear moment taken back through the blend at the CG's arm behind the
 * wing's aerodynamic centre and the plate's centre of pressure, 0.40 of the
 * mean chord (Hoerner, Fluid Dynamic Lift, ch. 3), behind the CG. Past it,
 * brought in over a blend: the wing holds the peak lift the plant's own
 * curve reaches (the UIUC sections hold theirs flat), for stall_top, then
 * falls to stall_k of it over two blends and decays to the plate as
 * Viterna and Corrigan's A2 cos^2 a / sin a; its normal force acts at the
 * aerodynamic centre while it holds its lift and at the centre of pressure
 * as it falls; and the tail lifts as the downwash goes with the wing's
 * lift, stall_dw per unit of lift lost. The section's numbers are
 * scripts/stall-derive.js's for this aircraft: the Clark-Y class at 2e5,
 * held 6.7 deg and falling to 0.72. Then full up elevator: the angle where
 * the moment is zero, and the steady descent there, which is the mush.
 */
const armAc = (xCG - xAcWing) / c;
const armCp = (wingLE + macLE + 0.40 * mac - xCG) / c;
const stallTop = 6.7 / DEG, stallK = 0.72;
const stallDw = eta * VH * at * deda / aw;
const smooth = (a0, a1, x) => {
  const t = Math.min(1, Math.max(0, (x - a0) / (a1 - a0)));
  return t * t * (3 - 2 * t);
};
function stalledAt(alpha, de) {
  const aStall = CLmax / CLa;
  const x = Math.abs(alpha);
  const sigma = smooth(aStall - stallBlend, aStall + stallBlend, x);
  const clLin = CLa * alpha + CLde * de;
  const plate = 2 * Math.sin(alpha) * Math.cos(alpha);
  const clOld = (1 - sigma) * clLin + sigma * plate;
  const cmLow = -sigma * (armAc * clLin + armCp * plate);
  const past = smooth(aStall, aStall + stallBlend, x);
  if (!(sigma > 0)) return { CL: clOld, cmStall: cmLow };
  let hold = 0;
  for (let i = 0; i <= 16; i += 1) {
    const ai = aStall - stallBlend + stallBlend * 0.125 * i;
    const si = smooth(aStall - stallBlend, aStall + stallBlend, ai);
    hold = Math.max(hold, (1 - si) * (CLa * ai + CLde * de) + si * 2 * Math.sin(ai) * Math.cos(ai));
  }
  const a0 = aStall + stallTop, a1 = a0 + 2 * stallBlend;
  const fall = smooth(a0, a1, x);
  let viterna = 0;
  if (Math.cos(alpha) > 0 && Math.abs(Math.sin(alpha)) > 0.05) {
    const a2 = (stallK * hold - 2 * Math.sin(a1) * Math.cos(a1)) * Math.sin(a1) / Math.cos(a1) ** 2;
    viterna = a2 * Math.cos(alpha) ** 2 / Math.sin(alpha);
  }
  const sgn = alpha < 0 ? -1 : 1;
  const clSt = (1 - fall) * sgn * hold + fall * (plate + viterna);
  const cnSt = 2 * Math.sin(alpha) + (clSt - plate) * Math.cos(alpha);
  const cmPost = sigma * (((1 - fall) * armAc - fall * armCp) * cnSt - armAc * clLin - stallDw * (clLin - clSt));
  return { CL: clOld + past * (clSt - clOld), cmStall: cmLow + past * (cmPost - cmLow) };
}
function cmAt(alpha, de) {
  return Cm0 + Cma * alpha + Cmde * de + stalledAt(alpha, de).cmStall;
}
function mush(de) {
  let lo = 0.05, hi = 1.2;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (cmAt(mid, de) > 0) lo = mid; else hi = mid; }
  const alpha = lo;
  const CL = stalledAt(alpha, de).CL;
  const { CD } = coeffs(alpha);
  const V = Math.sqrt(2 * W / (rho * S * Math.hypot(CL, CD)));
  const gamma = Math.atan2(CD, CL);
  return { alphaDeg: alpha * DEG, CL, CD, V, sink: V * Math.sin(gamma), pathDeg: gamma * DEG, pitchDeg: (alpha + alphaZL - gamma) * DEG };
}

/*
 * A level turn at a bank and throttle, on the plant's own lift curve, the
 * stall blend and all: the fastest speed where the thrust meets the drag at
 * the load factor the bank asks, the elevator that trims it there with the
 * turn's own pitch rate, g sin(bank) tan(bank) / V, against the pitch
 * damping, and the tail's share of the lift that elevator costs. Null where
 * no speed balances.
 */
function plantCoeffs(alpha, de) {
  const aStall = CLmax / CLa;
  const x = Math.abs(alpha);
  const t = Math.min(1, Math.max(0, (x - (aStall - stallBlend)) / (2 * stallBlend)));
  const sigma = t * t * (3 - 2 * t);
  const clLin = CLa * alpha + CLde * de;
  const clFlat = 2 * Math.sin(alpha) * Math.cos(alpha);
  return {
    CL: (1 - sigma) * clLin + sigma * clFlat,
    CD: (1 - sigma) * (CD0 + k * clLin * clLin) + sigma * (CD0 + 2 * Math.sin(alpha) ** 2),
    sigma, clLin, clFlat,
  };
}
function levelTurn(bank, d) {
  const n = 1 / Math.cos(bank);
  const qRateOf = (V) => g * Math.sin(bank) * Math.tan(bank) / V;
  /* The elevator that trims alpha at V, the stall arms included. */
  const trimDe = (alpha, V) => {
    const fixed = (de) => {
      const pc = plantCoeffs(alpha, de);
      return Cm0 + Cma * alpha + Cmq * qRateOf(V) * c / (2 * V) + Cmde * de - pc.sigma * (armAc * pc.clLin + armCp * pc.clFlat);
    };
    let lo = -throwE, hi = throwE;
    if (fixed(hi) < 0) return null;
    for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (fixed(mid) > 0) hi = mid; else lo = mid; }
    return lo;
  };
  for (let V = 30; V > 2; V -= 0.002) {
    const q = 0.5 * rho * V * V;
    const need = n * W / (q * S);
    /* Walk alpha up the unstalled branch to the lift the turn needs. */
    let found = null;
    for (let alpha = 0; alpha < CLmax / CLa + stallBlend; alpha += 0.0005) {
      const de = trimDe(alpha, V);
      if (de === null) break;
      const pc = plantCoeffs(alpha, de);
      if (pc.CL >= need) { found = { alpha, de, pc }; break; }
    }
    if (!found) continue;
    if (T(V, d) >= q * S * found.pc.CD) {
      return { V, CL: found.pc.CL, alphaDeg: found.alpha * DEG, deDeg: found.de * DEG, radius: V * V / (g * Math.tan(bank)) };
    }
  }
  return null;
}
/* The plant's own greatest lift on the unstalled branch, which the stall
 * blend rounds off short of CLmax, and the stall speed it gives. */
const plantCLmax = (() => {
  let best = 0;
  for (let alpha = 0; alpha < CLmax / CLa + stallBlend; alpha += 0.0005) best = Math.max(best, plantCoeffs(alpha, 0).CL);
  return best;
})();

/* SIG's trim: "with the model flying at about 3/4 throttle, feed in down
 * trim until the model flies level", the elevator then set neutral there.
 * So the neutral elevator balances the level cruise at 75 percent, the
 * downthrust's moment on the cruise thrust included. */
const Vtrim = level(0.75), CLtrim = 2 * W / (rho * Vtrim * Vtrim * S);
const Cm0 = -Cma * CLtrim / CLa + thrustZ * D(Vtrim) / (0.5 * rho * Vtrim * Vtrim * S * c);

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const Vcruise = level(0.75);
const lat = lateral(Vcruise);
const latS = lateral(1.2 * Vs);
const rows = [
  ['c = S/b, drawn chord, AR, m, W/S N/m^2', `${f(c, 4)} ${f(chordDrawn, 4)} ${f(AR, 2)} ${f(m, 4)} ${f(W / S, 2)}`],
  ['dihedral deg, cos^2 lift factor, thrust line z m', `${f(gamma * DEG, 2)} ${f(cosFactor, 4)} ${f(thrustZ, 4)}`],
  ['engine: static thrust N, shaft W, idle static N', `${f(Ts, 3)} ${f(shaftP, 1)} ${f(T(0, 0), 3)}`],
  ['fin: a_v, Cnβ fin, Cnβ fuselage', `${f(av)} ${f(av * VV, 4)} ${f(CnbFus, 4)}`],
  ['x ac wing, CG, ac tail, NP (stations m)', `${f(xAcWing, 4)} ${f(xCG, 4)} ${f(xAcTail, 4)} ${f(xNP, 4)}`],
  ['l_h, l_v, S_h, AR_t', `${f(lh, 4)} ${f(lv, 4)} ${f(Sh, 4)} ${f(ARt, 2)}`],
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα DATCOM (Nelson), V_H, V_V', `${f(deda)} (${f(dedaNelson)}) ${f(VH)} ${f(VV, 4)}`],
  ['CLα, h_n from ac, static margin', `${f(CLa)} ${f(hn)} ${f(SM)}`],
  ['zero lift line deg', f(alphaZL * DEG, 2)],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde)} ${f(CLde)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ (the high wing\'s), Clp', `${f(Clb, 4)} (${f(ClbHigh, 4)}) ${f(Clp)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['k, rpm no load, V_p', `${f(k, 4)} ${f(rpmNL, 0)} ${f(Vp, 2)}`],
  ['disc W, torque N m, arm m; shaft W, torque', `${f(discP, 1)} ${f(discP / omegaLoaded, 4)} ${f(discP / omegaLoaded / Ts, 4)}; ${f(shaftP, 1)} ${f(shaftP / omegaLoaded, 4)}`],
  ['level at 100, 75, 65 percent (none: below the power for level)', `${f(level(1), 2)} ${f(Vcruise, 2)} ${f(level(0.65), 2)}`],
  ['stall m/s', f(Vs, 2)],
  ['glide at 10.0, best, at', `${f(ld(10.0), 2)} ${f(LDmax, 2)} ${f(Vmd, 2)}; sink at 10.0 ${f(10.0 / ld(10.0), 3)}`],
  ['idle: static thrust N, rolling resistance N, pitch speed m/s', `${f(T(0, 0), 3)} ${f(muGrass * W, 3)} ${f(Vp * idle, 2)}`],
  ['best climb m/s at m/s', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['lateral at 75 percent: V, CL', `${f(lat.V, 2)} ${f(lat.CL)}`],
  ['   spiral root, margin ClbCnr-CnbClr', `${f(lat.spiral.root, 4)} ${f(lat.spiralMargin, 5)} t_half ${f(lat.spiral.tHalf, 1)} t2 ${f(lat.spiral.t2, 1)}`],
  ['   roll tau s, Dutch roll wn zeta period', `${f(lat.roll.tau)} ${lat.dutch ? `${f(lat.dutch.wn, 2)} ${f(lat.dutch.zeta)} ${f(lat.dutch.period, 2)}` : 'none'}`],
  ['   30 deg bank, hands off: bank after 2, 4, 6 s', `${f(bankAfter(lat, 30 / DEG, 2) * DEG, 1)} ${f(bankAfter(lat, 30 / DEG, 4) * DEG, 1)} ${f(bankAfter(lat, 30 / DEG, 6) * DEG, 1)}`],
  ['lateral at 1.2 Vs: spiral root, t_half', `${f(latS.spiral.root, 4)} ${f(latS.spiral.tHalf, 1)}`],
  ['full right rudder from cruise, after 1 s', JSON.stringify(rudderStep(lat, -throwR, 1), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['   after 2 s', JSON.stringify(rudderStep(lat, -throwR, 2), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['half stick right rudder, after 2 s', JSON.stringify(rudderStep(lat, -surf(0.5, throwR), 2), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['turn radius at 30, 45 deg bank at cruise m', `${f(lat.V * lat.V / (g * Math.tan(30 / DEG)), 2)} ${f(lat.V * lat.V / (g * Math.tan(45 / DEG)), 2)}`],
  ['rest: nose share, loads main nose N', `${f(noseShare, 4)} ${f(loadMain)} ${f(loadNose)}`],
  ['   k main, c main, k nose, m nose, c nose', `${f(kMain, 0)} ${f(cMain, 2)} ${f(kNose, 0)} ${f(mNose, 4)} ${f(cNose, 2)}`],
  ['take off roll to 1.1 Vs, grass', JSON.stringify(takeoff(muGrass, 1.1 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))],
  ['take off roll to 1.5 Vs, grass', JSON.stringify(takeoff(muGrass, 1.5 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))],
  ['at rest idling: idle thrust held by the wheels, nose share, pitch deg', `${f(T(0, 0), 3)} ${f(restIdle.share, 4)} ${f(restIdle.pitchDeg, 3)}`],
  ['zero lift line to 0.01 deg, its sin, cos', `${f(alphaZL * DEG, 2)} ${Math.sin(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)} ${Math.cos(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)}`],
];
const lm = longitudinalModes(Vcruise);
rows.push(['trim at the 75 percent speed', `theta ${f(lm.thetaDeg, 2)} de ${f(lm.deDeg, 2)} stick ${f(lm.duty)}`]);
rows.push(['   phugoid s, zeta; short period s, zeta', `${f(lm.phugoid && lm.phugoid.period, 2)} ${f(lm.phugoid && lm.phugoid.zeta)}; ${f(lm.short && lm.short.period, 2)} ${f(lm.short && lm.short.zeta)}`]);
const lmT = longitudinalModes(Vtrim);
rows.push([`trim at ${f(Vtrim, 2)} m/s`, `theta ${f(lmT.thetaDeg, 2)} de ${f(lmT.deDeg, 2)} throttle stick ${f(lmT.duty)}, pitch stick ${f(stickFor(lmT.deDeg / DEG, throwE))}`]);
/* The hand launch's elevator: the manual's pilot trims the first flights
 * so the model climbs away from the throw, and the elevator that holds its
 * attitude at the throw's 9 m/s is the one that trims level flight there. */
const lm9 = longitudinalModes(9.0);
rows.push(['trim at 9.0 m/s, the hand launch', `theta ${f(lm9.thetaDeg, 2)} de ${f(lm9.deDeg, 2)} throttle stick ${f(lm9.duty)}, pitch stick ${f(stickFor(lm9.deDeg / DEG, throwE))}`]);
/* Full up elevator: where the linear pitching moment trims, as an angle of
 * the zero lift line, against the stall's. */
rows.push(['alpha trim at full up, linear moment; alpha stall (deg)', `${f((Cm0 + Cmde * throwE) / -Cma * DEG, 1)} ${f(CLmax / CLa * DEG, 1)}`]);
rows.push(['plant CL max on the unstalled branch, its stall m/s', `${f(plantCLmax)} ${f(Math.sqrt(2 * W / (rho * S * plantCLmax)), 2)}`]);
rows.push(['stall arms ac, cp (per chord)', `${f(armAc, 4)} ${f(armCp, 4)}`]);
rows.push(['full up mush', JSON.stringify(mush(throwE), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))]);
/* The same balance with the elevator neutral is the throttle chop with the
 * sticks let go: the idle's thrust is nil over its pitch speed, so the
 * aircraft settles on the glide its pitching moment trims. */
rows.push(['hands off glide, throttle closed', JSON.stringify(mush(0), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))]);
rows.push(['level turn at 45 deg, 90 percent', JSON.stringify(levelTurn(45 / DEG, 0.9), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))]);
rows.push(['level turn at 45 deg, 100 percent', JSON.stringify(levelTurn(45 / DEG, 1.0), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))]);
rows.push(['level turn at 30 deg, 75 percent', JSON.stringify(levelTurn(30 / DEG, 0.75), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))]);
for (const [name, v] of rows) {
  console.log(`${name.padEnd(48)} ${v}`);
}
