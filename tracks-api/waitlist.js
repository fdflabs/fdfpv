/*
 * waitlist.js: the beta waitlist and its invites, on the tracks server.
 *
 * The owner's decision: the beta is by invite. Anybody may ask for a place
 * with their Google account (POST /api/waitlist, in accounts.js, which
 * holds the token check), and the owner approves addresses by hand. While
 * INVITE_ONLY is set, a Google account that has no account here yet is
 * given one only if its email is approved (accounts.js signIn). An account
 * that already exists keeps signing in: the pilots from before the
 * waitlist have no email on file to approve, and an invited pilot is not
 * asked twice.
 *
 * WHAT IS KEPT: the email address, when it asked and when it was approved.
 * It is the only place this server keeps an email, and it is not tied to
 * an account (migrations/0003_waitlist.sql).
 *
 * THE ADMIN API, with authorization: Bearer ADMIN_SECRET (worker.js checks
 * it before calling here):
 *
 *   GET    /api/admin/waitlist   { waitlist: [{ email, requestedUtc,
 *                                approvedUtc }] }  waiting first, oldest
 *                                request first
 *   POST   /api/admin/waitlist   { email, approved: true | false }
 *            approved: true invites the address, whether or not it asked;
 *            false puts it back to waiting. An account it already made
 *            stays: taking an invite back stops a first sign in, not a
 *            pilot who is in.
 *   DELETE /api/admin/waitlist   { email }  the row, gone
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

import { json, nowUtc, readBody, refuse } from './http.js';

const SMALL_BODY = 8 * 1024;
/* RFC 5321's longest address. The shape check is only against a typo in
 * the admin's hand: Google's token is the proof an address is real. */
const EMAIL_MAX_CHARS = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function inviteOnly(env) {
  return Boolean(env.INVITE_ONLY);
}

/* The address as it is keyed, or null when it is not one. */
export function cleanEmail(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const email = raw.trim().toLowerCase();
  return email.length <= EMAIL_MAX_CHARS && EMAIL_RE.test(email) ? email : null;
}

export async function invited(env, email) {
  if (!email) {
    return false;
  }
  const row = await env.DB.prepare('SELECT approved_utc FROM waitlist WHERE email = ?').bind(email).first();
  return Boolean(row && row.approved_utc);
}

/* Asking twice changes nothing, and asking after an invite keeps it. */
export async function joinWaitlist(env, email) {
  const stamp = nowUtc();
  await env.DB.prepare(
    'INSERT INTO waitlist (email, requested_utc) VALUES (?, ?) '
    + 'ON CONFLICT (email) DO UPDATE SET requested_utc = COALESCE(requested_utc, excluded.requested_utc)',
  ).bind(email, stamp).run();
  return { approved: await invited(env, email) };
}

export async function waitlistAdmin(env, request) {
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT email, requested_utc, approved_utc FROM waitlist ORDER BY approved_utc IS NOT NULL, requested_utc, email',
    ).all();
    return json(200, {
      waitlist: results.map((r) => ({ email: r.email, requestedUtc: r.requested_utc, approvedUtc: r.approved_utc })),
    });
  }
  const read = await readBody(request, SMALL_BODY, 'That request is too big.');
  if (read.error) {
    return read.error;
  }
  const email = cleanEmail(read.body && read.body.email);
  if (!email) {
    return refuse(400, 'Send the address in `email`.');
  }
  if (request.method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM waitlist WHERE email = ?').bind(email).run();
    return r.meta.changes ? json(200, { email, deleted: true }) : refuse(404, 'No such address.');
  }
  if (typeof read.body.approved !== 'boolean') {
    return refuse(400, 'Send { "email": "...", "approved": true } or false.');
  }
  const approvedUtc = read.body.approved ? nowUtc() : null;
  await env.DB.prepare(
    'INSERT INTO waitlist (email, approved_utc) VALUES (?, ?) ON CONFLICT (email) DO UPDATE SET approved_utc = excluded.approved_utc',
  ).bind(email, approvedUtc).run();
  return json(200, { email, approved: read.body.approved });
}
