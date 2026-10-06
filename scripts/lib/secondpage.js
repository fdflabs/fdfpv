/*
 * secondpage.js: a second page in a check's one Chrome (tests/lib/page.js
 * openPage makes the first), in a browser context of its own, so two or
 * three pilots fly in one browser: the one headless browser rule kept.
 * Used by scripts/interior-coop-check.js and interior-filmplay-check.js.
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

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/*
 * A second page in the first page's Chrome, in a browser context of its
 * own (its own storage): the helpers the checks use, evaluate, until and
 * errors, over the same DevTools connection. jsdelivr is fetched straight
 * (the first page's proxy is its own session's).
 */
export async function secondPage(page, outDir, { url, seed = [], width = 1280, height = 720 }) {
  const { cdp } = page;
  const { browserContextId } = await cdp.send('Target.createBrowserContext', {});
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank', browserContextId, newWindow: true, background: false,
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const errors = [];
  cdp.onEvent((msg) => {
    if (msg.sessionId !== sessionId) {
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'assert')) {
      errors.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`uncaught: ${d.exception ? d.exception.description : d.text}`);
    }
  });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  }, sessionId);
  /* Both pages fly at once: neither may be throttled as a hidden tab. */
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'navigator.getGamepads = () => [];' }, sessionId);
  for (const source of seed) {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId);
  }
  await cdp.send('Page.navigate', { url: `${page.origin}${url}` }, sessionId);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function evaluate(expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`evaluate threw: ${d.exception ? d.exception.description : d.text}`);
    }
    return r.result.value;
  }
  async function until(expression, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await evaluate(expression).catch(() => false)) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for: ${expression}`);
      }
      await sleep(100);
    }
  }
  async function shot(name) {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(outDir, name), Buffer.from(r.data, 'base64'));
  }
  return {
    evaluate, until, sleep, errors, shot,
  };
}
