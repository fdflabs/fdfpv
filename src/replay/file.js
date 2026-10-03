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
 *
 * Version 3 added the smoke system (src/render/smoke.js): a column of
 * SMOKE_N floats a frame between the plant and the parts, and meta.fit,
 * the plane's hangar parts (configs/hangar-parts.js) so the replay craft
 * wears its pod, its nozzle and its prop. Versions 1 and 2 are read with
 * the smoke off and nothing fitted.
 *
 * Version 4 added the other pilots in a room (src/replay/peers.js): the
 * header's `peers` ({ slots, layout, pieces, who, tables }), then after
 * the parts the peers' columns, f32[n x slots x PEER_N], and their wreck
 * pieces, f32[pieces x PIECE_N], each frame's in slot order. A clip with
 * nobody else in it is written as version 3, byte for byte what the build
 * before wrote, so a single player replay is unchanged and still opens in
 * that build. Versions 1 to 3 are read with nobody else.
 *
 * Version 5 added combat's paper (src/replay/paper.js): the header's
 * `paper` ({ bytes, events }, the cuts' bursts and the SCHWINGs), then
 * after everything else the paper's rows, `bytes` of them, each row its
 * ribbons as paper.js packs them (a row without paper one zero byte). In
 * a version 5 file the peers are there when anybody else was drawn. A
 * clip without paper is written as it was before: version 4 with peers,
 * version 3 alone. Versions 1 to 4 are read without paper.
 *
 * Version 6 added the movie editor's edit (src/replay/edit.js): the
 * header's `edit`, the shots a clip reopens with, checked field by field
 * by checkEdit. It replaces the camera keys, so a file with an edit has
 * empty `keys`; the peers and the paper are each there when the clip has
 * them. A clip whose
 * edit is its default (one chase shot over the whole clip) is written as
 * the version before, byte for byte, and versions 1 to 5 are read with no
 * edit; their keys become one when the clip is opened (fromKeys).
 *
 * Version 6 also carries Catch the Ace's bubble (src/render/acebubble.js),
 * in the peers: their header's layout gains BUBBLE_N, and after their
 * pieces come the bubble's rows, f32[n x BUBBLE_N] (src/replay/peers.js
 * BUBBLE). A version 6 file has an edit, a bubble or both; each is
 * written only when the clip has it, so a clip with neither is still the
 * version before, byte for byte.
 *
 * Version 7 lets the paper's events carry Catch the Ace's crowns
 * (src/replay/paper.js CROWN_EVENTS: each crown's burst and each coin).
 * The layout is version 6's; a clip is written as version 7 only when its
 * paper holds one of them, so a build before this one refuses such a file
 * by its version rather than by an event it does not know, and every other
 * clip is written as before, byte for byte.
 *
 * Version 8 added the map's animation clock (src/replay/recorder.js,
 * anim): the header's `anim: true`, and a column f64[n] between the plant
 * and the smoke, each frame's clock in ms, so a saved replay draws the
 * traffic where it was when the flight was flown. Everything else is as
 * version 7 lays it out, each part there when the clip has it. A clip
 * without the clock (a test's, or one read from an older file) is written
 * as the version before, byte for byte, and versions 1 to 7 are read
 * without it, the traffic then drawn at the live clock as before.
 *
 * Version 9 lets the paper's events carry a war's explosions
 * (src/replay/paper.js BOOM_EVENTS: where each went off and how big), so
 * a replay of a war flight shows them at the moment they happened. The
 * layout is version 8's, the animation clock with it; a clip is written
 * as version 9 only when its paper holds one, so a build before this one
 * refuses such a file by its version, and every other clip is written as
 * before, byte for byte.
 *
 * Version 10 added a war's attackers (src/replay/warrec.js): the header's
 * `war` ({ agents, slots }: each scripted attacker's birth record, its
 * mission and the room ms it was last drawn, and how many hunter slots a
 * row holds), then after the paper the room ms each row was drawn at,
 * f64[n], and the hunters as drawn, f32[n x slots x HUNTER_N]. Everything
 * else is as version 9 lays it out, the animation clock with it. A clip
 * without a war is written as the version before, byte for byte.
 *
 * Version 11 added the map as the war left it (src/replay/warrec.js,
 * the owner: "i want the replays to show things as they happened"): the
 * header's war gains `world`, the journal of each match the clip spans
 * (its mission, the room ms it was first seen and stopped being fought,
 * each target hit with the room ms of its hit, null for one down before
 * this screen heard, and each power line struck with its room ms and
 * place), and after the hunters comes the room ms each row drew the map
 * at, f64[n]. A clip with a war and no map (one read from a version 10
 * file) is written as version 10, byte for byte, and a version 10 file is
 * read without a map: its replay draws the map as the live war has it,
 * as before.
 *
 * Version 12 added the flight's sound (src/replay/sound.js): the header's
 * `sound` ({ events }: each call on the shell's sound no row holds, an
 * impact, a mechanism, a cue, Crest Control's lines and the two beds), and
 * after everything else the engine's air, f32[n x AIR_N]. A clip without
 * it is written as the version before, byte for byte, and versions 1 to
 * 11 are read without it: their replay plays the sounds it always did.
 *
 * Version 13 added the room's voices as this page heard them (src/replay/
 * voicerec.js; the owner, 2026-10-02): the header's `voice` ({ pieces:
 * [{ seat, from, to, mime, bytes }], bytes each piece's length), and after
 * everything else the room ms each row was drawn at, f64[n], then each
 * piece's Opus bytes in turn. A clip without a voice is written as the
 * version before, byte for byte.
 *
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
  CAPACITY, HEAD, HEAD_N, PART_N, PARTS_MAX, PLANT_N, POSE_N, SMOKE_N,
} from './recorder.js';
import { normalisePlane } from '../../configs/hangar-parts.js';
import { RIGS, defaults } from './cameras.js';
import { EditError, checkEdit, isDefault } from './edit.js';
import { FINISHES, MAX_DECALS, checkDecal, cleanWear } from '../../configs/paint.js';
import {
  BUBBLE, BUBBLE_N, PEER, PEER_N, PEERS_MAX, PIECE_N,
} from './peers.js';
import { checkCrashTable, checkProfile } from '../share/roomwire.js';
import {
  BOOM_EVENTS, CROWN_EVENTS, checkPaper, rowsOf,
} from './paper.js';
import { HUNTER_N, checkWar } from './warrec.js';
import { AIR_N, checkSound } from './sound.js';
import { SEGMENT_BYTES_MAX, SEGMENTS_MAX, checkVoice } from './voicerec.js';

