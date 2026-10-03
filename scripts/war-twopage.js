/*
 * war-twopage.js: the war client's proof on the real shell
 * (docs/WARFARE-PLAN.md section 5.2). Two headless pages join one private
 * room on the Itaipu map, on a rooms server this check runs in its own
 * process (edge/rooms/node.js), and A, the host, starts mission 1:
 *
 *   SIM_GPU=1 npm run war:twopage [-- outdir]
 *   SIM_GPU=1 npm run war:twopage -- --main [outdir]
 *
 * SIM_GPU=1 renders on the machine's GPU (tests/lib/page.js). Under the
 * software rasteriser, two pages of Itaipu on a busy machine draw a frame
 * every half second or so, and so send a pose as seldom: the room then
 * judges past a pilot's newest pose (LATE_MS) and a pass through the
 * bubble goes unseen. The check says so rather than failing silently.
 *
 * Two ways to wire the client. By default each page gets it from
 * scripts/war-twopage-wire.js, fed by TAP_SEED below, a WebSocket that
 * hands the rooms socket's frames to it: the room's real wire, on the
 * real shell, with the real map's scene, and no plant. With --main the
 * pages run src/main.js's own wiring (docs/WAR-WIRING.md), the plant and
 * all, and the check holds that too: B's own crash damage setting is
 * off, the room (#258: every room but a friendly one) has damage on for
 * it before the war and the war keeps it on, and B's setting is still
 * off after; A's warhead breaks A's craft; the Switchyard burns
 * while the war lasts and is whole after it; and the radio link is the
 * pilot's own preset all through, as outside a war (the owner took the
 * signal out of the war on 2026-09-29).
 *
 * What must hold:
 *   - both pages draw every attacker at the same place at the same room
 *     millisecond: a scripted one to the micrometre, since routes.js is
 *     the same function on the same numbers; a hunter (AGENTS, 0xA0,
 *     interpolated) within HUNTER_M
 *   - each page draws what it says: its instanced meshes hold its own
 *     attackersAt, at most one draw call a kind
 *   - the same output, wave, rack and scores on both, all the way
 *   - A is held on the second Striker's route: it detonates, and both
 *     pages hear the same boom and the same dead, A scores the kill, and
 *     the rack drops by one; the other Strikers reach the switchyard
 *     and both pages take its megawatts and call it
 *   - then both are held on the Hunters' way up the gorge: a Hunter goes
 *     off on one of them, and both pages agree on that too; and the
 *     target each page last heard for it (HUNTS, 0xA1) is that pilot
 *   - with --main, on the room's own rounds: A's kill says +1 AIRFRAME;
 *     the first round's result card on both pages; the next round puts
 *     A, a wreck, back in the air by itself; A crashes that round's
 *     airframes away and spectates B, [ and ] keep to a teammate and R
 *     does not put it back in the air
 *
 * Pictures go in outdir (build/war-twopage by default, not in the
 * repository).
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
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { LATE_MS } from '../src/game/midair.js';
import { planAgent, poseAt } from '../src/share/war/routes.js';
import { MISSIONS } from '../src/share/war/missions/index.js';
import { waveSize, waveTarget } from '../src/share/war/missions/index.js';
import { wireStrike } from '../src/share/war/wires.js';
import { wireDraw } from '../edge/rooms/war.js';
import {
  darkFrom, DISTRICTS, CASCADE_MS, FLICKER_MS,
} from '../src/share/war/grid.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MAIN = process.argv.includes('--main');
/* The mission flown: mission 1 by default, or --mission=id of one that
 * shares its waves (itaipu-4, the night raid, which this then checks is
 * night on both pages, the attackers wearing nav lights). */
const missionArg = process.argv.find((a) => a.startsWith('--mission='));
/* The drill: mission 1 as this check was written against, before First
 * Light made it a story (src/share/war/missions/itaipu-drill.js). */
const itaipu1 = MISSIONS[missionArg ? missionArg.slice('--mission='.length) : 'itaipu-drill'];
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--') && !a.startsWith('--mission=')) || join(root, 'build', MAIN ? 'war-twopage-main' : 'war-twopage');

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

/* A scripted attacker on the two pages: the same function on the same
 * numbers, so any difference is a bug, not a tolerance. */
const SCRIPTED_M = 1e-6;
/* A hunter, interpolated on each page from the AGENTS frames that page
 * was sent: each seat's are thinned on its own distance (core.js
 * INTEREST), so two pages can hold different samples of one flight. Both
 * pilots are held within 40 m of each other, so they sit in the same band
 * but for the moments a hunter crosses a band's edge. */
const HUNTER_M = 1.0;
/* How far behind the older of the two clocks the positions are compared:
 * far enough that both pages hold the samples either side. */
const BEHIND_MS = 1500;

/* The rooms socket's frames, queued for scripts/war-twopage-wire.js. */
const TAP_SEED = `(() => {
  const Native = window.WebSocket;
  const tap = { socket: null, queue: [], on: null };
  window.__warTap = tap;
  window.WebSocket = class extends Native {
    constructor(url, protocols) {
      super(url, protocols);
      if (/\\/v2\\//.test(String(url))) {
        tap.socket = this;
        this.addEventListener('message', (ev) => {
          if (tap.socket !== this) {
            return;
          }
          const d = typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data);
          if (tap.on) {
            tap.on(d);
          } else {
            tap.queue.push(d);
          }
        });
      }
    }
  };
})();`;

