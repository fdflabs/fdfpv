/*
 * wing-harness.js: the wing's scripted flight in a browser, for the
 * cross-host check. Loads the module, puts it on the wing, flies the
 * script in tests/lib/wingpilot.js and hands the trace hash back through
 * window.__simHarnessResolve, the way harness.js does for the quad.
 * ?plane=bramor replays the Bramor's recording off its catapult instead,
 * and ?plane=bramor-chute its descent under the canopy; with no query it
 * is the wing's, exactly as it always was. The other aircraft's
 * recordings left with them on 2026-10-20.
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

import { loadSim } from '../lib/simmod.js';
import { replayTrace } from '../lib/replay.js';
import { decodeRec } from '../lib/recfile.js';
import { bramorChutePrelude, bramorPrelude, wingPrelude } from '../lib/wingpilot.js';

const PLANES = {
  wing: { rec: '/tests/inputs/wing-baseline.rec', prelude: wingPrelude },
  bramor: { rec: '/tests/inputs/bramor-baseline.rec', prelude: bramorPrelude },
  'bramor-chute': { rec: '/tests/inputs/bramor-chute.rec', prelude: bramorChutePrelude },
};

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function run() {
  const th = JSON.parse(await (await fetch('/tests/thresholds.json')).text());
  const configText = await (await fetch('/tests/fixtures/config-baseline.diff')).text();
  const plane = PLANES[new URLSearchParams(window.location.search).get('plane') || 'wing'];
  if (!plane) {
    throw new Error(`unknown plane ${window.location.search}`);
  }
  const rec = decodeRec(await fetchBytes(plane.rec));
  const sim = await loadSim(await fetchBytes('/dist/sim.wasm'));
  const hash = await replayTrace(sim, rec, {
    configText,
    renderHz: th.replay.canonical_render_hz.value,
    traceStrideMs: th.replay.trace_stride_ms.value,
    prelude: plane.prelude,
  });
  return { ok: true, hash };
}

run()
  .then((result) => {
    window.__simHarnessResolve(result);
  })
  .catch((e) => {
    window.__simHarnessResolve({ ok: false, errorName: 'harness-error', message: String(e && e.message ? e.message : e) });
  });
