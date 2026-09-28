/*
 * f16-derive.js: the arithmetic behind docs/F16-STAGE1.md, from Freewing's
 * published figures for the F-16 Fighting Falcon V3 70 mm EDF (FJ211,
 * the 6S High Performance PNP, FJ21115P), its manual's dimensioned top
 * view, the fan's maker's figures, NASA's measurements of a ducted fan and
 * of the full size F-16, to every coefficient and every derived band. It
 * never loads the plant: this is what the plant is checked against, so it
 * has to stand apart from it. Harness arithmetic in JS maths, which is
 * allowed here because nothing it prints is hashed. It follows
 * scripts/kadet-derive.js where the two aircraft are alike: both stand on
 * a tricycle gear and are flown on the same plant. Run with npm run
 * f16:derive.
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
const mm = (x) => x / 1000;

/*
 * The aircraft. Span, length, the flying weight without a pack, the
 * balance point, the thrust and the speed are Freewing's (the V3 manual,
 * FJ211-V02, and the FJ21115P product page); the wing area Model
 * Aviation's review of the same airframe (333 sq in); the pack Motion RC's
 * Admiral 6S 4000 (566 g). The planform is the manual's dimensioned top
 * view ("Product basic parameters", 1306 mm between the pitot's tip and
 * the tail, 878 mm across the rails), read at 1.68 mm a pixel: stations
 * are millimetres aft of the pitot's tip, y outboard of the centreline.
 */
const b = mm(878), S = 333 * 0.0254 * 0.0254, m = 1.550 + 0.566, W = m * g;
/* The wing as the top view draws it: a leading edge swept 38.9 deg
 * (dx/dy 0.8077) from the strake's end at station 620, 117 mm out, to the
 * tip at 410 mm; the trailing edge straight across at station 940. Taken
 * to the centreline the trapezoid's root chord is 414.5 mm, its tip 83. */
const xApex = 620 - 0.8077 * 117, cRoot = mm(940 - xApex), cTip = mm(940 - (xApex + 0.8077 * 410)), semi = mm(410);
const taper = cTip / cRoot;
const Strap = 2 * semi * (cRoot + cTip) / 2;
const mac = (2 / 3) * cRoot * (1 + taper + taper * taper) / (1 + taper);
const yMac = (semi / 3) * (1 + 2 * taper) / (1 + taper);
const xMacLE = mm(xApex) + 0.8077 * yMac;
/* Freewing: "CG 90mm / 3.5" from the leading edge of the wing at the
 * root", the wing's root being where it meets the strake. */
const xCG = mm(620 + 90);
/* The wing proper, the full size F-16's own: "aspect ratio 3.09"
 * (sirviper.com, after Jane's), its NACA 64A204 (Joe Baugher) at no
 * incidence, whose zero lift angle is -1.2 deg (the a = 0.4 mean line at
 * a design lift of 0.2). */
const ARw = 3.09, alphaZLwing = -1.2 / DEG;
const tanLE = 0.8077;
const tanHalf = (A, tl, lam) => tl - (4 / A) * 0.5 * (1 - lam) / (1 + lam);
/* DATCOM's (Helmbold's) lift slope for a swept wing, the section's slope
 * 0.9 of 2 pi. */
const helmbold = (A, th) => 2 * Math.PI * A / (2 + Math.sqrt(A * A / 0.81 * (1 + th * th) + 4));
const aw = helmbold(ARw, tanHalf(ARw, tanLE, taper));
/* The stabilators off the same top view: each from 88 mm out, its leading
 * edge from station 1048 swept to the tip at 245 mm (dx/dy 0.929), a
 * 210 mm root and 64 mm tip, so 0.0430 m^2 the pair; all moving. */
const stRoot = mm(210), stTip = mm(64), stSpan = mm(245 - 88);
const Sh = 2 * stSpan * (stRoot + stTip) / 2;
const ARt = (2 * stSpan) ** 2 / Sh;
const lamT = stTip / stRoot;
const at = helmbold(ARt, tanHalf(ARt, 0.929, lamT));
const macT = (2 / 3) * stRoot * (1 + lamT + lamT * lamT) / (1 + lamT);
const yMacT = (stSpan / 3) * (1 + 2 * lamT) / (1 + lamT);
const xAcTail = mm(1048) + 0.929 * yMacT + 0.25 * macT;
const xAcWing = xMacLE + 0.25 * mac;
const lh = xAcTail - xAcWing;
const eta = 0.9;
/* The fin: the full size F-16's 5.09 m^2 with its 1.08 m^2 rudder, at the
 * model's 1/11.5 (1306 mm on the F-16's 15.03 m), 0.0385 m^2; its centre
 * 0.45 m behind the CG and 0.12 m over it; aspect ratio about 1.5, raised
 * by the fuselage under it. ESTIMATED: Freewing publishes no fin. */
