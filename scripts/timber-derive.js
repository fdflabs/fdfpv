/*
 * timber-derive.js: the arithmetic behind docs/TIMBER-STAGE1.md, from the
 * aircraft's published figures and the photographs to every coefficient,
 * the flaps' and the slats' increments, and every derived band. It never
 * loads the plant: this is what the plant is checked against, so it has to
 * stand apart from it. Harness arithmetic in JS maths, which is allowed
 * here because nothing it prints is hashed. Run with npm run timber:derive.
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

/* The aircraft: E-flite's manual and listings, the review's bench figure,
 * and the drawn model (src/render/timbercraft.js). */
const b = 1.555, S = 0.361, m = 1.70, W = m * g, c = S / b, AR = b * b / S;
const CLmax = 1.15, CD0 = 0.042, e = 0.78, k = 1 / (Math.PI * e * AR);
const alphaZL = -5 / DEG;
const blend = 3 / DEG;
const Sh = 0.071, lh = 0.548, bh = 0.56, eta = 0.9, tauE = 0.65;
const Sv = 0.0314, lv = 0.625, zv = 0.09, arV = 1.8, tauR = 0.6, fusVol = 0.0073;
const gamma = 1.5 / DEG, taper = 1.0, y1 = 0.340, y2 = 0.700;
const chordFrac = 0.27;
const hCG = 0.060 / 0.240;
const Ts = 25.0, kv = 800, volts = 14.8, pitchIn = 7.5, propR = 0.1397;
const Ixx = 0.090, Iyy = 0.095, Izz = 0.170;
const throwA = 30 / DEG, throwE = 20 / DEG, throwR = 27 / DEG;
const muGrass = 0.08;

/* The flaps: E-flite's 20 and 35 mm at the trailing edge on a 64.8 mm
 * flap chord, from the fuselage's side at 0.052 m to 0.334 m each side. */
const cf = chordFrac * 0.240;
const flapHalf = Math.asin(0.020 / cf), flapFull = Math.asin(0.035 / cf);
const flapIn = 0.052, flapOut = 0.334;
const SfS = 2 * (flapOut - flapIn) * 0.240 / S;
/* The slats: from 0.10 to 0.69 m each side, c'/c 1.08. */
const slatIn = 0.10, slatOut = 0.69;
const SslatS = 2 * (slatOut - slatIn) * 0.240 / S;
const slatCd0 = 0.004;

/* The coefficients, Nelson's forms as for the Cub. */
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const deda = 2 * aw / (Math.PI * AR);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const fusCma = 0.006 * 0.114 * 0.114 * 1.04 / (c * S) * DEG; /* Raymer eq. 16.25, K_fus 0.006 per deg */
const hn = 0.25 + VH * eta * (at / aw) * (1 - deda) - fusCma / CLa;
const SM = hn - hCG, Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c, Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
const Vtrim = 13, CLtrim = 2 * W / (rho * Vtrim * Vtrim * S), Cm0 = -Cma * CLtrim / CLa;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const CYb = -av * Sv / S - 0.11;
const Cnb = av * VV - 1.3 * fusVol / (S * b);
const Cnr = -2 * av * VV * lv / b - (CD0 + slatCd0) / 4;
const Clb = -aw * gamma * (1 + 2 * taper) / (6 * (1 + taper)) - av * (Sv / S) * (zv / b);
const Clp = -aw * (1 + 3 * taper) / (12 * (1 + taper));
/* Thin aerofoil theory for a 27 percent trailing edge surface: the
 * effectiveness tau and the section's own pitching moment per radian. */
