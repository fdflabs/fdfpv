/*
 * dev-accounts-selftest.js: the owner's allowlist on the live rooms
 * server (DEV_ACCOUNTS, edge/rooms/core.js devHost). npm run dev:accounts.
 *
 * The owner flies missions still in development on the live server
 * before they are released; nobody else may. A room whose HOST's seat is
 * one of DEV_ACCOUNTS (account ids the accounts server proved for the
 * seat's session, never anything a client says) starts missions in
 * 'development', never 'soon'; every other room is as it was.
 *
 *   parse      DEV_ACCOUNTS read as positive ids, junk left out
 *   ops        an allowlisted host starts The Interior's Mission 1; a host
 *              not on the list is refused 'unreleased'; an allowlisted
 *              pilot who is not the host opens nothing in that room
 *              (refused 'host') and the host's start is still refused; a
 *              server with no list refuses the owner too
 *   war        the same for Act 1's mission 2 (in development)
 *   lobby      a war room's lobby offers a mission in development to the
 *              allowlisted host only
 *   restart    the host's account survives a restore from its socket's
 *              attachment
 *   accounts   helloAccount takes the account's id from the accounts
 *              server's answer (a stubbed fetch), null without one (the
 *              accounts server's GET /api/account carrying it is
 *              tracks-api/accounts-selftest.js's row)
 *   forged     a hello naming the owner's id itself is seated as the
 *              account its session is, and its room is no dev host
 *   dev flag   GET /v2/dev (edge/rooms/front.js), which lifts the
 *              campaign's win first lock: true only for a session the
 *              accounts server says is on the list; false for another
 *              pilot, an id named in the request, an unknown or missing
 *              session, and a server with no accounts origin or no list;
 *              503 while the accounts server is down
 *   create     a private war room may name a mission in development once
 *              the server has a list; a public one, or one only planned,
 *              still may not
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

import { ACCOUNT_JOIN, PROTO } from '../src/share/roomwire.js';
import { PRIVATE_CAP, RoomCore, devAccountsOf } from '../edge/rooms/core.js';
import { helloAccount } from '../edge/rooms/node.js';
import front from '../edge/rooms/front.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const OWNER = 42;
const OTHER = 7;

/* A room on `map` with DEV_ACCOUNTS `list`, and pilots seated with the
 * accounts given, in order (the first is the host). */
function room(map, list, accounts) {
  const r = new RoomCore({
    code: 'DEV000', cap: PRIVATE_CAP, friendly: false, map, epoch: 0,
  }, { devAccounts: devAccountsOf(list) });
  let tokens = 0;
  const socks = accounts.map((account, i) => {
    const so = { name: `p${i}`, address: `10.6.0.${i + 1}`, got: [] };
    r.open(so, 0);
    for (const x of r.message(so, JSON.stringify({
      type: 'hello', proto: PROTO, build: 't', name: [i, i, 20 + i], profile: {
        airframe: map === 'itaipu' ? 'interceptor' : 'bramor2300', map, figure: 1, livery: null, parts: null,
      },
    }), 0, so.address, () => (tokens += 1).toString(16).padStart(32, '0'), `PILOT${i}`, account)) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      }
    }
    return so;
  });
  const say = (i, msg) => {
    for (const x of r.message(socks[i], JSON.stringify(msg), 10, socks[i].address)) {
      if (x.send) {
        x.send.got.push(typeof x.data === 'string' ? JSON.parse(x.data) : x.data);
      }
    }
  };
  const last = (i, pred) => socks[i].got.filter(pred).at(-1);
  return {
    r, socks, say, last,
  };
}

console.log('parse');
{
  const s = devAccountsOf(' 42, 7 ,x,0,-3,1.5,,12345678901234567890 ');
  check('positive ids kept, junk left out', [...s].sort((a, b) => a - b).join() === '7,42', [...s].join());
  check('nothing set is an empty list', devAccountsOf(undefined).size === 0 && devAccountsOf('').size === 0);
}

console.log('ops: The Interior, Mission 1 (development)');
{
  const a = room('interior', `${OWNER}`, [OWNER]);
  check('the host on the list is the room\'s dev host', a.r.devHost());
  a.say(0, { type: 'ops', op: 'start', mission: 'interior-1' });
  check('the allowlisted host starts Mission 1', a.last(0, (m) => m.type === 'ops' && m.ops)?.ops.state === 'countdown');
  const b = room('interior', `${OWNER}`, [OTHER]);
  b.say(0, { type: 'ops', op: 'start', mission: 'interior-1' });
  check('a host not on the list is refused unreleased', b.last(0, (m) => m.type === 'ops' && m.error)?.error === 'unreleased' && !b.r.ops.on());
  const c = room('interior', `${OWNER}`, [OTHER, OWNER]);
  check('an allowlisted pilot who is not the host makes nothing dev', !c.r.devHost());
  c.say(1, { type: 'ops', op: 'start', mission: 'interior-1' });
  check('its own start is refused: not the host', c.last(1, (m) => m.type === 'refused')?.why === 'host' && !c.r.ops.on());
  c.say(0, { type: 'ops', op: 'start', mission: 'interior-1' });
  check('and the host\'s start is still refused unreleased', c.last(0, (m) => m.type === 'ops' && m.error)?.error === 'unreleased' && !c.r.ops.on());
  const d = room('interior', '', [OWNER]);
  d.say(0, { type: 'ops', op: 'start', mission: 'interior-1' });
  check('a server with no list refuses the owner too', d.last(0, (m) => m.type === 'ops' && m.error)?.error === 'unreleased');
  const g = room('interior', `${OWNER}`, [null]);
  g.say(0, { type: 'ops', op: 'start', mission: 'interior-1' });
  check('a guest seat (no account) is refused', g.last(0, (m) => m.type === 'ops' && m.error)?.error === 'unreleased');
}

