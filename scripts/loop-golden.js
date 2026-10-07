/*
 * loop-golden.js: the shell's frame loop (frameBody in src/main.js), frame
 * by frame on a clock the harness owns, against a record.
 *
 * The loop is a function of wall time and of the sticks: it feeds the
 * plant from the RC grid, batches the plant's steps, reads the ground and
 * the solids back, interpolates the pose, moves the camera, feeds the OSD,
 * the banner and the audio engine. No existing check holds all of that at
 * once, because the wall clock is the browser's and no two runs draw the
 * same frames. Here a seed evaluated before the shell loads replaces
 * performance.now and requestAnimationFrame with a virtual clock, so a
 * scenario is a fixed list of frame deltas and a stick program, and every
 * frame of it can be compared with a record.
 *
 * Each scenario runs its frames in ONE synchronous evaluate, so no timer
 * or fetch can land between two frames, and samples after every frame:
 * the run mode and screen, the craft's flags, the step trace (count, the
 * last state hash and the last stick frame stamped into the plant), the
 * camera, the intro shot's clock, and what the loop handed ui.setOsd,
 * ui.setBanner, ui.setStickOverlay, ui.setScore and audio.update. Each
 * field's stream over the scenario is digested; the record keeps the
 * digest and every 20th frame's value for the diagnostic.
 *
 * Recording takes RECORD_RUNS runs and keeps the fields whose streams
 * agree in all of them; a field that moved between two runs of the same
 * code is recorded as moving and only its presence is checked. A compare
 * fails on any stable field whose stream changed.
 *
 *   node scripts/loop-golden.js            compare with the record
 *   node scripts/loop-golden.js --record   write the record (old code!)
 *   LOOP_ONLY=<page>,...                   run those pages only
 *
 * The record is tests/fixtures/loop-golden.json. Browser: run it through
 * ~/.cache/run-check.sh.
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

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPage } from '../tests/lib/page.js';
import { SETTINGS_KEY, seatAirframe } from '../src/ui/ui.js';
import { airframeById } from '../configs/airframes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const RECORD = join(root, 'tests', 'fixtures', 'loop-golden.json');
const RECORD_RUNS = Number(process.env.RECORD_RUNS) || 3;
const WAIT = 300000;
const KEEP_EVERY = 20;
/* Frames for the intro shot to run out after the first placement. */
const INTRO_TAIL = 700;
/* Each scenario's first frame lands at a fixed virtual wall time. */
const SCENARIO_START = 600000;
const recording = process.argv.includes('--record');
const only = process.env.LOOP_ONLY ? process.env.LOOP_ONLY.split(',') : null;
const onlySc = process.env.LOOP_SC ? process.env.LOOP_SC.split(',') : null;

/*
 * The virtual clock and the one random source. Until the harness holds it, a real timer ticks it at
 * 60 Hz so the shell boots and the map streams in; after hold() only
 * advance() moves it, one listed delta per frame, and every frame callback
 * runs inside that call. The deltas are not all equal on purpose: the
 * accumulator, the RC grid and the intro clock all have to survive a
 * jittery display and a dropped frame.
 */
const VT_SEED = `(() => {
  const vt = { now: 0, held: false, cbs: [], frame: 1000 / 60, rng: 0x2545F491 };
  performance.now = () => vt.now;
  /* The lens shake is the one place the shell draws a random number; a
   * seeded xorshift32 makes the camera a function of the frames too. */
  Math.random = () => {
    let x = vt.rng;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    vt.rng = x >>> 0;
    return vt.rng / 4294967296;
  };
  window.requestAnimationFrame = (cb) => { vt.cbs.push(cb); return vt.cbs.length; };
  window.cancelAnimationFrame = () => {};
  const tick = (dt) => {
    vt.now += dt;
    const cbs = vt.cbs;
    vt.cbs = [];
    for (const cb of cbs) { cb(vt.now); }
  };
  setInterval(() => { if (!vt.held) tick(vt.frame); }, 4);
  window.__vt = {
    hold: () => { vt.held = true; return vt.now; },
    now: () => vt.now,
    advance: (n, dts, each, startAt = 0) => {
      vt.rng = 0x2545F491;
      /* A scenario starts at its own fixed wall time, so nothing that
       * reads the clock itself (a cooldown, a wind phase) depends on how
       * many frames the boot and the placement took. Forward only. */
      if (startAt > vt.now) vt.now = startAt;
      const out = [];
      for (let i = 0; i < n; i += 1) {
        tick(dts[i % dts.length]);
        out.push(each(i));
      }
      return out;
    },
  };
})();`;

/* A display that stutters: mostly 60 Hz, one long frame in eight. */
const DTS = [16.7, 15.9, 17.4, 16.2, 16.7, 16.0, 17.1, 33.5];

