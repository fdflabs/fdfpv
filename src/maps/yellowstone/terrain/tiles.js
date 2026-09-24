/*
 * tiles.js: the elevation tiles, fetched from the data's base URL, kept
 * under a byte ceiling and read by global sample index.
 *
 * A tile is 132 098 bytes of little endian Uint16 and the page is little
 * endian on every browser that runs WebGL2, so decoding is a view on the
 * fetched buffer and nothing more. That is why there is no worker: the
 * network stack already fetches off the main thread, and the one thing a
 * worker would take off it here is a constructor call. CLAUDE.md keeps the
 * shell on the main thread until there is a reason, and this is not one.
 *
 * A tile that arrives is not visible to anything until commit() is called
 * from the frame loop. The ground query and the chunk selection both read
 * `ready`, and moving a tile into it only between frames is what keeps
 * the physics steps of one frame on one ground.
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

import { HERO, TILE_BYTES, tilePath } from './frame.js';

/* A tile's key, a number: the selection asks about a few hundred tiles a
 * frame and a string key would be a few hundred allocations. i and j are
 * under 256 at every level (the hero level has 40 tiles a side). */
export function tileKey(level, i, j) {
  if (i < 0 || j < 0 || i > 255 || j > 255) {
    return -1;
  }
  return (level + 1) * 65536 + i * 256 + j;
}

function keyParts(key) {
  return { level: Math.floor(key / 65536) - 1, i: Math.floor(key / 256) % 256, j: key % 256 };
}

/*
 * The set of tiles the manifest says exist, as keys. Two shapes are read:
 * a `files` map keyed by path (the checksum list the contract asks for,
 * which is what the pipeline writes), or per level lists of [i, j] (what
 * synth-tiles.js writes as well). A manifest with neither is refused, because guessing would turn every hole in the data
 * into a stream of 404s and a coarse patch nobody can explain.
 */
export function manifestTiles(manifest) {
  const have = new Set();
  if (manifest && manifest.files && typeof manifest.files === 'object') {
    for (const path of Object.keys(manifest.files)) {
      const m = /^(hero|\d)\/(\d+)_(\d+)\.bin$/.exec(path);
      if (m) {
        have.add(tileKey(m[1] === 'hero' ? HERO : Number(m[1]), Number(m[2]), Number(m[3])));
      }
    }
  }
  const lists = [...(manifest && Array.isArray(manifest.levels) ? manifest.levels : [])];
  if (manifest && manifest.hero && Array.isArray(manifest.hero.tiles)) {
    lists.push({ level: HERO, tiles: manifest.hero.tiles });
  }
  for (const l of lists) {
    /* The pipeline's manifest gives a level's tile count here, not a
     * list; its `files` map above is what says which exist. */
    if (!Array.isArray(l.tiles)) {
      continue;
    }
    for (const t of l.tiles) {
      const [i, j] = Array.isArray(t) ? t : String(t).split('_').map(Number);
      have.add(tileKey(l.level, i, j));
    }
  }
  if (!have.size) {
    throw new Error('yellowstone: the manifest lists no tiles');
  }
  return have;
}

export class TileStore {
  /*
   * `base` ends in a slash. `ceiling` is the byte budget for tiles that
   * nothing pins; a pinned tile is never evicted, so the resident total
   * can sit above the ceiling by exactly the pinned set, and stats() says
   * by how much.
   */
  constructor({ base, manifest, ceiling, concurrency = 6, fetchImpl }) {
    this.base = base;
    this.have = manifestTiles(manifest);
    this.ceiling = ceiling;
    this.concurrency = concurrency;
    this.fetch = fetchImpl || ((url) => fetch(url));
    /* key -> { level, i, j, data: Uint16Array, used } */
    this.ready = new Map();
    /* Arrived and waiting for commit(). */
    this.arrived = [];
    /* key -> priority, lower first. */
    this.wanted = new Map();
    this.inflight = new Set();
    this.failed = new Map();
    this.pinned = new Set();
    this.bytes = 0;
    this.fetched = 0;
    this.evicted = 0;
    this.clock = 0;
    this.disposed = false;
  }

  exists(level, i, j) {
    return this.have.has(tileKey(level, i, j));
  }

