/*
 * voicechat-selftest.js: voice chat's signalling and its TURN credentials,
 * in plain Node. Run with npm run voicechat:selftest.
 *
 * The room's relay (edge/rooms/voice.js) driven through RoomCore with fake
 * sockets, as rooms-selftest.js drives the rest: an on to everybody and to
 * one seat, an offer, answer and candidate to their seat alone with only
 * the checked fields passed on, everything malformed dropped, nothing past
 * a mute either way but an off, and the allowance of its own that leaves
 * chat and the clock alone. Then the credentials (edge/rooms/turn.js)
 * against a vector computed by openssl, not by this code, and the real
 * server (edge/rooms/node.js) over real sockets, with and without a TURN
 * secret. Then the client's pure parts (src/share/voice.js): the Opus line,
 * distance voice, and its pace against the room's allowance. And what is
 * kept for replays (the owner, 2026-10-02): only the voices heard, through
 * the crash cam's recorder, never this pilot's own microphone, and live
 * voice never in the game's audio graph.
 *
 * The audio itself, two browsers talking, is scripts/voicechat-two-page.js.
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

import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import {
  PROTO, RELAY_NONE, RELAY_UDP, VOICE_PER_S, VOICE_SDP_MAX,
} from '../src/share/roomwire.js';
import {
  CLOCK_PER_S, PRIVATE_CAP, RoomCore, TEXT_CLOSE_PER_S, TEXT_PER_S,
} from '../edge/rooms/core.js';
import { TTL_S, turnCredential, turnMinter } from '../edge/rooms/turn.js';
import STR_EN from '../src/strings/en.js';
import STR_ES from '../src/strings/es.js';
import {
  DISTANCE, OPUS_BPS, PTT_KEY, SEND_PER_S, distanceGain, tuneOpus,
} from '../src/share/voice.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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

const profile = { airframe: 'cub1400', map: 'swiss2', livery: null, parts: null, figure: 0 };
let tokens = 0;
const newToken = () => {
  tokens += 1;
  return tokens.toString(16).padStart(32, '0');
};
let now = 2_000_000;

function sock(name, address) {
  return { name, address, got: [], closed: null, attachment: null };
}
function run(actions) {
  for (const a of actions) {
    if (a.send) {
      a.send.got.push(typeof a.data === 'string' ? JSON.parse(a.data) : a.data);
    } else if (a.close) {
      a.close.closed = { code: a.code, reason: a.reason };
    } else if (a.attach) {
      a.attach.attachment = a.value;
    }
  }
  return actions;
}
function makeRoom(turn = null) {
  return new RoomCore({ code: 'K7PZ2M', cap: PRIVATE_CAP, friendly: false, map: 'swiss2', epoch: now - 5000 }, { turn });
}
function seat(room, s) {
  run(room.open(s, now));
  run(room.message(s, JSON.stringify({ type: 'hello', proto: PROTO, build: 'test', name: [1, 2, 42], profile }), now, s.address, newToken));
}
function say(room, s, msg) {
  return run(room.message(s, JSON.stringify(msg), now, s.address, newToken));
}
const voiceGot = (s) => s.got.filter((m) => m && m.type === 'voice');
function clear(...socks) {
  for (const s of socks) {
    s.got.length = 0;
  }
}

console.log('relay');
let room = makeRoom();
const a = sock('a', '10.0.0.1');
const b = sock('b', '10.0.0.2');
const c = sock('c', '10.0.0.3');
const early = sock('early', '10.0.0.4');
run(room.open(early, now));
say(room, early, { type: 'voice', op: 'on' });
check('a socket not yet seated is passed nothing', early.got.length === 0);
seat(room, a);
seat(room, b);
seat(room, c);
clear(a, b, c);

say(room, a, { type: 'voice', op: 'on' });
check('an on goes to everybody else, from its seat', voiceGot(b).length === 1 && voiceGot(c).length === 1
  && voiceGot(b)[0].op === 'on' && voiceGot(b)[0].from === 1 && !('to' in voiceGot(b)[0]));
check('and not back to its sender', voiceGot(a).length === 0);
clear(a, b, c);
say(room, b, { type: 'voice', op: 'on', to: 1 });
check('an on to one seat goes to that seat alone', voiceGot(a).length === 1 && voiceGot(c).length === 0 && voiceGot(a)[0].from === 2);
clear(a, b, c);

const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
say(room, a, { type: 'voice', op: 'offer', to: 2, n: 77, sdp, relay: RELAY_UDP, secret: 'x', from: 9 });
const offer = voiceGot(b)[0];
check('an offer goes to its seat alone', voiceGot(b).length === 1 && voiceGot(c).length === 0 && voiceGot(a).length === 0);
check('with the sender\'s seat, never the one it wrote', offer && offer.from === 1);
check('and only the checked fields', offer && JSON.stringify(Object.keys(offer).sort()) === JSON.stringify(['from', 'n', 'op', 'relay', 'sdp', 'type'])
  && offer.n === 77 && offer.sdp === sdp && offer.relay === RELAY_UDP, JSON.stringify(offer));
clear(a, b, c);
say(room, a, { type: 'voice', op: 'offer', to: 2, n: 78, sdp, relay: 'everything' });
check('a relay that is not one of the three is none', voiceGot(b)[0] && voiceGot(b)[0].relay === RELAY_NONE);
clear(a, b, c);
say(room, b, { type: 'voice', op: 'answer', to: 1, n: 77, sdp, relay: true });
const ans = voiceGot(a)[0];
check('an answer goes back, without a relay flag', ans && ans.op === 'answer' && ans.from === 2 && ans.n === 77 && !('relay' in ans));
clear(a, b, c);
const cand = { candidate: 'candidate:1 1 udp 2122260223 192.168.1.2 54321 typ host', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'zz' };
say(room, a, { type: 'voice', op: 'ice', to: 2, n: 77, c: cand });
const ice = voiceGot(b)[0];
check('a candidate goes to its seat, its three fields and no others', ice && ice.op === 'ice'
  && JSON.stringify(ice.c) === JSON.stringify({ candidate: cand.candidate, sdpMid: '0', sdpMLineIndex: 0 }), JSON.stringify(ice));
clear(a, b, c);

/* A second on, so each case below gets the whole allowance. */
now += 1000;
const bad = [
  ['an offer to a seat nobody holds', { type: 'voice', op: 'offer', to: 5, n: 1, sdp }],
  ['an offer to nobody', { type: 'voice', op: 'offer', n: 1, sdp }],
  ['an offer with no link number', { type: 'voice', op: 'offer', to: 2, sdp }],
  ['a link number past the range', { type: 'voice', op: 'offer', to: 2, n: 2 ** 31, sdp }],
  ['an SDP over the cap', { type: 'voice', op: 'offer', to: 2, n: 1, sdp: 'x'.repeat(VOICE_SDP_MAX + 1) }],
  ['an SDP that is not text', { type: 'voice', op: 'answer', to: 2, n: 1, sdp: { evil: true } }],
  ['a candidate that is not text', { type: 'voice', op: 'ice', to: 2, n: 1, c: { candidate: 5 } }],
];
say(room, a, { type: 'voice', op: 'record', to: 2 });
check('an unknown op is dropped', voiceGot(b).length === 0);
for (const [name, msg] of bad) {
  clear(b, c);
  say(room, a, msg);
  check(`dropped: ${name}`, voiceGot(b).length === 0 && voiceGot(c).length === 0);
  /* A second on each time, so the allowance is never why. */
  now += 1000;
}
say(room, a, { type: 'voice', op: 'offer', to: 2, n: 1, sdp });
check('while the same offer, well formed, is passed', voiceGot(b).length === 1);
clear(a, b, c);

