/*
 * power.js: each plane's power system, the motor or engine, the pack or
 * the tank, and what the plant needs of them. docs/POWER-STAGE1.md is the
 * derivation of every number and the source of each; this file is the data
 * and the one function that turns a choice into the plant's parameters.
 *
 * THE CONTRACT, for the hangar screen and anything else that offers a
 * choice:
 *
 *   POWER[airframeId] is the list of options for a fixed wing in
 *   configs/airframes.js (quads have none). The first is the STOCK option,
 *   the one the plant's own table in src/native/plant.c and plant_wing.c
 *   is; the rest are real alternatives. Each option is
 *     { id, name, kind: 'electric' | 'glow', voice, massKg, cgShiftM,
 *       packs, pack, source, ...the plant's constants }
 *   `name` is a string key (src/strings/en.js and es.js), read with str().
 *   `voice` is src/render/audio.js's: 'wing' an electric motor, 'glow2' a
 *   two stroke, 'glow4' a four stroke. `massKg` is the power system's own
 *   mass without the pack or the fuel: motor or engine, ESC, prop, tank.
 *   `cgShiftM` is how far it moves the balanced CG, forward positive.
 *   `packs` is what it can be flown on: for 'electric' LiPo packs
 *   { id, cells, mAh, massKg, source }, for 'glow' fuel tanks
 *   { id, cc, massKg, source }, and `pack` names the default one.
 *   `source` is a list of URLs. `fan`, on a ducted fan's option only, is
 *   its spool as the plant's table has it (fan_tau and esc_start in
 *   src/native/plant_wing.c, which no power block changes): { tauS,
 *   escStartS }, so a bench or a check knows its thrust lags the stick.
 *
 *   The pilot's choice is settings.power[airframeId] = { option, pack }.
 *   normalizePower validates a stored map (an unknown airframe, option or
 *   pack falls back to stock), powerChoice reads one airframe's choice,
 *   powerParams builds the sim_set_power block for it (null for the stock
 *   option on its stock pack, which is sim_power_clear), and powerCells is
 *   the pack's cell count for the OSD. Changing a choice takes effect when
 *   the shell next seats the plane, between runs or at a hot swap.
 *
 * DETERMINISM. Everything below is data and + - * /; nothing here calls
 * Math.pow or a transcendental, so the block is the same double in Node
 * and every browser, which is what the plant's replays need.
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

import { MOTORS, hasMotors, motorChoice } from './motors.js';

/* sim_abi.h's SIM_POWER_* layout. */
export const SIM_POWER = {
  KIND: 0, MASS: 1, CG_SHIFT: 2, CELLS: 3, R_CELL: 4, PACK_C: 5, THRUST: 6, PITCH_SPEED: 7,
  RPM: 8, CURRENT: 9, IDLE: 10, TANK: 11, FLOW_FULL: 12, FLOW_IDLE: 13, LEAN_FRAC: 14,
  LEAN_GAIN: 15, LVC: 16,
};
export const SIM_POWER_DOUBLES = 17;

const IN = 0.0254;
const G = 9.80665;

/*
 * The arithmetic every derived option uses, docs/POWER-STAGE1.md: a
 * motor's no load speed is its kV times the pack's nominal 3.7 V a cell,
 * the prop turns at 0.85 of it at full throttle (the plant's rule, which
 * every stock table was built on) unless a maker's table gives the loaded
 * rpm, and the pitch speed is that rpm times the prop's pitch.
 */
function electric({ kv, cells, pitchIn, thrustG, currentA, rpm = null }) {
  const rpmNoLoad = rpm == null ? kv * 3.7 * cells : rpm / 0.85;
  const loaded = rpm == null ? 0.85 * rpmNoLoad : rpm;
  return {
    thrustN: (thrustG * G) / 1000,
    currentA,
    rpmNoLoad,
    pitchSpeedMs: (loaded * pitchIn * IN) / 60,
  };
}

/* A LiPo pack, and a glow tank whose mass is its fuel's, full. A null
 * mass is an unpublished one, allowed only on an option's only pack. */
function lipo(id, cells, mAh, grams, source) {
  return { id, cells, mAh, massKg: grams == null ? null : grams / 1000, source };
}
function tank(id, cc, m3, grams, source) {
  return { id, cc, m3, massKg: grams / 1000, source };
}

/*
 * Every airframe's table figures, restated from src/native/plant.c
 * PLANT_TABLE and plant_wing.c: its sim_set_airframe id, the all up mass
 * the table flies at, the receiver or flight pack's cells and internal
 * resistance, the prop's diameter, the cruise the checks fly (the table's
 * own trim speed where it has one, else 1.4 times the stall), its stall,
 * and the maker's stated flight time where there is one. scripts/
 * power-check.js P1 proves the stock option agrees with the table: through
 * sim_set_power it flies a trace bit identical to the table's.
 */
