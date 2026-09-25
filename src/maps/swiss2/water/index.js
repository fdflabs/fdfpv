/*
 * index.js: swiss2's water, one call for the map to make.
 *
 *   buildWater(ctx) -> { group, update(dtMs, camera), setWaves(bodies),
 *                        updateWaves(t, craft, camera), probe(x, z),
 *                        dispose(), stats }
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
 * The lake moves with the plant's own waves once the shell hands them over
 * (setWaves at every reset, updateWaves on the sim clock every frame; see
 * src/render/lakewaves.js): the sheet takes what its five metre cells can
 * carry, a dense patch round the aircraft or under the camera the rest,
 * and an aircraft on floats throws spray and leaves a wake on it
 * (src/render/spray.js). Until then it is the still lake it always was.
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
import { waterMaterial, bedMaterial } from './surface.js';
import { lakeGeometry, planarMirror } from './lake.js';
import { streamGeometry } from './stream.js';
import { buildFall } from './fall.js';
import { makeWaves, patchGeometry, placePatch, outlineBox, probeSurface } from '../../../render/lakewaves.js';
import { buildSpray } from '../../../render/spray.js';

const BASE = new URL('../../../../assets/swiss2/water/', import.meta.url);

const MIRROR_REACH = 2000;
/* How far the stream's milky plume reaches into the lake, in metres. */
const INFLOW_REACH = 230;

export const WATER_TIERS = {
  high: { mirror: 0.5, spray: true, mist: 1 },
  medium: { mirror: 0.34, spray: true, mist: 1 },
  low: { mirror: 0, spray: false, mist: 0.5 },
};

/* The water's colours, linear: a glacier fed lake is milky turquoise,
 * its rock flour scattering light back out of it (the lake's body, set
 * so lake-high's water measures the hue of Brienz's in the village
 * photograph, 173 degrees), and it swallows red first (LAKE_ABSORB, per
 * metre); the stream the same milky water, greyer, over a dark stony bed
 * between banks that shade it, which from the air is a dark teal line
 * with white where it runs fast: not a pale one, and not the asphalt grey
 * of the road beside it, which a near black body read as. */
