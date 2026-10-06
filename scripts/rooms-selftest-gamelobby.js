/*
 * rooms-selftest-gamelobby.js: a game room's lobby (edge/rooms/gamelobby.js),
 * for rooms:selftest.
 *
 * The war's, as it was before the lobby was every game's, unchanged: a
 * room made for the war, its pilots saying ready:
 * the five seconds when all are, stopped by one who is not and not by one
 * who joins; the 45 seconds from the first ready, with whoever is ready
 * then or nobody; the host's start now; the host's mission; a leaver; a
 * host who leaves, the others starting without them; the match clearing
 * every flag, and its end finding the lobby again; no lobby during a
 * match, and a free flight room's lobby starting no war.
 *
 * Then combat's and tag's: the lobby in the welcome with the round's
 * setting, the host's alone to change; one pilot ready of two gives the
 * 45 s; both give the five seconds and the game's own countdown, with the
 * room's clock running for it; a round's end back in the lobby with
 * nobody ready, and combat's no next round on its own; one pilot alone
 * plays either (the owner, 2026-10-02: "ready to go either single or
 * multi"), a round that lasts past ABANDON_MS. A race room's lobby waits
 * for its track, then its race goes off the grid; free flight's round is
 * on from its start until the room is empty.
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

import { ABANDON_MS, PRIVATE_CAP, RoomCore } from '../edge/rooms/core.js';
import { ROUND_MINUTES } from '../edge/rooms/combat.js';
import { GOALS } from '../src/share/roomtag.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { LOBBY_COUNTDOWN_MS, LOBBY_DEADLINE_MS } from '../edge/rooms/gamelobby.js';
import { PROTO } from '../src/share/roomwire.js';
import { RESTART_STARS } from '../edge/rooms/war.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { stagesOf } from '../src/share/war/stages.js';

/* A room at room ms 0, its `n` pilots seated: made for the war unless
 * `mode` says otherwise. `dev` starts the campaign's missions in
 * development too, as a check's own server does (edge/rooms/war.js). */
