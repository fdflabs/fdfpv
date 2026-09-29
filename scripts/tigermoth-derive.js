/*
 * tigermoth-derive.js: the arithmetic behind docs/TIGERMOTH-STAGE1.md, from
 * Great Planes' published figures for its Tiger Moth ARF (GPMA1330: the
 * instruction manual) and de Havilland's rigging diagram of the full size
 * DH.82A, which the ARF is at 1/4.96 on its span, to every coefficient of
 * FW_TIGERMOTH1803 and every derived band in tests/tigermoth-thresholds.json.
 * The aircraft is a biplane: its two wings are solved as two lifting lines
 * in each other's flow by scripts/lib/biplane.js, the solver the Pitts's
 * derivation uses, and flown by the plant's second wing (plant_wing.c
 * biplane_lift). Its engine is the Ugly Stik's O.S. 61FX on a 12 x 6, the
 * first engine Great Planes list. It never loads the plant: this is what
 * the plant is checked against, so it stands apart from it. Harness
 * arithmetic in JS maths, which is allowed here because nothing it prints
 * is hashed. Run with npm run tigermoth:derive.
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

import { biplaneCell } from './lib/biplane.js';

const DEG = 180 / Math.PI;
const rho = 1.225;
const g = 9.81;
const IN = 0.0254;

/*
 * THE KIT, Great Planes' manual (GPMZ0231 for GPMA1330 V1.2): wingspan 71
 * in, wing area 1360 sq in, 10.25 lb, length 60 in; an O.S. .61 FX two
 * stroke first in its engine list; the CG 2 3/4 in behind the bottom
 * wing's leading edge at the fuselage (64 to 76 mm allowed); throws at the
 * widest part of each surface, high rate: elevator 1 in each way, rudder 2
 * in each way, ailerons 3/4 in each way; low rate 3/4, 2 and 1/2 in; 3 1/4
 * in main wheels and a 1 1/4 in tail wheel on a wire steered by the
 * rudder. The weight is taken as flying weight with the tank full, as the
 * Kadet's and the Stik's are (the manual's own conversion, 4592 g, is not
 * 10.25 lb: 17.35 oz/sq ft on 1360 sq in is 10.25 lb, 4649 g).
 */
const b = 71 * IN;
const S = 1360 * IN * IN;
const m = 10.25 * 0.45359237, W = m * g;
const cgBehindLE = 70e-3;

/*
 * THE FULL SIZE, de Havilland's DH.82A rigging diagram (British Aerospace,
 * reproduced at jeversteamlaundry.org/tigpic024.htm), in metres: span 8.94,
 * length 7.29, chord 1.33 ("4' 4 1/2''"), dihedral 2 deg 45 min on the top
 * wing and 4 deg 30 min on the bottom, incidence 4 deg on both "parallel
 * with ribs", stagger 0.562 m at the root and 0.530 at the interplane
 * strut, sweepback at the strut 0.279 m on the top plane and 0.231 on the
 * bottom, tailplane span 3.00. Measured off the same drawing (30.25 mm a
 * pixel on its span in the front view, 30.1 on its length and tailplane in
 * the plan view): the gap 1.558 m at the interplane strut, 3.05 m out; the
 * bottom wing's root 1.64 m behind the spinner's tip; the tailplane's
 * leading edge at the root 5.73 m and its hinge 6.38 m behind it, the
 * rudder's trailing edge 7.29; the tailplane and elevators 2.40 m^2
 * outside the fuselage (2.87 through it), the elevators about half its
 * chord; the fin and rudder 1.12 m^2, the rudder 0.80 of it, 1.0 m at its
 * widest; the side view (the aircraft level on trestles, 30.5 mm a pixel)
 * the top wing's chord plane 0.99 m over the thrust line and the bottom
 * one's 0.58 m under it, the main axles 1.28 m under it, the fuselage's
 * bottom 0.40 m under it at the tail post, the rudder's top 1.22 m over
 * it. The ARF is the full size at k = 71 in / 8.94 m on its span: its
 * published area checks against the full size's 239 sq ft (22.20 m^2) at
 * that scale to 3 percent (0.877 against 0.903 m^2) and its 60 in length
 * against 7.29 m to 4 percent. What is taken off the drawing is ESTIMATED
 * to a pixel, 6 mm at the model's scale.
 */
