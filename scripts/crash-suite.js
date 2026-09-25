/*
 * crash-suite.js: docs/CRASH-PLAN.md's crash suite, every scenario flown
 * deterministically in Node and judged against bands from references.
 *
 *   node scripts/crash-suite.js [--out DIR] [--only ID[,ID...]] [--no-chrome] [--sheets]
 *
 * For each scenario in tests/crash/scenarios.js: a fresh module, the
 * airframe, crash damage ON (sim_set_damage(1), and the whoop's own part
 * table, sim_set_part_table(1), as the shell flies it), the setup, and the
 * pilot flying it into the contact, 4 ms at a time, with the obstacle pass
 * the shell runs on the same clock. The world is named to the plant as the
 * shell names it (src/main.js, THE CRASH SHELL): the ground's material,
 * each obstacle's material on contact, every solid for the parts that
 * break off, and trees as crowns the craft flies into. What happened is
 * read from the module: the state block, and the damage readback
 * (tests/crash/readback.js), every step.
 * Each outcome is judged against tests/crash/bands.json, whose every
 * number has its source in docs/CRASH-REFERENCES.md; a band is never
 * moved to meet the plant.
 *
 * Determinism: every module call the run made is recorded
 * (tests/crash/program.js) and replayed on a fresh module in Node and in
 * headless Chrome (tests/crash/replay.html); the three trace hashes (the
 * state block and every part's state) must agree, and so must the damage
 * readback each replay ends with.
 *
 * Writes DIR/report.json, the machine readable report the loop reads, and
 * prints a table per scenario, then the failure histogram (how often each
 * metric fails) and the worst scenarios, which is what the loop picks its
 * next round from. --sheets also takes the frames for the
 * contact sheets (tests/crash/sheet.html, SIM_GPU=1 for real pictures)
 * and builds them with tools/crash/sheet.py. DIR defaults to
 * ~/.cache/fdfpv-crash, outside the repository (pictures are not
 * committed, CLAUDE.md) and outside /tmp, which is a small tmpfs here.
 *
 * Exit code: 0 when the harness ran every scenario, whatever the bands
 * said (a failing band is the suite's answer, not an error); 1 when a
 * scenario could not be flown or a hash disagreed.
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

import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, SIM_OK } from '../tests/lib/simmod.js';
import { Recorder, replayProgram, endState } from '../tests/crash/program.js';
import { SCENARIOS, CRAFT, attitude } from '../tests/crash/scenarios.js';
import { damageReader } from '../tests/crash/readback.js';
import { setCraftAirframe, contactMaterial, contactPatch, BOUNCE_SEPARATION, KINDS } from '../src/game/collide.js';
import { obstacleSurfaces, solidSurface } from '../src/game/crashworld.js';
import { DAMAGE_FLAGS } from '../configs/parts.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const G = 9.80665;
const RC_MS = 4;

/* The shell's blade strike on an obstacle hit, src/main.js feelImpact:
 * the impulse that reads as a full hit, and the most rotor speed one can
 * take. Local constants there, so repeated here with the reference. */
const IMPACT_FULL = 12.0;
const IMPACT_PROP_MAX = 0.28;

/* At rest: slower than this, turning slower than this, for this long. */
const REST_V = 0.15;
const REST_W = 0.5;
const REST_HOLD_MS = 500;

/* A load over this many g on the CG is a contact: a five inch at full
 * throttle makes about 10 (a thrust to weight near 10), nothing that flies
 * here makes 15. */
const CONTACT_G = 15;

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}
const OUT = resolve(argValue('--out') ?? join(homedir(), '.cache', 'fdfpv-crash'));
const ONLY = argValue('--only') ? new Set(argValue('--only').split(',')) : null;
const CHROME = !process.argv.includes('--no-chrome');
const SHEETS = process.argv.includes('--sheets');

const wasm = new Uint8Array(await readFile(join(root, 'dist/sim.wasm')));
const configText = await readFile(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const bands = JSON.parse(await readFile(join(root, 'tests/crash/bands.json'), 'utf8'));

const must = (c, w) => {
  if (c !== SIM_OK) {
    throw new Error(`${w}: sim returned ${c}`);
  }
};

/* ---- the obstacle pass: the shell's contact, the suite's detection ---- */

function bodyUp(s) {
  const w = s[7], x = s[8], y = s[9], z = s[10];
  return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
}

/* How far the hull reaches from the CG along the unit d, the disc the
 * shell sweeps: the sweep radius in the prop plane, the vertical extents
 * along the body's up axis. */
function support(dims, s, d) {
  const u = bodyUp(s);
  const du = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const perp = Math.sqrt(Math.max(0, 1 - du * du));
  const R = dims.arm + (dims.hullR ?? dims.propR);
  return R * perp + (du > 0 ? dims.vHalfUp : dims.vHalfDown) * Math.abs(du);
}

function closestOnSegment(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  let t = l2 > 0 ? ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]];
}

