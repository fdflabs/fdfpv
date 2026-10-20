/*
 * replay-refly.js: fly a saved replay clip again through the plant,
 * headless, and say where the re-fly and the recording part.
 *
 *   npm run replay:refly -- CLIP.fdfreplay
 *   npm run replay:refly -- CLIP.fdfreplay --wasm OTHER.wasm --every 0.5 --json out.json
 *   npm run replay:refly:selftest
 *
 * A clip saved since file version 17 carries the crash cam's journal
 * (src/replay/refly.js): the plant's whole region at a copy and every call
 * the shell made into the module from there, the sticks among them at the
 * plant's own rate. Flown again on the build that recorded it, every row
 * must come back bit for bit: the state block hashed against the hash the
 * row recorded, and the region at every copy the flight passes held to
 * the journal's copy, byte for byte. The table compares the re-fly's
 * position, attitude, velocity and body rates with the recording's.
 *
 * Only the recorded build. The region carries the module's constant
 * tables, so a region written into another build flies the old plant; the
 * tool refuses a module whose git blob id is not the clip's, and says how
 * to get the right one back from git. A clip older than version 17 cannot
 * be flown again at all, and the tool says what it holds instead.
 *
 * Given another build (--wasm NEW, or --transplant on the same one), the
 * clip is then set up on both builds from its setup log, placed in its
 * state at its first row and flown on with the same calls: the clip's
 * build against the recording is the method's own jolt, the new build
 * against the clip's build is what the new build changes. The clip's
 * build comes from --old, or from git by its blob id.
 *
 * The self test records a scripted flight through a journaled module as
 * the shell does, saves it as a file, reads it back and flies it again:
 * every row must match. Saved without an app build it is version 17 as
 * before; saved with one it is version 18, and that file is the one flown.
 * Then two negative controls: the plant changed after the copy is written
 * (gravity, by the ABI) must show a divergence,
 * and a build with a changed airframe constant must be refused by its id,
 * where its region would otherwise have flown the old plant bit for bit.
 * Last a windy flight, the air set before every step: it flies back bit
 * for bit and leaves the setup log as small as a still air one. And a clip
 * with an AI opponent, as one was saved before the opponent left with the
 * race: version 19, read back as saved, and trimmed.
 *
 * A clip with a solo race's AI opponent (file version 19) carries its own
 * plant's journal the same way (src/replay/opponent.js): the opponent is
 * flown again on its own fresh module, every row it raced in hashed
 * against the hash the row recorded, and the sticks it kept held to the
 * sim_input calls its journal made (rounded to float32, as they are kept).
 * Its laps are printed as its own Race closed them, never the pilot's.
 *
 * Exit 0 when the re-fly matches the recording on every row it can fly,
 * 1 when it does not, the clip cannot be flown again or the build is not
 * the clip's.
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

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSim, Sim } from '../tests/lib/simmod.js';
import { createJournal, wasmBuild } from '../src/replay/journal.js';
import { createRecorder, HEAD, HEAD_N, PLANT_N, trimClip } from '../src/replay/recorder.js';
import { BODY, BODY_N, createSticksRing } from '../src/replay/sticks.js';
import { decodeReplay, encodeReplay } from '../src/replay/file.js';
import {
  describeRefly, packRefly, reflyAcross, reflyOf, reflyRun, transplantable, unpackRefly,
} from '../src/replay/refly.js';
import { GROUND_MU, GROUND_E } from '../src/game/collide.js';
import { OPP, ROW_N as OPP_ROW_N, STICK_W, checkOpponent } from '../src/replay/opponent.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DEG = 180 / Math.PI;

/* State block slots (sim_abi.h). */
const ST_POS = 1;
const ST_VEL = 4;
const ST_QUAT = 7;
const ST_RATE = 11;

/* Where a difference is called a divergence in the summary: a centimetre,
 * a degree, a tenth of a metre a second, ten degrees a second. Reporting
 * thresholds only, for the lead to read where the two flights part; the
 * verdict is the bit for bit hash. */
const DIVERGE = {
  pos: 0.01, att: 1, vel: 0.1, rate: 10,
};

function fail(msg) {
  process.stderr.write(`replay-refly: ${msg}\n`);
  process.exit(1);
}

/* The angle between two unit quaternions (w x y z), degrees: from the
 * chord between them rather than the dot product, whose rounding reads
 * two identical quaternions as a few nanoradians apart. */
function quatAngle(a0, a1, a2, a3, b0, b1, b2, b3) {
  const minus = Math.hypot(a0 - b0, a1 - b1, a2 - b2, a3 - b3);
  const plus = Math.hypot(a0 + b0, a1 + b1, a2 + b2, a3 + b3);
  return 4 * Math.asin(Math.min(1, Math.min(minus, plus) / 2)) * DEG;
}

/*
 * Each row the re-fly reached, against the recording: the recording's
 * position and attitude are the plant column (f64), its velocity and rates
 * the sticks' body column (f32, so the re-fly's are rounded the same way
 * before they are compared).
 */