const HH = 'https://www.horizonhobby.com/product/x/';
const TIMBER_MANUAL = 'https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw442b6efc/Manuals/EFL105250-Manual-EN.pdf';
const CNHL = 'https://chinahobbyline.com/products/';
const SUNNYSKY = 'https://sunnyskyusa.com/products/sunnysky-x2820-brushless-motors';
const SONIC_SKY = 'https://www.sonicmodell.com/product/skyhunter-1800mm-wingspan-epo-long-range-fpv-uav-platform-rc-airplane-kit-14.html';
const GWS_2212 = 'http://www.gwsus.com/images/note%20book/gwblm003-1.jpg';
const GWS_GUIDE = 'http://www.gwsus.com/english/service/book/airplane/New_SlowStick_Manual.rar';
const OS_56 = 'https://www.os-engines.co.jp/english/line_up/engine/air/single/catalog/34330.html';
const OS_56_MANUAL = 'https://www.os-engines.co.jp/english/line_up/engine/air/single/img/manual/34330.pdf';
const OS_64 = 'https://www.os-engines.co.jp/english/line_up/engine/air/single/catalog/3AY00.html';
const SIG_KIT = 'https://sigmfg.com/products/kadet-senior-kit';
const SIG_ARF = 'https://cdn.shopify.com/s/files/1/2281/6393/files/sigrc96egarfkadetseniorsporteg.pdf';
const HIMAX_5018 = 'https://web.archive.org/web/2023id_/https://www.maxxprod.com/pdf/HC5018-530.pdf';
const HIMAX_2816 = 'https://web.archive.org/web/2023id_/https://www.maxxprod.com/pdf/HC2816-xxxx.pdf';
const BMJR = 'https://bmjrmodels.com/product/buzzard-bombshell/';
const COX_TEXACO = 'https://coxengines.ca/public/files/049%20Texaco.pdf';
const COX_REVIEW = 'https://www.coxengines.ca/public/files/review.pdf';
const SAM_RULES = 'https://www.antiquemodeler.org/images/Rulebook/2025%20Final%20-%20Jan%2017%202025.pdf';
const MENON = 'https://api.drum.lib.umd.edu/server/api/core/bitstreams/3ae6ca8c-b068-4d07-90dc-7f5bf6a95b3c/content';
const APC = 'https://www.apcprop.com/files/PER3_';
const OS_FX_MANUAL = 'https://www.os-engines.co.jp/english/line_up/engine/air/aircraft/manual/50sx_40-91fx.pdf';
const RCU_61FX = 'https://www.rcuniverse.com/forum/glow-engines-114/6767782-o-s-61-fx-engines.html';
const RCM_STIK = 'https://outerzone.co.uk/plan_details.asp?ID=6801';
const GP_TIGER = 'https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf';
const OS_FS91 = 'https://www.os-engines.co.jp/english/line_up/engine/air/single/manual/fs70-91s2_series.pdf';
const FREEWING_F16 = 'https://www.freewing-model.com/freewing-f-16-falcon-v3-6s-high-performance-70mm-edf-jet-pnp-fj21115p.html';
const FREEWING_F16_MANUAL = 'https://www.freewing-model.com/download/freewing-70mm-f-16-v3-70mm-manual.pdf';
const FREEWING_F16_4S = 'https://freewing-model.com/freewing-f-16-v2-4s-standard-70mm-edf-jet-pnp-rc-airplane.html';
const FREEWING_FAN = 'https://www.rc-castle.com/index.php?route=product/product&product_id=7558';
const NASA_EDF = 'https://ntrs.nasa.gov/api/citations/20230017299/downloads/Weinstein_SciTech2024_Final.pdf';
const ADMIRAL = 'https://motionrc.com/products/';
const FMS_P51 = 'https://www.fmshobby.com/products/fms-1400mm-p-51d-red-tail-v8-pnp';
const FMS_P51_MANUAL = 'https://cdn-files.myshopline.com/file/store/1772248208561/55c1d8443b5c438095f19ab8babfc3b0.pdf';
const P51_UPGRADE = 'https://www.hobbysquawk.com/forum/rc-airplanes/rc-propeller-airplanes/66486-official-fms-1400mm-p-51d-v8-thread/page22';
const ZAGI_MOTOR = 'https://web.archive.org/web/2019/https://zagi.com/product/brushless-motor/';
const ZAGI_PACK = 'https://web.archive.org/web/2019/https://zagi.com/product/battery-for-hp-and-hp60/';
const ZAGI_HP_MANUAL = 'https://web.archive.org/web/20151216152823/http://www.zagi.com/pdf/Zagi-HP-w.pdf';
/* Glow fuel's density, g/cc, the figure Menon's fuel flows are converted
 * with; a tank's mass here is its fuel's, full. */
const FUEL_G_CC = 0.875;

export const TABLE = {
  wing1000: { simId: 2, massKg: 0.65, cells: 4, rCell: 0.012, propIn: 6, cruiseMs: 15, flightTime: null },
  sky1800: {
    simId: 3, massKg: 2.10, cells: 4, rCell: 0.008, propIn: 11, cruiseMs: 15,
    flightTime: { kind: 'atLeast', minutesLow: 10, minutesHigh: 10, note: "Model Aviation's review, 'flights lasting 10 minutes and longer', 4S 5000 at 2.10 kg", source: 'https://www.modelaviation.com/skyhunter' },
  },
  cub1400: {
    simId: 4, massKg: 1.32, cells: 3, rCell: 0.012, propIn: 11, cruiseMs: 12,
    flightTime: { kind: 'timer', minutesLow: 4, minutesHigh: 6, note: "FMS: a 4 minute first timer, 'approx. flying duration 6min', 3S 2200", source: 'https://www.fmshobby.com/products/fms-1400mm-55-1-j-3-cub-v4-pnp' },
  },
  cub1400f: {
    simId: 10, massKg: 1.532, cells: 3, rCell: 0.012, propIn: 11, cruiseMs: 12,
    flightTime: { kind: 'timer', minutesLow: 4, minutesHigh: 6, note: 'FMS, as the Cub on wheels', source: 'https://www.fmshobby.com/products/fms-1400mm-55-1-j-3-cub-v4-pnp' },
  },
  radian2000: { simId: 6, massKg: 0.98, cells: 3, rCell: 0.015, propIn: 9.75, cruiseMs: 7.7, flightTime: null },
  bramor2300: {
    simId: 8, massKg: 4.5, cells: 6, rCell: 0.010, propIn: 12, cruiseMs: 16,
    flightTime: { kind: 'cruise', minutesLow: 180, minutesHigh: 180, end: 'cut', note: "C-Astral, 'up to 3 h' at 16 m/s on LiPo; the pack's capacity is derived from it, so this is a consistency check", source: 'https://www.c-astral.com/en/unmanned-systems/bramor-c4eye' },
  },
  slowstick1180: { simId: 5, massKg: 0.42, cells: 2, rCell: 0.030, propIn: 11, cruiseMs: 5.5, flightTime: null },
  timber1500: {
    simId: 7, massKg: 1.70, cells: 4, rCell: 0.008, propIn: 11, cruiseMs: 13,
    flightTime: { kind: 'timer', minutesLow: 4, minutesHigh: 7, note: "E-flite's manual timers, 4 min first flights and 7 min, on the 4S 3200; Model Aviation flew 5 to 8", source: TIMBER_MANUAL },
  },
  timber1500f: {
    simId: 9, massKg: 1.934, cells: 4, rCell: 0.008, propIn: 11, cruiseMs: 13,
    flightTime: { kind: 'timer', minutesLow: 4, minutesHigh: 7, note: 'E-flite, as the Timber on wheels', source: TIMBER_MANUAL },
  },
  bombshell1118: { simId: 11, massKg: 0.5599, cells: 3, rCell: 0.030, propIn: 7, cruiseMs: 8, flightTime: null },
  /* No motor and no POWER entry: the NRJ's plant table, its 1S receiver
   * pack, and its best glide for a cruise (docs/DLG-STAGE1.md). */
  nrj1490: { simId: 21, massKg: 0.213, cells: 1, rCell: 0.10, propIn: 0, cruiseMs: 5.14, flightTime: null },
  f16878: {
    simId: 16, massKg: 2.116, cells: 6, rCell: 0.006, propIn: 69 / 25.4, cruiseMs: 20,
    flightTime: { kind: 'mixed', minutesLow: 4, minutesHigh: 4, note: "Model Aviation's review of the V2 6S Pro on a 6S 4000, flown as a jet is: 'Flight duration: 4 minutes'", source: 'https://www.modelaviation.com/freewing-f-16' },
  },
  kadet1981: {
    simId: 12, massKg: 2.7216, cells: 2, rCell: 0.030, propIn: 12, cruiseMs: 10,
    flightTime: { kind: 'mixed', minutesLow: 19.4, minutesHigh: 19.4, note: "O.S.'s 'around 12 minutes' on 220 cc for the FSa-56II, the FS-52S's successor, is 19.4 min on SIG's 355 cc", source: OS_56_MANUAL },
  },
  uglystik1567: { simId: 19, massKg: 2.7216, cells: 2, rCell: 0.030, propIn: 12, cruiseMs: 17.33, flightTime: null },
  tigermoth1803: { simId: 23, massKg: 4.6493, cells: 2, rCell: 0.030, propIn: 12, cruiseMs: 14.41, flightTime: null },
  p51d1450: {
    simId: 15, massKg: 2.35, cells: 4, rCell: 0.008, propIn: 14, cruiseMs: 15.1,
    flightTime: { kind: 'mixed', minutesLow: 8, minutesHigh: 8, note: "FMS's 'Approx. Flying Duration 8 minutes' on the 4S 2600 (the product page), a flight's mix of throttle; the manual's four minute timer is for the first flight", source: FMS_P51 },
  },
  zagi1219: { simId: 17, massKg: 0.7229, cells: 3, rCell: 0.008, propIn: 5, cruiseMs: 10.3, flightTime: null },
};

