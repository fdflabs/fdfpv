/*
 * slick-derive.js: the arithmetic behind docs/SLICK-STAGE1.md, from
 * Extreme Flight's published figures and dimensioned drawing for its
 * 105.5 in (2680 mm) Slick 580, Desert Aircraft's for the DA-120, Falcon's
 * measured static table for the DA-120 on its 28 x 10 carbon prop and
 * APC's data for the nearest prop in shape, to every coefficient of
 * FW_SLICK2680, the gear and mass of its PLANT_TABLE row, and every band
 * in tests/slick-thresholds.json. It never loads the plant: this is what
 * the plant is checked against, so it has to stand apart from it. Harness
 * arithmetic in JS maths, which is allowed here because nothing it prints
 * is hashed. Run with npm run slick:derive; --check fails when the table,
 * the plant row or the bands differ from what it derives, naming each
 * field and its derived value; --write-bands writes the bands. After a
 * plant change: mirror it in wingLift or the harrier below, --write-bands,
 * set what --check names, then as3x:derive and stab:glide.
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

import { washKw } from './lib/washcontrol.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { wingEngine, wingProp } from './lib/propcurve.js';

const DEG = 180 / Math.PI;
const rho = 1.225;
const g = 9.81;
const NU = 1.46e-5;
const IN = 0.0254;

function integrate(f, a, bb, n = 4000) {
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    const y = a + (bb - a) * (i + 0.5) / n;
    s += f(y) * (bb - a) / n;
  }
  return s;
}
/* Shoelace area and centroid of a polygon of [x, y] points. */
function poly(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const cr = x0 * y1 - x1 * y0;
    a += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
  }
  return { area: Math.abs(a / 2), cx: cx / (3 * a), cy: cy / (3 * a) };
}

/*
 * WHICH SPAN. Extreme Flight's V3 pages say "WINGSPAN 100 in / 2.5 M
 * (without tips)" (356CYV3, 356V3BW; the 356RC page drops the bracket),
 * and every V3 page links the V2's data sheet, whose dimensioned drawing
 * gives 2680 mm tip to tip, 2540 mm of length and a 115 dm^2 wing. The
 * same drawing's wing runs 2538 mm between its tip ribs on its own scale,
 * so "100 in without tips" is this wing less its two moulded tips, not a
 * smaller aircraft; the hardware bag (356V2HWB) is sold for both V2 and
 * V3. Taken: 2.680 m and the sheet's 1.150 m^2. A V3 sheet that says
 * otherwise changes SPAN and AREA here and nothing else.
 */
const SPAN = 2.680, AREA = 1.150;

/*
 * THE DRAWING, DATASHEET_105SLICK580v2.pdf rendered at 300 dpi (pixels
 * below). Its span axis is to scale: the 2680, 2540 (between the tip
 * ribs) and 1040 (stabiliser) labels agree on 1.3128 mm a pixel within
 * 0.4 percent. Its chordwise axis in the top view is drawn about 5
 * percent long against the side view and the labels (the root measures
 * 600 for its 570 label; the side view's root section measures 572), so
 * the top view's chords are taken at kc = 570 / 600 of the span scale.
 * The side view is to scale on its 2250 (spinner to hinge line) and 755
 * (height) labels, 1.3123 mm a pixel.
 */
const kSpan = 2680 / (2393.5 - 352.0) / 1000;  /* m per pixel, top view, spanwise */
const kc = 0.570 / (2238.5 - 1781.5);         /* m per pixel, top view, chordwise (the 570 label over its drawn lines) */
const kS = 2250 / (1995.0 - 280.5) / 1000;     /* m per pixel, side view, the 2250 label */
const xCL = (352.0 + 2393.5) / 2;               /* top view centreline, pixels */
const spanAt = (px) => (xCL - px) * kSpan;

/* The wing in plan: the 570 mm root at the fuselage's side (0.163 m out,
 * the 326 mm label), the 285 mm chord at the tip rib 1.270 m out (2540
 * between them), both labels; the moulded tip 70 mm more to 1.340 m,
 * rounded to a 0.20 m chord at its end, off the drawing. The leading edge
 * sweeps back 58.5 drawn pixels from the root to the tip rib. */
const yRoot = 0.163, yRib = 1.270, yTip = SPAN / 2;
const cRoot = 0.570, cRib = 0.285, cTipEnd = 0.20;
const leSweep = (1840.5 - 1782.0) * kc;
function chordAt(y) {
  const a = Math.abs(y);
  if (a <= yRoot) return cRoot;
  if (a <= yRib) return cRoot + (cRib - cRoot) * (a - yRoot) / (yRib - yRoot);
  return cRib + (cTipEnd - cRib) * (a - yRib) / (yTip - yRib);
}
const leAt = (y) => { const a = Math.abs(y); return a <= yRoot ? 0 : leSweep * Math.min(1, (a - yRoot) / (yRib - yRoot)); };
const Splan = 2 * integrate(chordAt, 0, yTip);
const S = AREA, b = SPAN, AR = b * b / S;
const MAC = 2 * integrate((y) => chordAt(y) ** 2, 0, yTip) / Splan;
const yMAC = 2 * integrate((y) => chordAt(y) * y, 0, yTip) / Splan;
const macLE = 2 * integrate((y) => chordAt(y) * leAt(y), 0, yTip) / Splan;
const c = MAC;
const lamEff = cRib / cRoot;

/*
 * THE SIDE VIEW (pixels, y down): the spinner's tip at x 280.5 on the
 * thrust line, y 817 (the drawing's "Up/Down thrust: 0 deg"); the
 * spinner's back plate, the prop's disc, at 402.5; the root section from
 * 738 to 1174 (572 mm) on a chord line 26 px under the thrust line, 12.6
 * percent thick at 28 percent of the chord, where its 38 mm tube runs
 * (the thickest station of a symmetric section carries the spar). The
 * stabiliser's root section from 1813 to 2068 on y 806; the hinge line of
 * the rudder at 1995 (the 2250 label's), the fin's top at y 462, the
 * rudder's trailing edge from (2072, 466) to (2183, 880), its foot on the
 * fuselage's bottom line at y 890, the fin's leading edge from (1939, 466)
 * to the fuselage's top at (1840, 715). The main wheel's axle at (745.5,
 * 1142), 105 mm across; the tailwheel's at (2016.5, 957.5), 38 mm; the
 * ground under both at y 1182 and 972. The fuselage at the CG from y 685
 * to 952.
 */
const xTipPx = 280.5, yThr = 817;
const rootLEpx = 738.0, rootTEpx = 1174.0;
const tubeFrac = (860 - rootLEpx) / (rootTEpx - rootLEpx);
/* The CG: Extreme Flight's "center of main wing tube to rear of main wing
 * tube as starting position", the middle of that range, 9.5 mm behind the
 * 38 mm tube's centre. */
const cgBehindRootLE = tubeFrac * cRoot + 0.0095;
const cgPx = rootLEpx + cgBehindRootLE / kS;
const X = (px) => (cgPx - px) * kS;          /* forward of the CG, m */
const Zt = (py) => (yThr - py) * kS;         /* over the thrust line, m */
const zWingT = Zt(843);                      /* the wing's chord line under the thrust line */

/* The tail in plan, the top view (pixels): the stabiliser's leading edge
 * from the centreline (2862, extrapolated) to its tip (977, 2937), the tip
 * chord to 3102, the trailing edge in to (1250, 3123), the rudder's
 * cut out up to (1340, 2998); the elevator behind the hinge line, y 2994,
 * from x 1052 in, and the whole chord outboard of 1052 (the balance).
 */
const stabPts = [[xCL, 2862], [977, 2937], [977, 3102], [1250, 3123], [1340, 2998], [xCL, 2998]];
const elevPts = [[977, 2937], [1052, 2923], [1052, 2994], [1340, 2994], [1250, 3123], [977, 3102]];
const toM = ([x, y]) => [spanAt(x), y * kc];
const stabHalf = poly(stabPts.map(toM)), elevHalf = poly(elevPts.map(toM));
const Sh = 2 * stabHalf.area, Se = 2 * elevHalf.area, bh = 2 * spanAt(977);
const cfE = Se / Sh;
/* The stabiliser's mean chord and its quarter chord, on the side view's
 * root section (1813 to 2068) swept back as the plan's leading edge. */
const chRoot = (2068 - 1813) * kS, chTip = (3102 - 2937) * kc, hSweep = (2937 - 2862) * kc;
const lamH = chTip / chRoot;
const macH = (2 / 3) * chRoot * (1 + lamH + lamH * lamH) / (1 + lamH);
const yMacH = (bh / 6) * (1 + 2 * lamH) / (1 + lamH);
const lh = -X(1813) + hSweep * yMacH / (bh / 2) + 0.25 * macH;
const zStabT = Zt(806);

/* The fin and rudder in side view: the fin ahead of the hinge over the
 * fuselage, the rudder behind it to the fuselage's foot. */
const finPts = [[1840, 715], [1939, 462], [1995, 462], [1995, 715]];
const rudPts = [[1995, 462], [2072, 462], [2183, 890], [1995, 890]];
const toS = ([x, y]) => [-X(x), Zt(y)];
const finP = poly(finPts.map(toS)), rudP = poly(rudPts.map(toS));
const Sv = finP.area + rudP.area;
const cfR = rudP.area / Sv;
const lv = (finP.cx * finP.area + rudP.cx * rudP.area) / Sv - 0.25 * Sv / (Zt(462) + (Zt(890) * -1));
const zvT = (finP.cy * finP.area + rudP.cy * rudP.area) / Sv;
const hvUpT = Zt(462), hvDnT = -Zt(890);
const arVgeo = (hvUpT + hvDnT) ** 2 / Sv;
const arV = 1.55 * arVgeo; /* the stabiliser and the fuselage end plate it, Roskam's usual factor, as the Extra's */

/* The ailerons: 0.32 of the chord from the tip rib in to 0.181 m out,
 * off the drawing (0.331 of the chord at the rib, 0.317 inboard). */
const aileronIn = spanAt(1235), aileronOut = yRib, cfA = 0.32;
/* The prop: Falcon's 28 x 10, 0.3556 m in radius, its disc 0.61 m ahead. */
const propR = 14 * IN, propX = X(402.5);
/* The engine's right thrust: the data sheet's "Right thrust: 3 deg" (the
 * 120cc build guide, 2.5 to 3). The plant turns the thrust line by it
 * (thrust_yaw): cos 3 deg of the thrust along the axis, sin 3 deg of it
 * sideways at the disc, prop_x ahead of the CG. */
const thrustYaw = 3.0 / DEG, cosYaw = Math.cos(thrustYaw), sinYaw = Math.sin(thrustYaw);

/* The throws, the data sheet and the 120cc build guide, in degrees:
 * aileron high 38 up and 37 down (the mean), elevator 3D 45 to 50 (the
 * middle; XA's 60 and more is a setup past the 3D one), rudder high 45
 * and more (45); expo 50 to 60 percent on the ailerons and elevator (the
 * middle), 60 to 80 on the rudder (70). Low rates: aileron 20, elevator
 * 10 to 12, rudder 20. */