/*
 * Stick programs, by frame index, as [roll, pitch, yaw, throttle] or null
 * to leave the sticks where they are. Written in the page.
 */
const PROGRAMS = {
  /* Sit on the pad, throttle up, then sway, pitch forward, yaw, hover. */
  fly: `(i) => {
    if (i < 30) return [0, 0, 0, 0];
    if (i < 90) return [0, 0, 0, Math.min(0.78, 0.4 + (i - 30) * 0.01)];
    if (i < 200) return [Math.sin((i - 90) / 14) * 0.35, 0, 0, 0.6];
    if (i < 260) return [0, 0.55, 0, 0.62];
    if (i < 330) return [0, 0, 0.5, 0.58];
    return [Math.sin(i / 23) * 0.2, Math.cos(i / 31) * 0.15, 0, 0.55];
  }`,
  /* A roll from a climb, then a flip, for the recogniser. */
  tricks: `(i) => {
    if (i < 20) return [0, 0, 0, 0];
    if (i < 100) return [0, 0, 0, 0.8];
    if (i < 140) return [1, 0, 0, 0.5];
    if (i < 200) return [0, 0, 0, 0.62];
    if (i < 240) return [0, 1, 0, 0.5];
    return [0, 0, 0, 0.6];
  }`,
  /* Nothing: the throw decides. */
  still: `(i) => (i === 0 ? [0, 0, 0, 0] : null)`,
  /* Inverted on the grass: wait, then poke roll, for the scripted turtle. */
  poke: `(i) => {
    if (i < 120) return [0, 0, 0, 0];
    if (i < 140) return [1, 0, 0, 0];
    return [0, 0, 0, 0];
  }`,
};

/*
 * Pages: a seat (settings and map), and its scenarios in order. A scenario
 * is a start (R, or a throw through __crashThrow at a point relative to
 * the spawn, with the plant fresh and the lap clock at zero; a throw a
 * hand above the spawn is the pad), a stick program and a frame count. Flight is entered
 * once per page through __placeCraft, the way contact-golden does: the
 * Fly action waits on a sign in and the title's world.
 */
const PAGES = [
  {
    id: 'swiss2', map: 'swiss2', settings: {},
    scenarios: [
      { id: 'fly', start: { dy: 0.3 }, program: 'fly', frames: 700 },
      { id: 'restart', start: 'reset', program: 'fly', frames: 240 },
      { id: 'perch', start: { dy: 0.9, pitch: 0, vz: 0 }, program: 'still', frames: 300 },
      { id: 'turtle', start: { dy: 0.5, roll: 180, vz: 0 }, program: 'poke', frames: 360 },
      { id: 'clip', start: { dy: 3, pitch: -80, vz: -22 }, program: 'still', frames: 320 },
    ],
  },
  {
    id: 'latency-standard', map: 'swiss2', settings: { latencyMode: 'standard' },
    scenarios: [{ id: 'fly', start: { dy: 0.3 }, program: 'fly', frames: 500 }],
  },
  {
    id: 'link-elrs150', map: 'swiss2', settings: { link: 'elrs150' },
    scenarios: [{ id: 'fly', start: { dy: 0.3 }, program: 'fly', frames: 500 }],
  },
  {
    id: 'alps-scored', map: 'alps', settings: { freestyleScoring: 'scored' },
    scenarios: [{ id: 'tricks', start: { dy: 0.3 }, program: 'tricks', frames: 600 }],
  },
  {
    id: 'track', map: 'track', settings: {},
    scenarios: [{ id: 'fly', start: { dy: 0.3 }, program: 'fly', frames: 500 }],
  },
];

const TRACK_DOC = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'map-track-v4.json'), 'utf8'));
const TRACK_SEAT = `localStorage.setItem('webfpv.share.import.v1', ${JSON.stringify(JSON.stringify({
  id: TRACK_DOC.id, name: TRACK_DOC.name, author: '', board: '', document: TRACK_DOC, local: true,
}))});`;

function seed(page) {
  const settings = {
    ...seatAirframe({ airframe: 'interceptor', rates: airframeById('interceptor').rates }, 'interceptor'),
    airframeAsked: true,
    map: page.map,
    graphics: 'low',
    graphicsAuto: false,
    crashDamage: process.env.LOOP_DAMAGE !== '0',
    sound: false,
    ...page.settings,
  };
  return [VT_SEED, `try {
    const k = ${JSON.stringify(SETTINGS_KEY)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    Object.assign(s, ${JSON.stringify(settings)});
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem('webfpv.airhint.v2', '1');
    ${page.map === 'track' ? TRACK_SEAT : ''}
  } catch (e) { /* Storage refused; the run boots on defaults and the record says so. */ }`];
}