const k = b / 8.94;
const chord = 1.33 * k;
const dih1 = (2 + 45 / 60) / DEG, dih2 = (4 + 30 / 60) / DEG;
const incidence = 4 / DEG;
const staggerRoot = 0.562 * k;
const yStrut = 3.05 * k;
const sweep1 = Math.atan(0.279 / 3.05), sweep2 = Math.atan(0.231 / (3.05 - 0.31));
const gapStrut = 1.558 * k;
/* The fuselage's half width at the bottom wing's root, 0.31 m. */
const yRoot2 = 0.31 * k;
/*
 * The planforms. Both wings span the whole 71 in (the drawing's front view
 * has their tips one over the other); the bottom wing is two panels off
 * the fuselage's sides, the top wing one across the centre section. Their
 * areas: the rectangles, less the four rounded tips and the top wing's cut
 * out over the rear cockpit, the two together Great Planes' 1360 sq in.
 * The tips and the cut out are what brings the rectangles to the kit's
 * figure, shared four tips at 0.0115 m^2 and the cut out 0.0115, ESTIMATED.
 */
const rect1 = b * chord, rect2 = (b - 2 * yRoot2) * chord;
const cut = (rect1 + rect2 - S) / 5;
const S1 = rect1 - 3 * cut, S2 = rect2 - 2 * cut;
/*
 * Stations, m forward of the CG. The bottom wing's leading edge at its
 * root, 70 mm ahead of the CG (the kit's CG); the top wing's 0.562 k
 * ahead of that. Each wing's aerodynamic centre is its mean chord's
 * quarter point, the mean chord of a rectangle halfway out its panel,
 * where the sweep has taken its leading edge back.
 */
const xLE2 = cgBehindLE, xLE1 = xLE2 + staggerRoot;
const yMac1 = b / 4, yMac2 = (yRoot2 + b / 2) / 2;
const xAc1 = xLE1 - yMac1 * Math.tan(sweep1) - 0.25 * chord;
const xAc2 = xLE2 - (yMac2 - yRoot2) * Math.tan(sweep2) - 0.25 * chord;
/*
 * Heights over the thrust line: the side view's 0.99 and -0.58 m at k, and
 * the gap at the root the strut's plus the two dihedrals' difference over
 * 3.05 m (the front view: 1.652 m at the root).
 */
const z1 = 0.99 * k, z2 = -0.58 * k;
const gapRoot = gapStrut + yStrut * (Math.tan(dih2) - Math.tan(dih1));

const cell = biplaneCell({
  w1: { b, c: chord, S: S1, z: z1, dihedral: dih1, xAc: xAc1 },
  w2: { b, c: chord, S: S2, z: z2, dihedral: dih2, xAc: xAc2 },
  S, eSpan: 0.85,
});
const { aw, kInduced } = cell;
const cbar = chord;
const AR = b * b / S;

/*
 * THE SECTION, ESTIMATED: Great Planes publish none. The full size's RAF
 * 15 is a thin cambered section; the ARF's is built up balsa of a
 * trainer's thickness. Taken as the Cub's class: zero lift at -2 deg on
 * the chord at the model's 1.8e5, CL max 1.05 on each wing, and a gentle
 * trailing edge stall (the Cub's stall_top 4.6 deg and stall_k 0.72). With
 * the full size's 4 deg of incidence to the thrust line the zero lift line
 * of the wings is 6 deg under the thrust line: a Tiger Moth cruises with
 * its tail up and its nose down, and on its three points it sits near its
 * stall.
 */
const alphaZLsection = -2 / DEG;
const CLmaxWing = 1.05;
/*
 * CD0 on the reference area, ESTIMATED 0.058: the full size's own is 0.045
 * (130 hp through a fixed pitch prop at 0.8 at its 109 mph top speed, less
 * its induced drag), a model's skin friction at a hundredth of the
 * Reynolds number a quarter more; two wings, the cabane and eight
 * interplane struts, the flying and landing wires, two open cockpits, a
 * V strut gear on 3 1/4 in wheels.
 */
const CD0 = 0.058;
const CD0full = (() => {
  const V = 109 * 0.44704, P = 130 * 745.7 * 0.8, Sfs = 22.2, mfs = 828;
  const q = 0.5 * rho * V * V, CL = mfs * g / (q * Sfs);
  const kfs = 1 / (Math.PI * 0.8 * 8.94 * 8.94 / Sfs * 1.13 * 1.13);
  return P / V / (q * Sfs) - kfs * CL * CL;
})();

/*
 * THE TAIL at k. The tailplane and elevators 2.40 m^2 outside the
 * fuselage, their mean aerodynamic chord's quarter point about 6.00 m
 * behind the spinner's tip (the leading edge at 5.73 at the root, the
 * hinge at 6.38, the elevators' trailing edge 7.14); the elevators half
 * the chord, 0.60 m of it at the root; the tailplane mounted on the
 * fuselage's top longerons at the thrust line. The fin and rudder 1.12
 * m^2, their centre of area 6.62 m back and 0.10 k m over the thrust line
 * (1.0 m full size to the centroid of the egg), the rudder 0.80 of it,
 * 1.0 m at its widest; the vertical tail's height 1.22 m over the thrust
 * line and 0.40 under it.
 */
