/*
 * rooms-selftest-browser.js: the room browser's section of npm run
 * rooms:selftest (the owner's request of 2026-09-28: public rooms listed
 * by name and joined without a code, and a name typed at creation). Kept
 * in its own file, as the combat section is, so the phases that add to
 * scripts/rooms-selftest.js do not edit the same lines.
 *
 * It drives the real front (edge/rooms/front.js), rooms (host.js around
 * core.js) and lobby (lobby.js) in one process, over in-memory storage
 * and fake sockets, the way node.js wires them: making rooms public and
 * private, the name rules on the server, the list, quick join, a report
 * that takes a name away, the host of a public room and the games it
 * starts, and a lobby that forgot everything getting its rooms back.
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

import {
  CLOSE, EMPTY_CLOSE_MS, LIST_EVERY_MS, PROTO, PUBLIC_CAP, ROOM_NAME_MAX, ROOM_NAME_REPORT, normaliseRoomName, validNamePick,
} from '../src/share/roomwire.js';
import front from '../edge/rooms/front.js';
import { PURGE_MS, RoomHost } from '../edge/rooms/host.js';
import { PRIVATE_CAP } from '../edge/rooms/core.js';
import {
  LIST_GRACE_MS, Lobby, LobbyBook, MAX_ROOMS, PENDING_MS, listingOf,
} from '../edge/rooms/lobby.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

const ORIGIN = 'https://fdflabs.github.io';
const profile = { airframe: 'cub1400', map: 'swiss2', figure: 1, livery: null, parts: null };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/* A room's storage; `alarm` is the wall ms the room asked to be purged
 * at, which the platform would call alarm() at, or null. */
function memoryStorage() {
  const kept = new Map();
  const store = {
    kept,
    alarm: null,
    get: async (key) => structuredClone(kept.get(key)),
    put: async (key, value) => {
      kept.set(key, structuredClone(value));
    },
    list: async () => new Map([...kept].map(([k, v]) => [k, structuredClone(v)])),
    deleteAll: async () => {
      kept.clear();
      store.alarm = null;
    },
    setAlarm: async (at) => {
      store.alarm = at;
    },
    getAlarm: async () => store.alarm,
  };
  return store;
}

/* A socket as host.js sees one, keeping what it was sent. */
function conn(address) {
  return {
    address,
    got: [],
    closed: null,
    attachment: null,
    send(data) {
      this.got.push(typeof data === 'string' ? JSON.parse(data) : data);
    },
    close(code, reason) {
      this.closed = { code, reason };
    },
    serializeAttachment(v) {
      this.attachment = structuredClone(v);
    },
    deserializeAttachment() {
      return structuredClone(this.attachment);
    },
  };
}
const texts = (c, type) => c.got.filter((m) => m && m.type === type);

/* The rooms server of node.js in one process, minus the sockets: one
 * RoomHost per name, one Lobby, and front.js answering. `stores` outlives
 * a server, so a second one over it is the same rooms after a restart. */
