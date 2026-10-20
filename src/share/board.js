/*
 * board.js: every request this page makes to the public leaderboard, and
 * which leaderboard that is.
 *
 * The routes, relative to the board's base address ({board}):
 *
 *   GET  {board}/api/tracks            the published courses
 *   GET  {board}/api/tracks/{id}/document
 *                                      one course's track document
 *   POST {board}/api/tracks            publish { author, document,
 *                                      editKey?, tags? }; sent again with
 *                                      the edit key it returned, it updates
 *                                      the listing (a rename keeps the
 *                                      times, a layout change clears them)
 *
 * The times, ghosts, freestyle runs and weekly events the board also
 * serves are Flight Club's, and this page asks for none of them since the
 * combat-only cut. The board itself stays: it takes the F8 reports
 * (src/share/bugs.js) and the stats (src/share/stats.js) at this origin.
 *
 * The simulator links to a course as {sim}/?map=custom&share={id}&board=
 * {board}; src/trackbuilder/schema.md is the document contract, and a
 * course's logos travel inside its document.
 *
 * The board's base is, first match wins: a ?board= query, an override kept
 * in localStorage, then the board beside the page (a loopback page talks
 * to a development board on 3180, a deployed page to the /board mount on
 * the API host). The base may carry a path, so everything is joined onto
 * it as text with its trailing slashes trimmed, never through new URL().
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

import { noAircraftFlies, trackClassOf } from '../trackbuilder/elements.js';
import { isMapTrack } from '../trackbuilder/model.js';
import { API_ORIGIN, SITE_HOSTS } from './api.js';
import { carryRenamedKeys } from './oldkeys.js';
import { writeShareImport } from './trackseat.js';
import { str } from '../strings/index.js';

/* The development board, next to a shell served from loopback. */
export const DEFAULT_BOARD_ORIGIN = 'http://127.0.0.1:3180';
/* A deployed shell is a static site with nothing to ask at run time, so
 * its board is named here: the /board mount on the API host, which the
 * rooms and tracks servers share (deploy/vm/README.md). */
export const PRODUCTION_BOARD_ORIGIN = `${API_ORIGIN}/board`;
const OVERRIDE_KEY = 'fdfpv.board.origin';

/* Read at call time, never at load, so moving the old name here before
 * anything asks is enough. */
carryRenamedKeys([['webfpv.board.origin', OVERRIDE_KEY]]);

/* A fork with no board of its own sets its production board to this, and
 * the page then asks no board at all (My tracks lists only the pilot's). */
const NO_BOARD = 'https://fdfpv.example/board';

/* Hostnames that mean a developer's machine; '' is a file:// open. */
const DEV_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

const baseOf = (value) => String(value || '').trim().replace(/\/+$/, '');

/* `fn` with every failure read as "not available". The window, its query
 * and storage are each missing somewhere: Node, a sandbox, private mode. */
function guarded(fn, otherwise) {
  try {
    return fn();
  } catch (e) {
    return otherwise;
  }
}

export function boardConfigured() {
  return boardOrigin() !== NO_BOARD;
}

export function defaultBoardOrigin() {
  const NO_WINDOW = {};
  const host = guarded(() => window.location.hostname, NO_WINDOW);
  if (host === NO_WINDOW) {
    return DEFAULT_BOARD_ORIGIN;
  }
  if (DEV_HOSTS.has(host)) {
    return DEFAULT_BOARD_ORIGIN;
  }
  /* A pull request's preview (docs/PREVIEWS.md) posts no times to the
   * real board. */
  return SITE_HOSTS.includes(host) ? PRODUCTION_BOARD_ORIGIN : NO_BOARD;
}

export function boardOrigin() {
  const asked = guarded(() => baseOf(new URLSearchParams(window.location.search).get('board')), '');
  if (asked) {
    return asked;
  }
  const kept = guarded(() => baseOf(localStorage.getItem(OVERRIDE_KEY)), '');
  return kept || defaultBoardOrigin();
}

/* The body of an answer, or a thrown Error carrying `status` and
 * `conflict` (a 409, or a body that says so) for anything but 2xx. The
 * message is the board's own when it gave one. */
async function answerOf(res) {
  const text = await res.text();
  const body = guarded(() => (text ? JSON.parse(text) : null), null);
  if (res.ok) {
    return body;
  }
  const said = body && body.error;
  const refusal = new Error(said || text || str('board.the_board_answered', { status: res.status }));
  refusal.status = res.status;
  refusal.conflict = res.status === 409 || Boolean(body && body.conflict);
  throw refusal;
}

/*
 * The deadline on every read. The board can sit behind a host that sleeps
 * when idle and takes about a minute to wake, and reads are on the boot
 * path (the most flown course, a Fly link's document), so without a
 * deadline a sleeping board holds the whole boot. A read that times out is
 * treated like a board that is down. Writes get no deadline: giving up on
 * a publish or a lap does not stop the board storing it, and the pilot
 * would be told it failed when it did not.
 */
export const BOARD_READ_TIMEOUT_MS = 8000;

async function read(url) {
  const ms = BOARD_READ_TIMEOUT_MS;
  const canTimeOut = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
  try {
    return await fetch(url, { signal: canTimeOut ? AbortSignal.timeout(ms) : undefined });
  } catch (e) {
    if (!e || (e.name !== 'TimeoutError' && e.name !== 'AbortError')) {
      throw e;
    }
    /* Said in the board's terms, not as an aborted signal. */
    const late = new Error(`The board did not answer within ${Math.round(ms / 1000)} s.`);
    late.timeout = true;
    throw late;
  }
}