const Sv = 5.09 / (11.5 * 11.5), SvRudder = 1.08 / (11.5 * 11.5), lv = 0.45, zv = 0.12;
const arV = 1.5 * 1.35;
const av = helmbold(arV, Math.tan(40 / DEG));
const tauR = 0.52, tauA = 0.41;
/* Downwash: Nelson's 2 a_w / (pi A); DATCOM's gradient at this aspect
 * ratio, 0.89, is the low aspect ratio end of its fit and is printed for
 * comparison. */
const KA = 1 / ARw - 1 / (1 + Math.pow(ARw, 1.7));
const KL = (10 - 3 * taper) / 7;
const KH = 1 / Math.cbrt(2 * lh / (2 * semi));
const dedaDatcom = 4.44 * Math.pow(KA * KL * KH, 1.19);
const deda = 2 * aw / (Math.PI * ARw);
const VH = Sh * lh / (S * mac);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
/* The neutral point. The build up (the tail's share, Raymer's fuselage
 * term with K_f 0.016 at a root quarter chord half way down a 0.13 m wide
 * body) is printed; the one taken is the full size F-16's, which the model
 * scales: NASA TP-1538, "static margin at low angles of attack is
 * approximately -4 percent" at its 0.35 c reference, so the neutral point
 * is 0.31 of the mean chord. */
const hnBuild = 0.25 + eta * VH * (at / aw) * (1 - deda) - 0.016 * 0.13 * 0.13 * 1.25 / (mac * S) * DEG / CLa;
const hn = 0.31;
const hCG = (xCG - xMacLE) / mac;
const SM = hn - hCG;
const Cma = -CLa * SM;
const a0w = alphaZLwing;
const tailK = at * (Sh / S) * eta;
const alphaZL = (aw * a0w + tailK * (-deda * a0w)) / (aw + tailK * (1 - deda));
/* Nelson's pitch damping, 2.2 eta V_H a_t l_h / c: the tail's with a
 * tenth for the wing and the body. */
const Cmq = -2.2 * eta * at * VH * lh / mac;
const Cmde = eta * VH * at, CLde = -eta * (Sh / S) * at;
const VV = Sv * lv / (S * b);
/* The long forebody's weathercock contribution, Nelson eq. 2.64 with K_N
 * 0.0012 per degree, the side area 1.25 m by a 0.12 m deep body. */
const SBs = 1.25 * 0.12, lf = 1.25;
const CnbFus = -0.0012 * DEG * (SBs / S) * (lf / b);
const CYb = -av * Sv / S - 0.06;
const Cnb = av * VV + CnbFus;
const CD0fit = { value: null };
const k = 1 / (Math.PI * 0.75 * ARw);
const Cnr = -2 * av * VV * lv / b - 0.034 / 4;
/* A mid wing with no dihedral: its sweep's effective dihedral, DATCOM's
 * (Clb / CL)_sweep for a 40 deg, taper 0.2, aspect ratio 3 wing, about
 * -0.2 per unit lift per radian taken at the cruise's lift, and the fin's
 * height. ESTIMATED. */
const ClbSweep = -0.2 * 0.25;
const Clb = ClbSweep - av * (Sv / S) * (zv / b);
/* Roll damping and the ailerons by strip theory on the trapezoid, the
 * ailerons from the strake's end, 117 mm out, to 300 mm, a fifth of the
 * chord (tau 0.41, Nelson fig. 2.21). */