const throwA = 37.5 / DEG, throwE = 47.5 / DEG, throwR = 45.0 / DEG;
const expoAE = 0.55, expoR = 0.70;

/* Large deflection: Roskam's plain flap correction K' (Airplane Design VI
 * fig. 10.7), Mason's curve fit, as the Extra's. */
const kPrime = (d) => { const x = d * DEG; return x < 15 ? 1 : 4e-7 * x ** 4 - 7e-5 * x ** 3 + 0.0047 * x ** 2 - 0.1453 * x + 2.3167; };
const tauOf = (cf) => { const th = Math.acos(1 - 2 * (1 - cf)); return 1 - (th - Math.sin(th)) / Math.PI; };
const tauA = tauOf(cfA) * kPrime(throwA), tauE = tauOf(cfE) * kPrime(throwE), tauR = tauOf(cfR) * kPrime(throwR);

/*
 * THE MASS, 27.5 lb, 12.474 kg: the middle of the overlap of Extreme
 * Flight's two V3 ranges, 26 to 28 lb (356RC and the sheet) and 27 to
 * 29 lb (356CYV3, 356V3BW). Taken with the 34 oz tank full, the glow
 * convention (docs/POWER-STAGE1.md), which stays aboard as it burns.
 * Built up from the parts; the DA-120's 2.25 kg is Desert Aircraft's, the
 * fuel's 34 fl oz at 0.73 kg/l (petrol with 2.5 percent oil) is the tank's,
 * the rest is each part's class for a 35 percent ARF, ESTIMATED. The two
 * receiver packs are slid to where the CG comes out at the sheet's, as a
 * builder does (the build guide: "alongside the receiver").
 * x and the rod ends are side view pixels; z is m over the thrust line.
 */
const fuelKg = 34 * 29.5735e-6 * 1000 * 0.73;
const parts = [
  { name: 'DA-120, Desert Aircraft', m: 2.25, x: 456, z: 0 },
  { name: 'stock mufflers', m: 0.30, x: 470, z: -0.12 },
  { name: '28 x 10 carbon prop, 5 in spinner, bolts', m: 0.29, x: 402.5, z: 0 },
  { name: 'stand off mount', m: 0.20, x: 560, z: 0 },
  { name: 'ignition and its pack', m: 0.25, x: 640, z: -0.06 },
  { name: 'throttle servo, linkage', m: 0.08, x: 640, z: 0.03 },
  { name: 'tank, 34 oz of fuel', m: 0.12 + fuelKg, x: 760, z: -0.04 },
  { name: 'receiver, switches, regulators', m: 0.15, x: 980, z: -0.04 },
  { name: 'pilot bust', m: 0.10, x: 1000, z: 0.15 },
  { name: 'stabiliser, elevators, 2 servos, tube', m: 0.55, x: 1915, z: zStabT },
  { name: 'rudder and its servo', m: 0.35, x: 2050, z: 0.15 },
  { name: 'carbon gear, wheels, pants', m: 0.80, x: 745, z: -0.33 },
  { name: 'tailwheel assembly', m: 0.10, x: 2016, z: -0.15 },
];
const wingM = 2.70; /* two panels with four servos and the 38 x 1180 tube */
const wingCgPx = rootLEpx + 0.42 * (rootTEpx - rootLEpx);
/* The two receiver packs alongside the receiver. */
parts.push({ name: 'two receiver packs', m: 0.30, x: 980, z: -0.04 });
const mTotal = 12.474;
const xOf = (p) => (p.x0 === undefined ? X(p.x) : (X(p.x0) + X(p.x1)) / 2);
const x2Of = (p) => (p.x0 === undefined ? X(p.x) ** 2 : (X(p.x0) ** 2 + X(p.x0) * X(p.x1) + X(p.x1) ** 2) / 3);
/* The fuselage is the rest of the mass, in two rods: the front from the
 * cowl to the cockpit's back (the engine box, the firewall, the gear plate,
 * the tube sleeves, the cowl, the canopy and the hatch), and the aft
 * fuselage to the tail post. Its front share is what puts the CG at the
 * sheet's, as the Ugly Stik's fuselage centre is (docs/UGLYSTIK-STAGE1.md):
 * the build's balance. */
let mFixed = wingM, mxFixed = wingM * X(wingCgPx);
for (const p of parts) { mFixed += p.m; mxFixed += p.m * xOf(p); }
const fusM = mTotal - mFixed;
const fusFront = { x0: 420, x1: 1100 }, fusAft = { x0: 1100, x1: 2180 };
const fusShare = (0 - mxFixed - fusM * xOf(fusAft)) / (fusM * (xOf(fusFront) - xOf(fusAft)));
parts.push({ name: 'fuselage front: engine box, cowl, canopy, hatch', m: fusM * fusShare, ...fusFront, z: -0.03 });
parts.push({ name: 'fuselage aft', m: fusM * (1 - fusShare), ...fusAft, z: -0.02 });
let mSum = wingM, mx = wingM * X(wingCgPx), mz = wingM * zWingT;
for (const p of parts) { mSum += p.m; mx += p.m * xOf(p); mz += p.m * p.z; }
const zCGt = mz / mSum;  /* the CG over the thrust line */
const thrustZ = -zCGt;   /* the thrust line over the CG */
const Z = (zt) => zt - zCGt;
const W = mTotal * g;
const wingIxx = wingM * integrate((y) => chordAt(y) * y * y, 0, yTip) / integrate(chordAt, 0, yTip);
let Ixx = wingIxx + wingM * Z(zWingT) ** 2;
let Iyy = wingM * (c * c / 12 + X(wingCgPx) ** 2 + Z(zWingT) ** 2);
let Izz = wingIxx + wingM * (c * c / 12 + X(wingCgPx) ** 2);
for (const p of parts) {
  Ixx += p.m * Z(p.z) ** 2;
  Iyy += p.m * (x2Of(p) + Z(p.z) ** 2);
  Izz += p.m * x2Of(p);
}
/* The gear legs' spread, the wheels 0.315 m each side; the stabiliser's
 * span and the fuselage's own width. */
Ixx += 0.80 * 0.6 * 0.315 ** 2 + 0.55 * 0.6 * (bh / 2) ** 2 / 3 + fusM * (0.30 ** 2 + 0.30 ** 2) / 12;
Izz += 0.80 * 0.6 * 0.315 ** 2 + 0.55 * 0.6 * (bh / 2) ** 2 / 3 + fusM * 0.30 ** 2 / 12;

/*
 * THE SECTION. 12.6 percent thick off the drawn root, so the NACA 0012:
 * Sheldahl and Klimas, SAND80-2114 (1981), Table 2, the lift Sandia took
 * for its blades from Wichita State's measurements and PROFILE's synthesis:
 * CL max 0.9811 at 10 deg at Re 3.6e5 and 1.0749 at 11 deg at 7e5, the
 * lift then falling to 0.48 (12 deg) and 0.63 (14 deg). Raymer's 0.9 for
 * the wing (Aircraft Design, sec. 12.4), the peak further on by the
 * induced angle CL / (pi A e). A 12 percent section stalls from its
 * leading edge, its peak sharp (McCullough and Gault, NACA TN 2502):
 * stall_top 1 deg, the lift held from 10 to 11 deg at 3.6e5; stall_k, the
 * share kept after the fall, 0.29 / 0.98 at 3.6e5 and 0.49 / 1.07 at 7e5,
 * their mean.
 */
const secRe = [3.6e5, 7.0e5], secClmax = [0.9811, 1.0749], secPeakDeg = [10, 11];
const stallTop = 1.0 / DEG;
const stallK = Number((((0.2759 / 0.9811) + (0.4907 / 1.0749)) / 2).toFixed(2));
const eOsw = Number((1.78 * (1 - 0.045 * AR ** 0.68) - 0.64).toFixed(3));
const kInd = 1 / (Math.PI * eOsw * AR);
const clmaxW = secClmax.map((v) => 0.9 * v);
const peakW = clmaxW.map((v, i) => secPeakDeg[i] / DEG + v / (Math.PI * AR * eOsw));
const blend = 3 / DEG;

/*
 * THE PARASITE DRAG, a component build up (Raymer, Aircraft Design, 6th
 * ed., sec. 12.5) as the Hercules's: each part's skin friction on its
 * wetted area, its form factor and interference, at 20 m/s; Cf the mean
 * of Blasius's laminar and the turbulent 0.455 / (log10 Re)^2.58, the
 * band all of one or the other. The wing exposed outside the 326 mm
 * fuselage; the fuselage 2.25 m long on a 0.30 m equivalent diameter;
 * the tail, Q 1.04. Wheels in pants and faired legs (Raymer table 12.5,
 * D/q 0.13 of a pant's frontal 0.06 by 0.13 m; a faired leg 0.05 of its
 * 0.30 by 0.015 m). The cowl's cooling flow (eq. 12.39, 4.9e-7 bhp T^2 /
 * (sigma V) in ft^2, DA's 11.7 hp, 519 R, 65.6 ft/s). Leaks and
 * protuberances 10 percent.
 */
const Vref = 20;
function buildup(mix) {
  const cfLam = (L) => 1.328 / Math.sqrt(Vref * L / NU);
  const cfTurb = (L) => 0.455 / Math.log10(Vref * L / NU) ** 2.58;
  const cf = (L) => mix * cfTurb(L) + (1 - mix) * cfLam(L);
  const tc = 0.126;
  const wingSwet = 2.04 * (S - 0.326 * cRoot);
  const wing = cf(MAC) * (1 + 0.6 / 0.28 * tc + 100 * tc ** 4) * wingSwet;
  const L = 2.25, dEq = 0.30, f = L / dEq;
  const fus = cf(L) * (1 + 60 / f ** 3 + f / 400) * Math.PI * dEq * L * 0.8;
  const tailFF = 1 + 0.6 / 0.3 * 0.10 + 100 * 0.10 ** 4;
  const tail = 1.04 * tailFF * (cf(macH) * 2.04 * (Sh - 0.086 * chRoot) + cf(Sv / (hvUpT + hvDnT)) * 2.04 * Sv);
  const gear = 2 * 0.13 * 0.06 * 0.13 + 2 * 0.05 * 0.30 * 0.015 + 0.25 * 0.019 * 0.038;
  const cooling = 4.9e-7 * 11.7 * 519 ** 2 / (65.6) * 0.3048 ** 2;
  const parts = { wing, fus, tail, gear, cooling };
  const sum = Object.values(parts).reduce((a, x) => a + x, 0);
  return { cd0: 1.10 * sum / S, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v / S])) };
}
const drag = buildup(0.5), dragLo = buildup(0), dragHi = buildup(1);
const CD0 = Number(drag.cd0.toFixed(4));