async function readBody(url) {
  return answerOf(await read(url));
}

async function send(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return answerOf(res);
}

const listOf = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value || '');
const count = (value) => Number(value) || 0;
const lapOrNull = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/*
 * How one listing from GET /api/tracks reads here. A field the board left
 * out reads as the safe empty value: an older board that sends no class
 * makes every listing the sixty metre field, which is what every track
 * before classes was; one that sends no planes offers a plane nothing.
 */
function listingFrom(t, board) {
  const best = t.best;
  const wing = t.wing;
  const wingBest = wing && wing.best;
  return {
    id: text(t.id),
    name: String(t.name || str('ui.untitled_track')),
    author: text(t.author),
    /* Who designed it, when that is not who published it. */
    designer: text(t.designer),
    series: text(t.series),
    gates: count(t.gates),
    recordMs: best ? lapOrNull(best.lapMs) : null,
    recordBy: best ? text(best.name) : '',
    times: count(t.times),
    publishedUtc: t.publishedUtc ? String(t.publishedUtc) : '',
    plan: t.plan || null,
    /* Kept as sent, so a tag from a newer board still shows by its id. */
    tags: listOf(t.tags).map(String),
    /* A class no aircraft flies (a RaceGOW room) passes through as it is,
     * so nothing mistakes it for the field. */
    trackClass: noAircraftFlies(t) ? t.trackClass : trackClassOf(t),
    map: typeof t.map === 'string' ? t.map : '',
    planes: listOf(t.planes).map(String),
    planeRecordMs: wingBest ? lapOrNull(wingBest.lapMs) : null,
    planeRecordBy: wingBest ? text(wingBest.name) : '',
    planeTimes: wing ? count(wing.times) : 0,
    board,
  };
}

/*
 * The published courses, so the Courses screen can show them beside the
 * worlds. Optional by nature: a board that is down, asleep or blocked
 * rejects here, and every caller reads that as "no community courses".
 */
export async function fetchTrackList(origin = boardOrigin()) {
  const board = baseOf(origin);
  const body = await readBody(`${board}/api/tracks`);
  return listOf(body && body.tracks).map((t) => listingFrom(t, board)).filter((t) => t.id);
}

const FEATURED_LIMIT = 5;
/* Below this many flown courses a "most flown" ranking means nothing. */
const RANKING_FLOOR = 3;

const orZero = (value) => value || 0;

function mostFlownFirst(a, b) {
  return orZero(b.times) - orZero(a.times)
    || orZero(b.gates) - orZero(a.gates)
    || text(b.publishedUtc).localeCompare(text(a.publishedUtc))
    || String(a.id).localeCompare(String(b.id));
}

function inRandomOrder(items) {
  const out = [];
  for (const item of items) {
    out.splice(Math.floor(Math.random() * (out.length + 1)), 0, item);
  }
  return out;
}

/*
 * Courses for the pick-a-map strip. With enough flown courses, the most
 * flown; otherwise the flown ones first and the rest of the strip drawn
 * at random from courses nobody has posted on.
 */
export function pickFeaturedTracks(tracks, limit = FEATURED_LIMIT) {
  const usable = (tracks || []).filter((t) => t && t.id);
  const flown = usable.filter((t) => orZero(t.times) > 0).sort(mostFlownFirst);
  if (flown.length >= RANKING_FLOOR) {
    return [...usable].sort(mostFlownFirst).slice(0, limit);
  }
  const flownIds = new Set(flown.map((t) => t.id));
  const unflown = usable.filter((t) => !flownIds.has(t.id));
  return flown.concat(inRandomOrder(unflown).slice(0, Math.max(0, limit - flown.length)));
}

const trackPath = (board, id) => `${baseOf(board)}/api/tracks/${encodeURIComponent(id)}`;

export async function fetchTrackDocument(id, origin = boardOrigin()) {
  return readBody(`${trackPath(origin, id)}/document`);
}

export async function publishTrack({
  author, document, editKey, origin, tags,
}) {
  /* The tags travel beside the author, outside the document, for the same
   * reason: neither is layout. Inside, they would need a schema bump and
   * would have to be kept out of the layout hash by hand. Left out
   * entirely when there are none, so an older board sees what it always
   * saw. */
  return send(`${baseOf(origin || boardOrigin())}/api/tracks`, {
    author,
    document,
    editKey: editKey || undefined,
    tags: tags && tags.length ? tags : undefined,
  });
}

/*
 * Seat the course a ?share= link names, fetched from the board, and resolve
 * to the seat written (document included), or null with no link. A course
 * this simulator no longer flies is refused with a sentence saying why.
 * A seat that cannot be written is an error too: carrying on would fly
 * whatever the seat held before under this course's name.
 */
export async function adoptShareFromLocation() {
  const id = guarded(() => new URLSearchParams(window.location.search).get('share') || '', '');
  if (!id) {
    return null;
  }
  const board = boardOrigin();
  const payload = await fetchTrackDocument(id, board);
  const document = payload.document || payload;
  if (noAircraftFlies(document)) {
    throw new Error(str('track.no_aircraft'));
  }
  if (!isMapTrack(document)) {
    throw new Error(str('board.that_track_was_drawn_for_the'));
  }
  const seat = {
    id: payload.id || id,
    name: payload.name || document.name,
    author: payload.author || '',
    board,
    document,
  };
  if (!writeShareImport(seat)) {
    throw new Error('This browser would not store that track, so it cannot be flown here.');
  }
  return seat;
}