/* ------------------------------------------------------------------ */

/* The Turbo Timber Evolution, docs/TIMBER-STAGE1.md: E-flite's BL10 800 kV
 * on the 11 x 7.5 three blade and a Spektrum Avian 60 A, 4S or 3S, 2200 to
 * 5000 mAh (E-flite's product page). The pack slides to the manual's 60 mm
 * CG, so no option shifts it. */
const TIMBER_4S = [
  lipo('4s2200', 4, 2200, 270, `${HH}SPMX224S30.html`),
  lipo('4s3200', 4, 3200, 325, `${HH}SPMX32004S30.html`),
  lipo('4s4000', 4, 4000, 375, `${HH}SPMX40004S30.html`),
  lipo('4s5000', 4, 5000, 486, `${HH}SPMX50004S30.html`),
];
const TIMBER_3S = [
  lipo('3s2200', 3, 2200, 165.56, `${HH}SPMX22003S30.html`),
  lipo('3s3200', 3, 3200, 237, `${HH}SPMX32003S30.html`),
];
const TIMBER = [
  {
    id: 'stock', name: 'power.timber.stock', kind: 'electric', voice: 'wing',
    kv: 800, propIn: 11, pitchIn: 7.5, blades: 3,
    thrustN: 25.0, currentA: 44.0, rpmNoLoad: 11840, pitchSpeedMs: 31.95, lvcV: 3.4,
    massKg: 1.70, cgShiftM: 0, packs: TIMBER_4S, pack: '4s3200',
    source: [TIMBER_MANUAL, 'https://www.horizonhobby.com/product/e-flite-turbo-timber-evolution-1.5m-bnf-basic-includes-floats/EFL105250.html'],
  },
  {
    /* The same motor and prop on 3S, which E-flite lists: speed with the
     * voltage, thrust and static current with its square. */
    id: '3s', name: 'power.timber.3s', kind: 'electric', voice: 'wing',
    kv: 800, propIn: 11, pitchIn: 7.5, blades: 3,
    thrustN: 25.0 * (11.1 / 14.8) * (11.1 / 14.8), currentA: 44.0 * (11.1 / 14.8) * (11.1 / 14.8),
    rpmNoLoad: 800 * 11.1, pitchSpeedMs: 31.95 * (11.1 / 14.8), lvcV: 3.4,
    massKg: 1.70 - 0.325 + 0.237, cgShiftM: 0, packs: TIMBER_3S, pack: '3s3200',
    source: ['https://www.horizonhobby.com/product/e-flite-turbo-timber-evolution-1.5m-bnf-basic-includes-floats/EFL105250.html', 'https://www.modelaviation.com/turbo-timber-bnf'],
  },
];

/* The FMS J-3 Cub 1400: FMS's 3536 850 kV on an 11 x 7 and a 40 A ESC on
 * 3S 2200, the one power system FMS lists; the manual moves the pack to
 * the CG. No alternative motor with published figures was found. */
const CUB = [
  {
    id: 'stock', name: 'power.cub.stock', kind: 'electric', voice: 'wing',
    kv: 850, propIn: 11, pitchIn: 7, blades: 2,
    thrustN: 13.5, currentA: 27.0, rpmNoLoad: 9435, pitchSpeedMs: 23.8, lvcV: 3.0,
    massKg: 1.32, cgShiftM: 0,
    packs: [
      lipo('3s2200', 3, 2200, 165.56, `${HH}SPMX22003S30.html`),
      lipo('3s3200', 3, 3200, 237, `${HH}SPMX32003S30.html`),
    ],
    pack: '3s2200',
    source: ['https://www.fmshobby.com/products/fms-1400mm-55-1-j-3-cub-v4-pnp', 'https://cdn-files.myshopline.com/file/store/1772248208561/ZTW.pdf'],
  },
];

/* The Skyhunter 1800, sold bare. Stock is Model Aviation's measured
 * review build (950 kV, APC 11 x 5.5, 4S 5000). The alternatives are the
 * maker's own "Normal" and "Advance" setups on SunnySky's X2820, each row
 * SunnySky's full throttle bench figure at 14.8 V (11.1 V for 3S); the
 * X2820 is 138 g, the review's motor's mass is unpublished, so the motor
 * swap adds nothing but the V3's 5 g. The pack slides forward to the 1/3
 * chord CG. */
