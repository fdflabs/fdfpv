/*
 * stall-derive.js: the arithmetic behind docs/STALL-STAGE1.md, the post
 * stall numbers of every fixed wing's table in src/native/plant_wing.c,
 * from the geometry each aircraft's own derivation already has. It never
 * loads the plant. Harness arithmetic in JS maths, which is allowed here
 * because nothing it prints is hashed. Run with npm run stall:derive.
 *
 * Per airframe, all per the plant's reference chord (its table's chord):
 *
 *   stall_arm_ac  the CG behind the wing's aerodynamic centre, h_cg - h_ac.
 *                 On a flying wing the lift of the linear model acts at the
 *                 neutral point, so it is minus the static margin.
 *   stall_arm_cp  the flat plate's centre of pressure, 0.40 of the chord
 *                 past the stall (Hoerner, Fluid Dynamic Lift, ch. 3),
 *                 behind the CG.
 *   stall_dw      eta V_H a_t (d eps/d alpha) / a_w: the tail's moment per
 *                 unit of wing lift lost, the downwash being proportional
 *                 to the lift (Nelson eq. 2.22). Zero without a tail.
 *   stall_asym    how much sooner the left panel stalls: 1 mm of trailing
 *                 edge over the chord, ESTIMATED as a foam or composite
 *                 kit's build tolerance at the panel joint.
 *   strip_c       the chord of each of the four strips a half wing is
 *                 taken in, at an eighth, three, five and seven eighths of
 *                 the semispan, over the mean chord S/b, from the drawn
 *                 planform. The plant loads them by Schrenk's approximation
 *                 (NACA TM 948, 1940), c cl / (c_mean CL) = (c +
 *                 c_elliptic) / (2 c_mean), so a rectangular wing loads its
 *                 root most and stalls there first, and a tapered one
 *                 further out. Sweep, which the approximation leaves out,
 *                 moves the loading outboard again.
 *   stall_top,    from each section's measured lift curve at the kit's
 *   stall_k       Reynolds number, read off Selig et al., Summary of
 *                 Low-Speed Airfoil Data (UIUC), in the table below.
 *
 * The geometry is copied from each aircraft's derivation, which it names;
 * a figure changed there must change here.
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
const H_CP = 0.40;
const TE_TOLERANCE = 0.001;
const lift = (ar) => 2 * Math.PI * ar / (ar + 2);

/* A conventional tail, Nelson's forms as every derivation here uses them.
 * c is the plant's chord; hCG and hAC per that chord. */
function tailed({ b, S, c, hCG, hAC = 0.25, Sh, lh, bh, eta = 0.9, deda = null }) {
  const AR = b * b / S;
  const aw = lift(AR);
  const at = lift(bh * bh / Sh);
  const dd = deda ?? 2 * aw / (Math.PI * AR);
  const VH = Sh * lh / (S * c);
  return {
    arm_ac: hCG - hAC,
    arm_cp: H_CP - hCG,
    dw: eta * VH * at * dd / aw,
    asym: TE_TOLERANCE / c,
    note: `a_w ${aw.toFixed(3)}, a_t ${at.toFixed(3)}, V_H ${VH.toFixed(3)}, deps/dalpha ${dd.toFixed(3)}, h_cg ${hCG.toFixed(3)}`,
  };
}

/* A flying wing: the table's own static margin, its lift at the neutral
 * point a quarter of the chord back. */
function tailless({ c, clAlpha, cmAlpha }) {
  const SM = -cmAlpha / clAlpha;
  const hCG = 0.25 - SM;
  return {
    arm_ac: -SM,
    arm_cp: H_CP - hCG,
    dw: 0,
    asym: TE_TOLERANCE / c,
    note: `static margin ${SM.toFixed(4)}, h_cg ${hCG.toFixed(3)}`,
  };
}

const planes = {};

/* The 1000 mm flying wing, docs/WING-STAGE1.md: CLalpha 4.36, Cmalpha -0.30. */
planes.FW_WING1000 = tailless({ c: 0.22, clAlpha: 4.36, cmAlpha: -0.30 });

/* The Skyhunter, docs/SKYHUNTER-STAGE1.md's tail table: the CG at a third
 * of the chord, the tail 0.0593 m^2 of 0.456 m span at 0.69 m. */
planes.FW_SKY1800 = tailed({ b: 1.80, S: 0.36, c: 0.20, hCG: 1 / 3, Sh: 0.0593, lh: 0.69, bh: 0.456 });