function seedFor(colour, crashDamage = true) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, '5inch');
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = crashDamage;
  s.warConsent = true;
  s.livery = { '5inch': { regions: { frame: colour } } };
  s.parts = {};
  return [...(MAIN ? [] : [TAP_SEED]), `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* storage refused */ }`];
}

async function shot(page, name) {
  await mkdir(outDir, { recursive: true });
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  const path = join(outDir, `${name}.png`);
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(`  shot ${path}`);
}

const throwTo = (p, at, fresh) => p.evaluate(`window.__crashThrow({ x: ${at[0]}, y: ${at[1]}, z: ${at[2]}, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: ${fresh}, showCraft: true })`);
/*
 * Held at `at`, a whole airframe that can go off. `fresh` puts back one
 * whole, since a quad left on the Mirante's pad may already be a wreck,
 * whose poses say crashed and never detonate; but a fresh flight is
 * spawning (main.js roomSpawning) until it has moved ROOM_SPAWN_M, 30 m,
 * from where it began, which a held craft never does. So it begins 40 m
 * over the point and is thrown down onto it, the same flight.
 */
async function hold(p, at) {
  await throwTo(p, [at[0], at[1] + 40, at[2]], true);
  /* The spawn point is taken on the first pose sent after the reset, so
   * a few frames must go by there before the throw down. */
  await p.evaluate('new Promise((r) => { let n = 0; const f = () => (++n >= 4 ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })');
  await p.sleep(300);
  await throwTo(p, at, false);
}
const warOf = (p) => p.evaluate('window.__war()');
const nowOf = (p) => p.evaluate('window.__rooms().roomNow');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/* The view without what only differs by when it was read. */
const same = (v) => JSON.stringify({ ...v, f: undefined });
/* One event as two pages heard it: the same but for whose it is. */
const sameEvent = (x, y) => Boolean(x && y) && JSON.stringify({ ...x, mine: 0 }) === JSON.stringify({ ...y, mine: 0 });

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-war-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
/* The room's own half, in this process: what it judged, for the details
 * of a failure. */
const roomWarOf = () => {
  const room = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.war.match);
  return room ? room.host.core.war : null;
};
function roomSeats() {
  const w = roomWarOf();
  if (!w) {
    return 'no war room';
  }
  const room = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.war === w);
  const core = room.host.core;
  const relayed = [...core.seats.values()].map((s) => {
    const v = s.pose ? new DataView(s.pose.buffer, s.pose.byteOffset) : null;
    return `seat ${s.seat} map ${s.profile.map} relayed t ${v ? v.getUint32(4, true) : '-'} at ${v ? [8, 12, 16].map((o) => v.getFloat32(o, true).toFixed(1)).join(',') : '-'}`;
  }).join('; ');
  return `room ms ${Math.round(core.roomMs(Date.now()))}, meta map ${core.meta.map}; ${relayed}; judged: ` + [...w.seats.entries()].map(([seat, r]) => {
    const n = r.track.s.at(-1);
    return `seat ${seat}: ${n ? `t ${n.t} at ${[n.px, n.py, n.pz].map((v) => v.toFixed(1)).join(',')} flags 0x${n.flags.toString(16)}` : 'no sample'} down ${JSON.stringify(r.down)} armFrom ${r.armFrom}`;
  }).join('; ');
}
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`Defend Itaipu in two pages, rooms at ${rooms}, wired by ${MAIN ? 'src/main.js' : 'scripts/war-twopage-wire.js'}`);

const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#d8432f') });
/* With main.js's wiring, B's own setting has crash damage off: the room
 * turns it on (#258) and the war must keep it on for B's warhead to break
 * anything, without touching B's saved setting. */
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#2f6fd6', !MAIN) });
const pages = [a, b];
const names = ['A', 'B'];

/* Every attacker on both pages at one room ms, and each page's drawing
 * against its own list. Returns the worst differences seen. */
const worst = { scripted: 0, hunter: 0, samples: 0, hunters: 0, mismatch: [], drawn: 0, calls: 0 };
/* Hunter id -> the target each page last heard for it, [A, B]. */
const heardHunts = new Map();
async function compare() {
  const t = Math.floor(Math.min(await nowOf(a), await nowOf(b))) - BEHIND_MS;
  const [la, lb] = await Promise.all(pages.map((p) => p.evaluate(`window.__warAt(${t})`)));
  const ids = (l) => l.map((x) => x.id).join(',');
  if (ids(la) !== ids(lb)) {
    worst.mismatch.push(`${t}: A ${ids(la)} B ${ids(lb)}`);
    return;
  }
  for (let i = 0; i < la.length; i += 1) {
    if (la[i].kind === 'hunter') {
      heardHunts.set(la[i].id, [la[i].hunts, lb[i].hunts]);
    }
    const d = dist(la[i].p, lb[i].p);
    const k = la[i].kind === 'hunter' ? 'hunter' : 'scripted';
    worst[k] = Math.max(worst[k], d);
    worst.samples += 1;
    worst.hunters += k === 'hunter' ? 1 : 0;
  }
  for (const p of pages) {
    const d = await p.evaluate(`(() => {
      const w = window.__war().drawn;
      const own = window.__warAt(w.at);
      let off = own.length === w.list.length ? 0 : Infinity;
      for (let i = 0; i < own.length && off < Infinity; i += 1) {
        const x = own[i], y = w.list[i];
        /* A hunter drawn past its newest sample is redrawn once the next
         * arrives, so only its id is held to the frame. */
        off = x.id !== y.id ? Infinity : (x.kind === 'hunter' ? off : Math.max(off, Math.hypot(x.p[0] - y.p[0], x.p[1] - y.p[1], x.p[2] - y.p[2])));
      }
      const n = Object.values(w.counts).reduce((s, c) => s + c, 0);
      return { off, calls: w.calls, n, listed: w.list.length };
    })()`);
    worst.drawn = Math.max(worst.drawn, d.n === d.listed ? d.off : Infinity);
    worst.calls = Math.max(worst.calls, d.calls);
  }
}

