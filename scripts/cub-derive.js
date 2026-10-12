/*
 * cub-derive.js: the arithmetic behind docs/CUB-STAGE1.md, from the
 * aircraft's published figures and the three view to every coefficient and
 * every derived band. It never loads the plant: this is what the plant is
 * checked against, so it has to stand apart from it. Harness arithmetic in
 * JS maths, which is allowed here because nothing it prints is hashed.
 * Run with npm run cub:derive.
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

import { groundTerms, wingGround } from './lib/groundeffect.js';
import { plateCnOf, wingDrag, wingLift } from './lib/liftcurve.js';
import { wingProp, SEAT_GATES, wingSeat } from './lib/propcurve.js';
import { planeTable, wash } from './lib/wash.js';

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
const prop = wingProp('FW_CUB1400');
/* The pack the gates seat, at the motor's law and the table's v_meas
 * (scripts/lib/propcurve.js wingSeat, plant_wing.c power_duty). */
const seat = wingSeat('FW_CUB1400');
/* d is the stick; the prop turns at the motor's steady share of it. */
const T = (V, d) => Math.max(0, prop.thrust(Ts, V, seat.at(SEAT_GATES, d, V).n));
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
  return { thetaDeg: p[0] * DEG, deDeg: p[1] * DEG, duty: p[2], ...modesAbout(x0, p[1], p[2]) };
}
/* The state the gate flies, C10 "sticks centred": the elevator at zero and
 * the throttle set, the speed, alpha and pitch free, so the excess thrust
 * goes into a steady climb rather than a trim. */
