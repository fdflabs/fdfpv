/*
 * peers.js: the other pilots in a room, in the crash cam's recording.
 *
 * The owner's report: "I was flying slalom with a friend, then I crashed,
 * but in the replay of the video I only see my plane and not my friend's."
 * The recorder (src/replay/recorder.js) keeps the local craft; this keeps
 * everyone else a room drew (src/main.js roomDrawPeer), in the same rows,
 * so a replay puts them back where the screen had them.
 *
 * PER ROW, PER PEER DRAWN: what the frame drew, read off the drawing and
 * never worked out again. The aircraft's pose as posed (after the room's
 * interpolation or extrapolation, src/game/peer.js), the moving parts from
 * the sample it was posed with (surfaces or rotors, the motor, the flaps,
 * the flags for gear, chute and smoke), the retracts where they stood, the
 * velocity (the chute's direction and the trail's drift), the smoke
 * nozzle while it trailed, and its shared wreck (src/share/roomwrecks.js):
 * which part table it is cut by and each piece that has left, at the pose
 * drawn. ONCE PER PEER: who it is, as a profile the room relayed (its
 * airframe, paint, parts, pilot figure), its name tag as drawn, and where
 * its pilot figure stood.
 *
 * A peer is an id, made the first time its drawn aircraft is seen: a new
 * pilot in a seat, or a pilot whose airframe, paint or add ons changed,
 * is drawn by a new model live, and is a new id here. Each id keeps one
 * slot of the row while it is drawn in consecutive rows, so a replay can
 * interpolate it between rows; a join or a leave is a slot starting or
 * ending, and a replay never blends two ids.
 *
 * MEMORY. Nothing is allocated until a room draws its first peer, so a
 * single player flight costs nothing and records exactly what it did.
 * Then the columns are made once, for PEERS_MAX peers and PIECES_MAX
 * pieces a row over the recorder's CAPACITY rows (RING_BYTES), and a row
 * costs a zeroing and a few stores per peer, no allocation. More than
 * PEERS_MAX peers drawn, or more pieces than PIECES_MAX in one row, are
 * not kept, and counted (stats), never silently.
 *
 * A clip's `peers` is the same cut to its rows and the slots it used:
 * { slots, cols, pieceAt, pieces, who, tables }, or absent when nobody
 * else was drawn. src/replay/file.js saves it; src/replay/peerscene.js
 * draws it.
 *
 * Render only. Nothing here reaches a plant.
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

import { PART_STATE_DOUBLES, PARTS_MAX, STATE } from '../../configs/parts.js';
import { slerp } from './recorder.js';

/* A public room seats 16 (src/share/roomwire.js PUBLIC_CAP), 15 others. */
export const PEERS_MAX = 16;
/* Per peer per row, floats. id is 0 for an empty slot; table is the index
 * of the wreck's part table, -1 for none; pieces how many of the row's
 * pieces are this peer's and `at` where they start among them. */
export const PEER = {
  id: 0, pos: 1, quat: 4, ctl: 8, motor: 12, flaps: 13, gear: 14, flags: 15, vel: 16, smoke: 19, nozzle: 20,
  table: 23, pieces: 24, at: 25,
};
export const PEER_N = 26;
/* Per piece, floats: its part, then its pose as the plant's part state
 * has it, world: x, y, z, qw, qx, qy, qz. */
export const PIECE_N = 8;
export const PIECES_MAX = 64;
const ROW_N = PEERS_MAX * PEER_N;
/* The bytes a row costs once the columns are made, and the ring's. */
export const ROW_BYTES = ROW_N * 4 + PIECES_MAX * PIECE_N * 4;

/*
 * The recorder's companion: rows by the recorder's own index. begin(i)
 * once per row the recorder wrote (i < 0 when it wrote none), then add()
 * for each peer the frame drew, after the room has drawn them.
 */
