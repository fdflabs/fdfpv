/*
 * crashcam-selftest.js: the crash cam's pieces that run without a browser.
 *
 * 1. The journal's tables against the module: every function in
 *    src/native/sim_abi.h that takes a pointer is in POINTERS or PURE, and
 *    the module exports nothing sim_* that the header does not declare
 *    beyond the five debug readers the journal knows by name.
 * 2. Every PURE reader leaves the plant's region byte identical, called in
 *    the middle of a crash with parts in the air.
 * 3. TAKE OVER: a Skyhunter flown with crash physics on, its wing broken off
 *    in the air, flown on and into the grass, with a tree, a post, a power
 *    block and the sticks moving. At frames all through the flight the
 *    plant is put back from the journal (the copy before the frame and the
 *    calls since) and compared with what it was: the state, every part's
 *    state and the whole region, bit for bit. Then flown on from one of
 *    them with the same sticks, it gives the same trace as the first time.
 * 4. The journal keeps a bounded number of copies, and a frame older than
 *    the oldest cannot be flown back to.
 * 5. The recorder's ring: it wraps, keeps its order, and its clock only
 *    runs forward, through a reset of the plant's.
 * 6. Interpolation for slow motion: position, attitude, motors, parts.
 * 7. The cameras: lookAt, the ease, a chase behind the motion, and two
 *    follow keys pushing in on a moving part.
 * 8. The replay file: a round trip bit for bit, and refusals of a bad
 *    magic, version, length, size, field, name, camera, event, colour and
 *    aircraft.
 *
 * Run: npm run crashcam:selftest
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

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, Sim, SIM_OK } from '../tests/lib/simmod.js';
import { createJournal, PURE, POINTERS } from '../src/replay/journal.js';
import { INFO, PART_KINDS, PARTS_MAX, PART_STATE_DOUBLES, STATE, SURFACE } from '../configs/parts.js';
import { powerBlock } from '../configs/power.js';
import {
  CAPACITY, HEAD, HEAD_N, PART_N, POSE_N, WINDOW_S, createRecorder, sampleAt, slerp, trimClip,
} from '../src/replay/recorder.js';
import {
  addKey, createPose, defaults, easeInOut, evaluate, evaluateKeys, lookAtQuat, rotate,
} from '../src/replay/cameras.js';
import { decodeReplay, encodeReplay, FILE_MAX_BYTES, ReplayFileError } from '../src/replay/file.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasmBytes = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const header = await readFile(join(root, 'src/native/sim_abi.h'), 'utf8');

let failures = 0;
function check(ok, what, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
}

const sha = (u8) => createHash('sha256').update(u8).digest('hex').slice(0, 16);

/* A module with the journal between it and the caller, as the shell has. */
async function journaled(opts) {
  const plain = await loadSim(wasmBytes);
  const j = createJournal(plain.e, opts);
  return { sim: new Sim(j.exports), j, raw: plain.e };
}

/* ---- 1. the tables ---- */
console.log('1. the journal\'s tables against sim_abi.h and the module');
{
  const decls = [...header.matchAll(/^\w[\w\s*]*?\b(sim_\w+)\s*\(([^)]*)\)\s*;/gm)];
  const withPointer = decls.filter((d) => d[2].includes('*')).map((d) => d[1]);
  const missing = withPointer.filter((n) => !POINTERS[n] && !PURE.has(n));
  check(decls.length > 80, 'the header parses', `${decls.length} declarations`);
  check(missing.length === 0, 'every pointer taking function is known', missing.join(', ') || `${withPointer.length} of them`);
  const wrongSide = withPointer.filter((n) => POINTERS[n] && POINTERS[n].in !== undefined
    && !/const\s/.test(decls.find((d) => d[1] === n)[2]));
  check(wrongSide.length === 0, 'every `in` pointer is const in the header', wrongSide.join(', ') || 'yes');
  const mod = new WebAssembly.Module(wasmBytes);
  const exported = WebAssembly.Module.exports(mod).filter((x) => x.kind === 'function' && x.name.startsWith('sim_')).map((x) => x.name);
  const declared = new Set(decls.map((d) => d[1]));
  const extra = exported.filter((n) => !declared.has(n)).sort();
  const known = ['sim_bf_debug', 'sim_bf_dump', 'sim_bf_get', 'sim_crash_debug', 'sim_math_atan2'];
  check(JSON.stringify(extra) === JSON.stringify(known), 'undeclared exports are the five known readers', extra.join(', '));
}

