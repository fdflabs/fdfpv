/*
 * refly.js: a saved clip flown again through the plant, headless.
 *
 * The owner reports physics by saving a replay ("I just saved a fall to
 * my clips"). A clip's rows hold what was drawn, one stick sample a frame
 * and the craft's pose, which is not enough to fly it again: the plant
 * took its sticks on the 250 Hz RC grid over 1 ms steps, and its state is
 * far more than a pose (the controller's filters and integrators, the
 * motors, the pack, the wind, the damage). The crash cam's journal
 * (src/replay/journal.js) holds exactly what is missing, for TAKE OVER: a
 * copy of the plant's region once a second and every call the shell made
 * into the module since. This keeps that beside a clip.
 *
 * WHAT A CLIP KEEPS (`clip.refly`):
 * - build: the git blob id of the dist/sim.wasm that flew it
 *   (journal.js wasmBuild), or null where the page could not hash it;
 *   abi: its sim_abi_version.
 * - lo, hi: the plant's region in that module's memory.
 * - names: the module's functions as the calls number them.
 * - segs: the journal's stretches from the one the clip's first row is
 *   in to the newest, each its sim time `t`, its calls, and `broken`, the
 *   call it stops being replayable at (a sim_init, the recording switched
 *   off), or null. The first carries the whole region as it stood at its
 *   copy, each later one the pages its copy changed.
 * - marks: i32[n x 2], each row's stretch (an index into segs, -1 for a
 *   row that cannot be flown back to) and its place in that stretch's
 *   calls. The rows' own marks (HEAD.markSeg) stay zeroed in a file, as
 *   they always were, so a file never takes over from the live journal.
 *
 * ONE BUILD ONLY. The region holds every static the module has, its
 * tables of airframe constants among them (plant.c's `.rho = 1.225` is
 * data, not code), so writing a region into another build either fails
 * (the layout moved) or, worse, quietly puts the old build's constants
 * back over the new ones and flies the old plant. The re-fly refuses a
 * module whose build is not the clip's, by its id, never by the layout
 * happening to match. `git cat-file blob <build>` gives the right one back.
 *
 * Packed, the region and the calls are deflated (CompressionStream), so a
 * file holds them as opaque bytes and reading a file stays synchronous:
 * unpackRefly opens them when a re-fly needs them.
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

import { HEAD, HEAD_N, stateHash } from './recorder.js';
import { playCalls, plantRegion } from './journal.js';

const PAGE = 4096;
/* What a file may claim, checked before anything is allocated: the
 * journal keeps 33 stretches, a region is under 2 MB today, a stretch of
 * calls is cut at 2^21 doubles, and the module has a few hundred
 * functions. Each bound has room over it. */
export const REFLY_SEGS_MAX = 64;
export const REFLY_REGION_MAX = 64 << 20;
export const REFLY_CALLS_MAX = 1 << 22;
export const REFLY_NAMES_MAX = 1024;
const BUILD_RE = /^[0-9a-f]{40}$/;
const NAME_RE = /^sim_\w{1,60}$/;

/*
 * A clip's refly from the journal's span (journal.exportSpan, taken when
 * the clip was cut) and the rows' marks in its head. Null when the span is
 * missing or no row can be flown back to.
 */
export function reflyOf(span, clip) {
  if (!span || !span.segs.length) {
    return null;
  }
  const index = new Map(span.segs.map((s, i) => [s.id, i]));
  const marks = new Int32Array(clip.n * 2);
  let any = false;
  for (let k = 0; k < clip.n; k += 1) {
    const id = clip.head[k * HEAD_N + HEAD.markSeg];
    const pos = clip.head[k * HEAD_N + HEAD.markPos];
    const at = index.has(id) ? index.get(id) : -1;
    const seg = at >= 0 ? span.segs[at] : null;
    const ok = seg && pos <= seg.calls.length && (seg.broken === null || pos <= seg.broken);
    marks[k * 2] = ok ? at : -1;
    marks[k * 2 + 1] = ok ? pos : 0;
    any = any || Boolean(ok);
  }
  if (!any) {
    return null;
  }
  return {
    build: span.build,
    abi: span.abi,
    lo: span.lo,
    hi: span.hi,
    names: span.names,
    segs: span.segs.map((s) => ({
      t: s.t, calls: s.calls, delta: s.delta, broken: s.broken,
    })),
    region: span.region,
    marks,
    packed: null,
  };
}

