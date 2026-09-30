/*
 * rooms-session-three-page.js: a room is one shared session that nobody
 * drifts out of, through the real shell, three pages against a local
 * edge/rooms/node.js this check starts and stops itself (never the VM).
 *
 *   SIM_GPU=1 node scripts/rooms-session-three-page.js [port]
 *
 * The owner, 2026-09-29, in a room of four on the Swiss valley where one
 * pilot was drawn: "i cant see the 3 people in my room, force everyone in
 * the same game and the same thing". Two of the four had sent no pose for
 * 25 s, and a fifth pilot sat alone in a room of their own. What it takes:
 *
 *   join       A makes a room on the Alps and flies. B, on the title, and
 *              C, who flies the Swiss valley, join by code: both end up
 *              flying the Alps with no press of Fly, each drawing the rest.
 *   world      B goes to the title and C into the hangar; the host A picks
 *              the Swiss valley. The room moves, and all three fly there.
 *   game       B opens the crash cam and C leaves for the title; A starts
 *              a combat round. All three fly in the round, B out of the
 *              replay.
 *   pause      B pauses: A and C name B "here but not flying: paused",
 *              and B is asked to fly while the round is on, from a bar
 *              whose Fly puts B back in the air.
 *   alone      C leaves for a room nobody else is in: told so, with its
 *              code, over the flight and on the pause menu.
 *   race       A loads a race track in the room while B flies. B wrecks
 *              and pauses: the wreck is still there and nothing was
 *              rebuilt (a teammate's report: pausing in a room with a
 *              track reloaded the track and cleared the wreck).
 *
 * On main every part but the joins fails: the host's pick of a world is
 * the host's alone, a game takes up only the pilots waiting on a room
 * screen, the away line gives no reason, nobody is told they are alone,
 * and the pause seats the room's track.
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
import { mapTrackDocument } from '../tests/lib/maptrack.js';
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/* Not the default 8797, nor rooms:sight's 18797. */
const PORT = Number(process.argv[2] || 18798);
const HOME = 'alps';
const MOVED = 'swiss2';

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

