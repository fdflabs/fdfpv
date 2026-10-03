/*
 * combat-two-page.js: combat's proof on the real shell
 * (docs/COMBAT-PLAN.md section 7). Two headless pages in one private room
 * made for combat on the Swiss valley: A flies the five inch in red, B the
 * Cub in blue. A, the host, starts a three minute round from the room's
 * lobby (its Round row, Start now); both tow their toilet paper. B hangs still sixty
 * metres up with its paper straight down; A flies past it 3.4 m off (no
 * cut), then 2.7 m off, and the owner's three metres cut it.
 * Both screens must show the same cut from the room, the piece falling,
 * and the score. By hand, against a running rooms Worker:
 *
 *   npx wrangler dev --config edge/rooms/wrangler.toml --port 8871
 *   SIM_GPU=1 node scripts/combat-two-page.js http://127.0.0.1:8871 [outdir]
 *
 * It also runs the streamer selftest's determinism run in the page and
 * holds its hash to Node's: the same bits in the browser.
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
import { mkdir, writeFile } from 'node:fs/promises';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { Streamer, streamerTrace } from '../src/game/streamer.js';
import { FULL_LINKS as FULL, POINTS_CUT } from '../edge/rooms/combat.js';
import { hullFor } from '../src/game/midair.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8871';
const outDir = process.argv[3] || join(root, 'build', 'combat-two-page');

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

/* The same run in Node and in the page: a streamer towed on a weaving
 * path and cut halfway. Its source is sent to the page as text, so the
 * two cannot drift apart. */
const RUN = `(Streamer, streamerTrace) => {
  const wave = (a) => { let x = a % (2 * Math.PI); if (x > Math.PI) { x -= 2 * Math.PI; } let t = x; let s = x; for (let n = 1; n < 12; n += 1) { t *= (-x * x) / ((2 * n) * (2 * n + 1)); s += t; } return s; };
  const s = new Streamer();
  s.lay(0, 25, 0, 0, 0, 1, undefined, null, [0, 0, -15]);
  for (let k = 0; k < 4000; k += 1) {
    s.step(10 * wave(k * 0.0007), 25 + 2 * wave(k * 0.002), -15 * k * 0.001, () => 0);
    if (k === 2000) { s.cutTo(22); }
  }
  return streamerTrace(s);
}`;

