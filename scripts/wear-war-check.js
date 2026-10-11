/*
 * wear-war-check.js: career and war wear in the real shell (configs/
 * wear.js, docs/PARTS-WEAR.md), one pilot alone in a war on Itaipu on the
 * 7 inch, against a local edge/rooms/node.js this check starts and stops.
 *
 *   1. Put in the air for the war, a sortie is on: two starter packs of
 *      the 7 inch's spec granted and one of them flying, charged.
 *   2. Flown at full throttle half a minute, then R ends it: the delta
 *      names that pack, one cycle on it, its health down; the four motors
 *      heated, stored as settings.parts['7inch'].wear; the other pack, left full, lost its one per mille; the next
 *      sortie flies the other, healthier pack, seated worn: the prop and
 *      pack block's cell resistance is the stock one scaled by that
 *      pack's health, exactly.
 *   3. The Parts tab shows the packs, their health and cycles.
 * And no page error.
 *
 *   node scripts/wear-war-check.js [outdir]
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { startRooms } from '../edge/rooms/node.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SIM_PROP_PACK, propPackDoubles } from '../configs/motors.js';
import { NEW } from '../configs/wear.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = process.argv[2] || null;

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

const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch');
Object.assign(s, {
  map: 'itaipu', freestyleMap: 'itaipu', graphics: 'low', flightMode: 'angle', fpsCap: 0, airframeAsked: true, warConsent: true,
});
const seed = [`try {
  const k = ${JSON.stringify(SETTINGS_KEY)};
  const s = JSON.parse(localStorage.getItem(k) || '{}');
  if (!s.wearSeeded) {
    Object.assign(s, ${JSON.stringify(s)}, { wearSeeded: true });
    localStorage.setItem(k, JSON.stringify(s));
  }
} catch (e) { /* storage refused */ }`];

const SPEC = '6s4200li';
const A = `7inch-${SPEC}-1`;
const B = `7inch-${SPEC}-2`;
const choice = { option: 'stock', prop: 'stock', pack: 'stock' };

const dir = await mkdtemp(join(tmpdir(), 'wear-war-'));
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
const page = await openPage({ root, url: `/index.html?rooms=${encodeURIComponent(rooms)}`, width: 1280, height: 720, seed });
const wear = () => page.evaluate('JSON.parse(JSON.stringify({ w: window.__wear(), packs: window.__ui.settings.packs, parts: window.__ui.settings.parts }))');

try {
  await page.until('window.__shellReady === true', 300000);
  await page.until('window.__map && window.__map().ready', 600000);
  await page.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await page.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await page.evaluate("window.__ui.act('friends'); true");
  await page.sleep(500);
  await page.evaluate("window.__warDo('start', 'itaipu-drill')");
  await page.until("window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'", 120000).catch(() => {});

  console.log('1. a sortie in the war');
  await page.until('Boolean(window.__wear().sortie)', 20000).catch(() => {});
  const w1 = await wear();
  check('two starter packs of the 7 inch\'s spec, granted', Object.keys(w1.packs).sort().join() === [A, B].join() && Object.values(w1.packs).every((p) => p.spec === SPEC), JSON.stringify(w1.packs));
  check('a sortie flies one of them, charged', w1.w.sortie && [A, B].includes(w1.w.sortie.packId) && w1.packs[w1.w.sortie.packId].charge === 'full', JSON.stringify(w1.w.sortie));
  /* The harness stick (src/input), full throttle half a minute: a pilot
   * taking off, so the motors heat. */
  await page.evaluate('window.__input.harnessChannels = { roll: 0, pitch: 0, yaw: 0, throttle: 1 }; true');
  await page.until('window.__wear().sortie && window.__wear().sortie.fullS > 31', 120000).catch(() => {});
  await page.evaluate('window.__input.harnessChannels = null; true');
  const flown = (await wear()).w.sortie;
  check('it flies, the seconds at full throttle counted', flown && flown.flew && flown.fullS > 31, JSON.stringify(flown));

  console.log('2. R ends it and the next sortie flies the other pack, worn');
  const first = (await wear()).w.sortie.packId;
  const other = first === A ? B : A;
  await page.tap('KeyR');
  await page.until('Boolean(window.__wear().delta)', 20000).catch(() => {});
  const w2 = await wear();
  const d = w2.w.delta;
  check('the delta names the flown pack: one cycle, health down', d && d.pack && d.pack.id === first && d.pack.cycles === 1 && d.pack.after < NEW && d.airframe === '7inch', JSON.stringify(d));
  const heat = d ? d.parts.filter((p) => p.part === 'motor' && p.cause === 'heat') : [];
  const rec = w2.parts['7inch'] && w2.parts['7inch'].wear;
  check('the four motors heated a per mille, stored as the lead\'s record on the parts entry', heat.length === 4 && rec && rec.v === 1 && heat.every((p) => rec.parts[p.i] === p.after), JSON.stringify(rec));
  check('the pack left on the shelf full lost its one per mille', w2.packs[other].health === NEW - 1, String(w2.packs[other].health));
  check('the next sortie flies the other, healthier pack', w2.w.sortie && w2.w.sortie.packId === other, JSON.stringify(w2.w.sortie));
  const want = propPackDoubles('7inch', choice)[SIM_PROP_PACK.R_CELL] * ((2 * NEW - w2.packs[other].health) / NEW);
  const got = w2.w.seated && w2.w.seated.propPack ? w2.w.seated.propPack[SIM_PROP_PACK.R_CELL] : null;
  check('seated worn: the cell resistance scaled by its health, exactly', got === want, `${got} vs ${want}`);

  console.log('3. the Parts tab shows the packs');
  await page.tap('Escape');
  await page.until("window.__ui.screen === 'paused'", 10000).catch(() => {});
  await page.evaluate("window.__ui.show('title'); window.__ui.openCraftRow(false); true");
  await page.until('window.__ui.carousel.isOpen', 10000);
  await page.evaluate("window.__ui.carousel.setFilter('all'); true");
  const at = await page.evaluate("window.__ui.carousel.ids.indexOf('7inch')");
  await page.evaluate(`window.__ui.carousel.goTo(${at}); true`);
  await page.tap('KeyC');
  await page.until('window.__ui.hangar.isOpen', 10000);
  await page.click('.hangar [data-key="tab-parts"]');
  await page.until("window.__ui.hangar.tab === 'parts'", 5000);
  await page.sleep(500);
  const rows = await page.evaluate("[...document.querySelectorAll('.parts-damage-row.pack')].map((r) => ({ key: r.dataset.key, text: r.textContent }))");
  check('both packs on the shelf with health and cycles', rows.length === 2 && rows.some((r) => r.key === `pack-${first}` && / 1 cycles/.test(r.text)), JSON.stringify(rows));
  if (out) {
    await mkdir(out, { recursive: true });
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
    await writeFile(join(out, 'parts-tab-packs.png'), Buffer.from(data, 'base64'));
  }
  await page.tap('Escape');
  await page.until('!window.__ui.hangar.isOpen', 10000).catch(() => {});

  const errs = page.errors.filter((e) => !e.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await page.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
