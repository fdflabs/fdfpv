/*
 * hangar-visit-room-two-page.js: visiting a pilot of the room you are in
 * (docs/HANGAR-VISITS.md), on two signed in pages of the real shell, one
 * tracks server with sign in on and a rooms server that seats pilots by
 * their callsigns. Bravo opens its hangar to visitors with the command
 * bar's switch; Alpha makes a room, Bravo joins it, and Alpha's walkable
 * hangar offers "Visit Bravo" in its command bar: a real pointer on it
 * opens Bravo's hangar with no callsign typed.
 *
 *     SIM_GPU=1 node scripts/hangar-visit-room-two-page.js [OUT_DIR]
 *
 * Run with npm run hangar:visitroom, through ~/.cache/run-check-slot.sh.
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
import { startAccounts, seedSignedIn } from '../tests/lib/account.js';
import { roomsServer } from '../tests/lib/roomsserver.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] || join(tmpdir(), 'hangar-visit-room');
mkdirSync(out, { recursive: true });

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    failed += 1;
  }
}

const accounts = await startAccounts();
const stamp = `${process.pid}-${Date.now()}`;
const alpha = await accounts.signUp(`alpha-${stamp}`, 'Alpha');
const bravo = await accounts.signUp(`bravo-${stamp}`, 'Bravo');
const rooms = await roomsServer('', 'hangar-visit-room', { accountsOrigin: accounts.origin });
const url = `/index.html?rooms=${encodeURIComponent(rooms.url)}`;
const a = await openPage({ root, url, width: 1600, height: 900, seed: [seedSignedIn(accounts.origin, alpha)] });
const b = await openPage({ root, url, width: 1280, height: 720, seed: [seedSignedIn(accounts.origin, bravo)] });
const status = async (callsign) => (await fetch(`${accounts.origin}/api/hangar/${callsign}`)).status;
async function walkIn(p) {
  await p.evaluate('window.__ui.hub = null; window.__ui.show("title"); window.__ui.renderMenu(); true');
  await p.sleep(300);
  await p.click('.gate-card.gate-card-hub-hangar');
  await p.until("window.__ui.hub === 'hangar'", 10000);
  await p.click('.gate-card.gate-card-hangar-walk');
  await p.until("window.__ui.screen === 'walk' && window.__walkStats() && window.__walkStats().view", 20000);
}
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
    await p.loaded(60000);
  }
  /* Bravo opens its hangar from its own command bar. */
  await walkIn(b);
  check('Bravo\'s switch, clicked', await b.click('.frame-legend .legend-act[data-action="walk-visits"]'), 'clicked');
  let open = false;
  for (let k = 0; k < 40 && !open; k += 1) {
    await b.sleep(500);
    open = (await status('Bravo')) === 200;
  }
  check('Bravo\'s hangar is open', open, String(open));

  /* Alpha is in its hangar when the room fills: inside a room the title
   * is the room screen, so the hub is reached before. */
  await walkIn(a);
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1", 30000);
  }
  check('Alpha sees Bravo in the room by callsign', (await a.evaluate('window.__rooms().peers[0].name')) === 'Bravo', await a.evaluate('window.__rooms().peers[0].name'));

  await a.sleep(1500);
  console.log(`Alpha is on ${await a.evaluate("window.__ui.screen")}`);
  const sel = '.frame-legend .legend-act[data-action="walk-visit:Bravo"]';
  const offered = await a.evaluate(`document.querySelector('${sel}')?.textContent || null`);
  check('Alpha\'s command bar offers Visit Bravo', Boolean(offered) && offered.includes(en['walk.visit_peer'].replace('{callsign}', 'Bravo')), JSON.stringify(offered));
  check('Visit Bravo, clicked', await a.click(sel), 'clicked');
  await a.until("window.__walkStats() && window.__walkStats().visit === 'Bravo' && window.__walkStats().view", 20000).then(() => true, () => false);
  const s = await a.evaluate('window.__walkStats()');
  check('in Bravo\'s hangar, with no callsign typed', s && s.visit === 'Bravo' && !(await a.evaluate("Boolean(document.querySelector('.name-dialog:not([hidden])'))")), JSON.stringify(s && s.visit));
  const { data } = await a.cdp.send('Page.captureScreenshot', { format: 'png' }, a.sessionId);
  writeFileSync(join(out, 'visit-from-room.png'), Buffer.from(data, 'base64'));
  const errors = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
} finally {
  await a.close();
  await b.close();
  await rooms.stop();
  await accounts.stop();
}
console.log(`pictures in ${out}`);
console.log(failed ? `${failed} failed` : 'all passed');
process.exitCode = failed ? 1 : 0;
