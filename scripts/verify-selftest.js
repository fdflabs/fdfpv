/*
 * verify-selftest.js: pin what tests/verify.js (npm run verify) does, as seen
 * from outside it, without the expensive parts. Plain Node, no browser, no
 * Emscripten. Run with npm run verify:selftest.
 *
 * verify.js is a child process here, started with a PATH that holds nothing
 * but fakes: npm, git, which, a chrome binary and a node shim that answers
 * for scripts/shots.js and hands every other script to the real node. Each
 * fake appends its argv to a log and answers from the scenario it was given,
 * so one transcript holds the printed report, the exit code and the exact
 * argv every child was started with. That argv is the contract verify.js
 * keeps with shots.js and the browser harness, and the printed text is the
 * one people read. The Node checks (2 and 4 to 12) run for real against the
 * tracked dist/sim.wasm; they are deterministic by the project's own rule.
 *
 * Not reachable from here, and said so: exit 0 (checks 3 and 13 need a real
 * DevTools session), exit 2 (only an unreadable fixture reaches it) and a
 * thrown SimError (needs sim_init to refuse the fixture config). The one
 * SKIP path, no emcc and no vendored sources, depends on a file this script
 * cannot move (vendor/betaflight/src/main/fc/parameter_names.h), so its
 * scenario is pinned on its own and asserted only where that file is absent.
 * The digests were recorded from the code this file was written to hold
 * still; see scripts/lib/transcript.js for how to read a failure.
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
import { appendFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { transcript } from './lib/transcript.js';

const self = fileURLToPath(import.meta.url);
const root = dirname(dirname(self));

/* What a healthy page reports to the two shots.js runs, in the shape the
 * checks read (tests/lib/checks.js 14 to 16). */
const AUDIO_GOOD = { state: 'running', engineAttached: true, musicAttached: true, musicGain: 0.1, musicAdvance: 2.41, elapsed: 2.5, nodes: 41 };
const AUDIO_BAD = { state: 'suspended', engineAttached: false, musicAttached: true, musicGain: 0.01, musicAdvance: 0, elapsed: 2.5, nodes: 70 };
const SWISS = (n) => Array.from({ length: n }, (_, i) => `http://127.0.0.1:1/src/maps/swiss2/part${i}.js`);
const ALPS = ['http://127.0.0.1:1/src/maps/alps.js', 'http://127.0.0.1:1/src/main.js'];
const BUDGET = { p1: 282, p2: 1604546, p5: 31.2, p10: 32.1, meshes: 169, cel: 12 };
const CRAFT = { bodyLength: 0.16, bodyWidth: 0.05, bodyHeight: 0.02, sweepMeasured: 0.2451, craftR: 0.2451, craftRTrue: 0.2451, worldScale: 1 };
const SCALE_GOOD = {
  urls: [ALPS, ALPS.concat(SWISS(49))],
  budget: BUDGET,
  budget2: BUDGET,
  craft: { craft: CRAFT, gateScale: 1.15 },
  other: { expectedModules: 49 },
};
const SCALE_BAD = {
  urls: [ALPS.concat(SWISS(1)), ALPS.concat(SWISS(40))],
  budget: BUDGET,
  budget2: { ...BUDGET, p1: 290, p5: 31.4, cel: 14 },
  craft: { craft: { ...CRAFT, bodyLength: 0.18, sweepMeasured: 0.2470 }, gateScale: 1.2 },
  other: { expectedModules: 48 },
};
/* The world-scale run with its craft and other tags missing, the shape a
 * step that failed silently leaves behind. */
const SCALE_TAGLESS = { urls: SCALE_GOOD.urls, budget: BUDGET, budget2: BUDGET };

const LONG_BUILD_OUTPUT = Array.from({ length: 20 }, (_, i) => `build line ${i + 1} of 20`).join('\n');

const SCENARIOS = {
  'skip-toolchain': {
    which: 1, npm: { exit: 1, out: 'sh: 1: emcc: not found\n' }, git: '', chrome: 7, audio: AUDIO_GOOD, scale: SCALE_GOOD,
    onlyWithoutSources: true,
  },
  'build-fails-long': {
    which: 0, npm: { exit: 1, out: `${LONG_BUILD_OUTPUT}\n` }, git: '', chrome: 7, audio: AUDIO_GOOD, scale: SCALE_GOOD,
  },
  'vendor-dirty': {
    which: 0, npm: { exit: 0, out: '> build:wasm\nemcc ok\n' }, git: ' vendor/betaflight/src/main/fc/fc_core.c | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n',
    chrome: 7, audio: AUDIO_BAD, scale: SCALE_BAD,
  },
  'npm-missing': {
    which: 0, npm: null, git: '', chrome: 7, audio: null, scale: SCALE_TAGLESS,
  },
  'clean-build': {
    which: 1, emsdk: '/nowhere/emsdk', npm: { exit: 0, out: '> build:wasm\nemcc ok\n' }, git: '', chrome: 0, audio: AUDIO_GOOD, scale: SCALE_GOOD,
  },
};

/* Two digests: the SKIP scenario is pinned apart because it is only
 * reachable where the vendored sources are absent (see the top). */
const PINNED_CORE = '242dd230f1d6fde624e923704476439ea207da43f96508886e55ff6209b1dc87';
const PINNED_SKIP = '546adafc1fa60b06910b4ff49e092bfb4c5a2d5525588d759c0a3d9fe85d17be';

function log(role, argv) {
  appendFileSync(process.env.VERIFY_SELFTEST_LOG, `${role}\t${argv.join('\t')}\n`);
}

/* The fake shots.js: echoes each eval step the way the real one prints a
 * result (`eval <expr> = <JSON string>`), answering from the scenario by the
 * tag the expression carries. */
