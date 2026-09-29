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
 * Flite MonoKote, Oracover and Solarfilm, opaque, and the transparent
 * films for a model built to be see through (the Kadet). The hex beside a
 * name is an approximation of the film for the screen, never the maker's
 * specification. The PRESET SCHEMES are the real kits' box art, the makers'
 * own colourways, or the full size liveries a scale model wears, each with
 * where it was seen; a scheme names only the regions it changes.
 *
 * A float plane is its land plane on floats and wears the land plane's
 * paint: `liveryKey` names the one entry both are stored under, and the
 * `floats` region is offered only on the floats.
 *
 * An entry also carries the paint shop's finishes and decals, and a plane
 * has a list of liveries saved by name; their data, their limits and the
 * code a livery is shared by are configs/paint.js.
 *
 * Plain data and plain functions, no three.js: the menu and the checks
 * import this in Node.
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

import { airframeById } from './airframes.js';
import { MAX_SAVED, checkPaint, cleanName, decodeLivery } from './paint.js';

/*
 * THE COVERING ON OFFER, by the makers' own names and numbers. The hex is
 * the film as a screen can show it, measured off the maker's or a
 * dealer's product photograph (Horizon Hobby's MonoKote pages, Sussex
 * Model Centre's Oracover pages, Solarfilm's own chart) or, for the
 * transparent MonoKote, off Top Flite's colour chart: an approximation,
 * not the maker's specification. `film` is a see through film, offered on
 * a model built to be see through; that model's own kits use opaque white
 * and black trim, so those are offered there too.
 */
const c = (brand, name, hex, film = false) => ({ brand, name, hex, film });
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
  c('MonoKote', 'Transparent Red', '#e46f63', true),
  c('Oracover', 'Transparent Red 29', '#b21527', true),
  c('MonoKote', 'Transparent Orange', '#f8c300', true),
  c('MonoKote', 'Transparent Yellow', '#ffeb54', true),
  c('MonoKote', 'Transparent Green', '#34a17b', true),
  c('MonoKote', 'Transparent Blue', '#0097d4', true),
  c('Oracover', 'Transparent Blue 59', '#335a9a', true),
  c('MonoKote', 'Jet White', '#f2f2f2', true),
  c('MonoKote', 'Black', '#0e1213', true),
];

/*
 * THE PLANES, by liveryKey. `regions` in the order the hangar lists them,
 * each with the colour its builder draws it in; `film` a region of see
 * through film (it offers the transparent colours), `floats` one only the
 * float plane has. `schemes` stock first, each with where it was seen
 * (`source`, a label and an address) and only the regions it changes. No
 * scheme is listed without a source: the Skyhunter and the Slow Stick have
 * none found yet, so they offer their stock look and the palette.
 */
