/*
 * midair-plant.js: mid air hits through the real plant on both sides
 * (docs/MULTIPLAYER-PLAN.md section 6.6, the second pass). npm run
 * midair:plant.
 *
 * Two modules (dist/sim.wasm), one aircraft each, damage mode on, flown
 * on their own sticks at each other in one world; each samples its plant
 * to POSE frames at 30 Hz, the room (edge/rooms/core.js and its referee)
 * judges, and the hit comes back to each over its own link and is applied
 * through the ABI with the shell's own function (src/game/midair.js
 * applyHit: sim_contact_part, sim_contact_at_mat, and at BREAK_MPS or more
 * the both break rule's sim_part_break). Six pairs from a 0.42 kg foamie
 * to a 4.5 kg balsa bomber, head on and crossing, 8 to 50 m/s closing.
 * Then:
 *
 *   P1  both aircraft took permanent damage (a break, a crush, a bend, a
 *       chip or a knock) in every head on and crossing pass that met at
 *       10 m/s closing or more, measured at the hit as the room measures
 *       it, on links of 0 and 50 ms. Reported beside it: how many of
 *       those the plant's limits broke alone, before the both break rule,
 *       and how many left both wrecks by the shell's rule
 *       (src/game/damage.js isWreck)
 *   P2  the pair's momentum: what each plant's contact gave its aircraft
 *       (every part's mass times its velocity, before and after the call)
 *       against the other's, reported as the drift |dPA + dPB| over the
 *       larger, which two free bodies would keep at 0. The rotational
 *       terms are each plant's own, so this is the number that says
 *       whether a two body contact call is ever needed (section 6.3)
 *   P3  a hit is an external input and nothing else: the same module
 *       calls made again on a fresh module, with no room and no network,
 *       give the same plant to the bit, crash included (section 6.7)
 *   P4  a friendly room sends no hit at all
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

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { airframeById } from '../configs/airframes.js';
import { PART_STATE_DOUBLES, STATE } from '../configs/parts.js';
import { readPartTable, readDamageEvents } from './lib/crash.js';
import { FLAG_AIRBORNE, FLAG_CRASHED, FLAG_QUAD, PROTO, encodePose } from '../src/share/roomwire.js';
import { RoomCore, PRIVATE_CAP } from '../edge/rooms/core.js';
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { BREAK_MPS, applyHit, sideFor } from '../src/game/midair.js';
import { isWreck } from '../src/game/damage.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const wasm = await readFile(join(root, 'dist', 'sim.wasm'));
const config = await readFile(join(root, 'tests', 'fixtures', 'config-baseline.diff'), 'utf8');

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

const must = (code, what) => {
  if (code !== SIM_OK) {
    throw new Error(`${what} returned ${code}`);
  }
};

const MEET_MS = 600;
const FLY_AT = SPAWN_MS + 1000;
const AFTER_MS = 1000;
const SAMPLE_MS = 1000 / 30;
const ALT = 60;
const PERMANENT = new Set(['break', 'crush', 'bend', 'chip', 'knock']);

/*
 * One aircraft: a module with its airframe, in the air at `pos` (plant
 * metres) heading `yaw` (radians about z) at `speed`, on neutral sticks
 * at `throttle`. Every call made on the module after its set up is logged
 * in `ops`, which is what P3 makes again.
 */
async function aircraft(id, pos, yaw, speed, place = true) {
  const af = airframeById(id);
  const sim = await loadSim(wasm);
  must(sim.init(config), 'sim_init');
  must(sim.e.sim_set_airframe(af.simId), 'sim_set_airframe');
  must(sim.reset(), 'sim_reset');
  must(sim.setCellVoltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
  const ops = [];
  const call = (name, ...args) => {
    ops.push([name, args]);
    return sim.e[name](...args);
  };
  /* The attitude: a yaw about z, w x y z. Set up, not physics: the check
   * builds its scenario with the host's own trigonometry. */
  if (place) {
    const q = [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)];
    must(call('sim_set_pose', pos[0], pos[1], pos[2], q[0], q[1], q[2], q[3]), 'sim_set_pose');
    must(call('sim_set_velocity', speed * Math.cos(yaw), speed * Math.sin(yaw), 0, 0, 0, 0), 'sim_set_velocity');
  }
  const table = readPartTable(sim);
  return {
    id, af, sim, ops, call, table,
    partsPtr: sim.e.malloc(table.length * PART_STATE_DOUBLES * 8),
    throttle: af.fixedWing ? 0.6 : 0.35,
    events: [],
    applied: null,
  };
}