const thH = Math.acos(1 - 2 * (1 - chordFrac));
const tauTE = 1 - (thH - Math.sin(thH)) / Math.PI;
const cmTE = -0.5 * Math.sin(thH) * (1 - Math.cos(thH));
const etaAil = 0.80; /* the large deflection correction at 30 deg, plain */
const tauA = tauTE * etaAil;
const Clda = 2 * aw * tauA * 0.240 * (y2 * y2 - y1 * y1) / (2 * S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;

/*
 * The flap increments. Section lift per radian 2 pi tau, with the slotted
 * flap's large deflection factor, 0.90 at 18 deg and 0.75 at 33 (DATCOM's
 * curves for a single slotted flap, read to about ten percent), turned into
 * the wing's by the lift slope ratio and the flapped area; fitted as
 * a d + b d^2 through the two notches. CLmax: Raymer eq. 12.21, 0.9 x 1.3
 * (single slotted) x S_flapped/S at the landing deflection, linear in the
 * angle. Drag: Raymer eq. 12.61 for the profile, F 0.0074 for a slotted
 * flap, and the part span flap's induced drag, 0.14^2 dCL^2, fitted as
 * c d^2. Pitch: the section's own nose down moment, and the downwash the
 * flaps add at the tail, 1.5 times the whole wing's average for flaps on
 * the inner 43 percent with the tail behind them, which pushes the tail
 * down and the nose up.
 */
const flapCL = (d, etaF) => 2 * Math.PI * tauTE * etaF * d * (aw / (2 * Math.PI)) * SfS;
const dclHalf = flapCL(flapHalf, 0.90), dclFull = flapCL(flapFull, 0.75);
const clDf2 = (dclFull / flapFull - dclHalf / flapHalf) / (flapFull - flapHalf);
const clDf = dclHalf / flapHalf - clDf2 * flapHalf;
const dclmaxFull = 0.9 * 1.3 * SfS;
const clmaxDf = dclmaxFull / flapFull;
const flapCd = (d, dcl) => 0.0074 * chordFrac * SfS * Math.max(0, d * DEG - 10) + 0.14 * 0.14 * dcl * dcl;
const cdFull = flapCd(flapFull, dclFull), cdHalf = flapCd(flapHalf, dclHalf);
const cdDf2 = cdFull / (flapFull * flapFull);
const kDownwash = 1.5;
const cmSection = cmTE / (2 * Math.PI * tauTE); /* per unit section lift */
const cmPerDcl = cmSection + (hCG - 0.25) + eta * VH * at * kDownwash * 2 / (Math.PI * AR);
const cmRange = [1.25, 1.75].map((kk) => cmSection + (hCG - 0.25) + eta * VH * at * kk * 2 / (Math.PI * AR));
/* The radio's mix, E-flite's 30 percent of the elevator's travel down at
 * full flap, 16 at half, and what it would take to hold the trim at the
 * same lift: the flaps' moment, and the lower alpha the extra lift asks
 * for, at Cma. */
const mixFull = -0.30 * throwE, mixHalf = -0.16 * throwE;
const holdTrim = (dcl) => -(cmPerDcl * dcl + (-Cma) * (dcl / CLa)) / Cmde;
/* The slats: Raymer's 0.4 c'/c for a fixed slat, over the slatted span. */
const dclmaxSlat = 0.9 * 0.4 * 1.08 * SslatS;
const CLmaxSlat = CLmax + dclmaxSlat;

/* The motor. The review's 44 A and 660 W on 4S; the static thrust from
 * blade element coefficients for an 11 x 7.5 three blade, Ct 0.13 and
 * Cp 0.061, at the rpm that absorbs 80 percent of that power. */
const rpmNL = kv * volts, Vp = rpmNL / 60 * pitchIn * 0.0254 * 0.85;
const D5 = (2 * propR) ** 5, D4 = (2 * propR) ** 4;
const nStatic = Math.cbrt(0.8 * 660 / (0.061 * rho * D5));
const TsBlade = 0.13 * rho * nStatic * nStatic * D4;
const omegaLoaded = 0.85 * rpmNL * 2 * Math.PI / 60;
const discP = Math.pow(Ts, 1.5) / Math.sqrt(2 * rho * Math.PI * propR * propR);
const T = (V, d) => Math.max(0, Ts * d * d * (1 - V / (Vp * d)));

/* Drag polar and level speed, clean (flaps up) with the slats on. */
const cd0Clean = CD0 + slatCd0;
const D = (V, cd0 = cd0Clean) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (cd0 + k * CL * CL); };
const level = (d, cd0 = cd0Clean) => {
  let lo = 6, hi = 45;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid, cd0)) lo = mid; else hi = mid; }
  return lo;
};

/*
 * The plant's lift with its stall blend: linear up to the stall less the
 * blend, a flat plate at the zero lift line's angle beyond it plus the
 * blend, a cubic between. alpha is the zero lift line's; the flaps add
 * their lift and move the stall by their own share of alpha.
 */
