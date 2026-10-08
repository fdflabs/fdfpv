/*
 * account.js: the Google sign-in, the page's half.
 *
 * The owner's decisions: a signed in pilot holds one callsign, shown in
 * rooms, on the board and on lap times; progress follows the account
 * between computers; and since 2026-10-03 nobody plays without one: "you
 * shouldn't be able to play this without a registered google account".
 * The server's half, and what it keeps, is tracks-api/accounts.js.
 *
 * GOOGLE_CLIENT_ID is the client id this page signs in with. The server
 * reads its own GOOGLE_CLIENT_ID, a comma separated list, and accepts a
 * token from any id on it, so an old id can keep working for a page
 * loaded before a deploy while this one moves to a new id. Empty, the
 * whole feature is hidden: no row in Pilot, no script from Google,
 * nothing sent anywhere, and no sign in asked of anybody. It is hidden
 * too wherever this page talks to no tracks server (a page off a loopback
 * address without ?tracks=), since that is where accounts live: a fork
 * or a local build with no server plays as the game did before accounts.
 * The deployed site always has one (src/share/cloud.js tracksOrigin), so
 * there the sign in is always asked.
 *
 * THE GATE (mayPlay, needSignIn). Every way into a flight or a room asks
 * needSignIn first: a title or hub card (src/ui/ui.js pickForWay), Fly,
 * Play and Restart (src/main.js ui.onAction), the track builder
 * (ui.onBuild), and making or joining a room, which is where room links,
 * invite codes and a reload's rejoin all go (src/share/rooms.js). So
 * does every card and row that opens something (src/ui/ui.js act and its
 * OPEN_ACTIONS): the menus are for looking at until then. It
 * hands the pilot to the sign in panel (src/ui/accountui.js) and, once
 * they are signed in with a callsign, runs what they asked for. This is
 * the page's half and anybody with the developer tools can step round
 * it; what cannot be stepped round is the servers': progress is only
 * kept for a session, and a room seats only a session the accounts
 * server vouches for (edge/rooms/node.js helloAccount).
 *
 * A session already on this computer goes on working with the accounts
 * server or Google unreachable: it was checked when it was made, so
 * mayPlay reads only what is stored. Only a new sign in needs them both.
 *
 * WHAT SIGNING IN DOES, in order:
 *
 *   1. Google Identity Services hands the page an ID token, which goes to
 *      the tracks server once, and the server answers with its own session.
 *   2. THE PILOT KEY. Names and times on the board and tracks on the
 *      server belong to a browser's pilot key (identity.js). The account
 *      carries one. If it has none yet, this computer's becomes it; if it
 *      has one and this computer holds another, this computer's names,
 *      times and tracks are handed to the account's key (the board's
 *      /api/pilots/link, the server's /api/account/adopt). Either way the
 *      pilot is asked first, because a computer can be somebody else's.
 *      This computer's own key is set aside and comes back on sign out.
 *   3. The callsign is claimed: on the board under the account's key
 *      first (so it is never a name the board gave somebody else), then
 *      on the accounts server.
 *   4. Progress syncs (syncProgress, progressmerge.js): unlocks, paint,
 *      power, parts, tunes, loadouts and the My Hangar builds. The
 *      account's tracks are pulled into My tracks.
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

import {
  createIdentity, keyLinkMessage, memoryStorage, nameClaimMessage,
} from './identity.js';
import { ACCOUNT_KEY, normaliseName, readAccount } from './pilot.js';
import { pullOwnTracks, tracksConfigured, tracksOrigin } from './cloud.js';
import { boardConfigured, boardOrigin } from './board.js';
import { mergeBlobs, pickSynced, stampChanges } from './progressmerge.js';

/*
 * THE CLIENT ID, Google Cloud project paraguayan-drone-combat-sim, a Web
 * client whose authorised JavaScript origins are
 * https://paraguayandronecombatsimulator.com,
 * https://www.paraguayandronecombatsimulator.com, https://fdflabs.github.io
 * and http://127.0.0.1:8080. The button's callback takes the ID token in
 * the page, so no redirect URI is involved. It is public by design: it
 * names this site to Google and grants nothing. Set it to '' to switch
 * sign-in off.
 */
