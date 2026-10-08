/*
 * roombots.js: a room's AI pilots as seats (docs/AI-PILOTS-CONTRACT.md).
 * edge/rooms/bots.js flies them; this gives each a seat in RoomCore.seats,
 * so every game, the mid air referee and every client's peers see an
 * ordinary pilot, and keeps them where the contract says:
 *
 *   FILL     a room whose game allows AI pilots (src/share/modes.js
 *            allowAI), on the world they can fly (bots.js BOT_MAP), with at
 *            least one person in it, every one of them on a build that
 *            draws an AI pilot as one (BOT_ROOM_LEVEL), is filled to
 *            FILL_TO pilots, people and AI together, at the room's level.
 *   LEAVE    a person arriving takes the newest AI pilot's place
 *            (makeRoom), and the last person leaving takes them all.
 *   MARKED   every join and peer list says bot: true; a client names the
 *            seat as an AI pilot (src/share/rooms.js shownName).
 *
 * An AI seat's key in RoomCore.seats is a BotConn: it swallows what the
 * room sends it, so host.js run() never needs to know. The seat record
 * carries bot: true, which core.js people() leaves out of everything that
 * means the people here (the host, the cap, an empty room, the votes, the
 * lobby's count, ready).
 *
 * WHAT IS KEPT. { store: 'bots', value } on every change of the seats and
 * every STORE_MS of flight: the flight (bots.js save), each AI seat's
 * number and name, and the level. host.js restores it before the people's
 * seats, and core.js restore() puts the AI seats back.
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

import { BOT_AIRFRAME, BOT_MAP, Bots, LEVELS } from './bots.js';
import {
  NAME_ADJECTIVES, NAME_ANIMALS, NAME_NUMBER_MAX, NAME_NUMBER_MIN, decodePose, encodePose,
} from '../../src/share/roomwire.js';
import { modeOfRoom } from '../../src/share/modes.js';
import { CHASE_BOOST } from '../../src/share/roomtag.js';

/* People and AI together that a room is filled to: the owner's call
 * (the contract's question 1); four is a tag match with someone to catch
 * and two others hunting. */
export const FILL_TO = 4;
/* The ROOM_LEVEL (src/share/roomwire.js) that names an AI seat as one. */
export const BOT_ROOM_LEVEL = 3;
/* The level a room is filled at until its host says otherwise. */
export const DEFAULT_LEVEL = 'normal';
/* The flight is stored this often while it flies, room ms: a restart
 * resumes from at most this far back. */
const STORE_MS = 5000;

/* What the room sends an AI seat goes nowhere. */
export class BotConn {
  constructor(seat) {
    this.bot = seat;
  }

  send() {}

  close() {}

  serializeAttachment() {}

  deserializeAttachment() {
    return null;
  }
}

/* A seed from the room's code, so two rooms fly two ways and one room
 * flies one way however often it is restored. */
function seedOf(code) {
  let h = 2166136261;
  for (const ch of String(code ?? '')) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return h >>> 0;
}

export class RoomBots {
  constructor(meta) {
    this.bots = new Bots(seedOf(meta.code));
    this.level = DEFAULT_LEVEL;
    /* seat -> name pick, for the AI seats this room has. */
    this.names = new Map();
    this.storedAt = -Infinity;
  }

  restore(saved) {
    if (!saved) {
      return;
    }
    this.bots.restore(saved.flight);
    this.level = LEVELS[saved.level] ? saved.level : DEFAULT_LEVEL;
    this.names = new Map((saved.seats ?? []).map((s) => [s.seat, s.name]));
  }

  store(roomMs = null) {
    if (roomMs != null) {
      this.storedAt = roomMs;
    }
    return {
      store: 'bots',
      value: { flight: this.bots.save(), level: this.level, seats: [...this.names].map(([seat, name]) => ({ seat, name })) },
    };
  }

  /* The AI seats back in core.seats after a load (core.js restore). */
  reseat(core) {
    for (const [seat, name] of this.names) {
      if (this.bots.has(seat)) {
        this.seatRecord(core, seat, name, 0);
      }
    }
  }

  seatRecord(core, seat, name, now) {
    const s = {
      seat,
      token: `bot${seat}`,
      name,
      callsign: null,
      account: null,
      profile: { airframe: BOT_AIRFRAME, map: BOT_MAP, figure: 0, livery: null, parts: null },
      joined: now,
      connectedAt: now,
      heardAt: now,
      address: '',
      pose: null,
      recent: [],
      sent: new Map(),
      level: BOT_ROOM_LEVEL,
      seq: 0,
      bot: true,
    };
    core.seats.set(new BotConn(seat), s);
    core.referee.seat(seat, BOT_AIRFRAME);
    core.combat.seat(seat, BOT_AIRFRAME);
    return s;
  }

  /* How many AI seats this room should have now. */
  wanted(core) {
    const people = core.people();
    const mode = modeOfRoom(core.meta.mode);
    if (!people.length || !mode || !mode.allowAI || core.meta.map !== BOT_MAP || !LEVELS[this.level]) {
      return 0;
    }
    if (people.some((s) => (s.level || 0) < BOT_ROOM_LEVEL)) {
      return 0;
    }
    return Math.max(0, Math.min(FILL_TO, core.meta.cap) - people.length);
  }