export function server(stores = new Map(), publicRooms = 'on') {
  const env = { PUBLIC_ROOMS: publicRooms };
  const rooms = new Map();
  env.ROOMS = {
    idFromName: (name) => name,
    get(name) {
      if (!rooms.has(name)) {
        if (!stores.has(name)) {
          stores.set(name, memoryStorage());
        }
        const sockets = new Set();
        const host = new RoomHost({ storage: stores.get(name), getWebSockets: () => [...sockets] }, env);
        rooms.set(name, {
          host,
          sockets,
          async fetch(input, init) {
            const request = input instanceof Request ? input : new Request(input, init);
            if (new URL(request.url).pathname === '/init') {
              return (await host.init(await request.json())) ? new Response('ok') : new Response('taken', { status: 409 });
            }
            /* A socket: the caller seats it with join() below. */
            return { status: 101, name };
          },
        });
      }
      return rooms.get(name);
    },
  };
  const lobby = new Lobby({ storage: memoryStorage() }, env);
  env.LOBBY = { idFromName: (name) => name, get: () => ({ fetch: (input, init) => lobby.fetch(input instanceof Request ? input : new Request(input, init)) }) };
  let address = 0;
  const call = (path, init = {}) => front.fetch(new Request(`http://rooms${path}`, {
    ...init,
    headers: { origin: ORIGIN, 'cf-connecting-ip': init.address || `10.9.${Math.floor(address / 200)}.${(address += 1) % 200}`, ...(init.headers || {}) },
  }), env);
  const s = {
    env,
    call,
    stores,
    rooms,
    lobby,
    async create(body) {
      const res = await call('/v2/create', { method: 'POST', body: JSON.stringify(body) });
      await settle();
      return { status: res.status, ...(await res.json()) };
    },
    async list(ip) {
      const res = await call('/v2/rooms', ip ? { address: ip } : {});
      return res.status === 200 ? res.json() : { status: res.status };
    },
    /* A pilot into the room `code` (a /v2/room socket) or a quick join
     * on a map, seated with a hello. */
    async join(where, name = [1, 2, 30], ip = `10.8.0.${(address += 1) % 250}`) {
      const res = await call(where.code ? `/v2/room/${where.code}` : `/v2/public/${where.map}`, { headers: { upgrade: 'websocket' }, address: ip });
      if (res.status !== 101) {
        return { refused: res.status };
      }
      const room = rooms.get(res.name);
      const c = conn(ip);
      room.sockets.add(c);
      await room.host.accept(c, new Request('http://room/', { headers: { 'x-room-address': ip } }));
      await room.host.message(c, JSON.stringify({ type: 'hello', proto: PROTO, build: 't', name, profile }));
      await settle();
      c.room = room;
      c.welcome = texts(c, 'welcome')[0];
      c.say = async (obj) => {
        await room.host.message(c, JSON.stringify(obj));
        await settle();
      };
      c.leave = async () => {
        room.sockets.delete(c);
        await room.host.close(c);
        await settle();
      };
      return c;
    },
  };
  return s;
}

