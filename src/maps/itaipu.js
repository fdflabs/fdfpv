/*
 * itaipu.js: the Itaipu Dam on the Parana, at real scale.
 * IN DEVELOPMENT: the terrain, the look and the water at its levels. The
 * dam, the town and the forests are parts still to come
 * (docs/ITAIPU-PLAN.md section 14: this is package B, the skeleton).
 *
 * This file is the order things are built in and the contract the shell
 * reads. What it builds from lives in src/maps/itaipu/:
 *
 *   terrain/     the frame, the ground on Yellowstone's engine, and the
 *                gaps between the tiles and that engine closed
 *   look/        swiss2's photographic style over it: the sun, the sky,
 *                the ground's material, the kit and the post chain
 *   dam/, water/, town/, vegetation/
 *                the four parts, each built against one seam (the part
 *                interface, in any of their index.js files)
 *
 * WHERE THE DATA COMES FROM, as Yellowstone's does (src/maps/yellowstone.js):
 * DATA_BASE on the public site, the data's own repository on GitHub
 * Pages, and on a page served from this machine LOCAL_BASE beside it,
 * which scripts/serve.js and tests/lib/server.js serve from the folder
 * FDFPV_ITAIPU_DATA names, by default ~/Desktop/fdfpv-itaipu-data, the
 * pipeline's output. `?itdata=URL` overrides both.
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
import { insideWater } from '../game/water.js';
import { disposeSceneGraph } from '../render/shell.js';
import { SESSION_TEXTURES } from '../render/session-textures.js';
import { yieldToPaint } from '../ui/loading.js';
import { qualityFor } from '../render/quality.js';
import { str } from '../strings/index.js';
import { makeRoofs } from './alps/roofs.js';
import { HERO_HALF, LANDMARKS } from './itaipu/terrain/frame.js';
import { buildTerrain, TERRAIN_Q } from './itaipu/terrain/index.js';
import { makeLook } from './itaipu/look/index.js';
import { buildPart as buildDam } from './itaipu/dam/index.js';
import { buildPart as buildWater } from './itaipu/water/index.js';
import { buildPart as buildTown } from './itaipu/town/index.js';
import { buildPart as buildVegetation } from './itaipu/vegetation/index.js';

/* The one place the public data's address is written. */
export const DATA_BASE = 'https://fdflabs.github.io/fdfpv-itaipu-data/';
const LOCAL_BASE = 'itaipu-data/';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/*
 * The shell's default spawn: the Brazilian viewpoint below the dam, facing
 * the crest (section 10's quad spawn), which is where the dam fills the
 * view at takeoff. Package H confirms every spawn on the running shell and
 * adds the others.
 */
const SPAWN = { x: LANDMARKS.mirante.x, z: LANDMARKS.mirante.z, yaw: 0.265 };

/* The breeze on the water, for the plant's waves once the shell declares
 * this map's water (src/game/water.js): light air from the north east,
 * which crosses the reservoir's longest reach (water.json's fetch). */
const WIND = { speed: 2, fromDeg: 45 };

/* The parts, in the order the plan merges them, each with its share of
 * the loading bar's parts stage. */
const PARTS = [
  ['dam', buildDam, 0.4],
  ['water', buildWater, 0.1],
  ['town', buildTown, 0.3],
  ['vegetation', buildVegetation, 0.2],
];

export function dataBase() {
  const loc = window.location;
  const param = new URLSearchParams(loc.search).get('itdata');
  const fallback = LOCAL_HOSTS.has(loc.hostname) ? LOCAL_BASE : DATA_BASE;
  const url = new URL(param || fallback, document.baseURI).href;
  return url.endsWith('/') ? url : `${url}/`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`itaipu: ${url}: HTTP ${res.status}`);
  }
  return res.json();
}

async function readManifest(base) {
  try {
    return await fetchJson(`${base}manifest.json`);
  } catch (e) {
    throw new Error(`itaipu: no manifest at ${base}manifest.json (${e.message}); `
      + `serve the data folder there or pass ?itdata=${DATA_BASE}`);
  }
}

/* Every JSON file the manifest lists, parsed, by its path. */
async function readData(base, manifest) {
  const names = Object.keys(manifest.files).filter((n) => n.endsWith('.json'));
  const parsed = await Promise.all(names.map((n) => fetchJson(`${base}${n}`)));
  return Object.fromEntries(names.map((n, k) => [n, parsed[k]]));
}

/* The water bodies in src/game/water.js's lake form, for the plant, over
 * `bed` the ground under them. */
function lakesOf(bodies, bed) {
  return bodies.map((b) => {
    const outline = b.outline.map(([x, z]) => ({ x, z }));
    const from = String(WIND.fromDeg);
    const to = THREE.MathUtils.degToRad(WIND.fromDeg + 180);
    return {
      kind: 'lake',
      name: b.name,
      surfaceY: b.y,
      outline,
      bed,
      centre: { x: b.spawn.x, z: b.spawn.z },
      spawn: { x: b.spawn.x, z: b.spawn.z, yaw: b.spawn.yaw },
      wind: {
        speed: WIND.speed, toX: Math.sin(to), toZ: -Math.cos(to), fetch: b.fetch[from],
      },
    };
  });
}

