/*
 * warrec.js: a war's attackers, in the crash cam's recording.
 *
 * The owner: "ok the enemy drones are not showing in the replays". A war
 * (docs/WARFARE-PLAN.md) draws its attackers through one layer
 * (src/render/attackers.js), from src/share/roomwar.js's attackersAt at
 * the room clock. This keeps what a replay needs to draw them where they
 * were, and nothing it can work out again:
 *
 * SCRIPTED ATTACKERS (every kind but the Hunter) fly routes.js's function
 * of their birth record and the room clock, the same on every screen. So
 * each is kept ONCE: its birth record as the room sent it (planAgent's
 * input), the mission it belongs to, and the room ms at which this screen
 * last drew it before its death was heard. PER ROW, the room ms the frame
 * drew the war at (NaN while no war was live). A replay recomputes each
 * pose from routes.js at that room ms: exact, and eight bytes a row
 * however many fly.
 *
 * HUNTERS are steered by the room from where the pilots are, so no
 * function gives them back: each drawn one is kept PER ROW as drawn, its
 * id, position and attitude as f32 (as src/replay/peers.js keeps a peer),
 * in a slot it holds while it is drawn, so a replay interpolates it
 * between rows and never blends two.
 *
 * MEMORY. Nothing is allocated until a war is drawn. Then two columns for
 * the recorder's CAPACITY rows, HUNTERS_MAX slots wide; more hunters than
 * that in one row are counted (stats.dropped), never silently lost.
 *
 * A clip's `war` is { agents: [{ mission, a, last }], room (f64[n]),
 * slots, hunters (f32[n x slots x HUNTER_N]) }, or absent when no war was
 * drawn in it. src/replay/file.js saves it (version 10);
 * src/replay/warscene.js draws it.
 *
 * Render only. Nothing here reaches a plant or the room.
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

import { KINDS, planAgent, poseAt } from '../share/war/routes.js';
import { MISSIONS } from '../share/war/missions/index.js';

/* Hunters drawn in one row, at most (a mission has a handful). */
export const HUNTERS_MAX = 8;
/* Per hunter per row, floats: id (0 an empty slot), position, attitude
 * as x, y, z, w. */
export const HUNTER = { id: 0, pos: 1, quat: 4 };
export const HUNTER_N = 8;
/* A clip keeps at most this many birth records (a mission has tens). */
export const AGENTS_MAX = 512;
const AGENT_KEYS = ['id', 'kind', 'route', 't0', 'k', 'n', 'err', 'target'];