/* ---- the test flight ---- */

const SKY = 3;
const q = (yaw, pitch, bank) => {
  const D = Math.PI / 180;
  const cy = Math.cos(yaw * D / 2); const sy = Math.sin(yaw * D / 2);
  const cp = Math.cos(-pitch * D / 2); const sp = Math.sin(-pitch * D / 2);
  const cr = Math.cos(bank * D / 2); const sr = Math.sin(bank * D / 2);
  return [cy * cp * cr + sy * sp * sr, cy * cp * sr - sy * sp * cr, cy * sp * cr + sy * cp * sr, sy * cp * cr - cy * sp * sr];
};

function must(code, what) {
  if (code < 0) {
    throw new Error(`${what}: ${code}`);
  }
  return code;
}

function setup(sim) {
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(SKY), 'sim_set_airframe');
  must(sim.e.sim_reset(), 'sim_reset');
  must(sim.e.sim_set_cell_voltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_part_table(0), 'sim_set_part_table');
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
}

/* The sticks at millisecond ms: a slow roll and pitch wander, then the
 * dive into the grass. Plain arithmetic on ms so both flights share it. */
function sticks(ms) {
  const k = (ms % 2000) / 2000;
  const tri = k < 0.5 ? 4 * k - 1 : 3 - 4 * k;
  if (ms > 4200) {
    return [0.1, 0.6, 0, 0.8];
  }
  return [0.3 * tri, -0.1 + 0.05 * tri, 0.1 * tri, 0.7];
}

/* One millisecond of the shell's loop, near enough: the sticks every 2 ms,
 * the ground plane every step, a step, and what the shell reads. */
function stepMs(sim, ms, statePtr, partsPtr, eventsPtr) {
  if (ms % 2 === 0) {
    const s = sticks(ms);
    sim.input(ms / 1000, s[0], s[1], s[2], s[3]);
  }
  sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E);
  sim.e.sim_step(1);
  sim.e.sim_state(statePtr);
  sim.e.sim_ground_contacts();
  sim.e.sim_damage_flags();
  sim.e.sim_parts_state(partsPtr);
  sim.e.sim_damage_events(eventsPtr, 64);
}

/* The Skyhunter's right wing panel's index. */
function wingPart(sim) {
  const n = sim.e.sim_parts_count();
  const p = sim.e.malloc(24 * 8);
  let found = -1;
  for (let i = 1; i < n && found < 0; i += 1) {
    sim.e.sim_part_info(i, p);
    const d = new Float64Array(sim.e.memory.buffer, p, 24);
    /* A wing panel on the right, body y < 0 (configs/parts.js). */
    if (PART_KINDS[d[INFO.kind]] === 'wing' && d[INFO.cg + 1] < 0) {
      found = i;
    }
  }
  sim.e.free(p);
  return found;
}

