/*
 * roomwire.js: the rooms' wire, version 2 (docs/MULTIPLAYER-PLAN.md
 * section 3). One module, imported by the browser, by the room Worker
 * (edge/rooms/) and by the Node checks, so the three can never disagree
 * about a byte.
 *
 * Binary messages start with a type byte and are little endian. A receiver
 * drops a type it does not know, so a type can be added without a version
 * bump; changing an existing type's layout is a version bump.
 *
 * POSE, 0x10, client to room, 30 Hz while flying, POSE_BYTES long:
 *
 *   u8     type 0x10
 *   u8     flags, the FLAG_ bits below
 *   u16    sequence
 *   u32    sample time, room clock ms (ms since the room was made)
 *   f32x3  position, scene world metres (y up, the ghost's frame)
 *   i16x4  attitude quaternion, component x 32767, hemisphere aligned
 *   i16x3  velocity, world, cm/s
 *   i16x3  angular velocity, the craft's own axes, mrad/s
 *   i8x4   a plane's left aileron, right aileron, elevator, rudder, each
 *          SURFACE_FULL_RAD at 127; a quad's four rotor speeds, each
 *          ROTOR_STEP rad/s per count
 *   u8     motor speed, ROTOR_STEP * 2 rad/s per count (a plane's prop, a
 *          quad's mean)
 *   u8     flaps, FLAPS_FULL_RAD at 255
 *
 * The doc's layout had a throttle byte and a flaps and brake byte; this
 * carries what the receiver draws instead (the prop's speed, the flaps'
 * angle) because the receiver has no plant to turn a throttle into either.
 *
 * BATCH, 0x20, room to client, one per room tick: u8 type, u8 count, u32
 * room ms, then per peer u8 seat and the POSE body without its type byte.
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

export const PROTO = 2;

export const TYPE_POSE = 0x10;
export const TYPE_BATCH = 0x20;
export const POSE_BYTES = 46;
/* The POSE body a batch carries per peer: everything after the type byte. */
export const POSE_BODY = POSE_BYTES - 1;
export const BATCH_HEAD = 6;
export const BATCH_ENTRY = 1 + POSE_BODY;

export const FLAG_AIRBORNE = 1;
export const FLAG_CRASHED = 2;
export const FLAG_SMOKE = 4;
export const FLAG_LIGHTS = 8;
export const FLAG_CHUTE = 16;
export const FLAG_GEAR_DOWN = 32;
export const FLAG_SPAWNING = 64;
export const FLAG_QUAD = 128;

export const SURFACE_FULL_RAD = 0.8;
export const FLAPS_FULL_RAD = 0.8;
export const ROTOR_STEP = 40;

/* Close codes a room sends, and what the client says for each. */
export const CLOSE = {
  update: 4001,
  full: 4002,
  kicked: 4003,
  nosuch: 4004,
  replaced: 4005,
  rate: 4008,
  bad: 4009,
};

/* Six characters, no vowels so a code cannot spell a word, and none of 0,
 * O, 1 or I to misread: 28^6, about 482 million codes. */
export const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';
export const CODE_LENGTH = 6;

export function normaliseCode(text) {
  const code = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== CODE_LENGTH) {
    return null;
  }
  for (const ch of code) {
    if (!CODE_ALPHABET.includes(ch)) {
      return null;
    }
  }
  return code;
}

/* A code from bytes the caller drew from a cryptographic source. The
 * modulo bias of 256 over 28 is under one part in nine, which only makes
 * some codes a little likelier; nothing depends on codes being uniform. */
