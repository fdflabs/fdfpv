/*
 * browser.js: run one harness page in headless Chrome and bring back what
 * it resolved.
 *
 * A harness page (tests/browser/*.html) sets window.__simHarnessResult to
 * a promise of its verdict. runBrowserHarness launches Chrome on a fresh
 * profile, opens the page, waits for that promise and returns
 *   { result, errors, warnings }
 * where errors and warnings are what the page said on the way: console
 * errors and failed assertions, uncaught exceptions, and the browser's own
 * error and warning log entries (a failed fetch, a CSP refusal), in the
 * order they arrived. Chrome is killed and its profile removed whether the
 * run passed, failed or threw.
 *
 * findChrome is the one place that knows where a Chrome may live; the
 * other page drivers (tests/lib/page.js) take it from here.
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
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* SIM_CHROME_BIN first, then the usual places on Linux, macOS and Windows,
 * Edge last: it speaks the same protocol. */
function chromePlaces() {
  const programs = process.env.ProgramFiles || 'C:\\Program Files';
  const programs86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA;
  const chromeExe = (base) => join(base, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const edgeExe = (base) => join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  return [
    process.env.SIM_CHROME_BIN,
    '/opt/pw-browsers/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    chromeExe(programs),
    chromeExe(programs86),
    local && chromeExe(local),
    edgeExe(programs86),
    edgeExe(programs),
  ].filter(Boolean);
}

export function findChrome() {
  return chromePlaces().find((path) => existsSync(path)) ?? null;
}

const ENDPOINT_WAIT_MS = 30000;
const POLL_MS = 100;

/* Chrome prints its DevTools address on stderr once it listens; the
 * address is the only thing taken from that stream, the rest is kept to
 * explain a start that never got there. */
function launchChrome(binary, profileDir) {
  const proc = spawn(binary, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ]);
  let said = '';
  const tail = () => said.slice(-2000);
  const endpoint = new Promise((resolve, reject) => {
    const giveUp = setTimeout(
      () => reject(new Error(`Chrome did not report a DevTools endpoint. stderr: ${tail()}`)),
      ENDPOINT_WAIT_MS,
    );
    const settle = (fn) => (value) => {
      clearTimeout(giveUp);
      fn(value);
    };
    proc.stderr.on('data', (chunk) => {
      said += chunk.toString();
      const found = said.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) {
        settle(resolve)(found[1]);
      }
    });
    /* A spawn that fails surfaces as 'error'; without a listener Node
     * would raise it uncaught and take the runner down with it. */
    proc.on('error', (err) => settle(reject)(new Error(`Chrome failed to start: ${err.message}`)));
    proc.on('exit', (code) => settle(reject)(new Error(`Chrome exited early with code ${code}. stderr: ${tail()}`)));
  });
  return { proc, endpoint };
}

async function stopChrome(proc) {
  const gone = proc.exitCode !== null || proc.signalCode !== null;
  const exited = gone ? Promise.resolve() : new Promise((done) => proc.once('exit', done));
  proc.kill('SIGKILL');
  await exited;
}

/* Chrome's helper processes outlive the main one by a moment and are still
 * writing the profile, so the first delete can meet ENOTEMPTY; retried. A
 * profile that still will not go is reported, because the temp folder is
 * a quota tmpfs and leaked profiles have filled it before. */
async function removeProfile(dir) {
  await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    .catch((e) => console.warn(`browser harness: profile ${dir} not removed: ${e.message}`));
}

/* One DevTools connection: commands are answered by id, events fan out to
 * whoever listens. A closed or errored socket fails every command still
 * in flight and every command after it, with the same error. */
class Devtools {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('WebSocket connect to Chrome failed')), { once: true });
    });
    return new Devtools(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.inFlight = new Map();
    this.eventSinks = [];
    this.lastId = 0;
    this.dead = null;
    socket.addEventListener('message', (ev) => this.receive(ev.data));
    socket.addEventListener('close', () => this.die(new Error('CDP connection closed, Chrome died mid-run')));
    socket.addEventListener('error', () => this.die(new Error('CDP connection errored')));
  }

  die(err) {
    if (this.dead) {
      return;
    }
    this.dead = err;
    for (const { reject } of this.inFlight.values()) {
      reject(err);
    }
    this.inFlight.clear();
  }

  receive(data) {
    const msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    const waiting = msg.id && this.inFlight.get(msg.id);
    if (waiting) {
      this.inFlight.delete(msg.id);
      if (msg.error) {
        waiting.reject(new Error(`CDP ${msg.error.message}`));
      } else {
        waiting.resolve(msg.result);
      }
      return;
    }
    if (msg.method) {
      this.eventSinks.forEach((sink) => sink(msg));
    }
  }

  send(method, params = {}, sessionId) {
    if (this.dead) {
      return Promise.reject(this.dead);
    }
    this.lastId += 1;
    const id = this.lastId;
    this.socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((resolve, reject) => this.inFlight.set(id, { resolve, reject }));
  }

  onEvent(sink) {
    this.eventSinks.push(sink);
  }

  close() {
    this.socket.close();
  }
}

