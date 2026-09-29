/*
 * core.js: one room's logic, with no Cloudflare API in it.
 *
 * edge/rooms/do.js is the thin Durable Object adapter around this, and
 * scripts/rooms-selftest.js drives it in plain Node. Every entry point
 * takes the time and returns what to do as a list of actions, so the
 * adapter is a loop over them and a check reads them:
 *
 *   { send: conn, data }            a text (string) or binary (Uint8Array) message
 *   { close: conn, code, reason }   close that socket
 *   { attach: conn, value }         store this with the socket, to survive a hibernation
 *   { store: key, value }           keep this in the room's storage, the same; host.js
 *                                   hands it back to this[key].restore() on load (the race, a tag match)
 *   { tick: true }                  call tick() again in TICK_MS
 *   { empty: true }                 nobody is left: schedule the purge
 *
 * A conn is whatever handle the adapter uses for a socket (a WebSocket
 * there, a plain object here); the core keys its seats on it and never
 * looks inside.
 *
 * WHAT OWNS WHAT. A Durable Object runs one event at a time, so this object
 * is the only owner of the room's state and nothing locks. What must
 * survive a hibernation (who holds which seat, their token, name and
 * profile) is in each socket's attachment and is rebuilt by restore().
 * What may be lost with it is in memory only: the latest poses (a room
 * that hibernated had nobody flying), the rate counters, and the kick
 * list, which by the owner's decision is never written anywhere and is
 * worth nothing once the room is empty.
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

import {
  CLOSE, POSE_BYTES, PROTO, PUBLIC_CAP, TYPE_POSE, checkProfile, encodeBatch, validNamePick,
} from '../../src/share/roomwire.js';
import { Referee } from './referee.js';
import { RoomRace } from './race.js';
import { RoomTag } from './tag.js';
import { RoomSafety } from './safety.js';
import { TYPE_PARTS, TYPE_STREAMER } from '../../src/share/roomwire.js';
import * as wrecks from './wrecks.js';
import { RoomCombat } from './combat.js';

/* Event kinds each phase's module answers (docs/MULTIPLAYER-PLAN.md;
 * ownership in fdfpv-loop/multiplayer/COORD.md). */
const EVENTS = {
  crash: wrecks.onCrash,
  whack: wrecks.onWhack,
  gate: raceEvent,
  hoop: raceEvent,
};

/* A racer's pass (edge/rooms/race.js). */
function raceEvent(core, conn, s, msg, now) {
  return core.race.message(core, conn, s, msg, now);
}

export const TICK_MS = 1000 / 30;
/* Private rooms by the owner's decision (docs/MULTIPLAYER-PLAN.md section
 * 14, answer 6). A public room's is roomwire.js PUBLIC_CAP, 16. */
export const PRIVATE_CAP = 8;
export const POSE_PER_S = 35;
export const TEXT_PER_S = 5;
export const TEXT_CLOSE_PER_S = 20;
/* New joins a minute from one address, in one room. One address is often
 * a whole household (siblings on one Wi-Fi, a school behind one NAT), so
 * it is sized for a full public room joining at once, twice over: it
 * stops a script's join and leave churn, never a family filling a room.
 * A seat taken back after a drop is not a new join. */
export const JOINS_PER_MIN = 2 * PUBLIC_CAP;
export const KICK_MS = 30 * 60 * 1000;
/*
 * A kick or a removal keeps out that PLAYER, their seat token, for its
 * time, never their address: the owner's decision (2026-09-28), because
 * an address is often a household, and a sibling on the same Wi-Fi must
 * still get in. Against the one kicked coming straight back from a fresh
 * browser, new joins to this room from that address are slowed for the
 * same time: one per KICKED_JOIN_GAP_MS, the first that long after the
 * kick. Slowed, never blocked. A seat taken back after a drop is not a
 * new join.
 */
export const KICKED_JOIN_GAP_MS = 60 * 1000;
/* A seat's token takes the same seat back for this long after its socket
 * drops, so a reconnect lands where it was rather than in a new slot. */
