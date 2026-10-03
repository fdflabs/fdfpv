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
 * THE MAP AS THE WAR LEFT IT (the owner: "i want the replays to show
 * things as they happened"): which targets burn and which lights are out
 * is a function of the hits and the struck power lines the room sent and
 * the room clock (src/share/war/world.js), so that is what is kept, not
 * the map: per match this screen saw, the room ms it first saw it
 * (`from`), the room ms the war stopped being fought (`off`, the targets
 * whole on screen again), every hit with its target and room ms (null for
 * one already down when this screen joined: the snapshot), and
 * every struck line with its room ms and place, and every damage event
 * (src/render/breakage.js: what a warhead broke off a structure, the
 * power lines that fell with it, the openings for the water) as the room
 * sent it. Nothing comes back within
 * a match, so the snapshot and the journal after it are one list. PER
 * ROW, the room ms the frame drew the map at (NaN where no match was
 * known: the map untouched). A replay at row k draws matchAt of the match
 * the row's clock falls in, forwards or backwards alike, and never
 * touches the live map's own state (src/main.js draws whichever is due).
 *
 * MEMORY. Nothing is allocated until a war is drawn. Then two columns for
 * the recorder's CAPACITY rows, HUNTERS_MAX slots wide, and the map's
 * clock, one f64 a row; more hunters than that in one row are counted
 * (stats.dropped), never silently lost. The map's journal is at most
 * MATCHES_MAX matches of at most HITS_MAX hits, CUTS_MAX lines and
 * DAMAGE_MAX damage events each (an event at most DAMAGE_BYTES of JSON),
 * some tens of kilobytes at most; one past any is counted
 * (stats.hitsDropped, cutsDropped, damageDropped).
 *
 * A clip's `war` is { agents: [{ mission, a, last }], room (f64[n]),
 * slots, hunters (f32[n x slots x HUNTER_N]), and since version 11
 * world: [{ mission, from, off, hits, cuts, damage }], clock (f64[n]) }, or
 * absent when no war was drawn in it. src/replay/file.js saves it
 * (version 10, 11 with the map); src/replay/warscene.js draws it.
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
import { matchAt, untouched } from '../share/war/world.js';

/* Hunters drawn in one row, at most (a mission has a handful). */
export const HUNTERS_MAX = 8;
/* Per hunter per row, floats: id (0 an empty slot), position, attitude
 * as x, y, z, w. */
export const HUNTER = { id: 0, pos: 1, quat: 4 };
export const HUNTER_N = 8;
/* A clip keeps at most this many birth records (a mission has tens). */
export const AGENTS_MAX = 512;
const AGENT_KEYS = ['id', 'kind', 'route', 't0', 'k', 'n', 'err', 'target'];
/* The map's journal: the matches a clip can span (a war ends and the
 * host starts the next inside the window), and the hits and the struck
 * lines of one match (a mission flies 23 to 128 attackers, each at most
 * one of them). */
export const MATCHES_MAX = 4;
export const HITS_MAX = 256;
export const CUTS_MAX = 256;
/* A mission's structures break in tens of events; an event names its
 * chunks, a few hundred at most. */
