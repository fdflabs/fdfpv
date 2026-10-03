/*
 * board.js: the public leaderboard, as this page sees it.
 *
 * THE CONNECTION, WRITTEN DOWN ONCE.
 *
 *   Board page     {board}/
 *   Board API      {board}/api/tracks
 *   Fly a track    {sim}/?map=custom&share={id}&board={board}
 *                  map=custom is Track mode's seat, read as map=track.
 *   Orbit thumb    {sim}/src/share/orbit.html?map=custom&share={id}&board={board}
 *   Publish        POST {board}/api/tracks   { author, document, editKey? }
 *   Update listing POST {board}/api/tracks   same, with the edit key from
 *                  the browser that first published. A name-only update
 *                  keeps the times. A layout change clears them.
 *   Post a time    POST {board}/api/tracks/{id}/times   { name, lapMs, threeMs?, ghost? }
 *                  ghost is the base64 lap recording from
 *                  src/share/ghostdata.js, sent when the lap was recorded
 *                  in this session, so the board can hand it to a chaser.
 *   List times     GET {board}/api/tracks/{id}   times[] carry { id,
 *                  hasGhost } beside name and lapMs; id is the handle a
 *                  ghost is fetched by.
 *   Fetch a ghost  GET {board}/api/tracks/{id}/times/{timeId}/ghost
 *                  { id, name, lapMs, ghost }
 *   File a bug     POST {board}/api/bugs   { kind, title, what, ... }
 *
 * The track document is the only payload. schema.md is the contract. The
 * logo travels inside the document, so a published course wears its sponsor
 * print on every gate and every flag the moment it is flown.
 *
 * The board origin is, in order: a ?board= query, a stored override, then
 * the default for wherever this page is being served from. Nothing here
 * guesses a deployed host: there are exactly two named hosts below and the
 * page picks between them by its own hostname.
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

import { noAircraftFlies, trackClassOf } from '../trackbuilder/elements.js';
import { isMapTrack } from '../trackbuilder/model.js';
import { API_ORIGIN, apiOrigin } from './api.js';
import { writeShareImport } from './session.js';
import { str, currentLocale } from '../strings/index.js';

/*
 * Two named hosts, because this page is served from two kinds of place and
 * only one of them has a board sitting next to it.
 *
 * Development serves the shell off a loopback address with the board on
 * 3180 beside it. Anything else is a deploy, and a deploy has to name its
 * board out loud: the shell is a static site, so there is no environment to
 * read at run time and no server to ask. The name lives in
 * src/share/api.js, shared with the rooms and tracks servers, and the
 * board is its /board mount. Both escape hatches still outrank it,
 * so a fork can point somewhere else without editing this file: a ?board=
 * query wins over everything, and the Publish dialog's stored override wins
 * over the default.
 *
 * "Origin" is now generous: the production value carries a path, because the
 * board is a mount at /board on the owner's VM (deploy/vm/README.md), the
 * same address the tracks and rooms servers answer at, rather than a host
 * of its own. Everything below concatenates onto it and trims a trailing
 * slash, so a prefix works exactly where a bare origin used to, and the
 * only thing that would not is `new URL('/some/path', board)`, which is not
 * done anywhere here.
 */
export const DEFAULT_BOARD_ORIGIN = 'http://127.0.0.1:3180';
const BOARD_MOUNT = '/board';
export const PRODUCTION_BOARD_ORIGIN = `${API_ORIGIN}${BOARD_MOUNT}`;
const ORIGIN_KEY = 'webfpv.board.origin';

/* An empty hostname is a file:// open, which is a developer, not a deploy. */
const LOOPBACK_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/*
 * Whether there is a board to ask. A fork that has no board sets the
 * production host above to PLACEHOLDER_BOARD_ORIGIN, and My tracks then
 * lists the pilot's own tracks and asks nobody. This used to compare with
 * the production host itself, which was the placeholder until the board
 * was deployed, and so kept the deployed page from ever asking it.
 */
const PLACEHOLDER_BOARD_ORIGIN = 'https://fdfpv.example/board';

