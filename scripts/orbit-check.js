/*
 * orbit-check.js: the thumbnail page (src/share/orbit.html and orbit.js)
 * pinned as a transcript in Chromium.
 *
 *     node scripts/orbit-check.js [--dump=<file>]   (npm run orbit:check)
 *
 * A plain page of this checkout frames orbit.html the way a map card and
 * the board do, and records what the frame tells its parent (the
 * fdfpv-orbit-ready and fdfpv-orbit-clip messages, their fields and the
 * clip's size), the window flags the checks read (__orbitReady,
 * __orbitMap, __orbitCached, __orbitLoopMs, __orbitError, the ?capture=1
 * base64), its status line, its title and what it leaves on screen.
 *
 *   - Which world each address records, from clips already cached under
 *     each world's key: a named world, the Track seat (map=custom and
 *     map=track) and an unknown id, which record the title's valley.
 *   - A ?share= course, from a stand in board this script serves: a map
 *     track records its world and titles the page after the course; a
 *     field track, and a course the board does not have, say why not.
 *   - One real capture (?capture=1) of a world: built, recorded for one
 *     camera loop with its length stamped, stored, shown and posted.
 *   - Opened on its own, not in a frame: the cached clip still shows.
 *
 * Pinned by digest (scripts/lib/transcript.js), recorded on the page
 * before its rewrite. Local, not in CI: it drives Chromium.
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

import http from 'node:http';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { transcript } from './lib/transcript.js';

const PINNED = '761785391691c093d5bfa0848a7e1fe0c17a92534847033386d42216f3aa9a5f';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const CAPTURE_MAP = process.env.ORBIT_CAPTURE_MAP || 'alps';

/* The stand in board: two course documents and a 404. */
const COURSES = {
  'trk-onmap': { id: 'trk-onmap', name: 'Ring on the Alps', author: 'Ada', document: { schemaVersion: 4, id: 'trk-onmap', name: 'Doc name', map: 'alps', elements: [], sequence: [] } },
  'trk-bare': { schemaVersion: 4, id: 'trk-bare', name: 'Bare doc on interior', map: 'interior', elements: [], sequence: [] },
  'trk-field': { id: 'trk-field', name: 'Old field', document: { schemaVersion: 3, id: 'trk-field', name: 'Old field', elements: [], sequence: [] } },
};
const boardServer = http.createServer((req, res) => {
  const m = /^\/board\/api\/tracks\/([^/]+)\/document$/.exec(req.url);
  const body = m && COURSES[decodeURIComponent(m[1])];
  res.writeHead(body ? 200 : 404, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body || { error: 'That track is not on the board.' }));
});
await new Promise((r) => boardServer.listen(0, '127.0.0.1', r));
const BOARD = `http://127.0.0.1:${boardServer.address().port}/board`;

/* In the host page: frame `query`, collect messages until the frame has
 * said all it will (`want` messages, or an error), then read it. */
