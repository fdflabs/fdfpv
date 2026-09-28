/*
 * replay-peers-two-page.js: the owner's report, as a check. "I was flying
 * slalom with a friend, then I crashed, but in the replay of the video I
 * only see my plane and not my friend's."
 *
 * Two headless pages of the real shell in one room on the Swiss valley.
 * A flies a Skyhunter, B a red Cub with the smoke on, side by side, a
 * slalom of banks left and right. B is thrown into the grass and breaks;
 * then A dives into the ground. A opens the replay (V), and:
 *
 *  1. B is in it. At rows all through the clip, B is drawn where A drew
 *     it live at that frame (the crash cam's log of what the room drew,
 *     src/replay/crashcam.js peerLog), to TOLERANCE_M.
 *  2. B's wreck is in it: at the end of the clip its pieces lie where A's
 *     screen had them when the replay was opened.
 *  3. The camera on B (J), in the chase and the orbit: B in the middle of
 *     the picture in both. Pictures of each.
 *  4. Scrubbed back to the slalom: B where it was then, and no wreck.
 *  5. Saved to My clips; TAKE OVER still puts A's plant back bit for bit
 *     and B is drawn live from the room again; the page reloaded, the
 *     clip played from My clips: B still in it, at the same places.
 *
 * By hand, against a local rooms server (never the live one):
 *
 *   ROOMS_DB=<scratch>/rooms.db PORT=8797 node edge/rooms/node.js
 *   SIM_GPU=1 node scripts/replay-peers-two-page.js http://127.0.0.1:8797 [outdir]
 *
 * Why the tolerance is what it is: a row keeps the drawn position as
 * float32, so B's position comes back to within float32's step at a few
 * hundred metres from the origin (well under a millimetre); anything else
 * is a real difference. The check allows 3 cm.
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

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rooms = process.argv[2] || 'http://127.0.0.1:8797';
const outDir = process.argv[3] || join(root, 'build', 'replay-peers');
const TOLERANCE_M = 0.03;
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

function seedFor(id, colour, addons) {
  const s = seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, id);
  s.map = 'swiss2';
  s.freestyleMap = 'swiss2';
  s.graphics = 'low';
  s.graphicsAuto = false;
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = true;
  s.hudStyle = 'game';
  if (colour) {
    s.livery = { [id]: { regions: { wing: colour, fuselage: colour, tail: colour } } };
  }
  s.parts = addons.length ? { [id]: { prop: 'stock', addons } } : {};
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
/* The replay drawn at clip time t, and its peers as drawn. */
async function drawnAt(page, t) {
  await page.evaluate(`${H}.api.jumpTo(${t})`);
  await page.until(`${H}.view().drawn === ${t}`, WAIT);
  return page.evaluate(`${H}.peers()`);
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/* B's rows in the live log, spread over the clip: `count` of them. */
function spread(rows, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(rows[Math.floor((i * (rows.length - 1)) / Math.max(1, count - 1))]);
  }
  return out;
}

/* At each logged row, the replay's B against A's live drawing of it. */
async function compareRows(page, log, seat, count) {
  const mine = [];
  for (const e of log.filter((x) => x.seat === seat)) {
    const k = await page.evaluate(`${H}.clipRow(${e.row})`);
    if (k >= 0) {
      mine.push({ ...e, k });
    }
  }
  let worst = 0;
  let missing = 0;
  const picks = spread(mine, count);
  const times = [];
  for (const e of picks) {
    const t = await page.evaluate(`${H}.clipTime(${e.k})`);
    times.push(t);
    const seen = (await drawnAt(page, t)).find((p) => p.seat === seat && p.drawn);
    if (!seen) {
      missing += 1;
      continue;
    }
    worst = Math.max(worst, dist(seen.at, e.at));
  }
  return { rows: mine.length, picked: picks.length, worst, missing, times, picks };
}

