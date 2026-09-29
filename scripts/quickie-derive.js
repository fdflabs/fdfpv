/*
 * quickie-derive.js: the arithmetic behind docs/QUICKIE-STAGE1.md, from
 * Glen Spickler's Quickie 500 (American Aircraft Modeler, December 1972:
 * the article and its plan, which Outerzone's scan, oz6868, carries at
 * full size, measured), RCM's product test of Spickler's kit (its
 * specification table and its prototype), Old School Model Works' manual
 * for its kit of the same design (the control throws), Peter Chinn's
 * bench test of the K&B 40 R/C and APC's propeller data, to every
 * coefficient and every derived band. It never loads the plant: this is
 * what the plant is checked against, so it has to stand apart from it.
 * Harness arithmetic in JS maths, which is allowed here because nothing it
 * prints is hashed. It follows uglystik-derive.js where the two are alike
 * (a glow engine, four channels, strip ailerons, a symmetric section) and
 * edge-derive.js and bombshell-derive.js for a taildragger's rest. Run
 * with npm run quickie:derive.
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
const R = (inches) => inches * 0.0254;
const SQIN = R(1) * R(1);

/*
 * THE PLAN, measured. Outerzone's scan of the AAM plan (oz6868) is full
 * size: its wing's chord reads 10.05 in over the pixels at 100 per inch,
 * the kit's "Constant Chord 10 inches" (RCM), and its 2 1/4 in wheel 2.25.
 * Stations are inches along the plan's side view from its left edge, aft
 * positive; heights inches DOWN the sheet.
 *
 *   wing      constant chord, 10.0 in from the leading edge to the aileron's
 *             trailing edge, the leading edge at station 11.2, the chord
 *             line at height 23.55, under the fuselage (a low wing, "Wing
 *             Location Low Wing"); the sheeted panel 23.97 in out from the
 *             centre line and a soft block tip to 25.46, 12.7 sq in each;
 *             "15% Symmetrical" (RCM); at no incidence to the thrust line,
 *             "everything is zero-zero" (Spickler)
 *   ailerons  strip ailerons of 1 x 1/4 in hard balsa ("the 1 x 1/4
 *             ailerons"), 1.0 in of the chord, from 1.54 in out (the
 *             fuselage's side) to the tip rib at 23.97
 *   dihedral  "1 5/8 inches or 4 degrees" each tip (RCM), the plan's
 *             dihedral detail: 4 deg a side
 *   CG        the plan's C.G. mark, 2.8 in behind the leading edge, station
 *             14.0: Spickler's "1/4 to 1/2 inch behind main spar", its
 *             forward end, the spar's aft face at 13.6
 *   engine    a K&B 40 R/C on a Kraft-Hayes KM-40R mount, the crankshaft
 *             on the firewall's centre at height 22.05, the firewall's
 *             face at station 5.2, the mount's front at 2.3, the prop's
 *             plane 1.4 in ahead of it at 0.9 (the K&B's shaft housing in
 *             Chinn's drawing, ESTIMATED)
 *   fuselage  a box, 2.5 in wide and 2.45 deep at the firewall, 3.0 wide
 *             and 3.65 deep at former C (station 11.1), the top at 20.55
 *             there and 21.7 at the tail, its flat bottom at 23.68 aft of
 *             the wing, ending at station 40.85: 35.6 in behind the
 *             firewall (RCM's "Fuselage Length 37 inches" with the mount)
 *   stab      on top of the fuselage ("Top of Fuselage"), 16.0 in over its
 *             tips, 7.15 in at the centre and 5.1 at the tip including a
 *             1.5 in elevator, its root leading edge at station 35.15, flat
 *             1/4 sheet, height 21.6; RCM's 96 sq in
 *   fin       the swept fin of 1/4 sheet, off the side view: its leading
 *             edge from station 33.0 on the fuselage's top (21.55) to 16.0
 *             at 40.2, the top to 42.2, the rudder's hinge from (40.2,
 *             16.0) to (38.85, 21.7) and its trailing edge from (42.2,
 *             15.95) to (40.85, 21.7), the rudder carried down under the
 *             stab to the fuselage's bottom between 38.8 and 40.4
 *   gear      5/32 in wire legs from metal straps under former C to 2 1/4
 *             in Kraft-Hayes wheels, the axles at station 10.0 and height
 *             27.1; in front the wire runs 2.5 in across and then 3.5 out
 *             and 3.1 down to a 0.6 in axle, so the wheels' centres are
 *             6.3 in either side (the plan's gear detail, read as one leg
 *             of a pair from the centre line, ESTIMATED); a wire tail skid,
 *             its tip at station 41.4, height 24.65
 */
const wingLE = 11.2, chordW = 10.0, ailC = 1.0, ailIn = 1.54, halfTipRib = 23.97, halfTip = 25.46;
const tipBlock = 12.68;
const xCGst = 14.0;
const zChord = 23.55, zTL = 22.05;
const stabLEroot = 35.15, stabLEtip = 37.2, stabHalf = 8.0, stabRootC = 7.15, stabTipC = 5.1, elevC = 1.5;
const zStab = 21.6;
const rudderC = 2.0;
const gammaDeg = 4.0;
const propSt = 0.9;