export const RESEAT_MS = 60 * 1000;
/* A game (a race, a tag match, a combat round) with too few of its
 * players in the room for this long is ended by the room: a deploy or a
 * restart restores a game from storage whether or not anybody comes back
 * to it, and one nobody plays must never hold the room (game()). Long
 * enough for the pilots of a restarted room to reconnect into their seats. */
export const ABANDON_MS = 10 * 1000;

/*
 * Who holds the room: the host's seat token, kept in storage (host.js hands
 * it back to restore() on load), so a restart keeps the host when that
 * pilot reconnects, whoever reconnects first. While the host is away, for
 * up to RESEAT_MS, the earliest joined pilot here acts for them; after
 * that the room passes to that pilot for good.
 */
class Hosting {
  constructor() {
    this.token = null;
    this.awaySince = null; /* memory only: when the host was last missed */
    this.said = 0;         /* memory only: the seat last announced */
  }

  restore(saved) {
    this.token = saved && typeof saved.token === 'string' ? saved.token : null;
  }

  store() {
    return { store: 'hosting', value: { token: this.token } };
  }
}

/* A count of events in the current one second (or one minute) window. */
function bump(counter, now, windowMs) {
  if (now - counter.since >= windowMs) {
    counter.since = now;
    counter.n = 0;
  }
  counter.n += 1;
  return counter.n;
}

export class RoomCore {
  /*
   * meta: { code, cap, friendly, map, epoch, public, name, pick, mode,
   * hidden }, what the room was made with (host.js init). epoch is the
   * wall ms the room's clock counts from, so room times fit the wire's
   * u32 for 49 days. name is the creator's typed name or null, pick the
   * picker name shown when there is none, mode the game the room was set
   * up for or null, hidden true once reports took its name away
   * (safety.js). A room stored before the browser has none of the last
   * five, and reads as private, unnamed and set up for nothing.
   */
  constructor(meta) {
    this.meta = meta;
    this.seats = new Map();   /* conn -> seat record */
    this.pending = new Map(); /* conn -> text rate, before its hello */
    this.kicked = [];         /* { token, address, until, lastJoin } in memory only */
    this.joins = new Map();   /* address -> { since, n } */
    this.recent = new Map();  /* token -> { seat, until }, for a reconnect */
    this.ticking = false;
    /* Phase 3, mid air: edge/rooms/referee.js. */
    this.referee = new Referee(meta.friendly);
    this.race = new RoomRace(); /* Phase 4, edge/rooms/race.js */
    this.tag = new RoomTag(); /* Catch the Ace, edge/rooms/tag.js */
    this.safety = new RoomSafety(this);
    this.combat = new RoomCombat(meta); /* combat, edge/rooms/combat.js */
    this.hosting = new Hosting();
    /* game id -> room ms since it has had too few players. Memory only. */
    this.abandoned = new Map();
  }

  roomMs(now) {
    return now - this.meta.epoch;
  }

  /* The seats as they were before a hibernation, from each socket's
   * attachment. conns is [{ conn, attachment }]. */
  restore(conns) {
    for (const { conn, attachment } of conns) {
      if (attachment && attachment.seat) {
        this.seats.set(conn, { ...attachment, pose: null, fresh: false, poseRate: { since: 0, n: 0 }, textRate: { since: 0, n: 0 } });
        this.referee.seat(attachment.seat, attachment.profile && attachment.profile.airframe);
        this.combat.seat(attachment.seat, attachment.profile && attachment.profile.airframe);
      } else {
        this.pending.set(conn, { since: 0, n: 0 });
      }
    }
  }

  open(conn, now) {
    this.pending.set(conn, { since: now, n: 0 });
    return [];
  }