const SKY_4S = [
  lipo('4s4000', 4, 4000, 429, `${CNHL}cnhl-4000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug`),
  lipo('4s5000', 4, 5000, 536, `${CNHL}cnhl-5000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug`),
  lipo('4s6000', 4, 6000, 620, `${CNHL}cnhl-black-series-6000mah-14-8v-4s-65c-lipo-battery-with-ec5-plug`),
  lipo('4s16000', 4, 16000, 1270, `${CNHL}cnhl-16000mah-14-8v-4s-15c-lipo-battery-with-xt90-plug`),
];
const SKY_3S = [
  lipo('3s5000', 3, 5000, 412, `${CNHL}cnhl-5000mah-11-1v-3s-40c-lipo-battery-with-xt90-plug`),
];
const SKY = [
  {
    id: 'stock', name: 'power.sky.stock', kind: 'electric', voice: 'wing',
    kv: 950, propIn: 11, pitchIn: 5.5, blades: 2,
    thrustN: 27.0, currentA: 43.0, rpmNoLoad: 14060, pitchSpeedMs: 27.8, lvcV: 3.0,
    massKg: 2.10, cgShiftM: 0, packs: SKY_4S, pack: '4s5000',
    source: ['https://www.modelaviation.com/skyhunter', SONIC_SKY],
  },
  {
    id: '920-11x7', name: 'power.sky.920_11x7', kind: 'electric', voice: 'wing',
    kv: 920, propIn: 11, pitchIn: 7, blades: 2,
    ...electric({ kv: 920, cells: 4, pitchIn: 7, thrustG: 2540, currentA: 45.0 }),
    lvcV: 3.0, massKg: 2.10, cgShiftM: 0, packs: SKY_4S, pack: '4s5000',
    source: [SONIC_SKY, SUNNYSKY],
  },
  {
    id: '920-12x6', name: 'power.sky.920_12x6', kind: 'electric', voice: 'wing',
    kv: 920, propIn: 12, pitchIn: 6, blades: 2,
    ...electric({ kv: 920, cells: 4, pitchIn: 6, thrustG: 2860, currentA: 48.4 }),
    lvcV: 3.0, massKg: 2.10, cgShiftM: 0, packs: SKY_4S, pack: '4s5000',
    source: [SONIC_SKY, SUNNYSKY],
  },
  {
    id: '920-12x6-3s', name: 'power.sky.920_12x6_3s', kind: 'electric', voice: 'wing',
    kv: 920, propIn: 12, pitchIn: 6, blades: 2,
    ...electric({ kv: 920, cells: 3, pitchIn: 6, thrustG: 1780, currentA: 29.8 }),
    lvcV: 3.0, massKg: 2.10 - 0.536 + 0.412, cgShiftM: 0, packs: SKY_3S, pack: '3s5000',
    source: [SONIC_SKY, SUNNYSKY],
  },
  {
    id: '800-13x8', name: 'power.sky.800_13x8', kind: 'electric', voice: 'wing',
    kv: 800, propIn: 13, pitchIn: 8, blades: 2,
    ...electric({ kv: 800, cells: 4, pitchIn: 8, thrustG: 2790, currentA: 45.2 }),
    lvcV: 3.0, massKg: 2.10, cgShiftM: 0, packs: SKY_4S, pack: '4s5000',
    source: [SONIC_SKY, SUNNYSKY],
  },
];

/* The Radian Pro: E-flite's 480 960 kV on the 9.75 x 7.5 folding prop, a
 * 30 A ESC, 3S 1300 to 2200 (the Night Radian's range on the same power
 * system). No motor alternative with published figures was found. */
const RADIAN = [
  {
    id: 'stock', name: 'power.radian.stock', kind: 'electric', voice: 'wing',
    kv: 960, propIn: 9.75, pitchIn: 7.5, blades: 2,
    thrustN: 9.28, currentA: 21.8, rpmNoLoad: 10656, pitchSpeedMs: 28.76, lvcV: 3.108,
    massKg: 0.98, cgShiftM: 0,
    packs: [
      lipo('3s1300', 3, 1300, 113, `${CNHL}cnhl-black-series-1300mah-11-1v-3s-130c-lipo-battery-with-xt60-plug`),
      lipo('3s1500', 3, 1500, 125, `${CNHL}cnhl-black-series-v2-0-1500mah-11-1v-3s-130c-lipo-battery-with-xt60-plug`),
      lipo('3s1800', 3, 1800, 168, `${CNHL}cnhl-1800mah-11-1v-3s-70c-lipo-battery-with-t-dean-plug`),
      lipo('3s2200', 3, 2200, 180, `${CNHL}cnhl-black-series-2200mah-3s-11-1v-30c-lipo-battery-with-ec3-plug`),
    ],
    pack: '3s1300',
    source: ['https://www.modelairplanenews.com/parkzone-radian-pro/', 'https://www.modelaviation.com/eflite-night-radian', 'https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw5e16af32/Manuals/EFLA1030B_Manual.pdf'],
  },
];

/* The Bramor C4EYE: C-Astral publishes neither motor nor pack, only 3 h on
 * LiPo. The 6S 22000 is derived from that endurance on this plant
 * (docs/POWER-STAGE1.md) and its mass is inside the published 4.5 kg;
 * nothing else is offered. */
const BRAMOR = [
  {
    id: 'stock', name: 'power.bramor.stock', kind: 'electric', voice: 'wing',
    kv: 470, propIn: 12, pitchIn: 8, blades: 2,
    thrustN: 35.0, currentA: 45.0, rpmNoLoad: 10434, pitchSpeedMs: 30.0, lvcV: 0,
    massKg: 4.5, cgShiftM: 0,
    packs: [lipo('6s22000', 6, 22000, null, 'https://www.c-astral.com/en/unmanned-systems/bramor-c4eye')],
    pack: '6s22000',
    source: ['https://www.c-astral.com/en/unmanned-systems/bramor-c4eye', 'https://www.c-astral.com/media/uploads/fm/catalogue/c-astral_katalog2019-spread.pdf'],
  },
];

/* The 1000 mm wing, kept in the module for its gates and board: a 2216
 * 1400 kV on a 6 x 4, 4S (docs/WING-STAGE1.md, unverified). */
const WING = [
  {
    id: 'stock', name: 'power.wing.stock', kind: 'electric', voice: 'wing',
    kv: 1400, propIn: 6, pitchIn: 4, blades: 2,
    thrustN: 11.5, currentA: 28.0, rpmNoLoad: 20720, pitchSpeedMs: 29.8, lvcV: 3.0,
    massKg: 0.65, cgShiftM: 0,
    packs: [
      lipo('4s1300', 4, 1300, 151, `${CNHL}cnhl-black-series-v2-0-1300mah-14-8v-4s-130c-lipo-battery-with-xt60-plug`),
      lipo('4s1800', 4, 1800, 209, `${CNHL}cnhl-ministar-series-1800mah-14-8v-4s-120c-lipo-battery-with-xt60-plug`),
      lipo('4s2200', 4, 2200, 211, `${CNHL}cnhl-black-series-2200mah-14-8v-4s-40c-lipo-battery-with-xt60-plug`),
    ],
    pack: '4s2200',
    source: ['docs/WING-STAGE1.md'],
  },
];

/* The GWS Slow Stick, sold without power; GWS's guide lists its geared can
 * motors and the brushless 2212 and 2215. Stock is the classic EPS-300C D
 * on the EP1180 (GWS's 7.2 V row). The alternatives are GWS's own full
 * throttle rows, rpm at the prop included. 2S packs are 1300 to 2200 in
 * the guide; their masses are two thirds of Spektrum's 3S (derived). The
 * pack or the wing slides to the 100 mm CG. */
