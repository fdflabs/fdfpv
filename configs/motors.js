/*
 * motors.js: a quad's motors, the stock ones and the real upgrades the
 * hangar's Power tab offers on the same frame, prop and pack, and what
 * each does to the plant. docs/MOTORS-STAGE1.md is the derivation and the
 * source of every number; this file is the data and the arithmetic.
 *
 * THE CONTRACT
 *
 *   MOTORS[airframeId] is a quad's: `table` restates the plant's own entry
 *   (src/native/plant.c PLANT_TABLE, held to the module by
 *   scripts/motors-check.js), `pack` and `esc` are the stock pack's and
 *   ESC's published limits, `tau` the band its class's rotor time constant
 *   is held to, and `options` lists the motors, the first the STOCK motor
 *   the table was solved for. Each option is
 *     { id, name, detail, kv, grams, rPhase, statorMm, maxA, bench, pair,
 *       source }
 *   `name` is a string key (src/strings/en.js and es.js); `detail` the
 *   card's second line, the maker, the stator and the kV. `grams` is one
 *   motor as its maker weighs it, `rPhase` its phase to phase resistance,
 *   ohms, `statorMm` the stator's diameter, `maxA` the maker's peak
 *   current, and `bench` the maker's full throttle row on 6S on the prop it
 *   names: { prop, volts, amps, grams }. `pair`, where a maker published
 *   one, is the stock class motor the same maker ran on the same prop.
 *
 *   The choice is settings.power[airframeId] = { option, pack: null }, the
 *   slot a fixed wing's power choice has (configs/power.js powerChoice
 *   hands a quad's to motorChoice). motorsBlock(id, option) is the
 *   sim_set_motors block for it, null for the stock motor, which is the
 *   table and clears. motorStats(id, option) is the static operating
 *   point the hangar's readouts and the checks share, motorBench(id,
 *   motor, volts) a maker's stand's.
 *
 * WHAT A MOTOR CHANGES, the derivation in one paragraph (the doc has it
 * whole). The prop is the frame's and stays: kt, kq, its pitch and its
 * figure of merit are the table's. The loaded torque constant moves with
 * the nameplate kV, ke = ke_stock kV_stock / kV, so an upgrade keeps the
 * stock motor's saturation over its plate (the five inch's 2207 loads to
 * 1.26, the combat quads' to 1.10 and 1.15, plant.c). The resistance
 * moves by the difference of the two phase resistances, the ESC, the
 * leads and whatever else the table's figure carries staying what they
 * were. The bell's inertia moves with the bell: half the motor's mass as a
 * thin ring at the stator's radius plus 2 mm (an ESTIMATE, no maker
 * publishes a rotor's inertia). Four motors' extra mass sits where the
 * motors are, so the mass and the inertia move by it, parallel axes; the
 * CG's move with it is under a millimetre and is left out.
 *
 * DETERMINISM. motorsBlock is data and + - * /: the block is the same
 * double in Node and every browser. motorStats and motorBench use
 * Math.sqrt for readouts and checks, which no plant ever reads.
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

/* sim_abi.h's SIM_MOTORS_* layout. */
export const SIM_MOTORS = { MASS: 0, IXX: 1, IYY: 2, IZZ: 3, KE: 4, R: 5, J_ROTOR: 6 };
export const SIM_MOTORS_DOUBLES = 7;

const G = 9.80665;

/* Where the four motors' mass is, body frame about the table's CG, m:
 * the stator's middle, from the arm's half spacing and its height. */
function corners(ax, ay, z) {
  return [[-ax, -ay, z], [ax, -ay, z], [-ax, ay, z], [ax, ay, z]];
}

/* A maker's full throttle row on 6S: the prop, the volts, the amps a
 * motor, the grams of thrust. */
const row = (prop, volts, amps, grams) => ({ prop, volts, amps, grams });

