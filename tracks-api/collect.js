/*
 * collect.js: one minute of the VM's history, written to the metrics store
 * (tracks-api/metrics.js) the admin page's charts and sizing card read.
 *
 *   METRICS_DB=/var/lib/fdfpv-metrics/metrics.db ADMIN_SECRET=... node tracks-api/collect.js
 *
 * Run once a minute by fdfpv-metrics.timer (deploy/vm/fdfpv-metrics.service)
 * as its own user, outside the tracks server, because what it reads the
 * tracks server's sandbox rightly cannot: the journal (warnings and errors
 * by service, and the last of them with addresses masked), the sizes of
 * the 0700 state directories (Postgres, tracks.db, rooms.db), systemctl's
 * restart counts and start times, and Caddy's certificates. It writes
 * nothing anywhere but its own store.
 *
 * Rates (CPU shares, network, each service's CPU) are deltas against the
 * raw counters the previous run left in the store; after a gap of more
 * than five minutes, or on the first run, it takes its own second reading
 * one second later instead.
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

import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UNITS, getState, mask, openStore, rates, setState, snapshot, writeMinute } from './metrics.js';

const GAP_MS = 5 * 60 * 1000;
const TAIL = 100;
/* What the panel sizes, beside the disk's own total. */
export const PATHS = {
  postgres: '/var/lib/pgsql',
  tracksDb: '/var/lib/fdfpv-tracks',
  roomsDb: '/var/lib/fdfpv-rooms',
  journal: '/var/log/journal',
  boardCode: '/opt/fdfpv-board',
  simCode: '/opt/fdfpv',
  caddy: '/var/lib/caddy',
  metrics: '/var/lib/fdfpv-metrics',
};
const CERTS = '/var/lib/caddy/.local/share/caddy/certificates';

/* Bytes on disk under path, as du counts them; null when it cannot be read. */
export function du(path) {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return null;
  }
  let n = st.blocks * 512;
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) {
      n += du(join(path, name)) || 0;
    }
  }
  return n;
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/* { unit: { restarts, sinceUtc, active } } from systemctl. */
export function unitStates(units = UNITS) {
  const text = run('systemctl', ['show', '-p', 'Id,NRestarts,ActiveEnterTimestamp,ActiveState', ...units.map((u) => `${u}.service`)]);
  const out = {};
  for (const block of (text || '').split('\n\n')) {
    const f = Object.fromEntries(block.split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    if (!f.Id) {
      continue;
    }
    const since = Date.parse(f.ActiveEnterTimestamp);
    out[f.Id.replace(/\.service$/, '')] = {
      restarts: Number(f.NRestarts) || 0, active: f.ActiveState, sinceUtc: Number.isFinite(since) ? new Date(since).toISOString() : null,
    };
  }
  return out;
}

/* Postgres backends serving a client: the processes whose title names a
 * socket ("[local]") or an address. Counted, never named. */
export function postgresConnections() {
  let n = 0;
  for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (/^postgres: .*(\[local\]|\d+\.\d+\.\d+\.\d+|\()/.test(cmd)) {
        n += 1;
      }
    } catch {
      /* a process that ended between the list and the read */
    }
  }
  return n;
}

/* { name: notAfterUtc } for every certificate Caddy holds. */
export function certificates(root = CERTS) {
  const out = {};
  let issuers = [];
  try {
    issuers = readdirSync(root);
  } catch {
    return out;
  }
  for (const issuer of issuers) {
    for (const name of readdirSync(join(root, issuer))) {
      try {
        const cert = new X509Certificate(readFileSync(join(root, issuer, name, `${name}.crt`)));
        out[name] = new Date(cert.validTo).toISOString();
      } catch {
        /* a directory without its .crt yet */
      }
    }
  }
  return out;
}

function logGroup(e) {
  const unit = String(e._SYSTEMD_UNIT || '').replace(/\.service$/, '');
  if (UNITS.includes(unit)) {
    return unit;
  }
  if (unit.startsWith('sshd') || e.SYSLOG_IDENTIFIER === 'sshd-session' || e.SYSLOG_IDENTIFIER === 'sshd') {
    return 'sshd';
  }
  return e._TRANSPORT === 'kernel' ? 'kernel' : 'other';
}

function message(m) {
  /* journalctl -o json writes a message that is not UTF-8 as its bytes. */
  return Array.isArray(m) ? Buffer.from(m).toString('utf8') : String(m ?? '');
}

/* Warnings and worse since the cursor (or the last two minutes): counts by
 * group and level, the newest lines masked, and the cursor to start from
 * next time. */
