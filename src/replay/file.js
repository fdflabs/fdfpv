/*
 * file.js: a replay as bytes, and back, checked on the way in.
 *
 * A saved replay is a clip (src/replay/recorder.js) with what it needs to
 * look right on another day: the airframe and its livery, the map, the
 * part table the wreck is cut by, the camera keys. It goes into IndexedDB
 * (src/replay/store.js) and out to a file a pilot can send to a friend, so
 * the reader trusts nothing: a size cap, a magic number, a version, a JSON
 * header of known fields only, and payloads whose lengths are what the
 * header says. Anything else is refused with a reason, never half loaded.
 *
 * Layout: "FDFR", u32 version, u32 header length, the header (UTF-8
 * JSON), padding to 8, then the columns: time f64[n], head f64[n x HEAD_N],
 * pose f32[n x POSE_N] padded to 8, plant f64[n x PLANT_N], and the parts,
 * only as many rows per frame as that frame has (its head's parts count),
 * f32.
 *
 * Version 2 added the pose column's padding. POSE_N is 17, so an odd frame
 * count left the pose column 4 bytes short of a multiple of 8 and the
 * writer's Float64Array over the plant column threw a RangeError: saving
 * failed about half the time. A version 1 file could therefore only ever
 * be written with an even count, where the padding is zero and the two
 * layouts are the same bytes, so version 1 is still read; one claiming an
 * odd count is refused.
 * Little endian, as typed arrays are on every machine this runs on; the
 * reader checks with a known value in the header.
 *
 * The journal marks in the head are zeroed: take over belongs to the
 * flight that recorded them, not to a file.
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

import {
  CAPACITY, HEAD, HEAD_N, PART_N, PARTS_MAX, PLANT_N, POSE_N,
} from './recorder.js';
import { RIGS } from './cameras.js';
import { FINISHES, MAX_DECALS, checkDecal } from '../../configs/paint.js';

export const FILE_VERSION = 2;
/* Every version this build reads, the current one last. */
const READS = [1, 2];

/* The pose column's bytes with its padding to 8. */
function poseBytes(n) {
  const b = n * POSE_N * 4;
  return b + ((8 - (b % 8)) % 8);
}
export const FILE_MAX_BYTES = 24 * 1024 * 1024;
export const FILE_EXT = '.fdfreplay';
const MAGIC = [0x46, 0x44, 0x46, 0x52];
const ENDIAN_PROBE = 1.5;
export const NAME_MAX = 60;

const HEADER_KEYS = ['v', 'n', 'layout', 'probe', 'meta', 'events', 'spawns', 'keys'];
const META_KEYS = ['name', 'created', 'airframe', 'livery', 'paint', 'map', 'scale', 'size', 'parts', 'fpv', 'duration'];
const PAINT_KEYS = ['finishes', 'decals'];
const PART_KEYS = ['kind', 'kindName', 'parent', 'material', 'cg', 'boxMin', 'boxMax'];
const EVENT_KEYS = ['t', 'type', 'part', 'label', 'kind', 'point', 'normal', 'speed', 'surface', 'shed', 'floorY', 'level'];
const EVENT_TYPES = ['off', 'impact', 'debris', 'cue'];
const KEY_KEYS = ['t', 'rig', 'target', 'p'];
const P_KEYS = ['dist', 'height', 'fov', 'az', 'el', 'pos', 'yaw', 'pitch'];
const FPV_KEYS = ['fwd', 'up', 'tilt', 'fov'];

/* ---- write ---- */

