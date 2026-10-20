/*
 * selftest.js: the tracks server's rules, in plain Node, with no network.
 *
 *   node tracks-api/selftest.js      (npm run test:tracks)
 *
 * The Worker's own fetch handler is called with real Request objects, over
 * the real migrations in migrations/, on node:sqlite standing in for D1
 * (d1sqlite.js, the same stand in the VM runs). It is the calls worker.js
 * makes (prepare, bind, first, all, run) and nothing else, so the SQL under
 * test is the SQL that ships. Then the VM's server, tracks-api/node.js, is
 * started on a scratch file and spoken to over HTTP.
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
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import worker from './worker.js';
import { openD1 } from './d1sqlite.js';
import { startTracks } from './node.js';
import { NO_REVISION, readRevision } from '../edge/node-http.js';
import { Latency, cpuShares, getState, history, liveRooms, mask, openStore, readCpu, readServices, serverReport, sizing, writeMinute } from './metrics.js';
import { writeFixture } from './metrics-fixture.js';
import { collect } from './collect.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function freshEnv() {
  return { DB: openD1(':memory:').DB, ADMIN_SECRET: 'selftest-admin-secret' };
}

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  pass  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

let env = freshEnv();

async function call(method, path, body, headers = {}) {
  const init = { method, headers: { 'cf-connecting-ip': '203.0.113.1', ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  const res = await worker.fetch(new Request(`https://tracks.test${path}`, init), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

/*
 * The tracks routes left with the track builder (the combat-only cut,
 * 2026-10-20). An old tab's uploader retried only 429 and 5xx, so every
 * one of them must be a plain 404, admin or not; the table they wrote
 * stays, with write_counts, the rate limiter every kept route spends from.
 */
console.log('the retired tracks routes');
const admin = { authorization: 'Bearer selftest-admin-secret' };
const retired = [
  ['GET', '/api/tracks', undefined, {}],
  ['GET', '/api/tracks?map=swiss2', undefined, {}],
  ['GET', '/api/tracks/trk-0000a001', undefined, {}],
  ['PUT', '/api/tracks/trk-0000a001', { document: '{}', ts: 1 }, {}],
  ['DELETE', '/api/tracks/trk-0000a001', { ts: 1 }, {}],
  ['POST', '/api/admin/tracks/trk-0000a001', { hidden: true }, admin],
  ['DELETE', '/api/admin/tracks/trk-0000a001', undefined, admin],
];
const answers = [];
for (const [method, path, body, headers] of retired) {
  answers.push(`${method} ${path} ${(await call(method, path, body, headers)).status}`);
}
check('every tracks route, the admin\'s too, answers 404', answers.every((a) => a.endsWith(' 404')), answers.join(', '));
let r = await call('OPTIONS', '/api/tracks/trk-00000001');
check('a preflight is still answered for any origin, without credentials', r.status === 204
  && r.headers.get('access-control-allow-origin') === '*' && !r.headers.get('access-control-allow-credentials'));
const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map((t) => t.name);
check('the tracks table and write_counts are still made', tables.includes('tracks') && tables.includes('write_counts'), tables.join(','));
r = await call('GET', '/api/admin/overview', undefined, admin);
check('and the admin overview still counts the stored tracks', r.status === 200 && r.body.tracks === 0 && r.body.hiddenTracks === 0, JSON.stringify(r.body));