export const DAMAGE_MAX = 512;
export const DAMAGE_BYTES = 16384;
const MATCH_KEYS = ['mission', 'from', 'off', 'hits', 'cuts', 'damage'];
const DAMAGE_KEYS = ['seq', 'at', 'target', 'chunks', 'fell', 'openings', 'down', 'health', 'p', 'by', 'cut'];

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
  /* The map's journal, oldest match first: { key (which war, never
   * saved: it names the room), mission, from, off, on (fought yet),
   * hits, cuts }. */
  const matches = [];
  /* Per row, the room ms the map was drawn at. */
  let clock = null;
  const stats = {
    dropped: 0, hitsDropped: 0, cutsDropped: 0, damageDropped: 0,
  };

  function alloc() {
    room = new Float64Array(capacity).fill(NaN);
    cols = new Float32Array(capacity * HUNTERS_MAX * HUNTER_N);
    clock = new Float64Array(capacity).fill(NaN);
  }

  /* The row the recorder began this frame, or -1 for none. */
  function begin(i) {
    row = i;
    if (i >= 0 && room) {
      room[i] = NaN;
      clock[i] = NaN;
      cols.fill(0, i * HUNTERS_MAX * HUNTER_N, (i + 1) * HUNTERS_MAX * HUNTER_N);
    }
  }

  /*
   * Once a frame, before that frame's events: the war the view names
   * (`key`, null for none), its mission, its `down` (the targets hit, as
   * the room says them), whether it is being fought (roomwar.js on()),
   * and the room ms now. A match first seen starts a new entry whose
   * snapshot is `down`, each hit at null (this screen did not hear it).
   */
  function world(key, mission, down, on, roomMs) {
    if (key == null || roomMs == null || !(mission in MISSIONS)) {
      return;
    }
    let m = matches[matches.length - 1];
    if (!m || m.key !== key) {
      m = {
        key, mission, from: roomMs, off: null, on: false, hits: [], cuts: [], damage: [],
      };
      for (const target of down || []) {
        hit(m, target, null);
      }
      matches.push(m);
      if (matches.length > MATCHES_MAX) {
        matches.shift();
      }
    }
    if (on) {
      m.on = true;
    } else if (m.on && m.off === null) {
      m.off = roomMs;
    }
    if (row < 0) {
      return;
    }
    if (!room) {
      alloc();
    }
    clock[row] = roomMs;
  }

  /* A target hit at `at` (null: in the snapshot, once a target). A
   * target the mission does not name changes nothing on any map (grid.js
   * unitOf, the dam's states), so it is not kept. */
  function hit(m, target, at) {
    if (!(target in MISSIONS[m.mission].targets) || (at === null && m.hits.some((h) => h.target === target))) {
      return;
    }
    if (m.hits.length >= HITS_MAX) {
      stats.hitsDropped += 1;
      return;
    }
    m.hits.push({ target, at });
  }

  /* Births the room sent, of mission `mission` (its id). */
  function born(mission, list) {
    for (const a of list) {
      agents.set(a.id, { mission, a: { ...a }, last: Infinity });
    }
  }

  /* A damage event heard (roomwar.js's 'damage'), once a seq, into the
   * match now: what the room sent, without its type. */
  function damage(ev) {
    const m = matches[matches.length - 1];
    if (!m || !Number.isFinite(ev.at) || m.damage.some((d) => d.seq === ev.seq)) {
      return;
    }
    const d = {};
    for (const k of DAMAGE_KEYS) {
      d[k] = ev[k] === undefined ? null : JSON.parse(JSON.stringify(ev[k]));
    }
    if (m.damage.length >= DAMAGE_MAX || !damageOk(d)) {
      stats.damageDropped += 1;
      return;
    }
    m.damage.push(d);
  }

  /* A death heard (roomwar.js's 'dead' event): the attackers in it last
   * drawn in the frame before; a target it hit, or the power line it
   * struck, into the map's journal of the match now. */
  function dead(ev) {
    for (const id of ev.ids) {
      const x = agents.get(id);
      if (x && x.last === Infinity) {
        x.last = lastRoom;
      }
    }
    const m = matches[matches.length - 1];
    if (!m || !Number.isFinite(ev.at)) {
      return;
    }
    if (ev.why === 'wire' && Array.isArray(ev.p)) {
      if (m.cuts.length >= CUTS_MAX) {
        stats.cutsDropped += 1;
        return;
      }
      m.cuts.push({ at: ev.at, x: ev.p[0], z: ev.p[2] });
    } else if (ev.hit === true && ev.target) {
      hit(m, ev.target, ev.at);
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
      clock.fill(NaN);
    }
    slotOf = new Map();
  }

  /* The matches the map's clock in rows `first`, n, falls in, as a
   * clip's world, or null when no row knew a war. */
  function worldOf(first, n) {
    const c = new Float64Array(n);
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < n; k += 1) {
      c[k] = clock[(first + k) % capacity];
      if (Number.isFinite(c[k])) {
        lo = Math.min(lo, c[k]);
        hi = Math.max(hi, c[k]);
      }
    }
    if (lo > hi) {
      return null;
    }
    /* From the last match begun by the first row on, to the last begun
     * by the last. */
    let a = 0;
    for (let i = 0; i < matches.length; i += 1) {
      if (matches[i].from <= lo) {
        a = i;
      }
    }
    const list = matches.slice(a).filter((m) => m.from <= hi).map((m) => ({
      mission: m.mission,
      from: m.from,
      off: m.off !== null && m.off <= hi ? m.off : null,
      hits: m.hits.filter((h) => h.at === null || h.at <= hi).map((h) => ({ ...h })),
      cuts: m.cuts.filter((x) => x.at <= hi).map((x) => ({ ...x })),
      damage: m.damage.filter((d) => d.at <= hi).map((d) => JSON.parse(JSON.stringify(d))),
    }));
    return { world: list, clock: c };
  }

  /* The rows the recorder cut for a clip, `n` from ring index `first`, as
   * a clip's war, or null when no war was drawn in them. */
  function clip(first, n) {
    if (!room) {
      return null;
    }
    const map = worldOf(first, n);
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
    if (lo > hi && !map) {
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
      agents: list, room: r, slots, hunters, ...(map || {}),
    };
  }

  return {
    begin,
    born,
    dead,
    damage,
    world,
    draw,
    clear,
    clip,
    stats,
    /* Bytes held now: nothing until a war is drawn while recording. */
    bytes: () => (room ? room.byteLength + cols.byteLength + clock.byteLength : 0),
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
    ...(war.world ? {
      world: war.world.map((m) => ({
        ...m, hits: m.hits.map((h) => ({ ...h })), cuts: m.cuts.map((x) => ({ ...x })), damage: JSON.parse(JSON.stringify(m.damage)),
      })),
      clock: war.clock.slice(a, b + 1),
    } : {}),
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
  if ((war.world === undefined) !== (war.clock === undefined)) {
    throw new Error('the war\'s map has its journal or its clock, not both');
  }
  if (war.world !== undefined) {
    checkWorld(war.world, war.clock, n);
  }
}