const TM = 'https://www.t-hobby.com/products/';
const IF = 'https://shop.iflight.com/';
const BH = 'https://www.brotherhobbystore.com/';
const PLANT_C = 'https://github.com/fdflabs/fdfpv/blob/main/src/native/plant.c';
const DERIVE = 'https://github.com/fdflabs/fdfpv/blob/main/scripts/combat-derive.js';
const F60 = `${TM}brushless-motor-for-fpv-drones-60pro-v-2207-5`;
const F40 = `${TM}t-motor-f40-pro-v-1950kv-fpv-brushless-drone-motor`;
const F50 = `${TM}tmotor-f50-2207-racing-motor`;
const V2808 = `${TM}fpv-brushless-motor-v2808`;
const V3115 = `${TM}tmotor-velox-v3115-brushless-cinematic-motor`;
const SE2808 = `${BH}products/brotherhobby-se-2808-1350kv-motorcw`;
const XING2_2809 = `${IF}XING2-2809-FPV-Motor-Unibell-Pro1673`;
const MOLICEL = 'https://www.molicel.com/wp-content/uploads/INR21700P42A-V4-80092.pdf';

/* T-Motor publishes no phase resistance for the F60 Pro V, the F40 Pro V
 * or the Velox V2808. Each is taken from the nearest motor of its class
 * that has one, by the winding law: on one stator, turns go as 1 / kV and
 * a turn's copper section as kV, so R goes as 1 / kV^2. The 2207s and the
 * 2306.8 from T-Motor's F50 2207 2150 kV, 50 mOhm; the 2808 from
 * BrotherHobby's SE 2808 1350 kV, 52 mOhm. ESTIMATES, and the doc says
 * so. */
const r2207 = (kv) => 0.050 * (2150 / kv) * (2150 / kv);
const r2808 = (kv) => 0.052 * (1350 / kv) * (1350 / kv);

/*
 * A maker's pair on one stand: an upgrade and the stock class motor the
 * same maker ran on the same prop, so their thrust ratio is a measured
 * fact about the two motors and not about two stands. scripts/
 * motors-check.js M4 runs both through the derivation on a stiff supply,
 * as a stand is, and holds the ratio to the maker's. Only the five inch
 * has one on a prop of its own class: T-Motor's T5147 is a five inch tri
 * blade like the plant's 5 x 4.3 x 3. The 7 inch makers' pairs are on
 * heavier 7 x 4 props than the plant's, which the doc shows is lighter
 * than its real 7 x 3.5, so their ratios are not the plant's to meet.
 */
const F60_1950 = {
  detail: 'T-Motor F60 Pro V 2207.5 1950 kV', kv: 1950, grams: 33.9, rPhase: r2207(1950), statorMm: 22,
  bench: row('T-Motor T5147 tri blade', 24.7, 49.3, 1990.4),
};

const V2808_1500 = {
  id: 'v2808-1500', detail: 'T-Motor Velox V2808, 1500 kV', kv: 1500, grams: 60.5, rPhase: r2808(1500), statorMm: 28, maxA: 74.3,
  bench: row('Gemfan 7040 tri blade', 24.2, 66.1, 2635.9), source: [V2808, SE2808],
};

/*
 * Every quad's own. THE STOCK MOTOR is the one its table was solved for:
 * the five inch's plant.c's 2207 1900 kV, weighed as T-Motor's F60 Pro V,
 * its stock class; the combat quads' scripts/combat-derive.js's 2806.5
 * 1300 kV (50 g, 75 mOhm), 3115 900 kV (95 g, 70 mOhm) and 2807 1500 kV
 * (56 g, 50 mOhm). `tau` is the band the stock motor is held to: check 8's
 * on the five inch (tests/thresholds.json), combat-gates' motor-tau on
 * the combat quads.
 */
