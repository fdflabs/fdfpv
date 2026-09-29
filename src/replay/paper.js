/*
 * paper.js: the combat streamers, in the crash cam's recording.
 *
 * The owner: "in the replays I'm not seeing the paper trail." Combat
 * (docs/COMBAT-PLAN.md) draws every pilot's toilet paper through one layer
 * (src/render/streamers.js): a ribbon per chain, this pilot's and every
 * peer's, the pieces a cut or a tear sent falling among them, and a burst
 * of paper and a glint where a cut happens, with the SCHWING. This keeps
 * what that layer was asked to draw, in the recorder's rows, so a replay
 * asks its own layer for the same.
 *
 * PER ROW: every ribbon drawn that frame as its draw() call had it: whose
 * paper (the seat), which chain (0 the streamer on the aircraft, else a
 * falling piece), the colour of each link as runs (captured paper keeps
 * its owner's colour), the tow point it was drawn from, the flutter clock,
 * and the chain's nodes. BESIDE THE ROWS, on the recorder's clock: each
 * cut's burst (where, in whose colour, how big) and each SCHWING (how
 * loud).
 *
 * THE NODES ARE PACKED as the room packs them for the wire
 * (src/share/roomwire.js encodeStreamer): the head as float32, then each
 * link as a direction in two octahedral bytes and a length in one, each
 * steered from where the reader will have put the node before it, so the
 * rounding never adds up along the paper. A link is about a metre, so a
 * node comes back within PAPER_ERR_M of where it was drawn at any distance
 * from the tow point; the length byte runs to LEN_MAX_M, twice the wire's,
 * because a peer's drawn chain is extrapolated and can stretch further.
 * Three bytes a link instead of twelve.
 *
 * MEMORY. Nothing is made until a combat layer draws its first ribbon
 * while recording. Then one byte ring of RING_BYTES: the budget is a full
 * public room, 16 pilots each with a hundred links of paper, every row of
 * the recorder's window (30 s at 120 Hz). Rows are written into it one
 * after the other, as long as they are; a row that the ring has since
 * written over is read as no paper, and counted, so a room heavier than
 * the budget shortens the paper's window rather than the flight's. A
 * frame costs the packing and no allocation.
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

import { STREAMER_PIECES, STREAMER_SEGS } from '../share/roomwire.js';

/* What one row can hold: every seat of a public room, each with its
 * streamer and its falling pieces, each at most the layer's MAXN nodes. */
export const PAPER_PILOTS = 16;
export const RIBBONS_MAX = PAPER_PILOTS * (1 + STREAMER_PIECES);
export const NODES_MAX = STREAMER_SEGS + 1;
/* Colour runs a ribbon keeps: a byte's worth, a run per link at most. */
export const RUNS_MAX = 255;
const OCT = 127;
/* A link's length, a centimetre a step. */
export const LEN_STEP_M = 0.01;
export const LEN_MAX_M = 255 * LEN_STEP_M;
/* The bound the self test holds a packed node to (a direction step near
 * the fold is under a degree, half a length step is 5 mm, on a metre). */
export const PAPER_ERR_M = 0.03;

const FLAG_FREE = 1;
const FLAG_ANCHOR = 2;
/* A row: u8 ribbon count, f64 the flutter clock. A ribbon: u8 seat, u8
 * chain id, u8 flags, u8 links, u8 runs, runs x (u8 seat, u8 links),
 * [f32 x 3 the tow point], f32 x 3 the head, links x (i8 x 2, u8). */
export const ROW_HEAD = 9;
const RIBBON_HEAD = 5;
const RIBBON_MAX_BYTES = RIBBON_HEAD + NODES_MAX * 2 + 24 + STREAMER_SEGS * 3;
const ROW_MAX = ROW_HEAD + RIBBONS_MAX * RIBBON_MAX_BYTES;
/* The budget per row: 16 streamers of a hundred links, sixteen colours
 * each (every seat's, captured). */
const ROW_BUDGET = ROW_HEAD + PAPER_PILOTS * (RIBBON_HEAD + 16 * 2 + 24 + STREAMER_SEGS * 3);

const COLOUR_RE = /^#[0-9a-f]{6}$/;

/* ---- the octahedral direction, as the wire's, without allocating ---- */

