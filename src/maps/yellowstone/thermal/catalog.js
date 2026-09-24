/*
 * catalog.js: thermal.json read, checked and sorted, with no Three.js in it.
 *
 * The NPS inventory is about ten thousand entries. This turns the file into
 * one plain list of features in a single vocabulary (kind, colour class,
 * temperature, a geyser's interval, duration and height as ranges in
 * seconds and metres), picks out the hero landmarks by name,
 * and buckets the rest by the level 0 terrain tile they stand in, which is
 * the unit the terrain engine streams and so the unit features are built
 * and freed in. Pure, so scripts/yellowstone-thermal-selftest.js runs it
 * under Node against the fixtures and the real file.
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

/* The contract's frame: world x and z in [-50000, 50000], level 0 tiles of
 * 256 cells of 30 m, their min corner at -50000 + i * size. */
export const EXTENT = 50000;
export const TILE0 = 256 * 30;
export const TILES = Math.ceil((2 * EXTENT) / TILE0);

export function regionOf(x, z) {
  const i = Math.max(0, Math.min(TILES - 1, Math.floor((x + EXTENT) / TILE0)));
  const j = Math.max(0, Math.min(TILES - 1, Math.floor((z + EXTENT) / TILE0)));
  return { key: `${i}_${j}`, i, j, x0: -EXTENT + i * TILE0, z0: -EXTENT + j * TILE0, x1: -EXTENT + (i + 1) * TILE0, z1: -EXTENT + (j + 1) * TILE0 };
}

/*
 * The hero landmarks, and where each stands when thermal.json does not
 * name it. The first four are the contract's table; the rest are projected
 * from the coordinates Wikipedia publishes for them with the same UTM 12N
 * transform (Kruger series, checked against the contract's four to within
 * five metres), so they are placeholders the inventory's own positions
 * replace. `match` is what the inventory's name has to contain.
 */
export const HEROES = [
  { id: 'old-faithful', match: /^old faithful( geyser)?$/i, x: -26325, z: 17964 },
  { id: 'grand-prismatic', match: /^grand prismatic( spring)?$/i, x: -27143, z: 10790 },
  { id: 'excelsior', match: /^excelsior( geyser)?( crater)?$/i, x: -27043, z: 10647 },
  { id: 'morning-glory', match: /^morning glory( pool)?$/i, x: -27562, z: 16356 },
  { id: 'castle', match: /^castle( geyser)?$/i, x: -27007, z: 17638 },
  { id: 'grand', match: /^grand( geyser)?$/i, x: -27141, z: 17281 },
  { id: 'riverside', match: /^riverside( geyser)?$/i, x: -27314, z: 16517 },
  { id: 'beehive', match: /^beehive( geyser)?$/i, x: -26477, z: 17680 },
  { id: 'paint-pot', match: /^fountain paint ?pots?$/i, x: -24718, z: 7841 },
  /* Not the contract table's (-16630, -39394), which has no thermal
   * feature within 300 m: GNIS's Mammoth Hot Springs, inside the
   * inventory's cluster of Mammoth terraces (see YELLOWSTONE-PLAN.md). */
  { id: 'mammoth', match: /^(mammoth hot springs|main terrace)$/i, x: -17033, z: -38420 },
  { id: 'lower-falls', match: /^lower falls/i, x: -83, z: -10748 },
];

/* The inventory's words for a kind, folded to the five the builders know. */
const KINDS = {
  geyser: 'geyser',
  'hot-spring': 'spring',
  spring: 'spring',
  pool: 'spring',
  'hot-pool': 'spring',
  fumarole: 'fumarole',
  'steam-vent': 'fumarole',
  vent: 'fumarole',
  mudpot: 'mudpot',
  'mud-pot': 'mudpot',
  'mud-volcano': 'mudpot',
  terrace: 'terrace',
  'travertine-terrace': 'terrace',
};

/* Colour classes, folded to the palettes in springs.js. The inventory's
 * own (thermal.json's "colours") are blue (73 C or more), yellow (60 to
 * 73), orange (40 to 60), brown (below 40) and acid (pH below 3.5); the
 * rest are the words such a class could plausibly arrive in. Anything else
 * is left null and the spring is coloured from its temperature. */
const COLOURS = {
  blue: 'blue',
  'deep-blue': 'blue',
  turquoise: 'turquoise',
  aqua: 'turquoise',
  green: 'green',
  'blue-green': 'turquoise',
  yellow: 'yellow',
  orange: 'orange',
  red: 'orange',
  brown: 'brown',
  tan: 'brown',
  grey: 'grey',
  gray: 'grey',
  white: 'grey',
  milky: 'milky',
  murky: 'brown',
  clear: 'blue',
  acid: 'acid',
};

const fold = (s) => String(s).trim().toLowerCase().replace(/[\s_]+/g, '-');

/* A published range, [min, max] or one number, as { mean, min, max }, or
 * null when it is missing or not positive. */
function range(v) {
  const pair = Array.isArray(v) ? v.map(num) : [num(v), num(v)];
  if (pair.length < 1 || pair.some((p) => p === undefined || p <= 0)) {
    return null;
  }
  const min = Math.min(...pair);
  const max = Math.max(...pair);
  return { mean: (min + max) / 2, min, max };
}

/* A size factor from an id: log normal about 0.8, from about 0.3 to 3. */
function dealSpread(id) {
  let h = 2166136261;
  for (let k = 0; k < id.length; k += 1) {
    h = Math.imul(h ^ id.charCodeAt(k), 16777619);
  }
  const u = ((h >>> 0) % 100000) / 100000;
  const v = (((Math.imul(h, 2654435761) >>> 0) % 100000) + 0.5) / 100000;
  const g = Math.sqrt(-2 * Math.log(v)) * Math.cos(2 * Math.PI * u);
  return Math.min(3, Math.max(0.3, Math.exp(-0.2 + 0.55 * g)));
}