export function compare(clip, run) {
  const rows = [];
  for (let k = 0; k < clip.n; k += 1) {
    const st = run.states[k];
    if (!st) {
      continue;
    }
    const L = k * PLANT_N;
    const P = clip.plant;
    const rec = {
      pos: [P[L], P[L + 1], P[L + 2]],
      quat: [P[L + 3], P[L + 4], P[L + 5], P[L + 6]],
      vel: null,
      rate: null,
    };
    if (clip.sticks) {
      const B = clip.sticks.body;
      const b = k * BODY_N;
      rec.vel = [B[b + BODY.vel], B[b + BODY.vel + 1], B[b + BODY.vel + 2]];
      rec.rate = [B[b + BODY.rate], B[b + BODY.rate + 1], B[b + BODY.rate + 2]];
    }
    const fly = {
      pos: [st[ST_POS], st[ST_POS + 1], st[ST_POS + 2]],
      quat: [st[ST_QUAT], st[ST_QUAT + 1], st[ST_QUAT + 2], st[ST_QUAT + 3]],
      vel: [st[ST_VEL], st[ST_VEL + 1], st[ST_VEL + 2]],
      rate: [st[ST_RATE], st[ST_RATE + 1], st[ST_RATE + 2]],
    };
    const dpos = Math.hypot(fly.pos[0] - rec.pos[0], fly.pos[1] - rec.pos[1], fly.pos[2] - rec.pos[2]);
    const datt = quatAngle(...fly.quat, ...rec.quat);
    const f32 = (v) => v.map((x) => Math.fround(x));
    const dvel = rec.vel ? Math.hypot(...f32(fly.vel).map((x, i) => x - rec.vel[i])) : null;
    const drate = rec.rate ? Math.hypot(...f32(fly.rate).map((x, i) => x - rec.rate[i])) * DEG : null;
    rows.push({
      k, t: clip.time[k], same: run.hashes[k], rec, fly, dpos, datt, dvel, drate,
    });
  }
  const first = (pred) => {
    const r = rows.find(pred);
    return r ? { k: r.k, t: r.t } : null;
  };
  const max = (key) => rows.reduce((m, r) => (r[key] !== null && r[key] > m ? r[key] : m), 0);
  return {
    rows,
    summary: {
      rows: clip.n,
      flown: rows.length,
      identical: rows.filter((r) => r.same).length,
      firstDifferent: first((r) => !r.same),
      firstPos: first((r) => r.dpos > DIVERGE.pos),
      firstAtt: first((r) => r.datt > DIVERGE.att),
      firstVel: first((r) => r.dvel !== null && r.dvel > DIVERGE.vel),
      firstRate: first((r) => r.drate !== null && r.drate > DIVERGE.rate),
      maxPos: max('dpos'),
      maxAtt: max('datt'),
      maxVel: max('dvel'),
      maxRate: max('drate'),
      copies: run.copies,
      seeds: run.seeds,
    },
  };
}

const fx = (v, d = 3) => (v === null ? '-' : v.toFixed(d)).padStart(9);

function printTable(cmp, every) {
  console.log('      t_s  same    rec z  refly z    dpos_m  datt_deg  dvel_m/s  drate_dps     p_dps     q_dps     r_dps');
  let next = -Infinity;
  const last = cmp.rows[cmp.rows.length - 1];
  const firstOff = cmp.summary.firstDifferent ? cmp.summary.firstDifferent.k : -1;
  for (const r of cmp.rows) {
    /* Every `every` seconds, the last row, and the row where the two first
     * part, so a divergence is never hidden between two printed lines. */
    if (r.t < next && r !== last && r.k !== firstOff) {
      continue;
    }
    next = r.t + every;
    console.log(`${fx(r.t)}  ${r.same ? ' yes' : '  NO'}${fx(r.rec.pos[2])}${fx(r.fly.pos[2])}${fx(r.dpos, 4)}${fx(r.datt, 3)}`
      + `${fx(r.dvel, 3)}${fx(r.drate, 2)}${fx(r.fly.rate[0] * DEG, 1)}${fx(r.fly.rate[1] * DEG, 1)}${fx(r.fly.rate[2] * DEG, 1)}`);
  }
}

function printSummary(s) {
  const at = (x) => (x ? `row ${x.k}, t ${x.t.toFixed(3)} s` : 'never');
  console.log(`rows: ${s.rows}, flown again: ${s.flown}, bit for bit: ${s.identical}/${s.flown}`);
  console.log(`journal copies passed: ${s.copies.checked}, region identical at ${s.copies.same}`
    + ` (all but the allocator's ${s.copies.allocator} bytes)`
    + `${s.copies.first !== null ? `, first differs at copy ${s.copies.first}` : ''}; copies written: ${s.seeds}`);
  console.log(`first row whose state differs: ${at(s.firstDifferent)}`);
  console.log(`first past ${DIVERGE.pos} m: ${at(s.firstPos)}; ${DIVERGE.att} deg: ${at(s.firstAtt)}; `
    + `${DIVERGE.vel} m/s: ${at(s.firstVel)}; ${DIVERGE.rate} deg/s: ${at(s.firstRate)}`);
  console.log(`worst: position ${s.maxPos.toFixed(4)} m, attitude ${s.maxAtt.toFixed(3)} deg, `
    + `velocity ${s.maxVel.toFixed(3)} m/s, rates ${s.maxRate.toFixed(2)} deg/s`);
}

/* Which commit a build was first committed in, if this checkout has it. */
function buildCommit(id) {
  try {
    execFileSync('git', ['cat-file', '-e', id], { cwd: root, stdio: 'ignore' });
  } catch {
    return null;
  }
  try {
    const out = execFileSync('git', ['log', '--all', '--format=%h %ad %s', '--date=short', `--find-object=${id}`, '--', 'dist/sim.wasm'],
      { cwd: root, encoding: 'utf8' }).trim().split('\n');
    return out[out.length - 1] || 'in this repository';
  } catch {
    return 'in this repository';
  }
}

/* A clip's re-fly on `wasmBytes`, refused unless it is the clip's build. */
export async function refly(clip, wasmBytes, opts = {}) {
  if (!clip.refly) {
    throw new Error('this clip carries nothing to fly it again with');
  }
  const r = await unpackRefly(clip.refly);
  const build = await wasmBuild(wasmBytes);
  if (r.build !== null && r.build !== build && !opts.anyBuild) {
    const err = new Error(`the clip was flown on sim.wasm ${r.build}, this module is ${build}`);
    err.build = r.build;
    throw err;
  }
  const sim = await loadSim(wasmBytes);
  const run = reflyRun(sim.e, clip, r, opts);
  return {
    build, run, cmp: compare(clip, run), unpacked: r,
  };
}

/*
 * Two transplants of a clip (src/replay/refly.js reflyAcross), from the
 * same full state at its first row that can be flown back to (`exact`,
 * the clip flown again on its own build): one on the clip's build, one on
 * `newBytes`. The first against `exact` is the transplant's jolt; the
 * second against the first is what the new build changes.
 */
export async function transplantPair(clip, unpacked, exact, oldBytes, newBytes) {
  const tp = transplantable(unpacked, clip.n);
  if (tp.why) {
    throw new Error(`this clip cannot be flown on another build: ${tp.why}`);
  }
  const start = { k: tp.k, st: exact.states[tp.k] };
  const oldRun = reflyAcross((await loadSim(oldBytes)).e, clip, unpacked, start);
  const newRun = reflyAcross((await loadSim(newBytes)).e, clip, unpacked, start);
  return {
    start: tp.k,
    old: oldRun,
    new: newRun,
    jolt: pairCompare(clip, exact.states, oldRun.states),
    effect: pairCompare(clip, oldRun.states, newRun.states),
  };
}

