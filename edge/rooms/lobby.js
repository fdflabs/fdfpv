/*
 * lobby.js: the room browser's book of public rooms (docs/MULTIPLAYER-PLAN.md
 * sections 1 and 2, as the owner changed them on 2026-09-28: "if they're
 * public not private make it not be a code and have it list in the lobby
 * the rooms that are up").
 *
 * Every public room is made like a private one, by POST /v2/create (or by
 * a quick join that finds no room, front.js), and has a code the browser
 * joins it by; the pilot never sees or types it. One Lobby object holds a
 * line per public room, which the room itself sends whenever what the list
 * shows of it changes (reportRoom): its name, world, pilots, cap and the
 * game on. The Lobby never sees a pose, a pilot's name or an address.
 * Private rooms never report, so they are never listed.
 *
 *   GET /v2/rooms          the list (front.js), cached LIST_CACHE_MS
 *   GET /v2/public/<map>   quick join: the busiest listed room of that map
 *                          with a seat, or a new one (front.js)
 *
 * AN EMPTY ROOM IS NEVER LISTED, nor handed to a quick join (the owner,
 * 2026-10-02, of rooms listed in battle with nobody in them: "once theyre
 * done or empty they need to be closed out"). The room itself is held five
 * minutes after its last pilot left (host.js PURGE_MS), its game paused
 * (core.js roomMs), for whoever comes back by its code, a link or a
 * reload; a pilot back before the purge keeps it, and it is listed with
 * its pilots again. A room just made is listed once its maker is in it,
 * or a quick join has booked it.
 *
 * A HIDDEN ROOM (safety.js: enough pilots reported its name) is never
 * listed and never handed to a quick join. Its pilots fly on. A ROOM MADE
 * FOR THE WAR is listed, with its mission, and never handed to a quick
 * join either.
 *
 * A quick join is counted as a pilot for PENDING_MS, until the room's own
 * count arrives, so a burst of joiners does not all land on one room past
 * its cap; the rare one who still finds it full is told so and asks again
 * (src/share/rooms.js).
 *
 * WHERE THE BOOK LIVES. On Cloudflare the Lobby keeps it in its storage,
 * so a lobby evicted from memory still knows the rooms that are flying.
 * On the VM it is memory (node.js), and after a restart every stored
 * public room reports itself again (host.js announce), so the list comes
 * back without waiting for its pilots.
 *
 * LobbyBook is the logic, for rooms:selftest; Lobby is its Durable Object.
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

import { EMPTY_CLOSE_MS, PUBLIC_CAP } from '../../src/share/roomwire.js';

export const PENDING_MS = 30000;
export const LIST_GRACE_MS = EMPTY_CLOSE_MS;
/* Bounds on what the lobby holds and answers: a thousand rooms is sixteen
 * thousand pilots, far past what one VM carries, and a list longer than a
 * couple of hundred rows is not something a child scrolls. */
export const MAX_ROOMS = 1000;
export const LIST_MAX = 200;
/* However many browsers poll the list (src/share/roomlist.js asks every
 * few seconds while it is open), it is rebuilt at most once a second, and
 * at once after a room's line changed, so a poll never reads a count
 * older than the last change: the rebuilds are bounded by the rooms'
 * changes, not by the polls. */
export const LIST_CACHE_MS = 1000;
const MAP_RE = /^[a-z0-9_]{1,32}$/;

/* What the list shows of a room: its meta, its pilot count, the game on
 * (core.js activity()) and, empty, when it went empty (host.js). */
export function listingOf(meta, n, activity, emptySince = null) {
  return {
    code: meta.code,
    name: meta.name ?? null,
    pick: meta.pick,
    map: meta.map,
    n,
    cap: meta.cap,
    game: activity.game,
    state: activity.state,
    mode: meta.mode ?? null,
    mission: meta.mission ?? null,
    wave: activity.wave ?? null,
    waves: activity.waves ?? null,
    round: activity.round ?? null,
    ready: activity.ready ?? null,
    hidden: Boolean(meta.hidden),
    created: meta.epoch,
    emptySince: n > 0 ? null : emptySince,
  };
}

export class LobbyBook {
  /* rooms: { [code]: a listing, with pending: [ms] and emptySince }, as stored. */
  constructor(rooms = {}) {
    this.rooms = rooms;
  }

  load(e, now) {
    e.pending = e.pending.filter((at) => now - at < PENDING_MS);
    return e.n + e.pending.length;
  }

  listed(e, now) {
    return !e.hidden && Boolean(e.pick) && this.load(e, now) > 0;
  }

  /* A room booked by a quick join that never reported (its making
   * failed) goes when its booking lapses. */
  prune(now) {
    for (const [code, e] of Object.entries(this.rooms)) {
      if (this.load(e, now) === 0 && (!e.pick || now - e.emptySince >= LIST_GRACE_MS)) {
        delete this.rooms[code];
      }
    }
  }

