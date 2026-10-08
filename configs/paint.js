/*
 * paint.js: the paint shop's data. Finishes, decals, saved liveries and
 * the code a livery is shared by.
 *
 * A livery entry (configs/liveries.js) is a scheme and a colour per
 * region. The paint shop adds two things to it:
 *
 *   finishes  a FINISH per region: gloss, matte, metallic or chrome, or
 *             film on a region of see through film, whose kit finish it
 *             is. A region left out wears what its builder made.
 *   decals    up to MAX_DECALS stickers, each a KIND (a race number, a
 *             stripe, a roundel, a generic sponsor style shape), placed on
 *             the model where the pilot picked: a point and the surface's
 *             normal there, in the model's own frame (metres, y up, the
 *             nose toward -z, x across the span), a size, a stretch, a
 *             turn about the normal, two colours, and whether it is
 *             mirrored onto the other side of the aircraft. A TEXT
 *             decal carries words the pilot typed, held to TEXT_MAX
 *             letters of TEXT_CHARS and refused whole when the board's
 *             word filter (tracks-api/words.js) finds a word in it, here,
 *             so a code, a room and a replay refuse it alike.
 *   wear      how used the whole aircraft looks, 0 factory new to 100
 *             battle worn, in WEAR_STEP steps: scratches through the paint
 *             and aluminium tape over the worst of them, drawn by
 *             src/render/finish.js from the model's own coordinates, so
 *             every machine draws the same marks in the same places.
 *
 * Saved liveries are a list per plane of a name and an entry. A livery
 * travels as a CODE: `FPV1-` and the base64url of a small JSON object,
 * { v, p, n, e }, the version, the plane's livery key, the name and the
 * entry. A code is checked field by field on the way in: a code with a
 * field this file does not know, a value out of its range, or more than
 * CODE_MAX characters is refused whole, never half taken.
 *
 * Plain data and plain functions, no three.js and no DOM: the menu, the
 * renderer and the checks all import this, the checks in Node.
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

import { badWordIn } from '../tracks-api/words.js';

/* The finishes a region can wear. `film` only on a film region, where it
 * is the kit's own; the others there make the film an opaque paint. */
/* The patterns a region can wear in a second colour, drawn by
 * src/render/finish.js finPattern as their place in this list plus one. */
export const PATTERNS = ['checks', 'stripes', 'camo', 'splinter'];

export const FINISHES = ['gloss', 'matte', 'metallic', 'chrome', 'carbon', 'aluminium', 'satin', 'pearl', 'candy', 'gold', 'flake', 'brushed'];

/* The finishes and decals that are owned, not unlocked: sold for tokens or
 * earned by a feat (src/game/economy.js ITEMS, docs/ECONOMY.md). Level
 * progression (src/game/progress.js) passes over them; a pilot wears one
 * once the account owns it. Listed here, not read from economy.js, because
 * economy.js imports progress.js, which imports this file. */
export const SHOP_FINISHES = ['satin', 'pearl', 'candy', 'gold', 'flake', 'brushed'];
export const SHOP_DECALS = ['ribbon'];

/*
 * THE DECALS. `aspect` is the kind's natural width over its height, which
 * the stretch starts from; `text` a kind that must read the right way
 * round on both sides, so its mirrored copy is not a mirror image (a
 * number), where every other kind is mirrored whole (a chevron points
 * forward on both sides). `size` its first height, metres. The sponsor
 * style shapes are generic marks drawn here, no maker's logo or name.
 */