function state(ac) {
  return ac.sim.readState().state;
}

/* Every part's momentum summed, world, kg m/s. */
function momentum(ac) {
  const n = ac.table.length;
  ac.sim.e.sim_parts_state(ac.partsPtr);
  const ps = new Float64Array(ac.sim.e.memory.buffer, ac.partsPtr, n * PART_STATE_DOUBLES);
  const p = [0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      p[k] += ac.table[i].mass * ps[i * PART_STATE_DOUBLES + STATE.vel + k];
    }
  }
  return p;
}

/* The plant's state as a POSE, in the scene's frame: src/render/frame.js
 * simPosToThree and simQuatToThree, with no spawn offset (one world). */
function poseOf(ac, st, t, seq) {
  return encodePose({
    flags: FLAG_AIRBORNE | (ac.af.fixedWing ? 0 : FLAG_QUAD) | (isWreck(ac.sim.e.sim_damage_flags(), ac.af.fixedWing) ? FLAG_CRASHED : 0),
    seq,
    t,
    px: -st[2], py: st[3], pz: -st[1],
    qx: -st[9], qy: st[10], qz: -st[8], qw: st[7],
    vx: -st[5], vy: st[6], vz: -st[4],
    wx: 0, wy: 0, wz: 0, c0: 0, c1: 0, c2: 0, c3: 0, motor: 0, flaps: 0,
  });
}

/* Apply one side of a hit to an aircraft now, with the shell's own
 * function (src/game/midair.js applyHit), every module call logged. */
function applyOne(ac, side) {
  const logged = new Proxy({}, { get: (_, name) => (...args) => ac.call(name, ...args) });
  const before = momentum(ac);
  const { rc, brk } = applyHit(logged, side, state(ac));
  const after = momentum(ac);
  ac.applied = { rc, brk, side, dp: [after[0] - before[0], after[1] - before[1], after[2] - before[2]] };
}

/*
 * One pass. A and B are aircraft() answers already placed to meet near
 * MEET_MS; latency is each link's one way delay, ms. Returns what the
 * checks read.
 */
function pass(A, B, latency, friendly = false) {
  const room = new RoomCore({ code: 'K7PZ2M', cap: PRIVATE_CAP, friendly, map: 'swiss2', epoch: 0 });
  const conns = [{ i: 0 }, { i: 1 }];
  const craft = [A, B];
  const seats = [0, 0];
  const inbox = [[], []]; /* [arrival ms, message] */
  let tokens = 0;
  const newToken = () => (tokens += 1).toString(16).padStart(32, '0');
  const route = (actions, now) => {
    for (const a of actions) {
      if (a.send && typeof a.data === 'string') {
        inbox[a.send.i].push([now + latency, JSON.parse(a.data)]);
      }
    }
  };
  for (const c of conns) {
    route(room.open(c, 0), 0);
    route(room.message(c, JSON.stringify({
      type: 'hello', proto: PROTO, build: 'plant', name: [1, 2, 42],
      profile: { airframe: craft[c.i].id, map: 'swiss2', figure: 0, livery: null, parts: null },
    }), 0, `10.0.0.${c.i + 1}`, newToken), 0);
  }
  for (const c of conns) {
    for (const [, m] of inbox[c.i]) {
      if (m.type === 'welcome') {
        seats[c.i] = m.seat;
      }
    }
    inbox[c.i] = [];
  }
  const uplink = [[], []]; /* [arrival ms, bytes] */
  /* Each sends one pose as it spawns, at room time 0, and the flight
   * starts at FLY_AT: Phase 5 (edge/rooms/safety.js) holds a seat
   * untouchable for SPAWN_MS from its first pose. */
  for (let i = 0; i < 2; i += 1) {
    route(room.message(conns[i], poseOf(craft[i], state(craft[i]), 0, 1), 0), 0);
  }
  const next = [FLY_AT + 5, FLY_AT + 21]; /* the two senders' sampling phases, ms */
  const seq = [1, 1];
  const hits = [[], []];
  let tick = FLY_AT + SAMPLE_MS;
  const end = MEET_MS + AFTER_MS;
  for (let t = 0; t < end; t += 1) {
    for (const ac of craft) {
      const st = state(ac);
      ac.call('sim_input', st[0] + 0.0001, 0, 0, 0, ac.throttle);
      ac.call('sim_step', 1);
      for (const ev of readDamageEvents(ac.sim)) {
        ac.events.push(ev);
      }
    }
    const now = FLY_AT + t + 1;
    for (let i = 0; i < 2; i += 1) {
      if (now >= next[i]) {
        next[i] += SAMPLE_MS;
        seq[i] += 1;
        uplink[i].push([now + latency, poseOf(craft[i], state(craft[i]), now, seq[i])]);
      }
      while (uplink[i].length && uplink[i][0][0] <= now) {
        route(room.message(conns[i], uplink[i].shift()[1], now), now);
      }
    }
    if (now >= tick) {
      tick += SAMPLE_MS;
      route(room.tick(now), now);
    }
    for (let i = 0; i < 2; i += 1) {
      while (inbox[i].length && inbox[i][0][0] <= now) {
        const m = inbox[i].shift()[1];
        if (m.type !== 'hit') {
          continue;
        }
        hits[i].push({ ...m, at: now });
        const side = sideFor(m, seats[i]);
        if (side && !craft[i].applied) {
          applyOne(craft[i], side);
        }
      }
    }
  }
  return { hits, log: room.referee.log };
}

