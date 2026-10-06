/*
 * model.js: the track document, made, read, repaired and written.
 *
 * The format is described in schema.md beside this file. In short: a field
 * track (version 3, and the 1 and 2 it reads) lays elements out on a field
 * of its own; a world track (version 4) stands them at absolute poses in one
 * of the simulator's maps and carries the map's id. `sequence` is the course,
 * one entry per opening flown.
 *
 * WRITTEN BYTES ARE A CONTRACT. The tracks server stores what serialize()
 * writes, the board fingerprints a layout from what toPlain() returns, and
 * both compare exactly, so key order, rounding and every default below are
 * the format, not presentation. tests/fixtures/trackbuilder pins them.
 *
 * READING NEVER THROWS. A document is untrusted input from storage, a file
 * or the network. normalize() takes anything, keeps what is usable, fills
 * what is missing, drops what cannot be repaired and says what it dropped.
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
  ELEMENTS, KIND, TRACK_CLASS_DEFAULT, apertureLevels, defaultDims, defaultPitch, defaultZ, elementHeight,
  normalizeFlagSide, trackClassOf, tuningFor,
} from './elements.js';
import { apertureFrame, wrapAngle } from './geometry.js';
import { str } from '../strings/index.js';

/* What a field track is written as. Version 2 stopped writing the single
 * branding.logo; 3 added trackClass. normalize() reads 1 and 2 as well. */
export const SCHEMA_VERSION = 3;

/* What a world track is written as, and only a world track: a board from
 * before world tracks accepts 1 to 3, so a field track stays a 3. */
export const MAP_SCHEMA_VERSION = 4;

/* A map id as src/maps/registry.js spells them. It picks a world to load, so
 * it is checked as untrusted input. The version is not looked at here. */
const MAP_ID = /^[a-z0-9]{1,24}$/;

export function isMapTrack(doc) {
  return typeof doc?.map === 'string' && MAP_ID.test(doc.map);
}

/* One logo: a base64 data URL of a raster image, no larger than this. The
 * image travels inside the track, and it ends up in a texture loader, so a
 * URL that would fetch something is refused outright. */
export const LOGO_MAX_CHARS = 256 * 1024;
const LOGO_URL = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

export function isUsableLogo(value) {
  return typeof value === 'string' && value.length <= LOGO_MAX_CHARS && LOGO_URL.test(value);
}

/* At most five logos, sharing one budget, which is what keeps a published
 * course inside the board's own size limit. */
export const LOGO_SLOTS = 5;
export const BRANDING_MAX_CHARS = 384 * 1024;

export function logosOf(doc) {
  return doc?.branding?.logos ?? [];
}

/* The logo a ground logo is painted with: the one it names, the course's
 * first when it names none, and null when that logo is gone. A missing logo
 * is drawn as missing rather than swapped for another sponsor's. */
export function logoForDecal(doc, el) {
  const logos = logosOf(doc);
  if (!el?.logoId) {
    return logos[0] ?? null;
  }
  return logos.find((logo) => logo.id === el.logoId) ?? null;
}

/* ------------------------------------------------------------------ */
/* Small readers for untrusted values.                                 */
/* ------------------------------------------------------------------ */

const isRecord = (v) => v !== null && typeof v === 'object';

/* Six decimals: a micrometre, and short enough that export, import, export
 * gives the same bytes. Decimal rounding, as the printed number reads. A
 * value that is not a finite number is written as 0, so no NaN or string
 * ever reaches a stored document. */
function round6(x) {
  return typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(6)) : 0;
}

/* What Number() makes of a value when that is finite, else undefined. So a
 * numeric string reads as its number, and null, false, '' and [] read as 0,
 * which is what documents in the wild have always been read as. */
