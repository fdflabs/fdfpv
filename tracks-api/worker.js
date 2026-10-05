/*
 * worker.js: the tracks server. Every track any pilot saves, for everybody.
 *
 * The owner's rule, in his words: "saves online, no login, everything saved
 * is available to everybody". So a track needs no account. What it needs
 * is the key every browser already holds (src/share/identity.js): a save is
 * signed with it, and the first key to save a track id owns that id. A later
 * save of the id under the same key updates it; under any other key it is
 * refused with 409, and the simulator saves the edit as a copy under a new
 * id instead (src/share/cloud.js). Anyone can list, open, fly and copy any
 * track that is not hidden.
 *
 * THE API, WRITTEN DOWN ONCE.
 *
 *   GET    /api/health
 *   GET    /api/version             { commit, dirty }: the deployed commit the
 *            VM's process started on (edge/node-http.js readRevision),
 *            commit null on Cloudflare.
 *   GET    /api/tracks?map=&owner=&before=&limit=
 *            { tracks: [summary], next }  newest save first. `next` is the
 *            `before` for the following page, or null on the last one.
 *   GET    /api/tracks/{id}          { ...summary, document }
 *   PUT    /api/tracks/{id}          { document, author, key, sig, ts }
 *            201 created, 200 updated, 409 { conflict } not your id,
 *            409 { stale, ts } an older save than the one held.
 *            `document` is the track as JSON TEXT, so the signature covers
 *            exactly the bytes that were sent.
 *   DELETE /api/tracks/{id}          { key, sig, ts }  the owner only.
 *   POST   /api/admin/tracks/{id}    { hidden: true | false }
 *   DELETE /api/admin/tracks/{id}    both with authorization: Bearer ADMIN_SECRET
 *
 *   summary = { id, name, author, owner, map, gates, planes, createdUtc,
 *               updatedUtc }
 *
 *   /api/account/*   optional Google sign-in, written down in accounts.js.
 *   /api/waitlist, /api/admin/waitlist   the beta waitlist, in waitlist.js.
 *
 * EVERYTHING IS CHECKED HERE, because this is the boundary: the body size
 * before it is read into a string, the document through the simulator's own
 * normalize (src/trackbuilder/model.js, the copy of record for the format),
 * the names through a length rule and the word filter (words.js), the
 * signature through identity.js, and the write rate per client address.
 * The map id is checked for shape, not against a list of worlds: a world
 * that is retired later must not make its tracks unsaveable or unlistable,
 * and the simulator already lists a track on a world it cannot seat as
 * retired rather than as a card that loads nothing.
 *
 * Nothing is ambiently authenticated and no cookie is ever set, so the CORS
 * answer is `*`, and the admin secret is only ever a header sent by hand.
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

import { isMapTrack, normalize, toPlain, MAP_SCHEMA_VERSION } from '../src/trackbuilder/model.js';
import { raceGatesOf } from '../src/builder/course.js';
import { planesFor } from '../src/game/verify.js';
import { normaliseName } from '../src/share/pilot.js';
import {
  sha256Base64, trackDeleteMessage, trackMessage, verifySignature,
} from '../src/share/identity.js';
import { badWordIn } from './words.js';
import {
  DOCUMENT_MAX_CHARS, PAGE_DEFAULT, PAGE_MAX, TRACK_NAME_MAX, WRITE_LIMIT,
} from './limits.js';
import {
  CORS, json, nowUtc, readBody, refuse, spend,
} from './http.js';
import { accountRoute, waitlistRoute } from './accounts.js';
import { waitlistAdmin } from './waitlist.js';

const TRACK_ID_RE = /^trk-[0-9a-f]{8}$/;
const MAP_RE = /^[a-z0-9]{1,24}$/;
/* A raw P-256 public key is 65 bytes, 88 characters of base64. */
const KEY_RE = /^[A-Za-z0-9+/]{87}=$/;
const SIG_RE = /^[A-Za-z0-9+/]{86}==$/;