export const GOOGLE_CLIENT_ID = '684567545976-dqpf7tqf764rs0dp7l08it7usb33fo9m.apps.googleusercontent.com';

const GUEST_KEY = 'webfpv.pilot.key.guest.v1';
const SYNCED_KEY = 'webfpv.account.synced.v1';
/* The account's wallet as the server last said it (tracks-api/wallet.js),
 * kept to draw the shop and the locks between answers. The server is the
 * truth: this is never sent, only replaced by what the server says. */
const WALLET_KEY = 'webfpv.account.wallet.v1';
const TIMEOUT_MS = 10000;
/* The session goes as `authorization: Bearer <token>`. */
const AUTH_SCHEME = 'Bearer';

let identity = null;
/* Told when this browser lets go of its account (src/ui/accountui.js):
 * `kept`, the last sync's record (null when nothing was ever merged), and
 * `ended`, true when the server ended the session rather than the pilot. */
let onForget = () => {};
/* The sign in panel's door (onSignInNeeded), and an ask made before the
 * panel was there to take it: a ?room= link joins during boot. */
let gateHandler = null;
let parked = null;

export function accountsAvailable() {
  return Boolean(GOOGLE_CLIENT_ID) && tracksConfigured();
}

export function signedIn() {
  return Boolean(readAccount());
}

/* Whether this page may fly or join: signed in with a callsign, or a
 * page where there are no accounts to sign in to. A session with no
 * callsign yet is not enough, because a room shows the callsign and a
 * rooms server seats nobody without one. */
export function mayPlay() {
  if (!accountsAvailable()) {
    return true;
  }
  const account = readAccount();
  return Boolean(account && account.session && account.callsign);
}

export function onSignInNeeded(fn) {
  gateHandler = fn;
  if (parked) {
    const resume = parked;
    parked = null;
    fn(resume);
  }
}

/*
 * False when the pilot may go on. Otherwise true, and the sign in panel is
 * asked for; `resume`, when given, runs once the pilot has signed in and
 * has a callsign, so a link or a card pressed before signing in still goes
 * where it was going. Only the latest ask is kept.
 */
export function needSignIn(resume = null) {
  if (mayPlay()) {
    return false;
  }
  if (gateHandler) {
    gateHandler(resume);
  } else {
    parked = resume || (() => {});
  }
  return true;
}

function storage() {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (value == null) {
      storage()?.removeItem(key);
    } else {
      storage()?.setItem(key, JSON.stringify(value));
    }
  } catch (e) {
    /* Private mode: the sign in lasts this page and no longer. */
  }
}

function readJson(key) {
  try {
    return JSON.parse(storage()?.getItem(key) || 'null');
  } catch (e) {
    return null;
  }
}

function writeAccount(patch) {
  const next = { ...(readAccount() || {}), ...patch };
  writeJson(ACCOUNT_KEY, next);
  return next;
}

/* An Error with the server's status and body on it; `message` is the
 * server's own sentence, which the caller may show or replace. */
