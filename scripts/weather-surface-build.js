/*
 * weather-surface-build.js: bakes src/game/weather-surface.js, the ground
 * under each map's air (docs/WEATHER-CONTRACT.md, "The surface").
 *
 *     node scripts/weather-surface-build.js --three=DIR [--check]
 *
 * DIR is an unpacked three@0.160.0 npm package (as collide-audit-air.js
 * takes it): the alps' and swiss2's terrain modules import three. --check
 * rebuilds and compares with the committed file, writing nothing.
 *
 * The thermals need to know water from forest from open ground, and the
 * weather runs in the physics path, where it may not call the maps'
 * terrain functions (Math.pow and trig) or fetch anything. So the surface
 * is read once here, from each map's own data, into a coarse grid of
 * classes, and committed:
 *
 *   itaipu    water.json's two bodies (inside an outline is water), else
 *             masks/ring.png's four channels (forest, field, red soil,
 *             urban; Sentinel-2 and OSM, the data folder's manifest),
 *             from FDFPV_ITAIPU_DATA (scripts/lib/itaipu-ground.js) or,
 *             missing that, the published data folder, checked against
 *             its manifest's sha256.
 *   interior  src/share/interior/land.bin, ESA WorldCover's classes.
 *   swiss2,   groundZone (src/maps/alps/terrain.js) on each map's own
 *   alps      field: the lake, the forest, rock and snow.
 *
 * A cell takes the class most of its samples have.
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

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

import { DATA as ITAIPU_DATA } from './lib/itaipu-ground.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(root, 'src/game/weather-surface.js');
const PUBLISHED = 'https://fdflabs.github.io/fdfpv-itaipu-data/';

const threeArg = process.argv.find((a) => a.startsWith('--three='));
if (!threeArg) {
  throw new Error('weather-surface: --three=DIR (an unpacked three@0.160.0 npm package) is needed');
}
const threeBase = pathToFileURL(`${threeArg.slice(8).replace(/\/$/, '')}/`).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: '${threeBase}build/three.module.js', shortCircuit: true };
  return next(spec, ctx);
}`)}`);

const { CLASS } = await import('../src/game/weather-surface-classes.js');
const { LAND, decodeLand } = await import('../src/share/interior/world.js');
const { HALF: INTERIOR_HALF, L_CELL, L_N } = await import('../src/share/interior/frame.js');
const alps = await import('../src/maps/alps/terrain.js');
const swiss = await import('../src/maps/swiss2/terrain.js');


function majority(counts) {
  let best = 0;
  for (let c = 1; c < counts.length; c += 1) {
    if (counts[c] > counts[best]) {
      best = c;
    }
  }
  return best;
}

/* One grid: n by n cells `cell` metres from (x0, x0), each the majority
 * of classOf over sub by sub samples, at the source's own spacing. */
function bake(x0, cell, n, sub, classOf) {
  const out = new Uint8Array(n * n);
  const counts = new Int32Array(Object.keys(CLASS).length);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      counts.fill(0);
      for (let b = 0; b < sub; b += 1) {
        for (let a = 0; a < sub; a += 1) {
          counts[classOf(x0 + (i + (a + 0.5) / sub) * cell, x0 + (j + (b + 0.5) / sub) * cell)] += 1;
        }
      }
      out[j * n + i] = majority(counts);
    }
  }
  return out;
}

/* A PNG's RGBA bytes: 8 bit, colour type 6, not interlaced, as the data
 * folder's masks are. */
function decodePng(buf) {
  let at = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) {
        throw new Error('weather-surface: a mask is not 8 bit RGBA, not interlaced');
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? px[y * stride + x - 4] : 0;
      const up = y > 0 ? px[(y - 1) * stride + x] : 0;
      const ul = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      let v = src[x];
      if (f === 1) {
        v += left;
      } else if (f === 2) {
        v += up;
      } else if (f === 3) {
        v += (left + up) >> 1;
      } else if (f === 4) {
        const p = left + up - ul;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - ul);
        v += pa <= pb && pa <= pc ? left : (pb <= pc ? up : ul);
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, px };
}

async function itaipuFile(name, manifest) {
  const local = join(ITAIPU_DATA, name);
  let bytes;
  if (existsSync(local)) {
    bytes = await readFile(local);
  } else {
    const res = await fetch(PUBLISHED + name);
    if (!res.ok) {
      throw new Error(`weather-surface: ${PUBLISHED}${name}: HTTP ${res.status}`);
    }
    bytes = Buffer.from(await res.arrayBuffer());
  }
  if (manifest) {
    const sum = createHash('sha256').update(bytes).digest('hex');
    if (sum !== manifest.files[name]) {
      throw new Error(`weather-surface: ${name} is not the manifest's (${sum})`);
    }
  }
  return bytes;
}

function inside(poly, x, z) {
  let odd = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i, i += 1) {
    const [xi, zi] = poly[i];
    const [xk, zk] = poly[k];
    if ((zi > z) !== (zk > z) && x < xi + (z - zi) * (xk - xi) / (zk - zi)) {
      odd = !odd;
    }
  }
  return odd;
}

