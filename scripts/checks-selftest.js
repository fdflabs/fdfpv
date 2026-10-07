/*
 * checks-selftest.js: the Stage 1 verification checks (tests/lib/checks.js)
 * pinned as a transcript.
 *
 *     node scripts/checks-selftest.js [--dump=<file>]   (npm run checks:selftest)
 *
 * Every check takes only the ctx verify.js builds, so this builds its own:
 * the real dist/sim.wasm, tests/thresholds.json, the two fixture diffs and
 * tests/inputs/baseline.rec for the checks that drive the sim (1, 2, 4 to
 * 12), and stand ins for the build, the browser harness, the audio bed and
 * the world scale run that checks 1, 3 and 13 to 16 read, each fed every
 * answer that reaches a different measured string or reason. A fake sim
 * whose state block is chosen by hand reaches the degenerate branches of
 * the sim checks (no hover trim, no RPM, no rotation, the drift band) and
 * the SimError the runner reports by name. The measured values of the real
 * sim are floats from a deterministic module, so they are pinned bit for
 * bit through their printed form.
 *
 * The transcript lives at tests/fixtures/checks-transcript.txt so a
 * failing digest diffs as text; --dump writes the current one.
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

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { transcript } from './lib/transcript.js';
import { decodeRec } from '../tests/lib/recfile.js';
import { loadSim } from '../tests/lib/simmod.js';
import * as replay from '../tests/lib/replay.js';
import * as checks from '../tests/lib/checks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(root, 'tests/fixtures/checks-transcript.txt');

const th = JSON.parse(readFileSync(join(root, 'tests/thresholds.json'), 'utf8'));
const configA = readFileSync(join(root, 'tests/fixtures/config-baseline.diff'), 'utf8');
const configB = readFileSync(join(root, 'tests/fixtures/config-rates-b.diff'), 'utf8');
const rec = decodeRec(new Uint8Array(readFileSync(join(root, 'tests/inputs/baseline.rec'))));
const wasm = new Uint8Array(readFileSync(join(root, 'dist/sim.wasm')));

const t = transcript();
const list = checks.buildChecks();
const byId = new Map(list.map((c) => [c.id, c]));

t.note('exports', Object.keys(checks).sort());
t.note('SimError is replay.js SimError', checks.SimError === replay.SimError);
t.note('check count', list.length);
for (const c of list) {
  t.note(`descriptor ${c.id}`, {
    keys: Object.keys(c).sort(),
    num: c.num,
    thresholdText: c.thresholdText,
    runLength: c.run.length,
  });
}

for (const [label, text] of [
  ['config-baseline.diff', configA],
  ['config-rates-b.diff', configB],
  ['no roll_srate line', 'set pitch_srate = 67\nset yaw_srate = 70\n'],
  ['empty', ''],
  ['CRLF', 'set roll_srate = 55\r\nset pitch_srate = 67\r\n'],
  ['trailing spaces', 'set roll_srate = 42   \n'],
  ['two lines, first wins', 'set roll_srate = 10\nset roll_srate = 20\n'],
  ['indented', '  set roll_srate = 10\n'],
  ['commented', '# set roll_srate = 10\n'],
]) {
  t.rec(`parseRollSrate ${label}`, () => checks.parseRollSrate(text));
}

/*
 * A sim whose every call succeeds and whose state block is a constant
 * vector, except where a field is a function of how many times the block
 * has been read. Enough to steer each check into its degenerate branch.
 */
function fakeSim({ abi = 1, initCode = 0, state = {}, bytes = [1] } = {}) {
  let reads = 0;
  const block = () => {
    reads += 1;
    const s = new Float64Array(20);
    for (const [k, v] of Object.entries(state)) {
      s[replay.ST[k]] = typeof v === 'function' ? v(reads) : v;
    }
    return s;
  };
  return {
    abiVersion: () => abi,
    init: () => initCode,
    reset: () => 0,
    setCellVoltage: () => 0,
    input: () => 0,
    step: () => 0,
    motorOverride: () => 0,
    readState: () => ({ code: 0, state: block() }),
    readStateBytes: () => ({ code: 0, bytes: Uint8Array.from(bytes) }),
  };
}

