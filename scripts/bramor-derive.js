/*
 * bramor-derive.js: the arithmetic behind docs/BRAMOR-STAGE1.md, from the
 * Bramor C4EYE's published figures and the drawn planform to every
 * coefficient in its FixedWingParams table and every derived band. It never
 * loads the plant: this is what the plant is checked against, so it has to
 * stand apart from it. Harness arithmetic in JS maths, which is allowed here
 * because nothing it prints is hashed. Run with npm run bramor:derive.
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

/* Published: C-Astral, Bramor C4EYE product page and 2019 catalogue. */
const b = 2.30;
const m = 4.5;
const W = m * g;
const vStall = 13.0; /* Bramor user manual, as quoted; see the document */
const vCruise = 16.0;
const climbMax = 5.0; /* same manual */

/*
 * The planform, half of it, as src/render/bramorcraft.js draws it: stations
 * across the span, y out from the centre line, with the leading and
 * trailing edge measured AFT from the nose, metres. The pod to 0.11 m, the
 * cranked inner delta to 0.30 m, the outer panel to the tip at 1.15 m,
 * 25 degrees of leading edge sweep on it.
 */
export const BRAMOR_PLANFORM = [
  [0.00, 0.000, 0.620],
  [0.06, 0.040, 0.620],
  [0.11, 0.130, 0.620],
  [0.30, 0.360, 0.620],
  [1.15, 0.360 + 0.85 * Math.tan(25 / DEG), 0.360 + 0.85 * Math.tan(25 / DEG) + 0.120],
];
const P = BRAMOR_PLANFORM;
const lerpSt = (y, k) => {
  for (let i = 0; i + 1 < P.length; i += 1) {
    if (y <= P[i + 1][0]) {
      const t = (y - P[i][0]) / (P[i + 1][0] - P[i][0]);
      return P[i][k] + t * (P[i + 1][k] - P[i][k]);
    }
  }
  return P[P.length - 1][k];
};
const le = (y) => lerpSt(y, 1);
const te = (y) => lerpSt(y, 2);
const chord = (y) => te(y) - le(y);

/* Integrals over the half span by a fine midpoint rule. */
function integrate(f, y0 = 0, y1 = b / 2, n = 20000) {
  let sum = 0;
  const h = (y1 - y0) / n;
  for (let i = 0; i < n; i += 1) {
    sum += f(y0 + (i + 0.5) * h);
  }
  return sum * h;
}

const S = 2 * integrate(chord);
const cRef = S / b;
const AR = b * b / S;
const mac = (2 / S) * integrate((y) => chord(y) ** 2);
const yMac = (2 / S) * integrate((y) => chord(y) * y);
/* The aerodynamic centre: the area weighted quarter chord point, which for
 * a wing is the same as the MAC's quarter chord and here also carries the
 * pod's share, its lift acting over the body where the pod carries it. */
const xAc = (2 / S) * integrate((y) => chord(y) * (le(y) + 0.25 * chord(y)));
/* The body's Munk moment moves the neutral point forward; a blended body
 * this wide and short is worth about 2 percent of the MAC. ESTIMATED. */
const xNp = xAc - 0.02 * mac;
const staticMargin = 0.07; /* ESTIMATED: a survey flying wing's usual 5 to 10 */
const xCg = xNp - staticMargin * mac;

/* Aerodynamics. */
const sweepHalf = Math.atan((le(1.15) + 0.5 * chord(1.15) - (le(0.30) + 0.5 * chord(0.30))) / 0.85);
const clAlpha = 2 * Math.PI * AR / (2 + Math.sqrt(AR * AR * (1 + Math.tan(sweepHalf) ** 2) + 4));
const clMax = 2 * W / (rho * S * vStall * vStall);
const alphaStall = clMax / clAlpha;
const cd0 = 0.024;
const e = 0.85;
const k = 1 / (Math.PI * e * AR);
const clAt = (V) => 2 * W / (rho * V * V * S);
const cdAt = (V) => cd0 + k * clAt(V) ** 2;
const dragAt = (V) => 0.5 * rho * V * V * S * cdAt(V);

