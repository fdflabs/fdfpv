/*
 * storage.js: the pilot's tracks in local storage, and the autosave.
 *
 * Two kinds of key, both versioned, both namespaced under webfpv.trackbuilder
 * so nothing here can collide with the simulator's own settings key:
 *
 *   webfpv.trackbuilder.library.v1            every saved track, by id
 *   webfpv.trackbuilder.autosave.map.<id>.v1  the track open in the builder
 *                                             in that world, saved or not
 *   webfpv.trackbuilder.online.v1             where each saved track stands
 *                                             with the tracks server
 *   webfpv.trackbuilder.forks.v1              ids that turned out to be
 *                                             another pilot's, and the copy
 *                                             each one's edits now go to
 *
 * THE LIBRARY IS THE COPY THAT COUNTS, and the tracks server is where it
 * goes next (src/share/cloud.js). A save lands here first and is marked
 * pending; cloud.js uploads it when it can and marks it online, and a save
 * that cannot go up stays pending and stays here. So being offline, or the
 * server being down, never costs a pilot a track, and nothing in the builder
 * waits on the network.
 *
 * The autosave is what makes a refresh safe. It is written on a short timer
 * after every edit rather than on every edit, because serialising a track on
 * each mouse move is the one place the builder could be made to feel slow.
 *
 * THE LIBRARY STILL HOLDS WHAT OLDER BUILDS SAVED IN IT: tracks drawn for the
 * race field and RaceGOW rooms, which nothing flies any more. They are left
 * where they are, because deleting a pilot's data is not an upgrade, and
 * every list here reads only the tracks built inside a world.
 *
 * Every read goes through model.normalize, so a hand edited local storage
 * entry or a track from an older build cannot put the builder in a state it
 * cannot draw. Every write is wrapped, because private browsing throws on
 * localStorage.setItem and losing an autosave must never lose the session.
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

import {
  isMapTrack, newTrackId, normalize, toPlain, touch,
} from './model.js';
/* readJson and writeJson come from src/share/session.js, which had the same
 * two functions byte for byte. Private mode and the quota are handled there:
 * a failed write returns false and the caller tells the user. */
import { readJson, writeJson } from '../share/session.js';

const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';
const ONLINE_KEY = 'webfpv.trackbuilder.online.v1';
const FORKS_KEY = 'webfpv.trackbuilder.forks.v1';

/* What cloud.js listens for, so a save is uploaded without every caller of
 * saveTrack having to know there is a server. */
export const TRACK_SAVED_EVENT = 'webfpv-track-saved';

/* A track built inside a world has an autosave seat per world: the builder
 * opens on whatever was left open in the world it is entered in. */
function mapAutosaveKey(mapId) {
  return `webfpv.trackbuilder.autosave.map.${mapId}.v1`;
}

function readLibrary() {
  const lib = readJson(LIBRARY_KEY, {});
  return (lib && typeof lib === 'object' && !Array.isArray(lib)) ? lib : {};
}

/* The tracks built inside one world, or inside any world when `mapId` is
 * not given, newest change first. */
export function listMapTracks(mapId) {
  return Object.values(readLibrary())
    .filter((raw) => isMapTrack(raw) && (mapId == null || raw.map === mapId))
    .map((raw) => normalize(raw).doc)
    .sort((a, b) => String(b.modifiedUtc).localeCompare(String(a.modifiedUtc)));
}

/* One saved track built inside a world, or null. */
export function loadMapTrack(id) {
  const raw = readLibrary()[id];
  return raw && isMapTrack(raw) ? normalize(raw).doc : null;
}

/*
 * WHERE EACH TRACK STANDS WITH THE SERVER, by id:
 *
 *   { state: 'pending' }                  saved here, this save not
 *                                         uploaded yet
 *   { state: 'online', hash, updatedUtc } the server holds this save
 *   { state: 'failed', error }            the server refused it; the next
 *                                         save of the track tries again
 *   { state: 'delete' }                   deleted here, to delete there
 *
 * `hash` covers what was uploaded, so a save that changed nothing is not
 * sent twice; `updatedUtc` is the server's own time for it, so a newer save
 * made on another computer under the same pilot key is recognised.
 */
export function readOnlineStates() {
  const all = readJson(ONLINE_KEY, {});
  return (all && typeof all === 'object' && !Array.isArray(all)) ? all : {};
}

export function writeOnlineState(id, state) {
  const all = readOnlineStates();
  if (state) {
    all[id] = state;
  } else {
    delete all[id];
  }
  return writeJson(ONLINE_KEY, all);
}

function announceSave() {
  try {
    window.dispatchEvent(new Event(TRACK_SAVED_EVENT));
  } catch (e) {
    /* No window, as in the Node checks, where nothing uploads anyway. */
  }
}

/* The id a track's edits go to now: its own, or the copy it was forked to
 * when the server said the id is another pilot's. Chains are followed,
 * with a bound, because a copy can be forked again. */
