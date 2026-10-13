/*
 * watch-two-page.js: a watcher sees a room's race (redesign phase 17), the
 * browser half of the watch seat's state; the Node half is the "what a
 * watcher sees" section of scripts/rooms-selftest.js. On the VM's server
 * run in this process (edge/rooms/node.js) on a scratch database:
 *
 *   SIM_GPU=1 node scripts/watch-two-page.js [outdir]
 *
 * Page A flies the five inch, makes the room, plays a three gate track
 * hung over the Swiss valley's field and sends it to the room. Page B
 * joins on the watch seat (seat 0). A starts a two lap race alone and is
 * thrown through its gates (window.__crashThrow, real physics carrying it
 * through each opening). B's flight screen must show the race's
 * standings with A's lap count moving, lap 1 of 2 then 2 of 2, then A's
 * time; at the end B gets no results screen, no round in its event log
 * and nothing of its own in the standings, and its standings stay up as
 * the final order.
 *
 * Then a lobby: A makes a room for Catch the Ace and presses Ready the
 * moment it is in (the page's joining texts would have dropped it), then
 * stands down; B, put on the title, joins it to watch. B is never pulled to the lobby's Ready (it
 * stays on its watch camera, its own ready goes nowhere) and its banner
 * says who is ready; A readying alone starts the five seconds, the
 * watcher never counted.
 *
 * Then a war: A makes a room on Itaipu and flies, B watches it, A starts
 * the drill. B's war HUD shows the round and Watching, no airframes and
 * no kills; B is put in no war aircraft; A's developer skip ends the
 * round and B sees its card; A ends the war and B sees the end banner
 * with no result in its view, its campaign untouched, while A's view has
 * one. Pictures in outdir, which is not in the repository.
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
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import { startRooms } from '../edge/rooms/node.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || join(root, 'build', 'watch-two-page');
const dir = await mkdtemp(join(tmpdir(), 'fdfpv-watchtwo-'));
/* devMissions: the host's developer skip, which ends the drill's round. */
const server = await startRooms({ db: join(dir, 'rooms.db'), port: 0, devMissions: true });
const rooms = `http://127.0.0.1:${server.port}`;
const t0 = Date.now();

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
/* What the watcher's flight screen shows of the race: the box's title and
 * its rows as drawn, or null when it is off. */
const HUD = `(() => {
  const box = [...document.querySelectorAll('.room-race')].find((n) => !n.classList.contains('is-off') && n.querySelector('.room-race-row'));
  if (!box) { return null; }
  return {
    title: box.querySelector('.room-race-title').textContent,
    rows: [...box.querySelectorAll('.room-race-row')].map((r) => ({
      place: r.querySelector('.room-race-place').textContent, name: r.querySelector('.room-race-name').textContent, value: r.querySelector('.room-race-value').textContent,
    })),
  };
})()`;
/* The game's events in the watcher's flight log (src/game/events.js). */
const LOGGED = "window.__ui.progress.flight.events.filter((e) => ['round', 'gate', 'lap', 'kill'].includes(e.type)).map((e) => e.type)";

