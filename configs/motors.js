/*
 * motors.js: a quad's motors, props and packs, the stock ones and the
 * real ones the hangar's Power tab offers on the same frame, and what each
 * does to the plant. docs/MOTORS-STAGE1.md is the derivation and the
 * source of every number; this file is the data and the arithmetic.
 *
 * THE CONTRACT
 *
 *   MOTORS[airframeId] is a quad's: `table` restates the plant's own entry
 *   (src/native/plant.c PLANT_TABLE, held to the module by
 *   scripts/motors-check.js), `esc` the stock ESC's published limit,
 *   `rLeads` the part of the table's resistance a cell that is leads and
 *   plug, not cell, `tau` the band its class's rotor time constant is held
 *   to, and `options`, `props` and `packs` list what can be fitted, the
 *   first of each the STOCK one the table was solved for. A motor is
 *     { id, name, detail, kv, grams, rPhase, statorMm, maxA, bench, pair,
 *       source }
 *   `name` is a string key (src/strings/en.js and es.js); `detail` the
 *   card's second line, the maker, the stator and the kV. `grams` is one
 *   motor as its maker weighs it, `rPhase` its phase to phase resistance,
 *   ohms, `statorMm` the stator's diameter, `maxA` the maker's peak
 *   current, and `bench` the maker's full throttle row on 6S on the prop it
 *   names: { prop, volts, amps, grams }. `pair`, where a maker published
 *   one, is the stock class motor the same maker ran on the same prop.
 *   A prop is { id, name, detail, grams, diaIn, pitchIn, stand, axial,
 *   torque, source }, `stand` the maker's rows for it and the stock prop
 *   on one motor; a pack { id, name, mAh, grams, g, maxA, source } (lipo
 *   and liion below).
 *
 *   The choice is settings.power[airframeId] = { option, prop, pack }, the
 *   slot a fixed wing's power choice has (configs/power.js powerChoice
 *   hands a quad's to motorChoice). motorsBlock(id, choice) and
 *   propPackBlock(id, choice) are the sim_set_motors and sim_set_prop_pack
 *   blocks for it, each null where what it carries is stock, so the stock
 *   choice is the table and clears. motorStats(id, choice) is the static
 *   operating point the hangar's readouts and the checks share,
 *   motorBench(id, choice, volts) a maker's stand's.
 *
 * WHAT A MOTOR CHANGES, the derivation in one paragraph (the doc has it
 * whole). The loaded torque constant moves with the nameplate kV, ke =
 * ke_stock kV_stock / kV, so an upgrade keeps the stock motor's
 * saturation over its plate (the five inch's 2207 loads to 1.26, the
 * combat quads' to 1.10 and 1.15, plant.c). The resistance moves by the
 * difference of the two phase resistances, the ESC, the leads and
 * whatever else the table's figure carries staying what they were. The
 * bell's inertia moves with the bell: half the motor's mass as a thin
 * ring at the stator's radius plus 2 mm (an ESTIMATE, no maker publishes
 * a rotor's inertia). Four motors' extra mass sits where the motors are,
 * so the mass and the inertia move by it, parallel axes; the CG's move
 * with it is under a millimetre and is left out. A prop and a pack move
 * the plant as quadPlant says.
 *
 * DETERMINISM. The blocks are data, + - * / and one Math.sqrt, which IEEE
 * 754 rounds correctly: each block is the same double in Node and every
 * browser. motorStats and motorBench use Math.sqrt for readouts and
 * checks, which no plant ever reads.
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

/* sim_abi.h's SIM_MOTORS_* and SIM_PROP_PACK_* layouts. */
export const SIM_MOTORS = { MASS: 0, IXX: 1, IYY: 2, IZZ: 3, KE: 4, R: 5, J_ROTOR: 6 };
export const SIM_MOTORS_DOUBLES = 7;
export const SIM_PROP_PACK = { KT: 0, KQ: 1, PITCH_R: 2, FM: 3, CELLS: 4, R_CELL: 5, AXIAL: 6, TORQUE: 21 };
export const SIM_PROP_PACK_DOUBLES = 36;

const G = 9.80665;

/* Where the four motors' mass is, body frame about the table's CG, m:
 * the stator's middle, from the arm's half spacing and its height. */
