/*
 * floats-derive.js: the arithmetic behind docs/FLOATS-STAGE1.md. From the
 * float geometry, the aircraft's own tables (docs/TIMBER-STAGE1.md,
 * docs/CUB-STAGE1.md) and the planing literature to the mass, the air's
 * increments, the hydrostatics, the planing and every derived band. It
 * never loads the plant, and it does not use the plant's strip model for
 * the planing: the planing is Savitsky's empirical method (Savitsky 1964,
 * "Hydrodynamic Design of Planing Hulls", Marine Technology 1(1)), fitted
 * to towing tank data and independent of the momentum theory the plant
 * integrates, which is what makes it a check. Harness arithmetic in JS
 * maths, allowed here because nothing it prints is hashed. Run with
 * npm run floats:derive.
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
const g = 9.81;
const rhoA = 1.225;
const rhoW = 1000;
const nu = 1.0e-6;

/*
 * The two aircraft. `air` is the wheeled aircraft's table as its own
 * stage 1 derives it; `floats` the float set, ESTIMATED as the document
 * says; `set` the float set's mass and where it hangs, in the WHEELED
 * aircraft's frame (CG at the origin).
 */
const PLANES = {
  timber: {
    name: 'Turbo Timber on floats',
    m0: 1.70, I0: [0.090, 0.095, 0.170],
    S: 0.361, b: 1.555, c: 0.2322, CD0: 0.042, CYb: -0.369, Cnb: 0.087, Clb: -0.047,
    CLa: 5.25, CLde: -0.498, Cm0: 0.0853, Cma: -1.004, Cmde: 1.175, alphaZL: -5 / DEG, throwE: 20 / DEG,
    flapHalf: 0.31376497222433070, clDf: 1.2391, clDf2: -0.6681, cmDclF: 0.0940, deDf: -0.183531, CLmax: 1.15, slatDclmax: 0.305, clmaxDf: 0.7689,
    Ts: 25.0, Vp: 31.95, thrustZ0: 0.0, wheelsCD: 0.0062,
    set: { floatMass: 0.097, floatY: 0.18, floatZ: -0.234, floatL: 0.72, strutMass: 0.04, strutY: 0.12, strutZ: -0.15 },
    /* The float, in the wheeled aircraft's frame. */
    fl: { y: 0.18, xBow: 0.33, xKnee: 0.14, xStep: -0.05, xStern: -0.39, zKeel0: -0.275, bowRise: 0.060, stepH: 0.010, aftSlope: Math.tan(8 / DEG), depth: 0.075, beam: 0.085, deadrise: 15 / DEG },
    struts: { frontal: 0.0053, cd: 1.0 },
    propTip0: -0.1397,
    rudder: { x: -0.38, z0: -0.2436, span: 0.05, chord: 0.035 },
  },
  cub: {
    name: 'Piper Cub on floats',
    m0: 1.32, I0: [0.060, 0.055, 0.100],
    S: 0.28, b: 1.40, c: 0.20, CD0: 0.050, CYb: -0.29, Cnb: 0.048, Clb: -0.089,
    CLa: 5.21, CLde: -0.345, Cm0: 0.062, Cma: -0.62, Cmde: 0.89, alphaZL: -5 / DEG, throwE: 15 / DEG,
    flapHalf: 0, clDf: 0, clDf2: 0, cmDclF: 0, deDf: 0, CLmax: 1.15, slatDclmax: 0, clmaxDf: 0,
    Ts: 13.5, Vp: 23.8, thrustZ0: 0.002, wheelsCD: 0.004,
    set: { floatMass: 0.091, floatY: 0.15, floatZ: -0.201, floatL: 0.72, strutMass: 0.03, strutY: 0.10, strutZ: -0.13 },
    fl: { y: 0.15, xBow: 0.27, xKnee: 0.09, xStep: -0.04, xStern: -0.45, zKeel0: -0.245, bowRise: 0.064, stepH: 0.009, aftSlope: Math.tan(8 / DEG), depth: 0.080, beam: 0.080, deadrise: 15 / DEG },
    struts: { frontal: 0.0040, cd: 1.0 },
    propTip0: 0.002 - 0.1397,
    rudder: { x: -0.44, z0: -0.2023, span: 0.045, chord: 0.030 },
  },
};

