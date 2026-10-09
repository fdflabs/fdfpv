/*
 * xbrowser-check.js: the shell in Firefox and WebKit (Safari's engine), not
 * only in the Chromium every other browser check drives. Playwright, so the
 * three engines run the same steps. Run with npm run xbrowser:check.
 *
 *   node scripts/xbrowser-check.js [firefox] [webkit] [chromium]   (default: firefox webkit)
 *
 * For each engine, a fresh headless browser:
 *   1. boot: index.html reaches a ready shell, with the time it took,
 *   2. menus: the title answers the arrow keys and Enter opens a screen that
 *      Escape leaves again,
 *   3. a short flight: Fly starts a flight, frames are drawn, and a craft
 *      lifted 40 m falls, so the physics (sim.wasm) is running,
 *   4. rooms: two pages make and join a private room on a local rooms
 *      server (edge/rooms/node.js) and each sees the other.
 * Every uncaught error and console error is listed per engine. The exit
 * status is the number of failed steps, so a run says what is broken in
 * which engine; docs/CROSSBROWSER.md has the last results.
 *
 * Needs `npx playwright install firefox webkit` once (and on Linux the
 * host libraries `npx playwright install-deps` names, which CI installs).
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

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, webkit } from 'playwright';

import { findChrome } from '../tests/lib/browser.js';
import { startServer } from '../tests/lib/server.js';
import { startRooms } from '../edge/rooms/node.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ENGINES = { chromium, firefox, webkit };
const asked = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const engines = asked.length ? asked : ['firefox', 'webkit'];
const BOOT_MS = 300000;
/* The GL flags tests/lib/page.js gives Chrome, so the control draws as the
 * other checks do: the GPU under SIM_GPU=1 (run-check.sh's default), else
 * SwiftShader. Firefox and WebKit draw with what their headless builds have. */
const CHROME_GL = process.env.SIM_GPU === '1'
  ? ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/* The same seed the Chromium room checks use: low graphics, no frame cap,
 * the aircraft question answered, so the boot lands on the title. */
const SEED = `try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { graphics: 'low', fpsCap: 0, airframeAsked: true, flightMode: 'angle' });
  localStorage.setItem(k, JSON.stringify(s));
} catch (e) { /* storage refused */ }
navigator.getGamepads = () => [];`;

