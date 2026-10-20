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

import { MAKEABLE, SETUPS } from './modes.js';
import { currentAirframeId, retiredAirframe } from '../../configs/airframes.js';

export const PROTO = 2;

/*
 * The room behaviour a build keeps, a count that goes up when a room's
 * pilots must all run the same rules to share one session: 1 is the room
 * that moves everybody into its world and game (src/main.js, THE ROOM IS
 * ONE SESSION). A hello says it (absent is 0), and a room closes the
 * pilots below the highest it holds with CLOSE.update, which every build
 * shows as a reload. PROTO stays, so a restart of the rooms server under
 * tabs from before this never refuses them: they fly as they did until a
 * newer build joins their room.
 *
 * 2: a quad's rotor speeds and a plane's motor speed in the POSE are
 * rad/s, as the layout above always said; builds below sent the plant's
 * rpm in them, which clamped every quad above 5,080 rpm and which a level
 * 2 receiver would hear nine and a half times too fast (docs/AUDIO.md
 * section 13).
 *
 * 3: a peer the room says is bot: true is an AI pilot, and is named as one
 * (src/share/rooms.js shownName). The room fills seats with AI pilots only
 * while every person in it is at 3 or above (edge/rooms/roombots.js), and
 * a tab below closes with CLOSE.update by the rule above, so no screen ever
 * shows an AI pilot as a person.
 *
 * 4: the host of a private room may change its activity between rounds
 * (edge/rooms/core.js setup, { type: 'setup' }), which moves every page
 * in it to the new game's lobby and asks the war's consent of each pilot
 * when the new game is the war. A page below would stay in the old
 * game's lobby and never be asked.
 *
 * 5: the combat-only cut (2026-10-18), which leaves the rooms server its
 * war and ops rooms alone, on Itaipu and the Interior. A page below still
 * offers the room games, worlds and quick join it took, so ROOM_FLOOR
 * holds here.
 */
export const ROOM_LEVEL = 5;

/*
 * The level below which a room seats nobody, whether or not a newer tab
 * is in it: a tab below ROOM_FLOOR is told to reload on its hello
 * (edge/rooms/core.js hello). The rule above is otherwise unchanged, so a
 * level raised past the floor is still soft. The server reaches the VM
 * with deploy/vm/deploy.sh after the client is live (pages.yml), so a
 * floor raised here is always met by the client first.
 */
export const ROOM_FLOOR = 5;

/*
 * A hello's `war`: this build asks the war's consent (docs/WARFARE-PLAN.md
 * section 9) of a pilot it seats in a room made for the war, and leaves
 * the room when the pilot says no. A room made for the war closes a hello
 * without it with CLOSE.update, which every build shows as a reload, so
 * a tab from before it is never seated in the war unasked.
 */
export const WAR_JOIN = 1;

/*
 * A hello's `account`: this build plays only signed in (the owner,
 * 2026-10-03: no play without a registered Google account), sends its
 * session with every hello, and shows CLOSE.signin and CLOSE.accounts as
 * their own words. A rooms server that checks accounts (edge/rooms/node.js
 * with ACCOUNTS_ORIGIN) closes a hello without it with CLOSE.update, which
 * every build shows as a reload, so a tab from before it is sent to the
 * build that asks for the sign in rather than told a code it cannot read.
 */
export const ACCOUNT_JOIN = 1;

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

/* A world or airframe id as a room takes it. */
export function validId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/* Why a pilot in a room sends no poses, in their profile, so the others can
 * say it beside the name (rooms.away_*): paused, a menu, a hidden tab, a
 * world loading, the crash cam, or gone into the field's hangar on foot
 * (FOOT below; their parked aircraft still sends). Absent while flying.
 * Append only: a room server that does not know one drops it. */
export const ROOM_STATUSES = ['paused', 'menu', 'hidden', 'loading', 'crashcam', 'hangar'];

