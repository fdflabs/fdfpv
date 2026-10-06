/*
 * war-boom.js: a kamikaze kill seen from both ends, on the real shell and
 * main.js's own wiring (docs/WARFARE-PLAN.md sections 4.3 and 6.3).
 *
 *   SIM_GPU=1 npm run war:boom [-- outdir]
 *
 * Two headless pages join one private room on the Itaipu map, on a rooms
 * server this check runs in its own process; A starts mission 1 and is
 * held on the middle Striker's route, B 60 m to its side looking at the
 * point. When A's warhead goes off, both pages are photographed as fast
 * as they will go for 1.5 s, then once more at 3 s: A through its own
 * goggles, B from beside. The frames go in outdir (build/war-boom by
 * default, not in the repository), named by page and milliseconds after
 * the boom was seen, to be looked at.
 *
 * What must hold, on both pages for the same kill:
 *   - the explosion was drawn: a fireball, a shockwave and smoke spawned
 *     (window.__war().fx), and still smoke at 3 s
 *   - the frames just after it are brighter where it went off than the
 *     frame before (the fireball is in the picture, not only in a list)
 *   - A's screen flashed and shook, and A's HUD says SPLASH ONE big and
 *     centred; B's says whose kill it was on one small line
 *   - the explosion sound played on both, and the page's audio graph held
 *     at most 64 nodes throughout
 *   - A's crash cam, opened after, replays the boom at the moment it
 *     happened (its recorded event, drawn in the replay's scene)
 *   - a burst of ten at once costs the frame what it measures, in draw
 *     calls within the Itaipu budget's headroom
 *   - B's crash cam, opened while Hunters are up, draws the war's
 *     attackers where B's live frames drew them (src/replay/warrec.js):
 *     a scripted one to within REPLAY_SCRIPTED_M of it at the same room
 *     ms, a Hunter to within REPLAY_HUNTER_M (f32); and the bytes a
 *     minute of war costs in a saved replay
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
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';
import { SPAWN_MS } from '../edge/rooms/safety.js';
import { planAgent, poseAt } from '../src/share/war/routes.js';
import { MISSIONS, waveSize } from '../src/share/war/missions/index.js';

/* The drill: mission 1 as this check was written against, before First
 * Light made it a story (src/share/war/missions/itaipu-drill.js). */
const itaipu1 = MISSIONS['itaipu-drill'];

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || join(root, 'build', 'war-boom');
/* Only the frames: no check of what this build is supposed to add, for a
 * diagnosis of a build without it. */
const FRAMES_ONLY = process.argv.includes('--frames-only');

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

/* The Itaipu budget (ITAIPU-PLAN section 13) is 300 calls a view. */
const CALL_BUDGET = 300;
/* What a burst of ten may add to a frame, draw calls. */
const FX_CALLS_MAX = 8;
/* A replayed attacker against the live frame that drew it: a scripted
 * one is routes.js on the same room ms (exact but for float order), a
 * Hunter its drawn pose kept as f32 at kilometres from the origin. */
const REPLAY_SCRIPTED_M = 1e-3;
const REPLAY_HUNTER_M = 0.01;
/* src/render/audio.js: the page's own ceiling on live nodes (#218). */
const AUDIO_NODES_MAX = 64;

function seedFor(colour, crashDamage = true) {
  const s = seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, '7inch');
  s.map = 'itaipu';
  s.freestyleMap = 'itaipu';
  s.graphics = 'low';
  s.flightMode = 'angle';
  s.fpsCap = 0;
  s.airframeAsked = true;
  s.crashDamage = crashDamage;
  s.warConsent = true;
  s.livery = { '7inch': { regions: { frame: colour } } };
  s.parts = {};
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

async function grab(page) {
  const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  return Buffer.from(data, 'base64');
}
async function save(name, png) {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, `${name}.png`);
  await writeFile(path, png);
  return path;
}

const throwTo = (p, at, fresh) => p.evaluate(`window.__crashThrow({ x: ${at[0]}, y: ${at[1]}, z: ${at[2]}, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: ${fresh}, showCraft: true })`);
/* As scripts/war-twopage.js holds a craft: 40 m over the point, fresh,
 * then thrown down onto it, so it has left its spawn and can go off. */
async function hold(p, at) {
  await throwTo(p, [at[0], at[1] + 40, at[2]], true);
  await p.evaluate('new Promise((r) => { let n = 0; const f = () => (++n >= 4 ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })');
  await p.sleep(300);
  await throwTo(p, at, false);
}
const warOf = (p) => p.evaluate('window.__war()');
const nowOf = (p) => p.evaluate('window.__rooms().roomNow');

