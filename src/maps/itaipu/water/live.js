/*
 * live.js: the Itaipu flood in the page (docs/FLOOD.md): the water the
 * map draws, stepped on the room's clock (src/sim/water/host.js) a slice
 * of each frame.
 *
 * TWO STARTS (flood.js STARTS). Free Flight's water is a typical spill:
 * the fourteen gates 5 m open over the turbines' river, the look the map
 * has always drawn, loaded when the map is built (dist/flood.wasm, the
 * shipped bed itaipu-flood.json and .bin, and the warmed state
 * itaipu-flood-warm-free.bin) and, with nothing happening to it, never
 * stepped. A war's is the turbines' river with the gates shut
 * (itaipu-flood-warm-war.bin): the map turns to it on the war's first
 * word, a mission's gate state (setGates) or an opening the damage tears
 * (open), and from then every gate's hoist and every opening is an
 * event on the room's clock, the same water on every client however it
 * heard of them. A client that joins late is handed them all, and
 * catches up a budget at a time.
 *
 * A MISSION'S GATE STATE (agreed with the mission engine through the
 * lead, 3 October): a list of { gate: 'gate-N', at: room ms, open_m },
 * each the hoist standing gate N's lip open_m over its sill from `at`.
 * null is no war: Free Flight's water again.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful,
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

const search = new URL(import.meta.url).search;
const url = (name) => new URL(`${name}${search}`, import.meta.url).href;
const WASM_URL = new URL(`../../../../dist/flood.wasm${search}`, import.meta.url).href;

export function liveFlood({ fetchBytes = defaultFetch, now = () => performance.now() } = {}) {
  /* The mode wanted, the one loaded or loading, and its flood. */
  let want = 'free';
  let mode = null;
  let state = 'idle';
  let flood = null;
  let host = null;
  let error = null;
  let lastMs = null;
  /* The war's events heard, in order: openings and hoists. */
  let events = [];
  let loading = null;
  let generation = 0;
  let mods = null;

  const load = async () => {
    const gen = generation;
    const m = want;
    state = 'loading';
    try {
      if (!mods) {
        const [wasm, json, bin, { createFloodHost }, { unpackBed }, F] = await Promise.all([
          fetchBytes(WASM_URL), fetchBytes(url('itaipu-flood.json')), fetchBytes(url('itaipu-flood.bin')),
          import('../../../sim/water/host.js'), import('./bed.js'), import('./flood.js'),
        ]);
        mods = {
          wasm, bed: unpackBed(JSON.parse(new TextDecoder().decode(json)), bin), createFloodHost, F, warm: new Map(),
        };
      }
      const start = mods.F.STARTS[m];
      if (!mods.warm.has(m)) mods.warm.set(m, await fetchBytes(url(start.file)));
      if (gen !== generation) return;
      const fl = await mods.F.makeFlood(mods.wasm, mods.bed, { spill: start.spill });
      mods.F.loadState(fl.f, mods.warm.get(m));
      if (gen !== generation) return;
      flood = fl;
      mode = m;
      host = mods.createFloodHost(flood, { dtMs: mods.F.DT_MS });
      for (const e of events) host.open(e);
      state = 'ready';
    } catch (e) {
      /* Loud: the map goes on without its water, and says why. */
      state = 'failed';
      error = String(e && e.message ? e.message : e);
      console.error(`[flood] could not start: ${error}`);
    }
  };
  const ensure = () => {
    if (mode === want && (state === 'ready' || state === 'loading')) return;
    generation += 1;
    flood = null;
    host = null;
    loading = load();
  };
  const toWar = () => {
    if (want !== 'war') {
      want = 'war';
      events = [];
    }
  };
  const hear = (e) => {
    events.push(e);
    if (host && mode === 'war') host.open(e);
    ensure();
  };

  ensure();
  return {
    /* The war's damage's opening (the contract's), live or replayed. */
    open(o) {
      toWar();
      hear(o);
    },
    /* A mission's gate state, the whole list as it stands (each entry
     * heard once however often the list is handed over), or null for no
     * war. */
    setGates(list) {
      if (list === null) {
        want = 'free';
        events = [];
        ensure();
        return;
      }
      toWar();
      for (const s of list) {
        const e = {
          id: `hoist:${s.gate}:${s.at}`, at: s.at, kind: 'hoist', gate: s.gate, open_m: s.open_m,
        };
        if (!events.some((x) => x.id === e.id)) hear(e);
      }
      ensure();
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
    /* Each opening's discharge and place, for the world's sound. */
    flows: () => (flood && host && host.origin() !== null ? flood.flows() : []),
    loaded: () => loading,
    stats(roomMs) {
      return {
        state,
        mode,
        want,
        error,
        step: host ? host.step() : 0,
        /* The events' clock and the one it steps on: a flood that never
         * moves with an origin far from the clock is a mismatch. */
        origin: host ? host.origin() : null,
        clockMs: lastMs,
        behind: host && roomMs != null ? host.behind(roomMs) : 0,
        events: events.length,
        unplaced: flood ? flood.unplaced() : [],
        lips: flood ? flood.lips() : null,
        hashes: host ? host.hashes() : {},
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