/* Elevons: the outer panel from 0.45 m to 1.10 m, a quarter of the local
 * chord, flap effectiveness tau for c_f/c = 0.25 (Nelson, fig. 2.21, about
 * 0.52; 0.50 for the gap and the hinge sweep). */
const yE0 = 0.45, yE1 = 1.10, tau = 0.50;
const sE = 2 * integrate(chord, yE0, yE1);
const clDe = -clAlpha * tau * sE / S; /* trailing edge up sheds lift */
/* The elevons' lift increment acts at about 45 percent of the local chord. */
const xE = (2 / sE) * integrate((y) => chord(y) * (le(y) + 0.45 * chord(y)), yE0, yE1);
const cmDe = -clDe * (xE - xCg) / cRef; /* trailing edge up, nose up */
const cmAlpha = -clAlpha * staticMargin * mac / cRef;
/* Roll: strip theory, the 3D lift slope on each strip (conservative). */
const clP = -(4 * clAlpha / (S * b * b)) * integrate((y) => chord(y) * y * y);
const clDa = (2 * clAlpha * tau / (S * b)) * integrate((y) => chord(y) * y, yE0, yE1);

/* The winglets as src/render/bramorcraft.js draws them: 0.236 m long up
 * their 3 deg cant, 0.114 m of chord at the root to 0.057 at the top, 32
 * degrees of leading edge sweep, ESTIMATED from the photographs (C-Astral's
 * renders and the Bangladesh Army's, where each stands about a fifth of the
 * semispan); their centre of pressure stands 0.11 m up and aft of the
 * tip's quarter chord. */
const hV = 0.236, cV0 = 0.114, cV1 = 0.057, sweepV = 32 / DEG;
const sV1 = hV * (cV0 + cV1) / 2;
const arV = hV * hV / sV1;
const aV = 2 * Math.PI * arV / (arV + 2);
const xV = le(1.15) + 0.11 * Math.tan(sweepV) + 0.25 * (cV0 + cV1) / 2;
const lV = xV - xCg;
const zV = 0.11;
const cyBeta = -aV * 2 * sV1 / S - 0.08; /* the pod's side force, ESTIMATED 0.08 */
const cnBetaFins = aV * (2 * sV1 / S) * (lV / b);
const cnBeta = cnBetaFins - 0.012; /* less the pod's Munk yaw, ESTIMATED */
const clBetaSweep = -0.0025 * DEG * clAt(vCruise); /* DATCOM, 25 deg sweep, AR 9 */
const clBeta = clBetaSweep - aV * (2 * sV1 / S) * (zV / b) + 0.010; /* root anhedral */
/* Yaw damping: the winglets as fins, -2 a_v (S_v/S)(l_v/b)^2, and the
 * wing's own, -(0.02 CL^2 + 0.3 CD0) (Nelson, section 3.4). */
const cnR = -2 * aV * (2 * sV1 / S) * (lV / b) ** 2 - (0.02 * clAt(vCruise) ** 2 + 0.3 * cd0);

/* Pitch damping: the flying wing's figure, docs/WING-STAGE1.md, ESTIMATED. */
const cmQ = -4.0;

/* Motor, ESTIMATED where C-Astral is silent: a folding 12 x 8 in pusher on
 * 6S and about 1 kW (UST, 2016), pitch speed at 0.85 slip. */
