/*
 * world-layer-selftest.js: src/share/valley/world.js answers as the page
 * does, for alps and swiss2.
 *
 *     node scripts/world-layer-selftest.js --three=DIR
 *
 * DIR is an unpacked three@0.160.0 npm package (as weather-surface-build.js
 * and collide-audit-air.js take it): the page's terrain and nature modules
 * import three, and the reference here is those very modules run in Node.
 *
 * The reference is src/maps/alps.js buildValley's `ground` and
 * `wallSurface ?? terrainSurface`, composed below as alps.js composes them
 * from the originals: the style's field, farRange's sampler, the cel
 * nature's buildHeadwall (alps only; swiss2's nature returns no ground).
 *
 * Asserts, on a fixed grid, that World.groundAt and World.surfaceAt equal
 * the reference at every sample (Object.is), and that a World with one
 * function perturbed fails the same comparison (the negative control).
 * Reports, without asserting, how far edge/rooms/grounds.js groundOf is
 * from the page's ground: the room has no far range and no headwall, so
 * the gap is known and slice 2's to close (its own PR, a VM deploy).
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
const { HALF, LAKE_Y, STRIP_L, STRIP_W, STRIP_Y, buildHeightfield, farRange, groundZone, valleyAxis } = await import('../src/maps/alps/terrain.js');
const { natureSites, buildHeadwall } = await import('../src/maps/alps/nature.js');
const { buildSwissField } = await import('../src/maps/swiss2/field.js');
const { makeValleyWorld } = await import('../src/share/valley/world.js');
const { groundOf } = await import('../edge/rooms/grounds.js');

/* The page's ground and surface without roofs, from the original modules,
 * composed as src/maps/alps.js buildValley composes them. */
function pageReference(map) {
  const field = map === 'swiss2' ? buildSwissField() : buildHeightfield();
  const look = { parts: () => new THREE.MeshBasicMaterial() };
  const far = farRange(field, look);
  const heightAt = (x, z) => field.height(x, z);
  let nature = {};
  if (map === 'alps') {
    const ctx = { scene: { add() {} }, heightAt, valleyAxis, look };
    const wall = buildHeadwall(ctx, natureSites(ctx));
    nature = { ground: wall.height, groundSurface: wall.surface };
  }
  const zone = {};
  const ground = (x, z) => {
    const inField = Math.abs(x) <= HALF && Math.abs(z) <= HALF;
    const h = inField
      ? Math.max(field.height(x, z), far.height(x, z), nature.ground ? nature.ground(x, z) : -Infinity)
      : far.height(x, z);
    if (Math.abs(x) <= STRIP_W / 2 && Math.abs(z) <= STRIP_L / 2) {
      return Math.max(h, STRIP_Y);
    }
    return h < LAKE_Y ? LAKE_Y : h;
  };
  const wallSurface = (x, z) => {
    if (!nature.groundSurface || !(Math.abs(x) <= HALF && Math.abs(z) <= HALF)) {
      return null;
    }
    const wall = nature.ground(x, z);
    return wall >= Math.max(field.height(x, z), far.height(x, z)) ? nature.groundSurface(x, z) : null;
  };
  const terrainSurface = (x, z) => {
    if (!(Math.abs(x) <= HALF && Math.abs(z) <= HALF)) {
      return 'rock';
    }
    if (Math.abs(x) <= STRIP_W / 2 && Math.abs(z) <= STRIP_L / 2) {
      return 'grass';
    }
    groundZone(field, x, z, 2, zone);
    if (zone.snow > 0.5) {
      return 'snow';
    }
    if (zone.rock > 0.5 || zone.scree > 0.5) {
      return 'rock';
    }
    if (zone.lake && zone.shore > 0.5) {
      return 'dirt';
    }
    return 'grass';
  };
  return { groundAt: ground, surfaceAt: (x, z) => wallSurface(x, z) ?? terrainSurface(x, z) };
}

/* The grid. Integer steps from -HALF, so the field's edge (|x| = 3000) and
 * the strip's (|x| = 6, |z| = 80) fall on samples, where alps.js's `<=`
 * decides. Over the field every 2 m; beyond it to the far range's edge
 * every 50 m; over the headwall every 0.25 m, half its 0.5 m grid, so its
 * cells, partial cells and edges are all sampled. */
