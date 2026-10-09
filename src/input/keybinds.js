/*
 * keybinds.js: the flight keys a pilot may move to other keys, and the
 * translation that makes a moved key work everywhere the old one did.
 *
 * Every flight action is read in main.js by the code of its default key
 * (input.onKey, `code === 'KeyR'`, and input.keys for the held ones). So
 * a binding does not teach those readers a new key: InputManager.keyDown
 * asks translate() first, and the physical key the pilot chose arrives as
 * the default code. The default key itself, once moved away, arrives as
 * nothing, so it no longer fires the action. With no bindings the
 * translation is the identity and nothing else changes.
 *
 * A binding is for every aircraft or for one airframe id; the airframe's
 * own wins. The stored shape (settings.keybinds, synced as a whole):
 *   { v: 1, all: { <action id>: <code> }, by: { <airframe id>: { <action id>: <code> } } }
 * Only moved actions are stored, so a reset is a delete, and a profile
 * that moved none has no field at all.
 *
 * Keys the flight shell reads for anything not in ACTIONS (the sticks,
 * pause, the swap, the avionics and camera ball keys) are RESERVED and
 * cannot be chosen: a moved action there would take the key from them.
 *
 * Gamepad buttons are not here: the pad's action buttons are read in
 * several modules at fixed indices (docs/KEYBINDS.md says what moving them
 * needs).
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

export const KEYBINDS_VERSION = 1;

/* The flight actions, by the default key main.js reads them at. A new
 * aircraft's key (the Hercules' ramp, the Night Timber's lights) is one
 * more row here. */
export const ACTIONS = [
  { id: 'reset', code: 'KeyR' },
  { id: 'unstick', code: 'KeyX' },
  { id: 'flip', code: 'KeyT' },
  { id: 'launch', code: 'KeyL' },
  { id: 'chute', code: 'KeyP' },
  { id: 'flaps', code: 'KeyF' },
  { id: 'gear', code: 'KeyG' },
  { id: 'smoke', code: 'KeyO' },
  { id: 'view', code: 'KeyC' },
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

/* Read in flight for something else (src/input/keyboard.js, main.js
 * input.onKey and its held keys, src/ui/keys.js flightKey, the builder,
 * the crash cam, push to talk, F3 and F8). */
export const RESERVED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'Escape', 'Tab', 'BracketLeft', 'BracketRight', 'Space', 'Enter', 'Backspace', 'Backquote',
  'KeyH', 'KeyJ', 'KeyK', 'KeyI', 'KeyU', 'KeyY', 'KeyM', 'KeyB', 'KeyV', 'Period', 'Equal', 'Minus', 'PageUp', 'PageDown',
  'F3', 'F8',
]);

/* Keys a pilot can choose: letters, digits, the punctuation on the main
 * block and the function keys, less the reserved ones. */
const CHOOSABLE = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Comma|Slash|Semicolon|Quote|Backslash|Numpad[0-9])$/;

/* Whether any key is moved; settings keep no field until one is. */
export function hasKeybinds(binds) {
  return Boolean(binds) && (Object.keys(binds.all || {}).length > 0 || Object.keys(binds.by || {}).length > 0);
}

export function emptyKeybinds() {
  return { v: KEYBINDS_VERSION, all: {}, by: {} };
}

function cleanMap(m) {
  const out = {};
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    return out;
  }
  for (const [id, code] of Object.entries(m)) {
    if (BY_ID.has(id) && typeof code === 'string' && CHOOSABLE.test(code) && !RESERVED.has(code) && code !== BY_ID.get(id).code) {
      out[id] = code;
    }
  }
  return out;
}

/*
 * A stored (or synced) value as this build holds it. Anything else (a
 * missing field from a profile older than bindings, a hand edit, a key
 * this build reserves) falls back entry by entry, never the whole value.
 * A profile saved with clashing entries keeps the first of each clash.
 */
export function normaliseKeybinds(raw) {
  const out = emptyKeybinds();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return out;
  }
  out.all = dropClashes(cleanMap(raw.all), {});
  if (raw.by && typeof raw.by === 'object' && !Array.isArray(raw.by)) {
    for (const [af, m] of Object.entries(raw.by)) {
      if (!/^[a-z0-9_-]{1,40}$/.test(af)) {
        continue;
      }
      const clean = dropClashes(cleanMap(m), out.all);
      if (Object.keys(clean).length) {
        out.by[af] = clean;
      }
    }
  }
  return out;
}

