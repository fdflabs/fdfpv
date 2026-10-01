/*
 * builds.js: My Hangar, the pilot's saved builds.
 *
 * The owner, 2026-10-01: after choosing a plane and customising it, store
 * the model in "My Hangar", "that way I could even have 2 or 3 of the same
 * plane, for different purposes". A BUILD is a name, the airframe it is
 * built on (a float version is its own airframe, so the floats are in it)
 * and a FIT: everything the hangar's Customise changes,
 *
 *   livery   the paint entry, configs/liveries.js normaliseEntry
 *   power    the motor or engine and the pack or tank, configs/power.js
 *   parts    the prop and the add-ons, configs/hangar-parts.js (never the
 *            damage: that is the airframe's last crash, not a build's)
 *   tuning   the bench setup, configs/tuning.js
 *   combat   a combat quad's payload and accessories, configs/combat.js
 *
 * THE SLOTS STAY THE TRUTH. What is flown, drawn and sent to a room has
 * always been read from the per airframe settings (settings.livery,
 * .power, .parts, .tuning), by every reader in src/main.js and by the room
 * profile on the wire. Choosing a build FITS it: its fit is written into
 * those slots (and settings.combat), and what they held before, the
 * pilot's own customisation of
 * the stock aircraft, is kept in settings.buildFits beside it until the
 * stock aircraft is chosen again, which puts it back. So every reader,
 * the seat, the swap and the wire carry on unchanged, and nothing a pilot
 * customised before My Hangar existed moves.
 *
 * settings.buildFits, by land plane id (one fit per family, as the paint
 * is one per family): { build, airframe, stock: { [airframe id]: fit } }.
 * The builds themselves are under their own localStorage key, BUILDS_KEY.
 *
 * Pure and DOM free apart from the storage calls, which are guarded:
 * scripts import it in Node.
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

import { AIRFRAMES, airframeById, landPlaneOf } from '../../configs/airframes.js';
import { liveryKey, normaliseEntry, paintable } from '../../configs/liveries.js';
import { choosesPower, powerChoice } from '../../configs/power.js';
import { STOCK_ONLY, hasMotors } from '../../configs/motors.js';
import { normalizeEntry, setupFor, tuningFor } from '../../configs/tuning.js';
import { normalisePlane } from '../../configs/hangar-parts.js';
import { cleanName } from '../../configs/paint.js';
import { combatChoice } from '../../configs/combat.js';
import { badWordIn } from '../../tracks-api/words.js';

export const BUILDS_KEY = 'webfpv.builds.v1';
/* Enough for three of every plane with room over; a list this long is
 * still one swipe a build. */
export const MAX_BUILDS = 48;

const isRecord = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/* An aircraft the hangar opens on: every plane and combat aircraft
 * (configs/liveries.js paintable), and a quad for its motors
 * (configs/motors.js). */
export function customisable(id) {
  return paintable(id) || hasMotors(id) || Object.hasOwn(STOCK_ONLY, id);
}

/* An airframe a build can be made on: one the hangar opens. */
export function buildable(id) {
  return typeof id === 'string' && airframeById(id).id === id && customisable(id);
}

/* A fit, valid for this airframe: whatever it cannot fly dropped back to
 * stock, the same judges loadSettings uses for the slots. */
export function normaliseFit(id, fit) {
  const f = isRecord(fit) ? fit : {};
  const power = choosesPower(id) && isRecord(f.power) ? powerChoice(id, { [id]: f.power }) : null;
  const plane = isRecord(f.parts) ? normalisePlane(id, { ...f.parts, damage: null }) : null;
  const tuning = tuningFor(id) && isRecord(f.tuning)
    ? normalizeEntry(id, f.tuning, setupFor(id, powerChoice(id, power ? { [id]: power } : {})).limits)
    : null;
  const combat = airframeById(id).combat && isRecord(f.combat) ? combatChoice(airframeById(id), f.combat) : null;
  return {
    livery: normaliseEntry(liveryKey(id), f.livery) ?? null,
    power,
    parts: plane ? { prop: plane.prop, addons: plane.addons } : null,
    tuning: tuning ?? null,
    combat,
  };
}

/* What the slots hold for one airframe now. */
export function fitOf(s, id) {
  return normaliseFit(id, {
    livery: s.livery && s.livery[liveryKey(id)],
    power: s.power && s.power[id],
    parts: s.parts && s.parts[id],
    tuning: s.tuning && s.tuning[id],
    combat: s.combat && s.combat[id],
  });
}

function withEntry(map, key, value) {
  const out = { ...(isRecord(map) ? map : {}) };
  if (value) {
    out[key] = value;
  } else {
    delete out[key];
  }
  return out;
}

/* A fit into the slots of one airframe, each map replaced rather than
 * written through, since a settings map may be DEFAULTS' own. The parts
 * keep the airframe's own damage. */
export function putFit(s, id, fit) {
  s.livery = withEntry(s.livery, liveryKey(id), fit.livery);
  if (choosesPower(id)) {
    s.power = withEntry(s.power, id, fit.power);
  }
  const damage = s.parts && isRecord(s.parts[id]) ? s.parts[id].damage : null;
  s.parts = withEntry(s.parts, id, normalisePlane(id, { prop: 'stock', addons: [], ...(fit.parts ?? {}), damage }));
  if (tuningFor(id)) {
    s.tuning = withEntry(s.tuning, id, fit.tuning);
  }
  if (airframeById(id).combat) {
    s.combat = withEntry(s.combat, id, fit.combat);
  }
  return s;
}