/* The coefficients, Nelson's forms as the Extra's. */
const eta = 0.9;
const aw = 2 * Math.PI * AR / (AR + 2);
const ARt = bh * bh / Sh, at = 2 * Math.PI * ARt / (ARt + 2);
const deda = 2 * aw / (Math.PI * AR);
const hCG = (cgBehindRootLE - macLE) / MAC;
const VH = Sh * lh / (S * c);
const CLa = aw + at * (Sh / S) * eta * (1 - deda);
const fusL = 2.25, fusW = 0.30;
const fusCma = 0.006 * fusW * fusW * fusL / (c * S) * DEG; /* Raymer eq. 16.25, K_fus 0.006 per deg */
const hn = 0.25 + VH * eta * (at / aw) * (1 - deda) - fusCma / CLa;
const SM = hn - hCG, Cma = -CLa * SM;
const Cmq = -2 * eta * at * VH * lh / c, Cmde = eta * VH * at * tauE, CLde = -eta * (Sh / S) * at * tauE;
/* The pilot's trim: level hands off at its sport pace, 22 m/s. */
const Vtrim = 22, CLtrim = 2 * W / (rho * Vtrim * Vtrim * S), Cm0 = -Cma * CLtrim / CLa;
const av = 2 * Math.PI * arV / (arV + 2), VV = Sv * lv / (S * b);
const fusVol = fusL * 0.26 * 0.28 * 0.6;
const CYb = -av * Sv / S - 0.11 * (fusL * 0.28) / (1.26 * 0.125) * (0.369 / S);
const Cnb = av * VV - 1.3 * fusVol / (S * b);
const Cnr = -2 * av * VV * lv / b - CD0 / 4;
const zvCG = Z(zvT);
const ClbFin = -av * (Sv / S) * (zvCG / b), ClbLow = 1.2 * Math.sqrt(AR) * (-Z(zWingT) / b) * (2 * 0.30 / b);
const Clb = ClbFin + ClbLow;
const Clp = -aw * (1 + 3 * lamEff) / (12 * (1 + lamEff));
const Clda = 2 * aw * tauA * integrate((y) => chordAt(y) * y, aileronIn, aileronOut) / (S * b);
const Cndr = -VV * av * tauR, CYdr = av * (Sv / S) * tauR, Cldr = CYdr * zvCG / b;

/*
 * THE ENGINE AND PROP. Falcon Propeller's own test chart (Falcon Carbon
 * Fiber Gas Propeller Test Chart, 2 blades, the DA 120CC column): the
 * DA-120 turns Falcon's 28 x 10 at 6,550 rpm standing and pulls 31.0 kg,
 * MEASURED (its 27 x 11 6,600 rpm and 30.1 kg; 28 x 9.5 6,640 and 31.2).
 * That is the static thrust and the full rpm. Its torque: APC measures no
 * 28 x 10; the nearest of its files in shape is the 22 x 8 (pitch over
 * diameter 0.364 against 0.357), whose static Cp / Ct at 6,000 and 7,000
 * rpm (PER3_22x8.dat: Ct 0.0665 and 0.0678, Cp 0.0182 and 0.0184)
 * carries to the 28 x 10 at the same shape, FITTED: Q = T D Cp / (2 pi
 * Ct). Falcon's own Ct, 0.081, is above APC's (a wider 3D blade), which
 * moves Ct and Cp together and leaves their ratio. The shaft power it
 * gives is under DA's rated 11.7 hp, as a static prop below the top of
 * the engine's 6,900 rpm range should be.
 */
const nFull = 6550, Ts = 31.0 * g, D = 28 * IN;
const apc22x8 = [[6000, 0.0665, 0.0182], [7000, 0.0678, 0.0184]];
const fr = (nFull - 6000) / 1000;
const ctA = apc22x8[0][1] + fr * (apc22x8[1][1] - apc22x8[0][1]);
const cpA = apc22x8[0][2] + fr * (apc22x8[1][2] - apc22x8[0][2]);
const torqueArm = D * cpA / (2 * Math.PI * ctA);
const Qs = torqueArm * Ts;
const omegaFull = nFull * 2 * Math.PI / 60;
const shaftW = Qs * omegaFull;
const ctFalcon = Ts / (rho * (nFull / 60) ** 2 * D ** 4);
/* The plant's glow rule: the full rpm is 0.85 of the table's no load
 * figure. The pitch speed is where the plant's thrust, falling straight
 * with the airspeed, reaches zero. The Stik took the geometric pitch's,
 * rpm times pitch, 27.7 m/s here; a 3D prop's thrust runs well past it
 * (APC's 22 x 8 at 6,000 rpm, the shape's stand in, pulls to an advance
 * ratio J of 0.53, 1.5 times its pitch over diameter). Taken: the J0 of
 * the straight line through APC's static Ct that fits its Ct(J) at 6,000
 * rpm best (least squares, J 0 to 0.53), times n D at the full rpm. */
const rpmNL = nFull / 0.85;
const apcJ = [[0, 0.0665], [0.0759, 0.0608], [0.1518, 0.0537], [0.2277, 0.0454], [0.3036, 0.0360], [0.3795, 0.0256], [0.4554, 0.0145], [0.5313, 0.0030]];
const ct0 = apcJ[0][1];
const invJ0 = apcJ.reduce((a, [j, ct]) => a + (ct0 - ct) * ct0 * j, 0) / apcJ.reduce((a, [j]) => a + ct0 * ct0 * j * j, 0);
const J0 = 1 / invJ0;
const Vp = J0 * (nFull / 60) * D;
const VpGeo = nFull / 60 * 10 * IN;
/* The idle: DA's lowest, 1,300 rpm, of the full 6,550. */
const idle = 1300 / nFull;
/*
 * THE THROTTLE, the propulsion lane's method (scripts/da120-derive.js,
 * docs/FLIGHTMODEL.md "The Slick's DA-120"): HFE International's DA120
 * EFI data sheet (HFEDCN0810 Rev A, fig. 3) measures the torque at 20 to
 * 100 percent throttle on an eddy current dyno, and each throttle settles
 * where its torque meets the prop's, which goes with the speed squared.
 * Taken against Falcon's measured full throttle point: the dyno's full
 * throttle torque at 6,550 rpm, 10.08 N m, is 7 percent over this prop's
 * 9.38 (inside the dyno's own +/-10 percent; an EFI engine against a
 * carburettor's), so every row is scaled by their ratio and full throttle
 * settles at 6,550 by construction. The stick's tenth, under the dyno's
 * 2,000 rpm, halfway from the idle to the 20 percent crossing, FITTED as
 * the propulsion lane's; a crossing under the one below it (the dyno's
 * scatter) takes the one below's.
 */
const DYNO_RPM = [2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000];
const DYNO = {
  1.0: [8.0, 8.4, 8.7, 9.3, 9.6, 9.9, 10.3, 10.2, null, 10.1, 9.8, 9.4, 8.8],
  0.9: [7.3, 8.1, 8.3, 8.9, 9.0, 9.1, 9.2, 9.3, null, 9.7, 9.2, 9.0, 8.6],
  0.8: [7.2, 8.1, 8.2, 8.8, 8.9, 9.1, 9.1, 8.9, null, 9.5, 9.1, 8.7, 8.2],
  0.7: [7.2, 7.9, 8.0, 8.4, 8.4, 8.5, 8.6, 8.4, null, 8.4, 8.3, 7.9, 7.5],
  0.6: [6.9, 7.4, 7.4, 7.5, 7.4, 7.6, 7.6, 7.8, null, 7.2, 7.2, 6.5, null],
  0.5: [6.4, 6.5, 6.3, 5.9, 5.7, 5.8, 5.9, 5.8, null, 5.4, 5.0, null, null],
  0.4: [5.8, 5.9, 5.2, 4.5, 4.2, 4.1, 4.4, 3.2, null, null, null, null, null],
  0.3: [4.3, 4.9, 3.5, 2.8, 2.5, 3.1, 2.5, null, null, null, null, null, null],
  0.2: [2.4, 2.3, 1.8, 1.5, 1.5, null, null, null, null, null, null, null, null],
};
function dynoAt(th, rpm) {
  const pts = DYNO_RPM.map((r, i) => [r, DYNO[th][i]]).filter((q) => q[1] != null);
  for (let i = 1; i < pts.length; i += 1) {
    if (rpm <= pts[i][0]) return pts[i - 1][1] + (rpm - pts[i - 1][0]) * (pts[i][1] - pts[i - 1][1]) / (pts[i][0] - pts[i - 1][0]);
  }
  return null;
}
const dynoScale = Qs / dynoAt(1.0, nFull);
function steadyRpm(th) {
  const qp = (r) => Qs * (r / nFull) ** 2;
  let lo = 2000, hi = 8000;
  if (dynoScale * dynoAt(th, lo) < qp(lo)) return null;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const q = dynoAt(th, mid);
    if (q != null && dynoScale * q > qp(mid)) lo = mid; else hi = mid;
  }
  return lo;
}
const throttleCurve = [];
for (let i = 0; i <= 10; i += 1) {
  let r;
  if (i === 0) r = 1300;
  else if (i === 10) r = nFull;
  else if (i === 1) r = (1300 + steadyRpm(0.2)) / 2;
  else r = Math.min(nFull, steadyRpm(i / 10));
  throttleCurve.push(r / nFull);
}
for (let i = 1; i < throttleCurve.length; i += 1) throttleCurve[i] = Math.max(throttleCurve[i], throttleCurve[i - 1]);
const curveR = throttleCurve.map((v) => Number(v.toFixed(4)));
/* The tank and the fuel flow: 34 oz (the sheet's FlowMaster); the flow at
 * full the shaft power at the DA120's own brake specific consumption, HFE's
 * data sheet's "575 g/kWh", at 0.73 kg/l; linear in the rpm through zero
 * as every glow table's. */
const tankM3 = 34 * 29.5735e-6;
const bsfc = 0.575; /* kg per kW h */
const flowFull = bsfc * shaftW / 1000 / 3600 / 0.73 / 1000; /* m^3/s */
/* The rotor, the propulsion lane's (scripts/da120-derive.js): the listed
 * 28 x 10 masses, Biela 322 g and Mejzlik 288 and 276 g, their mean as
 * 0.7 of a rod's m D^2 / 12, and the crank, the ignition's rotor and the
 * spinner, ESTIMATED at 0.0006 kg m^2. */
const propJ = 0.7 * ((0.322 + 0.288 + 0.276) / 3) * D * D / 12 + 0.0006;
const spoolTau = propJ * omegaFull / (2 * Qs);

/* Performance, the plant's polar and its thrust. Standing still the stick
 * runs the engine's rpm along its throttle curve (throttle_rpm), so a
 * static stick is converted to the rpm share and back. */
