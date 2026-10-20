/*
 * rooms-account-check.js: a signed in pilot's callsign in a room, end to
 * end on this machine, with no Google.
 *
 *   node scripts/rooms-account-check.js
 *
 * Starts the tracks server with sign-in on (tracks-api/node.js, Google
 * stood in for by a key made here and served as a JWKS), and the rooms
 * server (edge/rooms/node.js) with ACCOUNTS_ORIGIN pointing at it, as the
 * VM runs them. Then: a signed in pilot's hello carries its session and
 * every other pilot is told its callsign; nobody plays without an account
 * (the owner, 2026-10-03), so a build from before the sign in is sent to
 * reload, and a hello with no session, one that names a callsign of its
 * own, a made up session, an ended one and an account with no callsign yet
 * are all refused with CLOSE_SIGNIN, in a free room and in a war, combat
 * and tag room alike; a socket that speaks before its hello is closed;
 * and with the accounts server gone a signed in pilot is refused with
 * CLOSE_ACCOUNTS, quickly, rather than seated unchecked.
 *
 * Blocks that outlast a room (COMPLETENESS 60): a block set on the
 * account keeps the blocked pilot's chat and voice from the blocker in
 * every room after, whoever joins first and from whichever computer, and
 * a renamed pilot stays blocked; an unblock ends it at the next join. The
 * room browser and the quick join leave out a room holding a pilot the
 * asker blocked, for the asker alone. The negative controls: a mute set in a room, by a signed in pilot or by a
 * guest on a rooms server with no accounts, dies with that room.
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

import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import {
  ACCOUNT_JOIN, CLOSE, CLOSE_ACCOUNTS, CLOSE_SIGNIN, PROTO, WAR_JOIN,
} from '../src/share/roomwire.js';
import { startTracks } from '../tracks-api/node.js';
import { startRooms } from '../edge/rooms/node.js';

const CLIENT_ID = 'rooms-check.apps.googleusercontent.com';
const RS256 = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const PAGE = 'https://fdflabs.github.io';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const google = await crypto.subtle.generateKey(RS256, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', google.publicKey);
const jwks = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ keys: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', n: jwk.n, e: jwk.e }] }));
});
await new Promise((resolve) => jwks.listen(0, '127.0.0.1', resolve));

async function idToken(sub) {
  const b64 = (x) => Buffer.from(x).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, iat: now, exp: now + 600 }));
  const sig = new Uint8Array(await crypto.subtle.sign(RS256, google.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64(sig)}`;
}

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-rooms-account-'));
let tracks = await startTracks({
  db: join(scratch, 'tracks.db'), port: 0, googleClientId: CLIENT_ID, accountsSecret: 'rooms-check-secret',
  googleJwksUrl: `http://127.0.0.1:${jwks.address().port}/certs`,
});
const tracksOrigin = `http://127.0.0.1:${tracks.port}`;
const rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: 0, accountsOrigin: tracksOrigin });
const roomsOrigin = `http://127.0.0.1:${rooms.port}`;

async function api(method, path, body, session) {
  const res = await fetch(`${tracksOrigin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function pilot(code) {
  const ws = new WebSocket(`${roomsOrigin.replace(/^http/, 'ws')}/v2/room/${code}`, { headers: { origin: PAGE } });
  const p = { ws, got: [], closed: null };
  ws.on('message', (data, binary) => {
    if (!binary && data.toString() !== 'pong') {
      p.got.push(JSON.parse(data.toString()));
    }
  });
  ws.on('close', (c) => {
    p.closed = c;
  });
  ws.on('error', () => {});
  p.open = new Promise((resolve) => {
    ws.on('open', resolve);
    ws.on('close', resolve);
  });
  p.until = async (what, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = what(p);
      if (hit) {
        return hit;
      }
      await sleep(20);
    }
    return null;
  };
  return p;
}

const profile = { airframe: 'cub1400', map: 'swiss2', figure: 3 };
async function seat(code, extra = {}) {
  const p = pilot(code);
  await p.open;
  p.ws.send(JSON.stringify({ type: 'hello', proto: PROTO, build: 'check', name: [1, 2, 42], profile, ...extra }));
  /* A clock ping straight behind the hello, as the simulator sends: it
   * must be answered after the welcome, not lost while the session is
   * looked up. */
  p.ws.send(JSON.stringify({ type: 't', c: 1 }));
  p.welcome = await p.until((x) => x.got.find((m) => m.type === 'welcome') || (x.closed && { closed: x.closed }));
  return p;
}

