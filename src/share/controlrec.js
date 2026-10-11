/*
 * controlrec.js: the control recorder. Every physics step of a flight,
 * what the sticks said, what the controller made of them, what the
 * aircraft did and when the frame that stepped it ran, so a pilot's own
 * hover attempt can be sent and read against the person-paced pilot the
 * hover probe flies (scripts/hover-probe.js). docs/CONTROL-RECORDER.md
 * is the contract.
 *
 * flightlog.js is the blackbox-shaped log, one row per frame. This one is
 * one row per 1 ms step, held in a preallocated Float64Array ring so the
 * flight loop allocates nothing for it, and it is written as its own CSV:
 * flightlog's columns are a format other tools read and stay as they are.
 *
 * The sticks are the channels sim_input was handed for the step (after
 * the stick map, the 1.2 % deadband and the RC grid); stick_wall_ms is
 * when the shell's poll read them and frame_wall_ms the start of the
 * frame that stepped them, both performance.now() milliseconds, so their
 * difference is how long a reading waited for its frame.
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

/* Column order of a row and of the CSV header. Units: s, ms, m, m/s,
 * rad/s, radians for the surfaces (sim_abi.h sim_plane_surfaces), sticks
 * as sim_input takes them (roll, pitch, yaw -1..1, throttle 0..1). */
export const COLUMNS = [
  't_s', 'frame', 'frame_wall_ms', 'frame_dt_ms', 'steps', 'stick_wall_ms',
  'roll', 'pitch', 'yaw', 'throttle',
  'ail_l', 'ail_r', 'elev', 'rud',
  'x', 'y', 'z', 'vx', 'vy', 'vz', 'qw', 'qx', 'qy', 'qz', 'p', 'q', 'r',
];
const W = COLUMNS.length;
const C = Object.fromEntries(COLUMNS.map((name, i) => [name, i]));

/* Sixty seconds of 1 kHz steps, about 13 MB, allocated when switched on:
 * a hover attempt is seconds long, and the ring keeps the newest minute. */
export const MAX_STEPS = 60000;

/* A second of RC slots at 250 Hz. */
const SLOT_CAP = 250;

/* State block slots (sim_abi.h). */
const AT_T = 0;
const AT_POS = 1;

export class ControlRecorder {
  constructor(maxSteps = MAX_STEPS) {
    this.maxSteps = maxSteps;
    this.on = false;
    this.buf = null;
    this.clear();
  }

  setEnabled(on) {
    this.on = Boolean(on);
    if (this.on && !this.buf) {
      this.buf = new Float64Array(this.maxSteps * W);
    }
    this.clear();
  }

  clear() {
    this.n = 0;
    this.head = 0;
    this.frame = 0;
    /* RC slots handed to sim_input for the block about to be stepped,
     * flat (tMs, wallT, roll, pitch, yaw, throttle), consumed by step. */
    this.slots = [];
    this.slotAt = 0;
    this.held = [0, NaN, 0, 0, 0, 0];
  }

  get count() {
    return this.n;
  }

  /* A frame is about to step the plant. */
  beginFrame(wallMs, dtMs, steps) {
    this.frame += 1;
    this.fWall = wallMs;
    this.fDt = dtMs;
    this.fSteps = steps;
  }

  /* One RC slot as it went to sim_input: tMs on the sim clock, wallT when
   * it was read (NaN for a reading that carried none). */
  noteSlot(tMs, wallT, roll, pitch, yaw, throttle) {
    if (!this.on) {
      return;
    }
    /* Slots fed while the plant was not stepped in the air (a perch, the
     * launch stand) are never consumed: past SLOT_CAP the oldest go. */
    if (this.slotAt > 0 || this.slots.length >= SLOT_CAP * 6) {
      this.slots.splice(0, Math.max(this.slotAt, this.slots.length - (SLOT_CAP - 1) * 6));
      this.slotAt = 0;
    }
    this.slots.push(tMs, wallT, roll, pitch, yaw, throttle);
  }