  /* A room's own line, which replaces the book's. Its count replaces the
   * guessed joiners too, when it moved. False when the book is full. */
  report(entry, now) {
    const old = this.rooms[entry.code];
    if (!old && Object.keys(this.rooms).length >= MAX_ROOMS) {
      this.prune(now);
      if (Object.keys(this.rooms).length >= MAX_ROOMS) {
        return false;
      }
    }
    const pending = old && old.n === entry.n ? old.pending : [];
    /* The room's own time when it sends one; the book's guess otherwise. */
    const emptySince = entry.n > 0 ? null
      : Number.isFinite(entry.emptySince) ? entry.emptySince
        : (old && old.emptySince != null ? old.emptySince : now);
    this.rooms[entry.code] = { ...entry, pending, emptySince };
    return true;
  }

  /* People first, then the newest. */
  list(now) {
    this.prune(now);
    return Object.values(this.rooms)
      .filter((e) => this.listed(e, now))
      .sort((a, b) => (b.n - a.n) || (b.created - a.created))
      .slice(0, LIST_MAX)
      .map((e) => ({
        code: e.code, name: e.name, pick: e.pick, map: e.map, n: e.n, cap: e.cap, game: e.game, state: e.state, mode: e.mode,
        mission: e.mission ?? null, wave: e.wave ?? null, waves: e.waves ?? null, round: e.round ?? null, ready: e.ready ?? null, emptySince: e.emptySince,
      }));
  }

  /*
   * A quick join on `map`: { code, fresh }. The busiest listed room with a
   * seat, the older of two as busy; or, when there is none, `fresh`, a new
   * code the caller must make the room for, booked here first so the
   * joiners right behind this one land in it rather than each making
   * their own. null when the map cannot be had, or when there is no room
   * with a seat and `fresh` is null (the server is busy, front.js).
   */
  quick(map, now, fresh) {
    if (!MAP_RE.test(map)) {
      return null;
    }
    this.prune(now);
    let best = null;
    let bestLoad = -1;
    for (const e of Object.values(this.rooms)) {
      /* Never into a room made for the war: nobody arrives there without
       * having chosen it (docs/WARFARE-PLAN.md section 9). */
      if (e.map !== map || e.hidden || e.mode === 'war') {
        continue;
      }
      /* Nor into an empty one, whose last pilots may come back to it. */
      const n = this.load(e, now);
      if (n > 0 && n < e.cap && (n > bestLoad || (n === bestLoad && e.created < best.created))) {
        best = e;
        bestLoad = n;
      }
    }
    if (best) {
      best.pending.push(now);
      return { code: best.code, fresh: false };
    }
    if (!fresh || Object.keys(this.rooms).length >= MAX_ROOMS) {
      return null;
    }
    /* No pick yet, so not listed until the room made for it reports. */
    this.rooms[fresh] = {
      code: fresh, name: null, pick: null, map, n: 0, cap: PUBLIC_CAP, game: null, state: 'waiting', mode: null,
      hidden: false, created: now, pending: [now], emptySince: now,
    };
    return { code: fresh, fresh: true };
  }
}

/* A Durable Object in the plain class form, with no import of
 * cloudflare:workers, so rooms:selftest can load this file in Node. */
export class Lobby {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.cached = null;
    this.listed = null;
  }

  async book() {
    if (!this.cached) {
      this.cached = new LobbyBook((await this.ctx.storage.get('rooms')) || {});
    }
    return this.cached;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const book = await this.book();
    const now = Date.now();
    if (url.pathname === '/list') {
      if (!this.listed || now - this.listed.at >= LIST_CACHE_MS) {
        this.listed = { at: now, body: JSON.stringify(book.list(now)) };
      }
      return new Response(this.listed.body, { headers: { 'content-type': 'application/json' } });
    }
    const body = await request.json();
    this.listed = null;
    if (url.pathname === '/report') {
      book.report(body, now);
      await this.ctx.storage.put('rooms', book.rooms);
      return new Response('ok');
    }
    if (url.pathname === '/quick') {
      const got = book.quick(String(body.map), now, body.code);
      await this.ctx.storage.put('rooms', book.rooms);
      return Response.json(got || { code: null });
    }
    return new Response('not found', { status: 404 });
  }
}

export function lobbyStub(env) {
  return env.LOBBY.get(env.LOBBY.idFromName('lobby'));
}

function send(env, entry) {
  return lobbyStub(env).fetch('https://lobby/report', { method: 'POST', body: JSON.stringify(entry) }).catch(() => null);
}

/* Called by the room after every event: a public room whose line moved
 * tells the lobby. Best effort; a lost line is corrected by the next. */
export function reportRoom(env, core, now) {
  if (!core || !core.meta.public || !core.meta.code) {
    return null;
  }
  const entry = listingOf(core.meta, core.people().length, core.activity(now), core.emptySince ?? null);
  const key = JSON.stringify(entry);
  if (core.lastListing === key) {
    return null;
  }
  core.lastListing = key;
  return send(env, entry);
}
