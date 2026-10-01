/*
 * rooms-selftest-warlobby.js: the war's lobby (edge/rooms/warlobby.js),
 * for rooms:selftest. A room made for the war, its pilots saying ready:
 * the five seconds when all are, stopped by one who is not and not by one
 * who joins; the 45 seconds from the first ready, with whoever is ready
 * then or nobody; the host's start now; the host's mission; a leaver; the
 * match clearing every flag, and its end finding the lobby again; no lobby
 * in a room not made for the war, nor during a match.
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

import { PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { LOBBY_COUNTDOWN_MS, LOBBY_DEADLINE_MS } from '../edge/rooms/warlobby.js';
import { PROTO } from '../src/share/roomwire.js';

/* A room at room ms 0, its `n` pilots seated: made for the war unless
 * `mode` says otherwise. */
function lobbyRoom({ n = 2, mode = 'war', mission = 'itaipu-1' } = {}) {
  const r = new RoomCore({
    code: 'L0BBY1', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: 0, public: true, mode, mission,
  });
  let tokens = 0;
  const env = { r, socks: [], clock: 0, ticks: 0 };
  env.apply = (actions) => {
    for (const x of actions) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      }
      if (x.tick) {
        env.ticks += 1;
      }
    }
  };
  env.join = (i) => {
    const so = { name: `lobby${i}`, address: `10.8.8.${i + 1}`, got: [] };
    env.socks[i] = so;
    env.apply(r.open(so, env.clock));
    env.apply(r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', war: 1, name: [i, i, 30 + i], profile: { airframe: 'cub1400', map: 'itaipu', figure: 1, livery: null, parts: null },
    }), env.clock, so.address, () => (tokens += 1).toString(16).padStart(32, '0')));
    return so;
  };
  for (let i = 0; i < n; i += 1) {
    env.join(i);
  }
  env.say = (i, obj) => env.apply(r.message(env.socks[i], JSON.stringify(obj), env.clock, env.socks[i].address));
  env.ready = (i, ready = true) => env.say(i, { type: 'lobby', op: 'ready', ready });
  env.at = (t) => {
    for (let c = env.clock + 1; c <= t; c += 1) {
      env.clock = c;
      if (c % 50 === 0) {
        env.apply(r.tick(c));
      }
    }
  };
  env.leave = (i) => env.apply(r.close(env.socks[i], env.clock));
  /* The newest lobby a pilot was told, or its welcome's. */
  env.lobby = (i = 0) => {
    const told = env.socks[i].got.filter((m) => m && m.type === 'lobby').at(-1);
    return told ? told.lobby : (env.socks[i].got.find((m) => m && m.type === 'welcome') || {}).lobby;
  };
  env.war = () => r.war.view(r);
  return env;
}

