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
 * THE INVITE EMAIL. Inviting an address writes to it (invite.js), once:
 * `mailed_utc` is when, and an address that has it is not written to
 * again until its invite has been taken back and given again. The sender
 * is env.SEND_MAIL, which tracks-api/node.js sets when the VM has mail
 * set up; without it, or when it fails, the invite still stands and the
 * answer says the email did not go, so the admin page can offer it again.
 *
 * WHAT IS KEPT: the email address, when it asked and when it was approved.
 * It is the only place this server keeps an email, and it is not tied to
 * an account (migrations/0003_waitlist.sql).
 *
 * THE ADMIN API, with authorization: Bearer ADMIN_SECRET (worker.js checks
 * it before calling here):
 *
 *   GET    /api/admin/waitlist   { waitlist: [{ email, requestedUtc,
 *                                approvedUtc, mailedUtc }] }  waiting
 *                                first, oldest request first
 *   POST   /api/admin/waitlist   { email, approved: true | false }
 *            approved: true invites the address, whether or not it asked,
 *            and emails it if it has not been: { mailed, mailError? }.
 *            Sent again for an invited address, it is the email alone,
 *            tried again. false puts it back to waiting. An account it already made
 *            stays: taking an invite back stops a first sign in, not a
 *            pilot who is in.
 *   DELETE /api/admin/waitlist   { email }  the row, gone
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

import { json, nowUtc, readBody, refuse } from './http.js';
import { inviteMessage } from './invite.js';

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

/* { mailed: true }, or { mailed: false, mailError } with the invite left
 * standing. */
async function mailInvite(env, email) {
  const row = await env.DB.prepare('SELECT mailed_utc FROM waitlist WHERE email = ?').bind(email).first();
  if (row.mailed_utc) {
    return { mailed: true };
  }
  if (!env.SEND_MAIL) {
    return { mailed: false, mailError: 'Email is not set up on this server.' };
  }
  try {
    await env.SEND_MAIL({ to: email, ...inviteMessage(email) });
  } catch (e) {
    console.error('invite email:', e && e.message ? e.message : e);
    return { mailed: false, mailError: String((e && e.message) || e) };
  }
  await env.DB.prepare('UPDATE waitlist SET mailed_utc = ? WHERE email = ?').bind(nowUtc(), email).run();
  return { mailed: true };
}

export async function waitlistAdmin(env, request) {
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT email, requested_utc, approved_utc, mailed_utc FROM waitlist ORDER BY approved_utc IS NOT NULL, requested_utc, email',
    ).all();
    return json(200, {
      waitlist: results.map((r) => ({
        email: r.email, requestedUtc: r.requested_utc, approvedUtc: r.approved_utc, mailedUtc: r.mailed_utc,
      })),
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
  if (!read.body.approved) {
    await env.DB.prepare(
      'INSERT INTO waitlist (email) VALUES (?) ON CONFLICT (email) DO UPDATE SET approved_utc = NULL, mailed_utc = NULL',
    ).bind(email).run();
    return json(200, { email, approved: false });
  }
  /* The first approval's date is kept: asking again is the email's retry. */
  await env.DB.prepare(
    'INSERT INTO waitlist (email, approved_utc) VALUES (?, ?) ON CONFLICT (email) DO UPDATE SET approved_utc = COALESCE(approved_utc, excluded.approved_utc)',
  ).bind(email, nowUtc()).run();
  return json(200, { email, approved: true, ...(await mailInvite(env, email)) });
}
