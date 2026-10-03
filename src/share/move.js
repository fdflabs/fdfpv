/*
 * move.js: carry a guest's browser storage from the game's old address to
 * its own domain, once.
 *
 * A browser keeps localStorage per origin. The game lived at
 * https://fdflabs.github.io/fdfpv/ and now lives at
 * https://paraguayandronecombatsimulator.com, so a guest's settings,
 * builds, progress, stars, tracks and pilot key stay behind on the old
 * origin. A signed in pilot's progress follows the account, but their
 * settings and builds do not.
 *
 * WHY A BOUNCE, AND NOT A PUSH FROM THE OLD PAGE. Once the repository's
 * Pages site has a custom domain, GitHub answers every request under
 * fdflabs.github.io/fdfpv/ with a 301 to the domain, so the old page never
 * runs again; and until it has one, nothing serves the domain, so there is
 * nowhere to push to. No moment has both. But localStorage belongs to the
 * origin, not the path: any page under https://fdflabs.github.io/ reads
 * the old game's storage. So the sender is a page in another of fdflabs'
 * Pages repositories, MOVE_PAGE (deploy/landing-move.html is its source),
 * which imports this module from the domain and calls moveOut(). An iframe
 * cannot do it: a cross site frame gets partitioned storage in every
 * current browser.
 *
 * THE ROUND TRIP, on a visitor's first load of the domain:
 *
 *   1. moveIn() on the domain finds no game state and no marker. It asks
 *      whether MOVE_PAGE is there (a HEAD, so a missing page strands
 *      nobody), writes the marker `asked`, and goes to MOVE_PAGE with the
 *      path and query it was opened at.
 *   2. moveOut() on fdflabs.github.io packs the old storage and comes back
 *      to the domain, at that path and query, with the pack in the URL
 *      fragment. A fragment is never sent to any server.
 *   3. moveIn() takes the pack only because its marker says `asked`,
 *      writes it, marks `done` and strips the fragment from the address
 *      and the history entry. Then the game boots as usual.
 *
 * A pack too long for one address goes in parts, one bounce each
 * (PART_CHARS). Every visitor after that, and every visitor who already
 * has game state on the domain, costs nothing: the marker or the state is
 * there and moveIn() returns at once.
 *
 * THE MERGE RULE. Asked for "import only if the new origin's storage is
 * empty or older". The old storage has no time on it, and after the move
 * it can no longer be written (its page only redirects), so whatever the
 * domain holds is newer by construction, and "empty or older" is "empty":
 * the bounce only starts on a domain with no game state, and a pack is
 * only taken while the marker it wrote says so. A link someone crafts with
 * a pack in it is therefore ignored, and cannot replace a pilot's key.
 *
 * WHAT GOES. Every localStorage key of the game's (KEY), except the
 * overrides that pin a server (a pilot would be stuck on the old address)
 * and the account session: a signed in pilot signs in again on the domain
 * and the account brings their progress, and the pilot key that goes is
 * the guest key they would have on signing out, never the account's.
 * sessionStorage (a room's seat) does not go. IndexedDB does not go: the
 * saved replays in My clips are files, a few megabytes each, and the orbit
 * previews are a cache that rebuilds itself.
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

import { SITE_ORIGIN } from './api.js';

/* The sender. It must be on https://fdflabs.github.io, the old origin. */
export const MOVE_PAGE = 'https://fdflabs.github.io/fdfpv-landing/move/';

/* Where a pack may go. Hard coded, never read from the URL: the pack holds
 * the pilot's private key. */
export const MOVE_TARGET = SITE_ORIGIN;
export const MOVE_HOSTS = [new URL(SITE_ORIGIN).hostname, `www.${new URL(SITE_ORIGIN).hostname}`];

export const FRAGMENT = 'pdcs-move';
export const MARKER_KEY = 'pdcs.move.v1';
const PARTS_KEY = 'pdcs.move.parts.v1';

/* Characters of pack in one address. Chromium takes 2 MB of URL and
 * Firefox about 1 MB; half a megabyte leaves both room, and a guest's
 * whole storage packs to well under it (it is JSON, deflated). */
export const PART_CHARS = 500000;

/* A pack that comes back later than this after the ask is not the answer
 * to it. */
const ASK_TTL_MS = 10 * 60 * 1000;
const PAGE_PROBE_MS = 2000;

export const KEY = /^(webfpv[._]|fdfpv\.)/;
export const EXCLUDED = new Set([
  'fdfpv.rooms',
  'webfpv.tracks.origin',
  'webfpv.board.origin',
  'webfpv.account.v1',
  'webfpv.account.synced.v1',
  'webfpv.probe',
]);
const ACCOUNT_KEY = 'webfpv.account.v1';
const PILOT_KEY = 'webfpv.pilot.key.v1';
const GUEST_PILOT_KEY = 'webfpv.pilot.key.guest.v1';