export const DECAL_KINDS = {
  num: { aspect: 0.72, text: true, size: 0.12 },
  stripe: { aspect: 6, size: 0.05 },
  checker: { aspect: 3, size: 0.05 },
  chevron: { aspect: 1.4, size: 0.06 },
  star: { aspect: 1, size: 0.07 },
  roundel: { aspect: 1, size: 0.08 },
  bolt: { aspect: 0.62, size: 0.08 },
  flame: { aspect: 3, size: 0.06 },
  shield: { aspect: 0.84, size: 0.07 },
  wings: { aspect: 2.4, size: 0.05 },
  skull: { aspect: 0.86, size: 0.09 },
  shark: { aspect: 2.2, size: 0.09 },
  flag_py: { aspect: 1.8, size: 0.06 },
  text: { aspect: 3, text: true, size: 0.05 },
  ribbon: { aspect: 2.6, size: 0.05 },
  /* The layer editor's shape library (docs/redesign/LIVERY-LAYERS.md):
   * plain shapes a livery is built up from, `free` so the level ladder
   * the kinds above keep is not stretched by them. */
  circle: { aspect: 1, size: 0.08, free: true },
  ring: { aspect: 1, size: 0.08, free: true },
  triangle: { aspect: 1.15, size: 0.08, free: true },
  diamond: { aspect: 0.7, size: 0.08, free: true },
  block: { aspect: 2, size: 0.05, free: true },
  arrow: { aspect: 2.2, size: 0.06, free: true },
  hexagon: { aspect: 1.15, size: 0.08, free: true },
  swoosh: { aspect: 4, size: 0.06, free: true },
  /* Its stamps: drawn marks, curated here, never a picture from outside. */
  crosshair: { aspect: 1, size: 0.08, free: true },
  propeller: { aspect: 1, size: 0.08, free: true },
  drone: { aspect: 1, size: 0.09, free: true },
  tally: { aspect: 2.5, size: 0.05, free: true },
  sun: { aspect: 1, size: 0.09, free: true },
};
export const DECAL_KIND_IDS = Object.keys(DECAL_KINDS);

/* The number's lettering, drawn from strokes in src/render/decals.js so it
 * is the same on every machine, with no font to load. */
export const DECAL_FONTS = ['block', 'round', 'italic', 'stencil'];

/* A text decal's words: upper case, so the lettering reads at a glance,
 * from a set every machine draws alike, and short enough to fit a wing. */
export const TEXT_MAX = 14;
export const TEXT_CHARS = /^[A-Z0-9\u00c1\u00c9\u00cd\u00d3\u00da\u00d1\u00dc .!?'&-]+$/;

/* Wear, a percentage in steps. */
export const WEAR_STEP = 5;
export const WEAR_MAX = 100;

/* 32 layers with every key set fit a build's 8 kB as stored, and packed
 * (packDecals) a room profile's 4 kB and a code (docs/redesign/LIVERY-LAYERS.md). */
export const MAX_DECALS = 32;
export const MAX_SAVED = 24;
export const NAME_MAX = 32;
export const CODE_MAX = 6000;
export const CODE_PREFIX = 'FPV1-';

/* The ranges a decal's numbers are held to. Metres, degrees. */
export const DECAL_LIMITS = {
  reach: 3,
  size: [0.01, 0.8],
  aspect: [0.2, 12],
  turn: [-180, 180],
  skew: [-60, 60],
  opacity: [5, 100],
  group: [1, 99],
};

/* The finishes a layer can wear; gloss is the sticker's own and is not
 * stored. */
export const LAYER_FINISHES = ['gloss', 'matte', 'metallic', 'chrome'];
export const OPACITY_STEP = 5;

const HEX = /^#[0-9a-f]{6}$/;
const DIGITS = /^[0-9]{1,3}$/;
const DECAL_FIELDS = new Set(['k', 'p', 'n', 's', 'a', 'r', 'c', 'c2', 'm', 't', 'f', 'x', 'o', 'fi', 'g', 'h', 'l']);

/* A text decal's words as kept, or '' when they cannot be: upper cased,
 * one space between words, TEXT_MAX at most, every letter one the
 * lettering draws. */
export function cleanText(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const t = text.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX).trim();
  return TEXT_CHARS.test(t) ? t : '';
}

/* A wear as kept: a whole step from 0 to WEAR_MAX, or null. */
export function cleanWear(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > WEAR_MAX) {
    return null;
  }
  return Math.round(v / WEAR_STEP) * WEAR_STEP;
}

const round = (v, places) => {
  const k = 10 ** places;
  return Math.round(v * k) / k;
};
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, [lo, hi]) => finite(v) && v >= lo && v <= hi;

/*
 * A decal made safe, or the reason it is not: { decal } or { error }.
 * Numbers are rounded to what the store keeps (a millimetre, a thousandth
 * of the normal, a degree), so a decal read back from a code or the
 * settings is the one that was written.
 */
