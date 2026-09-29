/*
 * rooms-sight-three-page.js: who sees whom in a room of three, through
 * the real shell, against a local edge/rooms/node.js that this check
 * starts, restarts and stops itself (never the live VM).
 *
 *   SIM_GPU=1 node scripts/rooms-sight-three-page.js [port]
 *
 * The owner's report (2026-09-29): "i see all 3 people, but one of the 3,
 * doesnt see me". Three pilots, the ways they come into a room:
 *
 *   A makes the room on the Swiss valley and flies, as the owner did.
 *   B opens the page with the room's code and nothing else, so the title
 *     has not asked Race or Freestyle yet, with the Alps remembered from
 *     last time. B must be seated in the room's world and see A and C.
 *   C is flying the Alps and joins from the pause menu. The room seats C
 *     in its world, and the hello that went out before that told the room
 *     C was in the Alps: the room must learn C moved, or A and B never
 *     draw C while C sees them both, which is the report.
 *
 * Then every pilot must be in the room's world, the room must hold each
 * in the world they fly, and each page must draw the other two. A pilot
 * who pauses is not drawn, and must be named on the others' screens as
 * here but not flying, never simply gone; flying again, drawn again.
 * The server restarts mid session, as the VM's did at 16:19 UTC, and all
 * three must be back, in their seats, drawing each other. Last, C picks
 * the Alps from inside the room: the others name C as flying there.
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
import en from '../src/strings/en.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
/* Not the default 8797, so a server a developer has running is left alone. */
const PORT = Number(process.argv[2] || 18797);
const ROOM_MAP = 'swiss2';

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

function seedFor(id, map) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, id);
  s.map = map;
  s.freestyleMap = map;
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.sightSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { sightSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
  } catch (e) { /* storage refused */ }`];
}

const say = (key, vars) => (en[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars[k]);

const dir = await mkdtemp(join(tmpdir(), 'rooms-sight-'));
const db = join(dir, 'rooms.db');
let server = await startRooms({ db, port: PORT });
const rooms = `http://127.0.0.1:${PORT}`;
console.log(`three pages in one room, rooms at ${rooms}`);
const base = `/index.html?rooms=${encodeURIComponent(rooms)}`;
const pages = {
  A: await openPage({ root, url: base, width: 960, height: 540, seed: seedFor('radian2000', ROOM_MAP) }),
  B: await openPage({ root, url: base, width: 960, height: 540, seed: seedFor('5inch', 'alps') }),
  C: await openPage({ root, url: `${base}&map=alps`, width: 960, height: 540, seed: seedFor('5inch', 'alps') }),
};
const names = Object.keys(pages);

/* Each page as it stands: its seat, its world, and what it makes of the others. */
async function look() {
  const out = {};
  for (const k of names) {
    out[k] = await pages[k].evaluate(`(() => {
      const r = window.__rooms();
      const m = window.__peerMarks();
      return {
        seat: r.seat, phase: r.phase, world: window.__map().id, mode: window.__craftState().mode,
        peers: r.peers.map((p) => ({ seat: p.seat, name: p.name, map: p.map, drawn: p.drawn })),
        away: m.away || [],
      };
    })()`);
  }
  return out;
}
function bySeat(state) {
  return Object.fromEntries(names.map((k) => [state[k].seat, k]));
}
const drawsBoth = (s, k) => s[k].peers.length === 2 && s[k].peers.every((p) => p.drawn);
const flying = (k) => pages[k].until("window.__craftState().mode === 'flight' && window.__map().ready", 400000);
async function fly(k) {
  await pages[k].until('window.__map().ready', 400000);
  await pages[k].evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await flying(k);
}
/* Waits that may time out on a broken build: the checks after them say what is wrong. */
async function settle(expression, ms) {
  await Promise.all(names.map((k) => pages[k].until(expression, ms).catch(() => {})));
}
const everyoneDrawn = "window.__rooms().peers.length === 2 && window.__rooms().peers.every((p) => p.drawn)";

