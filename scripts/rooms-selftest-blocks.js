/*
 * rooms-selftest-blocks.js: blocks in the room browser and the quick join
 * (COMPLETENESS 60, edge/rooms/lobby.js apart, edge/rooms/front.js
 * joinerOf), part of npm run rooms:selftest. The real front, rooms and
 * lobby in one process (rooms-selftest-browser.js server), with the
 * accounts server stood in for by a fetch that answers GET /api/account
 * for four sessions as tracks-api/accounts.js would.
 *
 * A signed in pilot's list leaves out every room holding a pilot it
 * blocked, or who blocked it, and its quick join passes those rooms over
 * for the next, or a new one; the ids never reach the page. The negative
 * controls: a guest is left out of nothing, and a mute, which lives in its
 * room, never reaches the lobby.
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

import { PROTO, PUBLIC_CAP } from '../src/share/roomwire.js';
import { LIST_MAX, LobbyBook, listingOf } from '../edge/rooms/lobby.js';
import { conn, server } from './rooms-selftest-browser.js';

const ACCOUNTS = 'http://accounts.check';
const profile = { airframe: 'bramor2300', map: 'itaipu', figure: 1, livery: null, parts: null };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/* Goose blocked Iceman; Maverick blocked Goose; Viper blocked nobody. */
const GOOSE = { session: '1'.repeat(64), id: 1, callsign: 'Goose', blocks: [2] };
const ICEMAN = { session: '2'.repeat(64), id: 2, callsign: 'Iceman', blocks: [] };
const VIPER = { session: '3'.repeat(64), id: 3, callsign: 'Viper', blocks: [] };
const MAVERICK = { session: '4'.repeat(64), id: 4, callsign: 'Maverick', blocks: [1] };
const DOWN = '5'.repeat(64);