function finite(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function numberOr(v, fallback) {
  const n = finite(v);
  return n === undefined ? fallback : n;
}

/* Seconds resolution, the way the format writes times. */
function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/* Copies, not references: a document must never share an object with a
 * caller that might edit it. */
export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

/* ------------------------------------------------------------------ */
/* Ids                                                                 */
/* ------------------------------------------------------------------ */

/* One more than the largest number among ids spelled `<prefix><digits>`,
 * so an id freed by a delete or an undo is never handed out again. */
function nextNumber(ids, prefix) {
  let top = 0;
  for (const id of ids) {
    if (typeof id !== 'string' || !id.startsWith(prefix)) {
      continue;
    }
    const digits = id.slice(prefix.length);
    if (/^\d+$/.test(digits)) {
      top = Math.max(top, Number(digits));
    }
  }
  return top + 1;
}

export function newElementId(doc) {
  return `el-${nextNumber(doc.elements.map((el) => el.id), 'el-')}`;
}

export function newSequenceId(doc) {
  return `sq-${nextNumber(doc.sequence.map((s) => s.id), 'sq-')}`;
}

/* Random, not derived from the contents: two identical tracks are still two
 * tracks. */
export function newTrackId() {
  const hex = Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `trk-${hex}`;
}

/* ------------------------------------------------------------------ */
/* Making things                                                       */
/* ------------------------------------------------------------------ */

const CREDIT_FIELDS = ['designer', 'series', 'sponsor', 'source', 'broughtOverBy', 'note'];
const CREDIT_MAX = 120;

export function createTrack(name, cls = TRACK_CLASS_DEFAULT) {
  const trackClass = trackClassOf({ trackClass: cls });
  const tuning = tuningFor(trackClass);
  const now = utcNow();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newTrackId(),
    name,
    createdUtc: now,
    modifiedUtc: now,
    trackClass,
    field: { width: tuning.fieldWidth, depth: tuning.fieldDepth, gridSize: tuning.gridSize },
    settings: {
      tangentScale: tuning.tangentScale,
      minCurveRadius: tuning.minCurveRadius,
      samplesPerSegment: tuning.samplesPerSegment,
    },
    branding: { logos: [] },
    credit: null,
    elements: [],
    sequence: [],
  };
}

/* A track standing in one of the simulator's worlds. It keeps a field,
 * because the format has one and a reader that does not know worlds needs
 * something to draw on. */
export function createMapTrack(name, mapId) {
  const doc = createTrack(name);
  doc.schemaVersion = MAP_SCHEMA_VERSION;
  doc.map = mapId;
  return doc;
}

/* A new element. It carries its own copy of the default dims, so editing a
 * default never resizes a track already built. The caller adds it. */
export function createElement(doc, type, position, yaw = 0) {
  const def = ELEMENTS[type];
  if (!def) {
    throw new Error(`unknown element type: ${type}`);
  }
  const el = {
    id: newElementId(doc),
    type,
    name: '',
    position: {
      x: round6(numberOr(position.x, 0)),
      y: round6(numberOr(position.y, 0)),
      z: round6(numberOr(position.z ?? defaultZ(type), 0)),
    },
    yaw: round6(yaw),
    pitch: round6(defaultPitch(type)),
    yawOverridden: false,
    dims: defaultDims(type, trackClassOf(doc)),
  };
  /* A new ground logo wears the course's first logo until told otherwise. */
  Object.assign(el, extrasFor(def, { logoId: logosOf(doc)[0]?.id }));
  return el;
}

/* A new sequence entry: one opening of one element, which is why it names
 * the pair. A ladder flown twice is two entries on one element. The caller
 * adds it. */
export function createSequenceEntry(doc, elementId, apertureIndex = 0) {
  const el = elementById(doc, elementId);
  if (!el) {
    throw new Error(`no such element: ${elementId}`);
  }
  if (!isSequenceable(el)) {
    throw new Error(`a ${el.type} is never part of the course`);
  }
  const base = { id: newSequenceId(doc), elementId };
  if (kindOf(el) === KIND.MARKER) {
    return {
      ...base, apertureIndex: null, entry: null, passSide: 'left', clearance: el.dims?.clearance ?? defaultDims(el.type).clearance,
      overridden: false,
    };
  }
  const top = aperturesOf(el).length - 1;
  return {
    ...base, apertureIndex: Math.max(0, Math.min(Math.round(apertureIndex), top)), entry: 0, passSide: null, clearance: null, overridden: false,
  };
}

/* ------------------------------------------------------------------ */
/* Reading a document                                                  */
/* ------------------------------------------------------------------ */

export function elementById(doc, id) {
  return doc.elements.find((el) => el.id === id);
}

export function defOf(el) {
  return ELEMENTS[el.type];
}

export function kindOf(el) {
  return ELEMENTS[el.type]?.kind;
}

