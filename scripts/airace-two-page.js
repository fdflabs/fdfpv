/*
 * airace-two-page.js: npm run airace:twopage, a race room's AI pilots on
 * the real plant (edge/rooms/airace.js, docs/AI-PILOTS-RACES-CONTRACT.md)
 * in headless pages of the real shell, against edge/rooms/node.js started
 * here on a scratch database:
 *
 *   SIM_GPU=1 node scripts/airace-two-page.js [outdir]
 *
 * Page A, a person in the interceptor, makes a public room made for a
 * race on the Swiss valley and sends it a ring of three gates over the
 * field. The room flies its reference lap and AI pilots fill the grid to
 * four: A draws each as a peer named as AI, in the interceptor, a quad.
 * Page B joins before the start and takes one's place; B leaves and it
 * comes back. A starts a one lap race and is thrown through its gates
 * (window.__crashThrow, real physics carrying it through each opening, as
 * scripts/rooms-race-two-page.js does). Meanwhile A's standings show the
 * AI pilots' laps moving gate by gate, their passes the room's own, and
 * at the end A's results screen holds A and every AI pilot, each with a
 * time. The only lap record A's page wrote is A's own lap; the AI pilots'
 * laps are room results and nothing else. Pictures in outdir, which is
 * not in the repository.
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
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { startRooms } from '../edge/rooms/node.js';
import { FILL_TO } from '../edge/rooms/roombots.js';
import { AI_RACE_AIRFRAME, aiRaceUnavailable, kitLoaded } from '../edge/rooms/airace.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'airace-two-page');
const TRACK_ID = 'trk-airace1';

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

function seedFor(id) {
  const s = seatAirframe({ airframe: id, rates: airframeById(id).rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const state = (p) => p.evaluate('window.__roomRace()');
const aiPeers = async (p) => (await p.evaluate('window.__rooms()')).peers.filter((x) => /^AI /.test(x.name));
/* Every lap record the page holds: src/game/race.js writes them under
 * src/main.js recordKey(), webfpv.best and the seat's parts, or its
 * default webfpv.bestLapMs. */
const RECORDS = `JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('webfpv.best')).map((k) => [k, localStorage.getItem(k)])))`;

/* rooms-race-two-page.js throwThrough: through the race's next gate at
 * 14 m/s, then held 8 m past it until the next throw. */
async function throwThrough(p) {
  const before = await p.evaluate(`(() => {
    const r = window.__race();
    const g = r.gates[r.next];
    const cy = g.apertures[0].centreY;
    const c = { x: g.x + g.ay.x * cy, y: g.y + g.ay.y * cy, z: g.z + g.ay.z * cy };
    const t = g.az;
    const yaw = Math.atan2(-t.x, -t.z) * 180 / Math.PI;
    window.__crashThrow({ x: c.x - t.x * 5, y: c.y - t.y * 5, z: c.z - t.z * 5, yaw, vx: t.x * 14, vy: t.y * 14 + 1, vz: t.z * 14 });
    return { next: r.next };
  })()`);
  try {
    await p.until(`(() => { const r = window.__race(); return r.next !== ${before.next} || window.__roomRace().role !== 'racing'; })()`, 2500);
  } catch (e) {
    return false;
  }
  await p.evaluate(`(() => {
    const g = window.__race().gates[${before.next}];
    const cy = g.apertures[0].centreY;
    const t = g.az;
    const c = { x: g.x + g.ay.x * cy + t.x * 8, y: g.y + g.ay.y * cy, z: g.z + g.ay.z * cy + t.z * 8 };
    if (window.__roomRace().role === 'racing') {
      window.__crashThrow({ x: c.x, y: c.y, z: c.z, yaw: Math.atan2(-t.x, -t.z) * 180 / Math.PI, hold: true });
    }
    return true;
  })()`);
  return true;
}

