/*
 * verify.js: npm run verify. Runs the Stage 1 checks from STAGE1.md
 * (tests/lib/checks.js), prints one table row per check with what it
 * measured, its threshold and PASS, FAIL or SKIP, and exits 1 if any check
 * failed. A check may fail; the runner itself may not crash on it.
 *
 * SKIP exists for exactly one case and it is never quiet: check 1 cannot
 * compile Betaflight on a machine with no emcc and no vendored sources. That
 * is not a broken build, it is a machine that cannot build, and reporting
 * "build:wasm exited 1" there named the wrong fault on every run. A skipped
 * check keeps its row, prints why, and is counted apart from the passes in
 * the summary, so an unbuilt machine can never read as a green one. With a
 * compiler present the skip is unreachable and check 1 is as strict as ever.
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

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBrowserHarness } from './lib/browser.js';
import { buildChecks } from './lib/checks.js';
import { decodeRec } from './lib/recfile.js';
import { SimError, replayTrace } from './lib/replay.js';
import { startServer } from './lib/server.js';
import { loadSim } from './lib/simmod.js';
import { renderTable } from './lib/table.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WIN = process.platform === 'win32';
const BUILD_TIMEOUT_MS = 600000;
const SHOTS_TIMEOUT_MS = { 'audio-bed': 300000, 'world-scale': 600000 };
const BUILD_TAIL_LINES = 15;

/* Fixtures and configuration read once; everything the checks share. */
async function loadInputs() {
  const read = (rel, enc) => readFile(join(ROOT, rel), enc);
  return {
    th: JSON.parse(await read('tests/thresholds.json', 'utf8')),
    configA: await read('tests/fixtures/config-baseline.diff', 'utf8'),
    configB: await read('tests/fixtures/config-rates-b.diff', 'utf8'),
    rec: decodeRec(new Uint8Array(await read('tests/inputs/baseline.rec'))),
  };
}

function text(run) {
  return `${run.stdout ?? ''}${run.stderr ?? ''}`;
}

/*
 * Compile the module and probe the toolchain. The three answers check 1
 * reads are exitCode, vendorDiff and toolchainAbsent (a sentence, or '').
 *
 * On Windows npm is npm.cmd, which spawnSync cannot start without a shell,
 * and the symptom was the worst kind: a null status read as exit 1 with no
 * output at all, so check 1 said "build:wasm exited 1" and nothing else on
 * every Windows machine. The shell form takes one command string, not an
 * array, because Node's DEP0190 warns on shell plus array and the owner saw
 * that warning on his first working run. A spawn error is kept as text too,
 * so "could not start npm" is never mistaken for a failed compile.
 */
function compileModule() {
  const opts = { cwd: ROOT, encoding: 'utf8', timeout: BUILD_TIMEOUT_MS };
  const build = WIN
    ? spawnSync('npm run build:wasm', { ...opts, shell: true })
    : spawnSync('npm', ['run', 'build:wasm'], opts);
  const diff = spawnSync('git', ['diff', '--stat', '--', 'vendor/betaflight'], { cwd: ROOT, encoding: 'utf8' });
  const fault = build.error ? `verify could not run npm: ${build.error.message}\n` : '';
  return {
    exitCode: build.status ?? 1,
    output: fault + text(build),
    vendorDiff: (diff.stdout ?? '').trim(),
    toolchainAbsent: toolchainAbsent(),
  };
}

/*
 * The toolchain is probed directly, not inferred from the build's output: a
 * message is a string anyone may reword, and this answer decides between
 * "your build is broken" and "you cannot build here". Both the compiler and
 * the sources must be missing. An emsdk without the submodule, or the
 * submodule without an emsdk, is a machine set up to build that failed to.
 */
function toolchainAbsent() {
  const lookup = spawnSync(WIN ? 'where' : 'which', ['emcc'], { encoding: 'utf8' });
  const compiler = Boolean(process.env.EMSDK) || lookup.status === 0;
  const sources = existsSync(join(ROOT, 'vendor/betaflight/src/main/fc/parameter_names.h'));
  return compiler || sources ? '' : 'no emcc on PATH, EMSDK unset, and vendor/betaflight is not checked out';
}

