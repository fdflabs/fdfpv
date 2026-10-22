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

import { MOTORS, hasMotors, motorChoice } from './motors.js';
import { AIRCRAFT } from './aircraft.js';

/* sim_abi.h's SIM_POWER_* layout. */
export const SIM_POWER = {
  KIND: 0, MASS: 1, CG_SHIFT: 2, CELLS: 3, R_CELL: 4, PACK_C: 5, THRUST: 6, PITCH_SPEED: 7,
  RPM: 8, CURRENT: 9, IDLE: 10, TANK: 11, FLOW_FULL: 12, FLOW_IDLE: 13, LEAN_FRAC: 14,
  LEAN_GAIN: 15, LVC: 16,
};
export const SIM_POWER_DOUBLES = 17;

/* A LiPo pack. A null mass is an unpublished one, allowed only on an
 * option's only pack. */
function lipo(id, cells, mAh, grams, source) {
  return { id, cells, mAh, massKg: grams == null ? null : grams / 1000, source };
}

const CNHL = 'https://chinahobbyline.com/products/';

/* Each aircraft's row is its folder's power.table (aircraft/<id>/aircraft.js);
 * wing1000, retired, has no folder and keeps its row here. */
export const TABLE = {
  wing1000: { simId: 2, massKg: 0.65, cells: 4, rCell: 0.012, propIn: 6, cruiseMs: 15, flightTime: null },
  bramor2300: AIRCRAFT.TABLE.bramor2300,
};

/* The Bramor C4EYE: C-Astral publishes neither motor nor pack, only 3 h on
 * LiPo. The 6S 10000 is derived from that endurance on this plant
 * (docs/POWER-STAGE1.md) and its mass is inside the published 4.5 kg.
 * Stock stays the published aircraft; the one alternative is an uprate
 * the owner asked for, to make it more forgiving. */
const BRAMOR_6S = [lipo('6s10000', 6, 10000, null, 'https://www.c-astral.com/en/unmanned-systems/bramor-c4eye')];
/* ESTIMATED, no maker's figure: a 500 kV motor of the stock one's size on
 * the same 12 x 8 and 6S pack. The prop's coefficients are unchanged, so
 * with speed in proportion to kV the static thrust goes with its square,
 * (500/470)^2 = 1.132, the pitch speed with it, and the full throttle
 * current with its cube at the same voltage, (500/470)^3 = 1.204, about
 * 1.2 kW. A heavier stator and a bigger ESC add 40 g at the motor, 0.35 m
 * behind the CG: 0.040 * 0.35 / 4.54 is 3.1 mm aft. */
const BRAMOR_KV_UP = 500 / 470;
const BRAMOR = [
  {
    id: 'stock', name: 'power.bramor.stock', kind: 'electric', voice: 'wing',
    kv: 470, propIn: 12, pitchIn: 8, blades: 2,
    thrustN: 22.9, currentA: 19.08, rpmNoLoad: 10434, pitchSpeedMs: 30.036, lvcV: 0,
    massKg: 4.5, cgShiftM: 0,
    packs: BRAMOR_6S,
    pack: '6s10000',
    source: ['https://www.c-astral.com/en/unmanned-systems/bramor-c4eye', 'https://www.c-astral.com/media/uploads/fm/catalogue/c-astral_katalog2019-spread.pdf'],
  },
  {
    id: '500kv', name: 'power.bramor.500kv', kind: 'electric', voice: 'wing',
    kv: 500, propIn: 12, pitchIn: 8, blades: 2,
    thrustN: 22.9 * BRAMOR_KV_UP * BRAMOR_KV_UP, currentA: 19.08 * BRAMOR_KV_UP * BRAMOR_KV_UP * BRAMOR_KV_UP,
    rpmNoLoad: 10434 * BRAMOR_KV_UP, pitchSpeedMs: 30.036 * BRAMOR_KV_UP, lvcV: 0,
    massKg: 4.54, cgShiftM: -(0.040 * 0.35) / 4.54,
    packs: BRAMOR_6S,
    pack: '6s10000',
    source: ['https://www.c-astral.com/en/unmanned-systems/bramor-c4eye'],
  },
];

/* The 1000 mm wing, kept in the module for its gates and board: a 2216
 * 1400 kV on a 6 x 4, 4S (docs/WING-STAGE1.md, unverified). */
const WING = [
  {
    id: 'stock', name: 'power.wing.stock', kind: 'electric', voice: 'wing',
    kv: 1400, propIn: 6, pitchIn: 4, blades: 2,
    thrustN: 11.5, currentA: 28.0, rpmNoLoad: 20720, pitchSpeedMs: 29.823, lvcV: 3.0,
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

export const POWER = {
  wing1000: WING,
  bramor2300: BRAMOR,
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
