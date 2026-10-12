/*
 * rooms-deploy-caddy-check.js: a rooms deploy across a local Caddy, as the
 * VM does it (docs/ROOMS-DRAIN.md).
 *
 *   CADDY=/path/to/caddy node scripts/rooms-deploy-caddy-check.js
 *                                                  (npm run rooms:deploy-caddy)
 *
 * deploy/vm/Caddyfile's rooms route, its upstream rewritten to local
 * ports, in front of edge/rooms/node.js run as its own processes on one
 * SQLite file. Then what deploy/vm/rooms-deploy.sh does: start v2 with
 * ROOMS_PEER=v1, reload Caddy pointing at v2, send v1 SIGUSR2. Proves:
 *
 *   two pilots flying in a room on v1, through Caddy, get no close at the
 *   reload or after it and keep receiving each other's fresh poses;
 *   /v2/version through Caddy is v2's, and a new room is made there;
 *   a third pilot joining the old room through Caddy flies with its
 *   pilots, also when it sends the peer header itself (Caddy strips it);
 *   the room empties: v1 exits 0, v2 takes in its rooms.
 *   The control: the same reload from a Caddyfile without
 *   stream_close_delay closes both pilots, so the probe sees a deploy
 *   that drops the room.
 *
 * Needs a caddy binary (CADDY, else caddy on PATH), as caddy:headers does,
 * so it is not a CI step. The pilot helpers are rooms-drain-check.js's,
 * copied so each check reads alone.
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

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { PROTO, decodeBatch, encodePose } from '../src/share/roomwire.js';
import { TICK_MS } from '../edge/rooms/core.js';
import { PEER_HEADER } from '../edge/rooms/node.js';

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

const CADDY = process.env.CADDY || 'caddy';
const found = spawnSync(CADDY, ['version'], { encoding: 'utf8' });
if (found.status !== 0) {
  console.error(`rooms-deploy-caddy-check: no caddy at ${CADDY} (set CADDY=/path/to/caddy)`);
  process.exit(1);
}
console.log(`caddy ${found.stdout.trim().split(' ')[0]}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-deploy-'));
const root = fileURLToPath(new URL('..', import.meta.url));
const nodeJs = join(root, 'edge/rooms/node.js');
const V1 = 'a'.repeat(40);
const V2 = 'b'.repeat(40);
const ORIGIN = 'https://fdflabs.github.io';
const MIN_SHARE = 5 / 6;
const WINDOW_MS = 3000;

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const children = [];
function track(child) {
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
  child.stderr.on('data', (d) => {
    s.out += d.toString();
  });
  return s;
}

async function startServer(name, revision, env, db) {
  const revisionFile = join(scratch, `${name}.REVISION`);
  writeFileSync(revisionFile, `${revision}\n`);
  const port = await freePort();
  const s = track(spawn(process.execPath, ['--disable-warning=ExperimentalWarning', nodeJs], {
    env: { ...process.env, PORT: String(port), ROOMS_DB: join(scratch, `${db}.db`), REVISION_FILE: revisionFile, ...env },
  }));
  const end = Date.now() + 10000;
  while (!/rooms on /.test(s.out) && Date.now() < end && !s.exit) {
    await sleep(20);
  }
  if (!/rooms on /.test(s.out)) {
    throw new Error(`${name} did not start: ${s.out}`);
  }
  s.port = port;
  return s;
}

async function exitWithin(s, ms) {
  return Promise.race([s.exited, sleep(ms).then(() => s.exit)]);
}

/* The VM's Caddyfile, its global options and sites swapped for one plain
 * HTTP site on `front` with an admin endpoint to reload through, the
 * rooms' upstream on `roomsPort`. keepStreams false drops the
 * stream_close_delay line, for the control. */