export function boardConfigured() {
  return boardOrigin() !== PLACEHOLDER_BOARD_ORIGIN;
}

export function defaultBoardOrigin() {
  try {
    return LOOPBACK_HOSTS.has(window.location.hostname)
      ? DEFAULT_BOARD_ORIGIN
      : `${apiOrigin()}${BOARD_MOUNT}`;
  } catch (e) {
    /* No window, as in Node, where the board is the local one or nothing. */
    return DEFAULT_BOARD_ORIGIN;
  }
}

function trimOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function boardOrigin() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('board');
    if (fromUrl) {
      const origin = trimOrigin(fromUrl);
      if (origin) {
        return origin;
      }
    }
  } catch (e) {
    /* No URL to read. */
  }
  try {
    const stored = trimOrigin(localStorage.getItem(ORIGIN_KEY) || '');
    if (stored) {
      return stored;
    }
  } catch (e) {
    /* Private mode. */
  }
  return defaultBoardOrigin();
}

function usableBoardOrigin(origin) {
  const trimmed = trimOrigin(origin);
  if (!trimmed) {
    return '';
  }
  try {
    const here = trimOrigin(window.location.origin);
    /* The board is a different site. Opening this page (the simulator)
     * as the board is how Choose new map reloaded the sim in a new tab. */
    if (here && trimmed === here) {
      return '';
    }
  } catch (e) {
    /* No window, as in Node. */
  }
  return trimmed;
}

/* An omitted, empty, or same-origin value must not become "/". That is
 * this page. `boardPageUrl(null)` also does not use a default argument,
 * because only undefined does, and Choose new map passes share.board,
 * which is null when nothing from the board is loaded. */
/*
 * `craft` carries the pilot's aircraft over to the board, which is a primary
 * choice there rather than a filter: a whoop pilot pressing this link should
 * land on the whoop board, not on a list of tracks that would change their
 * aircraft the moment they pressed Fly. The board takes either the class or
 * the airframe id, so whichever the caller holds is fine. Omitted entirely
 * when nothing is passed, so a link built without one leaves the board on
 * whatever the visitor chose last.
 */
export function boardPageUrl(origin, craft) {
  const base = usableBoardOrigin(origin)
    || usableBoardOrigin(boardOrigin())
    || defaultBoardOrigin();
  const url = craft ? `${base}/?craft=${encodeURIComponent(craft)}` : `${base}/`;
  /* The board reads ?lang= too, so a pilot flying in Spanish reads the
   * board in Spanish. */
  const lang = currentLocale();
  return lang === 'en' ? url : `${url}${url.includes('?') ? '&' : '?'}lang=${encodeURIComponent(lang)}`;
}

async function readJson(res) {
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = null;
  }
  if (!res.ok) {
    const message = (body && body.error) || text || str('board.the_board_answered', { status: res.status });
    const err = new Error(message);
    err.status = res.status;
    err.conflict = Boolean(body && body.conflict) || res.status === 409;
    throw err;
  }
  return body;
}

/*
 * Every READ of the board carries a deadline, and this is the only place
 * that number lives.
 *
 * The board is a Render web service on the free tier, so it sleeps after
 * fifteen minutes of quiet and takes about a minute to wake. DEPLOY.md says
 * the simulator is unaffected because a static site does not sleep, and that
 * was only true while nothing on the boot path talked to the board. It does:
 * a cold visit asks for the most flown track, and every Fly link asks for a
 * document. Without a deadline a board that accepts the connection and then
 * thinks about it for a minute holds the whole boot, under a loading label
 * that blames something else.
 *
 * A read that times out is the same event as a board that is down, which
 * every caller here already treats as "no community courses today". The one
 * exception is a Fly link, where the pilot asked for a specific course by
 * name: main.js turns that rejection into a banner rather than a silent
 * empty menu.
 *
 * Writes are deliberately NOT given a deadline. Abandoning a publish or a
 * posted lap time after eight seconds does not undo it at the far end, so
 * the pilot would be told it failed while the board stored it.
 */
export const BOARD_READ_TIMEOUT_MS = 8000;