export function checkDecal(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return { error: 'not_decal' };
  }
  for (const key of Object.keys(d)) {
    if (!DECAL_FIELDS.has(key)) {
      return { error: 'unknown_field' };
    }
  }
  if (!DECAL_KINDS[d.k]) {
    return { error: 'bad_value' };
  }
  const vec = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => finite(x) && Math.abs(x) <= DECAL_LIMITS.reach);
  if (!vec(d.p) || !vec(d.n)) {
    return { error: 'bad_value' };
  }
  const len = Math.hypot(...d.n);
  if (len < 0.5) {
    return { error: 'bad_value' };
  }
  if (!inRange(d.s, DECAL_LIMITS.size) || !inRange(d.a, DECAL_LIMITS.aspect) || !inRange(d.r, DECAL_LIMITS.turn)) {
    return { error: 'bad_value' };
  }
  const c = typeof d.c === 'string' ? d.c.toLowerCase() : null;
  const c2 = typeof d.c2 === 'string' ? d.c2.toLowerCase() : null;
  if (!HEX.test(c) || !HEX.test(c2) || typeof d.m !== 'boolean') {
    return { error: 'bad_value' };
  }
  const out = {
    k: d.k,
    p: d.p.map((x) => round(x, 3)),
    n: d.n.map((x) => round(x / len, 3)),
    s: round(d.s, 3),
    a: round(d.a, 2),
    r: Math.round(d.r),
    c,
    c2,
    m: d.m,
  };
  /* The layer keys (docs/redesign/LIVERY-LAYERS.md), each absent at its
   * default so an entry written before them is the same bytes. */
  if (d.x !== undefined) {
    if (!inRange(d.x, DECAL_LIMITS.skew)) {
      return { error: 'bad_value' };
    }
    if (Math.round(d.x) !== 0) {
      out.x = Math.round(d.x);
    }
  }
  if (d.o !== undefined) {
    if (!inRange(d.o, DECAL_LIMITS.opacity)) {
      return { error: 'bad_value' };
    }
    const o = Math.round(d.o / OPACITY_STEP) * OPACITY_STEP;
    if (o !== 100) {
      out.o = o;
    }
  }
  if (d.fi !== undefined) {
    if (!LAYER_FINISHES.includes(d.fi)) {
      return { error: 'bad_value' };
    }
    if (d.fi !== 'gloss') {
      out.fi = d.fi;
    }
  }
  if (d.g !== undefined) {
    if (!Number.isInteger(d.g) || !inRange(d.g, DECAL_LIMITS.group)) {
      return { error: 'bad_value' };
    }
    out.g = d.g;
  }
  for (const key of ['h', 'l']) {
    if (d[key] !== undefined && d[key] !== true && d[key] !== false) {
      return { error: 'bad_value' };
    }
    if (d[key] === true) {
      out[key] = true;
    }
  }
  if (d.k === 'num') {
    if (typeof d.t !== 'string' || !DIGITS.test(d.t) || !DECAL_FONTS.includes(d.f)) {
      return { error: 'bad_value' };
    }
    out.t = d.t;
    out.f = d.f;
  } else if (d.k === 'text') {
    if (typeof d.t !== 'string' || cleanText(d.t) !== d.t || !DECAL_FONTS.includes(d.f)) {
      return { error: 'bad_value' };
    }
    if (badWordIn(d.t)) {
      return { error: 'rude' };
    }
    out.t = d.t;
    out.f = d.f;
  } else if (d.t !== undefined || d.f !== undefined) {
    return { error: 'unknown_field' };
  }
  return { decal: out };
}

/*
 * The paint shop's part of an entry, made safe against the plane's
 * regions: { finishes, decals, dropped }, `dropped` counting what was
 * thrown away. The settings take what is left (a stale blob must never
 * stop the page booting); a code is refused if anything was dropped.
 * `regions` is the plane's region list (configs/liveries.js), each with
 * `film` for a film region and `finish: false` for one whose finish is
 * another region's.
 */
export function checkPaint(regions, entry) {
  let dropped = 0;
  const finishes = {};
  if (entry.finishes !== undefined) {
    if (!entry.finishes || typeof entry.finishes !== 'object' || Array.isArray(entry.finishes)) {
      dropped += 1;
    } else {
      for (const [id, f] of Object.entries(entry.finishes)) {
        const r = regions.find((x) => x.id === id);
        const ok = r && r.finish !== false && (FINISHES.includes(f) || (f === 'film' && r.film));
        if (!ok) {
          dropped += 1;
        } else if (!(f === 'film' && r.film)) {
          finishes[id] = f;
        }
      }
    }
  }
  const decals = [];
  if (entry.decals !== undefined) {
    if (!Array.isArray(entry.decals)) {
      dropped += 1;
    } else {
      for (const d of entry.decals) {
        const got = checkDecal(d);
        if (got.error || decals.length >= MAX_DECALS) {
          dropped += 1;
        } else {
          decals.push(got.decal);
        }
      }
    }
  }
  let wear = 0;
  if (entry.wear !== undefined) {
    const w = cleanWear(entry.wear);
    if (w === null) {
      dropped += 1;
    } else {
      wear = w;
    }
  }
  return { finishes, decals, wear, dropped };
}

