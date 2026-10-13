/*
 * bindings.js: the rules every table of moved controls follows, for the
 * keyboard (keybinds.js) and the pad (padbinds.js) alike.
 *
 * A table is a list of actions, each with a default control (null: none)
 * and the test a control must pass to be chosen at all. The stored shape:
 *   { v: 1, all: { <action id>: <control> }, by: { <airframe id>: { <action id>: <control> } } }
 * Only moved actions are stored, so a reset is a delete and a profile that
 * moved none has no field. The airframe's own binding wins on that
 * airframe. No two actions share a control where both apply.
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

export const BINDINGS_VERSION = 1;

/* `actions` is [{ id, def }]; `allowed(control)` is whether a pilot may
 * choose it. */
export function bindingTable(actions, allowed) {
  const byId = new Map(actions.map((a) => [a.id, a]));

  const empty = () => ({ v: BINDINGS_VERSION, all: {}, by: {} });

  function has(binds) {
    return Boolean(binds) && (Object.keys(binds.all || {}).length > 0 || Object.keys(binds.by || {}).length > 0);
  }

  function cleanMap(m) {
    const out = {};
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      return out;
    }
    for (const [id, control] of Object.entries(m)) {
      if (byId.has(id) && typeof control === 'string' && allowed(control) && control !== byId.get(id).def) {
        out[id] = control;
      }
    }
    return out;
  }

  function effectiveFrom(moved) {
    return Object.fromEntries(actions.map((a) => [a.id, moved[a.id] || a.def]));
  }

  function clashIn(effective, id) {
    return effective[id] === null ? null : actions.find((a) => a.id !== id && effective[a.id] === effective[id]) || null;
  }

  function dropClashes(own, under) {
    const kept = {};
    for (const [id, control] of Object.entries(own)) {
      const trial = { ...under, ...kept, [id]: control };
      if (!clashIn(effectiveFrom(trial), id)) {
        kept[id] = control;
      }
    }
    return kept;
  }

  /* A stored (or synced) value as this build holds it. Anything else (a
   * missing field, a hand edit, a control this build refuses) falls back
   * entry by entry, never the whole value. A saved clash keeps the first. */
  function normalise(raw) {
    const out = empty();
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

  /* Each action's control on `airframe` (null: the every-aircraft
   * bindings). A synced value applied while storage refused the write
   * never went through loadSettings, so it is cleaned here too. */
  function effective(raw, airframe = null) {
    const binds = normalise(raw);
    return effectiveFrom({ ...binds.all, ...((airframe && binds.by[airframe]) || {}) });
  }

  function boundForAircraft(binds, airframe, id) {
    return Boolean(airframe && binds && binds.by && binds.by[airframe] && binds.by[airframe][id]);
  }

  /*
   * Moves `id` to `control` for every aircraft (airframe null) or one.
   * { ok: true, binds } with a new value, or { ok: false, reason, other }:
   * 'reserved' (not a control a pilot may choose) or 'taken' (`other` is
   * the action already on it, on the aircraft named or, for every
   * aircraft, on any aircraft with bindings of its own). Choosing the
   * default is a reset of that entry.
   */
  function bind(binds, id, control, airframe = null) {
    const action = byId.get(id);
    if (!action) {
      throw new Error(`no action '${id}'`);
    }
    if (!allowed(control)) {
      return { ok: false, reason: 'reserved', other: null };
    }
    const next = normalise(binds);
    const layer = airframe ? { ...(next.by[airframe] || {}) } : { ...next.all };
    if (control === action.def) {
      delete layer[id];
    } else {
      layer[id] = control;
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
  function reset(binds, id, airframe = null) {
    const next = normalise(binds);
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
    return normalise(next);
  }

  return { empty, has, normalise, effective, boundForAircraft, bind, reset };
}