/* Rows [a, b] of a clip's refly, as trimClip cuts the rest: the stretches
 * stay whole, since a later row is flown to from the first one's copy. */
export function trimRefly(refly, a, b) {
  return { ...refly, marks: refly.marks.slice(a * 2, (b + 1) * 2) };
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/* The bytes a refly's stretches are packed from, in this order, each part
 * aligned for its type: every stretch's calls (f64), every later
 * stretch's page list (i32), the region (u8), every later stretch's pages
 * (u8, a whole page each) and its tail (the region's last size % 4
 * bytes). */
function layout(refly) {
  const size = refly.hi - refly.lo;
  const calls = refly.segs.reduce((x, s) => x + s.calls, 0);
  const pages = refly.segs.reduce((x, s) => x + s.pages, 0);
  const later = Math.max(0, refly.segs.length - 1);
  return {
    size, calls, pages, bytes: calls * 8 + pages * 4 + size + pages * PAGE + later * (size & 3),
  };
}

/* A refly with its stretches deflated into `packed`, as a file holds it. */
export async function packRefly(refly) {
  if (refly.packed) {
    return refly;
  }
  const segs = refly.segs.map((s, i) => ({
    t: s.t, calls: s.calls.length, pages: i === 0 ? 0 : s.delta.pages.length, broken: s.broken,
  }));
  const shape = { ...refly, segs };
  const L = layout(shape);
  const raw = new Uint8Array(L.bytes);
  let o = 0;
  for (const s of refly.segs) {
    new Float64Array(raw.buffer, o, s.calls.length).set(s.calls);
    o += s.calls.length * 8;
  }
  for (const s of refly.segs.slice(1)) {
    new Int32Array(raw.buffer, o, s.delta.pages.length).set(s.delta.pages);
    o += s.delta.pages.length * 4;
  }
  raw.set(refly.region, o);
  o += L.size;
  for (const s of refly.segs.slice(1)) {
    raw.set(s.delta.data.subarray(0, s.delta.pages.length * PAGE), o);
    o += s.delta.pages.length * PAGE;
    raw.set(s.delta.tail, o);
    o += L.size & 3;
  }
  const packed = await pipe(raw, new CompressionStream('deflate-raw'));
  return {
    build: refly.build, abi: refly.abi, lo: refly.lo, hi: refly.hi, names: refly.names, segs, marks: refly.marks, packed,
  };
}

/* A packed refly opened: each stretch's calls and changed pages, and the
 * region at the first copy. Throws on bytes that are not what the header
 * says. */
export async function unpackRefly(refly) {
  if (!refly.packed) {
    return refly;
  }
  const raw = await pipe(refly.packed, new DecompressionStream('deflate-raw'));
  const L = layout(refly);
  if (raw.byteLength !== L.bytes) {
    throw new Error(`the refly's stretches are ${raw.byteLength} bytes, its header says ${L.bytes}`);
  }
  const buf = raw.buffer;
  let o = 0;
  const calls = refly.segs.map((s) => {
    const c = new Float64Array(buf.slice(o, o + s.calls * 8));
    o += s.calls * 8;
    return c;
  });
  const pages = refly.segs.map((s, i) => {
    if (i === 0) {
      return null;
    }
    const p = new Int32Array(buf.slice(o, o + s.pages * 4));
    o += s.pages * 4;
    return p;
  });
  const region = raw.slice(o, o + L.size);
  o += L.size;
  const pageCount = Math.ceil(L.size / PAGE);
  const segs = refly.segs.map((s, i) => {
    let delta = null;
    if (i > 0) {
      const data = raw.slice(o, o + s.pages * PAGE);
      o += s.pages * PAGE;
      const tail = raw.slice(o, o + (L.size & 3));
      o += L.size & 3;
      for (const pg of pages[i]) {
        if (!(pg >= 0 && pg < pageCount)) {
          throw new Error(`stretch ${i} changes page ${pg}, the region has ${pageCount}`);
        }
      }
      delta = { pages: pages[i], data, tail };
    }
    return {
      t: s.t, calls: calls[i], delta, broken: s.broken,
    };
  });
  return { ...refly, segs, region, packed: null };
}

/* A file's refly header checked, before its bytes are trusted. Throws a
 * plain Error with the reason; file.js makes it a refusal. */
export function checkReflyHeader(h, n) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) {
    throw new Error('refly is not a refly');
  }
  const keys = ['build', 'abi', 'lo', 'hi', 'names', 'segs', 'bytes'];
  const extra = Object.keys(h).filter((k) => !keys.includes(k));
  if (extra.length) {
    throw new Error(`refly has ${extra.join(', ')}`);
  }
  if (!(h.build === null || (typeof h.build === 'string' && BUILD_RE.test(h.build)))) {
    throw new Error('refly.build is not a build');
  }
  if (!Number.isInteger(h.abi) || !Number.isInteger(h.lo) || !Number.isInteger(h.hi)
    || h.lo < 0 || h.hi <= h.lo || h.hi - h.lo > REFLY_REGION_MAX) {
    throw new Error('refly\'s region is not a region');
  }
  if (!Array.isArray(h.names) || h.names.length < 1 || h.names.length > REFLY_NAMES_MAX
    || !h.names.every((x) => typeof x === 'string' && NAME_RE.test(x))) {
    throw new Error('refly.names is not a list of the module\'s functions');
  }
  if (!Array.isArray(h.segs) || h.segs.length < 1 || h.segs.length > REFLY_SEGS_MAX) {
    throw new Error('refly.segs is not a list of stretches');
  }
  const pageCount = Math.ceil((h.hi - h.lo) / PAGE);
  h.segs.forEach((s, i) => {
    const ok = s && typeof s === 'object' && Object.keys(s).every((k) => ['t', 'calls', 'pages', 'broken'].includes(k))
      && Number.isFinite(s.t) && Number.isInteger(s.calls) && s.calls >= 0 && s.calls <= REFLY_CALLS_MAX
      && Number.isInteger(s.pages) && s.pages >= 0 && s.pages <= pageCount && (i > 0 || s.pages === 0)
      && (s.broken === null || (Number.isInteger(s.broken) && s.broken >= 0 && s.broken <= s.calls));
    if (!ok) {
      throw new Error(`refly.segs[${i}] is not a stretch`);
    }
  });
  if (!Number.isInteger(h.bytes) || h.bytes < 1) {
    throw new Error('refly.bytes is not a length');
  }
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('refly without rows');
  }
}