const SLOW_2S = [
  lipo('2s1300', 2, 1300, 74, `${HH}SPMX133S30.html`),
  lipo('2s2200', 2, 2200, 150, `${HH}SPMX223S30.html`),
];
const SLOW_3S = [
  lipo('3s1300', 3, 1300, 111, `${HH}SPMX133S30.html`),
  lipo('3s2200', 3, 2200, 225, `${HH}SPMX223S30.html`),
];
const SLOWSTICK = [
  {
    id: 'stock', name: 'power.slowstick.stock', kind: 'electric', voice: 'wing',
    kv: 0, propIn: 11, pitchIn: 8, blades: 2,
    thrustN: 2.69, currentA: 6.1, rpmNoLoad: 3882, pitchSpeedMs: 11.18, lvcV: 2.7,
    massKg: 0.42, cgShiftM: 0, packs: SLOW_2S.slice(0, 1), pack: '2s1300',
    source: ['http://www.gwsus.com/english/product/powersystem/004.htm', 'http://www.gwsus.com/english/product/speedcontroller/009.htm', GWS_GUIDE],
  },
  {
    id: '2212-1047', name: 'power.slowstick.2212_1047', kind: 'electric', voice: 'wing',
    kv: 1030, propIn: 10, pitchIn: 4.7, blades: 2,
    ...electric({ kv: 1030, cells: 2, pitchIn: 4.7, thrustG: 454, currentA: 9.2, rpm: 4900 }),
    lvcV: 3.0, massKg: 0.42 - 0.006, cgShiftM: 0, packs: SLOW_2S, pack: '2s1300',
    source: [GWS_2212, GWS_GUIDE],
  },
  {
    id: '2212-1060', name: 'power.slowstick.2212_1060', kind: 'electric', voice: 'wing',
    kv: 1030, propIn: 10, pitchIn: 6, blades: 2,
    ...electric({ kv: 1030, cells: 2, pitchIn: 6, thrustG: 419, currentA: 7.8, rpm: 5500 }),
    lvcV: 3.0, massKg: 0.42 - 0.006, cgShiftM: 0, packs: SLOW_2S, pack: '2s1300',
    source: [GWS_2212, GWS_GUIDE],
  },
  {
    id: '2215-1060-3s', name: 'power.slowstick.2215_1060_3s', kind: 'electric', voice: 'wing',
    kv: 900, propIn: 10, pitchIn: 6, blades: 2,
    ...electric({ kv: 900, cells: 3, pitchIn: 6, thrustG: 620, currentA: 9.6, rpm: 6836.8 }),
    lvcV: 3.0, massKg: 0.42 + 0.002 + (0.111 - 0.074), cgShiftM: 0, packs: SLOW_3S, pack: '3s1300',
    source: ['http://www.gwsus.com/english/product/motor/009.htm', GWS_GUIDE],
  },
];

/* The Buzzard Bombshell: the Cox Texaco .049 on a 7 x 3.5 with Cox's
 * throttle conversion (docs/BOMBSHELL-STAGE1.md), its receiver pack a 3S
 * 850 that nothing drains. Tanks: the Texaco's integral 8.4 cc and SAM's
 * 1/2A Texaco allotment, 5.1 cc (the Texaco Jr.'s). BMJR's own RTF
 * weights: 19.75 oz on the Texaco, 21.85 oz electric on the same pack. */
const BOMBSHELL_TANKS = [
  tank('8.4cc', 8.4, 8.4e-6, 8.4 * FUEL_G_CC, COX_TEXACO),
  tank('5.1cc', 5.1, 5.1e-6, 5.1 * FUEL_G_CC, SAM_RULES),
];
const BOMBSHELL = [
  {
    id: 'stock', name: 'power.bombshell.stock', kind: 'glow', voice: 'glow2',
    propIn: 7, pitchIn: 3.5, blades: 2,
    thrustN: 2.824, rpmNoLoad: 11000, pitchSpeedMs: 13.85, idle: 0.40,
    flowFullM3s: 1.84e-6 / 60, leanFrac: 0.05, leanGain: 0.05,
    massKg: 0.5599, cgShiftM: 0, packs: BOMBSHELL_TANKS, pack: '8.4cc',
    source: [BMJR, COX_TEXACO, MENON],
  },
  {
    /* Cox's own RC .049 with its rear throttle, Fly RC's measured 18,000
     * rpm on a 5 x 3 and 6,800 idle; thrust off APC's 5 x 3 at that rpm
     * (scripts/power-derive.js); its full throttle flow Menon's 2.11 cc/min
     * at 17,000. Its mass is unpublished beside the Texaco's; taken equal. */
    id: 'cox-rc', name: 'power.bombshell.cox_rc', kind: 'glow', voice: 'glow2',
    propIn: 5, pitchIn: 3, blades: 2,
    thrustN: 3.572, rpmNoLoad: 18000 / 0.85, pitchSpeedMs: (18000 * 3 * IN) / 60, idle: 6800 / 18000,
    flowFullM3s: 2.11e-6 / 60, leanFrac: 0.05, leanGain: 0.05,
    massKg: 0.5599, cgShiftM: 0, packs: BOMBSHELL_TANKS, pack: '8.4cc',
    source: [COX_REVIEW, `${APC}5x3.dat`, MENON],
  },
  {
    /* BMJR's sport electric: the Himax HC2816-1220 (BMJR's "HiMaxx
     * 2016-1220" is not a Himax part) on 3S 850, prop unpublished, APC 8 x
     * 4E the smallest in Himax's range; the operating point from Himax's
     * kV, Rm and Io and APC's data (scripts/power-derive.js). */
    id: 'electric', name: 'power.bombshell.electric', kind: 'electric', voice: 'wing',
    kv: 1220, propIn: 8, pitchIn: 4, blades: 2,
    thrustN: 10.039, currentA: 17.05, rpmNoLoad: 12335 / 0.85, pitchSpeedMs: (12335 * 4 * IN) / 60, lvcV: 3.0,
    massKg: (21.85 * 28.349523125) / 1000, cgShiftM: 0,
    packs: [lipo('3s850', 3, 850, null, BMJR)],
    pack: '3s850',
    source: [BMJR, HIMAX_2816, `${APC}8x4E.dat`],
  },
];

/* The Kadet Senior: the O.S. FS-52S Surpass four stroke on a 12 x 6 at the
 * measured 9,500 rpm (docs/KADET-STAGE1.md). SIG's kit takes .35 to .65
 * four strokes and a 12 oz tank; the manual's photos use a DuBro 8 oz.
 * The flying weight is taken with a full tank. */
