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
 * from the heap (sim_set_power, sim_wing_set_tune, sim_wing_set_tiers, sim_set_addons) has
 * them copied into the journal. A call that reads a string (sim_init) cannot be replayed
 * from here and ends the
 * stretch that can: the next copy starts a new one.
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

import { logWarn } from '../share/crashrecord.js';

/* Pure readers the shell calls every step or every frame. Not written
 * down, which is most of the journal's size saved. Each is checked by the
 * self test to leave the plant's region byte identical. */
export const PURE = new Set([
  'sim_abi_version', 'sim_state_size', 'sim_state', 'sim_ground_contacts', 'sim_obstacle_contacts',
  'sim_damage_flags', 'sim_damage', 'sim_parts_state', 'sim_parts_count', 'sim_part_info', 'sim_part_hull',
  'sim_part_table', 'sim_free_bodies_active', 'sim_damage_events_dropped', 'sim_motor_damage',
  'sim_material_info', 'sim_obstacle_state', 'sim_power_state', 'sim_wing_surfaces', 'sim_plane_surfaces',
  'sim_wing_debug', 'sim_wing_biplane', 'sim_wing_slip', 'sim_wing_yaw_budget', 'sim_wing_command', 'sim_wing_strips', 'sim_wheel_loads', 'sim_float_state', 'sim_wind', 'sim_air_lift', 'sim_water_sample',
  'sim_water_components', 'sim_airframe', 'sim_air', 'sim_gravity', 'sim_boost', 'sim_wing_stab', 'sim_wing_chute_open',
  'sim_wing_flaps', 'sim_launch_control_state', 'sim_crashflip_active', 'sim_rate_guard_trips',
  'sim_math_sin', 'sim_math_cos', 'sim_math_atan2', 'sim_bf_debug', 'sim_bf_dump', 'sim_bf_get',
  'sim_crash_debug', 'sim_wing_tune', 'sim_wing_tiers', 'sim_addons_state', 'sim_wing_discus_phase', 'sim_live_inertia',
]);

/* Arguments that are heap pointers, by function: `out` is written by the
 * module and redirected to scratch on a replay, `in` is read by it and
 * copied into the journal (`doubles` of them). A function missing here
 * takes numbers only; the self test holds this table to sim_abi.h. */
