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
 *    follow shots gliding in on a moving part; an edit: four keys of four
 *    rigs as shots are the camera the keys gave at 2000 times, and a
 *    blend's midpoint.
 * 8. The replay file: a round trip bit for bit, and refusals of a bad
 *    magic, version, length, size, field, name, camera, event, colour and
 *    aircraft.
 * 9. Every frame count round trips, odd and even: 1, 2, 3, 4, 17, 41 and
 *    a full 30 s at 60 Hz (1801) and at 120 Hz (the ring's capacity), with
 *    parts on the odd frames; version 1 and 2 files, written as those
 *    builds wrote them, are still read, and a version 1 odd count refused.
 * 10. The smoke: on and off, its nozzle interpolated, its column and the
 *    fitted parts round trip, an unknown add-on dropped on the way in.
 * 11. The other pilots in a room (src/replay/peers.js): each row holds
 *    each pilot exactly where that frame drew it, beside the local craft;
 *    a join and a leave mid window; the ring wrapping; interpolation that
 *    never blends two pilots; a scrub back the same as going straight
 *    there; a pilot's wreck by part; the crowd past PEERS_MAX counted; a
 *    trim; the version 4 file round trip bit for bit and its refusals; and
 *    a single player clip still version 3, byte for byte what the build
 *    before peers wrote.
 * 12. Combat's paper (src/replay/paper.js): every row holds every ribbon
 *    the layer drew, its nodes within PAPER_ERR_M; the captured colour
 *    changes at the cut and the cut piece falls from that row; the burst
 *    and the SCHWING at the cut's time; interpolation and scrubbing; the
 *    budget of sixteen hundred link streamers over the window, and what
 *    happens past it; a trim; the version 5 file with and without peers,
 *    version 4 still written without paper, and its refusals.
 * 13. Catch the Ace's bubble (src/replay/peers.js BUBBLE): each row holds
 *    the bubble that frame drew or none; eased round one Ace, a jump when
 *    the crown changes hands; a trim; the version 6 file with and without
 *    paper and with and without the movie editor's edit, version 4 still
 *    written without either, and its refusals.
 * 14. Catch the Ace's crown (src/replay/paper.js crown and coin): the
 *    burst and the coin kept beside the paper on the clip's clock, a
 *    free orb's bubble row (seat 0) read back as one, the version 7 file
 *    round trip, version 6 still written without a crown, and its
 *    refusals.
 * 15. A cut link and a warhead: a five inch flying a war loadout's
 *    speedMul of 1.15 (the plant's boost, src/main.js warSpeedMul), its
 *    link cut with sim_rx_signal until Betaflight's stage 2 drops it
 *    (#201), the link back, then a warhead breaking every part as Defend
 *    Itaipu's does; frames all through put back from the journal bit for
 *    bit, as in 3.
 * 16. The map's animation clock (the traffic's): each row keeps the clock
 *    its frame was drawn at, a sample between two rows runs it on and a
 *    reset of it (R) is a jump, not a drive; a clip with a row that never
 *    had one carries none; a trim keeps it; the version 8 file round trip
 *    bit for bit with a crown and without, version 7 and 3 still written
 *    without the clock, and its refusals.
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
  CAPACITY, HEAD, HEAD_N, PART_N, PLANT_N, POSE_N, SMOKE, WINDOW_S, createRecorder, sampleAt, slerp, trimClip,
} from '../src/replay/recorder.js';
import {
  createPose, defaults, easeInOut, evaluate, evaluateEdit, evaluateKeys, lookAtQuat, rotate,
} from '../src/replay/cameras.js';
import { slerp as slerpQ, trimClip as trimWhole } from '../src/replay/recorder.js';
import { createWarRing, warAt, worldAt, HUNTER_N } from '../src/replay/warrec.js';
import { createRoomWar } from '../src/share/roomwar.js';
import { createGrid } from '../src/share/war/grid.js';
import { FIRE_MS, burnAt } from '../src/share/war/world.js';
import {
  AIR_N, EVENTS_MAX, RPM_PER_RAD_S, airAt, bedAt, callsBetween, createSoundRing, peerVoicesAt, trimSound,
} from '../src/replay/sound.js';
import { soundPlan } from '../src/replay/soundtrack.js';
import { FLAG_CRASHED, FLAG_QUAD } from '../src/share/roomwire.js';
import { planAgent, poseAt } from '../src/share/war/routes.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { decodeReplay, encodeReplay, FILE_MAX_BYTES, ReplayFileError } from '../src/replay/file.js';
import {
  cut, defaultEdit, fromKeys, setCam, setEnter, setSpeed,
} from '../src/replay/edit.js';
import {
  BUBBLE, BUBBLE_N, PEER, PEER_N, PEERS_MAX, PIECE_N, PIECES_MAX, bubbleAt, createPeerRing, createPeerSample, peerPose, samplePeers,
} from '../src/replay/peers.js';
import {
  NODES_MAX, PAPER_ERR_M, PAPER_PILOTS, checkPaper, createPaperRing, createPaperRow, createPaperSample, readRow, samplePaper,
} from '../src/replay/paper.js';
import { newDecal } from '../configs/paint.js';
import { LIVERIES, lookFor } from '../configs/liveries.js';
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
  /* The doubles an `in` pointer carries are the header's own count. */
  const counts = {
    sim_set_power: 'SIM_POWER_DOUBLES', sim_wing_set_tune: 'SIM_TUNE_DOUBLES', sim_set_addons: 'SIM_ADDON_DOUBLES',
    sim_set_addon_inertia: 'SIM_ADDON_INERTIA_DOUBLES', sim_set_motors: 'SIM_MOTORS_DOUBLES', sim_set_prop_pack: 'SIM_PROP_PACK_DOUBLES',
  };
  const inputs = Object.keys(POINTERS).filter((n) => POINTERS[n].doubles);
  const sized = inputs.map((n) => {
    const m = counts[n] && header.match(new RegExp(`#define ${counts[n]} (\\d+)`));
    return [n, m ? Number(m[1]) : NaN];
  });
  check(sized.every(([n, d]) => d === POINTERS[n].doubles), 'every input block is the size the header defines',
    sized.map(([n, d]) => `${n} ${POINTERS[n].doubles}/${d}`).join(', '));
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

/* The wing's tune block read back and seated again with a little more
 * aileron throw, in flight between two copies: the other call that hands
 * the module a block of doubles through the heap (sim_wing_set_tune),
 * which the journal copies and a restore has to make again. */
function retune(sim) {
  if (typeof sim.e.sim_wing_set_tune !== 'function') {
    return;
  }
  const p = sim.e.malloc(16 * 8);
  must(sim.e.sim_wing_tune(p), 'sim_wing_tune');
  const block = new Float64Array(sim.e.memory.buffer, p, 11);
  block[3] = block[3] > 0 ? block[3] * 1.1 : block[3];
  must(sim.e.sim_wing_set_tune(p), 'sim_wing_set_tune');
  sim.e.free(p);
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
      if (ms === 1234) {
        retune(sim);
      }
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

    /* Frames all through: the first, after the retune (93, 1.5 s), around
     * the break, while the wing falls, on the ground, the last. Later first, so each restore throws
     * away less than the next needs. */
    const picks = [frames.length - 1, Math.floor(frames.length * 0.8), freeAt + 40, freeAt + 3, freeAt,
      Math.floor(frames.length * 0.25), 93, 3].filter((i, k, a) => i >= 0 && i < frames.length && a.indexOf(i) === k)
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
        if (ms === 1234) {
          retune(g);
        }
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

/* ---- 15. a cut link and a warhead ---- */

/*
 * Two calls a shell can add to a flight, flown on a five inch quad: the
 * link cut with sim_rx_signal(0) and no packets for long enough that
 * Betaflight's failsafe goes to stage 2 and drops the quad, the link back,
 * and then the warhead (src/main.js warBoomMine), every part broken with
 * sim_part_break. The same frames all through are put back from the
 * journal and compared bit for bit, as in 3: the journal writes every call
 * down whoever makes it, so this holds without a line of the journal
 * knowing about either.
 *
 * Since 2026-09-29 the war no longer cuts the link (docs/WARFARE-PLAN.md
 * 6.1): nothing in the shell calls sim_rx_signal now. The cut stays here
 * as the journal's proof for the failsafe (#201), dormant until a mode
 * wants it again.
 */
const QUAD = 0;
/* The fastest loadout (edge/rooms/war.js SPEED_MUL_MAX). */
const WAR_SPEED_MUL = 1.15;
const WAR_MS = 5200;
const CUT_MS = [1200, 3600];
const BOOM_MS = 4400;
/* sim_abi.h */
const RX_ACTIVE = 0x10;
const RX_ARMED = 0x20;

function warFlight(sim, statePtr, partsPtr, eventsPtr, frame) {
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(QUAD), 'sim_set_airframe');
  must(sim.e.sim_reset(), 'sim_reset');
  must(sim.e.sim_set_cell_voltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_part_table(0), 'sim_set_part_table');
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
  must(sim.e.sim_set_pose(0, 0, 30, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_set_boost(WAR_SPEED_MUL), 'sim_set_boost');
  if (sim.e.sim_boost() !== WAR_SPEED_MUL) {
    throw new Error(`sim_boost is ${sim.e.sim_boost()}, not the loadout's ${WAR_SPEED_MUL}`);
  }
  let rxSeen = 0;
  for (let ms = 0; ms < WAR_MS; ms += 1) {
    const up = ms < CUT_MS[0] || ms >= CUT_MS[1];
    /* The live shell's radio grid, every 4 ms, while packets arrive. */
    if (up && ms % 4 === 0) {
      const k = (ms % 1600) / 1600;
      const tri = k < 0.5 ? 4 * k - 1 : 3 - 4 * k;
      sim.input(ms / 1000, 0.2 * tri, -0.1 * tri, 0.05 * tri, 0.55);
    }
    /* Once a frame, as the war's link called it before 2026-09-29. */
    if (ms % 16 === 0) {
      rxSeen |= sim.e.sim_rx_signal(up ? 1 : 0);
    }
    if (ms === BOOM_MS) {
      const n = sim.e.sim_parts_count();
      for (let i = 1; i < n; i += 1) {
        must(sim.e.sim_part_break(i), `sim_part_break ${i}`);
      }
    }
    sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E);
    sim.e.sim_step(1);
    sim.e.sim_state(statePtr);
    sim.e.sim_damage_flags();
    sim.e.sim_parts_state(partsPtr);
    sim.e.sim_damage_events(eventsPtr, 64);
    if (ms % 16 === 15) {
      frame(ms, rxSeen, sim.e.sim_rx_signal(up ? 1 : 0));
    }
  }
}

function flyWarTakeOver() {
  return (async () => {
    console.log('15. a cut link and a warhead: flying a speedMul of 1.15, the link cut to failsafe and back, then the warhead, put back bit for bit');
    const { sim, j, raw } = await journaled();
    const statePtr = sim.e.malloc(64 * 8);
    const partsPtr = sim.e.malloc(PARTS_MAX * PART_STATE_DOUBLES * 8);
    const eventsPtr = sim.e.malloc(64 * 16 * 8);
    const nState = sim.e.sim_state_size();
    const region = () => new Uint8Array(raw.memory.buffer, j.region.lo, j.region.hi - j.region.lo);
    j.snapshot(0);
    const frames = [];
    let seen = 0;
    let dropAt = -1;
    let broke = false;
    warFlight(sim, statePtr, partsPtr, eventsPtr, (ms, rxSeen, rx) => {
      const t = (ms + 1) / 1000;
      if (j.due(t)) {
        j.snapshot(t);
      }
      seen = rxSeen;
      if (dropAt < 0 && ms > CUT_MS[0] && !(rx & RX_ARMED)) {
        dropAt = frames.length;
      }
      if (ms > BOOM_MS) {
        broke = broke || sim.e.sim_damage_flags() !== 0;
      }
      frames.push({
        ms,
        mark: j.mark(),
        st: new Float64Array(raw.memory.buffer, statePtr, nState).slice(),
        parts: new Float64Array(raw.memory.buffer, partsPtr, PARTS_MAX * PART_STATE_DOUBLES).slice(),
        hash: sha(region()),
      });
    });
    check((seen & RX_ACTIVE) !== 0, 'the cut link reached Betaflight\'s stage 2', `states seen 0x${seen.toString(16)}`);
    check(dropAt >= 0, 'and stage 2 dropped the quad (ARMED gone)', `from frame ${dropAt}`);
    check(broke, 'the warhead broke the quad');
    const at = (ms) => frames.findIndex((f) => f.ms >= ms);
    const picks = [frames.length - 1, at(BOOM_MS + 40), at(CUT_MS[1] + 100), dropAt + 2, at(CUT_MS[0] + 200), at(600)]
      .filter((i, k, a) => i >= 0 && i < frames.length && a.indexOf(i) === k).sort((a, b) => b - a);
    let identical = 0;
    for (const i of picks) {
      const f = frames[i];
      const again = await journaled();
      const g = again.sim;
      const sp = g.e.malloc(64 * 8);
      const pp = g.e.malloc(PARTS_MAX * PART_STATE_DOUBLES * 8);
      const ep = g.e.malloc(64 * 16 * 8);
      if (sp !== statePtr || pp !== partsPtr || ep !== eventsPtr) {
        throw new Error('the second module allocated elsewhere; the flight is not the same flight');
      }
      again.j.snapshot(0);
      warFlight(g, sp, pp, ep, (ms) => {
        if (again.j.due((ms + 1) / 1000)) {
          again.j.snapshot((ms + 1) / 1000);
        }
      });
      const ok = again.j.restore(f.mark, (f.ms + 1) / 1000);
      const reg = new Uint8Array(again.raw.memory.buffer, again.j.region.lo, again.j.region.hi - again.j.region.lo);
      g.e.sim_state(sp);
      g.e.sim_parts_state(pp);
      const st = new Float64Array(again.raw.memory.buffer, sp, nState);
      const parts = new Float64Array(again.raw.memory.buffer, pp, PARTS_MAX * PART_STATE_DOUBLES);
      const sameState = Buffer.compare(Buffer.from(st.buffer, st.byteOffset, st.byteLength), Buffer.from(f.st.buffer, 0, f.st.byteLength)) === 0;
      const sameParts = Buffer.compare(Buffer.from(parts.buffer, parts.byteOffset, parts.byteLength), Buffer.from(f.parts.buffer, 0, f.parts.byteLength)) === 0;
      const sameRegion = sha(reg) === f.hash;
      const good = ok && sameState && sameParts && sameRegion;
      identical += good ? 1 : 0;
      check(good, `frame ${i} (t ${((f.ms + 1) / 1000).toFixed(3)} s) put back`,
        `restore ${ok}, state ${sameState}, parts ${sameParts}, region ${sameRegion} ${f.hash}`);
    }
    check(identical === picks.length, 'every war frame tried was put back exactly', `${identical}/${picks.length}`);
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
  console.log('7. the cameras, and keys as an edit');
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
  const keys = [
    { t: 1, rig: 'follow', target: 3, p: { ...defaults('follow', 1), dist: 4 } },
    { t: 3, rig: 'follow', target: 3, p: { ...defaults('follow', 1), dist: 1 } },
  ];
  const glide = fromKeys(keys, 5, { rig: 'chase', target: -1, watch: 0, p: defaults('chase', 1) });
  const dists = [1, 1.5, 2, 2.5, 3, 3.5].map((t) => {
    evaluateEdit(ctx, glide, t, pose);
    ctx.at(t, 3, scratch);
    return Math.hypot(pose.pos[0] - scratch[0], pose.pos[2] - scratch[2]);
  });
  const closing = dists.every((d, i) => i === 0 || d <= dists[i - 1] + 1e-9);
  check(closing && Math.abs(dists[0] - 4) < 1e-9 && Math.abs(dists[4] - 1) < 1e-9,
    'two follow shots glide in on the part while it moves', dists.map((d) => d.toFixed(2)).join(' '));
  const mid = dists[2];
  check(Math.abs(mid - 2.5) < 1e-9, 'eased: half way in time is half way in distance', mid.toFixed(4));
  editCameras();
}

/* A target that turns and climbs, so every rig's pose changes with t and
 * a part (3) that drifts away from the craft. */
const turning = {
  at: (t, target, out) => {
    out[0] = 12 * Math.sin(t * 0.7) + (target === 3 ? 0.4 * t : 0);
    out[1] = 5 + t * 0.8 - (target === 3 ? 0.2 * t * t : 0);
    out[2] = 12 * Math.cos(t * 0.7);
    return out;
  },
  craftQuat: (t, out) => {
    out[0] = 0;
    out[1] = Math.sin(t * 0.35);
    out[2] = 0;
    out[3] = Math.cos(t * 0.35);
    return out;
  },
  fpv: (t, pos, quat) => {
    turning.at(t, -1, pos);
    turning.craftQuat(t, quat);
    return 110;
  },
};

/* Four keys of four rigs over a 10 s clip. */
function fourKeys() {
  return [
    { t: 1, rig: 'chase', target: -1, p: defaults('chase', 1.2) },
    { t: 3.2, rig: 'orbit', target: -1, p: { ...defaults('orbit', 1.2), az: 2.1, el: 0.5 } },
    { t: 5, rig: 'tripod', target: -1, p: { pos: [3, 2, -4], fov: 40 } },
    { t: 7.5, rig: 'follow', target: 3, p: { ...defaults('follow', 0.6), dist: 2.5 } },
  ];
}

function poseErr(a, b) {
  const dp = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
  /* q and -q are the same attitude. */
  const dot = Math.abs(a.quat[0] * b.quat[0] + a.quat[1] * b.quat[1] + a.quat[2] * b.quat[2] + a.quat[3] * b.quat[3]);
  return { dp, dq: 1 - Math.min(1, dot), df: Math.abs(a.fov - b.fov) };
}

function editCameras() {
  console.log('7b. an edit: the keys as shots, and a blend');
  const keys = fourKeys();
  const edit = fromKeys(keys, 10, { rig: 'chase', target: -1, watch: 0, p: defaults('chase', 1.2) });
  const a = createPose();
  const b = createPose();
  let worst = { dp: 0, dq: 0, df: 0 };
  for (let i = 0; i < 2000; i += 1) {
    const t = (10 * i) / 1999;
    evaluateKeys(turning, keys, t, a);
    evaluateEdit(turning, edit, t, b);
    const e = poseErr(a, b);
    worst = { dp: Math.max(worst.dp, e.dp), dq: Math.max(worst.dq, e.dq), df: Math.max(worst.df, e.df) };
  }
  check(worst.dp < 1e-9 && worst.dq < 1e-9 && worst.df < 1e-9,
    'four keys of four rigs as an edit: the same camera at 2000 times',
    `worst position ${worst.dp.toExponential(2)} m, attitude ${worst.dq.toExponential(2)}, fov ${worst.df.toExponential(2)}`);
  /* A chase cut at 4 s to an orbit that blends in over 0.5 s at 1x: its
   * midpoint is the two cameras half each, eased. */
  const chase = { rig: 'chase', target: -1, watch: 0, p: defaults('chase', 1.2) };
  const orbit = { rig: 'orbit', target: -1, watch: 0, p: { ...defaults('orbit', 1.2), az: 1.9 } };
  let e2 = cut(defaultEdit(10, chase), 4);
  e2 = setCam(e2, 1, orbit);
  e2 = setEnter(e2, 1, { type: 'blend', d: 0.5 });
  const pa = evaluate(turning, 'chase', chase.p, -1, 4.25, createPose());
  const pb = evaluate(turning, 'orbit', orbit.p, -1, 4.25, createPose());
  const want = createPose();
  const w = easeInOut(0.5);
  for (let i = 0; i < 3; i += 1) {
    want.pos[i] = pa.pos[i] + (pb.pos[i] - pa.pos[i]) * w;
  }
  slerpQ(pa.quat[0], pa.quat[1], pa.quat[2], pa.quat[3], pb.quat[0], pb.quat[1], pb.quat[2], pb.quat[3], w, want.quat, 0);
  want.fov = pa.fov + (pb.fov - pa.fov) * w;
  const got = evaluateEdit(turning, e2, 4.25, createPose());
  const em = poseErr(want, got);
  check(em.dp < 1e-9 && em.dq < 1e-9 && em.df < 1e-9, 'a blend\'s midpoint is the two cameras mixed half each',
    `${em.dp.toExponential(2)} m, fov ${got.fov.toFixed(3)}`);
  const before = evaluateEdit(turning, e2, 3.99, createPose());
  const after = evaluateEdit(turning, e2, 4.8, createPose());
  const eb = poseErr(before, evaluate(turning, 'chase', chase.p, -1, 3.99, createPose()));
  const ea = poseErr(after, evaluate(turning, 'orbit', orbit.p, -1, 4.8, createPose()));
  check(eb.dp < 1e-12 && ea.dp < 1e-12, 'before the cut the chase, after the blend the orbit alone');
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
  /* The colours a clip keeps are every region of the aircraft's paint
   * (src/main.js crash cam host, configs/liveries.js lookFor), so every
   * paintable aircraft's region ids, the Kadet's wing_trim and the
   * Striker's nose_cap among them, must come back. */
  {
    const lost = [];
    for (const id of Object.keys(LIVERIES)) {
      const livery = lookFor(id, null).colours;
      try {
        const back = decodeReplay(encodeReplay({ ...c, meta: { ...c.meta, airframe: id, livery } }));
        if (JSON.stringify(back.meta.livery) !== JSON.stringify(livery)) {
          lost.push(`${id}: changed`);
        }
      } catch (err) {
        lost.push(`${id}: ${err.message}`);
      }
    }
    check(lost.length === 0, `every paintable aircraft's colours come back with the clip, ${Object.keys(LIVERIES).length} of them`, lost.join('; '));
  }
  /* The paint shop's finishes and decals ride beside the colours. */
  {
    const paint = { finishes: { wing: 'chrome' }, decals: [newDecal('num', [0.05, 0, -0.1], [1, 0, 0])] };
    const painted = decodeReplay(encodeReplay({ ...c, meta: { ...c.meta, paint } }));
    check(JSON.stringify(painted.meta.paint) === JSON.stringify(paint), 'the finishes and decals come back with the clip');
    /* The garage's: carbon, a text decal in stencil and the wear. */
    const garage = { finishes: { wing: 'carbon', fuselage: 'aluminium' }, decals: [newDecal('text', [0, 0.05, 0], [0, 1, 0])], wear: 0.6 };
    const worn = decodeReplay(encodeReplay({ ...c, meta: { ...c.meta, paint: garage } }));
    check(JSON.stringify(worn.meta.paint) === JSON.stringify(garage), 'carbon, aluminium, words and wear come back with the clip');
  }
  refused(withHeader((h) => { h.meta.paint = { decals: [], wear: 2 }; }), 'a wear past battle worn');
  refused(withHeader((h) => { h.meta.paint = { finishes: { wing: 'gold' }, decals: [] }; }), 'a finish that is not one');
  refused(withHeader((h) => { h.meta.paint = { decals: [{ k: 'num', url: 'x' }] }; }), 'a decal that is not one');
  refused(withHeader((h) => { h.meta.paint = { decals: [], script: 1 }; }), 'an unknown paint field');
  try {
    decodeReplay(buf, { airframe: (id) => id === '5inch', map: () => true });
    check(false, 'refused: an aircraft this build does not fly', 'accepted');
  } catch (err) {
    check(err instanceof ReplayFileError, 'refused: an aircraft this build does not fly', err.message);
  }
  /* A clip flown in a world this build no longer has names the world, so
   * the screen can say it was retired rather than "not a replay". */
  try {
    decodeReplay(buf, { airframe: () => true, map: (id) => id !== 'alps' });
    check(false, 'refused: a map this build does not have, by name', 'accepted');
  } catch (err) {
    check(err instanceof ReplayFileError && err.map === 'alps', 'refused: a map this build does not have, by name', `${err.message}, map ${err.map}`);
  }
  /* And one flown on an aircraft this build no longer has names the
   * aircraft, so the screen can say it was removed (configs/airframes.js
   * retiredAirframe). */
  try {
    decodeReplay(buf, { airframe: (id) => id !== 'sky1800', map: () => true });
    check(false, 'refused: an aircraft this build does not fly, by name', 'accepted');
  } catch (err) {
    check(err instanceof ReplayFileError && err.airframe === 'sky1800' && err.map === null,
      'refused: an aircraft this build does not fly, by name', `${err.message}, airframe ${err.airframe}`);
  }
}
const PARTS_MAX_R = PARTS_MAX;

/* Two typed arrays, the same doubles bit for bit. */
const same = (a, b) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/* ---- 9. every frame count ---- */
function counts() {
  console.log('9. every frame count saves and reads back, odd and even');
  const meta = {
    name: 'Counts', created: 1790000000000, airframe: 'sky1800', livery: null, map: 'swiss2', scale: 1, size: 1.8, duration: 0,
    parts: [0, 1, 2].map((i) => ({ kind: 8, kindName: 'fuselage', parent: i - 1, material: 2, cg: [0, 0, 0], boxMin: [-1, -1, -1], boxMax: [1, 1, 1] })),
    fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
  };
  const make = (n, hz) => {
    const r = createRecorder(n);
    const pp = { x: 0, y: 0, z: 0 };
    const qq = { x: 0, y: 0, z: 0, w: 1 };
    const st = new Float64Array(20);
    const ps = new Float64Array(24 * 3);
    const sp = r.spawnIndex(0, 0, 0, 0, 0, 0, 1, 0.045);
    for (let f = 0; f < n; f += 1) {
      const i = r.begin(f / hz, (f * 1000) / hz);
      pp.x = f * 0.1 + 1 / 3;
      r.pose(i, pp, qq);
      r.drive(i, f, f + 1, f + 2, f + 3, [0.1, -0.2, 0.3, -0.4], 0.5, f);
      st[1] = f * 1.1;
      st[7] = 1;
      r.plant(i, st);
      r.status(i, [1, f], sp, 0, false, f, 0.5, 2);
      if (f % 2 === 1) {
        ps[24] = 1;
        ps[24 + 2] = f;
        r.parts(i, ps, 3);
      }
    }
    return { ...r.clip({ ...meta }), keys: [] };
  };
  const results = [];
  let ok = true;
  for (const [n, hz] of [[1, 60], [2, 60], [3, 60], [4, 60], [17, 60], [41, 60], [30 * 60 + 1, 60], [CAPACITY, 120]]) {
    const c = make(n, hz);
    let good;
    let why = '';
    try {
      const back = decodeReplay(encodeReplay(c));
      good = back.n === c.n && same(back.time, c.time) && same(back.pose, c.pose) && same(back.plant, c.plant)
        && same(back.parts, c.parts);
      for (let k = 0; k < c.n && good; k += 1) {
        const a = c.head.subarray(k * HEAD_N, (k + 1) * HEAD_N);
        const b = back.head.subarray(k * HEAD_N, (k + 1) * HEAD_N);
        good = a.every((x, j) => (j === HEAD.markSeg || j === HEAD.markPos ? b[j] === 0 : Object.is(x, b[j])));
      }
    } catch (err) {
      good = false;
      why = err.message;
    }
    ok = ok && good;
    results.push(`${c.n}${good ? '' : ` FAILED ${why}`}`);
  }
  check(ok, 'odd and even frame counts round trip bit for bit', results.join(', '));

  /* The layouts before this one, written here as those builds wrote
   * them: version 1 (no padding, so an even count only) and version 2
   * (the pose column padded to 8), neither with a smoke column. */
  const writeOld = (clip, version) => {
    const n = clip.n;
    const head = clip.head.slice(0, n * HEAD_N);
    let rowsP = 0;
    for (let k = 0; k < n; k += 1) {
      rowsP += head[k * HEAD_N + HEAD.parts];
    }
    const { smoke, ...rest } = clip;
    void smoke;
    const { fit, ...meta } = rest.meta;
    void fit;
    const json = new TextEncoder().encode(JSON.stringify({
      v: version, n, layout: [HEAD_N, POSE_N, PLANT_N, PART_N, PARTS_MAX], probe: 1.5, meta, events: clip.events, spawns: clip.spawns, keys: [],
    }));
    const pre = 12 + json.length;
    const poseB = n * POSE_N * 4;
    const posePad = version >= 2 ? (8 - (poseB % 8)) % 8 : 0;
    const start = pre + ((8 - (pre % 8)) % 8);
    const buf = new ArrayBuffer(start + n * 8 + n * HEAD_N * 8 + poseB + posePad + n * PLANT_N * 8 + rowsP * PART_N * 4);
    const dv = new DataView(buf);
    new Uint8Array(buf).set([0x46, 0x44, 0x46, 0x52], 0);
    dv.setUint32(4, version, true);
    dv.setUint32(8, json.length, true);
    new Uint8Array(buf).set(json, 12);
    let o = start;
    const put = (arr, width) => {
      for (let i = 0; i < arr.length; i += 1) {
        if (width === 8) {
          dv.setFloat64(o + i * 8, arr[i], true);
        } else {
          dv.setFloat32(o + i * 4, arr[i], true);
        }
      }
      o += arr.length * width;
    };
    put(clip.time.subarray(0, n), 8);
    put(head, 8);
    put(clip.pose.subarray(0, n * POSE_N), 4);
    o += posePad;
    put(clip.plant.subarray(0, n * PLANT_N), 8);
    for (let k = 0; k < n; k += 1) {
      const np = head[k * HEAD_N + HEAD.parts];
      put(clip.parts.subarray(k * PARTS_MAX * PART_N, k * PARTS_MAX * PART_N + np * PART_N), 4);
    }
    return buf;
  };
  const noSmoke = (c) => c.smoke.every((x) => x === 0);
  const even = make(40, 60);
  const v1 = decodeReplay(writeOld(even, 1));
  check(v1.n === 40 && same(v1.pose, even.pose) && same(v1.plant, even.plant) && same(v1.parts, even.parts) && noSmoke(v1),
    'a version 1 file (an even count) is still read, the smoke off');
  const odd = make(41, 60);
  const v2 = decodeReplay(writeOld(odd, 2));
  check(v2.n === 41 && same(v2.pose, odd.pose) && same(v2.plant, odd.plant) && same(v2.parts, odd.parts) && noSmoke(v2),
    'a version 2 file (an odd count) is still read, the smoke off');
  try {
    decodeReplay(writeOld(odd, 1));
    check(false, 'refused: a version 1 file with an odd count', 'accepted');
  } catch (err) {
    check(err instanceof ReplayFileError, 'refused: a version 1 file with an odd count', err.message);
  }
}

/* ---- 10. the smoke ---- */
function smokeColumn() {
  console.log('10. the smoke is recorded, interpolated and saved');
  const r = createRecorder(16);
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const noz = { x: 0, y: 2, z: 0 };
  const vel = { x: -10, y: 0, z: 0 };
  const sp = r.spawnIndex(0, 0, 0, 0, 0, 0, 1, 0.045);
  for (let f = 0; f < 5; f += 1) {
    const i = r.begin(f / 10, f * 100);
    r.pose(i, pp, qq);
    r.plant(i, st);
    r.status(i, [0, 0], sp, 0, false, 0, 0, 0);
    noz.x = -f;
    r.smoke(i, f >= 2, noz, vel);
  }
  const c = r.clip({
    name: 'Smoke', created: 1790000000000, airframe: 'sky1800', livery: null, map: 'swiss2', scale: 1, size: 1.8, duration: 0,
    parts: [], fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
    fit: { entry: { prop: 'stock', addons: ['smoke', 'warp drive'], damage: null }, option: null },
  });
  c.keys = [];
  const off = sampleAt(c, 0.15);
  const on = sampleAt(c, 0.35);
  check(off.smoke[SMOKE.on] === 0 && on.smoke[SMOKE.on] === 1 && Math.abs(on.smoke[SMOKE.nozzle] + 3.5) < 1e-6,
    'off before O, on after it, the nozzle between two rows', `x ${on.smoke[SMOKE.nozzle].toFixed(3)}`);
  const back = decodeReplay(encodeReplay(c));
  check(same(back.smoke, c.smoke), 'the smoke column round trips bit for bit', `${back.smoke.length} floats`);
  check(JSON.stringify(back.meta.fit.entry.addons) === '["smoke"]', 'the fitted parts come back, an unknown add-on dropped',
    JSON.stringify(back.meta.fit.entry));
}

/* ---- 11. the other pilots in a room ---- */

/* A drawn peer as src/main.js keeps one: the model (src/render/peers.js),
 * the sample it was posed with, and its shared wreck when it has one. */
function fakePeer(seat, airframe) {
  const pos = { x: 0, y: 0, z: 0 };
  const quat = { x: 0, y: 0, z: 0, w: 1 };
  const parts = new Float64Array(PARTS_MAX * PART_STATE_DOUBLES);
  const peer = {
    seat,
    profile: { airframe, map: 'swiss2', figure: seat % 12, livery: null, parts: null },
    rig: {
      group: { visible: true, position: pos, quaternion: quat },
      label: () => `Pilot ${seat}`,
      gear: () => 0.25,
      smokeAt: () => (peer.smoke ? { x: pos.x, y: pos.y - 0.2, z: pos.z } : null),
    },
    last: { flags: 0, c0: 0.1, c1: -0.1, c2: 0.2, c3: 0, motor: 900, flaps: 0.05, vx: 20, vy: 0, vz: 0 },
    wreck: null,
    wreckTable: null,
    figure: null,
    smoke: false,
    /* Parts 1 and 2 of a three part table off at x, x + 1. */
    crash(table) {
      peer.wreckTable = table;
      peer.wreck = { drawn: () => parts, count: () => table.length };
    },
    pieces(x) {
      parts.fill(0);
      for (const i of [1, 2]) {
        const o = i * PART_STATE_DOUBLES;
        parts[o + STATE.status] = 1;
        parts[o + STATE.pos] = x + i - 1;
        parts[o + STATE.quat] = 1;
      }
    },
  };
  return peer;
}

const TABLE = [0, 1, 2].map((i) => ({ kind: i === 0 ? 8 : 9, parent: i - 1, cg: [0, i * 0.3, 0], boxMin: [-0.5, -0.5, -0.1], boxMax: [0.5, 0.5, 0.1] }));

/*
 * `frames` of a flight at 60 Hz with the recorder and the peer ring
 * beside it, as src/replay/crashcam.js runs them. The local craft's x is
 * the frame number; peer A flies the whole time at x = frame + 100; B
 * joins at frame 10 and leaves at 30 (x = frame + 200); C joins at 25
 * (x = frame + 300). A crashes at 40 and its two pieces slide.
 */
function roomFlight(cap, frames) {
  const r = createRecorder(cap);
  const ring = createPeerRing(cap);
  const A = fakePeer(2, 'cub1400');
  const B = fakePeer(3, 'p51d1450');
  const C = fakePeer(4, '5inch');
  A.smoke = true;
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const sp = r.spawnIndex(0, 0, 0, 0, 0, 0, 1, 0.045);
  const drawnLive = []; /* per frame, what "the screen" drew of each seat */
  for (let f = 0; f < frames; f += 1) {
    ring.begin(-1);
    const i = r.begin(f / 60, (f * 1000) / 60);
    ring.begin(i);
    pp.x = f;
    r.pose(i, pp, qq);
    r.plant(i, st);
    r.status(i, [0, f], sp, 0, false, 0, 0, 0);
    const room = new Map();
    A.rig.group.position.x = f + 100;
    A.rig.group.quaternion.y = Math.sin(f * 0.01);
    A.rig.group.quaternion.w = Math.cos(f * 0.01);
    room.set(2, A);
    if (f === 40) {
      A.crash(TABLE);
    }
    if (f >= 40) {
      A.pieces(f * 0.5);
    }
    if (f >= 10 && f < 30) {
      B.rig.group.position.x = f + 200;
      room.set(3, B);
    }
    if (f >= 25) {
      C.rig.group.position.x = f + 300;
      room.set(4, C);
    }
    for (const p of room.values()) {
      ring.add(p);
    }
    drawnLive.push(new Map([...room].map(([seat, p]) => [seat, p.rig.group.position.x])));
  }
  const [first, n] = r.span();
  const clip = r.clip({
    name: 'Room', created: 1790000000000, airframe: 'sky1800', livery: null, map: 'swiss2', scale: 1, size: 1.8, duration: 0,
    parts: [], fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
  });
  clip.keys = [];
  clip.peers = ring.clip(first, n);
  return { clip, ring, drawnLive, frames };
}

/* Each seat's x at clip row k, from the peer columns. */
function seatsAt(clip, k) {
  const P = clip.peers;
  const out = new Map();
  for (let s = 0; s < P.slots; s += 1) {
    const o = (k * P.slots + s) * PEER_N;
    const id = P.cols[o + PEER.id];
    if (id) {
      out.set(P.who[id - 1].seat, P.cols[o + PEER.pos]);
    }
  }
  return out;
}

function peersRecord() {
  console.log('11. the other pilots in a room are recorded, played and saved');
  const { clip, drawnLive, ring } = roomFlight(64, 60);
  const P = clip.peers;
  check(Boolean(P) && P.who.length === 3 && P.slots === 3,
    'three pilots drawn in the window, all three from 25 to 29: three slots', P ? `${P.who.length} pilots, ${P.slots} slots` : 'none');
  /* Frame alignment: every row holds what that frame drew, local and
   * peers alike. The local x is the frame number. */
  let aligned = true;
  let rows = 0;
  for (let k = 0; k < clip.n; k += 1) {
    const f = clip.pose[k * POSE_N];
    const want = drawnLive[f];
    const got = seatsAt(clip, k);
    rows += 1;
    if (got.size !== want.size) {
      aligned = false;
    }
    for (const [seat, x] of want) {
      if (got.get(seat) !== x) {
        aligned = false;
      }
    }
  }
  check(aligned, 'every row holds each pilot exactly where that frame drew it, beside the local craft', `${rows} rows`);
  /* Join and leave: B in rows for frames 10 to 29 only, C from 25 on, in
   * a slot of its own while B is still there. */
  const framesWith = (seat) => [...Array(clip.n).keys()].filter((k) => seatsAt(clip, k).has(seat)).map((k) => clip.pose[k * POSE_N]);
  const b = framesWith(3);
  const c = framesWith(4);
  check(b[0] === 10 && b[b.length - 1] === 29 && b.length === 20 && c[0] === 25 && c.length === 35,
    'a join and a leave in the window are the first and last rows the pilot was drawn in',
    `B ${b[0]}..${b[b.length - 1]}, C ${c[0]}..${c[c.length - 1]}`);
  /* The ring wrapped: 60 frames in 64 rows, then 100 frames in 64. */
  const wrapped = roomFlight(64, 100);
  const w0 = wrapped.clip.pose[0];
  const wk = seatsAt(wrapped.clip, 0);
  check(wrapped.clip.n === 64 && w0 === 36 && wk.get(2) === 136 && !wk.has(3) && wrapped.clip.peers.who.length === 2,
    'past the ring\'s capacity the oldest rows go, and the pilots only in them', `first frame ${w0}, ${wrapped.clip.peers.who.length} pilots`);

  /* Sampled between rows: A half way; B's last row held, not blended
   * with whoever takes the slot next. */
  const s = createPeerSample(P.slots);
  const kA = 20;
  samplePeers(P, clip.n, kA, 0.5, s);
  const slotA = [...s.id].findIndex((id) => id && P.who[id - 1].seat === 2);
  const xA = s.row[slotA * PEER_N + PEER.pos];
  check(Math.abs(xA - 120.5) < 1e-4, 'between two rows a pilot is drawn between them', xA.toFixed(4));
  /* This clip's rows are its frames: 60 frames in a ring of 64. */
  samplePeers(P, clip.n, 29, 0.5, s);
  const slotB = [...s.id].findIndex((id) => id && P.who[id - 1].seat === 3);
  check(slotB >= 0 && s.row[slotB * PEER_N + PEER.pos] === 229, 'a pilot\'s last row is held to the next, never blended into another',
    `B at ${slotB >= 0 ? s.row[slotB * PEER_N + PEER.pos] : 'gone'}`);
  /* Scrubbed back: a sample depends on the time only. */
  const ahead = createPeerSample(P.slots);
  samplePeers(P, clip.n, 50, 0.3, ahead);
  samplePeers(P, clip.n, 5, 0.7, ahead);
  const fresh = createPeerSample(P.slots);
  samplePeers(P, clip.n, 5, 0.7, fresh);
  /* What is drawn: each slot's pilot, its row and its pieces. */
  const drawnOf = (x) => [...x.id].map((id, sl) => (id ? [id, ...x.row.subarray(sl * PEER_N, (sl + 1) * PEER_N),
    ...x.pieces.subarray(sl * PARTS_MAX * PIECE_N, (sl * PARTS_MAX + x.count[sl]) * PIECE_N)] : [0]));
  check(JSON.stringify(drawnOf(ahead)) === JSON.stringify(drawnOf(fresh)),
    'scrubbing back gives the same frame as going straight there');
  /* The wreck: A's table from frame 40, its two pieces sliding, eased
   * between rows by part. */
  samplePeers(P, clip.n, 45, 0.5, s);
  const slotW = [...s.id].findIndex((id) => id && P.who[id - 1].seat === 2);
  const wo = slotW * PARTS_MAX * PIECE_N;
  check(s.count[slotW] === 2 && s.row[slotW * PEER_N + PEER.table] === 0 && P.tables.length === 1
    && s.pieces[wo] === 1 && Math.abs(s.pieces[wo + 1] - 22.75) < 1e-4 && s.pieces[wo + PIECE_N] === 2,
  'a pilot\'s wreck: its table, its pieces by part, each between two rows', `${s.count[slotW]} pieces, part 1 at x ${s.pieces[wo + 1].toFixed(3)}`);
  samplePeers(P, clip.n, 39, 0, s);
  check(s.count[slotW] === 0 && s.row[slotW * PEER_N + PEER.table] === -1, 'before the crash, no wreck');
  const pose7 = [0, 0, 0];
  const quat7 = [0, 0, 0, 1];
  const idA = P.who.findIndex((x) => x.seat === 2) + 1;
  const found = peerPose(P, clip.n, 20, 0.5, idA, pose7, quat7);
  check(found && Math.abs(pose7[0] - 120.5) < 1e-4, 'a pilot\'s pose for the camera to follow', pose7[0].toFixed(4));
  const smokeOn = P.cols[(20 * P.slots + slotA) * PEER_N + PEER.smoke] === 1
    && P.cols[(20 * P.slots + slotA) * PEER_N + PEER.nozzle] === 120;
  check(smokeOn, 'the smoke nozzle where the frame drew it');

  /* More pilots than PEERS_MAX drawn at once: the rest counted, not kept. */
  const crowd = createPeerRing(4);
  crowd.begin(0);
  for (let seat = 1; seat <= PEERS_MAX + 3; seat += 1) {
    crowd.add(fakePeer(seat, '5inch'));
  }
  check(crowd.stats.dropped === 3 && crowd.stats.peers === PEERS_MAX, 'past PEERS_MAX drawn at once, the rest are counted as dropped',
    `${crowd.stats.peers} kept, ${crowd.stats.dropped} dropped`);
  /* Single player allocates nothing. */
  const solo = createPeerRing(CAPACITY);
  solo.begin(0);
  check(solo.bytes() === 0 && solo.clip(0, 1) === null, 'a single player flight makes no peer columns and no peers in its clip');
  console.log(`     ring once a room draws a peer: ${(ring.ringBytes / 1048576).toFixed(2)} MB at 64 rows; at CAPACITY ${(solo.ringBytes / 1048576).toFixed(2)} MB (${PEERS_MAX} pilots, ${PIECES_MAX} pieces a row)`);

  /* The budget: a full public room, every one of them wrecked, over two
   * windows at 120 Hz, the most rows the ring takes. */
  {
    const cap = CAPACITY;
    const big = createPeerRing(cap);
    const r = createRecorder(cap);
    const room = new Map();
    for (let seat = 2; seat < 2 + PEERS_MAX; seat += 1) {
      const p = fakePeer(seat, 'cub1400');
      p.smoke = true;
      p.crash(TABLE);
      p.pieces(seat);
      room.set(seat, p);
    }
    const frames = 2 * cap;
    let worst = 0;
    const t0 = performance.now();
    for (let f = 0; f < frames; f += 1) {
      const f0 = performance.now();
      big.begin(-1);
      big.begin(r.begin(f / 120, (f * 1000) / 120));
      for (const p of room.values()) {
        p.rig.group.position.x = f;
        big.add(p);
      }
      worst = Math.max(worst, performance.now() - f0);
    }
    const mean = (performance.now() - t0) / frames;
    const [first, n] = r.span();
    const c0 = performance.now();
    const cut = big.clip(first, n);
    const clipMs = performance.now() - c0;
    const full = { ...r.clip({ ...clip.meta }), keys: [], peers: cut };
    const fileBytes = encodeReplay(full).byteLength;
    console.log(`     ${PEERS_MAX} pilots, all wrecked, ${frames} rows: ${mean.toFixed(4)} ms a row mean, ${worst.toFixed(3)} ms worst; `
      + `ring ${(big.bytes() / 1048576).toFixed(2)} MB (made once, at the first pilot); cutting the clip ${clipMs.toFixed(1)} ms; its file ${(fileBytes / 1048576).toFixed(2)} MB`);
    check(mean < 0.1 && big.stats.dropped === 0 && big.stats.piecesDropped === 0 && cut.slots === PEERS_MAX && cut.pieceAt[n] === n * PEERS_MAX * 2,
      'a full room recorded in under 0.1 ms a row, every pilot and piece kept', `${mean.toFixed(4)} ms`);
    check(fileBytes < FILE_MAX_BYTES, 'and its 30 s at 120 Hz fits in a replay file', `${(fileBytes / 1048576).toFixed(2)} of ${FILE_MAX_BYTES / 1048576} MB`);
  }

  /* Trimmed: a range with B in it keeps the peers; a range after all of
   * them left has none. */
  const cut = trimClip(clip, clip.time[12], clip.time[20]);
  check(cut.peers && cut.peers.cols.length === cut.n * P.slots * PEER_N && seatsAt(cut, 0).get(3) === 212,
    'a trimmed clip keeps its rows of the pilots');
  const empty = trimClip({ ...clip, peers: { ...P, cols: new Float32Array(P.cols.length) } }, clip.time[1], clip.time[3]);
  check(empty.peers === null, 'a trimmed range with nobody in it has no peers');

  /* The file: version 4, every column and list back bit for bit. */
  const buf = encodeReplay(clip);
  const version = new DataView(buf).getUint32(4, true);
  const back = decodeReplay(buf);
  const bp = back.peers;
  check(version === 4 && Boolean(bp) && bp.slots === P.slots && same(bp.cols, P.cols) && same(bp.pieces, P.pieces)
    && same(bp.pieceAt, P.pieceAt) && JSON.stringify(bp.tables) === JSON.stringify(P.tables),
  'a clip with pilots in it is saved as version 4 and every peer column comes back bit for bit', `${buf.byteLength} bytes`);
  check(JSON.stringify(bp.who.map((w) => [w.seat, w.label, w.profile.airframe])) === JSON.stringify(P.who.map((w) => [w.seat, w.label, w.profile.airframe])),
    'who they were comes back: seat, name and airframe');
  check(same(back.pose, clip.pose) && same(back.time, clip.time), 'and the local craft is unchanged beside them');
  const trimmedBack = decodeReplay(encodeReplay(cut));
  check(same(trimmedBack.peers.cols, cut.peers.cols), 'a trimmed range with a join in it round trips');

  /* A single player clip: version 3, byte for byte what the build before
   * wrote (the hash is of this clip as origin/main 23aab07 encoded it). */
  const soloClip = soloFortyOne();
  const soloBuf = encodeReplay(soloClip);
  const soloHash = createHash('sha256').update(new Uint8Array(soloBuf)).digest('hex').slice(0, 16);
  check(new DataView(soloBuf).getUint32(4, true) === 3 && soloHash === 'eaee58b3e1aebe2d' && decodeReplay(soloBuf).peers === undefined,
    'a single player clip is written as version 3, the same bytes as before peers', soloHash);

  const refused = (mut, why) => {
    try {
      decodeReplay(mut());
      check(false, `refused: ${why}`, 'it was accepted');
    } catch (err) {
      check(err instanceof ReplayFileError, `refused: ${why}`, err.message);
    }
  };
  const withPeers = (edit) => () => {
    const copy = JSON.parse(JSON.stringify({ who: P.who, tables: P.tables }));
    const cols = P.cols.slice();
    const pieces = P.pieces.slice();
    edit(copy, cols, pieces);
    return encodeReplay({ ...clip, peers: { ...P, who: copy.who, tables: copy.tables, cols, pieces } });
  };
  refused(() => reheader(buf, 3), 'peers in a version 3 file');
  refused(() => reheader(soloBuf, 4), 'a version 4 file without peers');
  refused(withPeers((h, cols) => { cols[PEER.id] = 9; }), 'a row naming a pilot not in the file');
  refused(withPeers((h) => { h.who[0].profile.airframe = 'NOT AN ID'; }), 'a profile a room would not relay');
  refused(withPeers((h) => { h.who[0].profile.map = 'alps'; }), 'a pilot in another world');
  refused(withPeers((h) => { h.who[0].owner = 'x'; }), 'an unknown field on a pilot');
  refused(withPeers((h) => { h.tables[0][1].parent = 7; }), 'a part table that is not one');
  refused(withPeers((h, cols, pieces) => { pieces[0] = 7; }), 'a piece that is not a part of its table');
  refused(withPeers((h, cols) => { cols[PEER.pos] = NaN; }), 'a peer column that is not a number');
  refused(() => encodeReplay(clip).slice(0, buf.byteLength - 4), 'a file cut short in its pieces');
}

/* A file with its version (in both places) changed and nothing else. */
function reheader(buf, version) {
  const dv = new DataView(buf);
  const hl = dv.getUint32(8, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, hl)));
  h.v = version;
  const json = new TextEncoder().encode(JSON.stringify(h));
  const oldStart = 12 + hl + ((8 - ((12 + hl) % 8)) % 8);
  const start = 12 + json.length + ((8 - ((12 + json.length) % 8)) % 8);
  const out = new ArrayBuffer(start + buf.byteLength - oldStart);
  const u8 = new Uint8Array(out);
  u8.set(new Uint8Array(buf, 0, 4), 0);
  new DataView(out).setUint32(4, version, true);
  new DataView(out).setUint32(8, json.length, true);
  u8.set(json, 12);
  u8.set(new Uint8Array(buf, oldStart), start);
  return out;
}

/* The 41 frame single player clip the hash above is of. */
function soloFortyOne() {
  const r = createRecorder(46);
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const ps = new Float64Array(24 * 3);
  const sp = r.spawnIndex(0, 0, 0, 0, 0, 0, 1, 0.045);
  for (let f = 0; f < 41; f += 1) {
    const i = r.begin(f / 60, (f * 1000) / 60);
    pp.x = f * 0.1 + 1 / 3;
    r.pose(i, pp, qq);
    r.drive(i, f, f + 1, f + 2, f + 3, [0.1, -0.2, 0.3, -0.4], 0.5, f);
    st[1] = f * 1.1;
    st[7] = 1;
    r.plant(i, st);
    r.smoke(i, f % 3 === 0, { x: f, y: 1, z: 2 }, { x: 3, y: 4, z: 5 });
    r.status(i, [1, f], sp, 0, false, f, 0.5, 2);
    if (f % 2 === 1) {
      ps[24] = 1;
      ps[24 + 2] = f;
      r.parts(i, ps, 3);
    }
    if (f === 7) {
      r.event('off', { part: 1, label: 'wing right' });
    }
  }
  const c = r.clip({
    name: 'Solo', created: 1790000000000, airframe: 'sky1800', livery: null, map: 'swiss2', scale: 1, size: 1.8, duration: 0,
    parts: [0, 1, 2].map((i) => ({ kind: 8, kindName: 'fuselage', parent: i - 1, material: 2, cg: [0, 0, 0], boxMin: [-1, -1, -1], boxMax: [1, 1, 1] })),
    fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
  });
  c.keys = [];
  return c;
}

/* ---- 12. combat's paper ---- */

/* A streamer of `links` links hanging back from (x0, y0, z0) along -z,
 * drooping, waving with the frame. */
function paperChain(links, x0, y0, z0, f, out = new Float64Array(NODES_MAX * 3)) {
  for (let k = 0; k <= links; k += 1) {
    out[k * 3] = x0 + 0.3 * Math.sin(k * 0.4 + f * 0.1);
    out[k * 3 + 1] = y0 - 0.02 * k * k * 0.1 - 0.1 * Math.cos(k * 0.3 + f * 0.05);
    out[k * 3 + 2] = z0 + k * 0.95;
  }
  return out;
}

/*
 * 60 frames of a combat round beside the recorder, as the layer is asked:
 * seat 1's streamer (50 links, its own colour), seat 2's (50). At frame 30
 * seat 1 cuts seat 2's: seat 2 keeps 20 links, a 30 link piece falls, and
 * seat 1's grows by those 30 in seat 2's colour.
 */
function paperFlight(cap, frames) {
  const r = createRecorder(cap);
  const ring = createPaperRing(cap);
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const sp = r.spawnIndex(0, 0, 0, 0, 0, 0, 1, 0.045);
  const drawn = [];
  for (let f = 0; f < frames; f += 1) {
    ring.begin(-1);
    const i = r.begin(f / 60, (f * 1000) / 60);
    ring.begin(i);
    pp.x = f;
    r.pose(i, pp, qq);
    r.plant(i, st);
    r.status(i, [0, f], sp, 0, false, 0, 0, 0);
    const t = 1000 + f / 60;
    const cut = f >= 30;
    const own = cut ? [...Array(50).fill(1), ...Array(30).fill(2)] : Array(50).fill(1);
    const a1 = [f * 0.2, 40, 0];
    const x1 = paperChain(own.length, a1[0], 40, 0.5, f);
    ring.draw(1, own, 0, x1, own.length + 1, t, false, a1);
    const a2 = [20 + f * 0.2, 42, 0];
    const x2 = paperChain(cut ? 20 : 50, a2[0], 42, 0.5, f);
    ring.draw(2, [2], 0, x2, (cut ? 20 : 50) + 1, t, false, a2);
    const row = [{ key: 1, id: 0, x: x1.slice(), n: own.length + 1, cols: own, anchor: a1 }, { key: 2, id: 0, x: x2.slice(), n: (cut ? 20 : 50) + 1, cols: [2], anchor: a2 }];
    if (cut) {
      const xp = paperChain(30, 20, 42 - (f - 30) * 0.02, 20, f);
      ring.draw(2, Array(30).fill(2), 1, xp, 31, t, true, null);
      row.push({ key: 2, id: 1, x: xp.slice(), n: 31, cols: Array(30).fill(2), anchor: null });
    }
    if (f === 30) {
      ring.cut(r.now(), [20, 42, 19.5], '#2f6fe0', 1);
      ring.schwing(r.now(), 1);
    }
    drawn.push({ t, row });
  }
  const [first, n, t0, t1] = r.span();
  const clip = r.clip({
    name: 'Combat', created: 1790000000000, airframe: 'sky1800', livery: null, map: 'swiss2', scale: 1, size: 1.8, duration: 0,
    parts: [], fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
  });
  clip.keys = [];
  clip.paper = ring.clip(first, n, t0, t1);
  return { clip, ring, drawn };
}

/* Each seat's colours from a row's ribbon, as runs. */
const runsOfCols = (cols, len) => {
  const out = [];
  for (let i = 0; i < len; i += 1) {
    if (out.length && out[out.length - 1][0] === cols[i]) {
      out[out.length - 1][1] += 1;
    } else {
      out.push([cols[i], 1]);
    }
  }
  return JSON.stringify(out);
};

function paperRecord() {
  console.log('12. combat\'s paper is recorded, played and saved');
  const { clip, drawn } = paperFlight(64, 60);
  const P = clip.paper;
  check(Boolean(P) && P.rowAt.length === clip.n + 1 && P.events.length === 2, 'the paper and its cut are in the clip',
    P ? `${P.bytes.byteLength} bytes over ${clip.n} rows, ${P.events.length} events` : 'none');
  /* Every row as the layer was asked: the ribbons, their colours, their
   * tow points, the flutter clock, and every node within PAPER_ERR_M. */
  const row = createPaperRow();
  let worst = 0;
  let matches = true;
  for (let k = 0; k < clip.n; k += 1) {
    const f = clip.pose[k * POSE_N];
    const want = drawn[f];
    readRow(P, k, row);
    if (row.count !== want.row.length || row.t !== want.t) {
      matches = false;
      continue;
    }
    want.row.forEach((w, j) => {
      const r = row.ribbons[j];
      if (r.key !== w.key || r.id !== w.id || r.n !== w.n || r.anchored !== Boolean(w.anchor) || r.free !== !w.anchor
        || runsOfCols(r.cols, r.colsLen) !== runsOfCols(w.cols, w.cols.length)) {
        matches = false;
      }
      if (w.anchor && r.anchor.some((v, i) => v !== Math.fround(w.anchor[i]))) {
        matches = false;
      }
      for (let i = 0; i < w.n * 3; i += 1) {
        worst = Math.max(worst, Math.abs(r.x[i] - w.x[i]));
      }
    });
  }
  check(matches, 'every row holds every ribbon the layer drew: seat, chain, colours, tow point, clock');
  check(worst <= PAPER_ERR_M, `and every node within ${PAPER_ERR_M * 100} cm of where it was drawn`, `worst ${(worst * 1000).toFixed(1)} mm`);
  /* The capture: seat 1's paper takes seat 2's colour from the cut on;
   * the piece falls, free, from the same row. */
  readRow(P, 29, row);
  const before = runsOfCols(row.ribbons[0].cols, row.ribbons[0].colsLen);
  readRow(P, 30, row);
  const after = runsOfCols(row.ribbons[0].cols, row.ribbons[0].colsLen);
  check(before === '[[1,50]]' && after === '[[1,50],[2,30]]' && row.count === 3 && row.ribbons[2].free && row.ribbons[2].id === 1,
    'the captured paper changes colour at the cut, and the cut piece falls from that row', `${before} to ${after}`);
  const cutEv = P.events.find((e) => e.type === 'cut');
  const sw = P.events.find((e) => e.type === 'schwing');
  check(cutEv && Math.abs(cutEv.t - clip.time[30]) < 1e-9 && sw && sw.t === cutEv.t && cutEv.colour === '#2f6fe0',
    'the cut\'s burst and its SCHWING at the cut\'s row, on the clip\'s clock', cutEv ? cutEv.t.toFixed(4) : 'none');
  /* Between two rows: each node half way, the clock half way; a ribbon
   * the next row does not have as this row has it. */
  const s = createPaperSample();
  const mid = samplePaper(P, clip.n, 10, 0.5, s);
  const r10 = createPaperRow();
  const r11 = createPaperRow();
  readRow(P, 10, r10);
  readRow(P, 11, r11);
  const halfway = Math.abs(mid.ribbons[0].x[30] - (r10.ribbons[0].x[30] + r11.ribbons[0].x[30]) / 2) < 1e-9
    && Math.abs(mid.t - (r10.t + r11.t) / 2) < 1e-9;
  const edge = samplePaper(P, clip.n, 29, 0.5, s);
  readRow(P, 29, r10);
  check(halfway && edge.ribbons[1].n === 51 && edge.ribbons[1].x[3] === r10.ribbons[1].x[3],
    'between rows the paper moves half way; across the cut it holds the row before');
  /* Scrubbed back: a sample depends on the time only. */
  samplePaper(P, clip.n, 50, 0.3, s);
  const back = JSON.stringify(Array.from(samplePaper(P, clip.n, 12, 0.25, s).ribbons[0].x.subarray(0, 153)));
  const fresh = JSON.stringify(Array.from(samplePaper(P, clip.n, 12, 0.25, createPaperSample()).ribbons[0].x.subarray(0, 153)));
  check(back === fresh, 'scrubbing back gives the same paper as going straight there');

  /* The budget: sixteen streamers of a hundred links, every row of two
   * windows at 120 Hz. */
  {
    const cap = CAPACITY;
    const ring = createPaperRing(cap);
    const chains = Array.from({ length: PAPER_PILOTS }, (_, c) => paperChain(100, c * 5, 40, 0, c));
    const cols = Array.from({ length: 100 }, (_, i) => 1 + (i >> 3) % 16);
    const anchor = [0, 40, 0];
    let worstMs = 0;
    const t0 = performance.now();
    for (let f = 0; f < 2 * cap; f += 1) {
      const f0 = performance.now();
      ring.begin(f % cap);
      for (let c = 0; c < PAPER_PILOTS; c += 1) {
        ring.draw(c + 1, cols, 0, chains[c], 101, f / 120, false, anchor);
      }
      worstMs = Math.max(worstMs, performance.now() - f0);
    }
    const mean = (performance.now() - t0) / (2 * cap);
    const cut = ring.clip((2 * cap) % cap, cap, -1, 1e9);
    let lost = 0;
    for (let k = 0; k < cap; k += 1) {
      lost += cut.bytes[cut.rowAt[k]] === 0 ? 1 : 0;
    }
    console.log(`     ${PAPER_PILOTS} streamers of 100 links, ${2 * cap} rows: ${mean.toFixed(4)} ms a row mean, ${worstMs.toFixed(3)} ms worst; `
      + `ring ${(ring.ringBytes / 1048576).toFixed(2)} MB; a full window's paper ${(cut.bytes.byteLength / 1048576).toFixed(2)} MB`);
    check(ring.stats.dropped === 0 && lost === 0, 'a full room\'s paper over the whole window: nothing dropped, no row lost',
      `${ring.stats.dropped} dropped, ${lost} lost`);
    /* Heavier than the budget: every pilot with four long pieces. The
     * ring keeps the newest rows whole and the oldest read as none, never
     * a half row. */
    const heavy = createPaperRing(64);
    for (let f = 0; f < 64; f += 1) {
      heavy.begin(f);
      for (let c = 0; c < PAPER_PILOTS; c += 1) {
        for (let id = 0; id < 5; id += 1) {
          heavy.draw(c + 1, cols, id, chains[c], 101, f, id > 0, id ? null : anchor);
        }
      }
    }
    const hc = heavy.clip(0, 64, -1, 1e9);
    let ok = true;
    try {
      checkPaper(hc, 64);
    } catch (err) {
      ok = false;
    }
    check(ok && heavy.stats.lost > 0 && hc.bytes[hc.rowAt[63]] > 0,
      'past the budget the oldest rows are let go whole, and counted; the newest are kept', `${heavy.stats.lost} of 64 rows let go`);
  }

  /* Trimmed: the rows and the events of the range, rebased. */
  const cutClip = trimClip(clip, clip.time[25], clip.time[40]);
  const cp = cutClip.paper;
  check(cp && cp.rowAt.length === cutClip.n + 1 && cp.events.length === 2 && Math.abs(cp.events[0].t - (clip.time[30] - clip.time[25])) < 1e-9,
    'a trimmed clip keeps its rows of paper and its cut, on its own clock');

  /* The file: version 5, back bit for bit, with peers and without. */
  const buf = encodeReplay(clip);
  const back5 = decodeReplay(buf);
  check(new DataView(buf).getUint32(4, true) === 5 && same(back5.paper.bytes, P.bytes) && same(back5.paper.rowAt, P.rowAt)
    && JSON.stringify(back5.paper.events) === JSON.stringify(P.events) && back5.peers === undefined,
  'a clip with paper is saved as version 5 and its paper comes back bit for bit', `${buf.byteLength} bytes`);
  const room = roomFlight(64, 60).clip;
  const both = decodeReplay(encodeReplay({ ...room, paper: P }));
  check(both.peers && same(both.peers.cols, room.peers.cols) && same(both.paper.bytes, P.bytes),
    'with the other pilots beside it, both come back');
  const noPaper = encodeReplay(room);
  check(new DataView(noPaper).getUint32(4, true) === 4 && decodeReplay(noPaper).paper === undefined,
    'a clip with pilots and no paper is still version 4, as the build before wrote it');
  const trimmedBack = decodeReplay(encodeReplay(cutClip));
  check(same(trimmedBack.paper.bytes, cp.bytes), 'a trimmed range round trips');

  const refused = (mut, why) => {
    try {
      decodeReplay(mut());
      check(false, `refused: ${why}`, 'it was accepted');
    } catch (err) {
      check(err instanceof ReplayFileError, `refused: ${why}`, err.message);
    }
  };
  refused(() => reheader(encodeReplay({ ...room, paper: P }), 4), 'paper in a version 4 file');
  refused(() => reheader(noPaper, 5), 'a version 5 file without paper');
  refused(() => encodeReplay({ ...clip, paper: { ...P, events: [{ ...P.events[0], colour: 'red' }, P.events[1]] } }), 'a burst in a colour that is not one');
  refused(() => encodeReplay({ ...clip, paper: { ...P, events: [{ ...P.events[0], script: 1 }] } }), 'an unknown field on a cut');
  refused(() => {
    const bytes = P.bytes.slice();
    bytes[P.rowAt[5] + 9 + 3] = 200;
    return encodeReplay({ ...clip, paper: { ...P, bytes } });
  }, 'a ribbon longer than a streamer can be');
  refused(() => {
    const bytes = P.bytes.slice(0, P.bytes.byteLength - 3);
    return encodeReplay({ ...clip, paper: { ...P, bytes, rowAt: P.rowAt } });
  }, 'paper cut short');
}

/*
 * Catch the Ace's bubble, flown: 60 frames of a room where peer A (seat
 * 2) is the Ace to frame 30, drawn at x = frame + 100, then peer C (seat
 * 4), at x = frame + 300, and nobody from frame 45 to 49. Each row is
 * given the bubble the way src/main.js hands it over, after the peers.
 */
function bubbleFlight(cap, frames) {
  const r = createRecorder(cap);
  const ring = createPeerRing(cap);
  const A = fakePeer(2, 'cub1400');
  const C = fakePeer(4, '5inch');
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const sp = r.spawnIndex(0, 0, 0, 0, 0, 0, 1, 0.045);
  const drawnLive = [];
  for (let f = 0; f < frames; f += 1) {
    ring.begin(-1);
    const i = r.begin(f / 60, (f * 1000) / 60);
    ring.begin(i);
    pp.x = f;
    r.pose(i, pp, qq);
    r.plant(i, st);
    r.status(i, [0, f], sp, 0, false, 0, 0, 0);
    A.rig.group.position.x = f + 100;
    C.rig.group.position.x = f + 300;
    ring.add(A);
    ring.add(C);
    const ace = f < 30 ? A : C;
    const b = f >= 45 && f < 50 ? { r: 0 } : {
      r: 6, x: ace.rig.group.position.x, y: 50, z: -3, level: 0.4 + f / 200, seat: ace.seat,
    };
    ring.bubble(b);
    drawnLive.push(b);
  }
  const [first, n] = r.span();
  const clip = r.clip({
    name: 'Ace', created: 1790000000000, airframe: 'sky1800', livery: null, map: 'swiss2', scale: 1, size: 1.8, duration: 0,
    parts: [], fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
  });
  clip.keys = [];
  clip.peers = ring.clip(first, n);
  return { clip, drawnLive };
}

function bubbleRecord() {
  console.log('13. Catch the Ace\'s bubble is recorded, played and saved');
  const { clip, drawnLive } = bubbleFlight(64, 60);
  const B = clip.peers && clip.peers.bubble;
  check(Boolean(B) && B.length === clip.n * BUBBLE_N, 'the clip carries a bubble row for every row', B ? `${B.length / BUBBLE_N} rows` : 'none');
  let rowsOk = true;
  for (let k = 0; k < clip.n; k += 1) {
    const want = drawnLive[clip.pose[k * POSE_N]];
    const o = k * BUBBLE_N;
    rowsOk &&= want.r === 0 ? B[o + BUBBLE.r] === 0
      : B[o + BUBBLE.r] === 6 && B[o + BUBBLE.pos] === want.x && B[o + BUBBLE.pos + 1] === 50 && B[o + BUBBLE.pos + 2] === -3
        && B[o + BUBBLE.level] === Math.fround(want.level) && B[o + BUBBLE.seat] === want.seat;
  }
  check(rowsOk, 'each row holds the bubble that frame drew: where, how big, how bright, round whom, or none');
  const out = {};
  const kOf = (f) => {
    for (let k = 0; k < clip.n; k += 1) {
      if (clip.pose[k * POSE_N] === f) {
        return k;
      }
    }
    return -1;
  };
  bubbleAt(B, clip.n, kOf(10), 0.5, out);
  check(out.r === 6 && out.x === 110.5, 'between two rows round the same Ace it is eased', `x ${out.x}`);
  bubbleAt(B, clip.n, kOf(29), 0.5, out);
  check(out.x === 129, 'across a crown changing hands it jumps, as it did live, never sliding from one to the other', `x ${out.x}`);
  bubbleAt(B, clip.n, kOf(46), 0.5, out);
  check(out.r === 0, 'and where none was drawn, none is');
  const early = trimClip(clip, clip.time[kOf(5)], clip.time[kOf(20)]);
  const gap = trimClip(clip, clip.time[kOf(46)], clip.time[kOf(48)]);
  check(early.peers.bubble && early.peers.bubble.length === early.n * BUBBLE_N && early.peers.bubble[BUBBLE.pos] === 105
    && gap.peers && gap.peers.bubble === undefined, 'a trim keeps the bubble\'s rows of its range, and none when the range drew none');

  const buf = encodeReplay(clip);
  const back = decodeReplay(buf);
  check(new DataView(buf).getUint32(4, true) === 6 && same(back.peers.bubble, B) && same(back.peers.cols, clip.peers.cols),
    'a clip with the bubble is saved as version 6, and it comes back bit for bit beside the pilots', `${buf.byteLength} bytes`);
  const withPaper = decodeReplay(encodeReplay({ ...clip, paper: paperFlight(64, 60).clip.paper }));
  check(same(withPaper.peers.bubble, B) && withPaper.paper, 'and with combat\'s paper as well');
  check(new DataView(encodeReplay(gap)).getUint32(4, true) === 4, 'a clip whose rows drew no bubble is written as before, version 4');
  /* Version 6 is the movie editor's too (src/replay/edit.js): an edit, a
   * bubble, or both, each written only when the clip has it. */
  const dur = clip.time[clip.n - 1];
  const edit = cut(setSpeed(defaultEdit(dur, { rig: 'orbit', target: -1, watch: 0, p: defaults('orbit', 1.8) }), 0, 0.5), dur / 2);
  const edited = decodeReplay(encodeReplay({ ...clip, edit }));
  check(edited.edit && JSON.stringify(edited.edit) === JSON.stringify(edit) && edited.edit.shots.length === 2 && same(edited.peers.bubble, B),
    'an edited clip with a bubble saves as one version 6 file and reloads with both');
  const keyed = decodeReplay(encodeReplay({ ...clip, keys: [{ t: 0.2, rig: 'orbit', target: -1, p: defaults('orbit', 1.8) }] }));
  check(keyed.edit === undefined && keyed.keys.length === 1 && same(keyed.peers.bubble, B),
    'a bubble without an edit keeps its camera keys, as the version before did');
  const plain = roomFlight(64, 60).clip;
  const editedNoBubble = { ...plain, edit: setSpeed(defaultEdit(plain.time[plain.n - 1], { rig: 'chase', target: -1, watch: 0, p: defaults('chase', 1.8) }), 0, 2) };
  const eb = decodeReplay(encodeReplay(editedNoBubble));
  check(eb.edit && eb.peers && eb.peers.bubble === undefined, 'an edit without a bubble is version 6 with the peers as before');
  const refused = (mut, why) => {
    try {
      decodeReplay(mut());
      check(false, `refused: ${why}`, 'it was accepted');
    } catch (err) {
      check(err instanceof ReplayFileError, `refused: ${why}`, err.message);
    }
  };
  refused(() => {
    const bubble = B.slice();
    bubble[3 * BUBBLE_N + BUBBLE.r] = 5000;
    return encodeReplay({ ...clip, peers: { ...clip.peers, bubble } });
  }, 'a bubble bigger than a room could draw');
  refused(() => {
    const bubble = B.slice();
    bubble[3 * BUBBLE_N + BUBBLE.seat] = 2.5;
    return encodeReplay({ ...clip, peers: { ...clip.peers, bubble } });
  }, 'a bubble round a seat that is not one');
  refused(() => reheader(buf, 4), 'a bubble in a file that says version 4');
}

/*
 * The crown changing hands in Catch the Ace, recorded as the crash cam
 * does (tapCrown): the burst and the coin at the moment they happen, on
 * the recorder's clock, beside the bubble's rows, whose seat 0 is the
 * free orb.
 */
function crownFlight() {
  const { clip } = bubbleFlight(64, 60);
  const ring = createPaperRing(64);
  const t0 = clip.time[0];
  const tc = clip.time[30];
  ring.crown(tc, [300, 50, -3], [129, 50, -3], 1);
  ring.coin(tc, 0.4);
  ring.crown(tc + 1000, [1, 2, 3], null, 0.7);
  return { clip, tc, t0, P: ring.clip(0, clip.n, t0, clip.time[clip.n - 1]) };
}

/* A room's clip with its bubble and a crown in its paper. */
function crownedClip() {
  const { clip, P } = crownFlight();
  return { ...clip, paper: P };
}

function crownRecord() {
  console.log('14. Catch the Ace\'s crown and coin are recorded, played and saved');
  const {
    clip, tc, t0, P,
  } = crownFlight();
  const ev = P ? P.events : [];
  check(ev.length === 2 && ev[0].type === 'crown' && ev[0].t === tc - t0 && JSON.stringify(ev[0].from) === '[129,50,-3]' && ev[1].type === 'coin' && ev[1].level === 0.4,
    'the burst and the coin, and nothing past the clip, on the clip\'s clock', JSON.stringify(ev));
  const crowned = { ...clip, paper: P };
  const buf = encodeReplay(crowned);
  const back = decodeReplay(buf);
  check(new DataView(buf).getUint32(4, true) === 7 && JSON.stringify(back.paper.events) === JSON.stringify(ev) && same(back.peers.bubble, clip.peers.bubble),
    'a clip with a crown is saved as version 7 and its events and bubble come back as they were', `${buf.byteLength} bytes`);
  check(new DataView(encodeReplay(clip)).getUint32(4, true) === 6, 'the same clip without a crown is still version 6');
  /* A free orb's row: seat 0, read back as seat 0. */
  const B = clip.peers.bubble.slice();
  B[40 * BUBBLE_N + BUBBLE.seat] = 0;
  B[41 * BUBBLE_N + BUBBLE.seat] = 0;
  const orbBack = decodeReplay(encodeReplay({ ...crowned, peers: { ...clip.peers, bubble: B } }));
  const out = {};
  bubbleAt(orbBack.peers.bubble, clip.n, 40, 0.5, out);
  check(out.r === 6 && out.seat === 0, 'a free orb\'s row comes back as the orb, seat 0', JSON.stringify(out));
  const refused = (mut, why) => {
    try {
      decodeReplay(mut());
      check(false, `refused: ${why}`, 'it was accepted');
    } catch (err) {
      check(err instanceof ReplayFileError, `refused: ${why}`, err.message);
    }
  };
  refused(() => reheader(buf, 6), 'a crown in a file that says version 6');
  refused(() => reheader(encodeReplay(clip), 7), 'a version 7 file without a crown');
  refused(() => encodeReplay({ ...clip, paper: { ...P, events: [{ ...ev[0], from: [1, 2] }] } }), 'a crown flown from a point that is not one');
  refused(() => encodeReplay({ ...clip, paper: { ...P, events: [{ ...ev[1], level: 3 }] } }), 'a coin louder than 1');
}

/* A flight whose map clock runs a step behind the recorder's, with R
 * pressed at frame 30: the lap clock back to zero. */
function animFlight(frames, skip = -1) {
  const r = createRecorder(64);
  const pp = { x: 0, y: 0, z: 0 };
  const qq = { x: 0, y: 0, z: 0, w: 1 };
  const st = new Float64Array(20);
  const sp = r.spawnIndex(1, 2, 3, 0, 0, 0, 1, 0.045);
  const clock = [];
  for (let f = 0; f < frames; f += 1) {
    const i = r.begin(f / 60, (f * 1000) / 60);
    const ms = f < 30 ? 90000 + f * 16 : (f - 30) * 16;
    if (f !== skip) {
      r.anim(i, ms);
    }
    clock.push(ms);
    r.pose(i, pp, qq);
    r.plant(i, st);
    r.status(i, [0, 0], sp, 0, false, 0, 0, 0);
  }
  const clip = r.clip({
    name: 'On a car', created: 1790000000000, airframe: 'sky1800', livery: null,
    map: 'swiss2', scale: 1, size: 1.8, duration: 0, parts: [], fpv: { fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120 },
  });
  return { clip, clock };
}

function animRecord() {
  console.log('16. the map\'s animation clock is recorded, played and saved');
  const { clip, clock } = animFlight(50);
  check(clip.anim && clip.anim.length === clip.n && clip.anim.every((x, k) => x === clock[k]),
    'each row keeps the clock its frame was drawn at', clip.anim ? `${clip.anim[0]} .. ${clip.anim[clip.n - 1]}` : 'no column');
  const mid = sampleAt(clip, (clip.time[10] + clip.time[11]) / 2);
  check(Math.abs(mid.anim - (clock[10] + clock[11]) / 2) < 1e-9, 'between two rows the clock runs on', `${mid.anim}`);
  const reset = sampleAt(clip, (clip.time[29] + clip.time[30]) / 2);
  check(reset.anim === clock[29], 'between the rows either side of R the clock is the row before\'s, not a drive back', `${reset.anim}`);
  check(sampleAt(clip, clip.time[clip.n - 1]).anim === clock[clip.n - 1], 'the last row\'s clock at the end');
  const holed = animFlight(50, 17).clip;
  check(holed.anim === undefined && sampleAt(holed, 0.1).anim === null, 'a clip with a row that had no clock carries none, and a sample says none');
  const trimmed = trimClip(clip, clip.time[20], clip.time[40]);
  check(trimmed.anim && trimmed.anim.length === trimmed.n && trimmed.anim[0] === clock[20] && trimmed.anim[trimmed.n - 1] === clock[40],
    'a trim keeps the clock of the rows it keeps', trimmed.anim ? `${trimmed.n} rows` : 'no column');

  const buf = encodeReplay(clip);
  const back = decodeReplay(buf);
  check(new DataView(buf).getUint32(4, true) === 8 && back.anim && same(back.anim, clip.anim) && same(back.pose, clip.pose) && same(back.smoke, clip.smoke),
    'a clip with the clock is saved as version 8 and every column comes back as it was', `${buf.byteLength} bytes`);
  check(Buffer.from(new Uint8Array(encodeReplay(back))).equals(Buffer.from(new Uint8Array(buf))), 'written again, the same bytes');
  const bare = { ...clip };
  delete bare.anim;
  const bareBuf = encodeReplay(bare);
  check(new DataView(bareBuf).getUint32(4, true) === 3 && decodeReplay(bareBuf).anim === undefined,
    'the same clip without the clock is still version 3, and reads back without one');
  const crowned = crownedClip();
  const withClock = { ...crowned, anim: new Float64Array(crowned.n).map((x, k) => 1000 + k) };
  const cBuf = encodeReplay(withClock);
  const cBack = decodeReplay(cBuf);
  check(new DataView(cBuf).getUint32(4, true) === 8 && same(cBack.anim, withClock.anim) && JSON.stringify(cBack.paper.events) === JSON.stringify(crowned.paper.events)
    && same(cBack.peers.bubble, crowned.peers.bubble) && same(cBack.peers.cols, crowned.peers.cols),
  'with peers, a bubble and a crown, version 8 keeps them all beside the clock', `${cBuf.byteLength} bytes`);
  check(new DataView(encodeReplay(crowned)).getUint32(4, true) === 7, 'the crowned clip without the clock is still version 7');
  const refused = (mut, why) => {
    try {
      decodeReplay(mut());
      check(false, `refused: ${why}`, 'it was accepted');
    } catch (err) {
      check(err instanceof ReplayFileError, `refused: ${why}`, err.message);
    }
  };
  refused(() => reheader(cBuf, 7), 'a clock in a file that says version 7');
  refused(() => reheader(bareBuf, 8), 'a version 8 file without its clock');
  refused(() => encodeReplay({ ...clip, anim: clip.anim.map((x, k) => (k === 5 ? NaN : x)) }), 'a clock that is not a number');
  refused(() => buf.slice(0, buf.byteLength - 8), 'a version 8 file cut short');

  /* A war's explosions ride the paper's events: version 9, the clock
   * with them; without one the same clip is version 8 as before. */
  const booms = [{ t: 0.4, type: 'boom', p: [1, 2, 3], level: 0.4 }, { t: 0.5, type: 'boom', p: [4, 5, 6], level: 1 }];
  const boomed = { ...withClock, paper: { ...withClock.paper, events: [...withClock.paper.events, ...booms] } };
  const bBuf = encodeReplay(boomed);
  const bBack = decodeReplay(bBuf);
  check(new DataView(bBuf).getUint32(4, true) === 9 && JSON.stringify(bBack.paper.events) === JSON.stringify(boomed.paper.events) && same(bBack.anim, boomed.anim),
    'a clip with a war\'s explosions is saved as version 9 and they come back where and how big they were', `${bBuf.byteLength} bytes`);
  check(Buffer.from(new Uint8Array(encodeReplay(bBack))).equals(Buffer.from(new Uint8Array(bBuf))), 'written again, the same bytes');
  refused(() => reheader(bBuf, 8), 'an explosion in a file that says version 8');
  refused(() => reheader(cBuf, 9), 'a version 9 file without an explosion');
  let noClock = null;
  try {
    const bare9 = { ...boomed };
    delete bare9.anim;
    encodeReplay(bare9);
  } catch (err) {
    noClock = err;
  }
  check(noClock instanceof Error, 'a clip with explosions and no clock is refused when written, not saved as a file no build reads', noClock ? noClock.message : 'written');

  warFile(withClock, bBuf, refused);
  warWorld(withClock, refused);
  soundFile(withClock, refused);
}

/* A war's attackers (src/replay/warrec.js): recorded, drawn back where
 * they were, and saved as version 10. */
function warFile(withClock, boomBuf, refused) {
  console.log('17. a war\'s attackers, recorded and saved (version 10)');
  const n = withClock.n;
  const ring = createWarRing(n);
  const strike = {
    id: 3, kind: 'strike', route: 'reservoir-west', t0: 60000, k: 1, n: 3, err: 0, target: 'yard-right',
  };
  const scout = { id: 1, kind: 'scout', route: 'reservoir-orbit', t0: 20000, k: 0, n: 1 };
  ring.born('itaipu-1', [scout, strike, { id: 9, kind: 'hunter', route: 'gorge', t0: 60000 }]);
  const plan = planAgent(MISSIONS['itaipu-1'], strike);
  const room = (k) => 70000 + k * 16.7;
  const hunterAt = (k) => ({ id: 9, kind: 'hunter', p: [-1000 + k * 0.6, 300, 1500 + k * 0.3], q: [0, Math.sin(k * 0.01), 0, Math.cos(k * 0.01)] });
  const deadRow = 20;
  for (let k = 0; k < n; k += 1) {
    ring.begin(k);
    if (k === deadRow) {
      ring.dead({ ids: [3] });
    }
    const list = [{ id: 1, kind: 'scout' }, ...(k < deadRow ? [{ id: 3, kind: 'strike' }] : []), hunterAt(k)];
    ring.draw(k === 5 ? null : room(k), list);
  }
  const war = ring.clip(0, n);
  check(war && war.agents.length === 2 && war.slots === 1 && Number.isNaN(war.room[5]),
    'the clip keeps the scripted births once, a hunter slot a row, and no clock where no war was drawn', war ? `${war.agents.length} agents, ${war.slots} slot` : 'none');
  const plans = new Map();
  let worstScripted = 0;
  let worstHunter = 0;
  let strikeSeen = 0;
  for (let k = 0; k < n; k += 1) {
    const drawn = warAt(war, n, k, 0, plans);
    if (k === 5) {
      check(drawn.length === 0, 'a row drawn with no war live draws none');
      continue;
    }
    const s = drawn.find((x) => x.id === 3);
    if (s) {
      strikeSeen = k + 1;
      const o = poseAt(plan, room(k));
      worstScripted = Math.max(worstScripted, Math.hypot(s.p[0] - o.p[0], s.p[1] - o.p[1], s.p[2] - o.p[2]));
    }
    const h = drawn.find((x) => x.id === 9);
    const want = hunterAt(k);
    worstHunter = Math.max(worstHunter, Math.hypot(h.p[0] - want.p[0], h.p[1] - want.p[1], h.p[2] - want.p[2]));
  }
  check(worstScripted === 0 && strikeSeen === deadRow, 'a scripted attacker is where routes.js puts it at the row\'s room ms, exactly, until its death was heard',
    `${worstScripted} m, last row ${strikeSeen - 1}`);
  check(worstHunter < 1e-3, 'a hunter is where it was drawn, within f32', `${worstHunter.toExponential(2)} m`);
  const mid = warAt(war, n, 10, 0.5, plans).find((x) => x.id === 3);
  const o = poseAt(plan, room(10) + 0.5 * 16.7);
  check(Math.hypot(mid.p[0] - o.p[0], mid.p[1] - o.p[1], mid.p[2] - o.p[2]) < 1e-6, 'between rows at the room ms between them');
  const clip = { ...withClock, war };
  const buf = encodeReplay(clip);
  const back = decodeReplay(buf);
  check(new DataView(buf).getUint32(4, true) === 10 && JSON.stringify(back.war.agents) === JSON.stringify(war.agents)
    && Buffer.from(back.war.hunters.buffer).equals(Buffer.from(war.hunters.buffer))
    && back.war.room.every((x, k) => Object.is(x, war.room[k])),
  'a clip with a war is saved as version 10 and comes back as it was', `${buf.byteLength} bytes, ${buf.byteLength - encodeReplay(withClock).byteLength} for the war`);
  check(Buffer.from(new Uint8Array(encodeReplay(back))).equals(Buffer.from(new Uint8Array(buf))), 'written again, the same bytes');
  check(new DataView(boomBuf).getUint32(4, true) === 9 && new DataView(encodeReplay(withClock)).getUint32(4, true) === 8,
    'clips without a war are still written as versions 9 and 8');
  const t = trimWhole(clip, clip.time[10], clip.time[30]);
  check(t.war.room.length === t.n && t.war.room[0] === war.room[10] && t.war.hunters.length === t.n * HUNTER_N,
    'a trim keeps the war of the rows it keeps');
  refused(() => reheader(buf, 8), 'a war in a file that says version 8');
  const bad = { ...clip, war: { ...war, agents: [{ ...war.agents[0], a: { ...war.agents[0].a, route: 'nowhere' } }] } };
  refused(() => encodeReplay(bad), 'a birth record that does not fly');
}

/*
 * 18. The map as the war left it (src/replay/warrec.js world, src/share/
 * war/world.js; the owner: "i want the replays to show things as they
 * happened"). A night raid is played into the real client (src/share/
 * roomwar.js) as the room would send it: a pilot who joins with a gate
 * already down, the go, a unit's intake hit, a kill, a power line struck,
 * the switchyard hit, the end, the lobby and the next war's countdown.
 * Each frame the live screen's map is worked out as src/main.js does
 * (grid.js createGrid for the lights, world.js burnAt over the hits it
 * burns) and the crash cam's ring is fed as crashcam.js tapWar feeds it.
 * The clip's map is then asked for at every row in order, backwards and
 * in jumps, and must be the live map at that row exactly; asking leaves
 * the clip and the live trackers as they were. Saved as version 11 and
 * read back the same; version 10's war still reads, without a map.
 */
function warWorld(withClock, refused) {
  console.log('18. the map as the war left it: targets, lights, struck lines, saved (version 11)');
  const n = withClock.n;
  const ring = createWarRing(n);
  const war = createRoomWar(() => {});
  const grid = createGrid();
  /* Room ms a row: far enough apart that the clip spans a fire's whole
   * FIRE_MS and the cascades' flicker. */
  const dt = Math.max(500, Math.ceil((FIRE_MS * 3) / n));
  const room = (k) => 500000 + k * dt;
  const at = (k) => room(k) - 37;
  const view = (id, state, down) => ({
    id, mission: 'itaipu-4', state, down, output: 14000,
  });
  const half = Math.floor(n / 2);
  /* What the room says, by row. */
  const script = new Map([
    [0, () => war.onWelcome({ seat: 2, code: 'TEST', war: view(1, 'countdown', ['gate-2']) })],
    [2, () => war.onMessage({ type: 'war', war: view(1, 'live', ['gate-2']) })],
    [3, () => war.onMessage({
      type: 'war', op: 'born', agents: [{ id: 3, kind: 'strike', route: 'reservoir-west', t0: room(3), k: 0, n: 1, err: 0, target: 'intake-3' }],
    })],
    [5, () => war.onMessage({
      type: 'war', op: 'dead', ids: [3], at: at(5), by: 0, why: 'arrive', p: [10, 200, -900], target: 'intake-3', hit: true,
    })],
    [6, () => war.onMessage({ type: 'war', war: view(1, 'live', ['gate-2', 'intake-3']) })],
    [7, () => war.onMessage({
      type: 'war', op: 'dead', ids: [4], at: at(7), by: 2, why: 'boom', p: [0, 250, -700],
    })],
    [9, () => war.onMessage({
      type: 'war', op: 'dead', ids: [5], at: at(9), by: 0, why: 'wire', p: [-4880, 40, 610],
    })],
    [half, () => war.onMessage({
      type: 'war', op: 'dead', ids: [6], at: at(half), by: 0, why: 'arrive', p: [-2176, 220, -459], target: 'yard-right', hit: true,
    })],
    /* A second arrival on the intake, long after its first: alight again. */
    [half + 4, () => war.onMessage({
      type: 'war', op: 'dead', ids: [7], at: at(half + 4), by: 0, why: 'arrive', p: [10, 200, -900], target: 'intake-3', hit: true,
    })],
    [n - 8, () => war.onMessage({ type: 'war', war: view(1, 'won', ['gate-2', 'intake-3', 'yard-right']) })],
    [n - 5, () => war.onMessage({ type: 'war', war: { state: 'lobby' } })],
    [n - 3, () => war.onMessage({ type: 'war', war: view(2, 'countdown', []) })],
  ]);
  /* src/main.js's live map, the same way: target -> room ms of its hit. */
  let burning = new Map();
  let begun = null;
  const live = [];
  for (let k = 0; k < n; k += 1) {
    ring.begin(k);
    if (script.has(k)) {
      script.get(k)();
    }
    const now = room(k);
    const v = war.view();
    if (war.on() && war.match() !== begun) {
      begun = war.match();
      burning = new Map((v.down || []).map((id) => [id, -Infinity]));
    } else if (!war.on() && begun !== null) {
      begun = null;
      burning = new Map();
    }
    /* crashcam.js tapWar. */
    const evs = war.takeEvents();
    ring.world(war.match(), v.mission, v.down, war.on(), now);
    for (const ev of evs) {
      if (ev.type === 'dead') {
        ring.dead(ev);
      }
    }
    grid.hear(evs, v);
    for (const ev of evs) {
      if (ev.type === 'dead' && ev.why === 'arrive' && ev.hit && ev.target && !(burning.get(ev.target) >= ev.at)) {
        burning.set(ev.target, ev.at);
      }
    }
    const targets = {};
    for (const [id, a] of burning) {
      if (burnAt(a, now) !== 'ok') {
        targets[id] = burnAt(a, now);
      }
    }
    live.push({ targets, levels: Array.from(grid.levels(v, now)), states: grid.state(v, now) });
  }
  const seen = (f) => live.some(f);
  check(seen((w) => w.targets['intake-3'] === 'fire') && seen((w) => w.targets['intake-3'] === 'smoke') && seen((w) => w.targets['gate-2'] === 'smoke')
    && seen((w) => w.targets['yard-right'] === 'fire') && seen((w) => w.states.yard === 'dark') && seen((w) => w.states['dam-0'] === 'flicker')
    && seen((w) => w.states['hernandarias-w'] === 'dark') && seen((w) => w.states.spillway === 'dark'),
  'the live map had a gate down before the join, an intake on fire then smoking, the switchyard on fire, a quarter of the dam flickering, and the yard, the spillway and a town struck through its line dark');
  const relit = live.findIndex((w, k) => k > 5 && w.targets['intake-3'] === 'smoke');
  check(relit > 0 && relit < half + 4 && live[half + 4].targets['intake-3'] === 'fire',
    'the intake smokes after its fire, and burns again when another attacker arrives on it', `smoke from row ${relit}, alight again at row ${half + 4}`);
  check(live[n - 6].levels.some((x) => x === 0) && Object.keys(live[n - 6].targets).length === 0 && live[n - 4].levels.every((x) => x === 1),
    'after the war the targets are whole and the lights stay out until the lobby, as src/main.js draws it');

  const clip = ring.clip(0, n);
  check(clip && clip.world && clip.world.length === 2 && clip.world[0].hits.length === 4 && clip.world[0].hits[0].at === null && clip.world[0].cuts.length === 1
    && clip.world[0].off === room(n - 8) && Number.isNaN(clip.clock[n - 4]),
  'the clip keeps two matches, the gate as a snapshot (null), the intake and the yard at their room ms, the struck line, the end, and no clock in the lobby',
  clip && clip.world ? JSON.stringify(clip.world.map((m) => ({
    from: m.from, off: m.off, hits: m.hits.length, cuts: m.cuts.length,
  }))) : 'none');
  const before = JSON.stringify(clip.world);
  const gridBefore = JSON.stringify(grid.state(war.view(), room(n)));
  const caches = new Map();
  const order = [
    ...Array.from({ length: n }, (_, k) => k),
    ...Array.from({ length: n }, (_, k) => n - 1 - k),
    5, n - 1, 6, 0, half + 2, 9, n - 6, 2, n - 2, 7,
  ];
  let wrong = 0;
  let firstWrong = '';
  for (const k of order) {
    const w = worldAt(clip, n, k, 0, caches);
    const want = live[k];
    const ok = JSON.stringify(w.targets) === JSON.stringify(want.targets) && Array.from(w.levels).every((x, i) => x === want.levels[i]);
    if (!ok) {
      wrong += 1;
      firstWrong = firstWrong || `row ${k}: ${JSON.stringify(w.targets)} ${Array.from(w.levels).join(',')} want ${JSON.stringify(want.targets)} ${want.levels.join(',')}`;
    }
  }
  check(wrong === 0, 'every row asked forwards, backwards and in jumps is the live map at that row, exactly', firstWrong || `${order.length} asks`);
  check(JSON.stringify(clip.world) === before && JSON.stringify(grid.state(war.view(), room(n))) === gridBefore,
    'asking changes neither the clip nor the live map\'s trackers');
  const mid = worldAt(clip, n, 5, 0.5, caches);
  check(mid.t === room(5) + 0.5 * dt, 'between rows the map is at the room ms between them');

  const old = { ...withClock, war: { ...clip } };
  delete old.war.world;
  delete old.war.clock;
  const oldBuf = encodeReplay(old);
  check(new DataView(oldBuf).getUint32(4, true) === 10 && decodeReplay(oldBuf).war.world === undefined && worldAt(decodeReplay(oldBuf).war, n, 5, 0, new Map()) === null,
    'a war with no map is still version 10, reads back without one, and leaves the map to the live war');
  const withMap = { ...withClock, war: clip };
  const buf = encodeReplay(withMap);
  const back = decodeReplay(buf);
  check(new DataView(buf).getUint32(4, true) === 11 && JSON.stringify(back.war.world) === before && back.war.clock.every((x, k) => Object.is(x, clip.clock[k])),
    'a war with its map is saved as version 11 and comes back as it was', `${buf.byteLength - oldBuf.byteLength} bytes for the map`);
  check(Buffer.from(new Uint8Array(encodeReplay(back))).equals(Buffer.from(new Uint8Array(buf))), 'written again, the same bytes');
  const again = new Map();
  check(Array.from({ length: n }, (_, k) => k).every((k) => JSON.stringify(worldAt(back.war, n, k, 0, again).targets) === JSON.stringify(live[k].targets)),
    'read back, it replays the same targets');
  const t = trimWhole(withMap, withMap.time[4], withMap.time[n - 1]);
  check(t.war.clock.length === t.n && t.war.clock[0] === clip.clock[4] && JSON.stringify(t.war.world) === before,
    'a trim keeps the map of the rows it keeps');
  refused(() => reheader(buf, 10), 'a war\'s map in a file that says version 10');
  refused(() => reheader(oldBuf, 11), 'a version 11 file without its war\'s map');
  const badWorld = (f) => () => encodeReplay({ ...withMap, war: { ...clip, world: f(JSON.parse(before)) } });
  refused(badWorld((w) => {
    w[0].hits[1].target = 'the-moon';
    return w;
  }), 'a hit on a target the mission does not have');
  refused(badWorld((w) => {
    w[0].cuts[0].x = 'west';
    return w;
  }), 'a struck line that is not a place');
  refused(badWorld((w) => w.reverse()), 'matches out of order');
  refused(() => buf.slice(0, buf.byteLength - 8), 'a version 11 file cut short of its map clock');
  refused(() => encodeReplay({ ...withMap, war: { ...clip, clock: clip.clock.map((x, k) => (k === 3 ? Infinity : x)) } }), 'a map clock that is not a number');
}

/*
 * 19. The flight's sound (src/replay/sound.js; the owner: "all sounds all
 * audio all things need to come through"). A ring is fed as the shell
 * feeds it: the engine's air each row, the flight's record and the war's
 * music each frame as they play (a record begun long before the window,
 * a seek, a change of record, the music stopped), Crest Control's lines,
 * an impact, a cue. The clip keeps the air, the moments, and each bed
 * only when it changed, its state at the clip's first row carried on;
 * a replay asked anywhere, forwards or back, hears each bed where it had
 * got to; the other pilots are heard from their rows; the movie's plan
 * puts each sound on the movie's clock at its shot's speed. Saved as
 * version 12; the version before still reads, without it.
 */
function soundFile(withClock, refused) {
  console.log('19. the flight\'s sound: the air, the moments, the beds, the pilots, saved (version 12)');
  const n = withClock.n;
  const ring = createSoundRing(n);
  const dt = 0.05;
  /* What played, as the shell's beds() would say it at recorder time t:
   * record A from 200 s before the window, sought to 10 s in at row 8,
   * record B from row 14, nothing from row 20; the war's intro from row
   * 5, its combat loop from row 11. */
  const t0 = 1000;
  const T = (k) => t0 + k * dt;
  const musicAt = (k) => {
    if (k < 8) {
      return ['flight-a', 200 + (T(k) - t0)];
    }
    if (k < 14) {
      return ['flight-a', 10 + (T(k) - T(8))];
    }
    if (k < 20) {
      return ['flight-b', T(k) - T(14)];
    }
    return ['', 0];
  };
  const bedOf = (k) => {
    if (k < 5) {
      return ['', 0];
    }
    if (k < 11) {
      return ['intro', T(k) - T(5)];
    }
    return ['combat', T(k) - T(11)];
  };
  /* The record began long before: its first call, then a window's prune. */
  ring.call(t0 - 200, 'music', ['flight-a', 0]);
  ring.call(t0 - 150, 'impact', [1, 0.5, 3]);
  ring.prune(t0, 30);
  for (let k = 0; k < n; k += 1) {
    ring.begin(k);
    ring.air({
      u: k, v: -k, w: 0.5 * k, amps: 10 + k, flapsMoving: k % 2 === 1, gearMoving: k === 3,
    });
    ring.call(T(k), 'music', musicAt(k));
    ring.call(T(k), 'bed', bedOf(k));
    if (k === 6) {
      ring.call(T(k), 'radio', ['wave-strike', 'es']);
      ring.call(T(k), 'impact', [0.4, 0.8, 7]);
      ring.call(T(k), 'event', ['land', null]);
      ring.call(T(k), 'mechanical', ['gear', 3]);
    }
  }
  check(ring.stats.refused === 1, 'a call that is not one is counted and not kept', `${ring.stats.refused} refused`);
  const sound = ring.clip(0, n, T(0), T(n - 1));
  const beds = sound.events.filter((e) => e.call === 'music' || e.call === 'bed');
  check(beds.length === 7 && sound.events.length === 10,
    'each bed is kept only when it changes, a seek being a change: 4 calls for the record, 3 for the war\'s music, and the 3 moments',
    beds.map((e) => `${e.call} ${e.args[0] || 'none'}@${e.t.toFixed(2)}`).join(', '));
  check(sound.events[0].t === 0 && sound.events[0].call === 'music' && Math.abs(sound.events[0].args[1] - 200) < 1e-9,
    'the record begun 200 s before the window is at the clip\'s first row, where it had got to', JSON.stringify(sound.events[0]));
  let worst = 0;
  const order = [...Array.from({ length: n }, (_, k) => k), ...Array.from({ length: n }, (_, k) => n - 1 - k), 3, 17, 9, 0, 21];
  let wrongBed = '';
  for (const k of order) {
    const t = T(k) - t0;
    for (const [name, want] of [['music', musicAt(k)], ['bed', bedOf(k)]]) {
      const got = bedAt(sound.events, name, t);
      if (want[0] === '') {
        if (got !== null) {
          wrongBed = wrongBed || `${name} at row ${k}: ${JSON.stringify(got)}`;
        }
        continue;
      }
      if (!got || got.id !== want[0]) {
        wrongBed = wrongBed || `${name} at row ${k}: ${JSON.stringify(got)} want ${want}`;
        continue;
      }
      worst = Math.max(worst, Math.abs(got.at - want[1]));
    }
  }
  check(!wrongBed && worst < 1e-9, 'asked at every row forwards, backwards and in jumps, each bed is the record that played, where it had got to',
    wrongBed || `${order.length} rows, worst ${worst.toExponential(1)} s`);
  const moments = callsBetween(sound.events, T(5) - t0, T(7) - t0);
  check(moments.map((e) => e.call).join() === 'radio,impact,event' && moments[0].args[1] === 'es',
    'played forward over the row: the line in the language it was said in, the impact and the cue, and no bed', moments.map((e) => e.call).join());
  const air = {};
  airAt(sound, n, 3, 0.25, air);
  check(air.u === 3.25 && air.amps === 13.25 && air.flapsMoving === true && air.gearMoving === true,
    'the air between rows is between them, the servos and the retracts as the earlier row has them', JSON.stringify(air));
  check(ring.bytes() === n * AIR_N * 4, `the ring holds ${AIR_N} floats a row, ${AIR_N * 4} bytes`,
    `${((CAPACITY * AIR_N * 4) / 1024).toFixed(0)} KB at the recorder's capacity; at most ${EVENTS_MAX} calls`);

  const t = trimSound(sound, 9, n - 1, T(9) - t0, T(n - 1) - t0);
  const tm = bedAt(t.events, 'music', 0);
  const tb = bedAt(t.events, 'bed', T(12) - T(9));
  check(t.air.length === (n - 9) * AIR_N && tm && tm.id === 'flight-a' && Math.abs(tm.at - musicAt(9)[1]) < 1e-9
    && tb && tb.id === 'combat' && Math.abs(tb.at - bedOf(12)[1]) < 1e-9,
  'a trim keeps the beds where they had got to at its first row');

  /* The other pilots, heard from their rows: a quad and a wing, a
   * crashed one not heard, slowed with the picture. */
  const slots = 3;
  const cols = new Float32Array(n * slots * PEER_N);
  for (let k = 0; k < n; k += 1) {
    for (let sl = 0; sl < slots; sl += 1) {
      const o = (k * slots + sl) * PEER_N;
      cols[o + PEER.id] = sl + 1;
      cols[o + PEER.pos] = 10 * sl + k;
      cols[o + PEER.ctl] = 1000;
      cols[o + PEER.ctl + 1] = 1100;
      cols[o + PEER.ctl + 2] = 1200;
      cols[o + PEER.ctl + 3] = 1300;
      cols[o + PEER.motor] = 900;
      cols[o + PEER.vel] = 20;
      cols[o + PEER.flags] = sl === 0 ? FLAG_QUAD : sl === 2 ? FLAG_CRASHED : 0;
      cols[o + PEER.table] = -1;
    }
  }
  const peers = {
    slots, cols, pieces: new Float32Array(0), pieceAt: new Uint32Array(n + 1),
    who: [0, 1, 2].map((i) => ({
      seat: i + 2, label: `P${i}`, profile: { airframe: i === 0 ? '5inch' : 'cub' }, figure: null,
    })),
  };
  const ps = createPeerSample(slots);
  samplePeers(peers, n, 4, 0.5, ps);
  const heard = peerVoicesAt(peers, ps, 0.5, []);
  check(heard.length === 2 && heard[0].airframe === '5inch' && Math.abs(heard[0].rpm[3] - 1300 * RPM_PER_RAD_S * 0.5) < 1e-6
    && Math.abs(heard[1].rpm[0] - 900 * RPM_PER_RAD_S * 0.5) < 1e-6 && heard[1].rpm[1] === 0 && heard[0].x === 4.5 && heard[0].vx === 10,
  'the pilots are heard where they were drawn, a quad\'s four motors and a wing\'s one, at half speed in half speed slow motion, the crashed one not at all',
  heard.map((h) => `${h.airframe} ${h.rpm.map((x) => x.toFixed(0)).join('/')}`).join(', '));

  /* The movie's plan: a cut at row 10 into a quarter speed shot. */
  const clip = { ...withClock, sound };
  const dur = clip.time[n - 1];
  let edit = defaultEdit(dur, { rig: 'chase', target: -1, watch: 0, p: defaults('chase', 1) });
  edit = setSpeed(cut(edit, clip.time[10]), 1, 0.25);
  const plan = soundPlan(clip, edit);
  const r = plan.radio[0];
  const imp = plan.calls.find((c) => c.call === 'impact');
  const pieces = plan.beds.filter((b) => b.name === 'music');
  /* Said at clip time 0.3, in the quarter speed shot from clip.time[10]. */
  const lineAt = 0.3 < clip.time[10] ? 0.3 : clip.time[10] + (0.3 - clip.time[10]) / 0.25;
  check(r && Math.abs(r.m - lineAt) < 1e-9 && r.lang === 'es' && r.rate === (0.3 < clip.time[10] ? 1 : 0.25) && imp && imp.args[0] === 0.4 * Math.min(1, r.rate),
    'the line and the impact at their movie times, the impact quieter in slow motion', `line at ${r && r.m.toFixed(3)} s, want ${lineAt.toFixed(3)}`);
  const slow = pieces.filter((b) => b.rate === 0.25);
  check(pieces.length >= 3 && slow.length >= 1 && pieces.every((b) => b.dur > 0),
    'the record in pieces cut at the shot and at each change, the slow shot\'s at a quarter speed',
    pieces.map((b) => `${b.id}@${b.m.toFixed(2)}+${b.dur.toFixed(2)}x${b.rate}`).join(' '));

  const old = { ...withClock };
  const buf = encodeReplay(clip);
  const back = decodeReplay(buf);
  check(new DataView(buf).getUint32(4, true) === 12 && JSON.stringify(back.sound.events) === JSON.stringify(sound.events)
    && Buffer.from(back.sound.air.buffer).equals(Buffer.from(sound.air.buffer)),
  'a clip with its sound is saved as version 12 and comes back as it was', `${buf.byteLength - encodeReplay(old).byteLength} bytes for the sound of ${dur.toFixed(2)} s`);
  check(Buffer.from(new Uint8Array(encodeReplay(back))).equals(Buffer.from(new Uint8Array(buf))), 'written again, the same bytes');
  check(new DataView(encodeReplay(old)).getUint32(4, true) === 8, 'the same clip without its sound is the version before, as before');
  refused(() => reheader(buf, 8), 'a sound in a file that says version 8');
  refused(() => reheader(encodeReplay(old), 12), 'a version 12 file without its sound');
  refused(() => encodeReplay({ ...clip, sound: { ...sound, events: [{ t: 0, call: 'launch', args: [] }] } }), 'a call that is not one');
  refused(() => encodeReplay({ ...clip, sound: { ...sound, air: sound.air.map((x, i) => (i === 7 ? NaN : x)) } }), 'air that is not a number');
}

ring();
interpolation();
cameras();
file();
counts();
smokeColumn();
peersRecord();
paperRecord();
bubbleRecord();
crownRecord();
animRecord();
await pureReaders();
await flyTakeOver();
await flyWarTakeOver();
await bounded();

if (failures) {
  console.log(`crashcam:selftest FAILED (${failures})`);
  process.exit(1);
}
console.log('crashcam:selftest ok');