/* address: the client address Caddy would send, for a check that makes
 * more rooms than front.js CREATES_PER_MIN allows one address. */
async function makeRoom(room = { map: 'swiss2' }, address = null, origin = roomsOrigin) {
  const headers = { origin: PAGE, ...(address ? { 'cf-connecting-ip': address } : {}) };
  const res = await fetch(`${origin}/v2/create`, { method: 'POST', headers, body: JSON.stringify(room) });
  return (await res.json()).code;
}

const SIGNIN = CLOSE_SIGNIN;
const NEW = { account: ACCOUNT_JOIN };
const closedWith = (p, code) => Boolean(p.welcome && p.welcome.closed === code);

console.log('signed in pilots');
let r = await api('POST', '/api/account/google', { credential: await idToken('pilot-1') });
const session = r.body.session;
r = await api('PUT', '/api/account/callsign', { callsign: 'Maverick' }, session);
check('has claimed a callsign on the accounts server', r.status === 200 && r.body.callsign === 'Maverick');
r = await api('POST', '/api/account/google', { credential: await idToken('pilot-2') });
const other = r.body.session;
await api('PUT', '/api/account/callsign', { callsign: 'Iceman' }, other);

const code = await makeRoom();
const first = await seat(code, { ...NEW, session: other });
check('a signed in pilot is seated', first.welcome.seat === 1 && !first.welcome.closed, JSON.stringify(first.welcome));
const signed = await seat(code, { ...NEW, name: [3, 4, 77], session });
check('and a second', signed.welcome.seat === 2, JSON.stringify(signed.welcome));
const told = await first.until((x) => x.got.find((m) => m.type === 'join' && m.seat === 2));
check('the others are told its callsign', told && told.callsign === 'Maverick', JSON.stringify(told));
check('beside the picker name a build from before shows', told && JSON.stringify(told.name) === '[3,4,77]');
check('the pilot already there is listed with its callsign', signed.welcome.peers.length === 1 && signed.welcome.peers[0].callsign === 'Iceman',
  JSON.stringify(signed.welcome.peers));
check('the clock ping sent behind the hello is answered after the welcome',
  Boolean(await signed.until((x) => x.got.findIndex((m) => m.type === 't') > x.got.findIndex((m) => m.type === 'welcome'))));

console.log('nobody plays without an account');
const old = await seat(code);
check('a build from before the sign in (no account in its hello) is sent to reload', closedWith(old, CLOSE.update), JSON.stringify(old.welcome));
const guest = await seat(code, { ...NEW, name: [1, 2, 42] });
check('a hello with no session is refused, to sign in', closedWith(guest, SIGNIN), JSON.stringify(guest.welcome));
const forged = await seat(code, { ...NEW, name: [7, 8, 15], callsign: 'Maverick' });
check('so is a hello that names a callsign itself', closedWith(forged, SIGNIN), JSON.stringify(forged.welcome));
const madeUp = await seat(code, { ...NEW, name: [9, 10, 16], session: 'a'.repeat(64) });
check('and a made up session', closedWith(madeUp, SIGNIN), JSON.stringify(madeUp.welcome));
r = await api('POST', '/api/account/google', { credential: await idToken('pilot-1') });
const second = r.body.session;
await api('DELETE', '/api/account/session', undefined, second);
const ended = await seat(code, { ...NEW, name: [11, 12, 17], session: second });
check('and a session that was signed out', closedWith(ended, SIGNIN), JSON.stringify(ended.welcome));
r = await api('POST', '/api/account/google', { credential: await idToken('pilot-3') });
const nameless = await seat(code, { ...NEW, name: [12, 13, 18], session: r.body.session });
check('and an account with no callsign yet', closedWith(nameless, SIGNIN), JSON.stringify(nameless.welcome));
const binary = pilot(code);
await binary.open;
binary.ws.send(new Uint8Array([0x10, 0, 0]));
binary.ws.send(JSON.stringify({ type: 'hello', proto: PROTO, build: 'check', name: [2, 3, 19], profile, ...NEW, session }));
const binaryEnd = await binary.until((x) => x.got.find((m) => m.type === 'welcome') || (x.closed && { closed: x.closed }));
check('a socket whose first word is not its hello is closed, so no hello rides past the check', binaryEnd && binaryEnd.closed === CLOSE.bad,
  JSON.stringify(binaryEnd));
