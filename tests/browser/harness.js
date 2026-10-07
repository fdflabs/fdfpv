/*
 * harness.js: the browser half of verify's replay checks. Fetches the
 * same recording, config and thresholds the Node runner reads, replays
 * them through the shared modules, and settles the promise harness.html
 * made: { ok: true, hash } on success, the sim's error by code, name and
 * call on a SimError, and anything else as a harness-error with its
 * message. It prints nothing: check 13 fails on any console output.
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

import { decodeRec } from '../lib/recfile.js';
import { loadSim } from '../lib/simmod.js';
import { SimError, replayTrace } from '../lib/replay.js';

/* A served file, read as `as` ('text' or 'arrayBuffer'). A missing file is
 * a failure with its path and status, not a page that half runs. */
async function served(path, as) {
  const reply = await fetch(path);
  if (!reply.ok) {
    throw new Error(`fetch ${path}: ${reply.status}`);
  }
  return reply[as]();
}

async function replayBaseline() {
  const thresholds = JSON.parse(await served('/tests/thresholds.json', 'text'));
  const configText = await served('/tests/fixtures/config-baseline.diff', 'text');
  const recording = decodeRec(new Uint8Array(await served('/tests/inputs/baseline.rec', 'arrayBuffer')));
  const sim = await loadSim(new Uint8Array(await served('/dist/sim.wasm', 'arrayBuffer')));
  const { canonical_render_hz: renderHz, trace_stride_ms: strideMs } = thresholds.replay;
  return replayTrace(sim, recording, {
    configText,
    renderHz: renderHz.value,
    traceStrideMs: strideMs.value,
  });
}

function verdictFor(failure) {
  if (failure instanceof SimError) {
    const { code, errorName, where } = failure;
    return { ok: false, code, errorName, where };
  }
  const message = failure && failure.message ? failure.message : failure;
  return { ok: false, errorName: 'harness-error', message: String(message) };
}

replayBaseline().then(
  (hash) => window.__simHarnessResolve({ ok: true, hash }),
  (failure) => window.__simHarnessResolve(verdictFor(failure)),
);
