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
  CLOSE, POSE_BYTES, PROTO, TYPE_POSE, checkProfile, encodeBatch, validNamePick,
} from '../../src/share/roomwire.js';
import { TYPE_PARTS } from '../../src/share/roomwire.js';
import * as wrecks from './wrecks.js';

/* Event kinds each phase's module answers (docs/MULTIPLAYER-PLAN.md;
 * ownership in fdfpv-loop/multiplayer/COORD.md). */
const EVENTS = {
  crash: wrecks.onCrash,
  whack: wrecks.onWhack,
};

export const TICK_MS = 1000 / 30;
/* Private rooms by the owner's decision (docs/MULTIPLAYER-PLAN.md section
 * 14, answer 6). Public rooms, at 16, stay closed until Phase 5. */
export const PRIVATE_CAP = 8;
export const POSE_PER_S = 35;
export const TEXT_PER_S = 5;
export const TEXT_CLOSE_PER_S = 20;
export const JOINS_PER_MIN = 10;
export const KICK_MS = 30 * 60 * 1000;
/* A seat's token takes the same seat back for this long after its socket
 * drops, so a reconnect lands where it was rather than in a new slot. */
export const RESEAT_MS = 60 * 1000;

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
   * meta: { code, cap, friendly, map, epoch }, what the room was made with.
   * epoch is the wall ms the room's clock counts from, so room times fit
   * the wire's u32 for 49 days.
   */
  constructor(meta) {
    this.meta = meta;
    this.seats = new Map();   /* conn -> seat record */
    this.pending = new Map(); /* conn -> text rate, before its hello */
    this.kicked = [];         /* { token, address, until } in memory only */
    this.joins = new Map();   /* address -> { since, n } */
    this.recent = new Map();  /* token -> { seat, until }, for a reconnect */
    this.ticking = false;
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
      } else {
        this.pending.set(conn, { since: 0, n: 0 });
      }
    }
  }

  open(conn, now) {
    this.pending.set(conn, { since: now, n: 0 });
    return [];
  }

  host() {
    let best = null;
    for (const s of this.seats.values()) {
      if (!best || s.joined < best.joined) {
        best = s;
      }
    }
    return best ? best.seat : 0;
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
    return { seat: s.seat, token: s.token, name: s.name, profile: s.profile, joined: s.joined, address: s.address, wreck: s.wreck ?? null };
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

  isKicked(token, address, now) {
    this.kicked = this.kicked.filter((k) => k.until > now);
    return this.kicked.some((k) => (token && k.token === token) || (address && k.address === address));
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
    if (this.isKicked(token, address, now)) {
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
      if (bump(this.joins.get(address), now, 60000) > JOINS_PER_MIN) {
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
        map: this.meta.map,
        peers: this.peerList(conn),
      }),
    });
    actions.push(...this.others(conn, JSON.stringify({ type: 'join', seat, name: s.name, profile, host: this.host() })));
    actions.push(...wrecks.wrecksFor(this, conn));
    return actions;
  }

  message(conn, data, now, address = '', newToken = null) {
    const s = this.seats.get(conn);
    if (typeof data !== 'string') {
      if (s && data[0] === TYPE_PARTS) {
        return wrecks.onParts(this, conn, s, data, now);
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
      return [
        { attach: conn, value: this.attachmentOf(s) },
        ...this.others(conn, JSON.stringify({ type: 'profile', seat: s.seat, profile })),
      ];
    }
    if (msg.type === 'event' && Object.hasOwn(EVENTS, msg.kind)) {
      return EVENTS[msg.kind](this, conn, s, msg, now);
    }
    if (msg.type === 'kick' && s.seat === this.host() && msg.seat !== s.seat) {
      return this.kick(msg.seat, now);
    }
    return [];
  }

  /* A host's kick: gone for the room's life, which is what the token and
   * the address are held against, in memory, for KICK_MS. */
  kick(seat, now) {
    for (const [conn, t] of this.seats) {
      if (t.seat === seat) {
        this.kicked.push({ token: t.token, address: t.address, until: now + KICK_MS });
        this.seats.delete(conn);
        return [
          { close: conn, code: CLOSE.kicked, reason: 'kicked' },
          ...this.others(conn, JSON.stringify({ type: 'leave', seat, host: this.host() })),
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
    s.pose = data;
    s.fresh = true;
    if (this.ticking) {
      return [];
    }
    this.ticking = true;
    return [{ tick: true }];
  }

  /* One room tick: every seat gets one batch of the others' poses that
   * arrived since the last. Ticks stop when nobody sent a pose. */
  tick(now) {
    const fresh = [...this.seats.values()].filter((s) => s.fresh);
    if (!fresh.length) {
      this.ticking = false;
      return [];
    }
    const out = [];
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
    for (const [token, r] of this.recent) {
      if (r.until <= now) {
        this.recent.delete(token);
      }
    }
    this.recent.set(s.token, { seat: s.seat, joined: s.joined, until: now + RESEAT_MS });
    const out = this.others(conn, JSON.stringify({ type: 'leave', seat: s.seat, host: this.host() }));
    if (!this.seats.size) {
      out.push({ empty: true });
    }
    return out;
  }
}