const roster = await first.until((x) => x.got.filter((m) => m.type === 'join').length >= 1 && x);
check('none of them was ever seated beside the pilots', roster && roster.got.filter((m) => m.type === 'join').length === 1,
  JSON.stringify(roster && roster.got.filter((m) => m.type === 'join')));

console.log('a war room and a free flight room the same');
for (const room of [{ map: 'itaipu', mode: 'war' }, { map: 'swiss2', mode: null }]) {
  const at = await makeRoom(room);
  const war = room.mode === 'war' ? { war: WAR_JOIN } : {};
  const oldOne = await seat(at, war);
  const unsigned = await seat(at, { ...war, ...NEW, name: [4, 5, 21] });
  const pilotOne = await seat(at, { ...war, ...NEW, name: [5, 6, 22], session });
  const label = room.mode ?? 'free flight';
  check(`${label}: a build from before is sent to reload`, closedWith(oldOne, CLOSE.update), JSON.stringify(oldOne.welcome));
  check(`${label}: an unsigned seat is refused, to sign in`, closedWith(unsigned, SIGNIN), JSON.stringify(unsigned.welcome));
  check(`${label}: a signed in pilot is seated, as the room's game`, pilotOne.welcome.seat === 1 && pilotOne.welcome.mode === room.mode,
    JSON.stringify(pilotOne.welcome && { seat: pilotOne.welcome.seat, mode: pilotOne.welcome.mode, closed: pilotOne.welcome.closed }));
  pilotOne.ws.close(1000);
}

r = await api('PUT', '/api/account/callsign', { callsign: 'Goose' }, session);
const renamed = await seat(await makeRoom(), { ...NEW, session });
const room2 = renamed.welcome.code;
const watcher = await seat(room2, { ...NEW, name: [2, 2, 22], session: other });
check('a changed callsign is the one the next join shows', watcher.welcome.peers.some((p) => p.callsign === 'Goose'));

for (const p of [first, signed, renamed, watcher]) {
  p.ws.close(1000);
}

