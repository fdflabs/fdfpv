/*
 * war-solo-page.js: one pilot, alone in a private room on Itaipu, starts
 * Defend Itaipu (mission 1) from the room screen, against a local
 * edge/rooms/node.js this check starts and stops itself (never the VM).
 *
 *   SIM_GPU=1 node scripts/war-solo-page.js [port]
 *   SIM_GPU=1 node scripts/war-solo-page.js --rooms=http://127.0.0.1:PORT
 *
 * The second form runs against a rooms server already up, such as one
 * from an older commit, to tell a client fault from a server mismatch.
 *
 * The owner, 2026-09-30, room DNSF5B: the war HUD sat at "ENGAGE IN 0 /
 * CONTACTS 0 / RACK 0/0" and never went live, with the room's "alone in
 * room" line drawn over it. What must hold: the host is put in the air at
 * the countdown, the war goes live at its goAt, the rack is filled, and
 * while the war's HUD is up neither the alone line nor the room bar is.
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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const given = process.argv.find((a) => a.startsWith('--rooms='));
const PORT = Number(process.argv.slice(2).find((a) => !a.startsWith('--')) || 18799);

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

const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '5inch');
Object.assign(s, {
  map: 'itaipu', freestyleMap: 'itaipu', graphics: 'low', flightMode: 'angle', fpsCap: 0, airframeAsked: true, warConsent: true,
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.soloSeeded) {
    Object.assign(s, ${JSON.stringify(s)}, { soloSeeded: true });
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* storage refused */ }`];

const dir = await mkdtemp(join(tmpdir(), 'war-solo-'));
const server = given ? null : await startRooms({ db: join(dir, 'rooms.db'), port: PORT });
const rooms = given ? given.slice('--rooms='.length) : `http://127.0.0.1:${PORT}`;
console.log(`Defend Itaipu alone, rooms at ${rooms}`);
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720, seed });
const look = () => page.evaluate(`(() => {
  const w = window.__war();
  return {
    state: w.view.state, goAt: w.view.goAt, rack: w.view.rack, rackMax: w.view.rackMax, hud: Boolean(w.hud && w.hud.on !== false && w.view.state !== 'lobby'),
    now: window.__rooms().roomNow, mode: window.__craftState().mode, screen: window.__ui.screen,
    note: window.__peerMarks().note ?? null, bar: window.__rooms().bar ?? null,
  };
})()`);

try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 600000);
  const code = await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  check('a private room on Itaipu, alone', /^[A-Z0-9]{6}$/.test(code), code);
  /* Started from the room screen, where the host's row is. */
  await page.evaluate("window.__ui.act('friends'); true");
  await page.sleep(500);
  await page.evaluate("window.__warDo('start', 'itaipu-drill')");
  await page.until("['countdown', 'live'].includes(window.__war().view.state)", 15000).catch(() => {});
  const c = await look();
  check('the war counts down', ['countdown', 'live'].includes(c.state), JSON.stringify(c));
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000).catch(() => {});
  const up = await look();
  check('the host is put in the air for it', up.mode === 'flight' && up.screen === 'flight', `${up.mode}/${up.screen}`);
  check('and the alone line is not drawn over the war', up.note === null, String(up.note));
  const goAt = c.goAt ?? 0;
  await page.until(`window.__war().view.state === 'live'`, Math.max(20000, goAt - (c.now ?? 0) + 15000)).catch(() => {});
  const live = await look();
  check('it goes live at its goAt', live.state === 'live', JSON.stringify(live));
  check('with the rack filled', live.rackMax > 0 && live.rack > 0, `${live.rack}/${live.rackMax}`);
  check('and no alone line over the live war', live.note === null, String(live.note));
  await page.evaluate("window.__ui.act('pause'); window.__ui.show('paused'); true");
  await page.sleep(600);
  const paused = await look();
  check('paused mid war, the room bar does not speak over it either', paused.bar === null, String(paused.bar));
  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  if (server) {
    await server.stop();
  }
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
