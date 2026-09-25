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
import { valleyLayout, lakeShore, jettyClear } from './zones.js';
import { loadAtlases } from './atlas.js';
import { VARIANTS, buildVariant, triangles } from './species.js';
import { windUniforms, plantMaterial, plantDepthMaterial } from './plantmat.js';
import { bakeImpostors, impostorMaterial, impostorDepthMaterial, impostorMesh } from './impostor.js';
import { plantForest, forestLod } from './forest.js';
import { buildRocks, waterStones } from './rocks.js';
import { buildGrass } from './grass.js';
import { FIELD, HALF } from '../../alps/terrain.js';

/*
 * The quality tiers. spacing is the closed forest's grid in metres;
 * near and mid the outer edges of the full model and the reduced model
 * bands, fade the width they dissolve over; frame the impostor view in
 * pixels; grass the meadow's radius (0 for none) and its grid; meadow
 * the middle distance's layer beyond it, its radius and grid, drawn only
 * in the camera's view and from under fifteen metres, where the eye is
 * low enough to see a meadow's grass as grass; rocks how many and how far out the scanned near
 * level reaches.
 */
export const TIERS = {
  high: { spacing: 4.4, near: 70, mid: 260, fade: 14, frame: 128, capNear: 1800, capMid: 9000, grass: 40, grassSpacing: 0.42, grassCap: 50000, meadow: 260, meadowSpacing: 1.25, meadowCap: 36000, rocks: 1800, rockNear: 160, chunk: 1500 },
  medium: { spacing: 5.6, near: 40, mid: 170, fade: 10, frame: 96, capNear: 900, capMid: 5000, grass: 30, grassSpacing: 0.48, grassCap: 36000, meadow: 110, meadowSpacing: 1.3, meadowCap: 12000, rocks: 1200, rockNear: 90, chunk: 1500 },
  low: { spacing: 7.5, near: 0, mid: 110, fade: 8, frame: 64, capNear: 0, capMid: 3000, grass: 0, grassSpacing: 0, grassCap: 0, meadow: 0, meadowSpacing: 0, meadowCap: 0, rocks: 700, rockNear: 50, chunk: 3000 },
};

export function tierOf(quality) {
  const id = typeof quality === 'string' ? quality : quality?.id;
  return TIERS[id] ? id : 'high';
}

