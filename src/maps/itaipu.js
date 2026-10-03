/*
 * itaipu.js: the Itaipu Dam on the Parana, at real scale.
 * IN DEVELOPMENT: the terrain, the look and the water at its levels. The
 * dam, the town and the forests are parts still to come
 * (docs/ITAIPU-PLAN.md section 14: this is package B, the skeleton).
 *
 * This file is the order things are built in and the contract the shell
 * reads. What it builds from lives in src/maps/itaipu/:
 *
 *   terrain/     the frame, the ground on the terrain engine, and the
 *                gaps between the tiles and that engine closed
 *   look/        swiss2's photographic style over it: the sun, the sky,
 *                the ground's material, the kit and the post chain
 *   dam/, water/, town/, vegetation/
 *                the four parts, each built against one seam (the part
 *                interface, in any of their index.js files)
 *
 * WHERE THE DATA COMES FROM: DATA_BASE on the public site, the data's own repository on GitHub
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
import { Colliders, STREAM_SLICE } from '../game/collide.js';
import { insideWater } from '../game/water.js';
import { disposeSceneGraph } from '../render/shell.js';
import { SESSION_TEXTURES } from '../render/session-textures.js';
import { yieldToPaint } from '../ui/loading.js';
import { qualityFor } from '../render/quality.js';
import { str } from '../strings/index.js';
import { makeRoofs } from './alps/roofs.js';
import { HERO_HALF } from './itaipu/terrain/frame.js';
import { buildTerrain, TERRAIN_Q } from './itaipu/terrain/index.js';
import { conformBound, fillUnder, offCut } from './itaipu/terrain/conform.js';
import { makeLook } from './itaipu/look/index.js';
import { TIMES } from './itaipu/look/light.js';
import {
  buildPart as buildDam, embankmentCrests, embankmentSection, junctionRims,
} from './itaipu/dam/index.js';
import { buildPart as buildWater } from './itaipu/water/index.js';
import { meetBanks, meetDam } from './itaipu/water/meet.js';
import { buildPart as buildTown } from './itaipu/town/index.js';
import { buildPart as buildVegetation } from './itaipu/vegetation/index.js';
import { CREST_SPAWN, makeSpawnFor } from './itaipu/spawns.js';
import { attractPath } from './itaipu/attract.js';
import { damWalls } from '../render/world-audio.js';

/* The one place the public data's address is written. */
export const DATA_BASE = 'https://fdflabs.github.io/fdfpv-itaipu-data/';
const LOCAL_BASE = 'itaipu-data/';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/*
 * The shell's default spawn, the planes' and the quads': the main dam's
 * crest road past the east intake gantry, facing west along it. The floats'
 * and the air start are spawnFor's (itaipu/spawns.js).
 */
const SPAWN = CREST_SPAWN;

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
  ['war', (ctx) => import('./itaipu/war/index.js').then((m) => m.buildPart(ctx)), 0],
];

/*
 * The phases buildItaipu names to its progress callback, in the order it
 * runs them, for the boot screen's rows (src/ui/loading.js mapPhases): the
 * imagery and the data together, the elevation tiles, each part, and the
 * scene's programs compiled.
 */
export const PHASES = ['imagery', 'data', 'heightmaps', ...PARTS.map(([name]) => name), 'shaders'];

/*
 * THE STREAMED COLLIDERS (docs/ITAIPU-PLAN.md sections 7, 9 and 13): what
 * the parts keep only near the pilot (the town's walls, the near trees),
 * in the one streamed set Colliders has (src/game/collide.js
 * streamFill). One set, so one owner: the map starts a refill when any
 * part's stream wants one, every streaming part adds its colliders round
 * the pilot to it, and it advances one slice a frame: a part's fill (a
 * generator) to its next yield, then one StreamFill.step at a time. Until
 * the step that swaps it in, the set before it is the one in force, whole.
 *
 * A part's stream is { wants(x, z), fill(list, x, z), swapped(offset) }:
 * wants says the pilot has left what the part's set covers, fill adds
 * the part's colliders round (x, z) to `list`, yielding between slices
 * of its work, and swapped, if the part has it, is called on the slice
 * that swaps the set in, with the offset (colliders.staticCount) that
 * turns an index `list` gave into the collider's index in the map (the
 * town's roofs name the walls under them this way).
 *
 * Before each step the roofs' cover is lifted (`uncover`): the step that
 * swaps renumbers every streamed collider, and the pass flags the cover
 * set on the walls under a roof would name other colliders after it. The
 * obstacle pass sets the cover again from the craft before its next sweep
 * (src/main.js).
 */
/* Cell entries a refill's step writes here: half collide.js's measured
 * STREAM_SLICE, because a step also freezes the set it starts on, and a
 * step at the full slice ran to 2.8 ms in the page while the JIT was
 * cold (scripts/itaipu-canopy-check.js). */
const STEP_ENTRIES = STREAM_SLICE / 2;

