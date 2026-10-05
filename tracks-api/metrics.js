/*
 * metrics.js: what the VM is doing, for the admin page's Server section
 * (admin.html). Node only: worker.js never imports it, node.js hands its
 * report to the Worker's routes as env.SERVER, so the Cloudflare build has
 * none of it and answers 404 there.
 *
 * Three parts:
 *
 *   - readers of the kernel's own counters (/proc, /sys/fs/cgroup), which
 *     every user may read, so the tracks server reads them live under its
 *     sandbox (ProtectControlGroups and ProtectKernelTunables make them
 *     read only, not hidden);
 *   - Latency, this process's request timings per route group, a minute
 *     a bucket for the last hour, in memory;
 *   - the history store, one long table (res, ts, key, avg, max), written
 *     once a minute by tracks-api/collect.js (fdfpv-metrics.timer, which
 *     also reads what the tracks sandbox may not: the journal, the private
 *     state directories, systemctl) and read here. Every key is a gauge or
 *     a per second or per minute rate, so a coarser row is the mean and the
 *     peak of the finer ones and downsampling is one GROUP BY.
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

import { readFileSync, readdirSync, statfsSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/* The units the panel names; any other service on the VM is listed too,
 * but only these get a line in the history. */
export const UNITS = ['fdfpv-rooms', 'fdfpv-tracks', 'fdfpv-board', 'caddy', 'postgresql', 'coturn'];
const CGROUPS = '/sys/fs/cgroup/system.slice';

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/* /proc/stat's first line in clock ticks: user and nice are user, system,
 * irq and softirq are sys. Steal is time the hypervisor gave this VM's
 * core to somebody else, the number a shared one core VM lives by. */
export function readCpu(text = read('/proc/stat')) {
  const f = text.split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const [user, nice, system, idle, iowait, irq, softirq, steal] = f;
  return { user: user + nice, sys: system + irq + softirq, idle, iowait, steal, total: f.slice(0, 8).reduce((a, b) => a + b, 0) };
}

/* Fractions of the core between two readCpu. */
export function cpuShares(a, b) {
  const t = b.total - a.total;
  if (t <= 0) {
    return { user: 0, sys: 0, iowait: 0, steal: 0, idle: 1, busy: 0 };
  }
  const s = (k) => Math.max(0, b[k] - a[k]) / t;
  return { user: s('user'), sys: s('sys'), iowait: s('iowait'), steal: s('steal'), idle: s('idle'), busy: 1 - s('idle') };
}

/* Bytes. used is what top calls used: total less free, buffers and cache. */
export function readMemory(text = read('/proc/meminfo')) {
  const kb = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^(\w+\(?\w*\)?):\s+(\d+)/);
    if (m) {
      kb[m[1]] = Number(m[2]) * 1024;
    }
  }
  const cache = (kb.Cached || 0) + (kb.Buffers || 0) + (kb.SReclaimable || 0);
  return {
    total: kb.MemTotal, available: kb.MemAvailable, cache,
    used: kb.MemTotal - kb.MemFree - cache,
    swapTotal: kb.SwapTotal, swapUsed: kb.SwapTotal - kb.SwapFree,
  };
}

export function readLoad(text = read('/proc/loadavg')) {
  const [l1, l5, l15] = text.split(/\s+/).map(Number);
  return { l1, l5, l15 };
}

export function readUptime(text = read('/proc/uptime')) {
  return Number(text.split(/\s+/)[0]);
}

/* Bytes in and out of every interface but loopback, since boot. */
export function readNet(text = read('/proc/net/dev')) {
  let rx = 0;
  let tx = 0;
  for (const line of text.split('\n').slice(2)) {
    const m = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (!m || m[1] === 'lo') {
      continue;
    }
    const f = m[2].trim().split(/\s+/).map(Number);
    rx += f[0];
    tx += f[8];
  }
  return { rx, tx };
}

export function readDisk(path = '/') {
  const s = statfsSync(path);
  return {
    total: s.blocks * s.bsize, free: s.bavail * s.bsize, used: (s.blocks - s.bfree) * s.bsize,
    inodes: s.files, inodesUsed: s.files - s.ffree,
  };
}