export const FILE_VERSION = 13;
/* A clip with its sound and no voice: the version before voices. */
const SOUND_VERSION = 12;
/* A clip with a war's map and no sound: the version before the sound. */
const MAP_VERSION = 11;
/* A clip with a war's attackers and no map: the version before the map. */
const WAR_VERSION = 10;
/* A clip with explosions and no war's attackers: the version before
 * them. */
const BOOM_VERSION = 9;
/* A clip with the animation clock and no explosion: the version before
 * explosions. */
const ANIM_VERSION = 8;
/* A clip with a crown and no animation clock: the version before the
 * clock. */
const CROWN_VERSION = 7;
/* A clip with an edit of its own or a bubble, and no crown: the version
 * before crowns. */
const EDIT_VERSION = 6;
/* A clip with no edit of its own and no bubble, with paper: the version
 * before those. */
const PAPER_VERSION = 5;
/* A clip without paper: the version before paper, unchanged. */
const PEERS_VERSION = 4;
/* A clip with nobody else in it: the version before peers, unchanged. */
const SOLO_VERSION = 3;
/* Every version this build reads, the current one last. */
const READS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
/* The version a clip is written as: the lowest that holds what it has. */
function versionFor(clip) {
  if (clip.voice) {
    if (!clip.anim) {
      throw new Error('a clip with voices and no animation clock');
    }
    return FILE_VERSION;
  }
  if (clip.sound) {
    if (!clip.anim) {
      throw new Error('a clip with its sound and no animation clock');
    }
    return SOUND_VERSION;
  }
  if (clip.war) {
    if (!clip.anim) {
      throw new Error('a clip with a war and no animation clock');
    }
    return clip.war.world ? MAP_VERSION : WAR_VERSION;
  }
  if (clip.paper && boomed(clip.paper.events)) {
    if (!clip.anim) {
      throw new Error('a clip with explosions and no animation clock');
    }
    return BOOM_VERSION;
  }
  if (clip.anim) {
    return ANIM_VERSION;
  }
  if (clip.paper && crowned(clip.paper.events)) {
    return CROWN_VERSION;
  }
  if (realEdit(clip) || bubbleOf(clip)) {
    return EDIT_VERSION;
  }
  if (clip.paper) {
    return PAPER_VERSION;
  }
  return clip.peers ? PEERS_VERSION : SOLO_VERSION;
}

