/*
 * rates.js: the pilot's rate profile, owned here and nowhere else.
 *
 * Rates are the pilot's, not the tune's. A tune is gains and filters; rates
 * say how far the sticks reach. Keeping them apart is why no file in
 * configs/ carries a rateprofile (fc-trace F7 and F8 hold every file there
 * to it): a preset that changed both at once could not be compared with the
 * stock tune. Every tune, a dropped diff included, flies the profile below.
 *
 * The menu follows Betaflight Configurator 10.10 (tabs/pid_tuning.js,
 * changeRatesSystem): pick a rates type, then three numbers per axis in
 * that type's display units, within that type's ranges. Profiles are held
 * as the CLI uint8 values the firmware stores. Each column has a display
 * format that turns a stored value into the number on screen, so one arrow
 * press is one firmware unit and nothing finer is ever kept.
 *
 * The curves themselves are src/fc/ratescurve.js for drawing and the
 * compiled module for flying; fc-trace F15 sweeps the two against each
 * other.
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

import { angleRateDeg } from '../src/fc/ratescurve.js';
import { DEFAULT_AIRFRAME } from './airframes.js';

// Betaflight's RATES_TYPE lookup order, which is also the order
// Configurator lists them in.
export const RATE_TYPES = ['BETAFLIGHT', 'RACEFLIGHT', 'KISS', 'ACTUAL', 'QUICK'];

export const RATE_TYPE_LABEL = {
  BETAFLIGHT: 'Classic',
  RACEFLIGHT: 'Raceflight',
  KISS: 'KISS',
  ACTUAL: 'Actual',
  QUICK: 'Quick',
};

export const RATE_AXES = ['roll', 'pitch', 'yaw'];

// Per axis: <axis>_rc_rate, <axis>_srate, <axis>_expo in the CLI, whatever
// the column above them is called in a given rates type.
export const RATE_FIELDS = ['rcRate', 'srate', 'expo'];

// How a stored uint8 is shown. Hundredths is Configurator's 1.00 style,
// TENS_DEG is a deg/s column the firmware holds in tens, WHOLE is shown
// as stored.
const HUNDREDTHS = { scale: 0.01, decimals: 2, unit: '' };
const TENS_DEG = { scale: 10, decimals: 0, unit: 'deg/s' };
const WHOLE = { scale: 1, decimals: 0, unit: '' };

function column(label, cliMin, cliMax, format, note) {
  return {
    label, cliMin, cliMax, scale: format.scale, decimals: format.decimals, unit: format.unit, note,
  };
}

/*
 * Configurator's ranges and the values it loads on a type change. Its deg/s
 * columns stop at 200 (2000 deg/s) rather than the uint8's 255 because the
 * firmware clamps the setpoint at rate_limit, 1998. ACTUAL's 7 / 67 / 0 is
 * also Betaflight 4.5.1's reset profile (pgResetFn_controlRateProfiles), so
 * it is the profile a freshly flashed quad flies.
 */