/* Established TCP connections whose local port is `port`: the pilots' and
 * pages' sockets through Caddy. Addresses are not kept, only the count. */
export function countConnections(port = 443, files = ['/proc/net/tcp', '/proc/net/tcp6']) {
  const hex = port.toString(16).toUpperCase().padStart(4, '0');
  let n = 0;
  for (const f of files) {
    for (const line of (read(f) || '').split('\n').slice(1)) {
      const p = line.trim().split(/\s+/);
      if (p[1] && p[1].endsWith(`:${hex}`) && p[3] === '01') {
        n += 1;
      }
    }
  }
  return n;
}

/* Every service's cgroup: memory now, its ceiling, its peak, and CPU
 * seconds since it started. */
export function readServices(root = CGROUPS) {
  if (!existsSync(root)) {
    return [];
  }
  const out = [];
  for (const dir of readdirSync(root)) {
    if (!dir.endsWith('.service')) {
      continue;
    }
    const at = (f) => read(`${root}/${dir}/${f}`);
    const cur = Number(at('memory.current'));
    if (!Number.isFinite(cur)) {
      continue;
    }
    const max = (at('memory.max') || '').trim();
    const usage = (at('cpu.stat') || '').match(/usage_usec (\d+)/);
    out.push({
      unit: dir.replace(/\.service$/, ''),
      mem: cur,
      max: max && max !== 'max' ? Number(max) : null,
      peak: Number(at('memory.peak')) || null,
      cpuUs: usage ? Number(usage[1]) : 0,
    });
  }
  return out;
}

/* One reading of every counter; rates come from two of them. */
export function snapshot() {
  return {
    at: Date.now(), cpu: readCpu(), mem: readMemory(), load: readLoad(), uptimeS: readUptime(),
    net: readNet(), disk: readDisk('/'), conns: countConnections(), services: readServices(),
  };
}

/* The rates between two snapshots: CPU shares, network bytes a second,
 * each service's share of the core. */
export function rates(a, b) {
  const s = Math.max(0.001, (b.at - a.at) / 1000);
  const before = new Map(a.services.map((x) => [x.unit, x]));
  return {
    cpu: cpuShares(a.cpu, b.cpu),
    rxPerS: Math.max(0, b.net.rx - a.net.rx) / s,
    txPerS: Math.max(0, b.net.tx - a.net.tx) / s,
    services: b.services.map((x) => ({
      ...x, cpu: before.has(x.unit) ? Math.max(0, x.cpuUs - before.get(x.unit).cpuUs) / 1e6 / s : null,
    })),
  };
}

/* Addresses and emails out of a log line: an IPv4 keeps its first two
 * parts, an IPv6 its first group, an email its domain. The journal keeps
 * the whole line on the VM; the panel shows what kind of thing happened,
 * never who (privacy.html, Addresses and logs). */
export function mask(text) {
  return String(text)
    .replace(/[\w.+-]+@([\w-]+\.[\w.-]+)/g, '*@$1')
    .replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.$2.x.x')
    /* An IPv6 has a :: or at least four colons, which a clock time never does. */
    .replace(/\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7}/gi, (m) => (m.includes('::') || m.split(':').length > 4 ? `${m.split(':')[0]}:x:x` : m));
}

/*
 * Latency: request timings by route group, one bucket a minute for an
 * hour. A bucket keeps at most SAMPLE_CAP timings (the first ones) and
 * counts every request, so a burst costs bounded memory and the counts
 * stay exact.
 */
const SAMPLE_CAP = 2000;
const BUCKETS = 60;

export function routeGroup(path) {
  const m = path.match(/^\/api\/(tracks|account|admin|waitlist|health|version)/);
  return m ? (m[1] === 'version' ? 'health' : m[1]) : 'other';
}

function quantile(sorted, q) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null;
}