/* Area: the constant chord panels, the fuselage's width included as the
 * class measures it, and the soft block tips; the plant's chord is S/b. */
const Sin = 2 * halfTipRib * chordW + 2 * tipBlock;
const S = Sin * SQIN;
const b = R(2 * halfTip);
const c = S / b, AR = b * b / S;
/*
 * The weight: RCM's prototype, "Weight, ready to fly: 3 1/2 lbs.", with
 * the 8 oz tank full, as the Stik's and the Kadet's are taken. Spickler:
 * "its average weight of 3 1/2 to 4 1/4 lb".
 */
const m = 3.5 * 0.45359237, W = m * g;
/*
 * A 15 percent symmetric section at 1.7e5 (10 m/s on its 0.254 m chord):
 * its CL max about the NACA 0015's (Sheldahl and Klimas, SAND80-2114),
 * less for the Reynolds number, the wing's 0.9 of it, ESTIMATED; e for a
 * rectangular wing on a square box.
 */
const CLmax = 0.90, e = 0.75, k = 1 / (Math.PI * e * AR);
/*
 * CD0, built up part by part on the wing's area, ESTIMATED (Raymer's
 * form factors and flat plate friction at each part's Reynolds number at
 * 40 m/s, Hoerner for the bluff parts). The class makes a racer draggy on
 * purpose: "The engine and engine mount shall be fully exposed. No
 * cowling", fixed gear, "No wheel pants", a box fuselage (AMA Event 426).
 */
const drag = {
  /* 2.04 times the exposed 478 sq in, turbulent Cf 0.0045 at 7e5, form
   * factor 1.30 for 15 percent. */
  wing: 0.0045 * 1.30 * (2.04 * (Sin - 30)) / Sin,
  /* The box, 300 sq in wetted, Cf 0.0037 at 2.6e6, 1.30 for a square
   * body of fineness 12. */
  fuselage: 0.0037 * 1.30 * 300 / Sin,
  /* The stab and fin of flat 1/4 sheet, 257 sq in wetted, Cf 0.0050, 1.20
   * for a square edged plate. */
  tail: 0.0050 * 1.20 * 257 / Sin,
  /* The K&B on its side, its finned cylinder and head across the flow, and
   * the mount's beams: 3.5 sq in of frontal area at 0.9. */
  engine: 3.5 * 0.9 / Sin,
  /* Two 5/32 in wire legs 3.6 in long at 1.2, two 2 1/4 in wheels 0.8 in
   * wide at 0.25, the axles and collars: 2.45 sq in. */
  gear: (2 * 3.6 * 0.15625 * 1.2 + 2 * 2.25 * 0.8 * 0.25 + 0.20) / Sin,
  /* The blunt firewall's face round the engine, 6.1 sq in at 0.15. */
  nose: 6.1 * 0.15 / Sin,
  /* The skid, the horns, the pushrods' exits, the hinge gaps. */
  misc: 0.0020,
};
const CD0parts = Object.values(drag).reduce((a, v) => a + v, 0);
/* Interference, 5 percent (Raymer, a low wing's). */
const CD0 = 1.05 * CD0parts;
const gamma = gammaDeg / DEG, taper = 1.0;
const cosFactor = Math.cos(gamma) ** 2;
const xAcWing = wingLE + 0.25 * chordW;
const xCG = xCGst;

/* The stabiliser and elevator: RCM's 96 sq in; its mean aerodynamic chord
 * off the trapezoid. */
const Sh = 96 * SQIN;
const bh = R(2 * stabHalf);
const lam = stabTipC / stabRootC;
const yMac = (stabHalf / 3) * (1 + 2 * lam) / (1 + lam);
const cMacT = (2 / 3) * stabRootC * (1 + lam + lam * lam) / (1 + lam);
const xAcTail = stabLEroot + (yMac / stabHalf) * (stabLEtip - stabLEroot) + 0.25 * cMacT;

/* The fin and rudder off the side view, by the shoelace formula: the fin
 * over the fuselage's top, and the rudder's part of it, plus the rudder's
 * piece under the stab down the fuselage's end. */
function poly(pts) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    const cr = x0 * z1 - x1 * z0;
    a += cr; cx += (x0 + x1) * cr; cz += (z0 + z1) * cr;
  }
  return { area: Math.abs(a / 2), x: cx / (3 * a), z: cz / (3 * a) };
}
const finPoly = poly([[33.0, 21.55], [39.4, 16.7], [40.2, 16.0], [42.2, 15.95], [40.85, 21.7]]);
const rudPoly = poly([[40.2, 16.0], [42.2, 15.95], [40.85, 21.7], [38.85, 21.7]]);
const rudLower = 1.6 * 1.7;
const Sv = finPoly.area * SQIN;
const xAcFin = finPoly.x + 0.1 * (42.2 - 33.0) / 4;
const eta = 0.9;
/*
 * Surface effectiveness from each one's share of its surface's chord
 * (Nelson fig. 2.21, as the Stik reads it): the elevator 1.5 of 6.15 in,
 * 24 percent; the rudder about 43 percent of the fin; the strip ailerons
 * 1.0 of 10.0 in, 10 percent, and their open hinge gap.
 */
