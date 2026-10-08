/*
 * rooms-selftest-weather.js: the room's air (edge/rooms/core.js weather,
 * docs/WEATHER-CONTRACT.md), driven on a RoomCore in Node. Part of
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

const profile = { airframe: 'cub1400', map: 'itaipu', figure: 1, livery: null, parts: null };

export function weatherSection(check) {
  console.log('the room\'s air');
  let tokens = 0;
  const newToken = () => {
    tokens += 1;
    return `7e${tokens.toString(16).padStart(30, '0')}`;
  };
  const now = 6_000_000;
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
  }, now, `10.0.2.${s.name.length}`, newToken));
  const say = (room, s, msg) => run(room.message(s, JSON.stringify(msg), now));
  const got = (s, type) => s.got.filter((m) => m.type === type);

  const meta = { code: 'WTHR22', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: now - 1000 };
  const room = new RoomCore(meta);
  const host = sock('host');
  const b = sock('bb');
  hello(room, host);
  hello(room, b);
  const w0 = got(b, 'welcome')[0].weather;
  check('a room nobody set the air of welcomes into calm', w0 && w0.preset === 'calm' && w0.seed === 0);
  say(room, b, { type: 'weather', preset: 'gusty' });
  check('only the host sets it', meta.weather === undefined && got(b, 'refused').some((m) => m.why === 'host'));
  say(room, host, { type: 'weather', preset: 'hurricane' });
  say(room, host, { type: 'weather', preset: 'toString' });
  check('a preset that is not one is nothing', meta.weather === undefined && got(host, 'weather').length === 0);
  const stored = say(room, host, { type: 'weather', preset: 'front' });
  const hw = got(host, 'weather').at(-1);
  const bw = got(b, 'weather').at(-1);
  check('the host sets it: kept with the meta, everybody told the same preset and seed',
    stored.some((a) => a.store === 'meta') && meta.weather.preset === 'front'
    && Number.isInteger(meta.weather.seed) && meta.weather.seed >= 0 && meta.weather.seed < 2 ** 32
    && hw && bw && hw.preset === 'front' && hw.seed === meta.weather.seed && bw.seed === hw.seed,
    JSON.stringify(meta.weather));
  const c = sock('ccc');
  hello(room, c);
  const cw = got(c, 'welcome')[0].weather;
  check('a joiner is welcomed into the same air', cw.preset === 'front' && cw.seed === meta.weather.seed);
  say(room, host, { type: 'weather', preset: 'calm' });
  check('calm again is calm with seed 0', meta.weather.preset === 'calm' && meta.weather.seed === 0
    && got(c, 'weather').at(-1)?.preset === 'calm');
}
