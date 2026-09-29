/*
 * edit-play-check.js: an edit played on the real page, and the export
 * driver's frame schedule.
 *
 * In headless Chromium, on the Swiss valley, a Skyhunter thrown into the
 * grass, then V:
 *
 *  1. A cut at 4 s and the new shot set to Orbit: the camera drawn at
 *     3.9 s is the Chase's pose and at 4.1 s the Orbit's.
 *  2. That shot at 0.25x, the movie trimmed round the cut, and a stub job
 *     driven through the export driver whose next() holds every other
 *     call: every movie frame is stepped and captured once, in order, and
 *     the clip time advances by 1 / 60 a frame in the Chase and by
 *     0.25 / 60 in the Orbit.
 *  3. A stub job that skips frames the way the real time recorder does:
 *     every frame in between is still stepped, in order.
 *  4. A clip with two camera keys, written as the versions before edits
 *     wrote it (3, 4 or 5), saved to My clips and played: the camera
 *     drawn before, between and after the keys is the one the keys gave.
 *  5. No page errors.
 *
 * Run: npm run edit:play
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

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

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
  };
  return [`try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
  } catch (e) { /* Storage refused; the run boots on its defaults. */ }`];
}

/* Waits are on the page's own clocks (scripts/crashcam-e2e.js says why). */
const WAIT = 90000;
const H = 'window.__crashCam.h()';

async function frames(page, n) {
  const f0 = await page.evaluate('window.__boot().frames');
  await page.until(`window.__boot().frames >= ${f0 + n}`, WAIT);
}

async function afterSteps(page, ms) {
  const t0 = await page.evaluate('window.__crash().simT');
  await page.until(`window.__crash().simT >= ${t0 + ms / 1000}`, WAIT);
}

/* The playhead to t, paused, and the frame that drew it drawn. */
async function drawnAt(page, t) {
  await page.evaluate(`${H}.api.jumpTo(${t})`);
  await page.until(`${H}.view().drawn === ${t}`, 30000);
  await frames(page, 1);
}

function poseErr(a, b) {
  const dp = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
  const dot = Math.abs(a.quat[0] * b.quat[0] + a.quat[1] * b.quat[1] + a.quat[2] * b.quat[2] + a.quat[3] * b.quat[3]);
  return { dp, dq: 1 - Math.min(1, dot), df: Math.abs(a.fov - b.fov) };
}
const same = (e) => e.dp < 1e-6 && e.dq < 1e-9 && e.df < 1e-6;
const said = (e) => `${e.dp.toExponential(1)} m, ${e.dq.toExponential(1)}, fov ${e.df.toExponential(1)}`;

/* A job of the driver's shape (src/replay/crashcam.js runJob). `pick`
 * says what next() answers on each call, from the call count and the
 * next index due; it is run in the page. */
function stubJob(pick) {
  return `(() => {
    const plan = ${H}.plan();
    const log = { given: [], captured: [], n: plan.n, calls: 0 };
    window.__stubLog = log;
    let due = 0;
    let lastGiven = -1;
    const pick = ${pick};
    const job = {
      progress: { done: 0, total: plan.n, etaS: 0, realtime: false },
      next() {
        log.calls += 1;
        if (due >= plan.n) {
          return null;
        }
        const i = pick(log.calls, due);
        if (i < 0) {
          return -1;
        }
        due = i + 1;
        lastGiven = i;
        log.given.push(i);
        return i;
      },
      capture(canvas) {
        log.captured.push(lastGiven);
        log.w = canvas.width;
      },
      async finish() {
        log.finished = true;
        return { name: 'stub', bytes: new Blob([]) };
      },
      cancel() {},
    };
    ${H}.stepLog(true);
    window.__stubDone = false;
    ${H}.runJob(job, 60).then(() => { window.__stubDone = true; });
    return plan.n;
  })()`;
}

/* The stub's run over, or what it had done when it stopped. */
async function stubRun(page) {
  try {
    await page.until('window.__stubDone', 400000);
  } catch (err) {
    const log = await page.evaluate('(({ calls, given, captured }) => ({ calls, given: given.length, captured: captured.length }))(window.__stubLog)');
    throw new Error(`the stub job stalled: ${JSON.stringify(log)}; page errors: ${page.errors.slice(0, 3).join(' | ')}`);
  }
}

async function main() {
  console.log('an edit played on the real page');
  const page = await openPage({ root, width: 640, height: 360, url: '/index.html?map=swiss2', seed: seed() });
  try {
    await page.until('window.__shellReady && window.__map && window.__map().ready && window.__crashCam && window.__boot', 180000);
    await frames(page, 3);
    await page.tap('ShiftLeft');
    await page.evaluate('window.__drawOff(true)');
    const pad = await page.evaluate('(() => { const s = window.__craftState(); return { x: s.worldX, z: s.worldZ, g: s.worldY - s.groundClearance }; })()');
    await page.evaluate('window.__stick(0, -0.1, 0, 0.6)');
    await page.evaluate(`window.__crashThrow({ fresh: true, x: ${pad.x}, y: ${pad.g + 40}, z: ${pad.z}, yaw: 0, pitch: -10, vx: 0, vy: 0, vz: -16, showCraft: false })`);
    await page.until('window.__crash().wrecked || window.__craftState().landed', WAIT);
    await afterSteps(page, 500);
    await page.evaluate('window.__drawOff(false)');
    await frames(page, 2);
    await page.tap('KeyV');
    await page.until('window.__crashCam.live()', 10000);
    await frames(page, 3);
    let v = await page.evaluate(`JSON.parse(JSON.stringify(${H}.view()))`);
    check('the replay opens on one Chase shot over the whole clip', v.edit.shots.length === 1 && v.rig === 'chase'
      && v.edit.shots[0].t0 === 0 && Math.abs(v.edit.out - v.dur) < 1e-9 && v.speed === 1, `${v.dur.toFixed(2)} s`);
    if (v.dur < 6) {
      throw new Error(`the clip is ${v.dur.toFixed(2)} s, too short to cut at 4 s`);
    }

    console.log('1. a cut at 4 s to an Orbit');
    await page.evaluate(`${H}.api.jumpTo(4)`);
    const cutOk = await page.evaluate(`${H}.api.cut()`);
    await page.evaluate(`${H}.api.setRig('orbit')`);
    v = await page.evaluate(`JSON.parse(JSON.stringify(${H}.view()))`);
    check('K cut the shot at the playhead and 2 made the new shot an Orbit', cutOk && v.edit.shots.length === 2
      && v.edit.shots[1].t0 === 4 && v.edit.shots[0].cam.rig === 'chase' && v.edit.shots[1].cam.rig === 'orbit' && v.shot === 1,
      v.edit.shots.map((s) => `${s.cam.rig}@${s.t0}`).join(' '));
    const [chase, orbit] = v.edit.shots.map((s) => s.cam);
    await drawnAt(page, 3.9);
    const at39 = await page.evaluate(`${H}.camera()`);
    const want39 = await page.evaluate(`${H}.poseOf(${JSON.stringify(chase)}, 3.9)`);
    const e39 = poseErr(at39, want39);
    check('at 3.9 s the camera is the Chase\'s', same(e39), said(e39));
    await drawnAt(page, 4.1);
    const at41 = await page.evaluate(`${H}.camera()`);
    const want41 = await page.evaluate(`${H}.poseOf(${JSON.stringify(orbit)}, 4.1)`);
    const e41 = poseErr(at41, want41);
    check('at 4.1 s the camera is the Orbit\'s', same(e41), said(e41));
    const chaseAt41 = await page.evaluate(`${H}.poseOf(${JSON.stringify(chase)}, 4.1)`);
    check('and the two are different cameras', poseErr(chaseAt41, want41).dp > 0.1, `${poseErr(chaseAt41, want41).dp.toFixed(2)} m apart`);

    console.log('2. the export driver: a stub job that holds every other call');
    await page.evaluate(`${H}.api.setSpeed(0.25)`);
    await page.evaluate(`${H}.api.setEdge('in', 3.9)`);
    await page.evaluate(`${H}.api.setEdge('out', 4.05)`);
    v = await page.evaluate(`JSON.parse(JSON.stringify(${H}.view()))`);
    check('the Orbit at 0.25x, the movie 0.1 s of Chase and 0.2 s of Orbit', v.edit.shots[1].speed === 0.25 && v.edit.shots[0].speed === 1
      && Math.abs(v.movie.dur - 0.3) < 1e-9, `movie ${v.movie.dur.toFixed(4)} s`);
    const uptime = (await import('node:os')).uptime;
    const load = (await import('node:os')).loadavg;
    console.log(`     uptime ${(uptime() / 3600).toFixed(2)} h, load ${load().map((x) => x.toFixed(1)).join(' ')}`);
    const w0 = Date.now();
    const f0 = await page.evaluate('window.__boot().frames');
    const n = await page.evaluate(stubJob('(call, due) => (call % 2 === 0 ? -1 : due)'));
    await stubRun(page);
    const wall = (Date.now() - w0) / 1000;
    const drawn = (await page.evaluate('window.__boot().frames')) - f0;
    console.log(`     ${n} movie frames through the driver in ${wall.toFixed(1)} s of wall clock, the page drawing ${(drawn / wall).toFixed(2)} frames a second`);
    let log = await page.evaluate('window.__stubLog');
    let stepped = await page.evaluate(`${H}.stepped()`);
    const inOrder = (a, len) => a.length === len && a.every((x, i) => x === i);
    check('every movie frame given once, in order', inOrder(log.given, n) && log.finished, `${log.given.length} of ${n}, ${log.calls} calls`);
    check('every one captured once, in order, after it was drawn', inOrder(log.captured, n), `${log.captured.length} captured`);
    check('every one stepped once, in order', inOrder(stepped.map((s) => s.i), n), `${stepped.length} stepped`);
    const steps = stepped.slice(1).map((s, k) => ({ t: s.t, d: s.t - stepped[k].t }));
    const inChase = steps.filter((s) => s.t < 4 - 1e-9);
    const inOrbit = steps.filter((s) => s.t > 4 + 0.25 / 60);
    const worst = (list, want) => Math.max(...list.map((s) => Math.abs(s.d - want)));
    check('the Chase advances 1 / 60 s of clip a frame', inChase.length > 3 && worst(inChase, 1 / 60) < 1e-9,
      `${inChase.length} frames, worst ${worst(inChase, 1 / 60).toExponential(1)}`);
    check('the 0.25x Orbit advances 0.25 / 60 s of clip a frame', inOrbit.length > 8 && worst(inOrbit, 0.25 / 60) < 1e-9,
      `${inOrbit.length} frames, worst ${worst(inOrbit, 0.25 / 60).toExponential(1)}`);
    v = await page.evaluate(`JSON.parse(JSON.stringify(${H}.view()))`);
    check('the export is over and the editor is back', v.exporting === null && !v.playing);

    console.log('3. a stub job that skips frames, as the real time recorder does');
    const n3 = await page.evaluate(stubJob('(call, due) => (due === 0 ? 0 : Math.min(window.__stubLog.n - 1, due + 3))'));
    await stubRun(page);
    log = await page.evaluate('window.__stubLog');
    stepped = await page.evaluate(`${H}.stepped()`);
    check('it is given every fourth frame and the last', log.given.every((x, k) => x === Math.min(4 * k, n3 - 1)),
      `${log.given.join(' ')} of ${n3}`);
    check('and every frame in between is still stepped, in order', inOrder(stepped.map((s) => s.i), n3), `${stepped.length} stepped`);
    await page.evaluate(`${H}.stepLog(false)`);

    console.log('4. a clip with keys, as a file before edits wrote it');
    const keyed = await page.evaluate(`(async () => {
      const { encodeReplay } = await import('/src/replay/file.js');
      const store = await import('/src/replay/store.js');
      const { defaults } = await import('/src/replay/cameras.js');
      const clip = ${H}.clip();
      const keys = [
        { t: 2, rig: 'chase', target: -1, p: defaults('chase', clip.meta.size) },
        { t: 5, rig: 'orbit', target: -1, p: { ...defaults('orbit', clip.meta.size), az: 2.2, el: 0.5 } },
      ];
      const copy = { ...clip, keys };
      delete copy.edit;
      const bytes = encodeReplay(copy);
      const version = new DataView(bytes.buffer || bytes).getUint32(4, true);
      const id = store.newId();
      await store.putClip({ id, name: 'keyed', created: Date.now(), thumb: null, bytes, airframe: clip.meta.airframe, map: clip.meta.map, duration: clip.time[clip.n - 1] });
      return { id, version, keys };
    })()`);
    check('written as a version before edits', keyed.version >= 3 && keyed.version <= 5, `version ${keyed.version}`);
    await page.evaluate(`${H}.api.playSaved(${JSON.stringify(keyed.id)})`);
    await page.until(`window.__crashCam.live() && ${H}.view() && !${H}.view().live`, 30000);
    v = await page.evaluate(`JSON.parse(JSON.stringify(${H}.view()))`);
    const shape = v.edit.shots.map((s) => `${s.cam.rig}@${s.t0} ${s.enter.type}`).join(', ');
    check('it opens as shots: the first key held to it, then its shot gliding into the second\'s',
      shape === 'chase@0 cut, chase@2 cut, orbit@5 glide', shape);
    const [k1, k2] = keyed.keys.map((k) => ({ rig: k.rig, target: k.target, watch: 0, p: k.p }));
    for (const t of [1, 2, 3.5, 5, 6]) {
      await drawnAt(page, t);
      const got = await page.evaluate(`${H}.camera()`);
      /* What the keys gave: the first before it, the last after it, and in
       * between both evaluated now, mixed by the ease. */
      const want = await page.evaluate(`(async () => {
        const { easeInOut } = await import('/src/replay/cameras.js');
        const { slerp } = await import('/src/replay/recorder.js');
        const a = ${H}.poseOf(${JSON.stringify(k1)}, ${t});
        const b = ${H}.poseOf(${JSON.stringify(k2)}, ${t});
        if (${t} <= 2) return a;
        if (${t} >= 5) return b;
        const w = easeInOut((${t} - 2) / 3);
        const q = [0, 0, 0, 1];
        slerp(a.quat[0], a.quat[1], a.quat[2], a.quat[3], b.quat[0], b.quat[1], b.quat[2], b.quat[3], w, q, 0);
        return { pos: a.pos.map((x, i) => x + (b.pos[i] - x) * w), quat: q, fov: a.fov + (b.fov - a.fov) * w };
      })()`);
      const e = poseErr(got, want);
      check(`at ${t} s the camera the keys gave`, same(e), said(e));
    }

    console.log('5. errors');
    const errs = page.errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await page.close();
  }
  if (failed) {
    console.log(`edit:play FAILED (${failed})`);
    process.exit(1);
  }
  console.log('edit:play ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
