/*
 * regions.js: telling the parts that stand on the ground when a level 0
 * tile's finest ground is drawn, and when it stops being.
 *
 * The thermal features and the water (src/maps/yellowstone/thermal/ and
 * water/) build per region, a region being one level 0 tile, on a drape
 * grid laid on heightAt(x, z), the finest level loaded there. What they
 * build is right only for the level they read, so the engine promises:
 *
 *   - a region is offered once some chunk inside it is drawn at the finest
 *     level the data has there (hero where the hero set covers it, else
 *     level 0) within REACH of the eye, and taken back once none has been
 *     for UNLOAD_FRAMES;
 *   - before it is offered, the finest tiles of it and of its eight
 *     neighbours are loaded (a landmark reaches up to 2 km past its own
 *     tile), and they stay pinned, never evicted, until it is taken back,
 *     so heightAt there cannot change under what was built on it.
 *
 * A part's load is one synchronous call of a hundred milliseconds and
 * more on the real data, which the engine cannot split; it makes at most
 * one such call a frame, nearest region first, so two parts entering one
 * basin cost two frames with a hitch each rather than one frame with both.
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

import { HALF, HERO, tileSizeOf } from './frame.js';

/* Frames a region stays loaded after its last finest chunk goes, so the
 * level changing back and forth at the edge of the split distance does
 * not build and free it over and over. */
const UNLOAD_FRAMES = 90;
/* A region is only offered while its finest chunk is this near the eye.
 * Level 0 is the finest level over most of the park, and it is drawn out
 * to about four kilometres, or straight down from three kilometres up,
 * where a pool is a pixel; the features' own far steam marks the basins
 * from there. */
const REACH = 2500;
const TILE0 = tileSizeOf(0);
const HERO_PER_TILE0 = TILE0 / tileSizeOf(HERO);

function distanceTo(nd, p) {
  const dx = Math.max(nd.x0 - p.x, 0, p.x - (nd.x0 + nd.nx * nd.cell));
  const dz = Math.max(nd.z0 - p.z, 0, p.z - (nd.z0 + nd.nz * nd.cell));
  const dy = Math.max(nd.minY - p.y, 0, p.y - nd.maxY);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function regionOf(i, j) {
  const x0 = -HALF + i * TILE0;
  const z0 = -HALF + j * TILE0;
  return { key: `${i}_${j}`, i, j, x0, z0, x1: x0 + TILE0, z1: z0 + TILE0 };
}

export class Regions {
  /* `parts` is a list of { name, load(region), unload(key) }. */
  constructor(terrain, parts) {
    this.terrain = terrain;
    this.parts = parts;
    /* key -> { region, state: 'waiting' | 'queued' | 'loaded', seen, done: Set of part names } */
    this.regions = new Map();
    this.lastLoadMs = 0;
    this.worstLoadMs = 0;
    this.loads = 0;
    this.unloads = 0;
  }

  /* The tiles a region needs loaded and pinned: level 0 and hero, over
   * it and its eight neighbours, where the data has them. */
  tilesOf(r) {
    const store = this.terrain.store;
    const out = [];
    for (let b = -1; b <= 1; b += 1) {
      for (let a = -1; a <= 1; a += 1) {
        const i = r.i + a;
        const j = r.j + b;
        if (store.exists(0, i, j)) {
          out.push([0, i, j]);
        }
        for (let hb = 0; hb < HERO_PER_TILE0; hb += 1) {
          for (let ha = 0; ha < HERO_PER_TILE0; ha += 1) {
            const hi = i * HERO_PER_TILE0 + ha;
            const hj = j * HERO_PER_TILE0 + hb;
            if (store.exists(HERO, hi, hj)) {
              out.push([HERO, hi, hj]);
            }
          }
        }
      }
    }
    return out;
  }

  /* Once a frame, after the selection. `eye` orders the loads. */
  update(eye, frame) {
    const t = this.terrain;
    const store = t.store;
    for (const nd of t.leaves) {
      const finest = nd.level === HERO || (nd.level === 0 && !t.childTilesListed(nd));
      if (!finest || distanceTo(nd, eye) > REACH) {
        continue;
      }
      const i = nd.level === HERO ? Math.floor(nd.ti / HERO_PER_TILE0) : nd.ti;
      const j = nd.level === HERO ? Math.floor(nd.tj / HERO_PER_TILE0) : nd.tj;
      const key = `${i}_${j}`;
      let e = this.regions.get(key);
      if (!e) {
        const region = regionOf(i, j);
        e = { region, state: 'waiting', seen: frame, done: new Set(), tiles: null };
        e.tiles = this.tilesOf(region);
        this.regions.set(key, e);
      }
      e.seen = frame;
    }
    let next = null;
    let nextD = Infinity;
    for (const [key, e] of this.regions) {
      if (frame - e.seen > UNLOAD_FRAMES) {
        this.drop(key, e);
        continue;
      }
      let ready = true;
      for (const [lv, i, j] of e.tiles) {
        store.pin(lv, i, j);
        if (!store.isReady(lv, i, j)) {
          store.want(lv, i, j, 0);
          ready = false;
        }
      }
      if (!ready || e.done.size === this.parts.length) {
        continue;
      }
      const cx = (e.region.x0 + e.region.x1) / 2;
      const cz = (e.region.z0 + e.region.z1) / 2;
      const d = Math.hypot(cx - eye.x, cz - eye.z);
      if (d < nextD) {
        nextD = d;
        next = e;
      }
    }
    this.lastLoadMs = 0;
    if (next) {
      this.loadOne(next);
    }
  }

  /* One part's load for one region: the frame's one heavy call. */
  loadOne(e) {
    const part = this.parts.find((p) => !e.done.has(p.name));
    const t0 = performance.now();
    part.load(e.region);
    this.lastLoadMs = performance.now() - t0;
    this.worstLoadMs = Math.max(this.worstLoadMs, this.lastLoadMs);
    e.done.add(part.name);
    e.state = e.done.size === this.parts.length ? 'loaded' : 'queued';
    this.loads += 1;
  }

  drop(key, e) {
    for (const p of this.parts) {
      if (e.done.has(p.name)) {
        p.unload(key);
      }
    }
    if (e.done.size) {
      this.unloads += 1;
    }
    this.regions.delete(key);
  }

  /* Load every region the selection already qualifies, all parts, with no
   * rationing: the loading screen, before the first frame. */
  async settle(eye, frame, onTick) {
    for (;;) {
      this.update(eye, frame);
      const left = [...this.regions.values()].filter((e) => e.done.size < this.parts.length);
      if (onTick) {
        onTick(left.length);
      }
      if (!left.length) {
        return;
      }
      if (!this.lastLoadMs) {
        /* Waiting on tiles. */
        this.terrain.store.commit();
        await new Promise((r) => setTimeout(r, 15));
      }
    }
  }

  stats() {
    let loaded = 0;
    for (const e of this.regions.values()) {
      loaded += e.state === 'loaded' ? 1 : 0;
    }
    return {
      regions: this.regions.size,
      loaded,
      loads: this.loads,
      unloads: this.unloads,
      lastLoadMs: this.lastLoadMs,
      worstLoadMs: this.worstLoadMs,
    };
  }

  dispose() {
    for (const [key, e] of [...this.regions]) {
      this.drop(key, e);
    }
  }
}