function flyTakeOver() {
  return (async () => {
    console.log('3. take over: put back from the journal, bit for bit');
    const { sim, j, raw } = await journaled();
    const statePtr = sim.e.malloc(64 * 8);
    const partsPtr = sim.e.malloc(PARTS_MAX * PART_STATE_DOUBLES * 8);
    const eventsPtr = sim.e.malloc(64 * 16 * 8);
    const nState = sim.e.sim_state_size();
    j.snapshot(0);
    setup(sim);
    const block = powerBlock('sky1800');
    if (block) {
      must(sim.setPower(block), 'sim_set_power');
    }
    sim.e.sim_set_ground_material(SURFACE.grass);
    sim.e.sim_tree_add(40, 6, 0, 0.3, 3, 9, 3);
    sim.e.sim_obstacle_cylinder(55, -4, 0, 3, 0.08, 1);
    const qq = q(0, 2, 0);
    must(sim.e.sim_set_pose(0, 0, 12, qq[0], qq[1], qq[2], qq[3]), 'sim_set_pose');
    must(sim.e.sim_wing_launch(15), 'sim_wing_launch');
    const wing = wingPart(sim);
    check(wing > 0, 'the Skyhunter has a right wing panel', `part ${wing}`);

    const frames = [];
    const region = () => new Uint8Array(raw.memory.buffer, j.region.lo, j.region.hi - j.region.lo);
    let t = 0;
    const MS = 9000;
    let broke = false;
    let freeAt = -1;
    for (let ms = 0; ms < MS; ms += 1) {
      stepMs(sim, ms, statePtr, partsPtr, eventsPtr);
      t = (ms + 1) / 1000;
      if (ms === 2500) {
        broke = sim.e.sim_part_break(wing) === SIM_OK;
      }
      /* A frame every 16 ms, as a display would; the copy when due. */
      if (ms % 16 === 15) {
        if (j.due(t)) {
          j.snapshot(t);
        }
        const st = new Float64Array(raw.memory.buffer, statePtr, nState).slice();
        const parts = new Float64Array(raw.memory.buffer, partsPtr, PARTS_MAX * PART_STATE_DOUBLES).slice();
        if (freeAt < 0 && sim.e.sim_free_bodies_active() > 0) {
          freeAt = frames.length;
        }
        frames.push({ ms, mark: j.mark(), st, parts, hash: sha(region()) });
      }
    }
    check(broke, 'the wing was broken off in flight');
    check(freeAt >= 0, 'a part flew as a free body', `from frame ${freeAt}`);
    const last = frames[frames.length - 1];
    const wingFree = last.parts[wing * PART_STATE_DOUBLES + STATE.status] !== 0;
    check(wingFree, 'the wing is off at the end');
    const stats = j.stats();
    console.log(`     journal: ${stats.segments} copies, ${stats.calls} calls, ${(stats.bytes / 1e6).toFixed(2)} MB, region ${stats.region} B`);

    /* Frames all through: the first, around the break, while the wing
     * falls, on the ground, the last. Later first, so each restore throws
     * away less than the next needs. */
    const picks = [frames.length - 1, Math.floor(frames.length * 0.8), freeAt + 40, freeAt + 3, freeAt,
      Math.floor(frames.length * 0.25), 3].filter((i, k, a) => i >= 0 && i < frames.length && a.indexOf(i) === k)
      .sort((a, b) => b - a);
    let identical = 0;
    for (const i of picks) {
      const f = frames[i];
      /* A take over forgets everything after the frame, so each is made on
       * a journal of its own: the same flight flown again. */
      const again = await journaled();
      const g = again.sim;
      const sp = g.e.malloc(64 * 8);
      const pp = g.e.malloc(PARTS_MAX * PART_STATE_DOUBLES * 8);
      const ep = g.e.malloc(64 * 16 * 8);
      if (sp !== statePtr || pp !== partsPtr || ep !== eventsPtr) {
        throw new Error('the second module allocated elsewhere; the flight is not the same flight');
      }
      again.j.snapshot(0);
      setup(g);
      if (block) {
        g.setPower(block);
      }
      g.e.sim_set_ground_material(SURFACE.grass);
      g.e.sim_tree_add(40, 6, 0, 0.3, 3, 9, 3);
      g.e.sim_obstacle_cylinder(55, -4, 0, 3, 0.08, 1);
      g.e.sim_set_pose(0, 0, 12, qq[0], qq[1], qq[2], qq[3]);
      g.e.sim_wing_launch(15);
      for (let ms = 0; ms < MS; ms += 1) {
        stepMs(g, ms, sp, pp, ep);
        if (ms === 2500) {
          g.e.sim_part_break(wing);
        }
        if (ms % 16 === 15 && again.j.due((ms + 1) / 1000)) {
          again.j.snapshot((ms + 1) / 1000);
        }
      }
      /* The marks are the same numbers in both journals: same calls. */
      const ok = again.j.restore(f.mark, (f.ms + 1) / 1000);
      const reg = new Uint8Array(again.raw.memory.buffer, again.j.region.lo, again.j.region.hi - again.j.region.lo);
      g.e.sim_state(sp);
      g.e.sim_parts_state(pp);
      const st = new Float64Array(again.raw.memory.buffer, sp, nState);
      const parts = new Float64Array(again.raw.memory.buffer, pp, PARTS_MAX * PART_STATE_DOUBLES);
      const sameState = Buffer.compare(Buffer.from(st.buffer, st.byteOffset, st.byteLength),
        Buffer.from(f.st.buffer, 0, f.st.byteLength)) === 0;
      const sameParts = Buffer.compare(Buffer.from(parts.buffer, parts.byteOffset, parts.byteLength),
        Buffer.from(f.parts.buffer, 0, f.parts.byteLength)) === 0;
      const sameRegion = sha(reg) === f.hash;
      const good = ok && sameState && sameParts && sameRegion;
      identical += good ? 1 : 0;
      check(good, `frame ${i} (t ${((f.ms + 1) / 1000).toFixed(3)} s) put back`,
        `restore ${ok}, state ${sameState}, parts ${sameParts}, region ${sameRegion} ${f.hash}`);

      if (i === freeAt + 3) {
        /* Flown on from the frame with the same sticks, it is the same
         * flight: the rest of the first run's frames, bit for bit. */
        let same = true;
        let k = i + 1;
        for (let ms = f.ms + 1; ms < MS && same; ms += 1) {
          stepMs(g, ms, sp, pp, ep);
          if (ms % 16 === 15) {
            const now = new Float64Array(again.raw.memory.buffer, sp, nState);
            const want = frames[k].st;
            for (let c = 0; c < nState; c += 1) {
              if (!Object.is(now[c], want[c])) {
                same = false;
              }
            }
            k += 1;
          }
        }
        check(same, 'flown on from there, the same sticks give the same flight', `${k - i - 1} frames compared`);
      }
    }
    check(identical === picks.length, 'every frame tried was put back exactly', `${identical}/${picks.length}`);
  })();
}