  /* The host's seat: the one holding the hosting token, else, while the
   * host is away, the earliest joined here. 0 in an empty room. */
  host() {
    let best = null;
    for (const s of this.seats.values()) {
      if (this.hosting.token && s.token === this.hosting.token) {
        return s.seat;
      }
      if (!best || s.joined < best.joined) {
        best = s;
      }
    }
    return best ? best.seat : 0;
  }

  /*
   * After every arrival and departure, and on the room tick: give the
   * token to the first pilot of a new room, pass it on once the host has
   * been away RESEAT_MS, and tell everybody when the host's seat changed.
   */
  settleHost(now) {
    const h = this.hosting;
    const out = [];
    const here = [...this.seats.values()];
    const holder = here.find((t) => h.token && t.token === h.token);
    if (holder || !here.length) {
      h.awaySince = null;
    } else {
      h.awaySince ??= now;
      if (!h.token || now - h.awaySince >= RESEAT_MS) {
        h.token = here.reduce((a, b) => (b.joined < a.joined ? b : a)).token;
        h.awaySince = null;
        out.push(h.store());
      }
    }
    const seat = this.host();
    if (seat && seat !== h.said) {
      h.said = seat;
      out.push(...this.others(null, JSON.stringify({ type: 'host', seat })));
    }
    return out;
  }

  /*
   * The host hands the room to another pilot here (hostCheck has already
   * said the sender is the host): the token moves, is stored, and
   * everybody is told. A seat nobody holds is refused as 'gone'.
   */
  handHost(conn, s, seat, now) {
    const to = [...this.seats.values()].find((t) => t.seat === seat && t !== s);
    if (!to) {
      return [{ send: conn, data: JSON.stringify({ type: 'refused', why: 'gone' }) }];
    }
    this.hosting.token = to.token;
    this.hosting.awaySince = null;
    return [this.hosting.store(), ...this.settleHost(now)];
  }

  /* The games a room can run: whether each is on, its players' seats, and
   * the fewest of them here that keep it going. */
  games(now) {
    const r = this.race.race;
    return [
      { id: 'race', on: Boolean(r && r.state === 'on'), players: r ? r.racers : [], min: 1, end: () => this.race.end(this) },
      { id: 'tag', on: this.tag.on(), players: this.tag.players(this), min: 2, end: () => this.tag.abandon(this, now) },
      { id: 'combat', on: this.combat.on(), players: this.combat.players(), min: 2, end: () => this.combat.stop(this) },
    ];
  }

  present(players) {
    const here = new Set([...this.seats.values()].map((t) => t.seat));
    return players.filter((seat) => here.has(seat)).length;
  }

  /* A room runs one game at a time (docs/TAG-PLAN.md decision 10): the
   * one on now with enough of its players here to be played, or null. A
   * game nobody plays never holds the room. */
  game() {
    const g = this.games(0).find((x) => x.on && this.present(x.players) >= x.min);
    return g ? g.id : null;
  }

  /* End every game on with too few of its players here: once that has
   * lasted ABANDON_MS, or at once when `force` (a host starting another). */
  settleGames(now, force = false) {
    const out = [];
    for (const g of this.games(now)) {
      if (!g.on || this.present(g.players) >= g.min) {
        this.abandoned.delete(g.id);
        continue;
      }
      const since = this.abandoned.get(g.id) ?? now;
      this.abandoned.set(g.id, since);
      if (force || now - since >= ABANDON_MS) {
        this.abandoned.delete(g.id);
        out.push(...g.end());
      }
    }
    return out;
  }

  /* The room's own clock: the tick runs while a game waits to be ended or
   * the host to come back, even with nobody flying, and never in an empty
   * room, which the next arrival settles. */
  waiting() {
    return this.seats.size > 0 && (this.abandoned.size > 0 || this.hosting.awaySince != null);
  }

  wake() {
    if (this.ticking || !this.waiting()) {
      return [];
    }
    this.ticking = true;
    return [{ tick: true }];
  }

  /* Arrivals and departures: the host, the games, and the clock for both. */
  settle(now) {
    const out = [...this.settleHost(now), ...this.settleGames(now)];
    return [...out, ...this.wake()];
  }

