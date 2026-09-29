import { str } from '../strings/index.js';
/*
 * session.js: the track this browser is flying.
 *
 * THE BOARD HANDS THE SIMULATOR A TRACK THROUGH THE URL, not through a file
 * and not through postMessage. The page at the other end opens
 *
 *   {sim}/?share={id}
 *
 * and this module is what that query becomes: a document in local storage,
 * plus the id and the board it came from, so a lap time can go back to the
 * same board. The document is the schemaVersion 4 track the in-sim builder
 * writes (src/builder/), naming the world it stands in.
 *
 * A TRACK OF THE PILOT'S OWN sits in the same seat, marked `local`, when
 * My tracks plays it: it is flown exactly as a published one is, and it is
 * not on the board, so no time goes anywhere and no board ghost is fetched.
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

/*
 * THE SEAT FOLLOWS THE KIND OF AIRCRAFT, AND THERE ARE TWO.
 *
 * A track built in a world is raced by every quad and by every fixed wing
 * that fits its gates (src/game/verify.js planesFor), and the quads and the
 * planes race on boards of their own. So a pilot holding a track for the
 * five inch and another for a plane holds two, and the shell reads whichever
 * the seated aircraft is: the planes' seat for a fixed wing, the quads' for
 * anything else.
 *
 * The seated AIRCRAFT is the copy of record, because that is the thing a
 * pilot chooses. It lives in the shell's settings because the shell owns
 * settings, and this module reads that key rather than importing the shell,
 * which would be a cycle.
 *
 * This file imports nothing but the strings. See the note under readJson.
 */
const SETTINGS_KEY = 'webfpv.settings.v3';

/*
 * MIRRORS fixedWing in configs/airframes.js. A mirror rather than an import
 * because this file imports nothing (see above); an airframe added there
 * without a row here takes the quads' seat. wing1000 is here as the seat a
 * stored profile or a link that still names the retired flying wing reads,
 * until the shell reseats it on the Bramor.
 */
const PLANES = new Set([
  'wing1000', 'sky1800', 'cub1400', 'radian2000', 'bramor2300', 'slowstick1180',
  'timber1500', 'timber1500f', 'cub1400f', 'bombshell1118', 'kadet1981', 'p51d1450', 'edge1524', 'extra1308', 'f16878', 'zagi1219', 'uglystik1567',
  'wot41334',
]);

function activeSeat() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && PLANES.has(s.airframe) ? 'wing' : 'full';
  } catch (e) {
    /* Private mode, or a blob that is not JSON: the five inch's seat. */
    return 'full';
  }
}

/*
 * The share seat, one per kind. The five inch keeps the original key, so a
 * pilot who has been here before still holds what they were holding. The
 * whoop's own seat, webfpv.share.import.micro.v1, held a RaceGOW room and is
 * no longer read: a whoop is a quad and takes the quads' seat.
 */
const IMPORT_KEYS = {
  full: 'webfpv.share.import.v1',
  wing: 'webfpv.share.import.wing.v1',
};

function importKey(seat) {
  return IMPORT_KEYS[seat ?? activeSeat()] ?? IMPORT_KEYS.full;
}

const EDIT_KEY = 'webfpv.share.editkeys.v1';
const BIND_KEY = 'webfpv.share.bind.v1';
const PENDING_KEY = 'webfpv.share.pending.v1';
const POSTED_KEY = 'webfpv.share.posted.v1';

/* Exported: src/trackbuilder/storage.js had a byte-identical pair. This
 * module imports nothing, so storage can take them from here without a
 * cycle. */
export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/* `seat` is for the callers that look at the other kind's seat: a link that
 * named a plane which does not fit its track moves the track to the quads'.
 * Everything else wants the seat of the aircraft that is actually seated,
 * which is the default. */
export function readShareImport(seat) {
  const raw = readJson(importKey(seat), null);
  if (!raw || typeof raw !== 'object' || !raw.document || !raw.id) {
    return null;
  }
  return raw;
}

/*
 * Which track the world was seated with, or should be, or '' for none. A
 * world is one id and many tracks, so a swap has to compare this key or
 * choosing a second track leaves the first one standing. A track of the
 * pilot's own changes under them in the builder, so its key carries when it
 * was last changed: playing it after an edit seats the edit.
 */
export function courseSeatKey(share) {
  if (!share || !share.id) {
    return '';
  }
  return share.local ? `local:${share.id}:${share.document.modifiedUtc || ''}` : `share:${share.id}`;
}

/*
 * A track built inside a world: schemaVersion 4 naming its map. The same
 * shape test as isMapTrack in src/trackbuilder/model.js, written out
 * because this file imports nothing. Nothing else can be seated: the race
 * field the older documents were drawn for is gone.
 */
function isMapDocument(doc) {
  return doc.schemaVersion >= 4 && typeof doc.map === 'string' && Boolean(doc.map);
}

/*
 * Seat a track, in the seat of the aircraft flying when it arrives: a plane
 * choosing it from My tracks, or a board link naming a plane, files it in
 * the planes' seat, and anything else in the quads'. Returns false, and
 * writes nothing, for a document that is not a track built in a world.
 */
