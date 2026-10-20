/*
 * opponent.js: a solo race's AI opponent (src/game/aiopponent.js, which
 * left with the combat-only cut, 2026-10-19) in the crash cam's recording,
 * so a replay draws it as the race drew it and replay:refly flies it again.
 * Nothing races an opponent any more; this stays so a stored version 19
 * clip that holds one still reads and plays.
 *
 * PER ROW, while it races: the translucent ghost's pose as the frame drew
 * it (src/main.js aiRig, read off the drawing and never worked out again),
 * which race it is (a run: a new AiOpponent at every lap the race opens
 * from scratch), its own clock in ms, how many of its 4 ms stick rows it
 * had flown, the hash of its plant's state block (src/replay/recorder.js
 * stateHash) and where its journal stood (journal.js mark). A row it does
 * not race in is a run of -1.
 *
 * MEMORY. Nothing is allocated until an opponent first races; then the
 * columns for the recorder's rows and STICKS_CAP stick rows, about 0.45 MB
 * at the recorder's CAPACITY, made once.
 *
 * ITS STICKS. The 4 ms rows it kept (AiOpponent.sticks()), copied in as
 * they are flown, so a clip never needs the opponent to still exist when
 * the replay opens (R drops it). They are float32, rounded from what
 * sim_input took, and are kept to be shown and checked; the exact stream
 * is its journal's sim_input calls.
 *
 * ITS JOURNAL. The opponent's plant is its own dist/sim.wasm with its own
 * journal (seatOpponent in aiopponent.js, in git history), which copied
 * its region once a second of its own clock. A clip cut from the live recording keeps that
 * journal's stretches from the first row it names (src/replay/refly.js,
 * the very shape the pilot's refly has), so a saved clip flies the
 * opponent again bit for bit on the build that flew it. Rows of a run
 * whose plant was seated again since (another aircraft or pack) belong to
 * a journal that is gone: they keep their pose and sticks and cannot be
 * flown back to.
 *
 * Its laps are its own Race's, kept per run as the last
 * row of that run saw them, and never reach the pilot's record.
 *
 * A clip's `opponent`: { rows: i32[n x ROW_N], pose: f32[n x POSE_N],
 * sticks: f32[m x 4], runs: [{ laps, crashed }], refly (or null) },
 * absent when no opponent raced in it. src/replay/file.js saves it
 * (version 19); src/replay/crashcam.js draws it.
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

import { slerp, stateHash } from './recorder.js';
import { reflyOf, trimRefly } from './refly.js';

export const OPP = {
  run: 0, ms: 1, stick: 2, hash: 3,
};
export const ROW_N = 4;
/* Position x y z, then the quaternion x y z w, in the scene. */
export const OPP_POSE_N = 7;
export const STICK_W = 4;
/* The stick rows the ring holds: 65 s at 250 a second, over the 30 s a
 * clip can span. */
const STICKS_CAP = 1 << 14;
/* What a file may claim. */
export const RUNS_MAX = 64;
const LAPS_MAX = 64;