try {
  for (const k of names) {
    await pages[k].until('window.__shellReady === true', 300000);
    await pages[k].until('window.__map && window.__map().ready', 400000);
  }
  const code = await pages.A.evaluate('window.__roomCreate()');
  check('A makes a room on the Swiss valley', /^[A-Z0-9]{6}$/.test(code), code);
  await pages.A.until("window.__rooms().phase === 'open'", 30000);
  await fly('A');

  /* C is flying the Alps, pauses and joins. */
  await fly('C');
  await pages.C.evaluate("window.__ui.onAction('pause'); true");
  await pages.C.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  /* B joins from the title, the gate unanswered. */
  const bMode = await pages.B.evaluate('window.__ui.mode ?? null');
  check('B has not been asked Race or Freestyle yet', bMode === null, String(bMode));
  await pages.B.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const k of names) {
    await pages[k].until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 2", 30000);
  }
  for (const k of ['B', 'C']) {
    await pages[k].until(`window.__map().ready && window.__map().id === ${JSON.stringify(ROOM_MAP)}`, 60000).catch(() => {});
    await fly(k);
  }
  /* A page sends a pose a frame, at most 30 a second, and a peer with
   * none for STALE_MS (src/game/peer.js, 2 s) is not drawn. Three
   * software rendered pages on a busy machine can fall under one frame a
   * second, and then they blink out for the machine's reason, not the
   * room's: said here, before any verdict that would read as the room's. */
  for (const k of names) {
    const fps = await pages[k].evaluate(`new Promise((done) => {
      let n = 0;
      const t0 = performance.now();
      const step = () => { n += 1; if (performance.now() - t0 < 2000) { requestAnimationFrame(step); } else { done(n / 2); } };
      requestAnimationFrame(step);
    })`);
    check(`${k} renders fast enough to judge (5 frames a second or more)`, fps >= 5, `${fps} a second`);
  }
  await settle(everyoneDrawn, 30000);
  let s = await look();
  let seats = bySeat(s);
  console.log(`  seats ${names.map((k) => `${k}=${s[k].seat}`).join(' ')}`);
  check('every pilot flies in the room\'s world', names.every((k) => s[k].world === ROOM_MAP),
    names.map((k) => `${k} ${s[k].world}`).join(', '));
  const held = names.flatMap((k) => s[k].peers.map((p) => ({ by: k, of: seats[p.seat], map: p.map })));
  const wrong = held.filter((h) => h.map !== s[h.of].world);
  check('the room holds every pilot in the world they fly', held.length === 6 && wrong.length === 0,
    wrong.map((h) => `${h.by} holds ${h.of} in ${h.map}, ${h.of} flies ${s[h.of].world}`).join('; '));
  for (const k of names) {
    check(`${k} draws both others`, drawsBoth(s, k), s[k].peers.map((p) => `${seats[p.seat]} ${p.drawn ? 'drawn' : 'not drawn'}`).join(', '));
  }
  check('and nobody is marked away', names.every((k) => s[k].away.length === 0), JSON.stringify(names.map((k) => s[k].away)));

  /* B pauses: not drawn, and named, on A's and C's screens. */
  await pages.B.evaluate("window.__ui.onAction('pause'); true");
  await pages.A.sleep(3500);
  s = await look();
  const bName = s.A.peers.find((p) => p.seat === s.B.seat).name;
  const idle = say('rooms.away_idle', { name: bName });
  for (const k of ['A', 'C']) {
    const p = s[k].peers.find((q) => q.seat === s.B.seat);
    check(`${k} stops drawing B while B is paused`, p && !p.drawn);
    const mark = s[k].away.find((a) => a.seat === s.B.seat);
    check(`and names B on screen: "${idle}"`, Boolean(mark) && mark.text === idle, JSON.stringify(s[k].away));
  }
  await pages.B.evaluate("window.__ui.onAction('resume'); true");
  await settle(everyoneDrawn, 15000);
  s = await look();
  check('B flying again: drawn by both, the mark gone', drawsBoth(s, 'A') && drawsBoth(s, 'C') && s.A.away.length === 0 && s.C.away.length === 0,
    JSON.stringify({ A: s.A.away, C: s.C.away }));

  /* The server restarts under them. */
  const before = Object.fromEntries(names.map((k) => [k, s[k].seat]));
  await server.stop();
  server = await startRooms({ db, port: PORT });
  await settle(`window.__rooms().phase === 'open' && ${everyoneDrawn}`, 40000);
  s = await look();
  seats = bySeat(s);
  check('after a restart all three are back in their own seats', names.every((k) => s[k].phase === 'open' && s[k].seat === before[k]),
    names.map((k) => `${k} ${s[k].phase} seat ${s[k].seat}`).join(', '));
  for (const k of names) {
    check(`and ${k} draws both others again`, drawsBoth(s, k), s[k].peers.map((p) => `${seats[p.seat]} ${p.drawn ? 'drawn' : 'not drawn'}`).join(', '));
  }

  /* C picks the Alps from inside the room. */
  await pages.C.evaluate("window.__ui.onAction('pause'); window.__ui.seatMap('alps', { stay: true }); true");
  await pages.C.until("window.__map().ready && window.__map().id === 'alps'", 400000);
  await fly('C');
  await pages.A.until(`window.__rooms().peers.some((p) => p.seat === ${s.C.seat} && p.map === 'alps' && !p.drawn)`, 15000).catch(() => {});
  s = await look();
  const cName = s.A.peers.find((p) => p.seat === s.C.seat).name;
  const away = say('rooms.away_world', { name: cName, world: en['registry.the_alps'] });
  const markC = s.A.away.find((a) => a.seat === s.C.seat);
  check(`A names C in another world: "${away}"`, Boolean(markC) && markC.text === away, JSON.stringify(s.A.away));

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
