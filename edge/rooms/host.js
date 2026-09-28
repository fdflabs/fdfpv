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
 * A NEW CORE FEATURE belongs in core.js and its own module; a new action,
 * or a new thing to reload from storage, belongs here, once, and both
 * platforms have it. edge/rooms/README.md says the same for whoever adds
 * the next one.
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
import { CLOSE } from '../../src/share/roomwire.js';
import { publicMeta, reportCount } from './lobby.js';

export const PURGE_MS = 10 * 60 * 1000;

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newToken() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
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
      } else if (a.tick && !this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.run(this.core.tick(Date.now()));
        }, TICK_MS);
      } else if (a.empty) {
        this.ctx.storage.setAlarm(Date.now() + PURGE_MS);
      }
    }
  }

  /* A new private room, from the Worker's POST /v2/create: false when the
   * code is already taken. */
  async init(body) {
    if (await this.ctx.storage.get('meta')) {
      return false;
    }
    await this.ctx.storage.put('meta', {
      code: body.code,
      cap: PRIVATE_CAP,
      friendly: Boolean(body.friendly),
      map: body.map,
      epoch: Date.now(),
    });
    /* A room made and never joined is purged like an emptied one. */
    await this.ctx.storage.setAlarm(Date.now() + PURGE_MS);
    return true;
  }

  /* A socket the platform has just accepted into this room. */
  async accept(conn, request) {
    await publicMeta(this.ctx.storage, request);
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
    this.run(core.message(conn, data, Date.now(), attached.address || '', newToken));
    reportCount(this.env, core);
  }

  async close(conn) {
    const core = await this.load();
    if (core) {
      this.run(core.close(conn, Date.now()));
      reportCount(this.env, core);
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
