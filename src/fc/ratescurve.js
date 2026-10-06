/*
 * ratescurve.js: Betaflight 4.5.1's five rate curves, for drawing.
 *
 * Display only. The flown curve is applyRates in fc/rc.c inside the WASM
 * module, which is why CLAUDE.md's rule against JavaScript rate curves
 * allows this: src/ui/ratespanel.js needs points to draw before and apart
 * from the module, and scripts/fc-trace.js F15 checks these against the
 * compiled firmware for every type. Nothing here reaches the integrator.
 *
 * Each curve is a port of its function in vendor/betaflight/src/main/fc/
 * rc.c (applyBetaflightRates, applyRaceFlightRates, applyKissRates,
 * applyActualRates, applyQuickRates), in rc.c's order of operations, in
 * doubles. All five stay although the menu defaults to ACTUAL, because
 * the menu offers all five and F15 checks all five.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this software. If not, see <https://www.gnu.org/licenses/>.
 */

// Points per curve the Rates screen draws across the stick's travel.
export const ANGLE_RATE_SAMPLES = 80;

// rc.c's SETPOINT_RATE_LIMIT_MAX, which is also the default rate_limit
// (CONTROL_RATE_CONFIG_RATE_LIMIT_MAX).
const SETPOINT_LIMIT = 1998;
const RC_RATE_INCREMENTAL = 14.54;

const cube = (x) => x * x * x;
// Grouped as (x*x)^2 * x, which the pinned preview has always used; the
// firmware's power5 macro groups left to right. Same polynomial, and F15
// compares the two within its tolerance.
const fifth = (x) => {
  const sq = x * x;
  return sq * sq * x;
};

// Betaflight's constrainf, NaN passing through unchanged.
function clampf(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

const superFactor = (stickAbs, ratio) => 1 / clampf(1 - stickAbs * ratio, 0.01, 1);

/*
 * Each curve takes the profile's CLI fields { rcRate, srate, expo,
 * quickRcExpo } (srate is rc.c's rates[axis], expo its rcExpo[axis]), the
 * stick in -1..1 and its magnitude, and returns deg/s before rate_limit.
 */
const CURVES = {
  BETAFLIGHT({ rcRate, srate, expo }, stick, stickAbs) {
    let x = stick;
    if (expo) {
      const e = expo / 100;
      x = x * cube(stickAbs) * e + x * (1 - e);
    }
    let rate = rcRate / 100;
    if (rate > 2) rate += RC_RATE_INCREMENTAL * (rate - 2);
    const deg = 200 * rate * x;
    return srate ? deg * superFactor(stickAbs, srate / 100) : deg;
  },

  RACEFLIGHT({ rcRate, srate, expo }, stick, stickAbs) {
    const x = (1 + 0.01 * expo * (stick * stick - 1)) * stick;
    const deg = 10 * rcRate * x;
    return deg * (1 + stickAbs * srate * 0.01);
  },

  KISS({ rcRate, srate, expo }, stick, stickAbs) {
    const curve = expo / 100;
    const useRates = superFactor(stickAbs, srate / 100);
    const x = (cube(stick) * curve + stick * (1 - curve)) * (rcRate / 1000);
    return clampf((2000 * useRates) * x, -SETPOINT_LIMIT, SETPOINT_LIMIT);
  },

  ACTUAL({ rcRate, srate, expo }, stick, stickAbs) {
    const e = expo / 100;
    const shaped = stickAbs * (fifth(stick) * e + stick * (1 - e));
    const centre = rcRate * 10;
    const reach = Math.max(0, srate * 10 - centre);
    return stick * centre + reach * shaped;
  },

  QUICK({ rcRate, srate, expo, quickRcExpo }, stick, stickAbs) {
    const centre = rcRate * 2;
    const max = Math.max(srate * 10, centre);
    const e = expo / 100;
    const stretch = (max / centre - 1) / (max / centre);
    if (quickRcExpo) {
      const curve = cube(stick) * e + stick * (1 - e);
      return clampf(curve * centre * superFactor(stickAbs, stretch), -SETPOINT_LIMIT, SETPOINT_LIMIT);
    }
    const curve = cube(stickAbs) * e + stickAbs * (1 - e);
    return clampf(stick * centre * superFactor(curve, stretch), -SETPOINT_LIMIT, SETPOINT_LIMIT);
  },
};

/*
 * deg/s at a stick position in -1..1 for a rates type and one axis of a
 * profile in CLI units. An unknown type draws the BETAFLIGHT curve, as the
 * firmware's switch does. axis.limit is that axis's rate_limit; anything
 * but a positive number means the default.
 */
export function angleRateDeg(type, axis, stick) {
  const curve = Object.hasOwn(CURVES, type) ? CURVES[type] : CURVES.BETAFLIGHT;
  const deg = curve(axis, stick, stick < 0 ? -stick : stick);
  const limit = Number.isFinite(axis.limit) && axis.limit > 0 ? axis.limit : SETPOINT_LIMIT;
  return clampf(deg, -limit, limit);
}
