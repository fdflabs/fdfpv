/*
 * voicerec.js: the room's voices, in the crash cam's recording.
 *
 * The owner, 2026-10-02: voice chat is kept in replays, for everyone. What
 * is kept is what this page HEARD: each other pilot's voice as it arrived
 * (src/share/voice.js records each link's received stream), compressed
 * as Opus at OPUS_BPS, in pieces of SEGMENT_MS that each decode on their
 * own (a ring can drop the oldest and the rest still play), and only the
 * pieces in which that pilot spoke and was not muted here. This pilot's
 * own microphone is never kept. Each piece is stamped on the room clock,
 * the same clock every row of the recording is stamped with here, so a
 * replay at clip time t plays each voice that was speaking at the room ms
 * that row was drawn at, from where it had got to.
 *
 * PER ROW, the room ms the frame was drawn at (NaN out of a room). BESIDE
 * THE ROWS, the pieces: { seat, from, to (room ms), mime, bytes }.
 *
 * MEMORY. Nothing until a row is drawn in a room: then one f64 a row for
 * the recorder's CAPACITY rows (28.8 KB), and the pieces, held to
 * VOICE_BYTES_MAX all told. Opus at 24 kbit/s is 3 KB a second, 180 KB a
 * minute, for each pilot speaking; a window of 30 s and a piece either
 * side is under 120 KB a pilot, and a full public room's fifteen others
 * all talking at once over all of it about 1.8 MB, inside the 2 MB.
 * Pieces past the window are let go; past the budget, the oldest go
 * first, counted (stats.dropped), so a room louder than the budget
 * shortens the voices' window, never the flight's.
 *
 * Pure: no DOM, no audio, no clock.
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

/* A piece's length, ms: the most of a voice a replay loses when the ring
 * lets a piece go. */
export const SEGMENT_MS = 5000;
/* What a piece may be: OPUS_BPS for SEGMENT_MS is 15 KB; a recorder's
 * container and its bitrate's wander get four times that. */
export const SEGMENT_BYTES_MAX = 60 * 1024;
export const VOICE_BYTES_MAX = 2 * 1024 * 1024;
/* The pieces a clip may hold: every seat of a public room, for the
 * window and a piece either side. */
export const SEGMENTS_MAX = 16 * 9;
export const SEATS_MAX = 64;
export const MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];
const KEYS = ['seat', 'from', 'to', 'mime', 'bytes'];

function pieceOk(s) {
  return s && typeof s === 'object' && Number.isInteger(s.seat) && s.seat >= 1 && s.seat <= SEATS_MAX
    && Number.isFinite(s.from) && Number.isFinite(s.to) && s.to > s.from && MIMES.includes(s.mime)
    && s.bytes instanceof Uint8Array && s.bytes.length > 0 && s.bytes.length <= SEGMENT_BYTES_MAX;
}

export function createVoiceRing(capacity) {
  let clock = null;
  let row = -1;
  /* Oldest first by when it ended. */
  const pieces = [];
  let held = 0;
  const stats = { refused: 0, dropped: 0 };

  function begin(i) {
    row = i;
    if (i >= 0 && clock) {
      clock[i] = NaN;
    }
  }

  /* The room ms this frame was drawn at, or null out of a room. */
  function at(roomMs) {
    if (row < 0 || roomMs == null || !Number.isFinite(roomMs)) {
      return;
    }
    if (!clock) {
      clock = new Float64Array(capacity).fill(NaN);
    }
    clock[row] = roomMs;
  }

  /* A piece heard (src/share/voice.js). One that is not one is counted. */
  function add(s) {
    if (!pieceOk(s)) {
      stats.refused += 1;
      return;
    }
    pieces.push({
      seat: s.seat, from: s.from, to: s.to, mime: s.mime, bytes: s.bytes,
    });
    held += s.bytes.length;
    while (held > VOICE_BYTES_MAX && pieces.length) {
      held -= pieces.shift().bytes.length;
      stats.dropped += 1;
    }
  }

  /* Pieces that ended more than windowMs and a piece before room ms now. */
  function prune(nowMs, windowMs) {
    while (pieces.length && pieces[0].to < nowMs - windowMs - SEGMENT_MS) {
      held -= pieces.shift().bytes.length;
    }
  }

  function clear() {
    row = -1;
    if (clock) {
      clock.fill(NaN);
    }
  }

  /* Rows `first`, n as a clip's voice: { clock (f64[n]), pieces (those
   * that overlap the rows' room ms) }, or null when none does. */
  function clip(first, n) {
    if (!clock || !pieces.length) {
      return null;
    }
    const c = new Float64Array(n);
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < n; k += 1) {
      c[k] = clock[(first + k) % capacity];
      if (Number.isFinite(c[k])) {
        lo = Math.min(lo, c[k]);
        hi = Math.max(hi, c[k]);
      }
    }
    const list = pieces.filter((s) => s.to > lo && s.from < hi).slice(-SEGMENTS_MAX);
    if (!list.length) {
      return null;
    }
    return { clock: c, pieces: list.map((s) => ({ ...s })) };
  }

  return {
    begin,
    at,
    add,
    prune,
    clear,
    clip,
    stats,
    bytes: () => (clock ? clock.byteLength : 0) + held,
  };
}

/* Rows [a, b] of a clip's voice. */
export function trimVoice(voice, a, b) {
  const clock = voice.clock.slice(a, b + 1);
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of clock) {
    if (Number.isFinite(x)) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
  }
  return { clock, pieces: voice.pieces.filter((s) => s.to > lo && s.from < hi) };
}

/* A clip's voice checked, as the file's reader needs it. Throws. */
export function checkVoice(voice, n) {
  if (!(voice.clock instanceof Float64Array) || voice.clock.length !== n) {
    throw new Error('the voice clock is not the clip\'s length');
  }
  for (const x of voice.clock) {
    if (!(Number.isNaN(x) || Number.isFinite(x))) {
      throw new Error('a voice clock is not a number');
    }
  }
  if (!Array.isArray(voice.pieces) || voice.pieces.length < 1 || voice.pieces.length > SEGMENTS_MAX) {
    throw new Error('the voices are not a list');
  }
  let total = 0;
  for (const s of voice.pieces) {
    if (!pieceOk(s) || Object.keys(s).length !== KEYS.length) {
      throw new Error('a voice is not one');
    }
    total += s.bytes.length;
  }
  if (total > VOICE_BYTES_MAX) {
    throw new Error('the voices are more than a clip holds');
  }
}

/* The room ms of the frame between rows k and k + 1, `a` of the way, or
 * NaN where the row was not drawn in a room. */
export function voiceClockAt(voice, n, k, a) {
  const r0 = voice.clock[k];
  const r1 = voice.clock[Math.min(n - 1, k + 1)];
  return Number.isFinite(r0) && Number.isFinite(r1) ? r0 + (r1 - r0) * a : r0;
}

/* The pieces speaking at room ms `ms`, each with how far into it, s:
 * [{ piece, at }]. */
export function voicesAt(voice, ms) {
  const out = [];
  if (!Number.isFinite(ms)) {
    return out;
  }
  for (const s of voice.pieces) {
    if (ms >= s.from && ms < s.to) {
      out.push({ piece: s, at: (ms - s.from) / 1000 });
    }
  }
  return out;
}
