/*
 * vegetation/index.js: Itaipu's forests and trees, package G of
 * docs/ITAIPU-PLAN.md (sections 9 and 14).
 *
 * What it builds, from the data folder:
 *
 *   the trees     every tree of the hero, planted from the canopy height
 *                 model, the forest mask and OpenStreetMap (plant.js), and
 *                 drawn round the camera as swiss2 draws its broadleaves
 *                 (draw.js treeLod): the Atlantic forest's remnants and
 *                 the riparian forest, the pastures' lone trees, the
 *                 parks', and eucalyptus where landuse says so;
 *   the canopy    the forest's far drawing, a surface of crowns at the
 *                 model's height (draw.js canopyShell);
 *   the near trees  the trees round the pilot as colliders, a trunk post
 *                 and crown spheres each, in the streamed set
 *                 (`stream`), so what holds a craft is what is drawn;
 *   the volume    canopyAt(x, z), the top of the closed forest there or
 *                 -Infinity, for the contact pass's canopy call (C's hook
 *                 in src/main.js): the hundreds of thousands of trees the
 *                 streamed set cannot hold at once are in the forest all
 *                 the same.
 *
 * THE PART INTERFACE (vegetation's stub had it; unchanged): buildPart(ctx)
 * -> { group, update(stepIndex), dispose(), stats() }, and three optional
 * members the map reads (src/maps/itaipu.js): `stream`, the streamed
 * colliders ({ wants(x, z), fill(list, x, z) }, fill a generator that
 * yields between slices), `canopyAt`, and `view(target, camera)`, once a
 * frame before the draw.
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

import { loadAtlases } from '../../swiss2/vegetation/atlas.js';
import { windUniforms } from '../../swiss2/vegetation/plantmat.js';
import { sunDirection } from '../look/light.js';
import {
  CROWN_SPHERES, DENSE_M, FILL_SLICE_TREES, HALF, KINDS, NEAR_MOVE, NEAR_R,
  addTree, canopyHeight, decodePng, heroCanopy, keepOff, makeCanopyAt, nearTrees, onCut, plantHero,
} from './plant.js';
import {
  TIERS, treeLod, canopyShell, kindCrown,
} from './draw.js';

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`itaipu vegetation: ${url}: HTTP ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* A JPEG's pixels as the pipeline wrote them, no colour management. */
async function jpegPixels(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`itaipu vegetation: ${url}: HTTP ${res.status}`);
  }
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const c2d = canvas.getContext('2d', { willReadFrequently: true });
  c2d.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { w: canvas.width, h: canvas.height, data: c2d.getImageData(0, 0, canvas.width, canvas.height).data };
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/*
 * Each kind's colliders in its model's frame: the trunk post as swiss2's
 * broadleaves have it (the drawn trunk's radius, a tenth over, up to
 * trunk x height) and its crown's inner clumps, the last CROWN_SPHERES of
 * draw.js kindCrown's, which are inside every drawn crown however the
 * craft comes at it, and high enough that the air under the lowest leaves
 * stays air. A palm's are its head's (draw.js kindCrown says where).
 */
function crownsOf() {
  return KINDS.map((v, k) => {
    const c = kindCrown(k);
    return { ...c, clumps: c.clumps.slice(-CROWN_SPHERES) };
  });
}