const FIELD_STEP = 2;
const FAR_STEP = 50;
const FAR_EDGE = 12000;
const WALL_STEP = 0.25;
/* The headwall's plan padded by ten metres: its grid holds the wall from
 * x 828 to 948.5 and z -1726 to -865.5 (measured 2026-10-10 off
 * buildHeadwall's height on a 0.5 m sweep). */
const WALL_BOX = { x0: 818, x1: 960, z0: -1736, z1: -856 };

function* samples() {
  for (let x = -HALF; x <= HALF; x += FIELD_STEP) {
    for (let z = -HALF; z <= HALF; z += FIELD_STEP) {
      yield [x, z, 'inField'];
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

/* Samples where `world` and `ref` disagree, ground and surface apart, and
 * the first of each. `every` thins the grid (the negative control). */
function compare(world, ref, every = 1) {
  const out = { n: 0, ground: 0, surface: 0, firstGround: null, firstSurface: null };
  let k = 0;
  for (const [x, z] of samples()) {
    if (k++ % every !== 0) {
      continue;
    }
    out.n += 1;
    const gw = world.groundAt(x, z);
    const gr = ref.groundAt(x, z);
    if (!Object.is(gw, gr)) {
      out.ground += 1;
      out.firstGround ??= { x, z, world: gw, page: gr };
    }
    const sw = world.surfaceAt(x, z);
    const sr = ref.surfaceAt(x, z);
    if (sw !== sr) {
      out.surface += 1;
      out.firstSurface ??= { x, z, world: sw, page: sr };
    }
  }
  return out;
}

/* The room's ground against the page's: over the headwall's plan, the
 * rest of the field, and beyond it. The headwall's samples are counted
 * once, there, though the grid passes over its plan twice. */
function roomGap(map, ref) {
  const room = groundOf(map);
  const part = () => ({ n: 0, differ: 0, max: 0, at: null });
  const gap = { headwall: part(), inField: part(), beyond: part() };
  const inBox = (x, z) => x >= WALL_BOX.x0 && x <= WALL_BOX.x1 && z >= WALL_BOX.z0 && z <= WALL_BOX.z1;
  for (const [x, z, where] of samples()) {
    if (where === 'inField' && inBox(x, z)) {
      continue;
    }
    const g = gap[where];
    const d = Math.abs(room(x, z) - ref.groundAt(x, z));
    g.n += 1;
    if (d > 0) {
      g.differ += 1;
    }
    if (d > g.max) {
      g.max = d;
      g.at = [x, z];
    }
  }
  return gap;
}

let failed = false;
const fail = (msg) => {
  failed = true;
  console.log(`FAIL ${msg}`);
};

for (const map of ['alps', 'swiss2']) {
  const t0 = Date.now();
  const ref = pageReference(map);
  const world = makeValleyWorld(map);
  const same = compare(world, ref);
  const ms = Date.now() - t0;
  if (same.ground || same.surface) {
    fail(`${map}: ${same.ground} ground and ${same.surface} surface samples of ${same.n} differ from the page`
      + ` (first ground ${JSON.stringify(same.firstGround)}, first surface ${JSON.stringify(same.firstSurface)})`);
  } else {
    console.log(`ok ${map}: groundAt and surfaceAt identical to the page at ${same.n} samples (${ms} ms)`);
  }

  /* The negative control: one function off by a centimetre, one surface
   * renamed, and the comparison must see both. */
  const bent = {
    groundAt: (x, z) => world.groundAt(x, z) + 0.01,
    surfaceAt: (x, z) => (world.surfaceAt(x, z) === 'rock' ? 'grass' : world.surfaceAt(x, z)),
  };
  const control = compare(bent, ref, 97);
  if (control.ground === 0 || control.surface === 0) {
    fail(`${map}: negative control not caught (${control.ground} ground, ${control.surface} surface of ${control.n})`);
  } else {
    console.log(`ok ${map}: negative control caught (${control.ground} ground, ${control.surface} surface of ${control.n})`);
  }

  const gap = roomGap(map, ref);
  for (const [where, g] of Object.entries(gap)) {
    console.log(`report ${map} rooms grounds.js vs page, ${where}: ${g.differ} of ${g.n} differ`
      + ` (${(100 * g.differ / g.n).toFixed(2)}%), max ${g.max.toFixed(2)} m at ${JSON.stringify(g.at)}`);
  }
}

if (failed) {
  process.exit(1);
}
console.log('world-layer: ok');