/* The Cub, scripts/cub-derive.js. */
planes.FW_CUB1400 = tailed({ b: 1.4, S: 0.28, c: 0.20, hCG: 0.30, Sh: 0.0470, lh: 0.517, bh: 0.38 });

/* The Radian, scripts/glider-derive.js: the drawn planform's mean chord
 * and where it starts, which put the manual's 63 mm CG at hCG. */
{
  const b = 2.0;
  const half = [
    [0.00, 0.200], [0.60, 0.198], [0.70, 0.185], [0.80, 0.164], [0.85, 0.149],
    [0.90, 0.132], [0.95, 0.110], [0.98, 0.092], [1.00, 0.050],
  ];
  const chordAt = (y) => {
    const a = Math.abs(y);
    for (let i = 0; i + 1 < half.length; i += 1) {
      const [y0, c0] = half[i];
      const [y1, c1] = half[i + 1];
      if (a <= y1) return c0 + (c1 - c0) * (a - y0) / (y1 - y0);
    }
    return half[half.length - 1][1];
  };
  const N = 2000;
  const integrate = (f) => {
    let s = 0;
    for (let i = 0; i < N; i += 1) {
      const y = (b / 2) * (i + 0.5) / N;
      s += f(y) * (b / 2) / N;
    }
    return s;
  };
  const areaDrawn = 2 * integrate(chordAt);
  const MAC = 2 * integrate((y) => chordAt(y) ** 2) / areaDrawn;
  const macLE = 2 * integrate((y) => chordAt(y) * (chordAt(0) - chordAt(y))) / areaDrawn;
  const hCG = (0.063 - macLE) / MAC;
  planes.FW_RADIAN2000 = tailed({ b, S: 0.355, c: MAC, hCG, Sh: 0.0476, lh: 0.69, bh: 0.477 });
}

/* The Bramor, docs/BRAMOR-STAGE1.md's table: CLalpha 4.77, Cmalpha -0.420. */
planes.FW_BRAMOR2300 = tailless({ c: 0.257, clAlpha: 4.77, cmAlpha: -0.420 });

/* The Slow Stick, scripts/slowstick-derive.js: its own aerodynamic centre
 * on the raked planform and DATCOM's downwash, per the plant's chord S/b. */
{
  const b = 1.176, S = 0.3264, c = S / b, AR = b * b / S;
  const rake = 0.10;
  const cRoot = S / (b - rake);
  const wingLE = 0.22, cgAft = 0.100;
  const hStab = { le: 0.78, chord: 0.14, spanTE: 0.44, spanLE: 0.36 };
  const Sh = hStab.chord * (hStab.spanTE + hStab.spanLE) / 2, bh = hStab.spanTE;
  const yIn = (b - 2 * rake) / 2;
  const mac = cRoot * (yIn + rake / 3) / (yIn + rake / 2);
  const macLE = cRoot * rake * (1 / 2 - 1 / 3) / (yIn + rake / 2);
  const xAcWing = wingLE + macLE + 0.25 * mac;
  const xCG = wingLE + cgAft;
  const lh = hStab.le + 0.25 * hStab.chord - xAcWing;
  const KA = 1 / AR - 1 / (1 + Math.pow(AR, 1.7));
  const KL = (10 - 3 * 1.0) / 7;
  const KH = (1 - 0.045 / b) / Math.cbrt(2 * lh / b);
  const deda = 4.44 * Math.pow(KA * KL * KH, 1.19);
  /* Its table's arms, from the same planform: the CG behind the wing's
   * aerodynamic centre, and the plate's 0.40 of the mean chord behind the
   * CG, both per S/b. */
  const t = tailed({ b, S, c, hCG: (xCG - wingLE) / c, hAC: (xAcWing - wingLE) / c, Sh, lh, bh, deda });
  t.arm_cp = (wingLE + macLE + H_CP * mac - xCG) / c;
  planes.FW_SLOWSTICK1180 = t;
}

/* The Timber, scripts/timber-derive.js: E-flite's 60 mm CG on a 240 mm
 * chord. The floats move the CG down, not along, so both float planes
 * share their landplane's numbers. */
planes.FW_TIMBER1500 = tailed({ b: 1.555, S: 0.361, c: 0.361 / 1.555, hCG: 0.060 / 0.240, Sh: 0.071, lh: 0.548, bh: 0.56 });
planes.FW_TIMBER1500F = planes.FW_TIMBER1500;

