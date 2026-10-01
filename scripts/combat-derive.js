/*
 * combat-derive.js: the arithmetic behind docs/COMBAT-DRONES.md. From a
 * parts list of each combat quad (hobby figures for a 7 inch and a 10 inch
 * long range build) to the plant's mass, centre of mass and inertia, the
 * payloads' and accessories' points about that centre, and the motor
 * constants solved the way plant.c solved the five inch's: two equilibria,
 * full throttle and hover, on the pack's own resistance. It never loads the
 * plant. Harness arithmetic in JS maths, allowed here because nothing it
 * prints is hashed; the plant's constants are typed into
 * src/native/plant.c from its output and configs/airframes.js `combat`
 * holds the payload and accessory points it prints. Run with
 * npm run combat:derive.
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

const RHO = 1.225;
const G = 9.80665;
const INCH = 0.0254;

/*
 * Every position here is in the FRAME DATUM: x forward, y left, z up, metres
 * from the centre of the arm plane. The plant's origin is the bare machine's
 * centre of mass, which this script finds; everything the shell and the
 * renderer read is printed about that origin.
 *
 * A part is { name, m, at, box } (a solid box of those edge lengths about its
 * centre) or { name, m, at } (a point), or an arm { name, m, arm: [r0, r1] }
 * (four thin rods along the diagonals, m each, from r0 to r1 from the centre).
 */
