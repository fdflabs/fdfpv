/*
 * glider-derive.js: the arithmetic behind docs/GLIDER-STAGE1.md, from the
 * Radian's published figures and the manual's drawings to every coefficient
 * and every derived band. It never loads the plant: this is what the plant
 * is checked against, so it has to stand apart from it. Harness arithmetic
 * in JS maths, which is allowed here because nothing it prints is hashed.
 * Run with npm run glider:derive.
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
const nu = 1.46e-5;

/*
 * The aircraft. Published: the span, the length, the area and the CG from
 * the EFL4750 manual; the Radian Pro's mass from its listing; the motor,
 * prop and the measured current from the manuals and Model Aviation's
 * review. Measured: the planform, off the manual's top view scaled to the
 * 2 m span, and the fuselage and fin, off its side view scaled to the
 * 1140 mm length.
 */
const b = 2.0, S = 0.355, m = 0.98, W = m * g, AR = b * b / S;
const half = [
  [0.00, 0.200], [0.60, 0.198], [0.70, 0.185], [0.80, 0.164], [0.85, 0.149],
  [0.90, 0.132], [0.95, 0.110], [0.98, 0.092], [1.00, 0.050],
];
const chordAt = (y) => {
  const a = Math.abs(y);
  for (let i = 0; i + 1 < half.length; i += 1) {
    const [y0, c0] = half[i];
    const [y1, c1] = half[i + 1];
    if (a <= y1) return c0 + (c1 - c0) * (a - y0) / (y1 - y0);
  }
  return half[half.length - 1][1];
};
/* The polyhedral: the local dihedral grows from 2 deg at the root to 14 at
 * the tip as the square of the span station, the Radian's curved "elliptical
 * dihedral". ESTIMATED from the manual's cover and photographs. */
const dihedralAt = (y) => (2 + 12 * (y / (b / 2)) ** 2) / DEG;
const N = 2000;
const integrate = (f, y0 = 0, y1 = b / 2) => {
  let s = 0;
  for (let i = 0; i < N; i += 1) {
    const y = y0 + (y1 - y0) * (i + 0.5) / N;
    s += f(y) * (y1 - y0) / N;
  }
  return s;
};
const areaDrawn = 2 * integrate(chordAt);
const MAC = 2 * integrate((y) => chordAt(y) ** 2) / areaDrawn;
/* The trailing edge is straight, so the leading edge at y sits c(0) - c(y)
 * behind the root's. */
const macLE = 2 * integrate((y) => chordAt(y) * (chordAt(0) - chordAt(y))) / areaDrawn;
let tipRise = 0;
for (let i = 0; i < N; i += 1) tipRise += Math.tan(dihedralAt((i + 0.5) / N)) / N;
const cgBehindRootLE = 0.063;
const hCG = (cgBehindRootLE - macLE) / MAC;

