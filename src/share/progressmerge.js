/*
 * progressmerge.js: what a signed in pilot's settings carry between
 * computers, and how two copies of them become one.
 *
 * The owner's words: progress follows the account, "unlocks, liveries and
 * paint, tunes", merged sensibly: the highest unlocks, the union of
 * liveries, the newest tunes. The pilot's own tracks follow by another road
 * (the account carries the pilot key, and src/share/cloud.js pulls every
 * track filed under it), so they are not in here.
 *
 * THE BLOB is { v: 1, data, stamps }. `data` holds the synced settings
 * sections by their ui.js names; `stamps` holds, per section or per
 * "section/key", the wall clock ms at which a computer last saw that part
 * change. A part missing from `data` but stamped was removed on purpose
 * (a plane's paint reset to the kit's), and the removal wins over an older
 * value, so a reset on one computer is not undone by the other.
 *
 * MY HANGAR. The builds (src/ui/builds.js) live under their own storage
 * key, not in the settings; src/ui/accountui.js puts them into the synced
 * view as `builds`, by build id, and takes them back out. A build carries
 * its whole fit (the paint entry itself, catalog ids for the power and the
 * parts), never a saved livery's name, so it needs nothing else to fly.
 * Which build a plane wears (settings.buildFits) is this computer's, and
 * is not synced.
 *
 * THE RULES, by section kind:
 *
 *   progress   XP is the higher of the two; courses flown, challenges
 *              done, firsts paid and the rest are flags, and a flag set on
 *              either side is set; Unlock all is on if either turned it
 *              on; the version is the newer of the two.
 *   union      liverySaves: each plane's saved liveries, both lists, one
 *              entry per name, the incoming side's first.
 *   keyed      one entry per plane (or per tune, or per build), the newer
 *              stamp wins entry by entry. A build deleted is its id
 *              stamped and absent: the tombstone. It beats the build
 *              another computer still holds unless that one was changed
 *              later, and the stamp is never dropped, because a computer
 *              that syncs a month late would bring the build back.
 *              combat is a combat aircraft's stock loadout by airframe id;
 *              builds is My Hangar by build id.
 *   whole      the section as one value, the newer stamp wins.
 *   flag       a yes the pilot gave, true once either side is: the
 *              replay notice for voice chat (voiceReplayAck,
 *              src/ui/voiceui.js), read and accepted on one computer,
 *              is accepted on all of them. Stamps play no part.
 *   campaign   Defend the Paraná (src/game/campaign.js mergeCampaign):
 *              the most stars per mission, the higher credits earned,
 *              the union of upgrades owned at the price paid; credits to
 *              spend are earned less those prices. Stamps play no part.
 *   devices    flightTime, the pilot's time in the air
 *              (src/share/flighttime.js): one grow only slot per
 *              browser, merged counter by counter to the larger, so two
 *              computers flying offline both keep their time and a slot
 *              sent twice is counted once. Stamps play no part.
 *
 * AT A TIE the account's value wins over the one just sent, and the one
 * just sent fills in where the account has none. A tie is nearly always
 * two unstamped values, and a computer's first sync stamps nothing
 * (src/share/account.js syncProgress): what it held before signing in may
 * be only its defaults, and must not overwrite the tunes the account
 * already carries, while a plane the account never tuned keeps its tune.
 *
 * Pure and DOM free: tracks-api/accounts.js merges on the server, where two
 * computers meet, and the selftest runs it in Node. It checks SHAPE only.
 * What a value means (a scheme a plane still has, a tune still on its row)
 * is decided by ui.js loadSettings on the computer that reads it, the same
 * way it decides for anything read back out of local storage.
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

import { mergeCampaign } from '../game/campaign.js';
import { retiredAirframe } from '../../configs/airframes.js';
import { FLIGHT_DEVICES_MAX, cleanFlightTime, mergeFlightTime } from './flighttime.js';
import {
  BUILD_MAX_CHARS, COMBAT_MAX_ENTRIES, MAX_BUILDS,
} from '../../tracks-api/limits.js';

export const SYNCED_SECTIONS = {
  progress: 'progress',
  liverySaves: 'union',
  livery: 'keyed',
  parts: 'keyed',
  power: 'keyed',
  tuning: 'keyed',
  tuneFor: 'keyed',
  pids: 'keyed',
  floats: 'keyed',
  tune: 'whole',
  rates: 'whole',
  campaign: 'campaign',
  combat: 'keyed',
  builds: 'keyed',
  voiceReplayAck: 'flag',
  flightTime: 'devices',
};

const FLAG_MAPS = ['courses', 'challenges', 'seen', 'casual', 'firsts'];

function isRecord(o) {
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o);
}

function stampOf(stamps, part) {
  const n = stamps[part];
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const ID_RE = /^[a-z0-9_-]{1,40}$/;
const BUILD_ID_RE = /^[a-z0-9]{1,40}$/;
const shortString = (v) => typeof v === 'string' && v.length <= 40;
const when = (v) => v === undefined || (Number.isFinite(v) && v >= 0);

/* The entries of the sections whose entries have a shape the server can
 * hold them to, by section: whether one entry, under its key, has it. */