/* Only openings and markers are flown; obstacles, pads, text and paint are
 * never part of the course. */
export function isSequenceable(el) {
  const kind = kindOf(el);
  return kind === KIND.APERTURE || kind === KIND.MARKER;
}

/*
 * Which logo each structure wears, as element id to its place in the deal.
 * Structures are counted in flying order, once each however often they are
 * flown, and only openings count: a flag or a cone carries no vinyl. The
 * world and the builder's preview both read this, so they dress a course
 * the same way.
 */
export function dressOrder(doc) {
  const order = new Map();
  for (const s of doc.sequence) {
    const el = elementById(doc, s.elementId);
    if (el && kindOf(el) === KIND.APERTURE && !order.has(el.id)) {
      order.set(el.id, order.size);
    }
  }
  return order;
}

export function startPadsOf(doc) {
  return doc.elements.find((el) => el.type === 'startPads');
}

export function aperturesOf(el) {
  return kindOf(el) === KIND.APERTURE ? apertureLevels(el.dims) : [];
}

/* The middle of one opening in the document frame: the base raised by the
 * opening's centre height. A tilt turns the opening about this point, so it
 * does not move it. Anything without that opening answers its base. */
export function apertureCenter(el, index) {
  const levels = aperturesOf(el);
  const level = levels[Math.min(Math.max(index, 0), levels.length - 1)];
  const p = el.position;
  return level ? { x: p.x, y: p.y, z: p.z + level.centerH } : { x: p.x, y: p.y, z: p.z };
}

/* Where a sequence entry's knot sits before path.js moves a marker's knot
 * off to its pass side. Null for an entry whose element is gone. */
export function entryAnchor(doc, seq) {
  const el = elementById(doc, seq.elementId);
  if (!el) {
    return null;
  }
  return apertureCenter(el, seq.apertureIndex ?? 0);
}

/* The facing of a structure's openings before an entry's sign. All the
 * openings of one structure share it. */
export function elementNormal(el) {
  return apertureFrame(el.yaw, el.pitch).normal;
}

export function topOf(el) {
  return el.position.z + elementHeight(defOf(el), el.dims);
}

export function sequenceRefCount(doc, elementId) {
  return doc.sequence.filter((s) => s.elementId === elementId).length;
}

/* ------------------------------------------------------------------ */
/* Repair                                                              */
/* ------------------------------------------------------------------ */

/* The keys only some types carry, in the order they are written. */
function extrasFor(def, raw) {
  const out = {};
  if (def.flagSide) {
    out.flagSide = normalizeFlagSide(raw.flagSide, def.flagSide);
  }
  if (def.id === 'label') {
    out.text = typeof raw.text === 'string' ? raw.text : def.label;
  }
  if (def.kind === KIND.DECAL) {
    out.logoId = typeof raw.logoId === 'string' ? raw.logoId : '';
  }
  return out;
}

/* Dims as the type defines them: every key the defaults have, each a
 * non-negative number, levels a whole count from one to MAX_LEVELS. */
/* The tallest stack a document may describe. */
const MAX_LEVELS = 24;

function repairDims(raw, defaults) {
  const src = isRecord(raw) ? raw : {};
  const out = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const n = finite(src[key]);
    if (n === undefined) {
      out[key] = fallback;
    } else if (key === 'levels') {
      out[key] = Math.min(MAX_LEVELS, Math.max(1, Math.round(n)));
    } else {
      out[key] = round6(Math.max(0, n));
    }
  }
  return out;
}

/* A unit quaternion, or the rest pose for anything that is not one. */
function repairOrientation(raw) {
  const rest = { w: 1, x: 0, y: 0, z: 0 };
  if (!isRecord(raw)) {
    return rest;
  }
  const parts = ['w', 'x', 'y', 'z'].map((k) => finite(raw[k]));
  if (parts.includes(undefined)) {
    return rest;
  }
  const [w, x, y, z] = parts;
  const n = Math.sqrt(w * w + x * x + y * y + z * z);
  if (n <= 1e-9) {
    return rest;
  }
  return { w: round6(w / n), x: round6(x / n), y: round6(y / n), z: round6(z / n) };
}

function repairPosition(raw) {
  const src = isRecord(raw) ? raw : {};
  return { x: round6(numberOr(src.x, 0)), y: round6(numberOr(src.y, 0)), z: round6(numberOr(src.z, 0)) };
}

