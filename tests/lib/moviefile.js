/*
 * moviefile.js: what a movie file holds, read straight out of its boxes.
 *
 * The export check (scripts/export-check.js) asserts that a movie holds
 * exactly the frames its plan made, at exactly their timestamps. A player
 * or ffprobe would answer through a decoder that may repeat, drop or
 * retime frames on its way to a count, so this reads the container itself:
 * MP4 (moov and stbl, and the moof fragments src/replay/export.js writes)
 * and WebM (EBML, including the unknown sizes a streamed file carries).
 *
 * readMovie(bytes) -> { container, tracks: [{ id, kind, codec, width,
 * height, frames, pts }] } with pts in microseconds, in file order, one per
 * frame (video) or chunk (audio), and each track's duration in seconds:
 * the end of its last sample in an MP4, the start of its last block in a
 * WebM (a SimpleBlock carries no duration).
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

export class MovieFileError extends Error {}

export function readMovie(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return readWebm(b);
  }
  if (b.length >= 8 && ascii(b, 4, 4) === 'ftyp') {
    return readMp4(b);
  }
  throw new MovieFileError('neither an MP4 nor a WebM');
}

function ascii(b, o, n) {
  return String.fromCharCode(...b.subarray(o, o + n));
}

/* ---- MP4 ---- */

const MP4_DESCEND = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf']);

/* The boxes from o to end, as { type, o (contents), end }. */
function boxes(b, v, o, end) {
  const out = [];
  while (o + 8 <= end) {
    let size = v.getUint32(o);
    const type = ascii(b, o + 4, 4);
    let head = 8;
    if (size === 1) {
      size = v.getUint32(o + 8) * 2 ** 32 + v.getUint32(o + 12);
      head = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < head || o + size > end) {
      throw new MovieFileError(`box ${type} at ${o} runs past its parent`);
    }
    out.push({ type, o: o + head, end: o + size });
    o += size;
  }
  return out;
}

function readMp4(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tracks = new Map();
  const trex = new Map();
  const walk = (o, end, ctx) => {
    for (const x of boxes(b, v, o, end)) {
      if (x.type === 'trak') {
        const t = {
          id: 0, kind: '', codec: '', width: 0, height: 0, timescale: 0, dts: [], cto: [], dur: [],
        };
        walk(x.o, x.end, { trak: t });
        tracks.set(t.id, t);
      } else if (x.type === 'traf') {
        walk(x.o, x.end, { traf: {} });
      } else if (MP4_DESCEND.has(x.type)) {
        walk(x.o, x.end, ctx);
      } else {
        leaf(x, ctx);
      }
    }
  };
  const leaf = (x, ctx) => {
    const o = x.o;
    const ver = b[o];
    const t = ctx && ctx.trak;
    if (x.type === 'tkhd' && t) {
      t.id = v.getUint32(o + (ver === 1 ? 20 : 12));
    } else if (x.type === 'mdhd' && t) {
      t.timescale = v.getUint32(o + (ver === 1 ? 20 : 12));
    } else if (x.type === 'hdlr' && t) {
      const h = ascii(b, o + 8, 4);
      t.kind = h === 'vide' ? 'video' : (h === 'soun' ? 'audio' : h);
    } else if (x.type === 'stsd' && t) {
      const e = o + 8;
      t.codec = ascii(b, e + 4, 4);
      if (t.kind === 'video') {
        t.width = v.getUint16(e + 32);
        t.height = v.getUint16(e + 34);
      }
    } else if (x.type === 'stts' && t) {
      let d = t.dts.length ? t.dts[t.dts.length - 1] + t.dur[t.dur.length - 1] : 0;
      const n = v.getUint32(o + 4);
      for (let k = 0; k < n; k += 1) {
        const count = v.getUint32(o + 8 + k * 8);
        const delta = v.getUint32(o + 12 + k * 8);
        for (let c = 0; c < count; c += 1) {
          t.dts.push(d);
          t.dur.push(delta);
          t.cto.push(0);
          d += delta;
        }
      }
    } else if (x.type === 'ctts' && t) {
      const n = v.getUint32(o + 4);
      let s = 0;
      for (let k = 0; k < n; k += 1) {
        const count = v.getUint32(o + 8 + k * 8);
        const off = ver === 1 ? v.getInt32(o + 12 + k * 8) : v.getUint32(o + 12 + k * 8);
        for (let c = 0; c < count; c += 1) {
          t.cto[s] = off;
          s += 1;
        }
      }
    } else if (x.type === 'trex') {
      trex.set(v.getUint32(o + 4), { dur: v.getUint32(o + 12) });
    } else if (x.type === 'tfhd' && ctx && ctx.traf) {
      const flags = v.getUint32(o) & 0xffffff;
      const f = ctx.traf;
      f.track = v.getUint32(o + 4);
      let p = o + 8;
      if (flags & 0x01) {
        p += 8;
      }
      if (flags & 0x02) {
        p += 4;
      }
      f.dur = flags & 0x08 ? v.getUint32(p) : (trex.get(f.track) || { dur: 0 }).dur;
    } else if (x.type === 'tfdt' && ctx && ctx.traf) {
      ctx.traf.base = ver === 1 ? v.getUint32(o + 4) * 2 ** 32 + v.getUint32(o + 8) : v.getUint32(o + 4);
    } else if (x.type === 'trun' && ctx && ctx.traf) {
      trun(x, ctx.traf);
    }
  };
  const trun = (x, f) => {
    const o = x.o;
    const ver = b[o];
    const flags = v.getUint32(o) & 0xffffff;
    const n = v.getUint32(o + 4);
    let p = o + 8;
    if (flags & 0x01) {
      p += 4;
    }
    if (flags & 0x04) {
      p += 4;
    }
    const t = tracks.get(f.track);
    if (!t) {
      throw new MovieFileError(`a fragment for track ${f.track}, which the moov does not declare`);
    }
    let d = f.base !== undefined ? f.base : (t.dts.length ? t.dts[t.dts.length - 1] + t.dur[t.dur.length - 1] : 0);
    for (let k = 0; k < n; k += 1) {
      let dur = f.dur;
      let cto = 0;
      if (flags & 0x100) {
        dur = v.getUint32(p);
        p += 4;
      }
      if (flags & 0x200) {
        p += 4;
      }
      if (flags & 0x400) {
        p += 4;
      }
      if (flags & 0x800) {
        cto = ver === 1 ? v.getInt32(p) : v.getUint32(p);
        p += 4;
      }
      t.dts.push(d);
      t.dur.push(dur);
      t.cto.push(cto);
      d += dur;
    }
    f.base = d;
  };
  walk(0, b.length, null);
  return {
    container: 'mp4',
    tracks: [...tracks.values()].map((t) => {
      if (!t.timescale) {
        throw new MovieFileError(`track ${t.id} has no timescale`);
      }
      const us = (x) => Math.round((x * 1e6) / t.timescale);
      const n = t.dts.length;
      return {
        id: t.id,
        kind: t.kind,
        codec: t.codec,
        width: t.width,
        height: t.height,
        frames: n,
        pts: t.dts.map((d, k) => us(d + t.cto[k])),
        duration: n ? (t.dts[n - 1] + t.dur[n - 1]) / t.timescale : 0,
      };
    }),
  };
}