/* A finite number or undefined, never NaN. */
function num(v) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : undefined;
}

/*
 * One feature, or a reason it was refused. Refused entries are counted, not
 * thrown: one bad row in ten thousand must not take the park down, but it
 * must be visible, so the selftest prints the reasons.
 */
function normalise(raw, index) {
  if (!raw || typeof raw !== 'object') {
    return { bad: 'not an object' };
  }
  const x = num(raw.x);
  const z = num(raw.z);
  if (x === undefined || z === undefined) {
    return { bad: 'no x or z' };
  }
  if (Math.abs(x) > EXTENT || Math.abs(z) > EXTENT) {
    return { bad: 'outside the extent' };
  }
  const kindWord = raw.kind === undefined ? 'spring' : fold(raw.kind);
  const kind = KINDS[kindWord];
  if (!kind) {
    return { bad: `unknown kind ${kindWord}` };
  }
  const colourWord = raw.colour ?? raw.color ?? raw.colourClass ?? raw.colorClass;
  const colour = colourWord === undefined || colourWord === null ? null : (COLOURS[fold(colourWord)] ?? null);
  let r = num(raw.radius ?? raw.r);
  if (r === undefined || r <= 0) {
    r = kind === 'fumarole' ? 0.6 : kind === 'mudpot' ? 1.5 : kind === 'terrace' ? 20 : 1.5;
  }
  /* Nothing in the inventory is a crater of more than a couple of hundred
   * metres; a bigger radius is a unit slip, clamped so it cannot paint a
   * square kilometre of sinter. */
  r = Math.min(r, 150);
  const interval = range(raw.interval);
  const duration = range(raw.duration);
  const height = range(raw.height);
  /* NPS gives nearly every spring the same 1.5 m (9393 of 9654 entries in
   * the 2026-09-24 file): a placeholder, not a measurement. A basin of
   * identical discs reads as a pattern, so a spring at exactly that size
   * is dealt one from its id, most small and a few large, the same on
   * every load. */
  if (kind === 'spring' && r === 1.5) {
    r = 1.5 * dealSpread(String(raw.id ?? index));
  }
  const temp = num(raw.temp);
  return {
    id: raw.id === undefined ? `#${index}` : String(raw.id),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null,
    kind,
    x,
    z,
    y: num(raw.y),
    r,
    colour,
    temp: temp === undefined ? null : temp,
    /* Seconds and metres, each as { mean, min, max } or null. */
    interval,
    duration,
    height,
  };
}

/*
 * The whole file. Accepts `{ features: [...] }` or a bare array. Returns the
 * heroes found (id to feature, falling back to the table above), the rest
 * bucketed by region key, and counts for the selftest to print.
 */
export function readThermal(json) {
  const list = Array.isArray(json) ? json : json && Array.isArray(json.features) ? json.features : null;
  if (!list) {
    throw new Error('thermal.json: expected an array or { features: [...] }');
  }
  const refused = {};
  const kinds = {};
  const regions = new Map();
  const heroes = {};
  const all = [];
  list.forEach((raw, k) => {
    const f = normalise(raw, k);
    if (f.bad) {
      refused[f.bad] = (refused[f.bad] ?? 0) + 1;
      return;
    }
    const hero = f.name && HEROES.find((h) => h.match.test(f.name));
    if (hero && !heroes[hero.id]) {
      heroes[hero.id] = { ...f, hero: hero.id };
      return;
    }
    kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
    all.push(f);
    const reg = regionOf(f.x, f.z);
    if (!regions.has(reg.key)) {
      regions.set(reg.key, []);
    }
    regions.get(reg.key).push(f);
  });
  let fromTable = 0;
  for (const h of HEROES) {
    if (!heroes[h.id]) {
      heroes[h.id] = { id: h.id, name: null, kind: 'hero', x: h.x, z: h.z, r: null, colour: null, temp: null, interval: null, duration: null, height: null, hero: h.id, fromTable: true };
      fromTable += 1;
    }
  }
  return {
    features: all,
    regions,
    heroes,
    counts: { read: list.length, placed: all.length, heroes: HEROES.length - fromTable, heroesFromTable: fromTable, kinds, refused },
  };
}

/*
 * Basins as seen from the air: the features binned on a coarse grid, and
 * every bin with enough going on in it becomes one far plume. Steam over
 * the basins is how a pilot finds them from three kilometres up, long
 * before any single spring is a pixel.
 */
export function basinPlumes(features, cell = 400, minCount = 6) {
  const bins = new Map();
  for (const f of features) {
    if (f.kind === 'terrace') {
      continue;
    }
    const i = Math.floor(f.x / cell);
    const j = Math.floor(f.z / cell);
    const key = `${i},${j}`;
    let b = bins.get(key);
    if (!b) {
      b = { n: 0, sx: 0, sz: 0, heat: 0 };
      bins.set(key, b);
    }
    /* A geyser or a big pool steams more than a pinhole fumarole. */
    const w = f.kind === 'geyser' ? 2 : Math.min(3, 0.5 + f.r / 3);
    b.n += 1;
    b.sx += f.x * w;
    b.sz += f.z * w;
    b.heat += w;
  }
  const out = [];
  for (const b of bins.values()) {
    if (b.n >= minCount) {
      out.push({ x: b.sx / b.heat, z: b.sz / b.heat, n: b.n, heat: b.heat });
    }
  }
  return out;
}