function readSignal(ms = BOARD_READ_TIMEOUT_MS) {
  /* AbortSignal.timeout is the whole implementation on any browser that can
   * run this simulator. The guard is for Node, where the harness imports
   * this module to check the URLs it builds. */
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

/* A GET of the board with the deadline above, and a message that names the
 * board rather than leaking DOMException's "signal is aborted without
 * reason". */
async function boardGet(url, ms = BOARD_READ_TIMEOUT_MS) {
  try {
    return await fetch(url, { signal: readSignal(ms) });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      const err = new Error(`The board did not answer within ${Math.round(ms / 1000)} s.`);
      err.timeout = true;
      throw err;
    }
    throw e;
  }
}

/*
 * Every published course, with the plan the board already drew for its own
 * cards. This is what lets the Courses screen show the board's courses in
 * the same grid as the worlds instead of sending the player to another tab:
 * "Choose new map" used to open the board, and the board's own Fly button
 * then opened a SECOND simulator, so picking a course left the player with
 * three tabs and two running physics loops.
 *
 * The list is a nicety, not a dependency. A board that is down, blocked by
 * CORS or simply not running must leave the rest of the screen working, so
 * every caller treats a rejection as "no community courses today".
 */
export async function fetchTrackList(origin = boardOrigin()) {
  const board = trimOrigin(origin);
  const res = await boardGet(`${board}/api/tracks`);
  const body = await readJson(res);
  const tracks = body && Array.isArray(body.tracks) ? body.tracks : [];
  return tracks.map((t) => ({
    id: String(t.id || ''),
    name: String(t.name || str('ui.untitled_track')),
    author: String(t.author || ''),
    /*
     * WHO BUILT IT, WHERE THAT IS NOT WHO PUBLISHED IT. The board derives
     * these from the track's own credit block. Eight of the tracks there
     * were designed by six other people and brought over by one, and a
     * listing that only carries the publisher credits the wrong person.
     */
    designer: String(t.designer || ''),
    series: String(t.series || ''),
    gates: Number(t.gates) || 0,
    /* `best` is the board's own shape: the fastest lap and who flew it. */
    recordMs: t.best && Number.isFinite(Number(t.best.lapMs)) ? Number(t.best.lapMs) : null,
    recordBy: t.best ? String(t.best.name || '') : '',
    times: Number(t.times) || 0,
    publishedUtc: t.publishedUtc ? String(t.publishedUtc) : '',
    plan: t.plan || null,
    /* What the author says it is for. Kept raw rather than through
     * usableTags, because the Race room prints these and a tag from a newer
     * board should show under its own id rather than disappear. */
    tags: Array.isArray(t.tags) ? t.tags.map((x) => String(x)) : [],
    /* Which aircraft flies it: 'wing' is an airfield, and anything else is
     * the sixty metre field, which is what every track published before
     * there were classes is. The board derives it from the stored document,
     * so an older board that does not send it leaves every listing reading
     * as the field, correctly. A class no aircraft flies ('micro', the
     * RaceGOW room) is passed through as it is, so nothing reads it as the
     * field. */
    trackClass: noAircraftFlies(t) ? t.trackClass : trackClassOf(t),
    /* The world a track built inside one stands in, or '' for a field
     * track. The board derives it from the stored document; an older board
     * that does not send it cannot hold a map track at all. */
    map: typeof t.map === 'string' ? t.map : '',
    /*
     * THE FIXED WINGS THAT FIT EVERY GATE of a map track, by airframe id,
     * and the plane board's record and count beside the quads'. The board
     * derives the list from the stored document with this repository's own
     * rule (src/game/verify.js planesFor); an older board that does not send
     * it offers no map track to a plane, which is the safe way to be wrong.
     */
    planes: Array.isArray(t.planes) ? t.planes.map((x) => String(x)) : [],
    planeRecordMs: t.wing && t.wing.best && Number.isFinite(Number(t.wing.best.lapMs)) ? Number(t.wing.best.lapMs) : null,
    planeRecordBy: t.wing && t.wing.best ? String(t.wing.best.name || '') : '',
    planeTimes: t.wing ? Number(t.wing.times) || 0 : 0,
    board,
  })).filter((t) => t.id);
}