const r = (id, stock, more = {}) => ({ id, stock, ...more });
const src = (label, url) => ({ label, url });
const WIKI_CUB = src('Wikipedia, Piper J-3 Cub', 'https://en.wikipedia.org/wiki/Piper_J-3_Cub');
const SIG_ARF = src('SIG Kadet Senior Sport ARF', 'https://sigmfg.com/products/sig-kadet-senior-sport-arf');
const EF_SHEET = src('Extreme Flight 60 in Edge 540T data sheet, its covering colour codes', 'https://extremeflightrc.com/cdn/shop/files/DATASHEET_60EDGE_1cb1926a-3a06-46ce-bfb4-18a18962d730.pdf');
const all = (hex, ids) => Object.fromEntries(ids.map((id) => [id, hex]));
const FREEWING = 'https://www.freewing-model.com/';
export const LIVERIES = {
  sky1800: {
    regions: [r('wing', '#d4e2ee'), r('tail', '#d4e2ee'), r('pod', '#d4e2ee')],
    schemes: [{ id: 'stock', source: null, colours: {} }],
  },
  cub1400: {
    regions: [r('wing', '#f0be2a'), r('fuselage', '#f0be2a'), r('tail', '#f0be2a'), r('trim', '#16181a'), r('floats', '#f2f1ec', { floats: true })],
    schemes: [
      { id: 'stock', source: src('FMS J-3 Cub 1400 mm V4', 'https://www.fmshobby.com/products/fms-1400mm-55-1-j-3-cub-v4-pnp'), colours: {} },
      { id: 'l4', source: WIKI_CUB, colours: all('#5a5434', ['wing', 'fuselage', 'tail', 'trim', 'floats']) },
      { id: 'flitfire', source: WIKI_CUB, colours: { ...all('#b9bdc0', ['wing', 'fuselage', 'tail', 'floats']), trim: '#032257' } },
    ],
  },
  radian2000: {
    regions: [r('wing', '#f1f1ec'), r('fuselage', '#f1f1ec'), r('tail', '#f1f1ec'), r('tips', '#cf2a26'), r('canopy', '#1b2127')],
    schemes: [
      { id: 'stock', source: null, colours: {} },
      { id: 'radian', source: src('E-flite Radian decal sheet, EFL4703', 'https://www.horizonhobby.com/product/e-flite-decal-sheet-radian-bnf-basic/EFL4703.html'), colours: { ...all('#f2f2f2', ['wing', 'fuselage', 'tail']), tips: '#e68e19', canopy: '#0e1213' } },
      { id: 'night', source: src('E-flite Night Radian FT 2.0 m, EFL3650', 'https://www.horizonhobby.com/product/e-flite-night-radian-ft-2.0m-bnf-basic-with-as3x-and-safe-select/EFL3650.html'), colours: { ...all('#f2f2f2', ['wing', 'fuselage', 'tail']), tips: '#b11b24' } },
    ],
  },
  bramor2300: {
    regions: [r('airframe', '#a9b5c1')],
    schemes: [
      { id: 'stock', source: src('C-Astral, Bramor C4EYE', 'https://www.c-astral.com/en/unmanned-systems/bramor-c4eye'), colours: {} },
      { id: 'ppx', source: src('C-Astral, Bramor ppX', 'https://www.c-astral.com/en/unmanned-systems/bramor-ppx'), colours: { airframe: '#dfdcd8' } },
      { id: 'hivis', source: src('C-Astral, Bramor ppX high visibility option', 'https://www.c-astral.com/en/unmanned-systems/bramor-ppx'), colours: { airframe: '#e73f0e' } },
    ],
  },
  slowstick1180: {
    regions: [r('wing', '#e5402a'), r('tail', '#e5402a'), r('tape', '#f4f1ea')],
    schemes: [{ id: 'stock', source: null, colours: {} }],
  },
  timber1500: {
    regions: [r('wing', '#f1f0ea'), r('fuselage', '#f1f0ea'), r('tail', '#f1f0ea'), r('trim', '#d5271f'), r('stripe', '#17191b'), r('floats', '#f1f0ea', { floats: true })],
    schemes: [
      { id: 'stock', source: src('E-flite Turbo Timber Evolution, EFL105250', 'https://www.horizonhobby.com/product/e-flite-turbo-timber-evolution-1.5m-bnf-basic-includes-floats/EFL105250.html'), colours: {} },
      { id: 'timber', source: src('E-flite Timber 1.5 m, EFL5250', 'https://www.horizonhobby.com/product/e-flite-timber-1.5m-bnf-basic-as3x-with-floats/EFL5250.html'), colours: { ...all('#f2f2f2', ['wing', 'fuselage', 'tail', 'floats']), trim: '#b11b24', stripe: '#0e1213' } },
      { id: 'timber_x', source: src('E-flite Timber X 1.2 m, EFL3850', 'https://www.horizonhobby.com/product/e-flite-timber-x-1.2m-bnf-basic-with-as3x-and-safe-select/EFL3850.html'), colours: { ...all('#f2f2f2', ['wing', 'fuselage', 'tail', 'floats']), trim: '#85c936', stripe: '#1e1e1d' } },
      { id: 'super', source: src('E-flite Super Timber 1.7 m, EFL02550', 'https://www.horizonhobby.com/product/e-flite-super-timber-1.7m-bnf-basic-with-as3x-and-safe-select/EFL02550.html'), colours: { ...all('#eaaa06', ['wing', 'tail', 'trim']), fuselage: '#f2f2f2', floats: '#f2f2f2', stripe: '#1a1a1a' } },
      { id: 'twin', source: src('E-flite Twin Timber 1.6 m, EFL23850', 'https://www.horizonhobby.com/product/e-flite-twin-timber-1.6m-bnf-basic-with-as3x-and-safe-select/EFL23850.html'), colours: { ...all('#0e65ba', ['wing', 'trim']), ...all('#f2f2f2', ['fuselage', 'tail', 'floats']), stripe: '#0f1c3c' } },
    ],
  },
  bombshell1118: {
    regions: [r('wing', '#c8161a'), r('fuselage', '#17171a'), r('tail', '#17171a'), r('swoop', '#c8161a')],
    schemes: [
      { id: 'stock', source: src('BMJR Models, Buzzard Bombshell', 'https://bmjrmodels.com/product/buzzard-bombshell/'), colours: {} },
      { id: 'baby', source: src('Outerzone oz2180, Baby Bombshell, Flying Models 1992', 'https://outerzone.co.uk/plan_details.asp?ID=2180'), colours: { wing: '#f0db2c', fuselage: '#0e65ba', tail: '#032257', swoop: '#b11b24' } },
      { id: 'kittur', source: src('Outerzone oz5360, a builder\'s Bombshell', 'https://outerzone.co.uk/plan_details.asp?ID=5360'), colours: { wing: '#f2f2f2', fuselage: '#d1dae2', tail: '#f2f2f2', swoop: '#032257' } },
      { id: 'class_a', source: src('Outerzone oz6289, a Class A Baby Bombshell', 'https://outerzone.co.uk/plan_details.asp?ID=6289'), colours: { wing: '#ca8462', fuselage: '#c98d64', tail: '#f2f2f2', swoop: '#4e4653' } },
    ],
  },
  kadet1981: {
    /* The trims are drawn into the same film maps as the wing and the
     * fuselage, so each wears its main region's finish (`finish: false`). */
    regions: [r('wing', '#ffdb1a', { film: true }), r('wing_trim', '#d61214', { film: true, finish: false }), r('fuselage', '#d61214', { film: true }), r('fuse_trim', '#ffdb1a', { film: true, finish: false })],
    schemes: [
      { id: 'stock', source: null, colours: {} },
      { id: 'sig_kit', source: src('SIG Kadet Senior kit RC-58', 'https://sigmfg.com/products/kadet-senior-kit'), colours: { wing: '#b21527', wing_trim: '#0e1213', fuselage: '#b21527', fuse_trim: '#0e1213' } },
      { id: 'sport_red', source: SIG_ARF, colours: { wing: '#f2f2f2', wing_trim: '#b21527', fuselage: '#b21527', fuse_trim: '#f2f2f2' } },
      { id: 'sport_blue', source: SIG_ARF, colours: { wing: '#f2f2f2', wing_trim: '#335a9a', fuselage: '#335a9a', fuse_trim: '#f2f2f2' } },
    ],
  },
  uglystik1567: {
    /* RCM's own model as its May 1985 photographs show it: red all over,
     * the wing's outer panels, a band round the fuselage behind the wing
     * and the fin white, and black crosses on them, as the plan labels
     * them "(WHITE)" and "(BLACK CROSS & BANDS)". */
    regions: [r('wing', '#c8161a'), r('fuselage', '#c8161a'), r('tail', '#c8161a'), r('panels', '#f2efe6'), r('crosses', '#141416')],
    schemes: [
      { id: 'stock', source: src('RCM, Das Ugly Stik, plan 939, May 1985 (Outerzone oz6801)', 'https://outerzone.co.uk/plan_details.asp?ID=6801'), colours: {} },
    ],
  },
  p51d1450: {
    /* FMS's natural metal P-51 as its manual photographs it: silver all
     * over, the red of the nose band, the spinner and the fin's top, and
     * the black of the anti-glare panel and the identification bands. */
    regions: [r('wing', '#cad0d5'), r('fuselage', '#cad0d5'), r('tail', '#cad0d5'), r('trim', '#c8161a'), r('stripe', '#17191b')],
    schemes: [
      { id: 'stock', source: src('FMS P-51D Mustang V8 1450 mm, the manual\'s photographs', 'https://cdn-files.myshopline.com/file/store/1772248208561/55c1d8443b5c438095f19ab8babfc3b0.pdf'), colours: {} },
    ],
  },
  extra1308: {
    /* E-flite's moulded foam in its own paint: the nose and spats yellow
     * orange, the wing's top white with grey outer panels (the tail's
     * grey), its underside in yellow and black squares. */
    regions: [r('wing', '#eceef0'), r('fuselage', '#eceef0'), r('nose', '#f2a81d'), r('tail', '#8a9096'), r('trim', '#16181a'), r('checks', '#f2b21d')],
    schemes: [
      { id: 'stock', source: src('E-flite Extra 300 3D 1.3m, EFL115500', 'https://www.horizonhobby.com/product/e-flite-extra-300-3d-1.3m-bnf-basic-with-as3x-and-safe-select/EFL115500.html'), colours: {} },
      { id: 'umx', source: src('E-flite UMX Extra 300 3D, EFLU1080: red, grey and black', 'https://www.hobbyzone.com/EFLU1080.html'), colours: { nose: '#b11b24', checks: '#b11b24', tail: '#6b7176', wing: '#d1dae2', fuselage: '#d1dae2' } },
    ],
  },
  pitts850: {
    /* E-flite's moulded foam in its own paint: red all over, the top
     * wing's top a white sunburst from the cockpit, white bars across the
     * bottom wing's underside, white pinstripes down the fuselage. */
    regions: [r('wing', '#d42a22'), r('fuselage', '#d42a22'), r('tail', '#d42a22'), r('rays', '#f2f0ec'), r('trim', '#16181a')],
    schemes: [
      { id: 'stock', source: src('E-flite Pitts S-1S 850mm, EFL35500', 'https://www.horizonhobby.com/product/pitts-s-1s-bnf-basic-with-as3x-and-safe-select-850mm/EFL35500.html'), colours: {} },
    ],
  },
  f16878: {
    /* Painted foam, not film: Freewing's "modern three tone gray US Air
     * Force base colors", the F-16C's FS 595 36118 Gunship Gray, 36270
     * Medium Gray and 36375 Light Ghost Gray, and the canopy's gold tint. */
    regions: [r('dark', '#4d5357'), r('medium', '#7f878c'), r('light', '#a9b0b4'), r('canopy', '#8a7440')],
    schemes: [
      { id: 'stock', source: src('Freewing F-16 Falcon V3 6S High Performance, FJ21115P', `${FREEWING}freewing-f-16-falcon-v3-6s-high-performance-70mm-edf-jet-pnp-fj21115p.html`), colours: {} },
      { id: 'arctic', source: src('Freewing F-16 V3 Arctic Camo, FJ21125P', 'https://motionrc.com/products/freewing-f-16-v3-arctic-camo-high-performance-70mm-edf-jet-pnp-fj21125p'), colours: { dark: '#3b3f44', medium: '#c9ced2', light: '#eef0f1' } },
    ],
  },
  zagi1219: {
    /* Zagi's HP as zagi.com photographs it: orange covering tape all
     * over, black winglets, the charcoal canopy and tray; and the 5C
     * combat wing's scheme, yellow with black tape on the leading edge
     * and black winglets. */
    regions: [r('wing', '#f0561e'), r('trim', '#f0561e'), r('winglets', '#17191b'), r('canopy', '#34383c')],
    schemes: [
      { id: 'stock', source: src('Zagi, Zagi HP product photograph', 'https://web.archive.org/web/2019/https://zagi.com/product/hp/'), colours: {} },
      { id: 'combat', source: src('Zagi, Zagi 5C product photograph', 'https://web.archive.org/web/2017/https://zagi.com/category/kits/'), colours: { wing: '#f0db2c', trim: '#17191b' } },
    ],
  },
};

