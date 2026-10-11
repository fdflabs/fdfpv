/*
 * gallery.js: the livery gallery (docs/LIVERY-GALLERY.md). Pilots publish
 * the paint shop's livery code, everyone browses them by aircraft, signed
 * in pilots like and report them, the admin hides what should not be up.
 *
 * The code is stored exactly as published and read with the paint shop's
 * own readCode, so the gallery takes the codes a paste takes, versions
 * included, and never makes one of its own.
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

import { readCode } from '../configs/liveries.js';
import { CODE_MAX } from '../configs/paint.js';
import { json, nowUtc, readBody, refuse, spend } from './http.js';
import {
  GALLERY_PAGE, GALLERY_PER_ACCOUNT, GALLERY_REPORT_HIDE, GALLERY_WRITE_LIMIT,
} from './limits.js';
import { badWordIn } from './words.js';

const ID_RE = /^[A-Za-z0-9_-]{12}$/;
const FAMILY_RE = /^[a-z0-9]{1,32}$/;
const BODY_MAX = CODE_MAX + 512;

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}

function shown(row) {
  return {
    id: row.id, family: row.family, name: row.name, callsign: row.callsign ?? '', code: row.code, likes: row.likes, createdUtc: row.created_utc,
  };
}

/* GET /api/gallery: public, one aircraft's page, never a hidden entry. */
export async function listGallery(env, url) {
  const family = url.searchParams.get('family') || '';
  if (!FAMILY_RE.test(family)) {
    return refuse(400, 'Name an aircraft.');
  }
  const sort = url.searchParams.get('sort') === 'liked' ? 'g.likes DESC, g.created_utc DESC' : 'g.created_utc DESC';
  const page = Math.max(0, Math.min(1000, Math.floor(Number(url.searchParams.get('page')) || 0)));
  const { results } = await env.DB.prepare(
    `SELECT g.*, a.callsign FROM gallery g JOIN accounts a ON a.id = g.account_id
     WHERE g.family = ? AND g.hidden = 0 ORDER BY ${sort}, g.id LIMIT ? OFFSET ?`,
  ).bind(family, GALLERY_PAGE + 1, page * GALLERY_PAGE).all();
  const more = results.length > GALLERY_PAGE;
  return json(200, { items: results.slice(0, GALLERY_PAGE).map(shown), next: more ? page + 1 : null });
}

/*
 * /api/account/gallery...: `account` is the signed in account, already
 * checked by accounts.js accountRoute.
 */
export async function galleryAccountRoute(env, request, path, account) {
  const { method } = request;
  if (path === '/api/account/gallery/liked' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT gallery_id FROM gallery_likes WHERE account_id = ?').bind(account.id).all();
    return json(200, { ids: results.map((r) => r.gallery_id) });
  }
  const m = path.match(/^\/api\/account\/gallery(?:\/([^/]+)(?:\/(like|report))?)?$/);
  if (!m) {
    return refuse(404, 'Nothing here.');
  }
  const [, id, verb] = m;
  const op = `${method} ${id ? 'one' : 'all'}${verb ? `/${verb}` : ''}`;
  const ops = ['POST all', 'DELETE one', 'PUT one/like', 'DELETE one/like', 'POST one/report'];
  if (!ops.includes(op)) {
    return refuse(404, 'Nothing here.');
  }
  if (id && !ID_RE.test(id)) {
    return refuse(400, 'Not a gallery id.');
  }
  const limited = await spend(env, request, 'gallery', GALLERY_WRITE_LIMIT, 'Too many gallery changes from here. Try again in a few minutes.');
  if (limited) {
    return limited;
  }
  if (op === 'POST all') {
    return publish(env, request, account);
  }
  const row = await env.DB.prepare('SELECT * FROM gallery WHERE id = ?').bind(id).first();
  if (!row || (row.hidden && row.account_id !== account.id)) {
    return refuse(404, 'No such livery in the gallery.');
  }
  if (op === 'DELETE one') {
    return unpublish(env, row, account);
  }
  if (op === 'POST one/report') {
    return report(env, row, account);
  }
  return like(env, row, account, method === 'PUT');
}

