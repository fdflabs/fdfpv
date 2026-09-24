/*
 * anchors.js: things stood on the ground that come and go with it.
 *
 * The placement API the other Yellowstone parts build on. A feature is
 * registered once, at its world (x, z), with a function that builds it;
 * the engine builds it when the camera comes within its range and the
 * finest ground under it is loaded, and takes it down again when the
 * camera leaves, so ten thousand of them cost what the few hundred near
 * the camera cost. Builds are rationed per frame by time, like the
 * terrain's own.
 *
 * WHICH GROUND. build(y, groundAt) is handed the finest loaded height at
 * the anchor (hero where there is hero data, else level 0), which is what
 * the terrain draws near the camera. Far from the camera the terrain is
 * drawn coarser, and a coarse level can stand a metre or two off the
 * finest one, so something flat on the ground (a pool, a terrace) wants a
 * range inside the distance the finest level is drawn to: about
 * SPLIT * 1920 m for level 0 and SPLIT * 640 m for hero, see engine.js.
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
import { HALF } from './frame.js';

/* Anchors are bucketed on the level 0 chunk grid so a frame only looks at
 * the buckets near the camera. */
const REGION = 1920;
/* Built past its range by this factor before it is taken down, so a
 * camera hovering at the edge does not build and free it every frame. */
const HYSTERESIS = 1.1;

function regionOf(v) {
  return Math.floor((v + HALF) / REGION);
}

/* The default unload: out of the scene, and every geometry under it
 * freed. Materials and textures are usually shared between features, so
 * they are the caller's to free, through `unload`, if they are not. */
function dropGeometries(obj) {
  obj.traverse((o) => {
    if (o.geometry) {
      o.geometry.dispose();
    }
  });
}

export class Anchors {
  constructor(terrain, scene, { buildMs }) {
    this.terrain = terrain;
    this.buildMs = buildMs;
    this.group = new THREE.Group();
    this.group.name = 'yellowstone-anchors';
    scene.add(this.group);
    this.regions = new Map();
    this.live = new Set();
    this.maxRange = 0;
    this.count = 0;
    this.lastMs = 0;
    this.worstBuildMs = 0;
  }

  /*
   * Register a feature. `build(y, groundAt)` returns an Object3D placed in
   * world coordinates (or null for nothing); `unload(obj)` frees what the
   * default does not. `range` is metres from the camera. Returns a handle
   * with remove() and the current object, if built.
   */
  add({ x, z, range = 2500, build, unload = dropGeometries }) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || typeof build !== 'function') {
      throw new Error('anchors.add: needs finite x and z and a build function');
    }
    const a = { x, z, range, build, unload, object: null, removed: false };
    const key = `${regionOf(x)}_${regionOf(z)}`;
    let list = this.regions.get(key);
    if (!list) {
      list = [];
      this.regions.set(key, list);
    }
    list.push(a);
    this.maxRange = Math.max(this.maxRange, range);
    this.count += 1;
    const self = this;
    return {
      get object() { return a.object; },
      remove() {
        self.take(a);
        a.removed = true;
        const i = list.indexOf(a);
        if (i >= 0) {
          list.splice(i, 1);
          self.count -= 1;
        }
      },
    };
  }

  take(a) {
    if (!a.object) {
      return;
    }
    this.group.remove(a.object);
    a.unload(a.object);
    a.object = null;
    this.live.delete(a);
  }

  /* Once a frame, after the terrain's update. */
  update(eye) {
    const start = performance.now();
    for (const a of this.live) {
      if (Math.hypot(a.x - eye.x, a.z - eye.z) > a.range * HYSTERESIS) {
        this.take(a);
      }
    }
    if (!this.count) {
      this.lastMs = performance.now() - start;
      return;
    }
    const reach = Math.ceil(this.maxRange / REGION);
    const ri = regionOf(eye.x);
    const rj = regionOf(eye.z);
    const ground = (x, z) => this.terrain.finestAt(x, z);
    for (let j = rj - reach; j <= rj + reach; j += 1) {
      for (let i = ri - reach; i <= ri + reach; i += 1) {
        const list = this.regions.get(`${i}_${j}`);
        if (!list) {
          continue;
        }
        for (const a of list) {
          if (a.object || Math.hypot(a.x - eye.x, a.z - eye.z) > a.range) {
            continue;
          }
          if (performance.now() - start > this.buildMs || !this.terrain.finestLoaded(a.x, a.z)) {
            continue;
          }
          const obj = a.build(ground(a.x, a.z), ground);
          if (obj) {
            a.object = obj;
            this.group.add(obj);
            this.live.add(a);
          }
        }
      }
    }
    this.lastMs = performance.now() - start;
    this.worstBuildMs = Math.max(this.worstBuildMs, this.lastMs);
  }

  stats() {
    return { anchors: this.count, built: this.live.size, worstMs: this.worstBuildMs };
  }

  dispose() {
    for (const a of [...this.live]) {
      this.take(a);
    }
    this.group.removeFromParent();
    this.regions.clear();
  }
}
