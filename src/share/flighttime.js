/*
 * flighttime.js: how long this pilot has flown, kept as the pilot's own
 * record, and how two copies of that record become one.
 *
 * The owner's request (2026-10-03): "a counter of how many hours
 * individual players play ... flight time? that would be a cool stat to
 * keep." This is the per pilot half. The everybody half is the board's
 * daily flight seconds (src/share/stats.js), which never names a pilot.
 *
 * WHAT COUNTS IS THE PLANT FLYING, not the wall clock. src/main.js hands
 * the clock the milliseconds the plant actually stepped in a frame, and
 * only while the craft is airborne in flight: a paused run, a menu, a
 * replay, the crash hold, a turtle wait and the launch stand step nothing
 * or are gated out, so they add nothing. A dropped frame changes nothing,
 * because the plant's steps are what is counted.
 *
 * THE RECORD is settings.flightTime, synced as its own section
 * (src/share/progressmerge.js, kind 'devices'):
 *
 *   { [device]: { first: 'YYYY-MM-DD', by: { [airframe]: { [activity]: s } } } }
 *
 * `device` is a random id this browser makes once and keeps (deviceId,
 * below); `activity` is a mode registry id (src/share/modes.js); `s` is
 * whole seconds airborne. Totals by aircraft, by activity and overall
 * are sums over it (flightTotals), never stored, so they cannot disagree.
 *
 * THE MERGE IS A GROW ONLY COUNTER PER DEVICE. Every browser adds only to
 * its own slot, and a slot only ever grows. Two copies merge by taking,
 * for each device and each counter, the LARGER of the two values, and the
 * earlier first day. So:
 *
 *   two computers flying offline each grow their own slot, and the merge
 *   keeps both: nothing is lost;
 *   a slot sent twice, or merged in any order, is the same slot: the max
 *   of a value with itself is itself, so nothing is counted twice;
 *   an old copy of a slot (a sync that was out while the pilot flew on) is
 *   smaller than the new one and loses to it: nothing goes backwards.
 *
 * The total is the sum over slots. A browser whose storage was cleared
 * makes a new slot and starts it at nought; its old slot stays on the
 * account, so its time is neither lost nor counted again.
 *
 * Pure and DOM free apart from deviceId, which is handed its storage, so
 * the tracks server merges with it and the selftests run it in Node.
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

import { MODES } from './modes.js';

/* The activities time is split by: the mode registry's ids, so a mode
 * added there is a bucket here with no edit. */
export const FLIGHT_ACTIVITIES = MODES.map((m) => m.id);

/*
 * How many device slots an account holds. A slot is made per browser
 * profile, and again each time its site data is cleared, and none is
 * ever dropped (dropping one would lose its time). A slot is a hundred
 * or so characters per aircraft flown, so 256 is far inside the
 * account's PROGRESS_MAX_CHARS. Past it the sync is refused with a
 * sentence (progressmerge.js blobRefusal) rather than time being lost.
 */
export const FLIGHT_DEVICES_MAX = 256;

const DEVICE_KEY = 'webfpv.flight.device.v1';
const DEVICE_RE = /^[a-z0-9]{8,32}$/;
const AIRFRAME_RE = /^[a-z0-9_-]{1,40}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/* A ceiling no honest counter reaches (three centuries), so a hand edited
 * blob cannot make a total that is not a safe integer. */
const SECONDS_MAX = 1e10;

function isRecord(o) {
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o);
}

/* In key order, so one record has one spelling whatever order its parts
 * were made or merged in: the sync compares records as text
 * (src/share/account.js progressChanged), and the same time spelled two
 * ways would read as a change every minute. */
