/*
 * rooms-selftest-ops.js: the ops section of npm run rooms:selftest, who
 * is sent an ops match's result (edge/rooms/ops.js took, the view's uid),
 * in its own file as the war's is. rooms-selftest.js calls
 * opsSection(check) once. The match itself is held by interior:stages and
 * the other Interior checks.
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

import { PROTO, ROOM_LEVEL } from '../src/share/roomwire.js';
import { COUNTDOWN_MS } from '../edge/rooms/timing.js';
import { AWAY_MS, RoomOps } from '../edge/rooms/ops.js';
import { createRoomOps } from '../src/share/roomops.js';
import { makeWorld } from '../src/share/ops/fixtures/world.js';
import { opsRoom } from './lib/opsroom.js';

const MISSION = {
  id: 'pay-test',
  campaign: 'test',
  map: 'test',
  z0: 0,
  classes: ['unknown'],
  roles: [{ id: 'isr', core: true }, { id: 'tracker', core: false }],
  contacts: [],
  items: [],
  points: {},
  stages: [{ id: 'one', cues: [], exits: [{ when: { time: 3600 }, to: 'lost', why: 'timeout' }] }],
};

export function opsSection(check) {
  console.log('ops: who is paid a result');
  /* Two pilots at the go, a third seated mid match, a watcher, the second
   * gone longer than AWAY_MS (its seat's token let go) and back on its
   * token after the end, and a fourth first seated after the end. */
  const e = opsRoom(MISSION, { n: 2, world: makeWorld({}) });
  for (const i of [0, 1, 2]) {
    e.paths[i] = () => [100 * i, 0, 300];
  }
  e.fly(COUNTDOWN_MS + 1000);
  e.join(2);
  const w = { name: 'watcher', address: '10.7.9.200', got: [] };
  e.apply(e.r.open(w, e.clock));
  e.apply(e.r.message(w, JSON.stringify({
    type: 'hello', proto: PROTO, build: 't', level: ROOM_LEVEL, name: [9, 9, 29], profile: { airframe: 'bramor2300', map: 'test', figure: 1, livery: null, parts: null }, watch: true,
  }), e.clock, w.address, () => 'f'.repeat(32)));
  const gone = e.tokens[1];
  e.drop(1);
  e.fly(e.clock + AWAY_MS + 2000);
  check('a pilot gone longer than AWAY_MS has let its seat go (the match no longer holds its token there)',
    !Object.values(e.r.ops.match.tokens).includes(gone), JSON.stringify(e.r.ops.match.tokens));
  e.say(0, { type: 'ops', op: 'end' });
  const end = e.view(0);
  const uid = end.uid;
  check('the host ends the match: its view names it by a uid of the room, its start, its code and its id, kind o',
    end.state === 'ended' && /^o\d{13}-OPS000-000001$/.test(uid ?? '') && end.result && end.result.won === false, JSON.stringify({ state: end.state, uid }));
  const late = e.view(2);
  check('a pilot seated mid match took part: its view carries the result and the uid', e.r.ops.took(e.r.seats.get(e.socks[2]))
    && late.uid === uid && late.result && Array.isArray(late.result.starIds), JSON.stringify(late.result));
  const watched = w.got.filter((x) => x && x.type === 'ops' && x.ops);
  check('a watcher is told the match and its uid, never its result', watched.at(-1)?.ops.state === 'ended' && watched.at(-1).ops.uid === uid
    && watched.every((x) => x.ops.result == null));
  const after = e.join(3);
  const welcome = after.got.find((x) => x && x.type === 'welcome');
  check('a pilot first seated after the end did not take part: its welcome has the ended match, its uid, no result',
    welcome.ops.state === 'ended' && welcome.ops.uid === uid && welcome.ops.result === null && !e.r.ops.took(e.r.seats.get(after)),
    JSON.stringify(welcome.ops.result));
  const back = e.join(1, gone);
  const again = back.got.find((x) => x && x.type === 'welcome');
  check('a pilot who took part, back on its token after the end (a reload at the debrief): the welcome carries the result and the uid',
    again && again.token === gone && again.ops.uid === uid && again.ops.result && again.ops.result.won === false,
    JSON.stringify(again && again.ops.result));
  const c = createRoomOps(() => {});
  c.onWelcome(again);
  check('and that page\'s ops view holds it, for the campaign to pay', c.view().uid === uid && c.view().result?.won === false);
  const later = e.r.ops.changed(e.r).filter((x) => x.send);
  const to = (conn) => JSON.parse(later.find((x) => x.send === conn).data).ops;
  check('every view sent after: the result to the seats that took part (the first, the late one, the one back), none to the one that did not or to the watcher',
    to(e.socks[0]).result && to(e.socks[2]).result && to(back).result && to(after).result === null && to(w).result === null);
  /* A match stored before `pilots` (a restart over a deploy): those whose
   * tokens it still held took part. */
  const stored = JSON.parse(JSON.stringify(e.r.ops.store().value));
  delete stored.match.pilots;
  const old = new RoomOps(e.r.meta);
  old.missions = { ...old.missions, [MISSION.id]: MISSION };
  old.restore(stored);
  check('a match restored from before `pilots`: the tokens it held then took part, nobody else',
    old.took({ token: e.tokens[0] }) && old.took({ token: e.tokens[2] }) && !old.took({ token: e.tokens[3] }), JSON.stringify(old.match.pilots));
  check('a match restored with `pilots` keeps the pilot who was let go',
    (() => { const r = new RoomOps(e.r.meta); r.missions = old.missions; r.restore(e.r.ops.store().value); return r.took({ token: gone }); })());
}
