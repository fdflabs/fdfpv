/*
 * index.js: Yellowstone's thermal features, as the map module sees them.
 *
 *   const thermal = buildThermal({ scene, heightAt, thermal: json, rivers });
 *   thermal.loadRegion(region)   when the engine draws its finest level there
 *   thermal.unloadRegion(key)    when it stops
 *   thermal.updateAnim(stepMs)   the step clock, every frame
 *   thermal.setDemo(true)        compressed geyser intervals
 *
 * Built at once: the far steam over every basin, which is how a pilot finds
 * the basins from the air and so has to exist where no region is loaded.
 * Built per region: the ordinary features (springs.js) and any hero
 * landmark standing in it. The interface the engine is asked for is in
 * docs/YELLOWSTONE-PLAN.md under "Thermal and water: the interface".
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { readThermal, basinPlumes, regionOf } from './catalog.js';
import { buildRegionFeatures, regionMaterials, rngFrom } from './springs.js';
import { SteamBuilder } from './steam.js';
import { buildOldFaithful } from './landmarks/old-faithful.js';
import { buildGrandPrismatic } from './landmarks/grand-prismatic.js';
import { buildExcelsior } from './landmarks/excelsior.js';
import { buildMorningGlory } from './landmarks/morning-glory.js';
import { buildCastle, buildGrand, buildRiverside, buildBeehive } from './landmarks/geysers.js';
import { buildPaintPot } from './landmarks/paint-pot.js';
import { buildMammoth } from './landmarks/mammoth.js';
import { buildLowerFalls } from './landmarks/lower-falls.js';
import { bakeByMaterial } from './landmarks/kit.js';

export const BUILDERS = {
  'old-faithful': buildOldFaithful,
  'grand-prismatic': buildGrandPrismatic,
  excelsior: buildExcelsior,
  'morning-glory': buildMorningGlory,
  castle: buildCastle,
  grand: buildGrand,
  riverside: buildRiverside,
  beehive: buildBeehive,
  'paint-pot': buildPaintPot,
  mammoth: buildMammoth,
  'lower-falls': buildLowerFalls,
};

/* The ground each hero builds for itself, in metres from its centre: the
 * inventory's own entries inside it are left to the hero. */
const CLEAR = {
  'old-faithful': 45, 'grand-prismatic': 75, excelsior: 55, 'morning-glory': 9, castle: 28, grand: 14,
  riverside: 8, beehive: 6, 'paint-pot': 16, mammoth: 260, 'lower-falls': 0,
};

/* Prevailing wind over the plateau: from the south west, a few metres a
 * second at basin height. World x east, z south. */
const WIND = new THREE.Vector2(2.2, -1.6);

/*
 * The shared clock, wind and sun every thermal material reads, so one
 * uniform write per frame moves all of it.
 */
export function thermalEnv({ heightAt, sunDir, rivers = [], seed = 20260924 }) {
  const wind = { value: WIND.clone() };
  return {
    heightAt,
    sunDir: sunDir ?? new THREE.Vector3(0.45, 0.62, 0.64).normalize(),
    clock: { value: 0 },
    wind,
    windSpeed: () => wind.value.length(),
    rivers,
    rng: rngFrom(seed),
    materials: regionMaterials(),
  };
}