/* The gap between the hull and a solid (negative is overlap) and the unit
 * normal out of the solid toward the craft. */
function gapTo(dims, s, solid) {
  const c = [s[1], s[2], s[3]];
  let n;
  let dist;
  let r = 0;
  if (solid.shape === 'plane') {
    n = solid.n;
    dist = (c[0] - solid.p[0]) * n[0] + (c[1] - solid.p[1]) * n[1] + (c[2] - solid.p[2]) * n[2];
  } else {
    const q = solid.shape === 'sphere' ? solid.c : closestOnSegment(solid.a, solid.b, c);
    const w = [c[0] - q[0], c[1] - q[1], c[2] - q[2]];
    dist = Math.hypot(w[0], w[1], w[2]);
    if (!(dist > 1e-9)) {
      return null;
    }
    n = [w[0] / dist, w[1] / dist, w[2] / dist];
    r = solid.r;
  }
  return { n, gap: dist - r - support(dims, s, [-n[0], -n[1], -n[2]]) };
}

/* Plant frame to the shell's Three.js frame and back (src/render/frame.js,
 * spawn yaw zero): what contactPatch is written in. */
const toThree = (v) => [-v[1], v[2], -v[0]];
const fromThree = (v) => [-v[2], -v[0], v[1]];

function obstaclePass(rec, sim, dims, solids, kindSurface, log, ms) {
  let hit = null;
  for (const solid of solids) {
    /* A crown the plant holds (sim_tree_add) is flown into, not off: the
     * shell lets its sweep pass through it, and so does this. */
    if (solid.pass) {
      continue;
    }
    const s = sim.readState().state;
    const g = gapTo(dims, s, solid);
    if (!g || g.gap >= 0) {
      continue;
    }
    const { n } = g;
    const vn = s[4] * n[0] + s[5] * n[1] + s[6] * n[2];
    const sep = -g.gap + BOUNCE_SEPARATION;
    const p = [s[1] + n[0] * sep, s[2] + n[1] * sep, s[3] + n[2] * sep];
    if (vn < -0.05) {
      const nt = toThree(n);
      const rt = contactPatch(nt[0], nt[1], nt[2], -s[9], s[10], -s[8], s[7], { x: 0, y: 0, z: 0 });
      const arm = fromThree([rt.x, rt.y, rt.z]);
      /* The shell's choice: the module's material where its numbers are
       * the shell's own for that kind, so only the damage judgement learns
       * what was hit; the shell's own numbers otherwise. */
      const surf = kindSurface[KINDS.indexOf(solid.kind)] ?? -1;
      if (surf >= 0) {
        must(rec.call('sim_contact_at_mat', n[0], n[1], n[2], surf, p[0], p[1], p[2], 0, 0, 0, arm[0], arm[1], arm[2]), 'sim_contact_at_mat');
      } else {
        const mat = contactMaterial(solid.kind);
        must(rec.call('sim_contact_at', n[0], n[1], n[2], mat.e, mat.mu, p[0], p[1], p[2], 0, 0, 0, arm[0], arm[1], arm[2]), 'sim_contact_at');
      }
      const a = sim.readState().state;
      const dv = Math.hypot(a[4] - s[4], a[5] - s[5], a[6] - s[6]);
      if (dv > 0) {
        must(rec.call('sim_prop_strike', IMPACT_PROP_MAX * Math.min(1, dv / IMPACT_FULL)), 'sim_prop_strike');
      }
      log.push({ ms, kind: solid.kind, vn, dv });
      hit = hit ?? { kind: solid.kind, dv };
    } else if (g.gap < -0.02) {
      /* Buried and not closing: moved onto the free side without an
       * impulse, the shell's separateAt. */
      must(rec.call('sim_set_pose', p[0], p[1], p[2], s[7], s[8], s[9], s[10]), 'sim_set_pose');
    }
  }
  return hit;
}

/* ---- the world named to the plant ---- */

/*
 * A solid for the parts that break off, which the shell's sweep does not
 * track (src/main.js declareSolid): a post as an upright cylinder over its
 * whole height, a bar or a wall as the box that holds it. Trees and crowns
 * are not solids here, as in the shell: a tree the plant holds gives the
 * free bodies its own trunk, and a leaning 'tree' capsule (a branch) is
 * left out of the shell's set too. Returns the module's answer.
 */
const WALL_HALF = 50;
const WALL_THICK = 0.25;

/* The rotation taking the x axis onto the unit d, the shortest arc. */
function arcFromX(d) {
  const q = 1 + d[0] < 1e-9 ? [0, 0, 0, 1] : [1 + d[0], 0, -d[2], d[1]];
  const qn = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / qn, q[1] / qn, q[2] / qn, q[3] / qn];
}

