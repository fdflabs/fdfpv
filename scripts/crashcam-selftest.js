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

await pureReaders();
await flyTakeOver();
await bounded();

if (failures) {
  console.log(`crashcam:selftest FAILED (${failures})`);
  process.exit(1);
}
console.log('crashcam:selftest ok');
