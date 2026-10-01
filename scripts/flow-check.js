/*
 * flow-check.js: where a pilot ends up across a reload, driven through the
 * real shell against a local rooms server (never the live one), one page:
 *
 *   npm run flow:check                      starts its own on port 8829
 *   npm run flow:check -- http://127.0.0.1:8797
 *
 * docs/FLOW-AUDIT.md is the map; each step here is one of its dead ends.
 *
 *   a link is used once (D3)   opened with ?room=CODE: in that room, and
 *                              the address no longer carries the code;
 *                              Leave, reload: out of the room, and it
 *                              stays out once the shell has run.
 *   a reload keeps the room,   in a room made by hand, reload: back in
 *   on its screen (D2)         the same room, on the room screen with
 *                              its code, the title not shown.
 *
 * No page error.
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
}

async function roomsServer() {
  if (process.argv[2]) {
    return { url: process.argv[2], stop: async () => {} };
  }
  const dir = await mkdtemp(join(tmpdir(), 'flow-rooms-'));
  const port = 8829;
  const proc = spawn(process.execPath, [join(root, 'edge/rooms/node.js')], {
    env: { ...process.env, ROOMS_DB: join(dir, 'rooms.db'), PORT: String(port) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    proc.kill('SIGTERM');
    await rm(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 100; i += 1) {
    try {
      await fetch(`${url}/v2/rooms`);
      return { url, stop };
    } catch (e) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await stop();
  throw new Error(`rooms server did not come up on ${url}`);
}

/* The shell up, and enough frames run that its once-only autojoin
 * (main.js roomFrame) has had its turn. */
async function settled(page) {
  await page.until('window.__shellReady === true', 300000);
  await page.evaluate(`new Promise((done) => {
    let n = 0;
    const step = () => (n += 1) >= 30 ? done(true) : requestAnimationFrame(step);
    requestAnimationFrame(step);
  })`);
}

async function reload(page) {
  await page.cdp.send('Page.reload', {}, page.sessionId);
  await page.sleep(500);
  await settled(page);
}

const ROOM = `(() => {
  const r = window.__rooms();
  return { phase: r.phase, code: r.code, search: window.location.search, screen: window.__ui.screen };
})()`;

const server = await roomsServer();
console.log(`Flow, rooms at ${server.url}`);
const res = await fetch(`${server.url}/v2/create`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ map: 'swiss2', friendly: false, public: false, name: null, mode: null }),
});
const { code } = await res.json();
const page = await openPage({
  root, url: `/index.html?rooms=${encodeURIComponent(server.url)}&room=${code}`, width: 1280, height: 720,
});
try {
  /* A LINK IS USED ONCE. */
  await settled(page);
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(code)}`, 60000).catch(() => {});
  const linked = await page.evaluate(ROOM);
  check('a ?room= link joins its room', linked.phase === 'open' && linked.code === code, JSON.stringify(linked));
  check('and the address no longer carries the code', !/[?&]room=/.test(linked.search), linked.search);
  await page.evaluate("(() => { window.__ui.act('friends-leave'); return true; })()");
  await page.until("window.__rooms().phase === 'idle'", 10000).catch(() => {});
  const left = await page.evaluate(ROOM);
  check('Leave is out of it', left.phase === 'idle', JSON.stringify(left));
  await reload(page);
  await page.sleep(2000);
  const after = await page.evaluate(ROOM);
  check('a reload after Leave stays out of the room', after.phase === 'idle' && after.code === null, JSON.stringify(after));

  /* A RELOAD KEEPS THE ROOM, ON ITS SCREEN. */
  const made = await page.evaluate("(async () => { const c = await window.__roomCreate({ map: 'swiss2' }); window.__ui.act('friends'); return c; })()");
  await page.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(made)}`, 60000).catch(() => {});
  const inRoom = await page.evaluate(ROOM);
  check('a room made by hand, on its screen', inRoom.phase === 'open' && inRoom.code === made && inRoom.screen === 'friends', JSON.stringify(inRoom));
  await reload(page);
  await page.until("window.__rooms().phase === 'open' && window.__ui.screen === 'friends'", 60000).catch(() => {});
  const back = await page.evaluate(`(() => {
    const friends = document.querySelector('.screen-friends');
    return {
      ...${ROOM},
      title: document.querySelector('.screen-title').style.display !== 'none',
      shown: Boolean(friends) && friends.style.display !== 'none' && friends.textContent.includes(window.__rooms().code),
    };
  })()`);
  check('a reload is back in the same room', back.phase === 'open' && back.code === made, JSON.stringify(back));
  check('on the room screen, its code on it, the title not shown', back.screen === 'friends' && back.shown && !back.title, JSON.stringify(back));

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