const ENTRY_SHAPES = {
  combat: (key, e) => ID_RE.test(key) && isRecord(e) && shortString(e.payload)
    && Array.isArray(e.accessories) && e.accessories.length <= 16 && e.accessories.every(shortString)
    && (e.propulsion === undefined || shortString(e.propulsion)),
  builds: (key, b) => BUILD_ID_RE.test(key) && isRecord(b) && (b.id === undefined || b.id === key)
    && typeof b.name === 'string' && b.name.length >= 1 && b.name.length <= 40
    && typeof b.airframe === 'string' && ID_RE.test(b.airframe) && isRecord(b.fit) && when(b.created) && when(b.updated),
};

/*
 * THE SECTIONS KEYED BY AIRFRAME ID. An entry under a retired aircraft
 * (configs/airframes.js retiredAirframe: the five inch and the whoop since
 * 2026-10-03) is dropped from a clean blob: its motors, props, packs,
 * parts and tune were that aircraft's, and its successor has its own.
 */
const AIRFRAME_KEYED = ['livery', 'parts', 'power', 'tuning', 'tuneFor', 'floats', 'combat'];

/*
 * A build as this build of the game holds it: one made on a retired
 * aircraft is moved onto its successor, its name, id and dates kept and its
 * fit back to stock, since every motor, prop and pack in it was the old
 * aircraft's (the owner's five inch builds, 2026-10-03). Here so the
 * server's merge and src/ui/builds.js on load move it the same way.
 */
export function currentBuild(b) {
  const gone = isRecord(b) ? retiredAirframe(b.airframe) : null;
  return gone ? { ...b, airframe: gone.to, fit: {} } : b;
}

/*
 * Why a blob a computer sent is refused, or null: more builds than one
 * computer can hold, a build past its cap, more loadouts than there are
 * aircraft with room over, or an entry of the wrong shape. Each is
 * { status, section, why, limit }, `why` one of 'map', 'count', 'shape'
 * or 'size'; tracks-api/accounts.js words the answer. Only what was SENT
 * is held to the counts: two computers' builds merged may be more than
 * one computer holds, and the account must still sync (each computer
 * shows the oldest MAX_BUILDS, and the rest stay on the account).
 */