console.log('mute');
now += 1000;
/* B mutes A (edge/rooms/safety.js keeps it as A's token on B's seat). */
say(room, b, { type: 'mute', seats: [1] });
clear(a, b, c);
say(room, a, { type: 'voice', op: 'on' });
check('an on skips a pilot who muted its sender', voiceGot(b).length === 0 && voiceGot(c).length === 1);
say(room, a, { type: 'voice', op: 'offer', to: 2, n: 3, sdp });
check('an offer to a pilot who muted its sender is not passed', voiceGot(b).length === 0);
say(room, b, { type: 'voice', op: 'offer', to: 1, n: 4, sdp });
check('nor one from the pilot who muted, the other way', voiceGot(a).length === 0);
say(room, b, { type: 'voice', op: 'off', to: 1 });
check('but an off is, which only ends a link', voiceGot(a).length === 1 && voiceGot(a)[0].op === 'off' && voiceGot(a)[0].from === 2);
now += 1000;
say(room, b, { type: 'mute', seats: [] });
clear(a, b, c);
say(room, a, { type: 'voice', op: 'offer', to: 2, n: 5, sdp });
check('unmuted, the offer is passed again', voiceGot(b).length === 1);
/* A report mutes: roomsafety.js sends the mute with it. */
now += 1000;
say(room, c, { type: 'report', seat: 1, reason: 0 });
say(room, c, { type: 'mute', seats: [1] });
clear(a, b, c);
say(room, a, { type: 'voice', op: 'offer', to: 3, n: 6, sdp });
check('a pilot who reported and muted the sender is passed nothing', voiceGot(c).length === 0);

