/*
 * itaipu-ground.js: the Itaipu map's drawn ground in Node, from the data
 * folder's hero tiles cut to the concrete as the page cuts them
 * (terrain/conform.js), read the way the terrain engine's finestAt reads
 * its finest tile (the same two triangles a cell is drawn as). For the
 * checks that need the ground without a browser: scripts/water-itaipu.js
 * builds the flood's bed on it.
 *
 * And the water.json the parts are given, met to the banks. The data
 * folder is FDFPV_ITAIPU_DATA, by default
 * ~/Desktop/fdfpv-itaipu-data; readGround resolves to null when it is
 * not there, so a check can say it skipped.
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

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  HERO, TILE_CELLS, TILE_SAMPLES, cellOf, decode,
} from '../../src/maps/terrain/frame.js';
import { HERO_HALF, ITAIPU_FRAME } from '../../src/maps/itaipu/terrain/frame.js';
import { conformBound, conformTile, fillUnder } from '../../src/maps/itaipu/terrain/conform.js';
import { embankmentCrests, embankmentSection, junctionRims } from '../../src/maps/itaipu/dam/index.js';
import { meetBanks } from '../../src/maps/itaipu/water/meet.js';

export const DATA = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));

/* engine.js tri: a cell's two triangles, split on its 00-11 diagonal's
 * other one, as the chunks draw it. */
function tri(data, ci, cj, fu, fv) {
  const k = cj * TILE_SAMPLES + ci;
  const h00 = decode(data[k]);
  const h10 = decode(data[k + 1]);
  const h01 = decode(data[k + TILE_SAMPLES]);
  const h11 = decode(data[k + TILE_SAMPLES + 1]);
  if (fu + fv <= 1) {
    return h00 + (h10 - h00) * fu + (h01 - h00) * fv;
  }
  return h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv);
}

/* { ground(x, z), water, dam, manifest }, or null without the data. */
export async function readGround() {
  if (!existsSync(join(DATA, 'manifest.json'))) {
    return null;
  }
  const json = async (f) => JSON.parse(await readFile(join(DATA, f), 'utf8'));
  const manifest = await json('manifest.json');
  const water = await json('water.json');
  const dam = await json('dam.json');
  const shape = { bound: conformBound(junctionRims(dam), embankmentCrests(dam)), fill: fillUnder(embankmentSection(dam)) };
  const hero = new Map();
  for (const [i, j] of manifest.hero.tiles) {
    const buf = await readFile(join(DATA, `hero/${i}_${j}.bin`));
    const data = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2).slice();
    conformTile(HERO, i, j, data, ITAIPU_FRAME.half, shape);
    hero.set(`${i}:${j}`, data);
  }
  const HALF = ITAIPU_FRAME.half;
  const cell = cellOf(HERO);
  /* finestAt's hero branch; every point the flood asks for is in the
   * hero square. */
  const ground = (x, z) => {
    const gx = (x + HALF) / cell;
    const gz = (z + HALF) / cell;
    const ci = Math.floor(gx);
    const cj = Math.floor(gz);
    const ti = Math.floor(ci / TILE_CELLS);
    const tj = Math.floor(cj / TILE_CELLS);
    const data = hero.get(`${ti}:${tj}`);
    if (!data) {
      throw new Error(`itaipu ground: (${x}, ${z}) is outside the hero tiles`);
    }
    const lx = Math.min(TILE_CELLS - 1, ci - ti * TILE_CELLS);
    const lz = Math.min(TILE_CELLS - 1, cj - tj * TILE_CELLS);
    return tri(data, lx, lz, Math.min(1, gx - ti * TILE_CELLS - lx), Math.min(1, gz - tj * TILE_CELLS - lz));
  };
  /* The outlines as the map's parts are handed them, brought to the
   * banks on the ground as cut (itaipu.js, water/meet.js meetBanks). */
  return {
    ground, water: meetBanks(water, dam, ground, HERO_HALF), dam, manifest,
  };
}
