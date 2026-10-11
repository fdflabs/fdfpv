/*
 * session.js: what this browser keeps about the course it flies and the
 * board it came from.
 *
 * The board passes a course to the simulator in the address,
 * {sim}/?share={id}, never as a file or a message; the shell turns that
 * into a seat here: the course's schemaVersion 4 document (built in a
 * world by src/builder/), its id, its name and author, and the board it
 * came from, so a lap can be posted back there. A course of the pilot's
 * own, played from My tracks, takes the same seat marked `local`: flown
 * the same way, but on no board, so it takes no time and fetches no ghost.
 *
 * Beside the seat: the edit keys of listings this browser published, the
 * bind between a local course and its listing, a lap waiting to be
 * posted, and the best lap posted per course.
 *
 * Imports nothing but the strings, so src/trackbuilder/storage.js can take
 * readJson and writeJson from here without a cycle.
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

/*
 * There are two seats. Quads and the fixed wings that fit a course's gates
 * race it on separate boards, so a pilot may hold one course for a quad
 * and another for a plane; the shell reads the seat of the aircraft that
 * is seated now. The seated aircraft lives in the shell's settings, read
 * here by key because importing the shell would be a cycle.
 */
const SHELL_SETTINGS_KEY = 'webfpv.settings.v3';
const SEAT_KEYS = {
  full: 'webfpv.share.import.v1',
  wing: 'webfpv.share.import.wing.v1',
};
/* The whoop's old seat, webfpv.share.import.micro.v1, held a RaceGOW room
 * and is never read: a whoop is a quad and sits in the quads' seat. */

/*
 * Every fixed wing, which take the planes' seat; anything else takes the
 * quads'. KEEP IN STEP WITH fixedWing in configs/airframes.js (spelled out
 * because this file imports nothing). Retired planes stay listed
 * (wing1000, edge1524, extra1308, pitts850, wot41334, quickie1293) so a
 * stored profile naming one still reads the planes' seat until the shell
 * moves it to its successor (configs/airframes.js retiredAirframe).
 */
const FIXED_WINGS = new Set([
  'bombshell1118', 'bramor2300', 'cub1400', 'cub1400f', 'edge1524', 'extra1308', 'extra3d1308', 'f16878', 'kadet1981',
  'nrj1490', 'p51d1450', 'pitts850', 'quickie1293', 'radian2000', 'sky1800', 'slowstick1180', 'striker2500',
  'tigermoth1803', 'timber1500', 'timber1500f', 'uglystik1567', 'wing1000', 'wot41334', 'zagi1219',
]);

const EDIT_KEYS_KEY = 'webfpv.share.editkeys.v1';
const BINDS_KEY = 'webfpv.share.bind.v1';
const PENDING_LAP_KEY = 'webfpv.share.pending.v1';
const POSTED_BESTS_KEY = 'webfpv.share.posted.v1';

/* The parsed value under `key`, or `fallback` when there is none, it is
 * not JSON, or storage refuses to be read. */
export function readJson(key, fallback) {
  let text;
  try {
    text = localStorage.getItem(key);
  } catch (e) {
    return fallback;
  }
  if (!text) {
    return fallback;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

/* False when storage refuses the write (private mode, full quota) or the
 * value cannot be written as JSON. */
export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    return false;
  }
  return true;
}

function seatedKind() {
  const settings = readJson(SHELL_SETTINGS_KEY, null);
  return settings && FIXED_WINGS.has(settings.airframe) ? 'wing' : 'full';
}

/* `seat` ('full' or 'wing') names a seat outright, for the callers that
 * move a course between them; omitted, it is the seated aircraft's. */
const seatKey = (seat) => SEAT_KEYS[seat ?? seatedKind()] ?? SEAT_KEYS.full;

const isRecord = (v) => Boolean(v) && typeof v === 'object';

export function readShareImport(seat) {
  const held = readJson(seatKey(seat), null);
  return isRecord(held) && held.document && held.id ? held : null;
}

/*
 * The key a world is seated under, '' for no seat. One world holds many
 * courses, so swapping courses must compare this, not the world. A course
 * of the pilot's own changes as they edit it, so its key carries its last
 * change, and playing it after an edit seats the edit.
 */
export function courseSeatKey(share) {
  if (!share || !share.id) {
    return '';
  }
  if (!share.local) {
    return `share:${share.id}`;
  }
  return `local:${share.id}:${share.document.modifiedUtc || ''}`;
}

/* A course built in a world: schemaVersion 4 or later, naming its map.
 * The same test as isMapTrack in src/trackbuilder/model.js, repeated here
 * because this file imports nothing. The old race field is gone, so
 * nothing else can take a seat. */
const builtInAWorld = (doc) => doc.schemaVersion >= 4 && typeof doc.map === 'string' && doc.map !== '';

/*
 * Seat a course in the seat of the aircraft flying now (a plane playing it
 * from My tracks, or a board link naming a plane, files it with the
 * planes). False, with nothing written, for anything that is not a course
 * built in a world, or when storage refuses it.
 */
