/*
 * journal.js: the plant's input stream, kept so a replay can be flown again.
 *
 * TAKE OVER needs the plant exactly as it was at a recorded frame. The
 * plant is dist/sim.wasm, and every bit of its state is static C data: the
 * native sources never call malloc (grep src/native), so the controller,
 * the plant, the crash core and the free bodies all live between the end
 * of the stack and the heap's base. The heap holds only the shell's own
 * scratch buffers. So a copy of that one region IS the plant, and writing
 * it back puts the plant back, bit for bit.
 *
 * A copy per frame is too much (880 kB), so the region is kept once a
 * second, as the pages that changed since the last copy (a flight changes
 * about sixteen of its 215 pages a second), and between two copies every
 * call the shell makes into the module is written down with its arguments.
 * Restoring the copy before a frame and making the same calls again, in
 * the same order, with the same doubles, gives the plant at that frame:
 * the module is deterministic by design (CLAUDE.md), so the same calls are
 * the same state. scripts/replay-selftest.js proves it bit for bit.
 *
 * The journal only reads. It hands the shell a table of the module's own
 * functions, each of which records its arguments and then calls the real
 * one with them, unchanged, and returns its answer unchanged. A few pure
 * readers that the shell calls every step are not written down at all;
 * the self test checks each of them leaves the region untouched.
 *
 * Pointers. A call that writes its answer to the heap is made again with a
 * scratch buffer of the journal's own, so a replay never writes into a
 * buffer the shell has since freed or reused. A call that reads doubles
 * from the heap (sim_set_power, sim_wing_set_tune, sim_set_addons) has
 * them copied into the journal. A call that reads a string (sim_init) cannot be replayed
 * from here and ends the
 * stretch that can: the next copy starts a new one.
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

/* Pure readers the shell calls every step or every frame. Not written
 * down, which is most of the journal's size saved. Each is checked by the
 * self test to leave the plant's region byte identical. */
export const PURE = new Set([
  'sim_abi_version', 'sim_state_size', 'sim_state', 'sim_ground_contacts', 'sim_obstacle_contacts',
  'sim_damage_flags', 'sim_damage', 'sim_parts_state', 'sim_parts_count', 'sim_part_info', 'sim_part_hull',
  'sim_part_table', 'sim_free_bodies_active', 'sim_damage_events_dropped', 'sim_motor_damage',
  'sim_material_info', 'sim_obstacle_state', 'sim_power_state', 'sim_wing_surfaces', 'sim_plane_surfaces',
  'sim_wing_debug', 'sim_wing_biplane', 'sim_wheel_loads', 'sim_float_state', 'sim_wind', 'sim_air_lift', 'sim_water_sample',
  'sim_water_components', 'sim_airframe', 'sim_air', 'sim_gravity', 'sim_boost', 'sim_wing_stab', 'sim_wing_chute_open',
  'sim_wing_flaps', 'sim_launch_control_state', 'sim_crashflip_active', 'sim_rate_guard_trips',
  'sim_math_sin', 'sim_math_cos', 'sim_math_atan2', 'sim_bf_debug', 'sim_bf_dump', 'sim_bf_get',
  'sim_crash_debug', 'sim_wing_tune', 'sim_addons_state', 'sim_wing_discus_phase',
]);

/* Arguments that are heap pointers, by function: `out` is written by the
 * module and redirected to scratch on a replay, `in` is read by it and
 * copied into the journal (`doubles` of them). A function missing here
 * takes numbers only; the self test holds this table to sim_abi.h. */
export const POINTERS = {
  sim_init: { in: 0, unreplayable: true },
  sim_set_power: { in: 0, doubles: 17 },
  sim_wing_set_tune: { in: 0, doubles: 11 },
  sim_set_addons: { in: 0, doubles: 10 },
  sim_set_addon_inertia: { in: 0, doubles: 3 },
  sim_wing_tune: { out: 0 },
  sim_addons_state: { out: 0 },
  sim_wing_surfaces: { out: 0 },
  sim_plane_surfaces: { out: 0 },
  sim_wing_debug: { out: 0 },
  sim_wing_biplane: { out: 0 },
  sim_wheel_loads: { out: 0 },
  sim_wind: { out: 0 },
  sim_power_state: { out: 0 },
  sim_water_sample: { out: 3 },
  sim_water_components: { out: 1 },
  sim_float_state: { out: 0 },
  sim_part_info: { out: 1 },
  sim_part_hull: { out: 1 },
  sim_parts_state: { out: 0 },
  sim_damage_events: { out: 0 },
  sim_motor_damage: { out: 0 },
  sim_material_info: { out: 1 },
  sim_obstacle_state: { out: 1 },
  sim_state: { out: 0 },
  sim_crash_debug: { out: 0 },
  sim_bf_dump: { out: 0 },
  sim_bf_get: { in: 0, unreplayable: true },
};

const PAGE = 4096;
const SCRATCH_BYTES = 1 << 16;
/* How far apart the copies are, seconds of sim time, and how many are
 * kept: a replay holds 30 s, so a frame at its start still has a copy
 * before it. Kept by count, not by time, because R sets the sim clock back
 * to zero. A stretch that writes this many doubles without a copy (a long
 * sit on the pad, where the clock does not run) is cut there too. */