/* Two flights' state blocks row by row: how far apart, and where they
 * first part. Full doubles, nothing rounded. */
export function pairCompare(clip, A, B) {
  const rows = [];
  for (let k = 0; k < clip.n; k += 1) {
    const a = A[k];
    const b = B[k];
    if (!a || !b) {
      continue;
    }
    const d = (o, n) => Math.hypot(...Array.from({ length: n }, (_, i) => a[o + i] - b[o + i]));
    let same = true;
    for (const i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      same = same && Object.is(a[i], b[i]);
    }
    rows.push({
      k,
      t: clip.time[k],
      same,
      a,
      b,
      dpos: d(ST_POS, 3),
      datt: quatAngle(a[ST_QUAT], a[ST_QUAT + 1], a[ST_QUAT + 2], a[ST_QUAT + 3], b[ST_QUAT], b[ST_QUAT + 1], b[ST_QUAT + 2], b[ST_QUAT + 3]),
      dvel: d(ST_VEL, 3),
      drate: d(ST_RATE, 3) * DEG,
    });
  }
  const first = (pred) => {
    const r = rows.find(pred);
    return r ? { k: r.k, t: r.t } : null;
  };
  const max = (key) => rows.reduce((m, r) => Math.max(m, r[key]), 0);
  return {
    rows,
    summary: {
      flown: rows.length,
      identical: rows.filter((r) => r.same).length,
      firstDifferent: first((r) => !r.same),
      firstPos: first((r) => r.dpos > DIVERGE.pos),
      firstAtt: first((r) => r.datt > DIVERGE.att),
      firstVel: first((r) => r.dvel > DIVERGE.vel),
      firstRate: first((r) => r.drate > DIVERGE.rate),
      maxPos: max('dpos'),
      maxAtt: max('datt'),
      maxVel: max('dvel'),
      maxRate: max('drate'),
    },
  };
}

function printPairSummary(label, s) {
  const at = (x) => (x ? `t ${x.t.toFixed(3)} s` : 'never');
  console.log(`${label}: ${s.flown} rows, identical ${s.identical}; first differs ${at(s.firstDifferent)}; past ${DIVERGE.pos} m ${at(s.firstPos)}, `
    + `${DIVERGE.att} deg ${at(s.firstAtt)}, ${DIVERGE.vel} m/s ${at(s.firstVel)}, ${DIVERGE.rate} deg/s ${at(s.firstRate)}`);
  console.log(`${' '.repeat(label.length)}  worst: ${s.maxPos.toFixed(4)} m, ${s.maxAtt.toFixed(3)} deg, ${s.maxVel.toFixed(3)} m/s, ${s.maxRate.toFixed(2)} deg/s`);
}

function printPairTable(pair, exact, every) {
  console.log('      t_s    rec z   old tp z   new tp z  jolt dpos  jolt datt   fix dpos   fix datt  fix drate   new p_dps  new q_dps  new r_dps');
  const jolt = new Map(pair.jolt.rows.map((r) => [r.k, r]));
  const firstOff = pair.effect.summary.firstDifferent ? pair.effect.summary.firstDifferent.k : -1;
  const rows = pair.effect.rows;
  let next = -Infinity;
  for (const r of rows) {
    if (r.t < next && r !== rows[rows.length - 1] && r.k !== firstOff) {
      continue;
    }
    next = r.t + every;
    const j = jolt.get(r.k);
    const ex = exact.states[r.k];
    const f = (v, dd) => (v === undefined || v === null ? '-' : v.toFixed(dd)).padStart(11);
    console.log(`${r.t.toFixed(3).padStart(9)}${f(ex ? ex[ST_POS + 2] : null, 3)}${f(r.a[ST_POS + 2], 3)}${f(r.b[ST_POS + 2], 3)}`
      + `${f(j ? j.dpos : null, 4)}${f(j ? j.datt : null, 3)}${f(r.dpos, 4)}${f(r.datt, 3)}${f(r.drate, 2)}`
      + `${f(r.b[ST_RATE] * DEG, 1)}${f(r.b[ST_RATE + 1] * DEG, 1)}${f(r.b[ST_RATE + 2] * DEG, 1)}`);
  }
}

/* The clip's own build: the module given if it is that build, else
 * --old, else git. Null with a reason when none can be had. */
/*
 * A clip's AI opponent flown again on `wasmBytes` (its build, refused
 * otherwise), as reflyRun flies the pilot: every row it raced in hashed
 * against its own recorded hash. Beside that, at each such row the last
 * sim_input the journal made is held to the stick row the opponent kept
 * there (f32, as kept). Returns { build, rows, flown, identical, copies,
 * seeds, sticks: { checked, same, first } }.
 */
export async function reflyOpponent(clip, wasmBytes) {
  const op = clip.opponent;
  if (!op || !op.refly) {
    throw new Error('this clip carries no AI opponent to fly again');
  }
  const r = await unpackRefly(op.refly);
  const build = await wasmBuild(wasmBytes);
  if (r.build !== null && r.build !== build) {
    const err = new Error(`the opponent was flown on sim.wasm ${r.build}, this module is ${build}`);
    err.build = r.build;
    throw err;
  }
  const { e } = await loadSim(wasmBytes);
  /* The module's own exports, sim_input watched: its last call before a
   * row's mark is the stick in force there. */
  let last = null;
  const watched = Object.create(e, {
    sim_input: {
      value: (...args) => {
        last = args;
        return e.sim_input(...args);
      },
    },
  });
  const sticks = { checked: 0, same: 0, first: null };
  const rowHash = (k) => op.rows[k * OPP_ROW_N + OPP.hash] >>> 0;
  const run = reflyRun(watched, { n: clip.n }, r, {
    seeded: () => {
      last = null;
    },
    /* Asked right after row k is reached, so `last` is its stick. */
    hashAt: (k) => {
      const at = op.rows[k * OPP_ROW_N + OPP.stick];
      if (at > 0 && last) {
        const kept = op.sticks.subarray((at - 1) * STICK_W, at * STICK_W);
        const same = [1, 2, 3, 4].every((i, j) => Math.fround(last[i]) === kept[j]);
        sticks.checked += 1;
        sticks.same += same ? 1 : 0;
        if (!same && sticks.first === null) {
          sticks.first = k;
        }
      }
      return rowHash(k);
    },
  });
  let raced = 0;
  for (let k = 0; k < clip.n; k += 1) {
    raced += op.rows[k * OPP_ROW_N + OPP.run] >= 0 ? 1 : 0;
  }
  const flown = run.hashes.filter((h) => h !== null).length;
  return {
    build,
    rows: raced,
    flown,
    identical: run.hashes.filter((h) => h === true).length,
    copies: run.copies,
    seeds: run.seeds,
    sticks,
  };
}

