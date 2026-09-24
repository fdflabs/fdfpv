/*
 * engine.js: the streaming, levelled terrain for the 100 km square.
 *
 * CHUNKED QUADTREE LOD, and why not a geometry clipmap. A clipmap draws a
 * few fixed rings of grid that move with the camera and read heights from
 * a texture in the vertex shader. It is the better answer for a terrain
 * with no ground contact, and the wrong one here twice over: the drawn
 * triangles move with the camera, so "the ground is what is drawn" would
 * change every time the camera snapped; and it needs a custom vertex
 * shader, which the cel material does not take without changing
 * src/render/celmat.js. A quadtree of plain meshes is stock three.js: one
 * BufferGeometry per node, frustum culled for free, drawn with the same
 * cel material every other map uses, and a node's triangles are its data
 * level's own grid, which the ground query reads back exactly.
 *
 * THE TREE. A node is 64 cells of its level on a side (chunks.js). Level 5
 * nodes are the roots, four of them over the extent. A node at level L >= 1
 * splits into the four level L - 1 nodes under it, all read from one level
 * L - 1 tile. A level 0 node splits into the nine hero nodes under it
 * (30 m to 10 m is a factor of three, not two), where the hero set has all
 * of their tiles. A node is split when a focus point is closer to its box
 * than SPLIT times its children's side doubled (its own side, for the
 * steps that halve), and only once its children's data is loaded
 * and their meshes are built; until then the node itself is drawn. So
 * what is drawn is never a hole: at worst it is a coarser level.
 *
 * THE FOCUS POINTS are the camera and the craft. The craft is one because
 * the ground under it has to be the finest level whatever the camera does
 * (a line of sight pilot stands half a kilometre off), and the camera is
 * one because that is what the picture is for.
 *
 * THE GROUND is height(x, z): the leaf this frame's selection draws over
 * (x, z), read on its own two triangles, split on the diagonal the mesh
 * uses. The node holding the craft is at distance nought from a focus, so
 * it is always split as far as the loaded data allows, and the ground
 * under the craft is always the finest level that is drawn there. The
 * selection only changes in update(), between frames, so every physics
 * step of a frame reads one ground.
 *
 * STREAMING. The finest tiles in a disc round the craft are asked for
 * ahead of the selection needing them (quality.prefetch), so a craft at
 * 30 m/s crosses a tile edge with the next tile resident for minutes. Mesh
 * builds are rationed per frame by time (quality.buildMs) and sliced by
 * rows, a build carrying over to the next frame; tiles are fetched six at a
 * time, nearest first; tiles nothing pins are evicted least recently used
 * over a byte ceiling, and built meshes nothing draws over a count.
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

import * as THREE from 'three';
import {
  HALF, EXTENT, HERO, COARSEST, TILE_CELLS, TILE_SAMPLES, cellOf, tileSizeOf, decode,
} from './frame.js';
import { TileStore, tileKey } from './tiles.js';
import { CHUNK, chunkJob, chunkTriangles, disposeChunkIndices, recycleChunk } from './chunks.js';
import { buildApron } from './apron.js';

const NODE_PER_TILE = TILE_CELLS / CHUNK;
/* Frames between prunes of the node map, and the frames a subtree must
 * have gone unvisited to be forgotten. */
const PRUNE_EVERY = 120;
const PRUNE_AGE = 600;
/* Chunks at this level and coarser are left out of the ink prepass. */
const INK_BELOW = 2;
/* Meshes freed below the cap in one trim. */
const TRIM_SLACK = 24;

export function nodeSize(level) {
  return CHUNK * cellOf(level);
}

function nodesPerAxis(level) {
  return Math.ceil(EXTENT / nodeSize(level));
}

function finer(level) {
  return level === 0 ? HERO : level - 1;
}

/* Children per axis: the hero level is a third of level 0, every other
 * step a half. */
function fanOf(level) {
  return level === 0 ? 3 : 2;
}