const HALF_TURN_UP = Math.PI / 2;

function repairElement(raw, id, onMap) {
  const def = ELEMENTS[raw.type];
  const el = {
    id,
    type: raw.type,
    name: typeof raw.name === 'string' ? raw.name : '',
    position: repairPosition(raw.position),
    /* Rounded before the wrap as well as after: a stored 3.141593 must wrap
     * as the 3.141593 it was written as. */
    yaw: round6(wrapAngle(round6(numberOr(raw.yaw, 0)))),
    pitch: round6(Math.min(HALF_TURN_UP, Math.max(-HALF_TURN_UP, numberOr(raw.pitch, defaultPitch(raw.type))))),
    yawOverridden: raw.yawOverridden === true,
    /* Missing sizes are filled at full size whatever the class: a document
     * stores the sizes it was built with, and older ones had no class. */
    dims: repairDims(raw.dims, defaultDims(raw.type)),
  };
  Object.assign(el, extrasFor(def, raw));
  if (raw.unbuilt === true && def.kind === KIND.APERTURE) {
    el.unbuilt = true;
  }
  if (onMap) {
    el.orientation = repairOrientation(raw.orientation);
  }
  return el;
}

/* The definition of a type a document names. Own keys only: a type spelled
 * like an Object prototype member ("toString") is an unknown type. */
function definitionOf(type) {
  return typeof type === 'string' && Object.hasOwn(ELEMENTS, type) ? ELEMENTS[type] : undefined;
}

function repairElements(rawList, onMap, repairs) {
  const list = (Array.isArray(rawList) ? rawList : []).map((el) => (isRecord(el) ? el : {}));
  let spare = nextNumber(list.map((el) => el.id), 'el-');
  const taken = new Set();
  const out = [];
  let pads = false;
  for (const raw of list) {
    const def = definitionOf(raw.type);
    if (!def) {
      repairs.push(str('model.dropped_an_element_of_unknown_type', { type: typeof raw.type === 'string' ? raw.type : '' }));
      continue;
    }
    if (def.wing && !onMap) {
      repairs.push(str('model.dropped_a_plane_sized_element_from', { label: def.label }));
      continue;
    }
    if (def.kind === KIND.START) {
      if (pads) {
        repairs.push(str('model.dropped_a_second_set_of_start'));
        continue;
      }
      pads = true;
    }
    let id = raw.id;
    if (typeof id !== 'string' || id === '' || taken.has(id)) {
      id = `el-${spare}`;
      spare += 1;
      repairs.push(str('model.an_element_had_a_missing_or', { id }));
    }
    taken.add(id);
    out.push(repairElement(raw, id, onMap));
  }
  return out;
}

function repairEntry(raw, el, id, repairs) {
  const overridden = raw.overridden === true;
  if (kindOf(el) === KIND.MARKER) {
    const clearance = finite(raw.clearance);
    return {
      id,
      elementId: el.id,
      apertureIndex: null,
      entry: null,
      passSide: raw.passSide === 'right' ? 'right' : 'left',
      clearance: clearance === undefined ? el.dims.clearance : round6(Math.max(0, clearance)),
      overridden,
    };
  }
  const count = aperturesOf(el).length;
  /* Compared rather than Math.max'ed: a -0 index stays -0, as it always
   * has, and the document bytes do not move. */
  let index = Math.round(numberOr(raw.apertureIndex, 0));
  if (index < 0) {
    index = 0;
  }
  if (index > count - 1) {
    repairs.push(str('model.sequence_entry_asked_for_level_of', {
      id, v2: index + 1, count, label: ELEMENTS[el.type].label, v5: count,
    }));
    index = count - 1;
  }
  const sign = Math.round(Math.min(1, Math.max(-1, numberOr(raw.entry, 0))));
  return {
    id, elementId: el.id, apertureIndex: index, entry: sign === 0 ? 0 : sign, passSide: null, clearance: null, overridden,
  };
}