/* The opponent's part of a re-fly, printed; true when it matches. */
async function printOpponent(clip, wasmBytes) {
  const op = clip.opponent;
  const laps = op.runs.map((x, i) => `race ${i + 1}: ${x.laps.length ? x.laps.map((ms) => (ms / 1000).toFixed(2)).join(', ') : 'no lap'}`
    + `${x.crashed ? ', crashed' : ''}`).join('; ');
  console.log(`
THE AI OPPONENT: ${op.runs.length} race(s) in the clip (${laps}; its own Race's, never the pilot's record), `
    + `${op.sticks.length / STICK_W} stick rows kept`);
  if (!op.refly) {
    console.log('not flown: its plant was seated again before the clip was cut, so its journal is not in the clip');
    return true;
  }
  const d = describeRefly(op.refly, clip.n);
  console.log(`its refly: build ${d.build ?? 'not named'}, region ${d.region} B, ${d.segs} stretches, ${d.flyable} rows can be flown back to`);
  let o;
  try {
    o = await reflyOpponent(clip, wasmBytes);
  } catch (err) {
    console.log(`not flown: ${err.message}`);
    return false;
  }
  console.log(`rows it raced: ${o.rows}, flown again: ${o.flown}, bit for bit: ${o.identical}/${o.flown}; `
    + `journal copies passed: ${o.copies.checked}, region identical at ${o.copies.same}; `
    + `kept sticks equal to its sim_input: ${o.sticks.same}/${o.sticks.checked}`
    + `${o.sticks.first !== null ? ` (first differs at row ${o.sticks.first})` : ''}`);
  const ok = o.flown > 0 && o.identical === o.flown && o.copies.same === o.copies.checked && o.sticks.same === o.sticks.checked;
  console.log(ok ? 'MATCH: the opponent flies again bit for bit on its build' : 'DIFFERENT: the opponent\'s re-fly and its recording part');
  return ok;
}

function recordedBuild(id, given, oldPath) {
  if (given.id === id) {
    return { bytes: given.bytes, from: given.path };
  }
  if (oldPath) {
    return { bytes: new Uint8Array(readFileSync(oldPath)), from: oldPath, check: true };
  }
  const where = buildCommit(id);
  if (!where) {
    return { why: `the clip's build ${id} is not in this checkout: fetch, or pass it as --old` };
  }
  const bytes = execFileSync('git', ['cat-file', 'blob', id], { cwd: root, maxBuffer: 1 << 28 });
  return { bytes: new Uint8Array(bytes), from: `git ${id} (${where})` };
}

async function main(argv) {
  const args = {
    every: 1, wasm: join(root, 'dist', 'sim.wasm'), old: null, json: null, clip: null, transplant: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--wasm') {
      args.wasm = resolve(argv[++i]);
    } else if (a === '--old') {
      args.old = resolve(argv[++i]);
    } else if (a === '--json') {
      args.json = resolve(argv[++i]);
    } else if (a === '--every') {
      args.every = Number(argv[++i]);
    } else if (a === '--transplant') {
      args.transplant = true;
    } else if (!args.clip && !a.startsWith('--')) {
      args.clip = resolve(a);
    } else {
      fail(`unknown argument ${a}`);
    }
  }
  if (!args.clip) {
    fail('usage: replay-refly.js CLIP.fdfreplay [--wasm new.wasm] [--old clip-build.wasm] [--transplant] [--every s] [--json out.json] | --selftest');
  }
  if (!(args.every > 0)) {
    fail('--every takes seconds above zero');
  }
  const bytes = readFileSync(args.clip);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const version = new DataView(buf).getUint32(4, true);
  const clip = decodeReplay(buf);
  console.log(`${args.clip}: version ${version}, ${clip.n} rows, ${clip.time[clip.n - 1].toFixed(2)} s, `
    + `${clip.meta.airframe} on ${clip.meta.map}, "${clip.meta.name}"`);
  /* The app build (file version 18) beside the module's: many deploys
   * share one dist/sim.wasm and differ in everything around it. */
  const app = clip.build === undefined ? 'unknown (saved before version 18)' : (clip.build ?? 'a local checkout');
  console.log(`app build: ${app}`);
  if (!clip.refly) {
    fail(`this version ${version} clip keeps no journal, so it cannot be flown again: it holds the drawn pose${clip.sticks
      ? ', one stick sample, velocity and body rates a frame' : (version >= 1 ? ' and the throttle' : '')}, not the plant's `
      + 'state or the calls at the plant\'s rate. Only a clip saved with its journal, file version 17 or later, can be re-flown.');
  }
  const d = describeRefly(clip.refly, clip.n);
  const U = clip.refly.setup;
  console.log(`refly: build ${d.build ?? 'not named'}, abi ${d.abi}, region ${d.region} B, ${d.segs} stretches`
    + `${d.broken ? ` (${d.broken} cut short)` : ''}, ${d.flyable}/${d.rows} rows can be flown back to; `
    + `${U ? `setup log ${U.entries} calls, ${U.calls * 8} B, sim_init text ${U.init} B${U.overflow ? ', CUT SHORT' : ''}` : 'no setup log'}`);
  const given = { path: args.wasm, bytes: new Uint8Array(readFileSync(args.wasm)) };
  given.id = await wasmBuild(given.bytes);
  if (clip.refly.build === null) {
    console.log('WARNING: the clip does not name its build; it is flown on the module given, and a match shows the calls replay, not that this is the build');
  }
  const own = clip.refly.build === null ? { bytes: given.bytes, from: given.path } : recordedBuild(clip.refly.build, given, args.old);
  if (own.why) {
    fail(`${own.why}.\nA region only replays on the build that wrote it: written into another, it either does not fit\n`
      + 'or puts the old constant tables back and flies the old plant.');
  }
  let exact;
  try {
    exact = await refly(clip, own.bytes);
  } catch (err) {
    fail(err.message);
  }
  console.log(`\nTHE RECORDING, flown again on its build: ${own.from}`);
  printTable(exact.cmp, args.every);
  printSummary(exact.cmp.summary);
  const s = exact.cmp.summary;
  const ok = s.flown > 0 && s.identical === s.flown && s.copies.same === s.copies.checked;
  console.log(ok ? 'MATCH: the clip flies again bit for bit on its build' : 'DIFFERENT: the re-fly and the recording part (above)');
  /* The opponent's plant is the pilot's build in the page; its own id is
   * checked all the same. */
  const oppOk = clip.opponent ? await printOpponent(clip, own.bytes) : true;
  const across = given.id !== exact.build || args.transplant;
  let pair = null;
  if (across) {
    console.log(`\nTHE NEW BUILD: ${given.path} (${given.id})`);
    if (!ok) {
      console.log('not flown: the clip does not fly again on its own build, so a transplant from it would start from a wrong state');
    } else {
      try {
        pair = await transplantPair(clip, exact.unpacked, exact.run, own.bytes, given.bytes);
      } catch (err) {
        fail(err.message);
      }
      console.log(`both builds set up from the clip's setup log, placed in its state at t ${clip.time[pair.start].toFixed(3)} s `
        + '(row ' + pair.start + '), the same calls made: "old tp" on the clip\'s build, "new tp" on this one.');
      if (pair.new.missing.length) {
        console.log(`the new build lacks ${pair.new.missing.join(', ')}`);
      }
      printPairTable(pair, exact.run, args.every);
      printPairSummary('jolt (old tp against the recording: the transplant, not the plant)', pair.jolt.summary);
      printPairSummary('fix  (new tp against old tp: what the new build changes)', pair.effect.summary);
      const cut = Math.min(pair.old.until, pair.new.until);
      if (cut < clip.n) {
        console.log(`the calls stop at row ${cut} (t ${clip.time[cut].toFixed(3)} s): a stretch cut short`);
      }
      console.log(pair.effect.summary.identical === pair.effect.summary.flown
        ? 'SAME: the new build flies this clip exactly as the clip\'s build does'
        : 'CHANGED: the new build flies this clip differently (above)');
    }
  }
  if (args.json) {
    writeFileSync(args.json, JSON.stringify({
      clip: args.clip,
      version,
      meta: clip.meta,
      refly: d,
      module: exact.build,
      summary: exact.cmp.summary,
      rows: exact.cmp.rows.map((r) => ({
        k: r.k, t: r.t, same: r.same, rec: r.rec, fly: r.fly,
      })),
      ...(pair ? {
        newModule: given.id,
        start: pair.start,
        jolt: pair.jolt.summary,
        effect: pair.effect.summary,
        transplant: pair.effect.rows.map((r) => ({
          k: r.k, t: r.t, old: Array.from(r.a.subarray(0, 14)), new: Array.from(r.b.subarray(0, 14)),
        })),
      } : {}),
    }));
    console.log(`wrote ${args.json}`);
  }
  process.exit(ok && oppOk ? 0 : 1);
}