class Node {
  constructor(level, i, j) {
    this.level = level;
    this.i = i;
    this.j = j;
    this.key = `${level}:${i}:${j}`;
    this.cell = cellOf(level);
    this.size = nodeSize(level);
    this.x0 = -HALF + i * this.size;
    this.z0 = -HALF + j * this.size;
    /* Cells wholly inside the extent: 64, or fewer along the far edges. */
    this.nx = Math.min(CHUNK, Math.floor((HALF - this.x0) / this.cell + 1e-9));
    this.nz = Math.min(CHUNK, Math.floor((HALF - this.z0) / this.cell + 1e-9));
    this.ti = Math.floor(i / NODE_PER_TILE);
    this.tj = Math.floor(j / NODE_PER_TILE);
    this.ox = (i % NODE_PER_TILE) * CHUNK;
    this.oz = (j % NODE_PER_TILE) * CHUNK;
    this.children = null;
    this.split = false;
    this.mesh = null;
    this.used = 0;
    this.minY = 0;
    this.maxY = 0;
    this.bottom = 0;
    this.bytes = 0;
    this.stale = false;
  }
}

export class Terrain {
  /*
   * opts: { base, manifest, material, scene, cover (landcover.js, or
   * null), quality: { split, buildMs, tileCeiling, meshCap, prefetch,
   * prefetchHero } }. Call load() once, then update() every frame.
   */
  constructor(opts) {
    this.q = opts.quality;
    this.material = opts.material;
    this.cover = opts.cover || null;
    this.store = new TileStore({
      base: opts.base,
      manifest: opts.manifest,
      ceiling: this.q.tileCeiling,
      fetchImpl: opts.fetchImpl,
    });
    this.group = new THREE.Group();
    this.group.name = 'yellowstone-terrain';
    opts.scene.add(this.group);
    this.nodes = new Map();
    this.roots = [];
    const n = nodesPerAxis(COARSEST);
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        this.roots.push(this.node(COARSEST, i, j));
      }
    }
    this.leaves = [];
    this.drawn = new Set();
    /* Every node that has a mesh, drawn or not. */
    this.built = new Set();
    this.buildQueue = new Map();
    /* The chunk build in hand, carried across frames: { nd, job, ms }. */
    this.job = null;
    this.focus = [new THREE.Vector3(), new THREE.Vector3()];
    this.frame = 0;
    this.meshCount = 0;
    this.gpuBytes = 0;
    this.lastWorkMs = 0;
    this.lastSelectMs = 0;
    /* commit, select, build, trim: milliseconds, the last frame. */
    this.lastPhases = [0, 0, 0, 0];
    /* Inside build: starting jobs, stepping rows, installing meshes. */
    this.lastBuildParts = [0, 0, 0];
    this.worstWorkMs = 0;
    this.buildAvgMs = 1;
    this.buildMaxMs = 0;
    this.builtTotal = 0;
    this.disposedMeshes = 0;
    this.apron = null;
  }

  node(level, i, j) {
    const key = `${level}:${i}:${j}`;
    let nd = this.nodes.get(key);
    if (!nd) {
      nd = new Node(level, i, j);
      this.nodes.set(key, nd);
    }
    return nd;
  }

  childrenOf(nd) {
    if (nd.level === HERO) {
      return null;
    }
    if (nd.children) {
      return nd.children;
    }
    const fan = fanOf(nd.level);
    const lv = finer(nd.level);
    const n = nodesPerAxis(lv);
    const out = [];
    for (let b = 0; b < fan; b += 1) {
      for (let a = 0; a < fan; a += 1) {
        const ci = nd.i * fan + a;
        const cj = nd.j * fan + b;
        if (ci < n && cj < n) {
          const c = this.node(lv, ci, cj);
          /* Until it is built a child's box is its parent's. */
          c.minY = nd.minY;
          c.maxY = nd.maxY;
          out.push(c);
        }
      }
    }
    nd.children = out;
    return out;
  }

  /* Whether every tile a node's children read is listed; a node whose
   * children are not all in the data never splits. */
  childTilesListed(nd) {
    for (const c of this.childrenOf(nd)) {
      if (!this.store.exists(c.level, c.ti, c.tj)) {
        return false;
      }
    }
    return true;
  }

  /* The level's height at a global sample index, from whichever loaded
   * tile holds it, or NaN. A sample on a tile edge is in both tiles. */
  sampleGlobal(level, gx, gz) {
    let ti = Math.floor(gx / TILE_CELLS);
    let tj = Math.floor(gz / TILE_CELLS);
    let lx = gx - ti * TILE_CELLS;
    let lz = gz - tj * TILE_CELLS;
    let data = this.store.get(level, ti, tj);
    if (!data && lx === 0 && ti > 0) {
      ti -= 1;
      lx = TILE_CELLS;
      data = this.store.get(level, ti, tj);
    }
    if (!data && lz === 0 && tj > 0) {
      tj -= 1;
      lz = TILE_CELLS;
      data = this.store.get(level, ti, tj);
    }
    return data ? decode(data[lz * TILE_SAMPLES + lx]) : NaN;
  }

  /* Start building one node's mesh from its tile, which must be ready. */
  startBuild(nd) {
    const data = this.store.get(nd.level, nd.ti, nd.tj);
    const gx0 = nd.ti * TILE_CELLS + nd.ox;
    const gz0 = nd.tj * TILE_CELLS + nd.oz;
    let stale = false;
    const sample = (q, r) => {
      const lx = nd.ox + q;
      const lz = nd.oz + r;
      if (lx >= 0 && lx <= TILE_CELLS && lz >= 0 && lz <= TILE_CELLS) {
        return decode(data[lz * TILE_SAMPLES + lx]);
      }
      /* One sample past the tile, for a normal: the neighbour tile if it
       * is loaded, else the edge itself, and the chunk is rebuilt when the
       * neighbour arrives so the shading has no seam along a tile edge. */
      const v = this.sampleGlobal(nd.level, gx0 + q, gz0 + r);
      if (Number.isNaN(v)) {
        /* Past the data's edge there is nothing to wait for. */
        stale = stale || this.store.exists(nd.level, Math.floor((gx0 + q) / TILE_CELLS), Math.floor((gz0 + r) / TILE_CELLS));
        return decode(data[Math.max(0, Math.min(TILE_CELLS, lz)) * TILE_SAMPLES + Math.max(0, Math.min(TILE_CELLS, lx))]);
      }
      return v;
    };
    const rim = nd.x0 <= -HALF || nd.z0 <= -HALF || nd.nx < CHUNK || nd.nz < CHUNK
      || nd.x0 + nd.size >= HALF || nd.z0 + nd.size >= HALF;
    const t0 = performance.now();
    const job = chunkJob({
      nx: nd.nx, nz: nd.nz, cell: nd.cell, x0: nd.x0, z0: nd.z0, sample, rim, cover: this.cover,
    });
    return { nd, job, ms: performance.now() - t0, stale: () => stale };
  }

  /* Put a finished chunk in the scene. */
  install(nd, built, stale) {
    /* A rebuild of a drawn chunk swaps in place, or the frame between
     * this build and the next selection would have a hole in it. */
    const wasDrawn = this.drawn.has(nd);
    if (nd.mesh) {
      this.freeMesh(nd);
    }
    const mesh = new THREE.Mesh(built.geo, this.material);
    mesh.position.set(nd.x0, 0, nd.z0);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = true;
    /* Only the near levels are inked. The outline prepass draws every
     * layer 0 mesh a second time, and at 120 m cells and coarser a chunk
     * is kilometres off, where an ink line is a pixel of noise the fog is
     * already taking; on layer 1 alone it is drawn in the colour pass only,
     * which halves what the far ground costs. */
    if (nd.level >= INK_BELOW) {
      mesh.layers.set(1);
    }
    mesh.visible = wasDrawn;
    if (wasDrawn) {
      this.drawn.add(nd);
    }
    mesh.name = `ys-${nd.key}`;
    mesh.userData.node = nd;
    this.group.add(mesh);
    nd.mesh = mesh;
    this.built.add(nd);
    nd.minY = built.minY;
    nd.maxY = built.maxY;
    nd.bottom = built.bottom;
    nd.bytes = built.bytes;
    nd.stale = stale;
    nd.used = this.frame;
    this.meshCount += 1;
    this.gpuBytes += built.bytes;
    this.builtTotal += 1;
  }

  freeMesh(nd) {
    const geo = nd.mesh.geometry;
    /* The index is shared by every chunk of this shape (chunks.js), and
     * disposing a geometry deletes its index's GL buffer out from under
     * all the others. Detached first, it is left alone. */
    geo.setIndex(null);
    geo.dispose();
    recycleChunk(geo);
    this.group.remove(nd.mesh);
    nd.mesh = null;
    this.built.delete(nd);
    this.meshCount -= 1;
    this.gpuBytes -= nd.bytes;
    this.disposedMeshes += 1;
    this.drawn.delete(nd);
  }

  /* The nearest distance from any focus to a node's box. The box's height
   * is the node's own once built, and the parent's until then. */
  distance(nd) {
    let best = Infinity;
    const x1 = nd.x0 + nd.nx * nd.cell;
    const z1 = nd.z0 + nd.nz * nd.cell;
    for (const f of this.focus) {
      const dx = Math.max(nd.x0 - f.x, 0, f.x - x1);
      const dz = Math.max(nd.z0 - f.z, 0, f.z - z1);
      const dy = Math.max(nd.minY - f.y, 0, f.y - nd.maxY);
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return best;
  }

  wantBuild(nd, priority) {
    const was = this.buildQueue.get(nd);
    if (was === undefined || priority < was) {
      this.buildQueue.set(nd, priority);
    }
  }

  /* Walk the tree from the roots; a node is a leaf unless it wants to
   * split and can. */
  visit(nd, out) {
    nd.used = this.frame;
    this.store.pin(nd.level, nd.ti, nd.tj);
    const d = this.distance(nd);
    /* SPLIT counts in the children's sides, two of them to one of the
     * parent's, so the step to hero, whose children are a third of the
     * parent, hands over at the same angle per cell as every other step. */
    const reach = (this.q.split * nd.size * 2 / fanOf(nd.level)) * (nd.split ? 1.15 : 1);
    const kids = d < reach ? this.childrenOf(nd) : null;
    if (kids && kids.length && this.childTilesListed(nd)) {
      let ready = true;
      for (const c of kids) {
        if (!this.store.isReady(c.level, c.ti, c.tj)) {
          this.store.want(c.level, c.ti, c.tj, d);
          ready = false;
        } else if (!c.mesh) {
          this.wantBuild(c, d);
          ready = false;
        }
      }
      if (ready) {
        nd.split = true;
        for (const c of kids) {
          this.visit(c, out);
        }
        return;
      }
    }
    nd.split = false;
    if (nd.stale && this.neighboursLoaded(nd)) {
      this.wantBuild(nd, d);
    }
    out.push(nd);
  }

  /* Whether the tiles round a stale node's tile have come in since it was
   * built, so a rebuild would change its edge normals. */
  neighboursLoaded(nd) {
    for (let b = -1; b <= 1; b += 1) {
      for (let a = -1; a <= 1; a += 1) {
        if ((a || b) && this.store.exists(nd.level, nd.ti + a, nd.tj + b)
          && !this.store.isReady(nd.level, nd.ti + a, nd.tj + b)) {
          return false;
        }
      }
    }
    return true;
  }

  /* Ask for the finest tiles in a disc round the craft before the
   * selection needs them, and pin them. */
  prefetch(p) {
    for (const [level, radius] of [[0, this.q.prefetch], [HERO, this.q.prefetchHero]]) {
      const size = tileSizeOf(level);
      const i0 = Math.floor((p.x - radius + HALF) / size);
      const i1 = Math.floor((p.x + radius + HALF) / size);
      const j0 = Math.floor((p.z - radius + HALF) / size);
      const j1 = Math.floor((p.z + radius + HALF) / size);
      for (let j = j0; j <= j1; j += 1) {
        for (let i = i0; i <= i1; i += 1) {
          if (!this.store.exists(level, i, j)) {
            continue;
          }
          const cx = -HALF + (i + 0.5) * size;
          const cz = -HALF + (j + 0.5) * size;
          const d = Math.max(0, Math.hypot(cx - p.x, cz - p.z) - size * 0.7);
          if (d > radius) {
            continue;
          }
          this.store.pin(level, i, j);
          this.store.want(level, i, j, d);
        }
      }
    }
  }

  /* Select this frame's leaves and show exactly them. */
  select() {
    this.store.pinned.clear();
    this.prefetch(this.focus[0]);
    const leaves = [];
    for (const r of this.roots) {
      this.visit(r, leaves);
    }
    for (const nd of this.drawn) {
      nd.mesh.visible = false;
    }
    this.drawn.clear();
    for (const nd of leaves) {
      /* A root is built in load(); every other leaf was only split into
       * once its mesh existed. */
      nd.mesh.visible = true;
      this.drawn.add(nd);
    }
    this.leaves = leaves;
  }

  /* Build queued meshes, nearest first, until the frame's budget is
   * spent. `budgetMs` Infinity builds all of them. */
  buildSome(budgetMs) {
    if (!this.job && !this.buildQueue.size) {
      return 0;
    }
    const start = performance.now();
    const deadline = start + budgetMs;
    const order = [...this.buildQueue.entries()].sort((a, b) => a[1] - b[1]);
    let next = 0;
    let built = 0;
    const parts = [0, 0, 0];
    /* The job in hand is finished first, then the nearest queued node is
     * started while the frame has time; a job the deadline cuts off
     * carries over to the next frame, rows done. */
    for (;;) {
      if (!this.job) {
        if (next >= order.length || performance.now() >= deadline) {
          break;
        }
        const nd = order[next][0];
        next += 1;
        this.buildQueue.delete(nd);
        /* Queued again while its build was in hand, or built since. */
        if (!this.store.isReady(nd.level, nd.ti, nd.tj) || (nd.mesh && !nd.stale)) {
          continue;
        }
        const ts = performance.now();
        this.job = this.startBuild(nd);
        parts[0] += performance.now() - ts;
      }
      const t0 = performance.now();
      const done = this.job.job.step(deadline);
      this.job.ms += performance.now() - t0;
      parts[1] += performance.now() - t0;
      if (!done) {
        break;
      }
      const ti = performance.now();
      this.install(this.job.nd, done, this.job.stale());
      parts[2] += performance.now() - ti;
      this.buildAvgMs += (this.job.ms - this.buildAvgMs) * 0.1;
      this.buildMaxMs = Math.max(this.buildMaxMs, this.job.ms);
      this.job = null;
      built += 1;
    }
    this.lastBuildParts = parts;
    return built;
  }

  /* Free the least recently drawn meshes past the cap. */
  trimMeshes() {
    if (this.frame % PRUNE_EVERY === 0) {
      this.pruneNodes();
    }
    if (this.meshCount <= this.q.meshCap) {
      return;
    }
    /* Down to a little under the cap, so the sort runs once every few
     * dozen builds rather than on every one. */
    const idle = [];
    for (const nd of this.built) {
      if (!this.drawn.has(nd) && nd.level !== COARSEST) {
        idle.push(nd);
      }
    }
    idle.sort((a, b) => a.used - b.used);
    for (const nd of idle) {
      if (this.meshCount <= this.q.meshCap - TRIM_SLACK) {
        break;
      }
      this.freeMesh(nd);
    }
  }

  /* Forget subtrees nothing has visited for a while and nothing has a
   * mesh in, or the node map grows with every kilometre flown. A node's
   * children are dropped together, so a parent never holds a child the
   * map has forgotten. */
  pruneNodes() {
    const old = this.frame - PRUNE_AGE;
    const idle = (nd) => !nd.mesh && !nd.split && nd.used < old && (!this.job || this.job.nd !== nd)
      && (!nd.children || nd.children.every(idle));
    const forget = (nd) => {
      if (nd.children) {
        nd.children.forEach(forget);
      }
      this.nodes.delete(nd.key);
      this.buildQueue.delete(nd);
    };
    for (const nd of this.nodes.values()) {
      if (nd.children && !nd.split && nd.children.every(idle)) {
        nd.children.forEach(forget);
        nd.children = null;
      }
    }
  }

  /*
   * Once a frame, from the map's updateShadowFocus: commit arrived tiles,
   * select, build within budget, trim. `craft` is the shell's focus (the
   * craft in flight, the title quad on the title), `eye` the camera.
   */
  update(craft, eye) {
    const start = performance.now();
    this.frame += 1;
    this.focus[0].copy(craft);
    this.focus[1].copy(eye);
    this.store.commit();
    const t1 = performance.now();
    this.select();
    const t2 = performance.now();
    this.buildSome(this.q.buildMs);
    const t3 = performance.now();
    this.trimMeshes();
    const t4 = performance.now();
    this.lastWorkMs = t4 - start;
    this.lastPhases = [t1 - start, t2 - t1, t3 - t2, t4 - t3, ...(t3 - t2 > 0.05 ? this.lastBuildParts : [0, 0, 0])];
    this.lastSelectMs = t2 - t1;
    this.worstWorkMs = Math.max(this.worstWorkMs, this.lastWorkMs);
  }

  /*
   * Before the first frame: the coarsest level, the finest round the
   * spawn, and the whole selection from the spawn's point of view, built
   * with no budget, so the first frame the pilot sees is complete and the
   * ground under the craft is the finest level. `progress(f)` in [0, 1].
   */
  async load(spawn, eye, progress) {
    const coarse = [];
    const n = Math.ceil(EXTENT / tileSizeOf(COARSEST));
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        if (this.store.exists(COARSEST, i, j)) {
          coarse.push(tileKey(COARSEST, i, j));
          this.store.want(COARSEST, i, j, 0);
        }
      }
    }
    await this.store.settle(coarse, (got, all) => progress(0.2 * got / all));
    for (const r of this.roots) {
      if (!this.store.isReady(r.level, r.ti, r.tj)) {
        throw new Error(`yellowstone: the coarsest tile ${r.level}/${r.ti}_${r.tj} did not load`);
      }
      const j = this.startBuild(r);
      this.install(r, j.job.step(Infinity), j.stale());
    }
    this.apron = buildApron((x, z) => this.coarseAt(x, z), this.material, this.cover);
    this.group.add(this.apron.mesh);
    /* Walk the selection to a fixed point: each pass asks for what the
     * last one could not split into yet. */
    this.focus[0].copy(spawn);
    this.focus[1].copy(eye);
    for (;;) {
      this.store.commit();
      this.store.pinned.clear();
      this.prefetch(this.focus[0]);
      const leaves = [];
      for (const r of this.roots) {
        this.visit(r, leaves);
      }
      const built = this.buildSome(Infinity);
      const pending = this.store.wanted.size + this.store.inflight.size + this.store.arrived.length;
      /* The bar moves with the tiles in hand against the tiles asked for,
       * which is the only measure of what is left that exists. */
      const got = this.store.fetched;
      progress(0.2 + 0.8 * (got / (got + pending || 1)));
      /* Settled when nothing is on the wire and the last pass built
       * nothing, so a pass could not split any further. */
      if (!pending && !built) {
        break;
      }
      await new Promise((r) => setTimeout(r, pending ? 15 : 0));
    }
    this.select();
    progress(1);
  }

  /* The coarsest level's height, for the apron's border. */
  coarseAt(x, z) {
    const cell = cellOf(COARSEST);
    return this.readGlobal(COARSEST, (x + HALF) / cell, (z + HALF) / cell);
  }

  /* The leaf this frame draws over (x, z), or null outside the drawn
   * cells. */
  leafAt(x, z) {
    if (x < -HALF || z < -HALF || x > HALF || z > HALF) {
      return null;
    }
    const size = nodeSize(COARSEST);
    const n = nodesPerAxis(COARSEST);
    const ri = Math.min(n - 1, Math.floor((x + HALF) / size));
    const rj = Math.min(n - 1, Math.floor((z + HALF) / size));
    let nd = this.roots[rj * n + ri];
    while (nd.split) {
      const fan = fanOf(nd.level);
      const sub = nd.size / fan;
      const a = Math.min(fan - 1, Math.floor((x - nd.x0) / sub));
      const b = Math.min(fan - 1, Math.floor((z - nd.z0) / sub));
      nd = this.node(finer(nd.level), nd.i * fan + a, nd.j * fan + b);
    }
    if (x > nd.x0 + nd.nx * nd.cell || z > nd.z0 + nd.nz * nd.cell) {
      return null;
    }
    return nd;
  }

  /* A node's height at (x, z) on the triangles its chunk draws, clamped
   * into its own cells. */
  readNode(nd, x, z) {
    const level = nd.level;
    const cell = nd.cell;
    const gx = (x + HALF) / cell;
    const gz = (z + HALF) / cell;
    const base = nd.ti * TILE_CELLS;
    const basez = nd.tj * TILE_CELLS;
    const lo = nd.ox;
    const loz = nd.oz;
    let ci = Math.floor(gx) - base;
    let cj = Math.floor(gz) - basez;
    ci = Math.max(lo, Math.min(lo + nd.nx - 1, ci));
    cj = Math.max(loz, Math.min(loz + nd.nz - 1, cj));
    const fu = gx - base - ci;
    const fv = gz - basez - cj;
    const data = this.store.get(level, nd.ti, nd.tj);
    return tri(data, ci, cj, fu, fv);
  }

  /* The same read anywhere on a level by global sample coordinates,
   * clamped into the tiles that exist: the apron's border only. */
  readGlobal(level, gx, gz) {
    const tiles = Math.ceil(EXTENT / tileSizeOf(level));
    const max = tiles * TILE_CELLS - 1;
    const ci = Math.max(0, Math.min(max, Math.floor(gx)));
    const cj = Math.max(0, Math.min(max, Math.floor(gz)));
    const ti = Math.floor(ci / TILE_CELLS);
    const tj = Math.floor(cj / TILE_CELLS);
    const data = this.store.get(level, ti, tj);
    const fu = Math.max(0, Math.min(1, gx - ci));
    const fv = Math.max(0, Math.min(1, gz - cj));
    return tri(data, ci - ti * TILE_CELLS, cj - tj * TILE_CELLS, fu, fv);
  }

  /*
   * THE GROUND: the height of what is drawn at (x, z) this frame. Inside
   * the extent that is the drawn leaf's triangles; outside it, and on the
   * few metres along the far edges past a level's last whole cell, the
   * apron's.
   */
  height(x, z) {
    const nd = this.leafAt(x, z);
    if (nd) {
      return this.readNode(nd, x, z);
    }
    return this.apron.height(x, z);
  }

  /*
   * The finest loaded data at (x, z), whatever is drawn there: hero, then
   * level 0, then up. For placing things; see anchors.js for why it can
   * differ from height() far from the camera.
   */
  finestAt(x, z) {
    if (x < -HALF || z < -HALF || x > HALF || z > HALF) {
      return this.apron.height(x, z);
    }
    for (let level = HERO; level <= COARSEST; level += 1) {
      const cell = cellOf(level);
      const gx = (x + HALF) / cell;
      const gz = (z + HALF) / cell;
      const ci = Math.floor(gx);
      const cj = Math.floor(gz);
      const ti = Math.floor(Math.min(ci, Math.floor(EXTENT / cell) - 1) / TILE_CELLS);
      const tj = Math.floor(Math.min(cj, Math.floor(EXTENT / cell) - 1) / TILE_CELLS);
      const data = this.store.get(level, ti, tj);
      if (!data) {
        continue;
      }
      const lx = Math.min(TILE_CELLS - 1, ci - ti * TILE_CELLS);
      const lz = Math.min(TILE_CELLS - 1, cj - tj * TILE_CELLS);
      return tri(data, lx, lz, Math.min(1, gx - ti * TILE_CELLS - lx), Math.min(1, gz - tj * TILE_CELLS - lz));
    }
    return this.apron.height(x, z);
  }

  /* Whether the finest data the files hold at (x, z) is loaded. */
  finestLoaded(x, z) {
    for (const level of [HERO, 0]) {
      const size = tileSizeOf(level);
      const i = Math.floor((x + HALF) / size);
      const j = Math.floor((z + HALF) / size);
      if (this.store.exists(level, i, j)) {
        return this.store.isReady(level, i, j);
      }
    }
    return true;
  }

  stats() {
    let tris = 0;
    const perLevel = {};
    for (const nd of this.leaves) {
      tris += chunkTriangles(nd.nx, nd.nz);
      perLevel[nd.level] = (perLevel[nd.level] || 0) + 1;
    }
    return {
      leaves: this.leaves.length,
      leafTriangles: tris,
      perLevel,
      meshes: this.meshCount,
      gpuBytes: this.gpuBytes,
      apronTriangles: this.apron ? this.apron.triangles : 0,
      queuedBuilds: this.buildQueue.size,
      builtTotal: this.builtTotal,
      disposedMeshes: this.disposedMeshes,
      lastWorkMs: this.lastWorkMs,
      lastSelectMs: this.lastSelectMs,
      worstWorkMs: this.worstWorkMs,
      buildAvgMs: this.buildAvgMs,
      buildMaxMs: this.buildMaxMs,
      tiles: this.store.stats(),
    };
  }

  dispose() {
    for (const nd of this.nodes.values()) {
      if (nd.mesh) {
        this.freeMesh(nd);
      }
    }
    if (this.apron) {
      this.apron.mesh.geometry.dispose();
      this.group.remove(this.apron.mesh);
    }
    this.group.removeFromParent();
    this.store.dispose();
    this.nodes.clear();
    this.buildQueue.clear();
    this.job = null;
    disposeChunkIndices();
  }
}

/* Two triangles of cell (ci, cj) of a tile, split on the diagonal from
 * (ci, cj + 1) to (ci + 1, cj), the same the chunk index draws. */
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

