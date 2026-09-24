/*
 * index.js: swiss2's water, one call for the map to make.
 *
 *   buildWater(ctx) -> { group, update(dtMs, camera), dispose(), stats }
 *
 * The lake with its mirror, the stream in its three runs, the pool, and
 * the fall with its headwall and mist, laid out by the alps map's own
 * lines (../vegetation/zones.js). What ctx carries, and what is optional,
 * is in docs/SWISS2-ASSETS-VEG.md.
 *
 * Quality: High gives the lake a planar mirror of the valley at half the
 * drawing buffer's resolution, Medium at a third, Low none (the lake then
 * reflects the sky's image based light only, which is right for the sky
 * and wrong for the mountains in it). Low also drops the spray and halves
 * the mist.
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
import { LAKE_Y } from '../../alps/terrain.js';
import { valleyLayout, lakeShore } from '../vegetation/zones.js';
import { waveTexture } from './waves.js';
import { waterMaterial } from './surface.js';
import { lakeGeometry, planarMirror } from './lake.js';
import { streamGeometry } from './stream.js';
import { buildFall } from './fall.js';

const BASE = new URL('../../../../assets/swiss2/water/', import.meta.url);

const MIRROR_REACH = 2000;

export const WATER_TIERS = {
  high: { mirror: 0.5, spray: true, mist: 1 },
  medium: { mirror: 0.34, spray: true, mist: 1 },
  low: { mirror: 0, spray: false, mist: 0.5 },
};

/* The water's colours, linear: a glacier fed lake is milky turquoise,
 * the stream the same water thinner and greyer. */
const LAKE_BODY = new THREE.Color(0.006, 0.028, 0.03);
const STREAM_BODY = new THREE.Color(0.03, 0.06, 0.06);

