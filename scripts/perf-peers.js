/*
 * perf-peers.js: how smoothly another pilot in a room is drawn.
 *
 *     SIM_GPU=1 node scripts/perf-peers.js [OUT_DIR] [--seconds=15] [--lag=50] [--jitter=10]
 *         [--map=swiss2] [--speed=20] [--radius=15]
 *
 * One headless page of the real shell makes a room on a rooms server this
 * script starts, and flies (sits on its pad). A second pilot is not a
 * second Chrome: it is this script, speaking the wire as rooms-load.js's
 * pilots do (hello, clock pings, a POSE every 1000 / 30 ms on its room
 * clock), flying a level circle at --speed m/s of --radius m, its poses
 * held back --lag ms give or take --jitter before they are sent, as a
 * link would hold them. Twice: a near circle 25 m in front of the page's
 * craft (src/game/peer.js draws it in the present, extrapolated) and a far
 * one 160 m away (drawn DELAY_MS in the past, interpolated).
 *
 * For every frame the page draws, the peer's aircraft as drawn (its group
 * in the scene) and the frame's timestamp on the room clock. The circle
 * is known, so each drawn position says what moment of the flight it
 * shows (its angle round the circle) and how far off the path it is:
 *
 *   clock jitter   frame to frame, the moment drawn less the frame's own
 *                  moment, its change's standard deviation in ms: zero
 *                  when the peer moves on the display's beat;
 *   kick           the drawn path's second difference less the circle's,
 *                  mm a frame: how hard the drawn aircraft is jolted;
 *   off path       metres from the circle;
 *   behind         the moment drawn, less the frame's, mean ms (near:
 *                  about zero, far: about DELAY_MS).
 *
 * Writes OUT_DIR/perf-peers.json and prints a table.
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

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { FLAG_AIRBORNE, FLAG_QUAD, PROTO, ROOM_LEVEL, WAR_JOIN, encodePose } from '../src/share/roomwire.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const opts = { seconds: 15, lag: 50, jitter: 10, map: 'swiss2', speed: 20, radius: 15 };
const positional = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z]+)=(.*)$/);
  if (!m) {
    positional.push(a);
    continue;
  }
  if (!(m[1] in opts)) {
    throw new Error(`perf-peers: unknown option --${m[1]}`);
  }
  opts[m[1]] = /^[\d.]+$/.test(m[2]) ? Number(m[2]) : m[2];
}
const outDir = resolve(positional[0] || join(tmpdir(), 'fdfpv-perf-peers'));
await mkdir(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WEB_ORIGIN = 'https://fdflabs.github.io';

/* The page's half: every frame, after the shell's, the peer as drawn and
 * the frame's timestamp. The scene comes from the composer's scene pass. */
const INSTRUMENT = /* js */ `(() => {
  const P = globalThis.__PEERS = { rows: [], on: false, scene: null, obj: null };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => {
    const r = cb(ts);
    if (P.on && cb.name === 'frame' && P.scene) {
      if (!P.obj || !P.obj.parent) { P.obj = P.scene.getObjectByName('peer-craft') || null; }
      if (P.obj && P.obj.visible) { const p = P.obj.position; P.rows.push(ts, p.x, p.y, p.z); }
    }
    return r;
  });
  P.hook = async () => {
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const c = EffectComposer.prototype.render;
    EffectComposer.prototype.render = function (...a) {
      if (!P.scene) { const pass = this.passes.find((x) => x.constructor.name === 'RenderPass'); if (pass) { P.scene = pass.scene; } }
      return c.apply(this, a);
    };
    return true;
  };
  /* The page clock against the room clock, read while recording. */
  P.offset = () => { const r = window.__rooms(); return r.roomNow == null ? null : r.roomNow - performance.now(); };
})();`;

async function freePort() {
  const srv = createServer();
  await new Promise((done) => srv.listen(0, '127.0.0.1', done));
  const { port } = srv.address();
  await new Promise((done) => srv.close(done));
  return port;
}

/* The second pilot: seated, clock synced, then flying whatever `path(t)`
 * says at room time t, each pose sent lag ms (give or take jitter) late. */