const noseToCG = 1.64 * k + cgBehindLE;
const Sh = 2.40 * k * k, bh = 3.00 * k, xAcT = noseToCG - 6.00 * k, zh = 0;
const Sv = 1.12 * k * k, xAcV = noseToCG - 6.62 * k, zv = 0.5 * k, hv = 1.62 * k;
const eta = 0.9;
const cfE = 0.5, cfR = 0.8;
const elevChord = 0.60 * k, rudChord = 1.0 * k;
/*
 * The ailerons, on the bottom wing only (the full size's and the kit's:
 * "Bottom Wing w/Ailerons"), from the root of its outer panel's last two
 * thirds to the tip: 0.35 to 0.89 m out, their chord a quarter of the
 * wing's, 67 mm, ESTIMATED off the full size's. No differential: each
 * aileron is its own servo on a straight pushrod (the manual's "Hook up
 * the Ailerons").
 */
const yA0 = 0.35, yA1 = 0.89, cfA = 0.25, ailChord = cfA * chord;
const lh = cell.xAc - xAcT, lv = -xAcV;

/* Throws: Great Planes' high rate at the widest part of each surface. */
const throwA = Math.asin(0.75 * IN / ailChord), throwE = Math.asin(1.0 * IN / elevChord), throwR = Math.asin(2.0 * IN / rudChord);
const lowA = Math.asin(0.5 * IN / ailChord), lowE = Math.asin(0.75 * IN / elevChord), lowR = Math.asin(2.0 * IN / rudChord);
const expo = 0.30; /* the house stock expo (configs/tuning.js); Great Planes give none */
const tauOf = (cf) => { const th = Math.acos(1 - 2 * (1 - cf)); return 1 - (th - Math.sin(th)) / Math.PI; };
const tauA = tauOf(cfA), tauE = tauOf(cfE), tauR = tauOf(cfR);

/*
 * THE COEFFICIENTS, Nelson's forms on the cell, as the Pitts's. The
 * downwash at the tail DATCOM's on the equivalent monoplane's aspect
 * ratio, the tail at the cell's mean height, 0.21 k m under it... The
 * fuselage's share, Raymer eq. 16.25: K_fus 0.007 per deg with the wing a
 * quarter of the way back, its 0.18 m width at the cockpits and 1.524 m.
 */
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const ARe = (cell.kSpanCarried * b) ** 2 / S;
const KA = 1 / ARe - 1 / (1 + Math.pow(ARe, 1.7));
const KL = 1;
const hH = (z1 + z2) / 2 - zh;
const KH = (1 - hH / b) / Math.cbrt(2 * lh / b);
const deda = 4.44 * Math.pow(KA * KL * KH, 1.19);
const VH = Sh * lh / (S * cbar);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const fusW = 0.18, fusL = 60 * IN;
const fusCma = 0.007 * fusW * fusW * fusL / (cbar * S) * DEG;
const hAc = -cell.xAc / cbar;
const SM = hAc + VH * eta * (at / aw) * (1 - deda) - fusCma / CLa;
const Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / cbar;
const Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
/* The zero lift line of the aircraft: the wings' at the incidence, the
 * tailplane's at none, its share. */
const a0w = alphaZLsection - incidence;
const tailK = at * (Sh / S) * eta;
const alphaZL = (aw * a0w + tailK * (-deda * a0w)) / (aw + tailK * (1 - deda));
/* The fin's aspect ratio on its height over its area, raised by the
 * fuselage under it (the Stik's 1.5). */
const arV = 1.5 * hv * hv / Sv, av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const CYb = -av * Sv / S - 0.10;
/* The fuselage's weathercock term, Nelson eq. 2.64 on its side area at k,
 * 4.2 m^2 full size, over its length. Destabilising. */
const CnbFus = -0.0012 * DEG * (4.2 * k * k / S) * (fusL / b);
const Cnb = av * VV + CnbFus;
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/*
 * Roll with sideslip: each wing's dihedral on its share, DATCOM's -a
 * (Gamma / 6) (1 + 2 lambda)/(1 + lambda), a rectangle's Gamma a / 4; each
 * wing's height over or under the fuselage's centre line, DATCOM's -1.2
 * sqrt(AR) (z/b)(2d/b) with z positive for a wing under it: the top wing
 * is a parasol well over the fuselage, the bottom a low wing under it;
 * and the fin over the CG.
 */