export function createOpponentRing(capacity) {
  let rows = null;
  let pose = null;
  let marks = null;
  let ok = null;
  let row = -1;
  let sticks = null;
  /* Stick rows copied so far, ever: a row's `stick` is this count. */
  let total = 0;
  /* Each run by id: its AiOpponent, its journal, its laps as last seen. */
  const runs = new Map();
  let runId = -1;
  let cur = null;
  let copied = 0;

  function begin(i) {
    row = i;
    if (i >= 0 && ok) {
      ok[i] = 0;
    }
  }

  /* This frame's opponent into the row begun: `opp` the AiOpponent racing
   * (or null) and `drawn` the Object3D it was drawn at. */
  function write(opp, drawn) {
    if (row < 0 || !opp) {
      return;
    }
    if (!ok) {
      rows = new Int32Array(capacity * ROW_N);
      pose = new Float32Array(capacity * OPP_POSE_N);
      marks = new Int32Array(capacity * 2);
      ok = new Uint8Array(capacity);
      sticks = new Float32Array(STICKS_CAP * STICK_W);
    }
    if (opp !== cur) {
      cur = opp;
      copied = 0;
      runId += 1;
      runs.delete(runId - RUNS_MAX);
    }
    const kept = opp.sticks();
    for (; copied * STICK_W < kept.length; copied += 1) {
      sticks.set(kept.subarray(copied * STICK_W, (copied + 1) * STICK_W), (total % STICKS_CAP) * STICK_W);
      total += 1;
    }
    runs.set(runId, { journal: opp.journal, laps: opp.laps(), crashed: Boolean(opp.crashed) });
    const r = row * ROW_N;
    rows[r + OPP.run] = runId;
    rows[r + OPP.ms] = opp.ms;
    rows[r + OPP.stick] = total;
    rows[r + OPP.hash] = stateHash(opp.state);
    const m = opp.journal.mark();
    marks[row * 2] = m[0];
    marks[row * 2 + 1] = m[1];
    const p = row * OPP_POSE_N;
    pose[p] = drawn.position.x;
    pose[p + 1] = drawn.position.y;
    pose[p + 2] = drawn.position.z;
    pose[p + 3] = drawn.quaternion.x;
    pose[p + 4] = drawn.quaternion.y;
    pose[p + 5] = drawn.quaternion.z;
    pose[p + 6] = drawn.quaternion.w;
    ok[row] = 1;
  }

  function clear() {
    row = -1;
    if (ok) {
      ok.fill(0);
    }
  }

  /*
   * The rows the recorder cut, `n` from ring index `first`, as a clip's
   * opponent, or null when it raced in none of them. Its refly is the
   * journal of the run its last row raced, from the first stretch a row
   * names; a row of another journal is -1 there.
   */
  function clip(first, n) {
    if (!ok || n < 1) {
      return null;
    }
    const at = (k) => (first + k) % capacity;
    const present = [];
    for (let k = 0; k < n; k += 1) {
      if (ok[at(k)]) {
        present.push(k);
      }
    }
    if (!present.length) {
      return null;
    }
    const ids = [...new Set(present.map((k) => rows[at(k) * ROW_N + OPP.run]))];
    const index = new Map(ids.map((id, j) => [id, j]));
    const firstStick = rows[at(present[0]) * ROW_N + OPP.stick];
    const lastStick = rows[at(present[present.length - 1]) * ROW_N + OPP.stick];
    /* The row in force at the first row too, while the ring still has it. */
    const g0 = Math.max(0, total - STICKS_CAP, firstStick - 1);
    const m = Math.max(0, lastStick - g0);
    const out = {
      rows: new Int32Array(n * ROW_N),
      pose: new Float32Array(n * OPP_POSE_N),
      sticks: new Float32Array(m * STICK_W),
      runs: ids.map((id) => {
        const R = runs.get(id);
        return { laps: R ? R.laps.slice() : [], crashed: R ? R.crashed : false };
      }),
      refly: null,
    };
    for (let j = 0; j < m; j += 1) {
      const s = ((g0 + j) % STICKS_CAP) * STICK_W;
      out.sticks.set(sticks.subarray(s, s + STICK_W), j * STICK_W);
    }
    const lastRun = runs.get(ids[ids.length - 1]);
    const journal = lastRun ? lastRun.journal : null;
    const own = new Int32Array(n * 2);
    for (let k = 0; k < n; k += 1) {
      const i = at(k);
      const r = k * ROW_N;
      if (!ok[i]) {
        out.rows[r + OPP.run] = -1;
        continue;
      }
      const id = rows[i * ROW_N + OPP.run];
      out.rows[r + OPP.run] = index.get(id);
      out.rows[r + OPP.ms] = rows[i * ROW_N + OPP.ms];
      out.rows[r + OPP.stick] = Math.max(0, rows[i * ROW_N + OPP.stick] - g0);
      out.rows[r + OPP.hash] = rows[i * ROW_N + OPP.hash];
      out.pose.set(pose.subarray(i * OPP_POSE_N, (i + 1) * OPP_POSE_N), k * OPP_POSE_N);
      const mine = runs.get(id) && journal && runs.get(id).journal === journal;
      own[k * 2] = mine ? marks[i * 2] : 0;
      own[k * 2 + 1] = mine ? marks[i * 2 + 1] : 0;
    }
    if (journal) {
      let from = 0;
      for (let k = 0; k < n && from === 0; k += 1) {
        from = own[k * 2];
      }
      out.refly = from > 0 ? reflyOf(journal.exportSpan(from), { n }, (k) => [own[k * 2], own[k * 2 + 1]]) : null;
    }
    return out;
  }

  return {
    begin, write, clear, clip,
  };
}

/* Rows [a, b] of a clip's opponent, as trimClip cuts the rest, or null
 * when it races in none of them. The sticks and the refly's stretches stay
 * whole, as the pilot's refly does: a later row is flown to from the
 * first stretch. */