function declareSolid(rec, solid) {
  if (solid.kind === 'tree' || solid.kind === 'canopy') {
    return 0;
  }
  const mat = solidSurface(solid.kind);
  if (solid.shape === 'plane') {
    const n = solid.n;
    /* The box's x axis onto -n, the shortest arc; its face on the plane. */
    const d = [-n[0], -n[1], -n[2]];
    const q = arcFromX(d);
    const c = [solid.p[0] + d[0] * WALL_THICK, solid.p[1] + d[1] * WALL_THICK, solid.p[2] + d[2] * WALL_THICK];
    return rec.call('sim_obstacle_box', c[0], c[1], c[2], WALL_THICK, WALL_HALF, WALL_HALF, q[0], q[1], q[2], q[3], mat);
  }
  if (solid.shape === 'capsule') {
    const { a, b, r } = solid;
    if (Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3) {
      return rec.call('sim_obstacle_cylinder', a[0], a[1], Math.min(a[2], b[2]) - r, Math.max(a[2], b[2]) + r, r, mat);
    }
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const q = arcFromX([dx / len, dy / len, dz / len]);
    return rec.call('sim_obstacle_box', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, len / 2 + r, r, r, q[0], q[1], q[2], q[3], mat);
  }
  throw new Error(`no plant solid for a ${solid.shape}`);
}

/* ---- reads that write nothing ---- */

function readVec(sim, fn, n) {
  if (typeof sim.e[fn] !== 'function') {
    return null;
  }
  sim.bufs = sim.bufs ?? {};
  if (!sim.bufs[fn]) {
    sim.bufs[fn] = sim.e.malloc(n * 8);
  }
  if (sim.e[fn](sim.bufs[fn]) !== SIM_OK) {
    return null;
  }
  return Array.from(new Float64Array(sim.e.memory.buffer, sim.bufs[fn], n));
}

function restClass(s) {
  const a = attitude(s);
  if (a.upz > 0.7) {
    return 'upright';
  }
  if (a.upz < -0.7) {
    return 'inverted';
  }
  if (a.pitch < -50 * Math.PI / 180) {
    return 'nose down';
  }
  return 'on its side';
}

/* ---- one scenario ---- */

