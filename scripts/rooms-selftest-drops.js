/*
 * rooms-selftest-drops.js: the room's paradrops (edge/rooms/drops.js,
 * docs/HERCULES-CONTRACT.md), driven on a RoomCore in Node. Part of
 * npm run rooms:selftest.
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
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { ROOM_CAP } from '../src/game/paradrop.js';

const profile = { airframe: 'hercules3077', map: 'itaipu', figure: 1, livery: null, parts: null };

export function dropsSection(check) {
  console.log('the room\'s paradrops');
  let tokens = 0;
  const newToken = () => {
    tokens += 1;
    return `7d${tokens.toString(16).padStart(30, '0')}`;
  };
  let now = 7_000_000;
  const sock = (name) => ({ name, got: [], closed: null });
  const run = (actions) => {
    for (const a of actions) {
      if (a.send) {
        a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
      }
    }
    return actions;
  };
  const hello = (room, s) => run(room.hello(s, {
    type: 'hello', proto: PROTO, build: 'fdfpv', name: [1, 2, 30], profile, level: ROOM_LEVEL,
  }, now, `10.0.3.${s.name.length}`, newToken));
  /* A second apart, under the room's text rate. */
  const say = (room, s, msg) => {
    now += 1000;
    return run(room.message(s, JSON.stringify(msg), now));
  };
  const got = (s, type) => s.got.filter((m) => m.type === type);
  const drop = (over = {}) => ({
    type: 'drop', af: 'hercules3077', map: 'itaipu', t: 100.5, tp: 30.25, p: [10, 80, -20], v: [15, -1, 2],
    air: { map: 'itaipu', preset: 'gusty', seed: 77 }, rest: [40.5, 3.25, -10], wet: false, ...over,
  });

  const meta = { code: 'DROP22', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: now - 1000 };
  const room = new RoomCore(meta);
  const a = sock('aaa');
  const b = sock('bb');
  hello(room, a);
  hello(room, b);
  const stored = say(room, a, drop());
  const da = got(a, 'drop')[0];
  const db = got(b, 'drop')[0];
  check('a drop is numbered, kept and sent to every pilot, the dropper too',
    stored.some((x) => x.store === 'drops') && da && db && da.id === 1 && db.id === 1 && da.seat === db.seat
    && JSON.stringify(da.rest) === JSON.stringify([40.5, 3.25, -10]) && da.air.seed === 77, JSON.stringify(db));
  say(room, a, drop({ af: 'cub1400' }));
  say(room, a, drop({ map: 'swiss2' }));
  say(room, a, drop({ p: [Infinity, 0, 0] }));
  say(room, a, drop({ v: [900, 0, 0] }));
  say(room, a, drop({ air: { map: 'itaipu', preset: 'hurricane', seed: 1 } }));
  say(room, a, drop({ wet: 'yes' }));
  check('a record that is not one is nothing: another aircraft, map, a non finite or impossible number, an unknown sky',
    got(b, 'drop').length === 1 && room.drops.list.length === 1);
  say(room, b, drop({ rest: [41, 3, -9], air: null }));
  const c = sock('cccc');
  hello(room, c);
  const late = got(c, 'drops')[0];
  check('a late joiner is sent every drop on the field, as it lies',
    late && late.list.length === 2 && late.list[0].id === 1 && late.list[1].id === 2
    && JSON.stringify(late.list[0].rest) === JSON.stringify(da.rest), late ? `${late.list.length} drops` : 'none');

  const restored = new RoomCore({ ...meta });
  restored.drops.restore(JSON.parse(JSON.stringify(room.drops.list)));
  const d = sock('ddddd');
  hello(restored, d);
  check('after a restart the stored drops come back', got(d, 'drops')[0]?.list.length === 2);

  for (let i = room.drops.list.length; i < ROOM_CAP; i += 1) {
    room.drops.list.push({ ...room.drops.list[0], id: i + 1 });
  }
  const before = got(b, 'drop').length;
  say(room, a, drop());
  check(`at the cap, ${ROOM_CAP}, a drop is refused and nothing is taken away`,
    room.drops.list.length === ROOM_CAP && got(b, 'drop').length === before && got(a, 'refused').some((m) => m.why === 'drops_full')
    && room.drops.list[0].id === 1);
}
