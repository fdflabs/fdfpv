/*
 * host.js: one room as a server holds it, for either platform.
 *
 * RoomHost is what carries a RoomCore (core.js) on a server: it loads the
 * room from storage, accepts sockets, runs the core's actions, drives the
 * 30 Hz tick while anybody flies, and purges the room's storage five
 * minutes after the last pilot leaves (PURGE_MS). It is written against a small
 * platform contract, the shape of a Durable Object's state, so the same
 * code runs on Cloudflare (do.js) and on a plain Node server (node.js):
 *
 *   ctx.storage.get(key)       async, the value put under key, or undefined
 *   ctx.storage.put(key, v)    async; v is structured clone data
 *   ctx.storage.list()         async, a Map of every key to its value
 *   ctx.storage.deleteAll()    async, the room forgotten
 *   ctx.storage.setAlarm(ms)   async; alarm() is called at that wall ms
 *   ctx.storage.getAlarm()     async, the wall ms of the alarm set, or null
 *   ctx.getWebSockets()        the room's open sockets
 *
 * and a socket (a conn) is:
 *
 *   conn.send(data)            a string or a Uint8Array
 *   conn.close(code, reason)
 *   conn.serializeAttachment(v) / conn.deserializeAttachment()
 *
 * The platform also promises that one room's calls into this object run
 * one at a time, never interleaved across an await: a Durable Object's
 * input gate does that on Cloudflare, and node.js queues them.
 *
 * A NEW CORE FEATURE belongs in core.js and its own module, and needs
 * nothing here: what it must keep across a hibernation or a restart it
 * returns as { store: key, value }, and load() hands the value back to
 * core[key].restore(). Only a new KIND of action belongs here, once, and
 * then both platforms have it. edge/rooms/README.md says the same.
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
  RoomCore, PRIVATE_CAP, TICK_MS, devAccountsOf,
} from './core.js';
import {
  CLOSE, EMPTY_CLOSE_MS, NAME_ADJECTIVES, NAME_ANIMALS, NAME_NUMBER_MAX, NAME_NUMBER_MIN, PUBLIC_CAP,
} from '../../src/share/roomwire.js';
import { reportRoom } from './lobby.js';
import { retiredMap } from '../../src/maps/retired.js';

/*
 * AN EMPTY ROOM CLOSES PURGE_MS AFTER ITS LAST PILOT LEFT, and a pilot
 * back before then keeps it: the alarm finds a socket and waits again.
 * The alarm is also when the room says it went empty, core.emptySince =
 * the alarm less PURGE_MS, which the lobby lists it by (lobby.js), so an
 * empty room is listed exactly as long as it can still be joined.
 */
export const PURGE_MS = EMPTY_CLOSE_MS;

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newToken() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

/* A room's picker name, the name it shows when it has no typed one. */
function roomPick() {
  const r = crypto.getRandomValues(new Uint32Array(3));
  return [r[0] % NAME_ADJECTIVES, r[1] % NAME_ANIMALS, NAME_NUMBER_MIN + (r[2] % (NAME_NUMBER_MAX - NAME_NUMBER_MIN + 1))];
}

/*
 * THE TICK KEEPS THE ROOM'S CLOCK, not its own. A timer fires late by
 * however long the event loop was busy, and a tick that set its next
 * timer TICK_MS from when it ran added that lateness to every period: a
 * loop 5 ms late on each ran the room at 26 Hz, not 30 (rooms:selftest).
 * So each tick is due TICK_MS after the one before it was due, and the
 * lateness of one is taken out of the wait for the next. When that moment
 * has already gone (a stall longer than a tick, or a room whose tick had
 * stopped and starts again) the cadence starts over TICK_MS from now: no
 * tick is ever run twice to catch up, which would send a burst of batches
 * carrying nothing new.
 */
export function nextTickDue(lastDue, now) {
  const next = lastDue == null ? -Infinity : lastDue + TICK_MS;
  return next > now ? next : now + TICK_MS;
}