  /* After a step: st is the state block, surf the four surfaces or null. */
  step(st, surf) {
    if (!this.on) {
      return;
    }
    const tMs = st[AT_T] * 1000;
    /* The slot in force is the newest one stamped at or before the step's
     * start, one step before its end. */
    while (this.slotAt < this.slots.length && this.slots[this.slotAt] <= tMs - 1 + 1e-6) {
      for (let k = 0; k < 6; k += 1) {
        this.held[k] = this.slots[this.slotAt + k];
      }
      this.slotAt += 6;
    }
    const at = this.head * W;
    const b = this.buf;
    b[at + C.t_s] = st[AT_T];
    b[at + C.frame] = this.frame;
    b[at + C.frame_wall_ms] = this.fWall;
    b[at + C.frame_dt_ms] = this.fDt;
    b[at + C.steps] = this.fSteps;
    b[at + C.stick_wall_ms] = this.held[1];
    for (let k = 0; k < 4; k += 1) {
      b[at + C.roll + k] = this.held[2 + k];
      b[at + C.ail_l + k] = surf ? surf[k] : 0;
    }
    for (let k = 0; k < 13; k += 1) {
      b[at + C.x + k] = st[AT_POS + k];
    }
    this.head = (this.head + 1) % this.maxSteps;
    this.n = Math.min(this.n + 1, this.maxSteps);
  }

  /* Rows oldest first, as arrays. */
  rows() {
    const out = [];
    const first = (this.head - this.n + this.maxSteps) % this.maxSteps;
    for (let i = 0; i < this.n; i += 1) {
      const at = ((first + i) % this.maxSteps) * W;
      out.push(Array.from(this.buf.subarray(at, at + W)));
    }
    return out;
  }

  get seconds() {
    const r = this.n;
    if (r < 2) {
      return 0;
    }
    return r / 1000;
  }

  csv() {
    return toCsv(this.rows());
  }
}

/* Six significant digits: a stick's 11 bits and a millimetre at a
 * kilometre both survive, and a minute stays under 15 MB. */
export function toCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(row.map((v) => (Number.isFinite(v) ? Number(v.toPrecision(7)) : '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const missing = COLUMNS.filter((c) => !head.includes(c));
  if (missing.length) {
    throw new Error(`controlrec: not a control recording, missing ${missing.join(' ')}`);
  }
  const idx = COLUMNS.map((c) => head.indexOf(c));
  return lines.slice(1).map((l) => {
    const v = l.split(',');
    return idx.map((i) => (v[i] === '' ? NaN : Number(v[i])));
  });
}

/* The nose's angle off straight up, degrees: body x (the thrust line of a
 * plane) against world z. */
export function noseOffVertical(row) {
  const w = row[C.qw];
  const x = row[C.qx];
  const y = row[C.qy];
  const z = row[C.qz];
  const zx = 2 * (x * z - w * y);
  return Math.acos(Math.max(-1, Math.min(1, zx))) * 57.29577951308232;
}

/* Hysteresis on a reversal: a radio's last bit of noise is not a thumb
 * changing its mind (hover-video.js counts every sign change of a
 * synthetic, noiseless stick; this is the same count with 1 % of travel
 * needed to call a turn). */
const REVERSAL_MIN = 0.01;
/* Sticks are judged on a 50 Hz grid, a hand's bandwidth, not on the
 * 1 kHz rows, so the stick rate is travel per second a thumb made. */
const JUDGE_MS = 20;

/*
 * What the thumbs did and how long the frames made the pilot wait, over
 * rows (a whole recording or a slice): the hover probe's and
 * hover-video.js's numbers. Per stick: peak and mean absolute deflection
 * (throttle about its mean), stick rate peak and 95th percentile in
 * travel per second, reversals per second (hover-video.js counts half
 * turns, so a full back and forth is one). Latency: per frame, its start
 * less the newest reading it stepped; frame interval; both median, p95,
 * p99, worst. Hover: the longest stretch with the nose within 20 degrees
 * of vertical, the probe's hold criterion.
 */
export function thumbStats(rows) {
  const names = ['roll', 'pitch', 'yaw', 'throttle'];
  const grid = [];
  let next = -Infinity;
  for (const r of rows) {
    if (r[C.t_s] * 1000 >= next) {
      grid.push(r);
      next = r[C.t_s] * 1000 + JUDGE_MS;
    }
  }
  const span = grid.length > 1 ? grid[grid.length - 1][C.t_s] - grid[0][C.t_s] : 0;
  const sticks = {};
  for (let k = 0; k < 4; k += 1) {
    const v = grid.map((r) => r[C.roll + k]);
    const centre = k === 3 && v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    const rate = [];
    let rev = 0;
    let dir = 0;
    let ext = v[0];
    for (let i = 1; i < v.length; i += 1) {
      rate.push(Math.abs(v[i] - v[i - 1]) / ((grid[i][C.t_s] - grid[i - 1][C.t_s]) || 1e-3));
      if (dir === 0) {
        if (Math.abs(v[i] - ext) >= REVERSAL_MIN) {
          dir = Math.sign(v[i] - ext);
          ext = v[i];
        }
      } else if ((v[i] - ext) * dir > 0) {
        ext = v[i];
      } else if ((ext - v[i]) * dir >= REVERSAL_MIN) {
        rev += 1;
        dir = -dir;
        ext = v[i];
      }
    }
    rate.sort((a, b) => a - b);
    sticks[names[k]] = {
      peak: v.length ? Math.max(...v.map((x) => Math.abs(x - centre))) : NaN,
      meanAbs: v.length ? v.reduce((a, x) => a + Math.abs(x - centre), 0) / v.length : NaN,
      ratePeak: rate.length ? rate[rate.length - 1] : NaN,
      rate95: rate.length ? rate[Math.floor(0.95 * (rate.length - 1))] : NaN,
      reversalsPerS: span > 0 ? rev / 2 / span : NaN,
    };
  }
  const wait = [];
  const interval = [];
  let lastFrame = -1;
  let newest = -Infinity;
  let prev = null;
  const closeFrame = () => {
    if (prev && Number.isFinite(newest)) {
      wait.push(prev[C.frame_wall_ms] - newest);
    }
  };
  for (const r of rows) {
    if (r[C.frame] !== lastFrame) {
      closeFrame();
      if (prev && r[C.frame] === lastFrame + 1) {
        interval.push(r[C.frame_wall_ms] - prev[C.frame_wall_ms]);
      }
      lastFrame = r[C.frame];
      newest = -Infinity;
    }
    if (Number.isFinite(r[C.stick_wall_ms]) && r[C.stick_wall_ms] <= r[C.frame_wall_ms]) {
      newest = Math.max(newest, r[C.stick_wall_ms]);
    }
    prev = r;
  }
  closeFrame();
  let best = 0;
  let run = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const dt = rows[i][C.t_s] - rows[i - 1][C.t_s];
    run = noseOffVertical(rows[i]) <= 20 && dt > 0 && dt < 0.01 ? run + dt : 0;
    best = Math.max(best, run);
  }
  return { seconds: span, sticks, stickToFrame: dist(wait), frameInterval: dist(interval), noseUpHeldS: best };
}

function dist(a) {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  const at = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN);
  return { n: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: s.length ? s[s.length - 1] : NaN };
}