function seedFor(id, colour) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = false;
  s.livery = { [id]: { regions: { wing: colour, fuselage: colour, tail: colour, frame: colour } } };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    if (!s.roomsSeeded) {
      Object.assign(s, ${JSON.stringify(s)}, { roomsSeeded: true });
      localStorage.setItem(k, JSON.stringify(s));
    }
    /* The weight slider's first flight tip would sit over the pictures. */
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

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`toilet paper combat, two pages, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('interceptor', '#e8352e') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('cub1400', '#2f6fe0') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
    /* A key, the gesture a browser wants before it makes a sound. */
    await p.tap('KeyZ');
  }
  const code = await a.evaluate("window.__roomCreate({ mode: 'combat' })");
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of [a, b]) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of [a, b]) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
    await p.until('window.__rooms().peers[0].drawn', 30000);
  }
  check('in one room, flying, each drawing the other', true, code);

  const nodeHash = new Function('return ' + RUN)()(Streamer, streamerTrace);
  const pageHash = await a.evaluate(`import('/src/game/streamer.js').then((m) => (${RUN})(m.Streamer, m.streamerTrace))`);
  check('the streamer\'s physics gives the same bits in the page as in Node', pageHash === nodeHash, `${pageHash} ${nodeHash}`);

  /* B up in the air, held still: its paper will hang straight down. */
  const bAt = await b.evaluate(`(() => {
    const s = window.__craftState();
    const x = s.worldX + 40, z = s.worldZ + 40;
    const y = window.__heightAt(x, z) + 62;
    window.__crashThrow({ x, y, z, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: true });
    return { x, y, z };
  })()`);
  /* The host's lobby: its Round row at 3 minutes, and Start now, pressed
   * as a pilot does. */
  const row = await a.evaluate(`(() => {
    const rows = window.__ui.friendsRows();
    const round = rows.find((r) => r.label === 'Round');
    return { minutes: round ? round.value : null, start: rows.some((r) => r.action === 'friends-lobby-start') };
  })()`);
  check('the host\'s lobby has its Round row at 3 minutes, and Start now', row.minutes === '3 min' && row.start, JSON.stringify(row));
  await a.evaluate("window.__ui.act('friends-lobby-start'); true");
  for (const p of [a, b]) {
    await p.until("window.__combat().round.state === 'countdown'", 15000);
  }
  check('A starts a round and both are counting down', true);
  for (const p of [a, b]) {
    await p.until("window.__combat().round.state === 'on'", 40000);
  }
  const stopRow = await a.evaluate("window.__ui.friendsRows().some((r) => r.action === 'friends-combat-stop')");
  check('in the round, the host\'s room screen has a Stop row', stopRow === true);
  await b.sleep(1500);
  const sa = await a.evaluate('window.__combat()');
  const sb = await b.evaluate('window.__combat()');
  check('both tow fifty metres', sa.paper && sa.paper.links === 50 && sb.paper && sb.paper.links === 50, `${sa.paper && sa.paper.links} ${sb.paper && sb.paper.links}`);
  const bOnA = sa.peers[0].chains[0];
  const aOnB = sb.peers[0].chains[0];
  check('each draws the other\'s paper, whole', bOnA && bOnA.n === 51 && aOnB && aOnB.n === 51, `${bOnA && bOnA.n} ${aOnB && aOnB.n}`);
  check('B\'s paper hangs from B', bOnA && Math.hypot(bOnA.head[0] - bAt.x, bOnA.head[2] - bAt.z) < 1.5 && bOnA.low < bAt.y - 45, bOnA && `head ${bOnA.head.map((v) => v.toFixed(1))} low ${bOnA.low.toFixed(1)}`);
  check('every paper is drawn on both screens', sa.ribbons >= 2 && sb.ribbons >= 2, `${sa.ribbons} ${sb.ribbons}`);
  check('the round is on both screens with its clock', /Combat|Combate/.test(sa.hud.head + sa.said.join(' ')) || /:/.test(sa.hud.head), sa.hud.head);
  const head = bOnA.head;
  /* Each page's camera on B and the top of its paper, from either side. */
  await a.evaluate(`window.__setCam(${head[0] + 16}, ${head[1] - 10}, ${head[2] + 24}, ${head[0]}, ${head[1] - 12}, ${head[2]}, 70); true`);
  await b.evaluate(`window.__setCam(${head[0] - 16}, ${head[1] - 10}, ${head[2] - 24}, ${head[0]}, ${head[1] - 12}, ${head[2]}, 70); true`);
  await a.sleep(1200);
  await shot(a, 'a-sees-b-towing');
  await shot(b, 'b-sees-own-paper');

  /*
   * The owner's three metres (docs/COMBAT-PLAN.md 4.1): A flies past B's
   * hanging paper at 10 m/s along -x, first with its nearest part 3.4 m
   * from the paper's line (no cut), then 2.7 m (a cut). The five inch flying -x
   * reaches `side` across its path. A is put at its start and held there
   * first: a throw is a teleport, which makes A untouchable both ways for
   * Phase 5's five seconds, and at 10 m/s its own paper's snatch stays
   * under the tear (section 2.5).
   */
  const h5 = hullFor('interceptor').hull;
  let side = 0;
  for (let i = 0; i < h5.n; i += 1) {
    side = Math.max(side, Math.abs(h5.cx[i]) + h5.hx[i]);
  }
  async function passBeside(gap, depth) {
    const thrown = await a.evaluate(`(() => {
      const c = window.__combat();
      const n = c.peers[0].chains[0].nodes[${depth}];
      return window.__crashThrow({ x: n[0] + 8, y: n[1], z: n[2] + ${gap + side}, yaw: 90, pitch: 0, roll: 0, vx: -10, vy: 0, vz: 0, hold: true, fresh: false });
    })()`);
    await a.sleep(6500);
    const cutsBefore = (await a.evaluate('window.__combat()')).cuts.length;
    await a.evaluate('window.__releasePose(); true');
    return { thrown, cutsBefore };
  }
  const far = await passBeside(3.4, 15);
  await a.sleep(2500);
  const farCuts = (await a.evaluate('window.__combat()')).cuts.length;
  check('A flies past B\'s paper 3.4 m off: no cut', far.thrown && far.thrown.ok && farCuts === far.cutsBefore, `${farCuts} cuts`);
  const near = await passBeside(2.7, 25);
  check('then 2.7 m off, inside the owner\'s three metres', near.thrown && near.thrown.ok, JSON.stringify(near.thrown).slice(0, 80));
  await a.until('window.__combat().cuts.length > 0', 8000).catch(() => {});
  /* The shout goes up on the next frame and stays 1.6 s. */
  await a.until('window.__combat().hud.big !== \'\'', 2000).catch(() => {});
  const bigA = (await a.evaluate('window.__combat()')).hud.big;
  await b.until('window.__combat().cuts.length > 0', 8000).catch(() => {});
  await a.sleep(400);
  const live = [await a.evaluate('window.__combat()'), await b.evaluate('window.__combat()')];
  const ca = live[0].cuts;
  const cb = live[1].cuts;
  check('the room cut B\'s paper and both screens have the same cut', ca.length >= 1 && cb.length >= 1 && JSON.stringify(ca[0]) === JSON.stringify(cb[0]), JSON.stringify(ca[0] || {}).slice(0, 160));
  const cut = ca[0] || {};
  check(`A cut B's, for ${POINTS_CUT}`, cut.cutter === 1 && cut.victim === 2 && cut.points === POINTS_CUT, `${cut.cutter} ${cut.victim} ${cut.points} ${cut.part}`);
  check('about 25 m down, where A went by', cut.keep >= 20 && cut.keep <= 29, `keep ${cut.keep}`);
  check('A\'s screen shouts it: +100 SCHWING!', /\+100/.test(bigA) && /SCHWING/.test(bigA), bigA);
  check('the SCHWING rang on both screens', live.every((c) => c.schwing.voice && c.schwing.struck >= 1), live.map((c) => JSON.stringify(c.schwing)).join(' '));
  check('and the glint and the paper burst flashed on both', live.every((c) => c.effects.glints >= 1 && c.effects.bits > 0), live.map((c) => JSON.stringify(c.effects)).join(' '));
  const roomA = live.map((c) => c.round.scores.find((x) => x.seat === 1).points);
  check('the round is still on, and A\'s points are the same on both screens', live.every((c) => c.round.state === 'on') && roomA[0] === roomA[1] && roomA[0] >= POINTS_CUT, roomA.join(' '));
  check('and the live scoreboard on both screens shows them now, not only at the end', live.every((c) => c.hud.top.includes(`: ${roomA[0]}`)), live.map((c) => c.hud.top).join(' | '));
  /* Close on the cut, a few metres off it. */
  const p = cut.p || head;
  await a.evaluate(`window.__setCam(${p[0] + 6}, ${p[1] + 1.5}, ${p[2] + 7}, ${p[0]}, ${p[1] - 2}, ${p[2]}, 60); true`);
  await b.evaluate(`window.__setCam(${p[0] - 6}, ${p[1] + 1.5}, ${p[2] - 7}, ${p[0]}, ${p[1] - 2}, ${p[2]}, 60); true`);
  await a.sleep(300);
  const fa1 = await a.evaluate('window.__combat()');
  const fb1 = await b.evaluate('window.__combat()');
  await shot(a, 'a-sees-the-cut');
  await shot(b, 'b-sees-the-cut');
  await a.evaluate(`window.__setCam(${p[0] + 12}, ${p[1] - 4}, ${p[2] + 14}, ${p[0]}, ${p[1] - 8}, ${p[2]}, 65); true`);
  await b.evaluate(`window.__setCam(${p[0] - 12}, ${p[1] - 4}, ${p[2] - 14}, ${p[0]}, ${p[1] - 8}, ${p[2]}, 65); true`);
  await a.sleep(500);
  await shot(a, 'a-sees-the-piece-fall');
  await shot(b, 'b-sees-the-piece-fall');
  await a.sleep(1500);
  const fa2 = await a.evaluate('window.__combat()');
  const fb2 = await b.evaluate('window.__combat()');
  const pieceA1 = fa1.peers[0].chains.find((c) => c.id !== 0);
  const pieceA2 = fa2.peers[0].chains.find((c) => c.id !== 0);
  const pieceB1 = fb1.paper.chains.find((c) => c.id !== 0);
  const pieceB2 = fb2.paper.chains.find((c) => c.id !== 0);
  check('B\'s own paper is cut short and the rest falls on B\'s screen', fb2.paper.links === cut.keep && pieceB1 && pieceB2 && pieceB2.low < pieceB1.low - 0.3,
    pieceB2 ? `${fb2.paper.links} m left, piece ${pieceB1.low.toFixed(1)} to ${pieceB2.low.toFixed(1)} m` : 'no piece');
  check('and the same on A\'s screen: B\'s paper short, the piece falling', fa2.peers[0].chains[0].n - 1 === cut.keep && pieceA1 && pieceA2 && pieceA2.low < pieceA1.low - 0.3,
    pieceA2 ? `${fa2.peers[0].chains[0].n - 1} m, piece ${pieceA1.low.toFixed(1)} to ${pieceA2.low.toFixed(1)} m` : 'no piece');
  const scoreA = fa2.round.scores.find((s) => s.seat === 1);
  const scoreB = fb2.round.scores.find((s) => s.seat === 1);
  check('one cut on both screens\' scores', scoreA && scoreB && scoreA.points === scoreB.points && scoreA.cuts === 1, `${scoreA && scoreA.points} ${scoreB && scoreB.points}`);
  check('both screens said so: A its +100, B that its paper was cut', fa2.said.some((l) => /\+100/.test(l)) && fb2.said.some((l) => /!$/.test(l) && !/\+/.test(l)), `${fa2.said.slice(-1)} | ${fb2.said.slice(-1)}`);
  await a.evaluate('window.__setCam(null); true');
  await b.evaluate('window.__setCam(null); true');
  await a.sleep(600);
  await shot(a, 'a-hud');

  /*
   * CAPTURED PAPER (the owner, 2026-09-28): what A cut off B is now on the
   * end of A's paper, in B's colour, on both screens. Then B cuts A, above
   * where B's colour starts on A, and gets A's colour and its own back.
   * A is held high so its paper hangs; the held pilots wait out Phase 5's
   * spawning seconds before B is let go past A's paper. Neither throw is
   * `fresh`: a fresh one restarts the flight, and Phase 3 keeps a new
   * flight untouchable until it has flown 30 m from where it started, so
   * a pilot hovering where it started can neither cut nor be cut.
   */
  const took = FULL - cut.keep;
  const wantA = [[1, FULL], [2, took]];
  await a.sleep(800);
  const cap = [await a.evaluate('window.__combat()'), await b.evaluate('window.__combat()')];
  check(`the room adds B's ${took} m to the end of A's paper, in B's colour, on both screens`, cap.every((c) => JSON.stringify(c.runs[1]) === JSON.stringify(wantA)), cap.map((c) => JSON.stringify(c.runs[1])).join(' '));
  check('and A\'s screen draws its own paper so', JSON.stringify(cap[0].drawnRuns[1][0]) === JSON.stringify(wantA), JSON.stringify(cap[0].drawnRuns[1]));
  check('A\'s paper grows to that length on A\'s screen', cap[0].paper.links === FULL + took, `${cap[0].paper.links}`);
  const high = await a.evaluate(`(() => {
    const s = window.__craftState();
    const x = s.worldX - 60, z = s.worldZ + 40;
    const y = window.__heightAt(x, z) + 110;
    window.__crashThrow({ x, y, z, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: false });
    return { x, y, z };
  })()`);
  await a.sleep(2500);
  const hung = [await a.evaluate('window.__combat()'), await b.evaluate('window.__combat()')];
  check('A, held high, hangs all of it, and B\'s screen draws A\'s paper with B\'s colour at its end', hung[0].paper.links === FULL + took
    && JSON.stringify(hung[1].drawnRuns[1][0]) === JSON.stringify(wantA), `${hung[0].paper.links} ${JSON.stringify(hung[1].drawnRuns[1])}`);
  await a.evaluate(`window.__setCam(${high.x + 14}, ${high.y - 40}, ${high.z + 22}, ${high.x}, ${high.y - 45}, ${high.z}, 70); true`);
  await b.evaluate(`window.__setCam(${high.x - 14}, ${high.y - 40}, ${high.z - 22}, ${high.x}, ${high.y - 45}, ${high.z}, 70); true`);
  await a.sleep(800);
  await shot(a, 'a-own-paper-two-colours');
  await shot(b, 'b-sees-a-two-colours');
  /* B, a Cub, past A's paper 40 m down, above where B's colour starts. */
  const hc = hullFor('cub1400').hull;
  let cubSide = 0;
  for (let i = 0; i < hc.n; i += 1) {
    cubSide = Math.max(cubSide, Math.abs(hc.cx[i]) + hc.hx[i]);
  }
  const bPass = await b.evaluate(`(() => {
    const n = window.__combat().peers[0].chains[0].nodes[40];
    return window.__crashThrow({ x: n[0] + 10, y: n[1], z: n[2] + ${0.8 + cubSide}, yaw: 90, pitch: 0, roll: 0, vx: -12, vy: 0, vz: 0, hold: true, fresh: false });
  })()`);
  await b.sleep(6500);
  await b.evaluate('window.__releasePose(); true');
  check('B is let go past A\'s paper, its wingtip 0.8 m off', bPass && bPass.ok, JSON.stringify(bPass).slice(0, 80));
  /* Where B went, against A's paper as B's screen draws it, for the log. */
  let nearest = Infinity;
  for (let k = 0; k < 20; k += 1) {
    const g = await b.evaluate(`(() => { const s = window.__craftState(); const c = window.__combat(); const ch = c.peers[0].chains[0]; return { p: [s.worldX, s.worldY, s.worldZ], nodes: ch ? ch.nodes : [], mode: s.mode, crashed: s.crashed }; })()`);
    for (const n of g.nodes) {
      nearest = Math.min(nearest, Math.hypot(n[0] - g.p[0], n[1] - g.p[1], n[2] - g.p[2]));
    }
    await b.sleep(100);
  }
  console.log(`  B's centre came within ${nearest.toFixed(2)} m of a node of A's paper (as B draws it)`);
  await b.until('window.__combat().cuts.length > 1', 8000).catch(() => {});
  await a.until('window.__combat().cuts.length > 1', 8000).catch(() => {});
  await a.sleep(800);
  const both = [await a.evaluate('window.__combat()'), await b.evaluate('window.__combat()')];
  const cut2 = both[1].cuts[1] || {};
  check('B cut A\'s paper: one cut, the same on both screens', cut2.cutter === 2 && cut2.victim === 1 && JSON.stringify(both[0].cuts[1]) === JSON.stringify(cut2), JSON.stringify(cut2).slice(0, 140));
  const bRuns = both[1].runs[2];
  const colourSet = new Set((bRuns || []).map((r) => r[0]));
  check('and B now tows both colours, A\'s and its own, the same on both screens', colourSet.has(1) && colourSet.has(2) && JSON.stringify(both[0].runs[2]) === JSON.stringify(bRuns), JSON.stringify(bRuns));
  check('A keeps only what was above the cut', JSON.stringify(both[0].runs[1]) === JSON.stringify([[1, cut2.keep]]), JSON.stringify(both[0].runs[1]));
  await a.sleep(1200);
  const drawnB = [await a.evaluate('window.__combat().drawnRuns[2][0]'), await b.evaluate('window.__combat().drawnRuns[2][0]')];
  check('both screens draw B\'s paper in those colours', drawnB.every((d) => JSON.stringify(d) === JSON.stringify(bRuns)), drawnB.map((d) => JSON.stringify(d)).join(' '));
  /* B's camera on its own paper where it is now, looking down it. */
  await b.evaluate(`(() => {
    const n = window.__combat().paper.chains[0].nodes;
    const m = n[Math.floor(n.length / 2)];
    window.__setCam(m[0] + 30, m[1] + 12, m[2] + 30, m[0], m[1], m[2], 75);
    return true;
  })()`);
  await b.sleep(300);
  await shot(b, 'b-tows-both-colours');
  await a.evaluate('window.__setCam(null); true');
  await b.evaluate('window.__setCam(null); true');

  /*
   * THE END OF A ROUND AND THE NEXT. The round's clock is on screen; its
   * last ten seconds are counted big; at the end every pilot's paper comes
   * off and falls on both screens and the results stand big in the
   * middle; then both are back in the room's lobby (the owner,
   * 2026-10-02: back to the lobby after every round), and the host's
   * Start now counts the next round down with fresh paper, the same
   * length, and a cut works in it. The three minute round started above
   * runs out here.
   */
  const during = await a.evaluate('window.__combat()');
  check('the round\'s clock is on screen, big', /^\d:\d\d$/.test(during.hud.clock), during.hud.clock);
  const roundOne = during.round.round;
  await a.until('window.__combat().hud.final !== \'\'', 200000).catch(() => {});
  const fin = (await a.evaluate('window.__combat()')).hud.final;
  check('its last seconds are counted big', /^(10|[1-9])$/.test(fin), fin);
  for (const p of [a, b]) {
    await p.until("window.__combat().round.state === 'over'", 20000).catch(() => {});
  }
  await a.sleep(2500);
  const ended = [await a.evaluate('window.__combat()'), await b.evaluate('window.__combat()')];
  check('the round ends on both screens', ended.every((c) => c.round.state === 'over'), ended.map((c) => c.round.state).join(' '));
  check('every pilot\'s paper came off: nobody tows any, on either screen', ended.every((c) => (!c.paper || !c.paper.chains.some((x) => x.id === 0))
    && c.peers.every((p) => !p.chains.some((x) => x.id === 0 && x.n > 1))), ended.map((c) => JSON.stringify(c.paper && c.paper.chains.map((x) => x.id))).join(' '));
  check('and it falls: each screen draws the pieces coming down', ended.every((c) => c.paper && c.paper.chains.some((x) => x.id !== 0)));
  check('the results stand big in the middle of both screens', ended.every((c) => c.hud.card && /Results|Resultados/.test(c.hud.board)), ended.map((c) => c.hud.head).join(' | '));
  await a.evaluate(`window.__setCam(${high.x + 25}, ${high.y - 30}, ${high.z + 35}, ${high.x}, ${high.y - 50}, ${high.z}, 70); true`);
  await a.sleep(400);
  await shot(a, 'a-round-over');
  await a.evaluate('window.__setCam(null); true');
  const IN_LOBBY = "window.__ui.screen === 'friends' && document.querySelector('.war-lobby') && !document.querySelector('.war-lobby').hidden";
  for (const p of [a, b]) {
    await p.until(IN_LOBBY, 30000).catch(() => {});
  }
  const lobbies = await Promise.all([a, b].map((p) => p.evaluate(`({ lobby: ${IN_LOBBY}, start: window.__ui.friendsRows().some((r) => r.action === 'friends-lobby-start') })`)));
  check('then both are back in the room\'s lobby, the host with Start now', lobbies.every((v) => v.lobby) && lobbies[0].start, JSON.stringify(lobbies));
  await a.evaluate("window.__ui.act('friends-lobby-start'); true");
  for (const p of [a, b]) {
    await p.until(`window.__combat().round.state === 'countdown' && window.__combat().round.round === ${roundOne + 1}`, 30000).catch(() => {});
  }
  /* B hangs its fresh paper for A to pass. */
  await b.evaluate(`(() => {
    const s = window.__craftState();
    const x = s.worldX + 30, z = s.worldZ - 30;
    const y = window.__heightAt(x, z) + 62;
    window.__crashThrow({ x, y, z, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: false });
    return true;
  })()`);
  await b.sleep(2500);
  const nextRound = [await a.evaluate('window.__combat()'), await b.evaluate('window.__combat()')];
  check('Start now: the next round counts down on both screens, the same length', nextRound.every((c) => c.round.state === 'countdown' && c.round.round === roundOne + 1 && c.round.minutes === 3),
    nextRound.map((c) => `${c.round.state} ${c.round.round}`).join(' | '));
  check('with fresh paper for both, fifty metres each, and the results put away', nextRound.every((c) => c.paper && c.paper.links === 50 && !c.hud.card),
    nextRound.map((c) => c.paper && c.paper.links).join(' '));
  for (const p of [a, b]) {
    await p.until("window.__combat().round.state === 'on'", 30000).catch(() => {});
  }
  const cutsBeforeNext = (await a.evaluate('window.__combat()')).cuts.length;
  await passBeside(2.7, 25);
  await a.until(`window.__combat().cuts.length > ${cutsBeforeNext}`, 8000).catch(() => {});
  await a.sleep(600);
  const again = [await a.evaluate('window.__combat()'), await b.evaluate('window.__combat()')];
  const cut3 = again[0].cuts[again[0].cuts.length - 1] || {};
  check('and a cut works in it: the same cut on both screens, scored in the new round', cut3.round === roundOne + 1 && cut3.cutter === 1 && cut3.points === 100
    && JSON.stringify(again[1].cuts[again[1].cuts.length - 1]) === JSON.stringify(cut3), JSON.stringify(cut3).slice(0, 140));

  /* Sixteen streamers drawn, as a full room would: the shaping and upload
   * of every ribbon, per frame, in this page. */
  const drawMs = await a.evaluate(`import('/src/render/streamers.js').then((m) => {
    const layer = m.createStreamerLayer();
    const x = new Float64Array(51 * 3);
    for (let i = 0; i < 51; i += 1) { x[i * 3] = i * 0.9; x[i * 3 + 1] = 40 - i * 0.3; x[i * 3 + 2] = Math.sin(i * 0.2) * 3; }
    const t0 = performance.now();
    for (let f = 0; f < 200; f += 1) {
      for (let s = 1; s <= 16; s += 1) { layer.draw(s, [s], 0, x, 51, f / 60, false, null); }
      layer.update(1 / 60);
    }
    const ms = (performance.now() - t0) / 200;
    layer.clear();
    return ms;
  })`);
  check('sixteen streamers cost under 2 ms of a frame to shape', drawMs < 2, `${drawMs.toFixed(3)} ms a frame`);

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