const rpmOf = (stick) => {
  const x = Math.max(0, Math.min(1, stick)) * 10;
  const i = Math.min(9, Math.floor(x));
  return curveR[i] + (x - i) * (curveR[i + 1] - curveR[i]);
};
/*
 * In the air the engine floats (plant_wing.c prop_spool, docs/FLIGHTMODEL.md
 * "The engine at a closed throttle"): its map's torque at the stick and the
 * speed it turns (engine_q, npm run da120:derive; nothing past
 * engine_rpm_max, DA's published 6,900 rpm, but the idle stop's) against
 * the air's on the prop, Q_f n^2 torque_curve(mu) times the tips' Mach
 * load over the full point's (CP_MACH, APC's 22x8 rows), mu = V /
 * (pitch_speed n). The thrust is Ts n^2 axial_curve(mu) (APC's 28 x 10
 * curves, npm run prop:curves -- wings). The map and the curves are read
 * off the table through propcurve.js (wingEngine, wingProp), so the
 * derivation flies what the plant flies.
 */
const prop = wingProp('FW_SLICK2680');
const engine = wingEngine('FW_SLICK2680');
/* The rotor's net torque over Q_f at speed share n, the stick and V, and the speed it settles at. */
const spoolNet = engine.net;
const nAt = engine.nAt;
const T = (V, stick) => Math.max(0, prop.thrust(Ts, V, nAt(stick, V)));
/* The thrust's share along the body's axis, the line turned thrust_yaw right. */
const Tx = (V, d) => T(V, d) * cosYaw;
const Dr = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return q * S * (CD0 + kInd * CL * CL); };
const level = (d) => {
  let lo = 10, hi = 60;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (Tx(mid, d) > Dr(mid)) lo = mid; else hi = mid; }
  return lo;
};
const reOf = (V) => V * c / NU;
function clmaxAt(V) {
  const re = reOf(V);
  const x = re <= secRe[0] ? 0 : (re >= secRe[1] ? 1 : (re - secRe[0]) / (secRe[1] - secRe[0]));
  return clmaxW[0] + x * (clmaxW[1] - clmaxW[0]);
}
let Vs = 14;
for (let i = 0; i < 50; i += 1) Vs = Math.sqrt(2 * W / (rho * S * clmaxAt(Vs)));
const CLmax = clmaxAt(Vs);
const ld = (V) => { const q = 0.5 * rho * V * V; const CL = W / (q * S); return CL / (CD0 + kInd * CL * CL); };
const pb2v = Clda * throwA / -Clp;
const rollAt = (V) => pb2v * 2 * V / b;

/* THE 3D REGIME, the Extra's arithmetic on this aircraft. */
const hoverShare = Math.sqrt(W / (Ts * cosYaw));
/* The stick that holds that rpm standing, on the engine's map. */
let hoverDuty = 0;
{ let lo = 0, hi = 1; for (let i = 0; i < 50; i += 1) { const mid = (lo + hi) / 2; if (nAt(mid, 0) < hoverShare) lo = mid; else hi = mid; } hoverDuty = lo; }
/* Hanging at the idle, the wash's dp and with it every surface's authority
 * is the idle's thrust over the hover's. */
const idleShare = (idle / hoverShare) ** 2;
let vClimb = 0;
for (let V = 0; V < 40; V += 0.001) { if (Tx(V, 1) - W - 0.5 * rho * V * V * S * CD0 <= 0) { vClimb = V; break; } }
const bhH = bh / 2;
function wash(thrust, u) {
  const dp = thrust / (Math.PI * propR * propR);
  const vi = 0.5 * (Math.sqrt(u * u + 2 * dp / rho) - u);
  const rw = propR * Math.sqrt((u + vi) / (u + 2 * vi));
  const fh = Math.min(1, rw / bhH);
  const hvUp = hvUpT, hvDn = hvDnT;
  const fv = (Math.min(rw, hvUp) + Math.min(rw, hvDn)) / (hvUp + hvDn);
  const ye = Math.min(rw, aileronOut);
  const fa = rw > aileronIn ? (ye * ye - aileronIn * aileronIn) / (aileronOut * aileronOut - aileronIn * aileronIn) : 0;
  return { dp, vi, rw, fh, fv, fa };
}
const slipCla = at * (Sh / S) * eta * (1 - deda);
const slipCma = -eta * VH * at * (1 - deda);
const slipA0 = CLtrim / CLa;
const slipCnb = av * VV, slipCnr = -2 * av * VV * lv / b, slipCyb = -av * Sv / S, slipClb = ClbFin;
const CN = 1.17;
const plate = (chord, a, bb) => 0.5 * rho * CN * integrate((r) => chord(r) * Math.abs(r) ** 3, a, bb);
const stabChord = () => Sh / bh, finChord = () => Sv / (hvUpT + hvDnT);
const fusX = [X(xTipPx), X(2183)];
const rotK = [
  plate(chordAt, -b / 2, b / 2) + plate(stabChord, -bh / 2, bh / 2) + plate(finChord, -hvDnT, hvUpT),
  plate(() => fusW, fusX[1], fusX[0]) + 0.5 * rho * CN * Sh * lh ** 3 + plate(() => b, -c / 2, c / 2),
  plate(() => 0.28, fusX[1], fusX[0]) + 0.5 * rho * CN * Sv * lv ** 3 + plate(() => b, -c / 2, c / 2) * 0.2,
];
/* The side crossflow drag area: the fuselage's side, 2.25 m by a mean
 * 0.26 m, at Allen and Perkins' 1.2 times their eta of 0.7, as the
 * Extra's. */
const sideCda = (fusL * 0.26) * 1.2 * 0.7;
/* Hanging, the thrust's share along the axis holds the weight. */
const hoverThrust = W / cosYaw;
const hov = wash(hoverThrust, 0);
const Qprop = torqueArm * hoverThrust;
const SWIRL_KEEP = 0.74; /* the plant's, Selig 2010 (docs/FLIGHTMODEL.md) */
const swirlFinPerK = (Qp) => S * b * rho * hov.vi * hov.fv * slipClb * -(Qp * (Math.min(hov.rw, hvUpT) - Math.min(hov.rw, hvDnT)) / (rho * Math.PI * propR * propR * hov.vi * hov.rw * hov.rw));
/* The fin's roll in the swirl is its side force at its height; a pilot
 * hanging the aircraft holds its heading on the rudder, and the rudder's
 * side force acts on the same fin at the same height, so with the yaw held
 * the fin's net side force, and its roll, go to nothing: the root's share
 * is what is left against the torque (the Extra's E8 took the fin's swirl
 * roll with the rudder free, docs/SLICK-STAGE1.md). Less one thing: the
 * right thrust's yaw, prop_x T sin(thrust_yaw), is held on the fin too, so
 * the fin keeps that over l_v of side force, pushing the tail right at its
 * height z_v, a roll to the right against the torque. */
const finSwirlRoll = SWIRL_KEEP * swirlFinPerK(Qprop);
const thrustYawHover = propX * hoverThrust * sinYaw;
const finHoldRoll = thrustYawHover * zvCG / lv;
const Qhover = Qprop - (1 - SWIRL_KEEP) * Qprop - finHoldRoll;
const torqueRoll = Math.sqrt(Math.max(0, Qhover) / rotK[0]);
const aileronHover = hov.dp * hov.fa * S * b * Clda * throwA;
const aileronRollNet = aileronHover > Qhover ? Math.sqrt((aileronHover - Qhover) / rotK[0]) : -Math.sqrt((Qhover - aileronHover) / rotK[0]);
const tailCn = 1.17;
const plateRatio = (x) => 1 / Math.sqrt(Math.sqrt(1 + (x / tailCn) ** 4));
const vhT = -slipCma / (at * (1 - deda)), vvF = slipCnb / av;
const pitchAccHover = hov.dp * hov.fh * S * c * Cmde * throwE * plateRatio(Cmde * throwE / vhT) / Iyy;
const yawAccHover = hov.dp * hov.fv * S * b * Math.abs(Cndr) * throwR * plateRatio(Cndr * throwR / vvF) / Izz;

/*
 * THE WING PAST THE STALL, the plant's own curve (plant_wing.c wing_lift
 * and stalled_lift) on this table, so the harrier is derived on the lift
 * the plant flies: the wing's own slope a_w to a stall_blend short of the
 * stall angle, the parabola over the top to CL max, the stalled lift held
 * stall_top and falling to stall_k of it, Viterna and Corrigan's
 * extrapolation past it; the tail's share of the slope, which does not
 * stall with the wing, at sin cos; the elevator's lift on it. CL max and
 * the blend at the Reynolds number flown (stall_re).
 */
function smooth(a0, a1, x) { if (x <= a0) return 0; if (x >= a1) return 1; const t = (x - a0) / (a1 - a0); return t * t * (3 - 2 * t); }
function stallAt(V) {
  const re = V * c / NU;
  const x = re <= secRe[0] ? 0 : (re >= secRe[1] ? 1 : (re - secRe[0]) / (secRe[1] - secRe[0]));
  const clmax = clmaxW[0] + x * (clmaxW[1] - clmaxW[0]);
  const peak = peakW[0] + x * (peakW[1] - peakW[0]);
  const bl = Math.max(blend, peak - clmax / aw);
  return { clmax, bl };
}
/* The wing's broadside normal force, Viterna and Janetzke's finite wing,
 * 1.11 + 0.018 AR (NASA TM-82944 eq. 12), plant_wing.c plate_cn. */
const PCN = 1.11 + 0.018 * Math.min(AR, 50);
const vhT2 = -slipCma / (at * (1 - deda));
function wingLift(alpha, de, V) {
  const { clmax, bl } = stallAt(V);
  const sa = Math.sin(alpha), ca = Math.cos(alpha);
  const aS = clmax / aw, aa = Math.abs(alpha);
  const sigma = smooth(aS - bl, aS + bl, aa);
  const clLin = CLa * alpha + CLde * de;
  const clFlat = PCN * sa * ca;
  const a0 = aS - bl, a1 = aS + bl;
  let wing = clmax;
  if (aa < a0) wing = aw * aa; else if (aa < a1) wing = clmax - aw * (a1 - aa) ** 2 / (4 * bl);
  /* The tail lifts on its own angle (hi_alpha with a wing slope): the
   * elevator's lift is the tail's, below, not the wing's. */
  const clPeak = alpha < 0 ? -wing : wing;
  const sHi = smooth(a1, a1 + 2 * bl, aa);
  const clOld = (1 - sHi) * clPeak + sHi * clFlat;
  let clSt = clOld, fall = 0, past = 0;
  if (sigma > 0) {
    const clS = clmax;
    const b0 = aS + stallTop, b1 = b0 + 2 * bl;
    const t = smooth(b0, b1, aa);
    let vit = 0;
    if (ca > 0 && Math.abs(sa) > 0.05) {
      const st = Math.min(b1, 0.5);
      const a2 = (stallK * clS - PCN * Math.sin(st) * Math.cos(st)) * Math.sin(st) / (Math.cos(st) ** 2);
      vit = a2 * ca * ca / sa;
    }
    fall = t;
    past = smooth(aS, aS + bl, aa);
    clSt = (1 - t) * (alpha < 0 ? -1 : 1) * clS + t * (clFlat + vit);
  }
  const clW = clOld + past * (clSt - clOld);
  /* The tail at its own angle, the downwash going with the wing's lift,
   * saturating on a plate with the elevator's share, its lift the slope's
   * tail share of that (plant_wing.c, tail_own). */
  const ae = -Cmde * de / vhT2;
  const xt = at * (sa - deda * clW / aw - slipA0 * (1 - deda)) + ae;
  const rt = plateRatio(xt);
  const cl = clW + (CLa - aw) / (at * (1 - deda)) * xt * rt;
  /* Viterna's drag continuity, B2 = (CD at the stall - CDmax sin^2 a_s) /
   * cos a_s (TM-82944 eqs. 15 and 17), on the plate's drag. */
  const b2 = (kInd * clmax * clmax - PCN * Math.sin(aS) ** 2) / Math.cos(aS);
  const b2c = ca > 0 ? b2 * ca : 0;
  const cdLin = CD0 + kInd * clLin * clLin;
  const cd = (1 - sigma) * cdLin + sigma * (CD0 + PCN * sa * sa + b2c);
  return { cl, clW, cd, clLin, clSt, sigma, past, fall, sa, ca, xt, rt, b2c };
}
const clPlant = (alpha) => { const w = wingLift(alpha, 0, 15); return { CL: w.cl, CD: w.cd }; };
const armCp = 0.40 - hCG, stallDw = eta * VH * at * deda / aw;

