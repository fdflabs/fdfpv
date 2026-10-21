/*
 * liveries.js: what each plane can be painted, and in what.
 *
 * A LIVERY is a colour per named REGION of a plane's scheme: the wing, the
 * fuselage, the tail, the trim. The regions are the drawn model's own
 * (each builder in src/render/*craft.js hands its materials to
 * src/render/livery.js by these ids), and each region's `stock` is the
 * colour the builder draws it in today, which is what a pilot who never
 * opens the hangar sees. The hangar's check (scripts/hangar-check.js)
 * builds every plane and holds the two to each other.
 *
 * The colours offered are real covering, by the makers' own names: Top
 * Flite MonoKote, Oracover and Solarfilm. The hex beside a name is an
 * approximation of the film for the screen, never the maker's
 * specification. The PRESET SCHEMES are the real kits' box art, the makers'
 * own colourways, or the full size liveries a scale model wears, each with
 * where it was seen; a scheme names only the regions it changes.
 *
 * An entry also carries the paint shop's finishes and decals, and a plane
 * has a list of liveries saved by name; their data, their limits and the
 * code a livery is shared by are configs/paint.js.
 *
 * Plain data and plain functions, no three.js: the menu and the checks
 * import this in Node.
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

import { AIRCRAFT } from './aircraft.js';
import { CODE_PREFIX, MAX_SAVED, PATTERNS, checkPaint, cleanName, decodeLivery, fromBase64Url } from './paint.js';
import { KIT_VERSION, LIGHTS_VERSION, checkKit, checkLights, kitParts } from './kits.js';

/*
 * THE COVERING ON OFFER, by the makers' own names and numbers. The hex is
 * the film as a screen can show it, measured off the maker's or a
 * dealer's product photograph (Horizon Hobby's MonoKote pages, Sussex
 * Model Centre's Oracover pages, Solarfilm's own chart) or, for the
 * transparent MonoKote, off Top Flite's colour chart: an approximation,
 * not the maker's specification.
 */
const c = (brand, name, hex) => ({ brand, name, hex });
export const PALETTE = [
  c('MonoKote', 'Jet White', '#f2f2f2'),
  c('Oracover', 'White 10', '#dfdcd8'),
  c('MonoKote', 'Flat Dove Gray', '#d1dae2'),
  c('MonoKote', 'Aluminum', '#b9bdc0'),
  c('Oracover', 'Silver 91', '#afaaa3'),
  c('MonoKote', 'Yellow', '#f0db2c'),
  c('MonoKote', 'Cub Yellow', '#f8cf1f'),
  c('Oracover', 'Cub Yellow 30', '#eaaa06'),
  c('MonoKote', 'Orange', '#e68e19'),
  c('Oracover', 'Orange 60', '#e73f0e'),
  c('MonoKote', 'True Red', '#b11b24'),
  c('Oracover', 'Ferrari Red 23', '#ba100f'),
  c('MonoKote', 'Maroon', '#5c1533'),
  c('MonoKote', 'Sky Blue', '#3dc5fc'),
  c('Oracover', 'Sky Blue 53', '#2979bc'),
  c('Solarfilm', 'Tropic Blue', '#6988c3'),
  c('MonoKote', 'Royal Blue', '#0e65ba'),
  c('Oracover', 'Blue 50', '#153c86'),
  c('MonoKote', 'Insignia Blue', '#032257'),
  c('Solarfilm', 'Dark Blue', '#242739'),
  c('Oracover', 'Fluorescent Green 41', '#26e45e'),
  c('Oracover', 'Olive Drab 18', '#5a5434'),
  c('MonoKote', 'Flat Olive Drab', '#5e614c'),
  c('Oracover', 'Black 71', '#1a1a1a'),
  c('MonoKote', 'Black', '#0e1213'),
];

/*
 * THE PLANES, by liveryKey. `regions` in the order the hangar lists them,
 * each with the colour its builder draws it in. `schemes` stock first, each with where it was seen
 * (`source`, a label and an address) and only the regions it changes. No
 * plane's scheme is listed without a source. The combat aircraft are the
 * exception, because they are no maker's model: generic and unmarked
 * (docs/WARFARE-PLAN.md section 3), they wear generic service and test
 * colours, with no source to cite and no insignia (THE COMBAT AIRCRAFT,
 * next). A row in LIVERIES that is not written here is its folder's livery
 * (aircraft/<id>/aircraft.js); the quads' rows share their regions, which
 * a folder's copy would split, so those stay here.
 */
