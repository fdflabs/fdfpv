/*
 * turn.js: short lived TURN credentials for voice chat, the TURN REST API
 * scheme coturn calls use-auth-secret (draft-uberti-behave-turn-rest-00):
 *
 *   username   = "<expiry, unix seconds>:<anything>"
 *   credential = base64(HMAC-SHA1(secret, username))
 *
 * coturn holds the same secret (static-auth-secret, deploy/vm/turn-install.sh)
 * and recomputes the credential from the username, so nothing is stored on
 * either side and a credential stops working at its expiry by itself. The
 * part after the colon is random per credential, not the pilot: coturn's
 * user-quota counts allocations per username, so a random one keeps each
 * pilot's allowance their own, and it names nobody.
 *
 * Node only (node:crypto), imported by edge/rooms/node.js alone: the room
 * core, which Cloudflare also runs, is handed the minter as a function
 * (edge/rooms/voice.js) and never imports this.
 *
 * TTL_S: a relayed link refreshes its allocation with the same credential
 * for as long as it lasts, so the credential has to outlive a long session
 * in a room; a link past it fails and the client makes it again with fresh
 * ones (src/share/voice.js).
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

import { createHmac, randomBytes } from 'node:crypto';

export const TTL_S = 6 * 60 * 60;

/* The credential for one username, as coturn computes it. */
export function turnCredential(secret, username) {
  return createHmac('sha1', secret).update(username).digest('base64');
}

/*
 * The minter the room core is given, or null when there is no TURN server:
 * no secret, or no address to hand out. urls is TURN_URLS, comma separated
 * (turn:129.151.39.48:3478?transport=udp,...).
 */
export function turnMinter(secret, urls) {
  const list = String(urls || '').split(',').map((u) => u.trim()).filter(Boolean);
  if (!secret || !list.length) {
    return null;
  }
  if (!list.every((u) => /^turns?:[^\s,]+$/.test(u))) {
    throw new Error(`TURN_URLS: every entry is a turn: or turns: URL, got ${urls}`);
  }
  return (now) => {
    const username = `${Math.floor(now / 1000) + TTL_S}:${randomBytes(6).toString('hex')}`;
    return { ice: [{ urls: list, username, credential: turnCredential(secret, username) }], ttl: TTL_S };
  };
}