export function encodeReplay(clip) {
  const n = clip.n;
  const head = clip.head.slice(0, n * HEAD_N);
  let partRows = 0;
  for (let k = 0; k < n; k += 1) {
    head[k * HEAD_N + HEAD.markSeg] = 0;
    head[k * HEAD_N + HEAD.markPos] = 0;
    partRows += head[k * HEAD_N + HEAD.parts];
  }
  const header = {
    v: FILE_VERSION,
    n,
    layout: [HEAD_N, POSE_N, PLANT_N, PART_N, PARTS_MAX],
    probe: ENDIAN_PROBE,
    meta: clip.meta,
    events: clip.events,
    spawns: clip.spawns,
    keys: clip.keys || [],
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const pre = 12 + json.length;
  const pad = (8 - (pre % 8)) % 8;
  const bytes = pre + pad + n * 8 + n * HEAD_N * 8 + poseBytes(n) + n * PLANT_N * 8 + partRows * PART_N * 4;
  const buf = new ArrayBuffer(bytes);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  u8.set(MAGIC, 0);
  dv.setUint32(4, FILE_VERSION, true);
  dv.setUint32(8, json.length, true);
  u8.set(json, 12);
  let o = pre + pad;
  new Float64Array(buf, o, n).set(clip.time.subarray(0, n));
  o += n * 8;
  new Float64Array(buf, o, n * HEAD_N).set(head);
  o += n * HEAD_N * 8;
  new Float32Array(buf, o, n * POSE_N).set(clip.pose.subarray(0, n * POSE_N));
  o += poseBytes(n);
  new Float64Array(buf, o, n * PLANT_N).set(clip.plant.subarray(0, n * PLANT_N));
  o += n * PLANT_N * 8;
  const parts = new Float32Array(buf, o, partRows * PART_N);
  let w = 0;
  for (let k = 0; k < n; k += 1) {
    const np = head[k * HEAD_N + HEAD.parts];
    const from = k * PARTS_MAX * PART_N;
    parts.set(clip.parts.subarray(from, from + np * PART_N), w);
    w += np * PART_N;
  }
  return buf;
}

/* ---- read ---- */

/* What a refusal throws: its message is for the log, in English; the
 * screen says it in the pilot's language (src/replay/crashcam.js). */
class ReplayFileError extends Error {}

function onlyKeys(o, allowed, what) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    throw new ReplayFileError(`${what} is not an object`);
  }
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) {
      throw new ReplayFileError(`${what} has an unknown field ${JSON.stringify(k).slice(0, 40)}`);
    }
  }
}

function finite(x, what) {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new ReplayFileError(`${what} is not a finite number`);
  }
  return x;
}

function vec(a, len, what) {
  if (!Array.isArray(a) || a.length !== len) {
    throw new ReplayFileError(`${what} is not ${len} numbers`);
  }
  a.forEach((x, i) => finite(x, `${what}[${i}]`));
  return a;
}

function text(s, max, what) {
  if (typeof s !== 'string' || s.length > max) {
    throw new ReplayFileError(`${what} is not text of at most ${max} characters`);
  }
  return s;
}

function checkMeta(m) {
  onlyKeys(m, META_KEYS, 'meta');
  text(m.name, NAME_MAX, 'meta.name');
  finite(m.created, 'meta.created');
  text(m.airframe, 40, 'meta.airframe');
  text(m.map, 40, 'meta.map');
  finite(m.scale, 'meta.scale');
  finite(m.size, 'meta.size');
  finite(m.duration, 'meta.duration');
  if (m.livery !== null) {
    if (!m.livery || typeof m.livery !== 'object' || Array.isArray(m.livery) || Object.keys(m.livery).length > 16) {
      throw new ReplayFileError('meta.livery is not a livery');
    }
    for (const [k, v] of Object.entries(m.livery)) {
      if (!/^[a-z][a-zA-Z0-9]{0,23}$/.test(k) || !Number.isInteger(v) || v < 0 || v > 0xffffff) {
        throw new ReplayFileError(`meta.livery.${k} is not a colour`);
      }
    }
  }
  /* The paint shop's finishes and decals (configs/paint.js), optional so
   * a clip saved before them still loads; checked as strictly as a
   * livery code. */
  if (m.paint !== undefined && m.paint !== null) {
    onlyKeys(m.paint, PAINT_KEYS, 'meta.paint');
    const f = m.paint.finishes ?? {};
    onlyKeys(f, Object.keys(f).filter((k) => /^[a-z][a-z_]{0,23}$/.test(k) && FINISHES.includes(f[k])), 'meta.paint.finishes');
    const d = m.paint.decals ?? [];
    if (!Array.isArray(d) || d.length > MAX_DECALS || d.some((x) => checkDecal(x).error)) {
      throw new ReplayFileError('meta.paint.decals is not a list of decals');
    }
  }
  if (!Array.isArray(m.parts) || m.parts.length > PARTS_MAX) {
    throw new ReplayFileError('meta.parts is not a part table');
  }
  m.parts.forEach((p, i) => {
    onlyKeys(p, PART_KEYS, `meta.parts[${i}]`);
    finite(p.kind, `meta.parts[${i}].kind`);
    text(p.kindName, 24, `meta.parts[${i}].kindName`);
    finite(p.parent, `meta.parts[${i}].parent`);
    finite(p.material, `meta.parts[${i}].material`);
    vec(p.cg, 3, `meta.parts[${i}].cg`);
    vec(p.boxMin, 3, `meta.parts[${i}].boxMin`);
    vec(p.boxMax, 3, `meta.parts[${i}].boxMax`);
  });
  onlyKeys(m.fpv, FPV_KEYS, 'meta.fpv');
  FPV_KEYS.forEach((k) => finite(m.fpv[k], `meta.fpv.${k}`));
}

