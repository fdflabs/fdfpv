/*
 * dlg-derive.js: the arithmetic behind docs/DLG-STAGE1.md, from the NRJ's
 * published figures and its photographs to every coefficient, the
 * discus launch and every derived band. It never loads the plant: this is
 * what the plant is checked against, so it has to stand apart from it.
 * Harness arithmetic in JS maths, which is allowed here because nothing it
 * prints is hashed. Run with npm run dlg:derive.
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
/* The plant's air, plant_wing.c AIR_MU, so the Reynolds number the drag
 * is taken at is the plant's. */
const mu = 1.789e-5;

/*
 * The aircraft. Published: the span (Lindinger's and Flash RC's 1490 mm),
 * the area (19.0 dm2), the aspect ratio (11.7), the length (0.96 m), the
 * standard layup's typical flying weight (213 g) and the manual's CG (66 mm
 * behind the root's leading edge) and 7 deg of dihedral a panel, from
 * Hyperflight's specification table and OA Composites' manual. The planform
 * is elliptic in its chord with a straight trailing edge, the hinge line
 * the photographs show; the tail is measured off Hyperflight's photograph
 * of two NRJs on the grass, scaled to the published length and span.
 */
const b = 1.49, S = 0.190, m = 0.213, W = m * g, AR = b * b / S;
const c0 = 4 * S / (Math.PI * b);
const chordAt = (y) => c0 * Math.sqrt(Math.max(0, 1 - (2 * y / b) ** 2));
const N = 4000;
const integrate = (f, y0 = 0, y1 = b / 2) => {
  let s = 0;
  for (let i = 0; i < N; i += 1) {
    const y = y0 + (y1 - y0) * (i + 0.5) / N;
    s += f(y) * (y1 - y0) / N;
  }
  return s;
};
const MAC = 2 * integrate((y) => chordAt(y) ** 2) / S;
/* The trailing edge is straight, so the leading edge at y is c(0) - c(y)
 * behind the root's. */
const macLE = 2 * integrate((y) => chordAt(y) * (c0 - chordAt(y))) / S;
const cgBehindRootLE = 0.066;
const hCG = (cgBehindRootLE - macLE) / MAC;
const dihedral = 7 / DEG;
const tipRise = (b / 2) * Math.tan(dihedral);

/*
 * THE DRAG, which on this aircraft is the whole story. It flies from 4.5
 * m/s to 40 m/s, a ninefold range of Reynolds number, and its section and
 * skin drag coefficients fall across it: van Empel and Volkers measured
 * the Stream NXT's (a 240 g F3K glider on 6 percent sections, the NRJ's
 * class) and found the drag coefficient "almost halves" from 4 to 20 m/s.
 * A laminar skin's friction goes as Re^-1/2 (Blasius), which halves over
 * 4 to 16; the plant takes CD0 as the table's at a reference Reynolds
 * number and scales it by the root of the reference over the Reynolds
 * number now (plant_wing.c, FixedWingParams.cd0_re).
 *
 * The build up at the reference, 5 m/s on the mean chord, Raymer ch. 12:
 * the wing's section drag 0.019, a thin low camber section's at 5e4
 * (Selig et al., Summary of Low-Speed Airfoil Data, the SD7037 and SA7035
 * class at 6e4, cd 0.017 to 0.021 at cl 0.6 to 0.9); the tail, stabiliser
 * and fin both sides at the laminar C_f of their 0.085 m chord; the
 * fuselage, a 0.19 m pod and a 0.7 m boom of 9 mm, turbulent C_f; and
 * 0.0007 for the horns, the peg, the aileron gap and the junctions, van
 * Empel and Volkers' own four items.
 */
const Vref = 5;
const Reref = rho * Vref * MAC / mu;
const cdWingProfile = 0.019;
const Sh = 0.020, bh = 0.30, Sv = 0.016, hv = 0.20;
const ReT = rho * Vref * 0.085 / mu;
const CfT = 1.328 / Math.sqrt(ReT);
const cdTail = CfT * 1.1 * 2.04 * (Sh + Sv) / S;
const SwetPod = Math.PI * 0.024 * 0.19 * 0.75, SwetBoom = Math.PI * 0.009 * 0.70;
const CfF = 0.455 / Math.log10(rho * Vref * 0.96 / mu) ** 2.58;
const cdFuse = CfF * 1.1 * (SwetPod + SwetBoom) / S;
const dCDmisc = 0.0007;
const CD0 = +(cdWingProfile + cdTail + cdFuse + dCDmisc).toFixed(4);
const cd0At = (V) => {
  const re = Math.max(rho * V * MAC / mu, 0.5 * Reref);
  return CD0 * Math.sqrt(Reref / re);
};
/* Oswald's e, Raymer eq. 12.48 for a straight wing, which carries the
 * section drag's own rise with the lift as well as the induced drag. */
