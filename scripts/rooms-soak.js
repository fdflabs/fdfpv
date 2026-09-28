/*
 * rooms-soak.js: real sockets against a running rooms Worker, `wrangler
 * dev` (local workerd) or the deployed one. By hand, per phase; the room's
 * logic has its own check in plain Node (npm run rooms:selftest), and this
 * is the check of the adapter around it: the Worker's routes and origin
 * check, the Durable Object's sockets, the hibernation API's automatic
 * ping answer, the tick, a reconnect with a token, the cap.
 *
 *   node scripts/rooms-soak.js [origin] [seconds] [clients]
 *   node scripts/rooms-soak.js http://127.0.0.1:8787 60 2
 *
 * Each client flies a circle at 30 Hz on its estimate of the room clock,
 * with an idle stretch in the middle where nobody sends a pose (the room
 * may hibernate then, and the keepalive must still be answered), and at
 * the end counts what it received from every other client.
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

import { CLOSE, PROTO, decodeBatch, encodePose } from '../src/share/roomwire.js';

const origin = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const seconds = Number(process.argv[3] || 30);
const clients = Number(process.argv[4] || 2);
const wsOrigin = origin.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const profile = (i) => ({ airframe: i % 2 ? 'cub1400' : '5inch', map: 'swiss2', figure: i % 12, livery: null, parts: null });

/* One socket and what it saw. Resolves once it is open. */
function connect(code, i, extra = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${wsOrigin}/v2/room/${code}`);
    ws.binaryType = 'arraybuffer';
    const c = { i, ws, welcome: null, closed: null, texts: [], batches: 0, bytes: 0, frames: new Map(), pongs: 0, offset: null, bestRtt: Infinity };
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'hello', proto: PROTO, build: 'soak', name: [i % 24, (i * 7) % 24, 10 + i], profile: profile(i), ...extra }));
      resolve(c);
    });
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        if (ev.data === 'pong') {
          c.pongs += 1;
          return;
        }
        const m = JSON.parse(ev.data);
        c.texts.push(m);
        if (m.type === 'welcome') {
          c.welcome = m;
        } else if (m.type === 't') {
          const recv = performance.now();
          const rtt = recv - m.c;
          if (rtt < c.bestRtt) {
            c.bestRtt = rtt;
            c.offset = m.s + rtt / 2 - recv;
          }
        }
        return;
      }
      c.batches += 1;
      c.bytes += ev.data.byteLength;
      const b = decodeBatch(new Uint8Array(ev.data));
      for (const p of b.poses) {
        c.frames.set(p.seat, (c.frames.get(p.seat) || 0) + 1);
      }
    });
    ws.addEventListener('close', (ev) => {
      c.closed = { code: ev.code, reason: ev.reason };
      resolve(c);
    });
    ws.addEventListener('error', () => {});
  });
}

async function waitFor(fn, ms = 10000) {
  const until = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > until) {
      return false;
    }
    await sleep(20);
  }
  return true;
}

async function create(extraHeaders = {}) {
  return fetch(`${origin}/v2/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ map: 'swiss2', friendly: false }),
  });
}

console.log(`rooms soak against ${origin}, ${seconds} s, ${clients} clients`);
const up = await fetch(`${origin}/`).then((r) => r.text()).catch((e) => `down: ${e.message}`);
check('the Worker answers', /protocol 2/.test(up), up.trim());
const foreign = await create({ origin: 'https://example.com' });
check('another site cannot make a room', foreign.status === 403, `${foreign.status}`);
const res = await create({ origin: 'https://fdflabs.github.io' });
const made = await res.json().catch(() => ({}));
check('the simulator can', res.ok && /^[A-Z0-9]{6}$/.test(made.code || ''), JSON.stringify(made));
check('with its origin allowed back', res.headers.get('access-control-allow-origin') === 'https://fdflabs.github.io');
const code = made.code;

const nobody = await connect('BCDFGH', 99);
await waitFor(() => nobody.closed);
check('a code nobody made is no room', nobody.closed && nobody.closed.code === CLOSE.nosuch, JSON.stringify(nobody.closed));
const stale = await connect(code, 98, { proto: 1 });
await waitFor(() => stale.closed);
check('an old client is told to update', stale.closed && stale.closed.code === CLOSE.update, JSON.stringify(stale.closed));