/* Throw the craft through the race's next gate (rooms-race-two-page.js
 * throwThrough, the same throw and the same hold). */
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

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`a watcher sees a race, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('interceptor') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('interceptor') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
  await a.until("window.__rooms().phase === 'open'", 30000);
  /* The join's summon done before Play: one still owed seats the room's
   * world over the track Play seated (src/main.js roomSummonStep). */
  await a.until('window.__rooms().summon === null', 30000);
  const sp = (await a.evaluate('window.__map()')).spawn;
  const fx = -Math.sin(sp.yaw);
  const fz = -Math.cos(sp.yaw);
  const doc = mapTrackDocument({
    id: 'trk-watch17a', name: 'Watch seventeen', map: 'swiss2', types: ['gate', 'hoop30', 'gate'],
    centre: [sp.x + fx * 90, sp.y + 20, sp.z + fz * 90], radius: 50,
  });
  await a.evaluate(`(() => {
    localStorage.setItem('webfpv.share.import.v1', JSON.stringify({ id: ${JSON.stringify(doc.id)}, name: ${JSON.stringify(doc.name)}, author: '', board: '', document: ${JSON.stringify(doc)}, local: true, importedUtc: new Date().toISOString() }));
    window.__ui.play();
    return true;
  })()`);
  await a.until("window.__map().ready && window.__map().gates === 3", 120000);
  await a.evaluate("window.__roomRaceDo('race-send'); true");
  await a.until('window.__roomRace().race.ready.length === 1', 120000).catch(() => {});
  const sa = await state(a);
  check('A, the host, has the track seated and is ready', sa.ready && sa.race.ready.join() === '1', JSON.stringify({ seated: sa.seated, ready: sa.ready, room: sa.race.ready, track: sa.track }));

  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}, { watch: true }); true`);
  await b.until("window.__rooms().phase === 'open' && window.__rooms().watch && window.__ui.screen === 'flight'", 120000).catch(() => {});
  const bw = await b.evaluate('window.__rooms()');
  const pilots = await a.evaluate('window.__rooms().peers.length');
  check('B is on the watch seat, seat 0, flying the watch camera; A sees no pilot join', bw.watch && bw.seat === 0 && pilots === 0,
    JSON.stringify({ watch: bw.watch, seat: bw.seat, phase: bw.phase, pilots }));
  const sb = await state(b);
  const gatesB = await b.evaluate('window.__map().gates');
  check('B was welcomed with the room\'s track, and its own hidden aircraft is not seated on it (no laps, gates or records of its own)',
    sb.track && sb.track.id === doc.id && !sb.seated && !gatesB, JSON.stringify({ track: sb.track, seated: sb.seated, gates: gatesB }));
  const loggedBefore = await b.evaluate(LOGGED);

  await a.evaluate("window.__roomRaceDo('race-start', 2); true");
  await a.until("window.__roomRace().role === 'countdown'", 15000);
  await b.until("window.__roomRace().race.state === 'on'", 15000).catch(() => {});
  const cb = await state(b);
  check('B has the race as it goes: on, A its one racer, B watching and never on the line', cb.race.state === 'on' && cb.race.racers.join() === '1'
    && cb.role === 'watching' && cb.run === null && cb.hold === 0, JSON.stringify({ state: cb.race.state, racers: cb.race.racers, role: cb.role, run: cb.run, hold: cb.hold }));
  await a.until("window.__roomRace().role === 'racing'", 15000);

  /* The laps B's screen showed for A, in the order it showed them. */
  const seen = [];
  const see = async () => {
    const h = await b.evaluate(HUD);
    const v = h && h.rows[0] ? h.rows[0].value : null;
    if (v && seen.at(-1) !== v) {
      seen.push(v);
    }
    return h;
  };
  let ok = true;
  let shotRacing = false;
  const tr = Date.now();
  while ((await state(a)).role === 'racing' && Date.now() - tr < 90000) {
    ok = (await throwThrough(a)) && ok;
    await b.sleep(400);
    const h = await see();
    if (!shotRacing && h && /2/.test(h.rows[0].value)) {
      shotRacing = true;
      await shot(b, '1-b-watching-lap-2');
    }
  }
  check('every throw went through the gate it aimed at', ok);
  await b.until("window.__roomRace().race.state === 'results'", 20000).catch(() => {});
  await b.sleep(800);
  await see();
  console.log(`  B's screen showed A's line as: ${seen.join(' -> ')}`);
  check('B\'s screen showed the standings with A\'s laps moving, lap 1 of 2, then 2 of 2, then A\'s time',
    seen.indexOf('Lap 1 of 2') >= 0 && seen.indexOf('Lap 2 of 2') > seen.indexOf('Lap 1 of 2') && /^\d+(:\d\d)?\.\d\d$/.test(seen.at(-1)), seen.join(' | '));
  const end = await b.evaluate(HUD);
  const rb = await state(b);
  check('at the end B\'s standings stay up as the final order, A first, B in none of it',
    Boolean(end) && end.title === 'Race over: the final order' && end.rows.length === 1 && rb.standings.length === 1 && rb.standings[0].seat === 1 && rb.standings[0].ms > 0,
    JSON.stringify(end));
  const after = await b.evaluate(`({ screen: window.__ui.screen, results: window.__roomRace().results, logged: ${LOGGED} })`);
  check('and B gets no results screen and logs nothing of the race', after.screen === 'flight' && !after.results
    && JSON.stringify(after.logged) === JSON.stringify(loggedBefore), JSON.stringify({ ...after, loggedBefore }));
  await shot(b, '2-b-final-order');
  await a.until("window.__roomRace().results", 20000).catch(() => {});
  const ra = await state(a);
  check('A, the pilot, has its results screen as ever', ra.results && ra.standings.length === 1 && ra.standings[0].seat === 1);

  console.log('a watcher sees a lobby');
  const BANNER = 'window.__war().watch.banner';
  const codeL = await a.evaluate("window.__roomCreate({ mode: 'tag' })");
  await a.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(codeL)} && window.__rooms().lobby !== null`, 30000);
  /* Ready the moment the lobby is in, inside the burst of texts a page
   * sends on joining, which fills the room's allowance for a second: it
   * is said again until the room lists it (src/share/roomlobby.js). */
  const pressedAt = Date.now();
  await a.evaluate("window.__ui.act('friends-lobby-ready'); true");
  await a.until("window.__rooms().lobby.ready['1'] === true", 6000).catch(() => {});
  const r0 = await a.evaluate('window.__rooms().lobby');
  check('A presses Ready the moment its lobby is in, and the room lists it', r0.ready['1'] === true, `${JSON.stringify(r0.ready)} after ${Date.now() - pressedAt} ms`);
  await a.evaluate("window.__ui.act('friends-lobby-ready'); true");
  await a.until("Object.keys(window.__rooms().lobby.ready).length === 0", 6000).catch(() => {});
  check('and its second press stands it down, before the five seconds are out', Object.keys((await a.evaluate('window.__rooms().lobby')).ready).length === 0
    && (await a.evaluate('window.__rooms().lobby.countdownAt')) == null);
  await b.evaluate("window.__ui.show('title'); true");
  await b.evaluate(`window.__roomJoin(${JSON.stringify(codeL)}, { watch: true }); true`);
  await b.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(codeL)} && window.__rooms().watch && window.__ui.screen === 'flight'`, 120000).catch(() => {});
  await b.until(`/the lobby/.test(${BANNER})`, 15000).catch(() => {});
  const l0 = await b.evaluate(`({ screen: window.__ui.screen, lobby: window.__rooms().lobby, seat: window.__rooms().seat, banner: ${BANNER} })`);
  check('B, on the title, joins the lobby to watch: never pulled to it, on its watch camera, the banner saying nobody of the one pilot is ready',
    l0.screen === 'flight' && l0.seat === 0 && Boolean(l0.lobby) && l0.banner === 'WATCHING the lobby: 0 of 1 ready. Esc to leave.', JSON.stringify(l0));
  await b.evaluate("window.__ui.act('friends-lobby-ready'); true");
  await b.sleep(800);
  const l1 = await a.evaluate('window.__rooms().lobby');
  check('B pressing Ready readies nobody', Object.keys(l1.ready).length === 0 && l1.countdownAt == null, JSON.stringify(l1));
  await a.evaluate("window.__ui.act('friends-lobby-ready'); true");
  await b.until("window.__rooms().lobby.ready['1'] === true", 10000).catch(() => {});
  await b.until(`/starting in/.test(${BANNER})`, 5000).catch(() => {});
  const l2 = await b.evaluate(`({ lobby: window.__rooms().lobby, banner: ${BANNER} })`);
  check('A readies alone and the five seconds start with B there, never counted; B sees it', Object.keys(l2.lobby.ready).join() === '1' && l2.lobby.countdownAt != null
    && /^WATCHING the lobby: starting in \d\. Esc to leave\.$/.test(l2.banner), JSON.stringify(l2));
  await shot(b, '3-b-watching-lobby');
  await b.until('window.__rooms().lobby.countdownAt == null', 15000).catch(() => {});
  const l3 = await b.evaluate(`({ lobby: window.__rooms().lobby, screen: window.__ui.screen, banner: ${BANNER} })`);
  check('the round starts and the lobby is cleared, B still watching', l3.lobby.countdownAt == null && Object.keys(l3.lobby.ready).length === 0
    && l3.screen === 'flight' && /^WATCHING/.test(l3.banner), JSON.stringify(l3));

  console.log('a watcher sees a war');
  const codeW = await a.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await a.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(codeW)}`, 30000);
  /* The host's room on its world; A waits in the room's lobby, which a
   * war's start passes over. */
  const aOnItaipu = "window.__map().id === 'itaipu' && window.__map().ready";
  await a.until(aOnItaipu, 600000).catch(() => {});
  const aw = await a.evaluate("({ map: window.__map().id, ready: window.__map().ready, screen: window.__ui.screen, code: window.__rooms().code, phase: window.__rooms().phase })");
  check('A is in its room on Itaipu', await a.evaluate(aOnItaipu) && aw.code === codeW && aw.phase === 'open', JSON.stringify(aw));
  const before = await b.evaluate('JSON.stringify({ airframe: window.__ui.settings.airframe, warAirframe: window.__ui.settings.warAirframe ?? null, campaign: window.__ui.settings.campaign ?? null })');
  await b.evaluate(`window.__roomJoin(${JSON.stringify(codeW)}, { watch: true }); true`);
  await b.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(codeW)} && window.__rooms().watch && window.__ui.screen === 'flight'`, 120000).catch(() => {});
  await b.until("window.__map().id === 'itaipu' && window.__map().ready", 600000).catch(() => {});
  const w0 = await b.evaluate('({ seat: window.__war().seat, state: window.__war().view.state, map: window.__map().id })');
  check('B watches the room on Itaipu, seat 0, the war\'s lobby in its welcome', w0.seat === 0 && w0.state === 'lobby' && w0.map === 'itaipu', JSON.stringify(w0));
  await a.evaluate("window.__warDo('start', 'itaipu-drill')");
  await b.until("window.__war().view.state === 'live' && window.__war().hud.line !== ''", 30000).catch(() => {});
  await b.sleep(1000);
  const w1 = await b.evaluate('({ view: window.__war().view, hud: window.__war().hud, craft: window.__war().craft, banner: window.__war().watch.banner, screen: window.__ui.screen })');
  check('B sees the drill live: its round on the HUD and Watching, no airframes and no kills of its own', w1.view.state === 'live' && Boolean(w1.view.stage)
    && /(Round|Stage) 1\//.test(w1.hud.line) && /Watching/.test(w1.hud.line) && !/Airframes|Kills/.test(w1.hud.line), JSON.stringify({ line: w1.hud.line, stage: w1.view.stage && w1.view.stage.id }));
  check('B is put in no war aircraft and stays on its watch camera', w1.craft.length === 0 && w1.screen === 'flight' && /^WATCHING/.test(w1.banner),
    JSON.stringify({ craft: w1.craft, screen: w1.screen, banner: w1.banner }));
  await shot(b, '4-b-watching-war');
  await a.evaluate("window.__warDo('skip')");
  await b.until('window.__war().round.on', 15000).catch(() => {});
  const w2 = await b.evaluate('({ round: window.__war().round, view: window.__war().view })');
  check('A\'s skip ends the round (the drill counts stages), and B sees its card, A in it, no line of its own', w2.round.on && /^(ROUND|STAGE) 1: /.test(w2.round.title)
    && w2.round.rows.length === 1 && !w2.round.rows.some((r) => /#0/.test(r)), JSON.stringify(w2.round));
  await shot(b, '5-b-round-card');
  await a.evaluate("window.__warDo('end')");
  await b.until("window.__war().view.state === 'ended' && window.__war().hud.banner !== ''", 15000).catch(() => {});
  await a.until("window.__war().view.state === 'ended'", 15000).catch(() => {});
  await b.sleep(1500);
  const w3 = await b.evaluate('({ view: window.__war().view, hud: window.__war().hud, settings: JSON.stringify({ airframe: window.__ui.settings.airframe, warAirframe: window.__ui.settings.warAirframe ?? null, campaign: window.__ui.settings.campaign ?? null }) })');
  const wa = await a.evaluate('window.__war().view');
  check('A ends the war: B sees its end banner, its view holds no result where A\'s holds one (the negative control)', w3.view.state === 'ended' && w3.hud.banner !== ''
    && w3.view.result == null && wa.state === 'ended' && wa.result != null, JSON.stringify({ banner: w3.hud.banner, b: w3.view.result ?? null, a: wa.result ?? null }));
  check('and B\'s aircraft, war aircraft and campaign are as they were before it watched', w3.settings === before, `${before} -> ${w3.settings}`);
  await shot(b, '6-b-war-end');

  const errs = [...a.errors, ...b.errors].filter((x) => !x.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed (${Math.round((Date.now() - t0) / 1000)} s)`);
process.exit(failed ? 1 : 0);