console.log('the VM\'s server, over HTTP (tracks-api/node.js)');
const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-tracks-'));
const dbFile = join(scratch, 'tracks.db');
let server = await startTracks({ db: dbFile, port: 0, adminSecret: 'selftest-admin-secret' });
let base = `http://127.0.0.1:${server.port}`;
async function over(method, path, body, headers = {}) {
  const init = { method, headers: { 'cf-connecting-ip': '192.0.2.1', ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}
r = await over('GET', '/api/health');
check('it answers its health check', r.status === 200 && r.body.ok === true);
check('with the CORS answer the page needs', r.headers.get('access-control-allow-origin') === '*');
r = await over('GET', '/api/version');
check('a checkout has no REVISION, so its version names no commit', r.status === 200 && r.body.commit === null && r.body.dirty === false, JSON.stringify(r.body));
const revisionFile = join(scratch, 'REVISION');
const revisionOf = (text) => {
  writeFileSync(revisionFile, text);
  try {
    return readRevision(revisionFile);
  } catch (e) {
    return e;
  }
};
check('REVISION as deploy/vm/deploy.sh writes it: a commit, or a commit and dirty',
  revisionOf(`${'a'.repeat(40)}\n`).commit === 'a'.repeat(40) && revisionOf(`${'a'.repeat(40)}\n`).dirty === false
  && revisionOf(`${'b'.repeat(40)} dirty\n`).dirty === true);
check('anything else in it stops the server rather than being guessed at', revisionOf('main\n') instanceof Error && revisionOf(`${'a'.repeat(39)}\n`) instanceof Error);
check('and no file is no commit', readRevision(join(scratch, 'none')) === NO_REVISION);
r = await over('GET', '/api/tracks');
check('a retired tracks route is a 404 over HTTP too', r.status === 404, `${r.status}`);
r = await over('POST', '/api/admin/waitlist', { email: 'vm@example.com', approved: false }, admin);
check('an admin write over HTTP is stored', r.status === 200 && r.body.email === 'vm@example.com', JSON.stringify(r.body));
r = await over('POST', '/api/admin/waitlist', 'x'.repeat(1024 * 1024), admin);
check('a body over the cap is refused, streamed through the bridge', r.status === 413, `${r.status}`);
r = await over('GET', '/api/admin/waitlist', undefined, { authorization: 'Bearer wrong' });
check('a wrong admin secret is refused', r.status === 401);
await server.stop();
server = await startTracks({ db: dbFile, port: 0, adminSecret: 'selftest-admin-secret', revision: revisionOf(`${'c'.repeat(40)} dirty\n`) });
base = `http://127.0.0.1:${server.port}`;
r = await over('GET', '/api/version');
check('a deployed server answers the commit it started on', r.status === 200 && r.body.commit === 'c'.repeat(40) && r.body.dirty === true, JSON.stringify(r.body));
r = await over('GET', '/api/admin/waitlist', undefined, admin);
check('what was written is still there after a restart', r.status === 200 && r.body.waitlist.some((w) => w.email === 'vm@example.com'), JSON.stringify(r.body));
const applied = openD1(dbFile).db;
const migrations = readdirSync(join(HERE, 'migrations')).filter((f) => f.endsWith('.sql')).length;
check('a restart applies no migration twice', applied.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get().n === migrations);
applied.close();
await server.stop();

/* The shape `wrangler d1 export` writes: d1_migrations already counting
 * the migration, then the tables. It must open with nothing reapplied. */
const exported = join(scratch, 'exported.db');
const d1db = new DatabaseSync(exported);
d1db.exec(`CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
  INSERT INTO d1_migrations (name) VALUES ('0001_tracks.sql');`);
d1db.exec(readFileSync(join(HERE, 'migrations', '0001_tracks.sql'), 'utf8'));
d1db.close();
let opened = null;
try {
  opened = openD1(exported);
} catch (e) {
  opened = null;
}
check('a D1 export opens with its migrations already counted', opened !== null);
opened?.db.close();

/* The admin page's Server section (metrics.js, collect.js). */
console.log('\nserver metrics');
env = freshEnv();
r = await call('GET', '/api/admin/server', undefined, { authorization: 'Bearer selftest-admin-secret' });
check('the Worker, with no VM behind it, has no server route', r.status === 404, `${r.status}`);
check('a log line loses its addresses but keeps its clock', mask('from 84.12.127.189 port 22 at 07:43:17') === 'from 84.12.x.x port 22 at 07:43:17', mask('from 84.12.127.189 port 22 at 07:43:17'));
check('and an IPv6 and an email', mask('2804:14c:5b:8000::1 a@b.com') === '2804:x:x *@b.com', mask('2804:14c:5b:8000::1 a@b.com'));
const shares = cpuShares(readCpu('cpu 100 0 50 800 10 0 0 40'), readCpu('cpu 160 0 70 900 10 0 0 60'));
check('CPU shares come from the deltas, steal its own', Math.abs(shares.user - 0.3) < 1e-9 && Math.abs(shares.steal - 0.1) < 1e-9 && Math.abs(shares.busy - 0.5) < 1e-9, JSON.stringify(shares));
let latClock = 0;
const lat = new Latency(() => latClock);
for (let i = 1; i <= 100; i += 1) {
  lat.record('tracks', i, i === 100 ? 500 : 200);
}
latClock = 61 * 60000;
lat.record('tracks', 7, 200);
const lr = lat.report(60);
check('latency keeps an hour of minutes and counts errors', lr.tracks.count === 1 && lr.tracks.p95 === 7, JSON.stringify(lr));
const lat2 = new Latency(() => 0);
for (let i = 1; i <= 100; i += 1) {
  lat2.record('tracks', i, i === 100 ? 500 : 200);
}
const l2 = lat2.report(1).tracks;
check('and its quantiles are of the timings', l2.p50 === 51 && l2.p95 === 96 && l2.errors === 1, JSON.stringify(l2));
const store = openStore(':memory:');
for (let m = 0; m < 15; m += 1) {
  writeMinute(store, 900 * 1000 + m * 60, { x: m });
}
const q = store.prepare('SELECT avg, max FROM samples WHERE res = 900 AND key = ?').get('x');
check('a quarter hour is the mean and the peak of its minutes', q.avg === 7 && q.max === 14, JSON.stringify(q));
writeMinute(store, 900 * 1000 + 49 * 3600, { x: 1 });
check('minutes past 48 hours are dropped', store.prepare('SELECT COUNT(*) AS n FROM samples WHERE res = 60').get().n === 1);
store.close();
const fixture = join(scratch, 'metrics.db');
const fixNow = 2000000000;
writeFixture(fixture, { days: 10, nowS: fixNow });
const fx = openStore(fixture, { readOnly: true });
const sz = sizing(fx, fixNow);
check('disk growth is fitted from the hours', sz.disk.growing && Math.abs(sz.disk.perWeek - 7 * 40 * 1024 ** 2) < 1024 ** 2, JSON.stringify(sz.disk));
check('pilots per core is measured once there are minutes with pilots', sz.pilots.from === 'measured' && sz.pilots.atWall > 50 && sz.pilots.atWall < 120, JSON.stringify(sz.pilots));
const h7 = history(fx, '7d', fixNow);
check('a week is quarter hours, by column', h7.res === 900 && h7.ts.length > 600 && h7.avg['cpu.busy'].length === h7.ts.length && !h7.avg['size.postgres']);
fx.close();
server = await startTracks({ db: ':memory:', port: 0, adminSecret: 'selftest-admin-secret', metricsDb: fixture });
base = `http://127.0.0.1:${server.port}`;
r = await over('GET', '/api/admin/server');
check('the server report needs the admin', r.status === 401);
r = await over('GET', '/api/admin/server?range=1h', undefined, { authorization: 'Bearer selftest-admin-secret' });
check('and gives it the host live, the latency and the store', r.status === 200 && r.body.host.mem.total > 0 && r.body.latency.m60.all.count >= 1 && r.body.snapshot && r.body.sizing && Array.isArray(r.body.logs), JSON.stringify(r.body).slice(0, 300));
const collected = openStore(join(scratch, 'collected.db'));
const sampleUrl = `http://127.0.0.1:${server.port}`;
const v = await collect({ store: collected, secret: 'selftest-admin-secret', tracks: sampleUrl, rooms: 'http://127.0.0.1:9', board: 'http://127.0.0.1:9', paths: { scratch }, readJournal: () => ({ counts: { 'log.sshd': 2, 'log.err': 2 }, lines: [{ at: '', unit: 'sshd', level: 'err', text: 'x' }], cursor: 'c1', read: true }) });
check('the collector writes a minute: CPU, memory, disk, the tracks latency, the journal', v['cpu.busy'] >= 0 && v['mem.total'] > 0 && v['disk.total'] > 0 && v['lat.count'] >= 1 && v['log.sshd'] === 2 && v['size.scratch'] > 0, JSON.stringify(v).slice(0, 300));
check('and keeps its counters and cursor for the next', getState(collected, 'raw').cpu.total > 0 && getState(collected, 'journalCursor') === 'c1');
collected.close();
await server.stop();

/* The rooms server's live instance (/etc/fdfpv/rooms-live): the stubs
 * answer as the rooms server does, each with its VM port as pilots. They
 * listen on free ports, and fetch is routed from the VM port to its stub:
 * binding 8797/8798 here failed the check whenever anything else on the
 * box held one (another project's server did, 2026-10-15). */
console.log('\nrooms live instance');
const stubs = [];
const stubAt = new Map();
for (const port of [8797, 8798]) {
  const stub = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url === '/v2/admin/health' ? { pilots: port, rooms: 1 } : { commit: 'stub' }));
  });
  await new Promise((resolve, reject) => stub.once('error', reject).listen(0, '127.0.0.1', resolve));
  stubs.push(stub);
  stubAt.set(`http://127.0.0.1:${port}`, `http://127.0.0.1:${stub.address().port}`);
}
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const u = new URL(url);
  return realFetch(stubAt.has(u.origin) ? `${stubAt.get(u.origin)}${u.pathname}${u.search}` : url, init);
};
const liveFile = join(scratch, 'rooms-live');
const noRooms = { counts: {}, lines: [], cursor: null, read: false };
const probe = async (file) => collect({ store: openStore(':memory:'), roomsLiveFile: file, tracks: 'http://127.0.0.1:9', board: 'http://127.0.0.1:9', paths: {}, readJournal: () => noRooms });
writeFileSync(liveFile, '8798\n');
check('the live file names the instance and its unit', JSON.stringify(liveRooms(liveFile)) === JSON.stringify({ port: 8798, unit: 'fdfpv-rooms@8798' }), JSON.stringify(liveRooms(liveFile)));
check('the collector probes the instance the file names', (await probe(liveFile)).pilots === 8798);
const reported = await serverReport({ latency: new Latency(), roomsLiveFile: liveFile, liveMs: 10 }).report('1h');
check('and so does the server report', reported.roomsLive.unit === 'fdfpv-rooms@8798' && reported.rooms.pilots === 8798 && reported.versions.rooms.commit === 'stub', JSON.stringify(reported.roomsLive));
const absent = join(scratch, 'no-such-file');
check('with no file, it is the one unit fdfpv-rooms on 8797', JSON.stringify(liveRooms(absent)) === JSON.stringify({ port: 8797, unit: 'fdfpv-rooms' }));
check('and the collector probes 8797', (await probe(absent)).pilots === 8797);
const absentReport = await serverReport({ latency: new Latency(), roomsLiveFile: absent, liveMs: 10 }).report('1h');
check('and so does the report', absentReport.roomsLive.unit === 'fdfpv-rooms' && absentReport.rooms.pilots === 8797);
/* A directory in the file's place is a read that fails with something other than "not there". */
const unreadable = join(scratch, 'rooms-live-dir');
mkdirSync(unreadable);
writeFileSync(liveFile, '8799\n');
check('a file that cannot be read is an error, not a guess', /could not be read: EISDIR/.test(liveRooms(unreadable).error || '') && !liveRooms(unreadable).port, JSON.stringify(liveRooms(unreadable)));
check('and one naming another port is an error too', /not 8797 or 8798/.test(liveRooms(liveFile).error || ''), JSON.stringify(liveRooms(liveFile)));
const broken = await probe(unreadable);
check('the collector then probes no rooms server and still writes its minute', broken.pilots === undefined && broken['probe.rooms'] === null && broken['cpu.busy'] >= 0, JSON.stringify(broken).slice(0, 200));
const brokenReport = await serverReport({ latency: new Latency(), roomsLiveFile: unreadable, liveMs: 10 }).report('1h');
check('and the report carries the error with no rooms numbers', /EISDIR/.test(brokenReport.roomsLive.error) && brokenReport.rooms === null && brokenReport.host.mem.total > 0, JSON.stringify(brokenReport.roomsLive));
globalThis.fetch = realFetch;
for (const stub of stubs) {
  await new Promise((resolve) => stub.close(resolve));
}
const cg = join(scratch, 'cgroup');
const instance = join(cg, 'system-fdfpv\\x2drooms.slice', 'fdfpv-rooms@8798.service');
mkdirSync(instance, { recursive: true });
mkdirSync(join(cg, 'caddy.service'));
for (const [dir, mem] of [[instance, '1048576'], [join(cg, 'caddy.service'), '2048']]) {
  writeFileSync(join(dir, 'memory.current'), `${mem}\n`);
  writeFileSync(join(dir, 'memory.max'), 'max\n');
  writeFileSync(join(dir, 'cpu.stat'), 'usage_usec 5\n');
}
check('a template instance in its slice is a service of its own', readServices(cg).map((x) => x.unit).sort().join() === 'caddy,fdfpv-rooms@8798', JSON.stringify(readServices(cg).map((x) => x.unit)));
rmSync(scratch, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
