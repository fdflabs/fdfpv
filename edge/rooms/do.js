/*
 * do.js: the rooms Worker, fdfpv-rooms, and its Durable Objects.
 *
 * The Cloudflare adapter and nothing else. One Room object per room,
 * named `prv:<code>`, public or private (front.js), holds
 * a RoomHost (host.js) over the object's own state and speaks the wire in
 * src/share/roomwire.js through the hibernation WebSocket API. The Worker
 * in front of them is front.js, the same front edge/rooms/node.js serves
 * on the VM, and the Lobby is lobby.js.
 *
 * Observability logging is off in wrangler.toml, so connecting addresses
 * do not land in logs either (front.js, ADDRESSES).
 *
 * Deploy: npx wrangler deploy --config edge/rooms/wrangler.toml
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

import { DurableObject } from 'cloudflare:workers';
import { RoomHost } from './host.js';
import { Lobby } from './lobby.js';
import front from './front.js';

export { Lobby };

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.host = new RoomHost(ctx, env);
    /* The keepalive, answered without waking the object. */
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') {
      const made = await this.host.init(await request.json());
      return made ? new Response('ok') : new Response('taken', { status: 409 });
    }
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('expected a websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    await this.host.accept(server, request);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.host.message(ws, message);
  }

  async webSocketClose(ws, code) {
    await this.host.close(ws, code);
  }

  async webSocketError(ws) {
    await this.host.close(ws, 1006);
  }

  async alarm() {
    await this.host.alarm();
  }
}

export default front;
