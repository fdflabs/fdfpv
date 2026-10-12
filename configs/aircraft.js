/*
 * aircraft.js: assembles the id-keyed config tables from aircraft folders,
 * aircraft/<id>/aircraft.js, one folder per aircraft (docs/AIRCRAFT-FOLDER.md).
 *
 * The folders are ES modules whose default export is plain JSON, imported
 * statically so the browser, the servers and the scripts load them alike;
 * scripts/aircraft-folder-selftest.js holds that FOLDERS names every folder
 * on disk and that each is data only, and that the assembled rows equal the
 * hand modules' rows for the aircraft still kept there.
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

import a10inch from '../aircraft/10inch/aircraft.js';
import a7inch from '../aircraft/7inch/aircraft.js';
import cap1702 from '../aircraft/cap1702/aircraft.js';
import p51d1450 from '../aircraft/p51d1450/aircraft.js';
import slick2680 from '../aircraft/slick2680/aircraft.js';

export const FOLDERS = [a10inch, a7inch, cap1702, p51d1450, slick2680];

export const SECTIONS = ['id', 'airframe', 'kit', 'tuning', 'power', 'hangar', 'livery', 'tunes', 'progress', 'strings'];

/* A folder is a boundary: a missing or extra section, or an airframe id
 * that is not the folder's, fails here rather than as a missing row
 * somewhere later. */
export function checkFolder(folder) {
  const keys = Object.keys(folder);
  const missing = SECTIONS.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !SECTIONS.includes(k));
  if (missing.length || extra.length) {
    throw new Error(`aircraft/${folder.id}: missing [${missing}] extra [${extra}]`);
  }
  if (folder.airframe.id !== folder.id) {
    throw new Error(`aircraft/${folder.id}: airframe id ${folder.airframe.id}`);
  }
  return folder;
}

/* A folder states a resting pitch in degrees, as the hand rows write it;
 * the row carries radians, by the same product the hand rows compute, so
 * the double is the same. */
const POSES = new Set(['gear', 'floats']);
const pose = ({ restHeight, restPitchDeg }) => ({ restHeight, restPitch: restPitchDeg * Math.PI / 180 });

function airframeRow(airframe) {
  return Object.fromEntries(Object.entries(airframe).map(([k, v]) => [k, POSES.has(k) ? pose(v) : v]));
}

/* A folder states null for a row its aircraft has none of (a quad has no
 * tuning, a float plane no kit of its own), and the table then has no key
 * for it, as the hand module has none. */
function put(table, id, row) {
  if (row !== null) table[id] = row;
}

/* The tables in the shapes their hand modules export them: AIRFRAMES and
 * TUNES are lists of rows, the rest are keyed by airframe id, DRAWN is the
 * ids whose builders draw their kit. */
export function assemble(folders) {
  const t = {
    AIRFRAMES: [], KITS: {}, DRAWN: [], TUNING: {}, TABLE: {}, POWER: {}, ESTIMATES: {},
    PROPS: {}, ANCHORS: {}, LIVERIES: {}, TUNES: [], PLANE_LEVELS: {}, STRINGS: { en: {}, es: {} },
  };
  for (const f of folders.map(checkFolder)) {
    const id = f.id;
    t.AIRFRAMES.push(airframeRow(f.airframe));
    put(t.KITS, id, f.kit.slots);
    if (f.kit.drawn) t.DRAWN.push(id);
    put(t.TUNING, id, f.tuning);
    put(t.TABLE, id, f.power.table);
    put(t.POWER, id, f.power.options);
    put(t.ESTIMATES, id, f.power.estimates);
    put(t.PROPS, id, f.hangar.props);
    put(t.ANCHORS, id, f.hangar.anchors);
    put(t.LIVERIES, id, f.livery);
    t.TUNES.push(...f.tunes);
    put(t.PLANE_LEVELS, id, f.progress.level);
    Object.assign(t.STRINGS.en, f.strings.en);
    Object.assign(t.STRINGS.es, f.strings.es);
  }
  return t;
}

export const AIRCRAFT = assemble(FOLDERS);
