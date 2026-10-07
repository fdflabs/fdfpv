/*
 * blackbox.js: a real quad's Betaflight flight log, as blackbox_decode
 * writes it out in CSV, read into this simulator's own units and signs.
 *
 * Why it matters here: every flight feel constant in src/native/plant.c
 * was tuned until the closed loop sat inside a verification band, and the
 * bands measure ratios and SI kinematics, not feel, so feel has been
 * decided by memory. This simulator's controller is not a model of
 * Betaflight, it is Betaflight (the same 4.5.1 source a quad runs), so a
 * real quad's logged sticks fed through this build with that quad's diff
 * give a gyro trace whose difference from the real one is this project's
 * plant error, axis by axis (scripts/replay-log.js).
 *
 * Input: run Betaflight's own decoder on the .BBL first,
 *
 *     blackbox_decode --unit-gyro deg --unit-vbat V --merge-gps 0 LOG.BBL
 *
 * and give this the LOG.01.csv. The packed binary is Betaflight's format
 * and its decoder gets the frame packing, predictors and scaling right; a
 * second decoder here would only drift from it.
 *
 * Signs, read from the bridge, not remembered (either one backwards gives
 * a plausible and worthless report):
 *
 *   Gyro. src/native/bf/bf_glue.c:731-740 feeds the firmware roll right,
 *   nose down and nose left as positive p, q, r straight from the state,
 *   and the log's gyroADC[] is that array: the three columns are the
 *   state block's P, Q, R in deg/s, unflipped.
 *
 *   Sticks. bf_glue.c:751-761 builds rcData[ROLL] = 1500 + 500 rc[0],
 *   rcData[PITCH] = 1500 - 500 rc[1], rcData[YAW] = 1500 + 500 rc[2],
 *   rcData[THROTTLE] = 1000 + 1000 rc[3], and rcCommand[] keeps that
 *   polarity, so the reader inverts it, pitch's minus included.
 *
 * The logged gyroADC is after the filter chain, so it carries that chain's
 * delay: fair for a whole-loop comparison, slightly unkind to the plant. A
 * log flown with debug_mode = GYRO_SCALED has the pre-filter rate in
 * debug[0..2]; it is used when the filtered columns are missing.
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

/* rcCommand units: roll, pitch and yaw are centre +-500, throttle is a
 * 1000..2000 microsecond value; DShot motor values run 0..2047. */
const STICK_HALF = 500;
const THROTTLE_LOW = 1000;
const THROTTLE_RANGE = 1000;
const DSHOT_FULL = 2047;

/* Fields of one CSV line, each trimmed. A quote opens or closes a quoted
 * stretch and a doubled quote inside one is a literal quote: the header's
 * bracketed, spaced names are why this needs doing properly. */
function csvFields(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes && ch === '"' && line[i + 1] === '"') {
      field += '"';
      i += 2;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(field.trim());
      field = '';
    } else {
      field += ch;
    }
    i += 1;
  }
  fields.push(field.trim());
  return fields;
}

/* Decoder versions and flags spell columns differently ("time (us)" or
 * "time", "gyroADC[0]" or "gyroADCs[0]", "vbatLatest (V)" or "vbat"):
 * compare lower case, units in brackets dropped, letters, digits and
 * square brackets only. */
const canonical = (name) => name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/[^a-z0-9[\]]/g, '');

/* The index of the first of `spellings` present, or -1. */
function column(names, spellings) {
  for (const spelling of spellings) {
    const at = names.indexOf(spelling);
    if (at >= 0) {
      return at;
    }
  }
  return -1;
}

const axes = (count, spellingsOf) => Array.from({ length: count }, (_, k) => spellingsOf(k));
const allFound = (cols) => cols.every((c) => c >= 0);

/* Which three columns are the gyro, and whether they are the filtered
 * ones; whether a GYRO_SCALED debug trace is there too. */
function gyroColumns(names) {
  const filtered = axes(3, (k) => column(names, [`gyroadc[${k}]`, `gyroadcs[${k}]`]));
  const debug = axes(3, (k) => column(names, [`debug[${k}]`]));
  if (allFound(filtered)) {
    return { cols: filtered, filtered: true, hasDebug: allFound(debug) };
  }
  if (allFound(debug)) {
    return { cols: debug, filtered: false, hasDebug: true };
  }
  return { cols: null, filtered: false, hasDebug: false };
}

/*
 * How motor values become 0..1. The range is the protocol's: DShot logs
 * 0..2047 and PWM 1000..2000, and a single sample cannot tell DShot 1050
 * from PWM 1050, so it is decided once from every motor value in the log:
 * all of them within 900..2100 reads as PWM.
 */