const FEATURED_LIMIT = 5;
const FEATURED_FLOWN_FLOOR = 3;

function byMostFlown(a, b) {
  return (b.times || 0) - (a.times || 0)
    || (b.gates || 0) - (a.gates || 0)
    || String(b.publishedUtc || '').localeCompare(String(a.publishedUtc || ''))
    || String(a.id).localeCompare(String(b.id));
}

function shuffled(items) {
  const list = items.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/*
 * Five courses for the pick-a-map strip. Ranked by times posted when that
 * ranking means something. Two or fewer flown courses is not a top five,
 * so those lead and the rest of the five are drawn at random from the
 * ones nobody has posted on yet.
 */
export function pickFeaturedTracks(tracks, limit = FEATURED_LIMIT) {
  const list = (tracks || []).filter((t) => t && t.id);
  const flown = list.filter((t) => (t.times || 0) > 0).sort(byMostFlown);
  if (flown.length >= FEATURED_FLOWN_FLOOR) {
    return list.slice().sort(byMostFlown).slice(0, limit);
  }
  const flownIds = new Set(flown.map((t) => t.id));
  const rest = shuffled(list.filter((t) => !flownIds.has(t.id)));
  return [...flown, ...rest.slice(0, Math.max(0, limit - flown.length))];
}

export async function fetchTrackDocument(id, origin = boardOrigin()) {
  const res = await boardGet(`${trimOrigin(origin)}/api/tracks/${encodeURIComponent(id)}/document`);
  return readJson(res);
}


export async function publishTrack({
  author, document, editKey, origin, tags,
}) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/tracks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      author,
      document,
      editKey: editKey || undefined,
      /*
       * TAGS RIDE IN THE ENVELOPE, BESIDE THE AUTHOR, NOT INSIDE THE
       * DOCUMENT. The author already travels this way and for the same
       * reason: neither is part of the layout. A tag inside the document
       * would need a schemaVersion bump, which needs the board deployed
       * before the simulator, and it would have to be kept out of the
       * layout hash by hand, where getting it wrong silently clears every
       * republished track's posted times.
       *
       * Omitted rather than sent empty when there are none, so a board
       * from before tags sees exactly the request it has always seen.
       */
      tags: tags && tags.length ? tags : undefined,
    }),
  });
  return readJson(res);
}


/*
 * Put a finished freestyle run on the board.
 *
 * The board keeps ONE row per pilot per map and only their best, so posting
 * a worse run is not an error: it answers 200 with `improved: false` and the
 * standing row, and the caller tells the pilot they did not beat themselves
 * rather than congratulating them on a score that is not up there. A better
 * run answers 201.
 *
 * Nothing here is verified by the board and nothing should pretend it is:
 * the board would have to be a second copy of the recogniser and the
 * catalogue to recompute a score, and it deliberately imports neither. It
 * bounds the claim instead. See inspectRun in the board's src/validate.js.
 */