function reportBuild(build) {
  if (build.exitCode === 0) return;
  console.log(build.toolchainAbsent
    ? `build:wasm could not run (${build.toolchainAbsent}); check 1 will SKIP:`
    : 'build:wasm output (build failed, checks will report it):');
  console.log(build.output.trim().split('\n').slice(-BUILD_TAIL_LINES).join('\n'));
  console.log('');
}

/* Run an async producer once and hand every caller the same outcome, a
 * rejection included: two checks sharing one browser run must both see the
 * one failure rather than launch a second browser. */
function once(produce) {
  let outcome;
  return () => {
    outcome ??= produce();
    return outcome;
  };
}

/*
 * Drive scripts/shots.js and collect the string each eval step returned.
 * shots.js prints `eval <expression> = <JSON string>` per step; the
 * expression may itself contain " = " (a `let g = null` inside a scene
 * walk), so the result is taken from the end of the line, never from the
 * first separator. Callers decode the strings they expect JSON in.
 */
function shots(name, steps) {
  const run = spawnSync('node', [join(ROOT, 'scripts/shots.js'), `--out=${join(ROOT, 'dist', name)}`, ...steps], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: SHOTS_TIMEOUT_MS[name],
  });
  const out = text(run);
  const results = [];
  for (const line of out.split('\n')) {
    const m = line.startsWith('eval ') ? line.match(/ = ("(?:[^"\\]|\\.)*")\s*$/) : null;
    if (m) results.push(JSON.parse(m[1]));
  }
  return { results, tail: out.trim().split('\n').slice(-3).join(' | ') };
}

/*
 * Check 14: the live audio bed through the real shell. tools/audio/render.js
 * attaches MotorAudio to an offline context of its own, so every spectral
 * claim in the project would stay true with the shell building no graph at
 * all, which is the defect that was reported as "no music". Browsers only
 * unlock audio on a real gesture and the shell wakes it from a key handler,
 * so a real key is tapped over DevTools, which shots.js already does and
 * check 13 already trusts. The window is 2.5 s of media time: the question
 * is whether the chosen mp3 is actually advancing through the page.
 */
const AUDIO_WINDOW_MS = 2500;
const AUDIO_STEPS = [
  '--w=400',
  '--h=300',
  'until:!!window.__boot && window.__boot()',
  'tap:KeyZ',
  /* The media element starting is the event, not a guess at how long a 5 MB
   * file takes to buffer off localhost. The engine is an AudioWorklet that
   * arrives asynchronously, so it is waited for as well; one that never
   * lands still reads false in the sample below. */
  'until:window.__audio && window.__audio.music && window.__audio.music.el && window.__audio.music.el.currentTime > 0.05',
  'until:window.__audio && window.__audio.engine',
  "eval:(()=>{window.__abBase = window.__audio.music.el.currentTime; window.__abT = window.__audio.ctx.currentTime; return 'ok'})()",
  `wait:${AUDIO_WINDOW_MS}`,
  'eval:JSON.stringify({' +
    "state: window.__audio.ctx ? window.__audio.ctx.state : 'none'," +
    'engineAttached: !!window.__audio.engine,' +
    'musicAttached: !!window.__audio.music.gain,' +
    'musicGain: window.__audio.music.gain ? window.__audio.music.gain.gain.value : 0,' +
    'musicAdvance: window.__audio.music.el ? window.__audio.music.el.currentTime - window.__abBase : 0,' +
    'elapsed: window.__audio.ctx.currentTime - window.__abT,' +
    'nodes: window.__audio.nodeCount()' +
    '})',
];

function audioBed() {
  const { results, tail } = shots('audio-bed', AUDIO_STEPS);
  const sample = results[results.length - 1];
  if (!sample) throw new Error(`shots.js produced no eval result: ${tail}`);
  return { ...JSON.parse(sample), windowMs: AUDIO_WINDOW_MS };
}