const Clp = -aw * (1 + 3 * taper) / (12 * (1 + taper));
const chordAt = (y) => cRoot - (cRoot - cTip) * y / semi;
const intCy = (y0, y1) => { let s = 0; const n = 400; for (let i = 0; i < n; i += 1) { const y = y0 + (i + 0.5) * (y1 - y0) / n; s += chordAt(y) * y * (y1 - y0) / n; } return s; };
const Clda = 2 * aw * tauA * intCy(mm(117), mm(300)) / (S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
const ClrPerCL = 0.25, CnpPerCL = -0.125, CndaPerCL = -0.05;
/* Throws. Freewing gives its high rates as travel in mm at the trailing
 * edge (aileron 34, elevator 34, rudder 35) and not the surfaces' chords,
 * so the angles are the full size F-16's own limits (NASA TP-1538: the
 * horizontal tail 25 deg, the flaperons 21.5, the rudder 30), which the
 * manual's "High Rate for the first flight" is the whole of. */
const throwA = 21.5 / DEG, throwE = 25 / DEG, throwR = 30 / DEG, expo = 0.30;
/* The full size F-16's inertia over its weight and size (TP-1538: 9,299
 * kg, Ix 12,875, Iy 75,674, Iz 85,552 kg m^2 on 9.144 m and 15.03 m),
 * put on the model's 2.116 kg, 0.82 m wing and 1.25 m fuselage. ESTIMATED:
 * a foam model's pack sits forward and its fan aft as the jet's engine
 * does not. */
const Ixx = 12875 / (9299 * 9.144 * 9.144) * m * 0.82 * 0.82;
const Iyy = 75674 / (9299 * 15.03 * 15.03) * m * 1.25 * 1.25;
const Izz = 85552 / (9299 * 15.03 * 15.03) * m * 1.25 * 1.25;

/*
 * THE FAN. Freewing's 70 mm 12 blade unit on its 2957 2210 kV inrunner,
 * 6S: 2,400 g static (the manual; 2,450 g at 70 A, rc-castle's listing of
 * the same unit). Its rotor is 69 mm. The plant turns the no load rpm,
 * kV times 3.7 V a cell, at 0.85 of it loaded, as every electric table.
 * NASA's ducted fan (Weinstein et al., SciTech 2024, Table 16 and its
 * median Jx 0.313) fits a thrust coefficient linear in the advance ratio,
 * C_T 1.248 - 0.9675 (J - 0.313), which is zero at J = 1.603: the zero
 * thrust speed is 1.603 n D. That is the plant's pitch_speed for a fan.
 */
const T0 = 2.400 * 9.80665, rpmNL = 2210 * 3.7 * 6, rpm = 0.85 * rpmNL, D = mm(69);
const J0 = 0.313 + 1.248 / 0.9675;
const Vz = J0 * (rpm / 60) * D;
const T = (V, n = 1) => (n > 0 ? Math.max(0, T0 * n * n * (1 - V / (Vz * n))) : 0);
/* Its static efflux speed through 90 percent of the swept annulus (a 30
 * mm hub): the momentum thrust's jet, for the ideal power it asks. */
const Aexit = 0.9 * Math.PI / 4 * (D * D - 0.030 * 0.030);
const Vjet = Math.sqrt(T0 / (rho * Aexit));
const currentFull = 70;
/* Freewing: "a maximum flying speed of 165kph". CD0 is what flies it
 * there on this fan, level. */
const Vtop = 165 / 3.6;
{
  const q = 0.5 * rho * Vtop * Vtop, CL = W / (q * S);
  CD0fit.value = T(Vtop) / (q * S) - k * CL * CL;
}
const CD0 = CD0fit.value;
/* The gear down adds its drag, the P-51's retracts in the plant taking it
 * away as they fold: three legs, their wheels and the doors, about 4.6e-3
 * m^2 across the flow at a C_D of 0.6, on the wing's area. ESTIMATED. So
 * the table's cd0 is the gear down one, and the take off, the approach and
 * the landing are flown with it; everything in the air with the gear up. */
const gearFrontal = 2 * 0.060 * 0.018 + 0.040 * 0.012 + 2 * 0.09 * 0.006 + 0.065 * 0.006 + 2 * 0.08 * 0.003;
const cdGear = 0.6 * gearFrontal / S;
const CD0g = CD0 + 0.013;
const ldGear = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0g + k * CL * CL); };
const Dg = (V, mass = m) => { const q = 0.5 * rho * V * V; const CL = mass * g / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (n) => {
  let lo = 8, hi = 60;
  if (T(lo, n) < Dg(lo) && T(15, n) < Dg(15)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, n) > Dg(mid)) lo = mid; else hi = mid; }
  return lo;
};

