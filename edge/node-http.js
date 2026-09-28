/*
 * node-http.js: a Worker style fetch handler, served by node:http.
 *
 * The rooms server (edge/rooms/node.js) and the tracks server
 * (tracks-api/node.js) are fetch handlers over web standard Request and
 * Response, the same code Cloudflare runs. This is the only glue Node
 * needs to serve one: a Request from each incoming message, and the
 * Response written back.
 *
 * THE CLIENT ADDRESS. Both servers read it from cf-connecting-ip, the
 * header Cloudflare sets. On the VM, Caddy (deploy/vm/Caddyfile) sets the
 * same header from the connection and overwrites any a client sent, and
 * these servers listen on loopback only, so nothing else can reach them to
 * forge it. A request with no such header (a local run with no proxy) gets
 * the socket's own address.
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

import { STATUS_CODES } from 'node:http';
import { Readable } from 'node:stream';

export function requestFrom(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  if (!headers.has('cf-connecting-ip')) {
    headers.set('cf-connecting-ip', req.socket.remoteAddress || '');
  }
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = Readable.toWeb(req);
    init.duplex = 'half';
  }
  return new Request(new URL(req.url, `http://${headers.get('host') || 'localhost'}`), init);
}

export async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    for await (const chunk of response.body) {
      res.write(chunk);
    }
  }
  res.end();
}

/* A Response to a request that asked for a WebSocket and is not getting
 * one, written straight onto the socket node:http handed over. */
export async function refuseUpgrade(socket, response) {
  const text = response.body ? await response.text() : '';
  const head = [`HTTP/1.1 ${response.status} ${STATUS_CODES[response.status] || ''}`, 'connection: close'];
  for (const [name, value] of response.headers) {
    head.push(`${name}: ${value}`);
  }
  head.push(`content-length: ${Buffer.byteLength(text)}`);
  socket.end(`${head.join('\r\n')}\r\n\r\n${text}`);
}

function logError(e) {
  console.error(e && e.stack ? e.stack : e);
}

/* The handler's answer to an incoming message, or a 500 with the error on
 * stderr (the journal): a thrown handler is a bug to see, and the client
 * must not hang on it. */
export async function answer(handler, req, env) {
  try {
    return await handler.fetch(requestFrom(req), env);
  } catch (e) {
    logError(e);
    return new Response('server error', { status: 500 });
  }
}

/* node:http's request listener for a fetch handler. Nothing in it may
 * reject unhandled: that ends the process, and every room with it. */
export function listener(handler, env) {
  return (req, res) => {
    answer(handler, req, env).then((response) => send(res, response)).catch((e) => {
      logError(e);
      res.destroy();
    });
  };
}

/* The same for node:http's upgrade event: run(req, socket, head) is the
 * server's own, and a failure closes the socket rather than the process. */
export function upgradeListener(run) {
  return (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    run(req, socket, head).catch((e) => {
      logError(e);
      socket.destroy();
    });
  };
}