const canonicalOpts = () => ({
  configText: configA,
  renderHz: th.replay.canonical_render_hz.value,
  traceStrideMs: th.replay.trace_stride_ms.value,
});
const realSim = () => loadSim(wasm);
let nodeHash = null;
const nodeCanonicalHash = async () => {
  if (nodeHash === null) {
    nodeHash = await replay.replayTrace(await realSim(), rec, canonicalOpts());
  }
  return nodeHash;
};

const GOOD_BUILD = { exitCode: 0, vendorDiff: '', toolchainAbsent: '' };

function ctx(over = {}) {
  return {
    th,
    root,
    rec,
    configA,
    configB,
    build: GOOD_BUILD,
    canonicalOpts,
    freshSim: realSim,
    nodeCanonicalHash,
    browserRun: async () => { throw new Error('browserRun not stubbed'); },
    audioBedRun: async () => { throw new Error('audioBedRun not stubbed'); },
    scaleRun: async () => { throw new Error('scaleRun not stubbed'); },
    ...over,
  };
}

/* What verify.js reads off a result, or off what the run threw. */
async function run(label, id, over) {
  const started = Date.now();
  let out;
  try {
    const r = await byId.get(id).run(ctx(over));
    out = {
      keys: Object.keys(r).sort(),
      measured: r.measured,
      pass: r.pass,
      reason: r.reason,
      skipped: r.skipped,
    };
  } catch (e) {
    out = {
      threw: e.constructor.name,
      simError: e instanceof replay.SimError,
      where: e.where,
      errorName: e.errorName,
      code: e.code,
      message: e.message,
    };
  }
  t.note(`${id} ${label}`, out);
  return Date.now() - started;
}

/* The real sim over the real fixtures: the measured strings verify prints. */
const timing = [];
for (const id of [
  'build-clean', 'determinism-repeat', 'frame-independence', 'hover-throttle', 'punch-out',
  'terminal-velocity', 'motor-step-response', 'rate-tracking', 'yaw-coupling', 'battery-sag',
  'diff-passthrough',
]) {
  timing.push([id, await run('real sim', id)]);
}

/* Check 1 off the build it is handed. */
await run('toolchain absent', 'build-clean', {
  build: { exitCode: 1, vendorDiff: '', toolchainAbsent: 'no emcc on PATH, EMSDK unset, and vendor/betaflight is not checked out' },
});
await run('build exited 2', 'build-clean', { build: { ...GOOD_BUILD, exitCode: 2 } });
await run('vendor dirty', 'build-clean', { build: { ...GOOD_BUILD, vendorDiff: ' src/main/fc/core.c | 2 +-' } });
await run('build exited 1 and vendor dirty', 'build-clean', { build: { exitCode: 1, vendorDiff: 'x', toolchainAbsent: '' } });
await run('abi 2', 'build-clean', { freshSim: async () => fakeSim({ abi: 2 }) });
await run('init CONFIG_PARSE', 'build-clean', { freshSim: async () => fakeSim({ initCode: -4 }) });
await run('init NOT_IMPLEMENTED', 'build-clean', { freshSim: async () => fakeSim({ initCode: -1 }) });
await run('real sim, garbage diff', 'build-clean', { configA: 'this is not a betaflight diff\n' });

/* The SimError the runner names, from a sim that refuses to init. */
for (const id of ['determinism-repeat', 'hover-throttle', 'rate-tracking']) {
  await run('sim refuses init', id, { freshSim: async () => fakeSim({ initCode: -1 }) });
}
await run('sim refuses init', 'frame-independence', { freshSim: async () => fakeSim({ initCode: -3 }) });

/* Hashes off fake state blocks: identical per instance, or distinct. */
let instance = 0;
await run('fake sim, constant trace', 'determinism-repeat', { freshSim: async () => fakeSim({ bytes: [7, 7] }) });
await run('fake sim, trace differs per instance', 'determinism-repeat', {
  freshSim: async () => fakeSim({ bytes: [instance += 1] }),
});
await run('fake sim, constant trace', 'frame-independence', { freshSim: async () => fakeSim({ bytes: [7, 7] }) });
await run('fake sim, trace differs per instance', 'frame-independence', {
  freshSim: async () => fakeSim({ bytes: [instance += 1] }),
});

