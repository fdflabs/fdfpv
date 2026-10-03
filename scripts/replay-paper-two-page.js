/*
 * replay-paper-two-page.js: the owner's report, as a check. "In the
 * replays I'm not seeing the paper trail."
 *
 * Two headless pages in one private room on the Swiss valley, as
 * scripts/combat-two-page.js flies them: A the five inch in red, B the Cub
 * in blue. A starts a round; B hangs still sixty metres up with its paper
 * straight down; A flies past it 0.8 m off and cuts it. A opens the
 * replay (V), and:
 *
 *  1. Both streamers are in it. At rows all through the clip, every
 *     ribbon's head, middle and end node where A's layer was asked to draw
 *     them live (the crash cam's log, src/replay/crashcam.js paperLog), to
 *     TOLERANCE_M.
 *  2. The cut: before it B's paper is whole and nothing falls; just after
 *     it the piece falls, free, and the burst and the glint are in the
 *     air; played through it at 1x the SCHWING rings once, and a scrub
 *     back and forth over it rings nothing.
 *  3. The capture: A's paper is one colour before the cut and gains B's
 *     after it, as A's screen drew it.
 *  4. Two cameras, the chase on A and the orbit on B (J): the paper in the
 *     picture in both. Pictures of each.
 *  5. Saved to My clips; the page reloaded, the clip played from My clips:
 *     the paper still there, at the same places.
 *
 * By hand, against a local rooms server (never the live one):
 *
 *   ROOMS_DB=<scratch>/rooms.db PORT=8797 node edge/rooms/node.js
 *   SIM_GPU=1 node scripts/replay-paper-two-page.js http://127.0.0.1:8797 [outdir]
 *
 * Why the tolerance is what it is: a row keeps each link of paper as a
 * direction in two bytes and a length in one, steered so the rounding
 * never adds up (src/replay/paper.js), so a node comes back within
 * PAPER_ERR_M (3 cm) of where it was drawn; the self test measures about
 * 1.5 cm worst. The check allows the 3 cm.
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
import { hullFor } from '../src/game/midair.js';
import { PAPER_ERR_M } from '../src/replay/paper.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const outDir = process.argv[3] || join(root, 'build', 'replay-paper');
const TOLERANCE_M = PAPER_ERR_M;
const WAIT = 90000;

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

function seedFor(id, colour) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = false;
  s.hudStyle = 'game';
  s.livery = { [id]: { regions: { wing: colour, fuselage: colour, tail: colour, frame: colour } } };
  return [`try {
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

async function frames(page, n) {
  const f0 = await page.evaluate('window.__boot().frames');
  await page.until(`window.__boot().frames >= ${f0 + n}`, WAIT);
}

const H = 'window.__crashCam.h()';
const view = (page) => page.evaluate(`JSON.stringify(${H}.view())`).then(JSON.parse);
/* The replay drawn at clip time t, and its paper as drawn. */
async function paperAt(page, t) {
  await page.evaluate(`${H}.api.jumpTo(${t})`);
  await page.until(`${H}.view().drawn === ${t}`, WAIT);
  return page.evaluate(`${H}.paper()`);
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/* Logged rows spread over the clip, and the replay's ribbons there
 * against the live log's. */
async function compareRows(page, log, count) {
  const byRow = new Map();
  for (const e of log) {
    const k = await page.evaluate(`${H}.clipRow(${e.row})`);
    if (k < 0) {
      continue;
    }
    if (!byRow.has(k)) {
      byRow.set(k, []);
    }
    byRow.get(k).push(e);
  }
  const rows = [...byRow.keys()].sort((x, y) => x - y);
  const picks = [];
  for (let i = 0; i < count && rows.length; i += 1) {
    picks.push(rows[Math.floor((i * (rows.length - 1)) / Math.max(1, count - 1))]);
  }
  let worst = 0;
  let missing = 0;
  let ribbons = 0;
  for (const k of picks) {
    const t = await page.evaluate(`${H}.clipTime(${k})`);
    const seen = await paperAt(page, t);
    for (const e of byRow.get(k)) {
      const r = seen && seen.ribbons.find((x) => x.key === e.key && x.id === e.id);
      if (!r || r.n !== e.n) {
        missing += 1;
        continue;
      }
      ribbons += 1;
      for (const [i, x, y, z] of e.nodes) {
        worst = Math.max(worst, dist(r.nodes[i], [x, y, z]));
      }
    }
  }
  return { rows: rows.length, picked: picks.length, ribbons, worst, missing };
}

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`replay of a combat cut, two pages, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('interceptor', '#e8352e') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('cub1400', '#2f6fe0') });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready && window.__crashCam', 400000);
    await p.tap('KeyZ');
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

  await b.evaluate(`(() => {
    const s = window.__craftState();
    const x = s.worldX + 40, z = s.worldZ + 40;
    const y = window.__heightAt(x, z) + 62;
    window.__crashThrow({ x, y, z, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: true });
    return { x, y, z };
  })()`);
  await a.evaluate("window.__ui.act('friends-combat-3'); true");
  for (const p of [a, b]) {
    await p.until("window.__combat().round.state === 'on'", 60000);
  }
  await b.sleep(1500);
  await a.evaluate(`${H}.paperLog(true)`);
  const before = await a.evaluate('window.__combat()');
  check('both tow their paper, and A draws both', before.ribbons >= 2 && before.paper && before.peers[0].chains.length >= 1,
    `${before.ribbons} ribbons, B's head ${before.peers[0].chains[0] ? before.peers[0].chains[0].head.map((v) => v.toFixed(1)).join(' ') : 'none'}`);

  /* A past B's hanging paper at 10 m/s, its nearest part 0.8 m off it,
   * 25 m down (scripts/combat-two-page.js passBeside). */
  const h5 = hullFor('interceptor').hull;
  let side = 0;
  for (let i = 0; i < h5.n; i += 1) {
    side = Math.max(side, Math.abs(h5.cx[i]) + h5.hx[i]);
  }
  const thrown = await a.evaluate(`(() => {
    const n = window.__combat().peers[0].chains[0].nodes[25];
    return window.__crashThrow({ x: n[0] + 8, y: n[1], z: n[2] + ${0.8 + side}, yaw: 90, pitch: 0, roll: 0, vx: -10, vy: 0, vz: 0, hold: true, fresh: false });
  })()`);
  await a.sleep(6500);
  await a.evaluate('window.__releasePose(); true');
  await a.until('window.__combat().cuts.length > 0', 10000).catch(() => {});
  await a.sleep(2500);
  const liveA = await a.evaluate('window.__combat()');
  const cut = liveA.cuts[0] || null;
  check('A cut B\'s paper', thrown && thrown.ok && cut && cut.cutter === 1 && cut.victim === 2, cut ? `keep ${cut.keep}` : 'no cut');
  const liveOwnRuns = JSON.stringify(liveA.drawnRuns[1][0]);
  check('and A draws its own paper with B\'s captured colour at its end', /\[2,/.test(liveOwnRuns), liveOwnRuns);
  const log = await a.evaluate(`${H}.paperLogged()`);
  await a.evaluate(`${H}.paperLog(false)`);

  console.log('1. A opens the replay: both streamers, where A drew them');
  await a.tap('KeyV');
  await a.until('window.__crashCam.live()', 10000);
  await frames(a, 3);
  const v = await view(a);
  const evs = await a.evaluate(`${H}.paperEvents()`);
  const cutEv = evs.find((e) => e.type === 'cut');
  check('the replay has the paper and the cut', Boolean(cutEv) && evs.some((e) => e.type === 'schwing'),
    evs.map((e) => `${e.type} ${e.t.toFixed(2)}`).join(', '));
  const cmp = await compareRows(a, log, 24);
  check(`every ribbon at every picked row where A's layer drew it live, within ${TOLERANCE_M * 100} cm`,
    cmp.picked >= 20 && cmp.missing === 0 && cmp.ribbons >= 2 * cmp.picked && cmp.worst <= TOLERANCE_M,
    `${cmp.ribbons} ribbons over ${cmp.picked} of ${cmp.rows} rows, worst ${(cmp.worst * 1000).toFixed(1)} mm, ${cmp.missing} missing`);
  const stats = await a.evaluate('window.__crashCam.stats()');
  console.log(`     paper: ${stats.paperRibbons} ribbons kept over ${stats.paperFrames} frames, ${stats.paperMsMean.toFixed(4)} ms a frame mean, ${stats.paperMsMax.toFixed(3)} ms worst; ring ${(stats.paperBytes / 1048576).toFixed(2)} MB; ${stats.paperDropped} dropped`);
  check('recording the paper cost under 0.1 ms a frame, nothing dropped', stats.paperMsMean < 0.1 && stats.paperDropped === 0, `${stats.paperMsMean.toFixed(4)} ms`);

  console.log('2. the cut');
  const tc = cutEv.t;
  const pre = await paperAt(a, Math.max(0, tc - 0.5));
  const bPre = pre.ribbons.filter((r) => r.key === 2);
  check('before it, B\'s paper whole and nothing falling', bPre.length === 1 && bPre[0].id === 0 && bPre[0].n === 51, bPre.map((r) => `${r.id}:${r.n}`).join(' '));
  const post = await paperAt(a, Math.min(v.dur, tc + 0.3));
  const bPost = post.ribbons.filter((r) => r.key === 2);
  const piece = bPost.find((r) => r.id !== 0);
  check('just after it, B\'s paper short and the piece falling, free', piece && piece.free && bPost.some((r) => r.id === 0 && r.n === cut.keep + 1),
    bPost.map((r) => `${r.id}:${r.n}${r.free ? ' free' : ''}`).join(' '));
  check('and the burst and the glint in the air', post.effects.glints >= 1 && post.effects.bits > 0, JSON.stringify(post.effects));
  const s0 = (await a.evaluate(`${H}.paper()`)).schwings;
  await paperAt(a, Math.max(0, tc - 0.4));
  await paperAt(a, tc + 0.4);
  await paperAt(a, Math.max(0, tc - 0.2));
  const s1 = (await a.evaluate(`${H}.paper()`)).schwings;
  await a.evaluate(`${H}.api.setSpeed(1)`);
  await a.tap('Space');
  await a.until(`${H}.view().t > ${tc + 0.1}`, 30000).catch(() => {});
  await a.tap('Space');
  const s2 = (await a.evaluate(`${H}.paper()`)).schwings;
  check('played through the cut at 1x the SCHWING rings once; scrubbed over it, never', s1 === s0 && s2 === s1 + 1, `${s0} ${s1} ${s2}`);

  console.log('3. the capture');
  const early = await paperAt(a, Math.max(0, tc - 0.5));
  const late = await paperAt(a, v.dur);
  const ownEarly = JSON.stringify(early.colours[1] && early.colours[1][0]);
  const ownLate = JSON.stringify(late.colours[1] && late.colours[1][0]);
  check('A\'s paper is its own colour before the cut and gains B\'s after it, as A drew it live', ownEarly === '[[1,50]]' && ownLate === liveOwnRuns,
    `${ownEarly} then ${ownLate}, live ${liveOwnRuns}`);

  console.log('4. two cameras');
  /* Each camera drawn back far enough for fifty metres of paper. */
  const tShow = Math.min(v.dur, tc + 0.3);
  const seen = (p) => p.ribbons.map((r) => `${r.key}:${r.id} ${r.seen}/${r.n}`).join(' | ');
  await a.evaluate(`${H}.setRig('chase', -1)`);
  await a.evaluate(`${H}.api.wheel(2600)`);
  await paperAt(a, tShow);
  await frames(a, 2);
  const inChase = await a.evaluate(`${H}.paper()`);
  check('chase on A, drawn back: both pilots\' paper and the falling piece in the picture',
    [1, 2].every((key) => inChase.ribbons.some((r) => r.key === key && r.seen > 0)) && inChase.ribbons.some((r) => r.id !== 0 && r.seen > 0), seen(inChase));
  await shot(a, 'replay-chase-on-a-the-cut');
  await a.evaluate(`${H}.setRig('orbit', -1)`);
  await a.tap('KeyJ');
  await a.evaluate(`${H}.api.wheel(2300)`);
  /* Looking down on B, along its hanging paper. */
  await a.evaluate(`${H}.api.drag(0, 140)`);
  await paperAt(a, tShow);
  await frames(a, 2);
  const inOrbit = await a.evaluate(`${H}.paper()`);
  check('orbit on B, drawn back: B\'s paper and the piece in the picture', inOrbit.ribbons.filter((r) => r.key === 2).every((r) => r.seen > 0),
    seen(inOrbit));
  await shot(a, 'replay-orbit-on-b-the-cut');
  /* A's own paper with B's on its end, from off to A's side. */
  await a.tap('KeyJ');
  await a.evaluate(`${H}.api.wheel(1200)`);
  await paperAt(a, Math.min(v.dur, tc + 1.5));
  await frames(a, 2);
  await shot(a, 'replay-orbit-on-a-captured-colours');

  console.log('5. saved, reloaded, played again');
  await a.tap('KeyG');
  await a.until(`${H}.api.listClips().then((l) => l.length > 0)`, 20000);
  const kept = await a.evaluate('window.__crashCamLast.saved');
  check('saved to My clips', kept && kept.frames > 100, `${kept.frames} frames, ${kept.bytes} bytes`);
  const ref = await paperAt(a, tShow);
  await a.tap('Escape');
  await a.evaluate('(window.__beforeReload = true)');
  await a.cdp.send('Page.reload', {}, a.sessionId);
  await a.until('!window.__beforeReload', WAIT);
  await a.until('window.__shellReady && window.__map && window.__map().ready && window.__crashCam && window.__boot', 400000);
  await a.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  await a.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  await frames(a, 5);
  await a.tap('KeyV');
  await a.until('window.__crashCam.live()', 10000);
  await a.tap('KeyM');
  await a.until("document.querySelectorAll('.cc-clip').length > 0", 10000);
  await a.evaluate("document.querySelector('.cc-clip [data-act=play]').click()");
  await a.until(`window.__crashCam.live() && ${H}.view() && !${H}.view().live`, 20000);
  const again = await paperAt(a, tShow);
  let worstSaved = 0;
  let missingSaved = 0;
  for (const r of ref.ribbons) {
    const q = again && again.ribbons.find((x) => x.key === r.key && x.id === r.id && x.n === r.n);
    if (!q) {
      missingSaved += 1;
      continue;
    }
    for (let i = 0; i < r.n; i += 1) {
      worstSaved = Math.max(worstSaved, dist(r.nodes[i], q.nodes[i]));
    }
  }
  check('played from My clips after a reload, every ribbon at the same places', ref.ribbons.length >= 3 && missingSaved === 0 && worstSaved === 0,
    `${ref.ribbons.length} ribbons, worst ${(worstSaved * 1000).toFixed(3)} mm, ${missingSaved} missing`);
  await a.evaluate(`${H}.setRig('orbit', -1)`);
  await a.tap('KeyJ');
  await paperAt(a, tShow);
  await frames(a, 2);
  await shot(a, 'saved-clip-orbit-on-b-the-cut');

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:') && !/ERR_CONNECTION_REFUSED/.test(e));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