const tauE = 0.47, tauR = 0.60, tauA = 0.24;
/* The fin's own aspect ratio, its 5.7 in height over its area, raised
 * half again by the fuselage under it (the Stik's rule). */
const finH = 21.55 - 16.0;
const arV = 1.5 * (finH * finH / finPoly.area);
/*
 * OSMW's "Recommended Control Throws": "Aileron 1/2 in up/down, Elevator
 * 1/2 in up/down, Rudder 3/4 in left/right", with "20% on ailerons, 25%
 * on elevator, and 10% on rudder" of expo; neither Spickler nor RCM
 * publishes throws. On the plan's chords: the 1.0 in aileron, the 1.5 in
 * elevator, the 2.0 in rudder. Thirty degrees on a strip aileron is past
 * where a plain flap's lift keeps growing: the Edge's knee, 0.5.
 */
const throwA = Math.asin(0.5 / ailC);
const throwE = Math.asin(0.5 / elevC);
const throwR = Math.asin(0.75 / rudderC);
const knee = 0.5;
const eff = (d) => d / Math.sqrt(1 + (d / knee) ** 2);
const expo = 0.20;
const muGrass = 0.08;

/*
 * THE ENGINE, scripts/power-derive.js: a K&B 40 R/C front intake (RCM's
 * prototype: "K & B FR40", "Muffler Used: No"; Spickler's club rule:
 * "stock series '71' K&B front intake RC engines and 10% fuel"), Peter
 * Chinn's bench curve for its Series 70F (Radio Modeller, February 1971)
 * opened up by what he says the silencer cost, on APC's 9 x 6. Static:
 * 14,831 rpm, 24.553 N, 0.3528 N m. In the air the engine unloads and
 * runs up (17,217 rpm at 44 m/s), and APC's thrust at each speed's
 * operating point is the curve below; the plant's line is pinned at the
 * static thrust and passes through this curve at the level top speed the
 * curve itself gives, so the top speed is the engine's and the prop's, not
 * the line's.
 */
const curve = [[0, 24.55], [4, 23.03], [8, 21.43], [12, 19.82], [16, 18.23], [20, 16.70], [24, 15.25], [28, 13.88],
  [32, 12.62], [36, 11.43], [40, 10.29], [44, 9.22]];
const Tcurve = (V) => {
  for (let i = 1; i < curve.length; i += 1) {
    if (V <= curve[i][0]) {
      const [v0, t0] = curve[i - 1], [v1, t1] = curve[i];
      return t0 + (V - v0) * (t1 - t0) / (v1 - v0);
    }
  }
  const [v0, t0] = curve[curve.length - 2], [v1, t1] = curve[curve.length - 1];
  return t1 + (V - v1) * (t1 - t0) / (v1 - v0);
};
const Ts = 24.553, rpmStatic = 14831, shaftTorque = 0.3528;
/* Chinn's Series 70F idled at "2,700 rpm on an 11 x 6 Power-Prop". */
const idle = 2700 / rpmStatic;
const Dlevel = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + k * CL * CL); };
const vTopCurve = (() => {
  let lo = 20, hi = 60;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (Tcurve(mid) > Dlevel(mid)) lo = mid; else hi = mid; }
  return lo;
})();
const Vp = vTopCurve / (1 - Tcurve(vTopCurve) / Ts);
/* The hangar's other option: the same engine with Chinn's Irvine
 * silencer as he tested it, 42 g more (306 g against 264), on the same
 * prop: 14,011 rpm and 21.832 N standing, and its line fitted the same
 * way (scripts/power-derive.js). */
const curveSil = [[0, 21.83], [4, 20.61], [8, 19.26], [12, 17.82], [16, 16.31], [20, 14.75], [24, 13.20], [28, 11.50],
  [32, 9.75], [36, 8.00], [40, 6.26], [44, 4.51]];
const TsSil = 21.832;
const silenced = (() => {
  const Tc = (V) => {
    for (let i = 1; i < curveSil.length; i += 1) {
      if (V <= curveSil[i][0]) {
        const [v0, t0] = curveSil[i - 1], [v1, t1] = curveSil[i];
        return t0 + (V - v0) * (t1 - t0) / (v1 - v0);
      }
    }
    return 0;
  };
  const mS = m + 0.042, WS = mS * g;
  const DS = (V) => { const q = 0.5 * rho * V * V; const CL = WS / (q * S); return q * S * (CD0 + k * CL * CL); };
  let lo = 15, hi = 44;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (Tc(mid) > DS(mid)) lo = mid; else hi = mid; }
  return { top: lo, Vp: lo / (1 - Tc(lo) / TsSil), m: mS };
})();
const dutyOf = (stick) => idle + (1 - idle) * stick;
const T = (V, stick) => { const d = dutyOf(stick); return Math.max(0, Ts * d * d * (1 - V / (Vp * d))); };

