/*
 * page.js: a headless Chromium tab with the shell in it, driven over the
 * DevTools protocol. Every browser check (scripts/shell-check.js, shots,
 * the two-page room checks, the goldens) opens the shell through openPage
 * and drives the handle it returns; this is the one place that knows how
 * Chrome is started, how the repo is served to it, and how a key press is
 * made to look real.
 *
 * Four things every caller needs and none should write: a Chromium started
 * headless with a software rasteriser and a profile of its own; the console
 * and page errors collected as they arrive; the Three.js CDN answered from a
 * cache on disk, because a container's Chromium has no proxy and a check that
 * refetched a megabyte per run is a check nobody runs; and stored settings
 * seeded through the same door the pilot uses, before the app's first line.
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

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findChrome } from './browser.js';
import { startServer } from './server.js';

/* One file per URL, named by the first 32 hex digits of the URL's sha256.
 * scripts/export-selftest.js reads the same directory, so the name rule is
 * a contract and not a detail. */
const CDN_CACHE = process.env.SIM_CDN_CACHE || join(tmpdir(), 'fdfpv-cdn');
const CDN_HOST = 'https://cdn.jsdelivr.net/*';

const cacheFile = (url) => join(CDN_CACHE, createHash('sha256').update(url).digest('hex').slice(0, 32));

async function fetchThroughCache(url) {
  const file = cacheFile(url);
  if (existsSync(file)) {
    return readFile(file);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`cdn fetch ${url}: ${res.status}`);
  }
  const body = Buffer.from(await res.arrayBuffer());
  await mkdir(CDN_CACHE, { recursive: true });
  await writeFile(file, body);
  return body;
}

/* Windows virtual key codes for the named keys a check taps. A key event
 * with no code is one the page's key handlers see but never match. */
const NAMED_KEY_CODES = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, Space: 32,
  PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  F1: 112, F2: 113, F3: 114, F8: 119,
  BracketLeft: 219, BracketRight: 221,
};

/* Keys that type a character carry it as `text`; the rest carry none. */
const NAMED_KEY_TEXT = { Enter: '\r', Tab: '\t', Space: ' ' };

/* The fields Input.dispatchKeyEvent wants for a KeyboardEvent.code. */
export function keyInfo(code) {
  const letter = code.match(/^Key([A-Z])$/);
  if (letter) {
    const ch = letter[1].toLowerCase();
    return { key: ch, code, windowsVirtualKeyCode: letter[1].charCodeAt(0), text: ch };
  }
  const digit = code.match(/^Digit([0-9])$/);
  if (digit) {
    return { key: digit[1], code, windowsVirtualKeyCode: digit[1].charCodeAt(0), text: digit[1] };
  }
  return {
    key: code === 'Space' ? ' ' : code,
    code,
    windowsVirtualKeyCode: NAMED_KEY_CODES[code] ?? 0,
    text: NAMED_KEY_TEXT[code],
  };
}

/* A Runtime.RemoteObject as one line of text, for a console line or an
 * error message. Strings are themselves; everything else is Chrome's own
 * description when it gave one, else its value as JSON. */
export function describe(remote) {
  if (!remote) {
    return 'unknown';
  }
  if (remote.type === 'string') {
    return remote.value;
  }
  return remote.description ?? JSON.stringify(remote.value ?? remote);
}

/*
 * The DevTools protocol over one websocket: numbered requests matched to
 * their replies, and every unsolicited message handed to the subscribers.
 * Once the socket drops, every call in flight and every later one rejects
 * with the same error, so a check fails where it is instead of hanging.
 */
export class Cdp {
  #socket;
  #calls = new Map();
  #subscribers = [];
  #serial = 0;
  #gone = null;