/* ---- the self test ---- */

let failures = 0;
function check(ok, what, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    failures += 1;
  }
}

function must(code, what) {
  if (code < 0) {
    throw new Error(`${what}: ${code}`);
  }
  return code;
}

const SKY = 3;
/* Long enough that the journal has let its oldest copies go (it keeps 33)
 * and the clip is the recorder's last 30 s, as a real one is. */
const FLIGHT_MS = 40000;

/* The sticks at millisecond ms: plain arithmetic, so a flight is a pure
 * function of the module. A slow roll and pitch wander, then a dive. */
function sticksAt(ms) {
  const k = (ms % 2000) / 2000;
  const tri = k < 0.5 ? 4 * k - 1 : 3 - 4 * k;
  if (ms > 36000) {
    return [0.1, 0.6, 0, 0.8];
  }
  return [0.3 * tri, -0.1 + 0.05 * tri, 0.1 * tri, 0.7];
}

/* The air at millisecond ms, as the shell's pushWeather sets it before
 * every step (src/main.js): a mean that changes every step, gusts and a
 * rise, plain arithmetic like the sticks. */
function windAt(ms) {
  const k = (ms % 3000) / 3000;
  const tri = k < 0.5 ? 2 * k : 2 - 2 * k;
  return [4 + 2 * tri, -1.5 + tri, 2, 0.5 * tri - 0.2];
}

/*
 * The scripted flight through a journaled module, recorded as the crash
 * cam does (src/replay/crashcam.js record): a row every 16 ms with the
 * journal's mark, the copy once a second after the row. Sticks on the RC
 * grid every 4 ms, the ground every step. A retune in flight (a block of
 * doubles through the heap) and a sim_set_flight_style call, so the copied
 * inputs and plain setters are both in the calls. Returns the clip as
 * open() cuts it, with its refly.
 */