export function trimOpponent(op, a, b) {
  const rows = op.rows.slice(a * ROW_N, (b + 1) * ROW_N);
  let any = false;
  for (let k = 0; k <= b - a && !any; k += 1) {
    any = rows[k * ROW_N + OPP.run] >= 0;
  }
  if (!any) {
    return null;
  }
  return {
    ...op,
    rows,
    pose: op.pose.slice(a * OPP_POSE_N, (b + 1) * OPP_POSE_N),
    refly: op.refly ? trimRefly(op.refly, a, b) : null,
  };
}

/* A clip's opponent checked against its length, as the file's reader needs
 * it (its refly is checked by refly.js). Throws. */
export function checkOpponent(op, n) {
  if (!(op.rows instanceof Int32Array) || op.rows.length !== n * ROW_N) {
    throw new Error('the opponent\'s rows are not the clip\'s length');
  }
  if (!(op.pose instanceof Float32Array) || op.pose.length !== n * OPP_POSE_N) {
    throw new Error('the opponent\'s pose is not the clip\'s length');
  }
  if (!(op.sticks instanceof Float32Array) || op.sticks.length % STICK_W !== 0) {
    throw new Error('the opponent\'s sticks are not rows of four');
  }
  if (!Array.isArray(op.runs) || op.runs.length < 1 || op.runs.length > RUNS_MAX) {
    throw new Error('the opponent\'s runs are not a list');
  }
  op.runs.forEach((r, i) => {
    const ok = r && typeof r === 'object' && Object.keys(r).every((k) => k === 'laps' || k === 'crashed')
      && typeof r.crashed === 'boolean' && Array.isArray(r.laps) && r.laps.length <= LAPS_MAX
      && r.laps.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0);
    if (!ok) {
      throw new Error(`the opponent's run ${i} is not a run`);
    }
  });
  const m = op.sticks.length / STICK_W;
  let any = false;
  let prev = { run: -1, stick: 0 };
  for (let k = 0; k < n; k += 1) {
    const r = k * ROW_N;
    const run = op.rows[r + OPP.run];
    if (run === -1) {
      continue;
    }
    const ms = op.rows[r + OPP.ms];
    const stick = op.rows[r + OPP.stick];
    if (run < 0 || run >= op.runs.length || ms < 0 || stick < 0 || stick > m
      || run < prev.run || (run === prev.run && stick < prev.stick)) {
      throw new Error(`frame ${k} has an opponent row that is not one`);
    }
    for (let i = 0; i < OPP_POSE_N; i += 1) {
      if (!Number.isFinite(op.pose[k * OPP_POSE_N + i])) {
        throw new Error(`frame ${k} has an opponent pose that is not a number`);
      }
    }
    prev = { run, stick };
    any = true;
  }
  if (!any) {
    throw new Error('the opponent races in none of the clip\'s frames');
  }
  for (let j = 0; j < m; j += 1) {
    const o = j * STICK_W;
    const s = op.sticks;
    const inRange = (x, lo) => Number.isFinite(x) && x >= lo && x <= 1;
    if (!inRange(s[o], -1) || !inRange(s[o + 1], -1) || !inRange(s[o + 2], -1) || !inRange(s[o + 3], 0)) {
      throw new Error(`the opponent's stick row ${j} is not sticks`);
    }
  }
}

/*
 * The opponent between rows k and k + 1, `a` of the way, into `out`
 * ({ pos: [x, y, z], quat: [x, y, z, w], sticks: [roll, pitch, yaw,
 * throttle] or null }): false when it does not race at row k. Two rows
 * of one run are blended; a run that ends or starts is never blended
 * into another.
 */
export function opponentAt(op, k, a, out) {
  const r0 = k * ROW_N;
  const run = op.rows[r0 + OPP.run];
  if (run < 0) {
    return false;
  }
  const n = op.rows.length / ROW_N;
  const k1 = k + 1 < n && op.rows[(k + 1) * ROW_N + OPP.run] === run ? k + 1 : k;
  const P = op.pose;
  const p0 = k * OPP_POSE_N;
  const p1 = k1 * OPP_POSE_N;
  for (let i = 0; i < 3; i += 1) {
    out.pos[i] = P[p0 + i] + (P[p1 + i] - P[p0 + i]) * a;
  }
  slerp(P[p0 + 3], P[p0 + 4], P[p0 + 5], P[p0 + 6], P[p1 + 3], P[p1 + 4], P[p1 + 5], P[p1 + 6], a, out.quat, 0);
  const stick = op.rows[r0 + OPP.stick];
  out.sticks = stick > 0 ? Array.from(op.sticks.subarray((stick - 1) * STICK_W, stick * STICK_W)) : null;
  return true;
}