function motorUnits(rows, cols) {
  /* A loop, not Math.min(...values): a long log has more values than an
   * argument list can carry. */
  let low = Infinity;
  let high = -Infinity;
  for (const r of rows) {
    for (const c of cols) {
      if (Number.isFinite(r[c])) {
        low = r[c] < low ? r[c] : low;
        high = r[c] > high ? r[c] : high;
      }
    }
  }
  if (low === Infinity) {
    return { kind: 'none', toDuty: (v) => v };
  }
  if (low >= 900 && high <= 2100) {
    return { kind: 'pwm', toDuty: (v) => (v - THROTTLE_LOW) / THROTTLE_RANGE };
  }
  return { kind: 'dshot', toDuty: (v) => v / DSHOT_FULL };
}

/*
 * { rows, meta } from blackbox_decode CSV text. Each row:
 *   tUs      microseconds since the log's first row
 *   rc       [roll, pitch, yaw, throttle] in the module's channel units,
 *            ready for sim_input
 *   gyroDps  [p, q, r] in deg/s with the state block's signs, or null
 *   motor    four duties 0..1, or null without motor columns
 *   vbat     pack volts, or null
 * Throws, saying what is wrong, for text that is not such a log.
 */
export function parseBlackboxCsv(text) {
  const lines = String(text).split(/\r?\n/);
  /* Comment lines may come first; the header is the first line naming a
   * time column. */
  const headerAt = lines.findIndex((line) => /(^|,)\s*"?time/i.test(line));
  if (headerAt < 0) {
    throw new Error('blackbox: no header row with a time column. Decode with blackbox_decode first.');
  }
  const names = csvFields(lines[headerAt]).map(canonical);
  const timeCol = column(names, ['time', 'timeus']);
  if (timeCol < 0) {
    throw new Error('blackbox: no time column');
  }
  const stickCols = axes(4, (k) => column(names, [`rccommand[${k}]`]));
  if (!allFound(stickCols)) {
    throw new Error('blackbox: rcCommand[0..3] columns are required and one is missing');
  }
  const gyro = gyroColumns(names);
  const motorCols = axes(4, (k) => column(names, [`motor[${k}]`]));
  const hasMotors = allFound(motorCols);
  const vbatCol = column(names, ['vbatlatest', 'vbat']);

  /* Data rows as numbers; blank lines and rows shorter than the header
   * (a truncated last line) are skipped. */
  const data = lines.slice(headerAt + 1)
    .filter((line) => line && line.trim())
    .map(csvFields)
    .filter((fields) => fields.length >= names.length)
    .map((fields) => fields.map(Number));
  if (data.length === 0) {
    throw new Error('blackbox: header found but no data rows');
  }

  const motors = hasMotors ? motorUnits(data, motorCols) : { kind: 'none', toDuty: null };
  const startUs = data[0][timeCol];
  const [rollCol, pitchCol, yawCol, throttleCol] = stickCols;
  const rows = data.map((r) => ({
    tUs: r[timeCol] - startUs,
    rc: [
      r[rollCol] / STICK_HALF,
      -r[pitchCol] / STICK_HALF,
      r[yawCol] / STICK_HALF,
      (r[throttleCol] - THROTTLE_LOW) / THROTTLE_RANGE,
    ],
    gyroDps: gyro.cols ? gyro.cols.map((c) => r[c]) : null,
    motor: hasMotors ? motorCols.map((c) => motors.toDuty(r[c])) : null,
    vbat: vbatCol >= 0 ? r[vbatCol] : null,
  }));

  const durationS = (rows[rows.length - 1].tUs - rows[0].tUs) / 1e6;
  let gyroLabel = 'none';
  if (gyro.cols) {
    gyroLabel = gyro.filtered ? 'gyroADC (filtered)' : 'debug[] (GYRO_SCALED, unfiltered)';
  }
  return {
    rows,
    meta: {
      count: rows.length,
      durationS,
      rateHz: durationS > 0 ? (rows.length - 1) / durationS : 0,
      gyro: gyroLabel,
      gyroIsFiltered: gyro.filtered,
      motorUnits: motors.kind,
      hasVbat: vbatCol >= 0,
    },
  };
}

/* The writer is src/share/flightlog.js (the browser writes logs, and src
 * must not import from tests); re-exported so both halves of the format
 * are found here, and the round trip in scripts/replay-log.js --selftest
 * imports one module. */
export { toBlackboxCsv } from '../../src/share/flightlog.js';