const cells = 6, vPack = 3.7 * cells, pitchIn = 8, propR = 0.1524;
const kv = 470;
const rpmNoLoad = kv * vPack;
const vPitch = rpmNoLoad / 60 * pitchIn * 0.0254 * 0.85;
const thrustZ = 0.087; /* the drawn hub over the CG, on the raised tail cone */
function climbAt(V, Ts, d = 1) {
  const T = Math.max(0, Ts * d * d * (1 - V / (vPitch * d)));
  return (T - dragAt(V)) * V / W;
}
function bestClimb(Ts) {
  let best = { vz: -Infinity, v: 0 };
  /* From 1.1 V_s: a climb flown closer to the stall than that is not one
   * a pilot or an autopilot flies. */
  for (let V = 1.1 * vStall; V <= 22; V += 0.05) {
    const vz = climbAt(V, Ts);
    if (vz > best.vz) best = { vz, v: V };
  }
  return best;
}
let lo = 5, hi = 100;
for (let i = 0; i < 80; i += 1) {
  const mid = (lo + hi) / 2;
  if (bestClimb(mid).vz < climbMax) lo = mid; else hi = mid;
}
const thrustStatic = Math.round(lo * 10) / 10;
const levelSpeed = (d) => {
  let a = 8, z = 40;
  for (let i = 0; i < 80; i += 1) {
    const V = (a + z) / 2;
    const T = Math.max(0, thrustStatic * d * d * (1 - V / (vPitch * d)));
    if (T > dragAt(V)) a = V; else z = V;
  }
  return (a + z) / 2;
};
let dLo = 0.2, dHi = 1;
for (let i = 0; i < 80; i += 1) {
  const d = (dLo + dHi) / 2;
  if (levelSpeed(d) < vCruise) dLo = d; else dHi = d;
}
const dutyCruise = (dLo + dHi) / 2;
const discA = Math.PI * propR * propR;
const idealPower = thrustStatic ** 1.5 / Math.sqrt(2 * rho * discA);
const staticRpm = 0.85 * rpmNoLoad;
const torque = idealPower / (staticRpm * 2 * Math.PI / 60);
const torqueArm = torque / thrustStatic;

/* Trim at cruise with the elevons neutral: the pitching moment at the
 * cruise angle of attack and the thrust line's moment at cruise thrust. */
const alphaCruise = clAt(vCruise) / clAlpha;
const qCruise = 0.5 * rho * vCruise * vCruise;
const thrustCruise = dragAt(vCruise);
const cm0 = -cmAlpha * alphaCruise + thrustZ * thrustCruise / (qCruise * S * cRef);
/* The elevator throw: the one that trims level inverted flight at cruise,
 * which is the most down a pilot flying acro asks of it. Up, full stick
 * is then past the stall below about 29 m/s, as on the flying wing
 * (docs/WING-STAGE1.md), whose rule, the throw that just stalls at the
 * throw speed, would leave this wing a degree and a half: it cruises at
 * 1.23 V_s and makes 2.1 deg of angle of attack per deg of elevon. */
const vTop = levelSpeed(1);
const alphaTop = clAt(vTop) / clAlpha;
const alphaPerElevon = cmDe / -cmAlpha;
const throwE = -((-cmAlpha * -alphaCruise) - cm0) / cmDe;
const alphaFullUp = cm0 / -cmAlpha + throwE * alphaPerElevon;

/* Inertia, ESTIMATED: the two outer panels as 0.5 kg bars from 0.15 m to
 * 1.15 m out, 20 g winglets at the tips, the rest, 3.46 kg, in the pod and
 * the root, 0.3 m wide and 0.7 m long. */
const bar = (mass, r0, r1) => mass * ((r1 - r0) ** 2 / 12 + ((r0 + r1) / 2) ** 2);
const ixx = 2 * bar(0.5, 0.15, 1.15) + 2 * 0.02 * 1.15 ** 2 + 3.46 * (0.3 ** 2 + 0.12 ** 2) / 12;
const iyy = 3.46 * 0.7 ** 2 / 12 + 2 * 0.5 * 0.2 ** 2 + 2 * 0.02 * 0.45 ** 2;
const izz = ixx + iyy;

/* Roll rate at full aileron: the steady p b / 2V = -Clda da / Clp. */
/* Aileron throw ESTIMATED as a survey wing's setup: 10 deg, which with
 * this much elevon is a quick but not an aerobatic roll. */
const throwA = 10 / DEG;
const pb2v = -clDa * throwA / clP;
/* Adverse yaw from the elevons as a multiple of CL: Cn_da = K CL Cl_da,
 * K about -0.2 for outboard surfaces on a wing of AR 9 and taper 0.46
 * (Roskam, Airplane Design VI, fig. 10.48). */
const cnDaPerCl = -0.2 * clDa;
const rollRateAt = (V) => pb2v * 2 * V / b;