export function journal(cursor) {
  const args = ['-p', 'warning', '-o', 'json', '--no-pager', '-q'];
  args.push(...(cursor ? ['--after-cursor', cursor] : ['--since', '-2min']));
  const text = run('journalctl', args);
  const counts = {};
  const lines = [];
  let last = cursor;
  for (const line of (text || '').split('\n')) {
    if (!line) {
      continue;
    }
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const group = logGroup(e);
    const level = Number(e.PRIORITY) <= 3 ? 'err' : 'warn';
    counts[`log.${group}`] = (counts[`log.${group}`] || 0) + 1;
    counts[`log.${level}`] = (counts[`log.${level}`] || 0) + 1;
    lines.push({ at: new Date(Number(e.__REALTIME_TIMESTAMP) / 1000).toISOString(), unit: group, level, text: mask(message(e.MESSAGE)).slice(0, 400) });
    last = e.__CURSOR || last;
  }
  return { counts, lines: lines.slice(-TAIL), cursor: last, read: text != null };
}

async function timed(url, headers = {}) {
  const t = performance.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    const body = res.ok ? await res.json().catch(() => null) : null;
    return { ms: performance.now() - t, ok: res.ok, body };
  } catch {
    return { ms: null, ok: false, body: null };
  }
}

export async function collect({
  store, secret = '', tracks = 'http://127.0.0.1:8787', rooms = 'http://127.0.0.1:8797', board = 'http://127.0.0.1:3180',
  paths = PATHS, units = UNITS, readJournal = journal, now = () => Date.now(),
}) {
  let before = getState(store, 'raw');
  let snap = snapshot();
  if (!before || snap.at - before.at > GAP_MS || snap.at <= before.at) {
    before = snap;
    await new Promise((r) => setTimeout(r, 1000));
    snap = snapshot();
  }
  const r = rates(before, snap);
  const auth = secret ? { authorization: `Bearer ${secret}` } : {};
  const [pTracks, pRooms, pBoard, health, sample] = await Promise.all([
    timed(`${tracks}/api/health`), timed(`${rooms}/v2/version`), timed(`${board}/api/health`),
    timed(`${rooms}/v2/admin/health`, auth), timed(`${tracks}/api/admin/server/sample`, auth),
  ]);
  const log = readJournal(getState(store, 'journalCursor'));
  const sizes = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, du(p)]));

  const v = {
    'cpu.user': r.cpu.user, 'cpu.sys': r.cpu.sys, 'cpu.iowait': r.cpu.iowait, 'cpu.steal': r.cpu.steal, 'cpu.busy': r.cpu.busy,
    load1: snap.load.l1,
    'mem.total': snap.mem.total, 'mem.used': snap.mem.used, 'mem.available': snap.mem.available, 'mem.cache': snap.mem.cache,
    'swap.used': snap.mem.swapUsed,
    'disk.total': snap.disk.total, 'disk.used': snap.disk.used,
    'net.rx': r.rxPerS, 'net.tx': r.txPerS, conns: snap.conns,
    'probe.tracks': pTracks.ms, 'probe.rooms': pRooms.ms, 'probe.board': pBoard.ms,
    'log.warn': 0, 'log.err': 0, ...log.counts,
  };
  if (health.body) {
    v.pilots = health.body.pilots;
    v.rooms = health.body.rooms;
    v['rooms.lagP99'] = health.body.s60 ? health.body.s60.lagP99Ms : null;
  }
  const all = sample.body && sample.body.latency && sample.body.latency.all;
  if (all) {
    v['lat.p95'] = all.p95;
    v['lat.count'] = all.count;
  }
  for (const s of r.services.filter((x) => units.includes(x.unit))) {
    v[`svc.${s.unit}.mem`] = s.mem;
    v[`svc.${s.unit}.cpu`] = s.cpu;
  }
  for (const [k, b] of Object.entries(sizes)) {
    v[`size.${k}`] = b;
  }
  const ts = Math.floor(now() / 60000) * 60;
  writeMinute(store, ts, v);
  setState(store, 'raw', snap);
  if (log.read) {
    setState(store, 'journalCursor', log.cursor);
    const tail = [...(getState(store, 'logs') || []), ...log.lines].slice(-TAIL);
    setState(store, 'logs', tail);
  }
  setState(store, 'snapshot', {
    at: new Date(snap.at).toISOString(), sizes, units: unitStates(units), postgresConnections: postgresConnections(),
    certificates: certificates(), journalRead: log.read,
    probes: { tracks: pTracks.ok, rooms: pRooms.ok, board: pBoard.ok, roomsHealth: Boolean(health.body), tracksSample: Boolean(sample.body) },
  });
  return v;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = openStore(process.env.METRICS_DB || 'metrics.db');
  try {
    await collect({ store, secret: process.env.ADMIN_SECRET || '' });
  } finally {
    store.close();
  }
}