console.log('blocks that outlast a room');
{
  /* pilot-1 is Goose now, pilot-2 Iceman; Viper is the witness who hears
   * what the blocker must not. */
  r = await api('POST', '/api/account/google', { credential: await idToken('pilot-4') });
  const viper = r.body.session;
  await api('PUT', '/api/account/callsign', { callsign: 'Viper' }, viper);
  const chatFrom = (seatNo) => (x) => x.got.find((m) => m.type === 'event' && m.kind === 'chat' && m.seat === seatNo);
  const voiceFrom = (seatNo) => (x) => x.got.find((m) => m.type === 'voice' && m.op === 'on' && m.from === seatNo);
  /* Three pilots in a fresh room, in the order given; who says what: chat
   * and voice from `speaker`, then whether `listener` heard each, read
   * once the witness has heard both (the room sends to all in one turn). */
  let made = 0;
  const nextAddress = () => `198.51.100.${(made += 1)}`;
  async function meet(order) {
    const at = await makeRoom(undefined, nextAddress());
    const seated = {};
    for (const [n, [who, sess]] of order.entries()) {
      seated[who] = await seat(at, { ...NEW, name: [n + 1, n + 2, 50 + n], session: sess });
    }
    return seated;
  }
  async function hears(speaker, listener, witness) {
    const from = speaker.welcome.seat;
    speaker.ws.send(JSON.stringify({ type: 'event', kind: 'chat', id: 0 }));
    speaker.ws.send(JSON.stringify({ type: 'voice', op: 'on' }));
    const witnessed = Boolean(await witness.until(chatFrom(from))) && Boolean(await witness.until(voiceFrom(from)));
    await sleep(150);
    return { witnessed, chat: Boolean(chatFrom(from)(listener)), voice: Boolean(voiceFrom(from)(listener)) };
  }
  const leave = (seated) => Object.values(seated).forEach((p) => p.ws.close(1000));

  let room = await meet([['goose', session], ['iceman', other], ['viper', viper]]);
  room.goose.ws.send(JSON.stringify({ type: 'mute', seats: [room.iceman.welcome.seat] }));
  await sleep(100);
  let h = await hears(room.iceman, room.goose, room.viper);
  check('a mute in a room keeps the muted pilot\'s chat and voice from the muter', h.witnessed && !h.chat && !h.voice, JSON.stringify(h));
  leave(room);
  room = await meet([['goose', session], ['iceman', other], ['viper', viper]]);
  h = await hears(room.iceman, room.goose, room.viper);
  check('negative control: the mute died with the room, so the next room hears them', h.witnessed && h.chat && h.voice, JSON.stringify(h));
  leave(room);

  r = await api('PUT', '/api/account/blocks', { callsign: 'Iceman', on: true }, session);
  check('Goose blocks Iceman on the account', r.status === 200 && JSON.stringify(r.body.blocks) === '["Iceman"]', JSON.stringify(r.body));
  room = await meet([['goose', session], ['iceman', other], ['viper', viper]]);
  h = await hears(room.iceman, room.goose, room.viper);
  check('in the next room, the blocked pilot joining after, the blocker hears neither chat nor voice', h.witnessed && !h.chat && !h.voice,
    JSON.stringify(h));
  h = await hears(room.goose, room.iceman, room.viper);
  check('and voice is refused both ways, as a mute\'s is, while the blocker\'s chat still goes', h.witnessed && h.chat && !h.voice,
    JSON.stringify(h));
  leave(room);
  r = await api('POST', '/api/account/google', { credential: await idToken('pilot-1') });
  const laptop = r.body.session;
  room = await meet([['iceman', other], ['viper', viper], ['goose', laptop]]);
  h = await hears(room.iceman, room.goose, room.viper);
  check('from another computer, the blocker joining last, the same', h.witnessed && !h.chat && !h.voice, JSON.stringify(h));
  leave(room);
  await api('PUT', '/api/account/callsign', { callsign: 'Stinger' }, other);
  room = await meet([['goose', session], ['iceman', other], ['viper', viper]]);
  h = await hears(room.iceman, room.goose, room.viper);
  check('a renamed pilot is still blocked', h.witnessed && !h.chat && !h.voice, JSON.stringify(h));
  r = await api('PUT', '/api/account/blocks', { callsign: 'Stinger', on: false }, laptop);
  check('the block is taken back from the other computer', r.status === 200 && r.body.blocks.length === 0, JSON.stringify(r.body));
  leave(room);
  room = await meet([['goose', session], ['iceman', other], ['viper', viper]]);
  h = await hears(room.iceman, room.goose, room.viper);
  check('and the next join hears them again', h.witnessed && h.chat && h.voice, JSON.stringify(h));
  leave(room);
  await api('PUT', '/api/account/callsign', { callsign: 'Iceman' }, other);

  /* The room browser and the quick join, decided on the rooms server from
   * the session the page sends as authorization (edge/rooms/front.js
   * joinerOf): a public room holding Iceman is neither listed to Goose,
   * who blocked him, nor picked for Goose's quick join, and is for Viper. */
  r = await api('PUT', '/api/account/blocks', { callsign: 'Iceman', on: true }, session);
  const icemanRoom = await makeRoom({ map: 'swiss2', public: true }, nextAddress());
  const icemanIn = await seat(icemanRoom, { ...NEW, name: [6, 7, 61], session: other });
  const asking = (sess) => ({ origin: PAGE, 'cf-connecting-ip': nextAddress(), ...(sess ? { authorization: `Bearer ${sess}` } : {}) });
  const listFor = async (sess) => {
    const res = await fetch(`${roomsOrigin}/v2/rooms`, { headers: asking(sess) });
    return res.ok ? (await res.json()).rooms.map((x) => x.code) : [];
  };
  let viperList = [];
  for (let i = 0; i < 20 && !viperList.includes(icemanRoom); i += 1) {
    await sleep(100);
    viperList = await listFor(viper);
  }
  check('Viper\'s list, and a guest\'s, show the public room Iceman is in', viperList.includes(icemanRoom) && (await listFor(null)).includes(icemanRoom),
    JSON.stringify(viperList));
  check('Goose\'s, who blocked him, leaves it out', !(await listFor(session)).includes(icemanRoom));
  const pick = async (sess) => (await (await fetch(`${roomsOrigin}/v2/public/swiss2`, { headers: asking(sess) })).json()).code;
  const goosePick = await pick(session);
  check('Goose\'s quick join is handed another room', typeof goosePick === 'string' && goosePick !== icemanRoom, goosePick);
  check('Viper\'s is handed Iceman\'s', await pick(viper) === icemanRoom);
  r = await api('PUT', '/api/account/blocks', { callsign: 'Iceman', on: false }, session);
  check('unblocked, Goose\'s next list shows it again', r.status === 200 && (await listFor(session)).includes(icemanRoom));
  icemanIn.ws.close(1000);

  /* A guest's mute, where there are no accounts (do.js, a local server):
   * nothing outlives the room. */
  const guests = await startRooms({ db: join(scratch, 'guests.db'), port: 0 });
  const guestOrigin = `http://127.0.0.1:${guests.port}`;
  async function guestSeat(at, n) {
    const ws = new WebSocket(`${guestOrigin.replace(/^http/, 'ws')}/v2/room/${at}`, { headers: { origin: PAGE } });
    const p = { ws, got: [], closed: null };
    ws.on('message', (data, binary) => {
      if (!binary && data.toString() !== 'pong') {
        p.got.push(JSON.parse(data.toString()));
      }
    });
    ws.on('error', () => {});
    await new Promise((resolve) => ws.on('open', resolve));
    p.until = async (what, ms = 5000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const hit = what(p);
        if (hit) {
          return hit;
        }
        await sleep(20);
      }
      return null;
    };
    ws.send(JSON.stringify({ type: 'hello', proto: PROTO, build: 'check', name: [n, n + 1, 60 + n], profile, ...NEW }));
    p.welcome = await p.until((x) => x.got.find((m) => m.type === 'welcome'));
    return p;
  }
  async function guestMeet() {
    const at = await makeRoom(undefined, nextAddress(), guestOrigin);
    return { a: await guestSeat(at, 1), b: await guestSeat(at, 2), w: await guestSeat(at, 3) };
  }
  room = await guestMeet();
  check('guests are seated where there are no accounts', Boolean(room.a.welcome && room.b.welcome && room.w.welcome));
  room.a.ws.send(JSON.stringify({ type: 'mute', seats: [room.b.welcome.seat] }));
  await sleep(100);
  h = await hears(room.b, room.a, room.w);
  check('a guest\'s mute holds in its room', h.witnessed && !h.chat && !h.voice, JSON.stringify(h));
  leave(room);
  room = await guestMeet();
  h = await hears(room.b, room.a, room.w);
  check('negative control: and dies with it, a signed out pilot having no account to keep a block on', h.witnessed && h.chat && h.voice,
    JSON.stringify(h));
  leave(room);
  await sleep(100);
  await guests.stop();
}

console.log('the accounts server down');
await tracks.stop();
const code3 = await makeRoom();
const t0 = Date.now();
const down = await seat(code3, { ...NEW, name: [4, 4, 44], session });
const waited = Date.now() - t0;
check('a signed in pilot is refused with its own reason, to try again', closedWith(down, CLOSE_ACCOUNTS), JSON.stringify(down.welcome));
check('without waiting on it for long', waited < 3000, `${waited} ms`);

await sleep(100);
await rooms.stop();
jwks.close();
rmSync(scratch, { recursive: true, force: true });
tracks = null;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