const LAKE_SHALLOW = new THREE.Color(0.07, 0.3, 0.22);
const LAKE_BODY = new THREE.Color(0.028, 0.16, 0.13);
const LAKE_DEEP = new THREE.Color(0.012, 0.09, 0.095);
const LAKE_ABSORB = new THREE.Vector3(0.45, 0.07, 0.09);
const STREAM_BODY = new THREE.Color(0.03, 0.08, 0.075);

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
  /* A boat under way on the lake (x, z, and her velocity), for her wake:
   * the map points this at its sailing boat (props/lakeside.js). */
  const boat = { value: new THREE.Vector4() };
  /* The stream's mouth and its plume's reach into the lake, toward the
   * lake's middle. */
  const mouth = layout.lower[layout.lower.length - 1];
  const toMiddle = Math.hypot(cx - mouth.x, cz - mouth.z);
  const inflow = new THREE.Vector4(mouth.x, mouth.z, ((cx - mouth.x) / toMiddle) * INFLOW_REACH, ((cz - mouth.z) / toMiddle) * INFLOW_REACH);
  const lakeWaves = makeWaves();
  const lakeWater = {
    waves, time, wind, colour: LAKE_BODY, shallow: LAKE_SHALLOW, deep: LAKE_DEEP, clarity: 0.6, ripple: 0.3, roughness: 0.03, planar: mirror, envMap, shoreFoam: 0.08, boat, inflow,
  };
  const lakeMat = waterMaterial({ ...lakeWater, field: lakeWaves });
  const lake = new THREE.Mesh(lakeGeometry(heightAt, shore), lakeMat);
  lake.userData.waveRes = 5;
  lake.name = 'swiss2-lake';
  lake.receiveShadow = true;
  /* The bed's light, tinted by the water it comes up through, drawn
   * just before the water's own sheet. */
  const bedMat = bedMaterial({ ...lakeWater, field: lakeWaves }, LAKE_ABSORB);
  const lakeBed = new THREE.Mesh(lake.geometry, bedMat);
  lakeBed.name = 'swiss2-lake-bed';
  lakeBed.renderOrder = -1;
  group.add(lakeBed, lake);

  /* The near water, when the lake has waves: the same water and bed on
   * the dense patch, which reads its depth off the lake's own grid. Not
   * drawn until placePatch says so. */
  const dg = lake.geometry.userData.depth;
  const depthTex = new THREE.DataTexture(dg.data, dg.w, dg.h, THREE.RedFormat, THREE.FloatType);
  depthTex.needsUpdate = true;
  const patchOpts = { ...lakeWater, field: lakeWaves, patch: { texture: depthTex, grid: new THREE.Vector4(dg.x0, dg.z0, 1 / dg.cell, 0) } };
  const patchGeo = patchGeometry();
  const patchMat = waterMaterial(patchOpts);
  const patchBedMat = bedMaterial(patchOpts, LAKE_ABSORB);
  const patch = new THREE.Mesh(patchGeo, patchMat);
  patch.name = 'swiss2-lake-near';
  patch.receiveShadow = true;
  const patchBed = new THREE.Mesh(patchGeo, patchBedMat);
  patchBed.name = 'swiss2-lake-near-bed';
  patchBed.renderOrder = -1;
  patch.visible = false;
  patchBed.visible = false;
  /* Drawn before everything else see through: the patch lies round the
   * aircraft, and sorted by its own distance it would be drawn over the
   * aircraft's see through parts, which write no depth. */
  const near = new THREE.Group();
  near.name = 'swiss2-lake-patch';
  near.renderOrder = -1;
  near.add(patchBed, patch);
  const lakeBox = outlineBox(shore, 20);
  /* Spray and wake, drawn in the lake's own foam white as the sun and
   * the sky light it, the wake fainter than on the cel lake: here the
   * water's own ripples and sheen carry most of it. */
  const spray = buildSpray({ waves: lakeWaves, color: new THREE.Color(0.78, 0.82, 0.84), wakeColor: new THREE.Color(0.72, 0.78, 0.8), strength: 0.6 });

  /* The stream. */
  const streamMat = waterMaterial({
    waves, time, wind, flow: true, colour: STREAM_BODY, clarity: 3, ripple: 0.6, roughness: 0.06, envMap, width: 4,
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
    heightAt, layout, waves, time, wind: wind.value, envMap, group, rock: { map: cliffMap, normalMap: cliffNormal }, light: mistLight, sun: ctx.sun, lit: ctx.lit,
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
    foamAt: [fall.foot.x, fall.foot.z, 14, 1],
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
  group.userData.stats = stats;
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
    fall.show();
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
      /* What the mirror costs, apart from the frame's own count: the
       * shell reads that after this has run. */
      const info = ctx.renderer.info.render;
      const calls = info.calls;
      const triangles = info.triangles;
      mirror.render(ctx.renderer, ctx.scene, camera, hide);
      stats.mirrorCalls = info.calls - calls;
      stats.mirrorTriangles = info.triangles - triangles;
    }
  };
  /* The shell's bodies, in the map's frame: the lake's is the one whose
   * waves are measured from nearest its middle. */
  const setWaves = (bodies) => {
    let best = null;
    for (const b of bodies || []) {
      if (!best || Math.hypot(b.ox - cx, b.oz - cz) < Math.hypot(best.ox - cx, best.oz - cz)) {
        best = b;
      }
    }
    lakeWaves.set(best);
    spray.clear();
    /* Into the scene with the first waves, not at the build: each
     * program a still lake never draws, compiled by the build's
     * renderer.compile all the same, cost the fixed views twelve GL
     * warnings (glGetProgramiv). The scene's light injection has been by
     * then, so the patch takes it here. */
    if (best && !near.parent) {
      if (ctx.lit) {
        ctx.lit(patchMat);
        ctx.lit(patchBedMat);
      }
      group.add(near, spray.group);
    }
  };
  const updateWaves = (t, craft, camera) => {
    lakeWaves.tick(t);
    const onLake = craft && lakeWaves.body && Math.abs(craft.position.y - lakeWaves.body.y0) < 10 ? craft.position : null;
    stats.nearWater = placePatch(lakeWaves, [patch, patchBed], camera, onLake, lakeBox);
    spray.update(t, craft, camera, ctx.renderer);
    stats.spray = spray.stats;
  };
  /* The lake's drawn height at (x, z), off the GPU: the patch where it
   * lies, else the sheet. */
  const probe = (x, z) => {
    if (!lakeWaves.body) {
      return null;
    }
    const u = lakeWaves.uniforms.uPatch.value;
    const inPatch = u.w > 0 && Math.max(Math.abs(x - u.x), Math.abs(z - u.y)) < u.w;
    return { y: probeSurface(ctx.renderer, inPatch ? patch : lake, lakeWaves, x, z), patch: inPatch, t: lakeWaves.t };
  };
  stats.buildMs = Math.round(performance.now() - t0);
  return {
    group,
    update,
    setWaves,
    updateWaves,
    probe,
    boat,
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
      for (const m of [lake, poolMesh, patch, ...runs]) {
        m.geometry.dispose();
      }
      for (const m of [lakeMat, bedMat, streamMat, poolMat, patchMat, patchBedMat]) {
        m.dispose();
      }
      depthTex.dispose();
      spray.dispose();
    },
  };
}
