/*
 * storage.js: the pilot's tracks in local storage, and the autosave.
 *
 * Two kinds of key, both versioned, both namespaced under webfpv.trackbuilder
 * so nothing here can collide with the simulator's own settings key:
 *
 *   webfpv.trackbuilder.library.v1            every saved track, by id
 *   webfpv.trackbuilder.autosave.map.<id>.v1  the track open in the builder
 *                                             in that world, saved or not
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

import { isMapTrack, normalize, toPlain, touch } from './model.js';
/* readJson and writeJson come from src/share/session.js, which had the same
 * two functions byte for byte. Private mode and the quota are handled there:
 * a failed write returns false and the caller tells the user. */
import { readJson, writeJson } from '../share/session.js';

const LIBRARY_KEY = 'webfpv.trackbuilder.library.v1';

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

export function saveTrack(doc) {
  touch(doc);
  const lib = readLibrary();
  lib[doc.id] = toPlain(doc);
  return writeJson(LIBRARY_KEY, lib);
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
