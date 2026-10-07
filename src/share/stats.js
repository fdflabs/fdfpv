/*
 * stats.js: the only thing in the simulator that reports usage to the
 * board, and the rules that keep that report anonymous.
 *
 * The board's statistics page holds counters and nothing else: a total per
 * UTC day, and per day per dimension (aircraft, map, input, surface,
 * country). No row there can describe one browser, because nothing this
 * module sends could fill one. It sends three kinds of event:
 *
 *   visit    at most once per browser per UTC day, shared by the
 *            simulator, the builder and the board: which page, and
 *            whether this browser has been counted on an earlier day.
 *   session  once per page load, when the aircraft first leaves the stand:
 *            aircraft, map, input.
 *   flush    every FLUSH_MS while a session runs, and when the page goes:
 *            laps, flight seconds and crashes since the previous flush,
 *            plus a per-tab handle.
 *
 * Never sent: addresses, user agents, screen sizes, referrers, pilot names,
 * track ids, tunes, lap times or any timestamp. The board stamps the day
 * from its own clock. The tab handle is minted at page load, only lets the
 * board count tabs flying right now (it keeps it in memory for minutes),
 * and dies with the tab.
 *
 * Kept in this browser and never sent: the first and the latest day it was
 * counted, a sponsor slug from a poster link (for SOURCE_DAYS), and the
 * pilot's opt out. Only what they imply leaves.
 *
 * KEEP IN STEP WITH public/stats.js in the board's repository, which
 * cannot be imported from here. Where the two pages share an origin they
 * share the stored memory on purpose (src/share/sharedkeys.js), so opting
 * out on one opts out on the other.
 *
 * Off the physics path: counters come from race state the render loop
 * already has, and every send is fire and forget, so a board that is down
 * costs a flying pilot nothing.
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

import { boardOrigin } from './board.js';
import { STATS_KEY, readSharedKey, writeSharedKey } from './sharedkeys.js';

/* A poster arrival who comes back at the weekend is still that poster's;
 * after a month it stops being a label. */
const SOURCE_DAYS = 30;

/* The slug shape the board's src/sponsors.js accepts. That copy decides:
 * a slug that passes here but names no sponsor is counted as `other`. */
const SLUG = /^[a-z0-9-]{2,32}$/;

/* Also the "flying now" heartbeat, so a flush goes out every minute even
 * when the minute held nothing. */
export const FLUSH_MS = 60_000;

/* The most one flush may carry, matching what the board accepts. A minute
 * cannot hold more; a bigger number is a jumped clock or a bug here, and
 * sending the cap beats sending something the board refuses. */
const PER_FLUSH = { laps: 30, flightS: 90, crashes: 60 };

const DAY_MS = 86_400_000;

const utcDay = () => new Date().toISOString().slice(0, 10);

/* Whole days from one YYYY-MM-DD to another; unreadable dates are
 * infinitely far apart, so a mangled day never keeps a slug alive. */
function dayGap(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY_MS) : Infinity;
}

/* What this browser remembers, always as a plain object. Storage that is
 * refused or holds junk reads as empty: such a browser is counted as new
 * each day, and the board's page says that rather than guessing. */
function recall() {
  let memory = null;
  try {
    memory = JSON.parse(readSharedKey(STATS_KEY) || 'null');
  } catch (e) {
    return {};
  }
  const usable = memory !== null && typeof memory === 'object' && !Array.isArray(memory);
  return usable ? memory : {};
}

function remember(memory) {
  try {
    writeSharedKey(STATS_KEY, JSON.stringify(memory));
    return true;
  } catch (e) {
    return false;
  }
}

/* Global Privacy Control is a request to send nothing, so nothing is sent.
 * The board also honours the header for browsers that send it without the
 * property. */
export function privacyRefused() {
  try {
    return navigator.globalPrivacyControl === true;
  } catch (e) {
    return false;
  }
}

export function optedOut() {
  return recall().optOut === true;
}

export function setOptedOut(on) {
  const memory = recall();
  memory.optOut = Boolean(on);
  return remember(memory);
}

export function counting() {
  return !privacyRefused() && !optedOut();
}