const BODY_MAX_BYTES = DOCUMENT_MAX_CHARS + 8 * 1024;
const TOO_BIG = 'That track is too big to save online.';

function spendWrite(env, request) {
  return spend(env, request, '', WRITE_LIMIT, 'Too many saves from here. Try again in a few minutes.');
}

function summaryOf(row) {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    owner: row.owner,
    map: row.map,
    gates: row.gates,
    planes: JSON.parse(row.planes || '[]'),
    createdUtc: row.created_utc,
    updatedUtc: row.updated_utc,
  };
}

/* A name with no control characters and no listed word, or an error. */
function inspectTrackName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > TRACK_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) {
    return { error: `A track name is 1 to ${TRACK_NAME_MAX} characters.` };
  }
  if (badWordIn(name)) {
    return { error: 'That track name is not allowed. Please choose another.', field: 'name' };
  }
  return { name };
}

function inspectAuthor(raw) {
  if (raw == null || raw === '') {
    return { author: '' };
  }
  const author = normaliseName(raw);
  if (!author) {
    return { error: 'A pilot name is 2 to 24 letters, numbers, spaces, dots, dashes or underscores.' };
  }
  if (badWordIn(author)) {
    return { error: 'That pilot name is not allowed. Please choose another.', field: 'author' };
  }
  return { author };
}

/* The counter a save carries: a positive integer, which the client makes
 * from its clock and the server only compares. */
function inspectTs(raw) {
  const ts = Number(raw);
  return Number.isSafeInteger(ts) && ts > 0 ? ts : null;
}

async function putTrack(env, request, id) {
  const read = await readBody(request, BODY_MAX_BYTES, TOO_BIG);
  if (read.error) {
    return read.error;
  }
  const b = read.body;
  if (!b || typeof b !== 'object' || typeof b.document !== 'string') {
    return refuse(400, 'A save carries the track as JSON text in `document`.');
  }
  if (b.document.length > DOCUMENT_MAX_CHARS) {
    return refuse(413, 'That track is too big to save online.');
  }
  const ts = inspectTs(b.ts);
  if (!ts || typeof b.key !== 'string' || !KEY_RE.test(b.key) || typeof b.sig !== 'string' || !SIG_RE.test(b.sig)) {
    return refuse(400, 'A save carries the pilot key, its signature and a counter.');
  }
  let raw;
  try {
    raw = JSON.parse(b.document);
  } catch (e) {
    return refuse(400, 'The track is not JSON.');
  }
  if (!raw || typeof raw !== 'object' || raw.id !== id || !isMapTrack(raw) || !(Number(raw.schemaVersion) >= MAP_SCHEMA_VERSION)) {
    return refuse(400, 'That is not a track built in a world, under this id.');
  }
  const author = inspectAuthor(b.author);
  if (author.error) {
    return refuse(422, author.error, { field: author.field || 'author' });
  }
  const message = await trackMessage({ id, ts, author: author.author, documentText: b.document });
  if (!(await verifySignature({ key: b.key, sig: b.sig, message }))) {
    return refuse(401, 'The signature does not match that save.');
  }
  let doc;
  try {
    doc = normalize(raw).doc;
  } catch (e) {
    return refuse(400, 'That track could not be read.');
  }
  if (doc.id !== id || !isMapTrack(doc) || !MAP_RE.test(doc.map)) {
    return refuse(400, 'That is not a track built in a world, under this id.');
  }
  const named = inspectTrackName(doc.name);
  if (named.error) {
    return refuse(422, named.error, { field: 'name' });
  }
  doc.name = named.name;

  const held = await env.DB.prepare('SELECT owner, signed_ts, created_utc FROM tracks WHERE id = ?').bind(id).first();
  if (held && held.owner !== b.key) {
    return refuse(409, 'That track id belongs to another pilot. Save it as a copy.', { conflict: true });
  }
  if (held && ts <= held.signed_ts) {
    return refuse(409, 'A newer save of that track is already online.', { stale: true, ts: held.signed_ts });
  }
  const limited = await spendWrite(env, request);
  if (limited) {
    return limited;
  }
  let gates = 0;
  let planes = [];
  try {
    gates = raceGatesOf(doc).length;
    planes = planesFor(toPlain(doc));
  } catch (e) {
    /* A track the builder would draw but cannot race yet (no gate) is
     * still a track: stored, listed with nought gates. */
  }
  const stamp = nowUtc();
  const created = held ? held.created_utc : stamp;
  const text = JSON.stringify(toPlain(doc));
  if (text.length > DOCUMENT_MAX_CHARS) {
    return refuse(413, 'That track is too big to save online.');
  }
  await env.DB.prepare(
    'INSERT INTO tracks (id, owner, name, author, map, gates, planes, document, created_utc, updated_utc, signed_ts) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
    + 'ON CONFLICT (id) DO UPDATE SET name = excluded.name, author = excluded.author, map = excluded.map, '
    + 'gates = excluded.gates, planes = excluded.planes, document = excluded.document, '
    + 'updated_utc = excluded.updated_utc, signed_ts = excluded.signed_ts '
    /* The owner check above and this write are two statements, so a
     * second key racing the first save of an id is stopped here too. */
    + 'WHERE tracks.owner = excluded.owner',
  ).bind(id, b.key, doc.name, author.author, doc.map, gates, JSON.stringify(planes), text, created, stamp, ts).run();
  const row = await env.DB.prepare('SELECT * FROM tracks WHERE id = ?').bind(id).first();
  if (!row || row.owner !== b.key) {
    return refuse(409, 'That track id belongs to another pilot. Save it as a copy.', { conflict: true });
  }
  return json(held ? 200 : 201, summaryOf(row));
}