function seedFor(map, airframe = '5inch') {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, airframe);
  s.map = map;
  s.freestyleMap = map;
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.sessionSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { sessionSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

const say = (key, vars) => (en[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars[k]);

const dir = await mkdtemp(join(tmpdir(), 'rooms-session-'));
const server = await startRooms({ db: join(dir, 'rooms.db'), port: PORT });
const rooms = `http://127.0.0.1:${PORT}`;
console.log(`three pages, one session, rooms at ${rooms}`);
const base = `/index.html?rooms=${encodeURIComponent(rooms)}`;
const pages = {
  A: await openPage({ root, url: base, width: 960, height: 540, seed: seedFor(HOME) }),
  B: await openPage({ root, url: base, width: 960, height: 540, seed: seedFor(HOME) }),
  /* A Timber, as two of the owner's unseen pilots flew, and paintable, so
   * it has a hangar to be in. */
  C: await openPage({ root, url: `${base}&map=${MOVED}`, width: 960, height: 540, seed: seedFor(MOVED, 'timber1500') }),
};
const names = Object.keys(pages);

/* Each page as it stands. */
async function look(k) {
  return pages[k].evaluate(`(() => {
    const r = window.__rooms();
    const c = window.__craftState();
    return {
      seat: r.seat, phase: r.phase, world: window.__map().id, ready: window.__map().ready, mode: c.mode,
      screen: window.__ui.screen, flying: c.mode === 'flight' && window.__ui.screen === 'flight',
      peers: r.peers.map((p) => ({ seat: p.seat, name: p.name, drawn: p.drawn })),
      away: window.__peerMarks().away || [], note: window.__peerMarks().note ?? null, bar: r.bar ?? null,
      combat: window.__combat().round.state,
    };
  })()`);
}
const flyingIn = (world) => `window.__craftState().mode === 'flight' && window.__ui.screen === 'flight'
  && window.__map().ready && window.__map().id === ${JSON.stringify(world)} && !(window.__rooms().summon)`;
const drawsOthers = (n) => `window.__rooms().peers.length === ${n} && window.__rooms().peers.every((p) => p.drawn)`;
/* Waits that may time out on a broken build: the checks after them say what is wrong. */
async function settle(ks, expression, ms) {
  await Promise.all(ks.map((k) => pages[k].until(expression, ms).catch(() => {})));
}
async function allIn(world, what) {
  await settle(names, `${flyingIn(world)} && ${drawsOthers(2)}`, 240000);
  const s = Object.fromEntries(await Promise.all(names.map(async (k) => [k, await look(k)])));
  check(`${what}: all three fly ${world}`, names.every((k) => s[k].flying && s[k].world === world),
    names.map((k) => `${k} ${s[k].world} ${s[k].mode}/${s[k].screen}`).join(', '));
  check(`${what}: and each draws both others`, names.every((k) => s[k].peers.length === 2 && s[k].peers.every((p) => p.drawn)),
    names.map((k) => `${k}: ${s[k].peers.map((p) => (p.drawn ? 'drawn' : 'not drawn')).join(' ')}`).join('; '));
  return s;
}

try {
  for (const k of names) {
    await pages[k].until('window.__shellReady === true', 300000);
    await pages[k].until('window.__map && window.__map().ready', 400000);
  }

  console.log('join');
  const code = await pages.A.evaluate(`window.__roomCreate({ map: ${JSON.stringify(HOME)} })`);
  check('A makes a room on the Alps', /^[A-Z0-9]{6}$/.test(code), code);
  await pages.A.until("window.__rooms().phase === 'open'", 30000);
  await pages.A.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await pages.C.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await pages.C.until(flyingIn(MOVED), 400000);
  await pages.B.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await pages.C.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  await allIn(HOME, 'joined by code, B from the title and C flying another world');

  console.log('the host moves the room');
  await pages.B.evaluate("window.__ui.show('title'); window.__ui.onAction('title'); true");
  await pages.C.evaluate("window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.act('customise'); true");
  const hangar = await pages.C.evaluate('window.__ui.hangar.isOpen');
  check('C is in the hangar and B on the title', hangar && (await look('B')).mode === 'title', `hangar ${hangar}`);
  await pages.A.evaluate(`window.__ui.act('pause'); window.__ui.show('paused'); window.__ui.seatMap(${JSON.stringify(MOVED)}); true`);
  await allIn(MOVED, 'the host picked another world');
  const held = await pages.B.evaluate('window.__rooms().world');
  check('the room holds the world the host picked', held === MOVED, held);

  console.log('the host starts a game');
  await pages.B.sleep(1500);
  const opened = await pages.B.evaluate('window.__crashCam.open() !== false');
  await pages.B.until("window.__craftState().mode === 'replay'", 10000).catch(() => {});
  await pages.C.evaluate("window.__ui.show('title'); window.__ui.onAction('title'); true");
  const bMode = (await look('B')).mode;
  check('B is in the crash cam and C on the title', opened && bMode === 'replay', bMode);
  await pages.A.evaluate('window.__combatStart(3); true');
  const s = await allIn(MOVED, 'the host started combat');
  check('and the round is on every page', names.every((k) => ['countdown', 'on'].includes(s[k].combat)),
    names.map((k) => `${k} ${s[k].combat}`).join(', '));

  console.log('a pause');
  await pages.B.evaluate("window.__ui.act('pause'); window.__ui.show('paused'); true");
  await pages.A.sleep(3500);
  const b = await look('B');
  const bName = (await look('A')).peers.find((p) => p.seat === b.seat).name;
  const paused = say('rooms.away_paused', { name: bName });
  for (const k of ['A', 'C']) {
    const mark = (await look(k)).away.find((m) => m.seat === b.seat);
    check(`${k} names B: "${paused}"`, Boolean(mark) && mark.text === paused, JSON.stringify(mark));
  }
  check(`B is asked: "${en['rooms.fly_prompt']}"`, b.bar === en['rooms.fly_prompt'], String(b.bar));
  await pages.B.evaluate('window.__ui.roomBarView.act(); true');
  await pages.B.until(flyingIn(MOVED), 30000).catch(() => {});
  check('and its Fly puts B back in the air', (await look('B')).flying);

  console.log('alone');
  const res = await fetch(`${rooms}/v2/create`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ map: MOVED }),
  });
  const lone = (await res.json()).code;
  await pages.C.evaluate(`window.__roomJoin(${JSON.stringify(lone)}); true`);
  await pages.C.until(`window.__rooms().phase === 'open' && window.__rooms().code === ${JSON.stringify(lone)} && ${flyingIn(MOVED)}`, 60000).catch(() => {});
  await pages.C.sleep(800);
  const alone = say('rooms.alone', { code: lone });
  check(`C is told over the flight: "${alone}"`, (await look('C')).note === alone, String((await look('C')).note));
  await pages.C.evaluate("window.__ui.act('pause'); window.__ui.show('paused'); true");
  await pages.C.sleep(800);
  check('and on the pause menu', (await look('C')).bar === alone, String((await look('C')).bar));

  console.log('a race track, a wreck and a pause');
  await pages.A.evaluate("window.__combatStart && window.__ui.onFriends('friends-combat-stop'); true");
  await pages.A.until("window.__combat().round.state !== 'on' && window.__combat().round.state !== 'countdown'", 15000).catch(() => {});
  const sp = await pages.A.evaluate('window.__map().spawn');
  const fx = -Math.sin(sp.yaw);
  const fz = -Math.cos(sp.yaw);
  const doc = mapTrackDocument({
    id: 'trk-session1', name: 'One session', map: MOVED, types: ['gate', 'gate', 'gate'],
    centre: [sp.x + fx * 90, sp.y + 20, sp.z + fz * 90], radius: 50,
  });
  await pages.A.evaluate(`(() => {
    localStorage.setItem('webfpv.share.import.v1', JSON.stringify({ id: ${JSON.stringify(doc.id)}, name: ${JSON.stringify(doc.name)}, author: '', board: '', document: ${JSON.stringify(doc)}, local: true, importedUtc: new Date().toISOString() }));
    window.__ui.play();
    return true;
  })()`);
  await pages.A.until("window.__map().ready && window.__map().gates === 3", 120000);
  await pages.A.evaluate("window.__roomRaceDo('race-send'); true");
  await pages.B.until("window.__roomRace().track && window.__roomRace().track.id === 'trk-session1'", 15000).catch(() => {});
  await pages.B.sleep(1500);
  await pages.B.until(flyingIn(MOVED), 120000).catch(() => {});
  await pages.B.evaluate(`(() => {
    const s = window.__craftState();
    const x = s.worldX + 30, z = s.worldZ - 20, y = window.__heightAt(x, z) + 1.9;
    window.__crashThrow({ x, y, z, yaw: 90, pitch: -25, roll: 75, vx: -24, vy: -8, vz: 0, fresh: true });
    return true;
  })()`);
  await pages.B.until('window.__crash().wrecked && window.__rooms().ownWreck.length > 0', 20000).catch(() => {});
  const before = await pages.B.evaluate("({ wrecked: window.__crash().wrecked, pieces: window.__rooms().ownWreck.length, gates: window.__map().gates, seat: window.__ui.settings.map, mode: window.__craftState().mode, summon: window.__rooms().summon ?? null })");
  check('B flies the room\'s track and wrecks', before.wrecked && before.pieces > 0 && before.seat === 'track', JSON.stringify(before));
  await pages.B.evaluate("window.__ui.act('pause'); window.__ui.show('paused'); true");
  await pages.B.sleep(3000);
  const after = await pages.B.evaluate("({ wrecked: window.__crash().wrecked, pieces: window.__rooms().ownWreck.length, mode: window.__craftState().mode, ready: window.__map().ready, screen: window.__ui.screen, summon: window.__rooms().summon ?? null })");
  check('a pause leaves the wreck as it was, and nothing is rebuilt',
    after.wrecked && after.pieces === before.pieces && after.mode === 'paused' && after.ready && after.screen === 'paused', JSON.stringify(after));

  const errs = names.flatMap((k) => pages[k].errors).filter((e) => !e.startsWith('network:'));
  check('no page error on any page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  for (const k of names) {
    await pages[k].close();
  }
  await server.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