async function peerPilot(origin, code) {
  const c = { ws: null, offset: null, bestRtt: Infinity, welcome: null, seq: 0, path: null, timer: null, sent: 0 };
  c.roomNow = () => Date.now() + c.offset;
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  await new Promise((done, fail) => {
    const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/v2/room/${code}`, { headers: { origin: WEB_ORIGIN } });
    c.ws = ws;
    ws.on('open', () => ws.send(JSON.stringify({
      type: 'hello', proto: PROTO, build: 'perf-peers', level: ROOM_LEVEL, war: WAR_JOIN, name: [3, 5, 42],
      profile: { airframe: 'interceptor', map: opts.map, figure: 2, livery: null, parts: null },
    })));
    ws.on('message', (data, binary) => {
      if (binary) {
        return;
      }
      const text = data.toString();
      if (text === 'pong') {
        return;
      }
      const m = JSON.parse(text);
      const wall = Date.now();
      if (!c.welcome && m.type !== 'welcome') {
        console.log(`  peer heard ${text.slice(0, 160)}`);
      }
      if (m.type === 'welcome') {
        c.welcome = m;
        c.offset = m.roomMs - wall;
        done();
      } else if (m.type === 't') {
        const rtt = wall - m.c;
        if (rtt < c.bestRtt) {
          c.bestRtt = rtt;
          c.offset = m.s + rtt / 2 - wall;
        }
      }
    });
    ws.on('error', fail);
    ws.on('close', (code, why) => fail(new Error(`perf-peers: the peer's socket closed, ${code} ${why}`)));
    setTimeout(() => fail(new Error('perf-peers: no welcome for the peer in 20 s')), 20000);
  });
  for (let k = 0; k < 8; k += 1) {
    c.ws.send(JSON.stringify({ type: 't', c: Date.now() }));
    await sleep(250);
  }
  let next = Math.ceil(c.roomNow() / (1000 / 30)) * (1000 / 30);
  c.timer = setInterval(() => {
    if (!c.path) {
      return;
    }
    for (; next <= c.roomNow(); next += 1000 / 30) {
      const t = Math.round(next);
      const f = c.path(t);
      c.seq = (c.seq + 1) & 0xffff;
      const bytes = encodePose({
        flags: FLAG_AIRBORNE | FLAG_QUAD, seq: c.seq, t,
        px: f.p[0], py: f.p[1], pz: f.p[2], qx: 0, qy: Math.sin(f.yaw / 2), qz: 0, qw: Math.cos(f.yaw / 2),
        vx: f.v[0], vy: f.v[1], vz: f.v[2], wx: 0, wy: f.rate, wz: 0, c0: 900, c1: 900, c2: 900, c3: 900, motor: 900, flaps: 0,
      });
      const hold = Math.max(0, opts.lag + (rand() * 2 - 1) * opts.jitter);
      setTimeout(() => {
        if (c.ws.readyState === 1) {
          c.ws.send(bytes);
          c.sent += 1;
        }
      }, hold);
    }
  }, 2);
  return c;
}

/* A level circle round (cx, cz) at height y, anticlockwise seen from
 * above, at speed v; angle 0 at room time t0. */
function circle(cx, y, cz, r, v, t0) {
  const w = v / r;
  return {
    w, cx, cz, r, t0,
    at(t) {
      const a = (w * (t - t0)) / 1000;
      return {
        p: [cx + r * Math.cos(a), y, cz - r * Math.sin(a)],
        v: [-v * Math.sin(a), 0, -v * Math.cos(a)],
        yaw: a, rate: w,
      };
    },
  };
}