console.log('the allowance');
room = makeRoom();
const p = sock('p', '10.0.1.1');
const q = sock('q', '10.0.1.2');
now += 5000;
seat(room, p);
seat(room, q);
now += 1000;
clear(p, q);
for (let i = 0; i < VOICE_PER_S + 4; i += 1) {
  say(room, p, { type: 'voice', op: 'on', to: 2 });
}
check(`voice over ${VOICE_PER_S} a second is dropped`, voiceGot(q).length === VOICE_PER_S, `${voiceGot(q).length}`);
say(room, p, { type: 't', c: 1 });
check('and the clock is still answered in that second', p.got.some((m) => m.type === 't'));
say(room, p, { type: 'event', kind: 'chat', id: 0 });
check('and quick chat still passed on', q.got.some((m) => m.type === 'event' && m.kind === 'chat'));
check(`the most a seat may send, every allowance full, stays under the close at ${TEXT_CLOSE_PER_S}`, TEXT_PER_S + CLOCK_PER_S + VOICE_PER_S < TEXT_CLOSE_PER_S);
check('so nothing here closed the socket', p.closed === null);
check(`the client paces itself at half the room's allowance or less (${SEND_PER_S} of ${VOICE_PER_S})`, SEND_PER_S * 2 <= VOICE_PER_S);
now += 1000;
clear(p, q);
say(room, p, { type: 'voice', op: 'turn' });
const noTurn = voiceGot(p)[0];
check('with no TURN server, turn answers an empty list, to the sender alone', noTurn && Array.isArray(noTurn.ice) && noTurn.ice.length === 0
  && noTurn.ttl === 0 && voiceGot(q).length === 0);

console.log('credentials');
const VECTOR = { secret: 'voicechat-selftest-secret', username: '1790000000:0a1b2c3d4e5f', credential: 'el55XNAWlPv+pKcLA0zftZOZZTU=' };
check('the credential is base64 HMAC-SHA1 of the username, as openssl computes it',
  turnCredential(VECTOR.secret, VECTOR.username) === VECTOR.credential, turnCredential(VECTOR.secret, VECTOR.username));
check('no secret, no minter', turnMinter('', 'turn:1.2.3.4:3478') === null);
check('no address, no minter', turnMinter('s', ' , ') === null);
let threw = false;
try {
  turnMinter('s', 'http://1.2.3.4');
} catch (e) {
  threw = true;
}
check('an address that is not turn: or turns: stops the server starting', threw);
const urls = 'turn:129.151.39.48:3478?transport=udp, turn:129.151.39.48:3478?transport=tcp,turns:129.151.39.48:5349?transport=tcp';
const mint = turnMinter(VECTOR.secret, urls);
const minted = mint(1_790_000_000_000);
const [user, cred] = [minted.ice[0].username, minted.ice[0].credential];
check(`a credential expires ${TTL_S} s after it is made`, Number(user.split(':')[0]) === 1_790_000_000 + TTL_S && minted.ttl === TTL_S, user);
check('its username names nobody: a random part after the expiry', /^\d+:[0-9a-f]{12}$/.test(user), user);
check('and checks out', cred === turnCredential(VECTOR.secret, user));
check('every address, trimmed', JSON.stringify(minted.ice[0].urls) === JSON.stringify(urls.split(',').map((u) => u.trim())));
check('two credentials differ', mint(1_790_000_000_000).ice[0].username !== user);
room = makeRoom(mint);
const r = sock('r', '10.0.2.1');
seat(room, r);
now += 1000;
say(room, r, { type: 'voice', op: 'turn' });
const got = voiceGot(r)[0];
check('a room with a minter hands one to the pilot who asks', got && got.ice.length === 1 && got.ice[0].urls.length === 3
  && got.ice[0].credential === turnCredential(VECTOR.secret, got.ice[0].username) && got.ttl === TTL_S);

