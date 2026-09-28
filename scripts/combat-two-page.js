/*
 * combat-two-page.js: combat's proof on the real shell
 * (docs/COMBAT-PLAN.md section 7). Two headless pages in one private room
 * on the Swiss valley: A flies the five inch in red, B the Cub in blue.
 * A starts a round; both tow their toilet paper. B hangs still sixty
 * metres up with its paper straight down; A is thrown level through it.
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
import { POINTS_CUT } from '../edge/rooms/combat.js';

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
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, id);
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
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('5inch', '#e8352e') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('cub1400', '#2f6fe0') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready', 400000);
  }
  const code = await a.evaluate('window.__roomCreate()');
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
  await a.evaluate('window.__combatStart(3); true');
  for (const p of [a, b]) {
    await p.until("window.__combat().round.state === 'countdown'", 15000);
  }
  check('A starts a round and both are counting down', true);
  for (const p of [a, b]) {
    await p.until("window.__combat().round.state === 'on'", 40000);
  }
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
   * A level through B's paper, 25 m down it, at 10 m/s along -x. A is put
   * at its start and held there first: a throw is a teleport, which makes
   * A untouchable both ways for Phase 5's five seconds, and a held A's own
   * paper hangs; at 10 m/s its snatch stays under the tear, at 20 it would
   * not (docs/COMBAT-PLAN.md section 2.5).
   */
  const pass = await a.evaluate(`(() => {
    const c = window.__combat();
    const b = c.peers[0].chains[0];
    const x = b.head[0], z = b.head[2], y = b.head[1] - 25 + 0.9;
    return window.__crashThrow({ x: x + 8, y, z, yaw: 90, pitch: 0, roll: 0, vx: -10, vy: 0, vz: 0, hold: true, fresh: false });
  })()`);
  await a.sleep(6500);
  const beforeRelease = await a.evaluate('window.__combat().paper');
  check('A waits out its spawn, its own paper hanging whole', beforeRelease && beforeRelease.links === 50, `${beforeRelease && beforeRelease.links}`);
  await a.evaluate('window.__releasePose(); true');
  check('A is let go toward B\'s paper', pass && pass.ok === true, JSON.stringify(pass).slice(0, 80));
  await a.until('window.__combat().cuts.length > 0', 8000).catch(() => {});
  await b.until('window.__combat().cuts.length > 0', 8000).catch(() => {});
  const ca = (await a.evaluate('window.__combat()')).cuts;
  const cb = (await b.evaluate('window.__combat()')).cuts;
  check('the room cut B\'s paper and both screens have the same cut', ca.length >= 1 && cb.length >= 1 && JSON.stringify(ca[0]) === JSON.stringify(cb[0]), JSON.stringify(ca[0] || {}).slice(0, 160));
  const cut = ca[0] || {};
  check(`A cut B's, for ${POINTS_CUT}`, cut.cutter === 1 && cut.victim === 2 && cut.points === POINTS_CUT, `${cut.cutter} ${cut.victim} ${cut.points} ${cut.part}`);
  check('about 25 m down, where A went through', cut.keep >= 20 && cut.keep <= 29, `keep ${cut.keep}`);
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
  check('the score is on both screens', scoreA && scoreB && scoreA.points === scoreB.points && scoreA.cuts === 1, `${scoreA && scoreA.points} ${scoreB && scoreB.points}`);
  check('both screens said so: A its +100, B that its paper was cut', fa2.said.some((l) => /\+100/.test(l)) && fb2.said.some((l) => /!$/.test(l) && !/\+/.test(l)), `${fa2.said.slice(-1)} | ${fb2.said.slice(-1)}`);
  await a.evaluate('window.__setCam(null); true');
  await b.evaluate('window.__setCam(null); true');
  await a.sleep(600);
  await shot(a, 'a-hud');

  /* Sixteen streamers drawn, as a full room would: the shaping and upload
   * of every ribbon, per frame, in this page. */
  const drawMs = await a.evaluate(`import('/src/render/streamers.js').then((m) => {
    const layer = m.createStreamerLayer();
    const x = new Float64Array(51 * 3);
    for (let i = 0; i < 51; i += 1) { x[i * 3] = i * 0.9; x[i * 3 + 1] = 40 - i * 0.3; x[i * 3 + 2] = Math.sin(i * 0.2) * 3; }
    const t0 = performance.now();
    for (let f = 0; f < 200; f += 1) {
      for (let s = 1; s <= 16; s += 1) { layer.draw(s, '#e8352e', 0, x, 51, f / 60, false, null); }
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