export async function buildPart(ctx) {
  const { THREE } = ctx;
  const t0 = performance.now();
  const stages = {};
  let tMark = t0;
  const mark = (name) => {
    const now = performance.now();
    stages[name] = Math.round(now - tMark);
    tMark = now;
  };
  const group = new THREE.Group();
  group.name = 'itaipu-vegetation';
  const tier = TIERS[ctx.quality] || TIERS.high;
  const { base, manifest } = ctx;

  /* The level 0 canopy tiles over the hero: HALF from the origin is
   * tiles 2 and 3 each way. */
  const heroTiles = [];
  const t2 = Math.floor((-HALF + 20480) / 7680);
  const t3 = Math.floor((HALF + 20480) / 7680);
  for (let j = t2; j <= t3; j += 1) {
    for (let i = t2; i <= t3; i += 1) {
      heroTiles.push([i, j]);
    }
  }
  const timed = (name, p) => p.then((v) => {
    stages[`${name}At`] = Math.round(performance.now() - t0);
    return v;
  });
  const [maskBytes, colour, atlases, ...tiles] = await Promise.all([
    timed('mask', fetchBytes(`${base}${manifest.imagery.hero.masks}`)),
    timed('colour', jpegPixels(`${base}${manifest.imagery.hero.file}`)),
    timed('atlases', loadAtlases()),
    ...heroTiles.map(([i, j]) => fetchBytes(base + manifest.canopy.path.replace('{i}', i).replace('{j}', j))),
  ]);
  const mask = await decodePng(maskBytes, inflate);
  const byTile = new Map(heroTiles.map(([i, j], k) => [`${i}_${j}`, tiles[k]]));
  const canopy = heroCanopy((i, j) => byTile.get(`${i}_${j}`));
  mark('fetch');
  ctx.progress(0.3);

  const d = ctx.data;
  const off = keepOff({
    water: d['water.json'],
    dam: d['dam.json'],
    roads: d['osm/roads.json'].features,
    buildings: d['osm/buildings.json'].features,
    cut: ctx.cut,
  });
  const forest = plantHero({
    mask,
    canopy,
    ground: ctx.ground,
    landuse: d['osm/landuse.json'].features,
    osmTrees: d['osm/trees.json'].features,
    off,
  });
  mark('planting');
  ctx.progress(0.55);

  const crowns = crownsOf();
  const wind = windUniforms();
  const sunDir = sunDirection();
  const trees = treeLod({
    forest, atlases, tier, group, sunDir, wind,
  });
  mark('models');
  ctx.progress(0.7);

  const white = manifest.imagery.colour.white;
  const colourAt = (x, z) => {
    const i = Math.max(0, Math.min(colour.w - 2, Math.floor((x + HALF) / 10 - 0.5)));
    const j = Math.max(0, Math.min(colour.h - 2, Math.floor((z + HALF) / 10 - 0.5)));
    const out = [0, 0, 0];
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const o = ((j + dj) * colour.w + i + di) * 4;
      for (let c = 0; c < 3; c += 1) {
        out[c] += srgbToLinear(colour.data[o + c] / 255) * white * 0.25;
      }
    }
    return out;
  };
  /* The mask's forest weight alone, for the canopy's outline. */
  const forestWeight = new Uint8Array(mask.w * mask.h);
  for (let k = 0; k < forestWeight.length; k += 1) {
    /* None on the rock cut round the concrete: the canopy's edge face
     * would hang down the cut from the forest on its lip. */
    const x = -HALF + ((k % mask.w) + 0.5) * 10;
    const z = -HALF + (Math.floor(k / mask.w) + 0.5) * 10;
    forestWeight[k] = onCut(off, x, z) ? 0 : mask.data[k * 4];
  }
  /* A canopy vertex stands at the forest's height when any mask texel
   * round it is forest, so the outline the fragment cuts (at the mask's
   * half weight) always has a surface under it. */
  const topAt = (x, z) => {
    const i = Math.floor((x + HALF) / 10);
    const j = Math.floor((z + HALF) / 10);
    let w = 0;
    for (let dj = -1; dj <= 0; dj += 1) {
      for (let di = -1; di <= 0; di += 1) {
        const ii = Math.max(0, Math.min(mask.w - 1, i + di));
        const jj = Math.max(0, Math.min(mask.h - 1, j + dj));
        w = Math.max(w, forestWeight[jj * mask.w + ii]);
      }
    }
    return w >= 128 ? Math.max(DENSE_M, canopyHeight(canopy, x, z)) : -1;
  };
  const shell = canopyShell({
    ground: ctx.ground, topAt, colourAt, forest: forestWeight, tier, group,
  });
  mark('canopy');
  ctx.progress(1);

  /* The near trees in the streamed set: where it was last filled round,
   * how far that set is whole, and how many are in it. */
  const near = {
    x: NaN, z: NaN, reach: 0, trees: 0, colliders: 0, fills: 0,
  };
  const stream = {
    /* A refill once the pilot is past the plan's 400 m, or half way to
     * where a set the budget cut short stops. */
    wants(x, z) {
      const dx = x - near.x;
      const dz = z - near.z;
      const limit = Math.max(near.reach - (NEAR_R - NEAR_MOVE), near.reach / 2);
      return !(dx * dx + dz * dz <= limit * limit);
    },
    * fill(list, x, z) {
      const got = nearTrees(forest, x, z);
      Object.assign(near, {
        x, z, reach: got.reach, trees: got.trees.length, colliders: 0, fills: near.fills + 1,
      });
      for (let i = 0; i < got.trees.length; i += 1) {
        addTree(list, forest, got.trees[i], crowns);
        if ((i + 1) % FILL_SLICE_TREES === 0) {
          yield;
        }
      }
      near.colliders = got.trees.length * (1 + CROWN_SPHERES);
    },
  };

  const canopyAt = makeCanopyAt({
    mask, canopy, ground: ctx.ground, off,
  });
  const buildMs = Math.round(performance.now() - t0);
  return {
    group,
    stream,
    canopyAt,
    /* For scripts/itaipu-canopy-check.js, which finds its trees in the
     * planting and their crowns in the models, as the drawing does. */
    forest,
    crowns,
    near,
    /* The wind on the sim clock, so a replay's leaves move as they did. */
    update(step) {
      wind.uTime.value = step / 1000;
    },
    view(target, camera) {
      trees.update(camera);
      shell.setEye(camera.position);
    },
    dispose() {
      trees.dispose();
      shell.dispose();
      atlases.dispose();
    },
    stats: () => ({
      planted: forest.count,
      kinds: forest.counts,
      near: { ...near },
      drawn: { ...trees.stats },
      canopyTris: shell.tris,
      canopyMeshes: shell.meshes.length,
      modelTris: trees.modelTris,
      crowns: crowns.map((c, k) => ({ kind: KINDS[k].name, lowest: c.lowest, spheres: c.clumps })),
      buildMs,
      stages,
    }),
  };
}