export function writeShareImport(payload) {
  if (!payload || !payload.document || !payload.id || !isMapDocument(payload.document)) {
    return false;
  }
  return writeJson(importKey(), {
    id: String(payload.id),
    name: String(payload.name || payload.document.name || str('ui.untitled_track')),
    author: String(payload.author || ''),
    board: String(payload.board || ''),
    document: payload.document,
    /* One of this browser's own tracks, played from My tracks rather than
     * fetched from the board. inspectCourse reads it: such a seat is not
     * published, cannot take a time and has no board ghost. Written as a
     * boolean so a stale seat cannot smuggle anything else in under the
     * name. */
    local: Boolean(payload.local),
    importedUtc: new Date().toISOString(),
  });
}
export function clearShareImport(seat) {
  try {
    localStorage.removeItem(importKey(seat));
  } catch (e) {
    /* nothing to do about it */
  }
}

export function readEditKey(trackId) {
  const all = readJson(EDIT_KEY, {});
  const key = all && typeof all === 'object' ? all[trackId] : null;
  return typeof key === 'string' && key ? key : null;
}

export function writeEditKey(trackId, key) {
  const all = readJson(EDIT_KEY, {});
  if (!all || typeof all !== 'object' || Array.isArray(all)) {
    return false;
  }
  all[trackId] = String(key);
  return writeJson(EDIT_KEY, all);
}

export function readAllEditKeys() {
  const all = readJson(EDIT_KEY, {});
  if (!all || typeof all !== 'object' || Array.isArray(all)) {
    return {};
  }
  return all;
}

function mapGet(key, id) {
  const all = readJson(key, {});
  if (!all || typeof all !== 'object' || Array.isArray(all) || !id) {
    return null;
  }
  const row = all[id];
  return row && typeof row === 'object' ? row : null;
}

function mapSet(key, id, value) {
  const all = readJson(key, {});
  if (!all || typeof all !== 'object' || Array.isArray(all) || !id) {
    return false;
  }
  if (value == null) {
    delete all[id];
  } else {
    all[id] = value;
  }
  return writeJson(key, all);
}

/*
 * A local document id bound to a listing on the board. Owned listings
 * carry the last name and layout we sent, so a rename can update the
 * board without touching times, and a layout change can warn first.
 */
export function readBind(trackId) {
  return mapGet(BIND_KEY, trackId);
}

export function writeBind(trackId, bind) {
  if (!bind || typeof bind !== 'object') {
    return mapSet(BIND_KEY, trackId, null);
  }
  return mapSet(BIND_KEY, trackId, {
    board: String(bind.board || ''),
    author: String(bind.author || ''),
    nameOnBoard: String(bind.nameOnBoard || ''),
    layoutFingerprint: String(bind.layoutFingerprint || ''),
    owned: Boolean(bind.owned),
    sourceId: bind.sourceId ? String(bind.sourceId) : '',
    sourceName: String(bind.sourceName || ''),
    sourceAuthor: String(bind.sourceAuthor || ''),
  });
}

/*
 * WHERE A LAP'S BEST IS KEPT on this browser: the track id, and for a plane's
 * lap on a map track the plane board beside it (src/game/verify.js
 * planesFor), since the two boards rank separately and a quad's posted best
 * must not make a plane's slower lap look like no improvement. `craft` is
 * the plane's airframe id, or empty for every other lap.
 */
export function lapSlot(trackId, craft) {
  return craft ? `${trackId}#wing` : trackId;
}

export function readPendingTime() {
  const raw = readJson(PENDING_KEY, null);
  if (!raw || typeof raw !== 'object' || !raw.trackId || !Number.isFinite(raw.lapMs)) {
    return null;
  }
  return raw;
}

export function writePendingTime(payload) {
  if (!payload || !payload.trackId || !Number.isFinite(payload.lapMs)) {
    return false;
  }
  /* trackId and lapMs. There used to be a `name` here holding the TRACK
   * name, written by every caller and read by none, sitting one field away
   * from the pilot name it reads like. */
  return writeJson(PENDING_KEY, {
    trackId: String(payload.trackId),
    lapMs: Math.round(payload.lapMs),
    /* The plane that flew it, on a map track, so a later upload goes to the
     * board it was flown for; empty for every other lap. */
    craft: payload.craft ? String(payload.craft) : '',
  });
}

export function clearPendingTime(trackId) {
  const cur = readPendingTime();
  if (trackId && cur && cur.trackId !== trackId) {
    return;
  }
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (e) {
    /* nothing to do about it */
  }
}

export function readPostedBest(trackId) {
  const row = mapGet(POSTED_KEY, trackId);
  const ms = row && Number(row.lapMs);
  return Number.isFinite(ms) ? ms : null;
}

export function writePostedBest(trackId, lapMs) {
  const prev = readPostedBest(trackId);
  const next = Math.round(Number(lapMs));
  if (!Number.isFinite(next)) {
    return false;
  }
  if (prev != null && next >= prev) {
    return true;
  }
  return mapSet(POSTED_KEY, trackId, { lapMs: next });
}