function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/* A unit direction to its two bytes, into q[0], q[1]. */
function octEncode(x, y, z, q) {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z);
  if (!(s > 0)) {
    q[0] = 0;
    q[1] = OCT;
    return;
  }
  let a = x / s;
  let b = z / s;
  if (y < 0) {
    const fa = (1 - Math.abs(b)) * (a < 0 ? -1 : 1);
    const fb = (1 - Math.abs(a)) * (b < 0 ? -1 : 1);
    a = fa;
    b = fb;
  }
  q[0] = clampInt(a * OCT, -OCT, OCT);
  q[1] = clampInt(b * OCT, -OCT, OCT);
}

/* Two bytes back to a unit direction, into out[0..2]. */
function octDecode(qa, qb, out) {
  let x = qa / OCT;
  let z = qb / OCT;
  const y = 1 - Math.abs(x) - Math.abs(z);
  if (y < 0) {
    const fx = (1 - Math.abs(z)) * (x < 0 ? -1 : 1);
    const fz = (1 - Math.abs(x)) * (z < 0 ? -1 : 1);
    x = fx;
    z = fz;
  }
  const n = Math.sqrt(x * x + y * y + z * z) || 1;
  out[0] = x / n;
  out[1] = y / n;
  out[2] = z / n;
}

const qScratch = new Int32Array(2);
const dScratch = new Float64Array(3);

/*
 * The links of nodes x (n of them) into u8 from `at`, each steered from
 * where the reader puts the node before it, so the rounding never adds
 * up. (The wire also tries the eight codes round the nearest one; here
 * that costs twice the time for 3 mm, and a frame pays it.) hx, hy, hz is
 * the head as the reader has it (float32). Returns the offset after.
 */
function packLinks(u8, at, x, n, hx, hy, hz) {
  let rx = hx;
  let ry = hy;
  let rz = hz;
  for (let k = 1; k < n; k += 1) {
    const dx = x[k * 3] - rx;
    const dy = x[k * 3 + 1] - ry;
    const dz = x[k * 3 + 2] - rz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-9) {
      octEncode(dx / len, dy / len, dz / len, qScratch);
    } else {
      qScratch[0] = 0;
      qScratch[1] = OCT;
    }
    octDecode(qScratch[0], qScratch[1], dScratch);
    const along = dx * dScratch[0] + dy * dScratch[1] + dz * dScratch[2];
    const cl = clampInt(along / LEN_STEP_M, 0, 255);
    u8[at] = qScratch[0] & 0xff;
    u8[at + 1] = qScratch[1] & 0xff;
    u8[at + 2] = cl;
    at += 3;
    rx += dScratch[0] * cl * LEN_STEP_M;
    ry += dScratch[1] * cl * LEN_STEP_M;
    rz += dScratch[2] * cl * LEN_STEP_M;
  }
  return at;
}

/* How many colour runs the first `len` of `cols` make. */
function runsOf(cols, len) {
  let runs = 0;
  for (let i = 0; i < len; i += 1) {
    if (i === 0 || (cols[i] | 0) !== (cols[i - 1] | 0)) {
      runs += 1;
    }
  }
  return runs;
}

/*
 * The recorder's companion for the paper: rows by the recorder's own
 * index. begin(i) once per row the recorder wrote (i < 0 when it wrote
 * none), draw() for each ribbon the layer draws after it, cut() and
 * schwing() at the moment they happen, on the recorder's clock.
 */