/*
 * Checks 15 and 16: one page run over two worlds. The Alps are the smallest
 * world left and the Swiss valley builds through their modules, so the pair
 * only works this way round: Alps first, valley second, Alps again. Every
 * URL the page requested is read while the Alps are selected and again
 * after the valley is chosen, which makes the valley's absence a measurement
 * and its arrival the proof the loader works. The Alps' budget is taken at
 * boot and again after the round trip, because a leak on the valley's way
 * out is invisible until the Alps are measured on the far side of it.
 */
const PARK_FOV = 44;
const BASE_MAP = 'alps';
const OTHER_MAP = 'swiss2';
const collectUrls = "JSON.stringify({ tag: 'urls', urls: performance.getEntriesByType('resource').map((e) => e.name) })";

/*
 * Parks the camera over the spawn and records the frame it was asked on.
 * The lens is pinned at 44 degrees, the attract camera's, because a park
 * that sets only eye and aim keeps whatever field of view the last frame
 * left: the attract camera is skipped while a harness camera is parked and a
 * world load leaves the pilot's lens behind (85 or 95 degrees), so after the
 * round trip the Alps were once measured through 85 degrees and the windsock,
 * a road car and the strip entered a frame they are outside of at 44. That
 * read as a leak (292 calls and 1611530 triangles against 282 and 1604546)
 * and was only the lens. 44 is what every boot figure was measured at.
 */
function parkStep(frameVar, tag) {
  return 'eval:JSON.stringify((() => {' +
    'const sp = window.__map().spawn;' +
    `window.__setCam(sp.x, sp.y + 1.6, sp.z, sp.x, sp.y + 1.2, sp.z - 30, ${PARK_FOV});` +
    `window.${frameVar} = window.__boot().frames;` +
    `return { tag: "${tag}" };` +
  '})())';
}

/* __setCam lands on the next animation frame and __budget renders outside
 * the frame loop, so the park is waited on by frame count, not by time. The
 * animation clock is parked in the same expression as the budget: the Alps
 * move (traffic, a gondola, a herd) and a car crossing the parked camera
 * between the two readings would be a draw call that is not a leak. */
function budgetSteps(frameVar, label, tag) {
  return [
    `until:window.__boot().frames > window.${frameVar} + 3`,
    'eval:JSON.stringify((() => {' +
      'window.__animTo(0);' +
      `const b = window.__budget("${label}");` +
      'window.__setCam(null);' +
      `return { tag: "${tag}", p1: b.p1_calls, p2: b.p2_triangles, p5: b.p5_target_MB, p10: b.p10_attribute_MB, meshes: b.meshes, cel: window.__celCount() };` +
    '})())',
  ];
}

/*
 * The craft's drawn size, in world space, from the geometry and the world
 * SCALE rather than from a world bounding box. Three lessons are built in:
 * constructor parameters are blind to a `group.scale.setScalar(2)`, so the
 * geometry's own box is multiplied by the object's world scale instead; the
 * body is measured on its own geometry because every panel carries a back
 * sided outline hull scaled 1.13 that Box3.setFromObject would include; and
 * nothing goes through an axis aligned world box, because such a box grows
 * as the object turns. A spinning prop's square box once reported anything
 * from 0.0635 to 0.0898 m for one radius, and a quad settled on a tilted
 * launch block grew its body from 0.1550 to 0.1583 m while being the right
 * size and merely banked. The prop offset is taken in the craft's frame for
 * the same reason: a tilt rotates hub height into the horizontal plane.
 */