const out = {};
const pr = (...a) => console.log(...a);

for (const [key, P] of Object.entries(PLANES)) {
  pr(`\n=== ${P.name}`);
  const s = P.set;
  const m = P.m0 + 2 * s.floatMass + s.strutMass;
  const W = m * g;
  const dz = (2 * s.floatMass * s.floatZ + s.strutMass * s.strutZ) / m;
  let [Ixx, Iyy, Izz] = P.I0;
  Ixx += P.m0 * dz * dz;
  Iyy += P.m0 * dz * dz;
  for (let k = 0; k < 2; k += 1) {
    Ixx += s.floatMass * (s.floatY * s.floatY + (s.floatZ - dz) ** 2);
    Iyy += s.floatMass * (s.floatL * s.floatL / 12 + (s.floatZ - dz) ** 2);
    Izz += s.floatMass * (s.floatL * s.floatL / 12 + s.floatY * s.floatY);
  }
  Ixx += s.strutMass * (s.strutY * s.strutY + (s.strutZ - dz) ** 2);
  Iyy += s.strutMass * (s.strutZ - dz) ** 2;
  Izz += s.strutMass * s.strutY * s.strutY;
  pr(`mass ${m.toFixed(3)} kg, W ${W.toFixed(2)} N; CG ${(dz * 1000).toFixed(1)} mm lower; Ixx ${Ixx.toFixed(4)} Iyy ${Iyy.toFixed(4)} Izz ${Izz.toFixed(4)}`);

  /* The float, in the new frame. */
  const F = { ...P.fl, zKeel: P.fl.zKeel0 - dz };
  const tanDr = Math.tan(F.deadrise);
  const keel = (x) => (x > F.xKnee ? F.zKeel + F.bowRise * (x - F.xKnee) / (F.xBow - F.xKnee)
    : x >= F.xStep ? F.zKeel : F.zKeel + F.stepH + (F.xStep - x) * F.aftSlope);
  const hc = F.beam / 2 * tanDr;
  const section = (d) => (d <= hc ? d * d / tanDr : hc * hc / tanDr + F.beam * (d - hc));
  pr(`float: ${F.xBow - F.xStern} m long, ${F.beam} m beam, ${F.depth} m deep, deadrise ${(F.deadrise * DEG).toFixed(0)} deg, forebody keel ${F.zKeel.toFixed(4)} m under the CG, step ${F.xStep} m`);

  /* The air: the floats' wetted area at the equivalent skin friction
   * coefficient, the struts and spreaders on their frontal area, less the
   * wheels; Nelson eq. 2.72 for the floats' volume in yaw. */
  const fineN = 4000;
  let vol = 0;
  let wet = 0;
  for (let i = 0; i < fineN; i += 1) {
    const x = F.xBow - (i + 0.5) * (F.xBow - F.xStern) / fineN;
    const dx = (F.xBow - F.xStern) / fineN;
    const cap = F.zKeel + F.depth - keel(x);
    vol += section(cap) * dx;
    const girth = 2 * hc / Math.sin(F.deadrise) + 2 * (cap - hc) + F.beam;
    wet += girth * dx;
  }
  const floatsVol = 2 * vol;
  const dCD0 = 0.009 * 2 * wet / P.S + P.struts.frontal * P.struts.cd / P.S - P.wheelsCD;
  const sideArea = 2 * (F.xBow - F.xStern) * F.depth * 0.8;
  const dCYb = -0.32 * sideArea / P.S;
  const dCnb = -1.3 * floatsVol / (P.S * P.b);
  const zSide = F.zKeel + F.depth / 2;
  const dClb = dCYb * zSide / P.b;
  const thrustZ = P.thrustZ0 - dz;
  pr(`floats' volume ${(floatsVol * 1000).toFixed(2)} l, reserve ${(floatsVol * rhoW * g / W).toFixed(2)} x the weight; wetted area ${(2 * wet).toFixed(3)} m2`);
  pr(`dCD0 ${dCD0.toFixed(4)} -> CD0 ${(P.CD0 + dCD0).toFixed(4)}; CYb ${(P.CYb + dCYb).toFixed(3)} (${dCYb.toFixed(3)}); Cnb ${(P.Cnb + dCnb).toFixed(4)} (${dCnb.toFixed(4)}); Clb ${(P.Clb + dClb).toFixed(4)} (${dClb.toFixed(4)}); thrust line ${(thrustZ * 1000).toFixed(1)} mm over the CG`);

  /* HYDROSTATICS: heave and trim so the buoyancy carries the weight and
   * its centre is under the CG, on 4000 strips per float. Pitch theta
   * nose up positive; a body point (x, z) is at world height
   * zc + x sin(theta) + z cos(theta). */
  const hydro = (zc, th) => {
    let B = 0;
    let Mx = 0;
    const n = 4000;
    const dx = (F.xBow - F.xStern) / n;
    for (let i = 0; i < n; i += 1) {
      const x = F.xBow - (i + 0.5) * dx;
      const zk = keel(x);
      const zw = zc + x * Math.sin(th) + zk * Math.cos(th);
      const h = -zw;
      if (h <= 0) continue;
      const d = Math.min(h * Math.cos(th), F.zKeel + F.depth - zk);
      const f = rhoW * g * section(d) * dx * 2;
      B += f;
      Mx += f * (x * Math.cos(th) - zk * Math.sin(th));
    }
    return { B, xb: Mx / B };
  };
  /* Nested bisection: the heave that carries the weight at a trim, and
   * the trim that puts the centre of buoyancy under the CG, which moves
   * aft as the nose comes up. */
  const heaveFor = (theta) => {
    let lo = -0.5;
    let hi = 0.5;
    for (let k = 0; k < 60; k += 1) {
      const mid = (lo + hi) / 2;
      if (hydro(mid, theta).B > W) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  let tlo = -15 / DEG;
  let thi = 15 / DEG;
  for (let k = 0; k < 50; k += 1) {
    const mid = (tlo + thi) / 2;
    if (hydro(heaveFor(mid), mid).xb > 0) tlo = mid; else thi = mid;
  }
  const th = (tlo + thi) / 2;
  const zc = heaveFor(th);
  const hs = hydro(zc, th);
  const stepDraft = -(zc + F.xStep * Math.sin(th) + F.zKeel * Math.cos(th));
  const cgOver = zc;
  const propClear = zc + 0.29 * Math.sin(th) + (P.propTip0 - dz) * Math.cos(th);
  const stepAngle = Math.atan2(-F.xStep, -F.zKeel) * DEG;
  pr(`at rest on still water: trim ${(th * DEG).toFixed(2)} deg nose up, the CG ${cgOver.toFixed(4)} m over the water, the keel at the step ${(stepDraft * 1000).toFixed(1)} mm under it; the prop's tip ${(propClear * 1000).toFixed(0)} mm over it; buoyancy ${hs.B.toFixed(2)} N, its centre ${(hs.xb * 1000).toFixed(2)} mm from the CG`);
  pr(`the step ${stepAngle.toFixed(1)} deg behind the CG's vertical`);

  /* Waterplane, the centre of buoyancy's height and the metacentric
   * stiffnesses, the natural periods, and the quasi static response to a
   * long swell. The aircraft's CG stands high over its centre of
   * buoyancy, BG, so the waterplane's stiffness rho g I is less the
   * weight times BG, the metacentric height's (Rawson and Tupper, Basic
   * Ship Theory, ch. 4): pitched by the swell's slope, the weight's own
   * moment helps the swell along, and the aircraft pitches further than
   * the slope by rho g I / (rho g I - W BG). */
  let Awp = 0;
  let Iwp = 0;
  let Ixwp = 0;
  let zbSum = 0;
  let volSum = 0;
  {
    const n = 4000;
    const dx = (F.xBow - F.xStern) / n;
    for (let i = 0; i < n; i += 1) {
      const x = F.xBow - (i + 0.5) * dx;
      const zkw = zc + x * Math.sin(th) + keel(x) * Math.cos(th);
      if (zkw >= 0) continue;
      const d = Math.min(-zkw * Math.cos(th), F.zKeel + F.depth - keel(x));
      const width = d <= hc ? 2 * d / tanDr : F.beam;
      /* The section's first moment about its keel, V then walls. */
      const mom = d <= hc ? 2 * d * d * d / (3 * tanDr) : 2 * hc * hc * hc / (3 * tanDr) + F.beam * (d * d - hc * hc) / 2;
      const a = section(d);
      zbSum += 2 * a * dx * (zkw + mom / a);
      volSum += 2 * a * dx;
      Awp += 2 * width * dx;
      Iwp += 2 * width * dx * (x - hs.xb) ** 2;
      Ixwp += 2 * width * dx * F.y * F.y;
    }
  }
  const BG = zc - zbSum / volSum;
  const kPitch = rhoW * g * Iwp - W * BG;
  const kRoll = rhoW * g * Ixwp - W * BG;
  const wHeave = Math.sqrt(rhoW * g * Awp / m);
  const wPitch = Math.sqrt(kPitch / Iyy);
  const wRoll = Math.sqrt(kRoll / Ixx);
  pr(`waterplane ${Awp.toFixed(4)} m2; BG ${BG.toFixed(4)} m; pitch stiffness ${(rhoW * g * Iwp).toFixed(2)} less ${(W * BG).toFixed(2)} N m/rad, roll ${(rhoW * g * Ixwp).toFixed(2)} less the same`);
  pr(`natural periods: heave ${(2 * Math.PI / wHeave).toFixed(3)} s, pitch ${(2 * Math.PI / wPitch).toFixed(3)} s, roll ${(2 * Math.PI / wRoll).toFixed(3)} s (no added mass, so short)`);
  const swell = { H: 0.3, T: 2.5 };
  const om = 2 * Math.PI / swell.T;
  const kw = om * om / g;
  const Lwl = 0.8 * (F.xBow - F.xStern);
  const xk = kw * Lwl / 2;
  const heaveF = Math.sin(xk) / xk / Math.abs(1 - (om / wHeave) ** 2);
  const pitchF = 3 * (Math.sin(xk) - xk * Math.cos(xk)) / xk ** 3 * (rhoW * g * Iwp / kPitch) / Math.abs(1 - (om / wPitch) ** 2);
  const rollF = (rhoW * g * Ixwp / kRoll) / Math.abs(1 - (om / wRoll) ** 2);
  pr(`swell ${swell.H} m at ${swell.T} s: wavelength ${(2 * Math.PI / kw).toFixed(2)} m, slope ${(kw * swell.H / 2 * DEG).toFixed(2)} deg; quasi static heave ${(swell.H * heaveF).toFixed(3)} m crest to trough, pitch +-${(kw * swell.H / 2 * pitchF * DEG).toFixed(2)} deg, from the side roll +-${(kw * swell.H / 2 * rollF * DEG).toFixed(2)} deg, all at ${swell.T} s`);

  /* Hull speed and the hump: the length Froude number 0.4 of the resting
   * waterline, and the volumetric Froude number 1.5 to 2.5 of the hump in
   * the planing literature (Savitsky 1964; Hoerner, Fluid Dynamic Drag, ch. 11). */
  const Lw = Lwl;
  const vol0 = m / rhoW;
  const vHull = 0.4 * Math.sqrt(g * Lw);
  const vHumpLo = 1.5 * Math.sqrt(g * Math.cbrt(vol0 / 2));
  const vHumpHi = 2.5 * Math.sqrt(g * Math.cbrt(vol0 / 2));
  pr(`hull speed ${vHull.toFixed(2)} m/s; the hump between ${vHumpLo.toFixed(2)} and ${vHumpHi.toFixed(2)} m/s`);

  /* THE AIR ON THE WATER. alpha of the zero lift line at pitch theta on a
   * level run is theta less alphaZL; lift and moment from the tables, the
   * flaps at the take off notch (half) where there are flaps, full up
   * elevator with the radio's flap mix taken off it, and the thrust's
   * moment. */
  const df = P.flapHalf;
  const dclF = P.clDf * df + P.clDf2 * df * df;
  const T = (V) => P.Ts * (1 - V / P.Vp);
  const de = Math.max(-P.throwE, Math.min(P.throwE, P.throwE + P.deDf * df));
  const alphaStall = (P.CLmax + P.slatDclmax + P.clmaxDf * df) / P.CLa - dclF / P.CLa;
  const air = (V, theta, dE) => {
    const a = theta - P.alphaZL;
    const q = 0.5 * rhoA * V * V;
    const CL = P.CLa * a + P.CLde * dE + dclF;
    const Cm = P.Cm0 + P.Cma * a + P.Cmde * dE + P.cmDclF * dclF;
    return { L: q * P.S * CL, M: q * P.S * P.c * Cm - thrustZ * T(V), a };
  };
  /* Liftoff: the water's force is gone, so the attitude full up elevator
   * holds is the one where the air's moment and the thrust's balance; the
   * aircraft leaves when that attitude's lift is its weight. Capped at a
   * blend short of the stall, and at the sternpost: the afterbody's keel
   * is aftSlope over the step, so past that trim the stern drags. */
  const sternLimit = Math.atan(F.aftSlope) + Math.atan(F.stepH / (F.xStep - F.xStern));
  const thetaHeld = (V) => {
    let lo = -0.3;
    let hi = 0.6;
    for (let k = 0; k < 80; k += 1) {
      const mid = (lo + hi) / 2;
      if (air(V, mid, de).M > 0) lo = mid; else hi = mid;
    }
    return Math.min((lo + hi) / 2, alphaStall - 3 / DEG + P.alphaZL, sternLimit);
  };
  let vLof = null;
  for (let V = 3; V < 20; V += 0.001) {
    if (air(V, thetaHeld(V), de).L >= W) {
      vLof = V;
      break;
    }
  }
  const vStall = Math.sqrt(2 * W / (rhoA * P.S * (P.CLmax + P.slatDclmax + P.clmaxDf * df)));
  pr(`stall on floats at the take off notch ${vStall.toFixed(2)} m/s; the attitude full up elevator holds at liftoff ${(thetaHeld(vLof) * DEG).toFixed(2)} deg (sternpost at ${(sternLimit * DEG).toFixed(1)}); liftoff ${vLof.toFixed(2)} m/s, ${(vLof / vStall).toFixed(2)} of the stall`);

  /* SAVITSKY ON THE STEP. Per float, beam b, deadrise beta: at speed V
   * and trim tau (deg), the mean wetted length over beam lambda that
   * carries the load, the drag L tan(tau) + friction, and the centre of
   * pressure l_p = lambda b (0.75 - 1 / (5.21 Cv^2 / lambda^2 + 2.39))
   * ahead of the step. Friction ITTC 1957 on Re = V lambda b / nu. */
  const bw = F.beam;
  const betaD = F.deadrise * DEG;
  const savitsky = (V, tauRad, load) => {
    const tau = tauRad * DEG;
    const Cv = V / Math.sqrt(g * bw);
    const CLb = load / (0.5 * rhoW * V * V * bw * bw);
    let CL0 = CLb;
    for (let k = 0; k < 50; k += 1) CL0 = CLb + 0.0065 * betaD * Math.pow(Math.max(CL0, 1e-9), 0.6);
    let lo = 0.01;
    let hi = 40;
    for (let k = 0; k < 80; k += 1) {
      const lam = (lo + hi) / 2;
      const c0 = Math.pow(tau, 1.1) * (0.012 * Math.sqrt(lam) + 0.0055 * Math.pow(lam, 2.5) / (Cv * Cv));
      if (c0 > CL0) hi = lam; else lo = lam;
    }
    const lam = (lo + hi) / 2;
    const Re = V * lam * bw / nu;
    const Cf = 0.075 / (Math.log10(Re) - 2) ** 2;
    const Df = 0.5 * rhoW * V * V * Cf * lam * bw * bw / Math.cos(F.deadrise);
    const D = load * Math.tan(tauRad) + Df / Math.cos(tauRad);
    const lp = lam * bw * (0.75 - 1 / (5.21 * Cv * Cv / (lam * lam) + 2.39));
    return { lam, D, lp, Cv };
  };
  /* The step speed: planing on the forebody alone, lambda b within the
   * forebody's flat, at the attitude the hull settles to on its own with
   * the stick back (the Savitsky moment balance about the CG with full up
   * elevator), the water carrying what the air does not. */
  const forebody = F.xKnee - F.xStep;
  const planing = (V) => {
    let best = null;
    for (let t = 1; t <= 12; t += 0.05) {
      const tr = t / DEG;
      const a = air(V, tr, de);
      const load = (W - a.L) / 2;
      if (load <= 0) return { tau: tr, D: 0, lam: 0, load: 0 };
      const sv = savitsky(V, tr, load);
      const Mw = 2 * load * (F.xStep + sv.lp) - 2 * sv.D * (-F.zKeel);
      const M = a.M + Mw;
      if (best === null || Math.abs(M) < Math.abs(best.M)) best = { tau: tr, M, ...sv, load };
    }
    return best;
  };
  let vStep = null;
  for (let V = 1.5; V < 12; V += 0.01) {
    const p = planing(V);
    if (p.lam * bw <= forebody && p.Cv > 1.5) {
      vStep = V;
      break;
    }
  }
  const pStep = planing(vStep);
  pr(`on the step at ${vStep.toFixed(2)} m/s (Cv ${pStep.Cv.toFixed(2)}): trim ${(pStep.tau * DEG).toFixed(1)} deg, wetted ${(pStep.lam * bw).toFixed(3)} m, water drag ${(2 * pStep.D / W).toFixed(3)} of the weight`);

  /* THE TAKE OFF RUN, full throttle from rest. Below the step speed the
   * floats are in the hump, whose resistance the literature puts at 0.12
   * to 0.25 of the weight they carry; from the step to liftoff Savitsky's
   * drag at the attitude the stick holds. The air's drag throughout, at
   * the attitude. Integrated on V, dx = m V dV / (T - D). */
  const run = (hump) => {
    let x = 0;
    let t = 0;
    const dv = 0.01;
    for (let V = 0.001; V < vLof; V += dv) {
      let Dw;
      let theta;
      if (V < vStep) {
        theta = th;
        Dw = hump * Math.min(1, V / (0.8 * vStep)) * Math.max(0, W - air(V, theta, de).L);
      } else {
        const p = planing(V);
        theta = p.tau;
        Dw = 2 * p.D;
      }
      const a = air(V, theta, de);
      const CD = P.CD0 + dCD0 + (a.L / (0.5 * rhoA * V * V * P.S)) ** 2 / (Math.PI * 0.75 * P.b * P.b / P.S);
      const Da = 0.5 * rhoA * V * V * P.S * CD;
      const acc = (T(V) - Dw - Da) / m;
      if (acc <= 0) return null;
      x += V * dv / acc;
      t += dv / acc;
    }
    return { x, t };
  };
  const runLo = run(0.12);
  const runHi = run(0.25);
  pr(`take off run to ${vLof.toFixed(2)} m/s: ${runLo ? runLo.x.toFixed(2) : 'never'} m in ${runLo ? runLo.t.toFixed(2) : '-'} s with a hump of 0.12 W, ${runHi ? runHi.x.toFixed(2) : 'never'} m in ${runHi ? runHi.t.toFixed(2) : '-'} s at 0.25 W`);

  /* THE LANDING RUN, the manual's: full flaps where there are flaps,
   * touching down at 1.15 of that stall with the throttle closed and the
   * stick held back, decelerating on Savitsky's drag at the attitude the
   * stick holds above the step speed and on the hump below it, to a
   * walking pace, 1 m/s. */
  const dfL = P.flapHalf ? 0.57058379792549596 : 0;
  const dclL = P.clDf * dfL + P.clDf2 * dfL * dfL;
  const deL = Math.max(-P.throwE, Math.min(P.throwE, P.throwE + P.deDf * dfL));
  const vStallL = Math.sqrt(2 * W / (rhoA * P.S * (P.CLmax + P.slatDclmax + P.clmaxDf * dfL)));
  const airL = (V, theta) => {
    const a = theta - P.alphaZL;
    const q = 0.5 * rhoA * V * V;
    const CL = Math.min(P.CLa * a + P.CLde * deL + dclL, P.CLmax + P.slatDclmax + P.clmaxDf * dfL);
    const Cm = P.Cm0 + P.Cma * a + P.Cmde * deL + P.cmDclF * dclL;
    return { L: q * P.S * CL, M: q * P.S * P.c * Cm, CL };
  };
  const landing = (hump) => {
    let x = 0;
    const dv = 0.01;
    for (let V = 1.15 * vStallL; V > 1.0; V -= dv) {
      let Dw;
      let theta;
      if (V >= vStep) {
        let best = null;
        for (let t = 1; t <= 12; t += 0.05) {
          const tr = t / DEG;
          const a = airL(V, tr);
          const load = Math.max(0, (W - a.L) / 2);
          const sv = load > 0 ? savitsky(V, tr, load) : { D: 0, lp: 0 };
          const M = a.M + 2 * load * (F.xStep + sv.lp) - 2 * sv.D * (-F.zKeel);
          if (best === null || Math.abs(M) < Math.abs(best.M)) best = { M, D: 2 * sv.D, tr };
        }
        Dw = best.D;
        theta = best.tr;
      } else {
        theta = th;
        Dw = hump * Math.min(1, V / (0.8 * vStep)) * Math.max(0, W - airL(V, theta).L);
      }
      const a = airL(V, theta);
      const CD = P.CD0 + dCD0 + 0.0666 * dfL * dfL + a.CL * a.CL / (Math.PI * 0.75 * P.b * P.b / P.S);
      const Da = 0.5 * rhoA * V * V * P.S * CD;
      x += m * V * dv / (Dw + Da);
    }
    return x;
  };
  pr(`landing from ${(1.15 * vStallL).toFixed(2)} m/s (stall ${vStallL.toFixed(2)} ${dfL ? 'full flaps' : ''}) to 1 m/s: ${landing(0.25).toFixed(1)} m with a hump of 0.25 W, ${landing(0.12).toFixed(1)} m at 0.12 W`);

  /* The water rudder's taxi turn, a steady turn at a walking pace: the
   * rudders' side force at full rudder against the floats' sideways
   * crossflow drag, each strip at its own lateral speed, turning about a
   * point where both the force and the moment balance. */
  const rud = { ...P.rudder, z: P.rudder.z0 - dz };
  const Ar = rud.span * rud.chord;
  const arR = rud.span / rud.chord;
  const aR = 2 * Math.PI * arR / (arR + 2);
  const throwR = key === 'timber' ? 27 / DEG : 15 / DEG;
  const U = 0.9;
  const turn = () => {
    let best = null;
    for (let r = 0.005; r < 2; r += 0.005) {
      for (let beta = -0.5; beta < 0.5; beta += 0.004) {
        const v0 = U * Math.sin(beta);
        const u0 = U * Math.cos(beta);
        let Fy = 0;
        let Mz = 0;
        const n = 200;
        const dx = (F.xBow - F.xStern) / n;
        for (let i = 0; i < n; i += 1) {
          const x = F.xBow - (i + 0.5) * dx;
          const zw = zc + x * Math.sin(th) + keel(x) * Math.cos(th);
          if (zw >= 0) continue;
          const d = Math.min(-zw, F.zKeel + F.depth - keel(x));
          const v = v0 + r * x;
          const f = -0.5 * rhoW * 1.0 * d * v * Math.abs(v) * dx * 2;
          Fy += f;
          Mz += f * x;
        }
        const vr = v0 + r * rud.x;
        const zr = zc + rud.x * Math.sin(th) + rud.z * Math.cos(th);
        const frac = Math.max(0, Math.min(1, (-(zr - rud.span / 2)) / rud.span));
        const al = Math.max(-0.9 / aR, Math.min(0.9 / aR, throwR + Math.atan2(vr, u0)));
        const fr = -0.5 * rhoW * (u0 * u0 + vr * vr) * Ar * frac * 2 * aR * al;
        Fy += fr;
        Mz += fr * rud.x;
        const centripetal = m * U * r;
        const err = Math.abs(Fy - centripetal) / W + Math.abs(Mz) / (W * 0.1);
        if (best === null || err < best.err) best = { r, beta, err };
      }
    }
    return best;
  };
  const tr = turn();
  pr(`water rudder taxi turn at ${U} m/s, full rudder: radius ${(U / tr.r).toFixed(2)} m, sideslip ${(tr.beta * DEG).toFixed(1)} deg`);

  /* On land: a keel on grass at mu 0.35 needs this much throttle to move. */
  const breakaway = Math.sqrt(0.35 * W / P.Ts);
  pr(`on grass at mu 0.35 it breaks away at ${(breakaway * 100).toFixed(0)} percent throttle`);

  out[key] = { m, W, dz, th, stepDraft, cgOver, vLof, vStall, vStep, runLo, runHi, radius: U / tr.r, breakaway, landLo: landing(0.25), landHi: landing(0.12) };
}