function lobbyRoom({
  n = 2, mode = 'war', mission = 'itaipu-1', dev = false,
} = {}) {
  const r = new RoomCore({
    code: 'L0BBY1', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: 0, public: true, mode, mission,
  }, { devMissions: dev });
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
  /* Pilot i back on a new socket with the seat token it was given. */
  env.rejoin = (i) => {
    const was = env.socks[i].got.find((m) => m && m.type === 'welcome');
    const so = { name: `lobby${i}b`, address: env.socks[i].address, got: [] };
    env.socks[i] = so;
    env.apply(r.open(so, env.clock));
    env.apply(r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', war: 1, token: was.token, name: [i, i, 30 + i], profile: { airframe: 'cub1400', map: 'itaipu', figure: 1, livery: null, parts: null },
    }), env.clock, so.address, () => (tokens += 1).toString(16).padStart(32, '0')));
    return so;
  };
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
      && e.r.gameLobby.open(e.r));
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
    /* The release gate (src/game/campaign.js ACT1 release): the VM's
     * room never takes a mission in development, by its word, and a room
     * stored set to one before the gate is mission 1 again, not a lobby
     * whose every start is refused. */
    const e = lobbyRoom();
    e.say(0, { type: 'lobby', op: 'mission', mission: 'itaipu-2' });
    check('the host cannot set mission 2 while it is in development: refused, said why, the room keeps mission 1',
      e.socks[0].got.some((m) => m.type === 'refused' && m.why === 'war_unreleased') && e.lobby(1).mission === 'itaipu-1' && e.r.meta.mission === 'itaipu-1',
      JSON.stringify(e.lobby(1)));
    const stored = lobbyRoom({ mission: 'itaipu-3' });
    check('a room stored set to mission 3 says mission 1 in its lobby', stored.lobby(0).mission === 'itaipu-1', JSON.stringify(stored.lobby(0)));
    stored.at(100);
    stored.ready(0);
    stored.ready(1);
    stored.at(100 + LOBBY_COUNTDOWN_MS + 100);
    check('and its lobby starts mission 1', stored.war().state === 'briefing' && stored.war().mission === 'itaipu-1',
      JSON.stringify({ state: stored.war().state, mission: stored.war().mission }));
  }
  {
    const e = lobbyRoom({ dev: true });
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
    /* The owner, 2 Oct: a lost mission restarts from the stage it was
     * lost in. The loss is put on the match by hand here; war:stages
     * plays one through. */
    const e = lobbyRoom();
    e.at(100);
    e.ready(0);
    e.ready(1);
    e.at(100 + LOBBY_COUNTDOWN_MS + 100);
    const go = e.war().goAt;
    e.at(go + 200);
    e.r.war.finish(go + 150, 'lost', 'output');
    e.at(go + 400);
    const lostIn = e.war().checkpoint;
    check('after a loss the war names the stage the mission restarts from', e.war().state === 'lost' && lostIn && lostIn.n === 0,
      JSON.stringify(lostIn));
    e.ready(0);
    e.ready(1);
    e.at(e.clock + LOBBY_COUNTDOWN_MS + 100);
    check('and starts it again from there, with no briefing', e.war().state === 'countdown' && e.war().restarted === lostIn.stage && e.war().mission === 'itaipu-1',
      JSON.stringify({ state: e.war().state, restarted: e.war().restarted }));
    e.say(0, { type: 'war', op: 'end' });
    e.at(e.clock + 100);
    e.ready(0);
    e.ready(1);
    e.at(e.clock + LOBBY_COUNTDOWN_MS + 100);
    check('a match ended, not lost, starts again from its film', e.war().state === 'briefing' && e.war().restarted == null, e.war().state);
  }
  {
    /* The host's two starts after a loss (src/main.js warStart): Start
     * now's from 'checkpoint', the lost stage with two stars at most, and
     * Restart from the beginning's intro, the mission from its film with
     * every star. After a win, Start now's intro starts it fresh. The
     * Spillway's the same: nothing here is First Light's. */
    for (const [mission, stage] of [['itaipu-1', 'pressure'], ['itaipu-2', 'channel']]) {
      const e = lobbyRoom({ mission, dev: true });
      const loseIn = () => {
        e.say(0, { type: 'war', op: 'start', mission });
        e.at(e.war().goAt + 200);
        const idx = stagesOf(MISSIONS[mission]).findIndex((s) => s.id === stage);
        e.r.war.enterStage(e.r, idx, e.r.war.match.f);
        e.r.war.finish(e.r.war.match.f, 'lost', 'output');
        e.at(e.clock + 100);
        return idx;
      };
      /* Every star's criterion met (war.js resultOf), so the result is
       * what the start allows. */
      const winIt = () => {
        const m = e.r.war.match;
        Object.assign(m, { results: ['win'], lossy: false, output: MISSIONS[mission].starMw ?? MISSIONS[mission].floorMw });
        e.r.war.finish(m.f, 'won', 'stages');
        e.at(e.clock + 100);
        return e.war().result;
      };
      const idx = loseIn();
      check(`${mission} lost in its stage ${stage}: the view names it`, e.war().state === 'lost' && e.war().checkpoint && e.war().checkpoint.stage === stage
        && e.war().checkpoint.n === idx && idx > 0, JSON.stringify(e.war().checkpoint));
      e.say(0, { type: 'war', op: 'start', mission, from: 'checkpoint', loadout: { rack: 4, warhead: 'standard', speedMul: 1 } });
      check(`${mission}: the host's start from 'checkpoint' counts down into that stage, no briefing`, e.war().state === 'countdown' && e.war().restarted === stage
        && e.r.war.match.from === idx, JSON.stringify({ state: e.war().state, restarted: e.war().restarted }));
      e.at(e.war().goAt + 200);
      check(`${mission}: at the go it is in that stage`, e.war().stage && e.war().stage.id === stage, JSON.stringify(e.war().stage && e.war().stage.id));
      const capped = winIt();
      check(`${mission}: won from there, every criterion met, ${RESTART_STARS} stars`, capped.won && capped.stars === RESTART_STARS && capped.criteria.every((c) => c.met),
        JSON.stringify(capped));
      e.say(0, { type: 'war', op: 'start', mission, from: 'checkpoint' });
      check(`${mission}: after a win there is no stage to go back to: refused, the match as it was`, e.socks[0].got.at(-1).type === 'war'
        && e.socks[0].got.at(-1).error === 'checkpoint' && e.war().state === 'won', JSON.stringify(e.socks[0].got.at(-1)));
      e.say(0, { type: 'war', op: 'start', mission, intro: true });
      check(`${mission}: and the host's start after a win is the mission from its film`, e.war().state === 'briefing' && e.war().restarted == null,
        JSON.stringify({ state: e.war().state, restarted: e.war().restarted }));
      e.say(0, { type: 'war', op: 'end' });
      e.at(e.clock + 100);
      loseIn();
      e.say(0, { type: 'war', op: 'start', mission, intro: true });
      check(`${mission}: lost again, the host's start with the intro is the mission from its film, not a restart`, e.war().state === 'briefing' && e.war().restarted == null
        && e.r.war.match.from == null, JSON.stringify({ state: e.war().state, restarted: e.war().restarted }));
      const full = winIt();
      check(`${mission}: won from there, every criterion met, all 3 stars`, full.won && full.stars === 3, JSON.stringify(full));
    }
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
    /* The owner, 2026-10-01: a non-host left on the end banner, "waiting
     * for the host", with no way forward. Nobody waits on the host here. */
    const e = lobbyRoom({ n: 3 });
    e.at(100);
    e.leave(0);
    e.ready(1);
    e.ready(2);
    check('the host leaves: the next pilot hosts at once, every one told', e.r.host() === 2 && e.socks[2].got.some((m) => m.type === 'host' && m.seat === 2),
      JSON.stringify({ host: e.r.host() }));
    e.at(100 + LOBBY_COUNTDOWN_MS + 100);
    check('and the two left ready start the mission on their own', e.war().state === 'briefing' && e.war().mission === 'itaipu-1', e.war().state);
  }
  {
    const e = lobbyRoom({ mode: null });
    e.ready(0);
    e.ready(1);
    e.at(LOBBY_COUNTDOWN_MS + 200);
    check('a free flight room\'s lobby starts no war', e.war().state === 'lobby' && e.r.gameLobby.live === true);
  }
}