export function codeFromBytes(bytes) {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/*
 * Picker names: an adjective, an animal and a two digit number, sent as
 * three indices so a room never carries a string anybody typed. The words
 * are in the string table (rooms.adj.N, rooms.animal.N) in every language,
 * and each receiver shows them in its own. The counts live here because
 * the room checks them; scripts/rooms-selftest.js checks the string table
 * has every one.
 */
export const NAME_ADJECTIVES = 24;
export const NAME_ANIMALS = 24;
export const NAME_NUMBER_MIN = 10;
export const NAME_NUMBER_MAX = 99;

export function validNamePick(pick) {
  return Array.isArray(pick) && pick.length === 3
    && Number.isInteger(pick[0]) && pick[0] >= 0 && pick[0] < NAME_ADJECTIVES
    && Number.isInteger(pick[1]) && pick[1] >= 0 && pick[1] < NAME_ANIMALS
    && Number.isInteger(pick[2]) && pick[2] >= NAME_NUMBER_MIN && pick[2] <= NAME_NUMBER_MAX;
}

/* The pilot figures' preset looks (src/render/peers.js FIGURE_LOOKS). */
export const FIGURE_COUNT = 12;

/* A profile is small: livery decals are the bulk, 16 at most. */
export const PROFILE_MAX_BYTES = 4096;

const ID_RE = /^[a-z0-9_]{1,32}$/;

/*
 * The shape a room accepts for a profile: { airframe, map, figure,
 * livery, parts }, ids as short lower case words, livery and parts plain
 * objects or null. The room checks shape and size only; every receiver
 * runs its own normaliseEntry and normalisePlane on livery and parts, so
 * an id its build does not know is dropped there rather than here.
 * Returns the profile to relay, or null.
 */
export function checkProfile(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return null;
  }
  if (!ID_RE.test(String(p.airframe)) || !ID_RE.test(String(p.map))) {
    return null;
  }
  if (!Number.isInteger(p.figure) || p.figure < 0 || p.figure >= FIGURE_COUNT) {
    return null;
  }
  const obj = (v) => v === null || v === undefined || (typeof v === 'object' && !Array.isArray(v));
  if (!obj(p.livery) || !obj(p.parts)) {
    return null;
  }
  const out = {
    airframe: p.airframe,
    map: p.map,
    figure: p.figure,
    livery: p.livery ?? null,
    parts: p.parts ?? null,
  };
  if (new TextEncoder().encode(JSON.stringify(out)).length > PROFILE_MAX_BYTES) {
    return null;
  }
  return out;
}

const QUAT_SCALE = 32767;
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

/*
 * A pose as numbers: { flags, seq, t, px, py, pz, qx, qy, qz, qw, vx, vy,
 * vz, wx, wy, wz, c0, c1, c2, c3, motor, flaps }, with velocity in m/s,
 * angular velocity in rad/s, c0..c3 in the units named above (radians for
 * a plane's surfaces, rad/s for a quad's rotors), motor in rad/s and flaps
 * in radians. encodePose writes one into a new POSE message.
 */
export function encodePose(p) {
  const bytes = new Uint8Array(POSE_BYTES);
  const v = new DataView(bytes.buffer);
  const quad = (p.flags & FLAG_QUAD) !== 0;
  v.setUint8(0, TYPE_POSE);
  v.setUint8(1, p.flags & 0xff);
  v.setUint16(2, p.seq & 0xffff, true);
  v.setUint32(4, clampInt(p.t, 0, 0xffffffff) >>> 0, true);
  v.setFloat32(8, p.px, true);
  v.setFloat32(12, p.py, true);
  v.setFloat32(16, p.pz, true);
  v.setInt16(20, clampInt(p.qx * QUAT_SCALE, -QUAT_SCALE, QUAT_SCALE), true);
  v.setInt16(22, clampInt(p.qy * QUAT_SCALE, -QUAT_SCALE, QUAT_SCALE), true);
  v.setInt16(24, clampInt(p.qz * QUAT_SCALE, -QUAT_SCALE, QUAT_SCALE), true);
  v.setInt16(26, clampInt(p.qw * QUAT_SCALE, -QUAT_SCALE, QUAT_SCALE), true);
  v.setInt16(28, clampInt(p.vx * 100, -32767, 32767), true);
  v.setInt16(30, clampInt(p.vy * 100, -32767, 32767), true);
  v.setInt16(32, clampInt(p.vz * 100, -32767, 32767), true);
  v.setInt16(34, clampInt(p.wx * 1000, -32767, 32767), true);
  v.setInt16(36, clampInt(p.wy * 1000, -32767, 32767), true);
  v.setInt16(38, clampInt(p.wz * 1000, -32767, 32767), true);
  const cs = [p.c0, p.c1, p.c2, p.c3];
  for (let i = 0; i < 4; i += 1) {
    const c = quad ? cs[i] / ROTOR_STEP : (cs[i] / SURFACE_FULL_RAD) * 127;
    v.setInt8(40 + i, clampInt(c || 0, -127, 127));
  }
  v.setUint8(44, clampInt((p.motor || 0) / (ROTOR_STEP * 2), 0, 255));
  v.setUint8(45, clampInt(((p.flaps || 0) / FLAPS_FULL_RAD) * 255, 0, 255));
  return bytes;
}

