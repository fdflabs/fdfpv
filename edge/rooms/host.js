/*
 * host.js: one room as a server holds it, for either platform.
 *
 * RoomHost is what carries a RoomCore (core.js) on a server: it loads the
 * room from storage, accepts sockets, runs the core's actions, drives the
 * 30 Hz tick while anybody flies, and purges the room's storage ten
 * minutes after the last pilot leaves. It is written against a small
 * platform contract, the shape of a Durable Object's state, so the same
 * code runs on Cloudflare (do.js) and on a plain Node server (node.js):
 *
 *   ctx.storage.get(key)       async, the value put under key, or undefined
 *   ctx.storage.put(key, v)    async; v is structured clone data
 *   ctx.storage.list()         async, a Map of every key to its value
 *   ctx.storage.deleteAll()    async, the room forgotten
 *   ctx.storage.setAlarm(ms)   async; alarm() is called at that wall ms
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

import { RoomCore, PRIVATE_CAP, TICK_MS } from './core.js';
import {
  CLOSE, NAME_ADJECTIVES, NAME_ANIMALS, NAME_NUMBER_MAX, NAME_NUMBER_MIN, PUBLIC_CAP,
} from '../../src/share/roomwire.js';
import { reportRoom } from './lobby.js';

export const PURGE_MS = 10 * 60 * 1000;

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

export class RoomHost {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.core = null;
    this.timer = null;
  }

  async load() {
    if (this.core) {
      return this.core;
    }
    const meta = await this.ctx.storage.get('meta');
    if (!meta) {
      return null;
    }
    this.core = new RoomCore(meta);
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
    return this.core;
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
        this.timer = setTimeout(() => {
          this.timer = null;
          const now = Date.now();
          this.run(this.core.tick(now));
          /* A countdown runs out on a tick, and the browser shows it. */
          reportRoom(this.env, this.core, now);
        }, TICK_MS);
      } else if (a.empty) {
        this.ctx.storage.setAlarm(Date.now() + PURGE_MS);
      }
    }
  }

  /* A new room, from front.js (POST /v2/create, or a quick join that
   * found no room): false when the code is already taken. body is {
   * code, map, friendly, public, name, mode }, checked by the front; the
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
      hidden: false,
    });
    /* A room made and never joined is purged like an emptied one. */
    await this.ctx.storage.setAlarm(Date.now() + PURGE_MS);
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

  async message(conn, message) {
    const core = await this.load();
    if (!core) {
      conn.close(CLOSE.nosuch, 'nosuch');
      return;
    }
    const data = typeof message === 'string' ? message : new Uint8Array(message);
    const attached = conn.deserializeAttachment() || {};
    const now = Date.now();
    this.run(core.message(conn, data, now, attached.address || '', newToken));
    /* A pose never changes the room's line, and a seat the pose rules
     * remove is reported by the tick that is running while poses come. */
    if (typeof data === 'string') {
      reportRoom(this.env, core, now);
    }
  }

  async close(conn) {
    const core = await this.load();
    if (core) {
      const now = Date.now();
      this.run(core.close(conn, now));
      reportRoom(this.env, core, now);
    }
  }

  async alarm() {
    if (this.ctx.getWebSockets().length) {
      await this.ctx.storage.setAlarm(Date.now() + PURGE_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
    this.core = null;
  }
}
