/*
 * combat-restart-check.js: a combat round over real sockets on the VM's
 * server (edge/rooms/node.js), and a restart in the middle of it. Two
 * pilots in a private room; the host starts a round; the server stops and
 * starts again on the same SQLite file; both pilots reconnect with their
 * tokens and must be told the same round, from the room's storage
 * ({ store: 'combat' }, restored by edge/rooms/host.js). One game at a
 * time is rooms:selftest's, where a race can be made ready to start.
 * npm run combat:restart.
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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { PROTO } from '../src/share/roomwire.js';

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-combat-'));
const { startRooms } = await import('../edge/rooms/node.js');
let server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const port = server.port;
const origin = () => `http://127.0.0.1:${server.port}`;

function pilot(path) {
  const ws = new WebSocket(`${origin().replace(/^http/, 'ws')}/v2/${path}`, { headers: { origin: 'https://fdflabs.github.io' } });
  const p = { ws, got: [], closed: null };
  ws.on('message', (data, binary) => {
    if (!binary && data.toString() !== 'pong') {
      p.got.push(JSON.parse(data.toString()));
    }
  });
  ws.on('close', (code) => {
    p.closed = code;
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
  p.say = (msg) => ws.send(JSON.stringify(msg));
  p.last = (type) => p.got.filter((m) => m.type === type).pop();
  return p;
}
async function seat(code, n, airframe, extra = {}) {
  const p = pilot(`room/${code}`);
  await p.open;
  p.say({
    type: 'hello', proto: PROTO, build: 'check', name: [n, n, 10 + n],
    profile: { airframe, map: 'swiss2', figure: 0, livery: null, parts: null }, ...extra,
  });
  p.welcome = await p.until((x) => x.last('welcome'));
  return p;
}

console.log(`a combat round on edge/rooms/node.js at ${origin()}`);
const res = await fetch(`${origin()}/v2/create`, {
  method: 'POST', headers: { origin: 'https://fdflabs.github.io' }, body: JSON.stringify({ map: 'swiss2' }),
});
const { code } = await res.json();
const a = await seat(code, 1, 'interceptor');
const b = await seat(code, 2, 'cub1400');
check('two pilots in a private room', a.welcome && b.welcome && a.welcome.seat === 1 && b.welcome.seat === 2, code);
a.say({ type: 'combat', op: 'start', minutes: 5 });
const before = await b.until((x) => x.last('combat'));
check('the host starts a round and the other pilot is told', before && before.state === 'countdown' && before.round === 1);

const tokens = { a: a.welcome.token, b: b.welcome.token };
await server.stop();
await a.until((x) => x.closed != null);
await b.until((x) => x.closed != null);
server = await startRooms({ db: join(scratch, 'rooms.db'), port });
const b2 = await seat(code, 2, 'cub1400', { token: tokens.b, seat: 2 });
const a2 = await seat(code, 1, 'interceptor', { token: tokens.a, seat: 1 });
const after = await b2.until((x) => x.last('combat'));
check('after a restart the round is still there, from the room\'s storage', after && after.round === before.round && after.state === before.state
  && after.startsAt === before.startsAt && after.endsAt === before.endsAt, JSON.stringify(after && { round: after.round, state: after.state }));
check('with both pilots in its scores', after && after.scores.length === 2);
/* A room that restarted gives the host to whoever came back first
 * (core.js host(): the oldest join, and a token the room forgot joins
 * anew), so the host is asked, not assumed. */
const host = a2.welcome.host === a2.welcome.seat ? a2 : b2;
host.say({ type: 'combat', op: 'stop' });
const stopped = await b2.until((x) => (x.last('combat') && x.last('combat').state === 'idle' ? x.last('combat') : null));
check('the host stops it, and everyone is told', Boolean(stopped));
await server.stop();
rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