function repairSequence(rawList, elements, repairs) {
  const list = Array.isArray(rawList) ? rawList : [];
  const byId = new Map(elements.map((el) => [el.id, el]));
  const out = [];
  const taken = new Set();
  for (const item of list) {
    const raw = isRecord(item) ? item : {};
    const el = byId.get(raw.elementId);
    if (!el) {
      repairs.push(str('model.dropped_a_sequence_entry_pointing_at', { elementId: typeof raw.elementId === 'string' ? raw.elementId : '' }));
      continue;
    }
    if (!isSequenceable(el)) {
      repairs.push(str('model.dropped_a_sequence_entry_for_a', { label: ELEMENTS[el.type].label }));
      continue;
    }
    let id = raw.id;
    if (typeof id !== 'string' || id === '' || taken.has(id)) {
      id = `sq-${nextNumber(taken, 'sq-')}`;
      repairs.push(str('model.a_sequence_entry_had_a_missing', { id }));
    }
    taken.add(id);
    out.push(repairEntry(raw, el, id, repairs));
  }
  return out;
}

/* Logos from either spelling: version 1's single branding.logo, promoted
 * silently because it is an upgrade, or the list. */
function repairBranding(raw, repairs) {
  const src = isRecord(raw) ? raw : {};
  let entries = [];
  if (Array.isArray(src.logos)) {
    entries = src.logos.map((e) => (isRecord(e) ? e : { image: e }));
  } else if (src.logo != null && src.logo !== '') {
    entries = [{ image: src.logo, name: src.logoName }];
  }
  const usable = entries.filter((e) => isUsableLogo(e.image));
  const refused = entries.length - usable.length;
  if (refused) {
    repairs.push(str('model.dropped_logo_that_not_an_embedded', {
      dropped: refused, v2: refused === 1 ? '' : 's', v3: refused === 1 ? 'was' : 'were', v4: LOGO_MAX_CHARS / 1024,
    }));
  }
  const logos = [];
  const taken = new Set();
  let budget = BRANDING_MAX_CHARS;
  for (const e of usable) {
    if (logos.length === LOGO_SLOTS || e.image.length > budget) {
      break;
    }
    budget -= e.image.length;
    let id = e.id;
    if (typeof id !== 'string' || id === '' || taken.has(id)) {
      id = `logo-${nextNumber(taken, 'logo-')}`;
    }
    taken.add(id);
    logos.push({ id, image: e.image, name: typeof e.name === 'string' ? e.name : '' });
  }
  const overflowed = usable.length - logos.length;
  if (overflowed) {
    repairs.push(str('model.dropped_logo_past_the_a_track', {
      overflowed, v2: overflowed === 1 ? '' : 's', LOGO_SLOTS, v4: BRANDING_MAX_CHARS / 1024,
    }));
  }
  return { logos };
}

function repairCredit(raw) {
  if (!isRecord(raw)) {
    return null;
  }
  const credit = {};
  for (const key of CREDIT_FIELDS) {
    credit[key] = typeof raw[key] === 'string' ? raw[key].trim().slice(0, CREDIT_MAX) : '';
  }
  return CREDIT_FIELDS.some((key) => credit[key]) ? credit : null;
}

function repairField(raw) {
  const src = isRecord(raw) ? raw : {};
  return {
    width: round6(Math.max(5, numberOr(src.width, 60))),
    depth: round6(Math.max(5, numberOr(src.depth, 40))),
    gridSize: round6(Math.max(0.005, numberOr(src.gridSize, 1))),
  };
}

function repairSettings(raw) {
  const src = isRecord(raw) ? raw : {};
  return {
    tangentScale: round6(Math.max(0.01, numberOr(src.tangentScale, 1.1))),
    minCurveRadius: round6(Math.max(0.1, numberOr(src.minCurveRadius, 2.5))),
    samplesPerSegment: Math.min(512, Math.max(4, Math.round(numberOr(src.samplesPerSegment, 48)))),
  };
}