const SYSTEMS = {
  BETAFLIGHT: {
    defaults: [100, 70, 0],
    columns: [
      column('RC rate', 1, 255, HUNDREDTHS, 'The linear part of the curve, and the whole of it when Super rate is zero. 1.00 is 200 deg/s at full stick.'),
      column('Super rate', 0, 100, HUNDREDTHS, 'How hard the ends of the travel are stretched. Zero is a straight line; every step up adds rate at the stop without touching the middle, and the top of the range is where a small stick move near the stop is worth a great deal.'),
      column('RC expo', 0, 100, HUNDREDTHS, 'Softens the middle of the stick and leaves the ends alone. Zero is linear.'),
    ],
  },
  RACEFLIGHT: {
    defaults: [37, 80, 50],
    columns: [
      column('Rate', 1, 200, TENS_DEG, 'Raceflight states the rate directly, in degrees per second, before Acro+ stretches the ends.'),
      column('Acro+', 0, 255, WHOLE, "Raceflight's super rate. It adds to the rate in proportion to how far the stick is from centre, so the ends get faster and the middle does not."),
      column('Expo', 0, 100, WHOLE, 'Softens the middle of the stick. Whole numbers here, not hundredths, which is how Raceflight writes it.'),
    ],
  },
  KISS: {
    defaults: [100, 70, 0],
    columns: [
      column('RC rate', 1, 255, HUNDREDTHS, "KISS's linear term. The curve is the Classic one with KISS's own scaling, so the numbers look like Classic rates and do not mean quite the same thing."),
      column('Rate', 0, 99, HUNDREDTHS, "KISS's super rate, stopping at 0.99 because 1.00 divides by zero at full stick and the firmware would sit on its own clamp."),
      column('RC curve', 0, 100, HUNDREDTHS, 'KISS calls its expo a curve. Same idea: it softens the middle and leaves the ends.'),
    ],
  },
  ACTUAL: {
    defaults: [7, 67, 0],
    columns: [
      column('Centre sensitivity', 1, 200, TENS_DEG, 'How quickly the quad answers a small stick move, as the SLOPE of the curve at the middle. Low is calm for a smooth line, high is twitchy and quick. It is not the rate at half stick: read the curve. Configurator apps call this column Center Sensitivity.'),
      column('Max rate', 1, 200, TENS_DEG, 'What the quad does at full stick, exactly. This is the number Actual rates exist for: the end of the curve is the number you type, whatever expo does to the middle.'),
      column('Expo', 0, 100, HUNDREDTHS, 'How much of the travel is spent near the middle. Zero is a straight line from centre sensitivity to the stop. Higher softens the middle and keeps the same maximum, which is why the ends of the curve do not move when you change it.'),
    ],
  },
  QUICK: {
    defaults: [100, 67, 0],
    columns: [
      column('RC rate', 1, 255, HUNDREDTHS, 'The slope at centre, in Classic units: 1.00 is 200 deg/s of centre sensitivity. Quick rates work out the super rate for you from this and Max rate.'),
      column('Max rate', 1, 200, TENS_DEG, 'What the quad does at full stick. Quick rates are Classic rates with the super rate solved for you, so this end of the curve is exact and the middle is whatever RC rate says.'),
      column('Expo', 0, 100, HUNDREDTHS, 'Softens the middle of the stick and leaves the ends alone.'),
    ],
  },
};

const FALLBACK_TYPE = 'ACTUAL';
const systemOf = (type) => SYSTEMS[Object.hasOwn(SYSTEMS, type) ? type : FALLBACK_TYPE];

// A new object per call: callers own what they are given.
const axisOf = ([rcRate, srate, expo]) => ({ rcRate, srate, expo });

function frozenProfile(type, roll, pitch, yaw) {
  return Object.freeze({
    type,
    roll: Object.freeze(axisOf(roll)),
    pitch: Object.freeze(axisOf(pitch)),
    yaw: Object.freeze(axisOf(yaw)),
    // 100 means no throttle limit.
    throttleCap: 100,
    // thr_mid and thr_expo as the firmware stores them: mid stick, no bend.
    thrMid: 50,
    thrExpo: 0,
  });
}

export const RATE_DEFAULTS = frozenProfile('ACTUAL', [7, 67, 0], [7, 67, 0], [7, 67, 0]);

// Betaflight's thr_mid and thr_expo, edited with the same number row as an
// axis column. The curve is the firmware's rcLookupThrottle.
export const THROTTLE_CURVE_FIELDS = Object.freeze({
  thrMid: column('Throttle mid', 0, 100, HUNDREDTHS, 'Where the curve pivots. 0.50 is the factory middle; pilots who hover low often bring it down toward their hover stick so the expo softens the right part of the travel.'),
  thrExpo: column('Throttle expo', 0, 100, HUNDREDTHS, "Flattens the throttle around the mid point and steepens the ends, exactly the firmware's thr_expo. 0 is the factory straight line."),
});

/*
 * The profile a touch screen starts on (seeded for a fresh touch profile,
 * offered once to stock rates by src/main.js adoptTouchRates). A thumb on
 * glass has about a quarter of a gimbal's travel and no centring spring, so
 * stock 670 deg/s puts tens of deg/s in a millimetre of shake. Actual
 * 60 / 450 with 0.25 expo for roll and pitch, yaw a little lower at 400.
 */
export const TOUCH_RATE_DEFAULTS = frozenProfile('ACTUAL', [6, 45, 25], [6, 45, 25], [6, 40, 25]);

export function rateField(type, key) {
  const { columns } = systemOf(type);
  const at = RATE_FIELDS.indexOf(key);
  return columns[at < 0 ? 0 : at];
}

// A display number to the uint8 that will be flown, so a typed 675 deg/s
// on a tens column becomes the 670 the firmware can hold.
export function cliOf(spec, display) {
  if (!Number.isFinite(display)) {
    return null;
  }
  return clampTo(spec, Math.round(display / spec.scale));
}

export function formatRate(spec, cli) {
  return (cli * spec.scale).toFixed(spec.decimals);
}

function clampTo(spec, n) {
  return Math.min(spec.cliMax, Math.max(spec.cliMin, n));
}