  /*
   * A host's action (starting, ending or loading a game; a kick), checked
   * once here for every mode, so a refused one always says why:
   * { type: 'refused', why: 'public'|'host'|'race'|'tag'|'combat' }. Returns
   * the actions of a refusal, or null to let the mode handle it. `start`
   * is the mode it would start; a game with too few players is ended
   * first rather than refused.
   */
  hostCheck(conn, s, msg, now) {
    const start = (msg.type === 'tag' && msg.op === 'start') ? 'tag'
      : (msg.type === 'combat' && msg.op === 'start') ? 'combat'
        : (msg.type === 'track' || (msg.type === 'race' && msg.op === 'start')) ? 'race' : null;
    const hostOnly = start || msg.type === 'kick' || msg.type === 'handhost' || (msg.type === 'tag' && msg.op === 'end')
      || (msg.type === 'race' && msg.op === 'end') || (msg.type === 'combat' && msg.op === 'stop');
    if (!hostOnly) {
      return null;
    }
    const refuse = (why, out = []) => [...out, { send: conn, data: JSON.stringify({ type: 'refused', why }) }];
    /* A public room's host starts its games like a private one's, since
     * the room browser; only kicking stays a private room's, and reports
     * handle a public room's trouble. */
    if (this.meta.public && msg.type === 'kick') {
      return refuse('public');
    }
    if (s.seat !== this.host()) {
      return refuse('host');
    }
    if (!start) {
      return null;
    }
    const out = this.settleGames(now, true);
    const other = this.game();
    /* A race's own track and start are the race's to judge (race.js). */
    if (other && !(other === 'race' && start === 'race')) {
      return refuse(other, out);
    }
    return out.length ? { pass: out } : null;
  }

  /* What the room browser shows the room doing (edge/rooms/lobby.js):
   * { game, state }, game null for free flight, state 'countdown' or 'on'
   * for a game under way and 'waiting' otherwise, when a room set up for
   * a game shows that game. */
  activity(now) {
    const r = this.race.race;
    if (r && r.state === 'on') {
      return { game: 'race', state: this.roomMs(now) < r.goAt ? 'countdown' : 'on' };
    }
    const m = this.tag.match;
    if (this.tag.on()) {
      return { game: 'tag', state: m.state === 'live' ? 'on' : 'countdown' };
    }
    if (this.combat.on()) {
      return { game: 'combat', state: this.combat.round.state };
    }
    return { game: this.meta.mode ?? null, state: 'waiting' };
  }

  /* Reports took the room's typed name away (safety.js): it shows its
   * picker name from now on, to its pilots at once, and the browser no
   * longer lists it. Kept in storage with the rest of the meta. */
  hideName() {
    this.meta.name = null;
    this.meta.hidden = true;
    return [
      { store: 'meta', value: this.meta },
      ...this.others(null, JSON.stringify({ type: 'room', name: null, pick: this.meta.pick, hidden: true })),
    ];
  }

  peerList(except) {
    const out = [];
    for (const [conn, s] of this.seats) {
      if (conn !== except) {
        out.push({ seat: s.seat, name: s.name, profile: s.profile });
      }
    }
    return out;
  }

  others(except, data) {
    const out = [];
    for (const conn of this.seats.keys()) {
      if (conn !== except) {
        out.push({ send: conn, data });
      }
    }
    return out;
  }

  attachmentOf(s) {
    return {
      seat: s.seat, token: s.token, name: s.name, profile: s.profile, joined: s.joined, address: s.address,
      muted: s.muted || [], wreck: s.wreck ?? null,
    };
  }

