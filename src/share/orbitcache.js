/*
 * orbitcache.js: each world's card thumbnail, a short looping video
 * recorded once per browser and kept in IndexedDB.
 *
 * A live WebGL scene per map card would be a second (or third) renderer
 * and post chain, and for the town a second copy of its nineteen thousand
 * meshes, beside the world already drawing behind the menu: more than a
 * Steam Deck with other tabs open can carry. A video is a hardware decoder
 * instead. The first visit that needs a world's clip records one camera
 * cycle at CLIP_W x CLIP_H, CLIP_FPS; every later visit plays it back.
 * The board's featured card is about 670 by 340 CSS pixels, which is why
 * the clip is 480 lines and not 240.
 *
 * A clip's key names the version and capture size, so raising
 * CLIP_VERSION is how a change to the shot reaches clips already stored.
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

/*
 * Why each version was raised (a version is the only thing that retires
 * stored clips, since the camera path is not in the key):
 *   5  the freestyle worlds' title cameras were re-cut; they had flown
 *      corridors, a chimney and the insides of walls.
 *   4  the racing line stopped being painted twice, so older clips show
 *      doubled ground paint.
 */
export const CLIP_VERSION = 5;
export const CLIP_W = 854;
export const CLIP_H = 480;
export const CLIP_FPS = 10;
export const CLIP_BITRATE = 800000;
export const CLIP_MS_MAX = 12000;
export const CLIP_MS_MIN = 8000;

const DB_NAME = 'webfpv.orbitclips.v1';
const STORE = 'clips';
/* Worlds kept; the least recently recorded go first. */
const KEEP = 12;
const CAPTURE_LOCK = 'fdfpv-orbit-capture';

/* Clips already read or written this page, so a card shown twice does not
 * go back to IndexedDB. */
const held = new Map();

export function clipKeyForMap(mapId) {
  return `v${CLIP_VERSION}:${CLIP_W}x${CLIP_H}@${CLIP_FPS}:${mapId}`;
}

/* The database, or null where there is none (no IndexedDB, a private
 * window that refuses it): then clips live only in `held`. Opened once. */
let opening = null;
function database() {
  if (!opening) {
    opening = new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (e) {
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  return opening;
}

/* One request in a fresh transaction, as a promise of its result, or of
 * `fallback` on any failure: a cache that fails is only a cache miss. */
function ask(db, mode, makeRequest, fallback) {
  return new Promise((resolve) => {
    try {
      const req = makeRequest(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(fallback);
    } catch (e) {
      resolve(fallback);
    }
  });
}

/* Writes in one transaction, settled when it commits or fails. */
function write(db, apply) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      apply(tx.objectStore(STORE));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

export async function getClip(key) {
  if (held.has(key)) {
    return held.get(key);
  }
  const db = await database();
  if (!db) {
    return null;
  }
  const row = await ask(db, 'readonly', (store) => store.get(key), null);
  const blob = row && row.blob instanceof Blob ? row.blob : null;
  if (blob) {
    held.set(key, blob);
  }
  return blob;
}

async function keepNewest(db) {
  const rows = (await ask(db, 'readonly', (store) => store.getAll(), [])) || [];
  const excess = rows.length - KEEP;
  if (excess <= 0) {
    return;
  }
  const oldestFirst = [...rows].sort((a, b) => (a.t || 0) - (b.t || 0));
  const dropped = oldestFirst.slice(0, excess).map((row) => row.key);
  await write(db, (store) => {
    for (const key of dropped) {
      store.delete(key);
      held.delete(key);
    }
  });
}

/* Keep a clip. False only for a clip not worth keeping (no key, not a
 * Blob, empty); a database that is missing or fails still keeps it for
 * this page. */
export async function putClip(key, blob) {
  if (!key || !(blob instanceof Blob) || blob.size === 0) {
    return false;
  }
  held.set(key, blob);
  const db = await database();
  if (db) {
    await write(db, (store) => store.put({ key, blob, t: Date.now() }));
    await keepNewest(db);
  }
  return true;
}

/*
 * Run `fn` when no other thumbnail capture is running, in this page or any
 * other page or frame of this origin (Web Locks); in arrival order within
 * this page where Web Locks are missing. Building two worlds at once for
 * thumbnails is how a Steam Deck lost the tab. Resolves or rejects as `fn`
 * does; a failed capture does not block the next.
 */
let queueTail = Promise.resolve();
export async function withCaptureLock(fn) {
  const locks = typeof navigator === 'undefined' ? null : navigator.locks;
  if (locks && typeof locks.request === 'function') {
    return locks.request(CAPTURE_LOCK, fn);
  }
  const turn = queueTail.then(fn, fn);
  queueTail = turn.then(() => {}, () => {});
  return turn;
}

const RECORDER_TYPES = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

/* The first video type this browser can record, or '' for none. */
export function pickRecorderMime() {
  const Recorder = typeof MediaRecorder === 'undefined' ? null : MediaRecorder;
  if (!Recorder || !Recorder.isTypeSupported) {
    return '';
  }
  return RECORDER_TYPES.find((type) => Recorder.isTypeSupported(type)) || '';
}

const aborted = () => new DOMException('aborted', 'AbortError');

/* Resolve after `ms`, or reject with an AbortError when `signal` aborts
 * first (or already has). */
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(aborted());
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(aborted());
      }, { once: true });
    }
  });
}

