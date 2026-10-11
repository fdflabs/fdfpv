/*
 * aircraft.js: assembles the id-keyed config tables from aircraft folders,
 * aircraft/<id>/aircraft.json, one folder per aircraft (docs/AIRCRAFT-FOLDER.md).
 *
 * Node only for now: it reads the folders with node:fs. Nothing in the game
 * imports it yet; scripts/aircraft-folder-selftest.js proves its tables
 * equal the hand modules' rows before any module is switched over to it.
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

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const AIRCRAFT_DIR = fileURLToPath(new URL('../aircraft/', import.meta.url));

const SECTIONS = ['id', 'airframe', 'kit', 'tuning', 'power', 'hangar', 'livery', 'tunes', 'progress', 'strings'];

/* A folder is a boundary: a missing or extra section, or a folder name that
 * is not its id, fails here rather than as a missing row somewhere later. */
export function readAircraft(id, dir = AIRCRAFT_DIR) {
  const folder = JSON.parse(readFileSync(join(dir, id, 'aircraft.json'), 'utf8'));
  const keys = Object.keys(folder);
  const missing = SECTIONS.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !SECTIONS.includes(k));
  if (missing.length || extra.length) {
    throw new Error(`aircraft/${id}: missing [${missing}] extra [${extra}]`);
  }
  if (folder.id !== id || folder.airframe.id !== id) {
    throw new Error(`aircraft/${id}: folder id ${folder.id}, airframe id ${folder.airframe.id}`);
  }
  return folder;
}

export function aircraftIds(dir = AIRCRAFT_DIR) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'aircraft.json')))
    .map((e) => e.name)
    .sort();
}

/* The tables in the shapes their hand modules export them: AIRFRAMES and
 * TUNES are lists of rows, the rest are keyed by airframe id, DRAWN is the
 * ids whose builders draw their kit. Airframe fields a hand module computes
 * (configs/airframes.js packStates(), stockRates(), gear.restPitch) are not
 * in the folders yet. */
export function assemble(folders) {
  const t = {
    AIRFRAMES: [], KITS: {}, DRAWN: [], TUNING: {}, TABLE: {}, POWER: {}, ESTIMATES: {},
    PROPS: {}, ANCHORS: {}, LIVERIES: {}, TUNES: [], PLANE_LEVELS: {}, STRINGS: { en: {}, es: {} },
  };
  for (const f of folders) {
    const id = f.id;
    t.AIRFRAMES.push(f.airframe);
    t.KITS[id] = f.kit.slots;
    if (f.kit.drawn) t.DRAWN.push(id);
    t.TUNING[id] = f.tuning;
    t.TABLE[id] = f.power.table;
    t.POWER[id] = f.power.options;
    t.ESTIMATES[id] = f.power.estimates;
    t.PROPS[id] = f.hangar.props;
    t.ANCHORS[id] = f.hangar.anchors;
    t.LIVERIES[id] = f.livery;
    t.TUNES.push(...f.tunes);
    t.PLANE_LEVELS[id] = f.progress.level;
    Object.assign(t.STRINGS.en, f.strings.en);
    Object.assign(t.STRINGS.es, f.strings.es);
  }
  return t;
}

export function loadAircraft(dir = AIRCRAFT_DIR) {
  return assemble(aircraftIds(dir).map((id) => readAircraft(id, dir)));
}
