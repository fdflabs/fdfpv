/*
 * world-layer-selftest.js: each map's shared world is the ground the page
 * reads and the ground the room flies: the valley's
 * (src/share/valley/world.js) for alps and swiss2, Itaipu's
 * (src/share/itaipu/world.js) and the Interior's
 * (src/share/interior/world.js).
 *
 *     node scripts/world-layer-selftest.js --three=DIR
 *
 * DIR is an unpacked three@0.160.0 npm package (as weather-surface-build.js
 * and collide-audit-air.js take it): the page's terrain and nature modules
 * import three, and they are run here in Node.
 *
 * The page. src/maps/alps.js lays its roofs over World.groundAt and reads
 * World.surfaceAt, so the page's ground is the module's by construction;
 * this holds alps.js to that, by its source, and holds what the page
 * draws to the World: the far range's mesh (alps/terrain.js farRange) at
 * every vertex, and the headwall's (alps/nature.js buildHeadwall) at
 * every vertex, so what a craft meets is what is drawn.
 *
 * The room. edge/rooms/grounds.js groundOf must equal World.groundAt at
 * every sample of a fixed grid (Object.is), and a room ground off by a
 * centimetre must fail the same comparison (the negative control).
 *
 * The streamed maps. Their pages hold two grounds: the drawn level
 * (terrain.height), which follows the camera, and the finest
 * (terrain.finestAt), which every screen reads the same and the page
 * stands its parts, spawn and debris on (floorAt). The room's is the
 * finest. The page's own buildTerrain is run here in Node, on the same
 * files, and groundOf must equal its terrain.finestAt at every sample
 * over the map's whole square, with the same negative control; outside
 * the square the room's Itaipu ground throws rather than guess the
 * apron. Itaipu's data is its own repository: FDFPV_ITAIPU_DATA names
 * the folder, and without it this fails (a skip is not a pass).
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const threeArg = process.argv.find((a) => a.startsWith('--three='));
if (!threeArg) {
  throw new Error('world-layer: --three=DIR (an unpacked three@0.160.0 npm package) is needed');
}
const base = pathToFileURL(`${threeArg.slice(8).replace(/\/$/, '')}/`).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === 'three') return { url: '${base}build/three.module.js', shortCircuit: true };
    if (spec.startsWith('three/addons/')) return { url: '${base}examples/jsm/' + spec.slice(13), shortCircuit: true };
    return next(spec, ctx);
  }`)}`);

const THREE = await import('three');
const { HALF, farRange } = await import('../src/maps/alps/terrain.js');
const { buildHeadwall } = await import('../src/maps/alps/nature.js');
const { makeValleyWorld } = await import('../src/share/valley/world.js');
const { groundOf } = await import('../edge/rooms/grounds.js');
const ITAIPU_TERRAIN = await import('../src/maps/itaipu/terrain/index.js');
const INTERIOR_TERRAIN = await import('../src/maps/interior/terrain.js');
const { conformBound, fillUnder } = await import('../src/maps/itaipu/terrain/conform.js');
const { embankmentCrests, embankmentSection, junctionRims } = await import('../src/maps/itaipu/dam/index.js');
const { ITAIPU_FRAME } = await import('../src/maps/itaipu/terrain/frame.js');
const { HERO, tileSizeOf } = await import('../src/maps/terrain/frame.js');
const { itaipuDataDir } = await import('../src/share/itaipu/node.js');
const { makeWorld } = await import('../src/share/interior/world.js');
const { readWorldBytes } = await import('../src/share/interior/node.js');
const { HALF: INTERIOR_HALF } = await import('../src/share/interior/frame.js');

let failed = false;
const fail = (msg) => {
  failed = true;
  console.log(`FAIL ${msg}`);
};
const check = (ok, okMsg, failMsg) => (ok ? console.log(`ok ${okMsg}`) : fail(failMsg));

/* alps.js by its source: the World built for the style, its far grid
 * drawn, its ground under the roofs and its material under theirs, and
 * no ground composed beside it. */
