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

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import worker from './worker.js';
import { openD1 } from './d1sqlite.js';
import { startTracks } from './node.js';
import { NO_REVISION, readRevision } from '../edge/node-http.js';
import { DOCUMENT_MAX_CHARS, WRITE_LIMIT } from './limits.js';
import { Latency, cpuShares, getState, history, mask, openStore, readCpu, sizing, writeMinute } from './metrics.js';
import { writeFixture } from './metrics-fixture.js';
import { collect } from './collect.js';
import { createIdentity, memoryStorage, trackDeleteMessage, trackMessage } from '../src/share/identity.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

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
let ip = '203.0.113.1';

async function call(method, path, body, headers = {}) {
  const init = { method, headers: { 'cf-connecting-ip': ip, ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  const res = await worker.fetch(new Request(`https://tracks.test${path}`, init), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

let clock = 1_000_000;
async function save(pilot, doc, { author = 'Fernando', ts = (clock += 1), tamper } = {}) {
  const documentText = JSON.stringify(doc);
  const signed = await pilot.signBytes(await trackMessage({ id: doc.id, ts, author, documentText }));
  const body = { document: documentText, author, ts, ...signed, ...(tamper || {}) };
  return call('PUT', `/api/tracks/${doc.id}`, body);
}

async function remove(pilot, id, ts = (clock += 1)) {
  const signed = await pilot.signBytes(trackDeleteMessage({ id, ts }));
  return call('DELETE', `/api/tracks/${id}`, { ts, ...signed });
}

const alice = createIdentity(memoryStorage());
const bob = createIdentity(memoryStorage());
const aliceKey = await alice.publicKey();

console.log('save and read back');
const ring = mapTrackDocument({ id: 'trk-0000a001', name: 'Valley ring', gates: 3 });
let r = await save(alice, ring);
check('a first save is created', r.status === 201, JSON.stringify(r.body));
check('and is filed under the key that signed it', r.body && r.body.owner === aliceKey);
check('with its world, gates and pilot', r.body && r.body.map === 'swiss2' && r.body.gates === 3 && r.body.author === 'Fernando');
r = await call('GET', `/api/tracks/${ring.id}`);
check('anyone can open it', r.status === 200 && r.body.document && r.body.document.id === ring.id);
check('and the document is the track that was sent', r.body.document.elements.length === ring.elements.length && r.body.document.map === 'swiss2');
r = await call('GET', '/api/tracks');
check('it is in the list of everybody\'s tracks', r.status === 200 && r.body.tracks.some((t) => t.id === ring.id));
check('and the list carries no documents', r.body.tracks.every((t) => !('document' in t)));

console.log('ownership');
const renamed = { ...ring, name: 'Valley ring, longer' };
r = await save(alice, renamed);
check('the owner\'s save updates it', r.status === 200 && r.body.name === 'Valley ring, longer', JSON.stringify(r.body));
r = await save(bob, { ...ring, name: 'Taken over' }, { author: 'Bob' });
check('another key\'s save of the same id is refused as a conflict', r.status === 409 && r.body.conflict === true, JSON.stringify(r.body));
r = await call('GET', `/api/tracks/${ring.id}`);
check('and leaves the owner\'s track as it was', r.body.name === 'Valley ring, longer' && r.body.owner === aliceKey);
r = await save(alice, renamed, { ts: 5 });
check('an older save than the one held is refused as stale', r.status === 409 && r.body.stale === true && r.body.ts > 5);
r = await save(alice, renamed, { tamper: { author: 'Mallory' } });
check('a signature does not cover another pilot name', r.status === 401);
r = await save(alice, renamed, { tamper: { document: JSON.stringify({ ...renamed, name: 'Swapped' }) } });
check('nor another document', r.status === 401);
const [bobCopy] = [mapTrackDocument({ id: 'trk-0000b001', name: 'Valley ring, copy', gates: 3 })];
r = await save(bob, bobCopy, { author: 'Bob' });
check('a copy under a new id is the other pilot\'s own', r.status === 201 && r.body.owner === await bob.publicKey());

console.log('lists');
const alps = mapTrackDocument({ id: 'trk-0000a002', name: 'Glacier line', map: 'alps', gates: 4 });
await save(alice, alps);
r = await call('GET', '/api/tracks?map=alps');
check('by world', r.body.tracks.length === 1 && r.body.tracks[0].id === alps.id);
r = await call('GET', `/api/tracks?owner=${encodeURIComponent(aliceKey)}`);
check('by pilot key', r.body.tracks.length === 2 && r.body.tracks.every((t) => t.owner === aliceKey));
r = await call('GET', '/api/tracks?limit=2');
const all = (await call('GET', '/api/tracks')).body.tracks;
check('newest save first', all.every((t, i) => i === 0 || `${all[i - 1].updatedUtc}|${all[i - 1].id}` > `${t.updatedUtc}|${t.id}`)
  && all[all.length - 1].id === ring.id, all.map((t) => `${t.id}@${t.updatedUtc}`).join(','));
check('a page says where the next one starts', r.body.tracks.length === 2 && typeof r.body.next === 'string');
const r2 = await call('GET', `/api/tracks?limit=2&before=${encodeURIComponent(r.body.next)}`);
check('and the next page holds the rest, no repeats', r2.body.tracks.length === 1 && r2.body.next === null
  && !r.body.tracks.some((t) => t.id === r2.body.tracks[0].id));
r = await call('GET', '/api/tracks?before=junk');
check('a bent cursor is refused', r.status === 400);
const retired = mapTrackDocument({ id: 'trk-0000a003', name: 'Downtown', map: 'city', gates: 2 });
r = await save(alice, retired);
check('a track on a world the simulator no longer seats is still saved and listed', r.status === 201
  && (await call('GET', '/api/tracks?map=city')).body.tracks.length === 1);

console.log('the boundary');
r = await save(alice, { ...mapTrackDocument({ id: 'trk-0000a004' }), name: 'Sh1t course' });
check('a track name with a listed word is refused', r.status === 422 && r.body.field === 'name', JSON.stringify(r.body));
r = await save(alice, mapTrackDocument({ id: 'trk-0000a005', name: 'Grass valley' }), { author: 'Cucumber' });
check('an innocent name that hides a short word is not', r.status === 201, JSON.stringify(r.body));
r = await save(alice, mapTrackDocument({ id: 'trk-0000a006' }), { author: 'puta madre' });
check('a pilot name with a listed word is refused', r.status === 422 && r.body.field === 'author');
r = await save(alice, mapTrackDocument({ id: 'trk-0000a007' }), { author: 'x' });
check('a pilot name outside the name rule is refused', r.status === 422);
r = await save(alice, { ...mapTrackDocument({ id: 'trk-0000a008' }), name: 'x'.repeat(81) });
check('an 81 character track name is refused', r.status === 422);
const fat = mapTrackDocument({ id: 'trk-0000a009' });
fat.padding = 'x'.repeat(DOCUMENT_MAX_CHARS);
r = await save(alice, fat);
check('a document over the cap is refused before anything else', r.status === 413);
const field = { ...mapTrackDocument({ id: 'trk-0000a00a' }), schemaVersion: 3 };
delete field.map;
r = await save(alice, field);
check('a field track, which nothing flies any more, is refused', r.status === 400);
r = await save(alice, mapTrackDocument({ id: 'trk-0000a00b' }), { tamper: { document: JSON.stringify(mapTrackDocument({ id: 'trk-0000a00c' })) } });
check('a document whose id is not the path\'s is refused', r.status === 400 || r.status === 401);
r = await call('PUT', '/api/tracks/../../etc', {});
check('a path that is not a track id is refused', r.status === 400 || r.status === 404);
r = await call('PUT', `/api/tracks/${ring.id}`, 'not json');
check('a body that is not JSON is refused', r.status === 400);
r = await call('GET', '/api/tracks/trk-ffffffff');
check('a track that is not there is a 404', r.status === 404);
r = await call('OPTIONS', '/api/tracks/trk-00000001');
check('a preflight is answered for any origin, without credentials', r.status === 204
  && r.headers.get('access-control-allow-origin') === '*' && !r.headers.get('access-control-allow-credentials'));

console.log('delete');
r = await remove(bob, ring.id);
check('another pilot cannot delete a track', r.status === 403);
r = await remove(alice, retired.id);
check('its owner can', r.status === 200 && (await call('GET', `/api/tracks/${retired.id}`)).status === 404);

console.log('admin');
r = await call('POST', `/api/admin/tracks/${bobCopy.id}`, { hidden: true }, { authorization: 'Bearer wrong' });
check('a wrong admin secret is refused', r.status === 401);
r = await call('POST', `/api/admin/tracks/${bobCopy.id}`, { hidden: true }, { authorization: 'Bearer selftest-admin-secret' });
check('the admin can hide a track', r.status === 200 && r.body.hidden === true);
check('a hidden track is in no list', !(await call('GET', '/api/tracks')).body.tracks.some((t) => t.id === bobCopy.id));
check('and cannot be opened', (await call('GET', `/api/tracks/${bobCopy.id}`)).status === 404);
r = await save(bob, { ...bobCopy, name: 'Back again' }, { author: 'Bob' });
check('and its owner saving it again does not unhide it', r.status === 200
  && (await call('GET', `/api/tracks/${bobCopy.id}`)).status === 404);
r = await call('DELETE', `/api/admin/tracks/${bobCopy.id}`, undefined, { authorization: 'Bearer selftest-admin-secret' });
check('the admin can delete one', r.status === 200);
env = { ...env, ADMIN_SECRET: '' };
r = await call('POST', `/api/admin/tracks/${ring.id}`, { hidden: true }, { authorization: 'Bearer ' });
check('with no secret set, nobody is an admin', r.status === 401);

console.log('rate limit');
env = freshEnv();
ip = '198.51.100.7';
const burst = mapTrackDocument({ id: 'trk-0000c001', name: 'Burst' });
const statuses = [];
for (let i = 0; i < WRITE_LIMIT + 1; i += 1) {
  statuses.push((await save(alice, burst)).status);
}
check(`the first ${WRITE_LIMIT} saves from one address go through`, statuses.slice(0, WRITE_LIMIT).every((s) => s === 200 || s === 201), statuses.join(','));
r = await save(alice, burst);
check('the next is refused with a wait', r.status === 429 && r.body.retryAfterS > 0);
ip = '198.51.100.8';
r = await save(alice, burst);
check('another address is not held up by it', r.status === 200);
ip = '198.51.100.9';
r = await save(bob, burst, { author: 'Bob' });
check('and a refused conflict spends nothing', r.status === 409
  && (await save(alice, burst)).status === 200);

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
async function saveOver(pilot, doc, ts = (clock += 1)) {
  const documentText = JSON.stringify(doc);
  const signed = await pilot.signBytes(await trackMessage({ id: doc.id, ts, author: 'Fernando', documentText }));
  return over('PUT', `/api/tracks/${doc.id}`, { document: documentText, author: 'Fernando', ts, ...signed });
}
r = await over('GET', '/api/health');
check('it answers its health check', r.status === 200 && r.body.ok === true);
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
const vmTrack = mapTrackDocument({ id: 'trk-0000d001', name: 'On the VM', gates: 2 });
r = await saveOver(alice, vmTrack);
check('a save over HTTP is created', r.status === 201 && r.body.owner === aliceKey, JSON.stringify(r.body));
check('with the CORS answer the page needs', r.headers.get('access-control-allow-origin') === '*');
r = await saveOver(bob, { ...vmTrack, name: 'Mine now' });
check('another key\'s save is refused as a conflict', r.status === 409 && r.body.conflict === true);
r = await over('PUT', `/api/tracks/${vmTrack.id}`, 'x'.repeat(DOCUMENT_MAX_CHARS + 16 * 1024));
check('a body over the cap is refused, streamed through the bridge', r.status === 413, `${r.status}`);
r = await over('POST', `/api/admin/tracks/${vmTrack.id}`, { hidden: true }, { authorization: 'Bearer wrong' });
check('a wrong admin secret is refused', r.status === 401);
await server.stop();
server = await startTracks({ db: dbFile, port: 0, adminSecret: 'selftest-admin-secret', revision: revisionOf(`${'c'.repeat(40)} dirty\n`) });
base = `http://127.0.0.1:${server.port}`;
r = await over('GET', '/api/version');
check('a deployed server answers the commit it started on', r.status === 200 && r.body.commit === 'c'.repeat(40) && r.body.dirty === true, JSON.stringify(r.body));
r = await over('GET', `/api/tracks/${vmTrack.id}`);
check('the track is still there after a restart', r.status === 200 && r.body.document.id === vmTrack.id);
r = await over('GET', '/api/tracks?map=swiss2');
check('and listed under its world', r.status === 200 && r.body.tracks.some((t) => t.id === vmTrack.id));
const applied = openD1(dbFile).db;
const migrations = readdirSync(join(HERE, 'migrations')).filter((f) => f.endsWith('.sql')).length;
check('a restart applies no migration twice', applied.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get().n === migrations);
applied.close();
r = await over('DELETE', `/api/admin/tracks/${vmTrack.id}`, undefined, { authorization: 'Bearer selftest-admin-secret' });
check('the admin can delete it', r.status === 200);
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
rmSync(scratch, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