/* Check 3 off the node hash and what the browser answered. */
const node = await nodeCanonicalHash();
await run('same hash', 'determinism-cross-host', { browserRun: async () => ({ result: { ok: true, hash: node } }) });
await run('different hash', 'determinism-cross-host', { browserRun: async () => ({ result: { ok: true, hash: 'deadbeefdeadbeefdeadbeef' } }) });
await run('no result', 'determinism-cross-host', { browserRun: async () => ({ result: null }) });
await run('not ok with a name', 'determinism-cross-host', { browserRun: async () => ({ result: { ok: false, errorName: 'CONFIG_PARSE' } }) });
await run('not ok without a name', 'determinism-cross-host', { browserRun: async () => ({ result: { ok: false } }) });
await run('ok with no hash', 'determinism-cross-host', { browserRun: async () => ({ result: { ok: true } }) });

/* The degenerate branches of the sim checks, off a hand built state. */
const sinking = async () => fakeSim({ state: { VZ: -1 } });
const still = async () => fakeSim();
await run('always sinking', 'hover-throttle', { freshSim: sinking });
await run('always climbing', 'hover-throttle', { freshSim: async () => fakeSim({ state: { VZ: 1 } }) });
await run('never settles', 'hover-throttle', { freshSim: async () => fakeSim({ state: { VZ: (n) => (n % 2 ? 0.1 : -0.1) } }) });
await run('always sinking', 'punch-out', { freshSim: sinking });
await run('still, no climb', 'punch-out', { freshSim: still });
await run('still', 'terminal-velocity', { freshSim: still });
await run('motor never spins', 'motor-step-response', { freshSim: still });
await run('motor at speed at once', 'motor-step-response', { freshSim: async () => fakeSim({ state: { RPM0: 1000 } }) });
await run('motor ramps 10 rpm a read', 'motor-step-response', { freshSim: async () => fakeSim({ state: { RPM0: (n) => Math.min(n * 10, 1000) } }) });
await run('no rotation', 'rate-tracking', { freshSim: still });
await run('rolls at 10 rad/s', 'rate-tracking', { freshSim: async () => fakeSim({ state: { P: 10 } }) });
await run('no roll_srate in config A', 'rate-tracking', { configA: 'set pitch_srate = 67\n' });
await run('no yaw', 'yaw-coupling', { freshSim: still });
await run('yaws hard', 'yaw-coupling', { freshSim: async () => fakeSim({ state: { R: -1 } }) });
await run('yaws the wrong way', 'yaw-coupling', { freshSim: async () => fakeSim({ state: { R: 0.002 } }) });
await run('yaws in band', 'yaw-coupling', { freshSim: async () => fakeSim({ state: { R: -0.002 } }) });
await run('always sinking', 'battery-sag', { freshSim: sinking });
await run('hovers, no RPM', 'battery-sag', { freshSim: still });
await run('hovers, same RPM at both voltages', 'battery-sag', { freshSim: async () => fakeSim({ state: { RPM2: 20000 } }) });
await run('no rotation', 'diff-passthrough', { freshSim: still });
await run('identical fixtures', 'diff-passthrough', { configB: configA });
await run('no roll_srate in config B', 'diff-passthrough', { configB: 'set pitch_srate = 84\n' });
await run('same roll rate for both configs', 'diff-passthrough', { freshSim: async () => fakeSim({ state: { P: 3 } }) });

/* Check 13 off the harness answer. */
const harness = (over) => async () => ({ errors: [], warnings: [], result: { ok: true }, ...over });
await run('clean', 'console-clean', { browserRun: harness() });
await run('one error', 'console-clean', { browserRun: harness({ errors: ['TypeError: x is undefined'] }) });
await run('two warnings', 'console-clean', { browserRun: harness({ warnings: ['deprecated', 'slow'] }) });
await run('error and warning', 'console-clean', { browserRun: harness({ errors: ['e'], warnings: ['w'] }) });
await run('run not ok with a name', 'console-clean', { browserRun: harness({ result: { ok: false, errorName: 'BAD_STATE' } }) });
await run('run not ok without a name', 'console-clean', { browserRun: harness({ result: { ok: false } }) });
await run('no result', 'console-clean', { browserRun: harness({ result: null }) });
await run('no result and an error', 'console-clean', { browserRun: harness({ result: null, errors: ['boom'] }) });

