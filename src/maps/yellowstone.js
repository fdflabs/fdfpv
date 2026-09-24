/*
 * yellowstone.js: Yellowstone National Park, 100 by 100 km at real scale.
 * IN DEVELOPMENT: the streamed terrain, and the thermal features and the
 * water standing on it, on whatever data the base URL serves (see
 * docs/YELLOWSTONE-PLAN.md). No roads yet.
 *
 * This file is the order things are built in and the contract the shell
 * reads. The terrain lives in src/maps/yellowstone/terrain/:
 *
 *   frame.js     the contract's numbers: extent, tile pyramid, encoding
 *   tiles.js     fetching, holding and evicting elevation tiles
 *   engine.js    the quadtree of chunks, the streaming and the ground
 *   chunks.js    one chunk's mesh, its skirts and the ground's paint
 *   apron.js     the country beyond the square, so the edge is not a void
 *   landcover.js NLCD land cover, the paint's first answer
 *   regions.js   when the thermal features and the water build a region
 *   anchors.js   the placement API: features that load with the ground
 *   noise.js     value noise for the paint
 *   synth-tiles.js  a Node script writing synthetic tiles to test with
 *
 * WHERE THE DATA COMES FROM. The public site reads DATA_BASE, the data's
 * own repository on GitHub Pages, so a rebuild of the data is a push there
 * and nothing here changes. A page served from this machine (localhost or
 * 127.0.0.1: `npm run serve` and every headless check) reads LOCAL_BASE
 * beside the page instead, which scripts/serve.js and tests/lib/server.js
 * serve from the folder FDFPV_YELLOWSTONE_DATA names, by default
 * ~/Desktop/fdfpv-yellowstone-data, the pipeline's output; point it at a
 * folder of synthetic tiles (terrain/synth-tiles.js) where the real data
 * is not. `?ysdata=URL` overrides both, absolute or relative to the page.
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
import { Colliders } from '../game/collide.js';
import { disposeSceneGraph } from '../render/shell.js';
import { SESSION_TEXTURES } from '../render/session-textures.js';
import { celMaterial } from '../render/celmat.js';
import { skyDome } from '../render/scene.js';
import { attachComposer } from './field.js';
import { yieldToPaint } from '../ui/loading.js';
import { qualityFor } from '../render/quality.js';
import { str } from '../strings/index.js';
import { Y0, HALF, LANDMARKS } from './yellowstone/terrain/frame.js';
import { Terrain } from './yellowstone/terrain/engine.js';
import { Anchors } from './yellowstone/terrain/anchors.js';
import { groundGrain } from './yellowstone/terrain/chunks.js';
import { LandCover } from './yellowstone/terrain/landcover.js';
import { Regions } from './yellowstone/terrain/regions.js';
import { buildThermal } from './yellowstone/thermal/index.js';
import { buildWater } from './yellowstone/water/index.js';
import { readHydro } from './yellowstone/water/hydro.js';
import { updateCelTime } from '../render/celmat.js';

/* The one place the public data's address is written. */
export const DATA_BASE = 'https://fdflabs.github.io/fdfpv-yellowstone-data/';
const LOCAL_BASE = 'yellowstone-data/';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/*
 * The terrain's budgets per graphics preset.
 *
 *   split      a node splits when a focus is nearer its box than this many
 *              times its children's side doubled (engine.js). 1 hands a
 *              30 m cell over to 60 m at about 3.8 km, 0.45 degrees, some
 *              eight pixels on a 1080p screen at the default field of
 *              view. 2 was tried first and drew 1.8 million triangles
 *              round the spawn; 1 is inside the 400 000 in view the check
 *              holds it to.
 *   buildMs    main thread time a frame may spend building chunk meshes.
 *              A chunk is 1.3 ms of work at level 0 and up to 10 at level
 *              4, where the land cover is averaged over a wide cell, so a
 *              build is sliced by rows and carries over to the next frame.
 *   anchorMs   the same for features built through anchors.js.
 *   tileCeiling  bytes of elevation tiles held when nothing pins them.
 *   meshCap    built chunk meshes kept, drawn or not, before the least
 *              recently drawn are freed. A chunk is 127 kB of vertex
 *              buffers, so 300 is 38 MB.
 *   prefetch, prefetchHero  radius round the craft, metres, inside which
 *              the finest tiles are fetched before the selection needs
 *              them. A level 0 tile is 7.68 km, so 6 km keeps the next
 *              tile resident a couple of minutes ahead at 30 m/s.
 */