const results = [];
function check(engine, name, ok, detail = '') {
  results.push({ engine, name, ok, detail });
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function until(page, expression, timeoutMs) {
  await page.waitForFunction(expression, null, { timeout: timeoutMs, polling: 200 });
}

/* A step that throws fails by its message and the run goes on. */
async function step(engine, name, fn) {
  try {
    const detail = await fn();
    check(engine, name, true, detail || '');
    return true;
  } catch (e) {
    check(engine, name, false, String(e.message || e).split('\n')[0].slice(0, 200));
    return false;
  }
}

async function openShell(context, origin, url, errors) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`uncaught: ${String(e.message || e).slice(0, 200)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(`console: ${m.text().slice(0, 200)}`);
    }
  });
  await page.goto(`${origin}${url}`);
  return page;
}

async function run(engineName, origin, roomsOrigin) {
  console.log(`${engineName}`);
  /* Chromium is the control: the same Chrome every other check drives. */
  const options = engineName === 'chromium' ? { executablePath: findChrome(), args: CHROME_GL } : {};
  let browser;
  try {
    browser = await ENGINES[engineName].launch({ headless: true, ...options });
  } catch (e) {
    check(engineName, 'launch', false, String(e.message).split('\n').find((l) => /apt-get|Executable|missing/i.test(l)) || e.message.slice(0, 160));
    return;
  }
  const errors = [];
  console.log(`  version ${browser.version()}`);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript(SEED);
    const t0 = Date.now();
    const page = await openShell(context, origin, '/index.html', errors);
    const booted = await step(engineName, 'boot: the shell is ready', async () => {
      await until(page, 'window.__shellReady === true', BOOT_MS);
      const gl = await page.evaluate("(() => { const c = document.createElement('canvas'); return c.getContext('webgl2') ? 'webgl2' : (c.getContext('webgl') ? 'webgl1' : 'no webgl'); })()");
      return `${Date.now() - t0} ms, ${gl}`;
    });
    if (!booted) {
      return;
    }
    await step(engineName, 'menus: arrows move the title cursor, Enter opens a hub, Escape returns', async () => {
      await until(page, "document.getElementById('pdcs-loader') === null || document.getElementById('pdcs-loader').hidden", 30000);
      await until(page, 'window.__ui.onGate()', 60000);
      const c0 = await page.evaluate('window.__ui.cursor');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      const c1 = await page.evaluate('window.__ui.cursor');
      if (c1 === c0) {
        throw new Error(`ArrowRight left the cursor at ${c0}`);
      }
      /* Onto Flight Club the way scripts/mode-cards-check.js does, then the key. */
      await page.evaluate("window.__ui.setCursor(window.__ui.items().findIndex((it) => it.hub === 'club')); true");
      await page.keyboard.press('Enter');
      try {
        await until(page, "window.__ui.hub === 'club'", 15000);
      } catch (e) {
        throw new Error(`Enter on Flight Club opened no hub (hub ${await page.evaluate('window.__ui.hub')})`);
      }
      await page.keyboard.press('Escape');
      await until(page, 'window.__ui.onGate()', 15000);
      return `cursor ${c0} -> ${c1}, gate -> club -> gate`;
    });
    await step(engineName, 'flight: Fly starts it, frames draw, a lifted craft falls', async () => {
      await page.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
      await until(page, "window.__craftState && window.__craftState().mode === 'flight'", BOOT_MS);
      const s = await page.evaluate('window.__craftState()');
      await page.evaluate(`window.__placeCraft(${s.worldX}, ${s.worldY + 40}, ${s.worldZ}); true`);
      const high = await page.evaluate('window.__craftState().worldY');
      const dropped = Date.now();
      /* Frames drawn a second over two seconds of requestAnimationFrame. */
      const frames0 = await page.evaluate('new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 < 2000) { requestAnimationFrame(f); } else { r(n / ((performance.now() - t0) / 1000)); } }; requestAnimationFrame(f); })');
      const fps = `${frames0.toFixed(1)} fps`;
      if (!(frames0 > 0)) {
        throw new Error('no frames drawn');
      }
      /* The sim steps per drawn frame, so a software renderer at one frame
       * a second runs it slowly: wait for a metre of fall, up to a minute. */
      try {
        await until(page, `window.__craftState().worldY < ${high - 1}`, 60000);
      } catch (e) {
        const y = await page.evaluate('window.__craftState().worldY');
        throw new Error(`the craft did not fall a metre in 60 s: y ${high.toFixed(1)} -> ${y.toFixed(1)}, ${fps}`);
      }
      return `fell a metre within ${((Date.now() - dropped) / 1000).toFixed(1)} s of the drop, ${fps}`;
    });
    await page.close();

    await step(engineName, 'rooms: two pages make and join a room', async () => {
      const url = `/index.html?rooms=${encodeURIComponent(roomsOrigin)}`;
      const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await ctxB.addInitScript(SEED);
      const a = await openShell(context, origin, url, errors);
      const b = await openShell(ctxB, origin, url, errors);
      try {
        for (const p of [a, b]) {
          await until(p, 'window.__shellReady === true', BOOT_MS);
        }
        const code = await a.evaluate('window.__roomCreate()');
        await until(a, "window.__rooms().phase === 'open'", 30000);
        await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
        for (const p of [a, b]) {
          await until(p, "window.__rooms().phase === 'open' && window.__rooms().peers.length === 1", 30000);
        }
        return `room ${code}, each page sees one peer`;
      } finally {
        await ctxB.close();
      }
    });
  } finally {
    const unique = [...new Set(errors)];
    console.log(`  ${unique.length} distinct page errors${unique.length ? ':' : ''}`);
    for (const e of unique.slice(0, 15)) {
      console.log(`    ${e}`);
    }
    results.push({ engine: engineName, errors: unique.length });
    await browser.close();
  }
}

const scratch = await mkdtemp(join(tmpdir(), 'fdfpv-xbrowser-'));
const server = await startServer(root);
const rooms = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const roomsOrigin = `http://127.0.0.1:${rooms.port}`;
try {
  for (const e of engines) {
    if (!ENGINES[e]) {
      throw new Error(`unknown engine ${e}: firefox, webkit or chromium`);
    }
    await run(e, server.origin, roomsOrigin);
  }
} finally {
  await rooms.stop();
  await server.close();
  await rm(scratch, { recursive: true, force: true });
}

const failed = results.filter((r) => r.ok === false);
console.log('\nsummary');
for (const e of engines) {
  const mine = results.filter((r) => r.engine === e && 'ok' in r);
  const errs = results.find((r) => r.engine === e && 'errors' in r);
  console.log(`  ${e}: ${mine.filter((r) => r.ok).length}/${mine.length} steps, ${errs ? errs.errors : '?'} page errors`
    + (mine.some((r) => !r.ok) ? `; broken: ${mine.filter((r) => !r.ok).map((r) => r.name.split(':')[0]).join(', ')}` : ''));
}
process.exit(failed.length);