async function fly(sc) {
  const c = CRAFT[sc.craft];
  const dims = airframeById(c.shell).dims;
  setCraftAirframe(dims);
  const sim = await loadSim(wasm);
  const scale = c.scale ?? 1;

  /* What the run measures, per millisecond, once armed. */
  const M = {
    armMs: null, impact: null, contacts: [], peakG: 0, peakGMs: null, peakW: 0,
    prev: null, restStart: null, restMs: null, minUpz: 1, rotAfter: 0, wetMs: 0,
    samples: [], obstacleLog: [], events: [], pitchSignChanges: 0, lastPitchRate: 0,
    liftoffMs: null, liftoffV: null, maxBankAfterLiftoff: 0, minVAirborne: Infinity,
  };
  let rec = null;
  const reader = damageReader(sim);
  if (!reader) {
    throw new Error('dist/sim.wasm has no crash physics ABI (sim_set_damage): rebuild it');
  }
  const onMs = (ms) => {
    const s = sim.readState().state;
    const prev = M.prev;
    M.prev = s;
    if (ms % 20 === 0) {
      M.samples.push([ms, s[1], s[2], s[3], s[7], s[8], s[9], s[10], s[4], s[5], s[6]]);
    }
    reader.sample(ms, M.armMs !== null);
    if (M.armMs === null) {
      return;
    }
    const hullN = sim.e.sim_ground_contacts();
    const wheels = readVec(sim, 'sim_wheel_loads', 4) ?? [0, 0, 0, 0];
    const floats = c.floats ? readVec(sim, 'sim_float_state', 10) : null;
    const wet = floats ? floats[3] > 0 : false;
    const kinds = [];
    if (hullN > 0) {
      kinds.push('hull');
    }
    if (wheels[0] > 0 || wheels[1] > 0 || wheels[2] > 0) {
      kinds.push('gear');
    }
    if (wheels[3] > 0) {
      kinds.push('prop tip');
    }
    if (wet) {
      kinds.push('water');
    }
    /* Inside a crown the plant holds: the tree's contact is the drag of
     * its twigs, which no counter above sees. */
    if (sim.e.sim_damage_flags() & DAMAGE_FLAGS.inTree) {
      kinds.push('crown');
    }
    const dt = 0.001;
    let gNow = 0;
    if (prev) {
      const ax = (s[4] - prev[4]) / dt;
      const ay = (s[5] - prev[5]) / dt;
      const az = (s[6] - prev[6]) / dt + G;
      gNow = Math.hypot(ax, ay, az) / G;
    }
    /* The hull count is not enough on its own: a hull held out of the
     * ground by projection (an inverted arrival, sim.c ground_apply) or
     * put to sleep by the settle takes no counted hit. A load no flight
     * can make is a contact whatever the counters say. */
    if (gNow > CONTACT_G) {
      kinds.push('load');
    }
    const counts = (sc.impactOn ?? null);
    const contact = kinds.filter((k) => !counts || counts.includes(k));
    if (!M.impact && contact.length && !sc.impactOnArm) {
      M.impact = { ms, kinds: contact, s: prev ?? s };
    }
    if (kinds.length) {
      M.lastContactMs = ms;
    }
    for (const k of kinds) {
      if (!M.contacts.find((o) => o.kind === k)) {
        M.contacts.push({ kind: k, ms });
      }
    }
    if (!M.impact || !prev) {
      return;
    }
    if (gNow > M.peakG) {
      M.peakG = gNow;
      M.peakGMs = ms;
    }
    const w = Math.hypot(s[11], s[12], s[13]);
    M.peakW = Math.max(M.peakW, w);
    M.rotAfter += w * dt;
    const a = attitude(s);
    M.minUpz = Math.min(M.minUpz, a.upz);
    if (wet) {
      M.wetMs += 1;
      const qr = s[12];
      if (Math.abs(qr) > 0.35 && Math.sign(qr) !== Math.sign(M.lastPitchRate)) {
        M.pitchSignChanges += 1;
        M.lastPitchRate = qr;
      }
    }
    const airborne = !kinds.length;
    if (airborne && M.liftoffMs === null && c.floats && M.wetMs > 200 && s[3] > c.floats.z + 0.3) {
      M.liftoffMs = ms;
      M.liftoffV = Math.hypot(s[4], s[5], s[6]);
    }
    if (M.liftoffMs !== null) {
      M.maxBankAfterLiftoff = Math.max(M.maxBankAfterLiftoff, Math.abs(a.bank));
      if (airborne) {
        M.minVAirborne = Math.min(M.minVAirborne, Math.hypot(s[4], s[5], s[6]));
      }
    }
    const v = Math.hypot(s[4], s[5], s[6]);
    if (v < REST_V && w < REST_W) {
      M.restStart = M.restStart ?? ms;
      if (M.restMs === null && ms - M.restStart >= REST_HOLD_MS) {
        M.restMs = M.restStart;
        M.restState = s;
      }
    } else {
      M.restStart = null;
    }
  };

  rec = new Recorder(sim, { onMs });
  must(rec.init(configText), 'sim_init');
  must(rec.call('sim_set_airframe', c.sim), 'sim_set_airframe');
  must(rec.call('sim_reset'), 'sim_reset');
  must(rec.call('sim_set_cell_voltage', c.volts ?? 4.1), 'sim_set_cell_voltage');
  /* The part table first: setting it clears the damage state. The shell's
   * whoop is the five inch's plant in a scaled room, made of the real
   * whoop's parts scaled to it (src/main.js syncPartTable). */
  must(rec.call('sim_set_part_table', c.partTable ?? 0), 'sim_set_part_table');
  must(rec.call('sim_set_damage', 1), 'sim_set_damage');
  const massKg = sim.e.sim_bf_debug ? sim.e.sim_bf_debug(51) : null;
  const matInfo = sim.e.malloc(4 * 8);
  const kindSurface = obstacleSurfaces((mat) => {
    if (sim.e.sim_material_info(mat, matInfo) !== SIM_OK) {
      return null;
    }
    const d = new Float64Array(sim.e.memory.buffer, matInfo, 4);
    return [d[0], d[1]];
  });
  const solids = [];
  const h = {
    s: null,
    ms: 0,
    mem: {},
    dims,
    hit: null,
    rest: false,
    damage: reader,
    has: (name) => typeof sim.e[name] === 'function',
    call: (name, ...args) => rec.call(name, ...args),
    place: (solid) => {
      solids.push(solid);
      if (declareSolid(rec, solid) < 0) {
        throw new Error('sim_obstacle_*: the plant holds no more solids');
      }
    },
    /* A tree: its trunk the shell's solid, as a broadleaf's is
     * (src/game/crashworld.js collectTrees), its crown the plant's, a
     * cylinder holding the crown sphere, which the sweep passes through. */
    tree: ({ x, y, trunkR, trunkTop, crownZ, crownR }) => {
      h.place({ kind: 'canopy', shape: 'sphere', c: [x, y, crownZ], r: crownR, pass: true });
      h.place({ kind: 'tree', shape: 'capsule', a: [x, y, 0], b: [x, y, trunkTop], r: trunkR });
      if (rec.call('sim_tree_add', x, y, 0, trunkR, Math.max(0, crownZ - crownR), crownZ + crownR, crownR) < 0) {
        throw new Error('sim_tree_add: the plant holds no more trees');
      }
    },
    arm: () => {
      if (M.armMs === null) {
        M.armMs = h.ms;
        if (sc.impactOnArm) {
          const s = sim.readState().state;
          M.impact = { ms: rec.clock.ms, kinds: ['armed'], s };
        }
      }
    },
    event: (what) => M.events.push({ ms: rec.clock.ms, what }),
  };
  h.s = sim.readState().state;
  sc.setup(h);
  const t0 = rec.clock.ms;
  const total = sc.seconds * 1000;
  for (let ms = 0; ms < total; ms += RC_MS) {
    h.s = sim.readState().state;
    h.ms = ms;
    h.hit = M.impact ? { ms: M.impact.ms - t0 } : null;
    h.rest = M.restMs !== null;
    const [roll, pitch, yaw, thr] = sc.pilot(h);
    must(rec.call('sim_input', (t0 + ms) / 1000, roll, pitch, yaw, thr), 'sim_input');
    rec.step(RC_MS);
    if (solids.length) {
      const hit = obstaclePass(rec, sim, dims, solids, kindSurface, M.obstacleLog, rec.clock.ms);
      if (hit && M.armMs !== null && !M.impact) {
        M.impact = { ms: rec.clock.ms, kinds: [hit.kind], s: M.prev };
      }
    }
    const s = sim.readState().state;
    if (!Array.from(s).every(Number.isFinite)) {
      throw new Error(`state went non finite at ${ms} ms`);
    }
    if (M.restMs !== null && rec.clock.ms - M.restMs > (sc.afterRestMs ?? 1500)) {
      break;
    }
  }
  const hash = await rec.hash();
  const end = sim.readState().state;
  const damage = reader.read();
  return { sc, c, dims, massKg, scale, M, has: h.has, end, endMs: rec.clock.ms, hash, ops: rec.ops, solids, t0, damage, extra: sc.outcome ? sc.outcome(h) : {} };
}

