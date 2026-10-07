/*
 * storage.js: the pilot's tracks in this browser, and the builder autosave.
 *
 * Four kinds of localStorage entry, all under one prefix (STORAGE_PREFIX)
 * and each versioned:
 *
 *   <prefix>.library.v1            every saved track, keyed by track id
 *   <prefix>.online.v1             each saved track's standing with the
 *                                  tracks server, keyed by track id
 *   <prefix>.forks.v1              ids that proved to be another pilot's,
 *                                  each mapped to the copy that took over
 *   <prefix>.autosave.map.<id>.v1  what was open in the builder in world
 *                                  <id>, saved or not
 *
 * The prefix is still the old "webfpv.trackbuilder": pilots' tracks are
 * stored under it, and src/share/move.js and src/ui/ui.js name it too, so
 * renaming it needs a migration across all three. It is one constant so
 * that change is one line here.
 *
 * This browser's library is the copy that matters. A save lands here and
 * is marked pending; src/share/cloud.js uploads it when it can and marks it
 * online. Offline, or with the server down, nothing is lost and the builder
 * never waits on the network.
 *
 * The library may also hold race field and RaceGOW room tracks saved by
 * older builds. Nothing flies those now, but they are the pilot's data, so
 * they stay; every list here shows only tracks built inside a world.
 *
 * Reads go through model.normalize, so a hand edited entry or an old
 * build's track cannot leave the builder with something it cannot draw.
 * Writes go through writeJson, which answers false instead of throwing
 * when private browsing or the quota refuses them.
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

import {
  isMapTrack, newTrackId, normalize, toPlain, touch,
} from './model.js';
import { readJson, writeJson } from '../share/session.js';

const STORAGE_PREFIX = 'webfpv.trackbuilder';
const LIBRARY = `${STORAGE_PREFIX}.library.v1`;
const STANDINGS = `${STORAGE_PREFIX}.online.v1`;
const FORKS = `${STORAGE_PREFIX}.forks.v1`;
const autosaveKey = (mapId) => `${STORAGE_PREFIX}.autosave.map.${mapId}.v1`;

/* cloud.js listens for this, so callers of saveTrack need not know a
 * server exists. Only ever dispatched on this page's window. */
export const TRACK_SAVED_EVENT = 'fdfpv-track-saved';

/* A forked track can be forked again; following more links than this means
 * the forks entry is corrupt (a cycle), and the id reached so far is used. */
const MAX_FORK_HOPS = 8;

/* A stored JSON object keyed by id. Anything else stored there (an array,
 * a number, garbage) reads as empty rather than breaking every caller. */
