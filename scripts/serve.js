/*
 * serve.js: a small static server for the repository root on 127.0.0.1,
 * so index.html, the ES modules and dist/sim.wasm load in a browser with
 * the right MIME types, with byte ranges and a cache policy close enough
 * to the production static host (Render) that a local page behaves like
 * the deploy. Run with npm run serve (PORT overrides 8000) and open
 * http://127.0.0.1:8000/.
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

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = process.env.PORT ? Number(process.env.PORT) : 8000;

/*
 * The Itaipu map data are built outside the repository
 * (docs/ITAIPU-PLAN.md) and the map fetches them from itaipu-data/ beside
 * the page, so that one prefix is served from the pipeline's output
 * folder instead of the repo.
 */
const DATA_PREFIX = 'itaipu-data/';
const dataDir = resolve(process.env.FDFPV_ITAIPU_DATA || join(homedir(), 'Desktop', 'fdfpv-itaipu-data'));

/*
 * .ico is listed because without it the site icon goes out as
 * octet-stream and the tab stays blank locally while Render types it
 * itself. .webm is video/webm although every .webm here is audio only:
 * that is what Render's table says, and serving anything else would hide
 * whether a browser accepts the file as production serves it. .css is
 * deliberately absent (src/ui/fpvhud.js injects its CSS because of it).
 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.rec': 'application/octet-stream',
  '.diff': 'text/plain; charset=utf-8',
  '.webm': 'video/webm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
};

/*
 * render.yaml serves /assets/music/* immutable for a year and everything
 * else no-cache. The music player warms the next track through a second
 * media element so the handoff comes from disk cache; under a blanket
 * no-store that warm is the same track downloaded twice and a local
 * harness could not tell the two apart. The cost is the deploy's cost: a
 * re-encoded crate is not noticed by a browser that has it cached, so
 * bump MUSIC_REV in src/render/tracks.js, the same lever production needs.
 */
const MUSIC_PREFIX = 'assets/music/';
const MUSIC_CACHE = 'public, max-age=31536000, immutable';

/* Resolves a request target to { file, rel }, or throws for anything that cannot name a file. */
function locate(target) {
  const pathname = decodeURIComponent(new URL(target, 'http://localhost').pathname);
  /* The pathname always starts with /, so normalising it removes every .. before the path is joined. */
  const rel = normalize(pathname).replace(/^[/\\]+/, '') || 'index.html';
  const inData = rel.startsWith(DATA_PREFIX);
  const base = inData ? dataDir : root;
  const file = join(base, inData ? rel.slice(DATA_PREFIX.length) : rel);
  const contained = file === base || file.startsWith(base + sep);
  return { file, rel, contained };
}

/*
 * One range only, in the exact form bytes=a-b with either side optional;
 * anything else is ignored and the whole file is sent. A suffix
 * bytes=-n is the LAST n bytes: getting it backwards serves a header
 * where the browser wanted a trailer.
 */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) {
    return null;
  }
  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === '' || m[2] === '' ? size - 1 : Number(m[2]);
  start = Math.max(start, 0);
  end = Math.min(end, size - 1);
  return { start, end };
}

function notFound(res) {
  res.writeHead(404);
  res.end('not found');
}

/*
 * Files are streamed so a 3 MB track does not first become a 3 MB buffer.
 * pipe() does not forward a read error, and an unhandled 'error' on a
 * readable kills the process, so a file removed mid-response drops that
 * one connection instead of the server.
 */
function send(req, res, status, headers, file, range) {
  res.writeHead(status, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file, range);
  stream.on('error', () => {
    res.destroy();
  });
  res.on('close', () => {
    stream.destroy();
  });
  stream.pipe(res);
}

async function handle(req, res) {
  let found;
  let info;
  try {
    found = locate(req.url);
    if (found.contained) {
      info = await stat(found.file);
    }
  } catch {
    notFound(res);
    return;
  }
  if (!found.contained) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  if (!info.isFile()) {
    notFound(res);
    return;
  }

  const size = info.size;
  const headers = {
    'content-type': MIME[extname(found.file)] || 'application/octet-stream',
    'cache-control': found.rel.startsWith(MUSIC_PREFIX) ? MUSIC_CACHE : 'no-store',
    'accept-ranges': 'bytes',
  };
  /*
   * Chromium's media stack opens a track with Range: bytes=0- and reopens
   * the connection as its buffer fills. A server that ignores Range makes
   * it download the whole file at once, exactly while the map is loading,
   * which production does not do.
   */
  const range = req.headers.range === undefined ? null : parseRange(req.headers.range, size);
  if (!range) {
    send(req, res, 200, { ...headers, 'content-length': size }, found.file);
    return;
  }
  if (range.start > range.end) {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` });
    res.end();
    return;
  }
  send(req, res, 206, {
    ...headers,
    'content-range': `bytes ${range.start}-${range.end}/${size}`,
    'content-length': range.end - range.start + 1,
  }, found.file, range);
}

createServer(handle).listen(port, '127.0.0.1', () => {
  console.log(`FDFPV: http://127.0.0.1:${port}/`);
  console.log('Build the module first if you have not: npm run build:wasm');
});
