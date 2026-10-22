/*
 * rooms-selftest-setup.js: a private room's activity changed by its host
 * between rounds (edge/rooms/core.js setup, COMPLETENESS 77), driven on a
 * RoomCore in Node. Part of npm run rooms:selftest.
 *
 * Free flight to the war, each pilot told the new game's lobby; into the
 * war, the second pilot's consent given (both
 * fight) and declined (the host fights alone, the decliner sits it out in
 * the lobby, not waited for, its ready passed over, and still out after a
 * reload). The refusals: not the host, a public room, a round on, free
 * flight flying, the war off its world, a game this build no longer has.
 * The war left for free flight takes its match and mission with it. Catch
 * the Ace and Streamer Combat, the games this moved between until the
 * combat-only cut (2026-10-20), are no activity now.
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

import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { LOBBY_COUNTDOWN_MS } from '../edge/rooms/gamelobby.js';
import { PROTO, PUBLIC_CAP, ROOM_LEVEL, WAR_JOIN } from '../src/share/roomwire.js';

/* A room at room ms 0 with `n` pilots, made for `mode` on `map`. */
function setupRoom({
  n = 2, mode = null, map = 'itaipu', open = false,
} = {}) {
  const r = new RoomCore({
    code: 'SETUP1', cap: open ? PUBLIC_CAP : PRIVATE_CAP, friendly: false, map, epoch: 0, public: open, mode, mission: null,
  }, { devMissions: true });
  let tokens = 0;
  const e = { r, socks: [], clock: 0 };
  e.apply = (actions) => {
    for (const x of actions) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      }
      if (x.store === 'meta') {
        e.stored = structuredClone(x.value);
      }
    }
    return actions;
  };
  const hello = (i, token = null) => JSON.stringify({
    type: 'hello', proto: PROTO, build: 't', level: ROOM_LEVEL, war: WAR_JOIN, name: [i, i, 30 + i],
    profile: { airframe: 'bramor2300', map, figure: 1, livery: null, parts: null }, ...(token ? { token } : {}),
  });
  e.join = (i, token = null) => {
    const so = { name: `setup${i}`, address: `10.6.6.${i + 1}`, got: [] };
    e.socks[i] = so;
    e.apply(r.open(so, e.clock));
    e.apply(r.message(so, hello(i, token), e.clock, so.address, () => (tokens += 1).toString(16).padStart(32, '0')));
    so.welcome = so.got.find((m) => m.type === 'welcome');
    return so;
  };
  for (let i = 0; i < n; i += 1) {
    e.join(i);
  }
  e.say = (i, obj) => e.apply(r.message(e.socks[i], JSON.stringify(obj), e.clock, e.socks[i].address));
  e.at = (t) => {
    for (let c = e.clock + 1; c <= t; c += 1) {
      e.clock = c;
      if (c % 50 === 0) {
        e.apply(r.tick(c));
      }
    }
  };
  e.told = (i, type) => e.socks[i].got.filter((m) => m && m.type === type);
  e.refused = (i) => e.told(i, 'refused').map((m) => m.why);
  e.lobby = (i = 0) => {
    const said = e.socks[i].got.filter((m) => m && (m.type === 'lobby' || m.type === 'setup')).at(-1);
    return said ? said.lobby : e.socks[i].welcome.lobby;
  };
  e.players = () => r.war.players(r);
  return e;
}