const r = (id, stock, more = {}) => ({ id, stock, ...more });
const all = (hex, ids) => Object.fromEntries(ids.map((id) => [id, hex]));

/*
 * THE COMBAT AIRCRAFT. Their regions are their builders' own
 * (src/render/strikercraft.js REGIONS, src/render/combatcraft.js
 * paintCoat): the Striker by its fuselage, wing, fins, nose cap, nose band
 * and engine (the piston engine and its spinner, or the turbojet), the
 * same on either engine; a quad by its frame (the bottom plate and the
 * camera mount), arms, top plate, and the parts its frame has. The stock
 * scheme is the look each was built in. The rest are generic finishes by
 * colour, by the same ids on every one: service colours (olive drab, desert
 * tan, a two tone of the two, arctic white and grey), black, the orange and
 * white of a test aircraft, and on a quad, whose stock is carbon, the light
 * grey the Striker is built in. A scheme names a region only where the
 * aircraft has it.
 */
const OLIVE = '#5a5434';
const TAN = '#c2a882';
const ARCTIC = '#eef0f1';
const ARCTIC_GREY = '#c9ced2';
const BLACK = '#1a1a1a';
const GREY = '#b9bdc0';
const WHITE = '#f2f2f2';
const ORANGE = '#e73f0e';
const generic = (id, colours) => ({ id, source: null, colours });
const BODY = ['frame', 'arms', 'top', 'armour'];
const quadSchemes = (ids) => {
  const only = (colours) => Object.fromEntries(Object.entries(colours).filter(([k]) => ids.includes(k)));
  return [
    generic('stock', {}),
    generic('grey', only({ ...all(GREY, BODY), legs: '#55595e' })),
    generic('black', only(all(BLACK, [...BODY, 'payload', 'legs']))),
    generic('olive', only(all(OLIVE, [...BODY, 'payload', 'legs']))),
    generic('tan', only({ ...all(TAN, [...BODY, 'payload', 'legs']), tape: OLIVE })),
    generic('two_tone', only({ ...all(TAN, ['frame', 'armour', 'legs']), ...all(OLIVE, ['arms', 'top', 'payload']) })),
    generic('arctic', only({ ...all(ARCTIC, [...BODY, 'legs']), payload: ARCTIC_GREY })),
    generic('test', only({ ...all(WHITE, ['frame', 'arms']), ...all(ORANGE, ['top', 'armour', 'legs', 'payload']) })),
  ];
};
const quad = (regions) => ({ regions, schemes: quadSchemes(regions.map((x) => x.id)) });
const CARBON = '#1b1d1f';
const QUAD_FRAME = [r('frame', CARBON), r('arms', CARBON), r('top', CARBON)];
const QUAD_KIT = [r('pack', '#18191b'), r('payload', '#4d5130')];
const QUAD_LONG = [...QUAD_FRAME, r('tape', '#5d6038'), ...QUAD_KIT, r('cage', '#3a3f2a'), r('legs', '#18191b'), r('props', '#232527')];
export const LIVERIES = {
  bramor2300: AIRCRAFT.LIVERIES.bramor2300,
  striker2500: AIRCRAFT.LIVERIES.striker2500,
  '7inch': quad(QUAD_LONG),
  '10inch': quad(QUAD_LONG),
  interceptor: quad([...QUAD_FRAME, r('armour', '#2a2b2b'), ...QUAD_KIT, r('legs', '#18191b')]),
};


/* The entry an aircraft's paint is stored under: its own id since the
 * float planes, which wore their land plane's, left on 2026-10-21. */
export function liveryKey(airframeId) {
  return airframeId;
}

/* Whether this aircraft can be painted at all: the planes and the combat
 * aircraft, not the racing quads. */
export function paintable(airframeId) {
  return Boolean(LIVERIES[liveryKey(airframeId)]);
}

/* The regions this aircraft shows. */
export function regionsFor(airframeId) {
  const l = LIVERIES[liveryKey(airframeId)];
  return l ? l.regions : [];
}

export function schemesFor(airframeId) {
  const l = LIVERIES[liveryKey(airframeId)];
  return l ? l.schemes : [];
}

const HEX = /^#[0-9a-f]{6}$/;

export function isHex(v) {
  return typeof v === 'string' && HEX.test(v);
}

