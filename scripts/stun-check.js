/*
 * stun-check.js: does a STUN server answer over UDP from here?
 *
 *   node scripts/stun-check.js 129.151.39.48 3478
 *
 * One Binding request (RFC 5389), three tries a second apart; prints the
 * address the server saw and exits 0, or exits 1 when nothing came back,
 * which for the VM's coturn means it is down or a firewall (firewalld, or
 * Oracle's security list) drops UDP 3478. deploy/vm/deploy-turn.sh runs it.
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

import dgram from 'node:dgram';
import { randomBytes } from 'node:crypto';

const host = process.argv[2];
const port = Number(process.argv[3] || 3478);
if (!host) {
  console.error('usage: node scripts/stun-check.js <host> [port]');
  process.exit(2);
}

const MAGIC = 0x2112a442;
const XOR_MAPPED = 0x0020;
const id = randomBytes(12);
const request = Buffer.alloc(20);
request.writeUInt16BE(0x0001, 0);
request.writeUInt16BE(0, 2);
request.writeUInt32BE(MAGIC, 4);
id.copy(request, 8);

/* The XOR-MAPPED-ADDRESS of a Binding success response, as a.b.c.d:port. */
function mapped(msg) {
  if (msg.length < 20 || msg.readUInt16BE(0) !== 0x0101 || !msg.subarray(8, 20).equals(id)) {
    return null;
  }
  for (let at = 20; at + 4 <= msg.length;) {
    const type = msg.readUInt16BE(at);
    const len = msg.readUInt16BE(at + 2);
    if (type === XOR_MAPPED && msg[at + 5] === 0x01) {
      const p = msg.readUInt16BE(at + 6) ^ (MAGIC >>> 16);
      const ip = [0, 1, 2, 3].map((i) => msg[at + 8 + i] ^ ((MAGIC >>> (24 - 8 * i)) & 0xff));
      return `${ip.join('.')}:${p}`;
    }
    at += 4 + len + ((4 - (len % 4)) % 4);
  }
  return null;
}

const sock = dgram.createSocket('udp4');
let tries = 0;
const timer = setInterval(() => {
  if (tries >= 3) {
    clearInterval(timer);
    sock.close();
    console.error(`stun-check: no answer from ${host}:${port} over UDP in 3 s (coturn down, or a firewall or Oracle's security list dropping UDP ${port})`);
    process.exit(1);
  }
  tries += 1;
  sock.send(request, port, host);
}, 1000);
sock.on('message', (msg) => {
  const seen = mapped(msg);
  if (seen) {
    clearInterval(timer);
    sock.close();
    console.log(`stun-check: ${host}:${port} answered over UDP; it sees this machine as ${seen}`);
    process.exit(0);
  }
});
sock.send(request, port, host);
tries += 1;