/* Any value at all, up to the current format. Returns { doc, repairs }. */
export function normalize(raw) {
  const src = isRecord(raw) ? raw : {};
  const repairs = [];
  const said = finite(src.schemaVersion);
  const version = said === undefined ? undefined : Math.round(said);
  if (version > MAP_SCHEMA_VERSION) {
    repairs.push(str('model.document_says_schemaversion_this_build_understands', {
      version, SCHEMA_VERSION: MAP_SCHEMA_VERSION,
    }));
  }
  const onMap = version >= MAP_SCHEMA_VERSION && isMapTrack(src);
  const trackClass = ['full', 'wing', 'micro'].includes(src.trackClass) ? src.trackClass : TRACK_CLASS_DEFAULT;
  const now = utcNow();
  const doc = {
    schemaVersion: onMap ? MAP_SCHEMA_VERSION : SCHEMA_VERSION,
    id: typeof src.id === 'string' ? src.id : newTrackId(),
    name: typeof src.name === 'string' ? src.name : str('ui.untitled_track'),
    createdUtc: typeof src.createdUtc === 'string' ? src.createdUtc : now,
    modifiedUtc: typeof src.modifiedUtc === 'string' ? src.modifiedUtc : now,
    trackClass,
    field: repairField(src.field),
    settings: repairSettings(src.settings),
    branding: repairBranding(src.branding, repairs),
    credit: repairCredit(src.credit),
  };
  doc.elements = repairElements(src.elements, onMap, repairs);
  doc.sequence = repairSequence(src.sequence, doc.elements, repairs);
  if (onMap) {
    doc.map = src.map;
  }
  return { doc, repairs };
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

function plainNumbers(record) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = typeof v === 'number' ? round6(v) : v;
  }
  return out;
}

function plainElement(el, onMap) {
  const out = {
    id: el.id,
    type: el.type,
    name: el.name,
    position: plainNumbers(el.position),
    yaw: round6(el.yaw),
    pitch: round6(el.pitch),
    yawOverridden: el.yawOverridden,
    dims: plainNumbers(el.dims),
  };
  for (const key of ['flagSide', 'text', 'logoId']) {
    if (el[key] !== undefined) {
      out[key] = el[key];
    }
  }
  if (el.unbuilt === true) {
    out.unbuilt = true;
  }
  if (onMap) {
    /* Written through the same repair as it is read, so what is written is
     * a unit quaternion to the printed precision. */
    out.orientation = repairOrientation(el.orientation);
  }
  return out;
}

function plainEntry(s) {
  return {
    id: s.id,
    elementId: s.elementId,
    apertureIndex: s.apertureIndex,
    entry: s.entry,
    passSide: s.passSide,
    clearance: typeof s.clearance === 'number' ? round6(s.clearance) : s.clearance,
    overridden: s.overridden,
  };
}

/* The document as it is stored and shared: fixed key order, every number
 * rounded once. JSON keeps string keys in insertion order, which is what
 * makes the same track give the same bytes. */
export function toPlain(doc) {
  const onMap = doc.schemaVersion >= MAP_SCHEMA_VERSION && isMapTrack(doc);
  const out = {
    schemaVersion: onMap ? MAP_SCHEMA_VERSION : SCHEMA_VERSION,
    id: doc.id,
    name: doc.name,
    createdUtc: doc.createdUtc,
    modifiedUtc: doc.modifiedUtc,
    trackClass: doc.trackClass,
  };
  if (onMap) {
    out.map = doc.map;
  }
  out.field = plainNumbers(doc.field);
  out.settings = plainNumbers(doc.settings);
  out.branding = { logos: logosOf(doc).map((l) => ({ id: l.id, image: l.image, name: l.name })) };
  out.credit = doc.credit ?? null;
  out.elements = doc.elements.map((el) => plainElement(el, onMap));
  out.sequence = doc.sequence.map(plainEntry);
  return out;
}

export function serialize(doc) {
  return `${JSON.stringify(toPlain(doc), null, 2)}\n`;
}

/* Text back into a document: { doc, repairs, error }. Text that is not JSON
 * gives a fresh empty track and an error to show, because the caller is a
 * file picker and the pilot wants to be told, not crashed at. */
export function deserialize(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { doc: createTrack(str('ui.untitled_track')), repairs: [], error: str('model.not_valid_json', { message: e.message }) };
  }
  const { doc, repairs } = normalize(raw);
  return { doc, repairs, error: null };
}

/* A copy under a new id and name, credit and all, made now. */
export function duplicateTrack(doc, name) {
  const copy = deepClone(doc);
  copy.id = newTrackId();
  copy.name = name;
  const now = utcNow();
  copy.createdUtc = now;
  copy.modifiedUtc = now;
  return copy;
}

export function touch(doc) {
  doc.modifiedUtc = utcNow();
}