/* ---- what happened, as numbers ---- */

function outcomeOf(run) {
  const { M, end, massKg, scale, c } = run;
  const d = run.damage;
  const o = {
    impacted: Boolean(M.impact),
    impactKinds: M.impact ? M.impact.kinds : [],
    contacts: M.contacts,
    obstacleContacts: M.obstacleLog.length,
    events: M.events,
    massKg,
    /* What the damage readback says (tests/crash/readback.js). */
    broken: d.broken,
    damaged: d.damaged,
    damageFlags: d.flags,
    damageFlagsSeen: d.flagsSeen,
    damageEvents: d.events,
    damageEventsDropped: d.eventsDropped,
    partsEnergyJ: d.energyJ,
    eventsEnergyJ: d.eventsEnergyJ,
    peakPartLoad: d.peakLoad,
    peakPartLoadPart: d.peakLoadPart,
    motorDamage: d.motors,
    parts: d.parts.map((p) => ({ kind: p.kind, status: p.status, damage: p.damage, energyJ: p.energyJ, peakLoad: p.peakLoad })),
  };
  if (!M.impact) {
    return o;
  }
  const s0 = M.impact.s;
  const v0 = Math.hypot(s0[4], s0[5], s0[6]);
  const rs = M.restState ?? end;
  const vEnd = Math.hypot(rs[4], rs[5], rs[6]);
  o.impactSpeed = v0 / scale;
  /* The descent at touchdown, what a parachute's rating means: in wind
   * the craft also drifts with the air, which adds to its speed over the
   * ground but not to the rate it comes down at. */
  o.sinkRate = -s0[6] / scale;
  o.impactMs = M.impact.ms;
  /* The plant resolves a contact as an impulse inside one step, so this is
   * the velocity change over a millisecond: an upper bound on the real
   * peak, whose contact lasts milliseconds (docs/CRASH-REFERENCES.md). */
  o.peakG = M.peakG / scale;
  o.peakForceN = massKg ? massKg * G * M.peakG : null;
  o.peakRateRadS = M.peakW;
  o.rotationAfterRad = M.rotAfter;
  o.minUpZ = M.minUpz;
  o.rested = M.restMs !== null;
  o.timeToRestS = M.restMs !== null ? (M.restMs - M.impact.ms) / 1000 : null;
  o.restDistM = Math.hypot(rs[1] - s0[1], rs[2] - s0[2]) / scale;
  o.restAttitude = restClass(rs);
  o.restUpZ = attitude(rs).upz;
  o.restHeightM = rs[3] / scale;
  const e0 = 0.5 * v0 * v0 + G * s0[3];
  const e1 = 0.5 * vEnd * vEnd + G * rs[3];
  o.impactEnergyJ = massKg ? massKg * 0.5 * v0 * v0 : null;
  o.dissipatedJ = massKg ? massKg * (e0 - e1) : null;
  /* Of the energy there was to lose, the arrival's kinetic energy and
   * the height it came down after the first touch. */
  const avail = 0.5 * v0 * v0 + G * Math.max(0, s0[3] - rs[3]);
  o.dissipatedFrac = avail > 0 ? (e0 - e1) / avail : null;
  /* Energy kept through the first contact: 100 ms after it, kinetic plus
   * the height gained, over what arrived. */
  const after = M.samples.find((r) => r[0] >= M.impact.ms + 100);
  if (after) {
    const va = Math.hypot(after[8], after[9], after[10]);
    o.retainedFirst = (0.5 * va * va + G * (after[3] - s0[3])) / (0.5 * v0 * v0);
  }
  const endUp = attitude(end);
  /* Flying at the end: a second without touching anything, upright, not
   * falling. What a whoop that survived a wall does. */
  o.flyingAtEnd = run.endMs - (M.lastContactMs ?? 0) > 1000 && endUp.upz > 0.9 && Math.abs(end[6]) < 1.5;
  if (c.floats) {
    o.pitchReversalsOnWater = M.pitchSignChanges;
    o.liftoffSpeed = M.liftoffV;
    o.liftoffOverStall = M.liftoffV ? M.liftoffV / c.Vs : null;
    o.maxBankAfterLiftoffDeg = M.maxBankAfterLiftoff * 180 / Math.PI;
  }
  /* The first joint that failed, from the first contact; and the pieces
   * that left, how many and how far the farthest lies from the impact. */
  o.firstBreakS = d.firstBreakMs !== null ? (d.firstBreakMs - M.impact.ms) / 1000 : null;
  const away = d.parts.filter((p) => p.detached);
  o.debrisCount = away.length;
  o.debrisMaxDistM = away.length
    ? Math.max(...away.map((p) => Math.hypot(p.pos[0] - s0[1], p.pos[1] - s0[2]))) / scale
    : null;
  const lost = M.events.find((e) => e.what === 'prop lost');
  if (lost) {
    o.lossToGroundS = (M.impact.ms - lost.ms) / 1000;
  }
  Object.assign(o, run.extra);
  return o;
}

