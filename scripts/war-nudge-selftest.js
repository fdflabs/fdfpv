/*
 * war-nudge-selftest.js: the war's guide nudge (src/share/war/nudge.js)
 * in Node. npm run war:nudge. The threat is the attacker nearest a
 * target, not the pilot; the clock is off the nose in the scene's frame
 * (-z north); every line a nudge can say is in lines.json with its voice
 * files in both languages; a nudge waits for no progress and grows its
 * gap; only First Light asks for it.
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
import {
  DIST_BANDS, createNudger, ground, headingOf, nudgeOf, threatOf,
} from '../src/share/war/nudge.js';
import { NUDGE_IDLE_MS } from '../src/share/ops/guide.js';
import { MISSIONS } from '../src/share/war/missions/index.js';

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  pass  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const targets = { a: { at: [0, 200, 0] } };
/* x east, -z north: one attacker 2 km north of the target, one 500 m
 * east of the pilot but 3 km from the target. */
const live = [{ id: 'near', p: [0, 250, -2000] }, { id: 'far', p: [3500, 250, 0] }];
const threat = threatOf(live, targets);
check('the threat is the attacker nearest a target', threat && threat.id === 'near', JSON.stringify(threat));
check('no attacker, no threat, no nudge', threatOf([], targets) === null && nudgeOf(null, [0, 0], 0) === null);

const here = ground([3000, 250, 0]);
check('heading north from a forward of -z', Math.abs(headingOf([0, 0, -1])) < 1e-9);
check('heading east from a forward of +x', Math.abs(headingOf([1, 0, 0]) - Math.PI / 2) < 1e-9);
/* Pilot 3 km east of the target, facing north: the threat is 2 km north
 * of the target, so to the north west, about ten o'clock, 3.6 km. */
const said = nudgeOf(threat, here, headingOf([0, 0, -1]));
check("facing north, a threat to the north west is at ten o'clock", said && said[1] === 'war-g-clock-10', JSON.stringify(said));
check('and about three kilometres', said && said[2] === 'war-g-dist-3k', JSON.stringify(said));
const ahead = nudgeOf({ id: 'x', at: [0, 1000] }, [0, 0], 0);
check("dead ahead is twelve o'clock, 1 km", ahead[1] === 'war-g-clock-12' && ahead[2] === 'war-g-dist-1k', JSON.stringify(ahead));
const behind = nudgeOf({ id: 'x', at: [0, -400] }, [0, 0], 0);
check("dead behind is six o'clock, under 750 m", behind[1] === 'war-g-clock-6' && behind[2] === 'war-g-dist-500', JSON.stringify(behind));

const lines = JSON.parse(readFileSync(new URL('../assets/audio/war/lines.json', import.meta.url), 'utf8')).lines;
const ids = new Set(lines.map((l) => l.id));
const sayable = ['war-g-next', ...Array.from({ length: 12 }, (_, i) => `war-g-clock-${i + 1}`), ...DIST_BANDS.map((b) => b[1])];
const missing = sayable.filter((id) => !ids.has(id));
check('every line a nudge can say is in lines.json', missing.length === 0, missing.join());
const unvoiced = sayable.flatMap((id) => ['en', 'es'].map((l) => `assets/audio/war/voice/${l}/${id}.webm`))
  .filter((f) => !existsSync(new URL(`../${f}`, import.meta.url)));
check('and voiced in English and Spanish', unvoiced.length === 0, unvoiced.join());

const n = createNudger();
n.progress('s|2|near', 0, 3000);
check('no nudge before the idle time', !n.due(NUDGE_IDLE_MS - 1));
check('a nudge once idle', n.due(NUDGE_IDLE_MS));
n.progress('s|2|near', 10000, 2000);
check('closing on the threat is progress', !n.due(NUDGE_IDLE_MS + 5000));
n.progress('s|1|near', 40000, 2000);
check('a kill is progress', !n.due(40000 + NUDGE_IDLE_MS - 1) && n.due(40000 + NUDGE_IDLE_MS));
n.nudged(60000);
check('the gap grows after a nudge', !n.due(60000 + NUDGE_IDLE_MS) && n.state().gap > NUDGE_IDLE_MS);

const asking = Object.values(MISSIONS).filter((m) => m.nudge).map((m) => m.id);
check('only First Light and The Spillway ask for the nudge', asking.join() === 'itaipu-1,itaipu-2', asking.join());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