/* Whether a clip has an edit of its own, not the default one. */
function realEdit(clip) {
  return Boolean(clip.edit) && !isDefault(clip.edit, clip.time[clip.n - 1], defaultCam(clip.meta.size));
}

/* Whether a clip's paper events hold a Catch the Ace crown or coin. */
function crowned(events) {
  return events.some((e) => e && CROWN_EVENTS.includes(e.type));
}

/* Whether a clip's paper events hold a war's explosion. */
function boomed(events) {
  return events.some((e) => e && BOOM_EVENTS.includes(e.type));
}

/* A clip's bubble column, or null. */
function bubbleOf(clip) {
  return (clip.peers && clip.peers.bubble) || null;
}

/* The camera a clip opens with when nothing says otherwise. */
function defaultCam(size) {
  return {
    rig: 'chase', target: -1, watch: 0, p: defaults('chase', size),
  };
}

/* The columns a version holds, as its header's layout says them. */
function layoutOf(version) {
  const base = [HEAD_N, POSE_N, PLANT_N, PART_N, PARTS_MAX];
  return version >= 3 ? [...base, SMOKE_N] : base;
}

/* The smoke column's bytes: none before version 3. */
function smokeBytes(n, version) {
  return version >= 3 ? n * SMOKE_N * 4 : 0;
}

/* The peers' column layout: with the bubble's rows, or without. */
function peersLayout(bubble) {
  return bubble ? [PEER_N, PIECE_N, BUBBLE_N] : [PEER_N, PIECE_N];
}

/* The animation clock's bytes: none before version 8. */
function animBytes(n, version) {
  return version >= 8 ? n * 8 : 0;
}

/* The pose column's bytes with its padding to 8. */
function poseBytes(n) {
  const b = n * POSE_N * 4;
  return b + ((8 - (b % 8)) % 8);
}
/* The largest file read. A clip of a full public room at its fullest is
 * the most there can be: 30 s at 120 Hz of this pilot (about 1.2 MB),
 * sixteen others and their wrecks (10.1 MB) and sixteen streamers of a
 * hundred links each (18.3 MB), about 30 MB; the cap leaves room over it
 * and still refuses anything much bigger than a replay can be. */
export const FILE_MAX_BYTES = 40 * 1024 * 1024;
export const FILE_EXT = '.fdfreplay';
const MAGIC = [0x46, 0x44, 0x46, 0x52];
const ENDIAN_PROBE = 1.5;
export const NAME_MAX = 60;

const HEADER_KEYS = ['v', 'n', 'layout', 'probe', 'meta', 'events', 'spawns', 'keys', 'peers', 'paper', 'edit', 'anim', 'war', 'sound', 'voice'];
const SOUND_KEYS = ['events'];
const VOICE_KEYS = ['pieces'];
const PIECE_KEYS = ['seat', 'from', 'to', 'mime', 'bytes'];
const WAR_KEYS = ['agents', 'slots', 'world'];
const PAPER_KEYS = ['bytes', 'events'];
const PEERS_KEYS = ['slots', 'layout', 'pieces', 'who', 'tables'];
const WHO_KEYS = ['seat', 'label', 'profile', 'figure'];
const FIGURE_KEYS = ['at', 'yaw'];
/* Profiles and part tables a clip may name: every join and every crash in
 * 30 s of a full public room, with room to spare. */
const WHO_MAX = 64;
const TABLES_MAX = 64;
const META_KEYS = ['name', 'created', 'airframe', 'livery', 'paint', 'map', 'scale', 'size', 'parts', 'fpv', 'duration', 'fit'];
const PAINT_KEYS = ['finishes', 'decals', 'wear'];
const FIT_KEYS = ['entry', 'option'];
const PART_KEYS = ['kind', 'kindName', 'parent', 'material', 'cg', 'boxMin', 'boxMax'];
const EVENT_KEYS = ['t', 'type', 'part', 'label', 'kind', 'point', 'normal', 'speed', 'surface', 'shed', 'floorY', 'level'];
const EVENT_TYPES = ['off', 'impact', 'debris', 'cue'];
const KEY_KEYS = ['t', 'rig', 'target', 'p'];
const P_KEYS = ['dist', 'height', 'fov', 'az', 'el', 'pos', 'yaw', 'pitch'];
const FPV_KEYS = ['fwd', 'up', 'tilt', 'fov'];

