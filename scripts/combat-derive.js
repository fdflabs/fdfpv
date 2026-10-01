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

import { derivatives, lattice } from './lib/lattice.js';
import { trimBallastKg } from '../configs/combat.js';

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
 * (four thin rods from the centre towards the motors, m each, from r0 to r1).
 */
const QUADS = {
  '7inch': {
    simId: 24,
    frame: '7in',
    /* Motor centres, half spacing fore and aft and across: a square X of
     * 315 mm motor to motor. */
    motorXY: [0.315 / 2 / Math.SQRT2, 0.315 / 2 / Math.SQRT2],
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
    packAh: 4.2,
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
    frame: '10in',
    motorXY: [0.420 / 2 / Math.SQRT2, 0.420 / 2 / Math.SQRT2],
    propIn: 10, pitchIn: 5,
    /* A 3115 900 kV on 6S under a 10x5x3: about 3.6 kgf at 14,000 rpm. */
    stand: { kgf: 3.6, rpm: 14000 },
    kv: 900,
    loaded: 1.10,
    fm: 0.58,
    /* 6S2P 21700, two cells in parallel: 8 mOhm a cell and 2 of leads. */
    rCell: 0.010,
    packAh: 8.4,
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
  /*
   * THE INTERCEPTOR, the owner's reference photograph of 2026-10-01: a
   * stretched X 7 inch speed build, high kV motors on 6S, clear two blade
   * props, an armoured nose round the camera, one big pack strapped on top
   * and two antennas, built for top speed. Where the 7 inch is built to
   * carry and to last, this one is built to catch: a LiPo instead of
   * Li-ion, hotter motors, high pitch two blades, and nothing on it that
   * does not make it faster.
   */
  interceptor: {
    simId: 26,
    frame: 'interceptor',
    /* Stretched X: 240 mm fore and aft between motors, 200 mm across,
     * 312 mm motor to motor on the diagonal. Across is as close as two
     * 7 inch discs allow (22 mm between the tips); the stretch is what
     * keeps the front props' wash off the rear ones in a fast forward
     * pass, which is what the layout is for. */
    motorXY: [0.120, 0.100],
    propIn: 7, pitchIn: 9,
    /*
     * SOURCED (docs/COMBAT-DRONES.md section 1a): APC's 7 x 9E thin
     * electric two blade, its static row at 20,000 rpm in APC's own
     * performance file, PER3_7x9E.dat (https://www.apcprop.com/files/):
     * 20.622 N, 0.365 N m, figure of merit 0.4967. A 9 inch pitch because
     * APC's files say what a speed prop has to: a 7 x 6E is out of thrust
     * by 228 km/h and a 7 x 7E by 250 to 262, where the 7 x 9E still makes
     * 1.4 kg at 200 km/h. It was a 7 x 6 two blade of "C_T near 0.11",
     * from no file.
     */
    stand: { kgf: 20.622 / 9.80665, rpm: 20000 },
    /*
     * T-Motor's Velox V2808 1300 kV, 61.1 g, 6S, 62.4 A peak for 10 s
     * (https://www.t-hobby.com/products/fpv-brushless-motor-v2808), loaded
     * 1.10 over its plate, the 7 inch's 1300 kV's. It was a 2807 1500 kV
     * from no table. A 1300 kV on a 9 inch pitch keeps APC's prop under
     * its 21,400 rpm limit on 6S.
     */
    kv: 1300,
    loaded: 1.10,
    fm: 0.4967,
    /* A 6S 1800 mAh LiPo, Tattu's R-Line 5.0 at 150C, 288 g (tattuworld.
     * com): 3 mOhm a cell DC and 1.5 mOhm a cell of leads and XT60. */
    rCell: 0.0045,
    packAh: 1.8,
    /*
     * The winding, the ESC and the stand's leads, from two of T-Motor's
     * own full throttle rows for this motor, which need no torque: at the
     * loaded ke the rest of the volts over the current is the resistance.
     * GF8040-3, 24.3 V, 61.0 A, 19,222 rpm: 0.1317 ohm; T7546-3, 24.2 V,
     * 62.4 A, 18,943 rpm: 0.1310. T-Motor publishes no phase resistance;
     * a winding law estimate from BrotherHobby's SE 2808 (0.071 with the
     * ESC) is what these two rows contradict.
     */
    rMotor: 0.131,
    /* APC's 0.35 oz (9.9 g) glass filled two blade at 89 mm, m R^2 / 3,
     * and a 2808 bell. */
    jRotor: 2.7e-5,
    parts: [
      { name: 'arms', m: 0.020, arm: [0.030, Math.hypot(0.120, 0.100)] },
      { name: 'plates and standoffs', m: 0.060, at: [0, 0, 0.012], box: [0.16, 0.050, 0.03] },
      { name: 'motors V2808 1300 kV', m: 0.0611, motors: 0.016 },
      { name: 'props APC 7x9E', m: 0.0099, motors: 0.037 },
      { name: 'FC and 4 in 1 65 A ESC', m: 0.040, at: [0, 0, 0.010] },
      { name: 'video transmitter', m: 0.020, at: [-0.040, 0, 0.015] },
      { name: 'FPV camera', m: 0.010, at: [0.085, 0, 0.012] },
      /* The photograph's armoured nose, part of the build: plated carbon
       * round the camera from the bottom plate to under the props. */
      { name: 'armoured nose', m: 0.040, at: [0.090, 0, 0.012] },
      { name: 'receiver', m: 0.005, at: [-0.050, 0, 0.020] },
      { name: 'wiring, XT60, straps', m: 0.035, at: [0, 0, 0.015] },
      { name: 'stock antennas', m: 0.008, at: [-0.070, 0, 0.040] },
      { name: 'landing legs', m: 0.010, at: [0, 0, -0.035] },
      /* Tattu's 6S 1800 mAh 150C, 288 g, long side fore and aft on the
       * top plate under two straps. */
      { name: 'pack 6S 1800 LiPo', m: 0.288, at: [-0.005, 0, 0.048], box: [0.105, 0.037, 0.042] },
    ],
    belly: -0.005,
    /* One payload: a small proximity charge, slim so it costs little
     * drag at speed. Its war rule is the standard warhead: every warhead
     * in the war already goes off on proximity (edge/rooms/war.js), and
     * this is the smallest of them. */
    payloads: [
      { id: 'proximity', warhead: 'standard', m: 0.20, d: 0.045, len: 0.16, x: 0.020 },
    ],
    /* The photograph's two antennas are the stock ones here; the tall set
     * and a GPS puck behind the pack are what a pilot can add. */
    accessories: [
      { id: 'lrantenna', m: 0.020, at: [-0.075, 0, 0.085] },
      { id: 'gps', m: 0.015, at: [-0.065, 0, 0.078] },
    ],
  },
};

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r6 = (v) => Number(v.toPrecision(4));

/* Point masses with own inertia, [m, [x, y, z], [Ixx, Iyy, Izz] about own centre]. */
function lumps(q) {
  const [ax, ay] = q.motorXY;
  const diag = [[-ax, -ay], [ax, -ay], [-ax, ay], [ax, ay]];
  const out = [];
  for (const p of q.parts) {
    if (p.arm) {
      const [r0, r1] = p.arm;
      for (const [sx, sy] of diag) {
        /* A thin rod from the centre towards the motor: its own inertia
         * about its centre is m L^2 / 12 across it, shared between x and y
         * by the rod's direction. */
        const L = r1 - r0;
        const rc = (r0 + r1) / 2;
        const u = [sx / Math.hypot(sx, sy), sy / Math.hypot(sx, sy)];
        const own = p.m * L * L / 12;
        out.push([p.m, [u[0] * rc, u[1] * rc, 0], [own * u[1] * u[1], own * u[0] * u[0], own]]);
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
    hover: { duty: d, w: wh, rpm: wh * 60 / (2 * Math.PI), amps: ih, pack: 4 * d * ih, cellV: vh / 6 },
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
      arm: q.motorXY[0],
      armY: q.motorXY[1],
      motorZ: zOf('motors'),
      discZ: zOf('props'),
      belly: q.belly - c[2],
      hullDown: -(Math.min(...q.payloads.map((p) => q.belly - p.d)) - c[2]),
      combat: { frame: q.frame, payloads, accessories },
    };
  }
  return out;
}

/*
 * ========================================================================
 * THE STRIKER, docs/COMBAT-DRONES.md section 7: the war's pusher delta as
 * a playable aircraft, plants 27 ('prop') and 28 ('jet'), from a parts
 * list to the plant's tables. deriveStriker() below; printed by
 * npm run combat:derive after the quads.
 *
 * THE SCALE is the drawn machine's, src/render/strikercraft.js, which the
 * war's attacker and the flown aircraft share: 2.50 m over the wingtip
 * fins (the full size attacker's published span) and 2.67 m from the
 * nose to the prop's hub, a 0.34 m fuselage, a 0.76 m prop. Built as a
 * giant scale hobby airframe and not as the 200 kg original: glass and
 * carbon over foam, a 110 cc boxer twin or a 140 N class turbojet, 15 to
 * 17 kg. At the original's mass the wing loads to 90 kg/m^2 and stalls
 * near 35 m/s, which no rail launches and no pilot lands; at this one it
 * stalls near 11 m/s off a 3 m rail and flies the air the Bramor does.
 *
 * Every station is strikercraft.js's, turned into these axes: x aft from
 * the nose's tip (the model's z + 1.40), y right (its x), z up from the
 * fuselage's axis (its y). The wing's plane is 0.07 m under the axis, the
 * drawing's low wing. The lattice (scripts/lib/lattice.js) is taken in
 * the wing's plane. Everything printed for the plant is turned into the
 * body frame about the CG this script finds, and the drawing's origin's
 * place about that CG is printed for src/render/craft.js, which draws
 * the flown machine about its CG.
 * ========================================================================
 */
const DEG = 180 / Math.PI;
const NU = 1.46e-5;
/* The drawing's origin, the war's pose point, in these axes. */
export const STRIKER_MODEL_ORIGIN = [1.40, 0, 0];
const SW = {
  /* The cranked delta, strikercraft.js's outline: the leading edge at
   * the centreline 0.74 m aft, a shallow fairing to 0.17 m out, a steep
   * strake to 0.42 m, then the main sweep to the tip at 1.235 m; the
   * trailing edge straight across at 2.38 m. */
  le: [[0, 0.74], [0.17, 0.84], [0.42, 1.28], [1.235, 2.14]],
  te: 2.38,
  semi: 1.235,
  wingZ: -0.07,
  /* The elevons: 0.15 m of chord, from 0.32 to 1.12 m out. */
  flapIn: 0.32,
  flapOut: 1.12,
  flapC: 0.15,
  /* The fins at the tips: 0.32 m of chord at their foot 0.12 m under the
   * wing, 0.22 m at their top 0.30 m over it, the leading edge swept 0.18
   * m over the 0.42 m; a rudder 0.07 m deep on each, 0.20 m tall, from
   * 0.06 to 0.26 m over the wing. */
  fin: { root: 0.32, top: 0.22, h: 0.42, sweep: 0.18, down: 0.12, rudderC: 0.07, rudderSpan: 0.20, rudderZ: 0.16 },
  /* The fuselage: 0.34 m across, the nose's tip to the tail cone's end at
   * 2.42 m. */
  fusD: 0.34,
  fusL: 2.42,
  /* The nose bay under the cap's seam, where the payload rides. */
  bayAft: 0.50,
  /* The skid's foot, under the belly. */
  skid: { x: [1.52, 1.78], z: -0.271 },
  /* The prop's hub and radius; the turbojet's nacelle. */
  hub: [2.67, 0, 0],
  propR: 0.38,
  nacelle: { x: [2.24, 2.76], z: 0.10, r: 0.12 },
  camera: [0.05, 0, 0],
};
function sle(y) {
  const a = Math.abs(y);
  const L = SW.le;
  for (let i = 1; i < L.length; i += 1) {
    if (a <= L[i][0] || i === L.length - 1) {
      const [y0, x0] = L[i - 1];
      const [y1, x1] = L[i];
      return x0 + (x1 - x0) * (a - y0) / (y1 - y0);
    }
  }
  return L[L.length - 1][1];
}
const ste = () => SW.te;
const sch = (y) => ste(y) - sle(y);
const sflap = (y) => (Math.abs(y) < SW.flapIn || Math.abs(y) > SW.flapOut ? 0 : SW.flapC);

function integrate(f, a, b, n = 4000) {
  let s = 0;
  const h = (b - a) / n;
  for (let i = 0; i < n; i += 1) {
    s += f(a + (i + 0.5) * h) * h;
  }
  return s;
}

/*
 * THE TWO PROPULSION SETS, as the reference sheets have them: 46 a
 * pusher piston engine, two cylinders opposed, a wooden two blade behind
 * the tail; 47 a small turbojet on the tail in its nacelle.
 *
 * 'prop': a 110 cc boxer twin gasoline engine (the DLE-111 class: about
 * 8.2 kW, 3.0 kg with its ignition and two mufflers), on the drawing's
 * 0.76 m prop, a 30 x 14 wooden two blade, which loads it to about 5,000
 * rpm static (a power coefficient of 0.045 there, ESTIMATED). Static
 * thrust is that power through the disc at a wooden two blade's static
 * figure of merit, 0.55 (Harris, NASA/CR-20205001147); the pitch speed
 * is the plant's rule, the loaded rpm times the pitch. Gasoline at 0.74
 * kg/l, a 2.5 l tank; the burn a small two stroke's 600 g/kWh at full,
 * linear in the rpm through zero as the plant's glow engines take it,
 * the idle a quarter of full, ESTIMATED.
 *
 * 'jet': a 140 N class kerosene turbojet (the JetCat P140-RX class: 1.36
 * kg, 140 N, about 125,000 rpm at full) in the drawing's nacelle, with its
 * ECU, pump and valves. Its thrust falls with airspeed as the momentum
 * law has it, T = mdot (Ve - V), linear to nothing at the jet's exit
 * velocity: that is the plant's fan law with pitch_speed the exit
 * velocity, about 420 m/s for 140 N on a 0.33 kg/s core, ESTIMATED. Its
 * spool is the plant's fan_tau, a critically damped second order response:
 * idle to 90 percent of full in about 3.5 s, the ECU's limited
 * acceleration of a small turbine, ESTIMATED. The idle is set by its
 * thrust, about 4 percent of full, which on the plant's speed squared law
 * is 0.2 of the full speed. Kerosene with its oil at 0.80 kg/l, a 4 l
 * tank; 0.45 l/min at full and 0.10 at idle, the class's, ESTIMATED.
 */
const STRIKER_PROPULSION = {
  prop: {
    simId: 27,
    parts: [
      { name: 'boxer twin 110 cc, ignition, mufflers', m: 3.00, at: [2.50, 0, 0.02], box: [0.16, 0.42, 0.16] },
      { name: 'engine mount and standoffs', m: 0.30, at: [2.40, 0, 0.0] },
      { name: 'prop 30 x 14 wood and hub', m: 0.32, at: [2.67, 0, 0.0] },
    ],
    propIn: 30, pitchIn: 14, rpm: 5000, shaftW: 8200, fm: 0.55,
    fuel: { litres: 2.5, kgPerL: 0.74, tankKg: 0.20 },
    idle: 0.25,
    /* l/h: 600 g/kWh at 8.2 kW over 0.74 kg/l. */
    flowFullLph: 0.6 * 8.2 / 0.74,
    flowIdleFrac: 0.25,
    thrustZ: 0.0,
    /* The blades, 0.30 kg on 0.762 m, m L^2 / 12, and the crank and its
     * flywheel, 0.002 kg m^2, ESTIMATED. */
    jProp: 0.30 * 0.762 * 0.762 / 12 + 0.002,
    cdA: 0.020,
  },
  jet: {
    simId: 28,
    parts: [
      { name: 'turbojet 140 N class', m: 1.36, at: [2.52, 0, 0.10], box: [0.38, 0.12, 0.12] },
      { name: 'nacelle and its straps', m: 0.45, at: [2.50, 0, 0.10] },
      { name: 'ECU, pump, valves, starter pack', m: 0.40, at: [2.10, 0, 0.0] },
    ],
    thrustN: 140, exitV: 420, rpmFull: 125000, idleThrustFrac: 0.04, spoolTau: 0.9,
    fuel: { litres: 4.0, kgPerL: 0.80, tankKg: 0.25 },
    flowFullLpm: 0.45,
    flowIdleLpm: 0.10,
    thrustZ: 0.10,
    /* The compressor and turbine wheels and the shaft, about 0.15 kg at a
     * 30 mm radius of gyration, ESTIMATED. */
    jProp: 1.4e-4,
    cdA: 0.010,
  },
};

/*
 * THE AIRFRAME BOTH SHARE, its parts at the drawing's stations (x aft
 * from the nose, |y| out, z up from the axis). `pair` is one of two,
 * mirrored across the centreline; the wing is spread over the planform
 * below. Masses are a giant scale glass and carbon build's, ESTIMATED.
 */
const STRIKER_COMMON = [
  { name: 'nose cap over the bay', m: 0.45, at: [0.20, 0, 0] },
  { name: 'fuselage tube 0.34 m glass and carbon', m: 1.45, at: [1.30, 0, 0], tube: [0.34, 2.26, 0.17] },
  { name: 'tail cone', m: 0.15, at: [2.34, 0, 0] },
  { name: 'wing root fairing', m: 0.30, at: [1.45, 0, -0.10] },
  { name: 'elevon', m: 0.15, at: [2.305, 0.72, -0.07], pair: true },
  { name: 'elevon servo and linkage', m: 0.12, at: [2.15, 0.62, -0.07], pair: true },
  { name: 'fin, rudder and its servo', m: 0.26, at: [2.30, 1.235, 0.01], pair: true },
  { name: 'ignition, receiver and servo packs', m: 0.60, at: [0.60, 0, -0.05] },
  { name: 'flight controller, GPS, receiver, video', m: 0.35, at: [0.60, 0, 0.05] },
  { name: 'FPV camera', m: 0.05, at: [0.05, 0, 0] },
  { name: 'wiring and hardware', m: 0.60, at: [1.30, 0, 0] },
  { name: 'rail shoes', m: 0.15, at: [1.40, 0, -0.18] },
  { name: 'belly skid', m: 0.15, at: [1.65, 0, -0.24] },
];
/* The wing, 1.1 kg a square metre of planform with its carbon spar; its
 * sections' centroids at 0.42 of the chord, weighted by chord squared
 * (thickness goes with chord), as the Zagi's are. */
const WING_KG_M2 = 1.1;
/* The nose weight a builder adds to balance a pusher, at the bay's foot,
 * and where the tank can go: between the bay's bulkhead and the spar box. */
const BALLAST_AT = [0.12, 0, -0.05];
const TANK_RANGE = [0.55, 1.50];
/* The bare machine's static margin, of the MAC: stable but light in pitch
 * without its warhead, which, carried in the nose, adds the rest (a full
 * size attacker's warhead is its counterweight). */
const SM_BARE = 0.04;

/* The warheads in the nose bay, each a cylinder ending at the bay's aft
 * bulkhead on the axis. */
const STRIKER_PAYLOADS = [
  { id: 'standard', warhead: 'standard', m: 1.5, d: 0.26, len: 0.30 },
  { id: 'wide', warhead: 'wide', m: 2.2, d: 0.28, len: 0.28 },
  { id: 'penetrator', warhead: 'penetrator', m: 1.8, d: 0.16, len: 0.40 },
  { id: 'emp', warhead: 'emp', m: 1.1, d: 0.26, len: 0.22 },
];
const STRIKER_ACCESSORIES = [
  /* The whip on the spine, the drawing's: 0.36 m of steel whip on a
   * plate 1.10 m aft; its mass is mostly the base. */
  { id: 'whip', m: 0.06, at: [1.10, 0, 0.20] },
];

function strikerLattice() {
  const f = SW.fin;
  const run = lattice({ le: sle, te: ste, flap: sflap, half: SW.semi, winglet: { root: f.root, top: f.top, h: f.h, sweep: f.sweep } });
  const bare = lattice({ le: sle, te: ste, flap: sflap, half: SW.semi });
  return { run, bare };
}

export function deriveStriker() {
  const b = 2 * SW.semi;
  const S = 2 * integrate(sch, 0, SW.semi);
  const c = S / b;
  const AR = b * b / S;
  /* The MAC and its leading edge, by integration over the planform. */
  const mac = 2 * integrate((y) => sch(y) ** 2, 0, SW.semi) / S;
  const yMac = 2 * integrate((y) => sch(y) * y, 0, SW.semi) / S;
  const xMacLE = 2 * integrate((y) => sch(y) * sle(y), 0, SW.semi) / S;
  /* The outer panel's quarter chord sweep, which most of the span is. */
  const [ya, xa] = SW.le[2];
  const [yb, xb] = SW.le[3];
  const tanLE = (xb - xa) / (yb - ya);
  /* The trailing edge is unswept, so the chord falls at tanLE a metre. */
  const tanC4 = 0.75 * tanLE;
  const { run, bare: bareRun } = strikerLattice();
  /* The neutral point, from the lattice about the nose. */
  const D0n = derivatives(run, { S, c, b, xref: 0 });
  const xNPlattice = -c * D0n.Cma / D0n.CLa;
  /* The fuselage's Munk moment moves it forward (Raymer, eq. 16.25):
   * Kf w^2 L / (S c) a degree, Kf 0.020 for the wing root's quarter chord
   * at 47 percent of the fuselage (his fig. 16.14), ESTIMATED. */
  const fusLen = SW.hub[0];
  const dCmaFus = 0.020 * SW.fusD * SW.fusD * fusLen / (S * c) * DEG;
  const xNP = xNPlattice - c * dCmaFus / D0n.CLa;
  const xCG = xNP - SM_BARE * mac;

  /* The wing's mass, spread over the planform. */
  const mWing = WING_KG_M2 * S;
  const NW = 2000;
  let wS = 0, wX = 0, wY2 = 0, wX2 = 0;
  for (let i = 0; i < NW; i += 1) {
    const y = SW.semi * (i + 0.5) / NW;
    const ch = sch(y), w8 = ch * ch;
    const xs = sle(y) + 0.42 * ch;
    wS += w8; wX += w8 * xs; wY2 += w8 * y * y; wX2 += w8 * (xs * xs + ch * ch * 0.06);
  }
  const wingX = wX / wS;

  const variants = {};
  for (const [pid, P] of Object.entries(STRIKER_PROPULSION)) {
    const parts = [];
    for (const p of STRIKER_COMMON) {
      parts.push({ ...p, at: [...p.at] });
      if (p.pair) {
        parts.push({ ...p, at: [p.at[0], -p.at[1], p.at[2]] });
      }
    }
    parts.push(...P.parts);
    /* The tank is what balances it: the fuel slid fore and aft between
     * TANK_RANGE until the CG is on the target, as a builder places it,
     * and only a tank at its forward stop still tail heavy gets nose
     * ballast. */
    const fuelKg = P.fuel.litres * P.fuel.kgPerL;
    const tankKg = fuelKg + P.fuel.tankKg;
    const dry = mWing + parts.reduce((s, p) => s + p.m, 0);
    const dryX = mWing * wingX + parts.reduce((s, p) => s + p.m * p.at[0], 0);
    const tankX = Math.min(TANK_RANGE[1], Math.max(TANK_RANGE[0], (xCG * (dry + tankKg) - dryX) / tankKg));
    parts.push({ name: `fuel ${P.fuel.litres} l and its tank`, m: tankKg, at: [tankX, 0, 0] });
    const m0 = dry + tankKg;
    const mx0 = dryX + tankKg * tankX;
    const ballast = Math.max(0, (mx0 - xCG * m0) / (xCG - BALLAST_AT[0]));
    if (ballast > 0) {
      parts.push({ name: 'nose ballast', m: ballast, at: BALLAST_AT });
    }
    const M = m0 + ballast;
    const xAt = (mx0 + ballast * BALLAST_AT[0]) / M;
    if (Math.abs(xAt - xCG) > 1e-9) {
      throw new Error(`combat-derive: the Striker ${pid} balances at ${xAt}, not ${xCG}`);
    }
    const zCG = (mWing * SW.wingZ + parts.reduce((s, p) => s + p.m * p.at[2], 0)) / M;
    /* Inertia about the CG: the wing's sections, every part a point but
     * the tube, a thin walled cylinder, and the engines, boxes. */
    const dzw = SW.wingZ - zCG;
    let Ixx = mWing * (wY2 / wS + dzw * dzw);
    let Iyy = mWing * (wX2 / wS - 2 * wingX * xCG + xCG * xCG + dzw * dzw);
    let Izz = mWing * (wY2 / wS + wX2 / wS - 2 * wingX * xCG + xCG * xCG);
    for (const p of parts) {
      const dx = p.at[0] - xCG, dy = p.at[1], dz = p.at[2] - zCG;
      Ixx += p.m * (dy * dy + dz * dz);
      Iyy += p.m * (dx * dx + dz * dz);
      Izz += p.m * (dx * dx + dy * dy);
      if (p.tube) {
        const [x0, x1, r] = p.tube;
        const L = x1 - x0;
        Ixx += p.m * r * r;
        Iyy += p.m * (r * r / 2 + L * L / 12);
        Izz += p.m * (r * r / 2 + L * L / 12);
      }
      if (p.box) {
        const [lx, ly, lz] = p.box;
        Ixx += p.m * (ly * ly + lz * lz) / 12;
        Iyy += p.m * (lx * lx + lz * lz) / 12;
        Izz += p.m * (lx * lx + ly * ly) / 12;
      }
    }
    variants[pid] = { P, parts, ballast, tankX, M, W: M * G, zCG, I: [Ixx, Iyy, Izz], fuelKg };
  }

  /* The lattice about the CG, which both variants balance on. */
  const ref = { S, c, b, xref: xCG };
  const D0 = derivatives(run, ref);
  const CLa = D0.CLa;
  const SMc = (xNP - xCG) / c;
  const Cma = -CLa * SMc;

  /* The section and the wing's CL max: a reflexed flying wing section of
   * the MH 60 class, CL max about 1.2 at the 1e6 to 3e6 it flies at,
   * ESTIMATED; the wing's 0.9 of it times cos of the outer panel's
   * quarter chord sweep (Raymer, eq. 12.15). */
  const CLmax = 0.9 * 1.2 * Math.cos(Math.atan(tanC4));
  /* Oswald's e for a swept wing, Raymer eq. 12.49, on the outer panel's
   * leading edge. */
  const e = 4.61 * (1 - 0.045 * AR ** 0.68) * Math.cos(Math.atan(tanLE)) ** 0.15 - 3.1;
  const k = 1 / (Math.PI * e * AR);

  /*
   * Drag, a component build up (Raymer eq. 12.24), ESTIMATED: turbulent
   * skin friction at each part's own Reynolds number at 25 m/s, form
   * factors and wetted areas; the uncowled twin, its cylinders, mufflers
   * and mount, as 0.020 m^2 of drag area (0.045 m^2 across the flow at
   * 0.45) and the turbojet's nacelle as 0.010 m^2; the skid, shoes, horns
   * and gaps 0.0015; ten percent for interference.
   */
  const cf = (L) => 0.455 / Math.log10(25 * L / NU) ** 2.58;
  const tc = 0.10;
  const FFw = (1 + 0.6 / 0.3 * tc + 100 * tc ** 4) * Math.cos(Math.atan(tanC4)) ** 0.28;
  const sExposed = S - SW.fusD * sch(SW.fusD / 2);
  const cdWing = cf(mac) * FFw * 2.04 * sExposed / S;
  const fr = SW.fusL / SW.fusD;
  const FFf = 1 + 60 / fr ** 3 + fr / 400;
  const sWetFus = Math.PI * SW.fusD * SW.fusL * 0.9 - SW.fusD * sch(SW.fusD / 2);
  const cdFus = cf(SW.fusL) * FFf * sWetFus / S;
  const f = SW.fin;
  const sFin = (f.root + f.top) / 2 * f.h;
  const cdFins = cf((f.root + f.top) / 2) * 1.1 * 2 * 2 * sFin / S;
  const cdMisc = 0.0015;
  const CD0 = {};
  for (const [pid, P] of Object.entries(STRIKER_PROPULSION)) {
    CD0[pid] = 1.1 * (cdWing + cdFus + cdFins + cdMisc + P.cdA / S);
  }
  /* The elevons, plant signs: per radian of trailing edge up. */
  const clDe = -D0.CLde, cmDe = -D0.Cmde;
  const Cmq = D0.Cmq;

  /* The propulsion, as the plant's laws. */
  for (const [pid, v] of Object.entries(variants)) {
    const P = v.P;
    if (pid === 'prop') {
      const R = P.propIn * INCH / 2;
      const Ts = Math.pow(P.shaftW * P.fm * Math.sqrt(2 * RHO * Math.PI * R * R), 2 / 3);
      const omega = P.rpm * 2 * Math.PI / 60;
      v.engine = {
        propR: R, Ts, Vp: P.rpm / 60 * P.pitchIn * INCH, rpmNoLoad: P.rpm / 0.85, torqueArm: P.shaftW / omega / Ts,
        idle: P.idle, tankM3: P.fuel.litres / 1000, flowFull: P.flowFullLph / 1000 / 3600,
        flowIdle: P.flowIdleFrac * P.flowFullLph / 1000 / 3600, thrustZ: P.thrustZ - v.zCG, jProp: P.jProp, fanTau: 0,
      };
    } else {
      v.engine = {
        propR: SW.nacelle.r, Ts: P.thrustN, Vp: P.exitV, rpmNoLoad: P.rpmFull / 0.85, torqueArm: 0,
        idle: Math.sqrt(P.idleThrustFrac), tankM3: P.fuel.litres / 1000, flowFull: P.flowFullLpm / 1000 / 60,
        flowIdle: P.flowIdleLpm / 1000 / 60, thrustZ: P.thrustZ - v.zCG, jProp: P.jProp, fanTau: P.spoolTau,
      };
    }
  }

  /* The payloads in the nose bay and the accessories, about the prop's
   * CG; each propulsion's own CG height is its `dz` over the prop's. */
  const zc = variants.prop.zCG;
  const payloads = STRIKER_PAYLOADS.map((p) => ({
    id: p.id,
    massKg: p.m,
    /* Inside the nose, under the airframe's own cap: no drag of its own. */
    dragArea_m2: 0,
    cgOffset_m: [r4(xCG - (SW.bayAft - p.len / 2)), 0, r4(-zc)],
    warhead: p.warhead,
    dims: { d: p.d, len: p.len },
  }));
  const accessories = STRIKER_ACCESSORIES.map((x) => ({
    id: x.id, massKg: x.m, cgOffset_m: [r4(xCG - x.at[0]), 0, r4(x.at[2] - zc)],
  }));
  /* The bay's trim lead, at its forward end on the axis, as far forward as
   * the airframe's own nose ballast: with it every payload, and none,
   * flies at the most nose heavy one's CG (configs/combat.js
   * trimBallastKg). */
  const ballast = { at_m: [r4(xCG - BALLAST_AT[0]), 0, r4(-zc)] };

  /*
   * PER VARIANT: what plant_wing.c's table takes, the performance the
   * gates hold the module to, and what each payload does to it.
   */
  /* A fin's side force acts at its area's centroid: the lattice's fin
   * stands all above the wing, the real one 0.12 m under it as well, so
   * its share of the roll due to sideslip scales by the two centroids'
   * heights over the wing. */
  const zFinUp = f.h * (f.root + 2 * f.top) / (3 * (f.root + f.top));
  const zFin = zFinUp - f.down;
  /* The fuselage's yaw due to sideslip, destabilising, -1.3 volume /
   * (S b) (Raymer eq. 16.47's form), and its side force, a cylinder in
   * cross flow at C_D 1.2 on half its side area, ESTIMATED. */
  const volFus = Math.PI * SW.fusD * SW.fusD / 4 * SW.fusL;
  const cnbFus = -1.3 * volFus / (S * b);
  const cybFus = -1.2 * SW.fusD * SW.fusL * 0.5 / S;
  /* The fins' own lift slope, per radian, on their area, from the
   * lattice's side force with and without them. */
  const DbAt0 = derivatives(bareRun, ref);
  const aFin = -(D0.CYb - DbAt0.CYb) * S / (2 * sFin);
  /* Thin aerofoil theory's effectiveness of a trailing edge surface of
   * chord fraction cf: 1 - (theta - sin theta) / pi, cos theta = 2 cf - 1. */
  const tauOf = (cfr) => { const th = Math.acos(2 * cfr - 1); return 1 - (th - Math.sin(th)) / Math.PI; };
  /* The rudders, trailing edge left positive: side force to the right,
   * the nose to the left, at their place behind and over the CG. The
   * fin's chord where they hang, 0.24 m. */
  const tauR = tauOf(f.rudderC / 0.24);
  const cyDr = 2 * aFin * tauR * (f.rudderSpan * 0.24) / S;
  const xRudder = SW.te + 0.07;
  const zRudder = SW.wingZ + f.rudderZ;
  /* The strips past the stall, each a quarter of the semispan: chord
   * over the mean chord, the elevon's tau where it covers the strip, and
   * the lattice's own loading at the cruise. */
  const strips = [0.125, 0.375, 0.625, 0.875];
  const stripC = strips.map((s) => sch(s * SW.semi) / c);
  const quarter = SW.semi / 4;
  const stripTau = strips.map((s, i) => {
    const y0 = quarter * i, y1 = y0 + quarter;
    const cover = Math.max(0, Math.min(y1, SW.flapOut) - Math.max(y0, SW.flapIn)) / quarter;
    return tauOf(SW.flapC / sch(s * SW.semi)) * cover;
  });
  const cfMac = SW.flapC / mac;
  const surfSep = cfMac / tauOf(cfMac);
  const stripR = (alpha) => {
    const res = run(ref, { alpha });
    return strips.map((s, i) => {
      const y0 = quarter * i, y1 = y0 + quarter;
      let sum = 0;
      for (const st of res.load) {
        const lo = Math.max(y0, st.ya), hi = Math.min(y1, st.yb);
        if (hi > lo) sum += st.clc * (hi - lo);
      }
      return sum / quarter / (res.CL * c) / stripC[i];
    });
  };
  /* The roll and yaw due to rate and the elevons' yaw, which the plant
   * takes as a multiple of the step's CL: their slopes in CL, between the
   * lattice at zero lift and at a CL of 0.5. */
  const aHalf = 0.5 / CLa;
  const Dhalf = derivatives(run, ref, { alpha: aHalf });
  const perCL = (key) => (Dhalf[key] - D0[key]) / 0.5;

  /* The plant's motor law at a stick: a running engine's idle under it. */
  const thrustAt = (E, V, stick) => {
    const n = E.idle + (1 - E.idle) * stick;
    return Math.max(0, E.Ts * n * n * (1 - V / (E.Vp * n)));
  };
  const payloadOf = (id) => (id ? payloads.find((p) => p.id === id) : null);
  const out = {};
  const throwE = 18 / DEG;
  for (const [pid, v] of Object.entries(variants)) {
    const E = v.engine;
    const cd0 = CD0[pid];
    /* A load's mass, weight, and its CG's move forward, m: the payload
     * and the trim lead the bay takes with it. */
    const loadOf = (p) => {
      const lead = trimBallastKg(v.M, payloads, p, ballast.at_m[0]);
      const M = v.M + (p ? p.massKg : 0) + lead;
      return { M, W: M * G, lead, dx: ((p ? p.massKg * p.cgOffset_m[0] : 0) + lead * ballast.at_m[0]) / M };
    };
    const perf = (p) => {
      const { M, W, dx } = loadOf(p);
      const drag = (V) => { const q = 0.5 * RHO * V * V; const CL = W / (q * S); return q * S * (cd0 + k * CL * CL); };
      /* The fastest speed at which the thrust still meets the drag. */
      const level = (stick) => {
        let lo = null;
        for (let V = 150; V > 6; V -= 0.25) {
          if (thrustAt(E, V, stick) > drag(V)) { lo = V; break; }
        }
        if (lo === null) return null;
        let hi = lo + 0.25;
        for (let i = 0; i < 60; i += 1) { const mid = (lo + hi) / 2; if (thrustAt(E, mid, stick) > drag(mid)) lo = mid; else hi = mid; }
        return lo;
      };
      let climb = { vz: -Infinity, V: 0 };
      for (let V = 8; V < 90; V += 0.05) {
        const vz = (thrustAt(E, V, 1) - drag(V)) * V / W;
        if (vz > climb.vz) climb = { vz, V };
      }
      return { M, W, dx, lead: loadOf(p).lead, level, climb, drag };
    };
    const bare = perf(null);
    const std = perf(payloadOf('standard'));
    /* The cruise: level at 60 percent of the stick, bare. */
    const Vcruise = bare.level(0.6);
    const CLcruise = bare.W / (0.5 * RHO * Vcruise * Vcruise * S);
    const alphaCruise = CLcruise / CLa;
    const D = derivatives(run, ref, { alpha: alphaCruise });
    const Db = derivatives(bareRun, ref, { alpha: alphaCruise });
    const clbFin = (D.Clb - Db.Clb) * (zFin / zFinUp);
    /* The reflex and the elevons' neutral: with the standard warhead, the
     * design load, each trims at its own cruise with the sticks centred
     * (Cm about its CG is the table's less CL times its forward move over
     * the chord). The jet cruises at two and a half times the speed on the
     * same wing, so its elevons are rigged that much lower. */
    const VcStd = std.level(0.6);
    const CLstd = std.W / (0.5 * RHO * VcStd * VcStd * S);
    const Cm0 = CLstd * (SMc + std.dx / c);
    /* A load's trimmed stall: at the stall angle the up elevon that zeroes
     * the moment about its CG, and the lift that costs; short of it where
     * the elevator's throw runs out. About a CG dx ahead of the table's the
     * whole lift, the elevon's share too, pitches the nose down by dx/c a
     * unit of CL. */
    const trimmedStall = (p) => {
      const { W, dx } = loadOf(p);
      const alphaS = CLmax / CLa;
      const cmA = Cma - CLa * dx / c;
      const cmE = cmDe - clDe * dx / c;
      let de = -(Cm0 + cmA * alphaS) / cmE;
      let alpha = alphaS;
      let limited = false;
      if (de > throwE) {
        de = throwE;
        alpha = -(Cm0 + cmE * de) / cmA;
        limited = true;
      }
      const CL = CLa * alpha + clDe * de;
      return { V: Math.sqrt(2 * W / (RHO * S * CL)), de: de * DEG, CL, limited };
    };
    /* The roll: a steady pb/2V of full stick, -Cl_da da / Cl_p, of 0.06
     * to 0.1, a big stable delta's: about 80 deg/s at the prop's cruise
     * and 110 at the jet's, which flies it twice as fast on less throw. */
    const throwA = (pid === 'prop' ? 7.0 : 4.0) / DEG;
    const pb2v = D.Clda * throwA / -D.Clp;
    /* The stick a rate asks for at the cruise, open loop: Acro's feed
     * forward, stick per rad/s. */
    const rollFF = 1 / (pb2v * 2 * Vcruise / b);
    const dclPerRad = -cmDe / Cma * CLa + clDe;
    const qPerRad = 0.5 * RHO * Vcruise * Vcruise * S * dclPerRad / (bare.M * Vcruise);
    const pitchFF = 1 / (qPerRad * throwE);
    const re = Vcruise * mac * RHO / 1.81e-5;
    out[pid] = {
      Vcruise, CLcruise, alphaCruise, VcStd, CLstd, Cm0,
      cyb: D.CYb + cybFus,
      clb: Db.Clb + clbFin,
      cnb: D.Cnb + cnbFus,
      clp: D.Clp, clda: D.Clda,
      cnr: D.Cnr - cd0 / 4,
      clrPerCL: perCL('Clr'), cnpPerCL: perCL('Cnp'), cndaPerCL: perCL('Cnda'),
      cyDr, cnDr: -cyDr * (xRudder - xCG) / b, clDr: cyDr * (zRudder - v.zCG) / b,
      throwA, throwE, throwR: 25 / DEG, surfaceMax: 24 / DEG, pb2v,
      rollAt: (V) => pb2v * 2 * V / b * DEG,
      rollFF, pitchFF, trimmedStall, perf, bare, std,
      top: bare.level(1), topStd: std.level(1), stripR: stripR(alphaCruise), re,
      /* On a flying wing the linear model's lift acts at the neutral
       * point: stall_arm_ac is minus the static margin, the flat plate's
       * centre of pressure 0.40 of the plant's chord behind the
       * aerodynamic centre. */
      stallArmAc: -SMc, stallArmCp: 0.40 - (0.25 - SMc),
    };
  }

  /* The hull and the points the plant and the shell need, body frame
   * (x forward, y left, z up) about each variant's CG. */
  const bodyOf = (pid) => (at) => [xCG - at[0], -at[1], at[2] - variants[pid].zCG];
  const hulls = {};
  for (const pid of Object.keys(variants)) {
    const B = bodyOf(pid);
    /* The contact code's box is centred on the CG, so it is as long fore
     * and aft as the tail reaches behind it (the nozzle's exit, past the
     * fins' trailing edges and the prop's hub); the nose's 0.33 m beyond
     * that is left to the crash parts, as the Kadet's tail is. */
    const tail = -B([SW.nacelle.x[1], 0, 0])[0];
    hulls[pid] = {
      hx: tail,
      hy: SW.semi + 0.016,
      down: -B([0, 0, SW.skid.z])[2],
      up: B([0, 0, SW.wingZ + f.h - f.down])[2],
      camera: B(SW.camera),
      prop: B(SW.hub),
      nacelle: B([SW.nacelle.x[1], 0, SW.nacelle.z]),
      origin: B(STRIKER_MODEL_ORIGIN),
    };
  }
  const extra = { stripC, stripTau, surfSep, cfMac, zFin, zFinUp, cnbFus, cybFus, aFin, tauR, tanLE, tanC4 };

  /*
   * The descriptor configs/airframes.js carries (rounded as it is typed
   * there): per propulsion its plant, bare mass, static thrust to weight,
   * trimmed stall with the standard warhead, level speed at full
   * throttle, voice (src/render/audio.js), its CG's height over the first
   * one's, and the drawing's origin about its CG (src/render/craft.js
   * draws strikercraft.js about the CG with it).
   */
  const VOICE = { prop: 'glow2', jet: 'edf' };
  const propulsion = Object.entries(variants).map(([pid, v]) => ({
    id: pid,
    simId: v.P.simId,
    grams: Math.round(v.M * 10000) / 10,
    thrustToWeight: Math.round(100 * v.engine.Ts / v.W) / 100,
    stall: Math.round(100 * out[pid].trimmedStall(payloads.find((p) => p.id === 'standard')).V) / 100,
    topSpeed: Math.round(10 * out[pid].top) / 10,
    voice: VOICE[pid],
    cgDz_m: r4(v.zCG - variants.prop.zCG),
    drawing_m: hulls[pid].origin.map(r4),
  }));
  const combat = { frame: 'striker', propulsion, payloads, accessories, ballast };

  return {
    SW, b, S, c, AR, mac, yMac, xMacLE, D0n, D0, xNPlattice, dCmaFus, xNP, xCG, SMc,
    SMmac: (xNP - xCG) / mac, CLa, Cma, Cmq, clDe, cmDe, CLmax, e, k, CD0,
    cd: { wing: cdWing, fus: cdFus, fins: cdFins, misc: cdMisc }, mWing, wingX,
    variants, payloads, accessories, out, hulls, extra, combat,
  };
}


/* The Striker's numbers, every one plant.c, plant_wing.c, crash_parts.h
 * and configs/airframes.js type from it. */
function printStriker() {
  const d = deriveStriker();
  const f = (x, n = 4) => (x == null ? 'none' : Number(x).toFixed(n));
  const v3 = (a, n = 4) => `[${a.map((x) => f(x, n)).join(', ')}]`;
  console.log('\n== striker (simIds 27 prop, 28 jet) ==');
  console.log(`span over the fins       ${f(SW.semi * 2 + 0.032, 3)} m; wing ${f(d.b)} m; S ${f(d.S)} m^2; S/b ${f(d.c)} m; AR ${f(d.AR, 3)}`);
  console.log(`MAC ${f(d.mac)} m, its LE ${f(d.xMacLE)} m aft of the nose at ${f(d.yMac)} m out; outer LE sweep ${f(Math.atan(d.extra.tanLE) * DEG, 1)} deg, c/4 ${f(Math.atan(d.extra.tanC4) * DEG, 1)} deg`);
  console.log(`neutral point            ${f(d.xNP)} m aft (lattice ${f(d.xNPlattice)}, fuselage dCma +${f(d.dCmaFus)}); CG ${f(d.xCG)} m aft, static margin ${f(d.SMmac, 3)} MAC, ${f(d.SMc)} of S/b`);
  console.log(`lattice at zero lift     CLa ${f(d.CLa)} Cma ${f(d.Cma)} Cmq ${f(d.Cmq)} cl_de ${f(d.clDe)} cm_de ${f(d.cmDe)}`);
  console.log(`CL max ${f(d.CLmax)}; Oswald e ${f(d.e)}, k ${f(d.k)}; CD0 wing ${f(d.cd.wing)} fuselage ${f(d.cd.fus)} fins ${f(d.cd.fins)} misc ${f(d.cd.misc)}`);
  console.log(`fins: lift slope ${f(d.extra.aFin)} /rad, centroid ${f(d.extra.zFin, 3)} m over the wing; fuselage Cn_beta ${f(d.extra.cnbFus)} CY_beta ${f(d.extra.cybFus)}; rudder tau ${f(d.extra.tauR)}`);
  console.log(`strips c/cmean ${d.extra.stripC.map((x) => f(x)).join(', ')}; elevon tau ${d.extra.stripTau.map((x) => f(x)).join(', ')}; surf_sep ${f(d.extra.surfSep)}`);
  for (const [pid, v] of Object.entries(d.variants)) {
    const o = d.out[pid];
    const E = v.engine;
    const h = d.hulls[pid];
    console.log(`\n-- ${pid} (simId ${v.P.simId}) --`);
    console.log(`mass ${f(v.M)} kg (fuel ${f(v.fuelKg, 3)} kg, its tank at ${f(v.tankX, 3)} m, nose ballast ${f(v.ballast, 3)} kg); CG ${f(v.zCG)} m over the axis`);
    console.log(`inertia about the CG     ${v3(v.I)} kg m^2`);
    for (const p of v.parts) {
      console.log(`  ${p.name.padEnd(44)} ${f(p.m, 3)} kg at ${v3(p.at, 3)}`);
    }
    console.log(`  ${'wing, spread over the planform'.padEnd(44)} ${f(d.mWing, 3)} kg, its centroid ${f(d.wingX, 3)} m aft`);
    console.log(`cd0 ${f(d.CD0[pid])}; cruise (60 percent) ${f(o.Vcruise, 2)} m/s at CL ${f(o.CLcruise)}; top ${f(o.top, 2)} m/s; cm_0 ${f(o.Cm0)} (trims with the standard warhead at ${f(o.VcStd, 2)} m/s)`);
    console.log(`lateral at cruise        cy_beta ${f(o.cyb)} cl_beta ${f(o.clb)} cn_beta ${f(o.cnb)} cl_p ${f(o.clp)} cn_r ${f(o.cnr)} cl_da ${f(o.clda)}`);
    console.log(`per CL                   cl_r ${f(o.clrPerCL)} cn_p ${f(o.cnpPerCL)} cn_da ${f(o.cndaPerCL)}; rudders cy_dr ${f(o.cyDr)} cn_dr ${f(o.cnDr)} cl_dr ${f(o.clDr)}`);
    console.log(`throws a ${f(o.throwA * DEG, 1)} e ${f(o.throwE * DEG, 1)} r ${f(o.throwR * DEG, 1)} max ${f(o.surfaceMax * DEG, 1)} deg; pb/2V ${f(o.pb2v)}, ${f(o.rollAt(o.Vcruise), 0)} deg/s at cruise; acro ff roll ${f(o.rollFF, 3)} pitch ${f(o.pitchFF, 3)}`);
    console.log(`strip_r ${o.stripR.map((x) => f(x)).join(', ')}; Re at cruise ${f(o.re, 0)}; stall arms ac ${f(o.stallArmAc)} cp ${f(o.stallArmCp)}`);
    console.log(`engine                   thrust ${f(E.Ts, 2)} N static, pitch speed ${f(E.Vp, 3)} m/s, rpm no load ${f(E.rpmNoLoad, 1)}, torque arm ${f(E.torqueArm, 5)} m, thrust z ${f(E.thrustZ)} m`);
    console.log(`                         idle ${f(E.idle, 3)}, tank ${E.tankM3} m^3, flow ${E.flowFull.toPrecision(6)} / ${E.flowIdle.toPrecision(6)} m^3/s, j ${E.jProp.toPrecision(4)} kg m^2, fan_tau ${E.fanTau} s`);
    console.log(`hull                     hx ${f(h.hx)} hy ${f(h.hy)} down ${f(h.down)} up ${f(h.up)}; camera ${v3(h.camera)}; prop hub ${v3(h.prop)}; nacelle exit ${v3(h.nacelle)}`);
    console.log(`the drawing's origin     ${v3(h.origin)} about the CG, body frame`);
    console.log('payload   mass   lead   CG move  trimmed stall (elevon)   top    best climb');
    for (const id of [null, 'emp', 'standard', 'penetrator', 'wide']) {
      const p = id ? d.payloads.find((x) => x.id === id) : null;
      const st = o.trimmedStall(p);
      const pf = o.perf(p);
      console.log(`  ${(id ?? 'none').padEnd(10)} ${f(p ? p.massKg : 0, 2)}  ${f(pf.lead, 3)}  ${f(pf.dx, 4)}   ${f(st.V, 2)} m/s (${f(st.de, 1)} deg)${st.limited ? ' at full throw' : ''}   ${f(pf.level(1), 2)}  ${f(pf.climb.vz, 2)} m/s at ${f(pf.climb.V, 1)}`);
    }
  }
  console.log('\npayloads, about the prop\'s CG:');
  for (const p of d.payloads) {
    console.log(`  ${p.id.padEnd(11)} ${p.massKg.toFixed(2)} kg  cg [${p.cgOffset_m.join(', ')}]  d ${p.dims.d} len ${p.dims.len}`);
  }
  console.log(`trim lead at [${d.combat.ballast.at_m.join(', ')}] about the prop's CG`);
  console.log('accessories, about the prop\'s CG:');
  for (const x of d.accessories) {
    console.log(`  ${x.id.padEnd(11)} ${x.massKg.toFixed(3)} kg  at [${x.cgOffset_m.join(', ')}]`);
  }
}

function print() {
  for (const [id, d] of Object.entries(deriveCombat())) {
    const { q, M, c, I, motor } = d;
    console.log(`\n== ${id} (simId ${q.simId}) ==`);
    console.log(`bare all up mass        ${M.toFixed(4)} kg`);
    console.log(`CG in the frame datum   [${c.map(r4).join(', ')}] m`);
    console.log(`inertia about the CG    [${I.map(r6).join(', ')}] kg m^2`);
    console.log(`arm_x, arm_y            ${d.arm.toFixed(16)}, ${d.armY.toFixed(16)} m (${(2000 * Math.hypot(d.arm, d.armY)).toFixed(1)} mm motor to motor diagonal)`);
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
    /* Four fifths of the pack is what a pilot flies before landing. */
    console.log(`endurance               ${(0.8 * q.packAh * 60 / motor.hover.pack).toFixed(1)} min at a hover (${motor.hover.pack.toFixed(1)} A pack), ${(0.8 * q.packAh * 3600 / motor.full.pack).toFixed(0)} s at full throttle, of a ${q.packAh} Ah pack`);
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
  printStriker();
}
