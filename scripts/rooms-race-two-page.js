/*
 * rooms-race-two-page.js: two headless pages of the real shell race each
 * other in one room, the browser half of Phase 4's check (docs/
 * MULTIPLAYER-PLAN.md section 12; the Node half is the race section of
 * scripts/rooms-selftest.js). By hand, against a running rooms Worker:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8797
 *   SIM_GPU=1 node scripts/rooms-race-two-page.js http://127.0.0.1:8797 [outdir]
 *
 * or, with no Worker, on the VM's server run in this process
 * (edge/rooms/node.js) on a scratch database:
 *
 *   SIM_GPU=1 node scripts/rooms-race-two-page.js local [outdir]
 *
 * Page A flies the five inch and makes the room, page B the Cub and joins
 * it. A plays a three gate track hung over the Swiss valley's field (a
 * gate, a sky hoop, a gate) and sends it to the room; B's world stands it
 * up by itself and both say they are ready. A starts a one lap race. Both
 * are held on their own slots of the start row through the countdown, and
 * let go at the room's goAt: the skew between the two pages' release, on
 * this machine's one wall clock, is printed. Then each is thrown through
 * its gates in order (window.__crashThrow, real physics carrying it
 * through each opening), A quicker than B, and both results screens must
 * show the same order and the same times, and each its debrief
 * (docs/DEBRIEF.md): its place, and the replay row. Then A races again (the
 * rematch) and ends it early. Pictures in outdir, which is not in the
 * repository: a picture is evidence for one round.
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
import { slotSpawn } from '../src/game/slots.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let rooms = process.argv[2] || 'http://127.0.0.1:8797';
let localRooms = null;
if (rooms === 'local') {
  const { startRooms } = await import('../edge/rooms/node.js');
  localRooms = await startRooms({ db: join(await mkdtemp(join(tmpdir(), 'fdfpv-racetwo-')), 'rooms.db'), port: 0 });
  rooms = `http://127.0.0.1:${localRooms.port}`;
}
const outDir = process.argv[3] || join(root, 'build', 'rooms-race-two-page');

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
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, id);
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

/*
 * Throw the craft through the race's next gate: 5 m before the opening's
 * centre, level, nose along the gate's direction of travel, at 14 m/s
 * along it, so the physics carries it through. Once the race has moved
 * past that gate it is caught 8 m beyond it and held there (the throw's
 * own hold, the integrator still) until the next throw, so a quad with its
 * throttle shut does not fall out of the sky between throws on a machine
 * that runs the page at a few frames a second, and wreck, which voids the
 * lap. Resolves true, or false when the gate did not score in 2.5 s.
 */
