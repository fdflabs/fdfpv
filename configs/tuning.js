/*
 * tuning.js: each plane's bench setup, the CG, the rates, the expo, the
 * trim and the flaps, and the one function that turns the pilot's setup
 * into the plant's sim_wing_set_tune block (src/native/sim_abi.h).
 *
 * THE CONTRACT, for the hangar's Tuning tab (src/ui/hangar-tuning.js) and
 * the shell (src/main.js):
 *
 *   TUNING[airframeId] is a fixed wing's data, below. The pilot's setup is
 *   settings.tuning[airframeId] = { packMm, ballastG, rate, expo: { a, e,
 *   r }, trimDeg, flapStart, flapMix }, every field optional, a missing
 *   one the stock value; normalizeTuning validates a stored map on load and
 *   drops whatever is the stock value, so an empty entry is the kit as it
 *   comes. tuneBlock(airframeId, entry, massKg, packKg) is the plant's
 *   block, or null for the stock setup, which the shell clears rather than
 *   sets, so a plane nobody tuned flies exactly the table it always flew.
 *
 * THE CG. A pack slides in its bay and a lump of lead goes on the firewall
 * or the tail post, as a pilot balances a real one. The pack moves the CG
 * by its mass times its slide over the all up mass; ballast by its mass
 * times its arm over the new all up mass. The plant takes the sum as the
 * power option's CG path takes its shift, and the ballast's mass and
 * inertia besides. `cg` is where the kit's maker puts the CG, from what
 * datum, and the range the maker allows where one is published. The
 * static margin (the CG's distance ahead of the neutral point over the
 * chord) is the one each aircraft's derivation gives at that CG, which
 * scripts/tuning-check.js measures off the plant; moving the CG forward by
 * d adds d over the chord to it.
 *
 * THE RATES. `high` is the plant's own throws, the ones every gate was
 * flown on, which for the Timber, the Cub and the Radian are the manuals'
 * high rates. `low` is the manual's low rate where it publishes one,
 * turned into degrees on the same control horn chords the high rate was
 * (the aircraft's docs/*-STAGE1.md); where the kit publishes one set of
 * throws or none, it is 70 percent of `high`, the low rate E-flite's
 * Timber and Radian and ParkZone's Radian Pro manuals all state
 * ("HIGH 100% LOW 70%", "Low rate is 70% of high rate travel"), and says
 * so. `mid` is halfway between, a three position switch's middle; no
 * manual here publishes one. Degrees are written out, not computed with
 * Math.asin, which is not specified to the bit.
 *
 * THE EXPO is the plant's cubic, x (1 - e) + x^3 e, the curve EdgeTX and
 * OpenTX call expo; 30 percent is every table's, one figure for all three
 * surfaces.
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

import { TABLE, powerBlock, powerOption } from './power.js';

/* sim_abi.h's SIM_TUNE_* layout. */
export const SIM_TUNE = {
  CG_SHIFT: 0, BALLAST_KG: 1, BALLAST_X: 2, THROW_A: 3, THROW_E: 4, THROW_R: 5,
  EXPO_A: 6, EXPO_E: 7, EXPO_R: 8, TRIM_E: 9, FLAP_MIX: 10,
};
export const SIM_TUNE_DOUBLES = 11;

/* The plant writes its throws as degrees * pi / 180, and so does this, so
 * the high rate is the very double the table holds. */
const EXTRA_MANUAL = 'https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL115500-Manual-EN.pdf';
const PI = 3.14159265358979323846;
const rad = (deg) => (deg * PI) / 180;

export const RATES = ['low', 'mid', 'high'];
export const STOCK_EXPO = 30;
/* How far a pack slides in its bay either way, mm: ESTIMATED, no kit
 * publishes it; the hook and loop trays of these kits leave about an inch
 * of room fore and aft. */
const BAY_MM = 25;
/* The most lead either end, as a share of the all up mass: ESTIMATED, a
 * trainer balanced with a few percent of its weight in nose lead is
 * common, and past eight the extra weight is the bigger problem. */