const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`replay with a friend, two pages, rooms at ${rooms}`);
const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('sky1800', null, []) });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('cub1400', '#d8432f', ['smoke']) });
try {
  for (const p of [a, b]) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready && window.__crashCam', 400000);
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

  console.log('the slalom');
  const pad = await a.evaluate('(() => { const s = window.__craftState(); return { x: s.worldX, z: s.worldZ, g: s.worldY - s.groundClearance }; })()');
  await a.evaluate(`${H}.peerLog(true)`);
  /* Side by side at 45 m, 16 m apart, heading -z at 17 m/s. */
  await a.evaluate('window.__stick(0, 0, 0, 0.75)');
  await b.evaluate('window.__stick(0, 0, 0, 0.75)');
  await a.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 45}, z: ${pad.z}, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -17, showCraft: false }).ok`);
  await b.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x + 16}, y: ${pad.g + 45}, z: ${pad.z}, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -17, showCraft: false }).ok`);
  await b.tap('KeyO');
  for (const roll of [0.5, -0.5, 0.5, -0.5]) {
    await a.evaluate(`window.__stick(${roll}, -0.1, 0, 0.75)`);
    await b.evaluate(`window.__stick(${roll}, -0.1, 0, 0.75)`);
    await a.sleep(1200);
  }
  const bLive = (await a.evaluate('window.__rooms()')).peers[0];
  check('A draws B beside it through the slalom', bLive.drawn && bLive.drawnAirframe === 'cub1400', `B at ${bLive.at.map((x) => x.toFixed(1)).join(' ')}`);

  console.log('B breaks, then A crashes');
  const aNow = await a.evaluate('window.__craftState()');
  await b.evaluate(`(() => {
    const x = ${aNow.worldX} + 22, z = ${aNow.worldZ} - 25, y = window.__heightAt(x, z) + 1.9;
    return window.__crashThrow({ x, y, z, yaw: 90, pitch: -25, roll: 75, vx: -24, vy: -8, vz: 0 }).ok;
  })()`);
  await a.until('(() => { const p = window.__rooms().peers[0]; return p.wreck && p.wreck.length > 0; })()', 20000).catch(() => {});
  await a.evaluate('window.__stick(0, 1, 0, 1)');
  await a.until('window.__crash().wrecked || window.__craftState().landed', WAIT).catch(() => {});
  await a.sleep(2500);
  const aCrash = await a.evaluate('window.__crash()');
  check('A crashed into the ground', aCrash.wrecked || aCrash.flagNames.length > 0, aCrash.flagNames.join(' '));
  const wreckLive = (await a.evaluate('window.__rooms()')).peers[0].wreck || [];
  check('A draws B\'s wreck', wreckLive.length > 0, `${wreckLive.length} pieces`);
  const log = await a.evaluate(`${H}.peerLogged()`);
  await a.evaluate(`${H}.peerLog(false)`);

  console.log('1. A opens the replay: B is in it, where A drew it');
  await a.tap('KeyV');
  await a.until('window.__crashCam.live()', 10000);
  await frames(a, 3);
  let v = await view(a);
  check('the replay has B in it', v.peers.length >= 1 && v.peers.some((p) => p.seat === bLive.seat),
    v.peers.map((p) => `seat ${p.seat} ${p.label}`).join(', '));
  const cmp = await compareRows(a, log, bLive.seat, 24);
  check(`B drawn at every picked row where A drew it live, within ${TOLERANCE_M * 100} cm`,
    cmp.picked >= 20 && cmp.missing === 0 && cmp.worst <= TOLERANCE_M,
    `${cmp.picked} of ${cmp.rows} rows, worst ${(cmp.worst * 1000).toFixed(3)} mm, ${cmp.missing} missing`);
  const stats = await a.evaluate('window.__crashCam.stats()');
  console.log(`     recorder: local ${stats.recordMsMean.toFixed(4)} ms a frame; peers ${stats.peerMsMean.toFixed(4)} ms mean, ${stats.peerMsMax.toFixed(3)} ms worst over ${stats.peerFrames} frames; peer ring ${(stats.peerBytes / 1048576).toFixed(2)} MB; dropped ${stats.peersDropped} pilots, ${stats.piecesDropped} pieces`);
  check('recording the room cost under 0.1 ms a frame, nothing dropped', stats.peerMsMean < 0.1 && stats.peersDropped === 0 && stats.piecesDropped === 0,
    `${stats.peerMsMean.toFixed(4)} ms`);

  console.log('2. B\'s wreck at the end of the clip');
  const end = v.dur;
  const atEnd = (await drawnAt(a, end)).find((p) => p.seat === bLive.seat);
  let worstPiece = 0;
  let missingPiece = 0;
  for (const p of wreckLive) {
    const q = atEnd && atEnd.wreck.find((w) => w.part === p.part);
    if (!q) {
      missingPiece += 1;
    } else {
      worstPiece = Math.max(worstPiece, dist([q.x, q.y, q.z], [p.x, p.y, p.z]));
    }
  }
  check('every piece of B\'s wreck lies where A\'s screen had it', atEnd && missingPiece === 0 && atEnd.wreck.length === wreckLive.length
    && worstPiece <= TOLERANCE_M, `${atEnd ? atEnd.wreck.length : 0} of ${wreckLive.length}, worst ${(worstPiece * 1000).toFixed(2)} mm`);

  console.log('3. the camera on B, chase and orbit');
  /* A moment of the slalom: a picked row with B high in the air. */
  const high = cmp.picks.findIndex((e) => e.at[1] > pad.g + 25);
  const tSlalom = cmp.times[high >= 0 ? high : Math.floor(cmp.times.length / 2)];
  const inSlalom = (await drawnAt(a, tSlalom)).find((p) => p.seat === bLive.seat);
  check('B trails its smoke in the replay\'s slalom', inSlalom.puffs > 20, `${inSlalom.puffs} puffs at ${tSlalom.toFixed(2)} s`);
  await a.evaluate(`${H}.setRig('chase', -1)`);
  await a.tap('KeyJ');
  v = await view(a);
  check('J puts the camera on B', v.watch > 0 && v.peers.find((p) => p.id === v.watch).seat === bLive.seat, `watch ${v.watch}`);
  for (const rig of ['chase', 'orbit']) {
    await a.evaluate(`${H}.setRig('${rig}', -1)`);
    const seen = (await drawnAt(a, tSlalom)).find((p) => p.seat === bLive.seat);
    await frames(a, 2);
    const again = (await a.evaluate(`${H}.peers()`)).find((p) => p.seat === bLive.seat);
    check(`${rig}: B in the middle of the picture`, seen.drawn && Math.abs(again.ndc[0]) < 0.35 && Math.abs(again.ndc[1]) < 0.5 && again.ndc[2] < 1,
      `ndc ${again.ndc.map((x) => x.toFixed(2)).join(' ')}`);
    await shot(a, `replay-${rig}-on-b`);
  }
  await a.tap('KeyJ');
  await a.evaluate(`${H}.setRig('chase', -1)`);
  await drawnAt(a, tSlalom);
  await frames(a, 2);
  await shot(a, 'replay-chase-on-a-with-b');

  console.log('4. scrubbed back from the wreck to the slalom');
  await drawnAt(a, v.dur);
  const early = cmp.picks[high >= 0 ? high : 1];
  const back = (await drawnAt(a, tSlalom)).find((p) => p.seat === bLive.seat);
  check('scrubbed back, B where it was then and whole', back && back.drawn && dist(back.at, early.at) <= TOLERANCE_M && back.wreck.length === 0,
    back ? `${(dist(back.at, early.at) * 1000).toFixed(3)} mm, ${back.wreck.length} pieces` : 'not drawn');

  console.log('5. saved, taken over, reloaded, played again');
  await a.tap('KeyG');
  await a.until(`${H}.api.listClips().then((l) => l.length > 0)`, 20000);
  const kept = await a.evaluate('window.__crashCamLast.saved');
  check('saved to My clips', kept && kept.frames > 100, `${kept.frames} frames, ${kept.bytes} bytes`);
  /* Take over a moment into the clip, on A's own plant. */
  const tTake = cmp.times[Math.floor(cmp.times.length / 2)];
  await drawnAt(a, tTake);
  v = await view(a);
  if (v.canTakeOver) {
    await a.tap('Enter');
    await a.until('!window.__crashCam.live()', 10000);
    const took = await a.evaluate('window.__crashCamLast.takeOver');
    check('TAKE OVER puts A\'s plant back bit for bit', took.ok && took.match, JSON.stringify(took));
    await frames(a, 5);
    const live = (await a.evaluate('window.__rooms()')).peers[0];
    check('and B is drawn live from the room again', live.drawn, `at ${live.at.map((x) => x.toFixed(1)).join(' ')}`);
  } else {
    check('TAKE OVER is offered in the middle of the clip', false, `t ${tTake}`);
    await a.tap('Escape');
  }
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
  v = await view(a);
  check('the saved clip has B in it', v.peers.some((p) => p.seat === bLive.seat), v.peers.map((p) => p.label).join(', '));
  let worstSaved = 0;
  let missingSaved = 0;
  for (let i = 0; i < cmp.picks.length; i += 3) {
    const seen = (await drawnAt(a, cmp.times[i])).find((p) => p.seat === bLive.seat && p.drawn);
    if (!seen) {
      missingSaved += 1;
    } else {
      worstSaved = Math.max(worstSaved, dist(seen.at, cmp.picks[i].at));
    }
  }
  check('played from My clips after a reload, B at the same places', missingSaved === 0 && worstSaved <= TOLERANCE_M,
    `worst ${(worstSaved * 1000).toFixed(3)} mm, ${missingSaved} missing`);
  await a.evaluate(`${H}.setRig('orbit', -1)`);
  await a.tap('KeyJ');
  await drawnAt(a, tSlalom);
  await frames(a, 2);
  await shot(a, 'saved-clip-orbit-on-b');

  const errs = [...a.errors, ...b.errors].filter((e) => !e.startsWith('network:') && !/ERR_CONNECTION_REFUSED/.test(e));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await a.close();
  await b.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