/* Drag build up, Raymer ch. 12, equivalent skin friction per component. */
const Vref = 8;
const Swing = 2 * S * 1.02;
const cdWingProfile = 0.0125;
const fuse = [
  /* station aft of the spinner's tip, half width, top, bottom, m, the CG
   * at height zero: the side view and the top view of the manual */
  [0.000, 0.012, 0.004, -0.019], [0.020, 0.028, 0.016, -0.026], [0.045, 0.036, 0.030, -0.032],
  [0.090, 0.041, 0.045, -0.042], [0.155, 0.042, 0.060, -0.052], [0.250, 0.042, 0.070, -0.042],
  [0.312, 0.040, 0.070, -0.038], [0.440, 0.031, 0.068, -0.030], [0.565, 0.026, 0.065, -0.022],
  [0.690, 0.022, 0.061, -0.013], [0.820, 0.018, 0.057, -0.001], [0.945, 0.019, 0.051, 0.010],
  [1.010, 0.016, 0.047, 0.019], [1.090, 0.010, 0.045, 0.030],
];
let SwetF = 0;
let volF = 0;
let sideF = 0;
for (let i = 0; i + 1 < fuse.length; i += 1) {
  const ring = (r) => {
    const a = r[1];
    const bb = (r[2] - r[3]) / 2;
    return { p: Math.PI * (3 * (a + bb) - Math.sqrt((3 * a + bb) * (a + 3 * bb))), A: Math.PI * a * bb, h: 2 * bb };
  };
  const r0 = ring(fuse[i]);
  const r1 = ring(fuse[i + 1]);
  const ds = fuse[i + 1][0] - fuse[i][0];
  SwetF += 0.5 * (r0.p + r1.p) * ds;
  volF += 0.5 * (r0.A + r1.A) * ds;
  sideF += 0.5 * (r0.h + r1.h) * ds;
}
const L = 1.14;
const ReF = Vref * L / nu;
const CfF = 0.455 / Math.log10(ReF) ** 2.58;
const fineness = L / 0.09;
const FFf = 1 + 60 / fineness ** 3 + fineness / 400;
const Sh = 0.0476, bh = 0.477, Sv = 0.038, hv = 0.218;
const ReT = Vref * 0.1 / nu;
const CfT = 1.328 / Math.sqrt(ReT);
const FFt = 1.1;
const dCDmisc = 0.002;
const cdFuse = CfF * FFf * SwetF / S;
const cdTail = CfT * FFt * 2.04 * (Sh + Sv) / S;
const CD0 = +(cdWingProfile + cdFuse + cdTail + dCDmisc).toFixed(3);
const e = 0.85, k = 1 / (Math.PI * e * AR);
const CLmax = 1.05;
const alphaZL = -5 / DEG;

/* The tail. */
const lh = 0.69, eta = 0.9, tauE = 0.48;
const lv = 0.64, zv = 0.13, arVown = hv * hv / Sv, arV = 1.5 * arVown, tauR = 0.55;
const y1 = 0.55, y2 = 0.95, tauA = 0.45;
const thrustZ = -0.008;
const kv = 960, volts = 11.1, pitchIn = 7.5, diaIn = 9.75, propR = diaIn * 0.0254 / 2;
const Ixx = 0.075, Iyy = 0.068, Izz = 0.140;
/* Travel: elevator 12 mm on a 29 mm chord at the horn, rudder 40 mm on an
 * 80 mm one, the manual's high rates; ailerons ESTIMATED, the Pro's are not
 * published. */
const throwE = Math.asin(12 / 29), throwR = Math.asin(40 / 80), throwA = 15 / DEG;

/* The coefficients. */
const c = MAC;
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const deda = 2 * aw / (Math.PI * AR);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
/* The fuselage's own destabilising moment, Raymer eq. 16.25: K_f 0.012
 * per deg for a wing a quarter of the way back, width 0.084 m, length L. */
const CmaFuse = 0.012 * DEG * 0.084 * 0.084 * 1.14 / (0.1866 * S);
const hn = 0.25 + VH * eta * (at / aw) * (1 - deda) - CmaFuse / (aw + at * (Sh / S) * eta * (1 - deda));
const SM = hn - hCG, Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c, Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
const Vtrim = 7.7, CLtrim = 2 * W / (rho * Vtrim * Vtrim * S), Cm0 = -Cma * CLtrim / CLa;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const CYb = -av * Sv / S - 0.05;
const Cnb = av * VV - 1.3 * volF / (S * b);
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
const ClbWing = -(2 * aw / (S * b)) * integrate((y) => dihedralAt(y) * chordAt(y) * y);
const Clb = ClbWing - av * (Sv / S) * (zv / b);
const gammaEq = -ClbWing / (aw / 4 * (2 * integrate((y) => chordAt(y) * y) * 4 / (S * b)));
const Clp = -(4 * aw / (S * b * b)) * integrate((y) => chordAt(y) * y * y);
const Clda = (2 * aw * tauA / (S * b)) * integrate((y) => chordAt(y) * y, y1, y2);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
const CndaPerCL = 2 * -0.17 * Clda;