async function buildItaipu(shell, progress, q) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  const base = dataBase();
  const manifest = await readManifest(base);
  progress(0.02);
  const [look, data] = await Promise.all([
    makeLook({
      renderer, camera, q, base, manifest,
    }),
    readData(base, manifest),
  ]);
  const { scene } = look;
  progress(0.2);
  await yieldToPaint();

  const spawnAt = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  const eye = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  const terrain = await buildTerrain({
    base,
    manifest,
    material: look.ground,
    scene,
    quality: TERRAIN_Q[q.id] || TERRAIN_Q.high,
    spawn: spawnAt,
    eye,
    progress: (f) => progress(0.2 + 0.5 * f),
  });
  /* The ground the parts place on and the plant stands on near the
   * craft: the finest level, which after terrain/reconcile.js is what the
   * engine draws wherever it can draw 10 m. */
  const ground = (x, z) => terrain.finestAt(x, z);
  progress(0.7);
  await yieldToPaint();

  const colliders = new Colliders();
  const roofRecords = [];
  const parts = {};
  let done = 0;
  for (const [name, build, share] of PARTS) {
    const at = done;
    parts[name] = await build({
      THREE,
      scene,
      quality: q.id,
      data,
      base,
      manifest,
      ground,
      colliders,
      roofs: roofRecords,
      mats: look.mats,
      progress: (f) => progress(0.7 + 0.2 * (at + share * Math.max(0, Math.min(1, f)))),
    });
    scene.add(parts[name].group);
    done += share;
    await yieldToPaint();
  }
  colliders.build();
  const roofs = makeRoofs(roofRecords);
  look.setHeights(ground, HERO_HALF, 10);
  look.finish();
  progress(0.93);

  const bodies = data['water.json'];
  const lakes = lakesOf(bodies, ground);
  /* The drawn ground, and over the water its still surface, so a craft
   * rests on the water it sees (as on Yellowstone's lakes) whether or not
   * the shell has declared the bodies to the plant; then the roofs, the
   * highest within a step of fromY (alps/roofs.js). */
  const wet = (x, z) => {
    const h = terrain.height(x, z);
    for (const l of lakes) {
      if (l.surfaceY > h && insideWater(l, x, z)) {
        return l.surfaceY;
      }
    }
    return h;
  };

  /* The title shot: a loop round the dam two kilometres out and 250 m over
   * the highest ground near each point, so the crest, the spillway and the
   * reservoir all cross the frame. */
  const attractPath = [];
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    const x = LANDMARKS.crest.x + Math.sin(a) * 2400;
    const z = LANDMARKS.crest.z + Math.cos(a) * 2000;
    let top = -Infinity;
    for (let k = -2; k <= 2; k += 1) {
      top = Math.max(top, wet(x + k * 60, z), wet(x, z + k * 60));
    }
    attractPath.push({ x, y: top + 250, z });
  }

  scene.add(shell.quad);
  renderer.compile(scene, camera);
  progress(1);

  const AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };
  scene.userData.itaipu = { terrain, camera, parts, look };
  return {
    id: 'itaipu',
    name: str('registry.itaipu'),
    mode: 'freestyle',
    graphics: q.id,
    scene,
    colliders,
    gates: [],
    curve: null,
    spawn: SPAWN,
    notes: [],
    attract: {
      path: attractPath,
      speed: 30,
      lookAhead: 80,
      aimDrop: 40,
    },
    height: (x, z, fromY) => roofs.height(x, z, fromY, wet(x, z)),
    cover: (x, z, fromY) => roofs.cover(colliders, x, z, fromY),
    roofs: roofs.records,
    roofTop: (i, x, z) => roofs.top(i, x, z),
    coveredAt: (x, z, fromY) => roofs.covered(x, z, fromY),
    roofSlabs: (x, z, fromY, reach, out) => roofs.slabs(x, z, fromY, reach, out),
    surfaceAt: (x, z, y) => (y == null ? null : roofs.materialAt(x, z, y)),
    /* The reservoir and the river in src/game/water.js's lake form, for
     * the shell to declare to the plant (package C's water host). */
    lakes,
    setNextGate() {},
    targetAim: () => AIM,
    approachSide: () => null,
    hasRacingLine: false,
    setRacingLine() {},
    updateRacingLine() { return null; },
    /* Once a frame before the draw, with the craft (or the title's quad):
     * the sun's shadow maps round it, and the terrain's selection round it
     * and the camera. */
    updateShadowFocus(target) {
      look.updateShadowFocus(target);
      terrain.update(target, camera.position);
    },
    updateWind() {},
    updateAnim(step) {
      for (const p of Object.values(parts)) {
        p.update(step);
      }
    },
    references: {
      reservoirLevel: {
        measured: bodies[0].y,
        unit: 'm',
        real: '220.3',
      },
    },
    stats: () => ({
      terrain: terrain.stats(),
      reconciled: terrain.reconciled,
      colliders: colliders.stats(),
      parts: Object.fromEntries(Object.entries(parts).map(([n, p]) => [n, p.stats()])),
    }),
    /* The terrain frees its chunks and leaves the scene; the graph frees
     * the parts' meshes and the kit they used; then what neither reaches. */
    dispose() {
      terrain.dispose();
      scene.userData.itaipu = null;
      shell.evictSessionRoots(scene);
      disposeSceneGraph(scene, SESSION_TEXTURES);
      for (const p of Object.values(parts)) {
        p.dispose();
      }
      look.dispose();
    },
  };
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  const map = await buildItaipu(shell, progress, q);
  return map.scene.userData.itaipu.look.compose(shell, map);
}