export class RoomHost {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.core = null;
    this.timer = null;
    this.tickDue = null; /* wall ms the tick last timed was due, nextTickDue */
  }

  async load() {
    if (this.core) {
      return this.core;
    }
    const meta = await this.ctx.storage.get('meta');
    if (!meta) {
      return null;
    }
    /* A room stored on a world since retired (src/maps/retired.js) wakes
     * in the world that replaced it, as a pilot's own stored setting does,
     * rather than being closed: its code stays good for the friends it was
     * given to, and every pilot it seats is told its world in the welcome.
     * No game can be on one: Yellowstone took no tracks and no war. */
    const gone = retiredMap(meta.map);
    if (gone) {
      meta.map = gone.to;
      await this.ctx.storage.put('meta', meta);
    }
    /* env.TURN is node.js's TURN credential minter, when the VM has one;
     * env.DEV_MISSIONS is node.js's, for a check's own server. */
    this.core = new RoomCore(meta, { turn: this.env.TURN || null, devMissions: this.env.DEV_MISSIONS === true, devAccounts: devAccountsOf(this.env.DEV_ACCOUNTS) });
    /* Every key a { store } action wrote is the name of the core's part
     * that keeps it (core.race for 'race'), restored before the seats. A
     * key with no such part is a bug and throws here, not a race that
     * silently comes back empty. */
    for (const [key, value] of await this.ctx.storage.list()) {
      if (key !== 'meta') {
        this.core[key].restore(value);
      }
    }
    this.core.restore(this.ctx.getWebSockets().map((ws) => ({ conn: ws, attachment: ws.deserializeAttachment() })));
    /* After a hibernation or a restart, when the room went empty is what
     * its stored alarm says, not the moment it was woken. */
    this.core.emptySince = this.emptySinceOf(await this.ctx.storage.getAlarm());
    return this.core;
  }

  emptySinceOf(alarmAt) {
    return alarmAt == null ? null : alarmAt - PURGE_MS;
  }

  /* The purge PURGE_MS from now, or `soon`, and the room empty since now. */
  closeLater(soon = PURGE_MS) {
    const at = Date.now() + soon;
    if (this.core) {
      this.core.emptySince = this.emptySinceOf(at);
    }
    return this.ctx.storage.setAlarm(at);
  }

  run(actions) {
    for (const a of actions) {
      if (a.send) {
        try {
          a.send.send(a.data);
        } catch (e) {
          /* A socket closing under us: its close event cleans up. */
        }
      } else if (a.close) {
        try {
          a.close.close(a.code, a.reason);
        } catch (e) {
          /* Already closed. */
        }
      } else if (a.attach) {
        a.attach.serializeAttachment(a.value);
      } else if (a.store) {
        this.ctx.storage.put(a.store, a.value);
      } else if (a.tick && !this.timer) {
        const now = Date.now();
        this.tickDue = nextTickDue(this.tickDue, now);
        this.timer = setTimeout(() => {
          this.timer = null;
          const at = Date.now();
          this.run(this.core.tick(at));
          /* A countdown runs out on a tick, and the browser shows it. */
          reportRoom(this.env, this.core, at);
        }, this.tickDue - now);
      } else if (a.empty) {
        this.closeLater(a.now ? 0 : PURGE_MS);
      }
    }
  }

  /* A new room, from front.js (POST /v2/create, or a quick join that
   * found no room): false when the code is already taken. body is {
   * code, map, friendly, public, name, mode, mission }, checked by the front; the
   * name typed and filtered there, or null for the picker name drawn
   * here. A public room is listed at once, before anybody joins it. */
  async init(body) {
    if (await this.ctx.storage.get('meta')) {
      return false;
    }
    const open = body.public === true;
    await this.ctx.storage.put('meta', {
      code: body.code,
      /* ROOM_CAP is rooms:load's, to measure rooms past the public cap on
       * a server of its own (node.js startRooms); nothing deployed sets it. */
      cap: this.env.ROOM_CAP || (open ? PUBLIC_CAP : PRIVATE_CAP),
      friendly: Boolean(body.friendly),
      map: body.map,
      epoch: Date.now(),
      public: open,
      name: body.name ?? null,
      pick: roomPick(),
      mode: body.mode ?? null,
      mission: body.mission ?? null,
      hidden: false,
    });
    /* A room made and never joined is purged like an emptied one. */
    await this.closeLater();
    await this.announce();
    return true;
  }

  /* Tell the lobby this room is here, if it is a public one: after init,
   * and on the VM after a restart (node.js), whose lobby forgot it. */
  async announce() {
    reportRoom(this.env, await this.load(), Date.now());
  }

  /* A socket the platform has just accepted into this room. */
  async accept(conn, request) {
    conn.serializeAttachment({ address: request.headers.get('x-room-address') || '' });
    /* A code nobody made is answered at the hello (message), not here: a
     * close sent before the 101 has reached the client was lost in local
     * workerd often enough to leave a client waiting forever. */
    const core = await this.load();
    if (core) {
      this.run(core.open(conn, Date.now()));
    }
  }

  /* callsign and account: see RoomCore.hello; only a platform that asked
   * the accounts server passes them. */
  async message(conn, message, callsign = null, account = null) {
    const core = await this.load();
    if (!core) {
      conn.close(CLOSE.nosuch, 'nosuch');
      return;
    }
    const data = typeof message === 'string' ? message : new Uint8Array(message);
    const attached = conn.deserializeAttachment() || {};
    const now = Date.now();
    this.run(core.message(conn, data, now, attached.address || '', newToken, callsign, account));
    /* A pose never changes the room's line, and a seat the pose rules
     * remove is reported by the tick that is running while poses come. */
    if (typeof data === 'string') {
      reportRoom(this.env, core, now);
    }
  }

  /* code: the socket's close code, when the platform says (core.close). */
  async close(conn, code) {
    const core = await this.load();
    if (core) {
      const now = Date.now();
      this.run(core.close(conn, now, code));
      reportRoom(this.env, core, now);
    }
  }

  async alarm() {
    if (this.ctx.getWebSockets().length) {
      await this.closeLater();
      return;
    }
    await this.ctx.storage.deleteAll();
    /* A tick still due would run on the core just forgotten. */
    clearTimeout(this.timer);
    this.timer = null;
    this.core = null;
  }
}
