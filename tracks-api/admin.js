/*
 * admin.js: what the owner's admin page (admin.html) reads, on the tracks
 * server. worker.js checks ADMIN_SECRET before calling here.
 *
 *   GET /api/admin/overview   { revision, upS, accounts, callsigns,
 *                             sessions, tracks, hiddenTracks, waiting,
 *                             invited, inviteOnly }
 *            upS is seconds since this server process started; sessions
 *            are the ones that have not expired.
 *   GET /api/admin/accounts   { accounts: [{ callsign, createdUtc,
 *                             updatedUtc }] }  newest first
 *
 *   GET /api/admin/server?range=1h|24h|7d|30d   the VM: live counters,
 *            request latency, the rooms server's own report, each
 *            server's revision, and from the collector's store the
 *            history, the masked warning tail and the sizing numbers
 *            (metrics.js serverReport). Only on the VM (env.SERVER).
 *   GET /api/admin/server/sample   the last minute's latency, for the
 *            collector (tracks-api/collect.js).
 *
 * An account holds no email (accounts.js), so a member is a callsign and
 * two dates. The waitlist's addresses are waitlist.js's.
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

import { json } from './http.js';
import { inviteOnly } from './waitlist.js';

const STARTED_MS = Date.now();

async function count(env, sql, ...binds) {
  return (await env.DB.prepare(sql).bind(...binds).first()).n;
}

export async function adminOverview(env) {
  const nowS = Math.floor(Date.now() / 1000);
  return json(200, {
    revision: env.REVISION || { commit: null, dirty: false },
    upS: Math.floor((Date.now() - STARTED_MS) / 1000),
    accounts: await count(env, 'SELECT COUNT(*) AS n FROM accounts'),
    callsigns: await count(env, 'SELECT COUNT(*) AS n FROM accounts WHERE callsign IS NOT NULL'),
    sessions: await count(env, 'SELECT COUNT(*) AS n FROM sessions WHERE expires_s > ?', nowS),
    tracks: await count(env, 'SELECT COUNT(*) AS n FROM tracks'),
    hiddenTracks: await count(env, 'SELECT COUNT(*) AS n FROM tracks WHERE hidden = 1'),
    waiting: await count(env, 'SELECT COUNT(*) AS n FROM waitlist WHERE approved_utc IS NULL'),
    invited: await count(env, 'SELECT COUNT(*) AS n FROM waitlist WHERE approved_utc IS NOT NULL'),
    inviteOnly: inviteOnly(env),
  });
}

export async function adminAccounts(env) {
  const { results } = await env.DB.prepare('SELECT callsign, created_utc, updated_utc FROM accounts ORDER BY created_utc DESC, id DESC').all();
  return json(200, {
    accounts: results.map((r) => ({ callsign: r.callsign ?? null, createdUtc: r.created_utc, updatedUtc: r.updated_utc })),
  });
}

export async function adminServer(env, url) {
  return json(200, await env.SERVER.report(url.searchParams.get('range') || '24h'));
}

export function adminServerSample(env) {
  return json(200, env.SERVER.sample());
}