/*
 * Keep a poster's utm_source slug, and take every utm_ parameter out of
 * the address bar. Links are how tracks travel (?share=trk-...), and a
 * pilot passing on the link they are looking at must not pass on the
 * poster attribution with it. The slug is kept even with counting off:
 * it stays in this browser, and if counting comes back on the poster is
 * still the honest answer. The latest poster wins. Call once, before
 * anything else reads the query.
 */
export function captureSource(loc = window.location, hist = window.history) {
  let url;
  try {
    url = new URL(loc.href);
  } catch (e) {
    return null;
  }
  const given = url.searchParams.get('utm_source');
  const candidate = given === null ? '' : String(given).trim().toLowerCase();
  const slug = SLUG.test(candidate) ? candidate : null;
  if (slug) {
    const memory = recall();
    memory.source = { slug, day: utcDay() };
    remember(memory);
  }
  const tracking = [...url.searchParams.keys()].filter((key) => key.toLowerCase().startsWith('utm_'));
  if (tracking.length === 0) {
    return slug;
  }
  for (const key of tracking) {
    url.searchParams.delete(key);
  }
  if (hist && typeof hist.replaceState === 'function') {
    try {
      hist.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (e) {
      /* A sandboxed frame keeps the parameters in its bar; the slug is
       * already kept, and nothing else depends on the bar. */
    }
  }
  return slug;
}

export function heldSource() {
  const source = recall().source;
  if (!source || !SLUG.test(String(source.slug || ''))) {
    return null;
  }
  return dayGap(String(source.day || ''), utcDay()) <= SOURCE_DAYS ? source.slug : null;
}

/*
 * Count this browser for today. Resolves to { returning } the first time
 * on a given UTC day and null after that, which is what makes a visit
 * once per browser per day across all three pages.
 */
export function markVisit() {
  const memory = recall();
  const day = utcDay();
  if (memory.lastVisitDay === day) {
    return null;
  }
  const returning = Boolean(memory.firstDay) && memory.firstDay !== day;
  if (!memory.firstDay) {
    memory.firstDay = day;
  }
  memory.lastVisitDay = day;
  remember(memory);
  return { returning };
}

const withoutTrailingSlash = (origin) => String(origin || '').replace(/\/+$/, '');

export function eventsUrl(origin = boardOrigin()) {
  return `${withoutTrailingSlash(origin)}/api/stats/events`;
}

/*
 * Fire one event and forget it. A beacon first, because the last flush is
 * sent as the page closes and only a beacon survives that; it is
 * text/plain because a beacon cannot set headers and a simple request
 * needs no preflight (the board ignores the content type). fetch with
 * keepalive where there is no beacon. Every failure ends here: a board
 * that is down must cost the pilot nothing.
 */
export function sendEvent(payload, url = eventsUrl()) {
  if (!counting()) {
    return false;
  }
  const body = eventBody(payload);
  return body !== null && transmit(url, body);
}

/* The wire form of one event, or null for a payload JSON cannot write.
 * The held slug goes last so a payload cannot overwrite it. */
function eventBody(payload) {
  try {
    return JSON.stringify({ v: 1, ...payload, source: heldSource() });
  } catch (e) {
    return null;
  }
}

function transmit(url, body) {
  try {
    const beacon = navigator.sendBeacon;
    if (beacon) {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      return beacon.call(navigator, url, blob);
    }
  } catch (e) {
    /* A beacon that throws: try fetch below. */
  }
  const init = {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'text/plain' },
  };
  try {
    fetch(url, init).catch(() => {});
  } catch (e) {
    return false;
  }
  return true;
}

/* The visit event for one page. The poster slug is taken whether or not
 * anything is sent. */
export function pingVisit(surface, url = eventsUrl()) {
  captureSource();
  if (!counting()) {
    return false;
  }
  const visit = markVisit();
  return visit ? sendEvent({ kind: 'visit', surface, returning: visit.returning }, url) : false;
}

/* The per-tab handle. Not a secret: it only has to fit the board's
 * TAB_HANDLE shape and not collide with the other tabs flying right now. */
function mintTabHandle() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {
    /* An insecure origin or an old browser: make one up below. */
  }
  const noise = Math.floor(Math.random() * 2 ** 48).toString(36).padStart(10, '0');
  return `tab-${noise}-${(Date.now() % 1e9).toString(36)}`;
}

const clampCount = (value, cap) => Math.max(0, Math.min(cap, Math.round(value)));