/* ---- WebM ---- */

const EBML = {
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackType: 0x83,
  codecId: 0x86,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
  cluster: 0x1f43b675,
  timecode: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  blockDuration: 0x9b,
};
/* Masters whose children are read in line, which is also how an unknown
 * size (a streamed Segment or Cluster) is read: to wherever the next
 * element that is not its child starts. */
const WEBM_DESCEND = new Set([EBML.segment, EBML.info, EBML.tracks, EBML.trackEntry, EBML.video, EBML.cluster, EBML.blockGroup]);

/* A variable length integer at o: { value, length, unknown }. `keep`
 * keeps the length marker, which is how element IDs are written. */
function vint(b, o, keep) {
  const first = b[o];
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) {
    len += 1;
  }
  if (len > 8) {
    throw new MovieFileError(`a bad EBML number at ${o}`);
  }
  let value = keep ? first : first & (0xff >> len);
  let ones = value === (0xff >> len);
  for (let k = 1; k < len; k += 1) {
    value = value * 256 + b[o + k];
    ones = ones && b[o + k] === 0xff;
  }
  return { value, length: len, unknown: !keep && ones };
}

function uint(b, o, n) {
  let x = 0;
  for (let k = 0; k < n; k += 1) {
    x = x * 256 + b[o + k];
  }
  return x;
}

function readWebm(b) {
  let scaleNs = 1e6;
  let cluster = 0;
  const tracks = [];
  let entry = null;
  const block = (o) => {
    const num = vint(b, o, false);
    const rel = (b[o + num.length] << 24 >> 16) | b[o + num.length + 1];
    const t = tracks.find((x) => x.id === num.value);
    if (!t) {
      throw new MovieFileError(`a block for track ${num.value}, which Tracks does not declare`);
    }
    t.ticks.push(cluster + rel);
  };
  let o = 0;
  while (o < b.length) {
    const id = vint(b, o, true);
    const size = vint(b, o + id.length, false);
    const at = o + id.length + size.length;
    if (WEBM_DESCEND.has(id.value)) {
      if (id.value === EBML.trackEntry) {
        entry = { id: 0, kind: '', codec: '', width: 0, height: 0, ticks: [] };
        tracks.push(entry);
      }
      o = at;
      continue;
    }
    if (size.unknown) {
      throw new MovieFileError(`element ${id.value.toString(16)} of unknown size is not a master this reads`);
    }
    const end = at + size.value;
    if (end > b.length) {
      throw new MovieFileError(`element ${id.value.toString(16)} at ${o} runs past the file`);
    }
    switch (id.value) {
      case EBML.timecodeScale: scaleNs = uint(b, at, size.value); break;
      case EBML.trackNumber: entry.id = uint(b, at, size.value); break;
      case EBML.trackType: entry.kind = { 1: 'video', 2: 'audio' }[uint(b, at, size.value)] || 'other'; break;
      case EBML.codecId: entry.codec = ascii(b, at, size.value); break;
      case EBML.pixelWidth: entry.width = uint(b, at, size.value); break;
      case EBML.pixelHeight: entry.height = uint(b, at, size.value); break;
      case EBML.timecode: cluster = uint(b, at, size.value); break;
      case EBML.simpleBlock: case EBML.block: block(at); break;
      default: break;
    }
    o = end;
  }
  return {
    container: 'webm',
    tracks: tracks.map((t) => ({
      id: t.id,
      kind: t.kind,
      codec: t.codec,
      width: t.width,
      height: t.height,
      frames: t.ticks.length,
      pts: t.ticks.map((k) => Math.round((k * scaleNs) / 1000)),
      duration: t.ticks.length ? (t.ticks[t.ticks.length - 1] * scaleNs) / 1e9 : 0,
    })),
  };
}
