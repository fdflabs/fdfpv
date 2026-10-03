/*
 * live.js: the Itaipu flood in the page: the openings the war's damage
 * sends (map.onOpening, docs/DAMBREAK-CONTRACT) into the solver, stepped
 * on the room's clock (src/sim/water/host.js) a slice of each frame.
 *
 * Nothing is loaded until the first opening: then dist/flood.wasm and
 * the shipped bed (itaipu-flood.json and .bin, which scripts/water-
 * itaipu.js writes and checks), and the water starts still on it with
 * the spillway's gates at their 5 m and the turbines running from the
 * origin. A client that joins late is handed every opening the room
 * kept, as a live one is, and catches up a budget at a time.
 *
 * PROTOTYPE (docs/FLOOD.md): the water is not drawn yet and the spillway
 * fills from still water at the origin rather than from a running
 * river; both are the lead's to decide (a shipped warmed state, the
 * rendering, a worker for the budget).
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

/* Main thread time a frame may spend stepping, ms. At some 2.5 ms a step
 * the flood keeps up with the room only with more than this; docs/FLOOD.md
 * states the budget and what would meet it. */
export const FRAME_BUDGET_MS = 3;

const search = new URL(import.meta.url).search;
const WASM_URL = new URL(`../../../../dist/flood.wasm${search}`, import.meta.url).href;
const BED_URL = new URL(`itaipu-flood.json${search}`, import.meta.url).href;
const BIN_URL = new URL(`itaipu-flood.bin${search}`, import.meta.url).href;

export function liveFlood({ fetchBytes = defaultFetch, now = () => performance.now() } = {}) {
  let state = 'idle';
  let flood = null;
  let host = null;
  let error = null;
  let lastMs = null;
  const pending = [];

  const start = async () => {
    state = 'loading';
    try {
      /* The modules too, so a map that never floods fetches none of it. */
      const [wasm, json, bin, { createFloodHost }, { unpackBed }, { DT_MS, makeFlood }] = await Promise.all([
        fetchBytes(WASM_URL), fetchBytes(BED_URL), fetchBytes(BIN_URL),
        import('../../../sim/water/host.js'), import('./bed.js'), import('./flood.js'),
      ]);
      const bed = unpackBed(JSON.parse(new TextDecoder().decode(json)), bin);
      flood = await makeFlood(wasm, bed, {});
      host = createFloodHost(flood, { dtMs: DT_MS });
      for (const o of pending.splice(0)) host.open(o);
      state = 'ready';
    } catch (e) {
      /* Loud: the war goes on without its water, and says why. */
      state = 'failed';
      error = String(e && e.message ? e.message : e);
      console.error(`[flood] could not start: ${error}`);
    }
  };

  return {
    /* An opening from the war (the contract's), live or replayed. */
    open(o) {
      if (host) {
        host.open(o);
        return;
      }
      pending.push(o);
      if (state === 'idle') start();
    },
    /* Every frame, with the room's clock (the map's animation clock is
     * the room's in a room). */
    advance(roomMs) {
      lastMs = roomMs;
      if (!host) return 0;
      return host.advance(roomMs, { budgetMs: FRAME_BUDGET_MS, clock: now });
    },
    /* Each opening's discharge and place, for the world's sound. */
    flows: () => (flood && host && host.origin() !== null ? flood.flows() : []),
    stats(roomMs) {
      return {
        state,
        error,
        step: host ? host.step() : 0,
        /* The openings' clock and the one it steps on: a flood that
         * never moves with an origin far from the clock is a mismatch
         * between them. */
        origin: host ? host.origin() : null,
        clockMs: lastMs,
        behind: host && roomMs != null ? host.behind(roomMs) : 0,
        unplaced: flood ? flood.unplaced() : [],
        ...(host ? host.stats : {}),
      };
    },
  };
}

async function defaultFetch(url) {
  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`${url}: ${r.status}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}