console.log('war: Act 1, mission 2 (development)');
{
  const a = room('itaipu', `${OWNER}`, [OWNER]);
  a.say(0, { type: 'war', op: 'start', mission: 'itaipu-2' });
  check('the allowlisted host starts mission 2', ['countdown', 'briefing'].includes(a.last(0, (m) => m.type === 'war' && m.war)?.war.state));
  const b = room('itaipu', `${OWNER}`, [OTHER, OWNER]);
  b.say(0, { type: 'war', op: 'start', mission: 'itaipu-2' });
  check('a host not on the list, with the owner seated, is refused unreleased', b.last(0, (m) => m.type === 'war' && m.error)?.error === 'unreleased' && !b.r.war.on());
  const c = room('itaipu', `${OWNER}`, [OWNER]);
  c.say(0, { type: 'war', op: 'start', mission: 'itaipu-5' });
  check('a mission only planned (soon) never starts, list or not', c.last(0, (m) => m.type === 'war' && m.error) != null && !c.r.war.on());
  check('the lobby offers mission 2 to the allowlisted host only', a.r.war.startable('itaipu-2', a.r) && !b.r.war.startable('itaipu-2', b.r) && !a.r.war.startable('itaipu-2'));
}

console.log('restart');
{
  const a = room('interior', `${OWNER}`, [OWNER]);
  const att = a.r.attachmentOf([...a.r.seats.values()][0]);
  const r2 = new RoomCore({ ...a.r.meta }, { devAccounts: devAccountsOf(`${OWNER}`) });
  r2.restore([{ conn: a.socks[0], attachment: att }]);
  check('the attachment carries the account, and the restored room keeps its dev host', att.account === OWNER && r2.devHost());
}

console.log('accounts');
{
  const realFetch = globalThis.fetch;
  const hello = JSON.stringify({ type: 'hello', account: ACCOUNT_JOIN, session: 'a'.repeat(64) });
  const env = { ACCOUNTS_ORIGIN: 'http://accounts.test' };
  globalThis.fetch = async () => new Response(JSON.stringify({ id: OWNER, callsign: 'Ace', publicKey: null }), { status: 200 });
  const yes = await helloAccount(hello, env, '10.0.0.1');
  globalThis.fetch = async () => new Response(JSON.stringify({ callsign: 'Ace' }), { status: 200 });
  const old = await helloAccount(hello, env, '10.0.0.1');
  globalThis.fetch = async () => new Response(JSON.stringify({ id: '42', callsign: 'Ace' }), { status: 200 });
  const odd = await helloAccount(hello, env, '10.0.0.1');
  globalThis.fetch = realFetch;
  check('the accounts server\'s id becomes the seat\'s account', yes.account === OWNER && typeof yes.callsign === 'string', JSON.stringify(yes));
  check('an answer without an id (an older accounts server): no account, still seated', old.account === null && typeof old.callsign === 'string');
  check('an id that is not a positive integer is no account', odd.account === null);
  const none = await helloAccount(hello, {}, '');
  check('a server with no accounts origin: a guest, no account', none.account === null && none.callsign === null);
}

console.log('forged');
{
  /* A hello naming the owner every way it could: its own id, the owner's
   * number where the protocol level goes, a callsign. The accounts server
   * says the session is OTHER's, and that is the seat. */
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: OTHER, callsign: 'Pilot' }), { status: 200 });
  const env = { ACCOUNTS_ORIGIN: 'http://accounts.test' };
  const forged = await helloAccount(JSON.stringify({
    type: 'hello', account: OWNER, id: OWNER, accountId: OWNER, callsign: 'Owner', session: 'b'.repeat(64),
  }), env, '10.0.0.2');
  globalThis.fetch = realFetch;
  check('a hello naming the owner\'s id is seated as the account its session is', forged.account === OTHER && forged.callsign === 'Pilot', JSON.stringify(forged));
  const a = room('itaipu', `${OWNER}`, [forged.account]);
  check('and its room is no dev host', !a.r.devHost());
}