const socks = [];
for (let i = 0; i < clients; i += 1) {
  socks.push(await connect(code, i));
}
await waitFor(() => socks.every((c) => c.welcome));
check(`${clients} pilots are seated`, socks.every((c) => c.welcome), socks.map((c) => c.welcome && c.welcome.seat).join(','));
check('each seat is its own', new Set(socks.map((c) => c.welcome && c.welcome.seat)).size === clients);

/* Clock: eight pings a quarter second apart, keep the tightest. */
for (let k = 0; k < 8; k += 1) {
  for (const c of socks) {
    c.ws.send(JSON.stringify({ type: 't', c: performance.now() }));
  }
  await sleep(250);
}
check('every client has a room clock', socks.every((c) => c.offset != null), socks.map((c) => `${c.bestRtt.toFixed(1)} ms rtt`).join(', '));
for (const c of socks) {
  c.ws.send('ping');
}
await waitFor(() => socks.every((c) => c.pongs > 0));
check('the keepalive is answered', socks.every((c) => c.pongs > 0));

let seq = 0;
async function fly(ms) {
  const start = performance.now();
  while (performance.now() - start < ms) {
    const tick = performance.now();
    for (const c of socks) {
      if (c.ws.readyState !== 1) {
        continue;
      }
      const t = tick + c.offset;
      const a = t / 1000 + c.i;
      c.ws.send(encodePose({
        flags: 1, seq: seq & 0xffff, t, px: Math.cos(a) * 30, py: 20 + c.i, pz: Math.sin(a) * 30,
        qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
      }));
    }
    seq += 1;
    const wait = 1000 / 30 - (performance.now() - tick);
    await sleep(Math.max(0, wait));
  }
}

const half = (seconds * 1000) / 2;
await fly(half);
const idleMs = Math.min(15000, half);
console.log(`  idle ${idleMs / 1000} s: nobody sends a pose`);
await sleep(idleMs);
for (const c of socks) {
  c.pongs = 0;
  c.ws.send('ping');
}
await waitFor(() => socks.every((c) => c.pongs > 0));
check('after the idle stretch the keepalive is still answered', socks.every((c) => c.pongs > 0));
await fly(half);
await sleep(300);

const flownS = (2 * half) / 1000;
for (const c of socks) {
  for (const o of socks) {
    if (o === c) {
      continue;
    }
    const got = c.frames.get(o.welcome.seat) || 0;
    const hz = got / flownS;
    check(`client ${c.i} saw client ${o.i} at ${hz.toFixed(1)} Hz`, hz > 25 && hz < 36);
  }
  const perS = c.bytes / flownS;
  check(`client ${c.i} took ${c.batches} batches, ${(perS / 1000).toFixed(2)} kB/s of payload`, c.batches > 0);
}

console.log('reconnect');
const first = socks[0];
const token = first.welcome.token;
first.ws.close();
await waitFor(() => socks[1].texts.some((m) => m.type === 'leave' && m.seat === first.welcome.seat));
check('the others are told a pilot left', socks[1].texts.some((m) => m.type === 'leave'));
const again = await connect(code, 0, { token });
await waitFor(() => again.welcome);
check('the token takes the same seat back', again.welcome && again.welcome.seat === first.welcome.seat && again.welcome.token === token);
socks[0] = again;

console.log('the cap');
const more = [];
for (let i = clients; i < 9; i += 1) {
  more.push(await connect(code, i));
}
await waitFor(() => more.every((c) => c.welcome || c.closed));
const inRoom = socks.length + more.filter((c) => c.welcome).length;
const full = more.filter((c) => c.closed && c.closed.code === CLOSE.full);
check(`the room holds 8 and refuses the ninth as full`, inRoom === 8 && full.length === 1, `${inRoom} in, ${full.length} full`);

for (const c of [...socks, ...more]) {
  try {
    c.ws.close();
  } catch (e) {
    /* already closed */
  }
}
await sleep(300);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
