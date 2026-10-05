/*
 * water-war.js: the flood in a real war (docs/FLOOD.md), end to end on the
 * real shell and the real rooms server: the DAMAGE agent's damage
 * (src/share/war/damage.js through edge/rooms/war.js strike, as
 * scripts/damage-shots.js drives it) breaks gate 3, its opening reaches
 * the map's water through map.onOpening (src/render/breakage.js), and:
 *
 *   A's flood turns to a war's water and applies the opening
 *   the gate's water is gauged and handed to the world's sound
 *   A keeps up with the room's clock
 *   page B joins after, is handed the same openings, catches up, and
 *     holds the same water as A at every step both have recorded
 *   pictures from the gate's downstream side and over the spillway
 *
 *   SIM_GPU=1 node scripts/water-war.js [outdir]   (build/water-war)
 *
 * Needs the Itaipu data folder (FDFPV_ITAIPU_DATA). Pages open one after
 * the other in one browser.
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
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { INTRO_MS } from '../src/share/war/intro.js';
import { attackerCharge } from '../src/share/war/damage.js';
import STRUCTURES from '../src/share/war/itaipu-chunks.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', 'water-war');
const MISSION = MISSIONS['itaipu-2'];
const GATE = 'gate-3';
/* How long A's flood runs after the breach before B joins, s. */
const RUN_S = 60;

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) passed += 1;
  else failed += 1;
}

