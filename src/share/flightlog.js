/*
 * flightlog.js: the pilot's own flight, recorded in the browser and saved
 * as a blackbox log.
 *
 * scripts/replay-log.js flies a real quad's blackbox log through this
 * build and reports where the plant differs. This is the other direction:
 * the simulator logging its own flight in the same shape, so that "it
 * feels different" arrives as rates, sticks, pack voltage and rotor speeds
 * against time, and a sim log and a real log of the same line can be read
 * by the same parser and compared column for column.
 *
 * The file is blackbox_decode's CSV rather than Betaflight's packed binary:
 * every blackbox tool reads the CSV, writing the binary would mean keeping
 * a second encoder in step with a format this project does not own, and
 * tests/lib/blackbox.js parses exactly this CSV.
 *
 * What a row holds: time, sticks, gyro and pack voltage straight from the
 * module's state block. The motor columns are ROTOR SPEED as a fraction of
 * nominal full throttle, not the duty a real ESC logs, because duty never
 * crosses the module ABI (it reports RPM); anyone comparing motor columns
 * with a real log needs to know that. There is one row per rendered frame,
 * 60 to 144 Hz against a real FC's 1 to 8 kHz: each row's sticks and gyro
 * are read at the same instant, so a manoeuvre shows, filter phase does
 * not.
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

import { str } from '../strings/index.js';

/* Betaflight's stick units (tests/lib/blackbox.js maps them back): roll,
 * pitch and yaw as +-500 about centre, throttle as 1000..2000. Motor
 * columns use the 0..2047 range of a DShot value. */
const STICK_HALF_RANGE = 500;
const THROTTLE_LOW = 1000;
const THROTTLE_RANGE = 1000;
const MOTOR_FULL = 2047;
const DEG_PER_RAD = 57.29577951308232;

/* State block slots this file reads (see the module ABI). */
const AT_TIME_S = 0;
const AT_GYRO = 11; /* p, q, r in rad/s */
const AT_RPM = 14; /* four rotors */
const AT_VBAT = 18;

/*
 * blackbox_decode's CSV for `samples` ({ tUs, rc[4], gyroDps[3], motor?[4],
 * vbat? }). Here rather than under tests because the browser writes logs;
 * tests/lib/blackbox.js re-exports it to prove its parser reads this back.
 *
 * Pitch goes out negated: bf_glue.c builds rcData[PITCH] as 1500 minus the
 * ABI's pitch, so a log's positive pitch is the ABI's negative. The parser
 * negates it back; scripts/replay-log.js --selftest holds the two together.
 */
export function toBlackboxCsv(samples) {
  const columns = [
    str('flightlog.time_us'),
    'rcCommand[0]', 'rcCommand[1]', 'rcCommand[2]', 'rcCommand[3]',
    'gyroADC[0]', 'gyroADC[1]', 'gyroADC[2]',
    'motor[0]', 'motor[1]', 'motor[2]', 'motor[3]',
    str('flightlog.vbatlatest_v'),
  ];
  const header = columns.map((name) => `"${name}"`).join(', ');
  const lines = [];
  for (const { tUs, rc, gyroDps, motor, vbat } of samples) {
    const [roll, pitch, yaw, throttle] = rc;
    const motors = motor ?? [0, 0, 0, 0];
    lines.push([
      Math.round(tUs),
      roll * STICK_HALF_RANGE,
      -pitch * STICK_HALF_RANGE,
      yaw * STICK_HALF_RANGE,
      THROTTLE_LOW + throttle * THROTTLE_RANGE,
      ...gyroDps,
      ...motors.map((fraction) => fraction * MOTOR_FULL),
      vbat ?? 0,
    ].join(', '));
  }
  /* Header, rows, and a closing newline; with no rows the line between
   * is empty. */
  return `${header}\n${lines.join('\n')}\n`;
}

/* At 144 Hz a little over eleven minutes, longer than any pack: past it the
 * oldest rows go, so a recorder left on all session keeps the end of the
 * flight instead of filling memory (about 13 MB of CSV at the cap). */
const MAX_ROWS = 100000;

/* The gap left in the time axis where a module reset is spliced in. */
const SPLICE_GAP_US = 100000;

export class FlightRecorder {
  constructor() {
    this.on = false;
    this.clear();
  }

  /* On starts a fresh log: carrying one on across runs would put two
   * flights in one file. Off keeps what was recorded for saving. */
  setEnabled(on) {
    this.on = Boolean(on);
    if (this.on) {
      this.clear();
    }
  }

  clear() {
    this.ring = [];
    this.head = 0;
    /* Time continuity across module resets. The module's clock restarts at
     * zero on every reset (a crash recovery is one), and a log whose time
     * runs backwards mid file reads as one garbled flight in any tool that
     * bins by time. A sample earlier than the one before it starts a new
     * segment SPLICE_GAP_US after the last written time, so the file stays
     * monotonic and the seam is visible. */
    this.shiftUs = 0;
    this.prevModuleUs = -Infinity;
    this.prevLoggedUs = -Infinity;
  }

  get count() {
    return this.ring.length;
  }

  /* Rows oldest first. */
  inOrder() {
    return this.head === 0 ? this.ring : [...this.ring.slice(this.head), ...this.ring.slice(0, this.head)];
  }

  /* Length of the log in seconds, roughly, for a menu note. */
  get seconds() {
    const n = this.ring.length;
    if (n < 2) {
      return 0;
    }
    const newest = this.ring[(this.head + n - 1) % n];
    const oldest = this.ring[this.head];
    return (newest.tUs - oldest.tUs) / 1e6;
  }

  /*
   * One row: `st` is the module's state block and `rc` the channels last
   * handed to it, so the row pairs what the craft did with what it was
   * told at the same instant. `fullThrottleRpm` scales the rotor speeds.
   */
  push(st, rc, fullThrottleRpm) {
    if (!this.on) {
      return;
    }
    const moduleUs = st[AT_TIME_S] * 1e6;
    if (moduleUs < this.prevModuleUs) {
      this.shiftUs = this.prevLoggedUs + SPLICE_GAP_US - moduleUs;
    }
    this.prevModuleUs = moduleUs;
    this.prevLoggedUs = moduleUs + this.shiftUs;
    const fraction = (rpm) => (fullThrottleRpm > 0 ? rpm / fullThrottleRpm : 0);
    const row = {
      tUs: this.prevLoggedUs,
      rc: [rc.roll, rc.pitch, rc.yaw, rc.throttle],
      gyroDps: [0, 1, 2].map((k) => st[AT_GYRO + k] * DEG_PER_RAD),
      motor: [0, 1, 2, 3].map((k) => fraction(st[AT_RPM + k])),
      vbat: st[AT_VBAT],
    };
    if (this.ring.length < MAX_ROWS) {
      this.ring.push(row);
      return;
    }
    this.ring[this.head] = row;
    this.head = (this.head + 1) % MAX_ROWS;
  }

  csv() {
    return toBlackboxCsv(this.inOrder());
  }
}

/*
 * Save `text` as a file through a hidden download link and an object URL,
 * which every browser this runs in supports with no server. The URL is
 * revoked a task later, not at once: Safari has cancelled downloads whose
 * URL was revoked in the same task.
 */
export function downloadText(filename, text, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  Object.assign(link, { href: url, download: filename });
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* py-drone-combat-<map>-YYYYMMDD-HHMMSS.csv in local time, so files sort
 * by when they were flown. */
export function flightLogName(mapId) {
  const now = new Date();
  const two = (n) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `py-drone-combat-${String(mapId || 'flight')}-${day}-${time}.csv`;
}