/* A screenshot's middle third: its mean brightness, 0 to 255, and the
 * share of it that is fire (red high, well over blue). Decoded by the page
 * itself, since a PNG decoder in node is a dependency this check does not
 * need. */
const lumaOf = (page, png) => page.evaluate(`(async () => {
  const img = new Image();
  img.src = 'data:image/png;base64,${png.toString('base64')}';
  await img.decode();
  const w = 96, h = 54;
  const o = document.createElement('canvas');
  o.width = w; o.height = h;
  const g = o.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(w / 3, h / 3, w / 3, h / 3).data;
  let s = 0, hot = 0;
  for (let i = 0; i < d.length; i += 4) {
    s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    hot += d[i] > 180 && d[i] > d[i + 2] + 50 ? 1 : 0;
  }
  return { luma: s / (d.length / 4), hot: hot / (d.length / 4) };
})()`);

const scratch = mkdtempSync(join(tmpdir(), 'fdfpv-boom-'));
const { startRooms } = await import('../edge/rooms/node.js');
const server = await startRooms({ db: join(scratch, 'rooms.db'), port: 0 });
const rooms = `http://127.0.0.1:${server.port}`;
const url = `/index.html?rooms=${encodeURIComponent(rooms)}`;
console.log(`A kamikaze kill from both ends, rooms at ${rooms}, frames in ${outDir}`);

const a = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#d8432f') });
const b = await openPage({ root, url, width: 1280, height: 720, seed: seedFor('#2f6fd6') });
const pages = [a, b];
const names = ['A', 'B'];