/* Installed once per page: the loop's calls into the HUD and the mix. */
const SPIES = `(() => {
  if (window.__loopSpy) return true;
  const spy = window.__loopSpy = {};
  const wrap = (obj, name) => {
    const f = obj[name];
    obj[name] = function (...args) { spy[name] = args; return f.apply(this, args); };
  };
  wrap(window.__ui, 'setBanner');
  wrap(window.__ui, 'setOsd');
  wrap(window.__ui, 'setStickOverlay');
  wrap(window.__ui, 'setScore');
  wrap(window.__audio, 'update');
  return true;
})()`;

/* One scenario: the start, then n frames with the program, sampled. */
const RUN = (sc) => `(() => {
  const ui = window.__ui;
  const spy = window.__loopSpy;
  const prog = ${PROGRAMS[sc.program]};
  const start = ${JSON.stringify(sc.start)};
  if (start === 'reset') {
    window.__input.onKey('KeyR', false);
  } else if (typeof start === 'object') {
    const m = window.__map();
    const x = m.spawn.x + (start.dx || 0), z = m.spawn.z + (start.dz || 0);
    const y = window.__heightAt(x, z) + (start.dy || 0);
    const thrown = window.__crashThrow({
      x, y, z, yaw: start.yaw || 0, pitch: start.pitch || 0, roll: start.roll || 0,
      vx: start.vx || 0, vy: start.vy || 0, vz: start.vz || 0,
      hold: false, fresh: true, clockMs: 0, showCraft: true,
    });
    if (!thrown || thrown.ok === false) throw new Error('throw refused: ' + JSON.stringify(thrown));
  }
  /* Render side numbers to nine significant digits: the camera and the
   * readouts are derived through smoothers whose residual after the
   * boot's own frames is float noise, and only the plant is bit exact. */
  const sig = (v) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(9)) : v);
  const sample = () => {
    const c = window.__craftState();
    const t = window.__stepTrace();
    const cam = window.__camGround();
    const osd = spy.setOsd ? spy.setOsd[0] : null;
    const st = spy.setStickOverlay ? spy.setStickOverlay[0] : null;
    const au = spy.update || null;
    return {
      mode: window.__mode,
      screen: ui.screen,
      flags: [c.landed, c.crashed, c.flownThisRun, c.turtleWait, c.turtleFlip, c.turtle, c.turtleRecover].map(Number).join(''),
      banner: spy.setBanner ? String(spy.setBanner[0]) : '',
      steps: t.n,
      post: t.n ? t.post[t.n - 1] : null,
      plane: t.n ? t.plane[t.n - 1] : null,
      stamps: t.inputs.length,
      lastStamp: t.inputs.length ? t.inputs[t.inputs.length - 1] : null,
      cam: [cam.x, cam.y, cam.z, cam.quat[0], cam.quat[1], cam.quat[2], cam.quat[3], cam.fov].map(sig),
      intro: window.__intro().ms,
      osd: osd ? [osd.lapMs, osd.altitude, osd.speedKph, osd.throttle, osd.flightMode, osd.launchState, osd.gate, osd.bounces, osd.volts, osd.runState].map(sig) : null,
      stick: st ? [st.show, st.roll, st.pitch, st.yaw, st.throttle] : null,
      audio: au ? [au[0] ? Array.from(au[0]).map(sig) : null, sig(au[1])] : null,
      score: spy.setScore ? spy.setScore[0].total : null,
    };
  };
  return JSON.stringify(window.__vt.advance(${sc.frames}, ${JSON.stringify(DTS)}, (i) => {
    const s = prog(i);
    if (s) window.__stick(s[0], s[1], s[2], s[3]);
    return sample();
  }, ${sc.startAt}));
})()`;

const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);

/* A scenario's frames turned into one stream per field. */
function streams(frames) {
  const out = {};
  for (const f of Object.keys(frames[0])) {
    const vals = frames.map((fr) => fr[f]);
    out[f] = { digest: digest(vals), kept: vals.filter((_, i) => i % KEEP_EVERY === 0) };
    Object.defineProperty(out[f], 'all', { value: vals, enumerable: false });
  }
  return out;
}