async function deleteTrack(env, request, id) {
  const read = await readBody(request, BODY_MAX_BYTES, TOO_BIG);
  if (read.error) {
    return read.error;
  }
  const b = read.body || {};
  const ts = inspectTs(b.ts);
  if (!ts || typeof b.key !== 'string' || !KEY_RE.test(b.key) || typeof b.sig !== 'string' || !SIG_RE.test(b.sig)) {
    return refuse(400, 'A delete carries the pilot key, its signature and a counter.');
  }
  if (!(await verifySignature({ key: b.key, sig: b.sig, message: trackDeleteMessage({ id, ts }) }))) {
    return refuse(401, 'The signature does not match that delete.');
  }
  const held = await env.DB.prepare('SELECT owner, signed_ts FROM tracks WHERE id = ?').bind(id).first();
  if (!held) {
    return refuse(404, 'That track is not online.');
  }
  if (held.owner !== b.key) {
    return refuse(403, 'Only the pilot who made that track can delete it.');
  }
  if (ts <= held.signed_ts) {
    return refuse(409, 'A newer save of that track is already online.', { stale: true, ts: held.signed_ts });
  }
  const limited = await spendWrite(env, request);
  if (limited) {
    return limited;
  }
  await env.DB.prepare('DELETE FROM tracks WHERE id = ? AND owner = ?').bind(id, b.key).run();
  return json(200, { id, deleted: true });
}

async function listTracks(env, url) {
  const where = ['hidden = 0'];
  const args = [];
  const map = url.searchParams.get('map');
  if (map) {
    if (!MAP_RE.test(map)) {
      return refuse(400, 'Not a map id.');
    }
    where.push('map = ?');
    args.push(map);
  }
  const owner = url.searchParams.get('owner');
  if (owner) {
    if (!KEY_RE.test(owner)) {
      return refuse(400, 'Not a pilot key.');
    }
    where.push('owner = ?');
    args.push(owner);
  }
  /* The cursor is the last row's updated time and id, so a page boundary
   * holds even when two tracks were saved in the same second. */
  const before = url.searchParams.get('before');
  if (before) {
    const m = before.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)\|(trk-[0-9a-f]{8})$/);
    if (!m) {
      return refuse(400, 'Not a page cursor.');
    }
    where.push('(updated_utc < ? OR (updated_utc = ? AND id < ?))');
    args.push(m[1], m[1], m[2]);
  }
  const asked = Number(url.searchParams.get('limit') || PAGE_DEFAULT);
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, PAGE_MAX) : PAGE_DEFAULT;
  const { results } = await env.DB.prepare(
    'SELECT id, name, author, owner, map, gates, planes, created_utc, updated_utc FROM tracks '
    + `WHERE ${where.join(' AND ')} ORDER BY updated_utc DESC, id DESC LIMIT ?`,
  ).bind(...args, limit + 1).all();
  const page = results.slice(0, limit);
  const last = page[page.length - 1];
  const next = results.length > limit && last ? `${last.updated_utc}|${last.id}` : null;
  return json(200, { tracks: page.map(summaryOf), next });
}