// A stored value of unknown provenance onto a column, or the fallback when
// it is not a number at all.
function storedValue(spec, raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) ? clampTo(spec, Math.round(n)) : fallback;
}

// The listed value closest to v, the earlier one on a tie. v may be any
// stored value; one that is not a number keeps the first choice.
function closest(choices, v) {
  let best = choices[0];
  for (const c of choices) {
    if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  }
  return best;
}

const isRecord = (v) => v !== null && typeof v === 'object';

/*
 * Any stored profile (an older build's settings, a hand edit, a dropped
 * dump) onto what the firmware and the menu accept.
 *
 * Under an unknown type the axis numbers have no meaning, so the whole
 * fallback profile is used rather than clamping them onto it. The throttle
 * limit and curve are not part of the rates system and are kept either way.
 */
export function normaliseRates(r) {
  const given = isRecord(r) ? r : {};
  const typed = RATE_TYPES.includes(given.type);
  const type = typed ? given.type : RATE_DEFAULTS.type;
  const sys = systemOf(type);
  const out = {
    type,
    throttleCap: closest(THROTTLE_CAP_CHOICES, given.throttleCap ?? RATE_DEFAULTS.throttleCap),
    thrMid: storedValue(THROTTLE_CURVE_FIELDS.thrMid, given.thrMid, RATE_DEFAULTS.thrMid),
    thrExpo: storedValue(THROTTLE_CURVE_FIELDS.thrExpo, given.thrExpo, RATE_DEFAULTS.thrExpo),
  };
  for (const axis of RATE_AXES) {
    const stored = typed && isRecord(given[axis]) ? given[axis] : {};
    const values = {};
    RATE_FIELDS.forEach((k, i) => {
      values[k] = storedValue(sys.columns[i], stored[k], sys.defaults[i]);
    });
    out[axis] = values;
  }
  return out;
}

// Switching type loads that type's own numbers, as Configurator does, and
// keeps the throttle settings.
export function profileForType(type, r) {
  const kept = normaliseRates(r);
  const d = systemOf(type).defaults;
  return normaliseRates({
    type,
    roll: axisOf(d),
    pitch: axisOf(d),
    yaw: axisOf(d),
    throttleCap: kept.throttleCap,
    thrMid: kept.thrMid,
    thrExpo: kept.thrExpo,
  });
}

/*
 * Settings from before v4 held four flat knobs in deg/s and whole expo,
 * Actual only, roll and pitch shared. Read once so a pilot keeps the rates
 * they had. Returns null when the blob has none of them.
 */
const LEGACY_KNOBS = ['rateMax', 'rateYawMax', 'rateCentre', 'rateExpo'];

export function ratesFromLegacy(s) {
  if (!isRecord(s)) {
    return null;
  }
  const knob = Object.fromEntries(LEGACY_KNOBS.map((k) => [k, Number(s[k])]));
  if (!LEGACY_KNOBS.some((k) => Number.isFinite(knob[k]))) {
    return null;
  }
  const tens = (deg, fallback) => (Number.isFinite(deg) ? Math.round(deg / 10) : fallback);
  const legacyAxis = (maxDeg) => ({
    rcRate: tens(knob.rateCentre, RATE_DEFAULTS.roll.rcRate),
    srate: tens(maxDeg, RATE_DEFAULTS.roll.srate),
    expo: Number.isFinite(knob.rateExpo) ? Math.round(knob.rateExpo) : 0,
  });
  const cap = Number(s.throttleCap);
  return normaliseRates({
    type: 'ACTUAL',
    roll: legacyAxis(knob.rateMax),
    pitch: legacyAxis(knob.rateMax),
    yaw: legacyAxis(knob.rateYawMax),
    throttleCap: Number.isFinite(cap) ? cap : RATE_DEFAULTS.throttleCap,
  });
}

const sameAxis = (a, b) => RATE_FIELDS.every((k) => a[k] === b[k]);

export function ratesAreDefault(r) {
  const mine = normaliseRates(r);
  const stock = normaliseRates(RATE_DEFAULTS);
  return ['type', 'throttleCap', 'thrMid', 'thrExpo'].every((k) => mine[k] === stock[k])
    && RATE_AXES.every((axis) => sameAxis(mine[axis], stock[axis]));
}

export function pitchMatchesRoll(r) {
  const p = normaliseRates(r);
  return sameAxis(p.roll, p.pitch);
}