const TERRAIN_Q = {
  low: { split: 0.7, buildMs: 1.5, anchorMs: 1, tileCeiling: 12e6, meshCap: 200, prefetch: 6000, prefetchHero: 2500 },
  medium: { split: 0.85, buildMs: 2, anchorMs: 1.5, tileCeiling: 16e6, meshCap: 250, prefetch: 6000, prefetchHero: 2500 },
  high: { split: 1, buildMs: 2, anchorMs: 2, tileCeiling: 24e6, meshCap: 300, prefetch: 6000, prefetchHero: 3000 },
};

/* Haze and sky. The fog is sized to the eye's height every frame: from the
 * ground the far ridges stand in the air twenty five kilometres off, from
 * three kilometres up the view runs out to sixty, and the camera's far
 * plane follows it. */
/* The sky dome's own horizon (src/render/scene.js), so fogged ground
 * meets the sky without a band. */
const HORIZON = 0xf2e3cb;
const SUN_DIR = new THREE.Vector3(0.42, 0.66, 0.62).normalize();

function fogFor(altitude) {
  const a = Math.max(0, altitude);
  return { near: 1500 + 4 * a, far: Math.min(75000, 26000 + 12 * a) };
}

export function dataBase() {
  const loc = window.location;
  const param = new URLSearchParams(loc.search).get('ysdata');
  const fallback = LOCAL_HOSTS.has(loc.hostname) ? LOCAL_BASE : DATA_BASE;
  const url = new URL(param || fallback, document.baseURI).href;
  return url.endsWith('/') ? url : `${url}/`;
}

/* A data file the manifest lists, or null when it lists none. */
async function optionalJson(base, name, manifest) {
  if (!manifest.files || !(name in manifest.files)) {
    return null;
  }
  const res = await fetch(`${base}${name}`);
  if (!res.ok) {
    throw new Error(`yellowstone: ${base}${name}: HTTP ${res.status}`);
  }
  return res.json();
}

async function readManifest(base) {
  const res = await fetch(`${base}manifest.json`);
  if (!res.ok) {
    throw new Error(`yellowstone: no manifest at ${base}manifest.json (HTTP ${res.status}); `
      + `serve the data folder there or pass ?ysdata=${DATA_BASE}`);
  }
  return res.json();
}

/* The flattest open spot within `radius` of (x, z) on a 30 m lattice,
 * judged by the height spread over a 40 m cross, so the spawn is a meadow
 * and not a sinter mound or a riverbank; ground the land cover calls
 * forest, water or buildings costs as much as five metres of spread. */
const OPEN = new Set([31, 52, 71, 81]);
function flattest(ground, x, z, radius, cover) {
  let best = { x, z, spread: Infinity };
  for (let dz = -radius; dz <= radius; dz += 30) {
    for (let dx = -radius; dx <= radius; dx += 30) {
      if (dx * dx + dz * dz > radius * radius) {
        continue;
      }
      const px = x + dx;
      const pz = z + dz;
      const c = ground(px, pz);
      let spread = 0;
      for (const [ox, oz] of [[20, 0], [-20, 0], [0, 20], [0, -20], [14, 14], [-14, -14]]) {
        spread = Math.max(spread, Math.abs(ground(px + ox, pz + oz) - c));
      }
      /* Nearer the landmark wins a tie. */
      const closed = cover && !OPEN.has(cover.classAtWorld(px, pz)) ? 5 : 0;
      const score = spread + closed + Math.hypot(dx, dz) * 0.0005;
      if (score < best.spread) {
        best = { x: px, z: pz, spread: score };
      }
    }
  }
  return best;
}