const BALLAST_SHARE = 0.08;
/* Under this static margin the aircraft is less stable than any kit here
 * is set up (the least are the wing's 0.069 and the Slow Stick's 0.073),
 * and the Tuning tab says so whatever range the maker publishes. */
export const MARGIN_WARN = 0.05;

/* The elevator trim's reach either way, degrees, in quarter degree
 * clicks, a radio's trim steps. */
export const TRIM_MAX_DEG = 4;

const TIMBER_MANUAL = 'https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dw442b6efc/Manuals/EFL105250-Manual-EN.pdf';
const CUB_MANUAL = 'https://www.horizonhobby.com/on/demandware.static/-/Sites-horizon-master/default/dwa89b2e9b/Manuals/FMM106P%20Piper%20J-3%20Cub%20wFloats%201400mm%20V4-Manual-EN%20(2).pdf';
const RADIAN_MANUAL = 'https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/EFL4750-Manual-EN.pdf';
const RADIAN_PRO_MANUAL = 'https://www.horizonhobby.com/on/demandware.static/Sites-horizon-us-Site/Sites-horizon-master/default/Manuals/PKZ5480-Manual_EN.pdf';
const SLOWSTICK_MANUAL = 'http://www.store.gwsus.com/wp-content/uploads/download/manual/AirPlanes_Manual_GWSSLOWSTICK.pdf';
const KADET_KIT = 'https://sigmfg.com/products/kadet-senior-kit';
const KADET_MANUAL = 'https://cdn.shopify.com/s/files/1/2281/6393/files/sigrc58kadetsenior.pdf';
const NRJ_MANUAL = 'https://www.hyperflight.co.uk/extras/NRJ-EN-instructions-2019.pdf';
const F16_MANUAL = 'https://www.freewing-model.com/download/freewing-70mm-f-16-v3-70mm-manual.pdf';
const P51_MANUAL = 'https://cdn-files.myshopline.com/file/store/1772248208561/55c1d8443b5c438095f19ab8babfc3b0.pdf';
const ZAGI_HP_MANUAL = 'https://web.archive.org/web/20151216152823/http://www.zagi.com/pdf/Zagi-HP-w.pdf';
const SKY_PAGE = 'https://www.sonicmodell.com/product/skyhunter-1800mm-wingspan-epo-long-range-fpv-uav-platform-rc-airplane-kit-14.html';
const BOMBSHELL_PLAN = 'https://outerzone.co.uk/plan_details.asp?ID=2180';
const STIK_PLAN = 'https://outerzone.co.uk/plan_details.asp?ID=6801';
const TIGER_MANUAL = 'https://manuals.hobbico.com/gpm/gpma1330-manual-v1_2.pdf';
const LOW_70 = 'low: 70 percent of high, the low rate the Timber, Radian and Radian Pro manuals state';

/*
 * Per aircraft:
 *   chord      the plant's mean chord, m (plant_wing.c), the static
 *              margin's unit
 *   area       the plant's wing area, m^2, for the checks
 *   margin     the static margin at the maker's CG over `chord`, as
 *              scripts/tuning-check.js U2 measures it off the plant: the
 *              aircraft's doc's to within its rounding, except the
 *              Bramor's, whose doc gives 0.07 of its MAC and whose plant
 *              chord is S/b
 *   cg         { mm, datum, range: [fore, aft] mm or null, source }: the
 *              maker's CG, mm behind `datum` (a string key), null mm where
 *              no maker publishes one
 *   packKg     the stock pack's mass, kg, the drawn model's (src/native/
 *              crash_parts.h), for an option whose pack's mass is not
 *              published
 *   nose, tail where lead goes, m ahead of the CG (negative behind): the
 *              firewall or the nose, and the tail post, from the drawn
 *              model's parts (crash_parts.h)
 *   throws     { high: [a, e, r], low: [a, e, r] } degrees, and their
 *              sources; a 0 is a surface the aircraft does not have
 *   elevons    true for a flying wing, whose elevons are its elevator
 *   flaps      the Timber's: the manual's flap to elevator mix and the
 *              notches' angles, rad, both restated from plant_wing.c;
 *              null where there are none
 */