/* ---- 2. the pure readers ---- */
async function pureReaders() {
  console.log('2. every pure reader leaves the plant untouched');
  const { sim, j, raw } = await journaled();
  setup(sim);
  sim.e.sim_set_ground_material(SURFACE.grass);
  const qq = q(0, -30, 20);
  sim.e.sim_set_pose(0, 0, 3, qq[0], qq[1], qq[2], qq[3]);
  sim.e.sim_wing_launch(18);
  const sp = sim.e.malloc(64 * 8);
  const pp = sim.e.malloc(PARTS_MAX * PART_STATE_DOUBLES * 8);
  const ep = sim.e.malloc(64 * 16 * 8);
  for (let ms = 0; ms < 700; ms += 1) {
    stepMs(sim, ms, sp, pp, ep);
  }
  const out = sim.e.malloc(1 << 16);
  const key = sim.e.malloc(32);
  new Uint8Array(raw.memory.buffer, key, 12).set(new TextEncoder().encode('roll_srate\0'));
  const region = () => sha(new Uint8Array(raw.memory.buffer, j.region.lo, j.region.hi - j.region.lo));
  /* Arguments per reader: a pointer where it takes one, part 1, and so on. */
  const ARGS = {
    sim_part_info: [1, out], sim_part_hull: [1, out], sim_material_info: [1, out], sim_obstacle_state: [0, out],
    sim_water_sample: [0, 0, 0, out], sim_water_components: [0, out], sim_damage_events_dropped: [],
    sim_air_lift: [0, 0, 5], sim_math_sin: [0.5], sim_math_cos: [0.5], sim_math_atan2: [0.5, 0.2],
    sim_bf_debug: [13], sim_bf_dump: [out, 1 << 16], sim_bf_get: [key, out, 256], sim_crash_debug: [out, 64],
  };
  const bad = [];
  let tried = 0;
  for (const name of PURE) {
    const f = raw[name];
    if (typeof f !== 'function') {
      continue;
    }
    const args = ARGS[name] ?? (POINTERS[name] && POINTERS[name].out !== undefined ? [out] : []);
    const before = region();
    f(...args);
    if (name === 'sim_bf_debug') {
      for (let k = 0; k < 64; k += 1) {
        f(k);
      }
    }
    tried += 1;
    if (region() !== before) {
      bad.push(name);
    }
  }
  check(bad.length === 0, 'no pure reader wrote the region', bad.join(', ') || `${tried} readers`);
}

/* ---- 4. bounded ---- */
async function bounded() {
  console.log('4. the journal keeps a bounded number of copies');
  const { sim, j } = await journaled({ retain: 4 });
  setup(sim);
  const sp = sim.e.malloc(64 * 8);
  const pp = sim.e.malloc(PARTS_MAX * PART_STATE_DOUBLES * 8);
  const ep = sim.e.malloc(64 * 16 * 8);
  const qq = q(0, 0, 0);
  sim.e.sim_set_pose(0, 0, 30, qq[0], qq[1], qq[2], qq[3]);
  sim.e.sim_wing_launch(15);
  const marks = [];
  for (let ms = 0; ms < 8000; ms += 1) {
    stepMs(sim, ms, sp, pp, ep);
    if (ms % 16 === 15) {
      const t = (ms + 1) / 1000;
      if (j.due(t)) {
        j.snapshot(t);
      }
      marks.push(j.mark());
    }
  }
  const s = j.stats();
  check(s.segments === 4, 'four copies kept of eight seconds', `${s.segments}`);
  check(!j.canRestore(marks[10]), 'a frame older than the oldest copy cannot be flown back to');
  check(j.canRestore(marks[marks.length - 10]), 'a recent frame can');
}