async function getTrack(env, id) {
  const row = await env.DB.prepare('SELECT * FROM tracks WHERE id = ? AND hidden = 0').bind(id).first();
  if (!row) {
    return refuse(404, 'That track is not online.');
  }
  return json(200, { ...summaryOf(row), document: JSON.parse(row.document) });
}

/* Constant time over the digests, so the comparison says nothing about how
 * much of a guess was right. */
async function isAdmin(env, request) {
  const secret = env.ADMIN_SECRET;
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || !got) {
    return false;
  }
  const a = await sha256Base64(secret);
  const b = await sha256Base64(got);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function admin(env, request, id) {
  if (!(await isAdmin(env, request))) {
    return refuse(401, 'Not an admin.');
  }
  if (request.method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM tracks WHERE id = ?').bind(id).run();
    return r.meta.changes ? json(200, { id, deleted: true }) : refuse(404, 'No such track.');
  }
  const read = await readBody(request, BODY_MAX_BYTES, TOO_BIG);
  if (read.error) {
    return read.error;
  }
  if (!read.body || typeof read.body.hidden !== 'boolean') {
    return refuse(400, 'Send { "hidden": true } or { "hidden": false }.');
  }
  const r = await env.DB.prepare('UPDATE tracks SET hidden = ? WHERE id = ?').bind(read.body.hidden ? 1 : 0, id).run();
  return r.meta.changes ? json(200, { id, hidden: read.body.hidden }) : refuse(404, 'No such track.');
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const { method } = request;
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (path === '/api/health' && method === 'GET') {
    return json(200, { ok: true });
  }
  if (path === '/api/version' && method === 'GET') {
    return json(200, env.REVISION || { commit: null, dirty: false });
  }
  if (path === '/api/tracks' && method === 'GET') {
    return listTracks(env, url);
  }
  if (path === '/api/account' || path.startsWith('/api/account/')) {
    return accountRoute(env, request, path);
  }
  if (path === '/api/waitlist' && method === 'POST') {
    return waitlistRoute(env, request);
  }
  if (path === '/api/admin/waitlist' && ['GET', 'POST', 'DELETE'].includes(method)) {
    return (await isAdmin(env, request)) ? waitlistAdmin(env, request) : refuse(401, 'Not an admin.');
  }
  const one = path.match(/^\/api\/tracks\/([^/]+)$/);
  const adminOne = path.match(/^\/api\/admin\/tracks\/([^/]+)$/);
  const id = decodeURIComponent((one || adminOne || [])[1] || '');
  if ((one || adminOne) && !TRACK_ID_RE.test(id)) {
    return refuse(400, 'Not a track id.');
  }
  if (one && method === 'GET') {
    return getTrack(env, id);
  }
  if (one && method === 'PUT') {
    return putTrack(env, request, id);
  }
  if (one && method === 'DELETE') {
    return deleteTrack(env, request, id);
  }
  if (adminOne && (method === 'POST' || method === 'DELETE')) {
    return admin(env, request, id);
  }
  return refuse(404, 'Nothing here.');
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      /* Logged for `wrangler tail`, answered as a 500 the client retries. */
      console.error(e && e.stack ? e.stack : e);
      return refuse(500, 'The tracks server had a problem. Your track is still saved on this computer.');
    }
  },
};