/* Check 14 off the audio bed reading. */
const bed = (over) => async () => ({
  state: 'running', engineAttached: true, musicAttached: true, musicGain: 0.1, musicAdvance: 2.41, elapsed: 2.5, nodes: 41, ...over,
});
await run('live', 'audio-bed', { audioBedRun: bed() });
await run('context suspended', 'audio-bed', { audioBedRun: bed({ state: 'suspended' }) });
await run('engine missing', 'audio-bed', { audioBedRun: bed({ engineAttached: false }) });
await run('music graph missing', 'audio-bed', { audioBedRun: bed({ musicAttached: false }) });
await run('gain at floor', 'audio-bed', { audioBedRun: bed({ musicGain: 0.05 }) });
await run('gain under floor', 'audio-bed', { audioBedRun: bed({ musicGain: 0.04999 }) });
await run('media stalled', 'audio-bed', { audioBedRun: bed({ musicAdvance: 0 }) });
await run('media advance as text', 'audio-bed', { audioBedRun: bed({ musicAdvance: '1.5' }) });
await run('no nodes', 'audio-bed', { audioBedRun: bed({ nodes: 0 }) });
await run('nodes at budget', 'audio-bed', { audioBedRun: bed({ nodes: 64 }) });
await run('nodes over budget', 'audio-bed', { audioBedRun: bed({ nodes: 65 }) });
await run('everything wrong', 'audio-bed', {
  audioBedRun: bed({ state: 'closed', engineAttached: false, musicAttached: false, musicGain: 0, musicAdvance: 0, nodes: 0 }),
});

/* Checks 15 and 16 off the world scale run. */
const craft = (over) => ({ bodyLength: 0.16, bodyWidth: 0.05, bodyHeight: 0.03, sweepMeasured: 0.2451, craftR: 0.2451, craftRTrue: 0.2451, worldScale: 1, ...over });
const urls = (n) => Array.from({ length: n }, (_, i) => `http://127.0.0.1:1/src/maps/swiss2/m${i}.js`);
const budget = (over) => ({ p1: 282, p2: 1604546, p5: 31.64, p10: 20.11, meshes: 169, cel: 12, ...over });
const scale = (over) => async () => ({
  craft: craft(),
  gateScale: 1.15,
  otherExpectedModules: 49,
  baseBudget: budget(),
  baseBudgetAfterRoundTrip: budget(),
  otherUrlsWhileBaseSelected: [],
  otherUrlsAfterChoosing: urls(49),
  ...over,
});
const withCraft = (over) => scale({ craft: craft(over) });
await run('in band', 'world-scale', { scaleRun: scale() });
await run('no world scale', 'world-scale', { scaleRun: withCraft({ worldScale: undefined }) });
await run('world scale zero', 'world-scale', { scaleRun: withCraft({ worldScale: 0 }) });
await run('world scale 1.25, craft drawn to it', 'world-scale', {
  scaleRun: withCraft({ worldScale: 1.25, bodyLength: 0.128, sweepMeasured: 0.19608, craftR: 0.19608, craftRTrue: 0.2451 }),
});
await run('body long', 'world-scale', { scaleRun: withCraft({ bodyLength: 0.2 }) });
await run('body short', 'world-scale', { scaleRun: withCraft({ bodyLength: 0.1 }) });
await run('body missing', 'world-scale', { scaleRun: withCraft({ bodyLength: undefined }) });
await run('sweep wide, true agrees', 'world-scale', { scaleRun: withCraft({ sweepMeasured: 0.3, craftR: 0.3, craftRTrue: 0.3 }) });
await run('sweep off the true radius', 'world-scale', { scaleRun: withCraft({ sweepMeasured: 0.25, craftR: 0.25 }) });
await run('collision radius 2 mm off', 'world-scale', { scaleRun: withCraft({ craftR: 0.2471 }) });
await run('collision radius 0.4 mm off', 'world-scale', { scaleRun: withCraft({ craftR: 0.2455 }) });
await run('no gate scale', 'world-scale', { scaleRun: scale({ gateScale: null }) });
await run('gate scale 1.2', 'world-scale', { scaleRun: scale({ gateScale: 1.2 }) });
await run('everything wrong', 'world-scale', {
  scaleRun: scale({ craft: craft({ worldScale: undefined, bodyLength: 0.3, sweepMeasured: 0.4, craftR: 0.1, craftRTrue: 0.2 }), gateScale: null }),
});