/* The parachute. No descent rate is published: 5.0 m/s, the middle of the
 * 4.6 to 6.1 m/s (15 to 20 ft/s) a recovery chute for a small UAS is sized
 * for (Fruity Chutes' sizing guidance). ESTIMATED. The airframe hangs flat
 * under it, and the plant's post stall plate, C_D = cd0 + 2 at 90 deg,
 * carries part of the weight; the canopy carries the rest. */
const vChute = 5.0;
const cdaTotal = 2 * W / (rho * vChute * vChute);
const cdaAirframe = S * (cd0 + 2);
const chuteCda = cdaTotal - cdaAirframe;
const canopyCd0 = 0.80; /* a round canopy */
const canopyD = 2 * Math.sqrt(chuteCda / canopyCd0 / Math.PI);
/* Hanging inverted and flat the air meets the airframe at -90 deg, where
 * the plant's pitching moment is the linear cm0 + cm_alpha (-pi/2) with
 * the post stall terms of docs/STALL-STAGE1.md on it, fully stalled: the
 * linear lift's moment about the neutral point taken back, and the plate's
 * normal force, 2 sin(alpha), at its centre of pressure (the table's
 * stall_arm_ac and stall_arm_cp, scripts/stall-derive.js). The risers'
 * attachment point sits that far ahead of the CG that the canopy's pull
 * balances it and the aircraft hangs level on its back. */
const qChute = 0.5 * rho * vChute * vChute;
const stallArmAc = cmAlpha / clAlpha;
const stallArmCp = 0.40 - (0.25 + stallArmAc);
const cmHang = cm0 + cmAlpha * (-Math.PI / 2)
  - (stallArmAc * clAlpha * (-Math.PI / 2) + stallArmCp * 2 * Math.sin(-Math.PI / 2));
const canopyPull = 0.5 * rho * chuteCda * vChute * vChute;
const attachX = (qChute * S * cRef * cmHang) / canopyPull;
const attachZ = -0.060; /* the belly: the aircraft hangs on its back */

/* The catapult, ESTIMATED from the published photographs (the Italian
 * Army's: a bungee rail about 3 m long from the ground to a bipod, its top
 * end about a metre up, at about 20 deg): release at 1.3 V_s at the top,
 * the shuttle's stroke taken as the rail less half a metre. */
const vRelease = Math.round(1.3 * vStall);
const railLength = 3.1 - 0.5;
const railPitch = 20;
const launchG = vRelease * vRelease / (2 * railLength) / g;