export const TUNING = {
  wing1000: {
    chord: 0.22, area: 0.22, margin: 0.069,
    cg: { mm: null, datum: 'tuning.datum.stock', range: null, source: 'no maker CG found for the Dart XL or the AR Wing 900; the plant\'s 7 percent static margin is ESTIMATED (docs/WING-STAGE1.md)' },
    packKg: 0.20, nose: 0.20, tail: -0.16, elevons: true,
    throws: { high: [25, 12, 0], low: [17.5, 8.4, 0], source: `high: the plant's, docs/WING-STAGE1.md; ${LOW_70}` },
    flaps: null,
  },
  sky1800: {
    chord: 0.20, area: 0.36, margin: 0.170,
    cg: { mm: 66.7, datum: 'tuning.datum.le', range: null, source: `Sonicmodell, "CG: 1/3 of wing from leading edge", no range; ${SKY_PAGE}` },
    packKg: 0.50, nose: 0.36, tail: -0.75,
    throws: { high: [15, 15, 25], low: [10.5, 10.5, 17.5], source: `high: ESTIMATED, no throws published (docs/SKYHUNTER-STAGE1.md); ${LOW_70}` },
    flaps: null,
  },
  cub1400: {
    chord: 0.20, area: 0.28, margin: 0.119,
    cg: { mm: 60, datum: 'tuning.datum.le', range: [55, 65], source: `FMS manual, "(55-65mm) from the leading edge of the main wing", p. 11; ${CUB_MANUAL}` },
    packKg: 0.19, nose: 0.20, tail: -0.54,
    throws: { high: [18, 15, 15], low: [13.4, 11.2, 11.6], source: `FMS manual p. 10: high 16, 16, 18 mm, low 12, 12, 14 mm, on 50, 60 and 70 mm horn chords; ${CUB_MANUAL}` },
    flaps: null,
  },
  radian2000: {
    /* -cm_alpha / cl_alpha, 1.304 / 5.709: 0.234 was read off the plant
     * past the linear lift, where its curve now rounds onto CL max. */
    chord: 0.1866, area: 0.355, margin: 0.228,
    cg: { mm: 63, datum: 'tuning.datum.root_le', range: null, source: `E-flite Radian manual, "2 1/2 inches (63mm) back from leading edge at the root", no range; ${RADIAN_MANUAL}` },
    packKg: 0.11, nose: 0.26, tail: -0.70,
    throws: { high: [15, 24.4, 30], low: [10.5, 18.0, 18.2], source: `E-flite Radian manual p. 3: elevator 12 and 9 mm, rudder 40 and 25 mm, dual rates 100/70 percent; the ailerons ESTIMATED (the Radian has none; the Radian Pro's are 15/12 mm high, 11/8 low, ${RADIAN_PRO_MANUAL}), their low at 70 percent; ${RADIAN_MANUAL}` },
    flaps: null,
  },
  bramor2300: {
    chord: 0.257, area: 0.591, margin: 0.088,
    cg: { mm: null, datum: 'tuning.datum.stock', range: null, source: 'C-Astral publishes no CG and no throws; the plant\'s 7 percent static margin is ESTIMATED (docs/BRAMOR-STAGE1.md)' },
    packKg: 1.30, nose: 0.39, tail: -0.35, elevons: true,
    throws: { high: [10, 6, 0], low: [7, 4.2, 0], source: `high: the plant's, docs/BRAMOR-STAGE1.md; ${LOW_70}` },
    flaps: null,
  },
  slowstick1180: {
    chord: 0.2776, area: 0.3264, margin: 0.073,
    cg: { mm: 100, datum: 'tuning.datum.le', range: [95, 105], source: `GWS manual, "95-105mm (3.74"-4.13") from the leading edge of wing at central wing chord"; ${SLOWSTICK_MANUAL}` },
    packKg: 0.10, nose: 0.286, tail: -0.50,
    throws: { high: [0, 15, 30], low: [0, 10.5, 21], source: `GWS manual: elevator 15 to 20 deg, rudder 25 to 35 deg, "Maximum control throws", one set; ${LOW_70}; ${SLOWSTICK_MANUAL}` },
    flaps: null,
  },
  timber1500: {
    chord: 0.2322, area: 0.361, margin: 0.191,
    cg: { mm: 60, datum: 'tuning.datum.root_le', range: [55, 65], source: `E-flite manual, "60mm +/-5mm back from the leading edge of the wing, measured at the wing root", pp. 3 and 13; ${TIMBER_MANUAL}` },
    packKg: 0.33, nose: 0.255, tail: -0.56,
    throws: { high: [30, 20, 27], low: [22.2, 14.9, 17.6], source: `E-flite manual pp. 3 and 14: high 33, 20, 30 mm, low 25, 15, 20 mm, on 64.8, 60 and 65 mm horn chords; ${TIMBER_MANUAL}` },
    flaps: { mix: -0.183531, angles: [0, 0.31376497222433070, 0.57058379792549596], source: `E-flite manual p. 3: half 20 mm, full 35 mm; "Flap/Down-Elevator Compensation 16% 30%"; ${TIMBER_MANUAL}` },
  },
  bombshell1118: {
    chord: 0.1905, area: 0.212903, margin: 0.287,
    cg: { mm: 62.9, datum: 'tuning.datum.le', range: [55.2, 81.9], source: `the plan's "BALANCE POINT RANGE" bracket, which carries no number, measured at 29 to 43 percent of the chord (docs/BOMBSHELL-STAGE1.md); ${BOMBSHELL_PLAN}` },
    packKg: 0.07, nose: 0.107, tail: -0.58,
    throws: { high: [0, 15, 20], low: [0, 10.5, 14], source: `high: ESTIMATED, no throws published (docs/BOMBSHELL-STAGE1.md); ${LOW_70}` },
    flaps: null,
  },
  kadet1981: {
    chord: 0.374487, area: 0.741934, margin: 0.268,
    cg: { mm: 98.4, datum: 'tuning.datum.spar', range: null, source: `SIG, "Center of Gravity 3 7/8 inch At Main Spar", no range (the kit manual: "shown on the plan"); ${KADET_KIT}` },
    packKg: 0.10, nose: 0.335, tail: -0.95,
    throws: { high: [0, 14.4775, 14.4775], low: [0, 10.1, 10.1], source: `SIG kit manual p. 24: elevator 3/4 in up and down, rudder 7/8 in each way, one set; ${LOW_70}; ${KADET_MANUAL}` },
    flaps: null,
  },
  uglystik1567: {
    chord: 0.3256, area: 0.51055, margin: 0.101,
    cg: { mm: 119.1, datum: 'tuning.datum.root_le', range: null, source: `RCM plan 939, its C.G. mark 4.69 in behind the leading edge, and Kraft's "It should balance approximately on the main spar", no range; ${STIK_PLAN}` },
    packKg: 0.10, nose: 0.2985, tail: -0.785,
    throws: { high: [12.5969, 12.9765, 14.6270], low: [8.8, 9.1, 10.2], source: `RCM plan 939's "Control Surface Travel Limits (measured at trailing edge)": ailerons 5/16 in up and 1/4 down on the 1.29 in strip aileron, their mean, elevator 3/8 in on its 1.67 in, rudder 1 in on its 3.96 in (docs/UGLYSTIK-STAGE1.md), one set; ${LOW_70}; ${STIK_PLAN}` },
    flaps: null,
  },
  tigermoth1803: {
    chord: 0.2683, area: 0.87742, margin: 0.038,
    cg: { mm: 70, datum: 'tuning.datum.bottom_le', range: [64, 76], source: `Great Planes manual p. 21, "measure back 2-3/4\" [70mm]" on the top of the bottom wing next to the fuselage, and "up to 2-1/2\" [64mm] back from the leading edge or 3\" [76mm]"; ${TIGER_MANUAL}` },
    packKg: 0.10, nose: 0.205, tail: -1.035,
    throws: { high: [16.5003, 12.1141, 14.5859], low: [10.91, 9.06, 14.59], source: `Great Planes manual p. 21, at the widest part of each surface: high rate ailerons 3/4 in, elevator 1 in and rudder 2 in each way, low rate 1/2, 3/4 and 2 in, on the 67 mm aileron, the 121 mm elevator and the 202 mm rudder (docs/TIGERMOTH-STAGE1.md); ${TIGER_MANUAL}` },
    flaps: null,
  },  extra3d1308: {
    chord: 0.2927, area: 0.369, margin: 0.154,
    cg: { mm: 95, datum: 'tuning.datum.root_le', range: [90, 100], source: `E-flite manual, "3.5 - 4.0 in (90 - 100 mm) from leading edge of wing at the fuselage", pp. 3 and 11; ${EXTRA_MANUAL}` },
    packKg: 0.27, nose: 0.26, tail: -0.83,
    throws: { high: [36.53, 39.67, 55.05], low: [20.92, 28.60, 35.00], source: `E-flite manual p. 3: high 50, 60 and 100 mm, low 30, 45 and 70 mm, at the surfaces' widest chords, 84, 94 and 122 mm (docs/EXTRA-STAGE1.md); ${EXTRA_MANUAL}` },
    flaps: null,
  },

  p51d1450: {
    chord: 0.24413793103448276, area: 0.354, margin: 0.034,
    cg: { mm: 110, datum: 'tuning.datum.root_le', range: null, source: `FMS manual, "110mm from the wing's leading edge (measured at point of contact with fuselage)", no range, p. 26; ${P51_MANUAL}` },
    packKg: 0.295, nose: 0.30, tail: -0.70,
    throws: { high: [19.8769, 25.8721, 12.1224], low: [13.9, 18.1, 8.5], source: `FMS manual pp. 19 and 20: the low rates, 17, 24 and 21 mm, which the manual says are for normal flying, on the 50, 55 and 100 mm surfaces (docs/P51-STAGE1.md), are the plant's; ${LOW_70}; ${P51_MANUAL}` },
    flaps: { mix: 0, angles: [0, 0.28510428711100527, 0.61297025535831962], source: `FMS manual p. 20: mid 22 mm, full 45 mm, no elevator mix given; ${P51_MANUAL}` },
  },
  nrj1490: {
    chord: 0.1378, area: 0.190, margin: 0.170,
    cg: { mm: 66, datum: 'tuning.datum.root_le', range: [64.5, 66.5], source: `OA Composites' manual, "CG between 64.5 and 66.5mm", 66 for the empty glider; ${NRJ_MANUAL}` },
    packKg: 0.015, nose: 0.23, tail: -0.66,
    throws: { high: [19.0, 17.5, 15.5], low: [13.3, 12.25, 10.85], source: `OA Composites' manual: ailerons 13 mm each way, elevator 8 to 10 mm, rudder 12 mm, on the 40, 30 and 45 mm surfaces at the horn (docs/DLG-STAGE1.md); no low rate is published, so it is 70 percent; ${NRJ_MANUAL}` },
    flaps: null,
  },
  f16878: {
    chord: 0.2856, area: 0.21484, margin: 0.115,
    cg: { mm: 90, datum: 'tuning.datum.root_le', range: null, source: `Freewing V3 manual p. 9, "90mm (3-1/2")" from the wing's leading edge at the root, no range; ${F16_MANUAL}` },
    packKg: 0.566, nose: 0.60, tail: -0.55,
    throws: { high: [21.5, 25, 30], low: [13.975, 20, 25.5], source: `high: the full size F-16's surface limits (NASA TP-1538), Freewing's high rate, 100 percent; low: the manual's own dual rates p. 11, "D/R Rate: 65%", "80%", "85%" of it; ${F16_MANUAL}` },
    flaps: null,
  },
  zagi1219: {
    chord: 0.21335338, area: 0.26012851, margin: 0.099,
    cg: { mm: 203.2, datum: 'tuning.datum.root_le', range: null, source: `Zagi HP manual, "designed to balance at 8" measured back from the nose", the "suggested starting point", moved back in 1/8 in steps "until it is almost unflyable (too elevator sensitive)", no range; ${ZAGI_HP_MANUAL}` },
    packKg: 0.185, nose: 0.19, tail: -0.10, elevons: true,
    throws: { high: [14.4775, 14.4775, 0], low: [10.1, 10.1, 0], source: `Zagi manuals: the elevon throw "3/8" in each direction measured 1" from the tip" on either stick, one set, on the 1.5 in elevon (docs/ZAGI-STAGE1.md); ${LOW_70}; ${ZAGI_HP_MANUAL}` },
    flaps: null,
  },
};
/* The float planes are their land planes', balanced back to the manual's
 * CG with nose weight as docs/FLOATS-STAGE1.md has it. */