try {
  for (const p of pages) {
    await p.until('window.__shellReady === true', 300000);
    await p.until('window.__map && window.__map().ready && window.__crashCam', 600000);
    /* A key, the gesture a browser wants before it makes a sound. */
    await p.tap('KeyZ');
  }
  const code = await a.evaluate("window.__roomCreate({ map: 'itaipu' })");
  await a.until("window.__rooms().phase === 'open'", 30000);
  await b.evaluate(`window.__roomJoin(${JSON.stringify(code)}); true`);
  for (const p of pages) {
    await p.until("window.__rooms().phase === 'open' && window.__rooms().peers.length === 1 && window.__rooms().roomNow != null", 30000);
    await p.evaluate("window.__ui.onAction('fly', window.__ui.settings); true");
  }
  for (const p of pages) {
    await p.until("window.__craftState && window.__craftState().mode === 'flight'", 400000);
  }
  await a.evaluate("window.__warDo('start', 'itaipu-drill')");
  for (const p of pages) {
    await p.until("window.__war().view.state === 'live'", 30000 + (itaipu1.prepMs ?? 0));
  }
  const goAt = (await warOf(a)).view.goAt;
  await a.sleep(1500);
  if (!FRAMES_ONLY) {
    const hint = await Promise.all(pages.map((p) => p.evaluate('window.__war().hud.hint')));
    check('at the go both pages say how a warhead goes off, centred', hint.every((h) => /6 m/.test(h || '')), JSON.stringify(hint));
    await save('0-A-start-hint', await grab(a));
  }

  const wave = itaipu1.waves.findIndex((w) => w.kind === 'strike');
  const sw = itaipu1.waves[wave];
  /* The room sizes a wave by the pilots at the go (missions/index.js
   * waveSize), two here, and a wave's place in the formation moves with
   * its size: planned with the mission's bare n, A was held 10.8 m off
   * the Striker's path, outside BLAST_M, and never went off. */
  const plan = planAgent(itaipu1, {
    kind: sw.kind, route: sw.route, t0: goAt + sw.at * 1000, k: 1, n: waveSize(sw, 2), err: 0, target: sw.target,
  });
  /* As scripts/war-twopage.js holds A: 15 s after the middle Striker's
   * birth, on its way. */
  const tHit = goAt + sw.at * 1000 + 15000;
  const P = poseAt(plan, tHit).p.slice();
  /* B 60 m to the side and 15 m up, on the side the Striker comes from. */
  const back = poseAt(plan, tHit - 3000).p;
  const dir = [P[0] - back[0], P[2] - back[2]];
  const dn = Math.hypot(dir[0], dir[1]);
  const side = [-dir[1] / dn, dir[0] / dn];
  const bAt = [P[0] + side[0] * 60, P[1] + 15, P[2] + side[1] * 60];
  await hold(a, P);
  await hold(b, bAt);
  for (const p of pages) {
    await p.until('window.__rooms().spawning === false', SPAWN_MS + 10000);
  }
  /* A looks down the Striker's way, so its FPV sees it come; B looks at A. */
  const yawA = Math.atan2(-(back[0] - P[0]), -(back[2] - P[2]));
  await a.evaluate(`window.__crashThrow({ x: ${P[0]}, y: ${P[1]}, z: ${P[2]}, yaw: ${yawA}, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, hold: true, fresh: false, showCraft: true })`);
  const camB = () => b.evaluate(`window.__setCam(${bAt[0]}, ${bAt[1]}, ${bAt[2]}, ${P[0]}, ${P[1]}, ${P[2]}, 60); true`);
  await camB();
  await b.until(`window.__rooms().roomNow > ${tHit - 2500}`, 200000);
  const beforePng = [await grab(a), await grab(b)];
  await save('A-before', beforePng[0]);
  await save('B-before', beforePng[1]);
  const before = await Promise.all(pages.map((p, i) => lumaOf(p, beforePng[i])));
  console.log(`  info  before: A ${JSON.stringify(before[0])}, B ${JSON.stringify(before[1])}`);
  await a.until("window.__war().log.some((e) => e.type === 'boom')", 20000);
  /* Both pages, as fast as they photograph, for 1.5 s, and at 3 s. */
  const t0 = Date.now();
  const frames = [[], []];
  await Promise.all(pages.map(async (p, i) => {
    while (Date.now() - t0 < 1500) {
      const ms = Date.now() - t0;
      const png = await grab(p);
      frames[i].push({ ms, png });
    }
    await p.sleep(Math.max(0, 3000 - (Date.now() - t0)));
    frames[i].push({ ms: Date.now() - t0, png: await grab(p) });
  }));
  for (const [i, fs] of frames.entries()) {
    for (const f of fs) {
      await save(`${names[i]}-${String(f.ms).padStart(4, '0')}ms`, f.png);
    }
    console.log(`  info  ${names[i]}: ${fs.length} frames, at ${fs.map((f) => f.ms).join(', ')} ms`);
  }
  const [wa, wb] = await Promise.all(pages.map(warOf));
  const boomA = wa.log.find((e) => e.type === 'boom');
  const boomB = wb.log.find((e) => e.type === 'boom');
  check('both pages hear A\'s boom, and it is A\'s', boomA && boomB && boomA.mine && !boomB.mine && boomA.at === boomB.at,
    boomA ? `seat ${boomA.seat} at ${boomA.at}, p ${boomA.p.map((v) => v.toFixed(1))}` : 'none');
  console.log(`  info  A after: ${JSON.stringify(await a.evaluate('(() => { const c = window.__crash(); return { flags: c.flagNames, wrecked: c.wrecked, fpv: window.__fpvFail ? window.__fpvFail() : null, mode: window.__craftState().mode }; })()'))}`);
  if (!FRAMES_ONLY) {
    for (const [i, w] of [wa, wb].entries()) {
      const fx = w.fx;
      check(`${names[i]} drew the explosion: fireball, shockwave, smoke, debris and light`, fx && fx.booms >= 1 && fx.fire > 0 && fx.smoke > 0,
        JSON.stringify(fx));
    }
    check('A\'s screen flashed and shook for its own warhead', wa.fx && wa.fx.flashes >= 1 && wa.shake >= 0.05, `flashes ${wa.fx && wa.fx.flashes}, shake ${wa.shake} rad`);
    check('A\'s goggles kept the picture for the fireball, then lost it', wa.feedHeldMs >= 1000, `${wa.feedHeldMs} ms`);
    check('A\'s HUD said SPLASH ONE, big and centred', wa.said.some((s) => /^SPLASH ONE$/.test(s)) && wa.hud.splashSeen,
      `${wa.said.slice(-3).join(' | ')} splash ${wa.hud.splashSeen}`);
    check('B\'s HUD said whose kill it was on one line', wb.said.some((s) => /^[^:]+: SPLASH ONE$/.test(s)), wb.said.slice(-3).join(' | '));
    for (const [i, w] of [wa, wb].entries()) {
      check(`${names[i]} rang the explosion, its audio graph at most ${AUDIO_NODES_MAX} nodes`, w.boomSound && w.boomSound.rung >= 1 && w.boomSound.peakNodes <= AUDIO_NODES_MAX,
        JSON.stringify(w.boomSound));
    }
    const smoke = await Promise.all(pages.map((p) => p.evaluate('window.__war().fx')));
    check('both still have smoke hanging at 3 s', smoke.every((f) => f && f.smokeLive > 0), JSON.stringify(smoke.map((f) => f && f.smokeLive)));
    /* The picture: the frames in the first 0.8 s against the one before,
     * the brightest middle third far brighter and orange. */
    const peak = [];
    for (const [i, fs] of frames.entries()) {
      let best = before[i];
      for (const f of fs.filter((x) => x.ms <= 800)) {
        const l = await lumaOf(pages[i], f.png);
        console.log(`  info  ${names[i]} at ${f.ms} ms: luma ${l.luma.toFixed(0)}, fire ${(l.hot * 100).toFixed(0)}%`);
        if (l.hot > best.hot || (l.hot === best.hot && l.luma > best.luma)) {
          best = l;
        }
      }
      peak.push(best);
    }
    console.log(`  info  brightest middle third: A ${JSON.stringify(peak[0])}, B ${JSON.stringify(peak[1])}`);
    check('the fireball is in the picture on both: the middle third brighter than before', peak.every((x, i) => x.luma > before[i].luma + 20 && x.hot > 0.02),
      peak.map((x, i) => `${names[i]} ${before[i].luma.toFixed(0)} to ${x.luma.toFixed(0)}, ${(x.hot * 100).toFixed(0)}% orange`).join('; '));

    /* A's crash cam, over the boom. */
    await a.evaluate('window.__crashCam.open(); true');
    await a.until("window.__craftState().mode === 'replay'", 10000);
    const rb = await a.evaluate('window.__crashCam.h().booms()');
    const at = rb.length ? rb[0] : null;
    check('A\'s crash cam holds the boom, at the moment it went off', at != null, JSON.stringify(rb));
    if (at != null) {
      /* The orbit camera, off the craft, 0.4 s after it went off. */
      await a.evaluate("window.__crashCam.h().api.setRig('orbit'); true");
      await a.evaluate(`window.__crashCam.h().api.seek(${at + 0.4}); true`);
      await a.sleep(800);
      const png = await grab(a);
      await save('A-replay-at-boom-0.4s', png);
      const r = await lumaOf(a, png);
      const fx = await a.evaluate('window.__crashCam.h().boomFx()');
      check('and draws it in the replay, the fireball in the picture', fx && fx.hotLive > 0 && fx.smokeLive > 0, `${JSON.stringify(fx)}; middle third luma ${r.luma.toFixed(0)}, fire ${(r.hot * 100).toFixed(0)}%`);
      await a.evaluate(`window.__crashCam.h().api.seek(${at + 2.5}); true`);
      await a.sleep(800);
      await save('A-replay-at-boom-2.5s', await grab(a));
    }
    await a.evaluate('window.__crashCam.h().api.close(); true');
    await a.until("window.__craftState().mode === 'flight'", 10000);

    /* Ten at once, 150 m in front of B: the frame's cost against none. */
    await b.evaluate('window.__setCam(null); true');
    const cost = await b.evaluate('window.__warFxBurst(10)');
    console.log(`  info  a burst of ten: ${JSON.stringify(cost)}`);
    check(`a burst of ten adds at most ${FX_CALLS_MAX} draw calls and the view stays within ${CALL_BUDGET}`, cost.addedCalls <= FX_CALLS_MAX && cost.calls <= CALL_BUDGET,
      `${cost.baseCalls} to ${cost.calls} calls, ${cost.baseMs.toFixed(2)} to ${cost.ms.toFixed(2)} ms a frame, the pools' step ${cost.updateMs.toFixed(3)} ms`);
    check('with nothing allocated per frame: the pools did not grow', cost.grown === 0, `grew ${cost.grown}`);

    /* The replay's drones. B, held and flying, watches the Hunters come
     * (their round starts when the rounds before it end): its live frames
     * logged once one is up, then its crash cam opened on them. */
    await b.until("window.__warAt(window.__rooms().roomNow).some((x) => x.kind === 'hunter')", 600000);
    await b.evaluate(`(() => {
      const log = [];
      window.__liveWar = log;
      let n = 0;
      const f = () => {
        n += 1;
        const d = window.__war().drawn;
        if (n % 4 === 0 && d.at != null && d.list.length) {
          log.push({ at: d.at, list: d.list.map((x) => ({ id: x.id, kind: x.kind, p: x.p.slice() })) });
        }
        if (log.length < 60) {
          requestAnimationFrame(f);
        }
      };
      requestAnimationFrame(f);
      return true;
    })()`);
    await b.until('window.__liveWar.length >= 60', 60000);
    await b.evaluate('window.__crashCam.open(); true');
    await b.until("window.__craftState().mode === 'replay'", 10000);
    const live = await b.evaluate('window.__liveWar');
    let scripted = 0;
    let hunters = 0;
    let worstS = 0;
    let worstH = 0;
    let rows = 0;
    const misses = [];
    for (const f of live.filter((x, i) => i % 3 === 0)) {
      const k = await b.evaluate(`window.__crashCam.h().warRow(${f.at})`);
      if (k < 0) {
        misses.push(`no row at ${f.at}`);
        continue;
      }
      await b.evaluate(`window.__crashCam.h().api.seek(window.__crashCam.h().clipTime(${k})); true`);
      await b.sleep(150);
      const d = await b.evaluate('window.__crashCam.h().warDrawn()');
      if (!d || d.room !== f.at) {
        misses.push(`row ${k} drew room ${d && d.room} for ${f.at}`);
        continue;
      }
      rows += 1;
      const ids = (l) => l.map((x) => x.id).join(',');
      if (ids(d.list) !== ids(f.list)) {
        misses.push(`at ${f.at} live ${ids(f.list)} replay ${ids(d.list)}`);
        continue;
      }
      for (let i = 0; i < f.list.length; i += 1) {
        const e = Math.hypot(...[0, 1, 2].map((j) => f.list[i].p[j] - d.list[i].p[j]));
        if (f.list[i].kind === 'hunter') {
          hunters += 1;
          worstH = Math.max(worstH, e);
        } else {
          scripted += 1;
          worstS = Math.max(worstS, e);
        }
      }
    }
    console.log(`  info  replay against live: ${rows} frames, ${scripted} scripted and ${hunters} hunter poses compared${misses.length ? `; ${misses.slice(0, 3).join(' | ')}` : ''}`);
    check('B\'s replay draws the same attackers as its live frames at the same room ms', rows >= 10 && misses.length === 0, `${rows} frames, ${misses.length} missed`);
    check(`a scripted attacker within ${REPLAY_SCRIPTED_M} m of where it flew live`, scripted > 0 && worstS <= REPLAY_SCRIPTED_M, `${worstS.toExponential(2)} m over ${scripted}`);
    check(`a Hunter within ${REPLAY_HUNTER_M} m of where it flew live`, hunters > 0 && worstH <= REPLAY_HUNTER_M, `${worstH.toExponential(2)} m over ${hunters}`);
    await b.evaluate("window.__crashCam.h().api.setRig('orbit'); true");
    await save('B-replay-drones', await grab(b));
    const size = await b.evaluate(`(async () => {
      const f = await import('/src/replay/file.js');
      const c = window.__crashCam.h().clip();
      const withWar = f.encodeReplay(c).byteLength;
      const bare = { ...c };
      delete bare.war;
      const without = f.encodeReplay(bare).byteLength;
      const agentsJson = JSON.stringify(c.war.agents).length;
      return { withWar, without, n: c.n, seconds: c.time[c.n - 1], agents: c.war.agents.length, slots: c.war.slots, agentsJson, version: new DataView(f.encodeReplay(c)).getUint32(4, true) };
    })()`);
    const perMin = (x) => Math.round(x / size.seconds * 60);
    const rowsMin = size.n / size.seconds * 60;
    /* Forty attackers, four of them Hunters: the room column, the map's
     * clock, four slots a row and forty birth records, at this clip's
     * rows a minute. */
    const forty = Math.round(rowsMin * (8 + 8 + 4 * 32) + 40 * (size.agentsJson / Math.max(1, size.agents)));
    console.log(`  info  replay size: ${size.withWar - size.without} bytes of war in a ${size.seconds.toFixed(1)} s clip (${size.agents} scripted, ${size.slots} hunter slots, ${Math.round(rowsMin)} rows a minute): ${perMin(size.withWar - size.without)} bytes a minute of the whole ${perMin(size.withWar)}; forty attackers with four Hunters about ${forty} bytes a minute`);
    check('a saved replay of a war flight is version 14, the map, the sound and the explosions with it', size.version === 14, `version ${size.version}`);
    await b.evaluate('window.__crashCam.h().api.close(); true');
  }
  const errs = pages.flatMap((p) => p.errors).filter((e) => !e.startsWith('network:'));
  check('no page error on either page', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  for (const [i, p] of pages.entries()) {
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
