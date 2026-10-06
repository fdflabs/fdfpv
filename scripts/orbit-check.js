/*
 * orbit-check.js: what a pilot orbits is in the obstacle field, and one slow
 * lap is one lap.
 *
 *     node scripts/orbit-check.js      (npm run check:orbit)
 *
 * Two regressions this pins. The shell's ground function once answered the
 * training mast's legs with the height of its head deck, which put each leg
 * above its own top and erased it from the obstacle field, so an orbit of
 * the mast could never score. And a slow lap used to be cut in two by the
 * path hysteresis. The geometry half asks deriveObstacles directly; the
 * flight half orbits the mast on the real plant (scripts/lib/flightrig.js)
 * at several radii, speeds and spawn yaws. Then the negatives: a straight
 * run past a street of posts names nothing, and rolls flown down that
 * street with no plant and no flush are still released to the pilot.
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeRig, buildWorld, V, sub, mul, norm, len, rampPath, circlePath, dropPath,
} from './lib/flightrig.js';
import { Colliders } from '../src/game/collide.js';
import { deriveObstacles, ObstacleField, OB_POLE } from '../src/game/obstacles.js';
import { TrickDetector } from '../src/game/trickdetect.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmPath = join(root, 'dist/sim.wasm');

/* The training mast: four square legs on a plinth, a deck on top. */
const MAST = { x: 96, z: 160, half: 1.5, leg: 0.16, height: 34, base: 0.45, deck: 34.75 };

