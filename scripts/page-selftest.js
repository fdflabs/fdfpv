/*
 * page-selftest.js: pin tests/lib/page.js, the headless Chromium page driver
 * every browser check opens the shell through. Run with
 * npm run page:selftest.
 *
 * Two halves. The plain Node half runs everywhere, CI included: keyInfo for
 * every key a check taps, describe over the remote object shapes CDP hands
 * back, and the module's export list, against a pinned transcript (see
 * scripts/lib/transcript.js for how to read a failure). The browser half,
 * --browser, needs a Chromium and stays local: it opens
 * tests/fixtures/page-selftest.html through openPage and asserts what the
 * handle does, from the flags Chrome was started with to the pid being gone
 * after close.
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
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canon, transcript } from './lib/transcript.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* The cache directory is read when the module loads, and a signed in page
 * is the default whenever SIM_ACCOUNT=1 is in the environment; both are
 * settled here, before the import, so the run is the same on every box. */
const cache = await mkdtemp(join(tmpdir(), 'page-selftest-cdn-'));
process.env.SIM_CDN_CACHE = cache;
delete process.env.SIM_ACCOUNT;
const P = await import('../tests/lib/page.js');

const KEYS = [
  'Enter', 'Escape', 'Space', 'Tab', 'Backspace', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown',
  'Home', 'End', 'PageUp', 'PageDown', 'F1', 'F2', 'F3', 'F8', 'BracketLeft', 'BracketRight',
  'KeyA', 'KeyC', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyM', 'KeyO',
  'KeyP', 'KeyR', 'KeyT', 'KeyU', 'KeyV', 'KeyY', 'KeyZ', 'Digit0', 'Digit6', 'Digit9',
  /* Keys a check taps that the table has no virtual key code for: pinned
   * as they are, so a rewrite does not quietly start sending one. */
  'ShiftLeft', 'Period', 'Delete', 'Backquote', 'F4', 'NumpadEnter',
  '', 'key', 'Key', 'Keya', 'KeyAA', 'Digit10', 'Digit', 'space', 'ENTER',
];

const OBJECTS = [
  null, undefined, 0, '', false,
  { type: 'string', value: 'plain text' },
  { type: 'string', value: '' },
  { type: 'string', description: 'ignored', value: 'value wins' },
  { type: 'number', value: 1, description: '1' },
  { type: 'number', value: 0 },
  { type: 'number', value: -0 },
  { type: 'boolean', value: false },
  { type: 'object', subtype: 'null', value: null },
  { type: 'object', subtype: 'array', description: 'Array(2)', objectId: '7' },
  { type: 'object', className: 'Error', description: 'Error: boom\n    at <anonymous>:1:7', objectId: '8' },
  { type: 'object', value: { a: [1, 'two', null], b: { c: true } } },
  { type: 'object', value: [1, 2, 3] },
  { type: 'undefined' },
  { description: '' },
  {},
  { value: 'bare value' },
  { objectId: '9' },
];

function pure() {
  const t = transcript();
  t.note('exports', Object.keys(P).sort());
  t.note('Cdp is a class', typeof P.Cdp === 'function' && /^class\b/.test(Function.prototype.toString.call(P.Cdp)));
  for (const code of KEYS) t.rec(`keyInfo ${canon(code)}`, () => P.keyInfo(code));
  for (const obj of OBJECTS) t.rec(`describe ${canon(obj)}`, () => P.describe(obj));
  t.finish('tests/lib/page.js', '17257c90c12d715966edf7de9fc032261e944117c0ad7cbd0ef52fab447542c6');
}

let failures = 0;
function check(ok, what, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function rejects(promise) {
  try {
    await promise;
    return null;
  } catch (e) {
    return e.message;
  }
}

const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== 'ESRCH';
  }
};

/* PNG: the IHDR chunk follows the 8 byte signature and 8 bytes of chunk
 * length and type, so the size sits at bytes 16 to 24, big endian. */