/* Lift: the linear curve to CL max 1.1, short of the full size F-16's
 * 1.5 to 1.6 (TP-1538's lift curve) for the model's low Reynolds number
 * and its fixed leading edge; held 10 deg past the stall by the strakes'
 * vortex, to Freewing's "high alpha of 30 degrees", then falling to 0.8 of
 * it. ESTIMATED. */
const CLmax = 1.1, stallTop = 10 / DEG, stallK = 0.8, stallBlend = 3 / DEG;
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
let best = { vz: -1, V: 0 };
for (let V = 1.2 * Vs; V < 40; V += 0.02) { const vz = (T(V) - Dg(V)) * V / W; if (vz > best.vz) best = { vz, V }; }

/* The fan's speed, the plant's law: the ESC ramps a start from a stopped
 * motor over esc_start, and the speed follows its command critically
 * damped with fan_tau. tau: NASA's measured second order constant, 0.02
 * to 0.15 s on their 130 mm fan across its ESC's ramp settings and step
 * sizes (Fig. 10), grows with a step's size; a rotor's J omega / Q goes
 * with its diameter at the same tip speed, so 0.53 of it here, 0.01 to
 * 0.08 s; a full throttle punch is a bigger step than any they measured,
 * so the top of that. The start: the ESC's manual, Normal startup, "300ms"
 * from initial throttle advance to full. */
const fanTau = 0.08, escStart = 0.3;
function spool({ from = 0, to = 1, started = false, seconds = 3 }) {
  let n = from, v = 0, ramp = started ? 1 : 0;
  const dt = 0.001;
  const out = [];
  for (let t = 0; t < seconds; t += dt) {
    let target = to;
    if (!(to > 0)) { target = 0; ramp = 0; } else if (ramp < 1) { ramp += dt / escStart; if (ramp >= target) ramp = 1; else target = ramp; }
    const acc = (target - n) / (fanTau * fanTau) - 2 * v / fanTau;
    v += acc * dt; n += v * dt;
    if (n < 0) { n = 0; v = 0; }
    out.push({ t: t + dt, n, thrust: T0 * n * n });
  }
  return out;
}
const firstAt = (tr, f) => { const p = tr.find(f); return p ? p.t : null; };
const upStopped = spool({ from: 0, to: 1 });
const upIdle = spool({ from: 0.3, to: 1, started: true });
const down = spool({ from: 1, to: 0 });

/* The stick for a surface angle through the expo. */
function stickFor(delta, travel) {
  const want = delta / travel;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (expo * mid * mid * mid + (1 - expo) * mid < want) lo = mid; else hi = mid; }
  return lo;
}

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

/* The trim: level at half throttle with the elevator neutral, the
 * pattern speed ("the model can also fly the pattern at surprisingly slow
 * speeds", Model Aviation), so Cm0 balances the lift there. The thrust
 * line runs through the CG. */
const Vtrim = level(0.5), CLtrim = 2 * W / (rho * Vtrim * Vtrim * S);
const Cm0 = -Cma * CLtrim / CLa;

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
  const My = qb * S * mac * (Cm0 + Cma * a + Cmq * q * mac / (2 * V) + Cmde * de);
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
  const spiral = real[real.length - 1];
  return {
    V, CL,
    spiral: { root: spiral, tHalf: spiral < 0 ? Math.log(2) / -spiral : null, t2: spiral > 0 ? Math.log(2) / spiral : null },
    roll: { root: real[0], tau: -1 / real[0] },
    dutch: dr ? { wn: Math.hypot(dr.re, dr.im), zeta: -dr.re / Math.hypot(dr.re, dr.im), period: 2 * Math.PI / dr.im } : null,
  };
}

/* The steady roll at full aileron, strip theory: p b / 2V = Clda da /
 * -Clp; the full size F-16's 324 deg/s at 250 m/s on 9.45 m is 0.107. */
const pb2v = Clda * throwA / -Clp;
const rollAt = (V, frac = 1) => pb2v * frac * 2 * V / b * DEG;