  get(level, i, j) {
    const t = this.ready.get(tileKey(level, i, j));
    if (t) {
      t.used = this.clock;
    }
    return t ? t.data : null;
  }

  isReady(level, i, j) {
    return this.ready.has(tileKey(level, i, j));
  }

  /* Ask for a tile. Lower priority numbers are fetched first; asking again
   * with a lower number raises it. A tile the manifest does not list is
   * never asked for. */
  want(level, i, j, priority) {
    const key = tileKey(level, i, j);
    if (!this.have.has(key) || this.ready.has(key) || this.inflight.has(key) || this.failed.has(key)) {
      return;
    }
    const was = this.wanted.get(key);
    if (was === undefined || priority < was) {
      this.wanted.set(key, priority);
    }
  }

  pin(level, i, j) {
    this.pinned.add(tileKey(level, i, j));
  }

  /* Start fetches up to the concurrency, best priority first. */
  pump() {
    if (this.disposed || this.inflight.size >= this.concurrency || !this.wanted.size) {
      return;
    }
    const order = [...this.wanted.entries()].sort((a, b) => a[1] - b[1]);
    for (const [key] of order) {
      if (this.inflight.size >= this.concurrency) {
        break;
      }
      this.wanted.delete(key);
      this.load(key);
    }
  }

  load(key) {
    const { level, i, j } = keyParts(key);
    this.inflight.add(key);
    const url = `${this.base}${tilePath(level, i, j)}`;
    this.fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (buf.byteLength !== TILE_BYTES) {
          throw new Error(`${buf.byteLength} bytes, want ${TILE_BYTES}`);
        }
        this.inflight.delete(key);
        if (this.disposed) {
          return;
        }
        this.arrived.push({ key, level, i, j, data: new Uint16Array(buf) });
        this.fetched += 1;
        this.pump();
      })
      .catch((e) => {
        this.inflight.delete(key);
        /* Loud, once per tile, and never retried in a loop: the region
         * stays on its coarser level, which is drawn and is ground. */
        this.failed.set(key, String(e.message || e));
        if (!this.disposed) {
          console.error(`yellowstone: tile ${url} failed: ${e.message || e}`);
          this.pump();
        }
      });
  }

  /* Move arrived tiles into `ready`, then evict down to the ceiling. Call
   * once a frame, before the ground or the selection is read. Returns the
   * keys that became ready. */
  commit() {
    this.clock += 1;
    const came = [];
    for (const t of this.arrived) {
      t.used = this.clock;
      this.ready.set(t.key, t);
      this.bytes += t.data.byteLength;
      came.push(t);
    }
    this.arrived.length = 0;
    if (this.bytes > this.ceiling) {
      this.evict();
    }
    this.pump();
    return came;
  }

  evict() {
    const loose = [];
    for (const [key, t] of this.ready) {
      if (!this.pinned.has(key)) {
        loose.push(t);
      }
    }
    loose.sort((a, b) => a.used - b.used);
    for (const t of loose) {
      if (this.bytes <= this.ceiling) {
        break;
      }
      this.ready.delete(t.key);
      this.bytes -= t.data.byteLength;
      this.evicted += 1;
    }
  }

  /* Promise that settles when every listed tile is ready or failed. Used
   * only while loading, before the first frame. */
  async settle(keys, onTick) {
    for (;;) {
      this.commit();
      const left = keys.filter((k) => !this.ready.has(k) && !this.failed.has(k));
      if (onTick) {
        onTick(keys.length - left.length, keys.length);
      }
      if (!left.length) {
        return;
      }
      await new Promise((r) => setTimeout(r, 15));
    }
  }

  stats() {
    let pinnedBytes = 0;
    for (const key of this.pinned) {
      const t = this.ready.get(key);
      if (t) {
        pinnedBytes += t.data.byteLength;
      }
    }
    return {
      tiles: this.ready.size,
      bytes: this.bytes,
      pinnedBytes,
      ceiling: this.ceiling,
      inflight: this.inflight.size,
      queued: this.wanted.size,
      fetched: this.fetched,
      evicted: this.evicted,
      failed: this.failed.size,
    };
  }

  dispose() {
    this.disposed = true;
    this.ready.clear();
    this.arrived.length = 0;
    this.wanted.clear();
    this.bytes = 0;
  }
}
