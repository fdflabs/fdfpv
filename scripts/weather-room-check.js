/*
 * weather-room-check.js: two pages of the real shell in one room fly the
 * air the host set (docs/WEATHER-CONTRACT.md), against a rooms server this
 * check starts itself (edge/rooms/node.js, scratch database).
 *
 *     node scripts/weather-room-check.js      (npm run check:weather-room)
 *
 * The host's Weather setting goes to the room at its next run; after that
 * each page flies the same preset and the same seed, the room's. Then
 * calm: both fly still air. Another pilot's setting changes nothing.
 * Exit 0 on a pass, 1 otherwise.
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

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY } from '../src/ui/ui.js';
import { startRooms } from '../edge/rooms/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'weather-room-'));
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;

const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { graphics: 'low', graphicsAuto: false, sound: false, airframeAsked: true });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/* A fresh run thrown into the air, and what it flies after 40 frames. */
const fly = async (p) => JSON.parse(await p.evaluate(`(async () => {
  window.__crashThrow({ fresh: true, x: 0, y: 300, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 });
  for (let i = 0; i < 40; i += 1) await new Promise((r) => requestAnimationFrame(r));
  return JSON.stringify({ flown: window.__weatherFlown() });
})()`));

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
const a = await openPage({ root, url, width: 960, height: 540, seed });
const b = await openPage({ root, url, width: 960, height: 540, seed });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  const errors0 = [a.errors.length, b.errors.length];
  const calmA = await fly(a);
  check('a new room flies calm', calmA.flown === null, JSON.stringify(calmA.flown));

  /* A pilot's Weather setting (src/ui/items.js weatherRow), offered to the
   * room at their next run: the host's is taken, anybody else's is not. */
  const setWeather = (p, preset) => p.evaluate(`window.__ui.settings.weather = '${preset}'; true`);
  await setWeather(b, 'gusty');
  await fly(b);
  await a.evaluate('new Promise((r) => setTimeout(r, 500))');
  const stillB = await fly(b);
  check('a pilot who is not the host cannot set it', stillB.flown === null, JSON.stringify(stillB.flown));

  await setWeather(b, 'calm');
  await setWeather(a, 'gusty');
  await fly(a);
  await a.evaluate('new Promise((r) => setTimeout(r, 500))');
  const fa = (await fly(a)).flown;
  const fb = (await fly(b)).flown;
  check('the host sets gusty: both pages fly it, with the same seed',
    fa && fb && fa.preset === 'gusty' && fb.preset === 'gusty' && fa.seed === fb.seed && fa.map === fb.map,
    `${JSON.stringify(fa)} ${JSON.stringify(fb)}`);

  await setWeather(a, 'calm');
  await fly(a);
  await a.evaluate('new Promise((r) => setTimeout(r, 500))');
  const ca = (await fly(a)).flown;
  const cb = (await fly(b)).flown;
  check('calm again: both fly still air', ca === null && cb === null);

  const refused = /^network: .*ERR_CONNECTION_REFUSED/;
  const other = [...a.errors.slice(errors0[0]), ...b.errors.slice(errors0[1])].filter((e) => !refused.test(e));
  check('the pages logged nothing', other.length === 0, other.slice(0, 3).join(' | ').slice(0, 600));
} finally {
  await a.close();
  await b.close();
  await server.stop();
  await rm(scratch, { recursive: true, force: true });
}

console.log(failed === 0 ? 'PASS' : 'FAIL');
if (failed > 0) {
  process.exitCode = 1;
}