const CRAFT_MEASURE =
  'const s = window.__mapScene();' +
  'let g = null;' +
  's.traverse((o) => { if (o.name === "craft") { g = o; } });' +
  'g.updateMatrixWorld(true);' +
  'const THREE = window.__three;' +
  'const body = g.children.find((c) => c.geometry && c.geometry.type === "BoxGeometry" && c.geometry.parameters.depth > 0.14);' +
  'body.geometry.computeBoundingBox();' +
  'const bs = new THREE.Vector3(); body.geometry.boundingBox.getSize(bs);' +
  'const bws = new THREE.Vector3(); body.getWorldScale(bws);' +
  'bs.set(bs.x * Math.abs(bws.x), bs.y * Math.abs(bws.y), bs.z * Math.abs(bws.z));' +
  'const gsc = new THREE.Vector3(); g.getWorldScale(gsc);' +
  'const gxz = Math.max(Math.abs(gsc.x), Math.abs(gsc.z));' +
  'const wsc = new THREE.Vector3();' +
  'let maxR = 0;' +
  'for (const c of g.children) {' +
    'if (!c.geometry || c.geometry.type !== "CylinderGeometry") { continue; }' +
    'const rr = c.geometry.parameters.radiusTop;' +
    'if (rr < 0.05) { continue; }' +
    'c.getWorldScale(wsc);' +
    'const at = c.position;' +
    'const d = Math.hypot(at.x, at.z) * gxz + rr * Math.max(Math.abs(wsc.x), Math.abs(wsc.z));' +
    'if (d > maxR) { maxR = d; }' +
  '}' +
  'const th = window.__craftState().thresholds;' +
  'return { bodyLength: Math.max(bs.x, bs.z), bodyWidth: Math.min(bs.x, bs.z), bodyHeight: bs.y, sweepMeasured: maxR, craftR: th.craftRadius, craftRTrue: th.craftRadiusTrue, worldScale: th.worldScale };';

function worldScaleSteps() {
  return [
    /* 1280 by 720 at the high preset: the c3c6e44 baseline this compares
     * against was measured so. P5 is render target bytes and follows the
     * panel, and headless Chrome rasterises on the CPU so boot would pick a
     * lower preset here than on a machine with a GPU. The world is named in
     * the address so the title shows it rather than its own valley, and the
     * interceptor is the aircraft the craft bands were rewritten for. */
    '--w=1280',
    '--h=720',
    '--graphics=high',
    `--url=/index.html?map=${BASE_MAP}`,
    '--airframe=interceptor',
    'until:!!window.__boot && window.__boot().frames > 2',
    `eval:${collectUrls}`,
    parkStep('__camFrame', 'budget-pending'),
    ...budgetSteps('__camFrame', `${BASE_MAP} spawn`, 'budget'),
    /* The title draws the Skyhunter whatever is seated, so the craft is only
     * in the scene during a run. Both budgets are taken on the title either
     * side of it, so they still compare like with like. */
    'eval:JSON.stringify({ tag: "fly", started: (window.__ui.onAction("fly", window.__ui.settings), true) })',
    'until:window.__craftState().mode === "flight" && window.__craft().shown === window.__craft().run',
    'eval:JSON.stringify({' +
      'tag: "craft",' +
      'map: window.__map().id,' +
      'gateScale: window.__gateScale(),' +
      `craft: (() => {${CRAFT_MEASURE}})()` +
    '})',
    'eval:JSON.stringify({ tag: "title", back: (window.__ui.act("title"), window.__ui.screen) })',
    'until:window.__craftState().mode === "title"',
    `eval:JSON.stringify({ tag: "swap", started: (window.__setMap("${OTHER_MAP}"), true) })`,
    `until:window.__map().id === "${OTHER_MAP}" && window.__map().ready`,
    'eval:JSON.stringify({ tag: "other", expectedModules: window.__map().expectedModules })',
    `eval:${collectUrls}`,
    `eval:JSON.stringify({ tag: "back", started: (window.__setMap("${BASE_MAP}"), true) })`,
    `until:window.__map().id === "${BASE_MAP}" && window.__map().ready`,
    parkStep('__camFrame2', 'budget2-pending'),
    ...budgetSteps('__camFrame2', `${BASE_MAP} spawn after round trip`, 'budget2'),
  ];
}