const isClock = (x) => x === null || Number.isFinite(x);
const isIndexList = (a) => Array.isArray(a) && a.length <= 4096 && a.every((i) => Number.isInteger(i) && i >= 0);

/* One damage event as a clip keeps it: the room's fields, of their kinds
 * (src/share/roomwar.js), and not more than DAMAGE_BYTES. */
function damageOk(d) {
  if (!d || typeof d !== 'object' || Object.keys(d).length !== DAMAGE_KEYS.length || !DAMAGE_KEYS.every((k) => k in d)) {
    return false;
  }
  return Number.isInteger(d.seq) && d.seq >= 0 && Number.isFinite(d.at) && typeof d.target === 'string' && d.target.length <= 40
    && isIndexList(d.chunks) && isIndexList(d.fell) && Array.isArray(d.openings) && d.openings.every((o) => o && typeof o === 'object')
    && (d.p === null || (Array.isArray(d.p) && d.p.length === 3 && d.p.every(Number.isFinite)))
    && (d.by === null || Number.isInteger(d.by)) && Array.isArray(d.cut)
    && JSON.stringify(d).length <= DAMAGE_BYTES;
}

/* The map's journal and clock (version 11), as checkWar needs them. */
function checkWorld(world, clock, n) {
  if (!Array.isArray(world) || world.length < 1 || world.length > MATCHES_MAX) {
    throw new Error('the war\'s map journal is not a list of matches');
  }
  let from = -Infinity;
  for (const m of world) {
    const keys = m && typeof m === 'object' ? Object.keys(m) : [];
    if (keys.length !== MATCH_KEYS.length || !MATCH_KEYS.every((k) => keys.includes(k))) {
      throw new Error('a match of the war\'s map is not one');
    }
    if (!(m.mission in MISSIONS) || !Number.isFinite(m.from) || !(m.from > from) || !(m.off === null || Number.isFinite(m.off))) {
      throw new Error('a match of the war\'s map has no mission or clock');
    }
    from = m.from;
    if (!Array.isArray(m.hits) || m.hits.length > HITS_MAX || !Array.isArray(m.cuts) || m.cuts.length > CUTS_MAX) {
      throw new Error('a match of the war\'s map holds too much');
    }
    for (const h of m.hits) {
      if (!h || Object.keys(h).length !== 2 || typeof h.target !== 'string' || !(h.target in MISSIONS[m.mission].targets) || !isClock(h.at)) {
        throw new Error('a hit on the war\'s map is not one');
      }
    }
    for (const x of m.cuts) {
      if (!x || Object.keys(x).length !== 3 || ![x.at, x.x, x.z].every(Number.isFinite)) {
        throw new Error('a struck line on the war\'s map is not one');
      }
    }
    if (!Array.isArray(m.damage) || m.damage.length > DAMAGE_MAX || !m.damage.every(damageOk)
      || new Set(m.damage.map((d) => d.seq)).size !== m.damage.length) {
      throw new Error('a damage event on the war\'s map is not one');
    }
  }
  if (!(clock instanceof Float64Array) || clock.length !== n) {
    throw new Error('the war\'s map clock is not the clip\'s length');
  }
  for (let k = 0; k < n; k += 1) {
    if (!(Number.isNaN(clock[k]) || Number.isFinite(clock[k]))) {
      throw new Error('a war map clock is not a number');
    }
  }
}

/*
 * The map a replay draws between rows k and k + 1, `a` of the way: what
 * src/share/war/world.js matchAt says of the match the row's clock falls
 * in, the map untouched where the row knew no war, or null for a clip
 * that kept no map (one saved before version 11), which a replay leaves
 * as the live map has it. `caches` is a Map the caller keeps.
 */
export function worldAt(war, n, k, a, caches) {
  if (!war.world) {
    return null;
  }
  const t0 = war.clock[k];
  const t1 = war.clock[Math.min(n - 1, k + 1)];
  const t = Number.isFinite(t0) && Number.isFinite(t1) ? t0 + (t1 - t0) * a : t0;
  let m = null;
  if (Number.isFinite(t)) {
    for (const x of war.world) {
      if (x.from <= t) {
        m = x;
      }
    }
  }
  if (!m) {
    if (!caches.has(null)) {
      caches.set(null, untouched());
    }
    return caches.get(null);
  }
  if (!caches.has(m)) {
    caches.set(m, {});
  }
  /* The room ms the clip starts at: its first row drawn in a war. */
  if (!caches.has('from')) {
    caches.set('from', war.clock.find(Number.isFinite) ?? null);
  }
  return { t, from: caches.get('from'), ...matchAt(m, t, caches.get(m)) };
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
