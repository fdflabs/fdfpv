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
  CLOSE, PROTO, PUBLIC_CAP, ROOM_LEVEL, TYPE_PARTS, TYPE_STREAMER, WAR_JOIN, encodeFoot, encodePose,
} from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore, WATCH_CAP } from '../edge/rooms/core.js';
import { reportRoom } from '../edge/rooms/lobby.js';
import { checkRoomLine } from '../src/share/roomlist.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

const profile = { airframe: 'cub1400', map: 'swiss2', figure: 1, livery: null, parts: null };
const trackDoc = mapTrackDocument({ id: 'trk-watch001' });

/* Each game as its host starts it; free flight has none. */
const GAMES = [
  { label: 'free flight', mode: null, start: [] },
  {
    label: 'race',
    mode: 'race',
    start: [{ type: 'track', doc: trackDoc }, { all: { type: 'race', op: 'ready', ready: true, track: trackDoc.id } }, { type: 'race', op: 'start', laps: 1 }],
  },
  { label: 'tag', mode: 'tag', start: [{ type: 'tag', op: 'start', goal: 5 }] },
  { label: 'jam', mode: 'jam', start: [{ type: 'jam', op: 'start', seconds: 60 }] },
  { label: 'combat', mode: 'combat', start: [{ type: 'combat', op: 'start', minutes: 5 }] },
  { label: 'war', mode: 'war', map: 'itaipu', mission: 'itaipu-drill', start: [{ type: 'war', op: 'start', mission: 'itaipu-drill' }] },
];

/* Every word a pilot's page may say, each game's included: from a watcher
 * none of them may act. */
const WORDS = [
  { type: 'track', doc: trackDoc },
  { type: 'race', op: 'ready', ready: true, track: trackDoc.id },
  { type: 'race', op: 'start', laps: 1 },
  { type: 'race', op: 'end' },
  { type: 'event', kind: 'gate', race: 1, lap: 1, gate: 1, t: 1000 },
  { type: 'tag', op: 'start', goal: 5 },
  { type: 'tag', op: 'end' },
  { type: 'jam', op: 'start', seconds: 60 },
  {
    type: 'jam', op: 'score', total: 900, tricks: 3, unique: 3, crashes: 0, last: { name: 'Powerloop', execution: 'CLEAN', points: 300 },
  },
  { type: 'jam', op: 'end' },
  { type: 'combat', op: 'start', minutes: 5 },
  { type: 'combat', op: 'respawn' },
  { type: 'combat', op: 'stop' },
  { type: 'war', op: 'start', mission: 'itaipu-drill' },
  { type: 'war', op: 'ready', ready: true },
  { type: 'war', op: 'loadout', airframe: 'cub1400' },
  { type: 'war', op: 'lost' },
  { type: 'war', op: 'skip' },
  { type: 'war', op: 'end' },
  { type: 'ops', op: 'start' },
  { type: 'lobby', op: 'ready', ready: true },
  { type: 'handhost', seat: 2 },
  { type: 'kick', seat: 2 },
  { type: 'bots', level: 1 },
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
    race: [room.race.track && room.race.track.id, room.race.race],
    tag: room.tag.match,
    jam: room.jam.match,
    combat: room.combat.round,
    war: room.war.welcome(room),
    ops: room.ops.welcome(room),
    lobby: room.gameLobby.welcome(room),
    bots: room.bots.welcome(),
  });
  const binaries = () => [
    encodePose({
      flags: 0, seq: 1, t: now, px: 1, py: 300, pz: 1, qx: 0, qy: 0, qz: 0, qw: 1, vx: 20, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 500, flaps: 0,
    }),
    new Uint8Array([TYPE_PARTS, 0, 0, 0, 0, 1]),
    new Uint8Array([TYPE_STREAMER, 0, 0, 0, 0, 1]),
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
      code: 'W4TCHR', cap: PRIVATE_CAP, friendly: false, map: g.map ?? 'swiss2', epoch: now - 1000, public: false,
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
    check(`${g.label}: the host starts it with the watcher there`, room.game() === g.mode && (g.mode !== 'race' || room.race.race?.state === 'on'),
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
      code: 'W4TCHH', cap: PRIVATE_CAP, friendly: false, map: 'swiss2', epoch: now - 1000, public: false, mode: null, name: null, pick: [1, 1, 11], hidden: false,
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
      code: 'W4TCHL', cap: PUBLIC_CAP, friendly: false, map: 'swiss2', epoch: now - 1000, public: true, mode: null, name: null, pick: [1, 1, 11], hidden: false,
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
