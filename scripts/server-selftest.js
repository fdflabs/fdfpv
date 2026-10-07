/*
 * server-selftest.js: the harness file server (tests/lib/server.js) pinned
 * as a transcript.
 *
 *     node scripts/server-selftest.js [--dump=<file>]   (npm run server:selftest)
 *
 * A root of its own under the temp folder, one file per served type and
 * one of an unknown type, a music track, a folder, and an itaipu-data
 * folder elsewhere named by FDFPV_ITAIPU_DATA. Every answer is recorded:
 * status, the headers the server sets, and the body, for GET and HEAD,
 * for every range form (whole, open, suffix, past the end, malformed, two
 * ranges), for a folder, a missing file, a query string, an encoded path,
 * and every way out of the root. Pinned by digest
 * (scripts/lib/transcript.js) on the server before its rewrite.
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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { transcript } from './lib/transcript.js';

const PINNED = '30d31be0db5f5f3c15fa9581606dbd72f7e85f5fe364f19a3bfaea7d131b16a4';
const t = transcript();

const root = mkdtempSync(join(tmpdir(), 'server-selftest-'));
const data = mkdtempSync(join(tmpdir(), 'server-selftest-data-'));
/* The data folder is read when the module loads, so it is named first. */
process.env.FDFPV_ITAIPU_DATA = data;
const { startServer } = await import('../tests/lib/server.js');

const FILES = {
  'index.html': '<!doctype html><p>home</p>',
  'a.js': 'export const a = 1;\n',
  'b.json': '{"b":2}',
  'c.wasm': '\0asm\x01\0\0\0',
  'd.rec': 'FPVREC01' + 'x'.repeat(40),
  'e.diff': 'set roll_srate = 70\n',
  'f.md': '# notes\n',
  'g.mp3': 'ID3' + 'g'.repeat(29),
  'h.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'i.woff2': 'wOF2' + 'i'.repeat(12),
  'j.webm': '\x1aE\xdf\xa3' + 'j'.repeat(60),
  'k.unknown': 'kkk',
  'with space.txt': 'spaced',
  'assets/music/track.mp3': 'ID3' + 'm'.repeat(100),
  'sub/deep.js': 'export default 0;\n',
};
for (const [rel, body] of Object.entries(FILES)) {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), body, 'latin1');
}
mkdirSync(join(data, 'chunks'));
writeFileSync(join(data, 'chunks', 'tile.bin'), 'tile bytes here');
writeFileSync(join(root, 'itaipu-data-local.txt'), 'not the data folder');

const server = await startServer(root);
t.note('what startServer returns', { keys: Object.keys(server).sort(), portIsNumber: Number.isInteger(server.port), origin: server.origin === `http://127.0.0.1:${server.port}`, closeIsFunction: typeof server.close === 'function' });

const KEPT = ['content-type', 'cache-control', 'accept-ranges', 'content-range', 'content-length'];
async function ask(label, path, { method = 'GET', range } = {}) {
  const res = await fetch(server.origin + path, { method, headers: range ? { range } : {} });
  const body = Buffer.from(await res.arrayBuffer()).toString('latin1');
  const headers = Object.fromEntries(KEPT.filter((h) => res.headers.has(h)).map((h) => [h, res.headers.get(h)]));
  t.note(label, { status: res.status, headers, body });
}

for (const rel of Object.keys(FILES)) {
  await ask(`GET /${rel}`, `/${encodeURI(rel)}`);
}
await ask('HEAD a file', '/a.js', { method: 'HEAD' });
await ask('HEAD a missing file', '/none.js', { method: 'HEAD' });
await ask('a folder', '/sub');
await ask('a folder with a slash', '/sub/');
await ask('the root', '/');
await ask('a missing file', '/none.js');
await ask('a query string is ignored', '/a.js?v=3&x');
await ask('a fragment never reaches the server', '/a.js#top');
await ask('an encoded path', '/with%20space.txt');
await ask('an encoded dot dot', '/%2e%2e/etc/passwd');
await ask('dot dot out of the root', '/../../etc/passwd');
await ask('dot dot inside the root', '/sub/../a.js');
await ask('two leading slashes', '//a.js');
await ask('a backslash path', '/sub\\deep.js');
await ask('bad percent encoding', '/%zz');
await ask('itaipu-data is served from the data folder', '/itaipu-data/chunks/tile.bin');
await ask('itaipu-data missing', '/itaipu-data/chunks/none.bin');
await ask('itaipu-data dot dot out', '/itaipu-data/../a.js');
await ask('a sibling named like the data prefix', '/itaipu-data-local.txt');
await ask('POST is answered like GET', '/a.js', { method: 'POST' });

const R = (range) => ({ range });
await ask('range: the first bytes', '/j.webm', R('bytes=0-9'));
await ask('range: open ended', '/j.webm', R('bytes=60-'));
await ask('range: the last bytes', '/j.webm', R('bytes=-5'));
await ask('range: past the end', '/j.webm', R('bytes=0-9999'));
await ask('range: start past the end', '/j.webm', R('bytes=9999-'));
await ask('range: start after end', '/j.webm', R('bytes=20-10'));
await ask('range: suffix larger than the file', '/j.webm', R('bytes=-9999'));
await ask('range: empty', '/j.webm', R('bytes=-'));
await ask('range: malformed', '/j.webm', R('bytes=a-b'));
await ask('range: two ranges', '/j.webm', R('bytes=0-1,3-4'));
await ask('range: not bytes', '/j.webm', R('items=0-1'));
await ask('range: with spaces', '/j.webm', R('  bytes=1-2  '));
await ask('range: HEAD', '/j.webm', { method: 'HEAD', range: 'bytes=1-2' });
await ask('range: HEAD unsatisfiable', '/j.webm', { method: 'HEAD', range: 'bytes=99-' });
await ask('range: on a missing file', '/none.webm', R('bytes=0-1'));
await ask('range: on music keeps its cache header', '/assets/music/track.mp3', R('bytes=0-2'));

await server.close();
t.note('close again settles', await server.close().then(() => 'closed'));
let after;
try {
  await fetch(server.origin + '/a.js');
  after = 'still answering';
} catch (e) {
  after = 'refused';
}
t.note('after close', after);

rmSync(root, { recursive: true, force: true });
rmSync(data, { recursive: true, force: true });
t.finish('server.js', PINNED);