/* A forced break (sim_part_break, the both break rule) is the one event
 * with no force and no moment on the part the hit named. */
const forced = (ac, e) => e.typeName === 'break' && ac.applied && e.part === ac.applied.side.brk && e.force === 0 && e.moment === 0;

function outcome(ac) {
  const perm = ac.events.filter((e) => PERMANENT.has(e.typeName));
  const kinds = [...new Set(perm.map((e) => e.typeName))];
  return {
    damaged: kinds.length > 0,
    physics: perm.some((e) => !forced(ac, e)),
    kinds,
    wreck: isWreck(ac.sim.e.sim_damage_flags(), ac.af.fixedWing),
  };
}

function stateHash(ac) {
  const h = createHash('sha256');
  h.update(ac.sim.readStateBytes().bytes);
  ac.sim.e.sim_parts_state(ac.partsPtr);
  h.update(new Uint8Array(ac.sim.e.memory.buffer, ac.partsPtr, ac.table.length * PART_STATE_DOUBLES * 8));
  return h.digest('hex');
}

/* The same module calls on a fresh module: the flight without a room. */
async function replay(ac) {
  const fresh = await aircraft(ac.id, null, 0, 0, false);
  for (const [name, args] of ac.ops) {
    fresh.sim.e[name](...args);
  }
  return stateHash(fresh) === stateHash(ac);
}

/* ------------------------------------------------------------- passes */

/*
 * An aircraft placed so that its CG is at (0, 0, ALT) at MEET_MS on its
 * own sticks: flown once alone from the origin to find where MEET_MS
 * takes it (the plant flies the same wherever it starts, with no ground
 * and at one height), then started that far back. The two then meet
 * whatever the sticks do to each on the way.
 */
async function toMeet(id, yaw, speed) {
  const probe = await aircraft(id, [0, 0, ALT], yaw, speed);
  for (let t = 0; t < MEET_MS; t += 1) {
    const st = state(probe);
    probe.call('sim_input', st[0] + 0.0001, 0, 0, 0, probe.throttle);
    probe.call('sim_step', 1);
  }
  const at = state(probe);
  return aircraft(id, [-at[1], -at[2], 2 * ALT - at[3]], yaw, speed);
}
/* Head on: A along +x, B along -x. */
async function headOn(a, b, va, vb) {
  return [await toMeet(a, 0, va), await toMeet(b, Math.PI, vb)];
}
/* Crossing: A along +x, B along +y. */
async function crossing(a, b, va, vb) {
  return [await toMeet(a, 0, va), await toMeet(b, Math.PI / 2, vb)];
}

const PAIRS = [
  ['cub1400', 'cub1400'],
  ['cub1400', 'p51d1450'],
  ['interceptor', 'interceptor'],
  ['interceptor', 'cub1400'],
  ['slowstick1180', 'bombshell1118'],
];
const CLOSINGS = [8, 12, 16, 24, 36, 50];