/*
 * The gear, ESTIMATED from the full size F-16's (sirviper.com, after
 * Jane's: "wheel track 7 ft 9 in (2.36 m)", "wheel base 13 ft 1.5 in
 * (4.00 m)") at 1/11.5, 0.205 m and 0.348 m, the mains 52 mm behind the CG
 * so the nose wheel carries 15 percent; the tyres the F-16's 27.75 in
 * mains and 18 in nose wheel at the same scale, 60 and 40 mm; the CG
 * 0.140 m over the runway, level. Each leg's stiffness gives 6 mm of
 * static deflection (the V3's shock absorbing struts), damping 0.6 of
 * critical, the Cub's rule.
 */
const rest = { pitchDeg: 0, cgHeight: 0.140, mainAft: 0.052, noseAhead: 0.348 - 0.052, defl: 0.006 };
const noseShare = rest.mainAft / (rest.mainAft + rest.noseAhead);
const loadNose = W * noseShare, loadMain = W * (1 - noseShare) / 2;
const kMain = loadMain / rest.defl, kNose = loadNose / rest.defl;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mNose = (Iyy + m * rest.mainAft * rest.mainAft) / Math.pow(rest.mainAft + rest.noseAhead, 2);
const cNose = 2 * 0.6 * Math.sqrt(kNose * mNose);
/* Rolling on the airfield's grass at the Cub's 0.08 (a foam jet's small
 * wheels, the same class), the throttle held and the elevator neutral:
 * the lift and drag at the rest attitude, the fan spooling as the plant's
 * does, to a rotation speed. */
function takeoff(stick, vRot, mu = 0.08) {
  const CL = CLa * (-alphaZL), CD = CD0g + k * CL * CL;
  let V = 0, x = 0, t = 0, n = 0, v = 0, ramp = 0;
  const dt = 0.001;
  while (V < vRot && t < 60) {
    let target = stick;
    if (ramp < 1) { ramp += dt / escStart; if (ramp >= target) ramp = 1; else target = ramp; }
    const acc = (target - n) / (fanTau * fanTau) - 2 * v / fanTau;
    v += acc * dt; n += v * dt;
    const q = 0.5 * rho * V * V;
    const a = (T(V, n) - q * S * CD - mu * Math.max(0, W - q * S * CL)) / m;
    V = Math.max(0, V + a * dt); x += V * dt; t += dt;
  }
  return { x, t, V };
}

/*
 * Rotation. On its wheels the jet pivots about the mains' contact, 52 mm
 * behind the CG and 0.140 m under it, so the fan's thrust through the CG
 * pitches the nose DOWN onto its wheel by T h, the weight by W x, and the
 * drag and the lift the other way; full up stabilator lifts it once
 * q S c (Cm0 + Cma a + Cmde de) + (L - W) x - (T - D) h > 0. The speed
 * that happens at, at a throttle, and the roll to it: a jet with a high
 * thrust line on a short wheelbase rotates late.
 */
function rotation(stick, mu = 0.08) {
  const aRest = -alphaZL, xm = rest.mainAft, h = rest.cgHeight;
  let V = 0, x = 0, t = 0, n = 0, v = 0, ramp = 0;
  const dt = 0.001;
  while (t < 60) {
    let target = stick;
    if (ramp < 1) { ramp += dt / escStart; if (ramp >= target) ramp = 1; else target = ramp; }
    const acc = (target - n) / (fanTau * fanTau) - 2 * v / fanTau;
    v += acc * dt; n += v * dt;
    const q = 0.5 * rho * V * V;
    const CLg = CLa * aRest, CDg = CD0g + k * CLg * CLg;
    const L = q * S * (CLg + CLde * throwE), Dr = q * S * CDg, Tt = T(V, n);
    const moment = q * S * mac * (Cm0 + Cma * aRest + Cmde * throwE) + (L - W) * xm - (Tt - Dr) * h;
    if (moment > 0 && V > 1) return { V, x, t };
    const a = (Tt - Dr - mu * Math.max(0, W - q * S * CLg)) / m;
    V = Math.max(0, V + a * dt); x += V * dt; t += dt;
  }
  return null;
}

/* Energy: from cruise the throttle closed, level, how far and how long it
 * takes to slow to the approach speed, 1.3 Vs, and the glide from 30 m at
 * that speed. */
function slowDown(v0, v1) {
  let V = v0, x = 0, t = 0;
  const dt = 0.001;
  while (V > v1 && t < 120) { V -= Dg(V) / m * dt; x += V * dt; t += dt; }
  return { x, t };
}