/*
 * MASS AND INERTIA, ESTIMATED from the parts: the K&B, 264 g as Chinn
 * weighed it, its prop, nut and the Kraft-Hayes mount, 0.33 kg at
 * station 3.0 on the thrust line; the 8 oz tank full, 0.237 kg at 7.2; the
 * wire gear and wheels 0.075 kg at 10.3; the wing 0.30 kg; the radio, four
 * servos behind former D and the pack ahead of it (Castellano, MAN), 0.30
 * kg at 15.5; the tail group 0.075 kg at 38.5; pushrods, horns and the
 * skid 0.04 kg; the fuselage's box the rest less a tail weight, its own
 * centre at station 19.0. The tail weight is what brings the CG to the
 * plan's mark: 2.4 oz, where Frank Tiano's (FM, March 1979) took "3
 * ounces of tail weight" on a long Tatone mount. Heights on the plan.
 */
const parts = [
  { m: 0.33, s: 3.0, z: zTL, r: [0.02, 0.03, 0.03] },
  { m: 0.237, s: 7.2, z: 22.0, r: [0.02, 0.04, 0.04] },
  { m: 0.075, s: 10.3, z: 25.8, r: [0.10, 0.02, 0.10] },
  { m: 0.30, s: wingLE + 0.42 * chordW, z: zChord, r: [b / Math.sqrt(12), R(chordW) / Math.sqrt(12), b / Math.sqrt(12)] },
  { m: 0.30, s: 15.5, z: 22.3, r: [0.02, 0.04, 0.04] },
  { m: 0.075, s: 38.5, z: 20.5, r: [0.08, 0.04, 0.08] },
  { m: 0.04, s: 22.0, z: 22.0, r: [0.01, 0.2, 0.2] },
];
const known = parts.reduce((a, p) => a + p.m, 0);
const fuseS = 19.0, ballastS = 39.0;
const rest0 = m - known;
/* sum m s + (rest0 - B) fuseS + B ballastS = m xCG */
const ballast = (m * xCGst - parts.reduce((a, p) => a + p.m * p.s, 0) - rest0 * fuseS) / (ballastS - fuseS);
parts.push({ m: rest0 - ballast, s: fuseS, z: 22.3, r: [0.03, R(35) / Math.sqrt(12), R(35) / Math.sqrt(12)] });
parts.push({ m: ballast, s: ballastS, z: 22.5, r: [0, 0, 0] });
const zCGmass = parts.reduce((a, p) => a + p.m * p.z, 0) / m;
const zCG = zCGmass;
const inertia = [0, 0, 0];
for (const p of parts) {
  const dx = R(p.s - xCGst), dz = R(p.z - zCG);
  inertia[0] += p.m * (dz * dz + p.r[0] * p.r[0]);
  inertia[1] += p.m * (dx * dx + dz * dz + p.r[1] * p.r[1]);
  inertia[2] += p.m * (dx * dx + p.r[2] * p.r[2]);
}
const [Ixx, Iyy, Izz] = inertia;
/* The thrust line over the CG, m, positive up. */
const thrustZ = R(zCG - zTL);

const lh = R(xAcTail - xAcWing);
const lv = R(xAcFin - xCG);

/* The coefficients, in the plant's reference chord S/b. */
const aw = cosFactor * 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
/* DATCOM's downwash gradient: the stab on the fuselage's top, 1.95 in
 * over the wing's chord plane. */
const KA = 1 / AR - 1 / (1 + Math.pow(AR, 1.7));
const KL = (10 - 3 * taper) / 7;
const hH = R(zChord - zStab);
const KH = (1 - hH / b) / Math.cbrt(2 * lh / b);
const deda = 4.44 * Math.pow(KA * KL * KH, 1.19);
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const xNP = R(xAcWing) + c * VH * eta * (at / aw) * (1 - deda);
const SM = (xNP - R(xCG)) / c;
const Cma = -CLa * SM;
/* Zero-zero: the symmetric wing and the stab both at none. */
const alphaZL = 0;
const Cmq = -2 * eta * at * VH * lh / c;
const Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
/* The box's weathercock term, Nelson eq. 2.64 with DATCOM's K_N 0.0012
 * per deg, on its 103 sq in of side over 35.6 in. */
const SBs = 103 * SQIN, lf = R(35.6);
const CnbFus = -0.0012 * DEG * 1.0 * (SBs / S) * (lf / b);
const CYb = -av * Sv / S;
const Cnb = av * VV + CnbFus;
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
/* The low wing's own roll with sideslip, DATCOM's wing height term: the
 * chord plane 1.15 in under the box's centre line, d its mean depth. A low
 * wing takes dihedral effect away. */
const zv = R(zCG - finPoly.z);
const zw = R(-(zChord - (20.55 + 24.2) / 2)), dFus = R(Math.sqrt(3.0 * 3.6));
const ClbLow = -1.2 * Math.sqrt(AR) * (zw / b) * (2 * dFus / b);
const ClbDihedral = -aw * gamma * (1 + 2 * taper) / (6 * (1 + taper));
const ClbFin = -av * (Sv / S) * (zv / b);
const Clb = ClbDihedral + ClbFin + ClbLow;
const Clp = -aw * (1 + 3 * taper) / (12 * (1 + taper));
/* The strip ailerons from 1.54 in to the tip rib: Nelson eq. 5.46. */
const y1 = ailIn / halfTip, y2 = halfTipRib / halfTip;
const ClDa = aw * tauA * (chordW / (c / 0.0254)) * (y2 * y2 - y1 * y1) / 4;
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zv / b;
/* Strip ailerons with no differential: the Cub's adverse yaw. */
const ClrPerCL = 0.25, CnpPerCL = -0.125, CndaPerCL = -0.12;
/* Each aileron strip's tau: the plant's four strips per half span, the
 * aileron spanning 0.06 to 0.94 of it. */
