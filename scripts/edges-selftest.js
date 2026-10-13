/*
 * edges-selftest.js: the one edge rule (src/game/edges.js) on the
 * registry's worlds, in Node.
 *
 *   node scripts/edges-selftest.js
 *
 * Every world the registry can load has a square, each square is the
 * constant it is taken from, and twice it is still ground the world
 * draws. Then the rule itself: inside, turn back with the bearing and the
 * distance home, the notice past twice the square, the notice called off
 * by coming back, held by a pause, and the reset when it runs out; with
 * the controls a wrong rule would pass (a circle, a wall clock, a notice
 * that does not reset itself).
 *
 * Exits 1 on any failure.
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
import { MAPS } from '../src/maps/registry.js';
import { RESET_NOTICE_MS, WORLD_EDGES, edgeState, edgeStep } from '../src/game/edges.js';
import { HALF as VALLEY_HALF } from '../src/maps/alps/heights.js';
import { makeValleyWorld } from '../src/share/valley/world.js';
import { SWISS_WORLD } from '../src/maps/swiss2/field.js';
import { RING_HALF } from '../src/maps/itaipu/terrain/frame.js';
import { HALF as INTERIOR_HALF, PLAY_HALF } from '../src/share/interior/frame.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

console.log('the squares');
const worlds = MAPS.filter((m) => m.load).map((m) => m.id);
for (const id of worlds) {
  check(`${id} has a square`, WORLD_EDGES[id] > 0, `${WORLD_EDGES[id]} m`);
}
check('no square for anything that is not a loadable world', Object.keys(WORLD_EDGES).every((id) => worlds.includes(id)), Object.keys(WORLD_EDGES).join(' '));
/* The interior's apron (src/maps/interior/terrain.js imports three, so
 * its depth is read off the source). */
const apron = Number(readFileSync(new URL('../src/maps/interior/terrain.js', import.meta.url), 'utf8').match(/APRON = \{[^}]*depth: (\d+)/)[1]);
const valleyFar = makeValleyWorld('alps').far.size / 2;
const swissFar = makeValleyWorld('swiss2', SWISS_WORLD).far.size / 2;
const SOURCES = {
  alps: [VALLEY_HALF, 'alps/heights.js HALF', valleyFar, 'the far range'],
  swiss2: [VALLEY_HALF, 'alps/heights.js HALF', swissFar, 'the far range'],
  itaipu: [RING_HALF / 2, 'itaipu/terrain/frame.js RING_HALF / 2', RING_HALF, 'the data'],
  interior: [PLAY_HALF, 'share/interior/frame.js PLAY_HALF', INTERIOR_HALF + apron, 'the data and its apron'],
};
for (const id of worlds) {
  const [want, from, drawn, what] = SOURCES[id] ?? [NaN, 'no source named', 0, ''];
  check(`${id}: the square is ${from}`, WORLD_EDGES[id] === want, `${WORLD_EDGES[id]} against ${want}`);
  check(`${id}: twice the square is inside ${what}`, 2 * WORLD_EDGES[id] <= drawn, `${2 * WORLD_EDGES[id]} m against ${drawn} m`);
}

console.log('the rule');
const H = 1000;
const home = { x: 0, z: 0 };
/* One frame of the rule, its answer copied out of the run's state. */
function step(half, st, x, z, at, t) {
  edgeStep(half, st, x, z, at.x, at.z, t);
  return { ...st };
}
let st = edgeState();
check('inside the square: in', step(H, st, 900, -900, home, 0).phase === 'in');
const corner = step(H, st, 800, 800, home, 0);
check('control: a corner a circle of the same size would refuse is in', corner.phase === 'in', `${Math.hypot(800, 800).toFixed(0)} m out`);
const north = step(H, st, 0, 1500, home, 0);
check('past the square, south of home: turn back, home bears 0', north.phase === 'turn' && north.bearing === 0 && Math.abs(north.km - 1.5) < 1e-9, JSON.stringify(north));
const west = step(H, st, -1500, 0, home, 0);
check('west of home: home bears 90 (east is +x)', west.phase === 'turn' && west.bearing === 90, JSON.stringify(west));
const south = step(H, st, 0, -1500, home, 0);
check('north of home: home bears 180', south.bearing === 180, JSON.stringify(south));
const nw = step(H, st, 1507, 1500, { x: 1500, z: -1500 }, 0);
check('home a hair west of north (359.87): bearing 0, not 360', nw.bearing === 0 && Math.abs(nw.km - 3) < 0.001, JSON.stringify(nw));

st = edgeState();
const a = step(H, st, 2100, 0, home, 10000);
check('past twice the square: the notice, five seconds to go', a.phase === 'leaving' && a.msLeft === RESET_NOTICE_MS && RESET_NOTICE_MS === 5000, JSON.stringify(a));
const b = step(H, st, 2500, 0, home, 14999);
check('a millisecond short: still the notice', b.phase === 'leaving' && b.msLeft === 1, JSON.stringify(b));
const c = step(H, st, 2500, 0, home, 15000);
check('the notice runs out: reset', c.phase === 'reset', JSON.stringify(c));
const d = step(H, st, 2500, 0, home, 15001);
check('control: after a reset the notice starts again, not reset every frame', d.phase === 'leaving' && d.msLeft === RESET_NOTICE_MS, JSON.stringify(d));

st = edgeState();
step(H, st, 2100, 0, home, 0);
const back = step(H, st, 1900, 0, home, 3000);
check('back inside twice the square: turn back, the notice called off', back.phase === 'turn' && st.since === null, JSON.stringify(back));
const again = step(H, st, 2100, 0, home, 4000);
check('out again: a fresh five seconds', again.phase === 'leaving' && again.msLeft === RESET_NOTICE_MS, JSON.stringify(again));

st = edgeState();
step(H, st, 2100, 0, home, 500);
const paused = [1, 2, 3].map(() => step(H, st, 2100, 0, home, 500).msLeft);
check('control: on a held clock (a pause) the notice holds', paused.every((m) => m === RESET_NOTICE_MS), paused.join(' '));

console.log('the words');
for (const [lang, table] of [['en', en], ['es', es]]) {
  for (const k of ['edge.turn_back', 'edge.leaving']) {
    const t = table[k];
    check(`${lang} ${k}`, typeof t === 'string' && t.includes('{bearing}') && t.includes('{km}') && (k !== 'edge.leaving' || t.includes('{s}')), t);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