console.log('dev flag: GET /v2/dev');
{
  /* The campaign's page asks this before any room (src/share/rooms.js
   * devAccount), and lifts the win first lock only on true. */
  const realFetch = globalThis.fetch;
  const asked = [];
  const answer = (res) => {
    globalThis.fetch = async (url, init) => {
      asked.push({ url: String(url), authorization: init?.headers?.authorization ?? null });
      return typeof res === 'function' ? res() : res.clone();
    };
  };
  const env = (over = {}) => ({ ACCOUNTS_ORIGIN: 'http://accounts.test', DEV_ACCOUNTS: `${OWNER}`, ...over });
  let n = 0;
  const ask = async (e, { session = 'c'.repeat(64), path = '/v2/dev', headers = {} } = {}) => {
    n += 1;
    const res = await front.fetch(new Request(`https://rooms.test${path}`, {
      headers: { 'cf-connecting-ip': `10.7.0.${n}`, ...(session ? { authorization: `Bearer ${session}` } : {}), ...headers },
    }), e);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const ok = (id) => new Response(JSON.stringify({ id, callsign: 'Pilot' }), { status: 200 });

  answer(ok(OWNER));
  asked.length = 0;
  const owner = await ask(env());
  check('the owner\'s session: dev true', owner.status === 200 && owner.body.dev === true, JSON.stringify(owner));
  check('asked of the accounts server with that session, and nothing else', asked.length === 1
    && asked[0].url === 'http://accounts.test/api/account' && asked[0].authorization === `Bearer ${'c'.repeat(64)}`, JSON.stringify(asked));

  answer(ok(OTHER));
  const other = await ask(env());
  check('another signed in pilot: dev false', other.status === 200 && other.body.dev === false, JSON.stringify(other));
  const named = await ask(env(), { path: `/v2/dev?account=${OWNER}&id=${OWNER}`, headers: { 'x-account': `${OWNER}` } });
  check('naming the owner\'s id in the query or a header changes nothing', named.status === 200 && named.body.dev === false, JSON.stringify(named));

  answer(new Response('{}', { status: 401 }));
  const ended = await ask(env());
  check('a session the accounts server does not know: dev false', ended.status === 200 && ended.body.dev === false, JSON.stringify(ended));

  answer(ok(OWNER));
  asked.length = 0;
  const bare = await ask(env(), { session: null });
  const made = await ask(env(), { session: 'not-a-session' });
  check('no session, or one of the wrong shape: dev false, nothing asked', bare.body?.dev === false && made.body?.dev === false && asked.length === 0,
    JSON.stringify({ bare, made, asked }));
  const noOrigin = await ask(env({ ACCOUNTS_ORIGIN: '' }));
  const noList = await ask(env({ DEV_ACCOUNTS: '' }));
  check('no accounts server, or no list: dev false for the owner too, nothing asked', noOrigin.body?.dev === false && noList.body?.dev === false && asked.length === 0,
    JSON.stringify({ noOrigin, noList, asked }));

  answer(() => {
    throw new Error('down');
  });
  const errors = console.error;
  console.error = () => {};
  const down = await ask(env());
  console.error = errors;
  check('the accounts server down: 503, never a guess', down.status === 503 && down.body?.dev === undefined, JSON.stringify(down));
  globalThis.fetch = realFetch;

  const pre = await front.fetch(new Request('https://rooms.test/v2/dev', {
    method: 'OPTIONS', headers: { origin: 'https://paraguayandronecombatsimulator.com', 'access-control-request-headers': 'authorization' },
  }), env());
  check('the game\'s page may send its session there (CORS allows authorization)',
    /authorization/.test(pre.headers.get('access-control-allow-headers') || ''), pre.headers.get('access-control-allow-headers'));
}

console.log('create');
{
  const env = (list) => ({
    PUBLIC_ROOMS: 'on',
    DEV_ACCOUNTS: list,
    HEALTH: { refuse() {} },
    ROOMS: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response('{}', { status: 200 }) }) },
  });
  const make = (body, list, n) => front.fetch(new Request('https://rooms.test/v2/create', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `10.5.0.${n}` }, body: JSON.stringify(body),
  }), env(list));
  const priv = await make({ map: 'itaipu', mode: 'war', mission: 'itaipu-2' }, `${OWNER}`, 1);
  check('a private war room may name mission 2 once the server has a list', priv.status === 200, `${priv.status}`);
  const noList = await make({ map: 'itaipu', mode: 'war', mission: 'itaipu-2' }, '', 2);
  check('without a list it is refused as before', noList.status === 403 && (await noList.json()).error === 'unreleased');
  const pub = await make({
    map: 'itaipu', mode: 'war', mission: 'itaipu-2', public: true,
  }, `${OWNER}`, 3);
  check('a public one is refused', pub.status === 403);
  const soon = await make({ map: 'itaipu', mode: 'war', mission: 'itaipu-5' }, `${OWNER}`, 4);
  check('one naming a mission only planned is refused', soon.status === 400 || soon.status === 403, `${soon.status}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