export async function buildVegetation(ctx) {
  const tier = tierOf(ctx.quality);
  const Q = TIERS[tier];
  const t0 = performance.now();
  /* Where the build's time goes, stage by stage, for the stats. */
  const stages = {};
  let tMark = t0;
  const mark = (name) => {
    const now = performance.now();
    stages[name] = Math.round(now - tMark);
    tMark = now;
  };
  const rng = ctx.rng || makeRng(20260924);
  const layout = ctx.layout || valleyLayout(ctx.heightAt, ctx.footprints || []);
  /* Where the walls are carved rock (swiss2/rock/), the drawn ground is
   * not the heightfield: no tree, boulder or grass stands there. The
   * trees and boulders are turned away once their random draws are
   * made (forest.js add, rocks.js drop), so every other one stands where
   * it stood; the grass is seeded per tile. */
  layout.carved = ctx.carved || (() => false);
  if (ctx.carved) {
    const { coverOff } = layout;
    layout.coverOff = (x, z) => coverOff(x, z) || ctx.carved(x, z);
  }
  /* The gardens are the village's houses, not every wall the map has
   * noted: a hay hut in a field has no garden. */
  layout.gardens = ctx.gardens || layout.footprints;
  /* The props' hand placed fence lines, whose grass is left long. */
  layout.margins = ctx.margins || [];
  const group = new THREE.Group();
  group.name = 'swiss2-vegetation';
  const atlases = await loadAtlases();
  mark('atlases');
  const wind = windUniforms();
  if (ctx.windDir) {
    wind.uWindDir.value.set(ctx.windDir.x, ctx.windDir.y).normalize();
  }

  /* The trees: every variant at both model levels, and photographed for
   * the impostors. */
  const builds = VARIANTS.map((v) => ({ near: buildVariant(v, 'near'), mid: v.impostorOnly ? null : buildVariant(v, 'mid') }));
  mark('models');
  const baked = bakeImpostors(ctx.renderer, builds.map((b) => b.near), { foliage: atlases.foliage, bark: atlases.bark.map }, Q.frame);
  mark('impostors');
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
  const impDepth = impostorDepthMaterial(impMat);
  /* The shadow pass draws a front sided material's back faces, and the
   * shadow billboard shows the sun its front. */
  impMat.shadowSide = THREE.DoubleSide;
  if (ctx.sunDir) {
    impMat.userData.impostor.uImpLight.value.copy(ctx.sunDir).normalize();
  }
  VARIANTS.forEach((v, k) => {
    impMat.userData.impostor.uVar.value[k].z = v.impostorOnly ? 1 : 0;
  });
  const lit =[mats.nearFoliage, mats.nearBark, mats.mid, impMat];
  if (ctx.envMap) {
    for (const m of lit) {
      m.envMap = ctx.envMap;
    }
  }
  /* `decideAt`, the ground the floor's trees are decided on, and `seed`,
   * the one `rng` was made from: the floor's trees drawn as the stands on
   * that ground leave the stream (forest.js plantForest), so a map that
   * reshapes its walls (swiss2/terrain.js) keeps its floor's trees where
   * they stood. */
  let floor = null;
  if (ctx.decideAt) {
    const heightAt = ctx.decideAt;
    const alps = valleyLayout(heightAt, ctx.footprints || []);
    alps.gardens = layout.gardens;
    const draws = plantForest({
      heightAt, layout: alps, rng: makeRng(ctx.seed), spacing: Q.spacing, colliders: null, standsOnly: true,
    });
    floor = { heightAt, layout: alps, rng: makeRng(ctx.seed) };
    for (let k = 0; k < draws; k += 1) {
      floor.rng();
    }
  }
  const forest = plantForest({
    heightAt: ctx.heightAt, layout, rng, spacing: Q.spacing, colliders: ctx.colliders, floor,
  });
  mark('planting');
  const lod = forestLod({
    forest,
    builds,
    mats,
    bands: { near: Q.near, mid: Q.mid },
    fade: Q.fade,
    caps: { near: Q.capNear, mid: Q.capMid },
    group,
    sunDir: ctx.sunDir,
  });
  /* The impostors, in chunks the camera's frustum can drop, and apart
   * from them the trees that grew in the open (the field, bank and
   * garden trees and a stand's edge), which alone cast a far shadow: in
   * a closed stand a tree's shadow falls on the next tree, and drawing
   * the whole forest into both shadow maps again cost a quarter of a
   * million triangles for nothing a view could see. */
  const cn = Math.ceil(FIELD / Q.chunk);
  const chunks = Array.from({ length: cn * cn * 2 }, () => []);
  for (let t = 0; t < forest.count; t += 1) {
    const i = Math.min(cn - 1, Math.floor((forest.x[t] + HALF) / Q.chunk));
    const j = Math.min(cn - 1, Math.floor((forest.z[t] + HALF) / Q.chunk));
    chunks[(j * cn + i) * 2 + forest.open[t]].push(t);
  }
  const impostors = chunks
    .map((c, k) => (c.length ? impostorMesh(forest, c, impMat, k % 2 && ctx.sunDir ? impDepth : null) : null))
    .filter(Boolean);
  for (const m of impostors) {
    group.add(m);
  }

  const stones = waterStones({
    heightAt: ctx.heightAt,
    layout,
    rng: makeRng(20260929),
    shore: lakeShore(ctx.heightAt).shore,
    keepClear: jettyClear(ctx.heightAt),
  });
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
    extra: stones,
  });
  mark('rocks');

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
      craft: ctx.craft,
    })
    : null;
  /* Past the blades, out to where the paint alone can carry it, the
   * same meadow in clumps twice the width on a grid three times as
   * coarse, in the view only: without it the floor beyond forty metres
   * was a mown lawn, whatever the field. */
  const meadow = Q.meadow > 0 && grass
    ? buildGrass({
      heightAt: ctx.heightAt,
      layout,
      atlas: atlases.grass,
      wind,
      radius: Q.meadow,
      inner: [Q.grass * 0.45, Q.grass * 0.8],
      spacing: Q.meadowSpacing,
      tile: 32,
      wide: 2,
      cap: Q.meadowCap,
      cull: true,
      perFrame: 4,
      ceiling: 15,
      group,
      tint: ctx.grassTint,
      craft: ctx.craft,
      name: 'swiss2-meadow',
    })
    : null;
  for (const g of [grass, meadow]) {
    if (g && ctx.envMap) {
      g.mesh.material.envMap = ctx.envMap;
    }
  }

  const modelTris = builds.map((b, v) => ({
    name: VARIANTS[v].name,
    near: triangles(b.near.foliage) + triangles(b.near.bark),
    mid: b.mid ? triangles(b.mid.foliage) : 0,
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
    meadow: meadow ? meadow.stats : null,
    buildMs: 0,
    stages,
  };
  const cam = new THREE.Vector3();
  let time = 0;
  const update = (dtMs, camera) => {
    time += Math.min(dtMs, 100) / 1000;
    wind.uTime.value = time;
    camera.getWorldPosition(cam);
    lod.update(camera);
    impMat.userData.impostor.uImpView.value.copy(cam);
    rocks.update(camera);
    if (grass) {
      grass.update(camera);
    }
    if (meadow) {
      meadow.update(camera);
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
        for (const g of [b.near.foliage, b.near.bark, b.mid?.foliage]) {
          if (g) {
            g.dispose();
          }
        }
      }
      for (const m of impostors) {
        m.geometry.dispose();
      }
      for (const m of [...lit, mats.foliageDepth, mats.barkDepth, impDepth]) {
        m.dispose();
      }
      baked.dispose();
      atlases.dispose();
      rocks.dispose();
      if (grass) {
        grass.dispose();
      }
      if (meadow) {
        meadow.dispose();
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