/* A console argument as the page would print it: strings bare, anything
 * else by Chrome's description of it. */
function printed(remote) {
  if (!remote) {
    return 'unknown';
  }
  if (remote.type === 'string') {
    return remote.value;
  }
  return remote.description ?? JSON.stringify(remote.value ?? remote);
}

/* Sorts what the page says into errors and warnings; everything else
 * (plain logs, info) is not reported. */
function listen(devtools, sessionId, { errors, warnings }) {
  devtools.onEvent((msg) => {
    if (msg.sessionId !== sessionId) {
      return;
    }
    const p = msg.params;
    switch (msg.method) {
      case 'Runtime.consoleAPICalled': {
        const line = `console.${p.type}: ${p.args.map(printed).join(' ')}`;
        if (p.type === 'error' || p.type === 'assert') {
          errors.push(line);
        } else if (p.type === 'warning') {
          warnings.push(line);
        }
        break;
      }
      case 'Runtime.exceptionThrown': {
        const d = p.exceptionDetails;
        errors.push(`uncaught: ${d.exception ? printed(d.exception) : d.text}`);
        break;
      }
      case 'Log.entryAdded': {
        const { level, source, text } = p.entry;
        if (level === 'error') {
          errors.push(`${source}: ${text}`);
        } else if (level === 'warning') {
          warnings.push(`${source}: ${text}`);
        }
        break;
      }
      default:
    }
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* The harness page's head script defines the promise, but the navigation
 * commits on its own schedule: an evaluation sent too early lands in the
 * about:blank context, or in the gap while that context is torn down and
 * rejects. Both mean "not yet", so the probe repeats until the deadline;
 * only a dead connection ends it early. */
async function awaitHarnessDefined(devtools, sessionId, deadline) {
  for (;;) {
    try {
      const probe = await devtools.send('Runtime.evaluate', {
        expression: 'typeof window.__simHarnessResult',
        returnByValue: true,
      }, sessionId);
      if (probe.result?.value === 'object') {
        return;
      }
    } catch (e) {
      if (devtools.dead) {
        throw e;
      }
    }
    if (Date.now() > deadline) {
      throw new Error('browser harness page never defined __simHarnessResult');
    }
    await sleep(POLL_MS);
  }
}

async function awaitHarnessResult(devtools, sessionId, timeoutMs) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('browser harness timed out')), timeoutMs);
  });
  const evaluated = devtools.send('Runtime.evaluate', {
    expression: 'window.__simHarnessResult',
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs,
  }, sessionId);
  const outcome = await Promise.race([evaluated, expired]).finally(() => clearTimeout(timer));
  if (outcome.exceptionDetails) {
    throw new Error(`browser harness evaluation failed: ${JSON.stringify(outcome.exceptionDetails)}`);
  }
  return outcome.result.value;
}

/*
 * Launch headless Chrome, open pageUrl, wait for window.__simHarnessResult
 * and return { result, errors, warnings }. Throws when no Chrome can be
 * found, when the page never defines its result or never settles it within
 * timeoutMs, or when the result rejects.
 */
export async function runBrowserHarness(pageUrl, { timeoutMs = 120000 } = {}) {
  const binary = findChrome();
  if (!binary) {
    throw new Error('headless Chrome not found. Set SIM_CHROME_BIN to a Chrome or Chromium binary.');
  }
  const profileDir = await mkdtemp(join(tmpdir(), 'sim-chrome-'));
  let chrome = null;
  try {
    chrome = launchChrome(binary, profileDir);
    const devtools = await Devtools.connect(await chrome.endpoint);
    const said = { errors: [], warnings: [] };
    const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true });
    listen(devtools, sessionId, said);
    for (const domain of ['Runtime', 'Log', 'Page']) {
      await devtools.send(`${domain}.enable`, {}, sessionId);
    }
    const deadline = Date.now() + timeoutMs;
    await devtools.send('Page.navigate', { url: pageUrl }, sessionId);
    await awaitHarnessDefined(devtools, sessionId, deadline);
    const result = await awaitHarnessResult(devtools, sessionId, timeoutMs);
    devtools.close();
    return { result, ...said };
  } finally {
    if (chrome) {
      await stopChrome(chrome.proc);
    }
    await removeProfile(profileDir);
  }
}