const stripTau = [0, 1, 2, 3].map((i) => {
  const a0 = i / 4, a1 = (i + 1) / 4;
  const cover = Math.max(0, Math.min(a1, y2) - Math.max(a0, y1)) / 0.25;
  return tauA * cover;
});

/* The stick for a surface angle through the expo. */
function stickFor(delta, travel) {
  const want = delta / travel;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (expo * mid * mid * mid + (1 - expo) * mid < want) lo = mid; else hi = mid; }
  return lo;
}
const surf = (stick, travel) => (expo * stick ** 3 + (1 - expo) * stick) * travel;

const level = (d) => {
  let lo = 6, hi = 60;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (T(mid, d) > Dlevel(mid)) lo = mid; else hi = mid; }
  return lo;
};
const Vs = Math.sqrt(2 * W / (rho * S * CLmax));
const CLopt = Math.sqrt(CD0 / k), LDmax = CLopt / (2 * CD0), Vmd = Math.sqrt(2 * W / (rho * S * CLopt));
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + k * CL * CL); };
let best = { vz: -1, V: 0 };
for (let V = 1.15 * Vs; V < 45; V += 0.02) { const vz = (T(V, 1) - Dlevel(V)) * V / W; if (vz > best.vz) best = { vz, V }; }

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
  for (let kk = 1; kk <= n; kk += 1) {
    const AM = mul(A, M);
    const ck = -AM.reduce((s, row, i) => s + row[i], 0) / kk;
    coef.push(ck);
    M = AM.map((row, i) => row.map((v, j) => v + (i === j ? ck : 0)));
  }
  return coef;
}

/*
 * The trim: a racer is trimmed for the race, flat out. Spickler: "If the
 * model tends to drop its nose in the turns, move the CG back a little";
 * RCM's pilot: "a little down elevator". The pilot's trim is the table's
 * neutral: the neutral elevator flies it level at full throttle, the
 * thrust line's own moment on the full thrust included.
 */
const Vtrim = level(1);
const CLtrim = 2 * W / (rho * Vtrim * Vtrim * S);
const Cm0 = -Cma * CLtrim / CLa + thrustZ * Dlevel(Vtrim) / (0.5 * rho * Vtrim * Vtrim * S * c);

