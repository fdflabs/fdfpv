/*
 * synth-tiles.js: write a synthetic Yellowstone in the contract's exact
 * tile format, so the engine can be built and tested before the real data
 * exists and against a ground whose every height is known.
 *
 *   node src/maps/yellowstone/terrain/synth-tiles.js OUT_DIR
 *
 * OUT_DIR must be outside the repository: 26 MB of level 0 alone, and the
 * contract keeps data out of the tree. Serve it the way the real folder is
 * served, with FDFPV_YELLOWSTONE_DATA=OUT_DIR (see scripts/serve.js).
 *
 * The shape is invented but placed on the contract's landmarks, so a
 * camera parked at Old Faithful sees a flat basin, the lake sits where the
 * lake is and ranges stand where the Gallatins and the Absarokas do. The
 * pyramid levels are point samples of the same function, not averages, so
 * a coarse level disagrees with a fine one between its samples the way
 * resampled real data does, which is what the crack check has to survive.
 * Hero tiles cover the Upper, Midway and Lower geyser basins at 10 m.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  HALF, TILE_CELLS, TILE_SAMPLES, HERO, LEVELS, LANDMARKS,
  cellOf, tileSizeOf, tilesPerAxis, tilePath, encode,
} from './frame.js';
import { fbm, noise2, smoothstep } from './noise.js';

/* A bump that is 1 at the centre and 0 past r. */
function dome(x, z, cx, cz, r) {
  return 1 - smoothstep(0, r, Math.hypot(x - cx, z - cz));
}

/* Distance from a point to a segment. */
function toSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

const OF = LANDMARKS.oldFaithful;
const LAKE = LANDMARKS.lakeCentre;
const WY = LANDMARKS.westYellowstone;
const MAM = LANDMARKS.mammoth;

/* World y at (x, z): metres above sea level minus Y0. */
export function synthHeight(x, z) {
  /* The plateau, 2300 to 2600 m, rolling. */
  let h = 150 + 260 * (fbm(x / 9000, z / 9000, 4) - 0.5) + 60 * (fbm(x / 1800, z / 1800, 3) - 0.5);
  /* Ranges: the Gallatins north west, the Washburns north of centre, the
   * Absarokas down the east side, rough to 3300 m. */
  const ridge = (fbm(x / 3200 + 7, z / 3200 - 3, 5) - 0.35) * 1.6;
  const ranges = Math.max(
    smoothstep(-22000, -34000, x) * smoothstep(-2000, -18000, z),
    dome(x, z, 2000, -26000, 11000),
    smoothstep(24000, 36000, x),
  );
  h += ranges * Math.max(0, 1100 * ridge + 250);
  /* The north falls away to Mammoth and the Gardner, 1900 m. */
  h -= 480 * smoothstep(-26000, -44000, z) * (1 - dome(x, z, MAM.x, MAM.z, 4000) * 0.3);
  /* West Yellowstone's flats, 2030 m, and the lake at 2357 m with a bed
   * forty metres under it. */
  const flats = dome(x, z, WY.x - 3000, WY.z, 9000);
  h = h * (1 - flats) + -170 * flats;
  const lake = smoothstep(0.62, 0.38, Math.hypot((x - LAKE.x) / 12000, (z - LAKE.z) / 9500) + 0.12 * (noise2(x / 4000, z / 4000) - 0.5));
  h = h * (1 - lake) + 117 * lake;
  /* The Grand Canyon of the Yellowstone: three hundred metres deep,
   * running north from the falls. */
  const canyon = toSegment(x, z, -83, -10748, 3500, -24000);
  h -= 300 * (1 - smoothstep(150, 700, canyon)) * smoothstep(-9000, -11500, z);
  /* The Firehole's geyser basins: a flat valley floor from the Lower basin
   * down past Old Faithful at 2240 m, with ground held flat round the
   * spawn. */
  const firehole = toSegment(x, z, OF.x, OF.z + 1500, -27800, 3000);
  const floor = 1 - smoothstep(700, 2600, firehole);
  h = h * (1 - floor) + (40 + 4 * (noise2(x / 300, z / 300) - 0.5) - (OF.z - z) * 0.002) * floor;
  const meadow = dome(x, z, OF.x, OF.z, 900);
  return h * (1 - meadow) + 40 * meadow;
}

/* The hero set: the Upper, Midway and Lower basins. */
function heroTiles() {
  const size = tileSizeOf(HERO);
  const out = [];
  const i0 = Math.floor((-29500 + HALF) / size);
  const i1 = Math.floor((-24500 + HALF) / size);
  const j0 = Math.floor((2000 + HALF) / size);
  const j1 = Math.floor((20000 + HALF) / size);
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      out.push([i, j]);
    }
  }
  return out;
}

function writeTile(out, level, i, j, files) {
  const cell = cellOf(level);
  const size = tileSizeOf(level);
  const x0 = -HALF + i * size;
  const z0 = -HALF + j * size;
  const buf = Buffer.alloc(TILE_SAMPLES * TILE_SAMPLES * 2);
  for (let r = 0; r < TILE_SAMPLES; r += 1) {
    for (let c = 0; c < TILE_SAMPLES; c += 1) {
      buf.writeUInt16LE(encode(synthHeight(x0 + c * cell, z0 + r * cell)), (r * TILE_SAMPLES + c) * 2);
    }
  }
  const rel = tilePath(level, i, j);
  mkdirSync(join(out, rel, '..'), { recursive: true });
  writeFileSync(join(out, rel), buf);
  files[rel] = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: node synth-tiles.js OUT_DIR');
    process.exit(2);
  }
  const out = resolve(arg);
  const files = {};
  const levels = [];
  const t0 = Date.now();
  for (const level of LEVELS) {
    const list = level === HERO ? heroTiles() : [];
    if (level !== HERO) {
      const n = tilesPerAxis(level);
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          list.push([i, j]);
        }
      }
    }
    for (const [i, j] of list) {
      writeTile(out, level, i, j, files);
    }
    levels.push({ level, cell: cellOf(level), cells: TILE_CELLS, tiles: list });
    console.log(`level ${level}: ${list.length} tiles, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  const manifest = {
    synthetic: true,
    frame: { epsg: 32612, e0: 540000, n0: 4941000, y0: 2200, half: HALF },
    levels: levels.filter((l) => l.level !== HERO),
    hero: levels.find((l) => l.level === HERO),
    files,
  };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
  console.log(`wrote ${Object.keys(files).length} tiles and manifest.json to ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main();
}
