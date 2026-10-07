/*
 * orbitcache-check.js: the world thumbnail clip cache and recorder
 * (src/share/orbitcache.js), pinned as a transcript in Chromium.
 *
 *     node scripts/orbitcache-check.js [--dump=<file>]   (npm run orbitcache:check)
 *
 * Headless Chromium opens a plain page of this checkout and imports the
 * module there, because what it does needs a browser: IndexedDB,
 * MediaRecorder, canvas capture, Web Locks, video elements. Recorded:
 *
 *   - the clip keys and durations, and the recorder type Chromium picks;
 *   - what putClip refuses, what getClip answers from memory and from
 *     IndexedDB (a second copy of the module, with nothing in memory),
 *     the database's name, store and rows, and the trim to the newest
 *     twelve;
 *   - that withCaptureLock runs one capture at a time, in order, with or
 *     without Web Locks, and passes results and errors through;
 *   - whenVisible on a visible page, a hidden one that comes back, and an
 *     abort;
 *   - a real one second recording: its type, that it has data, and the
 *     Duration stamped into its WebM header; an abort mid recording; the
 *     still fallback when the browser has no MediaRecorder;
 *   - the elements makeClipElement builds for a video and for a still.
 *
 * Pinned by digest (scripts/lib/transcript.js), taken on the module before
 * its rewrite. Local, not in CI: it drives Chromium.
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { transcript } from './lib/transcript.js';

const PINNED = '2e69bcccbe3eeaa9dfbf3f3c8eaa5b5cbb6135a56a30b1bcd0d383e9b386b1c2';
const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* Runs in the page. Every record is [label, value]; values are plain data. */
const IN_PAGE = async () => {
  const out = [];
  const note = (label, value) => out.push([label, value]);
  const attempt = async (label, fn) => {
    try {
      note(label, { ok: await fn() });
    } catch (e) {
      note(label, { threw: e && e.name, message: e && e.message });
    }
  };
  const load = (n) => import(`/src/share/orbitcache.js?copy=${n}`);
  const oc = await load(1);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const blobOf = (text, type) => new Blob([text], { type });
  const textOf = async (b) => (b ? `${b.type}|${b.size}|${await b.text()}` : b);

  note('exports', Object.keys(oc).sort());
  note('constants', [oc.CLIP_VERSION, oc.CLIP_W, oc.CLIP_H, oc.CLIP_FPS, oc.CLIP_BITRATE, oc.CLIP_MS_MAX, oc.CLIP_MS_MIN]);
  note('keys', ['alps', 'swiss2', '', 'a b', undefined, null, 7].map((m) => oc.clipKeyForMap(m)));
  note('durations', [undefined, null, '', 'x', 0, -5, 1, 7999, 8000, 9500.5, '10000', 12000, 12001, 1e9, Infinity, NaN].map((v) => oc.clipDurationMs(v)));
  note('recorder type', oc.pickRecorderMime());

  /* The cache. */
  const K = (m) => oc.clipKeyForMap(m);
  for (const [label, key, blob] of [
    ['no key', '', blobOf('x', 'video/webm')],
    ['null key', null, blobOf('x', 'video/webm')],
    ['not a blob', K('a'), 'x'],
    ['an empty blob', K('a'), new Blob([], { type: 'video/webm' })],
    ['an array buffer', K('a'), new ArrayBuffer(4)],
  ]) {
    await attempt(`putClip refuses ${label}`, () => oc.putClip(key, blob));
  }
  await attempt('getClip of nothing', async () => textOf(await oc.getClip(K('none'))));
  const first = blobOf('clip-alps', 'video/webm');
  await attempt('putClip', () => oc.putClip(K('alps'), first));
  await attempt('getClip from memory is the same blob', async () => (await oc.getClip(K('alps'))) === first);
  const fresh = await load(2);
  await attempt('getClip from IndexedDB in a fresh copy', async () => textOf(await fresh.getClip(K('alps'))));
  await attempt('putClip a still', () => oc.putClip(K('still'), blobOf('jpeg-bytes', 'image/jpeg')));
  await attempt('putClip replaces', () => oc.putClip(K('alps'), blobOf('clip-alps-2', 'video/webm')));
  await attempt('the replacement reads back fresh', async () => textOf(await (await load(3)).getClip(K('alps'))));
  await attempt('a key from another version is not found', async () => textOf(await (await load(4)).getClip('v4:854x480@10:alps')));

  const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => [d.name, d.version]).sort() : 'no list';
  note('databases', dbs);
  const rawRows = () => new Promise((resolve) => {
    const req = indexedDB.open(dbs[0][0]);
    req.onsuccess = () => {
      const db = req.result;
      const stores = [...db.objectStoreNames];
      const tx = db.transaction(stores[0], 'readonly');
      const store = tx.objectStore(stores[0]);
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = all.result.map((r) => ({
          keys: Object.keys(r).sort(), key: r.key, blob: r.blob && r.blob.type, tIsNumber: typeof r.t === 'number',
        }));
        db.close();
        resolve({ stores, keyPath: store.keyPath, autoIncrement: store.autoIncrement, version: db.version, rows });
      };
    };
  });
  note('rows', await rawRows());

  for (let i = 0; i < 14; i += 1) {
    await sleep(3);
    await oc.putClip(K(`world${String(i).padStart(2, '0')}`), blobOf(`w${i}`, 'video/webm'));
  }
  note('after fourteen more, the newest twelve', (await rawRows()).rows.map((r) => r.key).sort());
  await attempt('a trimmed clip is gone from memory too', async () => textOf(await oc.getClip(K('world00'))));
  await attempt('a kept one is there', async () => textOf(await oc.getClip(K('world13'))));

  /* One capture at a time. */
  const order = [];
  const job = (name, ms, fail) => async () => {
    order.push(`start ${name}`);
    await sleep(ms);
    order.push(`end ${name}`);
    if (fail) {
      throw new Error(`job ${name} failed`);
    }
    return name;
  };
  const results = await Promise.allSettled([oc.withCaptureLock(job('a', 30)), oc.withCaptureLock(job('b', 5, true)), oc.withCaptureLock(job('c', 1))]);
  note('locked jobs', { order: order.slice(), results: results.map((r) => (r.status === 'fulfilled' ? r.value : r.reason.message)) });
  const keepLocks = Object.getOwnPropertyDescriptor(Navigator.prototype, 'locks');
  Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
  const noLocks = await load(5);
  order.length = 0;
  const results2 = await Promise.allSettled([noLocks.withCaptureLock(job('d', 20, true)), noLocks.withCaptureLock(job('e', 1)), noLocks.withCaptureLock(job('f', 1))]);
  note('locked jobs without Web Locks', { order: order.slice(), results: results2.map((r) => (r.status === 'fulfilled' ? r.value : r.reason.message)) });
  delete navigator.locks;
  if (keepLocks) {
    note('Web Locks restored', typeof navigator.locks.request);
  }

  /* Visibility. */
  await attempt('whenVisible on a visible page', () => oc.whenVisible().then(() => 'resolved'));
  let hidden = true;
  Object.defineProperty(document, 'hidden', { get: () => hidden, configurable: true });
  const ac0 = new AbortController();
  ac0.abort();
  await attempt('whenVisible hidden, already aborted', () => oc.whenVisible(ac0.signal));
  const ac1 = new AbortController();
  const waitAbort = oc.whenVisible(ac1.signal).then(() => 'resolved', (e) => `${e.name}:${e.message}`);
  setTimeout(() => ac1.abort(), 10);
  note('whenVisible hidden, then aborted', await waitAbort);
  const waitShow = oc.whenVisible().then(() => 'resolved');
  document.dispatchEvent(new Event('visibilitychange'));
  await sleep(5);
  let settled = false;
  waitShow.then(() => {
    settled = true;
  });
  await sleep(5);
  note('a visibilitychange while still hidden does not resolve', settled);
  hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  note('whenVisible hidden, then shown', await waitShow);
  delete document.hidden;

  /* Recording. */
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');
  let frame = 0;
  const paint = setInterval(() => {
    frame += 1;
    ctx.fillStyle = `hsl(${(frame * 37) % 360} 80% 50%)`;
    ctx.fillRect(0, 0, 160, 90);
  }, 30);
  const durationOf = async (blob) => {
    const b = new Uint8Array(await blob.arrayBuffer());
    const find = (needle, from = 0, to = Math.min(b.length, 16384)) => {
      for (let i = from; i <= to - needle.length; i += 1) {
        if (needle.every((x, j) => b[i + j] === x)) {
          return i;
        }
      }
      return -1;
    };
    const at = find([0x44, 0x89]);
    if (at < 0) {
      return 'no Duration';
    }
    const size = b[at + 2] & 0x7f;
    const view = new DataView(b.buffer, at + 3, size);
    const value = size === 4 ? view.getFloat32(0) : view.getFloat64(0);
    let scale = 1000000;
    const s = find([0x2a, 0xd7, 0xb1]);
    if (s >= 0) {
      const n = b[s + 3] & 0x7f;
      scale = 0;
      for (let i = 0; i < n; i += 1) {
        scale = scale * 256 + b[s + 4 + i];
      }
    }
    return { sizeBytes: size, scale, ms: Math.round((value * scale) / 1e6) };
  };
  await attempt('a one second recording', async () => {
    const blob = await oc.recordCanvasStream(canvas, 1000);
    return { type: blob.type, hasData: blob.size > 0, duration: await durationOf(blob) };
  });
  await attempt('a 1500 ms recording', async () => {
    const blob = await oc.recordCanvasStream(canvas, 1500);
    return { type: blob.type, duration: await durationOf(blob) };
  });
  const ac2 = new AbortController();
  setTimeout(() => ac2.abort(), 200);
  await attempt('a recording aborted half way', () => oc.recordCanvasStream(canvas, 1000, ac2.signal));
  const ac3 = new AbortController();
  ac3.abort();
  await attempt('a recording aborted before it starts', () => oc.recordCanvasStream(canvas, 1000, ac3.signal));
  const keepRecorder = window.MediaRecorder;
  delete window.MediaRecorder;
  await attempt('no MediaRecorder: no type', () => oc.pickRecorderMime());
  await attempt('no MediaRecorder: a still', async () => {
    const blob = await oc.recordCanvasStream(canvas, 1000);
    return { type: blob.type, hasData: blob.size > 0 };
  });
  const ac4 = new AbortController();
  ac4.abort();
  await attempt('no MediaRecorder, aborted', () => oc.recordCanvasStream(canvas, 1000, ac4.signal));
  window.MediaRecorder = { isTypeSupported: (t) => t === 'video/mp4' };
  await attempt('a recorder that only takes mp4', () => oc.pickRecorderMime());
  window.MediaRecorder = { isTypeSupported: () => false };
  await attempt('a recorder that takes nothing', () => oc.pickRecorderMime());
  window.MediaRecorder = {};
  await attempt('a recorder with no isTypeSupported', () => oc.pickRecorderMime());
  window.MediaRecorder = keepRecorder;

  /* A clip element plays and loops: one stamped by the module, and one
   * straight off MediaRecorder with no Duration, which the element has to
   * find by seeking to the end before it can loop. */
  const rawRecording = () => new Promise((resolve) => {
    const rec = new MediaRecorder(canvas.captureStream(10), { mimeType: 'video/webm;codecs=vp8' });
    const parts = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.onstop = () => resolve(new Blob(parts, { type: 'video/webm;codecs=vp8' }));
    rec.start();
    setTimeout(() => rec.stop(), 1000);
  });
  const watchLoop = async (blob) => {
    const { node } = oc.makeClipElement(blob, 'watch');
    document.body.append(node);
    let played = false;
    let looped = false;
    let last = 0;
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline && !(played && looped)) {
      await sleep(50);
      const now = node.currentTime;
      if (now > 0.05 && Number.isFinite(node.duration)) {
        played = true;
      }
      if (played && now + 0.2 < last) {
        looped = true;
      }
      last = now;
    }
    const verdict = {
      durationKnown: Number.isFinite(node.duration) && node.duration > 0.2 && node.duration < 1e6, played, looped,
    };
    node.remove();
    return verdict;
  };
  await attempt('a stamped clip plays and loops', async () => watchLoop(await oc.recordCanvasStream(canvas, 1000)));
  await attempt('an unstamped clip finds its length, plays and loops', async () => watchLoop(await rawRecording()));
  clearInterval(paint);

  /* Elements. */
  const describeNode = (node) => ({
    tag: node.tagName,
    className: node.className,
    attrs: [...node.attributes].map((a) => [a.name, a.name === 'src' ? a.value.slice(0, 5) : a.value]).sort(),
    props: node.tagName === 'VIDEO'
      ? [node.muted, node.defaultMuted, node.loop, node.playsInline, node.autoplay, node.preload, node.disablePictureInPicture,
        node.disableRemotePlayback, String(node.controlsList), node.volume]
      : [node.alt],
  });
  for (const [label, blob, cls] of [
    ['a webm', blobOf('x', 'video/webm'), 'map-reel-view'],
    ['an mp4, no class', blobOf('x', 'video/mp4'), undefined],
    ['a jpeg', blobOf('x', 'image/jpeg'), 'still'],
    ['an untyped blob', blobOf('x', ''), ''],
  ]) {
    await attempt(`makeClipElement ${label}`, () => {
      const { node, url } = oc.makeClipElement(blob, cls);
      return { node: describeNode(node), url: url.startsWith('blob:'), srcIsUrl: node.src === url };
    });
  }
  return out;
};

const page = await openPage({ root, url: '/privacy.html', width: 640, height: 360 });
let records;
try {
  await page.until('document.readyState === "complete"', 30000);
  records = await page.evaluate(`(${IN_PAGE.toString()})()`);
} finally {
  await page.close();
}
const t = transcript();
for (const [label, value] of records) {
  t.note(label, value);
}
t.finish('orbitcache.js', PINNED);