/* Resolves at once on a visible page; on a hidden one, when it is shown
 * again (or rejects with an AbortError when `signal` aborts), so a capture
 * never runs in a background tab that cannot draw. */
export function whenVisible(signal) {
  if (typeof document === 'undefined' || !document.hidden) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const stopListening = () => {
      document.removeEventListener('visibilitychange', onChange);
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };
    function onChange() {
      if (!document.hidden) {
        stopListening();
        resolve();
      }
    }
    function onAbort() {
      stopListening();
      reject(aborted());
    }
    if (signal && signal.aborted) {
      onAbort();
      return;
    }
    document.addEventListener('visibilitychange', onChange);
    if (signal) {
      signal.addEventListener('abort', onAbort);
    }
  });
}

/*
 * Chrome's MediaRecorder leaves a WebM's Duration at zero or out, and a
 * looping <video> of such a file restarts a few frames in. stampDuration
 * writes the real length into the Segment Info, in place: the Duration
 * element (EBML id 0x4489, a 4 or 8 byte big-endian float) in units of
 * the TimecodeScale (id 0x2AD7B1, nanoseconds per unit, 1 ms by default).
 * Both live in the header, so only the bytes before the first Cluster (id
 * 0x1F43B675), and at most the first 16 KB, are searched. True when the
 * Duration was found and written.
 */
const HEADER_SCAN = 16384;
const ID_CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
const ID_TIMECODE_SCALE = [0x2a, 0xd7, 0xb1];
const ID_DURATION = [0x44, 0x89];
const DEFAULT_TIMECODE_SCALE = 1e6;

function indexOfBytes(bytes, pattern, limit) {
  for (let at = 0; at + pattern.length <= limit; at += 1) {
    if (pattern.every((b, k) => bytes[at + k] === b)) {
      return at;
    }
  }
  return -1;
}

/* An EBML variable-length size at `at`: { width, value } or null. The
 * count of leading zero bits in the first byte gives the width; that
 * marker bit is not part of the value. */
function ebmlSize(bytes, at) {
  const first = bytes[at];
  if (!first) {
    return null;
  }
  const width = Math.clz32(first) - 23;
  if (width > 8 || at + width > bytes.length) {
    return null;
  }
  let value = first & (0xff >> width);
  for (let k = 1; k < width; k += 1) {
    value = value * 256 + bytes[at + k];
  }
  return { width, value };
}

function stampDuration(bytes, durationMs) {
  const cluster = indexOfBytes(bytes, ID_CLUSTER, Math.min(bytes.length, HEADER_SCAN));
  const limit = cluster >= 0 ? cluster : Math.min(bytes.length, HEADER_SCAN);

  let unitNs = DEFAULT_TIMECODE_SCALE;
  const scaleId = indexOfBytes(bytes, ID_TIMECODE_SCALE, limit);
  const scaleSize = scaleId >= 0 ? ebmlSize(bytes, scaleId + ID_TIMECODE_SCALE.length) : null;
  if (scaleSize && scaleSize.value > 0) {
    const from = scaleId + ID_TIMECODE_SCALE.length + scaleSize.width;
    if (from + scaleSize.value <= limit) {
      let n = 0;
      for (let k = 0; k < scaleSize.value; k += 1) {
        n = n * 256 + bytes[from + k];
      }
      if (n > 0) {
        unitNs = n;
      }
    }
  }

  const durationId = indexOfBytes(bytes, ID_DURATION, limit);
  if (durationId < 0) {
    return false;
  }
  const size = ebmlSize(bytes, durationId + ID_DURATION.length);
  if (!size || (size.value !== 4 && size.value !== 8)) {
    return false;
  }
  const from = durationId + ID_DURATION.length + size.width;
  if (from + size.value > limit) {
    return false;
  }
  const units = (durationMs * 1e6) / unitNs;
  const view = new DataView(bytes.buffer, bytes.byteOffset + from, size.value);
  if (size.value === 4) {
    view.setFloat32(0, units);
  } else {
    view.setFloat64(0, units);
  }
  return true;
}

/* The recording with its Duration stamped, or the recording as it came
 * when it is not WebM or has no Duration to stamp. */
