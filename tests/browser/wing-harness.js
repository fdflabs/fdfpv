/*
 * wing-harness.js: the wing's scripted flight in a browser, for the
 * cross-host check. Loads the module, puts it on the wing, flies the
 * script in tests/lib/wingpilot.js and hands the trace hash back through
 * window.__simHarnessResolve, the way harness.js does for the quad.
 * ?plane=sky replays the Skyhunter's recording on its airframe instead,
 * ?plane=cub the Cub's, from standing on its wheels, ?plane=glider the
 * Radian's, thrown at 80 m short of a thermal, ?plane=slowstick the
 * Slow Stick's, from standing on its wheels, and ?plane=timber the
 * Timber's, from standing on its wheels with half flaps, and
 * ?plane=timberf the Timber on floats', floating on a light swell, and
 * ?plane=bombshell the Buzzard Bombshell's, from standing on its wheels and
 * skid, ?plane=p51 and ?plane=p51-air the P-51's take off and its
 * retracts in the air, ?plane=kadet the Kadet Senior's, from standing on
 * its three wheels, ?plane=edge the Edge 540's, from standing on its three
 * wheels, ?plane=extra the Extra 300's, from standing on its wheels,
 * through a hover and a torque roll, ?plane=uglystik the Ugly Stik's,
 * from standing on its three wheels, ?plane=dlg the NRJ's, thrown by its
 * wingtip from the grass into a thermal, and ?plane=f16 the F-16's, from
 * standing on its three wheels with its fan stopped; with no query it
 * is the wing's, exactly as it always was.
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

import { loadSim } from '../lib/simmod.js';
import { replayTrace } from '../lib/replay.js';
import { decodeRec } from '../lib/recfile.js';
import {
  bombshellGroundPrelude, bramorChutePrelude, bramorPrelude, cubGroundPrelude, dlgRecPrelude, edgeGroundPrelude, extraGroundPrelude, f16GroundPrelude, gliderRecPrelude, kadetGroundPrelude, p51AirPrelude, p51RecPrelude, skyPrelude, uglystikGroundPrelude,
  slowstickGroundPrelude,
  timberFloatRecPrelude, timberRecPrelude, wingPrelude,
} from '../lib/wingpilot.js';

const PLANES = {
  wing: { rec: '/tests/inputs/wing-baseline.rec', prelude: wingPrelude },
  sky: { rec: '/tests/inputs/sky-baseline.rec', prelude: skyPrelude },
  cub: { rec: '/tests/inputs/cub-baseline.rec', prelude: (sim) => cubGroundPrelude(sim) },
  glider: { rec: '/tests/inputs/glider-baseline.rec', prelude: gliderRecPrelude },
  bramor: { rec: '/tests/inputs/bramor-baseline.rec', prelude: bramorPrelude },
  'bramor-chute': { rec: '/tests/inputs/bramor-chute.rec', prelude: bramorChutePrelude },
  slowstick: { rec: '/tests/inputs/slowstick-baseline.rec', prelude: (sim) => slowstickGroundPrelude(sim) },
  timber: { rec: '/tests/inputs/timber-baseline.rec', prelude: timberRecPrelude },
  timberf: { rec: '/tests/inputs/timberf-baseline.rec', prelude: timberFloatRecPrelude },
  bombshell: { rec: '/tests/inputs/bombshell-baseline.rec', prelude: (sim) => bombshellGroundPrelude(sim) },
  kadet: { rec: '/tests/inputs/kadet-baseline.rec', prelude: (sim) => kadetGroundPrelude(sim) },
  edge: { rec: '/tests/inputs/edge-baseline.rec', prelude: (sim) => edgeGroundPrelude(sim) },
  extra: { rec: '/tests/inputs/extra-baseline.rec', prelude: (sim) => extraGroundPrelude(sim) },
  uglystik: { rec: '/tests/inputs/uglystik-baseline.rec', prelude: (sim) => uglystikGroundPrelude(sim) },
  dlg: { rec: '/tests/inputs/dlg-baseline.rec', prelude: dlgRecPrelude },
  f16: { rec: '/tests/inputs/f16-baseline.rec', prelude: (sim) => f16GroundPrelude(sim) },
  p51: { rec: '/tests/inputs/p51-baseline.rec', prelude: p51RecPrelude },
  'p51-air': { rec: '/tests/inputs/p51-air.rec', prelude: p51AirPrelude },
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
