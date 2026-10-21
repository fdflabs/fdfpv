/*
 * rooms-drain-check.js: a rooms server draining while the next one serves.
 *
 *   node scripts/rooms-drain-check.js             (npm run rooms:drain)
 *
 * Starts edge/rooms/node.js twice from this tree, as its own processes,
 * each on its own port, SQLite file and REVISION (v1 and v2), and proves
 * what SIGUSR2 means (docs/ROOMS-DRAIN.md, slice 1):
 *
 *   v1 drains: two pilots flying in a room on it get no close and keep
 *   receiving each other's fresh poses, nearly every one the other sent;
 *   a third pilot still joins that room, and a dropped one comes back into its seat with its
 *   token; a new room, a quick join and a socket to a code v1 does not
 *   hold are refused 503 busy; v2 makes the new room and seats its pilot;
 *   each answers its own /v2/version.
 *   The room empties: v1 exits 0 by itself, saying so.
 *   The cap: a v1 drained with DRAIN_CAP_MS short closes its pilots with
 *   today's 1012 at the cap, not before, and exits 0.
 *   The control: a drain that closes at once (a cap of 1 ms) fails the
 *   same "keeps flying" probe the first case passes, so the probe can see
 *   a drain that drops the room.
 *
 * And a deploy (slice 2): v1 and a v2 started with ROOMS_PEER=v1 on ONE
 * SQLite file, as the VM runs them, with v2 standing for the new live
 * port (every pilot after the flip connects to v2 only):
 *
 *   v2 starting takes none of v1's rooms; v1 drains; a pilot joining v1's
 *   room through v2, and a dropped pilot coming back into its seat with
 *   its token through v2, both land in v1's room and fly with its pilots
 *   (the socket forwarded); v2's room browser lists v1's flying public
 *   room; a new room is made on v2. The rooms empty: v1 exits, v2 takes
 *   in what v1 had stored, and a pilot comes back into its seat in v1's
 *   room on v2.
 *   The cap: v1 still flying at its cap closes with 1012, and both
 *   pilots come back into their seats through v2, from the shared file,
 *   and fly together there.
 *   The control: a v2 started without ROOMS_PEER on v1's file seats a
 *   pilot in a second copy of v1's room, who never sees v1's pilots, so
 *   the probe can see a deploy that splits a room.
 *
 * The pilot helpers are rooms-server-check.js's, copied rather than shared
 * so that check stays as it is.
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

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { PROTO, ROOM_LEVEL, decodeBatch, encodePose } from '../src/share/roomwire.js';
import { TICK_MS } from '../edge/rooms/core.js';

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
const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-drain-'));
const nodeJs = fileURLToPath(new URL('../edge/rooms/node.js', import.meta.url));
const V1 = 'a'.repeat(40);
const V2 = 'b'.repeat(40);

/* The share of a pilot's poses the other must receive, counted against
 * what was sent rather than a wall-clock rate, which a slow 2-core runner
 * lowers for sender and room alike (the merge queue saw 23 Hz with no
 * close). The sixth spared is a pose sent twice in one room tick and so
 * relayed once; a drain that drops the room relays none. */
const MIN_SHARE = 5 / 6;
const WINDOW_MS = 3000;

/* A rooms server as the VM runs it, its own process. */
const children = [];
async function startServer(name, revision, env = {}, db = name) {
  const revisionFile = join(scratch, `${name}.REVISION`);
  writeFileSync(revisionFile, `${revision}\n`);
  const child = spawn(process.execPath, [nodeJs], {
    env: { ...process.env, PORT: '0', ROOMS_DB: join(scratch, `${db}.db`), REVISION_FILE: revisionFile, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  children.push(child);
  const s = { child, out: '', exit: null };
  s.exited = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      s.exit = { code, signal };
      resolve(s.exit);
    });
  });
  child.stdout.on('data', (d) => {
    s.out += d.toString();
  });
  const end = Date.now() + 10000;
  while (!/rooms on [\d.]+:(\d+)/.test(s.out) && Date.now() < end && !s.exit) {
    await sleep(20);
  }
  const port = Number((s.out.match(/rooms on [\d.]+:(\d+)/) || [])[1]);
  if (!port) {
    throw new Error(`${name} did not start: ${s.out}`);
  }
  s.origin = `http://127.0.0.1:${port}`;
  return s;
}