export function buildThermal({ scene, heightAt, thermal, rivers, sunDir, only }) {
  const cat = readThermal(thermal);
  const env = thermalEnv({ heightAt, sunDir, rivers });
  const root = new THREE.Group();
  root.name = 'thermal';
  scene.add(root);

  /* The far plumes: one column of big slow puffs over every busy bin. */
  const far = new SteamBuilder();
  const plumes = basinPlumes(cat.features);
  const farRng = rngFrom(99);
  for (const p of plumes) {
    const strength = Math.min(1, p.heat / 40);
    far.vent({
      x: p.x, y: heightAt(p.x, p.z) - 2, z: p.z, spread: 25 + 50 * strength, count: 5 + Math.round(9 * strength),
      size: 12 + 16 * strength, rise: 60 + 90 * strength, life: 40, alpha: 0.45 + 0.25 * strength, rng: farRng,
    });
  }
  /* Twenty faces a puff: these are seen from a kilometre and more, and
   * the park has three hundred of them. */
  const farMesh = far.build(env, { detail: 0, name: 'far-plumes', fade: [500, 1400] });
  if (farMesh) {
    /* Near a basin the region's own steam takes over; the far columns fade
     * in from where it stops so the two are not both drawn at full. */
    root.add(farMesh);
  }

  const regions = new Map();
  const heroes = new Map();
  let demo = false;

  /* How warm the ground is round (x, z), 0 to 1, from the features within
   * 150 m: the water module steams a river where it runs warm. */
  const WARM_BIN = 150;
  const warmBins = new Map();
  for (const f of [...cat.features, ...Object.values(cat.heroes)]) {
    const key = `${Math.floor(f.x / WARM_BIN)},${Math.floor(f.z / WARM_BIN)}`;
    warmBins.set(key, (warmBins.get(key) ?? 0) + (f.hero ? 6 : 1));
  }
  function warmAt(x, z) {
    const i = Math.floor(x / WARM_BIN);
    const j = Math.floor(z / WARM_BIN);
    let n = 0;
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        n += (warmBins.get(`${i + di},${j + dj}`) ?? 0) * (di === 0 && dj === 0 ? 1 : 0.5);
      }
    }
    return Math.min(1, n / 14);
  }

  function loadRegion(region) {
    if (regions.has(region.key)) {
      return regions.get(region.key).stats;
    }
    const group = new THREE.Group();
    group.name = `thermal-region-${region.key}`;
    /* A hero builds its own ground; an inventory entry standing on it
     * would be a second spring painted into the first. */
    const clear = Object.entries(cat.heroes).map(([id, h]) => ({ x: h.x, z: h.z, r: CLEAR[id] ?? 0 }));
    const feats = (cat.regions.get(region.key) ?? []).filter((f) => !clear.some((c) => Math.hypot(f.x - c.x, f.z - c.z) < c.r));
    /* Heroes first: they add their quiet steam to the region's ambient
     * steam, which the features then build as one mesh. */
    const renv = { ...env, ambient: new SteamBuilder() };
    const mine = [];
    const heroGroup = new THREE.Group();
    heroGroup.name = 'landmarks';
    let heroParticles = 0;
    for (const [id, f] of Object.entries(cat.heroes)) {
      if (only && !only.includes(id)) {
        continue;
      }
      if (regionOf(f.x, f.z).key !== region.key) {
        continue;
      }
      const hero = BUILDERS[id](renv, f);
      if (demo && hero.setDemo) {
        hero.setDemo(typeof demo === 'number' && id !== 'old-faithful' ? true : demo);
      }
      heroes.set(id, hero);
      heroGroup.add(hero.group);
      mine.push(id);
      heroParticles += hero.particles ?? 0;
    }
    const baked = bakeByMaterial(heroGroup);
    const built = buildRegionFeatures(only ? [] : feats, renv, region);
    built.stats.particles += heroParticles;
    built.stats.baked = baked;
    group.add(built.group, heroGroup);
    root.add(group);
    const entry = { group, heroes: mine, stats: { ...built.stats, heroes: mine } };
    regions.set(region.key, entry);
    return entry.stats;
  }

  function unloadRegion(key) {
    const entry = regions.get(key);
    if (!entry) {
      return;
    }
    root.remove(entry.group);
    disposeTree(entry.group);
    for (const id of entry.heroes) {
      heroes.delete(id);
    }
    regions.delete(key);
  }

  function updateAnim(stepMs) {
    const t = stepMs * 0.001;
    env.clock.value = t;
    for (const h of heroes.values()) {
      h.update(t);
    }
  }

  return {
    catalog: cat,
    env,
    root,
    loadRegion,
    unloadRegion,
    updateAnim,
    /* true for the demo table, false for the real schedule, or a number
     * of seconds for Old Faithful's interval (the others keep the table). */
    setDemo(on) {
      demo = on;
      for (const [id, h] of heroes) {
        if (h.setDemo) {
          h.setDemo(typeof on === 'number' && id !== 'old-faithful' ? true : on);
        }
      }
    },
    get demo() {
      return demo;
    },
    warmAt,
    /* Whether a hydro.json lake is water a landmark draws itself: its
     * middle inside a hero's own ground. */
    drawsLake(lake) {
      const cx = (lake.box.x0 + lake.box.x1) / 2;
      const cz = (lake.box.z0 + lake.box.z1) / 2;
      return Object.entries(cat.heroes).some(([id, h]) => (CLEAR[id] ?? 0) > 0 && Math.hypot(cx - h.x, cz - h.z) < CLEAR[id]);
    },
    hero: (id) => heroes.get(id) ?? null,
    heroes: () => [...heroes.keys()],
    plumes: plumes.length,
    farParticles: far.count,
    dispose() {
      for (const key of [...regions.keys()]) {
        unloadRegion(key);
      }
      scene.remove(root);
      disposeTree(root);
    },
  };
}

/* Free what a region made. Shared materials are made once per map by
 * thermalEnv and are not the region's to free; the map's dispose frees the
 * scene graph as a whole. */
function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) {
      o.geometry.dispose();
    }
    if (o.material && o.material.userData.particles) {
      o.material.dispose();
    }
  });
}