/* A file's marks checked against its header's stretches. */
export function checkReflyMarks(marks, h, n) {
  if (!(marks instanceof Int32Array) || marks.length !== n * 2) {
    throw new Error('the refly\'s marks are not the clip\'s length');
  }
  for (let k = 0; k < n; k += 1) {
    const s = marks[k * 2];
    const pos = marks[k * 2 + 1];
    if (s === -1 && pos === 0) {
      continue;
    }
    const seg = h.segs[s];
    if (!seg || pos < 0 || pos > seg.calls || (seg.broken !== null && pos > seg.broken)) {
      throw new Error(`frame ${k}'s refly mark is not in its stretches`);
    }
  }
}

/* What a refly says about itself, for a reader to print. */
export function describeRefly(refly, n) {
  let flyable = 0;
  for (let k = 0; k < n; k += 1) {
    flyable += refly.marks[k * 2] >= 0 ? 1 : 0;
  }
  return {
    build: refly.build, abi: refly.abi, region: refly.hi - refly.lo, segs: refly.segs.length,
    broken: refly.segs.filter((s) => s.broken !== null).length, flyable, rows: n,
  };
}

function applyDelta(target, delta, size) {
  for (let j = 0; j < delta.pages.length; j += 1) {
    const a = delta.pages[j] * PAGE;
    const z = Math.min(a + PAGE, size);
    target.set(delta.data.subarray(j * PAGE, j * PAGE + (z - a)), a);
  }
  target.set(delta.tail, size & ~3);
}

/*
 * The bytes of the region malloc and free keep their own state in, found
 * by allocating and freeing on `e` across the sizes and marking every byte
 * that moved. The plant never allocates (src/replay/journal.js), so these
 * are not the plant: they are the shell's heap, which the shell changes
 * between two copies with no call the journal sees (a buffer made on the
 * first frame, say). A copy is held to the re-fly's region without them.
 */
function allocatorBytes(e, region) {
  const size = region.hi - region.lo;
  const before = new Uint8Array(e.memory.buffer, region.lo, size).slice();
  const mask = new Uint8Array(size);
  const look = () => {
    const now = new Uint8Array(e.memory.buffer, region.lo, size);
    for (let i = 0; i < size; i += 1) {
      if (now[i] !== before[i]) {
        mask[i] = 1;
      }
    }
  };
  const held = [];
  for (let n = 8; n <= 1 << 22; n *= 2) {
    held.push(e.malloc(n), e.malloc(n + 3));
    look();
  }
  for (const p of held.reverse()) {
    e.free(p);
    look();
  }
  return mask;
}

