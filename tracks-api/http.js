/*
 * http.js: the answers, the body reader and the rate limit the tracks
 * routes (worker.js) and the account routes (accounts.js) share.
 *
 * Nothing is ambiently authenticated and no cookie is ever set, so the CORS
 * answer is `*`: an account's session is a bearer token the page sends on
 * purpose, never something a browser attaches by itself.
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

import { sha256Base64 } from '../src/share/identity.js';
import { WRITE_WINDOW_S } from './limits.js';

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, DELETE, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });
}

export function refuse(status, error, extra = {}) {
  return json(status, { error, ...extra });
}

/* Milliseconds, so two saves in one second still list in the order they
 * were made. */
export function nowUtc() {
  return new Date().toISOString();
}

/* The body as parsed JSON, refused past maxBytes without reading the rest. */
export async function readBody(request, maxBytes, tooBig) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { error: refuse(413, tooBig) };
  }
  const reader = request.body ? request.body.getReader() : null;
  const chunks = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { error: refuse(413, tooBig) };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch (e) {
    return { error: refuse(400, 'The request is not JSON.') };
  }
}

/*
 * One more of `label`'s requests from this address, or a 429 when it has
 * had its `limit` for the window. The address is hashed before it is
 * stored, and rows from finished windows are swept on the way, so the table
 * only ever holds the current window. Every label shares the one window
 * length, which is what makes that sweep right for all of them. The track
 * saves' label is '' and hashes exactly as it did before there were others.
 */
export async function spend(env, request, label, limit, message) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % WRITE_WINDOW_S);
  const who = label ? `${label}|${ip}` : ip;
  const bucket = `${(await sha256Base64(`fdfpv-rate/v1|${who}`)).slice(0, 22)}|${windowStart}`;
  await env.DB.prepare('DELETE FROM write_counts WHERE window_start < ?').bind(windowStart).run();
  const row = await env.DB.prepare(
    'INSERT INTO write_counts (bucket, window_start, n) VALUES (?, ?, 1) '
    + 'ON CONFLICT (bucket) DO UPDATE SET n = n + 1 RETURNING n',
  ).bind(bucket, windowStart).first();
  if (row.n > limit) {
    const retry = windowStart + WRITE_WINDOW_S - now;
    return refuse(429, message, { retryAfterS: retry });
  }
  return null;
}