export function blobRefusal(raw) {
  const data = isRecord(raw) && isRecord(raw.data) ? raw.data : {};
  const counts = { builds: MAX_BUILDS, combat: COMBAT_MAX_ENTRIES };
  for (const [section, shape] of Object.entries(ENTRY_SHAPES)) {
    const value = data[section];
    if (value === undefined) {
      continue;
    }
    if (!isRecord(value)) {
      return { status: 422, section, why: 'map' };
    }
    const entries = Object.entries(value);
    if (entries.length > counts[section]) {
      return { status: 413, section, why: 'count', limit: counts[section] };
    }
    for (const [key, entry] of entries) {
      if (!shape(key, entry)) {
        return { status: 422, section, why: 'shape' };
      }
      if (section === 'builds' && JSON.stringify(entry).length > BUILD_MAX_CHARS) {
        return { status: 413, section, why: 'size', limit: BUILD_MAX_CHARS };
      }
    }
  }
  const flight = data.flightTime;
  if (flight !== undefined && !isRecord(flight)) {
    return { status: 422, section: 'flightTime', why: 'map' };
  }
  if (isRecord(flight) && Object.keys(flight).length > FLIGHT_DEVICES_MAX) {
    return { status: 413, section: 'flightTime', why: 'count', limit: FLIGHT_DEVICES_MAX };
  }
  return null;
}

/* A blob with the right shape and nothing else in it: unknown sections
 * and stamps dropped, every section of its kind's type, and an entry of
 * a section with an entry shape dropped when it has not got it. */
export function cleanBlob(raw) {
  const out = { v: 1, data: {}, stamps: {} };
  if (!isRecord(raw) || !isRecord(raw.data)) {
    return out;
  }
  for (const [section, kind] of Object.entries(SYNCED_SECTIONS)) {
    const value = raw.data[section];
    if (value === undefined) {
      continue;
    }
    if (kind === 'flag') {
      if (typeof value === 'boolean') {
        out.data[section] = value;
      }
      continue;
    }
    if (kind === 'devices') {
      if (isRecord(value)) {
        out.data[section] = cleanFlightTime(value);
      }
      continue;
    }
    if (!(kind === 'whole' ? (value === null || typeof value === 'object' ? isRecord(value) : typeof value === 'string') : isRecord(value))) {
      continue;
    }
    const shape = ENTRY_SHAPES[section];
    let kept = shape ? Object.fromEntries(Object.entries(value).filter(([k, e]) => shape(k, e))) : value;
    if (section === 'builds') {
      kept = Object.fromEntries(Object.entries(kept).map(([k, b]) => [k, currentBuild(b)]));
    } else if (AIRFRAME_KEYED.includes(section)) {
      kept = Object.fromEntries(Object.entries(kept).filter(([k]) => !retiredAirframe(k)));
    }
    out.data[section] = kept;
  }
  if (isRecord(raw.stamps)) {
    for (const [part, ms] of Object.entries(raw.stamps)) {
      const section = part.split('/')[0];
      if (section in SYNCED_SECTIONS && Number.isFinite(ms) && ms > 0 && part.length <= 120) {
        out.stamps[part] = Math.floor(ms);
      }
    }
  }
  return out;
}

function mergeProgress(a, b) {
  if (!isRecord(a)) {
    return b;
  }
  if (!isRecord(b)) {
    return a;
  }
  const out = { ...b, ...a };
  out.xp = Math.max(Number.isFinite(a.xp) ? a.xp : 0, Number.isFinite(b.xp) ? b.xp : 0);
  for (const k of FLAG_MAPS) {
    out[k] = { ...(isRecord(b[k]) ? b[k] : {}), ...(isRecord(a[k]) ? a[k] : {}) };
  }
  out.unlockAll = a.unlockAll === true || b.unlockAll === true;
  /* The newer shape of the two (progress.js PROGRESS_VERSION): an older
   * build's sync must not mark merged progress as its own older version,
   * or the next load would migrate it again. */
  const va = Number.isInteger(a.v) ? a.v : 1;
  const vb = Number.isInteger(b.v) ? b.v : 1;
  out.v = Math.max(va, vb);
  return out;
}

function mergeUnion(a, b) {
  const out = {};
  for (const family of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const seen = new Set();
    const list = [];
    for (const item of [...(Array.isArray(a?.[family]) ? a[family] : []), ...(Array.isArray(b?.[family]) ? b[family] : [])]) {
      const name = isRecord(item) && typeof item.name === 'string' ? item.name : null;
      if (name === null || seen.has(name)) {
        continue;
      }
      seen.add(name);
      list.push(item);
    }
    if (list.length) {
      out[family] = list;
    }
  }
  return out;
}