/*
 * A stored entry made safe: { scheme, regions, finishes, decals } with a
 * scheme this plane has, only region colours it has, as lower case
 * #rrggbb, and the paint shop's finishes and decals as configs/paint.js
 * checks them. Anything else is dropped rather than refused, because a
 * stale or hand edited settings blob must never stop the page booting;
 * null when nothing is left.
 */
export function normaliseEntry(family, entry) {
  return checkEntry(family, entry).entry;
}

/* How many things normaliseEntry would drop from an entry, or null for a
 * plane that has no paint: a shared code is refused unless this is 0. */
export function entryDrops(family, entry) {
  return LIVERIES[family] ? checkEntry(family, entry).dropped : null;
}

function checkEntry(family, entry) {
  const l = LIVERIES[family];
  if (!l || !entry || typeof entry !== 'object') {
    return { entry: null, dropped: 0 };
  }
  let dropped = 0;
  const out = {};
  if (typeof entry.scheme === 'string' && l.schemes.some((s) => s.id === entry.scheme)) {
    if (entry.scheme !== 'stock') {
      out.scheme = entry.scheme;
    }
  } else if (entry.scheme !== undefined) {
    dropped += 1;
  }
  if (entry.regions && typeof entry.regions === 'object') {
    const regions = {};
    for (const r of l.regions) {
      const v = typeof entry.regions[r.id] === 'string' ? entry.regions[r.id].toLowerCase() : null;
      if (isHex(v)) {
        regions[r.id] = v;
      }
    }
    dropped += Object.keys(entry.regions).length - Object.keys(regions).length;
    if (Object.keys(regions).length) {
      out.regions = regions;
    }
  } else if (entry.regions !== undefined) {
    dropped += 1;
  }
  /* `under`: a region's underside in a colour of its own, the faces that
   * look down in the aircraft's frame (src/render/finish.js). */
  if (entry.under && typeof entry.under === 'object' && !Array.isArray(entry.under)) {
    const under = {};
    for (const r of l.regions) {
      const v = typeof entry.under[r.id] === 'string' ? entry.under[r.id].toLowerCase() : null;
      if (isHex(v)) {
        under[r.id] = v;
      }
    }
    dropped += Object.keys(entry.under).length - Object.keys(under).length;
    if (Object.keys(under).length) {
      out.under = under;
    }
  } else if (entry.under !== undefined) {
    dropped += 1;
  }
  /* `patterns`: a region's pattern (configs/paint.js PATTERNS) in a
   * second colour, { p, c }. */
  if (entry.patterns && typeof entry.patterns === 'object' && !Array.isArray(entry.patterns)) {
    const patterns = {};
    for (const r of l.regions) {
      const v = entry.patterns[r.id];
      const c = v && typeof v.c === 'string' ? v.c.toLowerCase() : null;
      if (v && PATTERNS.includes(v.p) && isHex(c)) {
        patterns[r.id] = { p: v.p, c };
      }
    }
    dropped += Object.keys(entry.patterns).length - Object.keys(patterns).length;
    if (Object.keys(patterns).length) {
      out.patterns = patterns;
    }
  } else if (entry.patterns !== undefined) {
    dropped += 1;
  }
  /* `kit` and `lights`: the visual part kits and lights (configs/kits.js,
   * docs/KITS.md). Pixels only; nothing in the flight reads them. */
  const kit = checkKit(family, entry.kit);
  dropped += kit.dropped;
  if (kit.kit) {
    out.kit = kit.kit;
  }
  const lights = checkLights(family, entry.lights);
  dropped += lights.dropped;
  if (lights.lights) {
    out.lights = lights.lights;
  }
  const paint = checkPaint(l.regions, entry);
  dropped += paint.dropped;
  if (Object.keys(paint.finishes).length) {
    out.finishes = paint.finishes;
  }
  if (paint.decals.length) {
    out.decals = paint.decals;
  }
  if (paint.wear) {
    out.wear = paint.wear;
  }
  return { entry: Object.keys(out).length ? out : null, dropped };
}

/* settings.livery as loadSettings keeps it: known planes, safe entries. */
export function normaliseLiveries(stored) {
  const out = {};
  if (!stored || typeof stored !== 'object') {
    return out;
  }
  for (const [family, entry] of Object.entries(stored)) {
    const clean = normaliseEntry(family, entry);
    if (clean) {
      out[family] = clean;
    }
  }
  return out;
}

/*
 * Every region's colour for this aircraft under an entry: stock, then the
 * scheme's, then the pilot's own per region. As #rrggbb.
 */