export function createPaperRing(capacity) {
  /* A row is never split across the ring's end, so up to a row's worth
   * at the end can go unused: that much over the budget. */
  const size = capacity * ROW_BUDGET + ROW_MAX;
  let buf = null;
  let dv = null;
  let u8 = null;
  const rowVirt = new Float64Array(capacity);
  const rowLen = new Int32Array(capacity);
  /* Bytes written ever, as a count that only grows: a byte's place in
   * the ring is this modulo its size, and a row is whole while the count
   * is within a ring's size of where it started. */
  let virt = 0;
  let row = -1;
  let countAt = 0;
  const events = [];
  /* lost: rows the ring had written over when a clip was cut. */
  const stats = { ribbons: 0, dropped: 0, events: 0, lost: 0 };

  function begin(i) {
    row = i;
    if (i >= 0) {
      rowLen[i] = 0;
    }
  }

  function startRow(t) {
    if (!buf) {
      buf = new ArrayBuffer(size);
      dv = new DataView(buf);
      u8 = new Uint8Array(buf);
    }
    /* A row is written in one piece: one that would run past the end
     * starts again at the ring's start. */
    const phys = virt % size;
    if (phys + ROW_MAX > size) {
      virt += size - phys;
    }
    rowVirt[row] = virt;
    countAt = virt % size;
    dv.setUint8(countAt, 0);
    dv.setFloat64(countAt + 1, t, true);
    rowLen[row] = ROW_HEAD;
    virt += ROW_HEAD;
  }

  /* One ribbon as src/render/streamers.js draw() was asked for it. One
   * of fewer than two nodes draws nothing, and is not kept. */
  function draw(key, cols, id, x, n, t, free, anchor) {
    const nodes = Math.min(n, NODES_MAX);
    if (row < 0 || nodes < 2) {
      return;
    }
    if (rowLen[row] === 0) {
      startRow(t);
    }
    const colsLen = Math.min(cols.length, 255);
    const runs = runsOf(cols, colsLen);
    const bytes = RIBBON_HEAD + runs * 2 + (anchor ? 12 : 0) + 12 + (nodes - 1) * 3;
    const count = u8[countAt];
    if (count >= RIBBONS_MAX || rowLen[row] + bytes > ROW_MAX || !(key >= 0 && key <= 255) || !(id >= 0 && id <= 255)) {
      stats.dropped += 1;
      return;
    }
    let at = virt % size;
    dv.setUint8(at, key);
    dv.setUint8(at + 1, id);
    dv.setUint8(at + 2, (free ? FLAG_FREE : 0) | (anchor ? FLAG_ANCHOR : 0));
    dv.setUint8(at + 3, nodes - 1);
    dv.setUint8(at + 4, runs);
    at += RIBBON_HEAD;
    let i = 0;
    while (i < colsLen) {
      const seat = cols[i] | 0;
      let len = 0;
      while (i < colsLen && (cols[i] | 0) === seat && len < 255) {
        i += 1;
        len += 1;
      }
      dv.setUint8(at, seat & 0xff);
      dv.setUint8(at + 1, len);
      at += 2;
    }
    if (anchor) {
      dv.setFloat32(at, anchor[0], true);
      dv.setFloat32(at + 4, anchor[1], true);
      dv.setFloat32(at + 8, anchor[2], true);
      at += 12;
    }
    dv.setFloat32(at, x[0], true);
    dv.setFloat32(at + 4, x[1], true);
    dv.setFloat32(at + 8, x[2], true);
    packLinks(u8, at + 12, x, nodes, dv.getFloat32(at, true), dv.getFloat32(at + 4, true), dv.getFloat32(at + 8, true));
    u8[countAt] = count + 1;
    rowLen[row] += bytes;
    virt += bytes;
    stats.ribbons += 1;
  }

  /* Forget events older than the window a clip can hold. */
  function prune(now, windowS) {
    const cutoff = now - windowS - 2;
    while (events.length && events[0].t < cutoff) {
      events.shift();
    }
  }

  /* A cut's burst at p (world), in `colour` (#rrggbb), `level` big. */
  function cut(t, p, colour, level) {
    events.push({ t, type: 'cut', p: [p[0], p[1], p[2]], colour: String(colour), level });
    stats.events += 1;
  }

  /* A SCHWING, `level` loud. */
  function schwing(t, level) {
    events.push({ t, type: 'schwing', level });
    stats.events += 1;
  }

  /* The newest events after a take over's drop: none later than t. */
  function dropAfter(t) {
    while (events.length && events[events.length - 1].t > t) {
      events.pop();
    }
  }

  function clear() {
    row = -1;
    events.length = 0;
    rowLen.fill(0);
  }

  /*
   * The rows the recorder cut for a clip, `n` from ring index `first`,
   * the first at clock t0 and the last at t1, as a clip's paper: { bytes
   * (each row in turn, a row without paper one zero byte), rowAt (where
   * each row starts, n + 1 of them), events (clip clock) }, or null when
   * nothing was drawn and nothing happened.
   */
  function clip(first, n, t0, t1) {
    const evs = events.filter((e) => e.t >= t0 && e.t <= t1).map((e) => ({ ...e, t: e.t - t0 }));
    let total = 0;
    let any = false;
    const whole = (r) => rowLen[r] > 0 && buf && virt - rowVirt[r] <= size;
    for (let k = 0; k < n; k += 1) {
      const r = (first + k) % capacity;
      if (whole(r)) {
        total += rowLen[r];
        any = true;
      } else {
        total += 1;
        stats.lost += rowLen[r] > 0 ? 1 : 0;
      }
    }
    if (!any && !evs.length) {
      return null;
    }
    const bytes = new Uint8Array(total);
    const rowAt = new Uint32Array(n + 1);
    let w = 0;
    for (let k = 0; k < n; k += 1) {
      const r = (first + k) % capacity;
      rowAt[k] = w;
      if (whole(r)) {
        const p = rowVirt[r] % size;
        bytes.set(u8.subarray(p, p + rowLen[r]), w);
        w += rowLen[r];
      } else {
        bytes[w] = 0;
        w += 1;
      }
    }
    rowAt[n] = w;
    return { bytes, rowAt, events: evs };
  }

  return {
    begin,
    draw,
    cut,
    schwing,
    prune,
    dropAfter,
    clear,
    clip,
    /* The row begin() opened, or -1. */
    row: () => row,
    /* Bytes held now: nothing until combat draws while recording. */
    bytes: () => (buf ? buf.byteLength : 0),
    ringBytes: size,
    stats,
  };
}