export async function blocksSection(check) {
  console.log('blocks in the room browser and the quick join');
  const pilots = [GOOSE, ICEMAN, VIPER, MAVERICK];
  const realFetch = globalThis.fetch;
  let asked = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(`${ACCOUNTS}/`)) {
      return realFetch(input, init);
    }
    asked += 1;
    const session = String(init.headers.authorization).replace(/^Bearer /, '');
    if (session === DOWN) {
      return new Response('down', { status: 502 });
    }
    const who = pilots.find((p) => p.session === session);
    return who ? Response.json({ id: who.id, callsign: who.callsign, blocks: who.blocks }) : new Response('{}', { status: 401 });
  };
  try {
    const s = server();
    s.env.ACCOUNTS_ORIGIN = ACCOUNTS;
    const bearer = (who) => (who ? { headers: { authorization: `Bearer ${who.session || who}` } } : {});
    const list = async (who) => {
      const res = await s.call('/v2/rooms', bearer(who));
      return res.status === 200 ? (await res.json()).rooms.map((r) => r.code) : { status: res.status, ...(await res.json()) };
    };
    const quick = async (who, map = 'itaipu') => {
      const res = await s.call(`/v2/public/${map}`, bearer(who));
      return res.status === 200 ? (await res.json()).code : { status: res.status };
    };
    let n = 0;
    /* A pilot seated as node.js seats one: the accounts server's answer
     * for its session handed to the room with the hello. who null: a guest. */
    async function seat(code, who = null, at = s) {
      const res = await at.call(`/v2/room/${code}`, { headers: { upgrade: 'websocket' } });
      const room = at.rooms.get(res.name);
      const c = conn(`10.7.0.${(n += 1)}`);
      const said = (obj) => room.host.message(c, JSON.stringify(obj), who ? who.callsign : null, who ? who.id : null, who ? who.blocks : []);
      room.sockets.add(c);
      await room.host.accept(c, new Request('http://room/', { headers: { 'x-room-address': c.address } }));
      await said({ type: 'hello', proto: PROTO, build: 't', name: [1, 2, 30 + n], profile });
      await settle();
      c.say = async (obj) => {
        await said(obj);
        await settle();
      };
      return c;
    }
    const made = async (name) => (await s.create({ map: 'itaipu', public: true, name })).code;

    /* Iceman's room is the busiest, so a quick join's first choice. */
    const icemanRoom = await made('Iceman room');
    await seat(icemanRoom, ICEMAN);
    const guest = await seat(icemanRoom);
    await seat(icemanRoom);
    const viperRoom = await made('Viper room');
    await seat(viperRoom, VIPER);
    await seat(viperRoom);
    const gooseRoom = await made('Goose room');
    await seat(gooseRoom, GOOSE);

    const all = await list();
    check('a guest\'s list has every room', [icemanRoom, viperRoom, gooseRoom].every((c) => all.includes(c)), JSON.stringify(all));
    const raw = await (await s.call('/v2/rooms', bearer(GOOSE))).json();
    check('a signed in pilot\'s list carries no account id, its own lines as a guest\'s',
      raw.rooms.every((r) => !('accounts' in r) && !('blocking' in r)), JSON.stringify(raw.rooms[0]));
    const goose = await list(GOOSE);
    check('Goose, who blocked Iceman, is not shown Iceman\'s room, and is shown the others', !goose.includes(icemanRoom) && goose.includes(viperRoom),
      JSON.stringify(goose));
    const iceman = await list(ICEMAN);
    check('and Iceman, blocked by Goose, is not shown Goose\'s room', !iceman.includes(gooseRoom) && iceman.includes(viperRoom), JSON.stringify(iceman));
    const maverick = await list(MAVERICK);
    check('Maverick blocked Goose: not shown Goose\'s room, and shown Iceman\'s', !maverick.includes(gooseRoom) && maverick.includes(icemanRoom),
      JSON.stringify(maverick));
    const viper = await list(VIPER);
    check('Viper, who blocked nobody and whom nobody blocked, is shown every room', [icemanRoom, viperRoom, gooseRoom].every((c) => viper.includes(c)),
      JSON.stringify(viper));

    check('a guest\'s quick join lands in the busiest room, Iceman\'s', await quick(null) === icemanRoom);
    check('Goose\'s passes it over for the next busiest, Viper\'s', await quick(GOOSE) === viperRoom);
    const maverickQuick = await quick(MAVERICK);
    check('Maverick\'s lands in Iceman\'s, never Goose\'s', maverickQuick === icemanRoom, maverickQuick);
    const elsewhere = await quick(GOOSE, 'interior');
    check('with no room on a world to go to, a quick join makes a new one', typeof elsewhere === 'string' && ![icemanRoom, viperRoom, gooseRoom].includes(elsewhere),
      JSON.stringify(elsewhere));

    /* The negative control: a mute is the room's, never the lobby's. */
    await guest.say({ type: 'mute', seats: [1] });
    const muted = await list();
    check('negative control: a guest who muted Iceman is still shown Iceman\'s room', muted.includes(icemanRoom), JSON.stringify(muted));
    check('and is still quick joined into it', await quick(null) === icemanRoom);
    check('a made up session is a guest\'s, left out of nothing', (await list('a'.repeat(64))).includes(icemanRoom));

    /* The block taken back on the account: the next ask has it. */
    GOOSE.blocks = [];
    check('a block taken back: Goose\'s next list has Iceman\'s room again', (await list(GOOSE)).includes(icemanRoom));
    GOOSE.blocks = [2];
    const before = asked;
    const down = await list(DOWN);
    check('with the accounts server failing, the list is refused for that pilot, not guessed', down.status === 503 && down.error === 'accounts',
      JSON.stringify(down));
    check('and the quick join too', (await quick(DOWN)).status === 503);
    await list();
    check('a guest\'s list asks the accounts server nothing', asked === before + 2, `${asked - before}`);

    const noAccounts = server();
    const nc = await (await noAccounts.call('/v2/create', { method: 'POST', body: JSON.stringify({ map: 'itaipu', public: true }), address: '10.7.1.1' })).json();
    await seat(nc.code, null, noAccounts);
    const nlist = await noAccounts.call('/v2/rooms', bearer(GOOSE));
    check('a server with no accounts reads no session: its list is everyone\'s', nlist.status === 200
      && (await nlist.json()).rooms.some((r) => r.code === nc.code));

    /* The book: filtered before LIST_MAX is cut, so a pilot whose blocked
     * pilot fills the top of the list still sees the rest. */
    const book = new LobbyBook();
    const t = 1000;
    for (let i = 0; i < LIST_MAX; i += 1) {
      book.report(listingOf({ code: `I${String(i).padStart(5, '0')}`, name: null, pick: [1, 1, 11], map: 'itaipu', cap: PUBLIC_CAP, epoch: i }, 5,
        { game: null, state: 'waiting' }, null, 0, [2], []), t);
    }
    book.report(listingOf({ code: 'QUIET1', name: null, pick: [1, 1, 11], map: 'itaipu', cap: PUBLIC_CAP, epoch: 0 }, 1, { game: null, state: 'waiting' }), t);
    check(`a list is filtered before its first ${LIST_MAX} are taken`, book.list(t, { account: 1, blocks: [2] }).map((r) => r.code).join() === 'QUIET1'
      && !book.list(t).some((r) => r.code === 'QUIET1'));
  } finally {
    globalThis.fetch = realFetch;
  }
}