const KADET_TANKS = [
  tank('355cc', 355, 355.0e-6, 355 * FUEL_G_CC, SIG_KIT),
  tank('237cc', 237, 237.0e-6, 237 * FUEL_G_CC, 'https://cdn.shopify.com/s/files/1/2281/6393/files/sigrc58kadetsenior.pdf'),
];
const KADET = [
  {
    id: 'stock', name: 'power.kadet.stock', kind: 'glow', voice: 'glow4',
    propIn: 12, pitchIn: 6, blades: 2,
    thrustN: 27.83, rpmNoLoad: 11176, pitchSpeedMs: 24.13, idle: 0.2421,
    flowFullM3s: 18.3e-6 / 60, leanFrac: 0.05, leanGain: 0.05,
    massKg: 2.7216, cgShiftM: 0, packs: KADET_TANKS, pack: '355cc',
    source: [SIG_KIT, OS_56_MANUAL, MENON],
  },
  {
    /* O.S.'s successor on the same mounts, 1.0 ps at 10,000 against the
     * FS-52S's 0.9 bhp, on the same 12 x 6: 9,794 rpm and 29.64 N
     * (scripts/power-derive.js). 419 g against 434 g. O.S.'s 220 cc for
     * 12 minutes is its own flow. */
    id: 'fsa56', name: 'power.kadet.fsa56', kind: 'glow', voice: 'glow4',
    propIn: 12, pitchIn: 6, blades: 2,
    thrustN: 29.64, rpmNoLoad: 9794 / 0.85, pitchSpeedMs: (9794 * 6 * IN) / 60, idle: 2400 / 9794,
    flowFullM3s: 18.3e-6 / 60, leanFrac: 0.05, leanGain: 0.05,
    massKg: 2.7216 - 0.015, cgShiftM: 0, packs: KADET_TANKS, pack: '355cc',
    source: [OS_56, OS_56_MANUAL, `${APC}12x6.dat`],
  },
  {
    /* The top of SIG's range: 1.14 ps at 11,000, on its sport 13 x 6,
     * 9,777 rpm and 34.22 N; its flow the FSa-56II's scaled by the rated
     * power (derived). 442 g. */
    id: 'fs64', name: 'power.kadet.fs64', kind: 'glow', voice: 'glow4',
    propIn: 13, pitchIn: 6, blades: 2,
    thrustN: 34.217, rpmNoLoad: 9777 / 0.85, pitchSpeedMs: (9777 * 6 * IN) / 60, idle: 2400 / 9777,
    flowFullM3s: (18.3e-6 / 60) * (838.5 / 735.5), leanFrac: 0.05, leanGain: 0.05,
    massKg: 2.7216 + 0.008, cgShiftM: 0, packs: KADET_TANKS, pack: '355cc',
    source: [OS_64, `${APC}13x6.dat`],
  },
  {
    /* SIG's electric, from its Kadet Senior Sport ARF manual: the Himax
     * HC5018-530 on 5S 5000, 8 to 10 minutes; on APC's 13 x 8E, the
     * smallest prop on Himax's chart: 9,146 rpm, 34.36 N, 37.7 A
     * (scripts/power-derive.js). Mass: the engine (434 g) and a full tank
     * (311 g) out, the motor (275 g) and a 5S 5000 (657 g, between CNHL's
     * 4S and 6S 5000) in; the ESC's is unpublished and left out. */
    id: 'electric', name: 'power.kadet.electric', kind: 'electric', voice: 'wing',
    kv: 530, propIn: 13, pitchIn: 8, blades: 2,
    thrustN: 34.359, currentA: 37.69, rpmNoLoad: 9146 / 0.85, pitchSpeedMs: (9146 * 8 * IN) / 60, lvcV: 3.0,
    massKg: 2.7216 - 0.434 - 355 * FUEL_G_CC / 1000 + 0.275 + 0.657, cgShiftM: 0,
    packs: [lipo('5s5000', 5, 5000, 657, `${CNHL}cnhl-5000mah-14-8v-4s-40c-lipo-battery-with-xt90-plug`)],
    pack: '5s5000',
    source: [SIG_ARF, HIMAX_5018, `${APC}13x8E.dat`],
  },
];

/* FMS's P-51D 1450, docs/P51-STAGE1.md: the 4250 540 kV on the 14 x 8
 * four blade and an 80 A ESC, FMS's one listing, on the 4S 2600 it
 * recommends (Dynam's 4S 2600 25C, 295 g, for the mass). The alternative
 * is the owners' upgrade, FMS's 4258 650 kV from the 1400 mm P-40 on the
 * same prop, which wants a bigger ESC (78 A static against the 80 A's
 * rating); its figures are scripts/p51-derive.js's motor balance,
 * ESTIMATED as the stock's are, and it is 45 g heavier. */
const P51_4S = [lipo('4s2600', 4, 2600, 295, 'https://www.dynamrc.com/products/14-8v-2600mah-25c-lipo-battery')];
const P51 = [
  {
    id: 'stock', name: 'power.p51.stock', kind: 'electric', voice: 'wing',
    kv: 540, propIn: 14, pitchIn: 8, blades: 4,
    thrustN: 30.7, currentA: 55.2, rpmNoLoad: 7992, pitchSpeedMs: 23.006, lvcV: 3.4,
    massKg: 2.35, cgShiftM: 0, packs: P51_4S, pack: '4s2600',
    source: [FMS_P51, FMS_P51_MANUAL],
  },
  {
    id: 'kv650', name: 'power.p51.kv650', kind: 'electric', voice: 'wing',
    kv: 650, propIn: 14, pitchIn: 8, blades: 4,
    thrustN: 36.50, currentA: 78.3, rpmNoLoad: 9620, pitchSpeedMs: 27.693, lvcV: 3.4,
    massKg: 2.35 + 0.045, cgShiftM: 0, packs: P51_4S, pack: '4s2600',
    source: [P51_UPGRADE, 'https://www.fmshobby.com/products/4258-kv650-motor'],
  },
];

/* Freewing's F-16 V3 70 mm EDF, docs/F16-STAGE1.md: the 70 mm twelve
 * blade fan on its 2957 2210 kV inrunner and an 80 A ESC, 6S 3500 to 4500
 * (Freewing's page and the V3 manual: 2,400 g of thrust); the fan unit's
 * listing gives 70 A at 22.2 V. The plant's pitch speed for a fan is its
 * zero thrust speed, NASA's 1.603 n D (f16:derive). Freewing's own 4S
 * Standard flies the same fan on a 2849 2850 kV outrunner and a 60 A ESC at
 * 1,800 g and "a maximum speed of 78mph": that speed on this fan and drag
 * is the fan at 0.767 of the 6S's speed (f16:derive), so its thrust, zero
 * thrust speed and current follow the fan's laws, the speed squared, the
 * speed, and the speed cubed at two thirds the voltage: 47 A, inside its
 * 60 A ESC. The packs are Motion RC's Admiral, which Freewing's dealer
 * sells for it; the pack slides to the manual's 90 mm CG. */