async function withDuration(blob, durationMs) {
  const type = blob.type || '';
  if (!type.includes('webm') || !(durationMs > 0)) {
    return blob;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return stampDuration(bytes, durationMs) ? new Blob([bytes], { type }) : blob;
}

/* A JPEG of the canvas, for a browser that cannot record video. */
async function stillOf(canvas, durationMs, signal) {
  await pause(Math.min(400, durationMs), signal);
  const still = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  if (!still) {
    throw new Error('Could not capture a still.');
  }
  return still;
}

/*
 * Record `durationMs` of `canvas` as a clip Blob: video where the browser
 * can record, a still JPEG where it cannot. Rejects with an AbortError
 * when `signal` aborts.
 */
export async function recordCanvasStream(canvas, durationMs, signal) {
  const type = pickRecorderMime();
  if (!type) {
    return stillOf(canvas, durationMs, signal);
  }
  const stream = canvas.captureStream(CLIP_FPS);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: CLIP_BITRATE });
  const pieces = [];
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data && e.data.size) {
      pieces.push(e.data);
    }
  });
  const finished = new Promise((resolve, reject) => {
    recorder.addEventListener('stop', resolve);
    recorder.addEventListener('error', () => reject(new Error('Recording failed.')));
  });
  recorder.start();
  try {
    /* Two frames past the end, so the encoder holds the pose at the loop
     * point; the stamped Duration cuts playback before them. */
    await pause(durationMs + 2 * (1000 / CLIP_FPS), signal);
    if (recorder.state === 'recording' && typeof recorder.requestData === 'function') {
      recorder.requestData();
    }
  } finally {
    if (recorder.state === 'recording') {
      recorder.stop();
    }
    await finished.catch(() => {});
    stream.getTracks().forEach((track) => track.stop());
  }
  if (signal && signal.aborted) {
    throw aborted();
  }
  if (pieces.length === 0) {
    throw new Error('Recording produced no data.');
  }
  return withDuration(new Blob(pieces, { type }), durationMs);
}

/* A clip covers one camera loop, kept between CLIP_MS_MIN and CLIP_MS_MAX;
 * an unknown loop gets the longest clip. */
export function clipDurationMs(loopMs) {
  const loop = Number(loopMs);
  if (!(Number.isFinite(loop) && loop > 0)) {
    return CLIP_MS_MAX;
  }
  return Math.max(CLIP_MS_MIN, Math.min(CLIP_MS_MAX, loop));
}

/*
 * Keep a clip video playing round. Its loop attribute alone is not enough:
 * a clip whose length the browser does not know (an unstamped WebM reads
 * as Infinity or 0) never reaches an end to loop from. Seeking far past the
 * end makes the browser work the length out; once it is known, play from
 * the top. 'ended' restarts it too, for a codec that ignores loop.
 */
function keepLooping(video) {
  const play = () => {
    video.play().catch(() => {});
  };
  const fromTop = () => {
    try {
      video.currentTime = 0;
    } catch (e) {
      /* Cannot seek: playing still restarts it. */
    }
    play();
  };
  const lengthKnown = () => Number.isFinite(video.duration) && video.duration > 0.2 && video.duration < 1e6;
  const learnLength = () => {
    if (lengthKnown()) {
      play();
      return;
    }
    const onTime = () => {
      if (lengthKnown()) {
        video.removeEventListener('timeupdate', onTime);
        fromTop();
      }
    };
    video.addEventListener('timeupdate', onTime);
    try {
      video.currentTime = 1e101;
    } catch (e) {
      play();
    }
  };
  video.addEventListener('ended', fromTop);
  video.addEventListener('loadedmetadata', learnLength);
  video.addEventListener('canplay', play, { once: true });
  if (video.readyState >= 1) {
    learnLength();
  }
  if (video.readyState >= 2) {
    play();
  }
}

/* Every switch that keeps a muted inline clip from offering sound,
 * fullscreen, picture in picture, casting or download. */
function quietInline(video) {
  Object.assign(video, {
    muted: true,
    defaultMuted: true,
    loop: true,
    playsInline: true,
    autoplay: true,
    preload: 'auto',
    disablePictureInPicture: true,
    disableRemotePlayback: true,
    volume: 0,
  });
  for (const name of ['playsinline', 'webkit-playsinline', 'muted']) {
    video.setAttribute(name, '');
  }
  video.controlsList = 'nodownload nofullscreen noremoteplayback';
}

/* The element that shows a clip: a looping muted <video> for a video, an
 * <img> for a still. `url` is its object URL, for the caller to revoke. */
export function makeClipElement(blob, className) {
  const url = URL.createObjectURL(blob);
  const isVideo = (blob.type || '').startsWith('video/');
  const node = document.createElement(isVideo ? 'video' : 'img');
  if (className) {
    node.className = className;
  }
  node.setAttribute('aria-hidden', 'true');
  if (isVideo) {
    quietInline(node);
    node.src = url;
    keepLooping(node);
  } else {
    node.src = url;
    node.alt = '';
  }
  return { node, url };
}