  freeSeat(wanted) {
    const taken = new Set([...this.seats.values()].map((s) => s.seat));
    if (wanted && !taken.has(wanted) && wanted <= this.meta.cap) {
      return wanted;
    }
    for (let seat = 1; seat <= this.meta.cap; seat += 1) {
      if (!taken.has(seat) && ![...this.recent.values()].some((r) => r.seat === seat)) {
        return seat;
      }
    }
    for (let seat = 1; seat <= this.meta.cap; seat += 1) {
      if (!taken.has(seat)) {
        return seat;
      }
    }
    return 0;
  }

  isKicked(token, now) {
    this.kicked = this.kicked.filter((k) => k.until > now);
    return Boolean(token) && this.kicked.some((k) => k.token === token);
  }

  /* Keep a player out: their token for `ms`, their address slowed. */
  keepOut(s, now, ms) {
    this.kicked.push({ token: s.token, address: s.address, until: now + ms, lastJoin: now });
  }

  /* A new join from an address a kick or a removal slows: false while it
   * must wait, else true, and the wait starts again. */
  slowedJoin(address, now) {
    const held = this.kicked.filter((k) => address && k.address === address);
    if (held.some((k) => now - k.lastJoin < KICKED_JOIN_GAP_MS)) {
      return false;
    }
    for (const k of held) {
      k.lastJoin = now;
    }
    return true;
  }

  /*
   * hello: { proto, build, token?, name: [adj, animal, number], profile }.
   * newToken() is the caller's cryptographic source of a fresh seat token.
   */
  hello(conn, msg, now, address, newToken) {
    if (msg.proto !== PROTO) {
      return [{ close: conn, code: CLOSE.update, reason: 'update' }];
    }
    const token = typeof msg.token === 'string' && /^[0-9a-f]{32}$/.test(msg.token) ? msg.token : null;
    if (this.isKicked(token, now)) {
      return [{ close: conn, code: CLOSE.kicked, reason: 'kicked' }];
    }
    const profile = checkProfile(msg.profile);
    if (!validNamePick(msg.name) || !profile) {
      return [{ close: conn, code: CLOSE.bad, reason: 'bad' }];
    }
    const actions = [];
    /* A token that holds a live seat takes it over: the old socket is a
     * tab that lost its network and has not noticed yet. */
    let wanted = 0;
    let joined = now;
    for (const [other, s] of this.seats) {
      if (token && s.token === token) {
        wanted = s.seat;
        joined = s.joined;
        actions.push({ close: other, code: CLOSE.replaced, reason: 'replaced' });
        this.seats.delete(other);
        actions.push(...this.others(other, JSON.stringify({ type: 'leave', seat: s.seat })));
      }
    }
    const back = token ? this.recent.get(token) : null;
    if (!wanted && back && back.until > now) {
      wanted = back.seat;
      joined = back.joined;
    }
    /* A token this room does not know, from a client that had a seat: the
     * object was restarted (a deploy, a tail attaching) and forgot it. The
     * seat it names is a spawn slot and nothing more, so it is given back
     * when free, and the pilot keeps their place on the field. */
    if (!wanted && token && Number.isInteger(msg.seat)) {
      wanted = msg.seat;
    }
    if (!wanted && address) {
      if (!this.joins.has(address)) {
        this.joins.set(address, { since: now, n: 0 });
      }
      if (bump(this.joins.get(address), now, 60000) > JOINS_PER_MIN || !this.slowedJoin(address, now)) {
        return [...actions, { close: conn, code: CLOSE.rate, reason: 'rate' }];
      }
    }
    if (this.seats.size >= this.meta.cap) {
      return [...actions, { close: conn, code: CLOSE.full, reason: 'full' }];
    }
    const seat = this.freeSeat(wanted);
    if (token) {
      this.recent.delete(token);
    }
    const s = {
      seat,
      token: wanted && token ? token : newToken(),
      name: msg.name.slice(),
      profile,
      joined,
      address: address || '',
      pose: null,
      fresh: false,
      poseRate: { since: now, n: 0 },
      textRate: { since: now, n: 0 },
    };
    this.pending.delete(conn);
    this.seats.set(conn, s);
    if (!this.hosting.token) {
      this.hosting.token = s.token;
      actions.push(this.hosting.store());
    }
    /* A seat taken back keeps its samples; a new pilot in it does not. */
    if (!wanted) {
      this.referee.leave(seat);
    }
    this.referee.seat(seat, profile.airframe);
    actions.push({ attach: conn, value: this.attachmentOf(s) });
    actions.push({
      send: conn,
      data: JSON.stringify({
        type: 'welcome',
        seat,
        token: s.token,
        host: this.host(),
        roomMs: this.roomMs(now),
        code: this.meta.code,
        cap: this.meta.cap,
        friendly: Boolean(this.meta.friendly),
        public: Boolean(this.meta.public),
        name: this.meta.name ?? null,
        pick: this.meta.pick ?? null,
        mode: this.meta.mode ?? null,
        map: this.meta.map,
        peers: this.peerList(conn),
        ...this.race.welcome(),
        ...this.tag.welcome(this),
      }),
    });
    actions.push(...this.others(conn, JSON.stringify({ type: 'join', seat, name: s.name, profile, host: this.host() })));
    actions.push(...wrecks.wrecksFor(this, conn));
    actions.push(...this.race.join(this, seat));
    this.combat.seat(seat, profile.airframe);
    actions.push(...this.combat.join(this, conn));
    actions.push(...this.settle(now));
    return actions;
  }