export const POINTERS = {
  sim_init: { in: 0, unreplayable: true },
  sim_set_power: { in: 0, doubles: 17 },
  sim_set_motors: { in: 0, doubles: 7 },
  sim_set_prop_pack: { in: 0, doubles: 36 },
  sim_wing_set_tune: { in: 0, doubles: 12 },
  sim_wing_set_tiers: { in: 0, doubles: 9 },
  sim_wing_set_heading: { in: 0, doubles: 3 },
  sim_set_addons: { in: 0, doubles: 10 },
  sim_set_addon_inertia: { in: 0, doubles: 3 },
  sim_wing_tune: { out: 0 },
  sim_wing_tiers: { out: 0 },
  sim_addons_state: { out: 0 },
  sim_live_inertia: { out: 0 },
  sim_wing_surfaces: { out: 0 },
  sim_plane_surfaces: { out: 0 },
  sim_wing_debug: { out: 0 },
  sim_wing_biplane: { out: 0 },
  sim_wing_slip: { out: 0 },
  sim_wing_yaw_budget: { out: 0 },
  sim_wing_command: { out: 0 },
  sim_wing_strips: { out: 0 },
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

/*
 * THE SETUP LOG. A region copy flies the clip again on its own build only
 * (src/replay/refly.js). To fly it on another, that build has to be set up
 * the way the shell set this one up: so beside the stretches the journal
 * keeps the text of the last sim_init and every call made since it except
 * the ones the shell makes every step, each with where it fell in the
 * stretches. Those every-step calls are the flight itself, which the
 * stretches keep; what is left (the airframe, the tune, the power, the
 * world, the modes and switches) is small and grows only when the pilot
 * changes something. Measured in the shell: see docs/CONTROL-RECORDER.md.
 *
 * Left out too: sim_wing_gear, a reader the shell asks every frame that
 * is not in PURE. The air (sim_set_wind, sim_set_air_vertical) is set
 * before every step of a flight in weather (src/main.js pushWeather), so
 * it is the flight's too: logged, it filled the log in about 100 s and
 * every later clip of the session was cut short of it. And the world, which the shell declares again round the
 * craft about twice a second (a clear, then the trees, wires and solids
 * near it): a clear makes every declaration of its kind before it moot, so
 * once both lie before the oldest stretch kept (no clip can start before
 * that), the older ones are dropped (CLEARS, compactSetup).
 */
export const STEP_CALLS = new Set([
  'sim_input', 'sim_step', 'sim_set_ground', 'sim_set_ground_material', 'sim_damage_events', 'sim_wing_gear',
  'sim_set_wind', 'sim_set_air_vertical',
]);
const CLEARS = {
  sim_tree_clear: ['sim_tree_add', 'sim_tree_clump_add'],
  sim_wire_clear: ['sim_wire_add'],
  sim_obstacle_clear: ['sim_obstacle_box', 'sim_obstacle_cylinder', 'sim_obstacle_compliance'],
  sim_water_clear: ['sim_water_add', 'sim_water_level', 'sim_water_channel', 'sim_water_channel_point',
    'sim_water_vertex', 'sim_water_wind', 'sim_water_swell'],
  sim_power_clear: ['sim_set_power'],
  sim_addons_clear: ['sim_set_addons'],
  sim_wing_tune_clear: ['sim_wing_set_tune'],
  sim_wing_tiers_clear: ['sim_wing_set_tiers'],
};
/* Past this many doubles the log stops and says so: a shell calling a
 * setter every frame that should not be, which a re-fly then refuses. */
const SETUP_MAX = 1 << 20;

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
  /* Which dist/sim.wasm this is, once hashed (`opts.wasm`, its bytes), for
   * a saved clip to name: the region and the calls replay on that build
   * and no other. */
  let build = null;
  const named = opts.wasm ? wasmBuild(opts.wasm).then((id) => {
    build = id;
  }, (err) => {
    logWarn('save', 'journal: the build could not be named, saved clips will not say which it was', err);
  }) : Promise.resolve();

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
      if (setupLogged[id]) {
        noteSetup(id, arguments, null);
      }
      return f.apply(null, arguments);
    };
  }

  /* A stretch between two copies: its copy (the changed pages, or null for
   * the oldest, whose copy is `base`), and the calls made since. */
  let seg = null;
  const segs = [];
  /* The allocator's bytes in the region (allocatorSpans), found on the
   * first restore. */
  let spans = null;
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
      if (names[id] === 'sim_init') {
        startSetup(arguments[0], arguments[1]);
      } else if (setupLogged[id] && !ptr.unreplayable) {
        noteSetup(id, arguments, new Float64Array(e.memory.buffer, arguments[ptr.in], ptr.doubles));
      }
      return f.apply(null, arguments);
    };
  }

  /* The setup log: the last sim_init's text, and every call since it but
   * the every-step ones, each written whole (id, argc, k, the arguments,
   * the doubles read) with where it fell: the stretch it was made in (its
   * id, 0 before the first copy) and the length of that stretch's calls
   * once it was written down, so it lies before a row's mark [id, pos]
   * when its stretch is earlier, or the same and its place is <= pos. */
  const setupLogged = names.map((nm) => !STEP_CALLS.has(nm) && nm !== 'sim_init');
  const setup = {
    init: null, initAt: [0, 0], buf: new Float64Array(4096), n: 0, where: new Int32Array(512), entries: 0, overflow: false,
  };

  /* Each clear's kind, by function id: the clear's own id for a clear and
   * for every declaration it clears, -1 for the rest. */
  const kindOf = names.map(() => -1);
  for (const [clear, decl] of Object.entries(CLEARS)) {
    const c = names.indexOf(clear);
    if (c < 0) {
      continue;
    }
    kindOf[c] = c;
    decl.forEach((d) => {
      const i = names.indexOf(d);
      if (i >= 0) {
        kindOf[i] = c;
      }
    });
  }

  /* Drop from setup log `L` the declarations a later clear made moot,
   * where both were made before the stretch numbered `oldest` (the oldest
   * kept, before which no clip can start; or a clip's first). Everything
   * from there on is kept as it was made. */
  function compactSetup(L, oldest) {
    const offs = [];
    for (let r = 0, k = 0; k < L.entries; k += 1) {
      offs.push(r);
      r += 3 + L.buf[r + 1] + L.buf[r + 2];
    }
    const lastClear = new Map();
    for (let k = 0; k < L.entries && L.where[k * 2] < oldest; k += 1) {
      const id = L.buf[offs[k]];
      if (kindOf[id] === id) {
        lastClear.set(id, k);
      }
    }
    if (!lastClear.size) {
      return;
    }
    let w = 0;
    let e2 = 0;
    for (let k = 0; k < L.entries; k += 1) {
      const id = L.buf[offs[k]];
      const kind = kindOf[id];
      const moot = kind >= 0 && L.where[k * 2] < oldest && lastClear.has(kind) && k < lastClear.get(kind);
      if (moot) {
        continue;
      }
      const len = 3 + L.buf[offs[k] + 1] + L.buf[offs[k] + 2];
      L.buf.copyWithin(w, offs[k], offs[k] + len);
      w += len;
      L.where[e2 * 2] = L.where[k * 2];
      L.where[e2 * 2 + 1] = L.where[k * 2 + 1];
      e2 += 1;
    }
    L.n = w;
    L.entries = e2;
  }

  /* The setup log as a clip from stretch `first` on keeps it: a copy,
   * compacted to that stretch. */
  function exportSetup(first) {
    const L = {
      buf: setup.buf.slice(0, setup.n), n: setup.n, where: setup.where.slice(0, setup.entries * 2), entries: setup.entries,
    };
    compactSetup(L, first);
    return {
      init: setup.init.slice(), calls: L.buf.slice(0, L.n), where: L.where.slice(0, L.entries * 2), overflow: setup.overflow,
    };
  }

  /* A take over forgets every call after its mark, the setup log's with
   * the rest: a flap notch or a broken part from the flight it undoes is
   * not the flight flown on. A sim_init after the mark took the setup
   * before it with it, so the log cannot be whole again until the next. */
  function forgetSetupAfter(id, pos) {
    if (setup.initAt[0] > id || (setup.initAt[0] === id && setup.initAt[1] >= pos)) {
      setup.overflow = true;
    }
    let n = 0;
    let k = 0;
    for (; k < setup.entries; k += 1) {
      const ws = setup.where[k * 2];
      if (ws > id || (ws === id && setup.where[k * 2 + 1] > pos)) {
        break;
      }
      n += 3 + setup.buf[n + 1] + setup.buf[n + 2];
    }
    setup.entries = k;
    setup.n = n;
  }

  function startSetup(ptr, len) {
    setup.initAt = [seg ? seg.id : 0, seg ? seg.n : 0];
    setup.init = new Uint8Array(e.memory.buffer, ptr, len).slice();
    setup.n = 0;
    setup.entries = 0;
    setup.overflow = false;
  }

  function noteSetup(id, args, extra) {
    if (setup.overflow || !setup.init) {
      return;
    }
    const argc = args.length;
    const k = extra ? extra.length : 0;
    const need = setup.n + 3 + argc + k;
    if (need > SETUP_MAX) {
      setup.overflow = true;
      return;
    }
    if (need > setup.buf.length) {
      const grown = new Float64Array(Math.max(need, setup.buf.length * 2));
      grown.set(setup.buf.subarray(0, setup.n));
      setup.buf = grown;
    }
    if (setup.entries * 2 + 2 > setup.where.length) {
      const grown = new Int32Array(setup.where.length * 2);
      grown.set(setup.where);
      setup.where = grown;
    }
    const b = setup.buf;
    let w = setup.n;
    b[w] = id;
    b[w + 1] = argc;
    b[w + 2] = k;
    w += 3;
    for (let i = 0; i < argc; i += 1) {
      b[w + i] = args[i];
    }
    w += argc;
    for (let i = 0; i < k; i += 1) {
      b[w + i] = extra[i];
    }
    setup.n = w + k;
    setup.where[setup.entries * 2] = seg ? seg.id : 0;
    setup.where[setup.entries * 2 + 1] = seg ? seg.n : 0;
    setup.entries += 1;
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
    let dropped = false;
    while (segs.length > retain) {
      segs.shift();
      apply(base, segs[0].delta);
      segs[0].delta = null;
      dropped = true;
    }
    if (dropped) {
      compactSetup(setup, segs[0].id);
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
    /* malloc's bookkeeping is in the region too, and it is the shell's,
     * not the plant's: written back, it would forget a block the shell
     * made since the copy and hand it out again. It is kept as it is. */
    spans ??= allocatorSpans(e, region);
    const live = spans.map(([a, z]) => mem.slice(a, z));
    mem.set(base);
    for (let k = 1; k <= at; k += 1) {
      apply(mem, segs[k].delta);
    }
    spans.forEach(([a], i) => mem.set(live[i], a));
    /* The next copy is diffed against this stretch's own, which is the
     * region as it stands now, before the calls are made again. */
    head = mem.slice();
    const s = segs[at];
    replay(s.buf, m[1]);
    segs.length = at + 1;
    s.n = m[1];
    forgetSetupAfter(m[0], m[1]);
    seg = s;
    snapshot(t);
    return true;
  }

  function replay(buf, n) {
    playCalls(e, raw, names, scratch, buf, 0, n, names.map(() => []));
  }

  /*
   * The stretches from the one numbered `fromId` (or the oldest kept, if
   * that one is gone) to the newest, as a saved clip keeps them
   * (src/replay/refly.js): the region as it stood at the first one's copy,
   * then each later one's changed pages, and every stretch's calls. Copies
   * throughout, so the journal flying on changes nothing handed out.
   */
  function exportSpan(fromId) {
    const at = segs.findIndex((s) => s.id >= fromId);
    if (at < 0) {
      return null;
    }
    const copy = base.slice();
    for (let k = 1; k <= at; k += 1) {
      apply(copy, segs[k].delta);
    }
    const out = [];
    for (let k = at; k < segs.length; k += 1) {
      const s = segs[k];
      out.push({
        id: s.id,
        t: s.t,
        delta: k === at ? null : s.delta,
        calls: s.buf.slice(0, s.n),
        broken: s.brokenAt === Infinity ? null : s.brokenAt,
      });
    }
    return {
      build,
      abi: e.sim_abi_version(),
      lo: region.lo,
      hi: region.hi,
      names: names.slice(),
      region: copy,
      segs: out,
      setup: setup.init ? exportSetup(segs[at].id) : null,
    };
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
      region: size, segments: segs.length, calls, callBytes, pageBytes, setupBytes: setup.n * 8 + setup.entries * 8, setupCalls: setup.entries,
      bytes: callBytes + pageBytes + (base ? base.byteLength * 2 : 0),
      oldestT: segs.length ? segs[0].t : null,
    };
  }

  return {
    exports, snapshot, mark, due, canRestore, restore, stats, setLogging, exportSpan, named, region, names,
  };
}

