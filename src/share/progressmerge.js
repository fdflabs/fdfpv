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
 * THE RULES, by section kind:
 *
 *   progress   XP is the higher of the two; courses flown, challenges
 *              done and the rest are flags, and a flag set on either side
 *              is set; Unlock all is on if either turned it on.
 *   union      liverySaves: each plane's saved liveries, both lists, one
 *              entry per name, the incoming side's first.
 *   keyed      one entry per plane (or per tune), the newer stamp wins
 *              entry by entry.
 *   whole      the section as one value, the newer stamp wins.
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
};

const FLAG_MAPS = ['courses', 'challenges', 'seen', 'casual'];

function isRecord(o) {
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o);
}

function stampOf(stamps, part) {
  const n = stamps[part];
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* A blob with the right shape and nothing else in it: unknown sections
 * and stamps dropped, every section of its kind's type. */
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
    if (kind === 'whole' ? (value === null || typeof value === 'object' ? isRecord(value) : typeof value === 'string') : isRecord(value)) {
      out.data[section] = value;
    }
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