async function buildYellowstone(shell, progress, q) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(HORIZON);
  const fog0 = fogFor(0);
  scene.fog = new THREE.Fog(HORIZON, fog0.near, fog0.far);
  const sky = skyDome();
  sky.layers.set(1);
  scene.add(sky);
  camera.far = fog0.far * 1.05;
  camera.updateProjectionMatrix();

  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
  sun.castShadow = q.shadows;
  const shadowMap = q.field.shadowMap || 2048;
  const shadowHalf = q.field.shadowHalf || 72;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 600;
  sun.shadow.camera.left = -shadowHalf;
  sun.shadow.camera.right = shadowHalf;
  sun.shadow.camera.top = shadowHalf;
  sun.shadow.camera.bottom = -shadowHalf;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xa9c4e6, 0x55703a, 0.5));
  progress(0.05);
  await yieldToPaint();

  const base = dataBase();
  const manifest = await readManifest(base);
  const grain = groundGrain(renderer.capabilities.getMaxAnisotropy());
  const material = celMaterial({ color: 0xffffff, rim: 0.1, map: grain, key: 'yellowstone-ground' });
  material.vertexColors = true;
  const cover = await LandCover.load(base, manifest);
  progress(0.1);
  const terrain = new Terrain({
    base, manifest, material, scene, cover, quality: TERRAIN_Q[q.id] || TERRAIN_Q.high,
  });

  /* The spawn: a meadow a few hundred metres south of Old Faithful,
   * facing north at it. Found on the coarse level first so the load can
   * fetch the right fine tiles, then settled on the fine one. */
  const OF = LANDMARKS.oldFaithful;
  const look = new THREE.Vector3(OF.x, 0, OF.z + 700);
  const eye = new THREE.Vector3(OF.x, 0, OF.z + 700);
  await terrain.load(look, eye, (f) => progress(0.1 + 0.75 * f));
  const spot = flattest((x, z) => terrain.finestAt(x, z), OF.x, OF.z + 450, 330, cover);
  const spawn = { x: spot.x, z: spot.z, yaw: 0 };
  progress(0.88);
  await yieldToPaint();

  const colliders = new Colliders();
  colliders.build();
  const anchors = new Anchors(terrain, scene, { buildMs: (TERRAIN_Q[q.id] || TERRAIN_Q.high).anchorMs });

  /*
   * The thermal features and the water (src/maps/yellowstone/thermal/,
   * water/), laid on the finest level loaded: see regions.js for what the
   * engine promises them. Data without thermal.json and hydro.json (the
   * synthetic tiles) builds the terrain alone.
   */
  const heightAt = (x, z) => terrain.finestAt(x, z);
  const [thermalJson, hydroJson] = await Promise.all([optionalJson(base, 'thermal.json', manifest),
    optionalJson(base, 'hydro.json', manifest)]);
  let thermal = null;
  let water = null;
  let regions = null;
  if (thermalJson && hydroJson) {
    const hydro = readHydro(hydroJson);
    thermal = buildThermal({ scene, heightAt, thermal: thermalJson, rivers: hydro.rivers, sunDir: SUN_DIR });
    water = buildWater({
      scene,
      heightAt,
      hydro: hydroJson,
      sunDir: SUN_DIR,
      clock: thermal.env.clock,
      wind: thermal.env.wind,
      warmAt: thermal.warmAt,
      drawnBy: thermal.drawsLake,
    });
    regions = new Regions(terrain, [
      { name: 'thermal', load: (r) => thermal.loadRegion(r), unload: (k) => thermal.unloadRegion(k) },
      { name: 'water', load: (r) => water.loadRegion(r), unload: (k) => water.unloadRegion(k) },
    ]);
    progress(0.9);
    await yieldToPaint();
    /* The basin round the spawn, built behind the loading bar rather than
     * in the first seconds of flight. */
    await regions.settle(look, terrain.frame, () => {});
  }
  const fallsGround = (x, z) => {
    const falls = thermal && thermal.hero('lower-falls');
    return falls && falls.ground ? falls.ground(x, z) : null;
  };

  scene.add(shell.quad);
  renderer.compile(scene, camera);
  progress(1);

  const shadowTexel = q.field.shadowMap > 0 ? (2 * shadowHalf) / q.field.shadowMap : 0;
  const shadowFocus = new THREE.Vector3();
  let fogAlt = -1;
  function updateShadowFocus(target) {
    if (shadowTexel > 0) {
      shadowFocus.set(
        Math.round(target.x / shadowTexel) * shadowTexel,
        Math.round(target.y / shadowTexel) * shadowTexel,
        Math.round(target.z / shadowTexel) * shadowTexel,
      );
    } else {
      shadowFocus.copy(target);
    }
    sun.position.copy(shadowFocus).addScaledVector(SUN_DIR, 260);
    sun.target.position.copy(shadowFocus);
    sun.target.updateMatrixWorld();

    /* The terrain streams round the craft and the camera, then what is
     * anchored to it round the camera. The shell calls this once a frame
     * before it draws, with the craft (or the title's quad) as target. */
    terrain.update(target, camera.position);
    if (regions) {
      regions.update(camera.position, terrain.frame);
    }
    anchors.update(camera.position);

    /* Fog and far plane in fifty metre steps of height, so a hovering
     * craft does not rebuild the projection every frame. */
    const alt = Math.round((camera.position.y - terrain.height(camera.position.x, camera.position.z)) / 50) * 50;
    if (alt !== fogAlt) {
      fogAlt = alt;
      const f = fogFor(alt);
      scene.fog.near = f.near;
      scene.fog.far = f.far;
      camera.far = f.far * 1.05;
      camera.updateProjectionMatrix();
    }
  }

  /*
   * The title shot: a loop round the Upper Geyser Basin two hundred metres
   * over whatever is under it, three kilometres across, so Old Faithful's
   * meadow, the Firehole and the plateau's forest cross the frame. Heights
   * are read from the finest level, which the load fetched round the spawn.
   */
  const attractPath = [];
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    const x = OF.x + Math.sin(a) * 1400;
    const z = OF.z + Math.cos(a) * 1600 - 600;
    let top = -Infinity;
    for (let k = -2; k <= 2; k += 1) {
      top = Math.max(top, terrain.finestAt(x + k * 60, z), terrain.finestAt(x, z + k * 60));
    }
    attractPath.push({ x, y: top + 200, z });
  }

  const AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };
  /* For the harness and the parts that stand on the ground. */
  const placement = {
    groundAt: (x, z) => terrain.finestAt(x, z),
    drawnAt: (x, z) => terrain.height(x, z),
    anchor: (opts) => anchors.add(opts),
  };
  scene.userData.yellowstone = { terrain, anchors, placement, camera, regions, thermal, water };

  const ofY = terrain.finestAt(OF.x, OF.z);
  return {
    id: 'yellowstone',
    name: str('registry.yellowstone'),
    mode: 'freestyle',
    graphics: q.id,
    scene,
    colliders,
    gates: [],
    curve: null,
    spawn,
    notes: [],
    attract: {
      path: attractPath,
      speed: 26,
      lookAhead: 60,
      aimDrop: 20,
    },
    /* The drawn ground, read on the drawn triangles, and over it the
     * water and the Lower Falls' rock step where they are drawn, so a
     * craft lands on what it sees. fromY is taken for the shell's one call
     * shape and ignored: nothing here is a deck a craft could be under. */
    height: (x, z) => {
      let h = terrain.height(x, z);
      const lake = water ? water.surfaceAt(x, z) : null;
      if (lake !== null && lake > h) {
        h = lake;
      }
      const step = fallsGround(x, z);
      return step !== null && step > h ? step : h;
    },
    placement,
    setNextGate() {},
    targetAim: () => AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    updateShadowFocus,
    /* Wall clock: the cel materials' time, which the rivers' riffles and
     * the steam read. Nothing solid moves on it. */
    updateWind(t) {
      updateCelTime(t);
    },
    /* The step clock: eruptions are pure functions of it. */
    updateAnim(step) {
      if (thermal) {
        thermal.updateAnim(step);
        water.updateAnim(step);
      }
    },
    references: {
      extent: {
        measured: 2 * HALF,
        unit: 'm',
        real: '100000',
      },
      oldFaithfulElevation: {
        measured: Math.round(ofY + Y0),
        unit: 'm',
        real: str('references.yellowstone_old_faithful_asl'),
      },
    },
    stats: () => ({
      terrain: terrain.stats(),
      regions: regions ? regions.stats() : null,
      anchors: anchors.stats(),
      synthetic: Boolean(manifest.synthetic),
    }),
    /* The terrain frees its own chunks; the scene graph, with the
     * features and the water still in it, frees the rest, their shared
     * materials included; then the parts free what only they hold. */
    dispose() {
      anchors.dispose();
      terrain.dispose();
      material.dispose();
      grain.dispose();
      scene.userData.yellowstone = null;
      shell.evictSessionRoots(scene);
      disposeSceneGraph(scene, SESSION_TEXTURES);
      if (thermal) {
        thermal.dispose();
        water.dispose();
      }
    },
  };
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  const map = attachComposer(shell, await buildYellowstone(shell, progress, q), q);
  /* The composer promotes every layer 1 occluder into its depth prepass
   * (promoteToPrepass in src/render/post.js), and the far chunks are on
   * layer 1 to stay out of that pass (engine.js). The ones built before it
   * ran are taken back out, so they match the ones built after. */
  map.scene.userData.yellowstone.terrain.group.traverse((o) => {
    if (o.isMesh && !o.layers.isEnabled(0)) {
      o.layers.set(1);
    }
  });
  return map;
}
