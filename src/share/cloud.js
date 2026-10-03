/*
 * cloud.js: the pilot's tracks, online, for everybody.
 *
 * The owner's problem, in his words: "I create a track, then I go home on
 * another computer and log into the same website and I can't see the
 * track." Tracks lived only in this browser's local storage. Now every
 * saved track also goes to the tracks server (tracks-api/worker.js), where
 * anybody can list it, open it and fly it, with no login.
 *
 * WHAT IS WHOSE. There are no accounts. Each browser already has a pilot key
 * (src/share/identity.js); an upload is signed with it, and the server files
 * a track id under the first key that saved it. Saving it again from here
 * updates it. A save of an id the server says is another pilot's becomes a
 * copy under a new id (forkTrack in src/trackbuilder/storage.js), so an edit
 * of someone else's track can never overwrite theirs. A pilot who wants to
 * edit their own tracks on a second computer carries the key over with
 * Settings, Export pilot key, and Import on the other one.
 *
 * THE LIBRARY STAYS THE COPY THAT COUNTS. storage.js saves locally and marks
 * the track pending; this file uploads pending tracks one at a time, and a
 * failure leaves the track pending here and tries again: when the next save
 * happens, when the browser says it is back online, and on a timer that
 * backs off to five minutes. Every outcome is announced as an event the
 * builder and My tracks show, so a track that has not gone up says so.
 *
 * WHICH SERVER. A ?tracks= query (remembered here, `?tracks=off` forgets
 * it), else the production server when this page is deployed. A page served
 * off a loopback address talks to no server unless told to, because the
 * browser checks run there, and a check that saves tracks must never put
 * them in everybody's list.
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

import { isMapTrack, normalize, toPlain } from '../trackbuilder/model.js';
import {
  TRACK_SAVED_EVENT, forkTrack, loadMapTrack, markUnsyncedTracks, readOnlineStates,
  storeFromServer, writeOnlineState,
} from '../trackbuilder/storage.js';
import { sha256Base64, trackDeleteMessage, trackMessage } from './identity.js';
import { readPilotName } from './pilot.js';
import { str } from '../strings/index.js';
import { API_ORIGIN, apiOrigin } from './api.js';

/*
 * The deployed server: tracks-api/node.js on the owner's VM, behind Caddy
 * (deploy/vm/README.md), at the origin src/share/api.js names. A fork
 * without a server sets PRODUCTION_TRACKS_ORIGIN to PLACEHOLDER_ORIGIN,
 * which counts as no server at all: the page then behaves exactly like
 * the build before this file.
 */
const PLACEHOLDER_ORIGIN = 'https://fdfpv-tracks.example.workers.dev';
export const PRODUCTION_TRACKS_ORIGIN = API_ORIGIN;
const ORIGIN_KEY = 'webfpv.tracks.origin';

/* The event every upload outcome goes out on: detail { id, name, state,
 * error, forkedTo }. */
export const TRACK_SYNC_EVENT = 'webfpv-tracks-sync';

const LOOPBACK_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const READ_TIMEOUT_MS = 8000;
const RETRY_FIRST_MS = 15000;
const RETRY_MAX_MS = 5 * 60 * 1000;

function trim(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function tracksOrigin() {
  try {
    const asked = new URLSearchParams(window.location.search).get('tracks');
    if (asked === 'off') {
      localStorage.removeItem(ORIGIN_KEY);
    } else if (asked && /^https?:\/\//.test(asked)) {
      localStorage.setItem(ORIGIN_KEY, trim(asked));
    }
  } catch (e) {
    /* No URL or no storage: the stored value or the default decides. */
  }
  try {
    const stored = trim(localStorage.getItem(ORIGIN_KEY));
    if (stored) {
      return stored;
    }
  } catch (e) {
    /* Private mode. */
  }
  try {
    if (LOOPBACK_HOSTS.has(window.location.hostname)) {
      return '';
    }
  } catch (e) {
    return '';
  }
  return PRODUCTION_TRACKS_ORIGIN === PLACEHOLDER_ORIGIN ? '' : apiOrigin();
}

export function tracksConfigured() {
  return Boolean(tracksOrigin());
}

let identity = null;

export async function pilotKey() {
  return identity ? identity.publicKey() : '';
}

function announce(detail) {
  try {
    window.dispatchEvent(new CustomEvent(TRACK_SYNC_EVENT, { detail }));
  } catch (e) {
    /* No window. */
  }
}

async function readBody(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return null;
  }
}

