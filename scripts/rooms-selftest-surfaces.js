/*
 * rooms-selftest-surfaces.js: the room's stock surfaces only
 * (edge/rooms/core.js stockSurfaces, configs/surfaces.js), driven on a
 * RoomCore in Node. Part of npm run rooms:selftest.
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

import { PROTO, ROOM_LEVEL, checkProfile } from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';

const profile = { airframe: 'cub1400', map: 'itaipu', figure: 1, livery: null, parts: { prop: 'stock', addons: [], surfaces: { a: 'extreme', e: '3d', r: 'stock' } } };

export function stockSurfacesSection(check) {
  console.log('the room\'s stock surfaces');
  let tokens = 0;
  const newToken = () => {
    tokens += 1;
    return `5f${tokens.toString(16).padStart(30, '0')}`;
  };
  const now = 6_100_000;
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
  const say = (room, s, msg) => run(room.message(s, JSON.stringify(msg), now));
  const got = (s, type) => s.got.filter((m) => m.type === type);

  const meta = { code: 'STCK22', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: now - 1000 };
  const room = new RoomCore(meta);
  const host = sock('host');
  const b = sock('bb');
  hello(room, host);
  hello(room, b);
  check('a room nobody set welcomes into the pilots\' own surfaces', got(b, 'welcome')[0].stockSurfaces === false);
  const peer = got(b, 'welcome')[0].peers.find((p) => p.profile)?.profile;
  check('a pilot\'s tiers ride in their profile\'s parts', JSON.stringify(checkProfile(profile).parts.surfaces) === JSON.stringify(profile.parts.surfaces)
    && JSON.stringify(peer && peer.parts.surfaces) === JSON.stringify(profile.parts.surfaces));
  say(room, b, { type: 'stockSurfaces', on: true });
  check('only the host sets it', meta.stockSurfaces === undefined && got(b, 'refused').some((m) => m.why === 'host'));
  say(room, host, { type: 'stockSurfaces', on: 'yes' });
  check('a value that is not true or false is nothing', meta.stockSurfaces === undefined && got(host, 'stockSurfaces').length === 0);
  const stored = say(room, host, { type: 'stockSurfaces', on: true });
  check('the host sets it: kept with the meta, everybody told',
    stored.some((a) => a.store === 'meta') && meta.stockSurfaces === true
    && got(host, 'stockSurfaces').at(-1)?.on === true && got(b, 'stockSurfaces').at(-1)?.on === true);
  const c = sock('ccc');
  hello(room, c);
  check('a joiner is welcomed into it', got(c, 'welcome')[0].stockSurfaces === true);
  say(room, host, { type: 'stockSurfaces', on: false });
  check('and off again', meta.stockSurfaces === false && got(c, 'stockSurfaces').at(-1)?.on === false);
}