/*
 * The harrier, level at a body angle of attack past the stall, on every
 * term the plant takes there: the wing's lift and drag above; the thrust
 * along the body; Selig's jet normal force at the prop (jet_kj, AIAA
 * 2010-7938 eq. 13 to 16), k rho A w0 V_T with the inflow's washout; and
 * for the pitching moment the hi_alpha stiffness with the stabiliser at
 * its own angle saturating on a plate, the stalled wing's normal force at
 * its arms (stall_arm_ac, stall_arm_cp), the wash's share on the tail,
 * the thrust line 39 mm over the CG and the jet force's arm at prop_x. The
 * speed and the rpm share from the two force balances, the elevator from
 * the moment, iterated together.
 */
function harrier(alphaDeg) {
  const a = alphaDeg / DEG;
  const sa = Math.sin(a), ca = Math.cos(a);
  const A = Math.PI * propR * propR;
  const jet = (thrust, u) => {
    const w0 = Math.sqrt(thrust / (2 * rho * A));
    const wi = 0.5 * (Math.sqrt(u * u + 2 * thrust / (rho * A)) - u);
    return 0.80 * rho * A * w0 * wi / (u + wi);
  };
  let de = 0.5 * throwE, V = 10, thrust = 80, share = 0.6;
  for (let it = 0; it < 40; it += 1) {
    /* V from the vertical balance, the thrust from the horizontal at each V. */
    const balance = (Vt) => {
      const u = Vt * ca, q = 0.5 * rho * Vt * Vt;
      const { cl, cd } = wingLift(a, de, Vt);
      let tr = q * S * cd / ca;
      for (let k = 0; k < 40; k += 1) tr = (q * S * cd + jet(tr / cosYaw, u) * Vt * sa * sa) / ca;
      const fj = jet(tr / cosYaw, u) * Vt * sa;
      return { res: q * S * cl + tr * sa + fj * ca - W, tr, fj };
    };
    let lo = 3, hi = 30;
    for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (balance(mid).res < 0) lo = mid; else hi = mid; }
    V = lo;
    const bal = balance(V);
    thrust = bal.tr;
    const u = V * ca;
    let sLo = 0, sHi = 1;
    for (let i = 0; i < 40; i += 1) { const mid = (sLo + sHi) / 2; if (Tx(u, mid) < thrust) sLo = mid; else sHi = mid; }
    share = sLo;
    const q = 0.5 * rho * V * V;
    const w = wash(thrust / cosYaw, u);
    const xa = V * Math.sin(a - slipA0);
    const vw = u + 2 * w.vi;
    const kw = washKw(a, w.dp, V, rho); /* scripts/lib/washcontrol.js, as the plant */
    const cm = (d) => {
      const wl = wingLift(a, d, V);
      const ae = -Cmde * d / vhT2;
      const stiff = (Cma - slipCma) * sa + slipCma * slipA0 - vhT2 * wl.xt * wl.rt;
      const cnSt = PCN * sa + (wl.clSt - PCN * sa * ca) * ca + wl.b2c * sa;
      const clLinM = CLa * sa + CLde * d;
      const post = wl.sigma * (((1 - wl.past) * (hCG - 0.25) - wl.past * armCp) * cnSt - (hCG - 0.25) * clLinM);
      const rh = plateRatio(at * xa / vw + kw * ae);
      const slip = (rho * w.vi * w.fh * rh * slipCma * xa + w.dp * w.fh * rh * kw * Cmde * d) / q;
      return Cm0 + stiff + wl.past * post + slip - thrustZ * thrust / cosYaw / (q * S * c) + propX * bal.fj / (q * S * c);
    };
    let dLo = -throwE, dHi = throwE;
    for (let i = 0; i < 60; i += 1) { const mid = (dLo + dHi) / 2; if (cm(mid) < 0) dLo = mid; else dHi = mid; }
    de = dLo;
  }
  return { alphaDeg, V, thrust, duty: share, deOfThrow: de / throwE };
}
/* Rolled right, as S12 flies it: the right thrust points the line
 * thrust_yaw down from the body's axis, so the thrust meets the flight path
 * at the sideslip less thrust_yaw, and its sideways part at prop_x pitches
 * the nose down with the weathercock's moment, against the rudder. */
function knifeEdge(V) {
  const qb = 0.5 * rho * V * V;
  for (let bDeg = 1; bDeg < 60; bDeg += 0.01) {
    const bt = bDeg / DEG, sb = Math.sin(bt), cb = Math.cos(bt);
    const st = Math.sin(bt - thrustYaw), ct = Math.cos(bt - thrustYaw);
    const u = V * cb;
    let thrust = qb * S * CD0 / ct;
    let side = 0, dr = 0, w = null;
    for (let it = 0; it < 30; it += 1) {
      w = wash(thrust, u);
      const nBeta = qb * S * b * Cnb * sb + rho * w.vi * w.fv * S * b * slipCnb * (V * sb) + propX * thrust * sinYaw;
      const nPerDr = qb * S * b * Cndr + w.dp * w.fv * S * b * Cndr;
      dr = -nBeta / nPerDr;
      side = qb * S * (-CYb) * sb + 0.5 * rho * sideCda * (V * sb) ** 2 + rho * w.vi * w.fv * S * (-slipCyb) * (V * sb)
        - (qb + w.dp * w.fv) * S * CYdr * Math.abs(dr);
      thrust = (qb * S * CD0 + side * sb) / ct;
    }
    if (T(u, 1) < thrust) break;
    if (side * cb + thrust * st >= W) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 40; i += 1) { const mid = (lo + hi) / 2; if (T(u, mid) < thrust) lo = mid; else hi = mid; }
      return { V, betaDeg: bDeg, duty: lo, drOfThrow: Math.abs(dr) / throwR };
    }
  }
  return null;
}

/*
 * THE GEAR, off the side view: the main axles and the tailwheel's as
 * drawn, the wheels 105 and 38 mm, the 630 mm track (the label; the
 * drawing's pants sit wider). On the ground the drawing stands it 9.38
 * deg nose up. Each axle is lowered by 5 mm of static deflection so the
 * plant settles onto the drawn pose; stiffness for that, damping 0.6 of
 * critical, the Cub's rule.
 */
const wheelR = 0.0525, tailR = 0.019, track = 0.630;
const mainAx = [X(745.5), Z(Zt(1142))], tailAx = [X(2016.5), Z(Zt(957.5))];
const restPitch = Math.atan2((1182 - 972) * kS, (2016.5 - 745.5) * kS);
const mainC = [mainAx[0], mainAx[1] - wheelR], tailC = [tailAx[0], tailAx[1] - tailR];
const rp = restPitch;
const mainXw = mainC[0] * Math.cos(rp) - mainC[1] * Math.sin(rp);
const tailXw = tailC[0] * Math.cos(rp) - tailC[1] * Math.sin(rp);
/* A petrol engine idles on the strip: its idle thrust, Ts idle^2, its
 * share along the axis (cos thrust_yaw), pitches the aircraft nose down about the main wheels and
 * takes that much off the tail. */
const idleThrust = Ts * idle * idle * cosYaw;
const thrustHeight = cgHeight0() + thrustZ * Math.cos(restPitch);
function cgHeight0() { return -(mainC[0] * Math.sin(restPitch) + mainC[1] * Math.cos(restPitch)); }
const tailShare = (mainXw * W - idleThrust * thrustHeight) / ((mainXw - tailXw) * W);
const cgHeight = -(mainC[0] * Math.sin(rp) + mainC[1] * Math.cos(rp));
const wheelbase = mainXw - tailXw;
/* The springs for the weight alone, the engine stopped. */
const tailShare0 = mainXw / (mainXw - tailXw);
const mainLoad = W * (1 - tailShare0) / 2, tailLoad = W * tailShare0;
const kMain = mainLoad / 0.005, kTail = tailLoad / 0.005;
const cMain = 2 * 0.6 * Math.sqrt(kMain * mTotal / 2);
const mTail = (Iyy + mTotal * mainXw * mainXw) / (wheelbase * wheelbase);
const cTail = 2 * 0.6 * Math.sqrt(kTail * mTail);
/* The prop's lowest tip, a skid, on the thrust line. */
const propSkidZ = thrustZ - propR;
const propClear = cgHeight + propSkidZ * Math.cos(rp) + propX * Math.sin(rp);

/* The take off roll, as wingpilot.js flies it: the tail held down to 8
 * m/s, then up to 2 deg, and at 15 m/s 8 deg. */
function takeoff() {
  let V = 0, x = 0, t = 0;
  const dt = 0.0005;
  /* The engine from its idle to full on the plant's spool, J w_f n' =
   * Q_f net (plant_wing.c prop_spool, the map against the air's torque). */
  let n = nAt(0, 0);
  while (t < 15) {
    n += dt * Qs * spoolNet(1, V, n) / (propJ * omegaFull);
    const pDeg = V < 8 ? restPitch * DEG : (V < 15 ? 2 : 8);
    const { cl: CL, cd: CD } = wingLift(pDeg / DEG, 0, Math.max(V, 1));
    const q = 0.5 * rho * V * V;
    if (q * S * CL >= W) break;
    const acc = (Math.max(0, prop.thrust(Ts, V, n)) * cosYaw - q * S * CD - 0.08 * Math.max(0, W - q * S * CL)) / mTotal;
    V += acc * dt; x += V * dt; t += dt;
  }
  return { x, t, V };
}

/* Strip chords over the mean chord S/b, at 1/8, 3/8, 5/8 and 7/8 of the
 * semispan; each strip's aileron tau where the aileron spans it. */