function checkEvent(e, i) {
  onlyKeys(e, EVENT_KEYS, `events[${i}]`);
  finite(e.t, `events[${i}].t`);
  if (!EVENT_TYPES.includes(e.type)) {
    throw new ReplayFileError(`events[${i}].type is unknown`);
  }
  for (const k of ['part', 'speed', 'surface', 'floorY', 'level']) {
    if (e[k] !== undefined && e[k] !== null) {
      finite(e[k], `events[${i}].${k}`);
    }
  }
  for (const k of ['label', 'kind', 'shed']) {
    if (e[k] !== undefined && e[k] !== null) {
      text(e[k], 40, `events[${i}].${k}`);
    }
  }
  for (const k of ['point', 'normal']) {
    if (e[k] !== undefined) {
      vec(e[k], 3, `events[${i}].${k}`);
    }
  }
}

function checkKey(k, i) {
  onlyKeys(k, KEY_KEYS, `keys[${i}]`);
  finite(k.t, `keys[${i}].t`);
  if (!RIGS.includes(k.rig)) {
    throw new ReplayFileError(`keys[${i}].rig is unknown`);
  }
  if (!Number.isInteger(k.target) || k.target < -1 || k.target >= PARTS_MAX) {
    throw new ReplayFileError(`keys[${i}].target is not a part`);
  }
  onlyKeys(k.p, P_KEYS, `keys[${i}].p`);
  for (const [name, v] of Object.entries(k.p)) {
    if (name === 'pos') {
      vec(v, 3, `keys[${i}].p.pos`);
    } else {
      finite(v, `keys[${i}].p.${name}`);
    }
  }
}

/*
 * A clip from bytes (an ArrayBuffer), or a thrown error whose message says
 * what was wrong. `known` optionally names what this build can draw:
 * { airframe(id) -> bool, map(id) -> bool }.
 */