console.log('mid air through the real plant, both sides');
const drift = [];
let rows = 0;
let bothDamaged = 0;
let bothPhysics = 0;
let bothWreck = 0;
let replayed = 0;
let replayOk = 0;
const lines = [];
for (const [a, b] of PAIRS) {
  for (const geometry of ['head on', 'crossing']) {
    for (const closing of CLOSINGS) {
      for (const latency of [0, 50]) {
        const va = geometry === 'head on' ? closing / 2 : closing / Math.SQRT2;
        const vb = va;
        const [A, B] = await (geometry === 'head on' ? headOn : crossing)(a, b, va, vb);
        const r = pass(A, B, latency);
        const gotA = r.hits[0].length;
        const gotB = r.hits[1].length;
        const oa = outcome(A);
        const ob = outcome(B);
        const tag = `${a} x ${b}, ${geometry}, ${closing} m/s closing, ${latency} ms links`;
        const hit = r.log[0];
        /* The closing speed AT THE HIT, the room's own figure (its pose
         * velocities, src/game/midair.js hitMessage), which is what the both
         * break rule is judged on. The nominal `closing` is what the two
         * were thrown at: an aircraft that sheds speed on the way in meets
         * the other slower than that, and the rule rightly leaves a pass
         * under BREAK_MPS to the physics. */
        const met = hit ? Math.hypot(hit.va[0] - hit.vb[0], hit.va[1] - hit.vb[1], hit.va[2] - hit.vb[2]) : 0;
        lines.push(`    ${tag.padEnd(58)} ${hit ? `hit at ${hit.tc} ms, met at ${met.toFixed(1)} m/s` : 'NO HIT'}; A ${oa.kinds.join('+') || 'intact'}${oa.wreck ? ' (wreck)' : ''}; B ${ob.kinds.join('+') || 'intact'}${ob.wreck ? ' (wreck)' : ''}`);
        if (met >= BREAK_MPS) {
          rows += 1;
          const ok = gotA === 1 && gotB === 1 && A.applied && B.applied && A.applied.rc === SIM_OK && B.applied.rc === SIM_OK && oa.damaged && ob.damaged;
          if (ok) {
            bothDamaged += 1;
          } else {
            lines.push(`      ^ FAIL: hits ${gotA}/${gotB}, applied ${A.applied ? A.applied.rc : '-'}/${B.applied ? B.applied.rc : '-'}`);
          }
          if (oa.wreck && ob.wreck) {
            bothWreck += 1;
          }
          if (oa.physics && ob.physics) {
            bothPhysics += 1;
          }
        }
        if (A.applied && B.applied) {
          const s = A.applied.dp.map((x, k) => x + B.applied.dp[k]);
          const big = Math.max(Math.hypot(...A.applied.dp), Math.hypot(...B.applied.dp));
          if (big > 0) {
            drift.push(Math.hypot(...s) / big);
          }
        }
        if (latency === 50 && (closing === 24 || closing === 50)) {
          replayed += 2;
          replayOk += (await replay(A)) ? 1 : 0;
          replayOk += (await replay(B)) ? 1 : 0;
        }
      }
    }
  }
}
for (const l of lines) {
  console.log(l);
}
check(`P1 both aircraft damaged in every pass that met at ${BREAK_MPS} m/s closing or more`, bothDamaged === rows && rows > 0,
  `${bothDamaged} of ${rows}; by the plant's limits alone, before the both break rule, ${bothPhysics}; both wrecks by the shell's rule in ${bothWreck}`);
const sorted = [...drift].sort((x, y) => x - y);
const med = sorted[Math.floor(sorted.length / 2)];
const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
console.log(`  info  P2 momentum drift |dPA + dPB| / max: median ${(med * 100).toFixed(0)} percent, p95 ${(p95 * 100).toFixed(0)} percent, worst ${(sorted[sorted.length - 1] * 100).toFixed(0)} percent over ${sorted.length} passes`);
check('P3 a replay of the module calls alone gives the same plant, bit for bit', replayOk === replayed && replayed > 0, `${replayOk} of ${replayed}`);
const [FA, FB] = await headOn('cub1400', 'p51d1450', 15, 15);
const fr = pass(FA, FB, 50, true);
check('P4 a friendly room sends no hit', fr.log.length === 0 && fr.hits[0].length === 0 && fr.hits[1].length === 0 && outcome(FA).kinds.length === 0,
  `${fr.log.length} hits; A ${outcome(FA).kinds.join('+') || 'intact'}`);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