function pngSize(b64) {
  const b = Buffer.from(b64, 'base64');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const CDN_URL = 'https://cdn.jsdelivr.net/npm/page-selftest@1.0.0/mod.js';
const OVERRIDE_PATH = '/tests/fixtures/page-selftest-override.js';

async function browser() {
  console.log('browser half');
  /* The cache's layout on disk is the contract export-selftest.js and the
   * shots share: SIM_CDN_CACHE or <tmp>/fdfpv-cdn, one file per URL named
   * by the first 32 hex digits of the URL's sha256. Seeded here, the page
   * gets its "CDN" module with no network at all. */
  await mkdir(cache, { recursive: true });
  const cdnFile = join(cache, createHash('sha256').update(CDN_URL).digest('hex').slice(0, 32));
  await writeFile(cdnFile, "window.__cdn = 'from cache'; export const v = 7;\n");

  const exitListeners = process.listenerCount('exit');
  const width = 640;
  const height = 360;
  const page = await P.openPage({
    root,
    width,
    height,
    url: '/tests/fixtures/page-selftest.html',
    seed: ["window.__seeds = ['first'];", "window.__seeds.push('second');"],
    args: ['--page-selftest-marker'],
    override: { [OVERRIDE_PATH]: 'export const w = 42;\n' },
  });

  console.log('1. the handle');
  check(['cdp', 'sessionId', 'errors', 'warnings', 'origin', 'proc', 'accounts', 'account',
    'evaluate', 'until', 'loaded', 'click', 'tap', 'sleep', 'close', 'clicks']
    .every((k) => k in page), 'handle carries every documented member');
  check(/^http:\/\/127\.0\.0\.1:\d+$/.test(page.origin), 'origin is a loopback http server', page.origin);
  const served = await fetch(`${page.origin}/package.json`);
  check(served.status === 200 && (await served.json()).scripts['page:selftest'], 'the server serves the repo root');
  check(page.accounts === null && page.account === null, 'no accounts server and no account without the option');
  check(typeof page.sessionId === 'string' && page.sessionId.length > 0, 'sessionId is a CDP session');
  check(page.cdp instanceof P.Cdp, 'cdp is a Cdp');
  check(process.listenerCount('exit') === exitListeners + 1, 'one exit hook while the page is open');

  console.log('2. the Chrome process');
  /* Chrome rewrites its own command line into one string, so the split is
   * on whitespace as well as the NULs the kernel wrote. */
  const argv = (await readFile(`/proc/${page.proc.pid}/cmdline`, 'utf8')).split(/[\0\s]+/);
  const has = (flag) => argv.includes(flag);
  for (const flag of ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1',
    `--window-size=${width},${height}`, '--remote-debugging-port=0', '--page-selftest-marker', 'about:blank']) {
    check(has(flag), `started with ${flag}`);
  }
  const gpu = process.env.SIM_GPU === '1';
  check(gpu ? has('--use-angle=gl') && has('--ignore-gpu-blocklist') && has('--enable-gpu')
    : has('--use-angle=swiftshader') && has('--enable-unsafe-swiftshader'),
  gpu ? 'SIM_GPU=1: the machine GPU' : 'no SIM_GPU: SwiftShader');
  const profile = argv.find((a) => a.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
  check(profile && existsSync(profile) && /sim-page-/.test(profile), 'a sim-page- profile of its own', profile);
  check(argv.indexOf('--page-selftest-marker') > argv.indexOf('--remote-debugging-port=0'), 'caller args come after the defaults');

  console.log('3. evaluate');
  check(await page.evaluate('1 + 2') === 3, 'a value comes back');
  check(await page.evaluate("Promise.resolve('settled')") === 'settled', 'a promise is awaited');
  check(JSON.stringify(await page.evaluate('({ a: [1, "two", null], b: { c: true } })')) === '{"a":[1,"two",null],"b":{"c":true}}', 'an object comes back by value');
  check(await page.evaluate('undefined') === undefined, 'undefined comes back as undefined');
  const thrown = await rejects(page.evaluate("(() => { throw new Error('bad expression'); })()"));
  check(thrown?.startsWith('evaluate threw: Error: bad expression'), 'a throw rejects with the error', thrown);
  const rejected = await rejects(page.evaluate("Promise.reject(new Error('later'))"));
  check(rejected?.startsWith('evaluate threw: Error: later'), 'a rejected promise rejects', rejected);

  console.log('4. the page as the seeds and metrics left it');
  const seen = await page.evaluate('window.__seen');
  check(JSON.stringify(seen.seeds) === '["first","second"]', 'seeds ran in order before the page script', JSON.stringify(seen.seeds));
  check(seen.pads === 0, 'no gamepad is visible to the page');
  const metrics = await page.evaluate('[innerWidth, innerHeight, devicePixelRatio, navigator.maxTouchPoints]');
  check(metrics.join() === `${width},${height},1,0`, 'viewport is the requested size at scale 1, no touch', metrics.join());
  await page.until('window.__later');
  check(true, 'until returns once the expression is truthy');
  const late = await rejects(page.until('window.__never', 300));
  check(late === 'timed out waiting for: window.__never', 'until times out with the expression', late);
  const t0 = Date.now();
  await page.sleep(120);
  check(Date.now() - t0 >= 110, 'sleep waits the milliseconds');
  await page.loaded();
  check(true, 'loaded resolves on the hidden loader');

  console.log('5. keys');
  await page.tap('KeyR');
  await page.tap('Enter');
  await page.tap('ArrowDown');
  const keys = (await page.evaluate('window.__seen.keys')).map((k) => `${k.type}:${k.code}:${k.key}:${k.keyCode}`);
  check(keys.join(' ') === 'keydown:KeyR:r:82 keyup:KeyR:r:82 keydown:Enter:Enter:13 keyup:Enter:Enter:13 keydown:ArrowDown:ArrowDown:40 keyup:ArrowDown:ArrowDown:40',
    'tap sends keydown then keyup with code, key and keyCode', keys.join(' '));

  console.log('6. clicks');
  check(page.clicks === 0, 'no clicks yet');
  check(await page.click('#nothing-here') === false && page.clicks === 0, 'a missing selector is false and not counted');
  check(await page.click('#target') === true && page.clicks === 1, 'a hit is true and counted');
  const mouse = (await page.evaluate('window.__seen.mouse')).map((m) => `${m.type}@${m.x},${m.y}/${m.button}`);
  check(mouse.join(' ') === 'mousedown@225,115/0 mouseup@225,115/0 click@225,115/0', 'left button down, up and click at the element centre', mouse.join(' '));

  console.log('7. the console and page errors');
  await page.evaluate("console.error('x', 1, { a: 1 }); console.assert(false, 'nope'); console.warn('careful'); console.log('quiet'); console.info('also quiet')");
  await page.evaluate("setTimeout(() => { throw new Error('boom'); }, 0)");
  await page.evaluate("fetch('/no/such/file').then((r) => r.status)");
  /* The console calls are synchronous, so their events precede evaluate's
   * answer; the timer and the fetch land in whichever order Chrome reports
   * them, so those two are looked up rather than indexed. */
  await page.sleep(500);
  check(page.errors[0] === 'console.error: x 1 Object', 'console.error with every argument described', page.errors[0]);
  check(page.errors[1] === 'console.assert: nope', 'console.assert', page.errors[1]);
  check(page.errors.some((e) => e.startsWith('uncaught: Error: boom')), 'an uncaught error', page.errors.join(' | '));
  check(page.errors.some((e) => e.startsWith('network: Failed to load resource') && e.includes('404')), 'a failed resource from the log', page.errors.join(' | '));
  check(page.errors.length === 4, 'nothing else counted as an error', page.errors.join(' | '));
  check(page.warnings.join('|') === 'console.warning: careful', 'console.warn is a warning', page.warnings.join('|'));

  console.log('8. the CDN cache and the override');
  check(await page.evaluate(`import(${JSON.stringify(CDN_URL)}).then((m) => m.v + ' ' + window.__cdn)`) === '7 from cache', 'a jsdelivr import is served from the cache file');
  check(await page.evaluate(`import(${JSON.stringify(OVERRIDE_PATH)}).then((m) => m.w)`) === 42, 'an overridden path is served from the option');
  const miss = await fetch(`${page.origin}${OVERRIDE_PATH}`);
  check(miss.status === 404, 'the override is not on the server, so it was the interception', String(miss.status));
  check(page.errors.length === 4, 'neither import added an error', page.errors.slice(4).join(' | '));

  console.log('9. a screenshot over the session');
  const shot = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const size = pngSize(shot.data);
  check(size.width === width && size.height === height, 'the screenshot is the viewport size', `${size.width}x${size.height}`);

  console.log('10. close');
  const { pid } = page.proc;
  await page.close();
  check(!pidAlive(pid), 'the Chrome pid is gone');
  check(!existsSync(profile), 'the profile directory is gone');
  check(await rejects(fetch(`${page.origin}/package.json`)) !== null, 'the server is closed');
  check(process.listenerCount('exit') === exitListeners, 'the exit hook is removed');

  console.log('11. a touch page');
  const touch = await P.openPage({ root, width: 320, height: 240, url: '/tests/fixtures/page-selftest.html', touch: true });
  const tm = await touch.evaluate('[innerWidth, innerHeight, navigator.maxTouchPoints]');
  check(tm.join() === '320,240,5', 'touch: true emulates five touch points', tm.join());
  check(touch.errors.length === 0 && touch.warnings.length === 0, 'the fixture loads clean', touch.errors.concat(touch.warnings).join(' | '));
  await touch.close();
}

pure();
if (process.argv.includes('--browser')) {
  try {
    await browser();
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
  if (failures) {
    console.log(`FAIL  ${failures} browser assertion(s) failed`);
    process.exit(1);
  }
  console.log('ok  page.js browser half');
} else {
  await rm(cache, { recursive: true, force: true });
}