/* The POSE body at `at` in `view` (the byte after the type), as numbers. */
function readBody(v, at) {
  const flags = v.getUint8(at);
  const quad = (flags & FLAG_QUAD) !== 0;
  let qx = v.getInt16(at + 19, true) / QUAT_SCALE;
  let qy = v.getInt16(at + 21, true) / QUAT_SCALE;
  let qz = v.getInt16(at + 23, true) / QUAT_SCALE;
  let qw = v.getInt16(at + 25, true) / QUAT_SCALE;
  const n = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (n > 1e-6) {
    qx /= n;
    qy /= n;
    qz /= n;
    qw /= n;
  } else {
    qx = 0;
    qy = 0;
    qz = 0;
    qw = 1;
  }
  const c = (i) => {
    const raw = v.getInt8(at + 39 + i);
    return quad ? raw * ROTOR_STEP : (raw / 127) * SURFACE_FULL_RAD;
  };
  return {
    flags,
    seq: v.getUint16(at + 1, true),
    t: v.getUint32(at + 3, true),
    px: v.getFloat32(at + 7, true),
    py: v.getFloat32(at + 11, true),
    pz: v.getFloat32(at + 15, true),
    qx,
    qy,
    qz,
    qw,
    vx: v.getInt16(at + 27, true) / 100,
    vy: v.getInt16(at + 29, true) / 100,
    vz: v.getInt16(at + 31, true) / 100,
    wx: v.getInt16(at + 33, true) / 1000,
    wy: v.getInt16(at + 35, true) / 1000,
    wz: v.getInt16(at + 37, true) / 1000,
    c0: c(0),
    c1: c(1),
    c2: c(2),
    c3: c(3),
    motor: v.getUint8(at + 43) * ROTOR_STEP * 2,
    flaps: (v.getUint8(at + 44) / 255) * FLAPS_FULL_RAD,
  };
}

/* A POSE message as numbers, or null when the bytes are not one. */
export function decodePose(bytes) {
  if (!bytes || bytes.byteLength !== POSE_BYTES || bytes[0] !== TYPE_POSE) {
    return null;
  }
  return readBody(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), 1);
}

/* The sample time of a POSE message, without decoding the rest. */
export function poseTime(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
}

/* A BATCH from the room: entries is [{ seat, pose }] with pose a whole
 * POSE message (type byte included), as the room holds them. */
export function encodeBatch(roomMs, entries) {
  const bytes = new Uint8Array(BATCH_HEAD + entries.length * BATCH_ENTRY);
  const v = new DataView(bytes.buffer);
  v.setUint8(0, TYPE_BATCH);
  v.setUint8(1, entries.length);
  v.setUint32(2, clampInt(roomMs, 0, 0xffffffff) >>> 0, true);
  let at = BATCH_HEAD;
  for (const e of entries) {
    bytes[at] = e.seat;
    bytes.set(e.pose.subarray(1, POSE_BYTES), at + 1);
    at += BATCH_ENTRY;
  }
  return bytes;
}