export function warLobbySection(check) {
  console.log('war: the lobby');
  {
    const e = lobbyRoom();
    const w = e.socks[0].got.find((m) => m.type === 'welcome');
    check('a room made for the war welcomes with its lobby: the mission, nobody ready, no times',
      JSON.stringify(w.lobby) === '{"mission":"itaipu-1","ready":{},"countdownAt":null,"deadlineAt":null}', JSON.stringify(w.lobby));
    e.at(1000);
    e.ready(0);
    const one = e.lobby(1);
    check('one of two ready: everybody is told, the 45 s run from it, no five seconds',
      one.ready['1'] === true && !one.ready['2'] && one.deadlineAt === 1000 + LOBBY_DEADLINE_MS && one.countdownAt === null, JSON.stringify(one));
    check('and the room\'s clock runs for it with nobody flying', e.r.ticking === true);
    e.at(2000);
    e.ready(1);
    const both = e.lobby(0);
    check('both ready: the five seconds', both.countdownAt === 2000 + LOBBY_COUNTDOWN_MS && both.deadlineAt === 1000 + LOBBY_DEADLINE_MS, JSON.stringify(both));
    e.at(3000);
    e.ready(1, false);
    check('one says not ready in them: they stop, the 45 s go on', e.lobby(0).countdownAt === null && e.lobby(0).deadlineAt === 1000 + LOBBY_DEADLINE_MS,
      JSON.stringify(e.lobby(0)));
    e.ready(1);
    const armed = e.lobby(0).countdownAt;
    e.at(4000);
    e.join(2);
    check('a pilot who joins in the five seconds is not ready and does not stop them', e.lobby(2).countdownAt === armed && !e.lobby(2).ready['3'],
      JSON.stringify(e.lobby(2)));
    e.at(armed + 100);
    check('at the end of them the room\'s mission starts, briefing, for everybody here', e.war().state === 'briefing' && e.war().mission === 'itaipu-1',
      JSON.stringify({ state: e.war().state, mission: e.war().mission }));
    check('and the lobby is cleared: nobody ready, no times', JSON.stringify(e.lobby(2)) === '{"mission":"itaipu-1","ready":{},"countdownAt":null,"deadlineAt":null}',
      JSON.stringify(e.lobby(2)));
    e.ready(1);
    check('a ready during the match is passed over', JSON.stringify(e.lobby(1).ready) === '{}');
    e.say(0, { type: 'war', op: 'end' });
    e.at(e.clock + 200);
    check('the match ended: the room is back in its lobby, nobody ready', e.war().state === 'ended' && JSON.stringify(e.lobby(0).ready) === '{}'
      && e.r.warLobby.open(e.r));
  }
  {
    const e = lobbyRoom({ n: 3 });
    e.at(500);
    e.ready(1);
    e.at(500 + LOBBY_DEADLINE_MS - 100);
    check('one of three ready: nothing starts before the 45 s', e.war().state === 'lobby');
    e.at(500 + LOBBY_DEADLINE_MS + 100);
    check('at 45 s it starts with whoever is ready', e.war().state === 'briefing', e.war().state);
  }
  {
    const e = lobbyRoom();
    e.at(500);
    e.ready(0);
    e.ready(0, false);
    check('the last ready taken back: no times', e.lobby(0).deadlineAt === null && e.lobby(0).countdownAt === null, JSON.stringify(e.lobby(0)));
    e.at(500 + LOBBY_DEADLINE_MS + 200);
    check('and nothing starts on its own', e.war().state === 'lobby');
  }
  {
    const e = lobbyRoom();
    e.say(1, { type: 'lobby', op: 'mission', mission: 'itaipu-2' });
    check('the mission is the host\'s to change', e.socks[1].got.some((m) => m.type === 'refused' && m.why === 'host') && e.lobby(0).mission === 'itaipu-1');
    e.say(0, { type: 'lobby', op: 'mission', mission: 'nowhere-9' });
    check('a mission nobody wrote is passed over', e.lobby(0).mission === 'itaipu-1');
    e.say(0, { type: 'lobby', op: 'mission', mission: 'itaipu-2' });
    check('the host sets mission 2: everybody told, the room keeps it', e.lobby(1).mission === 'itaipu-2' && e.r.meta.mission === 'itaipu-2', JSON.stringify(e.lobby(1)));
    e.at(100);
    e.ready(0);
    e.ready(1);
    e.at(100 + LOBBY_COUNTDOWN_MS + 100);
    check('and the lobby starts mission 2', e.war().state === 'briefing' && e.war().mission === 'itaipu-2', JSON.stringify({ state: e.war().state, mission: e.war().mission }));
  }
  {
    const e = lobbyRoom();
    e.at(100);
    e.ready(0);
    e.say(0, { type: 'war', op: 'start', mission: 'itaipu-1', intro: true });
    e.at(200);
    check('the host\'s start now starts at once, and clears the lobby', e.war().state === 'briefing' && JSON.stringify(e.lobby(1).ready) === '{}'
      && e.lobby(1).deadlineAt === null);
  }
  {
    const e = lobbyRoom();
    e.at(100);
    e.ready(0);
    e.leave(1);
    check('the one not ready leaves: all here are ready, the five seconds', e.lobby(0).countdownAt === 100 + LOBBY_COUNTDOWN_MS, JSON.stringify(e.lobby(0)));
  }
  {
    const e = lobbyRoom({ mode: null });
    const w = e.socks[0].got.find((m) => m.type === 'welcome');
    e.ready(0);
    e.ready(1);
    e.at(LOBBY_COUNTDOWN_MS + 200);
    check('a room not made for the war has no lobby: none in the welcome, ready passed over', !('lobby' in w)
      && !e.socks[0].got.some((m) => m.type === 'lobby') && e.war().state === 'lobby');
  }
}
