/*
 * cub-derive.js: the arithmetic behind docs/CUB-STAGE1.md, from the
 * aircraft's published figures and the three view to every coefficient and
 * every derived band. It never loads the plant: this is what the plant is
 * checked against, so it has to stand apart from it. Harness arithmetic in
 * JS maths, which is allowed here because nothing it prints is hashed.
 * Run with npm run cub:derive.
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

/* The aircraft: FMS manual, the bench figure for the motor, the three view. */
const b = 1.4, S = 0.28, m = 1.32, W = m * g, c = S / b, AR = b * b / S;
const CLmax = 1.15, CD0 = 0.050, e = 0.75, k = 1 / (Math.PI * e * AR);
const alphaZL = -5 / DEG;
const Sh = 0.0470, lh = 0.517, bh = 0.38, eta = 0.9, tauE = 0.6;
const Sv = 0.020, lv = 0.567, zv = 0.104, arV = 1.5, tauR = 0.55, fusVol = 0.0091;
const gamma = 3.5 / DEG, taper = 1.0, tauA = 0.45, y1 = 0.28, y2 = 0.66;
const hCG = 0.30;
const thrustZ = 0.002;
const Ts = 13.5, kv = 850, volts = 11.1, pitchIn = 7, propR = 0.1397;
const Ixx = 0.060, Iyy = 0.055, Izz = 0.100;
const throwA = 18 / DEG, throwE = 15 / DEG, throwR = 15 / DEG;
const muGrass = 0.08, muAsphalt = 0.025;