console.log('the server, over real sockets');
async function server(turnSecret, turnUrls) {
  const { startRooms } = await import('../edge/rooms/node.js');
  const dir = mkdtempSync(join(tmpdir(), 'voicechat-selftest-'));
  const s = await startRooms({ db: join(dir, 'rooms.db'), port: 0, turnSecret, turnUrls });
  return { ...s, dir, origin: `http://127.0.0.1:${s.port}` };
}
function pilot(origin, code) {
  const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/v2/room/${code}`, { headers: { origin: 'http://127.0.0.1' } });
  const got = [];
  ws.on('message', (d, binary) => {
    if (!binary && d.toString() !== 'pong') {
      got.push(JSON.parse(d.toString()));
    }
  });
  const opened = new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  return { ws, got, opened };
}
async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) {
      return true;
    }
    await new Promise((res) => setTimeout(res, 20));
  }
  return false;
}
for (const withTurn of [true, false]) {
  const srv = await server(withTurn ? VECTOR.secret : '', withTurn ? urls : '');
  try {
    const res = await fetch(`${srv.origin}/v2/create`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1' }, body: JSON.stringify({ map: 'swiss2' }),
    });
    const { code } = await res.json();
    const one = pilot(srv.origin, code);
    const two = pilot(srv.origin, code);
    await Promise.all([one.opened, two.opened]);
    for (const x of [one, two]) {
      x.ws.send(JSON.stringify({ type: 'hello', proto: PROTO, build: 'test', name: [1, 2, 42], profile }));
    }
    await waitFor(() => [one, two].every((x) => x.got.some((m) => m.type === 'welcome')));
    const seatOf = (x) => x.got.find((m) => m.type === 'welcome').seat;
    one.ws.send(JSON.stringify({ type: 'voice', op: 'turn' }));
    await waitFor(() => one.got.some((m) => m.type === 'voice' && m.op === 'turn'));
    const t = one.got.find((m) => m.type === 'voice' && m.op === 'turn');
    if (withTurn) {
      check('node.js with TURN_SECRET and TURN_URLS hands out working credentials', t && t.ice.length === 1
        && t.ice[0].credential === turnCredential(VECTOR.secret, t.ice[0].username));
    } else {
      check('node.js without them answers an empty list: STUN alone', t && t.ice.length === 0);
    }
    one.ws.send(JSON.stringify({ type: 'voice', op: 'offer', to: seatOf(two), n: 9, sdp }));
    const passedOn = await waitFor(() => two.got.some((m) => m.type === 'voice' && m.op === 'offer' && m.from === seatOf(one) && m.n === 9));
    check(`an offer crosses the real server${withTurn ? '' : ' without TURN too'}`, passedOn);
    one.ws.close(1000);
    two.ws.close(1000);
  } finally {
    await srv.stop();
    rmSync(srv.dir, { recursive: true, force: true });
  }
}

console.log('the client');
const chromeSdp = [
  'v=0', 'o=- 4611 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9 0 8 13 110 126', 'c=IN IP4 0.0.0.0',
  'a=rtpmap:111 opus/48000/2', 'a=rtcp-fb:111 transport-cc', 'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2', 'a=fmtp:63 111/111', 'a=rtpmap:9 G722/8000', '',
].join('\r\n');
const tuned = tuneOpus(chromeSdp);
const fmtp = /a=fmtp:111 ([^\r\n]*)/.exec(tuned)[1].split(';');
check(`Opus is asked for mono at ${OPUS_BPS} b/s, with DTX and FEC`, ['usedtx=1', 'useinbandfec=1', 'stereo=0', `maxaveragebitrate=${OPUS_BPS}`].every((x) => fmtp.includes(x)), fmtp.join(';'));
check('and the Opus line is still one line, the others untouched', (tuned.match(/a=fmtp:111 /g) || []).length === 1 && tuned.includes('a=fmtp:63 111/111'));
const bare = chromeSdp.replace('a=fmtp:111 minptime=10;useinbandfec=1\r\n', '');
check('an SDP with no Opus fmtp gets one', /a=rtpmap:111 opus\/48000\/2\r\na=fmtp:111 [^\r\n]*usedtx=1/.test(tuneOpus(bare)));
check('an SDP with no Opus is left as it is', tuneOpus('v=0\r\nm=audio 9 RTP 0\r\n') === 'v=0\r\nm=audio 9 RTP 0\r\n');
check('distance voice: full within the near band', distanceGain(0) === 1 && distanceGain(DISTANCE.NEAR_M) === 1 && distanceGain(null) === 1);
check('quieter further out, never under the floor', distanceGain(100) < 1 && distanceGain(100) > distanceGain(200)
  && distanceGain(DISTANCE.FAR_M) === DISTANCE.FLOOR && distanceGain(1e6) === DISTANCE.FLOOR && DISTANCE.FLOOR > 0);
/* Read from the source: crashcam.js pulls Three.js, which Node has not. */
const REPLAY_KEY = /export const REPLAY_KEY = '([A-Za-z]+)'/.exec(readFileSync(join(root, 'src/replay/crashcam.js'), 'utf8'))[1];
check(`push to talk is not the replay's key (${REPLAY_KEY})`, PTT_KEY !== REPLAY_KEY);

console.log('what is kept');
/* Live voice plays in a context of its own, never the game's graph; what
 * a replay keeps goes through the crash cam's recorder alone (setRecorder,
 * src/replay/voicerec.js), and the replay plays it from the clip. */
const voiceSrc = readFileSync(join(root, 'src/share/voice.js'), 'utf8');
const uiSrc = readFileSync(join(root, 'src/ui/voiceui.js'), 'utf8');
const imports = (src) => [...src.matchAll(/^import [^;]* from '([^']+)';/gm)].map((m) => m[1]);
check('voice.js makes an AudioContext of its own', /new AudioContext\(\)/.test(voiceSrc));
check('and neither voice module imports anything of the game\'s sound', [...imports(voiceSrc), ...imports(uiSrc)].every((i) => !/audio|music|sound|replay|export/.test(i)),
  [...imports(voiceSrc), ...imports(uiSrc)].join(' '));
const importers = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full);
    } else if (e.name.endsWith('.js') && /share\/voice\.js'/.test(readFileSync(full, 'utf8'))) {
      importers.push(relative(root, full));
    }
  }
}
walk(join(root, 'src'));
check('only main.js and the voice screen use the voice module', importers.sort().join(',') === 'src/main.js,src/ui/voiceui.js', importers.join(','));
/* The one MediaRecorder records a link's received stream, in record(),
 * which only the link's ontrack calls; a piece is kept only when that
 * pilot spoke and is not muted here. */