/*
 * One blob from two: `incoming` is the one just sent, `held` the one the
 * server had.
 */
export function mergeBlobs(incoming, held) {
  const a = cleanBlob(incoming);
  const b = cleanBlob(held);
  const out = { v: 1, data: {}, stamps: { ...b.stamps } };
  for (const [part, ms] of Object.entries(a.stamps)) {
    out.stamps[part] = Math.max(ms, out.stamps[part] || 0);
  }
  for (const [section, kind] of Object.entries(SYNCED_SECTIONS)) {
    const av = a.data[section];
    const bv = b.data[section];
    let merged;
    if (kind === 'progress') {
      merged = mergeProgress(av, bv);
    } else if (kind === 'union') {
      merged = av === undefined && bv === undefined ? undefined : mergeUnion(av, bv);
    } else if (kind === 'campaign') {
      merged = av === undefined && bv === undefined ? undefined : mergeCampaign(av, bv);
    } else if (kind === 'flag') {
      merged = av === undefined && bv === undefined ? undefined : av === true || bv === true;
    } else if (kind === 'devices') {
      merged = av === undefined && bv === undefined ? undefined : mergeFlightTime(av, bv);
    } else if (kind === 'whole') {
      merged = pick(stampOf(a.stamps, section), stampOf(b.stamps, section), av !== undefined, av, bv !== undefined, bv);
    } else {
      merged = mergeKeyed(section, av, bv, a.stamps, b.stamps);
    }
    if (merged !== undefined) {
      out.data[section] = merged;
    }
  }
  return out;
}

/*
 * One part's value, undefined for absent: the newer stamp's side, where
 * stamped and absent is a removal; at a tie the held side's, else the
 * incoming side's (THE RULES, above).
 */
function pick(ta, tb, hasA, av, hasB, bv) {
  if (ta > tb) {
    return hasA ? av : undefined;
  }
  if (tb > ta) {
    return hasB ? bv : undefined;
  }
  if (hasB) {
    return bv;
  }
  return hasA ? av : undefined;
}

function mergeKeyed(section, av, bv, as, bs) {
  if (av === undefined && bv === undefined) {
    return undefined;
  }
  const out = {};
  const keys = new Set([...Object.keys(av || {}), ...Object.keys(bv || {})]);
  for (const part of [...Object.keys(as), ...Object.keys(bs)]) {
    if (part.startsWith(`${section}/`)) {
      keys.add(part.slice(section.length + 1));
    }
  }
  for (const key of keys) {
    const part = `${section}/${key}`;
    const ta = stampOf(as, part);
    const tb = stampOf(bs, part);
    const hasA = Boolean(av) && Object.hasOwn(av, key);
    const hasB = Boolean(bv) && Object.hasOwn(bv, key);
    const winner = pick(ta, tb, hasA, av?.[key], hasB, bv?.[key]);
    if (winner !== undefined) {
      out[key] = winner;
    }
  }
  return out;
}

/*
 * The parts of `now` that differ from `before`, stamped `ms`: what a
 * computer calls the changes it made since it last synced. Both are blob
 * `data` objects.
 */
export function stampChanges(now, before, ms, stamps = {}) {
  const out = { ...stamps };
  for (const [section, kind] of Object.entries(SYNCED_SECTIONS)) {
    const a = now[section];
    const b = before[section];
    if (kind === 'keyed') {
      for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
        if (JSON.stringify(a?.[key]) !== JSON.stringify(b?.[key])) {
          out[`${section}/${key}`] = ms;
        }
      }
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      out[section] = ms;
    }
  }
  return out;
}

/* The synced sections of a settings object, as blob `data`. */
export function pickSynced(settings) {
  const data = {};
  for (const section of Object.keys(SYNCED_SECTIONS)) {
    if (settings && settings[section] !== undefined) {
      data[section] = JSON.parse(JSON.stringify(settings[section]));
    }
  }
  return data;
}
