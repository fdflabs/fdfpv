/*
 * accounts.js: Google sign-in, on the tracks server.
 *
 * The owner's decisions: nobody plays without an account (2026-10-03,
 * which the page asks for and the rooms server holds every seat to, with
 * GET /api/account below); a signed in pilot holds ONE callsign, the same in rooms, on the board and
 * on lap times, through the word filter and nobody else's; and progress
 * follows the account between computers. Google is asked who the pilot is
 * and nothing else.
 *
 * WHY HERE. This server already has the SQLite store, the per address rate
 * limit, the word filter and a Node adapter on the VM, and the rooms server
 * and the board sit beside it on the same machine.
 *
 * WHAT IS KEPT, per account: Google's `sub` (its stable account id), the
 * callsign, the pilot key the account carries (below), the progress blob
 * (src/share/progressmerge.js), its tokens and items (wallet.js) and the
 * SHA-256 of each session token. No
 * email, name or picture. Google's token carries an email, and an account
 * never holds it: it is read only to look an invite up, and stored only
 * when its owner asks for a place on the beta waitlist (waitlist.js).
 *
 * THE PILOT KEY. Names and lap times on the board, and the tracks on this
 * server, belong to a browser's pilot key (src/share/identity.js), and the
 * only way a pilot has had to take them to another computer is Settings,
 * Export pilot key. An account does that export for them: the first
 * computer to sign in hands its key over (PUT /api/account/identity) and
 * every computer after is given it back, so the board and the tracks see
 * one pilot, and nothing on the board or in the tracks had to learn what
 * an account is. The key is sealed at rest with ACCOUNTS_SECRET (AES-GCM),
 * so a copy of the database alone does not sign as anybody.
 *
 * THE API.
 *
 *   POST   /api/account/google     { credential }  the GIS ID token
 *            { session, callsign, publicKey, identity }  identity is the
 *            carried key as identity.js exportText, or null when the
 *            account has none yet. While INVITE_ONLY is set, 403
 *            { notInvited } for a Google account that has no account here
 *            and whose email has no invite (waitlist.js)
 *   GET    /api/account            { callsign, publicKey }  what the rooms
 *                                  server asks, with the pilot's session
 *   DELETE /api/account            the account, its sessions and progress
 *   DELETE /api/account/session    this session only: sign out
 *   PUT    /api/account/callsign   { callsign, check? }  claim or change;
 *            check: true validates and answers without claiming
 *   PUT    /api/account/identity   { identity }  kept only when the account
 *            has none; answers with the one it holds
 *   POST   /api/account/adopt      { key, sig }  every track filed under
 *            `key` refiled under the account's key; sig is `key`'s own
 *            signature over identity.js keyLinkMessage(key, account key),
 *            so only the holder of a key can hand its tracks over
 *   GET    /api/account/progress   { progress }
 *   PUT    /api/account/progress   { progress }  merged with what is held;
 *            answers with the merge, and `wallet`, the tokens and items
 *            after the merge's grants are paid (wallet.js). Refused 413
 *            past the blob cap, and
 *            413 or 422 when its builds or loadouts are too many, too big
 *            or the wrong shape (progressmerge.js blobRefusal)
 *   GET    /api/account/wallet     { wallet }  { balance, earned, owned },
 *            what the held progress pays paid first (wallet.js)
 *   POST   /api/account/wallet/buy { item }  { wallet }, or 404 no such
 *            item, 409 { why: 'owned' | 'earned' }, 402 { why: 'short' }
 *
 *   POST   /api/waitlist           { credential }  the GIS ID token of
 *            whoever asks for a place in the beta: { approved }, true when
 *            the address already has its invite
 *
 * Every route but the first and the last takes `authorization: Bearer
 * <session>`. All of them answer 503 while GOOGLE_CLIENT_ID names no client id, or while
 * ACCOUNTS_SECRET is unset, which is the feature switched off.
 * GOOGLE_CLIENT_ID is a comma separated list (parseClientIds), so a client
 * id can move: during a transition both the new id the page signs in with
 * and the old one a page loaded before the deploy still holds verify.
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

import { normaliseName } from '../src/share/pilot.js';
import {
  fromBase64, keyLinkMessage, sha256Base64, toBase64, verifySignature,
} from '../src/share/identity.js';
import { blobRefusal, cleanBlob, mergeBlobs } from '../src/share/progressmerge.js';
import {
  NAME_ADJECTIVES, NAME_ANIMALS,
} from '../src/share/roomwire.js';
import en from '../src/strings/en.js';
import es from '../src/strings/es.js';
import { badWordIn } from './words.js';
import { GOOGLE_JWKS_URL, googleKeys, verifyGoogleIdToken } from './google.js';
import { json, nowUtc, readBody, refuse, spend } from './http.js';
import { inviteOnly, invited, joinWaitlist } from './waitlist.js';
import { buyItem, deleteWallet, settleWallet } from './wallet.js';
import { payEvents } from './eventpay.js';
import {
  ACCOUNT_WRITE_LIMIT, PROGRESS_MAX_CHARS, SESSIONS_PER_ACCOUNT, SESSION_DAYS, SIGNIN_LIMIT,
} from './limits.js';

const TOKEN_RE = /^[0-9a-f]{64}$/;
const KEY_RE = /^[A-Za-z0-9+/]{87}=$/;
const IDENTITY_MAX_CHARS = 2048;
const SMALL_BODY = 8 * 1024;
const CURVE = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

/*
 * A CALLSIGN THAT READS AS A GUEST'S NAME is refused. A guest in a room is
 * shown a picker name, an adjective, an animal and a number ("Tough Fox
 * 49", src/share/roomwire.js), in the reader's language, so a callsign
 * spelled like one would pass for a guest, or a guest for it. Both
 * languages, both word orders.
 */