/*
 * The spans of the region, [start, end) from its base, that malloc and
 * free keep their state in (dlmalloc's malloc_state and sbrk's break, for
 * this build). The module has no symbols, so they are found by watching:
 * blocks of every small bin's size and of every power of two to 1 MB made
 * and freed, every word of the region that moves marked, and marks less
 * than 64 bytes apart joined, so a field the probe happened not to move
 * between two that it did is inside the span. The plant never allocates
 * (the file's head), so no plant byte moves under malloc. Every block the
 * probe makes it frees, so the heap is left as it was found.
 */
export function allocatorSpans(e, region) {
  const words = (region.hi - region.lo) >> 2;
  const before = new Int32Array(e.memory.buffer, region.lo, words).slice();
  const moved = new Uint8Array(words);
  const look = () => {
    const now = new Int32Array(e.memory.buffer, region.lo, words);
    for (let i = 0; i < words; i += 1) {
      if (now[i] !== before[i]) {
        moved[i] = 1;
      }
    }
  };
  const sizes = [];
  for (let n = 8; n <= 512; n += 8) {
    sizes.push(n);
  }
  for (let n = 1024; n <= 1 << 20; n *= 2) {
    sizes.push(n, n + 24);
  }
  const held = sizes.map((n) => e.malloc(n));
  look();
  /* Every other block back first, so the bins fill, then the rest. */
  held.forEach((p, i) => {
    if (i % 2 === 0) {
      e.free(p);
    }
  });
  look();
  for (const n of sizes) {
    e.free(e.malloc(n));
  }
  look();
  held.forEach((p, i) => {
    if (i % 2 === 1) {
      e.free(p);
    }
  });
  look();
  const spans = [];
  for (let i = 0; i < words; i += 1) {
    if (!moved[i]) {
      continue;
    }
    const last = spans[spans.length - 1];
    if (last && i * 4 - last[1] < 64) {
      last[1] = i * 4 + 4;
    } else {
      spans.push([i * 4, i * 4 + 4]);
    }
  }
  return spans;
}