function smooth(a0, a1, x) { if (x <= a0) return 0; if (x >= a1) return 1; const t = (x - a0) / (a1 - a0); return t * t * (3 - 2 * t); }
function aero(alpha, flapD, slats) {
  const dcl = clDf * flapD + clDf2 * flapD * flapD;
  const clmax = CLmax + clmaxDf * flapD + (slats ? dclmaxSlat : 0);
  const aS = clmax / CLa;
  const sig = smooth(aS - blend, aS + blend, Math.abs(alpha + dcl / CLa));
  const lin = CLa * alpha + dcl;
  const sa = Math.sin(alpha), ca = Math.cos(alpha);
  const cd0 = CD0 + (slats ? slatCd0 : 0) + cdDf2 * flapD * flapD;
  return {
    CL: (1 - sig) * lin + sig * 2 * sa * ca,
    CD: (1 - sig) * (cd0 + k * lin * lin) + sig * (cd0 + 2 * sa * sa),
    aStall: aS - dcl / CLa,
  };
}
/* The stall speed the gates measure: power off, the nose raised slowly,
 * the speed when alpha reaches the stall, in near level flight: lift equal
 * to weight with the blended CL there, and the formula's with CLmax. */
function stall(flapD, slats) {
  const a = aero(0, flapD, slats).aStall;
  const clm = CLmax + clmaxDf * flapD + (slats ? dclmaxSlat : 0);
  return { formula: Math.sqrt(2 * W / (rho * S * clm)), blended: Math.sqrt(2 * W / (rho * S * aero(a, flapD, slats).CL)), alphaStall: a };
}

/*
 * The slowest level flight, power on, with the flaps down: at each speed
 * the attitude and throttle that hold height, lift plus the thrust's
 * vertical share against the weight, thrust against drag, with alpha no
 * further than a blend short of the stall, which is where a pilot holding
 * height keeps it. The lowest speed with a throttle at or under full.
 */
function slowest(flapD, slats) {
  const aMax = aero(0, flapD, slats).aStall - blend;
  for (let V = 3; V < 12; V += 0.01) {
    const q = 0.5 * rho * V * V;
    for (let d = 0.05; d <= 1.0001; d += 0.005) {
      const { CL, CD } = aero(aMax, flapD, slats);
      const theta = aMax + alphaZL; /* level: pitch is alpha of the body */
      const t = T(V, d);
      const lift = q * S * CL + t * Math.sin(theta);
      const along = t * Math.cos(theta) - q * S * CD;
      if (lift >= W && along >= 0) {
        return { V, duty: d, pitchDeg: theta * DEG };
      }
    }
  }
  return null;
}

/*
 * The take off roll, in the Cub's two phases: full throttle from rest on
 * three points, the stick full forward, until the elevator and the wing's
 * own nose down moment lift the tail off the grass, which is when their
 * moment about the main wheels passes what the weight the wings are not
 * yet carrying holds the tail down with; then the tail held at the
 * pilot's attitude. There is no slipstream over the tail here to lift it
 * sooner (docs/CUB-STAGE1.md). Liftoff when the lift matches the weight,
 * in either phase; rolling resistance on the load left on the wheels.
 */