function readTable(key) {
  const value = readJson(key, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function notifySaved() {
  try {
    window.dispatchEvent(new Event(TRACK_SAVED_EVENT));
  } catch (e) {
    /* The Node checks have no window, and nothing uploads there. */
  }
}

/* The library with one entry added, replaced or removed (value null). */
function putInLibrary(id, plain) {
  const library = readTable(LIBRARY);
  if (plain) {
    library[id] = plain;
  } else {
    delete library[id];
  }
  return writeJson(LIBRARY, library);
}

/* The tracks built inside world `mapId`, or inside any world when it is
 * null or omitted, most recently changed first. */
export function listMapTracks(mapId) {
  const tracks = Object.values(readTable(LIBRARY))
    .filter((raw) => isMapTrack(raw) && (mapId == null || raw.map === mapId))
    .map((raw) => normalize(raw).doc);
  return tracks.sort((a, b) => String(b.modifiedUtc).localeCompare(String(a.modifiedUtc)));
}

/* A saved track built inside a world, or null for any other id. */
export function loadMapTrack(id) {
  const raw = readTable(LIBRARY)[id];
  return raw && isMapTrack(raw) ? normalize(raw).doc : null;
}

/*
 * Each track's standing with the server, keyed by id:
 *
 *   { state: 'pending', hash?, updatedUtc? }  saved here since the last
 *                                             upload, or never uploaded
 *   { state: 'online', hash, updatedUtc }     the server has this save
 *   { state: 'failed', error }                refused; the next save retries
 *   { state: 'delete' }                       deleted here, still there
 *
 * hash is of what was last uploaded, so an unchanged save is not sent
 * again; updatedUtc is the server's clock, so a newer save made elsewhere
 * with the same pilot key can be recognised.
 */
export function readOnlineStates() {
  return readTable(STANDINGS);
}

/* Set one track's standing, or clear it with a falsy state. */
export function writeOnlineState(id, state) {
  const standings = readTable(STANDINGS);
  if (state) {
    standings[id] = state;
  } else {
    delete standings[id];
  }
  return writeJson(STANDINGS, standings);
}

/* Where edits to track `id` go now: `id` itself, or the copy it was forked
 * to, following forks of forks. */
function liveIdOf(id) {
  const forks = readJson(FORKS, {}) || {};
  let live = id;
  for (let hops = 0; hops < MAX_FORK_HOPS && forks[live]; hops += 1) {
    live = forks[live];
  }
  return live;
}

/*
 * Save `doc` and queue it for upload. If its id was forked, it is saved
 * under the copy's id and `doc` is given that id, so the builder holding it
 * keeps editing the copy. False when the browser refused the write.
 */
export function saveTrack(doc) {
  doc.id = liveIdOf(doc.id);
  touch(doc);
  if (!putInLibrary(doc.id, toPlain(doc))) {
    return false;
  }
  /* Keep the last upload's hash and time: they say whether the server holds
   * this id (for a later delete) and whether anything changed. */
  const previous = readOnlineStates()[doc.id] || {};
  writeOnlineState(doc.id, { state: 'pending', hash: previous.hash, updatedUtc: previous.updatedUtc });
  notifySaved();
  return true;
}

/* A track downloaded from the server (this pilot's, saved on another
 * computer): stored as it came and marked online, so it is not uploaded
 * straight back. */
export function storeFromServer(doc, online) {
  if (!putInLibrary(doc.id, toPlain(doc))) {
    return false;
  }
  return writeOnlineState(doc.id, { state: 'online', ...online });
}

/*
 * The server says track `id` belongs to another pilot. Move this browser's
 * copy to a fresh id, same content, and queue it for upload; the old id
 * forwards to it. Moved, not duplicated: the pilot made one track. Returns
 * the new id, or null when there is no such track or the write failed.
 */
export function forkTrack(id) {
  const library = readTable(LIBRARY);
  if (!library[id]) {
    return null;
  }
  const copy = toPlain(normalize(library[id]).doc);
  copy.id = newTrackId();
  library[copy.id] = copy;
  delete library[id];
  if (!writeJson(LIBRARY, library)) {
    return null;
  }
  const forks = readJson(FORKS, {}) || {};
  forks[id] = copy.id;
  writeJson(FORKS, forks);
  writeOnlineState(id, null);
  writeOnlineState(copy.id, { state: 'pending' });
  notifySaved();
  return copy.id;
}

/*
 * Tracks saved before the server existed have no standing. Mark each one
 * pending, once, which is how they first reach the server. Returns how many
 * were marked.
 */
export function markUnsyncedTracks() {
  const standings = readOnlineStates();
  let marked = 0;
  /* Checked as it goes: two library entries naming one id count once. */
  for (const raw of Object.values(readTable(LIBRARY))) {
    if (isMapTrack(raw) && raw.id && !standings[raw.id]) {
      standings[raw.id] = { state: 'pending' };
      marked += 1;
    }
  }
  if (marked) {
    writeJson(STANDINGS, standings);
  }
  return marked;
}

/*
 * Remove track `id` here, queue its removal from the server if the server
 * may hold it, and drop its world's autosave if that is this track, or the
 * builder would reopen what was just deleted. False when there was no such
 * track or the write failed.
 */
export function deleteTrack(id) {
  const raw = readTable(LIBRARY)[id];
  if (!raw || !putInLibrary(id, null)) {
    return false;
  }
  /* Pending with no server time means it never went up: nothing to delete
   * there. */
  const standing = readOnlineStates()[id];
  const onServer = standing && (standing.state !== 'pending' || standing.updatedUtc);
  writeOnlineState(id, onServer ? { state: 'delete' } : null);
  notifySaved();
  if (isMapTrack(raw) && readMapAutosave(raw.map)?.doc.id === id) {
    try {
      localStorage.removeItem(autosaveKey(raw.map));
    } catch (e) {
      /* The delete itself went through; a stale autosave only reopens the
       * track in the builder, where it can be deleted again. */
    }
  }
  return true;
}

export function writeAutosave(doc) {
  return writeJson(autosaveKey(doc.map), toPlain(doc));
}

/* normalize's result ({ doc, repairs }) for what was left open in world
 * `mapId`, or null. */
export function readMapAutosave(mapId) {
  const raw = readJson(autosaveKey(mapId), null);
  return raw && isMapTrack(raw) && raw.map === mapId ? normalize(raw) : null;
}

/*
 * Debounced autosave: schedule(doc) after every edit, and the write happens
 * delayMs after the last one; flush() writes now. Serialising on every
 * mouse move is the one thing that would make the builder feel slow.
 */
export function makeAutosaver(delayMs = 700) {
  let pending = null;
  let doc = null;
  const cancel = () => {
    if (pending != null) {
      clearTimeout(pending);
      pending = null;
    }
  };
  const write = () => {
    if (doc) {
      writeAutosave(doc);
    }
  };
  return {
    schedule(next) {
      doc = next;
      cancel();
      pending = setTimeout(() => {
        pending = null;
        write();
      }, delayMs);
    },
    flush() {
      cancel();
      write();
    },
  };
}