function seedFor(colour) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor');
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'high';
  s.graphicsAuto = false;
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.warConsent = true;
  s.livery = { 'interceptor': { regions: { frame: colour } } };
  s.parts = {};
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(s)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    localStorage.setItem('webfpv.stats.v1', JSON.stringify({ optOut: true }));
  } catch (e) { /* storage refused */ }`];
}

const frames = (p, n) => p.evaluate(`new Promise((r) => { let k = 0; const f = () => (++k >= ${n} ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
/* itaipu-views.js's aerial-spill and edge-plunge, and gate 3 from
 * downstream, as scripts/damage-shots.js frames it. */
const gateSkin = STRUCTURES[GATE].chunks.filter((c) => c.k === 'skin').reduce((a, c, _, l) => a.map((v, i) => v + c.c[i] / l.length), [0, 0, 0]);
const gateN = STRUCTURES[GATE].frame.n;
const VIEWS = {
  'gate-down': [gateSkin[0] + gateN[0] * 45 + 12, gateSkin[1] + 14, gateSkin[2] + gateN[2] * 45 - 4, gateSkin[0], gateSkin[1] - 4, gateSkin[2]],
  'aerial-spill': [-1300, 704, 900, -982, 210, -1028],
  'edge-plunge': [-700, 175, -380, -900, 110, -510],
};
async function shot(page, view, name) {
  await page.evaluate(`(window.__setCam(${VIEWS[view].join(',')}, 60), document.getElementById("ui").style.display = "none",
    document.querySelectorAll('.war-hud, .war-calls, .war-banner, .war-splash, canvas:not(#view)').forEach((n) => { n.style.visibility = 'hidden'; }), "")`);
  await frames(page, 60);
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}
const flood = (p) => p.evaluate('JSON.stringify(window.__map().parts.water.flood)').then(JSON.parse);

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-water-war-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
const roomOf = () => [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.war.match);
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`gate 3 broken in a war, the water on two pages, rooms at ${rooms}`);

let a = null;
let b = null;
try {
  a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#d8432f') });
  await a.until('window.__shellReady === true', 300000);
  await a.until('window.__map && window.__map().ready && window.__crashCam', 600000);
  const code = await a.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await a.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  await a.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await a.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await a.evaluate(`window.__warDo('start', '${MISSION.id}')`);
  await a.until("window.__war().view.state === 'live'", INTRO_MS + 30000 + (MISSION.prepMs ?? 0));
  const free = await flood(a);
  check('before the breach the map\'s water is Free Flight\'s spill', free.mode === 'free' && free.state === 'ready', `${free.mode} ${free.state}`);
  await shot(a, 'aerial-spill', '1-before-aerial');
  await shot(a, 'gate-down', '1-before-gate');

  /* Four Loiterers' warheads at gate 3, by the room, as damage-shots
   * (damage-check's table: a Loiterer opens a gate in 4, its leaf at
   * Free Flight's 2 m, since the 21.34 m leaves of #396). */
  const room = roomOf();
  const core = room.host.core;
  const aim = MISSION.targets[GATE].at;
  for (let k = 0; k < 4; k += 1) {
    const t = Math.floor(core.roomMs(Date.now()));
    room.host.run(core.war.strike(core, aim, attackerCharge('loiter'), t, 'loiter'));
    room.host.run(core.war.changed(core));
    await a.sleep(1500);
  }
  const told = core.war.match.damage;
  const openings = told.flatMap((e) => e.openings);
  check('the room breaks the gate and sends its opening', openings.some((o) => o.target === GATE), JSON.stringify(openings.map((o) => ({ ...o, normal: undefined }))));
  await a.until(`(() => { const f = window.__map().parts.water.flood; return f.mode === 'war' && f.state === 'ready' && f.step * 20 >= ${RUN_S * 1000}; })()`, (RUN_S + 120) * 1000);
  const fa = await flood(a);
  check('A\'s water turned to a war\'s and took the opening', fa.mode === 'war' && fa.events >= 1 && !fa.unplaced.includes(GATE), `${fa.events} events, step ${fa.step}, unplaced ${fa.unplaced.join(',') || 'none'}`);
  check('A keeps up with the room\'s clock', fa.behind <= 5, `${fa.behind} steps behind`);
  const flows = await a.evaluate('JSON.stringify(window.__mapFlows())').then(JSON.parse);
  check('the gate\'s water is gauged and handed to the sound', flows.some((w) => w.id === GATE && w.q > 0),
    flows.map((w) => `${w.id} ${w.q.toFixed(0)} m3/s`).join('; '));
  const falls = (await a.evaluate('JSON.stringify(window.__map().parts.water.breaches || [])').then(JSON.parse));
  check('the water through the hole is drawn falling, whole', falls.some((f) => f.q > 10 && f.flow > 0.5),
    falls.map((f) => `gate-${f.key} ${f.q.toFixed(1)} m3/s, drawn ${f.flow.toFixed(2)}`).join('; ') || 'none');
  await shot(a, 'gate-down', '2-after-gate');
  await shot(a, 'edge-plunge', '2-after-plunge');
  await shot(a, 'aerial-spill', '3-after-aerial');

  b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#2f7ad8') });
  await b.until('window.__shellReady === true', 300000);
  await b.until('window.__map && window.__map().ready', 600000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await b.until(`(() => { const f = window.__map().parts.water.flood; return f.mode === 'war' && f.state === 'ready' && f.behind <= 5 && f.step * 20 >= ${RUN_S * 1000}; })()`, 600000);
  const [fa2, fb] = [await flood(a), await flood(b)];
  const [ha, hb] = [fa2.hashes, fb.hashes];
  const common = Object.keys(ha).filter((k) => k in hb);
  const same = common.filter((k) => ha[k] === hb[k]);
  check('B, joining after, holds the same water as A at every step both recorded', common.length >= 3 && same.length === common.length,
    `${same.length} of ${common.length} steps, ${common.slice(-3).map((k) => `${k} ${ha[k]}/${hb[k]}`).join(', ')}; `
    + `A origin ${fa2.origin} step ${fa2.step} heard ${JSON.stringify(fa2.heard)}, B origin ${fb.origin} step ${fb.step} heard ${JSON.stringify(fb.heard)}`);
  const errs = [...a.errors, ...b.errors].filter((e) => !/net::ERR|Failed to load resource/.test(e));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  if (b) await b.close();
  if (a) await a.close();
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\nwater-war: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
