/*
 * war-legacy-games.js: the four Itaipu missions as the room played them
 * before the stage engine (src/share/war/stages.js), kept as a record so
 * the engine can be held to them. npm run war:legacy.
 *
 *     node scripts/war-legacy-games.js            compare with the record
 *     node scripts/war-legacy-games.js --record   write the record
 *
 * Each game is scripts/war-balance.js runOne: bot squads on the real room
 * (edge/rooms/core.js with edge/rooms/war.js) in Node, the room's seed and
 * the bots' choices drawn from fixed seeds, so a game is the same game on
 * every run. GAMES below is every mission, two skills (good pilots, who
 * win rounds, and careless ones, who lose them, so both ends of a round
 * are played), one and three pilots, two seeds. What is kept of a game is
 * what every screen is told and what decides the next thing it is told:
 *
 *   births   every attacker's birth record, as the room sent it
 *   deaths   every death: ids, room ms, by, why, target and hit
 *   rounds   every change of the view's round, roundState, roundAt,
 *            nextRoundAt and roundResult
 *   end      the state, why, output and room ms it ended
 *
 * The bots fly at what they are told, so a birth a millisecond off moves
 * every pass after it: equal games mean equal births at equal times, and
 * equal rounds, deaths and ends besides.
 *
 * THE RECORD (tests/fixtures/war-legacy-games.json) was written by
 * --record at the commit named in it, before the engine existed. Writing
 * it again makes the check prove the engine equal to itself: do it only
 * on purpose, with the reason in the pull request.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runOne } from './war-balance.js';
import { MISSIONS } from '../src/share/war/missions/index.js';

const FIXTURE = new URL('../tests/fixtures/war-legacy-games.json', import.meta.url);
const MISSION_IDS = ['itaipu-1', 'itaipu-2', 'itaipu-3', 'itaipu-4'];
const GAMES = MISSION_IDS.flatMap((mission) => ['good', 'careless'].flatMap((skill) => [1, 3].flatMap((pilots) => [1, 2].map((seed) => ({
  mission, skill, pilots, seed,
})))));
/* The crest road's seats, as war-balance.js lays them out. */
const SPAWN = [[574.93, -1622.45], [594.68, -1619.16], [613.8, -1612.94], [633.76, -1610.63],
  [652.88, -1604.41], [672.84, -1602.1], [691.96, -1595.88], [711.92, -1593.57]];
const ROUND_KEYS = ['round', 'roundState', 'roundAt', 'nextRoundAt', 'roundResult'];

/* One game, as the record keeps it. */
export function playGame(g, floorBuf) {
  const births = [];
  const deaths = [];
  const rounds = [];
  let last = null;
  let end = null;
  const record = (m) => {
    if (m.type !== 'war') {
      return;
    }
    if (m.op === 'born') {
      births.push(...m.agents.map((a) => ({ ...a })));
    } else if (m.op === 'dead') {
      deaths.push({
        ids: m.ids, at: m.at, by: m.by, why: m.why, target: m.target ?? null, hit: m.hit ?? null,
      });
    } else if (m.war && m.war.state !== 'lobby') {
      const r = Object.fromEntries(ROUND_KEYS.map((k) => [k, m.war[k] ?? null]));
      const key = JSON.stringify(r);
      if (key !== last) {
        last = key;
        rounds.push(r);
      }
      if (m.war.state === 'won' || m.war.state === 'lost' || m.war.state === 'ended') {
        end = {
          state: m.war.state, why: m.war.why, output: m.war.output, endAt: m.war.endAt,
        };
      }
    }
  };
  runOne({
    pilots: g.pilots, skill: g.skill, seed: g.seed, floorBuf, spawn: SPAWN, mission: MISSIONS[g.mission], record,
  });
  return {
    ...g, births, deaths, rounds, end,
  };
}

/* The first place two games part, as a line, or null when they are one. */
export function firstDifference(want, got) {
  for (const key of ['births', 'deaths', 'rounds']) {
    const n = Math.max(want[key].length, got[key].length);
    for (let i = 0; i < n; i += 1) {
      const a = JSON.stringify(want[key][i] ?? null);
      const b = JSON.stringify(got[key][i] ?? null);
      if (a !== b) {
        return `${key}[${i}]: recorded ${a}, now ${b}`;
      }
    }
  }
  const a = JSON.stringify(want.end);
  const b = JSON.stringify(got.end);
  return a === b ? null : `end: recorded ${a}, now ${b}`;
}

const floorBuf = readFileSync(new URL('../src/share/war/itaipu-height.bin', import.meta.url));
const name = (g) => `${g.mission} ${g.skill} x${g.pilots} seed ${g.seed}`;

const main = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main && process.argv.includes('--record')) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const games = GAMES.map((g) => playGame(g, floorBuf));
  writeFileSync(FIXTURE, `${JSON.stringify({ commit, games })}\n`);
  for (const g of games) {
    console.log(`${name(g).padEnd(34)} ${String(g.births.length).padStart(3)} births ${String(g.deaths.length).padStart(3)} deaths ${g.rounds.length} round changes, ${g.end ? `${g.end.state}:${g.end.why}` : 'unfinished'}`);
  }
  console.log(`war:legacy recorded ${games.length} games at ${commit}`);
} else if (main) {
  const rec = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  let bad = 0;
  for (const want of rec.games) {
    const got = playGame(want, floorBuf);
    const diff = firstDifference(want, got);
    console.log(`${diff ? 'FAIL' : 'ok  '} ${name(want).padEnd(34)} ${String(got.births.length).padStart(3)} births ${String(got.deaths.length).padStart(3)} deaths${diff ? `\n     ${diff}` : ''}`);
    bad += diff ? 1 : 0;
  }
  if (bad) {
    console.log(`war:legacy FAIL: ${bad} of ${rec.games.length} games differ from the record (${rec.commit})`);
    process.exit(1);
  }
  console.log(`war:legacy ok: ${rec.games.length} games equal to the record of ${rec.commit}`);
}
