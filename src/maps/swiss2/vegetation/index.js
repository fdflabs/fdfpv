/*
 * index.js: swiss2's vegetation, one call for the map to make.
 *
 *   buildVegetation(ctx) -> { group, update(dtMs, camera), dispose(), stats }
 *
 * The forests (spruce, silver fir, larch, beech, sycamore) at three
 * levels of detail, the boulders, and the meadow under the camera, laid
 * out by the alps map's own rules (zones.js) on the alps valley. What
 * ctx carries, and what is optional, is in docs/SWISS2-ASSETS-VEG.md.
 *
 * Nothing here reads the step clock: update is given the frame's wall
 * time, and only moves the wind and chooses what to draw.
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
import { makeRng } from '../../alps/noise.js';
import { valleyLayout } from './zones.js';
import { loadAtlases } from './atlas.js';
import { VARIANTS, buildVariant, triangles } from './species.js';
import { windUniforms, plantMaterial, plantDepthMaterial } from './plantmat.js';
import { bakeImpostors, impostorMaterial, impostorMesh } from './impostor.js';
import { plantForest, forestLod } from './forest.js';
import { buildRocks } from './rocks.js';
import { buildGrass } from './grass.js';
import { FIELD, HALF } from '../../alps/terrain.js';

/*
 * The quality tiers. spacing is the closed forest's grid in metres;
 * near and mid the outer edges of the full model and the reduced model
 * bands, fade the width they dissolve over; frame the impostor view in
 * pixels; grass the meadow's radius (0 for none) and its grid; rocks how
 * many and how far out the scanned near level reaches.
 */
export const TIERS = {
  high: { spacing: 4.4, near: 70, mid: 260, fade: 14, frame: 128, capNear: 1800, capMid: 9000, grass: 48, grassSpacing: 0.36, grassCap: 80000, rocks: 1800, rockNear: 160, chunk: 1500 },
  medium: { spacing: 5.6, near: 40, mid: 170, fade: 10, frame: 96, capNear: 900, capMid: 5000, grass: 30, grassSpacing: 0.48, grassCap: 36000, rocks: 1200, rockNear: 90, chunk: 1500 },
  low: { spacing: 7.5, near: 0, mid: 110, fade: 8, frame: 64, capNear: 0, capMid: 3000, grass: 0, grassSpacing: 0, grassCap: 0, rocks: 700, rockNear: 50, chunk: 3000 },
};

export function tierOf(quality) {
  const id = typeof quality === 'string' ? quality : quality?.id;
  return TIERS[id] ? id : 'high';
}