/* The Buzzard Bombshell, docs/BOMBSHELL-STAGE1.md and scripts/bombshell-
 * derive.js: its own stall arms, which it was built with, and the tail's
 * share from the derivation's a_w (its polyhedral panels' cos^2 in it),
 * a_t, V_H and DATCOM's downwash. */
planes.FW_BOMBSHELL1118 = {
  arm_ac: 0.0761,
  arm_cp: 0.0703,
  dw: 0.9 * 0.680 * 4.013 * 0.341 / 4.453,
  asym: TE_TOLERANCE / 0.1905,
  note: 'a_w 4.453, a_t 4.013, V_H 0.680, deps/dalpha 0.341 (DATCOM), its own arms',
};
planes.FW_CUB1400F = planes.FW_CUB1400;

/* The Kadet Senior, docs/KADET-STAGE1.md and scripts/kadet-derive.js: its
 * own arms, the CG 3 7/8 in behind the leading edge of a constant 14.74 in
 * chord, and the tail's share from the derivation's a_w (the dihedral's
 * cos^2 in it), a_t, V_H and DATCOM's downwash. */
planes.FW_KADET1981 = {
  arm_ac: 0.0128,
  arm_cp: 0.1372,
  dw: 0.9 * 0.549 * 4.154 * 0.380 / 4.533,
  asym: TE_TOLERANCE / 0.374487,
  note: 'a_w 4.533, a_t 4.154, V_H 0.549, deps/dalpha 0.380 (DATCOM), its own arms',
};

/* The F-16 V3, docs/F16-STAGE1.md and scripts/f16-derive.js: its own
 * arms on the manual's top view's mean chord, 0.2856 m, the CG 90 mm
 * behind the root leading edge, 0.195 of it, 16 mm ahead of the wing's
 * aerodynamic centre; the tail's share from the derivation's a_w, a_t,
 * V_H and Nelson's downwash. */
planes.FW_F16878 = {
  arm_ac: -0.0552,
  arm_cp: 0.2052,
  dw: 0.9 * 0.2942 * 2.644 * 0.647 / 3.142,
  asym: TE_TOLERANCE / 0.2856,
  note: 'a_w 3.142, a_t 2.644, V_H 0.294, deps/dalpha 0.647 (Nelson), its own arms',
};

/* The Ugly Stik, docs/UGLYSTIK-STAGE1.md and scripts/uglystik-derive.js:
 * its own arms, the plan's CG 4.69 in behind the leading edge of the
 * 13.68 in chord with its strip ailerons, 1.27 in behind the wing's
 * aerodynamic centre, and the tail's share from the derivation's a_w, a_t,
 * V_H and DATCOM's downwash. */
planes.FW_UGLYSTIK1567 = {
  arm_ac: 0.0991,
  arm_cp: 0.0610,
  dw: 0.9 * 0.435 * 3.880 * 0.416 / 4.427,
  asym: TE_TOLERANCE / 0.3256,
  note: 'a_w 4.427, a_t 3.880, V_H 0.435, deps/dalpha 0.416 (DATCOM), its own arms',
};

/* OA Composites' NRJ, scripts/dlg-derive.js: the manual's 66 mm CG on
 * the elliptic planform's mean chord, 0.1378 m, whose leading edge is
 * 24.5 mm behind the root's; the tail measured off Hyperflight's
 * photograph. */
planes.FW_NRJ1490 = tailed({ b: 1.49, S: 0.190, c: 0.1378, hCG: 0.301, Sh: 0.020, lh: 0.56, bh: 0.30 });
/* Great Planes' Tiger Moth, docs/TIGERMOTH-STAGE1.md and
 * scripts/tigermoth-derive.js: a biplane, its arms the cell's (the two
 * wings' aerodynamic centres by their shares of the lift, the biplane
 * solver's): the kit's CG, 70 mm behind the bottom wing's leading edge,
 * 0.107 chords behind the cell's aerodynamic centre, and the tail's share
 * from the derivation's cell a_w, a_t, V_H and DATCOM's downwash. */
planes.FW_TIGERMOTH1803 = {
  arm_ac: 0.1068,
  arm_cp: 0.0432,
  dw: 0.9 * 0.3477 * 4.0977 * 0.4416 / 4.4036,
  asym: TE_TOLERANCE / 0.2683,
  note: 'a_w 4.404 (the cell), a_t 4.098, V_H 0.348, deps/dalpha 0.442 (DATCOM), its own arms',
};