/* The longitudinal model, the plant's equations. */
function deriv(x, de, d, inverted = false) {
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
  const gz = inverted ? -1 : 1;
  return [Fx / m - g * Math.sin(thp) + q * w, Fz / m - gz * g * Math.cos(thp) - q * u, My / Iyy, q];
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
function trimAt(V, inverted = false) {
  const res = (p) => { const r = deriv([V * Math.cos(p[0]), (inverted ? 1 : -1) * V * Math.sin(p[0]), 0, p[0]], p[1], p[2], inverted); return [r[0], r[1], r[2]]; };
  let p = [inverted ? -0.02 : 0.02, 0, 0.8];
  for (let it = 0; it < 60; it += 1) {
    const r = res(p);
    const J = [0, 1, 2].map((j) => { const pp = p.slice(); pp[j] += 1e-7; const rr = res(pp); return rr.map((v, i) => (v - r[i]) / 1e-7); });
    const dx = solve3([0, 1, 2].map((i) => [0, 1, 2].map((j) => J[j][i])), r.map((v) => -v));
    p = p.map((v, i) => v + dx[i]);
  }
  return p;
}
function longitudinalModes(V) {
  const p = trimAt(V);
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
 * On its back at full throttle, flown level (FM: "Inverted flight is
 * almost as easy as upright with only a hint of down trim needed"): the
 * speed, the body's angle to the air and the push that holds it, as a
 * stick through the expo; the plant's sign, so a push is negative.
 */
function invertedAt(V) {
  const p = trimAt(V, true);
  return { V, alphaDeg: -p[0] * DEG, deDeg: p[1] * DEG, duty: p[2], stick: -stickFor(-p[1], throwE) };
}

/* The lateral model, Nelson ch. 5, as uglystik-derive.js has it. */
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
    V, CL, A,
    spiral: { root: spiral, tHalf: spiral < 0 ? Math.log(2) / -spiral : null, t2: spiral > 0 ? Math.log(2) / spiral : null },
    rollTau: -1 / real[0],
    dutch: dr ? { wn: Math.hypot(dr.re, dr.im), zeta: -dr.re / Math.hypot(dr.re, dr.im) } : null,
  };
}
function bankAfter(lat, phi0, tEnd) {
  let x = [0, 0, 0, phi0];
  const dt = 0.001;
  for (let t = 0; t < tEnd; t += dt) {
    const dx = lat.A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
    x = x.map((v, i) => v + dx[i] * dt);
  }
  return x[3];
}

/*
 * THE PYLON TURN, the point mass the plant's polar makes: level at the
 * full throttle speed, rolled to the bank that holds the height at a load
 * factor n, and held there round 180 deg of heading at full throttle. The
 * lift that pulls n g costs k CL^2 in drag, n^2 times the level flight's
 * at the same speed; the speed it leaves the turn at and the radius, time
 * and distance it took.
 */
function pylonTurn(n, V0 = level(1)) {
  let V = V0, psi = 0, t = 0, dist = 0, rMin = Infinity;
  const dt = 0.0005;
  const sinPhi = Math.sqrt(1 - 1 / (n * n));
  while (psi < Math.PI && t < 30) {
    const q = 0.5 * rho * V * V;
    const CL = n * W / (q * S);
    if (CL > CLmax) return { stalled: true, V, t };
    const Dr = q * S * (CD0 + k * CL * CL);
    V += ((T(V, 1) - Dr) / m) * dt;
    const r = V * V / (g * n * sinPhi);
    rMin = Math.min(rMin, r);
    psi += (V / r) * dt; dist += V * dt; t += dt;
  }
  return { V0, V, lostPct: 100 * (V0 - V) / V0, t, dist, r: rMin, alphaDeg: n * W / (0.5 * rho * V0 * V0 * S) / CLa * DEG };
}
/*
 * CARRYING SPEED: from level at the full throttle speed the throttle to
 * idle, the height held, how long until it is down to 1.5 Vs and how far
 * it went. The racer's thin drag is what lets it coast.
 */
function coast() {
  let V = level(1), t = 0, x = 0;
  let t30 = null;
  const dt = 0.001;
  while (V > 1.5 * Vs && t < 60) {
    V += ((T(V, 0) - Dlevel(V)) / m) * dt;
    t += dt; x += V * dt;
    if (t30 === null && V <= 30) t30 = t;
  }
  return { t, x, t30 };
}
/* Full aileron from level, the roll's rate settling on the linear roll
 * mode alone: pb/2V, the rate and its time constant. */
const pb2v = (d) => ClDa * eff(d) / -Clp;

/*
 * The taildragger at rest, drawn: the mains and the skid's tip on the
 * grass, the CG over them, the skid's share of the weight by moments.
 * Body axes from the CG: x forward, z up, inches off the plan.
 */
const mainX = R(xCGst - 10.0), mainZ = R(zCG - 27.1), wheelR = R(1.125);
const skidX = R(xCGst - 41.4), skidZ = R(zCG - 24.65);
const restPitch = Math.atan2(skidZ - (mainZ - wheelR), mainX - skidX);
const th = restPitch;
const along = (x, z) => x * Math.cos(th) - z * Math.sin(th);
const cgHeight = -((mainZ - wheelR) * Math.cos(th) + mainX * Math.sin(th));
const mainW = along(mainX, mainZ - wheelR), skidW = along(skidX, skidZ);
const skidShare = mainW / (mainW - skidW);
const loadMain = W * (1 - skidShare) / 2, loadSkid = W * skidShare;
const defl = 0.005;
const kMain = loadMain / defl, kSkid = loadSkid / defl;
const cMain = 2 * 0.6 * Math.sqrt(kMain * m / 2);
const mSkid = (Iyy + m * mainW * mainW) / Math.pow(mainW - skidW, 2);
const cSkid = 2 * 0.6 * Math.sqrt(kSkid * mSkid);
const propX = R(xCGst - propSt), propR = R(4.5);
const propClearLevel = -(mainZ - wheelR) + thrustZ - propR;
const propClearRest = (propX * Math.sin(th) + (thrustZ - propR) * Math.cos(th)) + cgHeight;

/*
 * The take off, ROG as the class runs it (AMA: "All takeoffs shall be
 * ROG"): full throttle from standing on grass, held three point, the
 * skid on the grass and the stick holding the rest attitude (RCM: "the
 * landing gear design and location makes extremely easy tail dragger
 * take-offs"). It lifts off where the wing at the rest attitude's alpha
 * carries its weight. The first form lifted the tail at 8 m/s and eased
 * it off at 1.2 Vs, 6.12 m at 12.39 m/s: flown, on its mains the wheels'
 * drag under the CG and the thrust line over it held the nose down and
 * the pilot's hand did not rotate it until 32 m/s, so the gate flies it
 * three point, as the kit reviews describe (docs/QUICKIE-STAGE1.md).
 */
function takeoff(mu) {
  let V = 0, x = 0, t = 0;
  const dt = 0.001;
  const CLg = CLa * restPitch;
  while (t < 30) {
    const q = 0.5 * rho * V * V;
    if (q * S * CLg >= W) return { x, t, V };
    const acc = (T(V, 1) - q * S * (CD0 + k * CLg * CLg) - mu * Math.max(0, W - q * S * CLg)) / m;
    V += acc * dt; x += V * dt; t += dt;
  }
  return null;
}

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const lat = lateral(Vtrim);
const lat20 = lateral(1.4 * Vs);
const lon = longitudinalModes(Vtrim);
const armAc = (R(xCG) - R(xAcWing)) / c;
const armCp = (R(wingLE + 0.40 * chordW) - R(xCG)) / c;
const stallDw = eta * VH * at * deda / aw;
const pb = pb2v(throwA);
const alphaFullUp = (Cm0 + Cmde * eff(throwE)) / -Cma;
/* Full up held at the trim speed, the pull's own pitch damping in the
 * moment: q = qbar S CLa alpha / (m V), and Cm0 + Cmde de + Cma alpha +
 * Cmq q c / 2V = 0. The steady pitch rate full elevator buys, which
 * Acro's asked rate has to stay under. */
const pullFull = (() => {
  const qb = 0.5 * rho * Vtrim * Vtrim;
  const kq = qb * S * CLa / (m * Vtrim);
  const a = (Cm0 + Cmde * eff(throwE)) / (-Cma - Cmq * kq * c / (2 * Vtrim));
  return { alphaDeg: a * DEG, qDegS: kq * a * DEG, g: qb * S * CLa * a / W };
})();
const rows = [
  ['S sq in (tips), S m^2, b m, c = S/b m, AR', `${f(Sin, 1)} (${f(2 * tipBlock, 1)}) ${f(S, 5)} ${f(b, 4)} ${f(c, 4)} ${f(AR, 3)}`],
  ['m kg, W/S N/m^2 (oz/sq ft)', `${f(m, 4)} ${f(W / S, 2)} (${f(56 / (Sin / 144), 2)})`],
  ['CD0 parts: wing fuse tail engine gear nose misc; sum, x1.05', `${Object.values(drag).map((v) => f(v, 4)).join(' ')}; ${f(CD0parts, 4)} ${f(CD0, 4)}`],
  ['dihedral deg, cos^2', `${f(gamma * DEG, 2)} ${f(cosFactor, 4)}`],
  ['stations: wing ac, CG, NP, tail ac, fin ac (in)', `${f(xAcWing, 2)} ${f(xCGst, 2)} ${f(xNP / 0.0254, 2)} ${f(xAcTail, 2)} ${f(xAcFin, 2)}`],
  ['S_h m^2, AR_t, l_h m; fin sq in, rudder sq in (+ lower), fin centroid height', `${f(Sh, 5)} ${f(ARt, 2)} ${f(lh, 4)}; ${f(finPoly.area, 1)} ${f(rudPoly.area, 1)} (+${f(rudLower, 1)}) ${f(finPoly.z, 2)}`],
  ['S_v m^2, l_v m, AR_v', `${f(Sv, 5)} ${f(lv, 4)} ${f(arV, 2)}`],
  ['a_w, a_t, a_v /rad', `${f(aw)} ${f(at)} ${f(av)}`],
  ['dε/dα DATCOM, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, static margin', `${f(CLa)} ${f(SM, 4)}`],
  ['Cmα, Cm0, Cmq', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)}`],
  ['Cmδe, CLδe', `${f(Cmde, 4)} ${f(CLde, 4)}`],
  ['CYβ, Cnβ (fuselage), Cnr', `${f(CYb, 4)} ${f(Cnb, 4)} (${f(CnbFus, 4)}) ${f(Cnr, 4)}`],
  ['Clβ: dihedral, fin, low wing, total', `${f(ClbDihedral, 4)} ${f(ClbFin, 4)} ${f(ClbLow, 4)} ${f(Clb, 4)}`],
  ['Clp, Clδa; strip tau', `${f(Clp, 4)} ${f(ClDa, 4)}; ${stripTau.map((v) => f(v, 4)).join(' ')}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['throws deg: aileron, elevator, rudder; through the knee', `${f(throwA * DEG, 4)} ${f(throwE * DEG, 4)} ${f(throwR * DEG, 4)}; ${f(eff(throwA) * DEG, 2)} ${f(eff(throwE) * DEG, 2)} ${f(eff(throwR) * DEG, 2)}`],
  ['k, idle, V_p (the line through the curve at its top speed)', `${f(k, 5)} ${f(idle, 4)} ${f(Vp, 3)}`],
  ['thrust: static N, to weight, the line against the curve at 20, 30, 40', `${f(Ts, 3)} ${f(Ts / W, 3)}; ${[20, 30, 40].map((v) => `${f(T(v, 1), 2)}/${f(Tcurve(v), 2)}`).join(' ')}`],
  ['shaft torque N m, torque arm m, thrust line over the CG m', `${f(shaftTorque, 4)} ${f(shaftTorque / Ts, 5)} ${f(thrustZ, 4)}`],
  ['mass: fuselage kg, tail weight kg (oz), CG height on the plan', `${f(rest0 - ballast, 3)} ${f(ballast, 3)} (${f(ballast / 0.0283495, 1)}) ${f(zCGmass, 2)}`],
  ['inertia Ixx Iyy Izz', `${f(Ixx, 4)} ${f(Iyy, 4)} ${f(Izz, 4)}`],
  ['silenced: top speed m/s, the line\'s zero, mass kg', `${f(silenced.top, 2)} ${f(silenced.Vp, 3)} ${f(silenced.m, 4)}`],
  ['Q1 top speed: the curve, the line (m/s, mph); 75, 50 percent', `${f(vTopCurve, 2)} ${f(level(1), 2)} (${f(level(1) / 0.44704, 1)}); ${f(level(0.75), 2)} ${f(level(0.5), 2)}`],
  ['Q2 stall m/s', f(Vs, 3)],
  ['Q3 glide L/D best at m/s; at 1.4 Vs', `${f(LDmax, 3)} ${f(Vmd, 2)}; ${f(ld(1.4 * Vs), 3)}`],
  ['Q4 best climb m/s at m/s', `${f(best.vz, 2)} ${f(best.V, 2)}`],
  ['Q5 full aileron pb/2V, deg/s at the top speed, at 30', `${f(pb, 4)} ${f(pb * 2 * Vtrim / b * DEG, 0)} ${f(pb * 60 / b * DEG, 0)}`],
  ['   roll tau s at top, at 1.4 Vs; half stick pb/2V', `${f(lat.rollTau, 4)} ${f(lat20.rollTau, 4)}; ${f(pb2v(surf(0.5, throwA)), 4)}`],
  ['Q6 pylon turn 180 deg at 4, 6, 8, 10 g', [4, 6, 8, 10].map((n) => JSON.stringify(pylonTurn(n), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))).join(' ')],
  ['Q7 coast at idle to 1.5 Vs: s, m; to 30 m/s s', (() => { const o = coast(); return `${f(o.t, 2)} ${f(o.x, 1)}; ${f(o.t30, 2)}`; })()],
  ['Q8 alpha at full up, linear moment; stall alpha (deg); CL at full up over CLmax', `${f(alphaFullUp * DEG, 2)} ${f(CLmax / CLa * DEG, 2)}; ${f(CLa * alphaFullUp / CLmax, 3)}`],
  ['   full up held at the trim, damped: alpha deg, pitch deg/s, g', `${f(pullFull.alphaDeg, 2)} ${f(pullFull.qDegS, 1)} ${f(pullFull.g, 2)}`],
  ['Q9 spiral root, t_half s; 20 deg let go, bank at 3 s', `${f(lat.spiral.root, 4)} ${f(lat.spiral.tHalf, 1)}; ${f(bankAfter(lat, 20 / DEG, 3) * DEG, 1)}`],
  ['   Dutch roll wn, zeta', `${lat.dutch ? `${f(lat.dutch.wn, 2)} ${f(lat.dutch.zeta)}` : 'none'}`],
  ['Q10 phugoid s zeta, short period s zeta; trim theta, de, duty', `${f(lon.phugoid && lon.phugoid.period, 2)} ${f(lon.phugoid && lon.phugoid.zeta)}; ${f(lon.short && lon.short.period, 3)} ${f(lon.short && lon.short.zeta)}; ${f(lon.thetaDeg, 2)} ${f(lon.deDeg, 3)} ${f(lon.duty, 3)}`],
  ['stall arms ac, cp, dw, asym', `${f(armAc, 4)} ${f(armCp, 4)} ${f(stallDw, 4)} ${f(0.001 / c, 5)}`],
  ['rest: pitch deg, CG height m, skid share', `${f(restPitch * DEG, 3)} ${f(cgHeight, 4)} ${f(skidShare, 4)}`],
  ['   k main, c main, k skid, c skid', `${f(kMain, 0)} ${f(cMain, 2)} ${f(kSkid, 0)} ${f(cSkid, 2)}`],
  ['   wheel and skid in body axes: main x z, skid x z (m)', `${f(mainX, 4)} ${f(mainZ, 4)} ${f(skidX, 4)} ${f(skidZ, 4)}`],
  ['   prop x, tip clearance level on the mains, at rest m', `${f(propX, 4)} ${f(propClearLevel, 4)} ${f(propClearRest, 4)}`],
  ['Q13 take off ROG on grass, three point: x, t, V; the wheels alone, the skid\'s share at 0.35', [muGrass, muGrass * (1 - skidShare) + 0.35 * skidShare].map((mu) => JSON.stringify(takeoff(mu), (kk, v) => (typeof v === 'number' ? +v.toFixed(2) : v))).join(' ')],
  ['Q18 on its back flat out: alpha, elevator deg, stick; upright stick', (() => { const iv = invertedAt(Vtrim); return `${f(iv.alphaDeg, 2)} ${f(iv.deDeg, 2)} ${f(iv.stick, 3)}; ${f(-stickFor(lon.deDeg / DEG, throwE), 3)}`; })()],
  ['Q11 prop torque N m', f(shaftTorque, 4)],
  ['Q15 idle rpm, static thrust N, rolling resistance N', `${f(idle * rpmStatic, 0)} ${f(T(0, 0), 3)} ${f(muGrass * W * (1 - skidShare) + 0.35 * W * skidShare, 3)}`],
  ['fuel: the K&B 40 at full throttle cc/min, the 8 oz tank min', `${f(17.9 * 6.54 / 6.5, 2)} ${f(236.6 / (17.9 * 6.54 / 6.5), 1)}`],
];
for (const [name, v] of rows) {
  console.log(`${name.padEnd(70)} ${v}`);
}