/* The motor. Static, the prop turns at the speed where it absorbs the
 * shaft power, 78 percent (ESTIMATED, a 480 outrunner and its ESC at 22 A)
 * of the 251 W Model Aviation measured, through C_P 0.06; its thrust is
 * C_T 0.10 at that speed. Both coefficients are a thin electric prop's of
 * P/D 0.77 at J = 0, the UIUC propeller data base's. */
const rpmNL = kv * volts, Vp = rpmNL / 60 * pitchIn * 0.0254 * 0.85;
const D = diaIn * 0.0254;
const Pshaft = 0.78 * 251;
const n = Math.cbrt(Pshaft / (0.06 * rho * D ** 5));
const rpmLoaded = n * 60;
const Ts = 0.10 * rho * n * n * D ** 4;
const omegaLoaded = rpmLoaded * 2 * Math.PI / 60;
const discP = Ts ** 1.5 / Math.sqrt(2 * rho * Math.PI * propR * propR);
const T = (V, d) => (d > 0 ? Math.max(0, Ts * d * d * (1 - V / (Vp * d))) : 0);
const Tunclipped = (V, d) => Ts * d * d * (1 - V / (Vp * d));
const drag = (V, n1 = 1) => { const q = 0.5 * rho * V * V; const CL = n1 * W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 6, hi = 40;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > drag(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
const sink = (V, extra = 0) => (drag(V) + extra) * V / W;
let minSink = { s: 9, V: 0 };
for (let V = 1.1 * Vs; V < 15; V += 0.01) { const s = sink(V); if (s < minSink.s) minSink = { s, V }; }
let best = { vz: -1, V: 0 };
for (let V = Vs; V < 20; V += 0.05) { const vz = (T(V, 1) - drag(V)) * V / W; if (vz > best.vz) best = { vz, V }; }

/* The folding prop: folded under the fold throttle, and above it an
 * unfolded prop turning slower than the air would windmill it brakes, the
 * thrust line of the motor model carried below zero. Glide at 8 m/s, the
 * prop folded and at the fold throttle. */
const foldDuty = 0.05;
const propDrag8 = -Tunclipped(8, foldDuty);

/* Lateral: the Dutch roll step's peak rate and the polyhedral's roll, at
 * 10 m/s and at the speed 65 percent holds, where the gates fly them. */
const betaSS = -Cndr * throwR / Cnb;
function rudderAt(Vc) {
  const qc = 0.5 * rho * Vc * Vc;
  const wn = Math.sqrt(qc * S * b * Cnb / Izz);
  const zeta = (-Cnr * (b / (2 * Vc)) * qc * S * b / Izz - CYb * qc * S / (m * Vc)) / (2 * wn);
  const peak = betaSS * wn * Math.exp(-zeta / Math.sqrt(1 - zeta * zeta) * Math.atan2(Math.sqrt(1 - zeta * zeta), zeta));
  return { wn, zeta, peak, roll: Math.abs(Clb * betaSS / Clp) * (2 * Vc / b) };
}
const pb2v = Clda * throwA / -Clp;
/* The roll's time constant, Ixx over the roll damping at 12 m/s. */
const q12 = 0.5 * rho * 144;
const tauRoll = Ixx / (-Clp * q12 * S * b * b / (2 * 12));

/* The thermal: circling at a bank in a column of W0 (1 - (r/R)^2)^2. */
const thermals = [
  { x: 110, y: 70, R: 45, W0: 2.5 },
  { x: -140, y: -90, R: 40, W0: 2.0 },
  { x: 60, y: -170, R: 35, W0: 1.6 },
];
function circle(Vt, bankDeg, th) {
  const phi = bankDeg / DEG;
  const n1 = 1 / Math.cos(phi);
  const s = drag(Vt, n1) * Vt / W;
  const R = Vt * Vt / (g * Math.tan(phi));
  const up = th.W0 * Math.max(0, 1 - (R / th.R) ** 2) ** 2;
  return { sink: s, radius: R, up, climb: up - s, stallMargin: Vt / (Vs * Math.sqrt(n1)) };
}

/* The phugoid: the plant's longitudinal equations, trimmed at a speed,
 * linearised, roots of the quartic (cub-derive.js's, with this thrust). */
function deriv(x, de, d) {
  const [u, w, q, thp] = x;
  const V = Math.hypot(u, w);
  const a = Math.atan2(-w, u) - alphaZL;
  const qb = 0.5 * rho * V * V;
  const CL = CLa * a + CLde * de;
  const CD = CD0 + k * CL * CL;
  const Lf = qb * S * CL, Dr = qb * S * CD, Tt = T(Math.max(0, u), d);
  const Fx = Lf * (-w / V) - Dr * u / V + Tt;
  const Fz = Lf * (u / V) - Dr * w / V;
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
/* Trimmed and linearised. build(p) turns the three unknowns into the state
 * (u, w, q, theta), the elevator and the duty; the trim is where the three
 * accelerations vanish. */
function trimModes(build, p0) {
  const res = (p) => { const o = build(p); const r = deriv(o.x, o.de, o.d); return [r[0], r[1], r[2]]; };
  let p = p0.slice();
  for (let it = 0; it < 80; it += 1) {
    const r = res(p);
    const J = [0, 1, 2].map((j) => { const pp = p.slice(); pp[j] += 1e-7; const rr = res(pp); return rr.map((v, i) => (v - r[i]) / 1e-7); });
    const dx = solve3([0, 1, 2].map((i) => [0, 1, 2].map((j) => J[j][i])), r.map((v) => -v));
    p = p.map((v, i) => v + dx[i]);
  }
  const trim = build(p);
  const x0 = trim.x;
  const de0 = trim.de;
  const d0 = trim.d;
  const A = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => {
    const xp = x0.slice(), xm = x0.slice(); xp[j] += 1e-6; xm[j] -= 1e-6;
    return (deriv(xp, de0, d0)[i] - deriv(xm, de0, d0)[i]) / 2e-6;
  }));
  const mul = (X, Y) => X.map((r, i) => Y[0].map((_, j) => r.reduce((s, _v, kk) => s + X[i][kk] * Y[kk][j], 0)));
  const coef = [1];
  let Bk = A.map((r) => r.slice());
  let ck = -Bk.reduce((s, r, i) => s + r[i], 0);
  coef.push(ck);
  Bk = A.map((r, i) => r.map((v, j) => v + (i === j ? ck : 0)));
  for (let kk = 2; kk <= 4; kk += 1) {
    const AM = mul(A, Bk);
    ck = -AM.reduce((s, r, i) => s + r[i], 0) / kk;
    coef.push(ck);
    Bk = AM.map((r, i) => r.map((v, j) => v + (i === j ? ck : 0)));
  }
  const cm = (x, y) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
  const cs = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });
  const cd = (x, y) => { const dd = y.re * y.re + y.im * y.im; return { re: (x.re * y.re + x.im * y.im) / dd, im: (x.im * y.re - x.re * y.im) / dd }; };
  const pe = (z) => coef.reduce((acc, cf) => { const t = cm(acc, z); return { re: t.re + cf, im: t.im }; }, { re: 0, im: 0 });
  let roots = [0, 1, 2, 3].map((i) => ({ re: Math.cos(i * 1.3 + 0.4), im: Math.sin(i * 1.3 + 0.4) }));
  for (let it = 0; it < 500; it += 1) {
    roots = roots.map((z, i) => { let den = { re: 1, im: 0 }; roots.forEach((w, j) => { if (j !== i) den = cm(den, cs(z, w)); }); return cs(z, cd(pe(z), den)); });
  }
  const modes = roots.filter((r) => r.im > 1e-6).map((r) => { const wn = Math.hypot(r.re, r.im); return { period: 2 * Math.PI / r.im, zeta: -r.re / wn }; });
  modes.sort((x, y) => y.period - x.period);
  /* A short period this well damped has no imaginary part: two real roots. */
  const real = roots.filter((r) => Math.abs(r.im) <= 1e-6).map((r) => r.re).sort((x, y) => x - y);
  const none = { period: null, zeta: null };
  const V = Math.hypot(x0[0], x0[1]);
  const gammaDeg = (x0[3] - Math.atan2(-x0[1], x0[0])) * DEG;
  return { V, thetaDeg: x0[3] * DEG, gammaDeg, deDeg: de0 * DEG, duty: d0, phugoid: modes[0] || none, short: modes[1] || none, real };
}
const bodyState = (V, th, gam) => [V * Math.cos(th - gam), -V * Math.sin(th - gam), 0, th];
/* Level at V: theta, elevator and duty unknown. */
const levelModes = (V) => trimModes((p) => ({ x: bodyState(V, p[0], 0), de: p[1], d: p[2] }), [0.02, 0, 0.8]);
/* Power off at V: theta, elevator and the flight path unknown. */
const glideModes = (V) => trimModes((p) => ({ x: bodyState(V, p[0], p[2]), de: p[1], d: 0 }), [0.02, 0, -0.05]);
/* A duty and V: a steady climb, theta, elevator and flight path unknown. */
const climbModes = (V, d) => trimModes((p) => ({ x: bodyState(V, p[0], p[2]), de: p[1], d }), [0.2, 0, 0.2]);
/* The stick left alone: elevator and duty fixed, where it settles. */
const handsOffModes = (de, d) => trimModes((p) => ({ x: bodyState(p[2], p[0], p[1]), de, d }), [0.2, 0.2, 9]);