/* ---- write ---- */

export function encodeReplay(clip) {
  const n = clip.n;
  const peers = clip.peers || null;
  const paper = clip.paper || null;
  const version = versionFor(clip);
  const pieceCount = peers ? peers.pieceAt[n] : 0;
  const head = clip.head.slice(0, n * HEAD_N);
  let partRows = 0;
  for (let k = 0; k < n; k += 1) {
    head[k * HEAD_N + HEAD.markSeg] = 0;
    head[k * HEAD_N + HEAD.markPos] = 0;
    partRows += head[k * HEAD_N + HEAD.parts];
  }
  const header = {
    v: version,
    n,
    layout: layoutOf(version),
    probe: ENDIAN_PROBE,
    meta: clip.meta,
    events: clip.events,
    spawns: clip.spawns,
    /* A clip with an edit has had its keys turned into it: writing them
     * too would bring back a camera the pilot has since cut away. */
    keys: clip.edit ? [] : clip.keys || [],
  };
  if (peers) {
    header.peers = {
      slots: peers.slots, layout: peersLayout(bubbleOf(clip)), pieces: pieceCount, who: peers.who, tables: peers.tables,
    };
  }
  if (paper) {
    header.paper = { bytes: paper.bytes.byteLength, events: paper.events };
  }
  if (realEdit(clip)) {
    /* Checked on the way out as on the way in, so an edit that does not
     * fit its clip (one not trimmed with it, say) fails the save rather
     * than making a file that will not open. */
    header.edit = checkedEdit(clip.edit, clip.time[n - 1], peers);
  }
  if (clip.anim) {
    header.anim = true;
  }
  const war = clip.war || null;
  if (war) {
    header.war = { agents: war.agents, slots: war.slots, ...(war.world ? { world: war.world } : {}) };
  }
  if (clip.sound) {
    header.sound = { events: clip.sound.events };
  }
  if (clip.voice) {
    header.voice = {
      pieces: clip.voice.pieces.map((s) => ({
        seat: s.seat, from: s.from, to: s.to, mime: s.mime, bytes: s.bytes.length,
      })),
    };
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const pre = 12 + json.length;
  const pad = (8 - (pre % 8)) % 8;
  const bytes = pre + pad + n * 8 + n * HEAD_N * 8 + poseBytes(n) + n * PLANT_N * 8 + animBytes(n, version) + smokeBytes(n, version)
    + partRows * PART_N * 4 + (peers ? (n * peers.slots * PEER_N + pieceCount * PIECE_N) * 4 : 0)
    + (bubbleOf(clip) ? n * BUBBLE_N * 4 : 0)
    + (paper ? paper.bytes.byteLength : 0)
    + (war ? n * 8 + n * war.slots * HUNTER_N * 4 + (war.world ? n * 8 : 0) : 0)
    + (clip.sound ? n * AIR_N * 4 : 0)
    + (clip.voice ? n * 8 + clip.voice.pieces.reduce((x, s) => x + s.bytes.length, 0) : 0);
  const buf = new ArrayBuffer(bytes);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  u8.set(MAGIC, 0);
  dv.setUint32(4, version, true);
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
  if (clip.anim) {
    new Float64Array(buf, o, n).set(clip.anim.subarray(0, n));
  }
  o += animBytes(n, version);
  new Float32Array(buf, o, n * SMOKE_N).set(clip.smoke.subarray(0, n * SMOKE_N));
  o += smokeBytes(n, version);
  const parts = new Float32Array(buf, o, partRows * PART_N);
  let w = 0;
  for (let k = 0; k < n; k += 1) {
    const np = head[k * HEAD_N + HEAD.parts];
    const from = k * PARTS_MAX * PART_N;
    parts.set(clip.parts.subarray(from, from + np * PART_N), w);
    w += np * PART_N;
  }
  o += partRows * PART_N * 4;
  if (peers) {
    new Float32Array(buf, o, n * peers.slots * PEER_N).set(peers.cols.subarray(0, n * peers.slots * PEER_N));
    o += n * peers.slots * PEER_N * 4;
    new Float32Array(buf, o, pieceCount * PIECE_N).set(peers.pieces.subarray(0, pieceCount * PIECE_N));
    o += pieceCount * PIECE_N * 4;
  }
  if (bubbleOf(clip)) {
    new Float32Array(buf, o, n * BUBBLE_N).set(peers.bubble.subarray(0, n * BUBBLE_N));
    o += n * BUBBLE_N * 4;
  }
  if (paper) {
    u8.set(paper.bytes, o);
    o += paper.bytes.byteLength;
  }
  if (war) {
    u8.set(new Uint8Array(war.room.buffer, war.room.byteOffset, n * 8), o);
    o += n * 8;
    u8.set(new Uint8Array(war.hunters.buffer, war.hunters.byteOffset, n * war.slots * HUNTER_N * 4), o);
    o += n * war.slots * HUNTER_N * 4;
    if (war.world) {
      u8.set(new Uint8Array(war.clock.buffer, war.clock.byteOffset, n * 8), o);
      o += n * 8;
    }
  }
  if (clip.sound) {
    u8.set(new Uint8Array(clip.sound.air.buffer, clip.sound.air.byteOffset, n * AIR_N * 4), o);
    o += n * AIR_N * 4;
  }
  if (clip.voice) {
    u8.set(new Uint8Array(clip.voice.clock.buffer, clip.voice.clock.byteOffset, n * 8), o);
    o += n * 8;
    for (const s of clip.voice.pieces) {
      u8.set(s.bytes, o);
      o += s.bytes.length;
    }
  }
  return buf;
}

/* ---- read ---- */

/* What a refusal throws: its message is for the log, in English; the
 * screen says it in the pilot's language (src/replay/crashcam.js). `map`
 * is the map a clip names when that map is what was refused, so the screen
 * can say a retired world by name rather than "not a replay". */
class ReplayFileError extends Error {
  constructor(message, map = null, airframe = null) {
    super(message);
    this.map = map;
    this.airframe = airframe;
  }
}

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
      if (!/^[a-z][a-zA-Z0-9_]{0,23}$/.test(k) || !Number.isInteger(v) || v < 0 || v > 0xffffff) {
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
    /* The wear, a fraction as the renderer takes it; optional too. */
    if (m.paint.wear !== undefined && cleanWear(m.paint.wear * 100) === null) {
      throw new ReplayFileError('meta.paint.wear is not a wear');
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
  if (m.fit !== undefined && m.fit !== null) {
    onlyKeys(m.fit, FIT_KEYS, 'meta.fit');
    if (m.fit.option !== null) {
      text(m.fit.option, 40, 'meta.fit.option');
    }
    /* What the hangar would seat from the same entry: unknown props and
     * add-ons fall away, so nothing the file says reaches the model raw. */
    m.fit.entry = normalisePlane(m.airframe, m.fit.entry);
  }
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
  const layout = layoutOf(version);
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
    throw new ReplayFileError('its aircraft is not one this build flies', null, header.meta.airframe);
  }
  if (known && !known.map(header.meta.map)) {
    throw new ReplayFileError('its map is not one this build has', header.meta.map);
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
  if (version < 4 && header.peers !== undefined) {
    throw new ReplayFileError('peers in a file older than version 4');
  }
  if (version === 4 && header.peers === undefined) {
    throw new ReplayFileError('a version 4 file without its peers');
  }
  if (version === 5 && header.paper === undefined) {
    throw new ReplayFileError('a version 5 file without its paper');
  }
  if (version < 5 && header.paper !== undefined) {
    throw new ReplayFileError('paper in a file older than version 5');
  }
  const bubbled = Boolean(header.peers && Array.isArray(header.peers.layout) && header.peers.layout.length === 3);
  if (version < 6 && (header.edit !== undefined || bubbled)) {
    throw new ReplayFileError(header.edit !== undefined ? 'an edit in a file older than version 6' : 'a bubble in a file older than version 6');
  }
  if (version === 6 && header.edit === undefined && !bubbled) {
    throw new ReplayFileError('a version 6 file without its edit or a bubble');
  }
  const crowns = header.paper !== undefined && Array.isArray(header.paper.events) && crowned(header.paper.events);
  if (version < 7 && crowns) {
    throw new ReplayFileError('a crown in a file older than version 7');
  }
  if (version === 7 && !crowns) {
    throw new ReplayFileError('a version 7 file without a crown');
  }
  if (version < 8 && header.anim !== undefined) {
    throw new ReplayFileError('an animation clock in a file older than version 8');
  }
  if (version >= 8 && header.anim !== true) {
    throw new ReplayFileError(`a version ${version} file without its animation clock`);
  }
  const booms = header.paper !== undefined && Array.isArray(header.paper.events) && boomed(header.paper.events);
  if (version < 9 && booms) {
    throw new ReplayFileError('an explosion in a file older than version 9');
  }
  if (version === 9 && !booms) {
    throw new ReplayFileError('a version 9 file without an explosion');
  }
  if (version < 10 && header.war !== undefined) {
    throw new ReplayFileError('a war in a file older than version 10');
  }
  if ((version === 10 || version === 11) && header.war === undefined) {
    throw new ReplayFileError(`a version ${version} file without its war`);
  }
  const mapped = header.war !== undefined && header.war !== null && typeof header.war === 'object' && header.war.world !== undefined;
  if (version < 11 && mapped) {
    throw new ReplayFileError('a war\'s map in a file older than version 11');
  }
  if (version === 11 && !mapped) {
    throw new ReplayFileError('a version 11 file without its war\'s map');
  }
  if (version < 12 && header.sound !== undefined) {
    throw new ReplayFileError('a sound in a file older than version 12');
  }
  if (version === 12 && header.sound === undefined) {
    throw new ReplayFileError('a version 12 file without its sound');
  }
  if (header.sound !== undefined) {
    onlyKeys(header.sound, SOUND_KEYS, 'sound');
  }
  if (version < 13 && header.voice !== undefined) {
    throw new ReplayFileError('voices in a file older than version 13');
  }
  if (version === 13 && header.voice === undefined) {
    throw new ReplayFileError('a version 13 file without its voices');
  }
  let voiceBytes = 0;
  if (header.voice !== undefined) {
    onlyKeys(header.voice, VOICE_KEYS, 'voice');
    if (!Array.isArray(header.voice.pieces) || header.voice.pieces.length > SEGMENTS_MAX) {
      throw new ReplayFileError('voice.pieces is not a list');
    }
    for (const s of header.voice.pieces) {
      onlyKeys(s, PIECE_KEYS, 'voice.pieces');
      if (!Number.isInteger(s.bytes) || s.bytes < 1 || s.bytes > SEGMENT_BYTES_MAX) {
        throw new ReplayFileError('a voice\'s length is out of range');
      }
      voiceBytes += s.bytes;
    }
    voiceBytes += n * 8;
  }
  if (header.war !== undefined) {
    onlyKeys(header.war, WAR_KEYS, 'war');
    if (!Number.isInteger(header.war.slots) || header.war.slots < 0 || header.war.slots > 64) {
      throw new ReplayFileError('war.slots is out of range');
    }
  }
  if (header.edit !== undefined && header.keys.length) {
    throw new ReplayFileError('a version 6 file with camera keys');
  }
  if (header.paper !== undefined) {
    onlyKeys(header.paper, PAPER_KEYS, 'paper');
    if (!Number.isInteger(header.paper.bytes) || header.paper.bytes < n || header.paper.bytes > FILE_MAX_BYTES) {
      throw new ReplayFileError('paper.bytes is out of range');
    }
  }
  if (header.peers !== undefined) {
    checkPeersHeader(header.peers, header.meta.map, bubbled);
  }

  const pre = 12 + hl;
  let o = pre + ((8 - (pre % 8)) % 8);
  const fixed = n * 8 + n * HEAD_N * 8 + poseBytes(n) + n * PLANT_N * 8 + animBytes(n, version) + smokeBytes(n, version);
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
  const anim = version >= 8 ? new Float64Array(buf.slice(o, o + animBytes(n, version))) : null;
  o += animBytes(n, version);
  const smoke = version >= 3 ? new Float32Array(buf.slice(o, o + smokeBytes(n, version))) : new Float32Array(n * SMOKE_N);
  o += smokeBytes(n, version);
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
  const P = header.peers;
  const bubbleBytes = bubbled ? n * BUBBLE_N * 4 : 0;
  const peerBytes = P ? (n * P.slots * PEER_N + P.pieces * PIECE_N) * 4 + bubbleBytes : 0;
  const paperBytes = header.paper ? header.paper.bytes : 0;
  const hunterBytes = header.war ? n * header.war.slots * HUNTER_N * 4 : 0;
  const warBytes = header.war ? n * 8 + hunterBytes + (mapped ? n * 8 : 0) : 0;
  const soundBytes = header.sound !== undefined ? n * AIR_N * 4 : 0;
  if (o + rows * PART_N * 4 + peerBytes + paperBytes + warBytes + soundBytes + voiceBytes !== buf.byteLength) {
    throw new ReplayFileError('the file is not the length its header says');
  }
  for (const col of [time, head, pose, plant, smoke, ...(anim ? [anim] : [])]) {
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
  o += rows * PART_N * 4;
  const clip = {
    n, time, head, pose, plant, parts, smoke,
    events: header.events, spawns: header.spawns, keys: header.keys, meta: header.meta,
  };
  if (anim) {
    clip.anim = anim;
  }
  if (header.edit !== undefined) {
    clip.edit = checkedEdit(header.edit, time[n - 1], P);
  }
  if (P) {
    const cols = new Float32Array(buf.slice(o, o + n * P.slots * PEER_N * 4));
    o += n * P.slots * PEER_N * 4;
    const pieces = new Float32Array(buf.slice(o, o + P.pieces * PIECE_N * 4));
    clip.peers = {
      slots: P.slots, cols, pieceAt: checkPeerColumns(cols, pieces, n, P), pieces, who: P.who, tables: P.tables,
    };
    o += P.pieces * PIECE_N * 4;
    if (bubbleBytes) {
      clip.peers.bubble = checkBubble(new Float32Array(buf.slice(o, o + bubbleBytes)));
      o += bubbleBytes;
    }
  }
  if (header.paper) {
    const bytes = new Uint8Array(buf.slice(o, o + paperBytes));
    try {
      const paper = { bytes, rowAt: rowsOf(bytes, n), events: header.paper.events };
      checkPaper(paper, n);
      clip.paper = paper;
    } catch (err) {
      throw new ReplayFileError(err.message);
    }
    o += paperBytes;
  }
  if (header.war) {
    const war = {
      agents: header.war.agents,
      room: new Float64Array(buf.slice(o, o + n * 8)),
      slots: header.war.slots,
      hunters: new Float32Array(buf.slice(o + n * 8, o + n * 8 + hunterBytes)),
    };
    if (mapped) {
      war.world = header.war.world;
      war.clock = new Float64Array(buf.slice(o + n * 8 + hunterBytes, o + warBytes));
    }
    try {
      checkWar(war, n);
    } catch (err) {
      throw new ReplayFileError(err.message);
    }
    clip.war = war;
    o += warBytes;
  }
  if (header.sound) {
    const sound = { air: new Float32Array(buf.slice(o, o + soundBytes)), events: header.sound.events };
    try {
      checkSound(sound, n);
    } catch (err) {
      throw new ReplayFileError(err.message);
    }
    clip.sound = sound;
    o += soundBytes;
  }
  if (header.voice) {
    const clock = new Float64Array(buf.slice(o, o + n * 8));
    o += n * 8;
    const pieces = header.voice.pieces.map((s) => {
      const bytes = new Uint8Array(buf.slice(o, o + s.bytes));
      o += s.bytes;
      return {
        seat: s.seat, from: s.from, to: s.to, mime: s.mime, bytes,
      };
    });
    try {
      checkVoice({ clock, pieces }, n);
    } catch (err) {
      throw new ReplayFileError(err.message);
    }
    clip.voice = { clock, pieces };
  }
  return clip;
}

/* An edit checked against its clip's length and pilots (src/replay/edit.js),
 * its refusal a file's refusal. */
function checkedEdit(edit, duration, peers) {
  try {
    return checkEdit(edit, { duration, peers: peers ? peers.who.length : 0 });
  } catch (err) {
    if (!(err instanceof EditError)) {
      throw err;
    }
    throw new ReplayFileError(err.message);
  }
}

/* The peers' header: who they were and the tables their wrecks were cut
 * by, each checked as the room checks it (src/share/roomwire.js). */
function checkPeersHeader(P, map, bubbled) {
  onlyKeys(P, PEERS_KEYS, 'peers');
  if (!Number.isInteger(P.slots) || P.slots < 1 || P.slots > PEERS_MAX) {
    throw new ReplayFileError('peers.slots is out of range');
  }
  if (!Array.isArray(P.layout) || P.layout.join() !== peersLayout(bubbled).join()) {
    throw new ReplayFileError('the peers\' column layout does not match this build');
  }
  if (!Number.isInteger(P.pieces) || P.pieces < 0 || P.pieces > CAPACITY * PEERS_MAX * PARTS_MAX) {
    throw new ReplayFileError('peers.pieces is out of range');
  }
  if (!Array.isArray(P.who) || P.who.length < 1 || P.who.length > WHO_MAX) {
    throw new ReplayFileError('peers.who is not a list');
  }
  P.who.forEach((w, i) => {
    onlyKeys(w, WHO_KEYS, `peers.who[${i}]`);
    if (!Number.isInteger(w.seat) || w.seat < 1 || w.seat > 64) {
      throw new ReplayFileError(`peers.who[${i}].seat is not a seat`);
    }
    text(w.label, 40, `peers.who[${i}].label`);
    /* The profile as a room would relay it, flown in this clip's world;
     * its paint and parts are normalised again when it is drawn. */
    const profile = checkProfile(w.profile);
    if (!profile || profile.map !== map) {
      throw new ReplayFileError(`peers.who[${i}].profile is not a profile`);
    }
    w.profile = profile;
    if (w.figure !== null) {
      onlyKeys(w.figure, FIGURE_KEYS, `peers.who[${i}].figure`);
      vec(w.figure.at, 3, `peers.who[${i}].figure.at`);
      finite(w.figure.yaw, `peers.who[${i}].figure.yaw`);
    }
  });
  if (!Array.isArray(P.tables) || P.tables.length > TABLES_MAX) {
    throw new ReplayFileError('peers.tables is not a list');
  }
  P.tables = P.tables.map((t, i) => {
    const table = checkCrashTable(t);
    if (!table) {
      throw new ReplayFileError(`peers.tables[${i}] is not a part table`);
    }
    return table;
  });
}

/* The Ace's bubble, row by row: nothing, or a sphere no bigger than a
 * room could draw, at a finite place, a level the pulse gives and a seat.
 * Returns the column. */
function checkBubble(bubble) {
  for (let o = 0; o < bubble.length; o += BUBBLE_N) {
    const r = bubble[o + BUBBLE.r];
    const level = bubble[o + BUBBLE.level];
    const seat = bubble[o + BUBBLE.seat];
    const at = [0, 1, 2].map((i) => bubble[o + BUBBLE.pos + i]);
    if (!(r >= 0 && r <= 50) || !at.every(Number.isFinite) || !(level >= 0 && level <= 2) || !Number.isInteger(seat) || seat < 0 || seat > 64) {
      throw new ReplayFileError(`frame ${o / BUBBLE_N} has a bad bubble`);
    }
  }
  return bubble;
}

/* The peers' columns against their header: every id a profile, every
 * table one of the tables, every piece a part of it, each frame's pieces
 * where the slots before them end. Returns each frame's first piece. */
function checkPeerColumns(cols, pieces, n, P) {
  for (let i = 0; i < cols.length; i += 1) {
    if (!Number.isFinite(cols[i])) {
      throw new ReplayFileError('a peer column holds a value that is not a number');
    }
  }
  for (let i = 0; i < pieces.length; i += 1) {
    if (!Number.isFinite(pieces[i])) {
      throw new ReplayFileError('a peer piece holds a value that is not a number');
    }
  }
  const pieceAt = new Uint32Array(n + 1);
  let w = 0;
  for (let k = 0; k < n; k += 1) {
    pieceAt[k] = w;
    for (let s = 0; s < P.slots; s += 1) {
      const o = (k * P.slots + s) * PEER_N;
      const id = cols[o + PEER.id];
      if (!Number.isInteger(id) || id < 0 || id > P.who.length) {
        throw new ReplayFileError(`frame ${k} names a peer that is not in the file`);
      }
      const table = cols[o + PEER.table];
      const np = cols[o + PEER.pieces];
      if (!id) {
        if (np !== 0) {
          throw new ReplayFileError(`frame ${k} has pieces for nobody`);
        }
        continue;
      }
      if (!Number.isInteger(table) || table < -1 || table >= P.tables.length) {
        throw new ReplayFileError(`frame ${k} names a part table that is not in the file`);
      }
      const parts = table >= 0 ? P.tables[table].length : 0;
      if (!Number.isInteger(np) || np < 0 || np > Math.max(0, parts - 1) || cols[o + PEER.at] !== w - pieceAt[k]) {
        throw new ReplayFileError(`frame ${k} has a bad piece count`);
      }
      for (let j = 0; j < np; j += 1) {
        const part = pieces[(w + j) * PIECE_N];
        if (w + j >= P.pieces || !Number.isInteger(part) || part < 1 || part >= parts) {
          throw new ReplayFileError(`frame ${k} has a piece that is not a part`);
        }
      }
      w += np;
    }
  }
  if (w !== P.pieces) {
    throw new ReplayFileError('the peers\' pieces are not the count the header says');
  }
  pieceAt[n] = w;
  return pieceAt;
}

export { ReplayFileError };