async function itaipu() {
  const manifest = JSON.parse(await itaipuFile('manifest.json', null));
  const bodies = JSON.parse(await itaipuFile('water.json', manifest));
  const ring = decodePng(await itaipuFile('masks/ring.png', manifest));
  const half = manifest.frame.ring[1];
  const px = (2 * half) / ring.w;
  const classOf = (x, z) => {
    if (bodies.some((b) => inside(b.outline, x, z))) {
      return CLASS.water;
    }
    const i = Math.min(ring.w - 1, Math.max(0, Math.floor((x + half) / px)));
    const j = Math.min(ring.h - 1, Math.max(0, Math.floor((z + half) / px)));
    const k = (j * ring.w + i) * 4;
    const [forest, field, soil, urban] = ring.px.subarray(k, k + 4);
    const bare = soil + urban;
    if (forest >= field && forest >= bare) {
      return CLASS.forest;
    }
    return field >= bare ? CLASS.open : CLASS.bare;
  };
  const cell = 160;
  return { x0: -half, cell, n: (2 * half) / cell, classes: bake(-half, cell, (2 * half) / cell, cell / px, classOf) };
}

async function interior() {
  const land = decodeLand(await readFile(join(root, 'src/share/interior/land.bin')));
  const of = {
    [LAND.water]: CLASS.water,
    [LAND.forest]: CLASS.forest,
    [LAND.wetland]: CLASS.forest,
    [LAND.pasture]: CLASS.open,
    [LAND.crop]: CLASS.open,
    [LAND.shrub]: CLASS.open,
    [LAND.bare]: CLASS.bare,
    [LAND.built]: CLASS.bare,
    [LAND.burned]: CLASS.bare,
  };
  const classOf = (x, z) => {
    const i = Math.min(L_N - 1, Math.floor((x + INTERIOR_HALF) / L_CELL));
    const j = Math.min(L_N - 1, Math.floor((z + INTERIOR_HALF) / L_CELL));
    return of[land[j * L_N + i]];
  };
  const cell = 80;
  const n = (2 * INTERIOR_HALF) / cell;
  return { x0: -INTERIOR_HALF, cell, n, classes: bake(-INTERIOR_HALF, cell, n, cell / L_CELL, classOf) };
}

function valley(field) {
  const zone = {};
  const classOf = (x, z) => {
    alps.groundZone(field, x, z, 10, zone);
    if (zone.lake && zone.y < alps.LAKE_Y) {
      return CLASS.water;
    }
    if (zone.snow > 0.5) {
      return CLASS.snow;
    }
    if (zone.forest > 0.5) {
      return CLASS.forest;
    }
    return zone.rock > 0.5 || zone.scree > 0.5 ? CLASS.bare : CLASS.open;
  };
  const cell = 100;
  const n = alps.FIELD / cell;
  return { x0: -alps.HALF, cell, n, classes: bake(-alps.HALF, cell, n, 4, classOf) };
}

/* A grid as text: runs, each a class letter (a for 0) and its length. */
function runs(classes) {
  let s = '';
  for (let k = 0; k < classes.length;) {
    let e = k;
    while (e < classes.length && classes[e] === classes[k]) {
      e += 1;
    }
    s += String.fromCharCode(97 + classes[k]) + (e - k);
    k = e;
  }
  return s;
}

const grids = {
  itaipu: await itaipu(),
  interior: await interior(),
  swiss2: valley(swiss.buildSwissField()),
  alps: valley(alps.buildHeightfield()),
};

const head = (await readFile(fileURLToPath(import.meta.url), 'utf8')).match(/ \* This file is part[\s\S]*?\*\//)[0];
let text = `/*
 * weather-surface.js: GENERATED by scripts/weather-surface-build.js, do
 * not edit. Each map's ground as a grid of weather-surface-classes.js
 * classes, x and z from x0, \`cell\` metres a cell, n a side, row by row
 * (z), as runs: a class letter (a is 0) and how many cells.
 *
${head}

export const SURFACE = {
`;
const counts = {};
for (const [id, g] of Object.entries(grids)) {
  text += `  ${id}: { x0: ${g.x0}, cell: ${g.cell}, n: ${g.n}, runs: '${runs(g.classes)}' },\n`;
  const c = new Array(Object.keys(CLASS).length).fill(0);
  g.classes.forEach((v) => { c[v] += 1; });
  counts[id] = Object.fromEntries(Object.entries(CLASS).map(([name, v]) => [name, `${(100 * c[v] / g.classes.length).toFixed(1)}%`]));
}
text += '};\n';

for (const [id, c] of Object.entries(counts)) {
  console.log(`  ${id}: ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
if (process.argv.includes('--check')) {
  const now = existsSync(OUT) ? await readFile(OUT, 'utf8') : '';
  console.log(now === text ? 'weather-surface.js is what the data gives' : 'FAIL weather-surface.js differs from a rebuild');
  process.exitCode = now === text ? 0 : 1;
} else {
  await writeFile(OUT, text);
  console.log(`wrote ${OUT}, ${text.length} bytes`);
}