await kitLoaded;
if (aiRaceUnavailable()) {
  console.log(`  FAIL  this process cannot fly AI racers: ${aiRaceUnavailable()}`);
  process.exit(1);
}
const localRooms = await startRooms({ db: join(await mkdtemp(join(tmpdir(), 'fdfpv-airace-')), 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${localRooms.port}`;
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`a person races the room's AI pilots, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('interceptor') });
let b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('interceptor') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate("window.__roomCreate({ map: 'swiss2', mode: 'race', public: true })");
  await a.until("window.__rooms().phase === 'open' && window.__rooms().roomNow != null", 30000);
  const made = await a.evaluate('window.__rooms()');
  check('A makes a public room made for a race, alone in it, no AI pilot before a track', made.mode === 'race' && made.public && made.peers.length === 0,
    `${code} ${made.mode} ${made.peers.length} peers`);

  /* Three gates on a ring 60 m across, 6 m over the field, 90 m ahead
   * of the valley's spawn. */
  const sp = (await a.evaluate('window.__map()')).spawn;
  const fx = -Math.sin(sp.yaw);
  const fz = -Math.cos(sp.yaw);
  const doc = mapTrackDocument({
    id: TRACK_ID, name: 'AI ring', map: 'swiss2', types: ['gate', 'gate', 'gate'],
    centre: [sp.x + fx * 90, sp.y + 6, sp.z + fz * 90], radius: 30,
  });
  await a.evaluate(`(() => {
    localStorage.setItem('webfpv.share.import.v1', JSON.stringify({ id: ${JSON.stringify(doc.id)}, name: ${JSON.stringify(doc.name)}, author: '', board: '', document: ${JSON.stringify(doc)}, local: true, importedUtc: new Date().toISOString() }));
    window.__ui.play();
    return true;
  })()`);
  await a.until("window.__map().ready && window.__map().gates === 3", 120000);
  const recordsBefore = JSON.parse(await a.evaluate(RECORDS));
  await a.evaluate("window.__roomRaceDo('race-send'); true");
  await a.until(`(() => { const r = window.__rooms(); return r.peers.filter((x) => /^AI /.test(x.name)).length === ${FILL_TO - 1}; })()`, 60000);
  const ai = await aiPeers(a);
  check(`the room flies its lap and ${FILL_TO - 1} AI pilots fill the grid, named as AI, in the ${AI_RACE_AIRFRAME}`,
    ai.length === FILL_TO - 1 && ai.every((x) => x.airframe === AI_RACE_AIRFRAME),
    ai.map((x) => `${x.seat}:${x.name}:${x.airframe}`).join(' '));
  await a.until(`(() => { const r = window.__rooms(); return r.peers.filter((x) => /^AI /.test(x.name) && x.drawn).length === ${FILL_TO - 1}; })()`, 30000);
  check('A draws every one of them', true);

  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await b.until("window.__rooms().phase === 'open'", 30000);
  await a.until(`window.__rooms().peers.filter((x) => /^AI /.test(x.name)).length === ${FILL_TO - 2}`, 15000);
  const withB = await aiPeers(b);
  check('B joins before the start and takes one AI pilot\'s place; B sees the rest named as AI', withB.length === FILL_TO - 2, `${withB.length} on B`);
  await b.close();
  b = null;
  await a.until(`window.__rooms().peers.filter((x) => /^AI /.test(x.name)).length === ${FILL_TO - 1}`, 30000);
  check('B leaves and an AI pilot comes back', true);

  await a.until(`window.__roomRace().race.ready.length === ${FILL_TO}`, 60000);
  check('A and every AI pilot are ready on the grid', true);
  await a.evaluate("window.__ui.act('friends'); true");
  await a.sleep(1200);
  await shot(a, '1-a-grid');
  await a.evaluate("window.__roomRaceDo('race-start', 1); true");
  await a.until("window.__roomRace().role === 'countdown'", 15000);
  const off = await state(a);
  check('the race goes off with A and the AI pilots', off.race.racers.length === FILL_TO, `racers ${off.race.racers.join(',')}`);
  await a.until("window.__roomRace().role === 'racing'", 15000);

  let thrown = true;
  let seenMoving = 0;
  const t0 = Date.now();
  while ((await state(a)).race.state !== 'results' && Date.now() - t0 < 180000) {
    if ((await state(a)).role === 'racing') {
      thrown = (await throwThrough(a)) && thrown;
      await a.sleep(1200);
    } else {
      await a.sleep(500);
    }
    const now = await state(a);
    const moving = now.standings.filter((r) => ai.some((x) => x.seat === r.seat) && (r.gate > 0 || r.lap > 0 || r.ms != null)).length;
    if (moving > seenMoving) {
      seenMoving = moving;
      if (moving === FILL_TO - 1) {
        await shot(a, '2-a-racing');
      }
    }
  }
  check('every throw went through the gate it aimed at', thrown);
  check('A\'s standings showed every AI pilot passing gates', seenMoving === FILL_TO - 1, `${seenMoving} seen moving`);
  await a.until("window.__roomRace().race.state === 'results' && window.__roomRace().results", 30000);
  const end = await state(a);
  const mine = (await a.evaluate('window.__rooms()')).seat;
  console.log(`  A's results: ${end.standings.map((r) => `${r.place}:${r.seat}:${r.ms}`).join(' ')}`);
  check('A\'s results hold A and every AI pilot, each with a time',
    end.standings.length === FILL_TO && end.standings.every((r) => r.ms != null) && end.standings.some((r) => r.seat === mine));
  await a.sleep(800);
  await shot(a, '3-a-results');
  const recordsAfter = JSON.parse(await a.evaluate(RECORDS));
  const written = Object.keys(recordsAfter).filter((k) => recordsAfter[k] !== recordsBefore[k]);
  const myLap = await a.evaluate('window.__race().laps[0]');
  check('the only lap record A\'s page wrote is A\'s own lap', written.length === 1 && Math.abs(Number(recordsAfter[written[0]]) - myLap) <= 1,
    `${written.map((k) => `${k}=${recordsAfter[k]}`).join(' ')}; A's lap ${myLap}`);
  const errs = a.errors.filter((x) => !x.startsWith('network:'));
  check('no page error', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  if (b) {
    await b.close();
  }
  await localRooms.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