function caddyfile(front, admin, roomsPort, keepStreams = true) {
  let conf = readFileSync(join(root, 'deploy/vm/Caddyfile'), 'utf8');
  conf = conf.slice(0, conf.indexOf('\n129.151.39.48 {'))
    .replace(/^\{[\s\S]*?\n\}\n/m, `{\n\tadmin 127.0.0.1:${admin}\n\tauto_https off\n}\n`)
    .replace('127.0.0.1:8797', `127.0.0.1:${roomsPort}`)
    .replace('root * /var/lib/fdfpv-vids', `root * ${scratch}`);
  if (!keepStreams) {
    conf = conf.replace(/^\s*stream_close_delay .*$/m, '');
  }
  if (!conf.includes(`127.0.0.1:${roomsPort}`) || (keepStreams && !/stream_close_delay/.test(conf))) {
    throw new Error('the Caddyfile rewrite missed the rooms route');
  }
  return `${conf}\nhttp://127.0.0.1:${front} {\n\timport servers\n}\n`;
}

function caddyReload(file, admin) {
  const r = spawnSync(CADDY, ['reload', '--config', file, '--adapter', 'caddyfile', '--address', `127.0.0.1:${admin}`], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`caddy reload: ${r.stderr}`);
  }
}

function pilot(origin, path, headers = {}) {
  const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/v2/${path}`, { headers: { origin: ORIGIN, ...headers } });
  const p = { ws, got: [], closed: null };
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
    ws.on('unexpected-response', (req, res) => {
      p.closed = { code: 0, reason: `refused ${res.statusCode}`, at: Date.now() };
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

const profile = { airframe: 'cub1400', map: 'swiss2', figure: 3, livery: { scheme: 'sport' }, parts: { prop: 'stock', addons: [] } };
async function seat(origin, path, extra = {}, headers = {}) {
  const p = pilot(origin, path, headers);
  await p.open;
  if (p.closed) {
    return p;
  }
  p.say({ type: 'hello', proto: PROTO, build: 'check', name: [1, 2, 42], profile, ...extra });
  p.welcome = await p.until((x) => x.text('welcome')[0] || x.closed);
  p.clockAt = Date.now();
  return p;
}

function fly(p) {
  let seq = 0;
  p.sent = 0;
  const timer = setInterval(() => {
    if (p.ws.readyState !== 1) {
      return;
    }
    seq = (seq + 1) & 0xffff;
    p.sent += 1;
    p.ws.send(encodePose({
      flags: 0, seq, t: p.welcome.roomMs + (Date.now() - p.clockAt), px: 10 + seq * 0.01, py: 300, pz: 5, qx: 0, qy: 0, qz: 0, qw: 1,
      vx: 1, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
    }));
  }, TICK_MS);
  return () => clearInterval(timer);
}

const seqsFrom = (p, seat) => new Set(p.got.flatMap((m) => (m instanceof Uint8Array ? decodeBatch(m)?.poses ?? [] : []).filter((q) => q.seat === seat).map((q) => q.seq)));

async function keepsFlying(a, b) {
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

const make = (origin) => fetch(`${origin}/v2/create`, { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify({ map: 'swiss2' }) });

/* One deploy across Caddy, the room on v1 flying through it. Returns
 * everything for the checks. */
async function deploy(name, keepStreams) {
  const [front, admin] = await Promise.all([freePort(), freePort()]);
  const v1 = await startServer(`${name}1`, V1, {}, name);
  const file = join(scratch, `${name}.Caddyfile`);
  writeFileSync(file, caddyfile(front, admin, v1.port, keepStreams));
  const caddy = track(spawn(CADDY, ['run', '--config', file, '--adapter', 'caddyfile']));
  const origin = `http://127.0.0.1:${front}`;
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    try {
      if ((await fetch(`${origin}/v2/version`)).ok) {
        break;
      }
    } catch (e) {
      /* Not listening yet. */
    }
    await sleep(100);
  }
  const { code } = await (await make(origin)).json();
  const a = await seat(origin, `room/${code}`);
  const b = await seat(origin, `room/${code}`, { name: [3, 4, 77] });
  const stops = [fly(a), fly(b)];
  const before = await keepsFlying(a, b);

  const v2 = await startServer(`${name}2`, V2, { ROOMS_PEER: `127.0.0.1:${v1.port}` }, name);
  writeFileSync(file, caddyfile(front, admin, v2.port, keepStreams));
  caddyReload(file, admin);
  v1.child.kill('SIGUSR2');
  return { v1, v2, caddy, origin, code, a, b, stops, before };
}