async function recordFlight(wasmBytes, configText, windy = false) {
  const plain = await loadSim(wasmBytes);
  const j = createJournal(plain.e, { wasm: wasmBytes });
  const sim = new Sim(j.exports);
  const rec = createRecorder();
  const ring = createSticksRing(rec.capacity);
  const nState = sim.e.sim_state_size();
  const statePtr = sim.e.malloc(nState * 8);
  j.snapshot(0);
  must(sim.init(configText), 'sim_init');
  must(sim.e.sim_set_airframe(SKY), 'sim_set_airframe');
  must(sim.e.sim_reset(), 'sim_reset');
  must(sim.e.sim_set_cell_voltage(4.1), 'sim_set_cell_voltage');
  must(sim.e.sim_set_damage(1), 'sim_set_damage');
  must(sim.e.sim_set_pose(0, 0, 30, 1, 0, 0, 0), 'sim_set_pose');
  must(sim.e.sim_wing_launch(15), 'sim_wing_launch');
  /* The build is hashed off the main thread: let it land, as a page's has
   * long before anyone saves a clip. */
  await j.named;
  const pose = { x: 0, y: 0, z: 0 };
  const quat = {
    x: 0, y: 0, z: 0, w: 1,
  };
  const input = {
    roll: 0, pitch: 0, yaw: 0, throttle: 0,
  };
  const sp = rec.spawnIndex(0, 0, 0, 0, 0, 0, 1, 0);
  for (let ms = 0; ms < FLIGHT_MS; ms += 1) {
    if (ms % 4 === 0) {
      const s = sticksAt(ms);
      sim.input(ms / 1000, s[0], s[1], s[2], s[3]);
      [input.roll, input.pitch, input.yaw, input.throttle] = s;
    }
    sim.e.sim_set_ground(1, 0, 0, 1, 0, 0, 0, GROUND_MU, GROUND_E);
    if (windy) {
      const [vx, vy, gust, up] = windAt(ms);
      must(sim.e.sim_set_wind(vx, vy, gust), 'sim_set_wind');
      must(sim.e.sim_set_air_vertical(up), 'sim_set_air_vertical');
    }
    if (ms % 500 === 0) {
      /* The world declared again round the craft twice a second, as the
       * shell does: a clear, then what is near (three trees, far enough
       * off not to be hit). */
      sim.e.sim_tree_clear();
      for (let i = 0; i < 3; i += 1) {
        must(sim.e.sim_tree_add(400 + 10 * i + ms / 100, -300, 0, 0.3, 3, 9, 3), 'sim_tree_add');
      }
    }
    sim.e.sim_step(1);
    if (ms === 12345) {
      const p = sim.e.malloc(16 * 8);
      must(sim.e.sim_wing_tune(p), 'sim_wing_tune');
      const block = new Float64Array(sim.e.memory.buffer, p, 12);
      block[3] *= 1.1;
      must(sim.e.sim_wing_set_tune(p), 'sim_wing_set_tune');
      sim.e.free(p);
    }
    if (ms % 16 === 15) {
      sim.e.sim_state(statePtr);
      const st = new Float64Array(sim.e.memory.buffer, statePtr, nState).slice();
      const t = st[0];
      const i = rec.begin(t, (ms + 1));
      ring.begin(i);
      if (i >= 0) {
        rec.anim(i, ms + 1);
        rec.pose(i, pose, quat);
        rec.plant(i, st);
        rec.status(i, j.mark(), sp, 0, false, 0, input.throttle, 0);
        ring.write(input, 'as3x', -1, st);
      }
      if (j.due(t)) {
        j.snapshot(t);
      }
    }
  }
  const [first, n] = rec.span();
  const clip = rec.clip({
    name: 'Refly', created: 1790000000000, airframe: 'sky1800', livery: null, map: 'swiss2', scale: 1, size: 1.8, duration: 0,
    parts: [{
      kind: 8, kindName: 'fuselage', parent: -1, material: 2, cg: [0, 0, 0], boxMin: [-1, -1, -1], boxMax: [1, 1, 1],
    }],
    fpv: {
      fwd: 0.1, up: 0.02, tilt: 0.3, fov: 120,
    },
  });
  clip.sticks = ring.clip(first, n);
  let from = 0;
  for (let k = 0; k < clip.n && from === 0; k += 1) {
    from = clip.head[k * HEAD_N + HEAD.markSeg];
  }
  clip.refly = reflyOf(j.exportSpan(from), clip);
  clip.meta.duration = clip.time[clip.n - 1];
  return { clip, stats: j.stats() };
}

/* A copy of a module with every f64 1.225 (the airframes' sea level air
 * density, plant.c `.rho`, which lives in the data segment) made 1.3:
 * another build with one plant constant changed. */
function otherBuild(wasmBytes) {
  const b = Buffer.from(wasmBytes);
  const from = Buffer.alloc(8);
  from.writeDoubleLE(1.225);
  const to = Buffer.alloc(8);
  to.writeDoubleLE(1.3);
  let hits = 0;
  for (let i = b.indexOf(from); i >= 0; i = b.indexOf(from, i + 8)) {
    to.copy(b, i);
    hits += 1;
  }
  return { bytes: new Uint8Array(b), hits };
}

