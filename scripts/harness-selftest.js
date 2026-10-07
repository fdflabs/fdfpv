/*
 * harness-selftest.js: the browser side of verify's checks 3 and 13
 * (tests/browser/harness.html and harness.js) pinned as a transcript.
 *
 *     node scripts/harness-selftest.js [--dump=<file>]   (npm run harness:selftest)
 *
 * Local, needs Chrome: run it through run-check-slot.sh. Each case serves
 * a root of its own holding the harness and what it fetches, copied from
 * this checkout, with one piece changed, and opens harness.html through
 * tests/lib/browser.js:
 *   the checkout as it is: the page's hash must equal the Node replay of
 *     the same recording, config and thresholds, and the console is clean;
 *   a replay module that reports what it was handed: which thresholds feed
 *     which option, the recording and the config text;
 *   a replay that throws a SimError, a plain Error and a bare string;
 *   each fetched file missing in turn.
 * Pinned by digest (scripts/lib/transcript.js) on the harness before its
 * rewrite.
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

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBrowserHarness } from '../tests/lib/browser.js';
import { startServer } from '../tests/lib/server.js';
import { decodeRec } from '../tests/lib/recfile.js';
import { loadSim } from '../tests/lib/simmod.js';
import { replayTrace } from '../tests/lib/replay.js';
import { transcript } from './lib/transcript.js';

const PINNED = 'fb4023c27874fee696345a43d26990afc731c6c9c1f6bdb12177aae41f31746c';
const t = transcript();
const repo = dirname(dirname(fileURLToPath(import.meta.url)));

const SERVED = [
  'tests/browser/harness.html',
  'tests/browser/harness.js',
  'tests/lib',
  'tests/thresholds.json',
  'tests/fixtures/config-baseline.diff',
  'tests/inputs/baseline.rec',
  'dist/sim.wasm',
];
const FETCHED = SERVED.filter((p) => !p.startsWith('tests/browser') && p !== 'tests/lib');

function rootWith({ drop = null, replay = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'harness-selftest-'));
  for (const rel of SERVED) {
    if (rel !== drop) {
      cpSync(join(repo, rel), join(root, rel), { recursive: true });
    }
  }
  if (replay) {
    writeFileSync(join(root, 'tests/lib/replay.js'), replay);
  }
  return root;
}

/* A stand-in for tests/lib/replay.js: the real SimError, and a replayTrace
 * that does what `body` says with what the harness hands it. */
const fakeReplay = (body) => `
import { SimError as Real } from './replay-real.js';
export const SimError = Real;
export async function replayTrace(sim, rec, opts) { ${body} }
`;

async function open(label, root) {
  if (root !== repo) {
    cpSync(join(repo, 'tests/lib/replay.js'), join(root, 'tests/lib/replay-real.js'));
  }
  const server = await startServer(root);
  try {
    const out = await runBrowserHarness(`${server.origin}/tests/browser/harness.html`, { timeoutMs: 60000 });
    const scrub = (s) => s.split(server.origin).join('ORIGIN');
    t.note(label, { result: out.result, errors: out.errors.map(scrub), warnings: out.warnings.map(scrub) });
    return out.result;
  } catch (e) {
    t.note(label, `throws ${e.message}`);
    return null;
  } finally {
    await server.close();
    if (root !== repo) {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

const th = JSON.parse(readFileSync(join(repo, 'tests/thresholds.json'), 'utf8'));
const configText = readFileSync(join(repo, 'tests/fixtures/config-baseline.diff'), 'utf8');
const rec = decodeRec(new Uint8Array(readFileSync(join(repo, 'tests/inputs/baseline.rec'))));
const nodeHash = await replayTrace(await loadSim(readFileSync(join(repo, 'dist/sim.wasm'))), rec, {
  configText,
  renderHz: th.replay.canonical_render_hz.value,
  traceStrideMs: th.replay.trace_stride_ms.value,
});

const real = await open('the checkout as it is', rootWith());
t.note('the page hash equals the Node replay', Boolean(real && real.hash === nodeHash));

await open('what replayTrace is handed', rootWith({ replay: fakeReplay(`
  return JSON.stringify({
    simHas: ['init', 'step', 'readState'].map((m) => typeof sim[m]),
    rec: { rateHz: rec.rateHz, count: rec.count, first: rec.samples[0], last: rec.samples[rec.count - 1] },
    optKeys: Object.keys(opts),
    renderHz: opts.renderHz,
    traceStrideMs: opts.traceStrideMs,
    configBytes: opts.configText.length,
    configHead: opts.configText.slice(0, 40),
  });`) }));
await open('a SimError', rootWith({ replay: fakeReplay("throw new SimError(-2, 'sim_init');") }));
await open('a SimError with another code', rootWith({ replay: fakeReplay("throw new SimError(-4, 'sim_state');") }));
await open('a plain Error', rootWith({ replay: fakeReplay("throw new Error('the plant fell over');") }));
await open('a bare string', rootWith({ replay: fakeReplay("throw 'just words';") }));
await open('null thrown', rootWith({ replay: fakeReplay('throw null;') }));
for (const rel of FETCHED) {
  await open(`${rel} missing`, rootWith({ drop: rel }));
}

t.finish('harness', PINNED);