const mainAhead = 0.0911; /* the main wheels' contact ahead of the CG at rest, m */
function takeoff(flapD, slats, pitchDeg = 9) {
  let V = 0, x = 0, t = 0, vTail = null;
  const dt = 0.0005;
  const a3 = restPitch - alphaZL;
  const a2 = (pitchDeg / DEG) - alphaZL;
  const dcl = clDf * flapD + clDf2 * flapD * flapD;
  const de = Math.max(-throwE, -throwE + mixFull / flapFull * flapD);
  while (t < 20) {
    const q = 0.5 * rho * V * V;
    const threePoint = vTail === null;
    const { CL, CD } = aero(threePoint ? a3 : a2, flapD, slats);
    if (q * S * CL >= W) break;
    if (threePoint) {
      const cm = Cm0 + Cma * a3 + Cmde * de + cmPerDcl * dcl;
      if (-cm * q * S * c >= (W - q * S * CL) * mainAhead) vTail = V;
    }
    const acc = (T(V, 1) - q * S * CD - muGrass * Math.max(0, W - q * S * CL)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, V, vTail };
}

/*
 * The landing roll: from touchdown in the three point attitude with the
 * throttle closed and the stick held back, as the manual says to hold it
 * on grass, to a stop. The wing past its stall there and draggy with the
 * flaps down; rolling resistance the only brake, since the kit has none.
 */
const restPitch = 11.81 / DEG;
function landing(V0, flapD, slats) {
  let V = V0, x = 0, t = 0;
  const dt = 0.0005;
  const a = restPitch - alphaZL;
  const { CL, CD } = aero(a, flapD, slats);
  while (V > 0.02 && t < 60) {
    const q = 0.5 * rho * V * V;
    const acc = -(q * S * CD + muGrass * Math.max(0, W - q * S * CL)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, CL, CD };
}

/* The gear, as drawn: the rest contacts from TIMBER_DIMS, level frame,
 * body x forward and z up, and the loads by moments about them. */
const mainX = 0.0459, mainZ = -0.2259, tailX = -0.6531, tailZ = -0.0797;
const mainXw = mainX * Math.cos(restPitch) - mainZ * Math.sin(restPitch);
const tailXw = tailX * Math.cos(restPitch) - tailZ * Math.sin(restPitch);
const tailShare = mainXw / (mainXw - tailXw);
const wheelbase = mainXw - tailXw;
const mainLoad = W * (1 - tailShare) / 2, tailLoad = W * tailShare;
const kMain = 1500, kTail = 350;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mTail = (Iyy + m * mainXw * mainXw) / (wheelbase * wheelbase);
const cTail = 2 * 0.6 * Math.sqrt(kTail * mTail);

/* The phugoid, the Cub's four state model at the 65 percent speed. */
function deriv(x, de, d) {
  const [u, w, q, thp] = x;
  const V = Math.hypot(u, w);
  const a = Math.atan2(-w, u) - alphaZL;
  const qb = 0.5 * rho * V * V;
  const CL = CLa * a + CLde * de;
  const CD = cd0Clean + k * CL * CL;
  const L = qb * S * CL, Dr = qb * S * CD, Tt = T(Math.max(0, u), d);
  const Fx = L * (-w / V) - Dr * u / V + Tt;
  const Fz = L * (u / V) - Dr * w / V;
  const My = qb * S * c * (Cm0 + Cma * a + Cmq * q * c / (2 * V) + Cmde * de);
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
function trimAt(V) {
  const res = (p) => { const r = deriv([V * Math.cos(p[0]), -V * Math.sin(p[0]), 0, p[0]], p[1], p[2]); return [r[0], r[1], r[2]]; };
  let p = [0.02, 0, 0.6];
  for (let it = 0; it < 60; it += 1) {
    const r = res(p);
    const J = [0, 1, 2].map((j) => { const pp = p.slice(); pp[j] += 1e-7; const rr = res(pp); return rr.map((v, i) => (v - r[i]) / 1e-7); });
    const dx = solve3([0, 1, 2].map((i) => [0, 1, 2].map((j) => J[j][i])), r.map((v) => -v));
    p = p.map((v, i) => v + dx[i]);
  }
  return { thetaDeg: p[0] * DEG, deDeg: p[1] * DEG, duty: p[2] };
}

const f = (x, n = 3) => (x === null ? 'none' : Number(x).toFixed(n));
const J = (o, n = 3) => JSON.stringify(o, (kk, v) => (typeof v === 'number' ? +v.toFixed(n) : v));
const rows = [
  ['AR, c, k, W/S N/m2', `${f(AR)} ${f(c, 4)} ${f(k, 4)} ${f(W / S, 1)}`],
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, h_n, static margin (fuselage dh)', `${f(CLa)} ${f(hn)} ${f(SM)} (${f(fusCma / CLa, 4)})`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde)} ${f(CLde)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ, Clp, Clδa (tau)', `${f(Clb, 4)} ${f(Clp)} ${f(Clda)} (${f(tauA)})`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['27 percent surface: tau, cm per rad', `${f(tauTE)} ${f(cmTE)}`],
  ['flap chord m, half, full deg, S_f/S', `${f(cf, 4)} ${f(flapHalf * DEG, 2)} ${f(flapFull * DEG, 2)} ${f(SfS)}`],
  ['flap dCL half, full; fit a, b', `${f(dclHalf)} ${f(dclFull)}; ${f(clDf, 4)} ${f(clDf2, 4)}`],
  ['flap dCLmax full, per rad', `${f(dclmaxFull)} ${f(clmaxDf, 4)}`],
  ['flap dCD half, full; per rad2', `${f(cdHalf, 4)} ${f(cdFull, 4)}; ${f(cdDf2, 4)}`],
  ['flap Cm per dCL (k 1.25 to 1.75)', `${f(cmPerDcl, 4)} (${f(cmRange[0], 4)} to ${f(cmRange[1], 4)})`],
  ['flap dCm half, full', `${f(cmPerDcl * dclHalf, 4)} ${f(cmPerDcl * dclFull, 4)}`],
  ['flap dCm full band (k 1.25 to 1.75)', `${f(cmRange[0] * dclFull, 4)} to ${f(cmRange[1] * dclFull, 4)}`],
  ['mix: manual half, full deg; hold trim half, full deg', `${f(mixHalf * DEG, 2)} ${f(mixFull * DEG, 2)}; ${f(holdTrim(dclHalf) * DEG, 2)} ${f(holdTrim(dclFull) * DEG, 2)}`],
  ['slats: S/S, dCLmax, CLmax with', `${f(SslatS)} ${f(dclmaxSlat)} ${f(CLmaxSlat)}`],
  ['motor: rpm NL, Vp, static rev/s, blade T', `${f(rpmNL, 0)} ${f(Vp, 2)} ${f(nStatic, 1)} ${f(TsBlade, 2)}`],
  ['disc power W, torque N m, arm m, electrical N m', `${f(discP, 1)} ${f(discP / omegaLoaded)} ${f(discP / omegaLoaded / Ts, 4)} ${f(0.8 * 660 / omegaLoaded)}`],
  ['T1 cruise, level at 75 percent, flaps up', f(level(0.75), 2)],
  ['   level at 65, 50 percent; top', `${f(level(0.65), 2)} ${f(level(0.5), 2)}; ${f(level(1), 2)}`],
  ['T2 stall, slats, flaps up', J(stall(0, true))],
  ['T3 stall, no slats, flaps up', J(stall(0, false))],
  ['T4 stall, slats, flaps full', J(stall(flapFull, true))],
  ['   stall, slats, flaps half', J(stall(flapHalf, true))],
  ['T5 slowest level, flaps full, slats', J(slowest(flapFull, true))],
  ['   slowest level, flaps up, slats', J(slowest(0, true))],
  ['T6 pb/2V, deg/s at 15 m/s', `${f(Clda * throwA / -Clp)} ${f(Clda * throwA / -Clp * 2 * 15 / b * DEG, 0)}`],
  ['T9 rest: tail share, wheelbase m, loads N', `${f(tailShare, 4)} ${f(wheelbase, 3)} ${f(mainLoad, 2)} ${f(tailLoad, 2)}`],
  ['   gear: main c, tail m_eff, tail c', `${f(cMain, 1)} ${f(mTail, 3)} ${f(cTail, 1)}`],
  ['   static deflection mm main, tail', `${f(mainLoad / kMain * 1000, 2)} ${f(tailLoad / kTail * 1000, 2)}`],
  ['T10 take off, flaps full, tail up to 9 deg', J(takeoff(flapFull, true), 2)],
  ['T11 take off, flaps up, tail up to 9 deg', J(takeoff(0, true), 2)],
  ['    take off, flaps half, tail up to 9 deg', J(takeoff(flapHalf, true), 2)],
  ['    the tail at 7 deg: full, up', J(takeoff(flapFull, true, 7), 2) + ' ' + J(takeoff(0, true, 7), 2)],
  ['T12 landing roll, flaps full, from 1.1 Vs', J(landing(1.1 * stall(flapFull, true).formula, flapFull, true), 2)],
  ['    landing roll, flaps full, from 7 m/s', J(landing(7, flapFull, true), 2)],
  ['T13 taxi radius m', f(wheelbase / Math.tan(throwR), 2)],
];
const tr = trimAt(level(0.75));
rows.push(['trim at the 75 percent speed', `theta ${f(tr.thetaDeg, 2)} de ${f(tr.deDeg, 2)} duty ${f(tr.duty)}`]);
for (const [name, v] of rows) {
  console.log(`${name.padEnd(52)} ${v}`);
}