const alpsSrc = readFileSync(new URL('../src/maps/alps.js', import.meta.url), 'utf8');
const swissSrc = readFileSync(new URL('../src/maps/swiss2.js', import.meta.url), 'utf8');
const wiring = [
  'const world = makeValleyWorld(style.id);',
  'const far = farRange(world.far, style.look);',
  'roofs.height(x, z, fromY, world.groundAt(x, z))',
  '?? world.surfaceAt(x, z),',
];
const missing = wiring.filter((w) => !alpsSrc.includes(w));
/* A ground composed beside the World's, or a style's own field. */
const beside = [
  ...[/far\.height\(/, /groundZone\(/, /nature\.ground/, /style\.heightfield/].filter((re) => re.test(alpsSrc)),
  ...[/heightfield:/].filter((re) => re.test(swissSrc)),
];
check(missing.length === 0 && beside.length === 0,
  'alps.js reads its ground and material from the World and composes none of its own',
  `alps.js wiring: missing ${JSON.stringify(missing)}, a ground of its own ${beside.map(String).join(' ')}`);

/* The grid. Integer steps from -HALF, so the field's edge (|x| = 3000) and
 * the strip's (|x| = 6, |z| = 80) fall on samples. Over the field every
 * 2 m; beyond it to the far range's edge every 50 m; over the headwall
 * every 0.25 m, half its 0.5 m grid, so its cells, partial cells and edges
 * are all sampled. */
const FIELD_STEP = 2;
const FAR_STEP = 50;
const FAR_EDGE = 12000;
const WALL_STEP = 0.25;
/* The headwall's plan padded by ten metres: its grid holds the wall from
 * x 828 to 948.5 and z -1726 to -865.5 (measured 2026-10-10 off
 * buildHeadwall's height on a 0.5 m sweep). */
const WALL_BOX = { x0: 818, x1: 960, z0: -1736, z1: -856 };
const inBox = (x, z) => x >= WALL_BOX.x0 && x <= WALL_BOX.x1 && z >= WALL_BOX.z0 && z <= WALL_BOX.z1;

/* Each sample once, tagged with where it is. */
function* samples() {
  for (let x = -HALF; x <= HALF; x += FIELD_STEP) {
    for (let z = -HALF; z <= HALF; z += FIELD_STEP) {
      if (!inBox(x, z)) {
        yield [x, z, 'inField'];
      }
    }
  }
  for (let x = -FAR_EDGE; x <= FAR_EDGE; x += FAR_STEP) {
    for (let z = -FAR_EDGE; z <= FAR_EDGE; z += FAR_STEP) {
      if (Math.abs(x) > HALF || Math.abs(z) > HALF) {
        yield [x, z, 'beyond'];
      }
    }
  }
  for (let x = WALL_BOX.x0; x <= WALL_BOX.x1; x += WALL_STEP) {
    for (let z = WALL_BOX.z0; z <= WALL_BOX.z1; z += WALL_STEP) {
      yield [x, z, 'headwall'];
    }
  }
}

/* Where `room` and the world's ground disagree, by part of the grid. */
function roomGap(room, world) {
  const part = () => ({ n: 0, differ: 0, max: 0, at: null });
  const gap = { headwall: part(), inField: part(), beyond: part() };
  for (const [x, z, where] of samples()) {
    const g = gap[where];
    const r = room(x, z);
    const w = world.groundAt(x, z);
    g.n += 1;
    if (!Object.is(r, w)) {
      g.differ += 1;
      const d = Math.abs(r - w);
      if (!(d <= g.max)) {
        g.max = d;
        g.at = [x, z];
      }
    }
  }
  return gap;
}

const look = { parts: () => new THREE.MeshBasicMaterial() };

for (const map of ['alps', 'swiss2']) {
  const t0 = Date.now();
  const world = makeValleyWorld(map);
  const built = Date.now() - t0;

  /* The far range as drawn: every vertex of its mesh stands on the
   * World's ground there. */
  const far = farRange(world.far, look);
  const pos = far.mesh.geometry.getAttribute('position');
  let farOff = 0;
  for (let k = 0; k < pos.count; k += 1) {
    if (!Object.is(pos.getY(k), world.far.height(pos.getX(k), pos.getZ(k)))) {
      farOff += 1;
    }
  }
  check(farOff === 0 && far.height === world.far.height,
    `${map}: the far range's ${pos.count} drawn vertices stand on the World's far grid`,
    `${map}: ${farOff} of ${pos.count} far range vertices off the World's grid`);

  /* The headwall as drawn: the alps' mesh is the World's triangles, in
   * order; swiss2 has none. */
  if (world.headwall) {
    let mesh = null;
    buildHeadwall({ scene: { add(o) { mesh = o; } }, look, world });
    const drawn = mesh.geometry.getAttribute('position').array;
    const want = Float32Array.from(world.headwall.pos);
    let wallOff = drawn.length === want.length ? 0 : Math.max(drawn.length, want.length);
    for (let k = 0; k < Math.min(drawn.length, want.length); k += 1) {
      if (!Object.is(drawn[k], want[k])) {
        wallOff += 1;
      }
    }
    check(wallOff === 0 && mesh.name === 'headwall',
      `${map}: the headwall's ${want.length / 9} drawn triangles are the World's`,
      `${map}: ${wallOff} headwall coordinates drawn off the World's`);
  } else {
    check(map === 'swiss2', `${map}: no headwall, as its nature draws none`, `${map}: the World has no headwall`);
  }

  /* The room: its ground is the World's, everywhere on the grid. */
  const t1 = Date.now();
  const gap = roomGap(groundOf(map), world);
  const ms = Date.now() - t1;
  for (const [where, g] of Object.entries(gap)) {
    check(g.differ === 0,
      `${map}: the room's ground is the World's, ${where}, at ${g.n} samples`,
      `${map}: the room's ground differs from the World's, ${where}, at ${g.differ} of ${g.n}`
        + ` (${(100 * g.differ / g.n).toFixed(2)}%), max ${g.max.toFixed(2)} m at ${JSON.stringify(g.at)}`);
  }
  console.log(`  ${map}: World built in ${built} ms, room compared in ${ms} ms`);

  /* The negative control: a room ground a centimetre off is caught. */
  const bent = roomGap((x, z) => world.groundAt(x, z) + 0.01, world);
  const caught = Object.values(bent).every((g) => g.differ === g.n);
  check(caught, `${map}: negative control caught (a room ground 1 cm off differs at every sample)`,
    `${map}: negative control not caught (${JSON.stringify(Object.values(bent).map((g) => g.differ))})`);
}

/* The streamed maps. Each sample of `grid` (a generator of [x, z, part])
 * once: where `room` and `page` disagree, by part. */
function streamedGap(grid, room, page) {
  const gap = {};
  for (const [x, z, where] of grid()) {
    gap[where] ??= { n: 0, differ: 0, max: 0, at: null };
    const g = gap[where];
    const r = room(x, z);
    const p = page(x, z);
    g.n += 1;
    if (!Object.is(r, p)) {
      g.differ += 1;
      const d = Math.abs(r - p);
      if (!(d <= g.max)) {
        g.max = d;
        g.at = [x, z];
      }
    }
  }
  return gap;
}

function streamedCheck(map, grid, room, page) {
  const t0 = Date.now();
  const gap = streamedGap(grid, room, page);
  const ms = Date.now() - t0;
  for (const [where, g] of Object.entries(gap)) {
    check(g.n > 0 && g.differ === 0,
      `${map}: the room's ground is the page's finest, ${where}, at ${g.n} samples`,
      `${map}: the room's ground differs from the page's finest, ${where}, at ${g.differ} of ${g.n}`
        + ` (${(100 * g.differ / g.n).toFixed(2)}%), max ${g.max.toFixed(2)} m at ${JSON.stringify(g.at)}`);
  }
  console.log(`  ${map}: room compared in ${ms} ms`);
  const bent = streamedGap(grid, (x, z) => room(x, z) + 0.01, page);
  const caught = Object.values(bent).every((g) => g.differ === g.n);
  check(caught, `${map}: negative control caught (a room ground 1 cm off differs at every sample)`,
    `${map}: negative control not caught (${JSON.stringify(Object.values(bent).map((g) => g.differ))})`);
}

/* A file server for the page's tile store, from a folder on disk. */
function filesFetch(dir) {
  return async (url) => {
    const buf = readFileSync(`${dir}/${url.slice('files/'.length)}`);
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
}

const quiet = () => {};
const pageScene = () => ({ material: new THREE.MeshBasicMaterial(), scene: new THREE.Scene() });

/* Itaipu. itaipu.js hands buildTerrain the dam's shape and reads its
 * ground as the terrain's finest; this builds it the same way. */
const itaipuSrc = readFileSync(new URL('../src/maps/itaipu.js', import.meta.url), 'utf8');
const itaipuWiring = [
  'bound: conformBound(junctionRims(data[\'dam.json\']), embankmentCrests(data[\'dam.json\'])),',
  'fill: fillUnder(embankmentSection(data[\'dam.json\'])),',
  'const ground = (x, z) => terrain.finestAt(x, z);',
  'floorAt: (x, z, fromY) => roofs.height(x, z, fromY, ground(x, z)),',
];
const itaipuMissing = itaipuWiring.filter((w) => !itaipuSrc.includes(w));
check(itaipuMissing.length === 0, 'itaipu.js conforms its terrain to the dam and reads its ground as the finest',
  `itaipu.js wiring missing ${JSON.stringify(itaipuMissing)}`);

const itaipuData = itaipuDataDir();
if (!existsSync(`${itaipuData}/manifest.json`)) {
  fail(`itaipu: no data folder at ${itaipuData} (FDFPV_ITAIPU_DATA); a skip is not a pass`);
} else {
  const manifest = JSON.parse(readFileSync(`${itaipuData}/manifest.json`, 'utf8'));
  const dam = JSON.parse(readFileSync(`${itaipuData}/dam.json`, 'utf8'));
  const realFetch = globalThis.fetch;
  globalThis.fetch = filesFetch(itaipuData);
  const at = new THREE.Vector3(0, 0, 0);
  const t0 = Date.now();
  const terrain = await ITAIPU_TERRAIN.buildTerrain({
    base: 'files/',
    manifest,
    ...pageScene(),
    quality: ITAIPU_TERRAIN.TERRAIN_Q.high,
    spawn: at,
    eye: at.clone(),
    shape: {
      bound: conformBound(junctionRims(dam), embankmentCrests(dam)),
      fill: fillUnder(embankmentSection(dam)),
    },
    progress: quiet,
  });
  globalThis.fetch = realFetch;
  const stats = terrain.store.stats();
  const listed = manifest.levels.reduce((n, l) => n + l.grid * l.grid, manifest.hero.tiles.length);
  check(stats.evicted === 0 && stats.tiles === listed, `itaipu: the page's terrain holds all ${listed} listed tiles, none evicted`,
    `itaipu: the page's terrain holds ${stats.tiles} of ${listed} listed tiles, ${stats.evicted} evicted`);
  console.log(`  itaipu: page terrain built in ${Date.now() - t0} ms`);

  /* The hero tiles' box every 2.5 m (a quarter of its 10 m cell), the
   * rest of the square every 10 m (a third of level 0's 30 m), both from
   * -HALF in whole steps so tile and cell edges and the square's edge fall
   * on samples. */
  const HALF = ITAIPU_FRAME.half;
  const heroSize = tileSizeOf(HERO);
  const heroI = manifest.hero.tiles.map(([i]) => i);
  const heroJ = manifest.hero.tiles.map(([, j]) => j);
  const hero = {
    x0: -HALF + Math.min(...heroI) * heroSize,
    x1: -HALF + (Math.max(...heroI) + 1) * heroSize,
    z0: -HALF + Math.min(...heroJ) * heroSize,
    z1: -HALF + (Math.max(...heroJ) + 1) * heroSize,
  };
  const inHero = (x, z) => x >= hero.x0 && x <= hero.x1 && z >= hero.z0 && z <= hero.z1;
  function* itaipuGrid() {
    for (let x = hero.x0; x <= hero.x1; x += 2.5) {
      for (let z = hero.z0; z <= hero.z1; z += 2.5) {
        yield [x, z, 'hero'];
      }
    }
    for (let x = -HALF; x <= HALF; x += 10) {
      for (let z = -HALF; z <= HALF; z += 10) {
        if (!inHero(x, z)) {
          yield [x, z, 'ring'];
        }
      }
    }
  }
  const room = groundOf('itaipu');
  streamedCheck('itaipu', itaipuGrid, room, (x, z) => terrain.finestAt(x, z));

  /* Past the square the page draws its apron; the room says it has no
   * ground there rather than guess one. */
  const outside = [[HALF + 1, 0], [0, -HALF - 1], [Infinity, 0], [NaN, 0]];
  const threw = outside.filter(([x, z]) => {
    try {
      room(x, z);
      return false;
    } catch (e) {
      return e instanceof RangeError;
    }
  });
  check(threw.length === outside.length, 'itaipu: the room\'s ground throws past the square',
    `itaipu: the room's ground answered past the square at ${outside.length - threw.length} of ${outside.length} points`);
}

/* The Interior. interior.js reads its ground from the shared world and
 * draws the same heights as its terrain's level 0. */
const interiorSrc = readFileSync(new URL('../src/maps/interior.js', import.meta.url), 'utf8');
const interiorWiring = [
  'const ground = world.groundAt;',
  'heights: world.heights,',
  'floorAt: (x, z, fromY) => roofs.height(x, z, fromY, ground(x, z)),',
];
const interiorMissing = interiorWiring.filter((w) => !interiorSrc.includes(w));
check(interiorMissing.length === 0, 'interior.js reads its ground from the shared world and draws its heights',
  `interior.js wiring missing ${JSON.stringify(interiorMissing)}`);
{
  const world = makeWorld(readWorldBytes());
  const at = new THREE.Vector3(0, 0, 0);
  const terrain = await INTERIOR_TERRAIN.buildTerrain({
    heights: world.heights,
    ...pageScene(),
    quality: INTERIOR_TERRAIN.TERRAIN_Q.high,
    spawn: at,
    eye: at.clone(),
    progress: quiet,
  });
  /* The whole square every 7.5 m, a quarter of its 30 m cell. */
  function* interiorGrid() {
    for (let x = -INTERIOR_HALF; x <= INTERIOR_HALF; x += 7.5) {
      for (let z = -INTERIOR_HALF; z <= INTERIOR_HALF; z += 7.5) {
        yield [x, z, 'square'];
      }
    }
  }
  streamedCheck('interior', interiorGrid, groundOf('interior'), (x, z) => terrain.finestAt(x, z));
}

if (failed) {
  process.exit(1);
}
console.log('world-layer: ok');