export async function browserSection(check) {
  console.log('room browser: names');
  check('a typed name is trimmed and its spaces collapsed', normaliseRoomName('  Sky   Club  ') === 'Sky Club');
  check('Spanish letters and a little punctuation pass', normaliseRoomName('¡Vamos, Niñas!') === '¡Vamos, Niñas!' && normaliseRoomName('Club #1 & Co.') === 'Club #1 & Co.'
    && normaliseRoomName("Kid's Club") === "Kid's Club");
  check(`a name is 3 to ${ROOM_NAME_MAX} letters`, normaliseRoomName('ab') === null && normaliseRoomName('abc') === 'abc'
    && normaliseRoomName('x'.repeat(ROOM_NAME_MAX)) !== null && normaliseRoomName('x'.repeat(ROOM_NAME_MAX + 1)) === null);
  check('another script\'s lookalike letter, a symbol, an emoji or a control are refused', normaliseRoomName('Сlub') === null
    && normaliseRoomName('a$$ club') === null && normaliseRoomName('club \u{1F600}') === null && normaliseRoomName('club\u0007x') === null);
  check('and a name that is not text is none', normaliseRoomName(42) === null && normaliseRoomName(null) === null);

  console.log('room browser: making rooms');
  let s = server();
  const made = await s.create({ map: 'swiss2', public: true, name: '  Sky   Club ' });
  check('a public room is made with a code the browser joins it by', made.status === 200 && /^[A-Z0-9]{6}$/.test(made.code), JSON.stringify(made));
  const meta = s.stores.get(`prv:${made.code}`).kept.get('meta');
  check('it keeps the name as the server normalised it, a picker name, and the public cap', meta.name === 'Sky Club' && meta.public === true
    && meta.cap === PUBLIC_CAP && validNamePick(meta.pick) && meta.hidden === false, JSON.stringify(meta));
  const bad = await s.create({ map: 'swiss2', public: true, name: 'Fuck Club' });
  check('a name the word filter refuses is refused by the server, whatever the client said', bad.status === 400 && bad.error === 'name');
  const glued = await s.create({ map: 'swiss2', public: true, name: 'the sh1t pilots' });
  check('and spelled with a digit for a letter, too', glued.status === 400 && glued.error === 'name');
  const shape = await s.create({ map: 'swiss2', public: true, name: 'ab' });
  check('a name of the wrong shape is refused the same way', shape.status === 400 && shape.error === 'name');
  const blank = await s.create({ map: 'alps', public: true, name: '   ' });
  const blankMeta = s.stores.get(`prv:${blank.code}`).kept.get('meta');
  check('a blank name makes a room with its picker name', blank.status === 200 && blankMeta.name === null && validNamePick(blankMeta.pick));
  const priv = await s.create({ map: 'swiss2', name: 'Secret Base' });
  const privMeta = s.stores.get(`prv:${priv.code}`).kept.get('meta');
  check(`a private room is made as before, ${PRIVATE_CAP} seats, and may be named too`, priv.status === 200 && privMeta.public === false
    && privMeta.cap === PRIVATE_CAP && privMeta.name === 'Secret Base');
  const moded = await s.create({ map: 'swiss2', public: true, name: 'Paper Wars', mode: 'combat' });
  check('a room can be set up for a game', moded.status === 200 && s.stores.get(`prv:${moded.code}`).kept.get('meta').mode === 'combat');
  const badMode = await s.create({ map: 'swiss2', public: true, mode: 'poker' });
  check('but not for a game there is not', badMode.status === 400 && badMode.error === 'bad');
  const closed = server(new Map(), 'off');
  const refusedPublic = await closed.create({ map: 'swiss2', public: true });
  check('no public room while public rooms are closed', refusedPublic.status === 403);
  check('and the list says so, empty', JSON.stringify(await closed.list()) === '{"open":false,"rooms":[]}');

  /* Yellowstone was retired on 2026-10-01 (src/maps/retired.js), and a
   * page from before then still offers it. */
  console.log('room browser: a retired world');
  const old = server();
  const retiredPublic = await old.create({ map: 'yellowstone', public: true });
  const retiredPrivate = await old.create({ map: 'yellowstone' });
  check('a room on a retired world is refused, public or private, as a bad request',
    retiredPublic.status === 400 && retiredPublic.error === 'bad' && retiredPrivate.status === 400 && retiredPrivate.error === 'bad'
    && old.stores.size === 0, `${JSON.stringify(retiredPublic)} ${JSON.stringify(retiredPrivate)}`);
  const quickOld = await old.join({ map: 'yellowstone' });
  check('and so is a quick join on one, with no room made for it', quickOld.refused === 404 && old.stores.size === 0, JSON.stringify(quickOld));
  const unretired = await old.create({ map: 'itaipu' });
  check('a world the simulator has is made as before', unretired.status === 200);
  /* A room stored on Yellowstone before the deploy, as the VM's SQLite
   * keeps it across the restart that brings this build. */
  const keptOld = await old.create({ map: 'alps' });
  const oldStore = old.stores.get(`prv:${keptOld.code}`);
  oldStore.kept.set('meta', { ...oldStore.kept.get('meta'), map: 'yellowstone' });
  const after = server(old.stores);
  const wakes = await after.join({ code: keptOld.code });
  check('a room stored on a retired world wakes in the Swiss valley, keeps its code, and stores the move',
    wakes.welcome && wakes.welcome.map === 'swiss2' && oldStore.kept.get('meta').map === 'swiss2',
    `${wakes.welcome && wakes.welcome.map} ${oldStore.kept.get('meta').map}`);
  await wakes.say({ type: 'world', map: 'yellowstone' });
  check('and its host cannot move it back there', oldStore.kept.get('meta').map === 'swiss2' && texts(wakes, 'world').length === 0);

  console.log('room browser: the list');
  let list = await s.list();
  const codes = list.rooms.map((r) => r.code);
  check('every public room is listed as soon as it is made, before anybody is in it', list.open === true
    && [made.code, blank.code, moded.code].every((c) => codes.includes(c)), codes.join());
  check('a private room never is', !codes.includes(priv.code));
  const sky = list.rooms.find((r) => r.code === made.code);
  check('a line says the name, world, pilots, cap and game', sky && sky.name === 'Sky Club' && sky.map === 'swiss2' && sky.n === 0
    && sky.cap === PUBLIC_CAP && sky.game === null && sky.state === 'waiting' && validNamePick(sky.pick), JSON.stringify(sky));
  check('and a room set up for a game shows it, waiting', list.rooms.find((r) => r.code === moded.code).game === 'combat');
  check('a line carries nothing about a pilot', sky && Object.keys(sky).sort().join() === 'cap,code,emptySince,game,map,mission,mode,n,name,pick,state,wave,waves');

  const a = await s.join({ code: made.code }, [1, 2, 30]);
  check('a pilot joins a public room by its code, no typing', a.welcome && a.welcome.public === true && a.welcome.code === made.code
    && a.welcome.name === 'Sky Club' && a.welcome.cap === PUBLIC_CAP);
  check('the creator, first in, is the host', a.welcome.host === a.welcome.seat);
  const p1 = await s.join({ code: priv.code });
  check('a pilot in a private room is still not listed', !(await s.list()).rooms.some((r) => r.code === priv.code) && p1.welcome && p1.welcome.public === false);
  const b = await s.join({ code: made.code }, [3, 4, 40]);
  list = await s.list();
  check('the list counts the pilots in', list.rooms.find((r) => r.code === made.code).n === 2);
  check('people first: the room with pilots is at the top', list.rooms[0].code === made.code);

  console.log('room browser: a public room\'s host');
  const c = await s.join({ code: made.code }, [5, 6, 50]);
  await a.leave();
  const handed = texts(b, 'leave').pop();
  check('when the host leaves, the pilot in longest becomes host', handed && handed.host === b.welcome.seat && texts(c, 'leave').pop().host === b.welcome.seat);
  await b.say({ type: 'kick', seat: c.welcome.seat });
  check('and a public room\'s host still cannot kick: reports decide', !c.closed);
  await c.say({ type: 'combat', op: 'start', minutes: 3 });
  check('a pilot who is not host starts nothing', texts(b, 'combat').length === 0);
  await b.say({ type: 'combat', op: 'start', minutes: 3 });
  check('the host starts combat', texts(c, 'combat').some((m) => m.state === 'countdown'));
  let line = (await s.list()).rooms.find((r) => r.code === made.code);
  check('and the list shows combat counting down', line.game === 'combat' && line.state === 'countdown', JSON.stringify(line));
  await b.say({ type: 'combat', op: 'stop' });
  await b.say({ type: 'tag', op: 'start', goal: 5 });
  check('the host starts Catch the Ace', texts(c, 'tag').some((m) => m.tag && m.tag.state === 'countdown'));
  line = (await s.list()).rooms.find((r) => r.code === made.code);
  check('and the list shows it', line.game === 'tag' && line.state === 'countdown', JSON.stringify(line));
  await b.say({ type: 'tag', op: 'end' });
  /* The host has sent five texts this second, the room's allowance
   * (core.js TEXT_PER_S), and the room clock here is the wall's. */
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const doc = mapTrackDocument({ id: 'trk-brws0001', name: 'Browser check', types: ['gate', 'gate', 'gate'], radius: 60 });
  await b.say({ type: 'track', doc });
  await b.say({ type: 'race', op: 'ready', ready: true, track: doc.id });
  await b.say({ type: 'race', op: 'start', laps: 1 });
  check('the host starts a race', texts(c, 'race').some((m) => m.race && m.race.state === 'on'));
  line = (await s.list()).rooms.find((r) => r.code === made.code);
  check('and the list shows it', line.game === 'race' && line.state === 'countdown', JSON.stringify(line));

  console.log('room browser: a bad name reported');
  const d = await s.join({ code: made.code }, [7, 8, 60]);
  await c.say({ type: 'report', seat: 0, reason: ROOM_NAME_REPORT });
  check('one report is heard and does nothing yet', texts(c, 'reported').some((m) => m.seat === 0) && s.stores.get(`prv:${made.code}`).kept.get('meta').name === 'Sky Club');
  await c.say({ type: 'report', seat: 0, reason: ROOM_NAME_REPORT });
  check('the same pilot twice is still one', s.stores.get(`prv:${made.code}`).kept.get('meta').name === 'Sky Club');
  await d.say({ type: 'report', seat: 0, reason: ROOM_NAME_REPORT });
  const renamed = texts(b, 'room').pop();
  const kept = s.stores.get(`prv:${made.code}`).kept.get('meta');
  check('a second pilot\'s report takes the name away: everybody in is told the picker name', renamed && renamed.name === null
    && renamed.pick.join() === kept.pick.join() && texts(d, 'room').length === 1);
  check('and the room keeps that in storage', kept.name === null && kept.hidden === true);
  check('the room leaves the browser', !(await s.list()).rooms.some((r) => r.code === made.code));
  check('its pilots fly on', !b.closed && !c.closed && !d.closed);
  const later = await s.join({ code: made.code }, [9, 9, 70]);
  check('a pilot who joins later by its code sees the picker name', later.welcome && later.welcome.name === null && later.welcome.pick.join() === kept.pick.join());

  console.log('room browser: a household behind one address');
  s = server();
  const home = await s.create({ map: 'swiss2', public: true, name: 'Family Room' });
  const family = [];
  for (let i = 0; i < PUBLIC_CAP; i += 1) {
    family.push(await s.join({ code: home.code }, [i % 24, (i * 5) % 24, 20 + i], '10.50.0.1'));
  }
  check(`${PUBLIC_CAP} pilots from one address fill a public room: no address limit refuses a seat that is free`,
    family.every((p) => p.welcome && !p.closed), family.filter((p) => !p.welcome || p.closed).map((p) => JSON.stringify(p.closed)).join());
  let polled = 0;
  for (let i = 0; i < PUBLIC_CAP * (60000 / LIST_EVERY_MS); i += 1) {
    polled += (await s.list('10.50.0.1')).open ? 1 : 0;
  }
  check(`and ${PUBLIC_CAP} of them with Rooms open for a minute are all answered`, polled === PUBLIC_CAP * (60000 / LIST_EVERY_MS), `${polled}`);
  let scripted = 0;
  for (let i = 0; i < PUBLIC_CAP * (60000 / LIST_EVERY_MS); i += 1) {
    scripted += (await s.list('10.50.0.1')).status === 429 ? 1 : 0;
  }
  check('but a script asking twice that is refused', scripted > 0, `${scripted}`);

  console.log('room browser: quick join');
  s = server();
  const q1 = await s.join({ map: 'swiss2' });
  check('a quick join with no room makes one, public, with its picker name', q1.welcome && q1.welcome.public === true && q1.welcome.name === null
    && validNamePick(q1.welcome.pick) && /^[A-Z0-9]{6}$/.test(q1.welcome.code));
  const q2 = await s.join({ map: 'swiss2' });
  check('the next quick join lands in it', q2.welcome && q2.welcome.code === q1.welcome.code);
  const named = await s.create({ map: 'swiss2', public: true, name: 'Big One' });
  const inBig = [];
  for (let i = 0; i < 3; i += 1) {
    inBig.push(await s.join({ code: named.code }, [i, i, 20 + i]));
  }
  const q3 = await s.join({ map: 'swiss2' });
  check('a quick join goes to the busiest room of its map with a seat', q3.welcome && q3.welcome.code === named.code);
  const q4 = await s.join({ map: 'alps' });
  check('and never to another map\'s', q4.welcome && q4.welcome.code !== named.code && q4.welcome.code !== q1.welcome.code);
  await q4.leave();
  const q4Alarm = s.stores.get(`prv:${q4.welcome.code}`).alarm;
  check('a map that is not an id is refused', (await s.join({ map: 'Swiss2' })).refused === 404);

  console.log('room browser: the book');
  let t = 1000;
  const book = new LobbyBook();
  const line1 = (code, n, created, extra = {}) => ({
    ...listingOf({ code, name: null, pick: [1, 1, 11], map: 'swiss2', cap: PUBLIC_CAP, epoch: created, ...extra }, n, { game: null, state: 'waiting' }),
  });
  book.report(line1('AAAAAA', 0, 1), t);
  book.report(line1('BBBBBB', 3, 2), t);
  book.report(line1('CCCCCC', 3, 3), t);
  check('people first, then the newest', book.list(t).map((r) => r.code).join() === 'CCCCCC,BBBBBB,AAAAAA');
  check('an empty room is listed as empty since it emptied', book.list(t).find((r) => r.code === 'AAAAAA').emptySince === t
    && book.list(t).find((r) => r.code === 'BBBBBB').emptySince === null);
  t += LIST_GRACE_MS - 1;
  check('an empty room stays listed until it closes', book.list(t).some((r) => r.code === 'AAAAAA'));
  t += 1;
  check(`and is gone ${LIST_GRACE_MS / 60000} minutes after it emptied`, !book.list(t).some((r) => r.code === 'AAAAAA') && !('AAAAAA' in book.rooms));
  book.report(line1('OWNTIM', 0, 5, {}), t);
  book.report({ ...line1('OWNTIM', 0, 5), emptySince: t - 60000 }, t);
  check('a room\'s own emptied time is the one the book lists it by, not when its line arrived',
    book.list(t).find((r) => r.code === 'OWNTIM').emptySince === t - 60000 && !book.list(t - 60000 + LIST_GRACE_MS).some((r) => r.code === 'OWNTIM'));
  book.report(line1('BBBBBB', 0, 2), t);
  t += LIST_GRACE_MS;
  check('the same for a room its pilots left', !book.list(t).some((r) => r.code === 'BBBBBB'));
  book.report(line1('BBBBBB', 1, 2), t);
  check('and a pilot back by its code lists it again', book.list(t).some((r) => r.code === 'BBBBBB'));
  book.report(line1('HHHHHH', 5, 4, { hidden: true }), t);
  check('a hidden room is never listed', !book.list(t).some((r) => r.code === 'HHHHHH'));
  check('nor handed to a quick join, though busiest', book.quick('swiss2', t, 'NEWONE').code === 'CCCCCC');
  const burst = new LobbyBook();
  const where = [];
  for (let i = 0; i < PUBLIC_CAP + 2; i += 1) {
    where.push(burst.quick('alps', t, `NEW${String(i).padStart(3, '0')}`));
  }
  check(`a burst of quick joins before any room reports fills one room to ${PUBLIC_CAP}, then makes a second`,
    where.filter((w) => w.code === 'NEW000').length === PUBLIC_CAP && where[0].fresh && where[PUBLIC_CAP].fresh && where[PUBLIC_CAP + 1].code === where[PUBLIC_CAP].code);
  check('a room booked by a quick join is not listed until it reports', !burst.list(t).length);
  t += PENDING_MS;
  check('a booking whose room never reported lapses, and the next quick join makes a room again', burst.quick('alps', t, 'LATE01').code === 'LATE01' && !('NEW000' in burst.rooms));
  const flood = new LobbyBook();
  for (let i = 0; i < MAX_ROOMS; i += 1) {
    flood.report(line1(`F${i}`, 1, i), t);
  }
  check(`the book holds at most ${MAX_ROOMS} rooms`, flood.report(line1('ONEMORE', 1, 0), t) === false && flood.quick('fresh', t, 'ONEMORE') === null);

  console.log('room browser: after a restart');
  const again = server(s.stores);
  check('a lobby that forgot everything lists nothing', (await again.list()).rooms.length === 0);
  for (const name of s.stores.keys()) {
    await again.env.ROOMS.get(name).host.announce();
  }
  await settle();
  const back = (await again.list()).rooms.map((r) => r.code);
  check('until each stored public room announces itself, as node.js has them do on start', back.includes(named.code) && back.includes(q1.welcome.code), back.join());
  const q4Back = (await again.list()).rooms.find((r) => r.code === q4.welcome.code);
  check('an empty room is listed empty since its last pilot left, by its stored alarm, not since the restart',
    q4Back && q4Back.n === 0 && q4Back.emptySince === q4Alarm - PURGE_MS, `${JSON.stringify(q4Back)} alarm ${q4Alarm}`);
  const again1 = await again.join({ code: named.code }, [1, 1, 11]);
  check('and its pilots come back into it', again1.welcome && again1.welcome.code === named.code && again1.welcome.name === 'Big One');

  await closingSection(check);
}