export function writeShareImport(payload) {
  if (!payload || !payload.document || !payload.id || !builtInAWorld(payload.document)) {
    return false;
  }
  const { id, name, author, board, document, local } = payload;
  return writeJson(seatKey(), {
    id: String(id),
    name: String(name || document.name || str('ui.untitled_track')),
    author: String(author || ''),
    board: String(board || ''),
    document,
    /* inspectCourse reads this: a seat of the pilot's own is unpublished
     * and takes no time. Always a boolean, so a stale seat cannot slip
     * anything else in under the name. */
    local: Boolean(local),
    importedUtc: new Date().toISOString(),
  });
}

export function clearShareImport(seat) {
  try {
    localStorage.removeItem(seatKey(seat));
  } catch (e) {
    /* Storage refused: there is nothing stored to clear. */
  }
}

/* A stored object of rows by id. Junk under the key (not an object, an
 * array) reads as no rows and refuses writes rather than being replaced,
 * and so does a missing id. */
function rowsAt(key) {
  const all = readJson(key, {});
  return isRecord(all) && !Array.isArray(all) ? all : null;
}

function rowOf(key, id) {
  const all = rowsAt(key);
  const row = all && id ? all[id] : null;
  return isRecord(row) ? row : null;
}

function putRow(key, id, row) {
  const all = rowsAt(key);
  if (!all || !id) {
    return false;
  }
  if (row == null) {
    delete all[id];
  } else {
    all[id] = row;
  }
  return writeJson(key, all);
}

/* The edit key the board gave this browser for a listing, or null. */
export function readEditKey(trackId) {
  const all = readJson(EDIT_KEYS_KEY, {});
  const key = isRecord(all) ? all[trackId] : null;
  return typeof key === 'string' && key !== '' ? key : null;
}

export function writeEditKey(trackId, key) {
  const all = rowsAt(EDIT_KEYS_KEY);
  if (!all) {
    return false;
  }
  all[trackId] = String(key);
  return writeJson(EDIT_KEYS_KEY, all);
}

export function readAllEditKeys() {
  return rowsAt(EDIT_KEYS_KEY) || {};
}

/*
 * A local course bound to its board listing. A listing this browser owns
 * remembers the name, author and layout last sent, so a rename can update
 * the board without clearing its times and a layout change can warn first;
 * a fork remembers what it was forked from.
 */
export function readBind(trackId) {
  return rowOf(BINDS_KEY, trackId);
}

/* Anything but an object removes the bind. */
export function writeBind(trackId, bind) {
  if (!isRecord(bind)) {
    return putRow(BINDS_KEY, trackId, null);
  }
  return putRow(BINDS_KEY, trackId, {
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
 * Where a posted best is kept: by course, and for a plane's lap beside it
 * on the plane board's own slot (src/game/verify.js planesFor), since the
 * two boards rank apart and a quad's best must not hide a plane's slower
 * improvement. `craft` is a plane's airframe id, empty for any other lap.
 */
export function lapSlot(trackId, craft) {
  return craft ? `${trackId}#wing` : trackId;
}

/* The lap waiting to be posted: { trackId, lapMs, craft }, or null. */
export function readPendingTime() {
  const lap = readJson(PENDING_LAP_KEY, null);
  return isRecord(lap) && lap.trackId && Number.isFinite(lap.lapMs) ? lap : null;
}

export function writePendingTime(payload) {
  if (!payload || !payload.trackId || !Number.isFinite(payload.lapMs)) {
    return false;
  }
  return writeJson(PENDING_LAP_KEY, {
    trackId: String(payload.trackId),
    lapMs: Math.round(payload.lapMs),
    /* The plane that flew it, so a later upload reaches that plane's
     * board; '' for every other lap. */
    craft: payload.craft ? String(payload.craft) : '',
  });
}

/* Forget the waiting lap; given a course, only that course's. */
export function clearPendingTime(trackId) {
  const waiting = readPendingTime();
  if (trackId && waiting && waiting.trackId !== trackId) {
    return;
  }
  try {
    localStorage.removeItem(PENDING_LAP_KEY);
  } catch (e) {
    /* Storage refused: nothing stored to forget. */
  }
}

export function readPostedBest(trackId) {
  const row = rowOf(POSTED_BESTS_KEY, trackId);
  const ms = row ? Number(row.lapMs) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/* Keep `lapMs` as the posted best when it beats the one kept. True when
 * kept or when the kept one is already as good; false for a lap that is
 * not a number or a write storage refuses. */
export function writePostedBest(trackId, lapMs) {
  const lap = Math.round(Number(lapMs));
  if (!Number.isFinite(lap)) {
    return false;
  }
  const best = readPostedBest(trackId);
  if (best !== null && lap >= best) {
    return true;
  }
  return putRow(POSTED_BESTS_KEY, trackId, { lapMs: lap });
}