export function createPeerRing(capacity) {
  let cols = null;
  let pool = null;
  let row = -1;
  let used = 0;
  let nextId = 1;
  const ids = new WeakMap(); /* a drawn model -> its id */
  const who = new Map(); /* id -> { seat, label, profile, figure } */
  let nextTable = 0;
  const tableIds = new WeakMap(); /* a received part table -> its index */
  const tables = new Map(); /* index -> table */
  /* The ids each slot held in the row before, and holds in this one. */
  const before = new Int32Array(PEERS_MAX);
  const now = new Int32Array(PEERS_MAX);
  const stats = { rows: 0, peers: 0, dropped: 0, piecesDropped: 0 };

  function begin(i) {
    row = i;
    if (i < 0) {
      return;
    }
    before.set(now);
    now.fill(0);
    used = 0;
    if (cols) {
      cols.fill(0, i * ROW_N, (i + 1) * ROW_N);
    }
  }

  function slotFor(id) {
    for (let s = 0; s < PEERS_MAX; s += 1) {
      if (before[s] === id && now[s] === 0) {
        return s;
      }
    }
    /* A slot nobody had in the row before, then any not taken yet. */
    for (let s = 0; s < PEERS_MAX; s += 1) {
      if (before[s] === 0 && now[s] === 0) {
        return s;
      }
    }
    for (let s = 0; s < PEERS_MAX; s += 1) {
      if (now[s] === 0) {
        return s;
      }
    }
    return -1;
  }

  function tableIndex(table) {
    let t = tableIds.get(table);
    if (t === undefined) {
      if (tables.size >= 64) {
        prune();
      }
      t = nextTable;
      nextTable += 1;
      tableIds.set(table, t);
      tables.set(t, table.map((p) => ({
        kind: p.kind, parent: p.parent, cg: p.cg.slice(), boxMin: p.boxMin.slice(), boxMax: p.boxMax.slice(),
      })));
    }
    return t;
  }

  /* Forget the profiles and tables no row still names. */
  function prune() {
    const idsLive = new Set();
    const tablesLive = new Set();
    for (let o = 0; cols && o < cols.length; o += PEER_N) {
      if (cols[o + PEER.id]) {
        idsLive.add(cols[o + PEER.id]);
        tablesLive.add(cols[o + PEER.table]);
      }
    }
    for (const id of [...who.keys()]) {
      if (!idsLive.has(id)) {
        who.delete(id);
      }
    }
    for (const t of [...tables.keys()]) {
      if (!tablesLive.has(t)) {
        tables.delete(t);
      }
    }
  }

  /*
   * One peer as this frame drew it: src/main.js's record, { seat, profile,
   * rig (src/render/peers.js buildPeerCraft), last (the pose sample it was
   * posed with), wreck (createPeerWreck) and wreckTable, figure }.
   */
  function add(peer) {
    const rig = peer.rig;
    if (row < 0 || !rig || !rig.group.visible || !peer.last) {
      return;
    }
    if (!cols) {
      cols = new Float32Array(capacity * ROW_N);
      pool = new Float32Array(capacity * PIECES_MAX * PIECE_N);
    }
    let id = ids.get(rig);
    if (id === undefined) {
      if (who.size >= 128) {
        prune();
      }
      id = nextId;
      nextId += 1;
      ids.set(rig, id);
      const f = peer.figure;
      who.set(id, {
        seat: peer.seat,
        label: rig.label(),
        profile: JSON.parse(JSON.stringify(peer.profile)),
        figure: f ? { at: f.group.position.toArray(), yaw: f.group.rotation.y } : null,
      });
    } else {
      /* A name tag that changes (a mute, the Ace) keeps the last one. */
      const w = who.get(id);
      if (w) {
        w.label = rig.label();
      }
    }
    const s = slotFor(id);
    if (s < 0) {
      stats.dropped += 1;
      return;
    }
    now[s] = id;
    stats.peers += 1;
    const o = (row * PEERS_MAX + s) * PEER_N;
    const p = rig.group.position;
    const q = rig.group.quaternion;
    const l = peer.last;
    cols[o + PEER.id] = id;
    cols[o + PEER.pos] = p.x;
    cols[o + PEER.pos + 1] = p.y;
    cols[o + PEER.pos + 2] = p.z;
    cols[o + PEER.quat] = q.x;
    cols[o + PEER.quat + 1] = q.y;
    cols[o + PEER.quat + 2] = q.z;
    cols[o + PEER.quat + 3] = q.w;
    cols[o + PEER.ctl] = l.c0;
    cols[o + PEER.ctl + 1] = l.c1;
    cols[o + PEER.ctl + 2] = l.c2;
    cols[o + PEER.ctl + 3] = l.c3;
    cols[o + PEER.motor] = l.motor;
    cols[o + PEER.flaps] = l.flaps;
    cols[o + PEER.gear] = rig.gear();
    cols[o + PEER.flags] = l.flags;
    cols[o + PEER.vel] = l.vx;
    cols[o + PEER.vel + 1] = l.vy;
    cols[o + PEER.vel + 2] = l.vz;
    const nz = rig.smokeAt();
    if (nz) {
      cols[o + PEER.smoke] = 1;
      cols[o + PEER.nozzle] = nz.x;
      cols[o + PEER.nozzle + 1] = nz.y;
      cols[o + PEER.nozzle + 2] = nz.z;
    }
    cols[o + PEER.table] = -1;
    cols[o + PEER.at] = used;
    if (!peer.wreck || !peer.wreckTable) {
      return;
    }
    cols[o + PEER.table] = tableIndex(peer.wreckTable);
    const st = peer.wreck.drawn();
    const count = Math.min(peer.wreck.count(), PARTS_MAX);
    if (!st) {
      return;
    }
    let n = 0;
    for (let i = 1; i < count; i += 1) {
      const w = i * PART_STATE_DOUBLES;
      if (st[w + STATE.status] === 0) {
        continue;
      }
      if (used >= PIECES_MAX) {
        stats.piecesDropped += 1;
        continue;
      }
      const b = (row * PIECES_MAX + used) * PIECE_N;
      pool[b] = i;
      for (let j = 0; j < 3; j += 1) {
        pool[b + 1 + j] = st[w + STATE.pos + j];
      }
      for (let j = 0; j < 4; j += 1) {
        pool[b + 4 + j] = st[w + STATE.quat + j];
      }
      used += 1;
      n += 1;
    }
    cols[o + PEER.pieces] = n;
  }

  /* The ring after the recorder's clear(): nobody carries on in a slot. */
  function clear() {
    before.fill(0);
    now.fill(0);
    row = -1;
  }

  /*
   * The rows the recorder cut for a clip, `n` of them from ring index
   * `first`, as a clip's peers, or null when none of them drew anybody.
   * Ids and tables are renumbered from the clip's own lists: an id is its
   * index in `who` plus one.
   */
  function clip(first, n) {
    if (!cols || n === 0) {
      return null;
    }
    let slots = 0;
    let total = 0;
    const idMap = new Map();
    const tMap = new Map();
    for (let k = 0; k < n; k += 1) {
      const r = (first + k) % capacity;
      for (let s = 0; s < PEERS_MAX; s += 1) {
        const o = (r * PEERS_MAX + s) * PEER_N;
        const id = cols[o + PEER.id];
        if (!id || !who.has(id)) {
          continue;
        }
        slots = Math.max(slots, s + 1);
        if (!idMap.has(id)) {
          idMap.set(id, idMap.size + 1);
        }
        const t = cols[o + PEER.table];
        if (t >= 0 && tables.has(t) && !tMap.has(t)) {
          tMap.set(t, tMap.size);
        }
        total += cols[o + PEER.pieces];
      }
    }
    if (!slots) {
      return null;
    }
    const out = {
      slots,
      cols: new Float32Array(n * slots * PEER_N),
      pieceAt: new Uint32Array(n + 1),
      pieces: new Float32Array(total * PIECE_N),
      who: [],
      tables: [],
    };
    let w = 0;
    for (let k = 0; k < n; k += 1) {
      const r = (first + k) % capacity;
      out.pieceAt[k] = w;
      for (let s = 0; s < slots; s += 1) {
        const o = (r * PEERS_MAX + s) * PEER_N;
        const id = cols[o + PEER.id];
        if (!id || !who.has(id)) {
          continue;
        }
        const d = (k * slots + s) * PEER_N;
        out.cols.set(cols.subarray(o, o + PEER_N), d);
        out.cols[d + PEER.id] = idMap.get(id);
        const t = cols[o + PEER.table];
        out.cols[d + PEER.table] = t >= 0 && tMap.has(t) ? tMap.get(t) : -1;
        const np = out.cols[d + PEER.table] >= 0 ? cols[o + PEER.pieces] : 0;
        out.cols[d + PEER.pieces] = np;
        out.cols[d + PEER.at] = w - out.pieceAt[k];
        const from = (r * PIECES_MAX + cols[o + PEER.at]) * PIECE_N;
        out.pieces.set(pool.subarray(from, from + np * PIECE_N), w * PIECE_N);
        w += np;
      }
    }
    out.pieceAt[n] = w;
    out.pieces = out.pieces.slice(0, w * PIECE_N);
    for (const [id] of idMap) {
      out.who.push(JSON.parse(JSON.stringify(who.get(id))));
    }
    for (const [t] of tMap) {
      out.tables.push(JSON.parse(JSON.stringify(tables.get(t))));
    }
    return out;
  }

  return {
    begin,
    add,
    clear,
    clip,
    /* The row begin() opened, or -1. */
    row: () => row,
    /* Bytes held now: nothing until a room draws a peer. */
    bytes: () => (cols ? cols.byteLength + pool.byteLength : 0),
    ringBytes: capacity * ROW_BYTES,
    stats,
  };
}