const f = (x, n = 3) => Number(x).toFixed(n);
console.log(`planform: S ${f(S, 4)} m2, c_ref ${f(cRef, 4)} m, AR ${f(AR, 2)}, MAC ${f(mac, 4)} m at y ${f(yMac, 3)}`);
console.log(`  x aft of the nose: aero centre ${f(xAc, 4)}, neutral point ${f(xNp, 4)}, CG ${f(xCg, 4)} (static margin ${staticMargin})`);
console.log(`  half chord sweep of the outer panel ${f(sweepHalf * DEG, 1)} deg`);
console.log(`lift: CL_alpha ${f(clAlpha, 3)} /rad, CL_max ${f(clMax, 3)}, alpha_stall ${f(alphaStall * DEG, 2)} deg`);
console.log(`drag: CD0 ${cd0}, e ${e}, k ${f(k, 4)}; L/D ${f(clAt(16) / cdAt(16), 2)} at 16 m/s, ${f(clAt(14) / cdAt(14), 2)} at 14, ${f(clAt(13.5) / cdAt(13.5), 2)} at 13.5`);
console.log(`  V_md ${f(Math.sqrt(2 * W / (rho * S * Math.sqrt(cd0 / k))), 2)} m/s, L/D max ${f(1 / (2 * Math.sqrt(cd0 * k)), 2)}`);
console.log(`elevons: S_e ${f(sE, 4)} m2, CL_de ${f(clDe, 4)}, x ${f(xE, 4)} aft, Cm_de ${f(cmDe, 4)}, Cm_alpha ${f(cmAlpha, 4)}, Cm_q ${cmQ}`);
console.log(`roll: Cl_p ${f(clP, 4)}, Cl_da ${f(clDa, 4)}, pb/2V ${f(pb2v, 4)} at ${f(throwA * DEG, 0)} deg: ${f(rollRateAt(16) * DEG, 1)} deg/s at 16 m/s, ${f(rollRateAt(20) * DEG, 1)} at 20; Cn_da per CL ${f(cnDaPerCl, 4)}`);
console.log(`winglets: S_v ${f(2 * sV1, 4)} m2, AR ${f(arV, 2)}, a_v ${f(aV, 3)}, l_v ${f(lV, 3)} m`);
console.log(`lateral: CY_beta ${f(cyBeta, 3)}, Cn_beta ${f(cnBeta, 4)} (fins ${f(cnBetaFins, 4)}), Cl_beta ${f(clBeta, 4)}, Cn_r ${f(cnR, 4)}`);
console.log(`trim: alpha at 16 m/s ${f(alphaCruise * DEG, 2)} deg, CL ${f(clAt(16), 4)}, Cm0 ${f(cm0, 4)}; ${f(alphaPerElevon, 2)} deg of alpha per deg of elevon`);
console.log(`  elevator throw to trim inverted at cruise ${f(throwE * DEG, 2)} deg; full up trims at ${f(alphaFullUp * DEG, 1)} deg, past the stall at any speed; the throw to the stall at the top speed ${f(vTop, 2)} m/s would be ${f((alphaStall - alphaTop) / alphaPerElevon * DEG, 2)}, at cruise ${f((alphaStall - alphaCruise) / alphaPerElevon * DEG, 2)}`);
console.log(`  pull up at cruise to the stall: ${f((vCruise / vStall) ** 2, 2)} g, ${f(((vCruise / vStall) ** 2 - 1) * g / vCruise * DEG, 1)} deg/s`);
console.log(`motor: ${cells}S ${f(vPack, 1)} V, ${kv} kV, no load ${f(rpmNoLoad, 0)} rpm, pitch speed ${f(vPitch, 2)} m/s`);
console.log(`  climb at full throttle: ${[14.3, 15, 16, 18, 20].map((V) => `${f(climbAt(V, thrustStatic), 2)} at ${V}`).join(', ')}`);
console.log(`  static thrust for a best climb of ${climbMax} m/s: ${thrustStatic} N (T/W ${f(thrustStatic / W, 2)}), best climb ${f(bestClimb(thrustStatic).vz, 2)} at ${f(bestClimb(thrustStatic).v, 1)} m/s`);
console.log(`  cruise duty for 16 m/s ${f(dutyCruise, 4)}; level at 65 percent ${f(levelSpeed(0.65), 2)}; top ${f(levelSpeed(1), 2)} m/s`);
console.log(`  ideal static disc power ${f(idealPower, 0)} W, torque ${f(torque, 3)} N m, arm ${f(torqueArm, 4)} m`);
console.log(`  drag at 16 m/s ${f(dragAt(16), 3)} N, aero power ${f(dragAt(16) * 16, 1)} W, electrical at 0.65 x 0.82 ${f(dragAt(16) * 16 / (0.65 * 0.82), 0)} W, 3.5 h is ${f(3.5 * dragAt(16) * 16 / (0.65 * 0.82), 0)} Wh`);
console.log(`inertia: Ixx ${f(ixx, 3)}, Iyy ${f(iyy, 3)}, Izz ${f(izz, 3)} kg m2`);
console.log(`chute: total CdA ${f(cdaTotal, 3)} m2 at ${vChute} m/s, airframe ${f(cdaAirframe, 3)}, canopy ${f(chuteCda, 3)} (a ${f(canopyD, 2)} m round canopy at C_D ${canopyCd0})`);
console.log(`  hanging on its back: Cm ${f(cmHang, 4)}, canopy pull ${f(canopyPull, 2)} N, attach x ${f(attachX, 4)} m ahead of the CG, z ${attachZ}`);
console.log(`catapult: release ${vRelease} m/s off a ${railLength} m rail at ${railPitch} deg, mean ${f(launchG, 1)} g`);
console.log(`glide ratio bands: 16 m/s ${f(clAt(16) / cdAt(16), 2)}; stall ${vStall}; cruise at 65 percent ${f(levelSpeed(0.65), 2)}`);