/* Waits for the child's exit, at most ms; its exit or null. */
async function exitWithin(s, ms) {
  return Promise.race([s.exited, sleep(ms).then(() => s.exit)]);
}

function pilot(origin, path) {
  const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/v2/${path}`);
  const p = { ws, got: [], closed: null, refused: null };
  ws.binaryType = 'nodebuffer';
  ws.on('message', (data, binary) => {
    p.got.push(binary ? new Uint8Array(data) : (data.toString() === 'pong' ? 'pong' : JSON.parse(data.toString())));
  });
  ws.on('close', (code, reason) => {
    p.closed = p.closed || { code, reason: reason.toString(), at: Date.now() };
  });
  p.open = new Promise((resolve) => {
    ws.on('open', resolve);
    ws.on('close', resolve);
    /* With this listener ws neither aborts the request nor emits close. */
    ws.on('unexpected-response', (req, res) => {
      p.refused = res.statusCode;
      p.closed = { code: 0, reason: 'refused', at: Date.now() };
      req.destroy();
      resolve();
    });
  });
  ws.on('error', () => {});
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
  p.text = (type) => p.got.filter((m) => m && m.type === type);
  p.say = (msg) => ws.send(JSON.stringify(msg));
  return p;
}

const profile = { airframe: 'cub1400', map: 'itaipu', figure: 3, livery: { scheme: 'sport' }, parts: { prop: 'stock', addons: [] } };
async function seat(origin, path, extra = {}) {
  const p = pilot(origin, path);
  await p.open;
  if (p.closed) {
    return p;
  }
  p.say({ type: 'hello', proto: PROTO, build: 'check', level: ROOM_LEVEL, name: [1, 2, 42], profile, ...extra });
  p.welcome = await p.until((x) => x.text('welcome')[0] || x.closed);
  p.clockAt = Date.now();
  return p;
}

/* A pilot flying: a fresh pose every room tick, seq and time rising, as a
 * page sends them, so the room relays them rather than repeating a held
 * one at REPEAT_MS, from seq `from` on (a pilot back in its seat goes on
 * from its last, as a page does). Returns the stop. */
function fly(p, from = 0) {
  let seq = from;
  p.sent = 0;
  const timer = setInterval(() => {
    if (p.ws.readyState !== 1) {
      return;
    }
    seq = (seq + 1) & 0xffff;
    p.seq = seq;
    p.sent += 1;
    p.ws.send(encodePose({
      flags: 0, seq, t: p.welcome.roomMs + (Date.now() - p.clockAt), px: 10 + seq * 0.01, py: 300, pz: 5, qx: 0, qy: 0, qz: 0, qw: 1,
      vx: 1, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
    }));
  }, TICK_MS);
  return () => clearInterval(timer);
}

/* The distinct seqs of seat's poses p has had, so a held pose the room
 * repeats at REPEAT_MS counts once. */
const seqsFrom = (p, seat) => new Set(p.got.flatMap((m) => (m instanceof Uint8Array ? decodeBatch(m)?.poses ?? [] : []).filter((q) => q.seat === seat).map((q) => q.seq)));

/* The probe: over WINDOW_MS, neither pilot closed and each received, fresh,
 * MIN_SHARE or more of the poses the other sent. */
async function keepsFlying(a, b) {
  /* What `to` has had from `from` so far, and how much `from` has sent. */
  const mark = (to, from) => ({ to, from, seen: seqsFrom(to, from.welcome.seat), sent: from.sent });
  const marks = [mark(a, b), mark(b, a)];
  await sleep(WINDOW_MS);
  const got = marks.map(({ to, from, seen, sent }) => {
    const fresh = [...seqsFrom(to, from.welcome.seat)].filter((q) => !seen.has(q)).length;
    const n = from.sent - sent;
    return { fresh, n, share: n ? fresh / n : 0 };
  });
  const ok = !a.closed && !b.closed && got.every((g) => g.share >= MIN_SHARE);
  return { ok, detail: `closed ${JSON.stringify([a.closed, b.closed])}, ${got.map((g) => `${g.fresh}/${g.n}`).join(' and ')} poses, need ${MIN_SHARE.toFixed(2)}` };
}

const make = (origin, extra = {}) => fetch(`${origin}/v2/create`, { method: 'POST', headers: { origin: 'https://fdflabs.github.io' }, body: JSON.stringify({ map: 'itaipu', ...extra }) });

/* A room on server s with two pilots flying in it. */
async function flyingRoom(s, extra = {}) {
  const { code } = await (await make(s.origin, extra)).json();
  const a = await seat(s.origin, `room/${code}`);
  const b = await seat(s.origin, `room/${code}`, { name: [3, 4, 77] });
  const stops = [fly(a), fly(b)];
  return { code, a, b, stop: () => stops.forEach((f) => f()) };
}

try {
  console.log('v1 drains while v2 serves');
  const v1 = await startServer('v1', V1);
  const v2 = await startServer('v2', V2);
  const version = async (s) => (await (await fetch(`${s.origin}/v2/version`)).json()).commit;
  check('v1 and v2 each answer their own version', (await version(v1)) === V1 && (await version(v2)) === V2);
  const x = await flyingRoom(v1);
  check('two pilots seated in a room on v1', Boolean(x.a.welcome?.seat && x.b.welcome?.seat), JSON.stringify([x.a.welcome, x.b.welcome]));
  const before = await keepsFlying(x.a, x.b);
  check('and flying before the drain', before.ok, before.detail);

  v1.child.kill('SIGUSR2');
  await sleep(1000);
  const during = await keepsFlying(x.a, x.b);
  check('v1 draining: no close, fresh poses both ways', during.ok, during.detail);
  check('v1 is still running', v1.exit === null, JSON.stringify(v1.exit));
  check('and says it drains', /draining/.test(v1.out), v1.out);
  check('and still answers its own version', (await version(v1)) === V1);

  const refusedMake = await make(v1.origin);
  check('a new room on v1 is refused 503 busy', refusedMake.status === 503 && (await refusedMake.json()).error === 'busy', `${refusedMake.status}`);
  const nobody = pilot(v1.origin, 'room/BCDFGH');
  await nobody.open;
  check('a socket to a code v1 does not hold is refused 503', nobody.refused === 503, `${nobody.refused}`);

  const c = await seat(v1.origin, `room/${x.code}`, { name: [5, 6, 30] });
  check('a third pilot still joins the room on v1', Boolean(c.welcome?.seat) && c.welcome.code === x.code, JSON.stringify(c.welcome));
  const seatC = c.welcome;
  c.ws.terminate();
  await c.until((p) => p.closed);
  const c2 = await seat(v1.origin, `room/${x.code}`, { name: [5, 6, 30], token: seatC.token, seat: seatC.seat });
  check('a dropped pilot comes back into its seat with its token', c2.welcome?.seat === seatC.seat && c2.welcome.token === seatC.token, JSON.stringify(c2.welcome));

  const made = await make(v2.origin);
  const fresh = made.status === 200 ? (await made.json()).code : null;
  const d = fresh ? await seat(v2.origin, `room/${fresh}`) : null;
  check('the new room is made on v2 and its pilot seated', Boolean(d?.welcome?.seat) && d.welcome.code === fresh, `${made.status} ${JSON.stringify(d?.welcome)}`);

  const still = await keepsFlying(x.a, x.b);
  check('the room on v1 is still flying after all that', still.ok, still.detail);

  x.stop();
  const leftAt = Date.now();
  for (const p of [x.a, x.b, c2]) {
    p.ws.close(1000, 'leave');
  }
  const exit = await exitWithin(v1, 5000);
  check('the room empties and v1 exits 0 by itself', exit?.code === 0, `${JSON.stringify(exit)} after ${Date.now() - leftAt} ms`);
  check('saying it drained empty', /drained \(empty\)/.test(v1.out), v1.out);
  check('v2 is untouched', v2.exit === null && (await version(v2)) === V2);
  d.ws.close(1000, 'leave');
  v2.child.kill('SIGTERM');
  check('and stops on SIGTERM as before', (await exitWithin(v2, 5000))?.code === 0);

  console.log('the cap: a room still flying when it comes');
  const CAP_MS = 4000;
  const v1cap = await startServer('v1cap', V1, { DRAIN_CAP_MS: String(CAP_MS) });
  const y = await flyingRoom(v1cap);
  const signalledAt = Date.now();
  v1cap.child.kill('SIGUSR2');
  const early = await keepsFlying(y.a, y.b);
  check(`no close before the cap (${WINDOW_MS} of ${CAP_MS} ms)`, early.ok, early.detail);
  await y.a.until((p) => p.closed, CAP_MS + 3000);
  await y.b.until((p) => p.closed, 1000);
  const closedAfter = y.a.closed ? y.a.closed.at - signalledAt : null;
  check('at the cap both pilots are closed with 1012, as a restart', y.a.closed?.code === 1012 && y.b.closed?.code === 1012, JSON.stringify([y.a.closed, y.b.closed]));
  check(`and not before it (${closedAfter} ms after the signal)`, closedAfter !== null && closedAfter >= CAP_MS, `${closedAfter}`);
  y.stop();
  const capExit = await exitWithin(v1cap, 5000);
  check('v1 exits 0 saying it drained at the cap', capExit?.code === 0 && /drained \(cap\)/.test(v1cap.out), `${JSON.stringify(capExit)} ${v1cap.out}`);

  console.log('the control: a drain that closes the room at once');
  const v1now = await startServer('v1now', V1, { DRAIN_CAP_MS: '1' });
  const z = await flyingRoom(v1now);
  v1now.child.kill('SIGUSR2');
  const dropped = await keepsFlying(z.a, z.b);
  check('the same probe fails it', !dropped.ok, dropped.detail);
  z.stop();
  await exitWithin(v1now, 5000);

  console.log('a deploy: v2 with ROOMS_PEER=v1 on one rooms.db, pilots on v2 only after the flip');
  const h1 = await startServer('h1', V1, {}, 'shared');
  const h = await flyingRoom(h1);
  const pub = await flyingRoom(h1, { public: true });
  const peerOf = (s) => ({ ROOMS_PEER: s.origin.replace('http://', '') });
  const h2 = await startServer('h2', V2, peerOf(h1), 'shared');
  check('v2 starts naming its peer', /peer 127\.0\.0\.1:\d+/.test(h2.out), h2.out);
  await sleep(1500);
  check('and takes none of the peer\'s rooms while it answers', !/taken in/.test(h2.out), h2.out);
  h1.child.kill('SIGUSR2');
  await sleep(500);
  const joined = await seat(h2.origin, `room/${h.code}`, { name: [5, 6, 30] });
  check('a pilot joining v1\'s room through v2 is seated in it', joined.welcome?.code === h.code && Boolean(joined.welcome.seat), JSON.stringify(joined.welcome || joined.closed));
  const stopJoined = fly(joined);
  const withJoined = await keepsFlying(h.a, joined);
  check('and flies with v1\'s pilots: the socket went to v1', withJoined.ok, withJoined.detail);
  const seatB = h.b.welcome;
  h.b.ws.terminate();
  await h.b.until((p) => p.closed);
  const b2 = await seat(h2.origin, `room/${h.code}`, { name: [3, 4, 77], token: seatB.token, seat: seatB.seat });
  check('a dropped pilot comes back into its seat through v2 with its token', b2.welcome?.seat === seatB.seat && b2.welcome.token === seatB.token, JSON.stringify(b2.welcome || b2.closed));
  const stopB2 = fly(b2, h.b.seq);
  const reseated = await keepsFlying(h.a, b2);
  check('and flies on with the pilot who never left', reseated.ok, reseated.detail);
  check('v1 is still running, draining', h1.exit === null && /draining/.test(h1.out), JSON.stringify(h1.exit));
  const list = await (await fetch(`${h2.origin}/v2/rooms`, { headers: { origin: 'https://fdflabs.github.io' } })).json();
  check('v2\'s room browser lists v1\'s flying public room', Array.isArray(list.rooms) && list.rooms.some((r) => r.code === pub.code && r.n === 2), JSON.stringify(list));
  const newMade = await make(h2.origin);
  const newCode = newMade.status === 200 ? (await newMade.json()).code : null;
  const fresh2 = newCode ? await seat(h2.origin, `room/${newCode}`) : null;
  check('a new room is made on v2 and its pilot seated', Boolean(fresh2?.welcome?.seat) && fresh2.welcome.code === newCode, `${newMade.status} ${JSON.stringify(fresh2?.welcome)}`);
  check('both answer their own version', (await version(h1)) === V1 && (await version(h2)) === V2);

  h.stop();
  pub.stop();
  stopJoined();
  stopB2();
  const seatA = h.a.welcome;
  for (const p of [h.a, joined, b2, pub.a, pub.b]) {
    p.ws.close(1000, 'leave');
  }
  const h1exit = await exitWithin(h1, 5000);
  check('the rooms empty and v1 exits 0 by itself', h1exit?.code === 0 && /drained \(empty\)/.test(h1.out), `${JSON.stringify(h1exit)} ${h1.out}`);
  const end = Date.now() + 5000;
  while (!/taken in/.test(h2.out) && Date.now() < end) {
    await sleep(50);
  }
  check('v2 takes in the rooms v1 had stored', /peer \S+ gone: [1-9]\d* stored rooms taken in/.test(h2.out), h2.out);
  const back = await seat(h2.origin, `room/${h.code}`, { token: seatA.token, seat: seatA.seat });
  check('and a pilot of v1\'s room comes back into its seat on v2', back.welcome?.seat === seatA.seat && back.welcome.code === h.code, JSON.stringify(back.welcome || back.closed));
  back.ws.close(1000, 'leave');
  fresh2.ws.close(1000, 'leave');
  h2.child.kill('SIGTERM');
  await exitWithin(h2, 5000);

  console.log('a deploy whose v1 reaches its cap');
  const k1 = await startServer('k1', V1, { DRAIN_CAP_MS: String(CAP_MS) }, 'sharedcap');
  const k = await flyingRoom(k1);
  const k2 = await startServer('k2', V2, peerOf(k1), 'sharedcap');
  k1.child.kill('SIGUSR2');
  await k.a.until((p) => p.closed, CAP_MS + 3000);
  await k.b.until((p) => p.closed, 1000);
  check('at the cap v1 closes both pilots with 1012', k.a.closed?.code === 1012 && k.b.closed?.code === 1012, JSON.stringify([k.a.closed, k.b.closed]));
  k.stop();
  /* The client's first retry is a second after the close (src/share/rooms.js RETRY_MS). */
  await sleep(1000);
  const [ka, kb] = await Promise.all([
    seat(k2.origin, `room/${k.code}`, { token: k.a.welcome.token, seat: k.a.welcome.seat }),
    seat(k2.origin, `room/${k.code}`, { name: [3, 4, 77], token: k.b.welcome.token, seat: k.b.welcome.seat }),
  ]);
  check('both come back into their seats through v2', ka.welcome?.seat === k.a.welcome.seat && kb.welcome?.seat === k.b.welcome.seat, JSON.stringify([ka.welcome || ka.closed, kb.welcome || kb.closed]));
  const kStops = [fly(ka), fly(kb)];
  const kFly = await keepsFlying(ka, kb);
  check('and fly together on v2', kFly.ok, kFly.detail);
  kStops.forEach((f) => f());
  check('v1 exited 0 at its cap', (await exitWithin(k1, 3000))?.code === 0 && /drained \(cap\)/.test(k1.out), k1.out);
  ka.ws.close(1000, 'leave');
  kb.ws.close(1000, 'leave');
  k2.child.kill('SIGTERM');
  await exitWithin(k2, 5000);

  console.log('the control: a v2 without ROOMS_PEER on v1\'s file');
  const n1 = await startServer('n1', V1, {}, 'sharednone');
  const n = await flyingRoom(n1);
  const n2 = await startServer('n2', V2, {}, 'sharednone');
  const split = await seat(n2.origin, `room/${n.code}`, { name: [5, 6, 30] });
  const stopSplit = fly(split);
  const splitFly = split.welcome ? await keepsFlying(n.a, split) : { ok: false, detail: 'not seated' };
  check('its pilot is seated in a copy of the room that never sees v1\'s pilots', Boolean(split.welcome?.seat) && !splitFly.ok, splitFly.detail);
  stopSplit();
  n.stop();
} catch (e) {
  check('the check ran to its end', false, e && e.stack ? e.stack : String(e));
} finally {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
