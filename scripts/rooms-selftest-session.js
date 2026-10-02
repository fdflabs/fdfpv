/*
 * rooms-selftest-session.js: the room as one shared session, the server's
 * half, a section of npm run rooms:selftest kept in its own file as the
 * combat and browser sections are.
 *
 * The owner, 2026-09-29: "i cant see the 3 people in my room, force
 * everyone in the same game and the same thing". What the room holds for
 * that (edge/rooms/core.js):
 *
 *   the world   the host moves a private room to another world, everybody
 *               is told and a joiner is welcomed into it; a public room,
 *               a pilot who is not the host and a game under way refuse
 *   the status  why a pilot sends no poses rides in their profile, and a
 *               status the room does not know is dropped, never refused
 *   the level   a tab older than the room's rules (ROOM_LEVEL) is told to
 *               reload, whether it comes in after a newer one or was
 *               there first; tabs of one level are left alone, so a
 *               restart under old tabs changes nothing for them
 *   the drop    a pilot whose socket went without a clean leave is said
 *               to have dropped, so the others can say "reconnecting"
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

import { CLOSE, PROTO, ROOM_LEVEL, ROOM_STATUSES, checkProfile } from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';

const profile = { airframe: 'cub1400', map: 'swiss2', figure: 1, livery: null, parts: null };

export function sessionSection(check) {
  console.log('one session');
  let tokens = 0;
  const newToken = () => {
    tokens += 1;
    return `5e${tokens.toString(16).padStart(30, '0')}`;
  };
  let now = 5_000_000;
  const sock = (name) => ({ name, got: [], closed: null });
  const run = (actions) => {
    for (const a of actions) {
      if (a.send) {
        a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
      } else if (a.close) {
        a.close.closed = { code: a.code, reason: a.reason };
      }
    }
    return actions;
  };
  const hello = (room, s, extra = {}) => run(room.hello(s, {
    type: 'hello', proto: PROTO, build: 'fdfpv', name: [1, 2, 30], profile, ...extra,
  }, now, `10.0.1.${s.name.length}`, newToken));
  const say = (room, s, msg) => run(room.message(s, JSON.stringify(msg), now));
  const got = (s, type) => s.got.filter((m) => m.type === type);

  /* The world. */
  const meta = { code: 'SESS22', cap: PRIVATE_CAP, friendly: false, map: 'alps', epoch: now - 1000 };
  const room = new RoomCore(meta);
  const host = sock('host');
  const b = sock('bb');
  hello(room, host, { level: ROOM_LEVEL });
  hello(room, b, { level: ROOM_LEVEL });
  check('the room\'s world is in the welcome', got(b, 'welcome')[0].map === 'alps');
  say(room, b, { type: 'world', map: 'itaipu' });
  check('a pilot who is not the host cannot move the room',
    meta.map === 'alps' && got(b, 'refused').some((m) => m.why === 'host') && got(host, 'world').length === 0);
  const stored = say(room, host, { type: 'world', map: 'itaipu' });
  check('the host moves it, and the room keeps it with its meta',
    meta.map === 'itaipu' && stored.some((a) => a.store === 'meta' && a.value.map === 'itaipu'));
  check('everybody is told, the host too',
    got(host, 'world').at(-1)?.map === 'itaipu' && got(b, 'world').at(-1)?.map === 'itaipu');
  say(room, host, { type: 'world', map: 'Not A World' });
  check('a world that is not an id is nothing', meta.map === 'itaipu');
  say(room, host, { type: 'world', map: 'yellowstone' });
  check('nor is a retired world, which an old page can still offer', meta.map === 'itaipu' && got(host, 'world').at(-1)?.map === 'itaipu');
  const c = sock('ccc');
  hello(room, c, { level: ROOM_LEVEL });
  check('a joiner is welcomed into the world the host moved it to', got(c, 'welcome')[0].map === 'itaipu');
  run(room.message(host, JSON.stringify({ type: 'combat', op: 'start', minutes: 3 }), now));
  const busy = say(room, host, { type: 'world', map: 'alps' });
  check('not while a game is on, and it says which',
    meta.map === 'itaipu' && busy.some((a) => a.send === host && JSON.parse(a.data).why === 'combat'));
  const pub = new RoomCore({ ...meta, code: 'PUBL22', map: 'alps', public: true });
  const ph = sock('pubhost');
  hello(pub, ph, { level: ROOM_LEVEL });
  say(pub, ph, { type: 'world', map: 'swiss2' });
  check('a public room stays in the world it is listed under',
    pub.meta.map === 'alps' && got(ph, 'refused').some((m) => m.why === 'world_public'));

  /* The status. */
  for (const status of ROOM_STATUSES) {
    check(`a profile carries status ${status}`, checkProfile({ ...profile, status })?.status === status);
  }
  check('an unknown status is dropped, the profile kept',
    checkProfile({ ...profile, status: 'asleep' }) !== null && !('status' in checkProfile({ ...profile, status: 'asleep' })));
  say(room, b, { type: 'profile', profile: { ...profile, status: 'paused' } });
  check('the others are told a pilot paused', got(c, 'profile').some((m) => m.profile.status === 'paused'));

  /* The level. */
  now += 10;
  const lvl = new RoomCore({ ...meta, code: 'LEVL22', map: 'swiss2' });
  const old1 = sock('old1');
  const old2 = sock('old22');
  hello(lvl, old1);
  hello(lvl, old2);
  check('tabs of one level fly together as they did', !old1.closed && !old2.closed && got(old2, 'welcome').length === 1);
  const fresh = sock('fresh1');
  hello(lvl, fresh, { level: ROOM_LEVEL });
  check('a newer tab has the older ones told to reload',
    old1.closed?.code === CLOSE.update && old2.closed?.code === CLOSE.update && !fresh.closed);
  run(lvl.close(old1, now, CLOSE.update));
  run(lvl.close(old2, now, CLOSE.update));
  const late = sock('late22');
  const lateOut = hello(lvl, late);
  check('and an older tab coming in after is told the same, never seated',
    late.closed?.code === CLOSE.update && !lateOut.some((a) => a.attach));

  /* The drop. */
  const d = new RoomCore({ ...meta, code: 'DROP22', map: 'swiss2' });
  const d1 = sock('d1');
  const d2 = sock('d22');
  const d3 = sock('d333');
  hello(d, d1, { level: ROOM_LEVEL });
  hello(d, d2, { level: ROOM_LEVEL });
  hello(d, d3, { level: ROOM_LEVEL });
  run(d.close(d2, now, 1006));
  const lost = got(d1, 'leave').at(-1);
  check('a socket lost without a leave is said to have dropped', lost && lost.drop === true, JSON.stringify(lost));
  run(d.close(d3, now, 1000));
  const left = got(d1, 'leave').at(-1);
  check('a clean leave is a leave', left && left.seat !== lost.seat && !('drop' in left), JSON.stringify(left));
}
