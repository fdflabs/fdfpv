/*
 * crash-identity.js: the bit identity proof for crash physics.
 *
 * The rule (docs/CRASH-STAGE1.md, src/native/sim_abi.h at sim_set_damage):
 * a flight whose contacts stay under every damage limit is bit identical to
 * the same flight before crash physics existed. This runs every existing
 * gate and self test that reads dist/sim.wasm three times, each time with a
 * different module in dist/sim.wasm, and compares what each prints, byte for
 * byte, exit code included:
 *
 *   base  the module at --base (a git ref, default origin/main), the one
 *         before crash physics
 *   off   this tree's module, crash physics off (its default)
 *   on    this tree's module built with SIM_DAMAGE_DEFAULT=1, so crash
 *         physics is on in every run whatever the script asks for
 *
 * The gates print their measurements to the digit and the recorded flights'
 * SHA-256 digests, so identical output is identical traces. A difference is
 * reported with its first differing line; under "on" a difference means a
 * gate's flight crossed a damage limit, and the doc names each one.
 *
 * dist/sim.wasm is restored to this tree's module at the end whatever
 * happens, and the script checks that it was.
 *
 * Run: node scripts/crash-identity.js [--base=<ref>] [--only=name,...]
 * FDFPV_BOARD, when set, is passed to wing:e2e.
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

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const baseRef = arg('base', 'origin/main');
const only = arg('only', '');

/* Every script that loads dist/sim.wasm and flies or checks the plant. */
const RUNS = [
  ['wing:gates', 'scripts/wing-gates.js'],
  ['skyhunter:gates', 'scripts/skyhunter-gates.js'],
  ['cub:gates', 'scripts/cub-gates.js'],
  ['glider:gates', 'scripts/glider-gates.js'],
  ['bramor:gates', 'scripts/bramor-gates.js'],
  ['slowstick:gates', 'scripts/slowstick-gates.js'],
  ['timber:gates', 'scripts/timber-gates.js'],
  ['bombshell:gates', 'scripts/bombshell-gates.js'],
  ['floats:gates', 'scripts/floats-gates.js'],
  ['whoop:gates', 'scripts/whoop-gates.js'],
  ['wing:contact', 'scripts/wing-contact-selftest.js'],
  ['contact:selftest', 'scripts/contact-selftest.js'],
  ['wing:math', 'scripts/wing-math-selftest.js'],
  ['wing:stab', 'scripts/wing-stab-selftest.js'],
  ['skyhunter:stab', 'scripts/skyhunter-stab-selftest.js'],
  ['cub:stab', 'scripts/cub-stab-selftest.js'],
  ['glider:stab', 'scripts/glider-stab-selftest.js'],
  ['bramor:stab', 'scripts/bramor-stab-selftest.js'],
  ['slowstick:stab', 'scripts/slowstick-stab-selftest.js'],
  ['timber:stab', 'scripts/timber-stab-selftest.js'],
  ['bombshell:stab', 'scripts/bombshell-stab-selftest.js'],
  ['waves:selftest', 'scripts/waves-selftest.js'],
  ['score:selftest', 'scripts/score-selftest.js'],
  ['lint:presets', 'scripts/preset-lint.js'],
  ['lint:fc', 'scripts/fc-trace.js'],
  ['wing:e2e', 'scripts/wing-e2e.js'],
].filter(([name]) => !only || only.split(',').includes(name));

const scratch = join(root, 'build', 'identity');
mkdirSync(scratch, { recursive: true });
const dist = join(root, 'dist', 'sim.wasm');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const mod = { off: join(scratch, 'off.wasm'), on: join(scratch, 'on.wasm'), base: join(scratch, 'base.wasm') };
copyFileSync(dist, mod.off);
const offSha = sha(mod.off);

const show = spawnSync('git', ['show', `${baseRef}:dist/sim.wasm`], { cwd: root, maxBuffer: 1 << 28 });
if (show.status !== 0) {
  throw new Error(`git show ${baseRef}:dist/sim.wasm failed: ${show.stderr}`);
}
writeFileSync(mod.base, show.stdout);

function build(extra) {
  const r = spawnSync('npm', ['run', 'build:wasm'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, SIM_EXTRA_CFLAGS: extra },
  });
  if (r.status !== 0) {
    throw new Error(`build failed:\n${r.stdout}\n${r.stderr}`);
  }
}

function runAll(label) {
  const out = {};
  for (const [name, script] of RUNS) {
    const r = spawnSync('node', [script], {
      cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 1800000,
      env: { ...process.env },
    });
    out[name] = { code: r.status, text: `${r.stdout}${r.stderr}` };
    writeFileSync(join(scratch, `${name.replace(':', '-')}.${label}.txt`), out[name].text);
    process.stdout.write(`  ${label.padEnd(4)} ${name.padEnd(18)} exit ${r.status}\n`);
  }
  return out;
}

function firstDiff(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}: base "${(la[i] ?? '').trim()}" vs "${(lb[i] ?? '').trim()}"`;
    }
  }
  return '';
}

const results = {};
try {
  build('-DSIM_DAMAGE_DEFAULT=1');
  copyFileSync(dist, mod.on);
  for (const label of ['base', 'off', 'on']) {
    copyFileSync(mod[label], dist);
    console.log(`${label}: dist/sim.wasm ${sha(dist).slice(0, 16)}`);
    results[label] = runAll(label);
  }
} finally {
  copyFileSync(mod.off, dist);
}
if (sha(dist) !== offSha) {
  throw new Error('dist/sim.wasm was not restored');
}

console.log('\nscript              exit base/off/on   off == base   on == base');
let bad = 0;
for (const [name] of RUNS) {
  const b = results.base[name];
  const o = results.off[name];
  const n = results.on[name];
  const offSame = b.code === o.code && b.text === o.text;
  const onSame = b.code === n.code && b.text === n.text;
  if (!offSame) {
    bad += 1;
  }
  console.log(`${name.padEnd(19)} ${String(b.code).padStart(2)}/${String(o.code).padStart(2)}/${String(n.code).padStart(2)}`
    + `          ${offSame ? 'identical' : 'DIFFERS  '}     ${onSame ? 'identical' : 'differs'}`);
  if (!offSame) {
    console.log(`    off: ${firstDiff(b.text, o.text)}`);
  }
  if (!onSame) {
    console.log(`    on:  ${firstDiff(b.text, n.text)}`);
  }
}
console.log(`\ndist/sim.wasm restored to ${offSha.slice(0, 16)}; outputs in build/identity/`);
if (bad > 0) {
  process.exitCode = 1;
}