/* The three words a session or flush carries. Read through `describe`
 * because the shell knows the aircraft, map and input and this module
 * must not import the shell. */
const UNSAID = { craft: '', map: 'custom', input: 'keyboard' };

function readFacts(describe) {
  try {
    const said = typeof describe === 'function' ? describe() : null;
    const fact = (name) => String((said && said[name]) || UNSAID[name]);
    return { craft: fact('craft'), map: fact('map'), input: fact('input') };
  } catch (e) {
    return { ...UNSAID };
  }
}

/*
 * The flight counter for one page. Everything it holds is a delta since
 * the previous flush, so a killed tab loses at most a minute and an hour
 * of flying is sixty small numbers rather than one growing total.
 */
export function createFlightStats({ describe, url = eventsUrl() } = {}) {
  const tab = mintTabHandle();
  const since = { laps: 0, crashes: 0, flightMs: 0 };
  let live = false;
  let ended = false;
  let lapsLastSeen = null;
  let previousWall = 0;
  let flushDue = 0;

  /* Sent even for an empty minute (it is the heartbeat), never before the
   * session starts. The deltas are cleared whether or not the send went:
   * holding them would make the next flush carry two minutes, more than
   * the board takes, so one lost minute is the cheaper failure. Partial
   * seconds carry over. */
  const flush = () => {
    if (!live || ended) {
      return;
    }
    const wholeSeconds = Math.floor(since.flightMs / 1000);
    const { craft, map } = readFacts(describe);
    sendEvent({
      kind: 'flush',
      tab,
      craft,
      map,
      laps: clampCount(since.laps, PER_FLUSH.laps),
      flightS: clampCount(wholeSeconds, PER_FLUSH.flightS),
      crashes: clampCount(since.crashes, PER_FLUSH.crashes),
    }, url);
    since.laps = 0;
    since.crashes = 0;
    since.flightMs -= wholeSeconds * 1000;
  };

  const countLaps = (laps) => {
    if (lapsLastSeen !== null && laps > lapsLastSeen) {
      since.laps += laps - lapsLastSeen;
    }
    /* A drop is a reset, a new course or a map swap: start again from
     * there rather than count backwards. */
    lapsLastSeen = laps;
  };

  return {
    tab,

    /* Once a frame, with what the render loop has: whether the run has
     * left the ground (`started`), whether the aircraft is airborne
     * (`flying`), and the race's lap count. */
    tick(nowWall, state) {
      if (ended) {
        return;
      }
      const wall = Number(nowWall) || 0;
      const lastWall = previousWall;
      previousWall = wall;
      if (!live && state && state.started) {
        live = true;
        flushDue = wall + FLUSH_MS;
        const { craft, map, input } = readFacts(describe);
        sendEvent({
          kind: 'session', craft, map, input,
        }, url);
      }
      if (!live) {
        return;
      }
      /* Airborne wall time, with any one gap capped at a second: a tab
       * hidden for an hour wakes with one huge delta nobody flew. */
      if (state && state.flying && lastWall > 0 && wall > lastWall) {
        since.flightMs += Math.min(wall - lastWall, 1000);
      }
      if (state && Number.isFinite(state.laps)) {
        countLaps(state.laps);
      }
      if (wall >= flushDue) {
        flushDue = wall + FLUSH_MS;
        flush();
      }
    },

    /* The shell declares a crash in one place, and calls this from it. */
    noteCrash() {
      if (live && !ended) {
        since.crashes += 1;
      }
    },

    /* The page is closing: the flush every send is a beacon for. */
    leaving() {
      flush();
    },

    /* For the harness, and for a reset that should not count. */
    stop() {
      ended = true;
    },
  };
}

/*
 * Everyone's flight time together: allTime.flightS from the board's own
 * GET /api/stats, a sum over days with no row for any pilot. Null when
 * there is no board, it does not answer in time, or the number is not
 * there, so the screen shows nothing rather than an invented figure.
 */
export async function boardFlightSeconds(origin = boardOrigin()) {
  try {
    const res = await fetch(`${withoutTrailingSlash(origin)}/api/stats`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    const total = body && body.allTime ? body.allTime.flightS : null;
    return Number.isFinite(total) && total >= 0 ? total : null;
  } catch (e) {
    return null;
  }
}
