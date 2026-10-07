/*
 * browser-selftest.js: the headless Chrome harness runner
 * (tests/lib/browser.js) pinned as a transcript.
 *
 *     node scripts/browser-selftest.js [--dump=<file>]   (npm run browser:selftest)
 *
 * Local, needs Chrome: run it through run-check.sh. findChrome is driven
 * with SIM_CHROME_BIN set to a file, to a missing path and unset.
 * runBrowserHarness opens the pages under tests/fixtures/browser-harness
 * through tests/lib/server.js: one that logs on every channel and
 * resolves, one whose result appears late, one that rejects, one that
 * never defines a result and one that never settles, and records the
 * result, the errors and warnings in order, or the message thrown, and
 * that every sim-chrome-* profile left in the temp folder was reported
 * (a busy host can hold one past the retries). Pinned by
 * digest (scripts/lib/transcript.js) on the runner before its rewrite.
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

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findChrome, runBrowserHarness } from '../tests/lib/browser.js';
import { startServer } from '../tests/lib/server.js';
import { transcript } from './lib/transcript.js';

const PINNED = 'c851aa1f9752d07b418d06760efd7a4672b19dd0aa8bc95a426effc0eb0b704e';
const t = transcript();
const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* findChrome reads the environment when the module loads, so the three
 * spellings are probed in child processes. */
import { spawnSync } from 'node:child_process';
const probe = (env) => spawnSync(process.execPath, ['--input-type=module', '-e',
  'import { findChrome } from "./tests/lib/browser.js"; console.log(JSON.stringify(findChrome()));'],
{ cwd: root, env, encoding: 'utf8' }).stdout.trim();
const fakeDir = mkdtempSync(join(tmpdir(), 'browser-selftest-'));
const fakeChrome = join(fakeDir, 'chrome');
writeFileSync(fakeChrome, '');
const { SIM_CHROME_BIN, ...noBin } = process.env;
t.note('SIM_CHROME_BIN set to a file wins', probe({ ...noBin, SIM_CHROME_BIN: fakeChrome }) === JSON.stringify(fakeChrome));
t.note('SIM_CHROME_BIN set to a missing file falls through', probe({ ...noBin, SIM_CHROME_BIN: join(fakeDir, 'none') }) === probe(noBin));
const found = findChrome();
t.note('a chrome was found here', typeof found === 'string');

/* Chrome profiles are counted in a temp folder of this run's own, so a
 * neighbouring check's profiles never count. os.tmpdir() reads TMPDIR on
 * every call. */
process.env.TMPDIR = mkdtempSync(join(tmpdir(), 'browser-selftest-tmp-'));
const profiles = () => readdirSync(tmpdir()).filter((n) => n.startsWith('sim-chrome-')).length;
const before = profiles();
/* Under load Chrome's helpers can hold a profile past every retry; then the
 * runner warns rather than leaking silently. So the pin is: every profile
 * left behind was reported, which holds whether or not the host is busy. */
let reported = 0;
const warn = console.warn;
console.warn = (...args) => {
  if (/^browser harness: profile .* not removed/.test(String(args[0]))) {
    reported += 1;
  } else {
    warn(...args);
  }
};

/* Chrome's own log lines carry paths and ports, so a message is pinned on
 * its shape, not its text. */
const shape = (s) => s
  .replace(/http:\/\/127\.0\.0\.1:\d+/g, 'ORIGIN')
  .replace(/\s+at .*$/gm, '')
  .split('\n')[0];

const server = await startServer(root);
const page = (name) => `${server.origin}/tests/fixtures/browser-harness/${name}.html`;
async function run(label, name, opts) {
  let out;
  try {
    const r = await runBrowserHarness(page(name), opts);
    out = { result: r.result, errors: r.errors.map(shape), warnings: r.warnings.map(shape) };
  } catch (e) {
    /* The evaluation failure carries Chrome's exception details, whose ids
     * change between runs: only its text is pinned. */
    const failed = e.message.match(/^(browser harness evaluation failed: )(\{.*\})$/s);
    const message = failed ? failed[1] + JSON.parse(failed[2]).text : e.message;
    out = `throws ${e.constructor.name}: ${shape(message)}`;
  }
  t.note(label, out);
  t.note(`${label}: every profile left behind was reported`, profiles() - before === reported);
}
try {
  await run('a page that logs and resolves', 'resolves');
  await run('a result that appears late', 'late', { timeoutMs: 10000 });
  await run('a result that rejects', 'rejects');
  await run('a page with no result, timeoutMs 2000', 'never', { timeoutMs: 2000 });
  await run('a result that never settles, timeoutMs 2000', 'hangs', { timeoutMs: 2000 });
  await run('a page the server has not got', 'missing', { timeoutMs: 2000 });
} finally {
  await server.close();
  rmSync(fakeDir, { recursive: true, force: true });
  rmSync(process.env.TMPDIR, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}

t.finish('browser.js', PINNED);