async function get(path) {
  const res = await fetch(`${tracksOrigin()}${path}`, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
  const body = await readBody(res);
  if (!res.ok) {
    const err = new Error(str('cloud.server_said', { status: res.status }));
    err.status = res.status;
    throw err;
  }
  return body;
}

/* What the pilot is told when the server refused an upload, from the
 * status and the field it names, never the server's own English. */
function refusalText(status, body) {
  if (status === 422 && body && body.field === 'author') {
    return str('cloud.pilot_name_not_allowed');
  }
  if (status === 422) {
    return str('cloud.track_name_not_allowed');
  }
  if (status === 413) {
    return str('cloud.track_too_big');
  }
  return str('cloud.server_refused', { status });
}

/* One summary off the server, shaped for the track cards. */
function summary(t) {
  return {
    id: String(t.id || ''),
    name: String(t.name || str('ui.untitled_track')),
    author: String(t.author || ''),
    owner: String(t.owner || ''),
    map: typeof t.map === 'string' ? t.map : '',
    gates: Number(t.gates) || 0,
    planes: Array.isArray(t.planes) ? t.planes.map(String) : [],
    updatedUtc: String(t.updatedUtc || ''),
  };
}

/* One page of everybody's tracks, newest save first: { tracks, next }. */
export async function fetchAllTracks({ before = '', owner = '', limit = 24 } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (before) {
    q.set('before', before);
  }
  if (owner) {
    q.set('owner', owner);
  }
  const body = await get(`/api/tracks?${q}`);
  return {
    tracks: (body && Array.isArray(body.tracks) ? body.tracks : []).map(summary).filter((t) => t.id),
    next: body && typeof body.next === 'string' ? body.next : '',
  };
}

/* One track's document, read through the simulator's own normalize. */
export async function fetchTrack(id) {
  const body = await get(`/api/tracks/${encodeURIComponent(id)}`);
  const doc = body && body.document ? normalize(body.document).doc : null;
  if (!doc || !isMapTrack(doc)) {
    throw new Error(str('cloud.not_a_track'));
  }
  return { ...summary(body), doc };
}

/*
 * THIS PILOT'S TRACKS FROM THE SERVER, INTO THE LIBRARY. A track saved under
 * this key on another computer (the key carried over) that is not here, or
 * is newer there than the last time this browser saw it, is written into
 * the library, unless it has an edit of its own waiting to go up here, in
 * which case the edit made here wins on its upload. Returns how many tracks
 * changed.
 */
export async function pullOwnTracks() {
  const key = await pilotKey();
  if (!key || !tracksConfigured()) {
    return 0;
  }
  const states = readOnlineStates();
  let changed = 0;
  let before = '';
  for (let page = 0; page < 8; page += 1) {
    /* eslint-disable-next-line no-await-in-loop */
    const { tracks, next } = await fetchAllTracks({ owner: key, before, limit: 50 });
    for (const t of tracks) {
      const st = states[t.id];
      const here = loadMapTrack(t.id);
      const waiting = st && (st.state === 'pending' || st.state === 'delete');
      const stale = !here || !st || !st.updatedUtc || st.updatedUtc < t.updatedUtc;
      if (waiting || !stale) {
        continue;
      }
      /* eslint-disable-next-line no-await-in-loop */
      const got = await fetchTrack(t.id);
      /* eslint-disable-next-line no-await-in-loop */
      const hash = await uploadHash(t.author, JSON.stringify(toPlain(got.doc)));
      if (storeFromServer(got.doc, { hash, updatedUtc: t.updatedUtc })) {
        changed += 1;
      }
    }
    if (!next) {
      break;
    }
    before = next;
  }
  return changed;
}

function uploadHash(author, text) {
  return sha256Base64(`${author}\n${text}`);
}

/*
 * THE UPLOADER. One pass takes every pending track and every pending delete
 * in turn, one request at a time. It stops at the first failure that is the
 * network's or the server's rather than the track's, and comes back later;
 * a refusal that is about the track itself (a name the filter will not take)
 * marks that track failed, says why, and moves on to the next.
 */
let running = false;
let again = false;
let retryTimer = null;
let retryMs = RETRY_FIRST_MS;

function retryLater(ms) {
  if (retryTimer != null) {
    clearTimeout(retryTimer);
  }
  retryTimer = setTimeout(() => {
    retryTimer = null;
    syncNow();
  }, ms);
}

async function send(method, id, body) {
  const res = await fetch(`${tracksOrigin()}/api/tracks/${encodeURIComponent(id)}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await readBody(res) };
}

/*
 * Record what became of an upload of `text`, unless the track was saved
 * again while the upload was on the wire. That save has not gone up, so the
 * track stays pending, keeping what the server now holds for the next hash
 * compare, and the pass goes round again. Writing the outcome regardless
 * marked a save made during an upload as online when only the one before
 * it was, and nothing ever sent it.
 */
function settle(id, text, outcome) {
  const now = loadMapTrack(id);
  if (now && JSON.stringify(toPlain(now)) !== text) {
    writeOnlineState(id, { state: 'pending', hash: outcome.hash, updatedUtc: outcome.updatedUtc });
    again = true;
    return;
  }
  writeOnlineState(id, outcome);
}

async function uploadOne(id, st) {
  const doc = loadMapTrack(id);
  if (!doc) {
    writeOnlineState(id, null);
    return 'next';
  }
  const author = readPilotName() || '';
  const text = JSON.stringify(toPlain(doc));
  const hash = await uploadHash(author, text);
  if (st.hash === hash && st.updatedUtc) {
    settle(id, text, { state: 'online', hash, updatedUtc: st.updatedUtc });
    announce({ id, name: doc.name, state: 'online' });
    return 'next';
  }
  let ts = Date.now();
  for (let tries = 0; tries < 2; tries += 1) {
    const signed = await identity.signBytes(await trackMessage({ id, ts, author, documentText: text }));
    const r = await send('PUT', id, { document: text, author, ts, ...signed });
    if (r.status === 200 || r.status === 201) {
      settle(id, text, { state: 'online', hash, updatedUtc: r.body && r.body.updatedUtc });
      announce({ id, name: doc.name, state: 'online' });
      return 'next';
    }
    if (r.status === 409 && r.body && r.body.conflict) {
      const forkedTo = forkTrack(id);
      announce({ id, name: doc.name, state: 'forked', forkedTo });
      return 'next';
    }
    if (r.status === 409 && r.body && r.body.stale && Number.isSafeInteger(r.body.ts)) {
      /* This computer's clock is behind the one that saved last under the
       * same key. The edit made here is the newest one, so it goes above. */
      ts = r.body.ts + 1;
      continue;
    }
    if (r.status === 429 || r.status >= 500) {
      const wait = r.body && Number(r.body.retryAfterS) > 0 ? Number(r.body.retryAfterS) * 1000 : retryMs;
      announce({ id, name: doc.name, state: 'pending', error: str('cloud.will_retry') });
      return { wait };
    }
    const error = refusalText(r.status, r.body);
    settle(id, text, { ...st, state: 'failed', error });
    announce({ id, name: doc.name, state: 'failed', error });
    return 'next';
  }
  return { wait: retryMs };
}

async function deleteOne(id) {
  const ts = Date.now();
  const signed = await identity.signBytes(trackDeleteMessage({ id, ts }));
  const r = await send('DELETE', id, { ts, ...signed });
  if (r.status === 429 || r.status >= 500) {
    return { wait: retryMs };
  }
  /* Deleted, not there, or not ours to delete: nothing more to do. */
  writeOnlineState(id, null);
  return 'next';
}

export async function syncNow() {
  if (!identity || !tracksConfigured()) {
    return;
  }
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      const states = readOnlineStates();
      const work = Object.keys(states).filter((id) => states[id].state === 'pending' || states[id].state === 'delete');
      for (const id of work) {
        const st = readOnlineStates()[id];
        if (!st) {
          continue;
        }
        let out;
        try {
          /* eslint-disable-next-line no-await-in-loop */
          out = st.state === 'delete' ? await deleteOne(id) : await uploadOne(id, st);
        } catch (e) {
          /* The network: offline, a DNS failure, a server that does not
           * answer. The track stays pending and says so. */
          const doc = st.state === 'delete' ? null : loadMapTrack(id);
          announce({ id, name: doc ? doc.name : '', state: 'pending', error: str('cloud.offline') });
          out = { wait: retryMs };
        }
        if (out !== 'next') {
          retryLater(out.wait);
          retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
          return;
        }
      }
      retryMs = RETRY_FIRST_MS;
    } while (again);
  } finally {
    running = false;
  }
}

/*
 * Start uploading, once, at boot. `id` is the pilot's identity from
 * createIdentity. Tracks saved before this build are marked for upload here,
 * which is how a pilot's existing tracks reach the server the first time.
 */
export function startTrackSync(id) {
  identity = id;
  if (!tracksConfigured()) {
    return;
  }
  markUnsyncedTracks();
  let soon = null;
  const kick = () => {
    if (soon != null) {
      clearTimeout(soon);
    }
    soon = setTimeout(() => {
      soon = null;
      syncNow();
    }, 400);
  };
  window.addEventListener(TRACK_SAVED_EVENT, kick);
  window.addEventListener('online', () => {
    retryMs = RETRY_FIRST_MS;
    kick();
  });
  kick();
}