function dropClashes(own, under) {
  const kept = {};
  for (const [id, code] of Object.entries(own)) {
    const trial = { ...under, ...kept, [id]: code };
    if (!clashIn(effectiveFrom(trial), id)) {
      kept[id] = code;
    }
  }
  return kept;
}

function effectiveFrom(moved) {
  return Object.fromEntries(ACTIONS.map((a) => [a.id, moved[a.id] || a.code]));
}

function clashIn(effective, id) {
  return ACTIONS.find((a) => a.id !== id && effective[a.id] === effective[id]) || null;
}

/* Each action's key on `airframe` (null: the every-aircraft bindings). */
export function effectiveKeys(raw, airframe = null) {
  /* A synced value applied while storage refused the write never went
   * through loadSettings, so it is cleaned here too. */
  const binds = normaliseKeybinds(raw);
  const moved = { ...binds.all, ...((airframe && binds.by[airframe]) || {}) };
  return effectiveFrom(moved);
}

/* Whether this action's key on `airframe` comes from that airframe's own
 * binding. */
export function boundForAircraft(binds, airframe, id) {
  return Boolean(airframe && binds && binds.by && binds.by[airframe] && binds.by[airframe][id]);
}

/*
 * Moves `id` to `code` for every aircraft (airframe null) or one.
 * Returns { ok: true, binds } with a new value, or { ok: false, reason,
 * other } where reason is 'reserved' (the game reads that key for
 * something else) or 'taken' (`other` is the action already on it, on
 * the aircraft named or, for every aircraft, on any aircraft with its own
 * bindings). Choosing the action's default code is a reset of that entry.
 */
export function bind(binds, id, code, airframe = null) {
  const action = BY_ID.get(id);
  if (!action) {
    throw new Error(`no key action '${id}'`);
  }
  if (!CHOOSABLE.test(code) || RESERVED.has(code)) {
    return { ok: false, reason: 'reserved', other: null };
  }
  const next = normaliseKeybinds(binds);
  const layer = airframe ? { ...(next.by[airframe] || {}) } : { ...next.all };
  if (code === action.code) {
    delete layer[id];
  } else {
    layer[id] = code;
  }
  const trialAll = airframe ? next.all : layer;
  const trialBy = airframe ? { ...next.by, [airframe]: layer } : next.by;
  /* A binding for every aircraft must also fit each aircraft that has
   * bindings of its own. */
  for (const af of airframe ? [airframe] : [null, ...Object.keys(trialBy)]) {
    const other = clashIn(effectiveFrom({ ...trialAll, ...((af && trialBy[af]) || {}) }), id);
    if (other) {
      return { ok: false, reason: 'taken', other: other.id };
    }
  }
  if (airframe) {
    next.by = { ...next.by, [airframe]: layer };
    if (!Object.keys(layer).length) {
      delete next.by[airframe];
    }
  } else {
    next.all = layer;
  }
  return { ok: true, binds: next };
}

/* Puts one action back on its default (for every aircraft, or for one,
 * where the every-aircraft binding then applies). */
export function resetAction(binds, id, airframe = null) {
  const next = normaliseKeybinds(binds);
  if (airframe) {
    if (next.by[airframe]) {
      const layer = { ...next.by[airframe] };
      delete layer[id];
      next.by = { ...next.by, [airframe]: layer };
      if (!Object.keys(layer).length) {
        delete next.by[airframe];
      }
    }
  } else {
    const layer = { ...next.all };
    delete layer[id];
    next.all = layer;
  }
  return normaliseKeybinds(next);
}

/*
 * The code a physical key stands for on `airframe`: the default code of
 * the action bound to it, null for a default key whose action moved away,
 * otherwise the key itself.
 */
export function translate(binds, airframe, code) {
  const eff = effectiveKeys(binds, airframe);
  for (const a of ACTIONS) {
    if (eff[a.id] === code) {
      return a.code;
    }
  }
  if (ACTIONS.some((a) => a.code === code)) {
    return null;
  }
  return code;
}

/* A key code as the pilot reads it on the key: 'KeyR' is R, 'Digit4' 4. */
export function keyLabel(code) {
  const m = /^(?:Key|Digit|Numpad)(.+)$/.exec(code);
  if (m) {
    return code.startsWith('Numpad') ? `Num ${m[1]}` : m[1];
  }
  return { Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", Backslash: '\\' }[code] || code;
}
