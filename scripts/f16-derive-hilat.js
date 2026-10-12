/*
 * f16-derive-hilat.js: the F-16's lateral derivatives against the body's
 * angle of attack, from the full size F-16's measured tables (Nguyen et
 * al., NASA TP-1538, 1979, table III; transcribed and checked in
 * ~/Desktop/fdfpv-loop/research/F16-HIGH-ALPHA.md), to the rows of
 * FW_F16878.hi_lat. Harness arithmetic in JS maths, which is allowed here
 * because nothing it prints is hashed. Run with npm run f16:derive-hilat.
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

import { pathToFileURL } from 'node:url';

const DEG = 180 / Math.PI;

/* TP-1538 table III's alpha grid, deg. */
const A = [-20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90];

/*
 * Static derivatives, per deg, body axes, slopes between beta +-4 (p.
 * 12), the delta Cn_beta and delta Cl_beta corrections in. The Freewing's
 * leading edge is fixed and undrooped, TP-1538's leading edge flap
 * retracted: its "lef" tables to 45 deg, the base table (delta_h 0)
 * past, where no retracted data exist. Research note sections 1 and 2.
 */
const CNB = [0.00220, 0.00314, 0.00354, 0.00356, 0.00347, 0.00361, 0.00380, 0.00347, 0.00181, 0.00004, -0.00068, -0.00425, -0.00365, -0.00624,
  -0.00402, 0.00015, 0.00402, 0.00430, -0.00024, -0.00063];
const CLB = [-0.00055, -0.00086, -0.00017, -0.00071, -0.00147, -0.00250, -0.00269, -0.00225, -0.00169, -0.00280, -0.00236, -0.00159, -0.00295, -0.00251,
  -0.00267, -0.00183, -0.00186, -0.00246, -0.00152, -0.00139];

/*
 * Rate derivatives, per rad of p b/2V and r b/2V, body axes, read from
 * the scan (pp. 51, 58, 66, 73, 81, 82, 90, 91; the digitized copy's Clp,
 * Cnr and Cnp are wrong past 10 to 30 deg), the base table plus the
 * leading edge flap's retracted increment to 45 deg. Research note
 * section 4.
 */
const CLP = [-0.366, -0.366, -0.366, -0.377, -0.345, -0.434, -0.408, -0.388, -0.329, -0.294, -0.23, -0.21, -0.12, -0.1, -0.1, -0.12, -0.14, -0.1, -0.15, -0.2];
const CNR = [-0.517, -0.517, -0.517, -0.461, -0.414, -0.397, -0.373, -0.455, -0.55, -0.582, -0.595, -0.637, -1.02, -0.84, -0.541, -0.35, -0.35, -0.07, -0.15, -0.15];
const CLR = [-0.155, -0.155, -0.155, -0.201, -0.0024, 0.088, 0.205, 0.22, 0.319, 0.437, 0.68, 0.1, 0.447, -0.33, -0.068, 0.118, 0.0802, 0.0529, 0.0868, -0.0183];
const CNP = [-0.0006, -0.0006, -0.0006, 0.0424, -0.0075, -0.0214, -0.032, -0.032, 0.05, 0.15, 0.13, 0.158, 0.24, 0.15, 0, -0.2, -0.3, 0.15, 0, 0];
const DCLP = [0.006, 0.006, 0.006, 0.018, -0.1, 0.02, 0.058, 0.087, 0.027, -0.056, -0.082, 0.362, 0.194, 0.097];
const DCNR = [0.137, 0.137, 0.137, 0.098, 0.037, 0.016, 0.007, 0.014, -0.103, -0.098, -0.31, -0.437, 0.167, 0.084];
const DCLR = [0.029, 0.029, 0.029, 0.175, 0.0665, 0.036, 0.007, 0.066, 0.201, 0.006, -0.068, -0.537, -0.787, -0.394];
const DCNP = [0.0615, 0.0615, 0.0615, 0.0091, 0.061, 0.0129, 0.0439, 0.0512, -0.0294, 0.0017, 0.0584, 0.211, 0.392, 0.196];
const lef = (base, d) => base.map((v, i) => (i < d.length ? v + d[i] : v));

/*
 * Controls at beta 0, body axes: the roll increment is delta_a 20 deg with
 * 5 deg of differential tail, as the roll system drives them (Appendix A,
 * p. 35; fig. 13 labels it so), delta_a positive for left roll; the
 * rudder's delta_r 30, positive for left yaw. Base tables, leading edge
 * flap 25 (TP-1538 gives no retracted control increments). Research note
 * section 3.
 */