/* ---- the bands ---- */

function judge(id, o) {
  const set = bands.scenarios[id];
  if (!set) {
    return [{ metric: 'bands', status: 'fail', note: 'no bands written for this scenario' }];
  }
  const out = [];
  for (const b of set.checks) {
    const r = { metric: b.metric, band: b, status: 'fail', value: null, note: '' };
    /* What broke, from the readback: mustBreak every part named broken,
     * mustDamage every part named damaged at least (a chipped prop counts),
     * mustNotBreak none of them broken. */
    if (b.parts) {
      r.value = b.metric === 'mustDamage' ? o.damaged : o.broken;
      const got = new Set(r.value);
      r.status = b.metric === 'mustNotBreak'
        ? (b.parts.some((p) => got.has(p)) ? 'fail' : 'pass')
        : (b.parts.every((p) => got.has(p)) ? 'pass' : 'fail');
      if (b.imposed) {
        r.note = b.imposed;
      }
      out.push(r);
      continue;
    }
    const v = o[b.metric];
    r.value = v ?? null;
    if (v === undefined || v === null) {
      r.note = o.impacted ? 'not measured in this run' : 'no impact happened';
    } else if (b.oneOf) {
      r.status = b.oneOf.includes(v) ? 'pass' : 'fail';
    } else if (typeof b.equals === 'boolean') {
      r.status = v === b.equals ? 'pass' : 'fail';
    } else {
      const lo = b.min ?? -Infinity;
      const hi = b.max ?? Infinity;
      r.status = v >= lo && v <= hi ? 'pass' : 'fail';
    }
    out.push(r);
  }
  return out;
}

/* ---- Chrome ---- */

/* Chrome leaves its own scratch directories beside the profile page.js
 * removes. The directory is the suite's alone, so they go too. */
async function sweepChromeScratch(dir) {
  for (const name of await readdir(dir)) {
    if (name.startsWith('com.google.Chrome.')) {
      await rm(join(dir, name), { recursive: true, force: true });
    }
  }
}

async function chromeHashes(runs) {
  const { openPage } = await import('../tests/lib/page.js');
  /* page.js puts the Chrome profile under the system temp, which is a
   * small tmpfs on this machine. A short fixed path takes it instead: the
   * profile's singleton socket must fit a unix socket's 108 bytes, which
   * a deep --out does not. */
  process.env.TMPDIR = join(homedir(), '.cache', 'fdfpv-crash-tmp');
  await mkdir(process.env.TMPDIR, { recursive: true });
  const page = await openPage({ root, url: '/tests/crash/replay.html', width: 320, height: 240 });
  const out = new Map();
  try {
    await page.until('window.__crashReady', 60000);
    for (const run of runs) {
      const json = JSON.stringify(run.ops);
      out.set(run.sc.id, await page.evaluate(`window.__crashReplay(${JSON.stringify(json)})`));
    }
    if (page.errors.length) {
      throw new Error(`the replay page logged errors: ${page.errors.join(' | ')}`);
    }
  } finally {
    await page.close();
    await sweepChromeScratch(process.env.TMPDIR);
  }
  return out;
}

/* ---- the table ---- */

function fmt(v) {
  if (v === null || v === undefined) {
    return '-';
  }
  if (typeof v === 'number') {
    return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  }
  if (Array.isArray(v)) {
    return v.length ? v.join(' ') : 'none';
  }
  return String(v);
}