export async function buildVegetation(ctx) {
  const tier = tierOf(ctx.quality);
  const Q = TIERS[tier];
  const t0 = performance.now();
  const rng = ctx.rng || makeRng(20260924);
  const layout = ctx.layout || valleyLayout(ctx.heightAt, ctx.footprints || []);
  const group = new THREE.Group();
  group.name = 'swiss2-vegetation';
  const atlases = await loadAtlases();
  const wind = windUniforms();
  if (ctx.windDir) {
    wind.uWindDir.value.set(ctx.windDir.x, ctx.windDir.y).normalize();
  }

  /* The trees: every variant at both model levels, and photographed for
   * the impostors. */
  const builds = VARIANTS.map((v) => ({ near: buildVariant(v, 'near'), mid: buildVariant(v, 'mid') }));
  const baked = bakeImpostors(ctx.renderer, builds.map((b) => b.near), { foliage: atlases.foliage, bark: atlases.bark.map }, Q.frame);
  const bands = {
    near: [-2, -1, Q.near - Q.fade, Q.near],
    mid: Q.near > 0 ? [Q.near - Q.fade, Q.near, Q.mid - Q.fade, Q.mid] : [-2, -1, Q.mid - Q.fade, Q.mid],
    far: [Q.mid - Q.fade, Q.mid, 1e9, 2e9],
  };
  const mats = {
    nearFoliage: plantMaterial('foliage', { map: atlases.foliage, band: bands.near, wind }),
    nearBark: plantMaterial('bark', { map: atlases.bark.map, normalMap: atlases.bark.normalMap, band: bands.near, wind }),
    mid: plantMaterial('foliage', { map: atlases.foliage, band: bands.mid, wind }),
    foliageDepth: plantDepthMaterial('foliage', { map: atlases.foliage, wind }),
    barkDepth: plantDepthMaterial('bark', { wind }),
  };
  const impMat = impostorMaterial(baked, bands.far);
  const lit = [mats.nearFoliage, mats.nearBark, mats.mid, impMat];
  if (ctx.envMap) {
    for (const m of lit) {
      m.envMap = ctx.envMap;
    }
  }
  const forest = plantForest({ heightAt: ctx.heightAt, layout, rng, spacing: Q.spacing, colliders: ctx.colliders });
  const lod = forestLod({
    forest,
    builds,
    mats,
    bands: { near: Q.near, mid: Q.mid },
    fade: Q.fade,
    caps: { near: Q.capNear, mid: Q.capMid },
    group,
  });
  /* The impostors, in chunks the camera's frustum can drop. */
  const cn = Math.ceil(FIELD / Q.chunk);
  const chunks = Array.from({ length: cn * cn }, () => []);
  for (let t = 0; t < forest.count; t += 1) {
    const i = Math.min(cn - 1, Math.floor((forest.x[t] + HALF) / Q.chunk));
    const j = Math.min(cn - 1, Math.floor((forest.z[t] + HALF) / Q.chunk));
    chunks[j * cn + i].push(t);
  }
  const impostors = chunks.filter((c) => c.length).map((c) => impostorMesh(forest, c, impMat));
  for (const m of impostors) {
    group.add(m);
  }

  const rocks = await buildRocks({
    heightAt: ctx.heightAt,
    layout,
    rng: makeRng(20260927),
    count: Q.rocks,
    nearR: Q.rockNear,
    fade: 12,
    colliders: ctx.colliders,
    group,
    envMap: ctx.envMap,
  });

  const grass = Q.grass > 0
    ? buildGrass({
      heightAt: ctx.heightAt,
      layout,
      atlas: atlases.grass,
      wind,
      radius: Q.grass,
      spacing: Q.grassSpacing,
      cap: Q.grassCap,
      group,
      tint: ctx.grassTint,
    })
    : null;
  if (grass && ctx.envMap) {
    grass.mesh.material.envMap = ctx.envMap;
  }

  const modelTris = builds.map((b, v) => ({
    name: VARIANTS[v].name,
    near: triangles(b.near.foliage) + triangles(b.near.bark),
    mid: triangles(b.mid.foliage),
  }));
  const stats = {
    tier,
    trees: forest.count,
    species: forest.counts,
    rocks: rocks.count,
    impostorChunks: impostors.length,
    modelTris,
    lod: lod.stats,
    grass: grass ? grass.stats : null,
    buildMs: 0,
  };
  const cam = new THREE.Vector3();
  let time = 0;
  const update = (dtMs, camera) => {
    time += Math.min(dtMs, 100) / 1000;
    wind.uTime.value = time;
    camera.getWorldPosition(cam);
    lod.update(cam);
    rocks.update(cam);
    if (grass) {
      grass.update(cam);
    }
  };
  stats.buildMs = Math.round(performance.now() - t0);
  return {
    group,
    update,
    stats,
    layout,
    wind,
    forest,
    variantIndex: (name) => VARIANTS.findIndex((v) => v.name === name),
    atlases,
    baked,
    dispose() {
      group.removeFromParent();
      for (const b of builds) {
        for (const g of [b.near.foliage, b.near.bark, b.mid.foliage]) {
          if (g) {
            g.dispose();
          }
        }
      }
      for (const m of impostors) {
        m.geometry.dispose();
      }
      for (const m of [...lit, mats.foliageDepth, mats.barkDepth]) {
        m.dispose();
      }
      baked.dispose();
      atlases.dispose();
      rocks.dispose();
      if (grass) {
        grass.dispose();
      }
      for (const level of lod.levels) {
        for (const m of [level.near, level.bark, level.mid]) {
          if (m) {
            m.dispose();
          }
        }
      }
    },
  };
}