function corners(ax, ay, z) {
  return [[-ax, -ay, z], [ax, -ay, z], [-ax, ay, z], [ax, ay, z]];
}

/* A maker's full throttle row on 6S: the prop, the volts, the amps a
 * motor, the grams of thrust. */
const row = (prop, volts, amps, grams) => ({ prop, volts, amps, grams });

/* A maker's full throttle row for a prop on one motor: the volts, its
 * rpm, its grams of thrust and the electrical watts it drew. */
const propRow = (volts, rpm, grams, watts) => ({ volts, rpm, grams, watts });

/*
 * A pack, and how well it conducts against the quad's stock one. No maker
 * publishes a LiPo's internal resistance, so a LiPo's is an ESTIMATE: a
 * pack's C rating is its maker's heat limit, so a cell's resistance is
 * taken to go as 1 / (C Ah), and `g` is C Ah. A Li-ion pack's cells have a
 * datasheet DC resistance, so its `g` is the cells in parallel over that.
 * packPlant scales the cell part of the table's resistance by the stock
 * pack's g over this one's; the leads and the plug stay what they were.
 * `maxA` is the maker's continuous current: C Ah, or 45 A a P42A or P45B
 * cell (Molicel's datasheets).
 */
const lipo = (mAh, c, grams) => ({ mAh, c, grams, g: c * mAh / 1000, maxA: c * mAh / 1000 });
const liion = (mAh, parallel, cellOhms, grams) => ({ mAh, parallel, grams, g: parallel / cellOhms, maxA: 45 * parallel });

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
const P45B = 'https://www.molicel.com/wp-content/uploads/INR21700P45B_1.2_Product-Data-Sheet-of-INR-21700-P45B-80109.pdf';
const GNB = 'https://gaoneng.shop/products/';
const CNHL = 'https://chinahobbyline.com/products/';
const TATTU = 'https://genstattu.com/';
const GEMFAN_CATALOGUE = 'https://img03.71360.com/w3/5p3560/20251117/50ffa18f7578335345b42f12d991fd78.pdf';

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
 * The plant's own thrust and torque curves against axial speed, restated
 * from plant.c (docs/PROP-CURVES.md), which a choice with a stock prop and
 * another pack seats again through sim_set_prop_pack; scripts/
 * motors-check.js holds them to the module by flying both. Then each
 * offered prop's, from APC's file of the nearest pitch over diameter at
 * that prop's own full throttle speed on the stock motor, as
 * node scripts/prop-curves.js prints them.
 */
const AXIAL_5IN = [1.0000, 1.0065, 0.9753, 0.9348, 0.8819, 0.8125, 0.7244, 0.6177, 0.4981, 0.3702, 0.2371, 0.1021, 0.0000, 0.0000, 0.0000];
const TORQUE_5IN = [1.0000, 0.9916, 1.0303, 1.0544, 1.0673, 1.0525, 1.0003, 0.9148, 0.7948, 0.6472, 0.4760, 0.2843, 0.0000, 0.0000, 0.0000];
const AXIAL_7IN = [1.0000, 0.9617, 0.9164, 0.8633, 0.8018, 0.7317, 0.6534, 0.5664, 0.4725, 0.3736, 0.2710, 0.1662, 0.0615, 0.0000, 0.0000];
const TORQUE_7IN = [1.0000, 1.0186, 1.0281, 1.0281, 1.0145, 0.9858, 0.9368, 0.8725, 0.7870, 0.6868, 0.5662, 0.4350, 0.2892, 0.0000, 0.0000];
const AXIAL_10IN = [1.0000, 0.9587, 0.9112, 0.8567, 0.7950, 0.7256, 0.6485, 0.5643, 0.4742, 0.3794, 0.2813, 0.1813, 0.0816, 0.0000, 0.0000];
const TORQUE_10IN = [1.0000, 1.0169, 1.0259, 1.0252, 1.0125, 0.9892, 0.9461, 0.8859, 0.8082, 0.7143, 0.6042, 0.4767, 0.3393, 0.0000, 0.0000];
const AXIAL_INTERCEPTOR = [1.0000, 0.9959, 0.9916, 0.9833, 0.9625, 0.9178, 0.8342, 0.7007, 0.5321, 0.3454, 0.1521, 0.0000, 0.0000, 0.0000, 0.0000];
const TORQUE_INTERCEPTOR = [1.0000, 1.0510, 1.1236, 1.2145, 1.3073, 1.3742, 1.3771, 1.2645, 1.0558, 0.7718, 0.4374, 0.0000, 0.0000, 0.0000, 0.0000];
/* APC 5 x 4E three blade at 31,000 rpm, for the Gemfan 51466 V2 (pitch
 * over diameter 0.71; APC's nearest is 0.80, its 5 x 3E 0.60). */