function bandText(b) {
  if (b.parts) {
    return b.parts.join(' ');
  }
  if (b.oneOf) {
    return b.oneOf.join(' or ');
  }
  if (typeof b.equals === 'boolean') {
    return String(b.equals);
  }
  if (b.min === undefined) {
    return `at most ${b.max}`;
  }
  if (b.max === undefined) {
    return `at least ${b.min}`;
  }
  return `${b.min} to ${b.max}`;
}

/*
 * How far outside its band a failing check is, for ranking only: the log
 * of the ratio past the nearer edge where both are positive (a peak load
 * five times its ceiling is 1.6, whatever the units), the distance over
 * the band's width otherwise, and 1 for a part, a class or a value that
 * was never measured. Each capped at 3 so one wild number cannot hide the
 * rest of a scenario.
 */
function missOf(c) {
  const v = c.value;
  const b = c.band;
  if (!b || typeof v !== 'number' || b.min === undefined && b.max === undefined) {
    return 1;
  }
  const edge = b.max !== undefined && v > b.max ? b.max : b.min;
  let m;
  if (v > 0 && edge > 0) {
    m = Math.abs(Math.log(v / edge));
  } else {
    const width = b.min !== undefined && b.max !== undefined ? b.max - b.min : 1;
    m = Math.abs(v - edge) / Math.max(width, 1e-9);
  }
  return Math.min(3, m);
}

/* ---- main ---- */

await mkdir(OUT, { recursive: true });
const list = SCENARIOS.filter((sc) => !ONLY || ONLY.has(sc.id));
const runs = [];
let harnessFailures = 0;
for (const sc of list) {
  try {
    const run = await fly(sc);
    run.nodeReplay = await replayProgram(await loadSim(wasm), configText, run.ops);
    runs.push(run);
  } catch (e) {
    harnessFailures += 1;
    console.log(`HARNESS FAIL  ${sc.id}: ${e.stack}`);
  }
}

let chrome = null;
let chromeError = null;
if (CHROME && runs.length) {
  try {
    chrome = await chromeHashes(runs);
  } catch (e) {
    chromeError = e.message;
  }
}

const moduleHash = createHash('sha256').update(wasm).digest('hex');
const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const report = {
  suite: 'crash',
  version: 1,
  generated: new Date().toISOString(),
  git: gitHead,
  module: moduleHash,
  readback: runs.length > 0,
  chrome: CHROME ? (chromeError ? `failed: ${chromeError}` : 'ran') : 'skipped',
  scenarios: [],
};

for (const run of runs) {
  const o = outcomeOf(run);
  const checks = judge(run.sc.id, o);
  const cr = chrome ? chrome.get(run.sc.id) : null;
  /* What broke must agree too: the live run's readback at its end, and
   * each replay's. The hash already covers every part's state; this says
   * in words which host saw a different wreck when it does not. */
  const damageEnd = JSON.stringify(endState(run.damage));
  const det = {
    node: run.hash,
    nodeReplay: run.nodeReplay.hash,
    chrome: cr ? cr.hash : null,
    damageNodeReplay: JSON.stringify(run.nodeReplay.damage) === damageEnd ? 'same' : 'differs',
    damageChrome: cr ? (JSON.stringify(cr.damage) === damageEnd ? 'same' : 'differs') : null,
  };
  /* Chrome asked for and not run is not a pass: the cross-host half is
   * the half that can fail. */
  det.status = det.node === det.nodeReplay && det.damageNodeReplay === 'same'
    && (!CHROME || (cr && det.chrome === det.node && det.damageChrome === 'same')) ? 'pass' : 'fail';
  if (det.status === 'fail') {
    harnessFailures += 1;
  }
  const failed = checks.filter((c) => c.status === 'fail');
  const imp = run.M.impact ? run.M.impact.ms : null;
  const frames = imp === null ? null : {
    before: Math.max(0, imp - 400),
    impact: imp,
    after: imp + 150,
    rest: run.M.restMs ?? run.M.samples[run.M.samples.length - 1][0],
  };
  report.scenarios.push({
    id: run.sc.id,
    craft: run.sc.craft,
    airframe: run.c.shell,
    simAirframe: run.c.sim,
    family: run.sc.family,
    title: run.sc.title,
    map: run.sc.map,
    /* A scenario that needs an entry point the module now has is no longer
     * blocked by its absence (tests/crash/scenarios.js WIND_ENTRY). */
    blocked: run.sc.needs && run.has(run.sc.needs) ? null : (run.sc.blocked ?? null),
    standIn: run.sc.standIn ?? null,
    refStill: bands.scenarios[run.sc.id]?.refStill ?? null,
    status: failed.length ? 'fail' : 'pass',
    failing: failed.map((c) => c.metric),
    checks: checks.map((c) => ({ metric: c.metric, status: c.status, value: c.value, band: c.band ? bandText(c.band) : null, source: c.band?.source ?? null, note: c.note || undefined, miss: c.status === 'fail' ? missOf(c) : undefined })),
    outcome: o,
    determinism: det,
    frames,
    solids: run.solids,
    sheetGround: run.sc.sheetGround ?? null,
    scale: run.scale,
    samples: run.M.samples,
  });
}
report.summary = {
  scenarios: report.scenarios.length,
  pass: report.scenarios.filter((s) => s.status === 'pass').length,
  fail: report.scenarios.filter((s) => s.status === 'fail').length,
  deterministic: report.scenarios.filter((s) => s.determinism.status === 'pass').length,
  harnessFailures,
};

