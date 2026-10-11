/*
 * golden-settings.js: how a golden check writes down a settings object,
 * so that adding a setting changes no golden but settings:golden's own.
 *
 * Several goldens recorded the whole settings object, or its stored JSON,
 * in every scenario. Adding any setting then rewrote hundreds of records,
 * and two pull requests that each added one were each green and red
 * together on main (docs/GOLDENS.md). A scenario is about the fields it
 * sets, so it records those: the fields that differ from DEFAULTS, and
 * '(missing)' for a default the object lacks. DEFAULTS + the record is the
 * whole object, so nothing a scenario held is lost; DEFAULTS themselves
 * are held by settings:golden's constants record.
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

import { DEFAULTS, SETTINGS_KEY } from '../../src/ui/settings.js';

export const MISSING = '(missing)';

export function settingsDelta(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return settings;
  }
  const out = {};
  for (const k of Object.keys(settings)) {
    if (JSON.stringify(settings[k]) !== JSON.stringify(DEFAULTS[k])) {
      out[k] = settings[k];
    }
  }
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in settings)) {
      out[k] = MISSING;
    }
  }
  return out;
}

/* A storage map as a plain object, the stored settings as their delta. A
 * stored value that is not JSON is kept as it is, so a corrupt store still
 * shows. */
export function storeView(store) {
  const out = Object.fromEntries(store);
  if (typeof out[SETTINGS_KEY] === 'string') {
    try {
      out[SETTINGS_KEY] = { vsDefaults: settingsDelta(JSON.parse(out[SETTINGS_KEY])) };
    } catch (e) {
      /* Not JSON: recorded as stored. */
    }
  }
  return out;
}

/* The inverse, for the migration check: the whole object back. */
export function settingsFromDelta(delta) {
  const out = structuredClone(DEFAULTS);
  for (const [k, v] of Object.entries(delta)) {
    if (v === MISSING) {
      delete out[k];
    } else {
      out[k] = v;
    }
  }
  return out;
}