function fold(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

const PICKER_PAIRS = (() => {
  const pairs = new Set();
  for (const table of [en, es]) {
    for (let a = 0; a < NAME_ADJECTIVES; a += 1) {
      for (let b = 0; b < NAME_ANIMALS; b += 1) {
        const adj = fold(table[`rooms.adj.${a}`]);
        const animal = fold(table[`rooms.animal.${b}`]);
        pairs.add(`${adj} ${animal}`);
        pairs.add(`${animal} ${adj}`);
      }
    }
  }
  return pairs;
})();

export function looksLikePickerName(name) {
  const words = fold(name).split(' ');
  const numbers = words.filter((w) => /^\d+$/.test(w));
  if (numbers.length !== 1) {
    return false;
  }
  return PICKER_PAIRS.has(words.filter((w) => !/^\d+$/.test(w)).join(' '));
}

/* { callsign } or { error }: the board's name shape, the word filter, and
 * not a guest's picker name. */
export function inspectCallsign(raw) {
  const callsign = normaliseName(raw);
  if (!callsign) {
    return { error: 'A callsign is 2 to 24 letters, numbers, spaces, dots, dashes or underscores.' };
  }
  if (badWordIn(callsign)) {
    return { error: 'That callsign is not allowed. Please choose another.' };
  }
  if (looksLikePickerName(callsign)) {
    return { error: 'That callsign reads like a guest\'s room name. Please choose another.' };
  }
  return { callsign };
}

/* GOOGLE_CLIENT_ID split on commas, trimmed, blanks dropped: an empty
 * entry (a trailing comma, say) is ignored rather than becoming an id
 * nothing's `aud` can ever equal. */
export function parseClientIds(raw) {
  return String(raw || '').split(',').map((id) => id.trim()).filter(Boolean);
}

function accountsOn(env) {
  return parseClientIds(env.GOOGLE_CLIENT_ID).length > 0 && Boolean(env.ACCOUNTS_SECRET);
}

/*
 * THE CHECKS' STAND IN FOR GOOGLE. GOOGLE_JWKS_URL names another key set
 * to verify ID tokens against, which is how the selftests and the browser
 * checks sign pilots in with no Google (a key made on this machine,
 * served on loopback, tests/lib/page.js). It is honoured only at a
 * loopback http address: anywhere else Google's own keys are used, so a
 * value set by mistake on a deployed server cannot make it trust a key
 * set somebody else serves. tracks-api/node.js never reads it from the
 * environment, and scripts/signin-bypass-check.js holds both to that.
 */
export function jwksUrlFor(env) {
  const asked = env.GOOGLE_JWKS_URL;
  if (!asked) {
    return GOOGLE_JWKS_URL;
  }
  try {
    const url = new URL(asked);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? asked : GOOGLE_JWKS_URL;
  } catch (e) {
    return GOOGLE_JWKS_URL;
  }
}

/* Google's keys, one fetcher per keys URL for the life of the process. */
const KEY_SOURCES = new Map();
function keySource(env) {
  const url = jwksUrlFor(env);
  if (!KEY_SOURCES.has(url)) {
    KEY_SOURCES.set(url, googleKeys({ url }));
  }
  return KEY_SOURCES.get(url);
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sealKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fdfpv-accounts/v1|${env.ACCOUNTS_SECRET}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(env), new TextEncoder().encode(text));
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(ct))}`;
}

/* The sealed text opened, or throws: a wrong ACCOUNTS_SECRET is loud. */
async function unseal(env, sealed) {
  const [v, iv, ct] = String(sealed).split(':');
  if (v !== 'v1' || !iv || !ct) {
    throw new Error('not a sealed pilot key');
  }
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await sealKey(env), fromBase64(ct));
  return new TextDecoder().decode(pt);
}

/*
 * A pilot key as identity.js exportText writes it, checked the whole way:
 * a P-256 private key that signs, and a public key that verifies what it
 * signed. { text, publicKey } or { error }.
 */
async function inspectIdentity(raw) {
  if (typeof raw !== 'string' || raw.length > IDENTITY_MAX_CHARS) {
    return { error: 'That is not a pilot key.' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: 'That is not a pilot key.' };
  }
  const jwk = parsed && parsed.privateJwk;
  if (!parsed || parsed.v !== 1 || !jwk || typeof jwk !== 'object' || jwk.kty !== 'EC' || jwk.crv !== 'P-256'
    || typeof parsed.publicRaw !== 'string' || !KEY_RE.test(parsed.publicRaw)) {
    return { error: 'That is not a pilot key.' };
  }
  const clean = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true, key_ops: ['sign'] };
  try {
    const priv = await crypto.subtle.importKey('jwk', clean, CURVE, true, ['sign']);
    const probe = new TextEncoder().encode('fdfpv-identity-probe/v1');
    const sig = toBase64(new Uint8Array(await crypto.subtle.sign(SIGN, priv, probe)));
    if (!(await verifySignature({ key: parsed.publicRaw, sig, message: probe }))) {
      return { error: 'That pilot key does not match its public half.' };
    }
  } catch (e) {
    return { error: 'That is not a pilot key.' };
  }
  return { text: JSON.stringify({ v: 1, privateJwk: clean, publicRaw: parsed.publicRaw }), publicKey: parsed.publicRaw };
}

async function tokenHash(token) {
  return sha256Base64(`fdfpv-session/v1|${token}`);
}

/* The account a request's bearer session belongs to, or null. */
async function sessionAccount(env, request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!TOKEN_RE.test(token)) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    'SELECT a.*, s.token_hash AS session_hash FROM sessions s JOIN accounts a ON a.id = s.account_id '
    + 'WHERE s.token_hash = ? AND s.expires_s > ?',
  ).bind(await tokenHash(token), now).first();
  return row || null;
}

async function newSession(env, accountId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM sessions WHERE expires_s <= ?').bind(now).run();
  await env.DB.prepare('INSERT INTO sessions (token_hash, account_id, created_utc, expires_s) VALUES (?, ?, ?, ?)')
    .bind(await tokenHash(token), accountId, nowUtc(), now + SESSION_DAYS * 86400).run();
  await env.DB.prepare(
    'DELETE FROM sessions WHERE account_id = ? AND token_hash NOT IN '
    + '(SELECT token_hash FROM sessions WHERE account_id = ? ORDER BY expires_s DESC LIMIT ?)',
  ).bind(accountId, accountId, SESSIONS_PER_ACCOUNT).run();
  return token;
}

async function openIdentity(env, row) {
  return row.identity ? unseal(env, row.identity) : null;
}

/* { verdict } for a request carrying a good GIS ID token in `credential`,
 * or { error }, the refusal to answer with. Counted against the sign in
 * limit either way. */
async function checkCredential(env, request) {
  const limited = await spend(env, request, 'signin', SIGNIN_LIMIT, 'Too many sign ins from here. Try again in a few minutes.');
  if (limited) {
    return { error: limited };
  }
  const read = await readBody(request, SMALL_BODY, 'That sign in is too big.');
  if (read.error) {
    return { error: read.error };
  }
  const credential = read.body && read.body.credential;
  let verdict;
  try {
    verdict = await verifyGoogleIdToken(credential, { clientIds: parseClientIds(env.GOOGLE_CLIENT_ID), key: keySource(env) });
  } catch (e) {
    console.error('google keys:', e && e.message ? e.message : e);
    return { error: refuse(503, 'Google could not be reached to check the sign in. Try again shortly.') };
  }
  if (verdict.error) {
    return { error: refuse(401, 'That Google sign in could not be checked. Try again.', { reason: verdict.error }) };
  }
  return { verdict };
}

async function signIn(env, request) {
  const { verdict, error } = await checkCredential(env, request);
  if (error) {
    return error;
  }
  /* An account that exists is in, invite or no invite: see waitlist.js. */
  const known = await env.DB.prepare('SELECT id FROM accounts WHERE sub = ?').bind(verdict.sub).first();
  if (!known && inviteOnly(env) && !(await invited(env, verdict.email))) {
    return refuse(403, 'This Google account has no beta invite yet.', { notInvited: true });
  }
  const stamp = nowUtc();
  await env.DB.prepare('INSERT INTO accounts (sub, created_utc, updated_utc) VALUES (?, ?, ?) ON CONFLICT (sub) DO NOTHING')
    .bind(verdict.sub, stamp, stamp).run();
  const row = await env.DB.prepare('SELECT * FROM accounts WHERE sub = ?').bind(verdict.sub).first();
  const session = await newSession(env, row.id);
  return json(200, {
    session,
    callsign: row.callsign ?? null,
    publicKey: row.public_key ?? null,
    identity: await openIdentity(env, row),
  });
}

async function claimCallsign(env, request, account) {
  const read = await readBody(request, SMALL_BODY, 'That request is too big.');
  if (read.error) {
    return read.error;
  }
  const b = read.body || {};
  const inspected = inspectCallsign(b.callsign);
  if (inspected.error) {
    return refuse(422, inspected.error, { field: 'callsign' });
  }
  const { callsign } = inspected;
  const key = callsign.toLowerCase();
  const holder = await env.DB.prepare('SELECT id FROM accounts WHERE callsign_key = ?').bind(key).first();
  if (holder && holder.id !== account.id) {
    return refuse(409, 'That callsign belongs to another pilot. Please choose another.', { taken: true });
  }
  if (b.check === true) {
    return json(200, { callsign, available: true });
  }
  try {
    await env.DB.prepare('UPDATE accounts SET callsign = ?, callsign_key = ?, updated_utc = ? WHERE id = ?')
      .bind(callsign, key, nowUtc(), account.id).run();
  } catch (e) {
    /* Two pilots after one callsign at once: the unique index decides. */
    if (/UNIQUE/i.test(String(e && e.message))) {
      return refuse(409, 'That callsign belongs to another pilot. Please choose another.', { taken: true });
    }
    throw e;
  }
  return json(200, { callsign });
}

async function putIdentity(env, request, account) {
  const read = await readBody(request, SMALL_BODY, 'That request is too big.');
  if (read.error) {
    return read.error;
  }
  const inspected = await inspectIdentity(read.body && read.body.identity);
  if (inspected.error) {
    return refuse(422, inspected.error);
  }
  /* Only into an empty slot: the first computer's key is the account's,
   * and a later one can never replace it by racing. */
  await env.DB.prepare('UPDATE accounts SET identity = ?, public_key = ?, updated_utc = ? WHERE id = ? AND identity IS NULL')
    .bind(await seal(env, inspected.text), inspected.publicKey, nowUtc(), account.id).run();
  const row = await env.DB.prepare('SELECT identity, public_key FROM accounts WHERE id = ?').bind(account.id).first();
  return json(200, { identity: await openIdentity(env, row), publicKey: row.public_key });
}

function heldProgress(row) {
  try {
    return row.progress ? JSON.parse(row.progress) : null;
  } catch (e) {
    return null;
  }
}

async function putProgress(env, request, account) {
  const read = await readBody(request, PROGRESS_MAX_CHARS + SMALL_BODY, 'That progress is too big to sync.');
  if (read.error) {
    return read.error;
  }
  const incoming = read.body && read.body.progress;
  if (!incoming || typeof incoming !== 'object') {
    return refuse(400, 'A sync carries the progress blob in `progress`.');
  }
  const refused = blobRefusal(incoming);
  if (refused) {
    const why = {
      map: `The ${refused.section} section is not a map.`,
      count: `More than ${refused.limit} ${refused.section} entries to sync.`,
      shape: `An entry in ${refused.section} is not the right shape.`,
      size: `A build is past ${refused.limit} characters, too big to sync.`,
    };
    return refuse(refused.status, why[refused.why]);
  }
  /* Read, merge, write only if nobody wrote between: two computers
   * syncing in the same instant each merge onto the other's result. */
  for (let attempt = 0; attempt < 4; attempt += 1) {
    /* eslint-disable-next-line no-await-in-loop */
    const row = await env.DB.prepare('SELECT progress, progress_rev FROM accounts WHERE id = ?').bind(account.id).first();
    const merged = mergeBlobs(incoming, heldProgress(row));
    const text = JSON.stringify(merged);
    if (text.length > PROGRESS_MAX_CHARS) {
      return refuse(413, 'That progress is too big to sync.');
    }
    /* eslint-disable-next-line no-await-in-loop */
    const r = await env.DB.prepare('UPDATE accounts SET progress = ?, progress_rev = progress_rev + 1, updated_utc = ? WHERE id = ? AND progress_rev = ?')
      .bind(text, nowUtc(), account.id, row.progress_rev).run();
    if (r.meta.changes) {
      await payEvents(env, account);
      return json(200, { progress: merged, wallet: await settleWallet(env, account.id, merged) });
    }
  }
  return refuse(503, 'The sync collided with another. Try again.');
}

/*
 * A computer that signs in holding a pilot key of its own, with tracks
 * under it, hands them to the account (src/share/account.js asks the pilot
 * first). The tracks keep their ids, names and save counters; only the
 * owner changes, to the key every computer of this account signs with.
 */
async function adoptTracks(env, request, account) {
  const read = await readBody(request, SMALL_BODY, 'That request is too big.');
  if (read.error) {
    return read.error;
  }
  const b = read.body || {};
  if (!account.public_key) {
    return refuse(409, 'This account has no pilot key yet.');
  }
  if (typeof b.key !== 'string' || !KEY_RE.test(b.key) || typeof b.sig !== 'string' || b.key === account.public_key) {
    return refuse(400, 'An adopt carries another pilot key and its signature.');
  }
  if (!(await verifySignature({ key: b.key, sig: b.sig, message: keyLinkMessage(b.key, account.public_key) }))) {
    return refuse(401, 'The signature does not match that key.');
  }
  const r = await env.DB.prepare('UPDATE tracks SET owner = ? WHERE owner = ?').bind(account.public_key, b.key).run();
  return json(200, { tracks: r.meta.changes });
}

async function buy(env, request, account) {
  const read = await readBody(request, SMALL_BODY, 'That request is too big.');
  if (read.error) {
    return read.error;
  }
  const r = await buyItem(env, account.id, read.body && read.body.item);
  if (r.wallet) {
    return json(200, { wallet: r.wallet });
  }
  const why = {
    unknown: 'There is no such item in the shop.',
    earned: 'That item is earned, not sold.',
    owned: 'You already own that item.',
    short: 'Not enough tokens for that item.',
  };
  return refuse(r.status, why[r.why], { why: r.why });
}

async function deleteAccount(env, account) {
  await deleteWallet(env, account.id);
  await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(account.id).run();
  await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(account.id).run();
  return json(200, { deleted: true });
}

/*
 * Whether `token` is a good GIS ID token for one of ADMIN_EMAILS (comma
 * separated, the addresses of the people who run this server), which is
 * how the admin page (admin.html) says who it is: the owner signs in with
 * Google there and the token is the bearer. False when the list is unset,
 * the token is not Google's for this site, its email is unverified or not
 * on the list, or Google's keys cannot be fetched.
 */
export async function isAdminToken(env, token) {
  const admins = String(env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!admins.length) {
    return false;
  }
  try {
    const verdict = await verifyGoogleIdToken(token, { clientIds: parseClientIds(env.GOOGLE_CLIENT_ID), key: keySource(env) });
    return Boolean(verdict.email) && admins.includes(verdict.email);
  } catch (e) {
    console.error('google keys:', e && e.message ? e.message : e);
    return false;
  }
}

export async function waitlistRoute(env, request) {
  if (!accountsOn(env)) {
    return refuse(503, 'Sign in is not available on this server.');
  }
  const { verdict, error } = await checkCredential(env, request);
  if (error) {
    return error;
  }
  if (!verdict.email) {
    return refuse(422, 'That Google account has no verified email address to invite.');
  }
  return json(200, await joinWaitlist(env, verdict.email));
}

export async function accountRoute(env, request, path) {
  if (!accountsOn(env)) {
    return refuse(503, 'Sign in is not available on this server.');
  }
  const { method } = request;
  if (path === '/api/account/google' && method === 'POST') {
    return signIn(env, request);
  }
  const account = await sessionAccount(env, request);
  if (!account) {
    return refuse(401, 'Not signed in, or the session has ended. Sign in again.', { signedOut: true });
  }
  if (path === '/api/account' && method === 'GET') {
    /* id: the account's own number, for the rooms server's DEV_ACCOUNTS
     * (edge/rooms/node.js helloAccount); only ever sent to the account. */
    return json(200, { id: account.id, callsign: account.callsign ?? null, publicKey: account.public_key ?? null });
  }
  if (path === '/api/account/progress' && method === 'GET') {
    return json(200, { progress: cleanBlob(heldProgress(account)) });
  }
  if (path === '/api/account/wallet' && method === 'GET') {
    await payEvents(env, account);
    return json(200, { wallet: await settleWallet(env, account.id, heldProgress(account)) });
  }
  if (path === '/api/account/session' && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(account.session_hash).run();
    return json(200, { signedOut: true });
  }
  const writes = new Set([
    'PUT /api/account/callsign', 'PUT /api/account/identity', 'PUT /api/account/progress', 'POST /api/account/adopt', 'DELETE /api/account',
    'POST /api/account/wallet/buy',
  ]);
  if (!writes.has(`${method} ${path}`)) {
    return refuse(404, 'Nothing here.');
  }
  const limited = await spend(env, request, 'account', ACCOUNT_WRITE_LIMIT, 'Too many changes from here. Try again in a few minutes.');
  if (limited) {
    return limited;
  }
  if (path === '/api/account/callsign') {
    return claimCallsign(env, request, account);
  }
  if (path === '/api/account/identity') {
    return putIdentity(env, request, account);
  }
  if (path === '/api/account/progress') {
    return putProgress(env, request, account);
  }
  if (path === '/api/account/adopt') {
    return adoptTracks(env, request, account);
  }
  if (path === '/api/account/wallet/buy') {
    return buy(env, request, account);
  }
  return deleteAccount(env, account);
}