async function sample() {
  const out = {};
  for (const pg of PAGES) {
    if (only && !only.includes(pg.id)) continue;
    const page = await openPage({ root, width: 1280, height: 720, url: `/index.html?map=${pg.map}`, seed: seed(pg) });
    try {
      await page.until('window.__shellReady && window.__map && window.__map().ready', WAIT);
      await page.sleep(1500);
      await page.evaluate('window.__vt.hold()');
      await page.evaluate('window.__drawOff(true)');
      await page.evaluate(SPIES);
      /* Placed a hand above the spawn, not where the title's shot has the
       * craft: the fall and its impacts are then the same every run, and
       * the state they leave behind (the kick's sign sequence) too. */
      await page.evaluate('(() => { const m = window.__map(); window.__placeCraft(m.spawn.x, window.__heightAt(m.spawn.x, m.spawn.z) + 0.3, m.spawn.z); })()');
      for (let i = 0; i < 600 && await page.evaluate("window.__mode") !== 'flight'; i += 1) {
        await page.evaluate(`window.__vt.advance(1, ${JSON.stringify(DTS)}, () => 0)`);
        if (i % 20 === 19) await page.sleep(50);
      }
      if (await page.evaluate('window.__mode') !== 'flight') throw new Error(`${pg.id}: never entered flight`);
      await page.evaluate(`window.__vt.advance(${INTRO_TAIL}, ${JSON.stringify(DTS)}, () => 0)`);
      if (await page.evaluate('window.__intro().ms') !== -1) throw new Error(`${pg.id}: the intro shot outlived INTRO_TAIL`);
      for (const [k, sc] of pg.scenarios.entries()) {
        if (onlySc && !onlySc.includes(sc.id)) continue;
        const frames = JSON.parse(await page.evaluate(RUN({ ...sc, startAt: SCENARIO_START * (k + 1) })));
        out[`${pg.id}/${sc.id}`] = streams(frames);
      }
      out[`${pg.id}/errors`] = { errors: { digest: digest(page.errors), kept: page.errors.slice(0, 8) } };
    } finally {
      await page.close();
    }
  }
  return out;
}

if (recording) {
  const runs = [];
  for (let i = 0; i < RECORD_RUNS; i += 1) {
    console.log(`recording run ${i + 1} of ${RECORD_RUNS}`);
    runs.push(await sample());
  }
  const record = {};
  for (const sc of Object.keys(runs[0])) {
    const stable = {};
    const moving = [];
    for (const f of Object.keys(runs[0][sc])) {
      const vals = runs.map((r) => r[sc]?.[f]?.digest);
      if (vals.every((v) => v === vals[0])) {
        stable[f] = runs[0][sc][f];
      } else {
        moving.push(f);
        const a = runs[0][sc][f].all, b = runs[1][sc][f].all;
        const differ = a.map((v, i) => (JSON.stringify(v) !== JSON.stringify(b[i]) ? i : -1)).filter((i) => i >= 0);
        console.log(`  ${sc} ${f} moves in ${differ.length} of ${a.length} frames, first ${differ.slice(0, 4).join(' ')}`);
        for (const at of [differ[0], differ[Math.floor(differ.length / 2)], differ[differ.length - 1]]) {
          console.log(`      frame ${at}: ${JSON.stringify(a[at])} vs ${JSON.stringify(b[at])}`);
        }
      }
    }
    record[sc] = { stable, moving };
  }
  writeFileSync(RECORD, `${JSON.stringify(record, null, 1)}\n`);
  for (const [sc, r] of Object.entries(record)) {
    console.log(`  ${sc}: ${Object.keys(r.stable).length} stable, moving: ${r.moving.join(' ') || 'none'}`);
  }
  console.log(`loop-golden: recorded ${RECORD}`);
  process.exit(0);
}

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const now = await sample();
let failed = 0;
for (const [sc, { stable, moving }] of Object.entries(record)) {
  if (only && !only.includes(sc.split('/')[0])) continue;
  const got = now[sc] ?? {};
  const diffs = [];
  for (const [f, want] of Object.entries(stable)) {
    const have = got[f];
    if (!have) {
      diffs.push(`${f}: gone`);
    } else if (have.digest !== want.digest) {
      const at = want.kept.findIndex((v, i) => JSON.stringify(v) !== JSON.stringify(have.kept[i]));
      diffs.push(at < 0
        ? `${f}: stream changed between the kept frames`
        : `${f}: frame ${at * KEEP_EVERY} want ${JSON.stringify(want.kept[at])}, got ${JSON.stringify(have.kept[at])}`);
    }
  }
  for (const f of moving) {
    if (!got[f]) diffs.push(`${f}: gone`);
  }
  const ok = diffs.length === 0;
  failed += ok ? 0 : 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${sc}: ${Object.keys(stable).length} stable fields${ok ? '' : `, ${diffs.length} differ`}`);
  for (const d of diffs) console.log(`        ${d}`);
}
if (failed) {
  console.log(`loop-golden: ${failed} scenario(s) differ from the record`);
  process.exit(1);
}
console.log('loop-golden: ok');