/* ---- 5. the ring ---- */
function ring() {
  console.log('5. the recorder\'s ring wraps and keeps its order');
  const cap = 50;
  const r = createRecorder(cap);
  const p = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  let written = 0;
  for (let f = 0; f < 137; f += 1) {
    /* 60 frames a second of wall; the plant's clock advances with it. */
    const i = r.begin(f / 60, 1000 + (f * 1000) / 60);
    if (i < 0) {
      continue;
    }
    written += 1;
    p.x = f;
    r.pose(i, p, qq);
    st[1] = f;
    r.plant(i, st);
    r.status(i, [0, f], 0, 0, false, f, 0, 0);
  }
  const too = r.begin(136 / 60 + 0.001, 1000 + (136 * 1000) / 60 + 1);
  check(too === -1, 'a row too soon after the last is not written');
  const c = r.clip();
  check(c.n === cap, 'the clip holds the ring\'s capacity once it has wrapped', `${c.n}`);
  let ordered = true;
  for (let k = 0; k < c.n; k += 1) {
    if (c.pose[k * POSE_N] !== written - cap + k) {
      ordered = false;
    }
    if (k > 0 && !(c.time[k] > c.time[k - 1])) {
      ordered = false;
    }
  }
  check(ordered, 'oldest first, the newest last, time increasing', `${c.pose[0]}..${c.pose[(c.n - 1) * POSE_N]}`);
  check(Math.abs(c.time[c.n - 1] - (cap - 1) / 60) < 1e-9, 'the clip\'s clock starts at zero and runs at the plant\'s rate', c.time[c.n - 1].toFixed(6));

  /* R: the plant's clock goes back to zero, the replay's keeps going. */
  const r2 = createRecorder(10);
  r2.begin(5, 0);
  r2.begin(5 + 1 / 60, 1000 / 60);
  r2.begin(0.001, 2000 / 60);
  const c2 = r2.clip();
  check(c2.n === 3 && c2.time[2] > c2.time[1], 'a reset of the plant\'s clock does not turn the timeline back');
  /* Longer than the window at a slow rate: the clip is the last 30 s. */
  const r3 = createRecorder(CAPACITY);
  for (let f = 0; f < 40 * 30; f += 1) {
    r3.begin(f / 30, (f * 1000) / 30);
  }
  const c3 = r3.clip();
  check(Math.abs(c3.time[c3.n - 1] - WINDOW_S) < 0.05, 'a slower display still gives the last 30 s', c3.time[c3.n - 1].toFixed(3));
}

/* ---- 6. interpolation ---- */
function interpolation() {
  console.log('6. slow motion interpolates between rows');
  const r = createRecorder(8);
  const pp = { x: 0, y: 0, z: 0 };
  const half = Math.SQRT1_2;
  const quats = [{ x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: half, z: 0, w: half }];
  const st = new Float64Array(20);
  const ps = new Float64Array(24 * 3);
  for (let f = 0; f < 2; f += 1) {
    const i = r.begin(f * 0.1, f * 100);
    pp.x = f * 10;
    r.pose(i, pp, quats[f]);
    r.drive(i, 1000 + f * 1000, 0, 0, 0, null, 0, 0);
    st[1] = f;
    st[7] = 1;
    r.plant(i, st);
    /* Part 1 free and moving 2 m along x between the rows. */
    ps[24 + 0] = 1;
    ps[24 + 2] = f * 2;
    ps[24 + 5] = 1;
    r.parts(i, ps, 2);
  }
  const c = r.clip();
  const s = sampleAt(c, 0.025);
  check(Math.abs(s.pose[0] - 2.5) < 1e-6, 'position at a quarter of the way', s.pose[0].toFixed(6));
  const yaw = 2 * Math.atan2(s.pose[4], s.pose[6]);
  check(Math.abs(yaw - Math.PI / 8) < 1e-6, 'attitude slerped a quarter of 90 degrees', (yaw * 180 / Math.PI).toFixed(4));
  check(Math.abs(s.pose[7] - 1250) < 1e-3, 'the motors in between', s.pose[7].toFixed(2));
  check(Math.abs(s.parts[24 + 2] - 0.5) < 1e-6 && s.parts[24] === 1, 'a free part in between', s.parts[26].toFixed(4));
  const q2 = [];
  slerp(0, 0, 0, 1, 0, 0, 0, -1, 0.5, q2, 0);
  check(Math.abs(q2[3]) > 0.999, 'slerp takes the short way round a sign flip');
  const end = sampleAt(c, 99);
  check(end.k === 1 && end.pose[0] === 10, 'past the end holds the last row');
  const cut = trimClip(c, 0.05, 0.1);
  check(cut.n === 2 && cut.time[0] === 0, 'a trim keeps the rows round its range, its clock from zero');
}

