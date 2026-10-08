/*
 * hangar-lineup-two-page.js: the room's lineup (docs/SHOW-IT-OFF.md part
 * 3) on two pages of the real shell in one room on a rooms server of the
 * check's own (tests/lib/roomsserver.js). Page A seats a red Cub and makes
 * the room, page B a blue P-51 and joins it. A opens Lineup from the room
 * screen with a real pointer: both aircraft stand side by side in the
 * airfield hangar, A's own first, and the card names both pilots and
 * aircraft. Escape is the room screen again. Pictures in OUT_DIR.
 *
 *     SIM_GPU=1 node scripts/hangar-lineup-two-page.js [ROOMS_URL] [OUT_DIR]
 *
 * Run with npm run hangar:lineup, through ~/.cache/run-check-slot.sh here.
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openPage } from '../tests/lib/page.js';
import { roomsServer } from '../tests/lib/roomsserver.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[3] || join(tmpdir(), 'hangar-lineup');
mkdirSync(out, { recursive: true });

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}

function seedFor(id, colour) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, id);
  Object.assign(s, { map: 'swiss2', freestyleMap: 'swiss2', graphics: 'low', fpsCap: 0, airframeAsked: true });
  s.livery = { [id]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.lineupSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { lineupSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

const server = await roomsServer(process.argv[2], 'hangar-lineup');
const url = `/index.html?rooms=${encodeURIComponent(server.url)}`;
const a = await openPage({ root, url, width: 1600, height: 900, seed: seedFor('cub1400', '#d8432f') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('p51d1450', '#2f6fd6') });
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
  await a.evaluate("window.__ui.show('friends'); window.__ui.renderMenu(); true");
  await a.until("Boolean(document.querySelector('.row.row-lineup'))", 15000);
  await a.loaded(60000);
  /* The room screen repaints its rows as the room talks; a click that
   * lands between two paints finds no row, so it is tried again. */
  let clicked = false;
  for (let k = 0; k < 10 && !clicked; k += 1) {
    clicked = await a.click('.row.row-lineup') && await a.until("window.__ui.screen === 'walk'", 2000).then(() => true, () => false);
  }
  check('the room screen has a Lineup row, clicked', clicked, String(clicked));
  await a.until("window.__ui.screen === 'walk' && window.__walkStats() && window.__walkStats().view && window.__walkStats().view.lineup === 2", 20000).then(() => true, () => false);
  await a.sleep(1200);
  const s = await a.evaluate('window.__walkStats()');
  check('both aircraft stand in the lineup, this pilot\'s first', s && s.view.lineup === 2 && s.lineup.join(',') === 'cub1400,p51d1450', JSON.stringify(s && s.lineup));
  check('in the airfield hangar', s && s.tier === 'airfield', s && s.tier);
  const card = await a.evaluate("document.querySelector('.walk-lineup').hidden ? null : document.querySelector('.walk-lineup').textContent");
  const bName = await a.evaluate('window.__rooms().peers[0].name || null');
  check('the card names both aircraft', Boolean(card) && card.includes(airframeById('cub1400').name) && card.includes(airframeById('p51d1450').name), JSON.stringify(card));
  check('and the other pilot by name', Boolean(card) && Boolean(bName) && card.includes(bName) && card.includes(en['walk.lineup_you']), `${JSON.stringify(card)}, B is ${bName}`);
  const { data } = await a.cdp.send('Page.captureScreenshot', { format: 'png' }, a.sessionId);
  writeFileSync(join(out, 'lineup.png'), Buffer.from(data, 'base64'));
  await a.tap('Escape');
  await a.until("window.__ui.screen === 'friends'", 10000).then(() => true, () => false);
  check('Escape is the room screen again', await a.evaluate("window.__ui.screen === 'friends'"), await a.evaluate('window.__ui.screen'));
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
