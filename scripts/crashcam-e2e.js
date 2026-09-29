/*
 * crashcam-e2e.js: the crash cam on the real page, end to end.
 *
 * In headless Chromium, on the Swiss valley with crash damage on, a Skyhunter:
 *
 *  0. The recorder changes nothing: the same hands off crash is thrown
 *     twice with the recorder and journal on and once with them off, and
 *     the plant's step trace (window.__stepTrace, the hash of the state
 *     into and out of every step) is the same all three times.
 *  1. Thrown at 60 m, its right wing broken off in the air, flown on with
 *     the sticks, into the grass. The REPLAY prompt is up after the crash.
 *     The recorder's cost per frame and its memory are read back.
 *  2. V opens the editor; the plant stops. A scrub; slow motion; the
 *     follow camera on the wing; two cuts (K), the last shot pushed in; a
 *     PNG; the replay saved to My clips with its three shots, a range of an
 *     odd number of frames on purpose. (The movie export is checked by
 *     npm run export:check, and the frame loop that drives it by
 *     npm run edit:play.)
 *  3. TAKE OVER at a frame after the wing came off and before the crash:
 *     the plant's state hash after the restore is the one the frame
 *     recorded, and the craft flies on from there.
 *  4. The page reloaded: My clips lists the replay; played, it opens as a
 *     saved clip with its shots and runs.
 *  5. Flown past the 30 s window: the journal holds its bounded number of
 *     copies, and the steady state memory and costs are printed.
 *  6. No page errors.
 *
 * With --shots=<dir> it leaves pictures of the editor, the follow shot and
 * My clips there.
 *
 * Run: node scripts/crashcam-e2e.js [--shots=dir]
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const shots = shotsArg ? shotsArg.slice(8) : null;
if (shots) {
  mkdirSync(shots, { recursive: true });
}

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) {
    failed += 1;
  }
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const AIRFRAME = 'sky1800';
function seed() {
  const settings = {
    ...seatAirframe({ airframe: '5inch', rates: airframeById('5inch').rates }, AIRFRAME),
    airframeAsked: true,
    map: 'swiss2',
    graphics: 'low',
    graphicsAuto: false,
    crashDamage: true,
    sound: true,
    /* The Parts tab's smoke system fitted, so O trails smoke. */
    parts: { [AIRFRAME]: { prop: 'stock', addons: ['smoke'] } },
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

const WAIT = 90000;
const simT = (page) => page.evaluate('window.__crash().simT');
async function afterSteps(page, ms) {
  const t0 = await simT(page);
  await page.until(`window.__crash().simT > ${t0}`, WAIT);
  const t1 = await simT(page);
  await page.until(`window.__crash().simT >= ${t1 + ms / 1000}`, WAIT);
}

async function shot(page, name) {
  if (!shots) {
    return;
  }
  const r = await page.cdp.send('Page.captureScreenshot', { format: 'png' }, page.sessionId);
  writeFileSync(join(shots, `${name}.png`), Buffer.from(r.data, 'base64'));
  console.log(`  shot ${join(shots, `${name}.png`)}`);
}

/*
 * WAITS ARE ON THE PAGE'S OWN CLOCKS, NEVER ON THE WALL.
 *
 * This ran on the airfield, which drew about 555 frames over the flight;
 * the Swiss valley draws about 120. Fixed sleeps sized for the one read
 * the other before the frame that answers had been drawn: the REPLAY chip
 * before the HUD change reached it, the follow camera before the scrub was
 * drawn. So a wait is either on the state the check is about (the frame
 * the editor drew, the plant's clock) or on n frames the shell rendered,
 * and it means the same thing at any frame rate.
 */
async function frames(page, n) {
  const f0 = await page.evaluate('window.__boot().frames');
  await page.until(`window.__boot().frames >= ${f0 + n}`, WAIT);
}

async function ready(page) {
  await page.until('window.__shellReady && window.__map && window.__map().ready && window.__crashCam && window.__boot', 180000);
  await frames(page, 3);
}

const H = 'window.__crashCam.h()';
const view = (page) => page.evaluate(`JSON.stringify(${H}.view())`).then(JSON.parse);