function worldScale() {
  const run = shots('world-scale', worldScaleSteps());
  const results = run.results.map((v) => JSON.parse(v));
  /* By tag, never by position: a step that fails silently would shift every
   * later result by one and the check would report a confident wrong number. */
  const tagged = (tag) => results.find((v) => v.tag === tag);
  const urls = results.filter((v) => v.tag === 'urls');
  const craft = tagged('craft');
  const other = tagged('other');
  if (urls.length < 2 || !craft || !other) {
    throw new Error(`world-scale run produced tags [${results.map((v) => v.tag).join(', ')}]: ${run.tail}`);
  }
  const ofOther = (u) => u.includes(`/src/maps/${OTHER_MAP}`);
  return {
    craft: craft.craft,
    gateScale: craft.gateScale ?? null,
    otherExpectedModules: other.expectedModules ?? null,
    baseBudget: tagged('budget'),
    baseBudgetAfterRoundTrip: tagged('budget2'),
    otherUrlsWhileBaseSelected: urls[0].urls.filter(ofOther),
    otherUrlsAfterChoosing: urls[1].urls.filter(ofOther),
  };
}

async function harnessPage() {
  const server = await startServer(ROOT);
  try {
    return await runBrowserHarness(`${server.origin}/tests/browser/harness.html`);
  } finally {
    await server.close();
  }
}

/* What every check in tests/lib/checks.js receives. The shared runs are
 * produced once and handed to every check that asks. */
function checkContext(inputs, build) {
  const { th, rec, configA } = inputs;
  const wasm = once(async () => new Uint8Array(await readFile(join(ROOT, 'dist/sim.wasm'))));
  const canonicalOpts = () => ({
    configText: configA,
    renderHz: th.replay.canonical_render_hz.value,
    traceStrideMs: th.replay.trace_stride_ms.value,
  });
  const freshSim = async () => loadSim(await wasm());
  return {
    ...inputs,
    build,
    canonicalOpts,
    freshSim,
    nodeCanonicalHash: once(async () => replayTrace(await freshSim(), rec, canonicalOpts())),
    audioBedRun: once(async () => audioBed()),
    scaleRun: once(async () => worldScale()),
    browserRun: once(harnessPage),
  };
}

/* A check that throws still gets a row. A SimError names the ABI call that
 * refused; anything else is the harness's own fault and says so. */
async function outcome(check, ctx) {
  try {
    return await check.run(ctx);
  } catch (e) {
    if (e instanceof SimError) {
      return { measured: `${e.where} -> ${e.errorName}`, pass: false, reason: e.errorName };
    }
    return { measured: 'n/a', pass: false, reason: `harness-error: ${e.message}` };
  }
}

function verdict(r) {
  if (r.skipped) return { result: 'SKIP', reason: r.skipped };
  return { result: r.pass ? 'PASS' : 'FAIL', reason: r.reason ?? '' };
}

async function main() {
  const inputs = await loadInputs();
  const { rec } = inputs;
  console.log('npm run verify: Stage 1 checks from STAGE1.md');
  console.log(`baseline: ${rec.count} samples at ${rec.rateHz} Hz, ${(rec.count / rec.rateHz).toFixed(1)} s\n`);

  const build = compileModule();
  reportBuild(build);
  const ctx = checkContext(inputs, build);

  const rows = [];
  const tally = { PASS: 0, FAIL: 0, SKIP: 0 };
  for (const check of buildChecks()) {
    const r = await outcome(check, ctx);
    const { result, reason } = verdict(r);
    tally[result] += 1;
    rows.push([check.num, check.id, r.measured, check.thresholdText, result, reason]);
  }

  console.log(renderTable(['#', 'check', 'measured', 'threshold', 'result', 'reason'], rows));
  const ran = rows.length - tally.SKIP;
  console.log(`\n${tally.PASS} of ${ran} checks passing`);
  /* Always its own line: folded into the count, an unbuilt machine would
   * read as a clean run. */
  if (tally.SKIP > 0) {
    console.log(`${tally.SKIP} check(s) COULD NOT RUN on this machine, see the SKIP rows above`);
  }
  process.exit(tally.FAIL === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`verify: fatal: ${e.stack ?? e}`);
  process.exit(2);
});