export async function postFreestyleRun({ name, map, style, summary, origin }) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await fetch(`${board}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      map,
      style,
      score: summary.total,
      durationMs: summary.durationMs,
      tricks: summary.tricks,
      unique: summary.unique,
      bestCombo: summary.bestCombo,
      bestTrick: summary.bestTrick,
      crashes: summary.crashes,
      signature: summary.signature,
    }),
  });
  return readJson(res);
}

/* The freestyle board, best first. Same standing as fetchTrackList: a board
 * that is down means an empty list, never a broken menu. */
export async function fetchFreestyleRuns(map, origin = boardOrigin()) {
  const board = trimOrigin(origin);
  const res = await boardGet(`${board}/api/runs${map ? `?map=${encodeURIComponent(map)}` : ''}`);
  const body = await readJson(res);
  const runs = body && Array.isArray(body.runs) ? body.runs : [];
  return runs.map((r) => ({
    name: String(r.name || ''),
    score: Number(r.score) || 0,
    style: String(r.style || ''),
    tricks: Number(r.tricks) || 0,
    signature: String(r.signature || ''),
  })).filter((r) => r.name && r.score > 0);
}

export async function postTime({
  trackId, name, lapMs, ghost, key, sig, craft, origin,
}) {
  const board = trimOrigin(origin || boardOrigin());
  /* The ghost only when there is one: an absent key is what an older board
   * expects, and an explicit null would be a third shape for no gain. */
  const body = { name, lapMs };
  if (ghost) {
    body.ghost = ghost;
  }
  /* The pilot's key and the signature over this exact post, from
   * src/share/identity.js. The board files the name under the key. */
  if (key && sig) {
    body.key = key;
    body.sig = sig;
  }
  /* The fixed wing a plane's lap on a map track was flown on, which files
   * it on the plane board (src/game/verify.js planesFor). Absent on every
   * other lap, which is the shape a board that predates it expects. */
  if (craft) {
    body.craft = craft;
  }
  const res = await fetch(`${board}/api/tracks/${encodeURIComponent(trackId)}/times`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

/*
 * The posted times on one course, for the ghost picker: id, name, lapMs,
 * whether the board holds a recording and the plane that flew it, best
 * first, the board's own order.
 * Same standing as fetchTrackList: a board that is down means an empty
 * picker, never a broken menu, so callers treat rejection as "no times".
 */
export async function fetchTrackTimes(trackId, origin = boardOrigin()) {
  const res = await boardGet(`${trimOrigin(origin)}/api/tracks/${encodeURIComponent(trackId)}`);
  const body = await readJson(res);
  const times = body && Array.isArray(body.times) ? body.times : [];
  return times.map((t) => ({
    id: t.id ? String(t.id) : '',
    name: String(t.name || ''),
    lapMs: Number.isFinite(Number(t.lapMs)) ? Number(t.lapMs) : null,
    hasGhost: Boolean(t.hasGhost),
    /* The fixed wing a plane's lap was flown on, '' for every other lap. */
    craft: typeof t.craft === 'string' ? t.craft : '',
  })).filter((t) => t.lapMs != null);
}

/* One recorded lap off the board, as { id, name, lapMs, ghost } with ghost
 * still base64; src/share/ghostdata.js decodes it. */
export async function fetchGhost(trackId, timeId, origin = boardOrigin()) {
  const board = trimOrigin(origin || boardOrigin());
  const res = await boardGet(
    `${board}/api/tracks/${encodeURIComponent(trackId)}/times/${encodeURIComponent(timeId)}/ghost`,
  );
  return readJson(res);
}

/*
 * A share= id in the URL becomes the track this page will fly. The fetch is
 * the only network this page does for a published track; after that the
 * document sits in the share seat like any other. The return value is that
 * same payload, document included.
 */
export async function adoptShareFromLocation() {
  let id = '';
  try {
    id = new URLSearchParams(window.location.search).get('share') || '';
  } catch (e) {
    return null;
  }
  if (!id) {
    return null;
  }
  const origin = boardOrigin();
  const payload = await fetchTrackDocument(id, origin);
  const document = payload.document || payload;
  /* A track drawn for the race field or a RaceGOW room, which this
   * simulator no longer flies: said, rather than seated as nothing. A
   * RaceGOW room is said by its own sentence, since its aircraft went. */
  if (noAircraftFlies(document)) {
    throw new Error(str('track.no_aircraft'));
  }
  if (!isMapTrack(document)) {
    throw new Error(str('board.that_track_was_drawn_for_the'));
  }
  const share = {
    id: payload.id || id,
    name: payload.name || document.name,
    author: payload.author || '',
    board: origin,
    document,
  };
  /*
   * The seat is how the shell finds the track, so a refused write is
   * not a detail to swallow: private mode and a full quota both return
   * false here, and the boot used to go on and fly whatever the seat held
   * before. The pilot followed a Fly link and flew someone else's track
   * under this one's name. main.js already catches this and
   * puts the message on the banner.
   */
  if (!writeShareImport(share)) {
    throw new Error('This browser would not store that track, so it cannot be flown here.');
  }
  return share;
}