/* The finish a region wears under an entry: its own, else the kit's. */
export function finishOf(region, entry) {
  const f = entry && entry.finishes && entry.finishes[region.id];
  return f ?? (region.film ? 'film' : 'kit');
}

/* A new decal of a kind, at a point on the model, in the kind's first
 * size and stretch. A number starts as 7 in block lettering. */
export function newDecal(kind, p, n, colours = {}) {
  const k = DECAL_KINDS[kind];
  const d = {
    k: kind,
    p,
    n,
    s: k.size,
    a: k.aspect,
    r: 0,
    c: colours.c ?? '#f2f2f2',
    c2: colours.c2 ?? '#0e1213',
    m: true,
  };
  if (kind === 'num') {
    d.t = '7';
    d.f = 'block';
  } else if (kind === 'text') {
    d.t = 'FDFPV';
    d.f = 'stencil';
    d.a = textAspect(d.t);
  }
  const got = checkDecal(d);
  if (got.error) {
    throw new Error(`paint: a new ${kind} decal is not a valid one`);
  }
  return got.decal;
}

/* A number's stretch follows how many digits it has, so 7 and 77 are
 * lettered alike. */
export function numberAspect(text) {
  return round(DECAL_KINDS.num.aspect * Math.max(1, text.length) * (text.length > 1 ? 0.86 : 1), 2);
}

/* A text decal's stretch follows its length the same way. */
export function textAspect(text) {
  return round(Math.min(DECAL_LIMITS.aspect[1], Math.max(DECAL_LIMITS.aspect[0], 0.62 * Math.max(1, text.length))), 2);
}

/* A livery's name as it is kept: trimmed, one line, NAME_MAX at most. */
export function cleanName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  return name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/*
 * THE CODE. base64url so it survives a chat message and a URL, over the
 * UTF-8 of the JSON so a name in any language goes through. btoa and atob
 * are in every browser and in Node.
 */
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/*
 * THE PACKED FORM of a layer, for the places a livery travels under a byte
 * cap (a code, a room profile): an array in PACKED order, positions in
 * millimetres, the normal in thousandths, the stretch in hundredths,
 * colours without '#', mirror/hidden/locked as bits 1/2/4 of `flags`,
 * trailing defaults dropped. Takes a decal checkDecal made; unpackDecal
 * runs checkDecal on the way back, so a packed layer meets the same rules.
 */
const PACKED_DEFAULTS = { x: 0, o: 100, fi: 'gloss', g: 0, t: '', f: '' };

export function packDecal(d) {
  const mm = (v) => Math.round(v * 1000);
  const flags = (d.m ? 1 : 0) | (d.h ? 2 : 0) | (d.l ? 4 : 0);
  const out = [d.k, ...d.p.map(mm), ...d.n.map(mm), mm(d.s), Math.round(d.a * 100), d.r, d.c.slice(1), d.c2.slice(1), flags,
    d.x ?? 0, d.o ?? 100, d.fi ?? 'gloss', d.g ?? 0, d.t ?? '', d.f ?? ''];
  const tail = [PACKED_DEFAULTS.x, PACKED_DEFAULTS.o, PACKED_DEFAULTS.fi, PACKED_DEFAULTS.g, PACKED_DEFAULTS.t, PACKED_DEFAULTS.f];
  let end = out.length;
  while (end > 13 && out[end - 1] === tail[end - 14]) {
    end -= 1;
  }
  return out.slice(0, end);
}

/* A packed layer back to a decal: { decal } or { error }, as checkDecal. */
export function unpackDecal(a) {
  if (!Array.isArray(a) || a.length < 13 || a.length > 19) {
    return { error: 'not_decal' };
  }
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const hex = (v) => (typeof v === 'string' ? `#${v}` : null);
  const [k, px, py, pz, nx, ny, nz, s, aspect, r, c, c2, flags, x = 0, o = 100, fi = 'gloss', g = 0, t = '', f = ''] = a;
  if (!Number.isInteger(flags) || flags < 0 || flags > 7) {
    return { error: 'bad_value' };
  }
  const d = {
    k, p: [px, py, pz].map((v) => num(v) / 1000), n: [nx, ny, nz].map((v) => num(v) / 1000),
    s: num(s) / 1000, a: num(aspect) / 100, r, c: hex(c), c2: hex(c2), m: Boolean(flags & 1),
  };
  if (flags & 2) {
    d.h = true;
  }
  if (flags & 4) {
    d.l = true;
  }
  if (x !== 0) {
    d.x = x;
  }
  if (o !== 100) {
    d.o = o;
  }
  if (fi !== 'gloss') {
    d.fi = fi;
  }
  if (g !== 0) {
    d.g = g;
  }
  if (t !== '' || f !== '') {
    d.t = t;
    d.f = f;
  }
  return checkDecal(d);
}