const e = 1.78 * (1 - 0.045 * AR ** 0.68) - 0.64;
const k = 1 / (Math.PI * e * AR);
/* A thin low camber section at 5e4: section cl max 1.05 (the same UIUC
 * data), times 0.9 for the elliptic wing's tips and the tail's trim load.
 * ESTIMATED. */
const CLmax = 0.95;
/* The section's zero lift about 2 deg negative, 1 deg of incidence.
 * ESTIMATED. */
const alphaZL = -3 / DEG;

/* The tail, off the photograph: the stabiliser 0.30 m by 0.085 m, its
 * quarter chord 0.56 m behind the wing's; the fin 0.20 m tall with 0.016
 * m2 of it, its centre 0.60 m behind the CG and 0.08 m over it. */
const lh = 0.56, eta = 0.9, tauE = 0.55;
const lv = 0.60, zv = 0.08, arV = 1.5 * hv * hv / Sv, tauR = 0.60;
/* The ailerons are the trailing edge from 0.08 m to 0.70 m out, a quarter
 * of the chord: flaperons, as every F3K glider's. */
const y1 = 0.08, y2 = 0.70, tauA = 0.50;
/* Inertia, ESTIMATED from the published weights: the 97 g wing as a
 * tapered bar (m b^2/12 x 0.8) and its 1.5 g tip balance; in pitch the
 * pod's 80 g at 0.12 m ahead, the tail's 20 g at 0.58 m aft and the boom's
 * 15 g spread along it; Izz their sum. */
const Ixx = 0.097 * b * b / 12 * 0.8 + 2 * 0.0015 * (b / 2) ** 2;
const Iyy = 0.08 * 0.12 ** 2 + 0.02 * 0.58 ** 2 + 0.015 * 0.70 ** 2 / 12 + 0.097 * MAC * MAC / 12;
const Izz = Ixx + Iyy;
/* Travel, the manual's: ailerons 13 mm each way, its "differential for
 * speed and high cruise" (the plant's aileron throw is one angle both
 * ways; the thermal setting's 19 mm down is a camber mix the plant does
 * not fly), on the 40 mm aileron chord at the horn; the elevator 9 mm (8
 * to 10) on its 30 mm; the rudder 12 mm on its 45 mm. */
const throwA = Math.asin(13 / 40), throwE = Math.asin(9 / 30), throwR = Math.asin(12 / 45);

/* The coefficients, Nelson's forms, as every derivation here. */
const c = MAC;
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const deda = 2 * aw / (Math.PI * AR);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
/* The pod's destabilising moment, Raymer eq. 16.25: K_f 0.012 per deg,
 * 24 mm wide, 0.19 m long; the boom's is its own diameter's, nothing. */
const CmaFuse = 0.012 * DEG * 0.024 * 0.024 * 0.19 / (c * S);
const hn = 0.25 + VH * eta * (at / aw) * (1 - deda) - CmaFuse / CLa;
const SM = hn - hCG, Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c, Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
/* Trimmed at the best glide with the elevator neutral: Cm0 below. */
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const CYb = -av * Sv / S - 0.02;
const Cnb = av * VV - 1.3 * (0.019 * 0.024 * 0.024) / (S * b);
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
const ClbWing = -(2 * aw / (S * b)) * integrate((y) => dihedral * chordAt(y) * y);
const Clb = ClbWing - av * (Sv / S) * (zv / b);
const Clp = -(4 * aw / (S * b * b)) * integrate((y) => chordAt(y) * y * y);
const Clda = (2 * aw * tauA / (S * b)) * integrate((y) => chordAt(y) * y, y1, y2);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
const CndaPerCL = 2 * -0.17 * Clda;