/* Rows a to b (inclusive) of a clip's paper, the events from clip time
 * ta to tb rebased to ta, or null when nothing is left. */
export function trimPaper(paper, a, b, ta, tb) {
  const from = paper.rowAt[a];
  const to = paper.rowAt[b + 1];
  const bytes = paper.bytes.slice(from, to);
  const rowAt = new Uint32Array(b - a + 2);
  let any = false;
  for (let k = a; k <= b + 1; k += 1) {
    rowAt[k - a] = paper.rowAt[k] - from;
  }
  for (let k = 0; k <= b - a && !any; k += 1) {
    any = bytes[rowAt[k]] !== 0;
  }
  const events = paper.events.filter((e) => e.t >= ta && e.t <= tb).map((e) => ({ ...e, t: e.t - ta }));
  return any || events.length ? { bytes, rowAt, events } : null;
}

/* ---- reading ---- */

/* A row's ribbons, unpacked: reused frame to frame. */
export function createPaperRow() {
  return {
    count: 0,
    t: 0,
    ribbons: Array.from({ length: RIBBONS_MAX }, () => ({
      key: 0, id: 0, free: false, anchored: false, n: 0, colsLen: 0,
      anchor: new Float64Array(3), x: new Float64Array(NODES_MAX * 3), cols: new Uint8Array(255),
    })),
  };
}

/*
 * Row k of a clip's paper into `out`, or a thrown Error when its bytes
 * are not a row (the file's reader turns that into a refusal). Returns
 * the offset after it.
 */
export function readRow(paper, k, out) {
  const bytes = paper.bytes;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return readAt(dv, paper.rowAt[k], bytes.byteLength, out);
}

function readAt(dv, at, end, out) {
  const need = (m) => {
    if (at + m > end) {
      throw new Error('a paper row runs past its end');
    }
  };
  need(1);
  const count = dv.getUint8(at);
  at += 1;
  out.count = count;
  if (!count) {
    return at;
  }
  if (count > RIBBONS_MAX) {
    throw new Error('a paper row holds too many ribbons');
  }
  need(8);
  out.t = dv.getFloat64(at, true);
  at += 8;
  if (!Number.isFinite(out.t)) {
    throw new Error('a paper row\'s clock is not a number');
  }
  for (let j = 0; j < count; j += 1) {
    const r = out.ribbons[j];
    need(RIBBON_HEAD);
    r.key = dv.getUint8(at);
    r.id = dv.getUint8(at + 1);
    const flags = dv.getUint8(at + 2);
    const links = dv.getUint8(at + 3);
    const runs = dv.getUint8(at + 4);
    at += RIBBON_HEAD;
    if (links < 1 || links > STREAMER_SEGS || (flags & ~(FLAG_FREE | FLAG_ANCHOR))) {
      throw new Error('a paper ribbon is out of range');
    }
    r.free = (flags & FLAG_FREE) !== 0;
    r.anchored = (flags & FLAG_ANCHOR) !== 0;
    need(runs * 2);
    let c = 0;
    for (let i = 0; i < runs; i += 1) {
      const seat = dv.getUint8(at);
      const len = dv.getUint8(at + 1);
      at += 2;
      if (c + len > 255) {
        throw new Error('a paper ribbon has too many colours');
      }
      r.cols.fill(seat, c, c + len);
      c += len;
    }
    r.colsLen = c;
    if (r.anchored) {
      need(12);
      for (let i = 0; i < 3; i += 1) {
        r.anchor[i] = dv.getFloat32(at + i * 4, true);
      }
      at += 12;
    }
    need(12 + links * 3);
    for (let i = 0; i < 3; i += 1) {
      r.x[i] = dv.getFloat32(at + i * 4, true);
    }
    at += 12;
    for (let k = 1; k <= links; k += 1) {
      octDecode(dv.getInt8(at), dv.getInt8(at + 1), dScratch);
      const l = dv.getUint8(at + 2) * LEN_STEP_M;
      r.x[k * 3] = r.x[k * 3 - 3] + dScratch[0] * l;
      r.x[k * 3 + 1] = r.x[k * 3 - 2] + dScratch[1] * l;
      r.x[k * 3 + 2] = r.x[k * 3 - 1] + dScratch[2] * l;
      at += 3;
    }
    r.n = links + 1;
    for (let i = 0; i < 3 * r.n; i += 1) {
      if (!Number.isFinite(r.x[i])) {
        throw new Error('a paper node is not a number');
      }
    }
    if (r.anchored && !(Number.isFinite(r.anchor[0]) && Number.isFinite(r.anchor[1]) && Number.isFinite(r.anchor[2]))) {
      throw new Error('a paper tow point is not a number');
    }
  }
  return at;
}

