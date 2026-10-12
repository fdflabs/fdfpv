/*
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

/*
 * The control surface tiers in a room, two pages and the real rooms
 * server (docs/SURFACES-STAGE1.md):
 *
 *   R1  B sees A's tiers in A's profile, and draws A's Cub with them.
 *   R2  A's room lineup names them.
 *   R3  A, the host, turns on stock surfaces only: B is told, A flies
 *       stock and its profile carries no tiers, so B draws it stock.
 *
 *   SIM_GPU=1 node scripts/surfaces-room-check.js [ROOMS_URL] [OUT_DIR]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { roomsServer } from '../tests/lib/roomsserver.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SURFACE_TIERS } from '../configs/surfaces-tiers.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[3] || join(tmpdir(), 'surfaces-room');
mkdirSync(out, { recursive: true });

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}

const TIERS_A = { a: 'extreme', e: '3d', r: 'stock' };
function seedFor(id, extra) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, id);
  Object.assign(s, { map: 'swiss2', freestyleMap: 'swiss2', graphics: 'low', fpsCap: 0, airframeAsked: true }, extra);
  s.progress = { v: 1, xp: 0, courses: {}, challenges: {}, seen: {}, unlockAll: true };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.surfacesSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { surfacesSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

const server = await roomsServer(process.argv[2], 'surfaces-room');
const url = `/index.html?rooms=${encodeURIComponent(server.url)}`;
const a = await openPage({ root, url, width: 1600, height: 900, seed: seedFor('cub1400', { surfaces: { cub1400: TIERS_A } }) });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('p51d1450', {}) });
/* A's profile as B holds it, and A's aircraft as B's page builds a peer
 * from it (src/render/peers.js buildPeerCraft), its moving surfaces'
 * chords: a peer is only drawn in the air, so the check builds one. */
const peerA = (p) => p.evaluate(`(async () => {
  const q = window.__rooms().peers[0];
  if (!q) return null;
  const { buildPeerCraft } = await import('/src/render/peers.js');
  const { drawnChords } = await import('/src/render/surfacesource.js');
  const rig = buildPeerCraft({ airframe: q.airframe, livery: q.livery, parts: q.parts });
  const chords = drawnChords(rig.group);
  rig.dispose();
  return { parts: q.parts, chords, airframe: q.airframe };
})()`);
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1", 30000);
  }
  check('two pages in one room', true, code);

  /* R1 */
  await b.until('(() => { const q = window.__rooms().peers[0]; return Boolean(q && q.parts && q.parts.surfaces); })()', 30000).catch(() => {});
  const seen = await peerA(b);
  check('R1 B gets A\'s tiers in A\'s profile', JSON.stringify(seen && seen.parts && seen.parts.surfaces) === JSON.stringify(TIERS_A), JSON.stringify(seen && seen.parts));
  const want = SURFACE_TIERS.cub1400.a[3].cf / SURFACE_TIERS.cub1400.a[0].cf;
  const drawnBig = seen && seen.chords ? seen.chords['aileron-right'] : null;

  /* R2 */
  await a.evaluate("window.__ui.show('friends'); window.__ui.renderMenu(); true");
  await a.until("Boolean(document.querySelector('.row.row-lineup'))", 15000);
  await a.loaded(60000);
  let clicked = false;
  for (let k = 0; k < 10 && !clicked; k += 1) {
    clicked = await a.click('.row.row-lineup') && await a.until("window.__ui.screen === 'walk'", 2000).then(() => true, () => false);
  }
  await a.sleep(1200);
  const card = await a.evaluate("document.querySelector('.walk-lineup').hidden ? null : document.querySelector('.walk-lineup').textContent");
  check('R2 the lineup names A\'s tiers', Boolean(card) && card.includes(en['surfaces.unlock_a_extreme']) && card.includes(en['surfaces.unlock_e_3d']), JSON.stringify(card));
  const { data } = await a.cdp.send('Page.captureScreenshot', { format: 'png' }, a.sessionId);
  writeFileSync(join(out, 'lineup.png'), Buffer.from(data, 'base64'));
  await a.tap('Escape');

  /* R3: the host's switch, offered as the weather is, on the settings
   * applied. */
  await a.evaluate('window.__ui.settings.roomStockSurfaces = true; window.__setTune(window.__ui.settings.tune); true');
  const told = await b.until('window.__rooms().stockSurfaces === true', 15000).then(() => true, () => false);
  await a.evaluate('window.__setTune(window.__ui.settings.tune); true');
  await a.sleep(500);
  const tiersA = await a.evaluate('window.__craft().tiers');
  check('R3 B is told the room flies stock surfaces', told, String(told));
  check('R3 A flies stock', JSON.stringify(tiersA) === JSON.stringify([1, 1, 1, 0, 0, 0]), JSON.stringify(tiersA));
  await b.until('(() => { const q = window.__rooms().peers[0]; return Boolean(q && q.parts && !q.parts.surfaces); })()', 15000).catch(() => {});
  await b.sleep(1000);
  const after = await peerA(b);
  const drawnStock = after && after.chords ? after.chords['aileron-right'] : null;
  check('R3 A\'s profile carries no tiers, and B draws its Cub stock: the aileron the tier\'s ratio smaller',
    after && after.parts && !after.parts.surfaces && drawnBig && drawnStock && Math.abs(drawnBig / drawnStock / want - 1) < 0.02,
    `${JSON.stringify(after && after.parts)}, aileron chord ${drawnBig} then ${drawnStock}, ratio ${(drawnBig / drawnStock).toFixed(3)} against ${want.toFixed(3)}`);
  const errors = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
} finally {
  await a.close();
  await b.close();
  await server.stop();
}
console.log(`pictures in ${out}`);
console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