const AXIAL_GF51466 = [1.0000, 0.9680, 0.9266, 0.8736, 0.8075, 0.7300, 0.6427, 0.5473, 0.4450, 0.3369, 0.2249, 0.1118, 0.0000, 0.0000, 0.0000];
const TORQUE_GF51466 = [1.0000, 1.0219, 1.0349, 1.0315, 1.0075, 0.9639, 0.8992, 0.8158, 0.7120, 0.5959, 0.4600, 0.3153, 0.0000, 0.0000, 0.0000];
/* APC 5 x 4.3E at 31,000 rpm, for the T5143S (0.84 against 0.86). */
const AXIAL_T5143S = [1.0000, 0.9793, 0.9527, 0.9178, 0.8714, 0.8113, 0.7351, 0.6411, 0.5335, 0.4165, 0.2935, 0.1674, 0.0418, 0.0000, 0.0000];
const TORQUE_T5143S = [1.0000, 1.0371, 1.0795, 1.1058, 1.1232, 1.1171, 1.0815, 1.0072, 0.8946, 0.7579, 0.5944, 0.4069, 0.2079, 0.0000, 0.0000];

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
 * the five inch's T-Motor F60 Pro V 1950 kV on its T5147, the measured row
 * plant.c is solved against (docs/STOCK-5INCH.md); the combat quads' scripts/combat-derive.js's 2806.5
 * 1300 kV (50 g, 75 mOhm), 3115 900 kV (95 g, 70 mOhm) and 2807 1500 kV
 * (56 g, 50 mOhm). `tau` is the band the stock motor is held to: check 8's
 * on the five inch (tests/thresholds.json), combat-gates' motor-tau on
 * the combat quads.
 */