export async function buildWater(ctx) {
  const id = typeof ctx.quality === 'string' ? ctx.quality : ctx.quality?.id;
  const tier = WATER_TIERS[id] ? id : 'high';
  const Q = WATER_TIERS[tier];
  const t0 = performance.now();
  const { heightAt } = ctx;
  const layout = ctx.layout || valleyLayout(heightAt, ctx.footprints || []);
  const group = new THREE.Group();
  group.name = 'swiss2-water';
  const waves = waveTexture(512);
  const time = { value: 0 };
  const wind = { value: new THREE.Vector2(ctx.windDir?.x ?? 0.8, ctx.windDir?.y ?? -0.6).normalize() };
  const envMap = ctx.envMap || null;

  /* The lake. */
  const { cx, cz, shore } = lakeShore(heightAt);
  const mirror = Q.mirror > 0 ? planarMirror(LAKE_Y, Q.mirror) : null;
  const lakeMat = waterMaterial({
    waves, time, wind, colour: LAKE_BODY, clarity: 0.22, ripple: 0.3, roughness: 0.03, planar: mirror, envMap, shoreFoam: 0.3,
  });
  const lake = new THREE.Mesh(lakeGeometry(heightAt, shore), lakeMat);
  lake.name = 'swiss2-lake';
  lake.receiveShadow = true;
  group.add(lake);

  /* The stream. */
  const streamMat = waterMaterial({
    waves, time, wind, flow: true, colour: STREAM_BODY, clarity: 1.4, ripple: 0.6, roughness: 0.06, envMap, width: 4,
  });
  const runs = [[layout.aboveFall, 3.6], [layout.belowFall, 3.6], [layout.lower, 5.2]]
    .filter(([pts]) => pts.length > 1)
    .map(([pts, w]) => {
      const m = new THREE.Mesh(streamGeometry(pts, w, layout.groundAt), streamMat);
      m.name = 'swiss2-stream';
      m.receiveShadow = true;
      group.add(m);
      return m;
    });

  /* The fall, its headwall and mist, and the pool it drops into. */
  const tl = new THREE.TextureLoader();
  const [cliffMap, cliffNormal] = await Promise.all([
    tl.loadAsync(new URL('cliff-diff.webp', BASE).href),
    tl.loadAsync(new URL('cliff-normal.webp', BASE).href),
  ]);
  cliffMap.colorSpace = THREE.SRGBColorSpace;
  for (const t of [cliffMap, cliffNormal]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  const mistLight = ctx.mistLight || new THREE.Color(0.62, 0.66, 0.72);
  const fall = await buildFall({
    heightAt, layout, waves, time, wind: wind.value, envMap, group, rock: { map: cliffMap, normalMap: cliffNormal }, light: mistLight,
  });
  if (!Q.spray) {
    group.getObjectByName('swiss2-spray').visible = false;
  }
  if (Q.mist < 1) {
    const m = group.getObjectByName('swiss2-mist');
    m.geometry.instanceCount = Math.round(m.geometry.instanceCount * Q.mist);
  }
  const pool = layout.pool;
  const poolY = pool.y - 0.6;
  const poolGeo = new THREE.CircleGeometry(pool.r * 0.97, 48);
  poolGeo.rotateX(-Math.PI / 2);
  poolGeo.translate(pool.x, poolY, pool.z);
  const pp = poolGeo.getAttribute('position');
  const pw = new Float32Array(pp.count * 4);
  for (let k = 0; k < pp.count; k += 1) {
    pw[k * 4] = poolY - heightAt(pp.getX(k), pp.getZ(k));
  }
  poolGeo.setAttribute('aWater', new THREE.BufferAttribute(pw, 4));
  const poolMat = waterMaterial({
    waves, time, wind, colour: LAKE_BODY, clarity: 0.5, ripple: 0.8, roughness: 0.05, envMap,
    foamAt: [fall.foot.x, fall.foot.z, 16, 0.7],
  });
  const poolMesh = new THREE.Mesh(poolGeo, poolMat);
  poolMesh.name = 'swiss2-pool';
  group.add(poolMesh);

  const stats = {
    tier,
    mirror: Q.mirror,
    lakeTriangles: lake.geometry.index.count / 3,
    streamTriangles: runs.reduce((n, m) => n + m.geometry.index.count / 3, 0),
    fallHeight: Math.round(fall.height),
    buildMs: 0,
  };
  let clock = 0;
  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const lakeSphere = lake.geometry.boundingSphere;
  /* Hidden while the mirror is drawn: the water itself, and whatever the
   * map lists as not worth reflecting (ctx.mirrorHide, the meadow). */
  const hide = [group, ...(ctx.mirrorHide || [])];
  const update = (dtMs, camera) => {
    clock += Math.min(dtMs, 100) / 1000;
    time.value = clock;
    if (!mirror) {
      return;
    }
    /* The mirror is a whole second scene render: only when the lake is in
     * the camera's frustum. At the strip, looking up the valley, it is
     * not. */
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    /* Past two kilometres from its nearest shore the lake is a sliver
     * whose reflection the sky's light carries well enough. */
    stats.mirrorDrawn = frustum.intersectsSphere(lakeSphere)
      && camera.position.distanceTo(lakeSphere.center) - lakeSphere.radius < MIRROR_REACH;
    if (stats.mirrorDrawn) {
      mirror.render(ctx.renderer, ctx.scene, camera, hide);
    }
  };
  stats.buildMs = Math.round(performance.now() - t0);
  return {
    group,
    update,
    stats,
    layout,
    lake: { cx, cz, shore },
    dispose() {
      group.removeFromParent();
      waves.dispose();
      cliffMap.dispose();
      cliffNormal.dispose();
      if (mirror) {
        mirror.dispose();
      }
      fall.dispose();
      for (const m of [lake, poolMesh, ...runs]) {
        m.geometry.dispose();
      }
      for (const m of [lakeMat, streamMat, poolMat]) {
        m.dispose();
      }
    },
  };
}