const F16_6S = [
  lipo('6s4000', 6, 4000, 566, `${ADMIRAL}admiral-4000mah-6s-22-2v-40c-lipo-battery-with-ec5-connector-epr40006e`),
  lipo('6s4500', 6, 4500, 652, `${ADMIRAL}admiral-4500mah-6s-22-2v-40c-lipo-battery-with-ec5-connector-epr45006e`),
];
const F16_4S_R = 0.7667;
const F16_FAN = { tauS: 0.08, escStartS: 0.3 };
const F16 = [
  {
    id: 'stock', name: 'power.f16.stock', kind: 'electric', voice: 'edf',
    kv: 2210, propIn: 69 / 25.4, pitchIn: 0, blades: 12,
    thrustN: 23.536, currentA: 70.0, rpmNoLoad: 49062, pitchSpeedMs: 76.87, lvcV: 3.15,
    fan: F16_FAN,
    massKg: 2.116, cgShiftM: 0, packs: F16_6S, pack: '6s4000',
    source: [FREEWING_F16, FREEWING_F16_MANUAL, FREEWING_FAN, NASA_EDF],
  },
  {
    id: '4s', name: 'power.f16.4s', kind: 'electric', voice: 'edf',
    kv: 2850, propIn: 69 / 25.4, pitchIn: 0, blades: 12,
    thrustN: 23.536 * F16_4S_R * F16_4S_R, currentA: 70.0 * F16_4S_R * F16_4S_R * F16_4S_R * (22.2 / 14.8),
    rpmNoLoad: 49062 * F16_4S_R, pitchSpeedMs: 76.87 * F16_4S_R, lvcV: 3.15,
    fan: F16_FAN,
    massKg: 1.800, cgShiftM: 0,
    packs: [lipo('4s4000', 4, 4000, 386, `${ADMIRAL}admiral-4000mah-4s-14-8v-40c-lipo-battery-with-xt60-connector-multi-pack-2-batteries-adm6024-002`)],
    pack: '4s4000',
    source: [FREEWING_F16_4S, FREEWING_FAN, NASA_EDF],
  },
];

/* The Zagi HP, docs/ZAGI-STAGE1.md: Zagi's own power pack, its 3100 kV
 * 28 x 35 inrunner on a 5 x 5 carbon prop and a 35 to 40 A ESC, "over
 * 22,000 rpm at only 30 amps in static testing", on Zagi's 3S 2200 30C
 * (no mass published: CNHL's 3S 2200 30C, the Radian's, stands in). The
 * manual balances each size of pack by moving it in the bay, so the
 * smaller packs the Radian offers fit and shift nothing. */
const ZAGI = [
  {
    id: 'stock', name: 'power.zagi.stock', kind: 'electric', voice: 'wing',
    kv: 3100, propIn: 5, pitchIn: 5, blades: 2,
    thrustN: 7.295, currentA: 30.0, rpmNoLoad: 25882, pitchSpeedMs: 46.567, lvcV: 3.0,
    massKg: 0.7229, cgShiftM: 0,
    packs: [
      lipo('3s1300', 3, 1300, 113, `${CNHL}cnhl-black-series-1300mah-11-1v-3s-130c-lipo-battery-with-xt60-plug`),
      lipo('3s1500', 3, 1500, 125, `${CNHL}cnhl-black-series-v2-0-1500mah-11-1v-3s-130c-lipo-battery-with-xt60-plug`),
      lipo('3s2200', 3, 2200, 180, `${CNHL}cnhl-black-series-2200mah-3s-11-1v-30c-lipo-battery-with-ec3-plug`),
    ],
    pack: '3s2200',
    source: [ZAGI_MOTOR, ZAGI_PACK, ZAGI_HP_MANUAL],
  },
];

/* The Ugly Stik: the O.S. 61FX two stroke on a 12 x 6 at 10,895 rpm, its
 * torque from an owner's tachometer and APC's data (docs/UGLYSTIK-
 * STAGE1.md). RCM's kit takes .40 to .61 engines and a 12 oz tank; the
 * flying weight is RCM's 96 oz ready to fly, taken with the tank full. */
const STIK_TANKS = [
  tank('355cc', 355, 355.0e-6, 355 * FUEL_G_CC, RCM_STIK),
];
const STIK = [
  {
    id: 'stock', name: 'power.uglystik.stock', kind: 'glow', voice: 'glow2',
    propIn: 12, pitchIn: 6, blades: 2,
    thrustN: 36.206, rpmNoLoad: 12817.6, pitchSpeedMs: 27.673, idle: 0.1836,
    flowFullM3s: 27.4e-6 / 60, leanFrac: 0.05, leanGain: 0.05,
    massKg: 2.7216, cgShiftM: 0, packs: STIK_TANKS, pack: '355cc',
    source: [RCM_STIK, OS_FX_MANUAL, RCU_61FX, `${APC}12x6.dat`, MENON],
  },
  {
    /* The bottom of RCM's range: O.S.'s 46FX, 1.62 ps at 16,000 against
     * the 61FX's 1.9, on the 11 x 6 in its list: 11,591 rpm and 30.51 N
     * (scripts/power-derive.js). 375 g against 550 g, the pack moved to
     * balance it on the same mark; its flow the 61FX's scaled by the
     * displacement, 7.45 over 9.95 cc. Its idle O.S.'s 2,500 rpm. */
    id: 'fx46', name: 'power.uglystik.fx46', kind: 'glow', voice: 'glow2',
    propIn: 11, pitchIn: 6, blades: 2,
    thrustN: 30.506, rpmNoLoad: 11591 / 0.85, pitchSpeedMs: (11591 * 6 * IN) / 60, idle: 2500 / 11591,
    flowFullM3s: (27.4e-6 / 60) * (7.45 / 9.95), leanFrac: 0.05, leanGain: 0.05,
    massKg: 2.7216 - 0.175, cgShiftM: 0, packs: STIK_TANKS, pack: '355cc',
    source: [OS_FX_MANUAL, `${APC}11x6.dat`],
  },
];

/* The Tiger Moth: the O.S. 61FX two stroke on a 12 x 6, the first engine in
 * Great Planes' list and the Ugly Stik's, at the Stik's 10,895 rpm and
 * 36.206 N (docs/TIGERMOTH-STAGE1.md). Great Planes give no tank size; the
 * Stik's 12 oz is taken, ESTIMATED. The flying weight is the kit's 10.25
 * lb, taken with the tank full. */
const TIGER_TANKS = [
  tank('355cc', 355, 355.0e-6, 355 * FUEL_G_CC, GP_TIGER),
];
const TIGER = [
  {
    id: 'stock', name: 'power.tigermoth.stock', kind: 'glow', voice: 'glow2',
    propIn: 12, pitchIn: 6, blades: 2,
    thrustN: 36.206, rpmNoLoad: 12817.6, pitchSpeedMs: 27.673, idle: 0.1836,
    flowFullM3s: 27.4e-6 / 60, leanFrac: 0.05, leanGain: 0.05,
    massKg: 4.6493, cgShiftM: 0, packs: TIGER_TANKS, pack: '355cc',
    source: [GP_TIGER, OS_FX_MANUAL, RCU_61FX, `${APC}12x6.dat`, MENON],
  },
  {
    /* The four stroke in Great Planes' list: O.S.'s FS-91 II Surpass, 1.6
     * bhp at 11,000 rpm against the 61FX's 1.9 ps (O.S.'s manual), on the
     * 14 x 7 in O.S.'s list for it: 8,174 rpm and 36.17 N
     * (scripts/power-derive.js). 640 g against 550 g, the radio moved to
     * balance it on the same mark; its flow the Kadet's FSa-56II's scaled
     * by the rated power, 1193 over 735.5 W. Its idle O.S.'s 2,000 rpm. */
    id: 'fs91', name: 'power.tigermoth.fs91', kind: 'glow', voice: 'glow4',
    propIn: 14, pitchIn: 7, blades: 2,
    thrustN: 36.169, rpmNoLoad: 8174 / 0.85, pitchSpeedMs: (8174 * 7 * IN) / 60, idle: 2000 / 8174,
    flowFullM3s: (18.3e-6 / 60) * (1193 / 735.5), leanFrac: 0.05, leanGain: 0.05,
    massKg: 4.6493 + 0.090, cgShiftM: 0, packs: TIGER_TANKS, pack: '355cc',
    source: [GP_TIGER, OS_FS91, `${APC}14x7.dat`],
  },
];