try {
  console.log('a deploy across Caddy: v1 drains, v2 is live');
  const d = await deploy('live', true);
  check('two pilots seated through Caddy in a room on v1, flying', Boolean(d.a.welcome?.seat && d.b.welcome?.seat) && d.before.ok, `${JSON.stringify([d.a.welcome, d.b.welcome])} ${d.before.detail}`);
  const after = await keepsFlying(d.a, d.b);
  check('after the reload and the drain: no close, fresh poses both ways', after.ok, after.detail);
  const version = await (await fetch(`${d.origin}/v2/version`)).json();
  check('/v2/version through Caddy is v2\'s', version.commit === V2, JSON.stringify(version));
  const made = await make(d.origin);
  const freshCode = made.status === 200 ? (await made.json()).code : null;
  const fresh = freshCode ? await seat(d.origin, `room/${freshCode}`) : null;
  check('a new room through Caddy is made on v2 and its pilot seated', Boolean(fresh?.welcome?.seat), `${made.status} ${JSON.stringify(fresh?.welcome || fresh?.closed)}`);
  const c = await seat(d.origin, `room/${d.code}`, { name: [5, 6, 30] });
  const stopC = fly(c);
  const withC = c.welcome ? await keepsFlying(d.a, c) : { ok: false, detail: JSON.stringify(c.closed) };
  check('a pilot joining the old room through Caddy flies with its pilots, on v1', withC.ok, withC.detail);
  const e = await seat(d.origin, `room/${d.code}`, { name: [7, 8, 31] }, { [PEER_HEADER]: '1' });
  const stopE = fly(e);
  const withE = e.welcome ? await keepsFlying(d.a, e) : { ok: false, detail: JSON.stringify(e.closed) };
  check('and so does one that sends the peer header itself: Caddy strips it', withE.ok, withE.detail);
  check('v1 is still running, draining', d.v1.exit === null && /draining/.test(d.v1.out), d.v1.out);

  d.stops.forEach((f) => f());
  stopC();
  stopE();
  for (const p of [d.a, d.b, c, e]) {
    p.ws.close(1000, 'leave');
  }
  const v1exit = await exitWithin(d.v1, 5000);
  check('the room empties and v1 exits 0 by itself', v1exit?.code === 0 && /drained \(empty\)/.test(d.v1.out), `${JSON.stringify(v1exit)} ${d.v1.out}`);
  const end = Date.now() + 5000;
  while (!/taken in/.test(d.v2.out) && Date.now() < end) {
    await sleep(50);
  }
  check('v2 takes in the rooms v1 had stored', /gone: [1-9]\d* stored rooms taken in/.test(d.v2.out), d.v2.out);
  fresh.ws.close(1000, 'leave');

  console.log('the control: the same deploy from a Caddyfile without stream_close_delay');
  const x = await deploy('control', false);
  check('two pilots flying through Caddy before it', x.before.ok, x.before.detail);
  await x.a.until((p) => p.closed, 3000);
  await x.b.until((p) => p.closed, 1000);
  check('the reload closes both pilots, so the probe sees a deploy that drops the room', Boolean(x.a.closed && x.b.closed), JSON.stringify([x.a.closed, x.b.closed]));
  console.log(`  (closed with ${JSON.stringify([x.a.closed?.code, x.b.closed?.code])})`);
  x.stops.forEach((f) => f());
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