function sortedEntries(o) {
  return Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function seconds(v) {
  return Number.isInteger(v) && v >= 0 && v <= SECONDS_MAX;
}

/* One device's slot with the right shape, or null. Counters of an
 * activity the registry does not have are kept: a slot written by a
 * newer build is still that pilot's time. */
function cleanSlot(raw) {
  if (!isRecord(raw) || !isRecord(raw.by)) {
    return null;
  }
  const by = {};
  for (const [airframe, acts] of sortedEntries(raw.by)) {
    if (!AIRFRAME_RE.test(airframe) || !isRecord(acts)) {
      continue;
    }
    const kept = {};
    for (const [act, s] of sortedEntries(acts)) {
      if (AIRFRAME_RE.test(act) && seconds(s) && s > 0) {
        kept[act] = s;
      }
    }
    if (Object.keys(kept).length) {
      by[airframe] = kept;
    }
  }
  const slot = { by };
  if (typeof raw.first === 'string' && DAY_RE.test(raw.first)) {
    slot.first = raw.first;
  }
  return slot;
}

/* The record with only what has the right shape. */
export function cleanFlightTime(raw) {
  const out = {};
  if (!isRecord(raw)) {
    return out;
  }
  for (const [device, slot] of sortedEntries(raw)) {
    const clean = DEVICE_RE.test(device) ? cleanSlot(slot) : null;
    if (clean) {
      out[device] = clean;
    }
  }
  return out;
}

function earlierOf(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return a < b ? a : b;
}

/*
 * Two records, one: per device, per counter, the larger; the earlier
 * first day. Commutative, associative and idempotent (THE MERGE, above).
 */
export function mergeFlightTime(a, b) {
  const x = cleanFlightTime(a);
  const y = cleanFlightTime(b);
  const out = {};
  for (const device of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const p = x[device] || { by: {} };
    const q = y[device] || { by: {} };
    const by = {};
    for (const airframe of new Set([...Object.keys(p.by), ...Object.keys(q.by)])) {
      const pa = p.by[airframe] || {};
      const qa = q.by[airframe] || {};
      by[airframe] = {};
      for (const act of new Set([...Object.keys(pa), ...Object.keys(qa)])) {
        by[airframe][act] = Math.max(pa[act] || 0, qa[act] || 0);
      }
    }
    const slot = { by };
    const first = earlierOf(p.first, q.first);
    if (first) {
      slot.first = first;
    }
    out[device] = slot;
  }
  return cleanFlightTime(out);
}

/*
 * The record with `s` more seconds on this device's slot, for one
 * aircraft in one activity, flown on UTC `day`. A new record; the one
 * passed in is not touched.
 */
export function addFlight(record, device, airframe, activity, s, day) {
  if (!DEVICE_RE.test(device) || !AIRFRAME_RE.test(airframe) || !AIRFRAME_RE.test(activity)) {
    throw new Error(`addFlight: bad key ${device}/${airframe}/${activity}`);
  }
  const out = cleanFlightTime(record);
  if (!(Number.isInteger(s) && s > 0)) {
    return out;
  }
  const slot = out[device] || { by: {} };
  const acts = { ...(slot.by[airframe] || {}) };
  acts[activity] = Math.min(SECONDS_MAX, (acts[activity] || 0) + s);
  const next = { ...slot, by: { ...slot.by, [airframe]: acts } };
  if (DAY_RE.test(String(day)) && (!next.first || day < next.first)) {
    next.first = day;
  }
  out[device] = next;
  return cleanFlightTime(out);
}

/* Everything a screen shows, summed over every device: whole seconds in
 * all, by aircraft and by activity, and the first day flown or null. */
export function flightTotals(record) {
  const clean = cleanFlightTime(record);
  const out = { seconds: 0, byAirframe: {}, byActivity: {}, first: null };
  for (const slot of Object.values(clean)) {
    for (const [airframe, acts] of Object.entries(slot.by)) {
      for (const [act, s] of Object.entries(acts)) {
        out.seconds += s;
        out.byAirframe[airframe] = (out.byAirframe[airframe] || 0) + s;
        out.byActivity[act] = (out.byActivity[act] || 0) + s;
      }
    }
    out.first = earlierOf(out.first, slot.first || null);
  }
  return out;
}

/* Whole hours and the minutes over, rounded down: what "12 h 40 min"
 * is made of. */
export function splitDuration(s) {
  const whole = Math.max(0, Math.floor(Number(s) || 0));
  return { h: Math.floor(whole / 3600), m: Math.floor((whole % 3600) / 60) };
}

/*
 * Whether the steps the plant took this frame were flight, from the
 * shell's own flags (src/main.js frameBody): the run in flight (not
 * paused, not a replay, not the title), the flight screen up (no menu
 * over it), off the ground and off the launch stand, and not crashed,
 * wrecked, faulted or waiting upside down to be righted.
 */
export function stepsAreFlight(f) {
  return f.mode === 'flight' && f.screen === 'flight' && !f.landed && !f.launchStaging
    && !f.faulted && !f.crashed && !f.wrecked && !f.turtleWait && !f.turtleRecover;
}

/*
 * The in-memory counter between commits. note() is called once a frame
 * with the milliseconds the plant stepped and whether that was flight;
 * take() hands back the whole seconds gathered per aircraft and activity
 * and keeps each one's part second for next time, so nothing is rounded
 * away however often it is called.
 */
export function createFlightClock() {
  const pending = new Map();
  let total = 0;
  return {
    note(ms, { airborne, airframe, activity }) {
      if (!airborne || !(ms > 0) || !AIRFRAME_RE.test(String(airframe)) || !AIRFRAME_RE.test(String(activity))) {
        return;
      }
      const key = `${airframe}|${activity}`;
      pending.set(key, (pending.get(key) || 0) + ms);
      total += ms;
    },
    /* Milliseconds gathered and not yet taken. */
    held() {
      return total;
    },
    take() {
      const out = [];
      total = 0;
      for (const [key, ms] of pending) {
        const s = Math.floor(ms / 1000);
        const rest = ms - s * 1000;
        if (s > 0) {
          const [airframe, activity] = key.split('|');
          out.push({ airframe, activity, seconds: s });
        }
        pending.set(key, rest);
        total += rest;
      }
      return out;
    },
  };
}

/* This browser's device id, made once and kept in `storage`. Where
 * storage refuses (private mode) it is this page's id: the time is still
 * counted in this page's settings, and is simply not kept. Never sent
 * anywhere but the pilot's own account, inside this record. */
let pageDevice = null;
export function deviceId(storage) {
  try {
    const held = storage.getItem(DEVICE_KEY);
    if (held && DEVICE_RE.test(held)) {
      return held;
    }
  } catch (e) {
    /* Fall through to a fresh one. */
  }
  const fresh = pageDevice || newDevice();
  pageDevice = fresh;
  try {
    storage.setItem(DEVICE_KEY, fresh);
  } catch (e) {
    /* Private mode: this page's id. */
  }
  return fresh;
}

function newDevice() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