export const POWER = {
  wing1000: WING,
  sky1800: SKY,
  cub1400: CUB,
  cub1400f: CUB,
  radian2000: RADIAN,
  bramor2300: BRAMOR,
  slowstick1180: SLOWSTICK,
  timber1500: TIMBER,
  timber1500f: TIMBER,
  bombshell1118: BOMBSHELL,
  kadet1981: KADET,
  uglystik1567: STIK,
  tigermoth1803: TIGER,
  f16878: F16,
  p51d1450: P51,
  zagi1219: ZAGI,
};

/* ------------------------------------------------------------------ */

function optionsOf(airframeId) {
  return POWER[airframeId] || null;
}

export function powerOption(airframeId, optionId) {
  const list = optionsOf(airframeId);
  if (!list) {
    return null;
  }
  return list.find((o) => o.id === optionId) || list[0];
}

function packOf(option, packId) {
  return option.packs.find((p) => p.id === packId) || option.packs.find((p) => p.id === option.pack);
}

/* Whether the pilot chooses this airframe's power system at all: a fixed
 * wing's here, a quad's motors in configs/motors.js. */
export function choosesPower(airframeId) {
  return Boolean(optionsOf(airframeId)) || hasMotors(airframeId);
}

/* The pilot's choice for one airframe, valid: stock where anything is
 * missing or unknown. A quad's is its motor, prop and pack
 * (configs/motors.js). */
export function powerChoice(airframeId, stored) {
  if (hasMotors(airframeId)) {
    return motorChoice(airframeId, stored);
  }
  const list = optionsOf(airframeId);
  if (!list) {
    return { option: null, pack: null };
  }
  const want = stored && typeof stored === 'object' ? stored[airframeId] : null;
  const option = powerOption(airframeId, want && want.option);
  const pack = packOf(option, want && want.pack);
  return { option: option.id, pack: pack.id };
}

/* A stored settings.power map, validated: only airframes that have
 * options, each with an option and pack it offers. */
export function normalizePower(stored) {
  const out = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return out;
  }
  for (const id of [...Object.keys(POWER), ...Object.keys(MOTORS)]) {
    if (stored[id] && typeof stored[id] === 'object') {
      out[id] = powerChoice(id, stored);
    }
  }
  return out;
}

export function powerCells(airframeId, optionId, packId) {
  const option = powerOption(airframeId, optionId);
  const pack = packOf(option, packId);
  return option.kind === 'electric' ? pack.cells : TABLE[airframeId].cells;
}

/*
 * The sim_set_power block for a choice, SI throughout.
 *
 * Mass: an option's massKg is the all up mass it flies at on its default
 * pack or tank; the table's mass moves by the option's over the stock
 * option's, and by the pack's over the option's default pack (a float
 * variant keeps its floats). For the stock option on its default pack both
 * are exact zeros. The pack's internal resistance is the table's scaled by
 * the stock pack's capacity over this one's: the same cells in a bigger
 * pack are more of them in parallel. A glow engine's pack is the table's
 * receiver pack, which nothing drains.
 */
export function powerBlock(airframeId, optionId, packId) {
  const list = optionsOf(airframeId);
  if (!list) {
    return null;
  }
  const stock = list[0];
  const option = powerOption(airframeId, optionId);
  const pack = packOf(option, packId);
  const def = packOf(option, option.pack);
  const t = TABLE[airframeId];
  const out = new Float64Array(SIM_POWER_DOUBLES);
  const glow = option.kind === 'glow';
  const packDelta = pack === def ? 0 : pack.massKg - def.massKg;
  out[SIM_POWER.KIND] = glow ? 1 : 0;
  out[SIM_POWER.MASS] = t.massKg + (option.massKg - stock.massKg) + packDelta;
  out[SIM_POWER.CG_SHIFT] = option.cgShiftM;
  out[SIM_POWER.THRUST] = option.thrustN;
  out[SIM_POWER.PITCH_SPEED] = option.pitchSpeedMs;
  out[SIM_POWER.RPM] = option.rpmNoLoad;
  if (glow) {
    out[SIM_POWER.CELLS] = t.cells;
    out[SIM_POWER.R_CELL] = t.rCell;
    out[SIM_POWER.PACK_C] = 0;
    out[SIM_POWER.CURRENT] = 0;
    out[SIM_POWER.IDLE] = option.idle;
    out[SIM_POWER.TANK] = pack.m3;
    out[SIM_POWER.FLOW_FULL] = option.flowFullM3s;
    out[SIM_POWER.FLOW_IDLE] = option.idle * option.flowFullM3s;
    out[SIM_POWER.LEAN_FRAC] = option.leanFrac;
    out[SIM_POWER.LEAN_GAIN] = option.leanGain;
    out[SIM_POWER.LVC] = 0;
  } else {
    const stockPack = packOf(stock, stock.pack);
    const refMah = stock.kind === 'electric' ? stockPack.mAh : pack.mAh;
    const refR = stock.kind === 'electric' ? t.rCell : ELECTRIC_R_CELL_3200 * (3200 / pack.mAh);
    out[SIM_POWER.CELLS] = pack.cells;
    out[SIM_POWER.R_CELL] = stock.kind === 'electric' ? refR * (refMah / pack.mAh) : refR;
    out[SIM_POWER.PACK_C] = pack.mAh * 3.6;
    out[SIM_POWER.CURRENT] = option.currentA;
    out[SIM_POWER.IDLE] = 0;
    out[SIM_POWER.LVC] = option.lvcV;
  }
  return out;
}

/* An electric conversion of a glow aircraft has no table pack to scale
 * from: it takes the Timber's, 8 mOhm a cell at 3200 mAh, the same class
 * of 30C sport pack, by capacity. */
const ELECTRIC_R_CELL_3200 = 0.008;

/* powerBlock, or null for the stock option on its stock pack, which the
 * plant's own table already is: the shell clears rather than sets it. */
export function powerParams(airframeId, optionId, packId) {
  const list = optionsOf(airframeId);
  if (!list) {
    return null;
  }
  const stock = list[0];
  const option = powerOption(airframeId, optionId);
  if (option === stock && packOf(option, packId) === packOf(stock, stock.pack)) {
    return null;
  }
  return powerBlock(airframeId, optionId, packId);
}
