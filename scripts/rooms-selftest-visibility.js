/*
 * rooms-selftest-visibility.js: who joins, changed in place by the host
 * with others here (edge/rooms/core.js setPublic, edge/rooms/lobby.js
 * reportRoom, docs/redesign/SESSIONS.md section 2), driven on a RoomCore
 * in Node. Part of npm run rooms:selftest.
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
  PROTO, PUBLIC_CAP, ROOM_LEVEL, WAR_JOIN,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { LobbyBook, reportRoom } from '../edge/rooms/lobby.js';
import { withHeld } from './lib/held.js';

const profile = { airframe: 'bramor2300', map: 'itaipu', figure: 1, livery: null, parts: null };

export function visibilitySection(check) {
  console.log('who joins, changed in place');
  let tokens = 0;
  const newToken = () => {
    tokens += 1;
    return `7a${tokens.toString(16).padStart(30, '0')}`;
  };
  const now = 7_200_000;
  const sock = (name) => ({ name, got: [], closed: null });
  const run = (actions) => {
    for (const a of actions) {
      if (a.send) {
        a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
      }
    }
    return actions;
  };
  let pilots = 0;
  const hello = (room, s) => {
    pilots += 1;
    return run(room.hello(s, {
      type: 'hello', proto: PROTO, build: 'fdfpv', name: [1, 2, 30 + (pilots % 60)], profile, level: ROOM_LEVEL, war: WAR_JOIN,
    }, now, `10.0.4.${pilots}`, newToken));
  };
  const say = (room, s, msg) => run(room.message(s, JSON.stringify(msg), now));
  const got = (s, type) => s.got.filter((m) => m.type === type);
  const refused = (s) => got(s, 'refused').map((m) => m.why);
  const roomOf = (meta, options = { publicRooms: true }) => new RoomCore({
    code: 'V1S1B1', friendly: false, map: 'itaipu', epoch: now - 1000, name: null, pick: [1, 1, 11], mission: null, hidden: false, ...meta,
  }, options);

  {
    const room = roomOf({ cap: PRIVATE_CAP, public: false, mode: null });
    const host = sock('host');
    const b = sock('bb');
    hello(room, host);
    hello(room, b);
    check('the welcome says the room takes the change in place', got(b, 'welcome')[0].publicInPlace === true);
    say(room, b, { type: 'public', on: true });
    check('only the host changes it', room.meta.public === false && refused(b).includes('host'));
    say(room, host, { type: 'public', on: 'yes' });
    check('a value that is not true or false is nothing', room.meta.public === false && got(host, 'public').length === 0 && !refused(host).length);
    const stored = say(room, host, { type: 'public', on: true });
    check('the host makes it public: kept with the meta, the public cap, everybody told',
      stored.some((a) => a.store === 'meta') && room.meta.public === true && room.meta.cap === PUBLIC_CAP
      && got(host, 'public').at(-1)?.on === true && got(b, 'public').at(-1)?.cap === PUBLIC_CAP, JSON.stringify(got(b, 'public')));
    const again = say(room, host, { type: 'public', on: true });
    check('asked again: the asker told, nothing stored, nobody else told', !again.some((a) => a.store) && got(b, 'public').length === 1 && got(host, 'public').length === 2);
    const c = sock('ccc');
    hello(room, c);
    check('a joiner is welcomed into a public room with its cap', got(c, 'welcome')[0].public === true && got(c, 'welcome')[0].cap === PUBLIC_CAP);
    say(room, host, { type: 'public', on: false });
    check('and private again: the private cap, everybody told', room.meta.public === false && room.meta.cap === PRIVATE_CAP
      && got(c, 'public').at(-1)?.on === false && got(c, 'public').at(-1)?.cap === PRIVATE_CAP);
  }

  {
    const room = roomOf({ cap: PRIVATE_CAP, public: false, mode: null }, {});
    const host = sock('host');
    hello(room, host);
    say(room, host, { type: 'public', on: true });
    check('where public rooms are closed it stays private, the host told why', room.meta.public === false && refused(host).includes('public_closed'));
  }

  {
    /* Mission 1 held in development (scripts/lib/held.js), as it was
     * until the owner released Act 1 on 2026-10-15. */
    withHeld(['itaipu-1'], () => {
      const room = roomOf({ cap: PRIVATE_CAP, public: false, mode: 'war', mission: 'itaipu-1' });
      const host = sock('host');
      hello(room, host);
      say(room, host, { type: 'public', on: true });
      check('a war room for a mission in development stays private (the release gate)', room.meta.public === false && refused(host).includes('war_unreleased'), JSON.stringify(refused(host)));
      const dev = roomOf({ cap: PRIVATE_CAP, public: false, mode: 'war', mission: 'itaipu-1' }, { publicRooms: true, devMissions: true });
      const h2 = sock('host2');
      hello(dev, h2);
      say(dev, h2, { type: 'public', on: true });
      check('and goes public on a server that starts missions in development', dev.meta.public === true);
    });
    const drill = roomOf({ cap: PRIVATE_CAP, public: false, mode: 'war', mission: 'itaipu-drill' });
    const h3 = sock('host3');
    hello(drill, h3);
    say(drill, h3, { type: 'public', on: true });
    check('a war room for a released mission goes public', drill.meta.public === true);
    /* 1 to 4 released 2026-10-15, 5 and 6 2026-10-16. */
    for (const [i, id] of ['itaipu-1', 'itaipu-2', 'itaipu-3', 'itaipu-4', 'itaipu-5', 'itaipu-6'].entries()) {
      const act = roomOf({ cap: PRIVATE_CAP, public: false, mode: 'war', mission: id });
      const h = sock(`host${4 + i}`);
      hello(act, h);
      say(act, h, { type: 'public', on: true });
      check(`${id}, released (the owner): its war room goes public, nothing refused`, act.meta.public === true && !refused(h).length, JSON.stringify(refused(h)));
    }
  }

  {
    const room = roomOf({ cap: PRIVATE_CAP, public: false, mode: null });
    const host = sock('host');
    hello(room, host);
    say(room, host, { type: 'war', op: 'start', mission: 'itaipu-drill' });
    say(room, host, { type: 'public', on: true });
    check('a room not made for the war, the war on: stays private', room.game() === 'war' && room.meta.public === false && refused(host).includes('public_game'),
      `${room.game()} ${JSON.stringify(refused(host))}`);
  }

  {
    const room = roomOf({ cap: PUBLIC_CAP, public: true, mode: null });
    const socks = [];
    for (let i = 0; i <= PRIVATE_CAP; i += 1) {
      socks.push(sock(`p${i}`));
      hello(room, socks[i]);
    }
    say(room, socks[0], { type: 'public', on: false });
    check(`more than ${PRIVATE_CAP} people here: stays public`, room.meta.public === true && refused(socks[0]).includes('private_full'), JSON.stringify(refused(socks[0])));
  }

  {
    /* The lobby's book, as the room reports to it. */
    const lines = [];
    const env = {
      LOBBY: {
        idFromName: () => 'lobby',
        get: () => ({
          fetch: (url, init) => {
            lines.push(JSON.parse(init.body));
            return Promise.resolve(null);
          },
        }),
      },
    };
    const book = new LobbyBook();
    const room = roomOf({ cap: PUBLIC_CAP, public: true, mode: null });
    const host = sock('host');
    const b = sock('bb');
    hello(room, host);
    hello(room, b);
    reportRoom(env, room, now);
    book.report(lines.at(-1), now);
    check('a public room with two here is listed', book.list(now).some((r) => r.code === 'V1S1B1' && r.n === 2));
    say(room, host, { type: 'public', on: false });
    reportRoom(env, room, now);
    book.report(lines.at(-1), now);
    check('made private: its last line says nobody, and the list drops it at once', lines.length === 2 && lines[1].n === 0 && !book.list(now).some((r) => r.code === 'V1S1B1'));
    reportRoom(env, room, now + 1000);
    check('a private room says nothing more', lines.length === 2);
    say(room, host, { type: 'public', on: true });
    reportRoom(env, room, now + 2000);
    book.report(lines.at(-1), now + 2000);
    check('public again: listed again with its pilots', lines.length === 3 && book.list(now + 2000).some((r) => r.code === 'V1S1B1' && r.n === 2));
  }
}