async function selftest() {
  const wasmBytes = new Uint8Array(readFileSync(join(root, 'dist', 'sim.wasm')));
  const configText = readFileSync(join(root, 'tests', 'fixtures', 'config-baseline.diff'), 'utf8');
  const build = await wasmBuild(wasmBytes);

  console.log('1. a scripted flight recorded as the crash cam records it, saved, read back');
  const { clip, stats } = await recordFlight(wasmBytes, configText);
  const live = describeRefly(clip.refly, clip.n);
  check(clip.n > 1500, 'the clip is the recorder\'s last 30 s', `${clip.n} rows, ${clip.time[clip.n - 1].toFixed(2)} s`);
  check(stats.segments === 33 && live.flyable === clip.n, 'every row can be flown back to, from the journal\'s kept copies',
    `${live.flyable}/${clip.n} rows, ${live.segs} of ${stats.segments} stretches exported`);
  check(live.build === build, 'the clip names its build', `${live.build}`);
  check(new DataView(encodeReplay(clip)).getUint32(4, true) === 16,
    'written before it is packed (a live clip measured), it is left out and the clip is version 16 as before');
  clip.refly = await packRefly(clip.refly);
  const file = encodeReplay(clip);
  const version = new DataView(file).getUint32(4, true);
  const back = decodeReplay(file);
  check(version === 17 && Boolean(back.refly), 'saved as version 17 with its refly',
    `${(file.byteLength / 1e6).toFixed(2)} MB, refly ${(clip.refly.packed.byteLength / 1e6).toFixed(2)} MB packed`);
  const refusal = (buf) => {
    try {
      decodeReplay(buf);
      return 'read';
    } catch (err) {
      return err.message;
    }
  };
  const short = refusal(file.slice(0, file.byteLength - 1));
  check(short === 'the file is not the length its header says', 'a file cut short of its refly is refused', short);
  const bad = file.slice(0);
  new Int32Array(bad, file.byteLength - clip.refly.packed.byteLength - clip.n * 8, 1)[0] = 99;
  const badMark = refusal(bad);
  check(badMark === 'frame 0\'s refly mark is not in its stretches', 'a mark outside the stretches is refused', badMark);
  const without = { ...clip };
  delete without.refly;
  check(new DataView(encodeReplay(without)).getUint32(4, true) === 16, 'without it the same clip is still version 16');
  /* The version 17 file above is the old clip: no app build. Stamped as
   * the crash cam stamps a live clip, the same clip is version 18. */
  const stamped = encodeReplay({ ...clip, build: '0e9b7431f2ab' });
  const back18 = decodeReplay(stamped);
  check(new DataView(stamped).getUint32(4, true) === 18 && back18.build === '0e9b7431f2ab' && back18.refly.build === build
    && Buffer.from(back18.refly.packed).equals(Buffer.from(back.refly.packed)),
  'with its app build the clip is version 18, the build beside the module\'s id and the same refly', `app ${back18.build}, module ${back18.refly.build}`);
  check(!('build' in back), 'the version 17 file reads back without an app build: unknown');
  const said17 = stamped.slice(0);
  const hl = new DataView(said17).getUint32(8, true);
  const head = new TextDecoder().decode(new Uint8Array(said17, 12, hl));
  new DataView(said17).setUint32(4, 17, true);
  new Uint8Array(said17).set(new TextEncoder().encode(head.replace('"v":18', '"v":17')), 12);
  const old17 = refusal(said17);
  check(old17 === 'build in a file older than version 18', 'an app build in a file that says version 17 is refused', old17);

  console.log('2. flown again on its build, from the version 18 file: every row bit for bit');
  const same = await refly(back18, wasmBytes);
  const s = same.cmp.summary;
  printSummary(s);
  check(s.flown === clip.n && s.identical === s.flown, 'every row\'s state hashes as recorded', `${s.identical}/${s.flown}`);
  check(s.copies.checked >= 28 && s.copies.same === s.copies.checked, 'the region matches every journal copy the flight passes',
    `${s.copies.same}/${s.copies.checked}`);
  check(s.seeds === 1, 'flown on from one copy, not re-seeded at each', `${s.seeds} written`);
  check(s.maxPos === 0 && s.maxAtt === 0 && s.maxVel === 0 && s.maxRate === 0, 'position, attitude, velocity and rates exact',
    `${s.maxPos}, ${s.maxAtt}, ${s.maxVel}, ${s.maxRate}`);
  const moved = Math.hypot(clip.plant[0] - clip.plant[(clip.n - 1) * PLANT_N],
    clip.plant[1] - clip.plant[(clip.n - 1) * PLANT_N + 1], clip.plant[2] - clip.plant[(clip.n - 1) * PLANT_N + 2]);
  check(moved > 50, 'the flight went somewhere', `${moved.toFixed(1)} m over the clip`);

  const cut = trimClip(back, 10, 20);
  const trimmed = await refly(decodeReplay(encodeReplay(cut)), wasmBytes);
  check(trimmed.cmp.summary.identical === cut.n && cut.n > 500, 'a clip trimmed to 10..20 s flies again too',
    `${trimmed.cmp.summary.identical}/${cut.n} rows`);

  console.log('3. negative control: the plant changed after the copy is written');
  const heavy = await refly(back, wasmBytes, {
    seeded: (e) => must(e.sim_set_gravity(1.002), 'sim_set_gravity'),
  });
  const h = heavy.cmp.summary;
  printSummary(h);
  check(h.identical < h.flown && h.firstDifferent !== null && h.firstDifferent.k === 0, 'the re-fly differs from the first row',
    `${h.identical}/${h.flown} rows the same`);
  check(h.copies.same < h.copies.checked, 'and the region differs at the copies', `${h.copies.same}/${h.copies.checked}`);
  check(h.maxPos > 0.05 && h.firstPos !== null, 'the trajectory parts and the table says where',
    `worst ${h.maxPos.toFixed(3)} m, past ${DIVERGE.pos} m at t ${h.firstPos ? h.firstPos.t.toFixed(3) : '-'} s`);

  console.log('4. negative control: another build, one airframe constant changed');
  const other = otherBuild(wasmBytes);
  check(other.hits > 0 && WebAssembly.validate(other.bytes), 'the changed build is a valid module', `${other.hits} constants changed`);
  const otherId = await wasmBuild(other.bytes);
  let refused = null;
  try {
    await refly(back, other.bytes);
  } catch (err) {
    refused = err;
  }
  check(Boolean(refused && refused.build === build), 'refused by its build id', refused ? refused.message : 'not refused');
  /* Why the id and not the layout: flown from the other build's own start,
   * the changed constant changes the flight, yet the clip's region written
   * into it brings the old constant back and the old flight with it. */
  const fresh = await recordFlight(other.bytes, configText);
  const endA = clip.plant.subarray((clip.n - 1) * PLANT_N, clip.n * PLANT_N);
  const endB = fresh.clip.plant.subarray((fresh.clip.n - 1) * PLANT_N, fresh.clip.n * PLANT_N);
  const apart = Math.hypot(endA[0] - endB[0], endA[1] - endB[1], endA[2] - endB[2]);
  check(otherId !== build && apart > 1, 'the changed build flies a different flight from the start', `${apart.toFixed(2)} m apart at the end`);
  const forced = await refly(back, other.bytes, { anyBuild: true });
  check(forced.cmp.summary.identical === forced.cmp.summary.flown,
    'the clip\'s region written into it flies the OLD plant bit for bit, which is why the build id decides',
    `${forced.cmp.summary.identical}/${forced.cmp.summary.flown} rows`);

  console.log('5. another build: both set up from the setup log and placed in the clip\'s state');
  const U = back.refly.setup;
  check(Boolean(U) && !U.overflow && U.entries > 0, 'the clip carries its setup log',
    U ? `${U.entries} calls, ${U.calls * 8} B, sim_init text ${U.init} B` : 'none');
  /* 80 declarations of the world were made; the clip spans 31 stretches
   * of about 2 each, and only the one in force at its start is kept from
   * before it. */
  const trees = (() => {
    const u = same.unpacked.setup;
    let n = 0;
    for (let r = 0; r < u.calls.length; r += 3 + u.calls[r + 1] + u.calls[r + 2]) {
      n += same.unpacked.names[u.calls[r]] === 'sim_tree_clear' ? 1 : 0;
    }
    return n;
  })();
  check(trees >= 60 && trees <= 66, 'the world\'s declarations made moot before the clip are dropped from it', `${trees} of 80 clears kept`);
  const self = await transplantPair(back, same.unpacked, same.run, wasmBytes, wasmBytes);
  const j = self.jolt.summary;
  const f = self.effect.summary;
  printPairSummary('jolt', j);
  printPairSummary('self', f);
  const startRow = self.jolt.rows.find((r) => r.k === self.start);
  check(Boolean(startRow) && startRow.dpos === 0 && startRow.datt === 0 && startRow.dvel === 0 && startRow.drate === 0,
    'the transplant starts exactly in the recording\'s state', `row ${self.start}`);
  check(f.flown === clip.n - self.start && f.identical === f.flown, 'transplanted twice onto the same build, the two flights are identical',
    `${f.identical}/${f.flown} rows`);
  check(j.flown === f.flown && j.firstDifferent !== null, 'against the recording, the transplant\'s own jolt is measured, not hidden',
    `parts from the recording at t ${j.firstDifferent ? j.firstDifferent.t.toFixed(3) : '-'} s, worst ${j.maxPos.toFixed(3)} m, ${j.maxAtt.toFixed(2)} deg`);
  const fix = await transplantPair(back, same.unpacked, same.run, wasmBytes, other.bytes);
  const x = fix.effect.summary;
  printPairSummary('fix', x);
  check(fix.new.missing.length === 0 && x.flown === f.flown && x.firstDifferent !== null && x.maxPos > 0.05,
    'the build with its air density changed flies the clip differently, and the table says where',
    `parts at t ${x.firstDifferent ? x.firstDifferent.t.toFixed(3) : '-'} s, worst ${x.maxPos.toFixed(3)} m, ${x.maxAtt.toFixed(2)} deg`);
  let noSetup = null;
  try {
    await transplantPair(back, { ...same.unpacked, setup: null }, same.run, wasmBytes, other.bytes);
  } catch (err) {
    noSetup = err.message;
  }
  check(/saved before clips kept their setup log/.test(noSetup || ''), 'a clip without a setup log is refused with its reason', noSetup || 'not refused');

  console.log('6. a file from before cannot be flown again, and says so');
  let old = null;
  try {
    await refly(decodeReplay(encodeReplay(without)), wasmBytes);
  } catch (err) {
    old = err.message;
  }
  check(old === 'this clip carries nothing to fly it again with', 'a version 16 clip is refused with a reason', old || 'not refused');

  console.log('7. a windy flight, the air set before every step as the shell sets it');
  const gusty = await recordFlight(wasmBytes, configText, true);
  const gustyBack = decodeReplay(encodeReplay({ ...gusty.clip, refly: await packRefly(gusty.clip.refly) }));
  const windy = await refly(gustyBack, wasmBytes);
  const ws = windy.cmp.summary;
  printSummary(ws);
  check(ws.flown === gusty.clip.n && ws.identical === ws.flown, 'flown again on its build, every row bit for bit',
    `${ws.identical}/${ws.flown}`);
  const endW = gusty.clip.plant.subarray((gusty.clip.n - 1) * PLANT_N, gusty.clip.n * PLANT_N);
  const blown = Math.hypot(endA[0] - endW[0], endA[1] - endW[1], endA[2] - endW[2]);
  check(blown > 1, 'the wind moved the flight', `${blown.toFixed(2)} m from the still air flight at the end`);
  /* The air is set every step, so it is the flight, not its setup: in the
   * setup log it would grow the log by every step and cut it short past
   * about 100 s of wind, after which no clip of the session could be
   * flown on another build. */
  const airCalls = (() => {
    const u = windy.unpacked.setup;
    let n = 0;
    for (let r = 0; r < u.calls.length; r += 3 + u.calls[r + 1] + u.calls[r + 2]) {
      n += ['sim_set_wind', 'sim_set_air_vertical'].includes(windy.unpacked.names[u.calls[r]]) ? 1 : 0;
    }
    return n;
  })();
  const WU = gustyBack.refly.setup;
  check(airCalls === 0 && !WU.overflow, 'the setup log holds none of the per step air',
    `${airCalls} air calls, ${WU.entries} entries, ${WU.calls * 8} B`);
  const windSelf = await transplantPair(gustyBack, windy.unpacked, windy.run, wasmBytes, wasmBytes);
  const wf = windSelf.effect.summary;
  printPairSummary('self', wf);
  check(wf.flown > 0 && wf.identical === wf.flown, 'transplanted twice onto the same build, the two windy flights are identical',
    `${wf.identical}/${wf.flown} rows`);

  console.log('8. a clip with an AI opponent from before the cut, saved as version 19, read back');
  /* The AI opponent left with the race (the combat-only cut), so nothing
   * races one beside a clip any more; a clip saved with one still opens.
   * One race of every row, its pose on a line, a stick row a frame, no
   * journal of its own (refly null), as file.js and opponent.js read it. */
  const n19 = back18.n;
  const rows = new Int32Array(n19 * OPP_ROW_N);
  const pose = new Float32Array(n19 * 7);
  for (let k = 0; k < n19; k += 1) {
    rows.set([0, Math.round(back18.time[k] * 1000), k + 1, k * 7919], k * OPP_ROW_N);
    pose.set([k * 0.5, 10, -k * 0.25, 0, 0, 0, 1], k * 7);
  }
  const opp = {
    rows, pose, sticks: new Float32Array(n19 * STICK_W).fill(0.25), runs: [{ laps: [41234.5], crashed: false }], refly: null,
  };
  checkOpponent(opp, n19);
  const file19 = encodeReplay({ ...back18, opponent: opp });
  const back19 = decodeReplay(file19);
  check(new DataView(file19).getUint32(4, true) === 19 && Boolean(back19.opponent),
    'saved as version 19 with its opponent');
  check(Buffer.from(back19.opponent.rows.buffer, back19.opponent.rows.byteOffset, back19.opponent.rows.byteLength).equals(Buffer.from(rows.buffer))
    && Buffer.from(back19.opponent.pose.buffer, back19.opponent.pose.byteOffset, back19.opponent.pose.byteLength).equals(Buffer.from(pose.buffer))
    && back19.opponent.sticks.length === opp.sticks.length && JSON.stringify(back19.opponent.runs) === JSON.stringify(opp.runs),
  'read back, its rows, pose, sticks and runs are the ones saved');
  check(Buffer.from(encodeReplay({ ...back19, opponent: undefined })).equals(Buffer.from(stamped)),
    'the same clip without its opponent is the version 18 file, byte for byte');
  const cut19 = trimClip(back19, 10, 20);
  check(Boolean(cut19.opponent) && cut19.opponent.rows.length === cut19.n * OPP_ROW_N && decodeReplay(encodeReplay(cut19)).opponent.runs.length === 1,
    'trimmed to 10..20 s it keeps its opponent, saved and read back', `${cut19.n} rows`);

  console.log(failures ? `replay:refly selftest: ${failures} FAILED` : 'replay:refly selftest: all ok');
  process.exit(failures ? 1 : 0);
}

const argv = process.argv.slice(2);
if (argv[0] === '--selftest') {
  await selftest();
} else {
  await main(argv);
}