TUNING.timber1500f = { ...TUNING.timber1500, float: true };
TUNING.cub1400f = { ...TUNING.cub1400, float: true };

export function tuningFor(airframeId) {
  return TUNING[airframeId] || null;
}

/* The stock setup's fields. */
export function stockEntry(airframeId) {
  const t = tuningFor(airframeId);
  const x = STOCK_EXPO;
  return {
    packMm: 0,
    ballastG: 0,
    rate: 'high',
    expo: { a: x, e: x, r: x },
    trimDeg: 0,
    flapStart: 0,
    flapMix: Boolean(t && t.flaps),
  };
}

/* The throws a rate gives, degrees [a, e, r]. */
export function throwsFor(airframeId, rate) {
  const t = tuningFor(airframeId).throws;
  if (rate === 'low') {
    return t.low.slice();
  }
  if (rate === 'mid') {
    return t.high.map((h, i) => (h + t.low[i]) / 2);
  }
  return t.high.slice();
}

/*
 * What the setup is balanced on, for a power choice { option, pack }
 * (configs/power.js powerChoice): the all up mass the plant flies at, the
 * pack that slides (the choice's where its mass is published, else the
 * drawn model's), whether there is one to slide, and the limits.
 */
export function setupFor(airframeId, choice) {
  const opt = powerOption(airframeId, choice && choice.option);
  /* No power system (the DLG): the table's own mass and its receiver
   * pack, fixed in the nose, so only lead balances it. */
  if (!opt) {
    const massKg = TABLE[airframeId].massKg;
    return { massKg, packKg: TUNING[airframeId].packKg, electric: false, limits: limitsFor(airframeId, massKg, false) };
  }
  const packId = (choice && choice.pack) || opt.pack;
  const massKg = powerBlock(airframeId, opt.id, packId)[1];
  const electric = opt.kind === 'electric';
  const p = opt.packs.find((x) => x.id === packId);
  const packKg = electric && p && p.massKg != null ? p.massKg : TUNING[airframeId].packKg;
  return { massKg, packKg, electric, limits: limitsFor(airframeId, massKg, electric) };
}