function makeStreamer(colliders, parts, uncover) {
  const streams = parts.map((p) => p.stream).filter(Boolean);
  let fill = null;
  let adds = [];
  let frames = 0;
  const stats = {
    refills: 0, frames: 0, maxSliceMs: 0, lastSlicesMs: [],
  };
  const begin = (x, z) => {
    fill = colliders.streamFill();
    adds = streams.map((s) => s.fill(fill, x, z));
    frames = 0;
    stats.lastSlicesMs = [];
  };
  /* One slice of the refill in progress; true on the one that swapped
   * the new set in. */
  const slice = () => {
    frames += 1;
    if (adds.length) {
      if (adds[0].next().done) {
        adds.shift();
      }
      return false;
    }
    uncover();
    if (!fill.step(STEP_ENTRIES)) {
      return false;
    }
    fill = null;
    for (const s of streams) {
      if (s.swapped) {
        s.swapped(colliders.staticCount);
      }
    }
    stats.refills += 1;
    stats.frames = frames;
    return true;
  };
  return {
    stats,
    /* At load, round the spawn, all at once. */
    fillNow(x, z) {
      if (!streams.length) {
        return;
      }
      begin(x, z);
      while (!slice()) {
        /* Each slice is bounded; the loop ends when the set is in. */
      }
    },
    /* Once a frame, with the pilot. */
    update(x, z) {
      if (!fill) {
        if (!streams.some((s) => s.wants(x, z))) {
          return;
        }
        begin(x, z);
      }
      const t0 = performance.now();
      slice();
      const ms = performance.now() - t0;
      stats.lastSlicesMs.push(Math.round(ms * 100) / 100);
      stats.maxSliceMs = Math.max(stats.maxSliceMs, ms);
    },
  };
}

/*
 * LOCAL_BASE is beside the site's index.html, which is two levels above
 * this module, not beside whatever page loaded it: the title's world
 * previews build the map inside src/share/orbit.html, where a page
 * relative path asked for src/share/itaipu-data/ and got a 404.
 * ?itdata= is the page's own, so it stays relative to the page.
 */