/* The four strips' chords over the mean chord, from a planform chord(eta),
 * eta 0 at the root and 1 at the tip. */
function strips(chord) {
  const N = 4000;
  let mean = 0;
  for (let i = 0; i < N; i += 1) mean += chord((i + 0.5) / N) / N;
  return [0.125, 0.375, 0.625, 0.875].map((e) => chord(e) / mean);
}
const rect = () => 1;
const taper = (l) => (eta) => 1 - (1 - l) * eta;
const radianHalf = [
  [0.00, 0.200], [0.60, 0.198], [0.70, 0.185], [0.80, 0.164], [0.85, 0.149],
  [0.90, 0.132], [0.95, 0.110], [0.98, 0.092], [1.00, 0.050],
];
const radianChord = (eta) => {
  for (let i = 0; i + 1 < radianHalf.length; i += 1) {
    const [y0, c0] = radianHalf[i];
    const [y1, c1] = radianHalf[i + 1];
    if (eta <= y1) return c0 + (c1 - c0) * (eta - y0) / (y1 - y0);
  }
  return radianHalf[radianHalf.length - 1][1];
};
/* The Bramor as scripts/bramor-derive.js draws it: chord 0.62 m to 0.11 m
 * out, the cranked delta to 0.26 m at 0.30 m, then straight to 0.12 m at
 * the 1.15 m tip. */
const bramorChord = (eta) => {
  const y = eta * 1.15;
  if (y <= 0.11) return 0.62;
  if (y <= 0.30) return 0.62 - 0.36 * (y - 0.11) / 0.19;
  return 0.26 - 0.14 * (y - 0.30) / 0.85;
};
/* The 1000 mm wing's derivation has no planform: ESTIMATED as the usual
 * foam wing of its class, a taper of 0.5. The Slow Stick's raked tips are
 * left out: its strips are a rectangle's. */
const STRIPS = {
  FW_WING1000: strips(taper(0.5)),
  FW_SKY1800: strips(taper(0.7)),
  FW_CUB1400: strips(rect),
  FW_RADIAN2000: strips(radianChord),
  FW_BRAMOR2300: strips(bramorChord),
  FW_SLOWSTICK1180: strips(rect),
  FW_TIMBER1500: strips(rect),
  /* Constant chord; the balsa tips' rounding over the outer 1.8 of 22 in
   * is left out. */
  FW_BOMBSHELL1118: strips(rect),
  /* Constant chord; the sheeted tips' rounding over the outer 3 of 39 in
   * is left out. */
  FW_KADET1981: strips(rect),
  /* The cropped delta's trapezoid, 414.5 mm at the centreline to 83 at
   * the tip; the strakes ahead of it are left out. */
  FW_F16878: strips(taper(0.201)),
  /* Constant chord; the raked tips over the outer 2.9 of 30.9 in are left
   * out, as the Kadet's rounding is. */
  FW_UGLYSTIK1567: strips(rect),
  /* The NRJ's elliptic chord, the tips' last few millimetres of rounding
   * left out. */
  FW_NRJ1490: strips((eta) => Math.sqrt(1 - eta * eta)),
  /* Both of the Tiger Moth's wings constant chord; the rounded tips are
   * left out, as the Kadet's rounding is. */
  FW_TIGERMOTH1803: strips(rect),
};
STRIPS.FW_TIMBER1500F = STRIPS.FW_TIMBER1500;
STRIPS.FW_CUB1400F = STRIPS.FW_CUB1400;

/* The sections, UIUC figures read at the kit's Reynolds number (the
 * derivations' own): where the lift leaves the linear curve's CLmax
 * (top, deg past the angle the linear curve reaches CLmax at) and what it
 * falls to (k, of CLmax), interpolated between the Reynolds numbers
 * tested. Clark-Y (B), vol. 3 fig. 5.22: at 1e5 held to +4.4 deg then 0.93
 * of 1.30; at 2e5 to +6.7 deg then 0.93 to 0.95 of 1.32. SD7037 (A), vol.
 * 1 fig. 4.134: at 6e4 +1.8 deg then about 1.05 of 1.21; at 1e5 +1.1 deg
 * then 0.96 of 1.18; at 6e4 +3.0 deg then 0.9 of 1.25. NACA 2415, vol. 2 fig. 5.52: at 1e5 +2.9 deg then
 * 0.73 to 0.80 of 1.18; at 2e5 +4.2 deg then 0.76 of 1.22. MH45, vol. 1
 * fig. 4.61: at 1e5 +2.5 deg then 0.80 of 1.09; at 2e5 +2.8 then 0.92 of
 * 1.14; at 3e5 +0.6 then a trailing edge stall, 1.05 of 1.16 five degrees
 * on. Which section stands for which kit is each derivation's own choice
 * of class; no kit publishes its section. */