const ClbDih = -(cell.A1 * (S1 / S) * dih1 + cell.A2 * (S2 / S) * dih2) / 4;
const dFus = 0.18;
const zFusC = -0.10 * k; /* the fuselage's centre line under the thrust line, ESTIMATED */
const ClbHeight = -1.2 * Math.sqrt(AR) * (2 * dFus / b) * (cell.share1 * (zFusC - z1) + cell.share2 * (zFusC - z2)) / b;
const ClbFin = -av * (Sv / S) * (zv / b);
const Clb = ClbDih + ClbHeight + ClbFin;
/* Roll damping and the ailerons, strip theory on each wing at its own
 * slope in the other's wash, over the reference S b. */
function integrate(f, a, bb, n = 4000) { let s = 0; for (let i = 0; i < n; i += 1) { const y = a + (bb - a) * (i + 0.5) / n; s += f(y) * (bb - a) / n; } return s; }
const Clp = -(cell.A1 * integrate((y) => chord * y * y, 0, b / 2) + cell.A2 * integrate((y) => chord * y * y, yRoot2, b / 2)) * 4 / (S * b * b);
const Clda = 2 * tauA * cell.A2 * integrate((y) => chord * y, yA0, yA1) / (S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
/*
 * ADVERSE YAW. Nelson's form, as the Cub's and the Skyhunter's: Cn_da = 2
 * K CL Cl_da, K = -0.17 for plain ailerons out along a wing, the aileron's
 * own load's induced drag. Here the ailerons are on the bottom wing alone,
 * whose own CL runs bip_r of the cell's, and they work with no
 * differential. The bottom wing also flies in the top wing's downwash,
 * mut2 CL1 over its own: the lift the ailerons add is tilted back by that
 * too, one more -mut2 CL1 Cl_da (Prandtl's mutual term, the
 * derivation's own). Per unit of the cell's CL.
 */
const Kny = -0.17;
const partnerWash = cell.mut2 * cell.r1;
const CndaPerCL = 2 * Kny * cell.r2 * Clda - partnerWash * Clda;
const ClrPerCL = 0.25, CnpPerCL = -0.125;

/*
 * THE ENGINE: the Ugly Stik's O.S. 61FX on a 12 x 6, O.S.'s first prop for
 * it (docs/UGLYSTIK-STAGE1.md, scripts/power-derive.js): 10,895 rpm and
 * 36.206 N standing, 0.612 N m, 2,000 rpm idle, the throttle running the
 * rpm linearly from the idle to full.
 */
const rpmLoaded = 10895, pitchIn = 6, propR = 6 * IN;
const Ts = 36.206, shaftTorque = 0.6119;
const idle = 2000 / rpmLoaded;
const rpmNL = rpmLoaded / 0.85;
const Vp = rpmNL / 60 * pitchIn * IN * 0.85;
const dutyOf = (stick) => idle + (1 - idle) * stick;
const T = (V, stick) => { const d = dutyOf(stick); return Math.max(0, Ts * d * d * (1 - V / (Vp * d))); };

/*
 * MASS AND INERTIA, ESTIMATED from the parts, x forward of the CG and z
 * over the thrust line: the 61FX, its silencer, the prop and spinner 0.62
 * kg just behind the spinner; the cowl; the full tank behind the firewall
 * (the firewall 0.176 m behind the spinner's tip: the back plate 146 mm
 * ahead of it, the manual); the gear and wheels at the axles; the radio,
 * five servos, the receiver and its pack; each wing along its span; the
 * cabane and interplane struts and the wires; the tail group; the tail
 * wheel; the two pilots and the windscreens; the fuselage the rest, its
 * mass centre where the CG comes out at the kit's mark.
 */
const firewallX = noseToCG - 0.176;
const mainX = noseToCG - 1.64 * k + 0.49 * k, mainZ = -1.28 * k;
const tailX = noseToCG - 7.12 * k, tailZ = -0.40 * k - 0.030;
const parts = [
  { name: 'engine, silencer, prop, spinner', m: 0.62, x: firewallX + 0.10, z: 0.0, r: [0.04, 0.05, 0.05] },
  { name: 'cowl', m: 0.10, x: firewallX + 0.08, z: -0.01, r: [0.07, 0.06, 0.06] },
  { name: 'tank, full', m: 0.36, x: firewallX - 0.06, z: -0.01, r: [0.03, 0.05, 0.05] },
  { name: 'main gear and wheels', m: 0.32, x: mainX + 0.04, z: mainZ * 0.6, r: [0.12, 0.03, 0.12] },
  { name: 'radio, five servos, receiver, pack', m: 0.40, x: 0.02, z: -0.04, r: [0.05, 0.08, 0.08] },
  { name: 'top wing', m: 0.55, x: xLE1 - yMac1 * Math.tan(sweep1) - 0.40 * chord, z: z1, r: [b / Math.sqrt(12), chord / Math.sqrt(12), b / Math.sqrt(12)] },
  { name: 'bottom wing with the aileron servos', m: 0.55, x: xLE2 - (yMac2 - yRoot2) * Math.tan(sweep2) - 0.40 * chord, z: z2, r: [b / Math.sqrt(12), chord / Math.sqrt(12), b / Math.sqrt(12)] },
  { name: 'cabane and interplane struts, wires', m: 0.18, x: 0.0, z: (z1 + z2) / 2, r: [0.45, 0.05, 0.45] },
  { name: 'tail group', m: 0.20, x: xAcT - 0.02, z: 0.03, r: [0.15, 0.06, 0.15] },
  { name: 'tail wheel and wire', m: 0.03, x: tailX, z: tailZ, r: [0, 0, 0] },
  { name: 'pilots, windscreens', m: 0.10, x: -0.15, z: 0.05, r: [0.02, 0.15, 0.15] },
];
const fuseM = m - parts.reduce((a, p) => a + p.m, 0);
const fuseX = -parts.reduce((a, p) => a + p.m * p.x, 0) / fuseM;
parts.push({ name: 'fuselage', m: fuseM, x: fuseX, z: -0.10 * k, r: [0.06, fusL / Math.sqrt(12), fusL / Math.sqrt(12)] });
/* The CG's height over the thrust line from the masses. */
const zCG = parts.reduce((a, p) => a + p.m * p.z, 0) / m;
const inertia = [0, 0, 0];
for (const p of parts) {
  const dx = p.x, dz = p.z - zCG;
  inertia[0] += p.m * (dz * dz + p.r[0] * p.r[0]);
  inertia[1] += p.m * (dx * dx + dz * dz + p.r[1] * p.r[1]);
  inertia[2] += p.m * (dx * dx + p.r[2] * p.r[2]);
}
const [Ixx, Iyy, Izz] = inertia;
/* The thrust line over the CG. */
const thrustZ = -zCG;

/* Performance on the plant's polar: the cell's linear lift, CD0 and the
 * biplane's induced drag. */
const rMax = Math.max(cell.r1, cell.r2);
const CLmaxCell = CLmaxWing / rMax;
const D = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + kInduced * CL * CL); };
const level = (d) => {
  let lo = 4, hi = 40;
  if (T(lo, d) < D(lo) && T(8, d) < D(8)) return null;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > D(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmaxCell));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + kInduced * CL * CL); };