const recorders = [...voiceSrc.matchAll(/new MediaRecorder\(([a-zA-Z]+)/g)].map((m) => m[1]);
check('only a received stream is recorded, never the microphone', recorders.length === 1 && recorders[0] === 'stream'
  && [...voiceSrc.matchAll(/\brecord\(/g)].length === 2 && /record\(l, stream\);\n    \};/.test(voiceSrc), recorders.join(','));
check('a piece is kept only when its pilot spoke and is not muted here', /if \(l\.rec && volumeOf\(seat\) > 0\) \{\n\s*l\.rec\.spoke = true;/.test(voiceSrc)
  && /if \(!rec\.spoke \|\|/.test(voiceSrc));
/* Listening only until the notice: the links need no microphone. */
check('a pilot without a microphone still links, to listen', !/!on \|\| !mic/.test(voiceSrc) && /direction: 'recvonly'/.test(voiceSrc));
check('the voice row and the privacy page say voices are kept, in English and Spanish',
  /kept|keep/.test(STR_EN['voicechat.voice_note']) && /guardan/.test(STR_ES['voicechat.voice_note'])
  && !/nothing is recorded/.test(STR_EN['voicechat.voice_note'])
  && /Voices are kept in replays/.test(readFileSync(join(root, 'privacy.html'), 'utf8'))
  && !/never include voice/.test(readFileSync(join(root, 'privacy.html'), 'utf8')));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
