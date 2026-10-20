/*
 * rooms-selftest-watch.js: the watch seat (edge/rooms/core.js watch;
 * docs/redesign/SESSIONS.md section 5) in a room made for each game and in
 * free flight, driven on a RoomCore in Node. Part of npm run rooms:selftest.
 *
 * A watcher is seated past the cap, never in a game, never the host,
 * never scored, and its leaving changes nothing; everything it sends but
 * the clock is dropped, the game's own words included. Counted apart in
 * the welcome and the room browser's line.
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
  CLOSE, PROTO, PUBLIC_CAP, ROOM_LEVEL, TYPE_PARTS, WAR_JOIN, encodeFoot, encodePose,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore, WATCH_CAP } from '../edge/rooms/core.js';
import { reportRoom } from '../edge/rooms/lobby.js';
import { checkRoomLine } from '../src/share/roomlist.js';
import { createRoomWar } from '../src/share/roomwar.js';
import { createRoomOps } from '../src/share/roomops.js';

const profile = { airframe: 'bramor2300', map: 'itaipu', figure: 1, livery: null, parts: null };

/* Each game as its host starts it; free flight has none. */
const GAMES = [
  { label: 'free flight', mode: null, start: [] },
  { label: 'war', mode: 'war', map: 'itaipu', mission: 'itaipu-drill', start: [{ type: 'war', op: 'start', mission: 'itaipu-drill' }] },
];

/* Every word a pilot's page may say, each game's included, and an older
 * page's for the games the combat-only cut took (Catch the Ace's,
 * Streamer Combat's, the Hercules' drops): from a watcher none of them
 * may act. */
const WORDS = [
  { type: 'tag', op: 'start', goal: 5 },
  { type: 'tag', op: 'end' },
  { type: 'combat', op: 'start', minutes: 5 },
  { type: 'combat', op: 'respawn' },
  { type: 'combat', op: 'stop' },
  { type: 'war', op: 'start', mission: 'itaipu-drill' },
  { type: 'war', op: 'ready', ready: true },
  { type: 'war', op: 'loadout', airframe: 'bramor2300' },
  { type: 'war', op: 'lost' },
  { type: 'war', op: 'skip' },
  { type: 'war', op: 'end' },
  { type: 'ops', op: 'start' },
  { type: 'lobby', op: 'ready', ready: true },
  { type: 'handhost', seat: 2 },
  { type: 'kick', seat: 2 },
  { type: 'world', map: 'itaipu' },
  { type: 'weather', wind: 'gusty' },
  { type: 'stockSurfaces', on: true },
  { type: 'public', on: true },
  { type: 'daytime', hour: 18 },
  { type: 'profile', profile: { ...profile, airframe: 'quad5' } },
  { type: 'event', kind: 'chat', text: 'hola' },
  { type: 'event', kind: 'crash' },
  { type: 'drop', id: 1 },
  { type: 'voice', op: 'join' },
];