export function dataBase() {
  const loc = window.location;
  const param = new URLSearchParams(loc.search).get('itdata');
  const url = param ? new URL(param, document.baseURI).href
    : LOCAL_HOSTS.has(loc.hostname) ? new URL(`../../${LOCAL_BASE}`, import.meta.url).href
      : DATA_BASE;
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

/* The middle of the town's buildings, for its murmur: their mean, on the
 * ground there. */
function townMiddle(buildings, terrain) {
  let x = 0;
  let z = 0;
  for (const b of buildings) {
    x += b.x;
    z += b.z;
  }
  x /= Math.max(1, buildings.length);
  z /= Math.max(1, buildings.length);
  return { kind: 'townhum', x, y: terrain.height(x, z) + 10, z };
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

async function buildItaipu(shell, progress, q, time) {
  const renderer = shell.renderer;
  const camera = shell.camera;
  const base = dataBase();
  const manifest = await readManifest(base);
  progress(0.02, ['imagery', 'data']);
  const [look, data] = await Promise.all([
    makeLook({
      renderer, camera, q, base, manifest, time,
    }),
    readData(base, manifest),
  ]);
  /* The water brought to the dam's faces (water/meet.js) before anything
   * reads it, so the drawn sheet and the plant's lake are one outline. */
  data['water.json'] = meetDam(data['water.json'], data['dam.json']);
  const { scene } = look;
  progress(0.2, 'heightmaps');
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
    /* The ground cut to the concrete where they meet, and filled under
     * the embankments' crests (terrain/conform.js), before any part or
     * the plant reads it. */
    shape: {
      bound: conformBound(junctionRims(data['dam.json']), embankmentCrests(data['dam.json'])),
      fill: fillUnder(embankmentSection(data['dam.json'])),
    },
    progress: (f) => progress(0.2 + 0.5 * f),
  });
  /* The ground the parts place on and the plant stands on near the
   * craft: the finest level, which is what the engine draws wherever it
   * can draw 10 m. */
  const ground = (x, z) => terrain.finestAt(x, z);
  /* The plant's water is meetDam's outline, within its 256 corners a
   * body; what the parts draw is also brought to the banks
   * (water/meet.js meetBanks), on the ground as cut. */
  const plantWater = data['water.json'];
  data['water.json'] = meetBanks(plantWater, data['dam.json'], ground, HERO_HALF);
  /* No building over the cut (terrain/conform.js offCut), for every part
   * that reads the buildings. */
  const overCut = offCut(data['osm/buildings.json'].features, terrain.cut);
  data['osm/buildings.json'] = { ...data['osm/buildings.json'], features: overCut.kept };
  progress(0.7);
  await yieldToPaint();

  const colliders = new Colliders();
  const roofRecords = [];
  const parts = {};
  let done = 0;
  for (const [name, build, share] of PARTS) {
    const at = done;
    progress(0.7 + 0.2 * at, name);
    parts[name] = await build({
      THREE,
      scene,
      quality: q.id,
      data,
      base,
      manifest,
      ground,
      cut: terrain.cut,
      /* The terrain's own material, for what the dam draws as the bank
       * (its embankments' wet edges and toes). */
      groundMaterial: look.ground,
      colliders,
      roofs: roofRecords,
      mats: look.mats,
      /* The look's sun, which is the time of day's: what a part lights or
       * shadows by hand (the vegetation's impostors) takes it here rather
       * than the day's from light.js. */
      sunDir: look.sunDir,
      progress: (f) => progress(0.7 + 0.2 * (at + share * Math.max(0, Math.min(1, f)))),
    });
    scene.add(parts[name].group);
    done += share;
    await yieldToPaint();
  }
  colliders.build();
  /* Mission 4's fixtures (look/night.js), a no-op by day: from the
   * town's model (its buildings, towers and dressed road's lamps), its
   * roads and substations, the dam's powerhouse, and what the parts drew
   * (the dam's lamps, the town's walls), never their geometry itself. */
  look.dressNight({
    ground,
    half: HERO_HALF,
    roads: data['osm/roads.json'].features,
    substations: data['osm/power.json'].substations,
    town: parts.town.town,
    powerhouse: data['dam.json'].find((p) => p.part === 'powerhouse') ?? null,
  });
  const roofs = makeRoofs(roofRecords);
  const streamer = makeStreamer(colliders, Object.values(parts), () => roofs.cover(colliders, 0, 0, -Infinity));
  streamer.fillNow(SPAWN.x, SPAWN.z);
  /* The forest volume (section 9): the highest canopy any part answers
   * for, for the contact pass's canopy call (src/main.js). */
  const canopies = Object.values(parts).map((p) => p.canopyAt).filter(Boolean);
  const canopyAt = canopies.length
    ? (x, z) => {
      let top = -Infinity;
      for (const c of canopies) {
        top = Math.max(top, c(x, z));
      }
      return top;
    }
    : undefined;
  look.setHeights(ground, HERO_HALF, 10);
  look.finish();
  progress(0.93, 'shaders');

  const bodies = plantWater;
  const lakes = lakesOf(bodies, ground);
  /* The drawn ground, and over the water its still surface, so a craft
   * rests on the water it sees whether or not
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

  scene.add(shell.quad);
  renderer.compile(scene, camera);
  progress(1);

  const AIM = { active: false, sceneIndex: -1, correct: true, distance: 0 };
  scene.userData.itaipu = {
    /* The water as drawn and the buildings not built over the cut, for
     * scripts/itaipu-check.js edges. */
    terrain, camera, parts, look, stream: streamer.stats, water: data['water.json'],
    offCut: overCut.dropped.map((f) => f.id),
  };
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
    spawnFor: makeSpawnFor(SPAWN, lakes),
    notes: [],
    attract: {
      /* Over the roofs too: the dam's crest is one. */
      path: attractPath((x, z) => roofs.height(x, z, Infinity, wet(x, z))),
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
    /* The plant's waves on them, for the water part to draw
     * (src/render/lakewaves.js). */
    setWaves: (bodies) => parts.water.setWaves(bodies),
    updateWaves: (t) => parts.water.updateWaves(t),
    /* The concrete faces an explosion's sound echoes off
     * (src/render/world-audio.js damWalls). */
    audioWalls: damWalls(data['dam.json']),
    /* The world's sound's ambience (src/render/world-audio.js): the
     * spillway's roar where its jets come down, the town's murmur from its
     * middle; and the power lines, whose nearest point hums. */
    audioBeds: [
      ...parts.water.plunges.map((p) => ({ kind: 'spillway', x: p.x, y: p.y + 4, z: p.z })),
      townMiddle(parts.town.town.buildings, terrain),
    ],
    audioLines: parts.town.town.wires,
    /* The war mode's targets and their damage, the dam part's
     * (docs/WARFARE-PLAN.md section 8). */
    targets: parts.dam.targets,
    /* A method, so a later part that replaces map.targets (the war part's
     * yard) has its entries burn where they say. */
    setTargetState(id, state) {
      return parts.dam.setTargetState(id, state, this.targets);
    },
    /* The night raid's lights, district by district (src/share/war/grid.js
     * levels, from the room's war state): nothing by day. */
    setPower: (levels) => look.setPower(levels),
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
      streamer.update(target.x, target.z);
      for (const p of Object.values(parts)) {
        if (p.view) {
          p.view(target, camera);
        }
      }
    },
    canopyAt,
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
      colliders: colliders.stats(),
      stream: streamer.stats,
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

/*
 * The look's time of day: `options.time` (one of look/light.js TIMES:
 * 'day', the default, 'morning', 'noon', 'golden', or 'night', for
 * mission 4, "Night raid"), or `?time=` in the address, which
 * src/main.js's loadMap folds into options before this is called.
 * Anything else is day: a stray query param must never turn the lights
 * off on a pilot who typed the wrong thing.
 */
function timeFor(options) {
  const time = options && options.time;
  return typeof time === 'string' && Object.hasOwn(TIMES, time) ? time : 'day';
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const q = qualityFor(options && options.quality);
  const map = await buildItaipu(shell, progress, q, timeFor(options));
  (await import('./itaipu/war/index.js')).takeYard(map);
  return map.scene.userData.itaipu.look.compose(shell, map);
}
