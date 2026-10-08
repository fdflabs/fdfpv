/*
 * jam-selftest.js: the page's half of Trick Battle (src/share/roomjam.js
 * createRoomJam, createJamRun) against the real freestyle scorer, in Node.
 * The room's half is the jam section of npm run rooms:selftest.
 *
 *   node scripts/jam-selftest.js        (npm run jam:selftest)
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

import { FreestyleScore } from '../src/game/score.js';
import {
  DONE_GAP_MS, SEND_MS, SLACK_MS, TURN_MS, cleanNumbers, createJamRun, createRoomJam,
} from '../src/share/roomjam.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

console.log('jam: the page\'s room state');
const out = [];
const rj = createRoomJam((m) => out.push(m));
rj.onWelcome({ seat: 2, jam: { state: 'lobby' } });
check('a room with no match: nothing on, nothing held', !rj.on() && rj.holdMs(100) === 0 && rj.takeTurn(100) === null);
const turn = (runner, extra = {}) => ({
  type: 'jam', jam: {
    state: 'turn', id: 1, seconds: 45, rounds: 3, round: 1, order: [2, 5], runner, goAt: 6000, endAt: 51000,
    live: { total: 0 }, runs: [], wins: { 2: 0, 5: 0 }, winners: [], gone: [], ...extra,
  },
});
rj.onMessage(turn(5));
check('another pilot\'s turn: this one watches, held to the next count', rj.watching() && !rj.mine() && rj.holdMs(7000) === 51000 - 7000 + SLACK_MS + TURN_MS && rj.takeTurn(100) === null);
rj.onMessage(turn(2, { goAt: 9000, endAt: 54000 }));
check('its own turn: held until its go, taken once', rj.mine() && rj.holdMs(8000) === 1000 && rj.takeTurn(8000) && rj.takeTurn(8001) === null);
rj.onMessage({ type: 'jam', jam: { ...turn(2).jam, state: 'run', goAt: 9000 } });
check('then flies', rj.holdMs(9500) === 0);
rj.onMessage({ type: 'jam', jam: { ...turn(null).jam, state: 'results', runs: [{ round: 1, seat: 2, total: 9, crashes: 0 }, { round: 1, seat: 5, total: 3, crashes: 0 }], winners: [2] } });
check('results once, with standings', rj.takeResults() && rj.takeResults() === null && rj.standings()[0].seat === 2 && rj.standings()[0].wins === 1);
rj.start(60);
check('the host\'s start says the seconds', out.at(-1).type === 'jam' && out.at(-1).op === 'start' && out.at(-1).seconds === 60);
const back = createRoomJam(() => {});
back.onWelcome({ seat: 2, jam: { ...turn(2).jam, state: 'run' } });
check('back in mid run: no new turn to take', back.takeTurn(8000) === null);

console.log('jam: a run, scored by the freestyle scorer');
const sent = [];
const score = new FreestyleScore({ timed: false });
const run = createJamRun(score, 10000, (m) => sent.push(m));
let wall = 0;
run.frame(wall, 0);
check('nothing to say before a trick', sent.length === 1 && sent[0].total === 0);
score.nowMs = 100;
score.land({ name: 'Powerloop', execution: 'CLEAN', endMs: 100 });
score.land({ name: 'Powerloop', execution: 'CLEAN', endMs: 200 });
wall += 100;
run.frame(wall, 200);
check(`no faster than every ${SEND_MS} ms`, sent.length === 1);
score.tick(5000);
wall = SEND_MS + 1;
run.frame(wall, 5000);
const s1 = sent.at(-1);
check('the banked total, the tricks and the last trick, in a shape the room takes', sent.length === 2 && s1.op === 'score' && s1.total > 0
  && s1.tricks === 2 && s1.unique === 1 && s1.last.name === 'Powerloop' && cleanNumbers(s1) !== null, JSON.stringify(s1));
check('the same trick twice pays less the second time', score.tricks[1].net < score.tricks[0].net);
score.crash();
wall += 50;
check('done waits for its gap after the last score', run.frame(wall, 10000) === null && sent.length === 2);
wall += DONE_GAP_MS;
const d = run.frame(wall, 10000);
check('at the room\'s end: the scorer finished, done sent once with the summary', d && sent.at(-1).op === 'done' && sent.at(-1).crashes === 1
  && score.over() && d.summary.total === sent.at(-1).total && run.frame(wall + 999, 11000) === d && sent.filter((m) => m.op === 'done').length === 1);
check('totals the room sees never go down', sent.every((m, i) => i === 0 || m.total >= sent[i - 1].total));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
