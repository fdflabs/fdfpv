/*
 * daytime-room-check.js: two pilots in one free room see the same time of
 * day (docs/DAYTIME-CONTRACT.md, owner 2026-10-10: one game time per room,
 * shared by all its players), two pages of the real shell against a rooms
 * server this check starts itself (edge/rooms/node.js, scratch database).
 *
 *     node scripts/daytime-room-check.js      (npm run daytime:room)
 *
 * On Itaipu, which builds once at a named time:
 *
 *   1. The host's Time of day is night, the guest's the world's own. The
 *      host makes the room (its setting goes with the make, as the room
 *      browser's does) and both join: both worlds are built at night and
 *      every reader on both is night; both hold the same clock.
 *   2. The guest sets golden and starts a run: nothing changes, it is not
 *      the host.
 *   3. The host sets golden and starts a run: the room's clock is golden on
 *      both pages, and both worlds are rebuilt at golden, day for detection
 *      and the sounds.
 *
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
import { clockOfTime } from '../src/share/daytime.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = await mkdtemp(join(process.env.TMPDIR || tmpdir(), 'daytime-room-'));
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;

const seedFor = (timeOfDay) => [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  Object.assign(s, { map: 'itaipu', graphics: 'low', graphicsAuto: false, sound: false, airframeAsked: true, timeOfDay: ${JSON.stringify(timeOfDay)} });
  localStorage.setItem(k, JSON.stringify(s));
  localStorage.setItem('webfpv.airhint.v2', '1');
} catch (e) { /* Storage refused; the run boots on its defaults. */ }`];

let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const daytime = async (p) => JSON.parse(await p.evaluate('JSON.stringify(window.__daytime())'));
/* The world standing, built at `look`, a few frames on so every reader
 * has had a frame of it. */
const settled = async (p, look) => {
  await p.until(`(() => { const d = window.__daytime(); return d.ready && d.map === 'itaipu' && d.look === '${look}'; })()`, 400000);
  await p.evaluate('new Promise((r) => { let n = 0; const f = () => (++n >= 5 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })');
  return daytime(p);
};
const fly = async (p) => {
  await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
};
const show = (d) => `clock ${JSON.stringify(d.clock)}, look ${d.look}, flag ${d.flag}, light ${d.light}, audio ${d.audio}`;

const url = `/index.html?rooms=${encodeURIComponent(rooms)}&map=itaipu`;
const a = await openPage({ root, url, width: 960, height: 540, seed: seedFor('night') });
const b = await openPage({ root, url, width: 960, height: 540, seed: seedFor('own') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until("window.__map && window.__map().ready && window.__map().id === 'itaipu'", 400000);
  }
  const solo = [await daytime(a), await daytime(b)];
  check('solo, each page flies its own setting: the host night, the guest the world\'s own day',
    solo[0].look === 'night' && solo[1].look === 'day', `${show(solo[0])} | ${show(solo[1])}`);
  const errors0 = [a.errors.length, b.errors.length];

  /* 1. Made at the host's time, as the room browser makes a room. */
  const code = await a.evaluate("window.__roomCreate({ daytime: window.__ui.settings.timeOfDay === 'own' ? null : window.__ui.settings.timeOfDay })");
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }
  const [na, nb] = [await settled(a, 'night'), await settled(b, 'night')];
  check('in the room both pages hold the room\'s clock, night', same(na.clock, clockOfTime('night')) && same(nb.clock, na.clock),
    `${JSON.stringify(na.clock)} | ${JSON.stringify(nb.clock)}`);
  for (const [who, d] of [['host', na], ['guest', nb]]) {
    check(`${who}: built at night, detection and the sounds night with it`, d.look === 'night' && d.flag === 'night' && d.night
      && d.light === 0.05 && d.audio === 'night', show(d));
  }
  for (const p of [a, b]) {
    await fly(p);
  }

  /* 2. The guest is not the host. */
  await b.evaluate("window.__ui.settings.timeOfDay = 'golden'; true");
  await fly(b);
  await b.evaluate('new Promise((r) => setTimeout(r, 1500))');
  const [ga, gb] = [await daytime(a), await daytime(b)];
  check('a pilot who is not the host cannot set it', same(ga.clock, clockOfTime('night')) && same(gb.clock, clockOfTime('night'))
    && gb.look === 'night', `${show(ga)} | ${show(gb)}`);

  /* 3. The host sets golden: the room's, both pages rebuild at it. */
  await a.evaluate("window.__ui.settings.timeOfDay = 'golden'; true");
  await fly(a);
  const [ha, hb] = [await settled(a, 'golden'), await settled(b, 'golden')];
  check('the host sets golden: both pages hold it', same(ha.clock, clockOfTime('golden')) && same(hb.clock, ha.clock),
    `${JSON.stringify(ha.clock)} | ${JSON.stringify(hb.clock)}`);
  for (const [who, d] of [['host', ha], ['guest', hb]]) {
    check(`${who}: rebuilt at golden, day for detection, the golden sounds`, d.look === 'golden' && d.flag === 'day' && !d.night
      && d.light === 1 && d.audio === 'golden', show(d));
  }

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
