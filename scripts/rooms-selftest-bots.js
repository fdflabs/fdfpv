/*
 * rooms-selftest-bots.js: the AI pilots section of npm run rooms:selftest
 * (edge/rooms/roombots.js, docs/AI-PILOTS-CONTRACT.md), through RoomCore as
 * a platform drives it: a room made for Catch the Ace is filled and marked,
 * a tab that cannot mark them gets none, a person is never refused for
 * them and takes the newest's seat, they never host, are not counted as
 * people, leave with the last person, come back from storage, and play a
 * live match, crown changes and all; and what a room with them costs a
 * tick.
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

import { RoomCore, TICK_MS } from '../edge/rooms/core.js';
import { FILL_TO } from '../edge/rooms/roombots.js';
import { BOT_AIRFRAME, DOWN_MS, SPAWN_MS } from '../edge/rooms/bots.js';
import { LOBBY_COUNTDOWN_MS } from '../edge/rooms/gamelobby.js';
import { COUNTDOWN_MS } from '../edge/rooms/race.js';
import {
  FLAG_AIRBORNE, FLAG_CRASHED, FLAG_SPAWNING, PROTO, ROOM_LEVEL, TYPE_BATCH, decodeBatch, decodePose, encodePose,
} from '../src/share/roomwire.js';

/* A room made for tag on swiss2, as host.js init makes one. */
function tagRoom({
  cap = 8, map = 'swiss2', mode = 'tag', open = true,
} = {}) {
  const r = new RoomCore({
    code: 'B0TS01', cap, friendly: false, map, epoch: 0, public: open, mode, name: null, pick: [1, 1], mission: null, hidden: false,
  });
  let tokens = 0;
  const env = {
    r, socks: [], clock: 0, stored: new Map(), empty: 0,
  };
  env.apply = (actions) => {
    for (const x of actions) {
      if (x.send && x.send.got) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      }
      if (x.store) {
        env.stored.set(x.store, JSON.parse(JSON.stringify(x.value)));
      }
      if (x.empty) {
        env.empty += 1;
      }
    }
  };
  env.join = (i, level = ROOM_LEVEL) => {
    const so = { name: `p${i}`, address: `10.9.9.${i + 1}`, got: [] };
    env.socks[i] = so;
    env.apply(r.open(so, env.clock));
    env.apply(r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', level, name: [i, i, 40 + i], profile: { airframe: BOT_AIRFRAME, map, figure: 1, livery: null, parts: null },
    }), env.clock, so.address, () => (tokens += 1).toString(16).padStart(32, '0')));
    return so;
  };
  env.leave = (i) => env.apply(r.close(env.socks[i], env.clock));
  env.say = (i, obj) => env.apply(r.message(env.socks[i], JSON.stringify(obj), env.clock, env.socks[i].address));
  /* Person i flies a circle of 80 m at 50 m over the strip, 18 m/s. */
  env.fly = (i) => {
    const s = [...r.seats.values()].find((t) => !t.bot && t.name[0] === i);
    const t = r.roomMs(env.clock);
    const w = 18 / 80;
    const a = w * t / 1000;
    const pose = {
      flags: FLAG_AIRBORNE, seq: Math.floor(t / TICK_MS) & 0xffff, t,
      px: 80 * Math.cos(a), py: 50, pz: 80 * Math.sin(a), qx: 0, qy: 0, qz: 0, qw: 1,
      vx: -18 * Math.sin(a), vy: 0, vz: 18 * Math.cos(a), wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 900, flaps: 0,
    };
    if (s) {
      env.apply(r.message(env.socks[i], encodePose(pose), env.clock, env.socks[i].address));
    }
  };
  /* The room's clock to t, a tick every TICK_MS, people in `flying`
   * sending a pose every tick. */
  env.run = (t, flying = []) => {
    while (env.clock + TICK_MS <= t) {
      env.clock += TICK_MS;
      for (const i of flying) {
        env.fly(i);
      }
      env.apply(r.tick(env.clock));
    }
  };
  env.bots = () => [...r.seats.values()].filter((s) => s.bot);
  return env;
}

