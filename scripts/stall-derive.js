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
 *   stall_asym    how much sooner the left panel stalls: none. A kit's
 *                 build tolerance has a side, but which is unknown, and a
 *                 fixed left made every power off stall drop the left wing
 *                 (2026-10-09, docs/STALL-STAGE1.md).
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
const H_CP = 0.40;

/* A flying wing: the table's own static margin, its lift at the neutral
 * point a quarter of the chord back. */
function tailless({ c, clAlpha, cmAlpha }) {
  const SM = -cmAlpha / clAlpha;
  const hCG = 0.25 - SM;
  return {
    arm_ac: -SM,
    arm_cp: H_CP - hCG,
    dw: 0,
    asym: 0,
    note: `static margin ${SM.toFixed(4)}, h_cg ${hCG.toFixed(3)}`,
  };
}

const planes = {};

/* The 1000 mm flying wing, docs/WING-STAGE1.md: CLalpha 4.36, Cmalpha -0.30. */
planes.FW_WING1000 = tailless({ c: 0.22, clAlpha: 4.36, cmAlpha: -0.30 });

/* The Bramor, docs/BRAMOR-STAGE1.md's table: CLalpha 4.77, Cmalpha -0.420. */
planes.FW_BRAMOR2300 = tailless({ c: 0.257, clAlpha: 4.77, cmAlpha: -0.420 });

/* The four strips' chords over the mean chord, from a planform chord(eta),
 * eta 0 at the root and 1 at the tip. */
function strips(chord) {
  const N = 4000;
  let mean = 0;
  for (let i = 0; i < N; i += 1) mean += chord((i + 0.5) / N) / N;
  return [0.125, 0.375, 0.625, 0.875].map((e) => chord(e) / mean);
}
const taper = (l) => (eta) => 1 - (1 - l) * eta;
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
 * foam wing of its class, a taper of 0.5. */
const STRIPS = {
  FW_WING1000: strips(taper(0.5)),
  FW_BRAMOR2300: strips(bramorChord),
};
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
  FW_BRAMOR2300: { sec: 'MH45 at 2.8e5', top: 0.6, k: 0.89 },
};
for (const [name, p] of Object.entries(planes)) {
  const sc = SECTION[name];
  console.log(`${name.padEnd(17)} ${sc.sec}: stall_top ${sc.top} deg, stall_k ${sc.k}; strip_c ${STRIPS[name].map((x) => x.toFixed(3)).join(', ')}`);
}
for (const [name, p] of Object.entries(planes)) {
  console.log(`${name.padEnd(17)} stall_arm_ac ${p.arm_ac.toFixed(4).padStart(7)}  stall_arm_cp ${p.arm_cp.toFixed(4)}  `
    + `stall_dw ${p.dw.toFixed(4)}  stall_asym ${p.asym.toFixed(5)} (${(p.asym * DEG).toFixed(2)} deg)   ${p.note}`);
}