  /* Add or take away AI seats to what wanted() says. Returns actions. */
  fill(core, now) {
    const want = this.wanted(core);
    const out = [];
    let changed = false;
    while (this.names.size > want) {
      out.push(...this.leave(core, this.newest(), now));
      changed = true;
    }
    while (this.names.size < want) {
      const seat = core.freeSeat(0);
      if (!seat) {
        break;
      }
      const name = this.drawName(core);
      this.names.set(seat, name);
      this.bots.add(seat, this.level, core.roomMs(now));
      const s = this.seatRecord(core, seat, name, now);
      out.push(...core.roster(null, JSON.stringify({
        type: 'join', seat, name, profile: s.profile, host: core.host(), bot: true,
      })));
      changed = true;
    }
    return changed ? [this.store(), ...out] : out;
  }

  /* A person is arriving at a full room: the newest AI seat goes.
   * Returns actions, none when there is no AI seat to give. */
  makeRoom(core, now) {
    const seat = this.newest();
    if (seat == null) {
      return [];
    }
    return [...this.leave(core, seat, now), this.store()];
  }

  newest() {
    return [...this.names.keys()].at(-1) ?? null;
  }

  /* The AI seat `seat` leaves the room, as a person's clean leave. */
  leave(core, seat, now) {
    this.names.delete(seat);
    this.bots.remove(seat);
    for (const [conn, s] of core.seats) {
      if (s.bot && s.seat === seat) {
        core.seats.delete(conn);
      }
    }
    core.referee.leave(seat);
    core.combat.leave(seat);
    core.gameLobby.ready.delete(seat);
    return [
      ...core.roster(null, JSON.stringify({ type: 'leave', seat, host: core.host() })),
      ...core.race.leave(core, seat),
    ];
  }

  /* Every AI seat gone at once: the last person left. */
  clear(core, now) {
    const out = [];
    for (const seat of [...this.names.keys()]) {
      out.push(...this.leave(core, seat, now));
    }
    return out.length ? [this.store(), ...out] : out;
  }

  /* A name no seat here has, drawn from the flight's generator. */
  drawName(core) {
    const taken = new Set([...core.seats.values()].map((s) => JSON.stringify(s.name)));
    for (;;) {
      const name = [
        Math.floor(this.bots.random() * NAME_ADJECTIVES),
        Math.floor(this.bots.random() * NAME_ANIMALS),
        NAME_NUMBER_MIN + Math.floor(this.bots.random() * (NAME_NUMBER_MAX - NAME_NUMBER_MIN + 1)),
      ];
      if (!taken.has(JSON.stringify(name))) {
        return name;
      }
    }
  }

  /* Whether AI pilots fly here now, for the room's clock (core.js
   * waiting). */
  flying(core) {
    return this.names.size > 0 && core.people().length > 0;
  }

  /*
   * What the game wants of AI seat `seat`, for bots.js step(): in a tag
   * match on, the orb to catch while it is free, the hunters to run from
   * for the Ace, else the Ace to catch; null (wander) otherwise.
   */
  orders(core, places) {
    const m = core.tag.on() && core.tag.match.state === 'live' ? core.tag.match : null;
    return (seat) => {
      if (!m) {
        return null;
      }
      if (m.orb) {
        return { chase: { p: [m.orb.px, m.orb.py, m.orb.pz], v: [0, 0, 0] }, boost: CHASE_BOOST };
      }
      if (m.ace === seat) {
        return { flee: [...places].filter(([s]) => s !== seat).map(([, p]) => p.p) };
      }
      /* A hunter flies with tag's chase boost, as a person hunting does
       * (src/share/roomtag.js CHASE_BOOST). */
      const ace = places.get(m.ace);
      return ace ? { chase: ace, boost: CHASE_BOOST } : null;
    };
  }

  /* The room tick: every AI seat flown to now, its pose handed to the
   * room's judges as a person's relayed one is (core.js judge). */
  tick(core, now) {
    if (!this.flying(core)) {
      return [];
    }
    const roomNow = Math.floor(core.roomMs(now));
    const places = new Map();
    for (const s of core.seats.values()) {
      const p = s.pose ? decodePose(s.pose) : null;
      if (p && s.profile.map === core.meta.map) {
        places.set(s.seat, { p: [p.px, p.py, p.pz], v: [p.vx, p.vy, p.vz] });
      }
    }
    const bySeat = new Map([...core.seats.values()].filter((s) => s.bot).map((s) => [s.seat, s]));
    const out = [];
    for (const { seat, pose } of this.bots.step(roomNow, this.orders(core, places))) {
      const s = bySeat.get(seat);
      if (!s) {
        continue;
      }
      s.seq = (s.seq + 1) & 0xffff;
      out.push(...core.judge(s, encodePose({ ...pose, seq: s.seq }), now));
    }
    if (roomNow - this.storedAt >= STORE_MS) {
      out.push(this.store(roomNow));
    }
    return out;
  }
}