export { C as COLUMN };

/*
 * The last flight, kept in this browser's IndexedDB so a hover attempt
 * that ended in a crash and a restart can still be saved: the newest
 * recording of at least MIN_KEEP_STEPS is stored at the end of each run,
 * replacing the one before. IndexedDB, not localStorage: a minute is
 * 13 MB, past localStorage's quota. A refused store is said in the
 * console and the live recording is unaffected.
 */
const DB_NAME = 'fdfpv-controlrec';
const STORE = 'flights';
const LAST = 'last';
const MIN_KEEP_STEPS = 1000;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* The recorder's rows as one flat Float64Array, oldest first. */
function flat(rec) {
  const out = new Float64Array(rec.n * W);
  const first = (rec.head - rec.n + rec.maxSteps) % rec.maxSteps;
  for (let i = 0; i < rec.n; i += 1) {
    const at = ((first + i) % rec.maxSteps) * W;
    out.set(rec.buf.subarray(at, at + W), i * W);
  }
  return out;
}

export async function keepLast(rec, meta) {
  if (!rec.on || rec.n < MIN_KEEP_STEPS || typeof indexedDB === 'undefined') {
    return false;
  }
  const data = flat(rec);
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ columns: COLUMNS, data, savedAt: Date.now(), ...meta }, LAST);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return true;
}

/* { rows, savedAt, ... } or null when none was kept. */
export async function loadLast() {
  const db = await openDb();
  try {
    const rec = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(LAST);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    if (!rec) {
      return null;
    }
    const w = rec.columns.length;
    const rows = [];
    for (let i = 0; i < rec.data.length; i += w) {
      rows.push(COLUMNS.map((c) => rec.data[i + rec.columns.indexOf(c)]));
    }
    return { ...rec, rows, data: undefined };
  } finally {
    db.close();
  }
}

/* fdfpv-controls-<map>-YYYYMMDD-HHMMSS.csv, local time. */
export function controlRecName(mapId, when = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  const day = `${when.getFullYear()}${two(when.getMonth() + 1)}${two(when.getDate())}`;
  const time = `${two(when.getHours())}${two(when.getMinutes())}${two(when.getSeconds())}`;
  return `fdfpv-controls-${String(mapId || 'flight')}-${day}-${time}.csv`;
}