export function decodeReplay(buf, known = null) {
  if (!(buf instanceof ArrayBuffer)) {
    throw new ReplayFileError('not a file');
  }
  if (buf.byteLength > FILE_MAX_BYTES) {
    throw new ReplayFileError(`larger than ${FILE_MAX_BYTES / 1048576} MB`);
  }
  if (buf.byteLength < 12) {
    throw new ReplayFileError('too short to be a replay');
  }
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (MAGIC.some((b, i) => u8[i] !== b)) {
    throw new ReplayFileError('not a replay file');
  }
  const version = dv.getUint32(4, true);
  if (!READS.includes(version)) {
    throw new ReplayFileError(`version ${version}, this build reads ${READS.join(' and ')}`);
  }
  const hl = dv.getUint32(8, true);
  if (12 + hl > buf.byteLength) {
    throw new ReplayFileError('header runs past the end');
  }
  let header;
  try {
    header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(u8.subarray(12, 12 + hl)));
  } catch (err) {
    throw new ReplayFileError('header is not JSON');
  }
  onlyKeys(header, HEADER_KEYS, 'header');
  if (header.v !== version) {
    throw new ReplayFileError('header version does not match');
  }
  if (header.probe !== ENDIAN_PROBE) {
    throw new ReplayFileError('byte order probe does not match');
  }
  const layout = [HEAD_N, POSE_N, PLANT_N, PART_N, PARTS_MAX];
  if (!Array.isArray(header.layout) || header.layout.join() !== layout.join()) {
    throw new ReplayFileError('column layout does not match this build');
  }
  const n = header.n;
  if (!Number.isInteger(n) || n < 1 || n > CAPACITY) {
    throw new ReplayFileError(`frame count ${n} is out of range`);
  }
  if (version === 1 && n % 2 === 1) {
    throw new ReplayFileError('a version 1 file with an odd frame count cannot have been saved whole');
  }
  checkMeta(header.meta);
  if (known && !known.airframe(header.meta.airframe)) {
    throw new ReplayFileError('its aircraft is not one this build flies');
  }
  if (known && !known.map(header.meta.map)) {
    throw new ReplayFileError('its map is not one this build has');
  }
  if (!Array.isArray(header.events) || header.events.length > 4000) {
    throw new ReplayFileError('events is not a list');
  }
  header.events.forEach(checkEvent);
  if (!Array.isArray(header.spawns) || header.spawns.length < 1 || header.spawns.length > 64) {
    throw new ReplayFileError('spawns is not a list');
  }
  header.spawns.forEach((s, i) => vec(s, 8, `spawns[${i}]`));
  if (!Array.isArray(header.keys) || header.keys.length > 64) {
    throw new ReplayFileError('keys is not a list');
  }
  header.keys.forEach(checkKey);

  const pre = 12 + hl;
  let o = pre + ((8 - (pre % 8)) % 8);
  const fixed = n * 8 + n * HEAD_N * 8 + poseBytes(n) + n * PLANT_N * 8;
  if (o + fixed > buf.byteLength) {
    throw new ReplayFileError('columns run past the end');
  }
  const time = new Float64Array(buf.slice(o, o + n * 8));
  o += n * 8;
  const head = new Float64Array(buf.slice(o, o + n * HEAD_N * 8));
  o += n * HEAD_N * 8;
  const pose = new Float32Array(buf.slice(o, o + n * POSE_N * 4));
  o += poseBytes(n);
  const plant = new Float64Array(buf.slice(o, o + n * PLANT_N * 8));
  o += n * PLANT_N * 8;
  let rows = 0;
  for (let k = 0; k < n; k += 1) {
    const np = head[k * HEAD_N + HEAD.parts];
    if (!Number.isInteger(np) || np < 0 || np > PARTS_MAX || (np > 0 && np !== header.meta.parts.length)) {
      throw new ReplayFileError(`frame ${k} has a bad part count`);
    }
    const sp = head[k * HEAD_N + HEAD.spawn];
    if (!Number.isInteger(sp) || sp < 0 || sp >= header.spawns.length) {
      throw new ReplayFileError(`frame ${k} has a bad spawn`);
    }
    if (k > 0 && !(time[k] >= time[k - 1])) {
      throw new ReplayFileError(`frame ${k} goes back in time`);
    }
    rows += np;
  }
  if (o + rows * PART_N * 4 !== buf.byteLength) {
    throw new ReplayFileError('the file is not the length its header says');
  }
  for (const col of [time, head, pose, plant]) {
    for (let i = 0; i < col.length; i += 1) {
      if (!Number.isFinite(col[i])) {
        throw new ReplayFileError('a column holds a value that is not a number');
      }
    }
  }
  const packed = new Float32Array(buf.slice(o, o + rows * PART_N * 4));
  const parts = new Float32Array(n * PARTS_MAX * PART_N);
  let r = 0;
  for (let k = 0; k < n; k += 1) {
    const np = head[k * HEAD_N + HEAD.parts];
    parts.set(packed.subarray(r, r + np * PART_N), k * PARTS_MAX * PART_N);
    r += np * PART_N;
  }
  return {
    n, time, head, pose, plant, parts,
    events: header.events, spawns: header.spawns, keys: header.keys, meta: header.meta,
  };
}

export { ReplayFileError };