/* Rows a to b (inclusive) of a clip's peers, or null when nobody is in
 * them; the lists are kept whole, as the ids and tables index them. */
export function trimPeers(peers, a, b) {
  const S = peers.slots;
  const n = b - a + 1;
  const cols = peers.cols.slice(a * S * PEER_N, (b + 1) * S * PEER_N);
  let any = false;
  for (let o = 0; o < cols.length && !any; o += PEER_N) {
    any = cols[o + PEER.id] !== 0;
  }
  if (!any) {
    return null;
  }
  const base = peers.pieceAt[a];
  const pieceAt = new Uint32Array(n + 1);
  for (let k = 0; k <= n; k += 1) {
    pieceAt[k] = peers.pieceAt[a + k] - base;
  }
  return {
    ...peers,
    cols,
    pieceAt,
    pieces: peers.pieces.slice(base * PIECE_N, peers.pieceAt[b + 1] * PIECE_N),
  };
}

/* ---- reading ---- */

/* What sampleAt gives for peers: per slot the id (0 for none), the row's
 * fields interpolated, and the pieces. Reused frame to frame. */
export function createPeerSample(slots) {
  return {
    slots,
    id: new Int32Array(slots),
    row: new Float64Array(slots * PEER_N),
    count: new Int32Array(slots),
    pieces: new Float64Array(slots * PARTS_MAX * PIECE_N),
  };
}