/* ---- 7. cameras ---- */
function cameras() {
  console.log('7. the cameras and their keys');
  const eye = [3, 4, 5];
  const at = [1, 1, 1];
  const qq = lookAtQuat(eye, at);
  const fwd = rotate(qq, [0, 0, -1]);
  const want = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
  const wl = Math.hypot(...want);
  const err = Math.hypot(fwd[0] - want[0] / wl, fwd[1] - want[1] / wl, fwd[2] - want[2] / wl);
  check(err < 1e-9, 'lookAt points the camera\'s -z at its target', err.toExponential(2));
  const up = rotate(qq, [0, 1, 0]);
  check(up[1] > 0 && Math.abs(up[0] * want[0] + up[1] * want[1] + up[2] * want[2]) < 1e-9, 'and keeps it upright');
  check(easeInOut(0) === 0 && easeInOut(1) === 1 && Math.abs(easeInOut(0.5) - 0.5) < 1e-12 && easeInOut(0.25) < 0.25,
    'the ease starts and ends still');
  /* A target moving along x at 10 m/s. */
  const ctx = {
    at: (t, target, out) => {
      out[0] = 10 * t;
      out[1] = target < 0 ? 2 : 1;
      out[2] = 0;
      return out;
    },
    craftQuat: (t, out) => { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; return out; },
    fpv: (t, pos, quat) => { pos[0] = 10 * t; pos[1] = 2; pos[2] = 0; quat[3] = 1; return 90; },
  };
  const pose = createPose();
  evaluate(ctx, 'chase', defaults('chase', 1), -1, 2, pose);
  check(pose.pos[0] < 20 && Math.abs(pose.pos[2]) < 1e-9, 'the chase camera sits behind the way it goes', pose.pos.map((x) => x.toFixed(2)).join(' '));
  const keys = [];
  addKey(keys, { t: 1, rig: 'follow', target: 3, p: { ...defaults('follow', 1), dist: 4 } });
  addKey(keys, { t: 3, rig: 'follow', target: 3, p: { ...defaults('follow', 1), dist: 1 } });
  addKey(keys, { t: 3, rig: 'follow', target: 3, p: { ...defaults('follow', 1), dist: 1 } });
  check(keys.length === 2, 'a key at the same time replaces the one there');
  const dists = [1, 1.5, 2, 2.5, 3, 3.5].map((t) => {
    evaluateKeys(ctx, keys, t, pose);
    ctx.at(t, 3, scratch);
    return Math.hypot(pose.pos[0] - scratch[0], pose.pos[2] - scratch[2]);
  });
  const closing = dists.every((d, i) => i === 0 || d <= dists[i - 1] + 1e-9);
  check(closing && Math.abs(dists[0] - 4) < 1e-9 && Math.abs(dists[4] - 1) < 1e-9,
    'two follow keys push in on the part while it moves', dists.map((d) => d.toFixed(2)).join(' '));
  const mid = dists[2];
  check(Math.abs(mid - 2.5) < 1e-9, 'eased: half way in time is half way in distance', mid.toFixed(4));
}
const scratch = [0, 0, 0];