const CLopt = Math.sqrt(CD0 / kInduced), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
let best = { vz: -1, V: 0 };
for (let V = 1.15 * Vs; V < 26; V += 0.02) { const vz = (T(V, 1) - D(V)) * V / W; if (vz > best.vz) best = { vz, V }; }
const Vtrim = level(0.75);
const CLtrim = 2 * W / (rho * Vtrim * Vtrim * S);
const Cm0 = -Cma * CLtrim / CLa + thrustZ * D(Vtrim) / (0.5 * rho * Vtrim * Vtrim * S * cbar);

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
function longitudinal(V) {
  const q = 0.5 * rho * V * V, CL = W / (q * S);
  const Xu = -2 * q * S * (CD0 + kInduced * CL * CL) / (m * V);
  const Zu = -2 * q * S * CL / (m * V);
  const Za = -q * S * (CLa + CD0) / m;
  const Ma = q * S * cbar * Cma / Iyy;
  const Mq = q * S * cbar * Cmq * cbar / (2 * V) / Iyy;
  const A = [[Xu, 0, 0, -g], [Zu / V, Za / V, 1, 0], [0, Ma, Mq, 0], [0, 0, 1, 0]];
  const rs = roots(charPoly(A)).filter((r) => r.im > 1e-6).map((r) => ({ period: 2 * Math.PI / r.im, zeta: -r.re / Math.hypot(r.re, r.im) }));
  rs.sort((x, y) => y.period - x.period);
  return { phugoid: rs[0], short: rs[1] };
}
/* The lateral model, Nelson ch. 5, and its aileron and rudder inputs. */
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
  const Ba = [0, q * S * b * Clda / Ixx, q * S * b * CndaPerCL * CL / Izz, 0];
  /* The rudder: trailing edge left positive, nose left; the plant's cn_dr
   * negative, so a positive stick (right rudder) is -throw here. */
  const Br = [q * S * CYdr / (m * V), q * S * b * Cldr / Ixx, q * S * b * Cndr / Izz, 0];
  return { V, CL, A, Ba, Br, spiral: real[real.length - 1], rollTau: -1 / real[0], dutch: dr ? { wn: Math.hypot(dr.re, dr.im), zeta: -dr.re / Math.hypot(dr.re, dr.im) } : null };
}
/*
 * A turn entry on the linear lateral model: full right aileron from level,
 * and the rudder stick at `rud` of full right with it; to 30 deg of bank or
 * 3 s. The heading the nose swings through the wrong way first (negative
 * is left, against a right roll), the peak sideslip and when the bank
 * reaches 30 deg.
 */