const armAc = (xCG - xAcWing) / mac;
const armCp = (xMacLE + 0.40 * mac - xCG) / mac;
const stallDw = eta * VH * at * deda / aw;

/* The linear lateral model from a bank with every stick centred: the bank
 * at a time, for the hands off gate. */
function bankAfter(V, phi0, tEnd) {
  const q = 0.5 * rho * V * V, CL = W / (q * S), bv = b / (2 * V);
  const A = [
    [q * S * CYb / m / V, 0, -1, g / V],
    [q * S * b * Clb / Ixx, q * S * b * Clp * bv / Ixx, q * S * b * ClrPerCL * CL * bv / Ixx, 0],
    [q * S * b * Cnb / Izz, q * S * b * CnpPerCL * CL * bv / Izz, q * S * b * Cnr * bv / Izz, 0],
    [0, 1, 0, 0],
  ];
  let x = [0, 0, 0, phi0];
  const dt = 0.001;
  for (let t = 0; t < tEnd; t += dt) {
    const dx = A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
    x = x.map((v, i) => v + dx[i] * dt);
  }
  return x[3];
}

/*
 * Past the stall, the plant's model (docs/STALL-STAGE1.md), as
 * scripts/kadet-derive.js takes it: the linear lift to the blend, held
 * stall_top past it, falling to stall_k; the moment's arms. Then full up
 * elevator: the angle where the moment is zero, and the steady descent
 * there, which is where the aircraft settles at a high alpha.
 */
const smooth = (a0, a1, x) => {
  const t = Math.min(1, Math.max(0, (x - a0) / (a1 - a0)));
  return t * t * (3 - 2 * t);
};
function coeffs(alpha) {
  const aStall = CLmax / CLa;
  const sigma = smooth(aStall - stallBlend, aStall + stallBlend, Math.abs(alpha));
  const clLin = CLa * alpha;
  return {
    CL: (1 - sigma) * clLin + sigma * 2 * Math.sin(alpha) * Math.cos(alpha),
    CD: (1 - sigma) * (CD0 + k * clLin * clLin) + sigma * (CD0 + 2 * Math.sin(alpha) ** 2),
  };
}
function stalledAt(alpha, de) {
  const aStall = CLmax / CLa;
  const x = Math.abs(alpha);
  const sigma = smooth(aStall - stallBlend, aStall + stallBlend, x);
  const clLin = CLa * alpha + CLde * de;
  const plate = 2 * Math.sin(alpha) * Math.cos(alpha);
  const clOld = (1 - sigma) * clLin + sigma * plate;
  const past = smooth(aStall, aStall + stallBlend, x);
  if (!(sigma > 0)) return { CL: clOld, cmStall: 0 };
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
  return { CL: clOld + past * (clSt - clOld), cmStall: past * cmPost };
}
function mush(de) {
  const cmAt = (a) => Cm0 + Cma * a + Cmde * de + stalledAt(a, de).cmStall;
  let lo = 0.02, hi = 1.2;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (cmAt(mid) > 0) lo = mid; else hi = mid; }
  const alpha = lo;
  const CL = stalledAt(alpha, de).CL;
  const { CD } = coeffs(alpha);
  const V = Math.sqrt(2 * W / (rho * S * Math.hypot(CL, CD)));
  const gamma = Math.atan2(CD, CL);
  return { alphaDeg: alpha * DEG, CL, CD, V, sink: V * Math.sin(gamma) };
}
/* The landing roll from touchdown at 1.15 Vs on the grass, idle, the
 * elevator let go, no brake: rolling resistance and the drag at the rest
 * attitude. */