function fakeShots(scenario, argv) {
  console.log(`fake shots ${argv.filter((a) => a.startsWith('--')).join(' ')}`);
  const isAudio = argv.some((a) => a.endsWith('/audio-bed'));
  const answers = isAudio ? scenario.audio : scenario.scale;
  let urlsSeen = 0;
  if (!answers) {
    console.log('shots: no DevTools endpoint: fake chrome');
    return 3;
  }
  for (const step of argv) {
    if (!step.startsWith('eval:')) continue;
    const expr = step.slice(5);
    let value;
    if (isAudio) {
      value = expr.includes('state:') ? JSON.stringify(answers) : 'ok';
    } else {
      const tag = expr.match(/tag: ['"]([\w-]+)['"]/)?.[1];
      let obj = null;
      if (tag === 'urls') {
        obj = { tag, urls: answers.urls[Math.min(urlsSeen, answers.urls.length - 1)] };
        urlsSeen += 1;
      } else if (tag in answers) {
        obj = { tag, ...answers[tag] };
      } else if (tag === 'budget' || tag === 'budget2' || tag === 'craft' || tag === 'other') {
        continue;
      } else {
        obj = { tag, started: true };
      }
      value = JSON.stringify(obj);
    }
    console.log(`eval ${expr} = ${JSON.stringify(value)}`);
  }
  return 0;
}

function runAs(role, argv) {
  const scenario = SCENARIOS[process.env.VERIFY_SELFTEST_SCENARIO];
  log(role, argv);
  if (role === 'npm') {
    process.stdout.write(scenario.npm.out);
    return scenario.npm.exit;
  }
  if (role === 'git') {
    process.stdout.write(scenario.git);
    return 0;
  }
  if (role === 'which') return scenario.which;
  if (role === 'chrome') {
    if (scenario.chrome !== 0) process.stderr.write('fake chrome\n');
    return scenario.chrome;
  }
  if (role === 'shots') return fakeShots(scenario, argv);
  throw new Error(`unknown role ${role}`);
}

const asRole = process.argv.indexOf('--as');
if (asRole !== -1) {
  process.exitCode = runAs(process.argv[asRole + 1], process.argv.slice(asRole + 2));
} else {
  main();
}

function makeFakes(dir, name) {
  const shim = (role) => `#!/bin/sh\nexec "$REAL_NODE" "${self}" --as ${role} "$@"\n`;
  const fakes = { git: shim('git'), which: shim('which'), chrome: shim('chrome') };
  if (SCENARIOS[name].npm) fakes.npm = shim('npm');
  /* Only scripts/shots.js is answered for; verify.js itself and anything
   * else it starts run on the real node. */
  fakes.node = '#!/bin/sh\ncase "$1" in\n  */scripts/shots.js) exec "$REAL_NODE" "' + self + '" --as shots "$@";;\nesac\nexec "$REAL_NODE" "$@"\n';
  for (const [file, text] of Object.entries(fakes)) {
    writeFileSync(join(dir, file), text, { mode: 0o755 });
  }
}

/* Paths that differ per machine or per run, masked before the digest. The
 * report table is padded to its widest cell, and a reason that names the
 * root is as wide as the checkout's path, so the table's padding and its
 * rule of dashes are collapsed too: the alignment itself is table.js's
 * pin (table:selftest), what is pinned here is the text. */
function mask(text) {
  return text
    .split(root).join('<root>')
    .replace(/--user-data-dir=\S*sim-chrome-\S+/g, '--user-data-dir=<tmp>/sim-chrome-<rand>')
    .replace(/ {2,}\|/g, ' |')
    .replace(/-{3,}/g, '---');
}

function runScenario(name) {
  const work = mkdtempSync(join(tmpdir(), 'verify-selftest-'));
  try {
    const bin = join(work, 'bin');
    mkdirSync(bin);
    makeFakes(bin, name);
    const logFile = join(work, 'log');
    writeFileSync(logFile, '');
    const env = {
      PATH: bin,
      HOME: process.env.HOME ?? work,
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
      REAL_NODE: process.execPath,
      SIM_CHROME_BIN: join(bin, 'chrome'),
      EMSDK: SCENARIOS[name].emsdk ?? '',
      VERIFY_SELFTEST_SCENARIO: name,
      VERIFY_SELFTEST_LOG: logFile,
    };
    const run = spawnSync(process.execPath, [join(root, 'tests/verify.js')], {
      cwd: root, env, encoding: 'utf8', timeout: 300000,
    });
    return {
      exit: run.status,
      stdout: mask(run.stdout ?? ''),
      stderr: mask(run.stderr ?? ''),
      log: mask(readFileSync(logFile, 'utf8')),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function main() {
  const sourcesPresent = existsSync(join(root, 'vendor/betaflight/src/main/fc/parameter_names.h'));
  const core = transcript();
  const skip = transcript();
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const t = scenario.onlyWithoutSources ? skip : core;
    if (scenario.onlyWithoutSources && sourcesPresent) {
      console.log(`skip  tests/verify.js ${name}: vendor/betaflight is checked out here, so check 1 cannot SKIP; not asserted`);
      continue;
    }
    const r = runScenario(name);
    t.note(`${name} exit`, r.exit);
    t.note(`${name} stdout`, r.stdout);
    t.note(`${name} stderr`, r.stderr);
    t.note(`${name} children`, r.log);
  }
  core.finish('tests/verify.js', PINNED_CORE);
  if (sourcesPresent) return;
  /* A second --dump target, so one run leaves both transcripts behind. */
  const dump = process.argv.findIndex((a) => a.startsWith('--dump='));
  if (dump !== -1) process.argv[dump] += '.skip';
  skip.finish('tests/verify.js skip-toolchain', PINNED_SKIP);
}