export class Latency {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.buckets = new Map(); /* group -> [{ minute, ms: [], count, errors }] */
  }

  record(group, ms, status) {
    const minute = Math.floor(this.now() / 60000);
    const list = this.buckets.get(group) || [];
    let b = list[list.length - 1];
    if (!b || b.minute !== minute) {
      b = { minute, ms: [], count: 0, errors: 0 };
      list.push(b);
      while (list.length && list[0].minute <= minute - BUCKETS) {
        list.shift();
      }
      this.buckets.set(group, list);
    }
    b.count += 1;
    b.errors += status >= 500 ? 1 : 0;
    if (b.ms.length < SAMPLE_CAP) {
      b.ms.push(ms);
    }
  }

  /* { group: { count, errors, errorRate, p50, p95, p99 } } over the last
   * `minutes`, the current minute included; groups with no request left out. */
  report(minutes) {
    const from = Math.floor(this.now() / 60000) - minutes + 1;
    const out = {};
    for (const [group, list] of this.buckets) {
      const w = list.filter((b) => b.minute >= from);
      const count = w.reduce((a, b) => a + b.count, 0);
      if (!count) {
        continue;
      }
      const errors = w.reduce((a, b) => a + b.errors, 0);
      const ms = w.flatMap((b) => b.ms).sort((a, b) => a - b);
      const r = (v) => Math.round(v * 10) / 10;
      out[group] = { count, errors, errorRate: errors / count, p50: r(quantile(ms, 0.5)), p95: r(quantile(ms, 0.95)), p99: r(quantile(ms, 0.99)) };
    }
    return out;
  }
}

/*
 * The history store. res is the row's span in seconds (60, 900, 3600),
 * ts the span's start in Unix seconds. Kept: minutes 48 hours, quarter
 * hours 90 days, hours forever (about 30 keys, so some 260,000 rows and a
 * dozen MB a year). Rollback journal, not WAL: the tracks server opens it
 * read only as another user, and a WAL reader needs to write the -shm file.
 */
export const KEEP_S = { 60: 48 * 3600, 900: 90 * 86400 };
export const RANGES = { '1h': [3600, 60], '24h': [86400, 60], '7d': [7 * 86400, 900], '30d': [30 * 86400, 3600] };

export function openStore(path, { readOnly = false } = {}) {
  const db = new DatabaseSync(path, readOnly ? { readOnly: true } : {});
  if (!readOnly) {
    db.exec(`CREATE TABLE IF NOT EXISTS samples (
      res INTEGER NOT NULL, ts INTEGER NOT NULL, key TEXT NOT NULL, avg REAL NOT NULL, max REAL NOT NULL,
      PRIMARY KEY (res, ts, key)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT NOT NULL);`);
  }
  return db;
}

/* One minute's values, { key: number }, at minute start ts; then the
 * quarter hour and the hour that minute belongs to are made again from
 * the minutes, and what is past its keep is dropped. */