/* A hands off Skyhunter thrown from 20 m over the pad at 18 m/s, 25 deg
 * nose down, into the grass, from the plant's first step: held, the sticks
 * set, then let go, the way scripts/crash-feel.js stages a rerun. The step
 * trace of the first 3 s, hashed, and where two traces part.
 *
 * At lap clock 0 every time. The Swiss valley's traffic is a function of
 * that clock, which a throw otherwise leaves running, and the pad is
 * wherever the craft stood at boot, on some boots by the road, which the
 * Skyhunter then glides down: the three throws met the cars at three
 * different times. A car that strikes one wreck and misses the next parts
 * the traces on a contact pass step, state in, which is how this check
 * was seen to fail on a loaded machine (steps 2601 and 2969, both after a
 * pass) with the recorder having nothing to do with it. The traffic is
 * an input like the sticks. */
async function tracedThrow(page, pad) {
  await page.evaluate('window.__stick(0, 0, 0, 0)');
  const r = await page.evaluate(`window.__crashThrow({ fresh: true, hold: true, clockMs: 0, x: ${pad.x}, y: ${pad.g + 20}, z: ${pad.z}, yaw: 0, pitch: -25, vx: 0, vy: 0, vz: -18, showCraft: true }).ok`);
  await frames(page, 2);
  await page.evaluate('window.__releasePose()');
  await afterSteps(page, 3000);
  return page.evaluate(`(() => {
    const t = window.__stepTrace();
    const n = Math.min(t.n, 3000);
    let h = 0x811c9dc5;
    for (let i = 0; i < n; i += 1) {
      h = Math.imul(h ^ t.pre[i], 0x01000193) >>> 0;
      h = Math.imul(h ^ t.plane[i], 0x01000193) >>> 0;
      h = Math.imul(h ^ t.post[i], 0x01000193) >>> 0;
    }
    return { ok: ${r}, n, hash: h.toString(16), broke: window.__crash().flagNames,
      pre: t.pre.slice(0, n), plane: t.plane.slice(0, n), post: t.post.slice(0, n) };
  })()`);
}

function parts(a, b) {
  const n = Math.min(a.n, b.n);
  for (let k = 0; k < n; k += 1) {
    if (a.pre[k] !== b.pre[k] || a.plane[k] !== b.plane[k] || a.post[k] !== b.post[k]) {
      let what = 'state out';
      if (a.pre[k] !== b.pre[k]) {
        what = 'state in';
      } else if (a.plane[k] !== b.plane[k]) {
        what = 'ground plane';
      }
      return `they part at step ${k + 1}, ${what}`;
    }
  }
  return `identical over ${n} steps`;
}