export const MOTORS = {
  '5inch': {
    table: {
      massKg: 0.71, inertia: [0.0035, 0.0038, 0.0068], kt: 1.98e-6, kq: 3.04e-8, ke: 0.006336, rMotor: 0.1825, jRotor: 8.0e-6,
      cells: 6, rCell: 0.0025,
      /* The stators sit about 12 mm under the prop discs, plant.c's
       * pos_z 0.020: 8 mm over the CG. */
      motorAt: corners(0.0777817459305202, 0.0777817459305202, 0.008),
    },
    /* A 6S 1300 race pack: CNHL's Black Series V2, 130C continuous. */
    pack: { cells: 6, mAh: 1300, maxA: 169, source: 'https://chinahobbyline.com/products/2-packs-cnhl-black-series-v2-0-1300mah-22-2v-6s-130c-lipo-battery-with-xt60-plug' },
    /* A five inch's 4 in 1 ESC, 55 to 60 A a motor; 60. */
    esc: { amps: 60 },
    benchBand: 0.05,
    tau: { band: [0.010, 0.030], measure: 'check8' },
    options: [
      { id: 'stock', name: 'motors.5inch.stock', detail: '2207, 1900 kV', kv: 1900, grams: 33.9, rPhase: r2207(1900), statorMm: 22, source: [PLANT_C, F60, F50] },
      {
        id: 'f60pro-2020', name: 'motors.5inch.f60pro_2020', detail: 'T-Motor F60 Pro V 2207.5, 2020 kV', kv: 2020, grams: 33.8,
        rPhase: r2207(2020), statorMm: 22, maxA: 52.7, bench: row('T-Motor T5147 tri blade', 24.6, 52.7, 2025.5), pair: F60_1950, source: [F60, F50],
      },
      {
        id: 'f40pro-2150', name: 'motors.5inch.f40pro_2150', detail: 'T-Motor F40 Pro V 2306.8, 2150 kV', kv: 2150, grams: 33.7,
        rPhase: r2207(2150), statorMm: 23, maxA: 65.6, bench: row('T-Motor T5147 tri blade', 24.2, 65.6, 2108.3), pair: F60_1950, source: [F40, F50],
      },
    ],
  },
  '7inch': {
    table: {
      massKg: 0.979, inertia: [0.004105, 0.004443, 0.007519], kt: 0.0000029498, kq: 3.7348e-8, ke: 0.00808017, rMotor: 0.09, jRotor: 0.000026,
      cells: 6, rCell: 0.018, motorAt: corners(0.11136931803688123, 0.11136931803688123, -0.0127),
    },
    /* Six Molicel P42A in series, 45 A continuous a cell. */
    pack: { cells: 6, mAh: 4200, maxA: 45, source: MOLICEL },
    esc: { amps: 50 },
    tau: { band: [0.020, 0.060], measure: 'step' },
    options: [
      { id: 'stock', name: 'motors.7inch.stock', detail: '2806.5, 1300 kV', kv: 1300, grams: 50, rPhase: 0.075, statorMm: 28, source: [DERIVE] },
      {
        id: 'se2808-1350', name: 'motors.7inch.se2808_1350', detail: 'BrotherHobby SE 2808, 1350 kV', kv: 1350, grams: 58.2, rPhase: 0.052, statorMm: 28,
        maxA: 69.2, bench: row('HQ 8 x 4.5 tri blade', 24, 69.2, 2734), source: [SE2808],
      },
      { ...V2808_1500, name: 'motors.7inch.v2808_1500' },
    ],
  },
  '10inch': {
    table: {
      massKg: 1.848, inertia: [0.0143, 0.01424, 0.02593], kt: 0.000016425, kq: 3.2574e-7, ke: 0.0116714, rMotor: 0.09, jRotor: 0.00012,
      cells: 6, rCell: 0.010, motorAt: corners(0.148492424049175, 0.148492424049175, -0.014),
    },
    /* Two P42A bricks in parallel, 90 A. */
    pack: { cells: 6, mAh: 8400, maxA: 90, source: MOLICEL },
    esc: { amps: 60 },
    tau: { band: [0.050, 0.110], measure: 'step' },
    options: [
      { id: 'stock', name: 'motors.10inch.stock', detail: '3115, 900 kV', kv: 900, grams: 95, rPhase: 0.070, statorMm: 31, source: [DERIVE] },
      {
        id: 'v3115-900', name: 'motors.10inch.v3115_900', detail: 'T-Motor Velox V3115, 900 kV', kv: 900, grams: 113.1, rPhase: 0.03808, statorMm: 31,
        maxA: 83, bench: row('HQ 10 x 5 tri blade', 23, 82.99, 4605), source: [V3115],
      },
      {
        id: 'tornado-3115-970', name: 'motors.10inch.tornado_3115_970', detail: 'BrotherHobby Tornado T5 3115 Pro, 970 kV', kv: 970, grams: 113, rPhase: 0.045,
        statorMm: 31, maxA: 65.4, bench: row('HQ 10 x 4.5 tri blade', 25.0, 65.4, 4431), source: [`${BH}tornado-t5-3115-pro-motor-p0088-p0088.html`],
      },
      {
        id: 'v3115-1050', name: 'motors.10inch.v3115_1050', detail: 'T-Motor Velox V3115, 1050 kV', kv: 1050, grams: 112.7, rPhase: 0.03384, statorMm: 31,
        maxA: 83.6, bench: row('HQ 10 x 4.5 tri blade', 23, 83.46, 4804), source: [V3115],
      },
    ],
  },
  interceptor: {
    table: {
      massKg: 0.849, inertia: [0.003274, 0.005374, 0.007966], kt: 0.000003416, kq: 5.817e-8, ke: 0.00732113, rMotor: 0.065, jRotor: 0.000022,
      cells: 6, rCell: 0.0045, motorAt: corners(0.120, 0.100, -0.0088),
    },
    /* A 6S 1800 race pack: Tattu's R-Line 5.0, 150C. */
    pack: { cells: 6, mAh: 1800, maxA: 270, source: 'https://genstattu.com/tattu-r-line-version-5-0-1800mah-6s-150c-22-2v-lipo-battery-pack-with-xt60-plug/' },
    /* scripts/combat-derive.js's 4 in 1 65 A. */
    esc: { amps: 65 },
    tau: { band: [0.015, 0.040], measure: 'step' },
    options: [
      { id: 'stock', name: 'motors.interceptor.stock', detail: '2807, 1500 kV', kv: 1500, grams: 56, rPhase: 0.050, statorMm: 28, source: [DERIVE] },
      /* The stock 2807 1500 kV is already the hot end of a 6S 7 inch, and
       * this is the one hotter motor with a 6S table. The Velox V2808 1500
       * kV the 7 inch takes is the same kV on 4.5 g more a motor: here it
       * hovers higher up the stick and gains nothing, so it is not offered.
       * iFlight's own table records 160 C on this one at its full throttle
       * row: a burst, not a rating, and its peak current is not published,
       * so the row's is used. The card says so. */
      {
        id: 'xing2-2809-1600', name: 'motors.interceptor.xing2_2809_1600', detail: 'iFlight XING2 2809, 1600 kV', kv: 1600, grams: 59.9, rPhase: 0.047,
        statorMm: 28, maxA: 62.24, bench: row('Gemfan 7040 tri blade', 23.4, 62.24, 2496), source: [XING2_2809],
      },
    ],
  },
};