/*
 * A build's name: the git blob id of its bytes, sha1 of "blob <length>\0"
 * and the bytes, so `git cat-file blob <id>` hands back the very module a
 * clip was flown on (dist/sim.wasm is committed). Null where the page has
 * no SubtleCrypto (an insecure origin).
 */
export async function wasmBuild(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) {
    return null;
  }
  const head = new TextEncoder().encode('blob ' + bytes.byteLength + '\0');
  const all = new Uint8Array(head.length + bytes.byteLength);
  all.set(head, 0);
  all.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), head.length);
  const digest = new Uint8Array(await subtle.digest('SHA-1', all));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/*
 * Calls `buf[from..to)` as the journal wrote them, made again on `fns`
 * (by id, as `names` numbers them): a call that wrote to the heap writes
 * to `scratch` instead, and one that read doubles from it reads the copy
 * the journal kept, put at `scratch`. `argvs` is each function's last
 * arguments, one array per id: a stretch starts with them empty, and a
 * caller that stops part way through one hands the same arrays back to
 * carry on, since a call made again with the same arguments is written as
 * its id alone.
 */
export function playCalls(e, fns, names, scratch, buf, from, to, argvs) {
  let r = from;
  while (r < to) {
    let id = buf[r];
    if (id < 0) {
      id = -1 - id;
      r += 1;
      fns[id].apply(null, argvs[id]);
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
    fns[id].apply(null, argv);
  }
  if (r !== to) {
    throw new Error(`journal: a call runs past ${to}`);
  }
}