  constructor(ws) {
    this.#socket = ws;
    ws.addEventListener('message', (ev) => this.#receive(ev.data));
    ws.addEventListener('close', () => this.#drop(new Error('Chrome closed the DevTools connection')));
    ws.addEventListener('error', () => this.#drop(new Error('DevTools connection errored')));
  }

  #receive(data) {
    const msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    const call = msg.id && this.#calls.get(msg.id);
    if (call) {
      this.#calls.delete(msg.id);
      if (msg.error) {
        call.reject(new Error(`CDP ${msg.method ?? ''} ${msg.error.message}`));
      } else {
        call.resolve(msg.result);
      }
      return;
    }
    if (msg.method) {
      for (const fn of this.#subscribers) {
        fn(msg);
      }
    }
  }

  #drop(err) {
    if (this.#gone) {
      return;
    }
    this.#gone = err;
    for (const call of this.#calls.values()) {
      call.reject(err);
    }
    this.#calls.clear();
  }

  send(method, params = {}, sessionId) {
    if (this.#gone) {
      return Promise.reject(this.#gone);
    }
    this.#serial += 1;
    const id = this.#serial;
    const request = sessionId ? { id, method, params, sessionId } : { id, method, params };
    return new Promise((resolve, reject) => {
      this.#calls.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify(request));
    });
  }

  onEvent(fn) {
    this.#subscribers.push(fn);
  }
}

/* SIM_GPU=1 draws on this machine's GPU, for the checks that time frames
 * (a CPU rasteriser's frame time says nothing about a GPU's, and its threads
 * fight the page's main thread for cores). Everything else gets the
 * software rasteriser every machine has. */
const rasterFlags = () => (process.env.SIM_GPU === '1'
  ? ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']);

function chromeFlags({ width, height, profile, args }) {
  return [
    '--headless=new',
    '--no-sandbox',
    ...rasterFlags(),
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    /* A check is not a pilot: unmuted, the title music and the motors come
     * out of the desktop's speakers. The audio graph still runs muted, so
     * the audio checks still measure it. */
    '--mute-audio',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    ...args,
    'about:blank',
  ];
}

/* Chrome prints its DevTools address on stderr once it listens; the whole
 * stderr tail goes in the error when it never does, because that is where
 * Chrome says why. */
function devtoolsUrl(proc, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let tail = '';
    const timer = setTimeout(() => reject(new Error(`no DevTools endpoint: ${tail.slice(-1500)}`)), timeoutMs);
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.stderr.on('data', (chunk) => {
      tail += chunk.toString();
      const found = tail.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) {
        clearTimeout(timer);
        resolve(found[1]);
      }
    });
  });
}

function openSocket(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error('DevTools websocket failed')), { once: true });
  });
}

/* The profile is hundreds of files and up to 150 MB on a tmpfs. A run that
 * dies before close() would leave it, and enough of those once filled the
 * disk; so the removal is also hooked on process exit. Chrome's helpers
 * outlive the main process by a moment and are still writing it, which
 * fails the first delete with ENOTEMPTY, hence the retries. */
const RM_RETRIES = { recursive: true, force: true, maxRetries: 20, retryDelay: 100 };

/* The one console: console.error and console.assert, uncaught exceptions
 * and error level log entries (a failed resource) are errors; console.warn
 * and warning level entries are warnings. Everything else is noise. */
function collectConsole(msg, errors, warnings) {
  switch (msg.method) {
    case 'Runtime.consoleAPICalled': {
      const { type, args } = msg.params;
      const line = args.map(describe).join(' ');
      if (type === 'error' || type === 'assert') {
        errors.push(`console.${type}: ${line}`);
      } else if (type === 'warning') {
        warnings.push(`console.warning: ${line}`);
      }
      return;
    }
    case 'Runtime.exceptionThrown': {
      const { exception, text } = msg.params.exceptionDetails;
      errors.push(`uncaught: ${exception ? describe(exception) : text}`);
      return;
    }
    case 'Log.entryAdded': {
      const { level, source, text } = msg.params.entry;
      if (level === 'error') {
        errors.push(`${source}: ${text}`);
      } else if (level === 'warning') {
        warnings.push(`${source}: ${text}`);
      }
      return;
    }
    default:
  }
}