export function gameLobbySection(check) {
  console.log('combat and tag: the lobby');
  {
    const e = lobbyRoom({ mode: 'combat', mission: null });
    const w = e.socks[0].got.find((m) => m.type === 'welcome');
    check('a room made for combat welcomes with its lobby: the round\'s minutes, nobody ready, no times',
      JSON.stringify(w.lobby) === `{"minutes":${ROUND_MINUTES[0]},"ready":{},"countdownAt":null,"deadlineAt":null}`, JSON.stringify(w.lobby));
    e.say(1, { type: 'lobby', op: 'minutes', minutes: 5 });
    check('the minutes are the host\'s to change', e.socks[1].got.some((m) => m.type === 'refused' && m.why === 'host') && e.lobby(0).minutes === ROUND_MINUTES[0]);
    e.say(0, { type: 'lobby', op: 'minutes', minutes: 4 });
    check('minutes combat does not play are passed over', e.lobby(0).minutes === ROUND_MINUTES[0]);
    e.say(0, { type: 'lobby', op: 'minutes', minutes: 5 });
    check('the host sets 5: everybody told, the room keeps it', e.lobby(1).minutes === 5 && e.r.meta.minutes === 5, JSON.stringify(e.lobby(1)));
    e.at(1000);
    e.ready(0);
    check('one ready of two: the 45 s, no five seconds', e.lobby(1).ready['1'] === true && e.lobby(1).deadlineAt === 1000 + LOBBY_DEADLINE_MS
      && e.lobby(1).countdownAt === null, JSON.stringify(e.lobby(1)));
    check('the browser lists it waiting, one ready', e.r.activity(0).state === 'waiting' && e.r.activity(0).ready === 1, JSON.stringify(e.r.activity(0)));
    e.at(2000);
    e.ready(1);
    check('both ready: the five seconds', e.lobby(0).countdownAt === 2000 + LOBBY_COUNTDOWN_MS && e.lobby(0).deadlineAt === 1000 + LOBBY_DEADLINE_MS,
      JSON.stringify(e.lobby(0)));
    e.at(2000 + LOBBY_COUNTDOWN_MS + 100);
    const round = e.r.combat.round;
    check('at their end the room\'s combat round counts down, 5 minutes, and the lobby is cleared', round.state === 'countdown' && round.minutes === 5 && round.n === 1
      && JSON.stringify(e.lobby(1).ready) === '{}', JSON.stringify({ round, lobby: e.lobby(1) }));
    check('with the room\'s clock running for it, nobody flying', e.r.ticking === true);
    check('the browser lists it in round 1', e.r.activity(0).round === 1 && e.r.activity(0).game === 'combat', JSON.stringify(e.r.activity(0)));
    e.ready(0);
    check('a ready during the round is passed over', JSON.stringify(e.lobby(0).ready) === '{}');
    e.at(round.endsAt + 200);
    check('the round over: back in the lobby, nobody ready, and no next round on its own',
      e.r.combat.round.state === 'over' && e.r.combat.round.nextAt === 0 && e.r.gameLobby.open(e.r) && JSON.stringify(e.lobby(0).ready) === '{}',
      JSON.stringify({ state: e.r.combat.round.state, nextAt: e.r.combat.round.nextAt }));
    e.at(e.clock + 30000);
    check('and none 30 s on either', e.r.combat.round.state === 'over' && e.r.combat.round.n === 1);
  }
  {
    const e = lobbyRoom({ mode: 'combat', mission: null, n: 1 });
    e.at(100);
    e.ready(0);
    check('one pilot alone, ready: the five seconds', e.lobby(0).countdownAt === 100 + LOBBY_COUNTDOWN_MS, JSON.stringify(e.lobby(0)));
    e.at(100 + LOBBY_COUNTDOWN_MS + 100);
    check('and a combat round of one counts down', e.r.combat.on(), JSON.stringify(e.r.combat.round));
    e.at(e.clock + 20000 + 15000);
    check('and is still on past ABANDON_MS, played alone', e.r.combat.round.state === 'on', e.r.combat.round.state);
  }
  {
    const e = lobbyRoom({ mode: 'combat', mission: null });
    e.at(100);
    e.ready(0);
    e.ready(1);
    e.at(100 + LOBBY_COUNTDOWN_MS + 100);
    e.join(2);
    check('a pilot who joins the round is seated in it with full paper (hot join)', e.r.combat.on() && e.r.combat.seats.has(3)
      && e.r.combat.seats.get(3).owed === e.r.combat.seats.get(1).owed, JSON.stringify([...e.r.combat.seats.keys()]));
  }
  {
    const e = lobbyRoom({ mode: 'tag', mission: null });
    const w = e.socks[0].got.find((m) => m.type === 'welcome');
    check('a room made for tag welcomes with its lobby: the goal, nobody ready',
      JSON.stringify(w.lobby) === `{"goal":${GOALS[0].goal},"ready":{},"countdownAt":null,"deadlineAt":null}`, JSON.stringify(w.lobby));
    e.say(0, { type: 'lobby', op: 'goal', goal: 3 });
    check('a goal under tag\'s least is passed over', e.lobby(0).goal === GOALS[0].goal);
    e.ready(0);
    e.ready(0, false);
    e.say(0, { type: 'lobby', op: 'goal', goal: 30 });
    check('the host sets 30', e.lobby(1).goal === 30 && e.r.meta.goal === 30);
    e.at(500);
    e.ready(0);
    e.ready(1);
    e.at(500 + LOBBY_COUNTDOWN_MS + 100);
    check('both ready: the room\'s tag match counts down to 30, the lobby cleared', e.r.tag.on() && e.r.tag.match.goal === 30 && e.r.tag.match.state === 'countdown'
      && JSON.stringify(e.lobby(0).ready) === '{}', JSON.stringify(e.r.tag.view(e.r)));
    check('with the room\'s clock running for it, nobody flying', e.r.ticking === true);
    e.say(0, { type: 'tag', op: 'end' });
    e.at(e.clock + 200);
    check('the match ended: back in the lobby, nobody ready', !e.r.tag.on() && e.r.gameLobby.open(e.r) && JSON.stringify(e.lobby(1).ready) === '{}');
  }
  {
    const e = lobbyRoom({ mode: 'tag', mission: null, n: 3 });
    e.at(500);
    e.ready(0);
    e.ready(1);
    e.at(500 + LOBBY_DEADLINE_MS - 100);
    check('two of three ready: nothing before the 45 s', !e.r.tag.on());
    e.at(500 + LOBBY_DEADLINE_MS + 100);
    check('at 45 s the match starts with whoever is ready', e.r.tag.on(), JSON.stringify(e.r.tag.view(e.r)));
  }
  {
    const e = lobbyRoom({ mode: 'tag', mission: null, n: 1 });
    e.at(100);
    e.ready(0);
    e.at(100 + LOBBY_COUNTDOWN_MS + 100);
    check('Catch the Ace alone, ready: its match counts down', e.r.tag.on(), JSON.stringify(e.r.tag.view(e.r)));
  }
  {
    const e = lobbyRoom({ mode: 'race', mission: null });
    const w = e.socks[0].got.find((m) => m.type === 'welcome');
    check('a race room welcomes with its lobby, no track yet', JSON.stringify(w.lobby) === '{"track":null,"ready":{},"countdownAt":null,"deadlineAt":null}',
      JSON.stringify(w.lobby));
    e.at(100);
    e.ready(0);
    e.ready(1);
    check('both ready with no track: kept, and no time runs', e.lobby(0).ready['1'] && e.lobby(0).ready['2'] && e.lobby(0).countdownAt === null
      && e.lobby(0).deadlineAt === null, JSON.stringify(e.lobby(0)));
    e.say(0, { type: 'track', doc: mapTrackDocument({ id: 'trk-lobby001' }) });
    check('the host\'s track, nobody on its grid yet: still no time', e.lobby(1).countdownAt === null, JSON.stringify(e.lobby(1)));
    e.say(0, { type: 'race', op: 'ready', track: 'trk-lobby001', ready: true });
    e.say(1, { type: 'race', op: 'ready', track: 'trk-lobby001', ready: true });
    check('pilots on its grid: the lobby says the track, and the five seconds run', e.lobby(1).track === 'trk-lobby001'
      && e.lobby(1).countdownAt === 100 + LOBBY_COUNTDOWN_MS, JSON.stringify(e.lobby(1)));
    e.at(100 + LOBBY_COUNTDOWN_MS + 100);
    const race = e.r.race.race;
    check('at their end the race goes off the grid with both on it', race && race.state === 'on' && race.racers.join() === '1,2', JSON.stringify(race));
    e.join(2);
    check('a pilot who comes during it has no lobby and is no racer', !e.r.gameLobby.open(e.r) && !race.racers.includes(3));
  }
  {
    const e = lobbyRoom({ mode: null });
    const w = e.socks[0].got.find((m) => m.type === 'welcome');
    check('a free flight room welcomes with its lobby, not flying yet', JSON.stringify(w.lobby) === '{"live":false,"ready":{},"countdownAt":null,"deadlineAt":null}',
      JSON.stringify(w.lobby));
    e.at(100);
    e.ready(0);
    e.at(100 + LOBBY_COUNTDOWN_MS - 100);
    check('one of two ready: nothing yet', !e.r.gameLobby.live);
    e.ready(1);
    e.at(e.clock + LOBBY_COUNTDOWN_MS + 100);
    check('both ready: the room flies, everybody told', e.r.gameLobby.live && e.lobby(1).live === true && JSON.stringify(e.lobby(1).ready) === '{}',
      JSON.stringify(e.lobby(1)));
    e.join(2);
    const w3 = e.socks[2].got.find((m) => m.type === 'welcome');
    check('a pilot who comes then is told it flies, and has no lobby to wait in', w3.lobby.live === true && !e.r.gameLobby.open(e.r));
    check('and the browser lists it flying', e.r.activity(e.clock).state === 'on' && e.r.activity(e.clock).game === null, JSON.stringify(e.r.activity(e.clock)));
    e.leave(0);
    e.leave(1);
    e.leave(2);
    check('the room empty: its round is over', e.r.gameLobby.live === false);
  }
}