/* The coefficients. */
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const deda = 2 * aw / (Math.PI * AR);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const hn = 0.25 + VH * eta * (at / aw) * (1 - deda);
const SM = hn - hCG, Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c, Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
const Vtrim = 12, CLtrim = 2 * W / (rho * Vtrim * Vtrim * S), Cm0 = -Cma * CLtrim / CLa;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const CYb = -av * Sv / S - 0.10;
const Cnb = av * VV - 1.3 * fusVol / (S * b);
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
const Clb = -aw * gamma * (1 + 2 * taper) / (6 * (1 + taper)) - av * (Sv / S) * (zv / b);
const Clp = -aw * (1 + 3 * taper) / (12 * (1 + taper));
const Clda = 2 * aw * tauA * c * (y2 * y2 - y1 * y1) / (2 * S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;

/* The motor. */
const rpmNL = kv * volts, Vp = rpmNL / 60 * pitchIn * 0.0254 * 0.85;
const omegaLoaded = 0.85 * rpmNL * 2 * Math.PI / 60;
const T = (V, d) => Math.max(0, Ts * d * d * (1 - V / (Vp * d)));
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const level = (d) => {
  let lo = 6, hi = 40;
  if (T(lo, d) < D(lo) && T(9, d) < D(9)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
let best = { vz: -1, V: 0 };
for (let V = Vs; V < 20; V += 0.05) { const vz = (T(V, 1) - D(V)) * V / W; if (vz > best.vz) best = { vz, V }; }

const discP = Math.pow(Ts, 1.5) / Math.sqrt(2 * rho * Math.PI * propR * propR);

/* Lateral: the Dutch roll step's peak rate and the dihedral's roll. */
const V12 = 12, q12 = 0.5 * rho * V12 * V12;
const wnDR = Math.sqrt(q12 * S * b * Cnb / Izz);
const zetaDR = (-Cnr * (b / (2 * V12)) * q12 * S * b / Izz - CYb * q12 * S / (m * V12)) / (2 * wnDR);
const betaSS = -Cndr * throwR / Cnb;
const rPeak = betaSS * wnDR * Math.exp(-zetaDR / Math.sqrt(1 - zetaDR * zetaDR) * Math.atan2(Math.sqrt(1 - zetaDR * zetaDR), zetaDR));
const rudderRoll = Math.abs(Clb * betaSS / Clp) * (2 * V12 / b);

/* P factor at full throttle in level flight at 1.1 Vs: the body alpha that
 * level flight needs there, and the thrust at that speed. */
function pfactorAt(V) {
  const thrust = T(V, 1);
  const CL = W / (0.5 * rho * V * V * S);
  const alphaBody = CL / CLa + alphaZL;
  return { V, thrust, alphaBodyDeg: alphaBody * DEG, N: 1.6 * thrust * V * Math.sin(alphaBody) / omegaLoaded };
}

/* The stick that gives a surface angle through the expo, 0.3 x^3 + 0.7 x. */
function stickFor(delta, travel) {
  const want = delta / travel;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (0.3 * mid * mid * mid + 0.7 * mid < want) lo = mid; else hi = mid; }
  return lo;
}

/* The take off roll: three point until the tail comes up, then tail up at
 * 2 deg of pitch (7 deg of zero lift angle) to the rotation. Three point
 * the wing is past its stall and the plant's flat plate holds. */
const threePointDeg = 11.0;
function takeoff(mu, Vtail, Vlof) {
  let V = 0, x = 0, t = 0;
  const dt = 0.001;
  const a3 = (threePointDeg - alphaZL * DEG) / DEG;
  while (V < Vlof && t < 30) {
    const q = 0.5 * rho * V * V;
    let CLg, CDg;
    if (V < Vtail) { CLg = 2 * Math.sin(a3) * Math.cos(a3); CDg = CD0 + 2 * Math.sin(a3) ** 2; }
    else { CLg = CLa * (7 / DEG); CDg = CD0 + k * CLg * CLg; }
    const a = (T(V, 1) - q * S * CDg - mu * Math.max(0, W - q * S * CLg)) / m;
    V += a * dt; x += V * dt; t += dt;
  }
  return { x, t, V };
}
const a3 = (threePointDeg - alphaZL * DEG) / DEG;
const CL3 = 2 * Math.sin(a3) * Math.cos(a3);
const V3 = Math.sqrt(2 * W / (rho * S * CL3));

/* The gear as drawn (src/render/cubcraft.js), at rest: loads by moments. */
const mainX = 0.0683, mainZ = -0.1624, tailX = -0.5983, tailZ = -0.0328;
const th = threePointDeg / DEG;
const mainXw = mainX * Math.cos(th) - mainZ * Math.sin(th);
const tailXw = tailX * Math.cos(th) - tailZ * Math.sin(th);
const tailShare = mainXw / (mainXw - tailXw);
const wheelbase = mainXw - tailXw;

/* The phugoid: the plant's longitudinal equations, trimmed level at the
 * speed 65 percent settles at, linearised, roots of the quartic. */
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
  let p = [0.02, 0, 0.6];
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
  /* Faddeev LeVerrier for the characteristic polynomial, then Durand Kerner. */
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
  const cd = (x, y) => { const d = y.re * y.re + y.im * y.im; return { re: (x.re * y.re + x.im * y.im) / d, im: (x.im * y.re - x.re * y.im) / d }; };
  const pe = (z) => coef.reduce((acc, cf) => { const t = cm(acc, z); return { re: t.re + cf, im: t.im }; }, { re: 0, im: 0 });
  let roots = [0, 1, 2, 3].map((i) => ({ re: Math.cos(i * 1.3 + 0.4), im: Math.sin(i * 1.3 + 0.4) }));
  for (let it = 0; it < 500; it += 1) {
    roots = roots.map((z, i) => { let den = { re: 1, im: 0 }; roots.forEach((w, j) => { if (j !== i) den = cm(den, cs(z, w)); }); return cs(z, cd(pe(z), den)); });
  }
  const modes = roots.filter((r) => r.im > 1e-6).map((r) => { const wn = Math.hypot(r.re, r.im); return { period: 2 * Math.PI / r.im, zeta: -r.re / wn }; });
  modes.sort((x, y) => y.period - x.period);
  return { thetaDeg: p[0] * DEG, deDeg: p[1] * DEG, duty: p[2], phugoid: modes[0], short: modes[1] };
}

const f = (x, n = 3) => (x === null ? 'none' : Number(x).toFixed(n));
const rows = [
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, h_n, static margin', `${f(CLa)} ${f(hn)} ${f(SM)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde)} ${f(CLde)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ, Clp, Clδa', `${f(Clb, 4)} ${f(Clp)} ${f(Clda)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['k, rpm no load, V_p', `${f(k, 4)} ${f(rpmNL, 0)} ${f(Vp, 2)}`],
  ['disc power W, torque N m, arm m, electrical N m', `${f(discP, 1)} ${f(discP / omegaLoaded)} ${f(discP / omegaLoaded / Ts, 4)} ${f(0.8 * 295 / omegaLoaded)}`],
  ['C1 level at 75 percent m/s', f(level(0.75), 2)],
  ['   level at 65, 60, 50 percent', `${f(level(0.65), 2)} ${f(level(0.6), 2)} ${f(level(0.5), 2)}`],
  ['C2 stall m/s', f(Vs, 2)],
  ['C3 glide at 10 m/s, best, at', `${f(ld(10), 2)} ${f(LDmax, 2)} ${f(Vmd, 2)}`],
  ['C4 top m/s', f(level(1), 2)],
  ['C5 pb/2V, deg/s at 12 m/s', `${f(Clda * throwA / -Clp)} ${f(Clda * throwA / -Clp * 2 * 12 / b * DEG, 0)}`],
  ['C7 best climb m/s at m/s', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['C11 sideslip deg', f(betaSS * DEG, 1)],
  ['C12 Dutch roll wn, zeta, peak r deg/s', `${f(wnDR, 2)} ${f(zetaDR, 3)} ${f(rPeak * DEG, 1)}`],
  ['C13 steady roll from rudder deg/s', f(rudderRoll * DEG, 1)],
  ['C15 P factor, level at 1.1 Vs', JSON.stringify(pfactorAt(1.1 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(4) : v))],
  ['C16 tail share, wheelbase m', `${f(tailShare, 4)} ${f(wheelbase, 3)}`],
  ['C17 grass, tail up at 7, rotate 1.1 Vs', JSON.stringify(takeoff(muGrass, 7, 1.1 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['    the tail up at 8 instead', JSON.stringify(takeoff(muGrass, 8, 1.1 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['    asphalt', JSON.stringify(takeoff(muAsphalt, 7, 1.1 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['    three point, hands off: CL, liftoff', `${f(CL3)} ${f(V3, 2)} ${JSON.stringify(takeoff(muGrass, 99, V3), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))}`],
  ['C19 taxi radius m', f(wheelbase / Math.tan(throwR), 2)],
];
const lm = longitudinalModes(level(0.65));
rows.push(['C10 trim at the 65 percent speed', `theta ${f(lm.thetaDeg, 2)} de ${f(lm.deDeg, 2)} duty ${f(lm.duty)}`]);
rows.push(['    phugoid s, zeta; short period s, zeta', `${f(lm.phugoid.period, 2)} ${f(lm.phugoid.zeta)}; ${f(lm.short.period, 2)} ${f(lm.short.zeta)}`]);
const lm10 = longitudinalModes(10);
rows.push(['C8 trim at 10 m/s', `theta ${f(lm10.thetaDeg, 2)} de ${f(lm10.deDeg, 2)} duty ${f(lm10.duty)}, stick ${f(stickFor(lm10.deDeg / DEG, throwE))}`]);
for (const [name, v] of rows) {
  console.log(`${name.padEnd(48)} ${v}`);
}