const stripY = [1, 3, 5, 7].map((k) => k / 8 * (b / 2));
const stripC = stripY.map((y) => chordAt(y) / (S / b));
const stripTau = stripY.map((y) => {
  const lo = y - b / 16, hi = y + b / 16;
  const share = Math.max(0, Math.min(hi, aileronOut) - Math.max(lo, aileronIn)) / (hi - lo);
  return share * tauA;
});

const r = (x, n) => Number(x.toFixed(n));
/* The table as FW_SLICK2680 carries it, each to the places it is written
 * with; angles in degrees where the table writes "deg * WING_PI / 180". */
export const TABLE = {
  span: r(b, 3), area: r(S, 3), chord: r(c, 4),
  cl_alpha: r(CLa, 3), cl_max: r(CLmax, 4), cl_alpha_wing: r(aw, 3),
  cd0: CD0, k_induced: r(kInd, 5),
  cl_de: r(CLde, 4), cy_beta: r(CYb, 4), cy_dr: r(CYdr, 4), cl_beta: r(Clb, 4), cl_p: r(Clp, 4), cl_da: r(Clda, 4), cl_dr: r(Cldr, 4),
  cm_0: r(Cm0, 4), cm_alpha: r(Cma, 4), cm_q: r(Cmq, 3), cm_de: r(Cmde, 4),
  cn_beta: r(Cnb, 4), cn_r: r(Cnr, 4), cn_dr: r(Cndr, 4),
  throw_a: r(throwA * DEG, 2), throw_e: r(throwE * DEG, 2), throw_r: r(throwR * DEG, 2), expo: expoAE,
  thrust_static: r(Ts, 2), rpm_no_load: r(rpmNL, 1), torque_arm: r(torqueArm, 5), thrust_z: r(thrustZ, 4), thrust_yaw: r(thrustYaw * DEG, 2),
  throttle_idle: curveR[0], tank_m3: r(tankM3 * 1e6, 1), flow_full: r(flowFull * 1e6 * 60, 1),
  prop_x: r(propX, 4),
  stall_arm_ac: r(hCG - 0.25, 4), stall_arm_cp: r(armCp, 4), stall_dw: r(stallDw, 4),
  stall_k: stallK, stall_top: 1.0,
  slip_r: r(propR, 4), slip_yh: r(bhH, 4), slip_a0: r(slipA0, 4), slip_cl_a: r(slipCla, 4), slip_cm_a: r(slipCma, 4),
  slip_cn_b: r(slipCnb, 4), slip_cn_r: r(slipCnr, 4), slip_cy_b: r(slipCyb, 4), slip_cl_b: r(slipClb, 4),
  tail_at: r(at, 3), tail_av: r(av, 3), tail_deda: r(deda, 3), side_cda: r(sideCda, 4),
  j_prop: r(propJ, 5),
};
export const TABLE_PAIRS = {
  throttle_rpm: curveR,
  stall_re: secRe, stall_clmax: clmaxW.map((v) => r(v, 4)), stall_peak: peakW.map((v) => r(v, 4)),
  slip_hv: [r(hvUpT, 3), r(hvDnT, 3)], slip_ya: [r(aileronIn, 3), r(aileronOut, 3)],
  strip_c: stripC.map((v) => r(v, 3)), strip_tau: stripTau.map((v) => r(v, 3)),
  rot_k: rotK.map((v) => r(v, 4)),
};
export const PLANT = {
  mass_kg: mTotal, inertia: [r(Ixx, 3), r(Iyy, 3), r(Izz, 3)], prop_r: r(propR, 4), pos_x: r(propX, 4),
  main: [r(mainAx[0], 4), r(track / 2, 3), r(mainAx[1] - 0.005, 4)], main_r: wheelR,
  tail: [r(tailAx[0], 4), 0, r(tailAx[1] - 0.005, 4)], tail_r: tailR,
  k_main: r(kMain, 0), c_main: r(cMain, 2), k_tail: r(kTail, 0), c_tail: r(cTail, 2),
  skid: [r(propX, 4), 0, r(propSkidZ, 4)],
};

const hRows = [35, 40, 45].map((a) => harrier(a));
const kRows = [20, 25, 30].map((v) => knifeEdge(v));
export const DERIVED = {
  e1: level(0.75), e2: Vs, alphaStall: CLmax / aw, e3: ld(1.4 * Vs), e3speed: 1.4 * Vs, e4: level(1),
  e5: pb2v, e6: hoverDuty, e7: vClimb, e8: torqueRoll * DEG, e9: aileronRollNet * DEG,
  e10p: pitchAccHover, e10y: yawAccHover, idleShare, e11: hRows[1], e12: kRows[2], restPitch: restPitch * DEG, cgHeight, tailShare,
  e14: takeoff(),
};

const f = (x, n = 3) => (x === null || x === undefined ? 'none' : Number(x).toFixed(n));
const J = (o, n = 3) => JSON.stringify(o, (kk, v) => (typeof v === 'number' ? +v.toFixed(n) : v));
const rows = [
  ['span, area (sheet); planform area of the drawn chords', `${f(b)} ${f(S)}; ${f(Splan, 4)}`],
  ['scales: top span, top chord, side mm/px', `${f(kSpan * 1000, 4)} ${f(kc * 1000, 4)} ${f(kS * 1000, 4)}`],
  ['AR, MAC, y_MAC, MAC LE behind root LE, W/S N/m2', `${f(AR)} ${f(MAC, 4)} ${f(yMAC, 4)} ${f(macLE, 4)} ${f(W / S, 1)}`],
  ['tube at chord, CG behind root LE m, h_cg (MAC)', `${f(tubeFrac)} ${f(cgBehindRootLE, 4)} ${f(hCG, 4)}`],
  ['stab: Sh, Se/Sh, span, root, tip, MAC, l_h', `${f(Sh, 4)} ${f(cfE)} ${f(bh)} ${f(chRoot)} ${f(chTip)} ${f(macH, 4)} ${f(lh, 4)}`],
  ['fin: Sv, rudder share, l_v, z_v (CG), up dn of thrust', `${f(Sv, 4)} ${f(cfR)} ${f(lv, 4)} ${f(zvCG, 4)} ${f(hvUpT)} ${f(hvDnT)}`],
  ['ailerons from, to m', `${f(aileronIn)} ${f(aileronOut)}`],
  ['a_w, a_t, a_v /rad; AR_v geometric, effective', `${f(aw)} ${f(at)} ${f(av)}; ${f(arVgeo)} ${f(arV)}`],
  ['dε/dα, V_H, V_V', `${f(deda)} ${f(VH)} ${f(VV, 4)}`],
  ['CLα, h_n, static margin', `${f(CLa, 4)} ${f(hn)} ${f(SM)}`],
  ['Cmα, Cm0, Cmq, Cmδe, CLδe', `${f(Cma, 4)} ${f(Cm0, 4)} ${f(Cmq)} ${f(Cmde, 4)} ${f(CLde, 4)}`],
  ['CYβ, Cnβ, Cnr', `${f(CYb, 4)} ${f(Cnb, 4)} ${f(Cnr, 4)}`],
  ['Clβ (fin, low wing), Clp, Clδa', `${f(Clb, 4)} (${f(ClbFin, 4)} ${f(ClbLow, 4)}) ${f(Clp, 4)} ${f(Clda, 4)}`],
  ['cl_beta_wing, cl_beta_fin, cn_beta_fin: the wing\'s and the fin\'s shares (docs/FLIGHTMODEL.md, sideslip past the stall)', `${f(Clb - ClbFin, 4)} ${f(ClbFin, 4)} ${f(av * VV, 4)}`],
  ['Cnδr, CYδr, Clδr', `${f(Cndr, 4)} ${f(CYdr, 4)} ${f(Cldr, 4)}`],
  ['throws deg a e r; K\' a e r; tau a e r', `${f(throwA * DEG, 2)} ${f(throwE * DEG, 2)} ${f(throwR * DEG, 2)}; ${f(kPrime(throwA))} ${f(kPrime(throwE))} ${f(kPrime(throwR))}; ${f(tauA)} ${f(tauE)} ${f(tauR)}`],
  ['CD0 (all laminar, mean, all turbulent), parts', `${f(dragLo.cd0, 4)} ${f(CD0, 4)} ${f(dragHi.cd0, 4)} ${J(drag.parts, 4)}`],
  ['e (Raymer 12.48), k', `${f(eOsw)} ${f(kInd, 5)}`],
  ['section CLmax at 3.6e5, 7e5; wing; peak deg', `${secClmax.join(' ')}; ${clmaxW.map((v) => f(v, 4)).join(' ')}; ${peakW.map((v) => f(v * DEG, 2)).join(' ')}`],
  ['stall_top deg, stall_k', `1.0 ${stallK}`],
  ['mass: sum kg (target 12.474), fuel kg, fuselage kg, its front share', `${f(mSum, 3)} ${f(fuelKg, 3)} ${f(fusM, 3)} ${f(fusShare, 3)}`],
  ['   mass x moment about the CG (zero)', f(mx, 6)],
  ['CG over the thrust line m; thrust_z', `${f(zCGt, 4)} ${f(thrustZ, 4)}`],
  ['inertia Ixx Iyy Izz', `${f(Ixx, 3)} ${f(Iyy, 3)} ${f(Izz, 3)}`],
  ['engine: rpm, thrust N, T/W, torque N m, arm m', `${nFull} ${f(Ts, 2)} ${f(Ts / W, 3)} ${f(Qs, 3)} ${f(torqueArm, 5)}`],
  ['   shaft power W (hp), Falcon Ct, APC Cp/Ct', `${f(shaftW, 0)} (${f(shaftW / 745.7, 2)}) ${f(ctFalcon, 4)} ${f(cpA / ctA, 4)}`],
  ['   the stick\'s curve (rpm over full at 0, 0.1, ... 1); dyno scale', `${curveR.join(' ')}; ${f(dynoScale, 4)}`],
  ['   rpm NL (glow rule), J0, pitch speed (geometric), idle', `${f(rpmNL, 1)} ${f(J0, 4)} ${f(Vp, 3)} (${f(VpGeo, 2)}) ${f(idle, 4)}`],
  ['   tank cc, flow full cc/min, minutes at full', `${f(tankM3 * 1e6, 1)} ${f(flowFull * 1e6 * 60, 1)} ${f(tankM3 / flowFull / 60, 1)}`],
  ['   prop J kg m2, spool tau at full s', `${f(propJ, 5)} ${f(spoolTau, 3)}`],
  ['slipstream: tail CLα, Cmα, a0; fin Cnβ, Cnr, CYβ, Clβ', `${f(slipCla, 4)} ${f(slipCma, 4)} ${f(slipA0, 4)}; ${f(slipCnb, 4)} ${f(slipCnr, 4)} ${f(slipCyb, 4)} ${f(slipClb, 4)}`],
  ['rot_k roll pitch yaw N m s2', `${f(rotK[0], 4)} ${f(rotK[1], 4)} ${f(rotK[2], 4)}`],
  ['side crossflow drag area m2', f(sideCda, 4)],
  ['strip_c, strip_tau', `${stripC.map((v) => f(v)).join(' ')}; ${stripTau.map((v) => f(v)).join(' ')}`],
  ['stall: arm_ac, arm_cp, dw', `${f(hCG - 0.25, 4)} ${f(armCp, 4)} ${f(stallDw, 4)}`],
  ['S1 level at 75 percent of the stick (rpm share there)', `${f(DERIVED.e1, 2)} (${f(nAt(0.75, DERIVED.e1), 4)})`],
  ['engine standing, stick 0 0.3 0.5 0.7 1: rpm share (throttle curve)', [0, 0.3, 0.5, 0.7, 1].map((st) => `${f(nAt(st, 0), 4)} (${f(rpmOf(st), 4)})`).join(' ')],
  ['S6 spool time constant at the hover s: the map; flat torque (2 n)', `${f(propJ * omegaFull / (Qs * -(spoolNet(hoverDuty, 0, hoverShare + 0.001) - spoolNet(hoverDuty, 0, hoverShare - 0.001)) / 0.002), 3)}; ${f(propJ * omegaFull / (Qs * 2 * hoverShare), 3)}`],
  ['S6 rpm share per stick at the hover: the map; the throttle curve', `${f((nAt(hoverDuty + 0.01, 0) - nAt(hoverDuty - 0.01, 0)) / 0.02, 3)}; ${f((rpmOf(hoverDuty + 0.01) - rpmOf(hoverDuty - 0.01)) / 0.02, 3)}`],
  ['engine at idle in the 26 m/s glide, rpm; at full at top speed, rpm', `${f(nAt(0, 26) * nFull, 0)}; ${f(nAt(1, DERIVED.e4) * nFull, 0)}`],
  ['S2 stall, Re there, CLmax, CLmax / a_w', `${f(Vs, 2)} ${f(reOf(Vs), 0)} ${f(CLmax, 4)} ${f(CLmax / aw, 5)}`],
  ['S3 L/D at 1.4 Vs', `${f(DERIVED.e3, 2)} at ${f(1.4 * Vs, 2)}`],
  ['S4 top speed', f(DERIVED.e4, 2)],
  ['S5 roll pb/2V, deg/s at 20, 30 m/s', `${f(pb2v, 4)} ${f(rollAt(20) * DEG, 0)} ${f(rollAt(30) * DEG, 0)}`],
  ['S6 hover stick (rpm share); wash dp, v_i, rw, fh fv fa', `${f(hoverDuty, 4)} (${f(hoverShare, 4)}); ${f(hov.dp, 1)} ${f(hov.vi, 2)} ${f(hov.rw, 4)} ${f(hov.fh)} ${f(hov.fv)} ${f(hov.fa, 4)}`],
  ['S7 vertical climb speed, full throttle', f(vClimb, 2)],
  ['S8 torque at hover N m, net (the fin\'s swirl roll, rudder free), torque roll deg/s', `${f(Qprop, 3)} ${f(Qhover, 3)} (${f(finSwirlRoll, 3)}) ${f(torqueRoll * DEG, 0)}`],
  ['S8 right thrust\'s yaw at hover N m, the fin holding it rolls N m', `${f(thrustYawHover, 3)} ${f(finHoldRoll, 3)}`],
  ['S9 full aileron in the wash N m, net roll deg/s', `${f(aileronHover, 3)} ${f(aileronRollNet * DEG, 0)}`],
  ['S10 full elevator hanging, rad/s2; rudder; at the idle, share', `${f(pitchAccHover, 2)} ${f(yawAccHover, 2)}; ${f(idleShare, 4)}`],
  ['S11 the wing past the stall: CL, CD at 40 deg', `${f(clPlant(40 / DEG).CL, 3)} ${f(clPlant(40 / DEG).CD, 3)}`],
  ['S11 harrier at 35, 40, 45 deg', hRows.map((h) => J(h)).join(' ')],
  ['S12 knife edge at 20, 25, 30 m/s', kRows.map((k) => J(k)).join(' ')],
  ['S13 rest: pitch deg, CG height m, tail share, prop tip clear m', `${f(restPitch * DEG, 2)} ${f(cgHeight, 4)} ${f(tailShare, 4)} ${f(propClear, 4)}`],
  ['S14 take off roll', J(DERIVED.e14)],
  ['gear: main axle x z, tail axle x z, wheelbase', `${f(mainAx[0], 4)} ${f(mainAx[1], 4)} ${f(tailAx[0], 4)} ${f(tailAx[1], 4)} ${f(wheelbase, 4)}`],
  ['   loads main tail N; k main tail; c main tail', `${f(mainLoad, 2)} ${f(tailLoad, 2)}; ${f(kMain, 0)} ${f(kTail, 0)}; ${f(cMain, 2)} ${f(cTail, 2)}`],
];