/* Extreme Flight's two schemes for the 60 in Edge, from its data sheet's
 * colour codes: blue (Oracover Blue #50, Cub Yellow #30, Cadmium Yellow
 * #33, White, Dark Blue, Silver), the stock one the model draws, and red
 * (Ferrari Red #23, White #10, Pearl Charcoal #77, Silver, Black). */
LIVERIES.edge1524 = {
  regions: [r('wing', '#1d4fc4'), r('fuselage', '#1d4fc4'), r('tail', '#1d4fc4'), r('trim', '#f5d20f')],
  schemes: [
    { id: 'stock', source: EF_SHEET, colours: {} },
    { id: 'ef_red', source: EF_SHEET, colours: { ...all('#dfdcd8', ['wing', 'fuselage', 'tail']), trim: '#ba100f' } },
  ],
};

const FAMILY = { timber1500f: 'timber1500', cub1400f: 'cub1400' };

/* The entry an aircraft's paint is stored under: a float plane's is its
 * land plane's. */
export function liveryKey(airframeId) {
  return FAMILY[airframeId] ?? airframeId;
}

/* Whether this aircraft can be painted at all: planes, not quads. */
export function paintable(airframeId) {
  return Boolean(LIVERIES[liveryKey(airframeId)]);
}

/* The regions this aircraft shows: its family's, the floats only on floats. */
export function regionsFor(airframeId) {
  const l = LIVERIES[liveryKey(airframeId)];
  if (!l) {
    return [];
  }
  const floats = Boolean(airframeById(airframeId).floats);
  return l.regions.filter((r) => floats || !r.floats);
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
  const paint = checkPaint(l.regions, entry);
  dropped += paint.dropped;
  if (Object.keys(paint.finishes).length) {
    out.finishes = paint.finishes;
  }
  if (paint.decals.length) {
    out.decals = paint.decals;
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
 * region's colour as a number, the finishes and the decals.
 */
export function lookFor(airframeId, entry) {
  return {
    colours: colourNumbers(coloursFor(airframeId, entry)),
    finishes: (entry && entry.finishes) || {},
    decals: (entry && entry.decals) || [],
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
  return decodeLivery(code, normaliseEntry, entryDrops);
}

/* The swatches a region offers: the see through films for a film region,
 * the opaque covering for the rest. */
export function paletteFor(region) {
  return PALETTE.filter((c) => Boolean(c.film) === Boolean(region.film));
}

/* The covering a colour is, if it is one on the palette. */
export function paletteColour(hex) {
  return PALETTE.find((c) => c.hex === hex) ?? null;
}