/* The games a private room's host starts: the war mode
 * (docs/WARFARE-PLAN.md). Streamer Combat and Catch the Ace left in the
 * combat-only cut (2026-10-20); a profile naming one is passed on without
 * it. */
export const ROOM_GAMES = ['war'];

/*
 * The shape a room accepts for a profile: { airframe, map, figure,
 * livery, parts }, ids as short lower case words, livery and parts plain
 * objects or null. The room checks shape and size only; every receiver
 * runs its own normaliseEntry and normalisePlane on livery and parts, so
 * an id its build does not know is dropped there rather than here.
 * Returns the profile to relay, or null.
 *
 * A RETIRED AIRFRAME is the one exception to "shape only": a tab still open
 * from before the five inch and the whoop were removed (2026-10-03) says
 * '5inch' or 'whoop65', and the room seats it as the successor
 * configs/airframes.js names, for the referee's hull and for every peer,
 * so nobody in the room is asked to draw or collide with an aircraft this
 * build does not have. Its livery and parts were the old aircraft's and
 * are dropped with it.
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
  const gone = retiredAirframe(p.airframe);
  const out = {
    airframe: currentAirframeId(p.airframe),
    map: p.map,
    figure: p.figure,
    livery: gone ? null : p.livery ?? null,
    parts: gone ? null : p.parts ?? null,
  };
  /* The room game the pilot came in for (a title card: 'war'),
   * so a joiner sees what the host set the room up for. Optional: absent
   * or unknown is simply not passed on, never a refused profile. */
  if (ROOM_GAMES.includes(p.game)) {
    out.game = p.game;
  }
  /* Optional the same way: a status this room does not know is dropped. */
  if (ROOM_STATUSES.includes(p.status)) {
    out.status = p.status;
  }
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
/* Phase 2, shared wrecks: types 0x30 to 0x3F, event kind crash. */

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

/* ------------------------------------------------------------------ */
/* The pilot on foot (docs/ON-FOOT.md): types 0x40 to 0x41. */

/*
 * FOOT, 0x40, client to room, where the pilot stands, FOOT_BYTES long:
 *
 *   u8     type 0x40
 *   u8     flags, FOOT_ON (out of the aircraft, walking or standing) and
 *          FOOT_HANGAR (inside the hangar, gone through its door)
 *   f32x3  the feet, scene world metres (y up, the POSE's frame)
 *   i16    heading, clockwise from -z seen from above as the walk's
 *          (src/game/onfoot.js), pi at 32767
 *
 * Sent at FOOT_HZ while on foot or in the hangar, and once a second while
 * flying from a spot the pilot walked to, so the others draw the figure
 * where the pilot stands; nothing while the pilot stands where every pilot
 * starts (the station, src/game/slots.js), which a receiver falls back to
 * when FOOT stops. No clock: a figure is eased to the newest, which at a
 * walk's 1.4 m/s is 14 cm a sample. FOOT_RELAY, 0x41, room to client, is
 * the same message with the sender's seat inserted after the type byte.
 * The hangar's inside is drawn from each pilot's own data and never sent.
 */
export const TYPE_FOOT = 0x40;
export const TYPE_FOOT_RELAY = 0x41;
export const FOOT_BYTES = 16;
export const FOOT_HZ = 10;
export const FOOT_ON = 1;
export const FOOT_HANGAR = 2;
const FOOT_FLAGS = FOOT_ON | FOOT_HANGAR;
/* m: the furthest a pilot stands from the world's origin, or above or
 * under it; every map fits well inside (the biggest is a few km). */
export const FOOT_REACH_M = 50000;
const HEADING_SCALE = 32767 / Math.PI;

/* { flags, x, y, z, heading } to bytes. */
export function encodeFoot(f) {
  const bytes = new Uint8Array(FOOT_BYTES);
  const v = new DataView(bytes.buffer);
  v.setUint8(0, TYPE_FOOT);
  v.setUint8(1, f.flags & FOOT_FLAGS);
  v.setFloat32(2, f.x, true);
  v.setFloat32(6, f.y, true);
  v.setFloat32(10, f.z, true);
  const h = Math.atan2(Math.sin(f.heading), Math.cos(f.heading));
  v.setInt16(14, clampInt(h * HEADING_SCALE, -32767, 32767), true);
  return bytes;
}

