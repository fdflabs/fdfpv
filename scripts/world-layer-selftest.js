/*
 * world-layer-selftest.js: the valley's world (src/share/valley/world.js)
 * is the ground the page draws and the ground the room flies, for alps
 * and swiss2.
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

import { readFileSync } from 'node:fs';
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

if (failed) {
  process.exit(1);
}
console.log('world-layer: ok');