/* The owner, 2026-10-02, of wars listed in battle with nobody in them:
 * "once theyre done or empty they need to be closed out". */
export function emptyRoomSection(check) {
  console.log('an empty room: its game paused, a finished one closed');
  {
    const e = lobbyRoom({ n: 1 });
    e.at(100);
    e.say(0, { type: 'war', op: 'start', mission: 'itaipu-1' });
    e.at(e.war().goAt + 30000);
    const before = { roomMs: e.r.roomMs(e.clock), wave: e.war().wave, state: e.war().state };
    const closed = e.r.close(e.socks[0], e.clock);
    check('the last pilot leaves a war under way: the room is held, not closed at once', closed.some((x) => x.empty && !x.now), JSON.stringify(closed));
    e.at(e.clock + 120000);
    check('two minutes empty, the room\'s clock has stood still', e.r.roomMs(e.clock) === before.roomMs, `${e.r.roomMs(e.clock)} ${before.roomMs}`);
    e.rejoin(0);
    const after = { roomMs: e.r.roomMs(e.clock), wave: e.war().wave, state: e.war().state };
    check('a pilot back finds the war where it was: the same wave, on, the clock going on from there',
      after.state === before.state && after.wave === before.wave && after.roomMs === before.roomMs, JSON.stringify({ before, after }));
    e.at(e.clock + ABANDON_MS + 1000);
    check('and it runs again, the war still on with its pilot back', e.r.roomMs(e.clock) === before.roomMs + ABANDON_MS + 1000 && e.r.war.on(),
      `${e.war().state}`);
  }
  {
    const e = lobbyRoom({ mode: 'combat', mission: null, n: 1 });
    e.say(0, { type: 'combat', op: 'start', minutes: 3 });
    e.at(30000);
    const left = e.r.combat.round.endsAt - e.r.roomMs(e.clock);
    e.r.close(e.socks[0], e.clock);
    e.at(e.clock + 60000);
    e.join(1);
    check('a combat round in an empty room is paused too: the same time left when a pilot is back', e.r.combat.round.endsAt - e.r.roomMs(e.clock) === left,
      `${e.r.combat.round.endsAt - e.r.roomMs(e.clock)} ${left}`);
  }
  {
    const e = lobbyRoom({ n: 1 });
    e.say(0, { type: 'war', op: 'start', mission: 'itaipu-1' });
    e.at(e.war().goAt + 1000);
    e.say(0, { type: 'war', op: 'end' });
    e.at(e.clock + 100);
    const closed = e.r.close(e.socks[0], e.clock);
    check('a finished match in a room that empties closes it at once, its result only its pilots\'', e.war().state === 'ended'
      && closed.some((x) => x.empty && x.now), JSON.stringify(closed));
  }
  {
    const e = lobbyRoom({ mode: null, n: 1 });
    const closed = e.r.close(e.socks[0], e.clock);
    check('a free flight room with no game over is held its five minutes', closed.some((x) => x.empty && !x.now));
  }
}