export const MOTORS = {
  '5inch': {
    table: {
      massKg: 0.71, inertia: [0.0035, 0.0038, 0.0068], kt: 1.805e-6, kq: 2.648e-8, ke: 0.005807, rMotor: 0.1137, jRotor: 8.0e-6,
      cells: 6, rCell: 0.0025,
      kInflow: 0.019, fm: 0.52, axial: AXIAL_5IN, torque: TORQUE_5IN,
      /* The stators sit about 12 mm under the prop discs, plant.c's
       * pos_z 0.020: 8 mm over the CG. */
      motorAt: corners(0.0777817459305202, 0.0777817459305202, 0.008),
      /* The pack under the frame, its top on the strap (crash_parts.h). */
      packBox: { lo: [-0.048, -0.018, -0.045], hi: [0.024, 0.018, -0.006], strapZ: -0.006 },
    },
    /* plant.c's 2.5 mOhm a cell is the whole race pack's, leads and all. */
    rLeads: 0,
    /* A five inch's 4 in 1 ESC, 55 to 60 A a motor; 60. */
    esc: { amps: 60 },
    benchBand: 0.05,
    tau: { band: [0.010, 0.030], measure: 'check8' },
    options: [
      { id: 'stock', name: 'motors.5inch.stock', detail: 'T-Motor F60 Pro V 2207.5, 1950 kV', kv: 1950, grams: 33.9, rPhase: r2207(1950), statorMm: 22, source: [F60, PLANT_C, F50] },
      {
        id: 'f60pro-2020', name: 'motors.5inch.f60pro_2020', detail: 'T-Motor F60 Pro V 2207.5, 2020 kV', kv: 2020, grams: 33.8,
        rPhase: r2207(2020), statorMm: 22, maxA: 52.7, bench: row('T-Motor T5147 tri blade', 24.6, 52.7, 2025.5), pair: F60_1950, source: [F60, F50],
      },
      {
        id: 'f40pro-2150', name: 'motors.5inch.f40pro_2150', detail: 'T-Motor F40 Pro V 2306.8, 2150 kV', kv: 2150, grams: 33.7,
        rPhase: r2207(2150), statorMm: 23, maxA: 65.6, bench: row('T-Motor T5147 tri blade', 24.2, 65.6, 2108.3), pair: F60_1950, source: [F40, F50],
      },
    ],
    /*
     * Props of the frame's 5.1 inch that a maker ran beside the stock T5147
     * on one motor and one stand, so their thrust and torque against it
     * are measured facts about the props (propRatios). `stand` is that
     * motor (an option here) and its two full throttle rows, the T5147's
     * and this prop's.
     */
    props: [
      { id: 'stock', name: 'props.5inch.t5147', detail: 'T-Motor T5147, 5.1 x 4.7 tri blade', grams: 4.4, diaIn: 5.1, pitchIn: 4.7,
        source: ['https://www.getfpv.com/t-motor-t5147-propeller-set-of-10.html'] },
      {
        id: 'gf51466', name: 'props.5inch.gf51466', detail: 'Gemfan Hurricane 51466 V2, 5.1 x 3.6 tri blade', grams: 4.2, diaIn: 5.1, pitchIn: 3.6,
        /* On the stock motor itself, T-Motor's F60 Pro V 1950 kV. The F40
         * Pro V 2150 kV's pair (35369.5 rpm, 2026.4 g, 1530.0 W against
         * 33384.2, 2108.3, 1591.0) gives a kt 3 percent lower. */
        stand: { option: 'stock', stock: propRow(24.7, 31401, 1990.4, 1215.8), prop: propRow(24.7, 33163, 1958.3, 1158.9) },
        axial: AXIAL_GF51466, torque: TORQUE_GF51466,
        source: [F60, GEMFAN_CATALOGUE],
      },
      {
        id: 't5143s', name: 'props.5inch.t5143s', detail: 'T-Motor T5143S, 5.1 x 4.3 tri blade', grams: 4.1, diaIn: 5.1, pitchIn: 4.3,
        /* T-Motor ran it only on the F40 Pro V 2150 kV. */
        stand: { option: 'f40pro-2150', stock: propRow(24.2, 33384.2, 2108.3, 1591.0), prop: propRow(24.3, 36418.5, 1966.5, 1470.4) },
        axial: AXIAL_T5143S, torque: TORQUE_T5143S,
        source: [F40, `${TM}fpv-drone-propellers-t5143s`],
      },
    ],
    packs: [
      { id: 'stock', name: 'packs.cnhl_1300_130', ...lipo(1300, 130, 215), source: [`${CNHL}2-packs-cnhl-black-series-v2-0-1300mah-22-2v-6s-130c-lipo-battery-with-xt60-plug`] },
      { id: 'cnhl-1100-130', name: 'packs.cnhl_1100_130', ...lipo(1100, 130, 197.5), source: [`${CNHL}cnhl-black-series-1100mah-22-2v-6s-130c-lipo-battery-with-xt60-plug`] },
      { id: 'cnhl-1500-130', name: 'packs.cnhl_1500_130', ...lipo(1500, 130, 238), source: [`${CNHL}2-packs-cnhl-black-series-v2-0-1500mah-22-2v-6s-130c-lipo-battery-with-xt60-plug`] },
      { id: 'ministar-1800-120', name: 'packs.ministar_1800_120', ...lipo(1800, 120, 302), source: [`${CNHL}cnhl-ministar-series-1800mah-22-2v-6s-120c-lipo-battery-with-xt60-plug`] },
      { id: 'cnhl-2200-40', name: 'packs.cnhl_2200_40', ...lipo(2200, 40, 372), source: [`${CNHL}cnhl-black-series-2200mah-6s-22-2v-40c-lipo-battery-with-xt60-plug`] },
    ],
  },
  '7inch': {
    table: {
      massKg: 0.979, inertia: [0.004105, 0.004443, 0.007519], kt: 0.0000029498, kq: 3.7348e-8, ke: 0.00808017, rMotor: 0.09, jRotor: 0.000026,
      cells: 6, rCell: 0.018, motorAt: corners(0.11136931803688123, 0.11136931803688123, -0.0127),
      kInflow: 0.014149, fm: 0.55, axial: AXIAL_7IN, torque: TORQUE_7IN,
      /* The brick on top, its bottom on the strap (crash.c q7). */
      packBox: { lo: [-0.0377, -0.0315, 0.0003], hi: [0.0343, 0.0315, 0.0423], strapZ: 0.0003 },
    },
    /* scripts/combat-derive.js: 16 mOhm a P42A DC and 2 of leads and XT60. */
    rLeads: 0.002,
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
    props: [{ id: 'stock', name: 'props.7inch.stock', detail: 'HQ 7 x 3.5 tri blade' }],
    /* Six Molicel P42A in series, as combat-derive weighs it, and the one
     * P45B pack a maker sells with its cell named: Molicel's datasheets
     * give both cells' DC resistance, 16 and 15 mOhm. */
    packs: [
      { id: 'stock', name: 'packs.p42a_6s1p', ...liion(4200, 1, 0.016, 429), source: [MOLICEL] },
      { id: 'gnb-p45b-6s1p', name: 'packs.gnb_p45b_6s1p', ...liion(4500, 1, 0.015, 460), source: [`${GNB}gaoneng-gnb-6s-22.2v-4500mah-10c-xt60-li-ion-battery-made-with-molicel-21700-p45b`, P45B] },
    ],
  },
  '10inch': {
    table: {
      massKg: 1.848, inertia: [0.0143, 0.01424, 0.02593], kt: 0.000016425, kq: 3.2574e-7, ke: 0.0116714, rMotor: 0.09, jRotor: 0.00012,
      cells: 6, rCell: 0.010, motorAt: corners(0.148492424049175, 0.148492424049175, -0.014),
      kInflow: 0.020213, fm: 0.58, axial: AXIAL_10IN, torque: TORQUE_10IN,
      /* The two bricks side by side on top (crash.c q10). */
      packBox: { lo: [-0.0376, -0.063, 0.002], hi: [0.0344, 0.063, 0.044], strapZ: 0.002 },
    },
    /* scripts/combat-derive.js: two P42A in parallel, 8 mOhm, and 2 of leads. */
    rLeads: 0.002,
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
    props: [{ id: 'stock', name: 'props.10inch.stock', detail: '10 x 5 tri blade' }],
    packs: [
      { id: 'stock', name: 'packs.p42a_6s2p', ...liion(8400, 2, 0.016, 858), source: [MOLICEL] },
      { id: 'gnb-p45b-6s1p', name: 'packs.gnb_p45b_6s1p', ...liion(4500, 1, 0.015, 460), source: [`${GNB}gaoneng-gnb-6s-22.2v-4500mah-10c-xt60-li-ion-battery-made-with-molicel-21700-p45b`, P45B] },
      { id: 'gnb-p45b-6s2p', name: 'packs.gnb_p45b_6s2p', ...liion(9000, 2, 0.015, 900), source: [`${GNB}gaoneng-gnb-6s-22.2v-9000mah-10c-xt60-li-ion-battery-made-with-molicel-21700-p45b`, P45B] },
    ],
  },
  interceptor: {
    /* The sourced build (docs/COMBAT-DRONES.md 1a): T-Motor's V2808 1300
     * kV on APC's 7 x 9E, as plant.c has it. */
    table: {
      massKg: 0.88, inertia: [0.003559, 0.005785, 0.008652], kt: 4.701e-6, kq: 8.321e-8, ke: 0.00808, rMotor: 0.131, jRotor: 0.000027,
      cells: 6, rCell: 0.0045, motorAt: corners(0.120, 0.100, -0.0088),
      kInflow: 0.036383, fm: 0.4967, axial: AXIAL_INTERCEPTOR, torque: TORQUE_INTERCEPTOR,
      /* The pack on top, its bottom on the strap (crash.c qi). */
      packBox: { lo: [-0.0591, -0.0185, 0.0022], hi: [0.0459, 0.0185, 0.0442], strapZ: 0.0022 },
    },
    /* scripts/combat-derive.js: 3 mOhm a cell DC and 1.5 of leads and XT60. */
    rLeads: 0.0015,
    /* scripts/combat-derive.js's 4 in 1 65 A. */
    esc: { amps: 65 },
    tau: { band: [0.020, 0.060], measure: 'step' },
    /* APC's published limit for a thin electric prop, 150,000 rpm over its
     * diameter in inches (apcprop.com, RPM limits): 21,429 on the 7 x 9E.
     * motors-check holds every motor offered to it at full throttle. */
    propMaxRpm: 150000 / 7,
    options: [
      {
        id: 'stock', name: 'motors.interceptor.stock', detail: 'T-Motor Velox V2808, 1300 kV', kv: 1300, grams: 61.1, rPhase: r2808(1300), statorMm: 28,
        source: [V2808, SE2808],
      },
      { ...V2808_1500, name: 'motors.interceptor.v2808_1500' },
      {
        id: 'xing2-2809-1600', name: 'motors.interceptor.xing2_2809_1600', detail: 'iFlight XING2 2809, 1600 kV', kv: 1600, grams: 59.9, rPhase: 0.047,
        statorMm: 28, maxA: 62.24, bench: row('Gemfan 7040 tri blade', 23.4, 62.24, 2496), source: [XING2_2809],
      },
    ],
    /* APC's 7 x 7E and 7 x 11E are its neighbours, and APC's own static
     * rows put their figures of merit at 0.588 and 0.375, outside the
     * 0.38 to 0.52 the class is gated to (scripts/combat-gates.js), so
     * neither is offered (docs/MOTORS-STAGE1.md). */
    props: [{ id: 'stock', name: 'props.interceptor.stock', detail: 'APC 7 x 9E two blade' }],
    /* Tattu's R-Line 5.0 family at 150C, the stock 1800 among them. */
    packs: [
      { id: 'stock', name: 'packs.tattu_1800_150', ...lipo(1800, 150, 287), source: [`${TATTU}tattu-r-line-version-5-0-1800mah-6s-150c-22-2v-lipo-battery-pack-with-xt60-plug/`] },
      { id: 'tattu-1400-150', name: 'packs.tattu_1400_150', ...lipo(1400, 150, 222), source: [`${TATTU}tattu-r-line-version-5-0-1400mah-6s-150c-22-2v-lipo-battery-pack-with-xt60-plug/`] },
      { id: 'tattu-1550-150', name: 'packs.tattu_1550_150', ...lipo(1550, 150, 254), source: [`${TATTU}tattu-r-line-version-5-0-1550mah-6s-150c-22-2v-lipo-battery-pack-with-xt60-plug/`] },
      { id: 'tattu-2200-150', name: 'packs.tattu_2200_150', ...lipo(2200, 150, 346), source: [`${TATTU}tattu-r-line-version-5-0-2200mah-6s-150c-22-2v-lipo-battery-pack-with-xt60-plug/`] },
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

const pick = (list, id) => list.find((o) => o.id === id) || list[0];

export function motorOption(airframeId, optionId) {
  const m = MOTORS[airframeId];
  return m ? pick(m.options, optionId) : null;
}

export function propOption(airframeId, propId) {
  return pick(MOTORS[airframeId].props, propId);
}

export function packOption(airframeId, packId) {
  return pick(MOTORS[airframeId].packs, packId);
}

/* The pilot's choice for one quad, valid: stock wherever anything is
 * missing or unknown. */
export function motorChoice(airframeId, stored) {
  const want = stored && typeof stored === 'object' ? stored[airframeId] : null;
  return {
    option: motorOption(airframeId, want && want.option).id,
    prop: propOption(airframeId, want && want.prop).id,
    pack: packOption(airframeId, want && want.pack).id,
  };
}

/* A whole choice from a choice, an option's id or a motor record (an
 * option's `pair`), the prop and the pack stock where it names none. */
function choiceOf(c) {
  return c !== null && typeof c === 'object' && Object.hasOwn(c, 'option') ? c : { option: c };
}

/* An option by its id, or a motor record itself. */
function motorOf(airframeId, option) {
  return option && typeof option === 'object' ? option : motorOption(airframeId, option);
}

/* Every choice the quad offers, motor by prop by pack. */
export function quadChoices(airframeId) {
  const m = MOTORS[airframeId];
  const out = [];
  for (const o of m.options) {
    for (const p of m.props) {
      for (const k of m.packs) {
        out.push({ option: o.id, prop: p.id, pack: k.id });
      }
    }
  }
  return out;
}

/* The key a choice's flown top speed has in configs/motor-estimates.js. */
export function choiceKey(choice) {
  return `${choice.option} ${choice.prop} ${choice.pack}`;
}

/* A prop's thrust and torque constants over the stock prop's, from the
 * maker's two full throttle rows on one motor: thrust goes as kt w^2, and
 * at the same motor efficiency the electrical watts go as kq w^3 (T-Motor's
 * F50 table, which publishes torque, holds that efficiency within 2
 * percent across three props at full throttle). */
export function propRatios(prop) {
  if (!prop.stand) {
    return { kt: 1, kq: 1 };
  }
  const { stock: a, prop: b } = prop.stand;
  return {
    kt: (b.grams / (b.rpm * b.rpm)) / (a.grams / (a.rpm * a.rpm)),
    kq: (b.watts / (b.rpm * b.rpm * b.rpm)) / (a.watts / (a.rpm * a.rpm * a.rpm)),
  };
}

/* A pack as a box about the CG: its footprint the stock pack's, on the
 * same strap, its height the stock's scaled by its mass (the same cells,
 * the same density): an ESTIMATE, no maker publishes a pack's inertia.
 * Its own inertia and its parallel axis term, about the table's CG. */
function packInertia(box, kg, scale) {
  const dx = box.hi[0] - box.lo[0];
  const dy = box.hi[1] - box.lo[1];
  const h = (box.hi[2] - box.lo[2]) * scale;
  const cx = 0.5 * (box.lo[0] + box.hi[0]);
  const cy = 0.5 * (box.lo[1] + box.hi[1]);
  /* Away from the frame: down from a strap on top of a hung pack, up from
   * a strap under one sat on top. */
  const cz = box.strapZ === box.hi[2] ? box.strapZ - 0.5 * h : box.strapZ + 0.5 * h;
  return [
    kg * ((dy * dy + h * h) / 12 + cy * cy + cz * cz),
    kg * ((dx * dx + h * h) / 12 + cx * cx + cz * cz),
    kg * ((dx * dx + dy * dy) / 12 + cx * cx + cy * cy),
  ];
}

/*
 * The plant's constants for a choice: the table's moved by the motor, the
 * prop and the pack over the stock ones, as the header says. Each move is
 * a ratio or a difference first, so a stock part's is exactly 1 or 0 and
 * the stock choice's constants are the table's to the bit.
 *
 *   motor  ke by the kV ratio, R by the phase resistance difference, the
 *          bell's inertia by a thin ring, its mass at the motors.
 *   prop   kt and kq by propRatios, the pitch by its own, the figure of
 *          merit kt^1.5 / kq by both, its own curves (APC's, nearest pitch
 *          over diameter, scripts/prop-curves.js), its mass at the motors
 *          and its inertia as blades m R^2 / 3 (combat-derive.js's rule).
 *   pack   the cell part of the resistance by the stock pack's g over its
 *          own (lipo and liion above), its capacity, its mass and inertia
 *          by packInertia.
 *
 * The CG's move with a heavier pack (5 mm on the five inch's 2200) is left
 * out, as the motors' is.
 */
export function quadPlant(airframeId, choice) {
  const m = MOTORS[airframeId];
  const t = m.table;
  const c = choiceOf(choice);
  const stock = m.options[0];
  const o = motorOf(airframeId, c.option);
  const prop = propOption(airframeId, c.prop);
  const pack = packOption(airframeId, c.pack);
  const stockProp = m.props[0];
  const stockPack = m.packs[0];
  const newProp = prop !== stockProp;
  const dCorner = (o.grams - stock.grams) / 1000 + (newProp ? (prop.grams - stockProp.grams) / 1000 : 0);
  const inertia = [t.inertia[0], t.inertia[1], t.inertia[2]];
  for (const [x, y, z] of t.motorAt) {
    inertia[0] += dCorner * (y * y + z * z);
    inertia[1] += dCorner * (x * x + z * z);
    inertia[2] += dCorner * (x * x + y * y);
  }
  if (pack !== stockPack) {
    const was = packInertia(t.packBox, stockPack.grams / 1000, 1);
    const now = packInertia(t.packBox, pack.grams / 1000, pack.grams / stockPack.grams);
    for (let a = 0; a < 3; a += 1) {
      inertia[a] += now[a] - was[a];
    }
  }
  const ring = (grams, statorMm) => {
    const r = statorMm / 2000 + 0.002;
    return 0.5 * (grams / 1000) * r * r;
  };
  const blades = (p) => {
    const r = (p.diaIn * 0.0254) / 2;
    return (p.grams / 1000) * r * r / 3;
  };
  const ratio = propRatios(prop);
  return {
    massKg: t.massKg + 4 * dCorner + (pack.grams - stockPack.grams) / 1000,
    inertia,
    kt: t.kt * ratio.kt,
    kq: t.kq * ratio.kq,
    /* Math.sqrt is correctly rounded (IEEE 754), so the block it feeds is
     * the same double in every engine. */
    fm: newProp ? t.fm * ratio.kt * Math.sqrt(ratio.kt) / ratio.kq : t.fm,
    kInflow: newProp ? t.kInflow * (prop.pitchIn / stockProp.pitchIn) : t.kInflow,
    axial: newProp ? prop.axial : t.axial,
    torque: newProp ? prop.torque : t.torque,
    ke: t.ke * (stock.kv / o.kv),
    rMotor: t.rMotor + (o.rPhase - stock.rPhase),
    jRotor: t.jRotor + (ring(o.grams, o.statorMm) - ring(stock.grams, stock.statorMm)) + (newProp ? blades(prop) - blades(stockProp) : 0),
    cells: t.cells,
    rCell: t.rCell - (t.rCell - m.rLeads) * (1 - stockPack.g / pack.g),
    mAh: pack.mAh,
    maxA: pack.maxA,
  };
}

/* The sim_set_motors block, or null for the stock choice: the table. It
 * carries the whole machine's mass and inertia, so any part that is not
 * stock seats it. */
export function motorsBlock(airframeId, choice) {
  if (!hasMotors(airframeId)) {
    return null;
  }
  const m = MOTORS[airframeId];
  const c = choiceOf(choice);
  if (motorOf(airframeId, c.option) === m.options[0] && propOption(airframeId, c.prop) === m.props[0]
    && packOption(airframeId, c.pack) === m.packs[0]) {
    return null;
  }
  const p = quadPlant(airframeId, c);
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

/* The sim_set_prop_pack block for a choice's prop and pack, whatever they
 * are: scripts/motors-check.js seats the stock pair through it. */
export function propPackDoubles(airframeId, choice) {
  const p = quadPlant(airframeId, choice);
  const out = new Float64Array(SIM_PROP_PACK_DOUBLES);
  out[SIM_PROP_PACK.KT] = p.kt;
  out[SIM_PROP_PACK.KQ] = p.kq;
  out[SIM_PROP_PACK.PITCH_R] = p.kInflow;
  out[SIM_PROP_PACK.FM] = p.fm;
  out[SIM_PROP_PACK.CELLS] = p.cells;
  out[SIM_PROP_PACK.R_CELL] = p.rCell;
  for (let i = 0; i < 15; i += 1) {
    out[SIM_PROP_PACK.AXIAL + i] = p.axial[i];
    out[SIM_PROP_PACK.TORQUE + i] = p.torque[i];
  }
  return out;
}

/* The block, or null where the prop and the pack are both stock: the
 * table's. */
export function propPackBlock(airframeId, choice) {
  if (!hasMotors(airframeId)) {
    return null;
  }
  const m = MOTORS[airframeId];
  const c = choiceOf(choice);
  if (propOption(airframeId, c.prop) === m.props[0] && packOption(airframeId, c.pack) === m.packs[0]) {
    return null;
  }
  return propPackDoubles(airframeId, c);
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

/* A maker's stand: one motor and prop at duty 1 on a stiff supply of
 * `volts`, its thrust, N, and current, A. `choice` as quadPlant's. */
export function motorBench(airframeId, choice, volts) {
  const p = quadPlant(airframeId, choice);
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
export function motorStats(airframeId, choice) {
  const p = quadPlant(airframeId, choice);
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
  const usableAh = 0.8 * p.mAh / 1000;
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