const BOT = /bot|crawl|spider|slurp|lighthouse|preview/i;

function storageKeys(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    keys.push(storage.key(i));
  }
  return keys;
}

export function carried(key) {
  return KEY.test(key) && !EXCLUDED.has(key);
}

export function hasGameState(storage) {
  return storageKeys(storage).some(carried);
}

/* The entries that go, as a plain object. A signed in browser's pilot key
 * is the account's (src/share/account.js keeps the guest's aside under
 * GUEST_PILOT_KEY); what goes is the guest's, as signing out would leave. */
export function entriesOf(storage) {
  const out = {};
  for (const key of storageKeys(storage).sort()) {
    if (carried(key)) {
      out[key] = storage.getItem(key);
    }
  }
  let account = null;
  try {
    account = JSON.parse(storage.getItem(ACCOUNT_KEY) || 'null');
  } catch (e) {
    account = null;
  }
  if (account && account.keyIsAccounts) {
    delete out[PILOT_KEY];
    if (out[GUEST_PILOT_KEY] != null) {
      out[PILOT_KEY] = out[GUEST_PILOT_KEY];
    }
  }
  delete out[GUEST_PILOT_KEY];
  return out;
}

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function through(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/* 'z' then deflate-raw, or 'j' then the bare JSON where a browser has no
 * CompressionStream. Both sides are the same browser, so a 'z' pack is
 * only ever opened where it can be. The same storage packs to the same
 * text every time, which is what lets each bounce of a long pack send
 * the next part of one pack: so no time or other changing thing in it. */
export async function encodePack(entries) {
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, entries }));
  if (typeof CompressionStream === 'function') {
    return `z${toBase64Url(await through(json, new CompressionStream('deflate-raw')))}`;
  }
  return `j${toBase64Url(json)}`;
}