export function coloursFor(airframeId, entry) {
  const l = LIVERIES[liveryKey(airframeId)];
  if (!l) {
    return {};
  }
  const scheme = l.schemes.find((s) => s.id === (entry && entry.scheme)) ?? l.schemes[0];
  const own = (entry && entry.regions) || {};
  const out = {};
  for (const r of regionsFor(airframeId)) {
    out[r.id] = own[r.id] ?? scheme.colours[r.id] ?? r.stock;
  }
  return out;
}

/* The same colours as numbers, the form the renderer takes. */
export function colourNumbers(colours) {
  return Object.fromEntries(Object.entries(colours).map(([k, v]) => [k, parseInt(v.slice(1), 16)]));
}

/*
 * What the renderer dresses a model in (src/render/livery.js): each
 * region's colour as a number, the underside's where a region has one
 * of its own, each pattern as its number and second colour, the finishes, the decals and the wear, a
 * fraction from 0 (factory new) to 1.
 */
export function lookFor(airframeId, entry) {
  return {
    colours: colourNumbers(coloursFor(airframeId, entry)),
    under: colourNumbers((entry && entry.under) || {}),
    patterns: Object.fromEntries(Object.entries((entry && entry.patterns) || {})
      .map(([k, v]) => [k, { p: PATTERNS.indexOf(v.p) + 1, c: parseInt(v.c.slice(1), 16) }])),
    finishes: (entry && entry.finishes) || {},
    decals: (entry && entry.decals) || [],
    wear: ((entry && entry.wear) || 0) / 100,
    kit: kitParts(liveryKey(airframeId), entry && entry.kit),
    lights: (entry && entry.lights) || null,
  };
}

/*
 * settings.liverySaves as loadSettings keeps it: per plane, a list of
 * { name, entry }, each name cleaned and not empty, each entry safe (an
 * empty one is the kit's own look), at most MAX_SAVED.
 */
export function normaliseSaves(stored) {
  const out = {};
  if (!stored || typeof stored !== 'object') {
    return out;
  }
  for (const [family, list] of Object.entries(stored)) {
    if (!LIVERIES[family] || !Array.isArray(list)) {
      continue;
    }
    const clean = [];
    for (const item of list) {
      const name = cleanName(item && item.name);
      if (!name || clean.length >= MAX_SAVED) {
        continue;
      }
      clean.push({ name, entry: normaliseEntry(family, item.entry) ?? {} });
    }
    if (clean.length) {
      out[family] = clean;
    }
  }
  return out;
}

/* A shared code read back against the planes that have paint. */
export function readCode(code) {
  const got = decodeLivery(code, normaliseEntry, entryDrops);
  /* A kit or lights from a newer build would be kept but drawn stock, so
   * the code is refused with the version sentence instead (docs/KITS.md
   * section 6); the account still keeps such an entry as it came. */
  if (!got.error && newerKit(code)) {
    return { error: 'version' };
  }
  return got;
}

function newerKit(code) {
  try {
    const e = JSON.parse(fromBase64Url(code.replace(/\s+/g, '').slice(CODE_PREFIX.length))).e;
    return (e.kit && e.kit.v > KIT_VERSION) || (e.lights && e.lights.v > LIGHTS_VERSION);
  } catch {
    return false;
  }
}

/* The covering a colour is, if it is one on the palette. */
export function paletteColour(hex) {
  return PALETTE.find((c) => c.hex === hex) ?? null;
}

/*
 * THE SWATCH LIBRARY: the pilot's own colours, the newest first, kept
 * once each, at most MAX_SWATCHES. Kept as { list } so it syncs as one
 * whole section (src/share/progressmerge.js), the newest list winning.
 * Anything else stored there, from an older build or a hand edit, reads
 * as the empty library.
 */
export const MAX_SWATCHES = 16;

export function normaliseSwatches(raw) {
  const list = raw && Array.isArray(raw.list) ? raw.list : [];
  const out = [];
  for (const v of list) {
    const hex = typeof v === 'string' ? v.toLowerCase() : null;
    if (isHex(hex) && !out.includes(hex) && out.length < MAX_SWATCHES) {
      out.push(hex);
    }
  }
  return { list: out };
}

/* The library with `hex` kept first, or taken out when it is there. */
export function toggleSwatch(lib, hex) {
  const list = lib.list.includes(hex) ? lib.list.filter((h) => h !== hex) : [hex, ...lib.list];
  return normaliseSwatches({ list });
}