function turnEntry(lat, rud) {
  let x = [0, 0, 0, 0];
  const dt = 0.0005;
  let t = 0, psi = 0, psiMin = 0, betaPk = 0, t30 = null, rMin = 0;
  const da = throwA, dr = -rud * throwR;
  while (t < 3) {
    const dx = lat.A.map((row, i) => row.reduce((s, v, j) => s + v * x[j], 0) + lat.Ba[i] * da + lat.Br[i] * dr);
    x = x.map((v, i) => v + dx[i] * dt);
    psi += x[2] * dt;
    psiMin = Math.min(psiMin, psi);
    rMin = Math.min(rMin, x[2]);
    betaPk = Math.max(betaPk, Math.abs(x[0]));
    t += dt;
    if (t30 === null && x[3] >= 30 / DEG) { t30 = t; break; }
  }
  return { psiMinDeg: psiMin * DEG, rMinDegS: rMin * DEG, betaDeg: betaPk * DEG, t30 };
}

/*
 * THE GEAR, at k off the side view: the main axles 0.49 k ahead of the
 * bottom wing's root leading edge and 1.28 k under the thrust line, with
 * the kit's 3 1/4 in wheels; the tail wheel under the rudder post, the
 * fuselage's bottom there 0.40 k under the thrust line and the kit's wire
 * 30 mm under that, with its 1 1/4 in wheel. The track 1.60 k.
 */
const wheelR = 3.25 / 2 * IN, tailR = 1.25 / 2 * IN, track = 1.60 * k;
const mZ = mainZ - zCG, tZ = tailZ - zCG;
const restPitch = Math.atan2((tZ - tailR) - (mZ - wheelR), mainX - tailX);
const th = restPitch;
const along = (x, z) => x * Math.cos(th) - z * Math.sin(th);
const cgHeight = -((mZ - wheelR) * Math.cos(th) + mainX * Math.sin(th));
const mainW = along(mainX, mZ), tailW = along(tailX, tZ);
const tailShare = mainW / (mainW - tailW);
const loadMain = W * (1 - tailShare) / 2, loadTail = W * tailShare;
const defl = 0.006;
const kMain = loadMain / defl, kTail = loadTail / defl;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mTail = (Iyy + m * mainW * mainW) / Math.pow(mainW - tailW, 2);
const cTail = 2 * 0.6 * Math.sqrt(kTail * mTail);
const propX = noseToCG - 0.02;
const propClearRest = propX * Math.sin(th) + (thrustZ - propR) * Math.cos(th) + cgHeight;
/* The wing's angle standing on its three points, over its stall. */
const alphaRest = restPitch - alphaZL;

