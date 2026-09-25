/*
 * replay-page.js: the page side of the crash suite's cross-host check.
 *
 * window.__crashReplay(programJson) loads a fresh module, replays the
 * program scripts/crash-suite.js recorded in Node and returns the trace
 * hash. A fresh module per program, as in Node, because the airframe and
 * the water are modes that survive a reset.
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
import { replayProgram } from './program.js';

const ready = (async () => {
  const [wasm, configText] = await Promise.all([
    fetch('/dist/sim.wasm').then((r) => r.arrayBuffer()),
    fetch('/tests/fixtures/config-baseline.diff').then((r) => r.text()),
  ]);
  return { wasm: new Uint8Array(wasm), configText };
})();

window.__crashReplay = async (programJson) => {
  const { wasm, configText } = await ready;
  const sim = await loadSim(wasm);
  return replayProgram(sim, configText, JSON.parse(programJson));
};
window.__crashReady = ready.then(() => true);