/* Answer an intercepted request: an overridden path from the option, any
 * other from the CDN cache. A failure fails the request and leaves a line
 * in errors, so the check that needed the module reports why. */
async function answerRequest(cdp, sessionId, { requestId, request }, override, errors) {
  try {
    const path = new URL(request.url).pathname;
    const body = path in override ? Buffer.from(override[path]) : await fetchThroughCache(request.url);
    await cdp.send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'content-type', value: 'text/javascript; charset=utf-8' },
        { name: 'access-control-allow-origin', value: '*' },
      ],
      body: body.toString('base64'),
    }, sessionId);
  } catch (err) {
    errors.push(`cdn proxy failed for ${request.url}: ${err.message}`);
    await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }, sessionId).catch(() => {});
  }
}

/* An accounts server of the page's own with an account made on it, so the
 * page boots signed in as `callsign`. Imported only when asked: it brings
 * the tracks server and SQLite along. */
async function signIn(callsign) {
  const { seedSignedIn, startAccounts } = await import('./account.js');
  const accounts = await startAccounts();
  const id = `sim-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const account = await accounts.signUp(id, callsign);
  return { accounts, account, seed: seedSignedIn(accounts.origin, account) };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Under SIM_CSP (tests/lib/server.js sends the deployed policy as a
 * header), every violation is a console error naming what was blocked,
 * and close() prints each once as a "csp-violation:" line, so any check
 * run that way says what the policy would break (scripts/csp-sweep.js). */
const CSP_SEED = `document.addEventListener('securitypolicyviolation', (e) => console.error('CSP violation: '
  + e.effectiveDirective + ' blocked ' + (e.blockedURI || 'inline') + ' from ' + (e.sourceFile || document.URL.split('?')[0])
  + ':' + e.lineNumber + (e.disposition === 'report' ? ' (report only)' : '')));`;

/*
 * Open `url` of the repo at `root` in a fresh headless Chromium and return
 * the driver.
 *
 * `seed`: script sources run on every new document before the app does.
 * That is how a stored setting gets in, through the same storage the pilot
 * writes, rather than a test hook that can drift from it.
 *
 * `args`: Chromium flags added after the defaults, for the one check that
 * needs its own (a fake microphone).
 *
 * `account`: a callsign; the page boots signed in as that pilot (see
 * signIn). SIM_ACCOUNT=1 turns it on, as 'Tester', for every page. Off,
 * the page is the loopback build with no accounts server, where nothing
 * asks anybody to sign in.
 *
 * `override`: a path the page fetches from its own server mapped to the
 * JavaScript served in its place, so a check can run another version of
 * one module beside this tree's.
 */
export async function openPage({
  root,
  width = 1600,
  height = 900,
  url = '/index.html',
  touch = false,
  seed = [],
  args = [],
  account = process.env.SIM_ACCOUNT === '1' ? 'Tester' : null,
  override = {},
} = {}) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error('no Chromium found');
  }
  const signedIn = account ? await signIn(account) : null;
  const server = await startServer(root);
  const profile = await mkdtemp(join(tmpdir(), 'sim-page-'));
  const proc = spawn(chrome, chromeFlags({ width, height, profile, args }));
  const sweep = () => {
    proc.kill();
    rmSync(profile, RM_RETRIES);
  };
  process.once('exit', sweep);

  const ws = await openSocket(await devtoolsUrl(proc));
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params = {}) => cdp.send(method, params, sessionId);

  const errors = [];
  const warnings = [];
  cdp.onEvent((msg) => {
    if (msg.sessionId !== sessionId) {
      return;
    }
    if (msg.method === 'Fetch.requestPaused') {
      answerRequest(cdp, sessionId, msg.params, override, errors);
      return;
    }
    collectConsole(msg, errors, warnings);
  });

  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.enable');
  await call('Fetch.enable', {
    patterns: [CDN_HOST, ...Object.keys(override).map((path) => `*${path}*`)].map((urlPattern) => ({ urlPattern })),
  });
  /* The same width and height on every machine, whatever window Chrome
   * thinks it has, so a measurement means one thing. */
  await call('Emulation.setDeviceMetricsOverride', {
    width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: false,
  });
  if (touch) {
    await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  /* A controller plugged into this machine is a real pad to headless Chrome
   * too, and one has flown a check's aircraft off its parking spot. No page
   * sees a pad unless its own seed, run after this one, stubs one. */
  const seeds = ['navigator.getGamepads = () => [];', ...(process.env.SIM_CSP ? [CSP_SEED] : []),
    ...(signedIn ? [signedIn.seed] : []), ...seed];
  for (const source of seeds) {
    await call('Page.addScriptToEvaluateOnNewDocument', { source });
  }
  await call('Page.navigate', { url: `${server.origin}${url}` });

  /* The expression's value, with a promise awaited. A throw is an error
   * here, not a logged line: every caller is asserting on the answer. */
  async function evaluate(expression) {
    const { result, exceptionDetails } = await call('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (exceptionDetails) {
      const { exception, text } = exceptionDetails;
      throw new Error(`evaluate threw: ${exception ? describe(exception) : text}`);
    }
    return result.value;
  }

  /* Poll until the expression is truthy. A fixed wait proves nothing: a
   * software rasteriser's frame takes about 120 ms, so a key followed by a
   * wait can read the state from before the key. */
  async function until(expression, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await evaluate(expression).catch(() => false)) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for: ${expression}`);
      }
      await wait(100);
    }
  }

  /* The loading screen stays 400 ms past the first frame and fades 400
   * more, over the title and whatever is open on it. A key reaches the page
   * through it; a click lands on it, so a click waits for this. */
  const loaded = (timeoutMs = 15000) => until("document.getElementById('pdcs-loader').hidden", timeoutMs);

  /* A left click at the middle of the first element `selector` matches,
   * scrolled into view; false when nothing matches. Counted in page.clicks
   * for the checks that hold a way in to a number of clicks. */
  let clicks = 0;
  async function click(selector) {
    await loaded();
    const centre = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) { return null; }
      /* Instant: the hangar's panel scrolls smoothly (index.html
       * .hangar-side), and a smooth scroll leaves the box read below where
       * the element was, so the press landed on a neighbour. */
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const box = el.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    if (!centre) {
      return false;
    }
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await call('Input.dispatchMouseEvent', { type, ...centre, button: 'left', clickCount: 1 });
    }
    clicks += 1;
    return true;
  }

  async function tap(code) {
    const info = keyInfo(code);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', ...info });
    await wait(30);
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...info });
  }

  async function close() {
    if (process.env.SIM_CSP) {
      for (const line of new Set(errors.filter((e) => e.includes('CSP violation: ')))) {
        console.log(`csp-violation: ${line.slice(line.indexOf('CSP violation: ') + 15)}`);
      }
    }
    ws.close();
    const stillRunning = proc.exitCode === null && proc.signalCode === null;
    const exited = stillRunning ? new Promise((resolve) => proc.once('exit', resolve)) : Promise.resolve();
    proc.kill();
    await exited;
    await server.close();
    if (signedIn) {
      await signedIn.accounts.stop();
    }
    process.removeListener('exit', sweep);
    await rm(profile, RM_RETRIES);
  }

  return {
    cdp,
    sessionId,
    errors,
    warnings,
    origin: server.origin,
    proc,
    accounts: signedIn?.accounts ?? null,
    account: signedIn?.account ?? null,
    evaluate,
    until,
    loaded,
    click,
    tap,
    sleep: wait,
    close,
    get clicks() {
      return clicks;
    },
  };
}