async function publish(env, request, account) {
  if (!account.callsign) {
    return refuse(409, 'Choose a callsign first: the gallery shows who painted it.', { why: 'callsign' });
  }
  const read = await readBody(request, BODY_MAX, 'That livery code is too big.');
  if (read.error) {
    return read.error;
  }
  const code = read.body && typeof read.body.code === 'string' ? read.body.code.replace(/\s+/g, '') : null;
  const got = readCode(code);
  if (got.error) {
    return refuse(422, 'That is not a livery code the paint shop can read.', { why: 'code', code: got.error });
  }
  /* Text decals are held to words.js by readCode itself (paint.js
   * checkDecal, error 'rude'); a livery's name is not, since it never left
   * the pilot's own list before. */
  if (badWordIn(got.name)) {
    return refuse(422, 'That livery has a word in its name the gallery does not show.', { why: 'words' });
  }
  const same = await env.DB.prepare('SELECT g.*, a.callsign FROM gallery g JOIN accounts a ON a.id = g.account_id WHERE g.account_id = ? AND g.code = ?')
    .bind(account.id, code).first();
  if (same) {
    return json(200, { entry: shown(same) });
  }
  const held = await env.DB.prepare('SELECT COUNT(*) AS n FROM gallery WHERE account_id = ?').bind(account.id).first();
  if (held.n >= GALLERY_PER_ACCOUNT) {
    return refuse(409, `The gallery holds ${GALLERY_PER_ACCOUNT} liveries a pilot. Remove one first.`, { why: 'full' });
  }
  const row = {
    id: newId(), account_id: account.id, family: got.family, name: got.name, code, likes: 0, created_utc: nowUtc(), callsign: account.callsign,
  };
  await env.DB.prepare('INSERT INTO gallery (id, account_id, family, name, code, created_utc) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(row.id, row.account_id, row.family, row.name, row.code, row.created_utc).run();
  return json(200, { entry: shown(row) });
}

async function unpublish(env, row, account) {
  if (row.account_id !== account.id) {
    return refuse(404, 'No such livery of yours in the gallery.');
  }
  await deleteEntries(env, [row.id]);
  return json(200, { deleted: true });
}

async function like(env, row, account, on) {
  if (row.account_id === account.id) {
    return refuse(409, 'That is your own livery.', { why: 'own' });
  }
  const sql = on
    ? 'INSERT INTO gallery_likes (gallery_id, account_id) VALUES (?, ?) ON CONFLICT DO NOTHING'
    : 'DELETE FROM gallery_likes WHERE gallery_id = ? AND account_id = ?';
  await env.DB.prepare(sql).bind(row.id, account.id).run();
  const n = await recount(env, 'gallery_likes', 'likes', row.id);
  return json(200, { id: row.id, likes: n, liked: on });
}

async function report(env, row, account) {
  if (row.account_id === account.id) {
    return refuse(409, 'That is your own livery.', { why: 'own' });
  }
  await env.DB.prepare('INSERT INTO gallery_reports (gallery_id, account_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(row.id, account.id).run();
  const n = await recount(env, 'gallery_reports', 'reports', row.id);
  if (n >= GALLERY_REPORT_HIDE) {
    await env.DB.prepare('UPDATE gallery SET hidden = 1 WHERE id = ?').bind(row.id).run();
  }
  return json(200, { reported: true });
}

/* The count on the row set from its table, never incremented, so a like
 * sent twice or two at once cannot leave it off by one. */
async function recount(env, table, column, id) {
  const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE gallery_id = ?`).bind(id).first();
  await env.DB.prepare(`UPDATE gallery SET ${column} = ? WHERE id = ?`).bind(n, id).run();
  return n;
}

async function deleteEntries(env, ids) {
  for (const id of ids) {
    await env.DB.prepare('DELETE FROM gallery_likes WHERE gallery_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM gallery_reports WHERE gallery_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM gallery WHERE id = ?').bind(id).run();
  }
}

/* An account deleted: its entries go, and its likes and reports with the
 * counts they were part of. */
export async function deleteGalleryAccount(env, accountId) {
  const own = await env.DB.prepare('SELECT id FROM gallery WHERE account_id = ?').bind(accountId).all();
  await deleteEntries(env, own.results.map((r) => r.id));
  const touched = await env.DB.prepare(
    'SELECT gallery_id FROM gallery_likes WHERE account_id = ? UNION SELECT gallery_id FROM gallery_reports WHERE account_id = ?',
  ).bind(accountId, accountId).all();
  await env.DB.prepare('DELETE FROM gallery_likes WHERE account_id = ?').bind(accountId).run();
  await env.DB.prepare('DELETE FROM gallery_reports WHERE account_id = ?').bind(accountId).run();
  for (const { gallery_id: id } of touched.results) {
    await recount(env, 'gallery_likes', 'likes', id);
    await recount(env, 'gallery_reports', 'reports', id);
  }
}

/* GET /api/admin/gallery: what has been reported or hidden, most reported first. */
export async function adminGalleryList(env) {
  const { results } = await env.DB.prepare(
    `SELECT g.*, a.callsign FROM gallery g JOIN accounts a ON a.id = g.account_id
     WHERE g.reports > 0 OR g.hidden = 1 ORDER BY g.reports DESC, g.created_utc DESC LIMIT 200`,
  ).all();
  return json(200, { items: results.map((r) => ({ ...shown(r), reports: r.reports, hidden: Boolean(r.hidden) })) });
}

/* POST /api/admin/gallery/<id> { hidden }. Showing an entry clears its
 * reports, or the same three would hide it again on the next one. */
export async function adminGallerySet(env, request, id) {
  if (!ID_RE.test(id)) {
    return refuse(400, 'Not a gallery id.');
  }
  const read = await readBody(request, 1024, 'That request is too big.');
  if (read.error) {
    return read.error;
  }
  if (!read.body || typeof read.body.hidden !== 'boolean') {
    return refuse(400, 'Say { hidden: true } or { hidden: false }.');
  }
  const r = await env.DB.prepare('UPDATE gallery SET hidden = ? WHERE id = ?').bind(read.body.hidden ? 1 : 0, id).run();
  if (!r.meta.changes) {
    return refuse(404, 'No such livery in the gallery.');
  }
  if (!read.body.hidden) {
    await env.DB.prepare('DELETE FROM gallery_reports WHERE gallery_id = ?').bind(id).run();
    await env.DB.prepare('UPDATE gallery SET reports = 0 WHERE id = ?').bind(id).run();
  }
  return json(200, { id, hidden: read.body.hidden });
}