export function watchSection(check) {
  console.log('the watch seat in every game (SESSIONS.md 5)');
  let tokens = 0;
  const newToken = () => {
    tokens += 1;
    return `3a${tokens.toString(16).padStart(30, '0')}`;
  };
  let now = 8_400_000;
  const sock = (name) => ({ name, got: [], closed: null });
  const run = (actions) => {
    for (const a of actions) {
      if (a.send) {
        a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
      }
      if (a.close) {
        a.close.closed = { code: a.code, reason: a.reason };
      }
    }
    return actions;
  };
  let joins = 0;
  const hello = (room, s, extra = {}) => {
    joins += 1;
    return run(room.hello(s, {
      type: 'hello', proto: PROTO, build: 'fdfpv', name: [1, 2, 30 + (joins % 60)], profile, level: ROOM_LEVEL, war: WAR_JOIN, ...extra,
    }, now, `10.0.38.${joins % 250}`, newToken));
  };
  /* Spaced past the text allowances, as a page sends. */
  const say = (room, s, msg) => {
    now += 300;
    return run(room.message(s, typeof msg === 'string' ? msg : JSON.stringify(msg), now));
  };
  const welcomeOf = (s) => s.got.find((m) => m && m.type === 'welcome');
  const texts = (s) => s.got.filter((m) => !(m instanceof Uint8Array));
  /* All a room's state a watcher might move: its meta, host, game and
   * each game's own. */
  const stateOf = (room) => JSON.stringify({
    meta: room.meta,
    host: room.host(),
    game: room.game(),
    people: room.people().map((p) => [p.seat, p.profile.airframe]),
    war: room.war.welcome(room),
    ops: room.ops.welcome(room),
    lobby: room.gameLobby.welcome(room),
  });
  const binaries = () => [
    encodePose({
      flags: 0, seq: 1, t: now, px: 1, py: 300, pz: 1, qx: 0, qy: 0, qz: 0, qw: 1, vx: 20, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 500, flaps: 0,
    }),
    new Uint8Array([TYPE_PARTS, 0, 0, 0, 0, 1]),
    /* An older page's toilet paper (STREAMER, 0x80, until the cut). */
    new Uint8Array([0x80, 0, 0, 0, 0, 1]),
    encodeFoot({ flags: 1, x: 1, y: 2, z: 3, heading: 0 }),
  ];
  /* The watcher says everything; true when nothing moved and no pilot
   * was told anything. */
  const sayAll = (room, w, pilots) => {
    const before = stateOf(room);
    const heard = pilots.map((p) => p.got.length);
    const own = w.got.length;
    for (const msg of WORDS) {
      say(room, w, msg);
    }
    for (const bytes of binaries()) {
      now += 300;
      run(room.message(w, bytes, now));
    }
    const after = stateOf(room);
    return {
      ok: after === before && pilots.every((p, i) => p.got.length === heard[i]) && w.got.length === own && !w.closed,
      detail: after === before ? `told ${pilots.map((p, i) => p.got.length - heard[i]).join(',')} own ${w.got.length - own}` : `${before} -> ${after}`,
    };
  };

  for (const g of GAMES) {
    const room = new RoomCore({
      code: 'W4TCHR', cap: PRIVATE_CAP, friendly: false, map: g.map ?? 'itaipu', epoch: now - 1000, public: false,
      mode: g.mode, mission: g.mission ?? null, name: null, pick: [1, 1, 11], hidden: false,
    });
    const pilots = [];
    for (let i = 0; i < PRIVATE_CAP - 1; i += 1) {
      pilots.push(sock(`p${i}`));
      hello(room, pilots[i]);
    }
    const joinsBefore = pilots[0].got.filter((m) => m.type === 'join').length;
    const w = sock('watch');
    hello(room, w, { watch: true });
    const ww = welcomeOf(w);
    check(`${g.label}: a watcher is welcomed to watch, seat 0, every pilot in it, counted apart`, Boolean(ww) && ww.watch === true && ww.seat === 0
      && ww.peers.length === PRIVATE_CAP - 1 && ww.watchers === 1 && ww.cap === PRIVATE_CAP && !w.closed, JSON.stringify(ww && { seat: ww.seat, watchers: ww.watchers }));
    check(`${g.label}: the pilots are never told a watcher came`, pilots[0].got.filter((m) => m.type === 'join').length === joinsBefore);
    const last = sock('last');
    hello(room, last);
    const lw = welcomeOf(last);
    check(`${g.label}: the last seat is still a pilot's, told one watches`, Boolean(lw) && lw.seat >= 1 && lw.seat <= PRIVATE_CAP && lw.watchers === 1
      && room.people().length === PRIVATE_CAP, JSON.stringify(lw && { seat: lw.seat, watchers: lw.watchers }));
    pilots.push(last);
    const over = sock('over');
    hello(room, over);
    check(`${g.label}: the room full, one more pilot is refused`, Boolean(over.closed) && over.closed.code === CLOSE.full);
    const w2 = sock('watch2');
    hello(room, w2, { watch: true });
    check(`${g.label}: and one more watcher is seated, two counted`, welcomeOf(w2)?.watch === true && welcomeOf(w2).watchers === 2 && !w2.closed);
    run(room.close(w2, now));

    const idle = sayAll(room, w, pilots);
    check(`${g.label}: before the game, nothing a watcher says moves the room or reaches a pilot`, idle.ok, idle.detail);
    say(room, w, { type: 't', c: 77 });
    check(`${g.label}: the clock is answered`, texts(w).at(-1)?.type === 't' && texts(w).at(-1).c === 77);

    for (const msg of g.start) {
      for (const p of msg.all ? pilots : [pilots[0]]) {
        say(room, p, msg.all ?? msg);
      }
    }
    for (let i = 0; i < 10; i += 1) {
      now += 33;
      run(room.tick(now));
    }
    check(`${g.label}: the host starts it with the watcher there`, room.game() === g.mode,
      `${room.game()} ${JSON.stringify(pilots[0].got.filter((m) => m.error).map((m) => m.error))}`);
    check(`${g.label}: the watcher is nobody's host and holds no seat`, room.host() === 1 && !room.people().some((p) => p.seat === 0) && room.people().length === PRIVATE_CAP);
    const playing = sayAll(room, w, pilots);
    check(`${g.label}: in the game, nothing a watcher says scores, moves the game or reaches a pilot`, playing.ok, playing.detail);

    const kept = stateOf(room);
    const left = run(room.close(w, now));
    check(`${g.label}: the watcher leaving tells nobody and changes nothing`, left.length === 0 && stateOf(room) === kept && room.watchers.size === 0);
  }

  console.log('the watch seat: the host, an empty room, the cap of watchers');
  {
    const room = new RoomCore({
      code: 'W4TCHH', cap: PRIVATE_CAP, friendly: false, map: 'itaipu', epoch: now - 1000, public: false, mode: null, name: null, pick: [1, 1, 11], hidden: false,
    });
    const w = sock('first');
    hello(room, w, { watch: true });
    check('a watcher into an empty room is no host: host 0, nobody', welcomeOf(w)?.host === 0 && room.host() === 0, JSON.stringify(welcomeOf(w)?.host));
    const a = sock('a');
    hello(room, a);
    check('the first pilot after it is the host', room.host() === welcomeOf(a).seat && welcomeOf(a).seat === 1);
    run(room.close(a, now));
    check('and with every pilot gone, the watcher is no host', room.host() === 0 && room.watchers.size === 1);
    const ws = [w];
    for (let i = 1; i < WATCH_CAP; i += 1) {
      ws.push(sock(`w${i}`));
      hello(room, ws[i], { watch: true });
    }
    const more = sock('more');
    hello(room, more, { watch: true });
    check(`${WATCH_CAP} watchers, the cap of their own: one more is refused full`, ws.every((x) => !x.closed) && Boolean(more.closed) && more.closed.code === CLOSE.full);
    const b = sock('b');
    hello(room, b);
    check('and a pilot still has a seat', Boolean(welcomeOf(b)) && welcomeOf(b).seat >= 1 && welcomeOf(b).watchers === WATCH_CAP);
  }

  console.log('the watch seat in the room browser');
  {
    const lines = [];
    const env = {
      LOBBY: {
        idFromName: () => 'lobby',
        get: () => ({
          fetch: (url, init) => {
            lines.push(JSON.parse(init.body));
            return Promise.resolve(new Response('ok'));
          },
        }),
      },
    };
    const room = new RoomCore({
      code: 'W4TCHL', cap: PUBLIC_CAP, friendly: false, map: 'itaipu', epoch: now - 1000, public: true, mode: null, name: null, pick: [1, 1, 11], hidden: false,
    }, { publicRooms: true });
    const a = sock('a');
    hello(room, a);
    reportRoom(env, room, now);
    const w = sock('w');
    hello(room, w, { watch: true });
    reportRoom(env, room, now);
    check('a watcher coming moves the line: watchers 1, its pilots 1', lines.length === 2 && lines[1].watchers === 1 && lines[1].n === 1 && lines[0].watchers === 0,
      JSON.stringify(lines.map((l) => [l.n, l.watchers])));
    run(room.close(w, now));
    reportRoom(env, room, now);
    check('and going, back to 0', lines.length === 3 && lines[2].watchers === 0);
    const line = checkRoomLine({ ...lines[1], emptySince: null });
    check('the browser reads the count', Boolean(line) && line.watchers === 1 && line.n === 1);
    const { watchers, ...old } = lines[1];
    check('a server from before sends none: null, the line kept', watchers === 1 && checkRoomLine(old)?.watchers === null);
    check('a count of the wrong shape is null, the line kept', checkRoomLine({ ...lines[1], watchers: -1 })?.watchers === null
      && checkRoomLine({ ...lines[1], watchers: 1.5 })?.watchers === null);
  }
}