const QUADS = {
  '7inch': {
    simId: 24,
    diag: 0.315,
    propIn: 7, pitchIn: 3.5,
    /* Published static thrust of a 2806.5 1300 kV on 6S under a 7x3.5x3 tri
     * blade, about 1.9 kgf at 24,000 rpm at the stand's own 25 V supply. kt
     * is a property of the prop, so it is taken off the stand and not off
     * the pack this machine flies. */
    stand: { kgf: 1.9, rpm: 24000 },
    /* The motor's nameplate, and its loaded constant over the plate's (see
     * solveMotor). */
    kv: 1300,
    loaded: 1.10,
    fm: 0.55,
    /* A 6S1P 21700 Li-ion pack: 16 mOhm a cell DC (a 4200 mAh high drain
     * cell's published figure) plus 2 mOhm a cell of leads and XT60. */
    rCell: 0.018,
    /* Winding resistance: a 2806.5 1300 kV measures about 75 mOhm phase to
     * phase; 15 mOhm more for the ESC's FETs and the leads. */
    rMotor: 0.090,
    /* A 7 inch three blade and a 2806.5 bell: 9 g of glass nylon at 89 mm,
     * m R^2 / 3 for the blades with a hub heavy moulding, plus the bell. */
    jRotor: 2.6e-5,
    parts: [
      { name: 'arms', m: 0.024, arm: [0.030, 0.1575] },
      { name: 'plates and standoffs', m: 0.074, at: [0, 0, 0.012], box: [0.16, 0.075, 0.03] },
      { name: 'motors 2806.5', m: 0.050, motors: 0.016 },
      { name: 'props 7x3.5x3', m: 0.009, motors: 0.037 },
      { name: 'FC and 4 in 1 ESC', m: 0.035, at: [0, 0, 0.010] },
      { name: 'video transmitter', m: 0.025, at: [-0.040, 0, 0.015] },
      { name: 'FPV camera', m: 0.012, at: [0.075, 0, 0.012] },
      { name: 'receiver', m: 0.006, at: [-0.050, 0, 0.020] },
      { name: 'wiring, XT60, straps', m: 0.040, at: [0, 0, 0.015] },
      { name: 'stock antennas', m: 0.010, at: [-0.070, 0, 0.040] },
      { name: 'landing legs', m: 0.016, at: [0, 0, -0.045] },
      /* 6S1P 21700: six 69 g cells and 15 g of wrap and leads, three
       * across and two high, long side fore and aft, on the top plate. */
      { name: 'pack 6S1P 21700', m: 0.429, at: [-0.005, 0, 0.050], box: [0.072, 0.063, 0.042] },
    ],
    /* The underside of the bottom plate, where a payload's straps meet. */
    belly: -0.005,
    payloads: [
      { id: 'standard', warhead: 'standard', m: 0.50, d: 0.060, len: 0.26, x: 0.020 },
      { id: 'wide', warhead: 'wide', m: 0.75, d: 0.075, len: 0.24, x: 0.010 },
      { id: 'penetrator', warhead: 'penetrator', m: 0.55, d: 0.050, len: 0.32, x: 0.040 },
      { id: 'emp', warhead: 'emp', m: 0.40, d: 0.065, len: 0.18, x: 0.000 },
    ],
    accessories: [
      /* A second 6S1P brick strapped beside the first, in parallel. */
      { id: 'pack2', m: 0.429, at: [-0.005, 0, 0.092] },
      { id: 'cage', m: 0.030, at: [0.080, 0, 0.012] },
      { id: 'lrantenna', m: 0.025, at: [-0.075, 0, 0.090] },
      { id: 'gps', m: 0.015, at: [-0.060, 0, 0.060] },
    ],
  },
  '10inch': {
    simId: 25,
    diag: 0.420,
    propIn: 10, pitchIn: 5,
    /* A 3115 900 kV on 6S under a 10x5x3: about 3.6 kgf at 14,000 rpm. */
    stand: { kgf: 3.6, rpm: 14000 },
    kv: 900,
    loaded: 1.10,
    fm: 0.58,
    /* 6S2P 21700, two cells in parallel: 8 mOhm a cell and 2 of leads. */
    rCell: 0.010,
    /* A 3115 900 kV measures about 70 mOhm; 20 mOhm of FETs and leads. */
    rMotor: 0.090,
    /* A 10 inch three blade is 18 to 20 g at 127 mm, plus a 3115 bell. */
    jRotor: 1.2e-4,
    parts: [
      { name: 'arms', m: 0.050, arm: [0.040, 0.210] },
      { name: 'plates and standoffs', m: 0.130, at: [0, 0, 0.014], box: [0.20, 0.090, 0.035] },
      { name: 'motors 3115', m: 0.095, motors: 0.021 },
      { name: 'props 10x5x3', m: 0.018, motors: 0.049 },
      { name: 'FC and 4 in 1 ESC', m: 0.045, at: [0, 0, 0.012] },
      { name: 'video transmitter', m: 0.035, at: [-0.050, 0, 0.018] },
      { name: 'FPV camera', m: 0.015, at: [0.095, 0, 0.014] },
      { name: 'receiver', m: 0.008, at: [-0.060, 0, 0.024] },
      { name: 'wiring, XT90, straps', m: 0.060, at: [0, 0, 0.018] },
      { name: 'stock antennas', m: 0.015, at: [-0.085, 0, 0.050] },
      { name: 'landing legs', m: 0.030, at: [0, 0, -0.058] },
      /* 6S2P 21700 as two 6S1P bricks side by side, strapped on top,
       * which is the reference photograph's pair of packs. */
      { name: 'pack 6S2P 21700', m: 0.858, at: [-0.005, 0, 0.058], box: [0.072, 0.126, 0.042] },
    ],
    belly: -0.006,
    payloads: [
      { id: 'standard', warhead: 'standard', m: 1.20, d: 0.080, len: 0.34, x: 0.025 },
      { id: 'wide', warhead: 'wide', m: 1.80, d: 0.100, len: 0.32, x: 0.015 },
      { id: 'penetrator', warhead: 'penetrator', m: 1.30, d: 0.065, len: 0.42, x: 0.050 },
      { id: 'emp', warhead: 'emp', m: 1.00, d: 0.085, len: 0.24, x: 0.000 },
    ],
    accessories: [
      { id: 'cage', m: 0.045, at: [0.100, 0, 0.014] },
      { id: 'lrantenna', m: 0.035, at: [-0.090, 0, 0.110] },
      { id: 'gps', m: 0.020, at: [-0.070, 0, 0.080] },
    ],
  },
};

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r6 = (v) => Number(v.toPrecision(4));

/* Point masses with own inertia, [m, [x, y, z], [Ixx, Iyy, Izz] about own centre]. */
function lumps(q) {
  const a = q.diag / 2 / Math.SQRT2;
  const diag = [[-a, -a], [a, -a], [-a, a], [a, a]];
  const out = [];
  for (const p of q.parts) {
    if (p.arm) {
      const [r0, r1] = p.arm;
      for (const [sx, sy] of diag) {
        /* A thin rod along the diagonal: its own inertia about its centre
         * is m L^2 / 12 across it, split equally on x and y. */
        const L = r1 - r0;
        const rc = (r0 + r1) / 2;
        const u = [sx / Math.hypot(sx, sy), sy / Math.hypot(sx, sy)];
        const own = p.m * L * L / 12;
        out.push([p.m, [u[0] * rc, u[1] * rc, 0], [own / 2, own / 2, own]]);
      }
    } else if (p.motors != null) {
      for (const [x, y] of diag) {
        out.push([p.m, [x, y, p.motors], [0, 0, 0]]);
      }
    } else if (p.box) {
      const [lx, ly, lz] = p.box;
      out.push([p.m, p.at, [p.m * (ly * ly + lz * lz) / 12, p.m * (lx * lx + lz * lz) / 12, p.m * (lx * lx + ly * ly) / 12]]);
    } else {
      out.push([p.m, p.at, [0, 0, 0]]);
    }
  }
  return out;
}