let passed = 0;
let failed = 0;
function report(ok, label, note) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${label}`);
  if (note) console.log(`        ${note}`);
}
const joined = (names, none = 'nothing') => (names.length ? names.join(' + ') : none);

function mastLegs() {
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = MAST.x + sx * MAST.half;
      const cz = MAST.z + sz * MAST.half;
      legs.push({
        kind: 'box', material: 'wall',
        x0: cx - MAST.leg, y0: MAST.base, z0: cz - MAST.leg,
        x1: cx + MAST.leg, y1: MAST.base + MAST.height, z1: cz + MAST.leg,
      });
    }
  }
  return legs;
}

console.log('\norbit-check: the mast is an obstacle, and a slow lap is one lap\n');

{
  const c = new Colliders();
  for (const b of mastLegs()) c.addBox(b.material, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
  c.addBox('wall', MAST.x - 1.85, MAST.deck - 0.3, MAST.z - 1.85, MAST.x + 1.85, MAST.deck, MAST.z + 1.85);
  c.build();
  /* The fixed ground function: below the deck, a leg stands on the plinth. */
  const withBase = deriveObstacles(c, (x, z, fromY) => (fromY !== undefined && fromY < MAST.deck ? MAST.base + 0.3 : MAST.deck));
  const poles = withBase.countOf(OB_POLE);
  report(poles >= 4, 'the four legs of the mast are poles a pilot can orbit',
    `${poles} poles from four legs under a deck`);
  /* The bug restated: ask for the top of the stack and the legs vanish. */
  const topOnly = deriveObstacles(c, () => MAST.deck).countOf(OB_POLE);
  report(topOnly === 0, 'and answered with the deck height everywhere, they vanish',
    `${topOnly} poles when every leg is told the ground is the deck`);
}

if (!existsSync(wasmPath)) {
  console.log('\n  SKIP  no dist/sim.wasm; the flights need the plant, a skip is not a pass\n');
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
const wasmBytes = readFileSync(wasmPath);
const diffText = readFileSync(join(root, 'configs/betaflight-default.diff'), 'utf8');

const mastWorld = buildWorld(mastLegs(), deriveObstacles, MAST.base);

/* Ramp onto a circle about the mast and fly it facing the mast; returns
 * the trick names and the worst path error. */
async function orbit({ radius, secs, laps, alt, inverted = false, yaw = Math.PI }) {
  const rig = await makeRig({
    wasmBytes, diffText, colliders: mastWorld.colliders, field: mastWorld.field,
    spawn: V(MAST.x, MAST.base, MAST.z - 20), spawnYaw: yaw, groundY: MAST.base,
  });
  const circle = circlePath(V(MAST.x, alt, MAST.z), V(1, 0, 0), V(0, 0, 1), radius, secs, 0, laps);
  /* Belly up the thrust points down, so the planned path falls to match. */
  const lap = inverted ? dropPath(circle, 11.4) : circle;
  const entry = lap(0);
  const vEntry = len(entry.v);
  const from = sub(entry.p, mul(norm(entry.v), 12));
  const look = (t, s) => Math.atan2(MAST.x - s.p.x, MAST.z - s.p.z);
  rig.hold(200, 0, 0, 0, 0.5);
  rig.settle(from, look(0, { p: from }), 2.0);
  rig.fly(rampPath(from, entry.p, (12 * 1.9) / Math.max(2, vEntry), vEntry), { heading: look });
  const flown = rig.fly(lap, {
    heading: look, ky: inverted ? 1.6 : 3.0, yawMax: inverted ? 0.5 : 0.85, invertOk: inverted,
  });
  rig.hold(600, 0, 0, 0, 0.45);
  return { names: rig.done(800).map((t) => t.name), err: flown.worstErr };
}

const scored = (o) => `named ${joined(o.names)} (path error ${o.err.toFixed(1)} m)`;
for (const [shape, want, label] of [
  [{ radius: 6, secs: 5.0, laps: 2, alt: 8 }, 'Orbit x2', 'two laps of 6 m in five seconds'],
  [{ radius: 8, secs: 7.0, laps: 2, alt: 10 }, 'Orbit x2', 'two slow laps of 8 m in seven seconds, which the old hysteresis cut'],
  [{ radius: 5, secs: 2.3, laps: 1, alt: 24, inverted: true }, '1 Trippy Spin', 'one lap flown belly up'],
]) {
  const o = await orbit(shape);
  report(o.names.includes(want), `${label}: ${want}`, scored(o));
}

{
  const seen = [];
  for (const [yaw, name] of [[0, '0'], [Math.PI / 2, '90'], [Math.PI, '180']]) {
    seen.push([name, joined((await orbit({ radius: 6, secs: 5.0, laps: 2, alt: 8, yaw })).names)]);
  }
  report(seen.every(([, s]) => s.includes('Orbit x2')), 'the same two laps score alike from three spawn yaws',
    seen.map(([name, s]) => `yaw ${name}: ${s}`).join(' | '));
}

for (const [radius, secs] of [[6, 5], [10, 7], [14, 9], [18, 11]]) {
  const o = await orbit({ radius, secs, laps: 2, alt: 12 });
  report(o.names.includes('Orbit x2'), `two laps at ${radius} m, a radius a park paints or a pilot drifts to`,
    `named ${joined(o.names)}`);
}

{
  const one = await orbit({ radius: 6, secs: 5.0, laps: 1, alt: 8 });
  report(one.names.includes('Yaw Spin'), 'one tracked lap of the mast is a full turn of yaw, and scores as one',
    `named ${joined(one.names)}`);
  const two = await orbit({ radius: 6, secs: 5.0, laps: 2, alt: 8 });
  report(two.names.includes('Orbit x2') && !two.names.includes('Yaw Spin'), 'while two laps are an Orbit x2 and no Yaw Spin',
    `named ${joined(two.names)}`);
}

{
  const posts = [];
  for (let i = 0; i < 8; i += 1) {
    const x = 10 + i * 8;
    posts.push({ kind: 'box', material: 'wall', x0: x - 0.16, y0: 0, z0: -0.16, x1: x + 0.16, y1: 6, z1: 0.16 });
  }
  const street = buildWorld(posts, deriveObstacles, 0);
  for (const [z, speed, secs, label] of [
    [-4, 12, 6.5, 'a straight run past a street of posts at 12 m/s names nothing'],
    [-2.5, 9, 9.0, 'nor does the same run closer in, at 9 m/s'],
  ]) {
    const rig = await makeRig({
      wasmBytes, diffText, colliders: street.colliders, field: street.field,
      spawn: V(0, 0, -14), spawnYaw: Math.PI, groundY: 0,
    });
    const east = Math.atan2(1, 0);
    rig.hold(200, 0, 0, 0, 0.5);
    rig.settle(V(4, 4, z), east, 2.0);
    rig.fly(rampPath(V(4, 4, z), V(78, 4, z), secs, speed), { heading: east });
    const names = rig.done(900).map((t) => t.name);
    report(names.length === 0, label, names.length ? `named ${joined(names)}` : 'nothing named');
  }
}

/* No plant here: the detector alone, fed a craft rolling once every eight
 * seconds down a street of poles and never flushed. While a path run is
 * open beside a pole, a roll must still be released when it completes. */
for (const spacing of [15, 20, 26]) {
  const poles = new ObstacleField();
  for (let i = 0; i < 80; i += 1) poles.add(OB_POLE, i * spacing, 6, 6, 0, 1, 0, 6);
  const field = poles.build();
  const names = [];
  const det = new TrickDetector((t) => { names.push(t.name); }, field);
  const ROLL_RATE = (Math.PI * 2) / 1.05;
  let phi = 0;
  let x = 0;
  for (let ms = 0; ms < 60000; ms += 1) {
    const t = ms / 1000;
    const p = t > 4 && (t % 8) < 1.05 ? ROLL_RATE : 0;
    phi += p * 0.001;
    x += 15 * 0.001;
    det.step(0.001, p, 0, 0, Math.sin(phi / 2), 0, 15, x, 6, 0, 1, 0, 0, 0, Math.cos(phi), Math.sin(phi));
  }
  const rolls = names.filter((n) => n === 'Roll').length;
  report(rolls === 7, `seven rolls down a street of poles ${spacing} m apart are all named, unflushed`,
    `${names.length} named: ${joined(names, 'none')}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