function familyOf(land) {
  return AIRFRAMES.filter((a) => landPlaneOf(a.id) === land).map((a) => a.id);
}

/* The pilot's own customisation back in the slots of a family wearing a
 * build. Whether anything moved. */
export function unfitFamily(s, id) {
  const land = landPlaneOf(id);
  const e = isRecord(s.buildFits) ? s.buildFits[land] : null;
  if (!e) {
    return false;
  }
  for (const [af, fit] of Object.entries(e.stock)) {
    putFit(s, af, fit);
  }
  s.buildFits = withEntry(s.buildFits, land, null);
  return true;
}

/* A build into the slots of its airframe, the family's own customisation
 * kept to come back. */
export function fitBuild(s, build) {
  unfitFamily(s, build.airframe);
  const land = landPlaneOf(build.airframe);
  const stock = Object.fromEntries(familyOf(land).map((af) => [af, fitOf(s, af)]));
  putFit(s, build.airframe, build.fit);
  s.buildFits = withEntry(s.buildFits, land, { build: build.id, airframe: build.airframe, stock });
  return s;
}

/* The build an airframe is wearing, or null. */
export function fittedBuild(s, id) {
  const e = isRecord(s.buildFits) ? s.buildFits[landPlaneOf(id)] : null;
  return e && e.airframe === id ? e.build : null;
}

/* Whether the family wears a build at all, on whichever version. */
export function familyFitted(s, id) {
  return Boolean(isRecord(s.buildFits) && s.buildFits[landPlaneOf(id)]);
}

/* The stock aircraft's customisation, wherever it is kept now. */
export function stockFit(s, id) {
  const e = isRecord(s.buildFits) ? s.buildFits[landPlaneOf(id)] : null;
  return e && e.stock[id] ? e.stock[id] : fitOf(s, id);
}

/* And written there. */
export function setStockFit(s, id, fit) {
  const land = landPlaneOf(id);
  const e = isRecord(s.buildFits) ? s.buildFits[land] : null;
  if (!e) {
    putFit(s, id, fit);
    return;
  }
  s.buildFits = withEntry(s.buildFits, land, { ...e, stock: { ...e.stock, [id]: fit } });
}

/*
 * The settings as they would be with every build taken off: what a signed
 * in pilot's sync carries (src/ui/accountui.js), so a build never reaches
 * another computer as the stock plane's paint. A copy; `s` is untouched.
 */
export function stockView(s) {
  const v = { ...s };
  for (const land of Object.keys(isRecord(s.buildFits) ? s.buildFits : {})) {
    unfitFamily(v, land);
  }
  return v;
}

/* settings.buildFits as loadSettings keeps it. */
export function normaliseBuildFits(raw) {
  const out = {};
  if (!isRecord(raw)) {
    return out;
  }
  for (const [land, e] of Object.entries(raw)) {
    if (!buildable(land) || landPlaneOf(land) !== land || !isRecord(e) || typeof e.build !== 'string'
      || !buildable(e.airframe) || landPlaneOf(e.airframe) !== land || !isRecord(e.stock)) {
      continue;
    }
    const stock = {};
    for (const af of familyOf(land)) {
      if (isRecord(e.stock[af])) {
        stock[af] = normaliseFit(af, e.stock[af]);
      }
    }
    out[land] = { build: e.build.slice(0, 40), airframe: e.airframe, stock };
  }
  return out;
}

/* A name as a build keeps it, or why not: 'empty' or 'rude', each a
 * sentence in the strings as mine.name_<error>. */
export function checkBuildName(name) {
  const clean = cleanName(name);
  if (!clean) {
    return { error: 'empty' };
  }
  if (badWordIn(clean)) {
    return { error: 'rude' };
  }
  return { name: clean };
}

function normaliseBuild(b) {
  if (!isRecord(b) || typeof b.id !== 'string' || !/^[a-z0-9]{1,40}$/.test(b.id) || !buildable(b.airframe)) {
    return null;
  }
  const named = checkBuildName(b.name);
  if (!named.name) {
    return null;
  }
  const t = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return {
    id: b.id, name: named.name, airframe: b.airframe, fit: normaliseFit(b.airframe, b.fit), created: t(b.created), updated: t(b.updated),
  };
}

/* The stored list, made safe: a build on an airframe this version does
 * not have, or a name the filter refuses, is dropped, one id once. */
export function normaliseBuilds(raw) {
  const list = isRecord(raw) && Array.isArray(raw.builds) ? raw.builds : [];
  const out = [];
  for (const b of list) {
    const clean = normaliseBuild(b);
    if (clean && out.length < MAX_BUILDS && !out.some((x) => x.id === clean.id)) {
      out.push(clean);
    }
  }
  return out;
}

export function loadBuilds() {
  try {
    return normaliseBuilds(JSON.parse(globalThis.localStorage.getItem(BUILDS_KEY) || '{}'));
  } catch (e) {
    return [];
  }
}

export function saveBuilds(list) {
  try {
    globalThis.localStorage.setItem(BUILDS_KEY, JSON.stringify({ v: 1, builds: list }));
  } catch (e) {
    /* private mode: the builds live as long as the page */
  }
}

export function newBuildId(now = Date.now()) {
  return `${now.toString(36)}${Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

/* The card key a build has in the picker, beside the airframe ids. */
export const BUILD_PREFIX = 'build:';