function takeoff(mu, vRot, Vtail) {
  let V = 0, x = 0, t = 0;
  const dt = 0.001;
  while (V < vRot && t < 30) {
    const a = (V < Vtail ? restPitch : 0) - alphaZL;
    const CL = CLa * a, CD = CD0 + kInduced * CL * CL;
    const q = 0.5 * rho * V * V;
    const acc = (T(V, 1) - q * S * CD - mu * Math.max(0, W - q * S * CL)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, V };
}

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const lat = lateral(Vtrim);
const latSlow = lateral(1.3 * Vs);
const lon = longitudinal(Vtrim);
const rows = [
  ['scale k, chord m, S1 S2 m^2 (tips and cut out each)', `${f(k, 5)} ${f(chord, 4)} ${f(S1, 5)} ${f(S2, 5)} (${f(cut, 5)})`],
  ['S ref m^2, m kg, W/S N/m^2 (oz/sq ft), AR on S', `${f(S, 5)} ${f(m, 4)} ${f(W / S, 2)} (${f(10.25 * 16 / (1360 / 144), 2)}) ${f(AR, 3)}`],
  ['full size area at k m^2, length at k m', `${f(22.2 * k * k, 4)} ${f(7.29 * k, 4)}`],
  ['z1 z2 m, gap root m, gap strut m, G/c', `${f(z1, 4)} ${f(z2, 4)} ${f(gapRoot, 4)} ${f(gapStrut, 4)} ${f(gapRoot / chord, 3)}`],
  ['sweep top, bottom deg; stagger root m', `${f(sweep1 * DEG, 2)} ${f(sweep2 * DEG, 2)}; ${f(staggerRoot, 4)}`],
  ['ac: top, bottom, cell (m ahead of the CG); stagger of the acs', `${f(xAc1, 4)} ${f(xAc2, 4)} ${f(cell.xAc, 4)}; ${f(cell.stagger, 4)}`],
  ['Trefftz self check; sigma, Prandtl chart fit', `${f(cell.selfCheck, 5)}; ${f(cell.sigma, 4)} ${f(cell.sigmaFit, 4)}`],
  ['Munk span factor, carried; k_induced biplane, monoplane', `${f(cell.kMunk, 4)} ${f(cell.kSpanCarried, 4)}; ${f(kInduced, 5)} ${f(cell.kMono, 5)}`],
  ['A1 A2, a_w cell, monoplane', `${f(cell.A1, 4)} ${f(cell.A2, 4)} ${f(aw, 4)} ${f(cell.awMono, 4)}`],
  ['bip_w; bip_r', `${f(cell.bipW[0], 4)} ${f(cell.bipW[1], 4)}; ${f(cell.bipR[0], 4)} ${f(cell.bipR[1], 4)}`],
  ['bip_m; bip_x', `${f(cell.bipM[0], 4)} ${f(cell.bipM[1], 4)}; ${f(cell.bipX[0], 4)} ${f(cell.bipX[1], 4)}`],
  ['bip_ki; bip_kx', `${f(cell.bipKi[0], 5)} ${f(cell.bipKi[1], 5)}; ${f(cell.bipKx[0], 5)} ${f(cell.bipKx[1], 5)}`],
  ['tail: AR_t a_t l_h V_H dε/dα (AR_e); S_h S_v', `${f(ARt, 3)} ${f(at, 4)} ${f(lh, 4)} ${f(VH, 4)} ${f(deda, 4)} (${f(ARe, 3)}); ${f(Sh, 5)} ${f(Sv, 5)}`],
  ['CLα, h_ac, static margin, fus', `${f(CLa, 4)} ${f(hAc, 4)} ${f(SM, 4)} ${f(fusCma, 4)}`],
  ['zero lift line deg; its sin, cos', `${f(alphaZL * DEG, 3)}; ${Math.sin(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)} ${Math.cos(Math.round(alphaZL * DEG * 100) / 100 / DEG).toPrecision(17)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq, 3)} ${f(Cmde, 4)} ${f(CLde, 4)}`],
  ['fin: AR_v a_v V_V l_v; CYβ Cnβ (fus) Cnr', `${f(arV, 3)} ${f(av, 4)} ${f(VV, 5)} ${f(lv, 4)}; ${f(CYb, 4)} ${f(Cnb, 4)} (${f(CnbFus, 4)}) ${f(Cnr, 4)}`],
  ['Clβ: dihedral, heights, fin, total', `${f(ClbDih, 4)} ${f(ClbHeight, 4)} ${f(ClbFin, 4)} ${f(Clb, 4)}`],
  ['Clp, Clδa', `${f(Clp, 4)} ${f(Clda, 4)}`],
  ['Cnδa per CL: the partner\'s wash per CL, value', `${f(partnerWash, 4)} ${f(CndaPerCL, 4)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['throws high a e r; low a e r deg; tau a e r', `${f(throwA * DEG, 4)} ${f(throwE * DEG, 4)} ${f(throwR * DEG, 4)}; ${f(lowA * DEG, 2)} ${f(lowE * DEG, 2)} ${f(lowR * DEG, 2)}; ${f(tauA)} ${f(tauE)} ${f(tauR)}`],
  ['mass: fuselage kg at x; CG under the thrust line m', `${f(fuseM, 3)} ${f(fuseX, 4)}; ${f(zCG, 4)}`],
  ['inertia Ixx Iyy Izz', `${f(Ixx, 4)} ${f(Iyy, 4)} ${f(Izz, 4)}`],
  ['engine: T/W, rpm NL, V_p, idle, torque arm', `${f(Ts / W, 3)} ${f(rpmNL, 1)} ${f(Vp, 3)} ${f(idle, 4)} ${f(shaftTorque / Ts, 5)}`],
  ['CD0, the full size\'s', `${f(CD0, 3)} ${f(CD0full, 4)}`],
  ['T1 level at 75 (the trim), 100, 50 percent', `${f(Vtrim, 2)} ${f(level(1), 2)} ${f(level(0.5), 2)}`],
  ['T2 stall m/s; cell CLmax; the top wing\'s stall alpha deg, the bottom\'s', `${f(Vs, 3)}; ${f(CLmaxCell, 4)}; ${f(CLmaxWing / (cell.r1 * CLa) * DEG, 2)} ${f(CLmaxWing / (cell.r2 * CLa) * DEG, 2)}`],
  ['T3 glide L/D at 1.4 Vs; best at m/s; the monoplane\'s at 1.4 Vs', `${f(ld(1.4 * Vs), 3)} ${f(LDmax, 3)} ${f(Vmd, 2)}; ${f((() => { const V = 1.4 * Vs; const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + cell.kMono * CL * CL); })(), 3)}`],
  ['T5 best climb m/s at m/s', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['T6 full aileron pb/2V; deg/s at the trim; low rate pb/2V', `${f(Clda * throwA / -Clp, 4)} ${f(Clda * throwA / -Clp * 2 * Vtrim / b * DEG, 1)}; ${f(Clda * lowA / -Clp, 4)}`],
  ['T7 turn entry at the trim, feet off: psi min deg, r min deg/s, beta deg, t30 s', (() => { const r = turnEntry(lat, 0); return `${f(r.psiMinDeg, 2)} ${f(r.rMinDegS, 2)} ${f(r.betaDeg, 2)} ${f(r.t30, 3)}`; })()],
  ['   the same at 1.3 Vs', (() => { const r = turnEntry(latSlow, 0); return `${f(r.psiMinDeg, 2)} ${f(r.rMinDegS, 2)} ${f(r.betaDeg, 2)} ${f(r.t30, 3)} at ${f(latSlow.V, 2)}`; })()],
  ['   with rudder at 0.5, 0.75, 1.0 of the aileron, the trim: beta deg; psi min deg', [0.5, 0.75, 1.0].map((r) => f(turnEntry(lat, r).betaDeg, 2)).join(' ') + '; ' + [0.5, 0.75, 1.0].map((r) => f(turnEntry(lat, r).psiMinDeg, 2)).join(' ')],
  ['   with rudder at 0.5, 0.75, 1.0 of the aileron, 1.3 Vs: beta deg', [0.5, 0.75, 1.0].map((r) => f(turnEntry(latSlow, r).betaDeg, 2)).join(' ')],
  ['   with rudder at 0.5, 0.75, 1.0, 1.3 Vs: psi min deg', [0.5, 0.75, 1.0].map((r) => f(turnEntry(latSlow, r).psiMinDeg, 2)).join(' ')],
  ['   lateral: spiral root, roll tau s, Dutch roll wn zeta (trim)', `${f(lat.spiral, 4)} ${f(lat.rollTau, 4)} ${lat.dutch ? `${f(lat.dutch.wn, 2)} ${f(lat.dutch.zeta)}` : 'none'}`],
  ['   phugoid s zeta; short period s zeta', `${f(lon.phugoid && lon.phugoid.period, 2)} ${f(lon.phugoid && lon.phugoid.zeta)}; ${f(lon.short && lon.short.period, 3)} ${f(lon.short && lon.short.zeta)}`],
  ['alpha at full up linear deg; the top wing\'s stall', `${f((Cm0 + Cmde * throwE) / -Cma * DEG, 2)} ${f(CLmaxWing / (cell.r1 * CLa) * DEG, 2)}`],
  ['stall arms: ac (CG behind the cell ac), cp, dw', `${f(-hAc, 4)} ${f((cell.xAc - 0.15 * cbar) / cbar * -1, 4)} ${f(eta * VH * at * deda / aw, 4)}`],
  ['rest: pitch deg, CG height m, tail share; wing alpha deg', `${f(restPitch * DEG, 3)} ${f(cgHeight, 4)} ${f(tailShare, 4)}; ${f(alphaRest * DEG, 2)}`],
  ['   main axle x z r, tail axle x z r (body, CG origin)', `${f(mainX, 4)} ${f(mZ, 4)} ${f(wheelR, 4)}; ${f(tailX, 4)} ${f(tZ, 4)} ${f(tailR, 4)}; track ${f(track, 4)}`],
  ['   k main, c main, k tail, c tail', `${f(kMain, 0)} ${f(cMain, 2)} ${f(kTail, 0)} ${f(cTail, 2)}`],
  ['   prop tip clearance at rest m; prop x', `${f(propClearRest, 4)}; ${f(propX, 4)}`],
  ['   CG behind the mains, wheelbase, ratio', `${f(mainW, 4)} ${f(mainW - tailW, 4)} ${f(mainW / (mainW - tailW), 4)}`],
  ['T12 take off, grass, rotated at 1.2 Vs, tail up at 0.5 Vs', JSON.stringify(takeoff(0.08, 1.2 * Vs, 0.5 * Vs), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))],
  ['T14 taxi radius at full rudder, the tail wheel turning with the rudder', f((mainW - tailW) / Math.tan(throwR), 3)],
  ['T10 prop torque N m', f(shaftTorque, 4)],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(66)} ${v}`);
}