async function sameView(what) {
  const [va, vb] = await Promise.all(pages.map(warOf));
  check(`${what}: both pages hold the same war`, same(va.view) === same(vb.view),
    `output ${va.view.output}/${vb.view.output}, wave ${va.view.wave}/${vb.view.wave}, rack ${va.view.rack}/${vb.view.rack}, kills ${JSON.stringify(va.view.scores)}`);
  return [va, vb];
}

/* Compares every 2 s until `done` returns true or room ms `until`. */
async function watch(done, until) {
  for (;;) {
    await compare();
    if (await done() || (await nowOf(a)) > until) {
      return;
    }
    await a.sleep(2000);
  }
}

const frames = (p, k) => p.evaluate(`new Promise((r) => { let n = 0; const f = () => (++n >= ${k} ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
/* Every part of a page's craft broken (window.__crashBreak): a wreck the
 * room judges as a crash, one airframe spent. Part 0, the root, is
 * refused, as is a part past the last. */
const wreck = (p) => p.evaluate('(() => { for (let i = 1; i < 64; i += 1) { window.__crashBreak(i); } return true; })()');
/* The result card's title for the room's round as it ended. */
function cardTitle(m) {
  const n = m.round + 1;
  const mwText = String(Math.round(m.roundMw)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (m.roundResult === 'win') {
    return `ROUND ${n}: HELD`;
  }
  return `ROUND ${n}: ${m.roundResult === 'lost' ? 'LOST' : 'DAMAGED'}, -${mwText} MW`;
}
const CARD_COLOUR = { win: 'rgb(125, 255, 154)', damaged: 'rgb(255, 138, 31)', lost: 'rgb(255, 74, 58)' };

/*
 * ROUNDS ON THE REAL ROOM (src/ui/warround.js, edge/rooms/war.js): A's
 * kill earned it an airframe, said under its SPLASH; the first round
 * ends on its own and both pages show its result card; the next round
 * puts A, a wreck since its warhead, back in the air by itself; then A
 * crashes its four airframes of that round away and spectates B.
 */
async function roundRows(seatA, seatB, goAt) {
  const said0 = (await warOf(a)).said;
  check('A\'s own kill says +1 AIRFRAME under its SPLASH, and the pips show the one earned', said0.includes('+1 AIRFRAME')
    && /airframes ■■■■□(?![■□])/i.test((await warOf(a)).hud.line), `${said0.slice(-4).join(' | ')}; hud "${(await warOf(a)).hud.line}"`);
  const wreckedBefore = (await warOf(a)).watch.wrecked;
  await watch(async () => {
    const m = roomWarOf().match;
    return m.round > 0 || m.roundState === 'result' || m.state !== 'live';
  }, goAt + 400000);
  const ended = { ...roomWarOf().match };
  await Promise.all(pages.map((p) => frames(p, 20)));
  const cards = await Promise.all(pages.map((p) => p.evaluate('window.__war().round')));
  const want = ended.roundState === 'result' ? cardTitle(ended) : '(no result seen)';
  check('round 1 ends on the real room and both pages show its result card: the title, its colour, a line a pilot, the next round counted down',
    ended.roundState === 'result' && cards.every((c) => c.on && c.title === want && c.colour === CARD_COLOUR[ended.roundResult]
      && c.rows.length === 2 && /^NEXT ROUND IN [1-6]$/.test(c.next)),
  `room ${ended.roundResult} ${ended.roundMw} MW, want "${want}"; ${cards.map((c) => JSON.stringify(c)).join(' | ')}`);
  await shot(a, '5-A-round-result');
  await watch(async () => roomWarOf().match.round >= 1 && roomWarOf().match.roundState === 'live', goAt + 400000);
  await a.until('!window.__war().watch.wrecked', 15000).catch(() => {});
  await frames(a, 20);
  const w1 = await warOf(a);
  check('round 2: A, a wreck since its warhead, is back in the air by itself, the card gone, four airframes', wreckedBefore && !w1.watch.wrecked && !w1.round.on
    && /round 2\//i.test(w1.hud.line) && /airframes ■■■■(?![■□])/i.test(w1.hud.line), `wrecked before ${wreckedBefore}, now ${JSON.stringify(w1.watch)} hud "${w1.hud.line}"`);

  /* A crashes each of its round's airframes, put back in the air between. */
  const bAt = await b.evaluate('(() => { const s = window.__craftState(); return [s.worldX, s.worldY, s.worldZ]; })()');
  const aAt = [bAt[0], bAt[1], bAt[2] + 80];
  const allowance = itaipu1.airframes;
  for (let k = 1; k <= allowance; k += 1) {
    await hold(a, aAt);
    await a.sleep(SPAWN_MS + 800);
    await wreck(a);
    await watch(async () => (roomWarOf().match.spent[seatA] ?? 0) >= k || roomWarOf().match.round !== 1, goAt + 900000);
  }
  const m2 = roomWarOf().match;
  await a.until('window.__war().watch.on', 10000).catch(() => {});
  await frames(a, 30);
  const w = await warOf(a);
  const bPos = await b.evaluate('(() => { const s = window.__craftState(); return [s.worldX, s.worldY, s.worldZ]; })()');
  const camOff = dist(w.watch.cam, bPos);
  check('A crashes its round\'s four airframes on the real room, then spectates B: the camera on B, the round and no airframes on the HUD, the markers up', m2.round === 1
    && m2.spent[seatA] === allowance && w.watch.on && w.watch.seat === seatB && camOff < 20 && /round 2\//i.test(w.hud.line) && /airframes □□□□(?![■□])/i.test(w.hud.line)
    && w.markers.on && /^OUT OF AIRFRAMES: watching .+\. Round ends when the last one's down\.$/.test(w.watch.banner),
  `room round ${m2.round + 1} spent ${JSON.stringify(m2.spent)}; watching ${w.watch.seat} (B ${seatB}), camera ${camOff.toFixed(1)} m from B, hud "${w.hud.line}", banner "${w.watch.banner}"`);
  await shot(a, '6-A-spectates-B');
  await a.tap('BracketRight');
  await a.tap('KeyR');
  await frames(a, 10);
  const w2 = await warOf(a);
  check('] keeps to the one teammate in the air, and R does not put a spectator back in the air', w2.watch.on && w2.watch.seat === seatB && w2.watch.wrecked,
    JSON.stringify({ on: w2.watch.on, seat: w2.watch.seat, wrecked: w2.watch.wrecked }));
}

/* The pips past four and, past six, a count: the HUD's own rule, on a
 * view no round of mission 1 reaches in a check's time (a pilot with five
 * kills in a round), so the module is driven directly. */
async function pipsRule() {
  const got = await a.evaluate(`(async () => {
    const { createWarHud } = await import('/src/ui/warhud.js');
    const hud = createWarHud(() => 'X');
    const v = (earned) => ({ state: 'live', output: 14000, floor: 7700, wave: 1, waves: 2, alive: 0, rack: 1, rackMax: 1, scores: [],
      round: 1, rounds: 5, roundState: 'live', airframes: 4, spent: { 1: 1 }, earned: { 1: earned } });
    hud.update(v(2), 1, 0, 14000);
    const six = hud.shown().line;
    hud.update(v(5), 1, 0, 14000);
    const nine = hud.shown().line;
    hud.update(null);
    return { six, nine };
  })()`);
  check('a kill\'s airframes grow the pips past four, and past six they are a count', /airframes ■■■■■□(?![■□])/i.test(got.six) && /airframes ■×8/i.test(got.nine),
    `"${got.six}" then "${got.nine}"`);
}

try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready && window.__crashCam', 600000);
  }
  const code = await a.evaluate("window.__roomCreate({ map: 'itaipu' })");
  check('page A makes a private room on Itaipu', /^[A-Z0-9]{6}$/.test(code), code);
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of pages) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of pages) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
    if (!MAIN) {
      await p.evaluate("import('/scripts/war-twopage-wire.js').then((m) => m.install())");
    }
  }
  /* The radio link before the war, which the war must leave as it is. */
  let link0 = null;
  if (MAIN) {
    /* Since #258 every room but a friendly one forces crash damage on,
     * so B flies damaged before the war whatever its own setting says. */
    const own = await b.evaluate('window.__ui.settings.crashDamage');
    const on = await b.evaluate('window.__war().damage');
    check('B\'s own crash damage setting is off, and the room already flies it with damage on before the war', own === false && on === true,
      `setting ${own}, flying with damage ${on}`);
    link0 = await Promise.all(pages.map((p) => p.evaluate('JSON.stringify([window.__war().link, window.__link().id])')));
  }
  const linkSame = async () => {
    const now = await Promise.all(pages.map((p) => p.evaluate('JSON.stringify([window.__war().link, window.__link().id])')));
    const clean = (l) => {
      const [k] = JSON.parse(l);
      return k.delayMs === 0 && k.lossPpm === 0 && !k.failsafe;
    };
    return { ok: now.every((l, i) => l === link0[i] && clean(l)), detail: now.join(' | ') };
  };
  const seats = await Promise.all(pages.map((p) => p.evaluate('window.__rooms().seat')));
  const w0 = await Promise.all(pages.map(warOf));
  check('each page\'s war client has its seat and the room\'s lobby from the welcome', w0.every((w, i) => w.seat === seats[i] && w.view.state === 'lobby'),
    w0.map((w) => `${w.seat} ${w.view.state}`).join(', '));

  /* The room's seed, pinned to the first for which no Striker of the
   * wave followed below flies into a power line on its way
   * (src/share/war/wires.js): what is checked here is a Striker taken by
   * A's warhead and the rest reaching the Switchyard. scripts/war-harness.js
   * checks the lines' deaths. Its births' ids are the waves' before it at
   * two pilots, then its own. */
  {
    const strike = itaipu1.waves.findIndex((w) => w.kind === 'strike');
    const first = 1 + itaipu1.waves.slice(0, strike).reduce((n, w) => n + waveSize(w, 2), 0);
    const w = itaipu1.waves[strike];
    let pick = null;
    for (let k = 1; k < 64 && pick === null; k += 1) {
      const seed = Math.floor((k / 64) * 4294967296) >>> 0;
      const clear = Array.from({ length: waveSize(w, 2) }, (_, i) => wireStrike(itaipu1, {
        id: first + i, kind: w.kind, route: w.route, t0: 0, k: i, n: waveSize(w, 2), err: 0, target: waveTarget(w, i),
      }, (j) => wireDraw(seed, first + i, j))).every((t) => t === null);
      pick = clear ? k / 64 : null;
    }
    const room = [...server.env.ROOMS.objects.values()].find((r) => r.host.core && r.host.core.war);
    room.host.core.war.random = () => pick;
    console.log(`  info  the room's seed pinned at ${pick}, no Striker of wave ${strike + 1} on the lines`);
  }
  await a.evaluate(`window.__warDo('start', '${itaipu1.id}')`);
  for (const p of pages) {
    await p.until("window.__war().view.state === 'countdown' || window.__war().view.state === 'live'", 15000);
  }
  const goAt = (await warOf(a)).view.goAt;
  console.log(`  info  seats A ${seats[0]}, B ${seats[1]}; the go at room ms ${goAt}`);
  for (const p of pages) {
    await p.until("window.__war().view.state === 'live'", 20000 + (itaipu1.prepMs ?? 0));
  }
  const [live] = await sameView('at the go');
  const timeOf = (p) => p.evaluate("(() => { const it = window.__mapScene && window.__mapScene().userData.itaipu; return it && it.look ? it.look.time : null; })()");
  if (MAIN && itaipu1.night) {
    for (const p of pages) {
      await p.until("(() => { const it = window.__mapScene && window.__mapScene().userData.itaipu; return window.__map().ready && it && it.look && it.look.time === 'night'; })()", 120000).catch(() => {});
    }
    const times = await Promise.all(pages.map(timeOf));
    check(`${itaipu1.id} is flown at night on both pages`, times.every((t) => t === 'night'), times.join(', '));
  }
  if (MAIN) {
    /* The go's restart put both back on the slot under the war's damage
     * mode, B's setting notwithstanding. */
    await b.until('window.__war().damage === true', 20000).catch(() => {});
    const dmg = await Promise.all(pages.map((p) => p.evaluate('window.__war().damage')));
    check('the war forces crash damage on for both, B\'s own setting off', dmg.every(Boolean), JSON.stringify(dmg));
    /* Every sample the shell hands sim_input goes through rcLink, and
     * nothing else in main.js calls sim_rx_signal: with no signal set on
     * rcLink the sticks reach sim_input as they would outside a war. */
    const l = await linkSame();
    check('the war leaves the radio link as it was: the preset, no signal, no failsafe', l.ok, l.detail);
  }
  /* The room's side, traced for a failure's details: every pose the war
   * took (its t, and the room ms it came in at) and every judgement. */
  const trace = { poses: [], judged: [] };
  {
    const w = roomWarOf();
    const pose0 = w.pose.bind(w);
    w.pose = (core, s, bytes, now) => {
      const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      trace.poses.push({ seat: s.seat, t: v.getUint32(4, true), at: core.roomMs(now), flags: bytes[1] });
      return pose0(core, s, bytes, now);
    };
    const judge0 = w.judge.bind(w);
    w.judge = (core, roomNow) => {
      const f0 = w.match.f;
      const out = judge0(core, roomNow);
      trace.judged.push({ at: roomNow, f0, f: w.match.f });
      return out;
    };
  }
  /* What the room saw of seat's poses and its frontier over [t0, t1]. */
  const traceOf = (seat, t0, t1) => {
    const ps = trace.poses.filter((x) => x.seat === seat && x.t >= t0 && x.t <= t1);
    const gaps = ps.slice(1).map((x, i) => x.t - ps[i].t);
    const lag = ps.map((x) => x.at - x.t);
    const js = trace.judged.filter((j) => j.f > t0 && j.f0 < t1);
    const past = js.filter((j) => j.f > Math.max(...trace.poses.filter((x) => x.seat === seat && x.at <= j.at).map((x) => x.t)));
    return {
      gap: Math.max(...gaps),
      past: past.length,
      text: `seat ${seat}: ${ps.length} poses, gap max ${Math.max(...gaps)} ms median ${gaps.sort((a, b) => a - b)[gaps.length >> 1]}, lag max ${Math.round(Math.max(...lag))} ms, flags ${[...new Set(ps.map((x) => x.flags.toString(16)))]}; ${js.length} judgements, ${past.length} with the frontier past its newest pose`,
    };
  };
  check(`the rack is the mission's ${itaipu1.airframes} airframes a pilot, the output its 14 000 MW`, live.view.rack === 2 * itaipu1.airframes && live.view.rackMax === 2 * itaipu1.airframes && live.view.output === itaipu1.output,
    `rack ${live.view.rack}/${live.view.rackMax}, ${live.view.output} MW`);

  /* A on the second Striker's route, 15 s after its birth; B 100 m to its
   * side and 30 m up, out of every Striker's way (their gap is 25 m). */
  const wave = itaipu1.waves.findIndex((w) => w.kind === 'strike');
  const sw = itaipu1.waves[wave];
  /* The room sizes a wave by the pilots at the go: two here. */
  const swN = waveSize(sw, 2);
  const plan = planAgent(itaipu1, {
    kind: sw.kind, route: sw.route, t0: goAt + sw.at * 1000, k: 1, n: swN, err: 0, target: sw.target,
  });
  const tHit = goAt + sw.at * 1000 + 15000;
  const P = poseAt(plan, tHit).p.slice();
  const bAt = [P[0] + 100, P[1] + 30, P[2]];
  await hold(a, P);
  await hold(b, bAt);
  for (const p of pages) {
    await p.until('window.__rooms().spawning === false', SPAWN_MS + 10000);
  }
  await a.sleep(SPAWN_MS + 1000);
  console.log(`  info  held; the room has ${roomSeats()}`);
  console.log(`  info  A's craft: ${JSON.stringify(await a.evaluate('(() => { const c = window.__crash(); return { mode: window.__craftState().mode, flags: c.flags, wrecked: c.wrecked }; })()'))}`);
  /* Scouts first, then the Strikers: compared as they come. */
  let lookedAtStrikers = false;
  await watch(async () => {
    const t = await nowOf(b);
    if (!lookedAtStrikers && t > tHit - 7000) {
      lookedAtStrikers = true;
      if (MAIN && itaipu1.night) {
        const d = await b.evaluate('window.__war().drawn');
        check('by night the attackers wear nav lights: one more draw call a kind flying', d && d.navCalls > 0 && d.navCalls <= d.calls,
          d ? `${d.calls} kinds drawn, ${d.navCalls} with lights` : 'no drawn');
      }
      /* Close: a camera 12 m off the second Striker's path, 2 s ahead of
       * it, then the Strikers coming at A. */
      const near = poseAt(plan, t + 2000).p;
      await b.evaluate(`window.__setCam(${near[0] + 12}, ${near[1] + 3}, ${near[2]}, ${near[0]}, ${near[1]}, ${near[2]}, 40); true`);
      await b.until(`window.__rooms().roomNow > ${t + 2000}`, 10000);
      await shot(b, '1-B-close-on-the-strikers');
      await b.evaluate(`window.__setCam(${bAt[0]}, ${bAt[1] + 5}, ${bAt[2] + 20}, ${P[0]}, ${P[1]}, ${P[2] - 60}, 50); true`);
      await b.sleep(800);
      await shot(b, '2-B-watches-the-strikers-reach-A');
      await b.evaluate('window.__setCam(null); true');
    }
    return (await warOf(a)).log.some((e) => e.type === 'boom');
  }, tHit + 15000);
  await a.sleep(1500);
  console.log(`  info  after the Strikers' pass the room has ${roomSeats()}; its log ${JSON.stringify(roomWarOf().log.slice(0, 6))}`);
  /* The room judges a pilot only up to its newest pose, or LATE_MS behind
   * its own clock when that is later (war.js, tag's single timeline): a
   * page that sends poses further apart than that has milliseconds judged
   * before they are heard, and a pass through the bubble in one of them is
   * never seen. A software rasteriser on a loaded machine renders, and so
   * sends, a couple of times a second; SIM_GPU=1 is the cure. */
  const heard = traceOf(seats[0], tHit - 3000, tHit + 3000);
  if (itaipu1.night) {
    /* When each seat was spawning (untouchable), and when each page
     * rebuilt its world for the night: the night run's own evidence. */
    for (const seat of seats) {
      const spans = [];
      for (const x of trace.poses.filter((q) => q.seat === seat)) {
        const on = (x.flags & 64) !== 0;
        const last = spans.at(-1);
        if (on && (!last || last.to != null)) {
          spans.push({ from: x.t, to: null });
        } else if (!on && last && last.to == null) {
          last.to = x.t;
        }
      }
      console.log(`  info  seat ${seat} spawning (room ms, go ${goAt}): ${spans.map((sp) => `${sp.from}-${sp.to ?? 'on'}`).join(', ') || 'never'}`);
    }
    for (const [i, p] of pages.entries()) {
      console.log(`  info  page ${'AB'[i]} night rebuilds: ${JSON.stringify(await p.evaluate('window.__war().night'))}`);
    }
  }
  check(`the room heard A often enough to judge the pass: poses under LATE_MS (${LATE_MS} ms) apart, the frontier never past the newest`,
    heard.gap <= LATE_MS && heard.past === 0, heard.text);
  const [ba, bb] = await Promise.all(pages.map(warOf));
  const boomA = ba.log.find((e) => e.type === 'boom');
  const boomB = bb.log.find((e) => e.type === 'boom');
  check('A detonates on the Striker it was held in front of', boomA && boomA.seat === seats[0] && boomA.mine === true,
    boomA ? `seat ${boomA.seat} at ${boomA.at} (${Math.round(boomA.at - tHit)} ms from the hold point's ms), ${dist(boomA.p, P).toFixed(2)} m from it` : 'no boom');
  check('B hears the same boom, not its own', boomB && JSON.stringify({ ...boomB, mine: 0 }) === JSON.stringify({ ...boomA, mine: 0 }) && boomB.mine === false);
  const deadA = ba.log.find((e) => e.type === 'dead' && e.why === 'boom');
  const deadB = bb.log.find((e) => e.type === 'dead' && e.why === 'boom');
  check('both pages take the same Striker off, at the same ms and place', deadA && deadB && sameEvent(deadA, deadB) && deadA.ids.length === 1 && deadA.mine && !deadB.mine,
    deadA ? `ids ${deadA.ids} by ${deadA.by}` : 'none');
  if (MAIN) {
    const c = await a.evaluate('(() => { const c = window.__crash(); return { flags: c.flags, wrecked: c.wrecked, names: c.flagNames }; })()');
    check('A\'s own warhead broke A\'s craft (sim_part_break over its parts)', c.flags !== 0, JSON.stringify(c));
  }
  const [va] = await sameView('after the detonation');
  const me = va.view.scores.find((r) => r.seat === seats[0]);
  /* The warhead spent A's airframe and the kill earned it one back. */
  check('A scores the kill and the Switchyard\'s megawatts saved; its airframe spent, one earned', me && me.kills === 1 && me.mw === itaipu1.targets[sw.target].mw
    && va.view.spent[seats[0]] === 1 && va.view.earned[seats[0]] === 1 && va.view.rack === 2 * itaipu1.airframes,
    JSON.stringify(me) + ` rack ${va.view.rack}`);
  /* The wire names a seat #n; main.js by its picker name. */
  check('A\'s HUD calls its own kill and the warhead, B\'s calls A\'s', ba.said.some((s) => /SPLASH ONE/.test(s))
    && bb.said.some((s) => (MAIN ? /^[^:]+: SPLASH ONE/.test(s) : s.includes(`#${seats[0]}`))),
    `${ba.said.slice(-3).join(' | ')} || ${bb.said.slice(-3).join(' | ')}`);

  if (MAIN) {
    await roundRows(seats[0], seats[1], goAt);
  }

  /* Both 400 m up the gorge from where the Hunters are born, 100 m over
   * it and 40 m apart. */
  const hw = itaipu1.waves.find((w) => w.kind === 'hunter');
  /* The Hunters' round starts when the rounds before it end (war.js
   * rounds): wait for it, then they are born hw.at after its start. */
  await watch(async () => {
    const m = roomWarOf().match;
    return m.round === (hw.round ?? 0) && m.roundState === 'live';
  }, goAt + 600000);
  const hunterT0 = roomWarOf().match.roundAt + hw.at * 1000;
  const h0 = itaipu1.routes[hw.route][0];
  const gA = [h0[0], h0[1] + 100, h0[2] - 400];
  const gB = [h0[0], h0[1] + 100, h0[2] - 360];
  await hold(a, gA);
  await hold(b, gB);
  const yardAt = plan.tEnd;
  let lookedAtHunters = false;
  await watch(async () => {
    const t = await nowOf(b);
    if (!lookedAtHunters && t > hunterT0 + 5000) {
      lookedAtHunters = true;
      const h = (await b.evaluate(`window.__warAt(${t})`)).find((x) => x.kind === 'hunter');
      if (h) {
        /* 8 m from the hunter as drawn, on B's side of it: a live camera
         * on a 0.25 m quad at 36 m/s, so taken at once. */
        await b.evaluate(`(() => {
          const h = window.__warAt(window.__rooms().roomNow).find((x) => x.kind === 'hunter');
          const d = [${gB[0]} - h.p[0], ${gB[1]} - h.p[1], ${gB[2]} - h.p[2]];
          const n = Math.hypot(...d);
          window.__setCam(h.p[0] + d[0] / n * 8, h.p[1] + d[1] / n * 8 + 1, h.p[2] + d[2] / n * 8, h.p[0], h.p[1], h.p[2], 40);
          return true;
        })()`);
        await shot(b, '3-B-watches-a-hunter-come');
        await b.evaluate('window.__setCam(null); true');
      }
    }
    const logs = await Promise.all(pages.map(warOf));
    return t > yardAt + 3000 && logs.every((w) => w.log.filter((e) => e.type === 'boom').length >= 2);
  }, hunterT0 + 110000);
  await a.sleep(1500);
  const [ya, yb] = await Promise.all(pages.map(warOf));
  const yardA = ya.log.filter((e) => e.type === 'dead' && e.target === sw.target);
  const yardB = yb.log.filter((e) => e.type === 'dead' && e.target === sw.target);
  const yardIds = yardA.flatMap((e) => e.ids).length;
  check('the Strikers left reach the Switchyard on both pages alike', yardIds === swN - (deadA ? deadA.ids.length : 0) && JSON.stringify(yardA) === JSON.stringify(yardB) && yardA.every((e) => e.hit),
    yardA.map((e) => `${e.ids} at ${e.at} hit ${e.hit}`).join('; '));
  /* Every target hit takes its megawatts once, whoever else hits it. */
  const hitTargets = [...new Set(ya.log.filter((e) => e.type === 'dead' && e.hit).map((e) => e.target))];
  const lost = hitTargets.reduce((sum, id) => sum + itaipu1.targets[id].mw, 0);
  if (MAIN) {
    const burn = await Promise.all(pages.map((p) => p.evaluate('window.__war().burning')));
    check('the Switchyard burns on both pages', burn.every((x) => sw.target in x), JSON.stringify(burn));
  }
  check('both take each hit target\'s megawatts once, and call the Switchyard', ya.view.output === itaipu1.output - lost && yb.view.output === ya.view.output
    && JSON.stringify(ya.view.down) === JSON.stringify(hitTargets) && [ya, yb].every((w) => w.said.some((s) => s.includes('SWITCHYARD HIT'))),
  `${ya.view.output} and ${yb.view.output} MW, down ${hitTargets.join(',')}; ${ya.said.filter((s) => s.includes('HIT')).join(' | ')}`);
  if (MAIN && itaipu1.night) {
    /* The night raid's outages (src/share/war/grid.js): once every hit's
     * cascade is over, both pages have the same districts dark, the ones
     * the grid's rules put out for the hits the room sent, and each
     * page's map was handed exactly those (look/night.js setPower). A hit
     * landing while this waits starts the wait again. */
    const hitsOf = (w) => [...new Set(w.log.filter((e) => e.type === 'dead' && e.hit).map((e) => e.target))].map((target) => ({
      target, at: Math.min(...w.log.filter((e) => e.type === 'dead' && e.hit && e.target === target).map((e) => e.at)),
    }));
    let hits = hitsOf(ya);
    let from = darkFrom(hits);
    let grids = null;
    for (let k = 0; k < 4; k += 1) {
      const settled = Math.max(0, ...from.filter(Number.isFinite)) + FLICKER_MS + CASCADE_MS;
      await watch(async () => (await nowOf(a)) > settled && (await nowOf(b)) > settled, settled + 30000);
      const [wa, wb] = await Promise.all(pages.map(warOf));
      const again = hitsOf(wa);
      grids = [wa.grid, wb.grid];
      if (JSON.stringify(again) === JSON.stringify(hits)) {
        break;
      }
      hits = again;
      from = darkFrom(hits);
    }
    const want = DISTRICTS.filter((d, i) => Number.isFinite(from[i])).map((d) => d.id);
    const dark = grids.map((g) => Object.keys(g.state).filter((id) => g.state[id] === 'dark'));
    const handed = grids.map((g) => Boolean(g.map) && g.map.every((v, i) => v === (Number.isFinite(from[i]) ? 0 : 1)));
    check('the hits put the same districts out on both pages, the grid\'s, and each map has them dark',
      want.length > 0 && dark.every((d) => JSON.stringify(d) === JSON.stringify(want)) && handed.every(Boolean),
      `hits ${hits.map((h) => h.target).join(',')}; want ${want.join(',')}; A ${dark[0].join(',')}; B ${dark[1].join(',')}; maps handed ${handed.join(', ')}`);
  }
  const hunterBoom = ya.log.filter((e) => e.type === 'boom')[1];
  const hunterBoomB = yb.log.filter((e) => e.type === 'boom')[1];
  check('a Hunter goes off on a pilot, and both pages agree who, when and where', hunterBoom && hunterBoomB
    && JSON.stringify({ ...hunterBoom, mine: 0 }) === JSON.stringify({ ...hunterBoomB, mine: 0 }),
  hunterBoom ? `seat ${hunterBoom.seat} at ${hunterBoom.at}` : 'no second boom');
  const deadHunt = (w) => w.log.filter((e) => e.type === 'dead' && e.why === 'boom')[1];
  check('and the same Hunter dies on both', deadHunt(ya) && sameEvent(deadHunt(ya), deadHunt(yb)),
    deadHunt(ya) ? `ids ${deadHunt(ya).ids}` : 'none');
  const huntsHeard = deadHunt(ya) ? deadHunt(ya).ids.filter((id) => heardHunts.has(id)).map((id) => [id, heardHunts.get(id)]) : [];
  check('both pages last heard that Hunter chasing the pilot it went off on (HUNTS)', hunterBoom && huntsHeard.length > 0
    && huntsHeard.some(([, [ha, hb]]) => ha === hunterBoom.seat && hb === hunterBoom.seat),
  `went off on seat ${hunterBoom ? hunterBoom.seat : '-'}, heard ${JSON.stringify(huntsHeard)}`);
  await sameView('after the Hunter');
  await shot(a, '4-A-hud-after-the-hunter');

  check('both pages list the same attackers at every compared ms', worst.mismatch.length === 0, worst.mismatch.slice(0, 2).join(' | '));
  check(`scripted attackers at the same room ms agree within ${SCRIPTED_M} m`, worst.samples > 0 && worst.scripted <= SCRIPTED_M,
    `${worst.scripted.toExponential(2)} m worst over ${worst.samples - worst.hunters} pairs`);
  check(`hunters at the same room ms agree within ${HUNTER_M} m`, worst.hunters > 0 && worst.hunter <= HUNTER_M,
    `${worst.hunter.toFixed(3)} m worst over ${worst.hunters} pairs`);
  check('each page draws its own list, instance for instance, every scripted one where attackersAt puts it', worst.drawn < 1e-3, `${worst.drawn} m worst`);
  check('at most one draw call a kind', worst.calls <= 7, `${worst.calls} kinds drawn at once at most`);

  if (MAIN) {
    await pipsRule();
  }

  await a.evaluate("window.__warDo('end')");
  for (const p of pages) {
    await p.until("window.__war().view.state === 'ended' && window.__war().hud.banner !== ''", 10000);
  }
  const [ea, eb] = await sameView('at the end');
  check('both show the mission ended', ea.hud.banner !== '' && ea.hud.banner === eb.hud.banner, ea.hud.banner);
  if (MAIN) {
    await a.sleep(500);
    const after = await Promise.all(pages.map((p) => p.evaluate('window.__war()')));
    check('after it the dam is whole', after.every((w) => Object.keys(w.burning).length === 0), after.map((w) => JSON.stringify(w.burning)).join(' | '));
    const ownAfter = await b.evaluate('window.__ui.settings.crashDamage');
    check('and the war left B\'s own crash damage setting as it was: off', ownAfter === false, `setting ${ownAfter}`);
    const l = await linkSame();
    check('and the radio link was never touched, the war\'s hits and warheads and all', l.ok, l.detail);
  }
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  for (const [i, p] of pages.entries()) {
    const st = await p.evaluate('JSON.stringify({ war: window.__war && window.__war(), rooms: window.__rooms && window.__rooms().phase })').catch((x) => String(x));
    console.log(`  page ${names[i]}: ${String(st).slice(0, 1500)}`);
    console.log(`  page ${names[i]} errors: ${p.errors.slice(0, 5).join(' | ')}`);
  }
  failed += 1;
  console.log(`  FAIL  ${e.stack || e}`);
} finally {
  for (const p of pages) {
    await p.close();
  }
  await server.stop();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