export function botsSection(check) {
  console.log('AI pilots: the room');
  {
    const e = tagRoom();
    e.join(0);
    const joins = e.socks[0].got.filter((m) => m.type === 'join');
    check(`one person in a room made for tag is joined by ${FILL_TO - 1} AI pilots, each marked bot`,
      e.bots().length === FILL_TO - 1 && joins.length === FILL_TO - 1 && joins.every((m) => m.bot === true && m.profile.airframe === BOT_AIRFRAME),
      `${joins.length} joins, ${e.bots().length} AI seats`);
    check('the person hosts, and is the room\'s only person', e.r.host() === 1 && e.r.people().length === 1, `host ${e.r.host()}`);
    check("the admin's who is on marks them", e.r.who(e.clock).filter((s) => s.bot).length === FILL_TO - 1);
    const second = e.join(1);
    const welcome = second.got.find((m) => m.type === 'welcome');
    const leaves = e.socks[0].got.filter((m) => m.type === 'leave');
    const toldLeft = second.got.filter((m) => m.type === 'leave').length;
    check('a second person: one AI pilot leaves, and the newcomer, welcomed with them marked, is told',
      e.r.people().length === 2 && e.bots().length === FILL_TO - 2 && leaves.length === 1 && toldLeft === 1
      && welcome.peers.filter((p) => p.bot).length - toldLeft === FILL_TO - 2 && welcome.peers.filter((p) => !p.bot).length === 1,
      `${e.bots().length} AI, ${leaves.length} leave`);
    e.leave(0);
    check('the host leaving hands the room to the person, never an AI pilot', e.r.host() !== 0 && !e.r.seats.get(e.socks[1]).bot && e.r.host() === e.r.seats.get(e.socks[1]).seat
      && e.bots().length === FILL_TO - 1, `host ${e.r.host()}`);
    const emptyWas = e.empty;
    e.leave(1);
    check('the last person leaving takes every AI pilot with them, and the room empties', e.r.seats.size === 0 && e.empty > emptyWas);
  }
  {
    const e = tagRoom();
    e.join(0);
    e.join(1);
    const welcome = e.socks[0].got.find((m) => m.type === 'welcome');
    e.say(1, { type: 'bots', level: 'off' });
    const notHost = e.bots().length;
    e.say(0, { type: 'bots', level: 'off' });
    const off = e.bots().length;
    const told = e.socks[1].got.filter((m) => m.type === 'bots').map((m) => m.level).join();
    e.say(0, { type: 'bots', level: 'hard' });
    const levels = [...e.r.bots.bots.list.values()].map((b) => b.level);
    e.say(0, { type: 'bots', level: 'silly' });
    check("the host switches them off, and back on at Hard; nobody else can, and nothing that is not a level",
      welcome.bots === 'normal' && notHost === FILL_TO - 2 && off === 0 && told === 'off'
      && levels.length === FILL_TO - 2 && levels.every((l) => l === 'hard') && e.r.bots.level === 'hard',
      `welcome ${welcome.bots}, ${notHost} after a guest's off, ${off} after the host's, told ${told}, then ${levels.join(',')}`);
  }
  {
    const e = tagRoom();
    e.join(0, 2);
    check('a tab that cannot mark an AI pilot (ROOM_LEVEL 2) gets none', e.bots().length === 0);
    const f = tagRoom({ mode: 'combat' });
    f.join(0);
    const g = tagRoom({ map: 'alps' });
    g.join(0);
    const h = tagRoom({ mode: null });
    h.join(0);
    const q = tagRoom({ open: false });
    q.join(0);
    const qWelcome = q.socks[0].got.find((m) => m.type === 'welcome');
    const before = q.bots().length;
    q.say(0, { type: 'bots', level: 'easy' });
    const on = q.bots().length;
    const levels = q.bots().map((b) => q.r.bots.bots.list.get(b.seat).level);
    q.say(0, { type: 'bots', level: 'off' });
    check("a private tag room starts with them off, and its host switches them on at Easy and off again",
      qWelcome.bots === 'off' && before === 0 && on === FILL_TO - 1 && levels.every((l) => l === 'easy') && q.bots().length === 0,
      `welcome ${qWelcome.bots}, ${before} before, ${on} on at ${levels.join(',')}, ${q.bots().length} after off`);
    const q2 = tagRoom({ open: false });
    q2.join(0);
    q2.say(0, { type: 'bots', level: 'normal' });
    const saved = q2.stored.get('bots');
    const r3 = new RoomCore({ ...q2.r.meta });
    r3.bots.restore(saved);
    check('a private room switched on stays on when restored, and one never stored starts off',
      r3.bots.level === 'normal' && new RoomCore({ ...q2.r.meta }).bots.level === 'off', `${r3.bots.level}`);
    check('none in a combat room, on a world they cannot fly, or in free flight', f.bots().length + g.bots().length + h.bots().length === 0);
  }
  {
    const e = tagRoom({ cap: FILL_TO });
    e.join(0);
    const full = e.r.seats.size === FILL_TO;
    for (let i = 1; i < FILL_TO; i += 1) {
      e.join(i);
    }
    const refused = e.socks.filter((so) => so.got.every((m) => m.type !== 'welcome')).length;
    check('a room full of people and AI never refuses a person: an AI pilot gives up its seat each time',
      full && refused === 0 && e.r.people().length === FILL_TO && e.bots().length === 0, `${refused} refused, ${e.bots().length} AI left`);
  }
  {
    /* A person flies head on into an AI pilot, out of both their spawns:
     * the referee's hit breaks a part of each, and the AI pilot crashes as
     * the person does, lies, and is born again. */
    const e = tagRoom();
    e.join(0);
    e.run(SPAWN_MS + 3000);
    /* The person comes down onto the AI pilot from 60 m over it, 10 m/s
     * closing, from its first pose, which the room makes untouchable for
     * SPAWN_MS (safety.js), so they meet a second after that. */
    const bot = e.bots()[0];
    const so = e.socks[0];
    const from = e.clock;
    let seq = 0;
    while (!e.r.bots.bots.list.get(bot.seat).down && e.clock < from + SPAWN_MS + 3000) {
      e.run(e.clock + TICK_MS);
      const p = decodePose(bot.pose);
      const over = Math.max(0, 60 - 10 * (e.clock - from) / 1000);
      seq += 1;
      e.apply(e.r.message(so, encodePose({
        ...p, py: p.py + over, flags: FLAG_AIRBORNE, seq, vy: p.vy - 10, motor: 900,
      }), e.clock, so.address));
    }
    const hit = so.got.find((m) => m.type === 'hit' && (m.a === bot.seat || m.b === bot.seat));
    const flown = e.r.bots.bots.list.get(bot.seat);
    check('a person flown down into an AI pilot: the referee hits both, and the AI pilot crashes', Boolean(hit) && Boolean(flown.down)
      && e.r.bots.bots.crashes.hit === 1, hit ? `hit ${hit.a}:${hit.b}, brk ${hit.A.brk}/${hit.B.brk}` : 'no hit');
    e.run(e.clock + 500);
    const down = decodePose(bot.pose);
    /* It falls, lies DOWN_MS, and is born again. */
    const landed = e.clock;
    while (!(decodePose(bot.pose).flags & FLAG_AIRBORNE) && e.clock < landed + DOWN_MS + 15000) {
      e.run(e.clock + TICK_MS);
    }
    const up = decodePose(bot.pose);
    check('its poses say crashed, then, DOWN_MS after it came to rest, airborne and untouchable again', (down.flags & FLAG_CRASHED) !== 0 && (down.flags & FLAG_AIRBORNE) === 0
      && (up.flags & FLAG_AIRBORNE) !== 0 && (up.flags & FLAG_SPAWNING) !== 0 && e.clock - landed > DOWN_MS, `${down.flags} then ${up.flags}, ${((e.clock - landed) / 1000).toFixed(1)} s down`);
  }
  {
    const e = tagRoom();
    e.join(0);
    e.run(3000, [0]);
    const saved = e.stored.get('bots');
    const names = e.bots().map((s) => JSON.stringify([s.seat, s.name])).sort().join();
    const r2 = new RoomCore(e.r.meta);
    r2.bots.restore(saved);
    r2.restore([]);
    const back = [...r2.seats.values()].filter((s) => s.bot).map((s) => JSON.stringify([s.seat, s.name])).sort().join();
    check('stored and restored, the AI seats come back with their seats and names', Boolean(saved) && back === names && r2.people().length === 0, back);
  }
  {
    const e = tagRoom();
    e.join(0);
    e.say(0, { type: 'lobby', op: 'ready', ready: true });
    e.run(LOBBY_COUNTDOWN_MS + COUNTDOWN_MS + 500, [0]);
    const live = e.r.tag.match && e.r.tag.match.state === 'live';
    const players = live ? Object.keys(e.r.tag.match.players).length : 0;
    check('ready alone starts a match with the AI pilots in it', live && players === FILL_TO, `${e.r.tag.match && e.r.tag.match.state}, ${players} players`);
    const t0 = process.cpuUsage();
    const from = e.clock;
    e.run(from + 120000, [0]);
    const cpu = process.cpuUsage(t0);
    const crowns = e.r.tag.log.length;
    const botCrowns = e.r.tag.log.filter((c) => e.bots().some((s) => s.seat === c.seat)).length;
    check('in two minutes the crown changes hands, AI pilots taking it', crowns >= 2 && botCrowns >= 1, `${crowns} crowns, ${botCrowns} to AI pilots`);
    const batches = e.socks[0].got.filter((m) => m instanceof Uint8Array && m[0] === TYPE_BATCH).map(decodeBatch);
    const seen = new Set(batches.flatMap((b) => b.poses.map((p) => p.seat)));
    check('the person is sent every AI pilot\'s poses', e.bots().every((s) => seen.has(s.seat)), [...seen].join(','));
    const perSecond = (cpu.user + cpu.system) / 1000 / 120;
    check(`cost: the room with ${FILL_TO - 1} AI pilots in a live match, all of it, a room second`, perSecond < 33,
      `${perSecond.toFixed(2)} ms CPU a room second on this machine, of 1000`);
  }
}