/* An entry with its decals packed under `d`, the form a code v2 and a room
 * profile carry; and back, null when a layer of it is not a layer. */
export function packEntry(entry) {
  if (!entry || !Array.isArray(entry.decals)) {
    return entry ?? {};
  }
  const { decals, ...rest } = entry;
  return { ...rest, d: decals.map(packDecal) };
}

export function unpackEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || entry.d === undefined) {
    return { entry };
  }
  if (!Array.isArray(entry.d) || entry.d.length > MAX_DECALS) {
    return { error: 'bad_value' };
  }
  const decals = [];
  for (const a of entry.d) {
    const got = unpackDecal(a);
    if (got.error) {
      return { error: got.error };
    }
    decals.push(got.decal);
  }
  const { d, ...rest } = entry;
  return { entry: decals.length ? { ...rest, decals } : rest };
}

/* A livery as a code: `family` its livery key, `entry` already safe. A
 * code is version 2, its layers packed; a version 1 code still reads. */
export function encodeLivery(family, name, entry) {
  return CODE_PREFIX + toBase64Url(JSON.stringify({ v: 2, p: family, n: cleanName(name), e: packEntry(entry ?? {}) }));
}

/* The livery entry's fields a code may carry: every field
 * configs/liveries.js normaliseEntry keeps, so a code made from any
 * livery reads back. */
const CODE_FIELDS = ['scheme', 'regions', 'under', 'patterns', 'finishes', 'decals', 'kit', 'lights', 'wear'];

/*
 * A code read back: { family, name, entry } or { error }, the error one
 * of the ids the hangar has a sentence for (hangar.code_<error>).
 * `normalise(family, entry)` and `countDropped(family, entry)` are
 * configs/liveries.js normaliseEntry and entryDrops, handed in so this
 * file does not import the aircraft list; the entry must come through
 * whole, nothing dropped, or the code is refused.
 */
export function decodeLivery(code, normalise, countDropped) {
  if (typeof code !== 'string') {
    return { error: 'not_code' };
  }
  const s = code.replace(/\s+/g, '');
  if (s.length > CODE_MAX) {
    return { error: 'too_long' };
  }
  if (!s.startsWith(CODE_PREFIX)) {
    return { error: 'not_code' };
  }
  let obj;
  try {
    obj = JSON.parse(fromBase64Url(s.slice(CODE_PREFIX.length)));
  } catch {
    return { error: 'not_code' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { error: 'not_code' };
  }
  for (const key of Object.keys(obj)) {
    if (!['v', 'p', 'n', 'e'].includes(key)) {
      return { error: 'unknown_field' };
    }
  }
  if (obj.v !== 1 && obj.v !== 2) {
    return { error: 'version' };
  }
  if (typeof obj.p !== 'string' || typeof obj.n !== 'string' || !obj.e || typeof obj.e !== 'object' || Array.isArray(obj.e)) {
    return { error: 'not_code' };
  }
  if (obj.v === 2) {
    if (obj.e.decals !== undefined) {
      return { error: 'unknown_field' };
    }
    const got = unpackEntry(obj.e);
    if (got.error) {
      return { error: got.error };
    }
    obj.e = got.entry;
  } else if (obj.e.d !== undefined) {
    return { error: 'unknown_field' };
  }
  for (const key of Object.keys(obj.e)) {
    if (!CODE_FIELDS.includes(key)) {
      return { error: 'unknown_field' };
    }
  }
  if (Array.isArray(obj.e.decals)) {
    for (const d of obj.e.decals) {
      const got = checkDecal(d);
      if (got.error) {
        return { error: got.error };
      }
    }
    if (obj.e.decals.length > MAX_DECALS) {
      return { error: 'bad_value' };
    }
  }
  const dropped = countDropped(obj.p, obj.e);
  if (dropped === null) {
    return { error: 'unknown_plane' };
  }
  if (dropped > 0) {
    return { error: 'bad_value' };
  }
  return { family: obj.p, name: cleanName(obj.n), entry: normalise(obj.p, obj.e) ?? {} };
}
