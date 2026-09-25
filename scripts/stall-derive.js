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
planes.FW_CUB1400F = planes.FW_CUB1400;

for (const [name, p] of Object.entries(planes)) {
  console.log(`${name.padEnd(17)} stall_arm_ac ${p.arm_ac.toFixed(4).padStart(7)}  stall_arm_cp ${p.arm_cp.toFixed(4)}  `
    + `stall_dw ${p.dw.toFixed(4)}  stall_asym ${p.asym.toFixed(5)} (${(p.asym * DEG).toFixed(2)} deg)   ${p.note}`);
}