const DCL_A = [-0.0226, -0.0327, -0.0328, -0.0401, -0.0481, -0.0511, -0.0499, -0.0491, -0.0418, -0.0372, -0.0308, -0.0256, -0.0166, -0.0122,
  -0.0076, -0.0095, -0.0092, -0.0075, -0.0041, 0.0022];
const DCN_A = [-0.0089, -0.0098, -0.0091, -0.0111, -0.0120, -0.0105, -0.0090, -0.0066, 0.0001, 0.0045, 0.0065, 0.0099, 0.0044, 0.0097,
  0.0130, 0.0167, 0.0182, 0.0154, 0.0138, 0.0125];
const DCL_R = [0.0201, 0.0176, 0.0184, 0.0154, 0.0146, 0.0144, 0.0137, 0.0135, 0.0137, 0.0147, 0.0126, 0.0114, 0.0059, 0.0007,
  0.0026, 0.0019, 0.0015, 0.0008, -0.0023, 0.0018];
const DCN_R = [-0.0481, -0.0484, -0.0476, -0.0449, -0.0451, -0.0450, -0.0441, -0.0446, -0.0475, -0.0483, -0.0494, -0.0449, -0.0328, -0.0162,
  -0.0081, -0.0040, -0.0012, -0.0015, -0.0061, -0.0024];

/*
 * The plant's lateral derivatives are stability axis ones (plant_wing.c,
 * "The table's lateral derivatives are stability axis ones"), so TP-1538's
 * body axis ones turn through alpha (Etkin and Reid, the stability to body
 * axis transformation): for a moment pair, Cl_s = Cl cos + Cn sin and Cn_s
 * = Cn cos - Cl sin; for the rotary derivatives the rates turn too.
 */
const stab = A.map((a, i) => {
  const c = Math.cos(a / DEG), s = Math.sin(a / DEG);
  const clp = lef(CLP, DCLP)[i], cnr = lef(CNR, DCNR)[i], clr = lef(CLR, DCLR)[i], cnp = lef(CNP, DCNP)[i];
  return {
    a,
    clb: (CLB[i] * c + CNB[i] * s) * DEG,
    cnb: (CNB[i] * c - CLB[i] * s) * DEG,
    clp: clp * c * c + (clr + cnp) * s * c + cnr * s * s,
    cnr: cnr * c * c - (cnp + clr) * s * c + clp * s * s,
    clr: clr * c * c - (clp - cnr) * s * c - cnp * s * s,
    cnp: cnp * c * c + (cnr - clp) * s * c - clr * s * s,
    cla: DCL_A[i] * c + DCN_A[i] * s,
    cna: DCN_A[i] * c - DCL_A[i] * s,
    cnd: DCN_R[i] * c - DCL_R[i] * s,
  };
});

export { A, stab };

const at0 = stab[A.indexOf(0)];
const ratio = (k) => stab.map((r) => r[k] / at0[k]);
const f = (x, n = 3) => x.toFixed(n);
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  console.log('TP-1538 table III, stability axes, per rad (beta) and per rad of the nondimensional rate');
  console.log('alpha   clb      cnb     clp     cnr     clr     cnp   ail_cl   ail_cn  rud_cn');
  for (const r of stab) {
    console.log(`${String(r.a).padStart(5)} ${f(r.clb).padStart(7)} ${f(r.cnb).padStart(7)} ${f(r.clp).padStart(7)} ${f(r.cnr).padStart(7)} ${f(r.clr).padStart(7)} ${f(r.cnp).padStart(7)} ${f(r.cla, 4).padStart(8)} ${f(r.cna, 4).padStart(8)} ${f(r.cnd, 4).padStart(7)}`);
  }
  console.log('\nFW_F16878.hi_lat: cn_beta, cl_beta, cl_p, cn_r, the ailerons, the rudder as ratios to alpha 0; Cl_r, Cn_p per rad');
  const rows = ['cnb', 'clb', 'clp', 'cnr', 'cla', 'cnd'].map(ratio).concat([stab.map((r) => r.clr), stab.map((r) => r.cnp)]);
  for (const row of rows) console.log(`    { ${row.map((x) => f(x)).join(', ')} },`);
}