/* The glide. */
const drag = (V, n1 = 1) => {
  const q = 0.5 * rho * V * V;
  const CL = n1 * W / (q * S);
  return q * S * (cd0At(V) + k * CL * CL);
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const sink = (V) => drag(V) * V / W;
let minSink = { s: 9, V: 0 };
let best = { ld: 0, V: 0 };
for (let V = 1.05 * Vs; V < 20; V += 0.005) {
  const s = sink(V);
  if (s < minSink.s) minSink = { s, V };
  const ld = W / drag(V);
  if (ld > best.ld) best = { ld, V };
}
const CLtrim = 2 * W / (rho * best.V * best.V * S);
const Cm0 = -Cma * CLtrim / CLa;

/*
 * THE DISCUS LAUNCH. The pilot holds the peg at the left wing's tip and
 * turns once (Wikipedia, "spins 360 degrees"), the arm straight out at the
 * shoulder: the CG runs on a circle of the arm, 0.75 m of shoulder to
 * fingertip, and the half span, 0.745 m, about the pilot, and 0.1 m of
 * shoulder off the spine: r 1.6 m, ESTIMATED. The hand lets go at the
 * shoulder's height, 1.5 m, ESTIMATED. The glider is released pitched
 * steeply up; the NRJ's launch preset holds its flaperons flat for the
 * zoom (the manual's "Preset: ailerons 0.0 mm"), which is the section's
 * least drag, and it climbs at near zero lift until the speed is spent.
 *
 * The release speed is not published: it is derived from what is, the
 * heights. Lindinger's NRJ page: "with a little practice ... about 40 m",
 * "experienced pilots can reach 60 m, competition pilots 80 m". The launch
 * the shell throws is an experienced pilot's, 60 m, and the release speed
 * is the one that reaches it in this drag, climbing on the straight line
 * the zoom flies. The instructable of a DLG build (hyperflight's copy)
 * gives "> 80 mph", 35.8 m/s, for 200 ft: the same sum, a lower bound, and
 * the check below that this drag is not far from a real one's.
 */
const spinR = 1.6, spinH = 1.5, spinTurn = 2 * Math.PI, releasePitch = 70 / DEG;
function zoom(V0, gam = releasePitch, cd0Of = cd0At) {
  let h = spinH, V = V0, x = 0;
  const dt = 0.0005;
  while (V > Vs) {
    const q = 0.5 * rho * V * V;
    const CL = W * Math.cos(gam) / (q * S);
    const D = q * S * (cd0Of(V) + k * CL * CL);
    V += (-D / m - g * Math.sin(gam)) * dt;
    h += V * Math.sin(gam) * dt;
    x += V * Math.cos(gam) * dt;
  }
  return { h, x };
}
const targetH = 60;
let lo = 20, hi = 60;
for (let i = 0; i < 60; i += 1) {
  const mid = (lo + hi) / 2;
  if (zoom(mid).h < targetH) lo = mid; else hi = mid;
}
const Vrel = lo;
const Vplant = Math.round(Vrel);
const omegaF = Vplant / spinR;
const spinT = 2 * spinTurn / omegaF;
/* The same launch with no drag at all: the ceiling no drag model can pass. */
const vacuum = (V) => spinH + V * V / (2 * g);

/* Lateral, at the best glide and at 10 m/s. */
const pb2v = Clda * throwA / -Clp;
const betaSS = -Cndr * throwR / Cnb;
function rudderAt(Vc) {
  const qc = 0.5 * rho * Vc * Vc;
  const wn = Math.sqrt(qc * S * b * Cnb / Izz);
  const zeta = (-Cnr * (b / (2 * Vc)) * qc * S * b / Izz - CYb * qc * S / (m * Vc)) / (2 * wn);
  return { wn, zeta, roll: Math.abs(Clb * betaSS / Clp) * (2 * Vc / b) };
}
const tauRoll = (V) => Ixx / (-Clp * 0.5 * rho * V * V * S * b * b / (2 * V));

/* The thermal: circling at a bank in thermal A, W0 (1 - (r/R)^2)^2. */
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

/* The launch preset's elevator: the one that trims the zoom at the zero
 * lift line, Cm0 + Cm_de de = 0 at alpha 0. */
const deZoom = -Cm0 / Cmde;

const f = (x, nd = 3) => Number(x).toFixed(nd);
const rows = [
  ['AR, root chord m, MAC m, MAC LE aft of root m', `${f(AR, 2)} ${f(c0, 4)} ${f(MAC, 4)} ${f(macLE, 4)}`],
  ['CG h (of MAC), tip rise m, W N, W/S N/m2', `${f(hCG, 3)} ${f(tipRise, 3)} ${f(W, 3)} ${f(W / S, 2)}`],
  ['Re at 5 m/s (reference), tail Cf, fuselage Cf', `${f(Reref, 0)} ${f(CfT, 5)} ${f(CfF, 5)}`],
  ['CD0 parts: wing, tail, fuselage, misc = CD0 at ref', `${f(cdWingProfile, 4)} ${f(cdTail, 4)} ${f(cdFuse, 4)} ${f(dCDmisc, 4)} = ${f(CD0, 4)}`],
  ['CD0 at 10, 20, 40 m/s', `${f(cd0At(10), 4)} ${f(cd0At(20), 4)} ${f(cd0At(40), 4)}`],
  ['Oswald e, k', `${f(e, 3)} ${f(k, 4)}`],
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, fuselage Cmα, h_n, static margin', `${f(CLa)} ${f(CmaFuse, 4)} ${f(hn)} ${f(SM)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde)} ${f(CLde, 4)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ (wing, total), Clp, Clδa', `${f(ClbWing, 4)} ${f(Clb, 4)} ${f(Clp)} ${f(Clda)}`],
  ['Cnδr, CYδr, Clδr, Cnδa per CL', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)} ${f(CndaPerCL, 4)}`],
  ['throws a, e, r deg', `${f(throwA * DEG, 1)} ${f(throwE * DEG, 1)} ${f(throwR * DEG, 1)}`],
  ['Ixx, Iyy, Izz kg m2', `${f(Ixx, 5)} ${f(Iyy, 5)} ${f(Izz, 5)}`],
  ['D1 best glide ratio at m/s', `${f(best.ld, 2)} ${f(best.V, 2)}`],
  ['D2 least sink m/s at m/s', `${f(minSink.s, 3)} ${f(minSink.V, 2)}`],
  ['D3 stall m/s, alpha stall rad', `${f(Vs, 2)} ${f(CLmax / CLa, 5)}`],
  ['glide ratio, sink at 6, 8, 10, 15 m/s', [6, 8, 10, 15].map((V) => `${f(W / drag(V), 1)}/${f(sink(V), 2)}`).join(' ')],
  ['D4 pb/2V full aileron; deg/s at 8 m/s; roll tau at 8 m/s s', `${f(pb2v, 4)} ${f(pb2v * 2 * 8 / b * DEG, 0)} ${f(tauRoll(8), 3)}`],
  ['sideslip at full rudder deg', f(betaSS * DEG, 1)],
];
for (const Vc of [best.V, 10]) {
  const o = rudderAt(Vc);
  rows.push([`Dutch roll wn, zeta; rudder roll deg/s at ${f(Vc, 2)} m/s`, `${f(o.wn, 2)} ${f(o.zeta, 3)}; ${f(o.roll * DEG, 1)}`]);
}
for (const [Vt, bank] of [[5.5, 30], [6.0, 35], [6.0, 40]]) {
  const o = circle(Vt, bank, thermals[0]);
  rows.push([`D9 thermal A: ${Vt} m/s at ${bank} deg`, `radius ${f(o.radius, 1)} sink ${f(o.sink, 3)} up ${f(o.up, 3)} climb ${f(o.climb, 3)} (${f(o.stallMargin, 2)} Vs)`]);
}
rows.push(
  ['D5 release speed for 60 m (exact), plant\'s rounded', `${f(Vrel, 2)} ${Vplant}`],
  ['   zoom at the plant\'s speed: top m, run m; drag free top', `${f(zoom(Vplant).h, 1)} ${f(zoom(Vplant).x, 1)}; ${f(vacuum(Vplant), 1)}`],
  ['   40 m (a little practice) and 80 m (competition) need m/s', `${f((() => { let a = 10, z = 60; for (let i = 0; i < 60; i += 1) { const md = (a + z) / 2; if (zoom(md).h < 40) a = md; else z = md; } return a; })(), 1)} ${f((() => { let a = 10, z = 80; for (let i = 0; i < 60; i += 1) { const md = (a + z) / 2; if (zoom(md).h < 80) a = md; else z = md; } return a; })(), 1)}`],
  ['   35.8 m/s (the instructable\'s 80 mph): top m', f(zoom(35.8).h, 1)],
  ['   the same throw on a CD0 fixed at the glide\'s: top m, share of V^2/2g', `${f(zoom(Vplant, releasePitch, () => CD0).h, 1)} ${f((zoom(Vplant, releasePitch, () => CD0).h - spinH) / (Vplant * Vplant / (2 * g)), 3)}`],
  ['   spin: r m, turn rad, final rate rad/s, time s, pull g', `${spinR} ${f(spinTurn, 4)} ${f(omegaF, 3)} ${f(spinT, 3)} ${f(Vplant * omegaF / g, 1)}`],
  ['   launch preset elevator rad (deg)', `${f(deZoom, 5)} (${f(deZoom * DEG, 2)})`],
);
for (const [name, v] of rows) {
  console.log(`${name.padEnd(62)} ${v}`);
}