export const SNAPSHOT_EVERY_S = 1;
const RETAIN = 33;
const STRETCH_MAX = 1 << 21;

/*
 * The plant's region: from the stack's base (the module is linked stack
 * first, so the stack is below it and is empty between two calls) to the
 * heap's base. Found on a module no one has allocated from: its first
 * block sits one allocator header past the base, which is 16 aligned.
 */
export function plantRegion(e) {
  const lo = typeof e.emscripten_stack_get_base === 'function' ? e.emscripten_stack_get_base() : 65536;
  const p = e.malloc(1);
  e.free(p);
  const hi = p & ~15;
  if (!(p > lo && hi > lo && p - hi <= 16)) {
    throw new Error(`journal: no plant region (stack ${lo}, first block ${p})`);
  }
  return { lo, hi };
}

/*
 * `e` is the module's exports, straight from the instance, before anyone
 * has called malloc. Returns { exports, ... }: `exports` is what the shell
 * uses in their place.
 */
export function createJournal(e, opts = {}) {
  const region = opts.region ?? plantRegion(e);
  const size = region.hi - region.lo;
  const pageCount = Math.ceil(size / PAGE);
  const scratch = e.malloc(SCRATCH_BYTES);
  if (!scratch) {
    throw new Error('journal: no scratch');
  }
  const retain = opts.retain ?? RETAIN;

  const names = [];
  const raw = [];
  const exports = {};
  for (const name of Object.keys(e)) {
    const f = e[name];
    if (typeof f !== 'function' || !name.startsWith('sim_') || PURE.has(name)) {
      Object.defineProperty(exports, name, { get: () => e[name], enumerable: true });
      continue;
    }
    const id = names.length;
    names.push(name);
    raw.push(f);
    const ptr = POINTERS[name];
    exports[name] = ptr && ptr.in !== undefined ? pointerIn(id, f, ptr) : function logged() {
      if (seg && logging) {
        note(id, arguments, null);
      }
      return f.apply(null, arguments);
    };
  }

  /* A stretch between two copies: its copy (the changed pages, or null for
   * the oldest, whose copy is `base`), and the calls made since. */
  let seg = null;
  const segs = [];
  let nextId = 1;
  let base = null;
  let head = null;
  let calls = 0;
  let logging = true;

  /* Off, the calls go unwritten, so the stretch they fall in cannot be
   * flown back through; the next copy starts a sound one. */
  function setLogging(on) {
    if (!on && seg) {
      seg.brokenAt = Math.min(seg.brokenAt, seg.n);
    }
    logging = Boolean(on);
  }

  function pointerIn(id, f, ptr) {
    return function loggedIn() {
      if (seg && logging) {
        if (ptr.unreplayable) {
          seg.brokenAt = Math.min(seg.brokenAt, seg.n);
        } else {
          const p = arguments[ptr.in];
          note(id, arguments, new Float64Array(e.memory.buffer, p, ptr.doubles));
        }
      }
      return f.apply(null, arguments);
    };
  }

  /* Per function, the arguments of its last call in this stretch, so a
   * call made again with the same doubles (the ground plane, every step) is
   * written as one number. Object.is, because 0 and -0 are two doubles. */
  const lastArgs = names.map(() => null);
  const lastIn = new Float64Array(names.length);

  function same(id, args) {
    const a = lastArgs[id];
    if (!a || lastIn[id] !== seg.id || a.length !== args.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], args[i])) {
        return false;
      }
    }
    return true;
  }

  function room(need) {
    if (need > seg.buf.length) {
      const grown = new Float64Array(Math.max(need, seg.buf.length * 2));
      grown.set(seg.buf.subarray(0, seg.n));
      seg.buf = grown;
    }
  }

  function note(id, args, extra) {
    calls += 1;
    if (!extra && same(id, args)) {
      room(seg.n + 1);
      seg.buf[seg.n] = -1 - id;
      seg.n += 1;
      return;
    }
    const argc = args.length;
    const k = extra ? extra.length : 0;
    room(seg.n + 3 + argc + k);
    const b = seg.buf;
    let w = seg.n;
    b[w] = id;
    b[w + 1] = argc;
    b[w + 2] = k;
    w += 3;
    let a = lastArgs[id];
    if (!a || a.length !== argc) {
      a = new Float64Array(argc);
      lastArgs[id] = a;
    }
    for (let i = 0; i < argc; i += 1) {
      b[w + i] = args[i];
      a[i] = args[i];
    }
    lastIn[id] = extra ? 0 : seg.id;
    w += argc;
    for (let i = 0; i < k; i += 1) {
      b[w + i] = extra[i];
    }
    seg.n = w + k;
  }

  function bytes() {
    return new Uint8Array(e.memory.buffer, region.lo, size);
  }

  /* The pages of the region that differ from `head`, copied, and `head`
   * brought level. */
  function diffPages() {
    const now = new Int32Array(e.memory.buffer, region.lo, size >> 2);
    const was = new Int32Array(head.buffer, 0, size >> 2);
    const changed = [];
    const words = PAGE >> 2;
    for (let pg = 0; pg < pageCount; pg += 1) {
      const a = pg * words;
      const z = Math.min(a + words, now.length);
      for (let i = a; i < z; i += 1) {
        if (now[i] !== was[i]) {
          changed.push(pg);
          break;
        }
      }
    }
    const src = bytes();
    const data = new Uint8Array(changed.length * PAGE);
    changed.forEach((pg, j) => {
      const a = pg * PAGE;
      const z = Math.min(a + PAGE, size);
      data.set(src.subarray(a, z), j * PAGE);
      head.set(src.subarray(a, z), a);
    });
    /* The region's tail past the last whole word. */
    for (let i = size & ~3; i < size; i += 1) {
      head[i] = src[i];
    }
    return { pages: Int32Array.from(changed), data, tail: src.slice(size & ~3) };
  }

  function apply(target, delta) {
    for (let j = 0; j < delta.pages.length; j += 1) {
      const a = delta.pages[j] * PAGE;
      const z = Math.min(a + PAGE, size);
      target.set(delta.data.subarray(j * PAGE, j * PAGE + (z - a)), a);
    }
    target.set(delta.tail, size & ~3);
  }

  /* Copy the region now, at sim time `t`, and start a new stretch. */
  function snapshot(t) {
    let delta = null;
    if (!head) {
      head = bytes().slice();
      base = head.slice();
    } else {
      delta = diffPages();
    }
    let room = 4096;
    if (seg) {
      /* The stretch just closed is kept at its length, not its capacity. */
      seg.buf = seg.buf.slice(0, seg.n);
      room = Math.max(1024, seg.n);
    }
    seg = { id: nextId, t, delta, buf: new Float64Array(room), n: 0, brokenAt: Infinity };
    nextId += 1;
    segs.push(seg);
    while (segs.length > retain) {
      segs.shift();
      apply(base, segs[0].delta);
      segs[0].delta = null;
    }
    return seg.id;
  }

  /* Where the journal is now, for a frame to be flown back to. */
  function mark() {
    return seg && seg.brokenAt === Infinity ? [seg.id, seg.n] : [0, 0];
  }

  function due(t) {
    return !seg || seg.brokenAt !== Infinity || t - seg.t >= SNAPSHOT_EVERY_S || t < seg.t || seg.n > STRETCH_MAX;
  }

  function find(id) {
    return segs.find((s) => s.id === id) || null;
  }

  function canRestore(m) {
    const s = find(m[0]);
    return Boolean(s) && m[1] <= s.n && m[1] <= s.brokenAt;
  }

  /*
   * Put the plant back to mark `m`: the copy at its stretch's start, then
   * that stretch's calls up to the mark. Everything after the mark is
   * forgotten, since the flight from here is a new one, which starts a
   * stretch of its own at sim time `t`.
   */
  function restore(m, t) {
    const at = segs.findIndex((s) => s.id === m[0]);
    if (at < 0 || !canRestore(m)) {
      return false;
    }
    const mem = bytes();
    mem.set(base);
    for (let k = 1; k <= at; k += 1) {
      apply(mem, segs[k].delta);
    }
    /* The next copy is diffed against this stretch's own, which is the
     * region as it stands now, before the calls are made again. */
    head = mem.slice();
    const s = segs[at];
    replay(s.buf, m[1]);
    segs.length = at + 1;
    s.n = m[1];
    seg = s;
    snapshot(t);
    return true;
  }

  function replay(buf, n) {
    const argvs = names.map(() => []);
    let r = 0;
    while (r < n) {
      let id = buf[r];
      if (id < 0) {
        id = -1 - id;
        r += 1;
        raw[id].apply(null, argvs[id]);
        continue;
      }
      const argc = buf[r + 1];
      const k = buf[r + 2];
      r += 3;
      const argv = argvs[id];
      argv.length = argc;
      for (let i = 0; i < argc; i += 1) {
        argv[i] = buf[r + i];
      }
      r += argc;
      const ptr = POINTERS[names[id]];
      if (ptr && ptr.out !== undefined) {
        argv[ptr.out] = scratch;
      }
      if (ptr && ptr.in !== undefined) {
        new Float64Array(e.memory.buffer, scratch, k).set(buf.subarray(r, r + k));
        argv[ptr.in] = scratch;
      }
      r += k;
      raw[id].apply(null, argv);
    }
  }

  /* What the journal holds, for the harness and the memory report. */
  function stats() {
    let callBytes = 0;
    let pageBytes = 0;
    for (const s of segs) {
      callBytes += s.buf.byteLength;
      pageBytes += s.delta ? s.delta.data.byteLength : 0;
    }
    return {
      region: size, segments: segs.length, calls, callBytes, pageBytes,
      bytes: callBytes + pageBytes + (base ? base.byteLength * 2 : 0),
      oldestT: segs.length ? segs[0].t : null,
    };
  }

  return { exports, snapshot, mark, due, canRestore, restore, stats, setLogging, region, names };
}