/* The limits the controls move within: the pack's slide, mm, and the
 * lead, g, each way. */
export function limitsFor(airframeId, massKg, electric) {
  const lead = Math.max(5, Math.round((BALLAST_SHARE * massKg * 1000) / 5) * 5);
  return { packMm: electric ? BAY_MM : 0, ballastG: lead };
}

const clampTo = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const num = (x) => typeof x === 'number' && Number.isFinite(x);

/*
 * One stored entry made valid against the aircraft: numbers clamped to
 * their limits and snapped to their steps, unknown fields and fields at
 * their stock value dropped. Null when nothing is left.
 */
export function normalizeEntry(airframeId, raw, limits) {
  const t = tuningFor(airframeId);
  if (!t || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const stock = stockEntry(airframeId);
  const out = {};
  if (num(raw.packMm) && limits.packMm > 0) {
    const v = Math.round(clampTo(raw.packMm, -limits.packMm, limits.packMm));
    if (v !== 0) {
      out.packMm = v;
    }
  }
  if (num(raw.ballastG)) {
    const v = Math.round(clampTo(raw.ballastG, -limits.ballastG, limits.ballastG) / 5) * 5;
    if (v !== 0) {
      out.ballastG = v;
    }
  }
  if (RATES.includes(raw.rate) && raw.rate !== stock.rate) {
    out.rate = raw.rate;
  }
  if (raw.expo && typeof raw.expo === 'object') {
    const expo = {};
    for (const k of ['a', 'e', 'r']) {
      const v = raw.expo[k];
      if (num(v)) {
        const s = Math.round(clampTo(v, 0, 100) / 5) * 5;
        if (s !== stock.expo[k]) {
          expo[k] = s;
        }
      }
    }
    if (Object.keys(expo).length) {
      out.expo = expo;
    }
  }
  if (num(raw.trimDeg)) {
    const v = Math.round(clampTo(raw.trimDeg, -TRIM_MAX_DEG, TRIM_MAX_DEG) * 4) / 4;
    if (v !== 0) {
      out.trimDeg = v;
    }
  }
  if (t.flaps) {
    if (raw.flapStart === 1 || raw.flapStart === 2) {
      out.flapStart = raw.flapStart;
    }
    if (raw.flapMix === false) {
      out.flapMix = false;
    }
  }
  return Object.keys(out).length ? out : null;
}

/* An entry with every field filled in from the stock setup. */
export function fullEntry(airframeId, entry) {
  const s = stockEntry(airframeId);
  const e = entry || {};
  return {
    ...s,
    ...e,
    expo: { ...s.expo, ...(e.expo || {}) },
  };
}

/*
 * Where the setup puts the CG: the shift forward of the maker's, m, the
 * all up mass with the lead, kg, and the static margin, from the pack's
 * slide on a pack of packKg, the lead at its end, on an aircraft of
 * massKg without it.
 */
export function balance(airframeId, entry, massKg, packKg) {
  const t = tuningFor(airframeId);
  const e = fullEntry(airframeId, entry);
  const mb = Math.abs(e.ballastG) / 1000;
  const xb = e.ballastG > 0 ? t.nose : e.ballastG < 0 ? t.tail : 0;
  const mass = massKg + mb;
  const shift = (packKg * (e.packMm / 1000) + mb * xb) / mass;
  return { shift, mass, ballastKg: mb, ballastX: xb, margin: t.margin + shift / t.chord };
}

/* Whether the setup is the stock one, field for field. */
export function isStock(airframeId, entry) {
  return entry == null || Object.keys(entry).length === 0;
}

/*
 * The sim_wing_set_tune block for a (normalised) entry, or null for the
 * stock setup. massKg and packKg as balance() takes them.
 */
export function tuneBlock(airframeId, entry, massKg, packKg) {
  if (isStock(airframeId, entry)) {
    return null;
  }
  const t = tuningFor(airframeId);
  const e = fullEntry(airframeId, entry);
  const b = balance(airframeId, entry, massKg, packKg);
  const th = throwsFor(airframeId, e.rate);
  const out = new Float64Array(SIM_TUNE_DOUBLES);
  out[SIM_TUNE.CG_SHIFT] = b.shift;
  out[SIM_TUNE.BALLAST_KG] = b.ballastKg;
  out[SIM_TUNE.BALLAST_X] = b.ballastX;
  out[SIM_TUNE.THROW_A] = rad(th[0]);
  out[SIM_TUNE.THROW_E] = rad(th[1]);
  out[SIM_TUNE.THROW_R] = rad(th[2]);
  out[SIM_TUNE.EXPO_A] = e.expo.a / 100;
  out[SIM_TUNE.EXPO_E] = e.expo.e / 100;
  out[SIM_TUNE.EXPO_R] = e.expo.r / 100;
  out[SIM_TUNE.TRIM_E] = rad(e.trimDeg);
  out[SIM_TUNE.FLAP_MIX] = t.flaps && e.flapMix ? t.flaps.mix : 0;
  return out;
}

/*
 * A stored settings.tuning map, validated: only fixed wings with data,
 * each entry normalised with the limits `limitsOf(airframeId)` gives
 * (the shell's, from the power choice), empty entries dropped.
 */
export function normalizeTuning(stored, limitsOf) {
  const out = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return out;
  }
  for (const id of Object.keys(TUNING)) {
    const e = normalizeEntry(id, stored[id], limitsOf(id));
    if (e) {
      out[id] = e;
    }
  }
  return out;
}

/* The response curve a stick of x in -1..1 gives, as a share of the
 * throw: the plant's surface_from_stick, for the curve preview. */
export function curve(x, expoPct) {
  const e = expoPct / 100;
  return x * x * x * e + x * (1 - e);
}