const FRAME = async ({ query, want, seed, timeoutMs }) => {
  const oc = await import('/src/share/orbitcache.js');
  for (const [map, text] of seed || []) {
    await oc.putClip(oc.clipKeyForMap(map), new Blob([text], { type: 'video/webm' }));
  }
  const messages = [];
  const listen = (e) => {
    const d = e.data || {};
    const row = { ...d };
    if (d.buffer) {
      row.buffer = `${d.buffer.constructor.name}:${d.buffer.byteLength > 0}`;
      row.text = d.buffer.byteLength < 64 ? new TextDecoder().decode(d.buffer) : '(clip)';
    }
    messages.push(row);
  };
  window.addEventListener('message', listen);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:480px;height:270px;border:0';
  frame.src = `/src/share/orbit.html${query}`;
  document.body.append(frame);
  const deadline = performance.now() + timeoutMs;
  const w = () => frame.contentWindow;
  while (performance.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    if (messages.length >= want || (w() && w().__orbitError)) {
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 300));
  window.removeEventListener('message', listen);
  const win = w();
  const doc = frame.contentDocument;
  const status = doc.getElementById('status');
  const clipNode = doc.querySelector('.orbit-clip');
  const read = {
    messages,
    flags: {
      ready: win.__orbitReady, map: win.__orbitMap, cached: win.__orbitCached, loopMs: win.__orbitLoopMs, error: win.__orbitError,
      captureDone: win.__orbitCaptureDone, captureBase64: typeof win.__orbitCapture === 'string' ? win.__orbitCapture.length > 1000 : win.__orbitCapture,
      framesRan: typeof win.__orbitFrames === 'number' ? win.__orbitFrames > 8 : win.__orbitFrames,
    },
    title: doc.title,
    status: status ? { text: status.textContent, gone: status.classList.contains('gone') } : null,
    canvasLeft: Boolean(doc.getElementById('view')),
    clip: clipNode ? {
      tag: clipNode.tagName, ariaHidden: clipNode.hasAttribute('aria-hidden'), className: clipNode.className, count: doc.querySelectorAll('.orbit-clip').length,
    } : null,
  };
  /* What IndexedDB holds now, through a copy of the module with nothing
   * in memory. */
  const fresh = await import(`/src/share/orbitcache.js?read=${Math.random()}`);
  const stored = await fresh.getClip(fresh.clipKeyForMap(win.__orbitMap));
  read.storedType = stored && stored.type;
  if (typeof win.__orbitCapture === 'string') {
    /* The Duration stamped in the captured WebM's header, in ms. */
    const b = Uint8Array.from(atob(win.__orbitCapture), (c) => c.charCodeAt(0));
    let at = -1;
    for (let i = 0; i < Math.min(b.length, 16384) - 1; i += 1) {
      if (b[i] === 0x44 && b[i + 1] === 0x89) {
        at = i;
        break;
      }
    }
    const size = at < 0 ? 0 : b[at + 2] & 0x7f;
    const view = new DataView(b.buffer, at + 3, size);
    read.capturedDurationMs = size === 4 ? Math.round(view.getFloat32(0)) : size === 8 ? Math.round(view.getFloat64(0)) : null;
  }
  frame.remove();
  return read;
};

const t = transcript();
const page = await openPage({ root, url: '/privacy.html', width: 800, height: 600 });
try {
  await page.until('document.readyState === "complete"', 30000);
  const run = async (label, args) => {
    const got = await page.evaluate(`(${FRAME.toString()})(${JSON.stringify(args)})`);
    t.note(label, got);
    console.log(`  ${label}: ${got.flags.error || `${got.messages.length} messages`}`);
  };
  const cached = { want: 2, timeoutMs: 30000 };
  await run('a named world, cached', { ...cached, query: '?map=itaipu', seed: [['itaipu', 'clip of itaipu']] });
  await run('the Track seat as map=custom', { ...cached, query: '?map=custom', seed: [['swiss2', 'clip of swiss2']] });
  await run('the Track seat as map=track', { ...cached, query: '?map=track' });
  await run('an unknown world', { ...cached, query: '?map=atlantis' });
  await run('no map at all', { ...cached, query: '' });
  await run('a board course on a world', { ...cached, query: `?map=custom&share=trk-onmap&board=${encodeURIComponent(BOARD)}`, seed: [['alps', 'clip of alps']] });
  await run('a bare board document', { ...cached, query: `?share=trk-bare&board=${encodeURIComponent(BOARD)}`, seed: [['interior', 'clip of interior']] });
  await run('a field course', { ...cached, query: `?map=custom&share=trk-field&board=${encodeURIComponent(BOARD)}` });
  await run('a course the board does not have', { ...cached, query: `?map=custom&share=trk-gone&board=${encodeURIComponent(BOARD)}` });
  await run('a real capture', { want: 2, timeoutMs: 420000, query: `?map=${CAPTURE_MAP}&capture=1` });
  /* On its own, outside any frame. */
  await page.cdp.send('Page.navigate', { url: `${page.origin}/src/share/orbit.html?map=itaipu` }, page.sessionId);
  await page.until('window.__orbitReady === true || Boolean(window.__orbitError)', 30000);
  t.note('opened on its own', await page.evaluate(`({
    cached: window.__orbitCached, map: window.__orbitMap, clip: Boolean(document.querySelector('.orbit-clip')), canvas: Boolean(document.getElementById('view')),
  })`));
} finally {
  await page.close();
  boardServer.close();
}
t.finish('orbit page', PINNED);