async function api(method, path, body, session = readAccount()?.session) {
  const res = await fetch(`${tracksOrigin()}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(session ? { authorization: `${AUTH_SCHEME} ${session}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let got = null;
  try {
    got = await res.json();
  } catch (e) {
    got = null;
  }
  if (!res.ok) {
    const err = new Error((got && got.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = got;
    if (res.status === 401 && got && got.signedOut) {
      /* The session ended elsewhere (signed out, deleted, expired): this
       * browser is signed out too, keeping the pilot key it has. */
      forgetAccount({ ended: true });
    }
    throw err;
  }
  return got;
}

async function boardPost(path, body) {
  const res = await fetch(`${boardOrigin()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let got = null;
  try {
    got = await res.json();
  } catch (e) {
    got = null;
  }
  if (!res.ok) {
    const err = new Error((got && got.error) || `HTTP ${res.status}`);
    err.status = res.status;
    err.board = true;
    throw err;
  }
  return got;
}

export function startAccounts(id, { forgotten = () => {} } = {}) {
  identity = id;
  onForget = forgotten;
}

/* Asks the accounts server whether this browser's session still stands,
 * for a room that refused it (CLOSE_SIGNIN): an ended one is let go here
 * by api() on the 401, and resolves false. Unreachable resolves null. */
export async function checkSession() {
  if (!readAccount()) {
    return false;
  }
  try {
    await api('GET', '/api/account');
    return true;
  } catch (e) {
    return e.status === 401 ? false : null;
  }
}

/*
 * Sign in with a GIS credential. ask(kind) resolves true or false:
 * 'first' when the account has no pilot key and this computer's would
 * become it, 'merge' when the account has one and this computer's names,
 * times and tracks would be handed to it. Resolves to the account record.
 */
export async function signIn(credential, ask) {
  const got = await api('POST', '/api/account/google', { credential }, null);
  writeAccount({ session: got.session, callsign: null, publicKey: got.publicKey });
  try {
    const localText = await identity.exportText();
    const localKey = await identity.publicKey();
    let accountText = got.identity;
    let carry = null;
    if (!accountText) {
      carry = await ask('first');
      const offered = carry ? localText : await createIdentity(memoryStorage()).exportText();
      accountText = (await api('PUT', '/api/account/identity', { identity: offered })).identity;
    }
    const accountKey = JSON.parse(accountText).publicRaw;
    if (accountKey !== localKey && carry !== false && await ask('merge')) {
      await handOver(localKey, accountText);
    }
    if (accountKey !== localKey) {
      if (!readJson(GUEST_KEY)) {
        writeJson(GUEST_KEY, localText);
      }
      await identity.importText(accountText);
    }
    const record = writeAccount({ callsign: got.callsign ?? null, publicKey: accountKey, keyIsAccounts: true });
    pullOwnTracks().catch(() => {});
    return record;
  } catch (e) {
    /* Nothing of this computer's changed until the key was swapped, which
     * is the last step, so the session alone is let go. */
    writeJson(ACCOUNT_KEY, null);
    throw e;
  }
}

/* This computer's key's board names and times, then its tracks, to the
 * account's key: the board first, because it needs both keys to sign and
 * a retry of either is a no-op once done. */
async function handOver(localKey, accountText) {
  const accountKey = JSON.parse(accountText).publicRaw;
  const message = keyLinkMessage(localKey, accountKey);
  const fromSig = (await identity.signBytes(message)).sig;
  if (boardConfigured()) {
    const carried = createIdentity(memoryStorage());
    await carried.importText(accountText);
    const toSig = (await carried.signBytes(message)).sig;
    await boardPost('/api/pilots/link', { from: localKey, fromSig, to: accountKey, toSig });
  }
  await api('POST', '/api/account/adopt', { key: localKey, sig: fromSig });
}

/*
 * Claim or change the callsign. Checked with the accounts server first
 * (shape, word filter, taken), then claimed on the board under the
 * account's key, then kept. Throws with .status and .board as the refusal
 * came from.
 */
export async function chooseCallsign(raw) {
  const callsign = normaliseName(raw);
  if (!callsign) {
    const err = new Error('shape');
    err.status = 422;
    throw err;
  }
  await api('PUT', '/api/account/callsign', { callsign, check: true });
  if (boardConfigured()) {
    const { key, sig } = await identity.signBytes(nameClaimMessage(callsign));
    await boardPost('/api/pilots', { name: callsign, key, sig });
  }
  const got = await api('PUT', '/api/account/callsign', { callsign });
  writeAccount({ callsign: got.callsign });
  return got.callsign;
}

/* Everything this browser holds for the account goes. The pilot key it
 * had before signing in comes back; one that became the account's own is
 * dropped, and a fresh one is made on next use; one never swapped (a sign
 * in that failed half way) is left as it is. */
function forgetAccount({ ended = false } = {}) {
  const record = readAccount();
  const guest = readJson(GUEST_KEY);
  const kept = readJson(SYNCED_KEY);
  writeJson(ACCOUNT_KEY, null);
  writeJson(SYNCED_KEY, null);
  writeJson(GUEST_KEY, null);
  writeJson(WALLET_KEY, null);
  if (identity) {
    if (guest) {
      identity.importText(guest).catch(() => identity.forget());
    } else if (record && record.keyIsAccounts) {
      identity.forget();
    }
  }
  onForget({ kept, ended });
}

export async function signOut() {
  try {
    await api('DELETE', '/api/account/session');
  } catch (e) {
    /* Signed out here whatever the server said: the session dies with
     * its thirty days anyway. */
  }
  forgetAccount();
}

/* The account, its callsign, its progress and its carried key, gone from
 * the server; then signed out here. Board times stay: they are public
 * records, and their removal is a request to the owner. */
export async function deleteAccount() {
  await api('DELETE', '/api/account');
  forgetAccount();
}

/*
 * ONE SYNC. `settings` is ui.settings. What changed here since the last
 * sync is stamped now; the server merges it with what the other computers
 * sent and answers with the merge, whose `data` the caller applies (and
 * then calls settled() with the settings as they came out, so what loading
 * dropped is not mistaken for a change made here). A computer's first sync
 * stamps nothing, so what it held before it signed in is merged by the
 * rules and never counted newer than another computer's edits. So is a
 * section the last sync did not carry (one this version added, as the
 * builds and the loadouts were): what it held was not changed since.
 */
export async function syncProgress(settings) {
  if (!signedIn()) {
    return null;
  }
  const kept = readJson(SYNCED_KEY);
  const now = pickSynced(settings);
  const stamps = kept ? stampChanges(now, { ...now, ...(kept.data || {}) }, Date.now(), kept.stamps || {}) : {};
  const got = await api('PUT', '/api/account/progress', { progress: { v: 1, data: now, stamps } });
  if (got.wallet) {
    writeJson(WALLET_KEY, got.wallet);
  }
  return mergeBlobs(got.progress, null);
}

/*
 * THE WALLET (docs/ECONOMY.md): { balance, earned, owned: { [item]: how } }.
 * readWallet is the last one the server gave, or null; fetchWallet asks
 * again (the server pays what the held progress shows first); buyItem
 * buys one, and throws the server's refusal (status 402 short, 409 owned
 * or earned only, 404 unknown) with its `why` on err.body.
 */
export function readWallet() {
  return signedIn() ? readJson(WALLET_KEY) : null;
}

export async function fetchWallet() {
  const got = await api('GET', '/api/account/wallet');
  writeJson(WALLET_KEY, got.wallet);
  return got.wallet;
}

export async function buyItem(item) {
  const got = await api('POST', '/api/account/wallet/buy', { item });
  writeJson(WALLET_KEY, got.wallet);
  return got.wallet;
}

/*
 * The merge a sync would answer, with nothing sent: for a computer with
 * no change of its own since its last sync, which would otherwise not
 * hear of another computer's until it changed something or the page was
 * loaded again. Merged here exactly as the server would merge this
 * computer's settings sent with no new stamps, never the account's blob
 * taken as it is: something this computer holds that never reached the
 * account (a build settled as synced by a server that dropped the
 * section) is kept, and the next sync that sends takes it up.
 */
export async function pullProgress(settings) {
  if (!signedIn()) {
    return null;
  }
  const kept = readJson(SYNCED_KEY);
  const got = await api('GET', '/api/account/progress');
  return mergeBlobs({ v: 1, data: pickSynced(settings), stamps: (kept && kept.stamps) || {} }, got.progress);
}

export function settled(settings, merged) {
  writeJson(SYNCED_KEY, { data: pickSynced(settings), stamps: merged.stamps });
}

/* Whether this browser's synced settings differ from the last sync. */
export function progressChanged(settings) {
  const kept = readJson(SYNCED_KEY);
  return !kept || JSON.stringify(pickSynced(settings)) !== JSON.stringify(kept.data);
}
