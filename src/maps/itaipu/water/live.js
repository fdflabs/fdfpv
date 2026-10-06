/*
 * live.js: the Itaipu flood in the page (docs/FLOOD.md): the water the
 * map draws, stepped on the room's clock (src/sim/water/host.js) a slice
 * of each frame.
 *
 * ONE START (flood.js START). The water is a typical spill, the fourteen
 * gates 2 m open over the turbines' river, the look the map has always
 * drawn, loaded when the map is built (dist/flood.wasm, the shipped bed
 * itaipu-flood.json and .bin, and the warmed state itaipu-flood-warm.bin)
 * and, with nothing happening to it, never stepped. Free Flight's water
 * and a war's before its first event are that one water. In a war every
 * gate's hoist (setGates) and every opening the damage tears (open) is
 * an event on the room's clock, the same water on every client however
 * it heard of them. A client that joins late is handed them all, and
 * catches up a budget at a time.
 *
 * A MISSION'S GATE STATE (agreed with the mission engine through the
 * lead, 3 October): a list of { gate: 'gate-N', at: room ms, open_m },
 * each the hoist driving gate N's lip toward open_m over its sill from
 * `at` (src/share/war/hoist.js, its rate and its ramps; flood.js tick).
 * null is no war: the starting water again.
 *
 * This file is part of the Paraguayan Drone Combat Simulator.
 *
 * The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* Main thread time a frame may spend stepping, ms: at 1.17 ms a step in
 * Chrome (docs/FLOOD.md) some 154 steps a second at 60 frames, three
 * times the room's 50. */
export const FRAME_BUDGET_MS = 3;
/*
 * THE LEVEL THE PLANT FEELS (levelAt). The aircraft floats on and crashes
 * into the water the map draws, so the plant is told its level at the
 * aircraft; and the plant's inputs are the same for the same flight, so
 * that level is a function of the place and the room's time alone, never
 * of how the frames fell. With nothing happening (Free Flight's spill, a
 * war before its first event) the water does not change and its level is
 * the place's. In a war it is read from the levels the host keeps at
 * every snapshot step (every 2 s), LEVEL_LAG steps behind the flood's own
 * clock and between the two snapshot steps either side, which every
 * client has kept by then: at most some 3 s behind the water drawn, the
 * same on every client.
 */
const LEVEL_LAG = 100;
const LEVELS_KEPT = 8;

const search = new URL(import.meta.url).search;
const url = (name) => new URL(`${name}${search}`, import.meta.url).href;
const WASM_URL = new URL(`../../../../dist/flood.wasm${search}`, import.meta.url).href;

/*
 * THE FILES, ONCE. Every flood a page makes (the live one, a replay's
 * forks) shares the compiled module, the unpacked bed and the warmed
 * state's bytes, fetched and made once per `fetchBytes`; none of them
 * is written. A load that failed is forgotten, so a later one tries
 * again.
 */
const sharedBy = new WeakMap();
function shared(fetchBytes) {
  if (!sharedBy.has(fetchBytes)) {
    const made = (async () => {
      const [wasm, json, bin, { createFloodHost, DELAY_MS }, { unpackBed }, F] = await Promise.all([
        fetchBytes(WASM_URL), fetchBytes(url('itaipu-flood.json')), fetchBytes(url('itaipu-flood.bin')),
        import('../../../sim/water/host.js'), import('./bed.js'), import('./flood.js'),
      ]);
      const [module, warm] = await Promise.all([WebAssembly.compile(wasm), fetchBytes(url(F.START.file))]);
      return {
        module, bed: unpackBed(JSON.parse(new TextDecoder().decode(json)), bin), warm, createFloodHost, delay: DELAY_MS, F,
      };
    })();
    made.catch(() => sharedBy.delete(fetchBytes));
    sharedBy.set(fetchBytes, made);
  }
  return sharedBy.get(fetchBytes);
}

/* A mission's gate state entry as the flood's event. */
const hoistEvent = (s) => ({
  id: `hoist:${s.gate}:${s.at}`, at: s.at, kind: 'hoist', gate: s.gate, open_m: s.open_m,
});

/*
 * The flood. `seed`, for a fork only: { events, from }, the events it
 * holds from the start and the checkpoint (host.js checkpoint) of the
 * flood it was forked from to start at, or null. A fork keeps no
 * levels for the plant: the plant does not step under a replay.
 */