/* Whether bytes are a well formed FOOT from a client: its length, only
 * the flags there are, and a place inside FOOT_REACH_M. */
export function isFoot(bytes) {
  if (!bytes || bytes.byteLength !== FOOT_BYTES || bytes[0] !== TYPE_FOOT || (bytes[1] & ~FOOT_FLAGS) !== 0) {
    return false;
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const at of [2, 6, 10]) {
    const x = v.getFloat32(at, true);
    if (!Number.isFinite(x) || Math.abs(x) > FOOT_REACH_M) {
      return false;
    }
  }
  return true;
}

/* The relayed form: the seat after the type byte. */
export function relayFoot(seat, bytes) {
  const out = new Uint8Array(FOOT_BYTES + 1);
  out[0] = TYPE_FOOT_RELAY;
  out[1] = seat;
  out.set(bytes.subarray(1, FOOT_BYTES), 2);
  return out;
}

/* { seat, flags, x, y, z, heading }, or null. */
export function decodeFootRelay(bytes) {
  if (!bytes || bytes.byteLength !== FOOT_BYTES + 1 || bytes[0] !== TYPE_FOOT_RELAY) {
    return null;
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    seat: v.getUint8(1),
    flags: v.getUint8(2),
    x: v.getFloat32(3, true),
    y: v.getFloat32(7, true),
    z: v.getFloat32(11, true),
    heading: v.getInt16(15, true) / HEADING_SCALE,
  };
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
 *   c to r   { type: 'unreport', seat }               the sender's own report back
 *   r to c   { type: 'unreported', seat, undone }     to the reporter only;
 *                                                     undone false when there
 *                                                     was none still counting
 */
export const CHAT_PRESETS = [
  'hello', 'nice_flying', 'race', 'follow_me', 'wait_for_me', 'oops',
  'good_game', 'landing', 'thanks', 'sorry', 'watch_this', 'bye',
];
export const EMOTES = ['wave', 'thumbs_up', 'smoke_puff', 'clap', 'laugh', 'wow'];
/* 'room_name' is a report against the room's typed name, not a pilot:
 * its seat is ignored (edge/rooms/safety.js roomName). */
export const REPORT_REASONS = ['ramming', 'spam', 'following', 'room_name'];
export const ROOM_NAME_REPORT = REPORT_REASONS.indexOf('room_name');
/* How long a report counts toward a removal, and so how long its pilot
 * can take it back (edge/rooms/safety.js unreport). */
export const REPORT_WINDOW_MS = 5 * 60 * 1000;
/* Quick chat and emotes share one allowance: CHAT_BURST at once, then one
 * every CHAT_EVERY_MS. */
export const CHAT_BURST = 3;
export const CHAT_EVERY_MS = 2000;
/* A public room's cap; a private room's is edge/rooms/core.js PRIVATE_CAP. */
export const PUBLIC_CAP = 16;
/*
 * THE ROOM BROWSER (edge/rooms/lobby.js). Every public room is listed with
 * its name, and a room's creator may type that name: the one piece of
 * free text any room carries, so it is held to more than the no free
 * text rule's replacement would be. normaliseRoomName is the shape, run
 * by the client for a quick answer and by the server, which alone also
 * runs the word filter (tracks-api/words.js) and alone decides.
 *
 * Latin letters with the accents English and Spanish use, digits, spaces
 * and a little punctuation: no other script and no symbol, because the
 * word filter folds only those, and a lookalike letter from another
 * script would carry any word past it.
 *
 * A room with no typed name, or whose name enough pilots reported, shows
 * its picker name instead: `pick`, three indices like a pilot's, drawn by
 * the room, shown by each receiver in its own language.
 *
 *   GET /v2/rooms   { open, busy, now, rooms: [{ code, name, pick, map, n,
 *                   cap, game, state, mode, emptySince }] }, public rooms
 *                   only, people first then newest; game null (free
 *                   flight) or a game's id, state 'waiting',
 *                   'countdown' or 'on'; emptySince the server ms its last
 *                   pilot left (null while anybody is in), and now the
 *                   server's clock, so a browser whose clock is off still
 *                   says when an empty room closes. A server from before
 *                   2026-09-30 sends neither, and a browser from before
 *                   then ignores both.
 */
export const ROOM_NAME_MIN = 3;
export const ROOM_NAME_MAX = 32;
/* The games a room may be made for as is, in this order: the mode
 * registry's (src/share/modes.js MAKEABLE), whose order is the wire's. */
export const ROOM_MODES = MAKEABLE;
/*
 * WHAT A ROOM MAY BE MADE FOR (POST /v2/create's mode): the games any room
 * may be set up for, and the war, which only a room on a war mission's map
 * may be, public or private (docs/WARFARE-PLAN.md section 9, the server
 * refuses the rest). A war room keeps its mission as room state: the
 * create's `mission` (a mission on that map, or null for the first), and
 * after that the mission its host last started. The welcome carries both
 * as `mode` and `mission`; a server from before 2026-10-01 sends no
 * `mission`, and a browser from before then reads `mode: 'war'` only as
 * the room's heading.
 */
export const ROOM_SETUPS = SETUPS;
/* A room with nobody in it closes this long after its last pilot left,
 * public or private (the owner, 2026-09-30: "room closes after 5 minutes of
 * it being empty"). One number for the three places that must agree: the
 * room's purge (edge/rooms/host.js), how long the lobby still lists it
 * (edge/rooms/lobby.js), and the "closes in" the browser shows. */
export const EMPTY_CLOSE_MS = 5 * 60 * 1000;
/* How often an open Rooms screen asks for the list (src/share/roomlist.js);
 * here because the server sizes its per address list limit from it. */
export const LIST_EVERY_MS = 4000;
const ROOM_NAME_RE = /^[A-Za-z0-9\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff .,\u0027!?\u00a1\u00bf#&_-]+$/;

/* A typed room name, its spaces collapsed and trimmed, or null when it
 * is not one. Length is counted in letters, not bytes. */
export function normaliseRoomName(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const name = text.normalize('NFC').replace(/\s+/g, ' ').trim();
  const n = [...name].length;
  return n >= ROOM_NAME_MIN && n <= ROOM_NAME_MAX && ROOM_NAME_RE.test(name) ? name : null;
}

/* A room named for a pilot, `frame(name)` (the game's "{name}, Paraná"),
 * the pilot's name shortened, by words and then by letters, until the
 * whole is a room name. Whole, a picker name could not always be one:
 * "Cheerful Falcon 10, Catch the Ace" is 33 letters, and most Spanish
 * Trick Battle rooms were past ROOM_NAME_MAX, so such a room was made
 * with no name and shown under its picker name (game:lobby --game=tag,
 * 2026-10-16). Null only when no part of the pilot's name fits. */
export function pilotRoomName(pilot, frame) {
  const words = String(pilot).trim().split(/\s+/);
  for (let n = words.length; n > 0; n -= 1) {
    const name = normaliseRoomName(frame(words.slice(0, n).join(' ')));
    if (name) {
      return name;
    }
  }
  const letters = [...words[0]];
  for (let n = letters.length - 1; n > 0; n -= 1) {
    const name = normaliseRoomName(frame(letters.slice(0, n).join('')));
    if (name) {
      return name;
    }
  }
  return null;
}

/* A seat removed by reports or by the pose rules. Its own code so the
 * client can say why, which a host's kick (CLOSE.kicked) does not. */
export const CLOSE_REMOVED = 4010;

/* A hello with no session that checks out (none, ended, or an account
 * with no callsign yet), and one whose session could not be checked
 * because the accounts server did not answer: refused alike, and told
 * apart so the pilot knows whether to sign in or to try again. */
export const CLOSE_SIGNIN = 4011;
export const CLOSE_ACCOUNTS = 4012;

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

/* ------------------------------------------------------------------ */
/* War: types 0xA0 to 0xAF and the JSON type war (docs/WARFARE-PLAN.md
 * section 5.1; the room's half is edge/rooms/war.js). */

/*
 * AGENTS, 0xA0, room to client, on the room tick while a war game has
 * hunters: the attackers the room steers, since their paths hang on the
 * players (the scripted ones are src/share/war/routes.js on every screen
 * and never sent). Thinned per seat by distance, as BATCH is.
 *
 *   u8     type 0xA0
 *   u8     count
 *   u32    room ms of the poses
 *   per agent:
 *     u16    id
 *     u8     kind, an index into routes.js KINDS
 *     f32x3  position, scene world metres (y up)
 *     i16x4  attitude quaternion, component x 32767
 *
 * HUNTS, 0xA1, room to client, right after each AGENTS to the same seat
 * and for the same agents: each hunter's target, the seat it is chasing.
 * A type of its own because an AGENTS entry has a fixed size that every
 * decoder checks, so a longer one would be refused by a client from
 * before it; a client that does not know 0xA1 drops it.
 *
 *   u8     type 0xA1
 *   u8     count
 *   u32    room ms, the AGENTS frame's
 *   per agent:
 *     u16    id
 *     u8     target seat, HUNTS_NONE for none
 *
 * The JSON type war, room to client (edge/rooms/war.js says what each
 * carries): { war } the view, { op: 'born', agents }, { op: 'dead', ids,
 * at, by, why, p }, { op: 'boom', seat, at, p }, { error }. Client to room,
 * the host only, in a private room only: { op: 'start', mission } and
 * { op: 'end' }; any pilot, about its own airframe: { op: 'lost' }.
 */
export const TYPE_AGENTS = 0xA0;
export const AGENTS_HEAD = 6;
export const AGENTS_ENTRY = 23;
/* The most a message carries: a count byte. */
export const AGENTS_MAX = 255;

/* agents: [{ id, kind, p: [x, y, z], q: [x, y, z, w] }], the first
 * AGENTS_MAX of them. */
export function encodeAgents(roomMs, agents) {
  const list = agents.slice(0, AGENTS_MAX);
  const bytes = new Uint8Array(AGENTS_HEAD + list.length * AGENTS_ENTRY);
  const v = new DataView(bytes.buffer);
  v.setUint8(0, TYPE_AGENTS);
  v.setUint8(1, list.length);
  v.setUint32(2, clampInt(roomMs, 0, 0xffffffff) >>> 0, true);
  let at = AGENTS_HEAD;
  for (const a of list) {
    v.setUint16(at, a.id & 0xffff, true);
    v.setUint8(at + 2, a.kind & 0xff);
    v.setFloat32(at + 3, a.p[0], true);
    v.setFloat32(at + 7, a.p[1], true);
    v.setFloat32(at + 11, a.p[2], true);
    for (let i = 0; i < 4; i += 1) {
      v.setInt16(at + 15 + 2 * i, clampInt(a.q[i] * QUAT_SCALE, -QUAT_SCALE, QUAT_SCALE), true);
    }
    at += AGENTS_ENTRY;
  }
  return bytes;
}

/* { roomMs, agents: [{ id, kind, p, q }] }, or null when not an AGENTS. */
export function decodeAgents(bytes) {
  if (!bytes || bytes.byteLength < AGENTS_HEAD || bytes[0] !== TYPE_AGENTS) {
    return null;
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getUint8(1);
  if (bytes.byteLength !== AGENTS_HEAD + count * AGENTS_ENTRY) {
    return null;
  }
  const agents = [];
  for (let k = 0; k < count; k += 1) {
    const at = AGENTS_HEAD + k * AGENTS_ENTRY;
    const q = [0, 1, 2, 3].map((i) => v.getInt16(at + 15 + 2 * i, true) / QUAT_SCALE);
    const n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    agents.push({
      id: v.getUint16(at, true),
      kind: v.getUint8(at + 2),
      p: [v.getFloat32(at + 3, true), v.getFloat32(at + 7, true), v.getFloat32(at + 11, true)],
      q: n > 1e-6 ? q.map((x) => x / n) : [0, 0, 0, 1],
    });
  }
  return { roomMs: v.getUint32(2, true), agents };
}

export const TYPE_HUNTS = 0xA1;
export const HUNTS_HEAD = 6;
export const HUNTS_ENTRY = 3;
export const HUNTS_NONE = 255;

/* agents: [{ id, target }], target a seat or null (or -1) for none; the
 * first AGENTS_MAX of them. A seat over 254 cannot be said and is none. */
export function encodeHunts(roomMs, agents) {
  const list = agents.slice(0, AGENTS_MAX);
  const bytes = new Uint8Array(HUNTS_HEAD + list.length * HUNTS_ENTRY);
  const v = new DataView(bytes.buffer);
  v.setUint8(0, TYPE_HUNTS);
  v.setUint8(1, list.length);
  v.setUint32(2, clampInt(roomMs, 0, 0xffffffff) >>> 0, true);
  let at = HUNTS_HEAD;
  for (const a of list) {
    const t = a.target;
    v.setUint16(at, a.id & 0xffff, true);
    v.setUint8(at + 2, Number.isInteger(t) && t >= 0 && t < HUNTS_NONE ? t : HUNTS_NONE);
    at += HUNTS_ENTRY;
  }
  return bytes;
}

/* { roomMs, agents: [{ id, target }] }, target a seat or null, or null
 * when not a HUNTS. */
export function decodeHunts(bytes) {
  if (!bytes || bytes.byteLength < HUNTS_HEAD || bytes[0] !== TYPE_HUNTS) {
    return null;
  }
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getUint8(1);
  if (bytes.byteLength !== HUNTS_HEAD + count * HUNTS_ENTRY) {
    return null;
  }
  const agents = [];
  for (let k = 0; k < count; k += 1) {
    const at = HUNTS_HEAD + k * HUNTS_ENTRY;
    const t = v.getUint8(at + 2);
    agents.push({ id: v.getUint16(at, true), target: t === HUNTS_NONE ? null : t });
  }
  return { roomMs: v.getUint32(2, true), agents };
}

/* ------------------------------------------------------------------ */
/* Voice chat: no binary type (0xB0 to 0xBF held, unused) and the JSON type
 * voice. The room relays signalling only (edge/rooms/voice.js says what
 * each op carries); the audio goes pilot to pilot (src/share/voice.js). */

export const VOICE_OPS = ['on', 'off', 'offer', 'answer', 'ice', 'turn'];
/* Voice messages a seat may send in one second (edge/rooms/voice.js), on
 * top of the clock's and the rest's (edge/rooms/core.js). */
export const VOICE_PER_S = 8;
/* An offer or answer carries every candidate gathered, a few kB; this is
 * several times the largest measured and still a small message. */
export const VOICE_SDP_MAX = 16384;
export const VOICE_CAND_MAX = 512;
/* A link's number, n, chosen by the offerer. */
export const VOICE_LINK_MAX = 0x7fffffff;
/* An offer's relay: which of the TURN relay's transports both ends add to
 * STUN for this try, none, UDP, or TCP and TLS. */
export const RELAY_NONE = 0;
export const RELAY_UDP = 1;
export const RELAY_TCP = 2;

/* Ops missions (The Interior first): no binary type (0xC0 to 0xCF held,
 * unused) and the JSON type ops. edge/rooms/ops.js says what each op
 * carries; the contract is docs/campaign/interior/CONTRACT-P0.md. */