export async function decodePack(text) {
  const kind = text[0];
  let bytes = fromBase64Url(text.slice(1));
  if (kind === 'z') {
    bytes = await through(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind !== 'j') {
    throw new Error('not a pack');
  }
  const pack = JSON.parse(new TextDecoder().decode(bytes));
  if (!pack || pack.v !== 1 || typeof pack.entries !== 'object' || pack.entries === null) {
    throw new Error('not a pack');
  }
  for (const [key, value] of Object.entries(pack.entries)) {
    if (!carried(key) || typeof value !== 'string') {
      throw new Error(`a pack may not carry ${key}`);
    }
  }
  return pack;
}

export async function digestOf(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* `index.count.digest.chars`, or `empty` for a guest with nothing. */
export async function partsOf(text) {
  if (!text) {
    return ['empty'];
  }
  const digest = await digestOf(text);
  const count = Math.ceil(text.length / PART_CHARS);
  const parts = [];
  for (let i = 0; i < count; i += 1) {
    parts.push(`${i}.${count}.${digest}.${text.slice(i * PART_CHARS, (i + 1) * PART_CHARS)}`);
  }
  return parts;
}

export function parsePart(raw) {
  if (raw === 'empty') {
    return { empty: true };
  }
  const m = /^(\d+)\.(\d+)\.([0-9a-f]{16})\.([A-Za-z0-9_-]+)$/.exec(raw || '');
  if (!m || Number(m[1]) >= Number(m[2])) {
    return null;
  }
  return { index: Number(m[1]), count: Number(m[2]), digest: m[3], chars: m[4] };
}

export function fragmentPart(hash) {
  const m = new RegExp(`^#${FRAGMENT}=(.*)$`).exec(hash || '');
  return m ? m[1] : null;
}

/* The path and query the visitor opened, kept across the bounce; anything
 * that is not a path on the domain is the domain's root. */
export function safeBack(back) {
  if (typeof back !== 'string' || !back.startsWith('/') || back.startsWith('//')) {
    return '/';
  }
  try {
    const url = new URL(back, MOVE_TARGET);
    return url.origin === MOVE_TARGET ? `${url.pathname}${url.search}` : '/';
  } catch (e) {
    return '/';
  }
}

export function returnUrl(back, part) {
  return `${MOVE_TARGET}${safeBack(back)}${part == null ? '' : `#${FRAGMENT}=${part}`}`;
}

export function askUrl(back, index = 0) {
  const url = new URL(MOVE_PAGE);
  url.searchParams.set('back', safeBack(back));
  if (index) {
    url.searchParams.set('part', String(index));
  }
  return url.href;
}

/*
 * THE SENDER, on the old origin. Packs this origin's game storage and goes
 * to the domain with part `?part=` of it (the first by default). Leaves
 * the old storage as it is: it is the guest's, and the bounce may be
 * asked again for the next part.
 */
export async function moveOut(win = window) {
  const params = new URLSearchParams(win.location.search);
  const back = params.get('back');
  const index = Number(params.get('part') || 0);
  const entries = entriesOf(win.localStorage);
  const text = Object.keys(entries).length ? await encodePack(entries) : '';
  const parts = await partsOf(text);
  const part = Number.isInteger(index) && index >= 0 && index < parts.length ? parts[index] : null;
  const to = returnUrl(back, part);
  win.location.replace(to);
  return to;
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null');
  } catch (e) {
    return null;
  }
}

function writeJson(storage, key, value) {
  if (value == null) {
    storage.removeItem(key);
  } else {
    storage.setItem(key, JSON.stringify(value));
  }
}

async function pageAnswers(fetchImpl) {
  try {
    const res = await fetchImpl(MOVE_PAGE, { method: 'HEAD', signal: AbortSignal.timeout(PAGE_PROBE_MS) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

function stripFragment(win) {
  const { pathname, search } = win.location;
  win.history.replaceState(win.history.state, '', `${pathname}${search}`);
}

/* Never settles: the page is on its way somewhere else, and the boot
 * behind the caller must not run and write state meanwhile. */
function leave(win, url) {
  win.location.replace(url);
  return new Promise(() => {});
}

/*
 * THE RECEIVER, on the domain, before anything else in the boot touches
 * storage (src/boot.js start). Resolves to what it did, for the checks:
 * 'off' (not the domain), 'done' (nothing to do), 'kept' (the domain
 * already had game state), 'skipped' (a crawler, or no MOVE_PAGE),
 * 'ignored' (a pack nobody asked for), 'empty' (asked, and the guest had
 * nothing), 'imported', 'failed'. Never resolves when it leaves the page.
 */
export async function moveIn({ win = window, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (!MOVE_HOSTS.includes(win.location.hostname)) {
    return 'off';
  }
  let local;
  let session;
  try {
    local = win.localStorage;
    session = win.sessionStorage;
    local.getItem(MARKER_KEY);
  } catch (e) {
    /* Storage refused (blocked site data, some private windows): there is
     * nowhere to put a pack, so nothing to ask for. */
    return 'off';
  }
  const raw = fragmentPart(win.location.hash);
  if (raw !== null) {
    stripFragment(win);
  }
  const marker = readJson(local, MARKER_KEY);
  const asked = marker && marker.state === 'asked' && now - marker.at < ASK_TTL_MS;
  if (raw === null) {
    if (marker && marker.state === 'asked') {
      /* Asked, and came back without an answer (the sender failed, or the
       * pilot pressed Back): the boot about to run writes state, so a late
       * answer must not be taken over it. */
      writeJson(local, MARKER_KEY, { state: 'done', at: now, result: 'unanswered' });
      writeJson(session, PARTS_KEY, null);
      return 'done';
    }
    if (marker) {
      return 'done';
    }
    if (hasGameState(local)) {
      writeJson(local, MARKER_KEY, { state: 'done', at: now, result: 'kept' });
      return 'kept';
    }
    if (BOT.test(win.navigator?.userAgent || '') || win.navigator?.webdriver) {
      return 'skipped';
    }
    if (!(await pageAnswers(fetchImpl))) {
      return 'skipped';
    }
    writeJson(local, MARKER_KEY, { state: 'asked', at: now });
    writeJson(session, PARTS_KEY, null);
    return leave(win, askUrl(`${win.location.pathname}${win.location.search}`));
  }
  if (!asked) {
    return 'ignored';
  }
  const part = parsePart(raw);
  const finish = (result, reason) => {
    writeJson(local, MARKER_KEY, { state: 'done', at: now, result, ...(reason ? { reason } : {}) });
    writeJson(session, PARTS_KEY, null);
    return result;
  };
  if (!part) {
    return finish('failed', 'unparsed-part');
  }
  if (part.empty) {
    return finish('empty');
  }
  const held = readJson(session, PARTS_KEY);
  const parts = held && held.digest === part.digest && held.count === part.count ? held.parts : [];
  if (part.index !== parts.length) {
    return finish('failed', `part-${part.index}-not-${parts.length}`);
  }
  parts.push(part.chars);
  if (parts.length < part.count) {
    writeJson(session, PARTS_KEY, { digest: part.digest, count: part.count, parts });
    return leave(win, askUrl(`${win.location.pathname}${win.location.search}`, parts.length));
  }
  const text = parts.join('');
  try {
    if (await digestOf(text) !== part.digest) {
      return finish('failed', 'digest-mismatch');
    }
    const pack = await decodePack(text);
    for (const [key, value] of Object.entries(pack.entries)) {
      local.setItem(key, value);
    }
  } catch (e) {
    /* A pack that will not open, or a storage that refuses it: the boot
     * goes on with what the domain has, and the marker says why. */
    return finish('failed', String(e && e.message ? e.message : e));
  }
  return finish('imported');
}