/* Fields interpolated between two rows; the rest are the earlier row's. */
const LERPED = [PEER.pos, PEER.pos + 1, PEER.pos + 2, PEER.ctl, PEER.ctl + 1, PEER.ctl + 2, PEER.ctl + 3,
  PEER.motor, PEER.flaps, PEER.gear, PEER.vel, PEER.vel + 1, PEER.vel + 2];

/*
 * The peers between rows k and k + 1, `a` of the way (recorder.js locate):
 * a peer in the same slot in both is interpolated, its pieces matched by
 * part; one in only the earlier row is drawn as that row has it, so a
 * leave is the last row it was drawn in and a join the first.
 */
export function samplePeers(peers, n, k, a, s) {
  const S = peers.slots;
  const C = peers.cols;
  const P = peers.pieces;
  const k1 = Math.min(k + 1, n - 1);
  for (let slot = 0; slot < S; slot += 1) {
    const o0 = (k * S + slot) * PEER_N;
    const o1 = (k1 * S + slot) * PEER_N;
    const id = C[o0 + PEER.id];
    s.id[slot] = id;
    s.count[slot] = 0;
    if (!id) {
      continue;
    }
    const w = slot * PEER_N;
    const both = C[o1 + PEER.id] === id;
    const u = both ? a : 0;
    for (let i = 0; i < PEER_N; i += 1) {
      s.row[w + i] = C[o0 + i];
    }
    for (const i of LERPED) {
      s.row[w + i] = C[o0 + i] + (C[o1 + i] - C[o0 + i]) * u;
    }
    slerp(C[o0 + PEER.quat], C[o0 + PEER.quat + 1], C[o0 + PEER.quat + 2], C[o0 + PEER.quat + 3],
      C[o1 + PEER.quat], C[o1 + PEER.quat + 1], C[o1 + PEER.quat + 2], C[o1 + PEER.quat + 3], u, s.row, w + PEER.quat);
    const smokeBoth = both && C[o0 + PEER.smoke] !== 0 && C[o1 + PEER.smoke] !== 0;
    for (let i = 0; i < 3; i += 1) {
      const x0 = C[o0 + PEER.nozzle + i];
      s.row[w + PEER.nozzle + i] = smokeBoth ? x0 + (C[o1 + PEER.nozzle + i] - x0) * a : x0;
    }
    /* Pieces: the earlier row's, each eased to where the later row has
     * the same part when the later row is cut by the same table. */
    const n0 = Math.min(C[o0 + PEER.pieces], PARTS_MAX);
    const b0 = (peers.pieceAt[k] + C[o0 + PEER.at]) * PIECE_N;
    const sameCut = both && C[o1 + PEER.table] === C[o0 + PEER.table];
    const n1 = sameCut ? C[o1 + PEER.pieces] : 0;
    const b1 = (peers.pieceAt[k1] + C[o1 + PEER.at]) * PIECE_N;
    const dst = slot * PARTS_MAX * PIECE_N;
    for (let j = 0; j < n0; j += 1) {
      const src = b0 + j * PIECE_N;
      let m = -1;
      for (let jj = 0; jj < n1; jj += 1) {
        if (P[b1 + jj * PIECE_N] === P[src]) {
          m = b1 + jj * PIECE_N;
          break;
        }
      }
      const d = dst + j * PIECE_N;
      s.pieces[d] = P[src];
      const to = m >= 0 ? m : src;
      for (let i = 1; i < 4; i += 1) {
        s.pieces[d + i] = P[src + i] + (P[to + i] - P[src + i]) * a;
      }
      /* The piece's attitude is w x y z; slerp takes x y z w. */
      slerp(P[src + 5], P[src + 6], P[src + 7], P[src + 4], P[to + 5], P[to + 6], P[to + 7], P[to + 4], a, quatScratch, 0);
      s.pieces[d + 4] = quatScratch[3];
      s.pieces[d + 5] = quatScratch[0];
      s.pieces[d + 6] = quatScratch[1];
      s.pieces[d + 7] = quatScratch[2];
    }
    s.count[slot] = n0;
  }
  return s;
}
const quatScratch = new Float64Array(4);

/* Where peer `id` is between rows k and k + 1: position into pos[0..2],
 * attitude (x y z w) into quat[0..3]. False when it is not drawn at k. */
export function peerPose(peers, n, k, a, id, pos, quat) {
  const S = peers.slots;
  const C = peers.cols;
  const k1 = Math.min(k + 1, n - 1);
  for (let slot = 0; slot < S; slot += 1) {
    const o0 = (k * S + slot) * PEER_N;
    if (C[o0 + PEER.id] !== id) {
      continue;
    }
    const o1 = (k1 * S + slot) * PEER_N;
    const u = C[o1 + PEER.id] === id ? a : 0;
    for (let i = 0; i < 3; i += 1) {
      pos[i] = C[o0 + PEER.pos + i] + (C[o1 + PEER.pos + i] - C[o0 + PEER.pos + i]) * u;
    }
    if (quat) {
      slerp(C[o0 + PEER.quat], C[o0 + PEER.quat + 1], C[o0 + PEER.quat + 2], C[o0 + PEER.quat + 3],
        C[o1 + PEER.quat], C[o1 + PEER.quat + 1], C[o1 + PEER.quat + 2], C[o1 + PEER.quat + 3], u, quat, 0);
    }
    return true;
  }
  return false;
}