/* ---- 8. the file ---- */
function file() {
  console.log('8. a replay file round trips and is checked on the way in');
  const r = createRecorder(64);
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const ps = new Float64Array(24 * 3);
  const sp = r.spawnIndex(1, 2, 3, 0, 0, 0, 1, 0.045);
  for (let f = 0; f < 40; f += 1) {
    const i = r.begin(f / 60, (f * 1000) / 60);
    pp.x = f * 0.37;
    pp.y = Math.sin(f);
    r.pose(i, pp, qq);
    r.drive(i, f, f, f, f, [0.1, -0.1, 0.2, 0], 0, f);
    st[1] = f * 1.1;
    r.plant(i, st);
    r.status(i, [9, 99], sp, f > 20 ? 256 : 0, f > 30, f, 0.5, 3);
    if (f > 20) {
      ps[24 + 2] = f;
      ps[24] = 1;
      r.parts(i, ps, 3);
    }
    if (f === 21) {
      r.event('off', { part: 1, label: 'wing right' });
      r.event('debris', { point: [1, 2, 3], normal: [0, 1, 0], speed: 7, surface: 1, shed: 'epo', floorY: 0, kind: 'break' });
    }
  }
  const c = r.clip({
    name: 'Wing off', created: 1790000000000, airframe: 'sky1800', livery: { body: 0xffffff, trim: 0xff0000 },
    map: 'alps', scale: 1, size: 1.8, duration: 0,
    parts: [0, 1, 2].map((i) => ({ kind: i === 1 ? 9 : 8, kindName: i === 1 ? 'wing' : 'fuselage', parent: i - 1, material: 2, cg: [0, i, 0], boxMin: [-1, -1, -1], boxMax: [1, 1, 1] })),
    fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
  });
  c.keys = [{ t: 0.2, rig: 'orbit', target: -1, p: defaults('orbit', 1) }];
  const buf = encodeReplay(c);
  const back = decodeReplay(buf);
  let same = back.n === c.n;
  for (const col of ['time', 'pose', 'plant']) {
    same = same && back[col].length === c[col].length && back[col].every((x, i) => Object.is(x, c[col][i]));
  }
  for (let k = 0; k < c.n && same; k += 1) {
    const np = c.head[k * HEAD_N + HEAD.parts];
    for (let j = 0; j < np * PART_N; j += 1) {
      same = same && Object.is(back.parts[k * PARTS_MAX_R * PART_N + j], c.parts[k * PARTS_MAX_R * PART_N + j]);
    }
  }
  check(same, 'every column comes back bit for bit', `${buf.byteLength} bytes, ${c.n} frames`);
  check(back.head[HEAD.markSeg] === 0 && back.head[HEAD.markPos] === 0, 'the journal marks are not saved');
  check(JSON.stringify(back.meta) === JSON.stringify(c.meta) && back.events.length === 2 && back.keys.length === 1,
    'the airframe, livery, map, parts, events and keys come back');
  const refused = (mut, why) => {
    const b = mut(buf.slice(0));
    try {
      decodeReplay(b);
      check(false, `refused: ${why}`, 'it was accepted');
    } catch (err) {
      check(err instanceof ReplayFileError, `refused: ${why}`, err.message);
    }
  };
  refused((b) => { new Uint8Array(b)[0] = 0; return b; }, 'a wrong magic');
  refused((b) => { new DataView(b).setUint32(4, 99, true); return b; }, 'another version');
  refused((b) => b.slice(0, b.byteLength - 4), 'a truncated file');
  refused(() => new ArrayBuffer(FILE_MAX_BYTES + 1), 'a file over the size limit');
  const withHeader = (edit) => () => {
    const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, new DataView(buf).getUint32(8, true))));
    edit(h);
    const copy = { ...c, meta: h.meta, events: h.events, keys: h.keys, spawns: h.spawns };
    return encodeReplay(copy);
  };
  refused(withHeader((h) => { h.meta.owner = 'x'; }), 'an unknown field');
  refused(withHeader((h) => { h.meta.name = 'x'.repeat(200); }), 'a name too long');
  refused(withHeader((h) => { h.keys[0].rig = 'drone'; }), 'an unknown camera');
  refused(withHeader((h) => { h.events[0].type = 'script'; }), 'an unknown event');
  refused(withHeader((h) => { h.meta.livery.body = -5; }), 'a colour out of range');
  try {
    decodeReplay(buf, { airframe: (id) => id === '5inch', map: () => true });
    check(false, 'refused: an aircraft this build does not fly', 'accepted');
  } catch (err) {
    check(err instanceof ReplayFileError, 'refused: an aircraft this build does not fly', err.message);
  }
}
const PARTS_MAX_R = PARTS_MAX;

ring();
interpolation();
cameras();
file();
await pureReaders();
await flyTakeOver();
await bounded();

if (failures) {
  console.log(`crashcam:selftest FAILED (${failures})`);
  process.exit(1);
}
console.log('crashcam:selftest ok');