const SECTION = {
  FW_WING1000: { sec: 'MH45 at 1.3e5', top: 2.6, k: 0.76 },
  FW_SKY1800: { sec: 'Clark-Y at 1.4e5', top: 5.3, k: 0.72 },
  FW_CUB1400: { sec: 'Clark-Y at 1.1e5', top: 4.6, k: 0.72 },
  FW_RADIAN2000: { sec: 'SD7037 at 8e4', top: 1.4, k: 0.84 },
  FW_BRAMOR2300: { sec: 'MH45 at 2.8e5', top: 0.6, k: 0.89 },
  FW_SLOWSTICK1180: { sec: 'Clark-Y at 1e5', top: 4.4, k: 0.72 },
  FW_TIMBER1500: { sec: 'NACA 2415 at 1.6e5', top: 3.7, k: 0.63 },
  /* A 10 percent flat bottomed section at 8e4: the Clark-Y's at 6e4 held
   * +3.0 deg then 0.9 of 1.25, at 1e5 +4.4 deg then 0.93 of 1.30. */
  FW_BOMBSHELL1118: { sec: 'Clark-Y at 8e4', top: 3.7, k: 0.72 },
  /* A 13 percent flat bottomed section at 2e5 (9 m/s on 0.374 m): the
   * Clark-Y's at 2e5, held +6.7 deg. */
  FW_KADET1981: { sec: 'Clark-Y at 2e5', top: 6.7, k: 0.72 },
  /* No UIUC section: a thin 64A204 alone stalls at its leading edge, and
   * the strakes' vortex holds the lift on the F-16 past it (NASA TP-1538's
   * lift curve peaks 15 deg past its linear range). ESTIMATED: held 10 deg,
   * to Freewing's 30 deg of alpha, then 0.8 of it. */
  FW_F16878: { sec: 'the strakes\' vortex, ESTIMATED', top: 10.0, k: 0.80 },
  /* A 16 percent section within a percent of symmetric at 2.3e5 (10 m/s
   * on its 0.33 m chord): the NACA 2415's at 2e5, the thick section here
   * that stalls from the trailing edge, held +4.2 deg then 0.76. */
  FW_UGLYSTIK1567: { sec: 'NACA 2415 at 2e5', top: 4.2, k: 0.76 },
  /* A 6 percent F3K section at 5e4, thinner than the SD7037 (9.2
   * percent), which at 6e4 holds 1.8 deg: a thin section's bubble bursts
   * at its leading edge, so ESTIMATED sharper, held 1 deg and falling to
   * 0.80. No UIUC section this thin was tested at this Reynolds number. */
  FW_NRJ1490: { sec: '6 percent F3K section at 5e4, ESTIMATED', top: 1.0, k: 0.80 },
  /* A cambered trainer's section at 1.8e5 (10 m/s on the 0.268 m chord),
   * ESTIMATED of the Clark-Y's class, Great Planes publishing none: its
   * figures between 1e5 and 2e5, held +6.2 deg then 0.72, the Cub's and
   * the Kadet's fall. */
  FW_TIGERMOTH1803: { sec: 'Clark-Y at 1.8e5', top: 6.2, k: 0.72 },
};
SECTION.FW_TIMBER1500F = SECTION.FW_TIMBER1500;
SECTION.FW_CUB1400F = SECTION.FW_CUB1400;

for (const [name, p] of Object.entries(planes)) {
  const sc = SECTION[name];
  console.log(`${name.padEnd(17)} ${sc.sec}: stall_top ${sc.top} deg, stall_k ${sc.k}; strip_c ${STRIPS[name].map((x) => x.toFixed(3)).join(', ')}`);
}
for (const [name, p] of Object.entries(planes)) {
  console.log(`${name.padEnd(17)} stall_arm_ac ${p.arm_ac.toFixed(4).padStart(7)}  stall_arm_cp ${p.arm_cp.toFixed(4)}  `
    + `stall_dw ${p.dw.toFixed(4)}  stall_asym ${p.asym.toFixed(5)} (${(p.asym * DEG).toFixed(2)} deg)   ${p.note}`);
}