/* The stick that gives a surface angle through the expo, 0.3 x^3 + 0.7 x. */
function stickFor(delta, travel) {
  const want = Math.abs(delta) / travel;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (0.3 * mid * mid * mid + 0.7 * mid < want) lo = mid; else hi = mid; }
  return Math.sign(delta) * lo;
}

const f = (x, nd = 3) => (x === null ? 'none' : Number(x).toFixed(nd));
const rows = [
  ['planform area drawn m2, MAC m, MAC LE aft of root m', `${f(areaDrawn, 4)} ${f(MAC, 4)} ${f(macLE, 4)}`],
  ['tip rise m, CG h (of MAC), AR', `${f(tipRise, 3)} ${f(hCG, 3)} ${f(AR, 2)}`],
  ['fuselage wetted m2, volume m3, side m2', `${f(SwetF, 4)} ${f(volF, 5)} ${f(sideF, 4)}`],
  ['Re fuselage, Cf, FF; Re tail, Cf', `${f(ReF, 0)} ${f(CfF, 5)} ${f(FFf, 3)}; ${f(ReT, 0)} ${f(CfT, 5)}`],
  ['CD0 parts: wing, fuselage, tail, misc = CD0', `${f(cdWingProfile, 4)} ${f(cdFuse, 4)} ${f(cdTail, 4)} ${f(dCDmisc, 4)} = ${f(CD0, 3)}`],
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, h_n, static margin', `${f(CLa)} ${f(hn)} ${f(SM)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde)} ${f(CLde, 4)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ (wing, total), equivalent Γ deg, Clp, Clδa', `${f(ClbWing, 4)} ${f(Clb, 4)} ${f(gammaEq * DEG, 2)} ${f(Clp)} ${f(Clda)}`],
  ['Cnδr, CYδr, Clδr, Cnδa per CL', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)} ${f(CndaPerCL, 4)}`],
  ['throws a, e, r deg', `${f(throwA * DEG, 1)} ${f(throwE * DEG, 1)} ${f(throwR * DEG, 1)}`],
  ['k, rpm no load, V_p, static rpm, static thrust N, shaft W', `${f(k, 4)} ${f(rpmNL, 0)} ${f(Vp, 2)} ${f(rpmLoaded, 0)} ${f(Ts, 2)} ${f(Pshaft, 0)}`],
  ['fuselage Cmα', f(CmaFuse, 4)],
  ['disc power W, torque N m, arm m, electrical N m', `${f(discP, 1)} ${f(discP / omegaLoaded, 4)} ${f(discP / omegaLoaded / Ts, 5)} ${f(0.8 * 251 / omegaLoaded, 4)}`],
  ['G1 glide ratio: best, at m/s; at 8 m/s', `${f(LDmax, 2)} ${f(Vmd, 2)}; ${f(ld(8), 2)}`],
  ['G2 min sink m/s at m/s', `${f(minSink.s, 3)} ${f(minSink.V, 2)}`],
  ['G3 stall m/s, alpha stall rad', `${f(Vs, 2)} ${f(CLmax / CLa, 5)}`],
  ['G4 best climb m/s at m/s', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['G5 level at 65, 85, 100 percent', `${f(level(0.65), 2)} ${f(level(0.85), 2)} ${f(level(1), 2)}`],
  ['G6 pb/2V full aileron, deg/s at 12 m/s, roll tau s', `${f(pb2v, 4)} ${f(pb2v * 2 * 12 / b * DEG, 0)} ${f(tauRoll, 3)}`],
  ['G8 sideslip deg', f(betaSS * DEG, 1)],
];
for (const Vc of [10, level(0.65)]) {
  const o = rudderAt(Vc);
  rows.push([`G9 Dutch roll wn, zeta, peak r deg/s at ${f(Vc, 2)} m/s`, `${f(o.wn, 2)} ${f(o.zeta, 3)} ${f(o.peak * DEG, 1)}`]);
  rows.push([`G10 steady roll from rudder deg/s at ${f(Vc, 2)} m/s`, f(o.roll * DEG, 1)]);
}
rows.push(
  ['G11 unfolded prop drag at 8 m/s N; G12 glide ratio then', `${f(propDrag8, 3)} ${f(W / (drag(8) + propDrag8) * Math.sqrt(1 - (sink(8, propDrag8) / 8) ** 2), 2)}`],
);
for (const th of thermals) {
  for (const [Vt, bank] of [[8.5, 30], [9.0, 40]]) {
    const o = circle(Vt, bank, th);
    rows.push([`G14 thermal R ${th.R} W0 ${th.W0}: ${Vt} m/s at ${bank} deg`, `radius ${f(o.radius, 1)} sink ${f(o.sink, 3)} up ${f(o.up, 3)} climb ${f(o.climb, 3)} (${f(o.stallMargin, 2)} Vs)`]);
  }
}
const modeRow = (name, o) => {
  rows.push([name, `V ${f(o.V, 2)} theta ${f(o.thetaDeg, 2)} gamma ${f(o.gammaDeg, 2)} de ${f(o.deDeg, 2)} (stick ${f(stickFor(o.deDeg / DEG, throwE))}) duty ${f(o.duty)}`]);
  rows.push(['    phugoid s, zeta; short period s, zeta; real roots', `${f(o.phugoid.period, 2)} ${f(o.phugoid.zeta)}; ${f(o.short.period, 2)} ${f(o.short.zeta)}; ${o.real.map((r) => f(r, 2)).join(' ')}`]);
};
modeRow('glide trim at 7.7 m/s', glideModes(Vtrim));
modeRow('level at the 65 percent speed', levelModes(level(0.65)));
modeRow('G19 hands off at 65 percent, elevator neutral', handsOffModes(0, 0.65));
for (const V of [8, 10, 12]) modeRow(`level at ${V} m/s`, levelModes(V));
modeRow('G17 a 10 m/s climb at 70 percent', climbModes(10, 0.7));
for (const [name, v] of rows) {
  console.log(`${name.padEnd(56)} ${v}`);
}