/*
 * The bands, tests/slick-thresholds.json, written from the derived figures
 * above (--write-bands), so a plant change is re-derived by running this
 * file: npm run slick:derive -- --write-bands, then --check.
 */
function bandsJson() {
  const D = DERIVED;
  const r = (x, n) => Number(x.toFixed(n));
  const band = (v, lo, hi, n) => ({ min: r(v * lo, n), max: r(v * hi, n) });
  const th = {
    note: "The bands Extreme Flight's 105.5 in Slick 580 plant has to land in, from docs/SLICK-STAGE1.md, which derives each from EF's data sheet and drawing, Desert Aircraft's DA-120, Falcon's measured static table for the DA-120 on its 28 x 10 and APC's data for the prop's shape (npm run slick:derive prints them; --check holds these derived figures to it). The widths are the Extra's (tests/extra-thresholds.json), each for the same reason. Never widened to pass; argue in the derivation instead.",
    s1_level_75: { duty: 0.75, derived: r(D.e1, 2), ...band(D.e1, 0.88, 1.12, 2), unit: 'm/s', source: `level speed at 75 percent of the throttle stick, the engine floating on its map against APC's 28 x 10 curves (at this speed it reaches DA's 6,900 rpm cap, as at full), derived ${D.e1.toFixed(2)} from Falcon's thrust, the curves and the component drag build up; 12 percent either way, the Extra's, for the thrust line's slope and cd0` },
    s2_stall: { alphaStall: r(D.alphaStall, 5), derived: r(D.e2, 2), ...band(D.e2, 0.94, 1.14, 2), unit: 'm/s', source: `sqrt(2W / rho S CLmax) at the wing's CLmax at the stall's own Reynolds number, 4.4e5 on the mean chord: 0.902, 0.9 of Sheldahl and Klimas' NACA 0012 (SAND80-2114 Table 2: 0.9811 at 3.6e5, 1.0749 at 7e5), derived ${D.e2.toFixed(2)}; alphaStall CLmax over the wing's own slope; the Extra's band in proportion, 0.94 to 1.14 of the formula, since the plant reads the stall at the blend's midpoint` },
    s3_glide: { speed: r(D.e3speed, 1), derived: r(D.e3, 2), ...band(D.e3, 0.88, 1.12, 2), source: `L/D at 1.4 Vs, ${D.e3speed.toFixed(1)} m/s, derived ${D.e3.toFixed(2)}, 12 percent either way, the Extra's` },
    s4_top: { duty: 1.0, derived: r(D.e4, 2), ...band(D.e4, 0.9, 1.1, 2), unit: 'm/s', source: `level speed at full throttle, the engine at DA's 6,900 rpm cap (engine_rpm_max) on APC's 28 x 10 curves, derived ${D.e4.toFixed(2)}, 10 percent either way` },
    s5_roll: { speed: 22.0, duty: 0.6, derived: r(D.e5, 4), ...band(D.e5, 0.75, 1.25, 3), source: `pb/2V at full aileron on the sheet's high rate (38 up, 37 down), Clda throw_a / -Clp, derived ${D.e5.toFixed(4)} (${(D.e5 * 2 * 22 / 2.68 * 180 / Math.PI).toFixed(0)} deg/s at 22 m/s); 25 percent either way, the width the large deflection correction K' carries. EF's 'blistering roll rate'` },
    s6_hover: { derived: r(D.e6, 4), ...band(D.e6, 0.95, 1.05, 3), maxHeightDrift: 0.5, unit: 'throttle', source: `hanging on the prop, the nose held up by the elevator and rudder in the slipstream, the height by the throttle: the rpm share where the thrust meets the weight, sqrt(W / T cos 3 deg) ${hoverShare.toFixed(4)}, as the stick that holds it standing on the DA-120's map (engine_q), derived ${D.e6.toFixed(4)}; 5 percent either way` },
    s7_vertical: { derived: r(D.e7, 2), ...band(D.e7, 0.9, 1.1, 2), unit: 'm/s', source: `straight up at full throttle, the climb speed where the thrust, the engine floating on its map against APC's curves, meets the weight and the zero lift drag, derived ${D.e7.toFixed(2)}; 10 percent either way` },
    s8_torque_roll: { derived: r(D.e8, 1), min: Math.round(D.e8 * 0.75), max: Math.round(D.e8 * 1.25), unit: 'deg/s', source: `hanging at the hover with the ailerons let go: the prop's torque_arm W less the swirl's roll (SWIRL_KEEP 0.74, Selig 2010, docs/FLIGHTMODEL.md) and less the roll of the fin holding the right thrust's yaw (thrust_yaw 3 deg, prop_x T sin 3 deg over l_v at the fin's height z_v), against the air the turning wing sweeps through (rot_k), steady at sqrt(Q / k), derived ${D.e8.toFixed(0)} deg/s, to the left; 25 percent either way` },
    s9_aileron_hover: { derived: r(D.e9, 1), min: Math.round(D.e9 * 0.6), max: Math.round(D.e9 * 1.4), unit: 'deg/s', source: `the same with full right aileron: the ailerons' inboard share in the slipstream beats the net torque, derived ${D.e9.toFixed(0)} deg/s right; 40 percent either way, the difference of two estimates` },
    s10_zero_speed: { pitchDerived: r(D.e10p, 2), yawDerived: r(D.e10y, 2), idleDerived: r(D.idleShare, 4), pitchMin: r(D.e10p * 0.75, 2), pitchMax: r(D.e10p * 1.25, 2), yawMin: r(D.e10y * 0.75, 2), yawMax: r(D.e10y * 1.25, 2), idleMax: r(D.idleShare * 1.5, 3), unit: 'rad/s^2', source: `hanging still, full up elevator and full right rudder from rest: the slipstream's dp on the surfaces' immersed shares, each saturating on a flat plate (hi_alpha), derived ${D.e10p.toFixed(2)} in pitch and ${D.e10y.toFixed(2)} in yaw, the yaw over the same kick with the rudder centred (the right thrust and the swirl yaw it without one); 25 percent either way. A petrol engine idles rather than stopping: at its idle the wash's dp, and the authority, is (idle / hover rpm)^2 = ${D.idleShare.toFixed(4)} of the hover's, under 1.5 times that` },
    s11_harrier: { alphaDeg: 40, vDerived: r(D.e11.V, 2), dutyDerived: r(D.e11.duty, 3), vMin: r(D.e11.V * 0.8, 2), vMax: r(D.e11.V * 1.2, 2), dutyMin: r(D.e11.duty * 0.85, 3), dutyMax: r(D.e11.duty * 1.15, 3), maxBankDeg: 10, maxHeightDrift: 2.0, source: `level at a body angle of attack of 40 deg, the throttle holding height: the stalled wing's plate lift and the thrust's vertical share against the weight, derived ${D.e11.V.toFixed(2)} m/s at a stick of ${D.e11.duty.toFixed(3)} with the elevator at ${(D.e11.deOfThrow * 100).toFixed(0)} percent of its throw; the speed 20 percent and the throttle 15 percent either way, the elevator short of full` },
    s12_knife_edge: { speed: 30.0, betaDerived: r(D.e12.betaDeg, 2), dutyDerived: r(D.e12.duty, 3), betaMin: r(D.e12.betaDeg * 0.75, 2), betaMax: r(D.e12.betaDeg * 1.25, 2), dutyMin: r(D.e12.duty * 0.85, 3), dutyMax: r(Math.min(1, D.e12.duty * 1.15), 3), maxHeightDrift: 3.0, source: `rolled right to 90 deg at 30 m/s, height held on the rudder, the right thrust 3 deg down from the axis and its yaw on the rudder too: derived ${D.e12.betaDeg.toFixed(1)} deg of sideslip at a stick of ${D.e12.duty.toFixed(3)} with the rudder at ${(D.e12.drOfThrow * 100).toFixed(0)} percent of its throw; the sideslip 25 percent and the throttle 15 percent either way, the rudder short of full` },
    s13_rest: { pitchDerived: r(D.restPitch, 2), zDerived: r(D.cgHeight, 4), tailDerived: r(D.tailShare, 4), pitchMin: r(D.restPitch - 0.5, 2), pitchMax: r(D.restPitch + 0.5, 2), zMin: r(D.cgHeight - 0.005, 4), zMax: r(D.cgHeight + 0.005, 4), tailMin: r(D.tailShare - 0.035, 3), tailMax: r(D.tailShare + 0.035, 3), source: `the sheet's side view on its wheels, ${D.restPitch.toFixed(2)} deg nose up, the CG ${D.cgHeight.toFixed(4)} m up, ${(D.tailShare * 100).toFixed(1)} percent of the weight on the tailwheel; half a degree, 5 mm and 3.5 points either way` },
    s14_takeoff: { derived: r(D.e14.x, 2), distMin: r(D.e14.x * 0.6, 2), distMax: r(D.e14.x * 1.6, 2), source: `full throttle from standing, the engine spooling up from its idle on its map against the prop's torque curve, the tail up at 8 m/s and the nose to 8 deg at 15 m/s: liftoff at ${D.e14.V.toFixed(1)} m/s after ${D.e14.x.toFixed(2)} m (slick:derive); 40 percent short and 60 long, the Extra's, since the plant's roll has the gear's springs, the engine's spool and the pilot's hands in it and the derivation has none` },
    s16_cross_host: { source: "the Slick's recorded take off, hover, torque roll and flight, state trace hash, Node against headless Chrome" },
  };
    return JSON.stringify(th, null, 0).replace(/^\{/, '{\n  ').replace(/,"(s\d+_[a-z_0-9]+|note)":/g, ',\n  "$1":').replace(/\}$/, '\n}\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain && process.argv.includes('--write-bands')) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  writeFileSync(join(root, 'tests/slick-thresholds.json'), bandsJson());
  console.log('wrote tests/slick-thresholds.json');
} else if (isMain) {
  for (const [name, v] of rows) console.log(`${name.padEnd(58)} ${v}`);
}

/*
 * --check: the table in src/native/plant_wing.c, the row in
 * src/native/plant.c and the bands in tests/slick-thresholds.json against
 * what is derived here, each to the places it is written with.
 */
if (isMain && process.argv.includes('--check')) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const wing = readFileSync(join(root, 'src/native/plant_wing.c'), 'utf8');
  const body = wing.slice(wing.indexOf('const FixedWingParams FW_SLICK2680 = {')).split('\n};')[0];
  const plant = readFileSync(join(root, 'src/native/plant.c'), 'utf8');
  const prow = plant.slice(plant.indexOf('[SIM_AIRFRAME_SLICK2680] = {')).split('\n},')[0];
  const th = JSON.parse(readFileSync(join(root, 'tests/slick-thresholds.json'), 'utf8'));
  let bad = 0;
  const num = (x) => Number(x);
  const fieldOf = (src, name) => {
    const m = src.match(new RegExp(`^\\s+\\.${name} = (.*?),\\s*(?:/\\*.*)?$`, 'm'));
    return m ? m[1].trim() : null;
  };
  const same = (got, want) => Math.abs(got - want) <= 1e-9 + Math.abs(want) * 1e-9;
  /* The tank and the flow are written in cc and cc a minute: 1005.5e-6,
   * 71.2e-6 / 60.0. */
  const scaleOf = { tank_m3: true, flow_full: true };
  for (const [k, want] of Object.entries(TABLE)) {
    const t = fieldOf(body, k);
    let got = null;
    if (t !== null) {
      const deg = t.match(/^([-\d.]+) \* WING_PI \/ 180\.0$/);
      const cc = t.match(/^([\d.]+)e-6/);
      got = deg ? Number(deg[1]) : (scaleOf[k] && cc ? Number(cc[1]) : num(t));
    }
    if (got === null || !same(got, want)) { bad += 1; console.log(`  DIFFERS FW_SLICK2680.${k}: table ${t}, derived ${want}`); }
  }
  for (const [k, want] of Object.entries(TABLE_PAIRS)) {
    const m = body.match(new RegExp(`\\.${k} = \\{ ([^}]*) \\}`));
    const got = m ? m[1].split(',').map((s) => Number(s.trim())) : null;
    if (!got || got.length !== want.length || got.some((v, i) => !same(v, want[i]))) { bad += 1; console.log(`  DIFFERS FW_SLICK2680.${k}: table ${m ? m[1] : 'none'}, derived ${want.join(', ')}`); }
  }
  const pnum = (name) => { const t = fieldOf(prow, name); return t === null ? null : Number(t); };
  if (pnum('mass_kg') !== PLANT.mass_kg) { bad += 1; console.log(`  DIFFERS plant mass_kg: ${pnum('mass_kg')}, derived ${PLANT.mass_kg}`); }
  const inert = prow.match(/\.inertia = \{ ([^}]*) \}/);
  if (!inert || inert[1].split(',').some((v, i) => !same(Number(v), PLANT.inertia[i]))) { bad += 1; console.log(`  DIFFERS plant inertia: ${inert ? inert[1] : 'none'}, derived ${PLANT.inertia.join(', ')}`); }
  const wheels = [...prow.matchAll(/\.pos = \{ ([^}]*) \}, \.r = ([\d.]+), \.k = ([\d.]+), \.c = ([\d.]+)/g)].map((m) => ({ pos: m[1].split(',').map(Number), r: Number(m[2]), k: Number(m[3]), c: Number(m[4]) }));
  const wantW = [
    { pos: PLANT.main, r: PLANT.main_r, k: PLANT.k_main, c: PLANT.c_main },
    { pos: [PLANT.main[0], -PLANT.main[1], PLANT.main[2]], r: PLANT.main_r, k: PLANT.k_main, c: PLANT.c_main },
    { pos: PLANT.tail, r: PLANT.tail_r, k: PLANT.k_tail, c: PLANT.c_tail },
  ];
  wantW.forEach((w, i) => {
    const gw = wheels[i];
    if (!gw || gw.pos.some((v, j) => !same(v, w.pos[j])) || !same(gw.r, w.r) || !same(gw.k, w.k) || !same(gw.c, w.c)) {
      bad += 1; console.log(`  DIFFERS plant wheel ${i}: ${gw ? JSON.stringify(gw) : 'none'}, derived ${JSON.stringify(w)}`);
    }
  });
  const near = (got, want, tol) => got !== undefined && Math.abs(got - want) <= tol;
  const bands = [
    ['s1_level_75.derived', th.s1_level_75?.derived, DERIVED.e1, 0.005],
    ['s2_stall.derived', th.s2_stall?.derived, DERIVED.e2, 0.005],
    ['s2_stall.alphaStall', th.s2_stall?.alphaStall, DERIVED.alphaStall, 0.00005],
    ['s3_glide.derived', th.s3_glide?.derived, DERIVED.e3, 0.005],
    ['s4_top.derived', th.s4_top?.derived, DERIVED.e4, 0.005],
    ['s5_roll.derived', th.s5_roll?.derived, DERIVED.e5, 0.0005],
    ['s6_hover.derived', th.s6_hover?.derived, DERIVED.e6, 0.00005],
    ['s7_vertical.derived', th.s7_vertical?.derived, DERIVED.e7, 0.005],
    ['s8_torque_roll.derived', th.s8_torque_roll?.derived, DERIVED.e8, 0.5],
    ['s9_aileron_hover.derived', th.s9_aileron_hover?.derived, DERIVED.e9, 0.5],
    ['s10_zero_speed.pitchDerived', th.s10_zero_speed?.pitchDerived, DERIVED.e10p, 0.005],
    ['s10_zero_speed.yawDerived', th.s10_zero_speed?.yawDerived, DERIVED.e10y, 0.005],
    ['s10_zero_speed.idleDerived', th.s10_zero_speed?.idleDerived, DERIVED.idleShare, 0.00005],
    ['s11_harrier.vDerived', th.s11_harrier?.vDerived, DERIVED.e11.V, 0.005],
    ['s11_harrier.dutyDerived', th.s11_harrier?.dutyDerived, DERIVED.e11.duty, 0.0005],
    ['s12_knife_edge.betaDerived', th.s12_knife_edge?.betaDerived, DERIVED.e12.betaDeg, 0.05],
    ['s12_knife_edge.dutyDerived', th.s12_knife_edge?.dutyDerived, DERIVED.e12.duty, 0.0005],
    ['s13_rest.pitchDerived', th.s13_rest?.pitchDerived, DERIVED.restPitch, 0.005],
    ['s13_rest.zDerived', th.s13_rest?.zDerived, DERIVED.cgHeight, 0.00005],
    ['s13_rest.tailDerived', th.s13_rest?.tailDerived, DERIVED.tailShare, 0.0005],
    ['s14_takeoff.derived', th.s14_takeoff?.derived, DERIVED.e14.x, 0.005],
  ];
  for (const [name, got, want, tol] of bands) {
    if (!near(got, want, tol)) { bad += 1; console.log(`  DIFFERS tests/slick-thresholds.json ${name}: ${got}, derived ${want.toFixed(5)}`); }
  }
  console.log(bad ? `slick:derive --check: ${bad} differ from the derivation` : 'slick:derive --check: the table, the plant row and the bands are what is derived');
  process.exit(bad ? 1 : 0);
}