function currentId(id) {
  const forks = readJson(FORKS_KEY, {}) || {};
  let at = id;
  for (let i = 0; i < 8 && forks[at]; i += 1) {
    at = forks[at];
  }
  return at;
}

/*
 * Save into the library and mark the track for upload. A track whose id
 * turned out to belong to another pilot is saved under its copy's id
 * instead, and `doc` itself takes that id, so the builder holding it carries
 * on editing the copy.
 */
export function saveTrack(doc) {
  doc.id = currentId(doc.id);
  touch(doc);
  const lib = readLibrary();
  lib[doc.id] = toPlain(doc);
  if (!writeJson(LIBRARY_KEY, lib)) {
    return false;
  }
  /* The last upload's hash and time are kept: they are what says this id
   * is on the server already, for a delete, and whether anything changed. */
  const { hash, updatedUtc } = readOnlineStates()[doc.id] || {};
  writeOnlineState(doc.id, { state: 'pending', hash, updatedUtc });
  announceSave();
  return true;
}

/*
 * A track that came FROM the server, one of this pilot's own saved on
 * another computer: into the library as it is, already online, so it is not
 * sent straight back.
 */
export function storeFromServer(doc, online) {
  const lib = readLibrary();
  lib[doc.id] = toPlain(doc);
  if (!writeJson(LIBRARY_KEY, lib)) {
    return false;
  }
  return writeOnlineState(doc.id, { state: 'online', ...online });
}

/*
 * The server said this id is another pilot's, so this browser's edits go
 * to a copy of it under a new id, the same name, marked for upload. The
 * library entry moves rather than being duplicated, because the pilot made
 * one track and should see one. Returns the new id, or null.
 */
export function forkTrack(id) {
  const lib = readLibrary();
  const raw = lib[id];
  if (!raw) {
    return null;
  }
  const copy = toPlain(normalize(raw).doc);
  copy.id = newTrackId();
  lib[copy.id] = copy;
  delete lib[id];
  if (!writeJson(LIBRARY_KEY, lib)) {
    return null;
  }
  const forks = readJson(FORKS_KEY, {}) || {};
  forks[id] = copy.id;
  writeJson(FORKS_KEY, forks);
  writeOnlineState(id, null);
  writeOnlineState(copy.id, { state: 'pending' });
  announceSave();
  return copy.id;
}

/*
 * Tracks saved before there was a server have no state at all. They are
 * marked for upload once, which is how a pilot's existing tracks reach the
 * server the first time this build runs. Returns how many were marked.
 */
export function markUnsyncedTracks() {
  const states = readOnlineStates();
  let n = 0;
  for (const raw of Object.values(readLibrary())) {
    if (isMapTrack(raw) && raw.id && !states[raw.id]) {
      states[raw.id] = { state: 'pending' };
      n += 1;
    }
  }
  if (n) {
    writeJson(ONLINE_KEY, states);
  }
  return n;
}

/*
 * Take a track out of the library, and out of its world's autosave if it is
 * the one left open there, or the builder would open on a track the pilot
 * has just deleted. False when there was nothing to delete or the browser
 * refused the write.
 */
export function deleteTrack(id) {
  const lib = readLibrary();
  const raw = lib[id];
  if (!raw) {
    return false;
  }
  delete lib[id];
  if (!writeJson(LIBRARY_KEY, lib)) {
    return false;
  }
  /* Deleted here means deleted online too. A track that never reached the
   * server has nothing there to delete. */
  const was = readOnlineStates()[id];
  writeOnlineState(id, was && (was.state !== 'pending' || was.updatedUtc) ? { state: 'delete' } : null);
  announceSave();
  if (isMapTrack(raw)) {
    const open = readMapAutosave(raw.map);
    if (open && open.doc.id === id) {
      try {
        localStorage.removeItem(mapAutosaveKey(raw.map));
      } catch (e) {
        /* The library write above went through; a stale autosave only
         * reopens the track in the builder, where it can be deleted again. */
      }
    }
  }
  return true;
}

export function writeAutosave(doc) {
  return writeJson(mapAutosaveKey(doc.map), toPlain(doc));
}

export function readMapAutosave(mapId) {
  const raw = readJson(mapAutosaveKey(mapId), null);
  return raw && isMapTrack(raw) && raw.map === mapId ? normalize(raw) : null;
}

/*
 * A debounced autosave. The builder calls schedule() after every edit; the
 * write happens once the edits stop.
 */
export function makeAutosaver(delayMs = 700) {
  let timer = null;
  let latest = null;
  return {
    schedule(doc) {
      latest = doc;
      if (timer != null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        if (latest) {
          writeAutosave(latest);
        }
      }, delayMs);
    },
    flush() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      if (latest) {
        writeAutosave(latest);
      }
    },
  };
}