/*
 * A quad that opens the hangar on its stock motor and nothing else, and
 * the string that says why. The whoop flies the five inch's plant in a
 * room built to its scale (configs/airframes.js MICRO_SCALE): a real
 * whoop motor's numbers have no plant to reach, and the five inch's
 * motors on it would be a whoop wearing a five inch's upgrade. The
 * owner's decision of 2026-10-01: whoops fly stock.
 */
export const STOCK_ONLY = { whoop65: 'motors.whoop_stock' };

/* ------------------------------------------------------------------ */

export function hasMotors(airframeId) {
  return Object.hasOwn(MOTORS, airframeId);
}

export function motorOption(airframeId, optionId) {
  const m = MOTORS[airframeId];
  if (!m) {
    return null;
  }
  return m.options.find((o) => o.id === optionId) || m.options[0];
}

/* The pilot's choice for one quad, valid: the stock motor where anything
 * is missing or unknown. A quad flies its one pack. */
export function motorChoice(airframeId, stored) {
  const want = stored && typeof stored === 'object' ? stored[airframeId] : null;
  return { option: motorOption(airframeId, want && want.option).id, pack: null };
}

/* An option by its id, or a motor record itself (an option's `pair`). */
function motorOf(airframeId, option) {
  return option && typeof option === 'object' ? option : motorOption(airframeId, option);
}

/* The plant's constants with a motor fitted: the table's moved by the
 * motor over the stock one, as the header says. `option` is an option's
 * id or a motor record. */
export function motorPlant(airframeId, option) {
  const m = MOTORS[airframeId];
  const t = m.table;
  const stock = m.options[0];
  const o = motorOf(airframeId, option);
  const dm = (o.grams - stock.grams) / 1000;
  const inertia = [t.inertia[0], t.inertia[1], t.inertia[2]];
  for (const [x, y, z] of t.motorAt) {
    inertia[0] += dm * (y * y + z * z);
    inertia[1] += dm * (x * x + z * z);
    inertia[2] += dm * (x * x + y * y);
  }
  const ring = (grams, statorMm) => {
    const r = statorMm / 2000 + 0.002;
    return 0.5 * (grams / 1000) * r * r;
  };
  return {
    massKg: t.massKg + 4 * dm,
    inertia,
    kt: t.kt,
    kq: t.kq,
    /* Each a ratio or a difference first, so the stock motor's is exactly
     * 1 or 0 and its constants are the table's to the bit. */
    ke: t.ke * (stock.kv / o.kv),
    rMotor: t.rMotor + (o.rPhase - stock.rPhase),
    jRotor: t.jRotor + (ring(o.grams, o.statorMm) - ring(stock.grams, stock.statorMm)),
    cells: t.cells,
    rCell: t.rCell,
  };
}