export function setupSection(check) {
  console.log('setup: a private room changes its activity');
  {
    const e = setupRoom();
    check('the welcome says the room takes a change of activity', e.socks[0].welcome.setupInPlace === true);
    e.say(1, { type: 'setup', mode: 'war' });
    check('only its host changes it', e.refused(1).includes('host') && e.r.meta.mode === null);
    e.say(0, { type: 'setup', mode: 'nowhere' });
    check('an activity there is not is passed over', e.r.meta.mode === null && !e.told(0, 'setup').length);
    e.say(0, { type: 'setup', mode: 'tag' });
    check('and so is a game this build no longer has (Catch the Ace, an older page\'s)', e.r.meta.mode === null && !e.told(0, 'setup').length);
    e.say(0, { type: 'setup', mode: 'war' });
    const told = e.told(1, 'setup').at(-1);
    check('free flight to the war: everybody told the war, its mission and its lobby, nobody ready',
      Boolean(told) && told.mode === 'war' && told.mission === 'itaipu-1' && told.lobby.mission === 'itaipu-1' && JSON.stringify(told.lobby.ready) === '{}'
      && e.r.meta.mode === 'war' && e.stored.mode === 'war', JSON.stringify(told));
    const late = e.join(2);
    check('a pilot who joins after is welcomed into the war', late.welcome.mode === 'war' && late.welcome.lobby.mission === 'itaipu-1', JSON.stringify(late.welcome.lobby));
  }
  {
    const e = setupRoom();
    e.at(100);
    e.say(0, { type: 'setup', mode: 'war' });
    const told = e.told(1, 'setup').at(-1);
    const bToken = e.socks[1].welcome.token;
    check('into the war: everybody told the war, its mission and its lobby, the second pilot sitting out until they consent',
      Boolean(told) && told.mode === 'war' && told.mission === 'itaipu-1' && told.lobby.mission === 'itaipu-1' && JSON.stringify(told.lobby.out) === '{"2":true}'
      && JSON.stringify(e.r.meta.unconsented) === JSON.stringify([bToken]), JSON.stringify(told));
    check('kept with the room, so a restart keeps it', JSON.stringify(e.stored.unconsented) === JSON.stringify([bToken]));
    e.say(1, { type: 'setup', consent: true });
    check('the second pilot consents: out of nobody\'s way, everybody told', !('out' in e.lobby(0)) && e.r.meta.unconsented.length === 0, JSON.stringify(e.lobby(0)));
    e.say(0, { type: 'lobby', op: 'ready', ready: true });
    e.say(1, { type: 'lobby', op: 'ready', ready: true });
    e.at(100 + LOBBY_COUNTDOWN_MS + 200);
    check('both ready: the war starts with both of them', e.r.war.on() && JSON.stringify(e.players()) === '[1,2]', JSON.stringify(e.players()));
    e.say(0, { type: 'setup', mode: null });
    check('while it runs, the host cannot change the activity: refused, the war', e.refused(0).includes('war') && e.r.meta.mode === 'war');
    e.say(0, { type: 'war', op: 'end' });
    e.at(e.clock + 200);
    e.say(0, { type: 'setup', mode: null });
    check('ended, the war to free flight: its match and mission go with it', e.r.meta.mode === null && e.r.war.match === null && e.r.meta.mission === null
      && e.told(1, 'setup').at(-1).mission === null, JSON.stringify({ mode: e.r.meta.mode, mission: e.r.meta.mission }));
    check('and every page is told the war is back to no match', e.told(1, 'war').at(-1)?.war?.state === 'lobby', JSON.stringify(e.told(1, 'war').at(-1)));
  }
  {
    const e = setupRoom();
    e.at(100);
    e.say(0, { type: 'setup', mode: 'war' });
    e.say(1, { type: 'lobby', op: 'ready', ready: true });
    check('a pilot who declined (said nothing): its ready is passed over', JSON.stringify(e.lobby(0).ready) === '{}', JSON.stringify(e.lobby(0)));
    e.say(0, { type: 'lobby', op: 'ready', ready: true });
    check('and it is not waited for: the host ready alone starts the five seconds', e.lobby(0).countdownAt !== null, JSON.stringify(e.lobby(0)));
    e.at(e.clock + LOBBY_COUNTDOWN_MS + 200);
    check('the war starts with the host alone; the decliner sits it out in the lobby', e.r.war.on() && JSON.stringify(e.players()) === '[1]',
      JSON.stringify(e.players()));
    const back = e.join(1, e.socks[1].welcome.token);
    check('reloaded into its own seat, it is still not one of the war\'s players', back.welcome.seat === 2 && JSON.stringify(e.players()) === '[1]',
      JSON.stringify({ seat: back.welcome.seat, players: e.players() }));
    e.say(1, { type: 'setup', consent: true });
    check('consenting while it runs, it joins the war', JSON.stringify(e.players()) === '[1,2]', JSON.stringify(e.players()));
  }
  {
    const pub = setupRoom({ open: true });
    pub.say(0, { type: 'setup', mode: 'war' });
    check('a public room keeps the activity it is listed for: refused', pub.refused(0).includes('setup_public') && pub.r.meta.mode === null);
    const swiss = setupRoom({ map: 'interior' });
    swiss.say(0, { type: 'setup', mode: 'war' });
    check('the war off a war mission\'s world: refused', swiss.refused(0).includes('war_map') && swiss.r.meta.mode === null);
    swiss.say(0, { type: 'lobby', op: 'ready', ready: true });
    swiss.say(1, { type: 'lobby', op: 'ready', ready: true });
    swiss.at(LOBBY_COUNTDOWN_MS + 200);
    swiss.say(0, { type: 'setup', mode: 'war' });
    check('free flight flying, which runs until the room empties: refused', swiss.refused(0).includes('setup_flying') && swiss.r.meta.mode === null,
      JSON.stringify(swiss.refused(0)));
  }
}