/* { roomMs, poses: [{ seat, ...pose }] }, or null when not a batch. */
export function decodeBatch(bytes) {
  if (!bytes || bytes.byteLength < BATCH_HEAD || bytes[0] !== TYPE_BATCH) {
    return null;
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getUint8(1);
  if (bytes.byteLength !== BATCH_HEAD + count * BATCH_ENTRY) {
    return null;
  }
  const poses = [];
  for (let i = 0; i < count; i += 1) {
    const at = BATCH_HEAD + i * BATCH_ENTRY;
    poses.push({ seat: v.getUint8(at), ...readBody(v, at + 1) });
  }
  return { roomMs: v.getUint32(2, true), poses };
}

/* ------------------------------------------------------------------ */
/* Phase 2, shared wrecks: types 0x30 to 0x3F, event kinds crash, whack. */

/*
 * PARTS, 0x30, client to room, 10 Hz while any broken piece moves and once
 * more at rest: u8 type, u8 count, u32 room ms, then per piece u8 part
 * index, f32x3 world position, i16x4 quaternion (x, y, z, w), 21 bytes.
 * The world pose is the piece as its owner draws it, lifted clear of the
 * ground, so a receiver draws it where it is and asks nothing of its own
 * ground. PARTS_RELAY, 0x31, room to client, is the same message with the
 * sender's seat inserted after the type byte.
 */
export const TYPE_PARTS = 0x30;
export const TYPE_PARTS_RELAY = 0x31;
export const PARTS_HEAD = 6;
export const PARTS_ENTRY = 21;
export const PARTS_MAX = 24;

export function encodeParts(roomMs, pieces) {
  const n = Math.min(PARTS_MAX, pieces.length);
  const bytes = new Uint8Array(PARTS_HEAD + n * PARTS_ENTRY);
  const v = new DataView(bytes.buffer);
  v.setUint8(0, TYPE_PARTS);
  v.setUint8(1, n);
  v.setUint32(2, clampInt(roomMs, 0, 0xffffffff) >>> 0, true);
  for (let k = 0; k < n; k += 1) {
    const p = pieces[k];
    const at = PARTS_HEAD + k * PARTS_ENTRY;
    v.setUint8(at, p.part);
    v.setFloat32(at + 1, p.x, true);
    v.setFloat32(at + 5, p.y, true);
    v.setFloat32(at + 9, p.z, true);
    v.setInt16(at + 13, clampInt(p.qx * QUAT_SCALE, -QUAT_SCALE, QUAT_SCALE), true);
    v.setInt16(at + 15, clampInt(p.qy * QUAT_SCALE, -QUAT_SCALE, QUAT_SCALE), true);
    v.setInt16(at + 17, clampInt(p.qz * QUAT_SCALE, -QUAT_SCALE, QUAT_SCALE), true);
    v.setInt16(at + 19, clampInt(p.qw * QUAT_SCALE, -QUAT_SCALE, QUAT_SCALE), true);
  }
  return bytes;
}

/* Whether bytes are a well formed PARTS message from a client. */
export function isParts(bytes) {
  return Boolean(bytes) && bytes.byteLength >= PARTS_HEAD && bytes[0] === TYPE_PARTS
    && bytes[1] <= PARTS_MAX && bytes.byteLength === PARTS_HEAD + bytes[1] * PARTS_ENTRY;
}

/* The relayed form: the seat after the type byte. */
export function relayParts(seat, bytes) {
  const out = new Uint8Array(bytes.byteLength + 1);
  out[0] = TYPE_PARTS_RELAY;
  out[1] = seat;
  out.set(bytes.subarray(1), 2);
  return out;
}

/* { seat, roomMs, pieces: [{ part, x, y, z, qx, qy, qz, qw }] }, or null. */
export function decodePartsRelay(bytes) {
  if (!bytes || bytes.byteLength < PARTS_HEAD + 1 || bytes[0] !== TYPE_PARTS_RELAY) {
    return null;
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint8(2);
  if (n > PARTS_MAX || bytes.byteLength !== PARTS_HEAD + 1 + n * PARTS_ENTRY) {
    return null;
  }
  const pieces = [];
  for (let k = 0; k < n; k += 1) {
    const at = PARTS_HEAD + 1 + k * PARTS_ENTRY;
    let qx = v.getInt16(at + 13, true) / QUAT_SCALE;
    let qy = v.getInt16(at + 15, true) / QUAT_SCALE;
    let qz = v.getInt16(at + 17, true) / QUAT_SCALE;
    let qw = v.getInt16(at + 19, true) / QUAT_SCALE;
    const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1;
    qx /= len;
    qy /= len;
    qz /= len;
    qw /= len;
    pieces.push({
      part: v.getUint8(at), x: v.getFloat32(at + 1, true), y: v.getFloat32(at + 5, true), z: v.getFloat32(at + 9, true), qx, qy, qz, qw,
    });
  }
  return { seat: v.getUint8(1), roomMs: v.getUint32(3, true), pieces };
}

/*
 * The crash event: { type: 'event', kind: 'crash', table } when an
 * aircraft first breaks, table being its part table as the wreck cuts by
 * (src/render/wreck.js: kind, parent, cg, boxMin, boxMax per part, body
 * frame metres), because a receiver's plant holds only its own airframe's
 * table; and { type: 'event', kind: 'crash', clear: true } when its owner
 * starts again. The room relays both with the seat added and keeps the
 * newest, with the newest PARTS, for whoever joins later.
 */
export const CRASH_EVENT_MAX_BYTES = 8192;
const PART_REACH_M = 5;

export function checkCrashTable(table) {
  if (!Array.isArray(table) || table.length < 2 || table.length > PARTS_MAX) {
    return null;
  }
  const vec = (a) => Array.isArray(a) && a.length === 3 && a.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= PART_REACH_M);
  const out = [];
  for (const p of table) {
    if (!p || !Number.isInteger(p.kind) || p.kind < 0 || p.kind > 63 || !Number.isInteger(p.parent) || p.parent < -1 || p.parent >= table.length) {
      return null;
    }
    if (!vec(p.cg) || !vec(p.boxMin) || !vec(p.boxMax)) {
      return null;
    }
    out.push({ kind: p.kind, parent: p.parent, cg: p.cg.slice(), boxMin: p.boxMin.slice(), boxMax: p.boxMax.slice() });
  }
  return out;
}

/* A whack on a jelly pylon or hoop: { type: 'event', kind: 'whack', map,
 * course, i, n: [x, y, z], square }, i the soft piece's collider index in
 * that world and course, n the jelly's normal toward the plane. */
export function checkWhack(m) {
  const id = /^[a-z0-9_]{1,32}$/;
  if (!m || !id.test(String(m.map)) || typeof m.course !== 'string' || m.course.length > 200) {
    return null;
  }
  if (!Number.isInteger(m.i) || m.i < 0 || m.i > 1e6 || !(m.square >= 0 && m.square <= 1)) {
    return null;
  }
  if (!Array.isArray(m.n) || m.n.length !== 3 || !m.n.every((x) => typeof x === 'number' && Math.abs(x) <= 1.001)) {
    return null;
  }
  return { map: m.map, course: m.course, i: m.i, n: m.n.slice(), square: m.square };
}

/*
 * PHASE 5, SAFETY (docs/MULTIPLAYER-PLAN.md section 9). No free text
 * reaches another player: a chat is an index into CHAT_PRESETS, an emote
 * an index into EMOTES, a report's reason an index into REPORT_REASONS.
 * Every receiver shows the words from its own string table (rooms.chat.*,
 * rooms.emote.*, rooms.report.*), in its own language, and the room
 * rebuilds each relayed message from the index alone, so nothing a client
 * wrote travels on. The lists are append only: an index is the wire.
 *
 *   c to r   { type: 'event', kind: 'chat', id }    also kind 'emote'
 *   r to c   { type: 'event', kind: 'chat', seat, id }
 *   c to r   { type: 'mute', seats: [seat, ...] }   the whole set, each time
 *   c to r   { type: 'report', seat, reason }
 *   r to c   { type: 'reported', seat }              to the reporter only
 */
export const CHAT_PRESETS = [
  'hello', 'nice_flying', 'race', 'follow_me', 'wait_for_me', 'oops',
  'good_game', 'landing', 'thanks', 'sorry', 'watch_this', 'bye',
];
export const EMOTES = ['wave', 'thumbs_up', 'smoke_puff', 'clap', 'laugh', 'wow'];
export const REPORT_REASONS = ['ramming', 'spam', 'following'];
/* Quick chat and emotes share one allowance: CHAT_BURST at once, then one
 * every CHAT_EVERY_MS. */
export const CHAT_BURST = 3;
export const CHAT_EVERY_MS = 2000;
/* A public room's cap; a private room's is edge/rooms/core.js PRIVATE_CAP. */
export const PUBLIC_CAP = 16;
/* A seat removed by reports or by the pose rules. Its own code so the
 * client can say why, which a host's kick (CLOSE.kicked) does not. */
export const CLOSE_REMOVED = 4010;

/* The id of a well formed chat or emote event, or -1. Anything but
 * exactly { type, kind, id } is refused, so no field can carry text. */
export function eventPresetId(msg) {
  if (!msg || msg.type !== 'event' || Object.keys(msg).length !== 3) {
    return -1;
  }
  const list = msg.kind === 'chat' ? CHAT_PRESETS : msg.kind === 'emote' ? EMOTES : null;
  return list && Number.isInteger(msg.id) && msg.id >= 0 && msg.id < list.length ? msg.id : -1;
}

/* A chat allowance, { tokens, at }: CHAT_BURST to start, refilled one per
 * CHAT_EVERY_MS. The room enforces it; the client runs the same one so it
 * can say "wait" instead of sending what the room would drop. */
export function chatAllowance(now) {
  return { tokens: CHAT_BURST, at: now };
}

export function takeChat(allowance, now) {
  const refill = (now - allowance.at) / CHAT_EVERY_MS;
  allowance.tokens = Math.min(CHAT_BURST, allowance.tokens + Math.max(0, refill));
  allowance.at = now;
  if (allowance.tokens < 1) {
    return false;
  }
  allowance.tokens -= 1;
  return true;
}