  message(conn, data, now, address = '', newToken = null) {
    const s = this.seats.get(conn);
    if (typeof data !== 'string') {
      if (s && data[0] === TYPE_PARTS) {
        return wrecks.onParts(this, conn, s, data, now);
      }
      if (s && data[0] === TYPE_STREAMER) {
        return this.combat.frame(this, conn, s, data, now);
      }
      return s ? this.pose(conn, s, data, now) : [];
    }
    const rate = s ? s.textRate : this.pending.get(conn);
    if (!rate) {
      return [];
    }
    const n = bump(rate, now, 1000);
    if (n > TEXT_CLOSE_PER_S) {
      return [{ close: conn, code: CLOSE.rate, reason: 'rate' }];
    }
    if (n > TEXT_PER_S) {
      return [];
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return [];
    }
    if (!msg || typeof msg !== 'object') {
      return [];
    }
    if (!s) {
      return msg.type === 'hello' ? this.hello(conn, msg, now, address, newToken) : [];
    }
    if (msg.type === 't' && Number.isFinite(msg.c)) {
      return [{ send: conn, data: JSON.stringify({ type: 't', c: msg.c, s: this.roomMs(now) }) }];
    }
    if (msg.type === 'profile') {
      const profile = checkProfile(msg.profile);
      if (!profile) {
        return [];
      }
      s.profile = profile;
      this.referee.seat(s.seat, profile.airframe);
      this.combat.seat(s.seat, profile.airframe);
      return [
        { attach: conn, value: this.attachmentOf(s) },
        ...this.others(conn, JSON.stringify({ type: 'profile', seat: s.seat, profile })),
      ];
    }
    if (msg.type === 'event' && Object.hasOwn(EVENTS, msg.kind)) {
      return EVENTS[msg.kind](this, conn, s, msg, now);
    }
    const checked = this.hostCheck(conn, s, msg, now);
    if (checked && !checked.pass) {
      return checked;
    }
    const first = checked ? checked.pass : [];
    if (msg.type === 'combat') {
      return [...first, ...this.combat.message(this, conn, s, msg, now)];
    }
    const safe = this.safety.text(conn, s, msg, now);
    if (safe) {
      return safe;
    }
    if (msg.type === 'kick' && !this.meta.public && s.seat === this.host() && msg.seat !== s.seat) {
      return this.kick(msg.seat, now);
    }
    if (msg.type === 'handhost') {
      return this.handHost(conn, s, msg.seat, now);
    }
    if (msg.type === 'tag') {
      return [...first, ...this.tag.message(this, conn, s, msg, now)];
    }
    /* Started by the room's host (Phase 4), in a public room as in a
     * private one since the room browser gave public rooms a host. */
    if (msg.type === 'track' || msg.type === 'race') {
      return [...first, ...this.race.message(this, conn, s, msg, now)];
    }
    return [];
  }