/*
 * WHAT A WATCHER SEES (redesign phase 17): each game's state as it
 * changes, the same messages its pilots get and
 * none they do not; the pilots' own messages byte for byte what they get
 * with nobody watching. The war's and the ops' view comes with no result
 * (the stars and credits a page pays its pilot, the debrief it records),
 * and the lobby's never counts the watcher.
 */
export function watchStateSection(check) {
  console.log('what a watcher sees: each game\'s state (phase 17)');
  const sock = (name) => ({ name, got: [], closed: null });
  const run = (actions) => {
    for (const a of actions) {
      if (a.send) {
        a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
      }
    }
  };
  const texts = (s) => s.got.filter((m) => !(m instanceof Uint8Array));
  const ofType = (s, type) => texts(s).filter((m) => m.type === type);

  /* One game played out by two pilots, a watcher seated before the start
   * (watch 'before'), after it ('after') or never (null). Every run from
   * the same clock and the same tokens, so two runs compare byte for byte. */
  const play = (g, watch) => {
    let now = 9_100_000;
    let tokens = 0;
    const newToken = () => {
      tokens += 1;
      return `3b${tokens.toString(16).padStart(30, '0')}`;
    };
    const room = new RoomCore({
      code: 'W4TCHS', cap: PRIVATE_CAP, friendly: false, map: g.map ?? 'itaipu', epoch: now - 1000, public: false,
      mode: g.mode, mission: g.mission ?? null, name: null, pick: [1, 1, 11], hidden: false,
    }, g.opts);
    /* The war's draws and the ops' seed the same in every run. */
    room.war.random = () => 0.25;
    room.ops.random = () => 0.25;
    const hello = (s, i, extra = {}) => run(room.hello(s, {
      type: 'hello', proto: PROTO, build: 'fdfpv', name: [1, 2, 40 + i], profile, level: ROOM_LEVEL, war: WAR_JOIN, ...extra,
    }, now, `10.0.39.${i}`, newToken));
    const say = (s, msg) => {
      now += 300;
      run(room.message(s, JSON.stringify(msg), now));
    };
    const tickTo = (t) => {
      while (now < t) {
        now = Math.min(t, now + 500);
        run(room.tick(now));
      }
    };
    const pilots = [sock('p0'), sock('p1')];
    pilots.forEach((p, i) => hello(p, i + 1));
    const w = watch ? sock('watch') : null;
    if (watch === 'before') {
      hello(w, 9, { watch: true });
    }
    for (const msg of g.start) {
      for (const p of msg.all ? pilots : [pilots[0]]) {
        say(p, msg.all ?? msg);
      }
    }
    tickTo(now + 7000);
    if (watch === 'after') {
      hello(w, 9, { watch: true });
    }
    const mid = w ? w.got.length : 0;
    for (const [who, msg] of g.play) {
      say(pilots[who], typeof msg === 'function' ? msg(room) : msg);
    }
    tickTo(now + 1000);
    return {
      room, pilots, w, mid,
    };
  };

  /* The war and the ops: the view each change, a watcher's the same with
   * no result (core.js watchedView), whose stars and credits a page would
   * pay its pilot; their events the same as the pilots'. The lobby: who
   * is ready, a watcher never counted. */
  const noResult = (m) => (m && m.result != null ? { ...m, result: null } : m);
  const VIEWS = [
    {
      label: 'war', mode: 'war', map: 'itaipu', mission: 'itaipu-drill', type: 'war', key: 'war',
      start: [{ type: 'war', op: 'start', mission: 'itaipu-drill' }],
      play: [[0, { type: 'war', op: 'end' }]],
      on: (v) => v.state === 'countdown' || v.state === 'live',
      over: (v) => v.state === 'ended',
    },
    {
      label: 'ops', mode: null, map: 'interior', type: 'ops', key: 'ops', opts: { devMissions: true },
      start: [{ type: 'ops', op: 'start', mission: 'interior-1' }],
      play: [[0, { type: 'ops', op: 'end' }]],
      on: (v) => v.state === 'countdown' || v.state === 'live',
      over: (v) => v.state === 'ended',
    },
  ];
  for (const g of VIEWS) {
    const before = play(g, 'before');
    const alone = play(g, null);
    const views = (s) => ofType(s, g.type).filter((m) => m[g.key]).map((m) => m[g.key]);
    const seen = views(before.w);
    const told = views(before.pilots[0]);
    check(`${g.label}: a watcher there from the start gets the view, on and then over`, seen.some(g.on) && g.over(seen.at(-1)),
      JSON.stringify(seen.map((v) => v.state)));
    check(`${g.label}: the pilot's last view holds the result (the negative control)`, told.length > 0 && told.at(-1).result != null && g.over(told.at(-1)),
      JSON.stringify(told.at(-1)?.result ?? null));
    check(`${g.label}: the watcher's views are the pilots' with no result`, seen.length === told.length
      && JSON.stringify(seen) === JSON.stringify(told.map(noResult)) && seen.every((v) => v.result == null), `${seen.length} vs ${told.length}`);
    const others = (s) => ofType(s, g.type).filter((m) => !m[g.key] && !m.error);
    check(`${g.label}: and every other ${g.type} message its pilots all get (the births, the cues told to all)`,
      JSON.stringify(others(before.w)) === JSON.stringify(others(before.pilots[0]).filter((m) => !m.cues || m.cues.every((c) => c.heard == null || c.heard === 'all'))),
      `${others(before.w).length} vs ${others(before.pilots[0]).length}`);
    const body = JSON.stringify(texts(before.w));
    check(`${g.label}: nothing the watcher was sent carries a result, stars or credits`, !body.includes('"credits"') && !body.includes('"starIds"')
      && !/"result":\{/.test(body), body.match(/"(credits|starIds)"|"result":\{/)?.[0] ?? '');
    const heard = (p) => p.got.map((m) => (m instanceof Uint8Array ? [...m].join() : JSON.stringify(m.type === 'welcome' ? { ...m, watchers: 0 } : m)));
    const differs = before.pilots.map((p, i) => {
      const [x, y] = [heard(p), heard(alone.pilots[i])];
      const k = x.findIndex((m, j) => m !== y[j]);
      return x.length === y.length && k < 0 ? null : `p${i} at ${k}: ${String(x[k]).slice(0, 120)} vs ${String(y[k]).slice(0, 120)}`;
    }).filter(Boolean);
    check(`${g.label}: the pilots' messages byte for byte those with nobody watching`, differs.length === 0, differs.join(' | ').slice(0, 400));
    check(`${g.label}: the watcher holds no seat, no score row and no role`, !before.room.people().some((p) => p.seat === 0)
      && !JSON.stringify(seen.at(-1).scores ?? []).includes('"seat":0') && !Object.hasOwn(seen.at(-1).roles?.held ?? {}, '0'));
    const after = play(g, 'after');
    const ww = after.w.got.find((m) => m.type === 'welcome');
    check(`${g.label}: a watcher who comes after the start is welcomed into it as it stands, no result`, Boolean(ww) && ww.seat === 0 && g.on(ww[g.key])
      && ww[g.key].result == null, JSON.stringify(ww && ww[g.key] && ww[g.key].state));
    check(`${g.label}: and sees it end, no result`, g.over(views(after.w).at(-1)) && views(after.w).at(-1).result == null);
    /* The page's half, the client's own guard: fed the pilot's messages
     * with result and a welcome to the watch seat, the module holds none. */
    const mod = g.key === 'war' ? createRoomWar(() => {}) : createRoomOps(() => {});
    const pw = before.pilots[0].got.find((m) => m.type === 'welcome');
    mod.onWelcome({ ...pw, seat: 0, watch: true });
    texts(before.pilots[0]).forEach((m) => m.type !== 'welcome' && mod.onMessage(m));
    const pilot = g.key === 'war' ? createRoomWar(() => {}) : createRoomOps(() => {});
    texts(before.pilots[0]).forEach((m) => (m.type === 'welcome' ? pilot.onWelcome(m) : pilot.onMessage(m)));
    check(`${g.label} page: on the watch seat it holds the end and no result, even sent one; a pilot's page holds it`,
      mod.watcher() && g.over(mod.view()) && mod.view().result == null && !pilot.watcher() && pilot.view().result != null,
      JSON.stringify({ watcher: mod.watcher(), state: mod.view().state, result: mod.view().result ?? null }));
  }
  {
    const g = {
      label: 'lobby', mode: null, start: [],
      play: [[0, { type: 'lobby', op: 'ready', ready: true }], [1, { type: 'lobby', op: 'ready', ready: true }]],
    };
    const before = play(g, 'before');
    const alone = play(g, null);
    const ww = before.w.got.find((m) => m.type === 'welcome');
    check('lobby: a watcher is welcomed with the room\'s lobby', Boolean(ww && ww.lobby) && Object.keys(ww.lobby.ready).length === 0, JSON.stringify(ww && ww.lobby));
    const seen = ofType(before.w, 'lobby');
    const told = ofType(before.pilots[0], 'lobby');
    check('lobby: it sees each pilot ready, the same messages the pilots get', seen.length === 2 && JSON.stringify(seen) === JSON.stringify(told)
      && Object.keys(seen.at(-1).lobby.ready).join() === '1,2', JSON.stringify(seen.map((m) => m.lobby.ready)));
    check('lobby: the watcher is never counted: both pilots ready starts the five seconds with it there', seen.at(-1).lobby.countdownAt != null
      && JSON.stringify(seen.at(-1).lobby) === JSON.stringify(ofType(alone.pilots[0], 'lobby').at(-1).lobby));
    const heard = (p) => p.got.map((m) => JSON.stringify(m.type === 'welcome' ? { ...m, watchers: 0 } : m));
    check('lobby: the pilots\' messages byte for byte those with nobody watching', before.pilots.every((p, i) => JSON.stringify(heard(p)) === JSON.stringify(heard(alone.pilots[i]))));
    const after = play(g, 'after');
    const aw = after.w.got.find((m) => m.type === 'welcome');
    check('lobby: a watcher who comes after is welcomed with nobody ready yet, then sees both', Boolean(aw && aw.lobby)
      && Object.keys(ofType(after.w, 'lobby').at(-1)?.lobby.ready ?? {}).join() === '1,2');
  }
}
