/*
 * worker.js: the tracks server, named for what it first served. It now
 * answers health and version, and routes the account, hangar, gallery,
 * waitlist and admin routes to their modules.
 *
 * THE API, WRITTEN DOWN ONCE.
 *
 *   GET    /api/health
 *   GET    /api/version             { commit, dirty }: the deployed commit the
 *            VM's process started on (edge/node-http.js readRevision),
 *            commit null on Cloudflare.
 *   /api/account/*   optional Google sign-in, written down in accounts.js.
 *   /api/waitlist, /api/admin/waitlist   the beta waitlist, in waitlist.js.
 *   /api/admin/overview, /api/admin/accounts   the admin page's, in admin.js.
 *   /api/admin/server, /api/admin/server/sample   the VM's health, history
 *            and sizing, in admin.js; 404 on the Worker, which has no VM.
 *
 * THE TRACKS ROUTES ARE RETIRED (the combat-only cut, 2026-10-20): the
 * track builder and its cloud copy left the simulator, so /api/tracks and
 * /api/admin/tracks/{id} answer 404 like any other unknown path. Never 429
 * or 5xx for them: an old tab's uploader (src/share/cloud.js, in git
 * history) retried only those and gave up on any other refusal. The
 * `tracks` table stays, with every track saved to it: migrations/
 * 0001_tracks.sql also makes `write_counts`, the rate limiter every route
 * spends from (http.js spend), and the admin overview still counts the
 * stored tracks.
 *
 * Nothing is ambiently authenticated and no cookie is ever set, so the CORS
 * answer is `*`, and the admin secret is only ever a header sent by hand.
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

import { sha256Base64 } from '../src/share/identity.js';
import { CORS, json, refuse } from './http.js';
import { accountRoute, hangarRoute, isAdminToken, waitlistRoute } from './accounts.js';
import { waitlistAdmin } from './waitlist.js';
import { adminGalleryList, adminGallerySet, listGallery } from './gallery.js';
import { adminAccounts, adminOverview, adminServer, adminServerSample } from './admin.js';

/* The bearer is ADMIN_SECRET, sent by hand or by a script, or the Google
 * ID token of one of ADMIN_EMAILS, which is what the admin page sends
 * (accounts.js isAdminToken). The secret is compared in constant time over
 * the digests, so the comparison says nothing about how much of a guess
 * was right. */
async function isAdmin(env, request) {
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return Boolean(got) && ((await isSecret(env, got)) || isAdminToken(env, got));
}

async function isSecret(env, got) {
  const secret = env.ADMIN_SECRET;
  if (!secret) {
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
  if (path.startsWith('/api/hangar/') && method === 'GET') {
    return hangarRoute(env, request, path);
  }
  if (path === '/api/gallery' && method === 'GET') {
    return listGallery(env, url);
  }
  if (path === '/api/admin/gallery' && method === 'GET') {
    return (await isAdmin(env, request)) ? adminGalleryList(env) : refuse(401, 'Not an admin.');
  }
  const adminLivery = path.match(/^\/api\/admin\/gallery\/([^/]+)$/);
  if (adminLivery && method === 'POST') {
    return (await isAdmin(env, request)) ? adminGallerySet(env, request, decodeURIComponent(adminLivery[1])) : refuse(401, 'Not an admin.');
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
  if ((path === '/api/admin/overview' || path === '/api/admin/accounts') && method === 'GET') {
    if (!(await isAdmin(env, request))) {
      return refuse(401, 'Not an admin.');
    }
    return path === '/api/admin/overview' ? adminOverview(env) : adminAccounts(env);
  }
  if ((path === '/api/admin/server' || path === '/api/admin/server/sample') && method === 'GET') {
    if (!env.SERVER) {
      return refuse(404, 'Nothing here.');
    }
    if (!(await isAdmin(env, request))) {
      return refuse(401, 'Not an admin.');
    }
    return path === '/api/admin/server' ? adminServer(env, url) : adminServerSample(env);
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
      return refuse(500, 'The tracks server had a problem.');
    }
  },
};