export function writeMinute(db, ts, values) {
  const put = db.prepare('INSERT OR REPLACE INTO samples (res, ts, key, avg, max) VALUES (60, ?, ?, ?, ?)');
  const roll = db.prepare(`INSERT OR REPLACE INTO samples (res, ts, key, avg, max)
    SELECT ?, ?, key, AVG(avg), MAX(max) FROM samples WHERE res = 60 AND ts >= ? AND ts < ? GROUP BY key`);
  db.exec('BEGIN');
  try {
    for (const [key, v] of Object.entries(values)) {
      if (Number.isFinite(v)) {
        put.run(ts, key, v, v);
      }
    }
    for (const res of [900, 3600]) {
      const start = ts - (ts % res);
      roll.run(res, start, start, start + res);
    }
    for (const [res, keep] of Object.entries(KEEP_S)) {
      db.prepare('DELETE FROM samples WHERE res = ? AND ts < ?').run(Number(res), ts - keep);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getState(db, k) {
  const row = db.prepare('SELECT v FROM state WHERE k = ?').get(k);
  return row ? JSON.parse(row.v) : null;
}

export function setState(db, k, v) {
  db.prepare('INSERT OR REPLACE INTO state (k, v) VALUES (?, ?)').run(k, JSON.stringify(v));
}

/* One RANGES name's rows, by column: { res, from, to, ts: [...],
 * avg: { key: [...] }, max: { key: [...] } }, each key's list in step with
 * ts (null where that span has no value). A minute's max is its avg, so
 * max is sent only for the coarser rows. Four significant figures, and
 * the keys no chart draws left out: a day of minutes is still some 40,000
 * numbers. */
const UNCHARTED = /^(size\.|lat\.count|svc\..*\.cpu|mem\.available|disk\.total|load1)/;

export function history(db, range, nowS = Math.floor(Date.now() / 1000)) {
  const [span, res] = RANGES[range] || RANGES['24h'];
  const short = (x) => Number(x.toPrecision(4));
  const rows = db.prepare('SELECT ts, key, avg, max FROM samples WHERE res = ? AND ts >= ? ORDER BY ts').all(res, nowS - span)
    .filter((r) => !UNCHARTED.test(r.key));
  const ts = [...new Set(rows.map((r) => r.ts))];
  const at = new Map(ts.map((t, i) => [t, i]));
  const avg = {};
  const max = {};
  for (const r of rows) {
    (avg[r.key] ||= new Array(ts.length).fill(null))[at.get(r.ts)] = short(r.avg);
    if (res > 60) {
      (max[r.key] ||= new Array(ts.length).fill(null))[at.get(r.ts)] = short(r.max);
    }
  }
  return { res, from: nowS - span, to: nowS, ts, avg, max };
}

function pct(values, q) {
  return quantile([...values].sort((a, b) => a - b), q);
}

/* Least squares slope and intercept of y on x. */
function fit(points) {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p[0], 0) / n;
  const my = points.reduce((a, p) => a + p[1], 0) / n;
  const sxx = points.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  const sxy = points.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
  const slope = sxx ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

/*
 * The sizing card's numbers, from the history alone. Thresholds:
 *   - CPU: the rooms' valve closes near 80% of the core (edge/rooms/
 *     health.js BUSY_CPU), so 80% is the core's wall, steal included,
 *     because stolen time is time the rooms do not get;
 *   - RAM: 85% of the total in use, past which the page cache that keeps
 *     Postgres fast is what goes;
 *   - disk: 90% full.
 * Pilots per core: the slope of CPU busy on pilots online, from minutes
 * with pilots, once there are SLOPE_MIN of them; until then the soak of
 * 2026-09-28 (deploy/vm/README.md: 32 pilots in four rooms, the whole VM
 * at 27%, so 0.27 / 32 a pilot).
 */
export const CPU_WALL = 0.8;
export const RAM_WALL = 0.85;
export const DISK_WALL = 0.9;
const SOAK_PER_PILOT = 0.27 / 32;
const SLOPE_MIN = 60;
const GROWTH_MIN_S = 7 * 86400;

export function sizing(db, nowS = Math.floor(Date.now() / 1000)) {
  const rows = (res, key, since) => db.prepare('SELECT ts, avg, max FROM samples WHERE res = ? AND key = ? AND ts >= ? ORDER BY ts').all(res, key, since);
  const month = nowS - 30 * 86400;
  /* Peaks from the minutes while they last, then the quarter hours. */
  const minutes = (key) => rows(60, key, nowS - 48 * 3600);
  const quarters = (key) => rows(900, key, month);
  const both = (key) => [...quarters(key).map((r) => r.max), ...minutes(key).map((r) => r.max)];
  const busy = quarters('cpu.busy').map((r) => r.avg);
  const busyPeak = both('cpu.busy');
  const steal = quarters('cpu.steal').map((r) => r.avg);
  const memTotal = (rows(60, 'mem.total', nowS - 3600).pop() || {}).avg || null;
  const memUsed = both('mem.used');
  const swap = both('swap.used');
  const diskTotal = (rows(60, 'disk.total', nowS - 3600).pop() || {}).avg || null;
  const disk = rows(3600, 'disk.used', month);
  const pilots = rows(60, 'pilots', nowS - 48 * 3600);
  const span = (list) => (list.length > 1 ? list[list.length - 1].ts - list[0].ts : 0);

  const out = {
    samples: { quarters: busy.length, minutes: minutes('cpu.busy').length, hours: disk.length, spanS: span(rows(3600, 'cpu.busy', 0)) },
    cpu: busy.length ? { p95: pct(busy, 0.95), peak: Math.max(...busyPeak), stealP95: pct(steal, 0.95), wall: CPU_WALL } : null,
    ram: memTotal && memUsed.length ? { total: memTotal, p95: pct(memUsed, 0.95), peak: Math.max(...memUsed), swapPeak: swap.length ? Math.max(...swap) : 0, wall: RAM_WALL } : null,
    disk: null,
    pilots: null,
  };
  const last = disk[disk.length - 1];
  if (diskTotal && last) {
    const enough = span(disk) >= GROWTH_MIN_S;
    const perDay = enough ? fit(disk.map((r) => [r.ts / 86400, r.avg])).slope : null;
    const room = diskTotal * DISK_WALL - last.avg;
    out.disk = {
      total: diskTotal, used: last.avg, perWeek: perDay == null ? null : perDay * 7,
      daysToWall: perDay > 0 ? room / perDay : null, growing: perDay == null ? null : perDay > 0, wall: DISK_WALL,
    };
  }
  /* Minutes with pilots, CPU busy against the count. */
  const busyAt = new Map(minutes('cpu.busy').map((r) => [r.ts, r.avg]));
  const flown = pilots.filter((r) => r.avg > 0 && busyAt.has(r.ts)).map((r) => [r.avg, busyAt.get(r.ts)]);
  const quiet = pilots.filter((r) => r.avg === 0 && busyAt.has(r.ts)).map((r) => busyAt.get(r.ts));
  const base = quiet.length ? pct(quiet, 0.5) : busy.length ? pct(busy, 0.5) : 0;
  const measured = flown.length >= SLOPE_MIN ? fit(flown).slope : null;
  const perPilot = measured && measured > 0 ? measured : SOAK_PER_PILOT;
  out.pilots = {
    perPilot, from: measured && measured > 0 ? 'measured' : 'soak', minutesFlown: flown.length, base,
    peak: pilots.length ? Math.max(...pilots.map((r) => r.max)) : 0,
    atWall: Math.max(0, Math.floor((CPU_WALL - base) / perPilot)),
  };
  return out;
}

async function getJson(url, headers = {}) {
  const t = performance.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
    return { ms: performance.now() - t, status: res.status, body: res.ok ? await res.json().catch(() => null) : null };
  } catch (e) {
    return { ms: null, status: 0, body: null };
  }
}

/*
 * The tracks server's half: env.SERVER, what node.js hands worker.js.
 * report(range) is the admin page's whole Server section; sample() is the
 * collector's minute of latency. The store is opened read only for each
 * report and closed after, so a collector that has not run yet, or a
 * store being written, costs one refused open and nothing else.
 */
export function serverReport({ metricsDb = '', latency, secret = '', revision = null, rooms = 'http://127.0.0.1:8797', board = 'http://127.0.0.1:3180', liveMs = 1000 }) {
  async function live() {
    const a = snapshot();
    await new Promise((r) => setTimeout(r, liveMs));
    const b = snapshot();
    const r = rates(a, b);
    return { ...b, cpu: r.cpu, rxPerS: r.rxPerS, txPerS: r.txPerS, services: r.services.sort((x, y) => y.mem - x.mem) };
  }
  function stored(range) {
    if (!metricsDb || !existsSync(metricsDb)) {
      return { error: 'No history yet: the collector (fdfpv-metrics.timer) has not written its store.' };
    }
    let db;
    try {
      db = openStore(metricsDb, { readOnly: true });
      const snap = getState(db, 'snapshot');
      return { snapshot: snap, logs: getState(db, 'logs') || [], history: history(db, range), sizing: sizing(db) };
    } catch (e) {
      return { error: `The history could not be read: ${e.message}` };
    } finally {
      db?.close();
    }
  }
  return {
    sample: () => ({ latency: latency.report(1) }),
    async report(range) {
      const auth = secret ? { authorization: `Bearer ${secret}` } : {};
      const [host, roomsHealth, roomsVersion, boardVersion] = await Promise.all([
        live(), getJson(`${rooms}/v2/admin/health`, auth), getJson(`${rooms}/v2/version`), getJson(`${board}/api/version`),
      ]);
      return {
        range: RANGES[range] ? range : '24h',
        host,
        latency: { m1: latency.report(1), m5: latency.report(5), m60: latency.report(60) },
        rooms: roomsHealth.body,
        versions: { tracks: revision, rooms: roomsVersion.body, board: boardVersion.body },
        ...stored(range),
      };
    },
  };
}