await run('isolated and held', 'map-isolation', { scaleRun: scale() });
await run('valley fetched early', 'map-isolation', { scaleRun: scale({ otherUrlsWhileBaseSelected: urls(2) }) });
await run('valley graph short', 'map-isolation', { scaleRun: scale({ otherUrlsAfterChoosing: urls(10), otherExpectedModules: 10 }) });
await run('valley graph at floor', 'map-isolation', { scaleRun: scale({ otherUrlsAfterChoosing: urls(45), otherExpectedModules: 45 }) });
await run('no module count', 'map-isolation', { scaleRun: scale({ otherExpectedModules: null }) });
await run('module count stale', 'map-isolation', { scaleRun: scale({ otherExpectedModules: 50 }) });
await run('no boot budget', 'map-isolation', { scaleRun: scale({ baseBudget: null }) });
await run('no round trip budget', 'map-isolation', { scaleRun: scale({ baseBudgetAfterRoundTrip: undefined }) });
await run('no budget at all', 'map-isolation', { scaleRun: scale({ baseBudget: null, baseBudgetAfterRoundTrip: null }) });
await run('draw calls grew', 'map-isolation', { scaleRun: scale({ baseBudgetAfterRoundTrip: budget({ p1: 283 }) }) });
await run('triangles shrank', 'map-isolation', { scaleRun: scale({ baseBudgetAfterRoundTrip: budget({ p2: 1604545 }) }) });
await run('target MB within tolerance', 'map-isolation', { scaleRun: scale({ baseBudgetAfterRoundTrip: budget({ p5: 31.68 }) }) });
await run('target MB over tolerance', 'map-isolation', { scaleRun: scale({ baseBudgetAfterRoundTrip: budget({ p5: 31.7 }) }) });
await run('attribute MB over tolerance', 'map-isolation', { scaleRun: scale({ baseBudgetAfterRoundTrip: budget({ p10: 20.2 }) }) });
await run('meshes grew', 'map-isolation', { scaleRun: scale({ baseBudgetAfterRoundTrip: budget({ meshes: 170 }) }) });
await run('cel clock grew', 'map-isolation', { scaleRun: scale({ baseBudgetAfterRoundTrip: budget({ cel: 13 }) }) });
await run('cel clock shrank', 'map-isolation', { scaleRun: scale({ baseBudgetAfterRoundTrip: budget({ cel: 11 }) }) });
await run('everything wrong', 'map-isolation', {
  scaleRun: scale({
    otherUrlsWhileBaseSelected: urls(1), otherUrlsAfterChoosing: urls(3), otherExpectedModules: 4,
    baseBudgetAfterRoundTrip: budget({ p1: 1, p2: 2, p5: 3, p10: 4, meshes: 5, cel: 99 }),
  }),
});

/* The stand ins verify.js hands over when a run cannot be read at all. */
await run('run throws', 'audio-bed', { audioBedRun: async () => { throw new Error('shots.js produced no eval result'); } });
await run('run throws', 'world-scale', {});
await run('run throws', 'determinism-cross-host', {});

for (const [id, ms] of timing) {
  console.log(`  ${id} ${(ms / 1000).toFixed(1)} s`);
}
const pinned = existsSync(FIXTURE)
  ? createHash('sha256').update(readFileSync(FIXTURE)).digest('hex')
  : 'no fixture at tests/fixtures/checks-transcript.txt';
t.finish('checks.js', pinned);