export function createWarRing(capacity) {
  let room = null;
  let cols = null;
  let row = -1;
  /* id -> { mission, a, last }: last the room ms this screen last drew
   * it at, Infinity while it lives. */
  const agents = new Map();
  /* id -> slot of the hunters drawn in the row before. */
  let slotOf = new Map();
  let lastRoom = NaN;
  const stats = { dropped: 0 };

  function alloc() {
    room = new Float64Array(capacity).fill(NaN);
    cols = new Float32Array(capacity * HUNTERS_MAX * HUNTER_N);
  }

  /* The row the recorder began this frame, or -1 for none. */
  function begin(i) {
    row = i;
    if (i >= 0 && room) {
      room[i] = NaN;
      cols.fill(0, i * HUNTERS_MAX * HUNTER_N, (i + 1) * HUNTERS_MAX * HUNTER_N);
    }
  }

  /* Births the room sent, of mission `mission` (its id). */
  function born(mission, list) {
    for (const a of list) {
      agents.set(a.id, { mission, a: { ...a }, last: Infinity });
    }
  }

  /* Deaths heard: last drawn in the frame before. */
  function dead(ids) {
    for (const id of ids) {
      const x = agents.get(id);
      if (x && x.last === Infinity) {
        x.last = lastRoom;
      }
    }
  }

  /* This frame's drawing: roomMs the clock it was drawn at (null with no
   * war live), list what attackers.js was given. */
  function draw(roomMs, list) {
    lastRoom = roomMs == null ? NaN : roomMs;
    if (row < 0 || roomMs == null) {
      return;
    }
    if (!room) {
      alloc();
    }
    room[row] = roomMs;
    const next = new Map();
    const base = row * HUNTERS_MAX * HUNTER_N;
    const used = new Uint8Array(HUNTERS_MAX);
    const hunters = list.filter((x) => x.kind === 'hunter');
    /* Each keeps its slot from the row before when it can. */
    for (const h of hunters) {
      const s = slotOf.get(h.id);
      if (s !== undefined && !used[s]) {
        used[s] = 1;
        next.set(h.id, s);
      }
    }
    for (const h of hunters) {
      if (!next.has(h.id)) {
        const s = used.indexOf(0);
        if (s < 0) {
          stats.dropped += 1;
          continue;
        }
        used[s] = 1;
        next.set(h.id, s);
      }
      const o = base + next.get(h.id) * HUNTER_N;
      cols[o] = h.id;
      cols[o + 1] = h.p[0];
      cols[o + 2] = h.p[1];
      cols[o + 3] = h.p[2];
      cols[o + 4] = h.q[0];
      cols[o + 5] = h.q[1];
      cols[o + 6] = h.q[2];
      cols[o + 7] = h.q[3];
    }
    slotOf = next;
  }

  function clear() {
    row = -1;
    if (room) {
      room.fill(NaN);
      cols.fill(0);
    }
    slotOf = new Map();
  }

  /* The rows the recorder cut for a clip, `n` from ring index `first`, as
   * a clip's war, or null when no war was drawn in them. */
  function clip(first, n) {
    if (!room) {
      return null;
    }
    const r = new Float64Array(n);
    let lo = Infinity;
    let hi = -Infinity;
    let slots = 0;
    for (let k = 0; k < n; k += 1) {
      const i = (first + k) % capacity;
      r[k] = room[i];
      if (Number.isFinite(room[i])) {
        lo = Math.min(lo, room[i]);
        hi = Math.max(hi, room[i]);
      }
      for (let s = 0; s < HUNTERS_MAX; s += 1) {
        if (cols[(i * HUNTERS_MAX + s) * HUNTER_N] !== 0) {
          slots = Math.max(slots, s + 1);
        }
      }
    }
    if (lo > hi) {
      return null;
    }
    const hunters = new Float32Array(n * slots * HUNTER_N);
    for (let k = 0; k < n; k += 1) {
      const i = (first + k) % capacity;
      hunters.set(cols.subarray(i * HUNTERS_MAX * HUNTER_N, (i * HUNTERS_MAX + slots) * HUNTER_N), k * slots * HUNTER_N);
    }
    /* The scripted ones that could be drawn in it: born by its last ms and
     * not dead before its first. */
    const list = [...agents.values()]
      .filter((x) => x.a.kind !== 'hunter' && x.a.t0 <= hi && x.last >= lo)
      .slice(-AGENTS_MAX)
      .map((x) => ({ mission: x.mission, a: { ...x.a }, last: Number.isFinite(x.last) ? x.last : null }));
    return {
      agents: list, room: r, slots, hunters,
    };
  }

  return {
    begin,
    born,
    dead,
    draw,
    clear,
    clip,
    stats,
    /* Bytes held now: nothing until a war is drawn while recording. */
    bytes: () => (room ? room.byteLength + cols.byteLength : 0),
  };
}

/* Rows [a, b] of a clip's war, as trimClip cuts the rest. */
export function trimWar(war, a, b) {
  const n = b - a + 1;
  return {
    agents: war.agents.map((x) => ({ ...x, a: { ...x.a } })),
    room: war.room.slice(a, b + 1),
    slots: war.slots,
    hunters: war.hunters.slice(a * war.slots * HUNTER_N, (a + n) * war.slots * HUNTER_N),
  };
}