  /* A host's kick: gone for the room's life, which is what the token and
   * the token is held against, in memory, for KICK_MS (keepOut). */
  kick(seat, now) {
    for (const [conn, t] of this.seats) {
      if (t.seat === seat) {
        this.keepOut(t, now, KICK_MS);
        this.seats.delete(conn);
        this.referee.leave(seat);
        this.combat.leave(seat);
        return [
          { close: conn, code: CLOSE.kicked, reason: 'kicked' },
          ...this.others(conn, JSON.stringify({ type: 'leave', seat, host: this.host() })),
          ...this.settle(now),
        ];
      }
    }
    return [];
  }

  pose(conn, s, data, now) {
    if (data.byteLength !== POSE_BYTES || data[0] !== TYPE_POSE) {
      return [];
    }
    if (bump(s.poseRate, now, 1000) > POSE_PER_S) {
      return [];
    }
    const checked = this.safety.pose(conn, s, data, now);
    if (!checked.bytes) {
      return checked.actions;
    }
    s.pose = checked.bytes;
    s.fresh = true;
    /* The referee judges the bytes the room relays: Phase 5 sets
     * FLAG_SPAWNING on a spawning or benched seat, which the rule leaves
     * out, and every hit counts toward its ramming bench. In a tag match
     * a touch is a tag, never a crash: the match judges it instead. */
    const hits = this.tag.on() ? this.tag.pose(this, s, checked.bytes, now) : this.referee.pose(s.seat, checked.bytes, this.roomMs(now)).flatMap((h) => {
      this.safety.noteHit(h.a, h.b, now);
      return this.others(null, JSON.stringify(h));
    });
    /* After the referee: a crash from a hit it just decided is a mid air's. */
    hits.push(...this.combat.pose(this, s, now));
    if (this.ticking) {
      return hits;
    }
    this.ticking = true;
    return [...hits, { tick: true }];
  }

  /* One room tick: every seat gets one batch of the others' poses that
   * arrived since the last. Ticks stop when nobody sent a pose. */
  tick(now) {
    this.referee.tick(this.roomMs(now));
    const fresh = [...this.seats.values()].filter((s) => s.fresh);
    const out = [...this.race.tick(this, now), ...this.tag.tick(this, now), ...this.combat.tick(this, now)];
    out.push(...this.settleHost(now), ...this.settleGames(now));
    if (!fresh.length) {
      this.ticking = this.waiting();
      return this.ticking ? [...out, { tick: true }] : out;
    }
    for (const [conn, s] of this.seats) {
      const entries = fresh.filter((f) => f !== s).map((f) => ({ seat: f.seat, pose: f.pose }));
      if (entries.length) {
        out.push({ send: conn, data: encodeBatch(this.roomMs(now), entries) });
      }
    }
    for (const f of fresh) {
      f.fresh = false;
    }
    out.push({ tick: true });
    return out;
  }

  close(conn, now) {
    this.pending.delete(conn);
    const s = this.seats.get(conn);
    if (!s) {
      return this.seats.size ? [] : [{ empty: true }];
    }
    this.seats.delete(conn);
    this.referee.leave(s.seat);
    this.combat.leave(s.seat);
    for (const [token, r] of this.recent) {
      if (r.until <= now) {
        this.recent.delete(token);
      }
    }
    this.recent.set(s.token, { seat: s.seat, joined: s.joined, until: now + RESEAT_MS });
    const out = this.others(conn, JSON.stringify({ type: 'leave', seat: s.seat, host: this.host() }));
    out.push(...this.race.leave(this, s.seat));
    if (!this.seats.size) {
      out.push({ empty: true });
      return out;
    }
    out.push(...this.settle(now));
    return out;
  }
}
