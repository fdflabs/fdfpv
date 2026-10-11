/*
 * server.js: the file server behind every browser check. Serves one
 * folder, normally the repository, on a port of the loopback's choosing,
 * the way the deploy serves it: the right type for a module and a wasm,
 * byte ranges for media, the music folder cacheable for a year and
 * nothing else cached at all. Node only.
 *
 * Only files are served: a folder, a missing path, a path that will not
 * decode and anything that resolves outside the root are a 404 or a 403
 * with a one-word body. Every method is answered like GET, HEAD without
 * the body.
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

import { createServer } from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

import { POLICY_PAGES, pagePolicy } from '../../scripts/csp.js';

/* The Itaipu data set is built outside the repository (docs/ITAIPU-PLAN.md)
 * and the map fetches it from itaipu-data/ beside the page, so that prefix
 * is served from the pipeline's output folder, or wherever
 * FDFPV_ITAIPU_DATA points. */
const ITAIPU_PREFIX = 'itaipu-data/';
const ITAIPU_DIR = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));

/* Types the browser is strict about. Anything else goes as bytes. An SVG
 * served as bytes is a broken picture in an <img>; a .webm here is an
 * Opus track but the deploy's table calls it video/webm, and check 14
 * must measure what the public gets. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.rec': 'application/octet-stream',
  '.diff': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm',
};
const BYTES = 'application/octet-stream';

/* SIM_CSP=report or SIM_CSP=enforce: the pages pilots open carry the
 * deployed Content-Security-Policy (scripts/csp.js) as a header, Report-Only
 * or enforced, so any browser check run that way meets what the deployed
 * meta enforces. The checks' own servers live on loopback ports, so those
 * stand in for the API origin. */
const CSP_MODE = process.env.SIM_CSP || '';
if (CSP_MODE && !['report', 'enforce'].includes(CSP_MODE)) {
  throw new Error(`SIM_CSP=${CSP_MODE}: report or enforce`);
}
const LOOPBACK = ['http://127.0.0.1:*', 'ws://127.0.0.1:*'];
const LOCAL_SOURCES = { 'connect-src': LOOPBACK, 'img-src': LOOPBACK, 'media-src': LOOPBACK };
function cspHeader(rel, file) {
  if (!CSP_MODE || !POLICY_PAGES.includes(rel)) {
    return {};
  }
  const name = CSP_MODE === 'report' ? 'content-security-policy-report-only' : 'content-security-policy';
  return { [name]: pagePolicy(readFileSync(file, 'utf8'), LOCAL_SOURCES) };
}

/* render.yaml serves assets/music/* immutable for a year and the rest
 * no-store, and music.js warms the next track through a second element
 * counting on the disk cache. The harness keeps the same split so that
 * warm-up is testable; the cost is the deploy's (bump MUSIC_REV in
 * src/render/tracks.js to re-encode a crate). */
const MUSIC_PREFIX = 'assets/music/';
const YEAR_IMMUTABLE = 'public, max-age=31536000, immutable';

/* Where a request path lands on disk, or null when it would leave the
 * folder it is served from. The path is normalised first, so a ".." only
 * ever climbs within the request, never out of the root. */
function locate(rootDir, requestPath) {
  const rel = normalize(decodeURIComponent(requestPath)).replace(/^[/\\]+/, '');
  const [dir, sub] = rel.startsWith(ITAIPU_PREFIX)
    ? [ITAIPU_DIR, rel.slice(ITAIPU_PREFIX.length)]
    : [rootDir, rel];
  const file = join(dir, sub);
  return { rel, file: file.startsWith(dir) ? file : null };
}

/* One byte range as a browser asks for it, against a file of `size`
 * bytes: null when the header is absent, malformed, names several ranges
 * or is "bytes=-" (whole file); { unsatisfiable } when nothing of it
 * falls inside the file; otherwise the clamped [start, end]. */
function byteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!m || (m[1] === '' && m[2] === '')) {
    return null;
  }
  const suffix = m[1] === '';
  let start = suffix ? size - Number(m[2]) : Number(m[1]);
  let end = suffix || m[2] === '' ? size - 1 : Number(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  return start > end ? { unsatisfiable: true } : { start, end };
}

/* A stream's read error must drop this one answer, not the process: an
 * unhandled 'error' on a Readable is fatal, and .pipe() forwards none. */
function stream(file, res, range) {
  const source = createReadStream(file, range ? { start: range.start, end: range.end } : {});
  source.on('error', () => res.destroy());
  source.pipe(res);
}

async function answer(rootDir, req, res) {
  let where;
  try {
    where = locate(rootDir, new URL(req.url, 'http://127.0.0.1').pathname);
  } catch (e) {
    /* A path that does not decode is a path that does not exist. */
    where = { rel: '', file: '' };
  }
  if (where.file === null) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  const info = await stat(where.file).catch(() => null);
  if (!info || !info.isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const headers = {
    'content-type': TYPES[extname(where.file)] ?? BYTES,
    'cache-control': where.rel.startsWith(MUSIC_PREFIX) ? YEAR_IMMUTABLE : 'no-store',
    'accept-ranges': 'bytes',
    ...cspHeader(where.rel, where.file),
  };
  const range = byteRange(req.headers.range, info.size);
  if (range?.unsatisfiable) {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${info.size}` });
    res.end();
    return;
  }
  if (range) {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`;
    headers['content-length'] = range.end - range.start + 1;
    res.writeHead(206, headers);
  } else {
    headers['content-length'] = info.size;
    res.writeHead(200, headers);
  }
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  stream(where.file, res, range);
}

export async function startServer(rootDir) {
  const server = createServer((req, res) => answer(rootDir, req, res));
  await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
  const { port } = server.address();
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((closed) => {
      server.closeAllConnections();
      server.close(closed);
    }),
  };
}