/*
 * Throttle limit stops, percent of full throttle, applied by Betaflight's
 * own mixer as SCALE (applyThrottleLimit): the whole stick travel is spread
 * over 0..cap, which buys stick resolution on a high thrust to weight quad
 * where hover sits near a quarter stick. Not reimplemented here; ratesDiff
 * just switches it on. 75 and 65 are stops because airframes have been
 * seeded with them and a seeded value must be one the menu can show.
 */
export const THROTTLE_CAP_CHOICES = [100, 90, 80, 75, 70, 65, 60, 50, 40];

/*
 * The profile as CLI text, applied after whichever tune is loaded so
 * Betaflight's parser and rate code are the only ones that read it, and a
 * tune that still carried rates would lose. Every key is written every
 * time: a rate profile survives re-init, so an omitted key would keep the
 * previous profile's value (a throttle limit left on SCALE, or
 * quickrates_rc_expo changing the curve under the preview).
 */
export function ratesDiff(r) {
  const p = normaliseRates(r);
  const perAxis = (cliField, k) => RATE_AXES.map((axis) => `set ${axis}_${cliField} = ${p[axis][k]}`);
  return [
    '',
    '# Rates, from the menu. See configs/rates.js.',
    'rateprofile 0',
    `set rates_type = ${p.type}`,
    ...perAxis('rc_rate', 'rcRate'),
    ...perAxis('srate', 'srate'),
    ...perAxis('expo', 'expo'),
    // OFF is the firmware default and what Configurator's Quick preview
    // assumes, so the curve on screen matches.
    'set quickrates_rc_expo = OFF',
    `set throttle_limit_type = ${p.throttleCap < 100 ? 'SCALE' : 'OFF'}`,
    `set throttle_limit_percent = ${p.throttleCap}`,
    `set thr_mid = ${p.thrMid}`,
    `set thr_expo = ${p.thrExpo}`,
    '',
  ].join('\n');
}

// One axis in the shape src/fc/ratescurve.js takes. An unknown axis reads
// roll.
export function rateAxis(r, axis) {
  const p = normaliseRates(r);
  const a = RATE_AXES.includes(axis) ? p[axis] : p.roll;
  return { ...a, quickRcExpo: false };
}

export function fullStickDeg(r, axis) {
  const p = normaliseRates(r);
  return Math.round(angleRateDeg(p.type, rateAxis(p, axis), 1));
}

// One line for the menu, in deg/s at full stick because that is the only
// number the five rates types share.
export function ratesSummary(r) {
  const p = normaliseRates(r);
  const [roll, pitch, yaw] = RATE_AXES.map((axis) => fullStickDeg(p, axis));
  const reach = roll === pitch
    ? `${roll} roll and pitch, ${yaw} yaw`
    : `${roll} roll, ${pitch} pitch, ${yaw} yaw`;
  const limit = p.throttleCap < 100 ? `, throttle capped at ${p.throttleCap}` : '';
  return `${RATE_TYPE_LABEL[p.type]}, ${reach} deg/s${limit}`;
}

// The full throttle setup for a bug report, defaults included, because
// "throttle is touchy" is answered by the cap and where hover sits.
export function throttleSummary(r, airframe = DEFAULT_AIRFRAME) {
  const p = normaliseRates(r);
  const curve = p.thrExpo > 0 ? `, mid ${p.thrMid} expo ${p.thrExpo}` : ', no expo';
  const hover = hoverStickPercent(p.throttleCap, airframe);
  return `cap ${p.throttleCap}${curve}, hover near ${hover.toFixed(1)} percent of stick`;
}

/*
 * Hover stick position in percent, per cap stop, measured rather than
 * computed: hover over cap overstates it (by about six points at 40)
 * because pack sag and motor loading make thrust non-linear in command.
 * Read with `node scripts/flightcheck.js --airframe=interceptor` on
 * 2026-10-03, default tune, fresh 6S pack, at its gravityBase of 1.0.
 * Re-measure when the plant changes. Aircraft without a row of their own
 * are quoted the default racer's.
 */
const HOVER_BY_CAP = {
  interceptor: new Map([
    [100, 24.1], [90, 26.2], [80, 28.9], [75, 30.5], [70, 32.3],
    [65, 34.4], [60, 36.9], [50, 43.2], [40, 52.7],
  ]),
};

export function hoverStickPercent(cap, airframe = DEFAULT_AIRFRAME) {
  const rows = HOVER_BY_CAP[Object.hasOwn(HOVER_BY_CAP, airframe) ? airframe : DEFAULT_AIRFRAME];
  return rows.get(closest(THROTTLE_CAP_CHOICES, cap)) ?? rows.get(100);
}