function centredModes(d) {
  const res = (p) => { const r = deriv([p[0], p[1], 0, p[2]], 0, d); return [r[0], r[1], r[2]]; };
  let p = [12, -0.5, 0.1];
  for (let it = 0; it < 60; it += 1) {
    const r = res(p);
    const J = [0, 1, 2].map((j) => { const pp = p.slice(); pp[j] += 1e-7; const rr = res(pp); return rr.map((v, i) => (v - r[i]) / 1e-7); });
    const dx = solve3([0, 1, 2].map((i) => [0, 1, 2].map((j) => J[j][i])), r.map((v) => -v));
    p = p.map((v, i) => v + dx[i]);
  }
  const x0 = [p[0], p[1], 0, p[2]];
  const V = Math.hypot(p[0], p[1]);
  const gammaRad = p[2] - Math.atan2(-p[1], p[0]);
  return { V, climb: V * Math.sin(gammaRad), thetaDeg: p[2] * DEG, ...modesAbout(x0, 0, d) };
}
function modesAbout(x0, de, d) {
  const A = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => {
    const xp = x0.slice(), xm = x0.slice(); xp[j] += 1e-6; xm[j] -= 1e-6;
    return (deriv(xp, de, d)[i] - deriv(xm, de, d)[i]) / 2e-6;
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
  return { phugoid: modes[0], short: modes[1] };
}

const f = (x, n = 3) => (x === null ? 'none' : Number(x).toFixed(n));
/*
 * C19, THE TAXI TURN: full right rudder on the tailwheel at a throttle, the
 * steady turn the plant settles into, on the plant's own coefficients
 * (plant_wing.c through scripts/lib/wash.js planeTable, so the derivation
 * reads what the plant flies) and its ground: the gear as drawn above,
 * rigid at the three point attitude; the tyres' side grip on Pacejka's
 * brush (sim.c wheel_side_cap, F / (mu N) = 1 - (1 - s)^3, s = tan(slip) /
 * 0.17633, plant.c TYRE_SLIDE), mu 0.70 on the mains and 0.60 on the
 * tailwheel, rolling resistance 0.08 of each wheel's load along its
 * heading (plant.c, the Cub's wheel table, docs/CUB-STAGE1.md); the
 * tailwheel steering one to one with the rudder, its heading laid on the
 * grass. The air at the state: the lift curve with the Reynolds number's
 * share of the stall (liftcurve.js), the ground effect (groundeffect.js),
 * the pitching moment and the stall's, the sideslip and rate derivatives
 * in the stability axes, the fin in the stalled wing's wake (TP-2011),
 * the prop's thrust, wash, swirl and P factor, the rudder in the wash
 * (wash.js wash), the fuselage's side drag and the prop's gyroscope.
 * Left out: the stalled strips' yaw, 0.001 N m at the taxi state against
 * the tyres' 0.4. Unknowns the speed, the sideslip and the turn rate;
 * the wheel loads from the vertical, pitch and roll balances at each.
 * Returns the radius the gate measures, the speed over the turn rate.
 */
const taxiTurn = (() => {
  const { fw, keep: swirlKeep } = planeTable('FW_CUB1400');
  const curve = { cla: fw.cl_alpha, claWing: fw.cl_alpha_wing, clmax: fw.cl_max, blend: fw.stall_blend, top: fw.stall_top, k: fw.stall_k, plateCn: plateCnOf(fw.span, fw.area) };
  const aStall = fw.cl_max / fw.cl_alpha_wing;
  const geo = { b: fw.span, S: fw.area, aw: fw.cl_alpha_wing, dd: fw.tail_deda, clmax: fw.cl_max, ...wingGround('FW_CUB1400') };
  const tailCl = (fw.cl_alpha - fw.cl_alpha_wing) / (1 - fw.tail_deda);
  const KEEP_DEG = [0, 4, 10, 15, 20, 25, 35], FIN_KEEP = [1.0, 0.704, 0.46, 0.38, 0.23, 0.08, 0.08];
  const keepAt = (past) => {
    if (!(past > 0)) return 1;
    for (let i = 0; i < 6; i += 1) if (past <= KEEP_DEG[i + 1]) return FIN_KEEP[i] + (FIN_KEEP[i + 1] - FIN_KEEP[i]) * (past - KEEP_DEG[i]) / (KEEP_DEG[i + 1] - KEEP_DEG[i]);
    return FIN_KEEP[6];
  };
  const smooth = (a0, a1, x) => (x <= a0 ? 0 : x >= a1 ? 1 : ((t) => t * t * (3 - 2 * t))((x - a0) / (a1 - a0)));
  const tyre = { muMain: 0.70, muTail: 0.60, muRoll: 0.08, slide: 0.17633, track: 0.119 };
  const brush = (t) => { const s = Math.min(1, Math.abs(t) / tyre.slide); return Math.sign(t) * (1 - Math.pow(1 - s, 3)); };
  const ct = Math.cos(th), st = Math.sin(th);
  const xw = (x, z) => x * ct - z * st, zw = (x, z) => x * st + z * ct;
  const xm = xw(mainX, mainZ), zm = zw(mainX, mainZ), xt = xw(tailX, tailZ), zt = zw(tailX, tailZ);
  const hWing = -zm + zw(geo.wing[0], geo.wing[1]);
  /* The air's force and moment, body frame, at the heading frame's speed
   * (uh, vh) and turn rate R, the throttle d and the rudder dr (the
   * plant's sign, trailing edge left positive). */
  function air(uh, vh, R, d, dr, ge) {
    const u = uh * ct, w = -uh * st, v = vh, p = R * st, r = R * ct;
    const V = Math.hypot(u, v, w), Vxz = Math.hypot(u, w), Vrate = Math.max(1, V);
    const qbar = 0.5 * rho * V * V;
    let alpha = Math.atan2(-w, u) - fw.alpha_zl;
    const sinB = -w / Vxz, cosB = u / Vxz;
    const fre = smooth(3e4, 5e4, V * fw.chord * rho / 1.789e-5);
    let gt = { dAlpha: 0, dTail: 0, clw: 0 };
    if (ge) {
      gt = groundTerms(geo, hWing, Math.atan2(-w, u), alpha);
      alpha += gt.dAlpha;
    }
    const lc = wingLift(curve, alpha, { fre });
    const clLin = fw.cl_alpha * alpha;
    const CL = lc.CL + tailCl * gt.dTail;
    const CD = wingDrag(curve, alpha, { cd0: fw.cd0, k: fw.k_induced, clLin }).CD - (1 - lc.sigma) * gt.clw * gt.dAlpha;
    const sinA = Math.sin(alpha), cosA = Math.cos(alpha);
    const b2 = (fw.k_induced * fw.cl_max ** 2 - curve.plateCn * Math.sin(aStall) ** 2) / Math.cos(aStall);
    const b2c = cosA > 0 ? b2 * cosA : 0;
    const cnSt = curve.plateCn * sinA + (lc.clSt - curve.plateCn * sinA * cosA) * cosA + b2c * sinA;
    const cmPost = lc.sigma * (((1 - lc.past) * fw.stall_arm_ac - lc.past * fw.stall_arm_cp) * cnSt - fw.stall_arm_ac * clLin - fw.stall_dw * (clLin - lc.clSt));
    const mAero = qbar * fw.area * fw.chord * (fw.cm_0 + fw.cm_alpha * alpha + tailCl * gt.dTail * geo.tail[0] / fw.chord + fre * lc.past * cmPost);
    const beta = Math.atan2(-v, Vxz);
    let clb = fw.cl_beta, cnb = fw.cn_beta, cydr = fw.cy_dr, cldr = fw.cl_dr, cndr = fw.cn_dr, clSep = 0;
    if (fw.cl_beta_wing !== 0 && fre > 0) {
      const rel = (Math.abs(alpha) - aStall) * DEG;
      const sepW = fre * (rel <= 0 ? 0 : rel >= 5 ? 1 : rel / 5);
      const fin = 1 - fre * (1 - keepAt(rel));
      clb += -fw.cl_beta_wing * sepW - fw.cl_beta_fin * (1 - fin);
      cnb += -fw.cn_beta_fin * (1 - fin);
      cydr *= fin; cldr *= fin; cndr *= fin;
      const KP = [0, 4, 10, 25, 40, 90], KK = [0.0010, 0.0035, 0.0030, 0.0025, 0.0015, 0.0015];
      let kk = 0;
      for (let i = 0; i < 5; i += 1) if (rel > KP[i] && rel <= KP[i + 1]) kk = KK[i] + (KK[i + 1] - KK[i]) * (rel - KP[i]) / (KP[i + 1] - KP[i]);
      const bd = Math.abs(beta) * DEG - 4;
      if (bd > 0) clSep = -Math.sign(beta) * Math.sign(alpha) * sepW * kk * bd;
    }
    const L = qbar * fw.area * CL, D = qbar * fw.area * CD;
    const F = [L * (-w / Vxz) - D * u / V, -D * v / V - qbar * fw.area * (fw.cy_beta * beta + cydr * dr), L * (u / Vxz) - D * w / V];
    const n = seat.at(SEAT_GATES, d, Math.max(0, u)).n;
    const thrust = prop.thrust(fw.thrust_static, Math.max(0, u), n);
    F[0] += thrust;
    const qAir = fw.torque_arm * fw.thrust_static * n * n * prop.cp(Math.max(0, u) / (fw.pitch_speed * n));
    let mSlip = 0, nSlip = 0, lSlip = 0;
    if (thrust > 0) {
      const ws = wash(fw, thrust, Math.max(0, u));
      const up = Math.min(ws.rw, fw.slip_hv[0]), dn = Math.min(ws.rw, fw.slip_hv[1]);
      const xa = -w * Math.cos(fw.slip_a0) - u * Math.sin(fw.slip_a0);
      const mdot = rho * Math.PI * fw.slip_r ** 2 * (Math.max(0, u) + ws.vi);
      const xb = -v - swirlKeep * qAir * (up - dn) / (mdot * ws.rw * ws.rw);
      const kh = rho * ws.vi * ws.fh, kv = rho * ws.vi * ws.fv, pv = ws.dp * ws.fv;
      F[2] += fw.area * kh * fw.slip_cl_a * xa;
      F[1] -= fw.area * (kv * fw.slip_cy_b * xb + pv * fw.cy_dr * dr);
      mSlip = fw.area * fw.chord * kh * fw.slip_cm_a * xa;
      nSlip = fw.area * fw.span * (kv * (fw.slip_cn_b * xb - fw.slip_cn_r * r * 0.5 * fw.span) + pv * fw.cn_dr * dr);
      lSlip = fw.area * fw.span * (kv * fw.slip_cl_b * xb + pv * fw.cl_dr * dr) + (1 - swirlKeep) * qAir;
    }
    F[1] -= 0.5 * rho * fw.side_cda * v * Math.abs(v);
    const b2v = fw.span / (2 * Vrate);
    const ps = p * cosB - r * sinB, rs = -r * cosB - p * sinB;
    const clSum = clb * beta + fw.cl_p * ps * b2v + clSep + fw.cl_r_per_cl * CL * rs * b2v + cldr * dr;
    const cnSum = cnb * beta + fw.cn_r * rs * b2v + fw.cn_p_per_cl * CL * ps * b2v + cndr * dr;
    const omegaM = 0.85 * n * fw.rpm_no_load * 2 * Math.PI / 60;
    const M = [
      qbar * fw.area * fw.span * (clSum * cosB - cnSum * sinB) - qAir + lSlip,
      -mAero + fw.thrust_z * thrust - mSlip - r * fw.j_prop * omegaM,
      -qbar * fw.area * fw.span * (cnSum * cosB + clSum * sinB) - nSlip + (omegaM > 0 ? fw.pfactor * thrust * -w / omegaM : 0),
    ];
    return { F, M };
  }
  const toH = (v) => [v[0] * ct - v[2] * st, v[1], v[0] * st + v[2] * ct];
  /* Steady: the heading frame's forces against the turn's acceleration,
   * the moment about the vertical nil. */
  function residual(uh, vh, R, d, dr, ge, out) {
    const a = air(uh, vh, R, d, dr, ge);
    const Fh = toH(a.F), Mh = toH(a.M);
    const hx0 = Math.cos(dr) * ct, hy0 = -Math.sin(dr), hl = Math.hypot(hx0, hy0);
    const hx = hx0 / hl, hy = hy0 / hl;
    let Fx = 0, res = null;
    for (let it = 0; it < 3; it += 1) {
      const Fz = W - Fh[2];
      const pitch = Mh[1] + zm * Fx - R * st * R * ct * (Ixx - Izz);
      const Nt = (pitch - xm * Fz) / (xt - xm), Nm = Fz - Nt;
      const Fm = -tyre.muMain * Nm * brush((vh + R * xm) / uh);
      const vtx = uh, vty = vh + R * xt;
      const Ft = -tyre.muTail * Nt * brush((-vtx * hy + vty * hx) / (vtx * hx + vty * hy));
      const split = -(Mh[0] - zm * Fm - zt * Ft * hx) / tyre.track;
      const rollM = -tyre.muRoll * Nm, rollT = -tyre.muRoll * Nt;
      Fx = rollM + rollT * hx - Ft * hy;
      res = [Fh[0] + Fx + m * R * vh, Fh[1] + Fm + Ft * hx + rollT * hy - m * R * uh,
        Mh[2] + xm * Fm + xt * (Ft * hx + rollT * hy) + tyre.track * tyre.muRoll * split];
      Object.assign(out, { Nm, Nt });
    }
    return res;
  }
  return (d, dr, ge, over = {}) => {
    const kept = { ...tyre };
    Object.assign(tyre, over);
    let x = [2.6, 0.3, -1.1];
    const out = {};
    const det3 = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    for (let k = 0; k < 60; k += 1) {
      const f0 = residual(...x, d, dr, ge, out);
      const A = [[], [], []];
      for (let j = 0; j < 3; j += 1) {
        const y = x.slice(); y[j] += 1e-6;
        residual(...y, d, dr, ge, {}).forEach((v, i) => { A[i][j] = (v - f0[i]) / 1e-6; });
      }
      const D = det3(A);
      x = x.map((v, j) => v - det3(A.map((row, i) => row.map((a, jj) => (jj === j ? f0[i] : a)))) / D);
    }
    const f = residual(...x, d, dr, ge, out);
    Object.assign(tyre, kept);
    if (!f.every((e) => Math.abs(e) < 1e-6)) return null;
    const V = Math.hypot(x[0], x[1]);
    return { V, R: x[2], radius: V / Math.abs(x[2]), ...out };
  };
})();

const rows = [
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, h_n, static margin', `${f(CLa)} ${f(hn)} ${f(SM)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde)} ${f(CLde)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ, Clp, Clδa', `${f(Clb, 4)} ${f(Clp)} ${f(Clda)}`],
  ['cl_beta_fin, cn_beta_fin: the fin\'s shares (docs/FLIGHTMODEL.md, sideslip past the stall)', `${f(-av * (Sv / S) * (zv / b), 4)} ${f(av * VV, 4)}`],
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
  ['C19 taxi radius m, the wheels alone', f(wheelbase / Math.tan(throwR), 2)],
  ...[0.28, 0.30, 0.32, 0.34, 0.35].map((d) => {
    const fr = taxiTurn(d, -throwR, false), gr = taxiTurn(d, -throwR, true);
    const s = (t) => (t ? `${f(t.radius, 3)} m at ${f(t.V, 2)} m/s, tail ${f(t.Nt, 3)} N` : 'none');
    return [`   steady taxi turn at ${d}: free air; the ground`, `${s(fr)}; ${s(gr)}`];
  }),
  ['   at 0.30 with the ground, a tenth more and less grip:', ['muTail', 'muMain'].map((k) => [0.9, 1.1].map((x) => f(taxiTurn(0.30, -throwR, true, { [k]: { muTail: 0.60, muMain: 0.70 }[k] * x }).radius, 3)).join(' ')).join('; ')],
];
const lc = centredModes(0.65);
rows.push(['C10 sticks centred at 65 percent: V, climb m/s, theta', `${f(lc.V, 2)} ${f(lc.climb, 2)} ${f(lc.thetaDeg, 2)}`]);
rows.push(['    phugoid s, zeta; short period s, zeta', `${f(lc.phugoid.period, 2)} ${f(lc.phugoid.zeta)}; ${f(lc.short.period, 2)} ${f(lc.short.zeta)}`]);
const lm = longitudinalModes(level(0.65));
rows.push(['    trimmed level at the 65 percent speed instead', `theta ${f(lm.thetaDeg, 2)} de ${f(lm.deDeg, 2)} duty ${f(lm.duty)}`]);
rows.push(['    phugoid s, zeta; short period s, zeta', `${f(lm.phugoid.period, 2)} ${f(lm.phugoid.zeta)}; ${f(lm.short.period, 2)} ${f(lm.short.zeta)}`]);
const lm10 = longitudinalModes(10);
rows.push(['C8 trim at 10 m/s', `theta ${f(lm10.thetaDeg, 2)} de ${f(lm10.deDeg, 2)} duty ${f(lm10.duty)}, stick ${f(stickFor(lm10.deDeg / DEG, throwE))}`]);
for (const [name, v] of rows) {
  console.log(`${name.padEnd(48)} ${v}`);
}