const sd = (a) => {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/* What the drawn positions say, against the circle flown. */
function analyse(rows, offset, c) {
  const n = rows.length / 4;
  const frames = [];
  for (let i = 0; i < n; i += 1) {
    const ts = rows[i * 4];
    const x = rows[i * 4 + 1];
    const z = rows[i * 4 + 3];
    const T = ts + offset;
    const dx = x - c.cx;
    const dz = -(z - c.cz);
    frames.push({ T, x, z, ang: Math.atan2(dz, dx), off: Math.abs(Math.hypot(dx, dz) - c.r) });
  }
  /* The angle unwrapped against the frame's own moment, so a whole turn
   * is not a jump: each drawn moment is the one nearest the frame's. */
  const period = (2 * Math.PI * 1000) / c.w;
  const lagMs = frames.map((f) => {
    const own = f.T - c.t0;
    const drawn = (f.ang * 1000) / c.w;
    const k = Math.round((own - drawn) / period);
    return own - (drawn + k * period);
  });
  const dLag = [];
  for (let i = 1; i < lagMs.length; i += 1) {
    dLag.push(lagMs[i] - lagMs[i - 1]);
  }
  const ideal = (c.w * c.w * c.r) / 1e6;
  const kick = [];
  for (let i = 1; i < n - 1; i += 1) {
    const a = frames[i - 1];
    const b = frames[i];
    const d = frames[i + 1];
    const h1 = b.T - a.T;
    const h2 = d.T - b.T;
    const ax = ((d.x - b.x) / h2 - (b.x - a.x) / h1) / ((h1 + h2) / 2);
    const az = ((d.z - b.z) / h2 - (b.z - a.z) / h1) / ((h1 + h2) / 2);
    /* mm a frame at a 90 Hz frame's interval: an acceleration error
     * times (1000 / 90)^2, so runs at any frame rate compare. */
    kick.push(Math.abs(Math.hypot(ax, az) - ideal) * (1000 / 90) ** 2 * 1000);
  }
  return {
    frames: n,
    clockJitterMs: sd(dLag),
    behindMs: mean(lagMs),
    kickMm: { mean: mean(kick), p95: pct(kick, 0.95), max: pct(kick, 1) },
    offPathM: { mean: mean(frames.map((f) => f.off)), p95: pct(frames.map((f) => f.off), 0.95) },
  };
}

function gpuLoad() {
  const q = spawnSync('nvidia-smi', ['--query-gpu=index,utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  return {
    gpus: (q.stdout || '').trim().split('\n').filter(Boolean).map((l) => l.split(',').map((x) => Number(x.trim()))),
    load: loadavg().map((x) => Math.round(x * 10) / 10),
  };
}

const dir = await mkdtemp(join(tmpdir(), 'perf-peers-rooms-'));
const port = await freePort();
const server = await startRooms({ db: join(dir, 'rooms.db'), port });
const origin = `http://127.0.0.1:${port}`;
const settings = Object.assign(
  seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch'),
  { map: opts.map, freestyleMap: opts.map, graphics: 'high', graphicsAuto: false, airframeAsked: true, fpsCap: 0 },
);
const page = await openPage({
  root, width: 1600, height: 900, url: `/index.html?map=${opts.map}&rooms=${encodeURIComponent(origin)}`,
  seed: [`try { localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify(Object.assign(JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || '{}'), ${JSON.stringify(settings)}))); } catch (e) { /* Storage refused. */ }`, INSTRUMENT],
});
let peer = null;
const stop = () => page.close().finally(() => process.exit(1));
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
const report = { when: new Date().toISOString(), opts, runs: [] };
try {
  await page.until('window.__shellReady === true && window.__map && window.__map().ready', 400000);
  await page.evaluate('window.__PEERS.hook()');
  console.log('  shell up');
  const code = await page.evaluate(`window.__roomCreate({ map: ${JSON.stringify(opts.map)} })`);
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  console.log('  room open');
  await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await page.until("window.__craftState && window.__craftState().mode === 'flight' && window.__map().ready", 120000);
  console.log('  flying');
  peer = await peerPilot(origin, code);
  console.log('  peer seated');
  await page.until('window.__rooms().peers.length === 1', 30000);
  console.log('  page sees the peer');
  const me = await page.evaluate('(() => { const c = window.__craftState(); return { x: c.worldX, y: c.worldY, z: c.worldZ }; })()');
  for (const [name, dist] of [['near', 25], ['far', 160]]) {
    const c = circle(me.x, me.y + 8, me.z - dist, opts.radius, opts.speed, peer.roomNow());
    peer.path = (t) => c.at(t);
    await page.until('window.__rooms().peers[0].drawn', 30000);
    await sleep(2000);
    const before = gpuLoad();
    await page.evaluate('(window.__PEERS.rows.length = 0, window.__PEERS.on = true)');
    const offsets = [];
    for (let s = 0; s < opts.seconds; s += 1) {
      await sleep(1000);
      offsets.push(await page.evaluate('window.__PEERS.offset()'));
    }
    await page.evaluate('(window.__PEERS.on = false, true)');
    const rows = await page.evaluate('window.__PEERS.rows');
    const offset = mean(offsets.filter((o) => o != null));
    const a = analyse(rows, offset, c);
    report.runs.push({ name, dist, load: before, offsetSpreadMs: Math.max(...offsets) - Math.min(...offsets), ...a });
    console.log(`${name.padEnd(4)} ${dist} m: ${a.frames} frames  clock jitter ${a.clockJitterMs.toFixed(2)} ms  behind ${a.behindMs.toFixed(1)} ms  `
      + `kick ${a.kickMm.mean.toFixed(1)} mm (p95 ${a.kickMm.p95.toFixed(1)}, max ${a.kickMm.max.toFixed(1)})  off path ${(a.offPathM.mean * 100).toFixed(1)} cm (p95 ${(a.offPathM.p95 * 100).toFixed(1)})  `
      + `gpu ${before.gpus.map((g) => `${g[0]}:${g[1]}%`).join(' ')} host ${before.load[0]}`);
  }
  report.sent = peer.sent;
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  if (peer) {
    clearInterval(peer.timer);
    peer.ws.close();
  }
  await page.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
await writeFile(join(outDir, 'perf-peers.json'), JSON.stringify(report, null, 1));
console.log(`-> ${join(outDir, 'perf-peers.json')}`);
process.exit(0);