function rollOut(v0, mu = 0.08) {
  const { CL } = coeffs(-alphaZL);
  const CD = coeffs(-alphaZL).CD + (CD0g - CD0);
  let V = v0, x = 0, t = 0;
  const dt = 0.001;
  while (V > 0.05 && t < 120) {
    const q = 0.5 * rho * V * V;
    V -= (q * S * CD + mu * Math.max(0, W - q * S * CL)) / m * dt; x += V * dt; t += dt;
  }
  return { x, t };
}
const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const V50 = level(0.5), V75 = level(0.75);
const lat = lateral(V50);
const lm = longitudinalModes(V50);
const rows = [
  ['b, S (trapezoid), mac, y mac, AR ref, m, W/S', `${f(b, 3)} ${f(S, 5)} (${f(Strap, 5)}) ${f(mac, 4)} ${f(yMac, 4)} ${f(b * b / S, 2)} ${f(m, 3)} ${f(W / S, 1)}`],
  ['stations m: apex, mac LE, ac wing, CG, ac tail', `${f(mm(xApex), 4)} ${f(xMacLE, 4)} ${f(xAcWing, 4)} ${f(xCG, 4)} ${f(xAcTail, 4)}`],
  ['root, tip chord, taper; CG per mac', `${f(cRoot, 4)} ${f(cTip, 4)} ${f(taper, 3)}; ${f(hCG, 4)}`],
  ['a_w, a_t, a_v /rad; S_h, AR_t, l_h, V_H', `${f(aw)} ${f(at)} ${f(av)}; ${f(Sh, 4)} ${f(ARt, 2)} ${f(lh, 4)} ${f(VH, 4)}`],
  ['dε/dα Nelson (DATCOM)', `${f(deda)} (${f(dedaDatcom)})`],
  ['CLα, h_n taken (build up), static margin', `${f(CLa)} ${f(hn)} (${f(hnBuild)}) ${f(SM, 4)}`],
  ['zero lift line deg, sin, cos', `${f(alphaZL * DEG, 2)} ${Math.sin(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)} ${Math.cos(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde)} ${f(CLde)}`],
  ['CYβ, Cnβ (fuselage), Cnr', `${f(CYb)} ${f(Cnb, 4)} (${f(CnbFus, 4)}) ${f(Cnr, 4)}`],
  ['Clβ, Clp, Clδa', `${f(Clb, 4)} ${f(Clp, 4)} ${f(Clda, 4)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['k, Ixx Iyy Izz', `${f(k, 4)} ${f(Ixx, 4)} ${f(Iyy, 4)} ${f(Izz, 4)}`],
  ['fan: static N, rpm no load, loaded, J0, zero thrust m/s', `${f(T0, 3)} ${f(rpmNL, 0)} ${f(rpm, 0)} ${f(J0, 3)} ${f(Vz, 2)}`],
  ['   exit area m^2, static jet m/s, ideal W', `${f(Aexit, 6)} ${f(Vjet, 1)} ${f(T0 * Vjet / 2, 0)}`],
  ['   thrust at 0, 15, 30, 45 m/s full', `${f(T(0), 2)} ${f(T(15), 2)} ${f(T(30), 2)} ${f(T(45), 2)}; ratio at 40 ${f(T(40) / T0, 3)}`],
  ['CD0 fitted to 165 km/h (gear up); gear drag, estimate; table cd0', `${f(CD0, 4)}; ${f(cdGear, 4)}, taken 0.013; ${f(CD0g, 4)}`],
  ['glide at 1.3 Vs gear down: L/D, sink', `${f(ldGear(1.3 * Vs), 2)} ${f(1.3 * Vs / ldGear(1.3 * Vs), 3)}`],
  ['level at 100, 75, 50, 35 percent stick', `${f(level(1), 2)} ${f(V75, 2)} ${f(V50, 2)} ${f(level(0.35), 2)}`],
  ['stall m/s, 1.3 Vs', `${f(Vs, 2)} ${f(1.3 * Vs, 2)}`],
  ['glide L/D best at, at 1.3 Vs', `${f(LDmax, 2)} ${f(Vmd, 2)}; ${f(ld(1.3 * Vs), 2)} sink ${f(1.3 * Vs / ld(1.3 * Vs), 3)}`],
  ['best climb m/s at m/s', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['spool: stopped to 90 percent thrust s', `${f(firstAt(upStopped, (p) => p.thrust >= 0.9 * T0), 3)}; 50 percent ${f(firstAt(upStopped, (p) => p.thrust >= 0.5 * T0), 3)}`],
  ['   from 30 percent spinning to 90 percent thrust s', f(firstAt(upIdle, (p) => p.thrust >= 0.9 * T0), 3)],
  ['   full to under 10 percent thrust s', f(firstAt(down, (p) => p.thrust <= 0.1 * T0), 3)],
  ['roll: pb/2V, deg/s at 20, 30, 40 m/s', `${f(pb2v, 4)} ${f(rollAt(20), 0)} ${f(rollAt(30), 0)} ${f(rollAt(40), 0)}`],
  ['lateral at 50 percent: V, CL, spiral t_half, roll tau, Dutch', `${f(lat.V, 2)} ${f(lat.CL)} ${f(lat.spiral.tHalf, 1)}/${f(lat.spiral.t2, 1)} ${f(lat.roll.tau, 4)} ${lat.dutch ? `${f(lat.dutch.period, 2)} s ${f(lat.dutch.zeta)}` : 'none'}`],
  ['trim at 50 percent: theta de phugoid short', `${f(lm.thetaDeg, 2)} ${f(lm.deDeg, 2)} ${f(lm.phugoid && lm.phugoid.period, 2)} ${f(lm.phugoid && lm.phugoid.zeta)}; ${f(lm.short && lm.short.period, 3)} ${f(lm.short && lm.short.zeta)}`],
  ['alpha trim at full up, linear (deg), alpha stall', `${f((Cm0 + Cmde * throwE) / -Cma * DEG, 1)} ${f(CLmax / CLa * DEG, 1)}`],
  ['stall arms ac, cp, dw', `${f(armAc, 4)} ${f(armCp, 4)} ${f(stallDw, 4)}`],
  ['strip_c at 1/8 3/8 5/8 7/8 over the semispan mean chord', [0.125, 0.375, 0.625, 0.875].map((e) => f(chordAt(e * semi) / ((cRoot + cTip) / 2), 3)).join(' ')],
  ['hands off from 30 deg at 50 percent: bank at 2, 4, 6 s', `${f(bankAfter(V50, 30 / DEG, 2) * DEG, 1)} ${f(bankAfter(V50, 30 / DEG, 4) * DEG, 1)} ${f(bankAfter(V50, 30 / DEG, 6) * DEG, 1)}`],
  ['full up mush', JSON.stringify(mush(throwE), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))],
  ['hands off glide, throttle closed', JSON.stringify(mush(0), (kk, v) => (typeof v === 'number' ? +v.toFixed(3) : v))],
  /* The slowest a tricycle jet can touch is set by its tail: on the mains
   * the nozzle's skid strikes at 11.4 deg of pitch, so level at that
   * pitch the lift is CLalpha (11.4 deg + 1.03) and no slower; a pilot
   * flaring to 9 deg touches at the lift of 9. */
  ['touchdown m/s at 11.4 deg (the tail strikes), at 9 deg', `${f(Math.sqrt(2 * W / (rho * S * CLa * (11.4 / DEG - alphaZL))), 2)} ${f(Math.sqrt(2 * W / (rho * S * CLa * (9 / DEG - alphaZL))), 2)}`],
  ['landing roll from 1.15 Vs, grass, no brake', JSON.stringify(rollOut(1.15 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(1) : v))],
  ['turn radius at 45 deg bank at 50 percent speed m', f(V50 * V50 / (g * Math.tan(45 / DEG)), 2)],
  ['rest: nose share, loads main nose N', `${f(noseShare, 4)} ${f(loadMain)} ${f(loadNose)}`],
  ['   k main c main k nose m nose c nose', `${f(kMain, 0)} ${f(cMain, 2)} ${f(kNose, 0)} ${f(mNose, 4)} ${f(cNose, 2)}`],
  ['take off full throttle to 1.2 Vs', JSON.stringify(takeoff(1, 1.2 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['take off 55 percent (Model Aviation 50 to 60) to 1.2 Vs', JSON.stringify(takeoff(0.55, 1.2 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['full up rotates it at, full throttle', JSON.stringify(rotation(1), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['   at 55 percent', JSON.stringify(rotation(0.55), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['   at 55 percent, the roll to 1.6 Vs', JSON.stringify(takeoff(0.55, 1.6 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['   full throttle, the roll to 1.6 Vs', JSON.stringify(takeoff(1, 1.6 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['energy: chop at 75 percent level, to 1.3 Vs', JSON.stringify(slowDown(V75, 1.3 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(1) : v))],
  ['   glide from 30 m at 1.3 Vs: ground distance m', f(30 * ld(1.3 * Vs), 0)],
  ['stick for full up to trim 1.3 Vs', f(stickFor(0.1, throwE))],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(58)} ${v}`);
}