/* The loop's reading of the run: per metric, how many scenarios band it
 * and how many fail it (blocked scenarios counted apart, since they cannot
 * pass until what blocks them lands); and the scenarios by how far outside
 * their bands they are, the sum of their misses. */
const histogram = {};
for (const s of report.scenarios) {
  for (const c of s.checks) {
    const hm = histogram[c.metric] ?? (histogram[c.metric] = { banded: 0, fail: 0, failBlocked: 0 });
    hm.banded += 1;
    if (c.status === 'fail') {
      hm[s.blocked ? 'failBlocked' : 'fail'] += 1;
    }
  }
}
report.histogram = Object.entries(histogram)
  .map(([metric, v]) => ({ metric, ...v }))
  .sort((a, b) => (b.fail + b.failBlocked) - (a.fail + a.failBlocked) || a.metric.localeCompare(b.metric));
report.worst = report.scenarios
  .filter((s) => s.status === 'fail')
  .map((s) => ({
    id: s.id,
    blocked: Boolean(s.blocked),
    score: s.checks.reduce((a, c) => a + (c.miss ?? 0), 0),
    failing: s.checks.filter((c) => c.status === 'fail').map((c) => ({ metric: c.metric, value: c.value, band: c.band, miss: c.miss })),
  }))
  .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

/* The report the loop reads carries every sample, which the sheets need;
 * the summary file is the short one a person reads. */
await writeFile(join(OUT, 'report.json'), JSON.stringify(report));
const short = { ...report, scenarios: report.scenarios.map(({ samples, ...rest }) => { void samples; return rest; }) };
await writeFile(join(OUT, 'summary.json'), `${JSON.stringify(short, null, 1)}\n`);

for (const s of report.scenarios) {
  console.log(`\n${s.status.toUpperCase()}  ${s.id}  (${s.airframe}, ${s.family})${s.blocked ? `  BLOCKED: ${s.blocked}` : ''}${s.standIn ? `  STAND IN: ${s.standIn}` : ''}`);
  console.log(`  ${s.title}`);
  for (const c of s.checks) {
    console.log(`    ${c.status === 'pass' ? 'pass' : 'FAIL'}  ${c.metric.padEnd(22)} band ${String(c.band ?? '-').padEnd(24)} got ${fmt(c.value)}${c.note ? `  (${c.note})` : ''}`);
  }
  console.log(`    ${s.determinism.status === 'pass' ? 'pass' : 'FAIL'}  determinism           node ${s.determinism.node.slice(0, 12)} replay ${s.determinism.nodeReplay.slice(0, 12)} chrome ${s.determinism.chrome ? s.determinism.chrome.slice(0, 12) : report.chrome}; wreck replay ${s.determinism.damageNodeReplay} chrome ${s.determinism.damageChrome ?? report.chrome}`);
  const o = s.outcome;
  console.log(`          readback              broken ${fmt(o.broken)}; damaged ${fmt(o.damaged)}; flags ${fmt(o.damageFlagsSeen)}; absorbed ${fmt(o.partsEnergyJ)} J (events ${fmt(o.eventsEnergyJ)} J); peak part load ${fmt(o.peakPartLoad)} x limit (${o.peakPartLoadPart ?? '-'})`);
}
console.log('\nFailure histogram (scenarios failing each metric; blocked apart):');
for (const hm of report.histogram) {
  console.log(`  ${hm.metric.padEnd(22)} ${String(hm.fail).padStart(3)} fail${hm.failBlocked ? ` + ${hm.failBlocked} blocked` : ''} of ${hm.banded} banded`);
}
console.log('\nWorst scenarios (sum of misses: log ratio past a band edge, or 1 for a part, a class or a value never measured):');
for (const w of report.worst.slice(0, 10)) {
  console.log(`  ${w.id}${w.blocked ? ' (blocked)' : ''}  ${w.score.toFixed(2)}: ${w.failing.map((f) => `${f.metric} ${fmt(f.value)} (${f.band})`).join('; ')}`);
}
console.log(`\n${report.summary.scenarios} scenarios: ${report.summary.pass} inside every band, ${report.summary.fail} outside at least one; ${report.summary.deterministic} deterministic; damage readback ${report.readback ? 'available' : 'not available'}; chrome ${report.chrome}`);
console.log(`report: ${join(OUT, 'report.json')}`);

if (SHEETS) {
  const { takeSheets } = await import('../tools/crash/frames.js');
  await takeSheets({ root, out: OUT, report });
}

process.exit(harnessFailures || chromeError ? 1 : 0);