/*
 * The whole of a clip's paper checked, as the file's reader needs it:
 * every row a row, each ending where the next begins, the events of known
 * kinds and fields. Throws an Error saying what was wrong.
 */
export function checkPaper(paper, n) {
  if (paper.rowAt.length !== n + 1 || paper.rowAt[n] !== paper.bytes.byteLength) {
    throw new Error('the paper rows do not cover the paper');
  }
  const scratch = createPaperRow();
  const dv = new DataView(paper.bytes.buffer, paper.bytes.byteOffset, paper.bytes.byteLength);
  for (let k = 0; k < n; k += 1) {
    const end = readAt(dv, paper.rowAt[k], paper.rowAt[k + 1], scratch);
    if (end !== paper.rowAt[k + 1]) {
      throw new Error(`paper row ${k} is not the length it says`);
    }
  }
  if (!Array.isArray(paper.events) || paper.events.length > 4000) {
    throw new Error('the paper events are not a list');
  }
  for (const e of paper.events) {
    const keys = e && typeof e === 'object' ? Object.keys(e) : [];
    const want = e && e.type === 'cut' ? ['t', 'type', 'p', 'colour', 'level'] : ['t', 'type', 'level'];
    const ok = e && (e.type === 'cut' || e.type === 'schwing')
      && keys.length === want.length && keys.every((x) => want.includes(x))
      && Number.isFinite(e.t) && Number.isFinite(e.level) && e.level >= 0 && e.level <= 1
      && (e.type !== 'cut' || (Array.isArray(e.p) && e.p.length === 3 && e.p.every(Number.isFinite) && COLOUR_RE.test(e.colour)));
    if (!ok) {
      throw new Error('a paper event is not one');
    }
  }
}

/* Rows splits paper bytes into, from a file: each row walked for its
 * length. Throws when a row runs past the end. */
export function rowsOf(bytes, n) {
  const rowAt = new Uint32Array(n + 1);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scratch = createPaperRow();
  let at = 0;
  for (let k = 0; k < n; k += 1) {
    rowAt[k] = at;
    at = readAt(dv, at, bytes.byteLength, scratch);
  }
  rowAt[n] = at;
  if (at !== bytes.byteLength) {
    throw new Error('the paper is not the length its rows say');
  }
  return rowAt;
}

/*
 * The paper between rows k and k + 1, `a` of the way: row k's ribbons,
 * each moved toward row k + 1's same ribbon (the same seat and chain, the
 * same number of nodes) and the flutter clock between the two. Into
 * s.row; s.next is scratch.
 */
export function createPaperSample() {
  return { row: createPaperRow(), next: createPaperRow() };
}

export function samplePaper(paper, n, k, a, s) {
  readRow(paper, k, s.row);
  const k1 = Math.min(k + 1, n - 1);
  if (a <= 0 || k1 === k || !s.row.count) {
    return s.row;
  }
  readRow(paper, k1, s.next);
  if (!s.next.count) {
    return s.row;
  }
  s.row.t += (s.next.t - s.row.t) * a;
  for (let j = 0; j < s.row.count; j += 1) {
    const r = s.row.ribbons[j];
    let m = null;
    for (let jj = 0; jj < s.next.count; jj += 1) {
      const q = s.next.ribbons[jj];
      if (q.key === r.key && q.id === r.id && q.n === r.n && q.anchored === r.anchored) {
        m = q;
        break;
      }
    }
    if (!m) {
      continue;
    }
    for (let i = 0; i < r.n * 3; i += 1) {
      r.x[i] += (m.x[i] - r.x[i]) * a;
    }
    if (r.anchored) {
      for (let i = 0; i < 3; i += 1) {
        r.anchor[i] += (m.anchor[i] - r.anchor[i]) * a;
      }
    }
  }
  return s.row;
}