async function main() {
  console.log('crash cam, end to end, on the real page');
  const page = await openPage({ root, width: 1280, height: 720, url: '/index.html?map=swiss2', seed: seed() });
  try {
    await ready(page);
    /* A key press is the pilot's gesture that starts the sound. */
    await page.tap('ShiftLeft');

    console.log('0. the recorder and the journal change nothing');
    /* The picture is off wherever only the plant and the recorder are being
     * asked something: the recorder runs every frame whether or not the
     * frame is drawn (src/main.js records before the draw), so nothing it
     * keeps changes, and a world that draws a frame a second on a loaded
     * software rasteriser would otherwise spend minutes drawing a flight
     * nobody looks at. It is back on before anything on screen is read. */
    await page.evaluate('window.__drawOff(true)');
    const pad = await page.evaluate('(() => { const s = window.__craftState(); return { x: s.worldX, z: s.worldZ, g: s.worldY - s.groundClearance }; })()');
    const a = await tracedThrow(page, pad);
    const b = await tracedThrow(page, pad);
    await page.evaluate('window.__crashCam.setRecording(false)');
    const c = await tracedThrow(page, pad);
    await page.evaluate('window.__crashCam.setRecording(true)');
    check('the crash is a crash', a.ok && a.broke.length > 0, a.broke.join(' '));
    check('two runs with the recorder on trace the same', a.n > 2000 && a.hash === b.hash, `${a.n} steps, ${parts(a, b)}`);
    check('with the recorder and journal off, the same trace again', c.hash === a.hash, parts(a, c));

    console.log('1. a wing off in the air, flown on, crashed');
    await page.evaluate('window.__stick(0, 0, 0, 0.7)');
    const thrown = await page.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 60}, z: ${pad.z}, yaw: 30, pitch: 0, vx: -9, vy: 0, vz: -15.6, showCraft: false }).ok`);
    check('thrown at 60 m', thrown);
    await afterSteps(page, 300);
    const smokeT0 = await page.evaluate('window.__crashCam.stats().ringFrames');
    await page.tap('KeyO');
    await afterSteps(page, 1200);
    const smokeLive = await page.evaluate('window.__craft().smoke');
    check('O turns the smoke on and it trails', smokeLive.on && smokeLive.puffs > 20, `${smokeLive.puffs} puffs, from ring frame ${smokeT0}`);
    const wing = await page.evaluate("window.__crash().partLabels.findIndex((l) => l === 'wing right')");
    const broke = await page.evaluate(`window.__crashBreak(${wing})`);
    check('the right wing is broken off in flight', wing > 0 && broke === 'OK', `part ${wing} ${broke}`);
    /* Flown on: a bank against the missing panel, some throttle. */
    await page.evaluate('window.__stick(-0.6, -0.2, 0, 0.8)');
    await afterSteps(page, 1500);
    await page.evaluate('window.__stick(-0.3, 0.3, 0, 0.4)');
    await page.until('window.__crash().wrecked || window.__craftState().landed', WAIT);
    await afterSteps(page, 1200);
    await page.evaluate('window.__drawOff(false)');
    await frames(page, 3);
    /* The prompt as the pilot sees it: in the FPV OSD's type while that
     * OSD is on screen, as a chip otherwise (the Game HUD, or a chase view
     * the OSD is not drawn over). */
    const prompt = () => page.evaluate(`(() => {
      const p = document.querySelector('.cc-prompt');
      const o = window.__fpvOsd();
      return { chip: Boolean(p && !p.hidden), osdOn: o.on, osd: o.values.replay || '', rows: o.rows.join(' / ') };
    })()`);
    await page.evaluate("(window.__ui.settings.hudStyle = 'osd', true)");
    await frames(page, 3);
    const inOsd = await prompt();
    if (inOsd.osdOn) {
      check('with the FPV OSD up, REPLAY is drawn in the OSD and the chip is hidden',
        inOsd.osd === 'REPLAY [V]' && inOsd.rows.includes('REPLAY [V]') && !inOsd.chip, `osd "${inOsd.osd}", chip ${inOsd.chip}`);
    } else {
      check('with the FPV OSD not on screen (a chase view), the chip carries REPLAY', inOsd.chip && !inOsd.osd, `chip ${inOsd.chip}`);
    }
    await shot(page, 'prompt-osd');
    await page.evaluate("(window.__ui.settings.hudStyle = 'game', true)");
    await frames(page, 3);
    const inGame = await prompt();
    check('with the Game HUD, REPLAY is the chip and not in the OSD', inGame.chip && !inGame.osdOn, `chip ${inGame.chip}, osd on ${inGame.osdOn}`);
    await shot(page, 'prompt-game');
    await page.evaluate("(window.__ui.settings.hudStyle = 'osd', true)");
    const flying = await page.evaluate('window.__crashCam.stats()');
    check('the recorder costs under 0.1 ms a frame', flying.recordMsMean < 0.1,
      `mean ${flying.recordMsMean.toFixed(4)} ms, worst ${flying.recordMsMax.toFixed(3)} ms over ${flying.frames} frames`);
    console.log(`     journal copies: ${flying.snapshots}, mean ${flying.snapshotMsMean.toFixed(3)} ms, worst ${flying.snapshotMsMax.toFixed(3)} ms, once a second`);
    console.log(`     memory: ring ${(flying.ringBytes / 1048576).toFixed(2)} MB (${flying.ringFrames} frames held), journal ${(flying.journalBytes / 1048576).toFixed(2)} MB (${flying.journalSegments} copies, ${flying.journalCalls} calls)`);

    console.log('2. the editor');
    const t0 = await simT(page);
    await page.tap('KeyV');
    await page.until('window.__crashCam.live()', 10000);
    await frames(page, 3);
    const t1 = await simT(page);
    check('V opens the replay and the plant is held', Math.abs(t1 - t0) < 0.2, `sim ${t0.toFixed(3)} then ${t1.toFixed(3)}`);
    let v = await view(page);
    check('the clip holds the flight', v.dur > 5 && v.live, `${v.dur.toFixed(2)} s`);
    console.log(`     markers: ${v.markers.map((m) => `${m.type}${m.label ? ` ${m.label}` : ''} ${m.t.toFixed(2)}`).join(', ')}`);
    /* The LAST wing right: the clip also holds step 0's three throws, and
     * on the Swiss valley's pad those break the right wing too (on the
     * airfield they only ejected the pack), so the first one found was a
     * throw's and not the wing broken off in the air. */
    const off = v.markers.findLast((m) => m.type === 'off' && m.label === 'wing right');
    check('a marker where the wing came off', Boolean(off), off ? `at ${off.t.toFixed(2)} s` : 'none');
    check('an impact marker', v.markers.some((m) => m.type === 'impact'));
    if (!off) {
      throw new Error('no wing marker; nothing further can be checked');
    }
    /* Scrub: to just before the wing came off, then frame by frame. */
    await page.evaluate(`${H}.api.jumpTo(${off.t - 0.6})`);
    const before = (await view(page)).t;
    for (let i = 0; i < 5; i += 1) {
      await page.tap('ArrowRight');
    }
    await page.tap('ArrowLeft');
    v = await view(page);
    check('scrub, then four frames on', Math.abs(before - (off.t - 0.6)) < 1e-6 && v.t > before && !v.playing,
      `${before.toFixed(3)} s to ${v.t.toFixed(3)} s`);
    await page.tap('ArrowDown');
    await page.tap('ArrowDown');
    await page.tap('ArrowDown');
    v = await view(page);
    check('slow motion', v.speed === 0.1, `${v.speed}x`);
    await page.tap('Space');
    /* Played until the clip's clock has moved, on the clip's clock. */
    await page.until(`${H}.view().playing && ${H}.view().t > ${before} + 0.01`, 30000).catch(() => {});
    v = await view(page);
    check('it plays at a tenth', v.playing && v.t > before, `${v.t.toFixed(3)} s`);
    await shot(page, 'editor');
    /* The clip is still one shot: back to 1x for all of it before cutting. */
    await page.evaluate(`${H}.api.setSpeed(1)`);
    await page.tap('Digit6');
    await page.evaluate(`${H}.api.jumpTo(${off.t + 0.4})`);
    /* The follow camera picks its part at the frame it draws, so it is read
     * once the frame at the wing has been drawn. */
    await page.until(`${H}.view().drawn === ${off.t + 0.4}`, 30000).catch(() => {});
    v = await view(page);
    check('follow the wing', v.rig === 'follow' && v.target === wing, `${v.rig} part ${v.target}`);
    /* The smoke plays back: a trail in the air after O, and scrubbed back
     * to before O, none. */
    await page.until(`${H}.view().drawn === ${off.t + 0.4}`, 30000);
    const puffsAfter = await page.evaluate(`${H}.smokePuffs()`);
    await page.evaluate(`${H}.api.jumpTo(0.5)`);
    await page.until(`${H}.view().drawn === 0.5`, 30000);
    const puffsBefore = await page.evaluate(`${H}.smokePuffs()`);
    await page.evaluate(`${H}.api.jumpTo(${off.t + 0.4})`);
    await page.until(`${H}.view().drawn === ${off.t + 0.4}`, 30000);
    const puffsAgain = await page.evaluate(`${H}.smokePuffs()`);
    check('the smoke plays back, and scrubbing rebuilds the trail that was in the air',
      puffsAfter > 20 && puffsBefore === 0 && Math.abs(puffsAgain - puffsAfter) <= 2,
      `${puffsAfter} puffs at the wing, ${puffsBefore} before O, ${puffsAgain} scrubbed back to the wing`);
    await page.tap('KeyH');
    await frames(page, 2);
    await shot(page, 'follow-wing');
    await page.tap('KeyH');
    /* Two cuts a second apart, and the last shot's follow camera pushed in. */
    await page.tap('KeyK');
    await page.evaluate(`${H}.api.jumpTo(${off.t + 1.4})`);
    await page.tap('KeyK');
    await page.evaluate(`${H}.api.wheel(-900)`);
    v = await view(page);
    const sh = v.edit.shots;
    check('two cuts make three shots, the last one closer', sh.length === 3 && Math.abs(sh[1].t0 - (off.t + 0.4)) < 1e-9
      && Math.abs(sh[2].t0 - (off.t + 1.4)) < 1e-9 && sh[2].cam.p.dist < sh[1].cam.p.dist && v.shot === 2,
      sh.map((x) => `${x.cam.rig}@${x.t0.toFixed(2)} ${x.cam.p.dist.toFixed(2)} m`).join(', '));
    await page.tap('KeyL');
    await page.tap('KeyP');
    await page.until('window.__crashCamLast && window.__crashCamLast.photo', 20000);
    const photo = await page.evaluate('window.__crashCamLast.photo');
    check('a PNG at the canvas\'s full size', photo.size > 10000 && photo.type === 'image/png', `${photo.size} bytes ${photo.w}x${photo.h}`);
    /* A 1.9 s range round the wing leaving, with both cuts in it. */
    await page.evaluate(`${H}.api.jumpTo(${off.t - 0.3})`);
    await page.tap('KeyI');
    await page.evaluate(`${H}.api.jumpTo(${off.t + 1.6})`);
    await page.tap('KeyO');
    /* An odd number of frames on purpose: the pose column is 17 floats a
     * frame, so an odd count is the one that once misaligned the file and
     * failed the save. Out moves a frame on until the range is odd. */
    for (let i = 0; i < 4 && (await page.evaluate(`${H}.api.rangeFrames()`)) % 2 === 0; i += 1) {
      await page.tap('ArrowRight');
      await page.tap('KeyO');
    }
    const rangeFrames = await page.evaluate(`${H}.api.rangeFrames()`);
    await page.tap('KeyG');
    await page.until(`${H}.api.listClips().then((l) => l.length > 0)`, 20000);
    const saved = await page.evaluate(`${H}.api.listClips()`);
    const kept = await page.evaluate('window.__crashCamLast.saved');
    check('saved to My clips with its three shots, an odd number of frames', saved.length === 1 && saved[0].duration > 1
      && kept.frames % 2 === 1 && kept.frames === rangeFrames && kept.shots === 3,
      `${saved[0].name}, ${saved[0].duration.toFixed(2)} s, ${kept.frames} frames, ${kept.shots} shots, ${kept.bytes} bytes`);

    console.log('3. take over');
    await page.tap('KeyL');
    await page.evaluate(`${H}.api.jumpTo(${off.t + 0.5})`);
    await page.until(`${H}.view().drawn === ${off.t + 0.5}`, 30000).catch(() => {});
    v = await view(page);
    check('take over is offered after the wing came off', v.canTakeOver);
    await page.tap('Enter');
    await page.until('!window.__crashCam.live()', 10000);
    const took = await page.evaluate('window.__crashCamLast.takeOver');
    check('the plant is put back bit for bit', took.ok && took.match, JSON.stringify(took));
    const after = await page.evaluate('({ mode: window.__craftState().mode, flags: window.__crash().flagNames, t: window.__crash().simT })');
    check('flying again from there, the wing still off', after.mode === 'flight' && after.flags.includes('wingLost'), `${after.mode} ${after.flags.join(' ')}`);
    const trail = [];
    for (let i = 0; i < 12; i += 1) {
      trail.push(await page.evaluate('(() => { const s = window.__craftState(); const c = window.__crash(); return `${c.simT.toFixed(2)} ${s.mode}${s.crashed ? " crashed" : ""}${s.landed ? " landed" : ""}${c.wrecked ? " wreck" : ""}`; })()'));
      await frames(page, 1);
    }
    const tB = await simT(page);
    const forward = trail.map((x) => Number(x.split(' ')[0])).every((x, i, a) => i === 0 || x >= a[i - 1]);
    check('the plant steps on from the frame', tB > took.t && forward && Math.abs(Number(trail[0].split(' ')[0]) - took.t) < 0.3,
      `from sim ${took.t.toFixed(3)} s: ${trail.join(', ')}`);

    console.log('4. reloaded, played from My clips');
    /* A mark the reload clears, so ready() cannot answer from the old page. */
    await page.evaluate('(window.__beforeReload = true)');
    await page.cdp.send('Page.reload', {}, page.sessionId);
    await page.until('!window.__beforeReload', WAIT);
    await ready(page);
    await page.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 30}, z: ${pad.z}, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -16, showCraft: false })`);
    await page.evaluate('window.__drawOff(true)');
    await afterSteps(page, 800);
    await page.evaluate('window.__drawOff(false)');
    await frames(page, 2);
    await page.tap('KeyV');
    await page.until('window.__crashCam.live()', 10000);
    await page.tap('KeyM');
    await page.until("document.querySelectorAll('.cc-clip').length > 0", 10000);
    await frames(page, 3);
    await shot(page, 'my-clips');
    const cards = await page.evaluate("document.querySelectorAll('.cc-clip').length");
    check('My clips lists the replay after a reload', cards === 1, `${cards} card`);
    await page.evaluate("document.querySelector('.cc-clip [data-act=play]').click()");
    await page.until(`window.__crashCam.live() && ${H}.view() && !${H}.view().live`, 20000);
    await page.evaluate(`${H}.api.jumpTo(0)`);
    await page.tap('Space');
    /* Waited on the clip's clock, not the wall: the first frames of a
     * freshly built replay craft compile its shaders, which on a software
     * rasteriser can take longer than any fixed sleep. */
    await page.until(`${H}.view().t > 0.05`, 30000).catch(() => {});
    v = await view(page);
    check('played from My clips: a saved clip, running, its shots and all', !v.live && v.t > 0 && v.dur > 1 && v.edit.shots.length === 3
      && v.saved, `t ${v.t.toFixed(2)} of ${v.dur.toFixed(2)} s, ${v.edit.shots.length} shots`);
    check('a saved clip offers no take over', !v.canTakeOver);
    await page.evaluate(`${H}.api.jumpTo(1)`);
    /* Waited on the frame that drew it: on SwiftShader a frame can take
     * longer than any fixed sleep. */
    await page.until(`${H}.view().drawn === 1`, 30000);
    const savedSmoke = await page.evaluate(`({ puffs: ${H}.smokePuffs(), fitted: ${H}.smokeFitted() })`);
    check('the saved clip plays its smoke, on a plane wearing its smoke system', savedSmoke.puffs > 20 && savedSmoke.fitted,
      `${savedSmoke.puffs} puffs, fitted ${savedSmoke.fitted}`);
    await shot(page, 'saved-clip');
    await page.tap('Escape');
    await page.until('!window.__crashCam.live()', 10000);

    console.log('5. memory after more than the window, flying all the way');
    await page.evaluate('window.__stick(0, -0.05, 0, 0.75)');
    await page.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 200}, z: ${pad.z}, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: -16, showCraft: false })`);
    await page.evaluate('window.__drawOff(true)');
    await afterSteps(page, 36000);
    await page.evaluate('window.__drawOff(false)');
    const steady = await page.evaluate('window.__crashCam.stats()');
    const sim36 = await page.evaluate('({ t: window.__crash().simT, wrecked: window.__crash().wrecked })');
    check('the journal stays bounded past 30 s', steady.journalSegments <= 33,
      `${steady.journalSegments} copies, ${(steady.journalBytes / 1048576).toFixed(2)} MB, after ${sim36.t.toFixed(1)} s of sim${sim36.wrecked ? ' (wrecked)' : ''}`);
    console.log(`     steady: ring ${(steady.ringBytes / 1048576).toFixed(2)} MB fixed, journal ${(steady.journalBytes / 1048576).toFixed(2)} MB, record mean ${steady.recordMsMean.toFixed(4)} ms, worst ${steady.recordMsMax.toFixed(3)} ms over ${steady.frames} frames; copies mean ${steady.snapshotMsMean.toFixed(3)} ms, worst ${steady.snapshotMsMax.toFixed(3)} ms`);

    console.log('6. errors');
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    if (errs.length) {
      console.log(`     page errors: ${errs.slice(0, 6).join(' | ')}`);
    }
    await page.close();
  }
  if (failed) {
    console.log(`crashcam:e2e FAILED (${failed})`);
    process.exit(1);
  }
  console.log('crashcam:e2e ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
