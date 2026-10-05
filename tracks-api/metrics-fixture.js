/*
 * metrics-fixture.js: a made up metrics store (tracks-api/metrics.js) with
 * weeks of history, for the selftest and for looking at the admin page's
 * Server section without a VM:
 *
 *   node tracks-api/metrics-fixture.js /path/to/metrics.db [days]
 *
 * The numbers are shaped like the VM's (deploy/vm/README.md): one core
 * mostly idle with evening flying, 5.6 GB with about 0.9 used, 30 GB with
 * 12 used and growing, a few pilots at night. Nothing here is a reading.
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

import { pathToFileURL } from 'node:url';
import { UNITS, openStore, setState, writeMinute } from './metrics.js';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/* A repeatable noise source, so two fixtures are the same fixture. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/* The minute at Unix second ts: pilots in the evening (UTC-3). */
export function minuteAt(ts, start, rand) {
  const hour = ((ts / 3600) - 3 + 24) % 24;
  const evening = Math.max(0, Math.sin(((hour - 14) / 10) * Math.PI));
  const pilots = Math.round(evening * 14 * rand());
  const busy = Math.min(0.95, 0.02 + pilots * 0.0085 + rand() * 0.02);
  const steal = 0.002 + rand() * 0.006;
  const days = (ts - start) / 86400;
  const v = {
    'cpu.user': busy * 0.6, 'cpu.sys': busy * 0.3, 'cpu.iowait': busy * 0.05, 'cpu.steal': steal, 'cpu.busy': busy + steal,
    load1: busy * 1.3,
    'mem.total': 5.6 * GB, 'mem.used': 0.85 * GB + pilots * 4 * MB + rand() * 60 * MB, 'mem.available': 4.7 * GB,
    'mem.cache': 2.3 * GB, 'swap.used': 147 * MB,
    'disk.total': 30 * GB, 'disk.used': 12 * GB + days * 40 * MB,
    'net.rx': 2000 + pilots * 3000 * rand(), 'net.tx': 3000 + pilots * 9000 * rand(), conns: 3 + pilots,
    'probe.tracks': 1 + rand(), 'probe.rooms': 1 + rand(), 'probe.board': 2 + rand() * 3,
    pilots, rooms: Math.ceil(pilots / 6), 'rooms.lagP99': 3 + pilots * 0.3,
    'lat.p95': 4 + rand() * 6 + (rand() < 0.01 ? 80 : 0), 'lat.count': 2 + Math.round(rand() * 10),
    'log.warn': rand() < 0.05 ? 2 : 0, 'log.err': rand() < 0.01 ? 1 : 0,
    'log.sshd': rand() < 0.05 ? 2 : 0, 'log.fdfpv-rooms': rand() < 0.005 ? 1 : 0,
  };
  for (const [i, u] of UNITS.entries()) {
    v[`svc.${u}.mem`] = (30 + i * 10) * MB + pilots * MB;
    v[`svc.${u}.cpu`] = u === 'fdfpv-rooms' ? pilots * 0.003 : u === 'caddy' ? pilots * 0.002 : 0.002;
  }
  return v;
}

export function writeFixture(path, { days = 21, nowS = Math.floor(Date.now() / 1000) } = {}) {
  const db = openStore(path);
  const rand = rng(7);
  const end = nowS - (nowS % 60);
  const start = end - days * 86400;
  for (let ts = start; ts <= end; ts += 60) {
    writeMinute(db, ts, minuteAt(ts, start, rand));
  }
  setState(db, 'snapshot', {
    at: new Date(end * 1000).toISOString(),
    sizes: { postgres: 67 * MB, tracksDb: 0.9 * MB, roomsDb: 0.2 * MB, journal: 107 * MB, boardCode: 12 * MB, simCode: 180 * MB, caddy: 0.05 * MB, metrics: 9 * MB },
    units: Object.fromEntries(UNITS.map((u, i) => [u, { restarts: i === 2 ? 1 : 0, active: 'active', sinceUtc: new Date((end - (i + 1) * 86400) * 1000).toISOString() }])),
    postgresConnections: 3,
    certificates: { '129.151.39.48': new Date((end + 4 * 86400) * 1000).toISOString(), 'api.paraguayandronecombatsimulator.com': new Date((end + 70 * 86400) * 1000).toISOString() },
    journalRead: true,
    probes: { tracks: true, rooms: true, board: true, roomsHealth: true, tracksSample: true },
  });
  setState(db, 'logs', [
    { at: new Date((end - 3600) * 1000).toISOString(), unit: 'sshd', level: 'err', text: 'error: maximum authentication attempts exceeded for invalid user admin from 84.12.x.x port 52644 ssh2 [preauth]' },
    { at: new Date((end - 600) * 1000).toISOString(), unit: 'fdfpv-rooms', level: 'warn', text: 'a made up warning from the fixture' },
  ]);
  db.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFixture(process.argv[2] || 'metrics.db', { days: Number(process.argv[3] || 21) });
}