/*
 * Fly an unpacked refly again on `e`, a fresh module's exports straight
 * from the instance (nothing allocated from it yet), which the caller has
 * already found to be the clip's build. Every row that can be flown back
 * to is reached by writing a copy of the region and making the calls
 * again, and the plant's state block read there. Rows in time order fly
 * on from the last without a fresh copy; at each copy the flight passes,
 * the region it has made is held to the copy the journal took then,
 * byte for byte, which is the determinism of the calls themselves.
 *
 * `opts.seeded(e)`, when given, is called each time a copy is written:
 * the self test's negative control changes the plant there.
 *
 * Returns { states: (Float64Array | null)[n], hashes: (boolean | null)[n],
 * copies: { checked, same, first, allocator }, seeds }: `allocator` the
 * count of the region's bytes left out of the copies' comparison.
 */
export function reflyRun(e, clip, refly, opts = {}) {
  const region = plantRegion(e);
  if (region.lo !== refly.lo || region.hi !== refly.hi) {
    throw new Error(`the module's plant is at ${region.lo}..${region.hi}, the clip's at ${refly.lo}..${refly.hi}: not the clip's build`);
  }
  const missing = refly.names.filter((nm) => typeof e[nm] !== 'function');
  if (missing.length) {
    throw new Error(`the module has no ${missing.join(', ')}: not the clip's build`);
  }
  const fns = refly.names.map((nm) => e[nm]);
  const allocator = allocatorBytes(e, region);
  const scratch = e.malloc(1 << 16);
  const nState = e.sim_state_size();
  const statePtr = e.malloc(nState * 8);
  const size = refly.hi - refly.lo;
  const mem = () => new Uint8Array(e.memory.buffer, refly.lo, size);

  /* The journal's copy at stretch k, made from the first by its changed
   * pages; the last one made is kept, since the rows mostly go forward. */
  let copyK = 0;
  let copy = refly.region.slice();
  function copyAt(k) {
    if (k < copyK) {
      copyK = 0;
      copy = refly.region.slice();
    }
    while (copyK < k) {
      copyK += 1;
      applyDelta(copy, refly.segs[copyK].delta, size);
    }
    return copy;
  }

  let seg = -1;
  let pos = 0;
  let argvs = null;
  let seeds = 0;
  function seed(k) {
    mem().set(copyAt(k));
    seg = k;
    pos = 0;
    argvs = refly.names.map(() => []);
    seeds += 1;
    if (opts.seeded) {
      opts.seeded(e);
    }
  }

  const copies = {
    checked: 0, same: 0, first: null, allocator: allocator.reduce((x, b) => x + b, 0),
  };
  function play(to) {
    playCalls(e, fns, refly.names, scratch, refly.segs[seg].calls, pos, to, argvs);
    pos = to;
  }

  const states = new Array(clip.n).fill(null);
  const hashes = new Array(clip.n).fill(null);
  for (let k = 0; k < clip.n; k += 1) {
    const s = refly.marks[k * 2];
    const p = refly.marks[k * 2 + 1];
    if (s < 0) {
      continue;
    }
    if (seg < 0 || s < seg || (s === seg && p < pos)) {
      seed(s);
    }
    while (seg < s) {
      const cur = refly.segs[seg];
      if (cur.broken !== null) {
        seed(seg + 1);
        continue;
      }
      play(cur.calls.length);
      const want = copyAt(seg + 1);
      const have = mem();
      let same = true;
      for (let i = 0; i < size; i += 1) {
        if (have[i] !== want[i] && !allocator[i]) {
          same = false;
          break;
        }
      }
      copies.checked += 1;
      copies.same += same ? 1 : 0;
      if (!same && copies.first === null) {
        copies.first = seg + 1;
      }
      /* Flown on from what the calls made, not from the copy: a
       * difference here shows in every row after it, as it should. */
      seg += 1;
      pos = 0;
      argvs = refly.names.map(() => []);
    }
    play(p);
    e.sim_state(statePtr);
    const st = new Float64Array(e.memory.buffer, statePtr, nState).slice();
    states[k] = st;
    hashes[k] = stateHash(st) === clip.head[k * HEAD_N + HEAD.stateHash];
  }
  return {
    states, hashes, copies, seeds,
  };
}