/* The owner, 2026-09-30: "room closes after 5 minutes of it being empty".
 * The platform calls host.alarm() at the time the room set (node.js
 * schedule, a Durable Object's alarm), so these read the time it set and
 * then fire it. */
async function closingSection(check) {
  console.log('room browser: an empty room closes five minutes after its last pilot');
  check('five minutes, one number for the purge, the list and the browser',
    EMPTY_CLOSE_MS === 5 * 60 * 1000 && PURGE_MS === EMPTY_CLOSE_MS && LIST_GRACE_MS === EMPTY_CLOSE_MS);
  const s = server();
  const made = await s.create({ map: 'swiss2', public: true, name: 'Closing Club' });
  const store = s.stores.get(`prv:${made.code}`);
  const room = s.rooms.get(`prv:${made.code}`);
  const a = await s.join({ code: made.code });
  const b = await s.join({ code: made.code }, [2, 3, 40]);
  await a.leave();
  const armed = store.alarm;
  const leftAt = Date.now();
  await b.leave();
  const doneAt = Date.now();
  check('the last pilot out sets the close five minutes on, not the first', store.alarm > armed || armed === null);
  check('five minutes after the last pilot left', store.alarm >= leftAt + PURGE_MS && store.alarm <= doneAt + PURGE_MS, `${store.alarm - leftAt}`);
  const body = await (await s.call('/v2/rooms')).json();
  const line = body.rooms.find((r) => r.code === made.code);
  check('the list still shows it, empty, with the time it emptied and the server\'s clock',
    line && line.n === 0 && line.emptySince === store.alarm - PURGE_MS && Number.isFinite(body.now) && body.now >= line.emptySince, JSON.stringify(line));
  const book = await s.lobby.book();
  check('listed up to the moment it closes, and not after: the list never offers a room that has gone',
    book.list(store.alarm - 1).some((r) => r.code === made.code) && !book.list(store.alarm).some((r) => r.code === made.code));
  check('not closed before then: its storage is all there', store.kept.has('meta'));
  const c = await s.join({ code: made.code }, [4, 5, 50]);
  check('a pilot can still join it while it is empty and listed', c.welcome && c.welcome.code === made.code && !c.closed);
  const back = (await s.list()).rooms.find((r) => r.code === made.code);
  check('rejoining takes it off empty', back && back.n === 1 && back.emptySince === null, JSON.stringify(back));
  await room.host.alarm();
  check('rejoining cancels the close: the alarm that comes finds a pilot and keeps the room', store.kept.has('meta') && !c.closed);
  check('and waits another five minutes', store.alarm >= Date.now() - 50 + PURGE_MS - 1000);
  const leftAgain = Date.now();
  await c.leave();
  check('when that pilot leaves, five minutes from then', store.alarm >= leftAgain + PURGE_MS && store.alarm <= Date.now() + PURGE_MS);
  check('and the list says empty since then', (await s.list()).rooms.find((r) => r.code === made.code).emptySince === store.alarm - PURGE_MS);
  await room.host.alarm();
  check('the alarm with nobody back closes it: nothing kept', store.kept.size === 0 && store.alarm === null);
  const late = await s.join({ code: made.code }, [6, 7, 60]);
  check('and its code finds no room', !late.welcome && late.closed && late.closed.code === CLOSE.nosuch, JSON.stringify(late.closed));

  const priv = await s.create({ map: 'swiss2', name: 'Secret Close' });
  const pstore = s.stores.get(`prv:${priv.code}`);
  const p = await s.join({ code: priv.code });
  const pLeft = Date.now();
  await p.leave();
  check('a private room closes by the same rule: five minutes after its last pilot', pstore.alarm >= pLeft + PURGE_MS && pstore.alarm <= Date.now() + PURGE_MS);
  check('and is never listed, empty or not', !(await s.list()).rooms.some((r) => r.code === priv.code));
  await s.rooms.get(`prv:${priv.code}`).host.alarm();
  check('then it is gone', pstore.kept.size === 0);

  const never = await s.create({ map: 'alps', public: true, name: 'Nobody Came' });
  const nstore = s.stores.get(`prv:${never.code}`);
  const nline = (await s.list()).rooms.find((r) => r.code === never.code);
  check('a room made and never joined is listed empty since it was made, and closes five minutes on',
    nline && nline.emptySince === nstore.alarm - PURGE_MS && nstore.kept.get('meta').epoch <= nline.emptySince + 50, JSON.stringify(nline));
}