/* A clip's war checked, as the file's reader needs it. Throws an Error
 * saying what was wrong. */
export function checkWar(war, n) {
  if (!Array.isArray(war.agents) || war.agents.length > AGENTS_MAX) {
    throw new Error('the war agents are not a list');
  }
  for (const x of war.agents) {
    const keys = x && typeof x === 'object' ? Object.keys(x) : [];
    if (keys.length !== 3 || !['mission', 'a', 'last'].every((k) => keys.includes(k))) {
      throw new Error('a war agent is not one');
    }
    if (!(x.mission in MISSIONS) || !(x.last === null || Number.isFinite(x.last))) {
      throw new Error('a war agent\'s mission or death is not one');
    }
    const a = x.a;
    if (!a || typeof a !== 'object' || !Object.keys(a).every((k) => AGENT_KEYS.includes(k))
      || !Number.isInteger(a.id) || !KINDS.includes(a.kind) || a.kind === 'hunter' || !Number.isFinite(a.t0)) {
      throw new Error('a war birth record is not one');
    }
    try {
      planAgent(MISSIONS[x.mission], a);
    } catch (err) {
      throw new Error(`a war birth record does not fly: ${err.message}`);
    }
  }
  if (war.room.length !== n || !Number.isInteger(war.slots) || war.slots < 0 || war.slots > HUNTERS_MAX
    || war.hunters.length !== n * war.slots * HUNTER_N) {
    throw new Error('the war columns are not the clip\'s length');
  }
  for (let k = 0; k < n; k += 1) {
    if (!(Number.isNaN(war.room[k]) || Number.isFinite(war.room[k]))) {
      throw new Error('a war room clock is not a number');
    }
  }
  for (let i = 0; i < war.hunters.length; i += 1) {
    if (!Number.isFinite(war.hunters[i])) {
      throw new Error('a hunter column holds a value that is not a number');
    }
  }
}

/*
 * The attackers a replay draws between rows k and k + 1, `a` of the way:
 * [{ id, kind, p, q }] as attackersAt gives them, or [] where no war was
 * drawn. `plans` caches planAgent per agent (a Map the caller keeps).
 */
export function warAt(war, n, k, a, plans) {
  const r0 = war.room[k];
  if (!Number.isFinite(r0)) {
    return [];
  }
  const k1 = Math.min(n - 1, k + 1);
  const r1 = war.room[k1];
  const r = Number.isFinite(r1) ? r0 + (r1 - r0) * a : r0;
  const out = [];
  for (const x of war.agents) {
    let plan = plans.get(x);
    if (!plan) {
      plan = planAgent(MISSIONS[x.mission], x.a);
      plans.set(x, plan);
    }
    if (r < x.a.t0 || r > plan.tEnd || (x.last !== null && r > x.last)) {
      continue;
    }
    const o = poseAt(plan, r);
    if (o) {
      out.push({ id: x.a.id, kind: x.a.kind, p: o.p.slice(), q: o.q.slice() });
    }
  }
  const S = war.slots;
  for (let s = 0; s < S; s += 1) {
    const o0 = (k * S + s) * HUNTER_N;
    const id = war.hunters[o0];
    if (id === 0) {
      continue;
    }
    const o1 = (k1 * S + s) * HUNTER_N;
    const same = k1 !== k && war.hunters[o1] === id;
    const u = same ? a : 0;
    const h = war.hunters;
    const p = [0, 1, 2].map((j) => h[o0 + 1 + j] + (h[o1 + 1 + j] - h[o0 + 1 + j]) * u);
    const q = [0, 1, 2, 3].map((j) => h[o0 + 4 + j] + (h[o1 + 4 + j] - h[o0 + 4 + j]) * u);
    const m = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    out.push({ id, kind: 'hunter', p, q: q.map((v) => v / m) });
  }
  return out.sort((x, y) => x.id - y.id);
}