export function liveFlood({ fetchBytes = defaultFetch, now = () => performance.now(), seed = null } = {}) {
  let state = 'idle';
  let flood = null;
  let host = null;
  let error = null;
  let lastMs = null;
  /* The war's events heard, in order: openings and hoists. None is no
   * war, the starting water. */
  let events = seed ? seed.events.slice() : [];
  /* Whether a fork started at its parent's checkpoint, not the origin. */
  let resumed = false;
  let loading = null;
  let mods = null;
  /* The water's level, Float32 a cell, at each snapshot step kept. */
  const levels = new Map();
  const keepLevel = (step) => {
    const h = flood.f.h(); const b = flood.f.bed();
    const out = new Float32Array(h.length);
    for (let k = 0; k < h.length; k += 1) out[k] = h[k] > 0.02 ? h[k] + b[k] : -Infinity;
    levels.set(step, out);
    if (levels.size > LEVELS_KEPT) levels.delete(Math.min(...levels.keys()));
  };
  const dropLevels = (from) => {
    for (const s of [...levels.keys()]) if (s > from) levels.delete(s);
  };
  /* The starting water and a host with no events: the host restarts
   * from whatever the flood holds when it is made. */
  const fresh = () => {
    mods.F.loadState(flood.f, mods.warm);
    flood.reset();
    levels.clear();
    host = mods.createFloodHost(flood, seed
      ? { dtMs: mods.F.DT_MS }
      : { dtMs: mods.F.DT_MS, onSave: keepLevel, onDrop: dropLevels });
  };

  const load = async () => {
    state = 'loading';
    try {
      mods = await shared(fetchBytes);
      flood = await mods.F.makeFlood(mods.module, mods.bed, { spill: mods.F.START.spill });
      fresh();
      for (const e of events) host.open(e);
      if (seed && seed.from) resumed = host.resume(seed.from);
      state = 'ready';
    } catch (e) {
      /* Loud: the map goes on without its water, and says why. */
      state = 'failed';
      error = String(e && e.message ? e.message : e);
      console.error(`[flood] could not start: ${error}`);
    }
  };
  const hear = (e) => {
    events.push(e);
    if (host) host.open(e);
  };

  loading = load();
  return {
    /* The war's damage's opening (the contract's), live or replayed. */
    open(o) {
      hear(o);
    },
    /* A mission's gate state, the whole list as it stands (each entry
     * heard once however often the list is handed over), or null for no
     * war. */
    setGates(list) {
      if (list === null) {
        if (events.length === 0) return;
        events = [];
        if (host) fresh();
        return;
      }
      for (const s of list) {
        const e = hoistEvent(s);
        if (!events.some((x) => x.id === e.id && x.open_m === e.open_m)) hear(e);
      }
    },
    /*
     * A flood of a replay's own (src/replay/, the crash cam): the clip's
     * `openings` (the contract's) and its `gates` (setGates' entries, or
     * null), drawn while the replay plays and advanced on the clip's
     * clock, `fromMs` the room ms the clip starts at. It starts from
     * this flood's latest checkpoint before `fromMs` when this flood
     * heard the same events before it (host.js resume), the same water
     * to the bit at once; else from the origin, catching up a budget at
     * a time. With no events while this flood has none either, it is
     * this flood's own water and nothing is built (held, flood() null,
     * if this flood hears one meanwhile). Same interface as
     * this one's: advance, flood, flows, stats, loaded.
     */
    fork(openings, fromMs, gates = null) {
      const list = [...openings, ...(gates || []).map(hoistEvent)];
      if (list.length === 0 && events.length === 0) {
        const self = this;
        const still = () => events.length === 0;
        return {
          advance: () => 0,
          flood: () => (still() ? self.flood() : null),
          flows: () => [],
          stats: (roomMs) => ({ ...self.stats(roomMs), fork: 'still', held: !still() }),
          loaded: () => loading,
        };
      }
      const from = host && events.length ? host.checkpoint(fromMs) : null;
      return liveFlood({ fetchBytes, now, seed: { events: list, from } });
    },
    /* Every frame, with the room's clock (the map's animation clock is
     * the room's in a room). */
    advance(roomMs) {
      lastMs = roomMs;
      if (!host) return 0;
      return host.advance(roomMs, { budgetMs: FRAME_BUDGET_MS, clock: now });
    },
    /* The flood ready to read, or null: its solver (`f`), its bed and
     * its gates' lips (flood.js). */
    flood: () => (state === 'ready' ? flood : null),
    /* The water's level under world (x, z) at room time `roomMs` for the
     * plant (THE LEVEL THE PLANT FEELS), or null where there is none. */
    levelAt(x, z, roomMs) {
      if (!flood) return null;
      const k = flood.cellAt(x, z);
      if (k < 0) return null;
      const origin = host ? host.origin() : null;
      if (origin === null || !Number.isFinite(roomMs)) {
        const h = flood.f.h()[k];
        return h > 0.02 ? h + flood.f.bed()[k] : null;
      }
      const SNAP = 100;
      const s = (roomMs - mods.delay - origin) / mods.F.DT_MS - LEVEL_LAG;
      const n0 = Math.max(0, Math.floor(s / SNAP) * SNAP);
      const n1 = n0 + SNAP;
      /* A snapshot step's level is kept as the step after it begins. */
      if (!levels.has(n1)) host.stepTo(n1 + 1);
      const a = levels.get(n0);
      const b = levels.get(n1);
      if (!a || !b) return null;
      const t = Math.min(1, Math.max(0, (s - n0) / SNAP));
      const la = a[k]; const lb = b[k];
      if (!Number.isFinite(la) && !Number.isFinite(lb)) return null;
      if (!Number.isFinite(la)) return t >= 0.5 ? lb : null;
      if (!Number.isFinite(lb)) return t < 0.5 ? la : null;
      return la + (lb - la) * t;
    },
    /* Each opening's discharge and place, for the world's sound. */
    flows: () => (flood && host && host.origin() !== null ? flood.flows() : []),
    loaded: () => loading,
    stats(roomMs) {
      return {
        state,
        /* 'war' once an event is heard, the starting water's 'free'
         * before. */
        mode: events.length ? 'war' : 'free',
        error,
        step: host ? host.step() : 0,
        /* The events' clock and the one it steps on: a flood that never
         * moves with an origin far from the clock is a mismatch. */
        origin: host ? host.origin() : null,
        clockMs: lastMs,
        behind: host && roomMs != null ? host.behind(roomMs) : 0,
        events: events.length,
        /* Each event heard, [id, at]: two clients that disagree show why. */
        heard: events.map((e) => [e.id, e.at]),
        unplaced: flood ? flood.unplaced() : [],
        lips: flood ? flood.lips() : null,
        hashes: host ? host.hashes() : {},
        ...(seed ? { fork: resumed ? 'checkpoint' : 'origin' } : {}),
        ...(host ? host.stats : {}),
      };
    },
  };
}

async function defaultFetch(target) {
  const r = await fetch(target);
  if (!r.ok) {
    throw new Error(`${target}: ${r.status}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}