async function throwThrough(p) {
  const before = await p.evaluate(`(() => {
    const r = window.__race();
    const g = r.gates[r.next];
    const cy = g.apertures[0].centreY;
    const c = { x: g.x + g.ay.x * cy, y: g.y + g.ay.y * cy, z: g.z + g.ay.z * cy };
    const t = g.az;
    const yaw = Math.atan2(-t.x, -t.z) * 180 / Math.PI;
    window.__crashThrow({ x: c.x - t.x * 5, y: c.y - t.y * 5, z: c.z - t.z * 5, yaw, vx: t.x * 14, vy: t.y * 14 + 1, vz: t.z * 14 });
    return { next: r.next, lap: r.log.length, passes: window.__roomRace().laps };
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

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`two pages race in one room, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('interceptor') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('cub1400') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  check('page A makes a room', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
  }

  /* The track: three gates on a ring 50 m across, hung 20 m over the
   * field, 90 m ahead of the valley's spawn, so the start is an air start
   * and nothing on the ground is in the way. */
  const sp = (await a.evaluate('window.__map()')).spawn;
  const fx = -Math.sin(sp.yaw);
  const fz = -Math.cos(sp.yaw);
  const doc = mapTrackDocument({
    id: 'trk-phase4a1', name: 'Phase four', map: 'swiss2', types: ['gate', 'hoop30', 'gate'],
    centre: [sp.x + fx * 90, sp.y + 20, sp.z + fz * 90], radius: 50,
  });
  await a.evaluate(`(() => {
    localStorage.setItem('webfpv.share.import.v1', JSON.stringify({ id: ${JSON.stringify(doc.id)}, name: ${JSON.stringify(doc.name)}, author: '', board: '', document: ${JSON.stringify(doc)}, local: true, importedUtc: new Date().toISOString() }));
    window.__ui.play();
    return true;
  })()`);
  /* Play puts the track's world up with its gates and opens the launch
   * card; the host does not have to fly it to send it. */
  await a.until("window.__map().ready && window.__map().gates === 3", 120000);
  await a.evaluate("window.__roomRaceDo('race-send'); true");
  await b.until("window.__roomRace().track && window.__roomRace().track.id === 'trk-phase4a1'", 15000);
  check('the host sends the track and the other page has it', true);
  for (const p of [a, b]) {
    await p.until("window.__roomRace().race.ready.length === 2", 120000);
  }
  const sb = await state(b);
  check('B\'s world stood it up by itself, and both are ready', sb.seated && sb.ready, JSON.stringify({ seated: sb.seated, ready: sb.ready }));
  await b.sleep(1500);
  await shot(b, '1-b-title-track-loaded');
  await a.evaluate("window.__ui.act('friends'); true");
  await a.sleep(1200);
  await shot(a, '1-a-friends-race-rows');

  await a.evaluate("window.__roomRaceDo('race-start', 1); true");
  for (const p of [a, b]) {
    await p.until("window.__roomRace().role === 'countdown' && window.__roomRace().hold > 0", 15000);
  }
  const ca = await state(a);
  const cb = await state(b);
  check('both are on the line for the same goAt', ca.race.goAt === cb.race.goAt && ca.run === ca.race.id && cb.run === cb.race.id, `${ca.race.goAt} ${cb.race.goAt}`);
  const posA = await a.evaluate('window.__craftState()');
  const posB = await b.evaluate('window.__craftState()');
  const trackSpawn = await a.evaluate('window.__map().spawn');
  const slot1 = slotSpawn(trackSpawn, 1);
  check('A on the start row\'s first slot, B 8 m across on the second', Math.hypot(posA.worldX - trackSpawn.x, posA.worldZ - trackSpawn.z) < 1
    && Math.hypot(posB.worldX - slot1.x, posB.worldZ - slot1.z) < 1.5,
  `A ${Math.hypot(posA.worldX - trackSpawn.x, posA.worldZ - trackSpawn.z).toFixed(2)} m, B ${Math.hypot(posB.worldX - slot1.x, posB.worldZ - slot1.z).toFixed(2)} m`);
  await b.sleep(1200);
  await shot(b, '2-b-countdown');
  const heldA = await a.evaluate('window.__craftState()');
  check('the countdown holds the aircraft still', Math.hypot(heldA.worldX - posA.worldX, heldA.worldY - posA.worldY, heldA.worldZ - posA.worldZ) < 0.05);

  for (const p of [a, b]) {
    await p.until("window.__roomRace().role === 'racing' && window.__roomRace().goWall != null", 15000);
  }
  const ga = await state(a);
  const gb = await state(b);
  const skew = Math.abs(ga.goWall - gb.goWall);
  console.log(`  start skew between the two pages: ${skew} ms (A let go at ${ga.goWall}, B at ${gb.goWall})`);
  check('both let go at the same moment, within two frames', skew < 100, `${skew} ms`);

  /* A throws every 1.2 s, B every 2 s: A is through first. */
  let aOk = true;
  let bOk = true;
  let aNext = 0;
  let bNext = 0;
  let hudShot = false;
  const t0 = Date.now();
  while ((await state(a)).role === 'racing' || (await state(b)).role === 'racing') {
    const t = Date.now() - t0;
    if (t >= aNext && (await state(a)).role === 'racing') {
      aOk = (await throwThrough(a)) && aOk;
      aNext = Date.now() - t0 + 1200;
    }
    if (t >= bNext && (await state(b)).role === 'racing') {
      bOk = (await throwThrough(b)) && bOk;
      bNext = Date.now() - t0 + 2000;
      if (!hudShot && (await state(b)).laps === 0 && (await b.evaluate('window.__race().next')) === 2) {
        hudShot = true;
        await shot(b, '3-b-racing-hud');
      }
    }
    if (Date.now() - t0 > 90000) {
      break;
    }
    await a.sleep(100);
  }
  check('every throw went through the gate it aimed at, on both pages', aOk && bOk, `A ${aOk} B ${bOk}`);
  for (const p of [a, b]) {
    await p.until("window.__roomRace().race.state === 'results' && window.__roomRace().results", 20000);
  }
  const ra = await state(a);
  const rb = await state(b);
  const line = (s) => s.standings.map((r) => `${r.place}:${r.seat}:${r.ms}`).join(' ');
  console.log(`  A's results: ${line(ra)}`);
  console.log(`  B's results: ${line(rb)}`);
  check('both results screens agree, order and times', line(ra) === line(rb) && ra.standings.length === 2);
  check('A first, B second, both finished', ra.standings[0].seat === 1 && ra.standings[1].seat === 2
    && ra.standings[0].ms > 0 && ra.standings[1].ms > ra.standings[0].ms);
  const cub = ra.standings.find((r) => r.seat === 2);
  const quad = ra.standings.find((r) => r.seat === 1);
  check('the Cub\'s points came with it, the quad has none', cub.points > 0 && quad.points === 0, `${cub.points} ${quad.points}`);
  await a.sleep(800);
  /* Each page's debrief: its own place in the room's order, and the
   * replay of its own flight offered among the room's rows. */
  const DEBRIEF = `(() => {
    const dts = [...document.querySelectorAll('.results-facts dt')].map((n) => n.textContent);
    const dds = [...document.querySelectorAll('.results-facts dd')].map((n) => n.textContent);
    const place = dds[dts.indexOf('Place')] ?? null;
    const items = window.__ui.items().map((it) => it.action);
    return JSON.stringify({ dts, place, replay: items.indexOf('watchreplay'), flyOn: items.indexOf('restart'), items });
  })()`;
  const da = JSON.parse(await a.evaluate(DEBRIEF));
  const db = JSON.parse(await b.evaluate(DEBRIEF));
  check('A\'s debrief: first of two, with its time in the air', da.place === '1 of 2' && da.dts.includes('In the air'), JSON.stringify(da));
  check('B\'s debrief: second of two', db.place === '2 of 2', JSON.stringify(db));
  check('the replay sits right under Fly on, on both', da.flyOn >= 0 && da.replay === da.flyOn + 1 && db.flyOn >= 0 && db.replay === db.flyOn + 1,
    `A ${da.items.join(',')} B ${db.items.join(',')}`);
  await shot(a, '4-a-results');
  await shot(b, '5-b-results');

  /* The rematch, from the results screen, and the host ends it. */
  await a.evaluate("window.__roomRaceDo('race-start', 2); true");
  for (const p of [a, b]) {
    await p.until("window.__roomRace().role === 'countdown' && window.__roomRace().race.laps === 2", 15000);
  }
  const m = await state(b);
  check('race again: both back on the line for a second race', m.race.id === ra.race.id + 1 && m.run === m.race.id, JSON.stringify({ id: m.race.id, was: ra.race.id, run: m.run, role: m.role }));
  await a.until("window.__roomRace().role === 'racing'", 15000);
  await throwThrough(a);
  await a.evaluate("window.__roomRaceDo('race-end'); true");
  for (const p of [a, b]) {
    await p.until("window.__roomRace().race.state === 'results' && window.__roomRace().results", 20000);
  }
  const e = await state(b);
  check('the host ends it, and both have the unfinished results', e.standings.length === 2 && e.standings.every((r) => r.ms == null));
  await shot(b, '6-b-ended');

  const errs = [...a.errors, ...b.errors].filter((x) => !x.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
  if (localRooms) {
    await localRooms.stop();
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