function massProps(ls) {
  const M = ls.reduce((s, l) => s + l[0], 0);
  const c = [0, 1, 2].map((k) => ls.reduce((s, l) => s + l[0] * l[1][k], 0) / M);
  const I = [0, 0, 0];
  for (const [m, p, own] of ls) {
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    I[0] += own[0] + m * (d[1] * d[1] + d[2] * d[2]);
    I[1] += own[1] + m * (d[0] * d[0] + d[2] * d[2]);
    I[2] += own[2] + m * (d[0] * d[0] + d[1] * d[1]);
  }
  return { M, c, I };
}

/*
 * A payload's drag area. The plant charges an add-on's drag as one area,
 * the same whichever way the air comes (sim_abi.h SIM_ADDON_CDA), so this is
 * the mean of the three a cylinder shows: nose on at Cd 0.35 for the
 * pointed nose, and broadside and from below at Cd 0.9 for a cylinder in
 * cross flow.
 */
function payloadCda(p) {
  const front = Math.PI * (p.d / 2) ** 2 * 0.35;
  const side = p.d * p.len * 0.9;
  return (front + side + side) / 3;
}

/*
 * The electrical set, on the same model plant.c's five inch is solved on. kt
 * from the stand; kq from kt and the figure of merit, kq = kt^1.5 / (FM
 * sqrt(2 rho A)); ke the loaded constant, 1.10 times 60 / (2 pi kV) (the
 * five inch's 2207 loads to 1.26, and plant.c puts a real motor at 1.10 to
 * 1.20, a slow wound one saturating less); r_motor the motor's published winding resistance plus
 * the ESC and leads; then the hover duty and the full throttle speed are
 * what the two equilibria give on a fresh pack, both with its own sag.
 * Nothing is solved to land a target: the hover duty is an output, checked
 * against what pilots of these machines report. At steady state the shaft
 * torque is kq w^2 (the induced share is the figure of merit at hover, so
 * the plant's split adds back to it), the current a motor draws is that
 * over ke, and the pack carries duty times it.
 */
function solveMotor(q, M) {
  const R = q.propIn * INCH / 2;
  const A = Math.PI * R * R;
  const wStand = q.stand.rpm * 2 * Math.PI / 60;
  const kt = q.stand.kgf * G / (wStand * wStand);
  const kq = kt ** 1.5 / (q.fm * Math.sqrt(2 * RHO * A));
  const ke = q.loaded * 60 / (2 * Math.PI * q.kv);
  const voc = 6 * 4.2;
  const rPack = 6 * q.rCell;
  const wh = Math.sqrt(M * G / 4 / kt);
  const rMotor = q.rMotor;
  const ih = kq * wh * wh / ke;
  /* d (voc - 4 rPack d ih) = ke wh + rMotor ih, the smaller root. */
  const qa = 4 * rPack * ih;
  const qc = ke * wh + rMotor * ih;
  const d = (voc - Math.sqrt(voc * voc - 4 * qa * qc)) / (2 * qa);
  const vh = voc - rPack * 4 * d * ih;
  /* Full throttle: bisect the speed at which the motor's torque at duty 1
   * meets the prop's, the pack sagging under all four. */
  let lo = wh;
  let hi = voc / ke;
  for (let i = 0; i < 200; i += 1) {
    const w = 0.5 * (lo + hi);
    const i1 = kq * w * w / ke;
    const v = voc - rPack * 4 * i1;
    const iMotor = (v - ke * w) / rMotor;
    if (iMotor > i1) {
      lo = w;
    } else {
      hi = w;
    }
  }
  const wf = 0.5 * (lo + hi);
  const iF = kq * wf * wf / ke;
  const vF = voc - rPack * 4 * iF;
  return {
    propR: R, kt, kq, ke, rMotor, kInflow: q.pitchIn * INCH / (2 * Math.PI),
    hover: { duty: d, w: wh, rpm: wh * 60 / (2 * Math.PI), amps: ih, cellV: vh / 6 },
    full: { w: wf, rpm: wf * 60 / (2 * Math.PI), amps: iF, pack: 4 * iF, cellV: vF / 6, thrustN: 4 * kt * wf * wf, tw: 4 * kt * wf * wf / (M * G) },
    loadedKv: 60 / (2 * Math.PI * ke),
    tau: q.jRotor * rMotor / (ke * ke),
  };
}

