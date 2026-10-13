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
 * The side force, CY, body axes on the wing's area, at beta +2, 4, 8, 10,
 * 15, 20, 25 and 30 deg (first list) and their negatives (second), one
 * pair per alpha: the leading edge flap retracted to 45 deg (TP-1538's
 * "lef" table, -20 to 45), the base table (delta_h 0) past, as the static
 * derivatives above take them. Table III as the digitized copy has it
 * (Russell 2003 after Stevens and Lewis, the "hifi F-16" aerodata files
 * CY0820_ALPHA2_BETA1_402.dat and CY0320_ALPHA1_BETA1_401.dat; research
 * note, sources 1 and 2): that copy carries the wind tunnel's asymmetry
 * past 30 deg as an offset at beta 0 (research note, "Provenance and
 * verification"), so the plant takes the odd part, the mean of the two
 * sides, which is the symmetric aircraft's (the asymmetry's sign is not
 * the model's, research note). The base table's +beta less beta 0 rows
 * are the research note's section 2 table.
 */
const CY_LEF0 = [
  [[-0.0142, -0.0476, -0.1093, -0.1388, -0.1990, -0.2720, -0.3280, -0.3990],
   [0.0376, 0.0688, 0.0990, 0.1194, 0.1808, 0.2533, 0.3107, 0.3808]],
  [[-0.0225, -0.0590, -0.1388, -0.1790, -0.2600, -0.3220, -0.3770, -0.4340],
   [0.0448, 0.0813, 0.1568, 0.1938, 0.2748, 0.3361, 0.3909, 0.4480]],
  [[-0.0251, -0.0620, -0.1425, -0.1861, -0.2890, -0.3670, -0.4440, -0.4990],
   [0.0465, 0.0845, 0.1563, 0.1959, 0.2984, 0.3759, 0.4529, 0.5088]],
  [[-0.0356, -0.0758, -0.1637, -0.2125, -0.3141, -0.4111, -0.5123, -0.5882],
   [0.0376, 0.0730, 0.1497, 0.1933, 0.2950, 0.3920, 0.4920, 0.5690]],
  [[-0.0377, -0.0779, -0.1715, -0.2161, -0.3199, -0.4311, -0.5446, -0.6429],
   [0.0371, 0.0726, 0.1579, 0.2021, 0.3050, 0.4170, 0.5310, 0.6290]],
  [[-0.0399, -0.0832, -0.1736, -0.2197, -0.3265, -0.4411, -0.5495, -0.6543],
   [0.0347, 0.0728, 0.1583, 0.1995, 0.3050, 0.4220, 0.5320, 0.6350]],
  [[-0.0450, -0.0846, -0.1736, -0.2225, -0.3268, -0.4425, -0.5309, -0.6249],
   [0.0298, 0.0712, 0.1559, 0.2008, 0.3070, 0.4230, 0.5120, 0.6060]],
  [[-0.0444, -0.0860, -0.1712, -0.2172, -0.3219, -0.4299, -0.5023, -0.5575],
   [0.0301, 0.0642, 0.1500, 0.1947, 0.2990, 0.4050, 0.4800, 0.5340]],
  [[-0.0343, -0.0700, -0.1404, -0.1740, -0.2482, -0.3119, -0.3899, -0.4910],
   [0.0252, 0.0560, 0.1224, 0.1546, 0.2270, 0.2920, 0.3720, 0.4720]],
  [[-0.0409, -0.0674, -0.1234, -0.1429, -0.1822, -0.2755, -0.3958, -0.5133],
   [0.0178, 0.0477, 0.1066, 0.1068, 0.1470, 0.2400, 0.3600, 0.4770]],
  [[-0.0435, -0.0673, -0.1085, -0.1282, -0.1840, -0.2735, -0.3657, -0.3888],
   [0.0141, 0.0403, 0.0655, 0.0679, 0.1250, 0.2140, 0.3080, 0.3290]],
  [[-0.0541, -0.0864, -0.1336, -0.1553, -0.2093, -0.2535, -0.3041, -0.3228],
   [-0.0146, 0.0080, 0.0275, 0.0449, 0.0980, 0.1430, 0.1940, 0.2110]],
  [[-0.0992, -0.1222, -0.1644, -0.1838, -0.2209, -0.2497, -0.2702, -0.2901],
   [-0.0518, -0.0201, 0.0031, 0.0200, 0.0580, 0.0860, 0.1070, 0.1270]],
  [[-0.0685, -0.1070, -0.1722, -0.1907, -0.2118, -0.2000, -0.2041, -0.2526],
   [0.0042, 0.0198, 0.0713, 0.0969, 0.1180, 0.1060, 0.1110, 0.1600]],
];
const CY_BASE = [
  [[-0.0364, -0.0977, -0.1363, -0.1694, -0.2387, -0.1751, -0.1865, -0.2194],
   [0.0116, 0.0213, 0.0599, 0.0680, 0.1370, 0.0730, 0.0850, 0.1180]],
  [[-0.0392, -0.1023, -0.1530, -0.1773, -0.2395, -0.2458, -0.2014, -0.2412],
   [0.0119, 0.0155, 0.0621, 0.0799, 0.1420, 0.1490, 0.1050, 0.1430]],
  [[-0.0471, -0.0994, -0.1470, -0.1665, -0.2308, -0.2500, -0.2142, -0.2522],
   [0.0051, 0.0123, 0.0628, 0.0807, 0.1460, 0.1660, 0.1290, 0.1810]],
  [[-0.0402, -0.0589, -0.1004, -0.1148, -0.1555, -0.1823, -0.2367, -0.2710],
   [0.0082, 0.0275, 0.0652, 0.0785, 0.1180, 0.1450, 0.1990, 0.2320]],
  [[-0.0168, -0.0326, -0.0769, -0.0992, -0.1519, -0.2040, -0.2460, -0.2919],
   [0.0247, 0.0533, 0.0906, 0.1131, 0.1670, 0.2200, 0.2630, 0.3090]],
  [[-0.0251, -0.0406, -0.0824, -0.1056, -0.1535, -0.1974, -0.2462, -0.3035],
   [0.0215, 0.0458, 0.0855, 0.1101, 0.1580, 0.2010, 0.2510, 0.3090]],
];
const CY_DEG = [2, 4, 8, 10, 15, 20, 25, 30];
const cyOdd = A.map((a, i) => {
  const [plus, minus] = a <= 45 ? CY_LEF0[i] : CY_BASE[i - 14];
  return plus.map((p, j) => (p - minus[j]) / 2);
});

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

export { A, stab, CY_DEG, cyOdd };

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
  console.log('\nFW_F16878.cy_tab: CY, body axes, a row per sideslip, beta', CY_DEG.join(', '), 'deg, across the alphas above');
  for (let j = 0; j < CY_DEG.length; j += 1) console.log(`    { ${cyOdd.map((r) => f(r[j], 4)).join(', ')} },`);
  console.log(`  CY_beta at 0 deg, between beta +-4: ${f(cyOdd[A.indexOf(0)][1] / 4 * DEG)} per rad (cy_beta's line ${f(-0.470)})`);
}
