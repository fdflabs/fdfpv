/*
 * roompilot.js: a pilot seated in a room from node, for the browser checks
 * that need a public room with somebody in it. An empty room is never
 * listed (edge/rooms/lobby.js, the owner's 2026-10-02 rule), so a check
 * that makes rooms for a page to find puts one of these in each.
 *
 *   const p = await seatPilot('http://127.0.0.1:8797', 'ABC123', [1, 2, 42]);
 *   ...
 *   p.close();
 *
 * Resolves once the room's welcome came, and rejects when the room closed
 * the socket instead. The pilot sends nothing after its hello; the room
 * answers its pings (ws's own) and keeps the seat.
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

import { WebSocket } from 'ws';
import { PROTO, ROOM_LEVEL } from '../../src/share/roomwire.js';

const PROFILE = { airframe: 'cub1400', map: 'swiss2', figure: 1, livery: null, parts: null };

export function seatPilot(origin, code, name = [1, 2, 42]) {
  const ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/v2/room/${code}`, { headers: { origin: 'https://fdflabs.github.io' } });
  return new Promise((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', proto: PROTO, build: 'check', level: ROOM_LEVEL, name, profile: PROFILE })));
    ws.on('message', (data, binary) => {
      if (binary) {
        return;
      }
      const text = data.toString();
      const m = text === 'pong' ? null : JSON.parse(text);
      if (m && m.type === 'welcome') {
        resolve({ welcome: m, close: () => ws.close(1000) });
      }
    });
    ws.on('close', (c, reason) => reject(new Error(`room ${code} closed the pilot: ${c} ${reason}`)));
    ws.on('error', reject);
  });
}
