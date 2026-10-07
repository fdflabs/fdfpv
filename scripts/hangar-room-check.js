/*
 * hangar-room-check.js: the walkable hangar's floor plans and walk
 * (src/game/hangarroom.js, docs/HANGAR-ROOM.md), in plain Node. Run with
 * npm run hangar:room.
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

import {
  CELL, ROOMS, TIERS, LAYOUTS, checkLayout, occupancy, stations, startPose, walk, stationNear, reachable, BODY_R,
} from '../src/game/hangarroom.js';

const words = (p) => p.map((x) => `${x.kind} at ${x.at.join(',')} ${x.problem}${x.other ? ` ${x.other}` : ''}`).join('; ');

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}

for (const tier of TIERS) {
  const room = ROOMS[tier];
  const layout = LAYOUTS[tier];
  const problems = checkLayout(room, layout);
  check(`${tier}: every piece in the room, none overlapping`, problems.length === 0, words(problems) || `${layout.length} pieces`);
  const occ = occupancy(room, layout);
  const start = startPose(room);
  const list = stations(room, layout);
  for (const s of list) {
    check(`${tier}: ${s.id} reachable on foot from the door`, reachable(room, occ, start, s), `spot ${s.x.toFixed(2)}, ${s.z.toFixed(2)}`);
  }
  const ids = list.map((s) => s.id);
  check(`${tier}: has a stand, a bench and the door`, ['stand', 'bench', 'door'].every((id) => ids.includes(id)), ids.join(' '));

  /* A long random walk: never through a wall, never into furniture. */
  let pose = start;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const hw = (room.w * CELL) / 2;
  const hd = (room.d * CELL) / 2;
  let bad = 0;
  let moved = 0;
  for (let k = 0; k < 20000; k += 1) {
    const before = pose;
    pose = walk(room, occ, pose, { forward: rnd() * 2 - 0.6, turn: rnd() * 2 - 1 }, 1 / 60);
    moved += Math.hypot(pose.x - before.x, pose.z - before.z);
    const i = Math.floor((pose.x + hw) / CELL);
    const j = Math.floor((pose.z + hd) / CELL);
    if (Math.abs(pose.x) > hw - BODY_R + 1e-9 || Math.abs(pose.z) > hd - BODY_R + 1e-9 || occ[j * room.w + i]) {
      bad += 1;
    }
  }
  check(`${tier}: 20000 random steps stay in the room and out of furniture`, bad === 0 && moved > 20, `${bad} bad, ${moved.toFixed(0)} m walked`);
}

/* Walking straight at the back wall from the door stops at the wall. */
{
  const room = ROOMS.garage;
  const occ = new Uint8Array(room.w * room.d);
  let pose = startPose(room);
  for (let k = 0; k < 600; k += 1) {
    pose = walk(room, occ, pose, { forward: 1, turn: 0 }, 1 / 60);
  }
  const wall = -(room.d * CELL) / 2 + BODY_R;
  check('walking at a wall stops at it', Math.abs(pose.z - wall) < 0.05 && !walk(room, occ, pose, { forward: 1 }, 1 / 60).moving, `z ${pose.z.toFixed(3)}, wall at ${wall}`);
  const s = stations(room, LAYOUTS.garage).find((x) => x.id === 'bench');
  check('standing on a station\'s spot finds it', stationNear(stations(room, LAYOUTS.garage), { x: s.x, z: s.z })?.id === 'bench', 'bench');
  check('the middle of an empty floor finds none', stationNear([s], { x: s.x + 2, z: s.z + 2 }) === null, 'null');
}

/* A layout the check must refuse. */
{
  const room = ROOMS.garage;
  const p = checkLayout(room, [{ kind: 'bench', at: [0, 0], rot: 0 }, { kind: 'shelf', at: [2, 1], rot: 0 }, { kind: 'tv', at: [11, 0], rot: 0 }]);
  check('overlap and out of bounds are refused', p.length === 2 && p[0].problem === 'overlap' && p[1].problem === 'outside', words(p));
}

console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