/* The sim_set_motors block, or null for the stock motor: the table. */
export function motorsBlock(airframeId, optionId) {
  const m = MOTORS[airframeId];
  if (!m) {
    return null;
  }
  const o = motorOption(airframeId, optionId);
  if (o === m.options[0]) {
    return null;
  }
  const p = motorPlant(airframeId, o.id);
  const out = new Float64Array(SIM_MOTORS_DOUBLES);
  out[SIM_MOTORS.MASS] = p.massKg;
  out[SIM_MOTORS.IXX] = p.inertia[0];
  out[SIM_MOTORS.IYY] = p.inertia[1];
  out[SIM_MOTORS.IZZ] = p.inertia[2];
  out[SIM_MOTORS.KE] = p.ke;
  out[SIM_MOTORS.R] = p.rMotor;
  out[SIM_MOTORS.J_ROTOR] = p.jRotor;
  return out;
}

/* The full throttle speed, rad/s, where a motor's torque at duty 1 meets
 * the prop's, kq w^2 / ke = (V - ke w) / R, `volts(w)` the supply at that
 * speed: the one equilibrium both solves below share. */
function fullSpeed(p, volts) {
  let lo = 0;
  let hi = volts(0) / p.ke;
  for (let i = 0; i < 200; i += 1) {
    const w = 0.5 * (lo + hi);
    if ((volts(w) - p.ke * w) / p.rMotor > p.kq * w * w / p.ke) {
      lo = w;
    } else {
      hi = w;
    }
  }
  return 0.5 * (lo + hi);
}

/* A maker's stand: one motor on the plant's prop at duty 1 on a stiff
 * supply of `volts`, its thrust, N, and current, A. */
export function motorBench(airframeId, option, volts) {
  const p = motorPlant(airframeId, option);
  const w = fullSpeed(p, () => volts);
  return { w, thrustN: p.kt * w * w, amps: p.kq * w * w / p.ke };
}

/*
 * The static operating points, on the plant's own motor model (plant.c
 * plant_step, the same two equilibria scripts/combat-derive.js solves): a
 * fresh pack at 4.2 V a cell, sagging through its resistance under all
 * four. At steady state a motor's shaft torque is kq w^2 and its current
 * that over ke. Hover is at 1 g, the machine's real weight.
 *
 *   hover     { duty, amps } the throttle that holds it and the pack's draw
 *   full      { w, thrustN, amps, motorAmps, cellV } duty 1, standing
 *   tw        full throttle thrust over the weight
 *   tau       the rotor's time constant j R / ke^2, s
 *   hoverMin  minutes at a hover on 80 percent of the pack
 *   fullMin   minutes at full throttle standing on 80 percent of it
 */
export function motorStats(airframeId, option) {
  const m = MOTORS[airframeId];
  const p = motorPlant(airframeId, option);
  const voc = p.cells * 4.2;
  const rPack = p.cells * p.rCell;
  const wh = Math.sqrt(p.massKg * G / 4 / p.kt);
  const ih = p.kq * wh * wh / p.ke;
  const qa = 4 * rPack * ih;
  const qc = p.ke * wh + p.rMotor * ih;
  const duty = (voc - Math.sqrt(voc * voc - 4 * qa * qc)) / (2 * qa);
  /* The pack sags under all four at the current the speed asks. */
  const wf = fullSpeed(p, (w) => voc - rPack * 4 * (p.kq * w * w / p.ke));
  const iF = p.kq * wf * wf / p.ke;
  const usableAh = 0.8 * m.pack.mAh / 1000;
  const thrustN = 4 * p.kt * wf * wf;
  return {
    massKg: p.massKg,
    hover: { duty, amps: 4 * duty * ih },
    full: { w: wf, thrustN, amps: 4 * iF, motorAmps: iF, cellV: (voc - rPack * 4 * iF) / p.cells },
    tw: thrustN / (p.massKg * G),
    tau: p.jRotor * p.rMotor / (p.ke * p.ke),
    hoverMin: 60 * usableAh / (4 * duty * ih),
    fullMin: 60 * usableAh / (4 * iF),
  };
}