/*
 * Everything the doc and the code read, per quad: the plant's mass, CG and
 * inertia, the motor set, and the `combat` descriptor configs/airframes.js
 * carries (rounded as it is typed there), all about the bare CG.
 */
export function deriveCombat() {
  const out = {};
  for (const [id, q] of Object.entries(QUADS)) {
    const { M, c, I } = massProps(lumps(q));
    const motor = solveMotor(q, M);
    const zOf = (prefix) => q.parts.find((p) => p.name.startsWith(prefix)).motors - c[2];
    const payloads = q.payloads.map((p) => ({
      id: p.id,
      massKg: p.m,
      dragArea_m2: r6(payloadCda(p)),
      cgOffset_m: [r4(p.x - c[0]), 0, r4(q.belly - p.d / 2 - c[2])],
      warhead: p.warhead,
      dims: { d: p.d, len: p.len },
    }));
    const accessories = q.accessories.map((x) => ({
      id: x.id, massKg: x.m, cgOffset_m: x.at.map((v, k) => r4(v - c[k])),
    }));
    out[id] = {
      q, M, c, I, motor,
      arm: q.diag / 2 / Math.SQRT2,
      motorZ: zOf('motors'),
      discZ: zOf('props'),
      belly: q.belly - c[2],
      hullDown: -(Math.min(...q.payloads.map((p) => q.belly - p.d)) - c[2]),
      combat: { frame: id === '7inch' ? '7in' : '10in', payloads, accessories },
    };
  }
  return out;
}

function print() {
  for (const [id, d] of Object.entries(deriveCombat())) {
    const { q, M, c, I, motor } = d;
    console.log(`\n== ${id} (simId ${q.simId}) ==`);
    console.log(`bare all up mass        ${M.toFixed(4)} kg`);
    console.log(`CG in the frame datum   [${c.map(r4).join(', ')}] m`);
    console.log(`inertia about the CG    [${I.map(r6).join(', ')}] kg m^2`);
    console.log(`arm_x = arm_y           ${d.arm.toFixed(16)} m (${q.diag * 1000} mm diagonal)`);
    console.log(`prop_r                  ${motor.propR.toFixed(4)} m`);
    console.log(`k_inflow                ${motor.kInflow.toFixed(6)} m/rad`);
    console.log(`kt                      ${r6(motor.kt)}`);
    console.log(`kq (FM ${q.fm})            ${r6(motor.kq)}`);
    console.log(`ke                      ${r6(motor.ke)} (loaded ${motor.loadedKv.toFixed(0)} kV on a ${q.kv} kV plate)`);
    console.log(`r_motor                 ${r6(motor.rMotor)} ohm`);
    console.log(`r_cell                  ${q.rCell} ohm`);
    console.log(`j_rotor                 ${q.jRotor}`);
    console.log(`motor time constant     ${(motor.tau * 1000).toFixed(1)} ms (j R / ke^2)`);
    console.log(`hover                   ${motor.hover.rpm.toFixed(0)} rpm, ${motor.hover.amps.toFixed(2)} A a motor, duty ${motor.hover.duty.toFixed(3)}, ${motor.hover.cellV.toFixed(3)} V a cell`);
    console.log(`full throttle (static)  ${motor.full.rpm.toFixed(0)} rpm, ${motor.full.amps.toFixed(1)} A a motor, ${motor.full.pack.toFixed(0)} A pack, ${motor.full.cellV.toFixed(2)} V a cell`);
    console.log(`                        ${motor.full.thrustN.toFixed(1)} N, thrust to weight ${motor.full.tw.toFixed(2)} bare`);
    console.log(`motor bells z           ${r4(d.motorZ)} m about the CG; prop discs ${r4(d.discZ)}`);
    console.log(`belly plate underside   ${r4(d.belly)} m; hull down (deepest payload) ${r4(d.hullDown)} m`);
    console.log('payloads, about the CG:');
    for (const p of d.combat.payloads) {
      const tw = motor.full.thrustN / ((M + p.massKg) * G);
      console.log(`  ${p.id.padEnd(11)} ${p.massKg.toFixed(2)} kg  cda ${p.dragArea_m2} m^2  cg [${p.cgOffset_m.join(', ')}]  d ${p.dims.d} len ${p.dims.len}  T/W ${tw.toFixed(2)}`);
    }
    console.log('accessories, about the CG:');
    for (const x of d.combat.accessories) {
      console.log(`  ${x.id.padEnd(11)} ${x.massKg.toFixed(3)} kg  at [${x.cgOffset_m.join(', ')}]`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  print();
}
